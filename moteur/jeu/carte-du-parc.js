// La carte du parc (l'écran 0x12), le relevé de banque (l'écran 0x40), la question « démolir ? »
// (l'écran 0x4A), celle du bus (l'écran 0x54) et l'effacement d'une file d'attente.
//
// Réécriture lisible de 0x40641, 0x3F975, 0x1F53E, 0x77A55, 0x77B08, 0x78B7E, 0x78CEF et 0x2BCEE.
// Voir docs/guide-reecriture.md.
//
// LA CARTE DU PARC — le bouton de la carte dans la barre d'outils (zone 10, construire.js) appelle
// 0x40641, qui prépare le fond, puis ouvre l'écran 0x12 ; la boucle du parc appelle alors 0x3F975 à
// chaque image. Le fond (data/mmap-0.dat) reçoit une vignette du terrain : chaque case de la grille
// de 64 x 64 y devient un petit rectangle de la couleur de son sol (l'octet +2 de la table des sols
// 0xB44D9). Par-dessus, à chaque image, 0x3F975 dessine en réduction tout ce qui est posé (les
// objets du parc, par leur routine de vue réduite, [0xD667C] = 8), le nom du parc, et le cadre
// pointillé qui montre la partie du parc que couvre la vue. Un clic dans la vignette y porte la vue
// et ferme la carte ; hors de la vignette, la carte reste ouverte (le bouton de la barre d'outils,
// dessinée par 0x4DE1A, la referme).
//
// Les dimensions : une case de la vignette mesure [0xD663A] / [0xD6640] de large et
// [0xD6654] / [0xD6642] de haut, 8 x 4 pixels dans les deux résolutions (diviseurs 6 et 8 en
// 320x200, 3 et 4 en 640x480) ; la vignette commence en (0x40, 0x4C).
//
// 0x1F53E dessine en réduction un morceau de voie (objet de type 0x12) : son pilier, un point
// tous les 4 pixels de sa hauteur, puis la forme de la voie au sommet.
//
// LE RELEVÉ DE BANQUE — le clic droit sur l'argent (souris-jeu.js) appelle 0x77A55, qui charge son
// fond (data/mstate-0.dat) et sa palette (data/mstap-0.dat) et ouvre l'écran 0x40 ; la boucle du parc
// appelle alors 0x77B08 à chaque image. La mise en page est une table de 11 octets par élément, en
// 0xBE511, finie par un genre nul : +0 le genre, +1 x, +3 y, +5 largeur, +7 hauteur, +9 un texte.
// Genres : 1 le nom du parc, 2 un texte, 3 les lignes du relevé (les quatre éléments suivants en
// donnent les colonnes : libellé, débit, crédit, solde), 8 le solde final ; les autres ne se dessinent
// pas (4 à 7 les colonnes, 9 le bouton de sortie, l'élément 9, en 0xBE575).
//
// LA QUESTION « DÉMOLIR ? » — l'écran 0x4A, ouvert quand on démolit une attraction ou une boutique
// (0x205D7, construire.js), affiché par-dessus la vue du parc : 0x78B7E pose la question (0x78F89,
// dialogues.js) avec le nom de l'objet pour titre et, pour texte, le texte 0x11B de la table des noms
// ([[0xD7BD0] + 0x46C]) où s'inscrit la valeur de l'objet — ou, si son mot +0x38 n'est pas nul, le
// texte 0x11C ([[0xD7BD0] + 0x470]). Oui démolit (0x31748 une attraction, 0x35C4A une boutique).
//
// LA QUESTION DU BUS — l'écran 0x54, voisine de « démolir ? » dans le programme : 0x78CEF propose
// le modèle de bus suivant (voir `ecranDuBus`).
//
// L'EFFACEMENT D'UNE FILE — 0x2BCEE, appelée par l'outil de démolition (0x205D7) et par 0x193FD sur
// une case de file d'attente (drapeau 8 du sol). Voir `effacerUneFile`.
//
// VÉRIFICATION : docs/retro-ingenierie.md, § 11.18 (et § 10.6 pour l'écran du bus) ; les 644
// réécritures, installées ensemble, sont IDENTIQUES au rejeu empoisonné sur les trente-quatre
// scénarios (docs/guide-reecriture.md).

import { dansLeCadre } from './cadre.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';

const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
// `idiv` : division entière signée, tronquée vers zéro. Une division par zéro arrêtait le programme
// d'origine : elle arrête aussi la réécriture.
function idiv(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}

const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// --- les variables du jeu ----------------------------------------------------------------------
const MODE = 0xDE5F6;               // mot : 1 = 320x200, 8 = 640x480
const SURFACE = 0xDE5BC;            // pointeur : l'image en construction
const FOND = 0xD3B98;               // pointeur : le tampon de fond
const PALETTE = 0xD3B8C;            // pointeur : la palette courante
const PALETTE_DE_L_ECRAN = 0xCEBE0; // la palette des écrans pleins, chargée avec leur fond
const CURSEURS = 0xD3B84;           // pointeur : les images du pointeur ; +0 la flèche
const ECRAN = 0xD6652;              // mot : l'écran ouvert (0 le parc)
const ECRAN_PRECEDENT = 0xD660E;    // mot : l'écran où revenir
const RETOUR_DES_ECRANS = 0xB9EDA;  // octet : le même, pour 0x1B23A
const REDESSINER_CARTE = 0xD666E;   // mot : il faut refaire le fond de la vue du parc
const FACON_DE_DESSINER = 0xD667C;  // mot : 8 la vue réduite (objets.js)
const DIVISEUR_LARGEUR = 0xD6640;   // mot : la réduction en largeur de la vue réduite
const DIVISEUR_HAUTEUR = 0xD6642;   // mot : la réduction en hauteur
const LARGEUR_TUILE = 0xD663A;      // mot : 48 ou 24
const HAUTEUR_TUILE = 0xD6654;      // mot : 32 ou 16
const CAMERA_COLONNE = 0xD667A;     // mot signé : la colonne de la vue du parc
const CAMERA_RANGEE = 0xD6666;      // mot signé : sa rangée
const COMPTES = 0xD3814;            // pointeur : les comptes du joueur ; +0x20 le nom du parc
const NIVEAU_DU_FONDU = 0xD380C;    // mot long (boucle.js)
const PAS_DU_FONDU = 0xD777F;       // octet (boucle.js)
const CLIGNOTEMENT = 0xD77CE;       // octet : compteur des pointillés, avancé à chaque point
const IMAGE_DU_BOUTON = 0xD779F;    // octet : l'animation d'un bouton pressé (construire.js)
const TEXTES = 0xD7BC0;             // pointeur : table de pointeurs de textes
const NOMS = 0xD7BD0;               // pointeur : les noms (objets, messages)
const NOMS_DES_MOIS = 0xD7B90;      // pointeur : 4 octets par mois
const LIBELLES_DU_RELEVE = 0xD7BB0; // pointeur : le libellé de chaque sorte d'écriture
const TOUCHE = 0xDE688;             // octet : le code de balayage de la touche de l'image
const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;           // mots signés : le pointeur
const DROIT_APPUI = 0xDE5A4, GAUCHE_APPUI = 0xDE5A6;    // mots : l'appui, à remettre à zéro
const DROIT_TENU = 0xDE5AA, GAUCHE_TENU = 0xDE5AC;      // mots : le bouton maintenu

