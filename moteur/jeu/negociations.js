// Les négociations : l'écran où l'on marchande les salaires avec le syndicat du personnel ou les
// prix avec les fournisseurs, et la grève qui suit un échec avec le syndicat.
//
// Réécriture lisible de 0x44EA5 (l'écran), 0x46F27 (la réponse de l'adversaire), 0x11601 (la copie
// d'un rectangle du fond, qui ne sert qu'à cet écran), et des trois états de la grève des employés :
// 0x3502B, 0x35208, 0x3542D. Voir docs/guide-reecriture.md.
//
// LA NÉGOCIATION (0x44EA5, argument 2 le personnel, 4 les fournisseurs). Elle s'ouvre par F8 et la
// touche 8 dans le parc (0x11C45 et 0x13BF3), ou d'elle-même, par la simulation (0x12B1F,
// economie.js), et tourne dans sa propre boucle d'images, sans toucher à l'écran courant [0xD6652].
// On y marchande un pourcentage, en dixièmes de point : l'offre du joueur [0xD77FC] monte de 2 par
// image quand on tient le bouton gauche à droite de sa main, et baisse de 2 à gauche. L'adversaire
// part d'une demande [0xD7804] et la baisse, à chaque dixième du temps, selon les gestes du joueur
// (0x46F27). L'offre ne peut dépasser la demande ; quand elle l'atteint, c'est l'accord. Le temps
// est un gâteau de dix parts qu'on mange une à une (620 images, une vingtaine de secondes) ; à la
// fin, c'est l'échec. Les bornes : [0xD77F8], le plancher, et [0xD7800] = plancher + 500. Le
// plancher vaut −150 à la première séance (le joueur peut proposer une baisse de 15 %), puis
// 25 × séances − 75, au plus 0, pour les séances suivantes d'une négociation qui traîne (comptes
// +0x682 le personnel, +0x683 les fournisseurs).
//
// L'accord applique la hausse à tous les salaires du catalogue des métiers (ou à tous les prix
// d'achat des marchandises) et à l'indice de la fiche du parc (+0xCA les salaires, +0xE5 les prix,
// 100 au départ) ; il met fin à la grève (les grévistes passent en 0x3E). L'échec du personnel
// déclenche la grève : chaque employé (objet de type 8) qui n'y est pas déjà et n'est pas marqué
// du bit 3 de +5 note sa case en +0x4D et part vers l'entrée du parc (état 0x3A). L'échec avec les
// fournisseurs suspend les livraisons (l'entrepôt, dialogues.js, refuse alors les commandes). Une
// négociation ratée revient un mois plus tard (economie.js), tant qu'elle n'a pas abouti.
//
// LA GRÈVE, trois états d'un employé, confiés à chaque pas par la mise à jour des objets (0x21681) :
//   0x3A  0x3502B  aller à l'entrée du parc ; arrivé, manifester (0x3C)
//   0x3C  0x35208  manifester : aller et venir le long de la route, autour de l'entrée
//   0x3E  0x3542D  la grève finie, revenir à sa case (+0x4D), puis reprendre l'état d'embauche
// L'état suivant dans le programme, 0x3F (0x35652), n'est pas celui d'un gréviste : c'est celui de
// l'amuseur qu'un voyou fait fuir, réécrit dans voyous.js.
//
// VÉRIFICATION. docs/retro-ingenierie.md, § 10.15 ; les scénarios qui exercent ce module :
// negociations.json, horza-objets.json, longue-faillite.json, voyous-arrestation.json.

import { Cadre, dansLeCadre } from './cadre.js';
import { recalerAuMilieuDeLaCase } from './corrections.js';   // hors du jeu d'origine (reglages.js)

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
// `idiv` : division entière signée tronquée vers zéro ; un diviseur nul arrêtait le programme.
function quotient(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}
function reste(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) % (b | 0)) | 0;
}

const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setInt32(a >>> 0, v | 0, true);

// --- les variables du jeu ----------------------------------------------------------------------
const MODE = 0xDE5F6;                 // bit 0 : 320x200 ; sinon 640x480
const SURFACE = 0xDE5BC;              // pointeur : l'image en construction
const FOND = 0xD3B98;                 // pointeur : le tampon de fond
const ECRAN = 0xD6652;                // mot : l'écran ouvert
const ECRAN_PRECEDENT = 0xD660E;      // mot
const ECRAN_A_ROUVRIR = 0xB9EDD;      // octet : l'écran d'où l'on vient, rouvert en sortant
const BASSE_FORCEE = 0xB1510;         // octet : 0x1171F a déjà basculé en 320x200
const IMAGE_DU_CURSEUR = 0xBECB8;     // pointeur : l'image courante du pointeur
const CURSEURS = 0xD3B84;             // pointeur : les images du pointeur (+0x72 la flèche vers la
                                      // droite, +0x78 vers la gauche, non établi)
const TEXTES = 0xD7BC0;               // pointeur : table de pointeurs de textes
const PALETTE_DE_L_ECRAN = 0xCEBE0;   // la palette des écrans pleins, chargée avec leur fond
const COMPTES_COURANTS = 0xD3814;     // pointeur : les comptes du joueur (fiche de 0x6C2 octets)
const PARC_COURANT = 0xD3818;         // pointeur : la fiche du parc du joueur
const PAS_DE_SIMULATION = 0xD3AFC;    // long : le temps du jeu, 1 000 pas par mois
const SEANCE_DU_PERSONNEL = 0xD3BB0, SEANCE_DES_FOURNISSEURS = 0xD3BAC;  // longs (economie.js)
const OBJETS_DU_PARC = 0xD3B10, FIN_DES_OBJETS_DU_PARC = 0xD3B78, TAILLE_OBJET = 200;

// Les comptes du joueur.
const SEANCES_PERSONNEL = 0x682, SEANCES_FOURNISSEURS = 0x683;  // octets : séances ratées, 0 hors
                                                                // négociation
const EN_GREVE = 0x681;               // octet : la grève en cours
const SALAIRE_DES_AMUSEURS = 0x613;   // mot : le plus bas des salaires d'amuseur (au minimum)
const SALAIRE_DU_MECANICIEN = 0x617;  // mot
const SALAIRE_DE_L_AGENT = 0x615;     // mot : l'agent d'entretien
const ENTREE_DU_PARC = 0x2CA;         // mot : la case de l'entrée (rangée × 64 + colonne)
// La fiche du parc.
const DERNIERE_SEANCE_PERSONNEL = 0xC6, INDICE_DES_SALAIRES = 0xCA;      // long, mot signé
const DERNIERE_SEANCE_FOURNISSEURS = 0xE1, INDICE_DES_PRIX = 0xE5;       // long, mot signé

// Le catalogue des métiers (personnel.js) : 0xD35C0 + métier × 0x36 ; la liste s'arrête sur un mot
// +0x22 nul.
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;
const METIER_FIN = 0x22, METIER_SALAIRE = 0x24, METIER_MARCHE = 0x26, METIER_ATTENTE = 0x28;
const METIER_ETAT_D_EMBAUCHE = 0x2C;
const AMUSEUR = 2, MECANICIEN = 8, AGENT_D_ENTRETIEN = 0x16;   // leurs états d'embauche

// Les marchandises (dialogues.js) : 0xD3C00, 14 octets, +2 le prix unitaire. Les boutiques :
// 0xD3C62, 0x6B octets, jusqu'à un mot +0x22 nul ; +0x25 un octet (8 : non établi, une boutique
// dont les prix ne suivent pas ; ecrans-achat.js y voit les jeux d'adresse ?) ; +0x4D le coût d'une
// marchandise, +0x4F le prix de vente (ecrans-achat.js) ; +0x67 la marchandise vendue, −1 aucune.
const MARCHANDISES = 0xD3C00, TAILLE_MARCHANDISE = 0xE, MARCHANDISE_PRIX = 2;
const BOUTIQUES = 0xD3C62, TAILLE_BOUTIQUE = 0x6B;
const BOUTIQUE_FIN = 0x22, BOUTIQUE_GENRE = 0x25, BOUTIQUE_COUT = 0x4D, BOUTIQUE_PRIX = 0x4F;
const BOUTIQUE_MARCHANDISE = 0x67;
const SANS_PRIX_A_SUIVRE = 8;

