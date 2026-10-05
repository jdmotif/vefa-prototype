'use strict';
/*
 * Données de démonstration : 3 programmes FICTIFS, ~15 lots chacun, quelques demandes fictives.
 * Usage : npm run seed   (remplace toutes les données existantes, sauf les comptes administrateur)
 */
const path = require('path');
const { writeDemoImages } = require('./demoImages');

const PROGRAMMES = [
  {
    slug: 'les-jardins-de-lorangerie', name: 'Les Jardins de l’Orangerie', city: 'Bussy-Saint-Georges', postal_code: '77600',
    address: 'Secteur gare RER A – adresse précise communiquée sur rendez-vous',
    tagline: 'Une résidence intimiste au cœur d’un îlot paysager',
    description: 'Les Jardins de l’Orangerie réunissent 3 petits bâtiments de 4 étages autour d’un cœur d’îlot planté. Les appartements, du studio au 5 pièces, bénéficient de larges ouvertures, d’espaces extérieurs pour la plupart et de prestations soignées : parquet dans les chambres, salle de bains équipée, volets roulants électriques.\n\nÀ quelques minutes à pied de la gare RER A, la résidence profite des commerces, écoles et équipements sportifs du quartier.',
    highlights: 'À 8 minutes à pied du RER A\nCœur d’îlot paysager de 1 200 m²\nBalcons, terrasses ou jardins privatifs\nRésidence conforme RE2020\nParking en sous-sol sécurisé',
    delivery: '2e trimestre 2027', theme: 0,
    buildings: ['A', 'B', 'C'],
  },
  {
    slug: 'villa-horizon', name: 'Villa Horizon', city: 'Villiers-sur-Marne', postal_code: '94350',
    address: 'Proximité future gare Grand Paris Express – adresse précise communiquée sur rendez-vous',
    tagline: 'Des vues dégagées et des terrasses en attique',
    description: 'Villa Horizon est un immeuble contemporain de 6 étages, pensé pour la lumière : séjours traversants, grandes baies vitrées et terrasses en attique. Les logements, du 2 au 4 pièces, conviennent aussi bien aux familles qu’aux investisseurs.\n\nLa résidence se situe à proximité des futures connexions du Grand Paris Express et des grands axes routiers.',
    highlights: 'Proche des futures lignes du Grand Paris Express\nAttiques avec terrasses panoramiques\nCuisines aménagées dans les T3 et T4\nLocal vélos et bornes de recharge\nÉligible au prêt à taux zéro (sous conditions)',
    delivery: '4e trimestre 2027', theme: 1,
    buildings: ['A'],
  },
  {
    slug: 'le-clos-des-lavandieres', name: 'Le Clos des Lavandières', city: 'Meaux', postal_code: '77100',
    address: 'Quartier résidentiel – adresse précise communiquée sur rendez-vous',
    tagline: 'Maisons et appartements au calme, près des bords de Marne',
    description: 'Le Clos des Lavandières associe un petit collectif de 3 étages et des maisons individuelles avec jardin. Une adresse paisible, à quelques minutes du centre historique et de la gare, idéale pour une première acquisition comme pour une famille qui s’agrandit.',
    highlights: 'Maisons avec jardin et garage\nÀ proximité des bords de Marne\nÉcoles et commerces à pied\nChauffage par pompe à chaleur\nFrais de notaire réduits',
    delivery: '1er trimestre 2028', theme: 2,
    buildings: ['A', 'M'],
  },
];

const BASE_SURFACE = { T1: 27, T2: 42, T3: 63, T4: 81, T5: 98, Maison: 95 };
const PRICE_PER_M2 = { 'Bussy-Saint-Georges': 5200, 'Villiers-sur-Marne': 5600, Meaux: 4100 };
const ORIENTATIONS = ['S', 'SO', 'O', 'E', 'SE', 'N-S', 'E-O', 'NE'];

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 4294967296; };
}

