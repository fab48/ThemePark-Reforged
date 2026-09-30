// Les visiteurs : ce qu'ils ressentent, et quelques-uns de leurs états.
//
// Réécriture lisible de deux fonctions que partagent les états des visiteurs — 0x672A5, la mise à
// jour de l'humeur, et 0x2789A, les bulles de pensée et les émotions —, de 0x6804A, l'attrait du prix
// d'entrée, et de cinq états qui les appellent. À chaque pas de simulation, la mise à jour des objets
// du parc (0x21681) appelle, pour chaque visiteur (objet de type 2), la fonction de son état (octet
// +0xC), par une table de 36 états (0x21723) :
//
//   4     0x223C1  le guichet d'entrée du parc : il décide d'entrer ou non, paie, repart
//   0x0C  0x24DFE  dans la file d'attente d'une attraction
//   0x0E  0x24F41  sur l'attraction
//   0x40  0x22BA6  en route vers la sortie du parc
//   0x4E  0x2775A  aux toilettes
//
// Les autres états sont réécrits ailleurs (visiteurs.js, visiteurs-etats-a.js, visiteurs-etats-b.js).
// Ceux que nomment ces fonctions, d'après l'usage qu'elles en font : 6 (0x2293A) et 8 (0x22E22), deux
// façons de marcher ; 0x10 (0x24F82), la descente de l'attraction, où l'attraction faite est comptée ;
// 0x18 (0x2641F), où le met la fin des toilettes ; 0x1A (0x273C8) et 0x3C (0x27494), l'émotion que
// lance 0x2789A ; 0x1E (0x266D7), où le met l'arrivée à la sortie ; 0x20 (0x2276C), sans chemin vers
// la sortie, qui en cherche un toutes les 50 mises à jour ; 0x34 (0x24D4B), où le met l'abandon d'une
// file ; 0x3E (0x25339), vraisemblablement vomir : 0x22E22 l'y met quand ce qu'il porte à jeter (+0x63)
// comprend le déchet de valeur 4 (bit 2 des déchets de la carte, voir plus bas).
//
// Une « mise à jour » est un passage de 0x21681 : un par pas de simulation.
//
// --- Les champs d'un visiteur que lisent et écrivent ces fonctions ----------------------------------
//
// Établis par ce que le programme en fait ; le sens donné entre parenthèses l'est par recoupement.
//
//   +0x05  octet   drapeaux : 0x40, il a quelque chose à exprimer (0x2789A le consomme) ; 0x30, deux
//                  drapeaux que 0x22BA6 efface près de la sortie avant de relancer la recherche du
//                  chemin (leur rôle dans la recherche : non établi)
//   +0x06  mot     la position sur l'axe des colonnes, en 256es de case (l'octet +7 est la colonne)
//   +0x08  mot     la position sur l'axe des rangées (l'octet +9 est la rangée)
//   +0x0A  mot     l'objet graphique affiché (image courante de son animation)
//   +0x0C  octet   l'état
//   +0x0D  octet   l'état que reprend le visiteur à la sortie du guichet (état 4)
//   +0x12  octet   la direction : 0 vers le haut de la carte (rangée − 1), 1 colonne + 1, 2 rangée + 1,
//                  3 colonne − 1 (table PAS_PAR_DIRECTION)
//   +0x13  octet   la vitesse, en 256es de case par mise à jour
//   +0x14  mot     un compte à rebours : les mises à jour restantes avant la prochaine décision
//   +0x16  mot     l'attraction dont il fait la queue, ou sur laquelle il est (numéro d'objet)
//   +0x20  mot long selon l'état : la phase du passage au guichet (état 4) ; dans la file d'attente, une
//                  heure (pas de simulation) dont 0x24DFE et 0x2789A mesurent l'éloignement — celle de
//                  l'entrée dans la file, vraisemblablement
//   +0x4F  octet   l'octet bas du mot 0xD665C quand il a payé l'entrée ; −1 avant. 0x21681 ne compte
//                  dans les statistiques du joueur que les visiteurs dont l'octet n'est pas −1. Ce que
//                  désigne 0xD665C (le numéro du joueur en cours ?) : non établi
//   +0x50  octet signé  (ce qu'il a mangé) : un achat (0x68616, appelé par l'état 0x3A) y ajoute un
//                  octet de la fiche du genre de la boutique ([ebp−0x18] + 0x56 là-bas), les attractions
//                  en retirent, vomir en retire 8, les toilettes le remettent à −1. À l'aise entre 5 et
//                  7 ; au-dehors, il le fait savoir (bulles 0x219 sous 1, 0x21C de 4 à 8, 0x270 au-delà
//                  de 8, 0x277 au-delà de 5)
//   +0x51  octet signé  (ce qu'il a bu) : de même, avec l'octet suivant de la fiche
//   +0x54  mot signé    le contentement : les attractions l'augmentent, la saleté, l'ennui, la foule
//                  des mécontents, la fatigue le diminuent ; comparé aux deux seuils du parc (+0 et +2)
//   +0x56  octet   la colonne de la case visée } par la recherche du chemin (0x349EB) : l'entrée du
//   +0x57  octet   la rangée de la case visée  } parc, quand il s'en va (0x223C1 s'il renonce, 0x22834)
//   +0x58  octet   la direction à reprendre (sauvée avant un détour ou une émotion)
//   +0x59  octet   le genre de visiteur : choisit ses animations (table ANIMATIONS)
//   +0x5A  octet   choisit l'animation d'une émotion quand il vaut 1 à 3 (animations 9, 8 et 10) ; une
//                  autre valeur non nulle est remise à 0 au moment de l'émotion, qui prend l'animation 0.
//                  On le trouve souvent à 2, 4 ou 6 dans la démo : ce qu'il représente, et qui le pose,
//                  non établi
//   +0x5B  mot long l'heure qui cadence ses émotions : elles ne viennent d'elles-mêmes que lorsque le
//                  temps écoulé depuis est un multiple de 256 pas
//   +0x5F  mot     l'objet graphique sauvé pendant une émotion
//   +0x64  octet   remis à zéro à la sortie du guichet ; rôle non établi
//   +0x6F  mot     son argent (le prix d'entrée en est retiré ; celui des achats aussi, 0x68616)
//   +0x75  mot long l'heure du dernier plaisir (entrée au parc, fin d'une attraction) : l'ennui se
//                  compte depuis elle, en périodes de 512 pas
//   +0x81  octet   le nombre d'attractions faites (0x24F82 l'incrémente à la descente)
//   +0x82  mot signé    la fatigue : croît en marchant, moins vite si l'on est content ; au-delà de
//                  8 000 elle coûte du contentement ; 0x22834 renvoie le visiteur chez lui (état 0x40)
//                  quand elle atteint 2 000 fois le nombre d'attractions du parc ou dépasse 12 000 —
//                  comme quand son dernier plaisir date de plus de 4 000 pas, ou que l'octet +0x18 du
//                  parc est nul (le parc fermé ? non établi)
//   +0x84  octet   l'humeur du dernier voisin qui a déteint sur lui : 1 contente, 2 mécontente
//   +0x8B  octet   le délai avant la prochaine émotion possible
//   +0xB3  mot     le nombre de mises à jour de son humeur : cadence certaines pénalités
//   +0xB7  mot     la bulle de pensée affichée au-dessus de lui : un numéro de figure (table [0xD3B38]),
//                  tracé par 0x1C9E2 tant que +0xB9 n'est pas nul
//   +0xB9  octet   la durée restante de la bulle ; 0x21681 la décrémente à chaque mise à jour
//   +0xBA  octet   la dernière raison de bulle montrée (0 à 18 ; 0xFF : aucune)
//   +0xBC  octet   l'état que reprend le visiteur après une émotion
//   +0xC6  octet   le nombre de mises à jour de son humeur faites sur une case sale, depuis la dernière
//                  bulle « sale »
//
// --- La fiche du parc --------------------------------------------------------------------------------
//
// Une table de fiches de 0x250 octets en 0xCF1E0 ; [0xD3818] désigne celle du parc en cours, et le
// programme y arrive aussi par l'octet +0x41 de la structure du joueur [0xD3814] (0x672A5), ou par le
// mot +2 de la fiche du joueur (0x6804A) — dans les scénarios, c'est la même fiche. Ce qu'en lisent ces
// fonctions, avec les valeurs du parc de la démonstration :
//
//   +0x00  mot signé   le seuil du contentement (200) : au-dessus, le visiteur est content
//   +0x02  mot signé   le seuil du mécontentement (−100)
//   +0x04  mot         (140) ; entre dans le prix de référence de l'entrée (0x6804A)
//   +0x08  mot         (144) : le plaisir d'une attraction vaut son intensité × ce mot / 256
//   +0x0A  octet       (16) : un quart de cet octet, le prix d'un besoin mal satisfait
//   +0x0B  mot         (128) : un trente-deuxième, le prix d'une case sale
//   +0x0D  mot         (10) : la force avec laquelle l'humeur des voisins déteint
//   +0x1D  mot         le prix d'entrée (50)
//   +0x1F, +0x33  mots deux comptes des entrées payées (124 et 125) ; +0x23 mot long, leur recette
//   +0x21  octet signé (5) ; +0x47 (de 28 à 34), +0x48 (de 28 à 43) octets, qui changent en cours de
//                      partie : l'attrait du prix d'entrée et le seuil du guichet (0x6804A)
//   +0x82  octet       le nombre d'attractions du parc (22, autant que d'objets de type 4)
//   +0x8A, +0x105  mots longs (1 082 et 253) : entrent dans le prix de référence de l'entrée ; sens
//                      non établi
//
// --- Anomalies reproduites ---------------------------------------------------------------------------
//
//  - 0x223C1 lit, en phase 1 du guichet, une variable locale qu'il n'a pas initialisée : la durée du
//    retour au milieu de la case dépend de ce qu'un appel précédent a laissé sur la pile (voir
//    « Le reste laissé sur la pile ») ; et ses deux branches, directions paires et impaires, sont
//    identiques — vraisemblablement une erreur de copie : pour les directions paires (verticales),
//    la position utile aurait été celle des rangées ([ebp−0xC]).
//  - 0x2789A compare à 3 000 l'heure du dernier plaisir elle-même (+0x75), et non le temps écoulé
//    depuis : la bulle 0x275 est toujours possible passé le 3 000e pas de la partie.
//  - 0x672A5, en descendant d'une attraction (état 0x10), tire deux nombres au hasard sans s'en
//    servir ; ils font avancer le générateur, et sont reproduits.
//  - 0x22BA6, arrivé à la sortie, ne s'arrête pas à la première case voisine de sol 0xED : la dernière
//    trouvée l'emporte.
//  - Surprenant, sans qu'on puisse dire si c'est voulu : aux toilettes, 0x672A5 retire du contentement,
//    d'autant plus que le besoin pressait (voir mettreAJourLHumeur).
//
// Le mot long 0xD3BB4 reçoit trois valeurs, 0x3C, 0xE0 et 0x15B, et n'est jamais relu : vraisemblablement
// un numéro de ligne du source, gardé pour le débogage (les trois croissent avec l'adresse).

