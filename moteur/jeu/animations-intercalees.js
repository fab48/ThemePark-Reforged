// Les animations intercalées (reglages.js, `animationsIntercalees`) : les attractions à tours montrées
// deux fois plus vite, par les dessins du jeu, avec une traînée semi-transparente derrière ce qui bouge.
//
// Ce module n'est pas une réécriture : il n'ajoute rien au jeu d'origine et n'écrit rien dans sa
// mémoire. Comme le défilement fluide (vue-fluide.js), il relève en lecture seule ce que le jeu
// dessine, et compose à part l'image montrée ; la partie, son rythme et l'image indexée du jeu
// restent ceux de 1994.
//
// POURQUOI PAS PLUS D'IMAGES DANS LE JEU. L'animation fait partie de la simulation : l'attraction
// attend la fin de sa boucle pour partir et s'arrêter, le mécanicien répare par boucle, les
// passagers changent de place à chaque boucle (docs/faisabilite.md, A). On ne touche donc ni aux
// boucles ni au délai : l'objet graphique +0x0A reste celui du jeu, qui avance d'une image tous les
// 2 × délai + 1 pas (attractions.js). Seule l'image MONTRÉE change.
//
// LE CHOIX : « ×2 + TRAÎNÉE », retenu par Fabien le 27 septembre 2026 après les essais de
// travail/trainees/ (RIFE seul, DAIN, XVFI, Interprite, fantôme, flou ramené à la palette) ; la glisse
// des morceaux et les images de RIFE montrées nettes, essayées d'abord, sont retirées. Aucune image
// inventée n'est montrée nette : l'attraction passe DEUX FOIS PLUS VITE par les dessins du jeu, tracés
// comme le jeu les tracerait, morceau par morceau, avec leurs passagers (phaseMontree dit lequel).
// Derrière la pièce qui bouge, une TRAÎNÉE semi-transparente, en couleurs pleines : la moyenne des
// images de RIFE (rendu.json) des 2 étapes précédentes, pondérée par (1 − âge / 2)³ (le dégradé « très
// rapide »), publiée à part (RGBA) et mêlée par la page après la palette, seulement là où l'écran
// montre le décor ou le « pied » (ce qui ne bouge pas : la valeur que 3 étapes sur 4 au moins ont à ce
// pixel), jamais sur la pièce qui bouge, les passagers, ni ce qui est devant l'attraction. Juste après
// un changement de boucle, la traînée ne remonte pas avant le début de la boucle.
//
// L'AVANCEMENT. Après le pas dessiné, le compte à rebours +0x14 vaut c (de 2 × délai à 0) : la
// fraction de l'image courante déjà écoulée est f = (2 × délai − c) / (2 × délai + 1). Le travailleur
// présente deux images par pas (60 im/s pour 30 pas par seconde) : la seconde avance encore d'un
// demi-pas. γ = s + t, l'étape s de la boucle et la fraction t, est le temps du jeu dans sa boucle.
//
// COMMENT. Trois temps.
//  1. Pendant le dessin (0x69840, dessin-attractions.js), pour une attraction retenue : la surface
//     de dessin sous son emprise AVANT elle (le fond et ce qui est derrière ; en 640x480, un bloc
//     que rien n'a encore touché à cette image est pris dans le tampon du fond, comme vue-fluide.js),
//     chaque morceau qu'elle trace (morceau, image, position, passager), et la surface APRÈS elle.
//  2. À la présentation (presentation.js), les relevés de l'image sont publiés.
//  3. Dans le travailleur de la page (moteur/web/travailleur.js), à chaque image montrée
//     (`appliquer`) : l'étape montrée est tracée sur le « avant », par un traceur à part qui lit les
//     images du jeu sans rien écrire ; puis chaque pixel de l'emprise est pris dans cette composition
//     si l'écran y a encore la couleur du « après » (rien n'a été dessiné par-dessus l'attraction :
//     visiteurs devant elle, interface, pointeur), sinon dans l'écran.
//
// LA FONTAINE. Une installation (objet de type 0x18, objets.js : dessinerToilettes) que le jeu fait
// passer à l'objet graphique suivant tous les 16 pas, quand il la dessine : CENTRE FOUNTAIN, trois
// images, 1,9 par seconde, la plus lente du parc. Elle est relevée de même (debutDInstallation et
// finDInstallation, autour de son tracé), et montrée de même, sa boucle tournant toujours, avec la
// traînée de ses images de RIFE (rendu.json, `sorte` 'installation'), mais quatre fois plus vite que le
// jeu (VITESSE_DE_LA_FONTAINE, choisi par Fabien, retour 58) : 7,5 images par seconde. Les toilettes
// n'ont qu'une image. (Ses images de RIFE montrées nettes, deux fois plus vite, essayées à la demande
// de Fabien le 28 septembre 2026, retour 57, ne sont pas retenues : comme le reste, ×2 + traînée.)
//
// LIMITES. Seules les attractions à tours (mode 2) dont rendu.json a les boucles ; en marche, au départ
// et à l'arrêt en cours, pas au repos. Un objet devant l'attraction qui aurait par hasard, à un pixel,
// la couleur de l'attraction à cet endroit, y laisse passer l'étape montrée. Quand la page compose
// elle-même son image (glisse du défilement fluide, zoom), elle repose les retouches que le
// travailleur publie (dernieresRetouches, moteur/web/retouches.js).

import { reglages } from './reglages.js';
import { ecran } from './grande-vue.js';

// --- les adresses (retro-ingenierie.md § 6.4, § 10.3 ; attractions.js, dessin-attractions.js) ---
const OBJETS_GRAPHIQUES = 0xD3B80, MORCEAUX = 0xD3B7C, IMAGES = 0xD3BB8;
const CATALOGUE = 0xCCED0, FICHE_IDENTIFIANT = 0x22, FICHE_IMAGE_EN_MARCHE = 0x26;
const FIGURES = 0xD3B38;           // table de mots : numéro de figure → sa première image
const IMAGES_EQUIVALENTES = 0xB9A78, LIGNE_D_EQUIVALENTES = 0x5E, NOMBRE_D_EQUIVALENTES = 0x2F;
const IMAGE = 0x0A, MODE = 0x0C, DELAI = 0x13, ATTENTE_IMAGE = 0x14, GENRE = 0x16, PHASE = 0x32;
const TEMPS_RESTANT = 0x36, SORTE = 0x59;
const TOURS_ACHEVES = 0x20;        // mot long : boucles d'animation achevées depuis le départ (dessin-attractions.js)
const FICHE_DISPOSITION = 0xB3;    // octet : 0 et 1, les places tournent d'un passager par boucle achevée
const FICHE_CAPACITE = 0xA6;       // mot : le nombre d'entrées de l'anneau des passagers
const PREMIER_A_BORD = 0x47;       // mot : le premier passager ; les suivants par leur propre mot +47
const OBJETS_DU_PARC = 0xD3B10, TAILLE_OBJET = 200;
const A_TOURS = 2, AU_DEPART = 1, EN_MARCHE = 2, ARRET_EN_COURS = 3;
const PLACE = 0x80;
const MODE_AFFICHAGE = 0xDE5F6, FACON_DE_DESSINER = 0xD667C, ECRAN_COURANT = 0xD6652;
const SURFACE = 0xDE5BC, PAS_LIGNE = 0xDE5B8, FENETRE_LARGEUR = 0xDE5C8, FENETRE_HAUTEUR = 0xDE5F0;
const TAMPON_FOND = 0xD3B98, TABLE_FUSION = 0xBA2F8, PAS_DE_SIMULATION = 0xD3AFC;
const LARGEUR_BLOC = 32, HAUTEUR_BLOC = 16;
const MIROIR_H = 1, MIROIR_V = 2, FUSION = 4, AUTRES_VARIANTES = 8 | 0x20 | 0x40;
// Les installations (type 0x18) : leur rang dans le catalogue des décors est leur mot +0x16 (GENRE) ;
// le jeu les fait avancer d'une image quand il les dessine à un pas multiple de 16.
const PAS_PAR_IMAGE_D_INSTALLATION = 16;
// Combien de fois plus vite la montrée passe par les dessins du jeu (phaseMontree) : deux pour les
// attractions ; quatre pour la fontaine, choisi par Fabien après le ×2 (retour 58).
const VITESSE = 2, VITESSE_DE_LA_FONTAINE = 4;