// La négociation en cours. Tous les montants en dixièmes de point de pourcentage.
const PLANCHER = 0xD77F8;             // long : la plus basse offre possible
const PLAFOND = 0xD7800;              // long : plancher + 500
const SEUIL_GENEREUX = 0xD77EC;       // long : plancher + 400, au-delà l'adversaire cède plus vite
const OFFRE = 0xD77FC;                // long : l'offre du joueur
const DEMANDE = 0xD7804;              // long : la demande de l'adversaire
const OFFRE_DE_DEPART = 0xD77E0;      // long : jamais relu ici
const DEMANDE_PRECEDENTE = 0xD77F4;   // long
const OFFRE_A_LA_DERNIERE_REPONSE = 0xD77F0;  // long
const ECART_DE_DEPART = 0xD77E4;      // long : demande − offre au départ, 500
const ETENDUE = 0xD77E8;              // long : plafond − plancher
const LARGEUR_DES_BARRES = 0xD780A;   // mot : la place des deux barres, en pixels
const ECHELLE = 0xD780C;              // mot : l'étendue × 128 / largeur des barres
const OBSTINATION = 0xD7808;          // mot signé, 0 à 8 : voir repondre (0x46F27). ANOMALIE : ni
                                      // 0x44EA5 ni rien d'autre ne le remet à zéro, il passe d'une
                                      // négociation à l'autre (non établi : une remise ailleurs)
const DERNIER_GESTE = 0xD77D8;        // long : |offre − offre à la dernière réponse|
const GESTE_PRECEDENT = 0xD77D4;      // long
const VARIATION_DU_GESTE = 0xD77D0;   // long : écrit, jamais relu (non établi)
const BONUS_D_INDICE = 0xD77DC;       // long

// La souris.
const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;         // mots signés
const DROIT_APPUI = 0xDE5A4, GAUCHE_APPUI = 0xDE5A6;
const DROIT_TENU = 0xDE5AA, GAUCHE_TENU = 0xDE5AC;
// Le pointeur immobile : sa dernière position et le nombre d'images depuis qu'il n'a pas bougé.
const POINTEUR_GARDE_X = 0xB9180, POINTEUR_GARDE_Y = 0xB9182, IMAGES_SANS_BOUGER = 0xB9184;

// Le son.
const MUSIQUE_PERMISE = 0xBA715;      // octet : la musique allumée, que bascule MUSIQUE (§ 11.10)
const BRUITAGES_PRETS = 0xBA720, BRUITAGES_ACTIFS = 0xBA721;
const MORCEAU_DE_LA_NEGOCIATION = 0x12;
const BRUITAGE_DE_L_ECHEC = 0xC, BRUITAGE_DE_L_ACCORD = 0x27;

// Les banques d'images. L'écran charge data/mhand-0.dat et .tab à la place de la banque des
// sprites [0xD3BB8], qu'il remet en partant (data/mspr-0.dat et .tab) ; [0xD3B1C] désigne la banque
// dont se sert le dessin d'une image (0x20F4C).
const BANQUE_DES_SPRITES = 0xD3BB8, FIN_DES_SPRITES = 0xD3B88, DONNEES_DES_SPRITES = 0xD3BA8;
const BANQUE_DE_DESSIN = 0xD3B1C, FIN_DE_DESSIN = 0xD3B28, DONNEES_DE_DESSIN = 0xD3B14;
const DONNEES_BRUTES = 0xD3BA0;
const TAILLE_DES_DONNEES = 0xD35A0;   // long : la taille lue de mhand-0.dat
const FICHIER_DU_FOND = 0xB8631;      // "data/mneg-0.dat"
const FICHIER_DE_LA_PALETTE = 0xB8670;  // "data/mngpal-0.dat"
const FICHIER_DES_MAINS = 0xB86AF;    // "data/mhand-0.dat"
const TABLE_DES_MAINS = 0xB86EE;      // "data/mhand-0.tab"
const FICHIER_DES_SPRITES = 0xB0BBB;  // "data/mspr-0.dat"
const TABLE_DES_SPRITES = 0xB0C0A;    // "data/mspr-0.tab"
const FORMAT_TEXTE = 0xB01AC;         // "%s"
const FORMAT_POURCENT = 0xB01AF;      // "%d.%d%%"

// Les images de mhand-0 : 53 une part de gâteau, 54 le bord gauche de la barre du joueur, 55 un
// pas de sa barre, 56 sa main, 57 le bord droit de la barre de l'adversaire, 58 un pas de sa barre,
// 59 sa main.
const PART_DE_GATEAU = 53, BORD_GAUCHE = 54, PAS_DU_JOUEUR = 55, MAIN_DU_JOUEUR = 56;
const BORD_DROIT = 57, PAS_DE_L_ADVERSAIRE = 58, MAIN_DE_L_ADVERSAIRE = 59;
// Les figures des deux négociateurs : 9 octets par pose, +0 l'image, +1 long le pourcentage à partir
// duquel elle vient, +5 et +7 mots x et y. 0xB8FDC l'adversaire, 0xB9090 le joueur ; 17 poses selon
// l'avancée de l'accord, et deux de plus (17, 18) pour l'accord conclu, jouées en boucle.
const POSES_DE_L_ADVERSAIRE = 0xB8FDC, POSES_DU_JOUEUR = 0xB9090, TAILLE_POSE = 9;
const NOMBRE_DE_POSES = 17, POSE_DE_L_ACCORD = 0x11, FIN_DES_POSES = 0x13;
// Les bulles d'un geste : 5 octets par image, +0 l'image, +1 et +3 mots x et y ; six images pour le
// joueur (0xB9144), six pour l'adversaire (0xB9162), jouées de la dernière à la première.
const BULLES_DU_JOUEUR = 0xB9144, BULLES_DE_L_ADVERSAIRE = 0xB9162, TAILLE_BULLE = 5;
const IMAGES_D_UNE_BULLE = 6;

// Le temps : 620 images, en dix parts de 62.
const DUREE = 0x26C, IMAGES_PAR_PART = 0x3E;
const PATIENCE_APRES_L_ISSUE = 1000;  // images sans bouger la souris avant de partir seul

// Les textes (décalages dans [0xD7BC0]).
const TITRE_PERSONNEL = 0x2C, TITRE_FOURNISSEURS = 0x30;
const PERSONNEL_BAISSE = 0x34, PERSONNEL_HAUSSE = 0x38, PERSONNEL_HAUSSE_DE = 0x3C;
const PERSONNEL_INCHANGE = 0x40;
const SALAIRE_MECANICIENS = 0x44, SALAIRE_AGENTS = 0x48, SALAIRE_AMUSEURS = 0x4C;
const CLIQUER_POUR_CONTINUER = 0x50;
const FOURNISSEURS_BAISSE = 0x54, FOURNISSEURS_HAUSSE = 0x58, FOURNISSEURS_INCHANGE = 0x5C;
const PERSONNEL_ECHEC_1 = 0x60, PERSONNEL_ECHEC_2 = 0x64;
const FOURNISSEURS_ECHEC_1 = 0x68, FOURNISSEURS_ECHEC_2 = 0x6C;

const PERSONNEL = 2, FOURNISSEURS = 4;
const EN_COURS = 0, ECHEC = 1, ACCORD = 2;

// Le personnel en grève.
const EMPLOYE = 8;
const ETAT_ALLER_A_L_ENTREE = 0x3A, ETAT_MANIFESTER = 0x3C, ETAT_REPRENDRE = 0x3E;
const EXEMPTE_DE_GREVE = 8;           // bit de l'octet +5 (non établi : lequel des employés)

// --- les fonctions du jeu appelées ---------------------------------------------------------------
const CURSEUR = 0x116E4;              // (image)
const OUVRIR_ECRAN_PLEIN = 0x40D3E, FERMER_ECRAN_PLEIN = 0x40D79;
const PASSER_EN_320 = 0x1171F, REVENIR_EN_640 = 0x11761;
const CHARGER_UN_FICHIER = 0x7F0B0;   // (nom, destination) : rend la taille lue
const CHARGER_ET_DECOMPRESSER = 0x1180E;  // (nom, destination, taille)
const RELOGER_LES_SPRITES = 0x10C80;  // (table, fin de la table, données)
const RECOPIER_DES_LIGNES = 0x55EFA;  // (source, destination, lignes)
const RECOPIER_320 = 0x80E20;         // (source, destination, lignes de 320)
const RECOPIER_640 = 0x54ED6;         // (source, destination)
const REMPLIR_320 = 0x81590, REMPLIR_640 = 0x815B8;   // (destination, lignes, couleur)
const POSER_LA_PALETTE = 0x7C282;
const COULEUR_LA_PLUS_PROCHE = 0x80250;   // (palette, r, g, b)
const ATTENDRE_BALAYAGE = 0x80BE4;
const ARRETER_LES_BRUITAGES = 0x80DC0;
const JOUER_UN_MORCEAU = 0x80A20;     // (morceau)
const TEMPO_DE_LA_MUSIQUE = 0x80E40;  // (valeur) : transmise au pilote de musique (dessin-carte.js)
const ARRETER_LA_MUSIQUE = 0x80990;
const BRUITAGE_UNIQUE = 0x80FE0;      // (propriétaire, bruitage)
const COPIER_UN_RECTANGLE = 0x11601;
const DESSINER_IMAGE = 0x20F4C;       // (x, y, image, 0)
const ECRIRE_CENTRE = 0x3F377;        // (x0, x1, y, texte, normal, couleur)
const ECRIRE_TEXTE = 0x3F49E;         // (x, y, texte, normal, couleur)
const FORMATER = 0x7F652;             // sprintf
const VALEUR_ABSOLUE = 0x80BF2;
const REPONDRE = 0x46F27;
const HASARD = 0x18B92;
const POSER_LE_CURSEUR = 0x7D775, RETIRER_LE_CURSEUR = 0x7D79E;
const CHOISIR_LA_BANQUE = 0x7E6BC;    // (banque VESA)
const ETEINDRE_L_ECRAN = 0x7C32D;
const RAFRAICHIR_TOUT = 0x55FCF;
const ROUVRIR_UN_ECRAN = 0x1B23A;     // (écran)
// Pour les employés.
const DEPLACER = 0x18A44;             // (objet, x, y)
const CHERCHER_SON_CHEMIN = 0x349EB;  // (objet, limite, sols interdits) : la direction, 4 à
                                      // l'arrivée, négative en cas d'échec
