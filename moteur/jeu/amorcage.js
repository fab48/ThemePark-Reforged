// L'amorçage, la boucle du parc, les ressources, le pointeur et les petites routines de dessin et de
// texte qui servent partout.
//
// Réécriture lisible de 36 fonctions du jeu d'origine. Voir docs/guide-reecriture.md.
//
// Un lot hétérogène : ce qui le rassemble, c'est d'être au plus près du « système » du jeu — ce qui
// démarre, ce qui tourne à chaque image, et les briques que tout le reste appelle. Sept familles :
//
// LA BOUCLE DU PARC — 0x11C45, la boucle qui tient le jeu du début à la fin (appelée une fois par le
// `main`, 0x10010), 0x1107F, le premier appel de chaque image, 0x1B23A, qui rouvre un écran, et
// 0x1B6A8, l'écran 0x66 (une image plein écran qui attend un geste). Le déroulement d'une image est
// décrit en tête de moteur/jeu/boucle.js ; il est ici en code.
//
// LES RESSOURCES — 0x5F550, 0x5F63F, 0x5F76D : les tables de fichiers à charger au lancement
// (fiches de 0x4F octets, voir plus bas), et 0x11921 / 0x11A51, qui préfixent les noms de fichiers
// du dossier du CD ou de l'installation ; 0x1180E charge un fichier compressé ou non, 0x115DB dit
// si un fichier existe, et 0x1095C lit la configuration du son.
//
// LES BANQUES D'IMAGES — 0x10C80 et 0x10CE4, qui relogent une table d'images et en doublent ou
// divisent par deux les dimensions ; 0x1036D et 0x1041A les appliquent aux six banques du jeu.
//
// LE POINTEUR ET LE MODE — 0x116E4 change l'image du curseur, 0x1146E remet le pilote de la souris à
// zéro, 0x1171F et 0x11761 basculent un instant en 320x200 pour un écran plein et en reviennent.
//
// LE DESSIN — 0x1188C, le rectangle plein ; 0x117B3, 0x11BD5 et 0x11AF4, trois tracés d'image
// (silhouette d'une couleur, et image enfoncée dans le sol), 0x5ED0C, l'enveloppe assembleur du
// traceur en 320x200 ; 0x18B62 efface une fiche d'objet.
//
// LE TEXTE — autour de la routine de texte 0x3F49E : 0x3F677 et 0x3F714 mesurent un texte dans les
// deux polices, 0x3F336 l'écrit aligné à droite, 0x3F377 centré, 0x3F3DA centré à chasse fixe,
// 0x3F7BD l'écrit dans la grande police, avec la vague des titres ; 0x3F296 compare deux mots pour
// un tri.
//
// LES LISTES D'ACHAT — 0x36001 inscrit une zone cliquable d'une fenêtre, 0x3671D prépare la liste
// des attractions, boutiques ou employés du parc, 0x36A2B écrit le genre d'une boutique.
//
// Les 36 fonctions n'ont en commun que d'être appelées par les scénarios sans avoir encore été
// réécrites ; le nom du module, « amorçage », ne couvre que la première famille.
//
// LA PREUVE. Toutes sont appelées par au moins un des seize scénarios. 0x11C45 ne rend la main que si
// le joueur quitte le jeu (F6 à l'écran titre) : aucun des seize ne le fait, et c'est le rejeu qui en
// fait foi ; un scénario qui laisse tourner la démonstration dans le parc, l'arrête, puis quitte,
// permet aussi de la comparer d'un seul appel, du début à la fin de la partie. 0x5F550, 0x5F63F, 0x1180E et 0x1B6A8 chargent des fichiers : la
// bibliothèque en lit l'en-tête dans un tampon local, sous leur point d'entrée, à une autre hauteur
// dans la transcription et dans la réécriture ; le comparateur, qui compare toute plage lue d'un
// fichier, y voit une différence qu'une réécriture « identité » (la transcription appelée huit
// octets plus bas) produit tout autant. Hors de ces octets de pile morte, elles sont identiques.

import { ecran, entrerDansLaVueDuParc, quitterLaVueDuParc, ECRANS_DU_PARC } from './grande-vue.js';
import { releverLImage } from './vue-fluide.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const s8 = (v) => (v << 24) >> 24;
const u8 = (v) => v & 0xFF;

const octet = (jeu, a) => jeu.m8[a >>> 0];
const octetSigne = (jeu, a) => s8(jeu.m8[a >>> 0]);
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Les variables locales de l'original qui doivent être en mémoire (un tampon dont on passe
// l'adresse) : on descend le pointeur de pile comme le fait son `enter`, et l'on rend l'adresse de
// la zone réservée. L'enveloppe (index.js) remet la pile en place au retour.
function variablesLocales(jeu, taille) {
  const T = jeu.T;
  T.sauver();
  const bas = ((T.R.esp >>> 0) - taille) >>> 0;
  T.R.esp = bas | 0;
  T.charger();
  return bas;
}

// Appeler une routine assembleur qui prend ses paramètres dans les registres : on pose les
// registres, puis on appelle normalement (jeu.appeler relit les registres courants).
function appelerAvecRegistres(jeu, registres, adresse, ...args) {
  const T = jeu.T;
  T.sauver();
  Object.assign(T.R, registres);
  T.charger();
  return jeu.appeler(adresse, ...args);
}

// Les routines assembleur 0x11AF4 et 0x11BD5 sauvent et rendent tous les registres.
const TOUS_LES_REGISTRES = ['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp'];
function noterLesRegistres(jeu) {
  const T = jeu.T;
  T.sauver();
  const copie = {};
  for (const k of TOUS_LES_REGISTRES) copie[k] = T.R[k];
  return copie;
}
function rendreLesRegistres(jeu, copie) {
  const T = jeu.T;
  T.sauver();
  Object.assign(T.R, copie);
  T.charger();
}

// --- les variables du jeu ----------------------------------------------------------------------
const MODE = 0xDE5F6;                // mot : 1 = 320x200, 8 = 640x480
const SURFACE = 0xDE5BC;             // pointeur : la surface de dessin
const FOND = 0xD3B98;                // pointeur : le tampon du fond
const PALETTE = 0xD3B8C;             // pointeur : la palette courante
const ECRAN = 0xD6652;               // mot : l'écran affiché, 0 = la vue du parc
const QUITTER = 0xD6688;             // mot : la boucle du parc s'arrête
const JOUEURS_EN_RESEAU = 0xD7792;   // octet : 1 en partie seule
const EN_PAUSE = 0xD779C;            // octet : le jeu est en pause
const VITESSE = 0xD6634;             // mot signé : la vitesse du jeu (§ 5.3)
const IMAGES_ENTRE_DEUX_PAS = 0xD7766;  // octet : aux vitesses lentes, les images comptées
const PAS_DE_SIMULATION = 0xD3AFC;   // long : 1 000 pas par mois
const PREMIER_OBJET = 0xD3B10;       // pointeur : la table des objets du parc, 0xC8 octets chacun
const FIN_DES_OBJETS = 0xD3B78;      // pointeur : la fin de cette table
const TAILLE_D_UN_OBJET = 0xC8;
const FICHE_DU_PARC = 0xD3818;       // pointeur : la fiche du parc du joueur
const COMPTES = 0xD3814;             // pointeur : les comptes du joueur
const TEXTES_DE_L_ECRAN = 0xD7BC0;   // pointeur : table de pointeurs de textes
const TEXTES_DES_LISTES = 0xD7BD0;   // pointeur : une autre table de textes
const TEINTES = 0xB14DA;             // pointeur vers six couleurs de l'interface ; +5 le texte
const OUTIL = 0xD6670;               // mot : l'outil choisi (0 = aucun)
const IMAGES_DES_CURSEURS = 0xB52C1; // octet par outil : l'image du pointeur
const BANQUE_DES_CURSEURS = 0xD3B84; // pointeur : les images des pointeurs, 6 octets chacune
const IMAGE_DU_CURSEUR = 0xBECB8;    // long : l'entrée d'image du pointeur courant
const BARRE_D_OUTILS = 0xD7798;      // octet : la barre d'outils est affichée
const DEMONSTRATION = 0xD7760;       // octet : la démonstration tourne
const DEMO_POSSIBLE = 0xB14AE;       // octet : save/demo.gy existe (posé par 0x104A3)
const IMAGES_SANS_GESTE = 0xD6606;   // mot : les images de l'écran titre sans un geste du joueur
const SOURIS_NOTEE_X = 0xD660A, SOURIS_NOTEE_Y = 0xD660C;   // mots : la souris à l'image d'avant
const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;               // mots signés : le curseur du jeu
const PILOTE_X = 0xBEC94, PILOTE_Y = 0xBEC96;               // mots : la position précédente du pilote
const TRACE_X = 0xB14E2, TRACE_Y = 0xB14E4;                 // mots signés : le pointeur collé à la grille
const DROIT_APPUI = 0xDE5A4, GAUCHE_APPUI = 0xDE5A6;        // mots : l'appui, à remettre à zéro
const DROIT_TENU = 0xDE5AA, GAUCHE_TENU = 0xDE5AC;          // mots : le bouton maintenu
const TOUCHE = 0xDE688;              // octet : le code de balayage de la touche de l'image
const MODIFICATEURS = 0xDE689;       // octet : les touches de modification tenues (boucle.js, 0x13BF3)
const SIGNE = 0xD77A1;               // octet : le signe ASCII de la touche
const SOURCE_DES_ENTREES = 0xBECB2;  // octet : 0 normal, 1 enregistrement (-r), 2 relecture (-p)
const BASCULE_EN_320 = 0xB1510;      // octet : 0x1171F a basculé un instant en 320x200
const PRESENTATION_FAITE = 0xB1511;  // octet : l'image a déjà été présentée ailleurs
const TOUT_RAFRAICHIR = 0xD6BCD;     // octet : présenter l'image entière, sans la grille des blocs
const COMMANDE_DIFFEREE = 0xD3828;   // pointeur de fonction : une ligne de menu à exécuter en fin d'image
const ARGUMENT_DIFFERE = 0xD6622;    // mot : son argument
const MODIFICATEURS_DIFFERES = 0xD7789, TOUCHE_DIFFEREE = 0xD7788;   // octets : une touche différée
const MORCEAU_EN_COURS = 0xBA71A;    // mot : 0 aucun ; de 1 à 0x11, 0x801A0 est appelée
const METEO = 0xB14CC, FORCE_DE_LA_METEO = 0xB14CB;          // octet de bits ; octet signé
const FLOCONS = 0xD2BB0;             // les 360 flocons de la neige, semés par 0x4790C (poses.js)
const SANS_CLIC_GAUCHE = 0xB14E8;    // octet : remis à zéro quand le bouton gauche n'est pas tenu
const VOLUME_DE_L_AMBIANCE = 0xB14B4;  // octet
const ECRAN_OUVERT_POUR = 0xD6608;   // mot : l'argument de 0x35F21
const FENETRE = 0xB14E6;             // mot : la fenêtre ouverte (0 : on inscrit les zones)
const OBJET_CHOISI = 0xD6678;        // mot : le numéro de l'objet choisi
const DOSSIER_DU_CD = 0xD3BBC, DOSSIER_DU_JEU = 0xD3BDE;     // chaînes

