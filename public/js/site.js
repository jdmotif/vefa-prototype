/* Comportements communs : place le focus sur le résumé d'erreurs d'un formulaire. */
(function () {
  'use strict';
  var alertBox = document.querySelector('[data-autofocus]');
  if (alertBox) alertBox.focus();
}());