const mot = (dv, a) => dv.getUint16(a, true);
const motSigne = (dv, a) => dv.getInt16(a, true);
const motLong = (dv, a) => dv.getUint32(a, true);

// Ce que dessin-attractions.js note pendant le tracé d'une attraction retenue : `poses` non nul, il
// y range, pour chaque morceau tracé, (morceau, image, x, y, passager). `passager` est posé autour
// du tracé d'un passager. Réglage éteint, `poses` reste nul : un test, rien d'autre.
export const observation = { poses: null, passager: 0 };

export const animationsIntercalees = {
  // appels : attractions dessinées réglage allumé ; ecartees : ni retenues, ni en mouvement
  compteurs: { appels: 0, ecartees: 0, relevees: 0, publiees: 0, appliquees: 0, pixels: 0, passagers: 0 },
  // au plus un calcul de traînée par image (calculFait) ; faux pour les essais qui comparent image
  // par image avec une traînée calculée sur-le-champ
  unCalculParImage: true,
  // la vitesse montrée des installations (la fontaine), en fois celle du jeu
  vitesseDesInstallations: VITESSE_DE_LA_FONTAINE,
};

// La clé d'une animation de rendu.json dans `cuites` : l'identifiant de son genre (fiche +0x22) pour
// une attraction ; pour une installation, son rang dans le catalogue des décors, préfixé (les deux
// numérotations se recouvrent).
const cleDInstallation = (rang) => `installation ${rang}`;
const cleDe = (a) => (a.sorte === 'installation' ? cleDInstallation(a.identifiant) : a.identifiant);

// Les boucles de rendu.json, par identifiant de genre (fiche +0x22 ; pour une installation, cleDe) :
// Map objet graphique G → { boucle, s, devant, signature }, l'étape s de la boucle ; `devant` : la
// couche de devant quand l'attraction est cuite en deux couches (`boucle` est alors la couche du
// fond). Vide tant que le travailleur n'a rien chargé.
const cuites = new Map();
// Les boucles de chaque attraction : [{ boucle, devant }] (preparerLaSuite).
const bouclesDeLaTrainee = new Map();
const signaturesVerifiees = new Map();     // G → les morceaux de G sont-ils ceux de l'export ?

// Décoder le base64 de rendu.json, dans le travailleur comme sous Node : par le navigateur s'il sait le
// faire (Uint8Array.fromBase64), sinon par une table (atob, puis un caractère à la fois, était vingt fois
// plus lent : 2 s pour tout rendu.json).
const BASE64 = new Uint8Array(128);
[...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].forEach((c, k) => { BASE64[c.charCodeAt(0)] = k; });
function octets(texte) {
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(texte);
  let n = texte.length;
  while (n > 0 && texte.charCodeAt(n - 1) === 61) n--;          // (les « = » de la fin)
  const t = new Uint8Array((n * 3) >> 2);
  const v = (k) => BASE64[texte.charCodeAt(k)];
  let o = 0, k = 0;
  for (; k + 4 <= n; k += 4) {
    const x = v(k) << 18 | v(k + 1) << 12 | v(k + 2) << 6 | v(k + 3);
    t[o++] = x >> 16; t[o++] = (x >> 8) & 255; t[o++] = x & 255;
  }
  if (n - k >= 2) {
    const x = v(k) << 18 | v(k + 1) << 12 | (n - k === 3 ? v(k + 2) << 6 : 0);
    t[o++] = x >> 16;
    if (n - k === 3) t[o++] = (x >> 8) & 255;
  }
  return t;
}

// Une boucle de rendu.json, décodée (tout rendu.json en un dixième de seconde). Ses images arrivent
// prêtes : ce qui ne bouge pas d'une image clé à l'autre y est déjà figé contre le scintillement
// (importer-animations.mjs, LE SCINTILLEMENT). `nPassages` : combien d'intermédiaires a chaque étape.
function preparerLaBoucle(b, identifiant) {
  return { ...b, identifiant, etapes: b.etapes.map(octets), passages: b.passages.map((p) => p.map(octets)),
    nPassages: b.passages.map((p) => p.length) };
}

// Charger rendu.json (importer-animations.mjs), déjà analysé ; null : rien. Rend le nombre
// d'attractions retenues. Toutes les boucles, sauf les passages entre boucles (que seule demandait la
// façon « images », retirée), et chaque étape. Une boucle cuite en deux couches (`couche` : 'fond', ce
// que le jeu trace avant la première place de passager, 'devant', ce qu'il trace après ; `boucleDe` :
// la boucle entière) l'emporte sur la boucle entière.
export function definirLesImagesCuites(rendu) {
  cuites.clear();
  signaturesVerifiees.clear();
  etatsDeTrainee.clear();
  bouclesDeLaTrainee.clear();
  for (const a of (rendu && rendu.attractions) || []) {
    const cle = cleDe(a);
    const boucles = a.boucles.filter((b) => !b.passage).map((b) => preparerLaBoucle(b, cle));
    const parObjet = new Map();
    for (const boucle of boucles.filter((b) => !b.couche)) {
      boucle.objets.forEach((g, s) => parObjet.set(g, { boucle, s, devant: null, signature: boucle.signatures[s].join(',') }));
    }
    const couches = new Map();
    for (const b of boucles.filter((x) => x.couche)) {
      const e = couches.get(b.boucleDe) || {};
      e[b.couche] = b;
      couches.set(b.boucleDe, e);
    }
    for (const { fond, devant } of couches.values()) {
      if (!fond || !devant) continue;
      fond.objets.forEach((g, s) => {
        if (devant.objets[s] !== g) return;
        parObjet.set(g, { boucle: fond, s, devant, signature: [...fond.signatures[s], ...devant.signatures[s]].join(',') });
      });
    }
    if (!parObjet.size) continue;
    cuites.set(cle, parObjet);
    const parBoucle = new Map([...parObjet.values()].map((x) => [x.boucle, { boucle: x.boucle, devant: x.devant }]));
    bouclesDeLaTrainee.set(cle, [...parBoucle.values()]);
  }
  return cuites.size;
}

// Les attractions (et installations) chargées.
export const attractionsDeLaTrainee = () => cuites.size;

let enCours = [];                  // les relevés de l'image en cours de dessin
let publication = { numero: 0, releves: [], pas: 0, us: 0 };
let capture = null;                // l'attraction en cours de tracé

// Les morceaux ({ dx, dy, largeur, hauteur, place, image }) de deux images sont appariés par la
// proximité de leur pied (le milieu du bas de l'image), les places entre elles, les autres entre eux,
// au plus près d'abord ; au-delà de `seuil`, un morceau n'a pas de pareil. Pour le recensement
// (moteur/node/animations.mjs).
export function apparier(a, b, seuil) {
  const pied = (m) => [m.dx + (m.largeur >> 1), m.dy + m.hauteur];
  const paires = [];
  a.forEach((ma, i) => b.forEach((mb, j) => {
    if (ma.place !== mb.place || !ma.image || !mb.image) return;
    const [xa, ya] = pied(ma), [xb, yb] = pied(mb);
    const d = Math.hypot(xb - xa, yb - ya);
    if (d <= seuil) paires.push([d, i, j]);
  }));
  paires.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  const deA = new Array(a.length).fill(-1), deB = new Array(b.length).fill(-1);
  for (const [, i, j] of paires) if (deA[i] < 0 && deB[j] < 0) { deA[i] = j; deB[j] = i; }
  return { deA, deB };
}