import { directionDuRetour } from './corrections.js';   // hors du jeu d'origine (reglages.js)

// --- les données ------------------------------------------------------------------------------------
const OBJETS_DU_PARC = 0xD3B10;     // pointeur : objets du parc, 200 octets, numérotés à partir de 1
const TAILLE_OBJET = 200;
const CARTE = 0xD3B08;              // pointeur : 64 x 64 cellules de 4 octets (retro-ingenierie.md § 6.2)
//   cellule +0 mot : le premier objet posé ; +2 octet : le sol ; +3 octet : les décors éparpillés,
//   bits 0 à 2 (dessin-carte.js) — ici, la saleté : 0x22E22 y dépose ce que le visiteur jette (+0x63)
const FIGURES = 0xD3B38;            // pointeur : table de mots, numéro de figure → objet graphique
const OBJETS_GRAPHIQUES = 0xD3B80;  // pointeur : 8 octets par objet graphique (objets.js)
//   +5 octet : bit 0, une image qui ne s'anime que tous les 500 pas dans une file (attendreDansLaFile ;
//   sens non établi) ; +6 mot : l'image suivante
const PAS_DE_SIMULATION = 0xD3AFC;  // mot long : le temps du jeu, 1 000 pas par mois
const MISES_A_JOUR = 0xD3AF8;       // mot long : incrémenté à chaque passage de 0x21681, un par pas
const JOUEUR = 0xD3814;             // pointeur : la structure du joueur en cours
//   +0x40 octet : sa fiche, dans [0xD3B00] ; +0x41 octet : sa fiche de parc, dans 0xCF1E0
//   +0x2CA mot : la case de l'entrée du parc, rangée × 64 + colonne ; +0x2D2 mot long : recette des entrées
const FICHE_DU_JOUEUR = 0xD3808;    // pointeur : la fiche du joueur en cours ; +0x0A mot long, le solde
const FICHES_DES_JOUEURS = 0xD3B00; // pointeur : 25 fiches de 0x222 octets (retro-ingenierie.md § 7)
const TAILLE_FICHE_JOUEUR = 0x222;
const PARC = 0xD3818;               // pointeur : la fiche du parc en cours
const FICHES_DES_PARCS = 0xCF1E0, TAILLE_FICHE_PARC = 0x250;
const OBJET_SELECTIONNE = 0xD6678;  // mot : le numéro de l'objet que le joueur a sélectionné
const JOUEUR_EN_COURS = 0xD665C;    // mot (voir le champ +0x4F)
const LIGNE_DU_SOURCE = 0xD3BB4;    // mot long, jamais relu (voir plus haut)
const GENRES_ATTRACTIONS = 0xCCED0; // fiches des genres d'attractions ; l'attraction donne en +0x16 le
//   décalage de la sienne. +0xA9 octet : l'intensité (90 ROLLER COASTER, 80 FLIGHT SIM, 6 MAZE) ;
//   +0xB8 mot : (4, 3 pour SNAKES AND LADDERS) ; les deux mesurent ce qu'une attraction retourne l'estomac
const CATALOGUE_DES_DECORS = 0xCCA70, TAILLE_FICHE_DECOR = 0x38;
//   fiches de 0x38 octets, nom en tête : TROPICAL BUSH, PALM TREE… puis les toilettes, 15 BOGGY CRAPPER
//   (+0x31 : 50, +0x32 : 50), 16 OUTHOUSE (150, 20), 17 SUPER TOILET (25, 25). Les toilettes (objets de
//   type 0x18) y désignent la leur par leur mot +0x16
const PAS_PAR_DIRECTION = 0xB4932;  // par direction, deux octets signés : le pas en colonnes, en rangées
const DEMI_TOUR = 0xB48EC;          // un octet sur deux : la direction opposée (0↔2, 1↔3)
const CASES_VOISINES = 0xB4920;     // par direction, un mot signé : le décalage de la case voisine, en
//                                     cellules (−64, 1, 64, −1)
const ANIMATIONS = 0xB49F4;         // par genre de visiteur, 0x24 octets : 18 numéros de figure ; le 0 est
//   la marche vers le haut, suivie des trois autres directions ; les autres sont des émotions (voir
//   exprimerSonHumeur)
const TAILLE_ANIMATIONS = 0x24;
const EMOTIONS_EN_ATTENTE = 0xB4B3C;  // mots : l'animation de chacune des émotions de l'octet +0x5A

// --- les fonctions appelées ---------------------------------------------------------------------------
const METTRE_A_JOUR_L_HUMEUR = 0x672A5;
const EXPRIMER_SON_HUMEUR = 0x2789A;
const ATTRAIT_DU_PRIX = 0x6804A;
const HASARD = 0x18B92;             // un nombre de 0 à 32 767 (simulation-outils.js)
const DEPLACER = 0x18A44;           // (objet, x, y) : l'amène à la position (x, y), en 256es de case
const CHERCHER_SUR_LA_CASE = 0x204B9;  // (cellule, type) : le premier objet de ce type posé sur la case
const DIVISION_PAR_ZERO = 0x19ED3;  // vitesse nulle : rend 1, efface la demande de sortie
const CHEMIN_VERS_LA_CIBLE = 0x349EB;  // (visiteur, 0x96, n) : la direction à prendre vers la case visée
//   (+0x56, +0x57) ; d'après ses appelants : 0 à 3 une direction, 4 arrivé, négatif pas de chemin

