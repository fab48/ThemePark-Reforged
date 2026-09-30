// Les véhicules : le bus des visiteurs, les wagons des attractions à voie.
//
// Réécriture lisible de six fonctions de la simulation, appelées à chaque pas par la mise à jour des
// objets du parc (0x21681) pour les objets de type 0xE, selon leur état (octet +C) :
//
//   état 8     0x420C7  un wagon en gare, qui attend le départ et y prend son passager ;
//   état 0xA   0x42392  un wagon qui roule sur la voie ;
//   état 0xC   0x42E06  un wagon dans un élément de voie de plusieurs cases (un looping...) ;
//   état 0x14  0x613CA  le bus qui roule ;
//   état 0x16  0x6160D  le bus à l'arrêt, qui dépose ses passagers ;
//   état 0x18  0x61772  le bus qui attend avant de repartir.
//
// Les autres états des véhicules : 0x20 (0x43A33), le wagon sorti de la voie, en attente (plus bas) ;
// 0x22 (0x43BAA), le wagon parti d'une gare des voies de genre 3 (monorail.js). Le bus parti (0x1A) n'a
// plus de routine. La mise à jour des attractions (type 4) mène aussi à 0x420C7 et 0x42392, pour
// leurs états 8 et 0xA : aucun scénario n'y passe (ces deux fonctions n'y reçoivent que des objets
// de type 0xE).
//
// Ce que montrent les scénarios. Le parc de la démo (simulation.json) a deux attractions à voie —
// des objets de type 4 dans le mode 6, posés sur la case de leur gare, à côté de la voie : le BIG
// DIPPER, voie de genre 1, dont le train de quatre wagons tourne, et le ROLLER COASTER, voie de genre
// 2 avec trois éléments de plusieurs cases, dont le train ne part jamais (personne dans sa file). Le
// bus suit la route de la rangée 61, de la colonne 63 vers la colonne 0, et s'arrête à la colonne 32.
// Il est créé par 0x6128F (appelée par 0x283A6) : au milieu d'une case, dans l'état 0x14, avec une
// direction reçue en argument et une vitesse lue dans une fiche de 0x6C2 octets (octet 0xD4A0B +
// 0x6C2 × [0xD665C] ; ce qu'est cette fiche, non établi). Il en part un toutes les 1 200 à 1 300
// pas environ, de la case (63, 61), dans la direction 3.
//
// LES GENRES DE VOIE. Le genre d'un morceau de voie (+16) est vraisemblablement l'octet +0xB4 de la
// fiche de l'attraction dans le catalogue 0xCCED0 (0xFF, ou 0 pour RUBBER TUBING et RACE CAR RIDE,
// pour les attractions sans voie) : c'est le cas pour les deux attractions de la démo. Il vaut 1
// pour BIG DIPPER et WATER SPLASH, 2 pour ROLLER COASTER, LOOP THE LOOP et CORK SCREW, 3 pour
// MONORAIL : le genre 2, le seul où joue la pesanteur dans les éléments de plusieurs cases, est
// celui des montagnes russes à loopings, et le genre 3 celui du monorail (le dessin, 0x1DD27, en
// relève les wagons de 0x18 pixels).
//
// LA POSITION. Les mots +6 et +8 sont les coordonnées fines de l'objet : l'octet haut est la colonne
// (+7) ou la rangée (+9) de sa case, l'octet bas la position dans la case, de 0 à 255, le centre à
// 0x80. Les directions : 0 vers la rangée précédente, 1 vers la colonne suivante, 2 vers la rangée
// suivante, 3 vers la colonne précédente (tables VOISINES, OPPOSEES, PAS_DU_BUS plus bas). Les objets
// se déplacent par 0x18ADF(objet, x, y), qui les change de case quand l'octet haut change (et rend
// vrai), ou par 0x18A44, qui fait de même mais refuse une case hors de la carte ; 0x18918 retire un
// objet de sa case.
//
// LES WAGONS. Un train est une chaîne de wagons : le premier, la tête, a son mot +45 nul ; chacun
// désigne le suivant par son mot +61 (0 : le dernier), et tous les autres désignent la tête par leur
// mot +45. La vitesse du train est le mot signé +E de la tête, en 256es de case par pas : en marche
// avant, la tête la tient entre 8 et 0xE0 ; négative, le train recule (la pesanteur d'un looping peut
// le renvoyer en arrière). À chaque pas, la tête y ajoute l'accélération (+13, octet signé) du
// morceau de voie qu'elle a atteint : chaque élément de voie la donne pour chacune des directions,
// négative en montée, positive en descente.
//
// Champs d'un wagon (type 0xE) :
//   +5  bit 0   posé quand le wagon s'arrête en gare ; la tête (sur le genre 3, chaque wagon) le
//               baisse au pas suivant, les autres wagons le gardent. Le dessin des véhicules (0x1DD27)
//               joue le bruitage 0x13 tant qu'il est posé, sauf quand le wagon roule (état 0xA) sur un
//               morceau qui a son propre bruitage, et seulement si le mot long +20 du wagon est nul.
//               Sens exact : non établi
//   +A  mot     objet graphique ; en marche, il avance d'une image à chaque pas (mot +6 de l'objet
//               graphique, retro-ingenierie.md § 6.4)
//   +C  octet   l'état (liste plus haut)
//   +E  mot     la vitesse du train, lue sur la tête ; au départ, la tête reçoit celle de l'attraction
//   +10 mot     le numéro de la case (rangée × 64 + colonne) du dernier morceau de voie atteint
//   +12 octet   la direction
//   +13 octet   l'accélération (signée) de la voie sous le wagon ; 4 au départ de la gare
//   +14 mot     dans l'élément de plusieurs cases, le chemin restant jusqu'au cran suivant (0x40 par
//               cran) ; 200 à l'arrivée de la tête en gare (qui le décompte : non établi) ; 0 à la
//               sortie de la voie (la vitesse de chute)
//   +16 mot     l'attraction à laquelle appartient le wagon (voir plus bas)
//   +45 mot     la tête du train ; 0 pour la tête elle-même
//   +47 mot     le passager : un visiteur, dont le mot +45 désigne en retour le wagon ; un seul par
//               wagon sur les voies de genre 1 et 2, une chaîne par leur mot +47 sur le genre 3
//   +61 mot     le wagon suivant du train
//   +7A mot     le wagon suivant dans le même élément de plusieurs cases
//   +7C mot     l'avancée dans cet élément, en crans, de 0 à sa longueur (+80 du morceau de voie)
//   +7E mot     le morceau maître de l'élément
//   +98 mot     l'altitude, en pixels, d'où tombe le wagon sorti de la voie : hauteur du morceau
//               quitté × 0x18 + 0x11, ou 0 s'il n'y en a pas
//
// Champs de l'attraction (type 4) lus et écrits ici (les noms sont ceux de attractions.js) :
//   +C  octet   le mode, 6 pour les attractions à voie (leur mise à jour est 0x41F3D)
//   +13 octet   le délai d'animation ; la tête du train en reçoit sa vitesse de départ (4 dans la
//               démo ; avec l'accélération de départ, 4 aussi, le train roule à 8 dès le premier pas)
//   +26 mot     la capacité (dans la démo, autant que de wagons) ; +30 mot les passagers à bord. Un
//               wagon sorti de la voie avec son passager retire un à chacun : la place est perdue
//   +32 mot     la phase : 2 donne le départ ; la tête arrivée en gare pose 4, la fin du tour
//   +47 mot     le premier passager à bord, les suivants chaînés par leur mot +47
//
// Champs d'un morceau de voie (type 0x12) lus ici :
//   +C  octet   la forme : l'élément, dans la table du genre, dont comptent les sorties et les
//               courbes — 1 à 4 les courbes, 5 et 6 les droites (les pentes aussi), 7 à 10 des
//               morceaux à une seule sortie (aucun dans la démo) ; 0x13 et au-delà, un élément de
//               plusieurs cases, dont le maître est le morceau +61
//   +16 mot     le genre de voie, 1 à 3 (voir LES GENRES DE VOIE) : un élément de GENRES_DE_VOIE ;
//               seul le genre 2 applique la pesanteur dans les éléments de plusieurs cases ; le
//               genre 3 a ses propres gares (0x420C7) et son propre état de marche (0x22)
//   +44 octet   l'élément qui donne l'accélération, les figures et les bruitages : le même que +C,
//               sauf pour les pentes, 11 à 18, dont la forme est une droite. Un élément fait 0x19
//               octets : +5 les figures, un mot par direction ; +D à +10 l'accélération par
//               direction (−1 ou −2 en montée, 2 à 5 en descente) ; +11 les sorties, un bit par
//               direction ; +12 à +14 des décalages de dessin ; +15 à +18 un bruitage par direction
//               (d'après 0x1DD27)
//   +79 octet   la hauteur de la voie (le dessin la retranche × 0x18 à l'ordonnée ; 0x1DD27)
//   +7A mot     sur le maître d'un élément de plusieurs cases, le premier wagon qui s'y trouve
//   +80 octet   la longueur de l'élément, en crans (20 et 10 pour les éléments du ROLLER COASTER,
//               7 pour celui du BIG DIPPER)
//
// LE BUS. Il amène les visiteurs à l'arrêt, et remporte ceux qui partent. Il roule tout droit à la
// vitesse +13 (octet, en 256es de case par pas : 16 dans la démo) et ne regarde autour de lui qu'une
// fois par case, quand son compte à rebours +14 (256 / vitesse pas) est écoulé. Il s'arrête à côté
// d'une case dont le sol est l'image 0x88 (l'arrêt de bus), y dépose un passager tous les 4 pas,
// attend 100 pas, et repart. Arrivé au bord de la carte (colonne ou rangée 0 ou 63), il emmène hors
// du parc les visiteurs qu'il remporte et disparaît.
//
// Champs du bus :
//   +5  bit 0   posé à l'arrêt, baissé au pas suivant
//   +C  octet   l'état ; +D l'état à reprendre après l'arrêt
//   +12 octet   la direction ; +13 octet la vitesse ; +14 mot le compte à rebours
//   +45 mot     le premier des visiteurs qui repartent, chaînés par leur mot +45 (qui les inscrit :
//               non établi)
//   +47 mot     le premier des visiteurs qui arrivent, chaînés par leur mot +47
//   +49 mot     le numéro de la case de l'arrêt
//   +58 octet   le côté (0 à 3) où l'arrêt a été trouvé
//
// Toutes ces fonctions rendent une valeur (0, 1 ou −1) que la mise à jour des objets ignore ; elle
// est reproduite, sauf pour 0x420C7, qui ne rend rien (eax y est un reste de calcul). Elles laissent
// aussi sur la pile ce qu'y laissait l'original, qu'une routine des visiteurs relit (ResteDePile).
//
// Vérification : simulation.json exerce les six fonctions, mais seulement le train du BIG DIPPER
// (marche avant, un élément sans pesanteur, pris dans la direction 1) et le bus ; demo.json et
// construction.json n'exercent rien de plus. Les chemins qu'aucun scénario n'exerce sont signalés
// « non exercé par les scénarios » : la gare du genre 3, la marche arrière, la sortie de la voie, la
// pesanteur, les autres entrées et sorties d'élément.
//
// Hors du jeu d'origine, une correction (reglages.js, corrigerLesToursEnTrop) : le train qui revient
// en gare avec des wagons encore dans un looping s'arrête quand même, et ces wagons le rejoignent
// (arriverEnGare, aSaPlace).

