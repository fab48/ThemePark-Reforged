// L'agent d'entretien : la tonte de l'herbe, le retour vers les allées, les toilettes, et la tournée
// que le joueur lui trace.
//
// Réécriture lisible de 0x619BF, 0x61BEC, 0x61CF1, 0x61DE9, 0x61F81, 0x627D3, 0x6284C, 0x62913,
// 0x629DB, 0x62B9C, 0x62CBB, 0x6369E, 0x63803, 0x63A85, 0x63E5D, 0x64387, 0x645AD, 0x64641, 0x648D3,
// 0x64940, 0x64AC7, 0x64CF5 et 0x64D9A. Voir docs/guide-reecriture.md.
//
// L'agent d'entretien (métier 2, HANDYMAN) est un objet du parc de type 8 ; personnel.js décrit ses
// champs communs et ses premiers états (0x18 parcourir les allées, 0x1C balayer), simulation.js son
// embauche (0x16, 0x617E0). Ce module réécrit ses autres états, que la mise à jour des objets du parc
// (0x21681) appelle à chaque pas de simulation selon l'octet +C :
//
//   0x1E  tondre l'herbe                       0x619BF  tondre
//   0x22  marcher vers la case visée           0x629DB  marcherVersLaCibleDeLAgent
//   0x24  attendre, puis chercher un chemin    0x62B9C  attendreUnChemin
//   0x1A  hors des allées : en chercher une    0x62CBB  chercherUneAllee
//   0x26  entrer dans des toilettes            0x6369E  entrerDansLesToilettes
//   0x28  les nettoyer                         0x63803  nettoyerLesToilettes
//   0x30  suivre sa tournée                    0x63A85  suivreSaTournee
//   0x2C, 0x2E, 0x32  la tournée qu'on trace   0x64641  tracerSaTournee
//
// LA TONTE. Un agent embauché sur l'herbe (0x617E0) note sa case comme le coin d'une parcelle (+0x64
// la colonne, +0x65 la rangée, octets signés) et sa direction comme celle de la tonte (mot +0x61). Il
// tond la parcelle de 6 × 6 cases en aller-retour : la bande k (0 à 5) est la k-ième rangée de cases
// parallèle à la direction, décalée d'un quart de tour à droite (direction + 1) ; il parcourt les
// bandes paires dans la direction de la tonte, les impaires en sens inverse. 0x62913 situe la case de
// l'agent dans la parcelle : le rang le long de la bande (0 à 5) dans 0xD7B6C, la bande dans 0xD7B6D
// (deux octets du jeu qui ne servent qu'à cela). Tondre une case (0x6284C) fait avancer son image de
// sol de 0 vers 3 ; l'herbe « à tondre » est un sol sans drapeau dont l'image est inférieure à 3
// (0, 1, 2 : non établi — l'herbe plus ou moins haute, vraisemblablement ; 3, l'herbe tondue). Quand
// la parcelle est finie (bande 5, rang 0), l'agent recommence son embauche (0x617E0), qui choisit une
// nouvelle parcelle ou le renvoie aux allées.
//
// LA TOURNÉE. Le joueur choisit un agent et, dans sa fenêtre (0x64387) : la zone 16 le désigne (le
// drapeau 2 de +5 ; au bout de sa case, 0x645AD le met dans l'état 0x2C) ; la zone 21 donne l'outil
// 20 (état 0x2E) dont chaque clic sur une allée ajoute une étape (0x64CF5, l'événement 0x2C) ; la
// zone 16, de nouveau, lance la tournée (état 0x32, puis 0x30). L'agent a 8 étapes au plus (mots
// +0x9C à +0xAA, −1 si aucune ; +0xAC l'étape en cours). Il s'y rend par un chercheur de chemin qui
// longe les obstacles (0x63E5D) ; pendant qu'on trace, la carte montre le trajet (0x64940, 0x64AC7,
// 0x64D9A).
//
// LES CHAMPS de l'agent propres à ce module (les autres : personnel.js) :
//   +0x05 octet  drapeaux : 2, désigné pour une tournée ; 0x10 et 0x20, il longe un obstacle en le
//                gardant à gauche (0x10) ou à droite (0x20) (0x63E5D)
//   +0x2A mot    pas passés à tondre (état 0x1E)
//   +0x34 mot    pas passés au travail (aussi dans les états 0x22, 0x24, 0x30, 0x2C…)
//   +0x58 octet  la direction gardée, reprise après une tâche
//   +0x61 mot    la direction de la tonte
//   +0x64 octet  signé : la colonne du coin de la parcelle ; 0x62CBB y range une case voisine
//   +0x65 octet  signé : la rangée du coin de la parcelle
//   +0x71 mot    la case où l'agent cessera de longer l'obstacle (0x63E5D)
//   +0x9C 8 mots les étapes de la tournée ; +0xAC l'étape visée ; +0xAD l'étape visée pendant le
//                tracé ; +0xAE et +0xAF la case (colonne, rangée) où l'agent a été désigné ; +0xB0
//                l'étape d'où la carte commence à dessiner le trajet
//
// VÉRIFICATION : voir en fin de fichier.

import { Cadre } from './cadre.js';
import { recalerAuMilieuDeLaCase, cesserDeLongerSansIssue } from './corrections.js';   // hors du jeu d'origine (reglages.js)

// --- la mémoire ------------------------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// `idiv` : quotient tronqué vers zéro ; une division par zéro arrêtait le programme d'origine.
function quotient(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}

// --- les tables et variables du jeu -----------------------------------------------------------------
const GRILLE = 0xD3B08;              // pointeur : la carte, 64 × 64 cellules de 4 octets (+2 le sol,
                                     // +3 les décors éparpillés : bits 0 à 2 les déchets)
const SOLS = 0xB44D9;                // 4 octets par sol : +0 mot, ses drapeaux (personnel.js)
const SOLS_DES_ALLEES = 0x1A;        // allée, file, bout de file : où marche l'agent
const SOL_EQUIPEMENT = 0x8000;       // le sol des toilettes et de la fontaine
const SOLS_INTERDITS = 0x39C5;       // le masque passé au chercheur de chemin 0x349EB
const IMAGE_TONDUE = 3;              // l'herbe à tondre : sol sans drapeau, image < 3
const DECHETS = 7;
const DECOR_8 = 8;                   // bit 3 de l'octet +3 : non établi (voir tondre)

const OBJETS_DU_PARC = 0xD3B10;      // pointeur : les objets du parc, 200 octets chacun
const TAILLE_OBJET = 200;
const OBJETS_GRAPHIQUES = 0xD3B80;   // pointeur : 8 octets ; +6 l'image suivante de l'animation
const FIGURES = 0xD3B38;             // pointeur : mots, figure → objet graphique
const MORCEAUX = 0xD3B7C;            // pointeur : 10 octets par morceau, +0 l'image
const IMAGES = 0xD3BB8;              // pointeur : la table des images
const PAS_DES_DIRECTIONS = 0xB4920;  // 4 mots : −64, 1, 64, −1
const AVANCEE = 0xB4932;             // 2 octets signés par direction : (dx, dy)
const DIRECTION_OPPOSEE = 0xB48EC;   // 2 octets par direction, le premier : l'opposée
// Huit octets du code, que 0x62CBB recopie dans ses variables : pour chaque direction d, deux
// directions dont la somme des pas fait un pas en diagonale (1 0, 1 2, 3 2, 3 0).
const DIAGONALES = 0x62CB3;

const EQUIPEMENTS = 0xCCA98, TAILLE_EQUIPEMENT = 0x38;  // le catalogue des décors (personnel.js)
const NETTOYAGE = 0x9;               // octet : une durée de nettoyage, en demi-pas par unité
const SEUIL_DE_SALETE = 0xA;         // octet : le seuil de saleté des toilettes

const COMPTEUR_DE_MISES_A_JOUR = 0xD3AF8;  // long : augmenté par 0x21681 à chaque pas
const PARC_COURANT = 0xD3818;        // pointeur : la fiche du parc ; +0x84 long, la saleté totale
                                     // des toilettes (non établi : ce que 0x6369E en retire)
const SALETE_DU_PARC = 0x84;
const ECRAN = 0xD6652;               // mot : l'écran ouvert, 0 le parc
const OUTIL = 0xD6670;               // mot : l'outil en main
const OUTIL_MIS_DE_COTE = 0xD6626;   // mot
const OBJET_CHOISI = 0xD6678;        // mot : le numéro de l'objet du parc choisi
const CURSEURS = 0xD3B84;            // pointeur : les images du pointeur, 6 octets chacune
const IMAGES_DES_CURSEURS = 0xB52C1; // octet par outil
const OUTIL_DE_LA_TOURNEE = 0x14;    // l'outil 20
const RANG_DANS_LA_BANDE = 0xD7B6C;  // octet : le rang de l'agent le long de sa bande (0 à 5)
const BANDE_DE_TONTE = 0xD7B6D;      // octet : la bande (0 à 5)
const DERNIER_RANG = 5, DERNIERE_BANDE = 5, LARGEUR_DE_LA_PARCELLE = 6;

const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;         // mots signés
const ORIGINE_X = 0xD6624;                            // mot signé : l'origine du dessin
const CAMERA_COLONNE = 0xD667A, CAMERA_RANGEE = 0xD6666;
const LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;
const COLONNE_VISEE = 0xD6662, RANGEE_VISEE = 0xD666A; // la case sous le pointeur, depuis la caméra
const DRAPEAUX_TRACEUR = 0xBECBC;    // mot : 0x40, la prochaine image est tracée en silhouette

// --- les champs des objets ---------------------------------------------------------------------------
const DRAPEAUX = 0x5, X = 0x6, COLONNE = 0x7, Y = 0x8, RANGEE = 0x9, GRAPHIQUE = 0xA;
const ETAT = 0xC, ETAT_SUIVANT = 0xD, DIRECTION = 0x12, VITESSE = 0x13, COMPTE = 0x14, GENRE = 0x16;
const PATIENCE = 0x20, PAS_DANS_LES_ALLEES = 0x28, PAS_A_TONDRE = 0x2A, TEMPS_DE_SERVICE = 0x34;
const SALETE = 0x3C;                 // des toilettes (type 0x18)
const CIBLE_COLONNE = 0x56, CIBLE_RANGEE = 0x57, DIRECTION_GARDEE = 0x58;
const SENS_DE_LA_TONTE = 0x61, COIN_COLONNE = 0x64, COIN_RANGEE = 0x65, REPRISE = 0x71;
const TOURNEE = 0x9C, ETAPE = 0xAC, ETAPE_TRACEE = 0xAD, DEPART_COLONNE = 0xAE, DEPART_RANGEE = 0xAF;
const DEBUT_DU_TRAJET = 0xB0;
const ETAPES = 8, AUCUNE = 0xFFFF;

const DESIGNE = 2;                   // drapeau de +5
const LONGE_A_GAUCHE = 0x10, LONGE_A_DROITE = 0x20, LONGE = 0x30;

const TOILETTES = 0x18;              // type d'objet (et la fontaine)
const EN_SERVICE = 2;                // l'état des toilettes utilisables

