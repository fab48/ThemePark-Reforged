// La vue du parc : défilement et cadrage de la caméra.
//
// Réécriture lisible des fonctions 0x183EC, 0x184DF, 0x475EF, 0x47598 et 0x18003 du jeu d'origine.
// Chaque constante vient du programme de 1994 ; `moteur/node/verifier.mjs` rejoue la même partie
// avec et sans ce module pour vérifier que le comportement est identique.

import { ADRESSES } from './etat.js';
import { reglages } from './reglages.js';
import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';

export const HAUT = 0, DROITE = 1, BAS = 2, GAUCHE = 3;

const TAILLE_CARTE = 64;         // la carte fait 64 par 64 cases
// 630 (0x276) : au-delà, le pointeur touche le bord droit de l'écran. La largeur de l'écran, 640, et
// sa hauteur, 480, sont celles de `ecran` (grande-vue.js), qui les agrandit en grande vue.
const bordDroitSouris = () => ecran.largeur - 10;

// 0x183EC — défiler d'une case dans une direction.
//
// En basse résolution, le défilement n'a lieu qu'une image sur trois — sauf si le jeu est en
// pause, vitesse nulle — ce qui donne son rythme saccadé au déplacement de la vue. En haute
// résolution il a lieu à chaque image : les tuiles y font 24x16 au lieu de 48x32, et la vue
// avance donc de la même distance à l'écran.
// Quand on défile vers le haut ou vers le bas et que le pointeur touche un bord latéral de l'écran,
// la vue part aussi de côté : c'est le défilement en diagonale des coins.
export function defilerCarte(jeu, direction) {
  const e = jeu.etat;
  const permis = e.hauteResolution || e.pasDeSimulation % 3 === 0 || e.vitesseJeu !== 0;
  if (!permis) return;
  if (reglages.defilementAdouci && e.hauteResolution && !pasAdouci(jeu)) return;

  switch (direction & 0xFFFF) {
    case HAUT:
      e.cameraColonne += coteVise(e);
      e.cameraRangee -= 1;
      break;
    case DROITE:
      e.cameraColonne += 1;
      break;
    case BAS:
      e.cameraColonne += coteVise(e);
      e.cameraRangee += 1;
      break;
    case GAUCHE:
      e.cameraColonne -= 1;
      break;
    default:
      break;                     // direction inconnue : la vue ne bouge pas
  }
  e.redessinerCarte = 1;
  recadrerCamera(jeu);
}

// Le défilement adouci (reglages.js), hors du jeu d'origine : en 640x480, au plus une colonne tous
// les 7 tics de la minuterie du jeu (72,8 par seconde). Une horloge qui recule (nouvelle partie)
// laisse passer le pas.
const TICS_PAR_PAS_ADOUCI = 7;
let dernierPasAdouci = -Infinity;
function pasAdouci(jeu) {
  const t = horlogeDuJeu(jeu);
  if (t >= dernierPasAdouci && t - dernierPasAdouci < TICS_PAR_PAS_ADOUCI) return false;
  dernierPasAdouci = t;
  return true;
}

// -1 si le pointeur touche le bord gauche, +1 s'il touche le bord droit, 0 sinon.
function coteVise(e) {
  if (e.sourisX === 0) return -1;
  if (e.sourisX > bordDroitSouris()) return 1;
  return 0;
}

// 0x184DF — remettre la caméra dans les limites de la carte.
//
// Hors séquence, la caméra est simplement bornée aux 64 cases. Pendant une séquence (la variable
// 0xBA0F8, incrémentée par 0x59C85 et remise à -1 ailleurs, dont le rôle exact reste à établir),
// elle est posée à une position calculée depuis la taille des tuiles et celle de l'écran.
export function recadrerCamera(jeu) {
  const e = jeu.etat;
  if (e.centrerCameraSurCarte < 0) {
    e.cameraColonne = borner(e.cameraColonne);
    e.cameraRangee = borner(e.cameraRangee);
    return;
  }
  const colonnesVisibles = (largeurDeLaVue(jeu) / e.largeurTuile) | 0;
  e.cameraColonne = TAILLE_CARTE / 2 - (colonnesVisibles >> 1) + 2;
  // 400 en basse résolution, 480 en haute : ces hauteurs sont celles du code d'origine, et non
  // celles de l'écran (200 lignes en basse résolution). Pourquoi, non établi.
  const hauteurEcran = e.basseResolution ? 400 : hauteurDeLaVue(jeu);
  const rangeesVisibles = ((hauteurEcran + e.hauteurTuile - 1) / e.hauteurTuile) | 0;
  e.cameraRangee = TAILLE_CARTE - rangeesVisibles - 3;
}

