// La barre des messages du parc, le conseiller, et les catalogues surgissants.
//
// Réécriture lisible des fonctions 0x5CBDB, 0x5E2C5 et 0x6BF89 du jeu d'origine. Chaque constante
// vient du programme de 1994 ; `moteur/node/comparer.mjs` et `moteur/node/verifier.mjs` prouvent que
// le comportement est identique (voir en fin de fichier).
//
// --- Ce que le joueur voit -----------------------------------------------------------------------
//
// Au-dessus de la barre d'outils, une bande étroite porte un texte : c'est la **barre des messages**
// (zone 30 de la table des zones, interface-parc.js). Elle sert à deux choses, et c'est la même
// fonction, 0x5CBDB, appelée à chaque image par la boucle du parc (0x11C45) et par le clavier
// (0x13BF3), qui décide laquelle :
//
//  - **les infobulles** : au survol d'un bouton, d'un réglage ou d'un objet du parc, le survol
//    (0x149A4) pose dans le mot 0xD661E le numéro du texte à montrer, et la barre le met en forme
//    depuis la table [0xD7BC8] puis remet 0xD661E à zéro ;
//  - **le conseiller** : à défaut d'infobulle, la barre cherche dans une liste de 34 remarques
//    (table 0xBA144) la première dont la condition est remplie — « vos visiteurs sont ravis », « il
//    vous manque des attractions », « la boutique X n'a plus de stock »… — et l'affiche. Le joueur
//    coupe le conseiller par la touche `/` (menu OPTIONS ▸ CONSEILLER, octet 0xD778D) ; il est
//    rallumé à chaque entrée dans le parc (0x12452). Coupé, la barre ne montre plus rien du tout,
//    infobulles comprises.
//
// C'est 0x5E2C5 qui dessine : le fond de la bande, puis, s'il y a un texte, une **bulle** en bas de
// l'écran (un capuchon, autant de segments qu'il faut, un capuchon) et le texte dedans, coupé aux
// espaces sur plusieurs lignes.
//
// 0x6BF89, appelée elle aussi à chaque image, dessine les **catalogues surgissants** : les panneaux
// qu'ouvre le clic droit sur une icône de la barre d'outils (0x6B9CB, docs/retro-ingenierie.md
// § 11), une grille d'articles avec leur image, leur prix et, s'il y en a, le nombre possédé. Le plus
// souvent il n'y en a aucun d'ouvert et la fonction ne fait rien.
//
// --- Le conseiller, sa table et sa cadence -------------------------------------------------------
//
// La table 0xBA144, 34 entrées de 12 octets, terminée par un genre nul. L'ordre est l'ordre de
// priorité : la première remarque dont la condition est remplie l'emporte.
//
//   +0   mot    le genre de la remarque, 1 à 0x23 ; il choisit à la fois la condition (un cas de
//               l'aiguillage) et le texte, [[0xD7BBC] + 4 × genre]
//   +2   octet  lu par personne ; vraisemblablement un groupe (les genres qui se ressemblent le
//               partagent) — non établi
//   +3   mot    le poids de la temporisation : 5 partout, 3 pour le genre 2, 2 pour les infobulles
//   +5   mot    la durée : 500 pas de simulation, 430 pour les infobulles
//   +7   octet  le nombre de fois que la remarque a été montrée
//   +8   mot long  le pas de simulation du dernier affichage
//
// Les genres dans l'ordre de la table : 1, 3, 2, 4, 5, 6, 7, 8, 0x10, 9, **0xC** (les infobulles),
// 0xD, 0x11, 0x12, 0x1A, 0xB, 0xA, 0x1D, 0x1E, 0x15, 0xE, 0x1B, 0x1C, 0x13, 0x21, 0x22, 0x17, 0x14,
// 0x23, 0x20, 0x18, 0x19, 0x1F, 0x16. Les infobulles ne viennent qu'en onzième : dix remarques du
// conseiller passent avant elles.
//
// Les genres 4 et 5 ont un cas vide, le genre 0x21 un cas qui compare sans rien en faire, et le
// genre 1 tombe hors de l'aiguillage (1 − 2 = 0xFFFF > 0x21) : quatre remarques muettes.
//
// La cadence. Chaque entrée retient quand elle a été montrée (+8) et combien de fois (+7) :
//
//  - la remarque en cours (mot 0xD661C) est remontrée telle quelle tant qu'elle a moins de 200 pas ;
//    passé sa durée (+5), elle est oubliée ;
//  - une autre entrée déjà montrée mute le conseiller pour un temps : si
//    (+3) × (+7) × 1 024 / (pas écoulés) dépasse 20, le parcours s'arrête là et la barre reste vide.
//    Avec +3 = 5, une remarque montrée une fois impose 256 pas de silence, deux fois 512, et ainsi
//    de suite : le conseiller se tait de plus en plus.
//
// **Anomalie reproduite** : quand la remarque en cours a dépassé sa durée, le programme l'oublie
// (0xD661C = −1) puis saute directement à l'aiguillage **sans avoir donné de valeur à son indice de
// parcours** ([ebp-0x18]). Il lit donc dans la table à un rang pris dans les restes de la pile, et
// continue le parcours à partir de là. La réécriture lit le même emplacement de pile.
//
// --- Les infobulles (genre 0xC) ------------------------------------------------------------------
//
// Le mot 0xD661E porte le numéro du texte, de 1 à 0x25 ; la table [0xD7BC8] donne le texte. La
// plupart se recopient tels quels ; quelques-uns dépendent de l'objet désigné (mot 0xD6678, un objet
// du parc de 200 octets depuis [0xD3B10], son type à +4) :
//
//   numéro      ce qui est fait
//   1 à 0xF     recopie du texte (les boutons de la barre d'outils, les bords, le mode question…)
//   0x10        « … (%d) » avec le solde du joueur, mot long +0xA de sa fiche : l'argent
//   0x11, 0x12  recopie, mais seulement si l'objet désigné est une attraction (type 4) ; sinon la
//               fonction **sort sans rien dessiner**, la barre garde ce qu'elle avait
//   0x13        le nom de l'objet désigné, avec un texte par type : 0x13 une attraction (nom pris
//               dans [0xD7BD0] par 0xCCEF2 + son genre), 0x14 un visiteur (type 2), 0x15 une
//               boutique (type 0xA), 0x16 un employé (type 8, son métier). Tout autre type laisse le
//               tampon **tel quel** : la barre répète le dernier message
//   0x14 à 0x16 recopie
//   0x17, 0x18  un employé (type 8) : texte 0x18 s'il est mécanicien (métier 8), sinon sortie sans
//               rien ; une attraction (type 4) : texte 0x17 (la sécurité) ; autre : sortie
//   0x19, 0x1A  un employé : texte 0x1A avec son métier (« déplacer ») ; une attraction : le texte
//               du numéro lui-même (ouvrir ou fermer) ; autre : sortie
//   0x1B        recopie, si l'objet désigné est une attraction ; sinon sortie
//   0x1C et au-delà  recopie (jusqu'à 0x25, le zoom sur l'employé suivant)
//
// --- Les catalogues surgissants (0x6BF89) --------------------------------------------------------
//
// Les catalogues ouverts forment une liste chaînée : le mot 0xB14BB donne le premier (−1 : aucun),
// et chaque fiche, 0x24F octets depuis 0xD6BCE, porte le suivant à +0x24B.
//
//   +0, +2        mots : le coin haut gauche à l'écran
//   +4, +6        mots : la largeur et la hauteur
//   +0xA + 13 × k  l'article de rang k : +0 mot son nom ([0xD7BD0]), +2 mot son image, +4 mot long
//                 son prix, +0xB octet des drapeaux (bit 0 : mis en valeur), +0xC octet un nombre
//   +0x212, +0x214  mots : le pas de la grille, en largeur et en hauteur
//   +0x216        octet : le format de la grille, rang dans la table 0xB5094 (3 octets : nombre
//                 d'articles au plus, colonnes, lignes). Le format 0 (une seule case) sert de
//                 catalogue **replié** : seule la barre de titre est dessinée
//   +0x221        le titre du catalogue, une chaîne
//   +0x24D        mot : l'article désigné par le pointeur ; négatif, c'est un des boutons du cadre
//                 (−1 le coin haut gauche, −2 la barre de titre, −3 le coin haut droit, −4 le bas,
//                 −5 le coin bas droit, −7 la flèche de gauche), que la fonction met en valeur
//
// Le titre montre le nom de l'article désigné quand il y en a un, et le nom du catalogue sinon.
// Chaque image finit par 0x6BCDA, qui reprend le format d'après le nombre d'articles.

