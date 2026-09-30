// Les attractions : leur fonctionnement, pas de simulation après pas de simulation.
//
// À chaque pas, la mise à jour des objets du parc (0x21681) confie chaque attraction (objet du
// parc de type 4) à une routine choisie par son octet +0xC. Ce n'est pas un état qui change au fil
// du jeu mais le MODE DE FONCTIONNEMENT du genre, recopié de sa fiche (+0xB0) à la construction
// (0x2EBB7) ; l'explosion (0x6662D) pose 0x24 ou 0x26 pour deux genres. Relevés dans le parc de la
// démonstration :
//
//   2     0x2FB85  les attractions à tours, qui embarquent leurs passagers, tournent, s'arrêtent et
//                  les débarquent : 14 dans la démo (BIG WHEEL, FLIGHT SIM, PIRATE BOAT, HAUNTED
//                  HOUSE, MAZE, BOUNCY CASTLE, SPACE SHUTTLE...)
//   4     0x3006A  les attractions à bouées (RUBBER TUBING) : chaque visiteur part seul sur l'eau
//   6     0x41F3D  les attractions à train (ROLLER COASTER, BIG DIPPER) : les wagons, objets de type
//                  0xE, ont leur propre routine (0x420C7, 0x42392) ; 0x44208 pour le monorail
//                  (MONORAIL, le seul genre dont la fiche porte 3 en +0xB4 ; aucun dans la démo)
//   0x1C  0x30480  les circuits de voitures (RACE CAR RIDE) : chaque visiteur prend le volant
//   0x1E  0x30803  les spectacles (COWBOY, DOLPHIN, MEDIEVAL ACTS) : une suite de numéros
//   hors de ce module : 8 et 0xA, les routines des wagons 0x420C7 et 0x42392 (jamais vues pour une
//   attraction) ; 0x22, 0x43BAA (qui pose ce mode : non établi) ; 0x24 et 0x26, 0x66976 et 0x66AFD,
//   après l'explosion.
//
// LA PHASE, mot +0x32, fait le cycle d'une attraction à tours :
//   0  à l'arrêt : tous les 8 passages (0xD3AF8), le visiteur qui attend à l'entrée monte à bord
//      (0x30B19) ; le départ est donné quand l'attraction est pleine (0x30B19), ou 8 × 8 passages
//      après le dernier embarquement (compte à rebours +0x1C) ;
//   1  au départ (0x31ED3) : l'animation finit sa boucle, puis prend l'image de marche ;
//   2  en marche, pendant la durée du tour (+0x34, en pas) ;
//   3  à l'arrêt en cours : l'animation finit sa boucle (au plus 999 pas), puis les passagers
//      descendent, un tous les 16 passages (0x31F95) ; le dernier descendu, retour à 0 ;
//   4  la fin d'un spectacle (0x30803) ou d'un tour de train (posée par 0x42392, une routine des
//      wagons) : les spectateurs, les passagers descendent ;
//   6  un incident (0x65F71) : à la fin de la boucle, l'image de l'incident (+0x5F), puis 2 ;
//   7  de même, puis 3 ; aucune écriture de 7 n'a été trouvée dans le programme.
//
// L'USURE, mot +0x2E. Chaque départ l'augmente de 7 − délai d'animation + durée / 256 + départs /
// 6 (0x31ED3) ; chaque visiteur parti sur une bouée ou au volant, de 1. Au-delà du seuil du genre
// (fiche +0xA8, relevé au début de simulation.json : 80 pour la plupart des genres, 40 pour BOUNCY
// CASTLE et SNAKES AND LADDERS, 60 PLANET ROCKET, 180 OBSERVATORY, 200 MONORAIL), l'attraction
// trace une animation de plus (0x1D87A, objet graphique +0x8E, la figure 0x167 posée à la
// construction ; de la fumée ? non établi), d'autant plus rapide que l'usure approche du double du
// seuil, et sa musique se désaccorde (0x1B837) ; au-delà du double, au départ suivant, ELLE EXPLOSE
// (0x6662D, lue seulement : ses passagers sont projetés hors de l'attraction, 0x66189 ; selon le
// rang du genre dans le catalogue, fiche +0xC4, PLANE FLYER passe au mode 0x26 et BOUNCY CASTLE au
// mode 0x24 ; les autres jonchent leur emprise de débris, sol 0x28, et appellent 0x664F1 et
// 0x31748, sens non établi). Le mécanicien la répare : à son arrivée (0x33742), il la ferme
// (ouverture −1, plus bas), puis ôte 5 d'usure à chaque boucle de son animation jusqu'à 0
// (0x33AF3). La recherche (0x53F13) améliore un genre : seuil +5 jusqu'à 120, capacité +1 et
// durée +50 jusqu'au double de celles de la fiche de référence (catalogue en 0xB16F8), prix × 15/16
// arrondi à la centaine inférieure, 500 au moins.
//
// LE PRIX DE CONSTRUCTION n'est pas payé à la construction : 0x2EBB7 le range en +0x38 (en
// centaines) et l'ajoute à la somme engagée du joueur (fiche du joueur +0xE, que le jeu retranche
// du solde disponible). Il est porté au débit (0x78943, catégorie 0 du livre de comptes) quand
// l'attraction sert son premier visiteur, ou un mois (1 000 pas) après la construction, date
// rangée en +0x3E, si elle n'a servi personne.
//
// Vérification : simulation.json (le parc de la démo laissé à lui-même, 330 s) exerce les cinq
// routines de mode et 0x31ED3, 0x65F71 ; construction.json (150 s) y ajoute les paiements, par un
// premier spectateur et, pour l'attraction qu'on y construit, au bout d'un mois, ainsi que la
// fermeture et la réouverture d'une attraction par le joueur. Restent non exercés par les scénarios
// (voir chaque fonction) : les incidents et l'explosion, les phases 6 et 7, la réouverture après
// réparation, les circuits de voitures au-delà de l'attente (aucun visiteur n'y monte), les bouées
// au-delà de la mise à l'eau. 0x30C65 (la montée dans un wagon du monorail, appelée par 0x44208,
// monorail.js) est exercée par monorail-visiteurs.json, 0x35C4A (démolir une boutique) par
// circuit-auto.json. Ces chemins ont été éprouvés à part, sur des états fabriqués (comparaison de la
// transcription et de la réécriture à partir d'attractions, de visiteurs et de cases modifiés au
// hasard) : aucune différence, mais ce n'est pas une preuve au sens des vérificateurs.

import { reglages } from './reglages.js';

// --- les données -----------------------------------------------------------------------------------

// Les objets du parc : 200 octets, numérotés à partir de 1 (l'objet 0 n'est qu'une sentinelle).
const OBJETS_DU_PARC = 0xD3B10;
const TAILLE_OBJET = 200;
const CARTE = 0xD3B08;               // 64 x 64 cellules de 4 octets ; +0 le premier objet posé, +2 le sol
const COLONNES = 64;
const OBJETS_GRAPHIQUES = 0xD3B80;   // 8 octets : +5 bit 0, dernière image d'une boucle ; +6 l'image suivante
const FIGURES = 0xD3B38;             // table de mots : numéro de figure → objet graphique

// Le catalogue des genres d'attractions : fiches de 200 octets, le nom en tête. Ce qu'en lit ce module :
const CATALOGUE = 0xCCED0;
// mot : un identifiant du genre, qui sert aux cas particuliers : les incidents (0x65F71) ; 100, le
// labyrinthe, à la construction (0x2EBB7) ; 0xDB, le monorail, à l'explosion (0x6662D). Ce qu'il
// numérote par ailleurs : non établi.
const FICHE_IDENTIFIANT = 0x22;
const FICHE_IMAGE_AU_REPOS = 0x24;   // mot : figure de l'attraction à l'arrêt
const FICHE_IMAGE_EN_MARCHE = 0x26;  // mot : figure prise au départ ; 0 = l'animation continue
const FICHE_IMAGE_D_ARRET = 0x28;    // mot : figure prise à l'arrêt ; 0 = l'animation continue
const FICHE_SEUIL_D_USURE = 0xA8;    // octet
// octet : 3 pour MONORAIL, qui embarque par véhicules (0x44208) ; 255 pour les attractions sans voie,
// 0 bouées et voitures, 1 BIG DIPPER et WATER SPLASH, 2 ROLLER COASTER, LOOP THE LOOP et CORK SCREW :
// la sorte de voie ? non établi
const FICHE_EMBARQUEMENT = 0xB4;
const FICHE_RANG = 0xC1;             // octet : le rang du genre dans le carnet des visiteurs (+0x18)
// À la construction (0x2EBB7), une attraction reçoit de sa fiche : +0xA6 sa capacité, +0xAC sa durée,
// +0xB0 son mode, +0xB8 son délai d'animation, +0xBE sa sorte de spectacle, +0xA2 le prix de base.

// La fiche du joueur dont le parc est simulé (§ 7 des notes) : +0xA le solde, +0xE la somme engagée
// pour des constructions pas encore payées.
const FICHE_DU_JOUEUR = 0xD3808;
const SOMME_ENGAGEE = 0xE;

const PAS_DE_SIMULATION = 0xD3AFC;   // mot long, 1 000 par mois
// Les passages de la mise à jour des objets (0x21681 l'incrémente à chaque fois ; 1 en début de
// partie) : les attractions s'en servent pour ne faire certaines choses que tous les 8 ou 16 passages.
const PASSAGES = 0xD3AF8;
const UN_MOIS = 1000;

