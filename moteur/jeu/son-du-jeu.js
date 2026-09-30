// Le son du jeu : la couche de Bullfrog au-dessus de la bibliothèque HMI SOS, ses morceaux, et le
// film d'une attraction avec son script sonore.
//
// Réécriture lisible de vingt-neuf routines que seule une carte son fait atteindre. Voir
// docs/guide-reecriture.md ; docs/retro-ingenierie.md § 9 pour le son, § 9.3 pour la couche de
// Bullfrog (dont systeme.js § 8 réécrit déjà les bruitages et les morceaux).
//
// Six familles, dans l'ordre du fichier :
//
//  1. L'OUVERTURE DU SON (0x6010C, 0x604D9, 0x6058B), appelée une fois au lancement par la lecture
//     de la configuration (divers.js, 0x5F7D4 et 0x5FAB0) : la musique (minuterie et système
//     MIDI de SOS, pilote, banques d'instruments INST.BNK et DRUM.BNK, banque de musique 0) ; les
//     bruitages (la carte nommée donne pilote, fréquence et cadence du mélange ; la banque de
//     bruitages est chargée en redescendant en qualité au besoin ; pilote numérique ouvert, routine
//     de remplissage inscrite à la minuterie de SOS).
//  2. LES MORCEAUX DE SOS (0x7F68F, 0x7FC05, 0x7FC8D, 0x7FBC2, 0x7FD96, 0x80034) :
//     sosMIDIInitSong, sosMIDIStartSong, sosMIDIStopSong, sosMIDIUnInitSong, la remise au début
//     d'un morceau (sosMIDIResetSong, vraisemblablement), et la lecture d'un délai des pistes.
//     Noms de la bibliothèque HMI SOS 4, reconnus à la forme du code et à l'ordre de leurs
//     appels par la couche de Bullfrog (0x80A20, 0x80990, 0x7EF60), pas lus dans le programme.
//  3. LE VOLUME DE LA MUSIQUE (0x11AD3, 0x800AB) : un message « contrôleur 7 » à chaque canal en
//     service de chaque pilote de musique ; et la relance du morceau fini (0x801A0), le message
//     remis au pilote (0x87202).
//  4. DEUX ÉVÉNEMENTS DE LA MINUTERIE DE SOS (0x5CA6B, 0x803E0), appelés par son répartiteur
//     (0x8280A) par un appel lointain, d'où leur `retf` : le compte des tics du jeu, et la montée
//     du volume des ambiances.
//  5. LE FILM D'UNE ATTRACTION (0x5C04F, 0x60C44, 0x5FC16, 0x60E30, 0x60EF3, 0x60F56, 0x60F92,
//     0x60FB9, 0x61033, 0x6110A, 0x611B1, 0x6123D) : la loupe de la fiche d'une attraction, ou la partie
//     gagnée, joue un film FLI/FLC (data/rideani.NNN, data/wingame.dat) en 320x200, image par image,
//     avec un script sonore (musique, bruitages) réglé sur les numéros d'image. Les décodeurs sont
//     écrits en assembleur : paramètres dans des variables, registres écrasés.
//  6. AU CHARGEMENT D'UNE PARTIE (0x19334) : les attractions sont vidées.
//
// LA PILE. Chaque réécriture ouvre le cadre de l'original : `avecLeCadreDOrigine` (cadre.js) pour
// le code C (ebx, esi, edi, ebp empilés, ebp sur le cadre, tous rendus en sortant), `avecEbp` pour
// l'assembleur qui fait `push ebp ; mov ebp, esp`, `avecCadre` pour de simples registres empilés.
// Les appels partent ainsi de la même hauteur, avec le même ebp. Le film (0x5C04F) en a besoin
// aussi : ses scripts sonores vivent dans ses variables locales, dont il passe l'adresse.
//
// LA PILE PRIVÉE DE SOS. Avec une carte son, le gestionnaire de l'IRQ 0 de SOS (0x8A369) range le
// pointeur de pile du code interrompu en 0xC370E, puis exécute les événements de sa minuterie sur
// sa pile privée (0xC3716 à 0xC4716), qui est de la mémoire de données ; le répartiteur (0x8280A)
// y empile ebx, esi, edi et ebp, ceux du code interrompu. D'où trois exigences, que seule la
// comparaison appel par appel voit (personne ne relit ces octets) : chaque service de l'hôte
// (interruption, port), même rendu dans une fonction appelée, doit partir de la même hauteur de pile
// que l'original, et avec les mêmes ebx, esi, edi et ebp — les réécritures posent donc ces registres
// comme l'original, jusque dans ses calculs de passage ; et les routines appelées sur cette pile
// (0x5CA6B, 0x803E0, et par le séquenceur 0x88D91 : 0x80034, 0x7FD96) y laissent exactement ce
// qu'y laissait l'original : registres sauvés, variables locales, adresses de retour de leurs appels
// (`Cadre`, `jeu.appelerDepuis`).
//
// LES SÉLECTEURS. Les routines de SOS manient des pointeurs lointains (décalage, sélecteur) : on
// lit la mémoire à la base du sélecteur (`Machine.base`), comme la transcription. Elles laissent
// dans gs le dernier sélecteur chargé ; les réécritures l'y laissent aussi, bien qu'aucun code C de
// Watcom ne relise gs sans le recharger.

import { Cadre } from './cadre.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Le produit signé 32 x 32 bits d'`imul` : les 32 bits bas (eax) et les 32 bits hauts (edx).
const produitBas = (a, b) => Math.imul(a, b);
// (sans BigInt, que les vieux navigateurs n'ont pas : par moitiés de 16 bits, tous les termes
// exacts dans un double ; identique à la version BigInt sur quatre millions de couples éprouvés)
const produitHaut = (a, b) => {
  a |= 0; b |= 0;
  const ah = a >> 16, al = a & 0xFFFF, bh = b >> 16, bl = b & 0xFFFF;
  const bas = al * bl, milieu = ah * bl + al * bh;
  return (ah * bh + Math.floor((milieu + Math.floor(bas / 65536)) / 65536)) | 0;
};

// Exécuter `corps(ebp)` avec le pointeur de pile là où l'original l'avait après son prologue :
// `sauves` octets de registres empilés (ebp compris), puis `locales` octets de variables (le même
// que dans systeme.js).
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

// Le cadre de l'original, en mémoire (cadre.js) : ebx, esi, edi et ebp empilés, ebp sur le cadre,
// le pointeur de pile sous `locales` octets de variables ; ebx, esi, edi et ebp rendus en sortant.
function avecLeCadreDOrigine(jeu, locales, corps) {
  const cadre = new Cadre(jeu, locales);
  try {
    return corps(cadre.ebp);
  } finally {
    cadre.fermer();
  }
}

// Le cadre des routines en assembleur : `push ebp ; mov ebp, esp`, puis `locales` octets (variables
// ou registres empilés). ebp rendu en sortant, et le pointeur de pile.
function avecEbp(jeu, locales, corps) {
  const T = jeu.T;
  T.sauver();
  const { esp: entree, ebp: ebpAppelant } = T.R;
  const ebp = ((entree >>> 0) - 4) >>> 0;
  jeu.machine.w32(ebp, ebpAppelant);
  T.R.ebp = ebp;
  T.R.esp = (ebp - locales) | 0;
  T.charger();
  try {
    return corps(ebp);
  } finally {
    T.sauver();
    T.R.esp = entree;
    T.R.ebp = ebpAppelant;
    T.charger();
  }
}

// Poser des registres, là où l'original les laisse (ou avant un service de l'hôte).
function poserRegistres(jeu, valeurs) {
  Object.assign(jeu.T.R, valeurs);
  jeu.T.charger();
}

// Un service de l'hôte, rendu depuis une réécriture (voir systeme.js).
function interruption(jeu, n) {
  jeu.T.charger();
  jeu.machine.interruption(n);
  jeu.T.charger();
}

// L'adresse d'un pointeur lointain.
const lointain = (jeu, decalage, selecteur) => (jeu.machine.base(selecteur & 0xFFFF) + decalage) >>> 0;

// Un appel lointain par un pointeur de 6 octets rangé en mémoire (`call far [adresse]`), comme la
// transcription : arguments, cs et l'adresse de retour de l'original empilés ; l'hôte dit ce qui
// répond à cette adresse (une routine du programme, ou un module de pilote qu'il remplace) ; le
// `retf` de l'appelée retire l'adresse et cs, l'appelant les arguments.
function appelLointain(jeu, pointeur, retour, ...args) {
  const T = jeu.T, m = jeu.machine;
  T.sauver();
  const R = T.R;
  let esp = R.esp;
  for (let k = args.length - 1; k >= 0; k--) { esp = (esp - 4) | 0; m.w32(esp, args[k]); }
  esp = (esp - 8) | 0;
  m.w32(esp + 4, R.cs);
  m.w32(esp, retour);
  R.esp = esp;
  T.charger();
  const decalage = long(jeu, pointeur), selecteur = mot(jeu, pointeur + 4);
  T.sauver();
  const f = m.appelLointain(decalage, selecteur);
  T.charger();
  if (f) f();
  T.sauver();
  R.esp = (R.esp + 4 * args.length) | 0;
  T.charger();
}

// Laisser dans gs le sélecteur que l'original y laisse.
function laisserGs(jeu, selecteur) {
  const T = jeu.T;
  T.sauver();
  T.R.gs = selecteur & 0xFFFF;
  T.charger();
}

// --- les variables --------------------------------------------------------------------------
// Le son (§ 9.3, systeme.js).
const MUSIQUE_PRETE = 0xBA714, MUSIQUE_VOULUE = 0xBA715;
const BRUITAGES_PRETS = 0xBA720, BRUITAGES_VOULUS = 0xBA721;
const MINUTERIE_DE_SOS_OUVERTE = 0xBA71C;   // octet : 0x6010C a ouvert la minuterie de SOS
const DETECTER_LA_CARTE = 0xBA722;          // octet : faux avec l'option -o (§ 9.1)
const MORCEAU_SOS = 0xD7984;
const PILOTE_MUSIQUE = 0xD7980;             // la poignée du pilote de musique de SOS
const PILOTE_NUMERIQUE = 0xD7B44;           // celle du pilote numérique
const EVENEMENT_DU_MELANGE = 0xD7B48;       // la poignée de la routine de remplissage à la minuterie
const VOLUMES = 0xD7A18;                    // 32 mots : le volume de chaque numéro d'échantillon

// L'ouverture de la musique.
const PORT_DE_LA_MUSIQUE = 0xD7910;         // lu dans BF_MUSIC (divers.js)
const MATERIEL_MIDI = 0xD7978;              // structure matériel de sosMIDIInitDriver : le port en +0
const INIT_MIDI = 0xD78E8;                  // structure d'initialisation (non établie)
const INSTRUMENTS = 0xD798E;                // pointeur lointain (décalage, sélecteur) : INST.BNK chargé
const PERCUSSIONS = 0xD7988;                // DRUM.BNK
// Deux octets posés selon le pilote de musique, relus par la couche de Bullfrog : 0xD7994, non nul
// quand INST.BNK et DRUM.BNK ont été pris (sortie.js les rend alors) ; 0xD7995, 0 pour le pilote
// FM, 1 pour la Roland, 2 pour l'AWE32 et le General MIDI — la banque de musique (MUSICb-0, -1,
// -2, § 9.1).
const BANQUES_FM_PRISES = 0xD7994, GENRE_DE_BANQUE = 0xD7995;
// Des octets d'état de la couche MIDI de Bullfrog, remis à zéro à l'ouverture (non établis).
const OCTETS_MIDI_A_ZERO = [0xC29F5, 0xC29FF, 0xC2A00, 0xC2A01, 0xC2A02, 0xC2A03, 0xC2A04, 0xC2A25,
  0xC2A2F, 0xC2A30, 0xC2A31, 0xC2A32, 0xC2A33, 0xC2A34, 0xC2A05, 0xC2A0F, 0xC2A10, 0xC2A11, 0xC2A12,
  0xC2A13, 0xC2A14];

// L'ouverture des bruitages.
const NOM_DE_LA_CARTE = 0xD7AD8;            // lu dans BF_SOUND
const PORT_NUMERIQUE = 0xD7B64, IRQ_NUMERIQUE = 0xD7B4C, DMA_NUMERIQUE = 0xD7A68;
const MATERIEL_NUMERIQUE = 0xD7B54;         // structure matériel de sosDIGIInitDriver : port, irq, dma
const PILOTE_DEMANDE = 0xD7AD0;             // l'identifiant du pilote numérique (0xE000...)
const CAPACITES = 0xD7A6C;                  // rempli par la détection (non établi)
const INIT_NUMERIQUE = 0xBA77D;             // structure d'initialisation du pilote numérique
const FREQUENCE_DU_MELANGE = 0xBA78D;       // dans cette structure : la fréquence d'échantillonnage
const REMPLISSAGE = 0xBA799;                // pointeur lointain de la routine de remplissage
const CADENCE_DU_MELANGE = 0xD7B6A;         // mot : appels par seconde de la routine de remplissage
const QUALITE = 0xBA727;                    // octet : 2 seize bits, 1 huit bits, 0 huit bits à 11 025 Hz
const SEIZE_BITS = 0xBA728;                 // octet

