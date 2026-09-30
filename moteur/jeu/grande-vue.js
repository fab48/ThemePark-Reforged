// La grande vue (reglages.js) : la vue du parc sur une image plus grande que 640x480, au format de
// la fenêtre du navigateur, qui montre plus de cases du parc.
//
// Ce module n'est pas une réécriture : c'est un écart assumé avec le jeu d'origine. Il tient la
// GÉOMÉTRIE COURANTE de l'écran de la haute résolution, `ecran`, que lisent les réécritures là où le
// programme de 1994 écrivait 640 et 480 en dur (largeur, hauteur, pas d'une ligne, grille des
// blocs...). Tant que la grande vue n'est pas appliquée, `ecran` vaut exactement ces constantes :
// réglage éteint, le jeu est celui d'origine, et les vérificateurs le prouvent.
//
// OÙ ELLE S'APPLIQUE. Seulement dans la vue du parc en 640x480 : l'écran 0, et les quatre messages
// qui s'affichent par-dessus (0x4A, 0x54, 0x56, 0x64). Les écrans pleins — fiches, gestion, carte du
// parc, listes — repassent en 640x480 : leur code reste celui d'origine, et la page les montre à
// l'échelle. La boucle du parc (amorcage.js) appelle `entrerDansLaVueDuParc` au début de la routine
// de la vue du parc, `quitterLaVueDuParc` au début de celle d'un autre écran ; tout changement de
// mode vidéo (systeme.js, 0x7EC50 et 0x7ECF0) revient d'abord en 640x480.
//
// PASSER EN GRANDE VUE (appliquer) :
//  - la surface de dessin [0xDE5BC] et le fond [0xD3B98] sont pointés sur deux tampons de W x H,
//    au-delà des 64 Mo que voit le jeu : l'hôte de la page a une mémoire agrandie
//    (`Machine({ memoireEtendue })`, travailleur.js) ; les tampons d'origine restent dans le tas ;
//  - la grille des blocs de 32x16 (ecran.js, presentation.js) passe hors de la mémoire du jeu, elle
//    aussi, à ⌈W/32⌉ colonnes sur ⌈H/16⌉ rangées, toute marquée ;
//  - le pas d'une ligne [0xDE5B8] vaut W, la hauteur [0xDE5C0] H, la fenêtre de découpe du traceur
//    (0x87790) W x H ; la carte vidéo de l'hôte prend un mode W x H ;
//  - la table des zones de l'écran du parc (0xB93C3, interface-parc.js) est refaite : les bords et
//    la vue à la taille de l'écran, la barre d'outils et la barre des messages centrées en bas, les
//    icônes au coin haut droit. L'original est gardé et remis en sortant ;
//  - le pilote de souris est borné à l'écran entier, et la carte redemandée.
// EN SORTIR : le coin haut gauche 640x480 des deux grands tampons est recopié dans ceux d'origine
// (une fenêtre ouverte dans l'image, en coordonnées de 640x480, y est donc entière), puis tout ce qui
// précède est défait.
//
// LE ZOOM À LA MOLETTE (principal.js) : la page demande une autre taille, par crans ; la vue est
// réappliquée à cette taille comme pour tout changement de taille, et la caméra est décalée pour que
// la case sous le curseur du jeu y reste, à la case près (la caméra du jeu va par cases entières).
//
// Voir docs/architecture.md, « Les réglages : la grande vue ».

import { reglages } from './reglages.js';

const MODE_AFFICHAGE = 0xDE5F6;     // mot : 1 = 320x200, 8 = 640x480
const SURFACE = 0xDE5BC;            // pointeur : la surface de dessin
const FOND = 0xD3B98;               // pointeur : le tampon de fond
const PAS_LIGNE = 0xDE5B8;          // mot long : octets par ligne de la surface
const HAUTEUR_ECRAN = 0xDE5C0;      // mot long : lignes de l'écran
const BANQUE_MONTREE = 0xBECDC;     // mot : la banque VESA que le jeu croit montrée
const REDESSINER_CARTE = 0xD666E;   // mot
const CURSEUR_X = 0xBECAC, CURSEUR_Y = 0xBECAE;   // mots : le curseur du jeu
const BARRE_DES_MESSAGES_X = 0xD6612;  // mot : l'abscisse de la barre des messages (0 d'origine)
const ECRAN_COURANT = 0xD6652;      // mot : l'écran affiché
const ORIGINE_DESSIN_X = 0xD6624;   // mot signé : l'origine du dessin de la carte (etat.js)
const TAILLE_CARTE = 64;            // la caméra va de 0 à 63 en colonnes et en rangées (carte.js)
// La vue du parc, et les quatre messages qui s'y affichent par-dessus (amorcage.js).
export const ECRANS_DU_PARC = [0x00, 0x4A, 0x54, 0x56, 0x64];

