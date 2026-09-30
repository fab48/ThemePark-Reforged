// Le défilement fluide (reglages.js) : ce que le jeu montre de la vue du parc, relevé pour la page.
//
// Ce module n'est pas une réécriture : il n'ajoute rien au jeu d'origine et n'écrit rien dans sa
// mémoire. Deux crochets, posés dans la vue du parc (0x13B9A, boucle.js) et dans la présentation
// (0x80210 et 0x55507, presentation.js), relèvent en lecture seule ce que le jeu vient de dessiner,
// quand le réglage est actif :
//
//  - après le dessin de la carte, LA VUE SEULE : la surface de dessin au-dessus du panneau de
//    commande, avant que l'interface (barre de menus, fenêtres, barre des messages, curseur) ne
//    soit tracée par-dessus ; et la position de la vue dans le monde ;
//  - après la présentation, L'IMAGE COMPLÈTE telle qu'elle vient de partir à l'écran, curseur
//    compris.
//
// Les deux sont remis ensemble au rappel `vueFluide.surImage`, que pose le travailleur de la page
// (moteur/web/travailleur.js) : la page recolle les vues successives dans une mosaïque du monde et
// fait glisser la vue d'une position de la caméra à la suivante (moteur/web/defilement-fluide.js).
//
// LA POSITION DE LA VUE. La projection du jeu est une translation (dessin-carte.js,
// parcourirLaVue) : la case (colonne c, rangée r) est tracée à x = c·L + r·⌊L/3⌋ − X, y = r·H − Y,
// où L et H sont la taille des tuiles et, pour la caméra (C, R),
//
//     X = C·L + R·⌊L/3⌋ + q·L − 640,   q = ⌊(640 − origineDessinX) / L⌋,   Y = R·H
//
// dans l'espace logique de 640 de large ; en 320x200, la surface est deux fois plus petite et tout
// est divisé par deux. En grande vue (grande-vue.js), 640 est le bord d'où part le dessin de la carte
// (bordDuDessin : la largeur W de l'écran, ou juste au-delà), sa hauteur H remplace 480, et la grille
// des blocs est la sienne. (X, Y) est donc le coin haut gauche de la vue dans un plan du monde, en
// pixels de la surface : deux vues se recollent en les posant chacune à son (X, Y).

import { ADRESSES } from './etat.js';
import { reglages } from './reglages.js';
import { ecran, regionsDeLInterface, ECRANS_DU_PARC, bordDuDessin } from './grande-vue.js';

const TAMPON_FOND = 0xD3B98;       // pointeur : le fond de la carte, sans les objets (dessin-carte.js)
const PANNEAU_Y = 0xB93F5;         // mot : ordonnée logique du panneau de commande ; il est tracé
                                   // 4 lignes plus haut (dessin-carte.js, recopierLePanneau)
// La grille des blocs de 32x16, en 640x480 (presentation.js) : 20 colonnes, 30 rangées, en 0xD671D,
// ou celle de la grande vue (`ecran`).
const LARGEUR_BLOC = 32, HAUTEUR_BLOC = 16;

export const vueFluide = {
  // (image) => void : { largeur, hauteur, hauteurVue, x, y, tuile: [largeur, hauteur], camera, vue,
  //   image, grande, barreX, regions, curseur }
  //   camera : [colonne, rangée], la caméra qui a dessiné la vue (le glisser de la page, glisser.js) ;
  //   pointeur : [x, y], le curseur du jeu (0xBECAC, 0xBECAE), en pixels de l'image (le glisser aussi) ;
  //   vue : la vue seule, largeur × hauteurVue indices ; image : l'image complète, largeur × hauteur.
  //   En grande vue (le zoom de la page, moteur/web/zoom.js) : grande, barreX (ecran.barreX), les
  //   régions de l'interface (grande-vue.js, regionsDeLInterface) et le curseur (voir `releverLeCurseur`).
  //   objetCadre : le dernier cadrage sur un objet (`cadrageSurUnObjet`, plus bas).
  // Les tampons sont réutilisés d'une image à l'autre : le rappel les recopie s'il les garde.
  surImage: null,
};

// Le relevé sert au défilement fluide et, en grande vue, au zoom de la page, qui compose l'interface
// à part du parc : il suffit que l'un des deux soit en jeu. (Grande vue éteinte, `ecran.grande` est
// faux : les vérificateurs, qui rejouent le jeu d'origine, n'y passent que par le réglage fluide.)
const actif = () => reglages.defilementFluide || ecran.grande;
// La dernière vue relevée en grande vue : la question modale (0x78E36, sa propre boucle) présente
// l'image sans redessiner le parc, qui est figé derrière elle ; la page la compose sur cette vue.
let derniere = null;