// Les morceaux de SOS : huit places.
const NOMBRE_DE_PLACES = 8;
const SIGNATURE_HMP = 0xC2B17;              // « HMIMIDIP », terminée par un zéro
const DONNEES_DU_MORCEAU = 0xBFF8E;         // 8 x 6 : pointeur lointain des données du morceau
const CARTE_DES_PISTES = 0xBFE0A;           // 8 x 6 : pointeur lointain de la carte piste -> pilote
const NOMBRE_DE_PISTES = 0xBFE3A;           // 8 x 4 : pistes jouées
const PISTES_DU_FICHIER = 0xBFE5A;          // 8 x 4 : pistes du fichier
const HORLOGE_DES_PISTES = 0xBFA0A;         // 8 x 0x80 : par piste, un mot long remis à zéro
const DEBUT_DES_PISTES = 0xC17A7;           // 8 x 0xC0 : par piste, pointeur lointain de son en-tête
const POSITION_DES_PISTES = 0xBF00A;        // 8 x 0xC0 : par piste, pointeur lointain de lecture
const DELAI_DES_PISTES = 0xBF60A;           // 8 x 0x80 : par piste, le délai avant l'événement suivant
const EVENEMENT_DU_MORCEAU = 0xBFFBE;       // 8 x 4 : poignée de l'événement de minuterie, -1 aucune
const MORCEAU_DE_L_EVENEMENT = 0xC34DD;     // par poignée : le morceau qu'il joue, 0xFF aucun
const MORCEAU_JOUE = 0xBFF4E;               // 8 x 4 : vrai tant que le morceau joue
const PILOTES_DE_MUSIQUE = 0xBEFCE;         // 5 x 4 : l'identifiant de chaque pilote ouvert, 0 : fin
// L'en-tête d'un fichier HMP (§ 9.5).
const HMP_NOMBRE_DE_PISTES = 0x30, HMP_CADENCE = 0x38, HMP_PISTES = 0x308;
const HMP_PILOTES_DE_PISTE = 0x80;          // par piste, 0x14 octets : cinq identifiants de pilote
const HMP_RAPPEL = 0x300;                   // pointeur lointain que SOS range dans l'en-tête (+8 de la
                                            // structure d'initialisation ; nul chez Bullfrog)
const PISTE_LIBRE = 0xFF;                   // dans la carte des pistes : à attribuer

// Le volume de la musique.
const VOLUME_GENERAL = 0xC2AC5;             // octet
const CANAL_EN_SERVICE = 0xC2A75;           // 16 octets par pilote : le canal joue
const VOLUME_DU_CANAL = 0xC2AC6;            // 16 octets par pilote : son volume propre
const MESSAGE_MIDI = 0xC29D7;               // 3 octets : statut, contrôleur, valeur
const TABLE_DES_PILOTES = 0xBFE7A;          // 0x24 octets par pilote : six pointeurs lointains
const CANAL_DES_PERCUSSIONS = 9;

// Les événements de la minuterie.
const TICS_DU_JEU = 0xB14B5;                // mot long : 72,8 par seconde (ecrans-infos.js)
const MONTEE_EN_COURS = 0xDECE8;            // 32 octets : une montée du volume est inscrite
const EVENEMENT_DE_MONTEE = 0xE3010;        // 32 x 4 : sa poignée
const VOLUME_VISE = 0xDECA8;                // 32 mots : son octet haut est visé

// Le film.
const NOM_DU_FILM = 0xBA7EC;
const FICHIER_DU_FILM = 0xBA7E4;            // mot long : le descripteur
const REPETITIONS = 0xBA7DE;                // mot : passes du film qui restent
const LIGNE_DU_SCRIPT = 0xBA70C;            // mot : la prochaine ligne du script sonore
const PALETTE_A_POSER = 0xBA7E0;            // mot long : 1, la palette du film est posée
const IMAGE_DU_FILM = 0xBA7D0;              // mot : le numéro de l'image en cours
const IMAGE_BA7DA = 0xBA7DA;                // mot : remis à zéro, jamais relu ici (non établi)
const HEURE_DE_L_IMAGE = 0xBA7D8;           // mot : l'heure, en centièmes dans la minute
const DELAI_ENTRE_IMAGES = 0xBA7E8;         // mot long : centièmes de seconde ; 0, ni image ni attente
const TAILLE_DU_BLOC = 0xBA7C8;             // mot long : la taille du bloc lu (en-tête compris)
const GENRE_DU_BLOC = 0xBA7C0;              // mot
const IMAGES_RESTANTES = 0xBA7C2;           // mot : lu dans l'en-tête du film
const LARGEUR_DU_FILM = 0xBA7C4, HAUTEUR_DU_FILM = 0xBA7C6;
const MORCEAUX_DE_L_IMAGE = 0xBA7CC;        // mot : les morceaux de l'image en cours
const PALETTE_CHANGEE = 0xBA81E;            // mot : un morceau de palette a été lu
const TAMPON_DU_FILM = 0xD3B94;             // pointeur : ce qu'on lit du fichier
const TAMPON_DE_PALETTE = 0xD35B8;          // pointeur : le morceau de palette lu
const PALETTE_DU_FILM = 0xD35BC;            // pointeur : 768 octets
const TAMPON_DU_FILM_EN_MEMOIRE = 0xBEEFC;  // pointeur : le film lu d'avance (commande L), 0 : aucun
const MUSIQUE_DU_FILM_EN_BOUCLE = 0xBA0FD;  // octet : relancer la musique de l'attraction finie
const MUSIQUE_DU_FILM = 0xBA0FE;            // octet
const MUSIQUE_DES_ATTRACTIONS = 0xBA0FF;    // 2 octets par attraction : sa musique, et
                                            // en +1 le film rejoué jusqu'à une touche
// Les genres de bloc d'un fichier FLC (Autodesk Animator).
const FLC_EN_TETE = 0xAF12, FLC_IMAGE = 0xF1FA;
const FLC_PALETTE = 4, FLC_DELTA_MOTS = 7, FLC_DELTA_OCTETS = 0xC, FLC_PLEIN = 0xF, FLC_COPIE = 0x10;
const TAILLE_D_EN_TETE_DE_BLOC = 6;
const MINUTE_EN_CENTIEMES = 0x1770;

// L'écran, la souris, le parc.
const MODE_AFFICHAGE = 0xDE5F6;             // mot : 1 basse résolution (320x200), 8 haute (640x480)
const SURFACE = 0xDE5BC;                    // pointeur vers l'image en construction
const FENETRE_VIDEO = 0xA0000;
const OCTETS_D_UNE_IMAGE = 64000;
const FOND = 0xD3B98;                       // pointeur : le tampon du fond
const PALETTE_DU_PARC = 0xD3B8C;
const GRAND_TAMPON = 0xD3BA8;               // pointeur : où l'on charge mspr-0.dat
const BANQUE_DES_CURSEURS = 0xD3B84;        // les images du pointeur, 6 octets chacune
const TRACE_DIRECT_SUSPENDU = 0xBECA4;      // mot long (systeme.js)
const TOUCHE = 0xDE688;                     // octet : la touche lue
const APPUI_GAUCHE = 0xDE5A6;               // mot
const GAUCHE_TENU = 0xDE5AC, DROIT_TENU = 0xDE5AA;
const SOURIS_X = 0xBEC94, SOURIS_Y = 0xBEC96;       // mots : la dernière position du pilote
const TRACE_X = 0xB14E2, TRACE_Y = 0xB14E4;         // mots : le point de tracé (souris-jeu.js)
const REDESSINER_CARTE = 0xD666E;
const NIVEAU_DU_FONDU = 0xD380C, PAS_DU_FONDU = 0xD777F;
const FICHE_DU_PARC = 0xD3818;              // l'octet +0x18 : le parc est ouvert
const VOLUME_DE_L_AMBIANCE = 0xB14B4;

// Les objets du parc.
const OBJETS = 0xD3B10, FIN_DES_OBJETS = 0xD3B78, TAILLE_D_OBJET = 0xC8;
const ATTRACTION = 4;
const CATALOGUE = 0xCCED0;                  // la fiche d'une attraction : 0xCCED0 + objet+0x16
const MONORAIL = 0xDB;                      // son identifiant, mot +0x22 de la fiche

// --- les fonctions d'autres modules ou non réécrites ---------------------------------------------
// SOS (noms de la bibliothèque HMI SOS 4 quand ils sont reconnus).
const TIMER_INIT_SYSTEM = 0x821FC, TIMER_UNINIT_SYSTEM = 0x822C1;
const TIMER_REGISTER_EVENT = 0x822F4, TIMER_REMOVE_EVENT = 0x8260A;
const MIDI_INIT_SYSTEM = 0x83FC6, MIDI_INIT_DRIVER = 0x8418C, MIDI_UNINIT_DRIVER = 0x84639;
const MIDI_UNINIT_SYSTEM = 0x84162, MIDI_SET_INS_DATA = 0x8564A;
const TEXTE_D_ERREUR_SOS = 0x84843;
const DIGI_INIT_SYSTEM = 0x84C12, DIGI_UNINIT_SYSTEM = 0x84C6E;
const DIGI_INIT_DRIVER = 0x84C98, DIGI_UNINIT_DRIVER = 0x853CA;
const DIGI_SAMPLE_DONE = 0x892DB, DIGI_SET_SAMPLE_VOLUME = 0x879F8;
const DET_INIT_SYSTEM = 0x85793, DET_FIND_CARD = 0x85950, DET_GET_SETTINGS = 0x85F3E;
const DET_UNINIT_SYSTEM = 0x858FC;
const RENDRE_UNE_STRUCTURE = 0x86120;       // (structure) : non établi (sortie.js)
const FIN_DES_BRUITAGES = 0xBEE78;
const NORMALISER = 0x88D4B;                 // (décalage, sélecteur) -> edx:eax, le même pointeur
const SEQUENCEUR = 0x88D91;                 // l'événement de minuterie qui joue les morceaux
const TAIRE_LE_MORCEAU = 0x86E23;           // (morceau) : non établi
const MORCEAU_FINI = 0x82174;
// La couche de Bullfrog.
const CHARGER_LA_BANQUE_DE_MUSIQUE = 0x83420, CHARGER_LA_BANQUE_DE_BRUITAGES = 0x83540;
const LANCER_UN_MORCEAU = 0x80A20, ARRETER_LA_MUSIQUE = 0x80990;
const JOUER_UN_BRUITAGE = 0x80C80, ARRETER_UN_BRUITAGE = 0x80350, ARRETER_TOUS_LES_BRUITAGES = 0x80DC0;
const JOUER_EN_BOUCLE = 0x81AD0, LANCER_UNE_AMBIANCE = 0x80568;
const LIRE_LE_FILM = 0x83670;               // (fichier, destination, n) : du film lu d'avance, sinon
                                            // du fichier
const LIRE_LE_FILM_D_AVANCE = 0x83700;      // (fichier, tampon, n)
const LIRE_UN_BLOC_DE_COPIE = 0x60F56, SAUTER_UN_BLOC = 0x60F74;
// La bibliothèque C et le socle.
const MESSAGE = 0x7E83E;                    // printf
const STRCMP = 0x81E00, STRICMP = 0x833D8, STRCPY = 0x7E1ED, SPRINTF = 0x7F652;
const ACCESS = 0x115DB;                     // access(nom, 0)
const SOPEN = 0x8616E, CLOSE = 0x8639A;
const TAILLE_DU_FICHIER = 0x7F4B0, OUVRIR = 0x7EB70, LIRE = 0x7EBE0, FERMER = 0x7EC20;
const ALLOUER = 0x7E8D0, MEMSET = 0x7F1A0, CHARGER_UN_FICHIER = 0x7F0B0;
const ATTENDRE_LE_BALAYAGE = 0x80BE4, POSER_LA_PALETTE = 0x808B0;
const PRESENTER_BASSE = 0x80210, PRESENTER_HAUTE = 0x55507, PRESENTER_L_IMAGE_HAUTE = 0x81CD4;
const EFFACER_DES_LIGNES_BASSE = 0x81590, EFFACER_DES_LIGNES_HAUTE = 0x815B8;
const AGRANDIR_L_IMAGE = 0x55EFA;
const PASSER_EN_BASSE = 0x7EC50, PASSER_EN_HAUTE = 0x7ECF0, MODE_D_ORIGINE = 0x7E270;
const PLAGE_DE_LA_SOURIS = 0x11303, PLACER_LA_SOURIS = 0x11191, CURSEUR = 0x116E4;
const OUVRIR_ECRAN_PLEIN = 0x40D3E, FERMER_ECRAN_PLEIN = 0x40D79;
const FONDRE_AU_NOIR = 0x4820D;             // (pas, palette)
const APPELER_LE_SUIVANT = 0x32142, FERMER_L_ATTRACTION = 0x31668;

// ================================================================================================
// 1. L'ouverture du son
// ================================================================================================

// Couper la musique après une erreur de SOS : pilote désactivé (s'il est ouvert), système MIDI et
// minuterie fermés, musique éteinte pour la partie.
function eteindreLaMusique(jeu, piloteOuvert) {
  if (piloteOuvert) jeu.appeler(MIDI_UNINIT_DRIVER, long(jeu, PILOTE_MUSIQUE), 1);
  jeu.appeler(MIDI_UNINIT_SYSTEM);
  jeu.appeler(TIMER_UNINIT_SYSTEM, 0);
  poserOctet(jeu, MUSIQUE_PRETE, 0);
  poserOctet(jeu, MUSIQUE_VOULUE, 0);
}
const signalerErreurSos = (jeu, format, erreur) => jeu.appeler(MESSAGE, format, jeu.appeler(TEXTE_D_ERREUR_SOS, erreur));

// 0x6010C — ouvrir la musique avec le pilote `pilote` (0xA002 FM, 0xA004 Roland, 0xA008 AWE32,
// 0xA001 General MIDI) : minuterie de SOS, sosMIDIInitSystem, sosMIDIInitDriver sur le port lu ;
// pour le pilote FM, les banques d'instruments INST.BNK et DRUM.BNK (sosMIDISetInsData) ; enfin la
// banque de musique 0. Chaque erreur éteint la musique pour la partie.
//
// Anomalie reproduite : un échec de sosMIDISetInsData pour INST.BNK éteint la musique, mais n'arrête
// pas la suite : DRUM.BNK est encore chargé et passé au pilote qu'on vient de fermer.
function ouvrirLaMusique(jeu, pilote) {
  avecLeCadreDOrigine(jeu, 0x6C, () => {
    for (const a of OCTETS_MIDI_A_ZERO) poserOctet(jeu, a, 0);
    jeu.appeler(TIMER_INIT_SYSTEM, 0xFF00, 0);
    poserOctet(jeu, MINUTERIE_DE_SOS_OUVERTE, 1);
    const ds = jeu.T.R.ds & 0xFFFF;
    jeu.appeler(MIDI_INIT_SYSTEM, 0xB0574, ds, 0);          // chemin des pilotes : ""
    poserMot(jeu, INIT_MIDI + 8, 0);
    poserLong(jeu, INIT_MIDI + 4, 0);
    poserLong(jeu, MATERIEL_MIDI, long(jeu, PORT_DE_LA_MUSIQUE));
    const erreur = jeu.appeler(MIDI_INIT_DRIVER, pilote, MATERIEL_MIDI, ds, INIT_MIDI, ds, PILOTE_MUSIQUE, ds);
    if (erreur !== 0) {
      signalerErreurSos(jeu, 0xB0575, erreur);               // « Error : %s »
      eteindreLaMusique(jeu, false);
      return;
    }
    switch (pilote >>> 0) {
      case 0xA002: ouvrirLesBanquesFm(jeu); break;
      case 0xA004: poserOctet(jeu, BANQUES_FM_PRISES, 0); poserOctet(jeu, GENRE_DE_BANQUE, 1); break;
      case 0xA008:
      case 0xA001: poserOctet(jeu, BANQUES_FM_PRISES, 0); poserOctet(jeu, GENRE_DE_BANQUE, 2); break;
      default: break;
    }
    if (octet(jeu, MUSIQUE_PRETE) === 0) return;
    if (jeu.appeler(CHARGER_LA_BANQUE_DE_MUSIQUE, 0) !== 0) {
      jeu.appeler(MESSAGE, 0xB05E4);                         // « Error opening music files »
      eteindreLaMusique(jeu, true);
    }
  });
}

