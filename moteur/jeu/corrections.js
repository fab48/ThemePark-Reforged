// Les corrections (reglages.js) : des défauts du jeu de 1994, corrigés seulement quand le joueur le
// demande. Éteintes, ces fonctions ne font rien, et le jeu reste celui d'origine.
//
// Ce module tient la correction des déplacements du personnel (bogue 4, retours 59 et 63,
// docs/demandes.md), appelée par chaque routine qui arme le décompte d'une case : personnel.js,
// entretien.js, voyous.js, negociations.js et simulation.js ; pour l'employé qui contourne un obstacle,
// par le chemin de la tournée (entretien.js) et celui de tout le parc (simulation-outils.js) ; et pour
// l'agent d'entretien qui tire sa sortie au hasard (personnel.js). La correction des éjections (bogue 5) est à sa place, dans
// 0x65D25 (visiteurs-etats-b.js). Et celle du retour des visiteurs (retour 62), appelée par le visiteur
// qui s'en va (0x22BA6, visiteurs-outils.js). Et celle des ponts (retour 75), appelée par l'effacement
// d'une case d'eau (0x2C2EC, outils.js). Et celle du cadrage sur un objet (retour 76), appelée par les
// deux routines qui amènent la vue sur un objet (construire.js, ecrans-gestion.js).

import { reglages } from './reglages.js';
import { ADRESSES } from './etat.js';
import { largeurDeLaVue, hauteurDeLaVue, bordDuDessin } from './grande-vue.js';

const MODE_AFFICHAGE = 0xDE5F6;         // mot : bit 0 posé en 320x200

const PERSONNEL = 8;   // le type d'objet des employés
const TYPE = 4, X = 6, Y = 8, VITESSE = 0x13;
const MILIEU = 0x80;

// Un employé marche d'une case à la suivante en 256 / vitesse pas (tronqué), de `vitesse` 256es de
// case chacun. Quand la vitesse divise 256 (16, 32, 64, 128), il parcourt exactement 256 : parti du
// milieu d'une case (position fine 0x80), il arrive au milieu de la suivante, où il décide de la
// suite. Sinon, il parcourt moins : 10 pas de 24 font 240, 6 de 40 aussi, 4 de 56 font 224. Il
// décide alors à côté du milieu, et l'écart s'ajoute de case en case, jusqu'à ce qu'il passe dans
// une autre case que celle qu'il visait. La formation du personnel (recherche, +8 à la vitesse d'un
// métier, 0x54908) donne ces vitesses : les agents d'entretien en tournée tournent alors en carré
// (état 0x30), les mécaniciens errent (état 0xA).
//
// La correction : quand il arme le décompte d'une nouvelle case, c'est-à-dire quand le précédent a
// expiré et qu'il est arrivé, l'employé est posé au milieu de la case où il se trouve. Les
// vitesses ne changent pas (le jeu les lit ailleurs : écrans, salaires, recherche). Pour toute
// vitesse de 1 à 255, 256 / vitesse pas avancent de plus de 128 : l'employé est déjà dans la case
// visée, et le recalage ne l'en fait pas sortir.
//
// Seulement aux vitesses qui ne divisent pas 256. Aux autres, le jeu d'origine laisse lui aussi des
// employés à un pas du milieu (0x70 ou 0x90 sur un axe : 14 fois dans simulation.json, des agents
// d'entretien dans l'état 0x18, des mécaniciens dans l'état 0xA), mais l'écart y reste constant et
// ne gêne pas : la correction n'y touche pas, et une partie où aucun métier n'a été formé reste
// celle de l'original, réglage allumé ou non.
//
// La position change dans la même case : la liste des objets de la case reste la bonne ; son ordre
// par profondeur (octet +8, 0x1864A) est refait au pas suivant du mécanicien, seul à le tenir.
// `recalages` : le compte des recalages, et une sonde facultative (travail/bogues/sonde-corrections.mjs).
export const recalages = { nombre: 0, sonde: null };

export function recalerAuMilieuDeLaCase(jeu, o) {
  if (!reglages.corrigerLesDeplacementsDuPersonnel) return;
  if (jeu.m8[o + TYPE] !== PERSONNEL) return;
  const vitesse = jeu.m8[o + VITESSE];
  if (vitesse === 0 || 256 % vitesse === 0) return;
  if (jeu.m8[o + X] === MILIEU && jeu.m8[o + Y] === MILIEU) return;
  if (recalages.sonde) recalages.sonde(jeu, o);
  jeu.m8[o + X] = MILIEU;
  jeu.m8[o + Y] = MILIEU;
  recalages.nombre++;
}