// Les morceaux d'un objet graphique, en unités logiques (celles du jeu : doublées en 320x200).
function morceauxDe(m8, dv, n) {
  const og = motLong(dv, OBJETS_GRAPHIQUES), mo = motLong(dv, MORCEAUX), im = motLong(dv, IMAGES);
  const liste = [];
  for (let m = mo + 10 * mot(dv, og + 8 * n), garde = 0; m > mo && garde < 100; m = mo + 10 * mot(dv, m + 8), garde++) {
    const decalage = mot(dv, m), img = im + decalage;
    liste.push({ adresse: m, image: decalage, img, dx: motSigne(dv, m + 2), dy: motSigne(dv, m + 4),
      drapeaux: mot(dv, m + 6), place: (m8[m + 6] & PLACE) !== 0,
      largeur: decalage ? m8[img + 4] : 0, hauteur: decalage ? m8[img + 5] : 0 });
  }
  return liste;
}

// Les morceaux d'un objet graphique, gardés (les tables ne changent pas en partie ; oubliés au
// changement de mode, où les dimensions sont doublées ou non).
const morceauxGardes = new Map();
let modeDesMorceaux = -1;
function morceauxEnMemoire(m8, dv, g, echelle) {
  if (echelle !== modeDesMorceaux) { morceauxGardes.clear(); modeDesMorceaux = echelle; }
  let liste = morceauxGardes.get(g);
  if (!liste) { liste = morceauxDe(m8, dv, g); morceauxGardes.set(g, liste); }
  return liste;
}

// --- 1. pendant le dessin ------------------------------------------------------------------------

// Pourquoi une attraction dessinée n'est pas retouchée (ou « retenue ») : compté par identifiant de
// genre dans animationsIntercalees.refus, si les essais y ont mis une Map ; sinon, rien.
function refus(identifiant, raison) {
  const r = animationsIntercalees.refus;
  if (r) { const k = `${identifiant} ${raison}`; r.set(k, (r.get(k) || 0) + 1); }
  return null;
}

// L'attraction est-elle retenue, et où en est son animation ? Rend null, ou { g0, f, pasParImage,
// cuite, arret, depart, restant, cyclique }.
//  - `arret` : l'arrêt est en cours (l'image montrée finit sur celle où le jeu s'arrêtera) ;
//  - `depart` : le départ est en cours ; `restant` : le temps du tour qui reste, en pas (+0x36 : la
//    marche finit à la première fin de boucle après qu'il est écoulé) ;
//  - `cyclique` : la boucle est celle de la marche, que le jeu joue en boucle (et qu'on montre deux fois
//    plus vite) ; sinon, une boucle que le jeu ne joue qu'une fois, de sa première image à sa dernière :
//    la montée en balancement du départ du bateau et de la navette, leur ralenti à l'arrêt. Une
//    attraction sans figure de marche (les tasses) garde sa boucle du repos, qui tourne.
function animation(jeu, objet) {
  const m8 = jeu.m8, dv = jeu.dv;
  const fiche = CATALOGUE + mot(dv, objet + GENRE);
  const identifiant = mot(dv, fiche + FICHE_IDENTIFIANT);
  if (m8[objet + MODE] !== A_TOURS) return refus(identifiant, `mode ${m8[objet + MODE]}`);
  if (!cuites.has(identifiant)) return refus(identifiant, 'sans images');
  const phase = mot(dv, objet + PHASE);
  const tourne = phase === AU_DEPART || phase === EN_MARCHE
    || (phase === ARRET_EN_COURS && motSigne(dv, objet + TEMPS_RESTANT) > 0);
  const g0 = mot(dv, objet + IMAGE);
  const annoncee = mot(dv, motLong(dv, OBJETS_GRAPHIQUES) + 8 * g0 + 6);
  if (!tourne) return refus(identifiant, `phase ${phase}${g0 && annoncee && g0 !== annoncee ? ' (animée)' : ''}`);
  if (!g0 || !annoncee || g0 === annoncee) return refus(identifiant, 'image fixe');
  const delai = m8[objet + DELAI];
  const pasParImage = 2 * delai + 1;
  const c = motSigne(dv, objet + ATTENTE_IMAGE);
  const f = Math.max(0, Math.min(pasParImage - 1, 2 * delai - c)) / pasParImage;
  const cuite = etapeReconnue(m8, dv, identifiant, g0, annoncee);
  if (!cuite) return null;
  refus(identifiant, 'retenue');
  const figureDeMarche = mot(dv, fiche + FICHE_IMAGE_EN_MARCHE);
  const imageDeMarche = figureDeMarche ? mot(dv, motLong(dv, FIGURES) + 2 * figureDeMarche) : 0;
  return { g0, f, pasParImage, cuite, arret: phase === ARRET_EN_COURS, depart: phase === AU_DEPART,
    restant: motSigne(dv, objet + TEMPS_RESTANT), cyclique: !imageDeMarche || cuite.boucle.objets.includes(imageDeMarche),
    vitesse: VITESSE, avecPassagers: true };
}

// L'étape G de rendu.json (clé `cle` de cuites), si elle mène bien à l'image que G annonce (la boucle de
// l'export ; la dernière annonce la première), et si ses morceaux sont bien ceux de l'export ; sinon
// null.
function etapeReconnue(m8, dv, cle, g0, annoncee) {
  const cuite = cuites.get(cle).get(g0) || null;
  if (!cuite) return refus(cle, `étape inconnue ${g0}`);
  const { objets } = cuite.boucle;
  if (objets[(cuite.s + 1) % objets.length] !== annoncee) return refus(cle, `suite ${g0}→${annoncee}`);
  if (!signaturesVerifiees.has(g0)) {
    const lue = morceauxDe(m8, dv, g0).filter((m) => m.image && !m.place).map((m) => m.image / 6).join(',');
    signaturesVerifiees.set(g0, cuite.signature === lue);
  }
  if (!signaturesVerifiees.get(g0)) return refus(cle, `signature ${g0}`);
  return cuite;
}

// Une installation (la fontaine) est-elle retenue, et où en est son animation ? Rend null, ou ce que
// rend `animation`. Le jeu la fait passer à l'objet graphique suivant quand il la dessine à un pas
// multiple de 16 (objets.js, dessinerToilettes) : après le pas dessiné, la fraction écoulée de l'image
// courante est (pas mod 16) / 16. Sa boucle tourne toujours, sans départ ni arrêt : comme la marche
// d'une attraction, montrée plus vite (vitesseDesInstallations), sans passagers.
// (À une vitesse lente, le jeu dessine plusieurs images au même pas : au pas multiple de 16, la fontaine
// y saute autant d'images, et la montrée la suit, repartant de son image.)
function animationDInstallation(jeu, objet) {
  const dv = jeu.dv;
  const cle = cleDInstallation(mot(dv, objet + GENRE));
  if (!cuites.has(cle)) return refus(cle, 'sans images');
  const g0 = mot(dv, objet + IMAGE);
  const annoncee = mot(dv, motLong(dv, OBJETS_GRAPHIQUES) + 8 * g0 + 6);
  if (!g0 || !annoncee || g0 === annoncee) return refus(cle, 'image fixe');
  const cuite = etapeReconnue(jeu.m8, dv, cle, g0, annoncee);
  if (!cuite) return null;
  refus(cle, 'retenue');
  const pas = dv.getUint32(PAS_DE_SIMULATION, true);
  return { g0, f: (pas % PAS_PAR_IMAGE_D_INSTALLATION) / PAS_PAR_IMAGE_D_INSTALLATION, pasParImage: PAS_PAR_IMAGE_D_INSTALLATION,
    cuite, arret: false, depart: false, restant: Infinity, cyclique: true,
    vitesse: animationsIntercalees.vitesseDesInstallations, avecPassagers: false };
}

