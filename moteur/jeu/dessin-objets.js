// Le dessin des objets du parc, par type : les visiteurs, les kiosques des attractions et leur
// enseigne, le personnel, les boutiques, les morceaux de voie, l'entrée du parc et les panneaux
// indicateurs ; et trois auxiliaires : l'écriture dans la petite police, en 320x200 et en 640x480,
// et un bruitage qu'on ne relance pas s'il joue déjà.
//
// Réécriture lisible de 0x1C9E2, 0x1C5E9, 0x1E9A7, 0x1ECD6, 0x1F205, 0x1F8F8, 0x80E88, 0x80F34 et
// 0x80FE0. Voir docs/guide-reecriture.md.
//
// Le dessin d'une case (0x1C22A, objets.js) confie chaque objet du parc à la routine de son type,
// avec l'adresse de l'objet et le coin haut gauche de la case, dans l'espace logique de dessin, qui
// fait toujours 640 de large (docs/retro-ingenierie.md § 6.1). Ces routines tracent des objets
// graphiques (0x209B5, une chaîne de morceaux, voir objets.js) ou, pour les visiteurs au volant et
// les boutiques, les morceaux un à un. L'ordre des appels fait la profondeur : ce qui est tracé
// après passe devant. Une « figure » est un numéro de la table de mots [0xD3B38], qui donne un
// objet graphique ; le mot +6 d'un objet graphique désigne l'image suivante de son animation.
//
// OÙ L'OBJET EST POSÉ. Trois façons, toutes écrites en dur pour les deux modes (tuiles de 48x32 en
// 320x200, 24x16 en 640x480 ; seul L/2 est calculé depuis la largeur de tuile L) :
//   - à sa position fine (visiteurs, personnel, boutiques, objet animé du type 0x14) : les octets
//     +6 et +8 de l'objet sont la position dans la case, colonne et rangée, en 256es ; ils sont
//     projetés comme au § 5.1 : x + L × (+6) / 256 + (+8) / 16 (ou / 32), y + (+8) / 8 (ou / 16),
//     soit un tiers de tuile vers la droite par rangée descendue ;
//   - au milieu du bord bas de la case, (L/2 + L/3 − 1, H − 1) : kiosques, panneaux indicateurs,
//     objets fixes du type 0x14, comme les toilettes (objets.js) ;
//   - au centre, (L/2 + L/6, H/2) : l'entrée du parc, comme les décors fixes ; au centre exact,
//     (L/2, H/2), les morceaux de voie.
// Le programme choisit ces valeurs par `cmp word [0xDE5F6], 8` ; ailleurs il teste le bit 0
// (choix du traceur, des routines de texte) ou le bit 3 du mode : les trois tests sont reproduits
// tels quels, bien que le mode ne prenne que les valeurs 1 et 8.
//
// LA DÉSIGNATION À LA SOURIS. Tant que le bouton gauche est maintenu (mot 0xDE5AC, § 6.7), chaque
// routine confie l'objet qu'elle dessine à 0x20FF5, avec le point où elle le pose (coordonnées sur
// 16 bits non signés) : c'est elle qui regarde s'il est sous le pointeur et le sélectionne selon
// l'outil en cours. L'objet sélectionné (mot 0xD6678) reçoit une marque au-dessus de la tête, la
// figure 0x142, quand c'est un visiteur ou un employé.
//
// LES VARIABLES LOCALES EN MÉMOIRE. Les textes que l'original compose dans ses variables locales
// (sprintf, fenêtre d'une enseigne) doivent être en mémoire pour les routines qui les lisent : on
// les loge comme lui sur la pile, sous le point d'entrée (voir variablesLocales).
//
// VÉRIFICATION. Les cinq scénarios appellent les neuf fonctions, mais n'en parcourent pas tous les
// chemins ; ce qui n'est pas exercé est signalé à sa place (« non vérifié »). En bref : le jeu étant
// muet sous l'hôte (bruitages non initialisés), 0x80FE0 ne fait jamais que sa première vérification ;
// aucun visiteur n'y est sélectionné, désigné ni survolé avec l'outil 8, ni dans les états 0x12,
// 0x18, 0x32, 0x36, 0x44 à 0x48 et 0x4E ; aucun employé en grève ou renvoyé, ni mécanicien au
// travail ; aucune boutique n'a de client ; la vue réduite n'est jamais active ; aucun monorail.
// Ces chemins-là ont été éprouvés sur des états fabriqués — les objets du parc modifiés le temps
// d'une image, puis remis en place, en 320x200, en 640x480 et avec une carte son —, transcription et
// réécriture comparées appel par appel : 0 divergence. Ce n'est pas une preuve au sens du guide.

import { ADRESSES } from './etat.js';
import { ecran } from './grande-vue.js';

const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

// Accès à la mémoire du jeu, petit-boutiste.
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const motLong = (jeu, a) => jeu.dv.getUint32(a, true);
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserMotLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// Division entière du processeur (idiv) : tronquée vers zéro ; un diviseur nul lève une exception,
// comme sur la machine (et comme la transcription).
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}
function reste(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a % b) | 0;
}

// --- les tables du dessin (objets.js) ---------------------------------------------------------
const OBJETS_GRAPHIQUES = 0xD3B80;  // pointeur : objets graphiques, 8 octets (+0 premier morceau,
                                    // +2 largeur et +3 hauteur d'emprise, +6 l'image suivante)
const MORCEAUX = 0xD3B7C;           // pointeur : morceaux, 10 octets (+0 image, +2 dx, +4 dy,
                                    // +6 drapeaux du traceur, +8 morceau suivant)
const IMAGES = 0xD3BB8;             // pointeur : images, 6 octets (+0 pixels, +4 largeur, +5 hauteur)
const FIGURES = 0xD3B38;            // pointeur : table de mots, figure → objet graphique
const DRAPEAUX_TRACEUR = 0xBECBC;   // mot : drapeaux de la prochaine image (§ 6.5)
const FACON_DE_DESSINER = 0xD667C;  // mot : 0, ou 8 pour la vue réduite (objets.js)
const VUE_REDUITE = 8;
const REDUCTION_LARGEUR = 0xD6640;  // mots : les diviseurs de la vue réduite
const REDUCTION_HAUTEUR = 0xD6642;
// Le bit 7 des drapeaux d'un morceau n'est pas un drapeau du traceur : il marque une image qui
// dépend du genre d'un visiteur (le conducteur d'une auto, le client d'une boutique).
const MORCEAU_HABILLE = 0x80;

// --- la carte, les objets ---------------------------------------------------------------------
const GRILLE = 0xD3B08;             // pointeur : 64x64 cellules de 4 octets (§ 6.2)
const OBJETS_DU_PARC = 0xD3B10;     // pointeur : les objets du parc, 200 octets, numérotés dès 1
const FIN_DES_OBJETS_DU_PARC = 0xD3B78;
const TAILLE_OBJET = 200;
const SOLS = 0xB44D9;               // 4 octets par image de sol : mot de drapeaux (§ 10.7), forme
const SOL_CIRCUIT = 0x40;           //   le circuit d'une attraction (le canal des bouées)
const SOL_SOUS_LA_VOIE = 0x400;     //   non établi (voir dessinerMorceauDeVoie)
const DECHET_VOMI = 4;              // octet +3 d'une cellule : bit 2, du vomi (§ 6.2)

// Les champs d'un objet du parc que lisent ces routines (le reste selon le type, plus bas).
const IMAGE = 0xA;                  // mot : l'objet graphique affiché, ou une figure (type 0x14)
const ETAT = 0xC;                   // octet
const DIRECTION = 0x12;             // octet : 0 haut de la carte, 1 droite, 2 bas, 3 gauche
const COMPTE = 0x14;                // mot : un compte à rebours, en pas de simulation
const LIEN = 0x16;                  // mot : un genre, ou le numéro d'un autre objet

// --- l'écran et l'interface -------------------------------------------------------------------
const MODE = ADRESSES.modeAffichage;        // mot : 1 (320x200) ou 8 (640x480)
const SURFACE = ADRESSES.tamponEcran;       // pointeur : la surface de dessin
const LIGNE_DE_LA_SURFACE = 0xDE5B8;        // mot long : octets par ligne de la surface (320, 640)
const PAS_DE_SIMULATION = ADRESSES.pasDeSimulation;   // mot long ; son octet bas cadence les animations
const ECRAN_COURANT = ADRESSES.ecranCourant;  // mot : 0 = la vue du parc
const SELECTION = 0xD6678;          // mot : le numéro de l'objet sélectionné, 0 = aucun
const BOUTON_GAUCHE_MAINTENU = 0xDE5AC;     // mot : les objets testent s'ils sont sous le pointeur
const OUTIL = 0xD6670;              // mot : l'outil en cours
const OUTIL_PENSEES = 8;            // l'outil qui fait parler les visiteurs survolés (non établi)
const SOURIS_X = ADRESSES.sourisX, SOURIS_Y = ADRESSES.sourisY;
const BRUITAGE_JOUE = 0xD6630;      // mot : 1 quand le visiteur sélectionné a fait entendre son humeur
                                    // dans cette image ; 0x1B837 le remet à 0 à chaque image
const AFFICHAGE_DE_DEBOGAGE = 0xD6684;  // mot : jamais écrit par le programme (voir dessinerVisiteur)
const INTEMPERIES = 0xB14CC;        // octet : bits 0 à 2, la pluie ou la neige (météo, 0x12B1F)

// --- les fonctions appelées -------------------------------------------------------------------
const DESSINER_OBJET = 0x209B5;             // (objet graphique, x, y)
const DESSINER_MORCEAUX = 0x20BEB;          // (objet graphique, premier, nombre, x, y)
const DESSINER_CASE = 0x1C22A;              // (contenu de la cellule, x, y)
const TRACER_IMAGE = 0x5EC9C;               // (x, y, image) : en 320x200
const TRACER_IMAGE_MARQUEE = 0x55BD4;       // (x, y, image) : en 640x480, marque les blocs (§ 6.6)
const TRACER_EN_REDUCTION = 0x67182;        // (objet graphique, x, y, largeur, hauteur)
const TRACER_IMAGE_REDUITE = 0x66DFA;       // (image, x, y, largeur, hauteur)
const DESIGNER_SOUS_LE_POINTEUR = 0x20FF5;  // (objet, x, y)
const PREMIER_OBJET_DU_TYPE = 0x204B9;      // (cellule, type) : le premier objet de ce type, ou 0
const DESSINER_ELEMENT_DE_VOIE = 0x1FEB5;   // (morceau de voie, x, y, hauteur)
const ECRIRE_TEXTE = 0x3F49E;               // (x, y, texte, 0, couleur) : la police des écrans
const SPRINTF = 0x7F652;                    // sprintf de la bibliothèque C
const STRLEN = 0x7E822;                     // strlen
const ECRIRE_320 = 0x80E88, ECRIRE_640 = 0x80F34, BRUITAGE = 0x80FE0;   // ce module

