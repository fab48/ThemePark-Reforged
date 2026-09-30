// Le dessin des attractions et des véhicules, et la désignation de l'objet sous le pointeur.
//
// Réécriture lisible de six fonctions du jeu d'origine :
//
//   0x1D87A  dessiner une attraction (objet du parc de type 4) ;
//   0x69840  la dessiner avec ses passagers, chacun à sa place ;
//   0x1DD27  dessiner un véhicule (type 0xE) : un wagon et son passager, le bus, un wagon qui vole ;
//   0x66DFA  tracer une image étirée ou réduite à une taille donnée ;
//   0x20FF5  désigner l'objet sous le pointeur de la souris, selon l'outil en cours ;
//   0x66D18  remettre d'accord la musique des attractions.
//
// Le dessin d'une case (0x1C22A, objets.js) confie les attractions à 0x1D87A et les véhicules à
// 0x1DD27, avec le coin haut gauche de la case dans l'espace logique de dessin (640 de large,
// retro-ingenierie.md § 6.1). La vue réduite de la carte (0x3F975) les appelle aussi ; aucun
// scénario ne l'ouvre.
//
// LA POSITION FINE. Les mots +6 et +8 d'un objet donnent sa place en 256es de case : l'octet haut
// est la colonne (+7) ou la rangée (+9), l'octet bas (+6, +8) la place dans la case. Attractions et
// véhicules sont tracés à cette place, et non au coin de la case : la colonne fine avance d'une
// largeur de tuile par case, la rangée fine d'un tiers de tuile vers la droite (le biais de la vue,
// § 5.1) et d'une hauteur de tuile vers le bas. Les deux modes d'affichage ont leurs décalages
// écrits en dur (voir decalageFin).
//
// L'ATTRACTION (0x1D87A). Selon son mode de fonctionnement (octet +C, attractions.js) :
//   - 2, 4, 6, 0x1E (à tours, à bouées, à train, les spectacles) : son objet graphique et ses
//     passagers (0x69840) ; une attraction à voie (mode 6) ou à bouées n'a pas d'objet graphique
//     (+A nul) : rien n'est tracé ici, sauf la fumée de l'usure ; la voie et les wagons ont leurs
//     propres objets ;
//   - 0x1C, les circuits de voitures : rien du tout ; les voitures sont des visiteurs (état 0x36) ;
//   - 0x24, le château gonflable qui a explosé : il gonfle et s'envole (dessinerLeChateauEnVol) ;
//   - 0x26, les avions (PLANE FLYER) qui ont explosé : ils montent d'un pixel par pas (+B1) ;
//   - toute autre valeur : rien.
// Une attraction usée (usure +2E au moins égale au seuil de son genre, fiche +A8) tremble d'un
// pixel vers le haut ou de deux vers le bas selon le pas de simulation, et porte une animation de
// plus, son objet graphique +8E (la figure 0x167 posée à la construction, de la fumée ? non établi).
// Un spectacle trace encore, par-dessus, l'objet graphique +87 (s'il n'est pas nul : le décor ? non
// établi) et, pendant le numéro (phase 2), celui du numéro en cours (+89).
//
// LES PASSAGERS (0x69840). Les places sont dans l'objet graphique même : un morceau dont les
// drapeaux portent le bit 0x80 (l'octet +6 du morceau) est une place, dont l'image est celle d'un
// visiteur de la sorte 0 assis là. La façon d'y mettre les passagers dépend de la disposition du
// genre (octet +B3 de la fiche ; relevé dans le catalogue de la démo) :
//   0, 1   les places tournent avec l'attraction (0 : PLANE FLYER, HAUNTED HOUSE, MERRY-GO-ROUND,
//          SNAKES AND LADDERS, PARASOL CHAIRS ; 1 : BIG WHEEL) : le passager assis à la première
//          place change à chaque boucle achevée de l'animation (mot long +20) ;
//   5, 7   les places sont fixes (5 : FLIGHT SIM, TREE HOUSE, PIRATE BOAT, GHOST HOUSE, SPACE
//          SHUTTLE ; 7 : les spectacles, dont les passagers sont les spectateurs) ;
//   9      de même, sauf à l'arrêt (phase 0), où les places restent vides (BOUNCY CASTLE) ;
//   8      un seul visiteur à la fois, tiré au hasard et montré par une animation (MAZE) ;
//   autre  les places ne sont jamais tracées (3 : bouées et voitures ; 4 : les attractions à voie,
//          dont les wagons portent les passagers ; 6 : OBSERVATION TOWER, SUPER SPINNER,
//          OBSERVATORY, PLANET ROCKET).
// Le nombre de places est la capacité de la fiche du genre (+A6), et non celle de l'attraction.
// Un passager d'une autre sorte que 0 prend l'image équivalente de sa sorte : la table 0xB9A78
// donne, pour chacune des 8 sortes, 47 images (une ligne de 0x5E octets), la ligne 0 étant celle des
// images dessinées dans les attractions ; l'image est alors centrée sur celle de la place et posée
// sur le même pied. Pendant un entracte d'un spectacle (compteur +92 négatif : le programme en
// 0xB8C60 n'y range que ses valeurs négatives), les spectateurs prennent l'une des deux images de
// leur sorte dans la table 0xB9A58, selon la parité de ce compteur : ils applaudissent,
// vraisemblablement (non établi). Les deux tables donnent des décalages dans la table des images ;
// au démarrage, 0x6A658 y décale ceux des sortes 1 à 7 d'un nombre d'images lu pour chacune dans la
// table [0xD3B0C] (le début de ses images, vraisemblablement).
//
// LES VÉHICULES (0x1DD27), selon leur état (vehicules.js) :
//   - 8, 0xA, 0x22 : un wagon sur sa voie. Son image, et l'altitude à laquelle il roule, viennent de
//     l'élément de voie sous lui (voir dessinerUnWagon) ; ses passagers sont tracés à ses places
//     comme ceux des attractions. Un wagon qui roule (0xA, 0x22) sur une attraction usée tremble ;
//   - 0xC, le wagon dans un élément de plusieurs cases (un looping) : rien ici ; le morceau de voie
//     maître de l'élément (0x1F205, type 0x12) le dessine, vraisemblablement (non établi) ;
//   - 0x14, 0x16, 0x18 : le bus, un avant, des sections de milieu (mot +26), un arrière ;
//   - 0x20 : un wagon sorti de la voie, qui vole et tombe (son altitude +98 décroît).
//
// LA DÉSIGNATION (0x20FF5). Tant que le bouton gauche est maintenu (0xDE5AC), les routines de dessin
// des attractions, des kiosques d'entrée, des boutiques, des visiteurs, des employés, des toilettes
// et de l'entrée du parc appellent 0x20FF5, qui compare la position du pointeur au rectangle
// qu'occupent les images de l'objet. L'objet sous le pointeur devient l'objet sélectionné (0xD6678),
// selon l'outil en cours (0xD6670 ; 8 est l'outil d'information) ; si un clic attend d'être pris
// (0xDE5A0), sa fenêtre s'ouvre (0x35F21) et le clic est marqué pris (0xD77A6). Les objets étant
// dessinés du fond vers l'avant (les rangées de haut en bas, chacune de droite à gauche), deux objets
// sous le pointeur se départagent ainsi : bouton maintenu sans clic, le dernier dessiné, le plus en
// avant, reste sélectionné ; au clic, c'est le premier dessiné, le plus au fond, qui ouvre sa
// fenêtre : elle change d'écran (0xD6652 : toutes les fenêtres ouvertes ici en ont un non nul) et
// remet l'outil à zéro, et les suivants renoncent.
//
// Le bus, lui, ne regarde que le clic en attente (0x1DD27) : sous le pointeur, il le prend et passe à
// l'écran 0x54, celui de l'agrandissement du bus. Il ne regarde ni l'écran ni si le clic a déjà été
// pris : dessiné après un objet qui vient d'ouvrir sa fenêtre, il remplacerait l'écran de celle-ci
// (non vérifié en jeu).
//
// VÉRIFICATION. Ce que les cinq scénarios exercent (nombre d'appels) : 0x1D87A et 0x69840 dans
// demo (1 010 et 1 006), simulation (9 062) et construction (6 854) ; 0x1DD27 dans demo (276), parc
// (172) et ecrans (202) ; 0x66DFA dans ecrans (6 000, en 640x480, par 0x20F4C qui y trace les images
// au double de leur taille) et construction (1 179, par le dessin des fenêtres, 0x3EF1D) ; 0x20FF5
// dans construction (1 015) ; 0x66D18 dans demo (504) et simulation (720), sans rien faire faute de
// carte son.
//
// Ce qu'ils ne montrent pas : une attraction usée (le tremblement et la fumée), un spectacle (son
// décor et son numéro), le labyrinthe, l'entracte, les deux modes d'après l'explosion, la vue
// réduite, un wagon avec passagers, un wagon sans voie ou sorti de la voie, le clic sur le bus, et,
// dans la désignation, tout ce qui n'est pas la sélection d'une attraction — les fenêtres, l'outil
// de la cible, celui du mécanicien, les autres types d'objets. Ces chemins ont été éprouvés à part,
// sur des états fabriqués : à partir du parc de simulation.json à 100 s, de 600 à 2 000 essais par
// fonction, moitié en 320x200, moitié en 640x480, où les champs des objets, des fiches, des tables et
// des variables d'affichage sont tirés au hasard ; chaque essai exécute la transcription, restaure,
// exécute la réécriture, et compare toute la mémoire (hors pile sous le point d'appel), les registres
// préservés et l'état de l'hôte. 0 divergence, et tous les blocs des six fonctions d'origine
// atteints, sauf un, impossible : l'aiguillage de 0x69840 vers une quatrième façon de tracer, que
// rien ne pose. Ce n'est pas une preuve au sens du guide.
//
// Réécriture fidèle : les anomalies repérées sont reproduites et signalées en commentaire.

import { observation, debutDAttraction, finDAttraction } from './animations-intercalees.js';

const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const motLong = (jeu, a) => jeu.dv.getUint32(a, true);
const ecrireMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const ecrireMotLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// Division entière du processeur (idiv) : un diviseur nul lève une exception, comme sur la machine.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

// --- les données -----------------------------------------------------------------------------------

// Les objets du parc : enregistrements de 200 octets, numérotés à partir de 1 (l'objet 0 n'est qu'une
// sentinelle), de [0xD3B10] + 200 à [0xD3B78] exclu.
const OBJETS_DU_PARC = 0xD3B10;
const FIN_DES_OBJETS_DU_PARC = 0xD3B78;
const TAILLE_OBJET = 200;
const TYPE = 0x04;                 // octet
const IMAGE = 0x0A;                // mot : l'objet graphique affiché
const ETAT = 0x0C;                 // octet : l'état, ou le mode de fonctionnement d'une attraction
const PREMIER_A_BORD = 0x47;       // mot : le premier passager ; les suivants par leur propre mot +47

