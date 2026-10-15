import './envLoader.js';
import express from 'express';
import path from 'path';
import fs from 'fs';
import tls from 'tls';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { fetchAllAccounts, deleteAccounts, PROTECTED_EMAILS, FIREBASE_API_KEY } from './emailAuditService.js';
import { createLiveTimingStore } from './live-timing-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// -------------------------------------------------------------
// 0. ADMIN SECRET RESOLUTION
// -------------------------------------------------------------
// (.env is loaded first, via ./envLoader.js, before any other module.)

// Security salt and secret key configuration
const AUTH_SALT = '_formula_factor_auth_salt_2026';

// Admin API secret resolution (there is NO hardcoded fallback):
//   1) ADMIN_API_SECRET from the environment or .env
//   2) a persisted local secret file (.admin_secret, gitignored)
//   3) auto-generated random secret (stored for reuse across restarts)
const ADMIN_SECRET_FILE = path.join(__dirname, '.admin_secret');
function resolveAdminSecret() {
  const fromEnv = (process.env.ADMIN_API_SECRET || '').trim();
  if (fromEnv) return fromEnv;

  try {
    if (fs.existsSync(ADMIN_SECRET_FILE)) {
      const stored = fs.readFileSync(ADMIN_SECRET_FILE, 'utf8').trim();
      if (stored) return stored;
    }
  } catch (e) { /* ignore */ }

  const generated = crypto.randomBytes(48).toString('base64url');
  try {
    fs.writeFileSync(ADMIN_SECRET_FILE, generated, { encoding: 'utf8', mode: 0o600 });
    console.log('[FFC] ADMIN_API_SECRET not set: generated a random secret and stored it in .admin_secret (gitignored).');
  } catch (e) {
    console.warn('[FFC] ADMIN_API_SECRET not set and .admin_secret could not be written. Using an in-memory secret.');
  }
  return generated;
}
let ADMIN_SECRET = resolveAdminSecret();
const ADMIN_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// -------------------------------------------------------------
// 1. STRICT STRING SANITIZATION HELPER
// -------------------------------------------------------------
function sanitizeString(str, maxLength = 250) {
  if (!str) return '';
  const cleaned = String(str)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .replace(/javascript:/gi, '')
    .replace(/onerror\s*=/gi, '')
    .replace(/onload\s*=/gi, '')
    .replace(/onclick\s*=/gi, '')
    .trim();
  return cleaned.slice(0, maxLength);
}

// -------------------------------------------------------------
// 2. HTTP HEADERS & CACHE-CONTROL MIDDLEWARE
// -------------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const p = req.path;
  if (p.startsWith('/api/') || p.endsWith('.html') || p === '/') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else if (p.endsWith('.css') || p.endsWith('.js') || p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.webp') || p.includes('/news_uploads/')) {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  }
  next();
});

// -------------------------------------------------------------
// 3. SENSITIVE FILES & DIRECTORIES ACCESS BLOCKER (403 FORBIDDEN)
// -------------------------------------------------------------
const SENSITIVE_PATTERNS = [
  /server\.js$/i,
  /emailauditservice\.js$/i,
  /update_index\.js$/i,
  /scores_snippet\.js$/i,
  /package(\.json|-lock\.json)?$/i,
  /^\/?\.env/i,
  /\.env/i,
  /\.admin_secret$/i,
  /_db\.json$/i,
  /backup/i,
  /^\/?backups(\/|$)/i,
  /^\/?components(\/|$)/i,
  /^\/?\.aistudio(\/|$)/i,
  /firestore\.rules$/i,
  /firebase-blueprint\.json$/i
];

app.use((req, res, next) => {
  let normalizedPath = '';
  try {
    normalizedPath = decodeURIComponent(req.path).replace(/\\/g, '/');
  } catch (e) {
    return res.status(400).send('400 Bad Request');
  }

  const safePath = path.posix.normalize(normalizedPath);

  // This guard protects STATIC file access only. API endpoints (/api/...) have
  // their own authentication, and must not be shadowed by file-name patterns
  // such as /backup/i, which would otherwise block /api/admin/audit-backups.
  if (safePath === '/api' || safePath.startsWith('/api/')) return next();

  const baseName = path.posix.basename(safePath);
  const isBlocked = SENSITIVE_PATTERNS.some(pattern => pattern.test(safePath) || pattern.test(baseName));

  if (isBlocked) {
    return res.status(403).json({
      error: '403 Forbidden: Acceso denegado a archivo o directorio protegido del sistema',
      code: 'security/forbidden-file-access'
    });
  }

  next();
});

// -------------------------------------------------------------
// 4. BODY PARSER CONFIGURATION (PAYLOAD LIMIT RESTRICTION)
// -------------------------------------------------------------
const uploadLimitParser = express.json({ limit: '15mb' });
app.use(['/api/noticias/upload-image', '/api/carreras/fotos'], uploadLimitParser);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// -------------------------------------------------------------
// 5. STATIC ASSET SERVING
// -------------------------------------------------------------
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false
}));

// -------------------------------------------------------------
// 6. SECURE ADMIN SESSION TOKENS & AUTHORIZATION SYSTEM
//    Tokens are signed with HMAC-SHA256 and carry an expiry. There is
//    no hardcoded/backdoor token and no deterministic per-email token.
// -------------------------------------------------------------
function safeEqualStrings(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function generateAdminToken(email) {
  const clean = String(email || '').toLowerCase().trim();
  const payload = {
    e: clean,
    iat: Date.now(),
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
    n: crypto.randomBytes(8).toString('hex')
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  return `ffc1.${body}.${sig}`;
}

function verifyAdminToken(token, expectedEmail) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts[0] !== 'ffc1') return null;

  const body = parts[1];
  const sig = parts[2];
  const expectedSig = crypto.createHmac('sha256', ADMIN_SECRET).update(body).digest('base64url');
  if (!safeEqualStrings(sig, expectedSig)) return null;

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || Date.now() > payload.exp) return null;

  const email = String(payload.e || '').toLowerCase().trim();
  if (!email || !PROTECTED_EMAILS.some(pe => pe.toLowerCase() === email)) return null;
  if (expectedEmail && expectedEmail.toLowerCase().trim() !== email) return null;

  return { email };
}