// Le voisinage d'une case : quatre mots signés, les décalages de cellule −64, +1, +64, −1 (la rangée
// du dessus, la colonne suivante, la rangée du dessous, la colonne précédente).
const VOISINES = 0xB4920;
// Les propriétés des sols, 4 octets par numéro de sol : +0 des drapeaux, +3 une forme.
const PROPRIETES_DES_SOLS = 0xB44D9;
const SOL_DE_DEPART = 0x40;          // drapeau : le canal des bouées, la piste des voitures (0x8B à 0x95...)
// La direction qu'une forme de sol donne à un visiteur, octet signé ; −1 : aucune.
const DIRECTIONS_DES_FORMES = 0xB493A;
// La vitesse d'un visiteur sur une attraction, en 256es de case par pas, selon le délai d'animation
// de l'attraction : 128, 64, 64, 64, 32, 32, 32, 16...
const VITESSES = 0xB49E5;

// Les images des visiteurs : une ligne de 0x24 octets par sorte de visiteur (octet +0x59), des
// numéros de figures. Colonnes lues ici :
const IMAGES_DES_VISITEURS = 0xB49F4;
const LIGNE_D_IMAGES = 0x24;
const IMAGE_SUR_UNE_BOUEE = 0x02;    // 4 pour la sorte 0, 22 pour la sorte 1...
const IMAGE_AU_VOLANT = 0x18;        // la première de quatre, une par direction : 328 pour toutes
const IMAGE_BOUEE_USEE = 0x1C;       // 16 pour toutes les sortes ; ce qu'elle montre, non établi

// Le programme des spectacles : 8 mots par sorte de spectacle (+0x59 de l'attraction), un numéro de
// figure par numéro du spectacle ; une valeur négative est sautée (elle n'est que rangée en +0x92) ;
// 0 termine. COWBOY ACTS : 396, −12, 397, 398, −40, 399.
const PROGRAMMES_DES_SPECTACLES = 0xB8C60;

// Les identifiants de genre (fiche +0x22) que distinguent les incidents, et leurs figures, dans la
// table [0xD3B38].
const PIRATE_BOAT = 0x62, GHOST_HOUSE = 0x65, SPACE_SHUTTLE = 0xAE;
const SNAKES_AND_LADDERS = 0x18, TREE_HOUSE = 0x1E;
const FIGURE_INCIDENT_PIRATE_BOAT = 0x262;
const FIGURE_INCIDENT_SPACE_SHUTTLE = 0x263;
const FIGURE_INCIDENT_SNAKES_AND_LADDERS = 0x264;
const FIGURE_INCIDENT_GHOST_HOUSE = 0x265;
const FIGURE_INCIDENT_TREE_HOUSE = 0x267;

// --- l'attraction : un objet du parc de type 4 -------------------------------------------------------
const IMAGE = 0x0A;                  // mot : l'objet graphique affiché, l'image courante de l'animation
const MODE = 0x0C;                   // octet : le mode de fonctionnement (plus haut)
const DELAI = 0x13;                  // octet : pas entre deux images de l'animation (fiche +0xB8) ; le
                                     // tempo de la musique en dépend (0x1B837) ; voir tirerUnIncident
const ATTENTE_IMAGE = 0x14;          // mot signé : compte à rebours jusqu'à l'image suivante
const GENRE = 0x16;                  // mot : la fiche du genre, décalage dans le catalogue (200 × genre)
const ATTENTE_DEPART = 0x1C;         // mot signé : compte à rebours du départ, en passages de 8
const EN_TETE_DE_FILE = 0x1E;        // mot : le visiteur qui attend à l'entrée ; 0 = personne
const BOUCLES = 0x20;                // mot long : boucles d'animation achevées depuis l'arrêt ; qui le lit, non établi
const CAPACITE = 0x26;               // mot
const USURE = 0x2E;                  // mot
const A_BORD = 0x30;                 // mot signé : passagers, spectateurs ; bouées et voitures : partis
const PHASE = 0x32;                  // mot (plus haut)
const DUREE = 0x34;                  // mot : durée d'un tour, en pas (fiche +0xAC : 600 pour FLIGHT SIM)
const TEMPS_RESTANT = 0x36;          // mot signé : du tour, en pas ; pour un spectacle, le numéro en cours
const PRIX_DU = 0x38;                // mot signé : le prix de construction encore dû, en centaines
const DEPARTS = 0x3A;                // mot : départs donnés (0x31ED3)
const VISITEURS_SERVIS = 0x3C;       // mot
const DATE_DE_CONSTRUCTION = 0x3E;   // mot long : le pas de simulation de la construction
const PREMIER_A_BORD = 0x47;         // mot : le premier passager ; les suivants par leur mot +0x47
const OUVERTURE = 0x4B;              // octet signé (plus bas)
// mot signé : le labyrinthe, le visiteur que son dessin montre (VISITEUR_MONTRE de
// dessin-attractions.js ; négatif, une apparition du dernier passager), 0 aucun : plus bas, finirLeTour
const VISITEUR_MONTRE = 0x4D;
const SORTE_DE_SPECTACLE = 0x59;     // octet : la ligne du programme des spectacles (fiche +0xBE)
const IMAGE_D_INCIDENT = 0x5F;       // mot : l'objet graphique qui montrera l'incident
const REPARATEUR = 0x61;             // mot : le mécanicien qui la répare (plus bas)
const CASE_DE_SORTIE = 0x73;         // mot : rangée × 64 + colonne ; 0 = aucune
const IMAGE_DU_NUMERO = 0x89;        // mot : spectacle : l'objet graphique du numéro en cours
const COMPTEUR_DU_NUMERO = 0x92;     // mot : spectacle : +1 à chaque image ; qui le lit, non établi

// Les phases.
const A_L_ARRET = 0, AU_DEPART = 1, EN_MARCHE = 2, ARRET_EN_COURS = 3, FINI = 4;
const INCIDENT = 6, INCIDENT_PUIS_ARRET = 7;
// L'ouverture : les visiteurs ne viennent qu'à une attraction ouverte (ils testent la valeur 1).
const FERMEE = 0, OUVERTE = 1, A_ROUVRIR = -1;
const DUREE_MAXIMALE_DE_L_ARRET = 999;
const PASSAGES_AVANT_LE_DEPART = 8;

// --- le visiteur (objet du parc de type 2), dans ce qu'en touchent les attractions -----------------
const V_IMAGE = 0x0A;                // mot
const V_ETAT = 0x0C;                 // octet
const V_DIRECTION = 0x12;            // octet : 0 à 3, dans l'ordre des voisines
const V_VITESSE = 0x13;              // octet : en 256es de case par pas
const V_ATTENTE = 0x14;              // mot : 256 / vitesse, les pas pour traverser une case
const V_ATTRACTION = 0x16;           // mot : le numéro de l'attraction où il est
const V_CARNET = 0x18;               // octets : un bit par genre d'attraction déjà essayé
const V_SUIVANT_DANS_LA_FILE = 0x1E; // mot
const V_SUIVANT_A_BORD = 0x47;       // mot
const V_VITESSE_GARDEE = 0x58;       // octet : sa vitesse à pied, rendue à la sortie
const V_SORTE = 0x59;                // octet : la ligne de la table des images des visiteurs
const V_5A = 0x5A;                   // octet : +3 à chaque embarquement ; sens non établi
const V_5F = 0x5F;                   // mot : remis à zéro au départ sur une bouée ou au volant ; non établi
// Ses états, dans ce qu'en posent ou attendent les attractions.
const ATTEND_A_L_ENTREE = 0x0C;
const EMBARQUE = 0x0E;
const SORT_DE_L_ATTRACTION = 0x10;
const SUR_UNE_BOUEE = 0x12;
const AU_VOLANT = 0x36;


// --- les fonctions appelées -------------------------------------------------------------------------
const HASARD = 0x18B92;
const DEPLACER = 0x18A44;                 // (objet, x, y), en 256es de case
// 0x2DEF8 ne fait que remettre à zéro le mot 0xD6688, la demande de sortie de la boucle du parc
// (voies.js). 0x19ED3 l'appelle et rend 1 ; le programme s'en sert pour ne pas diviser par 0.
const EFFACER_LA_DEMANDE_DE_SORTIE = 0x2DEF8;
const DIVISION_PAR_ZERO = 0x19ED3;
const INSCRIRE_AUX_COMPTES = 0x78943;     // (catégorie, montant) : le livre de comptes, et le solde
const EMBARQUER = 0x30B19;                // (visiteur, attraction) : rend 1 s'il est monté
const FAIRE_DESCENDRE = 0x31F95;          // (visiteur, attraction)
const AVANCER_LA_FILE = 0x32142;          // (visiteur suivant, attraction) ; efface EN_TETE_DE_FILE
const EJECTER = 0x66189;                  // (0, visiteur, attraction, 5)
const EXPLOSER = 0x6662D;                 // (attraction)
const LANCER_UN_TOUR = 0x31ED3;
const TIRER_UN_INCIDENT = 0x65F71;
const ANIMER_LE_MONORAIL = 0x44208;

// --- les accès à la mémoire ------------------------------------------------------------------------
const s16 = (v) => (v << 16) >> 16;
const s8 = (v) => (v << 24) >> 24;
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const motLong = (jeu, a) => jeu.dv.getUint32(a, true);
const ecrireOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const ecrireMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const ecrireMotLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);
const ajouterAuMot = (jeu, a, v) => ecrireMot(jeu, a, mot(jeu, a) + v);
const ajouterAuMotLong = (jeu, a, v) => ecrireMotLong(jeu, a, motLong(jeu, a) + v);

