// Le socle système : le curseur logiciel, la carte vidéo, la souris, le tas, les fichiers, le son de
// Bullfrog, et la part de la bibliothèque C de Watcom qui n'est pas le moteur de printf.
//
// Réécriture lisible de soixante-quatorze petites routines, que tout le reste du programme appelle.
// Voir docs/guide-reecriture.md ; docs/retro-ingenierie.md § 6.6 pour le curseur et la présentation,
// § 9 pour le son, § 12 pour la bibliothèque C.
//
// Huit familles, dans l'ordre du fichier :
//
//  1. LE CURSEUR LOGICIEL (0x7D2DD, 0x7D6C5, 0x7D79E, 0x7D7C7, 0x7DDD7). Le pointeur de la souris
//     n'est pas celui du pilote : le jeu le dessine lui-même, 64x64 pixels au plus, dans l'image en
//     construction, juste avant de la présenter (0x7D775, que l'hôte garde pour repère d'image), en
//     gardant les pixels recouverts dans deux tampons de 4 Ko. La couleur 0xFE de l'image du
//     curseur est la transparence.
//  2. LA SOURIS (0x7DF44, 0x7E0E1, 0x7E126, 0x7E570) : installation du gestionnaire d'événements
//     0x7D7E2 par l'int 33h, plage du pointeur, remise à zéro.
//  3. LA CARTE VIDÉO (0x7EC50, 0x7ECF0, 0x7E580, 0x7E658, 0x7E6BC, 0x808B0, 0x80250, 0x80BE4,
//     0x80C00, 0x80C40, 0x7F5BC, 0x81D88, 0x81590, 0x7C282, 0x7C32D, 0x821DF) : les deux modes
//     (13h et VESA 0x101), la banque VESA, la palette, les pixels et les rectangles pleins.
//  4. LES INTERRUPTIONS (0x7F085, 0x816B5, 0x81688, 0x8164E, 0x828EB, 0x7F49D, 0x7F49F, 0x7F16A,
//     0x82D6C) : int386, int386x, segread, _dos_getvect, _dos_setvect, cli, sti, kbhit, et un bloc
//     de mémoire DOS par le DPMI.
//  5. LE TAS DU JEU (0x7E8D0, 0x7E9B8, 0x7EA98, 0x82C78, 0x82930) : 256 descripteurs de bloc en
//     0xDF9C8, chaînés, qu'on découpe au plus juste.
//  6. LES FICHIERS (0x7EB70, 0x7EBE0, 0x7EC20, 0x7ED80, 0x7F0B0, 0x7F4B0, 0x7F57D, 0x7F45A,
//     0x82E64, 0x82F13, 0x82FF8, 0x7E83E, 0x7E888) : ouvrir, lire, fermer, charger un fichier
//     compressé RNC, fopen.
//  7. LA BIBLIOTHÈQUE C (0x7E1D8, 0x7E1ED, 0x7E216, 0x7E822, 0x7F1A0, 0x80958, 0x81336, 0x81C7C,
//     0x81E00, 0x811AA, 0x81184, 0x7F63C, 0x7F652, 0x7E860) : toupper, strcpy, atoi, strlen,
//     memset, memcpy, strcat, strncpy, strcmp, qsort et son échange, sprintf et sa sortie.
//  8. LE SON DE BULLFROG (0x80350, 0x80990, 0x80A20, 0x80DC0, 0x80E40, 0x81984, 0x81AD0) : la
//     couche du jeu au-dessus de la bibliothèque HMI SOS (§ 9.3).
//
// LA PILE. Les routines qui passent l'adresse d'une variable locale (les registres d'un int386,
// un en-tête de fichier) la posent où l'original la posait : `avecCadre` descend le pointeur de
// pile comme le prologue d'origine, et les appels partent de la même hauteur. Ce n'est pas exigé
// par les vérificateurs, sauf pour les structures de registres : l'hôte lit les champs que le jeu
// n'a pas remplis, et y trouve, comme dans l'original, ce qui traîne sur la pile.
//
// LES ROUTINES QUE L'HÔTE A REMPLACÉES restent en attente : 0x7D775 (le repère d'image, que l'hôte
// enveloppe pour faire avancer son horloge : la remplacer lui ôterait son repère) et 0x821BE
// (_chain_intr, qui défait la pile du gestionnaire et saute par un `retf`).

import { ecran, quitterLaVueDuParc } from './grande-vue.js';
import { reglages } from './reglages.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

