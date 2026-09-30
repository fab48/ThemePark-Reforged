// La présentation : de la surface de dessin à l'écran.
//
// Le jeu ne dessine jamais à l'écran. Chaque image est construite dans une surface de dessin en
// mémoire, pointée par [0xDE5BC], à partir d'un fond pointé par [0xD3B98] (la carte sans ses
// objets, voir 0x1B837), puis recopiée vers la mémoire vidéo, en 0xA0000. Deux façons de faire,
// selon le mode d'affichage [0xDE5F6] :
//
//  - en basse résolution (mode 1, 320x200), tout circule à chaque image : le fond entier est
//    recopié sur la surface (0x80E20, 200 lignes de 320 octets), puis la surface entière à l'écran
//    (0x80210). La mémoire vidéo du mode 13h est linéaire : une seule copie de 64 000 octets.
//  - en haute résolution (mode 8, 640x480), l'image fait 300 Ko et la carte VESA n'en montre que
//    64 Ko à la fois, par une fenêtre en 0xA0000 : une « banque ». Seuls circulent les blocs de
//    32x16 notés dans la grille 0xD671D (voir ecran.js) : le fond est restauré bloc par bloc sur
//    la surface (0x54ED6), puis les blocs sont présentés à l'écran, banque par banque (0x55507).
//
// Le compte à rebours de la grille vaut 3, et c'est le minimum : dans un tour, la restauration du
// fond (dans 0x1B837) précède le dessin des sprites, qui précède la présentation. Un sprite qui
// quitte un bloc y demande donc trois passages : présentation de l'image où il est dessiné
// (3 → 2), restauration du fond au tour suivant, qui l'efface de la surface (2 → 1), présentation
// de cette restauration, qui l'efface de l'écran (1 → 0).
//
// Le pointeur de la souris est un curseur logiciel. Avant chaque présentation, 0x7D775, s'il est
// affiché ([0xBECB4] non nul), le dessine dans la surface en gardant les pixels qu'il recouvre, et
// pose [0xBECA4] : tant que ce drapeau est posé, le gestionnaire de souris (0x7D7E2) ne trace plus
// lui-même le pointeur à l'écran. Après la copie, 0x7D7C7 lève seulement le drapeau — le pointeur
// reste dans la surface, et la restauration du fond l'effacera — tandis que 0x7D79E remet d'abord
// les pixels recouverts. L'hôte cadence l'horloge du jeu sur 0x7D775 : une image = un appel. Ces
// trois routines sont donc toujours appelées par jeu.appeler, exactement là où l'original le fait.
//
// Les copies sont faites par `rep movsd` ou `rep movsb`, du premier élément au dernier. Le modèle
// mémoire est plat (DOS/4GW) : ds et es désignent la même mémoire, de base 0, et le drapeau de
// direction est toujours à zéro dans le jeu.
//
// Réécriture lisible des fonctions 0x80210, 0x80E20, 0x81CB0, 0x55C24, 0x55DE6, 0x54ED6 et
// 0x55507. Les cinq premières sont écrites en assembleur (convention pile, registres sauvegardés
// par la routine elle-même) ; 0x54ED6 et 0x55507 sont du code compilé.

import { ADRESSES } from './etat.js';
import { releverLImage } from './vue-fluide.js';
import { publierLesAnimations } from './animations-intercalees.js';
import { ecran } from './grande-vue.js';

const MEMOIRE_VIDEO = 0xA0000;           // mode 13h : l'écran ; mode VESA : la fenêtre de 64 Ko
const TAILLE_FENETRE = 0x10000;          // une banque VESA

