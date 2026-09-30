// Les polices du jeu, en planches PNG qu'on redessine : un glyphe par code de caractère, rangé dans
// une grille de 16 colonnes (le code 0x41, « A », est en colonne 1 de la rangée 4), et une table JSON
// qui dit, pour chaque code, où est son glyphe, sa largeur, sa chasse. Le programme et la banque
// d'images de la police se refont de ces planches, octet pour octet tant qu'on n'y touche pas
// (moteur/node/extraire-jeu.mjs le vérifie) : un glyphe redessiné se voit dans le jeu.
//
// Le jeu écrit avec trois polices, et en garde deux autres qu'il ne montre jamais :
//
//   petite       la petite police, 3 x 6 points, 4 de chasse, dessinée à la main dans le programme
//                (0xBA2FC, six octets par signe, de l'espace 0x20 à 0xCC) : la barre des messages,
//                les enseignes des kiosques, les jauges, les nombres des écrans (moteur/jeu/
//                dessin-objets.js, 0x80E88 et 0x80F34). Les codes 0x80 à 0xCC y suivent la page 437
//                du DOS (ü 0x81, ä 0x84, Ä 0x8E, ö 0x94, Ö 0x99, Ü 0x9A, Ñ 0xA5) ; les autres de ces
//                codes n'ont qu'un dessin de bouche-trou ;
//   interface    la police des fenêtres, des menus et de l'écran titre : des images de la banque
//                MFONT-0 (5 points de haut), la table 0xB51C1 du programme donnant l'image de chaque
//                code (moteur/jeu/fenetres.js, 0x3F49E) ; les minuscules y sont renvoyées sur les
//                majuscules ;
//   titres       la grande police des titres des écrans de gestion : d'autres images de MFONT-0
//                (17 points de haut), par la table 0xB50C1 (moteur/jeu/amorcage.js, 0x3F7BD) ;
//   watcom-8x8   deux polices de la bibliothèque graphique de Watcom, liées au programme mais lues
//   watcom-8x14  seulement par du code hors d'usage (0xCACE8 et sa table des chasses 0xCB4E8,
//                0xCB988) : elles ne se voient jamais.
//
// LES PLANCHES. Une case par code, 16 par rangée, séparées par un trait d'un point (couleur de
// grille, ignorée à la lecture). Le coin haut-gauche du glyphe du code c est en
//   x = 1 + (c % 16) × (largeur de case + 1),  y = 1 + ⌊c / 16⌋ × (hauteur de case + 1)
// (la table le redit pour chaque code). Les polices d'un seul trait (petite, watcom) : un point
// opaque et sombre est encré, tout autre point (transparent, ou clair si l'éditeur a aplati la
// transparence) est vide ; les cases grisées en entier sont des codes que la police n'a pas. Les
// polices de MFONT-0 : chaque point est un indice de couleur de la palette du jeu (MPALETTE), 255 la
// transparence — comme les banques d'images (une planche réenregistrée en couleurs y est ramenée).
//
// LES TABLES (<police>.json). `glyphes` : pour chaque code que la police dessine, { code, signe (le
// caractère de la page 437 à ce code), x, y, largeur, hauteur, chasse }. Ce qui fait foi :
//  - petite, watcom : le dessin seul, à la taille fixe de la police (la chasse est celle du jeu,
//    donnée pour mémoire ; celle de watcom-8x8, avec son `decalage`, est une donnée du programme) ;
//  - interface, titres : le dessin, `largeur` et `hauteur` (le glyphe est le coin de la case de
//    cette taille : un point dessiné au-delà est ignoré, et signalé), et `image`, son numéro dans
//    MFONT-0. Plusieurs codes d'une police montrent la même image (« a » celle de « A ») : le premier
//    a la case dessinée, les autres ont `comme` (« 0x41 ») et une case vide, et suivent son glyphe —
//    redessiner « A » change aussi « a » ; dessiner dans la case vide de « a » lui donne un glyphe à
//    lui. Entre les deux polices, les cases qui montrent une même image (les titres empruntent
//    quelques petits signes à l'interface) sont dessinées chacune ; tant qu'elles sont identiques,
//    elles restent une seule image ; une case redessinée à part devient une image à elle, ajoutée au
//    bout de la banque. Une case vide d'un
//    code absent de la table, qu'on dessine, devient un glyphe nouveau (sa taille : le dessin, depuis
//    le coin de la case ; ou `largeur` et `hauteur` si on ajoute le code à la table sans `image`).
//    La chasse (largeur + 1 pour l'interface, largeur − 1 pour les titres, qui se chevauchent) est
//    celle que le jeu calcule, donnée pour mémoire. `sansCode` : les images de MFONT-0 qu'aucun code
//    n'emploie (six grandes lettres), gardées pour que la banque se refasse à l'identique.
//
// Le manifeste, images/polices/index.json, dit les fichiers de chaque police et la forme de MFONT-0
// (ce qui, dans son .DAT, n'est pas une image) ; le manifeste du programme (programme/index.json)
// désigne ces tables pour les zones qu'elles font (« ../images/polices/<police>.json »).