const pointeur = (jeu, a) => motLong(jeu, a);
const objetDuParc = (jeu, numero) => (pointeur(jeu, OBJETS_DU_PARC) + u16(numero) * TAILLE_OBJET) >>> 0;
const estSelectionne = (jeu, objet) => objetDuParc(jeu, mot(jeu, SELECTION)) === objet;
const objetGraphique = (jeu, n) => (pointeur(jeu, OBJETS_GRAPHIQUES) + u16(n) * 8) >>> 0;
const imageSuivante = (jeu, n) => mot(jeu, objetGraphique(jeu, n) + 6);
const morceau = (jeu, n) => (pointeur(jeu, MORCEAUX) + u16(n) * 10) >>> 0;
const figure = (jeu, numero) => mot(jeu, (pointeur(jeu, FIGURES) + 2 * numero) >>> 0);
const largeurImage = (jeu, image) => octet(jeu, image + 4);
const hauteurImage = (jeu, image) => octet(jeu, image + 5);
const celluleDe = (jeu, objet) =>
  (pointeur(jeu, GRILLE) + (octet(jeu, objet + 9) * 64 + octet(jeu, objet + 7)) * 4) >>> 0;
const modeVaut8 = (jeu) => mot(jeu, MODE) === 8;
const tousLes = (jeu, n) => (octet(jeu, PAS_DE_SIMULATION) & (n - 1)) === 0;
const poserDrapeaux = (jeu, d) => poserMot(jeu, DRAPEAUX_TRACEUR, d);

// Le tracé d'une image : en 320x200, l'écran entier est recopié à chaque tour ; en 640x480, seuls
// les blocs marqués le sont (§ 6.6), d'où le second traceur. Choisi par le bit 0 du mode.
function tracerImage(jeu, x, y, image) {
  jeu.appeler(jeu.etat.basseResolution ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE, x, y, image);
}

function dessinerObjet(jeu, index, x, y) {
  jeu.appeler(DESSINER_OBJET, u16(index), s16(x), s16(y));
}

// Les points de pose (voir l'en-tête). Les valeurs rendues sont celles, sur 32 bits, que l'original
// garde dans ses variables ; il n'en passe que les 16 bits bas, signés, aux routines de tracé.
function positionFine(jeu, objet, x, y) {
  const haute = modeVaut8(jeu);
  const fx = octet(jeu, objet + 6), fy = octet(jeu, objet + 8);
  return [
    s16(x) + ((jeu.etat.largeurTuile * fx) >> 8) + (fy >> (haute ? 5 : 4)),
    s16(y) + (fy >> (haute ? 4 : 3)),
  ];
}

function pointDuBordBas(jeu, x, y) {
  const haute = modeVaut8(jeu);
  return [s16(x) + (jeu.etat.largeurTuile >> 1) + (haute ? 7 : 15), s16(y) + (haute ? 15 : 31)];
}

// Les variables locales de l'original qui doivent être en mémoire : on descend le pointeur de pile
// de `taille` octets, comme le fait son `enter`, et l'on rend l'adresse de la zone ainsi réservée ;
// les appels suivants empilent plus bas. L'enveloppe (index.js) remet la pile à sa place au retour.
// Cette mémoire est morte après le retour, comme les variables de l'original.
function variablesLocales(jeu, taille) {
  const T = jeu.T;
  T.sauver();
  const bas = ((T.R.esp >>> 0) - taille) >>> 0;
  T.R.esp = bas | 0;
  T.charger();
  return bas;
}

// =============================================================================================
// LES VISITEURS (type 2)
// =============================================================================================
//
// Champs lus : +5 drapeaux (bit 0 : il ressort des toilettes, vraisemblablement ; 0x40 : il a
// quelque chose à exprimer ; 0x80 : il a un parapluie), +6/+8 la position fine, +7/+9 sa case, +A
// l'objet graphique, +C l'état, +12 la direction, +13 la vitesse, +14 le compte à rebours, +52 les
// objets achetés et les jeux faits (un bit chacun), +54 le contentement, +59 le genre de visiteur (0
// à 7), +5F une hauteur (états 0x32, 0x44 à 0x48), +6F l'argent, +82 la fatigue, +8B le délai
// avant une émotion, +8C le temps de l'animation des objets portés, +B1 un agrandissement (états 0x44
// et 0x46), +B7 et +B9 la bulle de pensée (une figure, et sa durée).
//
// Selon l'état (octet +C ; aiguillage par la table d'états 0x1C9EE et la table de sauts 0x1CA0F) :
//   0x4E  aux toilettes : pas dessiné ; au premier pas (+14 = 1), le bruitage 0x14 (la chasse d'eau ?)
//   0x48, 0x46, 0x44  tracé agrandi par 0x67182 (voir dessinerAgrandi) ; sens non établi
//   0x36  au volant d'une auto (RACE CAR RIDE) : l'auto et son conducteur, morceau par morceau
//   0x32  soulevé de la hauteur +5F (sens non établi)
//   0x1A  il s'arrête un instant (une émotion) : s'il est sélectionné, il fait entendre son humeur,
//         une fois par image ; puis comme 8
//   0x18  il ressort d'une boutique ou des toilettes : le bruitage 0x10 si le bit 0 de +5 est posé
//   0x12  sur le circuit d'une attraction (le canal des bouées) : dessiné seulement sur les cases
//         dont le sol est exactement le circuit (drapeaux 0x40) — invisible ailleurs (sous un pont ?)
//   0x10  il descend de l'attraction : un peu plus haut au début (table 0xB16D8)
//   8     il se promène : au premier pas d'une case souillée de vomi, le bruitage 0x26
//   0x4C, 0x4A, 0x42, 0x40, 0x3E, 0x3C, 0x3A, 0x38, 0x34, 0x2E, 0x2C, 0x2A, 0x28, 0x22, 0x20, 0x1E,
//   0x14, 0xC, 0xA, 6, 4, 2 : dessiné normalement
//   tout autre état (0xE à bord, 0x16 au jeu d'adresse, 0x1C dans le bus…) : pas dessiné.
//
// Le dessin normal (0x1CF61) : le parapluie par temps de pluie, derrière ; le visiteur ; les objets
// qu'il porte ; sa bulle de pensée ; avec l'outil 8, le survol ; sa marque s'il est sélectionné.
// Dans la file d'attente (état 0xC), il est dessiné 8 pixels plus haut quand un objet de type 0x1A
// est sur sa case (les voyous, vraisemblablement : non établi).
//
// Vérifié par demo.json et simulation.json : états 2, 4, 8, 0xA, 0xC, 0xE, 0x10, 0x1A, 0x3C, les
// bulles, les objets portés (bits 4, 7 et 9), le parapluie. Non vérifié : tous les autres états
// ci-dessus, le visiteur sélectionné, désigné ou survolé, les bruitages (le jeu est muet).

const VISITEUR_DRAPEAUX = 5;
const PARAPLUIE = 0x80, A_EXPRIMER = 0x40, SORT_DES_TOILETTES = 1;
const VISITEUR_OBJETS_PORTES = 0x52;
const VISITEUR_CONTENTEMENT = 0x54;
const VISITEUR_GENRE = 0x59;
const VISITEUR_HAUTEUR = 0x5F;
const VISITEUR_ARGENT = 0x6F;
const VISITEUR_FATIGUE = 0x82;
const VISITEUR_DELAI_EMOTION = 0x8B;
const VISITEUR_TEMPS_DES_OBJETS = 0x8C;
const VISITEUR_AGRANDISSEMENT = 0xB1;
const VISITEUR_BULLE = 0xB7, VISITEUR_DUREE_BULLE = 0xB9;

const FIGURE_SELECTION = 0x142;     // la marque au-dessus de l'objet sélectionné
const FIGURE_PARAPLUIE = 0x236;
// Les objets portés : une figure par bit du mot +52 (table de mots 0xB53A2) ; 0 = rien à dessiner.
// Dans la démo, le bit 9 (octet +53, bit 1 : il a gagné au jeu d'adresse, § 10.2) donne la figure
// 0x27C. Pour les bits 12 à 15, la table lit au-delà de ses douze premiers mots (1, 0x47, 2, 1) :
// vraisemblablement une autre table (non établi, jamais vu).
const OBJETS_PORTES = 0xB53A2;
// L'humeur que fait entendre le visiteur sélectionné (état 0x1A) : un bruitage par genre de visiteur,
// selon son contentement : négatif, sous le seuil « content » (mot +0 de la fiche du parc), au-delà.
const BRUITAGES_MECONTENT = 0xB4C9A, BRUITAGES_NEUTRE = 0xB4CAA, BRUITAGES_CONTENT = 0xB4CBA;
const FICHE_DU_PARC = 0xD3818;      // pointeur : +0 le seuil du contentement (§ 10.8)
// La descente d'une attraction (état 0x10) : pour chaque direction, quatre décalages (dx, dy) en
// octets signés, choisis par le temps qui reste (+14 × vitesse / 64) : 0, 0, −4, −8 vers le haut.
const DESCENTE = 0xB16D8;
// Au volant : pour chaque morceau habillé, l'image est cherchée parmi les 47 de la première rangée
// de la table 0xB9A78, et remplacée par celle de même rang dans la rangée du genre du visiteur
// (47 mots par genre).
const HABITS_DES_VISITEURS = 0xB9A78, NOMBRE_HABITS_VISITEURS = 0x2F;
const TYPE_VOYOU = 0x1A;            // l'objet qui fait monter le visiteur dans la file (non établi)
const FORMAT_NOMBRE = 0xB00FB;      // "%d"
const COULEUR_DES_GENRES = 0xE6;    // couleur du texte de déboguage : 0xE6 + genre

