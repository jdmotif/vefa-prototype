'use strict';
/*
 * Import de lots depuis un fichier CSV ou Excel (.xlsx).
 * 1. parseFile()      : lit le fichier et renvoie des lignes brutes (objets clé → texte)
 * 2. analyzeRows()    : associe les colonnes, valide chaque ligne, détecte créations / mises à jour
 * 3. applyImport()    : écrit les lignes valides en base, dans une transaction
 */
const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');
const { validateLot, normalizeKey } = require('./validation');

// En-têtes acceptés (insensibles à la casse, aux accents, espaces et ponctuation).
const COLUMN_ALIASES = {
  reference: ['reference', 'ref', 'lot', 'numerolot', 'numero', 'nlot'],
  building: ['batiment', 'bat', 'building', 'immeuble'],
  floor: ['etage', 'niveau', 'floor'],
  typology: ['typologie', 'typo', 'type'],
  surface: ['surface', 'surfacehabitable', 'shab', 'surfacem2'],
  outdoor_type: ['exterieur', 'typeexterieur', 'annexe', 'balconterrassejardin'],
  outdoor_surface: ['surfaceexterieur', 'surfaceexterieure', 'surfaceannexe', 'surfaceexterieurm2'],
  orientation: ['orientation', 'exposition', 'expo'],
  parking: ['parking', 'parkings', 'stationnement', 'places'],
  price: ['prix', 'prixttc', 'prixttceuros', 'prixeuros', 'price'],
  status: ['statut', 'etat', 'disponibilite', 'status'],
};
const REQUIRED = ['reference', 'typology', 'surface', 'price'];
const LABELS = { reference: 'reference', typology: 'typologie', surface: 'surface', price: 'prix_ttc' };

const MAX_ROWS = 2000;

function userError(message) {
  return Object.assign(new Error(message), { expose: true });
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ';': 0, ',': 0, '\t': 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch] += 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ';';
}

function decodeText(buffer) {
  // Excel exporte souvent en Windows-1252 : on bascule si l'UTF-8 n'est pas valide.
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  return new TextDecoder('windows-1252').decode(buffer);
}

function parseCsv(buffer) {
  const text = decodeText(buffer);
  const records = parse(text, {
    delimiter: detectDelimiter(text),
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
    bom: true,
  });
  if (!records.length) return { headers: [], rows: [] };
  const [headers, ...rows] = records;
  return { headers, rows };
}

function cellToText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((r) => r.text).join('');
    if ('result' in value) return cellToText(value.result); // formule
    if (value.text) return String(value.text);
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return '';
  }
  return String(value);
}

async function parseXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (_) {
    throw userError('Le fichier Excel n’a pas pu être lu. Enregistrez-le à nouveau au format .xlsx ou exportez-le en CSV.');
  }
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const all = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const values = [];
    for (let c = 1; c <= ws.columnCount; c++) values.push(cellToText(row.getCell(c).value).trim());
    if (values.some((v) => v !== '')) all.push(values);
  });
  if (!all.length) return { headers: [], rows: [] };
  const [headers, ...rows] = all;
  return { headers, rows };
}

/** Lit un fichier CSV ou XLSX. Lève une erreur au message lisible si le format est inconnu. */
async function parseFile(buffer, filename) {
  const ext = String(filename || '').toLowerCase().split('.').pop();
  const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b; // « PK » : fichier xlsx
  if (ext === 'xlsx') {
    if (!isZip) throw userError('Le fichier .xlsx semble corrompu.');
    return parseXlsx(buffer);
  }
  if (ext === 'csv' || ext === 'txt') {
    if (isZip) throw userError('Ce fichier n’est pas un CSV.');
    return parseCsv(buffer);
  }
  if (ext === 'xls') throw userError('L’ancien format .xls n’est pas pris en charge : enregistrez le fichier en .xlsx ou en .csv.');
  throw userError('Format non pris en charge : utilisez un fichier .csv ou .xlsx.');
}

