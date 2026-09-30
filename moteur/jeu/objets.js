// Les objets du monde : leur dessin.
//
// Tout ce qui se dessine sur la carte du parc — attractions, boutiques, visiteurs, décors — passe
// par une même routine, 0x209B5, qui trace un « objet graphique » : une chaîne de morceaux, chacun
// une image posée à un décalage fixe d'un point de référence. Pour elle, un manège ou une silhouette
// de visiteur ne sont qu'une liste d'images et de décalages ; l'animation consiste à passer d'un
// objet graphique à un autre.
//
// Trois tables, chargées avec les données du jeu (leurs adresses sont rangées en mémoire) :
//
//   objets graphiques [0xD3B80], 8 octets :
//     +0  mot     premier morceau
//     +2  octet   largeur d'emprise   } servent ici à la vue réduite (0x67182), qui ramène
//     +3  octet   hauteur d'emprise   } l'objet à ces dimensions divisées par 0xD6640 et 0xD6642
//     +4  mot     non établi
//     +6  mot     objet graphique suivant d'une animation (lu notamment par 0x1C22A pour le type
//                 0x18, et par la mise à jour des objets du parc, 0x21681, pour le type 0xA)
//   morceaux [0xD3B7C], 10 octets :
//     +0  mot     image : décalage en octets dans la table des images ; 0 = pas d'image
//     +2  mot     décalage horizontal, signé
//     +4  mot     décalage vertical, signé
//     +6  mot     drapeaux du traceur (miroirs, fusion, silhouette : retro-ingenierie.md § 6.5)
//     +8  mot     morceau suivant ; 0 = fin de la chaîne (le morceau 0 n'est qu'une sentinelle)
//   images [0xD3BB8], 6 octets :
//     +0  mot long  adresse des pixels
//     +4  octet     largeur, +5 octet hauteur
//
// Un morceau sans image ne trace rien, mais la chaîne continue après lui. À quoi il sert, non
// établi.
//
// La façon de dessiner, 0xD667C (mot), choisit entre trois tracés :
//   0             le tracé normal, morceau par morceau ;
//   bit 3 (8)     la vue réduite : l'objet entier est confié à 0x67182, qui le trace en miniature,
//                 ramené à son emprise divisée par 0xD6640 et 0xD6642 ;
//   bit 4 (0x10)  le tracé tronqué : chaque image est confiée à 0x11AF4, qui n'en trace qu'une
//                 partie de la hauteur, fixée par le mot 0xD6686.
// Le programme n'écrit jamais que 0 et 8 dans 0xD667C : 0x13BF3, le traitement des touches, la
// bascule avec les diviseurs 3 et 4 (drapeau 0xD7762 ; quelle touche, non établi), 0x3F975 et
// 0x40641 la posent aussi. Il n'écrit jamais rien dans 0xD6686, qui reste à zéro : le tracé tronqué
// est vraisemblablement mort, et ne tracerait rien s'il était atteint. Vue réduite et tracé tronqué
// sont transcrits fidèlement, mais aucun scénario ne les exerce : non vérifiés.
//
// Réécriture lisible des fonctions 0x209B5, 0x20BEB et 0x1C22A.

import { debutDInstallation, finDInstallation } from './animations-intercalees.js';

// --- les données -----------------------------------------------------------------------------------
const OBJETS_GRAPHIQUES = 0xD3B80;  // adresse de la table des objets graphiques
const MORCEAUX = 0xD3B7C;           // adresse de la table des morceaux
const IMAGES = 0xD3BB8;             // adresse de la table des images
const TAILLE_OBJET_GRAPHIQUE = 8, TAILLE_MORCEAU = 10;

const FACON_DE_DESSINER = 0xD667C;  // mot : 0, 8 (vue réduite) ou 0x10 (tracé tronqué)
const VUE_REDUITE = 8, TRACE_TRONQUE = 0x10;
const REDUCTION_LARGEUR = 0xD6640;  // mot : diviseur des largeurs en vue réduite
const REDUCTION_HAUTEUR = 0xD6642;  // mot : diviseur des hauteurs
const HAUTEUR_TRONQUEE = 0xD6686;   // mot signé : hauteur du tracé tronqué ; jamais écrit
const DRAPEAUX_TRACEUR = 0xBECBC;   // mot : drapeaux que le traceur applique à la prochaine image