import { encoderPng, decoderPng, ramenerALaPalette } from './png.js';
import { lireTableDImages, ecrireTableDImages, decoderImage, encoderImage, signeDe437 } from './formats-du-cd.js';

export const MANIFESTE_DES_POLICES = 'images/polices/index.json';
const DOSSIER = 'images/polices/';
const PALETTE_DU_JEU = 'images/palettes/MPALETTE.png';
const TRANSPARENT = 255;
const GRILLE = 1;          // l'indice des traits de la grille dans les planches d'un seul trait
const ENCRE = 0;           // et celui de l'encre
const hex2 = (v) => '0x' + v.toString(16).toUpperCase().padStart(2, '0');
const hex = (v) => '0x' + v.toString(16).toUpperCase();
const depuisHex = (v) => (typeof v === 'number' ? v : parseInt(String(v).replace(/^0x/i, ''), 16));

// Les polices : leur genre, leur place dans le programme, leur case.
//   rangees : 3 points de large, un octet par rangée, qui choisit l'une des huit façons d'écrire
//             trois points (dessin-objets.js : table 0x80EE0) ; l'octet vaut 2 × forme, la forme
//             allant de 0 (..#) à 6 (###), 7 étant la rangée vide ;
//   bits    : un octet par rangée, le bit fort à gauche ;
//   banque  : des images de MFONT-0, par une table de 256 octets (code -> numéro d'image).
export const POLICES = {
  petite: {
    genre: 'rangees', largeur: 3, hauteur: 6, chasse: 4, premier: 0x20, dernier: 0xCC, adresse: 0xBA2FC, taille: 1040,
    cellule: { largeur: 3, hauteur: 6 },
    description: 'la petite police, 3 x 6 points, 4 de chasse (barre des messages, enseignes des kiosques, jauges, nombres des écrans) : '
      + 'dessinée dans le programme (0xBA2FC), de 0x20 à 0xCC ; les codes 0x80 à 0xCC suivent la page 437 (ü ä Ä ö Ö Ü Ñ), '
      + 'les autres n\'y ont qu\'un bouche-trou',
  },
  interface: {
    genre: 'banque', banque: 'MFONT-0', table: 0xB51C1, espacement: 1, espace: 4, cellule: { largeur: 8, hauteur: 8 },
    description: "la police des fenêtres, des menus et de l'écran titre : des images de MFONT-0, la table 0xB51C1 du programme "
      + "donnant l'image de chaque code (0 : aucune) ; un signe avance de sa largeur + 1, l'espace de 4 (en points de 320x200)",
  },
  titres: {
    genre: 'banque', banque: 'MFONT-0', table: 0xB50C1, espacement: -1, espace: 8, cellule: { largeur: 18, hauteur: 19 },
    description: 'la grande police des titres des écrans de gestion : des images de MFONT-0, par la table 0xB50C1 du programme ; '
      + "les signes se chevauchent d'un point (largeur − 1), l'espace avance de 8 (en points de 320x200)",
  },
  'watcom-8x8': {
    genre: 'bits', largeur: 8, hauteur: 8, premier: 0, dernier: 0xFF, adresse: 0xCACE8, chasses: 0xCB4E8,
    cellule: { largeur: 8, hauteur: 8 },
    description: 'une police de 8x8 points de la bibliothèque graphique de Watcom (0xCACE8), et sa table des chasses (0xCB4E8) : '
      + 'seul du code hors d\'usage la lit, le jeu ne la montre jamais',
  },
  'watcom-8x14': {
    genre: 'bits', largeur: 8, hauteur: 14, premier: 0, dernier: 0xFF, adresse: 0xCB988,
    cellule: { largeur: 8, hauteur: 14 },
    description: 'une police de 8x14 points de la bibliothèque graphique de Watcom (0xCB988) : seul du code hors d\'usage la lit',
  },
};
// Les banques d'images qui ne portent que des polices : l'extraction ne les écrit pas dans
// images/banques/, et la recomposition les refait des planches des polices.
export const BANQUES_DES_POLICES = { 'MFONT-0': ['interface', 'titres'] };