import { reglages } from './reglages.js';

const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

// Accès à la mémoire du jeu, petit-boutiste.
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const pointeur = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);

// Division entière du processeur (idiv) : un diviseur nul lève une exception, comme sur la machine.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

// --- Les objets du parc et la carte ----------------------------------------------------------------
const OBJETS = 0xD3B10;            // pointeur : les objets du parc, 200 octets chacun ; l'objet 0 est
const TAILLE_OBJET = 200;          // un emplacement vide, qui sert de fin de chaîne
const GRILLE = 0xD3B08;            // pointeur : la carte, 64x64 cellules de 4 octets (+2 : le sol)
const OBJETS_GRAPHIQUES = 0xD3B80; // pointeur : objets graphiques, 8 octets (+6 : image suivante)
const FIGURES = 0xD3B38;           // pointeur : table de mots, numéro de figure → objet graphique

const TYPE_ATTRACTION = 4;
const TYPE_VOIE = 0x12;

// L'adresse de l'objet numéro n : l'objet 0 est le début de la table, jamais un vrai objet. Le
// programme compare ces adresses à celle de la table (« au-delà du début ») : c'est tester n non nul.
const debutDesObjets = (jeu) => pointeur(jeu, OBJETS);
const objet = (jeu, numero) => (debutDesObjets(jeu) + numero * TAILLE_OBJET) >>> 0;
const numeroDe = (jeu, adresse) => u16(((adresse - debutDesObjets(jeu)) | 0) / TAILLE_OBJET | 0);

// La cellule (colonne, rangée) de la carte, et son numéro (rangée × 64 + colonne).
const cellule = (jeu, colonne, rangee) => (pointeur(jeu, GRILLE) + ((rangee << 6) + colonne) * 4) >>> 0;
const numeroDeCase = (jeu, c) => ((c - pointeur(jeu, GRILLE)) | 0) >> 2;

// --- Les tables du programme ----------------------------------------------------------------------
// Les directions : 0 vers la rangée précédente, 1 vers la colonne suivante, 2 vers la rangée
// suivante, 3 vers la colonne précédente.
const VOISINES = 0xB4920;          // mots : écart d'une cellule à sa voisine, −64, +1, +64, −1
const OPPOSEES = 0xB48EC;          // mots : la direction opposée, 2, 3, 0, 1 (lue tantôt en mot,
                                   // tantôt par son octet bas)
const PAS_DU_BUS = 0xB4932;        // octets signés, deux par direction : (0, −1), (1, 0), (0, 1), (−1, 0)
// Les sorties d'un élément de voie sont un masque d'un bit par direction : 1, 2, 4, 8.
const DIRECTION_DU_MASQUE = 0xB4B14;  // octets : 1 → 0, 2 → 1, 4 → 2, 8 → 3 (0 → −1)
const MASQUE_OPPOSE = 0xB4B21;     // octets : 1 → 4, 2 → 8, 4 → 1, 8 → 2 (0 → −1)
const GENRES_DE_VOIE = 0xB4399;    // 10 octets par genre ; +0 : pointeur vers ses éléments (genre 1 :
                                   // 0xB3E34, 2 : 0xB4041, 3 : 0xB4280)
const TAILLE_ELEMENT = 0x19;       // un élément de voie (voir en tête)
const INDICATEURS_DU_SOL = 0xB44D9;   // 4 octets par image de sol : mot d'indicateurs
const SOL_D_ATTRACTION = 4;        // l'indicateur des sols 4 et 0xA3 à 0xB7 : celui de la case de
                                   // l'attraction, près de laquelle la tête s'arrête ; ce que sont
                                   // ces sols, non établi
const SOL_ARRET_DE_BUS = 0x88;     // l'image de sol de l'arrêt de bus
const CONTENTEMENT_PAR_HAUTEUR = 0xB531E;  // mots, par hauteur de voie : ce que gagne le passager à
                                   // chaque case, 2, 5, 8, 12, 17, 23, 30, 38, 50, 65, 80, 95, 110, 125
const SINUS = 0xB4E90;             // mots : 256 × sin(2π i / 256)
const SILHOUETTES = 0xB49F4;       // 0x24 octets par sorte de visiteur (octet +59 du visiteur) :
                                   // +0 figure du visiteur à pied, +0x16 objet graphique assis
const TAILLE_SILHOUETTE = 0x24;

// --- Les autres variables ---------------------------------------------------------------------------
const PAS_DE_SIMULATION = 0xD3AFC; // mot long : le compteur de pas
const SOURIS_X = 0xBECAC;          // mot : la position horizontale de la souris

// --- Les fonctions appelées -------------------------------------------------------------------------
const OBJET_DE_TYPE_SUR_LA_CASE = 0x204B9;  // (cellule, type) → le premier objet de ce type, ou 0
const DEPLACER = 0x18ADF;          // (objet, x, y) → vrai s'il a changé de case
const DEPLACER_DANS_LA_CARTE = 0x18A44;     // (objet, x, y), refuse une case hors de la carte
const RETIRER_DE_SA_CASE = 0x18918;         // (objet)
const DETRUIRE = 0x18B62;          // (objet) : le retire de sa case et remet ses 200 octets à zéro
const SORTIR_DU_PARC = 0x28752;    // (visiteur) : le compte comme parti, puis le détruit
const HASARD = 0x18B92;            // () → le générateur de hasard du jeu, 0 à 0x7FFF
const DIVISION_PAR_ZERO = 0x19ED3; // vitesse nulle : rend 1, efface la demande de sortie
// (visiteur, attraction, wagon, élément de voie, |vitesse|) → vrai si le passager tombe : d'après le
// pseudo-C, dans une courbe (élément 1 à 4) d'une attraction usée (mot +2E au-delà de 0x11), une
// chance sur 64 (le hasard du jeu), si la vitesse dépasse 0x23 ; il quitte alors le wagon, et 0x66189
// l'éjecte. Module des visiteurs.
const PASSAGER_PEUT_TOMBER = 0x65D25;
const PASSAGER_EJECTE = 0x66189;   // (2, visiteur, wagon, vitesse) : le passager projeté hors du
                                   // wagon (le détail : non établi)

// Le temps que met un objet à franchir une case : 256 / vitesse pas. Une vitesse nulle, qui
// diviserait par zéro, donne 1 (0x19ED3, dont le programme étend le mot bas : non exercé par les
// scénarios).
function dureeDUneCase(jeu, o) {
  const vitesse = octet(jeu, o + 0x13);
  return vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : (0x100 / vitesse) | 0;
}