// 0x1C9E2 — dessiner un visiteur.
export function dessinerVisiteur(jeu, visiteur, x, y) {
  switch (octet(jeu, visiteur + ETAT)) {
    case 0x4E:                                   // aux toilettes
      if (mot(jeu, visiteur + COMPTE) === 1) jeu.appeler(BRUITAGE, 0, 0x14);
      return;
    case 0x48: dessinerAgrandi48(jeu, visiteur, x, y); return;
    case 0x46: case 0x44: dessinerAgrandi44(jeu, visiteur, x, y); return;
    case 0x36: dessinerAuVolant(jeu, visiteur, x, y); return;
    case 0x32: dessinerSouleve(jeu, visiteur, x, y); return;
    case 0x1A:                                   // une émotion
      faireEntendreSonHumeur(jeu, visiteur);
      signalerLeVomi(jeu, visiteur);
      break;
    case 0x18:                                   // il ressort d'une boutique ou des toilettes
      if (octet(jeu, visiteur + VISITEUR_DRAPEAUX) & SORT_DES_TOILETTES) jeu.appeler(BRUITAGE, 0, 0x10);
      break;
    case 0x12:                                   // sur le circuit d'une attraction
      if (mot(jeu, SOLS + 4 * octet(jeu, celluleDe(jeu, visiteur) + 2)) !== SOL_CIRCUIT) return;
      break;
    case 0x10: {                                 // il descend de l'attraction
      const temps = s16(diviser(motSigne(jeu, visiteur + COMPTE) * octet(jeu, visiteur + 0x13), 64));
      const rang = 2 * (octet(jeu, visiteur + DIRECTION) * 4 + temps);
      x += octetSigne(jeu, DESCENTE + rang);
      y += octetSigne(jeu, DESCENTE + rang + 1);
      break;
    }
    case 8:                                      // il se promène
      signalerLeVomi(jeu, visiteur);
      break;
    case 0x4C: case 0x4A: case 0x42: case 0x40: case 0x3E: case 0x3C: case 0x3A: case 0x38:
    case 0x34: case 0x2E: case 0x2C: case 0x2A: case 0x28: case 0x22: case 0x20: case 0x1E:
    case 0x14: case 0x0C: case 0x0A: case 0x06: case 0x04: case 0x02:
      break;
    default:                                     // à bord, au jeu d'adresse, dans le bus… : invisible
      return;
  }
  dessinerLeVisiteur(jeu, visiteur, x, y);
}

// Le visiteur sélectionné, arrêté par une émotion, fait entendre son humeur — une fois par image.
function faireEntendreSonHumeur(jeu, visiteur) {
  if (mot(jeu, BRUITAGE_JOUE) !== 0 || !estSelectionne(jeu, visiteur)) return;
  const contentement = motSigne(jeu, visiteur + VISITEUR_CONTENTEMENT);
  const genre = 2 * octet(jeu, visiteur + VISITEUR_GENRE);
  let table = BRUITAGES_CONTENT;
  if (contentement < 0) table = BRUITAGES_MECONTENT;
  else if (contentement < motSigne(jeu, pointeur(jeu, FICHE_DU_PARC))) table = BRUITAGES_NEUTRE;
  jeu.appeler(BRUITAGE, 0, motSigne(jeu, table + genre));
  poserMot(jeu, BRUITAGE_JOUE, 1);
}

// Au premier pas d'une case souillée de vomi, le bruitage 0x26.
function signalerLeVomi(jeu, visiteur) {
  if (mot(jeu, visiteur + COMPTE) !== 1) return;
  if (octet(jeu, celluleDe(jeu, visiteur) + 3) & DECHET_VOMI) jeu.appeler(BRUITAGE, 0, 0x26);
}

// 0x1CF61 — le dessin normal d'un visiteur.
function dessinerLeVisiteur(jeu, visiteur, x, y) {
  let [xv, yv] = positionFine(jeu, visiteur, x, y);
  // Dans la file d'attente, un objet de type 0x1A sur sa case le fait monter de 8 pixels.
  if (octet(jeu, visiteur + ETAT) === 0x0C && jeu.appeler(PREMIER_OBJET_DU_TYPE, celluleDe(jeu, visiteur), TYPE_VOYOU) !== 0) {
    yv -= 8;
  }
  // Par temps de pluie ou de neige, son parapluie, tracé avant lui : derrière.
  if ((octet(jeu, INTEMPERIES) & 7) !== 0 && (octet(jeu, visiteur + VISITEUR_DRAPEAUX) & PARAPLUIE)) {
    dessinerObjet(jeu, figure(jeu, FIGURE_PARAPLUIE), xv, yv);
  }
  dessinerObjet(jeu, mot(jeu, visiteur + IMAGE), xv, yv);
  if (mot(jeu, visiteur + VISITEUR_OBJETS_PORTES) !== 0) dessinerLesObjetsPortes(jeu, visiteur, xv, yv);
  // La bulle de pensée, tant qu'elle dure (la durée est décomptée par la simulation).
  if (octet(jeu, visiteur + VISITEUR_DUREE_BULLE) !== 0) {
    dessinerObjet(jeu, figure(jeu, mot(jeu, visiteur + VISITEUR_BULLE)), xv, yv);
  }
  if (mot(jeu, OUTIL) === OUTIL_PENSEES) survolerAvecLOutil8(jeu, visiteur, xv, yv);
  if (estSelectionne(jeu, visiteur)) dessinerLaMarque(jeu, visiteur, xv, yv);
  if (mot(jeu, SELECTION) !== 0 && estSelectionne(jeu, visiteur) && mot(jeu, ECRAN_COURANT) === 0 &&
      mot(jeu, AFFICHAGE_DE_DEBOGAGE) !== 0) {
    afficherSesChiffres(jeu, visiteur, xv, yv);
  }
}

// Les objets qu'il porte : pour chaque bit du mot +52, sa figure s'il en a une, animée sur quatre
// images qui avancent d'un cran tous les 8 pas (le compte +8C) ; l'animation s'arrête à la dernière
// image d'une chaîne plus courte.
function dessinerLesObjetsPortes(jeu, visiteur, xv, yv) {
  for (let bits = mot(jeu, visiteur + VISITEUR_OBJETS_PORTES), rang = 0; bits !== 0; bits >>>= 1, rang++) {
    if ((bits & 1) === 0 || mot(jeu, OBJETS_PORTES + 2 * rang) === 0) continue;
    let g = objetGraphique(jeu, figure(jeu, mot(jeu, OBJETS_PORTES + 2 * rang)));
    for (let n = reste(mot(jeu, visiteur + VISITEUR_TEMPS_DES_OBJETS), 4); n !== 0 && mot(jeu, g + 6) !== 0; n--) {
      g = objetGraphique(jeu, mot(jeu, g + 6));
    }
    dessinerObjet(jeu, (g - pointeur(jeu, OBJETS_GRAPHIQUES)) >> 3, xv, yv);
  }
  if (tousLes(jeu, 8)) poserMot(jeu, visiteur + VISITEUR_TEMPS_DES_OBJETS, mot(jeu, visiteur + VISITEUR_TEMPS_DES_OBJETS) + 1);
}

// L'outil 8 : quand le pointeur est sur l'emprise du visiteur (sa largeur centrée sur lui, sa
// hauteur au-dessus de ses pieds), il est proposé à la désignation, et, si son délai d'émotion est
// écoulé, il aura quelque chose à exprimer (drapeau 0x40, lu par la simulation). Non vérifié.
function survolerAvecLOutil8(jeu, visiteur, xv, yv) {
  const g = objetGraphique(jeu, mot(jeu, visiteur + IMAGE));
  const demiLargeur = octet(jeu, g + 2) >> 1;
  const sx = motSigne(jeu, SOURIS_X), sy = motSigne(jeu, SOURIS_Y);
  if (sx < s16(xv) - demiLargeur || sx >= demiLargeur + s16(xv)) return;
  if (sy < s16(yv) - octet(jeu, g + 3) || sy >= s16(yv)) return;
  if (mot(jeu, BOUTON_GAUCHE_MAINTENU) !== 0) jeu.appeler(DESIGNER_SOUS_LE_POINTEUR, visiteur, u16(xv), u16(yv));
  if (octetSigne(jeu, visiteur + VISITEUR_DELAI_EMOTION) <= 0) {
    jeu.m8[visiteur + VISITEUR_DRAPEAUX] |= A_EXPRIMER;
  }
}

// La marque de l'objet sélectionné, posée au-dessus de sa tête : la hauteur d'emprise de son image.
function dessinerLaMarque(jeu, objet, xo, yo) {
  const g = objetGraphique(jeu, mot(jeu, objet + IMAGE));
  dessinerObjet(jeu, figure(jeu, FIGURE_SELECTION), xo, yo - octet(jeu, g + 3));
}

// Un affichage de déboguage : le contentement, l'argent et la fatigue du visiteur sélectionné, en
// trois lignes, dans la couleur de son genre. Le mot 0xD6684 qui l'autorise n'est écrit nulle part
// dans le programme : code mort, reproduit, jamais exercé.
function afficherSesChiffres(jeu, visiteur, xv, yv) {
  const tampon = variablesLocales(jeu, 0x10);
  const couleur = u16(octet(jeu, visiteur + VISITEUR_GENRE) + COULEUR_DES_GENRES);
  const ecrire = jeu.etat.basseResolution ? ECRIRE_320 : ECRIRE_640;
  const lignes = [
    [motSigne(jeu, visiteur + VISITEUR_CONTENTEMENT), 0],
    [mot(jeu, visiteur + VISITEUR_ARGENT), 0xC],
    [motSigne(jeu, visiteur + VISITEUR_FATIGUE), 0x18],
  ];
  for (const [valeur, dy] of lignes) {
    jeu.appeler(SPRINTF, tampon, FORMAT_NOMBRE, valeur);
    jeu.appeler(ecrire, s16(xv), s16(yv + dy), tampon, couleur);
  }
}