// Basse résolution : 320x200, une ligne de 320 octets.
const LARGEUR_BASSE = 320;
const TAILLE_ECRAN_BASSE = 320 * 200;    // 64 000 octets, 0x3E80 mots longs
// Haute résolution : 640x480, une ligne de 640 octets (0x280). Ces tailles, et la grille des blocs
// (voir ecran.js) — 20 colonnes sur 30 rangées de deux octets, en 0xD671D —, sont lues dans la
// géométrie de l'écran, `ecran` (grande-vue.js) : ce sont celles d'origine, hors de la grande vue.
const LARGEUR_BLOC = 32, HAUTEUR_BLOC = 16;

// Octets de contrôle.
const MODE_ENTREES = 0xBECB2;            // 0 = normal ; 1 = enregistrement (-r), 2 = relecture (-p)
const RAFRAICHISSEMENT_TOTAL = 0xD6BCD;  // non nul : l'image entière circule, sans la grille
const ECRAN_PLEIN = 0xB150F;             // posé par 0x40D3E, levé par 0x40D79 (voir plus bas)
const BANQUE_COURANTE = 0xBECDC;         // mot : banque montrée dans la fenêtre, notée par 0x7E6BC

// Une ligne qui commence à cette position dans la fenêtre, ou au-delà, est copiée octet par octet,
// en surveillant le passage à la banque suivante : 0xFD7F = 0x10000 - 0x281. Pour les bandes d'au
// plus 640 pixels que présente 0x55507, le seuil a deux positions de marge (une ligne qui commence
// en 0xFD7F ou 0xFD80 ne déborde pas encore) ; une bande de plus de 642 pixels qui commencerait
// juste avant déborderait de la fenêtre, sans changer de banque. (En grande vue, les bandes vont
// jusqu'à la largeur de l'écran : le seuil la suit.)
const debordementPossible = () => 0x10000 - (ecran.largeur + 1);

// Les routines appelées.
const POSER_CURSEUR = 0x7D775;           // dessine le pointeur dans la surface, suspend son tracé direct
const RETIRER_CURSEUR = 0x7D79E;         // remet les pixels sous le pointeur, rend le tracé direct
const RENDRE_CURSEUR = 0x7D7C7;          // rend seulement le tracé direct au gestionnaire de souris
// (banque de 64 Ko) : int 10h, 4F05h, fenêtres A et B, en unités de granularité de la carte
// (le mot 0xDE5FC, lu comme la moitié haute de [0xDE5FA]) ; une banque hors de 0 à 5 passe
// d'abord la couleur 0 au rouge, une alarme.
const CHOISIR_BANQUE = 0x7E6BC;
const MARQUER_ZONE_SALE = 0x54D38;       // (x, y, largeur, hauteur), voir ecran.js
const VIDER_GRILLE = 0x54CE4;            // remet à zéro le compte de chaque bloc
const PRESENTER_HAUTE_RESOLUTION = 0x81CD4;  // (hauteur) : l'image entière, banque par banque

const surface = (jeu) => jeu.dv.getUint32(ADRESSES.tamponEcran, true);

// `rep movsd` : n mots longs, du premier au dernier. Quand la destination chevauche la source par
// au-dessus, cette copie en avant répète le motif au lieu de le déplacer ; aucun appel connu ne le
// fait, mais c'est le comportement d'origine, et on le garde.
function copierMotsLongs(jeu, source, destination, n) {
  const octets = n * 4;
  if (octets <= 0) return;
  if (destination <= source || destination >= source + octets) {
    jeu.m8.copyWithin(destination, source, source + octets);
    return;
  }
  const dv = jeu.dv;
  for (let k = 0; k < octets; k += 4) dv.setUint32(destination + k, dv.getUint32(source + k, true), true);
}

// `rep movsb` : n octets, du premier au dernier, même remarque.
function copierOctets(jeu, source, destination, n) {
  if (n <= 0) return;
  const m8 = jeu.m8;
  if (destination <= source || destination >= source + n) {
    m8.copyWithin(destination, source, source + n);
    return;
  }
  for (let k = 0; k < n; k++) m8[destination + k] = m8[source + k];
}

