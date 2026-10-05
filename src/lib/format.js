'use strict';
const { LOT_STATUSES, OUTDOOR_TYPES, LEAD_STATUSES, LEAD_PROJECTS, PROGRAMME_STATUSES } = require('./constants');

const priceFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

function price(v) { return v == null || v === '' ? '' : priceFmt.format(v); }
function surface(v) { return v == null || v === '' ? '' : `${numFmt.format(v)} m²`; }
function floor(v) {
  const n = Number(v);
  if (n === 0) return 'RDC';
  if (n === 1) return '1er';
  if (n < 0) return `${n}`;
  return `${n}e`;
}
function outdoor(lot) {
  if (!lot.outdoor_type || lot.outdoor_type === 'aucun') return '—';
  const label = OUTDOOR_TYPES[lot.outdoor_type] || lot.outdoor_type;
  return lot.outdoor_surface ? `${label} ${numFmt.format(lot.outdoor_surface)} m²` : label;
}
function parking(n) {
  n = Number(n) || 0;
  if (n === 0) return 'Non';
  return n === 1 ? '1 place' : `${n} places`;
}
function date(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
}
function dateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
}
function lines(text) {
  return String(text || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

module.exports = {
  price, surface, floor, outdoor, parking, date, dateTime, lines,
  lotStatus: (s) => LOT_STATUSES[s] || s,
  leadStatus: (s) => LEAD_STATUSES[s] || s,
  leadProject: (s) => LEAD_PROJECTS[s] || s,
  programmeStatus: (s) => PROGRAMME_STATUSES[s] || s,
};
