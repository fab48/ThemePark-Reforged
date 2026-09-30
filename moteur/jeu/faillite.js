// La fin de partie : l'animation de la faillite (« BUSTED ») et celle du rachat du parc
// (« TAKEOVER »), et le petit lecteur d'animations qui les joue.
//
// Réécriture lisible de 0x5C7D1 (la séquence entière), 0x5B88D (ouvrir l'animation), 0x5BD48 (lire
// son en-tête), 0x5BE27 (en montrer l'image suivante), 0x5C6F4 (faire avancer les animations d'une
// table), 0x5BBC6 (refermer), 0x7F1D0 (le fondu de palette), 0x87ED4 (lire la palette de la carte),
// et du décodeur d'images en assembleur : 0x81EAC, 0x81EC9, 0x81F54, 0x8203D.
// Voir docs/guide-reecriture.md.
//
// QUI LA DÉCLENCHE. 0x5C7D1(genre) est appelée avec 1 par la fin d'année (0x729D8), quand le joueur,
// déjà averti, est en faillite : fortune négative ou action tombée à 99 ; et avec 2 par l'achat d'une
// action (0x4A571, economie.js), quand l'acheteur est le joueur courant et détient alors toutes les
// actions du parc acheté (le mot +0x62 du parc égal à ses actions, +0xA3 de sa fiche) : le joueur a
// racheté un concurrent. L'animation seule ; la partie, elle, n'est pas touchée ici.
//
// LES FICHIERS. Chaque animation tient en trois fichiers :
//   genre 1 : data/busted.dat, data/buspal.dat, data/busted.anm ;
//   genre 2 : data/takover.dat, data/takpal.dat, data/takover.anm.
// Le .dat (lu et décompressé par 0x7F0B0) commence par « MINA », cinq octets, le nom de
// l'animation terminé par un zéro, puis l'image de départ, 320 octets par ligne : c'est la toile où
// les images suivantes sont décodées. Le .anm, lu brut à la suite du .dat, commence par un mot (le
// nombre d'images) et quatre octets, puis viennent les images, au format FLC d'Autodesk Animator :
// blocs « image » 0xF1FA, sous-blocs 7 (delta par lignes, dit SS2), 0xF (compression par plages,
// BRUN) et 4 (palette, sautée). Le tout est chargé dans la mémoire des sprites du parc ([0xD3BA8]),
// que 0x5BBC6 remet ensuite en relisant data/mspr-0.dat sur la longueur écrasée.
//
// LA FICHE D'ANIMATION : 16 octets pris dans la zone de travail [0xD3B4C] (celle de
// data/mpanel-0.dat, vidée pour l'occasion et rechargée à la fin), désignée par [0xD35B0] :
//   +0  mot long   la toile (où décoder)         +8  mot long   la prochaine image à décoder
//   +4  mot long   la première image             +C  mot        le nombre d'images
//                                                +E  mot        le numéro de la prochaine image
//
// L'AFFICHAGE. L'animation est en 320x200 : venue du 640x480, la partie change de mode vidéo
// (0x7E270 puis 0x7EC50), note le changement en [0xBA0FC], et revient en 640x480 en refermant.
// Chaque image décodée est recopiée sur la surface de dessin puis présentée ; en 320x200 d'origine,
// on n'avance l'animation qu'une image sur quatre. La séquence s'arrête au bout de ses images, ou à
// un clic ou une touche ; sans interruption, elle attend encore la fin du morceau de musique.
//
// VÉRIFICATION : docs/retro-ingenierie.md, § 11.20 ; seul longue-faillite.json exerce ce module.

import { dansLeCadre } from './cadre.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
// `idiv` : division entière signée tronquée vers zéro ; une division par zéro arrêtait le programme
// d'origine (exception du processeur), elle arrête aussi la réécriture.
function idiv(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}

const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// --- les variables du jeu ----------------------------------------------------------------------
const MODE = 0xDE5F6;                 // mot : bit 0 le 320x200, bit 3 le 640x480
const MODE_BASSE = 1, MODE_HAUTE = 8;
const SURFACE = 0xDE5BC;              // pointeur : l'image en construction
const FOND = 0xD3B98;                 // pointeur : le tampon de fond
const PALETTE = 0xD3B8C;              // pointeur : la palette courante (768 octets)
const PALETTE_AFFICHEE = 0xCEEE0;     // 768 octets : la palette telle qu'envoyée à la carte
const SPRITES = 0xD3BA8;              // pointeur : les images du parc (data/mspr-0.dat)
const ZONE_DE_TRAVAIL = 0xD3B4C;      // pointeur : les images du panneau (data/mpanel-0.dat)
const CURSEURS = 0xD3B84;             // pointeur : les images du pointeur (+6 la flèche)
const SOURIS_FIGEE = 0xBECA4;         // mot long : posé, le gestionnaire de souris ne trace plus
                                      // le pointeur (0x7D7E2)
const PILOTE_X = 0xBEC94, PILOTE_Y = 0xBEC96;   // mots : la position précédente du pilote
const TRACE_X = 0xB14E2, TRACE_Y = 0xB14E4;     // mots : le pointeur collé à la grille
const ECRAN = 0xD6652;                // mot : l'écran ouvert
const ECRAN_PRECEDENT = 0xD660E;      // mot : l'écran d'où l'on vient
const ECRAN_A_ROUVRIR = 0xB9EDE;      // octet : l'écran ouvert avant l'animation
const DROIT_TENU = 0xDE5AA, GAUCHE_TENU = 0xDE5AC;   // mots : les boutons maintenus
const TOUCHE = 0xDE688;               // octet : le code de balayage de la touche de l'image
const NIVEAU_DU_FONDU = 0xD380C, PAS_DU_FONDU = 0xD777F;   // le fondu d'ouverture (0x1A706)
const MUSIQUE_PERMISE = 0xBA715;      // octet : la musique allumée, que bascule MUSIQUE (§ 11.10)
const MORCEAU_SOS = 0xD7984;          // mot long : le morceau pour le pilote