import { dansLeCadre } from './cadre.js';
import { ecran } from './grande-vue.js';

// --- Accès à la mémoire ---------------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// Division entière signée du processeur (idiv), tronquée vers zéro ; un diviseur nul lève une
// exception, comme sur la machine.
function idiv(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}
// Division non signée (div).
function udiv(a, b) {
  if ((b >>> 0) === 0) throw new Error('division par zero');
  return ((a >>> 0) / (b >>> 0)) | 0;
}

// --- Le cadre de pile ------------------------------------------------------------------------------
//
// Ces trois fonctions passent à celles qu'elles appellent l'adresse de tampons pris dans leurs
// variables locales (les textes qu'on compose avant de les écrire), et 0x5CBDB lit une variable
// qu'elle n'a pas écrite. La réécriture ouvre donc le même cadre que l'original : ebx, esi, edi et
// ebp empilés, puis `enter taille, 0` ; ebp désigne le cadre et le pointeur de pile descend sous les
// variables locales, là où l'original appelait. Les tampons sont ainsi aux mêmes adresses, et les
// restes de pile se lisent au même endroit. La classe `Cadre` est dans moteur/jeu/cadre.js.

// --- Les variables du jeu ---------------------------------------------------------------------------
const CONSEILLER = 0xD778D;          // octet : 0 = le conseiller (et la barre) coupés, touche `/`
const SEQUENCE = 0xBA0F8;            // octet signé : négatif hors séquence (etat.js, 0x59C85)
const REMARQUES = 0xBA144;           // la table du conseiller, 12 octets par remarque
const TAILLE_REMARQUE = 12;
const REMARQUE_COURANTE = 0xD661C;   // mot signé : le rang de la remarque affichée, −1 = aucune
const INFOBULLE = 0xD661E;           // mot : le numéro du texte à afficher (interface-parc.js)
const TAMPON = 0xCE7D0;              // le texte mis en forme, lu par 0x5E2C5
const TEXTES_DU_CONSEILLER = 0xD7BBC; // pointeur : 4 octets par genre de remarque
const TEXTES_DES_INFOBULLES = 0xD7BC8; // pointeur : 4 octets par numéro d'infobulle
const NOMS = 0xD7BD0;                // pointeur : la table des noms (attractions, métiers, stocks…)
const NOMS_DES_JOUEURS = 0xD7B98;    // pointeur : la table des noms de joueur

const PAS_DE_SIMULATION = 0xD3AFC;   // mot long non signé : 1 000 pas par mois
const FICHES_DES_JOUEURS = 0xD3B00;  // pointeur : fiches de 0x222 octets
const TAILLE_FICHE = 0x222;
const FICHES_DES_PARCS = 0xCF1E0;    // fiches de 0x250 octets
const TAILLE_PARC = 0x250;
const FICHE_COURANTE = 0xD3808;      // pointeur : la fiche du joueur courant
const COMPTES = 0xD3814;             // pointeur : les comptes du parc du joueur courant
const PARC_COURANT = 0xD3818;        // pointeur : la fiche de son parc
const OBJETS = 0xD3B10;              // pointeur : les objets du parc, 200 octets chacun
const FIN_DES_OBJETS = 0xD3B78;      // pointeur
const TAILLE_OBJET = 200;
const OBJET_CHOISI = 0xD6678;        // mot : l'objet du parc désigné (interface-parc.js)

const ATTRACTIONS = 0xCCED0;         // fiches d'attraction, 200 octets ; 0xCCEF2 le mot +0x22, le nom
const NOM_DE_L_ATTRACTION = 0xCCEF2;
const TAILLE_ATTRACTION = 200;
const BOUTIQUES = 0xD3C62;           // fiches de boutique, 0x6B octets ; 0xD3C84 le mot +0x22, le nom
const NOM_DE_LA_BOUTIQUE = 0xD3C84;
const TAILLE_BOUTIQUE = 0x6B;
const STOCKS = 0xD3C00;              // fiches de stock, 0xE octets ; 0xD3C04 le mot +4
const TAILLE_STOCK = 0xE;
const EMPLOYES = 0xD35E2;            // fiches d'employé, 0x36 octets ; 0xD35EC le mot +0xA, le métier
const METIER_DE_L_EMPLOYE = 0xD35EC;
const TAILLE_EMPLOYE = 0x36;
const PRIX_DES_STOCKS = 0xB7930;     // un mot par pays : le prix de référence d'un stock

const MODE_AFFICHAGE = 0xDE5F6;      // mot : 1 = 320x200, 8 = 640x480
const ZONE_DE_LA_BARRE_D_OUTILS = 0xB93F5;  // mot : l'ordonnée du haut de la barre d'outils (zone 4)
const BARRE_X = 0xD6612, BARRE_Y = 0xD6616; // mots : le coin de la barre des messages
const IMAGES_DU_PANNEAU = 0xD3B54;   // pointeur : +0x78 le fond de la barre, +0x1BC… les coins
const IMAGES_DE_LA_BULLE = 0xD3B68;  // pointeur : +0x1E6, +0x1EC, +0x1F2 les trois morceaux
const COULEUR_DU_TEXTE = 0xD7773;    // octets posés par 0x12452 (dessin-objets.js)
const COULEUR_DU_NOMBRE = 0xD777A;
const COULEUR_DE_L_ARTICLE = 0xD777C;

const CATALOGUES = 0xD6BCE;          // fiches de catalogue surgissant, 0x24F octets
const TAILLE_CATALOGUE = 0x24F;
const PREMIER_CATALOGUE = 0xB14BB;   // mot signé : −1 = aucun
// 3 octets par format de grille : le nombre d'articles au plus, les colonnes, les lignes. Les quinze
// formats vont de 1 × 1 à 10 × 10 ; c'est 0x6BCDA qui choisit le premier assez grand.
const FORMATS_DES_COLONNES = 0xB5095;
const FORMATS_DES_LIGNES = 0xB5096;
const FORMAT_NOMBRE = 0xB06E0;       // « %d »
const FORMAT_TEXTE = 0xB06E3;        // « %s »

// --- Les fonctions appelées --------------------------------------------------------------------------
const SEQUENCE_DU_PARC = 0x59C85;    // ce que la barre laisse faire pendant une séquence
const DESSINER_LA_BARRE = 0x5E2C5;   // ce module
const SPRINTF = 0x7F652;
const STRCPY = 0x7E1ED;
const STRLEN = 0x7E822;
const TRACER_IMAGE = 0x5EC9C;        // (x, y, image) — basse résolution
const TRACER_IMAGE_MARQUEE = 0x55BD4; // (x, y, image) — haute résolution
const TRACER_IMAGE_TRANSPARENTE = 0x20F4C;  // (x, y, image, ?)
const ECRIRE_320 = 0x80E88, ECRIRE_640 = 0x80F34;  // (x, y, texte, couleur) — dessin-objets.js
const RECTANGLE = 0x1188C;           // (x, y, largeur, hauteur, couleur)
const CADRE_CREUX = 0x3E34E;         // (x0, y0, x1, y1, couleur) — fenetres.js
const TEXTE_A_GAUCHE = 0x3F49E;      // (x, y, texte, ?, couleur) — fenetres.js
const TEXTE_CENTRE = 0x3F377;        // (x0, x1, y, texte, ?, couleur)
const LARGEUR_DU_TEXTE = 0x3F677;    // (texte) : sa largeur en pixels
const IMAGE_DANS_UN_CADRE = 0x3EF1D;  // (x0, y0, x1, y1, image) — fenetres.js
const LIGNE_320 = 0x949BC, LIGNE_640 = 0x949DA;  // (x0, y0, x1, y1, couleur)
const REGLER_LE_CATALOGUE = 0x6BCDA;  // (rang) : reprend le format de la grille

// Les trois morceaux de la bulle et le fond de la barre sont des images de 6 octets : 4 octets de
// pixels, puis la largeur et la hauteur (dessin-carte.js).
const LARGEUR_DE_L_IMAGE = 4, HAUTEUR_DE_L_IMAGE = 5;

