// -------------------------------------------------------------
// Live timing store: persisted lap times + archived results importer.
// -------------------------------------------------------------
// Shared by two very different processes:
//   - server/server.js ..... keeps a socket open 24/7 and folds every full
//                            snapshot into the store, serving the endpoints
//                            the site uses when it is served by Node.
//   - build-live-timing-records.mjs ... runs from the scheduled GitHub Action
//                            and publishes live_timing_records.json, which is
//                            what the public (static) site reads.
// Keeping one implementation means both always agree on the rules: a better
// lap never gets overwritten by a worse one, laps with cuts are not valid lap
// times, and a session is imported only once.

import fs from 'fs';
import tls from 'tls';
import crypto from 'crypto';
import { LIVE_TIMING_UPSTREAM } from './live-timing-upstream.js';

// The websocket client (and the upstream address it talks to) lives in
// live-timing-upstream.js, shared with the Cloud Run relay.
export { LIVE_TIMING_UPSTREAM };

// The panel that fronts the game server publishes both the live snapshot and
// the archived sessions (and the raw content: maps, car UI files...).
export const LIVE_TIMING_RESULTS_BASE = 'https://fr.assettohosting.com:60290';

const IMPORT_MAX_SESSIONS = 60;

// Same cleaning the rest of the server applies to third-party strings.
export function cleanText(value, maxLength = 250) {
  if (!value) return '';
  const cleaned = String(value)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/javascript:/gi, '')
    .replace(/onerror\s*=/gi, '')
    .replace(/onload\s*=/gi, '')
    .replace(/onclick\s*=/gi, '')
    .trim();
  return cleaned.slice(0, maxLength);
}

export function ltToPositiveNumber(value) {
  const n = Number(value);
  return isFinite(n) && n > 0 ? n : 0;
}

export function ltTrackKey(track, config) {
  return String(track || '') + '|' + String(config || '');
}

// "<date>_<type>-time-attack" is the very same session archived a second time.
export function ltSessionIdentity(file) {
  return String(file || '').replace(/-time-attack$/i, '');
}

async function httpGet(url) {
  const response = await fetch(url, {
    headers: { Accept: '*/*', 'User-Agent': 'FormulaFactorChampionship/1.0' },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
  const len = Number(response.headers.get('content-length') || 0);
  if (len > 10 * 1024 * 1024) throw new Error('Response too large for ' + url);
  return response;
}

// -------------------------------------------------------------
// One-off full-state fetch over the race-control websocket.
// -------------------------------------------------------------
// A browser handshake is rejected because of its Origin header; a plain
// server-side handshake (no Origin at all) is accepted.
export function fetchLiveTimingSnapshot(options = {}) {
  const host = options.host || LIVE_TIMING_UPSTREAM.host;
  const port = options.port || LIVE_TIMING_UPSTREAM.port;
  const path = options.path || LIVE_TIMING_UPSTREAM.path;
  const timeoutMs = options.timeoutMs || 15000;

  return new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    let buffer = Buffer.alloc(0);
    let handshakeDone = false;
    let settled = false;
    let socket = null;

    const finish = (error, snapshot) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { if (socket) socket.destroy(); } catch (e) { /* ignore */ }
      if (error) reject(error);
      else resolve(snapshot);
    };

    const timer = setTimeout(() => finish(new Error('timeout waiting for the full state')), timeoutMs);

    socket = tls.connect({ host, port, servername: host }, () => {
      try {
        socket.write(
          'GET ' + path + ' HTTP/1.1\r\n' +
          'Host: ' + host + ':' + port + '\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          'Sec-WebSocket-Key: ' + key + '\r\n' +
          'Sec-WebSocket-Version: 13\r\n\r\n'
        );
      } catch (e) { finish(e); }
    });

    socket.on('error', (e) => finish(e));

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      if (!handshakeDone) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end === -1) return;
        const head = buffer.subarray(0, end).toString('latin1');
        buffer = buffer.subarray(end + 4);
        if (!/^HTTP\/1\.1 101/.test(head)) {
          return finish(new Error('handshake rejected: ' + head.split('\r\n')[0]));
        }
        handshakeDone = true;
      }

      while (buffer.length >= 2) {
        const first = buffer[0];
        const second = buffer[1];
        const fin = (first & 0x80) !== 0;
        const opcode = first & 0x0f;
        let length = second & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (buffer.length < 10) return;
          length = Number(buffer.readBigUInt64BE(2));
          offset = 10;
        }
        const masked = (second & 0x80) !== 0;
        let mask = null;
        if (masked) {
          if (buffer.length < offset + 4) return;
          mask = buffer.subarray(offset, offset + 4);
          offset += 4;
        }
        if (buffer.length < offset + length) return;

        const payload = Buffer.from(buffer.subarray(offset, offset + length));
        if (masked && mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
        buffer = buffer.subarray(offset + length);

        if (opcode === 0x9 || opcode === 0x0) continue; // ping / continuation
        if (opcode !== 0x1 || !fin) continue;

        let message;
        try { message = JSON.parse(payload.toString('utf8')); } catch (e) { continue; }
        if (message && message.EventType === 200) return finish(null, message.Message);
      }
    });
  });
}