// Le lecteur d'animations.
const MODE_CHANGE = 0xBA0FC;          // octet : l'animation a fait passer du 640x480 au 320x200
const TAILLE_DU_DAT = 0xD78AC;        // mot long signé : la taille du .dat chargé
const TAILLE_DE_L_ANM = 0xD78A0;      // mot long signé : les octets lus du .anm
const POIGNEE = 0xD78A8;              // mot long : le fichier ouvert
const TOILE = 0xD78A4;                // mot long : la toile de l'animation (la position lue dans
                                      // le .dat, laissée après le nom par 0x5BD48)
const ANIMATION = 0xD35B0;            // pointeur : la fiche de l'animation (table d'une entrée)

// Les fiches d'animation (voir l'en-tête).
const FICHE_TOILE = 0, FICHE_DEBUT = 4, FICHE_SUIVANTE = 8, FICHE_NOMBRE = 0xC, FICHE_NUMERO = 0xE;
const TAILLE_FICHE = 16;
const SIGNATURE_MINA = 0x414E494D;    // « MINA », lu en mot long
const EN_TETE_DU_DAT = 9;             // « MINA » et cinq octets, avant le nom
const EN_TETE_DE_L_ANM = 6;           // le nombre d'images et quatre octets

// Le décodeur FLC (0x81EAC à 0x82163), ses variables.
const FLC_TOILE = 0xBEDE0;            // mot long : où décoder
const FLC_LECTURE = 0xBEDE4;          // mot long : où l'on en est dans les données
const FLC_TYPE = 0xBEDE8;             // mot : le type du bloc lu
const FLC_LARGEUR = 0xBEDEA;          // mot : la largeur de la toile
const FLC_HAUTEUR = 0xBEDEC;          // mot : sa hauteur
const FLC_TAILLE = 0xBEDEE;           // 4 octets : la taille du bloc lu (seul le mot bas sert)
const FLC_SOUS_BLOCS = 0xBEDF2;       // mot : les sous-blocs qui restent dans l'image
const BLOC_EN_TETE = 0xAF12, BLOC_IMAGE = 0xF1FA;
const SOUS_BLOC_DELTA = 7, SOUS_BLOC_PALETTE = 4, SOUS_BLOC_PLAGES = 0xF;

// Le fondu (0x7F1D0).
const PALETTE_DE_DEPART = 0xDE698;    // 768 octets : la palette lue sur la carte
const PALETTE_NOIRE = 0xDE998;        // 768 octets : la cible quand on n'en donne pas
const ETAPE_DU_FONDU = 0xDEC98;       // mot : l'étape en cours
const FONDU_EN_COURS = 0xBED54;       // octet : un fondu pas à pas est commencé

// Les textes : les noms de fichiers.
const FICHIERS = {
  1: [0xB0338, 0xB0348, 0xB0358],     // data/busted.dat, data/buspal.dat, data/busted.anm
  2: [0xB0368, 0xB0379, 0xB0389],     // data/takover.dat, data/takpal.dat, data/takover.anm
};
const MORCEAU = { 1: 0x16, 2: 0x14 };
const FICHIER_DES_SPRITES = 0xB0BBB;  // data/mspr-0.dat
const FICHIER_DE_LA_PALETTE = 0xB7F8C;   // data/mpalette.dat
const FICHIER_DU_PANNEAU = 0xB13C1;   // data/mpanel-0.dat

// --- les fonctions du jeu appelées ---------------------------------------------------------------
const RAFRAICHIR_TOUT = 0x55FCF;
const REMPLIR_320 = 0x81590, REMPLIR_640 = 0x815B8;     // (destination, lignes, couleur)
const MODE_D_ORIGINE = 0x7E270;       // rend le mode vidéo trouvé au lancement
const MODE_320 = 0x7EC50, MODE_640 = 0x7ECF0;           // (palette)
const PLAGE_DU_POINTEUR = 0x11303;    // (x min, x max, y min, y max)
const PLACER_LE_POINTEUR = 0x11191;   // (x, y)
const ETEINDRE = 0x4820D;             // (pas, palette) : l'image s'éteint
const CHARGER_UN_FICHIER = 0x7F0B0;   // (nom, destination) : lit et décompresse, rend la taille
const OUVRIR = 0x7EB70;               // (nom, mode) : la poignée
const MODE_BINAIRE = 0x200;
const TAILLE_DU_FICHIER = 0x7F57D;    // (poignée)
const LIRE = 0x7EBE0;                 // (poignée, tampon, octets) : rend les octets lus
const FERMER = 0x7EC20;               // (poignée)
const REMPLIR = 0x7F1A0;              // memset (destination, valeur, octets)
const RECOPIER_DES_LIGNES = 0x55EFA;  // (source, destination, lignes)
const RECOPIER_320 = 0x80E20;         // (source, destination, lignes de 320 octets)
const RECOPIER_640 = 0x54ED6;         // (source, destination)
const ATTENDRE_BALAYAGE = 0x80BE4;
const PRESENTER_BASSE = 0x80210, PRESENTER_HAUTE = 0x55507;
const POSER_PALETTE = 0x808B0;        // (palette)
const OUVRIR_ECRAN_PLEIN = 0x40D3E, FERMER_ECRAN_PLEIN = 0x40D79;
const CURSEUR = 0x116E4;              // (image)
const ARRETER_LES_BRUITAGES = 0x80DC0;
const LANCER_UN_MORCEAU = 0x80A20;    // (n)
const ARRETER_LA_MUSIQUE = 0x80990;
const MORCEAU_FINI = 0x82174;         // (morceau) : non nul quand il est fini
const LIRE_UNE_TOUCHE = 0x7E888;
const ROUVRIR_UN_ECRAN = 0x1B23A;     // (écran)
const FLC_LIRE_L_EN_TETE = 0x82002;   // le bloc 0xAF12 : largeur et hauteur
const FLC_SAUTER = 0x8202C;           // saute le sous-bloc lu
const FLC_PLAGES = 0x820DF;           // le sous-bloc BRUN