// Le mécanicien qui erre après une réparation (0x33F14, simulation.js) tire des cibles au hasard
// autour de lui tant que son chercheur de chemin (0x349EB) n'en trouve aucune accessible. Enfermé,
// il tire sans fin, et le jeu se fige : c'est arrivé sur la partie de Fabien, les vitesses à 24, la
// correction précédente allumée (un mécanicien sorti de la réparation vers le haut, à travers les
// clôtures, jusqu'à une case d'herbe enclose où en attendait déjà un autre). Le jeu d'origine peut
// s'y figer de même ; la correction l'y a seulement mené. Allumée, il renonce après 256 tirages
// (16 x 16 cibles possibles) et attend sur place la prochaine panne.
const TIRAGES_AVANT_DE_RENONCER = 256;
export const renoncements = { nombre: 0 };

export function renoncerAErrer(essais) {
  if (!reglages.corrigerLesDeplacementsDuPersonnel || essais < TIRAGES_AVANT_DE_RENONCER) return false;
  renoncements.nombre++;
  return true;
}

// L'agent d'entretien qui suit sa tournée contourne un obstacle en le longeant (0x63E5D, entretien.js) :
// deux éclaireurs, main gauche et main droite, ont trouvé une case de reprise au-delà de l'obstacle, et
// l'agent longe le même côté, case après case, jusqu'à marcher sur elle. Le jeu d'origine ne vérifie
// jamais qu'il y arrive. Dévié du trajet de l'éclaireur, il longe un autre pâté, dont le tour ne passe
// pas par la case de reprise : il en fait le tour sans fin. La formation du personnel l'y envoie :
// elle change la vitesse de chaque employé au milieu d'une case, le décompte restant fait pour
// l'ancienne, et un agent parti à 16 pour une case en fait jusqu'à quatre à 80 (+64 en un mois, la
// recherche du personnel à fond), sans s'arrêter aux cases où il devait tourner. Vu sur la partie de
// Fabien (retour 59 de docs/demandes.md), la correction précédente allumée ou non. Les toilettes (il en
// revient tourné vers l'allée) et la grève (il reprend depuis l'entrée du parc) le dévient aussi.
//
// Le chercheur de chemin de tout le parc (0x349EB, simulation-outils.js) longe de même, sur les mêmes
// drapeaux (+5) et la même case (+0x71) : il a en plus une sortie, là où l'obstacle s'arrête, mais
// autour d'un pâté elle ne vient jamais. L'agent qui part en grève en pleine tournée y garde son
// contournement, qui ne mène pas à l'entrée du parc : vu tourner autour d'une case au lieu d'y aller.
// Le mécanicien formé pendant qu'il longe l'obstacle qui le sépare d'une attraction, de même.
//
// La correction : tant qu'il longe, l'employé regarde s'il sortira du contournement en continuant
// ainsi, sur les `limite` pas qu'avaient les éclaireurs (ou suiveurs) ; sinon il cesse de longer et
// refait son plan d'où il est, par ceux du jeu. Jamais dévié, il en sort toujours dans ces pas-là (il
// suit pas à pas le trajet de l'éclaireur, plus court que `limite`) : rien ne change.
// `repriseEnVue` : une fonction, appelée seulement si le réglage est allumé.
export const abandons = { nombre: 0 };

export function cesserDeLongerSansIssue(repriseEnVue) {
  if (!reglages.corrigerLesDeplacementsDuPersonnel || repriseEnVue()) return false;
  abandons.nombre++;
  return true;
}