// --- Ce que les routines laissent sur la pile --------------------------------------------------------
//
// ANOMALIE du jeu d'origine, dont cette réécriture doit tenir compte. 0x223C1, la routine des visiteurs
// au guichet d'entrée, lit l'octet bas de sa variable [ebp-8] sans l'avoir écrite quand le mot +0x20
// du visiteur vaut 1 (en 0x22572 : le temps qu'il lui faut pour gagner le milieu de sa case est tiré
// d'une position qu'elle n'a pas calculée ce pas-là).
// Comme toutes les routines de mise à jour, elle est appelée par 0x21681 au même niveau de pile : elle
// trouve là ce qu'y a laissé la routine de l'objet mis à jour avant elle — un wagon, ou le bus, quand
// aucun objet entre les deux n'y écrit. Si E est le pointeur de pile à l'entrée (sur l'adresse de
// retour), cet endroit est E − 0x18 : le [ebp-8] de chacune des six routines de ce module (leur
// cadre : ebx, esi, edi et ebp sauvés, puis les variables locales).
//
// Chacune y laisse donc en sortie ce qu'y laissait l'original : la dernière valeur de 32 bits qu'il
// range dans son [ebp-8] (notée par `noter`), ou, s'il n'y écrit pas, la valeur trouvée à l'entrée —
// les appels de la réécriture, qui ne posent pas leur cadre à la même hauteur que ceux de l'original,
// ont pu l'écraser. Sans cela, le rejeu de simulation.json divergeait à 209,92 s : un visiteur au
// guichet, mis à jour peu après les wagons, y restait 2 pas au lieu de 0 (le comparateur appel par
// appel, qui ne relève pas ce qui est sous la pile, ne le voit pas ; le rejeu, si).
class ResteDePile {
  constructor(jeu) {
    this.jeu = jeu;
    this.adresse = ((jeu.T.lireRegistre('esp') >>> 0) - 0x18) >>> 0;
    this.valeur = pointeur(jeu, this.adresse);
  }

  noter(valeur) {
    this.valeur = valeur >>> 0;
  }

  laisser() {
    this.jeu.dv.setUint32(this.adresse, this.valeur, true);
  }
}

// Une routine de mise à jour de ce module : `routine(jeu, objet, reste)` fait le travail et note ce que
// l'original laissait dans son [ebp-8].
function avecLeReste(routine) {
  return (jeu, o) => {
    const reste = new ResteDePile(jeu);
    const resultat = routine(jeu, o, reste);
    reste.laisser();
    return resultat;
  };
}

// Le premier objet d'un type donné sur une cellule, ou 0.
function objetSurLaCase(jeu, c, type) {
  return jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, c, type) >>> 0;
}

// L'élément n de la table du genre d'un morceau de voie.
function elementDeVoie(jeu, morceau, n) {
  return (pointeur(jeu, GENRES_DE_VOIE + mot(jeu, morceau + 0x16) * 10) + n * TAILLE_ELEMENT) >>> 0;
}

// L'objet graphique d'un visiteur assis dans un wagon, selon sa sorte.
function silhouetteAssise(jeu, visiteur) {
  return mot(jeu, SILHOUETTES + 0x16 + octet(jeu, visiteur + 0x59) * TAILLE_SILHOUETTE);
}

// ================================================================================================
// Les wagons
// ================================================================================================

// 0x420C7 — un wagon en gare (état 8).
//
// Sur une voie de genre 3 (non exercé par les scénarios), le wagon cherche autour de sa case une
// attraction à voie (type 4, mode 6) ; quand elle donne le départ (phase +32 à 2), il part dans
// l'état 0x22 à la vitesse 8, et ses passagers (la chaîne de son mot +47) y prennent place ; si
// l'attraction n'est pas pleine (à bord +30 sous la capacité +26), sa phase retombe à 0.
//
// Sur les autres voies, les wagons suivent la tête : chacun reprend son état. La tête attend le
// départ de son attraction (+16) ; elle passe alors en marche (état 0xA), avec l'accélération 4 et
// la vitesse de départ de l'attraction. Chaque wagon qui part prend le premier des passagers à bord
// de l'attraction qui n'a pas encore de wagon.
//
// Anomalie, reproduite : si la case du wagon n'a pas de morceau de voie, le genre est lu à l'adresse
// 0x16 de la mémoire (0x204B9 rend 0). Non vu dans les scénarios.
//
// Sur la pile (voir ResteDePile), l'original laisse l'adresse de la tête, calculée même quand le
// wagon est la tête (c'est alors celle de l'objet 0, le début de la table) ; rien sur le genre 3.
export function wagonEnGare(jeu, wagon, reste) {
  const c = cellule(jeu, octet(jeu, wagon + 7), octet(jeu, wagon + 9));
  const voie = objetSurLaCase(jeu, c, TYPE_VOIE);

  if (mot(jeu, voie + 0x16) === 3) {
    poserOctet(jeu, wagon + 5, octet(jeu, wagon + 5) & 0xFE);
    let attraction = 0, cote = 0;
    for (; cote < 4; cote++) {
      attraction = objetSurLaCase(jeu, (c + motSigne(jeu, VOISINES + cote * 2) * 4) >>> 0, TYPE_ATTRACTION);
      if (attraction !== 0 && octet(jeu, attraction + 0xC) === 6) break;
    }
    if (cote === 4) return;
    if (mot(jeu, attraction + 0x32) === 2) {
      poserOctet(jeu, wagon + 0xC, 0x22);
      poserMot(jeu, wagon + 0xE, 8);
      if (motSigne(jeu, attraction + 0x30) < mot(jeu, attraction + 0x26)) poserMot(jeu, attraction + 0x32, 0);
    }
    if (octet(jeu, wagon + 0xC) === 0x22) {
      for (let n = mot(jeu, wagon + 0x47); n !== 0;) {
        const visiteur = objet(jeu, n);
        poserMot(jeu, visiteur + 0xA, silhouetteAssise(jeu, visiteur));
        poserMot(jeu, visiteur + 0x45, numeroDe(jeu, wagon));
        n = mot(jeu, visiteur + 0x47);
      }
    }
    return;
  }

  const numeroTete = mot(jeu, wagon + 0x45);
  reste.noter(objet(jeu, numeroTete));
  if (numeroTete !== 0) {
    const tete = objet(jeu, numeroTete);
    if (octet(jeu, tete + 0xC) !== octet(jeu, wagon + 0xC)) poserOctet(jeu, wagon + 0xC, octet(jeu, tete + 0xC));
  } else {
    poserOctet(jeu, wagon + 5, octet(jeu, wagon + 5) & 0xFE);
    const attraction = objet(jeu, mot(jeu, wagon + 0x16));
    if (mot(jeu, wagon + 0x16) !== 0 && mot(jeu, attraction + 0x32) === 2) {
      poserOctet(jeu, wagon + 0xC, 0xA);
      poserOctet(jeu, wagon + 0x13, 4);
      poserMot(jeu, wagon + 0xE, octet(jeu, attraction + 0x13));
    }
  }

  if (octet(jeu, wagon + 0xC) === 0xA) {
    // Au départ, le wagon prend un passager parmi ceux de l'attraction. Sans attraction (+16 nul),
    // c'est la chaîne de l'objet 0 qui serait lue.
    poserMot(jeu, wagon + 0x47, 0);
    const attraction = objet(jeu, mot(jeu, wagon + 0x16));
    for (let n = mot(jeu, attraction + 0x47); n !== 0;) {
      const visiteur = objet(jeu, n);
      if (mot(jeu, visiteur + 0x45) === 0) {
        poserMot(jeu, visiteur + 0xA, silhouetteAssise(jeu, visiteur));
        poserMot(jeu, visiteur + 0x45, numeroDe(jeu, wagon));
        poserMot(jeu, wagon + 0x47, numeroDe(jeu, visiteur));
        break;
      }
      n = mot(jeu, visiteur + 0x47);
    }
  }
}

