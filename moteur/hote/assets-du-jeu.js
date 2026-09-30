// Les assets du jeu : ce que le moteur prend du CD de Theme Park, en formats d'aujourd'hui, et comment
// il en refait, octet pour octet, les fichiers que le jeu de 1994 lit.
//
//   index.json                     l'inventaire : ce qui suit, et d'où vient chaque fichier du jeu
//   programme/index.json, *.json,  les données de MAIN.EXE, sans son code (image-programme.js), en
//     chaines.txt                  tables lisibles : le manifeste dit chaque zone (adresse, taille,
//                                  type, fichier, nom, modules qui la lisent) ; les .json en donnent
//                                  les valeurs, chaines.txt les chaînes (tables-du-programme.js)
//   programme/intro/...            ce qu'INTRO.EXE, l'introduction, pose autrement (image-intro.js)
//   images/polices/index.json,     les polices du jeu (moteur/hote/polices.js) : une planche PNG par
//     <police>.png, <police>.json  police, un glyphe par code de caractère, et sa table ; le programme
//                                  (ses tables de caractères, la petite police) et la banque MFONT-0
//                                  s'en refont
//   images/banques/NOM.png, .json  une banque d'images (MSPR-0 : les sprites du parc...) : une planche
//                                  PNG à palette, chaque pixel étant l'indice de couleur du jeu, la
//                                  transparence notée 255 ; le .json dit où est chaque image
//   images/fonds/NOM.png           un fond plein écran (320x200, à palette)
//   images/palettes/NOM.png        une palette (16x16 : les 256 couleurs)
//   sons/bruitages/BANQUE/NOM.wav  un bruitage d'une banque (SNDS0-2 : la première banque en 16 bits)
//   sons/musiques/FM/NOM.hmp, .mid un morceau, tel que le jeu le lit (HMP) et en MIDI standard ; FM,
//                                  MT32 et GM sont les trois versions du CD ; FM/NOM.mp3 : le morceau
//                                  tel que le jeu le joue (moteur/node/rendre-musiques.mjs)
//   sons/instruments/INST.BNK...   les timbres de la puce FM
//   films/NOM.mp4                  les films (l'introduction, ceux des attractions, la partie gagnée),
//                                  convertis par moteur/node/extraire-films.mjs ; tant qu'ils ne le sont
//                                  pas, les fichiers FLC du CD restent dans donnees/ et le jeu les joue
//                                  lui-même
//   textes/index.json,             les langues (moteur/hote/langues.js) : nom, fichier, emplacement de
//     LANG0.json...                1994 (le n de LANGn-0.DAT) ; les textes, par groupes, une chaîne par
//                                  entrée, en vrais caractères (la page 437 du DOS : formats-du-cd.js)
//   donnees/...                    les tables que le jeu lit telles quelles (animations .ANI, .INF...) ;
//                                  parties/DEMO.GY : le parc de démonstration
//   donnees/pilotes-hmi.json       ce que SOS lit des bibliothèques de pilotes de HMI (HMIDET.386,
//                                  HMIDRV.386) : leurs en-têtes ; l'hôte en fait des fichiers virtuels
//                                  (pilotes-hmi.js), le code des pilotes ne tournant jamais
//
// L'extraction (preparerLesAssets) tourne sous Node (moteur/node/extraire-jeu.mjs) ou dans le
// navigateur (moteur/web/extraction-travailleur.js), depuis l'image ISO du CD ou ses fichiers. Le
// moteur (composerLesFichiers, appelé par fichiers-paquet.js dans le travailleur) refait les fichiers
// du CD à partir des assets avant de lancer le jeu : le jeu de 1994 lit ses fichiers d'origine, et
// l'extraction vérifie qu'ils sont identiques, octet pour octet, à ceux du CD.

import { extraireLImage, ecrireLImage } from './image-programme.js';
import { extraireLImageDeLIntro } from './image-intro.js';
import { ecrireLesTables, manifesteEnJson, composerLImage } from './tables-du-programme.js';
import * as CARTE from './carte-du-programme.js';
import { PILOTES, decrireLesPilotes, fabriquerLePilote, pilotesEnJson } from './pilotes-hmi.js';
import { encoderPng, decoderPng, ramenerALaPalette } from './png.js';
import { lireTableDImages, ecrireTableDImages, decoderImage, encoderImage, lireBanqueSonore, ecrireBanqueSonore,
  formatDesBruitages, versionDesMorceaux, ecrireWav, lireWav, decoderTextes, encoderTextes, hmpVersMidi,
  textesEnSignes, signesEnTextes } from './formats-du-cd.js';
import { extraireLesPolices, composerLesPolices, fichiersDesPolices, BANQUES_DES_POLICES, MANIFESTE_DES_POLICES } from './polices.js';
import { MANIFESTE_DES_TEXTES, manifesteDesTextes, languesDuManifeste } from './langues.js';
import { estExterne } from './tables-du-programme.js';
import { inflate as inflateDeSecours } from './inflate.js';

export const VERSION = 1;
const TRANSPARENT = 255;
const MANIFESTE = 'programme/index.json';
const FICHIER_DES_PILOTES = 'donnees/pilotes-hmi.json';

// Les fichiers du CD retenus, par leur chemin sur le CD (majuscules, séparé par /) : les données du
// jeu et le parc de démonstration. Le reste du CD n'est pas repris : MAIN.EXE et INTRO.EXE (du code :
// leurs données sont dans programme/), DOS4GW.EXE, HMIMDRV.386, le programme d'installation ; et
// HMIDRV.386 et HMIDET.386, les bibliothèques de pilotes de HMI que SOS ouvre : leur code ne tourne
// jamais (l'hôte joue le son : moteur/hote/son.js), le moteur n'en garde que les en-têtes
// (donnees/pilotes-hmi.json) et en refait des fichiers virtuels de même forme (pilotes-hmi.js), que
// la vérification de l'extraction ne compare donc pas aux originaux octet pour octet.
export const RETENU = (chemin) => /^GAME\/(DATA\/[^/]+|SAVE\/[^/]+)$/.test(chemin);
// Les films FLC : l'introduction, ceux des attractions, celui de la partie gagnée.
export const FILM = (nom) => /^(RIDEANI\.\d+|INTRO\.DAT|WINGAME\.DAT)$/.test(nom);