// LE CADRAGE SUR UN OBJET (retour 76 de docs/demandes.md). Quand le jeu amène sa vue sur un objet (un
// employé, depuis les icônes du personnel ou sa fiche ; l'objet d'une liste : construire.js,
// ecrans-gestion.js), il met l'objet au milieu de SON écran (à peu près : corrections.js). La page,
// elle, n'en montre zoomée qu'une portion, qu'elle garde à sa place dans l'image quand la caméra saute
// peu : l'objet pouvait tomber au bord du cadre, ou hors de lui. Le jeu lui dit donc où est l'objet,
// avec l'image : un compte des cadrages, la case et la position fine (256es de case) de l'objet au
// moment du cadrage ; la page y amène le milieu de ce qu'elle montre (moteur/web/zoom.js,
// `centrerSur`). Rien n'est écrit dans la mémoire du jeu.
export const cadrageSurUnObjet = { nombre: 0, colonne: 0, rangee: 0, finX: 0x80, finY: 0x80 };
export function noterLeCadrageSurUnObjet(jeu, o) {
  const c = cadrageSurUnObjet;
  c.nombre = (c.nombre + 1) | 0;
  c.colonne = jeu.m8[o + 7]; c.rangee = jeu.m8[o + 9];
  c.finX = jeu.m8[o + 6]; c.finY = jeu.m8[o + 8];
}

let enAttente = null;              // la vue relevée à cette image, en attente de sa présentation
const tampons = { vue: null, image: null };
const tampon = (nom, n) => {
  if (!tampons[nom] || tampons[nom].length !== n) tampons[nom] = new Uint8Array(n);
  return tampons[nom];
};

// Avant le dessin de la carte : la position de la vue, lue avec la caméra que reçoit le dessin.
// Rend null si le réglage est éteint ou si l'écran n'est pas la vue du parc.
export function cadrageDeLaVue(jeu) {
  if (!actif()) return null;
  const e = jeu.etat;
  // (en grande vue, aussi sous les messages qui s'affichent par-dessus le parc : 0x4A, 0x56...)
  if (e.ecranCourant !== 0 && !(ecran.grande && ECRANS_DU_PARC.includes(e.ecranCourant))) return null;
  const echelle = e.basseResolution ? 2 : 1;
  const L = e.largeurTuile, H = e.hauteurTuile;
  if (L === 0 || H === 0) return null;
  const origineX = jeu.dv.getInt16(ADRESSES.origineDessinX, true);
  const bord = bordDuDessin(L);                      // 640, hors de la grande vue
  const q = ((bord - origineX) / L) | 0;
  return {
    echelle,
    largeur: ecran.largeur / echelle,
    hauteur: e.basseResolution ? 200 : ecran.hauteur,
    x: (e.cameraColonne * L + e.cameraRangee * ((L / 3) | 0) + q * L - bord) / echelle,
    y: (e.cameraRangee * H) / echelle,
    tuile: [L / echelle, H / echelle],
    camera: [e.cameraColonne, e.cameraRangee],
    // (relevé avec la caméra : un cadrage fait après le dessin de la vue, pendant le traitement des
    // entrées de la même image, n'est publié qu'avec la vue suivante, qu'il a déplacée)
    objetCadre: { ...cadrageSurUnObjet },
  };
}

// Après le dessin de la carte : la vue seule.
export function releverLaVue(jeu, cadrage) {
  enAttente = null;
  if (!cadrage || !actif()) return;
  const { largeur, hauteur } = cadrage;
  const hauteurVue = Math.max(0, Math.min(hauteur, ((jeu.dv.getInt16(PANNEAU_Y, true) - 4) / cadrage.echelle) | 0));
  const surface = jeu.dv.getUint32(ADRESSES.tamponEcran, true);
  const vue = tampon('vue', largeur * hauteurVue);
  vue.set(jeu.m8.subarray(surface, surface + vue.length));
  if (cadrage.echelle === 1) {
    // En 640x480, seuls les blocs marqués ont été restaurés depuis le fond ou dessinés à cette
    // image. Un bloc au compte nul garde ce que la surface avait avant : le fond, en principe, mais
    // aussi bien un reste d'interface ; on y prend donc le fond, qui est la vue sans objet.
    const fond = jeu.dv.getUint32(TAMPON_FOND, true);
    const { grille, colonnes, rangees, pasRangee } = ecran;
    for (let rb = 0; rb < rangees; rb++) {
      for (let cb = 0; cb < colonnes; cb++) {
        if (jeu.m8[grille + rb * pasRangee + 2 * cb] !== 0) continue;
        for (let ligne = rb * HAUTEUR_BLOC; ligne < (rb + 1) * HAUTEUR_BLOC && ligne < hauteurVue; ligne++) {
          const d = ligne * largeur + cb * LARGEUR_BLOC;
          vue.set(jeu.m8.subarray(fond + d, fond + d + LARGEUR_BLOC), d);
        }
      }
    }
  }
  enAttente = { ...cadrage, hauteurVue, vue };
  derniere = ecran.grande ? enAttente : null;
}

