// Les voyous (objets du parc de type 0x1A), le gardien qui les arrête et les escorte, l'amuseur
// qu'ils font fuir, et le renvoi d'un employé.
//
// Réécriture lisible de 0x4C592 (l'arrivée d'un voyou), des dix états du voyou (0x4C696, 0x4C864,
// 0x4C9DD, 0x4D1CA, 0x4D644, 0x4D69C, 0x4DA0C, 0x4D88D, 0x4DAD1, 0x4DD81), de son dessin (0x1C90B),
// des deux états du gardien que personnel.js n'a pas (0x3455A, 0x34728), de la fuite de l'amuseur
// (0x35652) et du renvoi d'un employé (0x325DA). Voir docs/guide-reecriture.md ; personnel.js décrit
// l'employé, et le gardien qui patrouille (état 0x34, 0x34149) et arrête (0x3436C).
//
// LA VIE D'UN VOYOU. L'arrivée des voyous (economie.js, 0x12B1F) en fait venir un, d'un genre tiré
// au hasard parmi quatre (0x4C592). Il naît sur la route, hors du parc, en (63, 61), et la suit vers
// l'ouest (état 1) jusqu'à voir, sur une case voisine, le sol 0x88 (le portique d'entrée,
// vraisemblablement : c'est aussi là que le bus s'arrête). Il entre (état 2), gagne une allée et
// y rôde (état 3), une case à la fois, en choisissant ses sorties au hasard. En chemin :
//   - sur un amuseur costumé (métier dont la fiche porte une figure de fuite, mot +0x34), il le fait
//     partir : l'amuseur passe dans l'état 0x3F pour 2 000 pas, puis il est renvoyé (0x35652), et
//     le voyou s'arrête, le temps de 200 pas, dans l'état 0xA ;
//   - au niveau BUSINESS ([0xD66F1] = 2), près d'une boutique qui a du stock, il y va (état 9) ; en
//     revenant, il en fait perdre les trois quarts du stock ;
//   - près du bout d'une file dont l'attraction est usée à moins de 40, il la longe (état 4) jusqu'à
//     l'entrée, et l'use d'un cran par pas jusqu'à 40 (état 5) ;
//   - sur un visiteur, il lui vole un quart de son argent ; si le visiteur avait acheté ou essayé
//     quelque chose (mot +0x52), il le lui prend : le visiteur s'arrête, mécontent (émotion 0x1A),
//     et perd de 100 à 163 de contentement ;
//   - hors des allées, il vise une case voisine au hasard et cherche à y revenir (état 6).
// Chacun de ces méfaits lève le bit 2 de son octet +5 : seul un voyou ainsi marqué peut être arrêté
// (0x3436C). Arrêté (état 8), il suit le gardien jusqu'à l'entrée du parc ; là, le gardien le relâche
// (état 7), et le voyou repart par la route (état 1). Arrivé à la colonne 0, il quitte la carte.
//
// LE VOYOU, un objet du parc de 200 octets (les champs lus et écrits ici) :
//   +0x04 octet  le type, 0x1A
//   +0x05 octet  bit 2 (valeur 2) : a commis un méfait (et, dans l'état 4, vient d'arriver sur une
//                case de la file)
//   +0x06, +0x08 mots  la position fine (octets forts : colonne +7 et rangée +9), comme l'employé
//   +0x0A mot    l'objet graphique courant
//   +0x0C octet  l'état ; +0x0D l'état à reprendre (après l'état 0xA ; 9 pendant l'état 9)
//   +0x12 octet  la direction (0 haut, 1 droite, 2 bas, 3 gauche) ; +0x13 la vitesse, 16
//   +0x14 mot    le compte à rebours, en pas de simulation
//   +0x16 mot    l'attraction qu'il use (états 4 et 5)
//   +0x1E mot    le voyou arrêté avant lui par le même gardien (0 : le premier)
//   +0x49 mot    la case de la boutique qu'il va voir (état 9), puis celle d'où il est parti
//   +0x4D mot    la case du portique (état 2)
//   +0x56, +0x57 octets  la case visée (colonne, rangée) ; dans l'état 9, celle d'où il est parti
//   +0x58 octet  la direction d'où il est parti (état 9)
//   +0x59 octet  le genre, 0 à 3, qui choisit ses images
//   +0x61 mot    l'amuseur qu'il a fait partir (état 0xA) ; son gardien, une fois arrêté
//
// SES IMAGES. La table 0xB537A donne cinq mots par genre (10 octets) ; chacun est une figure (un
// numéro de la table [0xD3B38], qui donne un objet graphique, comme pour le personnel) :
//   +0  la marche, plus la direction      +2  l'arrivée, et le départ (état 7)
//   +4  le passage du portique (état 2)   +6  non lu ici          +8  l'amuseur effrayé (état 0xA)
//
// LA CADENCE. Comme le personnel : un pas de simulation par appel. Les états du voyou lisent l'octet
// bas du temps du jeu, 0xD3AFC, ceux du gardien le compteur des mises à jour, 0xD3AF8 ; les deux
// avancent ensemble à chaque pas (personnel.js). Le hasard est 0x18B92, tiré dans l'ordre d'origine.
//
// LE RESTE DE PILE. Les états du voyou et du gardien sont appelés par la mise à jour des objets du
// parc (0x21681), dont un autre état relit, 24 octets sous leur entrée, l'octet que laisse leur
// variable [ebp-8] (guide, « Les restes de pile » ; personnel.js). Chaque réécriture relève cet
// octet à l'entrée et y remet, en sortant, ce que l'original y laissait : sa variable [ebp-8] s'il
// l'a écrite, sinon l'octet trouvé à l'entrée (les appels qu'elle fait, eux, l'écrasent).
//
// VÉRIFICATION : voir le rapport de fin de module en bas de ce fichier.

import { dansLeCadre } from './cadre.js';
import { recalerAuMilieuDeLaCase } from './corrections.js';   // hors du jeu d'origine (reglages.js)

// --- la mémoire ------------------------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const octet = (jeu, a) => jeu.m8[a >>> 0];
const octetSigne = (jeu, a) => s8(jeu.m8[a >>> 0]);
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Quotient d'une division signée (idiv), tronqué vers zéro ; un diviseur nul lève une exception.
function quotient(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}

// --- les tables du jeu -----------------------------------------------------------------------------
const GRILLE = 0xD3B08;              // pointeur : la carte, 64 × 64 cellules de 4 octets (+2 le sol)
const OBJETS_DU_PARC = 0xD3B10;      // pointeur : la table des objets du parc, 200 octets chacun
const FIN_DES_OBJETS_DU_PARC = 0xD3B78;
const TAILLE_OBJET = 200;
const OBJETS_GRAPHIQUES = 0xD3B80;   // pointeur : les objets graphiques, 8 octets
const FIGURES = 0xD3B38;             // pointeur : table de mots, figure → objet graphique

// Les sols : 4 octets par sorte de sol (l'octet +2 de la cellule) ; +0 mot, des drapeaux ; +3
// octet, la forme d'un morceau d'allée ou de file (personnel.js).
const SOLS = 0xB44D9;
const SOL_ALLEE = 0x2, SOL_FILE = 0x8, SOL_BOUT_DE_FILE = 0x10, SOL_BOUTIQUE = 0x100;
// Les sols où le gardien et l'amuseur ne regardent pas plus loin (personnel.js) : les clôtures, le
// sol des attractions, le portique, les boutiques, la route… Le gardien relâche ses voyous sur le
// premier de ces sols qu'il trouve à côté de lui.
const SOLS_INTERDITS = 0x39C5;
// Le masque que le voyou hors des allées passe à la recherche de chemin : les mêmes, plus 8, les
// files d'attente.
const SOLS_INTERDITS_AU_VOYOU = 0x39CD;
const SOL_DU_PORTIQUE = 0x88;        // une sorte de sol (et non un drapeau) : le portique d'entrée,
                                     // vraisemblablement (non établi)