// -------------------------------------------------------------
// The store itself.
// -------------------------------------------------------------
export function createLiveTimingStore(options = {}) {
  const file = options.file;
  const sanitize = options.sanitize || ((value, maxLength) => cleanText(value, maxLength));
  const log = options.log || console;
  const saveDelayMs = options.saveDelayMs === undefined ? 400 : options.saveDelayMs;
  // The scheduled Action writes both files itself (it only commits when the
  // data really changed), so it turns the automatic writes off.
  const autoWrite = options.autoWrite !== false;

  let memory = null;
  let writeTimer = null;
  let pendingWrite = null;
  const carNames = new Map();
  const importStatus = { running: false, at: null, sessions: 0, laps: 0, error: null };

  function emptyStore() {
    return { version: 1, updatedAt: null, tracks: {}, importedSessions: {} };
  }

  function getStore() {
    if (memory !== null) return memory;
    try {
      if (file && fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (parsed && typeof parsed === 'object' && parsed.tracks && typeof parsed.tracks === 'object') {
          memory = parsed;
          if (!memory.version) memory.version = 1;
          if (!memory.importedSessions || typeof memory.importedSessions !== 'object') memory.importedSessions = {};
          return memory;
        }
      }
    } catch (e) {
      log.error('Live timing: cannot read ' + file + ' -', e.message);
    }
    memory = emptyStore();
    return memory;
  }

  function writeNow() {
    if (!file) return Promise.resolve();
    const store = getStore();
    return new Promise((resolve) => {
      fs.writeFile(file, JSON.stringify(store, null, 2), 'utf8', (err) => {
        if (err) log.error('Live timing: cannot write ' + file + ' -', err.message);
        resolve();
      });
    });
  }

  // Debounced, so a burst of snapshots only touches the disk once.
  function save() {
    const store = getStore();
    store.updatedAt = new Date().toISOString();
    if (!file || !autoWrite) return Promise.resolve();
    if (writeTimer) clearTimeout(writeTimer);
    pendingWrite = new Promise((resolve) => {
      writeTimer = setTimeout(() => {
        writeTimer = null;
        writeNow().then(resolve);
      }, saveDelayMs);
    });
    return pendingWrite;
  }

  async function flush() {
    if (!autoWrite) return;
    if (writeTimer) {
      clearTimeout(writeTimer);
      writeTimer = null;
      await writeNow();
    } else if (pendingWrite) {
      await pendingWrite;
    }
  }

  // Folds one EventType 200 snapshot into the persistent store.
  function recordSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    const session = snapshot.SessionInfo || {};
    const track = sanitize(String(session.Track || ''), 80);
    if (!track) return;

    const store = getStore();
    const config = sanitize(String(session.TrackConfig || ''), 80);
    const key = ltTrackKey(track, config);
    if (!store.tracks[key]) store.tracks[key] = { track, config, name: '', drivers: {} };
    const entry = store.tracks[key];
    if (!entry.drivers || typeof entry.drivers !== 'object') entry.drivers = {};

    const trackInfo = snapshot.TrackInfo || {};
    if (trackInfo.name) entry.name = sanitize(String(trackInfo.name), 80);

    const sessionId = sanitize(String(snapshot.SessionStartTime || ''), 40);
    const now = new Date().toISOString();

    // The stamp only moves when a different session starts: refreshing it on
    // every snapshot would make the stored file change while nothing happens,
    // and the scheduled job would commit empty updates every few minutes.
    const sessionName = sanitize(String(session.Name || ''), 60);
    const sessionType = Number(session.Type) || 0;
    const previousSession = entry.lastSession || null;
    if (!previousSession
      || previousSession.sessionId !== sessionId
      || previousSession.name !== sessionName
      || previousSession.type !== sessionType) {
      entry.lastSession = { name: sessionName, type: sessionType, at: now, sessionId: sessionId };
    }

    // DisconnectedDrivers carries the times of the drivers who already left this
    // session (the panel lists them under "Stored Times"), so both bags are read:
    // ignoring the second one loses the best laps as soon as somebody disconnects.
    const drivers = {};
    [snapshot.ConnectedDrivers, snapshot.DisconnectedDrivers].forEach((bag) => {
      const bagDrivers = (bag && bag.Drivers) || {};
      Object.keys(bagDrivers).forEach((guid) => { drivers[guid] = bagDrivers[guid]; });
    });

    Object.keys(drivers).forEach((guid) => {
      const driver = drivers[guid] || {};
      const carInfo = driver.CarInfo || {};
      const cars = driver.Cars || {};
      const car = cars[carInfo.CarModel] || cars[Object.keys(cars)[0]];
      if (!car) return;

      const name = sanitize(String(carInfo.DriverName || ''), 60);
      if (!name || !guid) return;

      const carName = sanitize(String(car.CarName || carInfo.CarName || carInfo.CarModel || ''), 60);

      let record = entry.drivers[guid];
      if (!record) {
        record = entry.drivers[guid] = {
          guid: guid,
          name: name,
          car: carName,
          bestLapMs: 0,
          lastLapMs: 0,
          topSpeedKmh: 0,
          laps: 0,
          sessions: 0,
          sessionId: '',
          firstSeen: now,
          lastSeen: now
        };
      }

      if (record.name !== name) record.name = name;
      if (carName && record.car !== carName) record.car = carName;

      // lastSeen only moves when something really changed, so an idle server does
      // not rewrite the store (and the scheduled job does not commit noise).
      let changed = false;

      const bestLapMs = Math.round(ltToPositiveNumber(car.BestLap) / 1e6);
      if (bestLapMs && (!record.bestLapMs || bestLapMs < record.bestLapMs)) {
        record.bestLapMs = bestLapMs;
        changed = true;
      }

      const lastLapMs = Math.round(ltToPositiveNumber(car.LastLap) / 1e6);
      if (lastLapMs && lastLapMs !== record.lastLapMs) {
        record.lastLapMs = lastLapMs;
        changed = true;
      }

      const topSpeed = ltToPositiveNumber(car.TopSpeedBestLap);
      if (topSpeed > record.topSpeedKmh) {
        record.topSpeedKmh = Math.round(topSpeed * 10) / 10;
        changed = true;
      }

      const laps = Math.round(ltToPositiveNumber(car.NumLaps));
      if (laps > record.laps) {
        record.laps = laps;
        changed = true;
      }

      if (sessionId && record.sessionId !== sessionId) {
        record.sessionId = sessionId;
        record.sessions = (record.sessions || 0) + 1;
        changed = true;
      }

      if (changed) record.lastSeen = now;
    });

    save();
  }

  // CarModel is a folder name ("rss_formula_2010"); the display name lives in
  // its UI file, the same one the panel shows.
  async function carDisplayName(model) {
    const key = String(model || '');
    if (!key) return '';
    if (carNames.has(key)) return carNames.get(key);

    let name = key;
    try {
      const data = await (await httpGet(
        LIVE_TIMING_RESULTS_BASE + '/content/cars/' + encodeURIComponent(key) + '/ui/ui_car.json'
      )).json();
      if (data && data.name) name = sanitize(String(data.name), 60);
    } catch (e) { /* keep the raw model name */ }

    carNames.set(key, name);
    return name;
  }

  // Folds the sessions the panel had already archived into the same store.
  async function importArchivedResults() {
    if (importStatus.running) return importStatus;
    importStatus.running = true;
    importStatus.at = new Date().toISOString();
    importStatus.sessions = 0;
    importStatus.laps = 0;
    importStatus.error = null;

    try {
      const listing = await (await httpGet(LIVE_TIMING_RESULTS_BASE + '/results')).text();
      const store = getStore();
      if (!store.importedSessions || typeof store.importedSessions !== 'object') store.importedSessions = {};

      const byIdentity = new Map();
      const linkRe = /href="\/results\/([A-Za-z0-9_\-]+)"/g;
      let match;
      while ((match = linkRe.exec(listing)) !== null) {
        const name = match[1];
        const identity = ltSessionIdentity(name);
        const current = byIdentity.get(identity);
        if (!current || name.length < current.length) byIdentity.set(identity, name);
      }

      const pending = [...byIdentity.entries()]
        .filter(([identity]) => !store.importedSessions[identity])
        .slice(0, IMPORT_MAX_SESSIONS);

      for (const [identity, name] of pending) {
        try {
          const session = await (await httpGet(
            LIVE_TIMING_RESULTS_BASE + '/results/download/' + name + '.json'
          )).json();

          const track = sanitize(String(session.TrackName || ''), 80);
          const laps = Array.isArray(session.Laps) ? session.Laps : [];
          if (!track) {
            store.importedSessions[identity] = new Date().toISOString();
            continue;
          }

          const config = sanitize(String(session.TrackConfig || ''), 80);
          const key = ltTrackKey(track, config);
          if (!store.tracks[key]) store.tracks[key] = { track, config, name: '', drivers: {} };
          const entry = store.tracks[key];
          if (!entry.drivers || typeof entry.drivers !== 'object') entry.drivers = {};

          const when = Number.isFinite(Date.parse(session.Date))
            ? new Date(session.Date).toISOString()
            : new Date().toISOString();

          // Fold the laps per driver first, then upsert each one exactly once.
          const byDriver = new Map();
          laps.forEach((lap) => {
            const guid = String(lap.DriverGuid || '');
            const lapMs = Math.round(ltToPositiveNumber(lap.LapTime));
            if (!guid || !lapMs) return;

            let folded = byDriver.get(guid);
            if (!folded) {
              folded = {
                guid: guid,
                name: sanitize(String(lap.DriverName || ''), 60),
                car: String(lap.CarModel || ''),
                laps: 0,
                bestLapMs: 0,
                lastLapMs: 0,
                lastTimestamp: -1
              };
              byDriver.set(guid, folded);
            }

            folded.laps += 1;
            // A lap with cuts is not a valid lap time, exactly like the panel's
            // "Stored Times" table treats it; it still counts towards the tally.
            if (!(Number(lap.Cuts) > 0) && (!folded.bestLapMs || lapMs < folded.bestLapMs)) {
              folded.bestLapMs = lapMs;
            }

            const timestamp = Number(lap.Timestamp);
            if (Number.isFinite(timestamp) && timestamp > folded.lastTimestamp) {
              folded.lastTimestamp = timestamp;
              folded.lastLapMs = lapMs;
            }
            importStatus.laps += 1;
          });

          for (const folded of byDriver.values()) {
            if (!folded.name) continue;
            const car = await carDisplayName(folded.car);

            let record = entry.drivers[folded.guid];
            if (!record) {
              record = entry.drivers[folded.guid] = {
                guid: folded.guid,
                name: folded.name,
                car: car,
                bestLapMs: 0,
                lastLapMs: 0,
                topSpeedKmh: 0,
                laps: 0,
                sessions: 0,
                sessionId: '',
                firstSeen: when,
                lastSeen: when,
                imported: true
              };
            }

            record.name = folded.name;
            if (car) record.car = car;
            if (folded.bestLapMs && (!record.bestLapMs || folded.bestLapMs < record.bestLapMs)) {
              record.bestLapMs = folded.bestLapMs;
            }
            if (folded.lastLapMs) record.lastLapMs = folded.lastLapMs;
            if (folded.laps > record.laps) record.laps = folded.laps;
            record.sessions = (record.sessions || 0) + 1;
            if (!record.firstSeen || when < record.firstSeen) record.firstSeen = when;
            if (!record.lastSeen || when > record.lastSeen) record.lastSeen = when;
          }

          store.importedSessions[identity] = when;
          importStatus.sessions += 1;
          save();
        } catch (e) {
          importStatus.error = String((e && e.message) || e).slice(0, 200);
        }
      }

      save();
    } catch (e) {
      importStatus.error = String((e && e.message) || e).slice(0, 200);
    }

    importStatus.running = false;
    return importStatus;
  }

  // Best lap / top speed / most laps across the given track entries.
  function aggregate(entries) {
    const bestLap = { ms: 0 };
    const topSpeed = { kmh: 0 };
    const laps = { count: 0 };
    const guids = new Set();
    let lastSeen = null;
    let name = null;

    entries.forEach((entry) => {
      if (!entry || !entry.drivers) return;
      if (entry.name) name = entry.name;
      Object.keys(entry.drivers).forEach((guid) => {
        const record = entry.drivers[guid];
        if (!record) return;
        guids.add(guid);
        if (record.lastSeen && (!lastSeen || record.lastSeen > lastSeen)) lastSeen = record.lastSeen;

        if (record.bestLapMs > 0 && (!bestLap.ms || record.bestLapMs < bestLap.ms)) {
          bestLap.ms = record.bestLapMs;
          bestLap.driver = record.name;
          bestLap.car = record.car;
          bestLap.guid = guid;
          bestLap.at = record.lastSeen;
        }
        if (record.topSpeedKmh > 0 && record.topSpeedKmh > topSpeed.kmh) {
          topSpeed.kmh = record.topSpeedKmh;
          topSpeed.driver = record.name;
          topSpeed.car = record.car;
          topSpeed.guid = guid;
          topSpeed.at = record.lastSeen;
        }
        if (record.laps > 0 && record.laps > laps.count) {
          laps.count = record.laps;
          laps.driver = record.name;
          laps.car = record.car;
          laps.guid = guid;
          laps.at = record.lastSeen;
        }
      });
    });

    return {
      track: entries.length === 1 ? entries[0].track : null,
      config: entries.length === 1 ? entries[0].config : null,
      name: name,
      drivers: guids.size,
      bestLap: bestLap.ms ? bestLap : null,
      topSpeed: topSpeed.kmh ? topSpeed : null,
      laps: laps.count ? laps : null,
      lastSeen: lastSeen
    };
  }

  // Rebuilds the records a previously published file already knew. The public
  // site is published from a file that keeps the full history, so a best lap the
  // game panel has already forgotten (sessions vanish when the server rotates)
  // can never disappear from the site.
  function seedFromPublished(published) {
    if (!published || typeof published !== 'object' || !published.tracks) return 0;
    const store = getStore();
    let seeded = 0;

    Object.keys(published.tracks).forEach((key) => {
      const source = published.tracks[key] || {};
      const track = sanitize(String(source.track || ''), 80);
      if (!track) return;

      const config = sanitize(String(source.config || ''), 80);
      const entryKey = ltTrackKey(track, config);
      if (!store.tracks[entryKey]) store.tracks[entryKey] = { track, config, name: '', drivers: {} };
      const entry = store.tracks[entryKey];
      if (!entry.drivers || typeof entry.drivers !== 'object') entry.drivers = {};
      if (!entry.name && source.name) entry.name = sanitize(String(source.name), 80);

      const fields = [
        { item: source.bestLap, field: 'bestLapMs', value: (item) => Math.round(ltToPositiveNumber(item.ms)) },
        { item: source.topSpeed, field: 'topSpeedKmh', value: (item) => Math.round(ltToPositiveNumber(item.kmh) * 10) / 10 },
        { item: source.laps, field: 'laps', value: (item) => Math.round(ltToPositiveNumber(item.count)) }
      ];

      fields.forEach((spec) => {
        const item = spec.item;
        if (!item) return;
        const guid = String(item.guid || '');
        const name = sanitize(String(item.driver || ''), 60);
        const value = spec.value(item);
        if (!guid || !name || !(value > 0)) return;

        let record = entry.drivers[guid];
        if (!record) {
          record = entry.drivers[guid] = {
            guid: guid,
            name: name,
            car: sanitize(String(item.car || ''), 60),
            bestLapMs: 0,
            lastLapMs: 0,
            topSpeedKmh: 0,
            laps: 0,
            sessions: 0,
            sessionId: '',
            firstSeen: item.at || null,
            lastSeen: item.at || null,
            published: true
          };
        }

        const better = spec.field === 'bestLapMs'
          ? (!record[spec.field] || value < record[spec.field])
          : (value > record[spec.field]);
        if (better) {
          record[spec.field] = value;
          seeded += 1;
        }
      });
    });

    return seeded;
  }

  // Records for one circuit (or for every circuit when no track is given).
  function recordsFor(track, config) {
    const store = getStore();
    if (!track) return aggregate(Object.values(store.tracks));
    const entry = store.tracks[ltTrackKey(track, config)];
    return aggregate(entry ? [entry] : []);
  }

  // The circuit the panel was last running, used as the page's fallback.
  function latestTrackKey() {
    const store = getStore();
    let bestKey = null;
    let bestAt = '';
    Object.keys(store.tracks).forEach((key) => {
      const entry = store.tracks[key] || {};
      let at = (entry.lastSession && entry.lastSession.at) || '';
      Object.keys(entry.drivers || {}).forEach((guid) => {
        const seen = entry.drivers[guid] && entry.drivers[guid].lastSeen;
        if (seen && seen > at) at = seen;
      });
      if (at && at > bestAt) {
        bestAt = at;
        bestKey = key;
      }
    });
    return bestKey || Object.keys(store.tracks)[0] || null;
  }

  // Everything the static (GitHub Pages) site needs, in one file.
  function buildStaticRecords() {
    const store = getStore();
    const tracks = {};
    Object.keys(store.tracks).forEach((key) => {
      tracks[key] = Object.assign({ key: key }, aggregate([store.tracks[key]]));
    });
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      default: latestTrackKey(),
      tracks: tracks
    };
  }

  return {
    file,
    getStore,
    save,
    flush,
    recordSnapshot,
    importArchivedResults,
    importStatus,
    aggregate,
    recordsFor,
    seedFromPublished,
    latestTrackKey,
    buildStaticRecords
  };
}
