// Les formats des fichiers du CD de Theme Park, lus et écrits ici même, sans bibliothèque : les
// banques d'images (.TAB + .DAT, pixels codés par lignes), les banques de bruitages et de morceaux
// (.TAB de 32 octets par entrée + .DAT), les textes (LANGn-0.DAT), le WAV, et la conversion des
// morceaux HMP de HMI en fichiers MIDI standard.
//
// Partagé par l'extraction, qui écrit les assets en formats d'aujourd'hui (moteur/node/extraire-jeu.mjs
// sous Node, moteur/web/extraction-travailleur.js dans le navigateur), et par le moteur, qui refait
// depuis ces assets, octet pour octet, les fichiers que le jeu de 1994 lit (assets-du-jeu.js).
//
// Formats établis d'après ThemeParkResourceViewer (tigrouind, licence MIT) et docs/retro-ingenierie.md
// (section « Le son »).

// --- Les banques d'images -------------------------------------------------------------------------
// La table (.TAB) : 6 octets par image, la position de ses pixels dans le .DAT sur 4 octets, la
// largeur puis la hauteur sur 1. Les pixels (.DAT) : par ligne, une suite de codes ; n de 1 à 127 :
// autant de pixels lus tels quels ; n de 128 à 255 : 256 - n pixels transparents ; 0 : fin de la
// ligne, le reste transparent. La transparence est tenue à part des couleurs : l'indice 255 n'est
// jamais un pixel opaque dans les banques du CD (l'extraction le vérifie), ce qui permet de la noter
// 255 dans les PNG.

export function lireTableDImages(tab) {
  const dv = new DataView(tab.buffer, tab.byteOffset, tab.byteLength);
  const entrees = [];
  for (let o = 0; o + 6 <= tab.length; o += 6) {
    entrees.push({ position: dv.getUint32(o, true), largeur: tab[o + 4], hauteur: tab[o + 5] });
  }
  return entrees;
}

export function ecrireTableDImages(entrees) {
  const tab = new Uint8Array(6 * entrees.length);
  const dv = new DataView(tab.buffer);
  entrees.forEach((e, k) => {
    dv.setUint32(6 * k, e.position, true);
    tab[6 * k + 4] = e.largeur;
    tab[6 * k + 5] = e.hauteur;
  });
  return tab;
}

// Décoder une image : { indices, opaque, fin } (fin : la position qui suit ses octets), ou null si
// elle est vide ou déborde du fichier.
export function decoderImage(donnees, position, largeur, hauteur) {
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
  return { indices, opaque, fin: p };
}

// Coder une image comme le faisait Bullfrog : des suites de pixels transparents (128 au plus) et de
// pixels opaques (127 au plus), la fin de ligne dès le dernier pixel opaque. Identique, octet pour
// octet, sur les 3 472 images du CD.
export function encoderImage(indices, opaque, largeur, hauteur) {
  const sortie = [];
  for (let y = 0; y < hauteur; y++) {
    const ligne = y * largeur;
    let fin = largeur;
    while (fin > 0 && !opaque[ligne + fin - 1]) fin--;
    let x = 0;
    while (x < fin) {
      let n = 0;
      if (!opaque[ligne + x]) {
        while (x + n < fin && !opaque[ligne + x + n] && n < 128) n++;
        sortie.push(256 - n);
      } else {
        while (x + n < fin && opaque[ligne + x + n] && n < 127) n++;
        sortie.push(n);
        for (let k = 0; k < n; k++) sortie.push(indices[ligne + x + k]);
      }
      x += n;
    }
    sortie.push(0);
  }
  return Uint8Array.from(sortie);
}

// --- Les banques de bruitages et de morceaux ------------------------------------------------------
// La table (.TAB) : 32 octets par entrée ; le nom sur 18 octets (BUTTON.RAW, RIDE1.HMP), la position
// dans le .DAT sur 4, 4 octets nuls, la taille sur 4, puis 0x5A et 0. La première entrée est vide et
// porte la taille du .DAT. Les données (.DAT) : les entrées à la suite. Les bruitages sont en 8 bits
// non signés à 11 025 Hz (SNDSb-0) ou 22 050 Hz (SNDSb-1), en 16 bits signés à 44 100 Hz (SNDSb-2) ;
// les morceaux sont des fichiers HMP (MUSICb-0 pour la puce FM, -1 pour le MT-32, -2 en General MIDI).
const LONGUEUR_DU_NOM = 18;

