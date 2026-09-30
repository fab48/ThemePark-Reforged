// Des états des visiteurs, appelés par la mise à jour des objets du parc (0x21681) : premier lot.
//
// À chaque passage, 0x21681 confie chaque visiteur (objet de type 2) à la routine de son état,
// l'octet +0xC : 36 états pairs, de 2 à 0x4E sauf 0x24, 0x26 et 0x30 (leurs valeurs en 0x21723, les
// adresses des routines en 0x21747, le saut en 0x2185A ; l'état 0x1C n'a pas de routine). Ce module
// réécrit huit de ces routines et quatre de leurs auxiliaires :
//
//   état 0x02  0x2223B  le visiteur descendu du bus gagne l'allée ;
//   état 0x0A  0x243DD  il s'avance dans la file d'attente d'une attraction et prend son tour ;
//   état 0x10  0x24F82  il quitte une attraction par sa sortie ;
//   état 0x12  0x254D2  il suit le circuit d'une attraction où l'on se déplace soi-même (dans la
//                       simulation, le canal du RUBBER TUBING) ;
//   état 0x14  0x25E1B  il va vers une boutique ;
//   état 0x18  0x2641F  il revient de la boutique vers l'allée qu'il avait quittée ;
//   état 0x22  0x2698E  il attend le bus du départ ;
//   état 0x36  0x258D9  il est au volant d'une voiture, sur le circuit d'une attraction à voitures ;
//   0x31F95 (le visiteur descend d'une attraction : il est posé à la sortie), 0x65E3D (un incident
//   sur le circuit, au hasard), 0x28656 (ajouter au contentement), 0x282E7 (s'orienter selon un
//   vecteur de déplacement).
//
// Le sens de ces états a été établi par ce que lisent et écrivent les routines, et par une sonde
// posée pendant la simulation (moteur/scenarios/simulation.json) : sols foulés, attractions et
// boutiques désignées, passages d'un état à l'autre. Les autres états nommés ici le sont d'après les
// routines qui les posent ou les traitent, hors de ce module : 4 (0x223C1, à l'entrée du parc), 6
// (0x2293A, le visiteur cherche son chemin), 8 (0x22E22, il se promène sur les allées), 0x0C (0x24DFE,
// il fait la queue), 0x1C (il est monté dans le bus), 0x1E (0x266D7, il va vers l'arrêt du bus), 0x38
// (0x25FE7, il est à la boutique), 0x3C puis 0x1A (0x27494, 0x273C8 : une pause où il prend la figure
// d'une expression, avant de reprendre l'état gardé dans son octet +BC), 0x40 (0x22BA6, il quitte le
// parc : 0x22834 le pose en le renvoyant chez lui).
//
// Réécriture lisible, prouvée identique à la transcription : voir docs/guide-reecriture.md.
//
// --- Le visiteur ------------------------------------------------------------------------------------
//
// Un objet du parc de 200 octets, table [0xD3B10] (retro-ingenierie.md § 6.4). Ce que ces routines en
// lisent et en écrivent :
//
//   +2    mot signé   l'objet suivant sur la même case
//   +4    octet       le type : 2
//   +5    octet       drapeaux : bit 0 effacé en revenant de boutique (sens non établi) ; bit 1, posé
//                     en entrant dans une file (0x22E22) ou en rejoignant l'allée au retour d'une
//                     boutique (0x2641F), fait sauter la décision de la case où il se trouve (0x243DD
//                     l'efface au lieu de décider) ; bit 2, une silhouette à part (la figure 0x2A2) en
//                     revenant de boutique — posé à la création (0x2845A) pour certains visiteurs du
//                     genre 0 : ce qu'il représente, non établi
//   +6    mot         position horizontale, en 256e de case : la colonne dans l'octet haut (+7), la
//                     fraction dans l'octet bas (+6 ; 0x80 = le milieu de la case)
//   +8    mot         position verticale, de même : la rangée dans l'octet +9
//   +A    mot         l'objet graphique affiché (l'image d'animation en cours)
//   +C    octet       l'état
//   +E    mot         vecteur de déplacement, composante horizontale (0x282E7)
//   +10   mot         vecteur de déplacement, composante verticale
//   +12   octet       la direction : 0 rangée − 1, 1 colonne + 1, 2 rangée + 1, 3 colonne − 1
//   +13   octet       la vitesse : de combien de 256e de case il avance à chaque passage (8 ou 16 à
//                     la création, 0x2845A ; une autre dans le canal d'une attraction, la vitesse de
//                     marche étant alors gardée dans +58)
//   +14   mot signé   décompte des passages : jusqu'au centre de la case suivante, jusqu'à une
//                     décision ; 0x100 / vitesse pour traverser une case
//   +16   mot         l'attraction (ou la boutique) visée ou fréquentée, par son numéro d'objet
//   +1E   mot         dans une file d'attente : le visiteur qui fait la queue derrière lui
//   +20   mot long    le pas de simulation (0xD3AFC) où il a pris place dans la file ; dans l'état 4,
//                     0x223C1 s'en sert de compteur d'étapes (0, 1, 2)
//   +28   mot         l'écart avec lequel il s'est rangé dans une file (0x26BDE) : 0x80 à l'arrêt du
//                     bus, la valeur de [0xB8B9C]
//   +45   mot         dans le bus : le passager suivant (le bus garde le premier dans son mot +45)
//   +47   mot         dans une attraction : le passager suivant (l'attraction garde le premier)
//   +49   mot         la case d'une boutique visée (colonne + 64 × rangée)
//   +4C   octet       lu, et remis à zéro, par 0x243DD seulement ; aucune instruction du programme n'y
//                     écrit autre chose que 0 : toujours nul, et la branche qui en dépend (rester une
//                     fois dans une file sans issue) vraisemblablement morte
//   +4F   octet signé le joueur dans le parc duquel le visiteur est compté ([0xD665C], posé par
//                     0x223C1 quand il franchit l'entrée, avec un présent de plus) ; −1 hors de tout
//                     parc : à la création (0x2845A), puis une fois son départ compté
//   +50   octet signé deux jauges que les boutiques font varier (octets +0x32 et +0x33 de la fiche du
//   +51   octet signé genre de la boutique) ; à 0 ou moins, 0x2789A lui en donne la pensée (0x219,
//                     0x21A) ; au-delà des seuils d'une attraction, il en sort malade. La faim et la
//                     soif ? non établi
//   +54   mot signé   le contentement : 0x21681 range les visiteurs en trois classes selon ce mot et
//                     deux seuils de la fiche du parc (mots +2 et +0), 0x672A5 le fait varier selon
//                     l'état (à la sortie d'une attraction, entre autres), le circuit d'une attraction
//                     l'augmente à chaque case, et il est versé au bilan du parc au départ du visiteur
//   +56   octet       une case à rejoindre, colonne (choisie par 0x22834 ; en boutique, la case de
//   +57   octet       l'allée qu'il a quittée), et rangée
//   +58   octet       une valeur mise de côté : sa direction sur l'allée avant la boutique (états
//                     0x14 et 0x18), sa vitesse de marche pendant le circuit (état 0x12)
//   +59   octet       le genre de visiteur, 0 à 7 : il choisit ses figures (table 0xB49F4)
//   +5A   octet       l'expression qu'il montre dans l'état 0x3C (0x27494 en tire une figure de son
//                     allure par la table 0xB4B3C ; 0 : selon son contentement) : 0x22E22 y met 1 à 3
//                     en le faisant entrer dans une file, l'embarquement (0x30B19, 0x30C65) y ajoute
//                     3, 0x243DD l'efface quand il sort d'une file sans issue ; sens exact non établi
//   +5F   mot         2 : une autre figure sur le circuit (0x65E3D la bascule au hasard)
//   +63   octet       bit 2 : malade en sortant d'une attraction (sens exact non établi)
//   +75   mot long    le pas de simulation de son entrée dans le parc (0x223C1), puis de sa dernière
//                     sortie d'attraction : 0x22834 le renvoie chez lui passé 4 000 pas (quatre mois)
//                     sans attraction
//   +81   octet       le nombre d'attractions faites
//   +C5   octet       une direction mise de côté quand +5F passe à 2 (0x65E3D, cas 4)
//   +C7   octet       1 à 8, tiré au hasard quand il sort malade (sens non établi)
//
// --- La carte et les sols ---------------------------------------------------------------------------
//
// La grille [0xD3B08], 64 × 64 cellules de 4 octets (§ 6.2) : +0 la liste des objets de la case, +2 le
// sol. Chaque sol a une fiche de 4 octets en 0xB44D9 : +0 un mot de drapeaux, +3 sa forme. Les
// drapeaux que lisent ces routines, établis par les sols que foulent les visiteurs de la simulation :
//
//   0x02  une allée (sols 85 à 102, 117 à 120, 137, 138, 150 à 157, 216 à 236)
//   0x04  le sol d'une attraction (sols 4, 163 à 183)
//   0x08  une file d'attente (sols 121 à 133 ; 0x10 en plus pour les bouts de file, 128 à 131)
//   0x20  la sortie d'une attraction (sols 159 à 162) : la forme y donne la direction à prendre
//   0x40  le circuit d'une attraction où l'on circule (sols 101, 102, 119, 120, 132, 133, 139 à 149,
//         205 à 215 ; dans la simulation, le canal du RUBBER TUBING)
//
// Pour une file ou un circuit, la forme mène aux directions ouvertes, un masque de 4 bits (bit d pour
// la direction d), par la table 0xB49D3 (files) ou 0xB49C1 (circuits) : 0 aucune, 1 à 4 les virages
// (3, 6, 0xC, 9), 5 et 6 les droites (5, 0xA), 7 à 10 les bouts (8, 2, 4, 1). Ni carrefour ni
// embranchement : une file ou un circuit est une ligne. L'arrêt du bus est le sol 0x88 (136).
//
// --- Les tables des directions (données statiques, jamais écrites) ----------------------------------
//
//   0xB4920  mots signés, la case voisine dans la direction d, en cases : −64, +1, +64, −1
//   0xB4932  octets signés, par paires : le pas (dx, dy) de la direction d
//   0xB491C  octet : le bit de la direction opposée à d (4, 8, 1, 2)
//   0xB48EC  mots : la direction opposée à d (2, 3, 0, 1)
//   0xB4970  octet : la direction retenue pour un masque de directions (pour un seul bit, la sienne ;
//            pour plusieurs, l'une d'elles)
//   0xB4B14  octet signé : la direction d'un masque d'un seul bit. Le programme l'indexe aussi par
//            des masques de deux bits, et en tire alors l'une des deux directions, ou 4 et 8, hors
//            d'usage, pour 9 et 0xA (voir deciderAuCentre)
//
// --- La pile : ce que le jeu relit sous le pointeur de pile ------------------------------------------
//
// La pile laissée sous le pointeur n'est pas toujours morte. 0x21681 appelle la routine de chaque
// objet du parc, quel que soit son type, à la même hauteur de pile : le cadre de chacune (ebx, esi,
// edi, ebp sauvés, puis ses variables locales) recouvre celui de la précédente. Or 0x223C1, l'état 4
// des visiteurs (à l'entrée du parc), lit l'octet bas de sa variable [ebp-8] sans l'avoir écrite :
// quand son mot long +20 vaut 1 en entrant, il saute le pas qui l'aurait écrite (0x22413), puis, son
// décompte épuisé, tire de cet octet — la fraction de position qu'il croit lire — le nombre de passages
// d'un recentrage (0x22572). Il y trouve ce qu'a laissé la routine appelée avant lui, pour un autre
// objet. Anomalie du programme d'origine, qui fait dépendre la simulation de ces restes.
//
// Les routines réécrites ici laissent donc à cet endroit — E − 24, E le pointeur de pile à l'entrée,
// puisque ebp = E − 16 — l'octet bas de ce que l'original y laissait (voir Cadre). C'est nécessaire :
// sans cela, le rejeu de la simulation diverge à 39,76 s. Et c'est suffisant pour les scénarios :
// dans une partie jouée par la transcription seule, brouiller après chacune de ces onze fonctions les
// 512 octets sous E, sauf celui-là, ne change rien (simulation, démo, parc, écrans, construction, sur
// toute leur durée) ; les brouiller tous fait diverger la simulation à 39,8 s et la démo à 136,8 s. Les
// restes des quatre auxiliaires ne comptent pas. Le reste du cadre (registres sauvés, autres variables,
// cadres des fonctions appelées, qui ne sont pas à la même hauteur que dans l'original) n'est pas
// reproduit ; si une fonction encore inconnue en relisait une partie, c'est là qu'il faudrait regarder.
// Une analyse du flot des 1 116 fonctions (écrit avant lu, sur tous les chemins) signale 93 fonctions
// qui peuvent lire une variable locale non écrite ; parmi celles qu'appelle 0x21681, 0x223C1 est la
// seule dont la lecture est avérée (les autres ne le feraient que pour une direction hors de 0 à 3, ou
// relisent sur 32 bits un mot écrit sur 16).
//
// La contrainte vaut pour toute routine réécrite que 0x21681 appelle, dans n'importe quel module : elle
// doit laisser en E − 24 l'octet de l'original — celui de sa variable [ebp-8] si elle en a une, sinon ce
// qu'y écrivent les appels qu'elle fait (adresse de retour, registres sauvés de l'appelée), sinon
// l'octet d'entrée. Et une réécriture de 0x223C1 doit, elle, relire cet octet en mémoire.