// --- les fonctions du jeu appelées ---------------------------------------------------------------
const COPIER_CHAINE = 0x7E1ED;       // strcpy
const LONGUEUR = 0x7E822;            // strlen
const FORMATER = 0x7F652;            // sprintf
const AJOUTER_CHAINE = 0x81336;      // strcat
const REMPLIR = 0x7F1A0;             // memset
const MESSAGE = 0x7E83E;             // printf
const LIRE_UNE_LIGNE = 0x82DD1;      // gets : attend la touche Entrée à la console
const ACCES = 0x7F45A;               // access(nom, mode) : 0 si le fichier existe
const OUVRIR = 0x7EB70;              // (nom, mode) : la poignée
const LIRE = 0x7EBE0;                // (poignée, tampon, octets)
const FERMER = 0x7EC20;              // (poignée)
const TAILLE_DEPLIEE = 0x7F4B0;      // (nom) : la taille une fois décompressé (en-tête « RNC »), ou celle du fichier
const TAILLE_DU_FICHIER = 0x7F57D;   // (poignée) : filelength
const CHARGER_UN_FICHIER = 0x7F0B0;  // (nom, destination) : lit et décompresse, rend la taille
const RESERVER = 0x7E8D0;            // malloc
const RESERVER_BAS = 0x7E9B8;        // l'autre allocateur (bit 0 de l'octet +0x4A d'une ressource)
const LIBERER = 0x7EDC0;             // free
const PREPARER_LE_TAS = 0x82950;
const INTERDIRE = 0x7F49D, PERMETTRE = 0x7F49F;   // cli, sti
const POSER_L_IMAGE_DU_CURSEUR = 0x7DDD7;         // (entrée d'image)
const PLAGE_DU_POINTEUR = 0x11303;   // (x min, x max, y min, y max)
const REMETTRE_LE_PILOTE = 0x1142A;
const PLACER_LE_POINTEUR = 0x11191;  // (x, y)
const LIRE_LA_SOURIS = 0x10992;
const LIRE_UNE_TOUCHE = 0x7E888;     // rend le signe ASCII de la touche de l'image
const TOUCHE_EN_ATTENTE = 0x7F16A, PRENDRE_LA_TOUCHE = 0x7F181;   // kbhit, getch
const LANCER_LA_DEMONSTRATION = 0x5B55A, ARRETER_LA_DEMONSTRATION = 0x5B82A;
const RENDRE_LE_MODE = 0x7E0E1;
const MODE_320 = 0x7EC50, MODE_640 = 0x7ECF0;     // (palette)
const CHANGER_DE_RESOLUTION = 0x10D42;            // (mode)
const RAFRAICHIR_TOUT = 0x55FCF;
const MARQUER_ZONE_SALE = 0x54D38;   // (x, y, largeur, hauteur)
const RECTANGLE_BAS = 0x7F5BC, RECTANGLE_HAUT = 0x55B86;   // (x, y, largeur, hauteur, couleur)
const TRACER_EN_320 = 0x5ED0C;       // enveloppe du traceur, paramètres dans les registres
const TRACER_SPRITE = 0x5ED21;       // le traceur (moteur/jeu/traceur.js)
const TRACER_UN_OBJET = 0x20F4C;     // (x, y, entrée d'image, 0)
const ECRIRE_TEXTE = 0x3F49E;        // (x, y, texte, mode, couleur)
const LARGEUR_DU_TEXTE = 0x3F677;
const ECRIRE_CENTRE = 0x3F377;       // (x0, x1, y, texte, mode, couleur)
const ECRIRE_TEXTE_FIXE_BAS = 0x80E88, ECRIRE_TEXTE_FIXE_HAUT = 0x80F34;   // (x, y, texte, couleur)
const VALEUR_ABSOLUE = 0x80BF2;
const ZONE_D_UNE_FENETRE = 0x408D3;  // (ordre) : l'adresse de l'ordre de la fenêtre courante
const CACHER_UN_ORDRE = 0x407A0;     // (ordre, 0)
const REGLER_L_AMBIANCE = 0x80568;   // (propriétaire, bruitage, mode, volume)
const SILHOUETTE = 0x117B3;
const RETIRER_DES_LISTES = 0x18918;  // (objet)

// =================================================================================================
// LES BANQUES D'IMAGES
// =================================================================================================
//
// Une banque d'images est une table d'entrées de six octets : +0 un long, la position des données
// codées de l'image, +4 sa largeur, +5 sa hauteur. Sur le disque, la position est un décalage dans
// le fichier des données ; une fois chargée, elle devient une adresse. Les dimensions sont celles
// de l'espace logique de 640 de large : en 320x200, le traceur les divise par deux. Mais le fichier
// les donne en pixels de l'écran 320x200 — d'où le doublement au chargement en mode 1.
//
// Les six banques du jeu, que 0x1036D reloge et que 0x1041A remet à l'échelle (0x10D42, au
// changement de résolution) : (table, fin de la table, données)
//   [0xD3BB8] [0xD3B88] [0xD3BA8]     [0xD3B90] [0xD3B34] [0xD3BA0]
//   [0xD3B58] [0xD3B60] [0xD3B48]     [0xD3B84] [0xD3B9C] [0xD3BA4]   (les pointeurs de la souris)
//   [0xD3B64] [0xD3B70] [0xD3B44]     (la police)                    [0xD3B54] [0xD3B5C] [0xD3B40]
const BANQUES = [
  [0xD3BB8, 0xD3B88, 0xD3BA8], [0xD3B90, 0xD3B34, 0xD3BA0], [0xD3B58, 0xD3B60, 0xD3B48],
  [0xD3B84, 0xD3B9C, 0xD3BA4], [0xD3B64, 0xD3B70, 0xD3B44], [0xD3B54, 0xD3B5C, 0xD3B40],
];

// 0x10C80 — reloger une banque : chaque position inférieure à l'adresse des données devient une
// adresse (celles qui le sont déjà ne bougent pas), et, en 320x200, les dimensions sont doublées.
//
// Le doublement se fait sur l'octet : une dimension de 128 ou plus y déborde. Seul le mot bas du mode
// est comparé à 1.
export function relogerUneBanque(jeu, table, fin, donnees) {
  for (let p = table >>> 0; p < (fin >>> 0); p = (p + 6) >>> 0) {
    if (mot(jeu, MODE) === 1) {
      poserOctet(jeu, p + 4, octet(jeu, p + 4) * 2);
      poserOctet(jeu, p + 5, octet(jeu, p + 5) * 2);
    }
    if (long(jeu, p) < (donnees >>> 0)) poserLong(jeu, p, long(jeu, p) + donnees);
  }
}

// 0x10CE4 — en 320x200, diviser par deux les dimensions de chaque image d'une banque.
export function diviserUneBanque(jeu, table, fin) {
  for (let p = table >>> 0; p < (fin >>> 0); p = (p + 6) >>> 0) {
    if (mot(jeu, MODE) !== 1) continue;
    poserOctet(jeu, p + 4, octet(jeu, p + 4) >> 1);
    poserOctet(jeu, p + 5, octet(jeu, p + 5) >> 1);
  }
}

// 0x1036D — reloger les six banques.
export function relogerLesBanques(jeu) {
  for (const [table, fin, donnees] of BANQUES) {
    jeu.appeler(0x10C80, long(jeu, table), long(jeu, fin), long(jeu, donnees));
  }
}

// 0x1041A — diviser les dimensions des six banques.
export function diviserLesBanques(jeu) {
  for (const [table, fin] of BANQUES) jeu.appeler(0x10CE4, long(jeu, table), long(jeu, fin));
}

// =================================================================================================
// LES FICHIERS ET LES RESSOURCES
// =================================================================================================

// 0x1095C — la configuration du son : la carte de musique, puis celle des bruitages (divers.js).
export function lireLaConfigurationDuSon(jeu) {
  jeu.appeler(0x5F7D4);
  jeu.appeler(0x5FAB0);
}

// 0x115DB — le fichier existe-t-il ? 0 s'il existe, −1 sinon (access(nom, 0) de la bibliothèque C).
export function fichierExiste(jeu, nom) {
  return jeu.appeler(ACCES, nom, 0);
}

// 0x1180E — charger un fichier entier : `taille` octets lus tels quels si le fichier n'est pas
// compressé, sinon décompressé par 0x7F0B0. Le fichier est non compressé quand sa taille dépliée
// (0x7F4B0 lit l'en-tête « RNC\1 ») est celle du fichier lui-même.
//
// ANOMALIES REPRODUITES : l'échec de l'ouverture n'est pas reconnu (le test porte sur 0, alors que
// la bibliothèque rend −1), et, quand `taille` est nulle, le fichier ouvert n'est jamais refermé.
export function chargerUnFichier(jeu, nom, destination, taille) {
  const poignee = jeu.appeler(OUVRIR, nom, 0x200);
  if (poignee === 0 || (taille >>> 0) === 0) return;
  const depliee = jeu.appeler(TAILLE_DEPLIEE, nom);
  if (depliee !== jeu.appeler(TAILLE_DU_FICHIER, poignee)) jeu.appeler(CHARGER_UN_FICHIER, nom, destination);
  else jeu.appeler(LIRE, poignee, destination, taille);
  jeu.appeler(FERMER, poignee);
}

// Les tables de noms de fichiers : une fiche par fichier, le nom au début, et un octet qui dit d'où
// il vient — 1 le dossier d'installation ([0xD3BDE]), 2 celui du CD ([0xD3BBC]), autre chose : le
// dossier courant. Une fiche au nom vide termine la table.
const TABLES_DE_FICHIERS = [
  { debut: 0xB0B6C, taille: 0x4F, origine: 0x4E },   // data/mspr-0.inf...
  { debut: 0xB105C, taille: 0x4F, origine: 0x4E },   // data/lang0-0.dat...
  { debut: 0xB13C1, taille: 0x4F, origine: 0x4E },   // data/mpanel-0.dat...
  { debut: 0xB7F8C, taille: 0x3F, origine: 0x3E },   // data/mpalette.dat...
];

// 0x11921 — préfixer les noms des quatre tables de fichiers par leur dossier.
export function prefixerLesNomsDeFichiers(jeu) {
  for (const { debut, taille, origine } of TABLES_DE_FICHIERS) {
    // L'indice est relu sur 16 bits : une table de plus de 65 535 fiches bouclerait.
    for (let k = 0; ; k++) {
      const fiche = debut + Math.imul(u16(k), taille);
      if (octet(jeu, fiche) === 0) break;
      jeu.appeler(0x11A51, fiche, octet(jeu, fiche + origine));
    }
  }
}

