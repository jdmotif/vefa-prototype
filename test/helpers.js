'use strict';
process.env.NODE_ENV = 'test';
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { loadConfig } = require('../src/config');
const { seed } = require('../src/scripts/seed');
const createModels = require('../src/models');
const { hashPassword } = require('../src/lib/auth');

const SECRET = 'secret-de-test-uniquement-0123456789abcdef';

/** Application de test : base en mémoire, données de démo, compte admin de test. */
async function makeApp({ withSeed = true, leadMax = 100 } = {}) {
  const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vefa-test-'));
  const config = loadConfig({ sessionSecret: SECRET, uploadDir, databasePath: ':memory:', leadRateLimit: { windowMs: 60000, max: leadMax } });
  const db = openDatabase(':memory:');
  if (withSeed) seed(db, { quiet: true, publicDir: path.join(uploadDir, 'public') });
  const models = createModels(db);
  models.users.create('admin@exemple.fr', await hashPassword('mot-de-passe-de-test'));
  const app = createApp({ config, db, sessionStore: new session.MemoryStore() });
  return { app, db, models, config };
}

/** Jeton de formulaire valide, daté de 10 secondes (passe le délai minimum anti-robot). */
function formToken(ageMs = 10000) {
  const ts = Date.now() - ageMs;
  const sig = crypto.createHmac('sha256', SECRET).update(`lead:${ts}`).digest('base64url');
  return `${ts}.${sig}`;
}

module.exports = { makeApp, formToken, SECRET };
