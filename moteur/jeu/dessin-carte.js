// Le dessin d'une image du parc : le sol, les décors, les objets, et la musique des attractions.
//
// Réécriture lisible de la fonction 0x1B837 du jeu d'origine (0x1B837 à 0x1C229). Chaque
// constante vient du programme de 1994 ; `moteur/node/verifier.mjs` rejoue la même partie avec et
// sans ce module, `moteur/node/comparer.mjs` compare chaque appel à la transcription.
//
// La comparaison appel par appel doit restaurer toute la mémoire, tas compris (`memoire: 'entiere'`,
// en bas) : le dessin d'une enseigne (0x1C5E9) fait défiler son texte en incrémentant l'octet +0xBB
// de l'objet quand le compteur de pas de simulation est multiple de 8, et l'objet est dans le tas.
// Sans cela, la seconde exécution partirait d'un texte déjà avancé.
//
// Deux appelants :
//  - 0x13B9A, à chaque image du parc, avec la caméra (colonne 0xD667A, rangée 0xD6666) et le
//    nombre de rangées qui remplissent la hauteur logique, ⌈400 / 32⌉ = 13 ou ⌈480 / 16⌉ = 30 ;
//  - 0x3CC79, qui dessine le contenu d'une fenêtre ouverte par 0x35F21 : quand la fenêtre
//    contient une vue du parc, elle pose redessinerCarte puis appelle 0x1B837 sur une partie des
//    rangées. 0x35F21 pouvant être atteinte depuis le dessin des objets (0x1C22A et ses
//    sous-fonctions → 0x20FF5, quand un clic désigne un objet), 0x1B837 peut se rappeler
//    elle-même en pleine seconde passe. C'est pourquoi on relit la mémoire aux mêmes moments que
//    l'original.
//    Cet appelant, et donc cette récursion, ne sont pas vérifiés par les scénarios.
//
// L'image se construit en deux passes sur la même portion de carte :
//
//  1. LE FOND — sols, déchets, sens imposés, tuiles hors carte — n'est redessiné
//     que sur demande (redessinerCarte, 0xD666E : défilement, construction…), et pas dans la
//     surface de dessin : dans un tampon à part, [0xD3B98], qui le garde d'une image à l'autre ;
//  2. à chaque image, le fond est recopié dans la surface de dessin, puis LES OBJETS —
//     attractions, boutiques, visiteurs, personnel — y sont dessinés par-dessus, case par case.
//
// Le fond, immobile, ne coûte donc qu'une recopie ; seuls les objets sont retracés à chaque image.
//
// L'ordre de dessin fait la profondeur : ni tri, ni tampon de profondeur. Les rangées vont du
// haut de l'écran vers le bas, et dans chaque rangée les cases vont de droite à gauche ; ce qui
// est dessiné plus tard recouvre ce qui l'a été avant.
//
// Toutes les coordonnées sont celles de l'espace logique de dessin, qui fait toujours 640 de
// large (docs/retro-ingenierie.md § 6.1) ; en basse résolution, le traceur les divise par deux.

import { ADRESSES } from './etat.js';
import { dansLeCadre } from './cadre.js';
import { ecran, bordDuDessin } from './grande-vue.js';

const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

// Accès à la mémoire du jeu, petit-boutiste.
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const pointeur = (jeu, a) => jeu.dv.getInt32(a, true);
const poserMot = (jeu, a, v) => jeu.dv.setInt16(a, v, true);
const poserPointeur = (jeu, a, v) => jeu.dv.setInt32(a, v, true);

// --- La carte et les images -----------------------------------------------------------------
// Le bord droit de l'espace logique, 640 (0x280), écrit en dur dans le programme ; en grande vue,
// le bord de l'écran ou juste au-delà, qui garde les cases à leur place par rapport à l'origine du
// dessin (grande-vue.js, bordDuDessin), 640 hors d'elle.
const TAILLE_CARTE = 64;           // la carte fait 64 par 64 cases
const GRILLE = 0xD3B08;            // pointeur : la grille, 64x64 cellules de 4 octets (§ 6.2)
//   cellule +0 : mot signé, l'objet posé (0 vide, > 0 index dans la table des objets, < 0 décor
//                fixe) ; +2 : octet, le sol ; +3 : octet, les décors (voir dessinerLesDecors)
const IMAGES_SOL = 0xD3B90;        // pointeur : images de sol, 6 octets (pixels, largeur, hauteur)
const IMAGE_HORS_CARTE = 1;        // l'élément 1 : la tuile posée hors de la carte ; le sol n de
                                   // la cellule est l'élément n + 1 (le sol 0 partage donc son image)
