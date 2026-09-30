// L'épreuve de moteur/hote/inflate.js : la décompression en JavaScript pur, comparée octet pour octet
// au zlib de Node. Sont éprouvés :
//  - des données de toutes natures (aléatoires de 0 à 5 Mo, très compressibles, texte) ;
//  - les niveaux 0 à 9 et les stratégies de zlib (fixe, Huffman seul, RLE, filtré), dans les trois
//    enveloppes (zlib, deflate brut, gzip) ;
//  - les flux abîmés (tronqués, somme fausse), qui doivent lever une erreur ;
//  - les vrais fichiers du projet : assets/animations/import/rendu.json (compressé niveau 9, avec les
//    temps de décompression, cible : moins de 2 s) et tous les PNG de assets/images/ (decoderPng avec
//    l'inflate d'ici contre decoderPng avec zlib.inflateSync) ;
//  - enfin, la syntaxe du module : rien qui dépasse ES2015 (il doit tourner dans Chrome 49).
//
// Usage : node moteur/node/eprouver-inflate.mjs        (code de sortie 1 au moindre écart)

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { inflate, inflateBrut, degonflerGzip } from '../hote/inflate.js';
import { decoderPng } from '../hote/png.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let echecs = 0, essais = 0;

const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const arrondi = (x) => x >= 100 ? x.toFixed(0) : x.toFixed(1);
const mo = (n) => (n / 1048576).toFixed(1) + ' Mo';

function verifier(nom, condition, detail) {
  essais++;
  if (!condition) { echecs++; console.log(`  ÉCHEC ${nom}${detail ? ' : ' + detail : ''}`); }
}

function memes(a, b) {
  return a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0;
}

const ENVELOPPES = {
  zlib: { compresser: (d, o) => zlib.deflateSync(d, o), gonfler: inflate },
  brut: { compresser: (d, o) => zlib.deflateRawSync(d, o), gonfler: inflateBrut },
  gzip: { compresser: (d, o) => zlib.gzipSync(d, o), gonfler: degonflerGzip },
};

// Compresser (zlib de Node), gonfler (ici), comparer ; rend le temps de la décompression, en ms.
function comparerFlux(nom, donnees, enveloppe, options) {
  const env = ENVELOPPES[enveloppe];
  const comprime = env.compresser(donnees, options);
  let rendu;
  const t0 = process.hrtime.bigint();
  try { rendu = env.gonfler(comprime); } catch (err) { verifier(nom, false, err.message); return 0; }
  const t = ms(t0);
  verifier(nom, memes(rendu, donnees), 'contenu différent');
  verifier(nom + ' (type)', rendu instanceof Uint8Array && !Buffer.isBuffer(rendu) && rendu.buffer.byteLength === rendu.length && rendu.byteOffset === 0, 'pas un Uint8Array exact');
  return t;
}

// ---- des jeux de données -----------------------------------------------------------------------

function aleatoire(n, graine) {
  // (crypto.randomBytes serait plus court, mais on veut des jeux reproductibles)
  const d = new Uint8Array(n);
  let x = graine >>> 0 || 1;
  for (let i = 0; i < n; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; d[i] = x & 255; }
  return d;
}

function peuDeSymboles(n, graine, symboles) {
  const a = aleatoire(n, graine);
  for (let i = 0; i < n; i++) a[i] = a[i] % symboles;
  return a;
}

function texte(n) {
  const mots = ['le', 'parc', 'attraction', 'visiteur', 'manège', 'boutique', 'argent', 'prix', 'banque', 'action', 'ouvrier', 'ticket', 'montagne', 'russe', 'train', 'fantôme', 'château', 'les', 'de', 'et', 'un', 'très', 'grand'];
  const a = aleatoire(n, 99);
  let s = '';
  for (let i = 0; s.length < n; i++) s += mots[a[i % n] % mots.length] + (a[(i * 7) % n] % 11 === 0 ? '.\n' : ' ');
  return new Uint8Array(Buffer.from(s.slice(0, n), 'utf8'));
}

