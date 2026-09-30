// La mémoire partagée entre la page (principal.js) et le travailleur (travailleur.js) : l'écran. Quand
// le moteur tourne dans le fil de la page (moteur-du-jeu.js), la même disposition, dans une mémoire
// ordinaire (voir `atomiques`, en fin de fichier).
//
//   0      l'en-tête, 64 entiers (voir les deux fichiers ; l'image du parc publiée, le zoom...)
//   256    la palette, 768 octets
//   1024   l'image affichée, puis l'image du parc publiée et sa vue seule (défilement fluide, zoom),
//          chacune de la taille maximale de la grande vue (moteur/jeu/grande-vue.js)
//   puis   pour le zoom (moteur/web/zoom.js) : les régions de l'interface (16 de 6 entiers), l'image
//          du curseur et les pixels qu'il recouvre dans l'image publiée (64 x 64 octets chacun).
//   puis   pour les animations intercalées (moteur/web/retouches.js) : les retouches de la dernière
//          image montrée, RETOUCHES_MAX rectangles de 4 entiers (x, y, l, h) et leurs octets (pour
//          chacun, la pose puis le « après », l × h chacun), RETOUCHES_OCTETS au plus ;
//   puis   la traînée de la façon « ×2 » : un entier par rectangle (1 : il en a une), et ses pixels en
//          couleurs pleines (RGBA, l × h × 4 octets, pour les seuls rectangles qui en ont), TRAINEES_OCTETS
//          au plus.

import { LARGEUR_MAX, HAUTEUR_MAX } from '../jeu/grande-vue.js';

export const IMAGE_MAX = LARGEUR_MAX * HAUTEUR_MAX;
export const REGIONS_MAX = 16, CHAMPS_REGION = 6;
const ENTETE = 0, PALETTE = 256, IMAGES = 1024;
const REGIONS = IMAGES + 3 * IMAGE_MAX;
const CURSEUR = REGIONS + 4 * REGIONS_MAX * CHAMPS_REGION;
export const RETOUCHES_MAX = 16, RETOUCHES_OCTETS = 1 << 20, TRAINEES_OCTETS = 1 << 22;
const RECTANGLES = CURSEUR + 2 * 64 * 64, OCTETS_RETOUCHES = RECTANGLES + 4 * 4 * RETOUCHES_MAX;
const DRAPEAUX_TRAINEES = OCTETS_RETOUCHES + RETOUCHES_OCTETS, OCTETS_TRAINEES = DRAPEAUX_TRAINEES + 4 * RETOUCHES_MAX;
export const TAILLE_ECRAN = OCTETS_TRAINEES + TRAINEES_OCTETS;

// Les vues sur la mémoire de l'écran.
export function vuesDeLEcran(ecran) {
  return {
    entete: new Int32Array(ecran, ENTETE, 64),
    palette: new Uint8Array(ecran, PALETTE, 768),
    pixels: new Uint8Array(ecran, IMAGES, IMAGE_MAX),
    imageFluide: new Uint8Array(ecran, IMAGES + IMAGE_MAX, IMAGE_MAX),
    vueDuParc: new Uint8Array(ecran, IMAGES + 2 * IMAGE_MAX, IMAGE_MAX),
    regions: new Int32Array(ecran, REGIONS, REGIONS_MAX * CHAMPS_REGION),
    spriteCurseur: new Uint8Array(ecran, CURSEUR, 64 * 64),
    dessousCurseur: new Uint8Array(ecran, CURSEUR + 64 * 64, 64 * 64),
    rectanglesRetouches: new Int32Array(ecran, RECTANGLES, 4 * RETOUCHES_MAX),
    octetsRetouches: new Uint8Array(ecran, OCTETS_RETOUCHES, RETOUCHES_OCTETS),
    traineesPresentes: new Int32Array(ecran, DRAPEAUX_TRAINEES, RETOUCHES_MAX),
    octetsTrainees: new Uint8Array(ecran, OCTETS_TRAINEES, TRAINEES_OCTETS),
  };
}