const FIGURES = 0xD3B38;           // pointeur : table de mots, numéro de figure → objet composite
const DECHETS = 0x252;             //   figures 0x129 à 0x12B : les trois sortes de déchets
const SENS_IMPOSES = 0x4AE;        //   figures 0x257 à 0x25A : les sens imposés, un par direction
const TAMPON_FOND = 0xD3B98;       // pointeur : le tampon de fond
const SURFACE = ADRESSES.tamponEcran;  // pointeur : la surface de dessin, où écrit le traceur

// --- L'écran --------------------------------------------------------------------------------
// Ordonnée du premier élément du panneau de commande, en bas de l'écran : l'élément 4 de la table
// des éléments d'interface (0xB93C3, 12 octets par élément, x en +0 et y en +2). Les éléments
// sont tracés 4 lignes au-dessus de leur ordonnée (0x4DE1A, 0x59E50). Relevé en partie : 360 en
// basse résolution, 440 en haute.
const PANNEAU_Y = 0xB93F5;
const HAUTEUR_BASSE_RESOLUTION = 400;   // hauteur logique en basse résolution ; en haute, 480
                                        // lignes de 640 octets (`ecran`, grande-vue.js)

// --- Les objets -----------------------------------------------------------------------------
const OBJETS = 0xD3B10;            // pointeur : les objets du parc, 200 octets chacun
const TAILLE_OBJET = 200;
const SELECTION = 0xD6678;         // mot : numéro de l'objet sélectionné, 0 = aucun

// --- Les indicateurs d'une image ------------------------------------------------------------
// Un clic sur le parc est attribué pendant le dessin : le gestionnaire de souris (0x7D7E2, en
// 0x7DC70) pose CLIC_EN_ATTENTE ; en traçant les objets, 0x20FF5 et 0x1DD27 regardent si le
// pointeur tombe sur l'objet qu'elles dessinent. Si oui, elles posent CLIC_PRIS et changent
// d'écran : 0x20FF5 sélectionne l'objet et ouvre la fenêtre 0xD (0x35F21), 0x1DD27 passe à
// l'écran 0x54. Lequel l'emporte quand plusieurs objets sont sous le pointeur : non établi.
const CLIC_PRIS = 0xD77A6;         // octet
const CLIC_EN_ATTENTE = 0xDE5A0;   // mot
// 0x1C9E2 le pose après avoir joué le bruitage de l'objet sélectionné : une fois par image.
const BRUITAGE_JOUE = 0xD6630;     // mot

// --- La musique des attractions -------------------------------------------------------------
// Une attraction visible réclame sa musique pendant qu'on la dessine (0x1D87A), si son type en a
// une et si son mot +0x32 n'est pas nul (en marche ? non établi) : elle s'inscrit dans
// ATTRACTION_MUSICALE et pose MUSIQUE à 1. La première dessinée l'emporte, sauf si l'attraction
// sélectionnée vient après elle.
const MUSIQUE = 0xD6632;           // mot signé : 0 aucune, 1 réclamée dans cette image, −1 jouée
                                   // avant cette image et pas (encore) réclamée
const ATTRACTION_MUSICALE = 0xD3AE8;   // pointeur : l'attraction qui a réclamé la musique
const TYPES_ATTRACTIONS = 0xCCED0; // descriptions des types ; l'objet donne en +0x16 le décalage
                                   // de la sienne. +0xB7 : sa séquence musicale ; +0xA8 : un seuil

// ============================================================================================