// 0x80210 — présenter l'image en basse résolution.
//
// La surface entière, 320x200, part vers l'écran. Tous les appelants empilent 400, la hauteur de
// l'espace logique : la routine l'ignore, là où sa sœur de haute résolution, 0x81CD4, distingue
// 400 et 480 lignes.
// Le pointeur n'est pas posé dans l'image quand les entrées sont enregistrées (option -r) ou
// rejouées (option -p) : [0xBECB2], fixé une fois pour toutes par la lecture de la ligne de
// commande (0x10010). L'original relit l'octet après la copie ; on fait de même.
// La routine d'origine sauve ecx, que 0x7D775 peut changer ; la réécriture le laisse tel que les
// deux appels le rendent. Les 24 sites d'appel sont du code compilé, pour qui ecx ne survit pas à
// un appel (les fonctions compilées du jeu ne sauvent que ebx, esi, edi et ebp).
export function presenterBasseResolution(jeu) {
  if (jeu.m8[MODE_ENTREES] === 0) jeu.appeler(POSER_CURSEUR);
  copierMotsLongs(jeu, surface(jeu), MEMOIRE_VIDEO, TAILLE_ECRAN_BASSE / 4);
  if (jeu.m8[MODE_ENTREES] === 0) jeu.appeler(RENDRE_CURSEUR);
  // (les animations d'abord : la publication de l'image en porte déjà les retouches, travailleur.js)
  publierLesAnimations(jeu);     // hors du jeu d'origine : les animations intercalées
  releverLImage(jeu);            // hors du jeu d'origine : le défilement fluide (vue-fluide.js)
}

// 0x80E20 — recopier nbLignes lignes de 320 octets d'un tampon à un autre.
//
// Le nombre de lignes est un mot non signé. Sert en basse résolution : la plupart des 26 sites
// d'appel recopient un écran entier (200 lignes) ; le dessin de la carte (0x1B837) y restaure le
// fond sur la surface, sur la hauteur de la vue.
export function recopierLignes320(jeu, source, destination, nbLignes) {
  copierMotsLongs(jeu, source, destination, (nbLignes & 0xFFFF) * (LARGEUR_BASSE / 4));
}

// 0x81CB0 — recopier nbLignes lignes de 640 octets d'un tampon à un autre.
//
// Seul appelant : la restauration du fond en rafraîchissement total (0x54ED6), 480 lignes.
export function recopierLignes640(jeu, source, destination, nbLignes) {
  copierMotsLongs(jeu, source, destination, (nbLignes & 0xFFFF) * (ecran.largeur / 4));
}

// 0x55C24 — recopier une bande de blocs d'un tampon à un autre.
//
// nbMotsLongs mots longs (8 par bloc de 32 pixels) sur chacune des 16 lignes d'une rangée de
// blocs, les lignes étant espacées de 640 octets dans les deux tampons. Le nombre est un mot long
// entier, lu tel quel.
export function recopierBandeDeBlocs(jeu, source, destination, nbMotsLongs) {
  for (let ligne = 0; ligne < HAUTEUR_BLOC; ligne++) {
    const decalage = ligne * ecran.largeur;
    copierMotsLongs(jeu, (source + decalage) >>> 0, (destination + decalage) >>> 0, nbMotsLongs >>> 0);
  }
}