// 0x11A51 — préfixer un nom de fichier par le dossier que dit `origine` (1 l'installation, 2 le CD),
// par un tampon de 52 octets : sprintf("%s%s"), puis strcpy en place.
export function prefixerUnNom(jeu, nom, origine) {
  let dossier;
  switch (u8(origine)) {
    case 1: dossier = DOSSIER_DU_JEU; break;
    case 2: dossier = DOSSIER_DU_CD; break;
    default: return;
  }
  const tampon = (variablesLocales(jeu, 0x38) + 4) >>> 0;     // [ebp-0x34]
  jeu.appeler(FORMATER, tampon, 0xB00D6, dossier, nom);        // « %s%s »
  jeu.appeler(COPIER_CHAINE, nom, tampon);
}

// Une ressource est une fiche de 0x4F octets : +0 le nom du fichier (0x3E octets ; « * » pour un
// simple bloc de mémoire), +0x3E l'adresse du pointeur où ranger le bloc, +0x42 celle d'un pointeur
// de fin (facultatif : 0), +0x46 la taille, +0x4A des drapeaux — le bit 0 choisit l'allocateur
// 0x7E9B8 plutôt que malloc. Une table se termine par une fiche dont le pointeur +0x3E est nul.
const RESSOURCE = { pointeur: 0x3E, fin: 0x42, taille: 0x46, drapeaux: 0x4A, longueur: 0x4F };

// 0x5F76D — rendre la mémoire d'une ressource, s'il y en a, et oublier le pointeur.
export function rendreUneRessource(jeu, ressource) {
  const pointeur = long(jeu, ressource + RESSOURCE.pointeur);
  if (long(jeu, pointeur) === 0) return;
  jeu.appeler(LIBERER, long(jeu, pointeur));
  poserLong(jeu, long(jeu, ressource + RESSOURCE.pointeur), 0);
}

// 0x5F63F — charger une ressource. Rend 1 si elle est en place ; 0 si le fichier est absent, vide ou
// mal lu, ou si le bloc de mémoire (« * ») n'a pu être réservé ; −1 si la mémoire manque pour un
// fichier.
//
// ANOMALIES REPRODUITES : un fichier mal lu garde sa mémoire réservée (elle est perdue), et son
// pointeur de fin est mis à zéro sans vérifier qu'il existe — une ressource sans pointeur de fin
// écrirait alors à l'adresse 0.
export function demanderUneRessource(jeu, ressource) {
  jeu.appeler(PREPARER_LE_TAS);
  const reserver = (octet(jeu, ressource + RESSOURCE.drapeaux) & 1) !== 0 ? RESERVER_BAS : RESERVER;
  jeu.appeler(0x5F76D, ressource);
  const pointeur = () => long(jeu, ressource + RESSOURCE.pointeur);

  if (octet(jeu, ressource) === 0x2A) {                 // « * » : un bloc de mémoire, sans fichier
    const bloc = jeu.appeler(reserver, long(jeu, ressource + RESSOURCE.taille));
    poserLong(jeu, pointeur(), bloc);
    if (long(jeu, pointeur()) === 0) return 0;
  } else {
    poserLong(jeu, ressource + RESSOURCE.taille, jeu.appeler(TAILLE_DEPLIEE, ressource));
    if (longSigne(jeu, ressource + RESSOURCE.taille) <= 0) return 0;
    const bloc = jeu.appeler(reserver, long(jeu, ressource + RESSOURCE.taille));
    poserLong(jeu, pointeur(), bloc);
    if (long(jeu, pointeur()) === 0) return -1;
    const lus = jeu.appeler(CHARGER_UN_FICHIER, ressource, long(jeu, pointeur()));
    if ((lus >>> 0) !== long(jeu, ressource + RESSOURCE.taille)) {
      poserLong(jeu, pointeur(), 0);
      poserLong(jeu, long(jeu, ressource + RESSOURCE.fin), 0);
      poserLong(jeu, ressource + RESSOURCE.taille, 0);
      return 0;
    }
  }
  const fin = long(jeu, ressource + RESSOURCE.fin);
  if (fin !== 0) poserLong(jeu, fin, long(jeu, pointeur()) + long(jeu, ressource + RESSOURCE.taille));
  return 1;
}

// 0x5F550 — charger toute une table de ressources : d'abord tout rendre, puis tout demander. Chaque
// échec est dit à la console (« ERROR: Allocation %s. » ou « ERROR: File %s. », puis « Press return
// to continue ») et attend la touche Entrée. Rend le nombre d'échecs, sur 16 bits.
export function chargerDesRessources(jeu, table) {
  const ligneLue = variablesLocales(jeu, 0x74);                // [ebp-0x74], le tampon de gets
  jeu.appeler(PREPARER_LE_TAS);
  for (let r = table >>> 0; long(jeu, r + RESSOURCE.pointeur) !== 0; r = (r + RESSOURCE.longueur) >>> 0) {
    jeu.appeler(0x5F76D, r);
  }
  let echecs = 0;
  for (let r = table >>> 0; long(jeu, r + RESSOURCE.pointeur) !== 0; r = (r + RESSOURCE.longueur) >>> 0) {
    const resultat = s16(jeu.appeler(0x5F63F, r));
    if (resultat > 0) continue;
    jeu.appeler(MESSAGE, resultat < 0 ? 0xB039C : 0xB03CD, r);
    jeu.appeler(MESSAGE, 0xB03B3);
    jeu.appeler(LIRE_UNE_LIGNE, ligneLue);
    echecs++;
  }
  return u16(echecs);
}

// =================================================================================================
// LE POINTEUR, LE CLAVIER ET LE MODE D'AFFICHAGE
// =================================================================================================

// 0x116E4 — changer l'image du pointeur, si elle change, les interruptions coupées (le gestionnaire
// de la souris, 0x7D7E2, trace le pointeur).
export function changerLeCurseur(jeu, image) {
  if (long(jeu, IMAGE_DU_CURSEUR) === (image >>> 0)) return;
  jeu.appeler(INTERDIRE);
  poserLong(jeu, IMAGE_DU_CURSEUR, image);
  jeu.appeler(POSER_L_IMAGE_DU_CURSEUR, long(jeu, IMAGE_DU_CURSEUR));
  jeu.appeler(PERMETTRE);
}

// 0x1146E — remettre la souris à zéro : plage de 640x480, pilote réinitialisé (0x1142A), et, si
// (x, y) n'est pas (−1, −1), le pointeur placé là et les quatre mots des boutons vidés. La position
// précédente du pilote est posée au centre (320, 200), et le collage à la grille levé.
export function remettreLaSouris(jeu, x, y) {
  jeu.appeler(PLAGE_DU_POINTEUR, 0, 0x280, 0, 0x1E0);
  jeu.appeler(REMETTRE_LE_PILOTE);
  const oublierLaPosition = () => {
    poserMot(jeu, PILOTE_X, 0x140);
    poserMot(jeu, PILOTE_Y, 0xC8);
    poserMot(jeu, TRACE_X, 0xFFFF);
    poserMot(jeu, TRACE_Y, 0xFFFF);
  };
  if (s16(x) !== -1 && s16(y) !== -1) {
    // Ces quatre écritures sont refaites juste après : le programme les fait deux fois.
    oublierLaPosition();
    jeu.appeler(PLACER_LE_POINTEUR, s16(x), s16(y));
    poserMot(jeu, DROIT_APPUI, 0);
    poserMot(jeu, DROIT_TENU, 0);
    poserMot(jeu, GAUCHE_APPUI, 0);
    poserMot(jeu, GAUCHE_TENU, 0);
  }
  oublierLaPosition();
}

// 0x1171F — passer un instant en 320x200 pour un écran plein, si l'on est en 640x480. L'octet
// 0xB1510 le retient, pour que 0x11761 revienne à la haute résolution.
export function passerEn320(jeu) {
  if ((octet(jeu, MODE) & 8) === 0) return;
  jeu.appeler(RENDRE_LE_MODE);
  jeu.appeler(MODE_320, long(jeu, PALETTE));
  jeu.appeler(CHANGER_DE_RESOLUTION, 1);
  poserOctet(jeu, BASCULE_EN_320, 1);
}

// 0x11761 — revenir en 640x480 après 0x1171F, et tout redessiner. Appelée à chaque image de la vue
// du parc : elle ne fait rien si le jeu n'a pas basculé.
export function revenirEn640(jeu) {
  if ((octet(jeu, MODE) & 1) === 0 || octet(jeu, BASCULE_EN_320) === 0) return;
  jeu.appeler(RENDRE_LE_MODE);
  jeu.appeler(MODE_640, long(jeu, PALETTE));
  jeu.appeler(CHANGER_DE_RESOLUTION, 8);
  poserOctet(jeu, BASCULE_EN_320, 0);
  jeu.appeler(RAFRAICHIR_TOUT);
}

// Vider le tampon du clavier de la console : tant qu'une touche attend, la prendre.
function viderLeClavier(jeu) {
  while (jeu.appeler(TOUCHE_EN_ATTENTE) !== 0) jeu.appeler(PRENDRE_LA_TOUCHE);
}

// 0x1107F — les entrées de l'image.
//
// La touche : son signe ASCII en 0xD77A1, puis le tampon du clavier est vidé. En relecture d'une
// partie enregistrée (option -p), la touche vient du tampon enregistré : on ne lit le clavier que
// si elle est vide. Avec -r ou -p, la souris est relevée par 0x10992 (en jeu normal, c'est le
// gestionnaire 0x7D7E2 qui la tient à jour).
//
// L'ÉCRAN TITRE COMPTE LES IMAGES SANS UN GESTE : seulement sur l'écran 0x50, hors pause et hors
// démonstration, et si le parc de la démonstration existe (0xB14AE). Une image sans bouton tenu,
// sans touche et sans mouvement de la souris avance 0xD6606 ; la 3 000ᵉ lance la démonstration
// (0x5B55A). Le moindre geste remet le compte à zéro — et, s'il avait atteint 3 000, arrête la
// démonstration (0x5B82A) : mais celle-ci, une fois lancée, n'est plus sur l'écran 0x50, et c'est
// la visite elle-même qui s'arrête (boucle.js, 0x5B5D0).
export function entreesDeLImage(jeu) {
  const relecture = (octet(jeu, SOURCE_DES_ENTREES) & 2) !== 0;
  if (!relecture || (octet(jeu, TOUCHE) === 0 && octet(jeu, MODIFICATEURS) === 0)) {
    poserOctet(jeu, SIGNE, jeu.appeler(LIRE_UNE_TOUCHE));
    viderLeClavier(jeu);
  }
  if ((octet(jeu, SOURCE_DES_ENTREES) & 3) !== 0) jeu.appeler(LIRE_LA_SOURIS);

  if (octet(jeu, DEMONSTRATION) !== 0 || octet(jeu, DEMO_POSSIBLE) === 0) return;
  if (octet(jeu, EN_PAUSE) !== 0 || mot(jeu, ECRAN) !== 0x50) return;

  const immobile = mot(jeu, GAUCHE_TENU) === 0 && mot(jeu, DROIT_TENU) === 0 && octet(jeu, TOUCHE) === 0
    && mot(jeu, SOURIS_NOTEE_X) === mot(jeu, SOURIS_X) && mot(jeu, SOURIS_NOTEE_Y) === mot(jeu, SOURIS_Y);
  if (immobile) {
    const avant = mot(jeu, IMAGES_SANS_GESTE);
    poserMot(jeu, IMAGES_SANS_GESTE, avant + 1);
    if (avant === 3000) jeu.appeler(LANCER_LA_DEMONSTRATION);
  } else {
    if (mot(jeu, IMAGES_SANS_GESTE) >= 3000) jeu.appeler(ARRETER_LA_DEMONSTRATION);
    poserMot(jeu, IMAGES_SANS_GESTE, 0);
  }
  poserMot(jeu, SOURIS_NOTEE_X, mot(jeu, SOURIS_X));
  poserMot(jeu, SOURIS_NOTEE_Y, mot(jeu, SOURIS_Y));
}