// Le chemin sur le CD d'un fichier que le jeu demande (normalisé : majuscules, /) ; null s'il n'est
// pas du CD. Le jeu lit ses données sur le CD (D:/GAME/...) ou dans son installation
// (C:/THEME.CD/DATA/..., que l'installation d'origine recopiait du CD), et ses sauvegardes dans
// C:/THEME.CD/SAVE/, où le parc de démonstration vient aussi du CD.
export function cheminSurLeCD(chemin) {
  if (chemin.startsWith('D:/GAME/')) return 'GAME/' + chemin.slice('D:/GAME/'.length);
  if (chemin.startsWith('C:/THEME.CD/DATA/')) return 'GAME/DATA/' + chemin.slice('C:/THEME.CD/DATA/'.length);
  if (chemin.startsWith('C:/THEME.CD/SAVE/')) return 'GAME/SAVE/' + chemin.slice('C:/THEME.CD/SAVE/'.length);
  return null;
}

// La palette avec laquelle regarder une banque ou un fond (le jeu, lui, ne lit que les indices) :
// celle de l'écran qui l'emploie ; MPALETTE, celle du parc, pour les autres.
const PALETTE_DE = {
  'MAUSPR-0': 'MAWPAL-0', 'MAUCT-0': 'MAWPAL-0', 'MAWAR0-0': 'MAWPAL-0', 'MAWAR1-0': 'MAWPAL-0',
  'MGLOBE-0': 'MGLPAL-0', 'MNEG-0': 'MNGPAL-0', 'MRES-0': 'MRSPAL-0', 'MRSSPR-0': 'MRSPAL-0',
  'MSTATE-0': 'MSTPAL-0', 'MSTOCK-0': 'MSTPAL-0', 'MSHARE-0': 'MSTPAL-0', 'MSTSPR-0': 'MSTPAL-0',
};
const PALETTE_GRISE = Uint8Array.from({ length: 768 }, (_, k) => (k / 3 | 0) >> 2);

const base = (chemin) => chemin.slice(chemin.lastIndexOf('/') + 1);
const sansExtension = (nom) => nom.replace(/\.[^.]*$/, '');
const memes = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);

// Des noms de fichiers uniques pour les entrées d'une banque sonore (NULL.RAW y figure neuf fois) :
// la tige du nom, puis -2, -3...
function nomsDeFichiers(entrees, extension) {
  const vus = new Map();
  return entrees.map((e) => {
    const tige = sansExtension(e.nom);
    const n = (vus.get(tige) || 0) + 1;
    vus.set(tige, n);
    return `${tige}${n > 1 ? '-' + n : ''}.${extension}`;
  });
}