// L'agent d'entretien sans tournée et sans déchet en vue tire au hasard la sortie d'un carrefour (0x62FEA,
// choisirUneSortie de personnel.js) : le hasard modulo l'ensemble des sorties (un nombre de 3 à 15),
// pris comme masque s'il en garde au moins une, puis une table (0xB4970) qui ramène un ensemble à une
// direction. Le tirage est biaisé : entre le haut et le bas, le haut 80 % du temps ; entre la droite et
// la gauche, la droite 80 % ; entre le haut et la gauche, le haut 89 % ; et à deux carrefours en T la
// table fait faire demi-tour (haut-droite-gauche donne le bas, droite-bas-gauche le haut). Les agents
// sans tournée dérivent vers le haut et la droite du parc, et y restent : sur la partie de Fabien, 92 à
// 97 % de leur temps dans la moitié haute et 98 % dans la moitié droite ; le reste du parc n'est plus
// balayé (retour 63 de docs/demandes.md).
//
// La correction : le même tirage, un seul appel au hasard comme l'original, réparti également entre les
// sorties. Rend la direction, ou null si le réglage est éteint.
export const tiragesEgaux = { nombre: 0 };

export function sortieTireeEgalement(hasard, sorties) {
  if (!reglages.corrigerLesDeplacementsDuPersonnel) return null;
  const directions = [0, 1, 2, 3].filter((d) => sorties & (1 << d));
  tiragesEgaux.nombre++;
  return directions[hasard % directions.length];
}

// ======================================================================================================
// Le retour des visiteurs (réglage corrigerLeRetourDesVisiteurs ; retour 62 de docs/demandes.md).
//
// Le visiteur qui s'en va (état 0x40, 0x22BA6, visiteurs-outils.js) vise la case du portique, et à
// chaque case il demande sa direction au chercheur de chemin de tout le parc (0x349EB, masque 0x29CD :
// murs, attractions, files, eau, lacs...) : il coupe au plus droit, à travers l'herbe, et longe ce qui
// le gêne. Trois défauts l'arrêtent, vus dans la partie de Fabien, où une rivière, un canal de bouées
// et un lac barrent le parc devant le portique :
//   - la sonde, qui traverse l'obstacle pour savoir où il finit, en ressort dans une case enclavée
//     (l'entrée d'une attraction, entre sa file et l'attraction) ; les deux éclaireurs qui longent
//     l'obstacle ne l'atteignent jamais, et au bout de 150 pas le jeu déclare le portique inaccessible,
//     quand un chemin existe (aux sorties des attractions au nord de la rivière) ;
//   - enfermé là où l'on ne sort qu'en traversant une file (le quai d'un canal de bouées, entre sa file,
//     un mur et l'eau), le visiteur est sans chemin (état 0x20) ; 0x2276C, qui cherche toutes les 50
//     mises à jour un chemin en traversant files et attractions (masque 0x29C1), le trouve et le remet
//     en marche (état 6) ; mais l'état 6 cherche sans les traverser, échoue, le renvoie vers la sortie
//     (0x22834), qui échoue de même : il ne bouge plus ;
//   - celui qui garde de l'état 6 un contournement commencé pour une autre case (drapeaux 0x30 de +5,
//     case de reprise +0x71) le poursuit sans fin : il fait le tour de l'eau et de ce qui la borde.
// Sans chemin, le visiteur attend sur place, son contentement ramené au seuil des mécontents : 71 dans
// la partie de Fabien (FAB.GY du 28 septembre), plantés depuis des mois. La transcription seule fait de
// même : c'est le jeu de 1994.
//
// La correction : le visiteur qui s'en va prend un plus court chemin vers sa case visée (+0x56, +0x57),
// sur les cases que le jeu lui ouvre (praticables pour le masque 0x29CD, ou une allée, comme dans
// 0x349EB) ; s'il n'y en a pas, sur celles que 0x2276C lui ouvre (0x29C1 : il traverse la file ou
// l'attraction qui l'enferme). Entre les directions d'un plus court chemin, il prend d'abord celle du
// jeu d'origine, sur l'axe de l'écart le plus grand : en terrain dégagé, rien ne change ; un obstacle
// sur la route, il le contourne par le plus court, et chaque pas le rapproche du portique. Enfermé de
// toutes parts, ou sur la case visée, le jeu d'origine décide (sans chemin ; l'arrivée, qui efface le
// contournement). Le visiteur guidé oublie son contournement (bits 0x30 de +5), que le jeu reprendrait
// ensuite, périmé.
//
// Les distances à la case visée sont calculées une fois par pas de simulation, pour tous les partants
// (ils visent tous le portique). `retours` : le compte des directions données, par les files et
// attractions (0x29C1) ou non, et des visiteurs laissés au jeu faute de chemin.
const CARTE = 0xD3B08;                  // pointeur : 64 × 64 cellules de 4 octets, +2 l'image du sol
const SOLS = 0xB44D9;                   // 4 octets par image de sol : le mot +0, ses drapeaux
const ALLEE = 2;                        // drapeau de sol : une allée, toujours praticable (0x349EB)
const PAS_DE_SIMULATION = 0xD3AFC;
const MASQUE_DU_RETOUR = 0x29CD;        // les obstacles de 0x22BA6
const MASQUE_DES_SANS_CHEMIN = 0x29C1;  // ceux de 0x2276C : ni les attractions (4) ni les files (8)
const CONTOURNE = 0x30;                 // octet +5 : l'obstacle longé à main gauche (0x10) ou droite (0x20)
const HAUT = 0, DROITE = 1, BAS = 2, GAUCHE = 3;
const PAS_DES_DIRECTIONS = [-64, 1, 64, -1];   // de cellule en cellule (table 0xB4920)

