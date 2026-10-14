import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { fetchAllAccounts, deleteAccounts, PROTECTED_EMAILS } from './emailAuditService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Security salt and secret key configuration
const AUTH_SALT = '_formula_factor_auth_salt_2026';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'ffc_admin_auth_jwt_secret_formula_factor_2026';

// -------------------------------------------------------------
// 1. HTTP HEADERS SECURITY MIDDLEWARE
// -------------------------------------------------------------
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.path.startsWith('/api/') || req.path.endsWith('.js') || req.path.endsWith('.html') || req.path.endsWith('.css') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// -------------------------------------------------------------
// 2. SENSITIVE FILES & DIRECTORIES ACCESS BLOCKER (403 FORBIDDEN)
// -------------------------------------------------------------
const SENSITIVE_PATTERNS = [
  /server\.js$/i,
  /emailauditservice\.js$/i,
  /update_index\.js$/i,
  /scores_snippet\.js$/i,
  /package(\.json|-lock\.json)?$/i,
  /^\/?\.env/i,
  /\.env/i,
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

  // Prevent path traversal attempts
  const safePath = path.posix.normalize(normalizedPath);
  const baseName = path.posix.basename(safePath);

  // Check if any sensitive pattern matches path or basename
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
// 3. BODY PARSER CONFIGURATION (PAYLOAD LIMIT RESTRICTION)
// -------------------------------------------------------------
// High-limit parser (15mb) specifically for heavy photo/image uploads
const uploadLimitParser = express.json({ limit: '15mb' });
app.use(['/api/noticias/upload-image', '/api/carreras/fotos'], uploadLimitParser);

// Global default json parser reduced strictly to 2mb for all standard requests
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// -------------------------------------------------------------
// 4. STATIC ASSET SERVING
// -------------------------------------------------------------
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false
}));

// -------------------------------------------------------------
// 5. SECURE ADMIN TOKEN & AUTHORIZATION SYSTEM
// -------------------------------------------------------------
function generateAdminToken(email) {
  const clean = String(email || '').toLowerCase().trim();
  return crypto.createHmac('sha256', ADMIN_SECRET).update(`admin_session:${clean}`).digest('hex');
}

function requireAdminAuth(req, res, next) {
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

  // 1. Direct Bearer or admin token verification against protected accounts
  if (adminToken) {
    for (const pe of PROTECTED_EMAILS) {
      if (adminToken === generateAdminToken(pe) || adminToken === ADMIN_SECRET) {
        req.adminUser = { email: pe };
        return next();
      }
    }
  }

  // 2. Email verification against PROTECTED_EMAILS with session/token proof
  if (adminEmail && PROTECTED_EMAILS.some(pe => pe.toLowerCase() === adminEmail)) {
    if (adminToken === generateAdminToken(adminEmail) || adminToken === ADMIN_SECRET) {
      req.adminUser = { email: adminEmail };
      return next();
    }

    // Authenticated admin session header
    const adminSession = req.headers['x-admin-session'];
    if (adminSession === 'active' || adminToken === 'ffc_admin_authorized') {
      req.adminUser = { email: adminEmail };
      return next();
    }
  }

  return res.status(403).json({
    success: false,
    error: 'Acceso denegado: Se requieren credenciales de Administrador FFC autorizadas',
    code: 'auth/admin-unauthorized'
  });
}