// Division entière signée du processeur (idiv), tronquée vers zéro.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

const baseDesObjets = (jeu) => motLong(jeu, OBJETS_DU_PARC);
const objetNumero = (jeu, n) => (baseDesObjets(jeu) + n * TAILLE_OBJET) >>> 0;
const numeroDe = (jeu, objet) => diviser((objet - baseDesObjets(jeu)) | 0, TAILLE_OBJET);
// Le programme teste l'existence d'un objet désigné par son numéro en comparant son adresse à celle
// de la table : le numéro 0, la sentinelle, ne désigne rien.
const existe = (jeu, objet) => objet > baseDesObjets(jeu);
function objetDesigne(jeu, n) {
  const objet = objetNumero(jeu, n);
  return existe(jeu, objet) ? objet : 0;
}

// --- ce que les routines laissent sur la pile ----------------------------------------------------------
//
// ANOMALIE du jeu d'origine, dont cette réécriture doit tenir compte. 0x223C1, une routine des
// visiteurs, lit sa variable [ebp − 8] sans l'avoir écrite quand le mot +0x20 du visiteur vaut 1
// (en 0x22572 : l'attente du visiteur est tirée de l'octet bas d'une position qu'elle n'a pas
// calculée). Comme toutes les routines de mise à jour, elle est appelée par 0x21681 au même niveau
// de pile : elle trouve donc là, 0x18 octets sous l'adresse de retour, ce qu'y a laissé la routine
// de l'objet mis à jour avant elle. Pour les cinq routines de ce module qu'appelle 0x21681, c'est
// leur propre variable [ebp − 8] (leur cadre : ebx, esi, edi et ebp sauvés, puis les variables
// locales), ou, si elles ne l'écrivent pas, ce qui s'y trouvait déjà. Une réécriture qui y
// laisserait autre chose changerait la partie (le rejeu divergeait à 169 s de simulation.json).
//
// Ce sont les seuls restes de pile que lise le jeu dans les scénarios : mesuré en remplaçant par un
// motif, après chaque routine appelée par 0x21681 et après chaque appel imbriqué, les octets laissés
// sous la pile. demo.json, simulation.json (330 s) et construction.json restent identiques si l'on
// épargne ces 4 octets, et divergent dès 40 s sinon.
class ResteDePile {
  constructor(jeu) {
    this.jeu = jeu;
    jeu.T.sauver();
    this.sommet = jeu.T.R.esp >>> 0;          // l'adresse de retour, à l'entrée
    this.adresse = this.sommet - 0x18;        // [ebp − 8] de la routine d'origine
    this.ebpMoins8 = motLong(jeu, this.adresse);
  }

  // En sortie : la valeur qu'y aurait laissée l'original (les appels faits d'ici l'ont écrasée).
  laisser() {
    ecrireMotLong(this.jeu, this.adresse, this.ebpMoins8);
  }
}

const ficheDuGenre = (jeu, attraction) => CATALOGUE + mot(jeu, attraction + GENRE);
const figure = (jeu, numero) => mot(jeu, (motLong(jeu, FIGURES) + 2 * numero) >>> 0);
const objetGraphique = (jeu, n) => (motLong(jeu, OBJETS_GRAPHIQUES) + n * 8) >>> 0;
const imageSuivante = (jeu, n) => mot(jeu, objetGraphique(jeu, n) + 6);
const derniereDeLaBoucle = (jeu, n) => (octet(jeu, objetGraphique(jeu, n) + 5) & 1) !== 0;
const imageDeVisiteur = (jeu, visiteur, colonne) =>
  mot(jeu, IMAGES_DES_VISITEURS + LIGNE_D_IMAGES * octet(jeu, visiteur + V_SORTE) + colonne);
const tousLes = (jeu, n) => (octet(jeu, PASSAGES) & (n - 1)) === 0;

// Le compte à rebours d'une image : il décroît à chaque appel ; vrai quand il était déjà à zéro ou
// moins, c'est-à-dire quand l'animation doit avancer.
function imageDue(jeu, attraction) {
  const reste = motSigne(jeu, attraction + ATTENTE_IMAGE);
  ecrireMot(jeu, attraction + ATTENTE_IMAGE, reste - 1);
  return reste <= 0;
}

function avancerLAnimation(jeu, attraction) {
  ecrireMot(jeu, attraction + IMAGE, imageSuivante(jeu, mot(jeu, attraction + IMAGE)));
}

// Le prix de construction encore dû passe au débit du joueur : une écriture de la catégorie 0 de son
// livre de comptes (0x78943, qui débite aussi son solde), et sa somme engagée diminue d'autant.
function payerLaConstruction(jeu, attraction) {
  jeu.appeler(INSCRIRE_AUX_COMPTES, 0, -motSigne(jeu, attraction + PRIX_DU) * 100);
  const joueur = motLong(jeu, FICHE_DU_JOUEUR);
  ecrireMotLong(jeu, joueur + SOMME_ENGAGEE,
    motLong(jeu, joueur + SOMME_ENGAGEE) - motSigne(jeu, attraction + PRIX_DU) * 100);
  ecrireMot(jeu, attraction + PRIX_DU, 0);
}

// Une attraction qui n'a encore servi personne paie sa construction un mois après.
function payerSiUnMoisEstPasse(jeu, attraction) {
  if (motSigne(jeu, attraction + PRIX_DU) === 0) return;
  if (((motLong(jeu, PAS_DE_SIMULATION) - motLong(jeu, DATE_DE_CONSTRUCTION + attraction)) >>> 0) < UN_MOIS) return;
  payerLaConstruction(jeu, attraction);
}

function payerSiDu(jeu, attraction) {
  if (motSigne(jeu, attraction + PRIX_DU) !== 0) payerLaConstruction(jeu, attraction);
}

// Le carnet du visiteur : le bit du genre de l'attraction, pour qu'il sache l'avoir essayée.
function noterDansLeCarnet(jeu, visiteur, fiche) {
  const rang = octet(jeu, fiche + FICHE_RANG);
  const a = visiteur + V_CARNET + (rang >> 3);
  ecrireOctet(jeu, a, octet(jeu, a) | (1 << (rang & 7)));
}

// ======================================================================================================
// 0x2FB85 — une attraction à tours (mode 2), à chaque pas.
//
// L'OUVERTURE, octet +0x4B : 1 à la construction (0 pour les attractions à train). Fermée (0, par le
// joueur : construction.json ferme puis rouvre MERRY-GO-ROUND), l'attraction ne fait rien. En
// réparation (−1) : le mécanicien, à son arrivée (0x33742), la pose avec son propre numéro en
// +0x61 et lève le bit 8 de son octet +5 ; l'attraction fonctionne, mais les visiteurs n'y viennent
// pas (ils attendent la valeur 1), et elle rouvre dès que ce bit est retombé, ou qu'il n'y a pas de
// mécanicien. Vérifié : la fermeture et la réparation en cours ; non vérifié : la réouverture après
// réparation.
//
// Le visiteur en tête de file doit attendre à l'entrée ; sinon, le programme efface la demande de
// sortie du parc (0x2DEF8) — rien d'autre. Jamais vu dans les scénarios.
//
// [ebp − 8] (voir ResteDePile) : le dernier objet désigné, la tête de file, le réparateur, le
// premier passager.
export function animerAttractionATours(jeu, attraction) {
  const reste = new ResteDePile(jeu);
  try {
    const enTete = objetNumero(jeu, mot(jeu, attraction + EN_TETE_DE_FILE));
    reste.ebpMoins8 = enTete;
    if (existe(jeu, enTete) && octet(jeu, enTete + V_ETAT) !== ATTEND_A_L_ENTREE) jeu.appeler(EFFACER_LA_DEMANDE_DE_SORTIE);
    const fiche = ficheDuGenre(jeu, attraction);

    const ouverture = octetSigne(jeu, attraction + OUVERTURE);
    if (ouverture === A_ROUVRIR) {
      const reparateur = objetNumero(jeu, mot(jeu, attraction + REPARATEUR));
      reste.ebpMoins8 = reparateur;
      if (!existe(jeu, reparateur) || (octet(jeu, reparateur + 5) & 8) === 0) ecrireOctet(jeu, attraction + OUVERTURE, OUVERTE);
    } else if (ouverture === FERMEE) {
      return;
    }

    if (mot(jeu, attraction + PHASE) === A_L_ARRET) {
      embarquerOuPartir(jeu, attraction, reste);
      return;
    }
    ecrireMot(jeu, attraction + TEMPS_RESTANT, motSigne(jeu, attraction + TEMPS_RESTANT) - 1);
    if (motSigne(jeu, attraction + TEMPS_RESTANT) > 0) tourner(jeu, attraction, fiche);
    else finirLeTour(jeu, attraction, fiche, reste);
  } finally {
    reste.laisser();
  }
}