const PAS_DES_DIRECTIONS = 0xB4920;  // 4 mots : l'écart d'index de case par direction, −64, 1, 64, −1
const AVANCEE = 0xB4932;             // 2 octets signés par direction : (dx, dy)
const DIRECTION_OPPOSEE = 0xB48EC;   // un mot par direction : la direction opposée
const SORTIE_OPPOSEE = 0xB491C;      // un octet par direction : le bit de la sortie opposée (4 8 1 2)
const DIRECTION_DES_SORTIES = 0xB4970;  // 16 octets : un ensemble de sorties → une direction
const SORTIES_D_UNE_ALLEE = 0xB4990; // octet par forme d'allée : ses sorties (bit n = direction n)
const SORTIES_D_UNE_FILE = 0xB49D3;  // octet par forme de file
// Un octet signé par ensemble de sorties d'une file : pour une sortie seule, sa direction (1 → 0,
// 2 → 1, 4 → 2, 8 → 3) ; les autres entrées débordent sur les tables voisines.
const DIRECTION_D_UNE_SORTIE = 0xB4B14;
// Le chemin d'une allée : un octet signé par (sorties × 4 + direction d'arrivée), la direction à
// prendre, −1 quand il y a un choix à faire. Seuls les ensembles de plusieurs sorties donnent −1.
const SUITE_DE_L_ALLEE = 0xB533A;

const IMAGES_DES_VOYOUS = 0xB537A, TAILLE_IMAGES_VOYOU = 10;
const IMAGE_DE_MARCHE = 0, IMAGE_D_ARRIVEE = 2, IMAGE_DU_PORTIQUE = 4, IMAGE_DE_LA_FRAYEUR = 8;

const METIERS = 0xD35C0, TAILLE_METIER = 0x36;   // le catalogue des métiers (personnel.js)
//   +0x24 mot le salaire d'embauche ; +0x26, +0x28 les premières figures de la marche et de
//   l'attente ; +0x2C mot l'état d'embauche (2 amuseur, 8 mécanicien, 0x16 agent d'entretien, 0x34
//   gardien) ; +0x33 octet le nombre d'employés du métier ; +0x34 mot la figure de l'amuseur qui
//   fuit un voyou, nulle pour les autres métiers.
const SALAIRE_D_EMBAUCHE = 0x24, FIGURE_DE_MARCHE = 0x26, FIGURE_D_ATTENTE = 0x28;
const ETAT_D_EMBAUCHE = 0x2C, NOMBRE_DU_METIER = 0x33, FIGURE_DE_FUITE = 0x34;

// Les boutiques : le mot +0x16 de l'objet est le décalage de son genre dans 0xD3C62 (107 octets par
// genre), dont l'octet signé +0x67 est l'article en stock (−1 aucun) ; la quantité en stock est le
// mot +0 de 0xD3C04 + article × 14 (visiteurs.js).
const ARTICLE_DE_LA_BOUTIQUE = 0xD3C62 + 0x67, STOCKS = 0xD3C04, TAILLE_STOCK = 14;

// Le visiteur (visiteurs.js, visiteurs-outils.js) : +0x6F mot son argent ; +0x52 mot un bit par objet
// acheté ou jeu essayé ; +0x54 mot signé le contentement ; +0x58 la direction et +0x5F l'image mises
// de côté ; +0x8B le délai avant la prochaine émotion ; +0xBC l'état à reprendre après l'émotion ;
// +0x59 le genre, et 0xB49F4 ses images, 0x24 octets par genre (+0x12 : celle du mécontentement).
const ARGENT = 0x6F, ACHATS = 0x52, CONTENTEMENT = 0x54, DIRECTION_GARDEE = 0x58;
const IMAGE_GARDEE = 0x5F, DELAI_D_EMOTION = 0x8B, ETAT_A_REPRENDRE = 0xBC, GENRE_DU_VISITEUR = 0x59;
const IMAGE_DU_VISITEUR_VOLE = 0xB49F4 + 0x12, TAILLE_IMAGES_VISITEUR = 0x24;
const VISITEUR_DETOURNE = 0xBF;      // masque de l'octet +5 : ôte le bit 0x40 (non établi)
const EMOTION = 0x1A;                // l'état du visiteur qui exprime son humeur

// L'attraction (type 4) : +0x2E son usure ; l'entrée d'attraction (type 6) : +0x16 son attraction.
const USURE = 0x2E, USURE_QUE_VISE_LE_VOYOU = 0x28;

// Le parc et le joueur.
const PARC_COURANT = 0xD3818;        // pointeur : la fiche du parc du joueur en cours (0xCF1E0 + n × 0x250)
//   +0x48 la capacité du bus ; +0x49 son modèle ; +0x4A le plus haut modèle que permet la recherche ;
//   +0x52 mot le nombre de voyous ; +0xC2 mot le personnel ; +0xC4 mot les renvois.
const NOMBRE_DE_VOYOUS = 0x52, PERSONNEL = 0xC2, RENVOIS = 0xC4;
const FICHES_DES_PARCS = 0xCF1E0, TAILLE_FICHE_DE_PARC = 0x250;
//   +0xCC les mécaniciens, +0xD0 les agents d'entretien, +0xD4 les amuseurs (des mots)
const JOUEUR = 0xD665C;              // mot : le joueur en cours
const COMPTES = 0xD443C, TAILLE_COMPTES = 0x6C2, NUMERO_DU_PARC = 0x41;
const NIVEAU_DE_JEU = 0xD66F1;       // octet : 0 MATERNELLE, 1 SIMULATION, 2 BUSINESS
const NIVEAU_BUSINESS = 2;

const PAS_DE_SIMULATION = 0xD3AFC;         // long : le temps du jeu, un pas par mise à jour
const COMPTEUR_DE_MISES_A_JOUR = 0xD3AF8;  // long : de même, augmenté par 0x21681

// --- les champs des objets -------------------------------------------------------------------------
const TYPE = 0x4, DRAPEAUX = 0x5, X = 0x6, COLONNE = 0x7, Y = 0x8, RANGEE = 0x9;
const GRAPHIQUE = 0xA, ETAT = 0xC, ETAT_SUIVANT = 0xD, DIRECTION = 0x12, VITESSE = 0x13;
const COMPTE = 0x14, ATTRACTION_USEE = 0x16, VOYOU_PRECEDENT = 0x1E, PATIENCE = 0x20;
const CASE_DE_LA_BOUTIQUE = 0x49, CASE_DE_TRAVAIL = 0x4D, CIBLE_COLONNE = 0x56, CIBLE_RANGEE = 0x57;
const DIRECTION_DE_DEPART = 0x58, GENRE = 0x59, METIER = 0x59, COMPLICE = 0x61;
const MEFAIT = 2;                    // le bit de l'octet +5 : un voyou qu'on peut arrêter

const VOYOU = 0x1A, EMPLOYE = 8, VISITEUR = 2, BOUTIQUE = 0xA, ENTREE_D_ATTRACTION = 6;

// Les états du voyou (l'aiguillage de 0x21681, table 0x22156).
const SUR_LA_ROUTE = 1, AU_PORTIQUE = 2, DANS_LES_ALLEES = 3, LE_LONG_D_UNE_FILE = 4;
const A_L_ATTRACTION = 5, HORS_DES_ALLEES = 6, RELACHE = 7, ARRETE = 8, A_LA_BOUTIQUE = 9;
const EFFRAYE_UN_AMUSEUR = 0xA;
// Les états du gardien, et celui de l'amuseur qui s'enfuit.
const PATROUILLER = 0x34, MARCHER_VERS_LA_CIBLE = 0x36;
const S_EN_ALLER = 0x3F, DUREE_DE_LA_FUITE = 2000, DUREE_DE_LA_FRAYEUR = 200;
const PATIENCE_DU_GARDIEN = 400;

