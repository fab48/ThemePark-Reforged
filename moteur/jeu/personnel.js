// Le personnel du parc : amuseurs costumés, mécaniciens, gardiens et agents d'entretien.
//
// Module du chantier de la simulation. Voir docs/guide-reecriture.md.
//
// À chaque pas de simulation, la mise à jour des objets du parc (0x21681) confie chaque membre du
// personnel (objet de type 8) à la routine de son état, l'octet +C. Le métier, l'octet +59, désigne
// une fiche du catalogue des métiers ; ce que fait l'employé ne dépend ensuite que de son état : les
// quatre métiers ont chacun leur jeu d'états, et le métier lui-même n'est relu que pour choisir les
// images.
//
// LE CATALOGUE DES MÉTIERS, 0xD35C0 + métier × 0x36 (et non 0xD35EC, qui est le champ +0x2C de la
// première fiche) :
//   +0x00  le nom : 0 SHARK MAN, 1 MECHANIC, 2 HANDYMAN, 3 CHICKEN_MAN, 4 TEDDY MAN, 5 RHINO MAN,
//          6 SQUID MAN, 7 STRONG MAN, 8 GUARD
//   +0x22  mot : non établi (0x34 à 0x39, 0xF6 à 0xF8)
//   +0x24  mot : le salaire d'embauche, que 0x32232 donne aux mots +0x1C, +0x36 et, sauf au gardien,
//          +0x9A de l'employé ; pour les amuseurs, c'est aussi le salaire minimum. Dans l'ordre des
//          métiers : 62, 310, 124, 186, 37, 372, 167, 186, 559
//   +0x26  mot : première figure de la marche (plus la direction, 0 à 3)
//   +0x28  mot : première figure de l'attente (plus la direction)
//   +0x2A  mot : la figure du travail (l'amuseur qui amuse)
//   +0x2C  mot : l'état à l'embauche : 2 les amuseurs, 8 le mécanicien, 0x16 l'agent d'entretien,
//          0x34 le gardien
//   +0x31  octet : la vitesse (16 pour tous)
//   +0x32  octet : la catégorie : 0 amuseur, 1 mécanicien, 2 agent d'entretien, 3 gardien
//   +0x33  octet : le nombre d'employés de ce métier (0x32232 l'augmente, 0x325DA le diminue)
// Une « figure » est un numéro de la table de mots [0xD3B38], qui donne un objet graphique
// (voir objets.js) ; le mot +6 d'un objet graphique désigne l'image suivante de son animation, et
// le bit 0 de son octet +5 marque, vraisemblablement, la dernière image d'un cycle.
//
// L'EMPLOYÉ, un objet du parc de 200 octets (ce que lisent et écrivent les fonctions de ce module) :
//   +0x00 mot    l'objet précédent sur la même case (0 : en tête de liste) — établi par 0x1864A,
//                qui tient la liste doublement chaînée
//   +0x02 mot    l'objet suivant sur la case (0 : fin ; négatif : un décor qui clôt la liste)
//   +0x04 octet  le type, 8
//   +0x05 octet  des drapeaux : 2 = en route vers une réparation (mécanicien) ; pour l'agent
//                d'entretien, 2 déclenche 0x645AD (non exercé : vraisemblablement la tournée qu'on
//                lui trace, non établi)
//   +0x06 mot    l'abscisse fine : l'octet fort (+7) est la colonne, l'octet faible la position
//                dans la case (0x80 au milieu)
//   +0x08 mot    l'ordonnée fine : +9 la rangée, +8 la position dans la case, qui sert aussi à
//                ranger les objets d'une case par profondeur (0x1864A)
//   +0x0A mot    l'objet graphique courant (l'image de l'animation)
//   +0x0C octet  l'état ; +0x0D l'état à prendre à l'arrivée, ou à reprendre après une tâche
//   +0x12 octet  la direction : 0 vers le haut de la carte (rangée − 1), 1 vers la droite
//                (colonne + 1), 2 vers le bas, 3 vers la gauche
//   +0x13 octet  la vitesse, en 256es de case par pas : 16, soit 16 pas pour traverser une case
//   +0x14 mot    un compte à rebours, en pas de simulation
//   +0x16 mot    le mécanicien : le numéro de l'entrée d'attraction (type 6 ou 0x1C) où on l'appelle
//   +0x1C mot    le salaire validé : l'écran de l'employé y range +0x9A quand on valide, et l'en
//                reprend quand on annule
//   +0x1E mot    le gardien : le dernier voyou qu'il a arrêté (chacun renvoie au précédent)
//   +0x20 long   une patience, 400 à l'embauche (voir flaner)
//   +0x28 mot    l'agent d'entretien : pas passés à parcourir les allées (état 0x18)
//   +0x34 mot    l'amuseur : pas passés à amuser (état 6) ; le mécanicien : pas passés à attendre
//                (état 8) ou à errer (état 0x14). La liste du personnel (0x360C5) en montre la part,
//                en pour cent, du temps écoulé depuis l'embauche
//   +0x3E long   l'heure de l'embauche, en pas de simulation (0x32232)
//   +0x4D mot    une case (rangée × 64 + colonne) : pour l'amuseur, celle des visiteurs qu'il
//                amuse ; pour le gardien, sa case de départ quand il a arrêté un voyou
//   +0x56 octet  la colonne visée ; +0x57 la rangée visée (0x349EB y mène)
//   +0x58 octet  une direction mise de côté
//   +0x59 octet  le métier
//   +0x5A octet  l'amuseur : un compteur de visiteurs qu'il a fait se tourner vers lui (non établi)
//   +0x5F mot    l'objet graphique à prendre à l'arrivée
//   +0x8B octet  signé : l'amuseur n'agit que s'il est négatif ou nul ; toujours nul dans la démo
//                (non établi)
//   +0x9A mot    le salaire. L'écran de l'employé (écran 0x1C, 0x3B76E) le règle par pas de 2,
//                jusqu'à 6 000 ; 0x68E34 le ramène au minimum du métier (le mot +0x24 de la fiche
//                pour les amuseurs ; pour le mécanicien et l'agent d'entretien, les mots +0x617 et
//                +0x615 de la fiche du parc) ; nul pour le gardien, à qui l'embauche ne le donne pas.
//                L'amuseur en tire son effet sur les visiteurs : mieux payé, il amuse mieux
//   +0x9C 8 mots l'agent d'entretien : les cases d'une tournée, −1 si aucune ; +0xAC l'étape
//
// LES ÉTATS. Ceux des fonctions de ce module, exercés par moteur/scenarios/simulation.json, sont
// réécrits ici ; les autres sont décrits d'après le pseudo-C de Ghidra, à titre indicatif.
//   amuseurs    2  flâner                                   0x326DA  (ici)
//               4  rejoindre des visiteurs repérés          0x32A06  (ici)
//               6  les amuser                               0x32BCF  (ici)
//   mécanicien  8  attendre une attraction usée             0x33133  (ici)
//            0x12  l'appel reçu, le temps d'une animation   0x333CB  (ici)
//             0xA  marcher vers l'attraction                0x33482  (ici)
//             0xC  arrivé : fermer l'attraction (+4B = −1)  0x33742
//             0xE  réparer : l'usure baisse de 5 par cycle  0x33AF3
//            0x10  finir, rouvrir l'attraction              0x33BF1
//            0x14  repartir au hasard jusqu'à une case      0x33F14
//                  d'herbe où n'attend aucun autre employé
//   entretien  0x16  l'embauche : trouver une allée         0x617E0
//            0x18  parcourir les allées                     0x62FEA  (ici)
//            0x1A  hors des allées                          0x62CBB
//            0x1C  balayer                                  0x638EF  (ici)
//            0x1E  sur l'herbe (tondre ? non établi)        0x619BF
//            0x22, 0x24  non établis                        0x629DB, 0x62B9C
//            0x26  entrer dans des toilettes                0x6369E
//            0x28  les nettoyer                             0x63803
//            0x30  suivre sa tournée                        0x63A85
//      0x2C, 0x2E, 0x32  non établis                        0x64641
//   gardien  0x34  patrouiller                              0x34149  (ici)
//            0x36  marcher vers la case visée               0x3455A
//            0x38  escorter les voyous arrêtés              0x34728
//   grève    0x3A  se rendre à l'entrée du parc, 0x3C y manifester, 0x3E reprendre le travail :
//            0x3502B, 0x35208, 0x3542D (negociations.js). Un employé embauché pendant une grève
//            (octet +0x681 de la fiche du parc) la rejoint.
//   amuseur  0x3F  s'enfuir, effrayé par un voyou, puis être renvoyé (0x325DA)  0x35652 (voyous.js)
// Les scénarios atteignent les états 2, 4, 6, 8, 0xA, 0xC, 0xE, 0x10, 0x12, 0x14, 0x18 et 0x34
// (simulation.json, 330 s), et 0x16 (construction.json, qui embauche un agent d'entretien). L'agent
// d'entretien n'y balaie jamais : il ne rencontre aucun déchet sur son chemin.
//
// LA CADENCE. Le long 0xD3AF8 compte les mises à jour des objets (0x21681 l'augmente à chaque
// pas) : l'animation avance d'une image tous les 4 pas, tous les 6 pour l'amuseur qui flâne et le
// gardien qui patrouille. Le hasard est celui du jeu, 0x18B92, appelé dans l'ordre d'origine.
//
// Réécriture lisible de 0x326DA, 0x32A06, 0x32E81, 0x32BCF (les amuseurs), 0x33133, 0x333CB,
// 0x33482, 0x1864A (le mécanicien), 0x34149, 0x3436C (le gardien), 0x62FEA, 0x62F72, 0x6386F et
// 0x638EF (l'agent d'entretien ; 0x638EF, le balayage, exercé par tutoriel.json et
// tutoriel-haute.json).
//
// VÉRIFICATION. Les scénarios appellent les treize fonctions, mais n'en parcourent pas tous les
// chemins. Les intempéries n'arrivent qu'après 200 s de simulation.json : seul le rejeu de 330 s les
// vérifie. Jamais exercés : la vitesse nulle ; l'amuseur retenu (+0x8B positif) ; le mécanicien sans
// chemin (0x33482) ; 0x1864A hors de la carte ; le gardien qui voit ou arrête un voyou (il n'y a pas
// de voyou, objet de type 0x1A, dans ces parties) ; l'agent d'entretien désigné (0x645AD), sa
// tournée, les toilettes à nettoyer, la sortie des allées, et tout ce qui tient aux déchets (le choix
// de la sortie la plus sale, le balayage). Ces chemins-là n'ont été comparés à la transcription que
// sur des états fabriqués, hors des scénarios : non vérifiés par les scénarios.

