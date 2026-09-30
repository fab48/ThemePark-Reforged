// Les catalogues surgissants, les feux d'artifice, et deux routines de dessin.
//
// Réécriture lisible des fonctions 0x67182, 0x6A658, 0x6A83E, 0x6A85C, 0x6A912, 0x6AA49, 0x6AC07,
// 0x6ADDB, 0x6AE91, 0x6BCDA, 0x6CD44 (les catalogues et leurs outils) et 0x6D4B7 à 0x6E7B2 (les feux d'artifice) du jeu
// d'origine. Voir docs/guide-reecriture.md.
//
// =================================================================================================
// LES CATALOGUES SURGISSANTS
// =================================================================================================
//
// CE QUE VOIT LE JOUEUR. Un clic droit sur un bouton de la barre d'outils (0x1788D, construire.js)
// ouvre par-dessus le parc le catalogue de l'outil : une fenêtre à barre de titre, une grille
// d'articles (image, nom, prix), un bouton de fermeture en haut à gauche, deux boutons en haut à
// droite, une barre en bas avec une poignée de redimensionnement dans le coin. On le déplace en
// tirant sa barre de titre ou sa barre du bas, on l'agrandit par le coin ; le survol d'un article
// en met le nom dans le titre (0x6BF89, panneau.js) ; le clic gauche le prend comme outil, le clic
// droit ouvre sa fiche (0x6B9CB, boucle.js). Les articles trop chers pour ce qui reste au joueur
// sont marqués ; ils sont triés du moins cher au plus cher.
//
// Il y a cinq catalogues, un par sorte d'article ; le numéro du catalogue est aussi celui de la
// sorte (0x6CD44) :
//
//   n°  articles                  table        fiche   son titre   au clic droit   la valeur va en
//   0   les chemins               0xD37DC      11      +0x348      0 (rien)        0xD6648
//   1   les attractions           0xCCEF2      0xC8    +0x338      1               0xD665A
//   2   les boutiques             0xD3C84      0x6B    +0x33C      2               0xD664A
//   3   les arbres et décors      0xCCA92      0x38    +0x340      4               0xD6646
//   4   le personnel              0xD35E2      0x36    +0x344      3               0xD6644
//
// (le titre est le texte de la table [0xD7BD0] à ce décalage ; « au clic droit » est le mot +0x217,
// l'écran de fiche qu'ouvre 0x35F21 ; « la valeur » est le pointeur +0x219, où le clic écrit
// l'octet +0xA de l'article, son rang dans la table.)
//
// LA FICHE D'UN CATALOGUE, 0x24F octets depuis 0xD6BCE :
//   +0, +2        mots signés : le coin haut gauche, à l'écran (coordonnées 640 × 400 ou 480)
//   +4, +6        mots signés : la largeur et la hauteur
//   +9            octet : l'état — 2 fermé, 4 ouvert, 6 bouton de fermeture enfoncé, 8 tiré par
//                 une barre, 0xA tiré par le coin, 0xC bouton de droite enfoncé, 0x10 bouton du
//                 milieu enfoncé
//   +0xA + 13 k   l'article k : +0 mot son nom ([0xD7BD0]), +2 mot son image, +4 mot long son
//                 prix, +8 mot l'outil qu'il donne, +0xA octet son rang dans la table, +0xB octet
//                 1 s'il est trop cher, +0xC un octet de sa fiche (non établi)
//   +0x212, +0x214  mots : le pas de la grille, en largeur et en hauteur (pairs ; de 0x46 à 0x140,
//                 et de 0x20 à 0x100)
//   +0x216        octet : le format de la grille, rang dans la table 0xB5094
//   +0x217, +0x219  voir plus haut
//   +0x21D, +0x21F  mots : là où le pointeur a pris la fenêtre, par rapport à son coin
//   +0x221        le titre, une chaîne
//   +0x249        mot : le catalogue ouvert juste derrière celui-ci (−1 : aucun)
//   +0x24B        mot : celui juste devant (−1 : aucun)
//   +0x24D        mot signé : ce que désigne le pointeur — un article (≥ 0), ou −1 le bouton de
//                 fermeture, −2 la barre de titre, −3 le bouton de droite, −4 la barre du bas,
//                 −5 le coin, −7 le bouton du milieu, −6 rien
//
// Les catalogues ouverts forment une liste doublement chaînée : le mot 0xB14B9 donne celui de
// devant (la souris l'essaie en premier, 0x6B9CB), le mot 0xB14BB celui du fond (dessiné en
// premier, 0x6BF89).
//
// LES FORMATS DE GRILLE, 0xB5094, 3 octets (le nombre d'articles au plus, les colonnes, les
// lignes) : 1 (1 × 1), 2 (2 × 1), 3 (3 × 1), 4 (4 × 1), 6 (3 × 2), 9 (3 × 3), 12 (4 × 3),
// 15 (5 × 3), 16 (4 × 4), 20 (5 × 4), 25 (5 × 5), 30 (6 × 5), 36 (6 × 6), 64 (8 × 8),
// 100 (10 × 10), puis 0. 0x6BCDA prend le premier dont le maximum dépasse le nombre d'articles :
// le format 0 est celui d'un catalogue vide.
//
// =================================================================================================
// LES FEUX D'ARTIFICE
// =================================================================================================
//
// La touche F (PARC ▸ FEUX D'ARTIFICE, 0x13BF3) les allume par 0x6D4B7 ; tant qu'ils le sont, la
// boucle du parc appelle 0x6D508 à chaque image. Le spectacle est un système de particules de
// 1 000 places, rangé en tableaux parallèles :
//
//   0xD8BA4            mot long : le nombre de places occupées (vivantes ou mortes)
//   0xDE1B0            mot : le nombre de particules vivantes
//   0xD8BA8 + 4 i      x, en 65 536es de pixel (l'écran fait 640 × 400)
//   0xD9B4C + 4 i      y, de même
//   0xDAAF0 + 4 i      z, la profondeur : la particule est projetée vers le centre de l'écran
//                      (320, 200) d'un facteur (1 024 − z / 32 768) / 1 024
//   0xDD20A + 2 i      mot signé : la vitesse en x ; 0xDBA94 + 4 i mot long : en y ;
//                      0xDD9DC + 2 i mot signé : en z. Chaque pas avance de 16 × la vitesse, et la
//                      pesanteur ajoute 0x80 à la vitesse en y
//   0xD7C00 + 4 i      mot long : la vie qui reste, en pas
//   0xDCA38 + 2 i      mot : la sorte, 0 = place libre. Ses trois bits bas : 1 une étincelle,
//                      2 une fusée, 3 une bombe. Bit 3 (8) : l'étincelle scintille (trois des quatre
//                      points d'un carré, qui tournent) ; bit 4 (0x10) : elle clignote en blanc
//                      (couleur 0xF1) quand il lui reste moins de 7 pas ; bits 5 à 8 : sa gamme
//                      de couleurs (16 × gamme + éclat + 1)
//   0xDE1AE            mot : la graine du hasard des feux (0x6E7B2)
//
// Le tir (0x6D508), à chaque image : une chance sur 34 (0x6D985) de lancer, par 0x6D6A8, une
// fusée depuis le bas de l'écran — une fois sur quatre, une bombe depuis le centre. En vol, une
// fusée laisse une traînée d'étincelles 0x21 et une bombe une traînée d'étincelles 0x31. À sa
// mort, la fusée éclate en une gerbe de 120 étincelles scintillantes d'une couleur tirée au sort
// (0x6E5FD), et la bombe en huit fusées (0x6D55D), qui éclatent à leur tour. Quand plus de 400
// places sont mortes, le tableau est tassé (0x6E673).

import { ecran } from './grande-vue.js';
import { reglages } from './reglages.js';

// --- arithmétique de 1994 -----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const u8 = (v) => v & 0xFF;

// Division entière signée du processeur (idiv), tronquée vers zéro ; un diviseur nul lève une
// exception, comme sur la machine.
function idiv(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}

const octet = (jeu, a) => jeu.m8[a];
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// --- les variables du jeu -----------------------------------------------------------------------
const MODE_VIDEO = 0xDE5F6;              // mot : bit 0 levé en 320x200
const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;
const CLIC_Y = 0xBECAA;                  // mot : l'ordonnée du pointeur au dernier appui (souris-jeu.js)
const APPUI_GAUCHE = 0xDE5A6;            // mot : le bouton gauche vient d'être appuyé
const GAUCHE_ENFONCE = 0xDE5AC;          // mot : le bouton gauche est tenu
const HAUT_DE_LA_VUE = 0xB9531;          // mot signé : le haut de la vue du parc, sous la barre de menus
const FICHE_COURANTE = 0xD3808;          // pointeur : la fiche du joueur ; +0xA le solde, +0xE l'engagé
const TEXTES_D_ACHAT = 0xD7BD0;          // table de textes : les noms des articles, les titres
const OBJETS_GRAPHIQUES = 0xD3B38;       // pointeur : un mot par image d'article, son objet graphique

