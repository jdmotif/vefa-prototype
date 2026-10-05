'use strict';

module.exports = (db) => {
  const summarySql = `
    SELECT p.*,
      (SELECT MIN(price) FROM lots l WHERE l.programme_id = p.id AND l.status = 'disponible') AS price_from,
      (SELECT COUNT(*) FROM lots l WHERE l.programme_id = p.id AND l.status = 'disponible') AS available_count,
      (SELECT COUNT(*) FROM lots l WHERE l.programme_id = p.id) AS lot_count,
      (SELECT GROUP_CONCAT(DISTINCT typology) FROM (SELECT typology FROM lots l WHERE l.programme_id = p.id AND l.status = 'disponible' ORDER BY typology)) AS typologies
    FROM programmes p`;

  return {
    /** Programmes publiés, avec filtres facultatifs ville et budget maximum. */
    listPublic({ city, budgetMax } = {}) {
      const where = ["p.status = 'publie'"];
      const params = {};
      if (city) { where.push('p.city = @city'); params.city = city; }
      if (budgetMax) {
        where.push("EXISTS (SELECT 1 FROM lots l WHERE l.programme_id = p.id AND l.status = 'disponible' AND l.price <= @budgetMax)");
        params.budgetMax = budgetMax;
      }
      return db.prepare(`${summarySql} WHERE ${where.join(' AND ')} ORDER BY p.name`).all(params);
    },
    publicCities() {
      return db.prepare("SELECT DISTINCT city FROM programmes WHERE status = 'publie' ORDER BY city").all().map((r) => r.city);
    },
    listAll({ includeArchived = false } = {}) {
      const where = includeArchived ? '' : "WHERE p.status <> 'archive'";
      return db.prepare(`${summarySql} ${where} ORDER BY p.status = 'archive', p.updated_at DESC`).all();
    },
    findBySlug(slug) {
      return db.prepare('SELECT * FROM programmes WHERE slug = ?').get(slug);
    },
    findById(id) {
      return db.prepare('SELECT * FROM programmes WHERE id = ?').get(id);
    },
    slugExists(slug, exceptId = 0) {
      return !!db.prepare('SELECT 1 FROM programmes WHERE slug = ? AND id <> ?').get(slug, exceptId);
    },
    create(p) {
      const info = db.prepare(`INSERT INTO programmes (slug, name, city, postal_code, address, tagline, description, highlights, delivery, hero_image, status)
        VALUES (@slug, @name, @city, @postal_code, @address, @tagline, @description, @highlights, @delivery, @hero_image, @status)`)
        .run({ hero_image: null, ...p });
      return info.lastInsertRowid;
    },
    update(id, p) {
      db.prepare(`UPDATE programmes SET slug=@slug, name=@name, city=@city, postal_code=@postal_code, address=@address,
          tagline=@tagline, description=@description, highlights=@highlights, delivery=@delivery, status=@status,
          updated_at=datetime('now') WHERE id=@id`).run({ ...p, id });
    },
    setHeroImage(id, path) {
      db.prepare("UPDATE programmes SET hero_image = ?, updated_at = datetime('now') WHERE id = ?").run(path, id);
    },
    setStatus(id, status) {
      db.prepare("UPDATE programmes SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
    },
    images(programmeId) {
      return db.prepare('SELECT * FROM programme_images WHERE programme_id = ? ORDER BY position, id').all(programmeId);
    },
    addImage(programmeId, path, alt) {
      const pos = db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM programme_images WHERE programme_id = ?').get(programmeId).p;
      db.prepare('INSERT INTO programme_images (programme_id, path, alt, position) VALUES (?, ?, ?, ?)').run(programmeId, path, alt, pos);
    },
    findImage(imageId) {
      return db.prepare('SELECT * FROM programme_images WHERE id = ?').get(imageId);
    },
    deleteImage(imageId) {
      db.prepare('DELETE FROM programme_images WHERE id = ?').run(imageId);
    },
  };
};