// =====================================================================================================
// 0x5CBDB — la barre des messages : l'infobulle du moment, ou la remarque du conseiller.
//
// Appelée à chaque image par la boucle du parc (0x11C45) et à la fin de chaque touche (0x13BF3).
//
// Le conseiller coupé, rien n'est dessiné du tout. Pendant une séquence (l'octet 0xBA0F8 positif),
// c'est 0x59C85 qui prend la barre à son compte. Sinon, on parcourt la table des remarques dans
// l'ordre, et la première dont la condition est remplie compose son texte dans 0xCE7D0 ; 0x5E2C5
// dessine ensuite la barre, vide si rien n'a été trouvé.
export const barreDesMessages = dansLeCadre(0x64, (jeu, cadre) => {
  // Les deux boutiques que retiendra le genre 0x1D sont posées à « aucune » dès l'entrée, avant même
  // le test du conseiller : le genre 0x1E les relit, et il faut qu'il y trouve 0xFF si le genre 0x1D
  // n'a pas tourné dans le même appel.
  poserOctet(jeu, cadre.local(0xC), 0xFF);
  poserOctet(jeu, cadre.local(4), 0xFF);

  if (octet(jeu, CONSEILLER) === 0) return;
  if (octetSigne(jeu, SEQUENCE) >= 0) { jeu.appeler(SEQUENCE_DU_PARC); return; }

  // Le programme compare ici la position du pointeur aux bords de la barre des messages sans rien
  // faire du résultat : un `if` au corps vide, que la réécriture ne reprend pas.

  let tampon = 0;                                                  // [ebp-0x28]
  const fiche = (long(jeu, FICHES_DES_JOUEURS) + octet(jeu, long(jeu, COMPTES) + 0x40) * TAILLE_FICHE) >>> 0;
  const parc = (FICHES_DES_PARCS + mot(jeu, fiche + 2) * TAILLE_PARC) >>> 0;

  // L'indice de parcours. Sur le chemin de la remarque expirée (ci-dessous), l'original ne lui donne
  // aucune valeur et lit ce que la pile portait là : la réécriture lit le même emplacement.
  let i = long(jeu, cadre.local(0x18));                            // [ebp-0x18]
  let versLAiguillage = false;

  const courante = motSigne(jeu, REMARQUE_COURANTE);
  if (courante >= 0) {
    const age = (long(jeu, PAS_DE_SIMULATION) - long(jeu, REMARQUES + courante * TAILLE_REMARQUE + 8)) >>> 0;
    if (age < 200) {
      // Moins de 200 pas : la même remarque est remontrée telle quelle.
      i = (age & 0xFFFF0000) | mot(jeu, REMARQUE_COURANTE);
      versLAiguillage = true;
    } else if (age >= mot(jeu, REMARQUES + courante * TAILLE_REMARQUE + 5)) {
      // Anomalie reproduite : la remarque est oubliée, puis le programme saute à l'aiguillage avec
      // l'indice laissé dans la pile. Il lit donc la table à un rang quelconque et poursuit de là.
      poserMot(jeu, REMARQUE_COURANTE, 0xFFFF);
      versLAiguillage = true;
    }
  }
  if (!versLAiguillage) i = 0;

  // Le parcours. `versLAiguillage` dit qu'on entre dans le corps sans passer par le test de fin ni
  // par la temporisation : c'est le `goto` du programme d'origine.
  for (;;) {
    if (!versLAiguillage) {
      const genre = mot(jeu, REMARQUES + u16(i) * TAILLE_REMARQUE);
      if (genre === 0) break;                                      // fin de la table : rien à dire
      if (u16(i) === motSigne(jeu, REMARQUE_COURANTE)) {
        // C'est la remarque en cours : elle passe, fraîche ou non (les deux chemins se rejoignent).
      } else {
        const montree = long(jeu, REMARQUES + u16(i) * TAILLE_REMARQUE + 8);
        if (montree !== 0 && long(jeu, PAS_DE_SIMULATION) > montree) {
          const poids = Math.imul(mot(jeu, REMARQUES + u16(i) * TAILLE_REMARQUE + 3)
            * octet(jeu, REMARQUES + u16(i) * TAILLE_REMARQUE + 7), 1024);
          // Plus la remarque a déjà servi, plus longtemps le conseiller se tait — pour toutes.
          if (udiv(poids, (long(jeu, PAS_DE_SIMULATION) - montree) >>> 0) > 20) {
            jeu.appeler(DESSINER_LA_BARRE, tampon);
            return;
          }
        }
      }
    }
    versLAiguillage = false;

    const rang = (mot(jeu, REMARQUES + u16(i) * TAILLE_REMARQUE) - 2) & 0xFFFF;
    let trouvee = false;
    if (rang <= 0x21) {
      const issue = remarque(jeu, cadre, rang + 2, u16(i), fiche, parc);
      if (issue === SORTIR) return;                                // la barre garde ce qu'elle avait
      trouvee = issue === AFFICHER;
    }
    if (trouvee) {
      tampon = TAMPON;
      poserMot(jeu, INFOBULLE, 0);
      if (u16(i) !== motSigne(jeu, REMARQUE_COURANTE)) {
        poserMot(jeu, REMARQUE_COURANTE, u16(i));
        poserOctet(jeu, REMARQUES + u16(i) * TAILLE_REMARQUE + 7,
          octet(jeu, REMARQUES + u16(i) * TAILLE_REMARQUE + 7) + 1);
        poserLong(jeu, REMARQUES + u16(i) * TAILLE_REMARQUE + 8, long(jeu, PAS_DE_SIMULATION));
      }
      break;
    }
    i = (i + 1) | 0;
  }

  jeu.appeler(DESSINER_LA_BARRE, tampon);
});

// Les trois issues d'un cas de l'aiguillage : rien à dire et on passe à la remarque suivante, le
// texte est composé et il faut l'afficher, ou (les infobulles seules) on sort sans rien dessiner.
const SUIVANTE = 0, AFFICHER = 1, SORTIR = 2;

