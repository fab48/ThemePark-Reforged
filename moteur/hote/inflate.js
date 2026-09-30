// La décompression (deflate) en JavaScript pur : zlib, deflate brut et gzip, sans dépendance.
//
// Pourquoi : la page doit tenir dans un seul fichier HTML ouvert en file:// sur de vieux navigateurs
// (Chrome 49, Firefox 52). Ils n'ont ni DecompressionStream, ni fetch, ni de quoi lire un fichier
// voisin : les assets (les PNG à palette de assets/images/, les gros JSON comme rendu.json, 72 Mo
// décompressés) arrivent donc compressés dans la page même, et c'est elle qui doit les gonfler. Ce
// module tient lieu de zlib.inflateSync de Node et de DecompressionStream du navigateur : le `gonfler`
// de fichiers-paquet.js et le `inflate` attendu par decoderPng (png.js) peuvent être `inflate` d'ici.
//
// Comment : l'algorithme classique de RFC 1951. Trois sortes de blocs — stockés (copiés tels quels),
// à codes de Huffman fixes, à codes dynamiques (les longueurs des codes sont dans le flux, elles-mêmes
// compressées par un petit code de Huffman). Les codes canoniques sont reconstruits à partir de leurs
// seules longueurs, et chaque code devient une table de recherche à un seul niveau, indexée par les
// bits du flux tels qu'ils arrivent (le bit de poids faible d'abord, donc le code y est inscrit à
// l'envers) : une entrée = (symbole << 4) | longueur du code. Un décodage est une lecture de table.
//
// Ce qui rend la boucle rapide : le tampon de bits et les positions sont des variables locales (ni
// objet, ni fermeture dans la boucle : `decoderBloc` recopie l'état à l'entrée et le rend à la sortie) ;
// les tables sont des Uint16Array ; rien n'est alloué dans la boucle, hors l'agrandissement de la
// sortie, qui double de taille quand elle est pleine. Qui connaît la taille décompressée la donne en
// option (`{ taille }`) : la sortie n'est alors allouée qu'une fois, sans recopie.
//
// Les sommes de contrôle sont vérifiées (Adler-32 de zlib, CRC-32 et taille de gzip) : un flux
// tronqué ou abîmé lève une erreur au lieu de rendre des octets faux. Pour s'en passer : `{ verifier:
// false }`. Le dictionnaire prédéfini de zlib (FDICT) n'est pas géré, aucun asset n'en emploie.
//
// Syntaxe : ES2015 strict (ni `**`, ni `??`, ni `?.`, ni spread d'objet, ni champ de classe, ni
// async/await), parce que ce code doit tourner dans Chrome 49 ; moteur/node/eprouver-inflate.mjs le
// vérifie, avec tout le reste, contre le zlib de Node.
//
//   inflate(octets, options)        flux zlib (en-tête de 2 octets, deflate, Adler-32)
//   inflateBrut(octets, options)    deflate brut (RFC 1951, ni en-tête ni somme)
//   degonflerGzip(octets, options)  gzip (RFC 1952), membres concaténés compris
//
// Elles rendent un Uint8Array (à eux seuls : ni Buffer, ni vue sur un plus grand tampon) ; `octets` est
// un Uint8Array (un Buffer convient) ou un ArrayBuffer. options : { taille (octets décompressés, si on
// les connaît), verifier (défaut : vrai) }.

// Longueurs et distances : valeur de base et nombre de bits supplémentaires, par symbole.
const BASE_LONGUEUR = Uint16Array.of(3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258);
const EXTRA_LONGUEUR = Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0);
const BASE_DISTANCE = Uint16Array.of(1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577);
const EXTRA_DISTANCE = Uint8Array.of(0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13);
// L'ordre dans lequel un bloc dynamique donne les longueurs des codes du code des longueurs.
const ORDRE_LONGUEURS = Uint8Array.of(16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15);

const TRONQUE = 'flux compressé tronqué';