// --- L'extraction --------------------------------------------------------------------------------
// source : { chemins: [chemin sur le CD], lire: async (chemin) => Uint8Array } ;
// ecrire : async (chemin dans les assets, octets ou texte) => void ; outils.deflate : (Uint8Array) =>
// Uint8Array ou promesse (zlib). Rend l'index.
export async function preparerLesAssets(source, ecrire, { deflate }, journal = () => {}) {
  if (!source.chemins.includes('GAME/MAIN.EXE')) throw new Error("GAME/MAIN.EXE est introuvable : ce n'est pas le CD de Theme Park");
  const index = { version: VERSION, jeu: 'Theme Park (Bullfrog, 1994), édition CD', origine: {},
    programme: null, introduction: null, polices: null, banques: {}, fonds: {}, palettes: {}, bruitages: {}, musiques: {},
    textes: {}, donnees: {}, films: { bruts: {} } };
  const lus = new Map();
  const lire = async (c) => { if (!lus.has(c)) lus.set(c, await source.lire(c)); return lus.get(c); };

  // le programme et l'introduction : leurs données, sans leur code, en tables lisibles
  const image = await extraireLImage(await lire('GAME/MAIN.EXE'));
  let intro = null;
  if (source.chemins.includes('GAME/INTRO.EXE')) {
    try {
      intro = await extraireLImageDeLIntro(await lire('GAME/INTRO.EXE'), image);
    } catch (e) {
      journal(`pas d'introduction : ${e.message}`);
    }
  }
  const tables = ecrireLesTables(image, CARTE, intro);
  for (const [f, texte] of tables.fichiers) await ecrire(`programme/${f}`, texte);
  await ecrire(MANIFESTE, manifesteEnJson(tables.manifeste));
  const octetsDe = (partie) => partie.blocs.reduce((t, [, n]) => t + n, 0);
  index.programme = { manifeste: MANIFESTE, source: image.source, octets: octetsDe(tables.manifeste.programme) };
  index.origine['GAME/MAIN.EXE'] = image.source;
  journal(`programme : ${index.programme.octets} octets de données, tirés de MAIN.EXE, en ${tables.manifeste.programme.zones.length} zones`);
  if (intro) {
    index.introduction = { manifeste: MANIFESTE, source: intro.source, octets: octetsDe(tables.manifeste.introduction) };
    index.origine['GAME/INTRO.EXE'] = intro.source;
    journal(`introduction : ${index.introduction.octets} octets de données, tirés d'INTRO.EXE, dont `
      + `${tables.manifeste.introduction.zones.length} zones posées autrement que MAIN.EXE`);
  }

  // les bibliothèques de pilotes de HMI : leurs en-têtes (pilotes-hmi.js)
  const pilotes = { description: "Ce que SOS lit des bibliothèques de pilotes de HMI : l'en-tête de chaque fichier et celui de "
    + "chaque module ; « code » : les octets du code d'un module que l'hôte relit. L'hôte en refait les fichiers "
    + '(moteur/hote/pilotes-hmi.js), le code des modules à zéro.' };
  for (const c of PILOTES) {
    if (source.chemins.includes(c)) pilotes[c] = decrireLesPilotes(await lire(c), /HMIDET/.test(c));
  }
  if (PILOTES.some((c) => pilotes[c])) {
    await ecrire(FICHIER_DES_PILOTES, pilotesEnJson(pilotes));
    index.pilotes = FICHIER_DES_PILOTES;
    journal(`pilotes de HMI : ${PILOTES.filter((c) => pilotes[c]).map((c) => `${base(c)} (${pilotes[c].modules.length} modules)`).join(', ')}`
      + ` décrits dans ${FICHIER_DES_PILOTES}`);
  }

  const retenus = source.chemins.filter(RETENU).sort();
  const parNom = new Map(retenus.map((c) => [c, base(c)]));
  const existe = (chemin) => parNom.has(chemin);
  const palettes = new Map();
  const compte = { banques: 0, images: 0, fonds: 0, palettes: 0, bruitages: 0, morceaux: 0, textes: 0, donnees: 0, films: 0 };

  // 1. les palettes (768 octets), qui servent à regarder les banques et les fonds
  for (const c of retenus) {
    const nom = parNom.get(c);
    if (!c.startsWith('GAME/DATA/') || !/\.DAT$/.test(nom)) continue;
    const octets = await lire(c);
    if (octets.length !== 768) continue;
    const n = sansExtension(nom);
    palettes.set(n, octets);
    const indices = Uint8Array.from({ length: 256 }, (_, k) => k);
    await ecrire(`images/palettes/${n}.png`, await encoderPng({ largeur: 16, hauteur: 16, indices, palette: octets }, deflate));
    index.palettes[n] = `images/palettes/${n}.png`;
    compte.palettes++;
  }
  const paletteDe = (n) => palettes.get(PALETTE_DE[n] || 'MPALETTE') || PALETTE_GRISE;

  // 1 bis. les polices : celles du programme et celles de MFONT-0, en planches (polices.js)
  {
    const m8 = new Uint8Array(0x100000);
    for (const b of image.blocs) m8.set(b.octets, b.adresse);
    const banques = {};
    for (const n of Object.keys(BANQUES_DES_POLICES)) {
      if (existe(`GAME/DATA/${n}.TAB`) && existe(`GAME/DATA/${n}.DAT`)) banques[n] = { tab: await lire(`GAME/DATA/${n}.TAB`), dat: await lire(`GAME/DATA/${n}.DAT`) };
    }
    const polices = await extraireLesPolices(m8, banques, paletteDe('MFONT-0'), deflate);
    for (const [f, contenu] of polices.fichiers) await ecrire(f, contenu);
    index.polices = MANIFESTE_DES_POLICES;
    compte.polices = Object.keys(polices.manifeste.polices).length;
  }
  const fichiersDesTextes = new Map();         // emplacement -> fichier

  // 2. le reste, fichier par fichier
  for (const c of retenus) {
    const nom = parNom.get(c);
    const n = sansExtension(nom);
    const donnee = async (dossier) => {
      const octets = await lire(c);
      const fichier = `${dossier}/${nom}`;
      await ecrire(fichier, octets);
      index.donnees[c] = { fichier, taille: octets.length };
      compte.donnees++;
      return fichier;
    };
    if (!c.startsWith('GAME/DATA/')) {
      // GAME/SAVE/DEMO.GY
      await donnee(c.startsWith('GAME/SAVE/') ? 'parties' : 'donnees');
      continue;
    }
    if (palettes.has(n) && /\.DAT$/.test(nom)) continue;
    if (/\.TAB$/.test(nom)) continue;                       // traité avec son .DAT
    if (/\.DAT$/.test(nom) && existe(`GAME/DATA/${n}.TAB`)) {
      const tab = await lire(`GAME/DATA/${n}.TAB`), dat = await lire(c);
      if (/^SNDS\d-\d$/.test(n)) {
        const format = formatDesBruitages(n);
        const entrees = lireBanqueSonore(tab, dat);
        const dossier = `sons/bruitages/${n}`;
        const fichiers = nomsDeFichiers(entrees, 'wav');
        for (let k = 0; k < entrees.length; k++) await ecrire(`${dossier}/${fichiers[k]}`, ecrireWav(entrees[k].octets, format.bits, format.frequence));
        // (tailles : les octets de chaque son dans sa banque, pour la page, qui refait les banques sans
        // lire les WAV : composerLesFichiers, `bruitagesMuets`)
        index.bruitages[n] = { dossier, bits: format.bits, frequence: format.frequence, entrees: entrees.map((e) => e.nom), fichiers,
          tailles: entrees.map((e) => e.octets.length) };
        compte.bruitages += entrees.length;
      } else if (/^MUSIC\d-\d$/.test(n)) {
        const dossier = `sons/musiques/${versionDesMorceaux(n)}`;
        const entrees = lireBanqueSonore(tab, dat);
        const fichiers = nomsDeFichiers(entrees, 'hmp');
        for (let k = 0; k < entrees.length; k++) {
          await ecrire(`${dossier}/${fichiers[k]}`, entrees[k].octets);
          try {
            await ecrire(`${dossier}/${fichiers[k].replace(/\.hmp$/, '.mid')}`, hmpVersMidi(entrees[k].octets));
          } catch (err) {
            journal(`${entrees[k].nom} : pas de MIDI (${err.message})`);
          }
        }
        index.musiques[n] = { dossier, entrees: entrees.map((e) => e.nom), fichiers };
        compte.morceaux += entrees.length;
      } else if (BANQUES_DES_POLICES[n]) {
        // (une banque de polices : ses images sont dans les planches des polices, plus haut)
      } else {
        const planche = await extraireUneBanque(n, tab, dat, paletteDe(n), deflate);
        await ecrire(`images/banques/${n}.png`, planche.png);
        await ecrire(`images/banques/${n}.json`, JSON.stringify(planche.table));
        index.banques[n] = { image: `images/banques/${n}.png`, table: `images/banques/${n}.json` };
        compte.banques++;
        compte.images += planche.images;
      }
      continue;
    }
    if (/\.DAT$/.test(nom) && (await lire(c)).length === 64000) {
      await ecrire(`images/fonds/${n}.png`, await encoderPng({ largeur: 320, hauteur: 200, indices: await lire(c), palette: paletteDe(n) }, deflate));
      index.fonds[n] = `images/fonds/${n}.png`;
      compte.fonds++;
      continue;
    }
    if (/^LANG\d-0\.DAT$/.test(nom)) {
      const groupes = decoderTextes(await lire(c));
      if (groupes) {
        // (en vrais caractères : les octets sont de la page 437 du DOS, formats-du-cd.js)
        const langue = nom.slice(0, 5);
        await ecrire(`textes/${langue}.json`, JSON.stringify(textesEnSignes(groupes), null, 1));
        fichiersDesTextes.set(Number(nom[4]), `textes/${langue}.json`);
        compte.textes++;
        continue;
      }
      journal(`${nom} : forme inattendue, gardé tel quel`);
    }
    if (/\.BNK$/.test(nom)) { await donnee('sons/instruments'); continue; }
    const fichier = await donnee('donnees');
    if (FILM(nom)) { index.films.bruts[c] = fichier; compte.films++; }
  }
  if (fichiersDesTextes.size) {
    await ecrire(MANIFESTE_DES_TEXTES, JSON.stringify(manifesteDesTextes(fichiersDesTextes), null, 1) + '\n');
    index.textes = MANIFESTE_DES_TEXTES;
  }
  journal(`${compte.polices || 0} polices, ${compte.banques} banques d'images (${compte.images} images), ${compte.fonds} fonds, ${compte.palettes} palettes, `
    + `${compte.bruitages} bruitages, ${compte.morceaux} morceaux, ${compte.textes} langues, ${compte.donnees} fichiers de données `
    + `dont ${compte.films} films FLC`);
  await ecrire('index.json', JSON.stringify(index, null, 1));
  return index;
}