import { ADRESSES } from './etat.js';

const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

// Accès à la mémoire du jeu, petit-boutiste.
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// --- Le temps -----------------------------------------------------------------------------------------
const PASSAGE = 0xD3AF8;           // mot long : compte les passages de 0x21681 ; les figures changent
                                   // un passage sur quatre
const PAS_DE_SIMULATION = ADRESSES.pasDeSimulation;   // 0xD3AFC, 1 000 pas par mois

// --- La carte ------------------------------------------------------------------------------------------
const GRILLE = 0xD3B08;            // pointeur : la grille, 64 × 64 cellules de 4 octets
const SOLS = 0xB44D9;              // fiches des sols, 4 octets : drapeaux en +0
const FORMES = 0xB44DC;            //   et forme en +3
const SOL_ALLEE = 0x02, SOL_ATTRACTION = 0x04, SOL_FILE = 0x08, SOL_SORTIE = 0x20, SOL_CIRCUIT = 0x40;
const SOL_ARRET_DU_BUS = 0x88;
const DIRECTIONS_DES_FILES = 0xB49D3;     // forme → masque des directions ouvertes
const DIRECTIONS_DES_CIRCUITS = 0xB49C1;  // de même pour les circuits

// --- Les directions ------------------------------------------------------------------------------------
const VOISINES = 0xB4920;
const PAS_X = 0xB4932, PAS_Y = 0xB4933;
const BIT_DU_RETOUR = 0xB491C;
const DIRECTIONS_OPPOSEES = 0xB48EC;
const DIRECTION_DU_MASQUE = 0xB4970;
const DIRECTION_DU_BIT = 0xB4B14;

// --- Les objets du parc ----------------------------------------------------------------------------------
const OBJETS = 0xD3B10;            // pointeur : la table des objets du parc, 200 octets chacun
const TAILLE_OBJET = 200;
const VISITEUR = 2, ATTRACTION = 4, KIOSQUE = 6, VEHICULE = 0xE;
const OBJETS_GRAPHIQUES = 0xD3B80; // pointeur : objets graphiques, 8 octets ; +6 l'image suivante
const FIGURES = 0xD3B38;           // pointeur : table de mots, numéro de figure → objet graphique
// Les allures : 0x24 octets par genre de visiteur, des numéros de figures. +0 la marche (quatre
// figures, une par direction) ; +2 et +0x1C, sur le circuit d'une attraction ; +4, dans la file.
const ALLURES = 0xB49F4, TAILLE_ALLURE = 0x24;
const ALLURE_CIRCUIT = 2, ALLURE_FILE = 4, ALLURE_CIRCUIT_BIS = 0x1C;
const FIGURE_A_PART = 0x544;       // décalage dans [0xD3B38] : la figure 0x2A2 (bit 2 de +5)

// --- Les fiches du joueur en cours (posées par 0x1A2CA, selon le joueur [0xD665C]) ----------------------
const FICHE_DU_PARC = 0xD3818;     // pointeur : 0xCF1E0 + joueur × 0x250. +0x18 octet, non nul :
                                   // le parc est ouvert ; +0x1F mot, les visiteurs présents ; +0x43
                                   // mot long, le contentement cumulé des visiteurs partis
const STATISTIQUES = 0xD3814;      // pointeur : 0xD443C + joueur × 0x6C2. +0x6B8 mot long, les
                                   // attractions faites par les visiteurs partis ; +0x6BC, leur nombre
const CATALOGUE_DES_ATTRACTIONS = 0xCCED0;   // fiches de 200 octets ; l'attraction en donne le
                                             // décalage dans son mot +16
const ECART_A_L_ARRET_DU_BUS = 0xB8B9C;      // mot : 0x80, une demi-case

// --- Les fonctions appelées ------------------------------------------------------------------------------
const PLACER = 0x18A44;            // (objet, x, y) : le pose en (x, y), change de liste s'il change de
                                   // case ; rend 1 s'il a changé de case, 0 sinon ou hors de la carte
const PLACER_SANS_BORNES = 0x18ADF;  // de même, sans contrôler les bornes
const OBJET_SUR_LA_CASE = 0x204B9; // (cellule, type) : le premier objet de ce type sur la case, ou 0
const HASARD = 0x18B92;            // le générateur du jeu : 0 à 0x7FFF
const DIVISION_PAR_ZERO = 0x19ED3; // vitesse nulle : rend 1, efface la demande de sortie
const CHOISIR_UNE_DESTINATION = 0x22834;   // pose +56, +57 ; ou l'état 0x40 et la sortie du parc
const QUITTER_LE_PARC = 0x28752;   // compte le départ du visiteur et efface son objet
const HUMEUR = 0x672A5;            // fait varier le contentement selon l'état
const VALEUR_ABSOLUE = 0x80BF2;
const INCIDENT = 0x66189;          // (3, visiteur, visiteur, 0x10) : non établi
// Les auxiliaires réécrits ici, appelés eux aussi par leur adresse.
const DESCENDRE_DE_L_ATTRACTION = 0x31F95;
const INCIDENT_SUR_LE_CIRCUIT = 0x65E3D;
const AJOUTER_AU_CONTENTEMENT = 0x28656;
const PRENDRE_LE_VECTEUR = 0x282E7;

// --- Outils ----------------------------------------------------------------------------------------------