// --- les états ----------------------------------------------------------------------------------------
const GUICHET = 0x04, MARCHE_6 = 0x06, MARCHE = 0x08, FILE = 0x0C, SUR_L_ATTRACTION = 0x0E;
const DESCENTE = 0x10, SORTIE_DES_TOILETTES = 0x18, EMOTION = 0x1A, FRANCHIR_LA_SORTIE = 0x1E;
const SANS_CHEMIN = 0x20, QUITTER_LA_FILE = 0x34, EMOTION_FORCEE = 0x3C, VOMIR = 0x3E;
const VERS_LA_SORTIE = 0x40, TOILETTES = 0x4E;
const TYPE_VISITEUR = 2, TYPE_ATTRACTION = 4, TYPE_TOILETTES = 0x18;

// --- les accès à la mémoire ---------------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const motLong = (jeu, a) => jeu.dv.getUint32(a, true);
const motLongSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const ecrireOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const ecrireMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const ecrireMotLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// Division entière du processeur (idiv) : un diviseur nul lève une exception, comme sur la machine.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

const maintenant = (jeu) => motLong(jeu, PAS_DE_SIMULATION);
// Le temps écoulé depuis une heure, en pas (soustraction non signée sur 32 bits).
const depuis = (jeu, heure) => (maintenant(jeu) - heure) >>> 0;
const hasard = (jeu) => jeu.appeler(HASARD) & 0xFFFF;

// L'objet numéro n. Le programme compare ensuite l'adresse à celle de la table, sans signe : un numéro
// nul ou négatif (un décor) tombe au-dessous ou dessus, et termine les parcours.
const baseDesObjets = (jeu) => motLong(jeu, OBJETS_DU_PARC);
const objetNumero = (jeu, n) => (baseDesObjets(jeu) + n * TAILLE_OBJET) >>> 0;
const estUnObjet = (jeu, adresse) => (adresse >>> 0) > baseDesObjets(jeu);

// La cellule de la carte où se tient un objet (colonne +7, rangée +9), sans contrôle de bornes.
const celluleDe = (jeu, objet) => (motLong(jeu, CARTE) + ((octet(jeu, objet + 9) << 6) + octet(jeu, objet + 7)) * 4) >>> 0;

// L'objet graphique numéro n ; son mot +6 désigne l'image suivante de l'animation.
const objetGraphique = (jeu, n) => (motLong(jeu, OBJETS_GRAPHIQUES) + n * 8) >>> 0;
function avancerLAnimation(jeu, v) {
  ecrireMot(jeu, v + 0x0A, mot(jeu, objetGraphique(jeu, mot(jeu, v + 0x0A)) + 6));
}

// L'objet graphique d'une figure.
const figure = (jeu, numero) => mot(jeu, motLong(jeu, FIGURES) + 2 * numero);
const animation = (jeu, v, k) => mot(jeu, ANIMATIONS + octet(jeu, v + 0x59) * TAILLE_ANIMATIONS + 2 * k);
// La silhouette du visiteur qui marche dans sa direction : la figure de départ de son genre, plus la
// direction.
function prendreLaSilhouetteDeMarche(jeu, v) {
  ecrireMot(jeu, v + 0x0A, figure(jeu, animation(jeu, v, 0) + octet(jeu, v + 0x12)));
}

// Un pas dans la direction du visiteur, à sa vitesse : 0x18A44 le déplace, changeant sa case quand il
// en franchit le bord. Rend la nouvelle position en colonnes (x), que le programme gardait dans sa
// variable locale [ebp-8].
function avancerDUnPas(jeu, v) {
  const direction = octet(jeu, v + 0x12), vitesse = octet(jeu, v + 0x13);
  const x = (mot(jeu, v + 6) + octetSigne(jeu, PAS_PAR_DIRECTION + 2 * direction) * vitesse) & 0xFFFF;
  const y = (mot(jeu, v + 8) + octetSigne(jeu, PAS_PAR_DIRECTION + 2 * direction + 1) * vitesse) & 0xFFFF;
  jeu.appeler(DEPLACER, v, x, y);
  return x;
}

// Le compte à rebours du visiteur (+0x14) : décrémenté, et rendu (signé).
function decompter(jeu, v) {
  const reste = s16(mot(jeu, v + 0x14) - 1);
  ecrireMot(jeu, v + 0x14, reste);
  return reste;
}

// --- Le reste laissé sur la pile ----------------------------------------------------------------------
//
// En phase 1 du guichet, 0x223C1 lit sa variable locale [ebp-8] sans l'avoir écrite : il y trouve ce
// qu'un appel précédent a laissé sur la pile, au même endroit. Toutes les fonctions d'état sont
// appelées par 0x21681, au même niveau de pile : si E est le pointeur de pile à leur entrée (sur
// l'adresse de retour), cet endroit est E − 24 — le [ebp-8] de chacune, ou ce qu'y poussent celles qui
// ont moins de variables. Dans le scénario de la simulation, 128 lectures en 200 s : 79 fois la valeur
// laissée par 0x223C1 lui-même (le visiteur précédent au guichet), 19 fois par 0x2223B, 6 par 0x22E22,
// 5 par 0x32A06 et autant par 0x326DA, les 14 autres par 0x260F4, 0x24F41, 0x275F3, 0x2641F, 0x24F82,
// 0x2FB85, 0x24DFE et 0x2698E. (Relevé par une sonde qui note, à chaque appel de 0x21681, la dernière
// fonction d'état à avoir changé E − 24.) Sans la précaution qui suit, le rejeu de la simulation
// diverge dans les objets du parc : essayé.
//
// La réécriture lit donc cet endroit comme l'original, et chaque fonction d'état de ce module y
// laisse, en rendant la main, ce qu'y laissait l'original : sans cela, la partie changerait. (Il en va
// de même de toute fonction appelée par 0x21681, où qu'elle soit réécrite : si elle ne laisse pas en
// E − 24 ce qu'y laissait l'original, elle change la durée du passage au guichet des visiteurs traités
// après elle.) Seul l'octet bas est lu ; quand l'original y laissait une valeur de 32 bits dont la
// moitié haute venait de registres de passage, seule la moitié basse est reproduite.
const RESTE = 24;
function resteALEntree(jeu) {
  const adresse = ((jeu.T.R.esp >>> 0) - RESTE) >>> 0;
  return { adresse, valeur: motLong(jeu, adresse) };
}
// Ce que la fonction laisse en E − 24 : par défaut ce qui y était à l'entrée (l'original n'y écrivait
// pas ; mais les fonctions transcrites qu'appelle la réécriture, elles, ont pu y poser leur cadre).
function laisserSurLaPile(jeu, reste, valeur = reste.valeur) {
  ecrireMotLong(jeu, reste.adresse, valeur);
}
const moitieBasse = (reste, v) => ((reste.valeur & 0xFFFF0000) | (v & 0xFFFF)) >>> 0;

// ======================================================================================================