// Les fonctions de ce module, appelées par leur entrée (jeu.appeler) comme le faisait l'original.
const OUVRIR_L_ANIMATION = 0x5B88D, REFERMER_L_ANIMATION = 0x5BBC6, LIRE_L_EN_TETE = 0x5BD48;
const IMAGE_SUIVANTE = 0x5BE27, FAIRE_AVANCER = 0x5C6F4, FONDU = 0x7F1D0, LIRE_LA_PALETTE = 0x87ED4;
const FLC_TAILLE_DE_LA_TOILE = 0x81EAC, FLC_DECODER = 0x81EC9, FLC_IMAGE = 0x81F54, FLC_DELTA = 0x8203D;

const basseResolution = (jeu) => (octet(jeu, MODE) & MODE_BASSE) !== 0;
const hauteResolution = (jeu) => (octet(jeu, MODE) & MODE_HAUTE) !== 0;

function presenter(jeu) {
  if (basseResolution(jeu)) jeu.appeler(PRESENTER_BASSE, 400);
  else jeu.appeler(PRESENTER_HAUTE);
}
function viderLaSurface(jeu) {
  if (basseResolution(jeu)) jeu.appeler(REMPLIR_320, long(jeu, SURFACE), 400, 0);
  else jeu.appeler(REMPLIR_640, long(jeu, SURFACE), 480, 0);
}
// La toile recopiée sur la surface de dessin. En 640x480, elle passerait d'abord par le tampon de
// fond (400 lignes) ; mais l'animation a toujours mis le 320x200 avant d'en arriver là (0x5B88D) :
// la branche est morte en pratique, gardée comme l'original.
function montrerLaToile(jeu) {
  if (hauteResolution(jeu)) {
    jeu.appeler(RECOPIER_DES_LIGNES, long(jeu, TOILE), long(jeu, FOND), 400);
    if (basseResolution(jeu)) jeu.appeler(RECOPIER_320, long(jeu, FOND), long(jeu, SURFACE), 200);
    else jeu.appeler(RECOPIER_640, long(jeu, FOND), long(jeu, SURFACE));
  } else if (basseResolution(jeu)) {
    jeu.appeler(RECOPIER_320, long(jeu, TOILE), long(jeu, SURFACE), 200);
  } else {
    jeu.appeler(RECOPIER_640, long(jeu, TOILE), long(jeu, SURFACE));
  }
}
// Le pointeur recentré dans l'écran et borné à 640x480, et ses positions de référence oubliées.
function recentrerLePointeur(jeu) {
  jeu.appeler(PLAGE_DU_POINTEUR, 0, 0x27E, 0, 0x1DE);
  jeu.appeler(PLACER_LE_POINTEUR, 0x140, 0xC8);
  poserMot(jeu, PILOTE_X, 0x140);
  poserMot(jeu, PILOTE_Y, 0xC8);
  poserMot(jeu, TRACE_X, 0xFFFF);
  poserMot(jeu, TRACE_Y, 0xFFFF);
}
// Le mot d'une fiche, rendu dans ax : le haut d'eax garde celui de l'adresse de la fiche, comme le
// faisait `mov eax, [0xD35B0] ; mov ax, [eax + n]`.
function motDeLaFiche(jeu, champ) {
  const fiche = long(jeu, ANIMATION);
  return ((fiche & 0xFFFF0000) | mot(jeu, fiche + champ)) | 0;
}
// Avancer au-delà du zéro qui termine le texte désigné par le pointeur en `a` (`while (*p++);`).
function passerLeTexte(jeu, a) {
  let p;
  do {
    p = long(jeu, a);
    poserLong(jeu, a, p + 1);
  } while (octet(jeu, p) !== 0);
}

// =================================================================================================
// LA SÉQUENCE
// =================================================================================================

// 0x5C7D1 — jouer l'animation de fin de partie : 1 la faillite, 2 le rachat du parc.
//
// Écran plein ouvert (0x40D3E), clavier et boutons oubliés, pointeur en flèche, bruitages coupés ;
// l'animation ouverte (0x5B88D, qui rend son nombre d'images) et son morceau lancé (0x16 pour la
// faillite, 0x14 pour le rachat). Puis une image par tour jusqu'à la dernière, un clic ou une
// touche. Interrompue, la musique est coupée ; sinon, si elle est permise, on attend qu'elle finisse.
// Enfin l'animation est refermée (0x5BBC6), la palette et la surface mises au noir, l'écran d'avant
// rétabli (0xD660E) et rouvert (0x1B23A) — la partie reprend, ou s'achève selon l'appelant.
//
// En 320x200 d'origine l'image n'avance qu'un tour sur quatre (le compteur de tours, pris sur 32
// bits) ; venu du 640x480, où l'animation a mis le 320x200, elle avance à chaque tour. Le numéro
// d'image est pris sur un octet : une animation de plus de 255 images ne finirait qu'au clic.
//
// ANOMALIE REPRODUITE : pour un genre autre que 1 ou 2, les trois noms de fichiers sont les variables
// locales jamais écrites [ebp-0x18], [ebp-0x10] et [ebp-0xC] — des restes de pile. La réécriture
// ouvre le cadre de l'original pour les lire aux mêmes adresses ; les appelants ne passent que 1 ou 2.
export const jouerLaFinDePartie = dansLeCadre(0x38, (jeu, cadre, genre) => {
  genre &= 0xFF;
  let image = 0;
  let tours = 0;
  poserOctet(jeu, ECRAN_A_ROUVRIR, octet(jeu, ECRAN));
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  poserOctet(jeu, TOUCHE, 0);
  poserLong(jeu, SOURIS_FIGEE, 1);
  jeu.appeler(CURSEUR, long(jeu, CURSEURS));
  poserMot(jeu, DROIT_TENU, 0);
  poserMot(jeu, GAUCHE_TENU, 0);
  jeu.appeler(ARRETER_LES_BRUITAGES);

  const [dat, pal, anm] = FICHIERS[genre]
    || [long(jeu, cadre.local(0x18)), long(jeu, cadre.local(0x10)), long(jeu, cadre.local(0xC))];
  const nombreDImages = jeu.appeler(OUVRIR_L_ANIMATION, dat, pal, anm) & 0xFFFF;
  if (MORCEAU[genre] !== undefined) jeu.appeler(LANCER_UN_MORCEAU, MORCEAU[genre]);

  const interrompue = () => mot(jeu, GAUCHE_TENU) !== 0 || mot(jeu, DROIT_TENU) !== 0
    || octet(jeu, TOUCHE) !== 0;
  while (!interrompue() && image < nombreDImages) {
    jeu.appeler(LIRE_UNE_TOUCHE);
    if (!basseResolution(jeu) || (tours & 3) === 0) image = jeu.appeler(IMAGE_SUIVANTE) & 0xFF;
    jeu.appeler(ATTENDRE_BALAYAGE);
    presenter(jeu);
    tours = (tours + 1) | 0;
  }

  if (interrompue()) {
    jeu.appeler(ARRETER_LA_MUSIQUE);
  } else if (octet(jeu, MUSIQUE_PERMISE) !== 0) {
    while (jeu.appeler(MORCEAU_FINI, long(jeu, MORCEAU_SOS)) === 0) { /* attendre la fin du morceau */ }
  }
  jeu.appeler(REFERMER_L_ANIMATION);

  jeu.appeler(REMPLIR, PALETTE_AFFICHEE, 0, 0x300);
  jeu.appeler(POSER_PALETTE, PALETTE_AFFICHEE);
  viderLaSurface(jeu);
  poserLong(jeu, NIVEAU_DU_FONDU, 0);
  poserOctet(jeu, PAS_DU_FONDU, 0xFF);
  jeu.appeler(FERMER_ECRAN_PLEIN);
  poserLong(jeu, SOURIS_FIGEE, 0);
  jeu.appeler(CURSEUR, (long(jeu, CURSEURS) + 6) | 0);
  poserMot(jeu, ECRAN, mot(jeu, ECRAN_PRECEDENT));
  jeu.appeler(RAFRAICHIR_TOUT);
  jeu.appeler(ROUVRIR_UN_ECRAN, octet(jeu, ECRAN_A_ROUVRIR));
});