const CATALOGUES = 0xD6BCE, TAILLE_CATALOGUE = 0x24F, TAILLE_ARTICLE = 0xD;
const CATALOGUE_DEVANT = 0xB14B9;        // mot signé : le catalogue de devant, −1 aucun
const CATALOGUE_DU_FOND = 0xB14BB;       // mot signé : celui du fond, −1 aucun
const CATALOGUE_SOUS_LE_POINTEUR = 0xB14BD;  // mot signé (boucle.js)
const DERNIER_FERME = 0xB14C4;           // mot : le catalogue fermé quand la liste s'est vidée (non établi)
const FORMATS = 0xB5094, TAILLE_FORMAT = 3;  // +0 le maximum, +1 les colonnes, +2 les lignes

// Les champs d'une fiche de catalogue.
const ETAT = 9, ARTICLES = 0xA, PAS_X = 0x212, PAS_Y = 0x214, FORMAT = 0x216;
const FICHE_AU_CLIC_DROIT = 0x217, DESTINATION = 0x219, PRISE_X = 0x21D, PRISE_Y = 0x21F;
const TITRE = 0x221, DERRIERE = 0x249, DEVANT = 0x24B, DESIGNE = 0x24D;

// Les états d'un catalogue, octet +9.
const FERME = 2, OUVERT = 4, FERMETURE_ENFONCEE = 6, TIRE = 8, AGRANDI = 0xA;
const BOUTON_DE_DROITE_ENFONCE = 0xC, BOUTON_DU_MILIEU_ENFONCE = 0x10;

// Ce que désigne le pointeur, mot +0x24D.
const BOUTON_FERMER = -1, BARRE_DE_TITRE = -2, BOUTON_DE_DROITE = -3, BARRE_DU_BAS = -4;
const COIN = -5, RIEN = -6, BOUTON_DU_MILIEU = -7;

// Les feux d'artifice.
const PLACES = 0xD8BA4;                  // mot long : les places occupées
const VIVANTES = 0xDE1B0;                // mot : les particules vivantes
const GRAINE_DES_FEUX = 0xDE1AE;         // mot
const FEUX_DE1B2 = 0xDE1B2, FEUX_DE1B3 = 0xDE1B3, FEUX_DE1B4 = 0xDE1B4;  // octets, remis à 0 à l'allumage (non établi)
const PX = 0xD8BA8, PY = 0xD9B4C, PZ = 0xDAAF0;           // mots longs
const VX = 0xDD20A, VY = 0xDBA94, VZ = 0xDD9DC;           // mot, mot long, mot
const VIE = 0xD7C00, SORTE = 0xDCA38;                     // mot long, mot
const ETINCELLE = 1, FUSEE = 2, BOMBE = 3;
const SCINTILLE = 8, CLIGNOTE = 0x10;
const BLANC = 0xF1;

// Les tables des images des sortes de visiteurs (dessin-attractions.js).
const IMAGES_PAR_SORTE = 0xB9A78;        // 8 lignes de 47 mots (0x5E octets)
const IMAGES_B9D68 = 0xB9D68;            // 8 lignes de 23 mots (0x2E octets) ; rôle non établi
const IMAGES_D_ENTRACTE = 0xB9A58;       // 8 × deux mots
const DECALAGES_DES_SORTES = 0x6A648;    // 8 mots dans le code : 0, 0, 1, 2, 19, 20, 21, 22
const TABLE_D3B0C = 0xD3B0C;             // pointeur : 4 octets par entrée, +0 mot un nombre d'images

// Les objets graphiques (objets.js).
const OBJETS = 0xD3B80;                  // pointeur : 8 octets, +0 premier morceau, +2 et +3 l'emprise
const MORCEAUX = 0xD3B7C;                // pointeur : 10 octets, +0 image, +2 dx, +4 dy, +8 suivant
const IMAGES = 0xD3BB8;                  // pointeur : 6 octets, +4 largeur, +5 hauteur

// --- les fonctions appelées ---------------------------------------------------------------------
const RAMENER_DEVANT = 0x6AA49;          // (catalogue)
const REDUIRE = 0x6ADDB;                 // (catalogue) : la grille au plus petit pas, bord droit gardé
const AGRANDIR_EN_GRAND = 0x6AC07;       // (catalogue) : la fenêtre en x = 0, sous la barre de menus,
                                         // toute la largeur et toute la hauteur de l'écran
const COPIER_CHAINE = 0x7E1ED;           // strcpy (destination, source)
const TRIER = 0x811AA;                   // qsort (base, nombre, taille, comparaison)
const TRACER_IMAGE_A_L_ECHELLE = 0x66DFA;  // (image, x, y, largeur, hauteur)
const BRUITAGE = 0x80C80;                // (propriétaire, bruitage)
const BRUITAGE_UNIQUE = 0x80FE0;         // (propriétaire, bruitage), sauf s'il joue déjà
const POINT_320 = 0x80C00;               // (x, y, couleur) : un pixel en (x/2, y/2) en 320x200
const POINT_640 = 0x80C40;               // (x, y, couleur) : un pixel en 640x480
const MARQUER_ZONE_SALE = 0x54D38;       // (x, y, largeur, hauteur), ecran.js

const basseResolution = (jeu) => (octet(jeu, MODE_VIDEO) & 1) !== 0;
const catalogue = (n) => (CATALOGUES + n * TAILLE_CATALOGUE) >>> 0;
const colonnesDuFormat = (jeu, c) => octet(jeu, FORMATS + TAILLE_FORMAT * octet(jeu, c + FORMAT) + 1);
const lignesDuFormat = (jeu, c) => octet(jeu, FORMATS + TAILLE_FORMAT * octet(jeu, c + FORMAT) + 2);

// =================================================================================================
// 0x6A83E — COMPARER DEUX ARTICLES PAR LEUR PRIX
// =================================================================================================

// La fonction de comparaison du tri des catalogues (qsort, 0x811AA) : l'écart des prix, mots longs
// à +4 des deux articles.
export function comparerLesPrix(jeu, a, b) {
  return (long(jeu, a + 4) - long(jeu, b + 4)) | 0;
}

// =================================================================================================
// 0x6A85C, 0x6A912, 0x6AA49, 0x6AC07, 0x6ADDB — OUVRIR, FERMER, RAMENER DEVANT, AGRANDIR, RÉDUIRE
// =================================================================================================

// 0x6A85C — ouvrir un catalogue fermé : il passe devant les autres, sa grille est remplie et mise
// en forme (0x6BCDA), et le pointeur n'y désigne rien.
export function ouvrirLeCatalogue(jeu, n) {
  n = u16(n);
  const c = catalogue(n);
  const devant = motSigne(jeu, CATALOGUE_DEVANT);
  if (devant === -1) {
    poserMot(jeu, CATALOGUE_DU_FOND, n);
    poserMot(jeu, c + DERRIERE, -1);
  } else {
    poserMot(jeu, catalogue(devant) + DEVANT, n);
    poserMot(jeu, c + DERRIERE, devant);
  }
  poserMot(jeu, CATALOGUE_DEVANT, n);
  poserMot(jeu, c + DEVANT, -1);
  poserOctet(jeu, c + ETAT, OUVERT);
  reglerLeCatalogue(jeu, n);
  poserMot(jeu, c + DESIGNE, RIEN);
}

// 0x6A912 — fermer un catalogue : le retirer de la liste des ouverts.
//
// ANOMALIE D'ORIGINE : le cas « seul ouvert » se reconnaît à ce que le catalogue de devant soit
// aussi celui du fond, sans vérifier que c'est celui qu'on ferme ; c'est aussi le seul cas qui
// oublie le catalogue sous le pointeur et note le catalogue fermé en 0xB14C4.
export function fermerLeCatalogue(jeu, n) {
  n = u16(n);
  const c = catalogue(n);
  if (mot(jeu, CATALOGUE_DEVANT) === mot(jeu, CATALOGUE_DU_FOND)) {
    poserMot(jeu, CATALOGUE_DEVANT, -1);
    poserMot(jeu, CATALOGUE_DU_FOND, -1);
    poserMot(jeu, CATALOGUE_SOUS_LE_POINTEUR, -1);
    poserMot(jeu, DERNIER_FERME, n);
  } else if (motSigne(jeu, CATALOGUE_DEVANT) === n) {
    poserMot(jeu, CATALOGUE_DEVANT, mot(jeu, c + DERRIERE));
    poserMot(jeu, catalogue(motSigne(jeu, CATALOGUE_DEVANT)) + DEVANT, -1);
  } else if (motSigne(jeu, CATALOGUE_DU_FOND) === n) {
    poserMot(jeu, CATALOGUE_DU_FOND, mot(jeu, c + DEVANT));
    poserMot(jeu, catalogue(motSigne(jeu, CATALOGUE_DU_FOND)) + DERRIERE, -1);
  } else {
    poserMot(jeu, catalogue(motSigne(jeu, c + DERRIERE)) + DEVANT, mot(jeu, c + DEVANT));
    poserMot(jeu, catalogue(motSigne(jeu, c + DEVANT)) + DERRIERE, mot(jeu, c + DERRIERE));
  }
  poserOctet(jeu, c + ETAT, FERME);
}