// Les deux banques du pilote FM, chargées en mémoire et passées au pilote.
function ouvrirLesBanquesFm(jeu) {
  const banques = [
    { nom: 0xB0582, place: INSTRUMENTS, echec: 0xB0590 },    // data\inst.bnk
    { nom: 0xB05B3, place: PERCUSSIONS, echec: 0xB05C1 },    // data\drum.bnk
  ];
  for (const { nom, place, echec } of banques) {
    const decalage = jeu.appeler(CHARGER_UNE_BANQUE, nom) >>> 0;
    const selecteur = jeu.T.R.edx & 0xFFFF;
    poserRegistres(jeu, { ebx: jeu.T.R.edx, ecx: decalage });   // mov ebx, edx ; mov ecx, eax
    poserMot(jeu, place + 4, selecteur);
    poserLong(jeu, place, decalage);
    if (decalage === 0 && selecteur === 0) {
      jeu.appeler(MESSAGE, echec);                           // « Unable to load ... »
      poserOctet(jeu, MUSIQUE_PRETE, 0);
      poserOctet(jeu, MUSIQUE_VOULUE, 0);
      return;
    }
    const erreur = jeu.appeler(MIDI_SET_INS_DATA, long(jeu, PILOTE_MUSIQUE), decalage, selecteur, 1);
    if (erreur !== 0) {
      signalerErreurSos(jeu, 0xB0575, erreur);
      eteindreLaMusique(jeu, true);
    }
  }
  if (octet(jeu, MUSIQUE_PRETE) !== 0) {
    poserOctet(jeu, BANQUES_FM_PRISES, 1);
    poserOctet(jeu, GENRE_DE_BANQUE, 0);
  }
}

// 0x604D9 — charger un fichier entier dans un bloc du tas du jeu ; rend un pointeur lointain,
// décalage dans eax et sélecteur dans le mot bas d'edx (celui des données), ou 0:0.
//
// Anomalies reproduites : le fichier est fermé même s'il n'a pas pu être ouvert (descripteur -1) ;
// une lecture incomplète perd le bloc, jamais rendu. Le mot haut d'edx est celui qui traîne dans la
// pile, 14 octets sous le cadre (la variable 16 bits du sélecteur est relue en 32 bits) ; l'unique
// appelant n'en garde que le mot bas.
const CHARGER_UNE_BANQUE = 0x604D9;
function chargerUnFichierEntier(jeu, nom) {
  return avecLeCadreDOrigine(jeu, 0x1C, (ebp) => {
    let bloc = 0;
    const taille = jeu.appeler(TAILLE_DU_FICHIER, nom) | 0;
    if (taille > 0) {
      const fichier = jeu.appeler(OUVRIR, nom, 0x200) | 0;
      if (fichier !== -1) {
        bloc = jeu.appeler(ALLOUER, taille) >>> 0;
        if (bloc !== 0 && (jeu.appeler(LIRE, fichier, bloc, taille) | 0) !== taille) bloc = 0;
      }
      jeu.appeler(FERMER, fichier);
    }
    const selecteur = bloc !== 0 ? jeu.T.R.ds & 0xFFFF : 0;
    const resteDeLaPile = mot(jeu, ebp - 0xE);
    poserRegistres(jeu, { edx: (resteDeLaPile << 16 | selecteur) | 0 });
    return bloc | 0;
  });
}

// Les cartes des bruitages : nom (BF_SOUND), pilote de SOS, fréquence, cadence de la routine de
// remplissage (appels par seconde), qualité (2 : seize bits, SNDSb-2).
const CARTES_NUMERIQUES = [
  { pilote: 0xE000, frequence: 22050, cadence: 60, qualite: 1 },   // SBLAST
  { pilote: 0xE001, frequence: 22050, cadence: 120, qualite: 1 },  // SBPRO
  { pilote: 0xE017, frequence: 44100, cadence: 240, qualite: 2 },  // SB16
  { pilote: 0xE009, frequence: 22050, cadence: 60, qualite: 1 },   // ADLIBG
  { pilote: 0xE00B, frequence: 22050, cadence: 60, qualite: 1 },   // MICROSOFT8
  { pilote: 0xE00D, frequence: 44100, cadence: 240, qualite: 2 },  // MICROSOFT16
  { pilote: 0xE003, frequence: 22050, cadence: 60, qualite: 1 },   // PAS8
  { pilote: 0xE004, frequence: 44100, cadence: 240, qualite: 2 },  // PAS16
  { pilote: 0xE000, frequence: 22050, cadence: 60, qualite: 1 },   // GRAVIS
  { pilote: 0xE002, frequence: 22050, cadence: 60, qualite: 1 },   // SOUNDMASTERII
  { pilote: 0xE000, frequence: 22050, cadence: 60, qualite: 1 },   // COMPATIBLE
];
// Les liens de l'ouverture des bruitages : les noms de ces cartes (dans l'ordre), les messages, le nom
// de la carte lu, la structure que remplit la détection et le pilote demandé. L'introduction a la
// même ouverture, compilée autrement, avec les siens (intro.js).
export const BRUITAGES_DU_JEU = {
  noms: [0xB0600, 0xB0607, 0xB060D, 0xB0612, 0xB0619, 0xB0624, 0xB0630, 0xB0635, 0xB063B, 0xB0642, 0xB0650],
  moinsBien: 0xB065B,     // « Could not load high quality 8 bit sounds. Trying lower quality... »
  aucun: 0xB06AC,         // « Could not load any digital samples »
  erreur: 0xB06D2,        // « Error : %s »
  cheminVide: 0xB06D1,    // le dossier des pilotes : une chaîne vide
  nomDeLaCarte: NOM_DE_LA_CARTE, capacites: CAPACITES, piloteDemande: PILOTE_DEMANDE,
};
// Faute de la banque de seize bits : le pilote de huit bits de la même carte.
const EN_HUIT_BITS = new Map([
  [0xE004, { pilote: 0xE003, cadence: 60 }],     // PAS16 -> PAS8
  [0xE017, { pilote: 0xE016, cadence: 120 }],    // SB16 -> sa voie de huit bits
  [0xE00D, { pilote: 0xE00B, cadence: 60 }],     // MICROSOFT16 -> MICROSOFT8
]);

// 0x6058B — ouvrir les bruitages : la carte nommée donne le pilote de SOS, la fréquence et la
// cadence du mélange ; la banque de bruitages 0 est chargée, en redescendant au besoin de seize
// bits à huit bits (même carte), puis à huit bits à 11 025 Hz, puis rien ; la carte est cherchée
// (sans l'option -o) ; enfin sosDIGIInitSystem, sosDIGIInitDriver, et la routine de remplissage
// inscrite à la minuterie de SOS. Chaque erreur éteint les bruitages pour la partie.
//
// Anomalies reproduites : seul le premier nom (SBLAST) est comparé sans égard à la casse
// (stricmp) ; les autres le sont par strcmp. GRAVIS et COMPATIBLE prennent le pilote de la Sound
// Blaster (0xE000). Une carte inconnue éteint les bruitages mais n'arrête rien : la banque est
// chargée quand même, avec un pilote et une fréquence jamais posés (ce qui traîne dans la pile),
// et SOS est ouvert. Si la banque de seize bits manque pour une carte qui n'a pas de voie de huit
// bits connue, la même banque est redemandée sans fin. Avec la détection, le pilote trouvé n'est
// pas rangé en 0xD7AD0.
// `L` : les liens (BRUITAGES_DU_JEU, ou ceux de l'introduction).
export function ouvrirLesBruitages(jeu, L = BRUITAGES_DU_JEU) {
  avecLeCadreDOrigine(jeu, 0x2C, (ebp) => {
    // [ebp-0xc] le pilote, [ebp-8] la fréquence : jamais posés pour une carte inconnue, ils valent
    // ce qu'a laissé la pile.
    let pilote = long(jeu, ebp - 0xC), frequence = long(jeu, ebp - 8);
    let carte = null;
    for (let k = 0; k < CARTES_NUMERIQUES.length; k++) {
      const comparer = k === 0 ? STRICMP : STRCMP;
      if (jeu.appeler(comparer, L.nomDeLaCarte, L.noms[k]) === 0) { carte = CARTES_NUMERIQUES[k]; break; }
    }
    if (carte) {
      pilote = carte.pilote;
      frequence = carte.frequence;
      poserMot(jeu, CADENCE_DU_MELANGE, carte.cadence);
      if (carte.qualite === 2) poserOctet(jeu, SEIZE_BITS, 1);
      poserOctet(jeu, QUALITE, carte.qualite);
    } else {
      poserOctet(jeu, BRUITAGES_PRETS, 0);
      poserOctet(jeu, BRUITAGES_VOULUS, 0);
    }

    // La banque de bruitages, dans la meilleure qualité disponible.
    for (;;) {
      if (jeu.appeler(CHARGER_LA_BANQUE_DE_BRUITAGES, 0) === 0) break;
      const qualite = octet(jeu, QUALITE);
      if (qualite === 2) {
        const repli = EN_HUIT_BITS.get(pilote & 0xFFFF);
        if (repli) {
          pilote = repli.pilote;
          frequence = 22050;
          poserMot(jeu, CADENCE_DU_MELANGE, repli.cadence);
          poserOctet(jeu, SEIZE_BITS, 0);
          poserOctet(jeu, QUALITE, 1);
        }
      } else if (qualite === 1) {
        jeu.appeler(MESSAGE, L.moinsBien);                  // « Could not load high quality 8 bit
        frequence = 11025;                                   //   sounds. Trying lower quality... »
        poserMot(jeu, CADENCE_DU_MELANGE, 60);
        poserOctet(jeu, QUALITE, 0);
      } else {
        poserOctet(jeu, BRUITAGES_PRETS, 0);
        poserOctet(jeu, BRUITAGES_VOULUS, 0);
        jeu.appeler(MESSAGE, L.aucun);                      // « Could not load any digital samples »
        return;
      }
    }

    const ds = jeu.T.R.ds & 0xFFFF;
    const echec = (erreur, avant) => {
      signalerErreurSos(jeu, L.erreur, erreur);              // « Error : %s »
      avant();
      poserOctet(jeu, BRUITAGES_PRETS, 0);
      poserOctet(jeu, BRUITAGES_VOULUS, 0);
      jeu.appeler(RENDRE_UNE_STRUCTURE, FIN_DES_BRUITAGES);
    };
    if (octet(jeu, DETECTER_LA_CARTE) !== 0) {
      // La carte cherchée par les pilotes de détection de HMIDET.386 : cinq essais au plus.
      let erreur = u16(jeu.appeler(DET_INIT_SYSTEM, L.cheminVide, ds));
      if (erreur !== 0) { echec(erreur, () => {}); return; }
      erreur = 1;
      for (let essai = 0; essai < 5 && erreur !== 0; essai++) {
        erreur = u16(jeu.appeler(DET_FIND_CARD, u16(pilote), L.capacites, ds, ebp - 0x18, jeu.T.R.ss & 0xFFFF));
      }
      if (erreur !== 0) { echec(erreur, () => jeu.appeler(DET_UNINIT_SYSTEM)); return; }
      erreur = u16(jeu.appeler(DET_GET_SETTINGS, MATERIEL_NUMERIQUE, ds));
      if (erreur !== 0) { echec(erreur, () => jeu.appeler(DET_UNINIT_SYSTEM)); return; }
      jeu.appeler(DET_UNINIT_SYSTEM);
    } else {
      poserLong(jeu, MATERIEL_NUMERIQUE, long(jeu, PORT_NUMERIQUE));
      poserLong(jeu, MATERIEL_NUMERIQUE + 4, long(jeu, IRQ_NUMERIQUE));
      poserLong(jeu, MATERIEL_NUMERIQUE + 8, long(jeu, DMA_NUMERIQUE));
      poserLong(jeu, L.piloteDemande, u16(pilote));
    }

    jeu.appeler(DIGI_INIT_SYSTEM, L.cheminVide, ds, 0);
    const minuteriePropre = () => octet(jeu, MINUTERIE_DE_SOS_OUVERTE) === 0;
    if (minuteriePropre()) jeu.appeler(TIMER_INIT_SYSTEM, 0xFF00, 0);
    poserLong(jeu, FREQUENCE_DU_MELANGE, u16(frequence));
    let erreur = u16(jeu.appeler(DIGI_INIT_DRIVER, long(jeu, L.piloteDemande), MATERIEL_NUMERIQUE, ds,
      INIT_NUMERIQUE, ds, PILOTE_NUMERIQUE, ds));
    if (erreur !== 0) {
      echec(erreur, () => {
        if (minuteriePropre()) jeu.appeler(TIMER_UNINIT_SYSTEM, 0);
        jeu.appeler(DIGI_UNINIT_SYSTEM);
      });
      return;
    }
    erreur = u16(jeu.appeler(TIMER_REGISTER_EVENT, mot(jeu, CADENCE_DU_MELANGE), long(jeu, REMPLISSAGE),
      mot(jeu, REMPLISSAGE + 4), EVENEMENT_DU_MELANGE, ds));
    if (erreur !== 0) {
      echec(erreur, () => {
        if (minuteriePropre()) jeu.appeler(TIMER_UNINIT_SYSTEM, 0);
        jeu.appeler(DIGI_UNINIT_DRIVER, long(jeu, PILOTE_NUMERIQUE), 1, 1);
        jeu.appeler(DIGI_UNINIT_SYSTEM);
      });
    }
  });
}