// --- la mémoire ------------------------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';
import { recalerAuMilieuDeLaCase, sortieTireeEgalement } from './corrections.js';   // hors du jeu d'origine (reglages.js)

const s16 = (v) => (v << 16) >> 16;
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// Quotient d'une division signée (idiv), tronqué vers zéro ; un diviseur nul lève une exception.
function quotient(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}

// Reste d'une division non signée (div) : un diviseur nul lève une exception, comme sur la machine.
function resteNonSigne(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a >>> 0) % (b >>> 0);
}

// --- les tables du jeu -----------------------------------------------------------------------------
const GRILLE = 0xD3B08;              // pointeur : la carte, 64 × 64 cellules de 4 octets
//   cellule +0 mot signé : le premier objet posé ; +2 octet : le sol ; +3 octet : les décors
//   éparpillés, dont les bits 0 à 2 sont les déchets que balaie l'agent d'entretien
const DECHETS = 7;
const OBJETS_DU_PARC = 0xD3B10;      // pointeur : la table des objets du parc, 200 octets chacun
const FIN_DES_OBJETS_DU_PARC = 0xD3B78;
const TAILLE_OBJET = 200;
const OBJETS_GRAPHIQUES = 0xD3B80;   // pointeur : les objets graphiques, 8 octets
const FIGURES = 0xD3B38;             // pointeur : table de mots, figure → objet graphique

// Les sols : 4 octets par sorte de sol (l'octet +2 de la cellule) : +0 mot, des drapeaux ; +3 octet,
// la forme (quelles sorties a un morceau d'allée ou de file). L'herbe, le sol le plus courant (le sol
// 0, 1 331 cases de la démo), n'a aucun drapeau. Drapeaux relevés dans la table :
const SOLS = 0xB44D9;
const SOL_ALLEE = 0x2;               // les allées (48 formes)
const SOL_FILE = 0x8;                // les files d'attente
const SOL_BOUT_DE_FILE = 0x10;       // avec 8 : les quatre bouts de file ; seul : non établi
const SOL_EQUIPEMENT = 0x8000;       // le sol 103, celui des toilettes et de la fontaine
const SOLS_DE_L_ENTRETIEN = SOL_ALLEE | SOL_FILE | SOL_BOUT_DE_FILE;  // 0x1A : où marche l'agent
// Les sols où l'amuseur et le gardien ne regardent pas plus loin : ceux des drapeaux 1, 4, 0x40,
// 0x80, 0x100, 0x800, 0x1000 et 0x2000. D'après ce qui y est posé dans le parc de la démo : 1, les
// clôtures (tout le tour du parc) ; 4, le sol des attractions ; 0x80, celui du portique d'entrée ;
// 0x100, celui des boutiques ; 0x1000, la route, hors du parc ; 0x40, 0x800 et 0x2000, non établis.
// Restent ouverts l'herbe, les allées, les files, les voies des attractions à voie (0x400), les
// entrées d'attraction (0x4000) et les toilettes. C'est aussi le masque que l'amuseur passe à la
// recherche de chemin 0x349EB ; le mécanicien y passe 0x39C1, qui lui ouvre le sol des attractions.
const SOLS_INTERDITS = 0x39C5;
const SOLS_INTERDITS_AU_MECANICIEN = 0x39C1;

const PAS_DES_DIRECTIONS = 0xB4920;  // 4 mots : l'écart d'index de case par direction, −64, 1, 64, −1
const CASE_ET_VOISINES = 0xB4928;    // 5 mots : 0 (la case même), puis les quatre voisines
const AVANCEE = 0xB4932;             // 2 octets signés par direction : (dx, dy) = (0,−1) (1,0) (0,1) (−1,0)
const DIRECTION_OPPOSEE = 0xB48EC;   // 2 octets par direction, le premier : la direction opposée
const DIRECTION_DES_SORTIES = 0xB4970;  // 16 octets : un ensemble de sorties (bit n = direction n)
                                     // → une direction ; pour une sortie seule, la sienne
const SORTIES_D_UNE_ALLEE = 0xB4990; // octet par forme d'allée : ses sorties
const SORTIES_D_UNE_FILE = 0xB49D3;  // octet par forme de file (et de bout de file) : ses sorties

const METIERS = 0xD35C0, TAILLE_METIER = 0x36;  // le catalogue des métiers, décrit en tête

// Le catalogue des décors et équipements, 0xCCA98 + genre × 0x38 (nom à +0x10 : PALM TREE, LAMP
// POST…, 15 OUTHOUSE, 16 SUPER TOILET, 17 CENTRE FOUNTAIN) : le genre d'un objet de type 0x18 — les
// toilettes, et aussi la fontaine — est son mot +0x16 ; les trois se posent sur le sol 103 (octet +8
// de leur fiche). Octet +0xA : un seuil de saleté (50 pour OUTHOUSE, 20 pour SUPER TOILET, 25 pour la
// fontaine).
const EQUIPEMENTS = 0xCCA98, TAILLE_EQUIPEMENT = 0x38, SEUIL_DE_SALETE = 0xA;

// Le joueur et son parc. La fiche du parc du joueur j est en 0xD443C + j × 0x6C2 ([0xD3814] pointe
// celle du joueur en cours) : +0x41 octet, le numéro de la fiche [0xCF1E0 + n × 0x250] qui porte en
// +0 le seuil de contentement sous lequel un amuseur s'occupe d'un visiteur (200 dans la démo) ;
// +0x2CA mot, la case de l'entrée du parc (3872 dans la démo : colonne 32, rangée 60).
const JOUEUR = 0xD665C;              // mot : le joueur dont le parc est simulé (0 dans la démo)
const FICHES_DE_PARC = 0xD443C, TAILLE_FICHE_DE_PARC = 0x6C2;
const NUMERO_DE_SEUILS = 0x41, ENTREE_DU_PARC = 0x2CA;
const SEUILS = 0xCF1E0, TAILLE_SEUILS = 0x250;

const COMPTEUR_DE_MISES_A_JOUR = 0xD3AF8;  // long : augmenté par 0x21681 à chaque pas
const PAS_DE_SIMULATION = 0xD3AFC;         // long : le temps du jeu, 1 000 pas par mois
// La météo, vraisemblablement : le pas de simulation (0x12B1F) peut y poser 1, 2 ou 4 selon le mois
// et le hasard, pour 1 000 pas au plus, quatre fois au plus (compteur 0xB14D1) ; ce que sont ces
// trois temps, non établi. Nulle pendant les 200 premières secondes de la simulation, où ce tirage
// n'est jamais atteint.
const METEO = 0xB14CC;

// La fiche du parc du joueur en cours ([0xD3818]) : +0x80 mot, le nombre de déchets sur les allées
// (visiteurs.js). La table 0xBA820 donne, pour les trois bits de déchets d'une cellule, combien il
// y en a (0, 1, 1, 2, 1, 2, 2, 3).
const PARC_COURANT = 0xD3818;
const DECHETS_DU_PARC = 0x80;
const NOMBRE_DE_DECHETS = 0xBA820;
// La vue du parc (etat.js).
const CAMERA_COLONNE = 0xD667A, CAMERA_RANGEE = 0xD6666;  // mots signés
const LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;   // mots : 48 × 32 ou 24 × 16
const MODE_AFFICHAGE = 0xDE5F6;                           // bit 0 : 320x200
const REDESSINER_CARTE = 0xD666E;                         // mot

// --- les champs des objets -------------------------------------------------------------------------
const PRECEDENT = 0x0, SUIVANT = 0x2, TYPE = 0x4, DRAPEAUX = 0x5;
const X = 0x6, COLONNE = 0x7, Y = 0x8, POSITION_DANS_LA_CASE = 0x8, RANGEE = 0x9;
const GRAPHIQUE = 0xA, ETAT = 0xC, ETAT_SUIVANT = 0xD, DIRECTION = 0x12, VITESSE = 0x13;
const COMPTE = 0x14, LIEN = 0x16;
const PATIENCE = 0x20, PAS_DANS_LES_ALLEES = 0x28, TEMPS_DE_SERVICE = 0x34;
const CASE_DE_TRAVAIL = 0x4D, CIBLE_COLONNE = 0x56, CIBLE_RANGEE = 0x57, DIRECTION_GARDEE = 0x58;
const METIER = 0x59, VISITEURS_TOURNES = 0x5A, GRAPHIQUE_A_L_ARRIVEE = 0x5F, RETENUE = 0x8B;
const SALAIRE = 0x9A, TOURNEE = 0x9C, ETAPE = 0xAC;
const EN_ROUTE = 2;                  // drapeau de +5 : le mécanicien part réparer

const VISITEUR = 2, ENTREE_D_ATTRACTION = 6, EQUIPEMENT_ANIME = 0x18, VOYOU = 0x1A;
const AUTRE_ENTREE_D_ATTRACTION = 0x1C;

