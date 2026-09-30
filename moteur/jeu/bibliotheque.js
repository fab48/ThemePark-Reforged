// Les routines de bas niveau que tout le jeu appelle : segments, nombres, texte formaté.
//
// Deux familles sans rapport l'une avec l'autre, réunies ici parce qu'elles sont, les unes comme
// les autres, le socle sur lequel tout le reste s'appuie — des dizaines de milliers d'appels par
// partie.
//
// LE TRACÉ DE SEGMENTS, écrit pour le jeu (0x81374, 0x8148C, 0x949BC, 0x949DA). Des routines en
// assembleur qui posent une ligne de pixels dans la surface de dessin [0xDE5BC], après l'avoir
// coupée aux bords de la fenêtre. Le jeu double toutes ses routines de dessin, une pour chaque
// mode : 0x81374 en basse résolution (320x200), 0x8148C en haute (640x480) ; 0x949BC est l'entrée
// basse résolution du tracé quelconque, et 0x949DA, qui partage tout le corps, son entrée haute
// résolution.
//
// LA BIBLIOTHÈQUE C DE WATCOM (0x883DF, 0x885FF, 0x888E1, 0x8875B, 0x8FB4F, 0x8FB97, et, en attente,
// 0x88784, 0x887AB, 0x888CA, 0x88D1A, 0x8FBF8, 0x8FC40). Le moteur de `printf`, tel quel dans le
// programme de 1994 : le jeu l'atteint par `sprintf` (0x7F652), qui compose presque tous les textes
// affichés — les sommes d'argent du panneau, les noms des attractions, les enseignes des kiosques,
// les écrans de gestion. Les noms d'origine de Watcom sont `__prtf` (0x883DF), `__ptfmt` (0x888E1),
// `ltoa` (0x8FB97), `ultoa` (0x8FB4F), `itoa` (0x8FC40) et `utoa` (0x8FBF8). Les formats du jeu
// n'emploient que %d, %s, %c et leurs largeurs : les aides des autres conversions sont réécrites
// mais en attente (aucune partie ne les appelle ; le banc bibliotheque-c.mjs les éprouve).
//
// Voir docs/guide-reecriture.md ; docs/retro-ingenierie.md § 6.5 pour la fenêtre de dessin.

import { ecran } from './grande-vue.js';

const SURFACE = 0xDE5BC;          // pointeur vers la surface de dessin
const PAS_LIGNE = 0xDE5B8;        // octets d'une ligne de la surface : 320 ou 640
const FENETRE_GAUCHE = 0xDE5D0;
const FENETRE_HAUT = 0xDE5E0;
const FENETRE_LARGEUR = 0xDE5C8;
const FENETRE_HAUTEUR = 0xDE5F0;
const FENETRE_DROITE = 0xDE5EC;   // gauche + largeur, calculé par 0x87790
const FENETRE_BAS = 0xDE5D8;      // haut + hauteur, calculé par 0x87790
const TABLE_FUSION = 0xBA2F8;     // pointeur vers la table de fusion, 256 lignes de 256 octets

const LARGEUR_BASSE = 320;

const s16 = (v) => (v << 16) >> 16;

// 'loop' décrémente ecx avant de le tester : sur un compte nul, la boucle ferait 2^32 tours.
// Aucun appel connu ne le fait ; on garde le comportement d'origine.
const toursDeLoop = (n) => (n === 0 ? 2 ** 32 : n);

// Division entière signée comme 'idiv' : troncature vers zéro. L'original divise un produit de
// 32 bits par un diviseur de 16 et range le quotient dans un registre de 16 bits : un quotient qui
// n'y tient pas fait sauter le processeur d'origine ; ici il est simplement tronqué.
const divi = (produit, diviseur) => s16((produit / diviseur) | 0);

// ================================================================================================
// 1. Les segments horizontaux et verticaux — 0x81374 (basse résolution), 0x8148C (haute)
// ================================================================================================
//
// tracerSegment(x1, y1, x2, y2, couleur, drapeaux) : six mots empilés, que la routine modifie sur
// place en les coupant à la fenêtre. Les coordonnées sont dans l'espace logique de 640 de large
// (comme pour le traceur de sprites, § 6.5) : la version basse résolution les divise par deux pour
// écrire dans sa surface de 320, la version haute les prend telles quelles.
//
// La découpe compare les coordonnées aux bords de la fenêtre ramenés au même espace : la version
// basse les double ([0xDE5D0] et [0xDE5EC] valent 0 et 320), la version haute les lit tels quels
// (0 et 640). Elle tient pour acquis que la première extrémité est la plus petite : x1 (et y1)
// seul est comparé au bord de fin, x2 (et y2) seul au bord de début. Un segment donné à l'envers
// serait donc mal coupé ; aucun appelant ne le fait.
//
// Le segment est horizontal si x1 et x2 diffèrent après la découpe, vertical sinon ; le nombre de
// pixels est la différence des extrémités (divisée par deux en basse résolution), sans le « + 1 »
// habituel : le dernier pixel n'est pas posé. Le drapeau 4 fusionne chaque pixel avec le fond par
// la table de 64 Ko [0xBA2F8], la même que le traceur de sprites emploie pour les ombres.
//
// Les six appelants (0x37E6D, 0x3DE18, 0x3E149, 0x3E34E, 0x3E705, 0x508A3) choisissent la version
// par `[0xDE5F6] & 1` : ce sont les cadres et les séparateurs des fenêtres et des écrans.
//
// CE QUE LES SCÉNARIOS VÉRIFIENT : le tracé horizontal et le tracé vertical, dans les deux modes,
// toujours sans drapeau ; triche.json et travaux.json y ajoutent les découpes à droite et en bas
// et le rejet d'un segment qui commence sous la fenêtre. Ne sont vérifiés par aucun scénario : la
// fusion (drapeau 4), les découpes en haut et à gauche, les autres rejets.
function tracerSegment(jeu, x1, y1, x2, y2, couleur, drapeaux, basse) {
  const { m8, dv } = jeu;
  // Les bords, en mots de 16 bits ; la version basse résolution les double.
  const d = basse ? 1 : 0;
  const gauche = s16(dv.getUint16(FENETRE_GAUCHE, true) << d);
  const droite = s16(dv.getUint16(FENETRE_DROITE, true) << d);
  const haut = s16(dv.getUint16(FENETRE_HAUT, true) << d);
  const bas = s16(dv.getUint16(FENETRE_BAS, true) << d);

  x1 = s16(x1); y1 = s16(y1); x2 = s16(x2); y2 = s16(y2);
  if (x1 < gauche) x1 = gauche;
  if (x2 < gauche) return;
  if (x1 >= droite) return;
  if (x2 >= droite) x2 = droite;
  if (y1 < haut) y1 = haut;
  if (y2 < haut) return;
  if (y1 >= bas) return;
  if (y2 >= bas) y2 = bas;

  // En grande vue (grande-vue.js), le pas de la surface est la largeur de l'écran : 640 d'origine.
  const pas = basse ? LARGEUR_BASSE : ecran.largeur;
  const u = (v) => v & 0xFFFF;                       // movzx : les coordonnées coupées sont positives
  let dest = dv.getUint32(SURFACE, true)
    + (basse ? u(x1) >>> 1 : u(x1))
    + Math.imul(basse ? u(y1) >>> 1 : u(y1), pas);

  // La couleur est lue en mot ; la fusion s'en sert comme index bas dans la table, l'octet du fond
  // servant d'index haut : table[fond * 256 + couleur].
  const couleurBasse = couleur & 0xFF;
  const fusion = (drapeaux & 4) !== 0;
  const table = fusion ? dv.getUint32(TABLE_FUSION, true) : 0;

  const horizontal = u(x2 - x1) !== 0;
  let n = horizontal ? u(x2 - x1) : u(y2 - y1);
  if (basse) n >>>= 1;
  const avance = horizontal ? 1 : pas;

  if (fusion) {
    for (let k = toursDeLoop(n); k > 0; k--) {
      m8[dest] = m8[table + m8[dest] * 256 + couleurBasse];
      dest += avance;
    }
  } else if (horizontal) {
    m8.fill(couleurBasse, dest, dest + n);           // 'rep stosb' : un compte nul ne fait rien
  } else {
    for (let k = toursDeLoop(n); k > 0; k--) { m8[dest] = couleurBasse; dest += pas; }
  }
}