// Les entiers de l'en-tête que publie le travailleur pour le zoom, avec l'image du parc (sous le
// verrou de séquence de entete[3]).
export const Z = {
  GRANDE: 17,            // 1 : l'image publiée est celle de la grande vue
  BARRE_X: 18,           // le décalage de la barre d'outils (grande-vue.js, ecran.barreX)
  CURSEUR: 19,           // bit 0 : le curseur est affiché ; bit 1 : il est resté dans l'image publiée
  CURSEUR_X: 20, CURSEUR_Y: 21,               // le curseur du jeu (son point visé : le coin haut gauche),
                                              // publié avec toute image du parc (le glisser, glisser.js)
  CURSEUR_L: 22, CURSEUR_H: 23,               // son image
  POSE_X: 24, POSE_Y: 25, POSE_L: 26, POSE_H: 27,   // là où il a été posé dans l'image
  REGIONS: 28,           // le nombre de régions
  FRAIS: 29,             // hors verrou : la grande vue publie ses images depuis moins de 100 ms
  DEPLACEMENTS: 30,      // hors verrou : le compte des déplacements du pointeur imposés par le jeu (0x11191)
  DEPLACEMENT: 31,       // le dernier : x | y << 16
  CALCUL: 32,            // hors verrou : la part du temps réel où le jeu calcule, en millièmes
  // Les animations intercalées (animations-intercalees.js, retouches.js), à chaque image présentée :
  RETOUCHES: 33,         // verrou de séquence des retouches (impair pendant l'écriture)
  RETOUCHES_IMAGE: 34,   // la publication du parc (entete[3]) dont elles retouchent l'image et la vue
  RETOUCHES_N: 35,       // le nombre de rectangles
  ANIM_PIXELS: 36,       // les pixels que la retouche a changés dans l'image présentée (entete[0])
  ANIM_IMAGES: 37,       // hors verrou : les attractions dont des images cuites sont chargées (−1 : pas encore)
  RETOUCHES_PRESENTEE: 38,   // l'image présentée (entete[0]) qu'elles retouchent, −1 : celle du parc seule
  // Avec l'image du parc (sous le verrou de entete[3]), pour le glisser au bouton du milieu (glisser.js) :
  CAMERA: 39,            // la caméra de la vue publiée : colonne | rangée << 16
  // Les films en mp4 (films.js) : le travailleur demande un film à la page (message `film`) et attend ici
  FILM: 40,              // hors verrou : 1, la page a fini de jouer le film demandé (ou le joueur l'a passé)
  // Avec l'image du parc (sous le verrou de entete[3]), le dernier cadrage du jeu sur un objet (un employé
  // dont on demande la vue : vue-fluide.js, cadrageSurUnObjet) ; la page y amène la portion zoomée :
  CADRAGES: 41,          // le compte des cadrages sur un objet
  CADRAGE_CASE: 42,      // la case de l'objet : colonne | rangée << 16
  CADRAGE_FIN: 43,       // sa position fine dans la case, en 256es : x | y << 8
};

// Les opérations atomiques. Le travailleur et la page, sur deux fils, se parlent par une mémoire
// partagée (SharedArrayBuffer) : leurs accès passent par Atomics. Quand le moteur tourne dans le fil
// de la page (moteur-du-jeu.js, `fil: 'page'` : le fichier unique ouvert en file://, sans isolation
// d'origine), la même disposition vit dans une mémoire ordinaire, et un seul fil y touche : de simples
// accès suffisent. Chrome 49 et Firefox 52 n'ont ni SharedArrayBuffer ni Atomics ; ce remplaçant a les
// quatre opérations dont se sert la page (load, store, add, notify), sur un Int32Array ordinaire.
const ORDINAIRES = {
  load: (t, k) => t[k],
  store: (t, k, v) => { t[k] = v; return v; },
  add: (t, k, v) => { const a = t[k]; t[k] = a + v; return a; },
  notify: () => 0,
};
// La mémoire est-elle partagée ? (sans SharedArrayBuffer dans le navigateur, elle ne l'est pas)
export const estPartagee = (tampon) => typeof SharedArrayBuffer !== 'undefined' && tampon instanceof SharedArrayBuffer;
// Les opérations qui conviennent à cette mémoire.
export const atomiques = (tampon) => (estPartagee(tampon) ? Atomics : ORDINAIRES);
