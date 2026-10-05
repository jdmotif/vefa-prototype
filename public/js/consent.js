/*
 * Bandeau de consentement et chargement de Google Tag Manager.
 * Ce script n'est inclus QUE si GTM_ID est défini dans le .env.
 * GTM n'est chargé qu'après un clic sur « Accepter ». Le choix est mémorisé 6 mois
 * dans le stockage local du navigateur (pas de cookie déposé par ce site).
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var gtmId = script && script.getAttribute('data-gtm-id');
  var KEY = 'consentement-mesure';
  var MAX_AGE = 1000 * 60 * 60 * 24 * 182;
  if (!gtmId) return;

  function read() {
    try {
      var v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && Date.now() - v.at < MAX_AGE) return v.choice;
    } catch (e) { /* ignore */ }
    return null;
  }
  function save(choice) {
    try { localStorage.setItem(KEY, JSON.stringify({ choice: choice, at: Date.now() })); } catch (e) { /* ignore */ }
  }
  function loadGtm() {
    if (window.__gtmLoaded) return;
    window.__gtmLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(gtmId);
    document.head.appendChild(s);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('consent-banner');
    var choice = read();
    if (choice === 'accept') loadGtm();
    if (!choice && banner) banner.hidden = false;

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-consent]');
      if (btn) {
        var c = btn.getAttribute('data-consent');
        save(c);
        banner.hidden = true;
        if (c === 'accept') loadGtm();
        else if (window.__gtmLoaded) location.reload(); // retrait du consentement : on recharge sans GTM
      }
      if (e.target.closest('[data-consent-open]') && banner) {
        banner.hidden = false;
        var first = banner.querySelector('button');
        if (first) first.focus();
      }
    });
  });
}());