// Les états.
const ALLEES = 0x18, HORS_DES_ALLEES = 0x1A, BALAYER = 0x1C, TONDRE = 0x1E;
const MARCHER_VERS_LA_CIBLE = 0x22, ATTENDRE_UN_CHEMIN = 0x24;
const ENTRER_DANS_LES_TOILETTES = 0x26, NETTOYER = 0x28;
const TOURNEE_EN_ATTENTE = 0x2C, TOURNEE_EN_TRACE = 0x2E, SUIVRE_SA_TOURNEE = 0x30;
const RETOUR_AU_DEPART = 0x32;

// Les figures : 0xBF + direction la marche de l'agent (personnel.js), 0xC3 + direction sa marche
// sur l'herbe (la tondeuse, vraisemblablement), 0xD3 la marque d'une étape de tournée.
const FIGURES_DE_MARCHE = 0xBF, FIGURES_DE_LA_TONDEUSE = 0xC3, FIGURE_DE_L_ETAPE = 0xD3;
const COULEUR_DE_L_ETAPE_VISEE = [0xBC, 0x18];  // clignote, un pas sur deux
const COULEUR_HORS_DES_ALLEES = 0x15, COULEUR_SOUS_LE_POINTEUR = 0xDF;

// --- les fonctions appelées ---------------------------------------------------------------------------
const DIVISION_PAR_ZERO = 0x19ED3; // vitesse nulle : rend 1, efface la demande de sortie
const DEPLACER = 0x18A44;            // (objet, x, y)
const CHERCHER_SON_CHEMIN = 0x349EB; // (objet, limite, sols interdits) : direction, 4 à l'arrivée
const OBJET_DE_TYPE_SUR_LA_CASE = 0x204B9;
const PRENDRE_LA_FIGURE_DE_MARCHE = 0x28671;
const COMMENCER_L_ENTRETIEN = 0x617E0;   // l'état 0x16 (simulation.js)
const BALAYER_S_IL_Y_A_DES_DECHETS = 0x6386F;
const RETRACER_LE_SOL = 0x2CBC0;     // (case, image + 1)
const CHANGER_LE_CURSEUR = 0x116E4;
const REMPLIR = 0x7F1A0;             // memset (destination, octet, nombre)
const SILHOUETTE = 0x117B3;          // (x, y, image, couleur)
// Celles de ce module appelées par jeu.appeler (chacune reste comparée à chaque appel) ; la tonte
// appelle les siennes directement, dans le cadre de l'original (voir « La tonte »).
const CHEMIN_DE_TOURNEE = 0x63E5D;
const DESIGNER_POUR_UNE_TOURNEE = 0x645AD;
const VISER_L_ETAPE = 0x648D3;
const TRACER_UN_TRONCON = 0x64AC7;
const MARQUER_UNE_CASE = 0x64D9A;
const LIMITE_DU_CHEMIN = 0x32;

// --- outils ------------------------------------------------------------------------------------------
const cellule = (jeu, index) => long(jeu, GRILLE) + index * 4;
const caseDeLObjet = (jeu, o) => u16((octet(jeu, o + RANGEE) << 6) + octet(jeu, o + COLONNE));
const drapeauxDuSol = (jeu, c) => mot(jeu, SOLS + octet(jeu, c + 2) * 4);
const pas = (jeu, d) => motSigne(jeu, PAS_DES_DIRECTIONS + d * 2);
const figure = (jeu, n) => mot(jeu, long(jeu, FIGURES) + n * 2);
const objetChoisi = (jeu) => (long(jeu, OBJETS_DU_PARC) + mot(jeu, OBJET_CHOISI) * TAILLE_OBJET) >>> 0;
const tournee = (jeu, o, etape) => mot(jeu, o + TOURNEE + etape * 2);

// L'herbe à tondre : un sol sans drapeau, d'image inférieure à 3.
const herbeATondre = (jeu, c) => drapeauxDuSol(jeu, c) === 0 && octet(jeu, c + 2) < IMAGE_TONDUE;

function animer(jeu, o) {
  poserMot(jeu, o + GRAPHIQUE, mot(jeu, long(jeu, OBJETS_GRAPHIQUES) + mot(jeu, o + GRAPHIQUE) * 8 + 6));
}

function animerTousLesQuatrePas(jeu, o) {
  if ((octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 3) === 0) animer(jeu, o);
}

// Le temps de traverser une case : 256 divisé par la vitesse.
function delaiParCase(jeu, o) {
  recalerAuMilieuDeLaCase(jeu, o);   // hors du jeu d'origine : corrections.js, éteint par défaut
  const vitesse = octet(jeu, o + VITESSE);
  return vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : (256 / vitesse) | 0;
}

function decompter(jeu, o) {
  const compte = s16(mot(jeu, o + COMPTE) - 1);
  poserMot(jeu, o + COMPTE, compte);
  return compte;
}

// Un pas de marche dans la direction de l'agent. Rend les coordonnées visées : l'original range
// l'une d'elles dans sa variable [ebp-8] (voir Reste).
function avancer(jeu, o) {
  const d = octet(jeu, o + DIRECTION) * 2, vitesse = octet(jeu, o + VITESSE);
  const x = u16(mot(jeu, o + X) + octetSigne(jeu, AVANCEE + d) * vitesse);
  const y = u16(mot(jeu, o + Y) + octetSigne(jeu, AVANCEE + d + 1) * vitesse);
  jeu.appeler(DEPLACER, o, x, y);
  return { x, y };
}

function viser(jeu, o, index) {
  poserOctet(jeu, o + CIBLE_COLONNE, index % 64);
  poserOctet(jeu, o + CIBLE_RANGEE, quotient(index, 64));
}

function changerLeCurseurSelonLOutil(jeu) {
  jeu.appeler(CHANGER_LE_CURSEUR, long(jeu, CURSEURS) + octet(jeu, IMAGES_DES_CURSEURS + mot(jeu, OUTIL)) * 6);
}

// --- Le reste laissé sur la pile ------------------------------------------------------------------------
//
// 0x21681 appelle chaque routine d'état à la même hauteur de pile, et l'état 4 des visiteurs
// (0x223C1) relit l'octet que la routine précédente a laissé 24 octets sous son point d'entrée
// (guide-reecriture.md, « Les restes de pile »). Toutes les routines d'état de ce module ouvrent un
// cadre d'au moins 8 octets : cet octet est celui de leur variable [ebp-8], que leurs appels, faits
// plus bas, ne touchent pas. La routine note ce que l'original y range ; à la sortie, on y laisse la
// dernière valeur notée, ou l'octet trouvé à l'entrée (les appels de la réécriture, faits de plus
// haut, ont pu l'écraser). La tonte (0x619BF) fait mieux : elle ouvre le cadre de l'original, où
// l'octet se trouve à sa place (voir « La tonte »).
class Reste {
  constructor(jeu) {
    this.jeu = jeu;
    jeu.T.sauver();
    this.adresse = ((jeu.T.R.esp >>> 0) - 24) >>> 0;
    this.octet = jeu.m8[this.adresse];
  }

  noter(valeur) { this.octet = valeur & 0xFF; }

  laisser() { this.jeu.m8[this.adresse] = this.octet; }
}

function avecLeReste(routine) {
  return (jeu, o) => {
    const reste = new Reste(jeu);
    try {
      return routine(jeu, o, reste);
    } finally {
      reste.laisser();
    }
  };
}

// === La tonte ==============================================================================================
//
// UN RESTE DE PILE RELU. Quand le sens de la tonte (mot +0x61) dépasse 3, 0x61F81 ne calcule pas ses
// bandes : sa position, sa fin et son pas (ses variables [ebp-8], [ebp-0xC], [ebp-0x10]) sont ce qui
// traîne sur la pile, 24, 28 et 32 octets sous son entrée. Cela arrive : l'embauche (0x617E0) envoie un
// agent posé hors de l'herbe et des allées tondre la case (32, 16) sans poser le mot +0x61, qui garde
// ce qu'y avait laissé l'objet précédent (0x05AB dans longue-faillite). Ce qui traîne là, c'est ce que
// les fonctions de la tonte y ont écrit juste avant, à leurs hauteurs d'origine :
//   - appelée par 0x619BF : les variables de 0x61BEC (l'une des trois, selon le rang), et, en dessous,
//     celles de 0x18A44 (son ebp sauvé, son résultat), de 0x61DE9 ou de 0x61F81 lors d'un pas précédent ;
//   - appelée par 0x61DE9 : les variables de 0x61CF1 ([ebp-8], [ebp-0xC], [ebp-0x10]), ou, si
//     0x61DE9 a cherché un chemin, l'ebp que 0x349EB a sauvé (l'adresse du cadre de 0x61DE9) et ses
//     deux premières variables.
// Seuls les mots bas comptent (0x61F81 compare et passe des mots). Pour les laisser comme l'original,
// les fonctions de la tonte ouvrent le cadre de l'original (cadre.js), y écrivent leurs variables, et
// s'appellent entre elles à la hauteur et avec l'adresse de retour d'origine, directement (appelInterne) :
// un appel par la table des fonctions ferait brouiller par le vérificateur ce qu'elles y laissent.

// Appeler une fonction de ce module comme l'original : ses arguments et l'adresse de retour d'origine
// empilés sous le cadre ouvert, sans passer par la table des fonctions.
function appelInterne(jeu, retour, fonction, ...args) {
  const T = jeu.T;
  T.sauver();
  const avant = T.R.esp;
  let esp = avant >>> 0;
  for (let k = args.length - 1; k >= 0; k--) { esp -= 4; poserLong(jeu, esp, args[k]); }
  esp -= 4;
  poserLong(jeu, esp, retour);
  T.R.esp = esp | 0;
  T.charger();
  try {
    return fonction(jeu, ...args);
  } finally {
    T.sauver();
    T.R.esp = avant;
    T.charger();
  }
}

// Appeler une autre fonction du jeu comme l'original, sous le cadre ouvert.
function appelExterne(jeu, retour, adresse, ...args) {
  jeu.T.sauver();
  return jeu.appelerDepuis(retour, jeu.T.R.esp, adresse, ...args);
}

// Une routine dans le cadre de l'original : ebx, esi, edi et ebp empilés, puis `taille` octets de
// variables. La routine reçoit la variable [ebp - n] par `v(n)` (son adresse).
function dansSonCadre(taille, routine) {
  return (jeu, ...args) => {
    const cadre = new Cadre(jeu, taille);
    try {
      return routine(jeu, (n) => cadre.local(n) >>> 0, ...args);
    } finally {
      cadre.fermer();
    }
  };
}

// Le temps de traverser une case, calculé dans le cadre : 0x19ED3 appelé d'ici pour une vitesse nulle.
function delaiDansLeCadre(jeu, o, retourDeLaDivision) {
  recalerAuMilieuDeLaCase(jeu, o);   // hors du jeu d'origine : corrections.js, éteint par défaut
  const vitesse = octet(jeu, o + VITESSE);
  return vitesse === 0 ? s16(appelExterne(jeu, retourDeLaDivision, DIVISION_PAR_ZERO)) : (256 / vitesse) | 0;
}

// Le sens de la tonte tel que l'original le range : `mov ax, [o + 0x61]`, le haut d'eax étant celui
// de l'adresse de l'agent.
const sensRange = (jeu, o) => ((o & 0xFFFF0000) | mot(jeu, o + SENS_DE_LA_TONTE)) >>> 0;

