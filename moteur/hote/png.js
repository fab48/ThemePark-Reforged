// PNG à palette (8 bits par pixel, type de couleur 3), écrit et lu ici même, sans bibliothèque. C'est
// le format des images du jeu dans les assets : chaque pixel est l'indice d'une couleur dans la
// palette de 256 couleurs, exactement comme dans les fichiers de 1994 ; la palette du PNG (PLTE) ne
// sert qu'à les regarder, et une entrée transparente (tRNS) note la transparence des sprites.
//
// La compression (zlib) est fournie par l'appelant : zlib sous Node, CompressionStream et
// DecompressionStream dans le navigateur. Les fonctions rendent des promesses pour cette raison.

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(...parties) {
  let c = -1;
  for (const p of parties) for (let k = 0; k < p.length; k++) c = CRC[(c ^ p[k]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function bloc(type, corps) {
  const t = Uint8Array.from(type, (c) => c.charCodeAt(0));
  const b = new Uint8Array(12 + corps.length);
  const dv = new DataView(b.buffer);
  dv.setUint32(0, corps.length);
  b.set(t, 4);
  b.set(corps, 8);
  dv.setUint32(8 + corps.length, crc32(t, corps));
  return b;
}

export function concatener(...parties) {
  const sortie = new Uint8Array(parties.reduce((t, p) => t + p.length, 0));
  let o = 0;
  for (const p of parties) { sortie.set(p, o); o += p.length; }
  return sortie;
}

// Écrire un PNG. palette : 768 octets, composantes de 6 bits (celles du VGA), étendues à 8 bits comme
// le fait le moteur (v << 2 | v >> 4) ; transparent : l'indice noté transparent, ou null.
export async function encoderPng({ largeur, hauteur, indices, palette, transparent = null }, deflate) {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, largeur);
  dv.setUint32(4, hauteur);
  ihdr[8] = 8;                           // 8 bits par pixel
  ihdr[9] = 3;                           // à palette
  const plte = new Uint8Array(768);
  for (let k = 0; k < 768; k++) plte[k] = (palette[k] << 2 | palette[k] >> 4) & 0xFF;
  const brut = new Uint8Array((largeur + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    brut[y * (largeur + 1)] = 0;         // filtre : aucun
    brut.set(indices.subarray(y * largeur, (y + 1) * largeur), y * (largeur + 1) + 1);
  }
  const parties = [SIGNATURE, bloc('IHDR', ihdr), bloc('PLTE', plte)];
  if (transparent !== null) {
    const trns = new Uint8Array(256).fill(255);
    trns[transparent] = 0;
    parties.push(bloc('tRNS', trns));
  }
  parties.push(bloc('IDAT', await deflate(brut)), bloc('IEND', new Uint8Array(0)));
  return concatener(...parties);
}

// Lire un PNG. Celui des assets est à palette de 8 bits : { largeur, hauteur, indices, palette (768
// octets, 8 bits par composante : PLTE), transparent (l'indice d'alpha nul, ou null) }. Les cinq
// filtres sont acceptés (un éditeur d'images qui réenregistre le fichier les emploie), pas
// l'entrelacement.
//
// Ce qu'un éditeur d'images écrit à la place, quand on modifie une image (la distribution est faite
// pour qu'on le fasse : moteur/hote/distribution.js) : une palette de 1, 2 ou 4 bits (peu de
// couleurs) — lue de même, en indices — ; des niveaux de gris, du RVB ou du RVBA, en 8 bits par
// composante — rendus en { largeur, hauteur, indices: null, rgba (4 octets par pixel), palette: null,
// transparent: null } : c'est à l'appelant de ramener les couleurs à la palette du jeu
// (assets-du-jeu.js). Les 16 bits par composante sont refusés, avec un message qui le dit.
export async function decoderPng(octets, inflate) {
  if (octets.length < 8 || SIGNATURE.some((v, k) => octets[k] !== v)) throw new Error("ce n'est pas un PNG");
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  let largeur = 0, hauteur = 0, profondeur = 8, genre = 3, palette = null, transparent = null, trns = null;
  const idats = [];
  for (let o = 8; o + 8 <= octets.length;) {
    const taille = dv.getUint32(o), type = String.fromCharCode(...octets.subarray(o + 4, o + 8));
    const corps = octets.subarray(o + 8, o + 8 + taille);
    if (type === 'IHDR') {
      largeur = dv.getUint32(o + 8);
      hauteur = dv.getUint32(o + 12);
      profondeur = corps[8];
      genre = corps[9];
      if (profondeur === 16) throw new Error('PNG en 16 bits par composante : le réenregistrer en 8 bits');
      if (![0, 2, 3, 4, 6].includes(genre) || (genre !== 3 && genre !== 0 && profondeur !== 8)) {
        throw new Error('PNG : forme non gérée (profondeur ' + profondeur + ', type ' + genre + ')');
      }
      if (corps[12] !== 0) throw new Error('PNG : image entrelacée, non gérée (la réenregistrer sans entrelacement)');
    } else if (type === 'PLTE') {
      palette = new Uint8Array(768);
      palette.set(corps.subarray(0, 768));
    } else if (type === 'tRNS') {
      trns = corps.slice();
      for (let k = 0; k < corps.length; k++) if (corps[k] === 0) { transparent = k; break; }
    } else if (type === 'IDAT') {
      idats.push(corps);
    } else if (type === 'IEND') break;
    o += 12 + taille;
  }
  if (!largeur) throw new Error('PNG : en-tête manquant');
  if (genre === 3 && !palette) throw new Error('PNG : palette manquante');
  const brut = await inflate(concatener(...idats));
  if (genre === 3 && profondeur === 8) {
    // (la forme des assets, déchiffrée directement en indices)
    const indices = new Uint8Array(largeur * hauteur);
    const pas = largeur + 1;
    for (let y = 0; y < hauteur; y++) {
      const filtre = brut[y * pas], ligne = y * largeur, source = y * pas + 1;
      for (let x = 0; x < largeur; x++) {
        const a = x > 0 ? indices[ligne + x - 1] : 0;
        const b = y > 0 ? indices[ligne - largeur + x] : 0;
        const c = x > 0 && y > 0 ? indices[ligne - largeur + x - 1] : 0;
        let v = brut[source + x];
        if (filtre === 1) v += a;
        else if (filtre === 2) v += b;
        else if (filtre === 3) v += (a + b) >> 1;
        else if (filtre === 4) v += paeth(a, b, c);
        else if (filtre !== 0) throw new Error('PNG : filtre ' + filtre + ' inconnu');
        indices[ligne + x] = v & 0xFF;
      }
    }
    return { largeur, hauteur, indices, palette, transparent };
  }
  // Les autres formes : les lignes défiltrées octet par octet, puis lues pixel par pixel.
  const composantes = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[genre];
  const bpp = Math.max(1, (composantes * profondeur) >> 3);           // octets par pixel, pour les filtres
  const pas = Math.ceil(largeur * composantes * profondeur / 8);
  const lignes = new Uint8Array(pas * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (pas + 1)], source = y * (pas + 1) + 1, ligne = y * pas;
    for (let x = 0; x < pas; x++) {
      const a = x >= bpp ? lignes[ligne + x - bpp] : 0;
      const b = y > 0 ? lignes[ligne - pas + x] : 0;
      const c = x >= bpp && y > 0 ? lignes[ligne - pas + x - bpp] : 0;
      let v = brut[source + x];
      if (filtre === 1) v += a;
      else if (filtre === 2) v += b;
      else if (filtre === 3) v += (a + b) >> 1;
      else if (filtre === 4) v += paeth(a, b, c);
      else if (filtre !== 0) throw new Error('PNG : filtre ' + filtre + ' inconnu');
      lignes[ligne + x] = v & 0xFF;
    }
  }
  // un échantillon de 1, 2, 4 ou 8 bits (le premier pixel dans les bits de poids fort)
  const echantillon = (y, k) => {
    if (profondeur === 8) return lignes[y * pas + k];
    const bit = k * profondeur, par = 8 / profondeur;
    return (lignes[y * pas + (bit >> 3)] >> ((par - 1 - (k % par)) * profondeur)) & ((1 << profondeur) - 1);
  };
  if (genre === 3) {
    const indices = new Uint8Array(largeur * hauteur);
    for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) indices[y * largeur + x] = echantillon(y, x);
    return { largeur, hauteur, indices, palette, transparent };
  }
  const rgba = new Uint8Array(largeur * hauteur * 4);
  const echelle = 255 / ((1 << profondeur) - 1);
  // (tRNS d'une image sans palette : la couleur transparente, en 16 bits par composante)
  const cle = trns && trns.length >= 2 ? [0, 2, 4].map((k) => (trns[k] << 8) | trns[k + 1]) : null;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const o = 4 * (y * largeur + x);
      if (genre === 0 || genre === 4) {
        const g = echantillon(y, genre === 0 ? x : 2 * x);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = Math.round(g * echelle);
        rgba[o + 3] = genre === 4 ? lignes[y * pas + 2 * x + 1] : (cle && g === cle[0] ? 0 : 255);
      } else {
        const p = y * pas + x * composantes;
        rgba[o] = lignes[p]; rgba[o + 1] = lignes[p + 1]; rgba[o + 2] = lignes[p + 2];
        rgba[o + 3] = genre === 6 ? lignes[p + 3]
          : (cle && lignes[p] === cle[0] && lignes[p + 1] === cle[1] && lignes[p + 2] === cle[2] ? 0 : 255);
      }
    }
  }
  return { largeur, hauteur, indices: null, rgba, palette: null, transparent: null };
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// Une image en couleurs (rgba) ramenée à une palette de 6 bits : la couleur la plus proche (distance
// euclidienne) ; pour un sprite (`avecTransparence`), les pixels d'alpha sous 128 vont à l'indice
// transparent (255), qui est alors exclu des couleurs possibles.
export function ramenerALaPalette(im, palette, avecTransparence) {
  const n = im.largeur * im.hauteur, indices = new Uint8Array(n);
  const couleurs = avecTransparence ? 255 : 256;
  const vga = Uint8Array.from(palette, (v) => (v << 2 | v >> 4) & 0xFF);
  const deja = new Map();
  for (let k = 0; k < n; k++) {
    const r = im.rgba[4 * k], v = im.rgba[4 * k + 1], b = im.rgba[4 * k + 2];
    if (avecTransparence && im.rgba[4 * k + 3] < 128) { indices[k] = 255; continue; }
    const cle = (r << 16) | (v << 8) | b;
    let meilleur = deja.get(cle);
    if (meilleur === undefined) {
      let distance = Infinity;
      for (let c = 0; c < couleurs; c++) {
        const dr = vga[3 * c] - r, dv = vga[3 * c + 1] - v, db = vga[3 * c + 2] - b;
        const d = dr * dr + dv * dv + db * db;
        if (d < distance) { distance = d; meilleur = c; }
      }
      deja.set(cle, meilleur);
    }
    indices[k] = meilleur;
  }
  return indices;
}