// Un cas de l'aiguillage : la condition du genre, et le texte qu'il compose dans 0xCE7D0.
function remarque(jeu, cadre, genre, i, fiche, parc) {
  const comptes = long(jeu, COMPTES);
  const texte = () => long(jeu, long(jeu, TEXTES_DU_CONSEILLER) + 4 * mot(jeu, REMARQUES + i * TAILLE_REMARQUE));
  const nom = (n) => long(jeu, long(jeu, NOMS) + 4 * n);
  const dire = (...arguments_) => {
    jeu.appeler(SPRINTF, TAMPON, texte(), ...arguments_);
    return AFFICHER;
  };
  // Le parc ouvert et pourvu d'attractions : la condition commune aux remarques sur l'humeur.
  const parcEnMarche = () => octet(jeu, parc + 0x18) !== 0 && octet(jeu, parc + 0x82) !== 0;
  // L'attrait du prix d'entrée en pour cent, posé par 0x67CD4 (simulation.js) : la mesure sur
  // laquelle le conseiller juge l'humeur des visiteurs.
  const attrait = () => motSigne(jeu, comptes + 0x2C0);
  const humeur = (bas, haut) => (attrait() >= bas && attrait() <= haut && parcEnMarche()) ? dire() : SUIVANTE;

  switch (genre) {
    // --- 2 : un concurrent vient d'acheter des actions de votre parc ------------------------------
    // 0x53D2B (economie.js) note, dans les comptes, le pas de l'achat (+0x638), le concurrent
    // (+0x637) et la part qu'il détient désormais, en pour cent (+0x63C). La remarque nomme le
    // concurrent — son nom est le texte [[0xD7B98] + 4 × l'octet +1 de sa fiche — et donne la part,
    // pendant les mille pas (un mois) qui suivent.
    case 2: {
      if (((long(jeu, PAS_DE_SIMULATION) - long(jeu, comptes + 0x638)) >>> 0) >= 1000) return SUIVANTE;
      const autre = (long(jeu, FICHES_DES_JOUEURS) + octet(jeu, comptes + 0x637) * TAILLE_FICHE) >>> 0;
      return dire(long(jeu, long(jeu, NOMS_DES_JOUEURS) + 4 * octet(jeu, autre + 1)),
        octet(jeu, comptes + 0x63C));
    }

    // --- 3 : l'attraction que le joueur vient de poser (mot +0xA5 de la fiche du parc) -------------
    case 3: {
      const attraction = mot(jeu, long(jeu, PARC_COURANT) + 0xA5);
      if (attraction === 0) return SUIVANTE;
      const objet = (long(jeu, OBJETS) + attraction * TAILLE_OBJET) >>> 0;
      return dire(nom(mot(jeu, NOM_DE_L_ATTRACTION + mot(jeu, objet + 0x16))));
    }

    // --- 6 : une boutique n'a presque plus de stock ------------------------------------------------
    case 6: {
      if (octet(jeu, parc + 0x18) === 0) return SUIVANTE;          // le parc fermé, on se tait
      for (let b = BOUTIQUES; mot(jeu, b + 0x22) !== 0; b += TAILLE_BOUTIQUE) {
        const stock = octetSigne(jeu, b + 0x67);
        if (stock === -1 || octet(jeu, b + 0x68) === 0) continue;
        const reste = mot(jeu, STOCKS + 4 + stock * TAILLE_STOCK);
        const seuil = idiv(mot(jeu, PRIX_DES_STOCKS + 2 * octet(jeu, long(jeu, PARC_COURANT) + 0x4D)), 10);
        if (reste >= seuil || reste === 0) continue;
        return dire(nom(mot(jeu, STOCKS + stock * TAILLE_STOCK)), reste);
      }
      return SUIVANTE;
    }

    // --- 7 : des visiteurs ne trouvent plus leur chemin (mot +0x634 des comptes : les visiteurs
    // dans l'état 0x20, sans chemin ; simulation.js) ------------------------------------------------
    case 7:
      return mot(jeu, comptes + 0x634) !== 0 ? dire() : SUIVANTE;

    // --- l'humeur des visiteurs, par paliers de l'attrait du prix d'entrée -------------------------
    case 8:  return (attrait() <= 0 && attrait() >= -101 && parcEnMarche()) ? dire() : SUIVANTE;
    // Le genre 9 teste deux fois le nombre d'attractions : sans effet, reproduit.
    case 9:  return (attrait() <= -100 && octet(jeu, parc + 0x18) !== 0
      && octet(jeu, parc + 0x82) !== 0 && octet(jeu, parc + 0x82) !== 0) ? dire() : SUIVANTE;
    case 0xA:  return humeur(1, 0x19);
    case 0xB:  return humeur(0x1A, 0x32);
    case 0x1C: return humeur(0x33, 0x4B);
    case 0x1A: return humeur(0x4C, 0x64);
    case 0x1B: return humeur(0x65, 0x7D);
    case 0x12: return humeur(0x7E, 0x96);
    case 0x11: return humeur(0x97, 0xC8);
    case 0x10: return humeur(0xC9, 0x12C);
    case 0xF:  return (attrait() >= 0x12D && parcEnMarche()) ? dire() : SUIVANTE;

    // --- 0xC : les infobulles ----------------------------------------------------------------------
    case 0xC:
      return infobulle(jeu);

    // --- 0xD : un stock qu'on va manquer (fiches 0xD3C00) ------------------------------------------
    case 0xD: {
      for (let s = STOCKS; mot(jeu, s) !== 0; s += TAILLE_STOCK) {
        if (mot(jeu, s + 0xA) === 0) continue;
        if (((mot(jeu, s + 0xA) - mot(jeu, s + 0xC)) | 0) >= 200) continue;
        return dire(mot(jeu, s + 6), nom(mot(jeu, s)));
      }
      return SUIVANTE;
    }

    // --- 0xE : le prix d'entrée est nul (mot +0x1D de la fiche du parc) ----------------------------
    case 0xE:
      return mot(jeu, parc + 0x1D) === 0 ? dire() : SUIVANTE;

    // --- 0x13 : le mot +0x80 de la fiche du parc passe 0x40 (non établi) ---------------------------
    case 0x13:
      return motSigne(jeu, parc + 0x80) > 0x40 ? dire() : SUIVANTE;

    // --- 0x14 : il manque des boutiques pour le nombre d'attractions -------------------------------
    // +0x82 les attractions, +0xE0 les boutiques : il en faut une par tranche de huit attractions.
    // La remarque donne le nombre d'attractions et ce qui manque.
    case 0x14: {
      const voulues = idiv(octet(jeu, parc + 0x82), 8);
      if (octet(jeu, parc + 0xE0) >= voulues) return SUIVANTE;
      return dire(octet(jeu, parc + 0x82), (voulues - octet(jeu, parc + 0xE0)) | 0);
    }

    // --- 0x15 : l'emprunt possible, quand le solde est au plus bas ---------------------------------
    case 0x15: {
      if (longSigne(jeu, fiche + 0xA) >= 5000) return SUIVANTE;
      if (udiv(long(jeu, PAS_DE_SIMULATION), 12000) === 0) return SUIVANTE;
      if (longSigne(jeu, comptes + 0x48E) >= longSigne(jeu, comptes + 0x522)) return SUIVANTE;
      const gage = -Math.imul(mot(jeu, parc + 0x62), longSigne(jeu, parc + 0x66)) | 0;
      if ((((longSigne(jeu, fiche + 0xA) - longSigne(jeu, fiche + 0x12)) | 0) - 50000) <= gage) return SUIVANTE;
      return dire();
    }

    // --- 0x16 : le solde est négatif et l'emprunt gros ---------------------------------------------
    case 0x16: {
      if (longSigne(jeu, fiche + 0xA) >= 0) return SUIVANTE;
      if (long(jeu, PAS_DE_SIMULATION) <= 0x2EE0) return SUIVANTE;
      if (longSigne(jeu, fiche + 0x12) <= 100000) return SUIVANTE;
      if (longSigne(jeu, comptes + 0x48E) >= longSigne(jeu, comptes + 0x522)) return SUIVANTE;
      if (mot(jeu, parc + 0xC2) <= 8) return SUIVANTE;
      return dire();
    }

    // --- 0x17 : au bout d'un temps, et si le parc a du monde (non établi dans le détail) -----------
    case 0x17: {
      const passe = long(jeu, PAS_DE_SIMULATION) > 0x8CA0 ? 1 : 0;
      if (((longSigne(jeu, parc + 0xAE) + passe) | 0) !== 0) return SUIVANTE;
      const reste = (0x1B0 - Math.imul(udiv(long(jeu, PAS_DE_SIMULATION), 1000), 12)) | 0;
      // Comparaison non signée : passé 0x1B0 pas de retard, seuls les restes très négatifs passent.
      if ((reste >>> 0) >= 0xFFFFFFCE) return SUIVANTE;
      if (octet(jeu, parc + 0x92) <= 3) return SUIVANTE;
      if (motSigne(jeu, parc + 0x1F) <= 0x14) return SUIVANTE;
      return dire();
    }

    // --- 0x18, 0x20 : trop de visiteurs s'égarent ou s'en vont -------------------------------------
    // Rapportés aux présents (mot +0x1F de la fiche du parc) par vingtaine : le mot +0x632 des
    // comptes compte les visiteurs qui cherchent une allée, le mot +0x630 ceux qui vont vers la
    // sortie (simulation.js). Le second n'est dit que le parc ouvert.
    case 0x18:
      return mot(jeu, comptes + 0x632) > idiv(motSigne(jeu, parc + 0x1F), 0x14) ? dire() : SUIVANTE;
    case 0x20:
      return (mot(jeu, comptes + 0x630) > idiv(motSigne(jeu, parc + 0x1F), 0x14)
        && octet(jeu, parc + 0x18) === 1) ? dire() : SUIVANTE;

    // --- 0x19 : l'attraction la plus attirante qu'on pourrait s'offrir -----------------------------
    case 0x19: {
      if (motSigne(jeu, parc + 0x1F) <= 0x14) return SUIVANTE;     // trop peu de visiteurs présents
      let meilleure = 0, choix = -1;
      let g = 0;
      for (let a = ATTRACTIONS; mot(jeu, a + 0x22) !== 0; a += TAILLE_ATTRACTION, g = (g + 1) & 0xFF) {
        if (octet(jeu, a + 0xA9) <= meilleure) continue;           // moins attirante
        if (octet(jeu, long(jeu, FICHE_COURANTE) + g + 0x63) !== 0) continue;  // déjà au parc
        if ((octet(jeu, a + 0xC5) & 1) === 0) continue;            // pas encore inventée
        const disponible = (longSigne(jeu, fiche + 0xA) - idiv(longSigne(jeu, fiche + 0x12), 8)) | 0;
        if (disponible <= longSigne(jeu, a + 0xA2)) continue;      // trop chère
        meilleure = octet(jeu, a + 0xA9);
        choix = g;
      }
      if (s16(choix) <= -1) return SUIVANTE;
      return dire(nom(mot(jeu, NOM_DE_L_ATTRACTION + s16(choix) * TAILLE_ATTRACTION)));
    }

    // --- 0x1D, 0x1E : la boutique qui manque le plus, et celle qui en a trop -----------------------
    // Le genre 0x1D fait le calcul et laisse ses deux résultats dans ses variables ; le genre 0x1E,
    // juste après lui dans la table, les relit. Entrer directement dans le cas 0x1E (la remarque en
    // cours est remontrée) lui fait lire les restes de la pile : la réécriture les lit aussi.
    case 0x1D: return boutiqueQuiManque(jeu, cadre, parc, dire, nom);
    case 0x1E: return boutiqueEnTrop(jeu, cadre, parc, dire, nom);

    // --- 0x1F : le mot +0xD4 de la fiche du parc contre les présents / 128 (non établi) ------------
    case 0x1F:
      return motSigne(jeu, parc + 0xD4) < idiv(motSigne(jeu, parc + 0x1F), 128) ? dire() : SUIVANTE;

    // --- 0x21 : le programme compare le mot long +0xBA de la fiche du parc à 4 000 et ne fait rien
    // du résultat : une remarque qui ne sort jamais. Reproduit (la comparaison est sans effet).
    case 0x21:
      return SUIVANTE;

    // --- 0x22 : l'attraction la plus fréquentée, quand les files sont longues ----------------------
    // +0x62E des comptes : la somme des visiteurs qui font la queue (simulation.js), rapportée au
    // nombre d'attractions (+0x82 de la fiche du parc) ; au-delà de 25 par attraction, la remarque
    // nomme celle dont le mot +0x28 (sa file) est le plus gros.
    case 0x22: {
      if (octet(jeu, parc + 0x82) === 0) return SUIVANTE;
      if (idiv(mot(jeu, comptes + 0x62E), octet(jeu, parc + 0x82)) <= 0x19) return SUIVANTE;
      // Anomalie reproduite : sans attraction fréquentée, l'objet retenu reste ce que la pile
      // portait là, et son nom est lu à travers ce pointeur.
      let record = long(jeu, cadre.local(0x34));
      let meilleur = 0;
      for (let o = (long(jeu, OBJETS) + TAILLE_OBJET) >>> 0; (o >>> 0) < long(jeu, FIN_DES_OBJETS); o += TAILLE_OBJET) {
        if (octet(jeu, o + 4) !== 4) continue;                     // les attractions seules
        if (mot(jeu, o + 0x28) <= meilleur) continue;
        meilleur = mot(jeu, o + 0x28);
        record = o;
      }
      return dire(nom(mot(jeu, NOM_DE_L_ATTRACTION + mot(jeu, record + 0x16))));
    }

    // --- 0x23 : le mot long +0xBE de la fiche du parc passe 7 500 (non établi) ---------------------
    case 0x23:
      return longSigne(jeu, parc + 0xBE) > 0x1D4C ? dire() : SUIVANTE;

    // Les genres 4 et 5 ont un cas vide : ils ne disent jamais rien.
    default:
      return SUIVANTE;
  }
}