// =================================================================================================
// LE DESSIN
// =================================================================================================

const basseResolution = (jeu) => (octet(jeu, MODE) & 1) !== 0;
const hauteResolution = (jeu) => (octet(jeu, MODE) & 8) !== 0;

// 0x1188C — un rectangle plein, s'il a une largeur et une hauteur (signées) positives. En 320x200
// par 0x7F5BC, qui reçoit largeur et hauteur non signées ; en 640x480 par 0x55B86.
export function rectanglePlein(jeu, x, y, largeur, hauteur, couleur) {
  if (s16(hauteur) <= 0 || s16(largeur) <= 0) return;
  if (basseResolution(jeu)) jeu.appeler(RECTANGLE_BAS, s16(x), s16(y), u16(largeur), u16(hauteur), u8(couleur));
  else jeu.appeler(RECTANGLE_HAUT, s16(x), s16(y), s16(largeur), s16(hauteur), u8(couleur));
}

// 0x117B3 — tracer une image en silhouette d'une couleur (le texte de la grande police, 0x3F7BD) :
// en 640x480, marquer d'abord ses blocs de l'écran, puis la tracer par 0x11BD5, en coordonnées
// non signées.
export function tracerUneSilhouette(jeu, x, y, image, couleur) {
  if (hauteResolution(jeu)) {
    jeu.appeler(MARQUER_ZONE_SALE, s16(x), s16(y), octet(jeu, image + 4), octet(jeu, image + 5));
  }
  jeu.appeler(0x11BD5, u16(x), u16(y), image, u8(couleur));
}

// Les registres du traceur 0x5ED21 : ebx = x, ecx = y, dl = largeur, dh = hauteur (le reste d'edx
// est celui de l'appelant), esi = les données codées, edi = la surface.
function registresDuTraceur(jeu, x, y, largeur, hauteur, pixels, edx) {
  return {
    ebx: x | 0, ecx: y | 0, esi: pixels | 0, edi: long(jeu, SURFACE) | 0,
    edx: ((edx & ~0xFFFF) | (u8(hauteur) << 8) | u8(largeur)) | 0,
  };
}

// 0x11BD5 — tracer une image, `param` étant le premier paramètre du traceur : non nul, c'est la
// couleur d'une silhouette (le drapeau 0x40 de 0xBECBC). En 320x200 par l'enveloppe 0x5ED0C, en
// 640x480 directement ; dans un autre mode, rien. Routine assembleur : elle rend tous les registres.
export function tracerAvecParametre(jeu, x, y, image, param) {
  const registres = noterLesRegistres(jeu);
  const r = registresDuTraceur(jeu, s16(x), s16(y), octet(jeu, image + 4), octet(jeu, image + 5),
    long(jeu, image), registres.edx);
  if (basseResolution(jeu)) appelerAvecRegistres(jeu, r, TRACER_EN_320, u8(param), 0);
  else if (hauteResolution(jeu)) appelerAvecRegistres(jeu, r, TRACER_SPRITE, u8(param), 0);
  rendreLesRegistres(jeu, registres);
}

// 0x11AF4 — tracer une image enfoncée de `enfoncement` pixels (un objet du parc qui sort de terre,
// ou y descend).
//
// Enfoncement positif : l'image descend d'autant, et ses lignes du bas, sous le sol, ne sont pas
// tracées (la hauteur est diminuée, les données lues depuis la première ligne). Négatif : l'image
// reste en place, et ses premières lignes sont sautées dans les données — c'est son haut qui
// disparaît, et le reste remonte. En 640x480, la valeur est d'abord divisée par deux.
//
// Routine assembleur : elle rend tous les registres. En 320x200, une image réduite à une ligne ou
// moins n'est pas tracée.
//
// ANOMALIE REPRODUITE : en 640x480, la division par deux est un décalage non signé sur 32 bits : un
// enfoncement négatif y devient un nombre immense, l'image part très loin sous l'écran et n'est pas
// tracée du tout. En 320x200, le nombre de lignes sautées est encore divisé par deux, sur un octet
// signé : au-delà de 255, l'enfoncement se réduit modulo 256.
export function tracerEnfoncee(jeu, x, y, image, enfoncement) {
  const registres = noterLesRegistres(jeu);
  const decalage = () => (hauteResolution(jeu) ? (s16(enfoncement) >>> 1) | 0 : s16(enfoncement));
  let ecx = (s16(y) + decalage()) | 0;
  const largeur = octet(jeu, image + 4);
  let hauteur = octet(jeu, image + 5);
  let pixels = long(jeu, image);
  const fini = () => rendreLesRegistres(jeu, registres);
  if (hauteur === 0) return fini();

  const d = decalage();
  if (d === 0) return fini();
  if (d > 0) {
    hauteur = u8(hauteur - d);
  } else {
    ecx = (ecx - d) | 0;
    hauteur = u8(hauteur + d);
    let lignes = u8(-d);
    if ((mot(jeu, MODE) & 5) !== 0) lignes = u8(s8(lignes) >> 1);
    if (s8(lignes) <= 0) return fini();
    // Sauter `lignes` lignes des données codées : un octet négatif est une plage transparente,
    // un octet positif annonce autant de pixels, zéro termine la ligne.
    while (lignes !== 0) {
      const code = octet(jeu, pixels);
      pixels = (pixels + 1) | 0;
      if (code & 0x80) continue;
      if (code === 0) { lignes = u8(lignes - 1); continue; }
      pixels = (pixels + code) | 0;
    }
  }

  const r = registresDuTraceur(jeu, s16(x), ecx, largeur, hauteur, pixels, registres.edx);
  if (basseResolution(jeu) && hauteur > 1) appelerAvecRegistres(jeu, r, TRACER_EN_320, 0, 0);
  else if (hauteResolution(jeu)) appelerAvecRegistres(jeu, r, TRACER_SPRITE, 0, 0);
  fini();
}

// 0x5ED0C — l'enveloppe du traceur pour ses appelants en assembleur, en 320x200 : elle recopie ses
// deux paramètres (des octets) et appelle 0x5ED21 avec les registres reçus. Les registres rendus
// sont ceux que laisse le traceur.
function tracerEn320(jeu, R) {
  const pile = R.esp >>> 0;
  jeu.appeler(TRACER_SPRITE, jeu.m8[pile + 4], jeu.m8[pile + 8]);
}

// 0x18B62 — effacer un objet du parc : le retirer des listes (0x18918), puis mettre sa fiche à zéro.
export function effacerUnObjet(jeu, objet) {
  jeu.appeler(RETIRER_DES_LISTES, objet);
  jeu.appeler(REMPLIR, objet, 0, TAILLE_D_UN_OBJET);
}

// =================================================================================================
// LE TEXTE
// =================================================================================================
//
// Deux polices. La petite, celle de l'interface : la table 0xB51C1 donne pour chaque code de
// caractère le numéro de son image dans la banque [0xD3B64] (six octets par image, +4 la largeur).
// Un signe y avance de sa largeur plus une épaisseur (2 en 320x200, 1 en 640x480), l'espace de 8 ou
// de 4. La grande police, celle des titres des écrans de gestion : la table 0xB50C1, dans la même
// banque ; 0 veut dire « pas d'image », et le signe est sauté. Les signes s'y chevauchent de deux
// pixels ; l'espace avance de 16 (32 en 640x480). Largeurs et positions sont dans l'espace logique
// de 640 de large : en 640x480, les dimensions des images, stockées en pixels de 320x200 une fois
// divisées par 0x1041A, sont doublées.
const BANQUE_DE_LA_POLICE = 0xD3B64;
const PETITE_POLICE = 0xB51C1;
const GRANDE_POLICE = 0xB50C1;

// 0x3F677 — la largeur d'un texte dans la petite police.
export function largeurDuTexte(jeu, texte) {
  let largeur = 0;
  for (let p = texte >>> 0; octet(jeu, p) !== 0; p = (p + 1) >>> 0) {
    const c = octet(jeu, p);
    if (c === 0x20) { largeur = (largeur + (basseResolution(jeu) ? 8 : 4)) | 0; continue; }
    const image = octet(jeu, PETITE_POLICE + c);
    largeur = (largeur + octet(jeu, long(jeu, BANQUE_DE_LA_POLICE) + image * 6 + 4)
      + (basseResolution(jeu) ? 2 : 1)) | 0;
  }
  return largeur;
}

// 0x3F714 — la largeur d'un texte dans la grande police.
//
// ANOMALIE REPRODUITE, sans effet : la largeur d'une image est lue dans le mot bas d'un registre
// qui garde en haut l'adresse de l'entrée ; les 16 bits hauts du résultat en sont faux. Les deux
// appelants n'en gardent que le mot bas.
export function largeurEnGrandePolice(jeu, texte) {
  let largeur = 0;
  for (let p = texte >>> 0; octet(jeu, p) !== 0; p = (p + 1) >>> 0) {
    const c = octet(jeu, p);
    if (c === 0x20) { largeur = (largeur + (mot(jeu, MODE) === 8 ? 0x20 : 0x10)) | 0; continue; }
    const image = octet(jeu, GRANDE_POLICE + c);
    if (image === 0) continue;
    const entree = (Math.imul(image, 6) + long(jeu, BANQUE_DE_LA_POLICE)) | 0;
    const registre = ((entree & ~0xFFFF) | octet(jeu, entree + 4)) - 2;
    largeur = (largeur + (mot(jeu, MODE) === 8 ? registre * 2 : registre)) | 0;
  }
  return largeur;
}