export const retours = { guides: 0, parLesFiles: 0, enfermes: 0 };

// La case voisine dans une direction, ou −1 hors de la carte (le jeu ne le vérifie pas : la clôture du
// parc l'en garde).
function voisine(k, direction) {
  if ((direction === DROITE && (k & 63) === 63) || (direction === GAUCHE && (k & 63) === 0)) return -1;
  const n = k + PAS_DES_DIRECTIONS[direction];
  return n >= 0 && n < 4096 ? n : -1;
}

// Les distances, en cases, de chaque case à la case visée, par un parcours en largeur ; −1 pour une case
// d'où on ne l'atteint pas, ou qui n'est pas praticable. Gardées le temps d'un pas, pour une partie (sa
// mémoire : deux parties peuvent tourner dans le même programme).
const distancesDuPas = { memoire: null, pas: -1, carte: 0, champs: new Map() };

function distancesA(jeu, cible, masque) {
  const carte = jeu.dv.getUint32(CARTE, true), pas = jeu.dv.getUint32(PAS_DE_SIMULATION, true);
  if (distancesDuPas.memoire !== jeu.m8 || distancesDuPas.pas !== pas || distancesDuPas.carte !== carte) {
    distancesDuPas.memoire = jeu.m8;
    distancesDuPas.pas = pas;
    distancesDuPas.carte = carte;
    distancesDuPas.champs.clear();
  }
  const cle = cible * 0x10000 + masque;
  let distances = distancesDuPas.champs.get(cle);
  if (distances) return distances;
  distances = new Int16Array(4096).fill(-1);
  const file = new Int16Array(4096);
  distances[cible] = 0;
  file[0] = cible;
  for (let lu = 0, ecrit = 1; lu < ecrit; lu++) {
    const k = file[lu];
    for (let direction = 0; direction < 4; direction++) {
      const n = voisine(k, direction);
      if (n < 0 || distances[n] >= 0) continue;
      const drapeaux = jeu.dv.getUint16(SOLS + jeu.m8[carte + n * 4 + 2] * 4, true);
      if ((drapeaux & masque) !== 0 && (drapeaux & ALLEE) === 0) continue;
      distances[n] = distances[k] + 1;
      file[ecrit++] = n;
    }
  }
  distancesDuPas.champs.set(cle, distances);
  return distances;
}

// La direction d'un plus court chemin depuis la case `ici`, ou −1 : vers la voisine la plus proche de
// la case visée ; entre plusieurs, la direction du jeu (l'axe de l'écart le plus grand, celui des
// rangées à égalité), l'autre axe, la direction courante, puis la première.
function directionLaPlusCourte(distances, ici, dx, dy, courante) {
  let plusProche = -1;
  for (let direction = 0; direction < 4; direction++) {
    const n = voisine(ici, direction);
    if (n >= 0 && distances[n] >= 0 && (plusProche < 0 || distances[n] < plusProche)) plusProche = distances[n];
  }
  if (plusProche < 0) return -1;
  const colonnes = dx === 0 ? -1 : dx > 0 ? GAUCHE : DROITE;
  const rangees = dy === 0 ? -1 : dy > 0 ? HAUT : BAS;
  const ordre = Math.abs(dx) > Math.abs(dy) ? [colonnes, rangees] : [rangees, colonnes];
  for (const direction of [...ordre, courante, HAUT, DROITE, BAS, GAUCHE]) {
    if (direction < 0) continue;
    const n = voisine(ici, direction);
    if (n >= 0 && distances[n] === plusProche) return direction;
  }
  return -1;
}