// État 0x36 — au volant d'une auto. L'objet graphique est l'auto avec un conducteur ; ses morceaux
// habillés sont remplacés par ceux du genre du visiteur, recentrés en largeur et calés par le bas.
// Le morceau habillé dont l'image n'est pas dans la table n'est pas tracé. Ni parapluie, ni bulle,
// ni marque, ni désignation. Anomalie reproduite : le test d'image d'un morceau ordinaire porte sur
// son adresse, jamais nulle, et non sur son décalage : un morceau sans image (décalage 0) serait
// tracé avec l'image 0 de la table (0x209B5, lui, le saute). Non vérifié par les scénarios.
function dessinerAuVolant(jeu, visiteur, x, y) {
  const [xv, yv] = positionFine(jeu, visiteur, x, y);
  const images = pointeur(jeu, IMAGES);
  const genre = octet(jeu, visiteur + VISITEUR_GENRE);
  for (let n = mot(jeu, objetGraphique(jeu, mot(jeu, visiteur + IMAGE))); n !== 0;) {
    const m = morceau(jeu, n);
    if (octet(jeu, m + 6) & MORCEAU_HABILLE) {
      for (let i = 0; i < NOMBRE_HABITS_VISITEURS; i++) {
        if (mot(jeu, HABITS_DES_VISITEURS + 2 * i) !== mot(jeu, m)) continue;
        if (mot(jeu, FACON_DE_DESSINER) === VUE_REDUITE) break;
        const habit = (images + mot(jeu, HABITS_DES_VISITEURS + genre * 2 * NOMBRE_HABITS_VISITEURS + 2 * i)) >>> 0;
        const ancienne = (images + mot(jeu, m)) >>> 0;
        const xi = (largeurImage(jeu, ancienne) >> 1) + (s16(xv) - (largeurImage(jeu, habit) >> 1));
        const yi = yv - hauteurImage(jeu, habit) + hauteurImage(jeu, ancienne);
        poserDrapeaux(jeu, mot(jeu, m + 6));
        tracerImage(jeu, s16(xi + motSigne(jeu, m + 2)), s16(yi + motSigne(jeu, m + 4)), habit);
        break;
      }
      poserDrapeaux(jeu, 0);
    } else {
      const image = (images + mot(jeu, m)) | 0;
      if (image !== 0 && mot(jeu, FACON_DE_DESSINER) !== VUE_REDUITE) {
        poserDrapeaux(jeu, mot(jeu, m + 6));
        tracerImage(jeu, s16(xv + motSigne(jeu, m + 2)), s16(yv + motSigne(jeu, m + 4)), image >>> 0);
        poserDrapeaux(jeu, 0);
      }
    }
    n = mot(jeu, m + 8);
  }
}

// État 0x32 — soulevé de la hauteur +5F (divisée par deux en 640x480, par le bit 3 du mode). Seul
// l'objet graphique est tracé. Non vérifié.
function dessinerSouleve(jeu, visiteur, x, y) {
  const [xv, yv] = positionFine(jeu, visiteur, x, y);
  const hauteur = mot(jeu, visiteur + VISITEUR_HAUTEUR);
  const ys = jeu.etat.hauteResolution ? s16(yv) - (hauteur >> 1) : yv - hauteur;
  dessinerObjet(jeu, mot(jeu, visiteur + IMAGE), xv, ys);
}

// États 0x44 et 0x46 — tracé par 0x67182, qui ramène l'objet graphique à une emprise donnée : ici
// son emprise agrandie de 10 × l'octet +B1 dans les deux sens, soulevé de la hauteur +5F / 2 (/ 4 en
// 640x480). Rien en vue réduite. Sens non établi. Non vérifié.
function dessinerAgrandi44(jeu, visiteur, x, y) {
  if (mot(jeu, FACON_DE_DESSINER) === VUE_REDUITE) return;
  const g = objetGraphique(jeu, mot(jeu, visiteur + IMAGE));
  const [xv, yv] = positionFine(jeu, visiteur, x, y);
  const agrandi = octet(jeu, visiteur + VISITEUR_AGRANDISSEMENT) * 10;
  const hauteur = mot(jeu, visiteur + VISITEUR_HAUTEUR) >> 1;
  const ys = jeu.etat.hauteResolution ? s16(yv) - (hauteur >> 1) : s16(yv) - hauteur;
  jeu.appeler(TRACER_EN_REDUCTION, mot(jeu, visiteur + IMAGE), s16(xv), s16(ys),
    u16(octet(jeu, g + 2) + agrandi), u16(octet(jeu, g + 3) + agrandi));
}

// État 0x48 — de même, l'emprise agrandie de 32 × la hauteur +5F, sans le soulever. Non vérifié.
function dessinerAgrandi48(jeu, visiteur, x, y) {
  if (mot(jeu, FACON_DE_DESSINER) === VUE_REDUITE) return;
  const g = objetGraphique(jeu, mot(jeu, visiteur + IMAGE));
  const [xv, yv] = positionFine(jeu, visiteur, x, y);
  const agrandi = mot(jeu, visiteur + VISITEUR_HAUTEUR) << 5;
  jeu.appeler(TRACER_EN_REDUCTION, mot(jeu, visiteur + IMAGE), s16(xv), s16(yv),
    u16(octet(jeu, g + 2) + agrandi), u16(octet(jeu, g + 3) + agrandi));
}

// =============================================================================================
// LES KIOSQUES DES ATTRACTIONS (types 6 et 0x1C)
// =============================================================================================
//
// Un kiosque est rattaché à une attraction (+16 : son numéro) ; il est posé au milieu du bord bas
// de sa case, tourné selon sa direction (+12). Son objet graphique (+A) nul, rien n'est tracé (le
// second kiosque des attractions à voie, type 0x1C, dans la démo). Il porte une enseigne qui fait
// défiler, six caractères à la fois, le texte « NOM a.b  », sprintf("%s %d.%d  ") du nom du genre
// (fiche du catalogue 0xCCED0) et de l'octet +C6 de la fiche en dixièmes (MERRY-GO-ROUND 0.6 dans
// la démo ; sens non établi). Le défilement avance d'un caractère tous les 8 pas de simulation :
// c'est l'octet +BB de l'attraction, que ce dessin incrémente — il n'avance donc que si le kiosque
// est dessiné.
//
// L'enseigne est placée par une table de décalages (dx, dy) par direction, en octets signés, pour
// 320x200 et divisés par deux en 640x480 : 0xB16C8 en général, 0xB16D0 quand le mot +2E de la fiche
// vaut 0x26A (le BIG DIPPER dans la démo ; les autres genres de la démo y ont 0x13C ; sens non
// établi). Elle n'est écrite que si elle tient dans l'écran : x entre 1 et 640 − 6 caractères (de 8,
// ou de 4 en 640x480), y entre 1 et la hauteur logique − 12 (ou − 6), dans la petite police
// (0x80E88, 0x80F34), couleur l'octet 0xD7773.
//
// Vérifié par demo.json, simulation.json et construction.json, en 320x200 seulement : aucun kiosque
// n'est à l'écran en 640x480 dans les scénarios.

const ATTRACTION_DEFILEMENT = 0xBB;
const CATALOGUE_ATTRACTIONS = 0xCCED0;  // fiches de 200 octets, le nom en tête
const FICHE_NOTE = 0xC6, FICHE_FORME_DU_KIOSQUE = 0x2E, FORME_26A = 0x26A;
const FORMAT_ENSEIGNE = 0xB00F0;    // "%s %d.%d  "
const DECALAGES_ENSEIGNE = 0xB16C8, DECALAGES_ENSEIGNE_26A = 0xB16D0;
const LARGEUR_ENSEIGNE = 6;         // caractères visibles à la fois
const COULEUR_ENSEIGNE = 0xD7773;   // octet, posé par 0x12452

// 0x1C5E9 — dessiner un kiosque d'attraction et son enseigne.
export function dessinerKiosque(jeu, kiosque, x, y) {
  let xk = x, yk = y;
  if (mot(jeu, kiosque + IMAGE) !== 0) {
    [xk, yk] = pointDuBordBas(jeu, x, y);
    dessinerObjet(jeu, mot(jeu, kiosque + IMAGE), xk, yk);
    dessinerEnseigne(jeu, kiosque, xk, yk);
  }
  if (mot(jeu, BOUTON_GAUCHE_MAINTENU) !== 0) jeu.appeler(DESIGNER_SOUS_LE_POINTEUR, kiosque, u16(xk), u16(yk));
}

function dessinerEnseigne(jeu, kiosque, xk, yk) {
  const attraction = objetDuParc(jeu, mot(jeu, kiosque + LIEN));
  const fiche = CATALOGUE_ATTRACTIONS + mot(jeu, attraction + LIEN);
  // Le texte complet, puis la fenêtre de six caractères, dans les variables de l'original : le texte
  // en [ebp−0x70] (80 octets), la fenêtre en [ebp−0x20]. Un nom de plus de 70 caractères déborderait
  // sur la fenêtre et sur ses autres variables ; ceux du catalogue sont bien plus courts.
  const texte = variablesLocales(jeu, 0x70), fenetre = texte + 0x50;
  const note = octet(jeu, fiche + FICHE_NOTE);
  jeu.appeler(SPRINTF, texte, FORMAT_ENSEIGNE, fiche, diviser(note, 10), reste(note, 10));
  const longueur = u16(jeu.appeler(STRLEN, texte));
  if (tousLes(jeu, 8)) jeu.m8[attraction + ATTRACTION_DEFILEMENT] = (octet(jeu, attraction + ATTRACTION_DEFILEMENT) + 1) & 0xFF;
  let position = reste(octet(jeu, attraction + ATTRACTION_DEFILEMENT), longueur);
  for (let i = 0; i < LARGEUR_ENSEIGNE; i++) {
    jeu.m8[fenetre + i] = octet(jeu, texte + s16(position));
    position = reste(s16(position) + 1, longueur);
  }
  jeu.m8[fenetre + LARGEUR_ENSEIGNE] = 0;

  const table = mot(jeu, fiche + FICHE_FORME_DU_KIOSQUE) === FORME_26A ? DECALAGES_ENSEIGNE_26A : DECALAGES_ENSEIGNE;
  let dx = octetSigne(jeu, table + 2 * octet(jeu, kiosque + DIRECTION));
  let dy = octetSigne(jeu, table + 2 * octet(jeu, kiosque + DIRECTION) + 1);
  if (jeu.etat.hauteResolution) { dx = (dx / 2) | 0; dy = (dy / 2) | 0; }
  const xt = s16(xk + dx), yt = s16(yk + dy);
  // (640 et 480 : l'écran, `ecran`, grande-vue.js ; plus grand en grande vue.)
  const hauteurLogique = jeu.etat.hauteResolution ? ecran.hauteur : 400;
  const basse = jeu.etat.basseResolution;
  if (xt <= 0 || xt >= ecran.largeur - LARGEUR_ENSEIGNE * (basse ? 8 : 4)) return;
  if (yt <= 0 || yt >= hauteurLogique - (basse ? 12 : 6)) return;
  jeu.appeler(basse ? ECRIRE_320 : ECRIRE_640, xt, yt, fenetre, octet(jeu, COULEUR_ENSEIGNE));
}