// 0x3F336 — écrire un texte aligné à droite sur `droite`.
export function ecrireADroite(jeu, droite, y, texte, mode, couleur) {
  const largeur = jeu.appeler(LARGEUR_DU_TEXTE, texte);
  jeu.appeler(ECRIRE_TEXTE, s16(droite - largeur), s16(y), texte, u16(mode), u8(couleur));
}

// 0x3F377 — écrire un texte centré entre x0 et x1, jamais à gauche de 0. Le milieu est calculé sur
// 16 bits, arrondi vers zéro.
export function ecrireCentre(jeu, x0, x1, y, texte, mode, couleur) {
  const largeur = jeu.appeler(LARGEUR_DU_TEXTE, texte);
  let x = s16(x0 + (x1 - largeur));
  x = s16((x / 2) | 0);
  if (x < 0) x = 0;
  jeu.appeler(ECRIRE_TEXTE, x, s16(y), texte, u16(mode), u8(couleur));
}

// 0x3F3DA — écrire un texte centré entre x0 et x1 dans la police à chasse fixe de la bibliothèque
// (0x80E88 en 320x200, 0x80F34 en 640x480), chaque signe comptant pour 8 (ou 4) pixels logiques.
//
// La fonction d'origine rend dans eax l'adresse d'une de ses variables locales ; ses deux appelants
// ne la lisent pas, la réécriture ne la rend donc pas.
export function ecrireCentreAChasseFixe(jeu, x0, x1, y, texte, couleur) {
  const pas = basseResolution(jeu) ? 8 : 4;
  const longueur = jeu.appeler(LONGUEUR, texte);
  let x = s16(s16(x0) + (s16(x1) - Math.imul(pas, longueur)));
  x = s16((x / 2) | 0);
  if (x < 0) x = 0;
  jeu.appeler(basseResolution(jeu) ? ECRIRE_TEXTE_FIXE_BAS : ECRIRE_TEXTE_FIXE_HAUT, x, s16(y), texte, u8(couleur));
}

// 0x3F7BD — écrire un texte dans la grande police, avec deux effets choisis par `effets` :
//
//  - bit 0, LA VAGUE : chaque signe monte et descend. Sa hauteur est tenue dans deux tables d'octets
//    signés, indexées par la place du signe dans le texte : 0xB8CC0 la position, 0xB8CDC la vitesse.
//    À chaque appel, la position avance de la vitesse ; arrivée à ±10, elle ne bouge pas et la
//    vitesse s'inverse. Le signe est tracé à la moitié de la position, arrondie vers zéro. Sans ce
//    bit, le décalage reste celui du dernier signe calculé (zéro au départ) ;
//  - bit 1, LA SILHOUETTE : le signe est tracé d'une seule couleur (0x117B3, le drapeau 0x40 posé un
//    instant dans 0xBECBC) ; sinon, tel quel, par le tracé des objets 0x20F4C.
//
// Les signes se chevauchent de deux pixels (quatre en 640x480) ; l'espace avance de 16 (32).
//
// ANOMALIE, non atteinte : les deux tables ne font que 28 octets ; un texte plus long déborderait de
// la première dans la seconde. L'indice des signes n'avance que si la vague est demandée.
export function ecrireEnGrandePolice(jeu, x, y, texte, effets, couleur) {
  const POSITIONS = 0xB8CC0, VITESSES = 0xB8CDC;
  let rang = 0;
  let decalage = 0;
  for (let p = texte >>> 0; octet(jeu, p) !== 0; p = (p + 1) >>> 0) {
    const c = octet(jeu, p);
    if (c === 0x20) { x = (x + (mot(jeu, MODE) === 8 ? 0x20 : 0x10)) | 0; continue; }
    const image = octet(jeu, GRANDE_POLICE + c);
    if (image === 0) continue;

    if ((effets & 1) !== 0) {
      const k = s16(rang);
      decalage = s16(octetSigne(jeu, POSITIONS + k) + octetSigne(jeu, VITESSES + k));
      if (jeu.appeler(VALEUR_ABSOLUE, decalage) === 0xA) {
        decalage = octetSigne(jeu, POSITIONS + k);
        poserOctet(jeu, VITESSES + k, -octet(jeu, VITESSES + k));
      }
      rang++;
      poserOctet(jeu, POSITIONS + k, decalage);
      decalage = s16((decalage / 2) | 0);
    }

    const entree = (Math.imul(image, 6) + long(jeu, BANQUE_DE_LA_POLICE)) >>> 0;
    if ((effets & 2) !== 0) {
      const drapeaux = mot(jeu, 0xBECBC);
      poserMot(jeu, 0xBECBC, 0x40);
      jeu.appeler(SILHOUETTE, u16(x), u16(y + decalage), entree, u8(couleur));
      poserMot(jeu, 0xBECBC, drapeaux);
    } else {
      jeu.appeler(TRACER_UN_OBJET, u16(x), u16(y + decalage), entree, 0);
    }
    const avance = octet(jeu, entree + 4) - 2;
    x = (x + (mot(jeu, MODE) === 8 ? 2 * avance : avance)) | 0;
  }
}

// 0x3F296 — comparer deux éléments pour un tri (qsort, appelé par 0x74765 et ses voisines) : les 27
// bits bas du premier mot long de chacun, signés ; l'ordre est décroissant.
export function comparerPourLeTri(jeu, a, b) {
  const cle = (p) => (long(jeu, p) << 5) >> 5;
  return (cle(b) - cle(a)) | 0;
}

// =================================================================================================
// LES ZONES DES FENÊTRES ET LES LISTES D'ACHAT
// =================================================================================================

// 0x36001 — inscrire le rectangle d'un ordre de fenêtre (0x40, un bouton ; 0x41, un panneau inerte)
// dans la table des zones cliquables, 0xCE898, dix octets chacune : quatre mots (x0, y0, x1, y1,
// pris aux décalages +1 à +7 de l'ordre), l'octet +9 de l'ordre, et un octet qui dit si la zone
// répond au clic (0 pour un panneau inerte). On n'inscrit que pendant l'ouverture de la fenêtre
// (0xB14E6 nul). Le compte est en 0xD778B ; le pointeur de travail 0xD381C est remis à −1.
//
// Calcul mort, non transcrit : l'adresse 0xB7537 + 6 × (octet +8 de la zone) est calculée dans une
// variable locale jamais relue.
export function inscrireUneZone(jeu, ordre) {
  if (mot(jeu, FENETRE) !== 0) return;
  const ZONES = 0xCE898, NOMBRE_DE_ZONES = 0xD778B, ZONE_COURANTE = 0xD381C;
  const zone = ZONES + octet(jeu, NOMBRE_DE_ZONES) * 10;
  poserLong(jeu, ZONE_COURANTE, zone);
  for (let k = 0; k < 4; k++) poserMot(jeu, zone + 2 * k, mot(jeu, ordre + 1 + 2 * k));
  poserOctet(jeu, zone + 8, octet(jeu, ordre + 9));
  poserOctet(jeu, zone + 9, octet(jeu, ordre) === 0x41 ? 0 : 1);
  poserOctet(jeu, NOMBRE_DE_ZONES, octet(jeu, NOMBRE_DE_ZONES) + 1);
  poserLong(jeu, ZONE_COURANTE, 0xFFFFFFFF);
}

// 0x3671D — préparer la liste des fenêtres 0xE, 0xF et 0x10 : les attractions (genre d'objet 4), les
// boutiques (0xA) ou les employés (8) du parc, en 0xD382C, 14 octets par ligne — +0 un pointeur vers
// la fiche du catalogue, +4, +6 et +8 trois mots, +0xA l'objet — cinquante lignes au plus. Le nombre
// de lignes va en 0xD6628 et s'écrit au bas de la liste ; si l'objet choisi (0xD6678) est de ce
// genre, sa ligne est notée en 0xB14DE.
//
//   attraction : son catalogue (0xCCED0 + objet+0x16), objet+0x3C, son rang dans la liste, objet+0x2E ;
//   boutique   : son catalogue (0xD3C62 + objet+0x16), le prix (catalogue+0x4F), diminué, si la
//                boutique a une marchandise (catalogue+0x67, sinon −1), de son prix d'achat
//                (0xD3C02 + 14 × marchandise) — la marge ; puis objet+0x14 ; +8 n'est pas écrit ;
//   employé    : son métier (0xD35C0 + 0x36 × objet+0x59), une part sur cent (objet+0x34 × 100 divisé
//                par le temps écoulé depuis objet+0x3E, bornée à 100), cent moins cette part, objet+0x9A.
//
// Le sens des mots d'attraction et d'employé est à établir. Anomalies reproduites : pour la
// boutique, le mot +4 reçoit d'abord catalogue+0x53, aussitôt remplacé ; la part de l'employé est
// une division sur 32 bits non signés, dont seul l'octet bas est gardé, et qui s'arrêterait sur une
// division par zéro si l'employé avait été engagé au pas même.
//
// ANOMALIE, non atteinte : pour une autre fenêtre, le genre cherché est une variable jamais écrite,
// un reste de pile ; la fonction n'est appelée que pour ces trois fenêtres.
const LIGNES = 0xD382C, NOMBRE_DE_LIGNES = 0xD6628, LIGNE_CHOISIE = 0xB14DE;