const ZONES = 0xB93C3, TAILLE_ZONE = 12, NOMBRE_DE_ZONES = 31;
const GRILLE_D_ORIGINE = 0xD671D;
const MARQUER_ZONE_SALE = 0x54D38;   // (x, y, largeur, hauteur) : des blocs à restaurer et présenter

// Les zones de l'écran du parc (interface-parc.js) : les bords, la barre d'outils (4 à 15, et les
// réglages 16 à 21), les icônes du haut à droite, la vue, la barre des messages.
const BORD_HAUT = 0, BORD_DROIT = 1, BORD_BAS = 2, BORD_GAUCHE = 3;
const PREMIER_OUTIL = 4, DERNIER_REGLAGE = 21, PREMIERE_ICONE = 22, DERNIERE_ICONE = 28;
const VUE_DU_PARC = 29, BARRE_DES_MESSAGES = 30;

// Les tailles permises. W multiple de 32 et H de 16 : la grille des blocs tombe juste. Au plus
// 2560 x 1600 : la cadence (le jeu dessine plus de cases par image : docs/architecture.md, « Le zoom
// et l'interface »). La mosaïque du défilement fluide (4096 de côté, adressée modulo,
// moteur/web/defilement-fluide.js) n'a à tenir qu'une vue et un pas de la caméra autour d'elle.
export const LARGEUR_MAX = 2560, HAUTEUR_MAX = 1600;
export const LARGEUR_MIN = 640, HAUTEUR_MIN = 480;

// La mémoire hors du jeu : l'hôte de la page l'agrandit d'autant (travailleur.js).
export const DEBUT_HORS_DU_JEU = 64 << 20;           // TAILLE_MEMOIRE de machine.js
const TAILLE_TAMPON = LARGEUR_MAX * HAUTEUR_MAX;
const GRANDE_SURFACE = DEBUT_HORS_DU_JEU;
const GRAND_FOND = GRANDE_SURFACE + TAILLE_TAMPON;
const GRANDE_GRILLE = GRAND_FOND + TAILLE_TAMPON;
const TAILLE_GRILLE = (LARGEUR_MAX / 32) * (HAUTEUR_MAX / 16) * 2;
export const MEMOIRE_ETENDUE = 2 * TAILLE_TAMPON + TAILLE_GRILLE + 0x10000;

// La géométrie courante de l'écran de la haute résolution. Les valeurs d'origine tant que la grande
// vue n'est pas appliquée.
//   largeur, hauteur : l'écran (et le pas d'une ligne de la surface) ;
//   grille, colonnes, rangees, pasRangee : la grille des blocs de 32x16 (ecran.js) ;
//   barreX : le décalage de la barre d'outils et de la barre des messages, centrées en bas ;
//   grande : la grande vue est appliquée.
export const ecran = {
  largeur: 640, hauteur: 480,
  grille: GRILLE_D_ORIGINE, colonnes: 20, rangees: 30, pasRangee: 40,
  barreX: 0,
  grande: false,
};

// Le bord droit d'où part le dessin de la carte (dessin-carte.js, parcourirLaVue), pour des tuiles
// de largeur L. Le programme de 1994 y écrit 640 en dur, et place les cases à partir de ce bord ;
// tout ce qui vise une case (la case sous le pointeur et l'aperçu de l'outil, interface-parc.js ;
// le coin où le tracé colle le curseur, souris-jeu.js...) la place, lui, à partir de l'origine du
// dessin [0xD6624] : les deux grilles gardent l'écart de (640 − origine) modulo L, 4 pixels (le sol
// est tracé 4 pixels à droite de la case visée : dessin-carte.js). Partir du bord de la grande vue,
// W, changeait cet écart en (W − origine) modulo L : 12 pixels à 1152 ou 1344 de large, une demi-case,
// 20 à 896, et le sol n'était plus sous l'aperçu ni sous la case cliquée (docs/demandes.md,
// retour 19). Le dessin part donc du premier bord, au bord de l'écran ou juste au-delà, qui garde
// avec l'origine l'écart d'origine : W + ((640 − W) modulo L). Hors de la grande vue, 640.
export function bordDuDessin(L, W = ecran.largeur) {
  return L > 0 ? W + ((((640 - W) % L) + L) % L) : W;
}

