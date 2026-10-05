'use strict';
/*
 * Visuels de démonstration générés (SVG) : dégradés et formes abstraites.
 * Aucune image provenant d'un autre site n'est utilisée.
 */
const fs = require('fs');
const path = require('path');

function rand(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function skyline(w, h, seed, fill, opacity) {
  const r = rand(seed);
  let x = 0;
  let d = `M0 ${h}`;
  while (x < w) {
    const bw = 60 + r() * 140;
    const bh = h * (0.25 + r() * 0.4);
    d += ` L${x.toFixed(0)} ${(h - bh).toFixed(0)} L${(x + bw).toFixed(0)} ${(h - bh).toFixed(0)}`;
    x += bw + 6 + r() * 20;
    d += ` L${x.toFixed(0)} ${(h - bh).toFixed(0)}`;
  }
  d += ` L${w} ${h} Z`;
  return `<path d="${d}" fill="${fill}" fill-opacity="${opacity}"/>`;
}

function windows(x0, y0, cols, rows, seed) {
  const r = rand(seed);
  let out = '';
  for (let c = 0; c < cols; c++) {
    for (let l = 0; l < rows; l++) {
      const lit = r() > 0.55;
      out += `<rect x="${x0 + c * 46}" y="${y0 + l * 58}" width="30" height="40" rx="3" fill="#fff" fill-opacity="${lit ? 0.85 : 0.25}"/>`;
    }
  }
  return out;
}

function hero({ from, to, seed }) {
  const w = 1600; const h = 900;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>
  <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <circle cx="${1150 + (seed % 200)}" cy="230" r="120" fill="url(#s)"/>
  ${skyline(w, h, seed, '#ffffff', 0.12)}
  ${skyline(w, h, seed + 7, '#0a2540', 0.18)}
  <g transform="translate(520 300)">
    <rect width="560" height="600" rx="8" fill="#0a2540" fill-opacity=".35"/>
    ${windows(36, 40, 11, 9, seed)}
  </g>
  <rect y="${h - 70}" width="${w}" height="70" fill="#0a2540" fill-opacity=".35"/>
</svg>`;
}

function gallery({ from, to, seed, kind }) {
  const w = 1200; const h = 800;
  const r = rand(seed);
  let shapes = '';
  if (kind === 'interieur') {
    shapes = `<rect x="0" y="560" width="${w}" height="240" fill="#fff" fill-opacity=".18"/>
      <rect x="120" y="140" width="420" height="360" rx="6" fill="#fff" fill-opacity=".55"/>
      <line x1="330" y1="140" x2="330" y2="500" stroke="${from}" stroke-width="10"/>
      <line x1="120" y1="320" x2="540" y2="320" stroke="${from}" stroke-width="10"/>
      <rect x="640" y="430" width="420" height="140" rx="30" fill="#0a2540" fill-opacity=".45"/>
      <rect x="660" y="380" width="160" height="90" rx="24" fill="#0a2540" fill-opacity=".35"/>
      <rect x="880" y="380" width="160" height="90" rx="24" fill="#0a2540" fill-opacity=".35"/>`;
  } else if (kind === 'jardin') {
    for (let i = 0; i < 9; i++) {
      const cx = 80 + i * 130 + r() * 40; const cy = 470 + r() * 80; const rr = 70 + r() * 60;
      shapes += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rr.toFixed(0)}" fill="#0f5132" fill-opacity="${(0.25 + r() * 0.3).toFixed(2)}"/>`;
    }
    shapes += `<rect x="0" y="620" width="${w}" height="180" fill="#0f5132" fill-opacity=".35"/>`;
  } else {
    shapes = `${skyline(w, h, seed, '#0a2540', 0.25)}<g transform="translate(300 180)"><rect width="600" height="620" rx="6" fill="#fff" fill-opacity=".22"/>${windows(40, 40, 12, 10, seed)}</g>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>${shapes}</svg>`;
}