// 0x1B837 — dessiner une image de la carte.
//
// colonneDeDepart et rangeeDeDepart : la case de la carte au coin haut gauche de la vue (la
// caméra) ; nombreDeRangees : combien de rangées dessiner, du haut de l'écran vers le bas.
//
// Le cadre de l'original (`enter 0x84`), bien que la réécriture n'en lise aucune variable : il
// laisse, 4 octets sous l'entrée, l'ebx de l'appelant, que la barre des messages 0x5CBDB relira
// quand 0x13B9A l'appelle depuis la boucle du parc (index.js, `resteRelu`).
export const dessinerCarte = dansLeCadre(0x84, (jeu, cadre, colonneDeDepart, rangeeDeDepart, nombreDeRangees) => {
  const e = jeu.etat;
  // 0x1B859 : au début de chaque image, la musique en cours passe à −1 ; il faudra qu'une
  // attraction la réclame de nouveau pendant le dessin des objets, sinon elle s'arrêtera.
  if (motSigne(jeu, MUSIQUE) !== 0) poserMot(jeu, MUSIQUE, -1);
  poserMot(jeu, BRUITAGE_JOUE, 0);
  jeu.m8[CLIC_PRIS] = 0;
  // (0x1B87C à 0x1B8E4 : le programme calcule ici deux fois le nombre de rangées visibles, puis
  // l'oublie. Calcul mort, omis.)

  if (motSigne(jeu, ADRESSES.redessinerCarte) !== 0) {
    e.redessinerCarte = 0;       // baissé avant de dessiner : ce qui suit peut le reposer
    dessinerLeFond(jeu, colonneDeDepart, rangeeDeDepart, nombreDeRangees);
  }

  recopierLeFond(jeu);
  dessinerLeTraceDeLaSelection(jeu);
  dessinerLesObjets(jeu, colonneDeDepart, rangeeDeDepart, nombreDeRangees);
  recopierLePanneau(jeu);
  jouerLaMusique(jeu);

  // 0x1C213 : un objet a pris le clic, la demande est satisfaite. Non vérifié par les scénarios.
  if (jeu.m8[CLIC_PRIS] !== 0) poserMot(jeu, CLIC_EN_ATTENTE, 0);
});

// --- Le parcours de la vue ------------------------------------------------------------------
//
// La vue est oblique : chaque rangée de la carte est décalée d'un tiers de tuile vers la droite
// par rapport à celle du dessus (§ 5.1). Toutes les trois rangées, ce décalage cumule une tuile
// entière, et la rangée commence une colonne plus à gauche : c'est le recul (r/3 + 1).
//
// Chaque rangée est parcourue de droite à gauche, en partant du bord droit de l'espace logique,
// 640, ÉCRIT EN DUR. La colonne de la carte qui s'y trouve est
//
//     colonneDeDepart − (r/3 + 1) + (640 − origineDessinX) / largeurTuile
//
// et c'est là que se joue l'échec du défilement au pixel. La division est entière, son reste est
// jeté ; la position de départ, elle, ne dépend pas de l'origine. Tant que le quotient ne change
// pas, déplacer l'origine ne déplace donc aucune tuile — seule la limite gauche (xMin) la suit ;
// quand il change, au passage d'un multiple de largeurTuile, tout le sol saute d'une tuile
// entière. Le programme fait ce calcul quatre fois (colonne et pointeur de cellule, dans chacune
// des deux passes) ; ici, une seule fois pour les deux passes, dans parcourirLaVue.
//
// Le reste n'est d'ailleurs pas nul en partie : 0x12452 pose l'origine à −(3 × largeurTuile / 4),
// soit −36 avec des tuiles de 48, et le changement de mode ne la recalcule pas. 640 + 36 = 676 =
// 14 × 48 + 4 = 28 × 24 + 4 : dans les deux modes, sol et objets sont tracés 4 pixels à droite
// de la projection du § 5.1, comme si l'origine valait −32. (0x145FB pose aussi 0x70 = 112 =
// 640 − 11 × 48, reste nul, quand les deux boutons de la souris sont enfoncés ensemble et que
// l'octet 0xD7798 est nul : docs/retro-ingenierie.md § 6.7.)
//
// Pour décaler l'image au pixel, c'est ce parcours qu'il faudra changer : partir de
// origineDessinX + (quotient × largeurTuile) au lieu de 640, pour les deux passes à la fois.