// ================================================================================================
// 2. Les morceaux de SOS
// ================================================================================================

// Le morceau `place` : ses données, et l'adresse de son en-tête.
const donneesDe = (jeu, place) => [long(jeu, DONNEES_DU_MORCEAU + 6 * place), mot(jeu, DONNEES_DU_MORCEAU + 6 * place + 4)];

// Les pistes d'un morceau qu'on vient de poser en `place` à partir de la structure d'initialisation
// `init` (pointeur lointain des données en +0, pointeur lointain de rappel en +8) : nombre de
// pistes, pointeur de rappel rangé dans l'en-tête, puis, piste par piste, son en-tête, sa position de
// lecture après le premier délai, et ce délai. Commun à 0x7F68F et 0x7FD96, qui l'appellent de leur
// cadre : `pile`, le pointeur de pile de l'original, et `retours`, les adresses de retour de ses
// appels (0x88D4B deux fois, 0x80034, 0x88D4B) ; ebx y vaut, comme dans l'original, le premier
// argument de 0x88D4B, ou le sélecteur pour 0x80034. Rend le dernier sélecteur chargé dans gs, et
// les dernières valeurs de ce que l'original tient en variables locales.
function poserLesPistes(jeu, place, init, pile, retours) {
  const appel = (retour, ebx, adresse, ...args) => {
    poserRegistres(jeu, { ebx });
    return jeu.appelerDepuis(retour, pile, adresse, ...args);
  };
  const normaliser = (retour, decalage, selecteur) => {
    const d = appel(retour, decalage, NORMALISER, decalage, selecteur) >>> 0;
    return [d, jeu.T.R.edx & 0xFFFF];
  };
  const [decalage, selecteur] = donneesDe(jeu, place);
  const entete = lointain(jeu, decalage, selecteur);
  poserLong(jeu, NOMBRE_DE_PISTES + 4 * place, long(jeu, entete + HMP_NOMBRE_DE_PISTES));
  poserLong(jeu, PISTES_DU_FICHIER + 4 * place, long(jeu, NOMBRE_DE_PISTES + 4 * place));
  poserMot(jeu, entete + HMP_RAPPEL + 4, mot(jeu, init + 0xC));
  poserLong(jeu, entete + HMP_RAPPEL, long(jeu, init + 8));
  const derniers = { gs: selecteur, position: 0, lus: null, selLecture: 0, lecture: 0 };
  let position = 0;
  const pistes = (decalage + HMP_PISTES) | 0;
  for (let p = 0; p >>> 0 < long(jeu, NOMBRE_DE_PISTES + 4 * place); p++) {
    poserLong(jeu, HORLOGE_DES_PISTES + (place << 7) + 4 * p, 0);
    const piste = place * 0xC0 + 6 * p;
    let [d, s] = normaliser(retours[0], (pistes + position) | 0, selecteur);
    poserMot(jeu, DEBUT_DES_PISTES + piste + 4, s);
    poserLong(jeu, DEBUT_DES_PISTES + piste, d);
    [d, s] = normaliser(retours[1], (position + 0xC + pistes) | 0, selecteur);
    poserMot(jeu, POSITION_DES_PISTES + piste + 4, s);
    poserLong(jeu, POSITION_DES_PISTES + piste, d);
    // Le premier délai de la piste, et la lecture qui passe derrière.
    const selLecture = mot(jeu, POSITION_DES_PISTES + piste + 4);
    const lus = appel(retours[2], selLecture, LIRE_UN_DELAI, long(jeu, POSITION_DES_PISTES + piste), selLecture,
      DELAI_DES_PISTES + (place << 7) + 4 * p, jeu.T.R.ds & 0xFFFF);
    const lecture = (long(jeu, POSITION_DES_PISTES + piste) + lus) | 0;
    poserMot(jeu, POSITION_DES_PISTES + piste + 4, selLecture);
    poserLong(jeu, POSITION_DES_PISTES + piste, lecture);
    // La piste suivante : 12 octets d'en-tête (numéro, longueur totale, 0) donnent sa place.
    [d, s] = normaliser(retours[3], (pistes + position) | 0, selecteur);
    position = (position + long(jeu, lointain(jeu, d + 4, s))) | 0;
    Object.assign(derniers, { gs: s, lus, selLecture, lecture });
  }
  derniers.position = position;
  return derniers;
}

// La carte des pistes : chaque piste à attribuer (0xFF) reçoit le premier pilote ouvert dont
// l'identifiant figure parmi les cinq de sa piste (en-tête +0x80, 0x14 octets par piste) ; 0xA000
// y désigne n'importe quel pilote FM, Roland ou General MIDI (0xA000, 0xA001, 0xA008). Une piste
// sans identifiant va au pilote 0 ; une piste qu'aucun pilote ouvert ne sait jouer est retirée :
// position nulle, 0xFF, une piste de moins. `chercher` faux (0x7FD96) : les pistes à attribuer
// sont retirées sans chercher. Rend le dernier sélecteur chargé dans gs, ou `gs` s'il n'y en a pas.
function attribuerLesPistes(jeu, place, chercher, gs) {
  const [decalage, selecteur] = donneesDe(jeu, place);
  for (let p = 0; p >>> 0 < long(jeu, PISTES_DU_FICHIER + 4 * place); p++) {
    const selCarte = mot(jeu, CARTE_DES_PISTES + 6 * place + 4);
    const carte = lointain(jeu, long(jeu, CARTE_DES_PISTES + 6 * place) + 4 * p, selCarte);
    gs = selCarte;
    if (long(jeu, carte) !== PISTE_LIBRE) continue;
    const retirer = () => {
      poserMot(jeu, POSITION_DES_PISTES + place * 0xC0 + 6 * p + 4, 0);
      poserLong(jeu, POSITION_DES_PISTES + place * 0xC0 + 6 * p, 0);
      if (chercher) poserLong(jeu, carte, PISTE_LIBRE);
      poserLong(jeu, NOMBRE_DE_PISTES + 4 * place, long(jeu, NOMBRE_DE_PISTES + 4 * place) - 1);
    };
    if (!chercher) { retirer(); continue; }
    const pilotesDeLaPiste = lointain(jeu, decalage + 0x14 * p + HMP_PILOTES_DE_PISTE, selecteur);
    let trouve = false;
    for (let j = 0; ; j++) {
      gs = selecteur;
      const voulu = long(jeu, pilotesDeLaPiste + 4 * j);
      if (voulu === 0 || trouve || j >= 5) break;
      for (let k = 0; k < 5; k++) {
        const ouvert = long(jeu, PILOTES_DE_MUSIQUE + 4 * k);
        const convient = voulu === 0xA000 ? (ouvert === 0xA000 || ouvert === 0xA001 || ouvert === 0xA008) : ouvert === voulu;
        if (convient) {
          gs = selCarte;
          poserLong(jeu, carte, k);
          trouve = true;
          break;
        }
      }
    }
    gs = selecteur;
    if (long(jeu, pilotesDeLaPiste) === 0) {
      gs = selCarte;
      poserLong(jeu, carte, 0);
    } else if (!trouve) {
      gs = selCarte;
      retirer();
    }
  }
  return gs;
}

// 0x7F68F — sosMIDIInitSong(&init, &carte des pistes, &morceau) : vérifie la signature HMIMIDIP,
// prend la première des huit places libres, y pose le morceau et ses pistes, attribue les pistes
// aux pilotes ouverts, et range la place dans `morceau`. Rend 0, 0xE (pas un fichier HMP) ou 0xB
// (plus de place).
function preparerUnMorceau(jeu, initDec, initSel, carteDec, carteSel, sortieDec, sortieSel) {
  return avecLeCadreDOrigine(jeu, 0x3C, (ebp) => {
    const init = lointain(jeu, initDec, initSel);
    const donneesDec = long(jeu, init), donneesSel = mot(jeu, init + 4);
    const donnees = lointain(jeu, donneesDec, donneesSel);
    let gs = jeu.T.R.gs;
    for (let k = 0; octet(jeu, SIGNATURE_HMP + k) !== 0; k++) {
      gs = donneesSel;
      if (octet(jeu, SIGNATURE_HMP + k) !== octet(jeu, donnees + k)) { laisserGs(jeu, gs); return 0xE; }
    }
    let place = 0;
    while (place < NOMBRE_DE_PLACES
      && (long(jeu, DONNEES_DU_MORCEAU + 6 * place) !== 0 || mot(jeu, DONNEES_DU_MORCEAU + 6 * place + 4) !== 0)) place++;
    if (place === NOMBRE_DE_PLACES) { laisserGs(jeu, gs); return 0xB; }

    const pile = (ebp - 0x3C) >>> 0;
    const d = jeu.appelerDepuis(0x7F748, pile, NORMALISER, donneesDec, donneesSel) >>> 0;
    const s = jeu.T.R.edx & 0xFFFF;
    poserMot(jeu, DONNEES_DU_MORCEAU + 6 * place + 4, s);
    poserLong(jeu, DONNEES_DU_MORCEAU + 6 * place, d);
    poserMot(jeu, CARTE_DES_PISTES + 6 * place + 4, carteSel);
    poserLong(jeu, CARTE_DES_PISTES + 6 * place, carteDec);
    gs = poserLesPistes(jeu, place, init, pile, [0x7F84E, 0x7F883, 0x7F8DE, 0x7F93E]).gs;
    gs = attribuerLesPistes(jeu, place, true, gs);
    poserLong(jeu, lointain(jeu, sortieDec, sortieSel), place);
    laisserGs(jeu, sortieSel);
    return 0;
  });
}

// 0x7FD96 — remettre le morceau `place` au début (sosMIDIResetSong, vraisemblablement) : ses
// données reprises de la structure d'initialisation `init`, ses pistes reposées ; celles que la
// carte laisse à attribuer (0xFF) sont retirées, sans chercher de pilote. Rend 0.
//
// Le séquenceur l'appelle sur la pile privée de SOS : le cadre de l'original y est reproduit,
// variables locales comprises.
function remettreUnMorceauAuDebut(jeu, place, initDec, initSel) {
  const cadre = new Cadre(jeu, 0x28);
  try {
    const ebp = cadre.ebp, pile = (ebp - 0x28) >>> 0;
    const init = lointain(jeu, initDec, initSel);
    const d = jeu.appelerDepuis(0x7FDBF, pile, NORMALISER, long(jeu, init), mot(jeu, init + 4)) >>> 0;
    const s = jeu.T.R.edx & 0xFFFF;
    poserMot(jeu, DONNEES_DU_MORCEAU + 6 * place + 4, s);
    poserLong(jeu, DONNEES_DU_MORCEAU + 6 * place, d);
    const derniers = poserLesPistes(jeu, place, init, pile, [0x7FEAE, 0x7FEE3, 0x7FF3E, 0x7FF9E]);
    const gs = attribuerLesPistes(jeu, place, false, derniers.gs);
    // Les variables locales de l'original, telles qu'il les laisse.
    poserLong(jeu, ebp - 4, long(jeu, PISTES_DU_FICHIER + 4 * place));   // la piste : au bout
    poserLong(jeu, ebp - 8, derniers.position);
    poserLong(jeu, ebp - 0xC, 0);                                        // le résultat
    poserMot(jeu, ebp - 0x14, s);
    poserLong(jeu, ebp - 0x18, (d + HMP_PISTES) | 0);
    poserMot(jeu, ebp - 0x24, s);
    if (derniers.lus !== null) {
      poserLong(jeu, ebp - 0x10, derniers.lus);
      poserMot(jeu, ebp - 0x1C, derniers.selLecture);
      poserLong(jeu, ebp - 0x20, derniers.lecture);
    }
    laisserGs(jeu, gs);
    return 0;
  } finally {
    cadre.fermer();
  }
}

// 0x7FC05 — sosMIDIStartSong(place) : le séquenceur (0x88D91) inscrit à la minuterie de SOS, à la
// cadence de l'en-tête du morceau (+0x38) ; la poignée est rangée, le morceau marqué joué. Rend
// l'erreur de la minuterie, ou 0.
function demarrerUnMorceau(jeu, place) {
  return avecLeCadreDOrigine(jeu, 8, () => {
    const [decalage, selecteur] = donneesDe(jeu, place);
    const R = jeu.T.R;
    laisserGs(jeu, selecteur);
    const erreur = jeu.appeler(TIMER_REGISTER_EVENT, long(jeu, lointain(jeu, decalage, selecteur) + HMP_CADENCE),
      SEQUENCEUR, R.cs & 0xFFFF, EVENEMENT_DU_MORCEAU + 4 * place, R.ds & 0xFFFF);
    if (erreur !== 0) return erreur;
    poserOctet(jeu, MORCEAU_DE_L_EVENEMENT + long(jeu, EVENEMENT_DU_MORCEAU + 4 * place), place);
    poserLong(jeu, MORCEAU_JOUE + 4 * place, 1);
    return 0;
  });
}

// 0x7FC8D — sosMIDIStopSong(place) : l'événement retiré de la minuterie ; si le morceau jouait, ses
// notes tues (0x86E23), sa place vidée, puis le morceau remis au début (0x7FD96) à partir d'une
// structure d'initialisation refaite dans la pile. Rend 0, ou 0xA pour une place hors des huit.
//
// Anomalie reproduite : sans événement (poignée -1), la marque de l'événement est quand même
// effacée, à l'index -1, soit l'octet 0xC34DC.
function arreterUnMorceau(jeu, place) {
  return avecLeCadreDOrigine(jeu, 0x14, (ebp) => {
    if (place >>> 0 >= NOMBRE_DE_PLACES) return 0xA;
    const evenement = EVENEMENT_DU_MORCEAU + 4 * place;
    if (longSigne(jeu, evenement) !== -1) jeu.appeler(TIMER_REMOVE_EVENT, long(jeu, evenement));
    poserOctet(jeu, MORCEAU_DE_L_EVENEMENT + long(jeu, evenement), 0xFF);
    poserLong(jeu, evenement, 0xFFFFFFFF);
    if (long(jeu, MORCEAU_JOUE + 4 * place) === 0) return 0;
    // La structure d'initialisation, [ebp-0x14] : les données (+0 décalage, +4 sélecteur), le
    // pointeur de rappel de l'en-tête (+8, +0xC).
    const [decalage, selecteur] = donneesDe(jeu, place);
    const init = ebp - 0x14;
    poserMot(jeu, init + 4, selecteur);
    poserLong(jeu, init, decalage);
    const entete = lointain(jeu, decalage, selecteur);
    poserMot(jeu, init + 0xC, mot(jeu, entete + HMP_RAPPEL + 4));
    poserLong(jeu, init + 8, long(jeu, entete + HMP_RAPPEL));
    laisserGs(jeu, selecteur);
    jeu.appeler(TAIRE_LE_MORCEAU, place);
    poserLong(jeu, MORCEAU_JOUE + 4 * place, 0);
    poserMot(jeu, DONNEES_DU_MORCEAU + 6 * place + 4, 0);
    poserLong(jeu, DONNEES_DU_MORCEAU + 6 * place, 0);
    jeu.appeler(REMETTRE_AU_DEBUT, place, init, jeu.T.R.ss & 0xFFFF);
    return 0;
  });
}
const REMETTRE_AU_DEBUT = 0x7FD96;