// =============================================================================================
// LE PERSONNEL (type 8)
// =============================================================================================
//
// Champs lus : +6/+8 la position fine, +A l'objet graphique, +C l'état, +14 le compte à rebours,
// +20 un compteur (mot long), +59 le métier (catalogue 0xD35C0, fiches de 0x36 octets : +2C l'état
// d'embauche, 0x16 pour l'agent d'entretien), +9C la première case de la tournée de l'agent
// d'entretien (−1 : pas de tournée).
//
// Selon l'état (table d'états 0x1E9B3, table de sauts 0x1E9D0 ; les états, personnel.js) :
//   0x3F  il part, renvoyé : son image avance d'un cran quand +14 est multiple de 4 ; tant que +14
//         dépasse 1 800, une animation s'ajoute par-dessus (figure 0x295, dont l'image courante,
//         commune à tous, est le mot 0xD77A4, qui avance tous les 4 pas). Ni marque ni désignation.
//   0xC, 0xE, 0x10  le mécanicien au travail : le bruitage 0x16 (des coups de marteau ?) quand son
//         compteur +20 est multiple de 5 ; puis comme les autres
//   0x3E, 0x3C, 0x3A, 0x38, 0x36, 0x34, 0x32, 0x30, 0x2E, 0x2C, 0x26, 0x24, 0x22, 0x1E, 0x1C,
//   0x1A, 0x18, 0x16, 0x14, 0x12, 0xA, 8, 6, 4, 2 : dessiné normalement
//   tout autre état (0x28 : l'agent d'entretien qui nettoie des toilettes ; 0x20, 0x2A, non
//   établis) : pas dessiné.
// Le dessin normal : l'employé ; l'agent d'entretien qui a une tournée porte en plus la figure
// 0x280 ; la marque s'il est sélectionné, sinon, en grève devant l'entrée (état 0x3C), la figure
// 0x250 (une pancarte ? non établi) ; enfin la désignation.
//
// Vérifié par demo.json, simulation.json et construction.json (états 2, 4, 6, 8, 0xA, 0x18, 0x34 ;
// l'employé sélectionné et désigné). Non vérifié : les états 0x3F, 0xC, 0xE, 0x10, 0x3C, la tournée.

const CATALOGUE_METIERS = 0xD35C0, TAILLE_METIER = 0x36, METIER_ETAT_D_EMBAUCHE = 0x2C;
const EMBAUCHE_AGENT_D_ENTRETIEN = 0x16;
const EMPLOYE_METIER = 0x59, EMPLOYE_COMPTEUR = 0x20, EMPLOYE_TOURNEE = 0x9C;
const IMAGE_DU_DEPART = 0xD77A4;    // mot : l'image courante de l'animation du départ
const FIGURE_DEPART = 0x295, FIGURE_TOURNEE = 0x280, FIGURE_GREVE = 0x250;
const DEPART_ANIME = 0x708;         // 1 800 : au-delà, l'animation du départ s'ajoute

// 0x1E9A7 — dessiner un employé.
export function dessinerEmploye(jeu, employe, x, y) {
  const [xe, ye] = positionFine(jeu, employe, x, y);
  switch (octet(jeu, employe + ETAT)) {
    case 0x3F: dessinerLeDepart(jeu, employe, xe, ye); return;
    case 0x10: case 0x0E: case 0x0C: {           // le mécanicien au travail
      const compteur = motLong(jeu, employe + EMPLOYE_COMPTEUR);
      if (compteur === 0 || compteur % 5 === 0) jeu.appeler(BRUITAGE, 0, 0x16);
      break;
    }
    case 0x3E: case 0x3C: case 0x3A: case 0x38: case 0x36: case 0x34: case 0x32: case 0x30:
    case 0x2E: case 0x2C: case 0x26: case 0x24: case 0x22: case 0x1E: case 0x1C: case 0x1A:
    case 0x18: case 0x16: case 0x14: case 0x12: case 0x0A: case 0x08: case 0x06: case 0x04:
    case 0x02:
      break;
    default:
      return;
  }
  dessinerObjet(jeu, mot(jeu, employe + IMAGE), xe, ye);
  const metier = CATALOGUE_METIERS + octet(jeu, employe + EMPLOYE_METIER) * TAILLE_METIER;
  if (mot(jeu, metier + METIER_ETAT_D_EMBAUCHE) === EMBAUCHE_AGENT_D_ENTRETIEN &&
      mot(jeu, employe + EMPLOYE_TOURNEE) !== 0xFFFF) {
    dessinerObjet(jeu, figure(jeu, FIGURE_TOURNEE), xe, ye);
  }
  if (estSelectionne(jeu, employe)) dessinerLaMarque(jeu, employe, xe, ye);
  else if (octet(jeu, employe + ETAT) === 0x3C) dessinerObjet(jeu, figure(jeu, FIGURE_GREVE), xe, ye);
  if (mot(jeu, BOUTON_GAUCHE_MAINTENU) !== 0) jeu.appeler(DESIGNER_SOUS_LE_POINTEUR, employe, u16(xe), u16(ye));
}

// État 0x3F — le départ de l'employé renvoyé. Non vérifié.
function dessinerLeDepart(jeu, employe, xe, ye) {
  dessinerObjet(jeu, mot(jeu, employe + IMAGE), xe, ye);
  if (motSigne(jeu, employe + COMPTE) > DEPART_ANIME) {
    if (mot(jeu, IMAGE_DU_DEPART) === 0) poserMot(jeu, IMAGE_DU_DEPART, figure(jeu, FIGURE_DEPART));
    else if (tousLes(jeu, 4)) poserMot(jeu, IMAGE_DU_DEPART, imageSuivante(jeu, mot(jeu, IMAGE_DU_DEPART)));
    dessinerObjet(jeu, mot(jeu, IMAGE_DU_DEPART), xe, ye);
  }
  if ((octet(jeu, employe + COMPTE) & 3) === 0) poserMot(jeu, employe + IMAGE, imageSuivante(jeu, mot(jeu, employe + IMAGE)));
}

// =============================================================================================
// LES BOUTIQUES ET LES STANDS (type 0xA)
// =============================================================================================
//
// Champs lus : +6/+8 la position fine, +A l'objet graphique, +C l'état, +16 la fiche (catalogue
// 0xD3C62, 107 octets : +67 la marchandise en réserve, octet signé, −1 aucune), +47 le client en
// cours (un visiteur, 0 aucun), +5F un objet graphique ajouté par-dessus (0 aucun ; la moitié des
// boutiques de la démo en ont un, non établi).
//
// La désignation vient ici d'abord, avant tout tracé. Seules les boutiques dans l'état 2 ou 4 sont
// dessinées. L'objet graphique est tracé morceau par morceau : un morceau habillé (bit 7 de ses
// drapeaux) montre le client, habillé selon son genre (table 0xB9D68 : 23 images par genre, la
// première rangée servant de clé, comme au volant), ou rien s'il n'y a pas de client ; un client du
// genre 0 prend l'image du morceau telle quelle. Enfin, l'objet graphique +5F, et la figure 0x24E
// quand la marchandise de la boutique est épuisée (mot +4 de sa fiche de réserve, 0xD3C00 + 0xE par
// marchandise, nul).
//
// Anomalies reproduites : un morceau habillé laisse ses drapeaux posés pour le traceur (0xBECBC), le
// morceau ordinaire suivant les remplace ; le test d'image d'un morceau ordinaire porte sur l'adresse,
// jamais nulle (voir dessinerAuVolant).
//
// Vérifié par demo.json et construction.json (état 2, la rupture, l'objet +5F, la désignation).
// Non vérifié : les morceaux habillés (aucune boutique des scénarios n'en a), la vue réduite.

const CATALOGUE_BOUTIQUES = 0xD3C62, FICHE_MARCHANDISE = 0x67;
const RESERVES = 0xD3C04;           // 0xD3C00 + 4 : la quantité en réserve, 0xE octets par marchandise
const TAILLE_RESERVE = 0xE;
const BOUTIQUE_CLIENT = 0x47, BOUTIQUE_AJOUT = 0x5F;
const HABITS_DES_CLIENTS = 0xB9D68, NOMBRE_HABITS_CLIENTS = 0x17;
const FIGURE_RUPTURE = 0x24E;

// 0x1ECD6 — dessiner une boutique.
export function dessinerBoutique(jeu, boutique, x, y) {
  const graphique = objetGraphique(jeu, mot(jeu, boutique + IMAGE));
  const [xb, yb] = positionFine(jeu, boutique, x, y);
  if (mot(jeu, BOUTON_GAUCHE_MAINTENU) !== 0) jeu.appeler(DESIGNER_SOUS_LE_POINTEUR, boutique, u16(xb), u16(yb));
  const etat = octet(jeu, boutique + ETAT);
  if (etat !== 2 && etat !== 4) return;
  const fiche = CATALOGUE_BOUTIQUES + mot(jeu, boutique + LIEN);
  const client = objetDuParc(jeu, mot(jeu, boutique + BOUTIQUE_CLIENT));
  const images = pointeur(jeu, IMAGES);
  for (let n = mot(jeu, graphique); n !== 0;) {
    const m = morceau(jeu, n);
    if (octet(jeu, m + 6) & MORCEAU_HABILLE) {
      if (client > pointeur(jeu, OBJETS_DU_PARC)) montrerLeClient(jeu, m, client, xb, yb);
    } else {
      const image = (images + mot(jeu, m)) | 0;
      if (image !== 0) tracerMorceauDeBoutique(jeu, m, graphique, image >>> 0, xb, yb);
    }
    n = mot(jeu, m + 8);
  }
  if (mot(jeu, boutique + BOUTIQUE_AJOUT) !== 0) dessinerObjet(jeu, mot(jeu, boutique + BOUTIQUE_AJOUT), xb, yb);
  const marchandise = octetSigne(jeu, fiche + FICHE_MARCHANDISE);
  if (marchandise !== -1 && mot(jeu, RESERVES + marchandise * TAILLE_RESERVE) === 0) {
    dessinerObjet(jeu, figure(jeu, FIGURE_RUPTURE), xb, yb);
  }
}