// Parcourt les cases de la vue dans l'ordre de dessin et appelle, pour chacune,
// visiter(r, x, colonne, rangee) : r est le numéro de la rangée à l'écran (0 en haut), x la
// position horizontale de la case dans l'espace logique, colonne et rangee sa place sur la
// carte — éventuellement hors de la carte. (Passe du fond : 0x1B91D à 0x1BA84 ; passe des
// objets : 0x1BE82 à 0x1BFE5.)
//
// Le programme relit largeurTuile et origineDessinX à chaque case ; on les lit une fois par
// rangée, ce qui revient au même : rien de ce qu'appelle ce dessin ne les écrit (seules 0x10D42,
// au changement de mode, et 0x12452 et 0x145FB, pour l'origine, le font).
function parcourirLaVue(jeu, colonneDeDepart, rangeeDeDepart, nombreDeRangees, visiter) {
  const e = jeu.etat;
  for (let r = 0; r < s16(nombreDeRangees); r++) {
    const L = e.largeurTuile;
    const BORD_DROIT = bordDuDessin(L);
    const origineX = motSigne(jeu, ADRESSES.origineDessinX);
    const decalage = r * ((L / 3) | 0);              // un tiers de tuile par rangée
    const recul = ((r / 3) | 0) + 1;
    const colonnesJusquAuBord = ((BORD_DROIT - origineX) / L) | 0;   // LE RESTE EST JETÉ
    const xMin = origineX + decalage - recul * L;    // la dernière case, à gauche, qui déborde
    const rangee = s16(rangeeDeDepart) + r;
    let colonne = s16(colonneDeDepart) - recul + colonnesJusquAuBord;
    for (let x = BORD_DROIT + decalage - recul * L; s16(x) >= s16(xMin); x -= L, colonne--) {
      // Une case qui commencerait à plus d'une tuile à gauche de l'origine est sautée. Jamais le
      // cas avec les largeurs du jeu, 48 et 24, multiples de 3 : xMin ne descend pas si bas.
      if (s16(x) < origineX - L) continue;
      visiter(r, s16(x), colonne, rangee);
    }
  }
}

function dansLaCarte(colonne, rangee) {
  return s16(colonne) >= 0 && s16(colonne) < TAILLE_CARTE && s16(rangee) >= 0 && s16(rangee) < TAILLE_CARTE;
}

// Adresse de la cellule (colonne, rangee). Le programme promène un pointeur, de 0x100 octets par
// rangée et de 4 par case, en même temps que la colonne : c'est la même adresse.
function cellule(jeu, colonne, rangee) {
  return (pointeur(jeu, GRILLE) + (rangee * TAILLE_CARTE + colonne) * 4) | 0;
}

// --- Première passe : le fond (0x1B8F5 à 0x1BD5A) ------------------------------------------

function dessinerLeFond(jeu, colonneDeDepart, rangeeDeDepart, nombreDeRangees) {
  // Le traceur écrit toujours dans la surface de dessin : on la fait pointer, le temps du fond,
  // sur le tampon de fond.
  const surfaceDeDessin = pointeur(jeu, SURFACE);
  poserPointeur(jeu, SURFACE, pointeur(jeu, TAMPON_FOND));

  parcourirLaVue(jeu, colonneDeDepart, rangeeDeDepart, nombreDeRangees, (r, x, colonne, rangee) => {
    if (!dansLaCarte(colonne, rangee)) {
      dessinerUneImageDeSol(jeu, r, x, IMAGE_HORS_CARTE);
      return;
    }
    const c = cellule(jeu, colonne, rangee);
    const ySol = dessinerUneImageDeSol(jeu, r, x, jeu.m8[c + 2] + 1);
    dessinerLesDecors(jeu, r, x, ySol, c);
  });

  poserPointeur(jeu, SURFACE, surfaceDeDessin);
  // Le panneau de commande et ses icônes animées, dans le tampon de fond (1 : sans condition).
  jeu.appeler(0x4DE1A, 1);
}