// 0x7FBC2 — sosMIDIUnInitSong(place) : la place vidée. Rend 0, ou 0xA hors des huit places.
function oublierUnMorceau(jeu, place) {
  if (place >>> 0 >= NOMBRE_DE_PLACES) return 0xA;
  poserMot(jeu, DONNEES_DU_MORCEAU + 6 * place + 4, 0);
  poserLong(jeu, DONNEES_DU_MORCEAU + 6 * place, 0);
  return 0;
}

// 0x80034 — lire un délai d'une piste HMP : sept bits par octet, poids faibles d'abord, le dernier
// octet portant le bit 7 (§ 9.5). La valeur va dans *destination ; rend le nombre d'octets lus.
// Comme l'original, le pointeur de lecture avance dans l'argument même, sur la pile de l'appelant.
// Le séquenceur l'appelle sur la pile privée de SOS : le cadre de l'original y est reproduit.
const LIRE_UN_DELAI = 0x80034;
function lireUnDelai(jeu, decalage, selecteur, destination, selDestination) {
  const argument = ((jeu.T.R.esp >>> 0) + 4) >>> 0;
  const cadre = new Cadre(jeu, 0x18);
  const ebp = cadre.ebp;
  let valeur = 0, decalageDuBit = 0, lus = 0, dernier = false, o = 0;
  do {
    lus++;
    o = octet(jeu, lointain(jeu, decalage, selecteur));
    decalage = (decalage + 1) | 0;
    if (o & 0x80) dernier = true;
    valeur |= (o & 0x7F) << (decalageDuBit & 31);
    decalageDuBit += 7;
  } while (!dernier);
  poserLong(jeu, argument, decalage);
  poserLong(jeu, lointain(jeu, destination, selDestination), valeur);
  // Les variables locales de l'original : l'octet lu, la fin, le décalage du bit, la valeur, le
  // compte (deux fois : la seconde pour le rendre).
  poserOctet(jeu, ebp - 4, o & 0x7F);
  poserLong(jeu, ebp - 8, 1);
  poserLong(jeu, ebp - 0xC, decalageDuBit);
  poserLong(jeu, ebp - 0x10, valeur);
  poserLong(jeu, ebp - 0x14, lus);
  poserLong(jeu, ebp - 0x18, lus);
  cadre.fermer();
  laisserGs(jeu, selDestination);
  return lus;
}

// 0x815E1 — _fstrcpy(destination, source), deux pointeurs lointains : copie mot par mot jusqu'au
// zéro compris. Rend le décalage de la destination ; laisse, comme l'original, les sélecteurs dans
// les mots bas d'edx (destination) et d'ecx (source).
function copierUneChaineLointaine(jeu, destination, selDestination, source, selSource) {
  const d = lointain(jeu, destination, selDestination), s = lointain(jeu, source, selSource);
  for (let k = 0; ; k += 2) {
    const deux = mot(jeu, s + k);
    if ((deux & 0xFF) === 0) { poserOctet(jeu, d + k, 0); break; }
    poserMot(jeu, d + k, deux);
    if ((deux & 0xFF00) === 0) break;
  }
  const R = jeu.T.R;
  poserRegistres(jeu, { edx: (R.edx & ~0xFFFF) | u16(selDestination), ecx: (R.ecx & ~0xFFFF) | u16(selSource) });
  return destination;
}

// ================================================================================================
// 3. Le volume de la musique
// ================================================================================================

// 0x800AB — le volume général de la musique : pour chaque pilote ouvert (jusqu'au premier
// identifiant nul de 0xBEFCE), chaque canal en service reçoit « contrôleur 7 » (volume), son volume
// propre mis à l'échelle du volume général ; le message est remis à la fonction 2 du pilote (table
// 0xBFE7A, par un appel lointain). Rend 0.
//
// Anomalies reproduites : le canal des percussions (9) reçoit le message même hors service ; le
// produit des deux volumes, divisé par 128, est tronqué à un octet (sans effet tant qu'ils restent
// dans 0..127).
function poserLeVolumeDeLaMusique(jeu, volume) {
  return avecLeCadreDOrigine(jeu, 0x14, () => {
    poserOctet(jeu, VOLUME_GENERAL, volume);
    for (let pilote = 0; long(jeu, PILOTES_DE_MUSIQUE + 4 * pilote) !== 0; pilote++) {
      for (let canal = 0; canal < 16; canal++) {
        const k = pilote * 16 + canal;
        if (octet(jeu, CANAL_EN_SERVICE + k) === 0 && canal !== CANAL_DES_PERCUSSIONS) continue;
        const valeur = (octet(jeu, VOLUME_DU_CANAL + k) * octet(jeu, VOLUME_GENERAL)) >>> 7;
        poserOctet(jeu, MESSAGE_MIDI, 0xB0 | canal);        // contrôleur, sur ce canal
        poserOctet(jeu, MESSAGE_MIDI + 1, 7);                // volume
        poserOctet(jeu, MESSAGE_MIDI + 2, valeur);
        poserRegistres(jeu, { ebx: 0x24 * pilote });           // l'entrée du pilote dans la table
        appelLointain(jeu, TABLE_DES_PILOTES + 0x24 * pilote, 0x80164,
          MESSAGE_MIDI, jeu.T.R.ds & 0xFFFF, 3, pilote);
      }
    }
    return 0;
  });
}

// 0x11AD3 — le même, depuis le clavier du parc (0x13BF3) : l'octet bas de l'argument.
function volumeDeLaMusique(jeu, volume) {
  return avecLeCadreDOrigine(jeu, 0, () => jeu.appeler(POSER_LE_VOLUME, volume & 0xFF));
}
const POSER_LE_VOLUME = 0x800AB;

// 0x801A0 — relancer la musique quand le morceau est fini : appelée par la boucle du parc
// (0x11C45, amorcage.js) à chaque tour où un morceau de 1 à 0x11 est en cours. Si la musique est
// prête et voulue, qu'un morceau est en cours ([0xBA71A]) et que SOS le dit fini (0x82174), il est
// remis au début (0x7FD96, avec la structure d'initialisation 0xDED08) et relancé (0x7FC05). La
// musique du parc joue ainsi en boucle. Exercée par films (2 819 appels).
const MORCEAU_EN_COURS = 0xBA71A;           // mot : 0, aucun
const INIT_DU_MORCEAU = 0xDED08;            // la structure d'initialisation des morceaux (non établie)
function relancerLaMusique(jeu) {
  avecLeCadreDOrigine(jeu, 0, (ebp) => {
    if (octet(jeu, MUSIQUE_PRETE) === 0 || octet(jeu, MUSIQUE_VOULUE) === 0 || mot(jeu, MORCEAU_EN_COURS) === 0) return;
    if (jeu.appelerDepuis(0x801D7, ebp, MORCEAU_FINI, long(jeu, MORCEAU_SOS)) === 0) return;
    jeu.appelerDepuis(0x801F9, ebp, REMETTRE_AU_DEBUT, long(jeu, MORCEAU_SOS), INIT_DU_MORCEAU, jeu.T.R.ds & 0xFFFF);
    jeu.appelerDepuis(0x80207, ebp, DEMARRER_UN_MORCEAU, long(jeu, MORCEAU_SOS));
  });
}
const DEMARRER_UN_MORCEAU = 0x7FC05;

// 0x87202 — remettre un message MIDI au pilote de musique (pilote, message lointain, longueur) : la
// fonction 0 de sa table (0xBFE7A, 0x24 octets par pilote), par un appel lointain, avec le message,
// sa longueur et le pilote. Rend 0. Appelée par le désaccord de la musique des attractions usées
// (0x66BA0 et 0x66D18, monorail.js et dessin-attractions.js), hors de toute interruption ; exercée
// par films (3 appels). L'original charge eax de pilote × 0x24 et edx du sélecteur au moment de
// l'appel.
function envoyerAuPilote(jeu, pilote, decalage, selecteur, longueur) {
  return avecLeCadreDOrigine(jeu, 4, (ebp) => {
    poserRegistres(jeu, { eax: Math.imul(pilote, 0x24), edx: selecteur & 0xFFFF });
    appelLointain(jeu, (TABLE_DES_PILOTES + Math.imul(pilote, 0x24)) >>> 0, 0x87226,
      decalage, selecteur & 0xFFFF, longueur, pilote);
    poserLong(jeu, ebp - 4, 0);
    return 0;
  });
}

// ================================================================================================
// 4. Deux événements de la minuterie de SOS
// ================================================================================================

// 0x5CA6B — un tic de la minuterie du jeu, quand la minuterie de SOS la tient (la carte son
// ouverte) : le compte que tient d'ordinaire le gestionnaire 0x5CA82.
function unTicDuJeu(jeu) {
  const cadre = new Cadre(jeu, 0);        // les registres sauvés, sur la pile privée de SOS
  poserLong(jeu, TICS_DU_JEU, long(jeu, TICS_DU_JEU) + 1);
  cadre.fermer();
}

// 0x803E0 — la montée du volume des ambiances (inscrite par 0x805A4), 20 fois par seconde : chaque
// numéro d'échantillon dont la montée est inscrite gagne 0x200, borné à 0x7FFF, jusqu'à atteindre
// le volume visé (octet haut de 0xDECA8, moins un) ; une montée arrivée, ou dont l'échantillon est
// fini, est retirée de la minuterie. Bruitages coupés : toutes les montées sont retirées.
//
// Anomalie reproduite : dès qu'une montée arrive à son terme, la routine s'arrête là, et les numéros
// suivants attendent le prochain appel.
function monterLesAmbiances(jeu) {
  // Sur la pile privée de SOS : le cadre de l'original, sa variable [ebp-4] (le numéro en cours) et
  // les adresses de retour de ses appels.
  const cadre = new Cadre(jeu, 4);
  const ebp = cadre.ebp, pile = (ebp - 4) >>> 0;
  const numero = (i) => poserLong(jeu, ebp - 4, i);
  const retirer = (retour, i) => {
    jeu.appelerDepuis(retour, pile, TIMER_REMOVE_EVENT, long(jeu, EVENEMENT_DE_MONTEE + 4 * i));
    poserOctet(jeu, MONTEE_EN_COURS + i, 0);
  };
  try {
    if (octet(jeu, BRUITAGES_PRETS) === 0 || octet(jeu, BRUITAGES_VOULUS) === 0) {
      for (let i = 0; i < 0x20; i++) {
        numero(i);
        if (octet(jeu, MONTEE_EN_COURS + i) !== 0) retirer(0x80550, i);
      }
      numero(0x20);
      return;
    }
    for (let i = 0; i < 0x20; i++) {
      numero(i);
      if (octet(jeu, MONTEE_EN_COURS + i) === 0) continue;
      if (jeu.appelerDepuis(0x8043F, pile, DIGI_SAMPLE_DONE, long(jeu, PILOTE_NUMERIQUE), i) !== 0) {
        retirer(0x80504, i);
        continue;
      }
      const vise = ((mot(jeu, VOLUME_VISE + 2 * i) << 8) - 1) | 0;
      if (mot(jeu, VOLUMES + 2 * i) >= vise) { retirer(0x8048A, i); return; }
      poserOctet(jeu, VOLUMES + 2 * i + 1, octet(jeu, VOLUMES + 2 * i + 1) + 2);
      if (mot(jeu, VOLUMES + 2 * i) >= 0x7FFF) poserMot(jeu, VOLUMES + 2 * i, 0x7FFF);
      jeu.appelerDepuis(0x804ED, pile, DIGI_SET_SAMPLE_VOLUME, long(jeu, PILOTE_NUMERIQUE), i, mot(jeu, VOLUMES + 2 * i));
    }
    numero(0x20);
  } finally {
    cadre.fermer();
  }
}

// ================================================================================================
// 5. Le film d'une attraction
// ================================================================================================
//
// Un film FLC : un en-tête (0xAF12 : nombre d'images, largeur, hauteur), puis une suite d'images
// (0xF1FA), chacune faite de morceaux : palette (4), deltas par mots (7) ou par octets (0xC),
// image pleine compressée (0xF), copie brute (0x10) ; les autres sont sautés. Chaque bloc commence
// par sa taille (4 octets, en-tête compris) et son genre (2 octets). Le décodage se fait dans
// l'image en construction (0xDE5BC), en 320x200 ; la palette dans 0xD35BC, posée avant l'image.
//
// Le script sonore : des lignes de 7 octets (image, commande, argument, deux octets inutilisés),
// terminées par l'image 0xFFFF. À chaque image, les lignes de ce numéro sont exécutées (0x5FC16).

// Lire `n` octets du film en `destination`.
const lireLeFilm = (jeu, destination, n) => jeu.appeler(LIRE_LE_FILM, long(jeu, FICHIER_DU_FILM), destination, n);
const resteDuBloc = (jeu) => (long(jeu, TAILLE_DU_BLOC) - TAILLE_D_EN_TETE_DE_BLOC) | 0;