// La taille voulue, que la page donne d'après sa fenêtre et le zoom (travailleur.js,
// `demanderLaTaille`) ; `ancrer` : c'est le zoom, la case sous le curseur doit rester sous le curseur ;
// `cible` : où sera le curseur ; `vue` : où sera la vue, par rapport à celle d'avant (le zoom continu
// de la page, moteur/web/zoom.js : voir preparerLAncrage).
const voulue = { largeur: 1280, hauteur: 720, ancrer: false, cible: null, vue: null };

// Ramener une taille demandée aux tailles permises.
export function tailleDeLaGrandeVue(largeur, hauteur) {
  const l = Math.max(LARGEUR_MIN, Math.min(LARGEUR_MAX, Math.round(largeur / 32) * 32));
  const h = Math.max(HAUTEUR_MIN, Math.min(HAUTEUR_MAX, Math.round(hauteur / 16) * 16));
  return { largeur: l, hauteur: h };
}

export function demanderLaTaille(largeur, hauteur, ancrer = false, cible = null, vue = null) {
  Object.assign(voulue, tailleDeLaGrandeVue(largeur, hauteur),
    { ancrer, cible: ancrer ? cible : null, vue: ancrer ? vue : null });
}

// Ce qui a été changé en entrant, pour le défaire en sortant.
let avant = null;

const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);

// La grande vue est-elle possible : le réglage, le mode 640x480, et la mémoire hors du jeu.
function possible(jeu) {
  return reglages.grandeVue && jeu.dv.getUint16(MODE_AFFICHAGE, true) === 8
    && jeu.m8.length >= DEBUT_HORS_DU_JEU + MEMOIRE_ETENDUE;
}

// La taille de la vue du parc, pour cadrer la caméra : celle de la grande vue quand elle est appliquée
// ou le sera au retour dans le parc (depuis un écran plein : la carte du parc, une fiche qui amène
// la vue sur un objet...), sinon 640x480.
export function largeurDeLaVue(jeu) {
  if (ecran.grande) return ecran.largeur;
  return possible(jeu) ? voulue.largeur : 640;
}
export function hauteurDeLaVue(jeu) {
  if (ecran.grande) return ecran.hauteur;
  return possible(jeu) ? voulue.hauteur : 480;
}

// Au début de la routine de la vue du parc, à chaque image (amorcage.js).
export function entrerDansLaVueDuParc(jeu) {
  if (!possible(jeu)) {
    if (ecran.grande) quitter(jeu);
    return;
  }
  if (ecran.grande && ecran.largeur === voulue.largeur && ecran.hauteur === voulue.hauteur) return;
  let ancrage = null;
  if (ecran.grande) {
    if (voulue.ancrer) ancrage = preparerLAncrage(jeu, voulue.largeur, voulue.hauteur, voulue.cible, voulue.vue);
    quitter(jeu);
  }
  voulue.ancrer = false;
  voulue.cible = null;
  voulue.vue = null;
  appliquer(jeu, voulue.largeur, voulue.hauteur);
  if (ancrage) ancrage();
}