// --- les fonctions appelées ----------------------------------------------------------------------
const HASARD = 0x18B92;              // () : 0 à 0x7FFF
const OBJET_DE_TYPE_SUR_LA_CASE = 0x204B9;  // (cellule, type) : le premier objet de ce type, ou 0
const DEPLACER = 0x18A44;            // (objet, x, y) : change de case si besoin
const DEPLACER_EN_QUEUE = 0x18ADF;   // de même, mais range l'objet par 0x1883E (non établi)
const POSER_SUR_LA_CASE = 0x185C1;   // (objet, x, y)
const EFFACER_UN_OBJET = 0x18B62;    // (objet) : le retire des listes et met sa fiche à zéro
const CHERCHER_SON_CHEMIN = 0x349EB; // (objet, limite, sols interdits) : la direction vers la case
                                     // visée, 4 à l'arrivée, négatif en cas d'échec
const ATTRACTION_AU_BOUT_DE_LA_FILE = 0x281D5;  // (cellule) : l'attraction, ou 0
const ARRETER_UN_VOYOU = 0x3436C;    // (gardien) : 1 s'il en a arrêté un (personnel.js)
const DIVISION_PAR_ZERO = 0x19ED3;   // vitesse nulle : rend 1, efface la demande de sortie
const VALEUR_ABSOLUE = 0x80BF2;
const BRUITAGE_UNIQUE = 0x80FE0;     // (propriétaire, bruitage), sauf s'il joue déjà
const INSCRIRE_AU_LIVRE = 0x78943;   // (catégorie, montant)
const DESSINER_OBJET = 0x209B5;      // (objet graphique, x, y)

const BRUITAGE_DU_DEPART = 0x2D, BRUITAGE_DU_VOL = 0x2F;

// --- outils --------------------------------------------------------------------------------------
const tableDesObjets = (jeu) => long(jeu, OBJETS_DU_PARC);
const objetNumero = (jeu, n) => tableDesObjets(jeu) + n * TAILLE_OBJET;
const numeroDeLObjet = (jeu, o) => quotient(o - tableDesObjets(jeu), TAILLE_OBJET);
const cellule = (jeu, index) => long(jeu, GRILLE) + index * 4;
const indexDeLaCellule = (jeu, c) => (c - long(jeu, GRILLE)) >> 2;
const celluleDeLObjet = (jeu, o) => cellule(jeu, (octet(jeu, o + RANGEE) << 6) + octet(jeu, o + COLONNE));
const pasVers = (jeu, direction) => motSigne(jeu, PAS_DES_DIRECTIONS + direction * 2);
const voisine = (jeu, c, direction) => c + pasVers(jeu, direction) * 4;
const drapeauxDuSol = (jeu, c) => mot(jeu, SOLS + octet(jeu, c + 2) * 4);
const formeDuSol = (jeu, c) => octet(jeu, SOLS + 3 + octet(jeu, c + 2) * 4);
const opposee = (jeu, direction) => mot(jeu, DIRECTION_OPPOSEE + direction * 2);
const figure = (jeu, n) => mot(jeu, long(jeu, FIGURES) + (n & 0xFFFF) * 2);
const objetGraphique = (jeu, index) => long(jeu, OBJETS_GRAPHIQUES) + index * 8;
const tempsImpair = (jeu) => (octet(jeu, PAS_DE_SIMULATION) & 3) !== 0;   // 3 pas sur 4
const hasard = (jeu) => jeu.appeler(HASARD) & 0xFFFF;

// L'image suivante de l'animation en cours ; et la dernière image d'un cycle est-elle affichée ?
function animer(jeu, o) {
  poserMot(jeu, o + GRAPHIQUE, mot(jeu, objetGraphique(jeu, mot(jeu, o + GRAPHIQUE)) + 6));
}
const finDeCycle = (jeu, o) => (octet(jeu, objetGraphique(jeu, mot(jeu, o + GRAPHIQUE)) + 5) & 1) !== 0;

// Les images du voyou, selon son genre (ou selon l'octet +0x59 de l'objet donné : voir escorter).
const imageDuVoyou = (jeu, o, rang) =>
  figure(jeu, mot(jeu, IMAGES_DES_VOYOUS + octet(jeu, o + GENRE) * TAILLE_IMAGES_VOYOU + rang));
function prendreLaMarche(jeu, o) {
  poserMot(jeu, o + GRAPHIQUE, figure(jeu, mot(jeu, IMAGES_DES_VOYOUS + octet(jeu, o + GENRE) * TAILLE_IMAGES_VOYOU)
    + octet(jeu, o + DIRECTION)));
}
function tourner(jeu, o, direction) {
  poserOctet(jeu, o + DIRECTION, direction);
  prendreLaMarche(jeu, o);
}

// Le temps de traverser une case : 256 divisé par la vitesse, soit 16 pas.
function delaiParCase(jeu, o) {
  recalerAuMilieuDeLaCase(jeu, o);   // hors du jeu d'origine : corrections.js, éteint par défaut
  const vitesse = octet(jeu, o + VITESSE);
  return vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : (256 / vitesse) | 0;
}

// Le compte à rebours diminue d'un pas ; rend la nouvelle valeur.
function decompter(jeu, o) {
  const compte = s16(mot(jeu, o + COMPTE) - 1);
  poserMot(jeu, o + COMPTE, compte);
  return compte;
}

// Un pas de marche dans sa direction, par `deplacer`. Les coordonnées fines sont des mots : le
// programme ne garde que les 16 bits bas de la somme. Rend la position visée.
function avancer(jeu, o, deplacer = DEPLACER) {
  const direction = octet(jeu, o + DIRECTION) * 2;
  const vitesse = octet(jeu, o + VITESSE);
  const x = (mot(jeu, o + X) + octetSigne(jeu, AVANCEE + direction) * vitesse) & 0xFFFF;
  const y = (mot(jeu, o + Y) + octetSigne(jeu, AVANCEE + direction + 1) * vitesse) & 0xFFFF;
  jeu.appeler(deplacer, o, x, y);
  return { x, y };
}

// Viser une case voisine au hasard : colonne et rangée, chacune de −3 à +3 autour de la sienne.
function viserUneCaseAuHasard(jeu, o) {
  poserOctet(jeu, o + CIBLE_COLONNE, (hasard(jeu) % 7) + octet(jeu, o + COLONNE) - 3);
  poserOctet(jeu, o + CIBLE_RANGEE, (hasard(jeu) % 7) + octet(jeu, o + RANGEE) - 3);
}

// Sorti des allées : il vise une case voisine au hasard et cherche à y aller (état 6).
function sortirDesAllees(jeu, o) {
  viserUneCaseAuHasard(jeu, o);
  poserOctet(jeu, o + ETAT, HORS_DES_ALLEES);
  poserMot(jeu, o + COMPTE, 0);
  prendreLaMarche(jeu, o);
  return 1;
}

// --- le reste laissé sur la pile ------------------------------------------------------------------
//
// Une fonction d'état : `corps(jeu, o, reste)` fait le travail et, quand l'original écrivait sa
// variable [ebp-8], en note l'octet bas dans reste.octet (voir l'en-tête). E − 24, E étant le
// pointeur de pile à l'entrée.
const RESTE = 24;
function fonctionDEtat(corps) {
  return (jeu, o) => {
    jeu.T.sauver();
    const adresse = ((jeu.T.R.esp >>> 0) - RESTE) >>> 0;
    const trouve = long(jeu, adresse);
    const reste = { octet: null };
    const resultat = corps(jeu, o, reste);
    poserLong(jeu, adresse, reste.octet === null ? trouve : ((trouve & ~0xFF) | (reste.octet & 0xFF)));
    return resultat;
  };
}