// 0x6AA49 — ramener un catalogue ouvert devant les autres (le clic droit sur son outil, 0x1788D ;
// la saisie de sa barre, 0x6AE91). Il est retiré de la liste et remis en tête ; il est ouvert, et
// le pointeur n'y désigne plus rien.
//
// Celui qui est DÉJÀ devant passe au fond, derrière tous les autres : un second clic droit sur
// l'outil renvoie son catalogue derrière (0x6AE91 ne l'appelle que pour un catalogue qui n'est pas
// devant). Seul ouvert, il ne bouge pas, et son état n'est pas touché.
//
// Les comparaisons mettent le numéro reçu, un mot non signé, en regard des mots signés de la
// liste : un catalogue « −1 » ne serait jamais reconnu (il n'y en a pas).
export function ramenerDevant(jeu, n) {
  n = u16(n);
  const c = catalogue(n);
  if (motSigne(jeu, CATALOGUE_DEVANT) === n) {
    if (motSigne(jeu, CATALOGUE_DU_FOND) === n) return;
    // Devant : il passe au fond.
    poserMot(jeu, CATALOGUE_DEVANT, mot(jeu, c + DERRIERE));
    poserMot(jeu, catalogue(motSigne(jeu, CATALOGUE_DEVANT)) + DEVANT, -1);
    poserMot(jeu, catalogue(motSigne(jeu, CATALOGUE_DU_FOND)) + DERRIERE, n);
    poserMot(jeu, c + DEVANT, mot(jeu, CATALOGUE_DU_FOND));
    poserMot(jeu, c + DERRIERE, -1);
    poserMot(jeu, CATALOGUE_DU_FOND, n);
  } else {
    // Le retirer de la liste : au fond, ou au milieu.
    if (motSigne(jeu, CATALOGUE_DU_FOND) === n) {
      poserMot(jeu, CATALOGUE_DU_FOND, mot(jeu, c + DEVANT));
      poserMot(jeu, catalogue(motSigne(jeu, CATALOGUE_DU_FOND)) + DERRIERE, -1);
    } else {
      poserMot(jeu, catalogue(motSigne(jeu, c + DERRIERE)) + DEVANT, mot(jeu, c + DEVANT));
      poserMot(jeu, catalogue(motSigne(jeu, c + DEVANT)) + DERRIERE, mot(jeu, c + DERRIERE));
    }
    // puis le mettre en tête.
    poserMot(jeu, catalogue(motSigne(jeu, CATALOGUE_DEVANT)) + DEVANT, n);
    poserMot(jeu, c + DERRIERE, mot(jeu, CATALOGUE_DEVANT));
    poserMot(jeu, c + DEVANT, -1);
    poserMot(jeu, CATALOGUE_DEVANT, n);
  }
  poserOctet(jeu, c + ETAT, OUVERT);
  poserMot(jeu, c + DESIGNE, RIEN);
}

// La taille de la fenêtre d'après le pas de sa grille : 8 pixels de bords en largeur, 0x28 en
// hauteur (la barre de titre et celle du bas), et des cases qui se chevauchent de deux pixels.
function taillerSurLaGrille(jeu, c) {
  poserMot(jeu, c + 4, Math.imul(colonnesDuFormat(jeu, c), mot(jeu, c + PAS_X) - 2) + 8);
  poserMot(jeu, c + 6, Math.imul(lignesDuFormat(jeu, c), mot(jeu, c + PAS_Y) - 2) + 0x28);
}

// 0x6AC07 — agrandir un catalogue à tout l'écran (son bouton du milieu) : la fenêtre prend toute la
// largeur, du bord gauche, et toute la hauteur sous la barre de menus ; le pas de la grille en
// découle, borné comme au redimensionnement par le coin (0x6AE91) et rendu pair, puis la fenêtre
// est retaillée sur la grille — elle ne remplit donc l'écran qu'aux arrondis près.
export function agrandirALEcran(jeu, n) {
  n = u16(n);
  const c = catalogue(n);
  const hauteurEcran = basseResolution(jeu) ? 0x190 : ecran.hauteur;
  poserMot(jeu, c, 0);
  poserMot(jeu, c + 2, mot(jeu, HAUT_DE_LA_VUE));
  poserMot(jeu, c + 4, ecran.largeur);          // 0x280 (grande-vue.js)
  poserMot(jeu, c + 6, hauteurEcran - mot(jeu, c + 2));
  poserMot(jeu, c + PAS_X, idiv(motSigne(jeu, c + 4) - 8, colonnesDuFormat(jeu, c)) + 2);
  poserMot(jeu, c + PAS_Y, idiv(motSigne(jeu, c + 6) - 0x28, lignesDuFormat(jeu, c)) + 2);
  if (motSigne(jeu, c + PAS_X) < 0x46) poserMot(jeu, c + PAS_X, 0x46);
  if (motSigne(jeu, c + PAS_Y) < 0x20) poserMot(jeu, c + PAS_Y, 0x20);
  if (motSigne(jeu, c + PAS_X) > 0x140) poserMot(jeu, c + PAS_X, 0x140);
  if (motSigne(jeu, c + PAS_Y) > 0x100) poserMot(jeu, c + PAS_Y, 0x100);
  poserMot(jeu, c + PAS_X, mot(jeu, c + PAS_X) & ~1);
  poserMot(jeu, c + PAS_Y, mot(jeu, c + PAS_Y) & ~1);
  taillerSurLaGrille(jeu, c);
}

// 0x6ADDB — réduire un catalogue (son bouton de droite) : la grille au plus petit pas (0x46 × 0x20),
// la fenêtre retaillée sur elle, et déplacée pour garder son bord droit où il était.
export function reduireLeCatalogue(jeu, n) {
  n = u16(n);
  const c = catalogue(n);
  poserMot(jeu, c + PAS_X, 0x46);
  poserMot(jeu, c + PAS_Y, 0x20);
  const ancienneLargeur = mot(jeu, c + 4);
  taillerSurLaGrille(jeu, c);
  poserMot(jeu, c, mot(jeu, c) + ancienneLargeur - mot(jeu, c + 4));
}

// =================================================================================================
// 0x6CD44 — REMPLIR LA GRILLE D'UN CATALOGUE
// =================================================================================================

// Les cinq sortes d'articles (voir l'en-tête). `actif` : l'octet dont le bit 0 dit que l'article
// est disponible (les chemins et le personnel le sont toujours) ; `prix` : un mot, ou un mot long
// (`prixLong`) ; `outil` : un champ de la fiche, ou une valeur fixe (`outilFixe`).
const SORTES = [
  { table: 0xD37DC, taille: 0xB, actif: -1, prix: 6, prixLong: false, image: 2, outil: 8, octet: 0xA,
    auClicDroit: 0, destination: 0xD6648, titre: 0x348 },
  { table: 0xCCEF2, taille: 0xC8, actif: 0xA3, prix: 0x80, prixLong: true, image: 0x9D, outil: 0x93, octet: 0xA5,
    auClicDroit: 1, destination: 0xD665A, titre: 0x338 },
  { table: 0xD3C84, taille: 0x6B, actif: 0x44, prix: 0x27, prixLong: true, image: 4, outilFixe: 6, octet: 0x46,
    auClicDroit: 2, destination: 0xD664A, titre: 0x33C },
  { table: 0xCCA92, taille: 0x38, actif: 0x13, prix: 6, prixLong: false, image: 2, outil: 8, octet: 0x15,
    auClicDroit: 4, destination: 0xD6646, titre: 0x340 },
  { table: 0xD35E2, taille: 0x36, actif: -1, prix: 2, prixLong: false, image: 8, outilFixe: 9, octet: 0x11,
    auClicDroit: 3, destination: 0xD6644, titre: 0x344 },
];

// Remplir le catalogue n avec les articles disponibles de la sorte n, marquer ceux que le joueur ne
// peut pas payer (solde moins l'engagé), écrire le titre, puis trier par prix. Rend le nombre
// d'articles.
//
// ANOMALIE D'ORIGINE : pour un numéro au-delà de 4, rien n'est rempli, et le nombre d'articles
// trié et rendu est celui que contient la variable locale [ebp-4], jamais écrite : un reste de
// pile, 20 octets sous l'entrée. Le jeu n'ouvre que les catalogues 0 à 4 ; la réécriture relit
// l'octet au même endroit, sans que ce chemin ait pu être éprouvé.
export function remplirLaGrille(jeu, n, entree) {
  n = u16(n);
  const c = catalogue(n);
  const sorte = SORTES[n];
  let nombre;
  if (!sorte) {
    nombre = long(jeu, (entree - 20) >>> 0);
  } else {
    nombre = 0;
    const fiche = long(jeu, FICHE_COURANTE);
    for (let i = 0; ; i = u16(i + 1)) {
      const f = sorte.table + i * sorte.taille;
      if (mot(jeu, f) === 0) break;
      if (sorte.actif >= 0 && (octet(jeu, f + sorte.actif) & 1) === 0) continue;
      const disponible = (long(jeu, fiche + 0xA) - long(jeu, fiche + 0xE)) | 0;
      const prix = sorte.prixLong ? longSigne(jeu, f + sorte.prix) : mot(jeu, f + sorte.prix);
      const a = c + ARTICLES + TAILLE_ARTICLE * u16(nombre);
      poserOctet(jeu, a + 0xB, disponible < prix ? 1 : 0);
      poserMot(jeu, a, mot(jeu, f));
      poserMot(jeu, a + 2, mot(jeu, long(jeu, OBJETS_GRAPHIQUES) + 2 * mot(jeu, f + sorte.image)));
      poserLong(jeu, a + 4, prix);
      poserMot(jeu, a + 8, sorte.outilFixe ?? mot(jeu, f + sorte.outil));
      poserOctet(jeu, a + 0xC, octet(jeu, f + sorte.octet));
      poserOctet(jeu, a + 0xA, i);
      nombre = (nombre + 1) | 0;
    }
    poserMot(jeu, c + FICHE_AU_CLIC_DROIT, sorte.auClicDroit);
    poserLong(jeu, c + DESTINATION, sorte.destination);
    jeu.appeler(COPIER_CHAINE, c + TITRE, long(jeu, long(jeu, TEXTES_D_ACHAT) + sorte.titre));
  }
  jeu.appeler(TRIER, c + ARTICLES, u16(nombre), TAILLE_ARTICLE, 0x6A83E);
  return nombre;
}