// --- La grille --------------------------------------------------------------------------------------
function grille(cellule, rangees) {
  const pasX = cellule.largeur + 1, pasY = cellule.hauteur + 1;
  return {
    largeur: 1 + 16 * pasX, hauteur: 1 + rangees * pasY,
    place: (k) => [1 + (k % 16) * pasX, 1 + Math.floor(k / 16) * pasY],
  };
}
// Une planche vide : les traits de la grille, les cases transparentes (grisées en entier si `grisee`).
function plancheVide(g, rangees, couleurDeGrille, grisee = () => false) {
  const indices = new Uint8Array(g.largeur * g.hauteur).fill(couleurDeGrille);
  for (let k = 0; k < 16 * rangees; k++) {
    if (grisee(k)) continue;
    const [x0, y0] = g.place(k);
    for (let y = 0; y < g.hauteurCase; y++) indices.fill(TRANSPARENT, (y0 + y) * g.largeur + x0, (y0 + y) * g.largeur + x0 + g.largeurCase);
  }
  return indices;
}
const signe = (code) => (code >= 0x20 && code !== 0x7F ? signeDe437(code) : undefined);

// La palette des planches d'un seul trait : l'encre noire, la grille grise ; 255, la transparence.
const PALETTE_D_UN_TRAIT = (() => {
  const p = new Uint8Array(768);
  p.set([32, 32, 32], 3 * GRILLE);
  p.set([63, 0, 63], 3 * TRANSPARENT);
  return p;
})();

// --- Du JSON qu'on lit : un glyphe par ligne -----------------------------------------------------------
function enJson(objet) {
  const lignes = [];
  for (const [cle, v] of Object.entries(objet)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      lignes.push(`  ${JSON.stringify(cle)}: [\n${v.map((x) => '    ' + JSON.stringify(x)).join(',\n')}\n  ]`);
    } else lignes.push(`  ${JSON.stringify(cle)}: ${JSON.stringify(v)}`);
  }
  return '{\n' + lignes.join(',\n') + '\n}\n';
}