// Copie de la surface sur le rectangle (en pixels de la surface) ; en 640x480, un bloc au compte nul
// (rien n'y a été restauré ni dessiné à cette image) est pris dans le tampon du fond.
function releverLaSurface(jeu, r, basse) {
  const m8 = jeu.m8, dv = jeu.dv;
  const surface = motLong(dv, SURFACE), pas = dv.getInt32(PAS_LIGNE, true);
  const fond = motLong(dv, TAMPON_FOND);
  const t = new Uint8Array(r.l * r.h);
  const { grille, pasRangee } = ecran;
  for (let y = 0; y < r.h; y++) {
    const ligne = r.y + y;
    const d = ligne * pas + r.x;
    t.set(m8.subarray(surface + d, surface + d + r.l), y * r.l);
    if (basse) continue;
    const rb = (ligne / HAUTEUR_BLOC) | 0;
    for (let x = 0; x < r.l;) {
      const colonne = r.x + x, cb = (colonne / LARGEUR_BLOC) | 0;
      const fin = Math.min(r.l, (cb + 1) * LARGEUR_BLOC - r.x);
      if (m8[grille + rb * pasRangee + 2 * cb] === 0) t.set(m8.subarray(fond + d + x, fond + d + fin), y * r.l + x);
      x = fin;
    }
  }
  return t;
}

// Le relevé d'un objet retenu (`a`, ce que rend animation ou animationDInstallation), dessiné au point
// (x, y) en unités logiques : son emprise, et la surface sous elle avant son tracé. Rend null si
// l'emprise est hors de la fenêtre.
function commencerLeReleve(jeu, objet, x, y, a) {
  const m8 = jeu.m8, dv = jeu.dv;
  x = (x << 16) >> 16; y = (y << 16) >> 16;      // des mots signés, comme les lisent 0x69840 et 0x209B5
  const basse = (m8[MODE_AFFICHAGE] & 1) !== 0, echelle = basse ? 2 : 1;
  const morceaux = morceauxEnMemoire(m8, dv, a.g0, echelle);
  // L'emprise : les morceaux de G, plus une marge pour les passagers (leur image est centrée sur la
  // place et posée sur le même pied, mais peut être plus grande) ; et toute la boucle, dont chaque
  // étape peut être montrée, avec ses passagers : la marge des places tout autour (sans passagers,
  // celle des bords).
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of morceaux) {
    if (!m.image) continue;
    const marge = m.place ? 16 * echelle : 2 * echelle;
    x0 = Math.min(x0, m.dx - marge); y0 = Math.min(y0, m.dy - marge);
    x1 = Math.max(x1, m.dx + m.largeur + marge); y1 = Math.max(y1, m.dy + m.hauteur + 2 * echelle);
  }
  const { ancrage, largeur: lc, hauteur: hc } = a.cuite.boucle;
  const marge = (a.avecPassagers ? 16 : 2) * echelle;
  x0 = Math.min(x0, -ancrage.x * echelle - marge); y0 = Math.min(y0, -ancrage.y * echelle - marge);
  x1 = Math.max(x1, (lc - ancrage.x) * echelle + marge); y1 = Math.max(y1, (hc - ancrage.y) * echelle + marge);
  const largeur = dv.getInt32(FENETRE_LARGEUR, true), hauteur = dv.getInt32(FENETRE_HAUTEUR, true);
  const vers = (v) => (basse ? v >> 1 : v);
  const rx = Math.max(0, vers(x + x0)), ry = Math.max(0, vers(y + y0));
  const rx1 = Math.min(largeur, vers(x + x1) + 1), ry1 = Math.min(hauteur, vers(y + y1) + 1);
  if (rx1 <= rx || ry1 <= ry) return null;
  const r = { x: rx, y: ry, l: rx1 - rx, h: ry1 - ry };
  return { ...a, objet, x, y, r, basse, echelle, morceaux, avant: releverLaSurface(jeu, r, basse), poses: [],
    table: motLong(dv, TABLE_FUSION), pas: dv.getInt32(PAS_LIGNE, true), sortes: new Map(), tours: 0, tournantes: false };
}

// 0x69840, à l'entrée : (x, y) est la place fine de l'attraction, en unités logiques.
export function debutDAttraction(jeu, objet, x, y) {
  capture = null;
  if (!reglages.animationsIntercalees) return;
  const m8 = jeu.m8, dv = jeu.dv;
  if (mot(dv, FACON_DE_DESSINER) !== 0 || mot(dv, ECRAN_COURANT) !== 0) return;
  animationsIntercalees.compteurs.appels++;
  const a = animation(jeu, objet);
  if (!a) { animationsIntercalees.compteurs.ecartees++; return; }
  capture = commencerLeReleve(jeu, objet, x, y, a);
  if (!capture) return;
  // Les tours achevés et la disposition des places, pour faire suivre les passagers ; si les places
  // tournent, de quoi refaire l'anneau du jeu pour un autre nombre de tours : les passagers à bord dans
  // l'ordre de leur chaîne, leur sorte, la capacité de la fiche.
  capture.tours = motLong(dv, objet + TOURS_ACHEVES);
  const fiche = CATALOGUE + mot(dv, objet + GENRE);
  capture.tournantes = m8[fiche + FICHE_DISPOSITION] <= 1;
  if (capture.tournantes) {
    capture.capacite = motSigne(dv, fiche + FICHE_CAPACITE);
    capture.chaine = [];
    const base = motLong(dv, OBJETS_DU_PARC);
    for (let numero = mot(dv, objet + PREMIER_A_BORD), garde = 0; numero && garde <= 0x23; garde++) {
      const p = base + numero * TAILLE_OBJET;
      capture.chaine.push(p);
      capture.sortes.set(p, m8[p + SORTE]);
      numero = mot(dv, p + PREMIER_A_BORD);
    }
  }
  observation.poses = capture.poses;
}

// 0x69840, à la sortie.
export function finDAttraction(jeu) {
  observation.poses = null;
  observation.passager = 0;
  if (!capture) return;
  const c = capture;
  capture = null;
  c.apres = releverLaSurface(jeu, c.r, c.basse);
  // La sorte de chaque passager tracé (sa ligne d'images), lue maintenant : l'objet peut changer.
  for (let k = 4; k < c.poses.length; k += 5) if (c.poses[k]) c.sortes.set(c.poses[k], jeu.m8[c.poses[k] + SORTE]);
  if (enCours.length < 64) enCours.push(c);
  animationsIntercalees.compteurs.relevees++;
}

// Le tracé d'une installation (objets.js, dessinerToilettes), à l'entrée : (x, y) est le point où le
// jeu la pose (0x209B5), en unités logiques. Sans passagers : les morceaux tracés ne sont pas notés.
export function debutDInstallation(jeu, objet, x, y) {
  capture = null;
  if (!reglages.animationsIntercalees) return;
  const dv = jeu.dv;
  if (mot(dv, FACON_DE_DESSINER) !== 0 || mot(dv, ECRAN_COURANT) !== 0) return;
  animationsIntercalees.compteurs.appels++;
  const a = animationDInstallation(jeu, objet);
  if (!a) { animationsIntercalees.compteurs.ecartees++; return; }
  capture = commencerLeReleve(jeu, objet, x, y, a);
}

// Et à la sortie : comme une attraction.
export const finDInstallation = finDAttraction;

// --- 2. à la présentation --------------------------------------------------------------------------
export function publierLesAnimations(jeu) {
  if (!reglages.animationsIntercalees && !publication.releves.length && !enCours.length) return;
  // (us : l'heure virtuelle de la publication, pour l'horloge des pas d'appliquer)
  publication = { numero: publication.numero + 1, releves: enCours, pas: jeu.dv.getUint32(PAS_DE_SIMULATION, true),
    largeur: jeu.dv.getInt32(PAS_LIGNE, true), us: jeu.machine ? jeu.machine.us : 0 };
  enCours = [];
  if (publication.releves.length) animationsIntercalees.compteurs.publiees++;
}

// --- 3. dans le travailleur de la page -----------------------------------------------------------

