import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Centralized API Key constant
export const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAS4RecsGAs4JWUn1d-9_VyqfRKmkF_CNs';

// Protected administrative accounts that MUST NEVER be flagged as fake or deleted
export const PROTECTED_EMAILS = [
  'enzo.castillo.lomb@gmail.com',
  'formulafactorchampionship@gmail.com'
];

// Comprehensive list of known disposable, temporary, and burner email domains
export const DISPOSABLE_DOMAINS = new Set([
  'sharklasers.com',
  'guerrillamail.com',
  'guerrillamailblock.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'grr.la',
  'pokemail.net',
  'spam4.me',
  'mailinator.com',
  'yopmail.com',
  'yopmail.net',
  'yopmail.fr',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  '10minutemail.com',
  '10minutemail.net',
  'throwawaymail.com',
  'nada.ltd',
  'getnada.com',
  'inboxkitten.com',
  'trashmail.com',
  'trashmail.net',
  'trashmail.me',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mohmal.com',
  'getairmail.com',
  'burnermail.io',
  'tempr.email',
  'mailcatch.com',
  'disposablemail.com',
  'mytemp.email',
  'generator.email',
  'emailondeck.com',
  'tempail.com',
  'dropmail.me',
  'fakemailgenerator.com',
  'crazymailing.com',
  'mytempemail.com',
  'incognitomail.org',
  'discard.email',
  'discardmail.com',
  'spambog.com',
  'trashymail.com',
  'mailforspam.com',
  'safetymail.info',
  'mailnesia.com',
  'tempinbox.com',
  'filzmail.com',
  'armyspy.com',
  'cuvox.de',
  'dayrep.com',
  'fleckens.hu',
  'gustr.com',
  'jourrapide.com',
  'rhyta.com',
  'superrito.com',
  'teleworm.us',
  'einrot.com'
]);

// Known dummy, reserved, test, or fabricated domains
export const DUMMY_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.edu',
  'test.com',
  'test.org',
  'test.net',
  'test.es',
  'prueba.com',
  'prueba.es',
  'invalid',
  'localhost',
  'admin.com',
  'marc.com',
  'gmasdas.com',
  'e.com',
  'w.com',
  'asdf.com',
  'qwer.com',
  'xyz.com',
  'fake.com',
  'temp.com',
  'dummy.com',
  'null.com',
  'random.com',
  'nobody.com'
]);

// Common legitimate email providers
export const COMMON_VALID_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.es',
  'outlook.com',
  'outlook.es',
  'live.com',
  'yahoo.com',
  'yahoo.es',
  'proton.me',
  'protonmail.com',
  'icloud.com',
  'me.com',
  'mac.com'
]);

// Helper to check suspicious local patterns
function isSuspiciousLocalPart(localPart) {
  if (!localPart) return false;
  const lower = localPart.toLowerCase();

  if (/^(asdf|qwer|zxcv|dfbdf|test|fake|prueba|dummy|spam|temp|random|nobody)/i.test(lower)) {
    return true;
  }

  if (/^([a-z0-9])\1*$/i.test(lower) && lower.length < 5) {
    return true;
  }

  if (lower.length >= 4 && !/[aeiouy0-9]/i.test(lower)) {
    return true;
  }

  return false;
}

function isSuspiciousDomain(domain) {
  if (!domain) return { isSuspicious: true, reason: 'Dominio ausente' };
  const dLower = domain.toLowerCase().trim();

  if (DISPOSABLE_DOMAINS.has(dLower)) {
    return { isSuspicious: true, category: 'disposable', reason: `Servicio de correo desechable / temporal (${dLower})` };
  }

  if (DUMMY_DOMAINS.has(dLower)) {
    return { isSuspicious: true, category: 'dummy_domain', reason: `Dominio simulado / de prueba no válido (${dLower})` };
  }

  const parts = dLower.split('.');
  if (parts.length >= 2 && parts[0].length === 1) {
    return { isSuspicious: true, category: 'dummy_domain', reason: `Dominio de un solo carácter (${dLower})` };
  }

  if (dLower.includes('gmasdas') || dLower.includes('asdf') || dLower.includes('fake')) {
    return { isSuspicious: true, category: 'dummy_domain', reason: `Dominio irregular / simulado (${dLower})` };
  }

  return { isSuspicious: false };
}