// L'attraction (type 4) : les champs que lit ce dessin (les noms sont ceux de attractions.js).
const GENRE = 0x16;                // mot : la fiche du genre, décalage dans le catalogue
const BOUCLES = 0x20;              // mot long : boucles d'animation achevées depuis le départ
const USURE = 0x2E;                // mot
const PHASE = 0x32;                // mot : 0 à l'arrêt, 2 en marche (attractions.js)
const KIOSQUE_D_ENTREE = 0x49;     // mot
const VISITEUR_MONTRE = 0x4D;      // mot signé : le labyrinthe, le visiteur montré (voir plus bas)
const ALTITUDE_DU_CHATEAU = 0x5F;  // mot : le château gonflable envolé (0x66976 l'augmente)
const VISITEUR_MONTRE_AVANT = 0x85;  // mot : le labyrinthe, le visiteur montré précédemment
const DECOR_DU_SPECTACLE = 0x87;   // mot : objet graphique ; ce qu'il montre, non établi
const IMAGE_DU_NUMERO = 0x89;      // mot : objet graphique du numéro en cours d'un spectacle
const FUMEE = 0x8E;                // mot : objet graphique de l'animation de l'usure
const COMPTEUR_DU_NUMERO = 0x92;   // mot signé : négatif pendant un entracte (plus haut)
const ENVOL = 0xB1;                // octet : les pas depuis l'explosion (0x66976, 0x66AFD)

// Les modes de fonctionnement que ce dessin distingue.
const A_TOURS = 2, A_BOUEES = 4, A_TRAIN = 6, SPECTACLE = 0x1E;
const CHATEAU_ENVOLE = 0x24, AVIONS_ENVOLES = 0x26;
const EN_MARCHE = 2;

// Le catalogue des genres d'attractions : fiches de 200 octets, le nom en tête.
const CATALOGUE = 0xCCED0;
const FICHE_IDENTIFIANT = 0x22;    // mot : 0xDB pour MONORAIL
const FICHE_CAPACITE = 0xA6;       // mot : le nombre de places
const FICHE_SEUIL_D_USURE = 0xA8;  // octet
const FICHE_DISPOSITION = 0xB3;    // octet : comment les passagers occupent les places (plus haut)
const FICHE_MUSIQUE = 0xB7;        // octet : le morceau de l'attraction ; 0 = aucun
const MONORAIL = 0xDB;

// Le visiteur (type 2) : sa sorte, de 0 à 7 (la ligne de ses images).
const SORTE = 0x59;

// Le kiosque d'entrée (types 6 et 0x1C) : le numéro de l'attraction qu'il sert.
const ATTRACTION_DU_KIOSQUE = 0x16;

// Le véhicule (type 0xE) : les champs que lit ce dessin (les noms sont ceux de vehicules.js).
const DRAPEAUX_DU_WAGON = 0x05;    // octet : bit 0, le wagon vient de s'arrêter en gare
const DERNIERE_CASE_DE_VOIE = 0x10;  // mot : le numéro de case du dernier morceau de voie atteint
const DIRECTION = 0x12;            // octet
const COMPTE_A_REBOURS = 0x14;     // mot : le bus, avant de repartir
const ATTRACTION_DU_WAGON = 0x16;  // mot
const RANG_DANS_LE_TRAIN = 0x20;   // mot long : 0 pour la tête, puis 1, 2... (relevé dans la démo)
const SECTIONS_DU_BUS = 0x26;      // mot : les sections de milieu du bus (2 dans la démo)
const ALTITUDE_EN_VOL = 0x98;      // mot : le wagon sorti de la voie
const WAGON_EN_GARE = 8, WAGON_EN_MARCHE = 0xA, BUS_EN_ROUTE = 0x14, BUS_A_L_ARRET = 0x16;
const BUS_EN_ATTENTE = 0x18, WAGON_EN_VOL = 0x20, WAGON_DU_MONORAIL = 0x22;

// Le morceau de voie (type 0x12).
const MORCEAU_DE_VOIE = 0x12;
const GENRE_DE_VOIE = 0x16;        // mot : 1 à 3 ; 3 pour le monorail
const ELEMENT_DE_VOIE = 0x44;      // octet : l'élément dans la table du genre
const HAUTEUR_DE_VOIE = 0x79;      // octet
const VOIE_DU_MONORAIL = 3;
// Les éléments de voie : pour chaque genre, 10 octets dont un pointeur (mot long) vers ses
// éléments, de 0x19 octets. Ce qu'en lit ce dessin :
//   +5   un numéro de figure par direction (mots) ;
//   +12  la pente selon la colonne fine, +13 selon la rangée fine (octets signés, en pixels par case) ;
//   +14  un décalage de hauteur (octet signé) ;
//   +15  un bruitage par direction (octets), joué par la tête du train qui roule.
const ELEMENTS_DE_VOIE = 0xB4399;
const TAILLE_ELEMENT = 0x19;
const BRUITAGE_EN_GARE = 0x13;     // joué tant que le wagon vient de s'arrêter en gare

// Les tables des objets graphiques (retro-ingenierie.md § 6.4, objets.js).
const OBJETS_GRAPHIQUES = 0xD3B80; // 8 octets : +0 premier morceau, +2 largeur, +3 hauteur, +5 bit 0
                                   // dernière image d'une animation, +6 image suivante
const MORCEAUX = 0xD3B7C;          // 10 octets : +0 image, +2 dx, +4 dy, +6 drapeaux, +8 suivant
const IMAGES = 0xD3BB8;            // 6 octets : +0 pixels, +4 largeur, +5 hauteur
const FIGURES = 0xD3B38;           // table de mots : numéro de figure → objet graphique
const GRILLE = 0xD3B08;            // la carte, 64 x 64 cellules de 4 octets
const PLACE_DE_PASSAGER = 0x80;    // bit de l'octet +6 d'un morceau

// Les images des passagers, selon leur sorte (plus haut).
const IMAGES_EQUIVALENTES = 0xB9A78;   // 8 lignes de 47 mots
const LIGNE_D_EQUIVALENTES = 0x5E, NOMBRE_D_EQUIVALENTES = 0x2F;
const IMAGES_D_ENTRACTE = 0xB9A58;     // 8 lignes de 2 mots
// Le labyrinthe : la colonne 0x1A de la table des images des visiteurs (0xB49F4, 0x24 octets par
// sorte), et neuf apparitions (figure, dx, dy) : les figures 377, 379, 380, trois places chacune.
const IMAGE_DANS_LE_LABYRINTHE = 0xB4A0E;
const APPARITIONS = 0xB4E5A, NOMBRE_D_APPARITIONS = 9;
const APPARITION_TIREE = 0xD7BE8;  // mot : la dernière apparition tirée
// Le bus : pour chaque valeur de son mot +A (0 ou 1 dans la démo), trois numéros de figure : l'avant,
// une section de milieu, l'arrière. (176, 177, 178) et (179, 180, 212).
const MORCEAUX_DU_BUS = 0xB7870;
// Le wagon sorti de la voie : un objet graphique pris dans la table des figures.
const FIGURE_WAGON_EN_VOL = 0xA3, FIGURE_MONORAIL_EN_VOL = 0x1E1;

// L'affichage.
const MODE_AFFICHAGE = 0xDE5F6;    // mot : 1 = 320x200, 8 = 640x480
const LARGEUR_TUILE = 0xD663A;     // mot : 48 ou 24
const FACON_DE_DESSINER = 0xD667C; // mot : 0, ou 8 la vue réduite (objets.js)
const VUE_REDUITE = 8;
const REDUCTION_LARGEUR = 0xD6640, REDUCTION_HAUTEUR = 0xD6642;
const DRAPEAUX_TRACEUR = 0xBECBC;  // mot : drapeaux que le traceur applique à la prochaine image
const LARGEUR_SURFACE = 0xDE5B8;   // mot long : 320 ou 640, octets par ligne de la surface
const HAUTEUR_SURFACE = 0xDE5C0;   // mot long
const SURFACE = 0xDE5BC;           // pointeur : la surface de dessin

// Le temps.
const PAS_DE_SIMULATION = 0xD3AFC; // mot long

// La musique des attractions (dessin-carte.js).
const MUSIQUE = 0xD6632;           // mot signé : 1 réclamée pendant cette image
const ATTRACTION_MUSICALE = 0xD3AE8;   // pointeur

// La souris, la sélection et les écrans (retro-ingenierie.md § 6.7).
const BOUTON_GAUCHE_MAINTENU = 0xDE5AC;  // mot : les objets testent s'ils sont sous le pointeur
const CLIC_EN_ATTENTE = 0xDE5A0;   // mot : posé par le gestionnaire de souris
const CLIC_PRIS = 0xD77A6;         // octet : un objet a pris le clic ; 0x1B837 efface alors la demande
const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;
const SELECTION = 0xD6678;         // mot : le numéro de l'objet sélectionné
const GENRE_DESIGNE = 0xD665A;     // mot : le numéro de genre de l'attraction désignée (ce qu'en font
                                   // ses nombreux lecteurs, l'interface et la construction : non établi)
const REMISE_A_ZERO = 0xD6636;     // mot : mis à 0 à chaque sélection, compté par 0x4E359 ; non établi
const ECRAN = 0xD6652;             // mot : 0 = la vue du parc
const ECRAN_DU_BUS = 0x54;         // l'agrandissement du bus (0x78CEF)
const OUTIL = 0xD6670;             // mot : l'outil en cours
const INFORMATION = 8;             // l'outil d'information
const OUTIL_CIBLE = 0xE;           // désigne une cible (+0x2C8 des comptes du parc) : non établi
const OUTIL_MECANICIEN = 0x15;     // envoie le mécanicien sélectionné réparer une attraction
const OUTIL_14 = 0x14, OUTIL_13 = 0x13;  // non établis : ils ne désignent rien
// Ce qui suspend la désignation, en plus d'un écran autre que le parc : trois variables de
// l'interface, non établies (0xB14C6 suspend aussi les actions de la souris, § 6.7).
const INTERFACE_B14BD = 0xB14BD, INTERFACE_B14C6 = 0xB14C6, INTERFACE_B14D2 = 0xB14D2;
// Le bas de la zone désignable : les objets plus bas sont sous le panneau de commande. Écrit par
// 0x4DFAC (qui dessine le panneau) : la hauteur exacte, non établie.
const BAS_DE_LA_VUE = 0xB9525;
const COMPTES_DU_PARC = 0xD3814;   // pointeur : +0x2C8 la cible de l'outil 0xE
const CIBLE = 0x2C8;
const FICHE_DU_PARC = 0xD3818;     // pointeur : +0x18 parc ouvert
const PARC_OUVERT = 0x18;
const CATALOGUE_DES_BOUTIQUES = 0xD3C62;  // fiches de 107 octets : +0x24 la famille, 8 jeu d'adresse
const JEU_D_ADRESSE = 8;
const ETATS_D_EMBAUCHE = 0xD35EC;  // mot +0x2C de la fiche du métier (0xD35C0, 0x36 octets)
const AMUSEUR = 2, MECANICIEN = 8, AGENT_D_ENTRETIEN = 0x16;
const MECANICIEN_APPELE = 0x12;    // l'état du mécanicien envoyé à une attraction
const FIGURE_DU_MECANICIEN_APPELE = 0xBE;
// Les fenêtres (0x35F21, table 0xB762D, 21 octets par fenêtre), et l'écran de chacune (+0xA).
const FENETRE_VISITEUR = 6;        // écran 0x42
const FENETRE_AGENT_D_ENTRETIEN = 7, FENETRE_AMUSEUR = 8, FENETRE_MECANICIEN = 9;  // écran 0x1C
const FENETRE_BOUTIQUE = 0xC;      // écran 0x16
const FENETRE_ATTRACTION = 0xD;    // écran 0x14
const FENETRE_JEU_D_ADRESSE = 0x11;  // écran 0x23
const FENETRE_TOILETTES = 0x15;    // écran 0x60