// ================================================================================================
// 2. Le tracé d'un segment quelconque — 0x949BC
// ================================================================================================
//
// tracerLigne(x1, y1, x2, y2, couleur) : cinq mots empilés, modifiés sur place. 0x949BC est
// l'entrée basse résolution, qui divise d'abord les quatre coordonnées par deux (décalage
// arithmétique : une coordonnée négative est arrondie vers le bas) ; 0x949DA, l'entrée haute
// résolution, entre juste après et partage tout le reste. Contrairement aux segments droits
// ci-dessus, les bords de la fenêtre sont ici pris tels quels : après division, une coordonnée est
// bien dans l'espace de la surface.
//
// LA DÉCOUPE se fait en deux temps, d'abord sur y, puis sur x, en déplaçant l'extrémité fautive le
// long du segment (une division entière par extrémité coupée, d'où les quatre `idiv`). Elle
// commence par ordonner les deux bouts sur y (y1 <= y2), quitte à les échanger. Un segment
// entièrement au-dessus, en dessous, à gauche ou à droite est abandonné. Un segment horizontal
// (y1 == y2) part aussitôt par un chemin à part, qui coupe lui-même sur x et remplit d'un
// `rep stosb` ; un segment vertical (x1 == x2 une fois x coupé) a lui aussi son chemin.
//
// LE TRACÉ est un Bresenham classique sur l'axe le plus long : `erreur` part de 2·mineur − majeur,
// avance de 2·mineur quand elle est négative, de 2·(mineur − majeur) sinon, et le pas mineur n'est
// ajouté que dans ce second cas. `majeur + 1` pixels sont posés.
//
// ANOMALIE, reproduite : la comparaison des deux longueurs (`cmp cx, ax ; jbe`) et plusieurs
// comparaisons du chemin horizontal sont NON SIGNÉES alors que les valeurs comparées sont des
// mots signés. Tant que la découpe a ramené les coordonnées dans la fenêtre, les différences sont
// positives et cela ne se voit pas.
//
// Les six appelants (0x3CC79, 0x47E39, 0x50651, 0x5877B, 0x6BF89, 0x79A04) tracent des traits de
// séparation et les courbes des graphiques.
//
// CE QUE LES SCÉNARIOS VÉRIFIENT, toujours en basse résolution : construction.json et
// gestion.json — les courbes des graphiques — donnent le chemin horizontal, le chemin vertical,
// l'oblique dans les deux sens (donc l'échange des deux bouts quand y1 > y2) et les deux axes
// majeurs, sur des segments entièrement dans la fenêtre ; menus.json, triche.json et travaux.json
// donnent le chemin horizontal direct coupé à droite (le trait de 0 à 640 de 0x50651) ;
// catalogues.json et entrepot.json, l'entrée haute résolution 0x949DA. Ne sont
// vérifiés par aucun scénario : les découpes des obliques et
// les rejets — c'est-à-dire tous les `idiv` — et la boucle de 2^32 tours d'un segment vertical
// de longueur -1.
function tracerLigne(jeu, x1, y1, x2, y2, couleur, basse) {
  const { m8, dv } = jeu;
  if (basse) { x1 = s16(x1) >> 1; y1 = s16(y1) >> 1; x2 = s16(x2) >> 1; y2 = s16(y2) >> 1; }
  else { x1 = s16(x1); y1 = s16(y1); x2 = s16(x2); y2 = s16(y2); }

  const pas = dv.getInt32(PAS_LIGNE, true);
  // Le coin haut-gauche de la fenêtre dans la surface ; ses deux appelants la posent à l'origine.
  const base = (Math.imul(dv.getInt32(FENETRE_HAUT, true), pas)
    + dv.getInt32(FENETRE_GAUCHE, true) + dv.getUint32(SURFACE, true)) | 0;
  const largeur = dv.getInt16(FENETRE_LARGEUR, true);
  const hauteur = dv.getInt16(FENETRE_HAUTEUR, true);
  const c = couleur & 0xFF;

  // Le remplissage horizontal commun aux deux chemins directs (0x94D84) : `debut` et `compte` sont
  // des mots non signés, et le compte est augmenté de un — le dernier pixel est posé.
  const remplirLigne = (debut, compte, ligne) => {
    const p = (debut & 0xFFFF) + Math.imul(ligne & 0xFFFF, pas) + base;
    m8.fill(c, p, p + ((compte + 1) & 0xFFFF));
  };

  // --- la découpe verticale -------------------------------------------------------------------
  // Couper l'extrémité basse sur le bord bas de la fenêtre (0x94A4B).
  const couperEnBas = () => {
    x2 = s16(divi(Math.imul(s16(x2 - x1), s16(hauteur - y1)), s16(y2 - y1)) + x1);
    y2 = s16(hauteur - 1);
  };
  for (;;) {
    if (y1 < 0) {
      if (y2 < 0) return;                            // tout au-dessus de la fenêtre
      x1 = s16(x1 + divi(Math.imul(s16(x2 - x1), s16(-y1)), s16(y2 - y1)));
      y1 = 0;
      if (y2 >= hauteur) couperEnBas();
      break;
    }
    if (y2 < 0) {                                    // échanger les bouts et reprendre
      const t = x1; x1 = x2; x2 = t;
      const v = y1; y1 = y2; y2 = v;
      continue;
    }
    if (y1 === y2) { ligneHorizontale(); return; }
    if (y1 < y2) {
      if (y1 >= hauteur) return;                     // tout en dessous de la fenêtre
      if (y2 >= hauteur) couperEnBas();
    } else {
      if (y2 >= hauteur) return;
      const t = x1; x1 = x2; x2 = t;
      const v = y1; y1 = y2; y2 = v;
      if (y2 >= hauteur) couperEnBas();
    }
    break;
  }

  // --- la découpe horizontale -----------------------------------------------------------------
  // `pasX` retient de quel côté le segment va : +1 vers la droite, −1 vers la gauche.
  let pasX;
  if (x1 < 0) {
    if (x2 < 0) return;
    pasX = 1;
    y1 = s16(y1 + divi(Math.imul(s16(y2 - y1), s16(-x1)), s16(x2 - x1)));
    x1 = 0;
    if (x2 >= largeur) {                             // les deux bouts dehors : couper aussi à droite
      y2 = s16(divi(Math.imul(s16(y2 - y1), s16(largeur - x1)), x2) + y1);
      x2 = s16(largeur - 1);
    }
  } else if (x1 >= largeur) {
    if (x2 >= largeur) return;
    pasX = -1;
    y1 = s16(y1 + divi(Math.imul(s16(y2 - y1), s16(x1 - largeur)), s16(x1 - x2)));
    x1 = s16(largeur - 1);
    if (x2 < 0) {
      y2 = s16(y2 - divi(Math.imul(s16(y2 - y1), s16(-x2)), s16(s16(-x2) + x1)));
      x2 = 0;
    }
  } else if (x2 < 0) {
    pasX = -1;
    y2 = s16(divi(Math.imul(s16(y2 - y1), x1), s16(x1 - x2)) + y1);
    x2 = 0;
  } else if (x2 >= largeur) {
    pasX = 1;
    y2 = s16(divi(Math.imul(s16(y2 - y1), s16(largeur - x1)), s16(x2 - x1)) + y1);
    x2 = s16(largeur - 1);
  } else {
    pasX = 1;
    if (x1 === x2) { ligneVerticale(); return; }
    if (x1 > x2) pasX = -1;
  }

  // --- le tracé -------------------------------------------------------------------------------
  let point = (x1 & 0xFFFF) + Math.imul(y1 & 0xFFFF, pas) + base;
  const dx = s16(Math.imul(s16(x2 - x1), pasX));     // 'imul ax, si' : produit de 16 bits
  const dy = s16(y2 - y1);
  if (dy === 0) {                                    // horizontal après découpe
    const a = x1 & 0xFFFF, b = x2 & 0xFFFF;
    if (b >= a) remplirLigne(a, (b - a) & 0xFFFF, y1);
    else remplirLigne(b, (a - b) & 0xFFFF, y1);
    return;
  }
  let majeur, mineur, pasMajeur, pasMineur;
  if ((dy & 0xFFFF) > (dx & 0xFFFF)) {               // comparaison non signée, comme l'original
    majeur = dy; mineur = dx; pasMajeur = pas; pasMineur = pasX;
  } else {
    majeur = dx; mineur = dy; pasMajeur = pasX; pasMineur = pas;
  }
  let compte = majeur & 0xFFFF;
  const deuxMineur = s16(mineur + mineur);
  let erreur = s16(deuxMineur - majeur);
  const retour = s16(s16(mineur - majeur) * 2);
  m8[point] = c;
  do {
    point += pasMajeur;
    if (erreur < 0) erreur = s16(erreur + deuxMineur);
    else { point += pasMineur; erreur = s16(erreur + retour); }
    m8[point] = c;
    compte = (compte - 1) & 0xFFFF;
  } while (compte !== 0);
  return;

  // Le chemin du segment horizontal pris avant la découpe sur x (0x94D16) : il coupe lui-même,
  // avec un mélange de comparaisons signées (les bornes) et non signées (les longueurs).
  function ligneHorizontale() {
    if (y1 >= hauteur) return;
    let a = x1 & 0xFFFF, b = x2 & 0xFFFF;
    if (b < a) { const t = a; a = b; b = t; }        // non signé
    const maxi = s16(largeur - 1);
    if (s16(a) < 0) {
      if (s16(b) <= 0) return;
      a = 0;
      if (b > (maxi & 0xFFFF)) b = maxi & 0xFFFF;
    } else {
      if (s16(a) > maxi) return;
      if (b > (maxi & 0xFFFF)) b = maxi & 0xFFFF;
    }
    remplirLigne(a, (b - a) & 0xFFFF, y1);
  }

  // Le chemin du segment vertical (0x94DA4), atteint quand x1 == x2 après la découpe.
  function ligneVerticale() {
    const a = y1 & 0xFFFF, b = y2 & 0xFFFF;
    const haut = b >= a ? a : b;
    const n = (b >= a ? b - a : a - b) & 0xFFFF;
    let p = (x1 & 0xFFFF) + Math.imul(haut, pas) + base;
    for (let k = toursDeLoop((n + 1) & 0xFFFF); k > 0; k--) { m8[p] = c; p += pas; }
  }
}