// Le visiteur, vu du personnel (les noms sont ceux de visiteurs-outils.js) :
//   +0x0C octet : l'état ; 8, il se promène ; 0x1A, il exprime une émotion
//   +0x54 mot signé : le contentement, comparé au seuil du parc ;
//   +0x82 mot signé : la fatigue ; le visiteur s'en va quand elle devient trop grande (0x22834) ;
//   +0x75 long : l'heure (en pas de simulation) de son dernier plaisir ; le temps écoulé depuis fait
//         son ennui, et il s'en va 4 000 pas après (0x22834) ;
//   +0x59 octet : le genre de visiteur, qui choisit ses images (0xB49F4, 0x24 octets par genre, le
//         mot +0 : la première figure de l'attente, plus la direction).
const CONTENTEMENT = 0x54, FATIGUE = 0x82, DERNIER_PLAISIR = 0x75, GENRE_DU_VISITEUR = 0x59;
const ANIMATIONS_DES_VISITEURS = 0xB49F4, TAILLE_ANIMATIONS_VISITEUR = 0x24;
// L'entrée d'attraction (types 6 et 0x1C) : +0x16 le numéro de l'attraction, +0x4D le mécanicien
// qu'on y a appelé (0 : aucun). L'attraction (type 4) : +0x2E l'usure ; +0x4B octet signé, −1
// pendant une réparation (0x33742 le pose, 0x33BF1 le rétablit).
const MECANICIEN_APPELE = 0x4D, USURE = 0x2E, OUVERTURE = 0x4B, FERMEE = -1;
const USURE_A_REPARER = 0x27;        // le mécanicien n'est appelé qu'au-delà de 39
// Les toilettes et la fontaine (type 0x18) : +0x3C, la saleté, qui déplaît aux visiteurs qui s'en
// servent (visiteurs-outils.js) ; 0x6369E, l'agent d'entretien qui entre, la remet à zéro.
const SALETE = 0x3C;

// --- les figures écrites en dur ----------------------------------------------------------------------
// Le mécanicien et l'agent d'entretien ont leurs images écrites dans le programme ; celles de la
// marche et de l'attente sont les mêmes que dans leurs fiches de métier (+0x26, +0x28).
const FIGURES_DU_MECANICIEN_EN_MARCHE = 0xBA;   // + direction
const FIGURE_DU_MECANICIEN_APPELE = 0xBE;
const FIGURE_DU_MECANICIEN_AU_REPOS = 0xC7;
const FIGURE_DU_MECANICIEN_AU_TRAVAIL = 0xCD;
const FIGURES_DE_L_AGENT_EN_MARCHE = 0xBF;      // + direction
const FIGURE_DE_L_AGENT_QUI_BALAIE = 0x12C;
// L'attente du mécanicien enchaîne des animations : une liste de figures terminée par 0 (0xC7 à
// 0xCC dans le programme). À la fin d'un cycle de l'une, il passe à la suivante ; la dernière
// tourne en boucle.
const ENCHAINEMENT_DU_MECANICIEN = 0xB8CA0;

// Les états.
const FLANER = 2, REJOINDRE = 4, AMUSER = 6;
const ATTENDRE_UNE_PANNE = 8, MARCHER_VERS_L_ATTRACTION = 0xA, REPARER = 0xC, APPELE = 0x12;
const HORS_DES_ALLEES = 0x1A, BALAYER = 0x1C;
const ENTRER_DANS_LES_TOILETTES = 0x26, SUIVRE_SA_TOURNEE = 0x30;
const PATROUILLER = 0x34, MARCHER_VERS_LA_CIBLE = 0x36, ESCORTER = 0x38;
const VOYOU_ESCORTE = 8;             // l'état du voyou arrêté ; 1 et 7 : non établis

// --- les fonctions appelées ----------------------------------------------------------------------
const HASARD = 0x18B92;              // () : 0 à 0x7FFF
const OBJET_DE_TYPE_SUR_LA_CASE = 0x204B9;  // (cellule, type) : le premier objet de ce type, ou 0
const DEPLACER = 0x18A44;            // (objet, x, y) : change de case si besoin
const RETIRER_DE_SA_CASE = 0x18918;  // (objet)
const POSER_SUR_LA_CASE = 0x185C1;   // (objet, x, y)
const CHERCHER_SON_CHEMIN = 0x349EB; // (objet, limite, sols interdits) : la direction à prendre
                                     // vers la case visée, 4 à l'arrivée, négatif en cas d'échec
const VALEUR_ABSOLUE = 0x80BF2;
const DIVISION_PAR_ZERO = 0x19ED3;   // vitesse nulle : rend 1, efface la demande de sortie
                                     // pour une vitesse nulle, ce qui n'arrive jamais
const EXPRIMER_SON_HUMEUR = 0x2789A; // (visiteur, forcer) : rend 1 si le visiteur s'arrête pour
                                     // exprimer son humeur (visiteurs-outils.js)
const DESIGNE_POUR_UNE_TOURNEE = 0x645AD;
// Celles de ce module, appelées elles aussi par jeu.appeler : chacune reste ainsi comparée à
// chaque appel, que l'appelant soit transcrit ou réécrit.
const CHERCHER_DES_VISITEURS = 0x32E81;
const DEPLACER_ET_RANGER = 0x1864A;
const ARRETER_UN_VOYOU = 0x3436C;
const DIRECTIONS_VOISINES = 0x62F72;
const BALAYER_S_IL_Y_A_DES_DECHETS = 0x6386F;

// --- outils --------------------------------------------------------------------------------------
const objetNumero = (jeu, n) => long(jeu, OBJETS_DU_PARC) + n * TAILLE_OBJET;
const numeroDeLObjet = (jeu, o) => ((o - long(jeu, OBJETS_DU_PARC)) / TAILLE_OBJET) | 0;
const cellule = (jeu, index) => long(jeu, GRILLE) + index * 4;
const indexDeLaCellule = (jeu, c) => (c - long(jeu, GRILLE)) >> 2;
const caseDeLObjet = (jeu, o) => (octet(jeu, o + RANGEE) << 6) + octet(jeu, o + COLONNE);
const drapeauxDuSol = (jeu, c) => mot(jeu, SOLS + octet(jeu, c + 2) * 4);
const pasVers = (jeu, direction) => motSigne(jeu, PAS_DES_DIRECTIONS + direction * 2);
const figure = (jeu, n) => mot(jeu, long(jeu, FIGURES) + n * 2);
const objetGraphique = (jeu, index) => long(jeu, OBJETS_GRAPHIQUES) + index * 8;
const bit = (n) => (1 << (n & 31)) & 0xFF;   // 'shl al, cl'

// L'image suivante de l'animation en cours.
function animer(jeu, o) {
  poserMot(jeu, o + GRAPHIQUE, mot(jeu, objetGraphique(jeu, mot(jeu, o + GRAPHIQUE)) + 6));
}

// La dernière image d'un cycle d'animation est-elle affichée ?
const finDeCycle = (jeu, o) => (octet(jeu, objetGraphique(jeu, mot(jeu, o + GRAPHIQUE)) + 5) & 1) !== 0;

const ficheDuMetier = (jeu, o) => METIERS + octet(jeu, o + METIER) * TAILLE_METIER;
const figureDeMarche = (jeu, o) => figure(jeu, mot(jeu, ficheDuMetier(jeu, o) + 0x26) + octet(jeu, o + DIRECTION));
const figureDAttente = (jeu, o) => figure(jeu, mot(jeu, ficheDuMetier(jeu, o) + 0x28) + octet(jeu, o + DIRECTION));
const figureDuTravail = (jeu, o) => figure(jeu, mot(jeu, ficheDuMetier(jeu, o) + 0x2A));

// Le temps de traverser une case : 256 divisé par la vitesse, soit 16 pas.
function delaiParCase(jeu, o) {
  recalerAuMilieuDeLaCase(jeu, o);   // hors du jeu d'origine : corrections.js, éteint par défaut
  const vitesse = octet(jeu, o + VITESSE);
  return vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : (256 / vitesse) | 0;
}

// Le compte à rebours diminue d'un pas ; rend la nouvelle valeur.
function decompter(jeu, o) {
  const compte = s16(mot(jeu, o + COMPTE) - 1);
  poserMot(jeu, o + COMPTE, compte);
  return compte;
}

// Un pas de marche dans la direction de l'employé, par `deplacer` (0x18A44 ou 0x1864A). Les
// coordonnées fines sont des mots : le programme ne garde que les 16 bits bas de la somme. Rend
// l'ordonnée visée, que l'original gardait dans sa variable [ebp-8] (voir « Le reste laissé sur la
// pile »).
function avancer(jeu, o, deplacer) {
  const direction = octet(jeu, o + DIRECTION) * 2;
  const vitesse = octet(jeu, o + VITESSE);
  const x = (mot(jeu, o + X) + octetSigne(jeu, AVANCEE + direction) * vitesse) & 0xFFFF;
  const y = (mot(jeu, o + Y) + octetSigne(jeu, AVANCEE + direction + 1) * vitesse) & 0xFFFF;
  jeu.appeler(deplacer, o, x, y);
  return y;
}

// Viser une case : sa colonne et sa rangée. L'index est signé (une case hors de la carte donne un
// index négatif) : reste et quotient sont ceux de idiv, tronqués vers zéro.
function viserLaCase(jeu, o, index) {
  poserOctet(jeu, o + CIBLE_COLONNE, index % 64);
  poserOctet(jeu, o + CIBLE_RANGEE, (index / 64) | 0);
}

function caseDeLEntreeDuParc(jeu) {
  return mot(jeu, FICHES_DE_PARC + mot(jeu, JOUEUR) * TAILLE_FICHE_DE_PARC + ENTREE_DU_PARC);
}

function seuilDeContentement(jeu) {
  const n = octet(jeu, FICHES_DE_PARC + mot(jeu, JOUEUR) * TAILLE_FICHE_DE_PARC + NUMERO_DE_SEUILS);
  return motSigne(jeu, SEUILS + n * TAILLE_SEUILS);
}

const intemperies = (jeu) => (octet(jeu, METEO) & 7) !== 0;