// 0x5FC16 — exécuter les lignes du script sonore dont le numéro est celui de l'image en cours.
// Auparavant, si le film le demande (0xBA0FD), la musique de l'attraction est relancée quand elle
// est finie. Commandes, en majuscule ou en minuscule :
//   A  délai entre les images (centièmes)       B  charger la banque de musique
//   E  charger la banque de bruitages (octet)   L  lire le film d'avance, puis M
//   M  lancer un morceau                        R  jouer un bruitage sans fin (0x81AD0)
//   S  jouer un bruitage ; 0 : tout arrêter     T  arrêter un bruitage ; 0 : tout arrêter
//   X  arrêter la musique
function suivreLeScriptSonore(jeu, script) {
  avecLeCadreDOrigine(jeu, 8, () => {
    if (octet(jeu, MUSIQUE_DU_FILM_EN_BOUCLE) !== 0 && octet(jeu, MUSIQUE_VOULUE) !== 0
      && jeu.appeler(MORCEAU_FINI, long(jeu, MORCEAU_SOS)) !== 0) {
      jeu.appeler(ARRETER_LA_MUSIQUE);
      jeu.appeler(LANCER_UN_MORCEAU, octet(jeu, MUSIQUE_DU_FILM));
    }
    for (;;) {
      const ligne = (script + s16(mot(jeu, LIGNE_DU_SCRIPT)) * 7) | 0;
      if (mot(jeu, ligne) !== mot(jeu, IMAGE_DU_FILM)) return;
      const argument = mot(jeu, ligne + 3);
      const bruitages = octet(jeu, BRUITAGES_PRETS) !== 0;
      const c = octet(jeu, ligne + 2);
      const lettre = c >= 0x61 && c <= 0x7A ? c - 0x20 : c;      // minuscule ou majuscule
      switch (String.fromCharCode(lettre)) {
        case 'A': poserLong(jeu, DELAI_ENTRE_IMAGES, s16(argument)); break;
        case 'B': jeu.appeler(CHARGER_LA_BANQUE_DE_MUSIQUE, argument); break;
        case 'E': jeu.appeler(CHARGER_LA_BANQUE_DE_BRUITAGES, argument & 0xFF); break;
        case 'L':
          if (long(jeu, TAMPON_DU_FILM_EN_MEMOIRE) !== 0) {
            jeu.appeler(LIRE_LE_FILM_D_AVANCE, long(jeu, FICHIER_DU_FILM), long(jeu, TAMPON_DU_FILM_EN_MEMOIRE), s16(argument));
          }
          jeu.appeler(LANCER_UN_MORCEAU, s16(argument));
          break;
        case 'M': jeu.appeler(LANCER_UN_MORCEAU, s16(argument)); break;
        case 'R': if (bruitages) jeu.appeler(JOUER_EN_BOUCLE, 0, s16(argument), -1); break;
        case 'S':
          if (bruitages) {
            if (argument !== 0) jeu.appeler(JOUER_UN_BRUITAGE, 0, s16(argument));
            else jeu.appeler(ARRETER_TOUS_LES_BRUITAGES);
          }
          break;
        case 'T':
          if (bruitages) {
            if (argument !== 0) jeu.appeler(ARRETER_UN_BRUITAGE, 0, s16(argument));
            else jeu.appeler(ARRETER_TOUS_LES_BRUITAGES);
          }
          break;
        case 'X': jeu.appeler(ARRETER_LA_MUSIQUE); break;
        default: break;
      }
      poserMot(jeu, LIGNE_DU_SCRIPT, mot(jeu, LIGNE_DU_SCRIPT) + 1);
    }
  });
}

// L'heure du DOS (int 21h, 2Ch), en centièmes dans la minute : secondes x 100 + centièmes. Les
// registres sont ceux de l'original : ax, cx, dx écrasés (dx rend l'heure).
function centiemes(jeu) {
  const R = jeu.T.R;
  poserRegistres(jeu, { eax: (R.eax & ~0xFF00) | 0x2C00 });
  interruption(jeu, 0x21);
  const secondes = (R.edx >>> 8) & 0xFF;
  const ax = (100 * secondes) & 0xFFFF;
  const dx = ((R.edx & 0xFF) + ax) & 0xFFFF;
  poserRegistres(jeu, { eax: (R.eax & ~0xFFFF) | ax, edx: (R.edx & ~0xFFFF) | dx });
  return dx;
}

// 0x60C44 — jouer le film nommé en 0xBA7EC, avec son script sonore. `interruptible` : un clic ou
// une touche arrête le film à l'image suivante ; `palette` : 1, les palettes du film sont posées.
// Image par image : le script sonore, le décodage, la palette, la présentation (en 640x480,
// l'image est d'abord agrandie), puis l'attente du délai. Le film est rejoué tant que
// 0xBA7DE, qui vaut 1, n'est pas épuisé : il n'est donc joué qu'une fois. Tous les registres
// sont rendus.
function jouerUnFilm(jeu, interruptible, palette, script) {
  const R = jeu.T.R;
  const entree = { eax: R.eax, ebx: R.ebx, ecx: R.ecx, edx: R.edx, esi: R.esi, edi: R.edi };
  avecEbp(jeu, 24, () => {
    poserMot(jeu, REPETITIONS, 1);
    poserMot(jeu, LIGNE_DU_SCRIPT, 0);
    poserLong(jeu, PALETTE_A_POSER, palette);
    for (;;) {
      const fichier = jeu.appeler(SOPEN, NOM_DU_FILM, 0x200, 0x40) | 0;   // O_BINARY, SH_DENYNO
      if (fichier <= 0) return;
      poserLong(jeu, FICHIER_DU_FILM, fichier);
      poserMot(jeu, IMAGE_DU_FILM, 0);
      poserMot(jeu, IMAGE_BA7DA, 0);
      jeu.appeler(SUIVRE_LE_SCRIPT, script);
      poserMot(jeu, HEURE_DE_L_IMAGE, centiemes(jeu));
      for (;;) {
        lireLeFilm(jeu, TAILLE_DU_BLOC, 4);
        lireLeFilm(jeu, GENRE_DU_BLOC, 2);
        const genre = mot(jeu, GENRE_DU_BLOC);
        if (genre === FLC_EN_TETE) { jeu.appeler(LIRE_L_EN_TETE); continue; }
        if (genre !== FLC_IMAGE) break;
        poserMot(jeu, IMAGES_RESTANTES, mot(jeu, IMAGES_RESTANTES) - 1);
        poserMot(jeu, IMAGE_DU_FILM, mot(jeu, IMAGE_DU_FILM) + 1);
        jeu.appeler(SUIVRE_LE_SCRIPT, script);
        jeu.appeler(DECODER_UNE_IMAGE);
        if (long(jeu, DELAI_ENTRE_IMAGES) !== 0) {
          if (mot(jeu, PALETTE_CHANGEE) === 1) jeu.appeler(POSER_LA_PALETTE_DU_FILM);
          presenterLImageDuFilm(jeu);
        }
        jeu.appeler(ATTENDRE_L_IMAGE_SUIVANTE);
        if (mot(jeu, IMAGES_RESTANTES) === 0) break;
        if (interruptible !== 0 && (mot(jeu, APPUI_GAUCHE) !== 0 || octet(jeu, TOUCHE) !== 0)) poserMot(jeu, REPETITIONS, 0);
        if (mot(jeu, REPETITIONS) === 0) break;
      }
      jeu.appeler(CLOSE, long(jeu, FICHIER_DU_FILM));
      // Une attente active de 500 tours sur 0xBA7DE, que rien ne peut changer pendant ce temps :
      // elle ne compte que pour la durée. Puis une passe de moins.
      if (mot(jeu, REPETITIONS) === 0) return;
      poserMot(jeu, REPETITIONS, mot(jeu, REPETITIONS) - 1);
      if (mot(jeu, REPETITIONS) === 0) return;
    }
  });
  poserRegistres(jeu, entree);
}
const SUIVRE_LE_SCRIPT = 0x5FC16, DECODER_UNE_IMAGE = 0x60E30, LIRE_L_EN_TETE = 0x60EF3;
const POSER_LA_PALETTE_DU_FILM = 0x60FB9, ATTENDRE_L_IMAGE_SUIVANTE = 0x6123D;

// La présentation d'une image du film : en 320x200, copiée telle quelle dans la fenêtre vidéo ; en
// 640x480, agrandie dans le tampon du film, présentée à la place de l'image en construction.
function presenterLImageDuFilm(jeu) {
  const surface = long(jeu, SURFACE);
  if (mot(jeu, MODE_AFFICHAGE) & 1) {
    const m8 = jeu.m8;
    if (FENETRE_VIDEO >= surface + OCTETS_D_UNE_IMAGE || surface >= FENETRE_VIDEO + OCTETS_D_UNE_IMAGE) {
      m8.copyWithin(FENETRE_VIDEO, surface, surface + OCTETS_D_UNE_IMAGE);
    } else {
      for (let k = 0; k < OCTETS_D_UNE_IMAGE; k += 4) jeu.dv.setUint32(FENETRE_VIDEO + k, jeu.dv.getUint32(surface + k, true), true);
    }
    return;
  }
  // L'original a empilé ecx, edi, esi et eax : ses appels partent 16 octets plus bas, avec esi et
  // edi sur les deux images ; il les rend ensuite.
  const R = jeu.T.R;
  const empiles = { ecx: R.ecx, edi: R.edi, esi: R.esi, eax: R.eax };
  avecCadre(jeu, 16, 0, () => {
    poserRegistres(jeu, { esi: surface, edi: long(jeu, TAMPON_DU_FILM) });
    jeu.appeler(AGRANDIR_L_IMAGE, surface, long(jeu, TAMPON_DU_FILM), 0x190);
    const image = long(jeu, SURFACE);
    poserRegistres(jeu, { eax: long(jeu, TAMPON_DU_FILM), edi: image });
    poserLong(jeu, SURFACE, long(jeu, TAMPON_DU_FILM));
    jeu.appeler(PRESENTER_L_IMAGE_HAUTE, 0x190);
    poserLong(jeu, SURFACE, image);
  });
  poserRegistres(jeu, empiles);
}

// 0x60E30 — décoder une image du film : le nombre de ses morceaux, le reste de son en-tête, puis
// chaque morceau selon son genre. Registres : ceux que laissent les décodeurs.
function decoderUneImage(jeu, R) {
  lireLeFilm(jeu, MORCEAUX_DE_L_IMAGE, 2);
  lireLeFilm(jeu, long(jeu, TAMPON_DU_FILM), 8);
  while (mot(jeu, MORCEAUX_DE_L_IMAGE) !== 0) {
    poserMot(jeu, MORCEAUX_DE_L_IMAGE, mot(jeu, MORCEAUX_DE_L_IMAGE) - 1);
    lireLeFilm(jeu, TAILLE_DU_BLOC, 4);
    lireLeFilm(jeu, GENRE_DU_BLOC, 2);
    switch (mot(jeu, GENRE_DU_BLOC)) {
      case FLC_DELTA_MOTS: jeu.appeler(0x61033); break;
      case FLC_DELTA_OCTETS: jeu.appeler(0x6110A); break;
      case FLC_PALETTE: jeu.appeler(0x60F92); break;
      case FLC_PLEIN: jeu.appeler(0x611B1); break;
      case FLC_COPIE: jeu.appeler(LIRE_UN_BLOC_DE_COPIE); break;
      default: jeu.appeler(SAUTER_UN_BLOC); break;
    }
  }
  poserRegistres(jeu, { eax: R.eax & ~0xFFFF });            // ax : le compte, épuisé
}

// 0x60EF3 — l'en-tête du film : nombre d'images, largeur, hauteur. edi reste derrière la largeur.
function lireLEnTete(jeu, R) {
  lireLeFilm(jeu, long(jeu, TAMPON_DU_FILM), resteDuBloc(jeu));
  const tampon = long(jeu, TAMPON_DU_FILM);
  poserMot(jeu, IMAGES_RESTANTES, mot(jeu, tampon));
  poserMot(jeu, LARGEUR_DU_FILM, mot(jeu, tampon + 2));
  poserMot(jeu, HAUTEUR_DU_FILM, mot(jeu, tampon + 4));
  poserRegistres(jeu, { edi: (tampon + 4) | 0, eax: (R.eax & ~0xFFFF) | mot(jeu, tampon + 4) });
}

// 0x60F56 — un bloc de copie (FLI_COPY) : l'image entière, sans compression, lue droit dans l'image
// en construction. Exercé par films (106 appels).
function lireUnBlocDeCopie(jeu) {
  lireLeFilm(jeu, long(jeu, SURFACE), resteDuBloc(jeu));
}

// 0x60F74 — un bloc d'un autre genre (ni delta, ni palette, ni image pleine, ni copie) : lu dans le
// tampon du film, et laissé là. Aucun film du CD n'en contient (films.json ne l'atteint pas).
function passerUnBloc(jeu) {
  lireLeFilm(jeu, long(jeu, TAMPON_DU_FILM), resteDuBloc(jeu));
}

// 0x60F92 — un morceau de palette : lu, à poser avant la présentation.
function lireUnePalette(jeu) {
  lireLeFilm(jeu, long(jeu, TAMPON_DE_PALETTE), resteDuBloc(jeu));
  poserMot(jeu, PALETTE_CHANGEE, 1);
}

// 0x60FB9 — poser la palette lue, si le film le demande : des paquets (couleurs sautées, nombre de
// couleurs — 0 pour 256 —, puis trois octets par couleur) reportés sur la palette du film, qu'on
// pose au balayage suivant.
function poserLaPaletteDuFilm(jeu, R) {
  const esi = R.esi;
  poserMot(jeu, PALETTE_CHANGEE, 0);
  if (long(jeu, PALETTE_A_POSER) !== 1) return;
  const m8 = jeu.m8;
  let source = long(jeu, TAMPON_DE_PALETTE);
  let paquets = mot(jeu, source);
  source += 2;
  let couleur = long(jeu, PALETTE_DU_FILM);
  let saut = 0, n = 0;
  do {
    saut = m8[source++];
    couleur += 3 * saut;
    n = m8[source++];
    do {
      m8[couleur++] = m8[source++];
      m8[couleur++] = m8[source++];
      m8[couleur++] = m8[source++];
      n = (n - 1) & 0xFF;
    } while (n !== 0);
    paquets = (paquets - 1) & 0xFFFF;
  } while (paquets !== 0);
  const palette = long(jeu, PALETTE_DU_FILM);
  poserRegistres(jeu, {
    eax: (R.eax & ~0xFFFF) | paquets, ebx: R.ebx & ~0xFFFF, ecx: 0x300,
    edx: R.edx & ~0xFF, esi: palette, edi: palette,
  });
  avecCadre(jeu, 4, 0, () => {           // sous esi, empilé
    jeu.appeler(ATTENDRE_LE_BALAYAGE);
    jeu.appeler(POSER_LA_PALETTE, palette);
  });
  poserRegistres(jeu, { esi });
}

