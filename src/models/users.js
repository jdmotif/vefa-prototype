'use strict';

module.exports = (db) => ({
  count() { return db.prepare('SELECT COUNT(*) AS n FROM users').get().n; },
  findByEmail(email) { return db.prepare('SELECT * FROM users WHERE email = ?').get(email); },
  findById(id) { return db.prepare('SELECT id, email, created_at, last_login_at FROM users WHERE id = ?').get(id); },
  create(email, passwordHash) {
    return db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, passwordHash).lastInsertRowid;
  },
  touchLogin(id) { db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(id); },
});