const DIVISION_PAR_ZERO = 0x19ED3;    // vitesse nulle : rend 1, efface la demande de sortie

const basseResolution = (jeu) => (octet(jeu, MODE) & 1) !== 0;
const texte = (jeu, decalage) => long(jeu, long(jeu, TEXTES) + decalage);
const comptes = (jeu) => long(jeu, COMPTES_COURANTS);
const parc = (jeu) => long(jeu, PARC_COURANT);

// =================================================================================================
// 0x11601 — copier un rectangle d'un tampon d'écran à un autre
// =================================================================================================
//
// (source, destination, x, y, largeur, hauteur) : les coordonnées sont celles de l'écran 640 de
// large ; en 320x200, elles sont toutes divisées par deux (décalage arithmétique sur 16 bits, que le
// programme fait dans ses arguments mêmes). Rien n'est copié si x dépasse 640 ou y le bas de l'écran
// (400 ou 480). Chaque ligne est copiée par mots de 4 octets, `largeur / 4` mots.
//
// ANOMALIES reproduites : x et y ne sont bornés que par le haut (ni négatifs, ni débordant à droite
// ou en bas) ; l'écart d'une ligne à l'autre est la largeur de l'écran moins la largeur, alors que
// la copie avance de largeur arrondie au multiple de 4 inférieur : une largeur qui n'en est pas un
// décale chaque ligne ; une hauteur nulle ou négative copie 2^32 lignes (le compteur est décrémenté
// avant d'être testé). En 320x200, l'écart se calcule sur le mot long de la largeur, dont seule la
// moitié basse a été divisée par deux. Le seul appelant, 0x44EA5, passe des valeurs sans histoire.
function copierUnRectangle(jeu, source, destination, x, y, largeur, hauteur) {
  const m8 = jeu.m8;
  let largeurLongue = largeur | 0;
  if (basseResolution(jeu)) {
    x = s16(x) >> 1;
    y = s16(y) >> 1;
    largeurLongue = (largeurLongue & ~0xFFFF) | ((s16(largeur) >> 1) & 0xFFFF);
    hauteur = s16(hauteur) >> 1;
  }
  if (s16(x) > 0x280) return;
  const basse = basseResolution(jeu);
  if (s16(y) > (basse ? 0x190 : 0x1E0)) return;
  const pas = basse ? 0x140 : 0x280;
  const debut = (Math.imul(s16(y), pas) + s16(x)) | 0;
  let s = (source + debut) | 0, d = (destination + debut) | 0;
  const ecart = s16(pas - largeurLongue);   // relu comme un mot signé
  const mots = ((s16(largeurLongue) >>> 2) | 0) >>> 0;
  const octets = 4 * mots;
  let lignes = s16(hauteur);
  do {
    if (octets !== 0) {
      const ss = s >>> 0, dd = d >>> 0;
      if (dd >= ss + octets || ss >= dd + octets) m8.copyWithin(dd, ss, ss + octets);
      else for (let k = 0; k < octets; k += 4) jeu.dv.setUint32(dd + k, jeu.dv.getUint32(ss + k, true), true);
    }
    s = (s + octets + ecart) | 0;
    d = (d + octets + ecart) | 0;
    lignes = (lignes - 1) | 0;
  } while (lignes !== 0);
}

// =================================================================================================
// 0x46F27 — la réponse de l'adversaire
// =================================================================================================
//
// Appelée une fois par part de gâteau (tous les 62 images), avec le nombre de parts qui restent
// (9 à 0) et le genre de négociation. L'adversaire baisse sa demande d'un pas `concession` × l'écart
// de départ / 128, où la concession vaut, en 128es :
//   10 à 17 au hasard ;
//   + 2 × geste − 14, le geste étant le mouvement de l'offre depuis la réponse précédente, en 128es
//     de l'écart de départ, borné à 5 : un joueur immobile fait remonter la demande de 14 à 4 ;
//   − obstination / 2 : l'obstination [0xD7808] monte (jusqu'à 8) quand le joueur baisse son offre
//     ou n'y touche pas, et baisse quand il la relève ;
//   + l'écart entre demande et offre, en 128es de l'écart de départ, divisé par 32 ;
//   + (6 − parts) / 2 dans les cinq dernières parts ;
//   selon l'indice de la fiche du parc (+0xCA les salaires, +0xE5 les prix, 100 au départ) : en
//   dessous de 100, − (100 − indice) / 16 − 1 ; au-dessus, + (indice − 100) / 64, au plus 4 ;
//   − 2 + séances ratées / 2 ;
//   + 4 si l'offre dépasse plancher + 400.
// La demande reste entre l'offre et le plafond. Une concession négative la fait remonter.
//
// ANOMALIE reproduite : le geste est pris en valeur absolue avant d'être borné à −2 : cette borne
// est morte, comme le cas « geste ≥ 8 » (il est borné à 5 juste avant). [0xD77D0] est calculé et
// jamais relu.
function repondre(jeu, partsRestantes, genre) {
  partsRestantes |= 0;
  const bonusDeFin = partsRestantes < 5 ? quotient(6 - partsRestantes, 2) : 0;

  let geste = (long(jeu, OFFRE) - long(jeu, OFFRE_A_LA_DERNIERE_REPONSE)) | 0;
  poserLong(jeu, DERNIER_GESTE, geste);
  const obstination = () => motSigne(jeu, OBSTINATION);
  if (geste < 0 && obstination() < 8) poserMot(jeu, OBSTINATION, obstination() + 1);
  if (geste === 0 && obstination() < 8) poserMot(jeu, OBSTINATION, obstination() + 1);
  else if (geste > 0 && obstination() > 0) poserMot(jeu, OBSTINATION, obstination() - 1);
  if (geste < 0) {
    geste = -geste | 0;
    poserLong(jeu, DERNIER_GESTE, geste);
  }

  let gesteRelatif = quotient(geste << 7, long(jeu, ECART_DE_DEPART));
  if (gesteRelatif > 5) gesteRelatif = 5;
  else if (gesteRelatif < -2) gesteRelatif = -2;

  const gestePrecedent = long(jeu, GESTE_PRECEDENT);
  poserLong(jeu, VARIATION_DU_GESTE, gestePrecedent > 0
    ? quotient((geste - gestePrecedent) << 7, gestePrecedent) : -300);

  const ecartRelatif = quotient((long(jeu, DEMANDE) - long(jeu, OFFRE)) << 7, long(jeu, ECART_DE_DEPART));
  let concession = reste(u16(jeu.appeler(HASARD)), 8) + 10;
  if (gesteRelatif < 8) concession += 2 * gesteRelatif - 14;
  else concession -= quotient(gesteRelatif - 7, 2);
  concession -= quotient(obstination(), 2);
  concession += quotient(ecartRelatif, 32);
  concession += bonusDeFin;

  const selonLIndice = (champIndice, champSeances) => {
    const indice = motSigne(jeu, parc(jeu) + champIndice);
    if (indice < 100) {
      concession -= quotient(100 - indice, 16) + 1;
    } else if (indice > 100) {
      let bonus = quotient(indice - 100, 64);
      if (bonus > 4) bonus = 4;
      poserLong(jeu, BONUS_D_INDICE, bonus);
      concession += bonus;
    }
    concession -= 2 - quotient(octet(jeu, comptes(jeu) + champSeances), 2);
  };
  if ((genre & 0xFF) === PERSONNEL) selonLIndice(INDICE_DES_SALAIRES, SEANCES_PERSONNEL);
  else if ((genre & 0xFF) === FOURNISSEURS) selonLIndice(INDICE_DES_PRIX, SEANCES_FOURNISSEURS);

  if (long(jeu, OFFRE) > long(jeu, SEUIL_GENEREUX)) concession += 4;
  const baisse = quotient(Math.imul(concession, long(jeu, ECART_DE_DEPART)), 128);
  poserLong(jeu, DEMANDE, long(jeu, DEMANDE) - baisse);
  if (long(jeu, DEMANDE) > long(jeu, PLAFOND)) poserLong(jeu, DEMANDE, long(jeu, PLAFOND));
  if (long(jeu, DEMANDE) < long(jeu, OFFRE)) poserLong(jeu, DEMANDE, long(jeu, OFFRE));
  poserLong(jeu, OFFRE_A_LA_DERNIERE_REPONSE, long(jeu, OFFRE));
  poserLong(jeu, GESTE_PRECEDENT, long(jeu, DERNIER_GESTE));
}