// Le son (retro-ingenierie.md § 9).
const MUSIQUE_INITIALISEE = 0xBA714;   // octet
const MUSIQUE_PERMISE = 0xBA715;   // octet : la musique allumée, que bascule MUSIQUE (§ 11.10)
const MORCEAU_EN_COURS = 0xBA71A;  // mot : 0 = aucun
const DESACCORD_EN_COURS = 0xBA828;  // octet : posé par 0x66BA0 quand il désaccorde
const DESACCORD_A_REPRENDRE = 0xBA829; // octet : 0x66BA0 repart alors du centre
const MORCEAU_SOS = 0xD7984;       // mot long : le morceau pour le pilote
const MESSAGE_MIDI = 0xD7BD8;      // 3 octets

// --- les fonctions appelées ------------------------------------------------------------------------
const DESSINER_OBJET = 0x209B5;        // (objet graphique, x, y)
const TRACER_IMAGE = 0x5EC9C;          // (x, y, image), basse résolution
const TRACER_IMAGE_MARQUEE = 0x55BD4;  // (x, y, image), haute résolution : marque les blocs touchés
const TRACER_EN_REDUCTION = 0x67182;   // (objet graphique, x, y, largeur, hauteur)
const TRACER_IMAGE_A_L_ECHELLE = 0x66DFA;  // (image, x, y, largeur, hauteur), plus bas
const DESSINER_AVEC_PASSAGERS = 0x69840;   // (attraction, x, y), plus bas
const DESIGNER = 0x20FF5;              // (objet, x, y), plus bas
const MARQUER_ZONE_SALE = 0x54D38;     // (x, y, largeur, hauteur), ecran.js
const HASARD = 0x18B92;
const PREMIER_OBJET_DU_TYPE = 0x204B9; // (cellule, type)
const JOUER_UN_BRUITAGE_UNIQUE = 0x80FE0;  // (propriétaire, bruitage), sauf s'il joue déjà
// (propriétaire, bruitage, 3, volume) : avec 3, lance le bruitage en boucle sans fin, qui monte vers le
// volume donné (0x805A4, l'ambiance, retro-ingenierie.md § 9.3)
const LANCER_UNE_AMBIANCE = 0x80568;
const AMBIANCE_DU_PARC = 0x15;          // le bruitage : la rumeur de la foule ? non établi
const VOLUME_DE_L_AMBIANCE = 0xB14B4;   // octet
const OUVRIR_UNE_FENETRE = 0x35F21;    // (numéro de fenêtre)
const ENVOYER_AU_PILOTE_MIDI = 0x87202;    // (morceau, message, sélecteur, longueur)

// --- les outils ------------------------------------------------------------------------------------

function objetDuParc(jeu, numero) {
  return (motLong(jeu, OBJETS_DU_PARC) + numero * TAILLE_OBJET) >>> 0;
}

function numeroDObjet(jeu, objet) {
  return u16(diviser((objet - motLong(jeu, OBJETS_DU_PARC)) | 0, TAILLE_OBJET));
}

function objetGraphique(jeu, index) {
  return (motLong(jeu, OBJETS_GRAPHIQUES) + index * 8) >>> 0;
}

// Le morceau numéro n ; la chaîne s'arrête au morceau 0, au début de la table.
function morceau(jeu, n) {
  return (motLong(jeu, MORCEAUX) + n * 10) >>> 0;
}

function finDeChaine(jeu, m) {
  return m <= motLong(jeu, MORCEAUX);
}

function suivant(jeu, m) {
  return morceau(jeu, mot(jeu, m + 8));
}

// L'image numéro `decalage` (en octets) de la table des images ; le décalage 0, le début de la
// table, veut dire « pas d'image ».
function image(jeu, decalage) {
  return (motLong(jeu, IMAGES) + decalage) >>> 0;
}

function estUneImage(jeu, img) {
  return img > motLong(jeu, IMAGES);
}

// Trace une image en (x, y), avec les drapeaux déjà posés. En haute résolution, le tracé marque en
// plus les blocs d'écran touchés (§ 6.6).
function tracer(jeu, x, y, img) {
  jeu.appeler((jeu.m8[MODE_AFFICHAGE] & 1) ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE, x, y, img);
}

// Trace le morceau m à son décalage du point (x, y), ses drapeaux posés pour le traceur. Les
// coordonnées sont additionnées sur 16 bits.
//
// Hors du jeu d'origine : réglage « animations intercalées » allumé, le morceau tracé est noté, en
// lecture seule (animations-intercalees.js). Éteint, un test.
function tracerLeMorceau(jeu, m, img, x, y) {
  ecrireMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, m + 6));
  const px = s16(x + motSigne(jeu, m + 2)), py = s16(y + motSigne(jeu, m + 4));
  if (observation.poses) observation.poses.push(m, img, px, py, observation.passager);
  tracer(jeu, px, py, img);
}

// La place fine d'un objet dans sa case, en pixels de l'espace logique : la colonne fine avance
// d'une largeur de tuile par case, la rangée fine d'un tiers de tuile vers la droite et d'une
// hauteur de tuile vers le bas. Le programme n'a pas de hauteur de tuile ici mais des décalages
// écrits en dur, choisis par `mode == 8` : rangée fine / 16 et / 8 en basse résolution (tuiles de
// 48x32), / 32 et / 16 en haute (24x16).
function decalageFin(jeu, objet) {
  const largeur = mot(jeu, LARGEUR_TUILE);
  const colonne = jeu.m8[objet + 6], rangee = jeu.m8[objet + 8];
  const haute = mot(jeu, MODE_AFFICHAGE) === 8;
  const dx = ((largeur * colonne) >> 8) + (rangee >> (haute ? 5 : 4));
  const dy = haute ? (rangee >> 3) >> 1 : rangee >> 3;
  return [dx, dy];
}

// Trace l'image d'un passager `img` à la place du morceau m, dont l'image est `imgPlace` : centrée
// sur elle, et posée sur le même pied.
function tracerALaPlace(jeu, m, imgPlace, img, x, y) {
  const px = s16(x) - (jeu.m8[img + 4] >> 1) + (jeu.m8[imgPlace + 4] >> 1);
  const py = y - jeu.m8[img + 5] + jeu.m8[imgPlace + 5];
  tracerLeMorceau(jeu, m, img, px, py);
}

// L'image du passager `p` à une place dont l'image est celle d'un visiteur de la sorte 0 : cherchée
// dans la ligne 0 de la table des équivalents, prise dans la ligne de sa sorte. Rend le décalage de
// l'image, ou −1 si l'image de la place n'est pas dans la table.
function imageEquivalente(jeu, m, p) {
  const imagePlace = mot(jeu, m);
  for (let k = 0; k < NOMBRE_D_EQUIVALENTES; k++) {
    if (mot(jeu, IMAGES_EQUIVALENTES + 2 * k) !== imagePlace) continue;
    return mot(jeu, IMAGES_EQUIVALENTES + jeu.m8[p + SORTE] * LIGNE_D_EQUIVALENTES + 2 * k);
  }
  return -1;
}

// =================================================================================================
// 0x1D87A — dessiner une attraction (objet, x, y) : (x, y) est le coin haut gauche de sa case.
// =================================================================================================
export function dessinerAttraction(jeu, objet, x, y) {
  const mode = jeu.m8[objet + ETAT];
  if (mode === CHATEAU_ENVOLE) {
    dessinerLeChateauEnVol(jeu, objet, x, y);
    return;
  }
  if (mode === AVIONS_ENVOLES) {
    // Après l'explosion, les avions s'envolent : ils montent d'un pixel logique par pas, leur compte
    // +B1 allant de 2 à 200 (0x66AFD) ; après quoi l'attraction explose pour de bon (0x6662D).
    y = s16(y - jeu.m8[objet + ENVOL]);
  } else if (mode !== A_TOURS && mode !== A_BOUEES && mode !== A_TRAIN && mode !== SPECTACLE) {
    return;
  }

  const fiche = CATALOGUE + mot(jeu, objet + GENRE);
  reclamerLaMusique(jeu, objet, fiche);

  const [dx, dy] = decalageFin(jeu, objet);
  x = s16(x) + dx;
  y = s16(y) + dy;

  const usure = mot(jeu, objet + USURE), seuil = jeu.m8[fiche + FICHE_SEUIL_D_USURE];
  if (usure < seuil) {
    if (mot(jeu, objet + IMAGE) !== 0) jeu.appeler(DESSINER_AVEC_PASSAGERS, objet, s16(x), s16(y));
  } else {
    // Usée, l'attraction tremble : −1, 0, +1, +2 pixels selon le pas de simulation. Elle est alors
    // tracée même sans objet graphique (+A nul : l'objet graphique 0).
    y += (jeu.m8[PAS_DE_SIMULATION] & 3) - 1;
    jeu.appeler(DESSINER_AVEC_PASSAGERS, objet, s16(x), s16(y));
    // L'animation de l'usure avance d'une image par dessin, sauf une fois sur `marge` pas, la marge
    // étant ce qui reste d'usure avant le double du seuil, où l'attraction explose. Curieux :
    // l'effet est à peine visible, un arrêt d'une image de loin en loin, de plus en plus fréquent à
    // l'approche de l'explosion ; l'intention (une animation d'autant plus rapide ?) n'est pas
    // établie. Le reste est celui d'une division non signée du pas de simulation.
    const marge = s16(2 * seuil - usure);
    if (marge <= 1 || jeu.etat.pasDeSimulation % marge !== 0) {
      ecrireMot(jeu, objet + FUMEE, mot(jeu, objetGraphique(jeu, mot(jeu, objet + FUMEE)) + 6));
    }
    jeu.appeler(DESSINER_OBJET, mot(jeu, objet + FUMEE), s16(x), s16(y));
  }

  if (mot(jeu, BOUTON_GAUCHE_MAINTENU) !== 0) jeu.appeler(DESIGNER, objet, u16(x), u16(y));

  // Un spectacle : le décor (?) par-dessus, et le numéro pendant qu'il se joue.
  if (jeu.m8[objet + ETAT] === SPECTACLE) {
    if (mot(jeu, objet + DECOR_DU_SPECTACLE) !== 0) {
      jeu.appeler(DESSINER_OBJET, mot(jeu, objet + DECOR_DU_SPECTACLE), s16(x), s16(y));
    }
    if (mot(jeu, objet + PHASE) === EN_MARCHE) {
      jeu.appeler(DESSINER_OBJET, mot(jeu, objet + IMAGE_DU_NUMERO), s16(x), s16(y));
    }
  }
}