// =================================================================================================
// 0x6BCDA — METTRE EN FORME LA GRILLE D'UN CATALOGUE
// =================================================================================================

// Remplir le catalogue, choisir le plus petit format qui contienne ses articles, effacer les cases
// en trop, puis donner sa taille à la fenêtre. Une fenêtre neuve (largeur nulle) se pose en
// x = 0x70, 20 pixels au-dessus de l'endroit du clic (mais pas plus haut que la vue), avec le pas
// par défaut 0x69 × 0x48 ; sinon le pas se déduit de la taille qu'a la fenêtre. La fenêtre est
// enfin ramenée dans l'écran. Rien de tout cela pour un catalogue vide.
export function reglerLeCatalogue(jeu, n) {
  n = u16(n);
  const c = catalogue(n);
  const largeurEcran = ecran.largeur;           // 0x280 (grande-vue.js : plus en grande vue)
  const hauteurEcran = basseResolution(jeu) ? 0x190 : ecran.hauteur;
  // appelée par son entrée : un catalogue au-delà de 4 relit un reste de pile (voir 0x6CD44)
  const nombre = u8(jeu.appeler(0x6CD44, n));

  poserOctet(jeu, c + FORMAT, 0);
  while (nombre >= octet(jeu, FORMATS + TAILLE_FORMAT * octet(jeu, c + FORMAT))) {
    poserOctet(jeu, c + FORMAT, octet(jeu, c + FORMAT) + 1);
  }
  for (let k = nombre; k < octet(jeu, FORMATS + TAILLE_FORMAT * octet(jeu, c + FORMAT)); k = u8(k + 1)) {
    poserMot(jeu, c + ARTICLES + TAILLE_ARTICLE * k, 0);
  }
  if (octet(jeu, c + FORMAT) === 0) return;

  if (mot(jeu, c + 4) === 0) {
    // (En grande vue, grande-vue.js, au-dessus de la barre d'outils, centrée de `ecran.barreX`.)
    poserMot(jeu, c, 0x70 + ecran.barreX);
    poserMot(jeu, c + 2, mot(jeu, CLIC_Y) - 0x14);
    if (motSigne(jeu, c + 2) < motSigne(jeu, HAUT_DE_LA_VUE)) poserMot(jeu, c + 2, mot(jeu, HAUT_DE_LA_VUE));
    poserMot(jeu, c + PAS_X, 0x69);
    poserMot(jeu, c + PAS_Y, 0x48);
  } else {
    poserMot(jeu, c + PAS_X, idiv(motSigne(jeu, c + 4) - 8, colonnesDuFormat(jeu, c)) + 2);
    poserMot(jeu, c + PAS_Y, idiv(motSigne(jeu, c + 6) - 0x28, lignesDuFormat(jeu, c)) + 2);
    if (motSigne(jeu, c + PAS_X) < 0x46) poserMot(jeu, c + PAS_X, 0x46);
    if (motSigne(jeu, c + PAS_Y) < 0x20) poserMot(jeu, c + PAS_Y, 0x20);
  }
  if (motSigne(jeu, c + PAS_X) > 0x140) poserMot(jeu, c + PAS_X, 0x140);
  if (motSigne(jeu, c + PAS_Y) > 0x100) poserMot(jeu, c + PAS_Y, 0x100);
  poserMot(jeu, c + PAS_X, mot(jeu, c + PAS_X) & 0xFFFE);
  poserMot(jeu, c + PAS_Y, mot(jeu, c + PAS_Y) & 0xFFFE);

  // La fenêtre : 4 pixels de bord de chaque côté, et 40 de hauteur pour le titre et le bas ; les
  // cases se chevauchent de 2 pixels.
  poserMot(jeu, c + 4, colonnesDuFormat(jeu, c) * (mot(jeu, c + PAS_X) - 2) + 8);
  poserMot(jeu, c + 6, lignesDuFormat(jeu, c) * (mot(jeu, c + PAS_Y) - 2) + 0x28);
  if (motSigne(jeu, c) + motSigne(jeu, c + 4) > largeurEcran) poserMot(jeu, c, largeurEcran - mot(jeu, c + 4));
  if (motSigne(jeu, c + 2) + motSigne(jeu, c + 6) > hauteurEcran) poserMot(jeu, c + 2, hauteurEcran - mot(jeu, c + 6));
}

// =================================================================================================
// 0x6AE91 — LA SOURIS SUR UN CATALOGUE
// =================================================================================================