// =====================================================================================================
// L'EXTRACTION
// =====================================================================================================
// `m8` : la mémoire du programme (0x100000 octets, l'image de MAIN.EXE posée) ; `banques` : { 'MFONT-0':
// { tab, dat } } (les fichiers du CD) ; `palette` : MPALETTE (768 octets de 6 bits) ; `deflate` : le zlib
// des PNG. Rend { manifeste (l'objet de images/polices/index.json), fichiers: Map(chemin dans les assets
// -> octets ou texte) }.
export async function extraireLesPolices(m8, banques, palette, deflate) {
  const fichiers = new Map();
  const manifeste = {
    version: 1,
    description: 'Les polices du jeu, en planches PNG (un glyphe par code, 16 par rangée) et en tables JSON : '
      + 'voir moteur/hote/polices.js, et le README (« Modder le jeu »). Le programme et MFONT-0 se refont de ces fichiers.',
    palette: PALETTE_DU_JEU,
    polices: {},
    banques: {},
  };
  const ecrire = async (nom, table, planche) => {
    fichiers.set(`${DOSSIER}${nom}.json`, enJson(table));
    fichiers.set(`${DOSSIER}${nom}.png`, await encoderPng(planche, deflate));
    manifeste.polices[nom] = { planche: `${DOSSIER}${nom}.png`, table: `${DOSSIER}${nom}.json` };
  };

  // Les polices d'un seul trait, tirées du programme.
  for (const [nom, p] of Object.entries(POLICES)) {
    if (p.genre === 'banque') continue;
    const g = { ...grille(p.cellule, 16), largeurCase: p.cellule.largeur, hauteurCase: p.cellule.hauteur };
    const dedans = (k) => k >= p.premier && k <= p.dernier;
    const indices = plancheVide(g, 16, GRILLE, (k) => !dedans(k));
    const glyphes = [];
    for (let code = p.premier; code <= p.dernier; code++) {
      const [x0, y0] = g.place(code);
      const debut = p.genre === 'rangees' ? p.adresse + p.hauteur * (code - p.premier) : p.adresse + p.hauteur * code;
      for (let r = 0; r < p.hauteur; r++) {
        const o = m8[debut + r];
        let bits;
        if (p.genre === 'rangees') {
          if (o & 1 || o > 14) throw new Error(`police ${nom} : l'octet ${o} du code ${hex2(code)} n'est pas une rangée`);
          bits = ((o >> 1) + 1) & 7;                         // forme 0..6 -> ..# à ###, 7 -> vide
        } else bits = o;
        for (let i = 0; i < p.largeur; i++) if ((bits >> (p.largeur - 1 - i)) & 1) indices[(y0 + r) * g.largeur + x0 + i] = ENCRE;
      }
      const e = { code: hex2(code), signe: signe(code), x: x0, y: y0 };
      if (p.chasses !== undefined) {
        e.chasse = m8[p.chasses + 4 * code] | (m8[p.chasses + 4 * code + 1] << 8);
        e.decalage = m8[p.chasses + 4 * code + 2] | (m8[p.chasses + 4 * code + 3] << 8);
      } else e.chasse = p.chasse || p.largeur;
      glyphes.push(e);
    }
    const table = { police: nom, description: p.description, genre: p.genre, largeur: p.largeur, hauteur: p.hauteur,
      grille: { colonnes: 16, cellule: p.cellule, trait: 1 } };
    if (p.genre === 'rangees') {
      // ce qui reste de la zone du programme après le dernier glyphe (le début du suivant, hors police)
      const fin = p.adresse + p.hauteur * (p.dernier - p.premier + 1);
      table.octetsSuivants = [...m8.subarray(fin, p.adresse + p.taille)];
    }
    table.glyphes = glyphes;
    await ecrire(nom, table, { largeur: g.largeur, hauteur: g.hauteur, indices, palette: PALETTE_D_UN_TRAIT, transparent: TRANSPARENT });
  }

  // Les polices de MFONT-0 : ses images, et les tables du programme qui y renvoient.
  for (const [banque, noms] of Object.entries(BANQUES_DES_POLICES)) {
    const b = banques[banque];
    if (!b) throw new Error(`police : la banque ${banque} manque`);
    const entrees = lireTableDImages(b.tab);
    const images = entrees.map((e) => (e.largeur && e.hauteur ? decoderImage(b.dat, e.position, e.largeur, e.hauteur) : null));
    const pleines = entrees.map((e, k) => k).filter((k) => images[k]);
    // La forme que la recomposition suppose : les images dans l'ordre de leurs numéros, un même
    // séparateur entre deux, une queue ; un en-tête avant la première.
    for (let i = 1; i < pleines.length; i++) if (entrees[pleines[i]].position <= entrees[pleines[i - 1]].position) throw new Error(`${banque} : images dans le désordre`);
    const entete = [...b.dat.subarray(0, entrees[pleines[0]].position)];
    const ecarts = pleines.slice(1).map((k, i) => [...b.dat.subarray(images[pleines[i]].fin, entrees[k].position)]);
    const separateur = ecarts[0] || [];
    if (ecarts.some((e) => e.length !== separateur.length || e.some((v, i) => v !== separateur[i]))) throw new Error(`${banque} : séparateurs inégaux`);
    const queue = [...b.dat.subarray(images[pleines[pleines.length - 1]].fin)];
    const vides = entrees.map((e, k) => [k, e]).filter(([k]) => !images[k]).map(([k, e]) => [k, e.position, e.largeur, e.hauteur]);
    manifeste.banques[banque] = { polices: noms, images: entrees.length, entete, separateur, queue, vides };

    const employees = new Set();
    for (const nom of noms) for (let c = 0; c < 256; c++) if (m8[POLICES[nom].table + c]) employees.add(m8[POLICES[nom].table + c]);
    const sansCode = pleines.filter((k) => !employees.has(k));
    for (const [n, nom] of noms.entries()) {
      const p = POLICES[nom];
      const derniere = n === noms.length - 1;
      const rangees = 16 + (derniere ? Math.ceil(sansCode.length / 16) : 0);
      const g = { ...grille(p.cellule, rangees), largeurCase: p.cellule.largeur, hauteurCase: p.cellule.hauteur };
      const indices = plancheVide(g, rangees, indiceDeGrille(palette), (k) => k >= 256 + (derniere ? sansCode.length : 0));
      const poser = (k, image) => {
        const e = entrees[image], im = images[image];
        if (e.largeur > p.cellule.largeur || e.hauteur > p.cellule.hauteur) throw new Error(`police ${nom} : l'image ${image} (${e.largeur}x${e.hauteur}) déborde de sa case`);
        const [x0, y0] = g.place(k);
        for (let y = 0; y < e.hauteur; y++) for (let x = 0; x < e.largeur; x++) {
          if (im.opaque[y * e.largeur + x]) indices[(y0 + y) * g.largeur + x0 + x] = im.indices[y * e.largeur + x];
        }
        return [x0, y0, e.largeur, e.hauteur];
      };
      const glyphes = [];
      const premier = new Map();          // image -> le premier code de la police qui la montre
      for (let code = 0; code < 256; code++) {
        const image = m8[p.table + code];
        if (!image) continue;
        if (!images[image]) throw new Error(`police ${nom} : le code ${hex2(code)} renvoie à l'image vide ${image}`);
        // (un code qui montre la même image qu'un code d'avant, « a » celle de « A » : sa case reste
        // vide, et il la suit ; dessinée, elle en ferait un glyphe à lui)
        if (premier.has(image)) {
          glyphes.push({ code: hex2(code), signe: signe(code), comme: hex2(premier.get(image)), image });
          continue;
        }
        premier.set(image, code);
        const [x, y, largeur, hauteur] = poser(code, image);
        glyphes.push({ code: hex2(code), signe: signe(code), image, x, y, largeur, hauteur, chasse: largeur + p.espacement });
      }
      const table = { police: nom, description: p.description, genre: 'banque', banque, programme: hex(p.table),
        grille: { colonnes: 16, cellule: p.cellule, trait: 1 }, espace: p.espace, espacement: p.espacement, glyphes };
      if (derniere && sansCode.length) {
        table.sansCode = sansCode.map((image, i) => {
          const [x, y, largeur, hauteur] = poser(256 + i, image);
          return { image, x, y, largeur, hauteur };
        });
      }
      await ecrire(nom, table, { largeur: g.largeur, hauteur: g.hauteur, indices, palette, transparent: TRANSPARENT });
    }
  }
  fichiers.set(MANIFESTE_DES_POLICES, JSON.stringify(manifeste, null, 1) + '\n');
  return { manifeste, fichiers };
}