// 0x42392 — un wagon qui roule sur la voie (état 0xA).
//
// Le wagon avance de la vitesse du train dans sa direction. Sur la case où il arrive :
//  - pas de voie : il sort de la voie (état 0x20) — voir sortirDeLaVoie ;
//  - une courbe : passé le milieu de la case, il tourne (virer) ; son passager peut tomber (0x65D25) ;
//  - en changeant de case, le contentement du passager (mot +54 du visiteur) croît, d'autant plus que
//    la voie est haute ; puis, sur un élément de plusieurs cases, le wagon y entre (état 0xC) ;
//    sinon il prend l'accélération du nouveau morceau, et la tête s'arrête en gare quand une case
//    voisine porte son attraction ; les autres wagons s'arrêtent en la voyant arrêtée.
// Rend 1 quand le wagon a changé d'état ou est entré dans l'élément, 0 sinon (y compris quand il
// n'a pas changé de case).
//
// Sur la pile (voir ResteDePile), l'original laisse l'ordonnée fine d'arrivée y, dans un mot long dont
// la moitié haute vient d'un registre de passage : celle de l'adresse de la tête (du début de la table
// quand le wagon est la tête) dans les directions 0 et 2, celle de l'adresse du wagon dans les
// directions 1 et 3.
export function wagonEnMarche(jeu, wagon, reste) {
  // L'image suivante de l'animation.
  poserMot(jeu, wagon + 0xA, mot(jeu, pointeur(jeu, OBJETS_GRAPHIQUES) + mot(jeu, wagon + 0xA) * 8 + 6));

  // La tête règle la vitesse du train : elle y ajoute l'accélération de la voie ; en marche avant, la
  // vitesse ne descend pas sous 8 ni ne dépasse 0xE0 (ce plafond : non exercé par les scénarios).
  // Nulle ou négative, elle n'est pas bornée.
  let tete = wagon;
  if (mot(jeu, wagon + 0x45) !== 0) {
    tete = objet(jeu, mot(jeu, wagon + 0x45));
    // Hors du jeu d'origine (corrigerLesToursEnTrop) : derrière une tête arrêtée en gare, le wagon
    // arrivé à sa place s'y arrête, sans avancer.
    if (reglages.corrigerLesToursEnTrop && octet(jeu, tete + 0xC) === 8 && aSaPlace(jeu, wagon, tete)) {
      arreter(jeu, wagon);
      return 1;
    }
  } else {
    const vitesse = s16(motSigne(jeu, wagon + 0xE) + octetSigne(jeu, wagon + 0x13));
    poserMot(jeu, wagon + 0xE, vitesse);
    if (vitesse < 8) {
      if (vitesse > 0) poserMot(jeu, wagon + 0xE, 8);
    } else if (vitesse > 0xE0) {
      poserMot(jeu, wagon + 0xE, 0xE0);
    }
  }

  // Le point d'arrivée, en coordonnées fines (octet haut : la case). Une direction hors de 0 à 3
  // laisserait x et y indéterminés dans l'original (variables locales non initialisées) : jamais vu.
  const direction = octet(jeu, wagon + 0x12);
  const hautDeLaTete = objet(jeu, mot(jeu, wagon + 0x45)) >>> 16, hautDuWagon = wagon >>> 16;
  let x = 0, y = 0, hautDuReste = -1;
  switch (direction) {
    case 0: y = u16(mot(jeu, wagon + 8) - motSigne(jeu, tete + 0xE)); x = mot(jeu, wagon + 6); hautDuReste = hautDeLaTete; break;
    case 1: x = u16(mot(jeu, wagon + 6) + motSigne(jeu, tete + 0xE)); y = mot(jeu, wagon + 8); hautDuReste = hautDuWagon; break;
    case 2: y = u16(mot(jeu, wagon + 8) + motSigne(jeu, tete + 0xE)); x = mot(jeu, wagon + 6); hautDuReste = hautDeLaTete; break;
    case 3: x = u16(mot(jeu, wagon + 6) - motSigne(jeu, tete + 0xE)); y = mot(jeu, wagon + 8); hautDuReste = hautDuWagon; break;
    default: break;
  }
  const noterY = () => { if (hautDuReste >= 0) reste.noter((hautDuReste << 16) | y); };

  // En marche arrière (non exercé par les scénarios), le wagon avance à reculons : le sens du
  // déplacement est l'opposé de sa direction. La valeur absolue est prise sur 16 bits : −32 768 le
  // resterait.
  let vitesseAbsolue, sens;
  if (motSigne(jeu, tete + 0xE) < 0) {
    vitesseAbsolue = s16(-motSigne(jeu, tete + 0xE));
    sens = octet(jeu, OPPOSEES + direction * 2);
  } else {
    vitesseAbsolue = motSigne(jeu, tete + 0xE);
    sens = direction;
  }

  const c = cellule(jeu, x >> 8, y >> 8);
  const voie = objetSurLaCase(jeu, c, TYPE_VOIE);
  if (voie === 0) {
    noterY();
    return sortirDeLaVoie(jeu, wagon, tete, c, x, y);
  }

  // Le passager peut tomber du wagon dans une courbe prise vite (0x65D25, module des visiteurs).
  if (mot(jeu, wagon + 0x47) !== 0) {
    jeu.appeler(PASSAGER_PEUT_TOMBER, objet(jeu, mot(jeu, wagon + 0x47)), objet(jeu, mot(jeu, wagon + 0x16)),
      wagon, octet(jeu, voie + 0x44), vitesseAbsolue);
  }

  if (octet(jeu, voie + 0xC) <= 4) {
    [sens, x, y] = virer(jeu, voie, tete, sens, vitesseAbsolue, x, y);
  }
  noterY();

  // La direction retenue ; en marche arrière, l'opposé du sens du déplacement.
  poserOctet(jeu, wagon + 0x12, motSigne(jeu, tete + 0xE) < 0 ? octet(jeu, OPPOSEES + sens * 2) : sens);
  if ((jeu.appeler(DEPLACER, wagon, x, y) & 0xFFFF) === 0) return 0;

  // Une case de plus : le contentement du passager croît selon la hauteur de la voie, plus
  // l'accélération du wagon lue sans signe, divisée par 16, plus 4. Anomalie, reproduite : lue sans
  // signe, une accélération négative (une montée) donne le plus grand bonus, 8 à 15 au lieu de 0 à 7.
  if (mot(jeu, wagon + 0x47) !== 0) {
    const passager = objet(jeu, mot(jeu, wagon + 0x47));
    const gain = mot(jeu, CONTENTEMENT_PAR_HAUTEUR + octet(jeu, voie + 0x79) * 2) + (octet(jeu, wagon + 0x13) >> 4) + 4;
    poserMot(jeu, passager + 0x54, motSigne(jeu, passager + 0x54) + gain);
  }
  poserMot(jeu, wagon + 0x10, numeroDeCase(jeu, c));

  if (octet(jeu, voie + 0xC) >= 0x13) return entrerDansLElement(jeu, wagon, tete, voie, x, y, reste);

  // L'accélération du nouveau morceau, dans la direction du wagon.
  poserOctet(jeu, wagon + 0x13, octet(jeu, elementDeVoie(jeu, voie, octet(jeu, voie + 0x44)) + 0xD + octet(jeu, wagon + 0x12)));

  if (mot(jeu, wagon + 0x45) === 0) return arriverEnGare(jeu, wagon, tete, x, y);

  // Un wagon qui suit s'arrête quand la tête n'est plus en marche — sauf si elle est dans un élément
  // de plusieurs cases. (Hors du jeu d'origine, derrière une tête arrêtée en gare, pas avant d'avoir
  // rejoint sa place : aSaPlace.)
  if (octet(jeu, wagon + 0xC) === octet(jeu, tete + 0xC)) return 0;
  if (octet(jeu, tete + 0xC) === 0xC) return 0;
  if (reglages.corrigerLesToursEnTrop && octet(jeu, tete + 0xC) === 8 && !aSaPlace(jeu, wagon, tete)) return 0;
  arreter(jeu, wagon);
  return 1;
}

// Hors du jeu d'origine (corrigerLesToursEnTrop). Un wagon qui suit une tête arrêtée en gare est-il à
// sa place : le wagon qui le précède dans le train est arrêté, et lui-même est sur la case d'où ce
// wagon vient, en suivant la voie à rebours (ou sur la sienne, qu'il ne doit pas dépasser) ? Sinon il
// continue de rouler, à la vitesse que la tête avait en arrivant : c'est ainsi que les wagons restés
// dans un looping quand la tête s'est arrêtée (arriverEnGare) rejoignent le train, au lieu de
// s'arrêter dès la sortie du looping, et que le train étiré se resserre. Dans un train qui ne l'est
// pas, chaque wagon arrive sur sa place au pas même où la tête s'arrête, comme dans le jeu d'origine.
function aSaPlace(jeu, wagon, tete) {
  let precedent = 0;
  for (let w = tete; w > debutDesObjets(jeu); w = objet(jeu, mot(jeu, w + 0x61))) {
    if (mot(jeu, w + 0x61) === numeroDe(jeu, wagon)) { precedent = w; break; }
  }
  if (precedent === 0) return true;
  if (octet(jeu, precedent + 0xC) !== 8) return false;
  const ici = cellule(jeu, octet(jeu, wagon + 7), octet(jeu, wagon + 9));
  if (ici === cellule(jeu, octet(jeu, precedent + 7), octet(jeu, precedent + 9))) return true;
  const derriere = caseDerriere(jeu, precedent);
  return derriere === 0 || ici === derriere;
}

// La case d'où vient un wagon, en suivant la voie à rebours : les sorties du morceau sous lui, moins
// sa direction (comme placerDerriere). 0 si elle ne se déduit pas d'une seule sortie.
function caseDerriere(jeu, w) {
  const c = cellule(jeu, octet(jeu, w + 7), octet(jeu, w + 9));
  const voie = objetSurLaCase(jeu, c, TYPE_VOIE);
  if (voie === 0) return 0;
  const sorties = octet(jeu, elementDeVoie(jeu, voie, octet(jeu, voie + 0xC)) + 0x11);
  const bit = 1 << octet(jeu, w + 0x12);
  const masque = (sorties & bit) !== 0 ? sorties & ~bit : 1 << octet(jeu, OPPOSEES + octet(jeu, w + 0x12) * 2);
  if (masque !== 1 && masque !== 2 && masque !== 4 && masque !== 8) return 0;
  const sens = octetSigne(jeu, DIRECTION_DU_MASQUE + masque);
  return (c + motSigne(jeu, VOISINES + sens * 2) * 4) >>> 0;
}

// Le wagon s'arrête au milieu de sa case (état 8) et lâche son passager.
function arreter(jeu, wagon) {
  poserOctet(jeu, wagon + 5, octet(jeu, wagon + 5) | 1);
  poserOctet(jeu, wagon + 0xC, 8);
  poserOctet(jeu, wagon + 6, 0x80);
  poserOctet(jeu, wagon + 8, 0x80);
  poserMot(jeu, wagon + 0x47, 0);
}