// Appelée à chaque image pour le catalogue sous le pointeur (0x6B9CB). Selon l'état du catalogue :
//
//  - ouvert : un appui gauche sur un bouton l'enfonce, sur une barre saisit la fenêtre (le
//    catalogue passe alors devant), sur le coin commence à l'agrandir ; puis, si rien de cela,
//    on cherche l'article sous le pointeur ;
//  - un bouton enfoncé : au relâcher, s'il est encore dessus, son effet — fermer (0x6A912),
//    réduire (0x6ADDB), ou agrandir à tout l'écran (0x6AC07, le bouton du milieu) ; le bouton
//    reste éclairé tant que le pointeur est dessus ;
//  - saisi par une barre : la fenêtre suit le pointeur, sans sortir de l'écran ni monter sur la
//    barre de menus ;
//  - saisi par le coin : le pas de la grille suit le pointeur, borné, et la fenêtre avec lui.
//
// Les zones, par rapport au rectangle (x, y, droite, bas) de la fenêtre, bornes comprises :
//   la barre de titre, lignes y + 2 à y + 14 : fermer, colonnes x + 2 à x + 14 ; la barre,
//   x + 18 à droite − 34 (droite − 18 pour un catalogue vide) ; le bouton du milieu, droite − 30 à
//   droite − 18 ; le bouton de droite, droite − 14 à droite − 2 ;
//   la barre du bas, lignes bas − 14 à bas − 2 : la barre, x + 2 à droite − 18 ; le coin,
//   droite − 14 à droite − 2 ;
//   la grille, colonnes x + 2 à droite − 2, lignes y + 18 à bas − 18.
//
// ANOMALIES D'ORIGINE :
//  - le bouton de droite enfoncé (état 0xC) s'éclaire quand le pointeur est sur le bouton du
//    milieu : le test d'éclairage est celui de l'état 0x10 ;
//  - dans la recherche de l'article, un article trouvé n'arrête que le parcours de sa ligne : les
//    lignes suivantes sont encore parcourues, avec un rang en retard d'un (le rang n'avance pas sur
//    l'article trouvé), et un second article « trouvé » écraserait le premier. Les cases se
//    chevauchant de deux pixels pour des zones qui s'en écartent de deux, cela ne se voit pas.
export function sourisSurLeCatalogue(jeu, n) {
  n = u16(n);
  const c = catalogue(n);
  const largeurEcran = ecran.largeur;           // 0x280 (grande-vue.js : plus en grande vue)
  const hauteurEcran = basseResolution(jeu) ? 0x190 : ecran.hauteur;
  const x = motSigne(jeu, c), y = motSigne(jeu, c + 2);
  const largeur = motSigne(jeu, c + 4), hauteur = motSigne(jeu, c + 6);
  const droite = s16(x + largeur), bas = s16(y + hauteur);
  const sx = motSigne(jeu, SOURIS_X), sy = motSigne(jeu, SOURIS_Y);
  const entre = (v, a, b) => v >= a && v <= b;
  const sur = (x0, x1, y0, y1) => entre(sx, x0, x1) && entre(sy, y0, y1);
  const designer = (v) => poserMot(jeu, c + DESIGNE, v);
  const etat = (v) => poserOctet(jeu, c + ETAT, v);
  const oublierLAppui = () => poserMot(jeu, APPUI_GAUCHE, 0);
  const gaucheEnfonce = mot(jeu, GAUCHE_ENFONCE) !== 0;
  const vide = octet(jeu, c + FORMAT) === 0;

  // Saisir la fenêtre par une de ses barres : noter la prise, la ramener devant.
  const saisir = (barre) => {
    poserMot(jeu, c + PRISE_X, sx - x);
    poserMot(jeu, c + PRISE_Y, sy - y);
    if (n !== motSigne(jeu, CATALOGUE_DEVANT)) jeu.appeler(RAMENER_DEVANT, n);
    etat(TIRE);
    designer(barre);
    oublierLAppui();
  };
  const enfoncer = (nouvelEtat, bouton) => { etat(nouvelEtat); designer(bouton); oublierLAppui(); };

  switch (octet(jeu, c + ETAT)) {
    case OUVERT: {
      designer(RIEN);
      if (mot(jeu, APPUI_GAUCHE) !== 0) {
        if (entre(sy, y + 2, y + 0xE)) {
          if (entre(sx, x + 2, x + 0xE)) enfoncer(FERMETURE_ENFONCEE, BOUTON_FERMER);
          else if (entre(sx, x + 0x12, droite - 0x12) && vide) saisir(BARRE_DE_TITRE);
          else if (entre(sx, x + 0x12, droite - 0x22)) saisir(BARRE_DE_TITRE);
          else if (entre(sx, droite - 0x1E, droite - 0x12)) enfoncer(BOUTON_DU_MILIEU_ENFONCE, BOUTON_DU_MILIEU);
          else if (entre(sx, droite - 0xE, droite - 2)) enfoncer(BOUTON_DE_DROITE_ENFONCE, BOUTON_DE_DROITE);
        } else if (entre(sy, bas - 0xE, bas - 2) && !vide) {
          if (entre(sx, x + 2, droite - 0x12)) {
            saisir(BARRE_DU_BAS);
          } else if (entre(sx, droite - 0xE, droite - 2)) {
            etat(AGRANDI);
            poserMot(jeu, c + PRISE_X, droite - sx);
            poserMot(jeu, c + PRISE_Y, bas - sy);
            designer(COIN);
            oublierLAppui();
          }
        }
      }
      if (motSigne(jeu, c + DESIGNE) === RIEN && octet(jeu, c + FORMAT) !== 0) chercherLArticle(jeu, c, x, y, droite, bas, sx, sy);
      break;
    }

    case FERMETURE_ENFONCEE: {
      const surLeBouton = () => sur(x + 2, x + 0xE, y + 2, y + 0xE);
      if (!gaucheEnfonce) {
        if (surLeBouton()) fermerLeCatalogue(jeu, n);
        else etat(OUVERT);
        designer(RIEN);
      }
      designer(surLeBouton() ? BOUTON_FERMER : RIEN);
      break;
    }

    case TIRE: {
      if (!gaucheEnfonce) { etat(OUVERT); designer(RIEN); break; }
      // Le nouveau coin : là où est le pointeur, moins la prise, ramené dans l'écran, pair.
      let nx = u16(sx - mot(jeu, c + PRISE_X));
      if (s16(nx) < 0) nx = 0;
      else if (s16(nx) + largeur >= largeurEcran) nx = largeurEcran - largeur;
      poserMot(jeu, c, nx & 0xFFFE);
      let ny = u16(sy - mot(jeu, c + PRISE_Y));
      if (s16(ny) < motSigne(jeu, HAUT_DE_LA_VUE)) ny = mot(jeu, HAUT_DE_LA_VUE);
      else if (s16(ny) + hauteur >= hauteurEcran) ny = hauteurEcran - hauteur - 2;
      poserMot(jeu, c + 2, ny & 0xFFFE);
      // prise à plus de 30 pixels du haut : c'est la barre du bas qui est tirée
      designer(motSigne(jeu, c + PRISE_Y) > 0x1E ? BARRE_DU_BAS : BARRE_DE_TITRE);
      break;
    }

    case AGRANDI: {
      if (!gaucheEnfonce) { etat(OUVERT); designer(RIEN); break; }
      // La largeur voulue : jusqu'au pointeur (plus ce qui le séparait du coin), au plus jusqu'à
      // 6 pixels du bord de l'écran ; le pas en découle, borné et pair.
      const colonnes = colonnesDuFormat(jeu, c);
      const voulueX = motSigne(jeu, c + PRISE_X) + sx >= largeurEcran
        ? s16(u16(largeurEcran - mot(jeu, c)) - 6)
        : s16(sx - mot(jeu, c) + mot(jeu, c + PRISE_X) - 8);
      let pasX = idiv(voulueX, colonnes) + 2;
      if (s16(pasX) < 0x46) pasX = 0x46;
      else if (s16(pasX) > 0x140) pasX = 0x140;
      pasX &= ~1;
      poserMot(jeu, c + PAS_X, pasX);
      poserMot(jeu, c + 4, Math.imul(pasX - 2, colonnesDuFormat(jeu, c)) + 8);

      const lignes = lignesDuFormat(jeu, c);
      const voulueY = motSigne(jeu, c + PRISE_Y) + sy >= hauteurEcran
        ? s16(u16(hauteurEcran - mot(jeu, c + 2)) - 0x26)
        : s16(sy - mot(jeu, c + 2) + mot(jeu, c + PRISE_Y) - 0x28);
      let pasY = idiv(voulueY, lignes) + 2;
      if (s16(pasY) < 0x20) pasY = 0x20;
      else if (s16(pasY) > 0x100) pasY = 0x100;
      pasY &= ~1;
      poserMot(jeu, c + PAS_Y, pasY);
      poserMot(jeu, c + 6, Math.imul(pasY - 2, lignesDuFormat(jeu, c)) + 0x28);
      designer(COIN);
      break;
    }

    case BOUTON_DE_DROITE_ENFONCE: {
      if (!gaucheEnfonce) {
        if (sur(droite - 0xE, droite - 2, y + 2, y + 0xE)) jeu.appeler(REDUIRE, n);
        etat(OUVERT);
        designer(RIEN);
      }
      // l'anomalie : c'est la zone du bouton du milieu qui est testée
      designer(sur(droite - 0x1E, droite - 0x12, y + 2, y + 0xE) ? BOUTON_DU_MILIEU : RIEN);
      break;
    }

    case BOUTON_DU_MILIEU_ENFONCE: {
      const surLeBouton = () => sur(droite - 0x1E, droite - 0x12, y + 2, y + 0xE);
      if (!gaucheEnfonce) {
        if (surLeBouton()) jeu.appeler(AGRANDIR_EN_GRAND, n);
        etat(OUVERT);
        designer(RIEN);
      }
      designer(surLeBouton() ? BOUTON_DU_MILIEU : RIEN);
      break;
    }

    default:
      break;
  }
}

// L'article sous le pointeur, parcouru ligne par ligne dans la grille. Une case de la grille occupe
// un pas moins deux pixels ; la zone sensible d'un article en laisse deux à gauche, deux à droite,
// quatorze en haut et deux en bas. Les cases vides (nom nul) ne comptent pas dans le rang.
function chercherLArticle(jeu, c, x, y, droite, bas, sx, sy) {
  if (!(sx >= x + 2 && sx <= droite - 2 && sy >= y + 0x12 && sy <= bas - 0x12)) return;
  let rang = 0;
  let haut = u16(y + 0x14);
  for (let lignes = lignesDuFormat(jeu, c); u16(lignes) !== 0; lignes--) {
    let gauche = u16(x + 4);
    for (let colonnes = colonnesDuFormat(jeu, c); u16(colonnes) !== 0; colonnes--) {
      if (mot(jeu, c + ARTICLES + TAILLE_ARTICLE * rang) !== 0) {
        if (sx >= gauche + 2 && sx <= motSigne(jeu, c + PAS_X) + gauche - 2
          && sy >= haut + 0xE && sy <= motSigne(jeu, c + PAS_Y) + haut - 2) {
          poserMot(jeu, c + DESIGNE, rang);
          break;                     // l'anomalie : seule la ligne s'arrête
        }
        rang = u8(rang + 1);
      }
      gauche = u16(gauche + mot(jeu, c + PAS_X) - 2);
    }
    haut = u16(haut + mot(jeu, c + PAS_Y) - 2);
  }
}

// =================================================================================================
// 0x67182 — TRACER UN OBJET GRAPHIQUE EN RÉDUCTION
// =================================================================================================

// Tracer l'objet graphique ramené à `largeur` × `hauteur` : chaque morceau est posé à son
// décalage divisé par l'échelle, et son image tracée à sa taille divisée de même (0x66DFA). Les
// échelles sont en 256es : l'emprise de l'objet (octets +2 et +3) × 256 / la taille voulue. Une
// taille nulle ne trace rien. C'est la vue réduite (objets.js), et la miniature d'une attraction.
export function tracerEnReduction(jeu, objet, x, y, largeur, hauteur) {
  const g = long(jeu, OBJETS) + u16(objet) * 8;
  if (u16(largeur) === 0 || u16(hauteur) === 0) return;
  const echelleX = idiv(octet(jeu, g + 2) << 8, u16(largeur));
  const echelleY = idiv(octet(jeu, g + 3) << 8, u16(hauteur));
  const morceaux = long(jeu, MORCEAUX);
  for (let m = (morceaux + mot(jeu, g) * 10) >>> 0; m > morceaux; m = (morceaux + mot(jeu, m + 8) * 10) >>> 0) {
    const image = (long(jeu, IMAGES) + mot(jeu, m)) >>> 0;
    if (image <= long(jeu, IMAGES)) continue;       // un morceau sans image
    const dx = idiv(motSigne(jeu, m + 2) << 8, u16(echelleX));
    const dy = idiv(motSigne(jeu, m + 4) << 8, u16(echelleY));
    const h = u16(idiv(octet(jeu, image + 5) << 8, u16(echelleY)));
    const l = u16(idiv(octet(jeu, image + 4) << 8, u16(echelleX)));
    jeu.appeler(TRACER_IMAGE_A_L_ECHELLE, image, s16(x + dx), s16(y + dy), l, h);
  }
}