// Parcourt les objets posés sur une cellule, dans l'ordre de sa liste. La liste s'arrête sur 0 ou
// sur un décor : le programme compare l'adresse obtenue à celle de la table, sans signe.
function* objetsDeLaCellule(jeu, c) {
  const table = long(jeu, OBJETS_DU_PARC);
  for (let p = table + motSigne(jeu, c) * TAILLE_OBJET; p > table; p = table + motSigne(jeu, p + SUIVANT) * TAILLE_OBJET) {
    yield p;
  }
}

// --- Le reste laissé sur la pile ----------------------------------------------------------------------
//
// Les fonctions d'état sont toutes appelées par 0x21681, au même niveau de pile. L'une d'elles, celle
// des visiteurs au guichet d'entrée (0x223C1), lit dans une de ses phases sa variable locale [ebp-8]
// sans l'avoir écrite (voir visiteurs-outils.js) : elle y trouve ce qu'a laissé, au même endroit, la
// fonction d'état appelée juste avant — souvent celle d'un employé. Si E est le pointeur de pile à
// l'entrée (sur l'adresse de retour), cet endroit est E − 24, le [ebp-8] de chacune.
//
// Chaque fonction d'état de ce module y laisse donc, en rendant la main, ce qu'y laissait l'original :
// sans cela, le passage au guichet du visiteur suivant dure autrement, et la partie change. Une
// réécriture n'a pas de cadre de pile ; pire, les fonctions qu'elle appelle posent le leur à cet
// endroit : la valeur d'entrée est relevée d'abord, puis réécrite à la fin quand l'original n'y
// touchait pas. Le lecteur n'en prend que l'octet bas : quand l'original y laissait une valeur de 32
// bits dont la moitié haute venait de registres de passage, seule la moitié basse est reproduite.
const RESTE = 24;
function resteALEntree(jeu) {
  jeu.T.sauver();
  const adresse = ((jeu.T.R.esp >>> 0) - RESTE) >>> 0;
  return { adresse, valeur: long(jeu, adresse) };
}
const moitieBasse = (reste, v) => ((reste.valeur & 0xFFFF0000) | (v & 0xFFFF)) >>> 0;

// Une fonction d'état : `corps(jeu, o, reste)` fait le travail, et note dans reste.valeur ce que
// l'original laissait en [ebp-8] s'il y écrivait ; `laisseLeResultat` : l'original y rangeait son
// résultat, sur tous les chemins.
function fonctionDEtat(corps, laisseLeResultat = false) {
  return (jeu, o) => {
    const reste = resteALEntree(jeu);
    const resultat = corps(jeu, o, reste);
    poserLong(jeu, reste.adresse, laisseLeResultat ? resultat : reste.valeur);
    return resultat;
  };
}

// === Les amuseurs costumés ===========================================================================
//
// Un amuseur flâne (état 2) en regardant devant lui ; quand il voit des visiteurs, il les rejoint
// (état 4) ; arrivé près d'un visiteur mécontent, il l'amuse (état 6) et fait monter son contentement,
// tous les 16 pas, tant qu'il en reste sur la case ; puis il se remet à flâner.

// Regarder devant soi, sur 1 à 5 cases tirées au hasard, tant que le sol ne l'arrête pas : rend la
// cellule de la première case où se trouve un objet du type cherché, ou 0. Une case hors de la carte
// n'arrête pas le regard : 0x204B9 n'y trouve rien, et le sol y est lu en mémoire comme ailleurs.
function regarderDevant(jeu, o, type) {
  let c = cellule(jeu, caseDeLObjet(jeu, o) + pasVers(jeu, octet(jeu, o + DIRECTION)));
  for (let reste = ((jeu.appeler(HASARD) & 0xFFFF) % 5) + 1; reste !== 0; reste--) {
    if (drapeauxDuSol(jeu, c) & SOLS_INTERDITS) return 0;
    if (jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, c, type) !== 0) return c;
    c += pasVers(jeu, octet(jeu, o + DIRECTION)) * 4;
  }
  return 0;
}

// De temps en temps, se tourner d'un quart de tour, à gauche ou à droite au hasard : quand le compte
// à rebours est un multiple du quart de la patience. Le compte est lu signé puis divisé sans signe ;
// une patience inférieure à 4 serait une division par zéro, ce qui n'arrive pas (voir flaner).
function tournerDeTempsEnTemps(jeu, o) {
  if (resteNonSigne(motSigne(jeu, o + COMPTE) >>> 0, long(jeu, o + PATIENCE) >>> 2) !== 0) return;
  const direction = octet(jeu, o + DIRECTION) + ((jeu.appeler(HASARD) & 1) ? 1 : -1);
  poserOctet(jeu, o + DIRECTION, direction & 3);
  poserMot(jeu, o + GRAPHIQUE, figureDAttente(jeu, o));
}

// 0x326DA — l'amuseur flâne (état 2).
//
// Il reste sur place, l'animation avançant tous les 6 pas, et se tourne de temps en temps. Chaque
// pas, il cherche autour de lui des visiteurs à amuser (0x32E81) ; s'il en trouve un mécontent, il
// se met à l'amuser, sinon il se tourne vers le dernier qu'il a vu.
//
// Quand son compte à rebours tombe à zéro, il regarde devant lui : s'il voit des visiteurs, il les
// rejoint (état 4). Sinon il perd patience : la patience (400 au départ) est divisée par deux et
// devient le nouveau compte à rebours ; quand elle tombe à 25 ou moins, il retourne vers l'entrée
// du parc, à une case tirée au hasard de 5 colonnes au plus de part et d'autre (−4 à +5) et
// jusqu'à 4 rangées au-dessus. L'original laisse son résultat sur la pile.
export const flaner = fonctionDEtat((jeu, o) => {
  if (resteNonSigne(long(jeu, COMPTEUR_DE_MISES_A_JOUR), 6) === 0) animer(jeu, o);
  if (decompter(jeu, o) <= 0) {
    poserMot(jeu, o + COMPTE, 0);
    const c = regarderDevant(jeu, o, VISITEUR);
    if (c !== 0) {
      viserLaCase(jeu, o, indexDeLaCellule(jeu, c));
      poserOctet(jeu, o + ETAT, REJOINDRE);
      poserMot(jeu, o + COMPTE, 0);
      poserMot(jeu, o + GRAPHIQUE, figureDeMarche(jeu, o));
      return 1;
    }
    const patience = long(jeu, o + PATIENCE) >>> 1;
    poserLong(jeu, o + PATIENCE, patience);
    if (patience <= 25) {
      const entree = caseDeLEntreeDuParc(jeu);
      const ecartColonne = ((jeu.appeler(HASARD) & 0xFFFF) % 10) - 5;
      poserOctet(jeu, o + CIBLE_COLONNE, (entree % 64) - ecartColonne);
      const ecartRangee = (jeu.appeler(HASARD) & 0xFFFF) % 5;
      poserOctet(jeu, o + CIBLE_RANGEE, (entree >> 6) - ecartRangee);
      poserOctet(jeu, o + ETAT, REJOINDRE);
      poserMot(jeu, o + COMPTE, 0);
      poserMot(jeu, o + GRAPHIQUE, figureDeMarche(jeu, o));
      return 1;
    }
    poserMot(jeu, o + COMPTE, patience);
  }
  tournerDeTempsEnTemps(jeu, o);
  const trouve = s16(jeu.appeler(CHERCHER_DES_VISITEURS, o));
  if (trouve === 4) return 1;
  if (trouve >= 0) {
    poserOctet(jeu, o + DIRECTION, trouve);
    poserMot(jeu, o + GRAPHIQUE, figureDAttente(jeu, o));
  }
  return 0;
}, true);

// 0x32A06 — l'amuseur rejoint la case visée (état 4).
//
// Il avance d'un 16e de case par pas ; à chaque case (le compte à rebours épuisé), il cherche des
// visiteurs à amuser autour de lui, puis demande la direction suivante à 0x349EB. Arrivé, ou
// perdu, il se remet à flâner avec une patience neuve de 400.
//
// Anomalie, reproduite : quand 0x32E81 a vu des visiteurs sans en trouver de mécontent (elle rend
// une direction), l'amuseur s'arrête là, le compte à rebours épuisé, et recommence à chaque pas tant
// que ces visiteurs sont autour de lui.
//
// L'original laisse sur la pile l'ordonnée visée, quand il fait un pas.
export const rejoindre = fonctionDEtat((jeu, o, reste) => {
  if (motSigne(jeu, o + COMPTE) > 0) {
    if ((octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 3) === 0) animer(jeu, o);
    reste.valeur = moitieBasse(reste, avancer(jeu, o, DEPLACER));
  }
  if (decompter(jeu, o) > 0) return 0;
  if (s16(jeu.appeler(CHERCHER_DES_VISITEURS, o)) !== -1) return 1;
  const direction = s16(jeu.appeler(CHERCHER_SON_CHEMIN, o, 0x32, SOLS_INTERDITS));
  if (direction < 0 || direction === 4) {
    poserOctet(jeu, o + ETAT, FLANER);
    poserMot(jeu, o + GRAPHIQUE, figureDAttente(jeu, o));
    poserLong(jeu, o + PATIENCE, 400);
    poserMot(jeu, o + COMPTE, 400);
    return 1;
  }
  poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
  poserOctet(jeu, o + DIRECTION, direction);
  poserMot(jeu, o + GRAPHIQUE, figureDeMarche(jeu, o));
  return 0;
});