function buildLots(p, idx, plans) {
  const r = rng(42 + idx * 1000);
  const lots = [];
  const typoMix = p.slug === 'le-clos-des-lavandieres'
    ? ['T2', 'T2', 'T3', 'T3', 'T3', 'T4', 'T1', 'T2', 'T3', 'Maison', 'Maison', 'Maison', 'Maison', 'Maison', 'T4']
    : p.slug === 'villa-horizon'
      ? ['T2', 'T2', 'T2', 'T3', 'T3', 'T3', 'T3', 'T4', 'T4', 'T2', 'T3', 'T4', 'T3', 'T4', 'T5', 'T2']
      : ['T1', 'T2', 'T2', 'T3', 'T3', 'T4', 'T1', 'T2', 'T3', 'T3', 'T4', 'T5', 'T2', 'T3', 'T4'];
  const counters = {};
  typoMix.forEach((typology, i) => {
    const isHouse = typology === 'Maison';
    const building = isHouse ? 'M' : p.buildings[i % p.buildings.filter((b) => b !== 'M').length];
    const maxFloor = p.slug === 'villa-horizon' ? 6 : 4;
    const floor = isHouse ? 0 : Math.floor(r() * (maxFloor + 1));
    // Référence = bâtiment + étage + numéro d'ordre sur le palier (ex. A11 : bâtiment A, 1er étage, lot 1)
    const key = isHouse ? 'M' : `${building}${floor}`;
    counters[key] = (counters[key] || 0) + 1;
    const reference = isHouse ? `M${counters[key]}` : `${building}${floor}${counters[key]}`;
    const surface = Math.round((BASE_SURFACE[typology] + r() * 9) * 10) / 10;
    let outdoor_type = 'balcon';
    if (isHouse || floor === 0) outdoor_type = 'jardin';
    else if (floor >= maxFloor - 1 && r() > 0.4) outdoor_type = 'terrasse';
    else if (r() < 0.15) outdoor_type = 'aucun';
    const outdoor_surface = outdoor_type === 'aucun' ? null
      : Math.round((outdoor_type === 'jardin' ? 40 + r() * 120 : outdoor_type === 'terrasse' ? 14 + r() * 20 : 5 + r() * 6) * 10) / 10;
    const ppm2 = PRICE_PER_M2[p.city] * (1 + floor * 0.015) * (isHouse ? 0.95 : 1);
    const price = Math.round((surface * ppm2 + (outdoor_surface || 0) * 400) / 500) * 500;
    const st = r();
    const status = st < 0.55 ? 'disponible' : st < 0.75 ? 'reserve' : 'vendu';
    lots.push({
      reference, building, floor, typology, surface, outdoor_type, outdoor_surface,
      orientation: ORIENTATIONS[Math.floor(r() * ORIENTATIONS.length)],
      parking: isHouse ? 2 : (typology === 'T1' ? 0 : (r() > 0.25 ? 1 : 0)),
      price, status,
      plan_image: r() > 0.2 ? plans[typology] : null, // quelques lots sans plan, pour la démonstration
    });
  });
  return lots;
}

const FAKE_FIRST = ['Camille', 'Dominique', 'Alex', 'Claude', 'Sacha', 'Morgan', 'Charlie', 'Lou', 'Noa', 'Eden'];
const FAKE_LAST = ['Exemple', 'Démo', 'Fictif', 'Test', 'Modèle'];