// Une table de recherche à un seul niveau pour des codes canoniques, d'après la longueur de chacun
// (0 : symbole absent). { table, bits } : `bits` est la plus grande longueur, la table en a 2^bits.
function construireTable(longueurs) {
  const n = longueurs.length;
  const compte = new Uint16Array(16);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const l = longueurs[i];
    compte[l]++;
    if (l > max) max = l;
  }
  compte[0] = 0;
  if (max === 0) return { table: new Uint16Array(1), bits: 0 };   // aucun code : tout décodage échouera
  let libre = 1;
  for (let l = 1; l <= 15; l++) {
    libre = (libre << 1) - compte[l];
    if (libre < 0) throw new Error('code de Huffman sur-souscrit');
  }
  // (un code incomplet est toléré : ses cases vides, de longueur 0, font échouer le décodage qui les atteint)
  const suivant = new Uint16Array(16);
  for (let l = 1, code = 0; l <= 15; l++) {
    code = (code + compte[l - 1]) << 1;
    suivant[l] = code;
  }
  const taille = 1 << max;
  const table = new Uint16Array(taille);
  for (let sym = 0; sym < n; sym++) {
    const l = longueurs[sym];
    if (l === 0) continue;
    let code = suivant[l]++, envers = 0;
    for (let k = 0; k < l; k++) { envers = (envers << 1) | (code & 1); code >>= 1; }
    const entree = (sym << 4) | l, pas = 1 << l;
    for (let j = envers; j < taille; j += pas) table[j] = entree;
  }
  return { table, bits: max };
}

// Les codes fixes de RFC 1951 § 3.2.6, construits à la première demande.
let fixes = null;
function tablesFixes() {
  if (fixes) return fixes;
  const lit = new Uint8Array(288), dist = new Uint8Array(32);
  lit.fill(8, 0, 144);
  lit.fill(9, 144, 256);
  lit.fill(7, 256, 280);
  lit.fill(8, 280, 288);
  dist.fill(5);
  fixes = { lit: construireTable(lit), dist: construireTable(dist) };
  return fixes;
}

// L'état de la lecture : les octets, la position du prochain octet à charger dans le tampon de bits,
// le tampon (les bits non lus, le plus ancien en bas), le nombre de bits qu'il tient ; et la sortie.
function nouvelEtat(donnees, debut, capacite) {
  return { donnees, pos: debut, bitbuf: 0, bitcnt: 0, sortie: new Uint8Array(capacite), op: 0 };
}

// Lire k bits (k <= 16), pour les en-têtes de bloc : le chemin lent, sûr.
function lireBits(s, k) {
  while (s.bitcnt < k) {
    if (s.pos >= s.donnees.length) throw new Error(TRONQUE);
    s.bitbuf |= s.donnees[s.pos++] << s.bitcnt;
    s.bitcnt += 8;
  }
  const v = s.bitbuf & ((1 << k) - 1);
  s.bitbuf >>>= k;
  s.bitcnt -= k;
  return v;
}

// Un symbole d'un code de Huffman, pour les en-têtes de bloc.
function lireSymbole(s, huffman) {
  while (s.bitcnt < huffman.bits && s.pos < s.donnees.length) {
    s.bitbuf |= s.donnees[s.pos++] << s.bitcnt;
    s.bitcnt += 8;
  }
  const e = huffman.table[s.bitbuf & ((1 << huffman.bits) - 1)];
  const l = e & 15;
  if (l === 0 || l > s.bitcnt) throw new Error(l === 0 ? 'code de Huffman invalide' : TRONQUE);
  s.bitbuf >>>= l;
  s.bitcnt -= l;
  return e >> 4;
}

// Jeter les bits qui achèvent l'octet en cours, et rendre au flux les octets entiers que le tampon
// avait pris d'avance : la position est alors celle du prochain octet non lu.
function alignerSurOctet(s) {
  s.pos -= (s.bitcnt - (s.bitcnt & 7)) >> 3;
  s.bitbuf = 0;
  s.bitcnt = 0;
  if (s.pos > s.donnees.length) throw new Error(TRONQUE);
}

