'use strict';
const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const LotFilter = require('../lib/lotFilter');
const { validateLead, parseNumber, str } = require('../lib/validation');
const { CONSENT_TEXT } = require('../lib/constants');

const MIN_FILL_MS = 3000;            // un humain met plus de 3 s à remplir le formulaire
const MAX_FORM_AGE_MS = 24 * 3600e3; // jeton de formulaire valable 24 h
const BUDGET_CHOICES = [200000, 250000, 300000, 350000, 400000, 500000, 600000];

module.exports = ({ models, config }) => {
  const router = express.Router();

  // Jeton de formulaire signé : remplace le cookie CSRF sur les pages publiques (aucun cookie déposé)
  // et sert de contrôle anti-robot (délai minimum de saisie).
  function formToken(now = Date.now()) {
    const sig = crypto.createHmac('sha256', config.sessionSecret).update(`lead:${now}`).digest('base64url');
    return `${now}.${sig}`;
  }
  function checkFormToken(token, now = Date.now()) {
    const [ts, sig] = String(token || '').split('.');
    const t = Number(ts);
    if (!t || !sig) return 'invalide';
    const expected = crypto.createHmac('sha256', config.sessionSecret).update(`lead:${t}`).digest('base64url');
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return 'invalide';
    if (now - t < MIN_FILL_MS) return 'trop-rapide';
    if (now - t > MAX_FORM_AGE_MS) return 'expire';
    return null;
  }

  function loadProgramme(req, res, next) {
    const programme = models.programmes.findBySlug(String(req.params.slug));
    if (!programme || programme.status !== 'publie') {
      return res.status(404).render('public/error', { title: 'Programme introuvable', status: 404, message: 'Ce programme n’existe pas ou n’est plus commercialisé.' });
    }
    req.programme = programme;
    next();
  }

  // ---------- Accueil ----------
  router.get('/', (req, res) => {
    const cities = models.programmes.publicCities();
    const city = cities.includes(req.query.ville) ? req.query.ville : '';
    const budget = parseNumber(req.query.budget);
    const budgetMax = budget && budget > 0 ? budget : null;
    const programmes = models.programmes.listPublic({ city, budgetMax });
    res.render('public/home', { title: 'Nos programmes immobiliers neufs en Île-de-France', programmes, cities, city, budgetMax, budgetChoices: BUDGET_CHOICES });
  });

  // ---------- Page programme + sélecteur de lots ----------
  router.get('/programmes/:slug', loadProgramme, (req, res) => {
    const p = req.programme;
    const allLots = models.lots.listByProgramme(p.id);
    const criteria = LotFilter.parseCriteria(req.query);
    const lots = LotFilter.filterLots(allLots, criteria);
    // Ordre d'affichage : lots correspondants triés, puis les autres (masqués, pour le filtrage instantané).
    const shownIds = new Set(lots.map((l) => l.id));
    const ordered = [...lots, ...allLots.filter((l) => !shownIds.has(l.id))];
    const floors = [...new Set(allLots.map((l) => l.floor))].sort((a, b) => a - b);
    const typologies = LotFilter.TYPOLOGIES.filter((t) => allLots.some((l) => l.typology === t));
    const available = allLots.filter((l) => l.status === 'disponible');
    res.render('public/programme', {
      title: `${p.name} – ${p.city}`,
      metaDescription: p.tagline || p.description.slice(0, 150),
      p, lots, allLots, ordered, shownIds, criteria, floors, typologies,
      images: models.programmes.images(p.id),
      priceFrom: available.length ? Math.min(...available.map((l) => l.price)) : null,
      availableCount: available.length,
      // Données minimales transmises au filtrage côté navigateur
      lotsJson: JSON.stringify(allLots.map(({ id, typology, surface, price, floor, status, reference }) => ({ id, typology, surface, price, floor, status, reference })))
        .replace(/</g, '\\u003c'),
    });
  });

  // API JSON (lecture seule) : utile pour une intégration future sur le site WordPress.
  router.get('/api/programmes/:slug/lots', loadProgramme, (req, res) => {
    const lots = LotFilter.filterLots(models.lots.listByProgramme(req.programme.id), LotFilter.parseCriteria(req.query));
    res.json(lots.map(({ programme_id, updated_at, ...l }) => l));
  });

  // ---------- Fiche lot ----------
  router.get('/programmes/:slug/lots/:ref', loadProgramme, (req, res) => {
    const lot = models.lots.findByRef(req.programme.id, String(req.params.ref).toUpperCase());
    if (!lot) return res.status(404).render('public/error', { title: 'Lot introuvable', status: 404, message: 'Ce lot n’existe pas.' });
    const view = req.query.fragment === '1' ? 'public/lot-fragment' : 'public/lot';
    res.render(view, { title: `Lot ${lot.reference} – ${req.programme.name}`, p: req.programme, lot });
  });

  // ---------- Formulaire de contact ----------
  function renderContact(res, p, lot, { values = {}, errors = {}, status = 200 } = {}) {
    res.status(status).render('public/contact', {
      title: `Contact – ${p.name}`, p, lot, values, errors, consentText: CONSENT_TEXT, formToken: formToken(),
    });
  }

  router.get('/programmes/:slug/contact', loadProgramme, (req, res) => {
    const ref = str(req.query.lot, 20).toUpperCase();
    const lot = ref ? models.lots.findByRef(req.programme.id, ref) : null;
    renderContact(res, req.programme, lot && lot.status !== 'vendu' ? lot : null, { values: { project: 'habiter' } });
  });

  const leadLimiter = rateLimit({
    windowMs: config.leadRateLimit.windowMs,
    limit: config.leadRateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).render('public/error', {
      title: 'Trop de demandes', status: 429,
      message: 'Vous avez envoyé plusieurs demandes en peu de temps. Merci de patienter quelques minutes ou de nous appeler directement.',
    }),
  });

  router.post('/programmes/:slug/contact', leadLimiter, loadProgramme, (req, res) => {
    const p = req.programme;
    const body = req.body || {};

    // Contrôle d'origine : refuse les envois provenant d'un autre site.
    const origin = req.get('origin');
    let originHost = null;
    try { originHost = origin && origin !== 'null' ? new URL(origin).host : null; } catch (_) { originHost = 'invalide'; }
    if (originHost && originHost !== req.get('host')) {
      return res.status(403).render('public/error', { title: 'Envoi refusé', status: 403, message: 'Ce formulaire ne peut être envoyé que depuis notre site.' });
    }

    // Champ piège : invisible pour un humain, rempli par les robots. On simule un succès.
    if (str(body.site_web)) return res.redirect(303, `/programmes/${p.slug}/merci`);

    const lotRef = str(body.lot, 20).toUpperCase();
    const lot = lotRef ? models.lots.findByRef(p.id, lotRef) : null;

    const tokenProblem = checkFormToken(body.form_token);
    if (tokenProblem === 'trop-rapide') return res.redirect(303, `/programmes/${p.slug}/merci`);
    if (tokenProblem) {
      return renderContact(res, p, lot, { values: body, status: 400, errors: { _form: 'Le formulaire a expiré : vérifiez vos informations puis renvoyez-le.' } });
    }

    const { value, errors } = validateLead(body);
    if (Object.keys(errors).length) {
      return renderContact(res, p, lot, { values: body, errors, status: 422 });
    }
    models.leads.create({
      ...value,
      programme_id: p.id,
      lot_id: lot ? lot.id : null,
      lot_reference: lot ? lot.reference : '',
      consent_text: CONSENT_TEXT,
    });
    res.redirect(303, `/programmes/${p.slug}/merci${lot ? `?lot=${encodeURIComponent(lot.reference)}` : ''}`);
  });

  router.get('/programmes/:slug/merci', loadProgramme, (req, res) => {
    res.render('public/merci', { title: 'Merci', p: req.programme });
  });

  // ---------- Pages légales (à compléter) ----------
  router.get('/confidentialite', (req, res) => res.render('public/confidentialite', { title: 'Données personnelles et cookies' }));
  router.get('/mentions-legales', (req, res) => res.render('public/mentions', { title: 'Mentions légales' }));

  router.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /admin\n'));

  return router;
};

module.exports.MIN_FILL_MS = MIN_FILL_MS;