export function auditAccount(account) {
  const email = (account.email || '').trim().toLowerCase();
  const name = (account.displayName || account.managerName || '').trim();

  if (PROTECTED_EMAILS.some(pe => pe.toLowerCase() === email)) {
    return {
      status: 'clean',
      risk: 'safe',
      category: 'protected_admin',
      isProtected: true,
      reason: 'Cuenta oficial de Administración FFC (Protegida contra eliminación)',
      badge: 'ADMIN OFICIAL'
    };
  }

  // Prevent orphaned or corrupted ghost records
  if (!email || email.length < 5 || !email.includes('@')) {
    return {
      status: 'suspicious',
      risk: 'danger',
      category: 'corrupted',
      isProtected: false,
      reason: 'Registro vacío, huérfano o sin dirección de correo válida',
      badge: 'CORRUPTO'
    };
  }

  const [localPart, domainPart] = email.split('@');
  if (!localPart || !domainPart) {
    return {
      status: 'suspicious',
      risk: 'danger',
      category: 'test_pattern',
      isProtected: false,
      reason: 'Formato de correo electrónico inválido o malformado',
      badge: 'CORREO INVÁLIDO'
    };
  }

  const redFlags = [];
  let category = 'clean';
  let badge = 'LIMPIO';

  const domainCheck = isSuspiciousDomain(domainPart);
  if (domainCheck.isSuspicious) {
    redFlags.push(domainCheck.reason);
    category = domainCheck.category || 'dummy_domain';
    badge = domainCheck.category === 'disposable' ? 'DESECHABLE' : 'DOMINIO FALSO';
  }

  if (/<script/i.test(name) || /onerror=/i.test(name) || /alert\(/i.test(name) || /<[^>]+>/i.test(name)) {
    redFlags.push('Inyección de código / script malicioso detectado en el nombre');
    category = 'test_pattern';
    badge = 'CÓDIGO / XSS';
  }

  if (localPart === 'admin' || domainPart === 'admin.com') {
    redFlags.push('Cuenta de prueba con palabra reservada admin no autorizada');
    if (category === 'clean') {
      category = 'test_pattern';
      badge = 'ADMIN FALSO';
    }
  }

  if (isSuspiciousLocalPart(localPart)) {
    redFlags.push(`Patrón sintáctico sospechoso / teclado de prueba ("${localPart}@")`);
    if (category === 'clean') {
      category = 'test_pattern';
      badge = 'PATRÓN PRUEBA';
    }
  }

  if (redFlags.length > 0) {
    return {
      status: 'suspicious',
      risk: 'danger',
      category: category,
      isProtected: false,
      reason: redFlags.join(' · '),
      badge: badge
    };
  }

  return {
    status: 'clean',
    risk: 'safe',
    category: 'clean',
    isProtected: false,
    reason: `Dominio legítimo (${domainPart}) y formato de usuario verificado`,
    badge: 'LIMPIO'
  };
}

export async function fetchAllAccounts() {
  const accountsMap = new Map();

  // 1. Fetch from Firestore 'usuarios' collection using centralized API key
  try {
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/formula-factor/databases/(default)/documents/usuarios?pageSize=300&key=${FIREBASE_API_KEY}`;
    const res = await fetch(firestoreUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.documents && Array.isArray(data.documents)) {
        data.documents.forEach(doc => {
          const docId = doc.name.split('/').pop();
          const f = doc.fields || {};
          const email = (f.email?.stringValue || '').trim().toLowerCase();
          const name = f.displayName?.stringValue || f.claimedDriver?.stringValue || '';
          const createdAt = f.createdAt?.stringValue || '';
          const isVerified = f.isVerified?.booleanValue || false;

          // Skip corrupted or empty records lacking valid email
          if (!email || !email.includes('@')) return;

          const key = email;
          const existing = accountsMap.get(key) || {
            key,
            email: email,
            displayName: name,
            createdAt: createdAt,
            isVerified: isVerified,
            sources: []
          };

          if (name && !existing.displayName) existing.displayName = name;
          if (createdAt && !existing.createdAt) existing.createdAt = createdAt;
          existing.firestoreDocId = docId;
          if (!existing.sources.includes('Firestore')) existing.sources.push('Firestore');

          accountsMap.set(key, existing);
        });
      }
    }
  } catch (err) {
    console.error('Error fetching Firestore usuarios for audit:', err.message);
  }

  // 2. Fetch from local fantasy_teams_db.json
  try {
    const teamsFile = path.join(__dirname, 'fantasy_teams_db.json');
    if (fs.existsSync(teamsFile)) {
      const teams = JSON.parse(fs.readFileSync(teamsFile, 'utf8'));
      if (Array.isArray(teams)) {
        teams.forEach(team => {
          const email = (team.email || '').trim().toLowerCase();
          if (!email || !email.includes('@')) return;
          const key = email;

          const existing = accountsMap.get(key) || {
            key,
            email: email,
            displayName: team.managerName || team.teamName || '',
            createdAt: team.updatedAt || '',
            isVerified: false,
            sources: []
          };

          if (!existing.displayName && team.managerName) existing.displayName = team.managerName;
          existing.fantasyTeamId = team.id || team.userId || '';
          existing.teamName = team.teamName || '';
          if (!existing.sources.includes('Fantasy DB')) existing.sources.push('Fantasy DB');

          accountsMap.set(key, existing);
        });
      }
    }
  } catch (err) {
    console.error('Error fetching fantasy teams for audit:', err.message);
  }

  // 3. Fetch from local users_db.json
  try {
    const usersFile = path.join(__dirname, 'users_db.json');
    if (fs.existsSync(usersFile)) {
      const users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      if (Array.isArray(users)) {
        users.forEach(u => {
          const email = (u.email || '').trim().toLowerCase();
          if (!email || !email.includes('@')) return;
          const key = email;

          const existing = accountsMap.get(key) || {
            key,
            email: email,
            displayName: u.displayName || '',
            createdAt: u.createdAt || '',
            isVerified: false,
            sources: []
          };

          if (!existing.displayName && u.displayName) existing.displayName = u.displayName;
          existing.userUid = u.uid || '';
          if (!existing.sources.includes('Users DB')) existing.sources.push('Users DB');

          accountsMap.set(key, existing);
        });
      }
    }
  } catch (err) {
    console.error('Error fetching users DB for audit:', err.message);
  }

  const accountList = Array.from(accountsMap.values()).map(acc => {
    const auditRes = auditAccount(acc);
    return {
      ...acc,
      ...auditRes
    };
  });

  return accountList;
}

export function createBackupSnapshot(data, label = 'audit_cleanup') {
  try {
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup_${label}_${timestamp}.json`;
    const fullPath = path.join(backupDir, filename);

    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf8');
    return { success: true, filename, timestamp };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function deleteAccounts(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { success: false, error: 'No accounts provided for deletion' };
  }

  const validTargets = targets.filter(t => {
    const email = (t.email || '').toLowerCase().trim();
    return !PROTECTED_EMAILS.some(pe => pe.toLowerCase() === email);
  });

  if (validTargets.length === 0) {
    return { success: false, error: 'Cannot delete protected administrator accounts' };
  }

  const allCurrentAccounts = await fetchAllAccounts();
  const backupRes = createBackupSnapshot({
    timestamp: new Date().toISOString(),
    targetsToDelete: validTargets,
    fullAccountsSnapshot: allCurrentAccounts
  }, 'before_email_cleanup');

  const deletedSummary = [];
  const errors = [];

  const emailsToDelete = new Set(validTargets.map(t => (t.email || '').toLowerCase().trim()).filter(Boolean));
  const firestoreDocsToDelete = new Set(validTargets.map(t => t.firestoreDocId).filter(Boolean));
  const fantasyTeamsToDelete = new Set(validTargets.map(t => t.fantasyTeamId).filter(Boolean));
  const userUidsToDelete = new Set(validTargets.map(t => t.userUid).filter(Boolean));

  for (const docId of firestoreDocsToDelete) {
    if (!docId || !/^[a-zA-Z0-9_.\-]+$/.test(docId)) continue;
    try {
      const deleteUrl = `https://firestore.googleapis.com/v1/projects/formula-factor/databases/(default)/documents/usuarios/${encodeURIComponent(docId)}?key=${FIREBASE_API_KEY}`;
      const res = await fetch(deleteUrl, { method: 'DELETE' });
      if (res.ok) {
        deletedSummary.push({ type: 'firestore', docId });
      } else {
        errors.push(`Firestore doc ${docId}: HTTP ${res.status}`);
      }
    } catch (e) {
      errors.push(`Firestore doc ${docId}: ${e.message}`);
    }
  }

  for (const email of emailsToDelete) {
    const altDocId1 = email.replace(/[@.]/g, '_');
    const altDocId2 = email.replace('@', '_');
    for (const altId of [altDocId1, altDocId2]) {
      if (!/^[a-zA-Z0-9_.\-]+$/.test(altId)) continue;
      if (!firestoreDocsToDelete.has(altId)) {
        try {
          const deleteUrl = `https://firestore.googleapis.com/v1/projects/formula-factor/databases/(default)/documents/usuarios/${encodeURIComponent(altId)}?key=${FIREBASE_API_KEY}`;
          await fetch(deleteUrl, { method: 'DELETE' });
        } catch (e) {}
      }
    }
  }

  try {
    const teamsFile = path.join(__dirname, 'fantasy_teams_db.json');
    if (fs.existsSync(teamsFile)) {
      let teams = JSON.parse(fs.readFileSync(teamsFile, 'utf8'));
      if (Array.isArray(teams)) {
        const initialCount = teams.length;
        teams = teams.filter(t => {
          const tEmail = (t.email || '').toLowerCase().trim();
          const tId = t.id || t.userId || '';
          if (emailsToDelete.has(tEmail)) return false;
          if (fantasyTeamsToDelete.has(tId)) return false;
          return true;
        });
        if (teams.length !== initialCount) {
          fs.writeFileSync(teamsFile, JSON.stringify(teams, null, 2), 'utf8');
          deletedSummary.push({ type: 'fantasy_teams', removed: initialCount - teams.length });
        }
      }
    }
  } catch (e) {
    errors.push(`fantasy_teams_db error: ${e.message}`);
  }

  try {
    const usersFile = path.join(__dirname, 'users_db.json');
    if (fs.existsSync(usersFile)) {
      let users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
      if (Array.isArray(users)) {
        const initialCount = users.length;
        users = users.filter(u => {
          const uEmail = (u.email || '').toLowerCase().trim();
          const uid = u.uid || '';
          if (emailsToDelete.has(uEmail)) return false;
          if (userUidsToDelete.has(uid)) return false;
          return true;
        });
        if (users.length !== initialCount) {
          fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
          deletedSummary.push({ type: 'users_db', removed: initialCount - users.length });
        }
      }
    }
  } catch (e) {
    errors.push(`users_db error: ${e.message}`);
  }

  return {
    success: true,
    deletedCount: validTargets.length,
    deletedSummary,
    errors: errors.length > 0 ? errors : undefined,
    backupFile: backupRes.filename
  };
}