// 0x619BF — l'agent tond l'herbe (état 0x1E).
//
// Il avance d'une case en 16 pas, l'animation d'une image tous les 4 pas. Au bout de la case, il
// s'oriente dans sa bande (0x61BEC), puis regarde la case devant lui : si ce n'est pas de l'herbe à
// tondre, il cherche la suivante — dans sa bande (0x61DE9), ou, s'il arrive au bout de la bande (rangs
// 4 et 5 d'une bande paire, 0 et 1 d'une impaire), dans les bandes suivantes (0x61F81). Puis il tond
// sa case (0x6284C). Quand il est sur la dernière case de la parcelle (bande 5, rang 0), il reprend
// son embauche (0x617E0) ; sinon il repart pour une case.
//
// Il cherche dans tous les cas, sauf quand la case devant est un sol sans drapeau, d'image autre que 3,
// dont le bit 3 de l'octet +3 est levé (ce qu'est ce bit sur l'herbe : non établi) : il y va alors
// tout droit. La recherche commence par la case devant : de l'herbe à tondre y est trouvée aussitôt.
//
// Variables : [ebp-4] et [ebp-8] l'abscisse et l'ordonnée visées (mots bas ; l'octet bas de [ebp-8]
// est le reste que relit 0x223C1), [ebp-0xC] la case devant, [ebp-0x10] le délai.
export const tondre = dansSonCadre(0x10, (jeu, v, o) => {
  poserMot(jeu, o + PAS_A_TONDRE, mot(jeu, o + PAS_A_TONDRE) + 1);
  animerTousLesQuatrePas(jeu, o);
  if (motSigne(jeu, o + COMPTE) > 0) {
    const { x, y } = positionVisee(jeu, o);
    poserMot(jeu, v(4), x);
    poserMot(jeu, v(8), y);
    appelExterne(jeu, 0x61A63, DEPLACER, o, x, y);
  }
  if (decompter(jeu, o) > 0) return;

  appelInterne(jeu, 0x61A84, orienterLaTondeuse, o);
  const devant = u16(caseDeLObjet(jeu, o) + pas(jeu, octet(jeu, o + DIRECTION)));
  poserMot(jeu, v(0xC), devant);
  const c = cellule(jeu, devant);
  const aPasser = drapeauxDuSol(jeu, c) !== 0 || octet(jeu, c + 2) === IMAGE_TONDUE
    || (octet(jeu, c + 3) & DECOR_8) === 0;
  if (aPasser) {
    const bande = octet(jeu, BANDE_DE_TONTE), rang = octet(jeu, RANG_DANS_LA_BANDE);
    if (bande & 1) {
      if (rang === 0 || rang === 1) appelInterne(jeu, 0x61B4A, changerDeBande, o);
      else appelInterne(jeu, 0x61B58, chercherDansLaBande, o);
    } else if (rang === DERNIER_RANG || rang === DERNIER_RANG - 1) {
      appelInterne(jeu, 0x61B78, changerDeBande, o);
    } else {
      appelInterne(jeu, 0x61B86, chercherDansLaBande, o);
    }
  }
  appelInterne(jeu, 0x61B92, tondreLaCase, o);
  if (octet(jeu, BANDE_DE_TONTE) === DERNIERE_BANDE && octet(jeu, RANG_DANS_LA_BANDE) === 0) {
    appelExterne(jeu, 0x61BB2, COMMENCER_L_ENTRETIEN, o);
    return;
  }
  const delai = delaiDansLeCadre(jeu, o, 0x61BC5);
  poserLong(jeu, v(0x10), delai);
  poserMot(jeu, o + COMPTE, delai);
});

// Les coordonnées visées par un pas de marche dans la direction de l'agent (ce que 0x18A44 reçoit).
function positionVisee(jeu, o) {
  const d = octet(jeu, o + DIRECTION) * 2, vitesse = octet(jeu, o + VITESSE);
  return {
    x: u16(mot(jeu, o + X) + octetSigne(jeu, AVANCEE + d) * vitesse),
    y: u16(mot(jeu, o + Y) + octetSigne(jeu, AVANCEE + d + 1) * vitesse),
  };
}

// 0x61BEC — orienter l'agent dans sa bande. Au début d'une bande (rang 0), une bande paire part
// dans le sens de la tonte, une impaire tourne d'un quart vers la bande suivante ; au bout (rang 5),
// une paire tourne vers la suivante, une impaire revient à contresens ; entre les deux, la paire va
// dans le sens de la tonte, l'impaire à contresens. La figure de la tondeuse suit la direction.
// Pour un sens au-delà de 3, le contresens est lu hors de la table des directions opposées, et le rang
// et la bande sont ceux que 0x62913 avait laissés (il n'y touche pas).
// Variables : [ebp-4] la direction d'avant ; la nouvelle dans [ebp-8] (rang 0), [ebp-0xC] (rang 5) ou
// [ebp-0x10] (entre les deux), sur 32 bits.
export const orienterLaTondeuse = dansSonCadre(0x10, (jeu, v, o) => {
  appelInterne(jeu, 0x61C0C, situerDansLaParcelle, o, octet(jeu, o + COLONNE), octet(jeu, o + RANGEE));
  const avant = octet(jeu, o + DIRECTION);
  poserOctet(jeu, v(4), avant);
  const sens = mot(jeu, o + SENS_DE_LA_TONTE);
  const impaire = (octet(jeu, BANDE_DE_TONTE) & 1) !== 0;
  const versLaSuivante = (sens + 1) & 3;
  const aContresens = () => motSigne(jeu, DIRECTION_OPPOSEE + sens * 2);
  let variable, direction;
  switch (octet(jeu, RANG_DANS_LA_BANDE)) {
    case 0: variable = 8; direction = impaire ? versLaSuivante : sens; break;
    case DERNIER_RANG: variable = 0xC; direction = impaire ? aContresens() : versLaSuivante; break;
    default: variable = 0x10; direction = impaire ? aContresens() : sens;
  }
  poserLong(jeu, v(variable), direction);
  poserOctet(jeu, o + DIRECTION, direction);
  if (avant !== octet(jeu, o + DIRECTION)) {
    poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DE_LA_TONDEUSE + octet(jeu, o + DIRECTION)));
  }
});

// 0x62913 — situer la case (colonne, rangée) dans la parcelle de l'agent : le rang le long de la
// bande et la bande, selon le sens de la tonte (0 vers le haut, puis dans le sens des aiguilles d'une
// montre). Un sens au-delà de 3 ne touche à rien.
export function situerDansLaParcelle(jeu, o, colonne, rangee) {
  const c0 = octet(jeu, o + COIN_COLONNE), r0 = octet(jeu, o + COIN_RANGEE);
  const c = colonne & 0xFF, r = rangee & 0xFF;
  let rang, bande;
  switch (mot(jeu, o + SENS_DE_LA_TONTE)) {
    case 0: rang = r0 - r; bande = c - c0; break;
    case 1: rang = c - c0; bande = r - r0; break;
    case 2: rang = r - r0; bande = c0 - c; break;
    case 3: rang = c0 - c; bande = r0 - r; break;
    default: return;
  }
  poserOctet(jeu, RANG_DANS_LA_BANDE, rang);
  poserOctet(jeu, BANDE_DE_TONTE, bande);
}

// 0x61CF1 — combien de cases il reste devant l'agent dans sa bande : 5 − rang pour une bande paire,
// le rang pour une impaire. Quand l'agent va dans le sens de la tonte (sa direction égale le mot
// +0x61), le bord de la carte peut raccourcir ce compte, par des bornes qui ne se répondent pas :
//   - vers le haut, si la rangée du coin est inférieure à 6 : la rangée de l'agent ;
//   - vers la droite, si 64 − la colonne de l'agent est inférieur à 6 : 64 − sa colonne ;
//   - vers le bas, si 61 − la rangée de l'agent est inférieur à 6 : 61 − sa rangée ;
//   - vers la gauche, si la colonne du coin est inférieure à 6 : la colonne de l'agent.
// Anomalie, reproduite : deux bornes lisent le coin de la parcelle, deux la case de l'agent, et le
// bas de la carte est la rangée 61 ici, 60 dans 0x61F81.
// Rend le compte dans al seul (le reste d'eax, des restes de calcul, n'est pas reproduit).
// Variables : [ebp-0xC] le compte de la bande (32 bits), [ebp-4] puis [ebp-8] le compte rendu (un
// octet), [ebp-0x10] le sens rangé, quand l'agent va dans le sens de la tonte.
export const casesRestantes = dansSonCadre(0x10, (jeu, v, o) => {
  const rang = octet(jeu, RANG_DANS_LA_BANDE);
  const deLaBande = (octet(jeu, BANDE_DE_TONTE) & 1) ? rang : DERNIER_RANG - rang;
  poserLong(jeu, v(0xC), deLaBande);
  let reste = deLaBande & 0xFF;
  const sens = mot(jeu, o + SENS_DE_LA_TONTE);
  if (sens === octet(jeu, o + DIRECTION)) {
    poserLong(jeu, v(0x10), sensRange(jeu, o));
    const colonne = octet(jeu, o + COLONNE), rangee = octet(jeu, o + RANGEE);
    switch (sens) {
      case 0: if (octetSigne(jeu, o + COIN_RANGEE) < 6) reste = rangee; break;
      case 1: if (64 - colonne < 6) reste = (64 - colonne) & 0xFF; break;
      case 2: if (61 - rangee < 6) reste = (61 - rangee) & 0xFF; break;
      case 3: if (octetSigne(jeu, o + COIN_COLONNE) < 6) reste = colonne; break;
    }
  }
  poserOctet(jeu, v(4), reste);
  poserOctet(jeu, v(8), reste);
  return reste;
});

// 0x61DE9 — chercher, devant l'agent dans sa bande, la prochaine herbe à tondre, sur autant de cases
// qu'il en reste (0x61CF1). La première qu'il peut atteindre (le chemin de 0x349EB, sa rangée
// inférieure à 60) devient sa cible : il y marche (état 0x22), puis reprendra la tonte (0x1E). S'il
// n'en trouve aucune, il passe aux bandes suivantes (0x61F81), ou, sur la dernière bande, reprend son
// embauche (0x617E0).
// Variables : [ebp-4] le compte de cases (un octet), [ebp-8] le pas (un octet), [ebp-0xC] la case
// regardée et [ebp-0x10] la case de départ (mots bas), [ebp-0x14] la direction rendue par 0x349EB,
// [ebp-0x18] le délai.
export const chercherDansLaBande = dansSonCadre(0x18, (jeu, v, o) => {
  let index = caseDeLObjet(jeu, o);
  poserMot(jeu, v(0x10), index);
  poserMot(jeu, v(0xC), index);
  const avance = octetSigne(jeu, PAS_DES_DIRECTIONS + octet(jeu, o + DIRECTION) * 2);
  poserOctet(jeu, v(8), avance);
  let n = appelInterne(jeu, 0x61E29, casesRestantes, o) & 0xFF;
  for (; n !== 0; n = (n - 1) & 0xFF) {
    poserOctet(jeu, v(4), n);
    index = u16(index + avance);
    poserMot(jeu, v(0xC), index);
    if (!herbeATondre(jeu, cellule(jeu, index))) continue;
    viser(jeu, o, index);
    if (octet(jeu, o + CIBLE_RANGEE) >= 0x3C) continue;
    const chemin = appelExterne(jeu, 0x61ECE, CHERCHER_SON_CHEMIN, o, LIMITE_DU_CHEMIN, SOLS_INTERDITS);
    poserLong(jeu, v(0x14), chemin);
    const d = s16(chemin);
    if (d < 0 || d > 3) continue;
    poserOctet(jeu, o + ETAT, MARCHER_VERS_LA_CIBLE);
    poserOctet(jeu, o + ETAT_SUIVANT, TONDRE);
    poserOctet(jeu, o + DIRECTION, d);
    const delai = delaiDansLeCadre(jeu, o, 0x61F09);
    poserLong(jeu, v(0x18), delai);
    poserMot(jeu, o + COMPTE, delai);
    poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DE_LA_TONDEUSE + octet(jeu, o + DIRECTION)));
    return;
  }
  poserOctet(jeu, v(4), 0);
  if (octet(jeu, BANDE_DE_TONTE) === DERNIERE_BANDE) appelExterne(jeu, 0x61F79, COMMENCER_L_ENTRETIEN, o);
  else appelInterne(jeu, 0x61F6B, changerDeBande, o);
});