// =================================================================================================
// LE LECTEUR D'ANIMATIONS
// =================================================================================================

// 0x5B88D — ouvrir une animation : (le .dat, la palette, le .anm). Rend son nombre d'images (ax).
//
// En 640x480, la surface est vidée et la partie passe en 320x200 (0x7E270, puis 0x7EC50 avec la
// palette courante), ce que note [0xBA0FC] ; le pointeur est recentré. Puis l'image s'éteint
// (0x4820D, par pas de 8), le .dat est chargé dans la mémoire des sprites, le .anm lu brut à sa
// suite, la palette de l'animation chargée dans la palette courante, la zone de travail vidée
// (16 000 octets). Si les deux fichiers sont là : la fiche est lue (0x5BD48), la toile fixée à 320
// de large (0x81EAC), l'image de départ montrée ; enfin la palette de l'animation monte en 8
// étapes (0x7F1D0).
//
// ANOMALIE REPRODUITE : le .anm introuvable, [0xD78A0] garde la taille lue la fois précédente ;
// et la fiche [0xD35B0] n'est lue que si le .dat porte bien « MINA » — sinon le nombre d'images
// rendu est celui d'une fiche d'avant.
export function ouvrirLAnimation(jeu, dat, pal, anm) {
  poserLong(jeu, SOURIS_FIGEE, 1);
  jeu.appeler(RAFRAICHIR_TOUT);
  if (hauteResolution(jeu)) {
    viderLaSurface(jeu);
    jeu.appeler(MODE_D_ORIGINE);
    poserOctet(jeu, MODE_CHANGE, 1);
    poserMot(jeu, MODE, MODE_BASSE);
    // L'original choisit ici entre 0x7EC50 et 0x7ECF0 selon le bit 0 du mode, qu'il vient de poser.
    jeu.appeler(basseResolution(jeu) ? MODE_320 : MODE_640, long(jeu, PALETTE));
    recentrerLePointeur(jeu);
  }
  jeu.appeler(ETEINDRE, 8, long(jeu, PALETTE));

  poserLong(jeu, TAILLE_DU_DAT, jeu.appeler(CHARGER_UN_FICHIER, dat, long(jeu, SPRITES)));
  poserLong(jeu, POIGNEE, jeu.appeler(OUVRIR, anm, MODE_BINAIRE));
  if (long(jeu, POIGNEE) !== 0 && longSigne(jeu, TAILLE_DU_DAT) > 0) {
    const octets = jeu.appeler(TAILLE_DU_FICHIER, long(jeu, POIGNEE));
    const suite = (long(jeu, SPRITES) + long(jeu, TAILLE_DU_DAT)) | 0;
    poserLong(jeu, TAILLE_DE_L_ANM, jeu.appeler(LIRE, long(jeu, POIGNEE), suite, octets));
    jeu.appeler(FERMER, long(jeu, POIGNEE));
  }
  jeu.appeler(CHARGER_UN_FICHIER, pal, long(jeu, PALETTE));
  jeu.appeler(REMPLIR, long(jeu, ZONE_DE_TRAVAIL), 0, 0x3E80);
  poserLong(jeu, TOILE, long(jeu, SPRITES));

  if (longSigne(jeu, TAILLE_DU_DAT) > 0 && longSigne(jeu, TAILLE_DE_L_ANM) > 0) {
    jeu.appeler(LIRE_L_EN_TETE, TOILE, ANIMATION, long(jeu, ZONE_DE_TRAVAIL),
      (long(jeu, SPRITES) + long(jeu, TAILLE_DU_DAT)) | 0);
    jeu.appeler(FLC_TAILLE_DE_LA_TOILE, 0x140, 0);
    montrerLaToile(jeu);
    jeu.appeler(ATTENDRE_BALAYAGE);
    presenter(jeu);
  }
  jeu.appeler(FONDU, long(jeu, PALETTE), 8, 0);
  return motDeLaFiche(jeu, FICHE_NOMBRE);
}