// Le cadre de la routine d'origine, pour ce qu'en relit 0x223C1 : l'octet bas de [ebp-8] (voir « La
// pile » plus haut). À l'entrée, on retient l'octet qui s'y trouve ; la routine note l'octet bas de
// chaque valeur que l'original range dans [ebp-8] ; à la sortie, on y laisse le dernier. Quand
// l'original n'écrit pas [ebp-8], l'octet d'entrée est remis : les appels de la réécriture, qui ne se
// font pas à la même hauteur de pile, ont pu l'écraser (l'original, lui, appelle sous ses variables).
class Cadre {
  constructor(jeu) {
    this.jeu = jeu;
    this.adresse = (jeu.T.lireRegistre('esp') >>> 0) - 24;
    this.octet = jeu.m8[this.adresse];
  }

  noter(valeur) {
    this.octet = valeur & 0xFF;
  }

  fermer() {
    this.jeu.m8[this.adresse] = this.octet;
  }
}

// Une fonction du module, avec son cadre, reçu en dernier argument.
function avecLeCadre(routine) {
  return (jeu, ...args) => {
    const cadre = new Cadre(jeu);
    try {
      return routine(jeu, ...args, cadre);
    } finally {
      cadre.fermer();
    }
  };
}

function objet(jeu, numero) {
  return long(jeu, OBJETS) + numero * TAILLE_OBJET;
}

// Le numéro d'un objet, par une division signée comme dans le programme.
function numeroDObjet(jeu, o) {
  return ((o - long(jeu, OBJETS)) / TAILLE_OBJET) | 0;
}

// La cellule de la grille en (colonne, rangée), sans contrôle : colonne et rangée viennent d'octets.
function cellule(jeu, colonne, rangee) {
  return long(jeu, GRILLE) + (rangee * 64 + colonne) * 4;
}

function celluleDuVisiteur(jeu, v) {
  return cellule(jeu, octet(jeu, v + 7), octet(jeu, v + 9));
}

// La cellule voisine dans la direction d. Au bord de la carte, elle tombe hors de la grille, et le
// programme lit ce qui s'y trouve.
function voisine(jeu, c, d) {
  return c + motSigne(jeu, VOISINES + 2 * d) * 4;
}

function drapeauxDuSol(jeu, c) {
  return octet(jeu, SOLS + octet(jeu, c + 2) * 4);
}

// Les objets posés sur une case : le mot +0 de la cellule, puis le mot +2 de chacun. La liste
// s'arrête sur 0 ou sur un décor (numéro négatif) : le programme compare l'adresse obtenue au début
// de la table, sans signe.
function premierObjet(jeu, c) {
  return long(jeu, OBJETS) + motSigne(jeu, c) * TAILLE_OBJET;
}
function objetSuivant(jeu, o) {
  return long(jeu, OBJETS) + motSigne(jeu, o + 2) * TAILLE_OBJET;
}
function estUnObjet(jeu, o) {
  return o > long(jeu, OBJETS);
}

// L'animation : un passage sur quatre, l'image suivante de l'objet graphique affiché.
function animer(jeu, v) {
  if ((octet(jeu, PASSAGE) & 3) === 0) {
    poserMot(jeu, v + 0xA, mot(jeu, long(jeu, OBJETS_GRAPHIQUES) + mot(jeu, v + 0xA) * 8 + 6));
  }
}

// La position après un pas dans la direction du visiteur, sur 16 bits comme dans le programme. Un
// pas qui sort de la carte par le haut ou la gauche donne 0xFFxx, que 0x18A44 refuse.
function pasSuivant(jeu, v) {
  const d = octet(jeu, v + 0x12), vitesse = octet(jeu, v + 0x13);
  return [u16(mot(jeu, v + 6) + octetSigne(jeu, PAS_X + 2 * d) * vitesse),
          u16(mot(jeu, v + 8) + octetSigne(jeu, PAS_Y + 2 * d) * vitesse)];
}

// Combien de passages pour traverser une case : 0x100 / vitesse. Une vitesse nulle n'est pas
// divisée : le programme appelle alors 0x19ED3, qui rend 1.
function passagesParCase(jeu, v) {
  const vitesse = octet(jeu, v + 0x13);
  return vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : (0x100 / vitesse) | 0;
}

// La figure de la marche dans la direction du visiteur.
function figureDeMarche(jeu, v) {
  const base = mot(jeu, ALLURES + octet(jeu, v + 0x59) * TAILLE_ALLURE);
  return mot(jeu, long(jeu, FIGURES) + (base + octet(jeu, v + 0x12)) * 2);
}

// Une autre figure de son allure, la même quelle que soit la direction.
function figureDAllure(jeu, v, champ) {
  const numero = mot(jeu, ALLURES + champ + octet(jeu, v + 0x59) * TAILLE_ALLURE);
  return mot(jeu, long(jeu, FIGURES) + numero * 2);
}

function orienter(jeu, v, direction) {
  poserOctet(jeu, v + 0x12, direction);
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
}

// Plus de chemin : 0x22834 choisit une destination (ou renvoie le visiteur chez lui), et il repasse
// dans l'état 6, où il cherche son chemin.
function repartir(jeu, v) {
  jeu.appeler(CHOISIR_UNE_DESTINATION, v);
  poserOctet(jeu, v + 0xC, 6);
  poserMot(jeu, v + 0x14, 0);
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
  return 1;
}

// ==========================================================================================================
// 0x243DD — l'état 0x0A : le visiteur s'avance dans la file d'attente d'une attraction.
//
// Il y entre depuis l'allée (0x22E22). Au centre de chaque case, il choisit sa direction parmi celles
// qu'ouvre la forme de la file, sans revenir sur ses pas si possible ; puis il avance d'un pas. Il
// cesse de s'avancer, et passe dans l'état 0x0C où il fait la queue (0x24DFE), de deux façons :
//
//   - devant le kiosque d'entrée de l'attraction (objet de type 6 sur la case suivante) quand
//     personne ne fait la queue : l'attraction, ouverte (octet +4B à 1) dans un parc ouvert, le
//     désigne dans son mot +1E comme premier de la file ;
//   - sur une case où le dernier de la file fait la queue (état 0x0C, mot +1E nul) : il se range
//     derrière lui (voir seMettreDerriere).
//
// La file est donc une liste : l'attraction désigne le premier (+1E), chacun celui qui le suit (+1E) ;
// le mot +2A de l'attraction compte ceux qui l'ont rejointe. Hors de la file, ou devant une file sans
// issue et une allée à côté, le visiteur la quitte.
//
// Rend 1 quand il a changé d'état ou qu'il s'est rangé, 0 sinon (l'appelant n'en fait rien).
//
// Exercé par les scénarios (simulation, construction, démo) : la marche dans la file, les décisions au
// centre des cases, l'entrée par le kiosque, le demi-tour devant un kiosque dont la file est prise ou
// l'attraction fermée, la remontée à contre-sens, le rangement derrière le dernier (et son arrêt sur une
// impasse), la sortie d'une file sans issue vers une allée (état 8). Jamais exercés, et relus
// instruction par instruction : la sortie hors de la file (état 6, 0x22834), une rangée 0 ou 1, une
// vitesse nulle, le demi-tour d'une impasse sans allée, le demi-tour au bout d'une file sans kiosque, et
// dans le recul l'arrivée au centre d'une case par un côté que la file ne relie pas.
//
// Le cadre (voir Cadre) : l'original garde dans [ebp-8] le sol de la case, au centre d'une case, puis
// le nombre de voisines examinées dans une impasse.
export function avancerDansLaFile(jeu, v, cadre) {
  // Tout près du bord haut de la carte, le visiteur quitte le parc : 0x28752 efface son objet, que la
  // suite traite pourtant encore. Anomalie reproduite ; jamais vu (les files sont loin du bord).
  if (octet(jeu, v + 9) <= 1) jeu.appeler(QUITTER_LE_PARC, v);

  if (octet(jeu, v + 6) === 0x80 && octet(jeu, v + 8) === 0x80) {
    if (octet(jeu, v + 5) & 2) {
      // La décision de cette case a déjà été prise (par 0x22E22, à l'entrée dans la file).
      poserOctet(jeu, v + 5, octet(jeu, v + 5) & ~2);
    } else {
      const fini = deciderAuCentre(jeu, v, cadre);
      if (fini) return 1;
    }
  }
  return avancerDUnPas(jeu, v);
}