// 0x55DE6 — présenter à l'écran une bande de blocs : longueur pixels à partir de (x, y), sur les
// 16 lignes d'une rangée de blocs, de la surface vers la mémoire vidéo, en haute résolution.
//
// L'écran de 640x480 fait 300 Ko : la position d'un pixel dans l'écran, y * 640 + x, se lit en
// banque (la position divisée par 65 536) et en position dans la fenêtre (le reste). Avant chaque
// ligne, la banque est choisie d'après le début de la ligne, si elle n'est pas déjà montrée. Une
// ligne qui commence tout près de la fin de la fenêtre peut la déborder : elle est alors copiée
// octet par octet, et la banque suivante — celle qui est montrée, plus un — est choisie à l'octet
// où la fenêtre repasse à zéro.
// Les trois paramètres sont des mots non signés ; une longueur nulle ne fait rien.
// La routine sauve et restaure tous les registres, et remet es à la valeur de ds (sans effet dans
// le modèle plat) ; son seul appelant, 0x55507, est du code compilé qui ne relit ni eax, ni ecx,
// ni edx après l'appel. Une troisième boucle, sans changement de banque, suit le code en 0x55EDA :
// aucun saut n'y mène, c'est un reste.
export function presenterBandeDeBlocs(jeu, x, y, longueur) {
  x &= 0xFFFF;
  y &= 0xFFFF;
  longueur &= 0xFFFF;
  if (longueur === 0) return;
  const largeurEcran = ecran.largeur;
  let position = y * largeurEcran + x;
  let source = surface(jeu) + position;
  for (let ligne = 0; ligne < HAUTEUR_BLOC; ligne++) {
    const banque = position >>> 16;
    if (banque !== jeu.dv.getUint16(BANQUE_COURANTE, true)) jeu.appeler(CHOISIR_BANQUE, banque);
    const dansFenetre = position & 0xFFFF;
    if (dansFenetre < debordementPossible()) {
      copierOctets(jeu, source, MEMOIRE_VIDEO + dansFenetre, longueur);
    } else {
      for (let k = 0; k < longueur; k++) {
        const octet = (position + k) & 0xFFFF;
        if (octet === 0) jeu.appeler(CHOISIR_BANQUE, (jeu.dv.getUint16(BANQUE_COURANTE, true) + 1) & 0xFFFF);
        jeu.m8[MEMOIRE_VIDEO + octet] = jeu.m8[source + k];
      }
    }
    position += largeurEcran;
    source += largeurEcran;
  }
}

// 0x54ED6 — restaurer le fond sur la surface de dessin, bloc par bloc (haute résolution).
//
// Appelée avec (fond, surface) par le dessin de la carte (0x1B837), avant d'y dessiner les objets.
// Chaque bloc dont le compte n'est pas nul est décompté et recopié du fond vers la surface. Les
// blocs à recopier qui se suivent dans une rangée forment une seule bande, recopiée d'un coup
// (0x55C24) au premier bloc à laisser qui la suit, ou en fin de rangée. Le programme d'origine
// déroule les 20 colonnes en ligne droite ; la boucle ci-dessous fait exactement la même chose.
//
// En rafraîchissement total ([0xD6BCD] non nul), l'image entière est recopiée (0x81CB0, 480
// lignes de 640 octets), la grille est vidée (0x54CE4), et l'octet est remis à 1, pas à zéro : le
// rafraîchissement total dure jusqu'à ce que 0x40D79 ou la boucle du parc (0x11C45) le lèvent.
export function restaurerFondParBlocs(jeu, source, destination) {
  const m8 = jeu.m8;
  if (m8[RAFRAICHISSEMENT_TOTAL] !== 0) {
    jeu.appeler(0x81CB0, source, destination, ecran.hauteur);
    jeu.appeler(VIDER_GRILLE);
    m8[RAFRAICHISSEMENT_TOTAL] = 1;
    return;
  }
  const { grille, colonnes, rangees, pasRangee, largeur } = ecran;
  for (let rangee = 0; rangee < rangees; rangee++) {
    const entrees = grille + rangee * pasRangee;
    const bande = rangee * HAUTEUR_BLOC * largeur;   // 0x2800 : d'une rangée de blocs à la suivante
    // La bande en cours : son début dans la ligne, en octets, et sa largeur, en mots longs.
    let debut = 0, nbMotsLongs = 0;
    const vider = () => {
      const decalage = bande + debut;
      jeu.appeler(0x55C24, source + decalage, destination + decalage, nbMotsLongs);
    };
    for (let colonne = 0; colonne < colonnes; colonne++) {
      const entree = entrees + 2 * colonne;
      if (m8[entree] !== 0) {
        m8[entree]--;
        nbMotsLongs += LARGEUR_BLOC / 4;
      } else {
        if (nbMotsLongs !== 0) vider();
        debut = (colonne + 1) * LARGEUR_BLOC;
        nbMotsLongs = 0;
      }
    }
    if (nbMotsLongs !== 0) vider();
  }
}

