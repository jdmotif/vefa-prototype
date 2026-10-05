/* Page programme : filtrage instantané, bascule cartes / tableau, fiche lot en fenêtre, galerie. */
(function () {
  'use strict';
  var dataEl = document.getElementById('lots-data');
  var form = document.querySelector('[data-lot-filters]');
  var root = document.querySelector('[data-lots-root]');
  if (!dataEl || !form || !root || !window.LotFilter) return;

  var lots = JSON.parse(dataEl.textContent);
  var countEl = document.querySelector('[data-result-count]');
  var emptyEl = document.querySelector('[data-empty]');
  var lists = Array.prototype.slice.call(document.querySelectorAll('[data-lot-list]'));

  // Le bouton « Appliquer » n'est utile que sans JavaScript.
  Array.prototype.forEach.call(form.querySelectorAll('[data-no-js-only]'), function (el) { el.hidden = true; });

  function readForm() {
    var q = {};
    var fd = new FormData(form);
    fd.forEach(function (value, key) {
      if (value === '') return;
      if (key === 'typologie' || key === 'statut') (q[key] = q[key] || []).push(value);
      else q[key] = value;
    });
    return q;
  }

  var lastKey = null;
  function apply() {
    var query = readForm();
    // Ne rien redessiner si les critères n'ont pas changé (évite de déplacer une ligne pendant un clic).
    var key = JSON.stringify(query);
    if (key === lastKey) return;
    lastKey = key;
    var result = window.LotFilter.filterLots(lots, query);
    var shown = {};
    result.forEach(function (l) { shown[l.id] = true; });
    lists.forEach(function (list) {
      var items = {};
      Array.prototype.forEach.call(list.querySelectorAll('[data-lot-id]'), function (el) { items[el.getAttribute('data-lot-id')] = el; });
      result.forEach(function (l) { var el = items[l.id]; if (el) { el.hidden = false; list.appendChild(el); } });
      Object.keys(items).forEach(function (id) { if (!shown[id]) items[id].hidden = true; });
    });
    countEl.textContent = result.length;
    emptyEl.hidden = result.length > 0;

    // Garde les filtres dans l'adresse (partage du lien, retour arrière).
    var params = new URLSearchParams();
    Object.keys(query).forEach(function (k) {
      if (k === 'tri' && query[k] === 'prix-asc') return;
      [].concat(query[k]).forEach(function (v) { params.append(k, v); });
    });
    var qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + '#lots');
  }

  var timer;
  form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(apply, 150); });
  form.addEventListener('change', apply);
  form.addEventListener('submit', function (e) { e.preventDefault(); apply(); });
  var reset = form.querySelector('[data-reset-filters]');
  if (reset) reset.addEventListener('click', function (e) {
    e.preventDefault();
    form.reset();
    lastKey = null;
    Array.prototype.forEach.call(form.querySelectorAll('input[type=checkbox]'), function (c) { c.checked = false; });
    Array.prototype.forEach.call(form.querySelectorAll('input[type=number]'), function (c) { c.value = ''; });
    Array.prototype.forEach.call(form.querySelectorAll('select'), function (s) { s.selectedIndex = 0; });
    apply();
  });

  // ---- Bascule cartes / tableau (mémorisée pour la session de navigation, sans cookie) ----
  var toggle = document.querySelector('[data-view-toggle]');
  function setView(view) {
    root.setAttribute('data-view', view);
    Array.prototype.forEach.call(toggle.querySelectorAll('[data-view]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === view));
    });
    try { sessionStorage.setItem('vue-lots', view); } catch (e) { /* stockage indisponible */ }
  }
  if (toggle) {
    toggle.hidden = false;
    var saved = null;
    try { saved = sessionStorage.getItem('vue-lots'); } catch (e) { /* ignore */ }
    setView(saved || (window.matchMedia('(min-width: 900px)').matches ? 'table' : 'cards'));
    toggle.addEventListener('click', function (e) {
      var b = e.target.closest('[data-view]');
      if (b) setView(b.getAttribute('data-view'));
    });
  } else {
    root.setAttribute('data-view', 'table');
  }

  // ---- Fiche lot dans une fenêtre ----
  var dialog = document.querySelector('[data-lot-dialog]');
  var content = dialog && dialog.querySelector('[data-dialog-content]');
  var lastTrigger = null;

  function openLot(href, trigger) {
    if (!dialog || typeof dialog.showModal !== 'function') { location.href = href; return; }
    lastTrigger = trigger;
    fetch(href + (href.indexOf('?') === -1 ? '?' : '&') + 'fragment=1', { headers: { Accept: 'text/html' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) {
        content.innerHTML = html; // HTML produit et échappé par notre serveur
        dialog.showModal();
        var title = content.querySelector('h1');
        if (title) { title.setAttribute('tabindex', '-1'); title.focus(); }
      })
      .catch(function () { location.href = href; });
  }

  root.addEventListener('click', function (e) {
    var link = e.target.closest('[data-lot-open]');
    var row = !link && e.target.closest('tr[data-lot-id]');
    if (row) link = row.querySelector('[data-lot-open]');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    openLot(link.getAttribute('href'), link);
  });
  Array.prototype.forEach.call(root.querySelectorAll('tr[data-lot-id]'), function (tr) { tr.setAttribute('data-clickable', ''); });

  // ---- Galerie ----
  var lightbox = document.querySelector('[data-lightbox-dialog]');
  var lbImg = lightbox && lightbox.querySelector('[data-lightbox-img]');
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-lightbox]');
    if (!a || !lightbox || typeof lightbox.showModal !== 'function') return;
    e.preventDefault();
    lastTrigger = a;
    lbImg.src = a.getAttribute('href');
    lbImg.alt = a.getAttribute('data-alt') || '';
    lightbox.showModal();
  });

  // Fermeture des fenêtres : bouton, clic sur le fond, touche Échap (native)
  Array.prototype.forEach.call(document.querySelectorAll('dialog'), function (d) {
    d.addEventListener('click', function (e) {
      if (e.target === d || e.target.closest('[data-dialog-close]')) d.close();
    });
    d.addEventListener('close', function () { if (lastTrigger) lastTrigger.focus(); });
  });
}());