// =================================================================================================
// 0x44EA5 — l'écran des négociations
// =================================================================================================
//
// Le décor (data/mneg-0.dat, sa palette data/mngpal-0.dat) et les images de mhand-0. À chaque image :
//   - la table et les barres sont effacées (deux rectangles et une bande du fond recopiés) ;
//   - tant que rien n'est conclu, le pointeur à gauche ou à droite de la main du joueur prend une
//     flèche, et le bouton tenu déplace l'offre de 2 ; une bulle part de la bouche du joueur ;
//   - à chaque part de gâteau mangée, l'adversaire répond (0x46F27) ; s'il a cédé, sa bulle part ;
//   - sa main suit la demande d'un pas par image ;
//   - le titre, les bulles, les deux négociateurs (leur pose dit où en est l'accord, en pour cent),
//     le gâteau, les deux barres et leurs pourcentages ;
//   - la musique accélère à mesure que le gâteau diminue ;
//   - le temps écoulé : échec ; l'offre à la hauteur de la demande (la main de l'adversaire
//     arrivée) : accord ; et, dès lors, un message, jusqu'à un clic, ou 1 000 images sans bouger la
//     souris.
// Le cadre de l'original est ouvert (moteur/jeu/cadre.js) : les textes sont mis en forme dans un
// tampon pris dans ses variables locales, [ebp-0xE8].
//
// ANOMALIES reproduites : l'offre et la demande s'affichent par « %d.%d%% » avec le quotient et la
// valeur absolue du reste par 10 : entre −0,9 et −0,1 %, le signe se perd (« 0.5% ») ; les bruitages
// de l'accord sont rejoués à chaque image tant que la main de l'adversaire n'a pas rejoint sa
// demande ; les fonds recopiés et l'image du pointeur ne dépendent pas du genre de négociation ; un
// genre autre que 2 ou 4 garderait le plancher de la négociation précédente (aucun appelant ne le
// fait).
const negocier = dansLeCadre(0x1AC, (jeu, cadre, genreLong) => {
  const genre = genreLong & 0xFF;
  const tampon = cadre.local(0xE8);
  const appeler = (...a) => jeu.appeler(...a);
  const largeur = (image) => {
    const l = octet(jeu, long(jeu, BANQUE_DE_DESSIN) + 6 * image + 4);
    return basseResolution(jeu) ? l : 2 * l;
  };
  const image = (n) => (long(jeu, BANQUE_DE_DESSIN) + 6 * n) | 0;
  const dessiner = (x, y, img) => appeler(DESSINER_IMAGE, x, y, img, 0);
  const centrer = (y, couleur) => appeler(ECRIRE_CENTRE, 0, 0x280, y, tampon, 0, couleur);
  const formater = (format, ...args) => appeler(FORMATER, tampon, format, ...args);

  let issue = EN_COURS;
  let parts = 0;            // [ebp-0x38] : les pas de la barre du joueur
  let pasDeLAdversaire = 0; // [ebp-0x20] : ceux de la barre de l'adversaire, qui suivent la demande
  let imagesApres = 0;      // [ebp-0x64] : images depuis l'issue
  let bulleDeLAdversaire = 0, bulleDuJoueur = 0;   // [ebp-0x3c], [ebp-0x34]
  let demandeDixiemes = 0, demandeReste = 0;       // [ebp-0x48], [ebp-0x40]
  let offreDixiemes = 0, offreReste = 0;           // [ebp-0x2c], [ebp-0x30]
  let poseDuJoueur = 0, poseDeLAdversaire = 0;     // [ebp-0x28], [ebp-0x24]
  let cibleDeLAdversaire = 0;                      // [ebp-0x44]
  let cadence = 0;                                 // [ebp-0x14] : les bulles avancent toutes les
                                                   // `cadence` images, plus vite près de l'accord
  const basseDejaForcee = octet(jeu, BASSE_FORCEE) !== 0;
  const curseurDAvant = long(jeu, IMAGE_DU_CURSEUR);

  // L'ouverture.
  appeler(CURSEUR, long(jeu, CURSEURS));
  poserOctet(jeu, ECRAN_A_ROUVRIR, octet(jeu, ECRAN));
  appeler(OUVRIR_ECRAN_PLEIN);
  if (!basseDejaForcee) appeler(PASSER_EN_320);
  appeler(CHARGER_UN_FICHIER, FICHIER_DU_FOND, long(jeu, SURFACE));
  appeler(CHARGER_UN_FICHIER, FICHIER_DE_LA_PALETTE, PALETTE_DE_L_ECRAN);
  poserLong(jeu, TAILLE_DES_DONNEES, appeler(CHARGER_UN_FICHIER, FICHIER_DES_MAINS, long(jeu, DONNEES_DES_SPRITES)));
  appeler(CHARGER_UN_FICHIER, TABLE_DES_MAINS, long(jeu, BANQUE_DES_SPRITES));
  appeler(RELOGER_LES_SPRITES, long(jeu, BANQUE_DES_SPRITES), long(jeu, FIN_DES_SPRITES), long(jeu, DONNEES_DES_SPRITES));
  appeler(RECOPIER_DES_LIGNES, long(jeu, SURFACE), long(jeu, FOND), 0x190);
  poserLong(jeu, BANQUE_DE_DESSIN, long(jeu, BANQUE_DES_SPRITES));
  poserLong(jeu, FIN_DE_DESSIN, long(jeu, FIN_DES_SPRITES));
  poserLong(jeu, DONNEES_DE_DESSIN, long(jeu, DONNEES_BRUTES));
  appeler(POSER_LA_PALETTE, PALETTE_DE_L_ECRAN);
  const blanc = appeler(COULEUR_LA_PLUS_PROCHE, PALETTE_DE_L_ECRAN, 0x3F, 0x3F, 0x3F) & 0xFF;
  const noir = appeler(COULEUR_LA_PLUS_PROCHE, PALETTE_DE_L_ECRAN, 0, 0, 0) & 0xFF;
  appeler(ATTENDRE_BALAYAGE);

  // Les bornes. Le plancher : −150 à la première séance, puis 25 × séances − 75, au plus 0.
  const plancherSelon = (seances) => (seances !== 0 ? 25 * seances - 75 : -150);
  if (genre === PERSONNEL) poserLong(jeu, PLANCHER, plancherSelon(octet(jeu, comptes(jeu) + SEANCES_PERSONNEL)));
  else if (genre === FOURNISSEURS) poserLong(jeu, PLANCHER, plancherSelon(octet(jeu, comptes(jeu) + SEANCES_FOURNISSEURS)));
  if (long(jeu, PLANCHER) > 0) poserLong(jeu, PLANCHER, 0);
  poserLong(jeu, PLAFOND, long(jeu, PLANCHER) + 500);
  poserLong(jeu, SEUIL_GENEREUX, long(jeu, PLANCHER) + 400);
  poserLong(jeu, DEMANDE, long(jeu, PLAFOND));
  poserLong(jeu, OFFRE, long(jeu, PLANCHER));
  poserLong(jeu, OFFRE_DE_DEPART, long(jeu, OFFRE));
  poserLong(jeu, DEMANDE_PRECEDENTE, long(jeu, DEMANDE));
  poserLong(jeu, OFFRE_A_LA_DERNIERE_REPONSE, long(jeu, OFFRE));
  poserLong(jeu, ECART_DE_DEPART, long(jeu, DEMANDE) - long(jeu, OFFRE));

  // L'échelle des barres : la largeur de l'écran moins les bords et les mains, plus 6.
  poserMot(jeu, LARGEUR_DES_BARRES, 0x280 - largeur(BORD_DROIT) - largeur(BORD_GAUCHE)
    - largeur(MAIN_DE_L_ADVERSAIRE) - largeur(MAIN_DU_JOUEUR) + 6);
  poserLong(jeu, ETENDUE, long(jeu, PLAFOND) - long(jeu, PLANCHER));
  poserMot(jeu, ECHELLE, quotient(long(jeu, ETENDUE) << 7, motSigne(jeu, LARGEUR_DES_BARRES)));
  // La barre de l'adversaire, en pas : (plafond − demande) × 128 / (échelle × largeur d'un pas).
  const pasVersLaDemande = () => quotient((long(jeu, PLAFOND) - long(jeu, DEMANDE)) << 7,
    Math.imul(motSigne(jeu, ECHELLE), largeur(PAS_DE_L_ADVERSAIRE)));

  let temps = DUREE;                                  // [ebp-0x50]
  let partDeLaDerniereReponse = quotient(temps, IMAGES_PAR_PART) + 1;   // [ebp-0x54]
  cadence = 7;
  pasDeLAdversaire = pasVersLaDemande();
  cibleDeLAdversaire = pasVersLaDemande();

  if (octet(jeu, BRUITAGES_ACTIFS) !== 0 && octet(jeu, BRUITAGES_PRETS) !== 0) appeler(ARRETER_LES_BRUITAGES);
  if (octet(jeu, MUSIQUE_PERMISE) !== 0) {
    appeler(JOUER_UN_MORCEAU, MORCEAU_DE_LA_NEGOCIATION);
    appeler(TEMPO_DE_LA_MUSIQUE, 0x64);
  }
  if (basseResolution(jeu)) appeler(RECOPIER_320, long(jeu, FOND), long(jeu, SURFACE), 0xC8);
  else appeler(RECOPIER_640, long(jeu, FOND), long(jeu, SURFACE));

  // Une bulle : l'image `numero` (6 à 1) de la table, puis, toutes les `cadence` images, la
  // suivante. Rend le nouveau numéro.
  const bulle = (table, numero) => {
    if (s16(numero) <= 0) return numero;
    const b = table + (s16(numero) - 1) * TAILLE_BULLE;
    dessiner(mot(jeu, b + 1), mot(jeu, b + 3), image(octet(jeu, b)));
    const horloge = issue === EN_COURS ? temps : long(jeu, IMAGES_SANS_BOUGER);
    return reste(horloge, cadence) === 0 ? numero - 1 : numero;
  };
  const poser = (table, pose) => {
    const p = table + Math.imul(s16(pose), TAILLE_POSE);
    dessiner(mot(jeu, p + 5), mot(jeu, p + 7), image(octet(jeu, p)));
  };
  const lesDeuxPoses = () => {
    poser(POSES_DU_JOUEUR, poseDuJoueur);
    poser(POSES_DE_L_ADVERSAIRE, poseDeLAdversaire);
  };
  const oublierLeClic = () => {
    poserMot(jeu, DROIT_TENU, 0);
    poserMot(jeu, GAUCHE_TENU, 0);
    poserMot(jeu, DROIT_APPUI, 0);
    poserMot(jeu, GAUCHE_APPUI, 0);
  };
  const presenter = () => {
    const source = long(jeu, SURFACE) >>> 0;
    if (basseResolution(jeu)) {
      appeler(POSER_LE_CURSEUR);
      jeu.m8.copyWithin(0xA0000, source, source + 0x3E80 * 4);
      appeler(RETIRER_LE_CURSEUR);
      return;
    }
    appeler(POSER_LE_CURSEUR);
    let s = source;
    for (let banque = 0; banque < 5; banque++) {
      appeler(CHOISIR_LA_BANQUE, banque);
      const n = banque < 4 ? 0x10000 : 0xB000;
      jeu.m8.copyWithin(0xA0000, s, s + n);
      s += n;
    }
    appeler(RETIRER_LE_CURSEUR);
  };

  for (;;) {
    if (mot(jeu, GAUCHE_APPUI) !== 0 && issue !== EN_COURS) break;

    // Effacer la table et les barres.
    appeler(COPIER_UN_RECTANGLE, long(jeu, FOND), long(jeu, SURFACE), 0x40, 0x94, 0x1D8, 0xB4);
    appeler(COPIER_UN_RECTANGLE, long(jeu, FOND), long(jeu, SURFACE), 0xFC, 0xFC, 0x80, 0x68);
    const bande = 0xE600;
    jeu.m8.copyWithin((long(jeu, SURFACE) + bande) >>> 0, (long(jeu, FOND) + bande) >>> 0,
      ((long(jeu, FOND) + bande) >>> 0) + 0x1400 * 4);

    if (issue === EN_COURS) {
      // Le pointeur de part et d'autre de la main du joueur.
      const main = largeur(BORD_GAUCHE) + largeur(MAIN_DU_JOUEUR) + Math.imul(s16(parts), largeur(PAS_DU_JOUEUR));
      const x = motSigne(jeu, SOURIS_X);
      if (x < main - 1) {
        appeler(CURSEUR, long(jeu, CURSEURS) + 0x78);
        if (mot(jeu, GAUCHE_TENU) !== 0) {
          if (long(jeu, OFFRE) - 2 > long(jeu, PLANCHER)) poserLong(jeu, OFFRE, long(jeu, OFFRE) - 2);
          else poserLong(jeu, OFFRE, long(jeu, PLANCHER));
          if (s16(bulleDuJoueur) === 0) bulleDuJoueur = IMAGES_D_UNE_BULLE;
        }
      } else if (x > main + 1) {
        appeler(CURSEUR, long(jeu, CURSEURS) + 0x72);
        if (mot(jeu, GAUCHE_TENU) !== 0) {
          if (long(jeu, OFFRE) + 2 < long(jeu, PLAFOND)) poserLong(jeu, OFFRE, long(jeu, OFFRE) + 2);
          else poserLong(jeu, OFFRE, long(jeu, PLAFOND));
          if (s16(bulleDuJoueur) === 0) bulleDuJoueur = IMAGES_D_UNE_BULLE;
        }
      }
      // Une part de gâteau mangée : l'adversaire répond.
      if (quotient(temps, IMAGES_PAR_PART) + 1 !== partDeLaDerniereReponse) {
        poserLong(jeu, DEMANDE_PRECEDENTE, long(jeu, DEMANDE));
        appeler(REPONDRE, quotient(temps, IMAGES_PAR_PART), genre);
        partDeLaDerniereReponse = quotient(temps, IMAGES_PAR_PART) + 1;
        if (s16(bulleDeLAdversaire) === 0 && long(jeu, DEMANDE_PRECEDENTE) !== long(jeu, DEMANDE)) {
          bulleDeLAdversaire = IMAGES_D_UNE_BULLE;
        }
      }
      if (long(jeu, OFFRE) > long(jeu, DEMANDE)) poserLong(jeu, OFFRE, long(jeu, DEMANDE));
      // La main de l'adversaire avance d'un pas par image vers sa demande.
      cibleDeLAdversaire = pasVersLaDemande();
      if (s16(cibleDeLAdversaire) > s16(pasDeLAdversaire)) pasDeLAdversaire++;
      else if (s16(cibleDeLAdversaire) < s16(pasDeLAdversaire)) pasDeLAdversaire--;
    }

    // Le titre.
    if (genre === PERSONNEL || genre === FOURNISSEURS) {
      formater(FORMAT_TEXTE, texte(jeu, genre === PERSONNEL ? TITRE_PERSONNEL : TITRE_FOURNISSEURS));
      centrer(0x16, noir);
    }

    bulleDuJoueur = bulle(BULLES_DU_JOUEUR, bulleDuJoueur);
    bulleDeLAdversaire = bulle(BULLES_DE_L_ADVERSAIRE, bulleDeLAdversaire);

    // Les deux négociateurs.
    if (issue === EN_COURS) {
      const accordPourCent = 100 - quotient(Math.imul(long(jeu, DEMANDE) - long(jeu, OFFRE), 100),
        long(jeu, PLAFOND) - long(jeu, PLANCHER));
      cadence = accordPourCent > 85 ? 2 : accordPourCent > 70 ? 3 : accordPourCent > 55 ? 4
        : accordPourCent > 40 ? 5 : accordPourCent > 20 ? 6 : 7;
      for (let k = NOMBRE_DE_POSES; u16(k) > 0; k--) {
        if (accordPourCent >= long(jeu, POSES_DE_L_ADVERSAIRE + (u16(k) - 1) * TAILLE_POSE + 1)) {
          poseDuJoueur = k - 1;
          poser(POSES_DU_JOUEUR, poseDuJoueur);
          poseDeLAdversaire = k - 1;
          poser(POSES_DE_L_ADVERSAIRE, poseDeLAdversaire);
          break;
        }
      }
    } else if (issue === ECHEC) {
      // Les deux se détournent, une pose toutes les deux images.
      if ((imagesApres & 1) === 0) {
        if (s16(poseDuJoueur) > 0) poseDuJoueur--;
        if (s16(poseDeLAdversaire) > 0) poseDeLAdversaire--;
      }
      lesDeuxPoses();
    } else if (issue === ACCORD) {
      // La poignée de main : les poses 17 et 18 en boucle, une toutes les quatre images.
      if ((imagesApres & 3) === 0) {
        poseDuJoueur++;
        if (s16(poseDuJoueur) >= FIN_DES_POSES) poseDuJoueur = POSE_DE_L_ACCORD;
        poseDeLAdversaire++;
        if (s16(poseDeLAdversaire) >= FIN_DES_POSES) poseDeLAdversaire = POSE_DE_L_ACCORD;
      }
      lesDeuxPoses();
    }

    // Le gâteau, et la musique qui presse.
    const partsDuGateau = temps === 0 ? 0 : quotient(temps, IMAGES_PAR_PART) + 1;
    appeler(TEMPO_DE_LA_MUSIQUE, u16(quotient(DUREE - temps, 8) + 0x3C));
    for (let k = 0; u16(k) < s16(partsDuGateau); k++) {
      dessiner(0x11E, u16(0x132 - 4 * k), image(PART_DE_GATEAU));
    }

    // La barre du joueur, sa main, son offre. En 640x480, chaque pas est tracé deux fois, décalé
    // d'un pixel.
    const repetitions = basseResolution(jeu) ? 1 : 2;
    parts = quotient((long(jeu, OFFRE) - long(jeu, PLANCHER)) << 7,
      Math.imul(motSigne(jeu, ECHELLE), largeur(PAS_DU_JOUEUR)));
    for (let k = 0; u16(k) < s16(parts); k++) {
      for (let r = 0; r < repetitions; r++) {
        dessiner(u16(largeur(BORD_GAUCHE) + Math.imul(largeur(PAS_DU_JOUEUR), u16(k)) + r), 0x176, image(PAS_DU_JOUEUR));
      }
    }
    dessiner(u16(largeur(BORD_GAUCHE) + Math.imul(s16(parts), largeur(PAS_DU_JOUEUR))), 0x16E, image(MAIN_DU_JOUEUR));
    offreReste = appeler(VALEUR_ABSOLUE, reste(long(jeu, OFFRE), 10));
    offreDixiemes = quotient(long(jeu, OFFRE), 10);
    formater(FORMAT_POURCENT, s16(offreDixiemes), s16(offreReste));
    appeler(ECRIRE_TEXTE, 8, 0x17E, tampon, 0, blanc);

    // La barre de l'adversaire, depuis la droite.
    for (let k = 0; u16(k) < s16(pasDeLAdversaire); k++) {
      for (let r = 0; r < repetitions; r++) {
        dessiner(u16(0x234 - Math.imul(u16(k) + 1, largeur(PAS_DE_L_ADVERSAIRE)) + r), 0x176, image(PAS_DE_L_ADVERSAIRE));
      }
    }
    dessiner(u16(0x234 - Math.imul(s16(pasDeLAdversaire), largeur(PAS_DE_L_ADVERSAIRE)) - largeur(MAIN_DE_L_ADVERSAIRE)),
      0x16E, image(MAIN_DE_L_ADVERSAIRE));
    demandeReste = appeler(VALEUR_ABSOLUE, reste(long(jeu, DEMANDE), 10));
    demandeDixiemes = quotient(long(jeu, DEMANDE), 10);
    formater(FORMAT_POURCENT, s16(demandeDixiemes), s16(demandeReste));
    appeler(ECRIRE_TEXTE, 0x23C, 0x17E, tampon, 0, blanc);

    if (issue === EN_COURS) {
      if (temps <= 0) {
        conclureParUnEchec();
      } else if (long(jeu, DEMANDE) <= long(jeu, OFFRE)) {
        conclureParUnAccord();
      }
    } else {
      afficherLIssue();
    }

    if (issue === EN_COURS) {
      temps--;
    } else {
      imagesApres++;
      if (mot(jeu, POINTEUR_GARDE_X) === mot(jeu, SOURIS_X) && mot(jeu, POINTEUR_GARDE_Y) === mot(jeu, SOURIS_Y)) {
        poserLong(jeu, IMAGES_SANS_BOUGER, long(jeu, IMAGES_SANS_BOUGER) + 1);
        if (long(jeu, IMAGES_SANS_BOUGER) > PATIENCE_APRES_L_ISSUE) break;
      } else {
        poserMot(jeu, POINTEUR_GARDE_X, mot(jeu, SOURIS_X));
        poserMot(jeu, POINTEUR_GARDE_Y, mot(jeu, SOURIS_Y));
        poserLong(jeu, IMAGES_SANS_BOUGER, 0);
      }
    }
    appeler(ATTENDRE_BALAYAGE);
    presenter();
  }

  // Le départ : la banque des sprites rechargée, l'écran éteint puis effacé, l'écran d'avant rouvert.
  appeler(CHARGER_ET_DECOMPRESSER, FICHIER_DES_SPRITES, long(jeu, DONNEES_DES_SPRITES), long(jeu, TAILLE_DES_DONNEES));
  poserLong(jeu, TAILLE_DES_DONNEES, 0);
  appeler(CHARGER_UN_FICHIER, TABLE_DES_SPRITES, long(jeu, BANQUE_DES_SPRITES));
  appeler(RELOGER_LES_SPRITES, long(jeu, BANQUE_DES_SPRITES), long(jeu, FIN_DES_SPRITES), long(jeu, DONNEES_DES_SPRITES));
  appeler(ETEINDRE_L_ECRAN);
  const effacer = () => {
    if (basseResolution(jeu)) appeler(REMPLIR_320, long(jeu, SURFACE), 0x190, 0);
    else appeler(REMPLIR_640, long(jeu, SURFACE), 0x1E0, 0);
  };
  effacer();
  presenter();
  poserMot(jeu, ECRAN, mot(jeu, ECRAN_PRECEDENT));
  appeler(CURSEUR, long(jeu, CURSEURS));
  effacer();
  appeler(RAFRAICHIR_TOUT);
  if (!basseDejaForcee) appeler(REVENIR_EN_640);
  appeler(ROUVRIR_UN_ECRAN, octet(jeu, ECRAN_A_ROUVRIR));
  if (!basseDejaForcee) appeler(REVENIR_EN_640);
  appeler(FERMER_ECRAN_PLEIN);
  appeler(RAFRAICHIR_TOUT);
  appeler(CURSEUR, curseurDAvant);

  // --- les issues ---------------------------------------------------------------------------------

  // Le temps écoulé.
  function conclureParUnEchec() {
    if (octet(jeu, MUSIQUE_PERMISE) !== 0) appeler(ARRETER_LA_MUSIQUE);
    if (octet(jeu, BRUITAGES_ACTIFS) !== 0 && octet(jeu, BRUITAGES_PRETS) !== 0) appeler(BRUITAGE_UNIQUE, 0, BRUITAGE_DE_L_ECHEC);
    if (genre === PERSONNEL) {
      poserLong(jeu, parc(jeu) + DERNIERE_SEANCE_PERSONNEL, long(jeu, PAS_DE_SIMULATION));
      poserOctet(jeu, comptes(jeu) + EN_GREVE, 1);
      // La grève : chaque employé note sa case et part vers l'entrée du parc.
      for (let o = long(jeu, OBJETS_DU_PARC) + TAILLE_OBJET; (o >>> 0) < (long(jeu, FIN_DES_OBJETS_DU_PARC) >>> 0); o += TAILLE_OBJET) {
        if (octet(jeu, o + 4) !== EMPLOYE) continue;
        if (octet(jeu, o + 0xC) === ETAT_MANIFESTER || (octet(jeu, o + 5) & EXEMPTE_DE_GREVE) !== 0) continue;
        poserMot(jeu, o + 0x4D, (octet(jeu, o + 9) << 6) + octet(jeu, o + 7));
        poserOctet(jeu, o + 0xC, ETAT_ALLER_A_L_ENTREE);
        poserMot(jeu, o + 0x14, 0);
      }
      issue = ECHEC;
      poserOctet(jeu, comptes(jeu) + SEANCES_PERSONNEL, octet(jeu, comptes(jeu) + SEANCES_PERSONNEL) + 1);
      poserLong(jeu, SEANCE_DU_PERSONNEL, long(jeu, PAS_DE_SIMULATION));
    } else if (genre === FOURNISSEURS) {
      poserLong(jeu, parc(jeu) + DERNIERE_SEANCE_FOURNISSEURS, long(jeu, PAS_DE_SIMULATION));
      issue = ECHEC;
      poserOctet(jeu, comptes(jeu) + SEANCES_FOURNISSEURS, octet(jeu, comptes(jeu) + SEANCES_FOURNISSEURS) + 1);
      poserLong(jeu, SEANCE_DES_FOURNISSEURS, long(jeu, PAS_DE_SIMULATION));
    }
    oublierLeClic();
  }

  // L'offre a rejoint la demande. L'accord n'est conclu qu'une fois la main de l'adversaire arrivée
  // à sa demande (les bruitages, eux, partent à chaque image d'ici là).
  function conclureParUnAccord() {
    if (octet(jeu, MUSIQUE_PERMISE) !== 0) appeler(ARRETER_LA_MUSIQUE);
    if (octet(jeu, BRUITAGES_ACTIFS) !== 0 && octet(jeu, BRUITAGES_PRETS) !== 0) appeler(BRUITAGE_UNIQUE, 0, BRUITAGE_DE_L_ACCORD);
    if (s16(cibleDeLAdversaire) > s16(pasDeLAdversaire)) return;
    const hausse = (valeur) => quotient(Math.imul(valeur, 1000 + long(jeu, OFFRE)), 1000);
    if (genre === PERSONNEL) {
      offreReste = appeler(VALEUR_ABSOLUE, reste(long(jeu, OFFRE), 10));
      offreDixiemes = quotient(long(jeu, OFFRE), 10);
      // Tous les salaires du catalogue des métiers ; les comptes gardent ceux du mécanicien, de
      // l'agent d'entretien, et le plus bas des amuseurs.
      let plusBasDesAmuseurs = 30000;
      for (let k = 0; mot(jeu, METIERS + u16(k) * TAILLE_METIER + METIER_FIN) !== 0; k++) {
        const fiche = METIERS + u16(k) * TAILLE_METIER;
        poserMot(jeu, fiche + METIER_SALAIRE, hausse(mot(jeu, fiche + METIER_SALAIRE)));
        const categorie = mot(jeu, fiche + METIER_ETAT_D_EMBAUCHE);
        if (categorie === AMUSEUR) {
          if (mot(jeu, fiche + METIER_SALAIRE) < plusBasDesAmuseurs) plusBasDesAmuseurs = mot(jeu, fiche + METIER_SALAIRE);
        } else if (categorie === MECANICIEN) {
          poserMot(jeu, comptes(jeu) + SALAIRE_DU_MECANICIEN, mot(jeu, fiche + METIER_SALAIRE));
        } else if (categorie === AGENT_D_ENTRETIEN) {
          poserMot(jeu, comptes(jeu) + SALAIRE_DE_L_AGENT, mot(jeu, fiche + METIER_SALAIRE));
        }
      }
      poserMot(jeu, comptes(jeu) + SALAIRE_DES_AMUSEURS, plusBasDesAmuseurs);
      poserLong(jeu, parc(jeu) + DERNIERE_SEANCE_PERSONNEL, long(jeu, PAS_DE_SIMULATION));
      poserMot(jeu, parc(jeu) + INDICE_DES_SALAIRES, hausse(motSigne(jeu, parc(jeu) + INDICE_DES_SALAIRES)));
      // Fin de la grève.
      poserOctet(jeu, comptes(jeu) + EN_GREVE, 0);
      for (let o = long(jeu, OBJETS_DU_PARC) + TAILLE_OBJET; (o >>> 0) < (long(jeu, FIN_DES_OBJETS_DU_PARC) >>> 0); o += TAILLE_OBJET) {
        if (octet(jeu, o + 4) !== EMPLOYE) continue;
        const etat = octet(jeu, o + 0xC);
        if (etat === ETAT_MANIFESTER || etat === ETAT_ALLER_A_L_ENTREE) poserOctet(jeu, o + 0xC, ETAT_REPRENDRE);
      }
      issue = ACCORD;
      poserOctet(jeu, comptes(jeu) + SEANCES_PERSONNEL, 0);
    } else if (genre === FOURNISSEURS) {
      offreReste = appeler(VALEUR_ABSOLUE, reste(long(jeu, OFFRE), 10));
      offreDixiemes = quotient(long(jeu, OFFRE), 10);
      poserLong(jeu, parc(jeu) + DERNIERE_SEANCE_FOURNISSEURS, long(jeu, PAS_DE_SIMULATION));
      poserMot(jeu, parc(jeu) + INDICE_DES_PRIX, hausse(motSigne(jeu, parc(jeu) + INDICE_DES_PRIX)));
      // Les prix d'achat des marchandises, et les deux prix des boutiques : celles qui vendent une
      // marchandise prennent son prix pour coût ; les autres, sauf le genre 8, voient leurs deux prix
      // suivre la hausse.
      for (let k = 0; mot(jeu, BOUTIQUES + u16(k) * TAILLE_BOUTIQUE + BOUTIQUE_FIN) !== 0; k++) {
        const b = BOUTIQUES + u16(k) * TAILLE_BOUTIQUE;
        const marchandise = s8(octet(jeu, b + BOUTIQUE_MARCHANDISE));
        if (marchandise !== -1) {
          const prix = MARCHANDISES + marchandise * TAILLE_MARCHANDISE + MARCHANDISE_PRIX;
          poserMot(jeu, prix, hausse(mot(jeu, prix)));
          poserMot(jeu, b + BOUTIQUE_COUT, mot(jeu, prix));
          poserMot(jeu, b + BOUTIQUE_PRIX, hausse(mot(jeu, b + BOUTIQUE_PRIX)));
        } else if (octet(jeu, b + BOUTIQUE_GENRE) !== SANS_PRIX_A_SUIVRE) {
          poserMot(jeu, b + BOUTIQUE_COUT, hausse(mot(jeu, b + BOUTIQUE_COUT)));
          poserMot(jeu, b + BOUTIQUE_PRIX, hausse(mot(jeu, b + BOUTIQUE_PRIX)));
        }
      }
      issue = ACCORD;
      poserOctet(jeu, comptes(jeu) + SEANCES_FOURNISSEURS, 0);
    }
    oublierLeClic();
  }

  // Le message de l'issue, par-dessus la scène : l'échec quand le temps est écoulé, l'accord sinon.
  function afficherLIssue() {
    const ligne = (decalage, y, ...args) => {
      formater(texte(jeu, decalage), ...args);
      centrer(y, blanc);
    };
    if (temps <= 0) {
      if (genre === PERSONNEL) {
        ligne(PERSONNEL_ECHEC_1, 0x64);
        ligne(PERSONNEL_ECHEC_2, 0x70);
        ligne(CLIQUER_POUR_CONTINUER, 0xC8);
      } else if (genre === FOURNISSEURS) {
        ligne(FOURNISSEURS_ECHEC_1, 0x64);
        ligne(FOURNISSEURS_ECHEC_2, 0x70);
        ligne(CLIQUER_POUR_CONTINUER, 0xC8);
      }
      return;
    }
    const offre = long(jeu, OFFRE);
    if (genre === PERSONNEL) {
      if (offre < 0) {
        ligne(PERSONNEL_BAISSE, 0x64, -s16(offreDixiemes), s16(offreReste));
      } else if (offre > 0) {
        ligne(PERSONNEL_HAUSSE, 0x64);
        ligne(PERSONNEL_HAUSSE_DE, 0x70, s16(offreDixiemes), s16(offreReste));
      } else {
        ligne(PERSONNEL_INCHANGE, 0x64);
      }
      ligne(SALAIRE_MECANICIENS, 0x8C, mot(jeu, comptes(jeu) + SALAIRE_DU_MECANICIEN));
      ligne(SALAIRE_AGENTS, 0x98, mot(jeu, comptes(jeu) + SALAIRE_DE_L_AGENT));
      ligne(SALAIRE_AMUSEURS, 0xA4, mot(jeu, comptes(jeu) + SALAIRE_DES_AMUSEURS));
      ligne(CLIQUER_POUR_CONTINUER, 0xC8);
    } else if (genre === FOURNISSEURS) {
      if (offre < 0) ligne(FOURNISSEURS_BAISSE, 0x64, -s16(offreDixiemes), s16(offreReste));
      else if (offre > 0) ligne(FOURNISSEURS_HAUSSE, 0x64, s16(offreDixiemes), s16(offreReste));
      else ligne(FOURNISSEURS_INCHANGE, 0x64);
      ligne(CLIQUER_POUR_CONTINUER, 0xC8);
    }
  }
});