// Le zoom : la caméra et le curseur pour que le point du parc sous le curseur y reste, quand l'écran
// passe de W0 x H0 à W1 x H1. Le curseur garde sa place dans l'image (la page l'agrandit au même
// cadre) : de (sx, sy) il passe à (sx·W1/W0, sy·H1/H0). La projection de la carte (vue-fluide.js,
// dessin-carte.js) place le coin haut gauche de la vue, dans le plan du monde, en
//     X = C·L + R·⌊L/3⌋ − d(W),   d(W) = B − ⌊(B − origineDessinX) / L⌋·L,   Y = R·H
// pour la caméra (colonne C, rangée R), des tuiles de L x H et B le bord du dessin pour la largeur W
// (bordDuDessin). On veut X1 + sx1 = X0 + sx et
// Y1 + sy1 = Y0 + sy : R d'abord, puis C, arrondis à la case et bornés à la carte. Rend la
// fonction qui les pose une fois la nouvelle taille appliquée, ou null : pas dans la vue du parc
// elle-même (un message par-dessus), ou pendant un cadrage imposé par le jeu (0xBA0F8).
// `cible` : la page, qui compose l'interface à part (moteur/web/zoom.js), dit elle-même où sera le
// curseur dans la nouvelle image (le pointeur ne bouge pas à l'écran, le parc change d'échelle).
// `vue` : la page, qui montre le parc à son propre niveau (le zoom continu, zoom.js), dit où sera la
// vue : son décalage { x, y } par rapport à la vue d'avant, en pixels du monde (compté depuis la
// caméra d'ici : un pas de défilement entre la demande et l'ancrage est gardé). La caméra y va, à la
// case près, et le curseur garde son pixel du monde, exactement (le point du parc sous le pointeur de
// la page, qui y reste), à moins que `cible` ne dise où il sera (sur l'interface, qui suit son bord).
function preparerLAncrage(jeu, W1, H1, cible = null, vue = null) {
  const e = jeu.etat;
  if (mot(jeu, ECRAN_COURANT) !== 0 || e.centrerCameraSurCarte >= 0) return null;
  const L = e.largeurTuile, T = e.hauteurTuile;
  if (!L || !T) return null;
  const W0 = ecran.largeur, H0 = ecran.hauteur;
  const sx = motSigne(jeu, CURSEUR_X), sy = motSigne(jeu, CURSEUR_Y);
  const origine = motSigne(jeu, ORIGINE_DESSIN_X);
  const d = (W) => {
    const B = bordDuDessin(L, W);
    return B - Math.trunc((B - origine) / L) * L;
  };
  const biais = Math.trunc(L / 3);
  const X0 = e.cameraColonne * L + e.cameraRangee * biais - d(W0), Y0 = e.cameraRangee * T;
  let sx1, sy1, X1, Y1;
  if (vue) {
    X1 = X0 + vue.x; Y1 = Y0 + vue.y;
  } else {
    sx1 = Math.max(1, Math.min(W1 - 2, cible ? cible.x : Math.round(sx * W1 / W0)));
    sy1 = Math.max(1, Math.min(H1 - 2, cible ? cible.y : Math.round(sy * H1 / H0)));
    X1 = X0 + sx - sx1; Y1 = Y0 + sy - sy1;
  }
  const borner = (v) => Math.max(0, Math.min(TAILLE_CARTE - 1, v));
  const R = borner(Math.round(Y1 / T));
  const C = borner(Math.round((X1 + d(W1) - R * biais) / L));
  if (vue) {
    // la vue posée par la caméra, et le curseur sur son pixel du monde (ou là où la page le veut)
    const Xa = C * L + R * biais - d(W1), Ya = R * T;
    sx1 = Math.max(1, Math.min(W1 - 2, cible ? cible.x : X0 + sx - Xa));
    sy1 = Math.max(1, Math.min(H1 - 2, cible ? cible.y : Y0 + sy - Ya));
  }
  return () => {
    e.cameraColonne = C;
    e.cameraRangee = R;
    poserMot(jeu, REDESSINER_CARTE, 1);
    // le pointeur du pilote et le curseur du jeu, ensemble (0x11191, souris-jeu.js)
    jeu.appeler(0x11191, sx1, sy1);
  };
}

// Au début de la routine d'un autre écran (amorcage.js), et avant tout changement de mode vidéo
// (systeme.js).
export function quitterLaVueDuParc(jeu) {
  if (ecran.grande) quitter(jeu);
}