// =================================================================================================
// 0x6A658 — DÉCALER LES IMAGES DES SORTES DE VISITEURS
// =================================================================================================

// Au démarrage (0x104A3) : les tables d'images des sortes 1 à 7 sont décalées, chacune de 6 × le
// mot +0 de l'entrée de [0xD3B0C] que désigne la table 0x6A648 (0, 1, 2, 19, 20, 21, 22) — six
// octets par image : le nombre d'images qui précèdent celles de la sorte, vraisemblablement.
// La sorte 0 garde ses décalages.
export function decalerLesImagesDesSortes(jeu) {
  for (let sorte = 1; sorte < 8; sorte++) {
    const entree = long(jeu, TABLE_D3B0C) + mot(jeu, DECALAGES_DES_SORTES + 2 * sorte) * 4;
    const decalage = () => Math.imul(mot(jeu, entree), 6);
    for (let j = 0; j < 0x2F; j++) {
      const a = IMAGES_PAR_SORTE + sorte * 0x5E + 2 * j;
      poserMot(jeu, a, mot(jeu, a) + decalage());
    }
    for (let j = 0; j < 0x17; j++) {
      const a = IMAGES_B9D68 + sorte * 0x2E + 2 * j;
      poserMot(jeu, a, mot(jeu, a) + decalage());
    }
    poserMot(jeu, IMAGES_D_ENTRACTE + 4 * sorte, mot(jeu, IMAGES_D_ENTRACTE + 4 * sorte) + decalage());
    poserMot(jeu, IMAGES_D_ENTRACTE + 4 * sorte + 2, mot(jeu, IMAGES_D_ENTRACTE + 4 * sorte + 2) + decalage());
  }
}

// =================================================================================================
// LES FEUX D'ARTIFICE
// =================================================================================================

// 0x6E7B2 — le hasard des feux : un générateur congruentiel sur 16 bits, graine × 0x24A1 + 0x24DF,
// ramené à 0 .. n − 1.
export function hasardDesFeux(jeu, n) {
  const graine = u16(Math.imul(mot(jeu, GRAINE_DES_FEUX), 0x24A1) + 0x24DF);
  poserMot(jeu, GRAINE_DES_FEUX, graine);
  const diviseur = u16(n);
  if (diviseur === 0) throw new Error('division par zero');
  return graine % diviseur;
}

const places = (jeu) => longSigne(jeu, PLACES);

// Occuper la place suivante : la sorte, et une particule vivante de plus.
function occuper(jeu, sorte) {
  const i = places(jeu);
  poserLong(jeu, PLACES, i + 1);
  poserMot(jeu, SORTE + 2 * i, sorte);
  poserMot(jeu, VIVANTES, mot(jeu, VIVANTES) + 1);
}

// Hors du jeu d'origine, en grande vue (retour 48 de docs/demandes.md) : le spectacle est posé dans le
// monde. Le jeu le dessine autour du centre d'un écran de 640 × 400, (320, 200) ; en grande vue,
// l'écran est plus grand, et le spectacle restait dans son coin haut gauche, à une autre place du parc
// à chaque cran du zoom. À l'allumage, le point du monde au centre de la vue du parc est retenu, en
// cases depuis le coin de la carte (la caméra, plus la case sous ce point : le calcul de la case sous
// le pointeur, interface-parc.js) ; à chaque dessin, le spectacle est décalé jusqu'à là où ce point est
// à l'écran. Il reste ainsi au-dessus du même endroit du parc, quels que soient le zoom et le
// défilement ; hors de la vue du parc (barre de menus, panneau du bas), rien n'est dessiné. Rien n'est
// écrit dans la mémoire du jeu.
const CAMERA_COLONNE = 0xD667A, CAMERA_RANGEE = 0xD6666;          // mots signés, en cases
const LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;           // mots
const ORIGINE_X = 0xD6624;                                         // mot signé : l'origine du dessin
const HAUTEUR_DU_PANNEAU = 80;       // le panneau du bas : la vue du parc s'arrête 80 lignes avant le bas
let ancreDesFeux = null;             // { colonne, rangee } : le centre du spectacle, dans le monde
const feuxDansLeMonde = (jeu) => reglages.grandeVue && ecran.grande && !basseResolution(jeu);
function ancrerLesFeux(jeu) {
  ancreDesFeux = null;
  if (!feuxDansLeMonde(jeu)) return;
  const W = mot(jeu, LARGEUR_TUILE), H = mot(jeu, HAUTEUR_TUILE);
  const x = ecran.largeur / 2, y = (ecran.hauteur - HAUTEUR_DU_PANNEAU) / 2;
  ancreDesFeux = { colonne: motSigne(jeu, CAMERA_COLONNE) + (x - motSigne(jeu, ORIGINE_X) - y / 2) / W,
    rangee: motSigne(jeu, CAMERA_RANGEE) + y / H };
}
// Le décalage du spectacle : là où le point retenu est à l'écran, moins (320, 200) ; null hors de la
// grande vue (le dessin d'origine).
function decalageDesFeux(jeu) {
  if (!feuxDansLeMonde(jeu)) return null;
  if (!ancreDesFeux) ancrerLesFeux(jeu);
  const W = mot(jeu, LARGEUR_TUILE), H = mot(jeu, HAUTEUR_TUILE);
  const y = (ancreDesFeux.rangee - motSigne(jeu, CAMERA_RANGEE)) * H;
  const x = (ancreDesFeux.colonne - motSigne(jeu, CAMERA_COLONNE)) * W + motSigne(jeu, ORIGINE_X) + y / 2;
  return [Math.round(x) - 0x140, Math.round(y) - 0xC8];
}

// 0x6D4B7 — allumer les feux : la graine prend 0x30F5 si elle était nulle, le tableau est vidé
// (sans effacer les sortes des places), et une première fusée part.
export function allumerLesFeux(jeu) {
  ancrerLesFeux(jeu);
  if (mot(jeu, GRAINE_DES_FEUX) === 0) poserMot(jeu, GRAINE_DES_FEUX, 0x30F5);
  poserLong(jeu, PLACES, 0);
  poserMot(jeu, VIVANTES, 0);
  poserOctet(jeu, FEUX_DE1B4, 0);
  poserOctet(jeu, FEUX_DE1B3, 0);
  poserOctet(jeu, FEUX_DE1B2, 0);
  lancerUneFusee(jeu);
}

// 0x6D508 — le tir, à chaque image : lancer peut-être une fusée, faire avancer les particules,
// les dessiner. Deux bruitages : 0x1B au départ d'une fusée, 0x20 quand une fusée éclate (s'il n'en
// est pas parti une dans la même image).
export function tirerLesFeux(jeu) {
  let lancee = 0;
  if (u8(peutEtreLancer(jeu)) !== 0) {
    jeu.appeler(BRUITAGE_UNIQUE, 0, 0x1B);
    lancee = 1;
  }
  if (u8(faireAvancer(jeu)) !== 0 && lancee === 0) jeu.appeler(BRUITAGE_UNIQUE, 0, 0x20);
  dessinerLesFeux(jeu);
}

// 0x6D985 — une chance sur 34 (tirage de 0 à 999 au-delà de 970) de lancer ; et, quand plus de
// 400 places sont mortes, tasser le tableau. Rend dans al 1 si une fusée est partie ; le reste
// de eax est ce qu'y laissait l'original.
export function peutEtreLancer(jeu) {
  let lancee = 0;
  if (hasardDesFeux(jeu, 0x3E8) > 0x3CA) {
    lancerUneFusee(jeu);
    lancee = 1;
  }
  let eax = (places(jeu) - motSigne(jeu, VIVANTES)) | 0;
  if (eax > 0x190) eax = tasser(jeu);
  return (eax & ~0xFF) | lancee;
}

