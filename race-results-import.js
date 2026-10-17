// -------------------------------------------------------------
// Race results importer: turns an archived Assetto session into a draft
// classification the admin panel can review before publishing.
// -------------------------------------------------------------
// The panel that fronts the game server archives every session and exposes a
// downloadable JSON (see LIVE_TIMING_RESULTS_BASE). For a RACE session that JSON
// already carries the final classification ("Result"), the entrants ("Cars") and
// every lap ("Laps"), so the admin no longer has to retype the finishing order.
//
// This module only *reads and normalises*. It never writes to the site: the
// admin reviews the draft in the panel, which saves it through the existing
// race-results flow. That keeps the manual editor as the single source of truth
// and the importer as a convenience.
//
// IMPORTANT: the classification ("Result") is the grid. The "Cars" array lists
// every car configured on the server — empty slots, the safety car and the TV
// car included — so it is only used to enrich names/teams, never to build the
// order.

import {
  LIVE_TIMING_RESULTS_BASE,
  cleanText,
  ltToPositiveNumber,
  ltSessionIdentity
} from './live-timing-store.js';

export { LIVE_TIMING_RESULTS_BASE };

const USER_AGENT = 'FormulaFactorChampionship/1.0';

async function httpGet(url) {
  const response = await fetch(url, {
    headers: { Accept: '*/*', 'User-Agent': USER_AGENT }
  });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + url);
  return response;
}

// The panel lists its archive as a table of rows like
// data-href="/results/2026_10_12_18_29_RACE" whose cells are Date / Session Type
// / Track Name / Entrants. The track name comes from that table, so the circuit
// of every session is known without downloading each (large) session file.
const SESSION_ROW_RE = /data-href="\/results\/([A-Za-z0-9_\-]+)"([\s\S]*?)<\/tr>/g;

