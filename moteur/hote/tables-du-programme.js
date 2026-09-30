// L'image du programme en tables lisibles : ce que le moteur garde de MAIN.EXE (image-programme.js)
// et d'INTRO.EXE (image-intro.js), écrit en zones nommées et typées, dans des fichiers qu'on lit et
// qu'on modifie à la main, et recomposé, octet pour octet, avant le démarrage.
//
// Le code lisible (moteur/jeu/) lit ses tables et ses valeurs de départ aux adresses fixes où
// MAIN.EXE les range. Ces octets ne changent pas de place ; ils changent de forme dans les assets :
//
//   programme/index.json         le manifeste : les blocs de l'image, les structures, et chaque zone
//                                (adresse, taille, type, fichier, nom, lecteurs, description)
//   programme/<module>.json      les valeurs des zones que lit surtout ce module de moteur/jeu :
//                                { "NOM_DE_LA_ZONE": valeur } (un nombre, un tableau, une structure)
//   programme/chaines.txt        les chaînes (type « texte »), une section [nom] par zone
//   programme/intro/...          ce qu'INTRO.EXE pose autrement que MAIN.EXE (l'introduction)
//   ../images/polices/<p>.json   une zone dont le fichier sort de programme/ (« ../ ») est faite par
//                                un autre asset : les polices (moteur/hote/polices.js), dessinées en
//                                planches PNG ; ses octets sont donnés par l'appelant (`externe`)
//
// Les types d'une zone : u8, s8, u16, s16, u32, s32 (entiers, petit-boutistes), ptr (un pointeur :
// une adresse, écrite en hexadécimal, "0xB1234"), bits8 (un octet dessiné : huit « # » ou « . », le
// bit fort à gauche — une ligne d'un caractère de police), suivis au besoin d'un nombre d'éléments (« u16[40] »,
// « ptr[12] ») ; le nom d'une structure du manifeste, seul ou en tableau (« pays[16] »), dont les
// champs ont ces mêmes types, ou « texte[n] » (des caractères, complétés de zéros) ; « texte » :
// des chaînes terminées par un octet nul, dans chaines.txt ; « zeros » : des octets nuls, sans
// fichier. `brut` marque une zone dont le sens n'est pas établi : ses octets tels quels.
//
// Modifier une valeur modifie le jeu. Une zone ne change jamais de taille : le code lit les
// suivantes à leurs adresses. Une chaîne plus courte est complétée de zéros ; une plus longue, un
// tableau d'un autre nombre d'éléments, une valeur hors de son type, sont refusés à la recomposition.

export const VERSION_DES_TABLES = 1;
const TAILLE_SCALAIRE = { u8: 1, s8: 1, u16: 2, s16: 2, u32: 4, s32: 4, ptr: 4, bits8: 1 };
const hex = (v) => '0x' + (v >>> 0).toString(16).toUpperCase();
export const enHex = hex;
export const depuisHex = (v) => (typeof v === 'number' ? v : parseInt(String(v).replace(/^0x/i, ''), 16));
// Une zone faite par un autre asset que les tables : son fichier sort de programme/.
export const estExterne = (fichier) => typeof fichier === 'string' && fichier.startsWith('../');

// --- Les types ---------------------------------------------------------------------------------------
// Un type analysé : { genre: 'scalaire' | 'structure' | 'texte' | 'zeros' | 'chaine', base, nombre
// (null pour un élément seul), taille }.
export function analyserType(type, structures = {}) {
  if (type === 'texte') return { genre: 'texte', taille: null };
  if (type === 'zeros') return { genre: 'zeros', taille: null };
  const m = /^([A-Za-z_][A-Za-z0-9_-]*)(?:\[(\d+)\])?$/.exec(type);
  if (!m) throw new Error(`type illisible : « ${type} »`);
  const [, base, n] = m;
  const nombre = n === undefined ? null : Number(n);
  if (base === 'texte') {
    if (nombre === null) throw new Error('un champ « texte » a une longueur : texte[n]');
    return { genre: 'chaine', base, nombre, taille: nombre };
  }
  if (TAILLE_SCALAIRE[base]) return { genre: 'scalaire', base, nombre, taille: TAILLE_SCALAIRE[base] * (nombre ?? 1) };
  const champs = structures[base];
  if (!champs) throw new Error(`type inconnu : « ${type} »`);
  const tailleUne = champs.reduce((t, [, tc]) => t + analyserType(tc, structures).taille, 0);
  return { genre: 'structure', base, nombre, champs, tailleUne, taille: tailleUne * (nombre ?? 1) };
}

