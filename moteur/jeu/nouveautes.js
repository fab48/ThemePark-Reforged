// L'annonce des nouveautés de l'année, la neige et la foudre, le démontage d'une voie, et le
// « diviseur nul ».
//
// Réécriture lisible des fonctions 0x3A8EF, 0x47A27, 0x47E39, 0x481C5, 0x44C91 et 0x19ED3 du jeu
// d'origine. Voir docs/guide-reecriture.md.
//
// L'ANNONCE D'UNE NOUVEAUTÉ — 0x3A8EF dessine une image de l'écran 0x48, que la fin d'année (0x7401C,
// fin-annee.js) ouvre pour chaque genre d'attraction ou de boutique qui devient disponible, et que la
// boucle des écrans pleins (0x11C45) fait tourner tant qu'il est ouvert. Le genre annoncé est désigné
// par 0xD6614 (la sorte : 4 une attraction, 0xA une boutique) et 0xD6610 (le décalage de sa fiche dans
// le catalogue). Chaque image efface le drapeau « à annoncer » (bit 1) de la fiche.
//
// LE CIEL DU PARC — la boucle du parc appelle 0x47A27 quand il neige (bit 1 de la météo [0xB14CC]) :
// 360 flocons, semés au lancement d'une partie par 0x4790C, tombent et se balancent, poussés par le
// vent [0xB14CB]. 0x47E39 trace un éclair de l'orage (appelée par 0x47606, boucle.js), et 0x481C5
// tire l'écart d'un de ses zigzags.
//
// LE DÉMONTAGE D'UNE VOIE — 0x44C91, appelée par la démolition d'une attraction à train (0x31748,
// construire.js, sauf le monorail), suit la voie depuis la gare dans les deux sens, comme l'évaluation
// de la voie (0x43689, construire.js), et en retire chaque morceau.
//
// LA DIVISION PAR ZÉRO — 0x19ED3 ne fait qu'appeler 0x2DEF8 et rendre 1 : les états des visiteurs
// et du personnel s'en servent à la place d'un diviseur ou d'un délai qui vaudrait 0 (attractions.js,
// personnel.js). 0x2DEF8 remet à zéro le mot 0xD6688, la demande de sortie du parc que la boucle des
// écrans pleins (0x11C45) relit (docs/retro-ingenierie.md) : vraisemblablement le reste d'une routine
// de signalement d'erreur.
//
// VÉRIFICATION : voir en fin de fichier.

import { dansLeCadre } from './cadre.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';

const s16 = (v) => (v << 16) >> 16;
// `idiv` : division entière signée tronquée vers zéro. Une division par zéro arrêtait le programme
// d'origine (exception du processeur) : elle arrête aussi la réécriture.
function idiv(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}
function imod(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) % (b | 0)) | 0;
}

const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);

// --- les variables du jeu ----------------------------------------------------------------------
const MODE = 0xDE5F6;                  // bit 0 : 320x200 (basse résolution) ; sinon 640x480
const SORTE_ANNONCEE = 0xD6614;        // mot : 4 une attraction, 0xA une boutique
const GENRE_ANNONCE = 0xD6610;         // mot : le décalage de la fiche dans son catalogue
const TEINTES = 0xB14DA;               // pointeur : six couleurs de l'interface ; +5 le texte
const NOMS = 0xD7BD0;                  // pointeur : table des noms et intitulés
const TEXTES_COURTS = 0xD7B7C;         // pointeur : les appréciations (ecrans-achat.js)
const TEXTES_DES_DECORS = 0xD7BC4;     // pointeur : les descriptions des attractions
const TEXTES_DES_BOUTIQUES = 0xD7BA4;  // pointeur : les descriptions des boutiques

// Les catalogues (docs/retro-ingenierie.md § 10.3 et 10.4).
const ATTRACTIONS = 0xCCED0, TAILLE_ATTRACTION = 0xC8;
const BOUTIQUES = 0xD3C62;
// Les fiches de référence des attractions, 200 octets par genre comme le catalogue : l'octet +0 le
// seuil d'usure, le mot +4 la durée (ecrans-achat.js, « appreciationDeReference »).
const REFERENCES = 0xB17A0;