export function lireBanqueSonore(tab, dat) {
  const dv = new DataView(tab.buffer, tab.byteOffset, tab.byteLength);
  const entrees = [];
  for (let o = 32; o + 32 <= tab.length; o += 32) {
    let nom = '';
    for (let k = 0; k < LONGUEUR_DU_NOM && tab[o + k]; k++) nom += String.fromCharCode(tab[o + k]);
    const position = dv.getUint32(o + 18, true), taille = dv.getUint32(o + 26, true);
    entrees.push({ nom, octets: dat.subarray(position, position + taille) });
  }
  return entrees;
}

export function ecrireBanqueSonore(entrees) {
  const total = entrees.reduce((t, e) => t + e.octets.length, 0);
  const tab = new Uint8Array(32 * (entrees.length + 1)), dat = new Uint8Array(total);
  const dv = new DataView(tab.buffer);
  dv.setUint32(26, total, true);
  let position = 0;
  entrees.forEach((e, k) => {
    const o = 32 * (k + 1);
    for (let i = 0; i < e.nom.length && i < LONGUEUR_DU_NOM; i++) tab[o + i] = e.nom.charCodeAt(i);
    dv.setUint32(o + 18, position, true);
    dv.setUint32(o + 26, e.octets.length, true);
    tab[o + 30] = 0x5A;
    dat.set(e.octets, position);
    position += e.octets.length;
  });
  return { tab, dat };
}

// Les bruitages d'une banque, d'après son nom (SNDSb-q) : bits par échantillon et fréquence.
export function formatDesBruitages(nomDeLaBanque) {
  const q = /^SNDS\d-(\d)$/i.exec(nomDeLaBanque);
  if (!q) return null;
  return [{ bits: 8, frequence: 11025 }, { bits: 8, frequence: 22050 }, { bits: 16, frequence: 44100 }][q[1]] || null;
}

// La version d'une banque de morceaux (MUSICb-v) : le dossier des assets qui la porte.
export function versionDesMorceaux(nomDeLaBanque) {
  const v = /^MUSIC\d-(\d)$/i.exec(nomDeLaBanque);
  return v ? ['FM', 'MT32', 'GM'][v[1]] || null : null;
}