// 0x61033 — deltas par mots (FLC, genre 7) : un nombre de lignes, puis pour chaque ligne des mots
// de commande — 11xxxxxx xxxxxxxx : sauter −n lignes ; 10xxxxxx : dernier pixel de la ligne ;
// sinon le nombre de paquets —, chaque paquet étant un saut (octet) et un compte (octet signé :
// positif, autant de mots copiés ; négatif, un mot répété). Registres : esi derrière la dernière
// ligne, edi derrière les données, ebx et edx ceux des derniers paquets.
//
// Anomalie reproduite : après un « dernier pixel », le format veut un nouveau mot, le nombre de
// paquets ; la routine prend pour ce nombre le mot de commande lui-même (0x80xx), et décode la
// suite de travers. Un compte de lignes nul en vaut 65 536.
function decoderLesDeltasParMots(jeu) {
  const largeur = mot(jeu, LARGEUR_DU_FILM);
  const lu = avecEbp(jeu, 0x10, () => lireLeFilm(jeu, long(jeu, TAMPON_DU_FILM), resteDuBloc(jeu)));
  const R = jeu.T.R;
  let eax = lu, ebx = R.ebx, edx = R.edx;
  let source = long(jeu, TAMPON_DU_FILM), cible = long(jeu, SURFACE);
  let lignes = mot(jeu, source);
  eax = (eax & ~0xFFFF) | lignes;
  source += 2;
  for (;;) {
    const commande = mot(jeu, source);
    source += 2;
    eax = (eax & ~0xFFFF) | commande;
    const debutDeLigne = cible;
    if (commande & 0x8000) {
      if (commande & 0x4000) {
        const saut = -s16(commande);
        eax = produitBas(saut, largeur);
        edx = produitHaut(saut, largeur);
        cible = (cible + eax) | 0;
        continue;
      }
      poserOctet(jeu, cible + largeur - 1, commande);
    }
    let paquets = eax & 0xFFFF;
    while (paquets !== 0) {
      ebx = octet(jeu, source++);
      cible = (cible + ebx) | 0;
      let compte = octet(jeu, source++);
      edx = (edx & ~0xFF) | compte;
      if (s8(compte) > 0) {
        do {
          ebx = mot(jeu, source); source += 2;
          poserMot(jeu, cible, ebx); cible += 2;
          compte = (compte - 1) & 0xFF;
        } while (compte !== 0);
      } else {
        ebx = mot(jeu, source); source += 2;
        do {
          poserMot(jeu, cible, ebx); cible += 2;
          compte = (compte + 1) & 0xFF;
        } while (compte !== 0);
      }
      edx &= ~0xFF;
      paquets = (paquets - 1) & 0xFFFF;
    }
    cible = (debutDeLigne + largeur) | 0;
    lignes = (lignes - 1) & 0xFFFF;
    if (lignes === 0) break;
  }
  poserRegistres(jeu, { eax, ebx, edx, esi: cible, edi: source });
}

// 0x6110A — deltas par octets (FLI, genre 0xC) : lignes sautées, nombre de lignes, puis pour chaque
// ligne un nombre de paquets, chacun un saut (octet) et un compte (octet signé : positif, autant
// d'octets copiés ; négatif, un octet répété). Registres : esi derrière les données, edi derrière le
// dernier paquet, eax la largeur ; ecx rendu. Un compte de lignes nul en vaut 65 536.
function decoderLesDeltasParOctets(jeu, R) {
  const ecx = R.ecx;
  const largeur = mot(jeu, LARGEUR_DU_FILM);
  const lu = avecEbp(jeu, 0x14, () => lireLeFilm(jeu, long(jeu, TAMPON_DU_FILM), resteDuBloc(jeu)));
  const m8 = jeu.m8;
  let source = long(jeu, TAMPON_DU_FILM);
  const sautees = (lu & ~0xFFFF) | mot(jeu, source);
  source += 2;
  const edx = produitHaut(sautees, largeur);
  let debutDeLigne = (long(jeu, SURFACE) + produitBas(sautees, largeur)) | 0;
  let lignes = mot(jeu, source);
  source += 2;
  let cible = debutDeLigne;
  do {
    cible = debutDeLigne;
    let paquets = m8[source++];
    while (paquets !== 0) {
      cible = (cible + m8[source++]) | 0;
      const compte = m8[source++];
      if (s8(compte) >= 0) {
        m8.copyWithin(cible, source, source + compte);
        cible += compte; source += compte;
      } else {
        const n = (-compte) & 0xFF;
        m8.fill(m8[source++], cible, cible + n);
        cible += n;
      }
      paquets = (paquets - 1) & 0xFFFF;
    }
    debutDeLigne = (debutDeLigne + mot(jeu, LARGEUR_DU_FILM)) | 0;
    lignes = (lignes - 1) & 0xFFFF;
  } while (lignes !== 0);
  poserRegistres(jeu, { eax: mot(jeu, LARGEUR_DU_FILM), ecx, edx, esi: source, edi: cible });
}

// 0x611B1 — image pleine compressée (FLI, genre 0xF) : pour chaque ligne, un octet ignoré (le
// nombre de paquets), puis des paquets jusqu'à couvrir la largeur : un compte signé, positif pour
// un octet répété, négatif (0 : −256) pour autant d'octets copiés. Registres : esi derrière l'image,
// edi derrière les données, bx épuisé.
//
// Anomalies reproduites : une ligne dont les paquets dépassent la largeur ne s'arrête qu'au
// débordement du compteur 16 bits ; une hauteur nulle en vaut 65 536.
function decoderUneImagePleine(jeu) {
  const largeur = mot(jeu, LARGEUR_DU_FILM), hauteur = mot(jeu, HAUTEUR_DU_FILM);
  avecEbp(jeu, 4, () => lireLeFilm(jeu, long(jeu, TAMPON_DU_FILM), resteDuBloc(jeu)));
  const R = jeu.T.R, m8 = jeu.m8;
  let eax = R.eax, ecx = R.ecx, edx = R.edx;
  let cible = long(jeu, SURFACE), source = long(jeu, TAMPON_DU_FILM);
  let lignes = hauteur;
  do {
    source++;
    let reste = largeur;
    do {
      let compte = m8[source++];
      if (s8(compte) > 0) {
        eax = (eax & ~0xFFFF) | compte;
        reste = (reste - compte) & 0xFFFF;
        const valeur = m8[source++];
        do { m8[cible++] = valeur; compte = (compte - 1) & 0xFF; } while (compte !== 0);
        edx = (edx & ~0xFFFF) | valeur << 8;
      } else {
        eax = (eax & ~0xFFFF) | 0xFF00 | compte;
        reste = (reste + (0xFF00 | compte)) & 0xFFFF;
        let valeur = 0;
        do { valeur = m8[source++]; m8[cible++] = valeur; compte = (compte + 1) & 0xFF; } while (compte !== 0);
        edx = (edx & ~0xFFFF) | valeur << 8;
      }
    } while (reste !== 0);
    ecx = ecx & ~0xFFFF;
    lignes = (lignes - 1) & 0xFFFF;
  } while (lignes !== 0);
  poserRegistres(jeu, { eax, ebx: R.ebx & ~0xFFFF, ecx, edx, esi: cible, edi: source });
}

// 0x6123D — attendre, en lisant l'heure du DOS en boucle, que le délai du film (centièmes) soit
// écoulé depuis l'image précédente, puis noter l'heure. Les mots bas d'eax, ebx, ecx, edx sont
// rendus ; le mot haut d'edx, lui, sort à zéro.
function attendreLImageSuivante(jeu, R) {
  if (long(jeu, DELAI_ENTRE_IMAGES) === 0) return;
  const entree = { eax: R.eax, ebx: R.ebx, ecx: R.ecx, edx: R.edx };
  let heure;
  // L'original a empilé ax, bx, cx, dx : l'heure est demandée 8 octets sous l'entrée.
  avecCadre(jeu, 8, 0, () => { for (;;) {
    heure = centiemes(jeu);
    poserRegistres(jeu, { ecx: (R.ecx & ~0xFFFF) | heure });
    let ecart = (heure - mot(jeu, HEURE_DE_L_IMAGE)) & 0xFFFF;
    poserRegistres(jeu, { edx: (R.edx & ~0xFFFF) | ecart });
    if (ecart === 0) continue;
    if (s16(ecart) < 0) ecart = (ecart + MINUTE_EN_CENTIEMES) & 0xFFFF;   // la minute a tourné
    poserRegistres(jeu, { edx: ecart });
    if (ecart >= longSigne(jeu, DELAI_ENTRE_IMAGES)) break;
  } });
  poserMot(jeu, HEURE_DE_L_IMAGE, heure);
  poserRegistres(jeu, {
    eax: (R.eax & ~0xFFFF) | (entree.eax & 0xFFFF), ebx: (R.ebx & ~0xFFFF) | (entree.ebx & 0xFFFF),
    ecx: (R.ecx & ~0xFFFF) | (entree.ecx & 0xFFFF), edx: entree.edx & 0xFFFF,
  });
}

// Les scripts sonores des films, recopiés du code (0x5BF14...) dans les variables locales de
// 0x5C04F : [adresse dans le code, taille, place sous le cadre].
//   partie gagnée (wingame.dat) : images 32, 190 et 202 bruitages 44 et 8, image 60 morceau 21 ;
//   par défaut : morceau 0 (la musique de l'attraction, posée à la place) dès l'image 1 ;
//   attraction 6 : morceau 4 (idem), bruitage 15 aux images 71 à 146, 18 aux images 179 et 210 ;
//   attraction 8 : morceau 15 à l'image 3, bruitage 45 huit fois ;
//   attractions 9 et 16 : morceau 15 à l'image 3, bruitages 17 et 18 quatorze fois.
const SCRIPT_DE_LA_PARTIE_GAGNEE = { code: 0x5BF14, taille: 0x23, place: 0x38 };
const SCRIPT_PAR_DEFAUT = { code: 0x5BF37, taille: 14, place: 0x14 };
const SCRIPT_DE_L_ATTRACTION_6 = { code: 0x5BF45, taille: 0x54, place: 0xD4 };
const SCRIPT_DE_L_ATTRACTION_8 = { code: 0x5BF99, taille: 0x46, place: 0x80 };
const SCRIPT_DES_ATTRACTIONS_9 = { code: 0x5BFDF, taille: 0x70, place: 0x144 };
const SCRIPTS = [SCRIPT_DE_LA_PARTIE_GAGNEE, SCRIPT_PAR_DEFAUT, SCRIPT_DE_L_ATTRACTION_6,
  SCRIPT_DE_L_ATTRACTION_8, SCRIPT_DES_ATTRACTIONS_9];
const FILM_DE_LA_PARTIE_GAGNEE = 1, FILM_D_ATTRACTION = 2;

// Le script sonore du film de l'attraction `a`.
function scriptDeLAttraction(a) {
  if (a === 6) return SCRIPT_DE_L_ATTRACTION_6;
  if (a === 8) return SCRIPT_DE_L_ATTRACTION_8;
  if (a === 9 || a === 0x10) return SCRIPT_DES_ATTRACTIONS_9;
  return SCRIPT_PAR_DEFAUT;
}

// Remettre la souris dans la plage du 320x200, au centre, après un changement de mode.
function recentrerLaSouris(jeu) {
  jeu.appeler(PLAGE_DE_LA_SOURIS, 0, 0x27E, 0, 0x1DE);
  jeu.appeler(PLACER_LA_SOURIS, 0x140, 0xC8);
  poserMot(jeu, SOURIS_X, 0x140);
  poserMot(jeu, SOURIS_Y, 0xC8);
  poserMot(jeu, TRACE_X, 0xFFFF);
  poserMot(jeu, TRACE_Y, 0xFFFF);
}