// 0x5BD48 — lire l'en-tête des animations : (table des positions de lecture, table des fiches,
// zone des fiches, données du .anm). Rend le nombre d'animations trouvées (al).
//
// Pour l'animation 0 : si le .dat commence par « MINA », sa fiche (zone + 0) reçoit la toile — la
// position après le nom —, le début des images (les données, après leur en-tête de 6 octets), leur
// nombre (le premier mot des données) ; la prochaine image est la première, numéro 1. La fiche est
// inscrite dans la table, et la position de lecture avancée au-delà du nom.
//
// ANOMALIE REPRODUITE : l'indice de l'animation (l'octet [ebp-8]) n'avance jamais, et le test n'est
// pas dans une boucle : une seule animation est lue, quel que soit le fichier.
// Le haut d'eax, au retour, est celui de ce que la fonction a manipulé en dernier : l'adresse de la
// table des positions, ou, sans « MINA », la position lue.
export function lireLEnTete(jeu, positions, fiches, zone, donnees) {
  const indice = 0;
  let trouvees = 0;
  const position = (positions + 4 * indice) | 0;
  const lu = long(jeu, position);
  if (long(jeu, lu) !== SIGNATURE_MINA) return ((lu & ~0xFF) | trouvees) | 0;

  const fiche = (zone + TAILLE_FICHE * indice) | 0;
  poserLong(jeu, fiche + FICHE_DEBUT, donnees);
  poserLong(jeu, fiche + FICHE_TOILE, lu + EN_TETE_DU_DAT);
  passerLeTexte(jeu, fiche + FICHE_TOILE);
  poserMot(jeu, fiche + FICHE_NOMBRE, mot(jeu, long(jeu, fiche + FICHE_DEBUT)));
  poserLong(jeu, fiche + FICHE_DEBUT, long(jeu, fiche + FICHE_DEBUT) + EN_TETE_DE_L_ANM);
  poserLong(jeu, fiche + FICHE_SUIVANTE, long(jeu, fiche + FICHE_DEBUT));
  poserMot(jeu, fiche + FICHE_NUMERO, 1);
  poserLong(jeu, (fiches + 4 * indice) | 0, fiche);
  trouvees++;
  poserLong(jeu, position, long(jeu, position) + EN_TETE_DU_DAT);
  passerLeTexte(jeu, position);
  return ((positions & ~0xFF) | trouvees) | 0;
}

// 0x5BE27 — l'image suivante : l'animation avance d'une image (0x5C6F4), la toile est recopiée sur
// la surface. Rend le numéro de la prochaine image (ax ; le haut d'eax, celui de l'adresse de la
// fiche).
export function imageSuivante(jeu) {
  jeu.appeler(FAIRE_AVANCER, 1, ANIMATION, 0);
  montrerLaToile(jeu);
  return motDeLaFiche(jeu, FICHE_NUMERO);
}

// 0x5C6F4 — faire avancer les `nombre` animations d'une table de fiches (les entrées nulles ou −1
// sont libres). Mode 0 : d'une image, décodée sur la toile (0x81EC9) ; passé la dernière, on repart
// de la première. Autre mode : du nombre d'images de la fiche moins un, en se rappelant en mode 0
// sur la seule fiche — un tour complet, qui ramène à l'image d'avant.
//
// Compteurs sur un octet : un nombre d'images nul, en mode non nul, en ferait avancer 255.
export function faireAvancer(jeu, nombre, fiches, mode) {
  for (let k = 0; k !== (nombre & 0xFF); k = (k + 1) & 0xFF) {
    const entree = (fiches + 4 * k) | 0;
    const fiche = long(jeu, entree);
    if (fiche === 0 || fiche === 0xFFFFFFFF) continue;
    if ((mode & 0xFF) === 0) {
      if (mot(jeu, fiche + FICHE_NUMERO) > mot(jeu, fiche + FICHE_NOMBRE)) {
        poserLong(jeu, fiche + FICHE_SUIVANTE, long(jeu, fiche + FICHE_DEBUT));
        poserMot(jeu, fiche + FICHE_NUMERO, 1);
      }
      const suivante = jeu.appeler(FLC_DECODER, long(jeu, fiche + FICHE_SUIVANTE), long(jeu, fiche + FICHE_TOILE));
      poserLong(jeu, fiche + FICHE_SUIVANTE, suivante);
      poserMot(jeu, fiche + FICHE_NUMERO, mot(jeu, fiche + FICHE_NUMERO) + 1);
    } else {
      for (let reste = (octet(jeu, fiche + FICHE_NOMBRE) - 1) & 0xFF; reste !== 0; reste = (reste - 1) & 0xFF) {
        jeu.appeler(FAIRE_AVANCER, 1, entree, 0);
      }
    }
  }
}

// 0x5BBC6 — refermer l'animation : les sprites du parc sont relus de data/mspr-0.dat sur la
// longueur que le .dat et le .anm avaient écrasée, la palette du parc (data/mpalette.dat) et les
// images du panneau (data/mpanel-0.dat) rechargées ; venu du 640x480, on y retourne (0x7E270, mode
// 8, 0x7ECF0) et le pointeur est recentré.
//
// L'original teste le 320x200 et [0xBA0FC] avant de recharger le panneau, mais ses deux branches
// font le même appel.
export function refermerLAnimation(jeu) {
  if (longSigne(jeu, TAILLE_DE_L_ANM) > 0 && longSigne(jeu, TAILLE_DU_DAT) > 0) {
    poserLong(jeu, POIGNEE, jeu.appeler(OUVRIR, FICHIER_DES_SPRITES, MODE_BINAIRE));
    if (long(jeu, POIGNEE) !== 0) {
      const ecrases = (long(jeu, TAILLE_DE_L_ANM) + long(jeu, TAILLE_DU_DAT)) | 0;
      poserLong(jeu, TAILLE_DE_L_ANM, jeu.appeler(LIRE, long(jeu, POIGNEE), long(jeu, SPRITES), ecrases));
      jeu.appeler(FERMER, long(jeu, POIGNEE));
    }
  }
  jeu.appeler(CHARGER_UN_FICHIER, FICHIER_DE_LA_PALETTE, long(jeu, PALETTE));
  jeu.appeler(CHARGER_UN_FICHIER, FICHIER_DU_PANNEAU, long(jeu, ZONE_DE_TRAVAIL));
  if (octet(jeu, MODE_CHANGE) !== 0) {
    jeu.appeler(MODE_D_ORIGINE);
    poserMot(jeu, MODE, MODE_HAUTE);
    // Comme à l'ouverture : le choix selon le bit 0 du mode qu'on vient de poser.
    jeu.appeler(basseResolution(jeu) ? MODE_320 : MODE_640, long(jeu, PALETTE));
    recentrerLePointeur(jeu);
    poserOctet(jeu, MODE_CHANGE, 0);
  }
  poserLong(jeu, SOURIS_FIGEE, 0);
}