// ================================================================================================
// 3. Les nombres en texte — 0x8FB4F (ultoa), 0x8FB97 (ltoa), et les aides de printf
// ================================================================================================
//
// La table des chiffres de Watcom, "0123456789abcdefghijklmnopqrstuvwxyz", dans le segment de code.
// Le programme en porte deux exemplaires identiques, un par module objet : celui-ci sert à ultoa,
// celui de 0x8FBD3 à utoa (0x8FBF8).
const CHIFFRES = 0x8FB2A, CHIFFRES_UTOA = 0x8FBD3;

// 0x8FB4F — ultoa(valeur, tampon, base) : la valeur, prise comme un entier non signé de 32 bits,
// écrite en `base` dans `tampon`, terminée par un zéro ; rend `tampon`.
//
// L'original produit les chiffres à l'envers dans sa propre pile (40 octets sous son cadre, de quoi
// tenir les 32 chiffres d'une base 2 et leur zéro final), puis les recopie à l'endroit ; la
// réécriture s'en tient à un tableau JavaScript, ce que le comparateur ne voit pas — ces octets
// sont sous le pointeur de pile, en mémoire morte. Une valeur nulle donne bien « 0 » : la boucle de
// division s'exécute au moins une fois.
function ultoa(jeu, valeur, tampon, base, table = CHIFFRES) {
  const m8 = jeu.m8;
  let reste = valeur >>> 0;
  const b = base >>> 0;
  const chiffres = [];
  do {
    chiffres.push(m8[table + reste % b]);
    reste = (reste / b) >>> 0;
  } while (reste !== 0);
  let p = tampon;
  for (let k = chiffres.length - 1; k >= 0; k--) m8[p++] = chiffres[k];
  m8[p] = 0;
  return tampon;
}