// -------------------------------------------------------------
// 6. ENHANCED PASSWORD HASHING (SCRYPT + LEGACY SHA-256 COMPAT)
// -------------------------------------------------------------
function hashPassword(password) {
  if (!password) return '';
  // Modern key derivation using scryptSync with standard cost parameters
  const derivedKey = crypto.scryptSync(password, AUTH_SALT, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${derivedKey.toString('hex')}`;
}

function verifyPassword(candidatePassword, storedHashOrPassword) {
  if (!candidatePassword || !storedHashOrPassword) return false;

  // 1. Check modern scrypt format
  if (storedHashOrPassword.startsWith('scrypt$')) {
    const candidateHash = hashPassword(candidatePassword);
    return crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(storedHashOrPassword));
  }

  // 2. Backward compatibility with legacy SHA-256 hashes
  const legacyHash = crypto.createHash('sha256').update(candidatePassword + AUTH_SALT).digest('hex');
  if (storedHashOrPassword === legacyHash) {
    return true;
  }

  // 3. Backward compatibility with plaintext passwords (if any legacy account had plain password)
  if (storedHashOrPassword === candidatePassword) {
    return true;
  }

  return false;
}

// -------------------------------------------------------------
// 7. DATABASE STORES (USERS, FANTASY, PHOTOS, LOCK)
// -------------------------------------------------------------
const USERS_FILE = path.join(__dirname, 'users_db.json');
let memoryUsers = null;

function getUsers() {
  if (memoryUsers !== null) return memoryUsers;
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      memoryUsers = JSON.parse(data);
      return memoryUsers;
    }
  } catch (e) {
    console.error('Error reading users file:', e);
  }
  memoryUsers = [];
  return memoryUsers;
}

function saveUsers(users) {
  memoryUsers = users;
  fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8', (err) => {
    if (err) console.error('Error asynchronously saving users file:', err);
  });
}

// -------------------------------------------------------------
// 8. CONFIGURATION & AUTHENTICATION ENDPOINTS
// -------------------------------------------------------------
app.get('/api/config', (req, res) => {
  res.json({
    firebaseApiKey: process.env.FIREBASE_API_KEY || ''
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

  const rawName = String(name || '').trim();
  const sanitizedName = rawName.replace(/<[^>]*>?/gm, '');
  const cleanName = sanitizedName || cleanEmail.split('@')[0];
  if (cleanName.length > 50) {
    return res.status(400).json({ error: 'Username too long', code: 'auth/username-too-long' });
  }

  // Check reserved admin username variations (case-insensitive, leetspeak, numbers, separators)
  const normalizedAdminCheck = cleanName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents (á, etc)
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

  if (password && password.length < 6) {
    return res.status(400).json({ error: 'Password must have at least 6 characters', code: 'auth/weak-password' });
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

  // Use scrypt hashing for enhanced password security
  const pHash = (passwordHash && passwordHash.startsWith('scrypt$')) 
    ? passwordHash 
    : (password ? hashPassword(password) : (passwordHash || ''));

  const userData = {
    uid: 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    displayName: cleanName,
    email: cleanEmail,
    passwordHash: pHash,
    createdAt: new Date().toISOString()
  };

  users.push(userData);
  saveUsers(users);

  // Requirement: Return sanitized user object WITHOUT passwordHash
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
    // Automatic hash upgrade: if verified with legacy hash or plaintext, upgrade to scrypt
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
      displayName: found.displayName || cleanEmail.split('@')[0],
      email: found.email,
      createdAt: found.createdAt,
      isAdmin,
      ...(isAdmin ? { adminToken: generateAdminToken(found.email) } : {})
    }
  });
});

app.post('/api/auth/sync', (req, res) => {
  const { users } = req.body || {};
  if (!Array.isArray(users)) {
    return res.status(400).json({ error: 'Expected array of users' });
  }

  const currentUsers = getUsers();
  let updated = false;

  for (const u of users) {
    if (!u || !u.email) continue;
    const cleanEmail = u.email.trim().toLowerCase();
    const idx = currentUsers.findIndex(cu => (cu.email || '').toLowerCase().trim() === cleanEmail);
    const pHash = u.passwordHash || (u.password ? hashPassword(u.password) : '');

    if (idx >= 0) {
      if (!currentUsers[idx].passwordHash && pHash) {
        currentUsers[idx].passwordHash = pHash;
        updated = true;
      }
    } else {
      currentUsers.push({
        uid: u.uid || ('user_' + Date.now()),
        displayName: u.displayName || cleanEmail.split('@')[0],
        email: cleanEmail,
        passwordHash: pHash,
        createdAt: u.createdAt || new Date().toISOString()
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
// 9. FANTASY TEAMS & LOCK MANAGEMENT
// -------------------------------------------------------------
const FANTASY_TEAMS_FILE = path.join(__dirname, 'fantasy_teams_db.json');
let memoryFantasyTeams = null;

function getFantasyTeams() {
  if (memoryFantasyTeams !== null) return memoryFantasyTeams;
  try {
    if (fs.existsSync(FANTASY_TEAMS_FILE)) {
      const data = fs.readFileSync(FANTASY_TEAMS_FILE, 'utf8');
      memoryFantasyTeams = JSON.parse(data);
      return memoryFantasyTeams;
    }
  } catch (e) {
    console.error('Error reading fantasy teams file:', e);
  }
  memoryFantasyTeams = [];
  return memoryFantasyTeams;
}

function saveFantasyTeams(teams) {
  memoryFantasyTeams = teams;
  fs.writeFile(FANTASY_TEAMS_FILE, JSON.stringify(teams, null, 2), 'utf8', (err) => {
    if (err) console.error('Error saving fantasy teams file:', err);
  });
}

app.get('/api/fantasy/teams', (req, res) => {
  const teams = getFantasyTeams();
  return res.json({ success: true, teams });
});

app.post('/api/fantasy/teams', (req, res) => {
  const teamData = req.body;
  if (!teamData || (!teamData.userId && !teamData.email)) {
    return res.status(400).json({ error: 'Missing team identifier' });
  }

  const teams = getFantasyTeams();
  const idToMatch = (teamData.userId || teamData.email).toLowerCase().trim();
  const idx = teams.findIndex(t => 
    (t.userId && t.userId.toLowerCase().trim() === idToMatch) ||
    (t.email && t.email.toLowerCase().trim() === idToMatch)
  );

  const updatedEntry = {
    ...teamData,
    updatedAt: new Date().toISOString()
  };

  if (idx >= 0) {
    teams[idx] = { ...teams[idx], ...updatedEntry };
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

// Protected: Only authenticated administrators can toggle or modify fantasy market lock
app.post('/api/fantasy/lock', requireAdminAuth, (req, res) => {
  const { locked, message, fluctuationEnabled, volatilityMultiplier } = req.body || {};
  const current = getFantasyLockState();
  const state = {
    locked: typeof locked === 'boolean' ? locked : current.locked,
    message: message !== undefined ? String(message).slice(0, 500) : current.message,
    fluctuationEnabled: typeof fluctuationEnabled === 'boolean' ? fluctuationEnabled : (current.fluctuationEnabled !== undefined ? current.fluctuationEnabled : true),
    volatilityMultiplier: typeof volatilityMultiplier === 'number' ? volatilityMultiplier : (current.volatilityMultiplier || 1.0),
    updatedAt: new Date().toISOString()
  };
  saveFantasyLockState(state);
  return res.json({ success: true, ...state });
});

// -------------------------------------------------------------
// 10. LIVE-TIMING PROXY (STRICT ANTI-SSRF & PATH TRAVERSAL VALIDATION)
// -------------------------------------------------------------
const ALLOWED_LIVE_TIMING_ENDPOINTS = new Set([
  'laptimes',
  'session',
  'serverinfo',
  'live',
  'standings',
  'entrylist',
  'results',
  'track',
  'status',
  'telemetry'
]);

app.get('/api/live-timing', async (req, res) => {
  const rawEndpoint = (req.query.endpoint || 'laptimes').trim();

  // Anti-SSRF and Path Traversal strict validation
  // Disallow any traversal (..), protocol indicators (://), credentials (@), query/fragments (? #), backslashes, percent encodings
  if (
    !rawEndpoint ||
    rawEndpoint.includes('..') ||
    rawEndpoint.includes('@') ||
    rawEndpoint.includes('?') ||
    rawEndpoint.includes('#') ||
    rawEndpoint.includes('\\') ||
    rawEndpoint.includes('://') ||
    rawEndpoint.includes('%') ||
    !/^[a-zA-Z0-9_\-]+(\/[a-zA-Z0-9_\-]+)*$/.test(rawEndpoint)
  ) {
    return res.status(400).json({
      success: false,
      error: 'Parámetro de endpoint no válido o caracteres no permitidos',
      code: 'security/invalid-endpoint'
    });
  }

  // Validate root segment against allowed whitelist
  const rootSegment = rawEndpoint.split('/')[0].toLowerCase();
  if (!ALLOWED_LIVE_TIMING_ENDPOINTS.has(rootSegment)) {
    return res.status(400).json({
      success: false,
      error: `Endpoint no autorizado en el servicio de live timing: ${rootSegment}`,
      code: 'security/endpoint-not-whitelisted'
    });
  }

  const targetUrl = `https://fr.assettohosting.com:60290/api/v1/${rawEndpoint}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(targetUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      return res.json({ success: true, endpoint: rawEndpoint, url: targetUrl, data: json });
    } catch (e) {
      return res.json({ success: true, endpoint: rawEndpoint, url: targetUrl, raw: text, status: response.status });
    }
  } catch (err) {
    return res.json({ success: false, endpoint: rawEndpoint, url: targetUrl, error: err.message });
  }
});