function extractAdminCredentials(req) {
  const adminEmail = (
    req.headers['x-admin-email'] ||
    req.query.adminEmail ||
    (req.body && req.body.adminEmail) ||
    ''
  ).toLowerCase().trim();

  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
  const adminToken = (
    req.headers['x-admin-token'] ||
    bearerToken ||
    req.query.adminToken ||
    (req.body && req.body.adminToken) ||
    ''
  ).trim();

  return { adminEmail, adminToken };
}

function requireAdminAuth(req, res, next) {
  const { adminEmail, adminToken } = extractAdminCredentials(req);
  if (!adminToken) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado: Se requieren credenciales de Administrador FFC autorizadas',
      code: 'auth/admin-unauthorized'
    });
  }

  const verified = verifyAdminToken(adminToken, adminEmail || undefined);
  if (!verified) {
    return res.status(403).json({
      success: false,
      error: 'Acceso denegado: credenciales de Administrador FFC no válidas o caducadas',
      code: 'auth/admin-unauthorized'
    });
  }

  req.adminUser = { email: verified.email };
  return next();
}

// -------------------------------------------------------------
// 6b. FIREBASE ID TOKEN VERIFICATION (authenticated user actions)
// -------------------------------------------------------------
const firebaseUserTokenCache = new Map();
const FIREBASE_TOKEN_CACHE_MS = 5 * 60 * 1000;

async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
        signal: controller.signal
      }
    );
    clearTimeout(timeout);
    const data = await response.json().catch(() => null);
    if (!data || !Array.isArray(data.users) || data.users.length === 0) return null;
    const u = data.users[0];
    return {
      uid: u.localId,
      email: String(u.email || '').toLowerCase().trim(),
      name: u.displayName || ''
    };
  } catch (e) {
    console.warn('[FFC] Firebase ID token verification failed:', e.message);
    return null;
  }
}

function extractIdToken(req) {
  const authHeader = req.headers['authorization'] || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader.trim();
  return String(
    req.headers['x-id-token'] ||
    bearer ||
    (req.body && req.body.idToken) ||
    ''
  ).trim();
}

async function requireFirebaseUser(req, res, next) {
  try {
    const idToken = extractIdToken(req);
    if (!idToken) {
      return res.status(401).json({ success: false, error: 'Autenticación requerida', code: 'auth/required' });
    }

    const cached = firebaseUserTokenCache.get(idToken);
    let user = cached && cached.exp > Date.now() ? cached.user : null;

    if (!user) {
      user = await verifyFirebaseIdToken(idToken);
      if (user) {
        firebaseUserTokenCache.set(idToken, { user, exp: Date.now() + FIREBASE_TOKEN_CACHE_MS });
        if (firebaseUserTokenCache.size > 500) {
          const now = Date.now();
          for (const [k, v] of firebaseUserTokenCache) {
            if (v.exp <= now) firebaseUserTokenCache.delete(k);
          }
        }
      }
    }

    if (!user || !user.email) {
      return res.status(401).json({ success: false, error: 'Sesión no válida o caducada', code: 'auth/invalid-token' });
    }

    req.firebaseUser = user;
    return next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Autenticación requerida', code: 'auth/required' });
  }
}