// --- Les chaînes : octets <-> texte ------------------------------------------------------------------
// L'ASCII imprimable tel quel ; la barre oblique inverse doublée ; tout autre octet en \xNN. En tête de
// ligne, « # » et « [ » s'écrivent aussi \xNN (chaines.txt les réserve aux commentaires et aux sections).
export function octetsEnTexte(octets, enTeteDeLigne = true) {
  let s = '';
  for (let k = 0; k < octets.length; k++) {
    const c = octets[k];
    if (c === 0x5C) s += '\\\\';
    else if (c >= 0x20 && c < 0x7F && !(enTeteDeLigne && k === 0 && (c === 0x23 || c === 0x5B))) s += String.fromCharCode(c);
    else s += '\\x' + c.toString(16).toUpperCase().padStart(2, '0');
  }
  return s;
}
export function texteEnOctets(s) {
  const o = [];
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (c === 0x5C) {
      if (s[k + 1] === '\\') { o.push(0x5C); k++; continue; }
      const m = /^x([0-9A-Fa-f]{2})/.exec(s.slice(k + 1, k + 4));
      if (!m) throw new Error(`échappement illisible dans « ${s} »`);
      o.push(parseInt(m[1], 16));
      k += 3;
      continue;
    }
    if (c > 0xFF) throw new Error(`caractère hors de l'octet dans « ${s} » : écrire \\xNN`);
    o.push(c);
  }
  return o;
}

// --- Décoder et encoder une zone ---------------------------------------------------------------------
function lireScalaire(dv, o, base) {
  switch (base) {
    case 'u8': return dv.getUint8(o);
    case 's8': return dv.getInt8(o);
    case 'u16': return dv.getUint16(o, true);
    case 's16': return dv.getInt16(o, true);
    case 'u32': return dv.getUint32(o, true);
    case 's32': return dv.getInt32(o, true);
    case 'ptr': return hex(dv.getUint32(o, true));
    case 'bits8': return dv.getUint8(o).toString(2).padStart(8, '0').replace(/0/g, '.').replace(/1/g, '#');
    default: throw new Error(base);
  }
}
const BORNES = { u8: [0, 0xFF], s8: [-0x80, 0x7F], u16: [0, 0xFFFF], s16: [-0x8000, 0x7FFF],
  u32: [0, 0xFFFFFFFF], s32: [-0x80000000, 0x7FFFFFFF], ptr: [0, 0xFFFFFFFF] };