// À l'arrêt : tous les 8 passages, le visiteur en tête de file monte (0x30B19, qui donne le départ
// si l'attraction est pleine) ; s'il n'y en a pas et qu'il y a des passagers, le compte à rebours du
// départ avance (0x30B19 le réarme à chaque embarquement). Le premier embarquement paie la
// construction (non vérifié par les scénarios).
function embarquerOuPartir(jeu, attraction, reste) {
  if (!tousLes(jeu, 8)) return;
  const enTete = objetNumero(jeu, mot(jeu, attraction + EN_TETE_DE_FILE));
  reste.ebpMoins8 = enTete;
  if (existe(jeu, enTete)) {
    const monte = jeu.appeler(EMBARQUER, enTete, attraction);
    if ((monte & 0xFFFF) !== 0) payerSiDu(jeu, attraction);
  } else if (mot(jeu, attraction + PREMIER_A_BORD) !== 0) {
    ecrireMot(jeu, attraction + ATTENTE_DEPART, motSigne(jeu, attraction + ATTENTE_DEPART) - 1);
    if (motSigne(jeu, attraction + ATTENTE_DEPART) <= 0) jeu.appeler(LANCER_UN_TOUR, attraction);
  } else {
    payerSiUnMoisEstPasse(jeu, attraction);
  }
}

// Le tour en cours : l'animation avance d'une image tous les 2 × délai + 1 pas (le compte à rebours
// est remis à 2 × délai, et l'image vient quand il était déjà à zéro). À la dernière image d'une
// boucle, un départ passe à la marche avec l'image de marche du genre, un incident prévu montre son
// image (phases 6 et 7, non vérifiées par les scénarios). L'arrêt en cours s'achève sur la dernière
// image de la boucle suivante. Chaque image peut tirer un incident (0x65F71).
function tourner(jeu, attraction, fiche) {
  if (!imageDue(jeu, attraction)) return;
  avancerLAnimation(jeu, attraction);
  const image = mot(jeu, attraction + IMAGE);
  jeu.appeler(TIRER_UN_INCIDENT, attraction);
  if (derniereDeLaBoucle(jeu, image)) {
    const phase = mot(jeu, attraction + PHASE);
    if (phase === AU_DEPART) {
      const enMarche = mot(jeu, fiche + FICHE_IMAGE_EN_MARCHE);
      if (enMarche !== 0) ecrireMot(jeu, attraction + IMAGE, figure(jeu, enMarche));
      ecrireMot(jeu, attraction + PHASE, EN_MARCHE);
    } else if (phase === INCIDENT) {
      ecrireMot(jeu, attraction + IMAGE, mot(jeu, attraction + IMAGE_D_INCIDENT));
      ecrireMot(jeu, attraction + PHASE, EN_MARCHE);
    } else if (phase === INCIDENT_PUIS_ARRET) {
      ecrireMot(jeu, attraction + IMAGE, mot(jeu, attraction + IMAGE_D_INCIDENT));
      ecrireMot(jeu, attraction + PHASE, ARRET_EN_COURS);
    }
    ajouterAuMotLong(jeu, attraction + BOUCLES, 1);
  }
  if (mot(jeu, attraction + PHASE) === ARRET_EN_COURS &&
      derniereDeLaBoucle(jeu, imageSuivante(jeu, mot(jeu, attraction + IMAGE)))) {
    ecrireMot(jeu, attraction + TEMPS_RESTANT, 0);
  }
  ecrireMot(jeu, attraction + ATTENTE_IMAGE, 2 * octet(jeu, attraction + DELAI));
}

// Le temps du tour est écoulé. En marche, l'attraction attend la fin de la boucle d'animation pour
// passer à l'arrêt, avec l'image d'arrêt du genre, pour au plus 999 pas. Au départ, elle passe
// à la marche (non vérifié par les scénarios). Arrêtée, elle fait descendre un passager tous les 16
// passages, le premier de sa liste (+47), puis revient au repos.
//
// Défaut du jeu d'origine : le labyrinthe BLOQUÉ HORS DE VUE. Son dessin ne montre qu'un passager à la
// fois, dans une animation, qu'il désigne dans le mot +4D ; c'est ce même dessin, et lui seul, qui le
// remet à 0 à la fin de l'animation (0x69840, dessin-attractions.js, tracerLeLabyrinthe). Et
// l'attraction ne fait pas descendre le premier de sa liste tant qu'il est le passager montré — pour
// ne pas l'effacer au milieu de son animation, vraisemblablement —, ni aucun autre, puisque seul le
// premier descend. Si le labyrinthe cesse d'être dessiné pendant ce temps (le joueur regarde ailleurs,
// ouvre un écran plein, la vue réduite ne le trace pas en détail), +4D n'est plus jamais remis à 0 :
// l'attraction reste à l'arrêt en cours (phase 3), ses passagers à bord, sa file s'allonge, sans fin,
// jusqu'à ce qu'on regarde de nouveau le labyrinthe, ou qu'on le ferme (0x31668 fait descendre tout le
// monde sans regarder +4D et remet la phase à 0 : c'est pourquoi « fermer et rouvrir » le débloque).
// Mesuré sous Node sur la partie de Fabien (retour 69 de docs/demandes.md) : la caméra sur le
// labyrinthe, le visiteur montré devient le premier à bord ; la caméra ailleurs, plus un départ en
// 21 000 pas. Hors du jeu d'origine, réglage corrigerLeLabyrintheHorsDeVue allumé (reglages.js), le
// passager montré descend comme les autres, et le dessin en tirera un autre (+4D remis à 0) : il sort
// du labyrinthe au lieu d'y finir son animation.
function finirLeTour(jeu, attraction, fiche, reste) {
  const phase = mot(jeu, attraction + PHASE);
  if (phase === EN_MARCHE) {
    if (!imageDue(jeu, attraction)) return;
    if (derniereDeLaBoucle(jeu, imageSuivante(jeu, mot(jeu, attraction + IMAGE)))) {
      const aLArret = mot(jeu, fiche + FICHE_IMAGE_D_ARRET);
      if (aLArret !== 0) ecrireMot(jeu, attraction + IMAGE, figure(jeu, aLArret));
      else avancerLAnimation(jeu, attraction);
      ajouterAuMotLong(jeu, attraction + BOUCLES, 1);
      ecrireMot(jeu, attraction + PHASE, ARRET_EN_COURS);
      ecrireMot(jeu, attraction + TEMPS_RESTANT, DUREE_MAXIMALE_DE_L_ARRET);
    } else {
      avancerLAnimation(jeu, attraction);
    }
    ecrireMot(jeu, attraction + ATTENTE_IMAGE, 2 * octet(jeu, attraction + DELAI));
  } else if (phase === AU_DEPART) {
    ecrireMot(jeu, attraction + PHASE, EN_MARCHE);
  } else {
    ecrireMot(jeu, attraction + TEMPS_RESTANT, 0);
    if (!tousLes(jeu, 16)) return;
    const passager = objetNumero(jeu, mot(jeu, attraction + PREMIER_A_BORD));
    reste.ebpMoins8 = passager;
    if (existe(jeu, passager)) {
      if (mot(jeu, attraction + PREMIER_A_BORD) !== mot(jeu, attraction + VISITEUR_MONTRE)) {
        jeu.appeler(FAIRE_DESCENDRE, passager, attraction);
      } else if (reglages.corrigerLeLabyrintheHorsDeVue) {
        // Hors du jeu d'origine (plus haut) : le passager montré descend, le dessin en montrera un autre.
        ecrireMot(jeu, attraction + VISITEUR_MONTRE, 0);
        jeu.appeler(FAIRE_DESCENDRE, passager, attraction);
      }
    } else {
      ecrireMotLong(jeu, attraction + BOUCLES, 0);
      ecrireMot(jeu, attraction + IMAGE, figure(jeu, mot(jeu, fiche + FICHE_IMAGE_AU_REPOS)));
      ecrireMot(jeu, attraction + PHASE, A_L_ARRET);
      ecrireMot(jeu, attraction + A_BORD, 0);
      ecrireMot(jeu, attraction + ATTENTE_DEPART, PASSAGES_AVANT_LE_DEPART);
      ecrireMot(jeu, attraction + VISITEUR_MONTRE, 0);
    }
  }
}

// ======================================================================================================
// 0x31ED3 — donner le départ d'un tour : l'usure augmente ; au-delà du double du seuil, l'attraction
// explose (0x6662D) ; sinon, sauf incident, elle part (phase 1). Dans tous les cas, le compte à
// rebours de l'image et le temps du tour sont remis.
//
// Appelée quand l'attraction est pleine (0x30B19) ou que le compte à rebours du départ est écoulé
// (0x2FB85, 0x30803), et par 0x30C65. Non vérifié par les scénarios : l'explosion.
export function lancerUnTour(jeu, attraction) {
  ajouterAuMot(jeu, attraction + DEPARTS, 1);
  const usureDuTour = 7 - octet(jeu, attraction + DELAI)
    + diviser(motSigne(jeu, attraction + DUREE), 256)
    + diviser(mot(jeu, attraction + DEPARTS), 6);
  ecrireMot(jeu, attraction + USURE, mot(jeu, attraction + USURE) + usureDuTour);
  const fiche = ficheDuGenre(jeu, attraction);
  if (mot(jeu, attraction + USURE) > 2 * octet(jeu, fiche + FICHE_SEUIL_D_USURE)) {
    jeu.appeler(EXPLOSER, attraction);
  } else if ((jeu.appeler(TIRER_UN_INCIDENT, attraction) & 0xFF) === 0) {
    ecrireMot(jeu, attraction + PHASE, AU_DEPART);
  }
  ecrireMot(jeu, attraction + ATTENTE_IMAGE, octet(jeu, attraction + DELAI));
  ecrireMot(jeu, attraction + TEMPS_RESTANT, mot(jeu, attraction + DUREE));
}