// -------------------------------------------------------------
// 7. ENHANCED PASSWORD HASHING (SCRYPT + LEGACY SHA-256 COMPAT)
// -------------------------------------------------------------
function hashPassword(password) {
  if (!password) return '';
  const derivedKey = crypto.scryptSync(password, AUTH_SALT, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${derivedKey.toString('hex')}`;
}

function verifyPassword(candidatePassword, storedHashOrPassword) {
  if (!candidatePassword || !storedHashOrPassword) return false;

  if (storedHashOrPassword.startsWith('scrypt$')) {
    const candidateHash = hashPassword(candidatePassword);
    return crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(storedHashOrPassword));
  }

  const legacyHash = crypto.createHash('sha256').update(candidatePassword + AUTH_SALT).digest('hex');
  if (storedHashOrPassword === legacyHash) {
    return true;
  }

  if (storedHashOrPassword === candidatePassword) {
    return true;
  }

  return false;
}

// -------------------------------------------------------------
// 8. DATABASE STORES (USERS, FANTASY, PHOTOS, LOCK)
// -------------------------------------------------------------
const USERS_FILE = path.join(__dirname, 'users_db.json');
let memoryUsers = null;

function getUsers() {
  if (memoryUsers !== null) return memoryUsers;
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      memoryUsers = Array.isArray(parsed) ? parsed.filter(u => u && u.email && typeof u.email === 'string' && u.email.includes('@')) : [];
      return memoryUsers;
    }
  } catch (e) {
    console.error('Error reading users file:', e);
  }
  memoryUsers = [];
  return memoryUsers;
}

let usersWriteTimer = null;
function saveUsers(users) {
  const cleanList = Array.isArray(users) ? users.filter(u => u && u.email && typeof u.email === 'string' && u.email.includes('@')) : [];
  memoryUsers = cleanList;
  if (usersWriteTimer) clearTimeout(usersWriteTimer);
  usersWriteTimer = setTimeout(() => {
    fs.writeFile(USERS_FILE, JSON.stringify(cleanList, null, 2), 'utf8', (err) => {
      if (err) console.error('Error asynchronously saving users file:', err);
    });
  }, 100);
}

// -------------------------------------------------------------
// 9. CONFIGURATION & AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({
    firebaseApiKey: FIREBASE_API_KEY
  });
});

// Exchange a Firebase ID token (from an authorized admin account) for a signed,
// expiring admin session token. Replaces the previous deterministic/backdoor token.
app.post('/api/admin/session', async (req, res) => {
  const { idToken } = req.body || {};
  const fbUser = await verifyFirebaseIdToken(idToken);
  if (!fbUser || !fbUser.email) {
    return res.status(401).json({ success: false, error: 'Sesión de Firebase no válida', code: 'auth/invalid-id-token' });
  }
  if (!PROTECTED_EMAILS.some(pe => pe.toLowerCase() === fbUser.email)) {
    return res.status(403).json({ success: false, error: 'Cuenta sin privilegios de administrador', code: 'auth/not-admin' });
  }
  return res.json({
    success: true,
    adminToken: generateAdminToken(fbUser.email),
    email: fbUser.email,
    expiresIn: ADMIN_SESSION_TTL_MS
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password, passwordHash } = req.body || {};
  if (!email || (!password && !passwordHash)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanEmail)) {
    return res.status(400).json({ error: 'Invalid email format', code: 'auth/invalid-email' });
  }
  if (cleanEmail.length > 128) {
    return res.status(400).json({ error: 'Email too long', code: 'auth/email-too-long' });
  }

  const cleanName = sanitizeString(name || cleanEmail.split('@')[0], 50);
  if (cleanName.length > 50) {
    return res.status(400).json({ error: 'Username too long', code: 'auth/username-too-long' });
  }

  const normalizedAdminCheck = cleanName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[@4]/g, 'a')
    .replace(/[|1!l]/g, 'i')
    .replace(/[0]/g, 'o')
    .replace(/[3]/g, 'e')
    .replace(/[^a-z]/g, '');

  if (normalizedAdminCheck.includes('admin') || cleanName.toLowerCase().includes('admin')) {
    return res.status(400).json({ 
      error: 'Username not allowed: contains admin or reserved variations', 
      code: 'auth/username-reserved-admin' 
    });
  }

  if (password && password.length < 8) {
    return res.status(400).json({ error: 'Password must have at least 8 characters', code: 'auth/weak-password' });
  }
  const users = getUsers();

  const existingEmail = users.find(u => (u.email || '').toLowerCase().trim() === cleanEmail);
  if (existingEmail) {
    return res.status(400).json({ error: 'Email already in use', code: 'auth/email-already-in-use' });
  }

  const existingName = users.find(u => (u.displayName || '').toLowerCase().trim() === cleanName.toLowerCase().trim());
  if (existingName) {
    return res.status(400).json({ error: 'Username already in use', code: 'auth/username-already-in-use' });
  }

  // Only accept modern, well-formed hashes supplied by the client. Never store an
  // arbitrary or plaintext value provided by the caller.
  const isModernHash = typeof passwordHash === 'string'
    && (passwordHash.startsWith('scrypt$') || passwordHash.startsWith('pbkdf2$'));
  let pHash;
  if (password) {
    pHash = hashPassword(password); // server-side scrypt is always preferred
  } else if (isModernHash) {
    pHash = passwordHash;
  } else {
    return res.status(400).json({ error: 'A valid password or password hash is required', code: 'auth/invalid-credentials' });
  }

  const userData = {
    uid: 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    displayName: cleanName,
    email: cleanEmail,
    passwordHash: pHash,
    createdAt: new Date().toISOString()
  };

  users.push(userData);
  saveUsers(users);

  return res.json({ 
    success: true, 
    user: {
      uid: userData.uid,
      displayName: userData.displayName,
      email: userData.email,
      createdAt: userData.createdAt
    } 
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password, passwordHash } = req.body || {};
  if (!email || (!password && !passwordHash)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const users = getUsers();
  const found = users.find(u => (u.email || '').toLowerCase().trim() === cleanEmail);

  if (!found) {
    return res.status(404).json({ error: 'User not found', code: 'auth/user-not-found' });
  }

  let match = false;
  if (password) {
    match = verifyPassword(password, found.passwordHash || found.password);
    if (match && (!found.passwordHash || !found.passwordHash.startsWith('scrypt$'))) {
      found.passwordHash = hashPassword(password);
      delete found.password;
      saveUsers(users);
    }
  } else if (passwordHash) {
    match = (found.passwordHash && found.passwordHash === passwordHash);
  }

  if (!match) {
    return res.status(401).json({ error: 'Wrong password', code: 'auth/wrong-password' });
  }

  const isAdmin = PROTECTED_EMAILS.some(pe => pe.toLowerCase() === cleanEmail);

  return res.json({
    success: true,
    user: {
      uid: found.uid,
      displayName: sanitizeString(found.displayName || cleanEmail.split('@')[0], 50),
      email: found.email,
      createdAt: found.createdAt,
      isAdmin,
      ...(isAdmin ? { adminToken: generateAdminToken(found.email) } : {})
    }
  });
});

// Requirement 1b: Strict sanitization and validation in /api/auth/sync
app.post('/api/auth/sync', requireAdminAuth, (req, res) => {
  const { users } = req.body || {};
  if (!Array.isArray(users)) {
    return res.status(400).json({ error: 'Expected array of users' });
  }

  const currentUsers = getUsers();
  let updated = false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const u of users) {
    if (!u || !u.email || typeof u.email !== 'string') continue;
    const cleanEmail = u.email.trim().toLowerCase();
    if (!emailRegex.test(cleanEmail) || cleanEmail.length > 128) continue;

    const cleanName = sanitizeString(u.displayName || cleanEmail.split('@')[0], 50);
    const idx = currentUsers.findIndex(cu => (cu.email || '').toLowerCase().trim() === cleanEmail);
    // Only accept modern derived hashes; never trust a plaintext password here.
    const rawHash = typeof u.passwordHash === 'string' ? u.passwordHash : '';
    const pHash = (rawHash.startsWith('scrypt$') || rawHash.startsWith('pbkdf2$')) ? rawHash : '';

    if (idx >= 0) {
      if (!currentUsers[idx].passwordHash && pHash) {
        currentUsers[idx].passwordHash = pHash;
        updated = true;
      }
      if (!currentUsers[idx].displayName && cleanName) {
        currentUsers[idx].displayName = cleanName;
        updated = true;
      }
    } else {
      currentUsers.push({
        uid: sanitizeString(u.uid || ('user_' + Date.now()), 60),
        displayName: cleanName,
        email: cleanEmail,
        passwordHash: pHash,
        createdAt: sanitizeString(u.createdAt || new Date().toISOString(), 30)
      });
      updated = true;
    }
  }

  if (updated) {
    saveUsers(currentUsers);
  }

  return res.json({ success: true, count: currentUsers.length });
});

// -------------------------------------------------------------
// 10. FANTASY TEAMS & LOCK MANAGEMENT (WITH STRICT SANITIZATION)
// -------------------------------------------------------------
const FANTASY_TEAMS_FILE = path.join(__dirname, 'fantasy_teams_db.json');
let memoryFantasyTeams = null;

function getFantasyTeams() {
  if (memoryFantasyTeams !== null) return memoryFantasyTeams;
  try {
    if (fs.existsSync(FANTASY_TEAMS_FILE)) {
      const data = fs.readFileSync(FANTASY_TEAMS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      memoryFantasyTeams = Array.isArray(parsed) ? parsed.filter(t => t && (t.email || t.userId)) : [];
      return memoryFantasyTeams;
    }
  } catch (e) {
    console.error('Error reading fantasy teams file:', e);
  }
  memoryFantasyTeams = [];
  return memoryFantasyTeams;
}

let fantasyTeamsWriteTimer = null;
function saveFantasyTeams(teams) {
  const cleanList = Array.isArray(teams) ? teams.filter(t => t && (t.email || t.userId)) : [];
  memoryFantasyTeams = cleanList;
  if (fantasyTeamsWriteTimer) clearTimeout(fantasyTeamsWriteTimer);
  fantasyTeamsWriteTimer = setTimeout(() => {
    fs.writeFile(FANTASY_TEAMS_FILE, JSON.stringify(cleanList, null, 2), 'utf8', (err) => {
      if (err) console.error('Error saving fantasy teams file:', err);
    });
  }, 100);
}

app.get('/api/fantasy/teams', (req, res) => {
  const teams = getFantasyTeams();
  return res.json({ success: true, teams });
});

// Requirement 1a: Strict sanitization and budget validation in POST /api/fantasy/teams
app.post('/api/fantasy/teams', requireFirebaseUser, (req, res) => {
  const teamData = req.body || {};

  // Identity comes exclusively from the verified Firebase session (never from the client body).
  const cleanEmail = req.firebaseUser.email;
  const cleanUserId = cleanEmail.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

  const rawTeamValue = Number(teamData.teamValue);
  if (!isNaN(rawTeamValue) && rawTeamValue > 85.0) {
    return res.status(400).json({ error: 'Tope de presupuesto excedido (máximo 85.0M€)', code: 'fantasy/budget-exceeded' });
  }
  const teamValue = !isNaN(rawTeamValue) ? Math.min(Math.max(rawTeamValue, 0), 85.0) : 75.0;

  const sanitizedTeamName = sanitizeString(teamData.teamName || 'Escudería FFC', 40);
  const sanitizedManagerName = sanitizeString(teamData.managerName || 'Manager FFC', 40);
  const sanitizedTeam = sanitizeString(teamData.team || '', 40);
  const sanitizedDriver1 = sanitizeString(teamData.driver1 || '', 40);
  const sanitizedDriver2 = sanitizeString(teamData.driver2 || '', 40);
  const sanitizedDriver3 = sanitizeString(teamData.driver3 || '', 40);
  const sanitizedTurbo = sanitizeString(teamData.turboDriver || '', 40);

  const roundLineups = (teamData.roundLineups && typeof teamData.roundLineups === 'object' && !Array.isArray(teamData.roundLineups))
    ? JSON.parse(JSON.stringify(teamData.roundLineups))
    : {};

  const teams = getFantasyTeams();
  const idx = teams.findIndex(t =>
    (t.userId && t.userId.toLowerCase().trim() === cleanUserId) ||
    (t.email && t.email.toLowerCase().trim() === cleanEmail)
  );

  // Only whitelisted fields are persisted (no arbitrary client fields are merged in).
  const updatedEntry = {
    userId: cleanUserId,
    email: cleanEmail,
    teamName: sanitizedTeamName,
    managerName: sanitizedManagerName,
    team: sanitizedTeam,
    driver1: sanitizedDriver1,
    driver2: sanitizedDriver2,
    driver3: sanitizedDriver3,
    turboDriver: sanitizedTurbo,
    roundLineups: roundLineups,
    totalPoints: idx >= 0 && typeof teams[idx].totalPoints === 'number' ? teams[idx].totalPoints : 0,
    teamValue: teamValue,
    updatedAt: new Date().toISOString()
  };

  if (idx >= 0) {
    teams[idx] = updatedEntry;
  } else {
    teams.push(updatedEntry);
  }

  saveFantasyTeams(teams);
  return res.json({ success: true, team: updatedEntry, total: teams.length });
});

const FANTASY_LOCK_FILE = path.join(__dirname, 'fantasy_lock_db.json');
let memoryFantasyLock = null;

function getFantasyLockState() {
  if (memoryFantasyLock !== null) return memoryFantasyLock;
  try {
    if (fs.existsSync(FANTASY_LOCK_FILE)) {
      const data = fs.readFileSync(FANTASY_LOCK_FILE, 'utf8');
      memoryFantasyLock = JSON.parse(data);
      return memoryFantasyLock;
    }
  } catch (e) {
    console.error('Error reading fantasy lock file:', e);
  }
  memoryFantasyLock = {
    locked: false,
    message: "Mercado cerrado temporalmente por Gran Premio en curso.",
    fluctuationEnabled: true,
    volatilityMultiplier: 1.0
  };
  return memoryFantasyLock;
}

function saveFantasyLockState(state) {
  memoryFantasyLock = state;
  fs.writeFile(FANTASY_LOCK_FILE, JSON.stringify(state, null, 2), 'utf8', (err) => {
    if (err) console.error('Error saving fantasy lock file:', err);
  });
}

app.get('/api/fantasy/lock', (req, res) => {
  const state = getFantasyLockState();
  return res.json({ success: true, ...state });
});

app.post('/api/fantasy/lock', requireAdminAuth, (req, res) => {
  const { locked, message, fluctuationEnabled, volatilityMultiplier } = req.body || {};
  const current = getFantasyLockState();
  const state = {
    locked: typeof locked === 'boolean' ? locked : current.locked,
    message: message !== undefined ? sanitizeString(message, 500) : current.message,
    fluctuationEnabled: typeof fluctuationEnabled === 'boolean' ? fluctuationEnabled : (current.fluctuationEnabled !== undefined ? current.fluctuationEnabled : true),
    volatilityMultiplier: typeof volatilityMultiplier === 'number' ? volatilityMultiplier : (current.volatilityMultiplier || 1.0),
    updatedAt: new Date().toISOString()
  };
  saveFantasyLockState(state);
  return res.json({ success: true, ...state });
});

// -------------------------------------------------------------
// 11. LIVE TIMING RELAY (Assetto Hosting race-control -> SSE)
// -------------------------------------------------------------
// The upstream server-manager websocket behind /api/race-control refuses any
// handshake whose Origin header does not match its own host, so a browser on
// this domain can never connect to it directly. Instead we keep a single
// upstream websocket connection here (no Origin is sent, so it is accepted)
// and fan the JSON messages out to browsers through Server-Sent Events.
// The upstream client is implemented with tls + RFC6455 framing so no extra
// dependency is required.

const LIVE_TIMING_HOST = 'fr.assettohosting.com';
const LIVE_TIMING_PORT = 60290;
const LIVE_TIMING_PATH = '/api/race-control';

function createLiveTimingUpstream() {
  let socket = null;
  let buffer = Buffer.alloc(0);
  let handshakeDone = false;
  let fragment = null;
  let retryTimer = null;
  let retryDelay = 2000;
  let connected = false;
  let stopped = true;
  const listeners = { message: [], status: [] };

  function emit(event, payload) {
    listeners[event].forEach(fn => {
      try { fn(payload); } catch (e) { /* listener errors must not break the relay */ }
    });
  }

  function sendFrame(opcode, payload) {
    if (!socket || !socket.writable) return;
    const mask = crypto.randomBytes(4);
    const length = payload.length;
    let header;
    if (length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | length;
    } else if (length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(length), 2);
    }
    header[0] = 0x80 | opcode;
    const masked = Buffer.allocUnsafe(length);
    for (let i = 0; i < length; i++) {
      masked[i] = payload[i] ^ mask[i % 4];
    }
    try { socket.write(Buffer.concat([header, mask, masked])); } catch (e) { /* ignore */ }
  }

  function parseFrames() {
    while (buffer.length >= 2) {
      const first = buffer[0];
      const second = buffer[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
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

      let maskKey = null;
      if (masked) {
        if (buffer.length < offset + 4) return;
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }
      if (buffer.length < offset + length) return;

      const payload = Buffer.from(buffer.subarray(offset, offset + length));
      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }
      buffer = buffer.subarray(offset + length);

      if (opcode === 0x1 || opcode === 0x2) {
        if (fin) {
          if (opcode === 0x1) emit('message', payload.toString('utf8'));
        } else {
          fragment = payload;
        }
      } else if (opcode === 0x0) {
        if (fragment) {
          fragment = Buffer.concat([fragment, payload]);
          if (fin) {
            emit('message', fragment.toString('utf8'));
            fragment = null;
          }
        }
      } else if (opcode === 0x8) { // close
        try { socket.end(); } catch (e) { /* ignore */ }
        return;
      } else if (opcode === 0x9) { // ping -> pong
        sendFrame(0xA, payload);
      }
    }
  }

  function teardown() {
    if (socket) {
      const stale = socket;
      socket = null;
      try { stale.destroy(); } catch (e) { /* ignore */ }
    }
    buffer = Buffer.alloc(0);
    handshakeDone = false;
    fragment = null;
    if (connected) {
      connected = false;
      emit('status', false);
    }
  }

  function scheduleReconnect() {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, retryDelay);
    retryDelay = Math.min(Math.round(retryDelay * 1.6), 15000);
  }

  function connect() {
    if (stopped || socket) return;

    const key = crypto.randomBytes(16).toString('base64');
    const request =
      'GET ' + LIVE_TIMING_PATH + ' HTTP/1.1\r\n' +
      'Host: ' + LIVE_TIMING_HOST + ':' + LIVE_TIMING_PORT + '\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Key: ' + key + '\r\n' +
      'Sec-WebSocket-Version: 13\r\n\r\n';

    const current = tls.connect(
      { host: LIVE_TIMING_HOST, port: LIVE_TIMING_PORT, servername: LIVE_TIMING_HOST },
      () => { try { current.write(request); } catch (e) { /* ignore */ } }
    );
    socket = current;
    current.setNoDelay(true);

    current.on('data', (chunk) => {
      if (!handshakeDone) {
        buffer = Buffer.concat([buffer, chunk]);
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const head = buffer.subarray(0, headerEnd).toString('latin1');
        buffer = buffer.subarray(headerEnd + 4);
        if (!/^HTTP\/1\.1 101/.test(head)) {
          teardown();
          scheduleReconnect();
          return;
        }
        handshakeDone = true;
        connected = true;
        retryDelay = 2000;
        emit('status', true);
      } else {
        buffer = Buffer.concat([buffer, chunk]);
      }
      parseFrames();
    });

    current.on('error', () => { /* handled by the close event */ });
    current.on('close', () => {
      if (socket !== current) return;
      teardown();
      scheduleReconnect();
    });
  }

  return {
    on(event, fn) {
      if (listeners[event]) listeners[event].push(fn);
    },
    start() {
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      teardown();
    }
  };
}

const liveTimingUpstream = createLiveTimingUpstream();
const liveTimingClients = new Set();
let liveTimingLastMessage = null;
let liveTimingLastSnapshot = null; // last full RaceControl state (EventType 200)
let liveTimingUpstreamConnected = false;
let liveTimingUpstreamStarted = false;

// Lap times are only offered by the upstream while its socket is open, so the
// relay stays connected around the clock: every session is captured even when
// nobody has the page open. Set to false to go back to on-demand connections.
const LIVE_TIMING_CAPTURE_ALWAYS = true;

// The upstream only pushes the full state when something changes, so a browser
// opening the page mid-session would otherwise wait for the next change.
const LIVE_TIMING_SNAPSHOT_RE = /^\{\s*"EventType"\s*:\s*200\b/;

liveTimingUpstream.on('message', (text) => {
  liveTimingLastMessage = text;
  if (LIVE_TIMING_SNAPSHOT_RE.test(text)) {
    liveTimingLastSnapshot = text;
    // Full state carries the lap times, so this is where the store is fed.
    try {
      liveTimingStore.recordSnapshot(JSON.parse(text).Message);
    } catch (e) { /* malformed snapshot: never break the relay */ }
  }
  for (const client of liveTimingClients) {
    try { client.write('data: ' + text + '\n\n'); } catch (e) { /* client gone */ }
  }
});

liveTimingUpstream.on('status', (isConnected) => {
  liveTimingUpstreamConnected = isConnected;
  if (!isConnected) {
    liveTimingLastMessage = null;
    liveTimingLastSnapshot = null;
  }
  const eventName = isConnected ? 'upstream-connected' : 'upstream-disconnected';
  for (const client of liveTimingClients) {
    try { client.write('event: ' + eventName + '\ndata: {}\n\n'); } catch (e) { /* client gone */ }
  }
});

app.get('/api/live-timing/stream', (req, res) => {
  // The global /api/ middleware already disables caching for this path.
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write('retry: 3000\n\n');
  res.write('event: status\ndata: ' + JSON.stringify({ connected: liveTimingUpstreamConnected }) + '\n\n');
  if (liveTimingLastSnapshot) {
    // Full state first, so the table and map render immediately.
    res.write('data: ' + liveTimingLastSnapshot + '\n\n');
  } else if (liveTimingLastMessage) {
    res.write('data: ' + liveTimingLastMessage + '\n\n');
  }

  liveTimingClients.add(res);

  if (!liveTimingUpstreamStarted) {
    liveTimingUpstreamStarted = true;
    liveTimingUpstream.start();
  }

  const keepAlive = setInterval(() => {
    try { res.write(': keep-alive\n\n'); } catch (e) { /* client gone */ }
  }, 15000);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(keepAlive);
    liveTimingClients.delete(res);
    if (liveTimingClients.size === 0 && !LIVE_TIMING_CAPTURE_ALWAYS) {
      liveTimingUpstreamStarted = false;
      liveTimingUpstream.stop();
    }
  };

  req.on('close', cleanup);
  req.on('aborted', cleanup);
  res.on('close', cleanup);
});

// -------------------------------------------------------------
// 11b. LIVE TIMING RECORDS (persisted lap times + archived results)
// -------------------------------------------------------------
// The rules (what counts as a valid lap, how sessions are imported, how the
// stored times are merged) live in live-timing-store.js, shared with the
// scheduled GitHub Action that publishes the static records the public site
// reads from GitHub Pages.
const liveTimingStore = createLiveTimingStore({
  file: path.join(__dirname, 'live_timing_db.json'),
  sanitize: sanitizeString,
  log: console
});

// Stored records for one circuit (or for every circuit when no track is given).
app.get('/api/live-timing/records', (req, res) => {
  const track = sanitizeString(String(req.query.track || ''), 80);
  const config = sanitizeString(String(req.query.config || ''), 80);
  const store = liveTimingStore.getStore();

  return res.json({
    success: true,
    ...liveTimingStore.recordsFor(track, config),
    tracks: Object.keys(store.tracks).length,
    import: {
      sessions: Object.keys(store.importedSessions || {}).length,
      laps: liveTimingStore.importStatus.laps,
      at: liveTimingStore.importStatus.at,
      error: liveTimingStore.importStatus.error
    },
    updatedAt: store.updatedAt
  });
});

// How often the archived sessions are re-scanned (the relay is always on, so
// this is only for sessions that ended while the process was down).
const LIVE_TIMING_IMPORT_EVERY_MS = 15 * 60 * 1000;

// -------------------------------------------------------------
// 12. CARRERAS FOTOS & COMMUNITY GALLERY (WITH STRICT SANITIZATION)
// -------------------------------------------------------------
const PHOTOS_FILE = path.join(__dirname, 'photos_db.json');
let memoryPhotos = null;
let lastPhotosFirestoreSync = 0;
const PHOTOS_TTL_MS = 60000; // 60 seconds

function getPhotos() {
  if (memoryPhotos !== null) return memoryPhotos;
  try {
    if (fs.existsSync(PHOTOS_FILE)) {
      const data = fs.readFileSync(PHOTOS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      memoryPhotos = Array.isArray(parsed) ? parsed.filter(p => p && p.id) : [];
      return memoryPhotos;
    }
  } catch (e) {
    console.error('Error reading photos file:', e);
  }
  memoryPhotos = [];
  return memoryPhotos;
}

let photosWriteTimer = null;
function savePhotos(photos) {
  const cleanList = Array.isArray(photos) ? photos.filter(p => p && p.id) : [];
  memoryPhotos = cleanList;
  if (photosWriteTimer) clearTimeout(photosWriteTimer);
  photosWriteTimer = setTimeout(() => {
    fs.writeFile(PHOTOS_FILE, JSON.stringify(cleanList, null, 2), 'utf8', (err) => {
      if (err) console.error('Error saving photos file:', err);
    });
  }, 100);
}

async function mirrorPhotoToFirestore(photo) {
  try {
    if (!photo || !photo.id) return;
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/formula-factor/databases/(default)/documents/carreras_fotos/${photo.id}?key=${FIREBASE_API_KEY}`;
    const docBody = {
      fields: {
        raceId: { stringValue: String(photo.raceId || 'barcelona_test') },
        photoUrl: { stringValue: String(photo.photoUrl || '') },
        caption: { stringValue: String(photo.caption || '') },
        author: { stringValue: String(photo.author || 'Piloto FFC') },
        status: { stringValue: String(photo.status || 'pending') },
        createdAt: { stringValue: String(photo.createdAt || '') },
        timestamp: { integerValue: String(photo.timestamp || Date.now()) }
      }
    };
    await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(docBody)
    });
  } catch (err) {
    console.warn('Could not mirror photo to Firestore:', err.message);
  }
}