function ecrireScalaire(dv, o, base, v, ou) {
  if (base === 'bits8') {
    if (typeof v !== 'string' || !/^[#.]{8}$/.test(v)) throw new Error(`${ou} : ${JSON.stringify(v)} n'est pas huit « # » ou « . »`);
    let n = 0;
    for (const c of v) n = (n << 1) | (c === '#' ? 1 : 0);
    dv.setUint8(o, n);
    return;
  }
  const n = base === 'ptr' ? depuisHex(v) : v;
  const [bas, haut] = BORNES[base];
  if (typeof n !== 'number' || !Number.isInteger(n) || n < bas || n > haut) throw new Error(`${ou} : ${JSON.stringify(v)} n'est pas un ${base}`);
  switch (base) {
    case 'u8': case 's8': dv.setUint8(o, n & 0xFF); break;
    case 'u16': case 's16': dv.setUint16(o, n & 0xFFFF, true); break;
    default: dv.setUint32(o, n >>> 0, true);
  }
}

// Une chaîne de longueur fixe (texte[n]) : ses caractères jusqu'au premier zéro ; le reste doit être
// nul (sinon elle n'est pas représentable ainsi : le décodage échoue).
function lireChaineFixe(octets, o, n) {
  let fin = o;
  while (fin < o + n && octets[fin] !== 0) fin++;
  for (let k = fin; k < o + n; k++) if (octets[k] !== 0) throw new Error('octets après la fin de la chaîne');
  return octetsEnTexte(octets.subarray(o, fin), false);
}

// La valeur d'une zone, depuis ses octets. Lève une erreur si le type ne peut les représenter.
export function decoderZone(octets, type, structures = {}) {
  const t = analyserType(type, structures);
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  if (t.genre === 'zeros') {
    if (octets.some((v) => v !== 0)) throw new Error('zone « zeros » non nulle');
    return null;
  }
  if (t.genre === 'texte') {
    if (octets.length === 0 || octets[octets.length - 1] !== 0) throw new Error('chaînes non terminées par un zéro');
    const lignes = [];
    let debut = 0;
    for (let k = 0; k < octets.length; k++) if (octets[k] === 0) { lignes.push(octets.subarray(debut, k)); debut = k + 1; }
    while (lignes.length && lignes[lignes.length - 1].length === 0) lignes.pop();   // les zéros de la fin
    return lignes.map((l) => octetsEnTexte(l));
  }
  if (t.taille !== octets.length) throw new Error(`type ${type} de ${t.taille} octets pour une zone de ${octets.length}`);
  const un = (o, genre = t) => {
    if (genre.genre === 'scalaire') return lireScalaire(dv, o, genre.base);
    if (genre.genre === 'chaine') return lireChaineFixe(octets, o, genre.nombre);
    const obj = {};
    let p = o;
    for (const [nom, tc] of genre.champs) {
      const tt = analyserType(tc, structures);
      obj[nom] = tt.nombre === null || tt.genre === 'chaine' ? un(p, tt) : Array.from({ length: tt.nombre }, (_, k) => un(p + k * (tt.taille / tt.nombre), { ...tt, nombre: null }));
      p += tt.taille;
    }
    return obj;
  };
  if (t.genre === 'chaine') return un(0, t);
  if (t.nombre === null) return un(0, t);
  const pas = t.genre === 'structure' ? t.tailleUne : TAILLE_SCALAIRE[t.base];
  return Array.from({ length: t.nombre }, (_, k) => un(k * pas, { ...t, nombre: null }));
}

// Les octets d'une zone de `taille` octets, depuis sa valeur. `ou` nomme la zone dans les erreurs.
export function encoderZone(valeur, type, taille, structures = {}, ou = type) {
  const t = analyserType(type, structures);
  const octets = new Uint8Array(taille);
  if (t.genre === 'zeros') return octets;
  if (t.genre === 'texte') {
    if (!Array.isArray(valeur)) throw new Error(`${ou} : des chaînes sont attendues`);
    let p = 0;
    for (const ligne of valeur) {
      const o = texteEnOctets(ligne);
      if (o.includes(0)) throw new Error(`${ou} : un octet nul dans « ${ligne} » (une chaîne par ligne)`);
      if (p + o.length + 1 > taille) throw new Error(`${ou} : ${taille} octets au plus (les chaînes ne peuvent s'allonger)`);
      octets.set(o, p);
      p += o.length + 1;
    }
    return octets;
  }
  if (t.taille !== taille) throw new Error(`${ou} : le type ${type} fait ${t.taille} octets, la zone ${taille}`);
  const dv = new DataView(octets.buffer);
  const un = (o, genre, v, ici) => {
    if (genre.genre === 'scalaire') return ecrireScalaire(dv, o, genre.base, v, ici);
    if (genre.genre === 'chaine') {
      if (typeof v !== 'string') throw new Error(`${ici} : une chaîne est attendue`);
      const b = texteEnOctets(v);
      if (b.length > genre.nombre) throw new Error(`${ici} : ${genre.nombre} caractères au plus`);
      octets.set(b, o);
      return;
    }
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${ici} : une structure ${genre.base} est attendue`);
    let p = o;
    for (const [nom, tc] of genre.champs) {
      if (!(nom in v)) throw new Error(`${ici} : le champ ${nom} manque`);
      const tt = analyserType(tc, structures);
      if (tt.nombre === null || tt.genre === 'chaine') un(p, tt, v[nom], `${ici}.${nom}`);
      else {
        if (!Array.isArray(v[nom]) || v[nom].length !== tt.nombre) throw new Error(`${ici}.${nom} : ${tt.nombre} valeurs sont attendues`);
        const pas = tt.taille / tt.nombre;
        v[nom].forEach((x, k) => un(p + k * pas, { ...tt, nombre: null }, x, `${ici}.${nom}[${k}]`));
      }
      p += tt.taille;
    }
  };
  if (t.nombre === null || t.genre === 'chaine') un(0, t, valeur, ou);
  else {
    if (!Array.isArray(valeur) || valeur.length !== t.nombre) throw new Error(`${ou} : ${t.nombre} éléments sont attendus`);
    const pas = t.genre === 'structure' ? t.tailleUne : TAILLE_SCALAIRE[t.base];
    valeur.forEach((x, k) => un(k * pas, { ...t, nombre: null }, x, `${ou}[${k}]`));
  }
  return octets;
}

// Le type représente-t-il exactement ces octets ?
export function represente(octets, type, structures = {}) {
  try {
    const v = decoderZone(octets, type, structures);
    const refaits = encoderZone(v, type, octets.length, structures);
    return refaits.every((x, k) => x === octets[k]);
  } catch {
    return false;
  }
}

// --- L'écriture des fichiers -------------------------------------------------------------------------
// Du JSON qu'on lit : une clé par ligne ; les tableaux de nombres par lignes de 16 (8 pour les
// pointeurs), ceux de structures une structure par ligne.
function compact(v) { return JSON.stringify(v); }
function enJsonLisible(v, retrait = '  ') {
  const s = compact(v);
  // (les lignes d'un caractère de police, l'une sous l'autre : on y voit le dessin)
  if (Array.isArray(v) && v.length > 1 && v.every((x) => typeof x === 'string' && /^[#.]{8}$/.test(x))) {
    return '[\n' + v.map((x) => retrait + '  ' + compact(x)).join(',\n') + '\n' + retrait + ']';
  }
  if (s.length <= 96 || !(Array.isArray(v) || (v && typeof v === 'object'))) return s;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== 'object' || x === null)) {
      const parLigne = v.some((x) => typeof x === 'string') ? 8 : 16;
      const lignes = [];
      for (let k = 0; k < v.length; k += parLigne) lignes.push(retrait + '  ' + v.slice(k, k + parLigne).map(compact).join(', '));
      return '[\n' + lignes.join(',\n') + '\n' + retrait + ']';
    }
    return '[\n' + v.map((x) => retrait + '  ' + enJsonLisible(x, retrait + '  ')).join(',\n') + '\n' + retrait + ']';
  }
  return '{\n' + Object.entries(v).map(([k, x]) => `${retrait}  ${compact(k)}: ${enJsonLisible(x, retrait + '  ')}`).join(',\n') + '\n' + retrait + '}';
}
function fichierJson(zones) {
  return '{\n' + zones.map(([nom, v]) => `  ${compact(nom)}: ${enJsonLisible(v, '  ')}`).join(',\n') + '\n}\n';
}
const ENTETE_DES_CHAINES = [
  "# Les chaînes de l'image du programme. Une section [nom] par zone (le manifeste, index.json, en dit",
  "# l'adresse et la taille), puis une ligne par chaîne, que le programme termine par un octet nul ;",
  '# une ligne vide est une chaîne vide. \\xNN : un octet hors de l\'ASCII imprimable ; \\\\ : la barre',
  '# oblique inverse. Une chaîne peut raccourcir (la zone est complétée de zéros), pas s\'allonger.',
];
function fichierDesChaines(zones) {
  const lignes = [...ENTETE_DES_CHAINES];
  for (const [nom, v] of zones) lignes.push(`[${nom}]`, ...v);
  return lignes.join('\n') + '\n';
}
function lireLesChaines(texte) {
  const sections = new Map();
  let courante = null;
  const lignes = texte.replace(/\r\n/g, '\n').split('\n');
  if (lignes[lignes.length - 1] === '') lignes.pop();
  for (const l of lignes) {
    if (l.startsWith('#')) continue;
    const m = /^\[(.+)\]$/.exec(l);
    if (m) { courante = []; sections.set(m[1], courante); continue; }
    if (!courante) throw new Error(`chaines : « ${l} » avant la première section`);
    courante.push(l);
  }
  return sections;
}

// La description d'une zone dans le manifeste (adresses en hexadécimal).
function entreeDuManifeste(z) {
  const e = { adresse: hex(z.adresse), taille: z.taille, type: z.type, nom: z.nom };
  if (z.fichier) e.fichier = z.fichier;
  if (z.brut) e.brut = true;
  if (z.lecteurs && z.lecteurs.length) e.lecteurs = z.lecteurs;
  if (z.description) e.description = z.description;
  return e;
}

// Écrire des zones : `m8` la mémoire où les lire ; rend { zones (le type retenu : celui de la carte,
// ou, s'il ne représente pas les octets, u8[n] brut), fichiers: Map(chemin relatif -> texte) }.
// `prefixe` : le dossier des fichiers (« intro/ » pour l'introduction).
function ecrireDesZones(m8, zones, structures, prefixe = '') {
  const parFichier = new Map();
  const retenues = [];
  for (const z0 of zones) {
    // (une zone faite par un autre asset, les polices : rien à écrire ici ; dans l'introduction, si
    // elle y était autre, elle serait écrite comme les autres, dans intro/polices.json)
    if (estExterne(z0.fichier) && !prefixe) { retenues.push({ ...z0 }); continue; }
    const octets = m8.subarray(z0.adresse, z0.adresse + z0.taille);
    let z = { ...z0 };
    if (estExterne(z.fichier)) z.fichier = 'polices.json';
    if (!represente(octets, z.type, structures)) {
      z = { ...z, type: octets.every((v) => v === 0) ? 'zeros' : `u8[${z.taille}]`, brut: !octets.every((v) => v === 0) };
      if (z.type === 'zeros') delete z.brut;
    }
    if (z.type === 'zeros') { delete z.fichier; retenues.push(z); continue; }
    if (z.type === 'texte') z.fichier = 'chaines.txt';
    else if (!z.fichier || z.fichier === 'chaines.txt') z.fichier = 'sans-lecteur.json';
    z.fichier = prefixe + z.fichier;
    if (!parFichier.has(z.fichier)) parFichier.set(z.fichier, []);
    parFichier.get(z.fichier).push([z.nom, decoderZone(octets, z.type, structures)]);
    retenues.push(z);
  }
  const fichiers = new Map();
  for (const [f, liste] of parFichier) fichiers.set(f, /\.txt$/.test(f) ? fichierDesChaines(liste) : fichierJson(liste));
  return { zones: retenues, fichiers };
}

const memoireDe = (image) => {
  const m8 = new Uint8Array(0x100000);
  for (const b of image.blocs) m8.set(b.octets, b.adresse);
  return m8;
};

// Vérifier qu'une liste de zones couvre chaque octet des blocs, une fois et une seule.
function verifierLaCouverture(zones, blocs, quoi) {
  const tri = [...zones].sort((a, b) => a.adresse - b.adresse);
  for (let k = 1; k < tri.length; k++) {
    if (tri[k].adresse < tri[k - 1].adresse + tri[k - 1].taille) throw new Error(`${quoi} : ${tri[k - 1].nom} et ${tri[k].nom} se chevauchent`);
  }
  for (const [a, n] of blocs) {
    let p = a;
    for (const z of tri) {
      if (z.adresse + z.taille <= p || z.adresse >= a + n) continue;
      if (z.adresse > p) throw new Error(`${quoi} : 0x${p.toString(16)} à 0x${z.adresse.toString(16)} hors de toute zone`);
      p = z.adresse + z.taille;
    }
    if (p < a + n) throw new Error(`${quoi} : 0x${p.toString(16)} à 0x${(a + n).toString(16)} hors de toute zone`);
  }
}

// Les tables de l'image du programme (`image` : extraireLImage) selon la carte (carte-du-programme.js :
// { STRUCTURES, ZONES }), et, s'il y en a une, celles de l'introduction (`imageIntro` :
// extraireLImageDeLIntro ; carte.ZONES_DE_L_INTRO couvre ce qu'elle pose hors des zones du programme).
// Rend { manifeste (l'objet de programme/index.json), fichiers: Map(chemin dans programme/ -> texte) }.
export function ecrireLesTables(image, carte, imageIntro = null) {
  const { STRUCTURES: structures } = carte;
  const blocs = image.blocs.map((b) => [b.adresse, b.octets.length]);
  verifierLaCouverture(carte.ZONES, blocs, 'la carte du programme');
  const m8 = memoireDe(image);
  const programme = ecrireDesZones(m8, carte.ZONES, structures);
  const fichiers = new Map(programme.fichiers);
  const manifeste = {
    version: VERSION_DES_TABLES,
    programme: { source: image.source, pointEntree: hex(image.pointEntree), pileInitiale: hex(image.pileInitiale),
      blocs: blocs.map(([a, n]) => [hex(a), n]), zones: programme.zones.map(entreeDuManifeste) },
    introduction: null,
    structures,
  };
  if (imageIntro) {
    // L'introduction part de la mémoire du programme : seules les zones qu'elle pose autrement sont
    // écrites (avec le type de celles du programme), et celles de ses propres données.
    const mi = memoireDe(imageIntro);
    const differe = (z) => { for (let a = z.adresse; a < z.adresse + z.taille; a++) if (mi[a] !== m8[a]) return true; return false; };
    const zones = [...carte.ZONES.filter(differe), ...carte.ZONES_DE_L_INTRO];
    const intro = ecrireDesZones(mi, zones, structures, 'intro/');
    for (const [f, t] of intro.fichiers) fichiers.set(f, t);
    manifeste.introduction = { source: imageIntro.source, pointEntree: hex(imageIntro.pointEntree), pileInitiale: hex(imageIntro.pileInitiale),
      base: 'programme', blocs: imageIntro.blocs.map((b) => [hex(b.adresse), b.octets.length]), zones: intro.zones.map(entreeDuManifeste) };
  }
  return { manifeste, fichiers };
}

// Le manifeste en JSON : une zone par ligne.
export function manifesteEnJson(manifeste) {
  const partie = (p) => {
    if (!p) return 'null';
    const lignes = Object.entries(p).filter(([k]) => k !== 'zones' && k !== 'blocs').map(([k, v]) => `    ${compact(k)}: ${compact(v)}`);
    lignes.push(`    "blocs": [\n${p.blocs.map((b) => '      ' + compact(b)).join(',\n')}\n    ]`);
    lignes.push(`    "zones": [\n${p.zones.map((z) => '      ' + compact(z)).join(',\n')}\n    ]`);
    return '{\n' + lignes.join(',\n') + '\n  }';
  };
  const structures = Object.entries(manifeste.structures || {}).map(([k, v]) => `    ${compact(k)}: ${compact(v)}`).join(',\n');
  return `{\n  "version": ${manifeste.version},\n  "programme": ${partie(manifeste.programme)},\n  "introduction": ${partie(manifeste.introduction)},\n`
    + `  "structures": {\n${structures}\n  }\n}\n`;
}

// --- La recomposition --------------------------------------------------------------------------------
// L'image (au format de lireLImage : { pointEntree, pileInitiale, source, blocs }) du programme
// (`partie` : 'programme') ou de l'introduction ('introduction'), depuis le manifeste et ses
// fichiers ; lireTexte(chemin dans programme/) rend une promesse du texte d'un fichier ;
// externe(fichier, zone) celle des octets d'une zone faite par un autre asset (estExterne : les
// polices), `fichier` tel que l'écrit le manifeste (« ../images/polices/petite.json »).
export async function composerLImage(manifeste, partie, lireTexte, externe = null) {
  if (manifeste.version !== VERSION_DES_TABLES) throw new Error(`tables du programme d'une autre version (${manifeste.version})`);
  const structures = manifeste.structures || {};
  const lus = new Map();
  const lire = (f) => {
    if (!lus.has(f)) lus.set(f, Promise.resolve(lireTexte(f)).then((t) => (/\.txt$/.test(f) ? lireLesChaines(t) : new Map(Object.entries(JSON.parse(t))))));
    return lus.get(f);
  };
  const m8 = new Uint8Array(0x100000);
  const poser = async (p, quoi) => {
    const blocs = p.blocs.map(([a, n]) => [depuisHex(a), n]);
    const zones = p.zones.map((z) => ({ ...z, adresse: depuisHex(z.adresse) }));
    if (!p.base) verifierLaCouverture(zones, blocs, quoi);
    for (const z of zones) {
      if (z.type === 'zeros') { m8.fill(0, z.adresse, z.adresse + z.taille); continue; }
      if (estExterne(z.fichier)) {
        if (!externe) throw new Error(`${quoi} : la zone ${z.nom} est faite par ${z.fichier}, que rien ne donne`);
        const octets = await externe(z.fichier, z);
        if (!octets || octets.length !== z.taille) throw new Error(`${quoi} : ${z.fichier} ne donne pas les ${z.taille} octets de ${z.nom}`);
        m8.set(octets, z.adresse);
        continue;
      }
      const valeurs = await lire(z.fichier);
      if (!valeurs.has(z.nom)) throw new Error(`${quoi} : la zone ${z.nom} manque dans ${z.fichier}`);
      m8.set(encoderZone(valeurs.get(z.nom), z.type, z.taille, structures, `${z.fichier}, ${z.nom}`), z.adresse);
    }
    return blocs;
  };
  const p = manifeste[partie];
  if (!p) throw new Error(`pas de ${partie} dans les tables du programme`);
  if (p.base) await poser(manifeste[p.base], p.base);
  const blocs = await poser(p, partie);
  return { pointEntree: depuisHex(p.pointEntree), pileInitiale: depuisHex(p.pileInitiale), source: p.source,
    blocs: blocs.map(([a, n]) => ({ adresse: a, octets: m8.slice(a, a + n) })) };
}