// Un traceur à part : pose l'image `img` (adresse de son entrée dans la table des images) au point
// (x, y) de la surface, dans le tampon t du rectangle r, avec les drapeaux du morceau, comme 0x5ED21
// (traceur.js) : miroirs (partant d'un pixel plus loin, comme l'original), fusion ; les autres
// variantes ne sont pas suivies (rend false). Les pixels hors du rectangle sont ignorés.
function poser(m8, dv, img, x, y, drapeaux, basse, t, r, table) {
  let largeur = m8[img + 4], hauteur = m8[img + 5];
  if (basse) { largeur >>= 1; hauteur >>= 1; }
  if (hauteur === 0) return true;
  let variante;
  if (drapeaux & MIROIR_H) variante = 'h';
  else if (drapeaux === 0) variante = 'd';
  else if (drapeaux & MIROIR_V) variante = 'v';
  else if (drapeaux & FUSION) variante = 'f';
  else if (drapeaux & AUTRES_VARIANTES) return false;
  else variante = 'd';
  // Au bord gauche ou droit de la fenêtre (à l'origine), le jeu ne découpe que le tracé simple et les
  // miroirs : une image d'une autre variante qui en dépasse (la fusion, un passager, marqué 0x80) n'est
  // pas tracée du tout (0x5ED21, traceur.js).
  if ((x < 0 || x + largeur >= dv.getInt32(FENETRE_LARGEUR, true)) && drapeaux !== 0 && !(drapeaux & (MIROIR_H | MIROIR_V))) return true;
  const vertical = (drapeaux & MIROIR_H) ? (drapeaux & MIROIR_V) !== 0 : variante === 'v';
  let src = motLong(dv, img);
  const pas = variante === 'h' ? -1 : 1;
  const colonne0 = variante === 'h' ? x + largeur : x;
  // (une ligne codée finit par 0 ; une adresse hors de la mémoire, une image relevée juste avant que
  // le jeu ne recharge les siennes, ne se tracerait jamais jusqu'au bout)
  const fin = m8.length;
  for (let k = 0; k < hauteur; k++) {
    const rangee = vertical ? y + hauteur - k : y + k;
    const ty = rangee - r.y;
    const dedans = ty >= 0 && ty < r.h;
    let colonne = colonne0;
    for (;;) {
      if (src >= fin) return false;
      const code = m8[src++];
      if (code === 0) break;
      let n = code;
      if (code & 0x80) {
        colonne += pas * (256 - code);
        if (variante === 'f') continue;
        n = m8[src++];
      }
      for (let i = 0; i < n; i++, colonne += pas) {
        const v = m8[src++];
        const tx = colonne - r.x;
        if (!dedans || tx < 0 || tx >= r.l) continue;
        const o = ty * r.l + tx;
        t[o] = variante === 'f' ? m8[table + (t[o] << 8 | v)] : v;
      }
    }
  }
  return true;
}

// L'image d'un passager de la sorte `sorte` à une place dont l'image est `imagePlace` (décalage) :
// comme imageEquivalente (dessin-attractions.js). −1 : pas d'image.
function imageEquivalente(dv, imagePlace, sorte) {
  if (sorte === 0) return imagePlace;
  for (let k = 0; k < NOMBRE_D_EQUIVALENTES; k++) {
    if (mot(dv, IMAGES_EQUIVALENTES + 2 * k) === imagePlace) return mot(dv, IMAGES_EQUIVALENTES + sorte * LIGNE_D_EQUIVALENTES + 2 * k);
  }
  return -1;
}

// Les passagers que le jeu a mis aux places de l'image courante, dans l'ordre des places (0 : vide).
function passagersDansLOrdre(c) {
  if (c.passagers) return c.passagers;
  const parMorceau = new Map();
  for (let k = 0; k < c.poses.length; k += 5) if (c.poses[k + 4]) parMorceau.set(c.poses[k], c.poses[k + 4]);
  c.passagers = c.morceaux.filter((m) => m.place).map((m) => parMorceau.get(m.adresse) || 0);
  return c.passagers;
}

// Les passagers des `places` premières places quand les places tournent, pour `tours` boucles
// achevées, comme le jeu les placerait (placerEnTournant puis tracerAvecPassagers, dessin-attractions.js),
// d'après ce que le relevé en a gardé : l'anneau des passagers à bord (dans l'ordre de leur chaîne),
// complété de places vides (−1) jusqu'à la capacité, parcouru en descendant depuis l'entrée
// (tours mod capacité) + n − capacité ; chaque place prend l'entrée non nulle suivante. Rend, place par
// place, l'adresse du passager, ou 0.
function passagersTournants(c, tours, places) {
  const C = c.capacite, n = c.chaine.length;
  if (!(C > 0 && C <= 40)) return new Array(places).fill(0);
  const anneau = new Array(40).fill(0);
  c.chaine.forEach((p, k) => { anneau[k] = p; });
  const tour = (tours >>> 0) % C;
  let prochaine = tour + n - C;
  if (n > C) for (let j = n - C - 1; j >= 0; j--) anneau[j] = 0;
  else if (n < C) { prochaine = (n + tour) % C; for (let j = n; j < C; j++) anneau[j] = -1; }
  prochaine = Math.max(0, Math.min(40, prochaine));
  const res = [];
  for (let k = 0; k < places; k++) {
    let p = 0;
    for (let garde = 0; p === 0 && garde < 40; garde++) {
      if (prochaine === 0) prochaine = 40;
      prochaine--;
      p = anneau[prochaine];
    }
    if (p !== 0) anneau[prochaine] = 0;
    res.push(p > 0 ? p : 0);
  }
  return res;
}

// Tracer l'image g (une étape de la boucle) comme le jeu la tracerait (tracerAvecPassagers,
// dessin-attractions.js) : ses morceaux dans l'ordre, et à chaque place son passager, centré sur elle et
// posé sur le même pied (tracerALaPlace). Places fixes : ceux que le jeu a mis aux mêmes places de
// l'image courante ; places qui tournent : ceux que le jeu y mettrait après `tours` boucles achevées.
function tracerLEtape(m8, dv, c, g, tours, tampon) {
  const { basse, r, table } = c;
  const vers = (v) => (basse ? v >> 1 : v);
  const im = motLong(dv, IMAGES);
  const morceaux = morceauxEnMemoire(m8, dv, g, c.echelle);
  const passagers = c.tournantes ? passagersTournants(c, tours, morceaux.filter((m) => m.place).length) : passagersDansLOrdre(c);
  let rang = 0, complet = true;
  for (const m of morceaux) {
    if (!m.place) {
      if (m.image && !poser(m8, dv, m.img, vers(c.x + m.dx), vers(c.y + m.dy), m.drapeaux, basse, tampon, r, table)) complet = false;
      continue;
    }
    const passager = passagers[rang++] || 0;
    if (!passager || !m.image) continue;
    const decalage = imageEquivalente(dv, m.image, c.sortes.get(passager) || 0);
    if (decalage <= 0) continue;
    const img = im + decalage;
    const px = c.x - (m8[img + 4] >> 1) + (m.largeur >> 1) + m.dx;
    const py = c.y - m8[img + 5] + m.hauteur + m.dy;
    if (!poser(m8, dv, img, vers(px), vers(py), m.drapeaux, basse, tampon, r, table)) complet = false;
    animationsIntercalees.compteurs.passagers++;
  }
  return complet;
}