// La grille et les objets du parc.
const CARTE = 0xD3B08;              // pointeur : 64 x 64 cellules de 4 octets ; +0 mot le premier
                                    // objet posé (négatif : un décor fixe), +2 octet l'image du sol
const OBJETS = 0xD3B10;             // pointeur : les objets du parc, 0xC8 octets, numérotés dès 1
const TAILLE_OBJET = 0xC8;
const OBJETS_GRAPHIQUES = 0xD3B80;  // pointeur : 8 octets par objet graphique ; +6 le suivant
const FIGURES = 0xD3B38;            // pointeur : table de mots, figure → objet graphique
const FIGURES_DES_DECORS = 0xB44C1; // mot par décor fixe (numéro négatif) : sa figure
const COTE = 64;                    // cases par côté de la grille

// Les images de sol : 4 octets chacune ; +0 mot les drapeaux, +2 octet la couleur de la case sur la
// carte du parc, +3 octet la forme.
const SOLS = 0xB44D9;
const COULEURS_DES_SOLS = 0xB44DB;
const FORMES_DES_SOLS = 0xB44DC;
const FILE_D_ATTENTE = 8;           // drapeau : une file d'attente (images 121 à 133)
const A_PART = 0x40;                // drapeau : raccordée par les côtés seulement (132 et 133)

// Les couleurs du cache de 0x12452 (divers.js).
const COULEUR_VOIE_1 = 0xD7776, COULEUR_VOIE_2 = 0xD7784, COULEUR_VOIE_3 = 0xD777E;

// --- les fonctions du jeu appelées ---------------------------------------------------------------
const OUVRIR_ECRAN_PLEIN = 0x40D3E, FERMER_ECRAN_PLEIN = 0x40D79;
const CHARGER_UN_FICHIER = 0x7F0B0;      // (nom, destination)
const RECOPIER_DES_LIGNES = 0x55EFA;     // (source, destination, lignes)
const RECOPIER_320 = 0x80E20;            // (source, destination, lignes de 320 octets)
const RECOPIER_640 = 0x54ED6;            // (source, destination) : l'écran entier
const REMPLIR_320 = 0x81590, REMPLIR_640 = 0x815B8;   // (destination, lignes, couleur)
const RECTANGLE_PLEIN = 0x1188C;         // (x, y, largeur, hauteur, couleur)
const POINT_BASSE = 0x80C00;             // (x, y, couleur)
const MARQUER_HAUTE = 0x54D38;           // (x, y, largeur, hauteur) : la zone à présenter
const POINT_HAUTE = 0x80C40;             // (x, y, couleur)
const LARGEUR_DU_TEXTE = 0x3F714;        // (texte)
const ECRIRE_EN_GRAND = 0x3F7BD;         // (x, y, texte, 1, 0) : le nom du parc
const ECRIRE_TEXTE = 0x3F49E;            // (x, y, texte, normal, couleur)
const PETIT_TEXTE_BASSE = 0x80E88, PETIT_TEXTE_HAUTE = 0x80F34;   // (x, y, texte, couleur)
const COULEUR_LA_PLUS_PROCHE = 0x80250;  // (palette, r, g, b) -> index, dans al
const DESSINER_UN_OBJET = 0x209B5;       // (objet graphique, x, y)
const PREPARER_LA_VUE_REDUITE = 0x3B011;
const RECADRER_LA_CAMERA = 0x184DF;      // la vue portée sur [0xD667A], [0xD6666] (carte.js)
const BARRE_D_OUTILS = 0x4DE1A;          // (0)
const APRES_LA_CARTE = 0x3D72B;
const CURSEUR = 0x116E4;                 // (image)
const RAFRAICHIR_TOUT = 0x55FCF;        // amorcage.js
const PASSER_EN_320 = 0x1171F;          // un instant, pour un écran plein (amorcage.js)
const REPASSER_EN_640 = 0x11761;        // après 0x1171F
const POSER_LA_PALETTE = 0x808B0;        // (palette)
const ROUVRIR_UN_ECRAN = 0x1B23A;        // (écran)
const BRUITAGE = 0x80C80;                // (propriétaire, bruitage)
const FORMATER = 0x7F652;                // sprintf
const ECRIRE_UN_NOMBRE = 0x56E7E;        // (tampon, valeur, base, 0)
const QUESTION = 0x78F89;                // (texte, titre) -> 1 oui, −1 non, 0 pas encore
const DEMOLIR_UNE_ATTRACTION = 0x31748;  // (objet)
const DEMOLIR_UNE_BOUTIQUE = 0x35C4A;    // (objet)
const TROUVER_UN_OBJET = 0x204B9;        // (cellule, type) -> objet de ce type posé là, ou 0
const CHOISIR_UNE_DESTINATION = 0x22834; // (visiteur) : visiteurs.js

// Les routines de vue réduite des objets, par type (+0x4 de l'objet).
const VUE_REDUITE = new Map([
  [0x02, 0x1C9E2],  // un visiteur (ou un employé)
  [0x04, 0x1D87A],  // une attraction
  [0x08, 0x1E9A7],
  [0x0A, 0x1ECD6],  // une boutique
  [0x0E, 0x1DD27],
  [0x12, 0x1F53E],  // un morceau de voie : `dessinerUnMorceauDeVoie`, ci-dessous
  [0x14, 0x1F8F8],
  [0x1A, 0x1C90B],
]);

const basseResolution = (jeu) => (octet(jeu, MODE) & 1) !== 0;
const hauteResolution = (jeu) => mot(jeu, MODE) === 8;
const texte = (jeu, table, rang) => long(jeu, (long(jeu, table) + rang * 4) | 0);

// Un point de la vue réduite ; en 640x480, la case est d'abord marquée à présenter.
function point(jeu, x, y, couleur) {
  if (basseResolution(jeu)) {
    jeu.appeler(POINT_BASSE, s16(x), s16(y), couleur);
  } else {
    jeu.appeler(MARQUER_HAUTE, s16(x), s16(y), 1, 1);
    jeu.appeler(POINT_HAUTE, s16(x), s16(y), couleur);
  }
}

// Les dimensions d'une case de la vignette.
const largeurDeCase = (jeu) => idiv(mot(jeu, LARGEUR_TUILE), mot(jeu, DIVISEUR_LARGEUR));
const hauteurDeCase = (jeu) => idiv(mot(jeu, HAUTEUR_TUILE), mot(jeu, DIVISEUR_HAUTEUR));
const VIGNETTE_X = 0x40, VIGNETTE_Y = 0x4C;

// Les diviseurs de la vue réduite : 6 et 8, divisés par deux en 640x480.
function poserLesDiviseurs(jeu) {
  poserMot(jeu, DIVISEUR_LARGEUR, 6);
  poserMot(jeu, DIVISEUR_HAUTEUR, 8);
  if (octet(jeu, MODE) & 8) {
    poserMot(jeu, DIVISEUR_LARGEUR, mot(jeu, DIVISEUR_LARGEUR) >> 1);
    poserMot(jeu, DIVISEUR_HAUTEUR, mot(jeu, DIVISEUR_HAUTEUR) >> 1);
  }
}

// =================================================================================================
// LA CARTE DU PARC
// =================================================================================================