// Les objets du parc : enregistrements de 200 octets, numérotés à partir de 1, de [0xD3B10] + 200
// à [0xD3B78] exclu.
const OBJETS_DU_PARC = 0xD3B10;     // adresse de la table
const FIN_DES_OBJETS_DU_PARC = 0xD3B78;  // adresse de sa fin
const TAILLE_OBJET_DU_PARC = 200;
//   +2  mot signé  l'objet suivant posé sur la même case ; 0 = fin, négatif = un décor qui clôt
//                  la liste
//   +4  octet      le type (voir dessinerCase)
//   +7, +9 octets  la colonne et la rangée de sa case
//   +A  mot        l'objet graphique qui le représente, pour les types qui le lisent ici
//   +C  octet      un état ou une variante, selon le type
//   +16 mot        selon le type, un genre (fiche d'un catalogue) ou le numéro d'un autre objet

// Les décors fixes : le numéro d'un décor (l'opposé du mot +0 de la case) donne un élément par la
// table de mots 0xB44C1, et l'élément un objet graphique par la table de mots [0xD3B38].
const ELEMENTS_DES_DECORS = 0xB44C1;
const OBJETS_DES_ELEMENTS = 0xD3B38;

const DESIGNER_A_LA_SOURIS = 0xDE5AC;  // mot : non nul, les objets testent s'ils sont sous le pointeur

// --- les fonctions appelées ------------------------------------------------------------------------
const TRACER_IMAGE = 0x5EC9C;           // (x, y, image) : tracé simple
const TRACER_IMAGE_MARQUEE = 0x55BD4;   // (x, y, image) : tracé, et marquage des blocs d'écran touchés
const TRACER_EN_REDUCTION = 0x67182;    // (objet graphique, x, y, largeur, hauteur)
const TRACER_TRONQUEE = 0x11AF4;        // (x, y, image, hauteur)
const DESIGNER_SOUS_LE_POINTEUR = 0x20FF5;  // (objet du parc, x, y)
const DESSINER_OBJET = 0x209B5;         // dessinerObjet, appelée par jeu.appeler comme les autres

const s16 = (v) => (v << 16) >> 16;
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const adresse = (jeu, a) => jeu.dv.getUint32(a, true);
const ecrireMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);

// Division entière du processeur (idiv) : un diviseur nul lève une exception, comme sur la machine.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

function objetGraphique(jeu, index) {
  return adresse(jeu, OBJETS_GRAPHIQUES) + index * TAILLE_OBJET_GRAPHIQUE;
}

// Le morceau numéro n. Le numéro 0 marque la fin d'une chaîne.
function morceau(jeu, n) {
  return adresse(jeu, MORCEAUX) + n * TAILLE_MORCEAU;
}

// L'image d'un morceau, ou 0 s'il n'en porte pas.
function imageDuMorceau(jeu, m) {
  const decalage = mot(jeu, m + 0);
  return decalage === 0 ? 0 : adresse(jeu, IMAGES) + decalage;
}

// Trace un morceau à (x + dx, y + dy). Les coordonnées sont des mots signés : leur somme est
// ramenée à 16 bits, comme dans le programme d'origine.
function tracerMorceau(jeu, m, image, x, y) {
  ecrireMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, m + 6));
  const xm = s16(x + motSigne(jeu, m + 2));
  const ym = s16(y + motSigne(jeu, m + 4));
  // En basse résolution l'écran entier est recopié à chaque tour ; en haute résolution seuls les
  // blocs marqués le sont (ecran.js), d'où le second traceur.
  jeu.appeler(jeu.etat.basseResolution ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE, xm, ym, image);
}

// Vue réduite : l'objet entier, ramené à son emprise divisée par les deux diviseurs.
function tracerEnReduction(jeu, index, objet, x, y) {
  const hauteur = diviser(jeu.m8[objet + 3], mot(jeu, REDUCTION_HAUTEUR));
  const largeur = diviser(jeu.m8[objet + 2], mot(jeu, REDUCTION_LARGEUR));
  jeu.appeler(TRACER_EN_REDUCTION, index, s16(x), s16(y), largeur, hauteur);
}