// 0x8FB97 — ltoa(valeur, tampon, base) : comme ultoa, mais en base dix une valeur négative reçoit
// un « - » et est négociée en positif. Rend `tampon`.
//
// Anomalie de Watcom, reproduite : `neg` sur -2147483648 rend -2147483648, qu'ultoa écrit ensuite
// comme le nombre non signé 2147483648 — « -2147483648 » est donc juste, par accident.
function ltoa(jeu, valeur, tampon, base, enTexte = ultoa) {
  let v = valeur | 0;
  let p = tampon;
  if (base === 10 && v < 0) { v = -v | 0; jeu.m8[tampon] = 0x2D; p = tampon + 1; }
  enTexte(jeu, v, p, base);
  return tampon;
}

// 0x8FBF8 — utoa(valeur, tampon, base) et 0x8FC40 — itoa(valeur, tampon, base) : ultoa et ltoa d'un
// autre module objet, à l'identique (un int et un long ont 32 bits), utoa avec son exemplaire de la
// table des chiffres. printf les appelle pour %u, %x, %X, pour %o, et pour %d et %i avec un
// modificateur de taille ('h', 'l').
const utoa = (jeu, valeur, tampon, base) => ultoa(jeu, valeur, tampon, base, CHIFFRES_UTOA);
const itoa = (jeu, valeur, tampon, base) => ltoa(jeu, valeur, tampon, base, utoa);

// 0x8875B — strnlen lointain : (pointeur, segment, maximum) → le nombre d'octets avant le zéro
// final, au plus `maximum`. Le segment est ignoré : le modèle mémoire est plat, toutes les bases
// valent zéro. Avec maximum = -1, c'est un strlen ordinaire, la comparaison `eax == ecx` ne
// pouvant se produire qu'au bout de quatre milliards de caractères.
function longueurBornee(jeu, pointeur, segment, maximum) {
  const m8 = jeu.m8;
  const max = maximum | 0;
  let n = 0, p = pointeur;
  while (m8[p] !== 0 && n !== max) { n++; p++; }
  return n;
}

// 0x88784 — la même, pour une chaîne de caractères larges (16 bits), que printf mesure pour %ls.
function longueurBorneeLarge(jeu, pointeur, segment, maximum) {
  const max = maximum | 0;
  let n = 0, p = pointeur >>> 0;
  while (jeu.dv.getUint16(p, true) !== 0 && n !== max) { n++; p += 2; }
  return n;
}

// 0x887AB — `n` chiffres hexadécimaux (valeur, tampon, n), pour %p : la valeur en base seize
// (0x8FB97), cadrée à droite sur n caractères et complétée de zéros à gauche, puis terminée. Les
// chiffres sont recopiés de la fin vers le début ; une valeur plus longue que n déborderait avant le
// tampon — %p ne demande que 4 ou 8 chiffres. Rend ce qui reste du compte (-1 d'ordinaire).
function hexaCadre(jeu, valeur, tampon, n) {
  const m8 = jeu.m8;
  ltoa(jeu, valeur, tampon, 16);
  let longueur = 0;
  while (m8[(tampon + longueur) >>> 0] !== 0) longueur++;
  let reste = (n - 1) | 0;
  let source = (tampon + longueur) | 0, destination = (tampon + reste) | 0;
  while (source !== (tampon | 0)) {
    source--;
    reste--;
    m8[destination >>> 0] = m8[source >>> 0];
    destination--;
  }
  for (let p = (tampon + reste) | 0; reste >= 0; p--) {
    reste--;
    m8[p >>> 0] = 0x30;
  }
  m8[(tampon + n) >>> 0] = 0;
  return reste;
}

// 0x88D1A — mettre une chaîne en majuscules (toupper, 0x7E1D8, ASCII seulement), pour %X et %P.
function enMajuscules(jeu, chaine) {
  const m8 = jeu.m8;
  for (let p = chaine >>> 0; m8[p] !== 0; p++) {
    const c = m8[p];
    if (c >= 0x61 && c <= 0x7A) m8[p] = c - 0x20;
  }
}

// 0x888CA — la conversion d'un flottant pour %e, %f et %g (écriture, arguments, specs) : confiée au
// crochet [0xC57F8], que la bibliothèque fait pointer vers le code des flottants quand le programme
// en a besoin. Theme Park n'en a pas : le crochet mène à l'erreur « Floating-point support not
// loaded » (0x8FBC7, demarrage.js), qui met fin au programme. L'appelant lit le corps dans eax et
// son segment dans edx.
const CROCHET_DES_FLOTTANTS = 0xC57F8;
function convertirUnFlottant(jeu, ecriture, argptr, specs) {
  const entree = jeu.T.R.esp >>> 0;
  const crochet = jeu.dv.getUint32(CROCHET_DES_FLOTTANTS, true);
  return jeu.appelerDepuis(0x888DC, entree - 4, crochet, ecriture, argptr, specs);
}

// ================================================================================================
// 4. Le moteur de printf — 0x883DF (__prtf), 0x885FF, 0x888E1 (__ptfmt)
// ================================================================================================
//
// LA STRUCTURE PARTAGÉE (« specs » chez Watcom), 0x1B octets, que 0x883DF tient dans sa pile et
// passe à tout le monde, routine de sortie comprise :
//
//   +0x00  destination : le tampon de sprintf, ou le FILE* de fprintf
//   +0x04  largeur du champ demandée, puis ce qu'il en reste à remplir
//   +0x08  précision (-1 : aucune), puis le nombre de caractères du corps à écrire
//   +0x0C  nombre de zéros à intercaler entre le préfixe et le corps
//   +0x10  nombre de caractères écrits — ce que printf rend
//   +0x14  drapeaux (un octet)
//   +0x15  caractère de conversion
//   +0x16  caractère de remplissage, ' ' ou '0'
//   +0x17  préfixe, chaîne terminée par un zéro : "-", "+", " ", "0x"…
//
// Les drapeaux : 1 = '#', 2 = ' ', 4 = '+', 8 = '-' (cadrer à gauche), 0x10 = 'h' (court),
// 0x20 = 'l' ou 'w' (long), 0x40 = 'N' ou 'L', 0x80 = 'F' (pointeur lointain).
//
// LA ROUTINE DE SORTIE est passée en paramètre et appelée un caractère à la fois : 0x7F63C pour
// sprintf (`*specs->destination++ = c ; specs->compte++`), 0x8750A pour fprintf (`fputc`). Elle est
// toujours appelée par jeu.appelerDepuis, à la hauteur de pile de l'original : fputc descend dans
// les entrées-sorties et écraserait autrement la structure et le tampon, que la réécriture place,
// comme l'original, sous son propre point d'entrée.
//
// CE QUE LES SCÉNARIOS VÉRIFIENT. Le jeu n'emploie en pratique que %d, %s et %% (la conversion
// inconnue, qui s'écrit elle-même), sans modificateur de taille. ecrans.json et triche.json
// ajoutent la précision (« %0.2d » : les zéros intercalés), bourse.json la largeur avec
// remplissage par des zéros ou des espaces et le cadrage à gauche ('-'). fprintf (0x8750A) sert
// deux fois par partie. Ne sont vérifiés par aucun scénario : '*', %n, %c, %o, %u, %x, %X, %p,
// les flottants, les chaînes larges ou lointaines, %S, et les drapeaux '#', '+' et ' '.
//
// LES SEGMENTS. 0x888E1 rend un pointeur lointain, edx:eax, et 0x883DF fait `mov es, edx` avant de
// lire le corps. Tout cela est sans objet en modèle plat — toutes les bases valent zéro — mais la
// réécriture de 0x888E1 doit tout de même poser le mot bas d'edx, que sa transcription appelante
// relit. Le mot haut d'edx est laissé tel quel : l'original n'écrit que `dx`.