// La bande k de la parcelle, telle que 0x61F81 la calcule dans ses variables : sa première case (dans
// [ebp-8]), la case où elle s'arrête ([ebp-0xC]), et le pas (en index de case). Une bande paire va
// dans le sens de la tonte, une impaire à rebours. Près du bord de la carte, la bande s'arrête avant :
// à la rangée 1 vers le haut (si la rangée du coin est inférieure à 6), à la colonne 63 vers la droite
// (si 64 − la colonne de l'agent est inférieur à 6), à la rangée 59 vers le bas (si 60 − la rangée de
// l'agent l'est), à la colonne 1 vers la gauche (si la colonne du coin l'est) ; sinon au bout des 6
// cases. L'original calcule chaque borne dans sa propre variable (`provisoires`, les décalages sous
// ebp de la première case et de la dernière), puis la recopie.
function bandeDeTonte(jeu, o, sens, k) {
  const c0 = octetSigne(jeu, o + COIN_COLONNE), r0 = octetSigne(jeu, o + COIN_RANGEE);
  const paire = (k & 1) === 0;
  let depart, arrivee, avance, retour, provisoires;
  switch (sens) {
    case 0: {
      const colonne = c0 + k;
      depart = colonne + r0 * 64;
      arrivee = r0 < 6 ? colonne + 64 : colonne + (r0 - 5) * 64;
      avance = 0; retour = 2; provisoires = paire ? [0x1C, 0x20] : [0x24, 0x28];
      break;
    }
    case 1: {
      const rangee = (r0 + k) * 64;
      depart = rangee + c0;
      arrivee = 64 - octet(jeu, o + COLONNE) < 6 ? rangee + 63 : rangee + c0 + 5;
      avance = 1; retour = 3; provisoires = paire ? [0x2C, 0x30] : [0x34, 0x38];
      break;
    }
    case 2: {
      const colonne = c0 - k;
      depart = colonne + r0 * 64;
      arrivee = 0x3C - octet(jeu, o + RANGEE) < 6 ? colonne + 59 * 64 : colonne + (r0 + 5) * 64;
      avance = 2; retour = 0; provisoires = paire ? [0x3C, 0x40] : [0x44, 0x48];
      break;
    }
    case 3: {
      const rangee = (r0 - k) * 64;
      depart = rangee + c0;
      arrivee = c0 < 6 ? rangee + 1 : rangee + c0 - 5;
      avance = 3; retour = 1; provisoires = paire ? [0x4C, 0x50] : [0x54, 0x58];
      break;
    }
    default: return null;
  }
  return paire
    ? { debut: depart, fin: arrivee, pas: mot(jeu, PAS_DES_DIRECTIONS + avance * 2), provisoires }
    : { debut: arrivee, fin: depart, pas: mot(jeu, PAS_DES_DIRECTIONS + retour * 2), provisoires };
}

// 0x61F81 — passer aux bandes suivantes : pour chaque bande après la sienne, chercher d'un bout à
// l'autre la première herbe à tondre (0x627D3) qu'il peut atteindre. Une bande qui commence sur la
// première ou la dernière colonne de la carte est sautée. Il marche vers l'herbe trouvée (état 0x22,
// l'état en cours gardé pour après) ; s'il y est déjà, il reprend son état gardé, et, si c'est la
// tonte, s'oriente et tond. Une herbe hors d'atteinte fait chercher plus loin dans la bande ; une
// herbe au-delà de la rangée 60, ou aucune herbe dans les bandes restantes, fait reprendre son
// embauche (0x617E0).
//
// Anomalie, reproduite : pour un sens de tonte au-delà de 3, la bande n'est pas calculée, et la
// recherche part des valeurs qui sont dans ses variables — à la première bande, ce que les fonctions
// précédentes ont laissé sur la pile (voir plus haut). Le plus souvent, c'est l'ebp qu'une fonction
// appelée y a sauvé, une adresse de la pile, bien au-delà de la carte : 0x627D3 ne trouve rien, et
// l'agent reprend son embauche.
//
// La position, la fin et le pas vivent dans les variables [ebp-8], [ebp-0xC] et [ebp-0x10], sur 32
// bits comme dans l'original ; [ebp-4] la bande, [ebp-0x14] la direction rendue par 0x349EB,
// [ebp-0x18] le sens rangé, [ebp-0x5C] et [ebp-0x60] les délais.
export const changerDeBande = dansSonCadre(0x60, (jeu, v, o) => {
  const position = () => long(jeu, v(8));
  const poserPosition = (valeur) => poserLong(jeu, v(8), valeur);
  for (let k = (octet(jeu, BANDE_DE_TONTE) + 1) & 0xFF; k < LARGEUR_DE_LA_PARCELLE; k = (k + 1) & 0xFF) {
    poserOctet(jeu, v(4), k);
    poserLong(jeu, v(0x18), sensRange(jeu, o));
    const bande = bandeDeTonte(jeu, o, mot(jeu, o + SENS_DE_LA_TONTE), k);
    if (bande) {
      const [premiere, derniere] = bande.provisoires;
      poserLong(jeu, v(premiere), bande.debut);
      poserLong(jeu, v(derniere), bande.fin);
      poserPosition(bande.debut);
      poserLong(jeu, v(0xC), bande.fin);
      // `mov ax, [pas]` : le haut du mot long est celui de la dernière valeur chargée, la fin.
      poserLong(jeu, v(0x10), ((bande.fin & 0xFFFF0000) | bande.pas) >>> 0);
    }
    for (;;) {
      const fin = mot(jeu, v(0xC));
      if (u16(position()) === fin) break;
      const colonne = u16(position()) % 64;
      if (colonne === 0 || colonne === 63) break;
      poserPosition(appelInterne(jeu, 0x62660, premiereHerbeATondre, u16(position()), fin, motSigne(jeu, v(0x10))));
      if (u16(position()) === 0) break;
      viser(jeu, o, u16(position()));
      if (octet(jeu, o + CIBLE_RANGEE) > 0x3C) {
        appelExterne(jeu, 0x626AA, COMMENCER_L_ENTRETIEN, o);
        return;
      }
      const chemin = appelExterne(jeu, 0x626C7, CHERCHER_SON_CHEMIN, o, LIMITE_DU_CHEMIN, SOLS_INTERDITS);
      poserLong(jeu, v(0x14), chemin);
      const d = s16(chemin);
      if (d === 4) {
        const delai = delaiDansLeCadre(jeu, o, 0x626E2);
        poserLong(jeu, v(0x5C), delai);
        poserMot(jeu, o + COMPTE, delai);
        poserOctet(jeu, o + ETAT, octet(jeu, o + ETAT_SUIVANT));
        if (octet(jeu, o + ETAT) === TONDRE) {
          appelInterne(jeu, 0x62722, orienterLaTondeuse, o);
          appelInterne(jeu, 0x6272E, tondreLaCase, o);
        }
        return;
      }
      if (d >= 0 && d <= 3) {
        const delai = delaiDansLeCadre(jeu, o, 0x62754);
        poserLong(jeu, v(0x60), delai);
        poserMot(jeu, o + COMPTE, delai);
        poserOctet(jeu, o + ETAT_SUIVANT, octet(jeu, o + ETAT));
        poserOctet(jeu, o + ETAT, MARCHER_VERS_LA_CIBLE);
        poserOctet(jeu, o + DIRECTION, d);
        poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DE_LA_TONDEUSE + octet(jeu, o + DIRECTION)));
        return;
      }
      poserPosition(position() + long(jeu, v(0x10)));
    }
  }
  appelExterne(jeu, 0x627CB, COMMENCER_L_ENTRETIEN, o);
});

// 0x627D3 — la première herbe à tondre de `depart` à `fin` compris, par pas de `avance` : son index,
// ou 0. L'index est un mot, mais le résultat est rendu sur 32 bits, tel que l'original l'a calculé.
// Au-delà de l'index 0x1040 (la rangée 65), la recherche s'arrête.
export function premiereHerbeATondre(jeu, depart, fin, avance) {
  const arret = (fin + avance) | 0;
  for (let index = depart | 0; ; index = (index + avance) | 0) {
    if (u16(index) === u16(arret) || u16(index) >= 0x1040) return 0;
    if (herbeATondre(jeu, cellule(jeu, u16(index)))) return index;
  }
}

// 0x6284C — tondre la case de l'agent, si c'est de l'herbe (un sol sans drapeau) : ses décors
// éparpillés (les trois bits bas de l'octet +3) sont effacés, et son image avance d'un cran jusqu'à
// 3 ; si le parc est à l'écran, la case est retracée dans le tampon de fond (0x2CBC0).
// Variable : [ebp-4] la case (mot bas).
export const tondreLaCase = dansSonCadre(4, (jeu, v, o) => {
  const index = caseDeLObjet(jeu, o);
  poserMot(jeu, v(4), index);
  const c = cellule(jeu, index);
  if (drapeauxDuSol(jeu, c) !== 0) return;
  poserOctet(jeu, c + 3, octet(jeu, c + 3) & ~DECHETS);
  if (octet(jeu, c + 2) >= IMAGE_TONDUE) return;
  poserOctet(jeu, c + 2, octet(jeu, c + 2) + 1);
  if (mot(jeu, ECRAN) !== 0) return;
  appelExterne(jeu, 0x6290B, RETRACER_LE_SOL, index, u16(octet(jeu, c + 2) + 1));
});

// === Marcher, attendre, retrouver les allées =================================================================