// La décision au centre d'une case (0x2441D à 0x247D4). Rend vrai si le visiteur a changé d'état ;
// sinon sa nouvelle direction est posée, et il va avancer.
function deciderAuCentre(jeu, v, cadre) {
  const c = celluleDuVisiteur(jeu, v);
  const sol = octet(jeu, c + 2);
  cadre.noter(sol);
  if (!(octet(jeu, SOLS + sol * 4) & SOL_FILE)) return repartir(jeu, v) === 1;

  const ouvertes = octet(jeu, DIRECTIONS_DES_FILES + octet(jeu, FORMES + sol * 4));
  const devant = ouvertes & ~octet(jeu, BIT_DU_RETOUR + octet(jeu, v + 0x12));   // sans le retour
  let kiosque;

  if (devant === ouvertes) {
    // Le retour n'était pas ouvert : le visiteur est arrivé sur la case par un côté que la file ne
    // relie pas (depuis l'allée, en y entrant). Le kiosque est-il sur la case que désigne `devant` ?
    // `devant` peut avoir ici deux bits : la table 0xB4B14, faite pour un seul, donne alors l'une des
    // deux directions (masques 3, 5, 6, 0xC), ou 4 et 8 pour 9 et 0xA, qui lisent au-delà des quatre
    // voisines de 0xB4920 : l'entrée 4 vaut 0, et le kiosque est cherché sur la case même ; l'entrée 8
    // vaut −1, la case de gauche, qui se trouve être l'une des deux. Anomalie reproduite.
    kiosque = jeu.appeler(OBJET_SUR_LA_CASE, voisine(jeu, c, octetSigne(jeu, DIRECTION_DU_BIT + devant)), KIOSQUE);
    if (kiosque === 0) {
      // Tout droit si c'est ouvert, sinon au hasard parmi les directions ouvertes.
      const toutDroit = 1 << octet(jeu, v + 0x12);
      let choix;
      if (toutDroit & devant) {
        choix = u16(toutDroit);
      } else {
        choix = u16(devant & jeu.appeler(HASARD));
        if (choix === 0) choix = devant;
      }
      orienter(jeu, v, octet(jeu, DIRECTION_DU_MASQUE + choix));
      return false;
    }
  } else if (devant === 0) {
    // Une impasse : seul le retour est ouvert. Une allée à côté ? Il quitte la file, en commençant
    // par regarder devant lui, puis en tournant.
    let k = 0, d = octet(jeu, v + 0x12);
    for (; k < 4; k++, d = (d + 1) & 3) {
      if (drapeauxDuSol(jeu, voisine(jeu, c, d)) & SOL_ALLEE) {
        if (octet(jeu, v + 0x4C) === 0) {
          cadre.noter(k);
          poserOctet(jeu, v + 0x5A, 0);
          poserOctet(jeu, v + 0xC, 8);
          poserMot(jeu, v + 0x14, passagesParCase(jeu, v));
          orienter(jeu, v, d);
          return true;
        }
        poserOctet(jeu, v + 0x4C, 0);
        break;
      }
    }
    cadre.noter(k);
    orienter(jeu, v, octet(jeu, DIRECTION_DU_MASQUE + ouvertes));   // demi-tour
    return false;
  } else {
    // Le retour et une autre direction : une file étant une ligne, `devant` n'a qu'un bit, la suite
    // de la file, dont 0xB4B14 donne la direction. Si la case suivante est encore de la file, il y va.
    const suivante = voisine(jeu, c, octetSigne(jeu, DIRECTION_DU_BIT + devant));
    if (drapeauxDuSol(jeu, suivante) & SOL_FILE) {
      orienter(jeu, v, octet(jeu, DIRECTION_DU_MASQUE + devant));
      return false;
    }
    kiosque = jeu.appeler(OBJET_SUR_LA_CASE, suivante, KIOSQUE);
    if (kiosque === 0) {
      orienter(jeu, v, octet(jeu, DIRECTION_DU_MASQUE + (ouvertes & ~devant)));   // demi-tour
      return false;
    }
  }

  // Un kiosque sur la case suivante : premier de la file, si elle est vide et l'attraction ouverte.
  // Il se tourne vers le kiosque par l'octet brut de 0xB4B14 (4 ou 8, directions hors d'usage, pour
  // les masques 9 et 0xA : anomalie reproduite).
  const attraction = objet(jeu, mot(jeu, kiosque + 0x16));
  if (mot(jeu, attraction + 0x1E) === 0 && octet(jeu, attraction + 0x4B) === 1
      && octet(jeu, long(jeu, FICHE_DU_PARC) + 0x18) !== 0) {
    poserMot(jeu, attraction + 0x1E, numeroDObjet(jeu, v));
    poserMot(jeu, v + 0x16, numeroDObjet(jeu, attraction));
    poserLong(jeu, v + 0x20, long(jeu, PAS_DE_SIMULATION));
    poserOctet(jeu, v + 0x12, octet(jeu, DIRECTION_DU_BIT + devant));
    poserMot(jeu, v + 0xA, figureDAllure(jeu, v, ALLURE_FILE));
    poserOctet(jeu, v + 0x4C, 0);
    poserMot(jeu, v + 0x1E, 0);
    poserOctet(jeu, v + 0xC, 0xC);
    poserMot(jeu, attraction + 0x2A, mot(jeu, attraction + 0x2A) + 1);
    return true;
  }
  // Sinon, demi-tour : la seule direction qui manquait à `devant`, le retour.
  orienter(jeu, v, octet(jeu, DIRECTION_DU_MASQUE + (ouvertes & ~devant)));
  return false;
}

// Le pas (0x24835 à 0x24D43). Rend la valeur de 0x243DD.
function avancerDUnPas(jeu, v) {
  animer(jeu, v);
  const [x, y] = pasSuivant(jeu, v);
  const aChangeDeCase = u16(jeu.appeler(PLACER, v, x, y)) !== 0;
  // La case où mène le pas, même s'il a été refusé.
  const c = cellule(jeu, x >> 8, y >> 8);
  if (!(drapeauxDuSol(jeu, c) & SOL_FILE) && aChangeDeCase) return repartir(jeu, v);

  // Ceux qui font la queue sur cette case. Le dernier (personne derrière lui) : le visiteur se range
  // derrière. Sinon il retient la direction de l'un d'eux, celui dont la somme des fractions de
  // position est la plus petite (pourquoi celui-là, non établi).
  let sens = -1, distance = 1000;
  for (let o = premierObjet(jeu, c); estUnObjet(jeu, o); o = objetSuivant(jeu, o)) {
    if (octet(jeu, o + 4) !== VISITEUR || octet(jeu, o + 0xC) !== 0xC) continue;
    if (mot(jeu, o + 0x1E) === 0) return seMettreDerriere(jeu, v, o, c);
    const somme = octet(jeu, o + 6) + octet(jeu, o + 8);
    if (sens === -1 || somme < distance) {
      sens = octet(jeu, o + 0x12);
      distance = somme;
    }
  }
  if (sens === -1) return 0;

  // Il est entré dans la file au milieu : ceux qui attendent regardent vers l'attraction, il
  // remonte vers le dernier, à contre-sens. Si la direction de la file n'est pas ouverte ici, il
  // prend son opposée ; sinon toutes les autres ouvertes, s'il en reste.
  const ouvertes = octet(jeu, DIRECTIONS_DES_FILES + octet(jeu, FORMES + octet(jeu, c + 2) * 4));
  const versLAttraction = 1 << sens;
  let choix;
  if (!(ouvertes & versLAttraction)) {
    choix = 1 << octet(jeu, DIRECTIONS_OPPOSEES + sens * 2);
    // Jamais pour une direction de 0 à 3, dont les opposées valent 0 à 3.
    if (u16(choix) === 0) choix = 1 << octet(jeu, v + 0x12);
  } else {
    choix = ouvertes;
    if (ouvertes & ~versLAttraction) choix = ouvertes & ~(1 << (sens & 0xFF));
  }
  orienter(jeu, v, octet(jeu, DIRECTION_DU_MASQUE + u16(choix)));
  // Recentré sur l'axe qu'il ne parcourt pas.
  const d = octet(jeu, v + 0x12);
  if (d === 1 || d === 3) poserOctet(jeu, v + 8, 0x80);
  else poserOctet(jeu, v + 6, 0x80);
  return 0;
}

// Se ranger derrière le dernier de la file (0x24980 à 0x24BA6) : il se pose sur lui, se tourne à
// contre-sens et recule de 0x60 (trois huitièmes de case), en suivant la file au centre des cases ;
// puis il se retourne vers l'attraction et fait la queue, derrière lui.
//
// Anomalie reproduite : pendant ce recul, la forme de la file est toujours lue sur la case de départ,
// même si le visiteur en change ; et s'il n'y trouve que le retour, il s'arrête là, déjà désigné par
// le dernier mais encore dans l'état 0x0A, et la fonction rend 0. Cela arrive dans la simulation.
function seMettreDerriere(jeu, v, dernier, c) {
  poserMot(jeu, dernier + 0x1E, numeroDObjet(jeu, v));
  jeu.appeler(PLACER, v, mot(jeu, dernier + 6), mot(jeu, dernier + 8));
  poserOctet(jeu, v + 0x12, octet(jeu, DIRECTIONS_OPPOSEES + octet(jeu, dernier + 0x12) * 2));

  for (let reste = 0x60; s16(reste) > 0; reste = u16(reste - octet(jeu, v + 0x13))) {
    if (octet(jeu, v + 6) === 0x80 && octet(jeu, v + 8) === 0x80) {
      const ouvertes = octet(jeu, DIRECTIONS_DES_FILES + octet(jeu, FORMES + octet(jeu, c + 2) * 4));
      let devant = ouvertes & ~octet(jeu, BIT_DU_RETOUR + octet(jeu, v + 0x12));
      if (devant === ouvertes) {
        const toutDroit = 1 << octet(jeu, v + 0x12);
        if (toutDroit & devant) devant = toutDroit;
      } else if (devant === 0) {
        return 0;
      }
      poserOctet(jeu, v + 0x12, octet(jeu, DIRECTION_DU_MASQUE + u16(devant)));
    }
    const [x, y] = pasSuivant(jeu, v);
    jeu.appeler(PLACER, v, x, y);
  }

  poserMot(jeu, v + 0x16, mot(jeu, dernier + 0x16));
  poserLong(jeu, v + 0x20, long(jeu, PAS_DE_SIMULATION));
  poserOctet(jeu, v + 0x4C, 0);
  poserMot(jeu, v + 0x1E, 0);
  poserOctet(jeu, v + 0xC, 0xC);
  poserOctet(jeu, v + 0x12, octet(jeu, DIRECTIONS_OPPOSEES + octet(jeu, v + 0x12) * 2));
  poserMot(jeu, v + 0xA, figureDAllure(jeu, v, ALLURE_FILE));
  const attraction = objet(jeu, mot(jeu, dernier + 0x16));
  poserMot(jeu, attraction + 0x2A, mot(jeu, attraction + 0x2A) + 1);
  return 1;
}