// Un morceau habillé : le client, habillé selon son genre. Non vérifié.
function montrerLeClient(jeu, m, client, xb, yb) {
  const images = pointeur(jeu, IMAGES);
  const genre = octet(jeu, client + VISITEUR_GENRE);
  if (genre === 0) {
    const image = (images + mot(jeu, m)) >>> 0;
    if (image <= images) return;
    poserDrapeaux(jeu, mot(jeu, m + 6));
    tracerImage(jeu, s16(xb + motSigne(jeu, m + 2)), s16(yb + motSigne(jeu, m + 4)), image);
    return;
  }
  for (let i = 0; i < NOMBRE_HABITS_CLIENTS; i++) {
    if (mot(jeu, HABITS_DES_CLIENTS + 2 * i) !== mot(jeu, m)) continue;
    const habit = (images + mot(jeu, HABITS_DES_CLIENTS + genre * 2 * NOMBRE_HABITS_CLIENTS + 2 * i)) >>> 0;
    if (mot(jeu, FACON_DE_DESSINER) === VUE_REDUITE) return;
    const ancienne = (images + mot(jeu, m)) >>> 0;
    const xi = s16(xb) - (largeurImage(jeu, habit) >> 1) + (largeurImage(jeu, ancienne) >> 1);
    const yi = yb - hauteurImage(jeu, habit) + hauteurImage(jeu, ancienne);
    poserDrapeaux(jeu, mot(jeu, m + 6));
    tracerImage(jeu, s16(xi + motSigne(jeu, m + 2)), s16(yi + motSigne(jeu, m + 4)), habit);
    return;
  }
}

// Un morceau ordinaire : tracé à son décalage ; en vue réduite, confié à 0x66DFA, décalage et
// dimensions ramenés à l'emprise de l'objet graphique divisée par les diviseurs de la vue réduite
// (en 256es). Vue réduite non vérifiée.
function tracerMorceauDeBoutique(jeu, m, graphique, image, xb, yb) {
  if (mot(jeu, FACON_DE_DESSINER) !== VUE_REDUITE) {
    poserDrapeaux(jeu, mot(jeu, m + 6));
    tracerImage(jeu, s16(xb + motSigne(jeu, m + 2)), s16(yb + motSigne(jeu, m + 4)), image);
    poserDrapeaux(jeu, 0);
    return;
  }
  const largeur = diviser(octet(jeu, graphique + 2) << 8, mot(jeu, REDUCTION_LARGEUR));
  const hauteur = diviser(octet(jeu, graphique + 3) << 8, mot(jeu, REDUCTION_HAUTEUR));
  poserDrapeaux(jeu, mot(jeu, m + 6));
  const h = u16(diviser(hauteurImage(jeu, image) << 8, s16(hauteur)));
  const l = u16(diviser(largeurImage(jeu, image) << 8, s16(largeur)));
  const yr = s16(diviser(motSigne(jeu, m + 4) << 8, s16(hauteur)) + s16(yb));
  const xr = s16(diviser(motSigne(jeu, m + 2) << 8, s16(largeur)) + s16(xb));
  jeu.appeler(TRACER_IMAGE_REDUITE, image, xr, yr, l, h);
  poserDrapeaux(jeu, 0);
}

// =============================================================================================
// LES MORCEAUX DE VOIE (type 0x12)
// =============================================================================================
//
// Champs lus : +7/+9 la case, +A l'objet graphique (le wagon d'un élément animé, non établi), +C
// l'état, +16 le genre de voie (1 BIG DIPPER, WATER SPLASH ; 2 ROLLER COASTER… ; 3 MONORAIL, § 10.6),
// +44 l'élément (0 : aucun), +79 la hauteur, en étages.
//
// Le morceau est posé au centre de la case, (L/2, H/2), et monte d'un étage tous les 24 pixels (12
// en 640x480, par le bit 3 du mode ; en vue réduite, divisés par le diviseur vertical 0xD6642). Les
// éléments sont décrits par genre en 0xB4399 (un pointeur tous les 10 octets, vers des descriptions
// de 0x19 octets par élément : +0 la figure posée au sol, +2 celle d'un étage de pilier). Sur l'herbe
// (sol 0) ou sur un sol marqué 0x400 (non établi), la figure du sol est posée au centre ; ailleurs, un
// pied de pilier, 12 pixels plus bas dans les deux modes. Puis un étage de pilier par étage de
// hauteur (un de moins pour les éléments 0xC et 0xF), et, au sommet, l'objet graphique +A, animé
// d'une image tous les 4 pas ; dans les états 0x13 et 0x15, le sommet est confié à 0x1FEB5.
// Anomalie reproduite : pour les éléments 0xC et 0xF à la hauteur 0, le compte des étages vaut −1
// sur 16 bits, soit 65 535 étages.
// Le monorail : sans élément, la figure 0x2B1 ; sinon, sur l'herbe ou le sol 0x400, la figure 0x1D5,
// puis l'objet graphique +A deux étages plus haut.
//
// Vérifié par demo.json (genres 1 et 2, éléments 2, 4 et 5, en 320x200). Non vérifié : le genre 3, les
// morceaux sans élément, les états 0x13 et 0x15, les éléments 0xC et 0xF, 640x480, la vue réduite.

const VOIE_ELEMENT = 0x44, VOIE_HAUTEUR = 0x79;
const ELEMENTS_DE_VOIE = 0xB4399, TAILLE_ELEMENT = 0x19;
const FIGURE_MONORAIL_SEUL = 0x2B1, FIGURE_MONORAIL_AU_SOL = 0x1D5;

// 0x1F205 — dessiner un morceau de voie.
export function dessinerMorceauDeVoie(jeu, voie, x, y) {
  const xc = (jeu.etat.largeurTuile >> 1) + s16(x);
  const yc = (jeu.etat.hauteurTuile >> 1) + s16(y);
  const etage = jeu.etat.hauteResolution ? 0xC : 0x18;
  const diviseur = (octet(jeu, FACON_DE_DESSINER) & VUE_REDUITE) ? mot(jeu, REDUCTION_HAUTEUR) : 1;
  const sol = mot(jeu, SOLS + 4 * octet(jeu, celluleDe(jeu, voie) + 2));
  const auSol = sol === 0 || (sol & SOL_SOUS_LA_VOIE) !== 0;
  const genre = mot(jeu, voie + LIEN);
  const element = octet(jeu, voie + VOIE_ELEMENT);
  if (genre === 1 || genre === 2) {
    if (element === 0) {
      dessinerObjet(jeu, mot(jeu, voie + IMAGE), xc, yc);
      return;
    }
    const description = (motLong(jeu, ELEMENTS_DE_VOIE + genre * 10) + element * TAILLE_ELEMENT) >>> 0;
    const pilier = figure(jeu, motSigne(jeu, description + 2));
    if (auSol) dessinerObjet(jeu, figure(jeu, motSigne(jeu, description)), xc, yc);
    else dessinerObjet(jeu, pilier, xc, yc + 0xC);
    const etages = u16(octet(jeu, voie + VOIE_HAUTEUR) - (element === 0xC || element === 0xF ? 1 : 0));
    let n = 0;
    for (; n < etages; n++) dessinerObjet(jeu, pilier, xc, s16(yc) - diviser(etage * n, diviseur));
    const etat = octet(jeu, voie + ETAT);
    if (etat === 0x13 || etat === 0x15) {
      jeu.appeler(DESSINER_ELEMENT_DE_VOIE, voie, s16(xc), s16(yc), s16(-diviser((n + 1) * etage, diviseur)));
    } else if (mot(jeu, voie + IMAGE) !== 0) {
      if (tousLes(jeu, 4)) poserMot(jeu, voie + IMAGE, imageSuivante(jeu, mot(jeu, voie + IMAGE)));
      const hauteur = diviser((octet(jeu, voie + VOIE_HAUTEUR) + 1) * etage, diviseur);
      dessinerObjet(jeu, mot(jeu, voie + IMAGE), xc, s16(yc) - hauteur);
    }
  } else if (genre === 3) {
    if (element === 0) {
      dessinerObjet(jeu, figure(jeu, FIGURE_MONORAIL_SEUL), xc, yc);
      return;
    }
    if (auSol) dessinerObjet(jeu, figure(jeu, FIGURE_MONORAIL_AU_SOL), xc, yc);
    if (mot(jeu, voie + IMAGE) !== 0) {
      dessinerObjet(jeu, mot(jeu, voie + IMAGE), xc, s16(yc) - diviser(etage * 2, diviseur));
    }
  }
}