// 0x629DB — marcher vers la case visée (état 0x22), une case à la fois, par le chercheur de chemin
// 0x349EB. Arrivé, l'agent reprend l'état gardé (+0xD) avec sa figure de marche, la patience remise
// à 20 s'il retourne aux allées. Sans chemin, il passe dans l'état 0x1A s'il allait tondre, sinon il
// attend une case (état 0x24). Rend dans al 1 quand l'état change ; l'original laisse sur la pile
// l'octet bas de l'ordonnée visée, quand il a avancé.
export const marcherVersLaCibleDeLAgent = avecLeReste((jeu, o, reste) => {
  poserMot(jeu, o + TEMPS_DE_SERVICE, mot(jeu, o + TEMPS_DE_SERVICE) + 1);
  animerTousLesQuatrePas(jeu, o);
  if (motSigne(jeu, o + COMPTE) > 0) reste.noter(avancer(jeu, o).y);
  if (decompter(jeu, o) > 0) return 0;

  const d = s16(jeu.appeler(CHERCHER_SON_CHEMIN, o, LIMITE_DU_CHEMIN, SOLS_INTERDITS));
  if (d < 0) {
    if (octet(jeu, o + ETAT_SUIVANT) === TONDRE) {
      poserOctet(jeu, o + ETAT, HORS_DES_ALLEES);
      return 1;
    }
    poserOctet(jeu, o + ETAT, ATTENDRE_UN_CHEMIN);
    poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
    return 1;
  }
  if (d === 4) {
    poserOctet(jeu, o + ETAT, octet(jeu, o + ETAT_SUIVANT));
    if (octet(jeu, o + ETAT) === ALLEES) poserLong(jeu, o + PATIENCE, 0x14);
    jeu.appeler(PRENDRE_LA_FIGURE_DE_MARCHE, o);
    return 1;
  }
  poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
  poserOctet(jeu, o + DIRECTION, d);
  jeu.appeler(PRENDRE_LA_FIGURE_DE_MARCHE, o);
  return 0;
});

// 0x62B9C — attendre la fin de son compte, puis chercher de nouveau un chemin (état 0x24) : s'il
// allait tondre, il passe dans l'état 0x1A (et retournera aux allées) ; sinon, arrivé, il reprend son
// état gardé, sans chemin il reprend son embauche (0x617E0), et avec un chemin il marche (0x22).
// L'original laisse sur la pile l'octet bas du délai qu'il a calculé.
export const attendreUnChemin = avecLeReste((jeu, o, reste) => {
  poserMot(jeu, o + TEMPS_DE_SERVICE, mot(jeu, o + TEMPS_DE_SERVICE) + 1);
  if (motSigne(jeu, o + COMPTE) > 0) animerTousLesQuatrePas(jeu, o);
  if (decompter(jeu, o) > 0) return;

  if (octet(jeu, o + ETAT_SUIVANT) === TONDRE) {
    poserOctet(jeu, o + ETAT, HORS_DES_ALLEES);
    poserOctet(jeu, o + ETAT_SUIVANT, ALLEES);
    jeu.appeler(PRENDRE_LA_FIGURE_DE_MARCHE, o);
    return;
  }
  const d = s16(jeu.appeler(CHERCHER_SON_CHEMIN, o, LIMITE_DU_CHEMIN, SOLS_INTERDITS));
  const delai = delaiParCase(jeu, o);
  reste.noter(delai);
  poserMot(jeu, o + COMPTE, delai);
  if (d === 4) {
    poserOctet(jeu, o + ETAT, octet(jeu, o + ETAT_SUIVANT));
  } else if (d < 0) {
    jeu.appeler(COMMENCER_L_ENTRETIEN, o);
  } else {
    poserOctet(jeu, o + ETAT, MARCHER_VERS_LA_CIBLE);
    poserOctet(jeu, o + DIRECTION, d);
    jeu.appeler(PRENDRE_LA_FIGURE_DE_MARCHE, o);
  }
});

// 0x62CBB — l'agent est hors des allées (état 0x1A) et en cherche une, en spirale autour de lui.
//
// D'abord, selon le sens de la tonte, il note une case voisine dans +0x64 et +0x65 (à droite pour le
// sens 0, en bas pour 1, à gauche pour 2, en haut pour 3 : non établi, et +0x64 est remis à 0 si
// cette case a un sol interdit). Puis, en partant d'un pas à gauche de sa direction, il parcourt des
// segments diagonaux de longueur 1, 1, 2, 2, … 40, 40, en tournant d'un quart à chaque segment : la
// première case d'allée ou de file (index entre 0x42 et 0xE7F) devient sa cible, qu'il rejoindra
// (état 0x22) avant de parcourir les allées (0x18). S'il n'en trouve aucune, il vise la case
// (32, 56), fixe (l'entrée du parc de la démo est en (32, 60) : non établi), et y marche, pour
// reprendre ensuite cet état. Rend 1 s'il a trouvé une allée, 0 sinon.
//
// L'original compte les cases de chaque segment à rebours dans l'octet [ebp-8] : c'est ce qu'il
// laisse sur la pile, 0 s'il n'a rien trouvé, le compte restant sinon.
export const chercherUneAllee = avecLeReste((jeu, o, reste) => {
  poserMot(jeu, o + PAS_DANS_LES_ALLEES, mot(jeu, o + PAS_DANS_LES_ALLEES) + 1);
  const colonne = octet(jeu, o + COLONNE), rangee = octet(jeu, o + RANGEE);
  const voisine = [[1, 0], [0, 1], [-1, 0], [0, -1]][mot(jeu, o + SENS_DE_LA_TONTE)];
  if (voisine) {
    poserOctet(jeu, o + COIN_COLONNE, colonne + voisine[0]);
    poserOctet(jeu, o + COIN_RANGEE, rangee + voisine[1]);
  }
  const coin = cellule(jeu, octetSigne(jeu, o + COIN_RANGEE) * 64 + octetSigne(jeu, o + COIN_COLONNE));
  if (drapeauxDuSol(jeu, coin) & SOLS_INTERDITS) poserOctet(jeu, o + COIN_COLONNE, 0);
  animer(jeu, o);

  let direction = octet(jeu, o + DIRECTION);
  let position = u16(caseDeLObjet(jeu, o) + mot(jeu, PAS_DES_DIRECTIONS + ((direction - 1) & 3) * 2));
  const diagonale = (d) => u16(mot(jeu, PAS_DES_DIRECTIONS + octetSigne(jeu, DIAGONALES + d * 2) * 2)
    + mot(jeu, PAS_DES_DIRECTIONS + octetSigne(jeu, DIAGONALES + d * 2 + 1) * 2));
  for (let longueur = 1; longueur <= 40; longueur++) {
    for (let segments = 2; segments !== 0; segments--, direction = (direction + 1) & 3) {
      for (let n = longueur; n !== 0; n--, position = u16(position + diagonale(direction))) {
        const index = s16(position);
        if (index <= 0x41 || index >= 0xE80) continue;
        if ((octet(jeu, SOLS + octet(jeu, cellule(jeu, index) + 2) * 4) & SOLS_DES_ALLEES) === 0) continue;
        reste.noter(n);
        poserOctet(jeu, o + ETAT, MARCHER_VERS_LA_CIBLE);
        poserOctet(jeu, o + ETAT_SUIVANT, ALLEES);
        viser(jeu, o, index);
        poserMot(jeu, o + COMPTE, 1);
        poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DE_MARCHE + octet(jeu, o + DIRECTION)));
        return 1;
      }
    }
  }
  reste.noter(0);
  poserOctet(jeu, o + ETAT, MARCHER_VERS_LA_CIBLE);
  poserOctet(jeu, o + ETAT_SUIVANT, HORS_DES_ALLEES);
  poserOctet(jeu, o + CIBLE_COLONNE, 0x20);
  poserOctet(jeu, o + CIBLE_RANGEE, 0x38);
  poserOctet(jeu, o + COIN_COLONNE, 0);
  jeu.appeler(PRENDRE_LA_FIGURE_DE_MARCHE, o);
  poserMot(jeu, o + COMPTE, 1);
  return 0;
});

// === Les toilettes ===========================================================================================

// 0x6369E — entrer dans des toilettes (état 0x26) : l'agent avance d'une case vers elles (0x62FEA l'a
// tourné vers elles) ; arrivé au milieu de leur case, il passe dans l'état 0x28. Si elles sont en
// service, leur saleté (+0x3C) est retirée du total du parc (+0x84 de sa fiche) et remise à zéro, et
// le nettoyage dure 8 pas par unité de saleté plus deux fois l'octet +9 de la fiche du décor (non
// établi : 0 pour les toilettes de la démo ?). Rend 1. L'original laisse sur la pile l'octet bas de
// l'abscisse visée.
export const entrerDansLesToilettes = avecLeReste((jeu, o, reste) => {
  animerTousLesQuatrePas(jeu, o);
  reste.noter(avancer(jeu, o).x);
  if (decompter(jeu, o) > 0) return 1;

  poserOctet(jeu, o + ETAT, NETTOYER);
  poserOctet(jeu, o + X, 0x80);
  poserOctet(jeu, o + Y, 0x80);
  const t = jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, cellule(jeu, (octet(jeu, o + RANGEE) << 6) + octet(jeu, o + COLONNE)), TOILETTES) >>> 0;
  if (t > long(jeu, OBJETS_DU_PARC) && octet(jeu, t + ETAT) === EN_SERVICE) {
    const salete = mot(jeu, t + SALETE);
    const fiche = EQUIPEMENTS + mot(jeu, t + GENRE) * TAILLE_EQUIPEMENT;
    poserMot(jeu, o + COMPTE, salete * 8 + octet(jeu, fiche + NETTOYAGE) * 2);
    const parc = long(jeu, PARC_COURANT);
    poserLong(jeu, parc + SALETE_DU_PARC, long(jeu, parc + SALETE_DU_PARC) - salete);
    poserMot(jeu, t + SALETE, 0);
  }
  return 1;
});

// 0x63803 — nettoyer les toilettes (état 0x28) : à la fin du compte, l'agent reprend la direction
// gardée et repart vers la case visée (état 0x22, qui le ramène à l'état gardé, 0x18). Rend 1 à la
// fin, 0 sinon. Il n'écrit rien sur la pile : l'octet d'entrée y reste.
export const nettoyerLesToilettes = avecLeReste((jeu, o) => {
  if (decompter(jeu, o) > 0) return 0;
  poserMot(jeu, o + COMPTE, 0);
  poserOctet(jeu, o + DIRECTION, octet(jeu, o + DIRECTION_GARDEE));
  poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DE_MARCHE + octet(jeu, o + DIRECTION)));
  poserOctet(jeu, o + ETAT, MARCHER_VERS_LA_CIBLE);
  return 1;
});

// === La tournée ==============================================================================================