export function preparerLaListe(jeu) {
  const entree = jeu.T.lireRegistre('esp') >>> 0;
  poserMot(jeu, NOMBRE_DE_LIGNES, 0);
  let ligne = LIGNES;
  let genre;
  switch (mot(jeu, FENETRE)) {
    case 0xE: genre = 4; break;
    case 0xF: genre = 0xA; break;
    case 0x10: genre = 8; break;
    default: genre = mot(jeu, entree - 0x1C);    // [ebp-0xc], jamais écrite
  }
  const tampon = (variablesLocales(jeu, 0x30) + 8) >>> 0;       // [ebp-0x28]

  for (let objet = (long(jeu, PREMIER_OBJET) + TAILLE_D_UN_OBJET) >>> 0;
    objet < long(jeu, FIN_DES_OBJETS) && ((ligne - LIGNES) / 14 | 0) < 0x32;
    objet = (objet + TAILLE_D_UN_OBJET) >>> 0) {
    if (octet(jeu, objet + 4) !== u16(genre)) continue;
    switch (u16(genre)) {
      case 4:
        poserLong(jeu, ligne, 0xCCED0 + mot(jeu, objet + 0x16));
        poserMot(jeu, ligne + 4, mot(jeu, objet + 0x3C));
        poserMot(jeu, ligne + 6, mot(jeu, NOMBRE_DE_LIGNES));
        poserMot(jeu, ligne + 8, mot(jeu, objet + 0x2E));
        break;
      case 0xA: {
        const catalogue = 0xD3C62 + mot(jeu, objet + 0x16);
        poserLong(jeu, ligne, catalogue);
        poserMot(jeu, ligne + 4, mot(jeu, catalogue + 0x53));
        const marchandise = octetSigne(jeu, catalogue + 0x67);
        if (marchandise !== -1) {
          poserMot(jeu, ligne + 4, mot(jeu, catalogue + 0x4F) - mot(jeu, 0xD3C02 + marchandise * 0xE));
        } else {
          poserMot(jeu, ligne + 4, mot(jeu, catalogue + 0x4F));
        }
        poserMot(jeu, ligne + 6, mot(jeu, objet + 0x14));
        break;
      }
      case 8: {
        poserLong(jeu, ligne, 0xD35C0 + octet(jeu, objet + 0x59) * 0x36);
        const diviseur = (long(jeu, PAS_DE_SIMULATION) - long(jeu, objet + 0x3E)) >>> 0;
        if (diviseur === 0) throw new Error('division par zero');
        const dividende = Math.imul(motSigne(jeu, objet + 0x34), 0x64) >>> 0;
        let part = Math.floor(dividende / diviseur) & 0xFF;
        if (part > 0x64) part = 0x64;
        poserMot(jeu, ligne + 4, part);
        poserMot(jeu, ligne + 6, 0x64 - part);
        poserMot(jeu, ligne + 8, mot(jeu, objet + 0x9A));
        break;
      }
      default: break;
    }
    poserLong(jeu, ligne + 0xA, objet);
    poserMot(jeu, NOMBRE_DE_LIGNES, mot(jeu, NOMBRE_DE_LIGNES) + 1);
    ligne += 0xE;
  }

  // Le nombre de lignes, centré sous la liste (ordre 0x92 de la fenêtre).
  const cadre = (jeu.appeler(ZONE_D_UNE_FENETRE, 0x92) + 0xB) >>> 0;
  jeu.appeler(FORMATER, tampon, 0xB0158, mot(jeu, NOMBRE_DE_LIGNES));     // « %d »
  jeu.appeler(ECRIRE_CENTRE, motSigne(jeu, cadre + 1), motSigne(jeu, cadre + 5),
    s16(mot(jeu, cadre + 3) + 6), tampon, 0, octet(jeu, long(jeu, TEINTES) + 5));

  poserMot(jeu, LIGNE_CHOISIE, 0);
  const choisi = mot(jeu, OBJET_CHOISI);
  if (choisi === 0) return;
  const objet = (Math.imul(choisi, TAILLE_D_UN_OBJET) + long(jeu, PREMIER_OBJET)) | 0;
  if (octet(jeu, objet + 4) !== u16(genre)) return;
  for (let k = 0; k < mot(jeu, NOMBRE_DE_LIGNES); k = (k + 1) & 0xFF) {
    if (longSigne(jeu, LIGNES + 0xA + k * 0xE) === objet) { poserMot(jeu, LIGNE_CHOISIE, k); return; }
  }
}
// 0x36A2B — écrire, dans la fiche d'une boutique, le genre de ce qu'elle vend : « <texte 0xA5> » et une espace (« %s »)
// suivi d'un des six mots 0xDC à 0xE1 de la table [0xD7BD0], selon l'octet +0x5E du catalogue.
// Le genre 6 n'a pas de mot : les ordres 0x21 et 0x22 de la fenêtre sont cachés, et une image est
// tracée à la place (image 0xB3 de la banque [0xD3B54]). Au-delà de 6, le texte seul.
export function ecrireLeGenreDUneBoutique(jeu) {
  const objet = (Math.imul(mot(jeu, OBJET_CHOISI), TAILLE_D_UN_OBJET) + long(jeu, PREMIER_OBJET)) | 0;
  const catalogue = 0xD3C62 + mot(jeu, objet + 0x16);
  const tampon = (variablesLocales(jeu, 0x50) + 4) >>> 0;       // [ebp-0x4c]
  const textes = long(jeu, TEXTES_DES_LISTES);
  jeu.appeler(FORMATER, tampon, 0xB015B, long(jeu, textes + 0x294));   // « %s » et une espace
  const genre = octet(jeu, catalogue + 0x5E);
  if (genre <= 5) {
    jeu.appeler(AJOUTER_CHAINE, tampon, long(jeu, textes + 0x370 + 4 * genre));
  } else if (genre === 6) {
    jeu.appeler(CACHER_UN_ORDRE, 0x21, 0);
    jeu.appeler(CACHER_UN_ORDRE, 0x22, 0);
    const cadre = (jeu.appeler(ZONE_D_UNE_FENETRE, 0x98) + 0x2C) >>> 0;
    jeu.appeler(TRACER_UN_OBJET, mot(jeu, cadre + 1), mot(jeu, cadre + 3), long(jeu, 0xD3B54) + 0x432, 0);
    return;
  }
  const cadre = (jeu.appeler(ZONE_D_UNE_FENETRE, 0x90) + 0x2C) >>> 0;
  jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, cadre + 1), motSigne(jeu, cadre + 3), tampon, 1,
    octet(jeu, long(jeu, TEINTES) + 5));
}

// =================================================================================================
// LES ÉCRANS ET LA BOUCLE DU PARC
// =================================================================================================

// Régler l'ambiance sonore du parc (le bruitage 0x15, mode 3), s'il est ouvert.
function reglerLAmbiance(jeu) {
  if (octet(jeu, long(jeu, FICHE_DU_PARC) + 0x18) === 0) return;
  jeu.appeler(REGLER_L_AMBIANCE, 0, 0x15, 3, octet(jeu, VOLUME_DE_L_AMBIANCE));
}

// 0x1B23A — rouvrir un écran (au retour de la démonstration, d'un écran plein...) : l'écran devient
// `ecran`, et, pour ceux qui ont une routine d'ouverture, elle est rappelée ; l'ambiance du parc est
// relancée pour la plupart. Les écrans 0x32 et 0x4C (les fiches de joueur et de pays ?) ne se
// rouvrent pas : on revient au parc. Anomalie sans effet : pour la vue du parc (0), l'ambiance est
// réglée deux fois.
export function rouvrirUnEcran(jeu, ecran) {
  let nouvel = ecran;
  if (u16(ecran) <= 0x62) {
    switch (u8(ecran)) {
      case 0x00:
        reglerLAmbiance(jeu);
        reglerLAmbiance(jeu);
        poserMot(jeu, ECRAN, ecran);
        break;
      case 0x4A: case 0x50: case 0x54: case 0x56: case 0x5A: case 0x5E:
        reglerLAmbiance(jeu);
        poserMot(jeu, ECRAN, ecran);
        break;
      case 0x08: case 0x0A: case 0x14: case 0x16: case 0x1C: case 0x1E: case 0x20: case 0x22:
      case 0x23: case 0x36: case 0x38: case 0x3A: case 0x3C: case 0x3E: case 0x42: case 0x48:
      case 0x60:
        reglerLAmbiance(jeu);
        jeu.appeler(0x35F21, mot(jeu, ECRAN_OUVERT_POUR));
        break;
      case 0x12:
        reglerLAmbiance(jeu);
        jeu.appeler(0x40641);
        jeu.appeler(0x3F975);
        break;
      case 0x32: case 0x4C:
        nouvel = 0;
        break;
      case 0x44:
        jeu.appeler(0x4B11E);
        break;
      case 0x4E:
        reglerLAmbiance(jeu);
        jeu.appeler(0x515A0);
        break;
      case 0x52:
        reglerLAmbiance(jeu);
        jeu.appeler(0x798D7);
        break;
      case 0x62:
        reglerLAmbiance(jeu);
        jeu.appeler(0x7B65C, u16(long(jeu, 0xD35B4) - 0xCCED0));
        break;
      case 0x40:
        reglerLAmbiance(jeu);
        jeu.appeler(0x77A55);
        break;
      default: break;
    }
  }
  poserMot(jeu, ECRAN, nouvel);
}

// Présenter la surface entière à l'écran, le pointeur posé dans l'image : en 320x200, 64 000 octets
// d'un coup ; en 640x480, par les cinq banques de 64 Ko de la carte (la dernière incomplète).
// `appeler(retour, adresse, ...args)` : la façon d'appeler du site d'origine.
function presenterToutLEcran(jeu, appeler, retours) {
  const m8 = jeu.m8;
  if (basseResolution(jeu)) {
    appeler(retours.poser, 0x7D775);
    const s = long(jeu, SURFACE);
    m8.copyWithin(0xA0000, s, s + 0xFA00);
    poserRegistres(jeu, { esi: (s + 0xFA00) | 0, edi: 0xAFA00 });
    appeler(retours.rendre320, 0x7D79E);
    return;
  }
  appeler(retours.poserHaut, 0x7D775);
  // En 640x480, cinq banques, quatre pleines et une de 0xB000 octets. (La grande vue, grande-vue.js,
  // en a davantage ; au-delà de la cinquième, l'adresse de retour de la dernière.)
  let s = long(jeu, SURFACE);
  const taille = ecran.largeur * ecran.hauteur;
  for (let banque = 0; banque * 0x10000 < taille; banque++) {
    appeler(retours.banques[Math.min(banque, 4)], 0x7E6BC, banque);
    const n = Math.min(0x10000, taille - banque * 0x10000);
    m8.copyWithin(0xA0000, s, s + n);
    s += n;
    poserRegistres(jeu, { esi: s | 0, edi: 0xA0000 + n });
  }
  appeler(retours.rendre640, 0x7D79E);
}

// 0x1B6A8 — l'écran 0x66 : l'image data/mmenu-0.dat, chargée dans le fond, recopiée sur la surface
// et présentée ; le jeu attend un clic ou une touche, puis revient à l'écran titre (0x50). Le
// pointeur prend l'image 0 pendant l'attente et l'image 1 ensuite ; la souris est replacée au
// centre. 0x80BE4 attend ensuite le retour du balayage vertical.
//
// L'attente relit la touche (0x7E888) en boucle : c'est une attente active, que l'hôte fait
// avancer par son garde-fou.
export function ecranDAttente(jeu) {
  const registres = noterLesRegistres(jeu);
  jeu.appeler(LIRE_UNE_TOUCHE);
  viderLeClavier(jeu);
  poserOctet(jeu, TOUCHE, 0);
  jeu.appeler(0x116E4, long(jeu, BANQUE_DES_CURSEURS));
  jeu.appeler(CHARGER_UN_FICHIER, 0xB8088, long(jeu, FOND));
  jeu.appeler(0x55EFA, long(jeu, FOND), long(jeu, SURFACE), 0x190);
  presenterToutLEcran(jeu, (retour, adresse, ...args) => jeu.appeler(adresse, ...args), {});
  jeu.appeler(PLACER_LE_POINTEUR, 0x140, 0xC8);
  while (octet(jeu, TOUCHE) === 0 && mot(jeu, GAUCHE_TENU) === 0 && mot(jeu, DROIT_TENU) === 0) {
    jeu.appeler(LIRE_UNE_TOUCHE);
  }
  jeu.appeler(LIRE_UNE_TOUCHE);
  viderLeClavier(jeu);
  poserOctet(jeu, TOUCHE, 0);
  poserMot(jeu, ECRAN, 0x50);
  jeu.appeler(0x80BE4);
  jeu.appeler(0x116E4, long(jeu, BANQUE_DES_CURSEURS) + 6);
  // Le prologue d'origine a sauvé ebx, esi, edi et ebp, que la copie de l'image a changés.
  rendreLesRegistres(jeu, { ebx: registres.ebx, esi: registres.esi, edi: registres.edi, ebp: registres.ebp });
}