function mapHeaders(headers) {
  const mapping = {};
  const unknown = [];
  headers.forEach((h, idx) => {
    const key = normalizeKey(h);
    const field = Object.keys(COLUMN_ALIASES).find((f) => COLUMN_ALIASES[f].includes(key));
    if (field && mapping[field] === undefined) mapping[field] = idx;
    else if (key) unknown.push(String(h));
  });
  const missing = REQUIRED.filter((f) => mapping[f] === undefined).map((f) => LABELS[f]);
  return { mapping, missing, unknown };
}

/**
 * Valide toutes les lignes. existingRefs : références déjà présentes dans le programme.
 * Les numéros de ligne correspondent à ceux du tableur (la ligne 1 est l'en-tête).
 */
function analyzeRows({ headers, rows }, existingRefs = []) {
  const { mapping, missing, unknown } = mapHeaders(headers);
  const result = { fileErrors: [], unknownColumns: unknown, rows: [], summary: { total: 0, valid: 0, invalid: 0, create: 0, update: 0 } };
  if (!headers.length) {
    result.fileErrors.push('Le fichier est vide.');
    return result;
  }
  if (missing.length) {
    result.fileErrors.push(`Colonnes obligatoires manquantes : ${missing.join(', ')}. Vérifiez la première ligne du fichier.`);
    return result;
  }
  if (rows.length > MAX_ROWS) {
    result.fileErrors.push(`Le fichier contient ${rows.length} lignes : la limite est de ${MAX_ROWS} lots par import.`);
    return result;
  }

  const existing = new Set(existingRefs.map((r) => String(r).toUpperCase()));
  const seen = new Map();

  rows.forEach((cells, i) => {
    const line = i + 2;
    const raw = {};
    for (const [field, idx] of Object.entries(mapping)) raw[field] = cells[idx] ?? '';
    const { value, errors } = validateLot(raw);
    if (value.reference && seen.has(value.reference)) {
      errors.push(`Référence « ${value.reference} » en double (déjà présente ligne ${seen.get(value.reference)}).`);
    } else if (value.reference) {
      seen.set(value.reference, line);
    }
    const action = existing.has(value.reference) ? 'update' : 'create';
    result.rows.push({ line, raw, value, errors, action });
  });

  for (const r of result.rows) {
    result.summary.total += 1;
    if (r.errors.length) result.summary.invalid += 1;
    else {
      result.summary.valid += 1;
      result.summary[r.action] += 1;
    }
  }
  return result;
}

/**
 * Écrit les lignes valides : création ou mise à jour selon la référence.
 * Les colonnes absentes du fichier ne modifient pas les lots existants.
 */
function applyImport(db, programmeId, analysis) {
  const presentFields = new Set();
  for (const r of analysis.rows) for (const k of Object.keys(r.raw)) presentFields.add(k);
  const fields = ['building', 'floor', 'typology', 'surface', 'outdoor_type', 'outdoor_surface', 'orientation', 'parking', 'price', 'status']
    .filter((f) => presentFields.has(f) || REQUIRED.includes(f));

  const insert = db.prepare(`INSERT INTO lots (programme_id, reference, building, floor, typology, surface, outdoor_type,
      outdoor_surface, orientation, parking, price, status)
    VALUES (@programme_id, @reference, @building, @floor, @typology, @surface, @outdoor_type,
      @outdoor_surface, @orientation, @parking, @price, @status)
    ON CONFLICT (programme_id, reference) DO UPDATE SET
      ${fields.map((f) => `${f} = excluded.${f}`).join(', ')}, updated_at = datetime('now')`);

  const run = db.transaction((rows) => {
    let count = 0;
    for (const r of rows) {
      if (r.errors.length) continue;
      insert.run({
        building: '', floor: 0, outdoor_type: 'aucun', outdoor_surface: null, orientation: '', parking: 0, status: 'disponible',
        ...r.value, programme_id: programmeId,
      });
      count += 1;
    }
    return count;
  });
  return run(analysis.rows);
}

module.exports = { parseFile, analyzeRows, applyImport, mapHeaders, COLUMN_ALIASES, MAX_ROWS };