function agrandir(sortie, op, besoin) {
  let cap = sortie.length * 2;
  if (cap < op + besoin) cap = op + besoin;
  if (cap < 1024) cap = 1024;
  const plus = new Uint8Array(cap);
  plus.set(sortie.subarray(0, op));
  return plus;
}

// Le corps d'un bloc à codes de Huffman, jusqu'à son symbole de fin. La boucle interne : tout y est
// local. Le tampon de bits est rempli jusqu'à 25 bits au moins avant chaque lecture (un code de 15 bits
// et 5 bits supplémentaires, ou un code de distance de 15 bits, puis 13 bits supplémentaires après une
// nouvelle charge). Au-delà de la fin des données le tampon reçoit des zéros — une lecture hors du
// tableau serait plus lente — et la fin du bloc vérifie qu'on n'a pas consommé plus que ce qui existait.
function decoderBloc(s, lit, dist) {
  const donnees = s.donnees, n = donnees.length;
  let pos = s.pos, bitbuf = s.bitbuf, bitcnt = s.bitcnt, sortie = s.sortie, op = s.op;
  let cap = sortie.length;
  const tl = lit.table, ml = (1 << lit.bits) - 1;
  const td = dist.table, md = (1 << dist.bits) - 1;
  for (;;) {
    while (bitcnt <= 24) {
      if (pos < n) bitbuf |= donnees[pos] << bitcnt;
      else if (pos > n + 8) throw new Error(TRONQUE);
      pos++;
      bitcnt += 8;
    }
    let e = tl[bitbuf & ml];
    let l = e & 15;
    if (l === 0) throw new Error('code de Huffman invalide');
    bitbuf >>>= l;
    bitcnt -= l;
    let sym = e >> 4;
    if (sym < 256) {
      if (op >= cap) { sortie = agrandir(sortie, op, 1); cap = sortie.length; }
      sortie[op++] = sym;
      continue;
    }
    if (sym === 256) break;
    sym -= 257;
    if (sym >= 29) throw new Error('symbole de longueur invalide');
    let longueur = BASE_LONGUEUR[sym];
    let extra = EXTRA_LONGUEUR[sym];
    if (extra !== 0) {
      longueur += bitbuf & ((1 << extra) - 1);
      bitbuf >>>= extra;
      bitcnt -= extra;
    }
    while (bitcnt <= 24) {
      if (pos < n) bitbuf |= donnees[pos] << bitcnt;
      else if (pos > n + 8) throw new Error(TRONQUE);
      pos++;
      bitcnt += 8;
    }
    e = td[bitbuf & md];
    l = e & 15;
    if (l === 0) throw new Error('code de distance invalide');
    bitbuf >>>= l;
    bitcnt -= l;
    sym = e >> 4;
    if (sym >= 30) throw new Error('symbole de distance invalide');
    let d = BASE_DISTANCE[sym];
    extra = EXTRA_DISTANCE[sym];
    if (extra !== 0) {
      while (bitcnt < extra) {
        if (pos < n) bitbuf |= donnees[pos] << bitcnt;
        else if (pos > n + 8) throw new Error(TRONQUE);
        pos++;
        bitcnt += 8;
      }
      d += bitbuf & ((1 << extra) - 1);
      bitbuf >>>= extra;
      bitcnt -= extra;
    }
    if (d > op) throw new Error('distance au-delà du début de la sortie');
    if (op + longueur > cap) { sortie = agrandir(sortie, op, longueur); cap = sortie.length; }
    let de = op - d;
    for (let k = 0; k < longueur; k++) sortie[op++] = sortie[de++];
  }
  s.pos = pos; s.bitbuf = bitbuf; s.bitcnt = bitcnt; s.sortie = sortie; s.op = op;
  if (pos * 8 - bitcnt > n * 8) throw new Error(TRONQUE);
}

