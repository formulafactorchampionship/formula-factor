// -------------------------------------------------------------
// Live timing relay for Cloud Run.
// -------------------------------------------------------------
// formulafactorchampionship.eu is served by GitHub Pages, which is static and
// cannot hold the game panel's websocket. This service does exactly that and
// republishes the feed for the browser:
//
//   GET /api/live-timing/stream    Server-Sent Events, the panel's JSON
//   GET /api/live-timing/records   stored lap times (all-time + this session)
//   GET /health                    state of the upstream connection
//
// It is written against plain node:http with no dependencies, so the container
// is tiny and the build takes seconds.
//
// Cost note: the upstream socket is only kept open while somebody is watching
// (see IDLE_MS), so the instance can scale to zero when the site is idle.

import http from 'http';
import { fileURLToPath } from 'url';
import { createLiveTimingUpstream, LIVE_TIMING_UPSTREAM } from '../live-timing-upstream.js';
import { createLiveTimingStore } from '../live-timing-store.js';

const PORT = Number(process.env.PORT) || 8080;
const IDLE_MS = Number(process.env.IDLE_MS) || 60000;
const SNAPSHOT_RE = /^\{\s*"EventType"\s*:\s*200\b/;

// Where the scheduled GitHub Action publishes the all-time records. They seed
// the store so the API is never worse than the static file the site already
// reads, and the current session on top of that.
const PUBLISHED_RECORDS_URL = process.env.PUBLISHED_RECORDS_URL ||
  'https://formulafactorchampionship.eu/live_timing_records.json';
const PUBLISHED_REFRESH_MS = Number(process.env.PUBLISHED_REFRESH_MS) || 10 * 60 * 1000;

// The endpoints are public and read-only. Lock them down with e.g.
// ALLOWED_ORIGINS="https://formulafactorchampionship.eu,https://formulafactorchampionship.github.io"
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

const upstream = createLiveTimingUpstream({
  host: process.env.UPSTREAM_HOST || LIVE_TIMING_UPSTREAM.host,
  port: process.env.UPSTREAM_PORT || LIVE_TIMING_UPSTREAM.port,
  path: process.env.UPSTREAM_PATH || LIVE_TIMING_UPSTREAM.path
});

const store = createLiveTimingStore({ file: '', autoWrite: false, log: console });

const clients = new Set();
// Upper bound so one bad actor opening N EventSources cannot pin the
// instance (and the Cloud Run bill). Browsers auto-retry on 503 thanks to
// the `retry:` field, so legit viewers just reconnect a moment later.
const MAX_CLIENTS = Number(process.env.MAX_SSE_CLIENTS) || 500;
let lastSnapshot = null;      // last full state, handed to clients connecting mid-session
let snapshotAt = 0;
let started = false;
let idleTimer = null;

// -------------------------------------------------------------
// Upstream fan-out
// -------------------------------------------------------------
upstream.on('message', (text) => {
  let type = 0;
  try { type = Number(JSON.parse(text).EventType) || 0; } catch (e) { return; }

  // 200 = full state, 53 = car positions: the only two the page reacts to.
  if (type !== 200 && type !== 53) return;

  if (type === 200) {
    lastSnapshot = text;
    snapshotAt = Date.now();
    try { store.recordSnapshot(JSON.parse(text).Message); } catch (e) { /* never break the relay */ }
  }

  for (const client of clients) {
    try { client.write('data: ' + text + '\n\n'); } catch (e) { /* client gone */ }
  }
});

upstream.on('status', (isConnected) => {
  if (!isConnected) {
    lastSnapshot = null;
    snapshotAt = 0;
  }
  const event = isConnected ? 'upstream-connected' : 'upstream-disconnected';
  for (const client of clients) {
    try { client.write('event: ' + event + '\ndata: {}\n\n'); } catch (e) { /* client gone */ }
  }
});

function startUpstream() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (started) return;
  started = true;
  upstream.start();
  console.log('upstream: connecting to ' + LIVE_TIMING_UPSTREAM.host + ':' + LIVE_TIMING_UPSTREAM.port + LIVE_TIMING_UPSTREAM.path);
}