// La pile de 0x883DF, comptée depuis son point d'entrée (esp, qui pointe l'adresse de retour) :
// cinq registres sauvés (ebx, esi, edi, es, ebp) puis 0x50 octets de variables.
const CADRE_PRTF = 20;            // du point d'entrée à ebp
const TAMPON_PRTF = 0x50;         // ebp - 0x50 : le tampon de conversion, 0x28 octets
const SPECS_PRTF = 0x28;          // ebp - 0x28 : la structure partagée
const SECOURS_PRTF = 4;           // ebp - 4 : l'octet nul que prend un %s dont l'argument est nul

// Ce que l'original a sur la pile quand il appelle, depuis chaque routine (son esp après le
// prologue). Les réécritures appellent aux mêmes hauteurs, pour que les appelées travaillent là où
// elles travaillaient : la routine de sortie de fprintf descend dans les entrées-sorties et
// écraserait sinon la structure et le tampon.
const PILE_PTFMT = 20 + 0x14;                   // 0x888E1 : 5 registres sauvés, 0x14 de variables
const PILE_SPEC = 12;                           // 0x885FF : trois registres sauvés
// De l'esp d'appel de 0x883DF à celui de l'appelée : les arguments et l'adresse de retour empilés,
// puis le prologue de l'appelée.
const DESCENTE_SPEC = 3 * 4 + 4 + PILE_SPEC;    // 28
const DESCENTE_PTFMT = 4 * 4 + 4 + PILE_PTFMT;  // 60

// Les adresses de retour d'origine, pour que chaque appel se fasse exactement comme le sien.
const R_SORTIE_CARACTERE = 0x88480;
const R_SORTIE_REMPLISSAGE_AVANT = 0x88501;
const R_SORTIE_PREFIXE = 0x88521;
const R_SORTIE_ZERO = 0x88538;
const R_SORTIE_REMPLISSAGE_APRES = 0x8855D;
const R_SORTIE_CORPS_LARGE = 0x8858C;
const R_SORTIE_CORPS_ETROIT = 0x885A7;
const R_SORTIE_CORPS = 0x885C2;
const R_SORTIE_REMPLISSAGE_DROITE = 0x885F1;

const ANALYSER_DRAPEAUX = 0x88708;   // '-', '#', '+', ' ', '0'
const NOMBRE_EN_FLOTTANT = 0x887FE;  // un float (modificateur 'h') en texte
const FLOTTANT = 0x888CA;            // le formateur des doubles, appelé par [0xC57F8]
const ITOA = 0x8FC40;                // jumeau de 0x8FB97, dans un autre module objet
const UTOA = 0x8FBF8;                // jumeau de 0x8FB4F, non signé
const LTOA = 0x8FB97;
const HEXA_CADRE = 0x887AB;          // n chiffres hexadécimaux cadrés à droite, pour %p
const MAJUSCULES = 0x88D1A;
const LONGUEUR_BORNEE = 0x8875B;
const LONGUEUR_BORNEE_LARGE = 0x88784;

// 0x885FF — analyser ce qui suit le '%' : drapeaux, largeur, précision, modificateur de taille.
// Rend le pointeur sur le caractère de conversion. `argptr` désigne le pointeur d'arguments, que
// '*' fait avancer.
//
// Watcom lit la largeur et la précision comme des entiers de 32 bits, sans borne : une largeur
// absurde dans le format fera tourner longtemps les boucles de remplissage de 0x883DF.
function analyserSpecification(jeu, format, argptr, specs, pile) {
  const { m8, dv } = jeu;
  m8[specs + 0x17] = 0;                  // pas de préfixe
  m8[specs + 0x16] = 0x20;               // remplissage par des espaces
  let p = jeu.appelerDepuis(0x8861C, pile, ANALYSER_DRAPEAUX, format, specs);

  // Un argument pris au vol par '*' : le pointeur d'arguments avance de quatre octets.
  const argumentSuivant = () => {
    const a = (dv.getInt32(argptr, true) + 4) | 0;
    dv.setInt32(argptr, a, true);
    return dv.getInt32(a - 4, true);
  };

  dv.setInt32(specs + 4, 0, true);
  const chiffre = (a) => m8[a] >= 0x30 && m8[a] <= 0x39;
  if (chiffre(p)) {
    let largeur = 0;
    do { largeur = (Math.imul(largeur, 10) + (m8[p] - 0x30)) | 0; p++; } while (chiffre(p));
    dv.setInt32(specs + 4, largeur, true);
  } else if (m8[p] === 0x2A) {           // '*'
    const v = argumentSuivant();
    // Une largeur négative vaut une largeur positive avec le cadrage à gauche.
    dv.setInt32(specs + 4, v < 0 ? -v | 0 : v, true);
    if (v < 0) m8[specs + 0x14] |= 8;
    p++;
  }

  dv.setInt32(specs + 8, -1, true);
  if (m8[p] === 0x2E) {                  // '.'
    p++;
    dv.setInt32(specs + 8, 0, true);
    if (m8[p] === 0x2A) {
      const v = argumentSuivant();
      dv.setInt32(specs + 8, v < 0 ? -1 : v, true);
      p++;
    } else {
      let precision = 0;
      while (chiffre(p)) { precision = (Math.imul(precision, 10) + (m8[p] - 0x30)) | 0; p++; }
      dv.setInt32(specs + 8, precision, true);
    }
  }

  switch (m8[p]) {
    case 0x4E: case 0x4C: p++; m8[specs + 0x14] |= 0x40; break;   // 'N', 'L'
    case 0x6C: case 0x77: p++; m8[specs + 0x14] |= 0x20; break;   // 'l', 'w'
    case 0x68: p++; m8[specs + 0x14] |= 0x10; break;              // 'h'
    case 0x46: p++; m8[specs + 0x14] |= 0x80; break;              // 'F'
    default: break;
  }
  return p;
}