// Tracé tronqué d'un morceau, ses drapeaux déjà posés. Les coordonnées sont passées sur 16 bits
// non signés (movzx) : c'est ainsi que le programme les empile ici, à la différence du tracé normal.
function tracerMorceauTronque(jeu, m, image, x, y, hauteur) {
  const xm = (x + motSigne(jeu, m + 2)) & 0xFFFF;
  const ym = (y + motSigne(jeu, m + 4)) & 0xFFFF;
  jeu.appeler(TRACER_TRONQUEE, xm, ym, image, hauteur);
}

// 0x209B5 — dessiner l'objet graphique `index` au point (x, y).
//
// L'objet est tracé sur-le-champ, morceau après morceau, dans l'ordre de sa chaîne : ni tri ni
// liste d'attente. C'est donc l'ordre des appels qui fait la profondeur, ce qui est dessiné après
// passant devant. Les drapeaux de chaque morceau sont posés pour le traceur, puis remis à zéro à la
// fin — sauf en vue réduite, qui n'y touche pas.
export function dessinerObjet(jeu, index, x, y) {
  index &= 0xFFFF;
  const objet = objetGraphique(jeu, index);
  const facon = motSigne(jeu, FACON_DE_DESSINER);

  if (facon === 0) {
    for (let n = mot(jeu, objet + 0); n !== 0;) {
      const m = morceau(jeu, n);
      const image = imageDuMorceau(jeu, m);
      if (image !== 0) tracerMorceau(jeu, m, image, x, y);
      n = mot(jeu, m + 8);
    }
    ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
  } else if (facon & VUE_REDUITE) {
    tracerEnReduction(jeu, index, objet, x, y);
  } else if (facon & TRACE_TRONQUE) {
    // La hauteur tracée est ici un pourcentage de celle de chaque image ; une hauteur nulle ne
    // trace rien, mais les drapeaux ont déjà été posés.
    for (let n = mot(jeu, objet + 0); n !== 0;) {
      const m = morceau(jeu, n);
      const image = imageDuMorceau(jeu, m);
      if (image !== 0) {
        ecrireMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, m + 6));
        const hauteur = diviser(motSigne(jeu, HAUTEUR_TRONQUEE) * jeu.m8[image + 5], 100);
        if ((hauteur & 0xFFFF) !== 0) tracerMorceauTronque(jeu, m, image, x, y, s16(hauteur));
      }
      n = mot(jeu, m + 8);
    }
    ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
  }
  // Toute autre valeur : rien n'est tracé, et les drapeaux restent tels quels.
}

// 0x20BEB — dessiner une partie d'un objet graphique : sauter ses `premier` premiers morceaux, et
// tracer au plus `nombre` des suivants.
//
// Ses cinq appels, dans 0x149A4 et 0x1F8F8, visent tous le même objet graphique, l'élément 0xAD de
// la table [0xD3B38] : un jeu de pièces dont on prend une ou quatre à la fois. Dans la démo, 0x1F8F8
// en tire des poteaux à barres rouges et blanches, une pièce parmi quatre variantes pour chacun
// (voir le type 0x14 plus bas).
//
// Les deux compteurs sont des mots : `premier` et `nombre` négatifs valent jusqu'à 65 535 passes.
// Deux anomalies, reproduites : en vue réduite, l'objet est tracé en entier, sans tenir compte de la
// partie demandée ; et le tracé tronqué passe ici 0xD6686 tel quel comme hauteur, au lieu d'en
// faire un pourcentage de celle de l'image comme 0x209B5 (la branche reste vraisemblablement morte).
export function dessinerMorceaux(jeu, index, premier, nombre, x, y) {
  index &= 0xFFFF;
  const objet = objetGraphique(jeu, index);

  let n = mot(jeu, objet + 0);
  for (let aSauter = premier & 0xFFFF; n !== 0 && aSauter !== 0; aSauter = (aSauter - 1) & 0xFFFF) {
    n = mot(jeu, morceau(jeu, n) + 8);
  }

  const facon = motSigne(jeu, FACON_DE_DESSINER);
  if (facon === 0) {
    for (let reste = nombre & 0xFFFF; n !== 0 && reste !== 0; reste = (reste - 1) & 0xFFFF) {
      const m = morceau(jeu, n);
      const image = imageDuMorceau(jeu, m);
      if (image !== 0) tracerMorceau(jeu, m, image, x, y);
      n = mot(jeu, m + 8);
    }
    ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
  } else if (facon & VUE_REDUITE) {
    tracerEnReduction(jeu, index, objet, x, y);
  } else if (facon & TRACE_TRONQUE) {
    for (let reste = nombre & 0xFFFF; n !== 0 && reste !== 0; reste = (reste - 1) & 0xFFFF) {
      const m = morceau(jeu, n);
      const image = imageDuMorceau(jeu, m);
      if (image !== 0) {
        ecrireMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, m + 6));
        tracerMorceauTronque(jeu, m, image, x, y, motSigne(jeu, HAUTEUR_TRONQUEE));
      }
      n = mot(jeu, m + 8);
    }
    ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
  }
}