async function deletePhotoFromFirestore(photoId) {
  try {
    if (!photoId) return;
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/formula-factor/databases/(default)/documents/carreras_fotos/${photoId}?key=${FIREBASE_API_KEY}`;
    await fetch(firestoreUrl, { method: 'DELETE' });
  } catch (err) {
    console.warn('Could not delete photo from Firestore:', err.message);
  }
}

app.get('/api/carreras/fotos', async (req, res) => {
  let photos = getPhotos();
  const now = Date.now();
  if (now - lastPhotosFirestoreSync > PHOTOS_TTL_MS) {
    lastPhotosFirestoreSync = now;
    (async () => {
      try {
        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/formula-factor/databases/(default)/documents/carreras_fotos?pageSize=100&key=${FIREBASE_API_KEY}`;
        const fRes = await fetch(firestoreUrl);
        if (fRes.ok) {
          const fData = await fRes.json();
          if (fData.documents && Array.isArray(fData.documents)) {
            let changed = false;
            const currentPhotos = getPhotos();
            fData.documents.forEach(doc => {
              const docId = doc.name.split('/').pop();
              const fields = doc.fields || {};
              const exists = currentPhotos.find(p => p.id === docId);
              const rawTimestamp = fields.timestamp?.integerValue ?? fields.timestamp?.doubleValue ?? fields.timestamp?.stringValue;
              const photoObj = {
                id: docId,
                raceId: sanitizeString(fields.raceId?.stringValue || 'barcelona_test', 80),
                photoUrl: fields.photoUrl?.stringValue || '',
                caption: sanitizeString(fields.caption?.stringValue || '', 500),
                author: sanitizeString(fields.author?.stringValue || 'Piloto FFC', 80),
                status: fields.status?.stringValue || 'pending',
                createdAt: fields.createdAt?.stringValue || '',
                timestamp: rawTimestamp ? parseInt(rawTimestamp, 10) : Date.now()
              };
              if (!exists) {
                currentPhotos.push(photoObj);
                changed = true;
              } else if (exists.status !== photoObj.status || exists.raceId !== photoObj.raceId || exists.caption !== photoObj.caption) {
                exists.status = photoObj.status;
                exists.raceId = photoObj.raceId;
                exists.caption = photoObj.caption;
                changed = true;
              }
            });
            if (changed) {
              savePhotos(currentPhotos);
            }
          }
        }
      } catch (e) {}
    })();
  }
  photos.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return res.json({ success: true, photos });
});