function sourcesDuProjet() {
  const parties = [];
  for (const dossier of ['moteur/hote', 'moteur/web', 'moteur/node']) {
    for (const f of fs.readdirSync(path.join(RACINE, dossier))) {
      if (/\.(js|mjs|html)$/.test(f)) parties.push(fs.readFileSync(path.join(RACINE, dossier, f)));
    }
  }
  return new Uint8Array(Buffer.concat(parties));
}

// ---- 1. données synthétiques --------------------------------------------------------------------

function syntheses() {
  console.log('1. Données synthétiques (zlib, brut, gzip ; niveau par défaut)');
  const jeux = [];
  for (const n of [0, 1, 2, 3, 100, 1000, 32767, 32768, 32769, 65535, 65536, 65537, 131072, 1 << 20, 5 << 20]) {
    jeux.push([`aléatoire ${n}`, aleatoire(n, n + 1)]);
  }
  for (const n of [0, 1, 300, 65536, 1 << 20, 5 << 20]) {
    jeux.push([`zéros ${n}`, new Uint8Array(n)]);
    jeux.push([`4 symboles ${n}`, peuDeSymboles(n, n + 7, 4)]);
    jeux.push([`motif court ${n}`, Uint8Array.from({ length: n }, (_, i) => (i % 7) * 3)]);
    jeux.push([`texte ${n}`, texte(n)]);
  }
  jeux.push(['sources du projet', sourcesDuProjet()]);
  jeux.push(['une valeur, longueur 258 exacte', new Uint8Array(258 * 3 + 1).fill(65)]);
  let total = 0, temps = 0;
  for (const [nom, d] of jeux) {
    for (const env of Object.keys(ENVELOPPES)) {
      temps += comparerFlux(`${nom} [${env}]`, d, env);
      total += d.length;
    }
  }
  console.log(`  ${jeux.length * 3} flux, ${mo(total)} décompressés en ${arrondi(temps)} ms`);
}

// ---- 2. niveaux et stratégies -------------------------------------------------------------------

function niveaux() {
  console.log('2. Niveaux 0 à 9 et stratégies de zlib, dans les trois enveloppes');
  const donnees = new Uint8Array(Buffer.concat([texte(300000), aleatoire(70000, 5), new Uint8Array(70000), peuDeSymboles(200000, 8, 5), sourcesDuProjet().subarray(0, 200000)]));
  let n = 0;
  for (const env of Object.keys(ENVELOPPES)) {
    for (let niveau = 0; niveau <= 9; niveau++) {
      comparerFlux(`niveau ${niveau} [${env}]`, donnees, env, { level: niveau });
      n++;
      for (const [nomStrategie, strategie] of [['fixe', zlib.constants.Z_FIXED], ['Huffman seul', zlib.constants.Z_HUFFMAN_ONLY], ['RLE', zlib.constants.Z_RLE], ['filtré', zlib.constants.Z_FILTERED]]) {
        if (niveau % 3 !== 0 && nomStrategie !== 'fixe') continue;
        comparerFlux(`niveau ${niveau} ${nomStrategie} [${env}]`, donnees, env, { level: niveau, strategy: strategie });
        n++;
      }
    }
    // petits blocs, petite fenêtre, gros memLevel : d'autres découpages en blocs
    comparerFlux(`fenêtre 9 bits [${env}]`, donnees, env, { windowBits: 9, memLevel: 1 });
    comparerFlux(`memLevel 9, chunk 100 [${env}]`, donnees, env, { memLevel: 9, chunkSize: 100 });
    n += 2;
  }
  console.log(`  ${n} configurations`);
}

// ---- 3. l'option { taille } et les flux abîmés --------------------------------------------------