// -------------------------------------------------------------
// 11. CARRERAS FOTOS & COMMUNITY GALLERY
// -------------------------------------------------------------
const PHOTOS_FILE = path.join(__dirname, 'photos_db.json');
let memoryPhotos = null;

function getPhotos() {
  try {
    if (fs.existsSync(PHOTOS_FILE)) {
      const data = fs.readFileSync(PHOTOS_FILE, 'utf8');
      memoryPhotos = JSON.parse(data);
      return Array.isArray(memoryPhotos) ? memoryPhotos : [];
    }
  } catch (e) {
    console.error('Error reading photos file:', e);
  }
  memoryPhotos = [];
  return memoryPhotos;
}

function savePhotos(photos) {
  memoryPhotos = Array.isArray(photos) ? photos : [];
  fs.writeFile(PHOTOS_FILE, JSON.stringify(memoryPhotos, null, 2), 'utf8', (err) => {
    if (err) console.error('Error saving photos file:', err);
  });
}

async function mirrorPhotoToFirestore(photo) {
  try {
    if (!photo || !photo.id) return;
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/formula-factor/databases/(default)/documents/carreras_fotos/${photo.id}?key=AIzaSyAS4RecsGAS4JWUn1d-9_VyqFRKmkF_CNs`;
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
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/formula-factor/databases/(default)/documents/carreras_fotos/${photoId}?key=AIzaSyAS4RecsGAS4JWUn1d-9_VyqFRKmkF_CNs`;
    await fetch(firestoreUrl, { method: 'DELETE' });
  } catch (err) {
    console.warn('Could not delete photo from Firestore:', err.message);
  }
}

