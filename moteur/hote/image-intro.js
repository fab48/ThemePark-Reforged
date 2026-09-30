// L'image de l'introduction : les données d'INTRO.EXE posées dans la disposition mémoire de MAIN.EXE.
//
// L'introduction est un second programme, INTRO.EXE, que le lanceur d'origine (THEME.BAT) exécutait
// avant le jeu. 467 de ses 497 fonctions sont celles de MAIN.EXE — la bibliothèque de Watcom, HMI SOS,
// la couche de son de Bullfrog —, à d'autres adresses. Transporté dans la disposition de MAIN.EXE, il
// tourne avec le code lisible du jeu, qui vise ces adresses-là, plus ses 30 fonctions propres
// (moteur/jeu/intro.js). La carte (moteur/hote/intro-carte.js, tirée des deux programmes par
// outils/intro.py) dit où va chaque octet de ses données :
//
//  - les données partagées (celles de la bibliothèque, à décalage constant par module objet) prennent
//    la place des variables jumelles de MAIN.EXE, avec les valeurs de départ d'INTRO.EXE ;
//  - les données propres (ses textes, son script, ses variables : 2 Ko) sont posées à la place du code
//    de MAIN.EXE, entre ses îles (image-programme.js), que le moteur autonome n'emploie pas ;
//  - les pointeurs logés dans ces données sont traduits de même (vers les données, ou vers les
//    fonctions, transportées) ;
//  - les tables bornées de Watcom (routines d'initialisation et de fin) sont complétées d'entrées
//    déjà faites, là où MAIN.EXE en a davantage.
//
// Le reste est l'image du programme (image-programme.js) : les îles du code de MAIN.EXE, que les
// fonctions partagées lisent (les chiffres d'itoa...), et les données propres au jeu, que
// l'introduction ne touche pas. Le résultat a le format de programme.bin (ecrireLImage) ; les assets
// du jeu en gardent, en tables lisibles, ce qui diffère de l'image du programme (tables-du-programme.js).

import { chargerLE } from './le.js';
import { empreinte } from './image-programme.js';
import { EDITION_INTRO, ENTREE, PILE, BLOCS, PROPRES, DECALEES, BORNES, TABLES_BORNEES, POINTEURS_DE_CODE } from './intro-carte.js';

const CODE_D_INTRO = [0x10000, 0x26742];
const DONNEES_DE_MAIN = [0xB0000, 0xE2340];
const VARIABLES_DE_MAIN = [0xE3000, 0xE3110];

// L'adresse, dans la disposition de MAIN.EXE, d'un octet des données d'INTRO.EXE ; null hors de la
// carte (la pile d'INTRO, que l'introduction transportée prend à MAIN).
export function destinationDansMain(a) {
  for (const [bas, haut, d] of BLOCS) if (a >= bas && a < haut) return (a + d) >>> 0;
  for (const [debut, fin, place] of PROPRES) if (a >= debut && a < fin) return (place + (a - debut)) >>> 0;
  return null;
}

// Un pointeur d'INTRO.EXE (une valeur relogée), traduit : vers une fonction, par la carte des
// pointeurs de code ; vers les données, par les blocs (sa fin comprise : la borne d'un tableau) ; la
// fin d'une table bornée de Watcom, par celle de MAIN.EXE.
function traduirePointeur(v) {
  if (v >= CODE_D_INTRO[0] && v < CODE_D_INTRO[1]) {
    const t = POINTEURS_DE_CODE.get(v);
    if (t === undefined) throw new Error(`pointeur de code 0x${v.toString(16)} hors de la carte`);
    return t;
  }
  if (BORNES.has(v)) return BORNES.get(v);
  const d = destinationDansMain(v);
  if (d !== null) return d;
  for (const [bas, haut, dd] of BLOCS) if (v === haut) return (v + dd) >>> 0;
  for (const [debut, fin, place] of PROPRES) if (v === fin) return (place + (v - debut)) >>> 0;
  throw new Error(`pointeur de données 0x${v.toString(16)} hors de la carte`);
}

// exeIntro : les octets d'INTRO.EXE ; imageDuProgramme : celle de MAIN.EXE (lireLImage). Rend une
// image au format de programme.bin : { pointEntree, pileInitiale, source (empreinte d'INTRO.EXE), blocs }.
export async function extraireLImageDeLIntro(exeIntro, imageDuProgramme) {
  const octets = exeIntro instanceof Uint8Array ? exeIntro : new Uint8Array(exeIntro);
  const source = await empreinte(octets);
  if (octets.length !== EDITION_INTRO.taille || source !== EDITION_INTRO.sha256) {
    throw new Error(`INTRO.EXE n'est pas celui du CD de 1994 (${octets.length} octets, empreinte ${source.slice(0, 16)}…)`);
  }
  // INTRO.EXE chargé à part, ses relocations notées
  const intro = new Uint8Array(0x100000);
  const relocations = [];
  chargerLE(octets, intro, undefined, (s, v) => relocations.push([s, v]));
  // l'image du programme, où les données d'INTRO.EXE viennent se poser
  const m8 = new Uint8Array(0x100000);
  for (const b of imageDuProgramme.blocs) m8.set(b.octets, b.adresse);
  const dv = new DataView(m8.buffer);
  for (const [bas, haut, d] of BLOCS) m8.set(intro.subarray(bas, haut), bas + d);
  for (const [debut, fin, place] of PROPRES) m8.set(intro.subarray(debut, fin), place);
  for (const [s, v] of relocations) {
    if (s >= CODE_D_INTRO[0] && s < CODE_D_INTRO[1]) continue;       // le code : pas repris
    const d = destinationDansMain(s);
    if (d === null) continue;
    dv.setUint32(d, DECALEES.has(s) ? (v + DECALEES.get(s)) >>> 0 : traduirePointeur(v), true);
  }
  for (const { debut, fin, entree } of TABLES_BORNEES) {
    for (let a = debut; a + entree.length <= fin; a += entree.length) m8.set(entree, a);
  }
  // les blocs : les îles du programme, ses données et ses variables entières, les données propres
  const blocs = [];
  const zone = (debut, fin) => blocs.push({ adresse: debut, octets: m8.slice(debut, fin) });
  for (const b of imageDuProgramme.blocs) {
    if (b.adresse >= DONNEES_DE_MAIN[0] && b.adresse < DONNEES_DE_MAIN[1]) continue;
    zone(b.adresse, b.adresse + b.octets.length);
  }
  zone(DONNEES_DE_MAIN[0], DONNEES_DE_MAIN[1]);
  zone(VARIABLES_DE_MAIN[0], VARIABLES_DE_MAIN[1]);
  const debutPropres = Math.min(...PROPRES.map(([, , place]) => place));
  const finPropres = Math.max(...PROPRES.map(([debut, fin, place]) => place + (fin - debut)));
  zone(debutPropres, finPropres);
  return { pointEntree: ENTREE, pileInitiale: PILE, source, blocs };
}