// Une attraction visible dont le genre a une musique (fiche +B7) la réclame pendant qu'on la dessine,
// si elle n'est pas à l'arrêt (phase non nulle). La première dessinée l'emporte, sauf si
// l'attraction sélectionnée vient après elle (dessin-carte.js).
function reclamerLaMusique(jeu, objet, fiche) {
  if (mot(jeu, objet + PHASE) === 0) return;
  const selectionnee = objetDuParc(jeu, mot(jeu, SELECTION));
  if (mot(jeu, MUSIQUE) === 1 && selectionnee !== objet) return;
  if (jeu.m8[fiche + FICHE_MUSIQUE] === 0) return;
  ecrireMotLong(jeu, ATTRACTION_MUSICALE, objet);
  ecrireMot(jeu, MUSIQUE, 1);
}

// Le château gonflable qui a explosé (mode 0x24) s'envole en grossissant. À chaque pas, 0x66976 le
// déplace (sa place fine change), augmente son compte +B1, et son altitude +5F d'une vitesse +65 qui
// décroît d'un par pas : il monte, puis retombe, et il est détruit quand l'altitude repasse sous
// zéro. Seul le premier morceau de son objet graphique est tracé, grossi dans le rapport
// (L + 10 × compte) / L, L étant l'emprise de l'objet graphique sur chaque axe (l'échelle est gardée
// en 256es, arrondie vers le bas) ; son décalage est grossi de même. L'altitude est divisée par 2 en
// basse résolution, par 4 en haute, où les tuiles sont deux fois plus petites. Une emprise nulle, ou
// trop petite pour le compte, fait tomber l'échelle à zéro : division par zéro, dans l'original
// comme ici. Non exercé par les scénarios.
function dessinerLeChateauEnVol(jeu, objet, x, y) {
  const g = objetGraphique(jeu, mot(jeu, objet + IMAGE));
  const [dx, dy] = decalageFin(jeu, objet);
  x = s16(x) + dx;
  y = s16(y) + dy;
  const gonflement = jeu.m8[objet + ENVOL] * 10;
  const echelleX = diviser(jeu.m8[g + 2] << 8, jeu.m8[g + 2] + gonflement);
  const echelleY = diviser(jeu.m8[g + 3] << 8, jeu.m8[g + 3] + gonflement);
  const m = morceau(jeu, mot(jeu, g));
  const img = image(jeu, mot(jeu, m));
  if (!estUneImage(jeu, img)) return;
  const ddx = diviser(motSigne(jeu, m + 2) << 8, u16(echelleX));
  const ddy = diviser(motSigne(jeu, m + 4) << 8, u16(echelleY));
  y = s16(y) - (mot(jeu, objet + ALTITUDE_DU_CHATEAU) >> ((jeu.m8[MODE_AFFICHAGE] & 8) ? 2 : 1));
  const hauteur = u16(diviser(jeu.m8[img + 5] << 8, u16(echelleY)));
  const largeur = u16(diviser(jeu.m8[img + 4] << 8, u16(echelleX)));
  jeu.appeler(TRACER_IMAGE_A_L_ECHELLE, img, s16(x + ddx), s16(y + ddy), largeur, hauteur);
}

// =================================================================================================
// 0x69840 — dessiner une attraction et ses passagers (objet, x, y) : (x, y) est sa place fine.
// =================================================================================================
//
// Trois façons de parcourir les morceaux de son objet graphique :
//   AVEC_PASSAGERS  chaque place reçoit le passager suivant d'un anneau de 40 entrées (plus bas) ;
//   SANS_PASSAGERS  les places sont sautées, le reste tracé ;
//   LABYRINTHE      le premier morceau, puis un visiteur animé.
// Les drapeaux du traceur sont remis à zéro à la fin.
const AVEC_PASSAGERS = 0, SANS_PASSAGERS = 2, LABYRINTHE = 4;
const TAILLE_DE_L_ANNEAU = 0x28;
const PLACE_VIDE = -1;

export function dessinerAttractionAvecPassagers(jeu, objet, x, y) {
  const g = objetGraphique(jeu, mot(jeu, objet + IMAGE));
  if (mot(jeu, FACON_DE_DESSINER) !== 0) {
    // La vue réduite : l'objet graphique entier, en miniature, sans passagers. Non exercé.
    if (jeu.m8[FACON_DE_DESSINER] & VUE_REDUITE) {
      const hauteur = u16(diviser(jeu.m8[g + 3], mot(jeu, REDUCTION_HAUTEUR)));
      const largeur = u16(diviser(jeu.m8[g + 2], mot(jeu, REDUCTION_LARGEUR)));
      jeu.appeler(TRACER_EN_REDUCTION, mot(jeu, objet + IMAGE), s16(x), s16(y), largeur, hauteur);
    }
    ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
    return;
  }

  const fiche = CATALOGUE + mot(jeu, objet + GENRE);
  const premier = morceau(jeu, mot(jeu, g));
  const anneau = new Int32Array(TAILLE_DE_L_ANNEAU);
  let facon = SANS_PASSAGERS;
  let prochaine = 0;      // l'entrée de l'anneau d'où l'on repart, en descendant
  let nombre = 0;         // le labyrinthe : les entrées tirables

  if (mot(jeu, objet + PREMIER_A_BORD) !== 0) {
    const disposition = jeu.m8[fiche + FICHE_DISPOSITION];
    if (disposition <= 1) {
      prochaine = placerEnTournant(jeu, objet, fiche, anneau);
      facon = AVEC_PASSAGERS;
    } else if (disposition === 5 || disposition === 7 || (disposition === 9 && mot(jeu, objet + PHASE) !== 0)) {
      prochaine = placerSurPlacesFixes(jeu, objet, fiche, anneau);
      facon = AVEC_PASSAGERS;
    } else if (disposition === 8) {
      if (mot(jeu, objet + VISITEUR_MONTRE) === 0) nombre = rangerLesVisiteursDuLabyrinthe(jeu, objet, anneau);
      facon = LABYRINTHE;
    }
  }

  // Hors du jeu d'origine : les animations intercalées relèvent, en lecture seule, ce que l'attraction
  // recouvre et ce qu'elle trace (animations-intercalees.js). Réglage éteint, rien.
  debutDAttraction(jeu, objet, x, y);
  if (facon === AVEC_PASSAGERS) tracerAvecPassagers(jeu, objet, premier, anneau, prochaine, x, y);
  else if (facon === SANS_PASSAGERS) tracerSansPassagers(jeu, premier, x, y);
  else tracerLeLabyrinthe(jeu, objet, premier, anneau, nombre, x, y);
  finDAttraction(jeu);
  ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
}

// Range dans l'anneau les passagers à bord, dans l'ordre de leur chaîne (mot +47) : 36 au plus.
// `valeur` dit ce qui est rangé (l'adresse du passager, ou son numéro). Rend le nombre rangé et le
// dernier numéro lu — celui du 37e passager quand la chaîne est trop longue.
function rangerLesPassagers(jeu, objet, anneau, valeur) {
  let n = 0, garde = 0;
  let numero = mot(jeu, objet + PREMIER_A_BORD);
  let p = objetDuParc(jeu, numero);
  for (;;) {
    anneau[u16(n)] = valeur(p, numero);
    n++;
    if (mot(jeu, p + PREMIER_A_BORD) === 0) break;
    numero = mot(jeu, p + PREMIER_A_BORD);
    p = objetDuParc(jeu, numero);
    if (u16(garde++) >= 0x23) break;
  }
  return [n, numero];
}

// L'anneau des places : `capacite` entrées non nulles, les passagers puis des places vides (−1) ;
// s'il y a plus de passagers que de places, les premiers rangés sont effacés. Le reste est à 0, et
// le tracé saute les entrées nulles. La capacité est un mot signé ; le programme la garde sur 32 bits
// avec, en moitié haute, celle de l'adresse de la fiche, que seule la moitié basse des calculs voit.
//
// Une capacité négative (un mot au-delà de 0x7FFF, impossible : la recherche la porte au plus au
// double de celle de référence, 30 au plus) ferait effacer au-delà de l'anneau, dans les variables
// du programme d'origine rangées après lui : la 41e entrée est un reste de calcul qui ne sert plus,
// la 42e l'adresse de l'objet graphique, les suivantes jusqu'à son adresse de retour. Non reproduit :
// la réécriture s'arrête sur une erreur dès que l'effacement dépasserait la 41e entrée.
function effacerLeSurplus(anneau, n, capacite) {
  for (let j = s16(n - capacite - 1); j >= 0; j = s16(j - 1)) {
    if (j > TAILLE_DE_L_ANNEAU) throw new Error('0x69840 : capacité négative, effacement hors de l\'anneau');
    if (j < TAILLE_DE_L_ANNEAU) anneau[j] = 0;
  }
}

function completerLAnneau(anneau, n) {
  for (; u16(n) < TAILLE_DE_L_ANNEAU; n++) anneau[u16(n)] = 0;
}

// Les places vides, de n jusqu'à la capacité. Rend le nouveau n.
//
// Anomalie, reproduite dans son effet : l'anneau n'a que 40 entrées, et rien ne borne ce remplissage.
// Au-delà, le programme d'origine écrit −1 dans ses propres variables, rangées après l'anneau sur sa
// pile : la 41e entrée tombe sur un reste de calcul qui ne sert plus, la 42e sur l'adresse de l'objet
// graphique, qu'il relit aussitôt pour tracer — une lecture à l'adresse 0xFFFFFFFF, qui arrête le
// programme (et la transcription). Il y faut une fiche de plus de 41 places, et moins de passagers
// que de places : un spectacle dont la recherche aurait porté les 24 places de référence au-delà de
// 41 (elle va jusqu'au double, 0x53F13), avec au moins un spectateur. Un plantage du jeu de 1994,
// vraisemblablement (non vérifié en jeu). Non exercé par les scénarios.
function remplirDePlacesVides(anneau, n, capacite) {
  for (; u16(n) < capacite; n++) {
    if (u16(n) > TAILLE_DE_L_ANNEAU) {
      throw new Error('0x69840 : l\'anneau des places déborde sur l\'adresse de l\'objet graphique');
    }
    if (u16(n) < TAILLE_DE_L_ANNEAU) anneau[u16(n)] = PLACE_VIDE;
  }
  return n;
}

// Dispositions 0 et 1 : les places tournent. La première place reçoit le passager qui suit, dans
// l'anneau, l'entrée (boucles mod capacité) + n − capacité : à chaque boucle achevée de l'animation,
// chacun avance d'une place. Rend l'entrée de départ (seuls ses 16 bits bas comptent).
function placerEnTournant(jeu, objet, fiche, anneau) {
  let [n] = rangerLesPassagers(jeu, objet, anneau, (p) => p);
  const capacite = s16(mot(jeu, fiche + FICHE_CAPACITE));
  const tour = modulo(motLong(jeu, objet + BOUCLES), capacite);
  let prochaine = tour + n - capacite;
  if (u16(n) > capacite) {
    effacerLeSurplus(anneau, n, capacite);
  } else if (u16(n) < capacite) {
    prochaine = modulo(u16(n) + tour, capacite);
    n = remplirDePlacesVides(anneau, n, capacite);
  }
  completerLAnneau(anneau, n);
  return prochaine;
}

// Le reste d'une division non signée (div) par la capacité étendue en signe sur 32 bits.
function modulo(dividende, capacite) {
  const diviseur = capacite >>> 0;
  if (diviseur === 0) throw new Error('division par zero');
  return (dividende >>> 0) % diviseur;
}

