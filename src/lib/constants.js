'use strict';

const TYPOLOGIES = ['T1', 'T2', 'T3', 'T4', 'T5', 'Maison'];
const LOT_STATUSES = { disponible: 'Disponible', reserve: 'Réservé', vendu: 'Vendu' };
const OUTDOOR_TYPES = { aucun: 'Aucun', balcon: 'Balcon', terrasse: 'Terrasse', jardin: 'Jardin' };
const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO', 'N-S', 'E-O', 'NE-SO', 'NO-SE'];
const PROGRAMME_STATUSES = { brouillon: 'Brouillon', publie: 'Publié', archive: 'Archivé' };
const LEAD_STATUSES = { nouveau: 'Nouveau', contacte: 'Contacté', rdv: 'RDV', perdu: 'Perdu', vendu: 'Vendu' };
const LEAD_PROJECTS = { habiter: 'Habiter', investir: 'Investir' };

// Texte de consentement affiché et conservé avec chaque demande (preuve du consentement).
const CONSENT_TEXT =
  "J'accepte que Les Commercialisateurs utilisent les informations saisies dans ce formulaire " +
  'pour me recontacter au sujet de ce programme immobilier. Mes données sont conservées au maximum ' +
  "3 ans à compter du dernier contact et ne sont jamais revendues. Je peux exercer mes droits d'accès, " +
  'de rectification et de suppression à tout moment.';

module.exports = {
  TYPOLOGIES, LOT_STATUSES, OUTDOOR_TYPES, ORIENTATIONS,
  PROGRAMME_STATUSES, LEAD_STATUSES, LEAD_PROJECTS, CONSENT_TEXT,
};
