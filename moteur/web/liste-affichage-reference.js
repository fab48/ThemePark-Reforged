// Le rendu de référence de la liste d'affichage : rejouer le flux (liste-affichage-format.js) à ×1,
// avec les sprites de 1994, dans des tampons d'indices de couleur. Sans DOM : sous Node (le banc
// travail/hd/banc.mjs, qui compare chaque tampon rejoué à celui du jeu), et dans le travailleur.
//
// C'est la définition des opérations : le rendu HD de la page (rendu-hd.js) fait la même chose à ×k.
// Tout ce que la page ne sait pas dessiner, la référence ne le dessine pas non plus ; une différence
// avec le jeu est donc une chose que la page aurait mal montrée.

import { OP, MODE, parcourir } from './liste-affichage-format.js';

export class Reference {
  constructor() {
    this.tampons = new Map();         // id -> { l, h, pixels }
    this.sprites = new Map();         // clé -> { l, h, valeurs, masque, largeur, hauteur, banque, numero }
    this.chaines = new Map();
    this.palette = new Uint8Array(768);
    this.image = null;                // la dernière OP.IMAGE : { numero, l, h }
    this.compte = new Map();          // opérations rejouées, par code
    this.inconnues = 0;               // opérations sur un tampon ou un sprite inconnu
  }

  tampon(id) { return this.tampons.get(id); }

  jouer(lot) {
    parcourir(lot, (code, m, p, o) => {
      this.compte.set(code, (this.compte.get(code) || 0) + 1);
      switch (code) {
        case OP.BUFFER: this.tampons.set(m[p + 1], { l: m[p + 2], h: m[p + 3], pixels: new Uint8Array(m[p + 2] * m[p + 3]) }); break;
        case OP.DEF: {
          const l = m[p + 2], h = m[p + 3], a = m[p + 4];
          this.sprites.set(m[p + 1], {
            l, h, valeurs: o.slice(a, a + l * h), masque: o.slice(a + l * h, a + 2 * l * h),
            banque: m[p + 5] >= 0 ? this.chaines.get(m[p + 5]) : null, numero: m[p + 6], lignes: m[p + 7],
            largeur: m[p + 8], hauteur: m[p + 9],
          });
          break;
        }
        case OP.OUBLIER: this.sprites.delete(m[p + 1]); break;
        case OP.CHAINE: this.chaines.set(m[p + 1], String.fromCharCode(...o.subarray(m[p + 2], m[p + 2] + m[p + 3]))); break;
        case OP.PALETTE: this.palette.set(o.subarray(m[p + 1], m[p + 1] + 768)); break;
        case OP.IMAGE: this.image = { numero: m[p + 1], l: m[p + 2], h: m[p + 3] }; break;
        case OP.SPRITE: this.sprite(m[p + 1], m[p + 2], m[p + 3], m[p + 4], m[p + 5], m[p + 6], m[p + 7], m[p + 8], m[p + 9], m[p + 10]); break;
        case OP.FILL: this.remplir(m[p + 1], m[p + 2], m[p + 3], m[p + 4], m[p + 5], m[p + 6]); break;
        case OP.COPY: this.copier(m[p + 1], m[p + 2], m[p + 3], m[p + 4], m[p + 5], m[p + 6], m[p + 7], m[p + 8], m[p + 9]); break;
        case OP.PIXELS: this.pixels(m[p + 1], m[p + 2], m[p + 3], m[p + 4], m[p + 5], o, m[p + 6]); break;
        default: break;              // SOURCE, TEXTE : des repères, sans dessin
      }
    });
  }

  sprite(id, cle, x, y, mode, couleur, cx0, cy0, cx1, cy1) {
    const t = this.tampons.get(id), s = this.sprites.get(cle);
    if (!t || !s) { this.inconnues++; return; }
    cx0 = Math.max(cx0, 0); cy0 = Math.max(cy0, 0); cx1 = Math.min(cx1, t.l); cy1 = Math.min(cy1, t.h);
    const { l, h, valeurs, masque, largeur, hauteur } = s;
    const mh = (mode & MODE.MIROIR_H) !== 0, mv = (mode & MODE.MIROIR_V) !== 0, sil = (mode & MODE.SILHOUETTE) !== 0;
    const px = t.pixels, L = t.l;
    for (let j = 0; j < h; j++) {
      const Y = mv ? y + hauteur - j : y + j;
      if (Y < cy0 || Y >= cy1) continue;
      const ligne = j * l, base = Y * L;
      for (let i = 0; i < l; i++) {
        if (!masque[ligne + i]) continue;
        const X = mh ? x + largeur - i : x + i;
        if (X < cx0 || X >= cx1) continue;
        px[base + X] = sil ? couleur : valeurs[ligne + i];
      }
    }
  }

  remplir(id, x, y, l, h, couleur) {
    const t = this.tampons.get(id);
    if (!t) { this.inconnues++; return; }
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(t.l, x + l), y1 = Math.min(t.h, y + h);
    for (let Y = y0; Y < y1; Y++) t.pixels.fill(couleur, Y * t.l + x0, Y * t.l + x1);
  }

  copier(s, sx, sy, d, dx, dy, l, h, transparente) {
    const ts = this.tampons.get(s), td = this.tampons.get(d);
    if (!ts || !td) { this.inconnues++; return; }
    // (coupé aux deux tampons)
    if (sx < 0) { dx -= sx; l += sx; sx = 0; }
    if (sy < 0) { dy -= sy; h += sy; sy = 0; }
    if (dx < 0) { sx -= dx; l += dx; dx = 0; }
    if (dy < 0) { sy -= dy; h += dy; dy = 0; }
    l = Math.min(l, ts.l - sx, td.l - dx);
    h = Math.min(h, ts.h - sy, td.h - dy);
    if (l <= 0 || h <= 0) return;
    // (un tampon dans lui-même, par-dessus : comme une copie par une image intermédiaire)
    const source = s === d ? ts.pixels.slice() : ts.pixels;
    for (let j = 0; j < h; j++) {
      const a = (sy + j) * ts.l + sx, b = (dy + j) * td.l + dx;
      if (transparente < 0) td.pixels.set(source.subarray(a, a + l), b);
      else for (let i = 0; i < l; i++) { const v = source[a + i]; if (v !== transparente) td.pixels[b + i] = v; }
    }
  }

  pixels(id, x, y, l, h, o, a) {
    const t = this.tampons.get(id);
    if (!t) { this.inconnues++; return; }
    for (let j = 0; j < h; j++) {
      const Y = y + j;
      if (Y < 0 || Y >= t.h) continue;
      for (let i = 0; i < l; i++) {
        const X = x + i;
        if (X < 0 || X >= t.l || !o[a + l * h + j * l + i]) continue;
        t.pixels[Y * t.l + X] = o[a + j * l + i];
      }
    }
  }
}