// Requirement 1c: Strict sanitization in POST /api/carreras/fotos
app.post('/api/carreras/fotos', requireFirebaseUser, async (req, res) => {
  const photo = req.body || {};
  if (!photo || (!photo.photoUrl && !photo.url)) {
    return res.status(400).json({ error: 'Missing photo data' });
  }

  const photos = getPhotos();
  const photoId = sanitizeString(photo.id || ('photo_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex')), 60);

  // Author and moderation status are derived from the verified session, never from the client.
  const isAdmin = PROTECTED_EMAILS.some(pe => pe.toLowerCase() === req.firebaseUser.email);
  const author = sanitizeString(
    req.firebaseUser.name || (req.firebaseUser.email ? req.firebaseUser.email.split('@')[0] : 'Piloto FFC'),
    80
  );

  const newEntry = {
    id: photoId,
    raceId: sanitizeString(photo.raceId || 'barcelona_test', 80),
    photoUrl: String(photo.photoUrl || photo.url),
    caption: sanitizeString(photo.caption || '', 500),
    author: author,
    status: isAdmin ? 'approved' : 'pending',
    createdAt: new Date().toLocaleString(),
    timestamp: Date.now()
  };

  const idx = photos.findIndex(p => p.id === photoId);
  if (idx >= 0) {
    photos[idx] = { ...photos[idx], ...newEntry };
  } else {
    photos.unshift(newEntry);
  }

  savePhotos(photos);
  lastPhotosFirestoreSync = Date.now();
  mirrorPhotoToFirestore(newEntry);

  return res.json({ success: true, photo: newEntry, total: photos.length });
});