// 0x32E81 — chercher des visiteurs à amuser, sur la case de l'amuseur et les quatre voisines.
//
// Sont retenus les visiteurs qui se promènent (état 8) — le programme accepte aussi n'importe quel
// visiteur quand l'employé est dans l'état 0xA ou 0xC, ceux du mécanicien, ce qui n'arrive pas par ses
// deux appelants —, et seulement si l'octet +0x8B de l'amuseur est négatif ou nul (non établi). Le premier
// dont le contentement est au plus le seuil du parc — ou n'importe lequel par intempéries — est
// amusé sur-le-champ : l'amuseur passe dans l'état 6, sa case de travail est celle du visiteur, et
// la fonction rend 4. Sinon elle rend la direction du dernier visiteur retenu (0 à 3 pour les
// voisines ; 2 pour la case même, sans raison apparente), ou −1 s'il n'y en a aucun.
export function chercherDesVisiteurs(jeu, o) {
  let resultat = -1;
  const ici = cellule(jeu, caseDeLObjet(jeu, o));
  for (let k = 0; k < 5; k++) {
    const c = ici + motSigne(jeu, CASE_ET_VOISINES + k * 2) * 4;
    for (const p of objetsDeLaCellule(jeu, c)) {
      if (octet(jeu, p + TYPE) !== VISITEUR) continue;
      const etat = octet(jeu, o + ETAT);
      if (!(octet(jeu, p + ETAT) === 8 || etat === MARCHER_VERS_L_ATTRACTION || etat === REPARER)) continue;
      if (octetSigne(jeu, o + RETENUE) > 0) continue;
      if (motSigne(jeu, p + CONTENTEMENT) <= seuilDeContentement(jeu) || intemperies(jeu)) {
        poserOctet(jeu, o + ETAT, AMUSER);
        poserMot(jeu, o + GRAPHIQUE, figureDuTravail(jeu, o));
        poserMot(jeu, o + CASE_DE_TRAVAIL, indexDeLaCellule(jeu, c));
        poserMot(jeu, o + COMPTE, 0);
        return 4;
      }
      resultat = k === 0 ? 2 : k - 1;
    }
  }
  return resultat;
}

// 0x32BCF — l'amuseur amuse les visiteurs de sa case de travail (état 6).
//
// Tous les 16 pas, il prend le premier visiteur de la case dont le contentement est au plus le
// seuil du parc. Sauf s'il exprime déjà une émotion (état 0x1A), le visiteur est invité à exprimer
// son humeur (0x2789A, forcé : il passe alors dans l'état 0x3C) ; s'il le fait, il se tourne vers
// l'amuseur. Dans tous les cas, il gagne (effet / 2) + 16 de contentement, perd (effet / 8) + 8 de
// fatigue, et l'heure de son dernier plaisir avance d'effet + 32 pas, sans dépasser le présent —
// l'effet est le salaire de l'amuseur (+0x9A ; à l'embauche, de 37 pour TEDDY MAN à 372 pour RHINO
// MAN). Quand il n'y a plus de visiteur mécontent sur la case, l'amuseur se remet à flâner, tourné
// vers le bas, avec une patience de 400.
//
// Par intempéries, les visiteurs de la case reçoivent en plus le bit 0x80 de leur octet +5 (sens
// non établi), qu'ils soient contents ou non.
//
// L'original laisse sur la pile, quand il parcourt la case, l'adresse du dernier objet examiné : le
// visiteur amusé, ou ce qui a clos la liste (la table elle-même pour 0, en deçà pour un décor).
export const amuser = fonctionDEtat((jeu, o, reste) => {
  poserMot(jeu, o + TEMPS_DE_SERVICE, mot(jeu, o + TEMPS_DE_SERVICE) + 1);
  if ((octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 3) === 0) animer(jeu, o);
  if (decompter(jeu, o) > 0) return 0;
  const table = long(jeu, OBJETS_DU_PARC);
  let p = table + motSigne(jeu, cellule(jeu, mot(jeu, o + CASE_DE_TRAVAIL))) * TAILLE_OBJET;
  for (; p > table; p = table + motSigne(jeu, p + SUIVANT) * TAILLE_OBJET) {
    reste.valeur = p;
    if (octet(jeu, p + TYPE) !== VISITEUR) continue;
    if (motSigne(jeu, p + CONTENTEMENT) > seuilDeContentement(jeu)) {
      if (intemperies(jeu)) poserOctet(jeu, p + DRAPEAUX, octet(jeu, p + DRAPEAUX) | 0x80);
      continue;
    }
    if (octet(jeu, p + ETAT) !== 0x1A && (jeu.appeler(EXPRIMER_SON_HUMEUR, p, 1) & 0xFFFF) !== 0) {
      tournerLeVisiteurVers(jeu, p, o);
    }
    const effet = mot(jeu, o + SALAIRE);
    poserMot(jeu, p + CONTENTEMENT, motSigne(jeu, p + CONTENTEMENT) + (effet >> 1) + 0x10);
    poserMot(jeu, p + FATIGUE, motSigne(jeu, p + FATIGUE) - ((effet >> 3) + 8));
    let date = (long(jeu, p + DERNIER_PLAISIR) + effet + 0x20) >>> 0;
    poserLong(jeu, p + DERNIER_PLAISIR, date);
    if (date > long(jeu, PAS_DE_SIMULATION)) poserLong(jeu, p + DERNIER_PLAISIR, long(jeu, PAS_DE_SIMULATION));
    poserMot(jeu, o + COMPTE, 0x10);
    if (intemperies(jeu)) poserOctet(jeu, p + DRAPEAUX, octet(jeu, p + DRAPEAUX) | 0x80);
    return 0;
  }
  reste.valeur = p >>> 0;
  poserOctet(jeu, o + ETAT, FLANER);
  poserOctet(jeu, o + DIRECTION, 2);
  poserMot(jeu, o + GRAPHIQUE, figureDAttente(jeu, o));
  poserLong(jeu, o + PATIENCE, 400);
  poserMot(jeu, o + COMPTE, 400);
  return 1;
});

// Le visiteur se tourne vers l'amuseur : d'abord selon les rangées, puis, si les colonnes diffèrent,
// selon les colonnes, qui l'emportent ; dans ce dernier cas seulement, l'amuseur compte un visiteur
// de plus en +0x5A.
function tournerLeVisiteurVers(jeu, p, o) {
  if (octet(jeu, o + RANGEE) < octet(jeu, p + RANGEE)) poserOctet(jeu, p + DIRECTION, 0);
  else if (octet(jeu, o + RANGEE) > octet(jeu, p + RANGEE)) poserOctet(jeu, p + DIRECTION, 2);
  if (octet(jeu, o + COLONNE) !== octet(jeu, p + COLONNE)) {
    if (octet(jeu, o + COLONNE) < octet(jeu, p + COLONNE)) poserOctet(jeu, p + DIRECTION, 3);
    else poserOctet(jeu, p + DIRECTION, 1);
    poserOctet(jeu, o + VISITEURS_TOURNES, octet(jeu, o + VISITEURS_TOURNES) + 1);
  }
  const animations = ANIMATIONS_DES_VISITEURS + octet(jeu, p + GENRE_DU_VISITEUR) * TAILLE_ANIMATIONS_VISITEUR;
  poserMot(jeu, p + GRAPHIQUE, figure(jeu, mot(jeu, animations) + octet(jeu, p + DIRECTION)));
}

// === Le mécanicien =================================================================================
//
// Il attend (état 8) qu'une attraction s'use ; tous les 200 pas, il cherche la plus proche dont
// l'usure dépasse 39 et où l'on n'a encore appelé personne, s'y inscrit, joue l'animation de
// l'appel (état 0x12), puis marche jusqu'à son entrée (état 0xA) pour la réparer (état 0xC).

// 0x33133 — le mécanicien attend une attraction à réparer (état 8).
//
// La distance est comptée en cases, colonnes et rangées additionnées, et comparée sur 16 bits ; à
// égalité, la première entrée de la table l'emporte. Le programme vérifie encore qu'aucun mécanicien
// en route vers cette entrée n'est inscrit à son mot +0x4D ; comme ce mot vient d'être trouvé nul, la
// vérification ne peut jamais écarter l'entrée : elle n'est pas transcrite.
//
// L'original laisse son résultat sur la pile.
export const attendreUnePanne = fonctionDEtat((jeu, o) => {
  poserMot(jeu, o + TEMPS_DE_SERVICE, mot(jeu, o + TEMPS_DE_SERVICE) + 1);
  if ((octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 3) === 0) animer(jeu, o);
  if (finDeCycle(jeu, o)) enchainerLAttente(jeu, o);
  const compte = motSigne(jeu, o + COMPTE);
  poserMot(jeu, o + COMPTE, compte - 1);
  if (compte > 0) return 0;

  poserMot(jeu, o + COMPTE, 200);
  let choisie = 0, plusCourte = 9999;
  const fin = long(jeu, FIN_DES_OBJETS_DU_PARC);
  for (let e = objetNumero(jeu, 1); e < fin; e += TAILLE_OBJET) {
    const type = octet(jeu, e + TYPE);
    if (type !== ENTREE_D_ATTRACTION && type !== AUTRE_ENTREE_D_ATTRACTION) continue;
    const attraction = objetNumero(jeu, mot(jeu, e + LIEN));
    if (mot(jeu, attraction + USURE) <= USURE_A_REPARER) continue;
    if (mot(jeu, e + MECANICIEN_APPELE) !== 0) continue;
    if (octetSigne(jeu, attraction + OUVERTURE) === FERMEE) continue;
    const distance = (jeu.appeler(VALEUR_ABSOLUE, octet(jeu, o + COLONNE) - octet(jeu, attraction + COLONNE))
      + jeu.appeler(VALEUR_ABSOLUE, octet(jeu, o + RANGEE) - octet(jeu, attraction + RANGEE))) | 0;
    if ((distance & 0xFFFF) >= (plusCourte & 0xFFFF)) continue;
    plusCourte = distance;
    choisie = e;
  }
  if (choisie === 0) return 0;
  poserMot(jeu, choisie + MECANICIEN_APPELE, numeroDeLObjet(jeu, o));
  poserMot(jeu, o + LIEN, numeroDeLObjet(jeu, choisie));
  poserOctet(jeu, o + ETAT, APPELE);
  poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURE_DU_MECANICIEN_APPELE));
  poserOctet(jeu, o + DRAPEAUX, octet(jeu, o + DRAPEAUX) | EN_ROUTE);
  return 1;
}, true);

