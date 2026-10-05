'use strict';
const crypto = require('crypto');

/*
 * Protection CSRF par jeton de synchronisation stocké en session.
 * - csrfToken : génère le jeton et l'expose aux vues (res.locals.csrfToken)
 * - verifyCsrf : à placer APRÈS l'analyse du corps de la requête (urlencoded ou multer)
 */
function csrfToken(req, res, next) {
  if (req.session && !req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrfToken = req.session ? req.session.csrf : '';
  next();
}

function verifyCsrf(req, res, next) {
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  const expected = req.session && req.session.csrf;
  const ok = expected && typeof sent === 'string' && sent.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (ok) return next();
  const err = new Error('Le formulaire a expiré. Rechargez la page puis réessayez.');
  err.status = 403;
  return next(err);
}

module.exports = { csrfToken, verifyCsrf };