// === L'arrivée ======================================================================================

// 0x4C592 — faire venir un voyou du genre donné (0 à 3).
//
// Le premier emplacement libre de la table des objets (après le premier, jamais utilisé) le reçoit :
// en (63, 61), au milieu de la case, sur la route à l'est du parc de la démo, tourné vers l'ouest,
// à la vitesse 16, dans l'état 1. La fiche du parc compte un voyou de plus. S'il n'y a pas de place,
// rien.
export function faireVenirUnVoyou(jeu, genre) {
  const fin = long(jeu, FIN_DES_OBJETS_DU_PARC);
  for (let o = tableDesObjets(jeu) + TAILLE_OBJET; o < fin; o += TAILLE_OBJET) {
    if (octet(jeu, o + TYPE) !== 0) continue;
    poserOctet(jeu, o + TYPE, VOYOU);
    poserOctet(jeu, o + COLONNE, 0x3F);
    poserOctet(jeu, o + RANGEE, 0x3D);
    poserOctet(jeu, o + X, 0x80);
    poserOctet(jeu, o + Y, 0x80);
    poserOctet(jeu, o + VITESSE, 0x10);
    poserOctet(jeu, o + DIRECTION, 3);
    poserOctet(jeu, o + ETAT, SUR_LA_ROUTE);
    poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
    poserOctet(jeu, o + GENRE, genre);
    poserMot(jeu, o + GRAPHIQUE, imageDuVoyou(jeu, o, IMAGE_D_ARRIVEE));
    jeu.appeler(POSER_SUR_LA_CASE, o, mot(jeu, o + X), mot(jeu, o + Y));
    const parc = long(jeu, PARC_COURANT);
    poserMot(jeu, parc + NOMBRE_DE_VOYOUS, mot(jeu, parc + NOMBRE_DE_VOYOUS) + 1);
    return;
  }
}

// === Les états du voyou ============================================================================

// 0x4C696 — état 1 : suivre la route.
//
// Il avance d'un pas à chaque mise à jour, l'animation aussi. Au bout de chaque case, le bruitage
// 0x2D ; arrivé à la colonne 0, il quitte la carte (la fiche du parc compte un voyou de moins) ;
// sinon, s'il voit le portique (sol 0x88) sur une case voisine, il y entre (état 2). Laisse sur la
// pile l'octet bas de son abscisse.
export const suivreLaRoute = fonctionDEtat((jeu, o, reste) => {
  animer(jeu, o);
  const { x, y } = avancer(jeu, o);
  reste.octet = x;
  if (decompter(jeu, o) > 0) return 0;
  jeu.appeler(BRUITAGE_UNIQUE, 0, BRUITAGE_DU_DEPART);
  if ((x >> 8) === 0) {
    const parc = long(jeu, PARC_COURANT);
    poserMot(jeu, parc + NOMBRE_DE_VOYOUS, mot(jeu, parc + NOMBRE_DE_VOYOUS) - 1);
    jeu.appeler(EFFACER_UN_OBJET, o);
    return 0;
  }
  poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
  const ici = cellule(jeu, ((y >> 8) << 6) + (x >> 8));
  for (let k = 0; k < 4; k++) {
    const c = voisine(jeu, ici, k);
    if (octet(jeu, c + 2) !== SOL_DU_PORTIQUE) continue;
    poserOctet(jeu, o + ETAT, AU_PORTIQUE);
    poserMot(jeu, o + CASE_DE_TRAVAIL, indexDeLaCellule(jeu, c));
    poserMot(jeu, o + GRAPHIQUE, imageDuVoyou(jeu, o, IMAGE_DU_PORTIQUE));
    return 1;
  }
  return 0;
});

// 0x4C864 — état 2 : passer le portique.
//
// Trois pas sur quatre, l'animation avance ; à la fin d'un cycle, il est posé au milieu de la case
// du portique, et prend la première allée voisine (haut, droite, bas, gauche) : état 3. Laisse sur
// la pile, quand il est posé, la direction de cette allée (4 s'il n'y en a pas).
export const passerLePortique = fonctionDEtat((jeu, o, reste) => {
  if (!tempsImpair(jeu)) return 0;
  animer(jeu, o);
  if (!finDeCycle(jeu, o)) return 0;
  const index = mot(jeu, o + CASE_DE_TRAVAIL);
  const portique = cellule(jeu, index);
  jeu.appeler(DEPLACER, o, ((index % 64) << 8) | 0x80, ((index >> 6) << 8) | 0x80);
  for (let k = 0; k < 4; k++) {
    reste.octet = k;
    if ((drapeauxDuSol(jeu, voisine(jeu, portique, k)) & SOL_ALLEE) === 0) continue;
    poserOctet(jeu, o + ETAT, DANS_LES_ALLEES);
    poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
    tourner(jeu, o, k);
    return 1;
  }
  reste.octet = 4;
  return 0;
});

// 0x4C9DD — état 3 : rôder dans les allées.
//
// Il avance tant que dure la case (l'animation un pas sur quatre) ; au bout de la case, il regarde,
// dans l'ordre :
//   1. un amuseur costumé sur sa case, qui ne s'enfuit pas déjà : il le fait fuir (état 0x3F de
//      l'amuseur, 2 000 pas, avec sa figure de fuite) et passe dans l'état 0xA pour 200 pas, en
//      notant l'amuseur (+0x61) et l'état à reprendre. Il poursuit pourtant son examen : un des cas
//      suivants peut changer son état aussitôt (anomalie d'origine, reproduite) ;
//   2. les quatre cases voisines, hors celle d'où il vient :
//      - au niveau BUSINESS, une boutique (sol 0x100) dont l'article a du stock : il va la voir
//        (état 9), en notant sa case de départ et sa direction ;
//      - sinon, un bout de file (sol 0x10) dont l'attraction est usée à moins de 40 : il s'y tourne
//        et longe la file (état 4), recentré dans sa case ;
//   3. hors des allées, ou sur une allée sans sortie : l'état 6 ;
//   4. sinon il choisit sa sortie (voir choisirUneSortie), puis vole le visiteur de sa case, s'il y
//      en a un (voir voler).
// Chaque méfait lève le bit 2 de +5. Laisse sur la pile 0 quand la case est finie.
export const roder = fonctionDEtat((jeu, o, reste) => {
  if (motSigne(jeu, o + COMPTE) > 0) {
    if (!tempsImpair(jeu)) animer(jeu, o);
    avancer(jeu, o);
  }
  if (decompter(jeu, o) > 0) return 0;
  reste.octet = 0;
  const arrivee = octet(jeu, o + DIRECTION);
  poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
  const ici = celluleDeLObjet(jeu, o);
  if ((drapeauxDuSol(jeu, ici) & SOL_ALLEE) === 0) return sortirDesAllees(jeu, o);

  effrayerUnAmuseur(jeu, o, ici);

  for (let k = 0; k < 4; k++) {
    if (k === opposee(jeu, arrivee)) continue;
    const c = voisine(jeu, ici, k);
    const drapeaux = drapeauxDuSol(jeu, c);
    if ((drapeaux & SOL_BOUTIQUE) !== 0 && octet(jeu, NIVEAU_DE_JEU) === NIVEAU_BUSINESS) {
      const boutique = jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, c, BOUTIQUE);
      if (boutique === 0 || stockDeLaBoutique(jeu, boutique) === null
          || mot(jeu, stockDeLaBoutique(jeu, boutique)) === 0) continue;
      poserMot(jeu, o + CASE_DE_LA_BOUTIQUE, (octet(jeu, boutique + RANGEE) << 6) + octet(jeu, boutique + COLONNE));
      poserOctet(jeu, o + ETAT, A_LA_BOUTIQUE);
      poserOctet(jeu, o + ETAT_SUIVANT, A_LA_BOUTIQUE);
      poserOctet(jeu, o + CIBLE_COLONNE, octet(jeu, o + COLONNE));
      poserOctet(jeu, o + CIBLE_RANGEE, octet(jeu, o + RANGEE));
      poserOctet(jeu, o + DIRECTION_DE_DEPART, arrivee);
      poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) | MEFAIT);
      if (k !== arrivee) tourner(jeu, o, k);
      return 1;
    }
    if ((drapeaux & SOL_BOUT_DE_FILE) === 0) continue;
    const attraction = jeu.appeler(ATTRACTION_AU_BOUT_DE_LA_FILE, c);
    if (attraction === 0 || mot(jeu, attraction + USURE) >= USURE_QUE_VISE_LE_VOYOU) continue;
    poserOctet(jeu, o + ETAT, LE_LONG_D_UNE_FILE);
    poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) | MEFAIT);
    if (k !== arrivee) tourner(jeu, o, k);
    poserOctet(jeu, o + Y, 0x80);
    poserOctet(jeu, o + X, 0x80);
    return 1;
  }

  const sorties = octet(jeu, SORTIES_D_UNE_ALLEE + formeDuSol(jeu, ici));
  if (sorties === 0) return sortirDesAllees(jeu, o);
  tourner(jeu, o, choisirUneSortie(jeu, ici, sorties, arrivee));
  voler(jeu, o, ici);
  return 0;
});