// 0x672A5 — mettre à jour l'humeur d'un visiteur : son contentement (+0x54), et avec lui sa fatigue
// (+0x82) et ses besoins (+0x50, +0x51).
//
// Appelée par huit états des visiteurs, à leurs moments de décision. Les cadences ci-dessous comptent
// les appels de cette fonction pour le visiteur (+0xB3). Trois états ont leur propre calcul, et s'y
// arrêtent :
//
//   4    au guichet d'entrée : le prix payé déçoit (un seizième du prix d'entrée), plus ou moins 8 au
//        hasard ; la fatigue repart de zéro, et l'ennui de maintenant ;
//   0x0E sur l'attraction, un appel sur huit : le plaisir, l'intensité du genre × le mot +8 du parc /
//        256, plus deux fois (6 − l'octet +0x13 de l'attraction, un réglage), si le mot +0x32 de
//        l'attraction n'est pas nul (rien sinon ; voir profiterDeLAttraction). Les sept autres fois,
//        c'est le calcul général ci-dessous ;
//   0x10 en descendant : la moitié de l'intensité, plus 0 à 31 au hasard ; l'estomac et la soif
//        perdent ((6 − le mot +0xB8 du genre) × 16 + l'intensité) / 64 chacun ; l'ennui repart.
//
// Pour les autres, le calcul général : une pénalité s'accumule, puis est retirée du contentement.
// L'« ennui » y est le temps écoulé depuis le dernier plaisir (+0x75), en périodes de 512 pas.
//
//   - la foule : chaque autre visiteur de la même case déteint sur lui (sauf dans une file), s'il est
//     très content ou très mécontent — au-delà de 250 au-dessus du seuil de contentement, ou de 150
//     au-dessous du seuil de mécontentement — ou simplement content ou mécontent, et si l'humeur qui
//     a déteint la dernière fois (+0x84) n'était pas la même. La pénalité change de −(contentement du
//     voisin) × force / 512, ou / 1 024, plus une constante : −2, +6, −1, +3 ;
//   - la saleté : si la case porte des déchets (bits 0 à 2 de l'octet +3 de la cellule), un
//     trente-deuxième du mot +0xB du parc, plus l'ennui ; et +0xC6 compte ces rencontres ;
//   - aux toilettes (état 0x4E), si la case porte des toilettes en service (type 0x18, état 2) : de
//     40 à 160 selon l'estomac (au-delà de 4, 8, 11, 14), de 25 à 100 selon la soif, plus deux fois le
//     mot +0x3C des toilettes (leur saleté ? non établi), plus l'octet +0x31 de leur fiche, moins
//     l'octet +0x32 ; estomac et soif repartent de −1, et la fatigue prend 8 fois l'octet +0x31. Le
//     passage aux toilettes coûte donc du contentement, d'autant plus que le besoin pressait ;
//   - en vomissant (état 0x3E) : 300 ; l'estomac perd 8, la soif 4, la fatigue prend 3 000 ;
//   - l'estomac, puis la soif, hors de leur zone de confort (5 à 7) : un quart de l'octet +0xA du
//     parc, un appel sur 16, 8, 4 ou 2 selon qu'ils en sont plus ou moins loin ;
//   - dans une file (état 0x0C), un appel sur quatre : l'ennui, plus un trente-deuxième de l'usure de
//     l'attraction (mot +0x2E ; il croît à l'usage et désaccorde sa musique au-delà d'un seuil du
//     genre, 0x1B837) — mais l'usure ne compte pas pour les attractions d'intensité 50 ou plus ;
//   - en marchant (état 8), la fatigue prend 32 moins le contentement / 128, moins 4 à +3 au hasard ;
//     et, un appel sur quatre, l'ennui ;
//   - dans l'état 6, la fatigue prend quatre fois plus (128), moins 8 à +7 au hasard ; et 2 + l'ennui ;
//   - au-delà de 8 000 de fatigue, un appel sur quatre : (fatigue − 8 000) / 256.
//
// Enfin, un visiteur qui a fait autant d'attractions que le parc en compte voit sa fatigue bondir de
// 1 024 fois ce nombre (sur 16 bits) : il ne tardera pas à rentrer chez lui (0x22834).
//
// Non vérifiés par les scénarios : une attraction dont le mot +0x32 est nul au huitième appel, des
// toilettes absentes ou hors service, une file sans attraction, et ce bond de la fatigue (dans le parc
// de la démonstration, personne ne fait ses 22 attractions).
//
// Le programme rend 0 dans l'octet bas d'eax, que personne ne lit.
export function mettreAJourLHumeur(jeu, v) {
  const parc = (FICHES_DES_PARCS + octet(jeu, motLong(jeu, JOUEUR) + 0x41) * TAILLE_FICHE_PARC) >>> 0;
  const mises = (mot(jeu, v + 0xB3) + 1) & 0xFFFF;
  ecrireMot(jeu, v + 0xB3, mises);
  const ennui = depuis(jeu, motLong(jeu, v + 0x75)) >>> 9;
  const etat = octet(jeu, v + 0x0C);

  if (etat === GUICHET) {
    ecrireMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) - (mot(jeu, parc + 0x1D) >> 4));
    ecrireMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) + 8 - hasard(jeu) % 16);
    ecrireMotLong(jeu, v + 0x75, maintenant(jeu));
    ecrireMot(jeu, v + 0x82, 0);
    return;
  }
  if (etat === SUR_L_ATTRACTION && mises % 8 === 0) {
    const attraction = objetNumero(jeu, mot(jeu, v + 0x16));
    if (mot(jeu, attraction + 0x32) !== 0) {
      const genre = GENRES_ATTRACTIONS + mot(jeu, attraction + 0x16);
      const plaisir = ((octet(jeu, genre + 0xA9) * mot(jeu, parc + 0x08)) >> 8) + (6 - octet(jeu, attraction + 0x13)) * 2;
      ecrireMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) + plaisir);
    }
    return;
  }
  if (etat === DESCENTE) {
    const attraction = objetNumero(jeu, mot(jeu, v + 0x16));
    const genre = GENRES_ATTRACTIONS + mot(jeu, attraction + 0x16);
    const intensite = octet(jeu, genre + 0xA9);
    ecrireMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) + hasard(jeu) % 32 + (intensite >> 1));
    const remue = () => diviser((6 - mot(jeu, genre + 0xB8)) * 16 + octet(jeu, genre + 0xA9), 64);
    let perte = remue();
    hasard(jeu);                  // tiré pour rien (anomalie reproduite)
    ecrireOctet(jeu, v + 0x51, octetSigne(jeu, v + 0x51) - perte);
    perte = remue();
    hasard(jeu);                  // de même
    ecrireOctet(jeu, v + 0x50, octetSigne(jeu, v + 0x50) - perte);
    ecrireMotLong(jeu, v + 0x75, maintenant(jeu));
    return;
  }

  // Le calcul général. La pénalité est une variable de 16 bits du programme ; on la cumule ici sans
  // borne, seule sa moitié basse compte à la fin.
  ecrireMotLong(jeu, LIGNE_DU_SOURCE, 0x3C);
  const cellule = celluleDe(jeu, v);
  let penalite = 0;

  if (etat !== FILE) penalite += humeurDesVoisins(jeu, v, parc, cellule);

  if ((octet(jeu, cellule + 3) & 7) !== 0) {
    penalite += (mot(jeu, parc + 0x0B) >> 5) + ennui;
    ecrireOctet(jeu, v + 0xC6, octet(jeu, v + 0xC6) + 1);
  }

  if (etat === TOILETTES) penalite += soulagement(jeu, v, cellule);

  if (etat === VOMIR) {
    penalite += 300;
    ecrireOctet(jeu, v + 0x50, octet(jeu, v + 0x50) - 8);
    ecrireOctet(jeu, v + 0x51, octet(jeu, v + 0x51) - 4);
    ecrireMot(jeu, v + 0x82, mot(jeu, v + 0x82) + 3000);
  }

  for (const besoin of [0x50, 0x51]) {
    const periode = periodeDuBesoin(octetSigne(jeu, v + besoin));
    if (periode !== 0 && mises % periode === 0) penalite += octet(jeu, parc + 0x0A) >> 2;
  }

  if (etat === FILE && mises % 4 === 0) {
    const attraction = objetNumero(jeu, mot(jeu, v + 0x16));
    if (estUnObjet(jeu, attraction)) {
      const genre = GENRES_ATTRACTIONS + mot(jeu, attraction + 0x16);
      const usure = mot(jeu, attraction + 0x2E) >> 5;
      penalite += usure + ennui;
      if (octet(jeu, genre + 0xA9) >= 50) penalite -= usure;
    }
  }

  if (etat === MARCHE) {
    ecrireMot(jeu, v + 0x82, motSigne(jeu, v + 0x82) + 32 - diviser(motSigne(jeu, v + 0x54), 128));
    ecrireMot(jeu, v + 0x82, motSigne(jeu, v + 0x82) - (4 - hasard(jeu) % 8));
    if (mises % 4 === 0) penalite += ennui;
  }

  if (etat === MARCHE_6) {
    ecrireMot(jeu, v + 0x82, motSigne(jeu, v + 0x82) + 128 - diviser(motSigne(jeu, v + 0x54), 128));
    ecrireMot(jeu, v + 0x82, motSigne(jeu, v + 0x82) - (8 - hasard(jeu) % 16));
    penalite += 2 + ennui;
  }

  if (motSigne(jeu, v + 0x82) > 8000 && mises % 4 === 0) {
    penalite += diviser(motSigne(jeu, v + 0x82) - 8000, 256);
  }

  ecrireMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) - penalite);
  ecrireMotLong(jeu, LIGNE_DU_SOURCE, 0xE0);

  const attractionsDuParc = octet(jeu, motLong(jeu, PARC) + 0x82);
  if (octet(jeu, v + 0x81) === attractionsDuParc) {
    ecrireMot(jeu, v + 0x82, mot(jeu, v + 0x82) + attractionsDuParc * 1024);
  }
}

