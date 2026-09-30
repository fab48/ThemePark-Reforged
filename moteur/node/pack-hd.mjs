// Le pack HD : poser des images de sprites dans assets/images/hd/ et les inscrire au manifeste
// (assets/images/hd/index.json), que lit le rendu HD de la page (moteur/web/rendu-hd.js).
//
// Deux usages :
//  - partir des dessins de 1994 pour les refaire à la main : `--brut` écrit chaque sprite agrandi au plus
//    proche (des blocs de k x k pixels), en vraies couleurs sur fond transparent, à l'échelle du
//    pack ; on le redessine dans un éditeur, à la même taille, et le jeu le prend au rechargement ;
//  - un pack d'essai, sans dessinateur : par défaut, chaque sprite est agrandi par Scale2x (EPX, une ou
//    deux fois : ×2, ×4 ; Scale3x pour ×3), qui arrondit les diagonales sans inventer de couleur, puis
//    son contour est adouci (l'alpha des pixels du bord moyenné sur leurs voisins) : de quoi voir, dans
//    la page, qu'un sprite a été remplacé.
//
// Les sprites sont lus dans les banques du jeu telles que les refont les assets (assets/images/banques/,
// moteur/hote/assets-du-jeu.js : le fichier .TAB, six octets par image, et le .DAT, les lignes codées
// du traceur), avec la palette du parc (MPALETTE.DAT) ou celle qu'on nomme.
//
// Usage : node moteur/node/pack-hd.mjs [--echelle 2] [--brut] [--palette MPALETTE] BANQUE/n [BANQUE/n-m ...]
//   ex. : node moteur/node/pack-hd.mjs MSPR-0/1005 MSPR-0/1007 MSPR-0/430-460 MBLK-0/1 MPANEL-0/25

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { composerLesFichiers } from '../hote/assets-du-jeu.js';
import { decoderUnSprite } from '../web/liste-affichage-format.js';
import { encoderPng } from './png.mjs';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = path.join(RACINE, 'assets');
const PACK = path.join(ASSETS, 'images', 'hd');