function appliquer(jeu, largeur, hauteur) {
  const m8 = jeu.m8;
  avant = {
    surface: long(jeu, SURFACE), fond: long(jeu, FOND),
    zones: m8.slice(ZONES, ZONES + NOMBRE_DE_ZONES * TAILLE_ZONE),
    barreDesMessagesX: mot(jeu, BARRE_DES_MESSAGES_X),
  };
  m8.fill(0, GRANDE_SURFACE, GRANDE_SURFACE + largeur * hauteur);
  m8.fill(0, GRAND_FOND, GRAND_FOND + largeur * hauteur);
  poserLong(jeu, SURFACE, GRANDE_SURFACE);
  poserLong(jeu, FOND, GRAND_FOND);

  Object.assign(ecran, {
    largeur, hauteur,
    grille: GRANDE_GRILLE, colonnes: largeur / 32, rangees: hauteur / 16, pasRangee: largeur / 16,
    barreX: ((largeur - 640) >> 1) & ~1,
    grande: true,
  });
  poserGeometrie(jeu);
  // Toute la grille marquée : le fond sera restauré et l'image présentée en entier.
  m8.fill(3, GRANDE_GRILLE, GRANDE_GRILLE + ecran.rangees * ecran.pasRangee);
  poserLesZones(jeu);
  poserMot(jeu, BARRE_DES_MESSAGES_X, ecran.barreX);
  poserMot(jeu, REDESSINER_CARTE, 1);
}

function quitter(jeu) {
  const m8 = jeu.m8;
  const { largeur } = ecran;
  // Le coin haut gauche des grands tampons, là où le jeu dessine ce qui est en coordonnées de
  // 640x480 (une fenêtre qu'on vient d'ouvrir), passe dans les tampons d'origine.
  for (const [grand, petit] of [[GRANDE_SURFACE, avant.surface], [GRAND_FOND, avant.fond]]) {
    for (let y = 0; y < 480; y++) m8.copyWithin(petit + 640 * y, grand + largeur * y, grand + largeur * y + 640);
  }
  const rendre = (p) => (p === GRANDE_SURFACE ? avant.surface : p === GRAND_FOND ? avant.fond : p);
  poserLong(jeu, SURFACE, rendre(long(jeu, SURFACE)));
  poserLong(jeu, FOND, rendre(long(jeu, FOND)));

  Object.assign(ecran, {
    largeur: 640, hauteur: 480,
    grille: GRILLE_D_ORIGINE, colonnes: 20, rangees: 30, pasRangee: 40,
    barreX: 0,
    grande: false,
  });
  poserGeometrie(jeu);
  m8.fill(3, GRILLE_D_ORIGINE, GRILLE_D_ORIGINE + 30 * 40);
  m8.set(avant.zones, ZONES);
  poserMot(jeu, BARRE_DES_MESSAGES_X, avant.barreDesMessagesX);
  avant = null;
  // Revenu en 640x480 dans la vue du parc (réglage éteint, taille changée) : le fond recopié n'a pas
  // la barre d'outils à sa place, la carte est à redessiner, et la barre avec elle (dessin-carte.js).
  // Pour une fenêtre qui s'ouvre, non : son décor est dans le fond, et sa fermeture redemande la carte.
  if (ECRANS_DU_PARC.includes(mot(jeu, ECRAN_COURANT))) poserMot(jeu, REDESSINER_CARTE, 1);
}

