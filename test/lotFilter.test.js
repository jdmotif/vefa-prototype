'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { parseCriteria, filterLots } = require('../src/lib/lotFilter');
const { makeApp } = require('./helpers');

const LOTS = [
  { id: 1, reference: 'A01', typology: 'T2', surface: 44, price: 230000, floor: 0, status: 'disponible' },
  { id: 2, reference: 'A11', typology: 'T3', surface: 65, price: 310000, floor: 1, status: 'reserve' },
  { id: 3, reference: 'A12', typology: 'T3', surface: 70, price: 335000, floor: 1, status: 'vendu' },
  { id: 4, reference: 'A21', typology: 'T4', surface: 85, price: 420000, floor: 2, status: 'disponible' },
  { id: 5, reference: 'M1', typology: 'Maison', surface: 98, price: 410000, floor: 0, status: 'disponible' },
  { id: 6, reference: 'A22', typology: 'T1', surface: 28, price: 170000, floor: 2, status: 'disponible' },
];
const refs = (list) => list.map((l) => l.reference);

test('sans filtre : tous les lots, triés par prix croissant', () => {
  assert.deepEqual(refs(filterLots(LOTS, {})), ['A22', 'A01', 'A11', 'A12', 'M1', 'A21']);
});

test('filtre par typologie (plusieurs valeurs)', () => {
  assert.deepEqual(refs(filterLots(LOTS, { typologie: ['T3', 'Maison'] })), ['A11', 'A12', 'M1']);
  assert.deepEqual(refs(filterLots(LOTS, { typologie: 'T2,T4' })), ['A01', 'A21']);
});

test('filtre surface min / max', () => {
  assert.deepEqual(refs(filterLots(LOTS, { surface_min: '60', surface_max: '85' })), ['A11', 'A12', 'A21']);
});

test('filtre budget max (format français accepté)', () => {
  assert.deepEqual(refs(filterLots(LOTS, { budget_max: '310 000 €' })), ['A22', 'A01', 'A11']);
});

test('filtre étage (0 = RDC) et statut', () => {
  assert.deepEqual(refs(filterLots(LOTS, { etage: '0' })), ['A01', 'M1']);
  assert.deepEqual(refs(filterLots(LOTS, { statut: 'disponible', etage: '2' })), ['A22', 'A21']);
  assert.deepEqual(refs(filterLots(LOTS, { statut: ['reserve', 'vendu'] })), ['A11', 'A12']);
});

test('tris par prix, surface et étage', () => {
  assert.deepEqual(refs(filterLots(LOTS, { tri: 'prix-desc' })), ['A21', 'M1', 'A12', 'A11', 'A01', 'A22']);
  assert.deepEqual(refs(filterLots(LOTS, { tri: 'surface-asc' })), ['A22', 'A01', 'A11', 'A12', 'A21', 'M1']);
  // À étage égal, ordre par référence
  assert.deepEqual(refs(filterLots(LOTS, { tri: 'etage-desc' })), ['A21', 'A22', 'A11', 'A12', 'A01', 'M1']);
});

test('valeurs invalides ignorées sans erreur', () => {
  const c = parseCriteria({ typologie: ['T9', '<script>'], statut: 'perdu', surface_min: 'abc', budget_max: '-5', etage: '1.5', tri: 'nimporte' });
  assert.deepEqual(c, { typologies: [], statuses: [], surfaceMin: null, surfaceMax: null, budgetMax: null, floor: null, sort: 'prix-asc' });
  assert.equal(filterLots(LOTS, c).length, LOTS.length);
});

test('combinaison de filtres sans résultat', () => {
  assert.deepEqual(filterLots(LOTS, { typologie: 'T4', budget_max: '200000' }), []);
});

test('la liste d’origine n’est pas modifiée', () => {
  const copy = JSON.parse(JSON.stringify(LOTS));
  filterLots(LOTS, { tri: 'prix-desc', typologie: 'T3' });
  assert.deepEqual(LOTS, copy);
});

test('API et page programme appliquent les mêmes filtres côté serveur', async () => {
  const { app } = await makeApp();
  const res = await request(app).get('/api/programmes/villa-horizon/lots?typologie=T3&statut=disponible&tri=prix-desc').expect(200);
  assert.ok(res.body.length > 0);
  assert.ok(res.body.every((l) => l.typology === 'T3' && l.status === 'disponible'));
  for (let i = 1; i < res.body.length; i++) assert.ok(res.body[i - 1].price >= res.body[i].price);

  const page = await request(app).get('/programmes/villa-horizon?typologie=T3&statut=disponible').expect(200);
  const visibleRows = page.text.match(/<tr class="lot-row[^"]*" data-lot-id="\d+" >/g) || [];
  assert.equal(visibleRows.length, res.body.length);
});

test('les lots vendus restent affichés (grisés) et les réservés ont un badge', async () => {
  const { app } = await makeApp();
  const page = await request(app).get('/programmes/villa-horizon').expect(200);
  assert.match(page.text, /lot-row is-vendu/);
  assert.match(page.text, /badge badge--reserve">Réservé/);
});