// 0x63A85 — suivre sa tournée (état 0x30). À chaque case, comme dans les allées (0x62FEA), l'agent
// va d'abord nettoyer les toilettes voisines trop sales (état 0x26). Désigné de nouveau par le
// joueur, il s'arrête (0x645AD). Sinon il marche vers l'étape visée par le chercheur de chemin
// 0x63E5D ; quand il y est (ou ne peut l'atteindre), il vise l'étape suivante (0x648D3), la première
// après la dernière ; une tournée vide le renvoie aux allées (état 0x18). Puis il balaie s'il y a des
// déchets (0x6386F). Rend dans al 1 quand il va aux toilettes ou s'arrête, 0 sinon : c'est aussi
// l'octet qu'il laisse sur la pile.
export const suivreSaTournee = avecLeReste((jeu, o, reste) => {
  const resultat = (() => {
    poserMot(jeu, o + TEMPS_DE_SERVICE, mot(jeu, o + TEMPS_DE_SERVICE) + 1);
    animerTousLesQuatrePas(jeu, o);
    if (motSigne(jeu, o + COMPTE) > 0) avancer(jeu, o);
    if (decompter(jeu, o) > 0) return 0;

    const ici = cellule(jeu, caseDeLObjet(jeu, o));
    for (let d = 0; d < 4; d++) {
      const voisine = ici + pas(jeu, d) * 4;
      if ((drapeauxDuSol(jeu, voisine) & SOL_EQUIPEMENT) === 0) continue;
      const t = jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, voisine, TOILETTES) >>> 0;
      if (t <= long(jeu, OBJETS_DU_PARC) || octet(jeu, t + ETAT) !== EN_SERVICE) continue;
      const seuil = octet(jeu, EQUIPEMENTS + mot(jeu, t + GENRE) * TAILLE_EQUIPEMENT + SEUIL_DE_SALETE) >> 1;
      if (mot(jeu, t + SALETE) <= seuil) continue;
      poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
      poserOctet(jeu, o + CIBLE_COLONNE, octet(jeu, o + COLONNE));
      poserOctet(jeu, o + CIBLE_RANGEE, octet(jeu, o + RANGEE));
      poserOctet(jeu, o + ETAT_SUIVANT, octet(jeu, o + ETAT));
      poserOctet(jeu, o + DIRECTION_GARDEE, octet(jeu, o + DIRECTION));
      if (d !== octet(jeu, o + DIRECTION)) {
        poserOctet(jeu, o + DIRECTION, d);
        poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DE_MARCHE + octet(jeu, o + DIRECTION)));
      }
      poserLong(jeu, o + PATIENCE, 0);
      poserOctet(jeu, o + ETAT, ENTRER_DANS_LES_TOILETTES);
      return 1;
    }

    if (octet(jeu, o + DRAPEAUX) & DESIGNE) {
      jeu.appeler(DESIGNER_POUR_UNE_TOURNEE, o);
      poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
      return 1;
    }
    const d = s16(jeu.appeler(CHEMIN_DE_TOURNEE, o, LIMITE_DU_CHEMIN));
    if (d >= 0 && d <= 3) {
      poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
      poserOctet(jeu, o + DIRECTION, d);
      jeu.appeler(PRENDRE_LA_FIGURE_DE_MARCHE, o);
    } else {
      passerALEtapeSuivante(jeu, o, ETAPE, () => {
        poserOctet(jeu, o + ETAT, ALLEES);
        poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
      });
    }
    jeu.appeler(BALAYER_S_IL_Y_A_DES_DECHETS, o);
    return 0;
  })();
  reste.noter(resultat);
  return resultat;
});

// L'étape suivante de la tournée (le compteur d'étape est l'octet `champ`, +0xAC ou +0xAD) : après la
// dernière, ou après 8, la première ; si la tournée est vide, `tourneeVide`. Le mot de l'étape est lu
// avant le test du compteur à 8 : pour l'étape 8, c'est le mot +0xAC lui-même.
function passerALEtapeSuivante(jeu, o, champ, tourneeVide) {
  poserOctet(jeu, o + champ, octet(jeu, o + champ) + 1);
  if (tournee(jeu, o, octet(jeu, o + champ)) === AUCUNE || octet(jeu, o + champ) === ETAPES) {
    poserOctet(jeu, o + champ, 0);
    if (tournee(jeu, o, octet(jeu, o + champ)) === AUCUNE) {
      tourneeVide();
      return;
    }
  }
  jeu.appeler(VISER_L_ETAPE, o, o + champ);
}

// 0x648D3 — viser l'étape désignée par l'octet `compteur` : sa case devient la cible. Le compte à
// rebours reçoit la vitesse divisée par 256, soit 0 pour toute vitesse (un octet) : anomalie,
// reproduite (0x629DB et les autres calculent 256 divisé par la vitesse). Rend l'adresse de l'agent.
export function viserLEtape(jeu, o, compteur) {
  const etape = tournee(jeu, o, octet(jeu, compteur));
  poserOctet(jeu, o + CIBLE_COLONNE, etape % 64);
  poserOctet(jeu, o + CIBLE_RANGEE, etape >> 6);
  poserMot(jeu, o + COMPTE, quotient(octet(jeu, o + VITESSE), 256));
  return o;
}

// 0x645AD — l'agent désigné par le joueur s'arrête pour recevoir sa tournée (état 0x2C) : l'outil en
// main est mis de côté, son état et sa direction gardés, l'étape visée notée pour le tracé, et sa
// case retenue comme case de départ, et visée. Rend l'adresse de l'agent.
export function designerPourUneTournee(jeu, o) {
  poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) & ~DESIGNE);
  poserMot(jeu, OUTIL_MIS_DE_COTE, mot(jeu, OUTIL));
  poserMot(jeu, OUTIL, 0);
  poserOctet(jeu, o + ETAT_SUIVANT, octet(jeu, o + ETAT));
  poserOctet(jeu, o + DIRECTION_GARDEE, octet(jeu, o + DIRECTION));
  poserOctet(jeu, o + ETAT, TOURNEE_EN_ATTENTE);
  poserOctet(jeu, o + ETAPE_TRACEE, octet(jeu, o + ETAPE));
  poserOctet(jeu, o + CIBLE_COLONNE, octet(jeu, o + COLONNE));
  poserOctet(jeu, o + DEPART_COLONNE, octet(jeu, o + CIBLE_COLONNE));
  poserOctet(jeu, o + CIBLE_RANGEE, octet(jeu, o + RANGEE));
  poserOctet(jeu, o + DEPART_RANGEE, octet(jeu, o + CIBLE_RANGEE));
  return o;
}

// 0x64641 — pendant qu'on lui trace sa tournée (états 0x2C, 0x2E), puis en revenant à sa case de
// départ (0x32). L'agent parcourt sans cesse les étapes déjà posées, à la vitesse 0x80 (deux pas par
// case) et une image d'animation par pas, pour montrer le trajet. Si l'outil 20 n'est plus en main,
// l'état 0x2E redevient 0x2C ; si l'agent n'est plus l'objet choisi, il retourne à sa case de départ
// (0x32), puis y reprend son état et sa direction gardés, à la vitesse 16. À chaque étape atteinte
// (ou hors d'atteinte), il vise la suivante ; la dernière atteinte devient le début du trajet dessiné
// (+0xB0) ; une tournée vide l'arrête (vitesse 0, compte 16). L'original laisse sur la pile l'octet
// bas de l'ordonnée visée, quand il a avancé.
export const tracerSaTournee = avecLeReste((jeu, o, reste) => {
  poserMot(jeu, o + TEMPS_DE_SERVICE, mot(jeu, o + TEMPS_DE_SERVICE) + 1);
  animer(jeu, o);
  if (motSigne(jeu, o + COMPTE) > 0) reste.noter(avancer(jeu, o).y);
  if (decompter(jeu, o) > 0) return;

  if (mot(jeu, OUTIL) !== OUTIL_DE_LA_TOURNEE && octet(jeu, o + ETAT) === TOURNEE_EN_TRACE) {
    poserOctet(jeu, o + ETAT, TOURNEE_EN_ATTENTE);
  }
  if (objetChoisi(jeu) !== (o >>> 0)) {
    poserOctet(jeu, o + CIBLE_COLONNE, octet(jeu, o + DEPART_COLONNE));
    poserOctet(jeu, o + CIBLE_RANGEE, octet(jeu, o + DEPART_RANGEE));
    poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) & ~LONGE);
    poserOctet(jeu, o + ETAT, RETOUR_AU_DEPART);
  }
  if (octet(jeu, o + ETAT) === RETOUR_AU_DEPART && octet(jeu, o + COLONNE) === octet(jeu, o + CIBLE_COLONNE)
      && octet(jeu, o + RANGEE) === octet(jeu, o + CIBLE_RANGEE)) {
    poserOctet(jeu, o + ETAT, octet(jeu, o + ETAT_SUIVANT));
    poserOctet(jeu, o + DIRECTION, octet(jeu, o + DIRECTION_GARDEE));
    jeu.appeler(PRENDRE_LA_FIGURE_DE_MARCHE, o);
    poserOctet(jeu, o + VITESSE, 0x10);
    return;
  }
  poserOctet(jeu, o + VITESSE, 0x80);
  const d = s16(jeu.appeler(CHEMIN_DE_TOURNEE, o, LIMITE_DU_CHEMIN));
  if (d >= 0 && d <= 3) {
    poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
    poserOctet(jeu, o + DIRECTION, d);
    jeu.appeler(PRENDRE_LA_FIGURE_DE_MARCHE, o);
    return;
  }
  if (d === 4) poserOctet(jeu, o + DEBUT_DU_TRAJET, octet(jeu, o + ETAPE_TRACEE));
  passerALEtapeSuivante(jeu, o, ETAPE_TRACEE, () => {
    poserOctet(jeu, o + VITESSE, 0);
    poserMot(jeu, o + COMPTE, 0x10);
  });
});