// 0x5CFA4 — le genre 0x1D : la boutique dont le stock manque le plus, et celle qui en a le plus en
// trop. Pour chaque boutique bâtie (octet +0x61C des comptes, indexé par son rang), on estime ce
// qu'elle devrait vendre : d'après les visiteurs pour les boutiques ordinaires, d'après ses propres
// réglages pour celles de type 8. L'écart avec son stock (+0x4F de la fiche) départage. Les deux
// résultats restent dans les variables du cadre pour le genre 0x1E.
function boutiqueQuiManque(jeu, cadre, parc, dire, nom) {
  if (octet(jeu, parc + 0xE0) === 0) return SUIVANTE;              // aucune boutique
  let manque = 0, trop = 0;                                        // [ebp-0x1c], [ebp-0x20]
  let laQuiManque = 0xFF, laEnTrop = 0xFF;                         // [ebp-0xc], [ebp-4]
  const comptes = long(jeu, COMPTES);

  for (let b = 0; mot(jeu, NOM_DE_LA_BOUTIQUE + b * TAILLE_BOUTIQUE) !== 0; b = (b + 1) & 0xFF) {
    if (octet(jeu, comptes + b + 0x61C) === 0) continue;            // pas bâtie
    const f = BOUTIQUES + b * TAILLE_BOUTIQUE;
    let voulu;
    if (octet(jeu, f + 0x24) === 8) {
      // Une boutique de type 8 : ses propres réglages (+0x5D, +0x4D, +0x69).
      voulu = ((octet(jeu, f + 0x5D) * 32 - 0xE3 + (mot(jeu, f + 0x4D) >> 3) + octet(jeu, f + 0x69)) / 2) | 0;
    } else {
      // Les autres : le prix d'entrée et la richesse des visiteurs.
      let n = (octetSigne(jeu, f + 0x56) + octetSigne(jeu, f + 0x57)) << 3;
      n = (n + (long(jeu, parc + 0xB6) >>> 4)) >>> 1;
      voulu = udiv(Math.imul(mot(jeu, f + 0x4D), (n + 100 + mot(jeu, parc + 6)) | 0), 100);
    }
    const ecart = (voulu - mot(jeu, f + 0x4F)) | 0;
    if (ecart < s16(manque) && mot(jeu, f + 0x4D) < voulu) {
      manque = (voulu & 0xFFFF0000) | u16(voulu - mot(jeu, f + 0x4F));
      laQuiManque = b;
    } else if (s16(trop) < ecart) {
      trop = (voulu & 0xFFFF0000) | u16(voulu - mot(jeu, f + 0x4F));
      laEnTrop = b;
    }
  }
  poserLong(jeu, cadre.local(0x1C), manque);
  poserLong(jeu, cadre.local(0x20), trop);
  poserOctet(jeu, cadre.local(0xC), laQuiManque);
  poserOctet(jeu, cadre.local(4), laEnTrop);

  if (s16(trop) <= -s16(manque)) return SUIVANTE;
  if (s8(laEnTrop) === -1) return SUIVANTE;
  if (s16(trop) < 5) return SUIVANTE;
  return dire(nom(mot(jeu, NOM_DE_LA_BOUTIQUE + s8(laEnTrop) * TAILLE_BOUTIQUE)), s16(trop));
}

// 0x5D1B7 — le genre 0x1E : la boutique qui a trop de stock, d'après ce que le genre 0x1D a laissé
// dans les variables du cadre.
function boutiqueEnTrop(jeu, cadre, parc, dire, nom) {
  if (octet(jeu, parc + 0xE0) === 0) return SUIVANTE;
  const manque = long(jeu, cadre.local(0x1C));
  const trop = long(jeu, cadre.local(0x20));
  const laQuiManque = octet(jeu, cadre.local(0xC));
  if (s16(manque) >= -s16(trop)) return SUIVANTE;
  if (s8(laQuiManque) === -1) return SUIVANTE;
  if (s16(manque) > -5) return SUIVANTE;
  return dire(nom(mot(jeu, NOM_DE_LA_BOUTIQUE + s8(laQuiManque) * TAILLE_BOUTIQUE)), -s16(manque));
}