// Dispositions 5, 7 et 9 : les places sont fixes. On repart du dernier passager rangé : la première
// place reçoit le dernier de la chaîne, et ainsi de suite en la remontant ; puis viennent les
// places vides.
function placerSurPlacesFixes(jeu, objet, fiche, anneau) {
  let [n] = rangerLesPassagers(jeu, objet, anneau, (p) => p);
  const capacite = s16(mot(jeu, fiche + FICHE_CAPACITE));
  const prochaine = n;
  if (u16(n) > capacite) {
    effacerLeSurplus(anneau, n, capacite);
  } else if (u16(n) < capacite) {
    n = remplirDePlacesVides(anneau, n, capacite);
  }
  completerLAnneau(anneau, n);
  return prochaine;
}

// Disposition 8, le labyrinthe : les numéros des passagers, puis trois fois l'opposé du dernier
// numéro lu, qui tirera une apparition. Rend le nombre d'entrées tirables.
function rangerLesVisiteursDuLabyrinthe(jeu, objet, anneau) {
  let [n, dernier] = rangerLesPassagers(jeu, objet, anneau, (p, numero) => s16(numero));
  for (let j = 0; j < 3; j++) anneau[u16(n++)] = -s16(dernier);
  for (let j = n; s16(j) < TAILLE_DE_L_ANNEAU; j++) anneau[s16(j)] = 0;
  return n;
}

function tracerSansPassagers(jeu, premier, x, y) {
  for (let m = premier; !finDeChaine(jeu, m); m = suivant(jeu, m)) {
    if (jeu.m8[m + 6] & PLACE_DE_PASSAGER) continue;
    const img = image(jeu, mot(jeu, m));
    if (estUneImage(jeu, img)) tracerLeMorceau(jeu, m, img, x, y);
  }
}

// Chaque place prend l'entrée non nulle suivante de l'anneau, en descendant (de 0, on repart de
// 39), et l'efface. Une place vide (−1) ne trace rien.
function tracerAvecPassagers(jeu, objet, premier, anneau, prochaine, x, y) {
  for (let m = premier; !finDeChaine(jeu, m); m = suivant(jeu, m)) {
    if ((jeu.m8[m + 6] & PLACE_DE_PASSAGER) === 0) {
      const img = image(jeu, mot(jeu, m));
      if (estUneImage(jeu, img)) tracerLeMorceau(jeu, m, img, x, y);
      continue;
    }
    if (mot(jeu, objet + PREMIER_A_BORD) === 0) continue;
    let p;
    let tours = 0;
    do {
      if (u16(prochaine) === 0) prochaine = TAILLE_DE_L_ANNEAU;
      prochaine--;
      p = anneau[u16(prochaine)];
      // L'anneau compte exactement `capacité` entrées non nulles. Une image qui aurait plus de
      // places que la capacité de la fiche (celle-ci ne fait que croître, 0x53F13) épuiserait
      // l'anneau, et le programme d'origine bouclerait ici sans fin ; la réécriture s'arrête sur
      // une erreur.
      if (++tours > TAILLE_DE_L_ANNEAU) throw new Error('0x69840 : anneau des places vide');
    } while (p === 0);
    anneau[u16(prochaine)] = 0;
    if (p === PLACE_VIDE) continue;
    observation.passager = p >>> 0;      // hors du jeu d'origine (animations-intercalees.js)
    tracerUnPassager(jeu, objet, m, p >>> 0, x, y);
    observation.passager = 0;
  }
}

function tracerUnPassager(jeu, objet, m, p, x, y) {
  if (motSigne(jeu, objet + COMPTEUR_DU_NUMERO) < 0) {
    // L'entracte d'un spectacle : l'une des deux images de sa sorte.
    const imgPlace = image(jeu, mot(jeu, m));
    const parite = mot(jeu, objet + COMPTEUR_DU_NUMERO) & 1;
    const img = image(jeu, mot(jeu, IMAGES_D_ENTRACTE + jeu.m8[p + SORTE] * 4 + parite * 2));
    if (estUneImage(jeu, img)) tracerALaPlace(jeu, m, imgPlace, img, x, y);
  } else if (jeu.m8[p + SORTE] === 0) {
    // La sorte 0 : l'image de la place elle-même.
    const img = image(jeu, mot(jeu, m));
    if (estUneImage(jeu, img)) tracerLeMorceau(jeu, m, img, x, y);
  } else {
    // Une autre sorte : l'image équivalente ; rien si l'image de la place n'est pas dans la table.
    // (Le programme renonce aussi en vue réduite, 0xD667C = 8, impossible ici : il n'arrive à ce
    // tracé qu'avec 0xD667C nul.)
    const decalage = imageEquivalente(jeu, m, p);
    if (decalage < 0) return;
    const img = image(jeu, decalage);
    if (estUneImage(jeu, img)) tracerALaPlace(jeu, m, image(jeu, mot(jeu, m)), img, x, y);
  }
}

// Le labyrinthe : on n'y voit qu'un visiteur à la fois, dans une animation, par-dessus le premier
// morceau de l'objet graphique. Quand aucun n'est montré (+4D nul), on en tire un parmi les entrées
// de l'anneau, autre que le précédent (+85), en au plus autant d'essais que d'entrées :
//   - un numéro positif, un passager : il prend l'image de la colonne 0x1A de sa sorte, à la place
//     de l'attraction ;
//   - un numéro négatif (trois entrées sur n + 3), le dernier passager : il prend l'une des neuf
//     apparitions, tirée au hasard, avec son décalage.
// Tous les 4 pas, l'animation avance ; à sa dernière image (bit 0 de l'octet +5 de l'objet
// graphique), le visiteur disparaît et +4D revient à 0 : un autre sera tiré au dessin suivant.
// Anomalie reproduite : le précédent (+85) est lu comme un mot non signé et le tirage comme un mot
// signé ; un tirage négatif n'est donc jamais reconnu comme le précédent.
function tracerLeLabyrinthe(jeu, objet, premier, anneau, nombre, x, y) {
  const imgPremier = image(jeu, mot(jeu, premier));
  if (estUneImage(jeu, imgPremier)) tracerLeMorceau(jeu, premier, imgPremier, x, y);

  let ddx = 0, ddy = 0;
  let numero = motSigne(jeu, objet + VISITEUR_MONTRE);
  let visiteur;
  if (numero === 0) {
    for (let essai = 0; u16(essai) < u16(nombre); essai++) {
      const k = diviserReste(jeu.appeler(HASARD) & 0xFFFF, u16(nombre));
      numero = s16(anneau[s16(k)]);
      if (mot(jeu, objet + VISITEUR_MONTRE_AVANT) !== numero) break;
    }
    ecrireMot(jeu, objet + VISITEUR_MONTRE, numero);
    ecrireMot(jeu, objet + VISITEUR_MONTRE_AVANT, numero);
    if (numero > 0) {
      visiteur = objetDuParc(jeu, numero);
      const figure = mot(jeu, IMAGE_DANS_LE_LABYRINTHE + jeu.m8[visiteur + SORTE] * 0x24);
      ecrireMot(jeu, visiteur + IMAGE, mot(jeu, motLong(jeu, FIGURES) + figure * 2));
    } else {
      visiteur = objetDuParc(jeu, -numero);
      const k = diviserReste(jeu.appeler(HASARD) & 0xFFFF, NOMBRE_D_APPARITIONS);
      ecrireMot(jeu, visiteur + IMAGE, mot(jeu, motLong(jeu, FIGURES) + mot(jeu, APPARITIONS + k * 6) * 2));
      ecrireMot(jeu, APPARITION_TIREE, k);
      ddx = motSigne(jeu, APPARITIONS + k * 6 + 2);
      ddy = motSigne(jeu, APPARITIONS + k * 6 + 4);
    }
  } else if (numero < 0) {
    visiteur = objetDuParc(jeu, -numero);
    const k = mot(jeu, APPARITION_TIREE);
    ddx = motSigne(jeu, APPARITIONS + k * 6 + 2);
    ddy = motSigne(jeu, APPARITIONS + k * 6 + 4);
  } else {
    visiteur = objetDuParc(jeu, numero);
  }

  let g = objetGraphique(jeu, mot(jeu, visiteur + IMAGE));
  if ((jeu.m8[PAS_DE_SIMULATION] & 3) === 0) {
    ecrireMot(jeu, visiteur + IMAGE, mot(jeu, g + 6));
    g = objetGraphique(jeu, mot(jeu, visiteur + IMAGE));
    if (jeu.m8[g + 5] & 1) {
      ecrireMot(jeu, objet + VISITEUR_MONTRE, 0);
      return;
    }
  }
  for (let m = morceau(jeu, mot(jeu, g)); !finDeChaine(jeu, m); m = suivant(jeu, m)) {
    const img = image(jeu, mot(jeu, m));
    if (estUneImage(jeu, img)) tracerLeMorceau(jeu, m, img, x + ddx, y + ddy);
  }
}

// Le reste d'une division signée (idiv) de nombres positifs.
function diviserReste(a, b) {
  if (b === 0) throw new Error('division par zero');
  return a % b;
}

// =================================================================================================
// 0x1DD27 — dessiner un véhicule (objet, x, y) : (x, y) est le coin haut gauche de sa case.
// =================================================================================================
export function dessinerVehicule(jeu, objet, x, y) {
  let hauteur = 0;
  switch (jeu.m8[objet + ETAT]) {
    case WAGON_EN_GARE:
      break;
    case WAGON_EN_MARCHE:
    case WAGON_DU_MONORAIL: {
      // Sur une attraction usée (au-delà du seuil de son genre), le wagon qui roule tremble : de 0 à
      // 3 pixels vers le haut, au hasard.
      const attraction = objetDuParc(jeu, mot(jeu, objet + ATTRACTION_DU_WAGON));
      const seuil = jeu.m8[CATALOGUE + mot(jeu, attraction + GENRE) + FICHE_SEUIL_D_USURE];
      if (mot(jeu, attraction + USURE) > seuil) hauteur -= jeu.appeler(HASARD) & 3;
      break;
    }
    case BUS_EN_ATTENTE:
      // Le coup de klaxon avant de repartir ? (bruitage 4, non établi)
      if (mot(jeu, objet + COMPTE_A_REBOURS) === 1) jeu.appeler(JOUER_UN_BRUITAGE_UNIQUE, 0, 4);
      dessinerLeBus(jeu, objet, x, y);
      return;
    case BUS_EN_ROUTE:
    case BUS_A_L_ARRET:
      dessinerLeBus(jeu, objet, x, y);
      return;
    case WAGON_EN_VOL:
      dessinerLeWagonEnVol(jeu, objet, x, y);
      return;
    default:
      return;
  }
  dessinerUnWagon(jeu, objet, x, y, hauteur);
}