// La quantité en stock de l'article d'une boutique (son adresse), ou null si elle n'en a pas.
function stockDeLaBoutique(jeu, boutique) {
  const article = octetSigne(jeu, ARTICLE_DE_LA_BOUTIQUE + mot(jeu, boutique + 0x16));
  return article < 0 ? null : STOCKS + article * TAILLE_STOCK;
}

// Un amuseur costumé sur la case, qui ne s'enfuit pas déjà, s'enfuit ; le voyou le regarde partir.
function effrayerUnAmuseur(jeu, o, ici) {
  const employe = jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, ici, EMPLOYE);
  if (employe === 0) return;
  const fiche = METIERS + octet(jeu, employe + METIER) * TAILLE_METIER;
  if (mot(jeu, fiche + FIGURE_DE_FUITE) === 0 || octet(jeu, employe + ETAT) === S_EN_ALLER) return;
  poserOctet(jeu, o + ETAT_SUIVANT, octet(jeu, o + ETAT));
  poserOctet(jeu, employe + ETAT, S_EN_ALLER);
  poserMot(jeu, employe + COMPTE, DUREE_DE_LA_FUITE);
  poserMot(jeu, employe + GRAPHIQUE, figure(jeu, mot(jeu, fiche + FIGURE_DE_FUITE)));
  poserMot(jeu, o + COMPLICE, numeroDeLObjet(jeu, employe));
  poserOctet(jeu, o + ETAT, EFFRAYE_UN_AMUSEUR);
  poserMot(jeu, o + COMPTE, DUREE_DE_LA_FRAYEUR);
  poserMot(jeu, o + GRAPHIQUE, imageDuVoyou(jeu, o, IMAGE_DE_LA_FRAYEUR));
  poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) | MEFAIT);
}

// La sortie d'une allée que prend le voyou arrivé dans la direction `arrivee`.
//
// La table 0xB533A donne la suite du chemin quand elle est sans choix. Sinon, il tire une des
// sorties, hors celle d'où il vient : son rang est le hasard ET le nombre de sorties (et non le
// hasard modulo ce nombre), ramené à la moitié de ce nombre s'il le dépasse. Puis, si ce n'est pas
// tout droit :
//   - s'il peut aller tout droit, une fois sur deux il y va quand même, si la case tirée a une
//     sortie vers lui ;
//   - sinon, si la case tirée a une sortie vers lui mais pas dans la direction tirée, une fois sur
//     deux il prend la direction opposée à celle tirée.
// Anomalie reproduite : les sorties de la case tirée sont lues dans la table des formes d'allée à
// l'index des drapeaux de son sol (un mot), et non de sa forme ; pour une allée (drapeaux 2), c'est
// toujours l'octet 0xB4992.
function choisirUneSortie(jeu, ici, sorties, arrivee) {
  let direction = octetSigne(jeu, SUITE_DE_L_ALLEE + sorties * 4 + arrivee);
  if (direction !== -1) return direction;

  const retour = opposee(jeu, arrivee);
  sorties &= ~(1 << (retour & 0xFF));
  const possibles = [];
  for (let k = 0; k < 4; k++) if (sorties & (1 << k)) possibles.push(k);
  // Il reste toujours une sortie au moins : seuls les ensembles de plusieurs sorties donnent −1.
  const nombre = possibles.length;
  let rang = nombre & hasard(jeu) & 0xFF;
  if (rang > nombre - 1) rang = nombre >> 1;
  direction = possibles[rang];
  if (direction === arrivee) return direction;

  const sortiesTirees = octet(jeu, SORTIES_D_UNE_ALLEE + drapeauxDuSol(jeu, voisine(jeu, ici, direction)));
  const versLui = (sortiesTirees & (1 << (retour & 31))) !== 0;
  if ((sorties & (1 << arrivee)) !== 0) {
    if (versLui && (hasard(jeu) & 4) !== 0) direction = arrivee;
  } else if (versLui && (sortiesTirees & (1 << direction)) === 0) {
    if ((hasard(jeu) & 4) !== 0) direction = opposee(jeu, direction);
  }
  return direction;
}

// Le vol : le premier visiteur de la case perd un quart de son argent. S'il avait acheté ou essayé
// quelque chose, il le perd aussi : bruitage 0x2F, et le visiteur s'arrête pour exprimer son humeur
// (état 0x1A, image du mécontentement), l'état, l'image et la direction mis de côté, et perd de 100
// à 163 de contentement ; le voyou a commis un méfait.
function voler(jeu, o, ici) {
  const v = jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, ici, VISITEUR);
  if (v === 0) return;
  const argent = mot(jeu, v + ARGENT);
  poserMot(jeu, v + ARGENT, argent - (argent >> 2));
  if (mot(jeu, v + ACHATS) === 0) return;
  jeu.appeler(BRUITAGE_UNIQUE, 0, BRUITAGE_DU_VOL);
  poserOctet(jeu, v + DRAPEAUX, octet(jeu, v + DRAPEAUX) & VISITEUR_DETOURNE);
  if (octet(jeu, v + ETAT_A_REPRENDRE) === 0) poserOctet(jeu, v + ETAT_A_REPRENDRE, octet(jeu, v + ETAT));
  poserMot(jeu, v + IMAGE_GARDEE, mot(jeu, v + GRAPHIQUE));
  poserOctet(jeu, v + DIRECTION_GARDEE, octet(jeu, v + DIRECTION));
  poserOctet(jeu, v + DELAI_D_EMOTION, 0x20);
  poserMot(jeu, v + GRAPHIQUE,
    figure(jeu, mot(jeu, IMAGE_DU_VISITEUR_VOLE + octet(jeu, v + GENRE_DU_VISITEUR) * TAILLE_IMAGES_VISITEUR)));
  poserOctet(jeu, v + ETAT, EMOTION);
  poserMot(jeu, v + ACHATS, 0);
  poserMot(jeu, v + CONTENTEMENT, motSigne(jeu, v + CONTENTEMENT) - ((hasard(jeu) % 64) + 100));
  poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) | MEFAIT);
}