// Les courbes (0x425B0 à 0x427DF). Les formes 1 à 4 relient deux côtés de la case : 1 le haut et la
// droite (rangée précédente, colonne suivante), 2 le bas et la droite, 3 le bas et la gauche, 4 le
// haut et la gauche. Selon le sens du déplacement et la forme (l'indice est sens × 4 + forme − 1), le
// wagon tourne dès qu'il a passé le milieu de la case (0x80), ou qu'il le passerait au pas suivant,
// compte tenu de la vitesse et de l'accélération (lue sans signe) de la tête : il repart alors du
// milieu de la case dans la nouvelle direction, et le chemin parcouru dans l'ancienne se reporte sur
// la nouvelle. Rend le sens et le point d'arrivée, dont seuls les octets bas changent.
//
// La forme 0, sans sortie, n'a pas d'indice à elle : parcourue vers la rangée suivante ou vers la
// colonne précédente, elle retomberait sur les indices 7 et 0xB de la forme 4. Jamais vu.
function virer(jeu, voie, tete, sens, vitesseAbsolue, x, y) {
  const k = u16(sens * 4 + octet(jeu, voie + 0xC) - 1);
  const acceleration = octet(jeu, tete + 0x13);
  let dx = x & 0xFF, dy = y & 0xFF;
  const passeraEnReculant = (d) => d - vitesseAbsolue - acceleration < 0;
  const passeraEnAvancant = (d) => d + vitesseAbsolue + acceleration > 0xFF;
  switch (k) {
    case 1:     // vers la rangée précédente dans la forme 2 : tourne vers la colonne suivante
      if (dy < 0x80 || passeraEnReculant(dy)) { sens = 1; dx = 0xFF - dy; dy = 0x80; }
      break;
    case 2:     // vers la rangée précédente dans la forme 3 : tourne vers la colonne précédente
      if (dy < 0x80 || passeraEnReculant(dy)) { sens = 3; dx = dy; dy = 0x80; }
      break;
    case 6:     // vers la colonne suivante dans la forme 3 : tourne vers la rangée suivante
      // (non exercé par les scénarios)
      if (dx > 0x80 || passeraEnAvancant(dx)) { sens = 2; dy = dx; dx = 0x80; }
      break;
    case 7:     // vers la colonne suivante dans la forme 4 : tourne vers la rangée précédente
      if (dx > 0x80 || passeraEnAvancant(dx)) { sens = 0; dy = 0xFF - dx; dx = 0x80; }
      break;
    case 8:     // vers la rangée suivante dans la forme 1 : tourne vers la colonne suivante
      if (dy > 0x80 || passeraEnAvancant(dy)) { sens = 1; dx = dy; dy = 0x80; }
      break;
    case 0xB:   // vers la rangée suivante dans la forme 4 : tourne vers la colonne précédente
      if (dy > 0x80 || passeraEnAvancant(dy)) { sens = 3; dx = 0xFF - dy; dy = 0x80; }
      break;
    case 0xC:   // vers la colonne précédente dans la forme 1 : tourne vers la rangée précédente
      if (dx < 0x80 || passeraEnReculant(dx)) { sens = 0; dy = dx; dx = 0x80; }
      break;
    case 0xD:   // vers la colonne précédente dans la forme 2 : tourne vers la rangée suivante
      if (dx < 0x80 || passeraEnReculant(dx)) { sens = 2; dy = 0xFF - dx; dx = 0x80; }
      break;
    default: break;
  }
  return [sens, (x & 0xFF00) | dx, (y & 0xFF00) | dy];
}

// La sortie de la voie (0x427E4 ; non exercé par les scénarios) : la case d'arrivée n'a pas de
// morceau de voie. Le wagon y va quand même et passe dans l'état 0x20, où il vole puis s'écrase
// (0x43A33). Il quitte son train : si c'était la tête, le wagon suivant le devient et garde la
// vitesse ; sinon il est retiré de la chaîne et prend la vitesse du train. Sa vitesse reçoit un
// petit à-coup, tiré du compteur de pas et... de la position de la souris : la simulation dépend
// ici de la souris (reproduit).
//
// Anomalie, reproduite : quand la tête est seule (+61 nul), c'est l'objet 0 — le début de la table,
// qui n'est pas un objet — qui reçoit la vitesse et devient la tête.
//
// L'altitude de la chute (+98) est la hauteur du morceau de voie qu'il vient de quitter, celui de la
// case voisine derrière lui ; sans morceau, 0 : il s'écrase aussitôt. Si un passager était à bord et
// rattaché à une attraction, 0x66189 l'éjecte, et l'attraction du wagon perd un passager à bord
// (+30) et une place (+26).
function sortirDeLaVoie(jeu, wagon, tete, c, x, y) {
  jeu.appeler(DEPLACER, wagon, x, y);
  poserOctet(jeu, wagon + 0xC, 0x20);
  if (wagon === tete) {
    tete = objet(jeu, mot(jeu, wagon + 0x61));
    poserMot(jeu, tete + 0xE, mot(jeu, wagon + 0xE));
    poserMot(jeu, tete + 0x45, 0);
    for (let n = mot(jeu, tete + 0x61); n !== 0;) {
      const suivant = objet(jeu, n);
      poserMot(jeu, suivant + 0x45, mot(jeu, wagon + 0x61));
      n = mot(jeu, suivant + 0x61);
    }
  } else {
    poserMot(jeu, wagon + 0xE, mot(jeu, tete + 0xE));
    for (let w = tete; w > debutDesObjets(jeu); w = objet(jeu, mot(jeu, w + 0x61))) {
      if (numeroDe(jeu, wagon) === mot(jeu, w + 0x61)) {
        poserMot(jeu, w + 0x61, mot(jeu, wagon + 0x61));
        break;
      }
    }
  }
  poserMot(jeu, wagon + 0xE, mot(jeu, wagon + 0xE) + (mot(jeu, PAS_DE_SIMULATION) & 3) + (mot(jeu, SOURIS_X) & 3));

  const derriere = c + motSigne(jeu, VOISINES + motSigne(jeu, OPPOSEES + octet(jeu, wagon + 0x12) * 2) * 2) * 4;
  const quittee = objetSurLaCase(jeu, derriere >>> 0, TYPE_VOIE);
  if (quittee > debutDesObjets(jeu)) {
    poserMot(jeu, wagon + 0x98, octet(jeu, quittee + 0x79) * 0x18 + 0x11);
    poserMot(jeu, wagon + 0x14, 0);
    const numeroPassager = mot(jeu, wagon + 0x47);
    if (numeroPassager !== 0) {
      const passager = objet(jeu, numeroPassager);
      if (mot(jeu, passager + 0x16) !== 0) {
        jeu.appeler(PASSAGER_EJECTE, 2, passager, wagon, motSigne(jeu, tete + 0xE));
        if (mot(jeu, wagon + 0x16) !== 0) {
          const attraction = objet(jeu, mot(jeu, wagon + 0x16));
          poserMot(jeu, attraction + 0x30, mot(jeu, attraction + 0x30) - 1);
          poserMot(jeu, attraction + 0x26, mot(jeu, attraction + 0x26) - 1);
        }
      }
    }
  } else {
    poserMot(jeu, wagon + 0x98, 0);
  }
  return 1;
}

// L'entrée dans un élément de plusieurs cases (0x42AFB) : le wagon s'inscrit en tête de la liste des
// wagons de l'élément (mot +7A du maître), part du début de l'élément en marche avant, de sa fin en
// marche arrière, et se pose sur la case de l'élément la plus avancée dans sa direction : le maître,
// qui en occupe le bout vers la rangée suivante ou vers la colonne précédente, dans les directions 2
// et 3 ; deux colonnes plus loin dans la direction 1, trois rangées plus loin dans la direction 0.
// Dans le parc de la démo, un élément s'étend sur trois colonnes d'une rangée, ou sur quatre rangées
// d'une colonne, d'où ces décalages. Seules l'entrée dans la direction 1 et la marche avant sont
// exercées par les scénarios. Sur la pile, la rangée remplace l'octet 1 de ce qu'y a laissé
// wagonEnMarche (l'original la range dans l'octet haut de son ordonnée d'arrivée).
function entrerDansLElement(jeu, wagon, tete, voie, x, y, reste) {
  const maitre = objet(jeu, mot(jeu, voie + 0x61));
  poserOctet(jeu, wagon + 0xC, 0xC);
  poserMot(jeu, wagon + 0x7A, mot(jeu, maitre + 0x7A));
  poserMot(jeu, maitre + 0x7A, numeroDe(jeu, wagon));
  if (motSigne(jeu, tete + 0xE) > 0) {
    poserMot(jeu, wagon + 0x7C, 0);
    poserMot(jeu, wagon + 0x14, 0x40);
  } else {
    poserMot(jeu, wagon + 0x7C, octet(jeu, voie + 0x80) - 1);
    poserMot(jeu, wagon + 0x14, 0);
  }
  poserMot(jeu, wagon + 0x7E, numeroDe(jeu, maitre));
  let colonne = x >> 8, rangee = y >> 8;
  const direction = octet(jeu, wagon + 0x12);
  switch (direction) {
    case 0: colonne = octet(jeu, maitre + 7); rangee = (octet(jeu, maitre + 9) - 3) & 0xFF; break;
    case 1: colonne = (octet(jeu, maitre + 7) + 2) & 0xFF; rangee = octet(jeu, maitre + 9); break;
    case 2:
    case 3: colonne = octet(jeu, maitre + 7); rangee = octet(jeu, maitre + 9); break;
    default: break;
  }
  if (direction <= 3) reste.noter((reste.valeur & 0xFFFF00FF) | (rangee << 8));
  jeu.appeler(DEPLACER, wagon, (colonne << 8) | (x & 0xFF), (rangee << 8) | (y & 0xFF));
  return 1;
}