function options() {
  console.log("3. Option { taille }, sommes de contrôle, flux tronqués ou abîmés");
  const d = texte(500000);
  const z = zlib.deflateSync(d);
  verifier('taille exacte', memes(inflate(z, { taille: d.length }), d));
  verifier('taille trop petite (la sortie grandit)', memes(inflate(z, { taille: 10 }), d));
  verifier('taille trop grande (rendu exact)', memes(inflate(z, { taille: d.length * 3 }), d));
  verifier('taille 0 sur flux vide', inflate(zlib.deflateSync(new Uint8Array(0)), { taille: 0 }).length === 0);
  verifier('ArrayBuffer accepté', memes(inflate(z.buffer.slice(z.byteOffset, z.byteOffset + z.length)), d));
  verifier('Uint8Array décalé dans un plus grand tampon', (() => {
    const grand = new Uint8Array(z.length + 100);
    grand.set(z, 37);
    return memes(inflate(grand.subarray(37, 37 + z.length)), d);
  })());
  const leve = (nom, f) => { let ok = false; try { f(); } catch (err) { ok = true; } verifier(nom, ok, "aucune erreur"); };
  leve('zlib tronqué (moitié)', () => inflate(z.subarray(0, z.length >> 1)));
  leve('zlib tronqué (sans Adler)', () => inflate(z.subarray(0, z.length - 4)));
  leve('zlib tronqué (1 octet de moins)', () => inflate(z.subarray(0, z.length - 1)));
  leve('zlib vide', () => inflate(new Uint8Array(0)));
  const mauvais = Uint8Array.from(z); mauvais[mauvais.length - 1] ^= 1;
  leve('Adler faux', () => inflate(mauvais));
  verifier('Adler faux mais { verifier: false }', memes(inflate(mauvais, { verifier: false }), d));
  const g = zlib.gzipSync(d);
  const gmauvais = Uint8Array.from(g); gmauvais[gmauvais.length - 8] ^= 1;
  leve('CRC gzip faux', () => degonflerGzip(gmauvais));
  const gtaille = Uint8Array.from(g); gtaille[gtaille.length - 1] ^= 1;
  leve('taille gzip fausse', () => degonflerGzip(gtaille));
  leve('gzip tronqué', () => degonflerGzip(g.subarray(0, g.length >> 1)));
  leve('en-tête zlib absurde', () => inflate(Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8)));
  leve('en-tête gzip absurde', () => degonflerGzip(new Uint8Array(40)));
  leve('brut tronqué', () => inflateBrut(zlib.deflateRawSync(d).subarray(0, 1000)));
  // du bruit dans un flux : ne doit jamais boucler ni planter autrement que par une erreur
  const brut = zlib.deflateRawSync(d);
  let leves = 0, egaux = 0;
  for (let k = 0; k < 300; k++) {
    const c = Uint8Array.from(brut);
    for (let j = 0; j < 3; j++) c[crypto.randomInt(c.length)] ^= 1 << crypto.randomInt(8);
    try { const r = inflateBrut(c); if (memes(r, d)) egaux++; } catch (err) { leves++; }
  }
  verifier('300 flux bruités : ni boucle ni plantage', true);
  console.log(`  flux bruités : ${leves} erreurs levées, ${300 - leves} décodés (dont ${egaux} identiques)`);
  // gzip à plusieurs membres, avec nom et commentaire
  const m = Buffer.concat([zlib.gzipSync(Buffer.from('abc')), zlib.gzipSync(Buffer.from('défg'))]);
  verifier('gzip à deux membres', Buffer.from(degonflerGzip(m)).toString() === 'abcdéfg');
  const avecNom = Buffer.concat([Buffer.from([0x1f, 0x8b, 8, 8 | 16, 0, 0, 0, 0, 0, 3]), Buffer.from('nom.txt\0commentaire\0'), zlib.deflateRawSync(Buffer.from('bonjour')), (() => { const b = Buffer.alloc(8); b.writeUInt32LE(zlib.crc32 ? zlib.crc32(Buffer.from('bonjour')) : 0, 0); b.writeUInt32LE(7, 4); return b; })()]);
  verifier('gzip avec FNAME et FCOMMENT (sans somme si zlib.crc32 absent)', Buffer.from(degonflerGzip(avecNom, { verifier: !!zlib.crc32 })).toString() === 'bonjour');
}