// À la fin d'un cycle, l'animation d'attente en cours laisse la place à la suivante de la liste.
function enchainerLAttente(jeu, o) {
  for (let k = 0; mot(jeu, ENCHAINEMENT_DU_MECANICIEN + k * 2) !== 0; k++) {
    if (mot(jeu, o + GRAPHIQUE) !== figure(jeu, mot(jeu, ENCHAINEMENT_DU_MECANICIEN + k * 2))) continue;
    const suivante = mot(jeu, ENCHAINEMENT_DU_MECANICIEN + k * 2 + 2);
    if (suivante !== 0) poserMot(jeu, o + GRAPHIQUE, figure(jeu, suivante));
    return;
  }
}

// 0x333CB — le mécanicien vient d'être appelé (état 0x12) : à la fin de l'animation de l'appel,
// il part vers l'entrée de l'attraction, pour y prendre l'état 0xC (réparer) et l'image du travail.
// L'animation avance tous les 4 pas, et la fin du cycle n'est regardée qu'à ces pas-là. L'original
// laisse alors sur la pile l'adresse de l'objet graphique.
export const repondreALAppel = fonctionDEtat((jeu, o, reste) => {
  if ((octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 3) !== 0) return;
  animer(jeu, o);
  reste.valeur = objetGraphique(jeu, mot(jeu, o + GRAPHIQUE));
  if (!finDeCycle(jeu, o)) return;
  const entree = objetNumero(jeu, mot(jeu, o + LIEN));
  poserOctet(jeu, o + CIBLE_COLONNE, octet(jeu, entree + COLONNE));
  poserOctet(jeu, o + CIBLE_RANGEE, octet(jeu, entree + RANGEE));
  poserMot(jeu, o + COMPTE, 0);
  poserOctet(jeu, o + ETAT, MARCHER_VERS_L_ATTRACTION);
  poserOctet(jeu, o + ETAT_SUIVANT, REPARER);
  poserMot(jeu, o + GRAPHIQUE_A_L_ARRIVEE, figure(jeu, FIGURE_DU_MECANICIEN_AU_TRAVAIL));
  poserLong(jeu, o + PATIENCE, 0);
});

// 0x33482 — le mécanicien marche vers la case visée (état 0xA).
//
// Comme l'amuseur, un 16e de case par pas, mais par 0x1864A, qui range en plus les objets de la
// case par profondeur, et par une recherche de chemin plus longue (150) qui lui ouvre davantage de
// sols. Arrivé, il prend l'état et l'image prévus (+0xD, +0x5F) ; s'il vient réparer, il garde en
// +0x58 l'octet +0x4B de l'attraction, que 0x33742 va mettre à −1 et que 0x33BF1 rétablira.
//
// Il renonce, et se remet à attendre, s'il ne trouve pas de chemin — il se désinscrit alors de
// l'entrée s'il y est encore inscrit — ou si, parti réparer, il trouve l'attraction déjà fermée
// pour réparation.
//
// L'original laisse sur la pile l'ordonnée visée, quand il fait un pas.
export const marcherVersLAttraction = fonctionDEtat((jeu, o, reste) => {
  if (motSigne(jeu, o + COMPTE) > 0) {
    if ((octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 3) === 0) animer(jeu, o);
    reste.valeur = moitieBasse(reste, avancer(jeu, o, DEPLACER_ET_RANGER));
  }
  if (decompter(jeu, o) > 0) return 0;
  poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
  const direction = s16(jeu.appeler(CHERCHER_SON_CHEMIN, o, 0x96, SOLS_INTERDITS_AU_MECANICIEN));
  if (direction < 0) {
    if (octet(jeu, o + ETAT_SUIVANT) === REPARER) {
      const entree = objetNumero(jeu, mot(jeu, o + LIEN));
      if ((numeroDeLObjet(jeu, o) & 0xFFFF) === mot(jeu, entree + MECANICIEN_APPELE)) {
        poserMot(jeu, entree + MECANICIEN_APPELE, 0);
      }
    }
    seRemettreAAttendre(jeu, o);
    return 1;
  }
  if (direction < 4) {
    const attraction = objetNumero(jeu, mot(jeu, objetNumero(jeu, mot(jeu, o + LIEN)) + LIEN));
    if (octetSigne(jeu, attraction + OUVERTURE) === FERMEE && (octet(jeu, o + DRAPEAUX) & EN_ROUTE)) {
      seRemettreAAttendre(jeu, o);
      return 1;
    }
    poserOctet(jeu, o + DIRECTION, direction);
    poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DU_MECANICIEN_EN_MARCHE + direction));
    return 0;
  }
  poserOctet(jeu, o + ETAT, octet(jeu, o + ETAT_SUIVANT));
  poserMot(jeu, o + GRAPHIQUE, mot(jeu, o + GRAPHIQUE_A_L_ARRIVEE));
  const entree = objetNumero(jeu, mot(jeu, o + LIEN));
  if (octet(jeu, o + ETAT) === REPARER) {
    const attraction = objetNumero(jeu, mot(jeu, entree + LIEN));
    if (octetSigne(jeu, attraction + OUVERTURE) !== FERMEE) {
      poserOctet(jeu, o + DIRECTION_GARDEE, octet(jeu, attraction + OUVERTURE));
    }
  }
  return 1;
});

function seRemettreAAttendre(jeu, o) {
  poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURE_DU_MECANICIEN_AU_REPOS));
  poserOctet(jeu, o + ETAT, ATTENDRE_UNE_PANNE);
  poserMot(jeu, o + COMPTE, 0);
}

// 0x1864A — déplacer un objet à la position fine (x, y), puis ranger les objets de sa case par
// profondeur.
//
// Comme 0x18A44 : hors de la carte (colonne ou rangée au-delà de 63), rien ne bouge et la fonction
// rend 0 ; si l'objet change de case, il est retiré de l'ancienne (0x18918) et posé sur la nouvelle
// (0x185C1), et la fonction rend 1. Puis la liste de la case, doublement chaînée (+0 précédent, +2
// suivant), est triée par ordre croissant de la position fine dans la case, l'octet +8 : les objets
// du fond d'abord, ceux de devant ensuite, puisque le dessin suit l'ordre de la liste. C'est un tri à
// bulles, repris tant qu'un échange a eu lieu ; un objet qui recule suit la liste en comparant avec
// son nouveau suivant. Employée par le mécanicien seul (0x33482, 0x33742, 0x33F14).
export function deplacerEtRanger(jeu, o, x, y) {
  const colonne = (x >>> 8) & 0xFF, rangee = (y >>> 8) & 0xFF;
  if (colonne >= 0x40 || rangee >= 0x40) return 0;
  let changeDeCase = 0;
  if (colonne !== octet(jeu, o + COLONNE) || rangee !== octet(jeu, o + RANGEE)) {
    jeu.appeler(RETIRER_DE_SA_CASE, o);
    jeu.appeler(POSER_SUR_LA_CASE, o, x & 0xFFFF, y & 0xFFFF);
    poserMot(jeu, o + X, x);
    poserMot(jeu, o + Y, y);
    changeDeCase = 1;
  }
  poserMot(jeu, o + X, x);
  poserMot(jeu, o + Y, y);

  const tete = cellule(jeu, (rangee << 6) + colonne);
  const table = long(jeu, OBJETS_DU_PARC);
  let echange;
  do {
    echange = false;
    let a = table + motSigne(jeu, tete) * TAILLE_OBJET;
    while (motSigne(jeu, a + SUIVANT) > 0) {
      const b = table + motSigne(jeu, a + SUIVANT) * TAILLE_OBJET;
      if (octet(jeu, a + POSITION_DANS_LA_CASE) <= octet(jeu, b + POSITION_DANS_LA_CASE)) {
        a = b;
        continue;
      }
      // a passe derrière b : b prend sa place auprès du précédent (ou en tête de la case), a se glisse
      // entre b et l'ancien suivant de b.
      poserMot(jeu, b + PRECEDENT, mot(jeu, a + PRECEDENT));
      const avant = table + motSigne(jeu, b + PRECEDENT) * TAILLE_OBJET;
      if (avant > table) poserMot(jeu, avant + SUIVANT, mot(jeu, a + SUIVANT));
      else poserMot(jeu, tete, mot(jeu, a + SUIVANT));
      poserMot(jeu, a + PRECEDENT, mot(jeu, a + SUIVANT));
      poserMot(jeu, a + SUIVANT, mot(jeu, b + SUIVANT));
      const apres = table + motSigne(jeu, a + SUIVANT) * TAILLE_OBJET;
      if (apres > table) poserMot(jeu, apres + PRECEDENT, numeroDeLObjet(jeu, a));
      poserMot(jeu, b + SUIVANT, numeroDeLObjet(jeu, a));
      echange = true;
    }
  } while (echange);
  return changeDeCase;
}

// === Le gardien ====================================================================================
//
// Il patrouille comme flâne l'amuseur, mais à la recherche des voyous (objets de type 0x1A) : il
// marche vers ceux qu'il voit devant lui, arrête ceux qui sont sur sa case ou à côté, et les escorte
// jusqu'à l'entrée du parc.

// 0x34149 — le gardien patrouille (état 0x34).
//
// Comme 0x326DA, avec trois différences : il cherche des voyous ; quand il en voit un, il marche vers
// sa case (état 0x36) pour reprendre ensuite sa patrouille (+0xD = 0x34) ; et il ne perd jamais
// patience : sans rien voir, il repart pour un compte à rebours égal à sa patience. Chaque pas, il
// arrête les voyous de sa case et des quatre voisines (0x3436C). L'original laisse son résultat sur
// la pile.
export const patrouiller = fonctionDEtat((jeu, o) => {
  if (resteNonSigne(long(jeu, COMPTEUR_DE_MISES_A_JOUR), 6) === 0) animer(jeu, o);
  if (decompter(jeu, o) <= 0) {
    poserMot(jeu, o + COMPTE, 0);
    const c = regarderDevant(jeu, o, VOYOU);
    if (c !== 0) {
      viserLaCase(jeu, o, indexDeLaCellule(jeu, c));
      poserOctet(jeu, o + ETAT, MARCHER_VERS_LA_CIBLE);
      poserOctet(jeu, o + ETAT_SUIVANT, PATROUILLER);
      poserMot(jeu, o + COMPTE, 0);
      poserMot(jeu, o + GRAPHIQUE, figureDeMarche(jeu, o));
      return 1;
    }
    poserMot(jeu, o + COMPTE, long(jeu, o + PATIENCE));
  }
  tournerDeTempsEnTemps(jeu, o);
  return (jeu.appeler(ARRETER_UN_VOYOU, o) & 0xFFFF) !== 0 ? 1 : 0;
}, true);