// 0x5C04F — jouer un film en plein écran : `genre` 1, la partie gagnée (data/wingame.dat) ; 2, le
// film de l'attraction `attraction` (data/rideani.NNN, la loupe de sa fiche). Rien si le fichier
// manque. En 640x480, le jeu passe en 320x200 le temps du film. Musique et bruitages arrêtés,
// grand tampon découpé (palette, tampon du film, tampon de palette), le film joué — rejoué jusqu'à
// un clic ou une touche si l'attraction le demande (octet +1 de 0xBA0FF) —, puis tout est remis :
// son d'ambiance si le parc est ouvert, fondu, images du parc rechargées (data/mspr-0.dat dans le
// grand tampon), mode et pointeur.
//
// L'attraction 16 prend le film 9 : l'argument lui-même est récrit, sur la pile de l'appelant. La
// musique du film est celle de l'attraction (0xBA0FF), posée dans la première ligne du script par
// défaut (film d'attraction), ou du script de l'attraction 6 quand il n'est joué qu'une fois.
// Anomalie reproduite : rejoué en boucle, le film de l'attraction 6 garde son morceau 4.
function jouerUnFilmEnPleinEcran(jeu, genre, attraction) {
  const entree = jeu.T.R.esp >>> 0;
  avecLeCadreDOrigine(jeu, 0x18C, (ebp) => {
    for (const s of SCRIPTS) jeu.m8.copyWithin(ebp - s.place, s.code, s.code + s.taille);
    // Les copies (rep movs) laissent esi derrière le dernier script du code, edi derrière sa copie,
    // ecx à zéro, pour toute la suite.
    poserRegistres(jeu, { esi: 0x5C04F, edi: (ebp - SCRIPT_DES_ATTRACTIONS_9.place + SCRIPT_DES_ATTRACTIONS_9.taille) | 0, ecx: 0 });
    const scriptEnPile = (s) => (ebp - s.place) >>> 0;
    if ((attraction & 0xFF) === 0x10) poserOctet(jeu, entree + 8, 9);
    const a = octet(jeu, entree + 8);
    const g = genre & 0xFF;
    if (g === FILM_DE_LA_PARTIE_GAGNEE) jeu.appeler(STRCPY, NOM_DU_FILM, 0xB7FCB);            // data/wingame.dat
    else if (g === FILM_D_ATTRACTION) jeu.appeler(SPRINTF, NOM_DU_FILM, 0xB0330, 0xB876C, a); // %s%03d, data/rideani.
    if (s16(jeu.appeler(ACCESS, NOM_DU_FILM)) === -1) return;

    poserOctet(jeu, MUSIQUE_DU_FILM_EN_BOUCLE, 0);
    if (g === FILM_D_ATTRACTION) {
      poserLong(jeu, scriptEnPile(SCRIPT_PAR_DEFAUT) + 3, octet(jeu, MUSIQUE_DES_ATTRACTIONS + 2 * a));
      poserOctet(jeu, MUSIQUE_DU_FILM_EN_BOUCLE, 1);
    }
    jeu.appeler(OUVRIR_ECRAN_PLEIN);
    const etaitEnHauteResolution = (mot(jeu, MODE_AFFICHAGE) & 8) !== 0;
    if (etaitEnHauteResolution) {
      jeu.appeler(MODE_D_ORIGINE);
      poserMot(jeu, MODE_AFFICHAGE, 1);
      // L'original teste le mode qu'il vient de poser : c'est toujours le 320x200.
      jeu.appeler(PASSER_EN_BASSE, long(jeu, PALETTE_DU_PARC));
      recentrerLaSouris(jeu);
    }
    jeu.appeler(ARRETER_LA_MUSIQUE);
    jeu.appeler(ARRETER_TOUS_LES_BRUITAGES);
    poserOctet(jeu, TOUCHE, 0);
    poserLong(jeu, TRACE_DIRECT_SUSPENDU, 1);
    jeu.appeler(CURSEUR, long(jeu, BANQUE_DES_CURSEURS));
    poserMot(jeu, DROIT_TENU, 0);
    poserMot(jeu, GAUCHE_TENU, mot(jeu, DROIT_TENU));

    // Le grand tampon : palette du film, tampon du film (+0xFA00), tampon de palette (+0x3E800).
    const grand = long(jeu, GRAND_TAMPON);
    poserLong(jeu, PALETTE_DU_FILM, grand);
    poserLong(jeu, TAMPON_DU_FILM, grand + 0xFA00);
    poserLong(jeu, TAMPON_DE_PALETTE, grand + 0x3E800);
    jeu.appeler(MEMSET, long(jeu, PALETTE_DU_FILM), 0, 0x5DC00);
    jeu.appeler(MEMSET, long(jeu, FOND), 0, 0xFA00);
    // L'écran effacé et présenté ; le délai entre les images, 2 centièmes en 320x200, 8 en 640x480.
    const basse = (mot(jeu, MODE_AFFICHAGE) & 1) !== 0;
    if (basse) poserLong(jeu, DELAI_ENTRE_IMAGES, 2);
    if (basse) jeu.appeler(EFFACER_DES_LIGNES_BASSE, long(jeu, SURFACE), 0x190, 0);
    else jeu.appeler(EFFACER_DES_LIGNES_HAUTE, long(jeu, SURFACE), 0x1E0, 0);
    if (!basse) poserLong(jeu, DELAI_ENTRE_IMAGES, 8);
    jeu.appeler(ATTENDRE_LE_BALAYAGE);
    if (mot(jeu, MODE_AFFICHAGE) & 1) jeu.appeler(PRESENTER_BASSE, 0x190);
    else jeu.appeler(PRESENTER_HAUTE);
    poserOctet(jeu, TOUCHE, 0);

    const jouer = (s) => jeu.appeler(JOUER_UN_FILM, 1, 1, scriptEnPile(s));
    if (g === FILM_DE_LA_PARTIE_GAGNEE) {
      jouer(SCRIPT_DE_LA_PARTIE_GAGNEE);
    } else {
      poserMot(jeu, DROIT_TENU, 0);
      poserMot(jeu, GAUCHE_TENU, mot(jeu, DROIT_TENU));
      const a2 = octet(jeu, entree + 8);
      poserOctet(jeu, MUSIQUE_DU_FILM, octet(jeu, MUSIQUE_DES_ATTRACTIONS + 2 * a2));
      if (octet(jeu, MUSIQUE_DES_ATTRACTIONS + 2 * a2 + 1) !== 0) {
        while (octet(jeu, TOUCHE) === 0 && mot(jeu, GAUCHE_TENU) === 0 && mot(jeu, DROIT_TENU) === 0) {
          jouer(scriptDeLAttraction(a2));
        }
      } else {
        if (a2 === 6) poserLong(jeu, scriptEnPile(SCRIPT_DE_L_ATTRACTION_6) + 3, octet(jeu, MUSIQUE_DES_ATTRACTIONS + 2 * a2));
        jouer(scriptDeLAttraction(a2));
      }
    }

    jeu.appeler(ARRETER_TOUS_LES_BRUITAGES);
    jeu.appeler(ARRETER_LA_MUSIQUE);
    if (octet(jeu, long(jeu, FICHE_DU_PARC) + 0x18) !== 0) {
      jeu.appeler(LANCER_UNE_AMBIANCE, 0, 0x15, 3, octet(jeu, VOLUME_DE_L_AMBIANCE));
    }
    poserMot(jeu, REDESSINER_CARTE, 1);
    jeu.appeler(FONDRE_AU_NOIR, 8, long(jeu, PALETTE_DU_FILM));
    jeu.appeler(MEMSET, long(jeu, SURFACE), 0, 0xFA00);
    jeu.appeler(MEMSET, long(jeu, FOND), 0, 0xFA00);
    jeu.appeler(CHARGER_UN_FICHIER, 0xB0BBB, long(jeu, GRAND_TAMPON));     // data/mspr-0.dat
    poserLong(jeu, NIVEAU_DU_FONDU, 0);
    poserOctet(jeu, PAS_DU_FONDU, 0xC);
    jeu.appeler(FERMER_ECRAN_PLEIN);
    if (etaitEnHauteResolution) {
      jeu.appeler(MODE_D_ORIGINE);
      poserMot(jeu, MODE_AFFICHAGE, 8);
      // Même test, toujours faux : c'est le 640x480.
      jeu.appeler(PASSER_EN_HAUTE, long(jeu, PALETTE_DU_PARC));
      recentrerLaSouris(jeu);
    }
    jeu.appeler(CURSEUR, long(jeu, BANQUE_DES_CURSEURS) + 6);
    poserLong(jeu, TRACE_DIRECT_SUSPENDU, 0);
  });
}
const JOUER_UN_FILM = 0x60C44;

// ================================================================================================
// 6. Au chargement d'une partie
// ================================================================================================

// 0x19334 — vider les attractions d'une partie qu'on vient de charger : le monorail appelle le
// suivant de sa file (0x32142) et oublie son passager, sa file et son compte (+0x1E, +0x47,
// +0x2A) ; toute autre attraction est fermée (0x31668), en gardant son octet +0x4B.
function viderLesAttractions(jeu) {
  avecLeCadreDOrigine(jeu, 0x10, () => {
    for (let objet = (long(jeu, OBJETS) + TAILLE_D_OBJET) >>> 0; objet < long(jeu, FIN_DES_OBJETS); objet = (objet + TAILLE_D_OBJET) >>> 0) {
      if (octet(jeu, objet + 4) !== ATTRACTION) continue;
      const fiche = CATALOGUE + mot(jeu, objet + 0x16);
      if (mot(jeu, fiche + 0x22) === MONORAIL) {
        const passager = (Math.imul(mot(jeu, objet + 0x1E), TAILLE_D_OBJET) + long(jeu, OBJETS)) | 0;
        jeu.appeler(APPELER_LE_SUIVANT, passager, objet);
        poserMot(jeu, objet + 0x47, 0);
        poserMot(jeu, objet + 0x1E, 0);
        poserMot(jeu, objet + 0x2A, 0);
      } else {
        const garde = octet(jeu, objet + 0x4B);
        jeu.appeler(FERMER_L_ATTRACTION, objet);
        poserOctet(jeu, objet + 0x4B, garde);
      }
    }
  });
}

// =================================================================================================

// Ce que les routines du film écrivent hors des variables : le grand tampon (palette, tampon du
// film, tampon de palette).
const grandTampon = (jeu) => [[long(jeu, GRAND_TAMPON), (long(jeu, GRAND_TAMPON) + 0x5DC00) >>> 0]];
// Les 32 descripteurs d'échantillon de chaque module de mélange (§ 9.4), que l'hôte range à 0x100
// du début du module (moteur/hote/son.js) : un bruitage lancé ou arrêté les écrit, hors des zones
// que la comparaison appel par appel relève d'office.
const MODULES_DE_MELANGE = 0xC3238;
const descripteursDuMelange = (jeu) => [0, 1, 2, 3, 4]
  .map((i) => long(jeu, MODULES_DE_MELANGE + 4 * i))
  .filter((m) => m !== 0)
  .map((m) => [(m + 0x100) >>> 0, (m + 0x100 + 32 * 0x6C) >>> 0]);
const ASSEMBLEUR = ['ebx', 'esi', 'edi', 'ebp', 'esp'];

export const reecritures = [
  // 1. l'ouverture du son
  { adresse: 0x6010C, nom: 'ouvrirLaMusique', fn: ouvrirLaMusique, arguments: 1, memoire: 'entiere' },
  { adresse: 0x604D9, nom: 'chargerUnFichierEntier', fn: chargerUnFichierEntier, arguments: 1, retour: true,
    memoire: 'entiere' },
  { adresse: 0x6058B, nom: 'ouvrirLesBruitages', fn: ouvrirLesBruitages, memoire: 'entiere' },
  // 2. les morceaux de SOS
  { adresse: 0x7F68F, nom: 'preparerUnMorceau', fn: preparerUnMorceau, arguments: 6, retour: true,
    memoire: 'entiere' },
  { adresse: 0x7FD96, nom: 'remettreUnMorceauAuDebut', fn: remettreUnMorceauAuDebut, arguments: 3, retour: true,
    memoire: 'entiere' },
  { adresse: 0x7FC05, nom: 'demarrerUnMorceau', fn: demarrerUnMorceau, arguments: 1, retour: true },
  { adresse: 0x7FC8D, nom: 'arreterUnMorceau', fn: arreterUnMorceau, arguments: 1, retour: true,
    memoire: 'entiere' },
  { adresse: 0x7FBC2, nom: 'oublierUnMorceau', fn: oublierUnMorceau, arguments: 1, retour: true },
  { adresse: 0x80034, nom: 'lireUnDelai', fn: lireUnDelai, arguments: 4, retour: true },
  { adresse: 0x815E1, nom: 'copierUneChaineLointaine', fn: copierUneChaineLointaine, arguments: 4, retour: true,
    zones: (jeu, d, sd, s, ss) => {
      const debut = lointain(jeu, d, sd), source = lointain(jeu, s, ss);
      let n = 0;
      while (jeu.m8[source + n] !== 0) n++;
      return [[debut, debut + n + 1]];
    } },
  // 3. le volume de la musique
  { adresse: 0x800AB, nom: 'poserLeVolumeDeLaMusique', fn: poserLeVolumeDeLaMusique, arguments: 1, retour: true },
  { adresse: 0x11AD3, nom: 'volumeDeLaMusique', fn: volumeDeLaMusique, arguments: 1 },
  { adresse: 0x801A0, nom: 'relancerLaMusique', fn: relancerLaMusique, arguments: 0 },
  { adresse: 0x87202, nom: 'envoyerAuPilote', fn: envoyerAuPilote, arguments: 4, retour: true },
  // 4. les événements de la minuterie de SOS : appelés par un appel lointain, rendus par `retf`
  { adresse: 0x5CA6B, nom: 'unTicDuJeu', fn: unTicDuJeu, convention: 'registres', nettoie: 4 },
  { adresse: 0x803E0, nom: 'monterLesAmbiances', fn: monterLesAmbiances, convention: 'registres', nettoie: 4,
    zones: descripteursDuMelange },
  // 5. le film
  { adresse: 0x5C04F, nom: 'jouerUnFilmEnPleinEcran', fn: jouerUnFilmEnPleinEcran, arguments: 2,
    memoire: 'entiere' },
  { adresse: 0x60C44, nom: 'jouerUnFilm', fn: jouerUnFilm, arguments: 3, memoire: 'entiere',
    registresCompares: ['eax', 'ecx', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'] },
  { adresse: 0x5FC16, nom: 'suivreLeScriptSonore', fn: suivreLeScriptSonore, arguments: 1,
    zones: descripteursDuMelange },
  { adresse: 0x60E30, nom: 'decoderUneImage', fn: decoderUneImage, convention: 'registres',
    registresCompares: ASSEMBLEUR, zones: grandTampon },
  { adresse: 0x60EF3, nom: 'lireLEnTete', fn: lireLEnTete, convention: 'registres', zones: grandTampon },
  { adresse: 0x60F92, nom: 'lireUnePalette', fn: lireUnePalette, convention: 'registres', zones: grandTampon },
  { adresse: 0x60F56, nom: 'lireUnBlocDeCopie', fn: lireUnBlocDeCopie, convention: 'registres', zones: grandTampon },
  { adresse: 0x60FB9, nom: 'poserLaPaletteDuFilm', fn: poserLaPaletteDuFilm, convention: 'registres',
    zones: grandTampon },
  { adresse: 0x61033, nom: 'decoderLesDeltasParMots', fn: decoderLesDeltasParMots, convention: 'registres',
    zones: grandTampon },
  { adresse: 0x6110A, nom: 'decoderLesDeltasParOctets', fn: decoderLesDeltasParOctets, convention: 'registres',
    registresCompares: ['ecx', ...ASSEMBLEUR], zones: grandTampon },
  { adresse: 0x611B1, nom: 'decoderUneImagePleine', fn: decoderUneImagePleine, convention: 'registres',
    zones: grandTampon },
  { adresse: 0x6123D, nom: 'attendreLImageSuivante', fn: attendreLImageSuivante, convention: 'registres',
    registresCompares: ['eax', 'ecx', 'edx', ...ASSEMBLEUR] },
  // 6. au chargement d'une partie
  { adresse: 0x19334, nom: 'viderLesAttractions', fn: viderLesAttractions, memoire: 'entiere' },
];

export const enAttente = [
  { adresse: 0x60F74, nom: 'passerUnBloc', fn: passerUnBloc, arguments: 0 },
];