// ======================================================================================================
// 0x65F71 — tirer un incident. Rend 1 (dans al) si l'incident interrompt le cours normal du tour.
//
// Seulement pour une attraction usée (usure ≥ 18), une fois sur 64 (le hasard n'est tiré qu'à
// partir de cette usure), lente (délai d'animation > 6) et qui a au moins un passager. Selon
// l'identifiant du genre (mot +0x22 de la fiche) :
//   - en marche : PIRATE BOAT, GHOST HOUSE, SPACE SHUTTLE préparent leur image d'incident (phase 6),
//     sauf à l'arrêt en cours ; SNAKES AND LADDERS et TREE HOUSE, rien ; les autres projettent leur
//     premier passager hors de l'attraction (0x66189, comme l'explosion le fait de tous) et rendent 1 ;
//   - au repos (appelée au départ par 0x31ED3) : SNAKES AND LADDERS et TREE HOUSE prennent leur image
//     d'incident et passent à l'arrêt en cours, et rendent 1 ; les autres, rien.
//
// Le délai d'une attraction vient de sa fiche à la construction (+0xB8 : 4 pour presque tous les
// genres, 3 pour SNAKES AND LADDERS, 0 pour trois autres) ; deux boutons de l'interface (0x15FBD,
// 0x1788D ; lesquels, non établi) le font varier d'une unité, entre 0 et 6, pour l'objet
// sélectionné ; l'explosion de BOUNCY CASTLE le porte à 20, mais l'attraction est alors en mode 0x24,
// dont la routine n'appelle pas celle-ci (ce que devient le délai à la réparation : non établi). Aucun
// autre chemin ne dépasse 6 : l'incident n'arrive jamais dans les scénarios, et seuls les trois
// premiers tests y sont vérifiés.
//
// Le résultat n'est que l'octet bas de eax ; le reste, des restes de calcul (l'adresse de
// l'attraction, souvent) qu'aucun appelant ne lit, n'est pas reproduit. C'est pourquoi la réécriture
// ne déclare pas `retour`, qui ferait comparer eax entier.
export function tirerUnIncident(jeu, attraction) {
  if (mot(jeu, attraction + USURE) < 18) return 0;
  if ((jeu.appeler(HASARD) & 0x3F) !== 0x3F) return 0;
  if (octet(jeu, attraction + DELAI) <= 6) return 0;
  const passager = objetDesigne(jeu, mot(jeu, attraction + PREMIER_A_BORD));
  if (!passager) return 0;
  const genre = mot(jeu, ficheDuGenre(jeu, attraction) + FICHE_IDENTIFIANT);

  if (mot(jeu, attraction + PHASE) !== A_L_ARRET) {
    switch (genre) {
      case PIRATE_BOAT: preparerUneImageDIncident(jeu, attraction, FIGURE_INCIDENT_PIRATE_BOAT); return 0;
      case GHOST_HOUSE: preparerUneImageDIncident(jeu, attraction, FIGURE_INCIDENT_GHOST_HOUSE); return 0;
      case SPACE_SHUTTLE: preparerUneImageDIncident(jeu, attraction, FIGURE_INCIDENT_SPACE_SHUTTLE); return 0;
      case SNAKES_AND_LADDERS: case TREE_HOUSE: return 0;
      default:
        ecrireMot(jeu, attraction + PREMIER_A_BORD, mot(jeu, passager + V_SUIVANT_A_BORD));
        ajouterAuMot(jeu, attraction + A_BORD, -1);
        ecrireOctet(jeu, passager + V_DIRECTION, (jeu.appeler(HASARD) & 0xFFFF) % 3 + 1);
        jeu.appeler(EJECTER, 0, passager, attraction, 5);
        return 1;
    }
  }
  switch (genre) {
    case SNAKES_AND_LADDERS: arreterSurUnIncident(jeu, attraction, FIGURE_INCIDENT_SNAKES_AND_LADDERS); return 1;
    case TREE_HOUSE: arreterSurUnIncident(jeu, attraction, FIGURE_INCIDENT_TREE_HOUSE); return 1;
    default: return 0;
  }
}

function preparerUneImageDIncident(jeu, attraction, numero) {
  if (mot(jeu, attraction + PHASE) === ARRET_EN_COURS) return;
  ecrireMot(jeu, attraction + IMAGE_D_INCIDENT, figure(jeu, numero));
  ecrireMot(jeu, attraction + PHASE, INCIDENT);
}

function arreterSurUnIncident(jeu, attraction, numero) {
  ecrireMot(jeu, attraction + IMAGE, figure(jeu, numero));
  ecrireMot(jeu, attraction + PHASE, ARRET_EN_COURS);
}

// ======================================================================================================
// 0x30803 — un spectacle (mode 0x1E), à chaque pas.
//
// Au repos, il se remplit comme une attraction à tours ; au lever du rideau (0x31ED3), le premier
// numéro de son programme (0xB8C60, ligne +0x59) prend la scène. Chaque numéro est une boucle
// d'animation (objet graphique +0x89, une image tous les délai + 1 pas) ; à sa dernière image vient
// le suivant, et après le dernier, la fin (phase 4) : les spectateurs sortent, un tous les 16
// passages. Contrairement aux attractions à tours, la construction est payée dès qu'un visiteur est
// en tête de file, qu'il monte ou non ; au bout d'un mois, seulement si des spectateurs attendent.
// Non vérifié par les scénarios : le paiement au bout d'un mois.
//
// [ebp − 8] (voir ResteDePile) : la tête de file ou le premier spectateur, seulement quand la
// routine les désigne (tous les 8 ou 16 passages).
export function animerSpectacle(jeu, attraction) {
  const reste = new ResteDePile(jeu);
  try {
    const phase = mot(jeu, attraction + PHASE);
    if (phase === A_L_ARRET) attendreLeLeverDuRideau(jeu, attraction, reste);
    else if (phase === EN_MARCHE) jouerLeNumero(jeu, attraction);
    else faireSortirLesSpectateurs(jeu, attraction, reste);
  } finally {
    reste.laisser();
  }
}

function faireSortirLesSpectateurs(jeu, attraction, reste) {
  if (!tousLes(jeu, 16)) return;
  const spectateur = objetNumero(jeu, mot(jeu, attraction + PREMIER_A_BORD));
  reste.ebpMoins8 = spectateur;
  if (existe(jeu, spectateur)) {
    jeu.appeler(FAIRE_DESCENDRE, spectateur, attraction);
  } else {
    ecrireMotLong(jeu, attraction + BOUCLES, 0);
    ecrireMot(jeu, attraction + TEMPS_RESTANT, 0);
    ecrireMot(jeu, attraction + PHASE, A_L_ARRET);
    ecrireMot(jeu, attraction + A_BORD, 0);
    ecrireMot(jeu, attraction + ATTENTE_DEPART, PASSAGES_AVANT_LE_DEPART);
  }
}

// L'entrée du programme pour le numéro en cours (mot +0x36, signé).
const entreeDuProgramme = (jeu, attraction) => PROGRAMMES_DES_SPECTACLES
  + 16 * octet(jeu, attraction + SORTE_DE_SPECTACLE) + 2 * motSigne(jeu, attraction + TEMPS_RESTANT);

function attendreLeLeverDuRideau(jeu, attraction, reste) {
  if (!tousLes(jeu, 8)) return;
  const enTete = objetNumero(jeu, mot(jeu, attraction + EN_TETE_DE_FILE));
  reste.ebpMoins8 = enTete;
  if (existe(jeu, enTete)) {
    jeu.appeler(EMBARQUER, enTete, attraction);
    payerSiDu(jeu, attraction);
  } else if (mot(jeu, attraction + PREMIER_A_BORD) !== 0) {
    payerSiUnMoisEstPasse(jeu, attraction);
    ecrireMot(jeu, attraction + ATTENTE_DEPART, motSigne(jeu, attraction + ATTENTE_DEPART) - 1);
    if (motSigne(jeu, attraction + ATTENTE_DEPART) <= 0) jeu.appeler(LANCER_UN_TOUR, attraction);
  }
  if (mot(jeu, attraction + PHASE) !== A_L_ARRET) {
    ecrireMot(jeu, attraction + IMAGE_DU_NUMERO, figure(jeu, motSigne(jeu, entreeDuProgramme(jeu, attraction))));
    ecrireMot(jeu, attraction + PHASE, EN_MARCHE);
  }
}

function jouerLeNumero(jeu, attraction) {
  if (!imageDue(jeu, attraction)) return;
  ajouterAuMot(jeu, attraction + COMPTEUR_DU_NUMERO, 1);
  const image = imageSuivante(jeu, mot(jeu, attraction + IMAGE_DU_NUMERO));
  ecrireMot(jeu, attraction + IMAGE_DU_NUMERO, image);
  jeu.appeler(TIRER_UN_INCIDENT, attraction);
  if (derniereDeLaBoucle(jeu, image)) {
    ajouterAuMot(jeu, attraction + TEMPS_RESTANT, 1);
    ecrireMot(jeu, attraction + COMPTEUR_DU_NUMERO, mot(jeu, entreeDuProgramme(jeu, attraction)));
    if (motSigne(jeu, attraction + COMPTEUR_DU_NUMERO) < 0) ajouterAuMot(jeu, attraction + TEMPS_RESTANT, 1);
    if (mot(jeu, entreeDuProgramme(jeu, attraction)) === 0) {
      ecrireMot(jeu, attraction + PHASE, FINI);
    } else {
      ecrireMot(jeu, attraction + IMAGE_DU_NUMERO, figure(jeu, motSigne(jeu, entreeDuProgramme(jeu, attraction))));
    }
  }
  ecrireMot(jeu, attraction + ATTENTE_IMAGE, octet(jeu, attraction + DELAI));
}