// =================================================================================================
// LA GRÈVE
// =================================================================================================
//
// Les champs de l'employé (personnel.js) : +6 et +8 les coordonnées fines (octet fort la case,
// octet faible la position dans la case), +0xA l'objet graphique, +0xC l'état, +0x12 la direction,
// +0x13 la vitesse, +0x14 le compte à rebours, +0x20 la patience, +0x4D une case, +0x56 et +0x57 la
// case visée, +0x59 le métier.
//
// Le reste de pile : ces routines sont appelées par 0x21681, et l'état 4 des visiteurs relit l'octet
// laissé 24 octets sous leur entrée (docs/guide-reecriture.md). Elles ouvrent donc le cadre de
// l'original, et y rangent en [ebp-8] ce que l'original y rangeait : l'abscisse visée (0x3502B,
// 0x3542D) ou l'ordonnée (0x35208) quand l'employé marche, et rien sinon. Seule la moitié basse de
// la coordonnée y est reproduite : la haute venait de restes de registres, et le lecteur n'en prend
// qu'un octet.
const X = 6, Y = 8, GRAPHIQUE = 0xA, ETAT = 0xC, DIRECTION = 0x12, VITESSE = 0x13, COMPTE = 0x14;
const PATIENCE = 0x20, CASE_DE_TRAVAIL = 0x4D, CIBLE_COLONNE = 0x56, CIBLE_RANGEE = 0x57, METIER = 0x59;
const AVANCEE = 0xB4932;              // 2 octets signés par direction : (dx, dy)
const FIGURES = 0xD3B38;              // pointeur : table de mots, figure → objet graphique
const OBJETS_GRAPHIQUES = 0xD3B80;    // pointeur : 8 octets par objet graphique, +6 l'image suivante
const COMPTEUR_DE_MISES_A_JOUR = 0xD3AF8;
const LIMITE_DU_CHEMIN = 0x32, SOLS_INTERDITS = 0x39C5;   // comme l'amuseur (personnel.js)
const ARRIVEE = 4;
const PATIENCE_A_LA_REPRISE = 400;