// Un wagon sur sa voie. Le morceau de voie est cherché sur la case du wagon, sinon sur celle du
// dernier morceau atteint (+10) ; le programme cherche deux fois sur la même case quand la première
// recherche a trouvé (0x204B9 ne fait que lire). L'élément de voie de ce morceau donne l'image du
// wagon selon sa direction, et son altitude : la hauteur de la voie (+79, 24 pixels par niveau ; le
// monorail roule toujours à un niveau), plus une pente selon la place fine du wagon dans la case,
// en 256es, et un décalage (+12 à +14 de l'élément). En haute résolution, l'altitude est divisée
// par deux ; en vue réduite, par le diviseur des hauteurs.
function dessinerUnWagon(jeu, objet, x, y, hauteur) {
  const grille = motLong(jeu, GRILLE);
  let cellule = (grille + (((jeu.m8[objet + 9] << 6) + jeu.m8[objet + 7]) << 2)) >>> 0;
  if (jeu.appeler(PREMIER_OBJET_DU_TYPE, cellule, MORCEAU_DE_VOIE) === 0) {
    cellule = (grille + motSigne(jeu, objet + DERNIERE_CASE_DE_VOIE) * 4) >>> 0;
  }
  const voie = jeu.appeler(PREMIER_OBJET_DU_TYPE, cellule, MORCEAU_DE_VOIE) >>> 0;
  if (voie === 0) {
    dessinerHorsVoie(jeu, objet, x, y);
    return;
  }

  const elements = motLong(jeu, ELEMENTS_DE_VOIE + mot(jeu, voie + GENRE_DE_VOIE) * 10);
  const element = (elements + jeu.m8[voie + ELEMENT_DE_VOIE] * TAILLE_ELEMENT) >>> 0;
  const direction = jeu.m8[objet + DIRECTION];
  const figure = mot(jeu, element + 5 + direction * 2);
  const g = objetGraphique(jeu, mot(jeu, motLong(jeu, FIGURES) + figure * 2));

  // Le bruit de la voie, joué par la tête du train seule : celui de l'élément dans sa direction
  // quand le train roule, sinon celui de l'arrêt en gare tant que le wagon vient de s'y arrêter.
  if (motLong(jeu, objet + RANG_DANS_LE_TRAIN) === 0) {
    const bruitage = jeu.m8[element + 0x15 + direction];
    if (bruitage !== 0 && jeu.m8[objet + ETAT] === WAGON_EN_MARCHE) {
      jeu.appeler(JOUER_UN_BRUITAGE_UNIQUE, 0, bruitage);
    } else if (jeu.m8[objet + DRAPEAUX_DU_WAGON] & 1) {
      jeu.appeler(JOUER_UN_BRUITAGE_UNIQUE, 0, BRUITAGE_EN_GARE);
    }
  }

  const [dx, dy] = decalageFin(jeu, objet);
  x = s16(x) + dx;
  y = s16(y) + dy;
  hauteur = s16(hauteur) - ((s8(jeu.m8[element + 0x12]) * jeu.m8[objet + 6] / 256) | 0);
  hauteur = s16(hauteur) - ((s8(jeu.m8[element + 0x13]) * jeu.m8[objet + 8] / 256) | 0);
  hauteur += s8(jeu.m8[element + 0x14]);
  if (mot(jeu, voie + GENRE_DE_VOIE) === VOIE_DU_MONORAIL) hauteur -= 0x18;
  else hauteur -= jeu.m8[voie + HAUTEUR_DE_VOIE] * 0x18;
  const diviseur = (jeu.m8[FACON_DE_DESSINER] & VUE_REDUITE) ? mot(jeu, REDUCTION_HAUTEUR) : 1;
  hauteur = diviser(s16(hauteur), diviseur);
  y = s16(y) + (mot(jeu, MODE_AFFICHAGE) === 8 ? (s16(hauteur) / 2) | 0 : s16(hauteur));

  // Les passagers, un par place dans l'ordre de leur chaîne (mot +47). Le monorail ne les montre
  // que dans son état de marche, 0x22 : en gare, ses places sont sautées, ses passagers aussi.
  let passager = objetDuParc(jeu, mot(jeu, objet + PREMIER_A_BORD));
  const objets = motLong(jeu, OBJETS_DU_PARC);
  for (let m = morceau(jeu, mot(jeu, g)); !finDeChaine(jeu, m); m = suivant(jeu, m)) {
    if (jeu.m8[m + 6] & PLACE_DE_PASSAGER) {
      if (passager <= objets) continue;
      if (mot(jeu, voie + GENRE_DE_VOIE) !== VOIE_DU_MONORAIL || jeu.m8[objet + ETAT] === WAGON_DU_MONORAIL) {
        tracerUnPassagerDuWagon(jeu, m, passager, x, y);
        ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
      }
      passager = objetDuParc(jeu, mot(jeu, passager + PREMIER_A_BORD));
      continue;
    }
    // Le programme compare ici l'adresse de l'image à 0, et non au début de la table : un morceau
    // sans image (décalage 0) trace l'entrée 0 de la table des images. Il saute l'image de décalage
    // 0xBA (ce qu'elle montre, non établi).
    const img = image(jeu, mot(jeu, m));
    if (img === 0 || mot(jeu, m) === 0xBA) continue;
    if (mot(jeu, FACON_DE_DESSINER) === VUE_REDUITE) {
      // En vue réduite : l'image à l'échelle de l'emprise réduite de l'objet graphique. Non exercé.
      const echelleX = diviser(jeu.m8[g + 2] << 8, mot(jeu, REDUCTION_LARGEUR));
      const echelleY = diviser(jeu.m8[g + 3] << 8, mot(jeu, REDUCTION_HAUTEUR));
      ecrireMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, m + 6));
      const hauteurImage = u16(diviser(jeu.m8[img + 5] << 8, u16(echelleY)));
      const largeurImage = u16(diviser(jeu.m8[img + 4] << 8, u16(echelleX)));
      const yImage = s16(diviser(motSigne(jeu, m + 4) << 8, u16(echelleY)) + s16(y));
      const xImage = s16(diviser(motSigne(jeu, m + 2) << 8, u16(echelleX)) + s16(x));
      jeu.appeler(TRACER_IMAGE_A_L_ECHELLE, img, xImage, yImage, largeurImage, hauteurImage);
    } else {
      tracerLeMorceau(jeu, m, img, x, y);
    }
    ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
  }
}

// Le passager d'un wagon : l'image équivalente de sa sorte, sans le cas particulier de la sorte 0
// (sa ligne de la table redonne l'image de la place) ni le contrôle d'une image nulle que fait
// 0x69840. Rien en vue réduite.
function tracerUnPassagerDuWagon(jeu, m, passager, x, y) {
  const imagePlace = mot(jeu, m);
  for (let k = 0; k < NOMBRE_D_EQUIVALENTES; k++) {
    if (mot(jeu, IMAGES_EQUIVALENTES + 2 * k) !== imagePlace) continue;
    if (mot(jeu, FACON_DE_DESSINER) === VUE_REDUITE) return;
    const img = image(jeu, mot(jeu, IMAGES_EQUIVALENTES + jeu.m8[passager + SORTE] * LIGNE_D_EQUIVALENTES + 2 * k));
    tracerALaPlace(jeu, m, image(jeu, imagePlace), img, x, y);
    return;
  }
}

// Un wagon qui ne trouve pas de voie, ni sur sa case ni sur celle du dernier morceau atteint : c'est
// alors son passager qui est tracé, au coin de la case du wagon (sans sa place fine ni son
// altitude), décalé selon la place fine du passager par une projection en losange étrangère au
// reste du jeu : (colonne − rangée) / 16 × 2 + 32 vers la droite, (colonne + rangée) / 32 × 2 vers
// le bas. L'objet graphique tracé est pris dans la table des figures au numéro « mot +A du passager
// + direction du wagon » : curieux, le mot +A d'un visiteur étant d'ordinaire un objet graphique et
// non un numéro de figure. Quand cela arrive, non établi ; non exercé par les scénarios.
function dessinerHorsVoie(jeu, objet, x, y) {
  const passager = objetDuParc(jeu, mot(jeu, objet + PREMIER_A_BORD));
  if (passager <= motLong(jeu, OBJETS_DU_PARC)) return;
  const colonne = jeu.m8[passager + 6], rangee = jeu.m8[passager + 8];
  x = s16(x) + ((colonne - rangee) / 16 | 0) * 2 + 0x20;
  y = s16(y) + ((colonne + rangee) / 32 | 0) * 2;
  const figure = mot(jeu, passager + IMAGE) + jeu.m8[objet + DIRECTION];
  jeu.appeler(DESSINER_OBJET, mot(jeu, motLong(jeu, FIGURES) + figure * 2), s16(x), s16(y));
}

// Le bus : l'avant, les sections de milieu côte à côte vers la droite, l'arrière. La première
// section de milieu est tracée au même point que l'avant. Son mot +A choisit le modèle, son mot +26
// le nombre de sections. Il joue son bruitage 3 au milieu de la colonne 36 (en approchant de l'arrêt
// de la démo, colonne 32 ; ailleurs, non établi).
//
// Au clic, s'il est sous le pointeur, on passe à l'écran 0x54, comme par un clic sur l'arrêt du bus
// (0x1803C, sol 0x88) : la boucle du parc (0x78CEF) y propose d'agrandir le bus. Lu dans 0x78CEF,
// non vérifié en jeu : après confirmation (0x78F89) et paiement (0x78943), le niveau du bus, octet
// +0x49 de la fiche du parc, monte d'un cran, sans dépasser l'octet +0x4A ; jusqu'au niveau 8, c'est
// le nombre de sections du premier modèle, au-delà, le second modèle (+A = 1) avec niveau − 9
// sections ; l'attrait du prix d'entrée (+0x48 de la fiche) est pris dans la table 0xB78CC. Le
// rectangle du bus va de la moitié de l'avant, à gauche du point de départ, jusqu'à la moitié de
// l'arrière, et de la hauteur de l'arrière jusqu'au point de départ ; les largeurs sont en vue
// réduite divisées par le diviseur des largeurs, pas celle de l'avant.
function dessinerLeBus(jeu, objet, x, y) {
  if (jeu.m8[objet + 7] === 0x24 && jeu.m8[objet + 6] === 0x80) jeu.appeler(JOUER_UN_BRUITAGE_UNIQUE, 0, 3);
  const [dx, dy] = decalageFin(jeu, objet);
  x = s16(x) + dx;
  y = s16(y) + dy;
  const entree = MORCEAUX_DU_BUS + mot(jeu, objet + IMAGE) * 6;
  const figure = (k) => mot(jeu, motLong(jeu, FIGURES) + mot(jeu, entree + 2 * k) * 2);
  const reduite = () => (jeu.m8[FACON_DE_DESSINER] & VUE_REDUITE) !== 0;

  const avant = figure(0);
  let bord = x;
  jeu.appeler(DESSINER_OBJET, avant, s16(bord), s16(y));
  const milieu = figure(1);
  for (let t = 0; u16(t) < mot(jeu, objet + SECTIONS_DU_BUS); t++) {
    jeu.appeler(DESSINER_OBJET, milieu, s16(bord), s16(y));
    const largeur = jeu.m8[objetGraphique(jeu, milieu) + 2];
    bord = s16(bord) + (reduite() ? diviser(largeur, mot(jeu, REDUCTION_LARGEUR)) : largeur);
  }
  const arriere = figure(2);
  jeu.appeler(DESSINER_OBJET, arriere, s16(bord), s16(y));
  const largeurArriere = jeu.m8[objetGraphique(jeu, arriere) + 2];
  bord = s16(bord) + ((reduite() ? diviser(largeurArriere, mot(jeu, REDUCTION_LARGEUR)) : largeurArriere) / 2 | 0);

  if (mot(jeu, CLIC_EN_ATTENTE) === 0) return;
  const sourisX = motSigne(jeu, SOURIS_X), sourisY = motSigne(jeu, SOURIS_Y);
  if (sourisX <= s16(x) - (jeu.m8[objetGraphique(jeu, avant) + 2] >> 1)) return;
  if (sourisX >= s16(bord)) return;
  if (sourisY <= s16(y) - jeu.m8[objetGraphique(jeu, arriere) + 3]) return;
  if (sourisY >= s16(y)) return;
  jeu.m8[CLIC_PRIS] = 1;
  ecrireMot(jeu, ECRAN, ECRAN_DU_BUS);
}