// 0x888E1 — convertir UNE valeur dans `tampon` et remplir la structure : le préfixe, les zéros, la
// longueur du corps, ce qui reste de la largeur. Rend le pointeur sur le corps (eax) et son
// segment (dx). `secours` désigne un octet nul, que prend un %s dont l'argument est nul — c'est
// ainsi que Watcom fait écrire une chaîne vide plutôt que de planter.
//
// La conversion inconnue est écrite telle quelle, la largeur remise à zéro.
function formater(jeu, tampon, argptr, specs, secours, pile) {
  const { m8, dv } = jeu;
  const appel = (retour, adresse, ...args) => jeu.appelerDepuis(retour, pile, adresse, ...args);
  const argumentSuivant = (octets) => {
    const a = (dv.getInt32(argptr, true) + octets) | 0;
    dv.setInt32(argptr, a, true);
    return a;
  };

  let segment = jeu.T.R.ds & 0xFFFF;
  let estNombre = true;                  // [ebp-8] : le corps est un nombre, dont il faut le signe
  let base = 10;                         // [ebp-0xC]
  let valeur = 0;                        // [ebp-0x10] : la valeur des conversions non signées
  let corps = tampon;                    // edi : où commence le texte rendu
  let ecriture = tampon;                 // esi : où la conversion écrit
  let longueur = 0;                      // eax : la longueur du corps
  dv.setInt32(specs + 0xC, 0, true);
  const conversion = m8[specs + 0x15];

  // Les conversions entières non signées prennent tout de suite leur argument ; toutes les
  // conversions entières perdent les drapeaux ' ' et '+' quand une précision est donnée, auquel cas
  // le remplissage par des zéros est annulé.
  const nonSignee = conversion === 0x6F || conversion === 0x75 || conversion === 0x78 || conversion === 0x58;
  if (nonSignee) {
    const d = m8[specs + 0x14];
    const a = argumentSuivant(4);
    valeur = (d & 0x20) || !(d & 0x10) ? dv.getInt32(a - 4, true) : dv.getUint16(a - 4, true);
    m8[specs + 0x14] &= 0xF9;
  }
  if (nonSignee || conversion === 0x64 || conversion === 0x69) {
    if (dv.getInt32(specs + 8, true) !== -1) m8[specs + 0x16] = 0x20;
  }

  // Une fois le corps écrit, mesurer sa longueur (0x88A9D et 0x88AA5).
  const mesurer = (maximum) => { longueur = appel(0x88AAA, LONGUEUR_BORNEE, corps, segment, maximum); };
  // Précision zéro et valeur nulle : le corps est vide (0x88A8B).
  const zeroEffacé = () => {
    if (dv.getInt32(specs + 8, true) === 0 && m8[ecriture] === 0x30) m8[corps] = 0;
  };

  switch (conversion) {
    case 0x65: case 0x45: case 0x67: case 0x47: {    // 'e', 'E', 'g', 'G'
      longueur = flottant();
      break;
    }
    case 0x66: case 0x46: {                          // 'f', 'F'
      if (m8[specs + 0x14] & 0x10) {                 // 'hf' : un float, pas un double
        const a = argumentSuivant(4);
        appel(0x88A43, NOMBRE_EN_FLOTTANT, ecriture, dv.getInt32(a - 4, true), specs);
        segment = jeu.T.R.ds & 0xFFFF;
        corps = ecriture;
        mesurer(-1);
      } else {
        longueur = flottant();
      }
      break;
    }
    case 0x6F: {                                     // 'o' : octal
      if (m8[specs + 0x14] & 1) { m8[ecriture] = 0x30; ecriture++; }   // '#' : un zéro devant
      appel(0x88A88, ITOA, valeur, ecriture, 8);
      zeroEffacé();
      mesurer(-1);
      break;
    }
    case 0x64: case 0x69: {                          // 'd', 'i'
      const d = m8[specs + 0x14];
      if (d & 0x20) {
        const a = argumentSuivant(4);
        appel(0x88A88, ITOA, dv.getInt32(a - 4, true), ecriture, base);
      } else if (d & 0x10) {
        const a = argumentSuivant(4);
        appel(0x88A88, ITOA, dv.getInt16(a - 4, true), ecriture, base);
      } else {
        const a = argumentSuivant(4);
        appel(0x88AF2, LTOA, dv.getInt32(a - 4, true), ecriture, base);
      }
      zeroEffacé();
      mesurer(-1);
      break;
    }
    case 0x73: case 0x53: {                          // 's', 'S'
      const d = m8[specs + 0x14];
      if (d & 0x80) {                                // pointeur lointain
        const a = argumentSuivant(8);
        corps = dv.getInt32(a - 8, true);
        const seg = dv.getUint16(a - 4, true);
        if (corps === 0 && seg === 0) { corps = secours; segment = jeu.T.R.ds & 0xFFFF; }
        else segment = seg;
      } else {
        const a = argumentSuivant(4);
        corps = dv.getInt32(a - 4, true);
        if (corps === 0) corps = secours;
        segment = jeu.T.R.ds & 0xFFFF;
      }
      m8[specs + 0x14] &= 0xF9;
      estNombre = false;
      if (conversion === 0x53) {
        // Anomalie de cette version de Watcom, reproduite : pour %S la « longueur » prend la
        // valeur du premier caractère, au lieu de la longueur de la chaîne.
        if (m8[specs + 0x14] & 0x20) { longueur = dv.getUint16(corps, true); corps += 2; }
        else { longueur = m8[corps]; corps += 1; }
      } else if (m8[specs + 0x14] & 0x20) {
        longueur = appel(0x88AAA, LONGUEUR_BORNEE_LARGE, corps, segment, dv.getInt32(specs + 8, true));
      } else {
        longueur = appel(0x88AAA, LONGUEUR_BORNEE, corps, segment, dv.getInt32(specs + 8, true));
      }
      break;
    }
    case 0x78: case 0x58: {                          // 'x', 'X'
      if ((m8[specs + 0x14] & 1) && valeur !== 0) {  // '#' : le préfixe "0x" ou "0X"
        m8[specs + 0x17] = 0x30;
        m8[specs + 0x18] = conversion;
        m8[specs + 0x19] = 0;
      }
      base = 0x10;
      nonSigneeEnTexte();
      break;
    }
    case 0x75: {                                     // 'u' : décimal non signé
      nonSigneeEnTexte();
      break;
    }
    case 0x70: case 0x50: {                          // 'p', 'P' : un pointeur
      if (dv.getInt32(specs + 4, true) === 0) {
        dv.setInt32(specs + 4, (m8[specs + 0x14] & 0x80) ? 13 : 8, true);
      }
      m8[specs + 0x14] &= 0xF9;
      const a = argumentSuivant(4);
      const decalage = dv.getInt32(a - 4, true);
      if (m8[specs + 0x14] & 0x80) {                 // segment:décalage
        const b = argumentSuivant(4);
        appel(0x88C23, HEXA_CADRE, dv.getInt32(b - 4, true) & 0xFFFF, ecriture, 4);
        m8[ecriture + 4] = 0x3A;                     // ':'
        appel(0x88C3E, HEXA_CADRE, decalage, ecriture + 5, 8);
      } else {
        appel(0x88C3E, HEXA_CADRE, decalage, ecriture, 8);
      }
      if (conversion === 0x50) appel(0x88C51, MAJUSCULES, ecriture);
      mesurer(-1);
      break;
    }
    case 0x63: {                                     // 'c' : un caractère
      const a = argumentSuivant(4);
      m8[ecriture] = m8[a - 4];
      m8[ecriture + 1] = 0;
      estNombre = false;
      dv.setInt32(specs + 8, 1, true);
      longueur = 1;
      m8[specs + 0x14] &= 0xF9;
      break;
    }
    default: {                                       // conversion inconnue : écrite telle quelle
      dv.setInt32(specs + 4, 0, true);
      m8[ecriture] = conversion;
      m8[ecriture + 1] = 0;
      estNombre = false;
      dv.setInt32(specs + 8, 1, true);
      longueur = 1;
      m8[specs + 0x14] &= 0xF9;
      break;
    }
  }

  // Le signe et les zéros de précision, pour un corps qui est un nombre (0x88C8D).
  if (estNombre) {
    if (m8[corps] === 0x2D) {                        // le '-' que ltoa a posé passe en préfixe
      longueur--;
      m8[specs + 0x17] = 0x2D;
      corps++;
      m8[specs + 0x18] = 0;
    } else if (m8[specs + 0x14] & 2) { m8[specs + 0x17] = 0x20; m8[specs + 0x18] = 0; }
    else if (m8[specs + 0x14] & 4) { m8[specs + 0x17] = 0x2B; m8[specs + 0x18] = 0; }
    const precision = dv.getInt32(specs + 8, true);
    if (longueur > precision) dv.setInt32(specs + 8, longueur, true);
    else dv.setInt32(specs + 0xC, precision - longueur, true);
  }
  // Remplissage par '*' : ni préfixe, ni signe (chemin mort, rien ne pose ce caractère).
  if (m8[specs + 0x16] === 0x2A) { m8[specs + 0x17] = 0; m8[specs + 0x14] &= 0xF9; }
  const precision = dv.getInt32(specs + 8, true);
  if ((precision === -1 || longueur < precision) && conversion !== 0x63) {
    dv.setInt32(specs + 8, longueur, true);
  }
  // Ce qui reste de la largeur, une fois retirés le préfixe, le corps et les zéros.
  const prefixe = appel(0x88D03, LONGUEUR_BORNEE, specs + 0x17, jeu.T.R.ds & 0xFFFF, -1);
  const pris = (prefixe + dv.getInt32(specs + 8, true) + dv.getInt32(specs + 0xC, true)) | 0;
  dv.setInt32(specs + 4, (dv.getInt32(specs + 4, true) - pris) | 0, true);
  return { corps, segment };

  // Les flottants passent par [0xC57F8], que la bibliothèque pose si le programme en a besoin.
  function flottant() {
    corps = appel(0x88A5D, FLOTTANT, ecriture, argptr, specs);
    segment = jeu.T.R.edx & 0xFFFF;
    return appel(0x88AAA, LONGUEUR_BORNEE, corps, segment, -1);
  }
  // 'u', 'x' et 'X' partagent la même sortie (0x88BB5) : utoa, puis les majuscules pour 'X'.
  function nonSigneeEnTexte() {
    appel(0x88BC1, UTOA, valeur, ecriture, base);
    if (m8[specs + 0x15] === 0x58) appel(0x88BD7, MAJUSCULES, ecriture);
    zeroEffacé();
    mesurer(-1);
  }
}

