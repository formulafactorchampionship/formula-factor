// -------------------------------------------------------------
// Publishes the stored lap times for the static (GitHub Pages) site.
// -------------------------------------------------------------
// The public site cannot run the always-on relay, so the records it shows come
// from live_timing_records.json, committed to the repository. This script,
// run by .github/workflows/live-timing-records.yml every few minutes:
//
//   1. carries over what the published file already knows (the panel drops
//      sessions when the game server rotates)
//   2. folds the current live state (the panel's "Stored Times") into the store
//   3. imports any session the panel has archived since the last run
//   4. writes live_timing_records.json, the file the site actually reads
//
// live_timing_records.json is committed by the workflow, so the history lives in
// the repository itself (live_timing_db.json stays a local runtime file).
//
// Usage:
//   node server/build-live-timing-records.mjs [--offline] [--no-snapshot]
//                                      [--db <file>] [--out <file>]
//                                      [--timeout <ms>]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLiveTimingStore, fetchLiveTimingSnapshot } from '../live-timing-store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The published records and the runtime store live in the repository root.
const ROOT = path.join(__dirname, '..');

function option(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

const offline = option('offline', false) === true;
const withSnapshot = !offline && option('no-snapshot', false) !== true;
const dbFile = path.resolve(ROOT, String(option('db', 'live_timing_db.json')));
const outFile = path.resolve(ROOT, String(option('out', 'live_timing_records.json')));
const timeout = Number(option('timeout', 20000)) || 20000;

const store = createLiveTimingStore({ file: dbFile, autoWrite: false });

// Whatever the site already publishes is folded back in first: the panel drops
// sessions as soon as the game server rotates, and those times must not vanish
// from the site just because the upstream could not be reached this time.
let previousPublished = null;
try {
  if (fs.existsSync(outFile)) previousPublished = JSON.parse(fs.readFileSync(outFile, 'utf8'));
} catch (e) {
  previousPublished = null;
}
const carriedOver = store.seedFromPublished(previousPublished);
if (carriedOver) console.log('Carried over ' + carriedOver + ' stored value(s) from the published file');

if (withSnapshot) {
  try {
    const snapshot = await fetchLiveTimingSnapshot({ timeoutMs: timeout });
    store.recordSnapshot(snapshot);
    const session = snapshot.SessionInfo || {};
    console.log('Live state captured: ' + (session.Track || '?') + ' / ' + (session.TrackConfig || '?'));
  } catch (e) {
    // Perfectly normal when the server is idle: the archived results below
    // still keep the published records up to date.
    console.warn('Live state not available (' + ((e && e.message) || e) + ')');
  }
}

if (!offline) {
  const result = await store.importArchivedResults();
  if (result.sessions) {
    console.log('Archived sessions imported: ' + result.sessions + ' (' + result.laps + ' laps)');
  } else if (result.error) {
    console.warn('Archived sessions could not be read: ' + result.error);
  } else {
    console.log('Archived sessions: nothing new');
  }
}

await store.flush();

// Only touch the files when the data really changed: the store keeps an
// updatedAt stamp, and committing a file every 15 minutes just for that would
// fill the history with noise.
function stripVolatile(text) {
  return text.replace(/"updatedAt":\s*"[^"]*"/g, '"updatedAt": ""');
}

function writeIfChanged(file, content) {
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (previous && stripVolatile(previous) === stripVolatile(content)) return false;
  fs.writeFileSync(file, content, 'utf8');
  return true;
}

const storeChanged = writeIfChanged(dbFile, JSON.stringify(store.getStore(), null, 2) + '\n');
const records = store.buildStaticRecords();
const recordsChanged = writeIfChanged(outFile, JSON.stringify(records, null, 2) + '\n');

console.log((storeChanged ? 'Updated ' : 'Unchanged ') + path.basename(dbFile) +
  ' / ' + (recordsChanged ? 'updated ' : 'unchanged ') + path.basename(outFile));

const tracked = Object.keys(records.tracks);
console.log('Published ' + tracked.length + ' circuit(s) to ' + path.basename(outFile) + ' (default: ' + (records.default || 'none') + ')');
console.log('');

function lap(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes + ':' + String(seconds % 60).padStart(2, '0') + '.' + String(ms % 1000).padStart(3, '0');
}

tracked.forEach((key) => {
  const entry = records.tracks[key];
  const best = entry.bestLap ? lap(entry.bestLap.ms) + ' ' + entry.bestLap.driver : '-';
  const speed = entry.topSpeed ? Math.round(entry.topSpeed.kmh) + ' km/h ' + entry.topSpeed.driver : '-';
  const laps = entry.laps ? entry.laps.count + ' ' + entry.laps.driver : '-';
  console.log('  ' + key);
  console.log('    mejor vuelta: ' + best);
  console.log('    v. maxima   : ' + speed);
  console.log('    mas vueltas : ' + laps);
});