// 0x40641 — préparer le fond de la carte du parc.
//
// Le fond data/mmap-0.dat est chargé sur la surface, recopié dans le tampon de fond (400 lignes),
// puis la vignette du terrain y est peinte, directement dans le tampon de fond (la surface lui est
// substituée le temps du dessin) : une case, un rectangle de la couleur de son sol. La façon de
// dessiner reste à 8, la vue réduite, jusqu'à la fin de la première image de la carte.
export const preparerLaCarte = dansLeCadre(0x18, (jeu) => {
  jeu.appeler(CHARGER_UN_FICHIER, 0xB8829, long(jeu, SURFACE));   // "data/mmap-0.dat"
  jeu.appeler(RECOPIER_DES_LIGNES, long(jeu, SURFACE), long(jeu, FOND), 0x190);
  const surface = long(jeu, SURFACE);
  poserLong(jeu, SURFACE, long(jeu, FOND));
  poserMot(jeu, FACON_DE_DESSINER, 8);
  poserLesDiviseurs(jeu);
  let cellule = long(jeu, CARTE);
  let y = VIGNETTE_Y;
  for (let rangee = 0; rangee < COTE; rangee++) {
    let x = VIGNETTE_X;
    for (let colonne = 0; colonne < COTE; colonne++) {
      const couleur = octet(jeu, COULEURS_DES_SOLS + octet(jeu, cellule + 2) * 4);
      jeu.appeler(RECTANGLE_PLEIN, s16(x), s16(y), s16(largeurDeCase(jeu)), s16(hauteurDeCase(jeu)), couleur);
      x = u16(x) + largeurDeCase(jeu);
      cellule = (cellule + 4) | 0;
    }
    y = u16(y) + hauteurDeCase(jeu);
  }
  poserLong(jeu, SURFACE, surface);
});

// 0x3F975 — une image de la carte du parc.
//
// Le fond (la vignette du terrain, 0x40641) est remis sur la surface, puis, en vue réduite, chaque
// case de la grille est parcourue et ce qui y est posé dessiné, dans l'ordre de la liste de la case
// (mot +2 de chaque objet) : les objets du parc par la routine de leur type, décalés de leur
// position dans la case (octets +6 et +8) réduite par les diviseurs ; un décor fixe (numéro
// négatif, qui termine la liste) par sa figure. Le type 6 et le type 0x18 n'ont pas de routine :
// leur objet graphique avance d'une image d'animation (mot +6 de l'objet graphique, écrit dans
// l'objet du parc) et se dessine au milieu de la case — un objet de type 6 sans objet graphique
// n'est pas dessiné.
//
// Puis le cadre de la vue : sous le pointeur s'il est dans la vignette, centré sur lui ; sinon là où
// est la vue du parc. Le cadre est borné à la vignette, tracé en pointillés qui clignotent (un point
// sur deux avance le compteur 0xD77CE ; un point n'est tracé que quand son bit 3 est levé). Un clic
// (bouton gauche tenu) dans la vignette y porte la vue, ferme la carte et revient au parc. Enfin la
// barre d'outils (0x4DE1A) et 0x3D72B.
//
// La position passée à la routine d'un objet est le coin de sa case, moins son décalage dans la
// case, plus ce décalage réduit : dx = [0xD663A] × octet +6 / 256 + octet +8 / 32 (/ 16 en
// 320x200), dy = octet +8 / 16 (/ 8) ; la routine rajoute vraisemblablement le décalage entier
// (non établi).
export const dessinerLaCarte = dansLeCadre(0x84, (jeu) => {
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  // Le fond. En 320x200, le programme reteste le mode et choisit entre 400 et 480 lignes (divisées
  // par deux) : la branche 480 y est morte.
  if (basseResolution(jeu)) jeu.appeler(RECOPIER_320, long(jeu, FOND), long(jeu, SURFACE), 200);
  else jeu.appeler(RECOPIER_640, long(jeu, FOND), long(jeu, SURFACE));
  jeu.appeler(PREPARER_LA_VUE_REDUITE);
  poserMot(jeu, FACON_DE_DESSINER, 8);

  // Le nom du parc, centré sur x = 0x14C, en y = 0x16. Les arguments de l'écriture sont empilés
  // avant le calcul de la largeur, que 0x3F714 fait avec ces arguments au-dessus des siens : l'appel
  // est refait tel quel, pour que la pile soit la même.
  const nom = (long(jeu, COMPTES) + 0x20) | 0;
  const largeur = s16(jeu.appeler(LARGEUR_DU_TEXTE, nom, 0x16, nom, 1, 0));
  jeu.appeler(ECRIRE_EN_GRAND, s16(0x14C - idiv(largeur, 2)), 0x16, nom, 1, 0);

  poserLesDiviseurs(jeu);
  let cellule = long(jeu, CARTE);
  let y = VIGNETTE_Y;
  for (let rangee = 0; rangee < COTE; rangee++) {
    let x = VIGNETTE_X;
    for (let colonne = 0; colonne < COTE; colonne++) {
      dessinerUneCase(jeu, cellule, u16(x), u16(y));
      cellule = (cellule + 4) | 0;
      x = u16(x) + largeurDeCase(jeu);
    }
    y = u16(y) + hauteurDeCase(jeu);
  }
  poserMot(jeu, FACON_DE_DESSINER, 0);

  // Le cadre de la vue.
  // (La vue fait 640 sur 480, plus en grande vue : grande-vue.js.)
  const hauteurEcran = () => (basseResolution(jeu) ? 0x190 : hauteurDeLaVue(jeu));
  // La vue couvre `colonnesVues` colonnes et `rangeesVues` rangées de la grille.
  const colonnesVues = () => idiv(largeurDeLaVue(jeu), mot(jeu, LARGEUR_TUILE));
  const rangeesVues = () => idiv(mot(jeu, HAUTEUR_TUILE) + hauteurEcran() - 1, mot(jeu, HAUTEUR_TUILE));
  const sx = motSigne(jeu, SOURIS_X), sy = motSigne(jeu, SOURIS_Y);
  let colonne, rangee, sousLePointeur;
  if (sx >= VIGNETTE_X && sx <= (largeurDeCase(jeu) << 6) + VIGNETTE_X
    && sy >= VIGNETTE_Y && sy <= (hauteurDeCase(jeu) << 6) + VIGNETTE_Y) {
    colonne = idiv(sx - VIGNETTE_X, largeurDeCase(jeu)) - idiv(colonnesVues(), 2);
    if (s16(colonne) < 0) colonne = 0;
    rangee = idiv(sy - VIGNETTE_Y, hauteurDeCase(jeu)) - idiv(rangeesVues(), 2);
    if (s16(rangee) < 0) rangee = 0;
    sousLePointeur = true;
  } else {
    colonne = mot(jeu, CAMERA_COLONNE);
    rangee = mot(jeu, CAMERA_RANGEE);
    sousLePointeur = false;
  }
  if (colonnesVues() + s16(colonne) > COTE) colonne = COTE - colonnesVues();
  if (rangeesVues() + s16(rangee) > COTE) rangee = COTE - rangeesVues();

  const blanc = jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE), 0x3F, 0x3F, 0x3F) & 0xFF;
  const clignote = () => {
    poserOctet(jeu, CLIGNOTEMENT, octet(jeu, CLIGNOTEMENT) + 1);
    return (octet(jeu, CLIGNOTEMENT) & 8) !== 0;
  };
  // Les bords du haut et du bas.
  const haut = Math.imul(hauteurDeCase(jeu), s16(rangee)) + VIGNETTE_Y;
  let px = Math.imul(largeurDeCase(jeu), s16(colonne)) + VIGNETTE_X;
  for (let i = 0; s16(i) < Math.imul(colonnesVues(), largeurDeCase(jeu)); i++, px++) {
    if (clignote()) point(jeu, px, haut, blanc);
    if (clignote()) point(jeu, px, Math.imul(hauteurDeCase(jeu), s16(rangee) + rangeesVues()) + VIGNETTE_Y, blanc);
  }
  // Les bords de gauche et de droite, sans les coins.
  let py = Math.imul(hauteurDeCase(jeu), s16(rangee) + 1) + VIGNETTE_Y;
  for (let i = 0; s16(i) < Math.imul(hauteurDeCase(jeu), rangeesVues() - 2); i++, py++) {
    if (clignote()) point(jeu, Math.imul(largeurDeCase(jeu), s16(colonne)) + VIGNETTE_X, py, blanc);
    if (clignote()) point(jeu, Math.imul(largeurDeCase(jeu), s16(colonne) + colonnesVues()) + VIGNETTE_X, py, blanc);
  }

  // Un clic dans la vignette : la vue y est portée, et l'on revient au parc.
  if (mot(jeu, GAUCHE_TENU) !== 0 && sousLePointeur) {
    poserMot(jeu, CAMERA_COLONNE, colonne);
    poserMot(jeu, CAMERA_RANGEE, rangee);
    jeu.appeler(RECADRER_LA_CAMERA);
    poserMot(jeu, ECRAN, 0);
    poserMot(jeu, REDESSINER_CARTE, 1);
    poserMot(jeu, DROIT_APPUI, 0);
    poserMot(jeu, GAUCHE_APPUI, 0);
    poserMot(jeu, DROIT_TENU, 0);
    poserMot(jeu, GAUCHE_TENU, 0);
    poserOctet(jeu, IMAGE_DU_BOUTON, 0);
    jeu.appeler(FERMER_ECRAN_PLEIN);
  }
  jeu.appeler(BARRE_D_OUTILS, 0);
  jeu.appeler(APRES_LA_CARTE);
});

