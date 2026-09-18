import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(__dirname));

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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
