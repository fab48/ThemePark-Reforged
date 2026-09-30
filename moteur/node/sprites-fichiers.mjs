// Les banques d'images du jeu, côté fichiers (Node) : lire une banque et ses palettes, décoder un
// sprite. Servi à l'export des animations (exporter-animations.mjs) et aux essais sous Node.
//
// Une banque est une paire .TAB (entrées de 6 octets : position des pixels sur 4 octets, largeur,
// hauteur) et .DAT (les pixels codés par lignes, voir moteur/jeu/traceur.js). Format établi d'après
// ThemeParkResourceViewer (tigrouind, licence MIT) ; voir aussi outils/extraire_sprites.py.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const RACINE = path.resolve(ICI, '..', '..');
export const DONNEES = path.join(RACINE, 'jeu', 'GAME', 'DATA');

// Les fichiers d'un dossier, par nom en majuscules.
function fichiersDe(dossier) {
  const res = {};
  for (const f of fs.readdirSync(dossier)) res[f.toUpperCase()] = path.join(dossier, f);
  return res;
}

// La palette du VGA : 768 octets, trois composantes de 6 bits par couleur.
export function lirePalette(dossier, nom) {
  const f = fichiersDe(dossier)[nom.toUpperCase() + '.DAT'];
  if (!f) return null;
  const d = fs.readFileSync(f);
  return d.length === 768 ? new Uint8Array(d) : null;
}

// L'empreinte d'une banque : FNV-1a 32 bits des positions de ses images dans son fichier de pixels,
// en 4 octets petit-boutistes chacune (les dimensions n'y entrent pas : le jeu les double ou les
// divise selon le mode d'affichage). Notée dans l'index de l'export des animations.
function empreinteDesPositions(positions) {
  let h = 0x811C9DC5;
  for (const v of positions) {
    for (let k = 0; k < 4; k++) { h ^= (v >>> (8 * k)) & 0xFF; h = Math.imul(h, 0x01000193); }
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function lireBanque(dossier, nom) {
  const f = fichiersDe(dossier);
  const tab = fs.readFileSync(f[nom + '.TAB']);
  const donnees = fs.readFileSync(f[nom + '.DAT']);
  const entrees = [];
  for (let i = 0; i + 6 <= tab.length; i += 6) {
    entrees.push({ position: tab.readUInt32LE(i), largeur: tab[i + 4], hauteur: tab[i + 5] });
  }
  return { nom, entrees, donnees, empreinte: empreinteDesPositions(entrees.map((e) => e.position)) };
}

// Décoder un sprite : { indices, opaque } de largeur × hauteur, ou null s'il est vide ou illisible.
// La transparence est tenue à part : l'indice 255 peut être une vraie couleur.
export function decoderSprite(donnees, { position, largeur, hauteur }) {
  if (!largeur || !hauteur || position >= donnees.length) return null;
  const indices = new Uint8Array(largeur * hauteur), opaque = new Uint8Array(largeur * hauteur);
  let p = position;
  for (let y = 0; y < hauteur; y++) {
    let x = 0;
    for (;;) {
      if (p >= donnees.length) return null;
      const code = donnees[p++];
      if (code === 0) break;
      if (code & 0x80) { x += 256 - code; continue; }
      for (let k = 0; k < code; k++, x++) {
        if (p >= donnees.length) return null;
        const c = donnees[p++];
        if (x < largeur) { indices[y * largeur + x] = c; opaque[y * largeur + x] = 1; }
      }
    }
  }
  return { indices, opaque };
}
