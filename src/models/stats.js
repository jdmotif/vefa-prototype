'use strict';

/** Lundi (UTC) de la semaine contenant la date donnée, au format AAAA-MM-JJ. */
function weekStart(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

module.exports = (db) => ({
  lotsByStatus() {
    return db.prepare(`SELECT p.id, p.name, p.slug, p.status AS programme_status,
        SUM(l.status = 'disponible') AS disponible, SUM(l.status = 'reserve') AS reserve,
        SUM(l.status = 'vendu') AS vendu, COUNT(l.id) AS total,
        COALESCE(SUM(CASE WHEN l.status = 'vendu' THEN l.price END), 0) AS ca_vendu
      FROM programmes p LEFT JOIN lots l ON l.programme_id = p.id
      WHERE p.status <> 'archive' GROUP BY p.id ORDER BY p.name`).all()
      .map((r) => ({ ...r, disponible: r.disponible || 0, reserve: r.reserve || 0, vendu: r.vendu || 0 }));
  },
  /** Nombre de leads par semaine sur les N dernières semaines (semaines vides incluses). */
  leadsPerWeek(weeks = 12, now = new Date()) {
    const rows = db.prepare("SELECT created_at FROM leads WHERE created_at >= datetime('now', ?)").all(`-${weeks * 7 + 7} days`);
    const buckets = new Map();
    const start = new Date(weekStart(now) + 'T00:00:00Z');
    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() - i * 7);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      const key = weekStart(new Date(r.created_at.replace(' ', 'T') + 'Z'));
      if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
    }
    return [...buckets.entries()].map(([week, count]) => ({ week, count }));
  },
  leadsByStatus() {
    return db.prepare('SELECT status, COUNT(*) AS n FROM leads GROUP BY status').all();
  },
});

module.exports.weekStart = weekStart;