// ---- 4. rendu.json ------------------------------------------------------------------------------

function renduJson() {
  console.log('4. assets/animations/import/rendu.json (zlib niveau 9)');
  const f = path.join(RACINE, 'assets/animations/import/rendu.json');
  if (!fs.existsSync(f)) { console.log('  absent, sauté'); return; }
  const source = new Uint8Array(fs.readFileSync(f));
  let t0 = process.hrtime.bigint();
  const comprime = zlib.deflateSync(source, { level: 9 });
  console.log(`  ${mo(source.length)} -> ${mo(comprime.length)} (compressé par zlib en ${arrondi(ms(t0))} ms)`);
  const meilleur = (fonction) => {
    let m = Infinity, r = null;
    const premier = [];
    for (let k = 0; k < 4; k++) {
      const t = process.hrtime.bigint();
      r = fonction();
      const d = ms(t);
      premier.push(d);
      if (k > 0 && d < m) m = d;   // (le premier tour compte à part : le code n'est pas encore optimisé)
    }
    return { premier: premier[0], meilleur: m, r };
  };
  const zl = meilleur(() => zlib.inflateSync(comprime));
  const ici = meilleur(() => inflate(comprime));
  const avecTaille = meilleur(() => inflate(comprime, { taille: source.length }));
  const sansVerif = meilleur(() => inflate(comprime, { taille: source.length, verifier: false }));
  verifier('rendu.json identique (inflate)', memes(ici.r, source));
  verifier('rendu.json identique (inflate, taille connue)', memes(avecTaille.r, source));
  verifier('rendu.json identique (sans vérification)', memes(sansVerif.r, source));
  const ligne = (nom, x) => console.log(`  ${nom.padEnd(38)} 1er appel ${arrondi(x.premier).padStart(6)} ms   suivants (meilleur) ${arrondi(x.meilleur).padStart(6)} ms`);
  ligne('zlib.inflateSync (Node)', zl);
  ligne('inflate', ici);
  ligne('inflate { taille }', avecTaille);
  ligne('inflate { taille, verifier: false }', sansVerif);
  verifier(`rendu.json : premier appel sous 2 s (${arrondi(ici.premier)} ms)`, ici.premier < 2000);
  verifier(`rendu.json { taille } : premier appel sous 2 s (${arrondi(avecTaille.premier)} ms)`, avecTaille.premier < 2000);
  // le même en gzip
  const gz = zlib.gzipSync(source, { level: 9 });
  t0 = process.hrtime.bigint();
  const rg = degonflerGzip(gz, { taille: source.length });
  console.log(`  degonflerGzip { taille } : ${arrondi(ms(t0))} ms`);
  verifier('rendu.json identique (gzip)', memes(rg, source));
}

// ---- 5. les PNG de assets/images/ ---------------------------------------------------------------

function fichiersPng(dossier, sortie) {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) fichiersPng(p, sortie);
    else if (/\.png$/i.test(e.name)) sortie.push(p);
  }
  return sortie;
}

// Le zlib brut d'un PNG (ses IDAT bout à bout), pour comparer avant même decoderPng.
function idats(octets) {
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const parties = [];
  for (let o = 8; o + 8 <= octets.length;) {
    const taille = dv.getUint32(o), type = String.fromCharCode(octets[o + 4], octets[o + 5], octets[o + 6], octets[o + 7]);
    if (type === 'IDAT') parties.push(octets.subarray(o + 8, o + 8 + taille));
    if (type === 'IEND') break;
    o += 12 + taille;
  }
  return new Uint8Array(Buffer.concat(parties));
}