const figure = (jeu, n) => mot(jeu, long(jeu, FIGURES) + 2 * u16(n));
const ficheDuMetier = (jeu, o) => METIERS + octet(jeu, o + METIER) * TAILLE_METIER;
const figureDeMarche = (jeu, o) => figure(jeu, mot(jeu, ficheDuMetier(jeu, o) + METIER_MARCHE) + octet(jeu, o + DIRECTION));

function animer(jeu, o) {
  poserMot(jeu, o + GRAPHIQUE, mot(jeu, long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, o + GRAPHIQUE) + 6));
}

// Un pas de marche, s'il reste du chemin à faire dans la case : l'animation avance tous les quatre
// pas de simulation. Rend la case visée, les coordonnées fines sur 16 bits.
function marcher(jeu, o) {
  if ((octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 3) === 0) animer(jeu, o);
  const d = 2 * octet(jeu, o + DIRECTION), vitesse = octet(jeu, o + VITESSE);
  const x = u16(mot(jeu, o + X) + s8(octet(jeu, AVANCEE + d)) * vitesse);
  const y = u16(mot(jeu, o + Y) + s8(octet(jeu, AVANCEE + d + 1)) * vitesse);
  jeu.appeler(DEPLACER, o, x, y);
  return { x, y };
}

// Le compte à rebours diminue ; rend vrai s'il est arrivé au bout (la case traversée).
function caseTraversee(jeu, o) {
  poserMot(jeu, o + COMPTE, mot(jeu, o + COMPTE) - 1);
  return motSigne(jeu, o + COMPTE) <= 0;
}