// 0x5DE98 — le genre 0xC : l'infobulle du moment (mot 0xD661E), mise en forme dans 0xCE7D0.
function infobulle(jeu) {
  const n = mot(jeu, INFOBULLE);
  if (n === 0) return SUIVANTE;                                    // rien à montrer : au conseiller
  const bulle = (k) => long(jeu, long(jeu, TEXTES_DES_INFOBULLES) + 4 * k);
  const nom = (k) => long(jeu, long(jeu, NOMS) + 4 * k);
  const objet = () => (long(jeu, OBJETS) + mot(jeu, OBJET_CHOISI) * TAILLE_OBJET) >>> 0;
  const type = () => octet(jeu, objet() + 4);
  const recopier = (k) => { jeu.appeler(STRCPY, TAMPON, bulle(k)); return AFFICHER; };

  if (n < 0x10) return recopier(n);
  if (n === 0x10) {
    // « INDIQUE L'ARGENT DONT VOUS DISPOSEZ (%d) » : le solde du joueur courant.
    jeu.appeler(SPRINTF, TAMPON, bulle(n), longSigne(jeu, long(jeu, FICHE_COURANTE) + 0xA));
    return AFFICHER;
  }
  if (n === 0x11 || n === 0x12 || n === 0x1B) {
    // La fiche et le réglage d'une attraction : rien si l'objet désigné n'en est pas une.
    return type() === 4 ? recopier(n) : SORTIR;
  }
  if (n === 0x13) {
    // Le nom de l'objet désigné, avec un texte par type. Tout autre type laisse le tampon tel quel :
    // la barre répète alors le dernier message. Anomalie reproduite.
    switch (type()) {
      case 2:  // un visiteur : son prénom, dans la table des noms décalée de 0x168
        jeu.appeler(SPRINTF, TAMPON, bulle(0x14),
          long(jeu, long(jeu, NOMS) + 4 * octet(jeu, objet() + 0x59) + 0x168));
        return AFFICHER;
      case 4:  // une attraction
        jeu.appeler(SPRINTF, TAMPON, bulle(0x13), nom(mot(jeu, NOM_DE_L_ATTRACTION + mot(jeu, objet() + 0x16))));
        return AFFICHER;
      case 8:  // un employé : son métier
        jeu.appeler(SPRINTF, TAMPON, bulle(0x16),
          nom(mot(jeu, EMPLOYES + octet(jeu, objet() + 0x59) * TAILLE_EMPLOYE)));
        return AFFICHER;
      case 0xA:  // une boutique
        jeu.appeler(SPRINTF, TAMPON, bulle(0x15), nom(mot(jeu, NOM_DE_LA_BOUTIQUE + mot(jeu, objet() + 0x16))));
        return AFFICHER;
      default:
        return AFFICHER;
    }
  }
  if (n < 0x17) return recopier(n);                                // 0x14 à 0x16
  if (n < 0x19) {
    // La sécurité d'une attraction, ou le mécanicien qu'on envoie.
    if (type() === 8) {
      return mot(jeu, METIER_DE_L_EMPLOYE + octet(jeu, objet() + 0x59) * TAILLE_EMPLOYE) === 8
        ? recopier(0x18) : SORTIR;
    }
    return type() === 4 ? recopier(0x17) : SORTIR;
  }
  if (n < 0x1B) {
    // Ouvrir ou fermer l'attraction, ou déplacer l'employé.
    if (type() === 8) {
      jeu.appeler(SPRINTF, TAMPON, bulle(0x1A),
        nom(mot(jeu, EMPLOYES + octet(jeu, objet() + 0x59) * TAILLE_EMPLOYE)));
      return AFFICHER;
    }
    return type() === 4 ? recopier(n) : SORTIR;
  }
  return recopier(n);                                              // 0x1C et au-delà
}

// =====================================================================================================
// 0x5E2C5 — dessiner la barre des messages, et la bulle qui porte le texte.
//
// Le fond de la bande est toujours redessiné, ne serait-ce que pour effacer le message précédent ;
// son ordonnée est calculée ici, juste au-dessus de la barre d'outils. Un texte nul s'arrête là.
//
// Sinon, une bulle s'étend en bas de l'écran : un capuchon, autant de segments qu'il faut pour la
// largeur voulue, un capuchon. La largeur tient au texte : huit caractères de marge, sauf s'il
// déborde, auquel cas la bulle prend toute la place. Le texte est ensuite découpé aux espaces et
// écrit ligne par ligne dans la petite police.
//
// Les deux résolutions partagent l'espace de dessin de 640 lignes (§ 6.1) : en 320x200 le pas d'un
// caractère vaut 8 et l'interligne 0xC, en 640x480 4 et 6. L'ordonnée de la bulle se prend sous 400
// ou sous 480 selon le mode. Le capuchon gauche est posé en x = 0x34 en basse résolution et 0x20 en
// haute, mais les segments partent de 0x34 et de 0x18 : en haute résolution ils recouvrent le
// capuchon de huit pixels. Reproduit.
export const dessinerLaBarre = dansLeCadre(0x1A4, (jeu, cadre, texte) => {
  const basseResolution = (octet(jeu, MODE_AFFICHAGE) & 1) !== 0;
  const tracer = (x, y, image) => jeu.appeler(basseResolution ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE, x, y, image);
  const panneau = long(jeu, IMAGES_DU_PANNEAU);
  const bulle = long(jeu, IMAGES_DE_LA_BULLE);

  // Le fond de la bande, deux pixels au-dessus de la barre d'outils.
  poserMot(jeu, BARRE_Y,
    (mot(jeu, ZONE_DE_LA_BARRE_D_OUTILS) - octet(jeu, panneau + 0x78 + HAUTEUR_DE_L_IMAGE) - 2) & 0xFFFF);
  tracer(motSigne(jeu, BARRE_X), motSigne(jeu, BARRE_Y), (panneau + 0x78) >>> 0);
  if (texte === 0) return;

  const pas = basseResolution ? 8 : 4;                             // la largeur d'un caractère
  // Hors du jeu d'origine : en grande vue (grande-vue.js), le bas de l'écran est plus bas, et la
  // bulle suit la barre d'outils, centrée, de `ecran.barreX` (0 hors de la grande vue).
  const basDeLEcran = basseResolution ? 0x190 : ecran.hauteur;
  const dx = ecran.barreX;
  const yDeLaBulle = basDeLEcran - (basseResolution ? 0x60 : 0x4C);
  const largeurUtile = 0x25C - 6 * pas;

  const longueur = jeu.appeler(STRLEN, texte) >>> 0;
  const largeur = (longueur * pas) > (largeurUtile - 0x18)
    ? largeurUtile
    : (longueur + 8) * pas;

  // Le capuchon de gauche, les segments, le capuchon de droite.
  tracer((basseResolution ? 0x34 : 0x20) + dx, yDeLaBulle, (bulle + 0x1E6) >>> 0);
  let x = (basseResolution ? 0x34 : 0x18) + dx + octet(jeu, bulle + 0x1E6 + LARGEUR_DE_L_IMAGE);
  while (s16(x) <= u16(largeur) + dx) {
    tracer(s16(x), yDeLaBulle, (bulle + 0x1EC) >>> 0);
    x = (x + octet(jeu, bulle + 0x1EC + LARGEUR_DE_L_IMAGE)) | 0;
  }
  tracer(s16(x), yDeLaBulle, (bulle + 0x1F2) >>> 0);

  // Le texte, découpé aux espaces. La ligne se compose dans une variable du cadre, que la fonction
  // d'écriture lit en mémoire.
  const ligne = cadre.local(0xC4);
  let y = basDeLEcran - (basseResolution ? 0x58 : 0x48);
  const colonnes = idiv(largeurUtile, pas);
  const ecrire = () => jeu.appeler(basseResolution ? ECRIRE_320 : ECRIRE_640,
    (basseResolution ? 0x4A : 0x2E) + dx, s16(y), ligne, octet(jeu, COULEUR_DU_TEXTE));

  let source = texte >>> 0;
  let k = 0, dernierEspace = 0;
  while (octet(jeu, (source + u16(k)) >>> 0) !== 0) {
    if (u16(k) >= colonnes) {
      // La ligne est pleine : on la coupe au dernier espace vu et on repart juste après lui. Le
      // dernier espace n'est pas oublié : la ligne suivante le garde jusqu'au prochain.
      poserOctet(jeu, ligne + (dernierEspace & 0xFF), 0);
      source = (source + ((dernierEspace & 0xFF) + 1)) >>> 0;
      ecrire();
      y = (u16(y) + (basseResolution ? 0xC : 6)) | 0;
      k = 0;
    }
    if (octet(jeu, (source + u16(k)) >>> 0) === 0x20) dernierEspace = k & 0xFF;
    poserOctet(jeu, ligne + u16(k), octet(jeu, (source + u16(k)) >>> 0));
    k = (k + 1) | 0;
  }
  poserOctet(jeu, ligne + u16(k), 0);
  if (u16(k) === 0) return;                                        // rien à écrire
  ecrire();
});