// La couleur des traits de la grille d'une planche en couleurs : le gris moyen de la palette le plus
// proche (il n'est jamais lu).
function indiceDeGrille(palette) {
  let meilleur = 0, distance = Infinity;
  for (let c = 0; c < 255; c++) {
    const r = palette[3 * c] - 24, v = palette[3 * c + 1] - 24, b = palette[3 * c + 2] - 24;
    const d = r * r + v * v + b * b;
    if (d < distance) { distance = d; meilleur = c; }
  }
  return meilleur;
}

// =====================================================================================================
// LA RECOMPOSITION
// =====================================================================================================
// Les polices refaites de leurs planches : { programme: Map(chemin de la table d'une police -> [{ adresse,
// octets }], les octets du programme qu'elle fait), banques: Map(nom -> { tab, dat }) }. `manifeste` :
// l'objet de images/polices/index.json ; lireAsset(chemin) rend une promesse d'octets ; `inflate` : le
// zlib des PNG ; `signaler` : le mode souple (la page) — une planche absente ou illisible donne des
// glyphes vides, un point dessiné hors d'un glyphe est signalé ; sans lui, toute anomalie est une erreur.
export async function composerLesPolices(manifeste, lireAsset, { inflate, signaler = null }) {
  if (manifeste.version !== 1) throw new Error(`${MANIFESTE_DES_POLICES} : d'une autre version (${manifeste.version})`);
  const texte = (o) => new TextDecoder().decode(o);
  const probleme = (m) => { if (!signaler) throw new Error(m); signaler(m); };
  let palette = null;
  const paletteDuJeu = async () => {
    if (!palette) {
      const im = await decoderPng(await lireAsset(manifeste.palette || PALETTE_DU_JEU), inflate);
      palette = im.indices ? Uint8Array.from(im.palette, (v) => v >> 2)
        : Uint8Array.from({ length: 768 }, (_, k) => im.rgba[4 * Math.floor(k / 3) + (k % 3)] >> 2);
    }
    return palette;
  };

  // Chaque police : sa table et un lecteur de sa planche.
  const lues = new Map();
  await Promise.all(Object.entries(manifeste.polices).map(async ([nom, f]) => {
    const p = POLICES[nom];
    if (!p) { probleme(`${MANIFESTE_DES_POLICES} : police inconnue « ${nom} »`); return; }
    const table = JSON.parse(texte(await lireAsset(f.table)));
    let im = null;
    try {
      im = await decoderPng(await lireAsset(f.planche), inflate);
    } catch (err) {
      probleme(`${f.planche} : absente ou illisible (${err.message}) ; ses glyphes sont vides`);
    }
    lues.set(nom, { p, f, table, planche: await lecteurDePlanche(im, p.genre === 'banque', f.planche, paletteDuJeu, signaler) });
  }));

  const programme = new Map();
  for (const [nom, { p, f, table, planche }] of lues) {
    if (p.genre === 'banque') continue;
    const parCode = new Map(table.glyphes.map((g) => [depuisHex(g.code), g]));
    const octets = new Uint8Array(p.genre === 'rangees' ? p.taille : p.hauteur * 256);
    const chasses = p.chasses !== undefined ? new Uint8Array(1024) : null;
    for (let code = p.premier; code <= p.dernier; code++) {
      const g = parCode.get(code);
      if (!g) probleme(`${f.table} : le glyphe ${hex2(code)} manque ; il est vide`);
      const debut = p.hauteur * (code - (p.genre === 'rangees' ? p.premier : 0));
      for (let r = 0; r < p.hauteur; r++) {
        let bits = 0;
        for (let i = 0; i < p.largeur; i++) bits = (bits << 1) | (g && planche.encre(g.x + i, g.y + r) ? 1 : 0);
        octets[debut + r] = p.genre === 'rangees' ? 2 * ((bits + 7) & 7) : bits;
      }
      if (chasses) {
        const v = [g ? g.chasse : p.largeur, g ? g.decalage : p.hauteur * code];
        if (v.some((x) => !Number.isInteger(x) || x < 0 || x > 0xFFFF)) throw new Error(`${f.table} : chasse ou décalage du glyphe ${hex2(code)} hors d'un mot`);
        chasses.set([v[0] & 0xFF, v[0] >> 8, v[1] & 0xFF, v[1] >> 8], 4 * code);
      }
    }
    if (p.genre === 'rangees') octets.set(table.octetsSuivants || [], p.hauteur * (p.dernier - p.premier + 1));
    const zones = [{ adresse: p.adresse, octets }];
    if (chasses) zones.push({ adresse: p.chasses, octets: chasses });
    programme.set(f.table, zones);
  }

  const banques = new Map();
  for (const [banque, meta] of Object.entries(manifeste.banques || {})) {
    const { tab, dat, tables } = composerUneBanque(banque, meta, meta.polices.map((nom) => [nom, lues.get(nom)]).filter(([, l]) => l), probleme);
    banques.set(banque, { tab, dat });
    for (const [nom, t] of tables) programme.set(lues.get(nom).f.table, [{ adresse: POLICES[nom].table, octets: t }]);
  }
  return { programme, banques };
}