// L'arrivée en gare de la tête (0x42C6E) : une case voisine a un sol d'attraction (indicateur 4) et
// porte une attraction à voie (type 4, mode 6). Si un wagon du train est encore dans un élément de
// plusieurs cases, rien ne se passe (mais la fonction rend 1). Sinon la tête s'arrête au milieu de sa
// case, lâche son passager, arme son compteur +14 à 200, et l'attraction passe à la phase 4. Les autres
// wagons s'arrêteront à leur tour, en voyant la tête arrêtée.
//
// Le défaut, reproduit : dans un élément, un wagon reste sur une case le temps de le parcourir (cinq
// cases de trajet pour un looping des montagnes russes), et le train s'étire derrière la tête jusqu'à
// ce que le dernier wagon en sorte, où il est remis en ligne. Un looping à moins d'une longueur de
// train étiré avant la gare y laisse donc la queue quand la tête arrive : le train repart pour un
// tour, plus vite (une descente donne +2 à +5, une montée ne reprend que 1 ou 2), jusqu'à 224, et
// éjecte d'autant plus. Sur la partie « Jeu02 » de Fabien, trois tours de trop.
//
// La correction (reglages.js, corrigerLesToursEnTrop), en marche avant : la tête s'arrête quand même ;
// les wagons qui suivent lâchent leur passager, comme ceux qui s'arrêtent, finissent leur élément et
// roulent jusqu'à leur place derrière le wagon qui les précède (aSaPlace).
function arriverEnGare(jeu, wagon, tete, x, y) {
  const c = cellule(jeu, x >> 8, y >> 8);
  for (let cote = 0; cote < 4; cote++) {
    const voisine = (c + motSigne(jeu, VOISINES + cote * 2) * 4) >>> 0;
    if ((octet(jeu, INDICATEURS_DU_SOL + octet(jeu, voisine + 2) * 4) & SOL_D_ATTRACTION) === 0) continue;
    const attraction = objetSurLaCase(jeu, voisine, TYPE_ATTRACTION);
    if (attraction === 0 || octet(jeu, attraction + 0xC) !== 6) continue;
    for (let w = tete; w > debutDesObjets(jeu); w = objet(jeu, mot(jeu, w + 0x61))) {
      if (octet(jeu, w + 0xC) !== 0xC) continue;
      if (!reglages.corrigerLesToursEnTrop || motSigne(jeu, tete + 0xE) <= 0) return 1;
      for (let n = mot(jeu, tete + 0x61); n !== 0; n = mot(jeu, objet(jeu, n) + 0x61)) poserMot(jeu, objet(jeu, n) + 0x47, 0);
      break;
    }
    arreter(jeu, wagon);
    poserMot(jeu, wagon + 0x14, 200);
    poserMot(jeu, attraction + 0x32, 4);
    return 1;
  }
  return 0;
}

// 0x42E06 — un wagon dans un élément de voie de plusieurs cases (état 0xC). Sur une voie de genre 2,
// la tête y subit la pesanteur d'un tour complet : c'est un looping (non exercé par les scénarios :
// le train du ROLLER COASTER ne part jamais ; celui du BIG DIPPER, de genre 1, traverse son élément
// sans pesanteur).
//
// Le wagon ne bouge pas : il reste sur la case où il est entré, et son avancée se compte dans le mot
// +7C, un cran chaque fois que +14 a parcouru 0x40, de 0 à la longueur de l'élément (+80 du maître) en
// marche avant, en sens inverse en marche arrière. À chaque cran, la tête perd 13 × sin(angle) / 256
// de vitesse, l'angle allant de 0 à un tour complet le long de l'élément (0 à 255, table SINUS) : elle
// ralentit en montant, accélère en redescendant. Si sa vitesse change de signe, le train repart en
// sens inverse. La vitesse de la tête est d'abord bornée : jamais entre −8 et 8 (une vitesse nulle
// devient −8), ni au-delà de ±0xE0.
//
// Au bout, le wagon quitte la liste de l'élément, se pose sur la case de sortie, au bord qui touche
// l'élément, et repart en marche (état 0xA). Quand le dernier wagon du train dans le sens du
// déplacement est sorti et que tous sont en marche, le train est remis en ligne : chaque wagon est
// posé à l'entrée de la case qui précède celle du wagon précédent, en suivant la voie ; en marche
// arrière, chacun est encore déplacé d'un pas vers le wagon qui le précède. Rend 1 à la sortie, 0
// sinon.
//
// Anomalies : une longueur d'élément nulle ferait diviser par zéro, et planter le jeu (reproduit :
// exception) ; une direction hors de 0 à 3 laisserait la case de sortie indéterminée (variables
// locales non initialisées ; ici 0) : jamais vu.
//
// Sur la pile (voir ResteDePile), l'original ne laisse quelque chose que s'il remet le train en ligne :
// le masque des sorties calculé pour le dernier wagon posé.
export function wagonDansLElement(jeu, wagon, reste) {
  const maitre = objet(jeu, mot(jeu, wagon + 0x7E));
  let tete = wagon;
  if (mot(jeu, wagon + 0x45) !== 0) {
    tete = objet(jeu, mot(jeu, wagon + 0x45));
  } else {
    const vitesse = motSigne(jeu, wagon + 0xE);
    if (vitesse < 8 && vitesse > -8) {
      if (vitesse > 0) poserMot(jeu, wagon + 0xE, 8);
      else if (vitesse === 0) { poserMot(jeu, wagon + 0x14, 0); poserMot(jeu, wagon + 0xE, -8); }
      else poserMot(jeu, wagon + 0xE, -8);
    } else if (vitesse > 0xE0) {
      poserMot(jeu, wagon + 0xE, 0xE0);
    } else if (vitesse < -0xE0) {
      poserMot(jeu, wagon + 0xE, -0xE0);
    }
  }

  poserMot(jeu, wagon + 0x14, mot(jeu, wagon + 0x14) - mot(jeu, tete + 0xE));
  const pesanteur = tete === wagon && mot(jeu, maitre + 0x16) === 2;
  if (motSigne(jeu, tete + 0xE) > 0) {
    if (motSigne(jeu, wagon + 0x14) > 0) return 0;
    if (pesanteur) {
      subirLaPesanteur(jeu, wagon, maitre);
      if (motSigne(jeu, wagon + 0xE) < 0) return 0;
    }
    poserMot(jeu, wagon + 0x14, 0x40);
    poserMot(jeu, wagon + 0x7C, mot(jeu, wagon + 0x7C) + 1);
    if (octet(jeu, maitre + 0x80) > motSigne(jeu, wagon + 0x7C)) return 0;
  } else {
    if (motSigne(jeu, wagon + 0x14) < 0x40) return 0;
    if (pesanteur) {
      subirLaPesanteur(jeu, wagon, maitre);
      if (motSigne(jeu, wagon + 0xE) > 0) return 0;
    }
    poserMot(jeu, wagon + 0x14, 0);
    poserMot(jeu, wagon + 0x7C, mot(jeu, wagon + 0x7C) - 1);
    if (motSigne(jeu, wagon + 0x7C) > 0) return 0;
  }

  quitterLaListeDeLElement(jeu, wagon, maitre);

  // La case de sortie : celle qui touche le bout de l'élément vers lequel roule le train (dans la
  // direction du wagon en marche avant, à l'opposé en marche arrière), sur la colonne ou la rangée du
  // wagon ; il y est posé au bord qui touche l'élément.
  const enAvant = () => motSigne(jeu, tete + 0xE) > 0;
  let colonne = 0, rangee = 0, dx = 0, dy = 0;
  switch (octet(jeu, wagon + 0x12)) {
    case 0:
      dx = 0x80; colonne = octet(jeu, wagon + 7);
      if (enAvant()) { rangee = octet(jeu, maitre + 9) - 4; dy = 0xFF; } else { rangee = octet(jeu, maitre + 9) + 1; dy = 0; }
      break;
    case 1:
      dy = 0x80; rangee = octet(jeu, wagon + 9);
      if (enAvant()) { colonne = octet(jeu, maitre + 7) + 3; dx = 0; } else { colonne = octet(jeu, maitre + 7) - 1; dx = 0xFF; }
      break;
    case 2:
      dx = 0x80; colonne = octet(jeu, wagon + 7);
      if (enAvant()) { rangee = octet(jeu, maitre + 9) + 1; dy = 0; } else { rangee = octet(jeu, maitre + 9) - 4; dy = 0xFF; }
      break;
    case 3:
      dy = 0x80; rangee = octet(jeu, wagon + 9);
      if (enAvant()) { colonne = octet(jeu, maitre + 7) - 1; dx = 0xFF; } else { colonne = octet(jeu, maitre + 7) + 3; dx = 0; }
      break;
    default: break;
  }
  let x = ((colonne & 0xFF) << 8) | dx, y = ((rangee & 0xFF) << 8) | dy;

  poserMot(jeu, wagon + 0x7A, 0);
  poserOctet(jeu, wagon + 0x13, 0);
  poserOctet(jeu, wagon + 0xC, 0xA);
  jeu.appeler(DEPLACER, wagon, x, y);

  // Le dernier wagon dans le sens du déplacement : la tête en marche arrière, le dernier de la chaîne
  // en marche avant (et seulement si la tête roule déjà).
  const vitesse = motSigne(jeu, tete + 0xE);
  const dernier = (vitesse < 0 && wagon === tete)
    || (vitesse > 0 && mot(jeu, wagon + 0x61) === 0 && octet(jeu, tete + 0xC) === 0xA);
  if (!dernier) return 1;
  for (let n = mot(jeu, tete + 0x61); n !== 0;) {
    const w = objet(jeu, n);
    if (octet(jeu, w + 0xC) !== 0xA) return 1;
    n = mot(jeu, w + 0x61);
  }

  // Le train est sorti : la tête, en marche avant, est posée à l'entrée de sa case...
  if (motSigne(jeu, tete + 0xE) > 0) {
    switch (octet(jeu, tete + 0x12)) {
      case 0: poserOctet(jeu, tete + 6, 0x80); poserOctet(jeu, tete + 8, 0xFF); break;
      case 1: poserOctet(jeu, tete + 6, 0); poserOctet(jeu, tete + 8, 0x80); break;
      case 2: poserOctet(jeu, tete + 6, 0x80); poserOctet(jeu, tete + 8, 0); break;
      case 3: poserOctet(jeu, tete + 6, 0xFF); poserOctet(jeu, tete + 8, 0x80); break;
      default: break;
    }
  }
  // ... et chaque wagon derrière le précédent (x et y gardent d'un wagon à l'autre ce qui n'est pas
  // recalculé).
  let precedent = tete;
  for (let n = mot(jeu, tete + 0x61); n !== 0;) {
    const w = objet(jeu, n);
    [x, y] = placerDerriere(jeu, w, precedent, tete, x, y, reste);
    precedent = w;
    n = mot(jeu, w + 0x61);
  }
  // En marche arrière, les wagons qui suivent la tête sont encore déplacés d'un pas du train dans
  // leur direction, vers le wagon qui les précède.
  if (motSigne(jeu, tete + 0xE) >= 0) return 1;
  for (let n = mot(jeu, tete + 0x61); n !== 0;) {
    const w = objet(jeu, n);
    switch (octet(jeu, w + 0x12)) {
      case 0: y = u16(mot(jeu, w + 8) + mot(jeu, tete + 0xE)); x = mot(jeu, w + 6); break;
      case 1: x = u16(mot(jeu, w + 6) - mot(jeu, tete + 0xE)); y = mot(jeu, w + 8); break;
      case 2: y = u16(mot(jeu, w + 8) - mot(jeu, tete + 0xE)); x = mot(jeu, w + 6); break;
      case 3: x = u16(mot(jeu, w + 6) + mot(jeu, tete + 0xE)); y = mot(jeu, w + 8); break;
      default: break;
    }
    jeu.appeler(DEPLACER, w, x, y);
    n = mot(jeu, w + 0x61);
  }
  return 1;
}