// Une banque d'images en planche : ses images distinctes (par position croissante dans le .DAT)
// rangées en rayons, sur un fond transparent ; et sa table : ce qui, dans le .DAT, n'est pas une
// image (un en-tête, un octet entre deux images dans certaines banques, une queue), et pour chaque
// entrée du .TAB sa position, sa taille et sa place sur la planche.
async function extraireUneBanque(nom, tab, dat, palette, deflate) {
  const entrees = lireTableDImages(tab);
  const positions = [...new Set(entrees.filter((e) => e.largeur && e.hauteur).map((e) => e.position))].sort((a, b) => a - b);
  const images = new Map();
  for (const p of positions) {
    const memePosition = entrees.filter((e) => e.position === p && e.largeur && e.hauteur);
    const { largeur, hauteur } = memePosition[0];
    if (memePosition.some((e) => e.largeur !== largeur || e.hauteur !== hauteur)) throw new Error(`${nom} : deux images de tailles différentes en ${p}`);
    const im = decoderImage(dat, p, largeur, hauteur);
    if (!im) throw new Error(`${nom} : image illisible en ${p}`);
    for (let k = 0; k < im.indices.length; k++) {
      if (im.opaque[k] && im.indices[k] === TRANSPARENT) throw new Error(`${nom} : un pixel opaque d'indice 255 en ${p}`);
    }
    images.set(p, { largeur, hauteur, ...im });
  }
  // ce qui n'est pas une image
  const entete = [...dat.subarray(0, positions.length ? positions[0] : dat.length)];
  const entre = [];
  let queue = [];
  positions.forEach((p, k) => {
    const suivant = k + 1 < positions.length ? positions[k + 1] : dat.length;
    const ecart = [...dat.subarray(images.get(p).fin, suivant)];
    if (k + 1 < positions.length) entre.push(ecart); else queue = ecart;
  });
  const uniforme = entre.every((e) => memes(e, entre[0]));
  // la planche : des rayons, de la largeur choisie d'après la surface des images
  const surface = positions.reduce((t, p) => t + images.get(p).largeur * images.get(p).hauteur, 0);
  const largeur = surface > 300000 ? 1024 : surface > 60000 ? 512 : 256;
  const places = new Map();
  let x = 0, y = 0, rayon = 0;
  for (const p of positions) {
    const im = images.get(p);
    if (x + im.largeur > largeur) { x = 0; y += rayon; rayon = 0; }
    places.set(p, [x, y]);
    x += im.largeur;
    rayon = Math.max(rayon, im.hauteur);
  }
  const hauteur = Math.max(1, y + rayon);
  const indices = new Uint8Array(largeur * hauteur).fill(TRANSPARENT);
  for (const p of positions) {
    const im = images.get(p), [px, py] = places.get(p);
    for (let j = 0; j < im.hauteur; j++) {
      for (let i = 0; i < im.largeur; i++) {
        if (im.opaque[j * im.largeur + i]) indices[(py + j) * largeur + px + i] = im.indices[j * im.largeur + i];
      }
    }
  }
  const png = await encoderPng({ largeur, hauteur, indices, palette, transparent: TRANSPARENT }, deflate);
  const table = { entete, ...(uniforme ? { separateur: entre[0] || [] } : { entre }), queue,
    entrees: entrees.map((e) => e.largeur && e.hauteur ? [e.position, e.largeur, e.hauteur, ...places.get(e.position)] : [e.position, e.largeur, e.hauteur]) };
  return { png, table, images: positions.length };
}