// Une image de sol, calée par le bas : son pied est sur la limite de la rangée suivante, et une
// image plus haute qu'une tuile dépasse vers le haut. Rend l'ordonnée de son haut.
// (Dans la carte : 0x1BA89 ; hors carte : 0x1BCA8.)
function dessinerUneImageDeSol(jeu, r, x, numero) {
  const image = pointeur(jeu, IMAGES_SOL) + numero * 6;
  const y = s16((r + 1) * jeu.etat.hauteurTuile - jeu.m8[image + 5]);
  // En haute résolution, le tracé marque en plus les blocs d'écran touchés (0x55BD4), pour que la
  // recopie par blocs les reprenne (§ 6.6).
  jeu.appeler(jeu.etat.basseResolution ? 0x5EC9C : 0x55BD4, x, y, image);
  return y;
}

// Ce que l'octet +3 d'une cellule pose sur la case, un bit par chose, dessiné dans l'ordre des bits
// (0x1BB21 à 0x1BC9E) :
//   bits 0 à 2 — les trois sortes de déchets que jettent les visiteurs (gobelet, emballage, vomi),
//                éparpillés sur la case ;
//   bit 5      — un sens imposé aux visiteurs, dont la direction est dans les bits 6 et 7 :
//                une figure au centre de la case (une flèche, vraisemblablement) ;
//   bits 3, 4  — rien ici (le bit 4 marque un panneau indicateur, dessiné comme objet).
// Vérifié par les scénarios en basse résolution seulement : aucun déchet n'est visible dans la
// partie en haute résolution de parc.json.
function dessinerLesDecors(jeu, r, x, ySol, c) {
  for (let bit = 0, bits = jeu.m8[c + 3] & 0x3F; bits !== 0; bit++, bits >>= 1) {
    if ((bits & 1) === 0) continue;
    if (bit <= 2) dessinerUnDechet(jeu, r, x, c, bit);
    else if (bit === 5) dessinerLeSensImpose(jeu, x, ySol, c);
  }
}

// La place d'un déchet vient d'une dispersion déterministe : le reste de la division, par la
// taille de la tuile, d'un nombre tiré de la sorte du déchet et du numéro de la case (le sol s'y
// ajoute pour l'horizontale). Stable d'une image à l'autre, différente d'une case à l'autre. Le
// point obtenu est le coin de l'objet composite, en haut à gauche de la rangée.
function dessinerUnDechet(jeu, r, x, c, sorte) {
  const e = jeu.etat, L = e.largeurTuile, H = e.hauteurTuile;
  const numeroDeCase = (c - pointeur(jeu, GRILLE)) >> 2;     // rangée × 64 + colonne
  const graine = sorte * 16 + numeroDeCase;
  const dx = (graine + jeu.m8[c + 2]) % L;
  const dy = graine % H;
  const objet = mot(jeu, pointeur(jeu, FIGURES) + DECHETS + 2 * sorte);
  jeu.appeler(0x209B5, objet, s16(x + dx), s16(r * H + dy));
}

// Le sens imposé : un objet composite posé à une demi-tuile plus un sixième à droite du bord
// de la case, et une demi-tuile sous le haut de son image de sol. Les deux modes ont leurs
// décalages écrits en dur : +8 et +16 en basse résolution (tuiles 48x32), +4 et +8 en haute
// (24x16) — ces derniers non vérifiés par les scénarios. 0x1C22A place les décors fixes de la
// même façon.
function dessinerLeSensImpose(jeu, x, ySol, c) {
  const e = jeu.etat;
  const hauteResolution = e.modeAffichage === 8;   // comparé à 8 ici, et non testé par le bit 0
  const dy = hauteResolution ? 8 : 16;
  const dx = (e.largeurTuile >> 1) + (hauteResolution ? 4 : 8);   // (L << 7) >> 8 : la moitié
  const direction = jeu.m8[c + 3] >> 6;
  const objet = mot(jeu, pointeur(jeu, FIGURES) + SENS_IMPOSES + 2 * direction);
  jeu.appeler(0x209B5, objet, s16(x + dx), s16(ySol + dy));
}

// --- Entre les deux passes ------------------------------------------------------------------

