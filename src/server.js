'use strict';
const { loadConfig } = require('./config');
const { openDatabase } = require('./db');
const { createApp } = require('./app');
const createModels = require('./models');
const { ensureInitialAdmin } = require('./lib/auth');
const { seed } = require('./scripts/seed');

async function main() {
  const config = loadConfig();
  if (!config.isProd && !process.env.SESSION_SECRET) {
    console.warn('[config] SESSION_SECRET absent : un secret temporaire est utilisé (les sessions seront perdues au redémarrage).');
  }
  const db = openDatabase(config.databasePath);
  const models = createModels(db);

  if (config.seedOnEmpty && db.prepare('SELECT COUNT(*) AS n FROM programmes').get().n === 0) {
    seed(db, { quiet: true });
    console.info('[seed] Base vide : données de démonstration chargées (désactivable avec SEED_ON_EMPTY=false).');
  }
  await ensureInitialAdmin(models.users, config);

  const app = createApp({ config, db });
  const server = app.listen(config.port, () => {
    console.info(`Outil VEFA démarré : http://localhost:${config.port}  (back-office : /admin)`);
  });
  const stop = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