// LES DIALOGUES AU CENTRE. La boîte à question (0x78F89, dialogues.js) est la seule chose que le
// jeu dessine par-dessus le parc en coordonnées de 640x480 : les écrans 0x4A (« démolir ? »,
// 0x78B7E), 0x54 (le bus, 0x78CEF), 0x56 (un message : le manque d'argent, le code de triche) et
// 0x64 (la faillite) l'appellent à chaque image depuis la boucle du parc, et la question modale
// 0x78E36 (Alt+Échap « QUITTER ? », les confirmations des menus) dans sa propre boucle. Les
// fenêtres (0x35F21) mènent toutes à un écran plein, ou ne s'ouvrent pas dans le parc (l'écran
// titre, la fin d'année). En grande vue, la boîte serait dans le coin haut gauche : elle est
// dessinée au centre de l'image, sans toucher à son code.
//
// La méthode : un échange de pixels plutôt qu'un décalage du repère. Le coin haut gauche 640x480
// de la surface est mis de côté, le carré 640x480 du centre recopié à sa place, la boîte dessinée
// par-dessus, en coordonnées d'origine, puis ce carré repart au centre et le coin est rendu. Le
// curseur du jeu (0xBECAC, 0xBECAE), que la boîte lit pour ses boutons, est ramené dans le même
// repère le temps du dessin. Ni la surface, ni la grille des blocs, ni la fenêtre de découpe ne
// changent : toutes les routines que la boîte appelle (panneaux, textes, traceur) écrivent là où
// elles écrivaient déjà. Ces images sont présentées en entier (la boucle du parc lève 0xD6BCD pour
// ces écrans, 0x78E36 est un écran plein) ; la grille des blocs sert seulement à la restauration du
// fond : les blocs du centre y sont marqués.
const MILIEU = { avant: new Uint8Array(640 * 480), boite: new Uint8Array(640 * 480) };
export function auCentreDeLaGrandeVue(jeu, dessiner) {
  if (!ecran.grande || long(jeu, SURFACE) !== GRANDE_SURFACE) return dessiner();
  const W = ecran.largeur;
  const dx = (W - 640) >> 1, dy = (ecran.hauteur - 480) >> 1;
  if (dx === 0 && dy === 0) return dessiner();
  dialogueAuCentre = true;           // pour la page : une région de l'interface (regionsDeLInterface)
  const m8 = jeu.m8;
  const coin = GRANDE_SURFACE, centre = GRANDE_SURFACE + dy * W + dx;
  const { avant: garde, boite } = MILIEU;
  for (let y = 0; y < 480; y++) garde.set(m8.subarray(coin + y * W, coin + y * W + 640), y * 640);
  // Rangées croissantes : la rangée y du coin ne recouvre que des rangées du centre déjà lues.
  for (let y = 0; y < 480; y++) m8.copyWithin(coin + y * W, centre + y * W, centre + y * W + 640);
  const sx = motSigne(jeu, CURSEUR_X), sy = motSigne(jeu, CURSEUR_Y);
  poserMot(jeu, CURSEUR_X, sx - dx);
  poserMot(jeu, CURSEUR_Y, sy - dy);
  try {
    return dessiner();
  } finally {
    // Le gestionnaire de souris a pu reposer le curseur entre-temps (une position absolue) : il
    // est alors gardé tel quel.
    if (motSigne(jeu, CURSEUR_X) === sx - dx) poserMot(jeu, CURSEUR_X, sx);
    if (motSigne(jeu, CURSEUR_Y) === sy - dy) poserMot(jeu, CURSEUR_Y, sy);
    for (let y = 0; y < 480; y++) boite.set(m8.subarray(coin + y * W, coin + y * W + 640), y * 640);
    for (let y = 0; y < 480; y++) m8.set(garde.subarray(y * 640, y * 640 + 640), coin + y * W);
    for (let y = 0; y < 480; y++) m8.set(boite.subarray(y * 640, y * 640 + 640), centre + y * W);
    // Les blocs du centre, où est maintenant la boîte, à restaurer depuis le fond à l'image
    // suivante (0x54D38, ecran.js) : sinon, la carte n'y redessinant que les blocs marqués, la
    // boîte y resterait après sa fermeture, par morceaux.
    jeu.appeler(MARQUER_ZONE_SALE, dx, dy, 640, 480);
  }
}

// Le pas d'une ligne, la hauteur, la fenêtre de découpe, la carte vidéo et la souris, à la
// géométrie courante. Ce que 0x7ECF0 pose au passage en 640x480.
function poserGeometrie(jeu) {
  const { largeur, hauteur } = ecran;
  poserLong(jeu, PAS_LIGNE, largeur);
  poserLong(jeu, HAUTEUR_ECRAN, hauteur);
  jeu.appeler(0x87790, 0, 0, largeur, hauteur);
  jeu.machine.video.changerModeLibre(largeur, hauteur);
  poserMot(jeu, BANQUE_MONTREE, 0);
  // Le pilote de souris borné à tout l'écran (0x11303 en tire les bornes de `ecran`), et le curseur
  // ramené dans l'écran.
  jeu.appeler(0x11303, 0, largeur, 0, hauteur);
  if (motSigne(jeu, CURSEUR_X) > largeur - 2) poserMot(jeu, CURSEUR_X, largeur - 2);
  if (motSigne(jeu, CURSEUR_Y) > hauteur - 2) poserMot(jeu, CURSEUR_Y, hauteur - 2);
}