// 0x1BD5D — le fond passe dans la surface de dessin. En basse résolution, toute la partie de
// l'écran au-dessus du panneau de commande est recopiée ligne à ligne (0x80E20, lignes de 320
// octets : la moitié de l'ordonnée logique). En haute, seuls les blocs marqués depuis les tours
// précédents le sont (0x54ED6, § 6.6).
function recopierLeFond(jeu) {
  if (jeu.etat.basseResolution) {
    // Le programme teste ici deux fois de suite le même bit ; sa seconde branche, qui appellerait
    // 0x54ED6, est inatteignable.
    const lignes = u16((motSigne(jeu, PANNEAU_Y) / 2) | 0);
    jeu.appeler(0x80E20, pointeur(jeu, TAMPON_FOND), pointeur(jeu, SURFACE), lignes);
  } else {
    jeu.appeler(0x54ED6, pointeur(jeu, TAMPON_FOND), pointeur(jeu, SURFACE));
  }
}

// 0x1BDD1 — l'objet sélectionné, s'il est de l'un des deux types ',' ou '.' (octet +0xC), reçoit
// un tracé supplémentaire, dessiné sur le fond et donc sous les objets : 0x64940(objet, 0 pour
// ',', 1 pour '.'). Ce qu'est ce tracé, non établi : 0x64940 relie les cases d'une liste d'au
// plus huit mots rangée en +0x9C de l'objet, et avec 1 marque aussi la case sous le pointeur de
// la souris. Non vérifié par les scénarios (l'objet sélectionné y est toujours de type 6).
function dessinerLeTraceDeLaSelection(jeu) {
  const numero = mot(jeu, SELECTION);
  if (numero === 0) return;
  const objet = pointeur(jeu, OBJETS) + numero * TAILLE_OBJET;
  const type = jeu.m8[objet + 0xC];
  if (type === 0x2C) jeu.appeler(0x64940, objet, 0);           // ','
  else if (type === 0x2E) jeu.appeler(0x64940, objet, 1);      // '.'
}

// --- Seconde passe : les objets (0x1BE5A à 0x1C015) ----------------------------------------

// Chaque case occupée de la carte dessine son objet, posé au haut de la rangée : 0x1C22A(objet,
// x, y). Les cases hors carte n'ont rien. x et y sont passés en mots non signés.
function dessinerLesObjets(jeu, colonneDeDepart, rangeeDeDepart, nombreDeRangees) {
  parcourirLaVue(jeu, colonneDeDepart, rangeeDeDepart, nombreDeRangees, (r, x, colonne, rangee) => {
    if (!dansLaCarte(colonne, rangee)) return;
    const objet = motSigne(jeu, cellule(jeu, colonne, rangee));
    if (objet === 0) return;
    jeu.appeler(0x1C22A, objet, u16(x), u16(r * jeu.etat.hauteurTuile));
  });
}

// --- Après les objets -----------------------------------------------------------------------

// 0x1C01A — le panneau de commande repasse du fond vers la surface, par-dessus les objets qui
// auraient débordé sur lui, à partir de 4 lignes logiques au-dessus de son ordonnée (le haut de
// son image).
function recopierLePanneau(jeu) {
  const haut = motSigne(jeu, PANNEAU_Y) - 4;
  if (jeu.etat.basseResolution) {
    // Le programme choisit la hauteur logique par un troisième test du même bit : ici, toujours
    // 400. Le décalage, haut × 160, vaut haut / 2 lignes de 320 octets — exact seulement si haut
    // est pair. La seconde branche du double test, vers 0x54ED6, est inatteignable.
    const lignes = u16(((HAUTEUR_BASSE_RESOLUTION - haut) / 2) | 0);
    const decalage = haut * 160;
    jeu.appeler(0x80E20, pointeur(jeu, TAMPON_FOND) + decalage, pointeur(jeu, SURFACE) + decalage, lignes);
  } else {
    // La copie est faite sur place par le programme ('rep movsd'), par mots de 4 octets ; la
    // hauteur, choisie de même par un test du mode, vaut ici toujours 480.
    const lignes = ecran.hauteur - haut;
    const decalage = haut * ecran.largeur;
    const mots = ((lignes * ecran.largeur) / 4) | 0;
    copierDesMots(jeu, pointeur(jeu, SURFACE) + decalage, pointeur(jeu, TAMPON_FOND) + decalage, mots);
  }
}

