'use strict';
const fs = require('fs');
const path = require('path');
// SQLite intégré à Node.js (aucune compilation, fonctionne sur Windows, macOS et Linux).
const { DatabaseSync } = require('node:sqlite');

const clean = (v) => (v === undefined ? null : v);

function cleanArgs(args) {
  return args.map((a) => {
    if (a && typeof a === 'object' && !Buffer.isBuffer(a)) {
      return Object.fromEntries(Object.entries(a).map(([k, v]) => [k, clean(v)]));
    }
    return clean(a);
  });
}

/** Petite enveloppe qui donne une API simple : prepare().get/all/run, exec, transaction, close. */
function wrap(raw) {
  let depth = 0; // transactions imbriquées : seule la plus externe valide ou annule
  return {
    exec: (sql) => raw.exec(sql),
    close: () => raw.close(),
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        get: (...a) => stmt.get(...cleanArgs(a)),
        all: (...a) => stmt.all(...cleanArgs(a)),
        run: (...a) => stmt.run(...cleanArgs(a)),
      };
    },
    transaction(fn) {
      return (...args) => {
        if (depth > 0) return fn(...args);
        raw.exec('BEGIN');
        depth += 1;
        try {
          const result = fn(...args);
          raw.exec('COMMIT');
          return result;
        } catch (err) {
          raw.exec('ROLLBACK');
          throw err;
        } finally {
          depth -= 1;
        }
      };
    },
  };
}

function openDatabase(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file, { allowUnknownNamedParameters: true });
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  raw.exec('PRAGMA foreign_keys = ON');
  raw.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  return wrap(raw);
}

module.exports = { openDatabase };