function stripTags(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// "2026_10_12_18_29_RACE" -> "RACE"; "...-time-attack" -> "TIME_ATTACK".
export function sessionTypeFromName(name) {
  const value = String(name || '').toUpperCase();
  if (/-TIME-ATTACK$/.test(value)) return 'TIME_ATTACK';
  if (/_RACE$/.test(value)) return 'RACE';
  if (/_QUALIFY/.test(value)) return 'QUALIFY';
  if (/_PRACTICE$/.test(value)) return 'PRACTICE';
  return 'UNKNOWN';
}

// The leading date of the file name, zero padded, so it sorts lexicographically.
export function sessionStamp(name) {
  const match = String(name || '').match(/^(\d{4})_(\d{1,2})_(\d{1,2})_(\d{1,2})_(\d{1,2})/);
  if (!match) return '';
  const pad = (value) => String(value).padStart(2, '0');
  return `${match[1]}_${pad(match[2])}_${pad(match[3])}_${pad(match[4])}_${pad(match[5])}`;
}

// Every archived session, newest first, collapsing the time-attack duplicates.
export async function listArchivedSessions() {
  const listing = await (await httpGet(LIVE_TIMING_RESULTS_BASE + '/results')).text();
  const sessions = [];
  const seen = new Set();
  let match;
  SESSION_ROW_RE.lastIndex = 0;
  while ((match = SESSION_ROW_RE.exec(listing)) !== null) {
    const name = match[1];
    const identity = ltSessionIdentity(name);
    if (seen.has(identity)) continue; // "<date>_<type>-time-attack" is the same session
    seen.add(identity);

    const cells = [...match[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => stripTags(cell[1]));
    const entrantsText = cells[3] || '';
    const entrants = entrantsText ? entrantsText.split(/\s*,\s*/).filter(Boolean).length : 0;

    sessions.push({
      name,
      identity,
      type: sessionTypeFromName(name),
      stamp: sessionStamp(name),
      track: cleanText(cells[2] || '', 80),
      entrants
    });
  }
  sessions.sort((a, b) => String(b.stamp).localeCompare(String(a.stamp)));
  return sessions;
}

// The most recent session of a given type (used when the admin does not pick one).
export async function findLatestSessionByType(type) {
  const wanted = String(type || 'RACE').toUpperCase();
  const sessions = await listArchivedSessions();
  return sessions.find((session) => session.type === wanted) || null;
}

function makeEntry(pos, { driver, guid, car, team, bestLapMs, totalTimeMs, hasPenalty, penaltyMs, lapPenalty, disqualified }) {
  return {
    pos,
    driver,
    guid: guid || '',
    car: car || '',
    team: team || '',
    bestLapMs: bestLapMs || 0,
    totalTimeMs: totalTimeMs || 0,
    hasPenalty: !!hasPenalty,
    penaltyMs: penaltyMs || 0,
    lapPenalty: lapPenalty || 0,
    disqualified: !!disqualified,
    status: disqualified ? 'DSQ' : 'FINISHED'
  };
}

// Builds the draft classification from a downloaded session JSON.
export function buildRaceDraft(session) {
  const source = session && typeof session === 'object' ? session : {};
  const cars = Array.isArray(source.Cars) ? source.Cars : [];
  const results = Array.isArray(source.Result) ? source.Result : [];
  const laps = Array.isArray(source.Laps) ? source.Laps : [];

  // Per-driver aggregates from the laps: best valid lap (a lap with cuts is not a
  // lap time) and the laps actually completed. Fills a classification that omits
  // BestLap, and rebuilds an order when the file has no "Result" at all.
  const bestLapByGuid = new Map();
  const lapsByGuid = new Map();
  laps.forEach((lap) => {
    const guid = String(lap.DriverGuid || '');
    if (!guid) return;
    let agg = lapsByGuid.get(guid);
    if (!agg) {
      agg = { laps: 0, name: '', car: '' };
      lapsByGuid.set(guid, agg);
    }
    agg.laps += 1;
    if (!agg.name) agg.name = cleanText(String(lap.DriverName || ''), 60);
    if (!agg.car) agg.car = cleanText(String(lap.CarModel || ''), 80);

    const ms = Math.round(ltToPositiveNumber(lap.LapTime));
    if (!ms || Number(lap.Cuts) > 0) return;
    const current = bestLapByGuid.get(guid);
    if (!current || ms < current) bestLapByGuid.set(guid, ms);
  });

  // Car/team/nation details, keyed by driver guid (names read a bit cleaner here
  // than in the lap rows).
  const carByGuid = new Map();
  cars.forEach((car) => {
    const driver = car.Driver || {};
    const guid = String(driver.Guid || '');
    const name = cleanText(String(driver.Name || ''), 60);
    if (!guid || !name) return;
    carByGuid.set(guid, {
      name,
      team: cleanText(String(driver.Team || ''), 60),
      nation: cleanText(String(driver.Nation || ''), 8),
      model: cleanText(String(car.Model || ''), 80)
    });
  });

  const entries = [];
  const approximate = results.length === 0;

  // 1. The session's own classification, in the order the game stored it.
  if (!approximate) {
    results.forEach((row) => {
      const guid = String(row.DriverGuid || '');
      const car = carByGuid.get(guid) || {};
      const driver = cleanText(String(row.DriverName || car.name || ''), 60);
      if (!driver) return;
      const disqualified = !!row.Disqualified;
      entries.push(makeEntry(entries.length + 1, {
        driver,
        guid,
        car: cleanText(String(row.CarModel || car.model || ''), 80),
        team: car.team || '',
        bestLapMs: Math.round(ltToPositiveNumber(row.BestLap)) || bestLapByGuid.get(guid) || 0,
        totalTimeMs: Math.round(ltToPositiveNumber(row.TotalTime)),
        hasPenalty: !!row.HasPenalty || ltToPositiveNumber(row.PenaltyTime) > 0,
        penaltyMs: Math.round(ltToPositiveNumber(row.PenaltyTime)),
        lapPenalty: Math.round(ltToPositiveNumber(row.LapPenalty)),
        disqualified
      }));
    });
  }

  // 2. No classification in the file (older exports): rebuild a rough order from
  // the laps actually completed, most laps first. Only drivers who set a lap are
  // listed, so empty server slots never reach the table.
  if (approximate) {
    const rebuilt = [...lapsByGuid.entries()]
      .map(([guid, agg]) => ({
        guid,
        driver: agg.name,
        car: agg.car || (carByGuid.get(guid) || {}).model || '',
        team: (carByGuid.get(guid) || {}).team || '',
        laps: agg.laps,
        bestLapMs: bestLapByGuid.get(guid) || 0
      }))
      .filter((row) => row.driver);
    rebuilt.sort((a, b) => (b.laps - a.laps) || ((a.bestLapMs || Infinity) - (b.bestLapMs || Infinity)));
    rebuilt.forEach((row) => {
      entries.push(makeEntry(entries.length + 1, {
        driver: row.driver,
        guid: row.guid,
        car: row.car,
        team: row.team,
        bestLapMs: row.bestLapMs
      }));
    });
  }

  // Fastest lap: the quickest classified best lap (ties favour the better placed
  // driver, which is how the entries are already ordered).
  let fastestLap = null;
  entries.forEach((entry) => {
    if (!entry.bestLapMs || entry.disqualified) return;
    if (!fastestLap || entry.bestLapMs < fastestLap.ms) {
      fastestLap = { driver: entry.driver, guid: entry.guid, ms: entry.bestLapMs };
    }
  });

  return {
    track: cleanText(String(source.TrackName || ''), 80),
    config: cleanText(String(source.TrackConfig || ''), 80),
    type: cleanText(String(source.Type || ''), 20).toUpperCase(),
    date: cleanText(String(source.Date || ''), 40),
    sessionFile: cleanText(String(source.SessionFile || ''), 80),
    entrants: cars.length,
    classified: results.length,
    approximate,
    fastestLap,
    entries
  };
}

// Downloads one archived session and returns its draft classification.
export async function fetchSessionDraft(name) {
  const safeName = String(name || '').trim();
  if (!/^[A-Za-z0-9_\-]+$/.test(safeName)) throw new Error('Invalid session name');
  const session = await (await httpGet(
    LIVE_TIMING_RESULTS_BASE + '/results/download/' + encodeURIComponent(safeName) + '.json'
  )).json();
  return buildRaceDraft(session);
}

// A qualifying session belongs to the same event as a race when they share the
// track and the qualifying is the closest one around the race date (the session
// name carries no track, so each candidate has to be read to compare).
async function findPoleForRace(raceDraft, sessions) {
  const raceTrack = String(raceDraft.track || '');
  if (!raceTrack) return null;
  const raceTime = Date.parse(raceDraft.date);

  let best = null;
  for (const session of sessions) {
    if (session.type !== 'QUALIFY') continue;
    let draft;
    try {
      draft = await fetchSessionDraft(session.name);
    } catch (e) {
      continue;
    }
    if (String(draft.track || '') !== raceTrack) continue;

    const qualiTime = Date.parse(draft.date);
    const hasTimes = Number.isFinite(qualiTime) && Number.isFinite(raceTime);
    const before = hasTimes ? qualiTime <= raceTime : false;
    const diff = hasTimes ? Math.abs(qualiTime - raceTime) : Infinity;

    // Prefer a qualifying run before the race; within the same side, the closest.
    if (!best
      || (before && !best.before)
      || (before === best.before && diff < best.diff)) {
      best = { name: session.name, draft, before, diff };
    }
  }
  return best;
}

// Everything the panel imports in one go: the race classification plus the pole
// from the matching qualifying session, when one can be found. The pole is a
// bonus: if no qualifying matches, the race still imports cleanly.
export async function fetchRaceImport(name) {
  const sessions = await listArchivedSessions();

  let raceName = String(name || '').trim();
  if (!raceName) {
    const latest = sessions.find((session) => session.type === 'RACE');
    if (!latest) return null;
    raceName = latest.name;
  }
  if (!/^[A-Za-z0-9_\-]+$/.test(raceName)) throw new Error('Invalid session name');

  const draft = await fetchSessionDraft(raceName);

  let poleLap = null;
  let poleSession = null;
  let qualifying = [];
  try {
    const pole = await findPoleForRace(draft, sessions);
    if (pole && pole.draft) {
      if (pole.draft.fastestLap && pole.draft.fastestLap.ms) {
        poleLap = pole.draft.fastestLap;
        poleSession = pole.name;
      }
      // The whole qualifying classification, in its own order (the grid).
      qualifying = (pole.draft.entries || []).map((entry) => ({
        pos: entry.pos,
        driver: entry.driver,
        guid: entry.guid,
        bestLapMs: entry.bestLapMs,
        status: entry.status
      }));
    }
  } catch (e) { /* pole/qualifying are optional: never block the race import */ }

  return {
    sessionFile: raceName,
    sessionType: sessionTypeFromName(raceName),
    draft,
    poleLap,
    poleSession,
    qualifying
  };
}