// 0x3436C — arrêter un voyou, sur la case du gardien ou l'une des quatre voisines.
//
// Le premier voyou trouvé qui n'est pas dans l'état 1, 7 ou 8 (8 : déjà arrêté) et dont le bit 2 de
// l'octet +5 est posé (sens non établi) est arrêté : il passe dans l'état 8 et note son gardien
// (+0x61) ; le gardien le prend en tête de la chaîne de ses voyous (+0x1E, chacun renvoyant au
// précédent), note sa case de départ s'il n'en a pas (+0x4D), et part vers l'entrée du parc pour
// les y escorter (état 0x36, puis 0x38).
export function arreterUnVoyou(jeu, o) {
  const ici = cellule(jeu, caseDeLObjet(jeu, o));
  for (let k = 0; k < 5; k++) {
    for (const p of objetsDeLaCellule(jeu, ici + motSigne(jeu, CASE_ET_VOISINES + k * 2) * 4)) {
      if (octet(jeu, p + TYPE) !== VOYOU) continue;
      const etat = octet(jeu, p + ETAT);
      if (etat === 7 || etat === 1 || etat === VOYOU_ESCORTE) continue;
      if ((octet(jeu, p + DRAPEAUX) & 2) === 0) continue;
      const entree = caseDeLEntreeDuParc(jeu);
      poserOctet(jeu, o + CIBLE_COLONNE, entree % 64);
      poserOctet(jeu, o + CIBLE_RANGEE, entree >> 6);
      poserOctet(jeu, o + ETAT, MARCHER_VERS_LA_CIBLE);
      poserOctet(jeu, o + ETAT_SUIVANT, ESCORTER);
      poserMot(jeu, o + COMPTE, 0);
      poserMot(jeu, o + GRAPHIQUE, figureDeMarche(jeu, o));
      poserMot(jeu, p + 0x1E, mot(jeu, o + 0x1E));
      poserOctet(jeu, p + ETAT, VOYOU_ESCORTE);
      poserMot(jeu, p + 0x61, numeroDeLObjet(jeu, o));
      poserMot(jeu, o + 0x1E, numeroDeLObjet(jeu, p));
      if (mot(jeu, o + CASE_DE_TRAVAIL) === 0) poserMot(jeu, o + CASE_DE_TRAVAIL, caseDeLObjet(jeu, o));
      return 1;
    }
  }
  return 0;
}

// === L'agent d'entretien ===========================================================================
//
// Il parcourt les allées (état 0x18), une case à la fois. À chaque case, il regarde d'abord si des
// toilettes voisines sont à nettoyer, puis choisit la case suivante, et balaie s'il est sur des
// déchets.

// 0x62FEA — l'agent d'entretien parcourt les allées (état 0x18).
//
// Au bout de chaque case (le compte à rebours épuisé) :
//   - si le joueur l'a désigné (bit 2 de +5), 0x645AD : non exercé, non établi ;
//   - si on lui a tracé une tournée (+0x9C), il la suit (état 0x30), à partir de sa première case ;
//   - s'il y a, sur une case voisine au sol 103, des toilettes ou une fontaine (type 0x18) dans l'état
//     2 dont la saleté dépasse la moitié du seuil de leur genre (plus de 25 pour OUTHOUSE, de 10 pour
//     SUPER TOILET, de 12 pour la fontaine), il s'y tourne et va les nettoyer (état 0x26), en gardant
//     son état et sa direction pour après ;
//   - hors des allées et des files, il passe dans l'état 0x1A ;
//   - sinon il choisit la sortie suivante (voir choisirUneSortie), puis balaie s'il y a des déchets
//     sur sa case (0x6386F).
//
// L'original laisse sur la pile, dans l'octet bas, la sortie retenue pour ses déchets (0xFF si
// aucune), quand il a eu à choisir entre plusieurs.
export const parcourirLesAllees = fonctionDEtat((jeu, o, reste) => {
  poserMot(jeu, o + PAS_DANS_LES_ALLEES, mot(jeu, o + PAS_DANS_LES_ALLEES) + 1);
  if ((octet(jeu, COMPTEUR_DE_MISES_A_JOUR) & 3) === 0) animer(jeu, o);
  if (motSigne(jeu, o + COMPTE) > 0) avancer(jeu, o, DEPLACER);
  if (decompter(jeu, o) > 0) return 0;

  if (octet(jeu, o + DRAPEAUX) & 2) {
    jeu.appeler(DESIGNE_POUR_UNE_TOURNEE, o);
    poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
    return 1;
  }
  if (mot(jeu, o + TOURNEE) !== 0xFFFF) {
    poserOctet(jeu, o + ETAT, SUIVRE_SA_TOURNEE);
    poserOctet(jeu, o + ETAPE, 0);
    const etape = mot(jeu, o + TOURNEE + octet(jeu, o + ETAPE) * 2);
    poserOctet(jeu, o + CIBLE_COLONNE, etape % 64);
    poserOctet(jeu, o + CIBLE_RANGEE, etape >> 6);
    poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
    return 1;
  }

  const directionDeDepart = octet(jeu, o + DIRECTION);
  poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
  const index = caseDeLObjet(jeu, o) & 0xFFFF;
  const ici = cellule(jeu, index);
  for (let d = 0; d < 4; d++) {
    const voisine = ici + pasVers(jeu, d) * 4;
    if ((drapeauxDuSol(jeu, voisine) & SOL_EQUIPEMENT) === 0) continue;
    const toilettes = jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, voisine, EQUIPEMENT_ANIME) >>> 0;
    if (toilettes <= long(jeu, OBJETS_DU_PARC)) continue;
    if (octet(jeu, toilettes + ETAT) !== 2) continue;
    const seuil = octet(jeu, EQUIPEMENTS + mot(jeu, toilettes + LIEN) * TAILLE_EQUIPEMENT + SEUIL_DE_SALETE) >> 1;
    if (mot(jeu, toilettes + SALETE) <= seuil) continue;
    poserMot(jeu, o + COMPTE, delaiParCase(jeu, o));
    poserOctet(jeu, o + CIBLE_COLONNE, octet(jeu, o + COLONNE));
    poserOctet(jeu, o + CIBLE_RANGEE, octet(jeu, o + RANGEE));
    poserOctet(jeu, o + ETAT_SUIVANT, octet(jeu, o + ETAT));
    poserOctet(jeu, o + DIRECTION_GARDEE, octet(jeu, o + DIRECTION));
    if (d !== directionDeDepart) {
      poserOctet(jeu, o + DIRECTION, d);
      poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DE_L_AGENT_EN_MARCHE + d));
    }
    poserLong(jeu, o + PATIENCE, 0);
    poserOctet(jeu, o + ETAT, ENTRER_DANS_LES_TOILETTES);
    return 1;
  }

  const sol = drapeauxDuSol(jeu, ici);
  if ((sol & SOLS_DE_L_ENTRETIEN) === 0) {
    poserOctet(jeu, o + ETAT, HORS_DES_ALLEES);
    return 0;
  }
  const sorties = sortiesDeLaCase(jeu, o, ici, index, sol);
  if (sorties === 0) {
    poserOctet(jeu, o + ETAT, HORS_DES_ALLEES);
  } else {
    const retenue = choisirUneSortie(jeu, o, index, sorties);
    if (retenue !== null) reste.valeur = ((reste.valeur & 0xFFFFFF00) | retenue) >>> 0;
    poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DE_L_AGENT_EN_MARCHE + octet(jeu, o + DIRECTION)));
  }
  jeu.appeler(BALAYER_S_IL_Y_A_DES_DECHETS, o);
  return 0;
});

// Les sorties de la case (bit n = direction n), selon son sol et sa forme :
//   - une allée : celles de sa forme, plus les voisines qui sont des bouts de file (drapeau 0x10) ;
//   - un sol 0x10 : celles de sa forme de file, plus les voisines qui sont des allées ;
//   - une file : celles de sa forme, moins celle d'où il vient ; et si la case vers laquelle mènent
//     les sorties restantes porte une entrée d'attraction (type 6), ou n'est pas une file, il fait
//     demi-tour : l'agent ne remonte une file que vers d'autres morceaux de file.
function sortiesDeLaCase(jeu, o, ici, index, sol) {
  const forme = octet(jeu, SOLS + octet(jeu, ici + 2) * 4 + 3);
  if (sol & SOL_ALLEE) {
    return octet(jeu, SORTIES_D_UNE_ALLEE + forme) | (jeu.appeler(DIRECTIONS_VOISINES, index, SOL_BOUT_DE_FILE) & 0xFF);
  }
  if (sol & SOL_BOUT_DE_FILE) {
    return octet(jeu, SORTIES_D_UNE_FILE + forme) | (jeu.appeler(DIRECTIONS_VOISINES, index, SOL_ALLEE) & 0xFF);
  }
  if (sol & SOL_FILE) {
    const arriere = octet(jeu, DIRECTION_OPPOSEE + octet(jeu, o + DIRECTION) * 2);
    const sorties = octet(jeu, SORTIES_D_UNE_FILE + forme) & ~bit(arriere) & 0xFF;
    const devant = long(jeu, GRILLE) + (pasVers(jeu, octet(jeu, DIRECTION_DES_SORTIES + sorties)) + index) * 4;
    if (jeu.appeler(OBJET_DE_TYPE_SUR_LA_CASE, devant, ENTREE_D_ATTRACTION) !== 0
      || (drapeauxDuSol(jeu, devant) & (SOL_FILE | SOL_BOUT_DE_FILE)) === 0) {
      return bit(arriere);
    }
    return sorties;
  }
  return 0;
}