// Ce qui est posé sur une case de la carte, en (x, y), le coin de la case sur la vignette.
function dessinerUneCase(jeu, cellule, x, y) {
  // Le milieu de la case, où se dessinent les objets sans routine et les décors.
  const auMilieu = () => {
    const dx = ((mot(jeu, LARGEUR_TUILE) << 7) >> 8) + (hauteResolution(jeu) ? 4 : 8);
    const dy = hauteResolution(jeu) ? 8 : 0x10;
    return [idiv(s16(dx), mot(jeu, DIVISEUR_LARGEUR)) + x, idiv(s16(dy), mot(jeu, DIVISEUR_HAUTEUR)) + y];
  };
  let numero = motSigne(jeu, cellule);
  while (numero > 0) {
    const objet = (long(jeu, OBJETS) + numero * TAILLE_OBJET) | 0;
    // La position de l'objet dans sa case, réduite.
    const dx = ((Math.imul(mot(jeu, LARGEUR_TUILE), octet(jeu, objet + 6)) >> 8)
      + (octet(jeu, objet + 8) >> (hauteResolution(jeu) ? 5 : 4)));
    const dy = octet(jeu, objet + 8) >> (hauteResolution(jeu) ? 4 : 3);
    const ox = x - s16(dx) + idiv(s16(dx), mot(jeu, DIVISEUR_LARGEUR));
    const oy = y - s16(dy) + idiv(s16(dy), mot(jeu, DIVISEUR_HAUTEUR));
    const type = octet(jeu, objet + 4);
    const routine = VUE_REDUITE.get(type);
    if (routine !== undefined) {
      jeu.appeler(routine, objet, s16(ox), s16(oy));
    } else if (type === 0x18 || (type === 6 && mot(jeu, objet + 0xA) !== 0)) {
      // L'image suivante de son animation, dessinée au milieu de la case.
      const suivant = mot(jeu, (long(jeu, OBJETS_GRAPHIQUES) + mot(jeu, objet + 0xA) * 8 + 6) | 0);
      poserMot(jeu, objet + 0xA, suivant);
      const [mx, my] = auMilieu();
      jeu.appeler(DESSINER_UN_OBJET, mot(jeu, objet + 0xA), s16(mx), s16(my));
    }
    numero = motSigne(jeu, objet + 2);
  }
  if (numero < 0) {
    // Un décor fixe : sa figure, au milieu de la case. Il termine la liste.
    const figure = mot(jeu, FIGURES_DES_DECORS + -numero * 2);
    const [mx, my] = auMilieu();
    jeu.appeler(DESSINER_UN_OBJET, mot(jeu, (long(jeu, FIGURES) + figure * 2) | 0), s16(mx), s16(my));
  }
}

// 0x1F53E — un morceau de voie, en réduction (objet, x, y).
//
// Le point de départ est le milieu de la case, remonté de 0x18 et 0xC. La couleur dépend du genre
// de voie (mot +0x16) : 1, 2 ou 3. Si l'objet a une forme dessinée (octet +0x44), on trace son
// pilier — deux points tous les 4 pixels, autant de fois que sa hauteur (octet +0x79), plus une
// sauf pour la forme 0x10 —, puis la forme, dont les points sont décalés du haut du pilier : la
// table 0xB7E3F, 13 octets par forme, donne leur nombre puis leurs couples (dx, dy) signés. Un
// morceau à l'état 0x13 (octet +0xC) d'un genre autre que 1 reçoit en plus les points de 0xB7F5D.
//
// ANOMALIE REPRODUITE : pour un genre autre que 1, 2 ou 3, la couleur n'est jamais écrite ; c'est
// sa variable locale [ebp-0xC] qui est relue, ce qu'y ont laissé les appels précédents. La
// réécriture ouvre le même cadre et relit le même emplacement.
const FORMES_DE_VOIE = 0xB7E3F;     // 13 octets par forme : le nombre de points, puis (dx, dy)
const TAILLE_FORME_DE_VOIE = 0xD;
const POINTS_DE_L_ETAT_13 = 0xB7F5D; // le nombre de points, puis (dx, dy)
export const dessinerUnMorceauDeVoie = dansLeCadre(0x18, (jeu, cadre, objet, x, y) => {
  const px = (mot(jeu, LARGEUR_TUILE) >> 1) + s16(x) - 0x18;
  let py = (mot(jeu, HAUTEUR_TUILE) >> 1) + s16(y) - 0xC;
  const genre = mot(jeu, objet + 0x16);
  // L'original range ces mots dans des variables longues dont la moitié haute garde celle de
  // l'adresse de l'objet ; elles sont écrites ici comme il les écrivait.
  const hautDeLObjet = objet & 0xFFFF0000;
  poserLong(jeu, cadre.local(0x10), px);
  poserLong(jeu, cadre.local(0x14), py);
  poserLong(jeu, cadre.local(0x18), hautDeLObjet | genre);
  const couleurs = [0, COULEUR_VOIE_1, COULEUR_VOIE_2, COULEUR_VOIE_3];
  if (genre >= 1 && genre <= 3) poserLong(jeu, cadre.local(0xC), hautDeLObjet | octet(jeu, couleurs[genre]));
  const couleur = () => motSigne(jeu, cadre.local(0xC));

  const forme = octet(jeu, objet + 0x44);
  if (forme === 0) return;
  // Le pilier.
  const etages = u16(forme === 0x10 ? octet(jeu, objet + 0x79) : octet(jeu, objet + 0x79) + 1);
  for (let i = 0; i < etages; i++) {
    point(jeu, px, py, couleur());
    point(jeu, px, py - 2, couleur());
    py = (py - 4) | 0;
  }
  poserLong(jeu, cadre.local(0x14), py);
  // La forme, au sommet.
  const fiche = FORMES_DE_VOIE + forme * TAILLE_FORME_DE_VOIE;
  const points = octet(jeu, fiche);
  for (let i = 0; i < points; i++) {
    point(jeu, s8(octet(jeu, fiche + 1 + i * 2)) + px, s8(octet(jeu, fiche + 2 + i * 2)) + py, couleur());
  }
  if (octet(jeu, objet + 0xC) !== 0x13 || mot(jeu, objet + 0x16) === 1) return;
  const autres = octet(jeu, POINTS_DE_L_ETAT_13);
  for (let i = 0; i < autres; i++) {
    point(jeu, s8(octet(jeu, POINTS_DE_L_ETAT_13 + 1 + i * 2)) + px,
      s8(octet(jeu, POINTS_DE_L_ETAT_13 + 2 + i * 2)) + py, couleur());
  }
});