// Refaire le .DAT et le .TAB d'une banque depuis sa planche et sa table.
function recomposerUneBanque(planche, table) {
  const entrees = table.entrees.map(([position, largeur, hauteur, x, y]) => ({ position, largeur, hauteur, x, y }));
  const positions = [...new Set(entrees.filter((e) => e.largeur && e.hauteur).map((e) => e.position))].sort((a, b) => a - b);
  const morceaux = [Uint8Array.from(table.entete)];
  positions.forEach((p, k) => {
    const e = entrees.find((x) => x.position === p && x.largeur && x.hauteur);
    const indices = new Uint8Array(e.largeur * e.hauteur), opaque = new Uint8Array(e.largeur * e.hauteur);
    // (une planche plus petite que ce que dit la table, modifiée à la main : ce qui en déborde est
    // transparent ; assets-du-jeu le signale, voir composerLesFichiers)
    for (let j = 0; j < e.hauteur; j++) {
      const dedansY = e.y + j < planche.hauteur;
      for (let i = 0; i < e.largeur; i++) {
        const v = dedansY && e.x + i < planche.largeur ? planche.indices[(e.y + j) * planche.largeur + e.x + i] : TRANSPARENT;
        if (v !== TRANSPARENT) { indices[j * e.largeur + i] = v; opaque[j * e.largeur + i] = 1; }
      }
    }
    morceaux.push(encoderImage(indices, opaque, e.largeur, e.hauteur));
    if (k + 1 < positions.length) morceaux.push(Uint8Array.from(table.separateur !== undefined ? table.separateur : table.entre[k]));
  });
  morceaux.push(Uint8Array.from(table.queue));
  const dat = new Uint8Array(morceaux.reduce((t, m) => t + m.length, 0));
  let o = 0;
  for (const m of morceaux) { dat.set(m, o); o += m.length; }
  return { dat, tab: ecrireTableDImages(entrees) };
}

// Les films FLC que des mp4 remplacent, parmi ceux des assets (films.bruts : chemin sur le CD ->
// fichier) : un film part quand toutes les attractions qui le jouent ont leur mp4 (l'attraction 16
// joue le film 9), `existe(fichier)` disant si un mp4 est là. Rend les chemins sur le CD.
export function filmsRemplaces(films, existe) {
  const remplaces = [];
  if (!films) return remplaces;
  const attractions = films.attractions || {};
  for (const chemin of Object.keys(films.bruts || {})) {
    const nom = base(chemin);
    if (nom === 'INTRO.DAT') { if (existe(films.introduction)) remplaces.push(chemin); continue; }
    if (nom === 'WINGAME.DAT') { if (existe(films.partieGagnee)) remplaces.push(chemin); continue; }
    const m = /^RIDEANI\.(\d+)$/.exec(nom);
    if (!m) continue;
    const n = Number(m[1]);
    const joueurs = n === 9 ? [9, 16] : [n];
    if (joueurs.every((a) => existe(attractions[String(a)]))) remplaces.push(chemin);
  }
  return remplaces;
}