function stopUpstreamWhenIdle() {
  if (idleTimer || clients.size > 0 || !started) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (clients.size > 0) return;
    started = false;
    upstream.stop();
    console.log('upstream: closed (nobody watching)');
  }, IDLE_MS);
  if (idleTimer.unref) idleTimer.unref();
}

// -------------------------------------------------------------
// Stored records
// -------------------------------------------------------------
async function seedPublishedRecords() {
  try {
    const response = await fetch(PUBLISHED_RECORDS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return;
    if (response.headers.get('content-type') && !String(response.headers.get('content-type')).includes('json')) return;
    const len = Number(response.headers.get('content-length') || 0);
    if (len > 5 * 1024 * 1024) return;
    const data = await response.json();
    const seeded = store.seedFromPublished(data);
    if (seeded) console.log('records: carried over ' + seeded + ' stored value(s) from the published file');
  } catch (e) {
    // Perfectly normal when the site has not published anything yet.
    console.log('records: published file unavailable (' + ((e && e.message) || e) + ')');
  }
}

// -------------------------------------------------------------
// HTTP
// -------------------------------------------------------------
function applyCors(req, res) {
  const origin = String(req.headers.origin || '');
  const allowed = ALLOWED_ORIGINS.includes('*') || (origin && ALLOWED_ORIGINS.includes(origin));
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes('*') ? '*' : origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(req, res, status, payload) {
  const body = JSON.stringify(payload);
  applyCors(req, res);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function handleStream(req, res) {
  if (clients.size >= MAX_CLIENTS) {
    sendJson(req, res, 503, { success: false, error: 'relay busy, retry soon' });
    return;
  }
  applyCors(req, res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Accel-Buffering': 'no'
  });

  res.write('retry: 3000\n\n');
  res.write('event: status\ndata: ' + JSON.stringify({ connected: upstream.isConnected() }) + '\n\n');
  if (lastSnapshot) res.write('data: ' + lastSnapshot + '\n\n');

  clients.add(res);
  startUpstream();

  const keepAlive = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch (e) { /* client gone */ }
  }, 15000);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    clients.delete(res);
    stopUpstreamWhenIdle();
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') {
    applyCors(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendJson(req, res, 405, { success: false, error: 'method not allowed' });
    return;
  }

  if (path === '/api/live-timing/stream' && req.method === 'GET') {
    handleStream(req, res);
    return;
  }

  if (path === '/api/live-timing/records') {
    const track = String(url.searchParams.get('track') || '');
    const config = String(url.searchParams.get('config') || '');
    const db = store.getStore();
    sendJson(req, res, 200, {
      success: true,
      ...store.recordsFor(track, config),
      tracks: Object.keys(db.tracks).length,
      updatedAt: db.updatedAt
    });
    return;
  }

  if (path === '/health' || path === '/') {
    sendJson(req, res, 200, {
      ok: true,
      service: 'ffc-live-timing-relay',
      upstream: { connected: upstream.isConnected(), started: started },
      clients: clients.size,
      lastSnapshotAgeMs: snapshotAt ? Date.now() - snapshotAt : null,
      tracks: Object.keys(store.getStore().tracks).length,
      uptimeSeconds: Math.round(process.uptime())
    });
    return;
  }

  sendJson(req, res, 404, { success: false, error: 'not found' });
});

server.listen(PORT, () => {
  console.log('live timing relay listening on http://0.0.0.0:' + PORT);
});

// Seed the all-time records now and keep them in step with the published file.
seedPublishedRecords();
setInterval(seedPublishedRecords, PUBLISHED_REFRESH_MS).unref();

const shutdown = () => {
  upstream.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
