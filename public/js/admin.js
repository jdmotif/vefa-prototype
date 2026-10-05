/* Back-office : changement de statut sans rechargement, confirmations, focus sur les erreurs. */
(function () {
  'use strict';
  var csrf = document.body.getAttribute('data-csrf');

  Array.prototype.forEach.call(document.querySelectorAll('[data-no-js-only]'), function (el) { el.hidden = true; });

  // Changement de statut rapide (lots et leads) : envoi automatique au changement.
  document.addEventListener('change', function (e) {
    var select = e.target.closest('[data-quick-status] select');
    if (!select) return;
    var form = select.form;
    var body = new URLSearchParams(new FormData(form));
    select.disabled = true;
    fetch(form.action, { method: 'POST', body: body, headers: { Accept: 'application/json', 'X-CSRF-Token': csrf }, credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        select.className = select.className.replace(/status-select--\w+/, 'status-select--' + data.status) + ' is-saved';
        setTimeout(function () { select.classList.remove('is-saved'); }, 1200);
      })
      .catch(function () { form.submit(); })
      .then(function () { select.disabled = false; });
  });

  // Confirmation avant les actions destructrices
  document.addEventListener('submit', function (e) {
    var msg = e.target.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  var alertBox = document.querySelector('[data-autofocus]');
  if (alertBox) alertBox.focus();
}());