function viser(jeu, o, index) {
  poserOctet(jeu, o + CIBLE_COLONNE, index % 64);
  poserOctet(jeu, o + CIBLE_RANGEE, (index / 64) | 0);
}

const chercherSonChemin = (jeu, o) => jeu.appeler(CHERCHER_SON_CHEMIN, o, LIMITE_DU_CHEMIN, SOLS_INTERDITS);
const arrive = (direction) => s16(direction) < 0 || u16(direction) === ARRIVEE;

// Repartir dans la direction trouvée : le temps de traverser une case (256 / vitesse), et l'image de
// la marche.
function repartir(jeu, o, direction) {
  recalerAuMilieuDeLaCase(jeu, o);   // hors du jeu d'origine : corrections.js, éteint par défaut
  const vitesse = octet(jeu, o + VITESSE);
  const delai = vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : quotient(256, vitesse);
  poserMot(jeu, o + COMPTE, delai);
  poserOctet(jeu, o + DIRECTION, direction);
  poserMot(jeu, o + GRAPHIQUE, figureDeMarche(jeu, o));
}

// 0x3502B — état 0x3A : le gréviste marche vers l'entrée du parc. Arrivé (ou sans chemin), il se
// pose au milieu de sa case et manifeste (0x3C) ; rend alors 1.
const allerALEntree = dansLeCadre(0x14, (jeu, cadre, o) => {
  if (motSigne(jeu, o + COMPTE) > 0) poserLong(jeu, cadre.local(8), marcher(jeu, o).x);
  if (!caseTraversee(jeu, o)) return 0;
  viser(jeu, o, mot(jeu, comptes(jeu) + ENTREE_DU_PARC));
  const direction = chercherSonChemin(jeu, o);
  if (arrive(direction)) {
    poserOctet(jeu, o + ETAT, ETAT_MANIFESTER);
    poserMot(jeu, o + GRAPHIQUE, figureDeMarche(jeu, o));
    poserOctet(jeu, o + X, 0x80);
    poserOctet(jeu, o + Y, 0x80);
    return 1;
  }
  repartir(jeu, o, direction);
  return 0;
});