// La pesanteur dans l'élément (0x42F13, 0x42FC8) : l'avancée ramenée à un angle de 0 à 255, et la
// tête perd 13 × sin(angle) / 256.
function subirLaPesanteur(jeu, tete, maitre) {
  const angle = diviser(motSigne(jeu, tete + 0x7C) << 8, octet(jeu, maitre + 0x80));
  const freinage = (motSigne(jeu, SINUS + angle * 2) * 13) >> 8;
  poserMot(jeu, tete + 0xE, motSigne(jeu, tete + 0xE) - freinage);
}

// Le wagon quitte la liste des wagons de l'élément. En milieu de liste, la recherche ne s'arrête pas
// au premier trouvé.
function quitterLaListeDeLElement(jeu, wagon, maitre) {
  let w = objet(jeu, mot(jeu, maitre + 0x7A));
  if (w === wagon) {
    poserMot(jeu, maitre + 0x7A, mot(jeu, wagon + 0x7A));
    return;
  }
  for (; w > debutDesObjets(jeu); w = objet(jeu, mot(jeu, w + 0x7A))) {
    if (numeroDe(jeu, wagon) === mot(jeu, w + 0x7A)) poserMot(jeu, w + 0x7A, mot(jeu, wagon + 0x7A));
  }
}

// Pose le wagon w derrière le wagon précédent (0x43366). Les sorties du morceau sous le précédent,
// moins sa propre direction, désignent la case d'où il vient (s'il n'a pas de sortie dans sa
// direction, c'est l'opposé de sa direction qui compte). Le wagon s'y pose, avec pour direction celle
// d'un wagon qui entre par l'autre sortie de ce morceau ; en marche avant il est posé au bord par
// lequel il y entre, en marche arrière au bord opposé. Rend x et y ; en dehors des directions 0 à 3,
// leurs octets bas restent ceux du wagon précédent. Seules la première règle et la direction 1 sont
// exercées par les scénarios. L'original range le masque dans son [ebp-8] (voir ResteDePile).
function placerDerriere(jeu, w, precedent, tete, x, y, reste) {
  let c = cellule(jeu, octet(jeu, precedent + 7), octet(jeu, precedent + 9));
  let voie = objetSurLaCase(jeu, c, TYPE_VOIE);
  const sorties = octet(jeu, elementDeVoie(jeu, voie, octet(jeu, voie + 0xC)) + 0x11);
  const bit = 1 << octet(jeu, precedent + 0x12);
  const masque = (sorties & bit) !== 0 ? sorties & ~bit : 1 << octet(jeu, OPPOSEES + octet(jeu, precedent + 0x12) * 2);
  reste.noter(masque);

  c = (c + motSigne(jeu, VOISINES + octetSigne(jeu, DIRECTION_DU_MASQUE + s16(masque)) * 2) * 4) >>> 0;
  voie = objetSurLaCase(jeu, c, TYPE_VOIE);
  const sortiesSuivantes = octet(jeu, elementDeVoie(jeu, voie, octet(jeu, voie + 0xC)) + 0x11);
  const autreSortie = ~octetSigne(jeu, MASQUE_OPPOSE + s16(masque)) & sortiesSuivantes;
  poserOctet(jeu, w + 0x12, octet(jeu, DIRECTION_DU_MASQUE + octetSigne(jeu, MASQUE_OPPOSE + autreSortie)));

  const numero = u16(numeroDeCase(jeu, c));
  const colonne = numero % 64, rangee = (numero >> 6) & 0xFF;
  const sens = motSigne(jeu, tete + 0xE) < 0 ? mot(jeu, OPPOSEES + octet(jeu, w + 0x12) * 2) : octet(jeu, w + 0x12);
  let dx = x & 0xFF, dy = y & 0xFF;
  switch (sens) {
    case 0: dx = 0x80; dy = 0xFF; break;
    case 1: dx = 0; dy = 0x80; break;
    case 2: dx = 0x80; dy = 0; break;
    case 3: dx = 0xFF; dy = 0x80; break;
    default: break;
  }
  x = (colonne << 8) | dx;
  y = (rangee << 8) | dy;
  jeu.appeler(DEPLACER, w, x, y);
  return [x, y];
}

// ================================================================================================
// Le bus
// ================================================================================================

// 0x613CA — le bus roule (état 0x14).
//
// Il avance tout droit de sa vitesse (+13) dans sa direction. Une fois par case (quand le compte à
// rebours +14 est écoulé, puis réarmé à 256 / vitesse), il regarde la case où il arrive :
//  - au bord de la carte (colonne ou rangée 0 ou 63), il quitte la carte : les visiteurs qu'il
//    remporte (chaîne +45) sont détruits ; ceux qui sont encore comptés dans un parc (octet +4F, le
//    joueur dans le parc duquel ils sont comptés ; −1 hors de tout parc) passent d'abord par la sortie
//    du parc (0x28752, qui compte leur départ) — ce cas-là n'est pas exercé par les scénarios : les
//    visiteurs qui prennent le bus y ont déjà été comptés partis. Le bus quitte sa case et passe dans
//    l'état 0x1A. Rend −1 ;
//  - si l'une des quatre cases voisines a pour sol l'arrêt de bus (image 0x88), il s'y arrête (état
//    0x16, dans 2 pas), en retenant la case de l'arrêt (+49), le côté où il l'a trouvé (+58) et l'état
//    à reprendre (+D).
// Rend 0 sinon.
//
// La case regardée est celle du point visé, même si 0x18A44 a refusé le déplacement (hors de la
// carte) : sans effet, le bus quittant le parc avant.
//
// Sur la pile (voir ResteDePile), l'original laisse toujours 0 : sa valeur de retour par défaut.
export function busEnRoute(jeu, bus, reste) {
  reste.noter(0);
  const direction = octet(jeu, bus + 0x12), vitesse = octet(jeu, bus + 0x13);
  const x = u16(mot(jeu, bus + 6) + octetSigne(jeu, PAS_DU_BUS + direction * 2) * vitesse);
  const y = u16(mot(jeu, bus + 8) + octetSigne(jeu, PAS_DU_BUS + direction * 2 + 1) * vitesse);
  jeu.appeler(DEPLACER_DANS_LA_CARTE, bus, x, y);

  poserMot(jeu, bus + 0x14, mot(jeu, bus + 0x14) - 1);
  if (motSigne(jeu, bus + 0x14) > 0) return 0;
  poserMot(jeu, bus + 0x14, dureeDUneCase(jeu, bus));

  const colonne = x >> 8, rangee = y >> 8;
  if (colonne === 0 || colonne === 0x3F || rangee === 0 || rangee === 0x3F) {
    for (let n = mot(jeu, bus + 0x45); n !== 0;) {
      const visiteur = objet(jeu, n);
      n = mot(jeu, visiteur + 0x45);
      if (octetSigne(jeu, visiteur + 0x4F) !== -1) jeu.appeler(SORTIR_DU_PARC, visiteur);
      else jeu.appeler(DETRUIRE, visiteur);
    }
    poserMot(jeu, bus + 0x45, 0);
    poserMot(jeu, bus + 0x47, 0);
    poserOctet(jeu, bus + 0xC, 0x1A);
    jeu.appeler(RETIRER_DE_SA_CASE, bus);
    return -1;
  }

  const c = cellule(jeu, colonne, rangee);
  for (let cote = 0; cote < 4; cote++) {
    const voisine = (c + motSigne(jeu, VOISINES + cote * 2) * 4) >>> 0;
    if (octet(jeu, voisine + 2) !== SOL_ARRET_DE_BUS) continue;
    poserMot(jeu, bus + 0x49, numeroDeCase(jeu, voisine));
    poserOctet(jeu, bus + 0xD, octet(jeu, bus + 0xC));
    poserOctet(jeu, bus + 0xC, 0x16);
    poserMot(jeu, bus + 0x14, 2);
    poserOctet(jeu, bus + 0x58, cote);
    poserOctet(jeu, bus + 5, octet(jeu, bus + 5) | 1);
    return 0;
  }
  return 0;
}