// =================================================================================================
// LE RELEVÉ DE BANQUE
// =================================================================================================

// 0x77A55 — ouvrir le relevé de banque (l'écran 0x40).
//
// Le fond et la palette chargés, le pointeur remis en flèche, le fond recopié dans le tampon de
// fond, et l'écran noté comme celui d'où l'on vient (sauf s'il l'était déjà) ; le fondu repart.
export const ouvrirLeReleve = dansLeCadre(0, (jeu) => {
  jeu.appeler(CHARGER_UN_FICHIER, 0xB82FE, long(jeu, SURFACE));          // "data/mstate-0.dat"
  jeu.appeler(CHARGER_UN_FICHIER, 0xB833D, PALETTE_DE_L_ECRAN);          // "data/mstap-0.dat"
  jeu.appeler(CURSEUR, long(jeu, CURSEURS));
  jeu.appeler(RAFRAICHIR_TOUT);
  jeu.appeler(PASSER_EN_320);
  jeu.appeler(POSER_LA_PALETTE, PALETTE_DE_L_ECRAN);
  jeu.appeler(RECOPIER_DES_LIGNES, long(jeu, SURFACE), long(jeu, FOND), 0x190);
  if (mot(jeu, ECRAN) !== 0x40) {
    poserMot(jeu, ECRAN_PRECEDENT, mot(jeu, ECRAN));
    poserOctet(jeu, RETOUR_DES_ECRANS, octet(jeu, ECRAN));
  }
  poserMot(jeu, ECRAN, 0x40);
  poserLong(jeu, NIVEAU_DU_FONDU, 0);
  poserOctet(jeu, PAS_DU_FONDU, 1);
});

// 0x77B08 — une image du relevé de banque.
//
// Les éléments de la mise en page (0xBE511) sont dessinés dans l'ordre. Les lignes du relevé
// (genre 3) : les comptes du joueur gardent en +0x46 le nombre d'écritures, en +0x42 le solde avant
// la première, et, dès +0x47, 7 octets par écriture : +0 sa sorte (le libellé), +1 le jour, +2 le
// mois, +3 le montant (mot long signé). On n'affiche que les dernières, autant qu'il en tient entre
// le haut de l'élément et le haut de l'élément 7 (une ligne tous les 6 pixels, 12 en 320x200) ; le
// solde des écritures cachées est reporté. Chaque ligne : la date (« jour mois »), le libellé, le
// montant dans la colonne du débit s'il est négatif, du crédit s'il est positif (rien s'il est nul),
// et le solde après l'écriture. L'élément 8 écrit le solde final.
//
// On sort par Entrée, Espace, ou un clic dans le bouton (l'élément 9) : un bruitage, retour à
// l'écran d'où l'on vient (0x1B23A), la surface vidée avant et après.
//
// ANOMALIE REPRODUITE : le solde négatif a sa propre couleur ([ebp-8]), mais elle vaut 0x5A comme
// l'autre : débit et crédit s'écrivent de la même couleur.
const MISE_EN_PAGE = 0xBE511;
const TAILLE_ELEMENT = 11;
const BAS_DES_LIGNES = 0xBE561;     // le y de l'élément 7
const BOUTON_DE_SORTIE = 0xBE575;   // l'élément 9 : +0 x, +2 y, +4 largeur, +6 hauteur
const TOUCHE_ENTREE = 0x1C, TOUCHE_ESPACE = 0x39;
const COULEUR_DU_RELEVE = 0x5A, COULEUR_DU_DECOUVERT = 0x5A;
export const afficherLeReleve = dansLeCadre(0x1D4, (jeu, cadre) => {
  const tampon = cadre.local(0x6C);
  const basse = basseResolution(jeu);
  if (basse) jeu.appeler(RECOPIER_320, long(jeu, FOND), long(jeu, SURFACE), 200);
  else jeu.appeler(RECOPIER_640, long(jeu, FOND), long(jeu, SURFACE));
  const petitTexte = (x, y, chaine, couleur) =>
    jeu.appeler(basse ? PETIT_TEXTE_BASSE : PETIT_TEXTE_HAUTE, x, y, chaine, couleur);
  const ecrireLeNombre = (valeur) => jeu.appeler(ECRIRE_UN_NOMBRE, tampon, valeur, 10, 0);

  // Le solde courant : la variable [ebp-0x1c] de l'original, que l'élément 8 relit.
  let solde = longSigne(jeu, cadre.local(0x1C));
  for (let e = 0; ; e++) {
    const element = MISE_EN_PAGE + u16(e) * TAILLE_ELEMENT;
    const genre = octet(jeu, element);
    if (genre === 0) break;
    if (u16(e) === 0) jeu.appeler(OUVRIR_ECRAN_PLEIN);
    const x = motSigne(jeu, element + 1), y = motSigne(jeu, element + 3);
    if (genre === 1) {
      jeu.appeler(ECRIRE_TEXTE, x, y, (long(jeu, COMPTES) + 0x20) | 0, 0, COULEUR_DU_RELEVE);
    } else if (genre === 2) {
      petitTexte(x, y, texte(jeu, TEXTES, mot(jeu, element + 9)), COULEUR_DU_RELEVE);
    } else if (genre === 3) {
      solde = lignesDuReleve(jeu, e, element, tampon, petitTexte, ecrireLeNombre);
    } else if (genre === 8) {
      ecrireLeNombre(solde);
      petitTexte(x, y, tampon, solde < 0 ? COULEUR_DU_DECOUVERT : COULEUR_DU_RELEVE);
    }
  }

  const sx = motSigne(jeu, SOURIS_X), sy = motSigne(jeu, SOURIS_Y);
  const bx = mot(jeu, BOUTON_DE_SORTIE), by = mot(jeu, BOUTON_DE_SORTIE + 2);
  const surLeBouton = mot(jeu, GAUCHE_TENU) !== 0
    && sx >= bx && sx < bx + mot(jeu, BOUTON_DE_SORTIE + 4)
    && sy >= by && sy < by + mot(jeu, BOUTON_DE_SORTIE + 6);
  const touche = octet(jeu, TOUCHE);
  if (touche !== TOUCHE_ENTREE && touche !== TOUCHE_ESPACE && !surLeBouton) return;

  jeu.appeler(BRUITAGE, 0, 0x1A);
  poserMot(jeu, DROIT_APPUI, 0);
  poserMot(jeu, GAUCHE_APPUI, 0);
  poserMot(jeu, DROIT_TENU, 0);
  poserMot(jeu, GAUCHE_TENU, 0);
  poserMot(jeu, ECRAN, mot(jeu, ECRAN_PRECEDENT));
  jeu.appeler(REPASSER_EN_640);
  const vider = () => {
    if (basseResolution(jeu)) jeu.appeler(REMPLIR_320, long(jeu, SURFACE), 0x190, 0);
    else jeu.appeler(REMPLIR_640, long(jeu, SURFACE), 0x1E0, 0);
  };
  vider();
  jeu.appeler(RAFRAICHIR_TOUT);
  jeu.appeler(ROUVRIR_UN_ECRAN, octet(jeu, RETOUR_DES_ECRANS));
  jeu.appeler(RAFRAICHIR_TOUT);
  jeu.appeler(POSER_LA_PALETTE, long(jeu, PALETTE));
  vider();
  jeu.appeler(FERMER_ECRAN_PLEIN);
});