// 0x63E5D — le chemin de la tournée : la direction à prendre vers la case visée, 4 si l'agent y
// est, −1 s'il est enfermé, −2 si la case visée est hors d'atteinte. Contrairement à 0x349EB, il ne
// regarde que la case voisine, et contourne les obstacles en les longeant :
//   - il va d'abord dans la direction qui réduit le plus grand des deux écarts (la colonne à égalité
//     près) ; si la case voisine est une allée ou une file, c'est la réponse ;
//   - sinon, il cherche, dans l'alignement de la cible, la première case d'allée au-delà de
//     l'obstacle (en suivant le plus grand écart à chaque pas) ; puis il fait partir deux
//     explorateurs de sa case, l'un longeant l'obstacle main gauche, l'autre main droite, `limite`
//     pas au plus ; le premier qui atteint cette case gagne : l'agent retient son premier pas, le côté
//     (drapeau 0x10 ou 0x20 de +5) et cette case (+0x71), où il cessera de longer l'obstacle ;
//   - si un explorateur revient à son départ dans sa première direction, l'obstacle est fermé : il
//     cherche une case d'allée plus loin dans l'alignement de la cible ;
//   - tant qu'il longe l'obstacle, il tourne d'abord vers l'obstacle, puis s'en écarte d'un quart
//     de tour à la fois jusqu'à une case d'allée.
// Rend eax entier, tel que l'original.
// Défaut d'origine : rien ne garantit qu'il retrouve la case de reprise. Dévié du trajet de
// l'éclaireur (la formation qui change sa vitesse au milieu d'une case, les toilettes, la grève), il
// longe un autre pâté sans fin. Le réglage des déplacements du personnel (corrections.js) lui fait
// alors cesser de longer et refaire son plan (repriseEnVue).
export function cheminDeTournee(jeu, o, limite) {
  const colonne = octet(jeu, o + COLONNE), rangee = octet(jeu, o + RANGEE);
  const cibleColonne = octet(jeu, o + CIBLE_COLONNE), cibleRangee = octet(jeu, o + CIBLE_RANGEE);
  const cesserDeLonger = () => poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) & ~LONGE);
  if (cibleColonne === colonne && cibleRangee === rangee) {
    cesserDeLonger();
    return 4;
  }
  const grille = long(jeu, GRILLE);
  const departIndex = rangee * 64 + colonne;
  const ici = grille + departIndex * 4;
  const allee = (c) => (octet(jeu, SOLS + octet(jeu, c + 2) * 4) & SOLS_DES_ALLEES) !== 0;

  // Longer l'obstacle : partir de la direction d, s'en écarter jusqu'à une case d'allée.
  const longer = (d) => {
    for (let essais = 4; essais !== 0; essais--) {
      if (allee(ici + pas(jeu, d) * 4)) return d;
      d = (d + ((octet(jeu, o + DRAPEAUX) & LONGE_A_GAUCHE) ? 1 : -1)) & 3;
    }
    cesserDeLonger();
    return -1;
  };

  if (octet(jeu, o + DRAPEAUX) & LONGE) {
    if (grille + mot(jeu, o + REPRISE) * 4 !== ici
        // hors du jeu d'origine : corrections.js, éteint par défaut
        && !cesserDeLongerSansIssue(() => repriseEnVue(jeu, o, departIndex, limite))) {
      return longer((octet(jeu, o + DIRECTION) + ((octet(jeu, o + DRAPEAUX) & LONGE_A_GAUCHE) ? -1 : 1)) & 3);
    }
    cesserDeLonger();
  }

  // La direction qui réduit le plus grand écart, d'une case (colonne, rangée) à la cible.
  const versLaCible = (dc, dr, sinon) => {
    if (Math.abs(dc) > Math.abs(dr)) return dc > 0 ? 3 : 1;
    if (dr !== 0) return dr > 0 ? 0 : 2;
    return sinon;
  };
  let dc = s16(colonne - cibleColonne), dr = s16(rangee - cibleRangee);
  const d = versLaCible(dc, dr, undefined);   // dc et dr ne sont jamais nuls tous les deux ici
  if (allee(ici + pas(jeu, d) * 4)) return d;
  if (dc === 0 && dr === 0) return -2;

  let au_dela = ici + pas(jeu, d) * 4;
  for (;;) {
    // Un pas de plus vers la cible, jusqu'à une case d'allée.
    const n = (au_dela - grille) >> 2;
    dc = s16((n % 64) - cibleColonne);
    dr = s16(((n / 64) | 0) - cibleRangee);
    const pasVersLaCible = versLaCible(dc, dr, null);
    if (pasVersLaCible !== null) au_dela += pas(jeu, pasVersLaCible) * 4;
    if (!allee(au_dela)) {
      if (dc === 0 && dr === 0) return -2;
      continue;
    }

    // Les deux explorateurs.
    const cible = (au_dela - grille) >> 2;
    let gauche = departIndex, droite = departIndex;
    let dGauche = (d + 1) & 3, dDroite = (d - 1) & 3;
    let premierGauche = 0, premierDroite = 0;
    let ferme = false;
    for (let i = 0; u16(i) < u16(limite); i++) {
      dGauche = (dGauche - 1) & 3;
      dDroite = (dDroite + 1) & 3;
      for (let essais = 4; essais !== 0; essais--) {
        if ((drapeauxDuSol(jeu, grille + (gauche + pas(jeu, dGauche)) * 4) & SOLS_DES_ALLEES) === 0) dGauche = (dGauche + 1) & 3;
        if ((drapeauxDuSol(jeu, grille + (droite + pas(jeu, dDroite)) * 4) & SOLS_DES_ALLEES) === 0) dDroite = (dDroite - 1) & 3;
      }
      if (i === 0) {
        premierGauche = dGauche;
        premierDroite = dDroite;
      }
      gauche = u16(gauche + pas(jeu, dGauche));
      droite = u16(droite + pas(jeu, dDroite));
      if (gauche === cible) {
        poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) | LONGE_A_GAUCHE);
        poserMot(jeu, o + REPRISE, gauche);
        return longer(premierGauche);
      }
      if (droite === cible) {
        poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) | LONGE_A_DROITE);
        poserMot(jeu, o + REPRISE, droite);
        return longer(premierDroite);
      }
      if ((gauche === departIndex && dGauche === premierGauche) || (droite === departIndex && dDroite === premierDroite)) {
        ferme = true;
        break;
      }
    }
    if (!ferme) return -2;
    if (dc === 0 && dr === 0) return -2;
  }
}

// Hors du jeu d'origine (corrections.js, le réglage des déplacements du personnel) : l'agent qui longe
// un obstacle retrouve-t-il sa case de reprise (+0x71) en continuant de le longer depuis la case
// `depart`, dans sa direction, en `limite` pas au plus ? Chaque pas suit la règle de 0x63E5D : un quart
// de tour vers l'obstacle, puis s'en écarter jusqu'à une case d'allée.
function repriseEnVue(jeu, o, depart, limite) {
  const grille = long(jeu, GRILLE);
  const aGauche = (octet(jeu, o + DRAPEAUX) & LONGE_A_GAUCHE) !== 0;
  const reprise = mot(jeu, o + REPRISE);
  const allee = (index) => (octet(jeu, SOLS + octet(jeu, grille + index * 4 + 2) * 4) & SOLS_DES_ALLEES) !== 0;
  let position = depart, direction = octet(jeu, o + DIRECTION);
  for (let n = 0; n < u16(limite); n++) {
    let d = (direction + (aGauche ? -1 : 1)) & 3, essais = 4;
    while (!allee(position + pas(jeu, d))) {
      if (--essais === 0) return false;
      d = (d + (aGauche ? 1 : -1)) & 3;
    }
    position += pas(jeu, d);
    direction = d;
    if (position === reprise) return true;
  }
  return false;
}

// === Les commandes du joueur, et le trajet sur la carte ============================================================

// 0x64387 — un clic dans la fenêtre de l'agent d'entretien (appelée par 0x15FBD) :
//   - zone 16 : pendant le tracé (0x2C, 0x2E), la tournée est lancée : l'outil mis de côté revient,
//     l'agent retourne à sa case de départ (0x32), et une tournée d'une seule étape est effacée ;
//     dans les allées, en balayant ou en tournée (0x18, 0x1C, 0x30), il est désigné (drapeau 2) ;
//   - zone 21 : l'outil 20 est pris (0x2C → 0x2E) ou reposé (0x2E → 0x2C) ;
//   - zone 17 : la tournée est effacée (8 mots à −1), l'outil reposé, et l'agent revient viser sa
//     case de départ, à l'étape 0.
// Le pointeur prend l'image de l'outil en main.
export function commandeDeLaTournee(jeu, zone, o) {
  const etat = octet(jeu, o + ETAT);
  switch (zone & 0xFF) {
    case 0x10:
      if (etat === TOURNEE_EN_ATTENTE || etat === TOURNEE_EN_TRACE) {
        poserMot(jeu, OUTIL, mot(jeu, OUTIL_MIS_DE_COTE));
        poserOctet(jeu, o + CIBLE_COLONNE, octet(jeu, o + DEPART_COLONNE));
        poserOctet(jeu, o + CIBLE_RANGEE, octet(jeu, o + DEPART_RANGEE));
        poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) & ~LONGE);
        poserOctet(jeu, o + ETAT, RETOUR_AU_DEPART);
        if (tournee(jeu, o, 1) === AUCUNE) poserMot(jeu, o + TOURNEE, AUCUNE);
      } else if (etat === ALLEES || etat === BALAYER || etat === SUIVRE_SA_TOURNEE) {
        poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) | DESIGNE);
      }
      changerLeCurseurSelonLOutil(jeu);
      return;
    case 0x15:
      if (etat === TOURNEE_EN_TRACE) {
        poserOctet(jeu, o + ETAT, TOURNEE_EN_ATTENTE);
        poserMot(jeu, OUTIL, 0);
        changerLeCurseurSelonLOutil(jeu);
      } else if (etat === TOURNEE_EN_ATTENTE) {
        poserOctet(jeu, o + ETAT, TOURNEE_EN_TRACE);
        poserMot(jeu, OUTIL, OUTIL_DE_LA_TOURNEE);
        changerLeCurseurSelonLOutil(jeu);
      }
      return;
    case 0x11:
      if (etat !== TOURNEE_EN_ATTENTE && etat !== TOURNEE_EN_TRACE) return;
      if (etat === TOURNEE_EN_TRACE) poserOctet(jeu, o + ETAT, TOURNEE_EN_ATTENTE);
      jeu.appeler(REMPLIR, o + TOURNEE, 0xFF, ETAPES * 2);
      poserMot(jeu, OUTIL, 0);
      changerLeCurseurSelonLOutil(jeu);
      poserOctet(jeu, o + ETAPE, 0);
      poserOctet(jeu, o + CIBLE_COLONNE, octet(jeu, o + DEPART_COLONNE));
      poserOctet(jeu, o + CIBLE_RANGEE, octet(jeu, o + DEPART_RANGEE));
      return;
    default:
  }
}

// 0x64CF5 — l'événement 0x2C : un clic de l'outil 20 sur la case `numero`. Sur une allée ou une file,
// elle devient la première étape libre de la tournée ; la huitième posée (ou une tournée déjà
// pleine) repose l'outil (état 0x2C).
export function ajouterUneEtape(jeu, numero, o) {
  if ((octet(jeu, SOLS + octet(jeu, cellule(jeu, u16(numero)) + 2) * 4) & SOLS_DES_ALLEES) === 0) return;
  let i = 0;
  for (; i < ETAPES; i++) {
    if (tournee(jeu, o, i) === AUCUNE) {
      poserMot(jeu, o + TOURNEE + i * 2, numero);
      break;
    }
  }
  if (i < ETAPES - 1) return;
  poserOctet(jeu, o + ETAT, TOURNEE_EN_ATTENTE);
  poserMot(jeu, OUTIL, 0);
  changerLeCurseurSelonLOutil(jeu);
}

// 0x64940 — dessiner sur la carte le trajet de la tournée de l'agent (appelée par le dessin du parc,
// 0x1B837, pour l'objet choisi dans l'état 0x2C ou 0x2E) : d'étape en étape en partant de +0xB0,
// jusqu'à y revenir, chaque tronçon tracé par 0x64AC7 ; un tronçon qui bute part de là où il s'est
// arrêté. Avec `sousLeCurseur` (l'outil 20 en main, vraisemblablement), la case sous le pointeur est
// marquée aussi, et devient la case visée (0xD6662, 0xD666A).
export function dessinerLaTournee(jeu, o, sousLeCurseur) {
  if (tournee(jeu, o, 0) !== AUCUNE) {
    let k = octet(jeu, o + DEBUT_DU_TRAJET);
    let depuis = tournee(jeu, o, k);
    if (depuis !== AUCUNE) {
      k = (k + 1) & 0xFF;
      for (;;) {
        if (tournee(jeu, o, k) === AUCUNE || k === ETAPES) k = 0;
        const vers = tournee(jeu, o, k);
        if (vers !== AUCUNE) {
          const arret = u16(jeu.appeler(TRACER_UN_TRONCON, depuis, vers));
          depuis = arret !== 0 ? arret : vers;
        }
        if (k === octet(jeu, o + DEBUT_DU_TRAJET)) break;
        k = (k + 1) & 0xFF;
      }
      jeu.appeler(TRACER_UN_TRONCON, depuis, tournee(jeu, o, k));
    }
  }
  if ((sousLeCurseur & 0xFF) === 0) return;
  const largeur = mot(jeu, LARGEUR_TUILE);
  const x = motSigne(jeu, SOURIS_X) - motSigne(jeu, ORIGINE_X) - quotient(motSigne(jeu, SOURIS_Y), 2);
  poserMot(jeu, COLONNE_VISEE, quotient(largeur * 10 + x, largeur) - 10);
  poserMot(jeu, RANGEE_VISEE, quotient(motSigne(jeu, SOURIS_Y), mot(jeu, HAUTEUR_TUILE)));
  const colonne = s16(mot(jeu, COLONNE_VISEE) + mot(jeu, CAMERA_COLONNE));
  const rangee = s16(mot(jeu, RANGEE_VISEE) + mot(jeu, CAMERA_RANGEE));
  jeu.appeler(MARQUER_UNE_CASE, colonne, rangee, SOLS_DES_ALLEES, COULEUR_SOUS_LE_POINTEUR);
}