// 0x6D6A8 — lancer. Trois fois sur quatre (s'il reste trois places), une fusée : du milieu du bas
// de l'écran (x = 320, y de 301 à 400), vers le haut (vitesse en y de −45 000 à −54 999), avec un
// écart en x et en z tiré d'une amplitude au hasard ; elle vit de 15 à 24 pas. Sinon (s'il reste
// 200 places), une bombe, du centre (x 318 à 321, y 398 à 401), qui monte de même.
//
// ANOMALIES D'ORIGINE : l'écart en z est tiré de 0 à 2 (r + 1 000) − 1, moins r seulement (et non
// r + 1 000) : il penche vers le fond. Pour la bombe, la vitesse en y est augmentée de −15 000 si
// elle dépasse −15 000, ce qui n'arrive jamais (elle vaut au plus −45 000).
export function lancerUneFusee(jeu) {
  const r = hasardDesFeux(jeu, 0x3E8);
  const amplitude = r + 0x3E8;
  if (hasardDesFeux(jeu, 4) !== 0 && places(jeu) < 0x3E5) {
    const i = places(jeu);
    poserLong(jeu, PX + 4 * i, 0x1400000);
    poserLong(jeu, PY + 4 * i, (0x190 - hasardDesFeux(jeu, 0x64)) << 16);
    poserLong(jeu, PZ + 4 * i, 0);
    poserMot(jeu, VX + 2 * i, (hasardDesFeux(jeu, u16(amplitude * 4)) - amplitude) * 2);
    poserLong(jeu, VY + 4 * i, -(hasardDesFeux(jeu, 0x2710) + 0xAFC8));
    poserMot(jeu, VZ + 2 * i, hasardDesFeux(jeu, u16(amplitude * 2)) - r);
    poserLong(jeu, VIE + 4 * i, hasardDesFeux(jeu, 0xA) + 0xF);
    occuper(jeu, FUSEE);
    jeu.appeler(BRUITAGE_UNIQUE, 0, 0x20);
  } else if (places(jeu) < 0x320) {
    const vx = (hasardDesFeux(jeu, u16(amplitude * 4)) - amplitude) * 2;
    let vy = -(hasardDesFeux(jeu, 0x2710) + 0xAFC8);
    if (vy > -15000) vy = (vy - 15000) | 0;
    const vz = hasardDesFeux(jeu, u16(amplitude * 2)) - r;
    const i = places(jeu);
    poserLong(jeu, PX + 4 * i, (hasardDesFeux(jeu, 4) + 0x13E) << 16);
    poserLong(jeu, PY + 4 * i, (hasardDesFeux(jeu, 4) + 0x18E) << 16);
    poserLong(jeu, PZ + 4 * i, 0);
    poserMot(jeu, VX + 2 * i, vx);
    poserLong(jeu, VY + 4 * i, vy);
    poserMot(jeu, VZ + 2 * i, vz);
    poserLong(jeu, VIE + 4 * i, hasardDesFeux(jeu, 0xA) + 0xF);
    occuper(jeu, BOMBE);
    jeu.appeler(BRUITAGE_UNIQUE, 0, 0x20);
  }
}

// 0x6D55D — l'éclatement d'une bombe : `nombre` fusées partent de (x, y), chacune avec une vitesse
// tirée de −4 v à 4 v − 4 sur chaque axe, et une vie de 30 à 39 pas ; puis le bruitage 0x1B.
// Rien s'il ne reste pas nombre + 5 places.
export function eclaterUneBombe(jeu, x, y, vitesse, nombre) {
  nombre = u16(nombre);
  if (!((0x3E8 - nombre - 5) > places(jeu))) return;
  const ecart = () => (hasardDesFeux(jeu, u16(vitesse * 2)) - vitesse) << 2;
  for (let k = 0; s16(k) < nombre; k++) {
    const i = places(jeu);
    poserLong(jeu, PX + 4 * i, x);
    poserLong(jeu, PY + 4 * i, y);
    poserLong(jeu, PZ + 4 * i, 0);
    poserMot(jeu, VX + 2 * i, ecart());
    poserLong(jeu, VY + 4 * i, ecart());
    poserMot(jeu, VZ + 2 * i, ecart());
    poserLong(jeu, VIE + 4 * i, hasardDesFeux(jeu, 0xA) + 0x1E);
    occuper(jeu, FUSEE);
  }
  jeu.appeler(BRUITAGE, 0, 0x1B);
}

// 0x6E5FD — la gerbe d'une fusée : `nombre` étincelles d'une même couleur tirée au sort (gamme et
// scintillement : 8 × (0 à 63) + 1), à la `vitesse` donnée, et l'un des bruitages 0x1B à 0x1D.
export function gerbe(jeu, x, y, nombre, vitesse) {
  const sorte = (hasardDesFeux(jeu, 0x40) << 3) + 1;
  jeu.appeler(BRUITAGE, 0, s16(hasardDesFeux(jeu, 3) + 0x1B));
  for (let k = 0; u16(k) < u16(nombre); k++) ajouterUneEtincelle(jeu, x, y, 0, u16(vitesse), s16(sorte));
}

// 0x6E4BA — ajouter une particule en (x, y, z), avec une vitesse tirée au hasard jusqu'à
// `vitesse`, et une vie de 25 à 31 pas. Rend dans al 1 si elle a trouvé une place (il en faut une
// sur les 999 premières) ; le reste de eax est ce qu'y laissait l'original : la sorte, ou, sans
// place, eax à l'entrée.
//
// ANOMALIE D'ORIGINE : le tirage recommence tant que la vitesse sort du disque de rayon `vitesse`,
// mais la vitesse en z n'entre pas dans le test : les gerbes sont des cylindres, pas des sphères.
export function ajouterUneEtincelle(jeu, x, y, z, vitesse, sorte, eaxEntree = 0) {
  if (places(jeu) >= 0x3E7) return eaxEntree & ~0xFF;
  const i = places(jeu);
  poserLong(jeu, PX + 4 * i, x);
  poserLong(jeu, PY + 4 * i, y);
  poserLong(jeu, PZ + 4 * i, z);
  let vx, vy, vz;
  do {
    vx = (hasardDesFeux(jeu, u16(vitesse * 2)) - vitesse) | 0;
    vy = (hasardDesFeux(jeu, u16(vitesse * 2)) - vitesse) | 0;
    vz = (hasardDesFeux(jeu, u16(vitesse * 2)) - vitesse) | 0;
  } while (Math.imul(vitesse, vitesse) < ((Math.imul(vx, vx) + Math.imul(vy, vy)) | 0));
  poserMot(jeu, VX + 2 * i, vx);
  poserLong(jeu, VY + 4 * i, vy);
  poserMot(jeu, VZ + 2 * i, vz);
  poserLong(jeu, VIE + 4 * i, hasardDesFeux(jeu, 7) + 0x19);
  occuper(jeu, sorte);
  return (sorte & ~0xFF) | 1;
}

// 0x6E673 — tasser le tableau : les particules vivantes sont ramenées au début, dans leur ordre.
// Rend le nouveau nombre de places (c'est ce que l'original laisse dans eax).
//
// ANOMALIE D'ORIGINE : le parcours va jusqu'à la place d'indice « nombre de places » comprise, une
// de trop. Comme l'allumage remet le nombre à zéro sans effacer les sortes, une place d'un
// spectacle précédent peut ainsi revenir.
export function tasser(jeu) {
  let j = 0;
  for (let i = 0; u16(i) <= places(jeu); i++) {
    const a = u16(i);
    if (mot(jeu, SORTE + 2 * a) === 0) continue;
    const b = u16(j);
    poserLong(jeu, PX + 4 * b, long(jeu, PX + 4 * a));
    poserLong(jeu, PY + 4 * b, long(jeu, PY + 4 * a));
    poserLong(jeu, PZ + 4 * b, long(jeu, PZ + 4 * a));
    poserMot(jeu, VX + 2 * b, mot(jeu, VX + 2 * a));
    poserLong(jeu, VY + 4 * b, long(jeu, VY + 4 * a));
    poserMot(jeu, VZ + 2 * b, mot(jeu, VZ + 2 * a));
    const sorte = mot(jeu, SORTE + 2 * a);
    poserMot(jeu, SORTE + 2 * a, 0);
    poserMot(jeu, SORTE + 2 * b, sorte);
    poserLong(jeu, VIE + 4 * b, long(jeu, VIE + 4 * a));
    j++;
  }
  poserLong(jeu, PLACES, u16(j));
  return u16(j);
}

// La vie de la dernière particule ajoutée.
const poserLaDerniereVie = (jeu, vie) => poserLong(jeu, VIE + 4 * (places(jeu) - 1), vie);

// Une étincelle de traînée, un peu sous la fusée ou la bombe `i` (0 à 5 pixels plus bas), lente.
function trainee(jeu, i, sorte) {
  const z = long(jeu, PZ + 4 * i);
  const y = ((hasardDesFeux(jeu, 6) << 16) + long(jeu, PY + 4 * i)) | 0;
  return u8(ajouterUneEtincelle(jeu, long(jeu, PX + 4 * i), y, z, 0x3E8, sorte));
}