// Les champs d'une fiche d'attraction.
const A_PRIX = 0xA2, A_CAPACITE = 0xA6, A_ATTRAIT = 0xA9, A_DESCRIPTION = 0xC4, A_DRAPEAUX = 0xC5;
// Ceux d'une fiche de boutique.
const B_PRIX = 0x49, B_DRAPEAUX = 0x66, B_DESCRIPTION = 0x6A;
const NOM_DU_GENRE = 0x22;             // mot, dans les deux catalogues : le rang du nom
const A_ANNONCER = 0x02;               // le bit du drapeau « à annoncer » (fin-annee.js)

// Les intitulés (décalages dans la table des noms). Celui du prix est aussi celui de l'écran d'achat
// d'une boutique (ecrans-achat.js) ; le texte exact des trois autres n'est pas établi.
const INTITULE_PRIX = 0x3C4, INTITULE_ATTRAIT = 0x3BC, INTITULE_FIABILITE = 0x3C0;
const INTITULE_CAPACITE = 0x3B8;

// La mise en page (ecrans-achat.js, « Les éléments de l'écran ») : 11 octets par élément, x0 en +1,
// y0 en +3, x1 en +5, y1 en +7.
const TAILLE_ELEMENT = 0xB;
const COLONNE_DES_CHIFFRES = 0x98, CADRE_DU_NOM = 0x97;

const FORMAT_ENTIER = 0xB0158;         // "%d"
const FORMAT_TEXTE = 0xB0168;          // "%s"

// La neige.
const BAS_DE_LA_VUE = 0xB9401;         // mot signé : rien n'est dessiné plus bas (boucle.js)
// Les couleurs des flocons, par vitesse : quatre octets pris dans le code, juste avant la fonction
// (00 9D 9C F2) ; 0x4790C ne donne que les vitesses 1 à 3.
const COULEURS_DES_FLOCONS = 0x47A23;
const TAILLE_FLOCON = 7;
const LIMITE_DE_CHUTE = 0x190;         // 400 : au-delà, le flocon renaît en haut
// 640 : les coordonnées sont celles du 640x480 (`ecran`, grande-vue.js : plus en grande vue).
const largeur = () => ecran.largeur;

// La foudre.
const COULEUR_DE_L_ECLAIR = 0xF2;

// Le démontage de la voie (construire.js, « Les tables employées »).
const CARTE = 0xD3B08;                 // pointeur : 64 x 64 cellules de 4 octets, +2 le sol
const VOISINES = 0xB4920;              // mots signés : le pas vers la case voisine, par direction
const SORTIES_DES_RAILS = 0xB7AEA;     // 2 octets par forme : ses deux directions de sortie
const RETOUR_DES_RAILS = 0xB7B18;      // le bit de retour d'une direction de rail
const OUVERTURES_DES_RAILS = 0xB7B21;  // les directions ouvertes d'une forme de rail
const PAS_D_UN_MASQUE = 0xB4B2A;       // mot signé par masque d'une seule direction : le pas en cases
const DRAPEAUX_DES_SOLS = 0xB44DA;     // 4 octets par image de sol ; ici l'octet haut du mot de
                                       // drapeaux (0xB44D9) : le bit 2, le drapeau 0x400
const SOL_DE_VOIE = 0x04;
const RAIL = 0x12;                     // le type d'objet d'un morceau de voie