// 'rep movsd' : copie de mots de 4 octets, un à un, en montant (le compilateur garde l'indicateur
// de direction à zéro). Quand la destination chevauche la source par au-dessus, la copie un à un
// recopie ce qu'elle vient d'écrire ; ailleurs, elle revient à un déplacement de bloc. (Un nombre
// négatif, qui ferait planter l'original, n'arrive pas : le panneau est toujours dans l'écran.)
function copierDesMots(jeu, destination, source, nombre) {
  const octets = 4 * nombre;
  if (octets <= 0) return;
  if (destination > source && destination < source + octets) {
    for (let k = 0; k < octets; k += 4) jeu.dv.setInt32(destination + k, jeu.dv.getInt32(source + k, true), true);
  } else {
    jeu.m8.copyWithin(destination, source, source + octets);
  }
}

// 0x1C166 — la musique des attractions. Pendant le dessin des objets, une attraction visible a pu
// réclamer sa musique (MUSIQUE = 1). Sinon, MUSIQUE vaut encore −1, posé au début de l'image, et
// la musique s'arrête.
function jouerLaMusique(jeu) {
  if (motSigne(jeu, MUSIQUE) === -1) {
    // Non vérifié par les scénarios : dans les deux, la musique ne s'arrête jamais.
    // L'arrêt (0x80990) est demandé dans les deux cas ; l'état ne revient à 0 que si le mot +0x32
    // de l'attraction est nul — celui-là même qu'exige 0x1D87A pour réclamer la musique. Sinon il
    // reste à −1 et l'arrêt est redemandé à chaque image, sans effet (0x80990 ne fait rien quand
    // aucune séquence ne joue). Sens exact du mot +0x32 : non établi.
    if (mot(jeu, pointeur(jeu, ATTRACTION_MUSICALE) + 0x32) === 0) {
      jeu.appeler(0x80990);
      poserMot(jeu, MUSIQUE, 0);
    } else {
      jeu.appeler(0x80990);
    }
    return;
  }
  if (motSigne(jeu, MUSIQUE) === 0) return;

  // Réclamée : la séquence de son type (0x80A20 ne fait rien si elle joue déjà), réglée par l'octet
  // +0x13 de l'attraction (0x80E40 transmet 0x70 − 2 × l'octet au pilote de musique ; tempo ou
  // volume, non établi)...
  const type = TYPES_ATTRACTIONS + mot(jeu, pointeur(jeu, ATTRACTION_MUSICALE) + 0x16);
  jeu.appeler(0x80A20, jeu.m8[type + 0xB7]);
  jeu.appeler(0x80E40, u16(0x70 - 2 * jeu.m8[pointeur(jeu, ATTRACTION_MUSICALE) + 0x13]));
  // ... et désaccordée quand le mot +0x2E de l'attraction dépasse le seuil +0xA8 de son type :
  // 0x66BA0 fait osciller la hauteur des notes (messages MIDI 0xE1 à 0xE3), 0x66D18 la remet au
  // centre. Sens exact du mot +0x2E (l'usure ?) : non établi. 0x66BA0 : non vérifié par les
  // scénarios.
  if (mot(jeu, pointeur(jeu, ATTRACTION_MUSICALE) + 0x2E) > jeu.m8[type + 0xA8]) jeu.appeler(0x66BA0);
  else jeu.appeler(0x66D18);
}

// `memoire: 'entiere'` : la fonction écrit dans les objets du parc, qui vivent dans le tas (le texte
// des enseignes défilantes avance d'un cran tous les huit pas) ; la comparaison appel par appel doit
// donc restaurer et comparer toute la mémoire, et pas seulement ses zones par défaut.
export const reecritures = [
  { adresse: 0x1B837, nom: 'dessinerCarte', fn: dessinerCarte, arguments: 3, memoire: 'entiere' },
];
