'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { makeApp } = require('./helpers');

// PNG 1×1 valide
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function loggedAgent(app) {
  const agent = request.agent(app);
  const page = await agent.get('/admin/connexion');
  const csrf = page.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  await agent.post('/admin/connexion').type('form').send({ _csrf: csrf, email: 'admin@exemple.fr', password: 'mot-de-passe-de-test' }).expect(303);
  return { agent, csrf: (await agent.get('/admin')).text.match(/data-csrf="([a-f0-9]+)"/)[1] };
}

test('upload : image valide acceptée, faux PNG et SVG refusés, taille limitée', async () => {
  const { app, models, config } = await makeApp();
  const { agent, csrf } = await loggedAgent(app);
  const lot = models.lots.listByProgramme(1)[0];
  const fields = { _csrf: csrf, reference: lot.reference, typology: lot.typology, surface: String(lot.surface), price: String(lot.price), status: lot.status, outdoor_type: 'aucun', floor: '1', parking: '0' };
  const post = () => { const r = agent.post(`/admin/lots/${lot.id}`); Object.entries(fields).forEach(([k, v]) => r.field(k, v)); return r; };

  await post().attach('plan_image', PNG, { filename: 'plan.png', contentType: 'image/png' }).expect(303);
  const saved = models.lots.findById(lot.id).plan_image;
  assert.match(saved, /^\/uploads\/plans\/[a-z0-9-]+\.png$/);
  assert.ok(fs.existsSync(path.join(config.uploadDir, saved.slice('/uploads/'.length))));

  const fake = await post().attach('plan_image', Buffer.from('<?php echo 1; ?>'), { filename: 'plan.png', contentType: 'image/png' }).expect(400);
  assert.match(fake.text, /n’est pas une image JPEG, PNG ou WebP valide/);
  const svg = await post().attach('plan_image', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { filename: 'plan.svg', contentType: 'image/svg+xml' }).expect(400);
  assert.match(svg.text, /Seules les images JPEG, PNG ou WebP/);
  const big = Buffer.concat([PNG, Buffer.alloc(config.maxUploadBytes + 10)]);
  const tooBig = await post().attach('plan_image', big, { filename: 'plan.png', contentType: 'image/png' }).expect(413);
  assert.match(tooBig.text, /trop volumineux/);
  assert.equal(models.lots.findById(lot.id).plan_image, saved);
});

test('programme : création, slug unique, archivage masque la page publique', async () => {
  const { app, models } = await makeApp();
  const { agent, csrf } = await loggedAgent(app);
  const res = await agent.post('/admin/programmes').field('_csrf', csrf).field('name', 'Résidence Essai').field('city', 'Serris')
    .field('postal_code', '77700').field('status', 'publie').attach('hero_image', PNG, { filename: 'h.png', contentType: 'image/png' }).expect(303);
  const p = models.programmes.findBySlug('residence-essai');
  assert.ok(p && p.hero_image);
  assert.equal(res.headers.location, `/admin/programmes/${p.id}/lots`);
  await request(app).get('/programmes/residence-essai').expect(200);
  const dup = await agent.post('/admin/programmes').field('_csrf', csrf).field('name', 'Résidence Essai').field('city', 'Serris').expect(422);
  assert.match(dup.text, /déjà utilisée/);
  await agent.post(`/admin/programmes/${p.id}/archiver`).type('form').send({ _csrf: csrf }).expect(303);
  await request(app).get('/programmes/residence-essai').expect(404);
});
