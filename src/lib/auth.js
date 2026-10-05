'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = 12;

function hashPassword(pw) { return bcrypt.hash(pw, BCRYPT_ROUNDS); }

// Hachage factice pour que la durée de réponse soit identique quand l'utilisateur n'existe pas.
let dummyHash;
async function verifyCredentials(users, email, password) {
  const user = users.findByEmail(String(email || '').trim());
  if (!dummyHash) dummyHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);
  const ok = await bcrypt.compare(String(password || ''), user ? user.password_hash : dummyHash);
  return ok && user ? user : null;
}

/** Crée le compte administrateur initial à partir du .env si aucun compte n'existe encore. */
async function ensureInitialAdmin(users, config, log = console) {
  if (users.count() > 0) return null;
  const email = config.adminEmail;
  if (!email) {
    log.warn('[admin] Aucun compte et ADMIN_EMAIL absent du .env : le back-office est inaccessible.');
    return null;
  }
  let password = config.adminPassword;
  let generated = false;
  if (!password) {
    password = crypto.randomBytes(12).toString('base64url');
    generated = true;
  } else if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD doit contenir au moins 12 caractères.');
  }
  users.create(email, await hashPassword(password));
  if (generated) {
    log.warn(`[admin] Compte créé : ${email}. Mot de passe généré (affiché une seule fois) : ${password}`);
  } else {
    log.info(`[admin] Compte administrateur créé pour ${email} (mot de passe issu du .env).`);
  }
  return { email, generated };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/connexion');
}

module.exports = { hashPassword, verifyCredentials, ensureInitialAdmin, requireAuth, BCRYPT_ROUNDS };