// Appelée par 0x22BA6 au lieu de 0x349EB : la direction du visiteur `v` (0 à 3), ou null — réglage
// éteint, visiteur sur sa case visée ou enfermé — pour que le jeu d'origine décide.
export function directionDuRetour(jeu, v) {
  if (!reglages.corrigerLeRetourDesVisiteurs) return null;
  const colonne = jeu.m8[v + 7], rangee = jeu.m8[v + 9];
  const colonneVisee = jeu.m8[v + 0x56], rangeeVisee = jeu.m8[v + 0x57];
  if (colonne === colonneVisee && rangee === rangeeVisee) return null;
  const ici = rangee * 64 + colonne, cible = rangeeVisee * 64 + colonneVisee;
  for (const masque of [MASQUE_DU_RETOUR, MASQUE_DES_SANS_CHEMIN]) {
    const direction = directionLaPlusCourte(distancesA(jeu, cible, masque), ici,
      colonne - colonneVisee, rangee - rangeeVisee, jeu.m8[v + 0x12]);
    if (direction < 0) continue;
    jeu.m8[v + 5] &= ~CONTOURNE;
    retours.guides++;
    if (masque === MASQUE_DES_SANS_CHEMIN) retours.parLesFiles++;
    return direction;
  }
  retours.enfermes++;
  return null;
}

// ======================================================================================================
// Les ponts (réglage corrigerLesPonts ; retour 75 de docs/demandes.md).
//
// Une allée (ou une file) posée sur une rivière droite, ou une rivière passée sous une allée droite,
// devient un pont : une image de la famille des allées (0x65, 0x66 ; 0x84, 0x85 pour les files) marquée
// 0x42 (0x48), allée et eau à la fois. Son numéro de forme, 0x10 ou 0x11, sert deux tables : celle des
// allées (0xB4990, les sorties des visiteurs : 0xA ou 5, le chemin) et celle de l'eau (0xB49C1 : 5 ou
// 0xA, la rivière en travers). Le raccord des allées (0x28D5A) ne touche jamais un pont, et la pose d'une
// rivière (0x29340) ne change pas une voisine qui en est un.
//
// Mais effacer une case de rivière (0x2C2EC, par 0x205D7 : le bouton droit, ou un mur, une attraction,
// une allée… posés dessus) retire la sortie qui y menait aux deux cases que touchent ses bouts, si elles
// sont de l'eau : leur forme est refaite d'après leurs sorties d'eau (0xB49C1) moins celle-là, et la case
// garde sa famille (image − ancienne forme + nouvelle). Un pont y passe comme une case de rivière : le
// pont nord-sud 0x66 (forme 0x11, l'eau est-ouest) dont on efface l'eau à l'est prend la forme 7 (l'eau
// n'allant plus qu'à l'ouest), soit l'image 0x5C, une allée ordinaire dont les sorties sont est, sud et
// ouest : une route en T tournée vers l'herbe de la case effacée et vers l'eau, sans plus d'eau dessous,
// et qui a perdu la branche nord du chemin. Les visiteurs la suivent. Sous Node (DEMO, un chemin
// colonne 36 et une rivière rangée 13, la case (37,13) effacée ; travail/bogues/pont/repro.mjs), 20
// visiteurs amenés sous le pont : 16 passent dans l'herbe effacée, 14 dans l'eau, en 90 s. Les quatre
// cas sont des T, une branche vers l'herbe, une vers l'eau, une du chemin : 0x66 donne 0x5D (nord, est,
// ouest) si l'on efface l'eau à l'ouest ; le pont est-ouest 0x65, 0x5E (nord, est, sud) au nord effacé,
// 0x5F (nord, sud, ouest) au sud. Les ponts de file (0x84, 0x85) deviennent de même une file tordue.
// L'image reste fausse jusqu'à ce qu'une allée voisine soit posée ou ôtée (ce n'est plus un pont :
// 0x28D5A la refait alors d'après ses voisines).
//
// La correction : la voisine qui est un pont (eau et allée, ou eau et file) est laissée telle quelle,
// comme la pose d'une rivière la laisse. Le pont reste un pont, le chemin droit ; la rivière s'arrête à
// son bord. Rend vrai s'il faut laisser la case voisine ; éteinte, jamais.
const EAU = 0x40, ALLEE_OU_FILE = 2 | 8;
export const pontsGardes = { nombre: 0 };