// Requirement 1c: Strict sanitization in PATCH /api/carreras/fotos/:id
app.patch('/api/carreras/fotos/:id', requireAdminAuth, async (req, res) => {
  const photoId = req.params.id;
  const { status, caption, raceId } = req.body || {};
  const photos = getPhotos();
  const idx = photos.findIndex(p => p.id === photoId);
  if (idx >= 0) {
    if (status !== undefined) photos[idx].status = String(status);
    if (caption !== undefined) photos[idx].caption = sanitizeString(caption, 500);
    if (raceId !== undefined) photos[idx].raceId = sanitizeString(raceId, 80);
    savePhotos(photos);
    lastPhotosFirestoreSync = Date.now();
    mirrorPhotoToFirestore(photos[idx]);
    return res.json({ success: true, photo: photos[idx] });
  }
  return res.status(404).json({ error: 'Photo not found' });
});

app.delete('/api/carreras/fotos/:id', requireAdminAuth, async (req, res) => {
  const photoId = req.params.id;
  let photos = getPhotos();
  const initialLen = photos.length;
  photos = photos.filter(p => p.id !== photoId);
  if (photos.length !== initialLen) {
    savePhotos(photos);
    lastPhotosFirestoreSync = Date.now();
  }
  deletePhotoFromFirestore(photoId);
  return res.json({ success: true });
});

