import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.path.startsWith('/api/') || req.path.endsWith('.js') || req.path.endsWith('.html') || req.path.endsWith('.css') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(__dirname, {
  etag: false,
  lastModified: false
}));

const USERS_FILE = path.join(__dirname, 'users_db.json');

function getUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading users file:', e);
  }
  return [];
}

function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving users file:', e);
  }
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password + '_formula_factor_auth_salt_2026').digest('hex');
}

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

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (name || '').trim() || cleanEmail.split('@')[0];
  const users = getUsers();

  const existingIdx = users.findIndex(u => (u.email || '').toLowerCase().trim() === cleanEmail);
  const pHash = passwordHash || hashPassword(password);

  const userData = {
    uid: existingIdx >= 0 ? users[existingIdx].uid : ('user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
    displayName: cleanName,
    email: cleanEmail,
    passwordHash: pHash,
    createdAt: existingIdx >= 0 ? users[existingIdx].createdAt : new Date().toISOString()
  };

  if (existingIdx >= 0) {
    users[existingIdx] = { ...users[existingIdx], ...userData };
  } else {
    users.push(userData);
  }

  saveUsers(users);
  return res.json({ success: true, user: userData });
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

  const pHash = passwordHash || (password ? hashPassword(password) : '');
  const match = (found.passwordHash && found.passwordHash === pHash) || (found.password && found.password === password);

  if (!match) {
    return res.status(401).json({ error: 'Wrong password', code: 'auth/wrong-password' });
  }

  return res.json({
    success: true,
    user: {
      uid: found.uid,
      displayName: found.displayName || cleanEmail.split('@')[0],
      email: found.email,
      createdAt: found.createdAt
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

const FANTASY_TEAMS_FILE = path.join(__dirname, 'fantasy_teams_db.json');

function getFantasyTeams() {
  try {
    if (fs.existsSync(FANTASY_TEAMS_FILE)) {
      const data = fs.readFileSync(FANTASY_TEAMS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading fantasy teams file:', e);
  }
  return [];
}

function saveFantasyTeams(teams) {
  try {
    fs.writeFileSync(FANTASY_TEAMS_FILE, JSON.stringify(teams, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving fantasy teams file:', e);
  }
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

function getFantasyLockState() {
  try {
    if (fs.existsSync(FANTASY_LOCK_FILE)) {
      const data = fs.readFileSync(FANTASY_LOCK_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading fantasy lock file:', e);
  }
  return {
    locked: false,
    message: "Mercado cerrado temporalmente por Gran Premio en curso.",
    fluctuationEnabled: true,
    volatilityMultiplier: 1.0
  };
}

function saveFantasyLockState(state) {
  try {
    fs.writeFileSync(FANTASY_LOCK_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving fantasy lock file:', e);
  }
}

app.get('/api/fantasy/lock', (req, res) => {
  const state = getFantasyLockState();
  return res.json({ success: true, ...state });
});

app.post('/api/fantasy/lock', (req, res) => {
  const { locked, message, fluctuationEnabled, volatilityMultiplier } = req.body || {};
  const current = getFantasyLockState();
  const state = {
    locked: typeof locked === 'boolean' ? locked : current.locked,
    message: message !== undefined ? message : current.message,
    fluctuationEnabled: typeof fluctuationEnabled === 'boolean' ? fluctuationEnabled : (current.fluctuationEnabled !== undefined ? current.fluctuationEnabled : true),
    volatilityMultiplier: typeof volatilityMultiplier === 'number' ? volatilityMultiplier : (current.volatilityMultiplier || 1.0),
    updatedAt: new Date().toISOString()
  };
  saveFantasyLockState(state);
  return res.json({ success: true, ...state });
});

app.get('/api/live-timing', async (req, res) => {
  const endpoint = (req.query.endpoint || 'laptimes').trim();
  const targetUrl = `https://fr.assettohosting.com:60290/api/v1/${endpoint}`;
  try {
    const response = await fetch(targetUrl);
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      return res.json({ success: true, endpoint, url: targetUrl, data: json });
    } catch (e) {
      return res.json({ success: true, endpoint, url: targetUrl, raw: text, status: response.status });
    }
  } catch (err) {
    return res.json({ success: false, endpoint, url: targetUrl, error: err.message });
  }
});

const PHOTOS_FILE = path.join(__dirname, 'photos_db.json');

function getPhotos() {
  try {
    if (fs.existsSync(PHOTOS_FILE)) {
      const data = fs.readFileSync(PHOTOS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading photos file:', e);
  }
  return [];
}

function savePhotos(photos) {
  try {
    fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving photos file:', e);
  }
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
          } else if (exists.status !== photoObj.status) {
            exists.status = photoObj.status;
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

app.post('/api/carreras/fotos', async (req, res) => {
  const photo = req.body;
  if (!photo || (!photo.photoUrl && !photo.url)) {
    return res.status(400).json({ error: 'Missing photo data' });
  }

  const photos = getPhotos();
  const photoId = photo.id || ('photo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
  const newEntry = {
    id: photoId,
    raceId: photo.raceId || 'barcelona_test',
    photoUrl: photo.photoUrl || photo.url,
    caption: (photo.caption || '').trim(),
    author: (photo.author || 'Piloto FFC').trim(),
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

app.patch('/api/carreras/fotos/:id', async (req, res) => {
  const photoId = req.params.id;
  const { status, caption } = req.body || {};
  const photos = getPhotos();
  const idx = photos.findIndex(p => p.id === photoId);
  if (idx >= 0) {
    if (status !== undefined) photos[idx].status = status;
    if (caption !== undefined) photos[idx].caption = caption;
    savePhotos(photos);
    mirrorPhotoToFirestore(photos[idx]);
    return res.json({ success: true, photo: photos[idx] });
  }
  if (status !== undefined) {
    mirrorPhotoToFirestore({ id: photoId, status });
  }
  return res.json({ success: true, photo: { id: photoId, status } });
});

app.delete('/api/carreras/fotos/:id', async (req, res) => {
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