// La traînée d'une boucle (une entrée de cuites : la boucle, et sa couche de devant), préparée à sa
// première étape montrée, ou d'avance (preparerLaSuite) : ses images (étapes et intermédiaires ; la
// couche du fond et celle de devant, superposées à la lecture), leur temps en étapes, le pied, et les
// traînées déjà calculées, par étape. Sans intermédiaires, pas de traînée : rien d'autre à préparer.
const etatsDeTrainee = new Map();
const LONGUEUR_DE_TRAINEE = 2;       // en étapes
const DEGRADE = 3;                   // le poids d'une image d'âge a : (1 − a / L)^3, « très rapide »
// Un calcul de traînée a-t-il eu lieu pour l'image en cours (appliquer) ? Il y en a un au plus par
// image (jusqu'à 15 ms la première fois, le temps que le moteur JavaScript compile le calcul) : une
// étape dont la traînée n'est pas prête est montrée sans elle, et l'image suivante la calcule ; une
// image qui n'a rien calculé prépare ce que les suivantes demanderont (preparerLaSuite).
let calculFait = false;
function etatDeTrainee(boucle, devant) {
  let e = etatsDeTrainee.get(boucle);
  if (e) return e;
  calculFait = true;
  const { largeur, hauteur } = boucle, n = largeur * hauteur, N = boucle.objets.length;
  const avecIntermediaires = boucle.nPassages.some((k) => k > 0);
  e = { N, largeur, hauteur, avecIntermediaires, cle: null, traineesPar: new Map() };
  etatsDeTrainee.set(boucle, e);
  if (!avecIntermediaires) return e;
  const images = [], temps = [], etapes = [];
  for (let s = 0; s < N; s++) {
    const liste = [boucle.etapes[s], ...boucle.passages[s]];
    const dessus = devant ? [devant.etapes[s], ...devant.passages[s]] : null;
    liste.forEach((fond, j) => {
      const x = { fond, dessus: dessus ? dessus[Math.min(j, dessus.length - 1)] : null };
      if (j === 0) etapes.push(x);
      images.push(x);
      temps.push(s + j / liste.length);
    });
  }
  const vide = boucle.transparent, videDevant = devant ? devant.transparent : -1;
  // les étapes, les deux couches superposées (−1 : rien)
  const superposees = etapes.map(({ fond, dessus }) => {
    const t = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const v = dessus ? dessus[i] : videDevant;
      t[i] = v !== videDevant ? v : fond[i] === vide ? -1 : fond[i];
    }
    return t;
  });
  // le pied : à chaque pixel, la valeur que 3 étapes sur 4 au moins y ont, si elle n'est pas le vide
  // (la simple majorité figeait en décor un bout de pièce qui passe là plus d'une fois sur deux). Une
  // valeur qu'ont 3 étapes sur 4 est la majorité : le vote de Boyer et Moore la désigne en un passage,
  // un second la compte.
  const pied = new Int16Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let candidate = -1, voix = 0;
    for (let a = 0; a < N; a++) {
      const v = superposees[a][i];
      if (voix === 0) { candidate = v; voix = 1; } else if (v === candidate) voix++; else voix--;
    }
    let k = 0;
    for (let a = 0; a < N; a++) if (superposees[a][i] === candidate) k++;
    if (k >= 0.75 * N) pied[i] = candidate;
  }
  Object.assign(e, { images, temps, pied, vide, videDevant });
  return e;
}

// La traînée de l'étape d (RGBA, largeur × hauteur de la boucle) pour la palette `couleurs` (256 × 3,
// 8 bits), de clé `cle` : la moyenne des images d'âge a (en étapes, 0 < a ≤ L) pondérée par
// (1 − a / L)^3 ; son opacité, la part pondérée des images qui ont quelque chose à ce pixel, multipliée
// par 2L / 4 (la même force près de la pièce qu'une traînée d'une étape au dégradé linéaire).
// `depuisLeDebut` : juste après un changement de boucle, rien d'avant son début.
// `siPrete` : rien (null) si elle n'est pas calculée et qu'un calcul a déjà eu lieu pour cette image.
function trainee(e, d, couleurs, cle, depuisLeDebut, siPrete = false) {
  if (e.cle !== cle) { e.traineesPar.clear(); e.cle = cle; }
  const k = depuisLeDebut ? -1 - d : d;
  let t = e.traineesPar.get(k);
  if (t) return t;
  if (siPrete && calculFait && animationsIntercalees.unCalculParImage) return null;
  calculFait = true;
  const n = e.largeur * e.hauteur, L = LONGUEUR_DE_TRAINEE, { vide, videDevant } = e;
  const acc = new Float32Array(3 * n), accA = new Float32Array(n);
  let som = 0, prises = 0;
  e.images.forEach(({ fond, dessus }, j) => {
    let age = d - e.temps[j];
    if (!depuisLeDebut) age = ((age % e.N) + e.N) % e.N;
    if (!(age > 0 && age <= L)) return;
    const w = (1 - age / L) ** DEGRADE;
    som += w; prises++;
    // (la couche de devant, là où elle a quelque chose ; sinon le fond)
    for (let i = 0; i < n; i++) {
      let v = dessus ? dessus[i] : videDevant;
      if (v === videDevant && (v = fond[i]) === vide) continue;
      acc[3 * i] += w * couleurs[3 * v]; acc[3 * i + 1] += w * couleurs[3 * v + 1]; acc[3 * i + 2] += w * couleurs[3 * v + 2];
      accA[i] += w;
    }
  });
  t = new Uint8Array(4 * n);
  // (sans intermédiaires, la moyenne de deux étapes ne serait qu'un fantôme : pas de traînée)
  if (prises >= 3 && som > 0) {
    const gain = 2 * L / (DEGRADE + 1);
    for (let i = 0; i < n; i++) {
      if (!accA[i]) continue;
      t[4 * i] = acc[3 * i] / accA[i]; t[4 * i + 1] = acc[3 * i + 1] / accA[i]; t[4 * i + 2] = acc[3 * i + 2] / accA[i];
      t[4 * i + 3] = Math.round(255 * Math.min(1, gain * accA[i] / som));
    }
  }
  e.traineesPar.set(k, t);
  return t;
}

// Ce que les images suivantes demanderont, calculé d'avance par une image qui n'a rien calculé : la
// traînée de l'étape d'après (d, l'étape montrée, de l'état e) ; puis, boucle par boucle, l'état des
// autres boucles de l'attraction et la traînée de leurs deux premières étapes, celles que montre un
// changement de boucle. Un calcul par image au plus. (`uneFois` : la boucle ne se reboucle pas.)
function preparerLaSuite(identifiant, e, d, couleurs, uneFois = false) {
  if (calculFait || !couleurs) return;
  if (e && e.avecIntermediaires) {
    trainee(e, (d + 1) % e.N, couleurs.couleurs, couleurs.cle, uneFois);
    if (calculFait) return;
  }
  for (const { boucle, devant } of bouclesDeLaTrainee.get(identifiant) || []) {
    const x = etatDeTrainee(boucle, devant);
    if (calculFait) return;
    if (!x.avecIntermediaires) continue;
    for (let premiere = 0; premiere < Math.min(2, x.N); premiere++) {
      trainee(x, premiere, couleurs.couleurs, couleurs.cle, true);
      if (calculFait) return;
    }
  }
}

// La palette du VGA (6 bits par composante) en 8 bits, et sa clé ; gardée tant qu'elle ne change pas.
const couleursGardees = { cle: null, couleurs: new Uint8Array(768) };
function couleursDe(palette) {
  let cle = 0;
  for (let i = 0; i < 768; i++) cle = (Math.imul(cle, 31) + palette[i]) | 0;
  if (cle !== couleursGardees.cle) {
    for (let i = 0; i < 768; i++) couleursGardees.couleurs[i] = palette[i] << 2 | palette[i] >> 4;
    couleursGardees.cle = cle;
  }
  return couleursGardees;
}

// Par attraction (l'adresse de son objet) : la boucle montrée, l'étape du jeu où on l'a vue, si elle
// vient d'y entrer (la traînée ne remonte alors pas avant son début), le segment en cours de la phase
// montrée, et les tours de l'anneau des passagers montrés (phaseMontree).
const boucleVue = new Map();
const traineesTampons = [];
// Une attraction qu'on n'a pas retouchée depuis ce temps (hors de la vue, au repos) est reprise comme
// neuve : sa montrée repart de l'image du jeu.
const ABSENCE_US = 250000;