// Choisir la direction suivante parmi les sorties, hors demi-tour :
//   - aucune autre sortie : demi-tour ;
//   - une seule : la prendre ;
//   - plusieurs : celle qui mène au plus de déchets, comptés sur les cases qui se suivent dans cette
//     direction à partir de la voisine, 5 au plus, tant que la case d'après est une allée ou une file ;
//     à égalité, la première dans l'ordre des directions ; sans aucun déchet en vue, une au hasard :
//     le hasard modulo l'ensemble des sorties, pris comme masque s'il en retient au moins une.
// Anomalie, reproduite : une case sans déchets ne fait pas avancer le compte, qui la regarde encore
// jusqu'à épuiser ses 5 essais ; le résultat est le même que s'il s'arrêtait là.
// Défaut d'origine : le tirage au hasard est biaisé vers le haut et la droite (entre le haut et le bas,
// le haut 80 % du temps), et fait parfois faire demi-tour ; les agents sans tournée finissent en haut
// à droite du parc. Le réglage des déplacements du personnel (corrections.js) répartit le même
// tirage également entre les sorties.
//
// Rend, quand il y avait plusieurs sorties, la sortie retenue pour ses déchets (0xFF : aucune), que
// l'original laisse sur la pile ; sinon null.
function choisirUneSortie(jeu, o, index, sortiesDeLaCase) {
  const arriere = octet(jeu, DIRECTION_OPPOSEE + octet(jeu, o + DIRECTION) * 2);
  let sorties = sortiesDeLaCase & ~bit(arriere) & 0xFF;
  if (sorties === 0) {
    poserOctet(jeu, o + DIRECTION, arriere);
    return null;
  }
  if (sorties === 1 || sorties === 2 || sorties === 4 || sorties === 8) {
    poserOctet(jeu, o + DIRECTION, octet(jeu, DIRECTION_DES_SORTIES + sorties));
    return null;
  }
  let plusDeDechets = 0, choix = 0xFF;
  for (let sortie = 1; sortie !== 0x10; sortie <<= 1) {
    if ((sortie & sorties) === 0) continue;
    const pas = pasVers(jeu, octet(jeu, DIRECTION_DES_SORTIES + sortie));
    let c = (index + pas) & 0xFFFF;   // un index de case sur 16 bits, comme dans le programme
    let dechets = 0;
    for (let essais = 5; essais > 0; essais--) {
      if ((octet(jeu, cellule(jeu, c) + 3) & DECHETS) === 0) continue;
      dechets++;
      c = (c + pas) & 0xFFFF;
      if ((drapeauxDuSol(jeu, cellule(jeu, c)) & SOLS_DE_L_ENTRETIEN) === 0) break;
    }
    if (dechets > plusDeDechets) {
      plusDeDechets = dechets;
      choix = sortie;
    }
  }
  if (choix !== 0xFF) {
    poserOctet(jeu, o + DIRECTION, octet(jeu, DIRECTION_DES_SORTIES + choix));
    return choix;
  }
  const hasard = jeu.appeler(HASARD) & 0xFFFF;
  const egale = sortieTireeEgalement(hasard, sorties);   // hors du jeu d'origine : corrections.js, éteint par défaut
  if (egale !== null) {
    poserOctet(jeu, o + DIRECTION, egale);
    return choix;
  }
  const tirage = (hasard % sorties) & 0xFF;
  if (sorties & tirage) sorties &= tirage;
  poserOctet(jeu, o + DIRECTION, octet(jeu, DIRECTION_DES_SORTIES + sorties));
  return choix;
}

// 0x62F72 — les directions (bit n = direction n) dont la case voisine a un sol portant l'un des
// drapeaux demandés. L'index de la case est un mot ; celui de la voisine n'est pas ramené à 16 bits.
export function directionsVoisines(jeu, index, drapeaux) {
  let directions = 0;
  for (let d = 0; d <= 3; d++) {
    const voisine = cellule(jeu, pasVers(jeu, d) + (index & 0xFFFF));
    if (drapeauxDuSol(jeu, voisine) & drapeaux & 0xFFFF) directions |= 1 << d;
  }
  return directions;
}

// 0x6386F — s'il y a des déchets sur la case de l'agent d'entretien, il se met à balayer (état 0x1C),
// en gardant son état pour après ; rend 1 dans ce cas. L'image est la suivante de la première du
// balai, la figure 0x12C.
export function balayerSIlYADesDechets(jeu, o) {
  if ((octet(jeu, cellule(jeu, caseDeLObjet(jeu, o)) + 3) & DECHETS) === 0) return 0;
  poserOctet(jeu, o + ETAT_SUIVANT, octet(jeu, o + ETAT));
  poserOctet(jeu, o + ETAT, BALAYER);
  poserMot(jeu, o + GRAPHIQUE, mot(jeu, objetGraphique(jeu, figure(jeu, FIGURE_DE_L_AGENT_QUI_BALAIE)) + 6));
  return 1;
}

// 0x638EF — l'agent d'entretien balaie (état 0x1C). L'animation du balai avance d'une image à chaque
// pas ; à la fin de son cycle, les déchets de la case sont enlevés — le compte de déchets du parc
// (mot +0x80 de la fiche du parc) baisse d'autant, un par bit des trois bits de la cellule —, et
// l'agent reprend l'état qu'il avait gardé (+0xD), en marche dans sa direction, la patience remise
// à 20. Si la case est dans la vue, la carte est à redessiner. S'il a été désigné par le joueur
// (bit 2 de +5), 0x645AD (non exercé, non établi), puis son compte à rebours et sa vitesse sont mis
// à zéro. Rend 1 à la fin du cycle, 0 sinon.
//
// L'original garde la cellule en [ebp-8] : c'est ce qu'il laisse sur la pile à la fin du cycle.
//
// La vue : de la colonne de la caméra à cette colonne plus 640 / largeur d'une case, bornes
// comprises, et de même en rangées avec (hauteur d'une case + hauteur de l'écran − 1) / hauteur
// d'une case — comparaisons signées, sur 16 bits pour les bornes basses.
export const balayer = fonctionDEtat((jeu, o, reste) => {
  animer(jeu, o);
  if ((octet(jeu, objetGraphique(jeu, mot(jeu, o + GRAPHIQUE)) + 5) & 1) === 0) return 0;

  poserOctet(jeu, o + ETAT, octet(jeu, o + ETAT_SUIVANT));
  poserMot(jeu, o + GRAPHIQUE, figure(jeu, FIGURES_DE_L_AGENT_EN_MARCHE + octet(jeu, o + DIRECTION)));
  poserLong(jeu, o + PATIENCE, 0x14);
  const c = cellule(jeu, caseDeLObjet(jeu, o));
  reste.valeur = c >>> 0;
  const parc = long(jeu, PARC_COURANT);
  poserMot(jeu, parc + DECHETS_DU_PARC, mot(jeu, parc + DECHETS_DU_PARC) - octet(jeu, NOMBRE_DE_DECHETS + (octet(jeu, c + 3) & DECHETS)));
  poserOctet(jeu, c + 3, octet(jeu, c + 3) & ~DECHETS);

  const colonne = octet(jeu, o + COLONNE), rangee = octet(jeu, o + RANGEE);
  const colonneVue = motSigne(jeu, CAMERA_COLONNE), rangeeVue = motSigne(jeu, CAMERA_RANGEE);
  const hauteurTuile = mot(jeu, HAUTEUR_TUILE);
  // (640 sur 480 : la vue, plus grande en grande vue, grande-vue.js.)
  const hauteurEcran = (octet(jeu, MODE_AFFICHAGE) & 1) ? 0x190 : hauteurDeLaVue(jeu);
  if (colonne >= colonneVue && colonne <= colonneVue + quotient(largeurDeLaVue(jeu), mot(jeu, LARGEUR_TUILE))
      && rangee >= rangeeVue && rangee <= rangeeVue + quotient(hauteurTuile + hauteurEcran - 1, hauteurTuile)) {
    poserMot(jeu, REDESSINER_CARTE, 1);
  }

  if (octet(jeu, o + DRAPEAUX) & 2) {
    jeu.appeler(DESIGNE_POUR_UNE_TOURNEE, o);
    poserMot(jeu, o + COMPTE, 0);
    poserOctet(jeu, o + VITESSE, 0);
  }
  return 1;
});

// Toutes écrivent dans les objets du parc, dans le tas : la comparaison appel par appel doit
// restaurer et comparer toute la mémoire. 0x62F72 ne fait que lire ; elle est traitée de même.
const reecriture = (adresse, nom, fn, retour = true) => ({ adresse, nom, fn, arguments: fn.length - 1, retour, memoire: 'entiere' });

export const reecritures = [
  reecriture(0x326DA, 'flaner', flaner),
  reecriture(0x32A06, 'rejoindre', rejoindre),
  reecriture(0x32E81, 'chercherDesVisiteurs', chercherDesVisiteurs),
  reecriture(0x32BCF, 'amuser', amuser),
  reecriture(0x33133, 'attendreUnePanne', attendreUnePanne),
  reecriture(0x333CB, 'repondreALAppel', repondreALAppel, false),
  reecriture(0x33482, 'marcherVersLAttraction', marcherVersLAttraction),
  reecriture(0x1864A, 'deplacerEtRanger', deplacerEtRanger),
  reecriture(0x34149, 'patrouiller', patrouiller),
  reecriture(0x3436C, 'arreterUnVoyou', arreterUnVoyou),
  reecriture(0x62FEA, 'parcourirLesAllees', parcourirLesAllees),
  reecriture(0x62F72, 'directionsVoisines', directionsVoisines),
  reecriture(0x6386F, 'balayerSIlYADesDechets', balayerSIlYADesDechets),
  reecriture(0x638EF, 'balayer', balayer),
];
