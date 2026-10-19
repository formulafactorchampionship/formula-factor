// -------------------------------------------------------------
// Publishes the race-results import bundle for the static site.
// -------------------------------------------------------------
// The game panel rejects cross-origin requests, and the public site (GitHub
// Pages) has no Node server on the same origin, so the admin panel cannot pull
// the archived sessions from the browser. This script, run by
// .github/workflows/live-timing-records.yml, precomputes what the
// "Importar del Servidor" button needs and writes race_import.json, which the
// static site serves like any other file:
//
//   sessions : the archived sessions list (the picker)
//   drafts   : ready-to-fill drafts (race classification + pole + qualifying
//              grid) for the latest race and qualifying, plus anything bundled
//              before and still archived
//
// It never fails the workflow: on an upstream error it keeps the previous file.
//
// Usage:
//   node server/build-race-import.mjs [--out <file>] [--max <sessions>] [--drafts <n>]

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listArchivedSessions, fetchRaceImport } from './race-results-import.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function option(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

const outFile = path.resolve(ROOT, String(option('out', 'race_import.json')));
const maxSessions = Number(option('max', 60)) || 60;
const maxDrafts = Number(option('drafts', 8)) || 8;

let previous = null;
try {
  if (fs.existsSync(outFile)) previous = JSON.parse(fs.readFileSync(outFile, 'utf8'));
} catch (e) {
  previous = null;
}
const previousDrafts = (previous && previous.drafts && typeof previous.drafts === 'object') ? previous.drafts : {};
const previousSessions = (previous && Array.isArray(previous.sessions)) ? previous.sessions : [];

let sessions = [];
try {
  sessions = await listArchivedSessions();
  console.log('Archived sessions: ' + sessions.length);
} catch (e) {
  console.warn('Could not read the archived sessions (' + ((e && e.message) || e) + '); keeping the previous list.');
  sessions = previousSessions;
}

// Bundle the drafts that matter (latest race + latest qualifying) and keep
// whatever was bundled before and is still archived, up to maxDrafts.
const wanted = [];
const pushName = (name) => { if (name && !wanted.includes(name)) wanted.push(name); };
const latestRace = sessions.find((s) => s.type === 'RACE');
const latestQualify = sessions.find((s) => s.type === 'QUALIFY');
pushName(latestRace && latestRace.name);
pushName(latestQualify && latestQualify.name);
const archivedNames = new Set(sessions.map((s) => s.name));
for (const name of Object.keys(previousDrafts)) {
  if (wanted.length >= maxDrafts) break;
  if (archivedNames.has(name)) pushName(name);
}
wanted.length = Math.min(wanted.length, maxDrafts);

const drafts = {};
for (const [name, payload] of Object.entries(previousDrafts)) drafts[name] = payload;

for (const name of wanted) {
  try {
    const payload = await fetchRaceImport(name);
    if (payload) {
      drafts[name] = { success: true, ...payload };
      console.log('Bundled draft: ' + name + ' (' + (payload.draft && payload.draft.entries ? payload.draft.entries.length : 0) + ' entries)');
    }
  } catch (e) {
    console.warn('Draft ' + name + ' could not be built (' + ((e && e.message) || e) + '); keeping the previous one.');
  }
}

const output = {
  version: 1,
  updatedAt: new Date().toISOString(),
  sessions: sessions.slice(0, maxSessions),
  drafts: drafts
};

// Ignore the volatile stamp when deciding whether the file really changed, so
// the workflow does not commit noise every run.
function stripVolatile(text) {
  return text.replace(/"updatedAt":\s*"[^"]*"/g, '"updatedAt": ""');
}
const content = JSON.stringify(output, null, 2) + '\n';
const previousText = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
if (previousText && stripVolatile(previousText) === stripVolatile(content)) {
  console.log('Unchanged ' + path.basename(outFile));
} else {
  fs.writeFileSync(outFile, content, 'utf8');
  console.log('Updated ' + path.basename(outFile) + ' (' + output.sessions.length + ' sessions, ' + Object.keys(drafts).length + ' draft(s))');
}
