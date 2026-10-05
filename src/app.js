'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const { loadConfig } = require('./config');
const { openDatabase } = require('./db');
const createModels = require('./models');
const { SqliteSessionStore } = require('./lib/sessionStore');
const format = require('./lib/format');
const constants = require('./lib/constants');

/**
 * Construit l'application Express. Utilisé par server.js et par les tests
 * (qui passent une base en mémoire et une configuration dédiée).
 */
function createApp(options = {}) {
  const config = options.config || loadConfig();
  const db = options.db || openDatabase(config.databasePath);
  const models = createModels(db);
  const app = express();

  app.locals.config = config;
  app.locals.db = db;
  app.locals.models = models;
  app.locals.fmt = format;
  app.locals.C = constants;
  app.locals.gtmId = config.gtmId;
  app.locals.year = new Date().getFullYear();

  app.set('view engine', 'ejs');
  app.set('views', path.join(config.root, 'views'));
  app.set('trust proxy', config.trustProxy ? 1 : false);
  app.disable('x-powered-by');

  // En-têtes de sécurité. Aucune ressource externe n'est chargée, sauf GTM s'il est configuré
  // (et seulement après consentement, voir public/js/consent.js).
  const gtm = config.gtmId ? ['https://www.googletagmanager.com'] : [];
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", ...gtm],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', ...gtm, ...(config.gtmId ? ['https://www.google-analytics.com'] : [])],
        connectSrc: ["'self'", ...(config.gtmId ? ['https://www.google-analytics.com', 'https://*.google-analytics.com'] : [])],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameSrc: gtm.length ? gtm : ["'none'"],
        // Intégration en iframe autorisée uniquement pour les domaines listés dans FRAME_ANCESTORS.
        frameAncestors: config.frameAncestors,
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    xFrameOptions: false, // remplacé par frame-ancestors (CSP), qui permet de lister le site WordPress
    strictTransportSecurity: config.isProd ? undefined : false,
    crossOriginEmbedderPolicy: false,
  }));

  // Fichiers statiques
  const staticOpts = { maxAge: config.isProd ? '7d' : 0 };
  app.get('/js/lot-filter.js', (req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'lib', 'lotFilter.js')));
  app.use(express.static(path.join(config.root, 'public'), staticOpts));
  app.use('/assets', express.static(path.join(config.root, 'assets'), staticOpts));
  app.use('/uploads', express.static(config.uploadDir, { ...staticOpts, dotfiles: 'deny', index: false,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }));

  app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 200 }));

  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
  });

  // Pages publiques : aucun cookie n'est déposé.
  app.use('/', require('./routes/public')({ models, config }));

  // Back-office : sessions (cookie strictement nécessaire, uniquement sous /admin).
  const sessionMiddleware = session({
    name: 'vefa.sid',
    secret: config.sessionSecret,
    store: options.sessionStore || new SqliteSessionStore(db),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 8 * 60 * 60 * 1000, path: '/admin' },
  });
  app.use('/admin', helmet.contentSecurityPolicy({
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
    },
  }), (req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex'); next(); },
  sessionMiddleware, require('./routes/admin')({ models, config, db }));

  // 404
  app.use((req, res) => {
    res.status(404).render('public/error', { title: 'Page introuvable', status: 404, message: 'La page demandée n’existe pas ou n’est plus disponible.' });
  });

  // Gestion des erreurs : message clair, jamais de détail technique côté visiteur.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let status = err.status || err.statusCode || 500;
    let message = err.expose || status < 500 ? err.message : 'Une erreur est survenue. Merci de réessayer dans quelques instants.';
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      message = `Fichier trop volumineux (maximum ${Math.round(config.maxUploadBytes / 1024 / 1024)} Mo pour une image, 2 Mo pour un import).`;
    } else if (err.code && String(err.code).startsWith('LIMIT_')) {
      status = 400;
      message = 'Envoi refusé : trop de fichiers ou de champs.';
    } else if (err.type === 'entity.too.large') {
      status = 413;
      message = 'Les données envoyées sont trop volumineuses.';
    }
    if (status >= 500 && process.env.NODE_ENV !== 'test') console.error(err);
    const view = req.originalUrl.startsWith('/admin') && req.session && req.session.userId ? 'admin/error' : 'public/error';
    res.status(status).render(view, { title: 'Erreur', status, message });
  });

  return app;
}

module.exports = { createApp };
