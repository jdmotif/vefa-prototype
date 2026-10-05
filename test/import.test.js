'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const request = require('supertest');
const ExcelJS = require('exceljs');
const { parseFile, analyzeRows, applyImport } = require('../src/lib/importLots');
const { openDatabase } = require('../src/db');
const { makeApp } = require('./helpers');

const HEADER = 'reference;batiment;etage;typologie;surface;exterieur;surface_exterieur;orientation;parking;prix_ttc;statut';
const csv = (...lines) => Buffer.from([HEADER, ...lines].join('\n'), 'utf8');

function freshDb() {
  const db = openDatabase(':memory:');
  const id = db.prepare("INSERT INTO programmes (slug, name, city) VALUES ('test', 'Test', 'Meaux')").run().lastInsertRowid;
  return { db, id };
}

test('CSV français (point-virgule, virgule décimale, RDC, accents) correctement lu', async () => {
  const a = analyzeRows(await parseFile(csv('A01;A;RDC;T2;44,5;jardin;62;S;1;239 000;Disponible', 'A11;A;1er;t3;66.2;Balcon;8;so;oui;329000;Réservé'), 'l.csv'));
  assert.deepEqual(a.fileErrors, []);
  assert.equal(a.summary.valid, 2);
  assert.deepEqual(a.rows[0].value, { reference: 'A01', building: 'A', floor: 0, typology: 'T2', surface: 44.5, outdoor_type: 'jardin', outdoor_surface: 62, orientation: 'S', parking: 1, price: 239000, status: 'disponible' });
  assert.equal(a.rows[1].value.floor, 1);
  assert.equal(a.rows[1].value.typology, 'T3');
  assert.equal(a.rows[1].value.orientation, 'SO');
  assert.equal(a.rows[1].value.status, 'reserve');
});

test('séparateur virgule et en-têtes avec accents / majuscules acceptés', async () => {
  const buf = Buffer.from('Référence,Bâtiment,Étage,Typologie,Surface,Prix TTC,Statut\nB21,B,2,T4,"84,7",412000,vendu\n');
  const a = analyzeRows(await parseFile(buf, 'x.csv'));
  assert.deepEqual(a.fileErrors, []);
  assert.equal(a.rows[0].value.surface, 84.7);
  assert.equal(a.rows[0].value.status, 'vendu');
});

test('rapport d’erreurs ligne par ligne, avec numéros de ligne du tableur', async () => {
  const a = analyzeRows(await parseFile(csv(
    'E01;E;RDC;T2;44;jardin;60;S;1;239000;Disponible',
    'E02;E;1;T7;66;balcon;8;S;1;329000;Disponible',
    'E03;E;deux;T3;68;balcon;9;S;1;345000;Disponible',
    'E04;E;2;T3;;balcon;9;S;1;345000;En cours',
    'E01;E;3;T4;84;balcon;10;E;1;412000;Vendu',
    'E05;E;3;T2;45;piscine;;Z;1;12;Disponible',
  ), 'e.csv'));
  assert.equal(a.summary.total, 6);
  assert.equal(a.summary.valid, 1);
  assert.equal(a.summary.invalid, 5);
  const byLine = Object.fromEntries(a.rows.map((r) => [r.line, r.errors.join(' | ')]));
  assert.equal(byLine[2], '');
  assert.match(byLine[3], /Typologie « T7 »/);
  assert.match(byLine[4], /Étage « deux »/);
  assert.match(byLine[5], /Surface/);
  assert.match(byLine[5], /Statut « En cours »/);
  assert.match(byLine[6], /en double \(déjà présente ligne 2\)/);
  assert.match(byLine[7], /Extérieur « piscine »/);
  assert.match(byLine[7], /Orientation « Z »/);
  assert.match(byLine[7], /Prix « 12 »/);
});

test('colonnes obligatoires manquantes : erreur de fichier claire', async () => {
  const a = analyzeRows(await parseFile(Buffer.from('reference;surface\nA1;40\n'), 'x.csv'));
  assert.equal(a.rows.length, 0);
  assert.match(a.fileErrors[0], /typologie, prix_ttc/);
});

test('formats refusés : .xls, faux .xlsx, extension inconnue', async () => {
  await assert.rejects(parseFile(Buffer.from('x'), 'lots.xls'), /\.xls n’est pas pris en charge/);
  await assert.rejects(parseFile(Buffer.from('pas un zip'), 'lots.xlsx'), /corrompu/);
  await assert.rejects(parseFile(Buffer.from('x'), 'lots.pdf'), /Format non pris en charge/);
});