// 0x11C45 — la boucle du parc, qui tient le jeu du début à la fin.
//
// Elle entre dans le parc (0x12452), puis tourne une image par tour jusqu'à ce que 0xD6688 demande
// d'en sortir ; elle appelle alors 0x185B0 et rend la main au `main`, qui quitte le programme.
//
// Une image : les entrées (0x1107F) ; la visite de la démonstration (0x5B5D0) ; la barre de menus
// (0x4FD85) ; 0x801A0 (non établie) si le morceau en cours (0xBA71A) est entre 1 et 0x11 ; LE
// PREMIER BLOC DE SIMULATION ; le pointeur recollé à la grille pendant le tracé d'un chemin ; la
// routine de l'écran affiché ; la commande différée d'un menu ; les événements (0x2CCF8) ; hors de
// l'écran titre, le fondu de la palette (0x1A706) et la présentation de l'image.
//
// LES DEUX BLOCS DE SIMULATION (§ 5.3). Un pas, c'est 0x12B1F (le calendrier et l'économie),
// 0x21681 (la mise à jour de tous les objets) et 0x283A6. À vitesse positive ou nulle, un tour en
// fait `vitesse + 1` ; à vitesse négative, un seul, une fois toutes les |vitesse| images. Le premier
// bloc tourne hors pause, dans la vue du parc ou en partie à plusieurs, et compte les images lentes
// dans 0xD7766 ; le second, dans la routine de la vue du parc, en partie seule et hors pause, les
// compte par le reste du calendrier divisé par |vitesse|. En partie seule, dans la vue du parc,
// les deux blocs s'appliquent donc à la même image : non établi si c'est voulu.
//
// LE POINTEUR COLLÉ À LA GRILLE. Pendant le tracé d'un chemin, le gestionnaire de souris range en
// 0xB14E2/0xB14E4 la position projetée ; la boucle y replace le pointeur du pilote. Mais c'est la
// position verticale du curseur (0xBECAE), et non 0xB14E4, qui est passée : seul l'horizontal est
// recollé. Reproduit tel quel.
//
// LA PRÉSENTATION. Pour les écrans 0x4A, 0x54, 0x56 et 0x64, qui s'affichent par-dessus la vue du
// parc, l'image entière est présentée sur place, 0xD6BCD levé le temps de la copie. Sinon, par
// 0x80210 (320x200) ou 0x55507 (640x480), sauf si 0xB1511 dit qu'elle l'a déjà été.
//
// Tous les appels sont faits à la hauteur de pile d'origine, avec leur adresse de retour : le cadre
// de la boucle (trois registres, ebp et 0x1C octets de variables) est reproduit, pour que les restes
// de pile que relisent certaines fonctions (index.js, resteRelu) soient ceux de 1994. Les registres
// que les fonctions appelées sauvent dans leur cadre — ebp, qui désigne celui de la boucle, et ebx,
// esi, edi, que la boucle modifie en passant (la recherche dans la table des écrans, la copie de
// l'image, le second bloc de simulation) — ont aussi les valeurs d'origine.
const CADRE_DE_LA_BOUCLE = 0x2C;

function poserRegistres(jeu, valeurs) {
  const T = jeu.T;
  T.sauver();
  Object.assign(T.R, valeurs);
  T.charger();
}

export function boucleDuParc(jeu) {
  const entree = jeu.T.lireRegistre('esp') >>> 0;
  const cadre = (entree - CADRE_DE_LA_BOUCLE) >>> 0;
  const depuis = (retour, adresse, ...args) => jeu.appelerDepuis(retour, cadre, adresse, ...args);
  // Le prologue : push ebx, esi, edi, puis enter 0x1C, 0.
  const aLEntree = noterLesRegistres(jeu);
  poserLong(jeu, entree - 4, aLEntree.ebx);
  poserLong(jeu, entree - 8, aLEntree.esi);
  poserLong(jeu, entree - 12, aLEntree.edi);
  poserLong(jeu, entree - 16, aLEntree.ebp);
  poserRegistres(jeu, { ebp: (entree - 16) | 0 });
  const curseur = (retour, outil) => depuis(retour, 0x116E4,
    long(jeu, BANQUE_DES_CURSEURS) + octet(jeu, IMAGES_DES_CURSEURS + outil) * 6);

  // Un pas de simulation, aux adresses de retour de l'un ou l'autre bloc.
  const unPas = (r) => {
    depuis(r[0], 0x12B1F);
    depuis(r[1], 0x21681, long(jeu, PREMIER_OBJET) + TAILLE_D_UN_OBJET, long(jeu, FIN_DES_OBJETS));
    depuis(r[2], 0x283A6);
  };
  // Autant de pas que la vitesse le veut ; `autorise` : le compte des images lentes est-il atteint.
  const simuler = (autorise, nombre, r) => {
    if (!autorise) return;
    for (let k = 0; u16(k) <= u16(nombre); k++) unPas(r);
  };

  depuis(0x11C51, 0x12452);
  while (mot(jeu, QUITTER) === 0) {
    depuis(0x11C64, 0x1107F);
    if (octet(jeu, DEMONSTRATION) !== 0) depuis(0x11C72, 0x5B5D0);
    depuis(0x11C77, 0x4FD85);
    const morceau = mot(jeu, MORCEAU_EN_COURS);
    if (morceau <= 0x11 && morceau > 0) depuis(0x11C92, 0x801A0);

    // Le premier bloc de simulation.
    if (octet(jeu, EN_PAUSE) === 0 && (mot(jeu, ECRAN) === 0 || octet(jeu, JOUEURS_EN_RESEAU) !== 1)) {
      if (motSigne(jeu, VITESSE) < 0) {
        poserOctet(jeu, IMAGES_ENTRE_DEUX_PAS, octet(jeu, IMAGES_ENTRE_DEUX_PAS) + 1);
        const atteint = u16(motSigne(jeu, VITESSE) + octet(jeu, IMAGES_ENTRE_DEUX_PAS)) === 0;
        if (atteint) poserOctet(jeu, IMAGES_ENTRE_DEUX_PAS, 0);
        simuler(atteint, 0, [0x11D25, 0x11D3B, 0x11D43]);
      } else {
        simuler(true, mot(jeu, VITESSE), [0x11D25, 0x11D3B, 0x11D43]);
      }
    }

    if (motSigne(jeu, TRACE_X) > -1 && motSigne(jeu, TRACE_Y) > -1) {
      depuis(0x11D77, PLACER_LE_POINTEUR, motSigne(jeu, TRACE_X), motSigne(jeu, SOURIS_Y));
    }

    routineDeLEcran(jeu, depuis, curseur, simuler);

    // La commande différée d'une ligne de menu.
    const commande = long(jeu, COMMANDE_DIFFEREE);
    if (commande !== 0) {
      if (commande === 0x13BF3) {
        depuis(0x12297, 0x13BF3, octet(jeu, MODIFICATEURS_DIFFERES), octet(jeu, TOUCHE_DIFFEREE));
        poserOctet(jeu, MODIFICATEURS_DIFFERES, 0);
        poserOctet(jeu, TOUCHE_DIFFEREE, 0);
      } else {
        depuis(0x122B8, commande, mot(jeu, ARGUMENT_DIFFERE));
      }
      poserLong(jeu, COMMANDE_DIFFEREE, 0);
      poserMot(jeu, ARGUMENT_DIFFERE, 0);
    }

    depuis(0x122D3, 0x2CCF8);
    if (mot(jeu, ECRAN) === 0x50) continue;
    depuis(0x122E6, 0x1A706);
    const parDessusLeParc = () => [0x4A, 0x56, 0x54, 0x64].includes(mot(jeu, ECRAN));
    if (parDessusLeParc()) {
      poserOctet(jeu, TOUT_RAFRAICHIR, 1);
      presenterToutLEcran(jeu, depuis, {
        poser: 0x1232B, rendre320: 0x12342, poserHaut: 0x1234C,
        banques: [0x12354, 0x12372, 0x1238A, 0x123A2, 0x123BA], rendre640: 0x123CC,
      });
      // Hors du jeu d'origine : en grande vue, l'image publiée pour la page (vue-fluide.js) ; le
      // pointeur a été retiré de la surface (0x7D79E).
      if (ecran.grande) releverLImage(jeu, false);
    } else if (octet(jeu, PRESENTATION_FAITE) === 0) {
      if (basseResolution(jeu)) depuis(0x123EB, 0x80210, 0x190);
      else depuis(0x123FE, 0x55507);
    } else {
      poserOctet(jeu, PRESENTATION_FAITE, 0);
    }
    if (parDessusLeParc()) poserOctet(jeu, TOUT_RAFRAICHIR, 0);
  }
  depuis(0x1244D, 0x185B0);
  rendreLesRegistres(jeu, aLEntree);
}

// La routine de l'écran affiché, choisie par le numéro de l'écran (table 0x11D7F). La plupart
// remettent d'abord le pointeur ordinaire.
const TABLE_DES_ECRANS = [0x66, 0x64, 0x62, 0x60, 0x56, 0x54, 0x52, 0x50, 0x4E, 0x4C, 0x4A, 0x48, 0x44,
  0x42, 0x40, 0x3E, 0x3C, 0x3A, 0x38, 0x36, 0x32, 0x23, 0x22, 0x20, 0x1E, 0x1C, 0x16, 0x14, 0x12, 0x0A,
  0x08, 0x00, 0x6C];
