'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

// Signatures binaires (« magic numbers ») : on ne se fie ni au nom ni au type annoncé par le navigateur.
const IMAGE_SIGNATURES = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'webp', test: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP' },
];
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const IMPORT_EXT = ['csv', 'txt', 'xlsx'];

function uploadError(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

/** Middleware multer pour des images (stockées en mémoire, vérifiées puis écrites sur disque). */
function imageUpload({ maxBytes, fields }) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 12, fields: 40 },
    fileFilter(req, file, cb) {
      if (!IMAGE_MIME.includes(file.mimetype)) return cb(uploadError('Seules les images JPEG, PNG ou WebP sont acceptées.'));
      cb(null, true);
    },
  }).fields(fields);
}

function importUpload({ maxBytes = 2 * 1024 * 1024 } = {}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10 },
    fileFilter(req, file, cb) {
      const ext = path.extname(file.originalname).slice(1).toLowerCase();
      if (!IMPORT_EXT.includes(ext)) return cb(uploadError('Format non pris en charge : utilisez un fichier .csv ou .xlsx.'));
      cb(null, true);
    },
  }).single('fichier');
}

/** Vérifie le contenu réel de l'image et l'enregistre sous un nom aléatoire. Retourne le chemin public. */
function saveImage(uploadDir, file, subdir) {
  const sig = IMAGE_SIGNATURES.find((s) => s.test(file.buffer));
  if (!sig) throw uploadError(`« ${file.originalname} » n’est pas une image JPEG, PNG ou WebP valide.`);
  const dir = path.join(uploadDir, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(8).toString('hex')}.${sig.ext}`;
  fs.writeFileSync(path.join(dir, name), file.buffer, { mode: 0o644 });
  return `/uploads/${subdir}/${name}`;
}

/** Supprime un fichier envoyé (uniquement s'il se trouve bien dans le dossier d'upload). */
function removeUpload(uploadDir, publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return;
  const target = path.resolve(uploadDir, publicPath.slice('/uploads/'.length));
  if (!target.startsWith(path.resolve(uploadDir) + path.sep)) return;
  fs.rm(target, { force: true }, () => {});
}

module.exports = { imageUpload, importUpload, saveImage, removeUpload, uploadError };