// 0x35208 — état 0x3C : manifester. Le gréviste va et vient : arrivé à sa case visée, il en vise une
// autre sur la rangée de l'entrée, à une colonne tirée entre −8 et +7 de celle de l'entrée — sauf si
// la case visée n'était pas celle de l'entrée même, auquel cas il y retourne. Rend toujours 0.
const manifester = dansLeCadre(0x14, (jeu, cadre, o) => {
  if (motSigne(jeu, o + COMPTE) > 0) poserLong(jeu, cadre.local(8), marcher(jeu, o).y);
  if (!caseTraversee(jeu, o)) return 0;
  let direction = chercherSonChemin(jeu, o);
  if (arrive(direction)) {
    const entree = mot(jeu, comptes(jeu) + ENTREE_DU_PARC);
    if (octet(jeu, o + CIBLE_COLONNE) === entree % 64 && octet(jeu, o + CIBLE_RANGEE) === ((entree / 64) | 0)) {
      const ecart = reste(u16(jeu.appeler(HASARD)), 16) - 8;
      poserOctet(jeu, o + CIBLE_COLONNE, entree % 64 + ecart);
    } else {
      viser(jeu, o, entree);
    }
    direction = chercherSonChemin(jeu, o);
  }
  repartir(jeu, o, direction);
  return 0;
});

// 0x3542D — état 0x3E : la grève finie, l'employé revient à la case notée en +0x4D. Arrivé (ou sans
// chemin), il reprend son état d'embauche, avec une patience et un compte de 400 ; le mécanicien
// (état 8) y prend l'image d'attente, sans direction, les autres celle de la marche. Rend alors 1.
const reprendreLeTravail = dansLeCadre(0x14, (jeu, cadre, o) => {
  if (motSigne(jeu, o + COMPTE) > 0) poserLong(jeu, cadre.local(8), marcher(jeu, o).x);
  if (!caseTraversee(jeu, o)) return 0;
  viser(jeu, o, mot(jeu, o + CASE_DE_TRAVAIL));
  const direction = chercherSonChemin(jeu, o);
  if (arrive(direction)) {
    const fiche = ficheDuMetier(jeu, o);
    poserOctet(jeu, o + ETAT, octet(jeu, fiche + METIER_ETAT_D_EMBAUCHE));
    poserLong(jeu, o + PATIENCE, PATIENCE_A_LA_REPRISE);
    poserMot(jeu, o + COMPTE, PATIENCE_A_LA_REPRISE);
    if (mot(jeu, fiche + METIER_ETAT_D_EMBAUCHE) === MECANICIEN) poserMot(jeu, o + GRAPHIQUE, figure(jeu, mot(jeu, fiche + METIER_ATTENTE)));
    else poserMot(jeu, o + GRAPHIQUE, figureDeMarche(jeu, o));
    return 1;
  }
  repartir(jeu, o, direction);
  return 0;
});

// --- les entrées -----------------------------------------------------------------------------------
// Les négociations et la grève écrivent dans le tas (les objets du parc, les banques d'images) : la
// comparaison appel par appel restaure et compare toute la mémoire.
export const reecritures = [
  { adresse: 0x11601, nom: 'copierUnRectangle', arguments: 6,
    fn: (jeu, source, destination, x, y, l, h) => copierUnRectangle(jeu, source, destination, x, y, l, h),
    zones: (jeu, source, destination) => [[destination >>> 0, (destination >>> 0) + 640 * 480]] },
  { adresse: 0x46F27, nom: 'repondre', fn: (jeu, parts, genre) => repondre(jeu, parts, genre), arguments: 2 },
  { adresse: 0x44EA5, nom: 'negocier', fn: negocier, arguments: 1, memoire: 'entiere' },
  { adresse: 0x3502B, nom: 'allerALEntree', fn: allerALEntree, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x35208, nom: 'manifester', fn: manifester, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x3542D, nom: 'reprendreLeTravail', fn: reprendreLeTravail, arguments: 1, retour: true, memoire: 'entiere' },
];

export const enAttente = [];