export function garderLePont(drapeauxDeLaVoisine) {
  if (!reglages.corrigerLesPonts) return false;
  if ((drapeauxDeLaVoisine & EAU) === 0 || (drapeauxDeLaVoisine & ALLEE_OU_FILE) === 0) return false;
  pontsGardes.nombre++;
  return true;
}

// ======================================================================================================
// Le cadrage sur un objet (réglage corrigerLeCadrageSurUnObjet ; retour 76 de docs/demandes.md).
//
// Amener la vue sur un employé (les icônes du personnel au coin haut droit, 0x15FBD ; le bouton de sa
// fiche, zone 18 : construire.js, centrerLaVueSur) ou sur l'objet d'une liste ou d'une fiche
// d'attraction (0x0E, ecrans-gestion.js, centrerSurLObjet) pose la caméra à la case de l'objet moins la
// moitié des colonnes et des rangées que montre l'écran : C = c − ⌊W / L⌋ / 2, R = r − ⌈H / Ht⌉ / 2. Or
// la vue est oblique : la case (c, r) est tracée à x = (c − C)·L + (r − R)·⌊L/3⌋ + d (dessin-carte.js,
// vue-fluide.js ; d = −32 en 640x480), et le décalage des rangées, (r − R)·⌊L/3⌋ = H / 4, n'est pas
// compté ; ni le panneau du bas, qui cache 44 lignes. L'objet tombe à droite et en bas du milieu de
// la vue du parc : de 96 et 30 pixels en 640x480 (x = 416 sur 640, y = 248 quand le parc s'arrête à
// 436), de 176 et 30 pixels en grande vue de 1472x800 — l'écart croît avec la hauteur de l'écran —, et
// la page, qui n'en montre zoomée qu'une portion, l'agrandit d'autant : au niveau 1,5 du zoom, un
// employé amené en bas à droite du cadre, à quelques pixels du bord.
//
// La correction : la caméra qui met l'objet, à sa position fine dans la case (octets +6 et +8,
// 256es de case), au milieu de la vue du parc, (W / 2, (H − 44) / 2), à la case près (la caméra va par
// cases entières : un écart d'une demi-case au plus). En 640x480 et en grande vue ; en 320x200, le
// cadrage d'origine. Rend [colonne, rangée], que l'appelant écrit à la place des siennes (puis recadre
// la caméra dans la carte, 0x184DF, comme l'original), ou null si le réglage est éteint.
const HAUTEUR_DU_PANNEAU = 44;          // 0xB93F5 − 4 = 436 en 640x480 : le haut du panneau du bas
const FIN_X = 6, FIN_Y = 8;             // la position fine de l'objet dans sa case, en 256es
export const cadrages = { nombre: 0 };

export function cameraCentreeSurLObjet(jeu, o) {
  if (!reglages.corrigerLeCadrageSurUnObjet) return null;
  const dv = jeu.dv;
  if (dv.getUint16(MODE_AFFICHAGE, true) & 1) return null;           // 320x200 : l'original
  const L = dv.getUint16(ADRESSES.largeurTuile, true), Ht = dv.getUint16(ADRESSES.hauteurTuile, true);
  if (L === 0 || Ht === 0) return null;
  const biais = (L / 3) | 0;
  // la vue telle qu'elle sera au retour dans le parc (grande-vue.js) et son bord de dessin
  const W = largeurDeLaVue(jeu), H = hauteurDeLaVue(jeu);
  const bord = bordDuDessin(L, W);
  const d = bord - (((bord - dv.getInt16(ADRESSES.origineDessinX, true)) / L) | 0) * L;
  const c = jeu.m8[o + 7], r = jeu.m8[o + 9];
  const fx = jeu.m8[o + FIN_X] / 256, fy = jeu.m8[o + FIN_Y] / 256;
  // le point visé : le milieu de la vue du parc, au-dessus du panneau
  const xVise = W / 2, yVise = (H - HAUTEUR_DU_PANNEAU) / 2;
  // d'abord la rangée (y = (r − R + fy)·Ht), puis la colonne pour cette rangée
  const R = r - Math.round(yVise / Ht - fy);
  const C = c - Math.round((xVise - d - (r - R + fy) * biais) / L - fx);
  cadrages.nombre++;
  return [C, R];
}