// Ce que l'humeur des autres visiteurs de la case fait à celle-ci : la part de la pénalité. La liste de
// la case se parcourt par le mot +2 des objets, jusqu'à 0 ou un décor.
function humeurDesVoisins(jeu, v, parc, cellule) {
  const seuilContent = motSigne(jeu, parc + 0x00), seuilMecontent = motSigne(jeu, parc + 0x02);
  const force = mot(jeu, parc + 0x0D);
  let penalite = 0;
  for (let p = objetNumero(jeu, motSigne(jeu, cellule)); estUnObjet(jeu, p); p = objetNumero(jeu, motSigne(jeu, p + 2))) {
    if (octet(jeu, p + 4) !== TYPE_VISITEUR || p === v >>> 0) continue;
    const humeur = motSigne(jeu, p + 0x54);
    const derniere = octet(jeu, v + 0x84);
    const deteint = -(force * humeur);
    if (humeur > seuilContent + 250 && derniere !== 1) {
      penalite += diviser(deteint, 512) - 2;
      ecrireOctet(jeu, v + 0x84, 1);
    } else if (humeur < seuilMecontent - 150 && derniere !== 2) {
      penalite += diviser(deteint, 512) + 6;
      ecrireOctet(jeu, v + 0x84, 2);
    } else if (humeur > seuilContent && derniere !== 1) {
      penalite += diviser(deteint, 1024) - 1;
      ecrireOctet(jeu, v + 0x84, 1);
    } else if (humeur < seuilMecontent && derniere !== 2) {
      penalite += diviser(deteint, 1024) + 3;
      ecrireOctet(jeu, v + 0x84, 2);
    }
  }
  return penalite;
}

// Aux toilettes : la part de la pénalité, et l'effet sur le visiteur.
function soulagement(jeu, v, cellule) {
  const toilettes = jeu.appeler(CHERCHER_SUR_LA_CASE, cellule, TYPE_TOILETTES) >>> 0;
  if (!estUnObjet(jeu, toilettes) || octet(jeu, toilettes + 0x0C) !== 2) return 0;
  const fiche = CATALOGUE_DES_DECORS + mot(jeu, toilettes + 0x16) * TAILLE_FICHE_DECOR;
  const selon = (besoin, paliers) => {
    const b = octetSigne(jeu, v + besoin);
    return b > 14 ? paliers[0] : b > 11 ? paliers[1] : b > 8 ? paliers[2] : b > 4 ? paliers[3] : 0;
  };
  let penalite = selon(0x50, [160, 120, 80, 40]) + selon(0x51, [100, 75, 50, 25]);
  penalite += 2 * mot(jeu, toilettes + 0x3C) - octet(jeu, fiche + 0x32);
  penalite += octet(jeu, fiche + 0x31);
  ecrireOctet(jeu, v + 0x50, 0xFF);
  ecrireOctet(jeu, v + 0x51, 0xFF);
  ecrireMot(jeu, v + 0x82, mot(jeu, v + 0x82) + octet(jeu, fiche + 0x31) * 8);
  return penalite;
}

// Un besoin (estomac ou soif) hors de sa zone de confort coûte, un appel sur `periode`.
// Le programme enchaîne quatre tests, du plus large écart au plus étroit, chacun avec sa période : un
// test qui échoue sur la période passe au suivant. Les zones s'emboîtant et chaque période divisant
// les suivantes, cela revient à prendre la période de la zone la plus éloignée où tombe le besoin.
function periodeDuBesoin(b) {
  if (b < -6 || b > 13) return 2;
  if (b < -3 || b > 11) return 4;
  if (b < 1 || b > 8) return 8;
  if (b < 5 || b > 7) return 16;
  return 0;
}

// ======================================================================================================

// 0x2789A — choisir la bulle de pensée d'un visiteur, et peut-être lui faire exprimer son humeur par une
// émotion. `forcer` (un mot) : l'émotion est demandée par un autre (0x32BCF, le seul qui passe 1).
// Rend 1 si le visiteur passe dans l'état d'émotion, 0 sinon.
//
// La bulle d'abord, seulement si la précédente a déjà duré — il en reste moins de 50 mises à jour —
// et que le visiteur a quelque chose à exprimer (drapeau 0x40) ou qu'on le force ; ou bien s'il est
// l'objet sélectionné et qu'il en reste moins de 37 : le visiteur que regarde le joueur pense
// davantage. Il passe alors en revue les dix-neuf raisons, en partant de celle qui suit la dernière
// montrée, et montre la première qui s'applique (numéros de figure ; ce qu'elles dessinent, non
// vérifié sur image) :
//
//    0  fatigue au-delà de 12 000                        0x229
//    1  fatigue au-delà de 8 000                         0x26E
//    2  fatigue au-delà de 7 000                         0x22D
//    3  plus de 8 fois sur une case sale (+0xC6)         0x234  (le compte repart de zéro ; 50 au lieu de 200)
//    4  moins de 400 d'argent                            0x22A
//    5  autant d'attractions faites que le parc en a     0x22C
//    6  les trois quarts, dans un parc de plus de trois  0x22C
//    7  estomac sous 1                                   0x219
//    8  soif sous 1                                      0x21A
//    9  estomac de 4 à 8                                 0x21C
//   10  soif de 4 à 8                                    0x21D
//   11  estomac au-delà de 8                             0x270
//   12  soif au-delà de 8                                0x271
//   13  estomac ou soif au-delà de 5                     0x277
//   14  l'heure du dernier plaisir au-delà de 3 000      0x275  (anomalie : l'heure, non le temps écoulé)
//   15  plus de 3 000 pas dans une file d'attente        0x276
//   16  mécontent (sous le seuil du parc, +2)            0x274
//   17  entre les deux seuils                            0x273
//   18  content (au-dessus du seuil, +0)                 0x272
//
// La bulle dure 200 mises à jour (50 pour la saleté).
//
// L'émotion ensuite : le délai +0x8B décroît ; quand le temps écoulé depuis l'heure +0x5B est un
// multiple de 256 pas, ou si le visiteur a quelque chose à exprimer ou qu'on le force, et si le délai
// est écoulé, il s'arrête : état, silhouette et direction sont sauvés, le délai repart de 32, et il
// passe dans l'état 0x3C si on le force, 0x1A sinon, avec l'animation (rang dans la table de son genre)
// de ce qu'il ressent — l'émotion en attente (+0x5A) s'il en a une ; sinon, dans cet ordre : la
// fatigue (2 : au moins 2 000 fois le nombre d'attractions du parc, ou plus de 12 000), un grand
// mécontentement (9 : 150 sous le seuil), le contentement (3), l'ennui (6 : plus de 3 000 pas depuis le
// dernier plaisir), le mécontentement (5) ; sinon il garde sa silhouette. (Ce que montrent ces
// animations : non vérifié sur image.)
//
// Non vérifiés par les scénarios : les raisons 0, 5, 6, 11, 15 et 18, une revue où aucune raison ne
// s'applique, la bulle du visiteur sélectionné ; l'émotion en attente 1, et les animations 2, 5, 6 et 9
// (seules l'animation 3, la silhouette gardée, les émotions en attente 2 et 3, la remise à 0 et
// l'émotion forcée le sont).
export function exprimerSonHumeur(jeu, v, forcer) {
  forcer &= 0xFFFF;
  const parc = motLong(jeu, PARC);
  const duree = octet(jeu, v + 0xB9);
  const selectionne = objetNumero(jeu, mot(jeu, OBJET_SELECTIONNE)) === (v >>> 0);
  if ((duree < 50 && ((octet(jeu, v + 0x05) & 0x40) !== 0 || forcer !== 0)) || (selectionne && duree < 37)) {
    choisirUneBulle(jeu, v, parc);
  }
  return exprimerUneEmotion(jeu, v, forcer, parc);
}

function choisirUneBulle(jeu, v, parc) {
  if (octetSigne(jeu, v + 0xBA) + 1 >= 19) ecrireOctet(jeu, v + 0xBA, 0xFF);
  let raison = (octet(jeu, v + 0xBA) + 1) & 0xFF;
  for (let essais = 0; essais < 19; essais++, raison = (raison + 1) & 0xFF) {
    if (raison >= 19) raison = 0;
    const bulle = bulleDeLaRaison(jeu, v, parc, raison);
    if (bulle === 0) continue;
    ecrireMot(jeu, v + 0xB7, bulle);
    ecrireOctet(jeu, v + 0xB9, raison === 3 ? 50 : 200);
    ecrireOctet(jeu, v + 0xBA, raison);
    return;
  }
}