// 0x883DF — le moteur : parcourir le format, recopier ce qui n'est pas une conversion, et pour
// chaque conversion faire écrire 0x888E1 puis poser, dans l'ordre, le remplissage de gauche, le
// préfixe, les zéros, le remplissage d'après-préfixe, le corps, et le remplissage de droite. Rend
// le nombre de caractères écrits.
//
// Le remplissage par des espaces se fait avant le préfixe, celui par des zéros après : « -007 » et
// non « 00-7 ». Le cadrage à gauche ('-') les remplace tous deux par des espaces à droite.
function prtf(jeu, destination, format, argptr, sortie, pointEntree) {
  const { m8, dv } = jeu;
  const cadre = pointEntree - CADRE_PRTF;
  const tampon = cadre - TAMPON_PRTF;
  const specs = cadre - SPECS_PRTF;
  const secours = cadre - SECOURS_PRTF;
  const pile = cadre - TAMPON_PRTF;                // l'esp de l'original, sous ses variables

  m8[secours] = 0;
  m8[specs + 0x14] = 0;
  dv.setInt32(specs, destination, true);
  dv.setInt32(specs + 0x10, 0, true);

  const ecrire = (c, retour) => jeu.appelerDepuis(retour, pile, sortie, specs, c);
  // Les boucles de remplissage : décrémenter d'abord, sortir quand le compte est devenu négatif.
  const remplir = (champ, retour, caractere) => {
    for (;;) {
      const n = (dv.getInt32(champ, true) - 1) | 0;
      dv.setInt32(champ, n, true);
      if (n < 0) return;
      ecrire(caractere(), retour);
    }
  };
  // Les boucles de corps : lire le compte, le décrémenter, sortir s'il valait zéro.
  const defiler = (champ) => {
    const n = dv.getInt32(champ, true);
    dv.setInt32(champ, (n - 1) | 0, true);
    return n !== 0;
  };

  let f = format;
  for (;;) {
    if (m8[f] === 0) break;
    if (m8[f] !== 0x25) { const c = m8[f]; f++; ecrire(c, R_SORTIE_CARACTERE); continue; }

    f = analyserSpecification(jeu, f + 1, argptr, specs, pile - DESCENTE_SPEC);
    const conversion = m8[f];
    m8[specs + 0x15] = conversion;
    f++;
    if (conversion === 0) break;

    if (conversion === 0x6E) {                       // %n : ranger le compte chez l'appelant
      const d = m8[specs + 0x14];
      const compte = dv.getInt32(specs + 0x10, true);
      const octets = (d & 0x80) ? 8 : 4;             // un pointeur lointain en fait six, arrondis à huit
      const a = (dv.getInt32(argptr, true) + octets) | 0;
      dv.setInt32(argptr, a, true);
      const ou = dv.getInt32(a - octets, true);
      if ((d & 0x20) || !(d & 0x10)) dv.setInt32(ou, compte, true);
      else dv.setUint16(ou, compte & 0xFFFF, true);
      continue;
    }

    const { corps } = formater(jeu, tampon, argptr, specs, secours, pile - DESCENTE_PTFMT);
    let p = corps;

    if (!(m8[specs + 0x14] & 8) && m8[specs + 0x16] === 0x20) {
      remplir(specs + 4, R_SORTIE_REMPLISSAGE_AVANT, () => m8[specs + 0x16]);
    }
    let q = specs + 0x17;
    while (m8[q] !== 0) { const c = m8[q]; q++; ecrire(c, R_SORTIE_PREFIXE); }
    while (defiler(specs + 0xC)) ecrire(0x30, R_SORTIE_ZERO);
    if (!(m8[specs + 0x14] & 8) && m8[specs + 0x16] !== 0x20) {
      remplir(specs + 4, R_SORTIE_REMPLISSAGE_APRES, () => m8[specs + 0x16]);
    }

    if (conversion === 0x73 || conversion === 0x53) {
      if (m8[specs + 0x14] & 0x20) {                 // chaîne large : un caractère sur deux
        while (defiler(specs + 8)) { ecrire(m8[p], R_SORTIE_CORPS_LARGE); p += 2; }
      } else {
        while (defiler(specs + 8)) { ecrire(m8[p], R_SORTIE_CORPS_ETROIT); p += 1; }
      }
    } else {
      while (defiler(specs + 8)) { ecrire(m8[p], R_SORTIE_CORPS); p += 1; }
    }

    if ((m8[specs + 0x14] & 8) && dv.getInt32(specs + 4, true) > 0) {
      while (defiler(specs + 4)) ecrire(0x20, R_SORTIE_REMPLISSAGE_DROITE);
    }
  }
  return dv.getInt32(specs + 0x10, true);
}