// --- les fonctions du jeu appelées -------------------------------------------------------------
const DEBUT_D_IMAGE = 0x3B3B8, FIN_D_IMAGE = 0x3D8B8;   // ecrans-achat.js
const ELEMENT = 0x408D3;               // (repère) : l'élément qui suit ce repère, 0 s'il n'y en a pas
const FORMATER = 0x7F652;              // sprintf
const ECRIRE = 0x3F49E;                // (x, y, texte, mode, couleur)
const ECRIRE_CENTRE = 0x3F377;         // (x0, x1, y, texte, mode, couleur)
const TEXTE_DANS_UN_CADRE = 0x40BBC;   // (x0, y0, x1, y1, texte, couleur, 0)
const HASARD = 0x18B92;                // 0 à 32 767
const POINT_320 = 0x80C00;             // (x, y, couleur) : un pixel en (x/2, y/2) en 320x200
const POINT_640 = 0x80C40;             // (x, y, couleur)
const MARQUER_ZONE_SALE = 0x54D38;     // (x, y, largeur, hauteur)
const LIGNE_BASSE = 0x949BC, LIGNE_HAUTE = 0x949DA;     // (x0, y0, x1, y1, couleur)
const ECART_AU_HASARD = 0x481C5;
const CHERCHER_SUR_LA_CASE = 0x204B9;  // (cellule, type) : le premier objet de ce type, ou 0
const RETIRER_L_OBJET = 0x18B62;       // (objet)
const EFFACER_LA_DEMANDE_DE_SORTIE = 0x2DEF8; // remet à zéro le mot 0xD6688

const basseResolution = (jeu) => (octet(jeu, MODE) & 1) !== 0;
const hasard = (jeu) => jeu.appeler(HASARD) & 0xFFFF;

// =================================================================================================
// 0x3A8EF — l'annonce d'une nouveauté (écran 0x48), une image.
//
// Pour une attraction : à gauche, quatre intitulés l'un sous l'autre (x = 0x16, y = 0x114, puis de
// 0x14 en 0x14), et en face, dans la colonne des chiffres (les éléments qui suivent le deuxième après
// le repère 0x98) : son prix (+0xA2), son attrait (l'appréciation de l'octet +0xA9 divisé par 10), sa
// fiabilité (tirée de sa fiche de référence : durée × seuil / 16384, comme à l'écran d'achat) et sa
// capacité (+0xA6). Pour une boutique, seul le prix (+0x49). Puis, dans les deux cas, le nom du genre
// dans le cadre du repère 0x97 (deux éléments plus loin), et sa description dans le cadre de
// l'élément d'avant.
//
// ANOMALIE REPRODUITE : le « pas d'élément » n'est testé qu'après avoir ajouté 0xB au retour de
// 0x408D3, qui rend 0 quand le repère manque ; le test ne peut donc jamais partir. Le repère 0x98
// existe toujours dans la table : sans conséquence.
// Pour une boutique, l'élément courant avance trois fois de 0xB sans servir, avant d'être remplacé.
//
// Le tampon du texte est la variable [ebp-0x54] de l'original : la réécriture ouvre le même cadre.
const ecranDesNouveautes = dansLeCadre(0x58, (jeu, cadre) => {
  jeu.appeler(DEBUT_D_IMAGE);
  const tampon = cadre.local(0x54);
  const element = (jeu.appeler(ELEMENT, COLONNE_DES_CHIFFRES) + TAILLE_ELEMENT) | 0;
  const sorte = mot(jeu, SORTE_ANNONCEE);
  if (sorte === 4) annoncerUneAttraction(jeu, tampon, element);
  else if (sorte === 0xA) annoncerUneBoutique(jeu, tampon, element);
  jeu.appeler(FIN_D_IMAGE);
});

const couleurDuTexte = (jeu) => octet(jeu, long(jeu, TEINTES) + 5);

// Un texte de la table `table`, au rang donné en octets, mis dans le tampon par « %s ».
function formaterUnTexte(jeu, tampon, table, decalage) {
  jeu.appeler(FORMATER, tampon, FORMAT_TEXTE, long(jeu, long(jeu, table) + decalage));
}

// Le tampon, centré dans l'élément, 4 pixels sous son haut.
function ecrireDansLElement(jeu, element, tampon) {
  jeu.appeler(ECRIRE_CENTRE, motSigne(jeu, element + 1), motSigne(jeu, element + 5),
    s16(mot(jeu, element + 3) + 4), tampon, 0, couleurDuTexte(jeu));
}