// 0x55507 — présenter l'image à l'écran, bloc par bloc (haute résolution).
//
// La zone de 32x32 sous la souris est d'abord marquée à présenter (pourquoi, en plus des 64x64 que
// marque la pose du pointeur, non établi), puis le pointeur est posé dans l'image — sauf quand un
// écran plein est affiché ([0xB150F], posé par 0x40D3E et levé par 0x40D79, qui vident la grille et
// demandent un rafraîchissement total ; vraisemblablement un écran qui recouvre la vue du parc,
// rôle exact non établi). Puis chaque rangée de la grille est parcourue comme dans 0x54ED6 : les
// blocs à présenter qui se suivent forment une bande, présentée d'un coup (0x55DE6), et chaque
// compte non nul est décrémenté.
//
// En rafraîchissement total, l'image entière part à l'écran :
//  - sans écran plein, par 0x81CD4(480), qui pose de nouveau le pointeur dans l'image : il y est
//    alors dessiné deux fois, et les pixels gardés la seconde fois contiennent déjà le pointeur ;
//  - avec un écran plein, ici même, entre la pose du pointeur et son retrait : en haute résolution,
//    300 Ko en cinq banques, quatre pleines et une de 45 056 octets, la source avançant d'une banque
//    à la suivante ; en basse résolution, 64 000 octets d'un coup — branche morte, car les 24 sites
//    d'appel de 0x55507 sont tous la même alternative, `(mode & 1) ? 0x80210(400) : 0x55507()`, et
//    n'y viennent qu'en haute résolution. La même présentation entière (pose du pointeur, copie
//    dans les deux modes, retrait) figure en ligne dans la boucle du parc (0x11C45, en 0x12316),
//    qui l'emploie pour les écrans [0xD6652] = 0x4A, 0x54, 0x56 et 0x64 en posant [0xD6BCD].
export function presenterParBlocs(jeu) {
  const m8 = jeu.m8;
  // La position de la souris est lue en mots signés (movsx), comme dans l'original.
  const sourisX = jeu.dv.getInt16(ADRESSES.sourisX, true), sourisY = jeu.dv.getInt16(ADRESSES.sourisY, true);
  jeu.appeler(MARQUER_ZONE_SALE, sourisX, sourisY, 32, 32);
  if (m8[ECRAN_PLEIN] === 0) jeu.appeler(POSER_CURSEUR);

  if (m8[RAFRAICHISSEMENT_TOTAL] !== 0) {
    presenterEnEntier(jeu);
  } else {
    const { grille, colonnes, rangees, pasRangee } = ecran;
    for (let rangee = 0; rangee < rangees; rangee++) {
      const entrees = grille + rangee * pasRangee;
      const y = rangee * HAUTEUR_BLOC;
      // La bande en cours : son début et sa largeur, en pixels.
      let x = 0, longueur = 0;
      for (let colonne = 0; colonne < colonnes; colonne++) {
        const entree = entrees + 2 * colonne;
        if (m8[entree] !== 0) {
          m8[entree]--;
          longueur += LARGEUR_BLOC;
        } else {
          if (longueur !== 0) jeu.appeler(0x55DE6, x, y, longueur);
          x = (colonne + 1) * LARGEUR_BLOC;
          longueur = 0;
        }
      }
      if (longueur !== 0) jeu.appeler(0x55DE6, x, y, longueur);
    }
  }

  if (m8[ECRAN_PLEIN] === 0) jeu.appeler(RENDRE_CURSEUR);
  // hors du jeu d'origine : les animations intercalées, puis le défilement fluide et le zoom
  // (vue-fluide.js), dont la publication porte déjà les retouches des animations (travailleur.js) ;
  // le pointeur est resté dans la surface s'il y a été posé
  publierLesAnimations(jeu);
  releverLImage(jeu, m8[ECRAN_PLEIN] === 0 && jeu.dv.getUint32(0xBECB4, true) !== 0);
}