// Où poser un objet sur sa case. Le point (x, y) reçu est le coin haut gauche de la case, et le
// programme y ajoute des décalages écrits en dur pour chacun des deux modes d'affichage (tuiles de
// 48x32 en basse résolution, 24x16 en haute) ; seul L/2 est calculé, depuis la largeur de tuile L.
// Numériquement :
//   - un décor est posé au centre de la case, (L/2 + L/6, H/2) : la moitié de la tuile, plus la
//     moitié du décalage oblique d'un tiers de tuile par rangée (retro-ingenierie.md § 5.1) ;
//   - les toilettes, comme ce que dessine 0x1C5E9, au milieu du bord bas, (L/2 + L/3 − 1, H − 1).
// Le mode est ici comparé à 8 (`cmp word [0xDE5F6], 8`), et non testé bit à bit.
function pointDuDecor(jeu, x, y) {
  const haute = jeu.etat.modeAffichage === 8;
  const dx = (jeu.etat.largeurTuile >> 1) + (haute ? 4 : 8);
  const dy = haute ? 8 : 16;
  return [s16(x + dx), s16(y + dy)];
}

function decalagesDuBordBas(jeu) {
  const haute = jeu.etat.modeAffichage === 8;
  return [(jeu.etat.largeurTuile >> 1) + (haute ? 7 : 15), haute ? 15 : 31];
}