// La colonne des intitulés, à gauche.
function colonneDesIntitules(jeu, tampon) {
  const x = 0x16;
  let y = 0x114;
  return (decalage, premier = false) => {
    if (!premier) y += 0x14;
    formaterUnTexte(jeu, tampon, NOMS, decalage);
    jeu.appeler(ECRIRE, s16(x), s16(y), tampon, 0, couleurDuTexte(jeu));
  };
}

// Le nom du genre dans son cadre, puis sa description dans le cadre de l'élément d'avant.
function nomEtDescription(jeu, tampon, fiche, textes, rangDeLaDescription) {
  let element = (jeu.appeler(ELEMENT, CADRE_DU_NOM) + 2 * TAILLE_ELEMENT) | 0;
  formaterUnTexte(jeu, tampon, NOMS, 4 * mot(jeu, fiche + NOM_DU_GENRE));
  ecrireDansLElement(jeu, element, tampon);
  element = (element - TAILLE_ELEMENT) | 0;
  jeu.appeler(TEXTE_DANS_UN_CADRE, (mot(jeu, element + 1) + 8) & 0xFFFF,
    (mot(jeu, element + 3) + 0x1C) & 0xFFFF, (mot(jeu, element + 5) - 8) & 0xFFFF,
    (mot(jeu, element + 7) - 8) & 0xFFFF, long(jeu, long(jeu, textes) + 4 * rangDeLaDescription),
    couleurDuTexte(jeu), 0);
}

function annoncerUneAttraction(jeu, tampon, element) {
  const fiche = ATTRACTIONS + mot(jeu, GENRE_ANNONCE);
  poserOctet(jeu, fiche + A_DRAPEAUX, octet(jeu, fiche + A_DRAPEAUX) & ~A_ANNONCER);
  if (element === 0) return;   // jamais : voir l'anomalie ci-dessus
  const intitule = colonneDesIntitules(jeu, tampon);

  intitule(INTITULE_PRIX, true);
  jeu.appeler(FORMATER, tampon, FORMAT_ENTIER, longSigne(jeu, fiche + A_PRIX));
  ecrireDansLElement(jeu, element, tampon);
  element += TAILLE_ELEMENT;

  intitule(INTITULE_ATTRAIT);
  formaterUnTexte(jeu, tampon, TEXTES_COURTS, 4 * idiv(octet(jeu, fiche + A_ATTRAIT), 10));
  ecrireDansLElement(jeu, element, tampon);
  element += TAILLE_ELEMENT;

  intitule(INTITULE_FIABILITE);
  const reference = REFERENCES + idiv(fiche - ATTRACTIONS, TAILLE_ATTRACTION) * TAILLE_ATTRACTION;
  const duree = mot(jeu, reference + 4);
  if (duree === 0) {
    formaterUnTexte(jeu, tampon, TEXTES_COURTS, 0x20);
  } else {
    const note = idiv(Math.imul(duree, octet(jeu, reference)), 0x4000);
    formaterUnTexte(jeu, tampon, TEXTES_COURTS, note > 9 ? 0x24 : 4 * note);
  }
  ecrireDansLElement(jeu, element, tampon);
  element += TAILLE_ELEMENT;

  intitule(INTITULE_CAPACITE);
  jeu.appeler(FORMATER, tampon, FORMAT_ENTIER, motSigne(jeu, fiche + A_CAPACITE));
  ecrireDansLElement(jeu, element, tampon);

  nomEtDescription(jeu, tampon, fiche, TEXTES_DES_DECORS, octet(jeu, fiche + A_DESCRIPTION));
}

function annoncerUneBoutique(jeu, tampon, element) {
  const fiche = BOUTIQUES + mot(jeu, GENRE_ANNONCE);
  poserOctet(jeu, fiche + B_DRAPEAUX, octet(jeu, fiche + B_DRAPEAUX) & ~A_ANNONCER);
  if (element === 0) return;   // jamais : voir l'anomalie ci-dessus
  colonneDesIntitules(jeu, tampon)(INTITULE_PRIX, true);
  jeu.appeler(FORMATER, tampon, FORMAT_ENTIER, longSigne(jeu, fiche + B_PRIX));
  ecrireDansLElement(jeu, element, tampon);
  nomEtDescription(jeu, tampon, fiche, TEXTES_DES_BOUTIQUES, octet(jeu, fiche + B_DESCRIPTION));
}

