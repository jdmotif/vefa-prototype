'use strict';

module.exports = (db) => ({
  create(lead) {
    const info = db.prepare(`INSERT INTO leads (programme_id, lot_id, lot_reference, name, email, phone, project, budget, message, consent_at, consent_text)
      VALUES (@programme_id, @lot_id, @lot_reference, @name, @email, @phone, @project, @budget, @message, datetime('now'), @consent_text)`)
      .run(lead);
    return info.lastInsertRowid;
  },
  list({ status, programmeId } = {}) {
    const where = [];
    const params = {};
    if (status) { where.push('ld.status = @status'); params.status = status; }
    if (programmeId) { where.push('ld.programme_id = @programmeId'); params.programmeId = programmeId; }
    return db.prepare(`SELECT ld.*, p.name AS programme_name, p.slug AS programme_slug
      FROM leads ld LEFT JOIN programmes p ON p.id = ld.programme_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY ld.created_at DESC, ld.id DESC`).all(params);
  },
  findById(id) {
    return db.prepare(`SELECT ld.*, p.name AS programme_name FROM leads ld
      LEFT JOIN programmes p ON p.id = ld.programme_id WHERE ld.id = ?`).get(id);
  },
  update(id, { status, notes }) {
    db.prepare("UPDATE leads SET status = @status, notes = @notes, updated_at = datetime('now') WHERE id = @id").run({ id, status, notes });
  },
  countNew() {
    return db.prepare("SELECT COUNT(*) AS n FROM leads WHERE status = 'nouveau'").get().n;
  },
});