// --- WAV (PCM, un canal) --------------------------------------------------------------------------
export function ecrireWav(pcm, bits, frequence) {
  const wav = new Uint8Array(44 + pcm.length);
  const dv = new DataView(wav.buffer);
  const texte = (o, s) => { for (let k = 0; k < s.length; k++) wav[o + k] = s.charCodeAt(k); };
  texte(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length, true); texte(8, 'WAVE');
  texte(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, frequence, true); dv.setUint32(28, frequence * (bits / 8), true);
  dv.setUint16(32, bits / 8, true); dv.setUint16(34, bits, true);
  texte(36, 'data'); dv.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

// { pcm, bits, frequence } ; les échantillons tels qu'ils sont dans le fichier (8 bits non signés,
// 16 bits signés petit-boutistes : le format des banques du jeu).
export function lireWav(wav) {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const texte = (o, n) => String.fromCharCode(...wav.subarray(o, o + n));
  if (wav.length < 12 || texte(0, 4) !== 'RIFF' || texte(8, 4) !== 'WAVE') throw new Error("ce n'est pas un fichier WAV");
  let bits = 0, frequence = 0, voies = 0, pcm = null;
  for (let o = 12; o + 8 <= wav.length;) {
    const genre = texte(o, 4), taille = dv.getUint32(o + 4, true);
    if (genre === 'fmt ') {
      if (dv.getUint16(o + 8, true) !== 1) throw new Error('WAV : du PCM est attendu');
      voies = dv.getUint16(o + 10, true);
      frequence = dv.getUint32(o + 12, true);
      bits = dv.getUint16(o + 22, true);
    } else if (genre === 'data') {
      pcm = wav.subarray(o + 8, Math.min(wav.length, o + 8 + taille));
    }
    o += 8 + taille + (taille & 1);
  }
  if (!pcm || voies !== 1) throw new Error('WAV : un seul canal PCM est attendu');
  return { pcm, bits, frequence };
}

// --- Les textes (LANGn-0.DAT) ---------------------------------------------------------------------
// Un mot (16 bits) : le nombre de groupes (26) ; un mot par groupe : son nombre de textes ; puis les
// textes, un octet par signe, chacun terminé par un octet nul. Décodés en groupes, un tableau de
// tableaux de chaînes « binaires » (un caractère par octet, de même code) ; null si le fichier n'a
// pas cette forme.
//
// Les octets sont ceux de la page de code 437 du DOS, et non du Latin-1 : l'allemand écrit Ä en 0x8E,
// Ö en 0x99, Ü en 0x9A ; l'espagnol Ñ en 0xA5, í en 0xA1, ó en 0xA2 ; le français è en 0x8A
// (« barrière », le seul accent de LANG4). Les polices du jeu le suivent : la petite police dessine
// ä, Ä, ö, Ö, ü, Ü, Ñ à leur place de la page 437 (moteur/hote/polices.js). Les assets écrivent donc
// les textes en vrais caractères (textesEnSignes), et les refont en octets de la page 437
// (signesEnTextes) — une langue peut y ajouter ses propres correspondances (textes/index.json).
const NUL = String.fromCharCode(0);

// Les 128 signes de 0x80 à 0xFF de la page 437 (en dessous, l'ASCII, tel quel ; 0xFF est l'espace
// insécable).
export const PAGE_437 = 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐'
  + '└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
const OCTET_437 = new Map([...PAGE_437].map((c, k) => [c, 0x80 + k]));

// Le signe (un caractère d'aujourd'hui) d'un octet de la page 437.
export const signeDe437 = (octet) => (octet < 0x80 ? String.fromCharCode(octet) : PAGE_437[octet - 0x80]);

// Les groupes de chaînes binaires (decoderTextes) en vrais caractères.
export function textesEnSignes(groupes) {
  return groupes.map((g) => g.map((t) => { let s = ''; for (let k = 0; k < t.length; k++) s += signeDe437(t.charCodeAt(k)); return s; }));
}

// Les groupes en vrais caractères, refaits en chaînes binaires (pour encoderTextes). `caracteres` :
// des correspondances en plus, signe -> octet (« Ж » -> 0xC6 : un alphabet que la page 437 n'a pas,
// dessiné dans les polices à ces codes-là), prises avant celles de la page 437. Un signe qui n'a pas
// d'octet est une erreur qui nomme le texte ; avec `signaler` (le mode souple de la page), il est
// signalé et remplacé par « ? ».
export function signesEnTextes(groupes, { caracteres = {}, signaler = null, fichier = 'textes' } = {}) {
  const propres = new Map(Object.entries(caracteres).map(([c, o]) => [c, typeof o === 'number' ? o : parseInt(String(o).replace(/^0x/i, ''), 16)]));
  for (const [c, o] of propres) {
    if (!(o >= 1 && o <= 0xFF) || [...c].length !== 1) throw new Error(`${fichier} : correspondance illisible « ${c} » -> ${o}`);
  }
  return groupes.map((g, i) => g.map((t, j) => {
    let s = '';
    for (const c of t) {
      let o = propres.get(c);
      if (o === undefined) o = c.charCodeAt(0) < 0x80 && c.length === 1 ? c.charCodeAt(0) : OCTET_437.get(c);
      if (o === undefined || o === 0) {
        const message = `${fichier}, groupe ${i}, texte ${j} : « ${c} » (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) `
          + "n'est pas de la page 437 ni des correspondances de la langue (textes/index.json)";
        if (!signaler) throw new Error(message);
        signaler(`${message} ; remplacé par « ? »`);
        o = 0x3F;
      }
      s += String.fromCharCode(o);
    }
    return s;
  }));
}

export function decoderTextes(octets) {
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  if (octets.length < 2) return null;
  const n = dv.getUint16(0, true);
  if (2 * (n + 1) > octets.length) return null;
  let s = '';
  for (let k = 2 * (n + 1); k < octets.length; k += 8192) s += String.fromCharCode(...octets.subarray(k, k + 8192));
  const textes = s.split(NUL);
  if (textes[textes.length - 1] !== '') return null;
  textes.pop();
  const groupes = [];
  let i = 0;
  for (let k = 1; k <= n; k++) {
    const t = dv.getUint16(2 * k, true);
    groupes.push(textes.slice(i, i + t));
    i += t;
  }
  return i === textes.length ? groupes : null;
}

export function encoderTextes(groupes) {
  const table = new Uint8Array(2 * (groupes.length + 1));
  const dv = new DataView(table.buffer);
  dv.setUint16(0, groupes.length, true);
  groupes.forEach((g, k) => dv.setUint16(2 * (k + 1), g.length, true));
  const s = groupes.flat().join(NUL) + NUL;
  const o = new Uint8Array(table.length + s.length);
  o.set(table);
  for (let k = 0; k < s.length; k++) {
    // (une chaîne binaire : un caractère par octet ; un autre est une erreur, pas un octet tronqué)
    if (s.charCodeAt(k) > 0xFF) throw new Error(`textes : le signe « ${s[k]} » n'est pas un octet (signesEnTextes d'abord)`);
    o[table.length + k] = s.charCodeAt(k);
  }
  return o;
}

// --- HMP vers MIDI --------------------------------------------------------------------------------
// Un morceau HMP (« HMIMIDIP ») : le nombre de pistes en 0x30, les pistes à partir de 0x308, chacune
// précédée de trois mots longs (dont sa longueur, en-tête compris). Les événements sont ceux du MIDI,
// sans statut courant, mais les délais sont codés à l'envers : 7 bits par octet, poids faibles
// d'abord, le dernier octet portant le bit 7. Un tic vaut 1/120 s ; les contrôleurs 116 et 117
// bornent la boucle d'un morceau (notés en marqueurs loopStart et loopEnd). Fichier MIDI de format 1,
// 60 tics par noire à 120 noires par minute.
const LONGUEURS = { 0x80: 2, 0x90: 2, 0xA0: 2, 0xB0: 2, 0xC0: 1, 0xD0: 1, 0xE0: 2 };
const DIVISION = 60;

function delaiHmp(p, q) {
  let v = 0, s = 0;
  while (!(p[q] & 0x80)) { v |= p[q] << s; s += 7; q++; }
  return [(v | ((p[q] & 0x7F) << s)) >>> 0, q + 1];
}

function vlq(v) {
  const o = [v & 0x7F];
  v >>>= 7;
  while (v) { o.push(0x80 | (v & 0x7F)); v >>>= 7; }
  return o.reverse();
}

function pistesHmp(h) {
  const texte = String.fromCharCode(...h.subarray(0, 8));
  if (texte !== 'HMIMIDIP') throw new Error("ce n'est pas un morceau HMP");
  const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  const n = dv.getUint32(0x30, true);
  const pistes = [];
  let o = 0x308;
  for (let k = 0; k < n; k++) {
    const longueur = dv.getUint32(o + 4, true);
    pistes.push(h.subarray(o + 12, o + longueur));
    o += longueur;
  }
  return pistes;
}

// Le fichier MIDI standard d'un morceau HMP (Uint8Array).
export function hmpVersMidi(h) {
  const pistes = [];
  for (const p of pistesHmp(h)) {
    const sortie = [];
    let q = 0, attente = 0;
    while (q < p.length) {
      let dt;
      [dt, q] = delaiHmp(p, q);
      attente += dt;
      const statut = p[q++];
      if (statut === 0xFF) {
        const genre = p[q], longueur = p[q + 1];
        const corps = p.subarray(q + 2, q + 2 + longueur);
        q += 2 + longueur;
        if (genre === 0x2F) break;
        sortie.push(...vlq(attente), 0xFF, genre, ...vlq(longueur), ...corps);
        attente = 0;
        continue;
      }
      if (statut === 0xF0 || statut === 0xF7) throw new Error('message système exclusif non géré');
      const n = LONGUEURS[statut & 0xF0];
      if (n === undefined) throw new Error('statut MIDI inconnu 0x' + statut.toString(16));
      const corps = p.subarray(q, q + n);
      q += n;
      if ((statut & 0xF0) === 0xB0 && (corps[0] === 116 || corps[0] === 117)) {
        const texte = corps[0] === 116 ? 'loopStart' : 'loopEnd';
        sortie.push(...vlq(attente), 0xFF, 0x06, texte.length, ...[...texte].map((c) => c.charCodeAt(0)));
        attente = 0;
      }
      sortie.push(...vlq(attente), statut, ...corps);
      attente = 0;
    }
    sortie.push(...vlq(attente), 0xFF, 0x2F, 0x00);
    pistes.push(sortie);
  }
  // la piste 0 du HMP, le chef d'orchestre : le tempo y est posé (120 noires par minute)
  pistes[0] = [0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20, ...pistes[0]];
  const fichier = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, pistes.length >> 8, pistes.length & 0xFF, DIVISION >> 8, DIVISION & 0xFF];
  for (const p of pistes) {
    fichier.push(0x4D, 0x54, 0x72, 0x6B, (p.length >>> 24) & 0xFF, (p.length >>> 16) & 0xFF, (p.length >>> 8) & 0xFF, p.length & 0xFF, ...p);
  }
  return Uint8Array.from(fichier);
}