// ======================================================================================================
// 0x41F3D — une attraction à train (mode 6 : ROLLER COASTER, BIG DIPPER), à chaque pas.
//
// L'attraction ne fait qu'embarquer, à chaque pas, et débarquer, un passager tous les 8 passages ; le
// train roule par les routines de ses wagons (objets de type 0xE), dont 0x42392 la met en phase 4
// (au retour du train ? non établi). Au départ (phase 1, posée par 0x31ED3), elle passe à la
// marche. Le seul genre dont la fiche porte 3 en +0xB4, MONORAIL, embarque autrement, par 0x44208.
// Non vérifiés par les scénarios : les paiements. 0x44208 : monorail.js.
//
// [ebp − 8] (voir ResteDePile) : le premier passager ou la tête de file, quand la routine les désigne.
export function animerAttractionATrain(jeu, attraction) {
  const reste = new ResteDePile(jeu);
  try {
    const fiche = ficheDuGenre(jeu, attraction);
    if (octet(jeu, fiche + FICHE_EMBARQUEMENT) === 3) {
      jeu.appeler(ANIMER_LE_MONORAIL, attraction);
      return;
    }
    if (octet(jeu, attraction + OUVERTURE) === FERMEE) return;
    const phase = mot(jeu, attraction + PHASE);
    if (phase === FINI) {
      if (!tousLes(jeu, 8)) return;
      const passager = objetNumero(jeu, mot(jeu, attraction + PREMIER_A_BORD));
      reste.ebpMoins8 = passager;
      if (existe(jeu, passager)) {
        jeu.appeler(FAIRE_DESCENDRE, passager, attraction);
      } else {
        ecrireMot(jeu, attraction + PHASE, A_L_ARRET);
        ecrireMot(jeu, attraction + A_BORD, 0);
      }
      return;
    }
    if (phase !== A_L_ARRET) return;
    const enTete = objetNumero(jeu, mot(jeu, attraction + EN_TETE_DE_FILE));
    reste.ebpMoins8 = enTete;
    if (existe(jeu, enTete)) {
      jeu.appeler(EMBARQUER, enTete, attraction);
      payerSiDu(jeu, attraction);
    } else {
      payerSiUnMoisEstPasse(jeu, attraction);
    }
    if (mot(jeu, attraction + PHASE) === AU_DEPART) ecrireMot(jeu, attraction + PHASE, EN_MARCHE);
  } finally {
    reste.laisser();
  }
}

// ======================================================================================================
// Les bouées et les voitures : chaque visiteur part seul, depuis l'une des quatre cases voisines de
// l'attraction dont le sol est marqué SOL_DE_DEPART et dont la forme donne une direction.

// La première case de départ voisine, dans l'ordre de la table des voisines : { voisine, direction }.
// Sinon, uneOccupee dit si l'on a écarté une case parce qu'un objet du parc y était posé (seulement
// quand `libreSeulement`). Pour ResteDePile : rang, le numéro de la voisine retenue (4 si aucune), et
// derniereLue, la dernière direction lue sur une case marquée, sur 16 bits (undefined si aucune).
function chercherUneCaseDeDepart(jeu, attraction, libreSeulement) {
  const ici = (motLong(jeu, CARTE)
    + (octet(jeu, attraction + 9) * COLONNES + octet(jeu, attraction + 7)) * 4) >>> 0;
  let uneOccupee = false, derniereLue;
  for (let rang = 0; rang < 4; rang++) {
    const voisine = (ici + motSigne(jeu, VOISINES + 2 * rang) * 4) >>> 0;
    const sol = octet(jeu, voisine + 2);
    if ((octet(jeu, PROPRIETES_DES_SOLS + 4 * sol) & SOL_DE_DEPART) === 0) continue;
    const direction = octetSigne(jeu, DIRECTIONS_DES_FORMES + octet(jeu, PROPRIETES_DES_SOLS + 4 * sol + 3));
    derniereLue = direction & 0xFFFF;
    if (direction === -1) continue;
    if (libreSeulement && motSigne(jeu, voisine) > 0) {
      uneOccupee = true;
      continue;
    }
    return { voisine, direction, rang, derniereLue };
  }
  return { uneOccupee, rang: 4, derniereLue };
}

// Le milieu d'une case, désignée par l'adresse de sa cellule, en 256es de case : (colonne, rangée).
// Colonne et rangée sont tirées du numéro de la cellule par division signée ; seuls leurs octets
// comptent.
function milieuDeLaCase(jeu, voisine) {
  const numero = ((voisine - motLong(jeu, CARTE)) | 0) >> 2;
  const colonne = numero % COLONNES, rangee = (numero / COLONNES) | 0;
  return [((colonne & 0xFF) << 8) | 0x80, ((rangee & 0xFF) << 8) | 0x80];
}

// Le visiteur prend la vitesse que l'attraction donne à ses passagers, et le temps de traverser une
// case qui en découle.
function donnerLaVitesseDeLAttraction(jeu, attraction, visiteur) {
  ecrireOctet(jeu, visiteur + V_VITESSE, octet(jeu, VITESSES + octet(jeu, attraction + DELAI)));
  const vitesse = octet(jeu, visiteur + V_VITESSE);
  ecrireMot(jeu, visiteur + V_ATTENTE, vitesse === 0 ? jeu.appeler(DIVISION_PAR_ZERO) : diviser(0x100, vitesse));
}

// Un départ de plus ; au-delà de la capacité, la phase revient à 0. Le compte, signé, est comparé à
// la capacité avant d'être augmenté.
function compterUnDepart(jeu, attraction) {
  const partis = motSigne(jeu, attraction + A_BORD);
  ecrireMot(jeu, attraction + A_BORD, partis + 1);
  if (partis >= mot(jeu, attraction + CAPACITE)) ecrireMot(jeu, attraction + PHASE, A_L_ARRET);
}

// ======================================================================================================
// 0x3006A — une attraction à bouées (mode 4 : RUBBER TUBING), à chaque pas.
//
// Le visiteur en tête de file est mis à l'eau sur la première case de canal libre à côté de
// l'attraction, dans la direction qu'en donne la forme (état du visiteur 0x12). Chaque départ use
// l'attraction de 1, jusqu'au double du seuil. En deçà du seuil, le visiteur prend l'image de la
// bouée ; au-delà, il reçoit parfois une autre image (colonne 0x1C de la table des images, 16 pour
// toutes les sortes : ce qu'elle montre, non établi), d'autant plus souvent que l'usure approche du
// double du seuil (une chance sur 2 × seuil − usure + 1), et sinon garde celle qu'il avait.
// Si une case de canal est occupée, il attend ; s'il n'y a pas de canal du tout, il ressort (0x31F95).
//
// ANOMALIE, reproduite : dans ce dernier cas, le programme le déplace (0x18A44) à une position qu'il
// n'a jamais calculée, les restes de la pile ; 0x18A44 la refuse si elle tombe hors de la carte.
// Ces restes, 0x24 et 0x28 octets sous l'adresse de retour, sont ceux qu'a laissés la routine de
// l'objet mis à jour avant (voir ResteDePile) ; une réécriture de cette routine-là y laisserait
// autre chose. Aucun scénario ne passe par ce chemin.
//
// Vérifié par les scénarios : l'attente et la mise à l'eau. Non vérifiés : l'animation de
// l'attraction (sa phase n'est jamais que 0), les paiements, l'image au-delà du seuil, la capacité
// atteinte, la case occupée, l'absence de canal.
//
// [ebp − 8] (voir ResteDePile) : le rang de la case voisine retenue, 4 si aucune, quand un visiteur
// attend. Les restes lus par l'anomalie, [ebp − 0x14] et [ebp − 0x18], sont relevés à l'entrée,
// avant tout appel, qui les écraserait ici.
export function animerAttractionABouees(jeu, attraction) {
  const reste = new ResteDePile(jeu);
  try {
    const resteX = mot(jeu, reste.sommet - 0x24), resteY = mot(jeu, reste.sommet - 0x28);
    const fiche = ficheDuGenre(jeu, attraction);
    if (mot(jeu, attraction + PHASE) !== A_L_ARRET && imageDue(jeu, attraction)) {
      avancerLAnimation(jeu, attraction);
      ecrireMot(jeu, attraction + ATTENTE_IMAGE, octet(jeu, attraction + DELAI));
    }
    const visiteur = objetDesigne(jeu, mot(jeu, attraction + EN_TETE_DE_FILE));
    if (!visiteur) {
      payerSiUnMoisEstPasse(jeu, attraction);
      return;
    }
    payerSiDu(jeu, attraction);

    const depart = chercherUneCaseDeDepart(jeu, attraction, true);
    reste.ebpMoins8 = depart.rang;
    let x = resteX, y = resteY;
    if (depart.voisine !== undefined) {
      mettreALEau(jeu, attraction, fiche, visiteur, depart);
      [x, y] = milieuDeLaCase(jeu, depart.voisine);
    } else if (depart.uneOccupee) {
      return;
    } else {
      jeu.appeler(FAIRE_DESCENDRE, visiteur, attraction);
    }
    jeu.appeler(AVANCER_LA_FILE, objetNumero(jeu, mot(jeu, visiteur + V_SUIVANT_DANS_LA_FILE)), attraction);
    noterDansLeCarnet(jeu, visiteur, fiche);
    jeu.appeler(DEPLACER, visiteur, x & 0xFFFF, y & 0xFFFF);
  } finally {
    reste.laisser();
  }
}