// Un bloc stocké : LEN, NLEN, puis LEN octets copiés.
function copierStocke(s) {
  alignerSurOctet(s);
  const d = s.donnees;
  if (s.pos + 4 > d.length) throw new Error(TRONQUE);
  const len = d[s.pos] | (d[s.pos + 1] << 8), nlen = d[s.pos + 2] | (d[s.pos + 3] << 8);
  if ((len ^ nlen) !== 0xFFFF) throw new Error('bloc stocké : longueur incohérente');
  s.pos += 4;
  if (s.pos + len > d.length) throw new Error(TRONQUE);
  if (s.op + len > s.sortie.length) s.sortie = agrandir(s.sortie, s.op, len);
  s.sortie.set(d.subarray(s.pos, s.pos + len), s.op);
  s.pos += len;
  s.op += len;
}

// L'en-tête d'un bloc dynamique : les deux codes (littéraux/longueurs, distances) qu'il déclare.
function lireCodesDynamiques(s) {
  const nlit = lireBits(s, 5) + 257, ndist = lireBits(s, 5) + 1, ncl = lireBits(s, 4) + 4;
  if (nlit > 286 || ndist > 30) throw new Error('bloc dynamique : trop de codes');
  const cl = new Uint8Array(19);
  for (let i = 0; i < ncl; i++) cl[ORDRE_LONGUEURS[i]] = lireBits(s, 3);
  const codeCl = construireTable(cl);
  const total = nlit + ndist, longueurs = new Uint8Array(total);
  for (let i = 0; i < total;) {
    const sym = lireSymbole(s, codeCl);
    if (sym < 16) { longueurs[i++] = sym; continue; }
    let rep, val = 0;
    if (sym === 16) {
      if (i === 0) throw new Error('bloc dynamique : répétition sans longueur précédente');
      val = longueurs[i - 1];
      rep = 3 + lireBits(s, 2);
    } else if (sym === 17) rep = 3 + lireBits(s, 3);
    else rep = 11 + lireBits(s, 7);
    if (i + rep > total) throw new Error('bloc dynamique : trop de longueurs');
    longueurs.fill(val, i, i + rep);
    i += rep;
  }
  if (longueurs[256] === 0) throw new Error('bloc dynamique : pas de code de fin de bloc');
  return { lit: construireTable(longueurs.subarray(0, nlit)), dist: construireTable(longueurs.subarray(nlit)) };
}

// Un flux deflate entier, à partir de l'octet `debut` : { sortie (plus grande que le contenu), op (le
// nombre d'octets rendus), fin (la position du premier octet qui suit le flux) }.
function gonflerFlux(donnees, debut, capacite) {
  const s = nouvelEtat(donnees, debut, capacite);
  for (let dernier = 0; !dernier;) {
    dernier = lireBits(s, 1);
    const type = lireBits(s, 2);
    if (type === 0) copierStocke(s);
    else if (type === 1) { const f = tablesFixes(); decoderBloc(s, f.lit, f.dist); }
    else if (type === 2) { const c = lireCodesDynamiques(s); decoderBloc(s, c.lit, c.dist); }
    else throw new Error('type de bloc invalide');
  }
  alignerSurOctet(s);
  return { sortie: s.sortie, op: s.op, fin: s.pos };
}

// Un tampon de la taille exacte du contenu (une copie, sauf si la sortie est déjà juste).
function exact(sortie, op) {
  return op === sortie.length ? sortie : sortie.slice(0, op);
}

function entree(octets) {
  if (octets instanceof Uint8Array) return octets;
  if (octets instanceof ArrayBuffer) return new Uint8Array(octets);
  throw new TypeError('inflate : un Uint8Array ou un ArrayBuffer est attendu');
}

// La capacité de départ de la sortie : la taille donnée, ou à défaut quelques fois celle de l'entrée.
function capaciteDepart(donnees, options) {
  if (options && options.taille >= 0) return options.taille;
  return Math.max(1024, donnees.length * 4);
}

function doitVerifier(options) {
  return !(options && options.verifier === false);
}