// 0x1C22A — dessiner ce qui est posé sur une case de la carte.
//
// `contenu` est le mot +0 de la case (retro-ingenierie.md § 6.2) : 0 = rien ; négatif = un décor
// fixe ; positif = le premier d'une liste d'objets du parc chaînés par leur mot +2, dessinés dans
// l'ordre. La liste s'arrête sur 0, ou sur un décor, dessiné en dernier.
//
// Chaque objet du parc est confié à la routine de son type, avec son adresse et le coin de la case.
// Ce que sont ces types a été établi d'après les champs que lisent les routines, les catalogues
// qu'ils désignent (relus en mémoire pendant la démo), et des images de la démo où seuls les pixels
// tracés pour un type restent en couleur :
//
//   2     0x1C9E2  les visiteurs (vu sur image ; 92 dans le parc de la démo).
//   4     0x1D87A  les attractions (vu sur image : des tasses, un manège tournant…). Le mot +16 désigne
//                  la fiche du genre dans le catalogue 0xCCED0 (fiches de 200 octets, nom en tête :
//                  BIG WHEEL, HAUNTED HOUSE, ROLLER COASTER, BOUNCY CASTLE…).
//   6     0x1C5E9  un kiosque rattaché à une attraction, dont le mot +16 est le numéro. Il porte une
//                  enseigne qui fait défiler le nom du genre et un nombre en dixièmes (octet +C6 de
//                  la fiche, sens non établi). Un par attraction dans la démo, deux (6 ou 0x1C) pour
//                  les attractions à voie. Vraisemblablement l'entrée de l'attraction : non établi.
//   8     0x1E9A7  le personnel. L'octet +59 désigne le métier dans le catalogue 0xD35EC (fiches de
//                  0x36 octets, nom à +A) : MECHANIC, HANDYMAN, GUARD, et les amuseurs costumés
//                  CHICKEN_MAN, TEDDY MAN, RHINO MAN, SQUID MAN, STRONG MAN (vus sur image).
//   0xA   0x1ECD6  les boutiques et les stands (vu sur image). Le mot +16 vaut 107 fois le genre,
//                  fiche du catalogue 0xD3C86 (fiches de 107 octets, famille 1, 2, 4 ou 8 en tête,
//                  nom à +47 : BIG TIME FRIES, POKEY COLA, SALOON, GIFT SHOP, DUCK SHOOT…).
//   0xE   0x1DD27  les véhicules : le bus qui dépose les visiteurs (vu sur image) et les wagons des
//                  attractions à voie, chaînés sur les cases de la voie.
//   0x12  0x1F205  les morceaux de voie des attractions à voie (vu sur image : les boucles des
//                  montagnes russes) ; l'octet +C en donne la forme. 124 dans la démo.
//   0x14  0x1F8F8  selon l'état (octet +C) : 6, l'entrée du parc (vu sur image : le portique, dont
//                  l'enseigne fait défiler le nom du parc, et ses guérites) ; 8, jusqu'à trois
//                  poteaux à barres rouges et blanches, pièces de l'élément 0xAD tracées par
//                  0x20BEB (vus sur image ; ce qu'ils sont, non établi) ; 2, un objet graphique
//                  animé à chaque tracé ; sinon, son objet graphique +A. Dans l'état 6, 0x1F8F8
//                  rappelle 0x1C22A pour la case située quatre colonnes à droite ou à gauche quand
//                  elle tombe hors de l'écran : cette fonction est donc réentrante.
//   0x18  ici même les toilettes (vu sur image : cabines roses et bleues aux symboles femme et
//                  homme). Voir dessinerToilettes.
//   0x1A  0x1C90B  non établi : un objet placé finement dans sa case (octets +6 et +8), tracé dans
//                  les états 1 à 10 seulement. Aucun dans la démo.
//   0x1C  0x1C5E9  comme 6 ; ce qui les distingue, non établi.
//   autre          rien n'est dessiné.
//
// Vérification : la démo (moteur/scenarios/demo.json, 140 s) exerce les types 2, 4, 6, 8, 0xA, 0xE,
// 0x12, 0x14, 0x1C et les décors ; les toilettes n'y paraissent qu'entre 206 et 256 s, et seuls un
// rejeu de 600 s et une comparaison de 260 s les exercent. parc.json et ecrans.json exercent la
// haute résolution et la réentrance par 0x1F8F8. Le type 0x1A n'apparaît dans aucun scénario : non
// vérifié.
//
// Le coin de la case arrive sur 16 bits (le dessin de la carte l'empile par movzx) et peut être
// négatif : il est relu comme mot, et passé signé (movsx) à la plupart des routines, mais non signé
// (movzx) à 0x1C5E9.
//
// Ni cette fonction ni 0x209B5 ne rendent de valeur, mais le programme d'origine laisse dans eax des
// restes de calcul (moitié haute de l'adresse du dernier objet, adresse de la table des morceaux,
// ou ce que rend la routine appelée en dernier), dont le dessin de la carte relit la moitié haute
// (0x1BF9B : `mov ax, [0xD663A]` puis `sub dword [ebp-4], eax`). Elle n'atteint que la moitié haute
// d'une variable locale lue ensuite sur 16 bits : sans effet, donc non reproduite.
export function dessinerCase(jeu, contenu, x, y) {
  let id = s16(contenu);
  while (id > 0) {
    const objet = adresse(jeu, OBJETS_DU_PARC) + id * TAILLE_OBJET_DU_PARC;
    switch (jeu.m8[objet + 4]) {
      case 0x02: jeu.appeler(0x1C9E2, objet, s16(x), s16(y)); break;           // visiteur
      case 0x04: jeu.appeler(0x1D87A, objet, s16(x), s16(y)); break;           // attraction
      case 0x06: jeu.appeler(0x1C5E9, objet, x & 0xFFFF, y & 0xFFFF); break;   // kiosque d'attraction
      case 0x08: jeu.appeler(0x1E9A7, objet, s16(x), s16(y)); break;           // personnel
      case 0x0A: jeu.appeler(0x1ECD6, objet, s16(x), s16(y)); break;           // boutique
      case 0x0E: jeu.appeler(0x1DD27, objet, s16(x), s16(y)); break;           // véhicule
      case 0x12: jeu.appeler(0x1F205, objet, s16(x), s16(y)); break;           // morceau de voie
      case 0x14: jeu.appeler(0x1F8F8, objet, s16(x), s16(y)); break;           // entrée du parc, poteaux
      case 0x18: dessinerToilettes(jeu, objet, x, y); break;
      case 0x1A: jeu.appeler(0x1C90B, objet, s16(x), s16(y)); break;           // non établi
      case 0x1C: jeu.appeler(0x1C5E9, objet, x & 0xFFFF, y & 0xFFFF); break;   // comme 6
      default: break;
    }
    id = motSigne(jeu, objet + 2);
  }
  if (id < 0) {
    // Un décor fixe (arbres, lampadaires… vus sur image) : son numéro mène à un objet graphique.
    const element = mot(jeu, ELEMENTS_DES_DECORS + -id * 2);
    const index = mot(jeu, adresse(jeu, OBJETS_DES_ELEMENTS) + element * 2);
    const [xd, yd] = pointDuDecor(jeu, x, y);
    jeu.appeler(DESSINER_OBJET, index, xd, yd);
  }
}

