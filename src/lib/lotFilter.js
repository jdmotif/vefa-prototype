/*
 * Filtres et tri des lots.
 * Ce fichier est partagé entre le serveur (Node) et le navigateur (servi sur /js/lot-filter.js),
 * afin que le filtrage instantané côté client et le filtrage serveur (sans JavaScript) donnent
 * exactement le même résultat.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LotFilter = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPOLOGIES = ['T1', 'T2', 'T3', 'T4', 'T5', 'Maison'];
  var STATUSES = ['disponible', 'reserve', 'vendu'];
  var SORTS = ['prix-asc', 'prix-desc', 'surface-asc', 'surface-desc', 'etage-asc', 'etage-desc'];

  function toNumber(v) {
    if (v === undefined || v === null) return null;
    var s = String(v).replace(/\s| |€|m²/g, '').replace(',', '.');
    if (s === '') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function toList(v, allowed) {
    if (v === undefined || v === null || v === '') return [];
    var arr = Array.isArray(v) ? v : String(v).split(',');
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var item = String(arr[i]).trim();
      if (allowed.indexOf(item) !== -1 && out.indexOf(item) === -1) out.push(item);
    }
    return out;
  }

  /**
   * Transforme des paramètres bruts (query string ou formulaire) en critères propres.
   * Toute valeur invalide est ignorée plutôt que de provoquer une erreur.
   */
  function parseCriteria(query) {
    query = query || {};
    var floor = toNumber(query.etage);
    var c = {
      typologies: toList(query.typologie, TYPOLOGIES),
      statuses: toList(query.statut, STATUSES),
      surfaceMin: toNumber(query.surface_min),
      surfaceMax: toNumber(query.surface_max),
      budgetMax: toNumber(query.budget_max),
      floor: floor !== null && Math.floor(floor) === floor ? floor : null,
      sort: SORTS.indexOf(query.tri) !== -1 ? query.tri : 'prix-asc',
    };
    if (c.surfaceMin !== null && c.surfaceMin < 0) c.surfaceMin = null;
    if (c.surfaceMax !== null && c.surfaceMax < 0) c.surfaceMax = null;
    if (c.budgetMax !== null && c.budgetMax <= 0) c.budgetMax = null;
    return c;
  }

  function matches(lot, c) {
    if (c.typologies.length && c.typologies.indexOf(lot.typology) === -1) return false;
    if (c.statuses.length && c.statuses.indexOf(lot.status) === -1) return false;
    if (c.surfaceMin !== null && lot.surface < c.surfaceMin) return false;
    if (c.surfaceMax !== null && lot.surface > c.surfaceMax) return false;
    if (c.budgetMax !== null && lot.price > c.budgetMax) return false;
    if (c.floor !== null && lot.floor !== c.floor) return false;
    return true;
  }

  function compare(sort) {
    var parts = sort.split('-');
    var key = { prix: 'price', surface: 'surface', etage: 'floor' }[parts[0]];
    var dir = parts[1] === 'desc' ? -1 : 1;
    return function (a, b) {
      var d = (a[key] - b[key]) * dir;
      if (d !== 0) return d;
      return String(a.reference).localeCompare(String(b.reference), 'fr', { numeric: true });
    };
  }

  /** Filtre puis trie une liste de lots (ne modifie pas la liste d'origine). */
  function filterLots(lots, criteria) {
    var c = criteria && criteria.sort && criteria.typologies ? criteria : parseCriteria(criteria);
    return lots.filter(function (lot) { return matches(lot, c); }).sort(compare(c.sort));
  }

  return { parseCriteria: parseCriteria, filterLots: filterLots, matches: matches,
    TYPOLOGIES: TYPOLOGIES, STATUSES: STATUSES, SORTS: SORTS };
}));