// La figure de la bulle si la raison s'applique, 0 sinon. (La raison 3 remet son compte à zéro.)
function bulleDeLaRaison(jeu, v, parc, raison) {
  const fatigue = motSigne(jeu, v + 0x82);
  const estomac = octetSigne(jeu, v + 0x50), soif = octetSigne(jeu, v + 0x51);
  const contentement = motSigne(jeu, v + 0x54);
  const seuilContent = motSigne(jeu, parc + 0x00), seuilMecontent = motSigne(jeu, parc + 0x02);
  const faites = octet(jeu, v + 0x81), attractions = octet(jeu, parc + 0x82);
  switch (raison) {
    case 0: return fatigue > 12000 ? 0x229 : 0;
    case 1: return fatigue > 8000 ? 0x26E : 0;
    case 2: return fatigue > 7000 ? 0x22D : 0;
    case 3:
      if (octet(jeu, v + 0xC6) <= 8) return 0;
      ecrireOctet(jeu, v + 0xC6, 0);
      return 0x234;
    case 4: return mot(jeu, v + 0x6F) < 400 ? 0x22A : 0;
    case 5: return faites >= attractions && attractions !== 0 ? 0x22C : 0;
    case 6: return faites >= (attractions * 3) >> 2 && attractions > 3 ? 0x22C : 0;
    case 7: return estomac < 1 ? 0x219 : 0;
    case 8: return soif < 1 ? 0x21A : 0;
    case 9: return estomac > 3 && estomac <= 8 ? 0x21C : 0;
    case 10: return soif > 3 && soif <= 8 ? 0x21D : 0;
    case 11: return estomac > 8 ? 0x270 : 0;
    case 12: return soif > 8 ? 0x271 : 0;
    case 13: return soif > 5 || estomac > 5 ? 0x277 : 0;
    case 14: return motLong(jeu, v + 0x75) > 3000 ? 0x275 : 0;
    case 15: return depuis(jeu, motLong(jeu, v + 0x20)) > 3000 && octet(jeu, v + 0x0C) === FILE ? 0x276 : 0;
    case 16: return contentement < seuilMecontent ? 0x274 : 0;
    case 17: return contentement > seuilMecontent && contentement < seuilContent ? 0x273 : 0;
    case 18: return contentement > seuilContent ? 0x272 : 0;
    default: return 0;
  }
}

function exprimerUneEmotion(jeu, v, forcer, parc) {
  if (octet(jeu, v + 0x8B) !== 0) ecrireOctet(jeu, v + 0x8B, octet(jeu, v + 0x8B) - 1);
  const aSonHeure = (depuis(jeu, motLong(jeu, v + 0x5B)) & 0xFF) === 0;
  if (!aSonHeure && forcer === 0 && (octet(jeu, v + 0x05) & 0x40) === 0) return 0;
  if (octetSigne(jeu, v + 0x8B) > 0) return 0;

  ecrireOctet(jeu, v + 0x05, octet(jeu, v + 0x05) & ~0x40);
  const etat = octet(jeu, v + 0x0C);
  if (etat === EMOTION_FORCEE || etat === EMOTION) {
    // Déjà dans une émotion : l'état à reprendre reste celui d'avant, ou la marche (6) s'il n'y en a pas.
    if (octet(jeu, v + 0xBC) === 0) ecrireOctet(jeu, v + 0xBC, MARCHE_6);
  } else {
    ecrireOctet(jeu, v + 0xBC, etat);
  }
  ecrireMot(jeu, v + 0x5F, mot(jeu, v + 0x0A));
  ecrireOctet(jeu, v + 0x58, octet(jeu, v + 0x12));
  ecrireOctet(jeu, v + 0x8B, 0x20);
  if (forcer !== 0) {
    ecrireOctet(jeu, v + 0x0C, EMOTION_FORCEE);
    return 1;
  }

  const k = animationDeLEmotion(jeu, v, parc);
  if (k !== null) ecrireMot(jeu, v + 0x0A, figure(jeu, animation(jeu, v, k)));
  ecrireOctet(jeu, v + 0x0C, EMOTION);
  return 1;
}

// L'animation (rang dans la table du genre) de l'émotion, ou null s'il garde sa silhouette.
function animationDeLEmotion(jeu, v, parc) {
  if (octet(jeu, v + 0x5A) !== 0) {
    if (octet(jeu, v + 0x5A) > 3) ecrireOctet(jeu, v + 0x5A, 0);
    return mot(jeu, EMOTIONS_EN_ATTENTE + 2 * octet(jeu, v + 0x5A));
  }
  const fatigue = motSigne(jeu, v + 0x82), contentement = motSigne(jeu, v + 0x54);
  if (fatigue >= octet(jeu, parc + 0x82) * 2000 || fatigue > 12000) return 2;
  if (contentement < motSigne(jeu, parc + 0x02) - 150) return 9;
  if (contentement > motSigne(jeu, parc + 0x00)) return 3;
  if (depuis(jeu, motLong(jeu, v + 0x75)) > 3000) return 6;
  if (contentement < motSigne(jeu, parc + 0x02)) return 5;
  return null;
}

// ======================================================================================================

// 0x6804A — l'attrait du prix d'entrée du parc : ce que les visiteurs qui arrivent en pensent.
//
// Le parc a un prix de référence, j = (mot +0x04) × ((mot long +0x105) / 2 + mot long +0x8A) / 128.
// Avec a = octet +0x48 du parc en cours + octet signé +0x21, l'attrait vaut a − (prix − j) × a / j :
// a au prix de référence, 0 au double, davantage en dessous. Tant que le mot long +0x8A ne dépasse pas
// 3, il vaut 0. Le guichet (0x223C1) le compare au seuil +0x47 ; trois autres fonctions, non étudiées
// (0x2EBB7, 0x31748, 0x3B76E), rangent attrait × 100 / octet +0x48 dans le mot +0x2C0 du joueur.
//
// Relevé dans le parc de la démonstration : +0x04 = 140, +0x105 = 253, +0x8A = 1 082 — 1 105 dans
// construction.json, où l'on bâtit et embauche : la richesse du parc, vraisemblablement —, d'où
// j = 1 321 face à un billet de 50 ; l'octet +0x48 passe de 28 à 43 en 200 s de simulation, a de 33 à
// 48, l'attrait de 64 à 94, et le seuil +0x47 de 28 à 34 : tous les visiteurs entrent. Il faudrait un
// billet de près de 1 500 pour qu'ils hésitent. Non vérifié par les scénarios : l'attrait nul.
//
// La fiche du parc lue ici est celle que désigne la fiche du joueur (mot +2) ; l'octet +0x48, lui, est
// pris dans celle de [0xD3818]. Le programme divise sans vérifier j : un prix juste nul lèverait une
// exception, reproduite.
export function attraitDuPrixDEntree(jeu) {
  const joueur = motLong(jeu, JOUEUR);
  const fiche = (motLong(jeu, FICHES_DES_JOUEURS) + octet(jeu, joueur + 0x40) * TAILLE_FICHE_JOUEUR) >>> 0;
  const parc = (FICHES_DES_PARCS + mot(jeu, fiche + 2) * TAILLE_FICHE_PARC) >>> 0;
  if (motLongSigne(jeu, parc + 0x8A) <= 3) return 0;
  ecrireMotLong(jeu, LIGNE_DU_SOURCE, 0x15B);
  const a = octet(jeu, motLong(jeu, PARC) + 0x48) + octetSigne(jeu, parc + 0x21);
  const valeur = (((motLong(jeu, parc + 0x105) >>> 1) + motLong(jeu, parc + 0x8A)) | 0);
  const prixJuste = Math.imul(mot(jeu, parc + 0x04), valeur) >>> 7;
  const ecart = (mot(jeu, parc + 0x1D) - prixJuste) | 0;
  return (a - diviser(Math.imul(ecart, a), prixJuste | 0)) | 0;
}

// ======================================================================================================