// La phase de l'image montrée, en étapes de la boucle (l'étape montrée est ⌊φ⌋ modulo N), à γ = s + t,
// le temps du jeu dans sa boucle.
//
// Une boucle que le jeu ne joue qu'une fois, de sa première image à sa dernière (!c.cyclique : la
// montée en balancement du départ, le ralenti de l'arrêt), n'est pas jouée deux fois : on y verrait
// l'attraction reprendre son départ au milieu. L'image montrée y est celle du jeu : φ = γ, jamais
// au-delà de sa dernière image. À la dernière, t peut atteindre 1 (le jeu y fige l'arrêt, ou passe à
// la boucle suivante) : l'étape montrée revenait alors à la première de la boucle, que le jeu ne
// remontre pas — la navette, à la fin de l'arrêt, repassait la tête en bas (retour 40).
//
// La boucle de la marche est montrée deux fois plus vite, par SEGMENTS. Un segment part de l'image du
// jeu (φ = γ : pas de saut quand l'attraction entre dans la vue en pleine boucle, ni au départ, où le
// jeu n'en est pas à l'étape 0 ; la montrée, décalée d'autant, s'aligne sur le jeu) et finit là où le
// jeu quitte la boucle ou la recommence (γ = N) avec la montrée revenue à l'étape 0 : les changements
// de boucle et les tours de la marche s'enchaînent sans saut. À l'arrêt en cours (la roue garde la même
// boucle), il finit là où le jeu fige sa dernière image (γ = N − 1), la montrée sur cette même
// dernière étape. Entre les deux, à vitesse constante, le nombre de tours de la montrée qui l'approche
// le plus du double du jeu (à égalité, le plus lent) : exactement ×2 d'un bout à l'autre d'une boucle
// entière ; un peu moins ou un peu plus pour finir une boucle prise en cours. (Le double : c.vitesse,
// VITESSE pour les attractions ; vitesseDesInstallations pour la fontaine, quatre.)
//
// LA MONTÉE EN RÉGIME (retour 40 : la navette « démarre à fond »). Partie du repos — la boucle de la
// marche prise juste après une boucle jouée une fois (le départ du bateau, de la navette, montré tel que
// le jeu le joue), ou la boucle unique d'une attraction qui part (la roue) —, la montrée ne passait pas
// de ×1 à ×2 d'une image à l'autre : la navette, arrivée en haut de son dernier balancement presque à
// l'arrêt, repartait d'un coup à un tour par seconde. Sur les deux premiers tours du jeu, sa vitesse va
// maintenant de ×1 à ×2 en ligne droite, φ = φA + u + κ·u² (u = γ − γA, les deux tours mis bout à bout),
// pour trois tours montrés : la montrée arrive à l'étape 0 quand le jeu recommence sa boucle, et la
// suite est au double. Seulement si le temps du tour qui reste (+0x36) promet ce second tour du jeu ;
// sinon, le double tout de suite.
function phaseMontree(c, vu, s, t, N, us) {
  const gamma = s + t;
  if (!c.cyclique) { vu.segment = null; vu.tours = c.tours; return Math.min(gamma, N - 1e-6); }
  const absence = us - vu.us > ABSENCE_US;
  let a = vu.segment;
  // (la montée court sur deux tours du jeu : quand il recommence sa boucle, γ continue)
  if (a && a.montee && !absence && a.boucle === vu.boucle && !c.arret && a.tour === 0 && gamma < vu.gamma - 0.5) a.tour = 1;
  const g = a && a.montee ? gamma + N * a.tour : gamma;
  if (!a || absence || g < vu.g - 0.5 || a.boucle !== vu.boucle || a.arret !== c.arret) {
    // (les tours des passagers montrés : ceux du jeu quand la montrée repart de son image ; sinon, ceux
    // du segment fini, plus les tours qu'il a montrés)
    if (a && !absence && a.boucle && vu.phi !== undefined && a.arret === false) {
      vu.tours = a.tours + Math.floor(vu.phi / N) + 1 - Math.floor(a.phiA / N);
    } else if (!a || absence) vu.tours = c.tours;
    if (vu.demarrage && !c.arret && gamma < 1 && c.restant > (N - gamma + 1) * c.pasParImage) {
      const U = 2 * N - gamma;
      a = vu.segment = { boucle: vu.boucle, arret: false, montee: true, tour: 0, gammaA: gamma, phiA: gamma,
        gammaT: 2 * N, phiT: 3 * N, kappa: (3 * N - gamma - U) / (U * U), tours: vu.tours };
    } else {
      const gammaT = c.arret ? N - 1 : N, base = c.arret ? N - 0.5 : 0;
      const duree = Math.max(1e-6, gammaT - gamma);
      let phiT = base + N, ecart = Infinity;
      for (let j = 0; j < 4 * (c.vitesse || VITESSE); j++) {
        const candidat = base + N * j;
        if (candidat <= gamma) continue;
        const e = Math.abs((candidat - gamma) / duree - (c.vitesse || VITESSE));
        if (e < ecart - 1e-9) { ecart = e; phiT = candidat; }
      }
      a = vu.segment = { boucle: vu.boucle, arret: c.arret, gammaA: gamma, phiA: gamma, gammaT, phiT, tours: vu.tours };
    }
  }
  vu.demarrage = false;
  if (a.montee) {
    const u = Math.min(gamma + N * a.tour, a.gammaT) - a.gammaA;
    vu.g = gamma + N * a.tour;
    return a.phiA + u + a.kappa * u * u;
  }
  vu.g = gamma;
  const k = Math.min(1, Math.max(0, (gamma - a.gammaA) / Math.max(1e-6, a.gammaT - a.gammaA)));
  return a.phiA + k * (a.phiT - a.phiA);
}

// Retoucher l'image montrée pour le relevé c (n-ième) : l'étape montrée dans `tampon` (qui contient le
// « avant »), posée sur l'écran là où il a encore la couleur du « après », et la traînée (RGBA,
// r.l × r.h, null si aucune) là où l'écran montre le décor ou le pied. Rend { changes, trainee }, ou
// null si un morceau n'a pu être tracé.
function appliquerDouble(m8, dv, c, t, tampon, pixels, l, n, couleurs, us) {
  const { boucle, devant, s } = c.cuite, { r } = c;
  const N = boucle.objets.length;
  let vu = boucleVue.get(c.objet);
  // (`demarrage` : l'attraction part du repos, phaseMontree y fait la montée en régime ; `cyclique`
  // et `depart`, ceux de la dernière image vue)
  if (!vu) {
    vu = { boucle, s, nouvelle: true, us: -Infinity, gamma: 0, cyclique: c.cyclique, depart: false };
    boucleVue.set(c.objet, vu);
  } else if (vu.boucle !== boucle) {
    vu.demarrage = !vu.cyclique;
    vu.boucle = boucle; vu.s = s; vu.nouvelle = true;
  } else if (vu.s !== s) { vu.s = s; vu.nouvelle = false; }
  if (c.depart && !vu.depart) vu.demarrage = true;
  vu.depart = c.depart; vu.cyclique = c.cyclique;
  const phi = phaseMontree(c, vu, s, t, N, us);
  vu.us = us; vu.gamma = s + t; vu.phi = phi;
  const d = ((Math.floor(phi) % N) + N) % N;
  // (les tours des passagers : ceux du segment, plus ceux que la montrée y a faits)
  const tours = vu.segment ? vu.segment.tours + Math.floor(phi / N) - Math.floor(vu.segment.phiA / N) : c.tours;
  c.montree = { d, g: boucle.objets[d] };        // (pour les essais)
  if (!tracerLEtape(m8, dv, c, boucle.objets[d], tours, tampon)) return null;
  let e = null, tr = null, gauche = 0, haut = 0;
  if (couleurs) {
    e = etatsDeTrainee.get(boucle) || (calculFait && animationsIntercalees.unCalculParImage ? null : etatDeTrainee(boucle, devant));
    // (une boucle jouée une seule fois ne se reboucle pas : sa traînée ne remonte jamais avant son
    // début, où ses images intermédiaires mènent de la dernière étape à la première — à l'étape 0 du
    // départ de la navette, un fantôme de la navette la tête en haut)
    if (e && e.avecIntermediaires) tr = trainee(e, d, couleurs.couleurs, couleurs.cle, vu.nouvelle || !c.cyclique, true);
    const vers = (v) => (c.basse ? v >> 1 : v);
    gauche = vers(c.x) - boucle.ancrage.x; haut = vers(c.y) - boucle.ancrage.y;
  }
  let patch = null;
  if (tr) {
    if (!traineesTampons[n] || traineesTampons[n].length < 4 * r.l * r.h) traineesTampons[n] = new Uint8Array(4 * r.l * r.h);
    patch = traineesTampons[n].subarray(0, 4 * r.l * r.h);
    patch.fill(0);
  }
  let changes = 0, touchee = false;
  for (let y = 0; y < r.h; y++) {
    const o0 = (r.y + y) * l + r.x, q0 = y * r.l, v = r.y + y - haut;
    for (let x = 0; x < r.l; x++) {
      const o = o0 + x, q = q0 + x;
      const montre = pixels[o] === c.apres[q] || pixels[o] === tampon[q];
      if (pixels[o] === c.apres[q] && pixels[o] !== tampon[q]) { pixels[o] = tampon[q]; changes++; }
      if (!patch || !montre) continue;
      const u = r.x + x - gauche;
      if (u < 0 || v < 0 || u >= e.largeur || v >= e.hauteur) continue;
      const i = v * e.largeur + u;
      const a = tr[4 * i + 3];
      if (!a) continue;
      // la pièce qui bouge et les passagers restent nets, par-dessus la traînée
      if (tampon[q] !== c.avant[q] && tampon[q] !== e.pied[i]) continue;
      patch.set(tr.subarray(4 * i, 4 * i + 4), 4 * q);
      touchee = true;
    }
  }
  preparerLaSuite(boucle.identifiant, e, d, couleurs, !c.cyclique);
  return { changes, trainee: touchee ? patch : null };
}