// Un lecteur de planche : encre(x, y) pour une police d'un seul trait, indice(x, y) (255 : transparent)
// pour une police en couleurs. Hors de la planche, rien.
async function lecteurDePlanche(im, enCouleurs, fichier, paletteDuJeu, signaler) {
  if (!im) return { largeur: 0, hauteur: 0, encre: () => false, indice: () => TRANSPARENT };
  const { largeur, hauteur } = im;
  const dedans = (x, y) => x >= 0 && y >= 0 && x < largeur && y < hauteur;
  if (enCouleurs) {
    let indices = im.indices;
    if (!indices) {
      if (!signaler) throw new Error(`${fichier} : une image à palette est attendue`);
      signaler(`${fichier} : image en couleurs, ramenée à la palette du jeu (MPALETTE)`);
      indices = ramenerALaPalette(im, await paletteDuJeu(), true);
    }
    return { largeur, hauteur, indice: (x, y) => (dedans(x, y) ? indices[y * largeur + x] : TRANSPARENT) };
  }
  // Un seul trait : un point opaque et sombre (luminance sous la moitié) est encré.
  const sombre = (r, v, b) => 0.299 * r + 0.587 * v + 0.114 * b < 128;
  if (im.indices) {
    const encre = new Uint8Array(256);
    for (let k = 0; k < 256; k++) encre[k] = k !== im.transparent && sombre(im.palette[3 * k], im.palette[3 * k + 1], im.palette[3 * k + 2]) ? 1 : 0;
    return { largeur, hauteur, encre: (x, y) => dedans(x, y) && encre[im.indices[y * largeur + x]] === 1 };
  }
  return { largeur, hauteur, encre: (x, y) => {
    if (!dedans(x, y)) return false;
    const o = 4 * (y * largeur + x);
    return im.rgba[o + 3] >= 128 && sombre(im.rgba[o], im.rgba[o + 1], im.rgba[o + 2]);
  } };
}