// 0x223C1 — état 4 : le guichet d'entrée du parc. Rend 1 quand une phase s'achève, 0 sinon.
//
// Le visiteur avance à chaque mise à jour (sauf en phase 1), son animation aussi, et décompte ; au
// bout du compte, la phase en cours (+0x20) s'achève et la suivante commence :
//
//   0  il décide d'entrer. 0x6804A dit l'attrait du prix : à partir de l'octet +0x47 du parc il entre
//      sans hésiter ; au-dessous, il entre avec une chance de (attrait / seuil) — et seulement dans ce
//      cas l'heure du dernier plaisir (+0x75) repart ; sinon il renonce : il perd 250 de contentement,
//      et repart vers l'entrée du parc (état 0x40, case visée +0x2CA du joueur). S'il entre, il attend
//      encore 10 mises à jour. (Un seuil nul face à un attrait négatif : rien ne se passe, et la phase
//      1 suit dès la mise à jour suivante.) Aucun visiteur ne renonce dans les scénarios (voir 0x6804A).
//   1  il paie, immobile : le prix d'entrée (mot +0x1D du parc) quitte son argent — tout ce qu'il a,
//      s'il n'en a pas assez — et entre au solde du joueur et dans trois recettes ; deux comptes
//      d'entrées s'incrémentent ; +0x4F prend le mot 0xD665C ; l'ennui et la fatigue repartent. Il fait
//      demi-tour, pour revenir au milieu de sa case, en |128 − x| / vitesse mises à jour, où x devrait
//      être sa position dans la case : c'est l'octet bas d'une variable que le programme n'a pas écrite
//      dans cette phase (anomalie reproduite, voir « Le reste laissé sur la pile »). Les deux branches
//      du calcul, directions paires et impaires, sont identiques. Une vitesse nulle donne 1 (0x19ED3).
//      Puis l'humeur (0x672A5, qui compte le prix payé).
//   2  il est au milieu de sa case (+6 et +8 à 128), reprend sa direction (+0x58) et son état d'avant
//      (+0xD) ; +0x64 revient à 0 ; puis l'humeur, dans cet état-là.
//
// Au bout de chaque phase, il reprend la silhouette de marche de sa direction.
//
// Non vérifiés par les scénarios : le renoncement, l'entrée au hasard, le seuil nul, la vitesse nulle,
// les directions paires en phase 1, une phase au-delà de 2. Tous les visiteurs des scénarios entrent
// sans hésiter, et paient de côté (directions 1 et 3).
export function passerLeGuichet(jeu, v) {
  const reste = resteALEntree(jeu);
  avancerLAnimation(jeu, v);
  let x = null;
  if (motLong(jeu, v + 0x20) !== 1) x = avancerDUnPas(jeu, v);
  const aLaFin = (resultat) => {
    laisserSurLaPile(jeu, reste, x === null ? reste.valeur : moitieBasse(reste, x));
    return resultat;
  };
  if (decompter(jeu, v) > 0) return aLaFin(0);

  const phase = motLong(jeu, v + 0x20);
  ecrireMotLong(jeu, v + 0x20, phase + 1);
  if (phase === 0) deciderDEntrer(jeu, v);
  else if (phase === 1) payerLEntree(jeu, v, reste.valeur & 0xFF);
  else if (phase === 2) reprendreSonChemin(jeu, v);
  prendreLaSilhouetteDeMarche(jeu, v);
  return aLaFin(1);
}

function deciderDEntrer(jeu, v) {
  const attrait = jeu.appeler(ATTRAIT_DU_PRIX) | 0;
  const parc = motLong(jeu, PARC);
  const seuil = octet(jeu, parc + 0x47);
  if (seuil <= attrait) {
    ecrireMot(jeu, v + 0x14, 10);
    return;
  }
  if (seuil === 0) return;
  if (hasard(jeu) % seuil < attrait) {
    ecrireMot(jeu, v + 0x14, 10);
    ecrireMotLong(jeu, v + 0x75, maintenant(jeu));
    return;
  }
  // Il renonce, et repart vers l'entrée du parc.
  ecrireMot(jeu, v + 0x54, mot(jeu, v + 0x54) - 250);
  ecrireOctet(jeu, v + 0x0C, VERS_LA_SORTIE);
  const entree = mot(jeu, motLong(jeu, JOUEUR) + 0x2CA);
  ecrireOctet(jeu, v + 0x56, entree % 64);
  ecrireOctet(jeu, v + 0x57, entree >> 6);
}

// `xRestant` : l'octet bas de ce que la pile portait à l'endroit de la variable non écrite.
function payerLEntree(jeu, v, xRestant) {
  const vitesse = octet(jeu, v + 0x13);
  ecrireMot(jeu, v + 0x14, vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : diviser(Math.abs(0x80 - xRestant), vitesse));
  ecrireOctet(jeu, v + 0x12, octet(jeu, DEMI_TOUR + 2 * octet(jeu, v + 0x12)));

  const parc = motLong(jeu, PARC);
  ecrireMot(jeu, parc + 0x1F, mot(jeu, parc + 0x1F) + 1);
  ecrireMot(jeu, parc + 0x33, mot(jeu, parc + 0x33) + 1);
  ecrireOctet(jeu, v + 0x4F, octet(jeu, JOUEUR_EN_COURS));
  ecrireMotLong(jeu, v + 0x75, maintenant(jeu));
  ecrireMot(jeu, v + 0x82, 0);

  const prix = mot(jeu, parc + 0x1D);
  ecrireMot(jeu, v + 0x6F, mot(jeu, v + 0x6F) < prix ? 0 : mot(jeu, v + 0x6F) - prix);
  const solde = motLong(jeu, FICHE_DU_JOUEUR) + 0x0A;
  ecrireMotLong(jeu, solde, motLong(jeu, solde) + prix);
  const recette = motLong(jeu, JOUEUR) + 0x2D2;
  ecrireMotLong(jeu, recette, motLong(jeu, recette) + prix);
  ecrireMotLong(jeu, parc + 0x23, motLong(jeu, parc + 0x23) + prix);

  jeu.appeler(METTRE_A_JOUR_L_HUMEUR, v);
}

function reprendreSonChemin(jeu, v) {
  ecrireOctet(jeu, v + 0x06, 0x80);
  ecrireOctet(jeu, v + 0x08, 0x80);
  ecrireMot(jeu, v + 0x14, 0);
  ecrireOctet(jeu, v + 0x12, octet(jeu, v + 0x58));
  ecrireOctet(jeu, v + 0x0C, octet(jeu, v + 0x0D));
  ecrireOctet(jeu, v + 0x64, 0);
  jeu.appeler(METTRE_A_JOUR_L_HUMEUR, v);
}

// ======================================================================================================

// 0x24DFE — état 0x0C : dans la file d'attente d'une attraction. Rend 0.
//
// Une mise à jour sur quatre, l'animation avance — les animations lentes (bit 0 de l'octet +5 de
// l'objet graphique) seulement tous les 500 pas depuis l'entrée dans la file (+0x20). Une sur 24, le
// visiteur fait le point : si l'objet qu'il attend n'est plus une attraction ouverte (type 4, octet
// +0x4B à 1 — ouverte, vraisemblablement : c'est sa valeur pour toutes celles de la démo), ou s'il
// attend depuis plus de 6 000 pas, il quitte la file (état 0x34) et reprend sa
// silhouette de marche, et deux mots de l'attraction, +0x1E et +0x2A, reviennent à zéro (ce qu'ils
// comptent : non établi). Puis, qu'il reste ou non, son humeur (0x672A5) et ses pensées (0x2789A).
//
// Non vérifié par les scénarios : l'abandon de la file. Personne n'abandonne, pas même quand
// construction.json ferme les tasses ; les visiteurs qui quittent l'état 0x0C le font par une émotion
// (0x2789A).
export function attendreDansLaFile(jeu, v) {
  const mises = motLong(jeu, MISES_A_JOUR);
  if ((mises & 3) === 0) {
    const lente = (octet(jeu, objetGraphique(jeu, mot(jeu, v + 0x0A)) + 5) & 1) !== 0;
    if (!lente || depuis(jeu, motLong(jeu, v + 0x20)) % 500 === 0) avancerLAnimation(jeu, v);
  }
  if (mises % 24 !== 0) return 0;

  const reste = resteALEntree(jeu);
  const attraction = objetNumero(jeu, mot(jeu, v + 0x16));
  const ouverte = octet(jeu, attraction + 4) === TYPE_ATTRACTION && octet(jeu, attraction + 0x4B) === 1;
  if (!ouverte || depuis(jeu, motLong(jeu, v + 0x20)) > 6000) {
    ecrireMot(jeu, attraction + 0x1E, 0);
    ecrireMot(jeu, attraction + 0x2A, 0);
    ecrireOctet(jeu, v + 0x0C, QUITTER_LA_FILE);
    prendreLaSilhouetteDeMarche(jeu, v);
  }
  jeu.appeler(METTRE_A_JOUR_L_HUMEUR, v);
  jeu.appeler(EXPRIMER_SON_HUMEUR, v, 0);
  laisserSurLaPile(jeu, reste, attraction);      // l'original gardait l'attraction en [ebp-8]
  return 0;
}