test('fichier Excel .xlsx lu (nombres, formules)', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Lots');
  ws.addRow(['Référence', 'Typologie', 'Surface', 'Prix TTC', 'Etage']);
  ws.addRow(['C31', 'T5', 101.3, 539000, 3]);
  ws.addRow(['C32', 'T2', 45, { formula: '200000+5000', result: 205000 }, 'RDC']);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const a = analyzeRows(await parseFile(buf, 'lots.xlsx'));
  assert.deepEqual(a.fileErrors, []);
  assert.equal(a.summary.valid, 2);
  assert.equal(a.rows[1].value.price, 205000);
  assert.equal(a.rows[1].value.floor, 0);
});

test('applyImport : crée, met à jour par référence et ignore les lignes en erreur', async () => {
  const { db, id } = freshDb();
  db.prepare("INSERT INTO lots (programme_id, reference, typology, surface, price, status, building, plan_image) VALUES (?, 'A01', 'T2', 40, 200000, 'disponible', 'A', '/uploads/plans/x.png')").run(id);
  const existing = db.prepare('SELECT reference FROM lots WHERE programme_id = ?').all(id).map((r) => r.reference);
  // Fichier sans colonne bâtiment : le bâtiment existant ne doit pas être effacé
  const buf = Buffer.from('reference;typologie;surface;prix_ttc;statut\nA01;T2;41;210000;Vendu\nA02;T3;66;300000;\nA03;T9;66;300000;\n');
  const a = analyzeRows(await parseFile(buf, 'x.csv'), existing);
  assert.equal(a.summary.update, 1);
  assert.equal(a.summary.create, 1);
  assert.equal(a.summary.invalid, 1);
  assert.equal(applyImport(db, id, a), 2);
  const lots = db.prepare('SELECT * FROM lots WHERE programme_id = ? ORDER BY reference').all(id);
  assert.deepEqual(lots.map((l) => [l.reference, l.surface, l.price, l.status, l.building]), [
    ['A01', 41, 210000, 'vendu', 'A'],
    ['A02', 66, 300000, 'disponible', ''],
  ]);
  assert.equal(lots[0].plan_image, '/uploads/plans/x.png');
});

async function login(agent) {
  const page = await agent.get('/admin/connexion');
  const csrf = page.text.match(/name="_csrf" value="([a-f0-9]+)"/)[1];
  await agent.post('/admin/connexion').type('form').send({ _csrf: csrf, email: 'admin@exemple.fr', password: 'mot-de-passe-de-test' }).expect(303);
  const home = await agent.get('/admin').expect(200);
  return home.text.match(/data-csrf="([a-f0-9]+)"/)[1];
}

test('parcours complet dans le back-office : aperçu puis validation', async () => {
  const { app, models } = await makeApp();
  const agent = request.agent(app);
  const csrf = await login(agent);
  const p = models.programmes.findBySlug('villa-horizon');
  const before = models.lots.listByProgramme(p.id).length;

  const preview = await agent.post(`/admin/programmes/${p.id}/import`)
    .field('_csrf', csrf)
    .attach('fichier', path.join(__dirname, '..', 'exemples', 'lots-avec-erreurs.csv'))
    .expect(200);
  assert.match(preview.text, /Rapport d’erreurs/);
  assert.match(preview.text, /Ligne 3/);
  // Rien n'est encore écrit
  assert.equal(models.lots.listByProgramme(p.id).length, before);

  const token = preview.text.match(/name="token" value="([a-f0-9]+)"/)[1];
  await agent.post(`/admin/programmes/${p.id}/import/confirmer`).type('form').send({ _csrf: csrf, token }).expect(303);
  assert.equal(models.lots.listByProgramme(p.id).length, before + 1);
  // Le jeton d'aperçu n'est utilisable qu'une fois
  await agent.post(`/admin/programmes/${p.id}/import/confirmer`).type('form').send({ _csrf: csrf, token }).expect(303);
  assert.equal(models.lots.listByProgramme(p.id).length, before + 1);
});

test('import refusé sans jeton CSRF ou sans connexion', async () => {
  const { app } = await makeApp();
  const file = fs.readFileSync(path.join(__dirname, '..', 'exemples', 'lots-exemple.csv'));
  await request(app).post('/admin/programmes/1/import').attach('fichier', file, 'l.csv').expect(302).expect('location', '/admin/connexion');
  const agent = request.agent(app);
  await login(agent);
  await agent.post('/admin/programmes/1/import').field('_csrf', 'faux').attach('fichier', file, 'l.csv').expect(403);
});