// 0x4D1CA — état 4 : longer une file d'attente, vers l'attraction.
//
// Au milieu de chaque case (octets +6 et +8 à 0x80), s'il n'y vient pas d'arriver (bit 2 de +5,
// qu'il efface alors), il choisit sa direction :
//   - hors d'une file : l'état 6 ;
//   - les sorties de la file, moins celle d'où il vient (la sortie opposée à sa direction) :
//     . s'il n'en manquait aucune (il n'est pas arrivé par une sortie), tout droit si possible,
//       sinon une des sorties au hasard (hasard ET sorties, toutes si le résultat est nul) ;
//     . s'il n'en reste aucune (le bout de la file), la première allée voisine en tournant à partir
//       de sa direction, et il rôde de nouveau (état 3) ; sans allée voisine, la direction des
//       sorties d'origine ;
//     . sinon, vers la sortie qui reste : si elle mène à une autre case de file, il la prend ;
//       sinon, s'il y a là l'entrée d'une attraction usée à moins de 40, il se tourne vers elle, par
//       la direction de la sortie d'où il vient (anomalie d'origine : il tourne le dos à
//       l'attraction), note l'attraction et passe dans l'état 5 ; sinon, il prend la direction de
//       la sortie d'où il vient.
// Puis il avance (l'animation un pas sur quatre). Laisse sur la pile la sortie ou la direction
// choisie (l'octet bas de sa variable), quand il y en a une.
export const longerLaFile = fonctionDEtat((jeu, o, reste) => {
  if (octet(jeu, o + X) === 0x80 && octet(jeu, o + Y) === 0x80) {
    if ((octet(jeu, o + DRAPEAUX) & MEFAIT) !== 0) {
      poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) & ~MEFAIT);
    } else {
      const r = choisirDansLaFile(jeu, o, reste);
      if (r !== null) return r;
    }
  }
  if (!tempsImpair(jeu)) animer(jeu, o);
  avancer(jeu, o);
  return 0;
});

// Le choix au milieu d'une case de file ; rend 1 s'il change d'état, null s'il avance.
function choisirDansLaFile(jeu, o, reste) {
  const ici = celluleDeLObjet(jeu, o);
  if ((drapeauxDuSol(jeu, ici) & SOL_FILE) === 0) return sortirDesAllees(jeu, o);
  const toutes = octet(jeu, SORTIES_D_UNE_FILE + formeDuSol(jeu, ici));
  const direction = octet(jeu, o + DIRECTION);
  const sorties = toutes & ~octet(jeu, SORTIE_OPPOSEE + direction);
  let choix;
  if (sorties === toutes) {
    if (toutes & (1 << direction)) choix = 1 << direction;
    else choix = (toutes & jeu.appeler(HASARD)) & 0xFFFF || toutes;
  } else if (sorties === 0) {
    for (let k = 0, d = direction; k < 4; k++, d = (d + 1) & 3) {
      if ((drapeauxDuSol(jeu, voisine(jeu, ici, d)) & SOL_ALLEE) === 0) continue;
      reste.octet = d;
      poserOctet(jeu, o + ETAT, DANS_LES_ALLEES);
      poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
      tourner(jeu, o, d);
      return 1;
    }
    choix = toutes;
  } else {
    const suivante = ici + motSigne(jeu, PAS_DES_DIRECTIONS + octetSigne(jeu, DIRECTION_D_UNE_SORTIE + sorties) * 2) * 4;
    if ((drapeauxDuSol(jeu, suivante) & SOL_FILE) !== 0) {
      choix = sorties;
    } else {
      choix = (octet(jeu, SORTIES_D_UNE_FILE + formeDuSol(jeu, ici)) & ~sorties) & 0xFFFF;
      reste.octet = choix;
      const entree = jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, suivante, ENTREE_D_ATTRACTION);
      if (entree !== 0) {
        const attraction = objetNumero(jeu, mot(jeu, entree + ATTRACTION_USEE));
        if (mot(jeu, attraction + USURE) < USURE_QUE_VISE_LE_VOYOU) {
          poserOctet(jeu, o + DIRECTION, octet(jeu, DIRECTION_DES_SORTIES + s16(choix)));
          poserOctet(jeu, o + ETAT, A_L_ATTRACTION);
          prendreLaMarche(jeu, o);
          poserMot(jeu, o + ATTRACTION_USEE, numeroDeLObjet(jeu, attraction));
          return 1;
        }
      }
    }
  }
  reste.octet = choix;
  tourner(jeu, o, octet(jeu, DIRECTION_DES_SORTIES + s16(choix)));
  return null;
}

// 0x4D644 — état 5 : user l'attraction. Un cran d'usure par pas jusqu'à 40 ; puis il reprend la
// file (état 4). Laisse sur la pile l'octet bas de l'adresse de l'attraction.
export const userLAttraction = fonctionDEtat((jeu, o, reste) => {
  const attraction = objetNumero(jeu, mot(jeu, o + ATTRACTION_USEE));
  reste.octet = attraction;
  poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) | MEFAIT);
  if (mot(jeu, attraction + USURE) < USURE_QUE_VISE_LE_VOYOU) {
    poserMot(jeu, attraction + USURE, mot(jeu, attraction + USURE) + 1);
    return 0;
  }
  poserOctet(jeu, o + ETAT, LE_LONG_D_UNE_FILE);
  return 1;
});

// 0x4D69C — état 6 : hors des allées, aller vers la case visée.
//
// À chaque case, il cherche son chemin (0x349EB, les files interdites en plus) : arrivé ou sans
// chemin, il vise une autre case au hasard et attend un pas ; sur une allée, il rôde de nouveau
// (état 3) ; sinon il prend la direction trouvée. L'animation avance à chaque pas. Laisse sur la
// pile l'octet bas de l'ordonnée où il va, quand il marche.
export const allerHorsDesAllees = fonctionDEtat((jeu, o, reste) => {
  animer(jeu, o);
  if (decompter(jeu, o) <= 0) {
    poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
    const direction = s16(jeu.appeler(CHERCHER_SON_CHEMIN, o, 0x32, SOLS_INTERDITS_AU_VOYOU));
    if (direction === 4 || direction < 0) {
      viserUneCaseAuHasard(jeu, o);
      poserMot(jeu, o + COMPTE, 1);
      return 0;
    }
    if ((drapeauxDuSol(jeu, celluleDeLObjet(jeu, o)) & SOL_ALLEE) !== 0) {
      poserMot(jeu, o + COMPTE, 0);
      poserOctet(jeu, o + ETAT, DANS_LES_ALLEES);
      return 1;
    }
    tourner(jeu, o, direction);
  }
  reste.octet = avancer(jeu, o).y;
  return 0;
});

// 0x4DA0C — état 7 : relâché par le gardien, repartir.
//
// Trois pas sur quatre, l'animation avance ; à la fin d'un cycle, il se tourne vers l'ouest avec
// son image d'arrivée et reprend la route (état 1). Laisse sur la pile, alors, le délai d'une case.
export const repartir = fonctionDEtat((jeu, o, reste) => {
  if (!tempsImpair(jeu)) return 0;
  animer(jeu, o);
  if (!finDeCycle(jeu, o)) return 0;
  const delai = delaiParCase(jeu, o);
  reste.octet = delai;
  poserMot(jeu, o + COMPTE, delai);
  poserOctet(jeu, o + DIRECTION, 3);
  poserMot(jeu, o + GRAPHIQUE, imageDuVoyou(jeu, o, IMAGE_D_ARRIVEE));
  poserOctet(jeu, o + ETAT, SUR_LA_ROUTE);
  return 1;
});