// Le type 0x18, les toilettes, dessiné sur place, au milieu du bord bas de sa case. Exercé seulement
// au-delà de 206 s de démo (voir plus haut).
//
// Quand les objets doivent tester s'ils sont sous le pointeur de la souris (0xDE5AC non nul), et
// que les toilettes sont dans l'état 2 (octet +C), 0x20FF5 compare la position du pointeur au
// rectangle qu'occupent leurs images et, selon l'outil en cours (0xD6670), les retient comme objet
// désigné (0xD6678). Les coordonnées lui sont passées non signées. Aucun scénario n'y passe (0xDE5AC
// reste nul pendant la démo) : non vérifié.
//
// Tous les 16 pas de simulation, elles passent à l'objet graphique suivant de leur animation (mot
// +6 de la table des objets graphiques) ; l'objet graphique courant est gardé dans leur mot +A.
function dessinerToilettes(jeu, objet, x, y) {
  if (motSigne(jeu, DESIGNER_A_LA_SOURIS) !== 0 && jeu.m8[objet + 0xC] === 2) {
    const [dx, dy] = decalagesDuBordBas(jeu);
    jeu.appeler(DESIGNER_SOUS_LE_POINTEUR, objet, (x + dx) & 0xFFFF, (y + dy) & 0xFFFF);
  }
  if ((jeu.etat.pasDeSimulation & 0xF) === 0) {
    ecrireMot(jeu, objet + 0xA, mot(jeu, objetGraphique(jeu, mot(jeu, objet + 0xA)) + 6));
  }
  const [dx, dy] = decalagesDuBordBas(jeu);
  // Hors du jeu d'origine : les animations intercalées relèvent, en lecture seule, ce que la fontaine
  // recouvre (animations-intercalees.js). Réglage éteint, rien.
  debutDInstallation(jeu, objet, s16(x + dx), s16(y + dy));
  jeu.appeler(DESSINER_OBJET, mot(jeu, objet + 0xA), s16(x + dx), s16(y + dy));
  finDInstallation(jeu);
}

// Ce que 0x1C22A écrit hors des zones que le comparateur relève par défaut : la table des objets du
// parc, dans le tas. Les routines de dessin y écrivent — 0x1C5E9 fait avancer tous les 8 pas
// l'enseigne défilante de l'attraction (octet +BB), les toilettes y gardent leur image courante
// (mot +A) — et la réécriture doit repartir du même état que la transcription.
function tableDesObjetsDuParc(jeu) {
  return [adresse(jeu, OBJETS_DU_PARC), adresse(jeu, FIN_DES_OBJETS_DU_PARC)];
}

export const reecritures = [
  { adresse: 0x209B5, nom: 'dessinerObjet', fn: dessinerObjet, arguments: 3 },
  { adresse: 0x20BEB, nom: 'dessinerMorceaux', fn: dessinerMorceaux, arguments: 5 },
  { adresse: 0x1C22A, nom: 'dessinerCase', fn: dessinerCase, arguments: 3,
    zones: (jeu) => [tableDesObjetsDuParc(jeu)] },
];