// =============================================================================================
// L'ENTRÉE DU PARC, LES PANNEAUX INDICATEURS ET LES OBJETS FIXES (type 0x14)
// =============================================================================================
//
// Selon l'état (octet +C) :
//   6  une pièce de l'entrée du parc, posée au centre de la case. Sa figure est son mot +A quand le
//      parc est fermé (octet +18 de la fiche du parc nul) : 0x13F le portique, 0x220 l'autre pièce ;
//      ouvert, 0x13D et 0x13E. Dans la vue du parc, le portique porte une enseigne qui fait défiler
//      douze caractères du nom du parc ([0xD3814] + 0x20 : « BULLFROG'S WORLD  » dans la démo), ou,
//      fermé, du texte [[0xD7BD0] + 0x19C] (« PARC FERME    »), d'un caractère à chaque pas du mot
//      0xD6656 (0x12B1F l'augmente) ; écrite par 0x3F49E, la police des écrans, 28 pixels à droite et
//      100 au-dessus du point de pose (14 et 50 en 640x480), dans la couleur 0xD7772 (ouvert) ou
//      0xD7783 (fermé).
//      L'entrée déborde de sa case : quand la case située quatre colonnes à droite du portique tombe
//      hors de l'écran, ou quatre colonnes à gauche de l'autre pièce, ce qui y est posé est dessiné
//      quand même (0x1C22A, qui peut revenir ici : la fonction est réentrante), pour que la partie
//      visible ne manque pas. Les cellules voisines sont prises à ±0x10 octets, sans tenir compte du
//      bord de la carte.
//   8  un panneau indicateur, au milieu du bord bas : un poteau (figure 0xAC), et jusqu'à trois
//      flèches, une par cible non nulle (mots +69, +6B, +6D : une attraction, une boutique, la
//      sortie, § 6.4), chacune un morceau de la figure 0xAD, le 4 × i + direction (octets +66, +67,
//      +68), tracé par 0x20BEB.
//   2  un objet animé à sa position fine : son objet graphique +A, qui avance d'une image à chaque
//      tracé, donc à chaque image affichée.
//   autre : l'objet fixe dont +A est la figure, au milieu du bord bas (la figure 0x21F dans la démo,
//      en (32, 58), près de l'entrée ; ce que c'est, non établi).
//
// Vérifié par demo.json, parc.json et ecrans.json, dans les deux modes (l'entrée ouverte et fermée,
// les rappels de 0x1C22A à droite et à gauche, les panneaux, l'état 0). Non vérifié : l'état 2.

const ENTREE = 6, PANNEAU = 8, OBJET_ANIME = 2;
const PORTIQUE = 0x13F;             // le mot +A du portique (sa figure, fermé)
const FIGURE_PORTIQUE_OUVERT = 0x13D, FIGURE_PIECE_OUVERTE = 0x13E;
const FIGURE_PORTIQUE_FERME = 0x13F, FIGURE_PIECE_FERMEE = 0x220;
const PARC_OUVERT = 0x18;           // octet de la fiche du parc
const COMPTES_DU_PARC = 0xD3814;    // pointeur : + 0x20, le nom du parc
const NOM_DU_PARC = 0x20;
const TEXTES = 0xD7BD0;             // pointeur vers une table de pointeurs de textes
const TEXTE_PARC_FERME = 0x19C;
const DEFILEMENT_DE_L_ENTREE = 0xD6656;
const LARGEUR_ENSEIGNE_ENTREE = 12;
const COULEUR_ENTREE_OUVERTE = 0xD7772, COULEUR_ENTREE_FERMEE = 0xD7783;
const FIGURE_POTEAU = 0xAC, FIGURE_FLECHES = 0xAD;
const PANNEAU_CIBLES = 0x69, PANNEAU_DIRECTIONS = 0x66;

// 0x1F8F8 — dessiner un objet de type 0x14.
export function dessinerEntreeEtPanneaux(jeu, objet, x, y) {
  const etat = octet(jeu, objet + ETAT);
  if (etat === ENTREE) { dessinerLEntree(jeu, objet, x, y); return; }
  if (etat === PANNEAU) { dessinerUnPanneau(jeu, objet, x, y); return; }
  if (etat === OBJET_ANIME) {
    const [xa, ya] = positionFine(jeu, objet, x, y);
    dessinerObjet(jeu, mot(jeu, objet + IMAGE), xa, ya);
    poserMot(jeu, objet + IMAGE, imageSuivante(jeu, mot(jeu, objet + IMAGE)));
    return;
  }
  const [xf, yf] = pointDuBordBas(jeu, x, y);
  dessinerObjet(jeu, figure(jeu, mot(jeu, objet + IMAGE)), xf, yf);
}

function dessinerUnPanneau(jeu, panneau, x, y) {
  const [xp, yp] = pointDuBordBas(jeu, x, y);
  dessinerObjet(jeu, figure(jeu, FIGURE_POTEAU), xp, yp);
  for (let i = 0; i < 3; i++) {
    if (mot(jeu, panneau + PANNEAU_CIBLES + 2 * i) === 0) continue;
    const fleche = u16(4 * i + octet(jeu, panneau + PANNEAU_DIRECTIONS + i));
    jeu.appeler(DESSINER_MORCEAUX, figure(jeu, FIGURE_FLECHES), fleche, 1, s16(xp), s16(yp));
  }
}

// La désignation peut ouvrir le parc ou changer la pièce : comme l'original, on relit l'état du parc
// et le mot +A à chaque usage.
const parcOuvert = (jeu) => octet(jeu, pointeur(jeu, FICHE_DU_PARC) + PARC_OUVERT) !== 0;
const estLePortique = (jeu, piece) => mot(jeu, piece + IMAGE) === PORTIQUE;

function dessinerLEntree(jeu, piece, x, y) {
  const haute = modeVaut8(jeu);
  const xe = s16(x) + (jeu.etat.largeurTuile >> 1) + (haute ? 4 : 8);
  const ye = s16(y) + (haute ? 8 : 0x10);
  if (mot(jeu, BOUTON_GAUCHE_MAINTENU) !== 0) jeu.appeler(DESIGNER_SOUS_LE_POINTEUR, piece, u16(xe), u16(ye));
  let f;
  if (parcOuvert(jeu)) f = estLePortique(jeu, piece) ? FIGURE_PORTIQUE_OUVERT : FIGURE_PIECE_OUVERTE;
  else f = estLePortique(jeu, piece) ? FIGURE_PORTIQUE_FERME : FIGURE_PIECE_FERMEE;
  dessinerObjet(jeu, figure(jeu, f), xe, ye);
  if (mot(jeu, ECRAN_COURANT) !== 0) return;
  const L = jeu.etat.largeurTuile;
  if (estLePortique(jeu, piece)) {
    dessinerLEnseigneDuParc(jeu, xe, ye);
    // la case quatre colonnes à droite, hors de l'écran
    if (L * 4 + s16(x) >= ecran.largeur) {           // 640 (grande-vue.js)
      jeu.appeler(DESSINER_CASE, motSigne(jeu, celluleDe(jeu, piece) + 0x10), u16(L * 4 + x), u16(y));
    }
  } else if (s16(x) - L * 4 < 0) {
    // la case quatre colonnes à gauche, hors de l'écran
    jeu.appeler(DESSINER_CASE, motSigne(jeu, celluleDe(jeu, piece) - 0x10), u16(x - L * 4), u16(y));
  }
}

function dessinerLEnseigneDuParc(jeu, xe, ye) {
  const texte = parcOuvert(jeu) ? (pointeur(jeu, COMPTES_DU_PARC) + NOM_DU_PARC) >>> 0
    : motLong(jeu, pointeur(jeu, TEXTES) + TEXTE_PARC_FERME);
  const fenetre = variablesLocales(jeu, 0x14);
  const longueur = u16(jeu.appeler(STRLEN, texte));
  let position = reste(mot(jeu, DEFILEMENT_DE_L_ENTREE), longueur);
  for (let i = 0; i < LARGEUR_ENSEIGNE_ENTREE; i++) {
    jeu.m8[fenetre + i] = octet(jeu, (texte + s16(position)) >>> 0);
    position = reste(s16(position) + 1, longueur);
  }
  jeu.m8[fenetre + LARGEUR_ENSEIGNE_ENTREE] = 0;
  let dx = 0x1C, dy = -0x64;
  if (jeu.etat.hauteResolution) { dx = (dx / 2) | 0; dy = (dy / 2) | 0; }
  const couleur = octet(jeu, parcOuvert(jeu) ? COULEUR_ENTREE_OUVERTE : COULEUR_ENTREE_FERMEE);
  jeu.appeler(ECRIRE_TEXTE, s16(xe + dx), s16(ye + dy), fenetre, 0, couleur);
}

// =============================================================================================
// LA PETITE POLICE
// =============================================================================================
//
// 3 × 6 pixels par caractère, 4 de chasse, en 0xBA2FC : 6 octets par caractère, un par rangée du
// haut vers le bas, à partir de l'espace (0x20). Le programme saute, pour chaque rangée, vers l'une
// de huit façons de l'écrire (table 0x80EE0), choisie par octet / 2 : octets 0, 2, 4 … 14 pour les
// pixels ..X, .X., .XX, X.., X.X, XX., XXX et rien. Deux versions : 0x80E88 pour 320x200, qui divise
// les coordonnées logiques par deux, et 0x80F34 pour 640x480. Elles écrivent dans la surface de
// dessin, ligne après ligne ([0xDE5B8] octets par ligne), puis reviennent au caractère suivant par
// une constante écrite en dur (6 lignes de 320 ou de 640 moins 4) : juste si la ligne a la largeur
// de l'écran. Ni découpe aux bords, ni marquage des blocs d'écran en 640x480.
//
// Fidélités reproduites : en 320x200, les coordonnées sont divisées par un décalage non signé (un x
// négatif pointerait 2 Go plus loin ; y n'en souffre pas, sa multiplication par 320 repliant le
// décalage) ; un caractère sous 0x20 prend, en 320x200, une forme avant la table, et en 640x480 une
// forme après (l'écart y est calculé sur un octet) ; un octet de police au-delà de 15 arrête la
// transcription (« table 0x80EE0 »), il n'y en a pas. Les deux routines préservent tous les
// registres, sauf eax qui vaut 0 au retour (en 640x480, pour un texte vide, eax garde ses bits hauts).
//
// Vérifié : 0x80E88 par les cinq scénarios (enseignes des kiosques, écrans), 0x80F34 par parc.json
// et ecrans.json (écrans), jamais pour une enseigne.

const PETITE_POLICE = 0xBA2FC;