function seed(db, { quiet = false, publicDir = path.join(__dirname, '..', '..', 'public') } = {}) {
  const imgs = writeDemoImages(publicDir);
  const r = rng(7);

  const run = db.transaction(() => {
    db.exec('DELETE FROM leads; DELETE FROM lots; DELETE FROM programme_images; DELETE FROM programmes; DELETE FROM import_previews;');
    const insP = db.prepare(`INSERT INTO programmes (slug, name, city, postal_code, address, tagline, description, highlights, delivery, hero_image, status)
      VALUES (@slug, @name, @city, @postal_code, @address, @tagline, @description, @highlights, @delivery, @hero_image, 'publie')`);
    const insImg = db.prepare('INSERT INTO programme_images (programme_id, path, alt, position) VALUES (?, ?, ?, ?)');
    const insLot = db.prepare(`INSERT INTO lots (programme_id, reference, building, floor, typology, surface, outdoor_type, outdoor_surface, orientation, parking, price, status, plan_image)
      VALUES (@programme_id, @reference, @building, @floor, @typology, @surface, @outdoor_type, @outdoor_surface, @orientation, @parking, @price, @status, @plan_image)`);
    const insLead = db.prepare(`INSERT INTO leads (created_at, programme_id, lot_id, lot_reference, name, email, phone, project, budget, message, consent_at, consent_text, status, notes)
      VALUES (@created_at, @programme_id, @lot_id, @lot_reference, @name, @email, @phone, @project, @budget, @message, @created_at, @consent_text, @status, @notes)`);
    const { CONSENT_TEXT } = require('../lib/constants');
    const altByKind = { facade: 'Illustration de la façade', interieur: 'Illustration d’un intérieur', jardin: 'Illustration des espaces verts' };

    let total = 0;
    const allLots = [];
    PROGRAMMES.forEach((p, i) => {
      const { theme, buildings, ...data } = p;
      const pid = insP.run({ ...data, hero_image: imgs.heroes[theme] }).lastInsertRowid;
      imgs.galleries[theme].forEach((g, k) => insImg.run(pid, g.path, `${altByKind[g.kind]} (visuel de démonstration)`, k));
      for (const lot of buildLots(p, i, imgs.plans)) {
        const id = insLot.run({ ...lot, programme_id: pid }).lastInsertRowid;
        allLots.push({ id, pid, reference: lot.reference, price: lot.price });
        total += 1;
      }
    });

    // 24 demandes fictives réparties sur 10 semaines (aucune donnée réelle).
    const statuses = ['nouveau', 'nouveau', 'contacte', 'contacte', 'rdv', 'perdu', 'vendu'];
    for (let i = 0; i < 24; i++) {
      const lot = allLots[Math.floor(r() * allLots.length)];
      const first = FAKE_FIRST[i % FAKE_FIRST.length];
      const last = FAKE_LAST[i % FAKE_LAST.length];
      const daysAgo = Math.floor(r() * 70);
      const created = new Date(Date.now() - daysAgo * 86400000 - Math.floor(r() * 36000000));
      insLead.run({
        created_at: created.toISOString().slice(0, 19).replace('T', ' '),
        programme_id: lot.pid, lot_id: lot.id, lot_reference: lot.reference,
        name: `${first} ${last}`,
        email: `${first.toLowerCase()}.${last.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}${i}@exemple.fr`,
        phone: `06 00 00 ${String(10 + i).padStart(2, '0')} ${String(20 + i).padStart(2, '0')}`,
        project: r() > 0.4 ? 'habiter' : 'investir',
        budget: Math.round((lot.price * (0.9 + r() * 0.3)) / 5000) * 5000,
        message: 'Demande fictive générée pour la démonstration.',
        consent_text: CONSENT_TEXT,
        status: daysAgo < 7 ? 'nouveau' : statuses[Math.floor(r() * statuses.length)],
        notes: '',
      });
    }
    return total;
  });
  const total = run();
  if (!quiet) console.info(`[seed] ${PROGRAMMES.length} programmes et ${total} lots de démonstration créés, 24 demandes fictives.`);
  return total;
}

if (require.main === module) {
  const { loadConfig } = require('../config');
  const { openDatabase } = require('../db');
  const createModels = require('../models');
  const { ensureInitialAdmin } = require('../lib/auth');
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  seed(db);
  ensureInitialAdmin(createModels(db).users, config).finally(() => db.close());
}

module.exports = { seed, PROGRAMMES };