// La table des zones de la grande vue, depuis celle d'origine (gardée dans `avant.zones`) : x0, y0,
// x1, y1 en mots signés, à +0, +2, +4, +6 de chaque zone.
function poserLesZones(jeu) {
  const { largeur: W, hauteur: H, barreX } = ecran;
  const origine = new DataView(avant.zones.buffer, avant.zones.byteOffset, avant.zones.length);
  const lire = (z, k) => origine.getInt16(z * TAILLE_ZONE + k, true);
  const poser = (z, x0, y0, x1, y1) => {
    const a = ZONES + z * TAILLE_ZONE;
    poserMot(jeu, a, x0); poserMot(jeu, a + 2, y0); poserMot(jeu, a + 4, x1); poserMot(jeu, a + 6, y1);
  };
  const decaler = (z, dx, dy) => poser(z, lire(z, 0) + dx, lire(z, 2) + dy, lire(z, 4) + dx, lire(z, 6) + dy);
  const dW = W - 640, dH = H - 480;
  poser(BORD_HAUT, 0, 0, W, 2);
  poser(BORD_DROIT, W - 2, 0, W + 2, H);
  poser(BORD_BAS, 0, H - 2, W, H + 2);
  poser(BORD_GAUCHE, 0, 0, 2, H);
  for (let z = PREMIER_OUTIL; z <= DERNIER_REGLAGE; z++) decaler(z, barreX, dH);
  for (let z = PREMIERE_ICONE; z <= DERNIERE_ICONE; z++) decaler(z, dW, 0);
  poser(VUE_DU_PARC, lire(VUE_DU_PARC, 0), lire(VUE_DU_PARC, 2), lire(VUE_DU_PARC, 4) + dW, lire(VUE_DU_PARC, 6) + dH);
  poser(BARRE_DES_MESSAGES, lire(BARRE_DES_MESSAGES, 0), lire(BARRE_DES_MESSAGES, 2),
    lire(BARRE_DES_MESSAGES, 4) + dW, lire(BARRE_DES_MESSAGES, 6));
}

// L'INTERFACE, POUR LA PAGE (le zoom, moteur/web/zoom.js). La page montre le parc à l'échelle du
// cran de zoom, et l'interface à une échelle fixe : il lui faut savoir où le jeu vient de tracer
// chaque morceau d'interface, et à quoi il s'accroche. Relevé en lecture seule, à chaque image
// publiée (vue-fluide.js) : une liste de rectangles de l'écran, du dessus au dessous, chacun
//   [genre, x0, y0, x1, y1, étendre]
// genre : HAUT_GAUCHE (la date, la barre de menus et ses menus), HAUT_DROIT (les icônes du coin),
// BAS (le panneau de commande, la barre d'outils et la barre des messages, accrochés au milieu de
// la barre d'outils), CENTRE (la boîte à question, auCentreDeLaGrandeVue), FENETRE (un catalogue
// surgissant, accroché comme le bas, puis ramené dans le cadre). étendre : 1, la bande fait toute la
// largeur de l'écran (le panneau, la barre de menus) : la page la prolonge par sa dernière colonne.
// Le rectangle est un maximum : la page n'en prend que ce qui diffère de la vue du parc seule.
export const GENRES = { HAUT_GAUCHE: 1, HAUT_DROIT: 2, BAS: 3, CENTRE: 4, FENETRE: 5 };
let dialogueAuCentre = false;        // levé par auCentreDeLaGrandeVue, baissé à chaque relevé

const BARRE_DE_MENUS = 0xB14D2;      // mot signé : −1, pas de barre
const MENU_DEROULE = 0xB14D4;        // mot signé : −1, aucun menu déroulé
const MENUS = 0xB53C6, TAILLE_MENU = 0x354, TAILLE_LIGNE_DE_MENU = 0x15;
const HAUTEUR_LIGNE_DE_MENU = 0xD6620;
const HAUT_DE_LA_VUE = 0xB9531;      // mot signé : sous la barre de menus ; au-dessus, le pointeur l'ouvre
const CATALOGUES = 0xD6BCE, TAILLE_CATALOGUE = 0x24F;
const CATALOGUE_DU_FOND = 0xB14BB;   // mot signé : le premier dessiné (−1 : aucun) ; +0x24B le suivant
const PANNEAU_Y = 0xB93F5;           // mot : le haut de la barre d'outils ; le panneau part 4 lignes plus haut