// Une rangée de caractère : la table de sauts (0x80EE0, ou sa copie 0x80F86 en 640x480), écriture
// par écriture (un octet, ou un mot de deux pixels), comme le programme.
function ecrireUneRangee(jeu, a, forme, couleur, table) {
  const deux = couleur * 0x101;
  switch (forme) {
    case 0: jeu.m8[a + 2] = couleur; break;                                   // ..X
    case 1: jeu.m8[a + 1] = couleur; break;                                   // .X.
    case 2: jeu.dv.setUint16(a + 1, deux, true); break;                       // .XX
    case 3: jeu.m8[a] = couleur; break;                                       // X..
    case 4: jeu.m8[a] = couleur; jeu.m8[a + 2] = couleur; break;              // X.X
    case 5: jeu.dv.setUint16(a, deux, true); break;                           // XX.
    case 6: jeu.m8[a] = couleur; jeu.dv.setUint16(a + 1, deux, true); break;  // XXX
    case 7: break;                                                            // ...
    default: throw new Error(`table 0x${table.toString(16).toUpperCase()} : ${forme}`);
  }
}

// `dessinDuCaractere` rend l'adresse des six rangées d'un caractère ; `retourAuCaractere`, ce que
// le programme retire en dur, après les six lignes, pour passer au caractère suivant.
function ecrireEnPetitesLettres(jeu, debut, texte, couleur, retourAuCaractere, dessinDuCaractere, table) {
  let a = debut;
  const c = couleur & 0xFF;
  for (let k = texte; jeu.m8[k] !== 0; k++) {
    let dessin = dessinDuCaractere(jeu.m8[k]);
    for (let rangee = 0; rangee < 6; rangee++, dessin++) {
      ecrireUneRangee(jeu, a, (jeu.m8[dessin] * 2) >> 2, c, table);
      a = (a + jeu.dv.getInt32(LIGNE_DE_LA_SURFACE, true)) | 0;
    }
    a = (a - retourAuCaractere) | 0;
  }
}

// 0x80E88 — écrire un texte dans la petite police, en 320x200.
export function ecrireTexteBasseResolution(jeu, x, y, texte, couleur) {
  const debut = ((s16(x) >>> 1) + motLong(jeu, SURFACE) + Math.imul(s16(y) >>> 1, 320)) | 0;
  ecrireEnPetitesLettres(jeu, debut, texte, couleur, 0x77C, (c) => (PETITE_POLICE + 6 * (c - 0x20)) | 0, 0x80EE0);
  return 0;
}

// 0x80F34 — écrire un texte dans la petite police, en 640x480. (Lignes de 640 octets, et 0xEFC =
// 6 × 640 − 4 : en grande vue, grande-vue.js, la largeur de l'écran.)
export function ecrireTexteHauteResolution(jeu, x, y, texte, couleur) {
  const debut = (s16(x) + motLong(jeu, SURFACE) + Math.imul(s16(y), ecran.largeur)) | 0;
  const vide = jeu.m8[texte] === 0;
  ecrireEnPetitesLettres(jeu, debut, texte, couleur, 6 * ecran.largeur - 4, (c) => PETITE_POLICE + 6 * ((c - 0x20) & 0xFF), 0x80F86);
  return vide ? jeu.T.R.eax & ~0xFF : 0;
}

// =============================================================================================
// UN BRUITAGE QU'ON NE RELANCE PAS
// =============================================================================================
//
// 0x80FE0(propriétaire, bruitage) : comme 0x80C80 (§ 9.3), mais rien si ce bruitage joue déjà pour
// ce propriétaire. Rien non plus si les bruitages ne sont pas initialisés ([0xBA720]) ou coupés par
// le joueur ([0xBA721], basculé par une touche dans 0x13BF3), ni si le numéro dépasse le nombre de
// bruitages de la banque ([0xD7B68] ; un numéro égal, ou négatif, passe). Sinon : le premier des 32
// numéros d'échantillon libres (sosDIGISampleDone), noté avec son propriétaire et son bruitage dans
// la table 0xD7998, volume plein, et la structure _SOS_START_SAMPLE (0xBA729) remplie avant
// sosDIGIStartSample, dont le résultat va en [0xD7B40].
//
// Vérifié : appelée une fois par scénario (le bus, la construction), mais le jeu est muet sous l'hôte
// ([0xBA720] nul) : seule la première vérification est exercée. Éprouvée avec une carte son
// (`--son`) sur des états fabriqués : il faut alors comparer toute la mémoire (`--memoire-entiere`),
// car sosDIGIStartSample écrit dans les descripteurs d'échantillon de SOS, qui vivent dans le bloc
// du module de mélange — hors des zones que le comparateur relève par défaut. Sans cela, la seconde
// exécution trouve occupé l'échantillon que la première vient de lancer et en prend un autre.

const BRUITAGES_PRETS = 0xBA720, BRUITAGES_EN_SERVICE = 0xBA721;
const NOMBRE_DE_BRUITAGES = 0xD7B68;
const ECHANTILLONS = 0xD7998;       // 32 × (propriétaire, bruitage), deux mots chacun
const NOMBRE_D_ECHANTILLONS = 0x20;
const VOLUMES = 0xD7A18;            // un mot par numéro d'échantillon
const PILOTE_NUMERIQUE = 0xD7B44;   // mot long
const BANQUE_DE_BRUITAGES = 0xD7B60;  // pointeur : 32 octets par bruitage, +0x12 les données, +0x1A la taille
const DEPART = 0xBA729;             // _SOS_START_SAMPLE : +0 les données (pointeur lointain : +4 le
                                    // sélecteur), +8 la taille − 16, +0x10 le volume, +0x12 le numéro,
                                    // +0x1C non établi (0x100)
const DERNIER_DEPART = 0xD7B40;
const SOS_ECHANTILLON_FINI = 0x892DB, SOS_LANCER_ECHANTILLON = 0x8943F;
const VOLUME_PLEIN = 0x7FFF;

// 0x80FE0 — jouer un bruitage, sauf s'il joue déjà pour ce propriétaire.
export function jouerBruitageSansRepeter(jeu, proprietaire, bruitage) {
  if (octet(jeu, BRUITAGES_PRETS) === 0 || octet(jeu, BRUITAGES_EN_SERVICE) === 0) return;
  if (s16(bruitage) > mot(jeu, NOMBRE_DE_BRUITAGES)) return;
  const pilote = () => motLong(jeu, PILOTE_NUMERIQUE);
  for (let i = 0; i < NOMBRE_D_ECHANTILLONS; i++) {
    const e = ECHANTILLONS + 4 * i;
    if (mot(jeu, e) !== u16(proprietaire) || mot(jeu, e + 2) !== u16(bruitage)) continue;
    if (jeu.appeler(SOS_ECHANTILLON_FINI, pilote(), i) === 0) return;    // il joue encore
  }
  let libre = 0;
  while (libre < NOMBRE_D_ECHANTILLONS && jeu.appeler(SOS_ECHANTILLON_FINI, pilote(), libre) === 0) libre++;
  if (libre === NOMBRE_D_ECHANTILLONS) return;
  poserMot(jeu, ECHANTILLONS + 4 * libre, proprietaire);
  poserMot(jeu, ECHANTILLONS + 4 * libre + 2, bruitage);
  poserMot(jeu, DEPART + 0x12, libre);
  poserMot(jeu, DEPART + 0x1C, 0x100);
  poserMot(jeu, DEPART + 0x10, VOLUME_PLEIN);
  poserMot(jeu, VOLUMES + 2 * libre, mot(jeu, DEPART + 0x10));
  const fiche = (pointeur(jeu, BANQUE_DE_BRUITAGES) + s16(bruitage) * 32) >>> 0;
  poserMotLong(jeu, DEPART + 8, motLong(jeu, fiche + 0x1A) - 0x10);
  const ds = jeu.T.R.ds & 0xFFFF;
  poserMot(jeu, DEPART + 4, ds);
  poserMotLong(jeu, DEPART, motLong(jeu, fiche + 0x12));
  poserMotLong(jeu, DERNIER_DEPART, jeu.appeler(SOS_LANCER_ECHANTILLON, pilote(), DEPART, ds));
}

// =============================================================================================

// Ce que ces routines écrivent hors des zones que le comparateur relève par défaut : la table des
// objets du parc, dans le tas. Elles y font avancer des animations (l'enseigne d'une attraction, +BB ;
// l'image d'un employé, d'un morceau de voie, d'un objet animé, +A ; le temps des objets portés, +8C ;
// le drapeau 0x40 d'un visiteur), et 0x20FF5, 0x1C22A qu'elles appellent y écrivent aussi.
function tableDesObjetsDuParc(jeu) {
  return [pointeur(jeu, OBJETS_DU_PARC), pointeur(jeu, FIN_DES_OBJETS_DU_PARC)];
}
const objetsDuParc = (jeu) => [tableDesObjetsDuParc(jeu)];
// Les deux routines de texte préservent ecx et edx : leurs appelants peuvent y compter.
const tousLesRegistres = ['ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp'];

export const reecritures = [
  { adresse: 0x1C9E2, nom: 'dessinerVisiteur', fn: dessinerVisiteur, arguments: 3, zones: objetsDuParc },
  { adresse: 0x1C5E9, nom: 'dessinerKiosque', fn: dessinerKiosque, arguments: 3, zones: objetsDuParc },
  { adresse: 0x1E9A7, nom: 'dessinerEmploye', fn: dessinerEmploye, arguments: 3, zones: objetsDuParc },
  { adresse: 0x1ECD6, nom: 'dessinerBoutique', fn: dessinerBoutique, arguments: 3, zones: objetsDuParc },
  { adresse: 0x1F205, nom: 'dessinerMorceauDeVoie', fn: dessinerMorceauDeVoie, arguments: 3, zones: objetsDuParc },
  { adresse: 0x1F8F8, nom: 'dessinerEntreeEtPanneaux', fn: dessinerEntreeEtPanneaux, arguments: 3, zones: objetsDuParc },
  { adresse: 0x80E88, nom: 'ecrireTexteBasseResolution', fn: ecrireTexteBasseResolution, arguments: 4, retour: true,
    registresCompares: tousLesRegistres },
  { adresse: 0x80F34, nom: 'ecrireTexteHauteResolution', fn: ecrireTexteHauteResolution, arguments: 4, retour: true,
    registresCompares: tousLesRegistres },
  // Le son écrit aussi dans les descripteurs d'échantillon de SOS, dans la mémoire des pilotes :
  // toute la mémoire est comparée (une poignée d'appels par scénario).
  { adresse: 0x80FE0, nom: 'jouerBruitageSansRepeter', fn: jouerBruitageSansRepeter, arguments: 2, memoire: 'entiere' },
];