// Les lignes du relevé, pour l'élément `e` de genre 3 ; rend le solde après la dernière écriture
// affichée. Les colonnes sont les x des quatre éléments suivants, multipliés par 8 en 320x200, par
// 4 en 640x480.
function lignesDuReleve(jeu, e, element, tampon, petitTexte, ecrireLeNombre) {
  const basse = basseResolution(jeu);
  const interligne = basse ? 0xC : 6;
  const echelle = basse ? 8 : 4;
  const colonne = (k) => s16(Math.imul(mot(jeu, MISE_EN_PAGE + (u16(e) + k) * TAILLE_ELEMENT + 1), echelle));
  const comptes = () => long(jeu, COMPTES);
  const ecriture = (i) => (comptes() + u16(i) * 7) | 0;
  const nombre = () => octet(jeu, comptes() + 0x46);

  let y = mot(jeu, element + 3);
  const tiennent = idiv(mot(jeu, BAS_DES_LIGNES) - mot(jeu, element + 3), interligne);
  let premiere = nombre() - u16(tiennent) > 0 ? nombre() - u16(tiennent) : 0;
  let solde = longSigne(jeu, comptes() + 0x42);
  for (let i = 0; u16(i) < u16(premiere); i++) solde = (solde + longSigne(jeu, ecriture(i) + 0x4A)) | 0;

  for (let i = premiere; u16(i) < nombre() && u16(y) < mot(jeu, BAS_DES_LIGNES) - interligne; i++) {
    const ligne = ecriture(i);
    // "%d %s" : le jour, compté dès 1, et le mois.
    jeu.appeler(FORMATER, tampon, 0xB0729, octet(jeu, ligne + 0x48) + 1,
      texte(jeu, NOMS_DES_MOIS, octet(jeu, ligne + 0x49)));
    petitTexte(colonne(0), s16(y), tampon, COULEUR_DU_RELEVE);
    petitTexte(colonne(1), s16(y), texte(jeu, LIBELLES_DU_RELEVE, octet(jeu, ligne + 0x47)), COULEUR_DU_RELEVE);
    const montant = longSigne(jeu, ligne + 0x4A);
    if (montant < 0) {
      ecrireLeNombre(-montant | 0);
      petitTexte(colonne(2), s16(y), tampon, COULEUR_DU_RELEVE);
    } else if (montant !== 0) {
      ecrireLeNombre(montant);
      petitTexte(colonne(3), s16(y), tampon, COULEUR_DU_RELEVE);
    }
    solde = (solde + longSigne(jeu, ecriture(i) + 0x4A)) | 0;
    ecrireLeNombre(solde);
    petitTexte(colonne(4), s16(y), tampon, solde < 0 ? COULEUR_DU_DECOUVERT : COULEUR_DU_RELEVE);
    y = u16(y) + interligne;
  }
  return solde;
}

// =================================================================================================
// LA QUESTION « DÉMOLIR ? »
// =================================================================================================

// 0x78B7E — une image de l'écran 0x4A (objet) ; rend toujours 0.
//
// L'objet est une attraction (type 4) ou une boutique (type 0xA) ; son mot +0x16 est le décalage de
// sa fiche dans le catalogue (0xCCED0 les attractions, 0xD3C62 les boutiques) : le mot +0x22 de la
// fiche est son nom, le mot long +0xA2 (attraction) ou +0x49 (boutique) le montant écrit dans la
// question. Un objet sans type ferme l'écran.
//
// ANOMALIE REPRODUITE : pour un autre type, ni le titre ni le texte ne sont écrits ; la boîte
// reçoit ce que contiennent les variables [ebp-8] et [ebp-0xD0]. La réécriture ouvre le même cadre
// et passe les mêmes emplacements.
const ATTRACTIONS = 0xCCED0, BOUTIQUES = 0xD3C62;
export const demanderSiDemolir = dansLeCadre(0xD8, (jeu, cadre, objet) => {
  const tampon = cadre.local(0xD0);
  const titre = cadre.local(8);
  const type = octet(jeu, objet + 4);
  if (type === 0) {
    poserMot(jeu, ECRAN, 0);
    return 0;
  }
  const fiche = mot(jeu, objet + 0x16);
  if (type === 4 || type === 0xA) {
    const catalogue = type === 4 ? ATTRACTIONS : BOUTIQUES;
    const montant = type === 4 ? 0xA2 : 0x49;
    poserLong(jeu, titre, texte(jeu, NOMS, mot(jeu, catalogue + fiche + 0x22)));
    jeu.appeler(FORMATER, tampon, texte(jeu, NOMS, 0x11B), long(jeu, catalogue + fiche + montant));
  }
  if (mot(jeu, objet + 0x38) !== 0) jeu.appeler(FORMATER, tampon, texte(jeu, NOMS, 0x11C));
  const reponse = jeu.appeler(QUESTION, tampon, long(jeu, titre));
  if (u16(reponse) === 1) {
    const typeAlors = octet(jeu, objet + 4);
    if (typeAlors === 4) jeu.appeler(DEMOLIR_UNE_ATTRACTION, objet);
    else if (typeAlors === 0xA) jeu.appeler(DEMOLIR_UNE_BOUTIQUE, objet);
  }
  return 0;
});

// =================================================================================================
// LA QUESTION DU BUS
// =================================================================================================