// 0x64AC7 — tracer un tronçon du trajet, de la case `depart` à la case `arrivee` : l'objet choisi est
// posé en pensée sur la case de départ, et, tant que le chemin de la tournée (0x63E5D) donne une
// direction, chaque case parcourue est marquée (0x64D9A) ; puis l'objet retrouve sa case, sa cible,
// ses drapeaux, sa case de reprise et sa direction. Rend 0, ou, si le chemin a échoué (−1 ou −2),
// la case où il s'est arrêté, sur 32 bits comme l'original l'a calculée. Un tronçon d'une case marque
// cette case seule.
export function tracerUnTroncon(jeu, depart, arrivee) {
  if (u16(depart) === u16(arrivee)) {
    jeu.appeler(MARQUER_UNE_CASE, u16(depart) % 64, u16(depart) >> 6, SOLS_DES_ALLEES, 0);
    return 0;
  }
  const o = objetChoisi(jeu);
  const sa = {
    case: caseDeLObjet(jeu, o),
    cible: u16((octet(jeu, o + CIBLE_RANGEE) << 6) + octet(jeu, o + CIBLE_COLONNE)),
    drapeaux: octet(jeu, o + DRAPEAUX),
    reprise: mot(jeu, o + REPRISE),
    direction: octet(jeu, o + DIRECTION),
  };
  const poser = (champColonne, champRangee, index) => {
    poserOctet(jeu, o + champColonne, u16(index) % 64);
    poserOctet(jeu, o + champRangee, u16(index) >> 6);
  };
  let position = depart | 0;
  poser(COLONNE, RANGEE, position);
  poser(CIBLE_COLONNE, CIBLE_RANGEE, arrivee);
  poserOctet(jeu, o + DRAPEAUX, 0);
  poserOctet(jeu, o + DIRECTION, jeu.appeler(CHEMIN_DE_TOURNEE, o, LIMITE_DU_CHEMIN));
  while (octet(jeu, o + DIRECTION) <= 3) {
    jeu.appeler(MARQUER_UNE_CASE, octet(jeu, o + COLONNE), octet(jeu, o + RANGEE), SOLS_DES_ALLEES, 0);
    position = (position + mot(jeu, PAS_DES_DIRECTIONS + octet(jeu, o + DIRECTION) * 2)) | 0;
    poser(COLONNE, RANGEE, position);
    poserOctet(jeu, o + DIRECTION, jeu.appeler(CHEMIN_DE_TOURNEE, o, LIMITE_DU_CHEMIN));
  }
  const resultat = octet(jeu, o + DIRECTION) > 4 ? position : 0;
  poser(COLONNE, RANGEE, sa.case);
  poser(CIBLE_COLONNE, CIBLE_RANGEE, sa.cible);
  poserOctet(jeu, o + DRAPEAUX, sa.drapeaux);
  poserMot(jeu, o + REPRISE, sa.reprise);
  poserOctet(jeu, o + DIRECTION, sa.direction);
  return resultat;
}

// 0x64D9A — marquer une case du trajet sur la carte : la marque de l'étape (figure 0xD3) tracée en
// silhouette d'une couleur. Sur un sol des `sols` demandés : noire (0) en général, clignotante sur
// l'étape visée (0xBC et 0x18, un pas sur deux), ou la `couleur` donnée si elle n'est pas nulle ;
// ailleurs, 0x15. La position à l'écran est celle de la vue en perspective du parc : la colonne
// avance de la largeur d'une case, la rangée d'un tiers de largeur et d'une hauteur de case.
export function marquerUneCase(jeu, colonne, rangee, sols, couleur) {
  const o = objetChoisi(jeu);
  const numero = u16(colonne + (rangee << 6));
  const largeur = mot(jeu, LARGEUR_TUILE);
  const x = u16(Math.imul(s16(colonne) - motSigne(jeu, CAMERA_COLONNE), largeur) + motSigne(jeu, ORIGINE_X)
    + Math.imul((largeur / 3) | 0, s16(rangee) - motSigne(jeu, CAMERA_RANGEE)));
  const y = u16(Math.imul(u16(rangee - mot(jeu, CAMERA_RANGEE)), mot(jeu, HAUTEUR_TUILE)));
  let teinte;
  if (drapeauxDuSol(jeu, cellule(jeu, numero)) & u16(sols)) {
    teinte = tournee(jeu, o, octet(jeu, o + ETAPE_TRACEE)) === numero
      ? COULEUR_DE_L_ETAPE_VISEE[octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 1] : 0;
    if ((couleur & 0xFF) !== 0) teinte = couleur & 0xFF;
  } else {
    teinte = COULEUR_HORS_DES_ALLEES;
  }
  poserMot(jeu, DRAPEAUX_TRACEUR, 0x40);
  const graphique = long(jeu, OBJETS_GRAPHIQUES) + figure(jeu, FIGURE_DE_L_ETAPE) * 8;
  const morceau = long(jeu, MORCEAUX) + mot(jeu, graphique) * 10;
  jeu.appeler(SILHOUETTE, x, y, long(jeu, IMAGES) + mot(jeu, morceau), teinte);
  poserMot(jeu, DRAPEAUX_TRACEUR, 0);
}

// --- VÉRIFICATION ----------------------------------------------------------------------------------------
//
// Comparaison appel par appel (comparer.mjs --modules entretien), 0 divergence : entretien (60 s),
// longue-faillite (300 s), longue-simulation (350 s), outils-basse (251 s, --echantillon 4). Les 23
// fonctions y sont appelées : la tonte par entretien, longue-faillite et outils-basse (l'agent au sens
// de tonte 0x05AB, le reste de pile relu, par longue-faillite), 0x62B9C par longue-faillite seul,
// 0x62CBB par longue-faillite et longue-simulation, les toilettes par longue-simulation seul, la
// tournée par entretien et outils-basse.
// Rejeu empoisonné (verifier.mjs --empoisonner --modules entretien) : IDENTIQUE sur les 34 scénarios
// de travail/verifier-tout.ps1, chacun avec sa durée ; longue-faillite aussi avec --graine 7, et avec
// les 43 modules terminés installés en plus.
//
// Réserve : la tonte appelle 0x18A44, 0x349EB (simulation-outils.js) et 0x617E0 (simulation.js) à la
// hauteur de l'original, mais leurs réécritures ne laissent pas sur la pile ce qu'y laissait
// l'original (l'ebp sauvé par 0x349EB, que 0x61F81 relit pour un sens de tonte au-delà de 3). Seule
// la comparaison appel par appel du module seul voit ce reste ; le rejeu de longue-faillite, où
// l'agent au sens 0x05AB finit de toute façon par reprendre son embauche, ne le distingue pas.

// Les fonctions qui écrivent dans l'agent seul déclarent sa fiche (`zones`) ; celles qui appellent le
// déplacement, les chemins ou l'embauche, qui écrivent ailleurs dans le tas (les listes des cases, la
// carte), demandent la mémoire entière.
const agent = (jeu, o) => [[o >>> 0, (o >>> 0) + TAILLE_OBJET]];
const agentChoisi = (jeu) => [[objetChoisi(jeu), objetChoisi(jeu) + TAILLE_OBJET]];
const ETAT_DE_L_AGENT = { arguments: 1, memoire: 'entiere' };

export const reecritures = [
  { adresse: 0x619BF, nom: 'tondre', fn: tondre, ...ETAT_DE_L_AGENT },
  { adresse: 0x61BEC, nom: 'orienterLaTondeuse', fn: orienterLaTondeuse, arguments: 1, zones: agent },
  { adresse: 0x61CF1, nom: 'casesRestantes', fn: casesRestantes, arguments: 1 },
  { adresse: 0x61DE9, nom: 'chercherDansLaBande', fn: chercherDansLaBande, arguments: 1, memoire: 'entiere' },
  { adresse: 0x61F81, nom: 'changerDeBande', fn: changerDeBande, arguments: 1, memoire: 'entiere' },
  { adresse: 0x627D3, nom: 'premiereHerbeATondre', fn: premiereHerbeATondre, arguments: 3, retour: true },
  { adresse: 0x6284C, nom: 'tondreLaCase', fn: tondreLaCase, arguments: 1, memoire: 'entiere' },
  { adresse: 0x62913, nom: 'situerDansLaParcelle', fn: situerDansLaParcelle, arguments: 3 },
  { adresse: 0x629DB, nom: 'marcherVersLaCibleDeLAgent', fn: marcherVersLaCibleDeLAgent, ...ETAT_DE_L_AGENT },
  { adresse: 0x62B9C, nom: 'attendreUnChemin', fn: attendreUnChemin, ...ETAT_DE_L_AGENT },
  { adresse: 0x62CBB, nom: 'chercherUneAllee', fn: chercherUneAllee, ...ETAT_DE_L_AGENT, retour: true },
  { adresse: 0x6369E, nom: 'entrerDansLesToilettes', fn: entrerDansLesToilettes, ...ETAT_DE_L_AGENT, retour: true },
  { adresse: 0x63803, nom: 'nettoyerLesToilettes', fn: nettoyerLesToilettes, arguments: 1, retour: true, zones: agent },
  { adresse: 0x63A85, nom: 'suivreSaTournee', fn: suivreSaTournee, ...ETAT_DE_L_AGENT },
  { adresse: 0x63E5D, nom: 'cheminDeTournee', fn: cheminDeTournee, arguments: 2, retour: true, zones: agent },
  { adresse: 0x64387, nom: 'commandeDeLaTournee', fn: commandeDeLaTournee, arguments: 2, zones: (jeu, zone, o) => agent(jeu, o) },
  { adresse: 0x645AD, nom: 'designerPourUneTournee', fn: designerPourUneTournee, arguments: 1, retour: true, zones: agent },
  { adresse: 0x64641, nom: 'tracerSaTournee', fn: tracerSaTournee, ...ETAT_DE_L_AGENT },
  { adresse: 0x648D3, nom: 'viserLEtape', fn: viserLEtape, arguments: 2, retour: true, zones: agent },
  { adresse: 0x64940, nom: 'dessinerLaTournee', fn: dessinerLaTournee, arguments: 2, zones: agentChoisi },
  { adresse: 0x64AC7, nom: 'tracerUnTroncon', fn: tracerUnTroncon, arguments: 2, retour: true, zones: agentChoisi },
  { adresse: 0x64CF5, nom: 'ajouterUneEtape', fn: ajouterUneEtape, arguments: 2, zones: (jeu, numero, o) => agent(jeu, o) },
  { adresse: 0x64D9A, nom: 'marquerUneCase', fn: marquerUneCase, arguments: 4 },
];

export const enAttente = [];