// Le rafraîchissement total de 0x55507 (0x55AA7 à 0x55B63 dans l'original).
function presenterEnEntier(jeu) {
  if (jeu.m8[ECRAN_PLEIN] === 0) {
    // 0x81CD4, transcrite, ne connaît que 640x480 : en grande vue, la même chose à sa taille.
    if (ecran.grande) presenterToutEnGrandeVue(jeu);
    else jeu.appeler(PRESENTER_HAUTE_RESOLUTION, 480);
    return;
  }
  if (jeu.etat.basseResolution) {
    jeu.appeler(POSER_CURSEUR);
    copierMotsLongs(jeu, surface(jeu), MEMOIRE_VIDEO, TAILLE_ECRAN_BASSE / 4);
    jeu.appeler(RETIRER_CURSEUR);
    return;
  }
  jeu.appeler(POSER_CURSEUR);
  const TAILLE_ECRAN_HAUTE = ecran.largeur * ecran.hauteur;
  let source = 0;
  for (let banque = 0; banque * TAILLE_FENETRE < TAILLE_ECRAN_HAUTE; banque++) {
    jeu.appeler(CHOISIR_BANQUE, banque);
    // L'original lit le pointeur de la surface après avoir choisi la première banque.
    if (banque === 0) source = surface(jeu);
    const octets = Math.min(TAILLE_FENETRE, TAILLE_ECRAN_HAUTE - banque * TAILLE_FENETRE);
    copierMotsLongs(jeu, source, MEMOIRE_VIDEO, octets / 4);
    source += octets;
  }
  jeu.appeler(RETIRER_CURSEUR);
}

// Hors du jeu d'origine : 0x81CD4 à la taille de la grande vue (grande-vue.js). Le pointeur posé dans
// l'image, toutes les banques de l'écran recopiées, le tracé direct rendu au gestionnaire de souris.
function presenterToutEnGrandeVue(jeu) {
  if (jeu.m8[MODE_ENTREES] === 0) jeu.appeler(POSER_CURSEUR);
  const taille = ecran.largeur * ecran.hauteur;
  const source = surface(jeu);
  for (let banque = 0; banque * TAILLE_FENETRE < taille; banque++) {
    jeu.appeler(CHOISIR_BANQUE, banque);
    const octets = Math.min(TAILLE_FENETRE, taille - banque * TAILLE_FENETRE);
    copierMotsLongs(jeu, source + banque * TAILLE_FENETRE, MEMOIRE_VIDEO, octets / 4);
  }
  if (jeu.m8[MODE_ENTREES] === 0) jeu.appeler(RENDRE_CURSEUR);
}

// Les tampons où 0x7D775 garde les pixels que le pointeur recouvre, 64x64 au plus : la comparaison
// appel par appel les ajoute à ses zones pour les fonctions qui posent le pointeur.
const TAMPONS_DU_CURSEUR = [0xDE564, 0xDE554];
const zonesDuCurseur = (jeu) => TAMPONS_DU_CURSEUR.map((a) => jeu.dv.getUint32(a, true))
  .filter((p) => p >= 0x100000).map((p) => [p, p + 64 * 64]);