// 0x24F41 — état 0x0E : sur l'attraction. Une mise à jour sur huit, si le mot +0x32 de l'attraction
// vaut 1, l'humeur (0x672A5, qui y compte le plaisir). Pendant qu'un visiteur est dessus, ce mot prend
// les valeurs 0 à 4 (2 les trois quarts du temps, 1 une fois sur treize) : les phases d'un tour,
// vraisemblablement, 1 celle où elle tourne (0x672A5 n'exige de lui que d'être non nul, et le dessin de
// la carte l'exige non nul pour jouer la musique de l'attraction). Ne rend rien.
export function profiterDeLAttraction(jeu, v) {
  if ((motLong(jeu, MISES_A_JOUR) & 7) !== 0) return;
  if (mot(jeu, objetNumero(jeu, mot(jeu, v + 0x16)) + 0x32) !== 1) return;
  const reste = resteALEntree(jeu);
  jeu.appeler(METTRE_A_JOUR_L_HUMEUR, v);
  laisserSurLaPile(jeu, reste, 0x24F7A);        // l'adresse de retour de l'appel, dans l'original
}

// 0x2775A — état 0x4E : aux toilettes. Au bout du compte à rebours, l'humeur (0x672A5 : le soulagement),
// puis il reprend sa direction (+0x58) et sa silhouette, et sort (état 0x18). Rend 1 alors, 0 sinon.
export function etreAuxToilettes(jeu, v) {
  if (decompter(jeu, v) > 0) return 0;
  const reste = resteALEntree(jeu);
  jeu.appeler(METTRE_A_JOUR_L_HUMEUR, v);
  ecrireMot(jeu, v + 0x14, 0);
  ecrireOctet(jeu, v + 0x12, octet(jeu, v + 0x58));
  prendreLaSilhouetteDeMarche(jeu, v);
  ecrireOctet(jeu, v + 0x0C, SORTIE_DES_TOILETTES);
  laisserSurLaPile(jeu, reste, v);               // l'argument de l'appel, dans l'original
  return 1;
}

// 0x22BA6 — état 0x40 : en route vers la sortie du parc, la case visée (+0x56, +0x57). Rend 1 quand il
// change d'état, 0 sinon.
//
// À chaque mise à jour il avance d'un pas, son animation une fois sur quatre. Au bout du compte à
// rebours : son humeur (0x672A5) ; un nouveau compte, 256 / vitesse (1 pour une vitesse nulle,
// 0x19ED3) ; et la direction vers la sortie (0x349EB) :
//   - arrivé (4) : il se tourne vers une case voisine dont le sol est 0xED — il les examine toutes les
//     quatre, en partant d'une direction tirée au hasard, et la dernière l'emporte —, et franchit la
//     sortie (état 0x1E) ;
//   - pas de chemin (négatif) : état 0x20 ;
//   - sinon il prend cette direction. Mais juste au nord de l'entrée — colonnes 31 à 33, rangées 58 et
//     59, écrites en dur, alors que la case de l'entrée est une donnée du joueur (+0x2CA : 0xF20, soit
//     colonne 32, rangée 60, dans le parc de la démonstration) —, s'il porte l'un des drapeaux 0x30,
//     il les efface et redemande le chemin, une fois.
//
// Non vérifiée par les scénarios : la vitesse nulle. Les trois issues, et la seconde demande du
// chemin, le sont — l'absence de chemin seulement par la simulation de 330 s, où les visiteurs s'en
// vont en nombre vers la fin de l'année.
//
// Défaut d'origine : 0x349EB ne trouve pas toujours le portique, et le visiteur sans chemin reste
// planté (l'eau et ce qui la borde, retour 62 de docs/demandes.md). Le réglage du retour des visiteurs
// (corrections.js) donne la direction d'un plus court chemin à la place.
export function allerVersLaSortie(jeu, v) {
  const reste = resteALEntree(jeu);
  if ((motLong(jeu, MISES_A_JOUR) & 3) === 0) avancerLAnimation(jeu, v);
  if (decompter(jeu, v) <= 0) {
    jeu.appeler(METTRE_A_JOUR_L_HUMEUR, v);
    const vitesse = octet(jeu, v + 0x13);
    ecrireMot(jeu, v + 0x14, vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : diviser(0x100, vitesse));
    let dejaRedemande = false;
    for (;;) {
      const direction = directionDuRetour(jeu, v)          // hors du jeu d'origine, éteint par défaut
        ?? s16(jeu.appeler(CHEMIN_VERS_LA_CIBLE, v, 0x96, 0x29CD));
      if (direction === 4) {
        seTournerVersLaSortie(jeu, v);
        ecrireOctet(jeu, v + 0x0C, FRANCHIR_LA_SORTIE);
        laisserSurLaPile(jeu, reste);
        return 1;
      }
      if (direction < 0) {
        ecrireOctet(jeu, v + 0x0C, SANS_CHEMIN);
        laisserSurLaPile(jeu, reste);
        return 1;
      }
      if (!dejaRedemande && justeAuNordDeLEntree(jeu, v) && (octet(jeu, v + 0x05) & 0x30) !== 0) {
        ecrireOctet(jeu, v + 0x05, octet(jeu, v + 0x05) & 0xCF);
        dejaRedemande = true;
        continue;
      }
      ecrireOctet(jeu, v + 0x12, direction);
      prendreLaSilhouetteDeMarche(jeu, v);
      break;
    }
  }
  const x = avancerDUnPas(jeu, v);
  laisserSurLaPile(jeu, reste, moitieBasse(reste, x));
  return 0;
}

function justeAuNordDeLEntree(jeu, v) {
  const colonne = octet(jeu, v + 7), rangee = octet(jeu, v + 9);
  return colonne >= 0x1F && colonne <= 0x21 && rangee >= 0x3A && rangee <= 0x3B;
}

function seTournerVersLaSortie(jeu, v) {
  let direction = hasard(jeu) & 3;
  const cellule = celluleDe(jeu, v);
  for (let n = 0; n < 4; n++, direction = (direction + 1) & 3) {
    const voisine = (cellule + motSigne(jeu, CASES_VOISINES + 2 * direction) * 4) >>> 0;
    if (octet(jeu, voisine + 2) !== 0xED) continue;
    ecrireOctet(jeu, v + 0x12, direction);
    prendreLaSilhouetteDeMarche(jeu, v);
  }
}

// ======================================================================================================

// Toutes, sauf 0x6804A, écrivent dans les objets du parc, dans le tas (0x223C1 aussi dans la fiche du
// joueur) : la comparaison appel par appel restaure et compare toute la mémoire. 0x6804A, peu appelée,
// l'est de même.
export const reecritures = [
  { adresse: 0x672A5, nom: 'mettreAJourLHumeur', fn: mettreAJourLHumeur, arguments: 1, memoire: 'entiere' },
  { adresse: 0x2789A, nom: 'exprimerSonHumeur', fn: exprimerSonHumeur, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x6804A, nom: 'attraitDuPrixDEntree', fn: attraitDuPrixDEntree, arguments: 0, retour: true, memoire: 'entiere' },
  { adresse: 0x223C1, nom: 'passerLeGuichet', fn: passerLeGuichet, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x24DFE, nom: 'attendreDansLaFile', fn: attendreDansLaFile, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x24F41, nom: 'profiterDeLAttraction', fn: profiterDeLAttraction, arguments: 1, memoire: 'entiere' },
  { adresse: 0x2775A, nom: 'etreAuxToilettes', fn: etreAuxToilettes, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x22BA6, nom: 'allerVersLaSortie', fn: allerVersLaSortie, arguments: 1, retour: true, memoire: 'entiere' },
];