function borner(v) {
  if (v < 0) return 0;
  if (v >= TAILLE_CARTE) return TAILLE_CARTE - 1;
  return v;
}

// --- Les déclencheurs du défilement ------------------------------------------------------------
//
// Le traitement des entrées du parc (0x145FB) cherche à chaque image la zone de l'écran sous le
// pointeur, dans la table 0xB93C3 (12 octets par zone : le rectangle, puis des indicateurs à +10).
// Les zones 0 à 3 sont les quatre bords, et leur numéro vaut directement une direction. Selon les
// indicateurs de la zone et les boutons, il appelle le survol (0x149A4, qui mène à 0x47598 pour un
// bord), le bouton gauche maintenu (0x175B5, qui relève de l'interface) ou le bouton droit
// maintenu (0x18003).

const ECHEANCE_DEFILEMENT = 0xB14E9;  // mot long : tic de la minuterie à partir duquel défiler ; -1 = aucune
const TICS_MINUTERIE = 0xB14B5;       // mot long : tics de la minuterie du jeu, 72,8 par seconde
const DELAI_AU_BORD = 15;             // environ 0,2 seconde

// 0x475EF — l'horloge du défilement : les tics de la minuterie du jeu.
export function horlogeDuJeu(jeu) {
  return jeu.dv.getInt32(TICS_MINUTERIE, true);
}

// 0x47598 — le survol d'un bord de l'écran.
//
// Au premier appel, on arme une échéance à 15 tics de là ; tant qu'elle n'est pas atteinte, rien ne
// bouge : un pointeur qui ne fait que frôler le bord ne déplace pas la vue. Ensuite la vue défile à
// chaque image, deux fois en haute résolution où les tuiles sont deux fois plus petites.
// Le survol d'un bord lève l'indicateur 0xB14B1 (dans 0x149A4) ; à la fin de chaque image, 0x145FB
// remet l'échéance à -1 si l'indicateur est resté baissé : quitter le bord, ne serait-ce qu'une
// image, fait repartir le délai.
export function defilerAuBord(jeu, direction) {
  const dv = jeu.dv;
  if (dv.getInt32(ECHEANCE_DEFILEMENT, true) === -1) {
    dv.setInt32(ECHEANCE_DEFILEMENT, (horlogeDuJeu(jeu) + DELAI_AU_BORD) | 0, true);
  }
  // comparaison non signée, comme dans l'original
  if ((horlogeDuJeu(jeu) >>> 0) < dv.getUint32(ECHEANCE_DEFILEMENT, true)) return;
  defilerCarte(jeu, direction & 0xFFFF);
  if (jeu.etat.hauteResolution) defilerCarte(jeu, direction & 0xFFFF);
}

// 0x18003 — le bouton droit maintenu sur un bord : défile à chaque image, sans délai, seulement
// dans la vue du parc. (Le bouton droit est le bit 1 de la souris : 0x10992 le recopie dans le mot
// 0xDE5AA tant qu'il est enfoncé.)
export function defilerBoutonDroit(jeu, zone) {
  if (jeu.etat.ecranCourant !== 0) return;
  if ((zone & 0xFFFF) > 3) return;            // pas un bord : rien
  defilerCarte(jeu, zone & 0xFFFF);
}

export const reecritures = [
  { adresse: 0x183EC, nom: 'defilerCarte', fn: (jeu, direction) => defilerCarte(jeu, direction), arguments: 1 },
  { adresse: 0x184DF, nom: 'recadrerCamera', fn: (jeu) => recadrerCamera(jeu), arguments: 0 },
  { adresse: 0x475EF, nom: 'horlogeDuJeu', fn: (jeu) => horlogeDuJeu(jeu), arguments: 0, retour: true },
  { adresse: 0x47598, nom: 'defilerAuBord', fn: (jeu, direction) => defilerAuBord(jeu, direction), arguments: 1 },
  { adresse: 0x18003, nom: 'defilerBoutonDroit', fn: (jeu, zone) => defilerBoutonDroit(jeu, zone), arguments: 1 },
];