// 0x78CEF — l'écran 0x54 : changer de modèle de bus.
//
// Appelée à chaque image par la boucle du parc tant que l'écran 0x54 est ouvert. Le modèle proposé
// est le suivant de l'actuel (+0x49 de la fiche du parc), dans la limite de la recherche (+0x4A).
// Sans bus ([[0xD3814] + 0x2BE], le numéro de l'objet), ou sans modèle nouveau, l'écran se ferme
// (0xD6652 = 0) et la fonction rend 0. Sinon, une image de la question (texte 0x12D de [0xD7BD0],
// avec la capacité, table d'octets 0xB78CC, et le prix, table de longs 0xB787C, du modèle) ; au
// « oui » : le bus prend le modèle (+0x26 ; à partir du modèle 9, +0x26 − 9, et son mot +0xA à 1 :
// une autre série, non établi), la fiche du parc la capacité (+0x48) et le modèle (+0x49), et le prix
// est inscrit au livre en catégorie 0x14, en dépense ; elle rend 1. Sinon 0.
const PARC_COURANT = 0xD3818;        // pointeur : la fiche du parc du joueur en cours
const INSCRIRE_AU_LIVRE = 0x78943;   // (catégorie, montant)
const TEXTE_DU_BUS = 0x12D;          // dans la table des noms (NOMS)
const PRIX_DES_BUS = 0xB787C, CAPACITE_DES_BUS = 0xB78CC, BUS = 0x2BE, MODELE_DU_BUS = 0x26;
const CAPACITE = 0x48, MODELE = 0x49, MODELE_PERMIS = 0x4A;
const GRAPHIQUE = 0xA;               // le mot +0xA d'un objet du parc
const TAMPON_DU_TEXTE = 0xD4;
const tableDesObjets = (jeu) => long(jeu, OBJETS);
const objetNumero = (jeu, n) => tableDesObjets(jeu) + n * TAILLE_OBJET;
export const ecranDuBus = dansLeCadre(0xD4, (jeu, cadre) => {
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  const parc = long(jeu, PARC_COURANT);
  let modele = octet(jeu, parc + MODELE_PERMIS);
  if (modele > octet(jeu, parc + MODELE) + 1) modele = octet(jeu, parc + MODELE) + 1;
  const bus = objetNumero(jeu, mot(jeu, long(jeu, COMPTES) + BUS));
  if (bus <= tableDesObjets(jeu) || modele === octet(jeu, parc + MODELE)) {
    poserMot(jeu, ECRAN, 0);
    return 0;
  }
  const texte = cadre.local(TAMPON_DU_TEXTE);
  jeu.appeler(FORMATER, texte, long(jeu, long(jeu, NOMS) + TEXTE_DU_BUS * 4),
    octet(jeu, CAPACITE_DES_BUS + modele), long(jeu, PRIX_DES_BUS + modele * 4));
  if ((jeu.appeler(QUESTION, texte, 0) & 0xFFFF) !== 1) return 0;
  poserMot(jeu, bus + MODELE_DU_BUS, modele);
  if (modele >= 9) {
    poserMot(jeu, bus + GRAPHIQUE, 1);
    poserMot(jeu, bus + MODELE_DU_BUS, mot(jeu, bus + MODELE_DU_BUS) - 9);
  }
  poserOctet(jeu, parc + CAPACITE, octet(jeu, CAPACITE_DES_BUS + modele));
  poserOctet(jeu, parc + MODELE, modele);
  jeu.appeler(INSCRIRE_AU_LIVRE, 0x14, -long(jeu, PRIX_DES_BUS + modele * 4));
  return 1;
});

// =================================================================================================
// L'EFFACEMENT D'UNE FILE D'ATTENTE
// =================================================================================================

// 0x2BCEE — effacer la file d'attente posée sur une case (numéro de case).
//
// Rien si le sol de la case n'est pas une file (drapeau 8). Sinon :
//  1. le sol est remis à 0 ; une file « à part » (drapeau 0x40, raccordée par les côtés) redevient
//     une allée, 0x90 si ses ouvertures (table 0xB49C1) sont 5 (nord-sud), 0x91 si elles sont 0xA
//     (est-ouest) — autrement le sol reste tel quel — et ses bouts sont pris à l'image 0x7F ou 0x7E ;
//  2. aux deux bouts de la file (table 0xB8BB0, deux octets par forme : la direction de chaque bout),
//     la case voisine perd son raccord vers la case effacée : sa forme est recalculée d'après ses
//     sorties (0xB49D3) sans la direction de la case (0xB8C35 donne la direction opposée), par la
//     table 0xB8BEF — sauf si ses drapeaux valent exactement 0x48 ;
//  3. les visiteurs qui attendaient là : le premier objet de la case de type 2 à l'état 0xC (un
//     visiteur dans une file) mène à l'attraction (mot +0x16), dont la file est une chaîne de
//     visiteurs par le mot +0x1E. Dès le premier visiteur de la chaîne qui est sur la case, la
//     chaîne est coupée : ceux de la case repartent (0x22834, état 6, objet graphique de marche),
//     ceux d'après passent à l'état 0xA ; tous quittent la chaîne ;
//  4. dans les quatre directions, un kiosque (objet de type 6, 0x204B9) tourné vers la case
//     effacée est retourné vers une file voisine de sa propre case, et la forme de celle-ci
//     recalculée pour s'y raccorder.
//
// ANOMALIES REPRODUITES :
//  - à l'étape 3, 0x22834 et l'objet graphique sont appliqués au premier visiteur trouvé sur la
//    case (le guide de la chaîne), autant de fois qu'il y a de visiteurs de la case dans la file,
//    et non à chacun d'eux ; chacun reçoit pourtant l'état 6 et l'objet graphique du premier ;
//  - à l'étape 4, la recherche d'une file voisine du kiosque commence par la case du kiosque
//    elle-même, puis les directions 1, 2 et 3 : la direction 0 (le nord) n'est jamais examinée ;
//  - à l'étape 3, la chaîne coupée, la recherche reprend depuis l'objet 0 (la sentinelle) par son
//    mot +0x1E ; elle ne se poursuit que s'il n'est pas nul.
const OUVERTURES_DES_ALLEES = 0xB49C1;
const BOUTS_DES_FILES = 0xB8BB0;         // 2 octets par forme : la direction de chaque bout
const PAS_D_UN_MASQUE = 0xB4B2A;         // mot signé par direction : le pas en cases
const SORTIES = 0xB49D3;                 // octet par forme : les côtés raccordés
const DIRECTION_OPPOSEE = 0xB8C35;       // octet par direction (bits 1, 2, 4, 8)
const FORME_D_APRES_LES_SORTIES = 0xB8BEF;
const PAS_DES_DIRECTIONS = 0xB4920;      // mot signé par direction 0 à 3 : −64, +1, +64, −1
const DIRECTIONS_OPPOSEES = 0xB48EC;     // mot par direction 0 à 3
const IMAGES_DES_VISITEURS = 0xB49F4;    // 0x24 octets par sorte de visiteur (visiteurs.js)
const KIOSQUE = 6;                       // type d'objet
// L'objet graphique d'un kiosque tourné vers chaque direction ([0xD3B38] + ce décalage).
const KIOSQUE_VERS = [0xD4, 0xD2, 0xDA, 0x1AA];