// 0x6DEF3 — faire avancer les particules d'un pas, et vieillir chacune selon sa sorte :
//   étincelle : elle meurt au bout de sa vie ;
//   fusée : en vol, une étincelle 0x21 une fois sur deux, puis une seconde, qui vivent 10 pas ; à
//     sa mort, le tableau est tassé, puis une gerbe de 120 étincelles à la vitesse 0x2000 ;
//   bombe : en vol, six étincelles 0x31, qui vivent de 10 à 17 pas ; à sa mort, huit fusées
//     (0x6D55D, vitesse 0x7D0).
// Rend dans al 1 si une fusée a éclaté ; le reste de eax est ce qu'y laissait l'original.
//
// ANOMALIE D'ORIGINE : la gerbe d'une fusée suit un tassement fait au milieu du parcours : la
// particule qui vient prendre la place de la fusée n'avance pas à ce pas-ci.
export function faireAvancer(jeu) {
  let eclatee = 0;
  let i = 0;
  for (; u16(i) < places(jeu); i++) {
    const k = u16(i);
    if (mot(jeu, SORTE + 2 * k) !== 0) {
      poserLong(jeu, PX + 4 * k, long(jeu, PX + 4 * k) + (motSigne(jeu, VX + 2 * k) << 4));
      poserLong(jeu, PY + 4 * k, long(jeu, PY + 4 * k) + (long(jeu, VY + 4 * k) << 4));
      poserLong(jeu, VY + 4 * k, long(jeu, VY + 4 * k) + 0x80);
      poserLong(jeu, PZ + 4 * k, long(jeu, PZ + 4 * k) + (motSigne(jeu, VZ + 2 * k) << 4));
    }
    const vieillir = () => {
      const vie = (longSigne(jeu, VIE + 4 * k) - 1) | 0;
      poserLong(jeu, VIE + 4 * k, vie);
      if (vie > 0) return false;
      poserMot(jeu, SORTE + 2 * k, 0);
      poserMot(jeu, VIVANTES, mot(jeu, VIVANTES) - 1);
      return true;
    };
    switch (mot(jeu, SORTE + 2 * k) & 7) {
      case ETINCELLE:
        vieillir();
        break;
      case FUSEE:
        if (vieillir()) {
          const x = long(jeu, PX + 4 * k), y = long(jeu, PY + 4 * k);
          tasser(jeu);
          gerbe(jeu, x, y, 0x78, 0x2000);
          eclatee = 1;
        } else {
          if (hasardDesFeux(jeu, 2) === 0 && trainee(jeu, k, 0x21) !== 0) poserLaDerniereVie(jeu, 0xA);
          if (trainee(jeu, k, 0x21) !== 0) poserLaDerniereVie(jeu, 0xA);
        }
        break;
      case BOMBE:
        if (vieillir()) {
          eclaterUneBombe(jeu, long(jeu, PX + 4 * k), long(jeu, PY + 4 * k), 0x7D0, 8);
        } else {
          for (let n = 0; n < 6; n++) {
            if (trainee(jeu, k, 0x31) !== 0) poserLaDerniereVie(jeu, hasardDesFeux(jeu, 8) + 0xA);
          }
        }
        break;
      default:
        break;
    }
  }
  return (u16(i) & ~0xFF) | eclatee;
}

// Un point de couleur, en coordonnées 640 × 400 : en 320x200, un pixel sur quatre ; en 640x480,
// le pixel, dont la case est d'abord marquée à recopier.
function poserUnPoint(jeu, x, y, couleur) {
  if (basseResolution(jeu)) {
    jeu.appeler(POINT_320, x, y, couleur);
  } else {
    jeu.appeler(MARQUER_ZONE_SALE, x, y, 1, 1);
    jeu.appeler(POINT_640, x, y, couleur);
  }
}

// 0x6D9D8 — dessiner les particules, projetées vers le centre de l'écran selon leur profondeur.
// Leur éclat : 13 pour une fusée ; pour les autres, il croît de 3 à 15 à mesure que la vie baisse
// de 32 à 8 (et 0 au-delà de 38 pas).
export function dessinerLesFeux(jeu) {
  const decalage = decalageDesFeux(jeu);
  const haut = decalage ? motSigne(jeu, HAUT_DE_LA_VUE) : 0, bas = ecran.hauteur - HAUTEUR_DU_PANNEAU;
  for (let i = 0; u16(i) < places(jeu); i++) {
    const k = u16(i);
    const sorte = mot(jeu, SORTE + 2 * k);
    if (sorte === 0) continue;
    let x = longSigne(jeu, PX + 4 * k) >> 16;
    let y = longSigne(jeu, PY + 4 * k) >> 16;
    let facteur = (0x400 - (longSigne(jeu, PZ + 4 * k) >> 15)) | 0;
    if (s16(facteur) <= 0) facteur = 1;
    x = ((Math.imul(s16(facteur), s16(x) - 0x140) >> 10) + 0x140) | 0;
    y = ((Math.imul(s16(facteur), s16(y) - 0xC8) >> 10) + 0xC8) | 0;
    if (decalage) {
      x += decalage[0]; y += decalage[1];
      if (x < 0 || x > ecran.largeur - 3 || y < haut || y > bas - 3) continue;
    }
    const vie = longSigne(jeu, VIE + 4 * k);

    if ((sorte & CLIGNOTE) && vie < 7) {
      if (vie & 1) poserUnPoint(jeu, s16(x), s16(y), BLANC);
      continue;
    }
    let eclat;
    if (sorte === FUSEE) {
      eclat = 0xD;
    } else {
      eclat = ((0x20 - vie) >> 1) + 3;
      if (s16(eclat) > 0xF) eclat = 0xF;
      if (s16(eclat) < 0) eclat = 0;
    }
    const couleur = s16((((sorte & 0x1E0) >> 5) << 4) + s16(eclat) + 1);
    if (sorte & SCINTILLE) {
      // trois des quatre points d'un carré de 2 × 2 (en 640 × 400), le manquant tourne avec la vie
      const phase = vie & 3;
      if (phase !== 3) poserUnPoint(jeu, s16(x), s16(y), couleur);
      if (phase !== 2) poserUnPoint(jeu, s16(x + 2), s16(y), couleur);
      if (phase !== 1) poserUnPoint(jeu, s16(x + 2), s16(y + 2), couleur);
      if (phase !== 0) poserUnPoint(jeu, s16(x), s16(y + 2), couleur);
    } else {
      poserUnPoint(jeu, s16(x), s16(y), couleur);
    }
  }
}

// =================================================================================================

// Les fonctions du module s'appellent entre elles directement, en JavaScript ; chacune est prouvée
// par son entrée, là où le code transcrit l'appelle (comparer.mjs --modules <nom>), puis le module
// entier au rejeu. 0x6CD44 est appelée par son entrée depuis 0x6BCDA, pour le reste de pile.
// Aucune n'écrit hors des variables du jeu et des tampons d'image.
export const reecritures = [
  { adresse: 0x6A83E, nom: 'comparerLesPrix', fn: comparerLesPrix, arguments: 2, retour: true },
  { adresse: 0x6A85C, nom: 'ouvrirLeCatalogue', fn: ouvrirLeCatalogue, arguments: 1 },
  { adresse: 0x6A912, nom: 'fermerLeCatalogue', fn: fermerLeCatalogue, arguments: 1 },
  { adresse: 0x6AA49, nom: 'ramenerDevant', fn: ramenerDevant, arguments: 1 },
  { adresse: 0x6AC07, nom: 'agrandirALEcran', fn: agrandirALEcran, arguments: 1 },
  { adresse: 0x6ADDB, nom: 'reduireLeCatalogue', fn: reduireLeCatalogue, arguments: 1 },
  { adresse: 0x6CD44, nom: 'remplirLaGrille', arguments: 1, retour: true,
    fn: (jeu, n) => remplirLaGrille(jeu, n, jeu.T.R.esp >>> 0) },
  { adresse: 0x6BCDA, nom: 'reglerLeCatalogue', fn: reglerLeCatalogue, arguments: 1 },
  { adresse: 0x6AE91, nom: 'sourisSurLeCatalogue', fn: sourisSurLeCatalogue, arguments: 1 },
  { adresse: 0x67182, nom: 'tracerEnReduction', fn: tracerEnReduction, arguments: 5 },
  { adresse: 0x6A658, nom: 'decalerLesImagesDesSortes', fn: (jeu) => decalerLesImagesDesSortes(jeu), arguments: 0 },
  { adresse: 0x6E7B2, nom: 'hasardDesFeux', fn: hasardDesFeux, arguments: 1, retour: true },
  { adresse: 0x6D4B7, nom: 'allumerLesFeux', fn: (jeu) => allumerLesFeux(jeu), arguments: 0 },
  { adresse: 0x6D508, nom: 'tirerLesFeux', fn: (jeu) => tirerLesFeux(jeu), arguments: 0 },
  { adresse: 0x6D985, nom: 'peutEtreLancer', fn: (jeu) => peutEtreLancer(jeu), arguments: 0, retour: true },
  { adresse: 0x6D6A8, nom: 'lancerUneFusee', fn: (jeu) => lancerUneFusee(jeu), arguments: 0 },
  { adresse: 0x6D55D, nom: 'eclaterUneBombe', fn: eclaterUneBombe, arguments: 4 },
  { adresse: 0x6E5FD, nom: 'gerbe', fn: gerbe, arguments: 4 },
  { adresse: 0x6E4BA, nom: 'ajouterUneEtincelle', arguments: 5, retour: true,
    fn: (jeu, x, y, z, v, sorte) => ajouterUneEtincelle(jeu, x, y, z, v, sorte, jeu.T.R.eax) },
  { adresse: 0x6E673, nom: 'tasser', fn: (jeu) => tasser(jeu), arguments: 0, retour: true },
  { adresse: 0x6DEF3, nom: 'faireAvancer', fn: (jeu) => faireAvancer(jeu), arguments: 0, retour: true },
  { adresse: 0x6D9D8, nom: 'dessinerLesFeux', fn: (jeu) => dessinerLesFeux(jeu), arguments: 0 },
];

export const enAttente = [];
