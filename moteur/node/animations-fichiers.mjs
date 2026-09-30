// Les images intermédiaires d'animation, côté fichiers (Node) : ce que partagent l'export des
// animations cuites (exporter-animations.mjs), l'import des images interpolées par RIFE
// (importer-animations.mjs) et les essais. Voir README.md, « Des images intermédiaires d'animation
// avec RIFE », et docs/animations.md.
//
// UNE ANIMATION CUITE. Une étape de l'animation d'une attraction est un objet graphique : une chaîne
// de morceaux (sprites de MSPR-0) posés à des décalages de la place de l'attraction (§ 6.4 de
// retro-ingenierie.md). L'image cuite d'une étape est la composition de tous ses morceaux, dans
// l'ordre où le jeu les trace, SAUF les places (morceaux marqués 0x80) : les passagers dépendent de
// la partie, la page les pose par-dessus. Toutes les images d'une boucle ont la même taille et le
// même ancrage : le point (ancrage.x, ancrage.y) de l'image est la place de l'attraction, si bien
// qu'un morceau de décalage (dx, dy) y est posé en (ancrage.x + dx, ancrage.y + dy), exactement
// comme dans le jeu ; ce qui tourne tourne donc autour du même centre dans toutes les images.

import fs from 'fs';
import path from 'path';
import { RACINE } from './sprites-fichiers.mjs';

export const ANIMATIONS = path.join(RACINE, 'assets', 'animations');
export const ORIGINE = path.join(ANIMATIONS, 'origine');     // l'export, à donner à Flowframes
export const RIFE = path.join(ANIMATIONS, 'rife');           // ce que l'utilisateur dépose
export const INTERPRITE = path.join(ANIMATIONS, 'interprite'); // ce qu'il a fait avec Interprite (prioritaire)
export const IMPORT = path.join(ANIMATIONS, 'import');       // l'import : rendu.json, que lit la page

// Le facteur d'agrandissement de l'export (au plus proche voisin) : RIFE travaille mieux sur des
// images de quelques centaines de pixels que sur des sprites de 20.
export const FACTEUR = 4;

// La couleur-clé du fond : un magenta pur. Absente de MPALETTE (la couleur la plus proche en est à
// plus de 100 unités, vérifié à l'export pour chaque attraction : `distanceDeLaCle` de l'index), et
// loin de toutes les teintes d'une attraction : un bord mêlé par RIFE se reconnaît à la part de
// magenta qu'il contient.
export const CLE = [255, 0, 255];

// Le nom de dossier d'une attraction : « BIG WHEEL » → « BIG-WHEEL ».
export const dossierDe = (nom) => nom.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Les PNG d'un dossier, dans l'ordre du premier nombre de leur nom (0000.png, 00000001.png,
// frame_12.png...). Si le dossier n'en a pas mais qu'un sous-dossier en a (Flowframes range sa
// sortie dans un dossier à lui), le sous-dossier qui en a le plus.
export function imagesNumerotees(dossier) {
  if (!fs.existsSync(dossier)) return [];
  const numero = (f) => { const m = /(\d+)/.exec(f); return m ? parseInt(m[1], 10) : -1; };
  const ici = fs.readdirSync(dossier).filter((f) => /\.png$/i.test(f) && numero(f) >= 0);
  if (ici.length) return ici.sort((a, b) => numero(a) - numero(b) || a.localeCompare(b)).map((f) => path.join(dossier, f));
  let meilleur = [];
  for (const f of fs.readdirSync(dossier)) {
    const d = path.join(dossier, f);
    if (!fs.statSync(d).isDirectory()) continue;
    const l = imagesNumerotees(d);
    if (l.length > meilleur.length) meilleur = l;
  }
  return meilleur;
}

// Une image indexée { largeur, hauteur, indices, opaque } en RGBA, agrandie k fois au plus proche
// voisin, le transparent peint de la couleur-clé (opaque : RIFE ne lit pas l'alpha).
export function enRgbaSurCle(img, couleurs, k) {
  const W = img.largeur * k, H = img.hauteur * k, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = ((y / k) | 0) * img.largeur + ((x / k) | 0), o = 4 * (y * W + x);
      const c = img.opaque[i] ? couleurs[img.indices[i]] : CLE;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  return { largeur: W, hauteur: H, rgba: out };
}

// Octets ↔ base64, pour ranger les images indexées dans du JSON.
export const enBase64 = (octets) => Buffer.from(octets.buffer, octets.byteOffset, octets.length).toString('base64');
export const deBase64 = (texte) => new Uint8Array(Buffer.from(texte, 'base64'));