// Toutes prouvées par comparer.mjs (0 divergence, état de l'hôte compris : heure, banque, mémoire
// vidéo, palette) et verifier.mjs (IDENTIQUE) : 0x80210 et 0x80E20 sur demo.json et parc.json,
// les autres en 640x480, sur parc.json et ecrans.json (0x81CB0, rafraîchissement total, sur
// ecrans.json seul). Le champ `zones` déclare au comparateur ce que la fonction écrit hors de ses
// zones par défaut : la destination d'une copie, les tampons du curseur.
// 0x81CD4 — présenter l'image entière en 640x480, banque par banque (la fenêtre VESA de 64 Ko) : 480
// lignes en quatre banques pleines et 45 056 octets, ou, si la hauteur donnée vaut 400, 400 lignes en
// trois banques pleines et 59 392 octets. Le pointeur est posé dans l'image avant (sauf quand les
// entrées sont enregistrées ou rejouées, [0xBECB2]) et son tracé direct rendu après — pour 400
// lignes, rendu dans tous les cas (anomalie reproduite). L'original lit le pointeur de la surface
// après avoir choisi la première banque. Appelée par 0x55507 en rafraîchissement total hors de la
// grande vue, et par le film des attractions (0x60C44) ; aucun scénario ne l'atteint (en attente).
function presenterHauteResolution(jeu, hauteur) {
  if (jeu.m8[MODE_ENTREES] === 0) jeu.appeler(POSER_CURSEUR);
  jeu.appeler(CHOISIR_BANQUE, 0);
  let source = surface(jeu);
  const copier = (octets) => {
    copierMotsLongs(jeu, source, MEMOIRE_VIDEO, octets / 4);
    source += octets;
  };
  copier(TAILLE_FENETRE);
  for (const banque of [1, 2]) { jeu.appeler(CHOISIR_BANQUE, banque); copier(TAILLE_FENETRE); }
  jeu.appeler(CHOISIR_BANQUE, 3);
  if ((hauteur & 0xFFFF) === 400) {
    copier(0x3A00 * 4);
    jeu.appeler(RENDRE_CURSEUR);
    return;
  }
  copier(TAILLE_FENETRE);
  jeu.appeler(CHOISIR_BANQUE, 4);
  copier(0x2C00 * 4);
  if (jeu.m8[MODE_ENTREES] === 0) jeu.appeler(RENDRE_CURSEUR);
}

export const reecritures = [
  { adresse: 0x80210, nom: 'presenterBasseResolution', fn: (jeu) => presenterBasseResolution(jeu), arguments: 0,
    zones: zonesDuCurseur },
  { adresse: 0x80E20, nom: 'recopierLignes320', fn: recopierLignes320, arguments: 3,
    zones: (jeu, source, destination, nbLignes) => [[destination, destination + (nbLignes & 0xFFFF) * LARGEUR_BASSE]] },
  { adresse: 0x81CB0, nom: 'recopierLignes640', fn: recopierLignes640, arguments: 3,
    zones: (jeu, source, destination, nbLignes) => [[destination, destination + (nbLignes & 0xFFFF) * ecran.largeur]] },
  { adresse: 0x55C24, nom: 'recopierBandeDeBlocs', fn: recopierBandeDeBlocs, arguments: 3,
    zones: (jeu, source, destination, n) => [[destination, destination + (HAUTEUR_BLOC - 1) * ecran.largeur + 4 * (n >>> 0)]] },
  { adresse: 0x55DE6, nom: 'presenterBandeDeBlocs', fn: presenterBandeDeBlocs, arguments: 3 },
  { adresse: 0x54ED6, nom: 'restaurerFondParBlocs', fn: restaurerFondParBlocs, arguments: 2,
    zones: (jeu, source, destination) => [[destination, destination + ecran.largeur * ecran.hauteur]] },
  { adresse: 0x55507, nom: 'presenterParBlocs', fn: (jeu) => presenterParBlocs(jeu), arguments: 0,
    zones: zonesDuCurseur },
];

export const enAttente = [
  { adresse: 0x81CD4, nom: 'presenterHauteResolution', fn: presenterHauteResolution, arguments: 1, zones: zonesDuCurseur },
];