// Refaire une banque de polices (MFONT-0) : ses images, prises des cases des planches, et la table
// code -> image de chaque police. Voir l'en-tête : la première case qui montre une image la fait (les
// polices dans l'ordre du manifeste, les codes dans l'ordre) ; une case qui en diffère devient une image
// ajoutée au bout ; une case dessinée d'un code absent de la table, un glyphe nouveau.
function composerUneBanque(banque, meta, polices, probleme) {
  const images = new Array(meta.images).fill(null);
  let suivante = meta.images;
  const pareilles = (a, b) => a.largeur === b.largeur && a.hauteur === b.hauteur
    && a.indices.every((v, k) => v === b.indices[k]) && a.opaque.every((v, k) => v === b.opaque[k]);
  const lireLaCase = (planche, x, y, largeur, hauteur) => {
    const indices = new Uint8Array(largeur * hauteur), opaque = new Uint8Array(largeur * hauteur);
    for (let j = 0; j < hauteur; j++) for (let i = 0; i < largeur; i++) {
      const v = planche.indice(x + i, y + j);
      if (v !== TRANSPARENT) { indices[j * largeur + i] = v; opaque[j * largeur + i] = 1; }
    }
    return { largeur, hauteur, indices, opaque };
  };
  const tables = [];
  for (const [nom, { p, f, table, planche }] of polices) {
    const g = grille(p.cellule, 16);
    const t = new Uint8Array(256);
    const decrits = new Set();
    // Ce qui est dessiné dans la case d'un code, depuis son coin : la plus petite boîte qui le tient.
    const dessinDeLaCase = (code) => {
      const [x0, y0] = g.place(code);
      let l = 0, h = 0;
      for (let j = 0; j < p.cellule.hauteur; j++) for (let i = 0; i < p.cellule.largeur; i++) {
        if (planche.indice(x0 + i, y0 + j) !== TRANSPARENT) { l = Math.max(l, i + 1); h = Math.max(h, j + 1); }
      }
      return [l, h];
    };
    const suiveurs = [];
    for (const e of table.glyphes) {
      const code = depuisHex(e.code);
      if (!(code >= 0 && code < 256)) throw new Error(`${f.table} : code illisible ${JSON.stringify(e.code)}`);
      decrits.add(code);
      if (e.comme !== undefined && e.comme !== null) {
        // (une case « comme » : vide, le code suit l'autre, plus bas ; dessinée, c'est un glyphe à lui)
        const [l, h] = dessinDeLaCase(code);
        if (!l) { suiveurs.push([code, depuisHex(e.comme)]); continue; }
        const [x, y] = g.place(code);
        images[suivante] = lireLaCase(planche, x, y, l, h);
        t[code] = suivante++;
        continue;
      }
      let [x, y] = g.place(code);
      if (Number.isInteger(e.x) && Number.isInteger(e.y)) [x, y] = [e.x, e.y];
      let { largeur, hauteur } = e;
      if (!Number.isInteger(largeur) || !Number.isInteger(hauteur)) [largeur, hauteur] = dessinDeLaCase(code);
      if (largeur > 127 || hauteur > 127 || largeur < 0 || hauteur < 0) throw new Error(`${f.table} : glyphe ${e.code} de ${largeur}x${hauteur} (127 au plus : le jeu double ses dimensions sur un octet)`);
      const [l, h] = dessinDeLaCase(code);
      if (l > largeur || h > hauteur) probleme(`${f.table} : le glyphe ${e.code} est dessiné sur ${l}x${h} points, sa table dit ${largeur}x${hauteur} : le reste est ignoré (agrandir « largeur » et « hauteur »)`);
      if (!largeur || !hauteur) continue;                   // un glyphe effacé : le code n'a plus d'image
      const ici = lireLaCase(planche, x, y, largeur, hauteur);
      let n = e.image === undefined || e.image === null ? null : e.image;
      if (n !== null && (!Number.isInteger(n) || n < 1 || n >= meta.images)) throw new Error(`${f.table} : glyphe ${e.code}, image ${n} hors de ${banque}`);
      if (n === null) n = suivante++;
      else if (images[n] && !pareilles(images[n], ici)) n = suivante++;
      if (!images[n]) images[n] = ici;
      t[code] = n;
    }
    // Les cases des codes absents de la table : dessinées, ce sont des glyphes nouveaux.
    for (let code = 0; code < 256; code++) {
      if (decrits.has(code)) continue;
      const [l, h] = dessinDeLaCase(code);
      if (!l) continue;
      const [x, y] = g.place(code);
      images[suivante] = lireLaCase(planche, x, y, l, h);
      t[code] = suivante++;
    }
    // Les codes qui en suivent un autre (une chaîne de « comme » se suit jusqu'au bout).
    for (let passe = 0; passe < 4; passe++) for (const [code, autre] of suiveurs) t[code] = t[autre];
    for (const s of table.sansCode || []) {
      if (Number.isInteger(s.image) && s.image > 0 && s.image < meta.images && !images[s.image]) {
        images[s.image] = lireLaCase(planche, s.x, s.y, s.largeur, s.hauteur);
      }
    }
    tables.push([nom, t]);
  }
  if (suivante > 255) throw new Error(`${banque} : ${suivante} images, 255 au plus (la table d'une police tient le numéro sur un octet)`);

  // Le .DAT : l'en-tête (dont les deux premiers octets comptent les images), les images dans l'ordre,
  // séparées, la queue. Le .TAB : six octets par image.
  const vides = new Map((meta.vides || []).map(([k, position, largeur, hauteur]) => [k, { position, largeur, hauteur }]));
  const entete = meta.entete.slice();
  if (entete.length >= 2 && (entete[0] | (entete[1] << 8)) === meta.images) { entete[0] = suivante & 0xFF; entete[1] = suivante >> 8; }
  const morceaux = [Uint8Array.from(entete)];
  let position = entete.length, premiere = true;
  const entrees = [];
  for (let k = 0; k < suivante; k++) {
    const im = images[k];
    if (!im) { entrees.push(vides.get(k) || { position: 0, largeur: 0, hauteur: 0 }); continue; }
    if (!premiere) { morceaux.push(Uint8Array.from(meta.separateur)); position += meta.separateur.length; }
    premiere = false;
    const code = encoderImage(im.indices, im.opaque, im.largeur, im.hauteur);
    entrees.push({ position, largeur: im.largeur, hauteur: im.hauteur });
    morceaux.push(code);
    position += code.length;
  }
  morceaux.push(Uint8Array.from(meta.queue));
  const dat = new Uint8Array(morceaux.reduce((t, m) => t + m.length, 0));
  let o = 0;
  for (const m of morceaux) { dat.set(m, o); o += m.length; }
  return { tab: ecrireTableDImages(entrees), dat, tables };
}

// Les fichiers des polices, pour qui les emporte : le manifeste, chaque table et chaque planche.
export function fichiersDesPolices(manifeste) {
  const f = [MANIFESTE_DES_POLICES];
  if (manifeste.palette) f.push(manifeste.palette);
  for (const p of Object.values(manifeste.polices)) f.push(p.table, p.planche);
  return f;
}