const TOUS_REGISTRES = ['eax', 'ecx', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'];

// Exécuter `corps(ebp)` avec le pointeur de pile là où l'original l'avait après son prologue :
// `sauves` octets de registres empilés (ebp compris, qui est donc l'entrée moins `sauves`), puis
// `locales` octets de variables. Les appels faits dans `corps` empilent à la même hauteur que ceux
// de l'original, et ne recouvrent pas les variables qu'on a posées en mémoire.
function avecCadre(jeu, sauves, locales, corps) {
  const T = jeu.T;
  T.sauver();
  const entree = T.R.esp;
  const ebp = ((entree >>> 0) - sauves) >>> 0;
  T.R.esp = (ebp - locales) | 0;
  T.charger();
  try {
    return corps(ebp);
  } finally {
    T.sauver();
    T.R.esp = entree;
    T.charger();
  }
}

// Appeler une routine en assembleur qui prend ses paramètres dans les registres : on les pose,
// on empile l'adresse de retour d'origine, et le `ret` de l'appelée la retire. Rend les registres.
function appelerRegistres(jeu, adresse, retour, registres) {
  const T = jeu.T;
  T.sauver();
  const R = T.R;
  Object.assign(R, registres);
  R.esp = (R.esp - 4) | 0;
  jeu.machine.w32(R.esp >>> 0, retour);
  T.charger();
  T.appeler(adresse);
  T.sauver();
  return R;
}

// Un service de l'hôte (interruption, port), rendu depuis une réécriture. Dans une réécriture,
// c'est T.R qui fait foi : l'enveloppe (index.js) l'a relevé à l'entrée et le rechargera au retour,
// et la réécriture y pose ses registres. On le recharge donc avant le service — l'hôte peut y
// livrer une interruption, dont le gestionnaire relève les registres du code interrompu — et
// après, pour ce que le service a rendu.
function interruption(jeu, n) {
  jeu.T.charger();
  jeu.machine.interruption(n);
  jeu.T.charger();
}
function sortiePort(jeu, port, valeur) {
  jeu.T.charger();
  jeu.machine.sortie(port & 0xFFFF, valeur & 0xFF, 1);
  jeu.T.charger();
}
function entreePort(jeu, port) {
  jeu.T.charger();
  const v = jeu.machine.entree(port & 0xFFFF, 1);
  jeu.T.charger();
  return v & 0xFF;
}

// --- les variables --------------------------------------------------------------------------
const MODE_AFFICHAGE = 0xDE5F6;       // mot : 1 basse résolution (320x200), 8 haute (640x480)
const SURFACE = 0xDE5BC;              // pointeur vers l'image en construction
const PAS_LIGNE = 0xDE5B8;            // octets par ligne de la surface : 320 ou 640
const HAUTEUR_ECRAN = 0xDE5C0;        // lignes de l'écran : 200 ou 480
const TABLE_FUSION = 0xBA2F8;         // table de fusion, 256 x 256 (le traceur s'en sert aussi)
const DRAPEAUX_DE_TRACE = 0xBECBC;    // mot : le bit 4 fait fusionner les rectangles pleins
const PALETTE_COURANTE = 0xD35AC;     // pointeur vers les 768 octets de la palette posée

// La fenêtre de tracé (§ 6.5) et sa sauvegarde, le temps de décoder l'image du curseur.
const FENETRE = [0xDE5E0, 0xDE5D8, 0xDE5D0, 0xDE5EC, 0xDE5C8, 0xDE5F0];
const FENETRE_SAUVEE = [0xDE5DC, 0xDE5D4, 0xDE5CC, 0xDE5E4, 0xDE5C4, 0xDE5E8];

// Le curseur logiciel.
const CURSEUR_X = 0xBECAC, CURSEUR_Y = 0xBECAE;   // mots : position, en unités de 640x480
const CURSEUR_AFFICHE = 0xBECB4;      // mot long : 0 tant que la souris n'est pas installée
const TRACE_DIRECT_SUSPENDU = 0xBECA4; // mot long : le gestionnaire 0x7D7E2 ne trace pas à l'écran
const IMAGE_DU_CURSEUR = 0xBECB8;     // pointeur vers l'image (format du traceur) à décoder
const CURSEUR_DECODE = 0xDE590;       // pointeur : l'image décodée, 64x64, 0xFE transparent
const FOND_SOUS_LE_CURSEUR = 0xDE564; // pointeur : les pixels recouverts, pour les remettre
const FOND_SOUS_LE_CURSEUR_2 = 0xDE554; // pointeur : seconde copie (pour le tracé direct 0x7D4F9)
const CURSEUR_LARGEUR = 0xDE58C, CURSEUR_HAUTEUR = 0xDE58E;   // mots : taille de l'image décodée
const CURSEUR_PAS = 0xDE594;          // mot : largeur d'une ligne de l'image décodée, 64
// Les variables de travail du tracé du curseur, en mémoire comme dans l'original.
const CUR_X = 0xDE55C, CUR_Y = 0xDE55E;           // mots : position dans la surface
const CUR_X_640 = 0xDE54C, CUR_Y_640 = 0xDE54E;   // mots : position d'origine, pour 0x7D4F9
const CUR_DECALAGE = 0xDE568;         // décalage du coin dans la surface
const CUR_DECALAGE_2 = 0xDE558;       // le même, pour 0x7D4F9
const CUR_LARGEUR = 0xDE560, CUR_HAUTEUR = 0xDE562;   // mots : partie visible (coupée au bord)
const CUR_LARGEUR_2 = 0xDE550, CUR_HAUTEUR_2 = 0xDE552;
const CUR_ECRITURE = 0xDE570;         // pointeur courant dans la surface
const CUR_IMAGE = 0xDE56C;            // pointeur courant dans l'image décodée
const CUR_SAUVE = 0xDE574, CUR_SAUVE_2 = 0xDE578; // pointeurs courants dans les deux sauvegardes
const CUR_COLONNE = 0xDE59A, CUR_LIGNE = 0xDE59C; // mots : compteurs des boucles
const TRANSPARENT = 0xFE;
const COTE_DU_CURSEUR = 0x40;

// La souris.
const GESTIONNAIRE_DE_SOURIS = 0x7D7E2;
const SELECTEUR_DES_DONNEES = 0x7E340;  // mot, dans le code : le ds du programme, pour ses gestionnaires
const RESSOURCE_DE_LA_SOURIS = 0xDE580; // pointeur, libéré par 0x7EDC0 à la remise à zéro

// La carte vidéo.
const MODE_TEXTE_D_ORIGINE = 0xDE5F4; // mot : le mode vidéo trouvé au lancement
const INFOS_VESA = 0xDE5F8;           // pointeur (mémoire DOS) : le bloc d'informations du mode
const GRANULARITE_VESA = 0xDE5FC;     // mot : granularité des banques, en Ko
const BANQUE_COURANTE = 0xBECDC;      // mot

// Le tas du jeu : 256 descripteurs de 0x12 octets.
//   +0 adresse du bloc, +4 taille (0 : descripteur libre), +8 suivant, +0xC précédent,
//   +0x10 octet « pris », +0x11 octet « sorte », index dans la table 0xDEDCC (12 octets par sorte).
const DESCRIPTEURS = 0xDF9C8, FIN_DES_DESCRIPTEURS = 0xE0BC8, TAILLE_DESCRIPTEUR = 0x12;
const SORTES_DE_BLOCS = 0xDEDCC;
// Le bilan du tas (0x82C78) : total, libre, pris, plus grand et plus petit bloc libre.
const TAS_TOTAL = 0xE0BC8, TAS_LIBRE = 0xE0BCC, TAS_PRIS = 0xE0BD0;
const TAS_PLUS_GRAND = 0xE0BD4, TAS_PLUS_PETIT = 0xE0BD8;

// Le son (§ 9.3).
const MUSIQUE_PRETE = 0xBA714, MUSIQUE_VOULUE = 0xBA715;
const BRUITAGES_PRETS = 0xBA720, BRUITAGES_VOULUS = 0xBA721;
const MORCEAU_EN_COURS = 0xBA71A;     // mot : 0 aucun
const NOMBRE_DE_MORCEAUX = 0xBA71D;   // mot
const TEMPO = 0xBA718;                // mot : en pour cent
const SECONDE_PISTE = 0xBA710;        // octet : un second pilote de musique à arrêter aussi
const MORCEAU_SOS = 0xD7984, PILOTE_MUSIQUE = 0xD7980, PILOTE_MUSIQUE_2 = 0xD78DC;
const BANQUE_DE_MUSIQUE = 0xD790C, BANQUE_DE_BRUITAGES = 0xD7B60;
const NOMBRE_DE_BRUITAGES = 0xD7B68;  // mot
const PILOTE_NUMERIQUE = 0xD7B44;
const ECHANTILLONS = 0xD7998;         // 32 x (propriétaire, bruitage), deux mots chacun
const NOMBRE_D_ECHANTILLONS = 0x20;
const VOLUMES = 0xD7A18;              // 32 mots
const DEPART = 0xBA729;               // la structure _SOS_START_SAMPLE
const DERNIER_ECHANTILLON = 0xD7B40;
const MORCEAU_A_CHARGER = 0xDED08;    // structure de chargement d'un morceau (pointeur lointain...)

// --- les fonctions d'autres modules ou non réécrites ---------------------------------------------
const PRESENTER_BASSE = 0x80210, PRESENTER_HAUTE = 0x55507;
const MARQUER_LES_BLOCS = 0x54D38;    // (x, y, largeur, hauteur)
const TRACER_UNE_IMAGE = 0x5EC9C;     // (x, y, image)
const POSER_LA_FENETRE = 0x87790;     // (gauche, haut, largeur, hauteur)
const REMPLIR_REGISTRES = 0x87E30;    // le cœur de memset : eax destination, edx motif, ecx compte
const PRTF = 0x883DF;                 // le moteur de printf (bibliotheque.js)
const VFPRINTF = 0x87524;             // (flux, format, &arguments)
const SORTIE_D_ERREUR = 0xC2D8E;      // le flux stderr
const COEUR_INT386X = 0x89F90;        // remplacé par l'hôte
const AMORCER_LE_TAS = 0x82950;       // ecran-parc.js
const LIBERER = 0x7EDC0;
const TOLOWER = 0x8A987, ERRNO = 0x8A99C;

// ================================================================================================
// 1. Le curseur logiciel
// ================================================================================================

// 0x7D2DD — dessiner le curseur dans la surface, en gardant ce qu'il recouvre.
//
// La position (0xBECAC, 0xBECAE) est en unités de 640x480 ; en basse résolution elle est divisée
// par deux. Le curseur est coupé au bord droit et au bord bas de l'écran (jamais à gauche ni en
// haut : il ne sort pas par là). Chaque pixel recouvert est recopié dans les deux sauvegardes ;
// seuls les pixels non transparents de l'image sont posés. Les 64x64 pixels sous la position
// d'origine sont marqués pour la présentation par blocs (0x54D38), même si l'image est plus petite.
//
// Toutes les variables de travail restent en mémoire, avec la valeur que l'original leur laissait :
// 0x7D6C5 et le tracé direct 0x7D4F9 s'en resservent.
function poserLeCurseurDansLImage(jeu) {
  const { m8 } = jeu;
  const x640 = mot(jeu, CURSEUR_X), y640 = mot(jeu, CURSEUR_Y);
  let x = x640, y = y640;
  if (mot(jeu, MODE_AFFICHAGE) & 1) { x = s16(x) >> 1; y = s16(y) >> 1; }
  poserMot(jeu, CUR_X, x); poserMot(jeu, CUR_X_640, x640);
  poserMot(jeu, CUR_Y, y); poserMot(jeu, CUR_Y_640, y640);

  const pas = long(jeu, PAS_LIGNE);
  const decalage = (Math.imul(s16(y), pas) + s16(x)) | 0;
  poserLong(jeu, CUR_DECALAGE, decalage);
  poserLong(jeu, CUR_DECALAGE_2, decalage);

  // La partie visible : ce qui reste jusqu'au bord, au plus la taille de l'image (comparaisons
  // signées sur 16 bits).
  let largeur = s16(mot(jeu, PAS_LIGNE) - x);
  if (largeur > motSigne(jeu, CURSEUR_LARGEUR)) largeur = motSigne(jeu, CURSEUR_LARGEUR);
  poserMot(jeu, CUR_LARGEUR, largeur); poserMot(jeu, CUR_LARGEUR_2, largeur);
  let hauteur = s16(mot(jeu, HAUTEUR_ECRAN) - y);
  if (hauteur > motSigne(jeu, CURSEUR_HAUTEUR)) hauteur = motSigne(jeu, CURSEUR_HAUTEUR);
  poserMot(jeu, CUR_HAUTEUR, hauteur); poserMot(jeu, CUR_HAUTEUR_2, hauteur);

  let sauve = long(jeu, FOND_SOUS_LE_CURSEUR);
  let sauve2 = long(jeu, FOND_SOUS_LE_CURSEUR_2);
  let ecriture = (long(jeu, SURFACE) + decalage) >>> 0;
  let image = long(jeu, CURSEUR_DECODE);
  poserLong(jeu, CUR_SAUVE, sauve); poserLong(jeu, CUR_SAUVE_2, sauve2);
  poserLong(jeu, CUR_ECRITURE, ecriture); poserLong(jeu, CUR_IMAGE, image);

  jeu.appeler(MARQUER_LES_BLOCS, motSigne(jeu, CURSEUR_X), motSigne(jeu, CURSEUR_Y),
    COTE_DU_CURSEUR, COTE_DU_CURSEUR);

  // Les compteurs sont des mots non signés comparés à la taille signée : une taille négative
  // (curseur hors de l'écran) ne trace rien.
  const finDeLigne = (pas - largeur) | 0;
  const finDImage = (motSigne(jeu, CURSEUR_PAS) - largeur) | 0;
  let ligne = 0, colonne = mot(jeu, CUR_COLONNE);
  for (; ligne < hauteur; ligne = (ligne + 1) & 0xFFFF) {
    for (colonne = 0; colonne < largeur; colonne = (colonne + 1) & 0xFFFF) {
      const fond = m8[ecriture];
      m8[sauve++] = fond;
      m8[sauve2++] = m8[ecriture];
      if (m8[image] !== TRANSPARENT) m8[ecriture] = m8[image];
      ecriture++; image++;
    }
    ecriture = (ecriture + finDeLigne) >>> 0;
    image = (image + finDImage) >>> 0;
  }
  poserMot(jeu, CUR_LIGNE, ligne); poserMot(jeu, CUR_COLONNE, colonne);
  poserLong(jeu, CUR_SAUVE, sauve); poserLong(jeu, CUR_SAUVE_2, sauve2);
  poserLong(jeu, CUR_ECRITURE, ecriture); poserLong(jeu, CUR_IMAGE, image);
}

// 0x7D6C5 — remettre dans la surface les pixels que le curseur recouvrait (première sauvegarde).
function remettreLeFondDuCurseur(jeu) {
  const { m8 } = jeu;
  let sauve = long(jeu, FOND_SOUS_LE_CURSEUR);
  let ecriture = (long(jeu, SURFACE) + long(jeu, CUR_DECALAGE)) >>> 0;
  const largeur = motSigne(jeu, CUR_LARGEUR), hauteur = motSigne(jeu, CUR_HAUTEUR);
  const finDeLigne = (long(jeu, PAS_LIGNE) - largeur) | 0;
  let ligne = 0, colonne = mot(jeu, CUR_COLONNE);
  for (; ligne < hauteur; ligne = (ligne + 1) & 0xFFFF) {
    for (colonne = 0; colonne < largeur; colonne = (colonne + 1) & 0xFFFF) m8[ecriture++] = m8[sauve++];
    ecriture = (ecriture + finDeLigne) >>> 0;
  }
  poserMot(jeu, CUR_LIGNE, ligne); poserMot(jeu, CUR_COLONNE, colonne);
  poserLong(jeu, CUR_SAUVE, sauve); poserLong(jeu, CUR_ECRITURE, ecriture);
}

// 0x7D79E — après une présentation : effacer le curseur de la surface, puis rendre le tracé du
// pointeur au gestionnaire de souris.
function effacerLeCurseur(jeu) {
  if (long(jeu, CURSEUR_AFFICHE) !== 0) remettreLeFondDuCurseur(jeu);
  poserLong(jeu, TRACE_DIRECT_SUSPENDU, 0);
}

// 0x7D7C7 — après une présentation : rendre seulement le tracé au gestionnaire (le curseur reste
// dans la surface, que la restauration du fond effacera).
function rendreLeTraceDuCurseur(jeu) {
  poserLong(jeu, TRACE_DIRECT_SUSPENDU, 0);
}

// 0x7DDD7 — décoder l'image du curseur dans son tampon de 64x64.
//
// Le tampon est d'abord rempli de la couleur transparente, puis l'image y est tracée par le traceur
// ordinaire (0x5EC9C), le temps duquel la surface de dessin, son pas, la fenêtre et les drapeaux de
// tracé sont détournés vers le tampon. La taille de l'image est lue dans ses octets 4 et 5, divisée
// par deux en basse résolution (l'image est pour 640x480).
function decoderLImageDuCurseur(jeu, image) {
  avecCadre(jeu, 16, 0xC, () => {
    jeu.appeler(0x7F1A0, long(jeu, CURSEUR_DECODE), TRANSPARENT, 0x1000);
    const surface = long(jeu, SURFACE);
    poserLong(jeu, SURFACE, long(jeu, CURSEUR_DECODE));
    let largeur = jeu.m8[image + 4], hauteur = jeu.m8[image + 5];
    if (mot(jeu, MODE_AFFICHAGE) & 1) { largeur >>= 1; hauteur >>= 1; }
    poserMot(jeu, CURSEUR_LARGEUR, largeur);
    poserMot(jeu, CURSEUR_HAUTEUR, hauteur);

    for (let k = 0; k < 6; k++) poserLong(jeu, FENETRE_SAUVEE[k], long(jeu, FENETRE[k]));
    // haut 0, bas 64, gauche 0, droite 64, largeur 64, hauteur 64
    const carre = [0, COTE_DU_CURSEUR, 0, COTE_DU_CURSEUR, COTE_DU_CURSEUR, COTE_DU_CURSEUR];
    for (let k = 0; k < 6; k++) poserLong(jeu, FENETRE[k], carre[k]);
    const drapeaux = mot(jeu, DRAPEAUX_DE_TRACE);
    poserMot(jeu, DRAPEAUX_DE_TRACE, 0);
    const pas = long(jeu, PAS_LIGNE);
    poserLong(jeu, PAS_LIGNE, COTE_DU_CURSEUR);

    jeu.appeler(TRACER_UNE_IMAGE, 0, 0, image);

    poserLong(jeu, PAS_LIGNE, pas);
    poserMot(jeu, DRAPEAUX_DE_TRACE, drapeaux);
    for (let k = 0; k < 6; k++) poserLong(jeu, FENETRE[k], long(jeu, FENETRE_SAUVEE[k]));
    poserLong(jeu, SURFACE, surface);
  });
}

// ================================================================================================
// 2. La souris
// ================================================================================================
//
// Les registres d'un int386 : sept mots longs, eax, ebx, ecx, edx, esi, edi, puis l'indicateur de
// retenue en sortie. Les SREGS : es, cs, ss, ds, fs, gs.
const REGS_EAX = 0, REGS_ECX = 8, REGS_EDX = 12, REGS_CFLAG = 24;
const SREGS_ES = 0;
const INT_SOURIS = 0x33, INT_VIDEO = 0x10, INT_DPMI = 0x31;

// 0x7DF44 — installer la souris : rend 1 si elle est là.
//
// Remise à zéro du pilote (fonction 0) : sans pilote, rien d'autre. Puis le gestionnaire
// d'événements 0x7D7E2, pour tous les événements (masque 0x7F, fonction 0xC), la plage du pointeur
// (0x7E126), les trois tampons de 4 Ko du curseur, pris sur le tas du jeu (rend 0 s'il en manque
// un), l'image du curseur décodée s'il y en a une, le pointeur du pilote caché (fonction 2), et en
// haute résolution une sensibilité d'un mickey par point (fonction 0xF).
function installerLaSouris(jeu) {
  return avecCadre(jeu, 16, 0x54, (ebp) => {
    const entree = ebp - 0x38, sortie = ebp - 0x54, sregs = ebp - 0x1C;
    poserLong(jeu, CURSEUR_AFFICHE, 0);
    jeu.appeler(0x81688, sregs);
    poserMot(jeu, entree + REGS_EAX, 0);
    jeu.appeler(0x7F085, INT_SOURIS, entree, sortie);
    if (motSigne(jeu, sortie + REGS_EAX) !== -1) return 0;

    const cs = jeu.T.R.cs & 0xFFFF;
    poserMot(jeu, entree + REGS_EAX, 0xC);
    poserMot(jeu, entree + REGS_ECX, 0x7F);
    poserMot(jeu, ebp - 0xC, cs);
    poserLong(jeu, ebp - 0x10, GESTIONNAIRE_DE_SOURIS);
    poserLong(jeu, entree + REGS_EDX, GESTIONNAIRE_DE_SOURIS);
    poserMot(jeu, sregs + SREGS_ES, cs);
    jeu.appeler(0x816B5, INT_SOURIS, entree, sortie, sregs);
    jeu.appeler(0x7E126);

    poserLong(jeu, CURSEUR_DECODE, jeu.appeler(0x7E8D0, 0x1000));
    poserLong(jeu, FOND_SOUS_LE_CURSEUR, jeu.appeler(0x7E8D0, 0x1000));
    poserLong(jeu, FOND_SOUS_LE_CURSEUR_2, jeu.appeler(0x7E8D0, 0x1000));
    if (long(jeu, CURSEUR_DECODE) === 0 || long(jeu, FOND_SOUS_LE_CURSEUR) === 0
      || long(jeu, FOND_SOUS_LE_CURSEUR_2) === 0) return 0;

    poserMot(jeu, CURSEUR_LARGEUR, 0);
    poserMot(jeu, CURSEUR_HAUTEUR, 0);
    poserMot(jeu, CURSEUR_PAS, COTE_DU_CURSEUR);
    const tampon = long(jeu, CURSEUR_DECODE);
    jeu.m8.fill(TRANSPARENT, tampon, tampon + 0x1000);
    poserLong(jeu, ebp - 8, 0x1000);        // le compteur de la boucle, laissé à sa valeur finale
    if (long(jeu, IMAGE_DU_CURSEUR) !== 0) jeu.appeler(0x7DDD7, long(jeu, IMAGE_DU_CURSEUR));

    poserMot(jeu, entree + REGS_EAX, 2);
    jeu.appeler(0x7F085, INT_SOURIS, entree, sortie);
    poserLong(jeu, CURSEUR_AFFICHE, 1);
    if (mot(jeu, MODE_AFFICHAGE) & 8) {
      poserMot(jeu, entree + REGS_EAX, 0xF);
      poserMot(jeu, entree + REGS_ECX, 1);
      poserMot(jeu, entree + REGS_EDX, 1);
      jeu.appeler(0x7F085, INT_SOURIS, entree, sortie);
    }
    return 1;
  });
}

// 0x7E0E1 — remettre le pilote à zéro (ce qui oublie le gestionnaire), libérer la ressource
// [0xDE580] s'il y en a une, et marquer le curseur comme non installé.
function arreterLaSouris(jeu) {
  avecCadre(jeu, 16, 0x38, (ebp) => {
    poserMot(jeu, ebp - 0x1C + REGS_EAX, 0);
    jeu.appeler(0x7F085, INT_SOURIS, ebp - 0x1C, ebp - 0x38);
    if (long(jeu, RESSOURCE_DE_LA_SOURIS) !== 0) jeu.appeler(LIBERER, long(jeu, RESSOURCE_DE_LA_SOURIS));
    poserLong(jeu, CURSEUR_AFFICHE, 0);
  });
}

// 0x7E126 — la plage du pointeur (fonctions 7 et 8) : en haute résolution 0 à 0x1400 sur 0 à
// 0xF00 — huit fois l'écran, le pilote comptant huit fois plus fin —, en basse 0 à 640 sur 0 à 400.
// Un autre mode ne fait rien. (0x11303, dans souris-jeu.js, fait la même chose avec des bornes.)
function plageDeLaSouris(jeu) {
  const mode = mot(jeu, MODE_AFFICHAGE);
  const plages = mode === 8 ? [0x1400, 0xF00] : mode === 1 ? [0x280, 0x190] : null;
  if (!plages) return;
  avecCadre(jeu, 16, 0x38, (ebp) => {
    const entree = ebp - 0x1C;
    // cx le minimum, dx le maximum ; seuls les mots bas sont écrits.
    poserMot(jeu, entree + REGS_EAX, 7);
    poserMot(jeu, entree + REGS_ECX, 0); poserMot(jeu, entree + REGS_EDX, plages[0]);
    jeu.appeler(0x7F085, INT_SOURIS, entree, ebp - 0x38);
    poserMot(jeu, entree + REGS_EAX, 8);
    poserMot(jeu, entree + REGS_ECX, 0); poserMot(jeu, entree + REGS_EDX, plages[1]);
    jeu.appeler(0x7F085, INT_SOURIS, entree, ebp - 0x38);
  });
}

// 0x7E570 — l'entrée des gestionnaires d'interruption : recharger ds avec le sélecteur des
// données du programme, gardé dans le code.
function selecteurDesDonnees(jeu, R) {
  R.ds = mot(jeu, SELECTEUR_DES_DONNEES);
}

// ================================================================================================
// 3. La carte vidéo
// ================================================================================================

// 0x7EC50 — passer en 320x200 (mode 13h), poser la palette, la plage de la souris et la fenêtre.
// La première fois, le mode trouvé au lancement est noté (fonction 0Fh), pour le rendre en sortant.
function passerEnBasseResolution(jeu, palette) {
  changerDeMode(jeu, palette, false);
}
// 0x7ECF0 — passer en 640x480 (mode VESA 0x101), de même.
function passerEnHauteResolution(jeu, palette) {
  changerDeMode(jeu, palette, true);
}
function changerDeMode(jeu, palette, haute) {
  quitterLaVueDuParc(jeu);             // hors du jeu d'origine : la grande vue revient en 640x480
  avecCadre(jeu, 16, 0x38, (ebp) => {
    const entree = ebp - 0x1C, sortie = ebp - 0x38;
    poserLong(jeu, entree + REGS_EAX, 0xF00);
    jeu.appeler(0x7F085, INT_VIDEO, entree, sortie);
    if (mot(jeu, MODE_TEXTE_D_ORIGINE) === 0) poserMot(jeu, MODE_TEXTE_D_ORIGINE, jeu.m8[sortie]);
    if (haute) {
      poserLong(jeu, PAS_LIGNE, 640);
      poserLong(jeu, HAUTEUR_ECRAN, 480);
      jeu.appeler(0x7E658, 0x101);
    } else {
      poserLong(jeu, entree + REGS_EAX, 0x13);
      poserLong(jeu, PAS_LIGNE, 320);
      poserLong(jeu, HAUTEUR_ECRAN, 200);
      jeu.appeler(0x7F085, INT_VIDEO, entree, sortie);
    }
    jeu.appeler(0x808B0, palette);
    jeu.appeler(0x7E126);
    jeu.appeler(POSER_LA_FENETRE, 0, 0, haute ? 640 : 320, haute ? 480 : 200);
  });
}

// 0x7E580 — lire les informations du mode VESA (fonction 4F01h) dans le bloc de mémoire DOS
// [0xDE5F8], par le DPMI (fonction 0300h, une interruption en mode réel), et en garder la
// granularité des banques (mot en +4 du bloc) en 0xDE5FC.
//
// La structure du mode réel (0x32 octets, mise à zéro) : edi +0, ecx +0x18, eax +0x1C, es +0x22,
// ds +0x24 — le segment du bloc, son adresse divisée par 16.
function lireLeModeVesa(jeu, mode) {
  avecCadre(jeu, 16, 0x78, (ebp) => {
    const reel = ebp - 0x78, entree = ebp - 0x28, sortie = ebp - 0x44, sregs = ebp - 0xC;
    jeu.appeler(0x7F1A0, reel, 0, 0x32);
    const segment = long(jeu, INFOS_VESA) >>> 4;
    poserMot(jeu, ebp - 0x56, segment);
    poserMot(jeu, ebp - 0x54, segment);
    poserLong(jeu, reel, 0);
    poserLong(jeu, ebp - 0x5C, 0x4F01);
    poserLong(jeu, ebp - 0x60, s16(mode));
    jeu.appeler(0x7F1A0, entree, 0, 0x1C);
    jeu.appeler(0x7F1A0, sortie, 0, 0x1C);
    jeu.appeler(0x7F1A0, sregs, 0, 0xC);
    jeu.appeler(0x81688, sregs);
    poserLong(jeu, entree + REGS_EAX, 0x300);
    poserLong(jeu, entree + 4, INT_VIDEO);        // ebx : l'interruption à simuler
    poserLong(jeu, entree + 20, reel);            // edi : la structure du mode réel
    jeu.appeler(0x816B5, INT_DPMI, entree, sortie, sregs);
    const infos = long(jeu, INFOS_VESA);
    poserMot(jeu, GRANULARITE_VESA, (jeu.m8[infos + 5] << 8) + jeu.m8[infos + 4]);
  });
}

// 0x7E658 — choisir le mode VESA (fonction 4F02h), puis en lire les informations.
function choisirLeModeVesa(jeu, mode) {
  avecCadre(jeu, 16, 0x38, (ebp) => {
    const entree = ebp - 0x1C, sortie = ebp - 0x38;
    jeu.appeler(0x7F1A0, entree, 0, 0x1C);
    jeu.appeler(0x7F1A0, sortie, 0, 0x1C);
    poserMot(jeu, entree + REGS_EAX, 0x4F02);
    poserMot(jeu, entree + 4, mode);               // bx
    jeu.appeler(0x7F085, INT_VIDEO, entree, sortie);
    jeu.appeler(0x7E580, s16(mode));
  });
}

// 0x7E6BC — choisir la banque VESA : la fenêtre de 64 Ko 0xA0000 montre la banque `banque` de
// l'image de 640x480 (0 à 4). La position de la fenêtre se donne en unités de granularité : 64 Ko
// valent 64 / granularité unités. Les deux fenêtres de la carte (A et B, bl = 0 et 1) sont placées
// au même endroit, par l'int 10h directement (fonction 4F05h).
//
// Une banque hors de 0 à 5 passe la couleur 0 au rouge vif (63, 0, 0) : une alarme de mise au
// point, restée dans le jeu. Une granularité nulle ferait planter l'original (division par zéro).
// Hors du jeu d'origine : la grande vue (grande-vue.js) a plus de banques que les cinq du 640x480,
// et sa taille change avec le zoom entre deux présentations ; l'alarme, qui laissait le noir de la
// palette au rouge jusqu'au rechargement suivant, est coupée tant que le réglage est allumé.
function choisirLaBanque(jeu, banque) {
  const R = jeu.T.R;
  const ebx = R.ebx;
  poserMot(jeu, BANQUE_COURANTE, banque);
  const b = s16(banque);
  if (!reglages.grandeVue && (b > 5 || b < 0)) {
    sortiePort(jeu, 0x3C8, 0);
    sortiePort(jeu, 0x3C9, 0x3F);
    sortiePort(jeu, 0x3C9, 0);
    sortiePort(jeu, 0x3C9, 0);
  }
  const granularite = motSigne(jeu, GRANULARITE_VESA);
  if (granularite === 0) throw new Error('division par zéro en 0x7E70C (granularité VESA nulle)');
  const position = ((b << 6) / granularite) | 0;
  for (const fenetre of [0, 1]) {
    R.edx = position; R.ecx = 0; R.ebx = fenetre; R.eax = 0x4F05;
    interruption(jeu, INT_VIDEO);
  }
  R.ebx = ebx;
}

// 0x808B0 — poser la palette : 256 couleurs de trois octets (0 à 63), par le DAC. Le masque des
// pixels (0x3C6) est d'abord ouvert en entier.
function poserLaPalette(jeu, palette) {
  avecCadre(jeu, 16, 8, (ebp) => {
    jeu.appeler(0x821DF, 0x3C6, 0xFF);
    let p = palette;
    for (let couleur = 0; couleur < 0x100; couleur++) {
      jeu.appeler(0x821DF, 0x3C8, couleur);
      jeu.appeler(0x821DF, 0x3C9, jeu.m8[p++]);
      jeu.appeler(0x821DF, 0x3C9, jeu.m8[p++]);
      jeu.appeler(0x821DF, 0x3C9, jeu.m8[p++]);
    }
    poserLong(jeu, ebp - 4, 0x100);
    poserLong(jeu, ebp - 8, p);
  });
}

// 0x821DF — outp(port, octet).
function ecrirePort(jeu, R) {
  const esp = R.esp >>> 0;
  const port = jeu.machine.r32(esp + 4), valeur = jeu.m8[esp + 8];
  R.edx = port | 0;
  R.eax = (R.eax & ~0xFF) | valeur;
  sortiePort(jeu, port, valeur);
}

// 0x80250 — la couleur de la palette la plus proche de (rouge, vert, bleu), en distance
// euclidienne au carré. 16 couleurs seulement dans les modes 2 et 4 (drapeaux 6), 256 sinon.
//
// ANOMALIE, reproduite : la distance, jusqu'à 3 × 63² dans l'usage (et 3 × 255² au plus), est
// comparée sur ses 16 bits bas, signés ; une distance de 32 768 ou plus paraît négative, donc plus
// proche. Le meilleur est initialisé à 9 999 : si aucune couleur ne passe sous ce seuil, le
// résultat est l'octet de la variable jamais écrite [ebp-8] — un reste de pile, 24 octets sous
// l'entrée. Dans l'usage (couleurs de 0 à 63, palette du jeu), il y a toujours mieux.
//
// Le résultat est dans al ; l'octet 1 d'eax garde le 1 du compte de 256 couleurs, comme l'original.
function couleurLaPlusProche(jeu, palette, rouge, vert, bleu) {
  const { m8 } = jeu;
  const couleurs = (mot(jeu, MODE_AFFICHAGE) & 6) ? 0x10 : 0x100;
  const r = rouge & 0xFF, v = vert & 0xFF, b = bleu & 0xFF;
  let meilleure = 0x270F;
  let choisie = -1;
  let p = palette;
  for (let i = 0; i < couleurs; i++, p += 3) {
    const dr = r - m8[p], dv = v - m8[p + 1], db = b - m8[p + 2];
    const distance = (Math.imul(dv, dv) + Math.imul(dr, dr) + Math.imul(db, db)) | 0;
    if (s16(distance) < s16(meilleure)) { meilleure = distance; choisie = i; }
  }
  if (choisie < 0) choisie = m8[(jeu.T.R.esp >>> 0) - 24];
  return (couleurs & ~0xFF) | (choisie & 0xFF);
}

// 0x80BE4 — attendre le retour du balayage vertical (bit 3 du port 0x3DA). Seul al change.
// L'original empile dx et lit le port par dx = 0x3DA : une interruption de la minuterie pendant
// l'attente trouve la pile 2 octets plus bas et 0x3DA dans dx (la minuterie de SOS range ce pointeur
// de pile en 0xC370E ; l'introduction y tombe, moteur/node/verifier-intro.mjs --interruptions).
function attendreLeBalayage(jeu, R) {
  const { esp, edx } = R;
  R.esp = (esp - 2) | 0;                                   // push dx
  poserMot(jeu, R.esp >>> 0, edx);
  R.edx = (edx & ~0xFFFF) | 0x3DA;
  let etat;
  do etat = entreePort(jeu, 0x3DA); while (!(etat & 8));
  R.eax = (R.eax & ~0xFF) | etat;
  R.edx = edx;                                             // pop dx
  R.esp = esp;
}

// 0x80C00 — poser un pixel, basse résolution, en coordonnées de 640x400 (divisées par deux).
// 0x80C40 — la même en haute résolution, en 640x480. Hors de l'écran, rien. Tous les registres
// sont préservés.
function poserUnPixelBasse(jeu, R) {
  const esp = R.esp >>> 0;
  const x = mot(jeu, esp + 4), y = mot(jeu, esp + 8);
  if (x >= 0x280 || y >= 0x190) return;
  jeu.m8[(long(jeu, SURFACE) + (x >> 1) + (Math.imul(y >> 1, 320) & 0xFFFF)) >>> 0] = jeu.m8[esp + 12];
}
function poserUnPixelHaute(jeu, R) {
  const esp = R.esp >>> 0;
  const x = mot(jeu, esp + 4), y = mot(jeu, esp + 8);
  // (640 et 480 : la géométrie de l'écran, grande-vue.js ; celles d'origine hors de la grande vue.)
  if (x >= ecran.largeur || y >= ecran.hauteur) return;
  jeu.m8[(long(jeu, SURFACE) + x + y * ecran.largeur) >>> 0] = jeu.m8[esp + 12];
}

// 0x7F5BC — un rectangle plein (x, y, largeur, hauteur, couleur), basse résolution, en
// coordonnées de 640 (toutes divisées par deux). 0x81D88 — le même en haute résolution.
// Le bit 4 de [0xBECBC] fusionne chaque pixel avec le fond par la table [0xBA2F8]. Aucune
// découpe ; tous les registres sont préservés.
//
// Comme dans l'original, une largeur nulle fait tourner la boucle de fusion 2^32 fois (`loop`), et
// une hauteur nulle 65 536 lignes (`dec dx`) : aucun appel connu ne le fait.
function rectanglePlein(jeu, R, basse) {
  const { m8 } = jeu;
  const esp = R.esp >>> 0;
  const pas = basse ? 320 : ecran.largeur;
  let x = mot(jeu, esp + 4), y = mot(jeu, esp + 8);
  let largeur = mot(jeu, esp + 12), hauteur = mot(jeu, esp + 16);
  const couleur = jeu.m8[esp + 20];
  if (basse) {
    x >>= 1; y >>= 1; hauteur >>= 1; largeur >>= 1;
    poserMot(jeu, esp + 12, largeur);          // l'original divise l'argument sur place
  }
  let dest = (long(jeu, SURFACE) + x + Math.imul(y, pas)) >>> 0;
  const saut = (pas - largeur) & 0xFFFF;
  let lignes = hauteur === 0 ? 0x10000 : hauteur;
  if (mot(jeu, DRAPEAUX_DE_TRACE) & 4) {
    const table = long(jeu, TABLE_FUSION);
    for (; lignes > 0; lignes--) {
      for (let k = largeur === 0 ? 2 ** 32 : largeur; k > 0; k--) {
        m8[dest] = m8[(table + m8[dest] * 256 + couleur) >>> 0];
        dest++;
      }
      dest = (dest + saut) >>> 0;
    }
  } else {
    for (; lignes > 0; lignes--) {
      m8.fill(couleur, dest, dest + largeur);
      dest = (dest + largeur + saut) >>> 0;
    }
  }
}

// 0x81590 — remplir `lignes` lignes de 320 octets à partir de `destination` (par es:edi). edi
// avance jusqu'à la fin de la zone, et reste là : l'original ne le sauve pas.
function remplirDesLignes(jeu, R) {
  const esp = R.esp >>> 0;
  const destination = long(jeu, esp + 4), lignes = mot(jeu, esp + 8), octet = jeu.m8[esp + 12];
  const n = lignes * 320;
  jeu.m8.fill(octet, destination, destination + n);
  R.edi = (destination + n) | 0;
}

// 0x7C282 — effacer l'écran et changer de palette : la surface est mise à zéro (320x200 en basse
// résolution, 640x480 en haute), présentée au retour du balayage, puis la palette est posée et
// notée comme courante.
//
// Le second test du mode (pour choisir 400 ou 480 lignes) est fait dans la branche où le mode
// n'est pas 1 : c'est toujours 480.
function effacerLEcran(jeu, palette) {
  avecCadre(jeu, 16, 0x10, () => {
    const basse = (mot(jeu, MODE_AFFICHAGE) & 1) !== 0;
    jeu.appeler(0x7F1A0, long(jeu, SURFACE), 0, basse ? 0xFA00 : ecran.hauteur * ecran.largeur);
    jeu.appeler(0x80BE4);
    if (mot(jeu, MODE_AFFICHAGE) & 1) jeu.appeler(PRESENTER_BASSE, 400);
    else jeu.appeler(PRESENTER_HAUTE);
    jeu.appeler(0x808B0, palette);
    poserLong(jeu, PALETTE_COURANTE, palette);
  });
}

// 0x7C32D — revenir à la palette ordinaire du parc [0xD3B8C], après un écran à part : 0x4820D(8,
// 0xCEBE0), [0xD380C] = 0, octet [0xD777F] = 8. Le sens de ces trois gestes : non établi.
function revenirALaPaletteDuParc(jeu) {
  avecCadre(jeu, 16, 0, () => {
    jeu.appeler(0x4820D, 8, 0xCEBE0);
    poserLong(jeu, 0xD380C, 0);
    jeu.m8[0xD777F] = 8;
    poserLong(jeu, PALETTE_COURANTE, long(jeu, 0xD3B8C));
  });
}

// ================================================================================================
// 4. Les interruptions
// ================================================================================================

// 0x7F085 — int386(n, entrée, sortie) : int386x avec les sélecteurs courants (segread).
function int386(jeu, n, entree, sortie) {
  return avecCadre(jeu, 4, 0xC, (ebp) => {
    const sregs = ebp - 0xC;
    jeu.appeler(0x81688, sregs);
    return jeu.appeler(0x816B5, n, entree, sortie, sregs);
  });
}

// 0x816B5 — int386x(n, entrée, sortie, sregs) : son cœur, 0x89F90, est rendu par l'hôte. Rend le
// eax de sortie ; edx reste sur la structure de sortie.
//
// Le cœur part avec esi, edi, edx, ebx posés et ebp sur le cadre, comme dans l'original. Le service
// travaille sur les registres de la structure d'entrée ; seuls ebp et esp restent ceux du code, et
// c'est ce que voit un gestionnaire livré pendant le service (la pile privée de SOS garde ebp).
function int386x(jeu, n, entree, sortie, sregs) {
  return avecCadre(jeu, 16, 0, (ebp) => {
    const R = jeu.T.R;
    const { ebx, esi, edi } = R, ebpAppelant = R.ebp;
    appelerRegistres(jeu, COEUR_INT386X, 0x816CC, { esi: n, edi: entree, edx: sortie, ebx: sregs, ebp });
    Object.assign(R, { ebx, esi, edi, ebp: ebpAppelant });
    jeu.T.charger();
    return long(jeu, sortie) | 0;
  });
}

// 0x81688 — segread(sregs) : es, cs, ss, ds, fs, gs. eax garde gs, comme l'original.
function segread(jeu, R) {
  const s = long(jeu, (R.esp >>> 0) + 4);
  poserMot(jeu, s + 2, R.cs); poserMot(jeu, s + 6, R.ds); poserMot(jeu, s, R.es);
  poserMot(jeu, s + 4, R.ss); poserMot(jeu, s + 8, R.fs); poserMot(jeu, s + 10, R.gs);
  R.eax = R.gs & 0xFFFF;
}

// 0x8164E — _dos_getvect(n) : le gestionnaire de l'interruption n, en décalage (eax) et sélecteur
// (edx). Sous un extendeur de Phar Lap (octet [0xC2D66] de 2 à 8), fonction 2502h ; sinon la
// fonction 35h du DOS.
const VERSION_EXTENDEUR = 0xC2D66;
function lireUnVecteur(jeu, R) {
  const n = long(jeu, (R.esp >>> 0) + 4);
  const ebx = R.ebx, es = R.es;
  const pharLap = jeu.m8[VERSION_EXTENDEUR] >= 2 && jeu.m8[VERSION_EXTENDEUR] <= 8;
  if (pharLap) {
    R.ebx = n; R.eax = (R.eax & ~0xFFFF) | 0x2502; R.ecx = (R.ecx & ~0xFF) | (n & 0xFF);
  } else {
    R.ebx = (n & 0xFF) | 0x3500; R.ecx &= ~0xFF; R.eax = (R.eax & ~0xFFFF) | R.ebx;
  }
  interruption(jeu, 0x21);
  R.edx = R.es & 0xFFFF;
  R.es = es;
  R.eax = R.ebx;
  R.ebx = ebx;
}

// 0x828EB — _dos_setvect(n, décalage, sélecteur) : fonction 2504h sous Phar Lap, 25h sinon, avec
// ds:edx le gestionnaire.
function poserUnVecteur(jeu, R) {
  const esp = R.esp >>> 0;
  const n = long(jeu, esp + 4), decalage = long(jeu, esp + 8), selecteur = mot(jeu, esp + 12);
  const ds = R.ds;
  R.edx = decalage;
  R.ecx = (R.ecx & ~0xFFFF) | selecteur;
  R.ds = selecteur;
  if (jeu.m8[VERSION_EXTENDEUR] >= 2 && jeu.m8[VERSION_EXTENDEUR] <= 8) {
    R.ecx = (R.ecx & ~0xFF) | (n & 0xFF);
    R.eax = (n & ~0xFFFF) | 0x2504;
  } else {
    R.eax = (n & ~0xFF00) | 0x2500;
  }
  interruption(jeu, 0x21);
  R.ds = ds;
}

// 0x7F49D, 0x7F49F — cli, sti.
function masquerLesInterruptions(jeu, R) { R.IF = false; }
function permettreLesInterruptions(jeu, R) { R.IF = true; }

// 0x7F16A — kbhit() : 1 si une touche attend. Si [0xC2D58] est posé (une touche déjà lue et
// remise, non établi), c'est 1 sans demander au DOS ; sinon fonction 0Bh, dont al est étendu.
function toucheEnAttente(jeu, R) {
  if (long(jeu, 0xC2D58) !== 0) { R.eax = 1; return; }
  R.eax = (R.eax & ~0xFF00) | 0x0B00;
  interruption(jeu, 0x21);
  R.eax = s8(R.eax);
}

// 0x7F181 — getch() : la touche remise par ungetch ([0xC2D58], alors effacée), sinon celle que le
// DOS lit sans écho (fonction 08h), étendue sans signe. Jamais atteinte ici : kbhit (0x7F16A) ne
// répond oui que si [0xC2D58] est posé, ou si le DOS a un caractère en attente, et celui de l'hôte
// n'en a jamais.
function prendreUneTouche(jeu, R) {
  const gardee = long(jeu, 0xC2D58);
  jeu.dv.setUint32(0xC2D58, 0, true);
  R.eax = gardee | 0;
  if (gardee !== 0) return;
  R.eax = (R.eax & ~0xFF00) | 0x0800;
  interruption(jeu, 0x21);
  R.eax = R.eax & 0xFF;
}

// 0x82D6C — un bloc de mémoire DOS de `taille` octets (DPMI 0100h), rendu comme sélecteur << 16
// | segment ; 0 si la taille atteint 640 Ko ou si le DPMI refuse.
function allouerDeLaMemoireDos(jeu, taille) {
  return avecCadre(jeu, 16, 0x40, (ebp) => {
    const entree = ebp - 0x40, sortie = ebp - 0x24;
    let resultat = 0;
    if ((taille >>> 0) < 0xA0000) {
      poserLong(jeu, entree + REGS_EAX, 0x100);
      poserLong(jeu, entree + 4, ((taille >>> 0) + 0xF) >>> 4);
      jeu.appeler(0x7F085, INT_DPMI, entree, sortie);
      if (long(jeu, sortie + REGS_CFLAG) === 0) {
        resultat = (long(jeu, sortie + REGS_EDX) << 16 | long(jeu, sortie + REGS_EAX)) | 0;
      }
    }
    return resultat;
  });
}

// ================================================================================================
// 5. Le tas du jeu
// ================================================================================================

const suivant = (jeu, d) => long(jeu, d + 8);
const tailleDe = (jeu, d) => long(jeu, d + 4);
const estPris = (jeu, d) => jeu.m8[d + 0x10] !== 0;
const sorteLibre = (jeu, d) => long(jeu, SORTES_DE_BLOCS + jeu.m8[d + 0x11] * 12) === 0;

// Le bloc libre le plus juste pour `taille` (comparaisons non signées), parmi ceux dont la sorte
// convient ; 0 si aucun.
function leBlocLePlusJuste(jeu, taille, sorteVoulue) {
  let meilleur = 0, meilleureTaille = 0xFFFFFFFF;
  for (let d = DESCRIPTEURS; d !== 0; d = suivant(jeu, d)) {
    const t = tailleDe(jeu, d);
    if (taille > t || t >= meilleureTaille || estPris(jeu, d)) continue;
    if (sorteLibre(jeu, d) !== sorteVoulue) continue;
    meilleureTaille = t; meilleur = d;
  }
  return meilleur;
}

// 0x7E8D0 — allouer `taille` octets, arrondis à 4, mis à zéro, dans un bloc d'une sorte dont
// l'entrée de 0xDEDCC est nulle ; faute de mieux, 0x7E9B8. Rend l'adresse, ou 0.
function allouer(jeu, taille) {
  return avecCadre(jeu, 16, 0x10, () => {
    jeu.appeler(AMORCER_LE_TAS);
    taille = ((taille + 3) & ~3) >>> 0;
    poserLong(jeu, (jeu.T.R.esp >>> 0) + 0x10 + 0x14, taille);   // l'argument, arrondi sur place
    const bloc = leBlocLePlusJuste(jeu, taille, true);
    if (bloc !== 0 && (jeu.appeler(0x7EA98, bloc, taille) & 0xFF) !== 0) {
      jeu.appeler(0x82C78);
      jeu.appeler(0x7F1A0, long(jeu, bloc), 0, taille);
      return long(jeu, bloc) | 0;
    }
    return jeu.appeler(0x7E9B8, taille);
  });
}

// 0x7E9B8 — la même, arrondie à 16, dans un bloc d'une sorte dont l'entrée de 0xDEDCC n'est pas
// nulle. Rend 0 s'il n'y a pas de place.
function allouerAilleurs(jeu, taille) {
  return avecCadre(jeu, 16, 0x10, () => {
    jeu.appeler(AMORCER_LE_TAS);
    taille = ((taille + 0xF) & ~0xF) >>> 0;
    poserLong(jeu, (jeu.T.R.esp >>> 0) + 0x10 + 0x14, taille);
    const bloc = leBlocLePlusJuste(jeu, taille, false);
    if (bloc !== 0 && (jeu.appeler(0x7EA98, bloc, taille) & 0xFF) !== 0) {
      jeu.appeler(0x82C78);
      jeu.appeler(0x7F1A0, long(jeu, bloc), 0, taille);
      return long(jeu, bloc) | 0;
    }
    return 0;
  });
}

// 0x7EA98 — prendre `taille` octets au début du bloc `d` : s'il a juste la taille, il est marqué
// pris ; sinon un descripteur libre (taille nulle) reçoit le reste, inséré après lui dans la
// chaîne, avec la même sorte. Rend 1, ou 0 s'il n'y a plus de descripteur libre.
//
// Le résultat est dans al ; le reste d'eax est celui que l'original y laisse (le dernier pointeur
// manipulé).
function decouperUnBloc(jeu, d, taille) {
  if (taille === tailleDe(jeu, d)) {
    jeu.m8[d + 0x10] = 1;
    return (d & ~0xFF) | 1;
  }
  let libre = DESCRIPTEURS;
  while (libre < FIN_DES_DESCRIPTEURS && tailleDe(jeu, libre) !== 0) libre += TAILLE_DESCRIPTEUR;
  if (libre === FIN_DES_DESCRIPTEURS) return FIN_DES_DESCRIPTEURS & ~0xFF;
  poserLong(jeu, libre + 4, tailleDe(jeu, d) - taille);
  poserLong(jeu, libre, long(jeu, d) + taille);
  jeu.m8[d + 0x10] = 1;
  poserLong(jeu, d + 4, taille);
  jeu.m8[libre + 0x11] = jeu.m8[d + 0x11];
  poserLong(jeu, libre + 8, suivant(jeu, d));
  poserLong(jeu, libre + 0xC, d);
  if (suivant(jeu, d) !== 0) poserLong(jeu, suivant(jeu, d) + 0xC, libre);
  poserLong(jeu, d + 8, libre);
  return (libre & ~0xFF) | 1;
}

// 0x82C78 — le bilan du tas : totaux, plus grand et plus petit bloc libre, arrondis à 4 par le bas.
function bilanDuTas(jeu) {
  let total = 0, libre = 0, pris = 0, grand = 0, petit = 0xFFFFFFFF;
  for (let d = DESCRIPTEURS; d !== 0; d = suivant(jeu, d)) {
    const t = tailleDe(jeu, d);
    if (!estPris(jeu, d)) {
      libre = (libre + t) >>> 0;
      if (t > grand) grand = t;
      if (t < petit) petit = t;
    } else {
      pris = (pris + t) >>> 0;
    }
    total = (total + t) >>> 0;
  }
  poserLong(jeu, TAS_TOTAL, total & ~3);
  poserLong(jeu, TAS_LIBRE, libre & ~3);
  poserLong(jeu, TAS_PRIS, pris & ~3);
  poserLong(jeu, TAS_PLUS_GRAND, grand & ~3);
  poserLong(jeu, TAS_PLUS_PETIT, petit & ~3);
}

// 0x82930 — le mot long en +4 de la structure donnée (la taille d'un descripteur de bloc ? non
// établi : ses sept appels par partie viennent de l'initialisation).
function champQuatre(jeu, p) {
  return longSigne(jeu, p + 4);
}

// ================================================================================================
// 6. Les fichiers
// ================================================================================================
const OUVRIR = 0x8616E;         // sopen(nom, mode, partage)
const CREER = 0x875EC;          // creat(nom, droits)
const MODE_BINAIRE = 0x87601;   // setmode(fd, mode)
const FERMER = 0x8639A;         // close(fd)
const LIRE = 0x876B7;           // read(fd, tampon, n)
const ECRIRE = 0x877E5;         // write(fd, tampon, n)
const LSEEK = 0x88394;          // lseek(fd, décalage, origine)
const COMPARER_MEMOIRE = 0x874D8;
const DECOMPRESSER_RNC = 0x87B2C; // (source, destination) : taille décompressée, 0 si non compressé
const O_CREATION = 0x222;       // O_RDWR | O_CREAT | O_TRUNC, non établi
const O_BINAIRE = 0x200;

// 0x7EB70 — ouvrir un fichier. Pour une création (mode 0x222), il est d'abord créé, passé en
// binaire et refermé, puis ouvert normalement.
function ouvrirUnFichier(jeu, nom, mode) {
  return avecCadre(jeu, 16, 8, () => {
    if (mode === O_CREATION) {
      const fd = jeu.appeler(CREER, nom, 0x1C0);
      jeu.appeler(MODE_BINAIRE, fd, O_BINAIRE);
      jeu.appeler(FERMER, fd);
    }
    return jeu.appeler(OUVRIR, nom, mode, 0x40);
  });
}
// 0x7EBE0 — read ; 0x7EC20 — close ; 0x7ED80 — write.
function lireUnFichier(jeu, fd, tampon, n) {
  return avecCadre(jeu, 16, 8, () => jeu.appeler(LIRE, fd, tampon, n));
}
function fermerUnFichier(jeu, fd) {
  return avecCadre(jeu, 16, 4, () => jeu.appeler(FERMER, fd));
}
function ecrireUnFichier(jeu, fd, tampon, n) {
  return avecCadre(jeu, 16, 8, () => jeu.appeler(ECRIRE, fd, tampon, n));
}

// 0x7F57D — filelength(fd), par trois lseek : la position, la fin, et le retour à la position.
function longueurDuFichier(jeu, fd) {
  return avecCadre(jeu, 16, 0, () => {
    const position = jeu.appeler(LSEEK, fd, 0, 1) | 0;
    if (position === -1) return -1;
    const fin = jeu.appeler(LSEEK, fd, 0, 2);
    jeu.appeler(LSEEK, fd, position, 0);
    return fin;
  });
}

// 0x7F4B0 — la taille d'un fichier une fois décompressé : un fichier compressé par RNC (Rob
// Northen Compression) commence par « RNC » 01, suivi de la taille d'origine en gros-boutiste ;
// sinon c'est sa longueur. -1 si le fichier ne s'ouvre pas.
//
// ANOMALIE, reproduite : le descripteur 0 est pris pour un échec (`jle`) ; il est toujours pris
// par l'entrée standard.
function tailleDecompressee(jeu, nom) {
  return avecCadre(jeu, 16, 0x1C, (ebp) => {
    const entete = ebp - 0x1C, signature = ebp - 0x14;
    poserLong(jeu, ebp - 8, -1);
    [0x52, 0x4E, 0x43, 1, 0].forEach((c, k) => { jeu.m8[signature + k] = c; });
    const fd = jeu.appeler(0x7EB70, nom, O_BINAIRE) | 0;
    if (fd <= 0) return -1;
    jeu.appeler(0x7EBE0, fd, entete, 8);
    let taille;
    if (jeu.appeler(COMPARER_MEMOIRE, entete, signature, 4) === 0) {
      const m8 = jeu.m8;
      taille = ((m8[entete + 4] << 24) | (m8[entete + 5] << 16) | (m8[entete + 6] << 8) | m8[entete + 7]) | 0;
    } else {
      taille = jeu.appeler(0x7F57D, fd);
    }
    jeu.appeler(0x7EC20, fd);
    return taille;
  });
}

// 0x7F0B0 — charger un fichier dans `tampon`, et le décompresser sur place s'il est compressé.
// Rend sa taille, -1 s'il ne s'ouvre pas, -2 (après un message) si la décompression échoue.
function chargerUnFichier(jeu, nom, tampon) {
  return avecCadre(jeu, 16, 0x14, () => {
    const fd = jeu.appeler(0x7EB70, nom, O_BINAIRE) | 0;
    if (fd === -1) return -1;
    const taille = jeu.appeler(0x7F4B0, nom);
    jeu.appeler(0x7EBE0, fd, tampon, taille);
    jeu.appeler(0x7EC20, fd);
    const decompresse = jeu.appeler(DECOMPRESSER_RNC, tampon, tampon) | 0;
    if (decompresse < 0) {
      jeu.appeler(0x7E83E, 0xB074C, nom);          // le message d'erreur de décompression
      return -2;
    }
    return decompresse === 0 ? taille : decompresse;
  });
}

// 0x7F45A — access(nom, mode) : fonction 4300h du DOS (les attributs). Un accès en écriture
// (bit 2) à un fichier en lecture seule (attribut 1) est refusé avec l'erreur 6 ; le résultat,
// comme toute erreur du DOS, passe par 0x882E4 (errno).
function accesAUnFichier(jeu, nom, mode) {
  const R = jeu.T.R;
  const ebx = R.ebx;
  R.edx = nom; R.ebx = (R.ebx & ~0xFFFF) | (mode & 0xFFFF);
  R.eax = 0x4300;
  interruption(jeu, 0x21);
  let echec = R.CF;
  if (!echec && (R.ebx & 2) && (R.ecx & 1)) { R.eax = (R.eax & ~0xFFFF) | 0x0600; echec = true; }
  // sbb ecx, ecx ; mov cx, ax : le mot haut dit l'échec, le mot bas porte le code du DOS
  const code = ((echec ? 0xFFFF0000 : 0) | (R.eax & 0xFFFF)) >>> 0;
  R.ecx = code | 0;
  R.ebx = ebx;
  jeu.T.charger();
  return avecCadre(jeu, 8, 0, () => jeu.appeler(0x882E4, code & 0xFFFF, code >>> 16));
}

// 0x82E64 — les drapeaux d'ouverture d'après le mode de fopen (« r », « w+ », « rb »…). Rend 0 et
// pose errno à 9 pour un mode inconnu.
//   1 lecture, 2 écriture, 3 les deux ; 0x40 binaire ; 0x80 ajout (« a »). Un « + » vaut 3 ; le
//   mode binaire est le défaut quand [0xC2F7D] vaut 0x200 (_fmode).
function drapeauxDOuverture(jeu, mode) {
  return avecCadre(jeu, 12, 0, () => {
    const m8 = jeu.m8;
    const c = jeu.appeler(TOLOWER, m8[mode]) & 0xFF;
    if (c !== 0x72 && c !== 0x77 && c !== 0x61) {
      poserLong(jeu, jeu.appeler(ERRNO), 9);
      return 0;
    }
    const binaireParDefaut = long(jeu, 0xC2F7D) === 0x200;
    let d = 0;
    if (m8[mode + 1] === 0x2B) {                     // « + »
      d = 3;
      if (m8[mode + 2] === 0x62) d = 0x43;           // « +b »
      else if (m8[mode + 2] === 0x74) d = 3;         // « +t »
      else if (binaireParDefaut) d = 0x43;
    } else if (m8[mode + 1] === 0x62) {              // « b »
      d = m8[mode + 2] === 0x2B ? 0x43 : 0x40;
    } else if (m8[mode + 1] === 0x74) {              // « t »
      d = m8[mode + 2] === 0x2B ? 3 : 0;
    } else if (binaireParDefaut) {
      d = 0x40;
    }
    if (c === 0x77) d |= 2;
    else if (c === 0x61) d |= 0x82;
    else d |= 1;
    return d;
  });
}

// 0x82F13 — ouvrir le FILE `fp` : drapeaux d'après le mode, puis sopen avec les modes du DOS ;
// en ajout, se placer à la fin. Rend fp, ou 0 (le FILE est alors rendu).
function ouvrirUnFlux(jeu, nom, mode, partage, fp) {
  return avecCadre(jeu, 8, 4, () => {
    jeu.m8[fp + 0xC] &= 0xFC;
    const d = jeu.appeler(0x82E64, mode);
    poserLong(jeu, fp + 0xC, long(jeu, fp + 0xC) | d);
    const c = jeu.appeler(TOLOWER, jeu.m8[mode]) & 0xFF;
    const drapeaux = jeu.m8[fp + 0xC];
    const texteOuBinaire = (drapeaux & 0x40) ? 0x200 : 0x100;
    let fd;
    if (c === 0x72) {
      const acces = ((drapeaux & 2) ? 2 : 0) | texteOuBinaire;
      fd = jeu.appeler(OUVRIR, nom, acces, partage, 0) | 0;
    } else {
      let acces = ((drapeaux & 1) ? 1 : 0) + 0x21;
      acces |= c === 0x61 ? 0x10 : 0x40;
      acces |= texteOuBinaire;
      fd = jeu.appeler(OUVRIR, nom, acces, partage, 0x180) | 0;
    }
    poserLong(jeu, fp + 0x10, fd);
    if (c !== 0x72 && c === 0x61 && fd !== -1) jeu.appeler(0x8A9A8, fp, 0, 2);
    if (longSigne(jeu, fp + 0x10) === -1) {
      jeu.appeler(0x8AC14, fp);
      return 0;
    }
    poserLong(jeu, fp + 4, 0);
    poserLong(jeu, fp + 8, 0);
    poserLong(jeu, fp + 0x14, 0);
    jeu.appeler(0x8AC69, fp);
    return fp;
  });
}

// 0x82FF8 — _fsopen(nom, mode, partage) : un FILE libre (0x8AB79), puis 0x82F13.
function fopen(jeu, nom, mode, partage) {
  return avecCadre(jeu, 4, 0, () => {
    const fp = jeu.appeler(0x8AB79, 0);
    if (fp === 0) return 0;
    return jeu.appeler(0x82F13, nom, mode, partage, fp);
  });
}

// 0x7E83E — un message sur la sortie d'erreur, à la printf.
function signaler(jeu, format) {
  return avecCadre(jeu, 4, 4, (ebp) => {
    const argumentsVariables = ebp - 4;
    poserLong(jeu, argumentsVariables, ebp + 0xC);
    return jeu.appeler(VFPRINTF, SORTIE_D_ERREUR, format, argumentsVariables);
  });
}

// 0x7E888 — la touche en cours, traduite : 0x875A4 relève le clavier et laisse le code de la
// touche en [0xDE688] ; les codes de 0 à 0x7F passent par la table 0xBECE0, les autres donnent 0.
//
// Le résultat est dans al ; pour un code de 0x80 ou plus, le reste d'eax est celui que 0x875A4 a
// rendu, comme dans l'original.
function toucheTraduite(jeu) {
  return avecCadre(jeu, 16, 4, (ebp) => {
    const rendu = jeu.appeler(0x875A4);
    const code = jeu.m8[0xDE688];
    const touche = code < 0x80 ? jeu.m8[0xBECE0 + code] : 0;
    jeu.m8[ebp - 4] = touche;
    return code < 0x80 ? touche : (rendu & ~0xFF);
  });
}

// ================================================================================================
// 7. La bibliothèque C
// ================================================================================================

// 0x7E1D8 — toupper.
function majuscule(jeu, c) {
  return (c | 0) >= 0x61 && (c | 0) <= 0x7A ? (c - 0x20) | 0 : c | 0;
}

// 0x7E1ED — strcpy, deux octets par tour. Rend la destination.
function copierUneChaine(jeu, destination, source) {
  const { m8 } = jeu;
  let d = destination, s = source;
  for (;;) {
    const c = m8[s++]; m8[d++] = c;
    if (c === 0) break;
  }
  return destination | 0;
}

// 0x7E216 — atoi : blancs sautés (bit 2 de la table des caractères 0xB0A5C, indexée par c + 1),
// signe, chiffres (bit 0x20). Sans limite ni contrôle de débordement.
const TYPES_DE_CARACTERES = 0xB0A5C;
function lireUnEntier(jeu, texte) {
  const { m8 } = jeu;
  let p = texte;
  while (m8[TYPES_DE_CARACTERES + ((m8[p] + 1) & 0xFF)] & 2) p++;
  const signe = m8[p];
  if (signe === 0x2B || signe === 0x2D) p++;
  let n = 0;
  while (m8[TYPES_DE_CARACTERES + ((m8[p] + 1) & 0xFF)] & 0x20) {
    n = (Math.imul(n, 10) + m8[p] - 0x30) | 0;
    p++;
  }
  return signe === 0x2D ? -n | 0 : n;
}

// 0x7E822 — strlen.
function longueurDUneChaine(jeu, texte) {
  let p = texte;
  while (jeu.m8[p] !== 0) p++;
  return (p - texte) | 0;
}
const longueurEnMemoire = (jeu, texte) => longueurDUneChaine(jeu, texte);

// 0x7F1A0 — memset(destination, octet, n) : le cœur 0x87E30 prend l'octet répété quatre fois.
function remplir(jeu, destination, octet, n) {
  const b = octet & 0xFF;
  appelerRegistres(jeu, REMPLIR_REGISTRES, 0x7F1BD,
    { eax: destination, edx: Math.imul(b, 0x01010101), ecx: n });
  return destination | 0;
}

// 0x80958 — memcpy(destination, source, n) : par mots longs, puis les derniers octets, toujours en
// avançant. Rend la destination.
//
// Deux zones qui se recouvrent, la destination après la source, ne donnent pas ce que ferait
// memmove : les octets recopiés se recopient à nouveau. On le reproduit ; dans l'autre sens, la
// copie en avant est exacte.
function copier(jeu, destination, source, n) {
  const { m8 } = jeu;
  const d = destination >>> 0, s = source >>> 0;
  n >>>= 0;
  if (d <= s || d >= s + n) {
    m8.copyWithin(d, s, s + n);
  } else {
    const mots = n >>> 2;
    let k = 0;
    for (; k < mots * 4; k += 4) {
      const v = jeu.dv.getUint32(s + k, true);
      jeu.dv.setUint32(d + k, v, true);
    }
    for (; k < n; k++) m8[d + k] = m8[s + k];
  }
  return destination | 0;
}

// 0x81336 — strcat. Rend la destination.
function ajouterUneChaine(jeu, destination, source) {
  const fin = destination + longueurDUneChaine(jeu, destination);
  copierUneChaine(jeu, fin, source);
  return destination | 0;
}

// 0x81C7C — strncpy : au plus n octets, le reste complété de zéros. Rend la destination.
function copierAuPlusN(jeu, destination, source, n) {
  const { m8 } = jeu;
  let d = destination, s = source, reste = n >>> 0;
  while (reste !== 0 && m8[s] !== 0) { m8[d++] = m8[s++]; reste--; }
  while (reste !== 0) { m8[d++] = 0; reste--; }
  return destination | 0;
}

// 0x81E00 — strcmp : -1, 0 ou 1, octets non signés.
function comparerDesChaines(jeu, a, b) {
  const { m8 } = jeu;
  if (a === b) return 0;
  for (let k = 0; ; k++) {
    const x = m8[a + k], y = m8[b + k];
    if (x !== y) return x < y ? -1 : 1;
    if (x === 0) return 0;
  }
}

// 0x81184 — échanger ecx octets entre [esi] et [edi], par mots longs puis octets. esi et edi
// avancent, ecx et edx finissent à zéro, eax garde les derniers octets pris à [esi].
function echanger(jeu, R) {
  const { m8, dv } = jeu;
  let s = R.esi >>> 0, d = R.edi >>> 0;
  const n = R.ecx >>> 0;
  let eax = R.eax;
  for (let k = n >>> 2; k > 0; k--) {
    eax = dv.getInt32(s, true);
    dv.setInt32(s, dv.getInt32(d, true), true);
    dv.setInt32(d, eax, true);
    s += 4; d += 4;
  }
  for (let k = n & 3; k > 0; k--) {
    const v = m8[s];
    m8[s] = m8[d]; m8[d] = v;
    eax = (eax & ~0xFF) | v;
    s++; d++;
  }
  R.esi = s | 0; R.edi = d | 0; R.ecx = 0; R.edx = 0; R.eax = eax;
}
function echangerDesElements(jeu, a, b, taille) {
  const R = jeu.T.R;
  const sauve = { eax: R.eax, ecx: R.ecx, edx: R.edx, esi: R.esi, edi: R.edi };
  R.esi = a; R.edi = b; R.ecx = taille;
  echanger(jeu, R);
  Object.assign(R, sauve);
}

// 0x811AA — qsort(base, n, taille, comparer) de Watcom, sans récursion : une pile de 32 parties à
// trier dans son cadre.
//
// Le pivot est l'élément du milieu, amené en tête. Les éléments qui ne lui sont pas supérieurs sont
// rassemblés derrière lui ; le pivot va ensuite à la fin de ce groupe. Le groupe des éléments qui
// lui sont égaux, s'ils forment la fin du groupe, n'est pas retrié. La plus petite des deux parties
// est traitée d'abord, l'autre empilée.
function trier(jeu, base, n, taille, comparer) {
  avecCadre(jeu, 28, 0x11C, () => {
    const pileBases = [], pileNombres = [];
    n >>>= 0; taille >>>= 0;
    for (;;) {
      while (n > 1) {
        let courant = (base + taille) >>> 0;
        if (n === 2) {
          if ((jeu.appeler(comparer, base, courant) | 0) > 0) echangerDesElements(jeu, base, courant, taille);
          break;
        }
        echangerDesElements(jeu, base, (base + Math.imul(n >>> 1, taille)) >>> 0, taille);
        let fin = base;                  // le dernier élément non supérieur au pivot
        let nonSuperieurs = 0;
        let dernierDifferent = 0;
        for (let i = 1; i < n; i++) {
          const r = jeu.appeler(comparer, courant, base) | 0;
          if (r <= 0) {
            fin = (fin + taille) >>> 0;
            nonSuperieurs++;
            if (nonSuperieurs !== i) echangerDesElements(jeu, courant, fin, taille);
          }
          if (r !== 0) dernierDifferent = nonSuperieurs;
          courant = (courant + taille) >>> 0;
        }
        if (nonSuperieurs === n - 1 && dernierDifferent === 0) break;   // tous égaux au pivot
        if (nonSuperieurs !== 0) echangerDesElements(jeu, base, fin, taille);
        n = (n - nonSuperieurs - 1) >>> 0;
        let gauche = nonSuperieurs;
        if (gauche !== dernierDifferent) gauche = dernierDifferent + 1;
        const droite = (fin + taille) >>> 0;
        if ((gauche >>> 0) < n) {
          pileBases.push(droite); pileNombres.push(n);
          n = gauche >>> 0;
        } else {
          pileBases.push(base); pileNombres.push(gauche >>> 0);
          base = droite;
        }
      }
      if (pileBases.length === 0) return;
      base = pileBases.pop();
      n = pileNombres.pop();
    }
  });
}

// 0x7F63C — la sortie de sprintf : un caractère au bout du tampon, et le compte augmente. La
// structure est celle de 0x883DF (bibliotheque.js) : +0 la destination, +0x10 le compte.
function sortieDeSprintf(jeu, specs, caractere) {
  const destination = long(jeu, specs);
  poserLong(jeu, specs, destination + 1);
  jeu.m8[destination] = caractere & 0xFF;
  poserLong(jeu, specs + 0x10, long(jeu, specs + 0x10) + 1);
}

// 0x7F652 — sprintf(destination, format, ...) : le moteur 0x883DF avec la sortie ci-dessus, et le
// zéro final. Rend le nombre de caractères écrits.
function sprintf(jeu, destination, format) {
  const entree = jeu.T.R.esp >>> 0;
  const argumentsVariables = entree - 8;          // [ebp-4]
  poserLong(jeu, argumentsVariables, entree + 12);
  const n = jeu.appelerDepuis(0x7F672, argumentsVariables, PRTF, destination, format,
    argumentsVariables, 0x7F63C);
  jeu.m8[(n + destination) >>> 0] = 0;
  jeu.T.R.edx = destination | 0;
  return n;
}

// 0x7E860 — une fonction vide (un point d'accroche de mise au point, non établi).
function rien() {}

// ================================================================================================
// 8. Le son de Bullfrog (§ 9.3)
// ================================================================================================
const ECHANTILLON_LIBRE = 0x892DB;    // sosDIGISampleDone(pilote, n) : non nul si le numéro est libre
const ARRETER_ECHANTILLON = 0x89A48;  // sosDIGIStopSample(pilote, n)
const DEMARRER_ECHANTILLON = 0x8943F; // sosDIGIStartSample(pilote, départ)
const MORCEAU_FINI = 0x82174, ARRETER_MORCEAU = 0x7FC8D, LIBERER_MORCEAU = 0x7FBC2;
const REMETTRE_PILOTE = 0x8474A;
const CHARGER_MORCEAU = 0x7F68F, DEMARRER_MORCEAU = 0x7FC05;
const TEXTE_D_ERREUR_SOS = 0x84843, DESACTIVER_PILOTE = 0x84639, FERMER_SOS = 0x84162;
const VOLUME_DE_LA_MUSIQUE = 0x87238, TEMPO_DU_MORCEAU = 0x89E5C;
const EVENEMENT_MINUTERIE = 0x822F4, RETIRER_EVENEMENT = 0x8260A, MONTEE_DU_VOLUME = 0x81770;

const proprietaireDe = (jeu, i) => mot(jeu, ECHANTILLONS + 4 * i);
const bruitageDe = (jeu, i) => mot(jeu, ECHANTILLONS + 4 * i + 2);
const estLibre = (jeu, i) => jeu.appeler(ECHANTILLON_LIBRE, long(jeu, PILOTE_NUMERIQUE), i) !== 0;

// 0x80350 — arrêter le bruitage `n` du propriétaire `p`, s'il est en cours (le premier trouvé).
function arreterUnBruitage(jeu, proprietaire, n) {
  avecCadre(jeu, 16, 8, () => {
    if (jeu.m8[BRUITAGES_PRETS] === 0) return;
    for (let i = 0; i < NOMBRE_D_ECHANTILLONS; i++) {
      if (proprietaireDe(jeu, i) !== u16(proprietaire) || bruitageDe(jeu, i) !== u16(n)) continue;
      if (estLibre(jeu, i)) continue;
      jeu.appeler(ARRETER_ECHANTILLON, long(jeu, PILOTE_NUMERIQUE), i);
      return;
    }
  });
}

// 0x80DC0 — arrêter tous les bruitages : chaque numéro est arrêté jusqu'à ce que SOS le dise libre.
function arreterTousLesBruitages(jeu) {
  avecCadre(jeu, 16, 4, () => {
    if (jeu.m8[BRUITAGES_PRETS] === 0) return;
    for (let i = 0; i < NOMBRE_D_ECHANTILLONS; i++) {
      while (!estLibre(jeu, i)) jeu.appeler(ARRETER_ECHANTILLON, long(jeu, PILOTE_NUMERIQUE), i);
    }
  });
}

// L'arrêt du morceau en cours, commun à 0x80990 et 0x80A20.
function arreterLeMorceau(jeu) {
  if (jeu.appeler(MORCEAU_FINI, long(jeu, MORCEAU_SOS)) === 0) jeu.appeler(ARRETER_MORCEAU, long(jeu, MORCEAU_SOS));
  jeu.appeler(LIBERER_MORCEAU, long(jeu, MORCEAU_SOS));
  jeu.appeler(REMETTRE_PILOTE, long(jeu, PILOTE_MUSIQUE));
  if (jeu.m8[SECONDE_PISTE] !== 0) jeu.appeler(REMETTRE_PILOTE, long(jeu, PILOTE_MUSIQUE_2));
  poserMot(jeu, MORCEAU_EN_COURS, 0);
}

const musiqueEnService = (jeu) => jeu.m8[MUSIQUE_PRETE] !== 0 && jeu.m8[MUSIQUE_VOULUE] !== 0;

// 0x80990 — arrêter la musique.
function arreterLaMusique(jeu) {
  avecCadre(jeu, 16, 0x68, () => {
    if (!musiqueEnService(jeu) || mot(jeu, MORCEAU_EN_COURS) === 0) return;
    arreterLeMorceau(jeu);
  });
}

// 0x80A20 — lancer le morceau `n` de la banque de musique, en arrêtant le précédent ; rien si c'est
// déjà lui, ou si n dépasse le nombre de morceaux. En cas d'erreur de SOS, un message, et le
// pilote de musique est coupé ; à la première, la musique est éteinte pour la partie.
function lancerUnMorceau(jeu, n) {
  avecCadre(jeu, 16, 0x6C, () => {
    if (!musiqueEnService(jeu)) return;
    const numero = s16(n);
    if (numero > mot(jeu, NOMBRE_DE_MORCEAUX)) return;
    if (mot(jeu, MORCEAU_EN_COURS) === numero) return;
    if (mot(jeu, MORCEAU_EN_COURS) !== 0) arreterLeMorceau(jeu);

    const ds = jeu.T.R.ds & 0xFFFF;
    const donnees = long(jeu, long(jeu, BANQUE_DE_MUSIQUE) + (numero << 5) + 0x12);
    poserMot(jeu, MORCEAU_A_CHARGER + 4, ds);
    poserLong(jeu, MORCEAU_A_CHARGER, donnees);
    poserMot(jeu, MORCEAU_A_CHARGER + 0xC, 0);
    poserLong(jeu, MORCEAU_A_CHARGER + 8, 0);
    const erreur = jeu.appeler(CHARGER_MORCEAU, MORCEAU_A_CHARGER, ds, 0xBED5C, ds, MORCEAU_SOS, ds);
    const echec = (code) => {
      jeu.appeler(0x7E83E, 0xB078C, jeu.appeler(TEXTE_D_ERREUR_SOS, code));
      jeu.appeler(DESACTIVER_PILOTE, long(jeu, PILOTE_MUSIQUE), 1);
      jeu.appeler(FERMER_SOS);
    };
    if (erreur !== 0) {
      echec(erreur);
      jeu.m8[MUSIQUE_PRETE] = 0;
      return;
    }
    const erreurDeDepart = jeu.appeler(DEMARRER_MORCEAU, long(jeu, MORCEAU_SOS));
    if (erreurDeDepart !== 0) { echec(erreurDeDepart); return; }
    jeu.appeler(VOLUME_DE_LA_MUSIQUE, 0);
    poserMot(jeu, TEMPO, 100);
    poserMot(jeu, MORCEAU_EN_COURS, n);
  });
}

// 0x80E40 — le tempo du morceau en cours, en pour cent, s'il change.
function changerLeTempo(jeu, tempo) {
  avecCadre(jeu, 16, 0, () => {
    if (mot(jeu, TEMPO) === u16(tempo) || mot(jeu, MORCEAU_EN_COURS) === 0) return;
    jeu.appeler(TEMPO_DU_MORCEAU, long(jeu, MORCEAU_SOS), u16(tempo));
    poserMot(jeu, TEMPO, tempo);
  });
}

// 0x81984 — faire varier le volume du bruitage `n` du propriétaire `p` jusqu'à `volume` : un
// événement de la minuterie de SOS, 20 fois par seconde (0x81770), l'y amène peu à peu. Tables :
// 0xDED98 un événement en place par numéro, 0xE3090 son descripteur ; 0xDECE8 et 0xE3010 un autre
// événement (non établi), retiré ; 0xDED18 le volume visé, 0xDED58 le volume de départ.
function volumeDUnBruitage(jeu, proprietaire, n, volume) {
  avecCadre(jeu, 16, 8, () => {
    if (jeu.m8[BRUITAGES_PRETS] === 0 || jeu.m8[BRUITAGES_VOULUS] === 0) return;
    for (let i = 0; i < NOMBRE_D_ECHANTILLONS; i++) {
      if (proprietaireDe(jeu, i) !== u16(proprietaire) || bruitageDe(jeu, i) !== u16(n)) continue;
      if (estLibre(jeu, i)) continue;
      if (jeu.m8[0xDED98 + i] !== 0) jeu.appeler(RETIRER_EVENEMENT, long(jeu, 0xE3090 + 4 * i));
      if (jeu.m8[0xDECE8 + i] !== 0) {
        jeu.appeler(RETIRER_EVENEMENT, long(jeu, 0xE3010 + 4 * i));
        jeu.m8[0xDECE8 + i] = 0;
      }
      const R = jeu.T.R;
      jeu.appeler(EVENEMENT_MINUTERIE, 0x14, MONTEE_DU_VOLUME, R.cs & 0xFFFF, 0xE3090 + 4 * i, R.ds & 0xFFFF);
      jeu.m8[0xDED98 + i] = 1;
      poserMot(jeu, 0xDED18 + 2 * i, volume);
      poserMot(jeu, 0xDED58 + 2 * i, mot(jeu, VOLUMES + 2 * i));
      return;
    }
  });
}

// 0x81770 — l'événement que pose 0x81984, appelé par la minuterie de SOS vingt fois par seconde (appel
// lointain, sur la pile privée de SOS). Pour chaque numéro qui en a un ([0xDED98]) : le bruitage fini,
// l'événement est retiré ; sinon son volume ([0xDED58], 16 bits signés) baisse de 0x200 et devient
// celui du bruitage (sosDIGISetSampleVolume, 0x879F8), tant qu'il reste au-dessus du volume visé
// ([0xDED18], × 256). Il est retiré quand le volume du bruitage ([0xD7A18]) ne dépasse pas le volume
// visé, ou quand le sien passe sous le volume visé ; tombé à zéro ou en dessous, le bruitage est
// arrêté (0x89A48). Ces trois retraits-là mettent fin au passage : les numéros suivants attendent le
// prochain (anomalie reproduite). Bruitages coupés ([0xBA720], [0xBA721]), tous les événements sont
// retirés. La pile est celle de l'original : registres sauvés, variable (le numéro) et adresses de
// retour, car la pile privée de SOS est comparée comme une variable. Aucun scénario ne l'atteint.
const REGLER_LE_VOLUME = 0x879F8;     // sosDIGISetSampleVolume(pilote, n, volume)
function monteeDuVolume(jeu, R) {
  const entree = R.esp >>> 0, ebp = entree - 16, ebpAvant = R.ebp;
  [R.ebx, R.esi, R.edi, R.ebp].forEach((v, k) => poserLong(jeu, entree - 4 * (k + 1), v));
  R.ebp = ebp;
  R.esp = ebp - 4;
  jeu.T.charger();
  const numero = ebp - 4;
  const appel = (retour, adresse, ...args) => jeu.appelerDepuis(retour, ebp - 4, adresse, ...args);
  const retirer = (i, retour) => {
    appel(retour, RETIRER_EVENEMENT, long(jeu, 0xE3090 + 4 * i));
    jeu.m8[0xDED98 + i] = 0;
  };
  try {
    if (jeu.m8[BRUITAGES_PRETS] === 0 || jeu.m8[BRUITAGES_VOULUS] === 0) {
      for (let i = 0; i < NOMBRE_D_ECHANTILLONS; i++) {
        poserLong(jeu, numero, i);
        if (jeu.m8[0xDED98 + i] !== 0) retirer(i, 0x8196C);
      }
      poserLong(jeu, numero, NOMBRE_D_ECHANTILLONS);
      return;
    }
    for (let i = 0; i < NOMBRE_D_ECHANTILLONS; i++) {
      poserLong(jeu, numero, i);
      if (jeu.m8[0xDED98 + i] === 0) continue;
      if (appel(0x817CF, ECHANTILLON_LIBRE, long(jeu, PILOTE_NUMERIQUE), i) !== 0) {
        retirer(i, 0x81920);
        continue;
      }
      if (mot(jeu, VOLUMES + 2 * i) <= mot(jeu, 0xDED18 + 2 * i)) { retirer(i, 0x8180D); return; }
      poserMot(jeu, 0xDED58 + 2 * i, mot(jeu, 0xDED58 + 2 * i) - 0x200);
      if (motSigne(jeu, 0xDED58 + 2 * i) <= 0) {
        appel(0x8184F, ARRETER_ECHANTILLON, long(jeu, PILOTE_NUMERIQUE), i);
        retirer(i, 0x81864);
        return;
      }
      if (motSigne(jeu, 0xDED58 + 2 * i) <= (mot(jeu, 0xDED18 + 2 * i) << 8) - 1) { retirer(i, 0x818B4); return; }
      poserMot(jeu, VOLUMES + 2 * i, mot(jeu, 0xDED58 + 2 * i));
      appel(0x81909, REGLER_LE_VOLUME, long(jeu, PILOTE_NUMERIQUE), i, mot(jeu, VOLUMES + 2 * i));
    }
    poserLong(jeu, numero, NOMBRE_D_ECHANTILLONS);
  } finally {
    R.ebp = ebpAvant;
    jeu.T.charger();
  }
}

// 0x81AD0 — jouer en boucle le bruitage `n` pour le propriétaire `p`, `boucles` fois, sauf s'il est
// déjà en cours pour lui ; sur le premier numéro libre, volume plein (0x7FFF), drapeaux 0x4100.
function jouerEnBoucle(jeu, proprietaire, n, boucles) {
  avecCadre(jeu, 16, 0x10, () => {
    if (jeu.m8[BRUITAGES_PRETS] === 0 || jeu.m8[BRUITAGES_VOULUS] === 0) return;
    if (s16(n) > mot(jeu, NOMBRE_DE_BRUITAGES)) return;
    for (let i = 0; i < NOMBRE_D_ECHANTILLONS; i++) {
      if (proprietaireDe(jeu, i) === u16(proprietaire) && bruitageDe(jeu, i) === u16(n) && !estLibre(jeu, i)) return;
    }
    let i = 0;
    while (i < NOMBRE_D_ECHANTILLONS && !estLibre(jeu, i)) i++;
    if (i === NOMBRE_D_ECHANTILLONS) return;
    poserMot(jeu, ECHANTILLONS + 4 * i, proprietaire);
    poserMot(jeu, ECHANTILLONS + 4 * i + 2, n);
    poserMot(jeu, 0xBA745, 0x4100);                // drapeaux du départ
    poserMot(jeu, 0xBA735, boucles);
    poserMot(jeu, 0xBA739, 0x7FFF);                // volume
    poserMot(jeu, VOLUMES + 2 * i, 0x7FFF);
    poserMot(jeu, 0xBA73B, i);
    const entree = long(jeu, BANQUE_DE_BRUITAGES) + (s16(n) << 5);
    poserLong(jeu, 0xBA731, long(jeu, entree + 0x1A) - 0x10);   // longueur, sans l'en-tête
    const ds = jeu.T.R.ds & 0xFFFF;
    poserMot(jeu, DEPART + 4, ds);
    poserLong(jeu, DEPART, long(jeu, entree + 0x12));
    poserLong(jeu, DERNIER_ECHANTILLON, jeu.appeler(DEMARRER_ECHANTILLON, long(jeu, PILOTE_NUMERIQUE), DEPART, ds));
  });
}

// =================================================================================================

const zoneDe = (debut, n) => [[debut >>> 0, (debut >>> 0) + (n >>> 0)]];
const tamponsDuCurseur = (jeu) => [CURSEUR_DECODE, FOND_SOUS_LE_CURSEUR, FOND_SOUS_LE_CURSEUR_2]
  .flatMap((a) => (long(jeu, a) ? zoneDe(long(jeu, a), 0x1000) : []));

export const reecritures = [
  // 1. le curseur logiciel
  { adresse: 0x7D2DD, nom: 'poserLeCurseurDansLImage', fn: poserLeCurseurDansLImage,
    zones: (jeu) => [...zoneDe(long(jeu, FOND_SOUS_LE_CURSEUR), 0x1000),
      ...zoneDe(long(jeu, FOND_SOUS_LE_CURSEUR_2), 0x1000)] },
  { adresse: 0x7D6C5, nom: 'remettreLeFondDuCurseur', fn: remettreLeFondDuCurseur },
  { adresse: 0x7D79E, nom: 'effacerLeCurseurApresPresentation', fn: effacerLeCurseur },
  { adresse: 0x7D7C7, nom: 'rendreLeTraceDuCurseur', fn: rendreLeTraceDuCurseur },
  { adresse: 0x7DDD7, nom: 'decoderLImageDuCurseur', fn: decoderLImageDuCurseur, arguments: 1,
    zones: (jeu) => zoneDe(long(jeu, CURSEUR_DECODE), 0x1000) },
  // 2. la souris
  { adresse: 0x7DF44, nom: 'installerLaSouris', fn: installerLaSouris, retour: true, memoire: 'entiere' },
  { adresse: 0x7E0E1, nom: 'arreterLaSouris', fn: arreterLaSouris },
  { adresse: 0x7E126, nom: 'plageDeLaSouris', fn: plageDeLaSouris },
  { adresse: 0x7E570, nom: 'selecteurDesDonnees', fn: selecteurDesDonnees, convention: 'registres',
    registresCompares: TOUS_REGISTRES },
  // 3. la carte vidéo
  { adresse: 0x7EC50, nom: 'passerEnBasseResolution', fn: passerEnBasseResolution, arguments: 1 },
  { adresse: 0x7ECF0, nom: 'passerEnHauteResolution', fn: passerEnHauteResolution, arguments: 1 },
  { adresse: 0x7E580, nom: 'lireLeModeVesa', fn: lireLeModeVesa, arguments: 1,
    zones: (jeu) => zoneDe(long(jeu, INFOS_VESA), 0x100) },
  { adresse: 0x7E658, nom: 'choisirLeModeVesa', fn: choisirLeModeVesa, arguments: 1,
    zones: (jeu) => zoneDe(long(jeu, INFOS_VESA), 0x100) },
  { adresse: 0x7E6BC, nom: 'choisirLaBanque', fn: choisirLaBanque, arguments: 1 },
  { adresse: 0x808B0, nom: 'poserLaPalette', fn: poserLaPalette, arguments: 1 },
  { adresse: 0x821DF, nom: 'ecrirePort', fn: ecrirePort, convention: 'registres', arguments: 2 },
  { adresse: 0x80250, nom: 'couleurLaPlusProche', fn: couleurLaPlusProche, arguments: 4, retour: true },
  // Pendant l'attente, l'hôte livre les interruptions : le gestionnaire de souris peut retracer le
  // pointeur à l'écran (0x7D4F9), avec les tampons du curseur, qui vivent sur le tas.
  { adresse: 0x80BE4, nom: 'attendreLeBalayage', fn: attendreLeBalayage, convention: 'registres',
    registresCompares: TOUS_REGISTRES, zones: (jeu) => tamponsDuCurseur(jeu) },
  { adresse: 0x80C00, nom: 'poserUnPixelBasse', fn: poserUnPixelBasse, convention: 'registres',
    arguments: 3, registresCompares: TOUS_REGISTRES },
  { adresse: 0x80C40, nom: 'poserUnPixelHaute', fn: poserUnPixelHaute, convention: 'registres',
    arguments: 3, registresCompares: TOUS_REGISTRES },
  { adresse: 0x7F5BC, nom: 'rectanglePleinBasse', fn: (jeu, R) => rectanglePlein(jeu, R, true),
    convention: 'registres', arguments: 5, registresCompares: TOUS_REGISTRES },
  { adresse: 0x81D88, nom: 'rectanglePleinHaute', fn: (jeu, R) => rectanglePlein(jeu, R, false),
    convention: 'registres', arguments: 5, registresCompares: TOUS_REGISTRES },
  { adresse: 0x81590, nom: 'remplirDesLignes', fn: remplirDesLignes, convention: 'registres',
    arguments: 3, registresCompares: TOUS_REGISTRES,
    zones: (jeu, R) => zoneDe(jeu.machine.r32((R.esp >>> 0) + 4), jeu.machine.r16((R.esp >>> 0) + 8) * 320) },
  { adresse: 0x7C282, nom: 'effacerEtChangerDePalette', fn: effacerLEcran, arguments: 1 },
  { adresse: 0x7C32D, nom: 'revenirALaPaletteDuParc', fn: revenirALaPaletteDuParc },
  // 4. les interruptions
  { adresse: 0x7F085, nom: 'int386', fn: int386, arguments: 3, retour: true },
  { adresse: 0x816B5, nom: 'int386x', fn: int386x, arguments: 4, retour: true,
    registresCompares: ['eax', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'] },
  { adresse: 0x81688, nom: 'segread', fn: segread, convention: 'registres', arguments: 1 },
  { adresse: 0x8164E, nom: 'lireUnVecteur', fn: lireUnVecteur, convention: 'registres', arguments: 1,
    registresCompares: ['eax', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'] },
  { adresse: 0x828EB, nom: 'poserUnVecteur', fn: poserUnVecteur, convention: 'registres', arguments: 3 },
  { adresse: 0x7F49D, nom: 'masquerLesInterruptions', fn: masquerLesInterruptions, convention: 'registres',
    registresCompares: TOUS_REGISTRES },
  { adresse: 0x7F49F, nom: 'permettreLesInterruptions', fn: permettreLesInterruptions, convention: 'registres',
    registresCompares: TOUS_REGISTRES },
  { adresse: 0x7F16A, nom: 'toucheEnAttente', fn: toucheEnAttente, convention: 'registres',
    registresCompares: ['eax', 'ebx', 'esi', 'edi', 'ebp', 'esp'] },
  { adresse: 0x82D6C, nom: 'allouerDeLaMemoireDos', fn: allouerDeLaMemoireDos, arguments: 1, retour: true },
  // 5. le tas
  { adresse: 0x7E8D0, nom: 'allouerSurLeTasDuJeu', fn: allouer, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x7E9B8, nom: 'allouerAilleurs', fn: allouerAilleurs, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x7EA98, nom: 'decouperUnBloc', fn: decouperUnBloc, arguments: 2, retour: true },
  { adresse: 0x82C78, nom: 'bilanDuTas', fn: bilanDuTas },
  { adresse: 0x82930, nom: 'champQuatre', fn: champQuatre, arguments: 1, retour: true },
  // 6. les fichiers
  { adresse: 0x7EB70, nom: 'ouvrirUnFichier', fn: ouvrirUnFichier, arguments: 2, retour: true },
  { adresse: 0x7EBE0, nom: 'lireUnFichier', fn: lireUnFichier, arguments: 3, retour: true,
    zones: (jeu, fd, tampon, n) => zoneDe(tampon, Math.max(0, n | 0)) },
  { adresse: 0x7EC20, nom: 'fermerUnFichier', fn: fermerUnFichier, arguments: 1, retour: true },
  { adresse: 0x7ED80, nom: 'ecrireUnFichier', fn: ecrireUnFichier, arguments: 3, retour: true },
  { adresse: 0x7F57D, nom: 'longueurDuFichier', fn: longueurDuFichier, arguments: 1, retour: true },
  { adresse: 0x7F4B0, nom: 'tailleDecompressee', fn: tailleDecompressee, arguments: 1, retour: true },
  { adresse: 0x7F0B0, nom: 'chargerUnFichierCompresse', fn: chargerUnFichier, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x7F45A, nom: 'accesAUnFichier', fn: accesAUnFichier, arguments: 2, retour: true },
  { adresse: 0x82E64, nom: 'drapeauxDOuverture', fn: drapeauxDOuverture, arguments: 1, retour: true },
  { adresse: 0x82F13, nom: 'ouvrirUnFlux', fn: ouvrirUnFlux, arguments: 4, retour: true, memoire: 'entiere' },
  { adresse: 0x82FF8, nom: 'fopen', fn: fopen, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x7E83E, nom: 'signaler', fn: signaler, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x7E888, nom: 'toucheTraduite', fn: toucheTraduite, retour: true },
  // 7. la bibliothèque C
  { adresse: 0x7E1D8, nom: 'majuscule', fn: majuscule, arguments: 1, retour: true },
  { adresse: 0x7E1ED, nom: 'copierUneChaine', fn: copierUneChaine, arguments: 2, retour: true,
    zones: (jeu, d, s) => zoneDe(d, longueurEnMemoire(jeu, s) + 1) },
  { adresse: 0x7E216, nom: 'lireUnEntier', fn: lireUnEntier, arguments: 1, retour: true },
  { adresse: 0x7E822, nom: 'longueurDUneChaine', fn: longueurDUneChaine, arguments: 1, retour: true },
  { adresse: 0x7F1A0, nom: 'memset', fn: remplir, arguments: 3, retour: true,
    zones: (jeu, d, c, n) => zoneDe(d, n) },
  { adresse: 0x80958, nom: 'memcpy', fn: copier, arguments: 3, retour: true,
    zones: (jeu, d, s, n) => zoneDe(d, n) },
  { adresse: 0x81336, nom: 'ajouterUneChaine', fn: ajouterUneChaine, arguments: 2, retour: true,
    zones: (jeu, d, s) => zoneDe(d, longueurEnMemoire(jeu, d) + longueurEnMemoire(jeu, s) + 1) },
  { adresse: 0x81C7C, nom: 'copierAuPlusN', fn: copierAuPlusN, arguments: 3, retour: true,
    zones: (jeu, d, s, n) => zoneDe(d, n) },
  { adresse: 0x81E00, nom: 'comparerDesChaines', fn: comparerDesChaines, arguments: 2, retour: true,
    registresCompares: ['eax', 'ecx', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'] },
  { adresse: 0x81184, nom: 'echanger', fn: echanger, convention: 'registres', registresCompares: TOUS_REGISTRES,
    zones: (jeu, R) => [...zoneDe(R.esi, R.ecx), ...zoneDe(R.edi, R.ecx)] },
  { adresse: 0x811AA, nom: 'trier', fn: trier, arguments: 4,
    zones: (jeu, base, n, taille) => zoneDe(base, Math.imul(n, taille)) },
  { adresse: 0x7F63C, nom: 'sortieDeSprintf', fn: sortieDeSprintf, arguments: 2,
    zones: (jeu, specs) => zoneDe(long(jeu, specs), 1) },
  { adresse: 0x7F652, nom: 'sprintf', fn: sprintf, arguments: 2, retour: true,
    registresCompares: ['eax', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'],
    zones: (jeu, d) => zoneDe(d, 512) },
  { adresse: 0x7E860, nom: 'rien', fn: rien },
  // 8. le son
  { adresse: 0x80350, nom: 'arreterUnBruitage', fn: arreterUnBruitage, arguments: 2 },
  { adresse: 0x80DC0, nom: 'arreterTousLesBruitages', fn: arreterTousLesBruitages },
  { adresse: 0x80990, nom: 'arreterLaMusique', fn: arreterLaMusique },
  { adresse: 0x80A20, nom: 'lancerUnMorceau', fn: lancerUnMorceau, arguments: 1 },
  { adresse: 0x80E40, nom: 'changerLeTempo', fn: changerLeTempo, arguments: 1 },
  { adresse: 0x81984, nom: 'volumeDUnBruitage', fn: volumeDUnBruitage, arguments: 3 },
  { adresse: 0x81AD0, nom: 'jouerEnBoucle', fn: jouerEnBoucle, arguments: 3 },
];

// Non réécrites : ce que l'hôte a déjà pris en main.
export const enAttente = [
  // 0x81770 — l'événement de la baisse du volume d'un bruitage (voir la fonction) : jamais posé par les
  // scénarios.
  { adresse: 0x81770, nom: 'monteeDuVolume', fn: monteeDuVolume, convention: 'registres', nettoie: 4, memoire: 'entiere' },
  // 0x7F181 — getch, que l'hôte ne permet pas d'atteindre (voir la fonction).
  { adresse: 0x7F181, nom: 'prendreUneTouche', fn: prendreUneTouche, convention: 'registres',
    registresCompares: ['eax', 'ebx', 'esi', 'edi', 'ebp', 'esp'] },
  // 0x7D775 — poser le curseur dans l'image : si [0xBECB4], lever [0xBECA4] et appeler 0x7D2DD.
  // L'hôte enveloppe cette adresse pour faire avancer son horloge d'une image (machine.js,
  // `adresseImage`) ; une réécriture posée par-dessus lui retirerait son repère, et la comparaison
  // appel par appel ne verrait que l'original sans l'enveloppe.
  { adresse: 0x7D775, nom: 'poserLeCurseur', arguments: 0,
    fn: (jeu) => {
      if (long(jeu, CURSEUR_AFFICHE) !== 0) {
        poserLong(jeu, TRACE_DIRECT_SUSPENDU, 1);
        jeu.appeler(0x7D2DD);
      }
    } },
  // 0x821BE — _chain_intr(décalage, sélecteur) : remplacée par l'hôte (machine.js), qui remonte à
  // l'ancien gestionnaire par une exception ; le code d'origine défait la pile du gestionnaire
  // d'interruption et saute par un `retf`, ce qu'une fonction JavaScript ne peut pas faire.
  { adresse: 0x821BE, nom: 'chainerLInterruption', arguments: 2,
    fn: () => { throw new Error("0x821BE : rendue par l'hôte"); } },
];