// L'intervalle moyen entre deux publications, en µs virtuelles (leur heure, publication.us).
let vue = { numero: -1, us: 0 };
let intervalle = 1e6 / 30;
// L'horloge des pas de simulation (0xD3AFC) : le dernier pas connu (son compte, l'heure virtuelle de
// sa publication), la durée d'un pas mesurée entre les deux derniers pas connus (µs virtuelles), et
// le temps montré, en pas, qui ne recule jamais. Aux vitesses lentes, le jeu ne fait un pas que
// toutes les |vitesse| images : les publications n'avancent pas toutes, et c'est cette horloge, pas
// l'écart entre les deux dernières publications, qui dit où en est le jeu entre deux pas.
const horloge = { pas: -1, a: 0, duree: 1e6 / 30, montre: -Infinity };
const PAUSE_US = 250000;           // deux pas plus espacés : une pause, un écran ; la durée reste
const tampons = [];
// Les retouches de la dernière image : pour chaque relevé posé, son rectangle r, l'étape montrée
// (r.l × r.h), le « après » et la traînée ; la page les repose elle-même quand elle compose son image
// (défilement fluide, zoom : moteur/web/retouches.js).
let retouches = [];
export const dernieresRetouches = () => retouches;

// Retoucher l'image montrée : `pixels` (l × h, indices de couleur) est la copie de l'écran que la
// page va montrer ; `us` l'heure virtuelle ; `palette`, celle du VGA (6 bits par composante), pour la
// traînée (sans elle, le ×2 seul). Rend le nombre de pixels changés.
export function appliquer(m8, dv, pixels, l, h, us, palette = null) {
  retouches = [];
  calculFait = false;
  if (!reglages.animationsIntercalees) return 0;
  const p = publication;
  if (p.numero !== vue.numero) {
    if (vue.numero >= 0 && p.numero === vue.numero + 1) {
      const ecart = p.us - vue.us;
      if (ecart > 0 && ecart < 5e5) intervalle = 0.8 * intervalle + 0.2 * ecart;
    }
    vue = { numero: p.numero, us: p.us };
    // un pas de plus (ou plusieurs) : l'ancre de l'horloge passe au nouveau pas, la durée d'un pas est
    // l'écart depuis le précédent, sauf après une pause ; un compte qui recule ou bondit (une partie
    // chargée) repart de zéro
    const n = p.pas - horloge.pas;
    if (horloge.pas < 0 || n < 0 || n > 1000) Object.assign(horloge, { pas: p.pas, a: p.us, montre: -Infinity });
    else if (n > 0) {
      const d = (p.us - horloge.a) / n;
      if (d > 0 && d < PAUSE_US) horloge.duree = d;
      horloge.pas = p.pas; horloge.a = p.us;
    }
  }
  if (!p.releves.length || p.largeur !== l || mot(dv, ECRAN_COURANT) !== 0) return 0;
  // Le temps montré, en pas. L'image publiée à p.us n'est présentée qu'à l'image suivante du jeu : on
  // montre à l'heure `us` le temps du jeu une image plus tôt, prolongé depuis le dernier pas connu à la
  // durée d'un pas ; jamais au-delà de ce que la prochaine publication peut apporter (le pas suivant,
  // ou les pas d'une image aux vitesses rapides), jamais en arrière (les deux présentations d'une image
  // et la publication du défilement fluide, à des heures qui se croisent, restent dans l'ordre).
  const parImage = Math.max(1, intervalle / horloge.duree);
  const vise = Math.min(horloge.pas + (us - intervalle - horloge.a) / horloge.duree, p.pas + parImage - 0.01);
  if (!(horloge.montre >= vise)) horloge.montre = vise;         // (comme Math.max, mais sans garder un NaN)
  const avance = horloge.montre - p.pas;       // en pas depuis l'image publiée (négatif : en deçà)
  const couleurs = palette ? couleursDe(palette) : null;
  let changes = 0;
  p.releves.forEach((c, n) => {
    const t = Math.max(0, Math.min(1, c.f + avance / c.pasParImage));
    if (animationsIntercalees.suivi) animationsIntercalees.suivi(c, t, us, p, avance, horloge.duree / 1000, intervalle);
    const { r } = c;
    if (r.y + r.h > h) return;
    if (!tampons[n] || tampons[n].length < r.l * r.h) tampons[n] = new Uint8Array(r.l * r.h);
    const tampon = tampons[n].subarray(0, r.l * r.h);
    tampon.set(c.avant);
    const res = appliquerDouble(m8, dv, c, t, tampon, pixels, l, n, couleurs, us);
    if (!res) return;
    retouches.push({ c, r, pose: tampon, apres: c.apres, trainee: res.trainee });
    changes += res.changes;
  });
  if (changes) { animationsIntercalees.compteurs.appliquees++; animationsIntercalees.compteurs.pixels += changes; }
  return changes;
}

export const publicationCourante = () => publication;

// Contrôle (essais sous Node) du tracé des étapes : l'image courante G, tracée par tracerLEtape pour
// les tours achevés du jeu sur le « avant », doit redonner le « après » du jeu ; et l'anneau refait
// (places qui tournent) doit mettre aux places les passagers que le jeu y a tracés. Rend, pour chaque
// relevé publié, [pixels qui diffèrent, passagers tracés par le jeu, places où l'anneau refait diffère].
export function controlerLesEtapesDoubles(m8, dv) {
  return publication.releves.map((c) => {
    const t = Uint8Array.from(c.avant);
    tracerLEtape(m8, dv, c, c.g0, c.tours, t);
    let e = 0;
    for (let k = 0; k < t.length; k++) if (t[k] !== c.apres[k]) e++;
    const jeu = passagersDansLOrdre(c);
    let anneau = 0;
    if (c.tournantes) passagersTournants(c, c.tours, jeu.length).forEach((p, k) => { if (p !== jeu[k]) anneau++; });
    return [e, jeu.filter((p) => p).length, anneau];
  });
}

// Essais : les passagers d'un relevé place par place, tels que le jeu les a tracés (tours null) ou
// tels que l'anneau refait les placerait après `tours` boucles achevées ; et l'étape s de sa boucle
// tracée seule sur son « avant », pour `tours` boucles.
export function passagersPourEssai(c, tours) {
  if (tours === null || !c.tournantes) return passagersDansLOrdre(c);
  return passagersTournants(c, tours, passagersDansLOrdre(c).length);
}
export function etapeMontreePourEssai(m8, dv, c, s, tours) {
  const t = Uint8Array.from(c.avant);
  tracerLEtape(m8, dv, c, c.cuite.boucle.objets[s], tours, t);
  return t;
}
