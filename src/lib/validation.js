'use strict';
const { TYPOLOGIES, LOT_STATUSES, OUTDOOR_TYPES, PROGRAMME_STATUSES, LEAD_PROJECTS } = require('./constants');

// Les messages d'erreur sont en français et destinés à être affichés tels quels.

function str(v, max = 255) {
  if (v === undefined || v === null) return '';
  // Supprime les caractères de contrôle (sauf retours à la ligne et tabulations).
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

/** Nombre au format français ou anglais : « 245 000 », « 245000,50 », « 64.5 ». */
function parseNumber(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = String(v).replace(/[\s  €]/g, '').replace(/m²|m2/gi, '').replace(',', '.');
  if (s === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}

function normalizeKey(v) {
  return str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
}

const TYPO_ALIASES = { t1: 'T1', studio: 'T1', t2: 'T2', t3: 'T3', t4: 'T4', t5: 'T5', maison: 'Maison', villa: 'Maison' };
const STATUS_ALIASES = { disponible: 'disponible', libre: 'disponible', dispo: 'disponible',
  reserve: 'reserve', reservee: 'reserve', option: 'reserve', vendu: 'vendu', vendue: 'vendu', acte: 'vendu' };
const OUTDOOR_ALIASES = { '': 'aucun', aucun: 'aucun', non: 'aucun', balcon: 'balcon', loggia: 'balcon',
  terrasse: 'terrasse', jardin: 'jardin' };

function parseFloorValue(v) {
  const k = normalizeKey(v);
  if (k === 'rdc' || k === 'rezdechaussee') return 0;
  const n = parseNumber(String(v ?? '').replace(/(er|e|eme|ème)$/i, ''));
  return n;
}

/**
 * Valide les données d'un lot (formulaire du back-office ou ligne d'import).
 * Retourne { value, errors } où errors est une liste de messages.
 */
function validateLot(input) {
  const errors = [];
  const v = {};

  v.reference = str(input.reference, 20).toUpperCase();
  if (!v.reference) errors.push('La référence est obligatoire.');
  else if (!/^[A-Z0-9][A-Z0-9 ._-]*$/.test(v.reference)) errors.push(`Référence « ${v.reference} » invalide (lettres, chiffres, tiret, point).`);

  v.building = str(input.building, 40);

  const floor = parseFloorValue(input.floor);
  if (floor === null) v.floor = 0;
  else if (Number.isNaN(floor) || !Number.isInteger(floor) || floor < -3 || floor > 60) errors.push(`Étage « ${str(input.floor)} » invalide (nombre entier ou RDC).`);
  else v.floor = floor;

  v.typology = TYPO_ALIASES[normalizeKey(input.typology)];
  if (!v.typology) errors.push(`Typologie « ${str(input.typology)} » invalide (attendu : ${TYPOLOGIES.join(', ')}).`);

  const surface = parseNumber(input.surface);
  if (surface === null || Number.isNaN(surface) || surface < 9 || surface > 1000) errors.push(`Surface « ${str(input.surface)} » invalide (en m², entre 9 et 1000).`);
  else v.surface = Math.round(surface * 100) / 100;

  v.outdoor_type = OUTDOOR_ALIASES[normalizeKey(input.outdoor_type)];
  if (!v.outdoor_type) errors.push(`Extérieur « ${str(input.outdoor_type)} » invalide (attendu : ${Object.keys(OUTDOOR_TYPES).join(', ')}).`);

  const outdoorSurface = parseNumber(input.outdoor_surface);
  if (outdoorSurface === null) v.outdoor_surface = null;
  else if (Number.isNaN(outdoorSurface) || outdoorSurface < 0 || outdoorSurface > 5000) errors.push(`Surface extérieure « ${str(input.outdoor_surface)} » invalide.`);
  else v.outdoor_surface = v.outdoor_type === 'aucun' ? null : outdoorSurface;

  v.orientation = str(input.orientation, 10).toUpperCase().replace(/W/g, 'O');
  if (v.orientation && !/^(N|S|E|O|NE|NO|SE|SO)(-(N|S|E|O|NE|NO|SE|SO))*$/.test(v.orientation)) {
    errors.push(`Orientation « ${v.orientation} » invalide (ex. S, SO, E-O).`);
  }

  const parkingKey = normalizeKey(input.parking);
  let parking;
  if (parkingKey === '' || parkingKey === 'non' || parkingKey === 'aucun') parking = 0;
  else if (parkingKey === 'oui') parking = 1;
  else parking = parseNumber(input.parking);
  if (Number.isNaN(parking) || !Number.isInteger(parking) || parking < 0 || parking > 10) errors.push(`Parking « ${str(input.parking)} » invalide (nombre de places, oui ou non).`);
  else v.parking = parking;

  const price = parseNumber(input.price);
  if (price === null || Number.isNaN(price) || price < 10000 || price > 20000000) errors.push(`Prix « ${str(input.price)} » invalide (en euros TTC).`);
  else v.price = Math.round(price);

  v.status = STATUS_ALIASES[normalizeKey(input.status || 'disponible')];
  if (!v.status) errors.push(`Statut « ${str(input.status)} » invalide (attendu : ${Object.values(LOT_STATUSES).join(', ')}).`);

  return { value: v, errors };
}

function slugify(s) {
  return str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function validateProgramme(input) {
  const errors = [];
  const v = {
    name: str(input.name, 120),
    city: str(input.city, 80),
    postal_code: str(input.postal_code, 5),
    address: str(input.address, 200),
    tagline: str(input.tagline, 160),
    description: str(input.description, 5000),
    highlights: str(input.highlights, 2000),
    delivery: str(input.delivery, 80),
    status: str(input.status, 20) || 'brouillon',
  };
  v.slug = slugify(input.slug || v.name);
  if (!v.name) errors.push('Le nom du programme est obligatoire.');
  if (!v.city) errors.push('La ville est obligatoire.');
  if (v.postal_code && !/^(75|77|78|91|92|93|94|95)\d{3}$/.test(v.postal_code)) errors.push('Le code postal doit être un code postal d’Île-de-France à 5 chiffres.');
  if (!v.slug) errors.push('L’adresse web (slug) est invalide.');
  if (!PROGRAMME_STATUSES[v.status]) errors.push('Statut de programme invalide.');
  return { value: v, errors };
}

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;

function validateLead(input) {
  const errors = {};
  const v = {
    name: str(input.name, 100),
    email: str(input.email, 160).toLowerCase(),
    phone: str(input.phone, 30),
    project: str(input.project, 20),
    message: str(input.message, 2000),
  };
  if (v.name.length < 2) errors.name = 'Indiquez votre nom.';
  if (!EMAIL_RE.test(v.email)) errors.email = 'Indiquez une adresse e-mail valide.';
  const digits = v.phone.replace(/[\s.()-]/g, '');
  if (!/^(\+33|0033|0)[1-9]\d{8}$/.test(digits) && !/^\+\d{8,15}$/.test(digits)) errors.phone = 'Indiquez un numéro de téléphone valide.';
  if (!LEAD_PROJECTS[v.project]) errors.project = 'Précisez si vous souhaitez habiter ou investir.';
  const budget = parseNumber(input.budget);
  if (budget === null) v.budget = null;
  else if (Number.isNaN(budget) || budget < 0 || budget > 50000000) errors.budget = 'Indiquez un budget en euros (chiffres uniquement).';
  else v.budget = Math.round(budget);
  if (input.consent !== 'oui' && input.consent !== 'on') errors.consent = 'Votre accord est nécessaire pour que nous puissions vous recontacter.';
  return { value: v, errors };
}

function toInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = { str, parseNumber, normalizeKey, validateLot, validateProgramme, validateLead, slugify, toInt };