// =================================================================================================
// 0x47A27 — la neige, une image : (nombre de flocons, vent, table des flocons).
//
// Un flocon tient en 7 octets : +0 x et +2 y (mots, coordonnées du 640x480), +4 sa vitesse (1 à 3,
// qui choisit aussi sa couleur), +5 son retard (toujours 1, 0x4790C) et +6 son compteur d'images.
// Le flocon ne bouge qu'une image sur retard + 1 : il descend alors de sa vitesse, et renaît en haut
// (y de 0 à 4, x au hasard) s'il a passé la ligne 400. Il se balance : il est dessiné à
// x + |(y mod 16) − 8| + vent, où il sort à droite (au-delà de 640) il renaît ailleurs. Rien n'est
// dessiné sous le haut du panneau. En 640x480, le pixel est marqué dans la grille des blocs.
//
// ANOMALIE REPRODUITE : le flocon qui sort à droite renaît, mais il est dessiné cette image-là à
// l'abscisse qu'il avait calculée, au-delà de 640 (la routine de point l'écarte), et à sa nouvelle
// hauteur.
// La couleur est lue dans une copie de quatre octets faite dans les variables de l'original ; une
// vitesse au-delà de 3 y lirait ses autres variables. 0x4790C n'en donne jamais.
function neige(jeu, nombre, vent, flocons) {
  nombre &= 0xFFFF;
  vent = s8(vent);
  const basse = basseResolution(jeu);
  for (let i = 0; i < nombre; i++) {
    const f = (flocons + i * TAILLE_FLOCON) | 0;
    let x;
    if (octet(jeu, f + 6) > octet(jeu, f + 5)) {
      // Le flocon avance.
      if (motSigne(jeu, f + 2) > LIMITE_DE_CHUTE) {
        poserMot(jeu, f + 2, imod(hasard(jeu), 5));
        poserMot(jeu, f, imod(hasard(jeu), largeur()));
      } else {
        poserMot(jeu, f + 2, mot(jeu, f + 2) + octet(jeu, f + 4));
      }
      poserOctet(jeu, f + 6, 0);
      x = s16(mot(jeu, f) + balancement(jeu, f) + vent);
      if (x > largeur()) {
        poserMot(jeu, f, imod(hasard(jeu), largeur()));
        poserMot(jeu, f + 2, imod(hasard(jeu), 5));
      }
    } else {
      poserOctet(jeu, f + 6, octet(jeu, f + 6) + 1);
      x = s16(mot(jeu, f) + balancement(jeu, f) + vent);
    }
    const y = motSigne(jeu, f + 2);
    if (y >= motSigne(jeu, BAS_DE_LA_VUE) - 1) continue;
    const couleur = octet(jeu, COULEURS_DES_FLOCONS + octet(jeu, f + 4));
    if (basse) {
      jeu.appeler(POINT_320, x, y, couleur);
    } else {
      jeu.appeler(MARQUER_ZONE_SALE, x, y, 1, 1);
      jeu.appeler(POINT_640, x, y, couleur);
    }
  }
}

// Le balancement d'un flocon, de 0 à 8 selon sa hauteur : |(y mod 16) − 8|.
function balancement(jeu, f) {
  const b = (mot(jeu, f + 2) & 0xF) - 8;
  return b < 0 ? -b : b;
}