// 0x4D88D — état 8 : arrêté, suivre son gardien.
//
// Il avance (l'animation un pas sur quatre) ; à chaque case, il vise la case du gardien (+0x61),
// en prend la vitesse, et cherche son chemin vers elle. Laisse sur la pile l'octet bas de
// l'ordonnée où il va.
export const suivreSonGardien = fonctionDEtat((jeu, o, reste) => {
  if (!tempsImpair(jeu)) animer(jeu, o);
  reste.octet = avancer(jeu, o).y;
  if (decompter(jeu, o) > 0) return 0;
  const gardien = objetNumero(jeu, mot(jeu, o + COMPLICE));
  poserOctet(jeu, o + CIBLE_COLONNE, octet(jeu, gardien + COLONNE));
  poserOctet(jeu, o + CIBLE_RANGEE, octet(jeu, gardien + RANGEE));
  poserOctet(jeu, o + VITESSE, octet(jeu, gardien + VITESSE));
  poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
  const direction = jeu.appeler(CHERCHER_SON_CHEMIN, o, 0x32, SOLS_INTERDITS) & 0xFFFF;
  if (direction < 4) tourner(jeu, o, direction);
  return 0;
});

// 0x4DAD1 — état 9 : aller à la boutique, et en revenir.
//
// Il avance vers la case notée en +0x49 (par 0x18ADF), en ligne droite : d'abord sur l'axe où
// l'écart est le plus grand. Arrivé :
//   - si c'est sa case de départ, il rôde de nouveau (état 3), dans sa direction de départ ;
//   - sinon (il est à la boutique), il note sa case de départ comme prochaine étape et la boutique
//     de la case où il allait perd les trois quarts de son stock (le mot est décalé de 2 bits).
// Laisse sur la pile l'octet bas de l'ordonnée où il va.
export const allerALaBoutique = fonctionDEtat((jeu, o, reste) => {
  if (!tempsImpair(jeu)) animer(jeu, o);
  const { x, y } = avancer(jeu, o, DEPLACER_EN_QUEUE);
  reste.octet = y;
  if (decompter(jeu, o) > 0) return 0;
  poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
  const but = mot(jeu, o + CASE_DE_LA_BOUTIQUE);
  const dx = s16((but % 64) - octet(jeu, o + COLONNE));
  const dy = s16((but >> 6) - octet(jeu, o + RANGEE));
  if ((jeu.appeler(VALEUR_ABSOLUE, dx) | 0) > (jeu.appeler(VALEUR_ABSOLUE, dy) | 0)) {
    tourner(jeu, o, dx > 0 ? 1 : 3);
    return 0;
  }
  if (dy !== 0) {
    tourner(jeu, o, dy > 0 ? 2 : 0);
    return 0;
  }
  const depart = (octet(jeu, o + CIBLE_RANGEE) << 6) + octet(jeu, o + CIBLE_COLONNE);
  if (but === depart) {
    poserOctet(jeu, o + ETAT, DANS_LES_ALLEES);
    tourner(jeu, o, octet(jeu, o + DIRECTION_DE_DEPART));
    return 1;
  }
  poserMot(jeu, o + CASE_DE_LA_BOUTIQUE, depart);
  const boutique = jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, cellule(jeu, ((y >> 8) << 6) + (x >> 8)), BOUTIQUE);
  if (boutique !== 0) {
    const stock = stockDeLaBoutique(jeu, boutique);
    if (stock !== null) poserMot(jeu, stock, mot(jeu, stock) >> 2);
  }
  return 1;
});

// 0x4DD81 — état 0xA : regarder fuir l'amuseur. L'animation avance un pas sur quatre ; au bout du
// compte à rebours, il reprend l'état mis de côté, avec l'image de la marche.
export const regarderFuirLAmuseur = fonctionDEtat((jeu, o) => {
  if (!tempsImpair(jeu)) animer(jeu, o);
  if (decompter(jeu, o) > 0) return 0;
  poserOctet(jeu, o + ETAT, octet(jeu, o + ETAT_SUIVANT));
  prendreLaMarche(jeu, o);
  poserMot(jeu, o + COMPTE, 0);
  return 1;
});

// === Le gardien =====================================================================================

const ficheDuMetier = (jeu, o) => METIERS + octet(jeu, o + METIER) * TAILLE_METIER;
const figureDuMetier = (jeu, o, champ) =>
  figure(jeu, mot(jeu, ficheDuMetier(jeu, o) + champ) + octet(jeu, o + DIRECTION));

// 0x3455A — le gardien marche vers la case visée (état 0x36).
//
// Il avance tant que dure la case (l'animation un pas sur quatre). Au bout, il arrête un voyou à
// côté de lui s'il en voit un (0x3436C) ; sinon il cherche son chemin. Arrivé, ou sans chemin, il
// reprend l'état mis de côté (0x34 : patrouiller ; 0x38 : escorter), avec l'image de l'attente et
// une patience de 400 pas. Laisse sur la pile l'octet bas de l'ordonnée où il va, quand il marche.
export const marcherVersLaCibleDuGardien = fonctionDEtat((jeu, o, reste) => {
  if (motSigne(jeu, o + COMPTE) > 0) {
    if ((octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 3) === 0) animer(jeu, o);
    reste.octet = avancer(jeu, o).y;
  }
  if (decompter(jeu, o) > 0) return 0;
  if ((jeu.appeler(ARRETER_UN_VOYOU, o) & 0xFFFF) === 1) return 1;
  const direction = s16(jeu.appeler(CHERCHER_SON_CHEMIN, o, 0x32, SOLS_INTERDITS));
  if (direction < 0 || direction === 4) {
    poserOctet(jeu, o + ETAT, octet(jeu, o + ETAT_SUIVANT));
    poserMot(jeu, o + GRAPHIQUE, figureDuMetier(jeu, o, FIGURE_D_ATTENTE));
    poserLong(jeu, o + PATIENCE, PATIENCE_DU_GARDIEN);
    poserMot(jeu, o + COMPTE, PATIENCE_DU_GARDIEN);
    return 1;
  }
  poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
  poserOctet(jeu, o + DIRECTION, direction);
  poserMot(jeu, o + GRAPHIQUE, figureDuMetier(jeu, o, FIGURE_DE_MARCHE));
  return 0;
});

// 0x34728 — le gardien, arrivé à l'entrée du parc, relâche ses voyous (état 0x38).
//
// Chaque voyou de sa chaîne (+0x1E) passe dans l'état 7, avec l'image d'arrivée, et est posé au
// milieu de la première case voisine du gardien dont le sol est de ceux où l'on ne va pas (la
// route, le portique…). Puis le gardien retourne à la case d'où il était parti (+0x4D) pour
// patrouiller (état 0x36, puis 0x34) ; sa chaîne et sa case de départ sont effacées. L'état ne dure
// qu'un pas.
// Anomalie reproduite : l'image du voyou relâché est lue à l'octet +0x59 du gardien (son métier,
// 8), et non du voyou : 0xB537C + 8 × 10 tombe hors de la table des quatre genres.
// Laisse sur la pile l'octet bas du lien du dernier voyou (0), quand il y en a.
export const relacherLesVoyous = fonctionDEtat((jeu, o, reste) => {
  const table = tableDesObjets(jeu);
  for (let v = objetNumero(jeu, mot(jeu, o + VOYOU_PRECEDENT)); v > table;) {
    poserOctet(jeu, v + ETAT, RELACHE);
    poserMot(jeu, v + GRAPHIQUE, imageDuVoyou(jeu, o, IMAGE_D_ARRIVEE));
    const precedent = mot(jeu, v + VOYOU_PRECEDENT);
    reste.octet = precedent;
    const ici = celluleDeLObjet(jeu, o);
    for (let k = 0; k < 4; k++) {
      const c = voisine(jeu, ici, k);
      if ((drapeauxDuSol(jeu, c) & SOLS_INTERDITS) === 0) continue;
      const index = indexDeLaCellule(jeu, c);
      jeu.appeler(DEPLACER, v, (((index % 64) & 0xFF) << 8) | 0x80, ((quotient(index, 64) & 0xFF) << 8) | 0x80);
      break;
    }
    v = objetNumero(jeu, precedent);
  }
  const depart = mot(jeu, o + CASE_DE_TRAVAIL);
  poserOctet(jeu, o + CIBLE_COLONNE, depart % 64);
  poserOctet(jeu, o + CIBLE_RANGEE, depart >> 6);
  poserOctet(jeu, o + ETAT_SUIVANT, PATROUILLER);
  poserOctet(jeu, o + ETAT, MARCHER_VERS_LA_CIBLE);
  poserMot(jeu, o + COMPTE, 0);
  poserMot(jeu, o + VOYOU_PRECEDENT, 0);
  poserMot(jeu, o + CASE_DE_TRAVAIL, 0);
  return 0;
});