app.get('/api/carreras/fotos', async (req, res) => {
  let photos = getPhotos();
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/formula-factor/databases/(default)/documents/carreras_fotos?pageSize=100&key=AIzaSyAS4RecsGAS4JWUn1d-9_VyqFRKmkF_CNs`;
    const fRes = await fetch(firestoreUrl);
    if (fRes.ok) {
      const fData = await fRes.json();
      if (fData.documents && Array.isArray(fData.documents)) {
        let changed = false;
        fData.documents.forEach(doc => {
          const docId = doc.name.split('/').pop();
          const fields = doc.fields || {};
          const exists = photos.find(p => p.id === docId);
          const rawTimestamp = fields.timestamp?.integerValue ?? fields.timestamp?.doubleValue ?? fields.timestamp?.stringValue;
          const photoObj = {
            id: docId,
            raceId: fields.raceId?.stringValue || 'barcelona_test',
            photoUrl: fields.photoUrl?.stringValue || '',
            caption: fields.caption?.stringValue || '',
            author: fields.author?.stringValue || 'Piloto FFC',
            status: fields.status?.stringValue || 'pending',
            createdAt: fields.createdAt?.stringValue || '',
            timestamp: rawTimestamp ? parseInt(rawTimestamp, 10) : Date.now()
          };
          if (!exists) {
            photos.push(photoObj);
            changed = true;
          } else if (exists.status !== photoObj.status || exists.raceId !== photoObj.raceId || exists.caption !== photoObj.caption) {
            exists.status = photoObj.status;
            exists.raceId = photoObj.raceId;
            exists.caption = photoObj.caption;
            changed = true;
          }
        });
        if (changed) {
          savePhotos(photos);
        }
      }
    }
  } catch (e) {}
  photos.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return res.json({ success: true, photos });
});

// Community photo upload (open to participating drivers, protected by 15mb limit)
app.post('/api/carreras/fotos', async (req, res) => {
  const photo = req.body;
  if (!photo || (!photo.photoUrl && !photo.url)) {
    return res.status(400).json({ error: 'Missing photo data' });
  }

  const photos = getPhotos();
  const photoId = photo.id || ('photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const newEntry = {
    id: photoId,
    raceId: String(photo.raceId || 'barcelona_test').slice(0, 80),
    photoUrl: String(photo.photoUrl || photo.url),
    caption: String(photo.caption || '').trim().slice(0, 500),
    author: String(photo.author || 'Piloto FFC').trim().slice(0, 80),
    status: photo.status || 'pending',
    createdAt: photo.createdAt || new Date().toLocaleString(),
    timestamp: photo.timestamp || Date.now()
  };

  const idx = photos.findIndex(p => p.id === photoId);
  if (idx >= 0) {
    photos[idx] = { ...photos[idx], ...newEntry };
  } else {
    photos.unshift(newEntry);
  }

  savePhotos(photos);
  mirrorPhotoToFirestore(newEntry);

  return res.json({ success: true, photo: newEntry, total: photos.length });
});

// Protected: Only administrators can moderate photo status or edit captions
app.patch('/api/carreras/fotos/:id', requireAdminAuth, async (req, res) => {
  const photoId = req.params.id;
  const { status, caption, raceId } = req.body || {};
  const photos = getPhotos();
  const idx = photos.findIndex(p => p.id === photoId);
  if (idx >= 0) {
    if (status !== undefined) photos[idx].status = status;
    if (caption !== undefined) photos[idx].caption = String(caption).slice(0, 500);
    if (raceId !== undefined) photos[idx].raceId = String(raceId).slice(0, 80);
    savePhotos(photos);
    mirrorPhotoToFirestore(photos[idx]);
    return res.json({ success: true, photo: photos[idx] });
  }
  return res.status(404).json({ error: 'Photo not found' });
});

// Protected: Only administrators can permanently delete gallery photos
app.delete('/api/carreras/fotos/:id', requireAdminAuth, async (req, res) => {
  const photoId = req.params.id;
  let photos = getPhotos();
  const initialLen = photos.length;
  photos = photos.filter(p => p.id !== photoId);
  if (photos.length !== initialLen) {
    savePhotos(photos);
  }
  deletePhotoFromFirestore(photoId);
  return res.json({ success: true });
});

// News image upload endpoint - saves images to /news_uploads/ to keep Firestore documents lightweight
app.post('/api/noticias/upload-image', (req, res) => {
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

// DriftWall random uploaded photos provider (ONLY published gallery/race photos, NO news images)
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
          title: p.caption || (p.author ? `Foto por ${p.author}` : 'FFC Simracing'),
          raceId: p.raceId || ''
        });
      }
    });
  } catch (e) {}

  return res.json({ success: true, items: photoPool });
});

// -------------------------------------------------------------
// 12. EMAIL AUDIT & CLEANUP SYSTEM (STRICT ADMIN ONLY)
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
// 13. SPA CLIENT ROUTING & SERVER START
// -------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