// =================================================================================================
// 0x47E39 — un éclair : (inutilisé, longueur, branches).
//
// 0x47606 l'appelle avec (10, hasard mod 27, 5). L'éclair part du haut de l'écran, à une abscisse
// tirée entre 0 et 639 (en 320x200 aussi : le tracé divise par deux), descend d'abord tout droit de
// 0 à 49 pixels, puis fait `longueur` zigzags : chacun descend de 0 à 19 pixels et s'écarte de −14 à
// +14 (0x481C5). Après chaque zigzag, quatre fois sur dix et tant qu'il reste plus d'une branche à
// donner, une branche part de là : longueur / 2 segments, qui descendent chacun de 0 à 19 pixels et
// s'écartent de 0 à 19 pixels du côté où allait le dernier zigzag. Tout est tracé dans la couleur 0xF2.
//
// Le premier argument est la place où l'original range la moitié de la longueur (son octet bas) :
// sa valeur n'est jamais lue.
function eclair(jeu, _inutilise, longueur, branches) {
  longueur &= 0xFFFF;
  const ligne = (x0, y0, x1, y1) => {
    jeu.appeler(basseResolution(jeu) ? LIGNE_BASSE : LIGNE_HAUTE, s16(x0), s16(y0), s16(x1), s16(y1),
      COULEUR_DE_L_ECLAIR);
  };
  let versLaGauche = false;
  const depart = imod(hasard(jeu), largeur());
  const demiLongueur = (longueur >> 1) & 0xFF;
  let y = imod(hasard(jeu), 50);
  ligne(depart, 0, depart, y);
  let x = depart;
  for (let zigzag = 0; (zigzag & 0xFFFF) < longueur; zigzag++) {
    const yApres = (imod(hasard(jeu), 20) + (y & 0xFFFF)) | 0;
    const xApres = (x + jeu.appeler(ECART_AU_HASARD, 0xF)) | 0;
    ligne(x, y, xApres, yApres);
    versLaGauche = (xApres & 0xFFFF) < (x & 0xFFFF);
    x = xApres;
    y = yApres;
    if (imod(hasard(jeu), 10) >= 4 || (branches & 0xFFFF) <= 1) continue;
    branches = (branches - 1) | 0;
    let bx = x, by = y;
    for (let segment = 0; (segment & 0xFFFF) < demiLongueur; segment++) {
      const byApres = (s16(by) + imod(hasard(jeu), 20)) | 0;
      const ecart = imod(hasard(jeu), 20);
      const bxApres = (versLaGauche ? s16(bx) - ecart : s16(bx) + ecart) | 0;
      ligne(bx, by, bxApres, byApres);
      bx = bxApres;
      by = byApres;
    }
  }
}

// =================================================================================================
// 0x481C5 — un écart au hasard : de 0 à amplitude − 1, négatif neuf fois sur vingt.
function ecartAuHasard(jeu, amplitude) {
  let ecart = imod(hasard(jeu), s16(amplitude));
  if (imod(hasard(jeu), 20) < 9) ecart = -ecart | 0;
  return ecart;
}

