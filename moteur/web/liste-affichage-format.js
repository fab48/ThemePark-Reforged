// La liste d'affichage : le format commun au relevé (liste-affichage.js, côté jeu), au rendu de
// référence (liste-affichage-reference.js, sous Node et dans le travailleur) et au rendu HD de la page
// (rendu-hd.js).
//
// POURQUOI. Pour montrer le jeu en haute définition sans toucher au code lisible prouvé, il faut
// savoir, pour chaque image, CE QUE le jeu a dessiné et DANS QUEL ORDRE : « le sprite n de la banque B
// en (x, y), retourné, coupé à tel rectangle », « un rectangle de telle couleur », « ce bloc recopié du
// fond vers la surface »... La page redessine alors l'image à ×k, chaque élément remplacé par sa
// version HD s'il y en a une, sinon agrandi au plus proche. L'ordre du jeu fait la profondeur (un
// visiteur tracé après un arbre reste devant) : ce n'est pas un calque posé sur l'image de 1994.
//
// LES TAMPONS. Le jeu ne dessine pas à l'écran : il construit ses images dans des tampons qui durent
// d'une image à l'autre (la surface de dessin, le fond où la carte est tracée une fois pour toutes, le
// motif du curseur, les pixels que le curseur recouvre), et n'en recopie à l'écran que les blocs qui
// ont changé (presentation.js). Une image n'est donc pas une liste de sprites : c'est l'état de ces
// tampons, que chaque opération change. La liste est un flux d'opérations sur des tampons numérotés ;
// le tampon 0 est l'écran (ce que la page montre). Rejouer le flux depuis le début redonne chaque
// tampon, donc chaque image ; la page tient une version à ×k de chaque tampon.
//
// LE FLUX. Des mots de 32 bits (Int32Array), une opération par groupe, son code d'abord ; les octets
// (pixels, palettes, chaînes) dans un second tableau (Uint8Array), désignés par leur position. Le
// relevé en fait un lot par image présentée (OP.IMAGE le termine) : le travailleur l'envoie à la page
// avec l'image, sans rien d'autre à synchroniser.
//
//   BUFFER   id, l, h                      (re)définir le tampon id : l x h pixels, remis à zéro
//   SPRITE   tampon, clé, x, y, mode, couleur, cx0, cy0, cx1, cy1
//            poser le sprite `clé` (défini par DEF) ; son pixel (i, j) va en (x + i, y + j), ou, retourné
//            (mode & 1), en x + w − i (w : sa largeur de référence, celle que le traceur lit dans la
//            table) ; (mode & 2) de même en hauteur. Seuls les pixels du rectangle [cx0, cx1) x [cy0,
//            cy1) sont posés. (mode & 4) : silhouette, chaque pixel opaque prend `couleur`.
//   FILL     tampon, x, y, l, h, couleur   un rectangle plein
//   COPY     source, sx, sy, dest, dx, dy, l, h, transparente
//            recopier un rectangle d'un tampon dans un autre (ou le même) ; `transparente` ≥ 0 : les
//            pixels de cette couleur ne sont pas recopiés (le motif du curseur, 0xFE)
//   PIXELS   tampon, x, y, l, h, position  des pixels quelconques : l x h valeurs, puis l x h
//            drapeaux (1 : posé), aux octets `position` (ce que le relevé n'a pas su nommer : une
//            ligne, la petite police, une fusion... relevé par différence)
//   DEF      clé, l, h, position, banque, numéro, lignesSautées, largeur, hauteur
//            un sprite : l x h valeurs puis l x h drapeaux ; `banque` est une chaîne (CHAINE) ou −1 ;
//            (banque, numéro) nomme le sprite pour les remplaçants HD ; `lignesSautées` : un sprite
//            enfoncé dans le sol (0x11AF4) commence plus bas dans ses données ; (largeur, hauteur) : sa
//            taille de référence, celle du traceur (l peut la dépasser : une ligne plus longue)
//   PALETTE  position                      768 octets, 6 bits par composante (le DAC du VGA)
//   IMAGE    numéro, l, h                  fin d'une image : l'écran (tampon 0) est à montrer
//   CHAINE   id, position, longueur        une chaîne (latin-1), nommée par son id
//   OUBLIER  clé                           la clé n'est plus valable (sa banque a été rechargée)
//   SOURCE   tampon, x, y, l, h, chaîne, décalage
//            ce qui suit (PIXELS) vient d'un fichier du jeu (un fond plein écran, MMENU-0.DAT...) : de
//            quoi le remplacer par une image HD
//   TEXTE    tampon, x, y, chaîne, police, couleur
//            repère (sans dessin) : un texte écrit par le jeu ; ce qui le dessine suit
//   ECHELLE  tampon, clé, x, y, l, h
//            repère : le sprite `clé` étiré ou réduit dans le rectangle (x, y, l, h) (0x66DFA : les
//            miniatures des catalogues, les listes) ; les pixels suivent (OP.PIXELS), et un remplaçant
//            HD du sprite peut être posé à leur place