// --- La recomposition ----------------------------------------------------------------------------
// Les fichiers du jeu, refaits depuis les assets : une Map, chemin sur le CD -> octets, ou, pour un
// gros fichier de donnees/ (un film FLC), le lecteur que rend `paresseux(fichier, taille)` (s'il en
// rend un) : { taille, lire(position, nombre) => octets }. lireAsset(chemin) rend une promesse
// d'octets ; inflate décompresse le zlib des PNG (promesse ou valeur).
//
// `signaler(message)` : le mode souple, celui de la page. Les assets peuvent y avoir été modifiés à la
// main (la distribution est faite pour qu'on le fasse : moteur/hote/distribution.js), et le jeu doit
// continuer avec ce qu'il a, en disant ce qui ne va pas :
//  - une image absente ou illisible : ses sprites sont transparents (un fond : noir ; une palette :
//    des gris) ;
//  - une planche aux dimensions différentes de ce que dit sa table (les tables font foi) : ce qui en
//    déborde est transparent ;
//  - une image en couleurs (RVB, RVBA, gris : ce qu'écrit un éditeur d'images) : chaque couleur est
//    ramenée à la plus proche de la palette du jeu, l'alpha sous 128 étant la transparence ;
//  - un bruitage absent : un silence ; un WAV d'un autre format (stéréo, 44 100 Hz, 16 bits...) :
//    ramené à celui de sa banque (une voie, la fréquence et les bits de la banque) ;
//  - les musiques, les textes, les tables : le jeu ne peut s'en passer ; l'erreur nomme le fichier.
// Sans `signaler` (l'extraction, qui vérifie que les fichiers du CD se refont à l'identique), toute
// anomalie est une erreur, comme avant.
//
// `bruitagesMuets` : la page, qui joue elle-même les fichiers des bruitages (moteur/web/audio.js) et
// ne demande au moteur que des événements (son.js). Le jeu ne lit jamais les échantillons : seul le
// module de mélange le faisait, et seule leur durée compte pour lui (un descripteur avance jusqu'à
// la fin des données). Les banques sont donc faites de silences de la taille d'origine
// (index.json, `tailles`), sans lire un seul WAV : le jeu tourne comme avec les vrais, et la page
// ouverte d'un double-clic n'a pas besoin de les porter dans un compagnon. Un bruitage remplacé
// garde ainsi, pour le jeu, la durée de l'original. Sans `tailles` (des assets d'avant), les WAV sont
// lus comme d'ordinaire.
export async function composerLesFichiers(index, lireAsset, inflate, paresseux = null, { signaler = null, bruitagesMuets = false } = {}) {
  if (index.version !== VERSION) throw new Error(`les assets sont d'une autre version (${index.version}) : refaire l'extraction`);
  const fichiers = new Map();
  const texte = (o) => new TextDecoder().decode(o);
  const taches = [];
  // Un asset dont le jeu peut se passer : en mode souple, null s'il manque ou ne se lit pas.
  const lireSouple = (f) => (signaler
    ? Promise.resolve().then(() => lireAsset(f)).catch((err) => { signaler(`${f} : absent ou illisible (${err.message})`); return null; })
    : lireAsset(f));
  // Un asset sans lequel le jeu ne va pas : l'erreur le nomme.
  const lireIndispensable = (f) => Promise.resolve().then(() => lireAsset(f)).catch((err) => {
    throw new Error(`${f} : absent ou illisible, le jeu ne peut s'en passer (${err.message})`);
  });
  const decoder = (png, f) => decoderPng(png, inflate).catch((err) => {
    if (!signaler) throw err;
    signaler(`${f} : image illisible (${err.message})`);
    return null;
  });

  // Les palettes (en composantes de 6 bits, celles du VGA), d'abord : une image en couleurs y est
  // ramenée.
  const palettes = new Map();
  for (const [nom, fichier] of Object.entries(index.palettes || {})) {
    palettes.set(nom, lireSouple(fichier).then(async (png) => {
      const im = png && await decoder(png, fichier);
      if (!im) return PALETTE_GRISE;
      if (im.indices) return Uint8Array.from(im.palette, (v) => v >> 2);
      // (une palette réenregistrée en couleurs : ses 256 pixels, dans l'ordre)
      const p = new Uint8Array(768);
      for (let k = 0; k < 256 && 4 * k < im.rgba.length; k++) for (let c = 0; c < 3; c++) p[3 * k + c] = im.rgba[4 * k + c] >> 2;
      return p;
    }));
  }
  for (const [nom, p] of palettes) taches.push(p.then((octets) => fichiers.set(`GAME/DATA/${nom}.DAT`, octets)));
  const paletteDuJeu = (nom) => palettes.get(PALETTE_DE[nom] || 'MPALETTE') || Promise.resolve(PALETTE_GRISE);
  // Les indices d'une image lue (decoderPng) ; une image en couleurs est ramenée à la palette de `nom`.
  const indicesDe = async (im, nom, fichier, avecTransparence) => {
    if (im.indices) return im.indices;
    if (!signaler) throw new Error(`${fichier} : une image à palette est attendue`);
    signaler(`${fichier} : image en couleurs, ramenée à la palette du jeu (${PALETTE_DE[nom] || 'MPALETTE'})`);
    return ramenerALaPalette(im, await paletteDuJeu(nom), avecTransparence);
  };

  for (const [nom, b] of Object.entries(index.banques || {})) {
    taches.push(Promise.all([lireSouple(b.image), lireIndispensable(b.table)]).then(async ([png, octetsTable]) => {
      const table = JSON.parse(texte(octetsTable));
      const im = png && await decoder(png, b.image);
      let planche = { largeur: 0, hauteur: 0, indices: new Uint8Array(0) };
      if (im) planche = { largeur: im.largeur, hauteur: im.hauteur, indices: await indicesDe(im, nom, b.image, true) };
      if (signaler && im) {
        // la place que la table demande
        let l = 0, h = 0;
        for (const [, largeur, hauteur, x, y] of table.entrees) if (largeur && hauteur) { l = Math.max(l, x + largeur); h = Math.max(h, y + hauteur); }
        if (planche.largeur < l || planche.hauteur < h) {
          signaler(`${b.image} : ${planche.largeur}x${planche.hauteur}, sa table (${b.table}) demande au moins ${l}x${h} : `
            + 'ce qui déborde est transparent');
        }
      }
      const { dat, tab } = recomposerUneBanque(planche, table);
      fichiers.set(`GAME/DATA/${nom}.DAT`, dat);
      fichiers.set(`GAME/DATA/${nom}.TAB`, tab);
    }));
  }
  for (const [nom, fichier] of Object.entries(index.fonds || {})) {
    taches.push(lireSouple(fichier).then(async (png) => {
      const im = png && await decoder(png, fichier);
      if (!signaler) {
        if (im.largeur * im.hauteur !== 64000) throw new Error(`${fichier} : un fond de 320x200 est attendu`);
        fichiers.set(`GAME/DATA/${nom}.DAT`, await indicesDe(im, nom, fichier, false));
        return;
      }
      // (souple : un fond d'une autre taille est recadré en 320x200, complété de noir)
      const fond = new Uint8Array(64000);
      if (im) {
        const indices = await indicesDe(im, nom, fichier, false);
        if (im.largeur !== 320 || im.hauteur !== 200) signaler(`${fichier} : ${im.largeur}x${im.hauteur} au lieu de 320x200, recadré`);
        for (let y = 0; y < Math.min(200, im.hauteur); y++) {
          fond.set(indices.subarray(y * im.largeur, y * im.largeur + Math.min(320, im.largeur)), y * 320);
        }
      }
      fichiers.set(`GAME/DATA/${nom}.DAT`, fond);
    }));
  }
  for (const [nom, b] of Object.entries(index.bruitages || {})) {
    if (bruitagesMuets && Array.isArray(b.tailles) && b.tailles.length === b.entrees.length) {
      const { tab, dat } = ecrireBanqueSonore(b.entrees.map((nomDuSon, k) => ({
        nom: nomDuSon, octets: new Uint8Array(b.tailles[k]).fill(b.bits === 8 ? 0x80 : 0),
      })));
      fichiers.set(`GAME/DATA/${nom}.DAT`, dat);
      fichiers.set(`GAME/DATA/${nom}.TAB`, tab);
      continue;
    }
    taches.push(Promise.all(b.fichiers.map((f) => lireSouple(`${b.dossier}/${f}`))).then((wavs) => {
      const sons = b.entrees.map((nomDuSon, k) => ({
        nom: nomDuSon,
        octets: signaler ? pcmPourLaBanque(wavs[k], b, `${b.dossier}/${b.fichiers[k]}`, signaler) : lireWav(wavs[k]).pcm,
      }));
      const { tab, dat } = ecrireBanqueSonore(sons);
      fichiers.set(`GAME/DATA/${nom}.DAT`, dat);
      fichiers.set(`GAME/DATA/${nom}.TAB`, tab);
    }));
  }
  for (const [nom, b] of Object.entries(index.musiques || {})) {
    taches.push(Promise.all(b.fichiers.map((f) => lireIndispensable(`${b.dossier}/${f}`))).then((hmps) => {
      const { tab, dat } = ecrireBanqueSonore(b.entrees.map((nomDuMorceau, k) => ({ nom: nomDuMorceau, octets: hmps[k] })));
      fichiers.set(`GAME/DATA/${nom}.DAT`, dat);
      fichiers.set(`GAME/DATA/${nom}.TAB`, tab);
    }));
  }
  if (typeof index.textes === 'string') {
    // Le manifeste des langues (langues.js) : chaque langue qui a un emplacement devient LANGn-0.DAT,
    // ses textes refaits en octets de la page 437 (et de ses correspondances à elle).
    taches.push(lireIndispensable(index.textes).then(async (json) => {
      const langues = languesDuManifeste(JSON.parse(texte(json)), signaler);
      await Promise.all(langues.map(async (l) => {
        const groupes = JSON.parse(texte(await lireIndispensable(l.fichier)));
        fichiers.set(`GAME/DATA/LANG${l.emplacement}-0.DAT`, encoderTextes(signesEnTextes(groupes, { caracteres: l.caracteres, signaler, fichier: l.fichier })));
      }));
    }));
  } else {
    // (des assets d'avant le manifeste : { LANGn-0: fichier }, les textes en chaînes binaires)
    for (const [nom, fichier] of Object.entries(index.textes || {})) {
      taches.push(lireIndispensable(fichier).then((json) => fichiers.set(`GAME/DATA/${nom}.DAT`, encoderTextes(JSON.parse(texte(json))))));
    }
  }
  // Les banques des polices (MFONT-0), refaites des planches des polices (polices.js).
  if (index.polices) {
    taches.push(policesComposees(index, lireAsset, { inflate, signaler }).then((polices) => {
      for (const [nom, b] of polices.banques) {
        fichiers.set(`GAME/DATA/${nom}.DAT`, b.dat);
        fichiers.set(`GAME/DATA/${nom}.TAB`, b.tab);
      }
    }));
  }
  for (const [chemin, d] of Object.entries(index.donnees || {})) {
    const lecteur = paresseux && paresseux(d.fichier, d.taille);
    if (lecteur) fichiers.set(chemin, lecteur);
    else taches.push(lireIndispensable(d.fichier).then((octets) => fichiers.set(chemin, octets)));
  }
  // les bibliothèques de pilotes de HMI, en fichiers virtuels (pilotes-hmi.js)
  if (index.pilotes) {
    taches.push(lireIndispensable(index.pilotes).then((json) => {
      const pilotes = JSON.parse(texte(json));
      for (const c of PILOTES) if (pilotes[c]) fichiers.set(c, fabriquerLePilote(pilotes[c]));
    }));
  }
  await Promise.all(taches);
  return fichiers;
}