// =====================================================================================================
// 0x6BF89 — dessiner les catalogues surgissants ouverts.
//
// Chaque catalogue de la liste chaînée est dessiné, replié (sa barre de titre seule) ou déployé (la
// grille de ses articles), puis 0x6BCDA reprend le format de sa grille. Le plus souvent la liste est
// vide et la fonction ne fait rien.
export const dessinerLesCatalogues = dansLeCadre(0x98, (jeu, cadre) => {
  const titre = cadre.local(0x74);                                 // le texte de la barre de titre
  const nombre = cadre.local(0x34);                                // un prix ou un compte

  let i = mot(jeu, PREMIER_CATALOGUE);
  while (s16(i) !== -1) {
    const c = (CATALOGUES + u16(i) * TAILLE_CATALOGUE) >>> 0;
    if (octet(jeu, c + 0x216) === 0) catalogueReplie(jeu, c, titre);
    else catalogueDeploye(jeu, c, titre, nombre);
    jeu.appeler(REGLER_LE_CATALOGUE, u16(i));
    i = mot(jeu, c + 0x24B);
  }
});

// Le catalogue replié : une barre de titre, large juste assez pour son nom, ramenée dans l'écran si
// elle en dépassait. Sa largeur et sa hauteur sont réécrites dans la fiche pour le prochain clic.
function catalogueReplie(jeu, c, titre) {
  const panneau = long(jeu, IMAGES_DU_PANNEAU);
  jeu.appeler(SPRINTF, titre, long(jeu, long(jeu, NOMS) + 0x3D4), (c + 0x221) >>> 0);
  const largeur = (jeu.appeler(LARGEUR_DU_TEXTE, titre) + 0x24) | 0;
  // (0x280, la largeur de l'écran : `ecran`, grande-vue.js)
  if ((s16(largeur) + motSigne(jeu, c)) > ecran.largeur) poserMot(jeu, c, (ecran.largeur - largeur) & 0xFFFF);

  jeu.appeler(RECTANGLE, motSigne(jeu, c), motSigne(jeu, c + 2), s16(largeur), 0x10, 0x3C);

  // Le bouton que le pointeur désigne, mis en valeur.
  const designe = mot(jeu, c + 0x24D);
  if (designe === 0xFFFF) {
    jeu.appeler(RECTANGLE, motSigne(jeu, c), motSigne(jeu, c + 2), 0x10, 0x10, 0x53);
  } else if (designe === 0xFFFE) {
    jeu.appeler(RECTANGLE, s16(mot(jeu, c) + 0x12), motSigne(jeu, c + 2), s16(largeur - 0x22), 0x10, 0x53);
  } else if (designe === 0xFFFD) {
    jeu.appeler(RECTANGLE, s16(mot(jeu, c) + largeur - 0x10), motSigne(jeu, c + 2), 0x10, 0x10, 0x53);
  }

  jeu.appeler(CADRE_CREUX, mot(jeu, c), mot(jeu, c + 2),
    u16(mot(jeu, c) + largeur), u16(mot(jeu, c + 2) + 0x10), 0);
  if (mot(jeu, MODE_AFFICHAGE) === 1) {
    jeu.appeler(TEXTE_A_GAUCHE, s16(mot(jeu, c) + 0x14), s16(mot(jeu, c + 2) + 4), titre, 0, 0x50);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, mot(jeu, c), mot(jeu, c + 2), (panneau + 0x1BC) >>> 0, 0);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, u16(mot(jeu, c) + largeur - 0x10), mot(jeu, c + 2),
      (panneau + 0x1C8) >>> 0, 0);
  } else {
    jeu.appeler(TEXTE_A_GAUCHE, s16(mot(jeu, c) + 0x14), s16(mot(jeu, c + 2) + 7), titre, 0, 0x50);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, mot(jeu, c), mot(jeu, c + 2), (panneau + 0x1BC) >>> 0, 0);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, u16(mot(jeu, c) + largeur - 0x11), mot(jeu, c + 2),
      (panneau + 0x1C8) >>> 0, 0);
  }
  poserMot(jeu, c + 4, largeur);
  poserMot(jeu, c + 6, 0x12);
}

// Le catalogue déployé : la barre de titre, le bouton désigné mis en valeur, puis la grille des
// articles — image, prix, et le nombre possédé quand il y en a un.
function catalogueDeploye(jeu, c, titre, nombre) {
  const panneau = long(jeu, IMAGES_DU_PANNEAU);
  const x0 = () => mot(jeu, c), y0 = () => mot(jeu, c + 2);
  const largeur = () => mot(jeu, c + 4), hauteur = () => mot(jeu, c + 6);
  const designe = () => motSigne(jeu, c + 0x24D);

  jeu.appeler(STRCPY, titre, (c + 0x221) >>> 0);
  jeu.appeler(RECTANGLE, motSigne(jeu, c), motSigne(jeu, c + 2), motSigne(jeu, c + 4), 0x12, 0x3C);
  jeu.appeler(RECTANGLE, motSigne(jeu, c), s16(y0() + hauteur() - 0x10), motSigne(jeu, c + 4), 0x10, 0x3C);

  // Les boutons du cadre, numérotés en négatif. Le rang −6 n'a pas de cas.
  switch (u16(mot(jeu, c + 0x24D) + 7)) {
    case 0:  // −7 : le bouton à gauche du coin haut droit (rôle non établi)
      jeu.appeler(RECTANGLE, s16(x0() + largeur() - 0x20), motSigne(jeu, c + 2), 0x10, 0x10, 0x53);
      break;
    case 2:  // −5 : le coin bas droit
      jeu.appeler(RECTANGLE, s16(x0() + largeur() - 0x10), s16(y0() + hauteur() - 0x10), 0x10, 0x10, 0x53);
      break;
    case 3:  // −4 : le bas
      jeu.appeler(RECTANGLE, motSigne(jeu, c), s16(y0() + hauteur() - 0x10), s16(largeur() - 0x10), 0x10, 0x53);
      break;
    case 4:  // −3 : le coin haut droit
      jeu.appeler(RECTANGLE, s16(x0() + largeur() - 0x10), motSigne(jeu, c + 2), 0x10, 0x10, 0x53);
      break;
    case 5:  // −2 : la barre de titre
      jeu.appeler(RECTANGLE, s16(x0() + 0x12), motSigne(jeu, c + 2), s16(largeur() - 0x32), 0x12, 0x53);
      break;
    case 6:  // −1 : le coin haut gauche
      jeu.appeler(RECTANGLE, motSigne(jeu, c), motSigne(jeu, c + 2), 0x10, 0x10, 0x53);
      break;
    default:
      break;
  }

  // Le fond de la grille.
  jeu.appeler(RECTANGLE, motSigne(jeu, c), s16(y0() + 0x12), motSigne(jeu, c + 4), s16(hauteur() - 0x22), 0x40);

  const format = octet(jeu, c + 0x216);
  const pasX = mot(jeu, c + 0x212), pasY = mot(jeu, c + 0x214);
  let k = 0;                                                       // le rang de l'article
  let y = (y0() + 0x14) | 0;
  for (let ligne = octet(jeu, FORMATS_DES_LIGNES + 3 * format); s16(ligne) !== 0; ligne = (ligne - 1) | 0) {
    let x = (x0() + 4) | 0;
    for (let colonne = octet(jeu, FORMATS_DES_COLONNES + 3 * format); s16(colonne) !== 0; colonne = (colonne - 1) | 0) {
      const article = (c + 0xA + 13 * u16(k)) >>> 0;
      if (mot(jeu, article) !== 0) {
        if (u16(k) === designe()) {
          jeu.appeler(RECTANGLE, s16(x), s16(y), s16(pasX - 2), s16(pasY - 2), 0x53);
        }
        if (octet(jeu, article + 0xB) & 1) {
          jeu.appeler(RECTANGLE, s16(x), s16(y), s16(pasX - 2), s16(pasY - 2), octet(jeu, COULEUR_DE_L_ARTICLE));
          jeu.appeler(RECTANGLE, s16(x), s16(y), s16(pasX - 2), 0xE, octet(jeu, COULEUR_DU_TEXTE));
        } else {
          jeu.appeler(RECTANGLE, s16(x), s16(y), s16(pasX - 2), 0xE, 0x50);
        }
        jeu.appeler(IMAGE_DANS_UN_CADRE, s16(x + 2), s16(y + 0xE), s16(x + pasX - 4), s16(y + pasY - 4),
          mot(jeu, article + 2));
        jeu.appeler(CADRE_CREUX, u16(x), u16(y), u16(x + pasX - 2), u16(y + pasY - 2), 0x50);
        jeu.appeler(SPRINTF, nombre, FORMAT_NOMBRE, long(jeu, article + 4));   // le prix
        if (u16(k) === designe()) {
          // L'article désigné donne son nom à la barre de titre.
          jeu.appeler(SPRINTF, titre, FORMAT_TEXTE, long(jeu, long(jeu, NOMS) + 4 * mot(jeu, article)));
          jeu.appeler(TEXTE_CENTRE, s16(x), s16(x + pasX), s16(y + 2), nombre, 0, 0x53);
        } else {
          jeu.appeler(TEXTE_CENTRE, s16(x), s16(x + pasX), s16(y + 2), nombre, 0, 0x32);
        }
        if (octet(jeu, article + 0xC) !== 0) {
          jeu.appeler(SPRINTF, nombre, FORMAT_NOMBRE, octet(jeu, article + 0xC));
          jeu.appeler((octet(jeu, MODE_AFFICHAGE) & 1) ? ECRIRE_320 : ECRIRE_640,
            s16(x + 2), s16(y + 0xE), nombre, octet(jeu, COULEUR_DU_NOMBRE));
        }
        k = (k + 1) | 0;
      }
      x = (x + pasX - 2) | 0;
    }
    y = (y + pasY - 2) | 0;
  }

  // Le cadre extérieur, les deux filets, le titre et les quatre coins. La haute résolution décale
  // tout d'un pixel : les images des coins n'y font pas la même taille.
  jeu.appeler(CADRE_CREUX, x0(), y0(), u16(x0() + largeur()), u16(y0() + hauteur()), 0);
  const filet = (octet(jeu, MODE_AFFICHAGE) & 1) ? LIGNE_320 : LIGNE_640;
  if (mot(jeu, MODE_AFFICHAGE) === 1) {
    jeu.appeler(filet, motSigne(jeu, c), s16(y0() + 0x10), s16(x0() + largeur()), s16(y0() + 0x10), 0);
    jeu.appeler(filet, motSigne(jeu, c), s16(y0() + hauteur() - 0x10), s16(x0() + largeur()),
      s16(y0() + hauteur() - 0x10), 0);
    jeu.appeler(TEXTE_CENTRE, s16(x0() + 0x10), s16(x0() + largeur() - 0x10), s16(y0() + 4), titre, 0, 0xA8);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, x0(), y0(), (panneau + 0x1BC) >>> 0, 0);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, u16(x0() + largeur() - 0x10), y0(), (panneau + 0x1C8) >>> 0, 0);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, u16(x0() + largeur() - 0x10), u16(y0() + hauteur() - 0x10),
      (panneau + 0x1C2) >>> 0, 0);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, u16(x0() + largeur() - 0x20), y0(), (panneau + 0x1CE) >>> 0, 0);
  } else {
    jeu.appeler(filet, motSigne(jeu, c), s16(y0() + 0x11), s16(x0() + largeur()), s16(y0() + 0x11), 0);
    jeu.appeler(filet, motSigne(jeu, c), s16(y0() + hauteur() - 0x11), s16(x0() + largeur()),
      s16(y0() + hauteur() - 0x11), 0);
    jeu.appeler(TEXTE_CENTRE, s16(x0() + 0x10), s16(x0() + largeur() - 0x10), s16(y0() + 7), titre, 0, 0xA8);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, x0(), y0(), (panneau + 0x1BC) >>> 0, 0);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, u16(x0() + largeur() - 0x11), y0(), (panneau + 0x1C8) >>> 0, 0);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, u16(x0() + largeur() - 0x11), u16(y0() + hauteur() - 0x11),
      (panneau + 0x1C2) >>> 0, 0);
    jeu.appeler(TRACER_IMAGE_TRANSPARENTE, u16(x0() + largeur() - 0x22), y0(), (panneau + 0x1CE) >>> 0, 0);
  }
}