// === L'amuseur qui s'enfuit =========================================================================

// 0x35652 — état 0x3F de l'employé : l'amuseur qu'un voyou a fait fuir (effrayerUnAmuseur, plus
// haut, lui donne 2 000 pas) s'en va. Il ne bouge pas : il décompte, et au bout il est renvoyé
// (0x325DA : il quitte le parc et son métier compte un employé de moins) ; rend alors 1. Au cadre de
// 4 octets de l'original, il laisse en [ebp-8] l'argument qu'il empile pour 0x325DA : d'où l'appel
// par la table, et non direct.
const RENVOYER_UN_EMPLOYE = 0x325DA;  // (employé) : renvoyerUnEmploye, ci-dessous
const lAmuseurSEnVa = dansLeCadre(4, (jeu, cadre, o) => {
  poserMot(jeu, o + COMPTE, mot(jeu, o + COMPTE) - 1);
  if (motSigne(jeu, o + COMPTE) > 0) return 0;
  jeu.appeler(RENVOYER_UN_EMPLOYE, o);
  return 1;
});

// === Le renvoi d'un employé =========================================================================

// 0x325DA — renvoyer un employé (l'écran de l'employé, 0x3B76E ; l'amuseur qui a fui, 0x35652).
//
// La fiche du parc compte un employé de moins dans sa catégorie (+0xD4 les amuseurs, +0xCC le
// mécanicien, +0xD0 l'agent d'entretien ; rien pour le gardien, que l'embauche ne compte pas non
// plus), le métier aussi (+0x33 de sa fiche) ; la fiche du parc courant compte un employé de moins
// (+0xC2) et un renvoi de plus (+0xC4). Le salaire d'embauche est inscrit au livre en catégorie 3,
// en dépense (une indemnité, vraisemblablement), et l'employé est effacé.
export function renvoyerUnEmploye(jeu, o) {
  const fiche = ficheDuMetier(jeu, o);
  const parc = FICHES_DES_PARCS + octet(jeu, COMPTES + mot(jeu, JOUEUR) * TAILLE_COMPTES + NUMERO_DU_PARC) * TAILLE_FICHE_DE_PARC;
  const compte = { 2: 0xD4, 8: 0xCC, 0x16: 0xD0 }[mot(jeu, fiche + ETAT_D_EMBAUCHE)];
  if (compte !== undefined) poserMot(jeu, parc + compte, mot(jeu, parc + compte) - 1);
  poserOctet(jeu, fiche + NOMBRE_DU_METIER, octet(jeu, fiche + NOMBRE_DU_METIER) - 1);
  const courant = long(jeu, PARC_COURANT);
  poserMot(jeu, courant + PERSONNEL, mot(jeu, courant + PERSONNEL) - 1);
  poserMot(jeu, courant + RENVOIS, mot(jeu, courant + RENVOIS) + 1);
  jeu.appeler(INSCRIRE_AU_LIVRE, 3, -mot(jeu, fiche + SALAIRE_D_EMBAUCHE));
  jeu.appeler(EFFACER_UN_OBJET, o);
}

// === Le dessin ======================================================================================

// 0x1C90B — dessiner un voyou, dans les états 1 à 0xA, à sa position fine dans la case dont le coin
// haut gauche est (x, y) : x + L × (+6) / 256 + (+8) / 32 en 320x200 (mode 8 : tuiles de 48 × 32,
// L la largeur de tuile), / 16 en 640x480 ; y + (+8) / 16, ou / 8 (dessin-objets.js).
const MODE_AFFICHAGE = 0xDE5F6, LARGEUR_TUILE = 0xD663A, BASSE_RESOLUTION = 8;
export function dessinerUnVoyou(jeu, o, x, y) {
  const etat = octet(jeu, o + ETAT);
  if (etat < SUR_LA_ROUTE || etat > EFFRAYE_UN_AMUSEUR) return;
  const basse = mot(jeu, MODE_AFFICHAGE) === BASSE_RESOLUTION;
  const fx = octet(jeu, o + X), fy = octet(jeu, o + Y);
  const px = s16(x) + ((mot(jeu, LARGEUR_TUILE) * fx) >> 8) + (basse ? fy >> 5 : fy >> 4);
  const py = s16(y) + (basse ? fy >> 4 : fy >> 3);
  jeu.appeler(DESSINER_OBJET, mot(jeu, o + GRAPHIQUE), s16(px), s16(py));
}

// =================================================================================================

// Toutes écrivent dans les objets du parc, dans le tas (ou, pour le dessin, lisent ce que d'autres
// y écrivent) : la comparaison appel par appel restaure et compare toute la mémoire.
const reecriture = (adresse, nom, fn, arguments_, retour = true) =>
  ({ adresse, nom, fn, arguments: arguments_, retour, memoire: 'entiere' });

export const reecritures = [
  reecriture(0x4C592, 'faireVenirUnVoyou', faireVenirUnVoyou, 1, false),
  reecriture(0x4C696, 'suivreLaRoute', suivreLaRoute, 1),
  reecriture(0x4C864, 'passerLePortique', passerLePortique, 1),
  reecriture(0x4C9DD, 'roder', roder, 1),
  reecriture(0x4D1CA, 'longerLaFile', longerLaFile, 1),
  reecriture(0x4D644, 'userLAttraction', userLAttraction, 1),
  reecriture(0x4D69C, 'allerHorsDesAllees', allerHorsDesAllees, 1),
  reecriture(0x4DA0C, 'repartir', repartir, 1),
  reecriture(0x4D88D, 'suivreSonGardien', suivreSonGardien, 1),
  reecriture(0x4DAD1, 'allerALaBoutique', allerALaBoutique, 1),
  reecriture(0x4DD81, 'regarderFuirLAmuseur', regarderFuirLAmuseur, 1),
  reecriture(0x3455A, 'marcherVersLaCibleDuGardien', marcherVersLaCibleDuGardien, 1),
  reecriture(0x34728, 'relacherLesVoyous', relacherLesVoyous, 1),
  reecriture(0x35652, 'lAmuseurSEnVa', lAmuseurSEnVa, 1),
  reecriture(0x325DA, 'renvoyerUnEmploye', renvoyerUnEmploye, 1, false),
  reecriture(0x1C90B, 'dessinerUnVoyou', dessinerUnVoyou, 3, false),
];

export const enAttente = [];

// VÉRIFICATION. Comparaison appel par appel (comparer.mjs, --modules voyous) : 0 divergence sur
// voyous-arrestation (200 s), voyous-vandale (200 s) et longue-faillite (300 s) ; chacune des seize
// fonctions d'alors y est appelée au moins une fois (0x1C90B et 0x78CEF par les deux premiers
// seulement). Depuis, l'écran du bus (0x78CEF) est rangé dans carte-du-parc.js, et la fuite de
// l'amuseur (0x35652), prouvée avec negociations.js, rangée ici ; le code n'a pas changé.
// Rejeu empoisonné (verifier.mjs --empoisonner --modules voyous) : IDENTIQUE sur les 34 scénarios de
// travail/verifier-tout.ps1, chacun avec sa durée.