// Les polices refaites de leurs planches (polices.js), une fois par lecteur d'assets : la banque
// MFONT-0 (composerLesFichiers) et les zones du programme (composerLeProgramme) en viennent toutes deux.
const polices = new WeakMap();
function policesComposees(index, lireAsset, { inflate = inflateDeSecours, signaler = null } = {}) {
  if (!polices.has(lireAsset)) {
    polices.set(lireAsset, Promise.resolve(lireAsset(index.polices)).then((json) => (
      composerLesPolices(JSON.parse(new TextDecoder().decode(json)), lireAsset, { inflate, signaler }))));
  }
  return polices.get(lireAsset);
}

// Un chemin relatif à un dossier des assets (« programme/ » + « ../images/polices/petite.json »),
// ramené à un chemin des assets (« images/polices/petite.json »).
function cheminDesAssets(dossier, relatif) {
  const parties = [];
  for (const p of (dossier + relatif).split('/')) {
    if (p === '..') parties.pop(); else if (p !== '.' && p !== '') parties.push(p);
  }
  return parties.join('/');
}

// Le fichier programme.bin (le format d'ecrireLImage, que lit lireLImage) du programme (`partie` :
// 'programme') ou de l'introduction ('introduction'), refait des tables lisibles
// (tables-du-programme.js) et des planches des polices (polices.js : les zones du manifeste dont le
// fichier sort de programme/) ; null si les assets n'ont pas cette partie. Des assets d'avant les
// tables (index.programme.fichier : le .bin lui-même) sont lus tels quels. `options` : { inflate (le
// zlib des PNG des polices ; inflate.js par défaut), signaler (le mode souple, voir composerLesFichiers) }.
export async function composerLeProgramme(index, lireAsset, partie = 'programme', options = {}) {
  const p = index[partie];
  if (!p) return null;
  if (p.fichier) return lireAsset(p.fichier);
  const texte = (o) => new TextDecoder().decode(o);
  const manifeste = JSON.parse(texte(await lireAsset(p.manifeste)));
  const dossier = p.manifeste.slice(0, p.manifeste.lastIndexOf('/') + 1);
  const externe = async (fichier, zone) => {
    if (!index.polices) throw new Error(`${partie} : la zone ${zone.nom} est faite par ${fichier}, mais les assets n'ont pas de polices`);
    const chemin = cheminDesAssets(dossier, fichier);
    const zones = (await policesComposees(index, lireAsset, options)).programme.get(chemin);
    const z = zones && zones.find((x) => x.adresse <= zone.adresse && zone.adresse + zone.taille <= x.adresse + x.octets.length);
    if (!z) throw new Error(`${partie} : ${chemin} ne fait pas la zone ${zone.nom}`);
    return z.octets.subarray(zone.adresse - z.adresse, zone.adresse - z.adresse + zone.taille);
  };
  const image = await composerLImage(manifeste, partie, async (f) => texte(await lireAsset(dossier + f)), externe);
  if (image.source !== p.source) throw new Error(`${partie} : les tables ne sont pas celles de l'index`);
  return ecrireLImage(image);
}

