'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { csrfToken, verifyCsrf } = require('../lib/csrf');
const { verifyCredentials, requireAuth } = require('../lib/auth');
const { imageUpload, importUpload, saveImage, removeUpload } = require('../lib/uploads');
const { validateLot, validateProgramme, str, toInt } = require('../lib/validation');
const { parseFile, analyzeRows, applyImport, analyzeMulti, applyMulti } = require('../lib/importLots');
const { LOT_STATUSES, LEAD_STATUSES, PROGRAMME_STATUSES, LEAD_PROJECTS } = require('../lib/constants');

const IMPORT_TTL_MS = 60 * 60 * 1000;

function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  // Protection contre l'injection de formules dans Excel / LibreOffice
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(rows) {
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

module.exports = ({ models, config, db }) => {
  const router = express.Router();
  const images = imageUpload({ maxBytes: config.maxUploadBytes, fields: [{ name: 'hero_image', maxCount: 1 }, { name: 'gallery', maxCount: 10 }] });
  const planUpload = imageUpload({ maxBytes: config.maxUploadBytes, fields: [{ name: 'plan_image', maxCount: 1 }] });
  const importFile = importUpload();

  router.use(csrfToken);
  router.use((req, res, next) => {
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    res.locals.user = req.session.userId ? models.users.findById(req.session.userId) : null;
    res.locals.adminPath = req.path;
    next();
  });
  const flash = (req, type, message) => { req.session.flash = { type, message }; };

  // ---------------- Connexion ----------------
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => res.status(429).render('admin/login', { title: 'Connexion', error: 'Trop de tentatives. Réessayez dans 15 minutes.', email: '' }),
  });

  router.get('/connexion', (req, res) => {
    if (req.session.userId) return res.redirect('/admin');
    res.render('admin/login', { title: 'Connexion', error: null, email: '' });
  });

  router.post('/connexion', loginLimiter, verifyCsrf, async (req, res, next) => {
    try {
      const email = str(req.body.email, 160);
      const user = await verifyCredentials(models.users, email, String(req.body.password || '').slice(0, 200));
      if (!user) {
        return res.status(401).render('admin/login', { title: 'Connexion', error: 'Identifiant ou mot de passe incorrect.', email });
      }
      const returnTo = req.session.returnTo;
      // Nouvelle session après connexion (protection contre la fixation de session)
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        req.session.csrf = crypto.randomBytes(24).toString('hex');
        models.users.touchLogin(user.id);
        const safe = typeof returnTo === 'string' && /^\/admin(\/|$)/.test(returnTo) && !returnTo.startsWith('//') ? returnTo : '/admin';
        res.redirect(303, safe);
      });
    } catch (e) { next(e); }
  });

  router.post('/deconnexion', verifyCsrf, (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('vefa.sid', { path: '/admin' });
      res.redirect(303, '/admin/connexion');
    });
  });

  // Tout ce qui suit est protégé.
  router.use(requireAuth);
  router.use((req, res, next) => { res.locals.newLeads = models.leads.countNew(); next(); });

  // ---------------- Tableau de bord ----------------
  router.get('/', (req, res) => {
    const byProgramme = models.stats.lotsByStatus();
    const totals = byProgramme.reduce((t, r) => ({
      disponible: t.disponible + r.disponible, reserve: t.reserve + r.reserve, vendu: t.vendu + r.vendu, total: t.total + r.total, ca: t.ca + r.ca_vendu,
    }), { disponible: 0, reserve: 0, vendu: 0, total: 0, ca: 0 });
    const weeks = models.stats.leadsPerWeek(12);
    res.render('admin/dashboard', {
      title: 'Tableau de bord', byProgramme, totals, weeks,
      leadsByStatus: Object.fromEntries(models.stats.leadsByStatus().map((r) => [r.status, r.n])),
      recentLeads: models.leads.list().slice(0, 5),
    });
  });

  // ---------------- Programmes ----------------
  router.get('/programmes', (req, res) => {
    const showArchived = req.query.archives === '1';
    res.render('admin/programmes', { title: 'Programmes', programmes: models.programmes.listAll({ includeArchived: showArchived }), showArchived });
  });

  router.get('/programmes/nouveau', (req, res) => {
    res.render('admin/programme-form', { title: 'Nouveau programme', p: { status: 'brouillon' }, errors: [], images: [] });
  });

  function loadProgramme(req, res, next) {
    const p = models.programmes.findById(toInt(req.params.id));
    if (!p) return next(Object.assign(new Error('Programme introuvable.'), { status: 404 }));
    req.programme = p;
    next();
  }

  function handleProgrammeImages(req, programmeId) {
    const files = req.files || {};
    if (files.hero_image && files.hero_image[0]) {
      const old = models.programmes.findById(programmeId).hero_image;
      models.programmes.setHeroImage(programmeId, saveImage(config.uploadDir, files.hero_image[0], 'programmes'));
      removeUpload(config.uploadDir, old);
    }
    for (const f of files.gallery || []) {
      models.programmes.addImage(programmeId, saveImage(config.uploadDir, f, 'programmes'), str(req.body.gallery_alt, 150) || 'Visuel du programme');
    }
  }

  router.post('/programmes', images, verifyCsrf, (req, res) => {
    const { value, errors } = validateProgramme(req.body);
    if (!errors.length && models.programmes.slugExists(value.slug)) errors.push('Cette adresse web (slug) est déjà utilisée par un autre programme.');
    if (errors.length) return res.status(422).render('admin/programme-form', { title: 'Nouveau programme', p: { ...req.body, ...value }, errors, images: [] });
    const id = models.programmes.create(value);
    handleProgrammeImages(req, id);
    flash(req, 'success', `Programme « ${value.name} » créé. Ajoutez maintenant ses lots.`);
    res.redirect(303, `/admin/programmes/${id}/lots`);
  });

  router.get('/programmes/:id', loadProgramme, (req, res) => {
    res.render('admin/programme-form', { title: req.programme.name, p: req.programme, errors: [], images: models.programmes.images(req.programme.id) });
  });

  router.post('/programmes/:id', loadProgramme, images, verifyCsrf, (req, res) => {
    const p = req.programme;
    const { value, errors } = validateProgramme(req.body);
    if (!errors.length && models.programmes.slugExists(value.slug, p.id)) errors.push('Cette adresse web (slug) est déjà utilisée par un autre programme.');
    if (errors.length) {
      return res.status(422).render('admin/programme-form', { title: p.name, p: { ...p, ...value }, errors, images: models.programmes.images(p.id) });
    }
    models.programmes.update(p.id, value);
    handleProgrammeImages(req, p.id);
    flash(req, 'success', 'Programme enregistré.');
    res.redirect(303, `/admin/programmes/${p.id}`);
  });

  router.post('/programmes/:id/archiver', loadProgramme, verifyCsrf, (req, res) => {
    const archived = req.programme.status === 'archive';
    models.programmes.setStatus(req.programme.id, archived ? 'brouillon' : 'archive');
    flash(req, 'success', archived
      ? `« ${req.programme.name} » est sorti des archives (en brouillon : publiez-le pour le rendre visible).`
      : `« ${req.programme.name} » est archivé : il n’apparaît plus sur le site.`);
    res.redirect(303, '/admin/programmes');
  });

  router.post('/programmes/:id/images/:imageId/supprimer', loadProgramme, verifyCsrf, (req, res) => {
    const img = models.programmes.findImage(toInt(req.params.imageId));
    if (img && img.programme_id === req.programme.id) {
      models.programmes.deleteImage(img.id);
      removeUpload(config.uploadDir, img.path);
      flash(req, 'success', 'Image supprimée.');
    }
    res.redirect(303, `/admin/programmes/${req.programme.id}#galerie`);
  });

  // ---------------- Lots ----------------
  router.get('/programmes/:id/lots', loadProgramme, (req, res) => {
    const lots = models.lots.listByProgramme(req.programme.id);
    res.render('admin/lots', { title: `Lots – ${req.programme.name}`, p: req.programme, lots });
  });

  router.get('/programmes/:id/lots/nouveau', loadProgramme, (req, res) => {
    res.render('admin/lot-form', { title: 'Nouveau lot', p: req.programme, lot: { status: 'disponible', outdoor_type: 'aucun', parking: 0, floor: 0 }, errors: [] });
  });

  router.post('/programmes/:id/lots', loadProgramme, planUpload, verifyCsrf, (req, res) => {
    const { value, errors } = validateLot(req.body);
    if (!errors.length && models.lots.findByRef(req.programme.id, value.reference)) errors.push(`La référence ${value.reference} existe déjà dans ce programme.`);
    if (errors.length) return res.status(422).render('admin/lot-form', { title: 'Nouveau lot', p: req.programme, lot: { ...req.body }, errors });
    const id = models.lots.create(req.programme.id, value);
    const plan = req.files && req.files.plan_image && req.files.plan_image[0];
    if (plan) models.lots.setPlan(id, saveImage(config.uploadDir, plan, 'plans'));
    flash(req, 'success', `Lot ${value.reference} ajouté.`);
    res.redirect(303, `/admin/programmes/${req.programme.id}/lots`);
  });

  function loadLot(req, res, next) {
    const lot = models.lots.findById(toInt(req.params.lotId));
    if (!lot) return next(Object.assign(new Error('Lot introuvable.'), { status: 404 }));
    req.lot = lot;
    req.programme = models.programmes.findById(lot.programme_id);
    next();
  }

  router.get('/lots/:lotId', loadLot, (req, res) => {
    res.render('admin/lot-form', { title: `Lot ${req.lot.reference}`, p: req.programme, lot: req.lot, errors: [] });
  });

  router.post('/lots/:lotId', loadLot, planUpload, verifyCsrf, (req, res) => {
    const { value, errors } = validateLot(req.body);
    const other = !errors.length && models.lots.findByRef(req.programme.id, value.reference);
    if (other && other.id !== req.lot.id) errors.push(`La référence ${value.reference} existe déjà dans ce programme.`);
    if (errors.length) return res.status(422).render('admin/lot-form', { title: `Lot ${req.lot.reference}`, p: req.programme, lot: { ...req.lot, ...req.body }, errors });
    models.lots.update(req.lot.id, value);
    const plan = req.files && req.files.plan_image && req.files.plan_image[0];
    if (plan) {
      models.lots.setPlan(req.lot.id, saveImage(config.uploadDir, plan, 'plans'));
      removeUpload(config.uploadDir, req.lot.plan_image);
    } else if (req.body.remove_plan === 'oui') {
      models.lots.setPlan(req.lot.id, null);
      removeUpload(config.uploadDir, req.lot.plan_image);
    }
    flash(req, 'success', `Lot ${value.reference} enregistré.`);
    res.redirect(303, `/admin/programmes/${req.programme.id}/lots`);
  });

  // Changement de statut rapide depuis la liste
  router.post('/lots/:lotId/statut', loadLot, verifyCsrf, (req, res) => {
    const status = str(req.body.status);
    if (!LOT_STATUSES[status]) return res.status(400).json({ ok: false, message: 'Statut invalide.' });
    models.lots.setStatus(req.lot.id, status);
    if (req.get('accept') === 'application/json') return res.json({ ok: true, status, label: LOT_STATUSES[status] });
    flash(req, 'success', `Lot ${req.lot.reference} : ${LOT_STATUSES[status]}.`);
    res.redirect(303, `/admin/programmes/${req.programme.id}/lots#lot-${req.lot.id}`);
  });

  router.post('/lots/:lotId/supprimer', loadLot, verifyCsrf, (req, res) => {
    models.lots.remove(req.lot.id);
    removeUpload(config.uploadDir, req.lot.plan_image);
    flash(req, 'success', `Lot ${req.lot.reference} supprimé.`);
    res.redirect(303, `/admin/programmes/${req.programme.id}/lots`);
  });

  // ---------------- Import CSV / Excel ----------------
  router.get('/programmes/:id/import', loadProgramme, (req, res) => {
    res.render('admin/import', { title: `Import – ${req.programme.name}`, p: req.programme, analysis: null, token: null, error: null });
  });

  router.get('/import/modele.csv', (req, res) => {
    const rows = [
      ['reference', 'batiment', 'etage', 'typologie', 'surface', 'exterieur', 'surface_exterieur', 'orientation', 'parking', 'prix_ttc', 'statut'],
      ['A01', 'A', 'RDC', 'T2', '44,5', 'jardin', '62', 'S', '1', '239000', 'Disponible'],
      ['A11', 'A', '1', 'T3', '66,2', 'balcon', '8,5', 'SO', '1', '329000', 'Réservé'],
    ];
    res.set('Content-Disposition', 'attachment; filename="modele-import-lots.csv"');
    res.type('text/csv; charset=utf-8').send(toCsv(rows));
  });

  router.post('/programmes/:id/import', loadProgramme, importFile, verifyCsrf, async (req, res, next) => {
    const render = (status, extra) => res.status(status).render('admin/import', { title: `Import – ${req.programme.name}`, p: req.programme, analysis: null, token: null, error: null, ...extra });
    if (!req.file) return render(400, { error: 'Choisissez un fichier .csv ou .xlsx.' });
    let parsed;
    try {
      parsed = await parseFile(req.file.buffer, req.file.originalname);
    } catch (e) {
      return render(400, { error: e.expose ? e.message : 'Le fichier n’a pas pu être lu. Vérifiez qu’il s’agit bien d’un CSV ou d’un fichier Excel .xlsx.' });
    }
    try {
      const analysis = analyzeRows(parsed, models.lots.references(req.programme.id));
      let token = null;
      if (!analysis.fileErrors.length && analysis.summary.valid > 0) {
        token = crypto.randomBytes(16).toString('hex');
        db.prepare('DELETE FROM import_previews WHERE created_at < ?').run(Date.now() - IMPORT_TTL_MS);
        db.prepare('INSERT INTO import_previews (token, programme_id, payload, created_at) VALUES (?, ?, ?, ?)')
          .run(token, req.programme.id, JSON.stringify(analysis), Date.now());
      }
      render(200, { analysis, token, filename: req.file.originalname });
    } catch (e) { next(e); }
  });

  router.post('/programmes/:id/import/confirmer', loadProgramme, verifyCsrf, (req, res) => {
    const token = str(req.body.token, 64);
    const row = db.prepare('SELECT * FROM import_previews WHERE token = ? AND programme_id = ? AND created_at > ?')
      .get(token, req.programme.id, Date.now() - IMPORT_TTL_MS);
    if (!row) {
      flash(req, 'error', 'Cet aperçu a expiré ou a déjà été importé. Renvoyez le fichier.');
      return res.redirect(303, `/admin/programmes/${req.programme.id}/import`);
    }
    db.prepare('DELETE FROM import_previews WHERE token = ?').run(token);
    const analysis = JSON.parse(row.payload);
    const count = applyImport(db, req.programme.id, analysis);
    const s = analysis.summary;
    flash(req, 'success', `Import terminé : ${count} lot(s) enregistrés (${s.create} créé(s), ${s.update} mis à jour)${s.invalid ? `, ${s.invalid} ligne(s) en erreur ignorée(s)` : ''}.`);
    res.redirect(303, `/admin/programmes/${req.programme.id}/lots`);
  });

  // ---- Import « programmes + lots » (crée aussi les programmes) ----
  router.get('/import', (req, res) => {
    res.render('admin/import-multi', { title: 'Importer des programmes', analysis: null, token: null, error: null });
  });

  router.get('/import/modele-programmes.csv', (req, res) => {
    const rows = [
      ['programme', 'ville', 'code_postal', 'livraison', 'reference', 'batiment', 'etage', 'typologie', 'surface', 'exterieur', 'surface_exterieur', 'orientation', 'parking', 'prix_ttc', 'statut'],
      ['Résidence Exemple', 'Serris', '77700', '2e trimestre 2027', 'A01', 'A', 'RDC', 'T2', '44,5', 'jardin', '62', 'S', '1', '239000', 'Disponible'],
      ['Résidence Exemple', 'Serris', '77700', '2e trimestre 2027', 'A11', 'A', '1', 'T3', '66,2', 'balcon', '8,5', 'SO', '1', '329000', 'Réservé'],
    ];
    res.set('Content-Disposition', 'attachment; filename="modele-import-programmes.csv"');
    res.type('text/csv; charset=utf-8').send(toCsv(rows));
  });

  router.post('/import', importFile, verifyCsrf, async (req, res, next) => {
    const render = (status, extra) => res.status(status).render('admin/import-multi', { title: 'Importer des programmes', analysis: null, token: null, error: null, ...extra });
    if (!req.file) return render(400, { error: 'Choisissez un fichier .csv ou .xlsx.' });
    let parsed;
    try {
      parsed = await parseFile(req.file.buffer, req.file.originalname);
    } catch (e) {
      return render(400, { error: e.expose ? e.message : 'Le fichier n’a pas pu être lu. Vérifiez qu’il s’agit bien d’un CSV ou d’un fichier Excel .xlsx.' });
    }
    try {
      const existing = models.programmes.listAll({ includeArchived: true }).map((p) => ({ id: p.id, slug: p.slug, references: models.lots.references(p.id) }));
      const analysis = analyzeMulti(parsed, existing);
      let token = null;
      if (!analysis.fileErrors.length && analysis.programmes.some((p) => p.usable && p.analysis.summary.valid > 0)) {
        token = crypto.randomBytes(16).toString('hex');
        db.prepare('DELETE FROM import_batches WHERE created_at < ?').run(Date.now() - IMPORT_TTL_MS);
        db.prepare('INSERT INTO import_batches (token, payload, created_at) VALUES (?, ?, ?)').run(token, JSON.stringify(analysis), Date.now());
      }
      render(200, { analysis, token, filename: req.file.originalname });
    } catch (e) { next(e); }
  });

  router.post('/import/confirmer', verifyCsrf, (req, res) => {
    const token = str(req.body.token, 64);
    const row = db.prepare('SELECT * FROM import_batches WHERE token = ? AND created_at > ?').get(token, Date.now() - IMPORT_TTL_MS);
    if (!row) {
      flash(req, 'error', 'Cet aperçu a expiré ou a déjà été importé. Renvoyez le fichier.');
      return res.redirect(303, '/admin/import');
    }
    db.prepare('DELETE FROM import_batches WHERE token = ?').run(token);
    const { lots, created } = applyMulti(db, models, JSON.parse(row.payload));
    flash(req, 'success', `Import terminé : ${lots} lot(s) enregistrés, ${created} programme(s) créé(s) en brouillon. Vérifiez-les puis passez-les en « Publié » pour les rendre visibles.`);
    res.redirect(303, '/admin/programmes');
  });

  // ---------------- Leads ----------------
  function leadFilters(query) {
    return {
      status: LEAD_STATUSES[query.statut] ? query.statut : '',
      programmeId: toInt(query.programme),
    };
  }

  router.get('/leads', (req, res) => {
    const filters = leadFilters(req.query);
    res.render('admin/leads', {
      title: 'Demandes (leads)', leads: models.leads.list(filters), filters,
      programmes: models.programmes.listAll({ includeArchived: true }),
      qs: new URLSearchParams(Object.entries({ statut: filters.status, programme: filters.programmeId || '' }).filter(([, v]) => v)).toString(),
    });
  });

  router.get('/leads/export.csv', (req, res) => {
    const leads = models.leads.list(leadFilters(req.query));
    const rows = [['Date', 'Programme', 'Lot', 'Nom', 'E-mail', 'Téléphone', 'Projet', 'Budget', 'Message', 'Statut', 'Notes', 'Consentement le']];
    for (const l of leads) {
      rows.push([l.created_at, l.programme_name || '', l.lot_reference, l.name, l.email, l.phone, LEAD_PROJECTS[l.project] || l.project,
        l.budget ?? '', l.message, LEAD_STATUSES[l.status] || l.status, l.notes, l.consent_at]);
    }
    const date = new Date().toISOString().slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="leads-${date}.csv"`);
    res.type('text/csv; charset=utf-8').send(toCsv(rows));
  });

  function loadLead(req, res, next) {
    const lead = models.leads.findById(toInt(req.params.leadId));
    if (!lead) return next(Object.assign(new Error('Demande introuvable.'), { status: 404 }));
    req.lead = lead;
    next();
  }

  router.get('/leads/:leadId', loadLead, (req, res) => {
    res.render('admin/lead', { title: `Demande de ${req.lead.name}`, lead: req.lead });
  });

  router.post('/leads/:leadId', loadLead, verifyCsrf, (req, res) => {
    const status = LEAD_STATUSES[req.body.status] ? req.body.status : req.lead.status;
    const notes = req.body.notes !== undefined ? str(req.body.notes, 5000) : req.lead.notes;
    models.leads.update(req.lead.id, { status, notes });
    if (req.get('accept') === 'application/json') return res.json({ ok: true, status, label: LEAD_STATUSES[status] });
    flash(req, 'success', 'Demande mise à jour.');
    const back = str(req.body.back, 200);
    res.redirect(303, /^\/admin\/leads(\?[\w=&%-]*)?$/.test(back) ? back : `/admin/leads/${req.lead.id}`);
  });

  return router;
};

module.exports.toCsv = toCsv;