const args = process.argv.slice(2);
const opt = (nom, def) => { const k = args.indexOf(nom); return k >= 0 ? args.splice(k, 2)[1] : def; };
const echelle = parseInt(opt('--echelle', '2'), 10);
const nomPalette = opt('--palette', 'MPALETTE');
const brut = args.includes('--brut');
const demandes = args.filter((a) => !a.startsWith('--'));
if (!demandes.length || ![2, 3, 4].includes(echelle)) {
  console.log('usage : node moteur/node/pack-hd.mjs [--echelle 2|3|4] [--brut] BANQUE/n [BANQUE/n-m ...]');
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
const fichiers = await composerLesFichiers(index, async (c) => new Uint8Array(fs.readFileSync(path.join(ASSETS, ...c.split('/')))),
  (o) => new Uint8Array(zlib.inflateSync(o)));
const fichier = (nom) => fichiers.get(`GAME/DATA/${nom}`);
const palette = fichier(`${nomPalette}.DAT`);
if (!palette) throw new Error(`pas de palette ${nomPalette}.DAT`);

// Le sprite n d'une banque, en RGBA (8 bits), à sa taille dans le jeu.
function spriteRGBA(banque, n) {
  const tab = fichier(`${banque}.TAB`), dat = fichier(`${banque}.DAT`);
  if (!tab || !dat) throw new Error(`pas de banque ${banque}`);
  if (6 * n + 6 > tab.length) throw new Error(`${banque} n'a que ${tab.length / 6} images`);
  const v = new DataView(tab.buffer, tab.byteOffset);
  const p = v.getUint32(6 * n, true), l = tab[6 * n + 4], h = tab[6 * n + 5];
  const d = decoderUnSprite(dat, p, l, h);
  const rgba = new Uint8Array(d.l * d.h * 4);
  for (let k = 0; k < d.l * d.h; k++) {
    if (!d.masque[k]) continue;
    const i = d.valeurs[k];
    for (let c = 0; c < 3; c++) rgba[4 * k + c] = Math.round(palette[3 * i + c] * 255 / 63);
    rgba[4 * k + 3] = 255;
  }
  return { l: d.l, h: d.h, rgba };
}

const pareils = (a, i, j) => a[i] === a[j] && a[i + 1] === a[j + 1] && a[i + 2] === a[j + 2] && a[i + 3] === a[j + 3];
// Scale2x (EPX) : chaque pixel P devient quatre, pris à ses voisins quand deux voisins se rejoignent en diagonale.
function scale2x({ l, h, rgba }) {
  const L = 2 * l, H = 2 * h, o = new Uint8Array(L * H * 4);
  const at = (x, y) => 4 * (Math.min(h - 1, Math.max(0, y)) * l + Math.min(l - 1, Math.max(0, x)));
  const poser = (x, y, s) => o.set(rgba.subarray(s, s + 4), 4 * (y * L + x));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      poser(2 * x, 2 * y, pareils(rgba, C, A) && !pareils(rgba, C, D) && !pareils(rgba, A, B) ? A : P);
      poser(2 * x + 1, 2 * y, pareils(rgba, A, B) && !pareils(rgba, A, C) && !pareils(rgba, B, D) ? B : P);
      poser(2 * x, 2 * y + 1, pareils(rgba, D, C) && !pareils(rgba, D, B) && !pareils(rgba, C, A) ? C : P);
      poser(2 * x + 1, 2 * y + 1, pareils(rgba, B, D) && !pareils(rgba, B, A) && !pareils(rgba, D, C) ? D : P);
    }
  }
  return { l: L, h: H, rgba: o };
}
// Scale3x (AdvMAME3x).
function scale3x({ l, h, rgba }) {
  const L = 3 * l, H = 3 * h, o = new Uint8Array(L * H * 4);
  const at = (x, y) => 4 * (Math.min(h - 1, Math.max(0, y)) * l + Math.min(l - 1, Math.max(0, x)));
  const eq = (a, b) => pareils(rgba, a, b);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const A = at(x - 1, y - 1), B = at(x, y - 1), C = at(x + 1, y - 1), D = at(x - 1, y), E = at(x, y), F = at(x + 1, y);
      const G = at(x - 1, y + 1), Hh = at(x, y + 1), I = at(x + 1, y + 1);
      let r = [E, E, E, E, E, E, E, E, E];
      if (!eq(B, Hh) && !eq(D, F)) {
        r = [eq(D, B) ? D : E, (eq(D, B) && !eq(E, C)) || (eq(B, F) && !eq(E, A)) ? B : E, eq(B, F) ? F : E,
          (eq(D, B) && !eq(E, G)) || (eq(D, Hh) && !eq(E, A)) ? D : E, E, (eq(B, F) && !eq(E, I)) || (eq(Hh, F) && !eq(E, C)) ? F : E,
          eq(D, Hh) ? D : E, (eq(D, Hh) && !eq(E, I)) || (eq(Hh, F) && !eq(E, G)) ? Hh : E, eq(Hh, F) ? F : E];
      }
      for (let k = 0; k < 9; k++) o.set(rgba.subarray(r[k], r[k] + 4), 4 * ((3 * y + ((k / 3) | 0)) * L + 3 * x + (k % 3)));
    }
  }
  return { l: L, h: H, rgba: o };
}
// Adoucir le contour : l'alpha de chaque pixel du bord (opaque à côté d'un transparent, ou l'inverse)
// devient la moyenne de son voisinage 3x3 ; la couleur d'un pixel devenu semi-transparent est celle de
// son voisin opaque le plus proche.
function adoucir({ l, h, rgba }) {
  const o = Uint8Array.from(rgba);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      let somme = 0, n = 0, bord = false, voisin = -1;
      const a0 = rgba[4 * (y * l + x) + 3];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy;
          const a = X < 0 || Y < 0 || X >= l || Y >= h ? 0 : rgba[4 * (Y * l + X) + 3];
          somme += a; n++;
          if (a !== a0) bord = true;
          if (a && voisin < 0 && X >= 0 && Y >= 0 && X < l && Y < h) voisin = 4 * (Y * l + X);
        }
      }
      if (!bord) continue;
      const k = 4 * (y * l + x);
      const alpha = Math.round((somme / n + a0) / 2);
      if (!a0 && voisin >= 0) o.set(rgba.subarray(voisin, voisin + 3), k);
      o[k + 3] = alpha;
    }
  }
  return { l, h, rgba: o };
}
function agrandir(s) {
  if (brut) {
    const L = s.l * echelle, H = s.h * echelle, o = new Uint8Array(L * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < L; x++) o.set(s.rgba.subarray(4 * (((y / echelle) | 0) * s.l + ((x / echelle) | 0)), 4 * (((y / echelle) | 0) * s.l + ((x / echelle) | 0)) + 4), 4 * (y * L + x));
    return { l: L, h: H, rgba: o };
  }
  const g = echelle === 3 ? scale3x(s) : echelle === 4 ? scale2x(scale2x(s)) : scale2x(s);
  return adoucir(g);
}

// Le manifeste : lu, complété, réécrit.
fs.mkdirSync(PACK, { recursive: true });
const cheminDuManifeste = path.join(PACK, 'index.json');
const manifeste = fs.existsSync(cheminDuManifeste) ? JSON.parse(fs.readFileSync(cheminDuManifeste, 'utf8'))
  : { version: 1, echelle, sprites: {}, fichiers: {} };
manifeste.sprites = manifeste.sprites || {};
let n = 0;
for (const d of demandes) {
  const m = /^([A-Z0-9-]+)\/(\d+)(?:-(\d+))?$/i.exec(d);
  if (!m) throw new Error(`demande illisible : ${d} (BANQUE/n ou BANQUE/n-m)`);
  const banque = m[1].toUpperCase();
  for (let k = +m[2]; k <= +(m[3] || m[2]); k++) {
    const s = spriteRGBA(banque, k);
    if (!s.l || !s.h) continue;
    const g = agrandir(s);
    const relatif = `${banque}/${k}.png`;
    fs.mkdirSync(path.join(PACK, banque), { recursive: true });
    fs.writeFileSync(path.join(PACK, banque, `${k}.png`), encoderPng(g.l, g.h, g.rgba));
    manifeste.sprites[`${banque}/${k}`] = echelle === (manifeste.echelle || 1) ? relatif : { fichier: relatif, echelle };
    n++;
  }
}
fs.writeFileSync(cheminDuManifeste, JSON.stringify(manifeste, null, 1) + '\n');
console.log(`${n} sprite(s) dans ${path.relative(RACINE, PACK)} ; le manifeste en a ${Object.keys(manifeste.sprites).length}`);