// News image upload endpoint (requires an authenticated user)
app.post('/api/noticias/upload-image', requireFirebaseUser, (req, res) => {
  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ error: 'Missing image data' });
  }

  try {
    const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!matches) {
      return res.status(400).json({ error: 'Invalid data URL format' });
    }

    const rawExt = matches[1].toLowerCase();
    const ext = rawExt === 'jpeg' ? 'jpg' : (rawExt === 'png' ? 'png' : (rawExt === 'webp' ? 'webp' : 'jpg'));
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `news_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const uploadDir = path.join(__dirname, 'news_uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);

    return res.json({ success: true, url: `/news_uploads/${filename}` });
  } catch (err) {
    console.error('Error saving news image:', err);
    return res.status(500).json({ error: 'Failed to save news image' });
  }
});

app.get('/api/gallery/random-wall-photos', (req, res) => {
  const photoPool = [];

  try {
    const photos = getPhotos();
    photos.forEach(p => {
      if (p.status === 'rejected') return;
      const url = p.photoUrl || p.imageUrl || p.url;
      if (url && !url.includes('news_uploads') && !url.includes('/news_')) {
        photoPool.push({
          image: url,
          title: sanitizeString(p.caption || (p.author ? `Foto por ${p.author}` : 'FFC Simracing'), 100),
          raceId: sanitizeString(p.raceId || '', 80)
        });
      }
    });
  } catch (e) {}

  return res.json({ success: true, items: photoPool });
});

// -------------------------------------------------------------
// 13. EMAIL AUDIT & CLEANUP SYSTEM (STRICT ADMIN ONLY)
// -------------------------------------------------------------
app.get('/api/admin/audit-emails', requireAdminAuth, async (req, res) => {
  try {
    const accounts = await fetchAllAccounts();
    const suspicious = accounts.filter(a => a.status === 'suspicious');
    const clean = accounts.filter(a => a.status === 'clean');

    const summary = {
      total: accounts.length,
      suspicious: suspicious.length,
      clean: clean.length,
      disposableCount: accounts.filter(a => a.category === 'disposable').length,
      dummyDomainCount: accounts.filter(a => a.category === 'dummy_domain').length,
      testPatternCount: accounts.filter(a => a.category === 'test_pattern').length,
      corruptedCount: accounts.filter(a => a.category === 'corrupted').length,
      timestamp: new Date().toISOString()
    };

    return res.json({
      success: true,
      summary,
      accounts,
      protectedEmails: PROTECTED_EMAILS
    });
  } catch (err) {
    console.error('Error during email audit:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/delete-accounts', requireAdminAuth, async (req, res) => {
  try {
    const { targets } = req.body || {};
    if (!Array.isArray(targets) || targets.length === 0) {
      return res.status(400).json({ success: false, error: 'No targets specified for deletion' });
    }

    const result = await deleteAccounts(targets);
    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error('Error deleting accounts in audit cleanup:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/audit-backups', requireAdminAuth, (req, res) => {
  try {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      return res.json({ success: true, backups: [] });
    }
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
    const backups = files.map(file => {
      const stat = fs.statSync(path.join(backupDir, file));
      return {
        filename: file,
        size: stat.size,
        createdAt: stat.birthtime || stat.mtime
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ success: true, backups });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 14. SPA CLIENT ROUTING & SERVER START
// -------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  if (LIVE_TIMING_CAPTURE_ALWAYS && !liveTimingUpstreamStarted) {
    liveTimingUpstreamStarted = true;
    liveTimingUpstream.start();
    console.log('Live timing relay running in always-on capture mode.');
  }
  // Bring in the sessions the panel had already archived, then keep an eye out
  // for new ones (a session that ends while the relay is down would be missed).
  liveTimingStore.importArchivedResults();
  setInterval(() => liveTimingStore.importArchivedResults(), LIVE_TIMING_IMPORT_EVERY_MS).unref();
});