function mettreALEau(jeu, attraction, fiche, visiteur, { direction }) {
  ecrireOctet(jeu, visiteur + V_ETAT, SUR_UNE_BOUEE);
  ecrireOctet(jeu, visiteur + V_VITESSE_GARDEE, octet(jeu, visiteur + V_VITESSE));
  const seuil = octet(jeu, fiche + FICHE_SEUIL_D_USURE);
  if (mot(jeu, attraction + USURE) < 2 * seuil) ajouterAuMot(jeu, attraction + USURE, 1);
  ajouterAuMot(jeu, attraction + VISITEURS_SERVIS, 1);
  ecrireMot(jeu, visiteur + V_ATTRACTION, numeroDe(jeu, attraction));
  ecrireOctet(jeu, visiteur + V_DIRECTION, direction);
  if (mot(jeu, attraction + USURE) >= seuil) {
    const uneChanceSur = s16(2 * seuil - mot(jeu, attraction + USURE) + 1);
    if (uneChanceSur <= 1 || (jeu.appeler(HASARD) & 0xFFFF) % uneChanceSur === 0) {
      ecrireMot(jeu, visiteur + V_IMAGE, figure(jeu, imageDeVisiteur(jeu, visiteur, IMAGE_BOUEE_USEE)));
    }
  } else {
    ecrireMot(jeu, visiteur + V_IMAGE, figure(jeu, imageDeVisiteur(jeu, visiteur, IMAGE_SUR_UNE_BOUEE)));
    ecrireMot(jeu, visiteur + V_5F, 0);
  }
  donnerLaVitesseDeLAttraction(jeu, attraction, visiteur);
  compterUnDepart(jeu, attraction);
}

// ======================================================================================================
// 0x30480 — un circuit de voitures (mode 0x1C : RACE CAR RIDE), à chaque pas.
//
// Le visiteur en tête de file prend le volant sur la première case de piste à côté de l'attraction,
// occupée ou non (état 0x36), avec l'image de voiture de sa direction. Sans piste, il ressort par la
// case de sortie (+0x73 ; état 0x10). Chaque visiteur accueilli use l'attraction de 1, sans limite,
// même celui qui ressort faute de piste.
//
// ANOMALIE, reproduite : dans ce dernier cas, la position à l'intérieur de la case, l'octet bas de
// chaque coordonnée, n'est jamais calculée (ailleurs 0x80, le milieu) : ce sont les restes de la
// pile, 0x20 et 0x24 octets sous l'adresse de retour. Même remarque que pour 0x3006A.
//
// Dans le parc de la démo, aucun visiteur ne vient au circuit : seule l'attente est vérifiée par les
// scénarios.
//
// [ebp − 8] (voir ResteDePile) : la dernière direction lue sur une case de piste, sur 16 bits, quand
// un visiteur attend. Les restes lus par l'anomalie, octets bas de [ebp − 0x10] et [ebp − 0x14], sont
// relevés à l'entrée.
export function animerCircuitDeVoitures(jeu, attraction) {
  const reste = new ResteDePile(jeu);
  try {
    const resteX = octet(jeu, reste.sommet - 0x20), resteY = octet(jeu, reste.sommet - 0x24);
    const fiche = ficheDuGenre(jeu, attraction);
    if (mot(jeu, attraction + PHASE) !== A_L_ARRET && imageDue(jeu, attraction)) {
      avancerLAnimation(jeu, attraction);
      ecrireMot(jeu, attraction + ATTENTE_IMAGE, octet(jeu, attraction + DELAI));
    }
    const visiteur = objetDesigne(jeu, mot(jeu, attraction + EN_TETE_DE_FILE));
    if (!visiteur) {
      payerSiUnMoisEstPasse(jeu, attraction);
      return;
    }
    payerSiDu(jeu, attraction);

    const depart = chercherUneCaseDeDepart(jeu, attraction, false);
    if (depart.derniereLue !== undefined) reste.ebpMoins8 = depart.derniereLue;
    let x, y;
    if (depart.voisine !== undefined) {
      mettreAuVolant(jeu, attraction, visiteur, depart);
      [x, y] = milieuDeLaCase(jeu, depart.voisine);
    } else {
      const sortie = mot(jeu, attraction + CASE_DE_SORTIE);
      ecrireOctet(jeu, visiteur + V_ETAT, SORT_DE_L_ATTRACTION);
      x = ((sortie % COLONNES) << 8) | resteX;
      y = (((sortie >> 6) & 0xFF) << 8) | resteY;
    }
    jeu.appeler(AVANCER_LA_FILE, objetNumero(jeu, mot(jeu, visiteur + V_SUIVANT_DANS_LA_FILE)), attraction);
    noterDansLeCarnet(jeu, visiteur, fiche);
    ajouterAuMot(jeu, attraction + USURE, 1);
    jeu.appeler(DEPLACER, visiteur, x, y);
  } finally {
    reste.laisser();
  }
}

function mettreAuVolant(jeu, attraction, visiteur, { direction }) {
  ecrireOctet(jeu, visiteur + V_ETAT, AU_VOLANT);
  ajouterAuMot(jeu, attraction + VISITEURS_SERVIS, 1);
  ecrireOctet(jeu, visiteur + V_VITESSE_GARDEE, octet(jeu, visiteur + V_VITESSE));
  ecrireMot(jeu, visiteur + V_ATTRACTION, numeroDe(jeu, attraction));
  ecrireOctet(jeu, visiteur + V_DIRECTION, direction);
  ecrireMot(jeu, visiteur + V_IMAGE,
    figure(jeu, imageDeVisiteur(jeu, visiteur, IMAGE_AU_VOLANT) + octet(jeu, visiteur + V_DIRECTION)));
  ecrireMot(jeu, visiteur + V_5F, 0);
  donnerLaVitesseDeLAttraction(jeu, attraction, visiteur);
  compterUnDepart(jeu, attraction);
}

// ======================================================================================================
// 0x44208, la routine de mode 6 du monorail (appelée par 0x41F3D ci-dessus), est réécrite et prouvée
// dans monorail.js (animerUneGare).
//
// 0x30C65 — un visiteur monte dans un véhicule du monorail (appelée par 0x44208 seule, monorail.js).
// Exercée par monorail-visiteurs (26 appels).
//
// Le visiteur embarque comme par 0x30B19 (état 0xE, carnet, +0x5A de 3, compte à rebours du départ
// réarmé), mais se range dans la liste des passagers du véhicule. Les wagons de l'attraction sont
// chaînés par leur mot +0xC2 à partir du mot +0xC0 de l'attraction : chacun compte un visiteur servi
// et un passager de plus. Si le véhicule est déjà en tête de la liste +0x47 du wagon désigné par le
// mot +0xC2 de l'attraction (sinon +0xC0), il reçoit son propre numéro dans son mot +0x45, et le mot
// +0x47 du wagon est récrit à l'identique : sens non établi. Le départ est donné au deuxième passager
// du véhicule.
export function monterDansUnVehicule(jeu, visiteur, attraction, vehicule) {
  jeu.appeler(AVANCER_LA_FILE, objetNumero(jeu, mot(jeu, visiteur + V_SUIVANT_DANS_LA_FILE)), attraction);
  ecrireMot(jeu, attraction + 0x2A, 0);
  ecrireOctet(jeu, visiteur + V_ETAT, EMBARQUE);
  noterDansLeCarnet(jeu, visiteur, ficheDuGenre(jeu, attraction));
  ecrireMot(jeu, visiteur + V_ATTRACTION, numeroDe(jeu, attraction));
  ecrireOctet(jeu, visiteur + V_5A, octet(jeu, visiteur + V_5A) + 3);
  ecrireMot(jeu, attraction + ATTENTE_DEPART, PASSAGES_AVANT_LE_DEPART);

  const wagon = objetNumero(jeu, mot(jeu, attraction + 0xC2) !== 0 ? mot(jeu, attraction + 0xC2) : mot(jeu, attraction + 0xC0));
  if ((numeroDe(jeu, vehicule) & 0xFFFF) === mot(jeu, wagon + 0x47)) {
    ecrireMot(jeu, vehicule + 0x45, mot(jeu, wagon + 0x47));
    ecrireMot(jeu, wagon + 0x47, numeroDe(jeu, vehicule));
  }
  ecrireMot(jeu, visiteur + V_SUIVANT_A_BORD, mot(jeu, vehicule + PREMIER_A_BORD));
  ecrireMot(jeu, vehicule + PREMIER_A_BORD, numeroDe(jeu, visiteur));
  for (let w = objetNumero(jeu, mot(jeu, attraction + 0xC0)); w > baseDesObjets(jeu); w = objetNumero(jeu, mot(jeu, w + 0xC2))) {
    ajouterAuMot(jeu, w + VISITEURS_SERVIS, 1);
    ajouterAuMot(jeu, w + A_BORD, 1);
  }
  ajouterAuMot(jeu, vehicule + A_BORD, 1);
  if (motSigne(jeu, vehicule + A_BORD) >= 2) jeu.appeler(LANCER_UN_TOUR, attraction);
}