export function regionsDeLInterface(jeu) {
  const regions = [];
  const dialogue = dialogueAuCentre;
  dialogueAuCentre = false;
  if (!ecran.grande) return regions;
  const W = ecran.largeur, H = ecran.hauteur;
  const r = (genre, x0, y0, x1, y1, etendre = 0) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
    if (x1 > x0 && y1 > y0) regions.push([genre, x0, y0, x1, y1, etendre]);
  };
  const { HAUT_GAUCHE, HAUT_DROIT, BAS, CENTRE, FENETRE } = GENRES;
  if (dialogue) r(CENTRE, (W - 640) >> 1, (H - 480) >> 1, ((W - 640) >> 1) + 640, ((H - 480) >> 1) + 480);
  // Les catalogues, du devant au fond (la liste va du fond au devant).
  const catalogues = [];
  for (let i = motSigne(jeu, CATALOGUE_DU_FOND), n = 0; i >= 0 && i < 5 && n < 5; n++) {
    const c = CATALOGUES + i * TAILLE_CATALOGUE;
    // (quelques pixels de marge : l'ombre de la fenêtre déborde de son rectangle)
    catalogues.unshift([FENETRE, motSigne(jeu, c) - 4, motSigne(jeu, c + 2) - 4,
      motSigne(jeu, c) + motSigne(jeu, c + 4) + 6, motSigne(jeu, c + 2) + motSigne(jeu, c + 6) + 6]);
    i = motSigne(jeu, c + 0x24B);
  }
  for (const c of catalogues) r(...c);
  // Les menus déroulés (boucle.js, 0x50651), puis les icônes du coin haut droit (les zones 22 à 28,
  // déjà poussées au bord : poserLesZones ; elles ne sont pas dessinées sous la barre de menus), puis
  // la barre de menus ; sans barre, le haut de l'écran (une rangée d'images quand le pointeur y entre,
  // 0x4E2DB) et la date, au coin.
  const barre = motSigne(jeu, BARRE_DE_MENUS) !== -1;
  if (barre) {
    for (let k = motSigne(jeu, MENU_DEROULE), n = 0; k >= 0 && n < 8; n++) {
      const menu = MENUS + TAILLE_MENU * k;
      r(HAUT_GAUCHE, motSigne(jeu, menu) - 2, motSigne(jeu, menu + 2) - 2, motSigne(jeu, menu + 4) + 3, motSigne(jeu, menu + 6) + 3);
      const allumee = motSigne(jeu, menu + 0xA);
      if (allumee < 0) break;
      k = motSigne(jeu, menu + 0xC + TAILLE_LIGNE_DE_MENU * allumee);
    }
  }
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let z = PREMIERE_ICONE; z <= DERNIERE_ICONE; z++) {
    const a = ZONES + z * TAILLE_ZONE;
    x0 = Math.min(x0, motSigne(jeu, a)); y0 = Math.min(y0, motSigne(jeu, a + 2));
    x1 = Math.max(x1, motSigne(jeu, a + 4)); y1 = Math.max(y1, motSigne(jeu, a + 6));
  }
  r(HAUT_DROIT, x0 - 2, 0, x1 + 2, y1 + 2);
  // (la bande du haut s'arrête aux icônes : prolongée, c'est sa dernière colonne qui se répète, et
  // son bout droit est montré avec les icônes)
  const finDeLaBande = Math.min(W, x0 - 2);
  if (barre) {
    r(HAUT_GAUCHE, 0, 0, finDeLaBande, 2 * mot(jeu, HAUTEUR_LIGNE_DE_MENU) + 4, 1);
  } else if (motSigne(jeu, CURSEUR_Y) < motSigne(jeu, HAUT_DE_LA_VUE)) {
    r(HAUT_GAUCHE, 0, 0, finDeLaBande, Math.max(12, motSigne(jeu, HAUT_DE_LA_VUE)), 1);
  } else {
    r(HAUT_GAUCHE, 0, 0, 40, 12);
  }
  // Le bas : la barre des messages et sa bulle au-dessus de la barre d'outils, puis le panneau.
  const panneau = motSigne(jeu, PANNEAU_Y) - 4;
  r(BAS, ecran.barreX, H - 0x50, ecran.barreX + 640, panneau);
  r(BAS, 0, panneau, W, H, 1);
  return regions;
}