// ==========================================================================================================
// 0x254D2 — l'état 0x12 : le visiteur suit le circuit d'une attraction où l'on se déplace soi-même.
//
// Dans la simulation, c'est le RUBBER TUBING : le visiteur descend le canal (sols à drapeau 0x40) à la
// vitesse que l'attraction lui a donnée, sa vitesse de marche mise de côté dans +58. Au centre de
// chaque case, il choisit au hasard parmi les directions ouvertes du circuit, sans revenir en arrière
// si possible, et gagne en contentement (vitesse / 16 + 4, par 0x28656). Il rattrape celui qui le
// précède plus lentement sur la même case, et prend alors sa vitesse.
//
// Il descend (0x31F95, puis sa vitesse de marche reprend) quand une case voisine, hors de celle d'où il
// vient, est du sol d'une attraction et porte une attraction dans l'état 4 (dans la simulation, le
// RUBBER TUBING lui-même, au bout du canal), ou quand il sort du circuit : il descend alors de son
// attraction à lui (+16).
//
// Rend 1 s'il est descendu, 0 sinon. Exercé par la simulation et la construction : le canal, la
// descente par une attraction voisine. Jamais exercés, et relus instruction par instruction : la
// sortie du circuit, un incident (0x65E3D rend toujours 0), une impasse du circuit, l'autre figure
// (+5F = 2), le rattrapage — il n'est tenté qu'au centre d'une case où le visiteur vient d'entrer, ce
// qui demande qu'un pas le mène d'une case à l'autre et jusqu'au centre, soit une vitesse de 0x80 et
// plus. Le cadre : l'original garde dans [ebp-8] la direction choisie, en masque.
export function suivreLeCircuit(jeu, v, cadre) {
  animer(jeu, v);
  const [x, y] = pasSuivant(jeu, v);
  const aChangeDeCase = u16(jeu.appeler(PLACER, v, x, y)) !== 0;
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (motSigne(jeu, v + 0x14) > 0) return 0;

  // Au centre d'une case.
  if ((jeu.appeler(INCIDENT_SUR_LE_CIRCUIT, v, 3) & 0xFF) !== 0) return 0;
  poserMot(jeu, v + 0x14, passagesParCase(jeu, v));
  const c = cellule(jeu, x >> 8, y >> 8);

  // Le programme relit la direction opposée à chaque tour ; rien de ce qu'appelle la boucle ne
  // change la direction.
  const retour = motSigne(jeu, DIRECTIONS_OPPOSEES + octet(jeu, v + 0x12) * 2);
  for (let d = 0; d < 4; d++) {
    if (d === retour) continue;
    const vois = voisine(jeu, c, d);
    if (!(drapeauxDuSol(jeu, vois) & SOL_ATTRACTION)) continue;
    const attraction = jeu.appeler(OBJET_SUR_LA_CASE, vois, ATTRACTION);
    if (attraction !== 0 && octet(jeu, attraction + 0xC) === 4) return descendre(jeu, v, attraction);
  }

  const sol = octet(jeu, c + 2);
  if (!(octet(jeu, SOLS + sol * 4) & SOL_CIRCUIT)) return descendre(jeu, v, objet(jeu, mot(jeu, v + 0x16)));

  const ouvertes = octet(jeu, DIRECTIONS_DES_CIRCUITS + octet(jeu, FORMES + sol * 4));
  const devant = ouvertes & ~octet(jeu, BIT_DU_RETOUR + octet(jeu, v + 0x12));
  let choix;
  if (devant === 0) {
    choix = ouvertes;
  } else {
    choix = devant & jeu.appeler(HASARD);
    if (u16(choix) === 0) choix = devant;
  }
  cadre.noter(choix);
  poserOctet(jeu, v + 0x12, octet(jeu, DIRECTION_DU_MASQUE + u16(choix)));
  poserMot(jeu, v + 0xA, figureDAllure(jeu, v, mot(jeu, v + 0x5F) === 2 ? ALLURE_CIRCUIT_BIS : ALLURE_CIRCUIT));

  if (aChangeDeCase) {
    for (let o = premierObjet(jeu, c); estUnObjet(jeu, o); o = objetSuivant(jeu, o)) {
      if (octet(jeu, o + 4) === VISITEUR && o !== v && octet(jeu, o + 0xC) === 0x12
          && octet(jeu, o + 0x13) < octet(jeu, v + 0x13)) {
        poserOctet(jeu, v + 0x13, octet(jeu, o + 0x13));
        poserMot(jeu, v + 0x14, passagesParCase(jeu, v));
        break;
      }
    }
  }
  jeu.appeler(AJOUTER_AU_CONTENTEMENT, v, (octet(jeu, v + 0x13) >> 4) + 4);
  return 0;
}

function descendre(jeu, v, attraction) {
  jeu.appeler(DESCENDRE_DE_L_ATTRACTION, v, attraction);
  poserOctet(jeu, v + 0x13, octet(jeu, v + 0x58));       // sa vitesse de marche
  poserMot(jeu, v + 0x14, passagesParCase(jeu, v));
  return 1;
}

// ==========================================================================================================
// 0x31F95 — le visiteur descend d'une attraction : il passe dans l'état 0x10 et il est posé au milieu
// de la case de sortie.
//
// Appelée par 0x254D2 et par six routines des attractions (0x2FB85, 0x3006A, 0x30803, 0x258D9,
// 0x31668, 0x41F3D), qui y déchargent leurs passagers. La case de sortie est le mot +73 de
// l'attraction (colonne + 64 × rangée) ; à défaut, la case de l'objet que désigne son mot +49 (le
// kiosque ?), et le décompte +14 est alors nul. La direction de sortie : celle de cet objet +49 quand
// l'attraction est dans l'état 4, 6 ou 0x1C ; sinon, si la case de sortie est une sortie (drapeau 0x20),
// la direction que donne sa forme ; sinon celle qu'il avait.
//
// Sauf dans les états 4 et 0x1C, l'attraction le retire de sa liste de passagers, dont il était le
// premier (mot +47, chaîné par le +47 de chacun), et en décompte un (mot +30).
//
// Exercé par la simulation et la construction, sauf une attraction sans case de sortie (+73 nul), relu
// instruction par instruction. Le cadre : l'original range dans [ebp-8] l'abscisse de la sortie, dont
// l'octet bas vaut toujours 0x80.
export function descendreDeLAttraction(jeu, v, attraction, cadre) {
  cadre.noter(0x80);
  poserOctet(jeu, v + 0xC, 0x10);
  poserMot(jeu, v + 0x14, passagesParCase(jeu, v));
  let colonne, rangee;
  const sortie = mot(jeu, attraction + 0x73);
  if (sortie !== 0) {
    colonne = sortie % 64;
    rangee = (sortie >> 6) & 0xFF;
  } else {
    const o = objet(jeu, mot(jeu, attraction + 0x49));
    colonne = octet(jeu, o + 7);
    rangee = octet(jeu, o + 9);
    poserMot(jeu, v + 0x14, 0);
  }

  const etat = octet(jeu, attraction + 0xC);
  if (etat === 6 || etat === 4 || etat === 0x1C) {
    poserOctet(jeu, v + 0x12, octet(jeu, objet(jeu, mot(jeu, attraction + 0x49)) + 0x12));
  } else {
    const sol = octet(jeu, cellule(jeu, colonne, rangee) + 2);
    if (octet(jeu, SOLS + sol * 4) & SOL_SORTIE) poserOctet(jeu, v + 0x12, octet(jeu, FORMES + sol * 4));
  }
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
  jeu.appeler(PLACER, v, (colonne << 8) | 0x80, (rangee << 8) | 0x80);

  if (octet(jeu, attraction + 0xC) !== 4 && octet(jeu, attraction + 0xC) !== 0x1C) {
    poserMot(jeu, attraction + 0x47, mot(jeu, v + 0x47));
    poserMot(jeu, attraction + 0x30, mot(jeu, attraction + 0x30) - 1);
  }
}

// ==========================================================================================================
// 0x65E3D — un incident sur le circuit, au hasard. `cas` : 3 pour 0x254D2 (état 0x12), 4 pour 0x258D9
// (état 0x36).
//
// Seulement si le visiteur est lié à une attraction (+16) dont le mot +2E atteint 0x48 (l'usure ? non
// établi : § 6.3 le soupçonne déjà), et avec une chance sur 0x100 − 20 × (6 − octet +13 de
// l'attraction). Alors, au pile ou face du même tirage :
//   - cas 3, pile : 0x66189(3, visiteur, visiteur, 0x10) (non établi), puis comme les autres cas ;
//   - cas 3, face : il bascule +5F entre 0 et 2 (une autre figure sur le circuit), et rien d'autre ;
//   - cas 4 : +5F passe à 2, et sa direction est mise de côté dans +C5 ; rien d'autre ;
//   - autres cas : l'attraction décompte un passager (+30), et la fonction rend 1 — le visiteur
//     s'arrête là pour ce passage.
// Le tirage n'a lieu que si le visiteur est lié à une attraction.
//
// Seul l'octet bas d'eax est significatif : le reste du registre garde, dans le programme, l'adresse
// de l'attraction ou du visiteur, que les deux appelants ignorent (`test al, al`). Rien n'est donc
// comparé du résultat. Dans les scénarios, l'attraction n'atteint jamais le seuil : seule la voie qui
// rend 0 après le tirage est exercée ; le reste est relu instruction par instruction. Le cadre :
// l'original range le tirage dans [ebp-8], puis son pile ou face.
export function incidentSurLeCircuit(jeu, v, cas, cadre) {
  const attraction = objet(jeu, mot(jeu, v + 0x16));
  if (!estUnObjet(jeu, attraction)) return 0;
  const tirage = jeu.appeler(HASARD);
  cadre.noter(tirage);
  if (mot(jeu, attraction + 0x2E) < 0x48) return 0;
  const chances = 0x100 - (6 - octet(jeu, attraction + 0x13)) * 0x14;   // de 136 à 5 236 : jamais nul
  if (u16(tirage) % chances !== 0) return 0;

  const face = tirage & 1;
  cadre.noter(face);
  switch (u16(cas)) {
    case 3:
      if (face === 0) {
        jeu.appeler(INCIDENT, 3, v, v, 0x10);
        break;
      }
      poserMot(jeu, v + 0x5F, mot(jeu, v + 0x5F) === 0 ? 2 : 0);
      return 0;
    case 4:
      if (mot(jeu, v + 0x5F) !== 2) {
        poserOctet(jeu, v + 0xC5, octet(jeu, v + 0x12));
        poserMot(jeu, v + 0x5F, 2);
      }
      return 0;
    default:
      break;
  }
  poserMot(jeu, attraction + 0x30, mot(jeu, attraction + 0x30) - 1);
  return 1;
}