// =================================================================================================
// LE FONDU DE PALETTE
// =================================================================================================

// 0x7F1D0 — le fondu de la palette de la carte vers `cible` (768 octets ; nulle : le noir), en
// `etapes` étapes. Chaque étape k envoie départ + (cible − départ) × k / etapes, division tronquée,
// après le retour du balayage (0x80BE4, 0x808B0).
//
// `pasAPas` nul : le fondu entier, des étapes 0 à `etapes` comprises ; la palette de départ est lue
// sur la carte (0x87ED4). Sinon, une étape par appel : le premier appel lit la palette de départ et
// montre l'étape 0, les suivants avancent d'une étape ; [0xBED54] retombe quand on atteint `etapes`.
// Rend l'étape (ax) : `etapes` + 1 pour le fondu entier.
//
// La palette de l'étape est prise dans les variables locales (0x300 octets), comme dans l'original
// qui en passe l'adresse à 0x808B0 : la réécriture ouvre le même cadre. La cible nulle est remplacée
// par 0xDE998 dans l'argument même (sur la pile de l'appelant), comme le faisait l'original. `etapes`
// nul arrêterait le programme (division par zéro), ici comme en 1994.
export const fondu = dansLeCadre(0x30C, (jeu, cadre, cible, etapes, pasAPas) => {
  etapes &= 0xFF;
  const argumentCible = cadre.ebp + 0x14;   // l'emplacement du premier argument
  const palette = cadre.local(0x30C);
  const remplacerLaCible = () => { cible = PALETTE_NOIRE; poserLong(jeu, argumentCible, cible); };
  const calculerLEtape = () => {
    const etape = s16(mot(jeu, ETAPE_DU_FONDU));
    for (let k = 0; k < 0x300; k++) {
      const depart = octet(jeu, PALETTE_DE_DEPART + k);
      const ecart = s16(octet(jeu, cible + k) - depart);
      poserOctet(jeu, palette + k, idiv(Math.imul(ecart, etape), etapes) + depart);
    }
    jeu.appeler(ATTENDRE_BALAYAGE);
    return jeu.appeler(POSER_PALETTE, palette);
  };

  if ((pasAPas & 0xFF) === 0) {
    jeu.appeler(LIRE_LA_PALETTE, PALETTE_DE_DEPART);
    if (cible === 0) {
      remplacerLaCible();
      jeu.appeler(REMPLIR, cible, 0, 0x300);
    }
    for (poserMot(jeu, ETAPE_DU_FONDU, 0); etapes >= s16(mot(jeu, ETAPE_DU_FONDU));
      poserMot(jeu, ETAPE_DU_FONDU, mot(jeu, ETAPE_DU_FONDU) + 1)) {
      calculerLEtape();
    }
    poserOctet(jeu, FONDU_EN_COURS, 0);
    return mot(jeu, ETAPE_DU_FONDU);
  }

  if (octet(jeu, FONDU_EN_COURS) === 0) {
    poserMot(jeu, ETAPE_DU_FONDU, 0);
    poserOctet(jeu, FONDU_EN_COURS, 1);
    jeu.appeler(LIRE_LA_PALETTE, PALETTE_DE_DEPART);
    if (cible === 0) jeu.appeler(REMPLIR, PALETTE_NOIRE, 0, 0x300);
  } else {
    poserMot(jeu, ETAPE_DU_FONDU, mot(jeu, ETAPE_DU_FONDU) + 1);
    if (etapes === mot(jeu, ETAPE_DU_FONDU)) poserOctet(jeu, FONDU_EN_COURS, 0);
  }
  if (cible === 0) remplacerLaCible();
  const eax = calculerLEtape();
  return ((eax & 0xFFFF0000) | mot(jeu, ETAPE_DU_FONDU)) | 0;
});

// Les ports de la carte VGA, comme la transcription les sert : c'est T.R qui fait foi dans une
// réécriture, rechargé avant le service (l'hôte peut y livrer une interruption) et après.
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
const DAC_INDEX_DE_LECTURE = 0x3C7, DAC_DONNEES = 0x3C9;

// 0x87ED4 — lire la palette de la carte : les 256 couleurs (768 octets, rouge, vert, bleu sur 6
// bits) lues par le port 0x3C9 après avoir posé l'index de lecture à 0. Routine en assembleur qui
// garde tous les registres.
export function lireLaPalette(jeu, destination) {
  sortiePort(jeu, DAC_INDEX_DE_LECTURE, 0);
  for (let k = 0; k < 0x300; k++) poserOctet(jeu, destination + k, entreePort(jeu, DAC_DONNEES));
}

// =================================================================================================
// LE DÉCODEUR FLC (assembleur)
// =================================================================================================

// 0x81EAC — la taille de la toile : (largeur, hauteur), des mots. Garde tous les registres.
export function tailleDeLaToile(jeu, largeur, hauteur) {
  poserMot(jeu, FLC_LARGEUR, largeur);
  poserMot(jeu, FLC_HAUTEUR, hauteur);
}

// Lire l'en-tête d'un bloc : sa taille (4 octets) et son type (un mot).
function lireUnBloc(jeu) {
  const p = long(jeu, FLC_LECTURE);
  poserLong(jeu, FLC_TAILLE, long(jeu, p));
  poserMot(jeu, FLC_TYPE, mot(jeu, p + 4));
  poserLong(jeu, FLC_LECTURE, p + 6);
  return mot(jeu, FLC_TYPE);
}