// Les fichiers des assets dont une partie des tables du programme est faite, pour qui les emporte
// (construire-fichier.mjs) : le manifeste, et les fichiers de ses zones (et de celles de sa base).
export async function fichiersDuProgramme(index, lireAsset, partie = 'programme') {
  const p = index[partie];
  if (!p) return [];
  if (p.fichier) return [p.fichier];
  const manifeste = JSON.parse(new TextDecoder().decode(await lireAsset(p.manifeste)));
  const dossier = p.manifeste.slice(0, p.manifeste.lastIndexOf('/') + 1);
  const fichiers = new Set([p.manifeste]);
  let avecPolices = false;
  for (const q of [manifeste[partie], manifeste[manifeste[partie].base]].filter(Boolean)) {
    for (const z of q.zones) {
      if (!z.fichier) continue;
      if (estExterne(z.fichier)) avecPolices = true; else fichiers.add(dossier + z.fichier);
    }
  }
  // (les zones faites par les polices : leur manifeste, leurs tables et leurs planches)
  if (avecPolices && index.polices) {
    for (const f of fichiersDesPolices(JSON.parse(new TextDecoder().decode(await lireAsset(index.polices))))) fichiers.add(f);
  }
  return [...fichiers];
}

// Les octets d'un bruitage pour sa banque (b : { bits, frequence }), en mode souple : le WAV tel quel
// s'il en a le format ; sinon ramené à une voie, à la fréquence de la banque (interpolation linéaire)
// et à ses bits (8 bits non signés, 16 bits signés) ; un silence de 10 ms s'il manque ou ne se lit pas.
function pcmPourLaBanque(wav, b, fichier, signaler) {
  const octetsParEchantillon = b.bits / 8;
  const silence = () => {
    const pcm = new Uint8Array(Math.round(b.frequence / 100) * octetsParEchantillon);
    if (b.bits === 8) pcm.fill(0x80);
    return pcm;
  };
  if (!wav) return silence();
  let lu;
  try { lu = lireUnWav(wav); } catch (err) { signaler(`${fichier} : ${err.message} ; remplacé par un silence`); return silence(); }
  if (lu.voies === 1 && lu.bits === b.bits && lu.frequence === b.frequence && !lu.flottant) return lu.pcm;
  signaler(`${fichier} : ${lu.voies} voie(s), ${lu.frequence} Hz, ${lu.bits} bits${lu.flottant ? ' flottants' : ''} ; `
    + `ramené au format de sa banque (1 voie, ${b.frequence} Hz, ${b.bits} bits)`);
  // les échantillons, en [-1, 1], moyenne des voies
  const dv = new DataView(lu.pcm.buffer, lu.pcm.byteOffset, lu.pcm.byteLength);
  const pas = lu.bits / 8, cadre = pas * lu.voies, nombre = Math.floor(lu.pcm.length / cadre);
  const lire = (o) => {
    if (lu.flottant) return lu.bits === 64 ? dv.getFloat64(o, true) : dv.getFloat32(o, true);
    if (lu.bits === 8) return (lu.pcm[o] - 128) / 128;
    if (lu.bits === 16) return dv.getInt16(o, true) / 32768;
    if (lu.bits === 24) return ((lu.pcm[o] | (lu.pcm[o + 1] << 8) | (lu.pcm[o + 2] << 16)) << 8 >> 8) / 8388608;
    return dv.getInt32(o, true) / 2147483648;
  };
  const mono = new Float32Array(nombre);
  for (let k = 0; k < nombre; k++) {
    let s = 0;
    for (let c = 0; c < lu.voies; c++) s += lire(k * cadre + c * pas);
    mono[k] = s / lu.voies;
  }
  if (!nombre) return silence();
  const n = Math.max(1, Math.round(nombre * b.frequence / lu.frequence));
  const pcm = new Uint8Array(n * octetsParEchantillon);
  const sortie = new DataView(pcm.buffer);
  for (let k = 0; k < n; k++) {
    const x = k * lu.frequence / b.frequence, i = Math.floor(x), f = x - i;
    const a = mono[Math.min(i, nombre - 1)], c = mono[Math.min(i + 1, nombre - 1)];
    const s = Math.max(-1, Math.min(1, a + (c - a) * f));
    if (b.bits === 8) pcm[k] = Math.round(s * 127) + 128;
    else sortie.setInt16(2 * k, Math.round(s * 32767), true);
  }
  return pcm;
}

// Un WAV quelconque (PCM entier de 8 à 32 bits, ou flottant ; une voie ou plus) : { pcm, voies,
// frequence, bits, flottant }. (lireWav, de formats-du-cd.js, n'accepte que la forme des assets.)
function lireUnWav(wav) {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  const texte = (o, n) => String.fromCharCode(...wav.subarray(o, o + n));
  if (wav.length < 12 || texte(0, 4) !== 'RIFF' || texte(8, 4) !== 'WAVE') throw new Error("ce n'est pas un fichier WAV");
  let format = 0, voies = 0, frequence = 0, bits = 0, pcm = null;
  for (let o = 12; o + 8 <= wav.length;) {
    const genre = texte(o, 4), taille = dv.getUint32(o + 4, true);
    if (genre === 'fmt ') {
      format = dv.getUint16(o + 8, true);
      voies = dv.getUint16(o + 10, true);
      frequence = dv.getUint32(o + 12, true);
      bits = dv.getUint16(o + 22, true);
      // (WAVE_FORMAT_EXTENSIBLE : le vrai format est au début du sous-format)
      if (format === 0xFFFE && taille >= 26) format = dv.getUint16(o + 32, true);
    } else if (genre === 'data') {
      pcm = wav.subarray(o + 8, Math.min(wav.length, o + 8 + taille));
    }
    o += 8 + taille + (taille & 1);
  }
  if (!pcm || !voies || !frequence) throw new Error('WAV incomplet');
  if (format === 1 && [8, 16, 24, 32].includes(bits)) return { pcm, voies, frequence, bits, flottant: false };
  if (format === 3 && (bits === 32 || bits === 64)) return { pcm, voies, frequence, bits, flottant: true };
  throw new Error(`WAV d'un format non géré (format ${format}, ${bits} bits) : du PCM est attendu`);
}