// =====================================================================================================
// Toutes prouvées par comparer.mjs (0 divergence) et verifier.mjs (IDENTIQUE, avec et sans
// --empoisonner) sur les sept scénarios. Ce que chacun exerce, en nombre d'appels :
//
//   scénario        0x5CBDB   0x5E2C5   0x6BF89
//   demo 140          1 003         1     1 003
//   parc 84           1 556       750     1 555
//   ecrans 105        1 437       631     1 436
//   construction 150  3 393         0     3 393
//   simulation 330    9 062         0     9 062
//   fin-annee 340     8 912         0     8 912
//   feux 60           1 513         0     1 513
//
// Le conseiller n'est allumé que dans parc.json et ecrans.json, qui commencent une partie neuve
// (0x12452 lève 0xD778D) ; les autres scénarios reprennent le parc de la démonstration, où il est
// coupé, et 0x5CBDB rend la main tout de suite. Là où il tourne, seul le genre 0xC sort — les
// infobulles, 431 fois, numéros 0xD et 0x19 ; le numéro 0x19 sur un objet qui n'est ni une
// attraction ni un employé fait 806 fois sortir la fonction sans rien dessiner. Le chemin de la
// remarque expirée, celui qui lit l'indice de parcours dans les restes de la pile, est emprunté une
// fois dans parc.json : il est donc lui aussi prouvé, brouillage de la pile compris.
//
// **Aucun scénario n'ouvre de catalogue surgissant** : 0x6BCDA n'y est jamais appelée, le mot
// 0xB14BB vaut toujours −1, et 0x6BF89 rend donc toujours la main aussitôt. Seul ce chemin-là est
// prouvé par les scénarios.
//
// Le reste — les 33 autres remarques du conseiller, les infobulles autres que 0xD et 0x19, la bulle
// de texte sur plusieurs lignes, et tout le dessin des catalogues — a été éprouvé hors scénarios,
// comme interface-parc.js : une partie jouée jusqu'au parc, puis la fonction appelée dans des états
// fabriqués, transcription et réécriture comparées sur toute la mémoire à chaque appel.
//
//  - la barre des messages : infobulle, objet désigné et son type, remarque en cours, compteurs et
//    dates du conseiller, fiches du parc, des comptes, du joueur, des boutiques, des stocks et des
//    attractions tirés au hasard ; pour que chaque remarque ait son tour, les autres sont coupées
//    (leur genre mis à 1, qui n'a pas de cas). 8 000 appels depuis parc.json (640x480) et 4 000
//    depuis demo.json (320x200) : 0 divergence ; les genres 2, 3, 6, 7, 8, 9, 0xA, 0xB, 0xC, 0xD,
//    0xE, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x17, 0x18, 0x19, 0x1B, 0x1D, 0x1F, 0x20, 0x22 et
//    0x23 y sortent pour de bon ;
//  - les catalogues : ouverts comme le ferait le clic droit sur la barre d'outils (0x1788D sur les
//    zones 4, 6, 7, 8 et 9 : CHEMINS, ATTRACTIONS, BOUTIQUES, DECOR EXTERIEUR, PERSONNEL), puis
//    redessinés en faisant varier la position, le format de la grille, le bouton ou l'article
//    désigné et les drapeaux des articles. 1 991 appels en 320x200 et 1 997 en 640x480 :
//    0 divergence, les quinze formats et tous les désignés de −7 à 23 couverts.
//
// Les scripts de ces épreuves sont dans le bac à sable de la réécriture, hors du dépôt.
//
// `memoire: 'entiere'` n'est pas demandé : ces fonctions n'écrivent que dans les variables du jeu et
// dans les deux tampons d'image, que le comparateur relève par défaut.
export const reecritures = [
  { adresse: 0x5CBDB, nom: 'barreDesMessages', fn: (jeu) => barreDesMessages(jeu), arguments: 0 },
  { adresse: 0x5E2C5, nom: 'dessinerLaBarre', fn: (jeu, texte) => dessinerLaBarre(jeu, texte), arguments: 1 },
  { adresse: 0x6BF89, nom: 'dessinerLesCatalogues', fn: (jeu) => dessinerLesCatalogues(jeu), arguments: 0 },
];

export const enAttente = [];