// 0x81EC9 — décoder une image : (données, toile). Les blocs d'en-tête 0xAF12 donnent la taille de
// la toile (0x82002) ; le premier bloc image 0xF1FA est décodé (0x81F54) et la fonction rend
// l'adresse qui le suit. Un autre bloc arrête tout : elle rend 0 (et l'animation, qui prendrait ce
// 0 pour ses données, lirait la mémoire basse à l'image suivante).
// Garde ebx, ecx, edx, esi et edi.
export function decoderUneImage(jeu, donnees, toile) {
  const T = jeu.T;
  T.sauver();
  const gardes = { ebx: T.R.ebx, ecx: T.R.ecx, edx: T.R.edx, esi: T.R.esi, edi: T.R.edi };
  poserLong(jeu, FLC_LECTURE, donnees);
  poserLong(jeu, FLC_TOILE, toile);
  let resultat;
  for (;;) {
    const type = lireUnBloc(jeu);
    if (type === BLOC_EN_TETE) { jeu.appeler(FLC_LIRE_L_EN_TETE); continue; }
    if (type === BLOC_IMAGE) {
      jeu.appeler(FLC_IMAGE);
      resultat = long(jeu, FLC_LECTURE);
    } else {
      resultat = 0;
    }
    break;
  }
  T.sauver();
  Object.assign(T.R, gardes);
  T.charger();
  return resultat | 0;
}

// 0x81F54 — le corps d'un bloc image : le nombre de sous-blocs (un mot), 8 octets réservés, puis
// chaque sous-bloc selon son type : 7 le delta par lignes (0x8203D), 0xF les plages (0x820DF), les
// autres — 4, la palette, compris — sautés (0x8202C).
// Routine en assembleur : elle laisse les registres comme les laissent ces trois-là, et son seul
// appelant (0x81EC9) les rétablit aussitôt.
export function decoderLeCorps(jeu) {
  const p = long(jeu, FLC_LECTURE);
  poserMot(jeu, FLC_SOUS_BLOCS, mot(jeu, p));
  poserLong(jeu, FLC_LECTURE, p + 2 + 8);
  while (mot(jeu, FLC_SOUS_BLOCS) !== 0) {
    poserMot(jeu, FLC_SOUS_BLOCS, mot(jeu, FLC_SOUS_BLOCS) - 1);
    const type = lireUnBloc(jeu);
    if (type === SOUS_BLOC_DELTA) jeu.appeler(FLC_DELTA);
    else if (type === SOUS_BLOC_PALETTE) jeu.appeler(FLC_SAUTER);
    else if (type === SOUS_BLOC_PLAGES) jeu.appeler(FLC_PLAGES);
    else jeu.appeler(FLC_SAUTER);
  }
}

// Les trois routines suivantes ne sont pas atteintes avec les données du CD : les deux animations
// (data/busted.anm, data/takover.anm) n'ont que des blocs image (0xF1FA), dont les sous-blocs sont
// tous des deltas (7). Elles sont en attente (`enAttente`). Routines en assembleur : elles laissent
// les registres comme l'original, et 0x81EC9 les rétablit.

// 0x82002 — le bloc d'en-tête (0xAF12) : après un mot (le nombre d'images), la largeur et la hauteur
// de la toile. La lecture reste derrière la hauteur, et non à la fin du bloc. eax garde la hauteur
// dans son mot bas, et, dans son mot haut, celui de la taille du bloc moins 6.
function lireLEnTeteDeLaToile(jeu, R) {
  let esi = (long(jeu, FLC_LECTURE) + 2) >>> 0;
  poserMot(jeu, FLC_LARGEUR, mot(jeu, esi));
  poserMot(jeu, FLC_HAUTEUR, mot(jeu, esi + 2));
  esi = (esi + 4) >>> 0;
  poserLong(jeu, FLC_LECTURE, esi);
  R.esi = esi | 0;
  R.eax = (((mot(jeu, FLC_TAILLE) - 6) & ~0xFFFF) | mot(jeu, FLC_HAUTEUR)) | 0;
}

// 0x8202C — sauter le sous-bloc lu : la lecture avance de sa taille moins les 6 octets déjà lus.
function sauterLeSousBloc(jeu, R) {
  const reste = (mot(jeu, FLC_TAILLE) - 6) | 0;
  poserLong(jeu, FLC_LECTURE, long(jeu, FLC_LECTURE) + reste);
  R.eax = reste;
}

// 0x820DF — le sous-bloc des plages (FLC « BRUN »). Pour chaque ligne de la toile, un octet ignoré
// (le nombre de paquets), puis des paquets jusqu'à couvrir la largeur : un compte signé ; positif,
// l'octet suivant répété autant de fois ; négatif, autant d'octets recopiés ; nul, 256 octets
// recopiés. Les lignes se suivent dans la toile, sans pas. La lecture avance ensuite de la taille du
// sous-bloc, quoi qu'on ait lu. Une hauteur nulle en ferait 65 536 lignes.
function decoderLesPlages(jeu, R) {
  const m8 = jeu.m8;
  const largeur = mot(jeu, FLC_LARGEUR);
  const reste = (mot(jeu, FLC_TAILLE) - 6) | 0;
  const debut = long(jeu, FLC_LECTURE) >>> 0;
  let edi = long(jeu, FLC_TOILE) >>> 0, esi = debut;
  let lignes = mot(jeu, FLC_HAUTEUR), cx = 0, dl = 0, dh = 0;
  do {
    esi = (esi + 1) >>> 0;
    cx = largeur;
    do {
      dl = m8[esi]; esi = (esi + 1) >>> 0;
      if (((dl << 24) >> 24) > 0) {
        cx = (cx - dl) & 0xFFFF;
        dh = m8[esi]; esi = (esi + 1) >>> 0;
        do { m8[edi] = dh; edi = (edi + 1) >>> 0; dl = (dl - 1) & 0xFF; } while (dl !== 0);
      } else {
        cx = (cx + (0xFF00 | dl)) & 0xFFFF;
        do { dh = m8[esi]; esi = (esi + 1) >>> 0; m8[edi] = dh; edi = (edi + 1) >>> 0; dl = (dl + 1) & 0xFF; } while (dl !== 0);
      }
    } while (cx !== 0);
    lignes = (lignes - 1) & 0xFFFF;
  } while (lignes !== 0);
  poserLong(jeu, FLC_LECTURE, (debut + reste) >>> 0);
  R.eax = reste;
  R.esi = (debut + reste) | 0;
  R.edi = edi | 0;
  R.ebx &= ~0xFFFF;
  R.ecx &= ~0xFFFF;
  R.edx = (R.edx & ~0xFFFF) | (dh << 8);
}