// Le wagon sorti de la voie (état 0x20) : un objet graphique tiré de la table des figures, 0x1E1
// pour le monorail, 0xA3 pour les autres, à son altitude (+98, qui décroît jusqu'à l'écrasement,
// vehicules.js), sans passager. Comme pour le wagon, une image nulle n'est pas reconnue. Non exercé
// par les scénarios.
function dessinerLeWagonEnVol(jeu, objet, x, y) {
  const [dx, dy] = decalageFin(jeu, objet);
  x = s16(x) + dx;
  y = s16(y) + dy - mot(jeu, objet + ALTITUDE_EN_VOL);
  const attraction = objetDuParc(jeu, mot(jeu, objet + ATTRACTION_DU_WAGON));
  const fiche = CATALOGUE + mot(jeu, attraction + GENRE);
  const numero = mot(jeu, fiche + FICHE_IDENTIFIANT) === MONORAIL ? FIGURE_MONORAIL_EN_VOL : FIGURE_WAGON_EN_VOL;
  const g = objetGraphique(jeu, mot(jeu, motLong(jeu, FIGURES) + numero * 2));
  for (let m = morceau(jeu, mot(jeu, g)); !finDeChaine(jeu, m); m = suivant(jeu, m)) {
    if (jeu.m8[m + 6] & PLACE_DE_PASSAGER) continue;
    const img = image(jeu, mot(jeu, m));
    if (img === 0) continue;
    tracerLeMorceau(jeu, m, img, x, y);
    ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
  }
}

// =================================================================================================
// 0x66DFA — tracer l'image `img` à (x, y), étirée ou réduite à `largeur` x `hauteur`.
// =================================================================================================
//
// Le format des images est celui du traceur (retro-ingenierie.md § 6.5) : des lignes codées, un
// octet de longueur positif suivi d'autant de pixels, négatif pour autant de pixels transparents,
// nul pour finir la ligne. Chaque ligne source utile est décodée dans un tampon (le programme le
// garde sur sa pile, 320 octets, rempli par memcpy, 0x80958, et memset, 0x7F1A0 ; il est tenu ici en
// JavaScript), la transparence y valant 0xFF. Puis chaque ligne de destination prend une ligne source
// (accumulateur de 256es sur les lignes), et chaque pixel de destination une colonne (accumulateur de
// 256es sur les colonnes). Coordonnées et tailles sont celles de l'espace logique.
//
// En basse résolution (lignes de 320 octets), les coordonnées et la hauteur sont divisées par deux,
// mais pas la largeur : ce sont les lignes de l'image, deux fois plus courtes que sa largeur logique
// en basse résolution (retro-ingenierie.md § 6.5), qui arrêtent chaque ligne tracée à mi-largeur.
// L'image est ainsi tracée à la moitié de la taille demandée, comme le veut l'espace logique.
//
// Particularités, reproduites :
//   - les deux accumulateurs partent d'un pas, et non de 0 : la première ligne et la première colonne
//     de l'image sont sautées dès que le pas atteint 256 (l'image n'est pas agrandie) ;
//   - l'accumulateur des colonnes est un mot de 16 bits, la colonne son octet haut ; la ligne est
//     l'octet 1 de l'accumulateur des lignes ;
//   - le nombre de lignes à tracer est un octet : une hauteur de plus de 255 lignes est tronquée ;
//   - un pixel de valeur 0xFF est transparent ;
//   - les bords gauche et droit sont coupés pixel par pixel ; en bas, le nombre de lignes est borné
//     par la hauteur de la surface ; en haut, autant de lignes de l'image que de lignes hors de la
//     surface sont sautées dans ses données, sans tenir compte de l'échelle, et le nombre de lignes à
//     tracer n'est pas réduit : l'échantillonnage des lignes restantes en est décalé, et le tracé
//     s'arrête quand l'image est épuisée ;
//   - en haute résolution, les blocs d'écran touchés sont marqués (0x54D38) avant tout contrôle,
//     même pour une image hors de l'écran ou de taille nulle.
// Une ligne de plus de 320 pixels déborderait du tampon, sur la pile du programme d'origine : les
// images ont au plus 255 pixels de large, cela n'arrive pas.
export function tracerImageAEchelle(jeu, img, x, y, largeur, hauteur) {
  const m8 = jeu.m8;
  let source = motLong(jeu, img + 0);
  let hauteurSource = m8[img + 5];
  if ((m8[MODE_AFFICHAGE] & 1) === 0) jeu.appeler(MARQUER_ZONE_SALE, s16(x), s16(y), s16(largeur), s16(hauteur));

  const largeurSurface = motLong(jeu, LARGEUR_SURFACE) | 0;
  const hauteurSurface = motLong(jeu, HAUTEUR_SURFACE) | 0;
  const sauterUneLigne = () => {
    for (;;) {
      const c = m8[source++];
      if (c === 0) return;
      if (s8(c) > 0) source += s8(c);
    }
  };

  let lignes;
  const demi = (v) => (v & ~0xFFFF) | u16((s16(v) / 2) | 0);  // 'cwd ; sub ax, dx ; sar ax, 1'
  if (largeurSurface === 0x140) {
    x = demi(x);
    y = demi(y);
    if (u16(largeur) === 0 || u16(hauteur) === 0) return;
    if (s16(x) >= largeurSurface || s16(y) >= hauteurSurface) return;
    lignes = (u16(hauteur) >> 1) & 0xFF;
    if (s16(y) < 0) {
      if ((hauteurSource >> 1) + s16(y) <= 0) return;
      hauteurSource = (hauteurSource + ((y & 0xFF) << 1)) & 0xFF;
      for (; u16(y) !== 0; y = (y & ~0xFFFF) | u16(y + 1)) sauterUneLigne();
    } else if (lignes + s16(y) > hauteurSurface) {
      lignes = (m8[HAUTEUR_SURFACE] - (y & 0xFF)) & 0xFF;
    }
    hauteurSource >>= 1;
  } else {
    if (u16(largeur) === 0 || u16(hauteur) === 0) return;
    if (s16(x) >= largeurSurface || s16(y) >= hauteurSurface) return;
    lignes = hauteur & 0xFF;
    if (s16(y) < 0) {
      if (hauteurSource + s16(y) <= 0) return;
      hauteurSource = (hauteurSource + (y & 0xFF)) & 0xFF;
      for (; u16(y) !== 0; y = (y & ~0xFFFF) | u16(y + 1)) sauterUneLigne();
    } else if (lignes + s16(y) > hauteurSurface) {
      lignes = (m8[HAUTEUR_SURFACE] - (y & 0xFF)) & 0xFF;
    }
  }

  let destination = (motLong(jeu, SURFACE) + s16(x) + Math.imul(s16(y), largeurSurface)) | 0;
  const pasX = diviser(m8[img + 4] << 8, u16(largeur));
  const pasY = diviser(m8[img + 5] << 8, u16(hauteur));
  let accumulateurY = pasY;
  let derniereLigne = -1;
  const tampon = new Uint8Array(0x140);
  let longueur = 0;
  for (; lignes !== 0; lignes = (lignes - 1) & 0xFF) {
    const ligne = (accumulateurY >> 8) & 0xFF;
    if (ligne !== u16(derniereLigne)) {
      if (ligne >= hauteurSource) return;
      derniereLigne++;
      for (; ligne > s16(derniereLigne); derniereLigne++) sauterUneLigne();
      // Décoder la ligne dans le tampon.
      let n = 0;
      for (;;) {
        const c = s8(m8[source++]);
        if (c === 0) break;
        if (n + Math.abs(c) > tampon.length) throw new Error('0x66DFA : ligne d\'image plus longue que le tampon');
        if (c > 0) {
          for (let k = 0; k < c; k++) tampon[n + k] = m8[source + k];
          source += c;
          n += c;
        } else {
          tampon.fill(0xFF, n, n - c);
          n -= c;
        }
      }
      longueur = n & 0xFF;
    }
    let accumulateurX = pasX;
    let d = destination;
    for (let xx = x | 0; ; ) {
      const colonne = (accumulateurX >> 8) & 0xFF;
      if (colonne >= longueur || s16(xx) >= largeurSurface) break;
      const avant = xx;
      xx = (xx + 1) | 0;
      if (s16(avant) >= 0 && tampon[colonne] !== 0xFF) m8[d] = tampon[colonne];
      accumulateurX = (accumulateurX & ~0xFFFF) | u16(accumulateurX + pasX);
      d++;
    }
    accumulateurY = (accumulateurY + pasY) | 0;
    destination = (destination + largeurSurface) | 0;
  }
}