// --- Les points d'entrée ------------------------------------------------------------------------

// 0x883DF est du code compilé (convention pile), mais sa réécriture a besoin de connaître le
// pointeur de pile à l'entrée : c'est là qu'elle installe, comme l'original, la structure partagée
// et le tampon de conversion, et c'est la hauteur d'où elle appelle la routine de sortie.
function prtfRegistres(jeu, R) {
  const esp = R.esp >>> 0;
  const arg = (k) => jeu.machine.r32(esp + 4 + 4 * k);
  R.eax = prtf(jeu, arg(0), arg(1), arg(2), arg(3), esp) | 0;
}

// 0x888E1 rend un pointeur lointain : eax le décalage, dx le segment. Seul le mot bas d'edx est
// posé, comme l'original.
function formaterRegistres(jeu, R) {
  const esp = R.esp >>> 0;
  const arg = (k) => jeu.machine.r32(esp + 4 + 4 * k);
  const r = formater(jeu, arg(0), arg(1), arg(2), arg(3), esp - PILE_PTFMT);
  R.eax = r.corps | 0;
  R.edx = (R.edx & ~0xFFFF) | (r.segment & 0xFFFF);
}

// Toutes vérifiées par comparer.mjs et verifier.mjs (voir le rapport) : les tracés sur les
// scénarios qui ouvrent des fenêtres et des écrans, le moteur de printf partout — la démonstration
// à elle seule l'appelle pour l'heure, les sommes et les enseignes.
//
// Les routines de tracé sauvent et rendent tous leurs registres : on les compare tous. Le tampon de
// 0x8FB4F et de 0x8FB97, comme la structure de 0x885FF et de 0x888E1, vivent dans le cadre de
// 0x883DF, au-dessus du point d'entrée de l'appelée : le comparateur les relève déjà avec la pile
// de l'appelant, et aucune `zone` n'est nécessaire. Seule 0x883DF écrit ailleurs — dans le tampon
// de sprintf, par sa routine de sortie —, qu'elle déclare.
const TOUS_REGISTRES = ['eax', 'ecx', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'];
const ROUTINE_SPRINTF = 0x7F63C;   // la routine de sortie de sprintf : la destination est un tampon

export const reecritures = [
  { adresse: 0x81374, nom: 'tracerSegmentBasse', arguments: 6, registresCompares: TOUS_REGISTRES,
    fn: (jeu, x1, y1, x2, y2, couleur, drapeaux) => tracerSegment(jeu, x1, y1, x2, y2, couleur, drapeaux, true) },
  { adresse: 0x8148C, nom: 'tracerSegmentHaute', arguments: 6, registresCompares: TOUS_REGISTRES,
    fn: (jeu, x1, y1, x2, y2, couleur, drapeaux) => tracerSegment(jeu, x1, y1, x2, y2, couleur, drapeaux, false) },
  { adresse: 0x949BC, nom: 'tracerLigneBasse', arguments: 5, registresCompares: TOUS_REGISTRES,
    fn: (jeu, x1, y1, x2, y2, couleur) => tracerLigne(jeu, x1, y1, x2, y2, couleur, true) },
  { adresse: 0x949DA, nom: 'tracerLigneHaute', arguments: 5, registresCompares: TOUS_REGISTRES,
    fn: (jeu, x1, y1, x2, y2, couleur) => tracerLigne(jeu, x1, y1, x2, y2, couleur, false) },

  { adresse: 0x8FB4F, nom: 'ultoa', fn: ultoa, arguments: 3, retour: true },
  { adresse: 0x8FB97, nom: 'ltoa', fn: ltoa, arguments: 3, retour: true },
  { adresse: 0x8875B, nom: 'longueurBornee', fn: longueurBornee, arguments: 3, retour: true },
  { adresse: 0x885FF, nom: 'analyserSpecification', arguments: 3, retour: true,
    fn: (jeu, format, argptr, specs) => analyserSpecification(jeu, format, argptr, specs,
      (jeu.T.R.esp >>> 0) - PILE_SPEC) },
  { adresse: 0x888E1, nom: 'formaterConversion', fn: formaterRegistres, convention: 'registres',
    arguments: 4, registresCompares: ['eax', 'ebx', 'esi', 'edi', 'ebp', 'esp'] },
  { adresse: 0x883DF, nom: 'prtf', fn: prtfRegistres, convention: 'registres', arguments: 4,
    registresCompares: ['eax', 'ebx', 'esi', 'edi', 'ebp', 'esp'],
    zones: (jeu, R) => {
      const esp = R.esp >>> 0;
      return jeu.machine.r32(esp + 16) === ROUTINE_SPRINTF
        ? [[jeu.machine.r32(esp + 4), jeu.machine.r32(esp + 4) + 512]] : [];
    } },
];

// Les aides des conversions que les formats du jeu n'emploient pas (voir l'en-tête). Leurs tampons
// sont dans le cadre de 0x883DF, relevé avec la pile de l'appelant.
export const enAttente = [
  { adresse: 0x8FBF8, nom: 'utoa', fn: utoa, arguments: 3, retour: true },
  { adresse: 0x8FC40, nom: 'itoa', fn: itoa, arguments: 3, retour: true },
  { adresse: 0x88784, nom: 'longueurBorneeLarge', fn: longueurBorneeLarge, arguments: 3, retour: true },
  { adresse: 0x887AB, nom: 'hexaCadre', fn: hexaCadre, arguments: 3, retour: true },
  { adresse: 0x88D1A, nom: 'enMajuscules', fn: enMajuscules, arguments: 1 },
  { adresse: 0x888CA, nom: 'convertirUnFlottant', fn: convertirUnFlottant, arguments: 3, retour: true },
];
