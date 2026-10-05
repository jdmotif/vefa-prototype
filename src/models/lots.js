'use strict';

const FIELDS = ['reference', 'building', 'floor', 'typology', 'surface', 'outdoor_type', 'outdoor_surface', 'orientation', 'parking', 'price', 'status'];

module.exports = (db) => ({
  listByProgramme(programmeId) {
    return db.prepare('SELECT * FROM lots WHERE programme_id = ? ORDER BY building, floor, reference').all(programmeId);
  },
  findById(id) {
    return db.prepare('SELECT * FROM lots WHERE id = ?').get(id);
  },
  findByRef(programmeId, reference) {
    return db.prepare('SELECT * FROM lots WHERE programme_id = ? AND reference = ?').get(programmeId, reference);
  },
  references(programmeId) {
    return db.prepare('SELECT reference FROM lots WHERE programme_id = ?').all(programmeId).map((r) => r.reference);
  },
  create(programmeId, lot) {
    const info = db.prepare(`INSERT INTO lots (programme_id, ${FIELDS.join(', ')})
      VALUES (@programme_id, ${FIELDS.map((f) => '@' + f).join(', ')})`).run({ ...lot, programme_id: programmeId });
    return info.lastInsertRowid;
  },
  update(id, lot) {
    db.prepare(`UPDATE lots SET ${FIELDS.map((f) => `${f} = @${f}`).join(', ')}, updated_at = datetime('now') WHERE id = @id`)
      .run({ ...lot, id });
  },
  setStatus(id, status) {
    db.prepare("UPDATE lots SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
  },
  setPlan(id, path) {
    db.prepare("UPDATE lots SET plan_image = ?, updated_at = datetime('now') WHERE id = ?").run(path, id);
  },
  remove(id) {
    db.prepare('DELETE FROM lots WHERE id = ?').run(id);
  },
});