// ==========================================================================================================
// 0x28656 — ajouter au contentement du visiteur (mot +54), sur 16 bits. Appelée par 0x254D2 et 0x258D9.
export function ajouterAuContentement(jeu, v, n) {
  poserMot(jeu, v + 0x54, mot(jeu, v + 0x54) + n);
}

// ==========================================================================================================
// 0x24F82 — l'état 0x10 : le visiteur quitte une attraction par sa sortie.
//
// Posé à la sortie par 0x31F95, il marche tout droit pendant son décompte (+14), puis (0x672A5) son
// contentement varie selon l'attraction, et l'on note la sortie : le pas de simulation dans +75, une
// attraction de plus dans +81. Si une case voisine est une allée, il s'y tourne et la rejoint (état 8),
// au milieu de sa case ; sinon il repart chercher son chemin (état 6).
//
// En rejoignant l'allée, il sort malade si l'une de ses deux jauges +50, +51 dépasse le seuil que
// supporte l'attraction : 16, ajusté selon sa catégorie (octet +B3 de sa fiche au catalogue 0xCCED0),
// moins un seizième de son octet +A9 (l'intensité ? non établi) et moins son mot +B8, et au moins 4.
// Malade : bit 2 de +63, un nombre de 1 à 8 au hasard dans +C7, et le contentement varie de nouveau.
//
// Rend toujours 1. Exercé par la simulation et la construction, sauf le départ vers l'état 6, relu
// instruction par instruction.
const AJUSTEMENT_DES_SEUILS = {   // catégorie → [seuil de +50, seuil de +51]
  0: [-4, -2],   // PLANE FLYER, HAUNTED HOUSE, MERRY-GO-ROUND, SNAKES AND LADDERS, PARASOL CHAIRS
  1: [-1, -1],   // BIG WHEEL
  3: [-1, -1],   // RUBBER TUBING, RACE CAR RIDE
  4: [-2, -1],   // ROLLER COASTER, LOOP THE LOOP, CORK SCREW, BIG DIPPER, WATER SPLASH, MONORAIL
  7: [1, 2],     // les spectacles : COWBOY, CLOWN, DOLPHIN, MEDIEVAL ACTS
  8: [2, 4],     // MAZE
  9: [-1, -6],   // BOUNCY CASTLE
  // 2 (aucune), 5 (FLIGHT SIM, TREE HOUSE, PIRATE BOAT, GHOST HOUSE, SPACE SHUTTLE), 6 (OBSERVATION
  // TOWER, SUPER SPINNER, OBSERVATORY, PLANET ROCKET) et au-delà de 9 : pas d'ajustement.
};

// Le cadre : l'original garde dans [ebp-8] la position verticale après le pas, quand il y en a un.
export function quitterLaSortie(jeu, v, cadre) {
  if (motSigne(jeu, v + 0x14) > 0) {
    animer(jeu, v);
    const [x, y] = pasSuivant(jeu, v);
    cadre.noter(y);
    jeu.appeler(PLACER, v, x, y);
  }
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (motSigne(jeu, v + 0x14) > 0) return 1;

  jeu.appeler(HUMEUR, v);
  poserLong(jeu, v + 0x75, long(jeu, PAS_DE_SIMULATION));
  poserOctet(jeu, v + 0x81, octet(jeu, v + 0x81) + 1);

  const c = celluleDuVisiteur(jeu, v);
  for (let d = 0; d < 4; d++) {
    if (!(drapeauxDuSol(jeu, voisine(jeu, c, d)) & SOL_ALLEE)) continue;
    const attraction = objet(jeu, mot(jeu, v + 0x16));
    const fiche = CATALOGUE_DES_ATTRACTIONS + mot(jeu, attraction + 0x16);
    poserMot(jeu, v + 0x14, passagesParCase(jeu, v));
    poserOctet(jeu, v + 0x12, d);

    const [ajustementA, ajustementB] = AJUSTEMENT_DES_SEUILS[octet(jeu, fiche + 0xB3)] || [0, 0];
    const retrait = (octet(jeu, fiche + 0xA9) >> 4) + mot(jeu, fiche + 0xB8);
    const seuilA = Math.max(0x10 + ajustementA - retrait, 4);
    const seuilB = Math.max(0x10 + ajustementB - retrait, 4);
    if (octetSigne(jeu, v + 0x50) > seuilA || octetSigne(jeu, v + 0x51) > seuilB) {
      poserOctet(jeu, v + 0x63, octet(jeu, v + 0x63) | 4);
      poserOctet(jeu, v + 0xC7, (u16(jeu.appeler(HASARD)) % 8) + 1);
      jeu.appeler(HUMEUR, v);
    }

    poserOctet(jeu, v + 0xC, 8);
    poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
    poserMot(jeu, v + 0x14, 0);
    poserOctet(jeu, v + 6, 0x80);
    poserOctet(jeu, v + 8, 0x80);
    return 1;
  }
  return repartir(jeu, v);
}

// ==========================================================================================================
// 0x2641F — l'état 0x18 : le visiteur revient de la boutique vers la case de l'allée qu'il avait
// quittée (+56, +57, notées par 0x22E22 quand il s'est dirigé vers la boutique).
//
// Il avance tant que dure son décompte (+14), puis, au terme de chaque tronçon, se tourne vers le but
// sur l'axe où l'écart est le plus grand (vertical à égalité), pour (0x180 − fraction verticale) /
// vitesse passages. Arrivé sur la case : 0x22834 lui choisit une destination, il reprend la direction
// qu'il suivait sur l'allée (+58) sauf si c'est un demi-tour, et retourne se promener (état 8, bit 1
// de +5) si la case est une allée, chercher son chemin sinon (état 6).
//
// Rend 1 à l'arrivée, 0 sinon. Exercé par les scénarios, mais seulement vers le bas (direction 2) :
// jamais exercés, et relus instruction par instruction, les virages sur l'horizontale ou vers le haut,
// l'arrivée ailleurs que sur une allée, une vitesse nulle, la figure à part (bit 2 de +5). Le cadre :
// l'original garde dans [ebp-8] la position verticale après le pas, quand il y en a un.
export function revenirDeLaBoutique(jeu, v, cadre) {
  animer(jeu, v);
  if (mot(jeu, v + 0x14) !== 0) {
    const [x, y] = pasSuivant(jeu, v);
    cadre.noter(y);
    jeu.appeler(PLACER, v, x, y);
    poserOctet(jeu, v + 5, octet(jeu, v + 5) & ~1);
    poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
    if (motSigne(jeu, v + 0x14) > 0) return 0;
  }

  const vitesse = octet(jeu, v + 0x13);
  poserMot(jeu, v + 0x14, vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO))
    : ((0x100 - octet(jeu, v + 8) + 0x80) / vitesse) | 0);
  const c = celluleDuVisiteur(jeu, v);
  const ecartX = octet(jeu, v + 0x56) - octet(jeu, v + 7);
  const ecartY = octet(jeu, v + 0x57) - octet(jeu, v + 9);
  if ((jeu.appeler(VALEUR_ABSOLUE, ecartX) | 0) > (jeu.appeler(VALEUR_ABSOLUE, ecartY) | 0)) {
    poserOctet(jeu, v + 0x12, ecartX > 0 ? 1 : 3);
  } else if (ecartY !== 0) {
    poserOctet(jeu, v + 0x12, ecartY > 0 ? 2 : 0);
  } else {
    jeu.appeler(CHOISIR_UNE_DESTINATION, v);
    if (octet(jeu, v + 0x58) !== mot(jeu, DIRECTIONS_OPPOSEES + octet(jeu, v + 0x12) * 2)) {
      poserOctet(jeu, v + 0x12, octet(jeu, v + 0x58));
    }
    if (drapeauxDuSol(jeu, c) & SOL_ALLEE) {
      poserOctet(jeu, v + 0xC, 8);
      poserOctet(jeu, v + 5, octet(jeu, v + 5) | 2);
    } else {
      poserOctet(jeu, v + 0xC, 6);
    }
    poserMot(jeu, v + 0x14, 0);
    poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
    return 1;
  }
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
  if (octet(jeu, v + 5) & 4) poserMot(jeu, v + 0xA, mot(jeu, long(jeu, FIGURES) + FIGURE_A_PART));
  return 0;
}

