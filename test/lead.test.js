'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { makeApp, formToken } = require('./helpers');
const { validateLead } = require('../src/lib/validation');

const VALID = {
  name: 'Camille Exemple', email: 'camille@exemple.fr', phone: '06 00 00 00 01',
  project: 'habiter', budget: '320 000', message: 'Bonjour', consent: 'oui',
};
const countLeads = (db) => db.prepare('SELECT COUNT(*) AS n FROM leads').get().n;

test('validation : champs obligatoires et formats', () => {
  assert.deepEqual(validateLead(VALID).errors, {});
  assert.equal(validateLead(VALID).value.budget, 320000);
  const { errors } = validateLead({ name: 'A', email: 'pas-un-email', phone: '123', project: 'autre', budget: 'beaucoup' });
  assert.deepEqual(Object.keys(errors).sort(), ['budget', 'consent', 'email', 'name', 'phone', 'project']);
  assert.deepEqual(validateLead({ ...VALID, phone: '+33 6 00 00 00 01' }).errors, {});
});

test('demande valide enregistrée avec le lot, le programme et la preuve de consentement', async () => {
  const { app, db, models } = await makeApp();
  const p = models.programmes.findBySlug('villa-horizon');
  const lot = models.lots.listByProgramme(p.id).find((l) => l.status === 'disponible');
  const before = countLeads(db);
  const res = await request(app).post('/programmes/villa-horizon/contact').type('form')
    .send({ ...VALID, lot: lot.reference, form_token: formToken() }).expect(303);
  assert.equal(res.headers.location, `/programmes/villa-horizon/merci?lot=${lot.reference}`);
  assert.equal(countLeads(db), before + 1);
  const lead = db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 1').get();
  assert.equal(lead.lot_id, lot.id);
  assert.equal(lead.programme_id, p.id);
  assert.equal(lead.status, 'nouveau');
  assert.equal(lead.budget, 320000);
  assert.match(lead.consent_text, /J'accepte/);
  assert.ok(lead.consent_at);
});

test('consentement RGPD obligatoire', async () => {
  const { app, db } = await makeApp();
  const before = countLeads(db);
  const { consent, ...noConsent } = VALID;
  const res = await request(app).post('/programmes/villa-horizon/contact').type('form').send({ ...noConsent, form_token: formToken() }).expect(422);
  assert.match(res.text, /Votre accord est nécessaire/);
  assert.equal(countLeads(db), before);
});

test('les erreurs sont réaffichées et les saisies échappées (pas d’injection HTML)', async () => {
  const { app } = await makeApp();
  const res = await request(app).post('/programmes/villa-horizon/contact').type('form')
    .send({ ...VALID, email: 'faux', name: '<script>alert(1)</script>', form_token: formToken() }).expect(422);
  assert.match(res.text, /Indiquez une adresse e-mail valide/);
  assert.ok(!res.text.includes('<script>alert(1)</script>'));
  assert.ok(res.text.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('anti-spam : champ piège rempli → faux succès, rien d’enregistré', async () => {
  const { app, db } = await makeApp();
  const before = countLeads(db);
  await request(app).post('/programmes/villa-horizon/contact').type('form')
    .send({ ...VALID, site_web: 'http://spam.example', form_token: formToken() }).expect(303);
  assert.equal(countLeads(db), before);
});

test('anti-spam : envoi trop rapide ignoré, jeton falsifié ou absent refusé', async () => {
  const { app, db } = await makeApp();
  const before = countLeads(db);
  await request(app).post('/programmes/villa-horizon/contact').type('form').send({ ...VALID, form_token: formToken(500) }).expect(303);
  await request(app).post('/programmes/villa-horizon/contact').type('form').send({ ...VALID, form_token: `${Date.now() - 10000}.falsifie` }).expect(400);
  await request(app).post('/programmes/villa-horizon/contact').type('form').send(VALID).expect(400);
  assert.equal(countLeads(db), before);
});

test('anti-spam : limite de fréquence par adresse IP', async () => {
  const { app, db } = await makeApp({ leadMax: 2 });
  const before = countLeads(db);
  const send = () => request(app).post('/programmes/villa-horizon/contact').type('form').send({ ...VALID, form_token: formToken() });
  await send().expect(303);
  await send().expect(303);
  const res = await send().expect(429);
  assert.match(res.text, /plusieurs demandes en peu de temps/);
  assert.equal(countLeads(db), before + 2);
});

test('envoi depuis un autre site refusé (contrôle d’origine)', async () => {
  const { app } = await makeApp();
  await request(app).post('/programmes/villa-horizon/contact').set('Origin', 'https://site-malveillant.example').type('form')
    .send({ ...VALID, form_token: formToken() }).expect(403);
});

test('aucun cookie déposé sur les pages publiques', async () => {
  const { app } = await makeApp();
  for (const url of ['/', '/programmes/villa-horizon', '/programmes/villa-horizon/contact']) {
    const res = await request(app).get(url).expect(200);
    assert.equal(res.headers['set-cookie'], undefined, url);
  }
});

test('back-office : le statut et les notes d’un lead se mettent à jour, export CSV protégé', async () => {
  const { app, db } = await makeApp();
  await request(app).get('/admin/leads/export.csv').expect(302);
  const agent = request.agent(app);
  const page = await agent.get('/admin/connexion');
  let csrf = page.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  await agent.post('/admin/connexion').type('form').send({ _csrf: csrf, email: 'admin@exemple.fr', password: 'mauvais' }).expect(401);
  await agent.post('/admin/connexion').type('form').send({ _csrf: csrf, email: 'admin@exemple.fr', password: 'mot-de-passe-de-test' }).expect(303);
  csrf = (await agent.get('/admin/leads')).text.match(/data-csrf="([a-f0-9]+)"/)[1];
  const lead = db.prepare('SELECT id FROM leads LIMIT 1').get();
  await agent.post(`/admin/leads/${lead.id}`).type('form').send({ _csrf: csrf, status: 'rdv', notes: '=HYPERLINK("x")' }).expect(303);
  assert.equal(db.prepare('SELECT status FROM leads WHERE id = ?').get(lead.id).status, 'rdv');
  const csv = await agent.get('/admin/leads/export.csv').expect(200).expect('content-type', /text\/csv/);
  assert.match(csv.text, /^﻿Date;Programme;Lot;Nom/);
  // Protection contre l'injection de formules
  assert.ok(csv.text.includes(`"'=HYPERLINK(""x"")"`));
});