// Après la présentation : l'image complète, et la publication. `curseurPose` : le pointeur est
// resté dessiné dans la surface (0x7D775 sans 0x7D79E : presentation.js).
export function releverLImage(jeu, curseurPose = false) {
  let v = enAttente;
  enAttente = null;
  // En grande vue, une image présentée sans que le parc ait été redessiné (la question modale) :
  // la dernière vue, si l'écran n'a pas changé de taille.
  if (!v && ecran.grande && derniere && derniere.largeur === ecran.largeur && derniere.hauteur === ecran.hauteur) v = derniere;
  if (!v) return;
  if (!actif() || !vueFluide.surImage) return;
  const surface = jeu.dv.getUint32(ADRESSES.tamponEcran, true);
  const image = tampon('image', v.largeur * v.hauteur);
  image.set(jeu.m8.subarray(surface, surface + image.length));
  const grande = ecran.grande && v.largeur === ecran.largeur;
  vueFluide.surImage({ largeur: v.largeur, hauteur: v.hauteur, hauteurVue: v.hauteurVue,
    x: v.x, y: v.y, tuile: v.tuile, camera: v.camera, vue: v.vue, image,
    pointeur: [jeu.dv.getInt16(0xBECAC, true) / v.echelle, jeu.dv.getInt16(0xBECAE, true) / v.echelle],
    grande, barreX: ecran.barreX,
    objetCadre: v.objetCadre,
    regions: grande ? regionsDeLInterface(jeu) : [],
    curseur: grande ? releverLeCurseur(jeu, curseurPose) : null });
}

// Le curseur (0x7D2DD, appelé par 0x7D775 : souris-jeu.js) : son image, en [0xDE590], de [0xDE58C] x
// [0xDE58E] pixels au pas [0xDE594], 0xFE transparent ; posé dans la surface à la position du
// curseur du jeu (son coin haut gauche est le point visé), sur le rectangle [0xDE55C], [0xDE55E],
// [0xDE560] x [0xDE562], les pixels recouverts gardés en [0xDE564] (ligne à ligne, au pas de la
// largeur). La page, qui le dessine elle-même à taille fixe, rend à l'image ces pixels recouverts.
const tamponsCurseur = { sprite: new Uint8Array(64 * 64), dessous: new Uint8Array(64 * 64) };
function releverLeCurseur(jeu, pose) {
  const dv = jeu.dv, m8 = jeu.m8;
  const l = Math.min(64, dv.getInt16(0xDE58C, true)), h = Math.min(64, dv.getInt16(0xDE58E, true));
  const pas = dv.getInt16(0xDE594, true), image = dv.getUint32(0xDE590, true);
  const { sprite, dessous } = tamponsCurseur;
  const bon = l > 0 && h > 0 && image > 0 && image + pas * h < m8.length;
  if (bon) for (let y = 0; y < h; y++) sprite.set(m8.subarray(image + y * pas, image + y * pas + l), y * l);
  const rect = [dv.getInt16(0xDE55C, true), dv.getInt16(0xDE55E, true), dv.getInt16(0xDE560, true), dv.getInt16(0xDE562, true)];
  const tampon = dv.getUint32(0xDE564, true);
  pose = pose && rect[2] > 0 && rect[3] > 0 && rect[2] <= 64 && rect[3] <= 64 && tampon > 0;
  if (pose) dessous.set(m8.subarray(tampon, tampon + rect[2] * rect[3]));
  return {
    visible: dv.getUint32(0xBECB4, true) !== 0 && bon,
    x: dv.getInt16(0xBECAC, true), y: dv.getInt16(0xBECAE, true),
    largeur: bon ? l : 0, hauteur: bon ? h : 0, sprite,
    pose, rect, dessous,
  };
}