// ==========================================================================================================
// 0x2223B — l'état 2 : le visiteur descendu du bus gagne l'allée.
//
// Il marche dans sa direction, sur les sols de l'arrêt (136, 237 dans la simulation), et au terme de
// son décompte regarde les quatre cases voisines : la première qui est une allée, il s'y tourne
// (0x282E7, avec le vecteur d'un pas dans cette direction) et se met à se promener (état 8).
//
// Anomalie reproduite : le décompte est comparé à zéro, et non « à zéro ou moins » comme ailleurs ; une
// fois dépassé sans allée en vue, il ne revient à zéro qu'après 65 536 passages.
//
// Rend 1 quand il rejoint l'allée, 0 sinon. Exercé par les scénarios, où la première voisine examinée
// (la case du dessus) est toujours une allée : les autres directions, et l'absence d'allée, sont relues
// instruction par instruction. Le cadre : l'original garde dans [ebp-8] la position verticale après le
// pas.
export function gagnerLAllee(jeu, v, cadre) {
  const [x, y] = pasSuivant(jeu, v);
  cadre.noter(y);
  jeu.appeler(PLACER, v, x, y);
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (mot(jeu, v + 0x14) !== 0) return 0;

  const c = celluleDuVisiteur(jeu, v);
  for (let d = 0; d < 4; d++) {
    if (!(drapeauxDuSol(jeu, voisine(jeu, c, d)) & SOL_ALLEE)) continue;
    poserOctet(jeu, v + 0xC, 8);
    poserMot(jeu, v + 0x14, passagesParCase(jeu, v));
    const vitesse = octet(jeu, v + 0x13);
    const vy = s16(octetSigne(jeu, PAS_Y + 2 * d) * vitesse);
    const vx = s16(octetSigne(jeu, PAS_X + 2 * d) * vitesse);
    jeu.appeler(PRENDRE_LE_VECTEUR, v, vx, vy);
    return 1;
  }
  return 0;
}

// ==========================================================================================================
// 0x282E7 — prendre le vecteur de déplacement (vx, vy) : il est rangé dans +E et +10, sur un seul axe
// (l'horizontal l'emporte), et le visiteur se tourne dans son sens, avec la figure de marche.
// Un vecteur nul ne change que la figure. Exercé par les scénarios pour un vecteur vers le haut
// seulement ; le reste est relu instruction par instruction. Le cadre : l'original range dans [ebp-8]
// la direction d'un vecteur vertical.
export function prendreLeVecteur(jeu, v, vx, vy, cadre) {
  poserMot(jeu, v + 0xE, vx);
  if (mot(jeu, v + 0xE) !== 0) {
    poserOctet(jeu, v + 0x12, s16(vx) > 0 ? 1 : 3);
    poserMot(jeu, v + 0x10, 0);
  } else {
    poserMot(jeu, v + 0x10, vy);
    if (mot(jeu, v + 0x10) !== 0) {
      const direction = s16(vy) > 0 ? 2 : 0;
      cadre.noter(direction);
      poserOctet(jeu, v + 0x12, direction);
      poserMot(jeu, v + 0xE, 0);
    }
  }
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
}

// ==========================================================================================================
// 0x2698E — l'état 0x22 : le visiteur attend le bus du départ.
//
// Rangé dans la file de l'arrêt (0x26BDE, écart 0x80), il regarde la case devant lui. Si c'est l'arrêt
// (sol 0x88) et qu'un bus y est à quai (véhicule dans l'état 0x16 ou 0x18 sur une case voisine), il
// monte : son départ est compté s'il ne l'a pas déjà été (comme dans 0x28752 : un présent de moins, son
// contentement versé au bilan du parc, ses attractions aux statistiques), il devient le premier
// passager du bus (mot +45, chaîné par le +45 de chacun), passe dans l'état 0x1C et se pose sur le bus.
// Sans bus, il attend. Si un autre visiteur attend devant lui, il attend aussi. Sinon, ou s'il n'est
// pas rangé dans la file, il repart vers l'arrêt (état 0x1E, 0x266D7).
//
// Rend 1 quand il change d'état, 0 sinon. Toutes les voies sont exercées par la simulation. Le cadre :
// l'original garde son résultat dans [ebp-8].
export function attendreLeBus(jeu, v, cadre) {
  const resultat = attendre(jeu, v);
  cadre.noter(resultat);
  return resultat;
}

function attendre(jeu, v) {
  animer(jeu, v);
  const devant = voisine(jeu, celluleDuVisiteur(jeu, v), octet(jeu, v + 0x12));
  if (mot(jeu, v + 0x28) === mot(jeu, ECART_A_L_ARRET_DU_BUS)) {
    if (octet(jeu, devant + 2) === SOL_ARRET_DU_BUS) {
      for (let d = 0; d < 4; d++) {
        const bus = jeu.appeler(OBJET_SUR_LA_CASE, voisine(jeu, devant, d), VEHICULE);
        if (bus === 0) continue;
        const etat = octet(jeu, bus + 0xC);
        if (etat === 0x18 || etat === 0x16) return monterDansLeBus(jeu, v, bus);
      }
      return 0;
    }
    for (let o = premierObjet(jeu, devant); estUnObjet(jeu, o); o = objetSuivant(jeu, o)) {
      if (octet(jeu, o + 4) === VISITEUR && octet(jeu, o + 0xC) === 0x22) return 0;
    }
  }
  poserOctet(jeu, v + 0xC, 0x1E);
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
  poserMot(jeu, v + 0x14, 0);
  return 1;
}

function monterDansLeBus(jeu, v, bus) {
  if (octetSigne(jeu, v + 0x4F) !== -1) {
    const parc = long(jeu, FICHE_DU_PARC);
    if (mot(jeu, parc + 0x1F) !== 0) poserMot(jeu, parc + 0x1F, mot(jeu, parc + 0x1F) - 1);
    poserLong(jeu, parc + 0x43, long(jeu, parc + 0x43) + motSigne(jeu, v + 0x54));
    const statistiques = long(jeu, STATISTIQUES);
    poserLong(jeu, statistiques + 0x6B8, long(jeu, statistiques + 0x6B8) + octet(jeu, v + 0x81));
    poserLong(jeu, statistiques + 0x6BC, long(jeu, statistiques + 0x6BC) + 1);
    poserOctet(jeu, v + 0x4F, 0xFF);
  }
  poserMot(jeu, v + 0x45, mot(jeu, bus + 0x45));
  poserMot(jeu, bus + 0x45, numeroDObjet(jeu, v));
  poserOctet(jeu, v + 0xC, 0x1C);
  jeu.appeler(PLACER, v, mot(jeu, bus + 6), mot(jeu, bus + 8));
  return 1;
}

// ==========================================================================================================
// 0x25E1B — l'état 0x14 : le visiteur va vers une boutique, dont la case est dans +49.
//
// Il avance (0x18ADF, sans contrôle des bornes) tant que dure son décompte, puis se tourne vers la
// boutique sur l'axe où l'écart est le plus grand (vertical à égalité), pour une case. Arrivé sur sa
// case, il y entre (état 0x38, 0x25FE7).
//
// Rend 1 à l'arrivée, 0 sinon. Exercé par les scénarios, où le visiteur arrive toujours au terme de
// son premier décompte (la boutique touche l'allée) : les virages en chemin sont relus instruction par
// instruction. Le cadre : l'original garde dans [ebp-8] la position verticale après le pas.
export function allerALaBoutique(jeu, v, cadre) {
  animer(jeu, v);
  const [x, y] = pasSuivant(jeu, v);
  cadre.noter(y);
  jeu.appeler(PLACER_SANS_BORNES, v, x, y);
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (motSigne(jeu, v + 0x14) > 0) return 0;

  poserMot(jeu, v + 0x14, passagesParCase(jeu, v));
  const but = mot(jeu, v + 0x49);
  const ecartX = (but % 64) - octet(jeu, v + 7);
  const ecartY = (but >> 6) - octet(jeu, v + 9);
  if ((jeu.appeler(VALEUR_ABSOLUE, ecartX) | 0) > (jeu.appeler(VALEUR_ABSOLUE, ecartY) | 0)) {
    poserOctet(jeu, v + 0x12, ecartX > 0 ? 1 : 3);
  } else if (ecartY !== 0) {
    poserOctet(jeu, v + 0x12, ecartY > 0 ? 2 : 0);
  } else {
    poserOctet(jeu, v + 0xC, 0x38);
    return 1;
  }
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
  return 0;
}