function adler32(d, n) {
  let a = 1, b = 0;
  for (let i = 0; i < n;) {
    // 5552 octets au plus avant de réduire : b ne dépasse alors pas 2^32
    const fin = Math.min(i + 5552, n);
    for (; i < fin; i++) { a += d[i]; b += a; }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const TABLE_CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  TABLE_CRC[n] = c;
}

function crc32(d, n) {
  let c = -1;
  for (let i = 0; i < n; i++) c = TABLE_CRC[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

export function inflateBrut(octets, options) {
  const donnees = entree(octets);
  const r = gonflerFlux(donnees, 0, capaciteDepart(donnees, options));
  return exact(r.sortie, r.op);
}

export function inflate(octets, options) {
  const donnees = entree(octets);
  if (donnees.length < 6) throw new Error(TRONQUE);
  const cmf = donnees[0], flg = donnees[1];
  if ((cmf & 15) !== 8 || (cmf >> 4) > 7 || ((cmf << 8) | flg) % 31 !== 0) throw new Error("ce n'est pas un flux zlib");
  if (flg & 32) throw new Error('zlib : dictionnaire prédéfini non géré');
  const r = gonflerFlux(donnees, 2, capaciteDepart(donnees, options));
  if (r.fin + 4 > donnees.length) throw new Error(TRONQUE);
  if (doitVerifier(options)) {
    const attendu = ((donnees[r.fin] << 24) | (donnees[r.fin + 1] << 16) | (donnees[r.fin + 2] << 8) | donnees[r.fin + 3]) >>> 0;
    if (adler32(r.sortie, r.op) !== attendu) throw new Error('zlib : somme Adler-32 fausse');
  }
  return exact(r.sortie, r.op);
}

export function degonflerGzip(octets, options) {
  const donnees = entree(octets);
  const membres = [];
  let total = 0, pos = 0;
  do {
    if (pos + 18 > donnees.length) throw new Error(TRONQUE);
    if (donnees[pos] !== 0x1F || donnees[pos + 1] !== 0x8B || donnees[pos + 2] !== 8) throw new Error("ce n'est pas un flux gzip");
    const flg = donnees[pos + 3];
    let p = pos + 10;
    if (flg & 4) p += 2 + (donnees[p] | (donnees[p + 1] << 8));                 // FEXTRA
    if (flg & 8) { while (p < donnees.length && donnees[p] !== 0) p++; p++; }    // FNAME
    if (flg & 16) { while (p < donnees.length && donnees[p] !== 0) p++; p++; }   // FCOMMENT
    if (flg & 2) p += 2;                                                        // FHCRC
    if (p >= donnees.length) throw new Error(TRONQUE);
    const seul = membres.length === 0 && options && options.taille >= 0;
    const r = gonflerFlux(donnees, p, seul ? options.taille : Math.max(1024, (donnees.length - p) * 4));
    if (r.fin + 8 > donnees.length) throw new Error(TRONQUE);
    const f = r.fin;
    if (doitVerifier(options)) {
      const crc = ((donnees[f + 3] << 24) | (donnees[f + 2] << 16) | (donnees[f + 1] << 8) | donnees[f]) >>> 0;
      const taille = ((donnees[f + 7] << 24) | (donnees[f + 6] << 16) | (donnees[f + 5] << 8) | donnees[f + 4]) >>> 0;
      if (crc32(r.sortie, r.op) !== crc) throw new Error('gzip : somme CRC-32 fausse');
      if ((r.op >>> 0) !== taille) throw new Error('gzip : taille annoncée fausse');
    }
    membres.push({ sortie: r.sortie, op: r.op });
    total += r.op;
    pos = f + 8;
  } while (pos < donnees.length && donnees[pos] === 0x1F);   // (des octets de bourrage après le dernier membre sont ignorés)
  if (membres.length === 1) return exact(membres[0].sortie, membres[0].op);
  const sortie = new Uint8Array(total);
  for (let i = 0, o = 0; i < membres.length; i++) {
    sortie.set(membres[i].sortie.subarray(0, membres[i].op), o);
    o += membres[i].op;
  }
  return sortie;
}
