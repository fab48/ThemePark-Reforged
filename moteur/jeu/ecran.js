// L'écran : la grille des blocs à recopier.
//
// En haute résolution, le jeu ne recopie pas toute l'image vers l'écran à chaque tour. Il découpe
// l'écran en blocs de 32 pixels de large sur 16 de haut — 20 colonnes sur 30 rangées, soit 640x480
// — et note dans une grille les blocs touchés. Chaque entrée fait deux octets ; on y écrit 3.
//
// Ce 3 est un compte à rebours : la recopie vers l'écran (0x54ED6) décrémente chaque entrée non
// nulle (`dec byte [eax]` en 0x54F39). Un bloc touché est donc recopié pendant trois tours. Pourquoi
// trois, non établi. En basse résolution la grille n'est pas exploitée : l'image entière est
// recopiée à chaque tour (0x80E20).
//
// Les coordonnées sont celles de l'espace de dessin du jeu, qui fait toujours 640 de large : en
// basse résolution, le traceur les divise par deux au moment d'écrire (0x5ED21).
//
// Réécriture lisible des fonctions 0x54D38 et 0x55D97.
//
// La grille — sa base 0xD671D, ses 20 colonnes et 30 rangées, 40 octets par rangée — et la taille
// de l'écran, 640x480, sont lues dans la géométrie de l'écran, `ecran` (grande-vue.js) : ce sont
// celles d'origine, hors de la grande vue, qui agrandit l'écran et déplace la grille.

import { ecran } from './grande-vue.js';

const LARGEUR_BLOC = 32, HAUTEUR_BLOC = 16;
const SALE = 3;

const s16 = (v) => (v << 16) >> 16;

// 0x54D38 — marquer à redessiner le rectangle (x, y, largeur, hauteur).
//
// Une largeur ou une hauteur négative est acceptée : le rectangle est alors donné par son coin
// opposé. Le rectangle est ensuite coupé aux bords de l'écran ; s'il n'en reste rien, on sort.
export function marquerZoneSale(jeu, x, y, largeur, hauteur) {
  const LARGEUR_MAX = ecran.largeur, HAUTEUR_MAX = ecran.hauteur;
  const COLONNES = ecran.colonnes, RANGEES = ecran.rangees;
  if (s16(largeur) < 0) { x = (x + largeur) | 0; largeur = -largeur | 0; }
  if (s16(hauteur) < 0) { y = (y + hauteur) | 0; hauteur = -hauteur | 0; }

  if (s16(x) + s16(largeur) < 0) return;
  if (s16(x) < 0) { largeur = (largeur + x) | 0; x = 0; }
  if (s16(x) >= LARGEUR_MAX) return;
  if (s16(x) + s16(largeur) >= LARGEUR_MAX) largeur = LARGEUR_MAX - x;

  if (s16(y) + s16(hauteur) < 0) return;
  if (s16(y) < 0) { hauteur = (hauteur + y) | 0; y = 0; }
  if (s16(y) >= HAUTEUR_MAX) return;
  if (s16(y) + s16(hauteur) >= HAUTEUR_MAX) hauteur = HAUTEUR_MAX - y;

  if (s16(largeur) <= 0 || s16(hauteur) <= 0) return;

  const colonne = s16(x) >> 5;
  const rangee = s16(y) >> 4;
  let nbColonnes = ((s16(x) + s16(largeur)) >> 5) - s16(colonne) + 1;
  let nbRangees = ((s16(y) + s16(hauteur)) >> 4) - s16(rangee) + 1;
  if (s16(nbColonnes) > s16(COLONNES) - s16(colonne)) nbColonnes = COLONNES - colonne;
  if (s16(nbRangees) > s16(RANGEES) - s16(rangee)) nbRangees = RANGEES - rangee;

  const debut = ecran.grille + s16(rangee) * ecran.pasRangee + s16(colonne) * 2;
  marquerBlocs(jeu, rangee, nbRangees, colonne, debut, nbColonnes);
}

// 0x55D97 — écrire la marque dans un rectangle de blocs.
//
// Les deux boucles du programme d'origine testent leur condition *après* le corps : un rectangle
// annoncé vide marque quand même un bloc. On le reproduit tel quel.
export function marquerBlocs(jeu, rangee, nbRangees, colonne, pointeur, nbColonnes) {
  const m8 = jeu.m8;
  const PAS_RANGEE = ecran.pasRangee;
  const finRangee = (rangee + nbRangees) & 0xFFFF;
  const finColonne = (colonne + nbColonnes) & 0xFFFF;
  let ligne = pointeur;
  let r = rangee & 0xFFFF;
  do {
    let p = ligne;
    let c = colonne & 0xFFFF;
    do {
      m8[p] = SALE;
      c = (c + 1) & 0xFFFF;
      p += 2;
    } while (c < finColonne);
    ligne += PAS_RANGEE;
    r = (r + 1) & 0xFFFF;
  } while (r < finRangee);
}

export const reecritures = [
  { adresse: 0x54D38, nom: 'marquerZoneSale', fn: marquerZoneSale, arguments: 4 },
  { adresse: 0x55D97, nom: 'marquerBlocs', fn: marquerBlocs, arguments: 5 },
];
