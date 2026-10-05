'use strict';
const path = require('path');
const crypto = require('crypto');

try { require('dotenv').config({ quiet: true }); } catch (_) { /* .env facultatif */ }

const ROOT = path.resolve(__dirname, '..');

function resolveFromRoot(p, fallback) {
  return path.resolve(ROOT, p || fallback);
}

function loadConfig(overrides = {}) {
  const env = process.env;
  const isProd = (overrides.env || env.NODE_ENV) === 'production';

  let sessionSecret = overrides.sessionSecret || env.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProd) {
      throw new Error('SESSION_SECRET est obligatoire en production (voir .env.example).');
    }
    sessionSecret = crypto.randomBytes(32).toString('hex');
  }

  return {
    root: ROOT,
    env: isProd ? 'production' : 'development',
    isProd,
    port: Number(env.PORT) || 3000,
    publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
    sessionSecret,
    // En développement, un identifiant par défaut permet de tester sans .env (mot de passe généré au démarrage).
    adminEmail: env.ADMIN_EMAIL || (isProd ? '' : 'admin@exemple.fr'),
    adminPassword: env.ADMIN_PASSWORD || '',
    databasePath: resolveFromRoot(env.DATABASE_PATH, './data/vefa.sqlite'),
    uploadDir: resolveFromRoot(env.UPLOAD_DIR, './uploads'),
    maxUploadBytes: (Number(env.MAX_UPLOAD_MB) || 5) * 1024 * 1024,
    frameAncestors: (env.FRAME_ANCESTORS || "'self'").split(/\s+/).filter(Boolean),
    trustProxy: env.TRUST_PROXY === 'true',
    gtmId: /^GTM-[A-Z0-9]{4,12}$/.test(env.GTM_ID || '') ? env.GTM_ID : '',
    seedOnEmpty: env.SEED_ON_EMPTY !== 'false' && !isProd,
    // Limites anti-spam du formulaire de contact
    leadRateLimit: { windowMs: 15 * 60 * 1000, max: Number(env.LEAD_RATE_MAX) || 5 },
    ...overrides,
  };
}

module.exports = { loadConfig, ROOT };