// ==========================================================================================================
// 0x258D9 — l'état 0x36 : le visiteur au volant d'une voiture, sur le circuit d'une attraction à voitures
// (dans le scénario circuit-auto, le RACE CAR RIDE ; il y monte par 0x30480, attractions.js).
//
// Comme sur le circuit où l'on se déplace soi-même (0x254D2, plus haut), il avance d'un pas à chaque
// passage, et décide au centre de chaque case : il descend si une case voisine (sauf celle d'où il
// vient) porte l'attraction dans l'état 0x1C (arrêtée, le tour fini ; 4 pour 0x254D2) ; sinon, sur
// le circuit, il prend une direction ouverte par la forme de la case, au hasard, sans revenir sur ses
// pas si possible, et gagne en contentement selon la forme (4 dans les virages, table 0xB4965) et sa
// vitesse (un dixième). Sa figure : celle de la voiture, le mot +0x18 de son allure, dans sa direction.
//
// LA VOITURE FOLLE. Un incident (0x65E3D, cas 4 : l'attraction usée) ou une sortie du circuit la met
// hors de contrôle : +5F passe à 2 et la direction de sa course est gardée dans +C5. Elle file alors
// tout droit dans cette direction, en tournant sur elle-même d'un quart de tour, vers la droite, à
// chaque centre de case (la direction affichée, +0x12, par la table 0xB48F4 : 1, 2, 3, 0). Hors du
// circuit, sur une case dont le sol n'a aucun drapeau (l'herbe ?) et où aucun objet ne la suit dans la
// liste de la case (mot +2), elle continue ; ailleurs, elle s'écrase : elle reprend sa direction de course, un nuage s'élève (0x664F1,
// monorail.js), et les visiteurs des quatre cases voisines, puis l'objet qui la suit sur sa case, puis
// le conducteur lui-même sont projetés (0x66189, cause 5, à la vitesse de la voiture). Elle garde
// ensuite l'état 0x36 : ce qu'il advient du conducteur projeté, 0x66189 le décide (non établi ici).
//
// Rend 1 s'il est descendu, 0 sinon. Exercé par circuit-auto (6 710 appels) : la course, les
// décisions, la descente. L'incident, la voiture folle et l'accident n'y sont pas atteints (aucune
// attraction n'y est assez usée) : relus instruction par instruction.
//
// Le cadre : l'original garde dans [ebp-8] le rang de la voisine examinée (4 à la fin de la boucle),
// puis le sol de la case ; il ne l'écrit pas avant le centre d'une case.
const VOISINES_ET_ELLE_MEME = 0xB4928;  // mots signés : 0, puis −64, +1, +64, −1 (les quatre voisines)
const QUART_DE_TOUR_A_DROITE = 0xB48F4; // octets, un sur deux : la direction suivante, 1, 2, 3, 0
const PLAISIR_DE_LA_FORME = 0xB4965;    // octet par forme de circuit : 4 dans les virages (1 à 4), 0 sinon
const ALLURE_VOLANT = 0x18;
const ARRETEE = 0x1C;                   // l'attraction à voitures, le tour fini (0x30480)
const CREER_LE_NUAGE = 0x664F1;         // (objet) : le nuage d'une explosion (monorail.js)
const PROJETER = 0x66189;               // (cause, visiteur, objet, vitesse)

// La figure de la voiture, dans la direction affichée.
function figureAuVolant(jeu, v) {
  const base = mot(jeu, ALLURES + ALLURE_VOLANT + octet(jeu, v + 0x59) * TAILLE_ALLURE);
  return mot(jeu, long(jeu, FIGURES) + (base + octet(jeu, v + 0x12)) * 2);
}

export function conduireSurLeCircuit(jeu, v, cadre) {
  animer(jeu, v);
  // Folle, la voiture court dans la direction gardée, et non dans celle qu'elle montre.
  const course = mot(jeu, v + 0x5F) === 2 ? octet(jeu, v + 0xC5) : octet(jeu, v + 0x12);
  const vitesse = octet(jeu, v + 0x13);
  const x = u16(mot(jeu, v + 6) + octetSigne(jeu, PAS_X + 2 * course) * vitesse);
  const y = u16(mot(jeu, v + 8) + octetSigne(jeu, PAS_Y + 2 * course) * vitesse);
  jeu.appeler(PLACER, v, x, y);
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (motSigne(jeu, v + 0x14) > 0) return 0;

  // Au centre d'une case.
  if ((jeu.appeler(INCIDENT_SUR_LE_CIRCUIT, v, 4) & 0xFF) !== 0) return 0;
  poserMot(jeu, v + 0x14, passagesParCase(jeu, v));
  const c = cellule(jeu, x >> 8, y >> 8);

  for (let d = 0; d < 4; d++) {
    cadre.noter(d);
    if (d === motSigne(jeu, DIRECTIONS_OPPOSEES + octet(jeu, v + 0x12) * 2)) continue;
    const vois = voisine(jeu, c, d);
    if (!(drapeauxDuSol(jeu, vois) & SOL_ATTRACTION)) continue;
    const attraction = jeu.appeler(OBJET_SUR_LA_CASE, vois, ATTRACTION);
    if (attraction !== 0 && octet(jeu, attraction + 0xC) === ARRETEE) return descendre(jeu, v, attraction);
  }
  cadre.noter(4);

  const sol = octet(jeu, c + 2);
  cadre.noter(sol);
  if (octet(jeu, SOLS + sol * 4) & SOL_CIRCUIT) {
    if (mot(jeu, v + 0x5F) === 2) {
      poserOctet(jeu, v + 0x12, octet(jeu, QUART_DE_TOUR_A_DROITE + 2 * octet(jeu, v + 0x12)));
    } else {
      const ouvertes = octet(jeu, DIRECTIONS_DES_CIRCUITS + octet(jeu, FORMES + sol * 4));
      const devant = ouvertes & ~octet(jeu, BIT_DU_RETOUR + octet(jeu, v + 0x12));
      let choix;
      if (u16(devant) === 0) {
        choix = ouvertes;
      } else {
        choix = devant & jeu.appeler(HASARD);
        if (u16(choix) === 0) choix = devant;
      }
      poserOctet(jeu, v + 0x12, octet(jeu, DIRECTION_DU_MASQUE + u16(choix)));
    }
    poserMot(jeu, v + 0xA, figureAuVolant(jeu, v));
    const plaisir = octet(jeu, PLAISIR_DE_LA_FORME + octet(jeu, FORMES + sol * 4)) + ((octet(jeu, v + 0x13) / 10) | 0);
    jeu.appeler(AJOUTER_AU_CONTENTEMENT, v, s16(plaisir));
    return 0;
  }

  // Hors du circuit : la voiture est folle, et tourne.
  if (mot(jeu, v + 0x5F) !== 2) {
    poserMot(jeu, v + 0x5F, 2);
    poserOctet(jeu, v + 0xC5, octet(jeu, v + 0x12));
  }
  poserOctet(jeu, v + 0x12, octet(jeu, QUART_DE_TOUR_A_DROITE + 2 * octet(jeu, v + 0x12)));
  poserMot(jeu, v + 0xA, figureAuVolant(jeu, v));
  if (mot(jeu, SOLS + octet(jeu, c + 2) * 4) === 0 && mot(jeu, v + 2) === 0) return 0;

  // L'accident.
  poserOctet(jeu, v + 0x12, octet(jeu, v + 0xC5));
  jeu.appeler(CREER_LE_NUAGE, v);
  for (let k = 1; k < 5; k++) {
    const ici = cellule(jeu, octet(jeu, v + 7), octet(jeu, v + 9));
    const autre = jeu.appeler(OBJET_SUR_LA_CASE, ici + motSigne(jeu, VOISINES_ET_ELLE_MEME + 2 * k) * 4, VISITEUR) >>> 0;
    if (autre > long(jeu, OBJETS)) jeu.appeler(PROJETER, 5, autre, autre, octet(jeu, v + 0x13));
  }
  const suivant = (long(jeu, OBJETS) + motSigne(jeu, v + 2) * TAILLE_OBJET) >>> 0;
  if (suivant > long(jeu, OBJETS)) jeu.appeler(PROJETER, 5, suivant, suivant, octet(jeu, v + 0x13));
  jeu.appeler(PROJETER, 5, v, v, octet(jeu, v + 0x13));
  return 0;
}

// ==========================================================================================================
// `memoire: 'entiere'` : ces fonctions écrivent dans les objets du parc et les listes des cases (le
// tas), et dans les fiches du joueur ; la comparaison appel par appel restaure et compare toute la
// mémoire. `retour` : les états rendent 0 ou 1 dans eax (0x21681 n'en fait rien) ; 0x65E3D ne rend
// qu'un octet significatif (voir plus haut). Les fonctions dont le cadre d'origine couvre [ebp-8]
// reçoivent le leur (avecLeCadre) ; ce qu'elles y laissent, sous le pointeur de pile, n'est pas vu par
// le comparateur, mais par le rejeu, au travers de 0x223C1. 0x28656 n'a pas de variable locale.
export const reecritures = [
  { adresse: 0x243DD, nom: 'avancerDansLaFile', fn: avecLeCadre(avancerDansLaFile), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x254D2, nom: 'suivreLeCircuit', fn: avecLeCadre(suivreLeCircuit), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x31F95, nom: 'descendreDeLAttraction', fn: avecLeCadre(descendreDeLAttraction), arguments: 2, memoire: 'entiere' },
  { adresse: 0x65E3D, nom: 'incidentSurLeCircuit', fn: avecLeCadre(incidentSurLeCircuit), arguments: 2, memoire: 'entiere' },
  { adresse: 0x28656, nom: 'ajouterAuContentement', fn: ajouterAuContentement, arguments: 2, memoire: 'entiere' },
  { adresse: 0x24F82, nom: 'quitterLaSortie', fn: avecLeCadre(quitterLaSortie), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x2641F, nom: 'revenirDeLaBoutique', fn: avecLeCadre(revenirDeLaBoutique), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x2223B, nom: 'gagnerLAllee', fn: avecLeCadre(gagnerLAllee), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x282E7, nom: 'prendreLeVecteur', fn: avecLeCadre(prendreLeVecteur), arguments: 3, memoire: 'entiere' },
  { adresse: 0x2698E, nom: 'attendreLeBus', fn: avecLeCadre(attendreLeBus), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x25E1B, nom: 'allerALaBoutique', fn: avecLeCadre(allerALaBoutique), arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x258D9, nom: 'conduireSurLeCircuit', fn: avecLeCadre(conduireSurLeCircuit), arguments: 1, retour: true, memoire: 'entiere' },
];

export const enAttente = [];