// 0x8203D — le sous-bloc delta par lignes (FLC « SS2 »). Un mot : le nombre de lignes décrites.
// Chaque ligne commence par des mots de commande : 11xxxxxx xxxxxxxx saute −n lignes ;
// 10xxxxxx pose l'octet bas au dernier pixel de la ligne ; sinon le mot est le nombre de paquets.
// Un paquet : un octet de pixels à sauter, puis un compte signé : positif, autant de paires de pixels
// recopiées ; négatif, une paire répétée −n fois (256 fois pour 0).
//
// ANOMALIE REPRODUITE : après le dernier pixel (10xxxxxx), le format veut encore un mot, le nombre
// de paquets ; l'original prend pour ce nombre le mot de commande lui-même (plus de 32 768 paquets).
// Les animations du jeu, de largeur paire, n'emploient pas cette commande (non vérifié pour toutes).
// Un nombre de lignes nul en ferait 65 536.
export function decoderUnDelta(jeu) {
  const largeur = mot(jeu, FLC_LARGEUR);
  let ecrit = long(jeu, FLC_TOILE);
  let lu = long(jeu, FLC_LECTURE);
  let lignes = mot(jeu, lu);
  lu += 2;
  do {
    let commande, debutDeLigne;
    for (;;) {
      commande = mot(jeu, lu);
      lu += 2;
      debutDeLigne = ecrit;
      if ((commande & 0x8000) === 0) break;
      if ((commande & 0x4000) !== 0) {
        ecrit = (ecrit + Math.imul(-s16(commande), largeur)) >>> 0;
        continue;
      }
      poserOctet(jeu, ecrit + largeur - 1, commande);
      break;
    }
    for (let paquets = commande; paquets !== 0; paquets = (paquets - 1) & 0xFFFF) {
      ecrit += octet(jeu, lu);
      const compte = s8(octet(jeu, lu + 1));
      lu += 2;
      if (compte > 0) {
        for (let n = 0; n < compte; n++, ecrit += 2, lu += 2) poserMot(jeu, ecrit, mot(jeu, lu));
      } else {
        const paire = mot(jeu, lu);
        lu += 2;
        const fois = 256 - (compte & 0xFF);
        for (let n = 0; n < fois; n++, ecrit += 2) poserMot(jeu, ecrit, paire);
      }
    }
    ecrit = (debutDeLigne + largeur) >>> 0;
    lignes = (lignes - 1) & 0xFFFF;
  } while (lignes !== 0);
  poserLong(jeu, FLC_LECTURE, lu);
}

// =================================================================================================

const TOUS_LES_REGISTRES = ['eax', 'ebx', 'ecx', 'edx', 'esi', 'edi', 'ebp', 'esp'];
const PILE_SEULE = ['ebp', 'esp'];

export const reecritures = [
  { adresse: 0x5C7D1, nom: 'jouerLaFinDePartie', fn: jouerLaFinDePartie, arguments: 1, memoire: 'entiere' },
  { adresse: 0x5B88D, nom: 'ouvrirLAnimation', fn: ouvrirLAnimation, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x5BD48, nom: 'lireLEnTete', fn: lireLEnTete, arguments: 4, retour: true, memoire: 'entiere' },
  { adresse: 0x5BE27, nom: 'imageSuivante', fn: imageSuivante, arguments: 0, retour: true, memoire: 'entiere' },
  { adresse: 0x5C6F4, nom: 'faireAvancer', fn: faireAvancer, arguments: 3, memoire: 'entiere' },
  { adresse: 0x5BBC6, nom: 'refermerLAnimation', fn: refermerLAnimation, arguments: 0, memoire: 'entiere' },
  { adresse: 0x7F1D0, nom: 'fondu', fn: fondu, arguments: 3, retour: true },
  { adresse: 0x87ED4, nom: 'lireLaPalette', fn: lireLaPalette, arguments: 1, registresCompares: TOUS_LES_REGISTRES },
  { adresse: 0x81EAC, nom: 'tailleDeLaToile', fn: tailleDeLaToile, arguments: 2, registresCompares: TOUS_LES_REGISTRES },
  { adresse: 0x81EC9, nom: 'decoderUneImage', fn: decoderUneImage, arguments: 2, retour: true, memoire: 'entiere',
    registresCompares: TOUS_LES_REGISTRES },
  { adresse: 0x81F54, nom: 'decoderLeCorps', fn: decoderLeCorps, arguments: 0, memoire: 'entiere',
    registresCompares: PILE_SEULE },
  { adresse: 0x8203D, nom: 'decoderUnDelta', fn: decoderUnDelta, arguments: 0, memoire: 'entiere',
    registresCompares: PILE_SEULE },
];

export const enAttente = [
  // Le décodeur des animations : des blocs que les animations du CD n'ont pas (voir plus haut).
  { adresse: 0x82002, nom: 'lireLEnTeteDeLaToile', fn: lireLEnTeteDeLaToile, convention: 'registres' },
  { adresse: 0x8202C, nom: 'sauterLeSousBloc', fn: sauterLeSousBloc, convention: 'registres' },
  { adresse: 0x820DF, nom: 'decoderLesPlages', fn: decoderLesPlages, convention: 'registres', memoire: 'entiere' },
];