// =================================================================================================
// 0x20FF5 — désigner l'objet `objet` s'il est sous le pointeur ; (x, y) est le point où il est
// tracé, passé en mots non signés.
// =================================================================================================
//
// Le rectangle de l'objet est l'union de ses images, décalées du point (x, y) ; sa gauche et son
// haut partent de 10 000, sa droite et son bas de 0 (un objet sans image n'est jamais désigné). Rien
// n'est désigné plus bas que 0xB9525 (sous le panneau de commande), ni hors de la vue du parc, ni
// quand l'interface est occupée (trois variables non établies, et l'outil 0x13). Il faut aussi, ou
// bien un outil de désignation — aucun (0), l'information (8), la cible (0xE), le mécanicien
// (0x15) —, ou bien un clic en attente.
//
// Selon le type de l'objet sous le pointeur :
//   - une attraction (4), ou le kiosque d'entrée d'une attraction (6, 0x1C, qui désigne alors son
//     attraction) : son genre devient le genre désigné (0xD665A). Avec l'outil du mécanicien, le
//     mécanicien sélectionné, s'il est libre (état 8), est envoyé vers elle (état 0x12, vers son
//     kiosque d'entrée +49, figure 0xBE) ; avec l'outil cible, elle devient la cible ; l'outil 0x14
//     ne fait rien ; tout autre outil la sélectionne, et au clic ouvre sa fenêtre (0xD) ;
//   - une boutique (0xA) : l'outil du mécanicien ne fait rien, l'outil cible en fait la cible ; les
//     autres la sélectionnent, et au clic ouvrent sa fenêtre (0x11 pour un jeu d'adresse, 0xC sinon) ;
//   - avec l'outil d'information seulement, un visiteur (2), un employé (8), des toilettes en service
//     (0x18, état 2) : sélectionnés, et au clic leur fenêtre (6 ; 8, 9, 7 selon le métier, rien pour
//     le gardien ; 0x15) ;
//   - l'entrée du parc (0x14, état 6) : avec l'outil cible, elle devient la cible (de même l'état 4,
//     non établi) ; sinon, si le parc est fermé, ELLE L'OUVRE (octet +18 de la fiche du parc) et
//     lance l'ambiance (le bruitage 0x15 en boucle), dès le bouton maintenu, sans attendre de clic.
// Une sélection remet aussi à zéro le mot 0xD6636 (non établi). La fenêtre de l'attraction s'ouvre
// avant que l'attraction ne soit sélectionnée, celle de la boutique après.
export function designerObjetSousLePointeur(jeu, objet, x, y) {
  x = u16(x);
  y = u16(y);
  if (y >= motSigne(jeu, BAS_DE_LA_VUE)) return;

  let gauche = 10000, haut = 10000, droite = 0, bas = 0;
  const g = objetGraphique(jeu, mot(jeu, objet + IMAGE));
  if (g > motLong(jeu, OBJETS_GRAPHIQUES)) {
    for (let m = morceau(jeu, mot(jeu, g)); !finDeChaine(jeu, m); m = suivant(jeu, m)) {
      const img = image(jeu, mot(jeu, m));
      if (!estUneImage(jeu, img)) continue;
      const mx = x + motSigne(jeu, m + 2), my = y + motSigne(jeu, m + 4);
      if (mx < gauche) gauche = s16(mx);
      if (my < haut) haut = s16(my);
      if (mx + jeu.m8[img + 4] > droite) droite = s16(mx + jeu.m8[img + 4]);
      if (my + jeu.m8[img + 5] > bas) bas = s16(my + jeu.m8[img + 5]);
    }
  }

  const outil = mot(jeu, OUTIL);
  const outilDeDesignation = outil === 0 || outil === INFORMATION || outil === OUTIL_CIBLE || outil === OUTIL_MECANICIEN;
  if (!outilDeDesignation && mot(jeu, CLIC_EN_ATTENTE) === 0) return;
  if (motSigne(jeu, INTERFACE_B14BD) !== -1 || jeu.m8[INTERFACE_B14C6] !== 0) return;
  if (motSigne(jeu, INTERFACE_B14D2) !== -1 || mot(jeu, ECRAN) !== 0) return;
  if (mot(jeu, OUTIL) === OUTIL_13) return;

  const sourisX = motSigne(jeu, SOURIS_X), sourisY = motSigne(jeu, SOURIS_Y);
  if (sourisX < gauche || sourisX >= droite || sourisY < haut || sourisY >= bas) return;

  switch (jeu.m8[objet + TYPE]) {
    case 2:   // un visiteur
      if (mot(jeu, OUTIL) !== INFORMATION) return;
      if (mot(jeu, CLIC_EN_ATTENTE) !== 0) ouvrirSaFenetre(jeu, FENETRE_VISITEUR);
      ecrireMot(jeu, REMISE_A_ZERO, 0);
      selectionner(jeu, objet);
      return;
    case 4:   // une attraction
      designerUneAttraction(jeu, objet);
      return;
    case 6:   // le kiosque d'entrée d'une attraction
    case 0x1C: {
      const attraction = objetDuParc(jeu, mot(jeu, objet + ATTRACTION_DU_KIOSQUE));
      if (attraction <= motLong(jeu, OBJETS_DU_PARC)) return;
      designerUneAttraction(jeu, attraction);
      return;
    }
    case 8:   // un employé
      if (mot(jeu, OUTIL) !== INFORMATION) return;
      if (mot(jeu, CLIC_EN_ATTENTE) !== 0) {
        const etatDEmbauche = mot(jeu, ETATS_D_EMBAUCHE + jeu.m8[objet + SORTE] * 0x36);
        if (etatDEmbauche === AMUSEUR) ouvrirSaFenetre(jeu, FENETRE_AMUSEUR);
        else if (etatDEmbauche === MECANICIEN) ouvrirSaFenetre(jeu, FENETRE_MECANICIEN);
        else if (etatDEmbauche === AGENT_D_ENTRETIEN) ouvrirSaFenetre(jeu, FENETRE_AGENT_D_ENTRETIEN);
      }
      ecrireMot(jeu, REMISE_A_ZERO, 0);
      selectionner(jeu, objet);
      return;
    case 0xA: // une boutique
      if (mot(jeu, OUTIL) === OUTIL_MECANICIEN) return;
      if (mot(jeu, OUTIL) === OUTIL_CIBLE) {
        viser(jeu, objet);
        return;
      }
      selectionner(jeu, objet);
      if (mot(jeu, CLIC_EN_ATTENTE) !== 0) {
        const fiche = CATALOGUE_DES_BOUTIQUES + mot(jeu, objet + GENRE);
        ouvrirSaFenetre(jeu, jeu.m8[fiche + 0x24] === JEU_D_ADRESSE ? FENETRE_JEU_D_ADRESSE : FENETRE_BOUTIQUE);
      }
      ecrireMot(jeu, REMISE_A_ZERO, 0);
      return;
    case 0x14: { // l'entrée du parc
      const etat = jeu.m8[objet + ETAT];
      if ((etat === 4 || etat === 6) && mot(jeu, OUTIL) === OUTIL_CIBLE) {
        viser(jeu, objet);
        return;
      }
      if (jeu.m8[objet + ETAT] !== 6) return;
      const parc = motLong(jeu, FICHE_DU_PARC);
      if (jeu.m8[parc + PARC_OUVERT] !== 0) return;
      jeu.m8[parc + PARC_OUVERT] = 1;
      jeu.appeler(LANCER_UNE_AMBIANCE, 0, AMBIANCE_DU_PARC, 3, jeu.m8[VOLUME_DE_L_AMBIANCE]);
      return;
    }
    case 0x18: // des toilettes
      if (mot(jeu, OUTIL) !== INFORMATION || jeu.m8[objet + ETAT] !== 2) return;
      if (mot(jeu, CLIC_EN_ATTENTE) !== 0) ouvrirSaFenetre(jeu, FENETRE_TOILETTES);
      ecrireMot(jeu, REMISE_A_ZERO, 0);
      selectionner(jeu, objet);
      return;
    default:
      return;
  }
}

function designerUneAttraction(jeu, objet) {
  ecrireMot(jeu, GENRE_DESIGNE, diviser(mot(jeu, objet + GENRE), 200));
  if (mot(jeu, OUTIL) === OUTIL_MECANICIEN) {
    const mecanicien = objetDuParc(jeu, mot(jeu, SELECTION));
    if (jeu.m8[mecanicien + TYPE] === 8 && jeu.m8[mecanicien + ETAT] === 8) {
      ecrireMot(jeu, mecanicien + GENRE, mot(jeu, objet + KIOSQUE_D_ENTREE));
      jeu.m8[mecanicien + ETAT] = MECANICIEN_APPELE;
      ecrireMot(jeu, mecanicien + IMAGE, mot(jeu, motLong(jeu, FIGURES) + FIGURE_DU_MECANICIEN_APPELE * 2));
    }
    return;
  }
  if (mot(jeu, OUTIL) === OUTIL_CIBLE) {
    viser(jeu, objet);
    return;
  }
  if (mot(jeu, OUTIL) === OUTIL_14) return;
  if (mot(jeu, CLIC_EN_ATTENTE) !== 0) ouvrirSaFenetre(jeu, FENETRE_ATTRACTION);
  selectionner(jeu, objet);
  ecrireMot(jeu, REMISE_A_ZERO, 0);
}

function selectionner(jeu, objet) {
  ecrireMot(jeu, SELECTION, numeroDObjet(jeu, objet));
}

function viser(jeu, objet) {
  ecrireMot(jeu, motLong(jeu, COMPTES_DU_PARC) + CIBLE, numeroDObjet(jeu, objet));
}

function ouvrirSaFenetre(jeu, fenetre) {
  jeu.appeler(OUVRIR_UNE_FENETRE, fenetre);
  jeu.m8[CLIC_PRIS] = 1;
}

// =================================================================================================
// 0x66D18 — remettre d'accord la musique des attractions.
// =================================================================================================
//
// Appelée à chaque image par le dessin de la carte quand l'attraction qui a la musique n'est pas
// usée (dessin-carte.js). Si un morceau joue, elle demande à 0x66BA0 de repartir du centre la
// prochaine fois qu'il désaccordera ; et si 0x66BA0 a désaccordé le morceau, elle recentre la
// courbure des trois canaux qu'il fait osciller (messages MIDI 0xE1 à 0xE3, valeur 0x2000 : octets
// 0 et 0x40), une seule fois. Sans carte son (les scénarios de vérification), rien.
export function recentrerLaMusique(jeu) {
  if (jeu.m8[MUSIQUE_INITIALISEE] === 0 || jeu.m8[MUSIQUE_PERMISE] === 0) return;
  if (mot(jeu, MORCEAU_EN_COURS) === 0) return;
  jeu.m8[DESACCORD_A_REPRENDRE] = 1;
  if (jeu.m8[DESACCORD_EN_COURS] === 0) return;
  for (const message of [0xE1, 0xE2, 0xE3]) {
    jeu.m8[MESSAGE_MIDI] = message;
    jeu.m8[MESSAGE_MIDI + 1] = 0;
    jeu.m8[MESSAGE_MIDI + 2] = 0x40;
    jeu.appeler(ENVOYER_AU_PILOTE_MIDI, motLong(jeu, MORCEAU_SOS), MESSAGE_MIDI, jeu.T.R.ds & 0xFFFF, 3);
  }
  jeu.m8[DESACCORD_EN_COURS] = 0;
}

// --- l'enregistrement ------------------------------------------------------------------------------

// Toute la mémoire est comparée pour les fonctions qui écrivent dans les objets du parc (dans le
// tas) ou qui en appellent qui peuvent écrire n'importe où : l'ouverture d'une fenêtre (0x35F21), les
// bruitages et la musique. La table des objets suffit pour 0x69840.
function tableDesObjetsDuParc(jeu) {
  return [motLong(jeu, OBJETS_DU_PARC), motLong(jeu, FIN_DES_OBJETS_DU_PARC)];
}

export const reecritures = [
  { adresse: 0x1D87A, nom: 'dessinerAttraction', fn: dessinerAttraction, arguments: 3, memoire: 'entiere' },
  { adresse: 0x69840, nom: 'dessinerAttractionAvecPassagers', fn: dessinerAttractionAvecPassagers, arguments: 3,
    zones: (jeu) => [tableDesObjetsDuParc(jeu)] },
  { adresse: 0x1DD27, nom: 'dessinerVehicule', fn: dessinerVehicule, arguments: 3, memoire: 'entiere' },
  { adresse: 0x66DFA, nom: 'tracerImageAEchelle', fn: tracerImageAEchelle, arguments: 5 },
  { adresse: 0x20FF5, nom: 'designerObjetSousLePointeur', fn: designerObjetSousLePointeur, arguments: 3, memoire: 'entiere' },
  { adresse: 0x66D18, nom: 'recentrerLaMusique', fn: recentrerLaMusique, arguments: 0, memoire: 'entiere' },
];