export const OP = {
  BUFFER: 1, SPRITE: 2, FILL: 3, COPY: 4, PIXELS: 5, DEF: 6, PALETTE: 7, IMAGE: 8, CHAINE: 9,
  OUBLIER: 10, SOURCE: 11, TEXTE: 12, ECHELLE: 13,
};
// Le nombre de mots de chaque opération, code compris.
export const MOTS = {
  [OP.BUFFER]: 4, [OP.SPRITE]: 11, [OP.FILL]: 7, [OP.COPY]: 10, [OP.PIXELS]: 7, [OP.DEF]: 10,
  [OP.PALETTE]: 2, [OP.IMAGE]: 4, [OP.CHAINE]: 4, [OP.OUBLIER]: 2, [OP.SOURCE]: 8, [OP.TEXTE]: 7, [OP.ECHELLE]: 7,
};
export const NOMS_DES_OPS = Object.fromEntries(Object.entries(OP).map(([n, v]) => [v, n]));

export const MODE = { MIROIR_H: 1, MIROIR_V: 2, SILHOUETTE: 4 };
export const ECRAN = 0;                 // le tampon de l'écran
export const TRANSPARENT_DU_CURSEUR = 0xFE;

// L'écriture d'un flux : des mots et des octets, agrandis au besoin. `lot()` rend ce qui a été écrit
// depuis le lot précédent (des copies, transférables) et repart à zéro.
export class Ecrivain {
  constructor() {
    this.mots = new Int32Array(1 << 14);
    this.n = 0;
    this.octets = new Uint8Array(1 << 16);
    this.no = 0;
  }
  // Réserver `k` mots ; rend la position du premier.
  place(k) {
    if (this.n + k > this.mots.length) {
      const m = new Int32Array(Math.max(this.mots.length * 2, this.n + k));
      m.set(this.mots.subarray(0, this.n));
      this.mots = m;
    }
    const p = this.n;
    this.n += k;
    return p;
  }
  // Réserver `k` octets ; rend leur position.
  placeOctets(k) {
    if (this.no + k > this.octets.length) {
      const o = new Uint8Array(Math.max(this.octets.length * 2, this.no + k));
      o.set(this.octets.subarray(0, this.no));
      this.octets = o;
    }
    const p = this.no;
    this.no += k;
    return p;
  }
  op(...mots) {
    const p = this.place(mots.length);
    for (let k = 0; k < mots.length; k++) this.mots[p + k] = mots[k] | 0;
  }
  get vide() { return this.n === 0; }
  lot() {
    const lot = { mots: this.mots.slice(0, this.n), octets: this.octets.slice(0, this.no) };
    this.n = 0;
    this.no = 0;
    return lot;
  }
}

// Parcourir un lot : `visiter(code, mots, p, octets)` pour chaque opération, p la position de son code.
export function parcourir(lot, visiter) {
  const { mots, octets } = lot;
  for (let p = 0; p < mots.length;) {
    const code = mots[p];
    const k = MOTS[code];
    if (!k) throw new Error(`liste d'affichage : opération inconnue ${code} en ${p}`);
    visiter(code, mots, p, octets);
    p += k;
  }
}