// Plans schématiques par typologie : pièces [x, y, w, h, libellé]
const PLAN_ROOMS = {
  T1: [[0, 0, 60, 70, 'Séjour / cuisine'], [60, 0, 40, 40, 'Salle d’eau'], [60, 40, 40, 30, 'Entrée']],
  T2: [[0, 0, 60, 60, 'Séjour / cuisine'], [60, 0, 40, 45, 'Chambre'], [60, 45, 40, 25, 'SdB'], [0, 60, 60, 20, 'Entrée / rangements']],
  T3: [[0, 0, 55, 60, 'Séjour / cuisine'], [55, 0, 45, 35, 'Chambre 1'], [55, 35, 45, 30, 'Chambre 2'], [0, 60, 30, 25, 'SdB'], [30, 60, 25, 25, 'WC'], [55, 65, 45, 20, 'Entrée']],
  T4: [[0, 0, 55, 55, 'Séjour / cuisine'], [55, 0, 45, 30, 'Chambre 1'], [55, 30, 45, 30, 'Chambre 2'], [55, 60, 45, 30, 'Chambre 3'], [0, 55, 30, 35, 'SdB'], [30, 55, 25, 35, 'Entrée / WC']],
  T5: [[0, 0, 50, 50, 'Séjour'], [0, 50, 30, 25, 'Cuisine'], [50, 0, 50, 25, 'Chambre 1'], [50, 25, 50, 25, 'Chambre 2'], [50, 50, 50, 25, 'Chambre 3'], [50, 75, 50, 25, 'Chambre 4'], [0, 75, 30, 25, 'SdB'], [30, 50, 20, 50, 'Entrée']],
  Maison: [[0, 0, 60, 55, 'Séjour / cuisine'], [60, 0, 40, 30, 'Chambre 1'], [60, 30, 40, 25, 'Chambre 2'], [0, 55, 35, 25, 'Chambre 3'], [35, 55, 25, 25, 'SdB'], [60, 55, 40, 25, 'Garage'], [0, 80, 100, 20, 'Jardin']],
};

function plan(typology) {
  const scale = 8; const ox = 40; const oy = 60;
  const rooms = PLAN_ROOMS[typology].map(([x, y, w, h, label]) => {
    const isGarden = label === 'Jardin';
    return `<rect x="${ox + x * scale}" y="${oy + y * scale}" width="${w * scale}" height="${h * scale}" fill="${isGarden ? '#e3f6ef' : '#ffffff'}" stroke="#0b3b66" stroke-width="${isGarden ? 2 : 6}"/>
    <text x="${ox + (x + w / 2) * scale}" y="${oy + (y + h / 2) * scale}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="20" fill="#0b3b66">${label}</text>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 940" width="880" height="940">
  <rect width="880" height="940" fill="#f5f8fb"/>
  <text x="40" y="38" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#0b3b66">Plan indicatif – ${typology}</text>
  ${rooms}
  <text x="40" y="920" font-family="Arial, sans-serif" font-size="16" fill="#5a6b7b">Document non contractuel – illustration de démonstration</text>
</svg>`;
}

const THEMES = [
  { from: '#0B6DB7', to: '#5FCFB0' },
  { from: '#123B66', to: '#2C9DB3' },
  { from: '#1D5C8C', to: '#8AD9C1' },
];

/** Écrit les visuels dans public/demo et renvoie leurs chemins publics. */
function writeDemoImages(publicDir) {
  const dir = path.join(publicDir, 'demo');
  fs.mkdirSync(dir, { recursive: true });
  const out = { heroes: [], galleries: [], plans: {} };
  THEMES.forEach((t, i) => {
    const heroName = `programme-${i + 1}.svg`;
    fs.writeFileSync(path.join(dir, heroName), hero({ ...t, seed: 11 + i * 37 }));
    out.heroes.push(`/demo/${heroName}`);
    const gal = [];
    ['facade', 'interieur', 'jardin'].forEach((kind, k) => {
      const name = `programme-${i + 1}-${kind}.svg`;
      fs.writeFileSync(path.join(dir, name), gallery({ from: k === 1 ? t.to : t.from, to: k === 1 ? t.from : t.to, seed: 100 + i * 10 + k, kind }));
      gal.push({ path: `/demo/${name}`, kind });
    });
    out.galleries.push(gal);
  });
  for (const typo of Object.keys(PLAN_ROOMS)) {
    const name = `plan-${typo.toLowerCase()}.svg`;
    fs.writeFileSync(path.join(dir, name), plan(typo));
    out.plans[typo] = `/demo/${name}`;
  }
  return out;
}

module.exports = { writeDemoImages };