// =================================================================================================
// 0x44C91 — retirer la voie d'une attraction : (kiosque de la gare).
//
// La marche est celle de l'évaluation de la voie (0x43689, construire.js) : on part de la case
// voisine du kiosque dans sa direction (+7 et +9 sa case, +0x12 sa direction), et deux marches suivent
// les rails dans les deux sens. Chaque morceau atteint est retiré (0x18B62), et le sol de sa case
// effacé s'il porte le drapeau 0x400 ; la direction suivante croise les directions ouvertes de la
// forme retirée (0xB7B21) avec l'inverse du bit de retour (0xB7B18). Une marche s'arrête sur une case
// sans rail ; elles s'arrêtent toutes deux quand elles se retrouvent sur la même case, après le
// premier morceau.
//
// Le premier morceau est retiré par la première marche : la seconde ne le trouve plus. Revenue sur la
// case de départ sans rien y trouver, une marche reprend donc sa direction d'après la dernière forme
// retirée — au premier tour, celle du premier morceau — et avance sans vérifier que cette direction
// n'est pas nulle (le pas de la direction 0, 0xB4B2A, s'ajoute alors). La dernière forme retirée est
// une variable de l'original jamais initialisée : elle est toujours écrite avant d'être lue, la
// première recherche sur la case de départ trouvant le même morceau que la recherche initiale.
function retirerLaVoie(jeu, kiosque) {
  const depart = (long(jeu, CARTE) + 4 * ((octet(jeu, kiosque + 9) << 6) + octet(jeu, kiosque + 7)
    + motSigne(jeu, VOISINES + 2 * octet(jeu, kiosque + 0x12)))) | 0;
  let morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, depart, RAIL) | 0;
  if (morceau === 0) return;
  const forme = octet(jeu, morceau + 0xC);
  const sens = [octet(jeu, SORTIES_DES_RAILS + 2 * forme), octet(jeu, SORTIES_DES_RAILS + 2 * forme + 1)];
  const ou = [depart, depart];
  let derniereForme = 0;
  let commence = false;              // le premier morceau ne peut pas fermer la boucle
  const directionSuivante = (d) =>
    ~octet(jeu, RETOUR_DES_RAILS + d) & octet(jeu, OUVERTURES_DES_RAILS + derniereForme) & 0xFF;
  const avancer = (m) => { ou[m] = (ou[m] + 4 * motSigne(jeu, PAS_D_UN_MASQUE + 2 * sens[m])) | 0; };

  while (sens[0] + sens[1] !== 0) {
    for (let m = 0; m < 2; m++) {
      if (sens[m] === 0) continue;
      morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, ou[m], RAIL) | 0;
      if (morceau === 0) {
        if (ou[m] !== depart) {
          sens[m] = 0;
        } else {
          sens[m] = directionSuivante(sens[m]);
          avancer(m);
        }
        continue;
      }
      derniereForme = octet(jeu, morceau + 0xC);
      jeu.appeler(RETIRER_L_OBJET, morceau);
      const sol = ou[m] + 2;
      if (octet(jeu, DRAPEAUX_DES_SOLS + 4 * octet(jeu, sol)) & SOL_DE_VOIE) poserOctet(jeu, sol, 0);
      if (ou[0] === ou[1] && commence) return;
      commence = true;
      sens[m] = directionSuivante(sens[m]);
      if (sens[m] !== 0) avancer(m);
    }
  }
}

// =================================================================================================
// 0x19ED3 — la division par zéro (une vitesse nulle) : efface la demande de sortie (0x2DEF8), rend 1.
//
// ANOMALIE REPRODUITE : chaque appel efface la demande de sortie du parc (0xD6688), posée par
// 0x1A836 ou la file des événements (0x2CCF8). Une demande posée puis effacée par un visiteur avant
// que la boucle (0x11C45) la relise serait perdue ; l'effet en partie n'est pas établi.
function divisionParZero(jeu) {
  jeu.appeler(EFFACER_LA_DEMANDE_DE_SORTIE);
  return 1;
}

// =================================================================================================
// VÉRIFICATION
//
// Comparaison appel par appel (moteur/node/comparer.mjs), 0 divergence :
//   ecranDesNouveautes   longue-nouveautes (556 appels), negociations (181)
//   neige                longue-simulation (48), longue-faillite (27), voyous-arrestation (205)
//   eclair               longue-simulation (24), voyous-vandale (24)
//   ecartAuHasard        voyous-vandale (610)
//   retirerLaVoie        longue-simulation (1), longue-faillite (1)
//   divisionParZero      longue-simulation, --echantillon 50 (324 413 appels)
// Rejeu empoisonné (moteur/node/verifier.mjs --empoisonner --modules nouveautes) : IDENTIQUE sur les
// 34 scénarios de travail/verifier-tout.ps1.
export const reecritures = [
  { adresse: 0x3A8EF, nom: 'ecranDesNouveautes', fn: ecranDesNouveautes, arguments: 0 },
  { adresse: 0x47A27, nom: 'neige', fn: neige, arguments: 3 },
  { adresse: 0x47E39, nom: 'eclair', fn: eclair, arguments: 3 },
  { adresse: 0x481C5, nom: 'ecartAuHasard', fn: ecartAuHasard, arguments: 1, retour: true },
  { adresse: 0x44C91, nom: 'retirerLaVoie', fn: retirerLaVoie, arguments: 1, memoire: 'entiere' },
  { adresse: 0x19ED3, nom: 'divisionParZero', fn: divisionParZero, arguments: 0, retour: true },
];

export const enAttente = [];