function routineDeLEcran(jeu, depuis, curseur, simuler) {
  const ecran = mot(jeu, ECRAN);
  // Hors du jeu d'origine : les autres écrans que la vue du parc repassent en 640x480 (grande-vue.js).
  if (!ECRANS_DU_PARC.includes(ecran)) quitterLaVueDuParc(jeu);
  if (ecran > 0x66) return;
  // `repne scasb` laisse edi juste après l'octet trouvé dans la table (ou à sa fin).
  const rang = TABLE_DES_ECRANS.indexOf(ecran);
  poserRegistres(jeu, { edi: 0x11D7F + (rang < 0 ? TABLE_DES_ECRANS.length : rang + 1) });
  switch (ecran) {
    case 0x00: case 0x4A: case 0x54: case 0x56: case 0x64:
      vueDuParc(jeu, depuis, curseur, simuler);
      break;
    case 0x08: curseur(0x120DA, 0); depuis(0x120E2, 0x398DF); break;
    case 0x0A: curseur(0x120FF, 0); break;
    case 0x12: curseur(0x1211F, 0); depuis(0x12127, 0x3F975); break;
    case 0x1E: case 0x20: case 0x22: curseur(0x12144, 0); depuis(0x1214C, 0x37E6D); break;
    case 0x32: depuis(0x1215C, 0x44EA5, 2); break;
    case 0x4C: depuis(0x1216F, 0x44EA5, 4); break;
    case 0x36: case 0x3A: case 0x3C: case 0x3E: curseur(0x1218F, 0); depuis(0x12197, 0x370EC); break;
    case 0x38: curseur(0x121B4, 0); depuis(0x121BC, 0x3A569); break;
    case 0x40: curseur(0x121D9, 0); depuis(0x121E1, 0x77B08); break;
    case 0x14: case 0x16: case 0x1C: case 0x42: case 0x60:
      curseur(0x121FE, 0); depuis(0x12206, 0x3854C); break;
    case 0x23: curseur(0x12220, 0); depuis(0x12228, 0x3854C); break;
    case 0x44: depuis(0x1222F, 0x4B56C); break;
    case 0x4E: depuis(0x12236, 0x51780); break;
    case 0x50:
      depuis(0x1223D, 0x1A836);
      if (octet(jeu, JOUEURS_EN_RESEAU) > 1) depuis(0x1224B, 0x49704);
      depuis(0x12250, 0x51011);
      break;
    case 0x52: depuis(0x12257, 0x79A04); break;
    case 0x48: depuis(0x1225E, 0x3A8EF); break;
    case 0x62: depuis(0x12265, 0x7B73E); break;
    case 0x66: depuis(0x1226C, 0x1B6A8); break;
    default: break;
  }
}

// La vue du parc, et les écrans qui s'y affichent par-dessus (0x4A, 0x54, 0x56, 0x64 : des messages).
function vueDuParc(jeu, depuis, curseur, simuler) {
  depuis(0x11E53, 0x11761);
  entrerDansLaVueDuParc(jeu);          // hors du jeu d'origine : la grande vue (grande-vue.js)
  curseur(0x11E72, mot(jeu, OUTIL));
  depuis(0x11E7A, 0x13B9A);
  if (octet(jeu, BARRE_D_OUTILS) !== 0) {
    depuis(0x11E88, 0x50651);
    depuis(0x11E90, 0x4DE1A, 0);
    depuis(0x11E98, 0x5CBDB);
  }
  if (long(jeu, PAS_DE_SIMULATION) < 0x1F4) depuis(0x11EA9, 0x1B229);

  // Le message de l'écran par-dessus.
  switch (mot(jeu, ECRAN)) {
    case 0x4A: depuis(0x11EBE, 0x78B7E, long(jeu, 0xD3810)); break;
    case 0x54: depuis(0x11ED5, 0x78CEF); break;
    case 0x56: depuis(0x11EF3, 0x78F89, long(jeu, COMPTES) + 0x1B1, 0); break;
    case 0x64: {
      const texte = longSigne(jeu, long(jeu, FICHE_DU_PARC) + 0x66) > 0x64 ? 0x5E : 0x5F;
      depuis(0x11F3C, 0x78F89, long(jeu, long(jeu, TEXTES_DE_L_ECRAN) + 4 * texte), 0);
      break;
    }
    default: break;
  }

  depuis(0x11F44, 0x6B9CB);
  // La météo : la neige (bit 1, les flocons que 0x47A27 fait tomber), puis 0x47606 pour la pluie
  // (bit 0) et pour l'orage (bit 2).
  if (octet(jeu, METEO) & 2) depuis(0x11F66, 0x47A27, 0x168, octetSigne(jeu, FORCE_DE_LA_METEO), FLOCONS);
  if (octet(jeu, METEO) & 1) depuis(0x11F97, 0x47606, 0xB4, 6, octetSigne(jeu, FORCE_DE_LA_METEO), 0, 0, 0, 0);
  if (octet(jeu, METEO) & 4) {
    depuis(0x11FD4, 0x47606, 0xB4, 6, octetSigne(jeu, FORCE_DE_LA_METEO), 0x32, 1, 2, 0x96);
  }
  depuis(0x11FDC, 0x6BF89);
  depuis(0x11FF1, 0x13BF3, octet(jeu, MODIFICATEURS), octet(jeu, TOUCHE));
  if (mot(jeu, GAUCHE_TENU) === 0) poserOctet(jeu, SANS_CLIC_GAUCHE, 0);
  depuis(0x1200A, 0x145FB);

  // Le second bloc de simulation.
  if (mot(jeu, ECRAN) === 0 && octet(jeu, EN_PAUSE) === 0 && octet(jeu, JOUEURS_EN_RESEAU) === 1) {
    const r = [0x1208D, 0x120A3, 0x120AB];
    const vitesse = motSigne(jeu, VITESSE);
    if (vitesse < 0) {
      poserRegistres(jeu, { ebx: -vitesse });
      const reste = long(jeu, PAS_DE_SIMULATION) % ((-vitesse) >>> 0);
      simuler(u16(reste) === 0, 0, r);
    } else {
      simuler(true, vitesse, r);
    }
  }
  if (octet(jeu, long(jeu, FICHE_DU_PARC) + 0x77) !== 0) depuis(0x120BD, 0x6D508);
}

// =================================================================================================

// Les routines assembleur qui rendent tous les registres : on les compare tous.
const REGISTRES_RENDUS = ['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp'];

export const reecritures = [
  // Les tables d'images sont dans le tas, hors des zones comparées par défaut : les déclarer (une
  // entrée qui commence avant la fin peut déborder de cinq octets).
  { adresse: 0x10C80, nom: 'relogerUneBanque', fn: relogerUneBanque, arguments: 3,
    zones: (jeu, table, fin) => [[table >>> 0, (fin >>> 0) + 6]] },
  { adresse: 0x10CE4, nom: 'diviserUneBanque', fn: diviserUneBanque, arguments: 2,
    zones: (jeu, table, fin) => [[table >>> 0, (fin >>> 0) + 6]] },
  { adresse: 0x1036D, nom: 'relogerLesBanques', fn: (jeu) => relogerLesBanques(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x1041A, nom: 'diviserLesBanques', fn: (jeu) => diviserLesBanques(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x1095C, nom: 'lireLaConfigurationDuSon', fn: (jeu) => lireLaConfigurationDuSon(jeu), arguments: 0 },
  { adresse: 0x115DB, nom: 'fichierExiste', fn: fichierExiste, arguments: 1, retour: true },
  { adresse: 0x1180E, nom: 'chargerUnFichier', fn: chargerUnFichier, arguments: 3, memoire: 'entiere' },
  { adresse: 0x11921, nom: 'prefixerLesNomsDeFichiers', fn: (jeu) => prefixerLesNomsDeFichiers(jeu), arguments: 0 },
  { adresse: 0x11A51, nom: 'prefixerUnNom', fn: prefixerUnNom, arguments: 2 },
  { adresse: 0x5F76D, nom: 'rendreUneRessource', fn: rendreUneRessource, arguments: 1, memoire: 'entiere' },
  { adresse: 0x5F63F, nom: 'demanderUneRessource', fn: demanderUneRessource, arguments: 1, retour: true,
    memoire: 'entiere' },
  { adresse: 0x5F550, nom: 'chargerDesRessources', fn: chargerDesRessources, arguments: 1, retour: true,
    memoire: 'entiere' },
  { adresse: 0x116E4, nom: 'changerLeCurseur', fn: changerLeCurseur, arguments: 1 },
  { adresse: 0x1146E, nom: 'remettreLaSouris', fn: remettreLaSouris, arguments: 2 },
  { adresse: 0x1171F, nom: 'passerEn320', fn: (jeu) => passerEn320(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x11761, nom: 'revenirEn640', fn: (jeu) => revenirEn640(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x1107F, nom: 'entreesDeLImage', fn: (jeu) => entreesDeLImage(jeu), arguments: 0 },
  { adresse: 0x1188C, nom: 'rectanglePlein', fn: rectanglePlein, arguments: 5 },
  { adresse: 0x117B3, nom: 'tracerUneSilhouette', fn: tracerUneSilhouette, arguments: 4 },
  { adresse: 0x11BD5, nom: 'tracerAvecParametre', fn: tracerAvecParametre, arguments: 4,
    registresCompares: REGISTRES_RENDUS },
  { adresse: 0x11AF4, nom: 'tracerEnfoncee', fn: tracerEnfoncee, arguments: 4, registresCompares: REGISTRES_RENDUS },
  { adresse: 0x5ED0C, nom: 'tracerEn320', fn: tracerEn320, convention: 'registres', arguments: 2,
    registresCompares: REGISTRES_RENDUS },
  { adresse: 0x18B62, nom: 'effacerUnObjet', fn: effacerUnObjet, arguments: 1, memoire: 'entiere' },
  { adresse: 0x3F677, nom: 'largeurDuTexte', fn: largeurDuTexte, arguments: 1, retour: true },
  { adresse: 0x3F714, nom: 'largeurEnGrandePolice', fn: largeurEnGrandePolice, arguments: 1, retour: true },
  { adresse: 0x3F336, nom: 'ecrireADroite', fn: ecrireADroite, arguments: 5 },
  { adresse: 0x3F377, nom: 'ecrireCentre', fn: ecrireCentre, arguments: 6 },
  { adresse: 0x3F3DA, nom: 'ecrireCentreAChasseFixe', fn: ecrireCentreAChasseFixe, arguments: 5 },
  { adresse: 0x3F7BD, nom: 'ecrireEnGrandePolice', fn: ecrireEnGrandePolice, arguments: 5 },
  { adresse: 0x3F296, nom: 'comparerPourLeTri', fn: comparerPourLeTri, arguments: 2, retour: true },
  { adresse: 0x36001, nom: 'inscrireUneZone', fn: inscrireUneZone, arguments: 1 },
  { adresse: 0x3671D, nom: 'preparerLaListe', fn: (jeu) => preparerLaListe(jeu), arguments: 0 },
  { adresse: 0x36A2B, nom: 'ecrireLeGenreDUneBoutique', fn: (jeu) => ecrireLeGenreDUneBoutique(jeu), arguments: 0 },
  { adresse: 0x1B23A, nom: 'rouvrirUnEcran', fn: rouvrirUnEcran, arguments: 1, memoire: 'entiere' },
  { adresse: 0x1B6A8, nom: 'ecranDAttente', fn: (jeu) => ecranDAttente(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x11C45, nom: 'boucleDuParc', fn: (jeu) => boucleDuParc(jeu), arguments: 0, memoire: 'entiere' },
];

export const enAttente = [];