// 0x6160D — le bus à l'arrêt (état 0x16).
//
// Tous les 4 pas, le premier des visiteurs qui arrivent (chaîne +47) descend : il est posé au milieu
// de la case de l'arrêt, part à pied (état 2 du visiteur, avec la figure de sa sorte et le compte à
// rebours de sa vitesse) dans la direction 1 ou 3. Le hasard du jeu est tiré à chaque descente ; il
// ne décide pourtant que si l'arrêt a été trouvé du côté 0 (direction 1 si le tirage est pair) :
// sinon, le visiteur part toujours dans la direction 3 (reproduit). Quand il n'y a plus personne, le
// bus attend 100 pas (état 0x18) et rend 1 ; sinon 0.
//
// Sur la pile (voir ResteDePile), l'original ne laisse quelque chose qu'à une descente : dans les
// deux octets bas, l'abscisse fine du visiteur posé ; les deux autres restent tels qu'à l'entrée.
export function busALArret(jeu, bus, reste) {
  poserOctet(jeu, bus + 5, octet(jeu, bus + 5) & 0xFE);
  poserMot(jeu, bus + 0x14, mot(jeu, bus + 0x14) - 1);
  if (motSigne(jeu, bus + 0x14) > 0) return 0;
  poserMot(jeu, bus + 0x14, 4);

  const numero = mot(jeu, bus + 0x47);
  if (numero === 0) {
    poserOctet(jeu, bus + 0xC, 0x18);
    poserMot(jeu, bus + 0x14, 100);
    return 1;
  }
  const visiteur = objet(jeu, numero);
  poserMot(jeu, bus + 0x47, mot(jeu, visiteur + 0x47));
  const tirage = jeu.appeler(HASARD) & 1;
  poserOctet(jeu, visiteur + 0x12, (octet(jeu, bus + 0x58) + tirage === 0 ? 1 : -1) & 3);

  const arret = mot(jeu, bus + 0x49);
  const x = ((arret % 64) << 8) | 0x80, y = (((arret >> 6) & 0xFF) << 8) | 0x80;
  reste.noter((reste.valeur & 0xFFFF0000) | x);
  poserMot(jeu, visiteur + 0x14, dureeDUneCase(jeu, visiteur));
  poserOctet(jeu, visiteur + 0xC, 2);
  const figure = mot(jeu, SILHOUETTES + octet(jeu, visiteur + 0x59) * TAILLE_SILHOUETTE);
  poserMot(jeu, visiteur + 0xA, mot(jeu, pointeur(jeu, FIGURES) + figure * 2));
  jeu.appeler(DEPLACER_DANS_LA_CARTE, visiteur, x, y);
  return 0;
}

// 0x61772 — le bus attend avant de repartir (état 0x18). Le compte à rebours est testé avant d'être
// décompté : 100 donne 101 pas. Puis le bus réarme son compte d'une case et reprend l'état retenu à
// l'arrêt (+D). Rend 1 au départ, 0 sinon. Sur la pile (voir ResteDePile), l'original laisse, au
// départ, la durée d'une case.
export function busAttend(jeu, bus, reste) {
  const attente = motSigne(jeu, bus + 0x14);
  poserMot(jeu, bus + 0x14, attente - 1);
  if (attente > 0) return 0;
  const duree = dureeDUneCase(jeu, bus);
  reste.noter(duree);
  poserMot(jeu, bus + 0x14, duree);
  poserOctet(jeu, bus + 0xC, octet(jeu, bus + 0xD));
  return 1;
}

// `memoire: 'entiere'` : toutes écrivent dans les objets du parc, qui vivent dans le tas ; la
// comparaison appel par appel doit restaurer et comparer toute la mémoire. Le reste laissé sur la
// pile (avecLeReste), qu'elle ne compare pas, est éprouvé par le rejeu.
// 0x43A33 — l'état 0x20 d'un wagon : sorti de la voie, il vole dans sa direction (+0x12 : 0 vers le
// haut, 1 vers la droite, 2 vers le bas, 3 vers la gauche ; +0xE, sa vitesse) en perdant de
// l'altitude (+0x98 ; +0x14, la vitesse de chute, croît de 3 tous les quatre passages de la mise à
// jour) ; au sol, ou près des bords de la carte, il s'écrase : le sol de sa case devient l'image
// 0x28 et l'objet est détruit. Inatteignable en jeu : tout retrait de rail ferme d'abord
// l'attraction (en attente).
//
// Anomalies reproduites : la vitesse de chute croît encore dans l'objet détruit (remis à zéro) ; une
// direction au-delà de 3 laisse la position non calculée, et l'original passe alors à 0x18ADF ce que
// ses variables [ebp-4] et [ebp-8] contiennent — les restes de la routine précédente, que la
// réécriture relit au même endroit. Son [ebp-8] (voir ResteDePile) reçoit la nouvelle ordonnée, dans
// un mot long dont le mot haut est celui d'edx (directions 0 et 2) ou de l'adresse de l'objet (1, 3).
const SOL_ECRASE = 0x28;
const CARTE_A_REDESSINER = 0xD666E;
const PASSAGES = 0xD3AF8;           // mot long : les passages de la mise à jour des objets (simulation.js)
function wagonSortiDeLaVoie(jeu, o, reste) {
  const R = jeu.T.R, ebp = ((R.esp >>> 0) - 16) >>> 0;
  let x = mot(jeu, ebp - 4), y = mot(jeu, ebp - 8);
  const vitesse = mot(jeu, o + 0xE);
  switch (octet(jeu, o + 0x12)) {
    case 0: y = (mot(jeu, o + 8) - vitesse) & 0xFFFF; x = mot(jeu, o + 6); reste.noter((R.edx & ~0xFFFF) | y); break;
    case 1: x = (mot(jeu, o + 6) + vitesse) & 0xFFFF; y = mot(jeu, o + 8); reste.noter((o & ~0xFFFF) | y); break;
    case 2: y = (mot(jeu, o + 8) + vitesse) & 0xFFFF; x = mot(jeu, o + 6); reste.noter((R.edx & ~0xFFFF) | y); break;
    case 3: x = (mot(jeu, o + 6) - vitesse) & 0xFFFF; y = mot(jeu, o + 8); reste.noter((o & ~0xFFFF) | y); break;
    default: break;
  }
  jeu.appeler(DEPLACER, o, x, y);
  const colonne = octet(jeu, o + 7), rangee = octet(jeu, o + 9);
  if (!(colonne > 1 && colonne < 0x3E && rangee > 1 && rangee < 0x37)) poserMot(jeu, o + 0x98, 0);
  poserMot(jeu, o + 0x98, mot(jeu, o + 0x98) - mot(jeu, o + 0x14));
  if (motSigne(jeu, o + 0x98) <= 0) {
    const cellule = (pointeur(jeu, GRILLE) + 4 * ((octet(jeu, o + 9) << 6) + octet(jeu, o + 7))) >>> 0;
    poserOctet(jeu, cellule + 2, SOL_ECRASE);
    poserMot(jeu, CARTE_A_REDESSINER, 1);
    poserMot(jeu, o + 0x98, 0);
    jeu.appeler(DETRUIRE, o);
  }
  if ((octet(jeu, PASSAGES) & 3) === 0) poserMot(jeu, o + 0x14, mot(jeu, o + 0x14) + 3);
}

export const reecritures = [
  { adresse: 0x420C7, nom: 'wagonEnGare', fn: avecLeReste(wagonEnGare), arguments: 1, memoire: 'entiere' },
  { adresse: 0x42392, nom: 'wagonEnMarche', fn: avecLeReste(wagonEnMarche), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x42E06, nom: 'wagonDansLElement', fn: avecLeReste(wagonDansLElement), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x613CA, nom: 'busEnRoute', fn: avecLeReste(busEnRoute), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x6160D, nom: 'busALArret', fn: avecLeReste(busALArret), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x61772, nom: 'busAttend', fn: avecLeReste(busAttend), arguments: 1, retour: true, memoire: 'entiere' },
];

export const enAttente = [
  { adresse: 0x43A33, nom: 'wagonSortiDeLaVoie', fn: avecLeReste(wagonSortiDeLaVoie), arguments: 1, memoire: 'entiere' },
];

// Toutes les six sont exercées par simulation.json : aucune n'attend.