// Découper une plage linéaire [debut, debut + n) d'un tampon de l x h (pas l) en rectangles : la fin
// de la première ligne, les lignes entières, le début de la dernière. Rend des [x, y, l, h], coupés au
// tampon.
export function rectanglesDUnePlage(debut, n, l, h) {
  const r = [];
  if (n <= 0 || l <= 0) return r;
  let a = Math.max(0, debut);
  const fin = Math.min(debut + n, l * h);
  if (a >= fin) return r;
  const x0 = a % l, y0 = (a / l) | 0;
  if (x0 !== 0) {
    const k = Math.min(l - x0, fin - a);
    r.push([x0, y0, k, 1]);
    a += k;
  }
  const lignes = ((fin - a) / l) | 0;
  if (lignes > 0) { r.push([0, (a / l) | 0, l, lignes]); a += lignes * l; }
  if (a < fin) r.push([0, (a / l) | 0, fin - a, 1]);
  return r;
}

// Découper une copie linéaire de n octets (source et destination dans deux tampons de pas ls et ld) en
// morceaux qui ne passent de ligne ni dans l'une ni dans l'autre : [sx, sy, dx, dy, longueur].
export function morceauxDUneCopie(src, ls, dst, ld, n) {
  const r = [];
  let k = 0;
  while (k < n) {
    const a = src + k, b = dst + k;
    const sx = a % ls, dx = b % ld;
    const m = Math.min(n - k, ls - sx, ld - dx);
    r.push([sx, (a / ls) | 0, dx, (b / ld) | 0, m]);
    k += m;
  }
  return r;
}

// Décoder un sprite des banques du jeu (le format du traceur, traceur.js) : `hauteur` lignes à partir de
// `p`. Chaque ligne est une suite de codes : n > 0, n pixels opaques ; n < 0, −n pixels sautés, et
// l'octet suivant est d'office un nombre de pixels opaques (le tracé simple, 0x5EE83) ; 0, la fin de
// la ligne. Rend { l, h, valeurs, masque } : l la plus longue ligne (au moins `largeur`).
export function decoderUnSprite(m8, p, largeur, hauteur) {
  // D'abord la longueur de la plus longue ligne, puis les pixels.
  let l = largeur, src = p;
  for (let j = 0; j < hauteur; j++) {
    let x = 0;
    for (let garde = 0; garde < 4096; garde++) {
      const code = m8[src++];
      if (code === 0) break;
      let n = code;
      if (code & 0x80) { x += 256 - code; n = m8[src++]; }
      src += n; x += n;
    }
    if (x > l) l = x;
  }
  if (l > 1024) l = 1024;            // (des données qui ne sont pas un sprite : on borne)
  const h = hauteur;
  const valeurs = new Uint8Array(l * h), masque = new Uint8Array(l * h);
  src = p;
  for (let j = 0; j < h; j++) {
    let x = 0;
    const ligne = j * l;
    for (let garde = 0; garde < 4096; garde++) {
      const code = m8[src++];
      if (code === 0) break;
      let n = code;
      if (code & 0x80) { x += 256 - code; n = m8[src++]; }
      for (let k = 0; k < n; k++, x++) {
        const v = m8[src++];
        if (x < l) { valeurs[ligne + x] = v; masque[ligne + x] = 1; }
      }
    }
  }
  return { l, h, valeurs, masque, fin: src };
}

// Sauter `n` lignes codées à partir de `p` (le tracé enfoncé de 0x11AF4 part plus bas dans les données).
export function sauterDesLignes(m8, p, n) {
  let src = p;
  for (let j = 0; j < n; j++) {
    for (let garde = 0; garde < 4096; garde++) {
      const code = m8[src++];
      if (code === 0) break;
      if (code & 0x80) continue;
      src += code;
    }
  }
  return src;
}