export const effacerUneFile = dansLeCadre(0x38, (jeu, cadre, numeroCase) => {
  const n = u16(numeroCase);
  const sol = (cel) => octet(jeu, cel + 2);
  const forme = (image) => octet(jeu, FORMES_DES_SOLS + image * 4);
  const drapeaux = (image) => mot(jeu, SOLS + image * 4);
  const cel = (long(jeu, CARTE) + n * 4) | 0;
  if (!(octet(jeu, SOLS + sol(cel) * 4) & FILE_D_ATTENTE)) return;
  poserMot(jeu, REDESSINER_CARTE, 1);

  // 1. Le sol.
  let image = sol(cel);
  if (octet(jeu, SOLS + sol(cel) * 4) & A_PART) {
    const ouvertures = octet(jeu, OUVERTURES_DES_ALLEES + forme(sol(cel)));
    if (ouvertures === 5) {
      poserOctet(jeu, cel + 2, 0x90);
      image = 0x7F;
    } else if (ouvertures === 0xA) {
      poserOctet(jeu, cel + 2, 0x91);
      image = 0x7E;
    }
  } else {
    poserOctet(jeu, cel + 2, 0);
  }

  // 2. Les deux bouts.
  for (let bout = 0; bout < 2; bout++) {
    const direction = octet(jeu, BOUTS_DES_FILES + forme(image) * 2 + bout);
    if (direction === 0) continue;
    const voisine = (cel + motSigne(jeu, PAS_D_UN_MASQUE + direction * 2) * 4) | 0;
    if (drapeaux(sol(voisine)) !== 0x48) {
      const sorties = octet(jeu, SORTIES + forme(sol(voisine)));
      const restantes = ~octet(jeu, DIRECTION_OPPOSEE + direction) & sorties;
      poserOctet(jeu, voisine + 2, octet(jeu, FORME_D_APRES_LES_SORTIES + restantes) + sol(voisine) - forme(sol(voisine)));
    }
    // Le premier bout redemande le fond de la carte, déjà demandé plus haut.
    if (bout === 0) poserMot(jeu, REDESSINER_CARTE, 1);
  }

  // 3. Les visiteurs qui attendaient sur la case.
  const objets = () => long(jeu, OBJETS);
  const objetNumero = (numero) => (objets() + numero * TAILLE_OBJET) | 0;
  const caseDe = (o) => (octet(jeu, o + 9) << 6) + octet(jeu, o + 7);
  for (let guide = objetNumero(motSigne(jeu, cel)); guide >>> 0 > objets() >>> 0;
    guide = objetNumero(motSigne(jeu, guide + 2))) {
    if (octet(jeu, guide + 4) !== 2 || octet(jeu, guide + 0xC) !== 0xC) continue;
    const attraction = objetNumero(mot(jeu, guide + 0x16));
    if (attraction >>> 0 <= objets() >>> 0) continue;
    let precedent = 0;
    let v = objetNumero(mot(jeu, attraction + 0x1E));
    while (v >>> 0 > objets() >>> 0) {
      if (caseDe(v) === n) {
        if (precedent !== 0) poserMot(jeu, precedent + 0x1E, 0);
        while (v >>> 0 > objets() >>> 0) {
          const suivant = mot(jeu, v + 0x1E);
          if (caseDe(v) === n) {
            jeu.appeler(CHOISIR_UNE_DESTINATION, guide);
            poserOctet(jeu, v + 0xC, 6);
            poserMot(jeu, v + 0x14, 0);
            const rang = mot(jeu, IMAGES_DES_VISITEURS + octet(jeu, guide + 0x59) * 0x24) + octet(jeu, guide + 0x12);
            poserMot(jeu, v + 0xA, mot(jeu, (long(jeu, FIGURES) + rang * 2) | 0));
          } else {
            poserOctet(jeu, v + 0xC, 0xA);
          }
          poserMot(jeu, v + 0x1E, 0);
          v = objetNumero(suivant);
        }
      }
      precedent = v;
      v = objetNumero(mot(jeu, v + 0x1E));
    }
    break;
  }

  // 4. Les kiosques tournés vers la case.
  for (let d = 0; d < 4; d++) {
    const voisine = (long(jeu, CARTE) + (motSigne(jeu, PAS_DES_DIRECTIONS + d * 2) + n) * 4) | 0;
    const kiosque = jeu.appeler(TROUVER_UN_OBJET, voisine, KIOSQUE);
    if (kiosque === 0) continue;
    if (motSigne(jeu, DIRECTIONS_OPPOSEES + octet(jeu, kiosque + 0x12) * 2) !== d) continue;
    const ici = u16(caseDe(kiosque));
    for (let k = 0; k < 4; k++) {
      // La case du kiosque d'abord (k = 0), puis ses voisines dans les directions 1 à 3.
      const w = (long(jeu, CARTE) + (k === 0 ? ici : ici + motSigne(jeu, PAS_DES_DIRECTIONS + k * 2)) * 4) | 0;
      if (!(octet(jeu, SOLS + sol(w) * 4) & FILE_D_ATTENTE)) continue;
      const sorties = octet(jeu, SORTIES + forme(sol(w)));
      if (!(sorties === 0 || sorties === 8 || sorties === 4 || sorties === 2 || sorties === 1)
        && !((1 << motSigne(jeu, DIRECTIONS_OPPOSEES + k * 2)) & sorties)) continue;
      // Le kiosque se tourne vers cette case.
      const vers = u16(ici + mot(jeu, PAS_DES_DIRECTIONS + k * 2));
      const tourner = (direction) => {
        poserMot(jeu, kiosque + 0xA, mot(jeu, (long(jeu, FIGURES) + KIOSQUE_VERS[direction]) | 0));
        poserOctet(jeu, kiosque + 0x12, direction);
      };
      if (vers === ici + 0x40) tourner(2);
      else if (vers === ici - 0x40) tourner(0);
      else if (vers === ici - 1) tourner(3);
      else if (vers === ici + 1) tourner(1);
      const masque = (1 << motSigne(jeu, DIRECTIONS_OPPOSEES + octet(jeu, kiosque + 0x12) * 2)) | sorties;
      poserOctet(jeu, w + 2, octet(jeu, FORME_D_APRES_LES_SORTIES + masque) + sol(w) - forme(sol(w)));
      break;
    }
  }
});

export const reecritures = [
  { adresse: 0x40641, nom: 'preparerLaCarte', fn: preparerLaCarte, arguments: 0 },
  { adresse: 0x3F975, nom: 'dessinerLaCarte', fn: dessinerLaCarte, arguments: 0, memoire: 'entiere' },
  { adresse: 0x1F53E, nom: 'dessinerUnMorceauDeVoie', fn: dessinerUnMorceauDeVoie, arguments: 3 },
  { adresse: 0x77A55, nom: 'ouvrirLeReleve', fn: ouvrirLeReleve, arguments: 0 },
  { adresse: 0x77B08, nom: 'afficherLeReleve', fn: afficherLeReleve, arguments: 0 },
  { adresse: 0x78B7E, nom: 'demanderSiDemolir', fn: demanderSiDemolir, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x78CEF, nom: 'ecranDuBus', fn: ecranDuBus, arguments: 0, retour: true, memoire: 'entiere' },
  { adresse: 0x2BCEE, nom: 'effacerUneFile', fn: effacerUneFile, arguments: 1, memoire: 'entiere' },
];

export const enAttente = [];