// ======================================================================================================
// 0x35C4A — démolir une boutique (objet de type 0xA) : le contraire de sa pose (0x3568E,
// ecrans-gestion.js). Appelée par la fiche d'une boutique (0x59C85, le bouton de démolition) et par
// 0x78B7E. Rangée ici faute d'un module des boutiques.
//
//  - on compte les boutiques du même genre (mot +16), elle comprise ;
//  - les panneaux indicateurs (type 0x14, état 8) dont la flèche des boutiques (+0x6B) la désignait
//    la perdent, et un panneau qui n'a plus aucune flèche (+0x69, +0x6B, +0x6D) est ôté (0x18B62) ;
//  - la fiche du parc décompte une boutique de sa famille (1 à manger +0xEC, 2 à boire +0xF8,
//    4 souvenirs +0xE7, 8 jeu d'adresse +0x104) ; pour un jeu d'adresse, l'attrait du parc (+0x105)
//    perd l'attrait du genre divisé par le nombre de boutiques du genre ;
//  - une dette de la boutique (+0x38, en centièmes) est retirée de la somme engagée du joueur (+0xE) ;
//  - les comptes décomptent une boutique du genre (+0x61C + genre), la fiche du parc une installation
//    (+0xE0), le catalogue une boutique du genre (fiche +0x68) ;
//  - la valeur bâtie du joueur (+0x37) perd le prix payé (+0x5B), amorti selon l'âge de la boutique
//    en années de 12 000 pas (table 0xB52DA, dix mots en centièmes ; au-delà de dix ans, rien) ;
//  - chaque case de l'emprise (fiche +0x2A cases, décalages +0x37) est vidée : l'objet de type 0xA
//    qu'elle porte est ôté, et son sol, s'il porte le drapeau 1 de son second octet de propriétés
//    (0xB44DA), remis à 0.
//
// ANOMALIE D'ORIGINE, reproduite : l'attrait retiré pour un jeu d'adresse est celui du genre
// choisi au catalogue des boutiques (0xD664A), non celui de la boutique démolie ; la pose (0x3568E)
// ajoute, elle, celui du genre posé, qui est alors le même.
//
// La fonction se sert de son argument comme d'une variable : elle y range l'objet trouvé sur chaque
// case de l'emprise ; la réécriture l'y range aussi.
//
// Exercé par circuit-auto (1 appel, une boutique à manger démolie depuis sa fiche) : ni jeu d'adresse,
// ni panneau indicateur, ni dette. Le reste est relu instruction par instruction.
const FICHES_DES_BOUTIQUES = 0xD3C62, TAILLE_FICHE_BOUTIQUE = 0x6B;
const GENRE_DE_BOUTIQUE_CHOISI = 0xD664A;   // mot : le genre en main au catalogue des boutiques
const AMORTISSEMENT = 0xB52DA;              // dix mots, en centièmes, par année d'âge
const UNE_ANNEE = 12000;                    // pas de simulation
const OTER_UN_OBJET = 0x18B62;              // (objet)
const OBJET_SUR_LA_CASE = 0x204B9;          // (cellule, type) : le premier objet de ce type, ou 0
const FICHE_DU_PARC = 0xD3818, COMPTES_DU_PARC = 0xD3814;
const BOUTIQUE = 0xA, PANNEAU = 0x14;
export function demolirUneBoutique(jeu, boutique) {
  const argument = (jeu.T.R.esp + 4) >>> 0;   // l'argument, dans la pile de l'appelant
  const base = baseDesObjets(jeu);
  let memeGenre = 0;
  for (let o = base + TAILLE_OBJET; o < motLong(jeu, 0xD3B78); o += TAILLE_OBJET) {
    if (octet(jeu, o + 4) === BOUTIQUE && mot(jeu, boutique + GENRE) === mot(jeu, o + GENRE)) {
      memeGenre = (memeGenre + 1) & 0xFF;
    }
    if (octet(jeu, o + 4) !== PANNEAU || octet(jeu, o + MODE) !== 8) continue;
    if ((numeroDe(jeu, boutique) & 0xFFFF) !== mot(jeu, o + 0x6B)) continue;
    ecrireMot(jeu, o + 0x6B, 0);
    let fleche = 0;
    while (fleche < 3 && mot(jeu, o + 0x69 + 2 * fleche) === 0) fleche++;
    if (fleche === 3) jeu.appeler(OTER_UN_OBJET, o);
  }

  const fiche = FICHES_DES_BOUTIQUES + mot(jeu, boutique + GENRE);
  const origine = (octet(jeu, boutique + 9) * COLONNES + octet(jeu, boutique + 7)) & 0xFFFF;
  const parc = motLong(jeu, FICHE_DU_PARC);
  switch (octet(jeu, fiche + 0x24)) {
    case 1: ecrireOctet(jeu, parc + 0xEC, octet(jeu, parc + 0xEC) - 1); break;
    case 2: ecrireOctet(jeu, parc + 0xF8, octet(jeu, parc + 0xF8) - 1); break;
    case 4: ecrireOctet(jeu, parc + 0xE7, octet(jeu, parc + 0xE7) - 1); break;
    case 8: {
      ecrireOctet(jeu, parc + 0x104, octet(jeu, parc + 0x104) - 1);
      const attrait = octet(jeu, FICHES_DES_BOUTIQUES + 0x69 + mot(jeu, GENRE_DE_BOUTIQUE_CHOISI) * TAILLE_FICHE_BOUTIQUE);
      ajouterAuMotLong(jeu, parc + 0x105, -(memeGenre !== 0 ? (attrait / memeGenre) | 0 : attrait));
      break;
    }
    default: break;
  }
  if (mot(jeu, boutique + 0x38) !== 0) {
    ajouterAuMotLong(jeu, motLong(jeu, FICHE_DU_JOUEUR) + SOMME_ENGAGEE, -Math.imul(motSigne(jeu, boutique + 0x38), 100));
  }
  const genre = diviser((fiche - FICHES_DES_BOUTIQUES) | 0, TAILLE_FICHE_BOUTIQUE);
  const comptes = motLong(jeu, COMPTES_DU_PARC);
  ecrireOctet(jeu, comptes + genre + 0x61C, octet(jeu, comptes + genre + 0x61C) - 1);
  ecrireOctet(jeu, parc + 0xE0, octet(jeu, parc + 0xE0) - 1);
  ecrireOctet(jeu, fiche + 0x68, octet(jeu, fiche + 0x68) - 1);

  const age = Math.floor(((motLong(jeu, PAS_DE_SIMULATION) - motLong(jeu, boutique + 0x3E)) >>> 0) / UNE_ANNEE) & 0xFFFF;
  if (age < 10) {
    const valeur = (Math.imul(motLong(jeu, boutique + 0x5B), mot(jeu, AMORTISSEMENT + 2 * age)) >>> 0);
    ajouterAuMotLong(jeu, motLong(jeu, FICHE_DU_JOUEUR) + 0x37, -Math.floor(valeur / 100));
  }

  for (let k = 0; k < octet(jeu, fiche + 0x2A); k++) {
    const cellule = (motLong(jeu, CARTE) + (motSigne(jeu, fiche + 0x37 + 2 * k) + origine) * 4) >>> 0;
    const o = jeu.appeler(OBJET_SUR_LA_CASE, cellule, BOUTIQUE) >>> 0;
    ecrireMotLong(jeu, argument, o);
    if (o > baseDesObjets(jeu)) jeu.appeler(OTER_UN_OBJET, o);
    if (octet(jeu, PROPRIETES_DES_SOLS + 1 + octet(jeu, cellule + 2) * 4) & 1) ecrireOctet(jeu, cellule + 2, 0);
  }
}

// ======================================================================================================
// Toutes écrivent dans les objets du parc, et certaines dans la fiche du joueur, qui vivent dans le
// tas : la comparaison appel par appel doit restaurer et comparer toute la mémoire.
export const reecritures = [
  { adresse: 0x2FB85, nom: 'animerAttractionATours', fn: animerAttractionATours, arguments: 1, memoire: 'entiere' },
  { adresse: 0x3006A, nom: 'animerAttractionABouees', fn: animerAttractionABouees, arguments: 1, memoire: 'entiere' },
  { adresse: 0x30480, nom: 'animerCircuitDeVoitures', fn: animerCircuitDeVoitures, arguments: 1, memoire: 'entiere' },
  { adresse: 0x30803, nom: 'animerSpectacle', fn: animerSpectacle, arguments: 1, memoire: 'entiere' },
  { adresse: 0x41F3D, nom: 'animerAttractionATrain', fn: animerAttractionATrain, arguments: 1, memoire: 'entiere' },
  { adresse: 0x31ED3, nom: 'lancerUnTour', fn: lancerUnTour, arguments: 1, memoire: 'entiere' },
  { adresse: 0x65F71, nom: 'tirerUnIncident', fn: tirerUnIncident, arguments: 1, memoire: 'entiere' },
  { adresse: 0x30C65, nom: 'monterDansUnVehicule', fn: monterDansUnVehicule, arguments: 3, memoire: 'entiere' },
  { adresse: 0x35C4A, nom: 'demolirUneBoutique', fn: demolirUneBoutique, arguments: 1, memoire: 'entiere' },
];

// Rien en attente : 0x30C65 est exercée par monorail-visiteurs.
export const enAttente = [];