async function pngs() {
  console.log('5. Les PNG de assets/images/ (decoderPng : inflate d\'ici contre zlib.inflateSync)');
  const liste = fichiersPng(path.join(RACINE, 'assets/images'), []);
  let octetsBruts = 0, tIci = 0, tZlib = 0, tCoupe = 0;
  for (const f of liste) {
    const nom = path.relative(RACINE, f).replace(/\\/g, '/');
    const png = new Uint8Array(fs.readFileSync(f));
    const z = idats(png);
    let t = process.hrtime.bigint();
    const ref = zlib.inflateSync(z);
    tZlib += ms(t);
    t = process.hrtime.bigint();
    const moi = inflate(z);
    tIci += ms(t);
    octetsBruts += ref.length;
    verifier(nom + ' (IDAT)', memes(moi, new Uint8Array(ref)));
    const a = await decoderPng(png, (o) => Promise.resolve(zlib.inflateSync(o)));
    const b = await decoderPng(png, (o) => Promise.resolve(inflate(o)));
    verifier(nom + ' (decoderPng)', a.largeur === b.largeur && a.hauteur === b.hauteur && a.transparent === b.transparent && memes(a.indices, b.indices) && memes(a.palette, b.palette));
    // la même chose recompressée au niveau 9 et au niveau 1 : d'autres découpages
    for (const niveau of [1, 9]) {
      const brut = new Uint8Array(ref);
      t = process.hrtime.bigint();
      const r = inflate(zlib.deflateSync(brut, { level: niveau }));
      tCoupe += ms(t);
      verifier(`${nom} (niveau ${niveau})`, memes(r, brut));
    }
  }
  console.log(`  ${liste.length} PNG, ${mo(octetsBruts)} de pixels : inflate ${arrondi(tIci)} ms, zlib ${arrondi(tZlib)} ms (recompressés en niveaux 1 et 9 : ${arrondi(tCoupe)} ms)`);
  verifier('au moins un PNG trouvé', liste.length > 0);
}

// ---- 6. la syntaxe ------------------------------------------------------------------------------

function syntaxe() {
  console.log('6. Syntaxe de moteur/hote/inflate.js : rien au-delà d\'ES2015');
  const source = fs.readFileSync(path.join(RACINE, 'moteur/hote/inflate.js'), 'utf8');
  // sans commentaires ni chaînes (l'analyse est grossière mais suffit à repérer les intrus)
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
  const interdits = [
    ['opérateur **', /\*\*/],
    ['opérateur ??', /\?\?/],
    ['chaînage ?.', /\?\.(?!\d)/],
    ['async/await', /\b(async|await)\b/],
    ['spread ou reste (...)', /\.\.\./],
    ['champ de classe', /\bclass\b/],
    ['séparateur numérique', /\d_\d/],
    ['BigInt', /\b\d+n\b|\bBigInt\b/],
    ['catch sans paramètre', /catch\s*\{/],
    ['Object.entries/values, includes, padStart', /\b(Object\.(entries|values)|\.includes\(|padStart|padEnd|flatMap|\.flat\()/],
    ['ArrayBuffer.transfer, at(), structuredClone', /\.at\(|structuredClone|\.transfer\(/],
    ['DecompressionStream, fetch', /DecompressionStream|\bfetch\b/],
    ['require / import dynamique', /\brequire\(|\bimport\(/],
  ];
  for (const [nom, re] of interdits) verifier('pas de ' + nom, !re.test(code));
  // seules les exportations attendues
  const exports = [...code.matchAll(/^export\s+(?:function|const|let|class)\s+(\w+)/gm)].map((m) => m[1]).sort().join(',');
  verifier('exportations : degonflerGzip, inflate, inflateBrut', exports === 'degonflerGzip,inflate,inflateBrut', exports);
  // "use strict" implicite (module) : pas de with, pas de octal hérité
  verifier('pas de with ni d\'octal hérité', !/\bwith\s*\(|[^\w.]0[0-7]+\b/.test(code));
  // analyse syntaxique complète par Node : le fichier est un module valide
  verifier('module valide (import réussi)', typeof inflate === 'function');
}

console.log(`Node ${process.version}`);
syntheses();
niveaux();
options();
renduJson();
await pngs();
syntaxe();
console.log(echecs ? `\n${echecs} échec(s) sur ${essais} vérifications.` : `\nToutes les vérifications passent (${essais}).`);
process.exit(echecs ? 1 : 0);
