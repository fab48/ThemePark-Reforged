// La mise à jour des objets du parc (0x21681), les arrivées (0x283A6) et leurs auxiliaires.
//
// Réécriture lisible, prouvée identique à la transcription : voir docs/guide-reecriture.md.
//
// La boucle du parc (0x11C45) fait, à chaque image, un ou plusieurs pas de simulation selon la vitesse
// du jeu ([0xD6634]) ; à chaque pas, elle appelle le calendrier (0x12B1F), puis 0x21681, qui confie
// chaque objet du parc à la routine de son type et de son état, puis 0x283A6, qui fait arriver un bus
// de visiteurs quand le précédent est reparti. Ce module réécrit ces deux fonctions, ce qui crée le
// bus et les visiteurs, et les routines d'état qu'aucun autre module ne réécrit :
//
//   0x21681  mettreAJourLesObjets     l'aiguillage de tous les objets, et les comptes du passage
//   0x283A6  faireArriverLeBus        les arrivées
//   0x67CD4  compterLesArrivants      combien de visiteurs amène le bus
//   0x6128F  lancerLeBus              le bus repart de l'entrée de la carte
//   0x2845A  creerUnVisiteur          un visiteur neuf, dans le bus
//   visiteurs :
//   0x2293A  chercherSonChemin        état 6    il cherche une allée
//   0x2276C  attendreUnChemin         état 0x20 il n'a pas de chemin vers la sortie
//   0x2634B  jouerAuJeuDAdresse       état 0x16 il joue à un jeu d'adresse
//   0x65A20  voler                    états 0x32, 0x44, 0x46 : projeté par un incident, il vole
//   0x253BD  seRelever                état 0x42 retombé sur l'herbe, il se relève et s'en va
//   0x66189  projeterUnVisiteur       l'incident qui le projette
//   0x28752  quitterLeParc            son départ est compté, et son objet effacé
//   0x28671  prendreLaFigureDeMarche  la figure de marche d'un visiteur ou d'un employé
//   personnel :
//   0x617E0  commencerLEntretien      état 0x16 l'agent d'entretien embauché cherche où travailler
//   0x33742  fermerPourReparer        état 0xC  le mécanicien ferme l'attraction et pose ses barrières
//   0x33AF3  reparer                  état 0xE  il répare
//   0x33BF1  rouvrirLAttraction       état 0x10 il enlève ses barrières et rouvre
//   0x33F14  retournerAuRepos         état 0x14 il erre jusqu'à une case d'herbe libre
//   0x33E3F  repartirAuHasard         il part au hasard (fin de travail, ou appel sans objet)
//   0x31668  fermerLAttraction        une attraction fermée : ses passagers descendent, sa file part
//   0x2053E  objetDansLEtat           le premier objet d'un type et d'un état sur une case
//
// Ce qui est établi l'est par ce que lisent et écrivent ces fonctions, par une sonde posée pendant
// les scénarios, et par les modules voisins (docs/retro-ingenierie.md § 10) ; le reste est dit « non
// établi ».
//
// Vérification. Les 21 fonctions sont exercées par les scénarios (0x28671 et 0x617E0 par
// construction.json seulement) ; ce que chacune n'y parcourt pas est dit en tête de la fonction. Ces
// chemins-là ont été comparés à part, sur des états fabriqués (des objets du parc modifiés en cours de
// simulation, la fonction d'origine et la réécriture exécutées depuis le même état, la mémoire
// entière, eax et l'octet E' − 24 comparés) : sans divergence, et tous atteints, hormis ceux qui ne
// peuvent pas l'être (dits dans leur fonction) et, dans 0x21681, quelques états sans routine, où rien
// n'est fait. Ce n'est pas une preuve au sens du guide.
//
// --- La pile : l'octet que relit l'état 4 des visiteurs ------------------------------------------------
//
// 0x21681 appelle la routine de chaque objet à une hauteur de pile fixe : son point d'entrée E moins ses
// registres sauvés (ebx, esi, edi, 12 octets), son ebp (4) et ses variables (0x20), soit E − 48, d'où
// il empile l'objet puis son adresse de retour ; la routine entre avec esp = E − 56. L'état 4 des
// visiteurs (0x223C1) lit, sans l'avoir écrit, l'octet E' − 24 sous son propre point d'entrée E' : il
// y trouve ce qu'a laissé la routine appelée juste avant, pour un autre objet (journal des essais,
// § 5.6). La réécriture de 0x21681 appelle donc chaque routine à la hauteur et avec l'adresse de retour
// de l'original (jeu.appelerDepuis), et chaque routine réécrite ici laisse en E' − 24 l'octet de
// l'original : celui de sa variable [ebp-8] quand elle en a une (toutes, sauf 0x253BD), sinon
// l'octet trouvé en entrant (voir Reste).
//
// --- Les objets du parc --------------------------------------------------------------------------------
//
// Enregistrements de 200 octets, de [0xD3B10] + 200 à [0xD3B78] exclu (§ 6.4) : +0 et +2 les objets
// précédent et suivant sur la case, +4 le type, +6 et +8 la position en 256es de case (colonne +7,
// rangée +9, 0x80 le milieu de la case), +A l'objet graphique affiché, +C l'état, +D l'état suivant,
// +12 la direction (0 rangée − 1, 1 colonne + 1, 2 rangée + 1, 3 colonne − 1), +13 la vitesse en 256es
// de case par pas, +14 un compte à rebours, +16 un genre ou un autre objet. Le reste, par type, aux
// fonctions qui s'en servent.

import { recalerAuMilieuDeLaCase, renoncerAErrer } from './corrections.js';   // hors du jeu d'origine (reglages.js)
import { limiteDesVisiteurs, plafondDesPresents } from './table-des-objets.js';   // de même

const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

// Accès à la mémoire du jeu, petit-boutiste.
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);
const ajouterAuMot = (jeu, a, v) => poserMot(jeu, a, mot(jeu, a) + v);

// La division entière du processeur (idiv) : tronquée vers zéro ; un diviseur nul ou un quotient qui
// déborde lèvent une exception, comme dans la transcription.
function idiv(a, b) {
  if (b === 0) throw new Error('division par zero');
  const q = Math.trunc(a / b);
  if (q > 0x7FFFFFFF || q < -0x80000000) throw new Error('debordement de division');
  return q;
}

// --- Le temps --------------------------------------------------------------------------------------------
const PASSAGE = 0xD3AF8;           // mot long : les passages de 0x21681, un par pas
const PAS_DE_SIMULATION = 0xD3AFC; // mot long : 1 000 pas par mois
const METEO = 0xB14CC;             // octet : le temps qu'il fait, posé par 0x12B1F (personnel.js)

// --- Le joueur en cours et ses fiches (docs/retro-ingenierie.md § 10.8) ----------------------------------
const JOUEUR = 0xD665C;            // mot : le joueur dont le parc est simulé
const FICHE_DU_JOUEUR = 0xD3808;   // pointeur : sa fiche, dans [0xD3B00], 0x222 octets
const COMPTES = 0xD3814;           // pointeur : les comptes du parc, 0xD443C + joueur × 0x6C2
const FICHE_DU_PARC = 0xD3818;     // pointeur : la fiche du parc, 0xCF1E0 + joueur × 0x250
const FICHES_DES_JOUEURS = 0xD3B00, TAILLE_FICHE_JOUEUR = 0x222;
const FICHES_DES_PARCS = 0xCF1E0, TAILLE_FICHE_PARC = 0x250;
const COMPTES_DES_PARCS = 0xD443C, TAILLE_COMPTES = 0x6C2;
// Les pays (fin-annee.js) : 0x1C octets par pays, désigné par l'octet signé +5 de la fiche du joueur.
const PAYS = 0xB7B38, TAILLE_PAYS = 0x1C;

// Les comptes du parc tenus ici, des mots remis à zéro à chaque passage de 0x21681 (sauf +62E) puis
// comptés objet par objet ; la barre des messages (0x5CBDB) lit les quatre derniers, 0x4091A les
// visiteurs neutres et contents.
const MECONTENTS = 0x2B4, NEUTRES = 0x2B6, CONTENTS = 0x2B8;   // visiteurs payants, par humeur
const EGARES = 0x632;              // les visiteurs dans l'état 6 (qui cherchent une allée)
const PARTANTS = 0x630;            // les visiteurs dans l'état 0x40 (qui vont vers la sortie)
const SANS_CHEMIN = 0x634;         // les visiteurs dans l'état 0x20 (sans chemin)
const VISITEURS_DES_FILES = 0x62E; // la somme des mots +2A des attractions (les visiteurs qui ont
                                   // rejoint leur file), faite quand le compte des passages est un
                                   // multiple de 64, remise à zéro quand le pas de simulation en est un
const NUMERO_DU_BUS = 0x2BE;       // mot : l'objet du bus, le même d'un voyage à l'autre
const ENTREE_DU_PARC = 0x2CA;      // mot : la case de l'entrée (colonne + 64 × rangée)

// --- Les objets ------------------------------------------------------------------------------------------
const OBJETS = 0xD3B10, FIN_DES_OBJETS = 0xD3B78, TAILLE_OBJET = 200;
const VISITEUR = 2, ATTRACTION = 4, KIOSQUE = 6, PERSONNEL = 8, BOUTIQUE = 0xA, VEHICULE = 0xE;
const MORCEAU_DE_VOIE = 0x12, DECOR = 0x14, VOYOU = 0x1A, AUTRE_KIOSQUE = 0x1C;
const OBJETS_GRAPHIQUES = 0xD3B80; // pointeur : 8 octets par objet graphique ; +5 bit 0 la dernière
                                   // image d'une animation, +6 l'image suivante
const FIGURES = 0xD3B38;           // pointeur : table de mots, numéro de figure → objet graphique
// Les allures des visiteurs : 0x24 octets par genre de visiteur (+59), des numéros de figures. +0 la
// marche (plus la direction), +2 le circuit, +0x12, +0x1E, +0x20, +0x22 celles d'un visiteur projeté.
const ALLURES = 0xB49F4, TAILLE_ALLURE = 0x24;
const ALLURE_CIRCUIT = 0x2, ALLURE_A_TERRE = 0x12, ALLURE_EN_VOL = 0x1E, ALLURE_REBOND = 0x20;
const ALLURE_CULBUTE = 0x22;
// Le catalogue des métiers (personnel.js) : 0x36 octets par métier (+59 de l'employé), +0x26 la
// première figure de la marche, +0x2C l'état d'embauche (0x16 l'agent d'entretien).
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;
const CATALOGUE_DES_ATTRACTIONS = 0xCCED0;   // fiches de 200 octets, désignées par le mot +16
const CATALOGUE_DES_BOUTIQUES = 0xD3C62;     // fiches de 107 octets, désignées par le mot +16

// --- La carte ----------------------------------------------------------------------------------------------
const CARTE = 0xD3B08, FIN_DE_LA_CARTE = 0xD3B04;  // 64 × 64 cellules de 4 octets : +0 le premier
                                                   // objet de la case, +2 l'image du sol
const SOLS = 0xB44D9;              // fiches des sols, 4 octets : +0 un mot de drapeaux, +3 la forme
const FORMES = 0xB44DC;
const SOL_ALLEE = 0x02;
const VOISINES = 0xB4920;          // mots signés : la case voisine dans la direction d (−64, +1, +64, −1)
const PAS_X = 0xB4932, PAS_Y = 0xB4933;   // octets signés, par paires : le pas de la direction d
const DIRECTIONS_OPPOSEES = 0xB48EC;      // mots : la direction opposée à d
const DIRECTIONS_DES_ALLEES = 0xB4990;    // forme d'une allée → masque des directions ouvertes
const DIRECTION_DU_MASQUE = 0xB4970;      // masque → une direction ouverte

// --- Les fonctions appelées ----------------------------------------------------------------------------------
const HASARD = 0x18B92;
const DIVISION_PAR_ZERO = 0x19ED3;     // vitesse nulle : rend 1, efface la demande de sortie
const PLACER = 0x18A44;                // (objet, x, y) : rend 1 s'il a changé de case
const PLACER_EN_QUEUE = 0x18ADF;
const POSER_EN_TETE = 0x185C1;         // (objet, x, y) : l'inscrire sur la liste de sa case
const DEPLACER_ET_RANGER = 0x1864A;    // (objet, x, y), personnel.js : rend 1 s'il a changé de case
const EFFACER_L_OBJET = 0x18B62;       // le retirer de sa case, et remettre ses 200 octets à zéro
const OBJET_SUR_LA_CASE = 0x204B9;     // (cellule, type) : le premier objet de ce type, ou 0
const CHEMIN = 0x349EB;                // (objet, limite, masque) : la direction vers +56, +57 (0 à 3),
const ARRIVE = 4;                      //   4 à l'arrivée, négative s'il est bloqué
const CHOISIR_UNE_DESTINATION = 0x22834;   // visiteurs.js : pose +56, +57, ou le renvoie chez lui
const HUMEUR = 0x672A5;
const INSCRIRE_AU_LIVRE = 0x78943;     // (catégorie, montant) : le livre des comptes
const PARCOURIR_LES_ALLEES = 0x62FEA;  // personnel.js : l'état 0x18 de l'agent d'entretien
const APPELER_LE_SUIVANT = 0x32142;    // (visiteur, attraction), visiteurs-etats-b.js
const DESCENDRE_DE_L_ATTRACTION = 0x31F95;   // (visiteur, attraction), visiteurs-etats-a.js
const FERMER_LE_MONORAIL = 0x448BA;    // non étudiée : la fermeture propre au MONORAIL
// Les fonctions réécrites ici, appelées elles aussi par leur adresse.
const COMPTER_LES_ARRIVANTS = 0x67CD4, LANCER_LE_BUS = 0x6128F, CREER_UN_VISITEUR = 0x2845A;
const QUITTER_LE_PARC = 0x28752, PRENDRE_LA_FIGURE_DE_MARCHE = 0x28671;
const REPARTIR_AU_HASARD = 0x33E3F, FERMER_L_ATTRACTION = 0x31668, OBJET_DANS_L_ETAT = 0x2053E;

// --- Outils ------------------------------------------------------------------------------------------------

const baseDesObjets = (jeu) => long(jeu, OBJETS);
// L'objet numéro n (n non signé ici : les mots +16, +1E, +47 sont lus sans signe).
const objet = (jeu, n) => (baseDesObjets(jeu) + n * TAILLE_OBJET) >>> 0;
// L'objet numéro n, n signé : les listes des cases s'arrêtent sur 0 ou sur un décor (négatif), ce
// que le programme teste en comparant l'adresse au début de la table, sans signe.
const objetSigne = (jeu, n) => (baseDesObjets(jeu) + s16(n) * TAILLE_OBJET) >>> 0;
// Le numéro d'un objet d'après son adresse (idiv du programme).
const numeroDObjet = (jeu, o) => idiv((o - baseDesObjets(jeu)) | 0, TAILLE_OBJET);

const cellule = (jeu, colonne, rangee) => (long(jeu, CARTE) + (rangee * 64 + colonne) * 4) >>> 0;
const celluleDe = (jeu, o) => cellule(jeu, octet(jeu, o + 7), octet(jeu, o + 9));
const drapeauxDuSol = (jeu, c) => mot(jeu, SOLS + octet(jeu, c + 2) * 4);

const objetGraphique = (jeu, numero) => (long(jeu, OBJETS_GRAPHIQUES) + numero * 8) >>> 0;
const figure = (jeu, numero) => mot(jeu, long(jeu, FIGURES) + numero * 2);

// L'animation : l'objet prend l'image suivante de son objet graphique.
function imageSuivante(jeu, o) {
  poserMot(jeu, o + 0xA, mot(jeu, objetGraphique(jeu, mot(jeu, o + 0xA)) + 6));
}
// La dernière image d'une animation (bit 0 de l'octet +5 de l'objet graphique).
const derniereImage = (jeu, graphique) => (octet(jeu, objetGraphique(jeu, graphique) + 5) & 1) !== 0;

// La figure de marche d'un visiteur dans sa direction, et une autre figure de son allure.
function figureDeMarche(jeu, v) {
  return figure(jeu, mot(jeu, ALLURES + octet(jeu, v + 0x59) * TAILLE_ALLURE) + octet(jeu, v + 0x12));
}
function figureDAllure(jeu, v, champ) {
  return figure(jeu, mot(jeu, ALLURES + champ + octet(jeu, v + 0x59) * TAILLE_ALLURE));
}

// La figure de marche d'un employé : 0xBA + direction (le mécanicien qui marche).
const figureDuMecanicienQuiMarche = (jeu, m) => mot(jeu, long(jeu, FIGURES) + 0x174 + octet(jeu, m + 0x12) * 2);

// Combien de pas pour traverser une case : 0x100 / vitesse. Une vitesse nulle n'est pas divisée : le
// programme appelle alors 0x19ED3, qui rend 1 (étendu avec son signe).
function pasParCase(jeu, o) {
  recalerAuMilieuDeLaCase(jeu, o);   // hors du jeu d'origine : corrections.js, éteint par défaut
  const vitesse = octet(jeu, o + 0x13);
  return vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : (0x100 / vitesse) | 0;
}

// La position après un pas dans la direction de l'objet, sur 16 bits comme dans le programme.
function pasSuivant(jeu, o) {
  const d = octet(jeu, o + 0x12), vitesse = octet(jeu, o + 0x13);
  return [u16(mot(jeu, o + 6) + octetSigne(jeu, PAS_X + 2 * d) * vitesse),
          u16(mot(jeu, o + 8) + octetSigne(jeu, PAS_Y + 2 * d) * vitesse)];
}

// Le reste de pile d'une routine que 0x21681 appelle (voir « La pile ») : l'octet E' − 24, relevé à
// l'entrée ; la routine note l'octet bas de ce que l'original range dans sa variable [ebp-8] ; à la
// sortie, on y laisse le dernier noté, ou l'octet d'entrée si l'original n'y écrit pas — les appels de
// la réécriture, qui ne se font pas à la hauteur de l'original, ont pu l'écraser.
class Reste {
  constructor(jeu) {
    this.jeu = jeu;
    this.adresse = ((jeu.T.lireRegistre('esp') >>> 0) - 24) >>> 0;
    this.octet = jeu.m8[this.adresse];
  }

  noter(valeur) {
    this.octet = valeur & 0xFF;
    return valeur;
  }

  laisser() {
    this.jeu.m8[this.adresse] = this.octet;
  }
}

// Une routine qui reçoit son reste en dernier argument.
function avecLeReste(routine) {
  return (jeu, ...args) => {
    const reste = new Reste(jeu);
    try {
      return routine(jeu, ...args, reste);
    } finally {
      reste.laisser();
    }
  };
}

// ==========================================================================================================
// 0x21681 — la mise à jour des objets du parc, de `debut` à `fin` exclu (la table entière : la boucle
// du parc passe [0xD3B10] + 200 et [0xD3B78]).
//
// D'abord les comptes du passage sont remis à zéro : les visiteurs payants par humeur, ceux qui
// cherchent une allée, qui vont vers la sortie, qui n'ont pas de chemin, que la suite compte objet par
// objet ; et, quand le pas de simulation est un multiple de 64, la somme des files (+62E). Le passage
// est compté (0xD3AF8).
//
// Puis chaque objet, selon son type (octet +4), est confié à la routine de son état (octet +C, le mode
// pour une attraction) ; un état sans routine ne fait rien. Voir les tables plus bas. Les visiteurs,
// les attractions et les boutiques ont en plus leur traitement ici :
//
//   - le visiteur : son délai de bulle (+B9) décompte ; s'il a payé l'entrée (+4F ≠ −1), il est compté
//     mécontent (contentement +54 au plus le seuil +2 de la fiche du parc, −100 dans la démo), neutre
//     (au plus le seuil +0, 200) ou content. Tous les 16 passages, si l'octet +77 de la fiche du parc
//     vaut 1, son contentement gagne (pas − mot long +78) / 128 + 1, 10 au plus : un bonus qui croît
//     depuis un moment noté en +78 (ce qu'est cet événement, non établi ; jamais dans les scénarios,
//     où +77 vaut 0). Tous les 16 passages aussi, s'il fait un temps particulier (météo 0xB14CC,
//     quatre bits bas non nuls) : avec le bit 3, contentement + météo / 4 + 1, fatigue (+82) −
//     (météo + 8), l'heure du dernier plaisir (+75) recule de météo / 2 + 8 ; sans lui, les visiteurs
//     qui n'ont pas le bit 7 de +5 (à l'abri ? non établi) perdent météo / 2 + 1 de contentement, et
//     gagnent 2 × météo + 8 de fatigue, l'heure du dernier plaisir avançant de météo + 8 ;
//   - l'attraction : quand le compte des passages est un multiple de 64, son mot +2A (les visiteurs
//     qui ont rejoint sa file) s'ajoute à la somme des files (+62E des comptes) ;
//   - la boutique : son animation avance tous les 4 passages ; sa dette (+38, en centaines, § 10.4)
//     est payée un mois (1 000 pas) après sa construction (+3E) : catégorie 1 du livre des comptes, et
//     la somme engagée du joueur (fiche +0xE) diminue d'autant.
//
// Un visiteur que sa routine a effacé (0x28752 remet ses 200 octets à zéro) passe quand même par le
// traitement du visiteur, sur un objet vide : son +4F nul le fait compter parmi les payants, et le
// temps peut modifier ses champs. Anomalie reproduite.
//
// Les routines sont appelées à la hauteur de pile et avec l'adresse de retour de l'original (voir « La
// pile ») ; l'appel du livre des comptes aussi. Rend l'adresse qui arrête la boucle (le premier objet
// au-delà de `fin`), comme l'original.
//
// Exercé par les cinq scénarios ; la dette d'une boutique, par construction.json (une fois) ; le temps
// qu'il fait, par simulation.json après 200 s (toujours sans le bit 3). Jamais exercés, et relus
// instruction par instruction : les objets de type 0x1A ; les états des visiteurs 0x28 à 0x2E, 0x36,
// 0x48 et 0x4A ; les modes d'attraction autres que 2, 4, 6, 0x1C et 0x1E ; les états du personnel de
// 0x1A à 0x32 et de 0x36 à 0x3F ; les états des véhicules 0x20 et 0x22 ; le bonus de +77 ; le temps
// qui a le bit 3.

// Les routines, par état : l'adresse de la routine et l'adresse de retour de son appel dans 0x21681.
const routine = (adresse, retour) => ({ adresse, retour });

// Les visiteurs (type 2). La table d'origine : les 36 états en 0x21723, les routines en 0x21747,
// l'aiguillage en 0x2185A. L'état 0x1C (dans le bus) n'a pas de routine.
const ROUTINES_DES_VISITEURS = new Map([
  [0x02, routine(0x2223B, 0x2186B)],   // descendu du bus, il gagne l'allée
  [0x04, routine(0x223C1, 0x2187C)],   // au guichet d'entrée
  [0x06, routine(0x2293A, 0x2188D)],   // il cherche une allée (ici)
  [0x08, routine(0x22E22, 0x218AA)],   // il se promène
  [0x0A, routine(0x243DD, 0x218BB)],   // il avance dans une file
  [0x0C, routine(0x24DFE, 0x218CC)],   // il fait la queue
  [0x0E, routine(0x24F41, 0x218DD)],   // à bord d'une attraction
  [0x10, routine(0x24F82, 0x218EE)],   // il en descend
  [0x12, routine(0x254D2, 0x218FF)],   // sur un circuit
  [0x14, routine(0x25E1B, 0x21910)],   // il va vers une boutique
  [0x16, routine(0x2634B, 0x21921)],   // au jeu d'adresse (ici)
  [0x18, routine(0x2641F, 0x21932)],   // il revient d'une boutique
  [0x1A, routine(0x273C8, 0x21943)],   // il s'arrête un instant
  [0x1E, routine(0x266D7, 0x2196A)],   // il va vers l'arrêt du bus
  [0x20, routine(0x2276C, 0x21959)],   // sans chemin (ici)
  [0x22, routine(0x2698E, 0x2197B)],   // il attend le bus
  [0x28, routine(0x64F03, 0x2199D)],   // non établi
  [0x2A, routine(0x64F03, 0x2199D)],   // non établi
  [0x2C, routine(0x65820, 0x2198C)],   // non établi
  [0x2E, routine(0x6521B, 0x219AE)],   // non établi
  [0x32, routine(0x65A20, 0x219BF)],   // projeté, il culbute (ici)
  [0x34, routine(0x24D4B, 0x219D0)],   // il fait avancer la file
  [0x36, routine(0x258D9, 0x219E1)],   // au volant
  [0x38, routine(0x25FE7, 0x219F2)],   // il attend son tour au comptoir
  [0x3A, routine(0x260F4, 0x21A03)],   // il est servi
  [0x3C, routine(0x27494, 0x21A14)],   // il montre son humeur
  [0x3E, routine(0x25339, 0x21A25)],   // une animation jouée une fois (vomir ?)
  [0x40, routine(0x22BA6, 0x21A36)],   // il va vers la sortie
  [0x42, routine(0x253BD, 0x21A50)],   // retombé sur l'herbe, il se relève (ici)
  [0x44, routine(0x65A20, 0x21A5E)],   // projeté, il vole (ici)
  [0x46, routine(0x65A20, 0x21A5E)],   // projeté hors du parc (ici)
  [0x48, routine(0x665AE, 0x21A6C)],   // non établi
  [0x4A, routine(0x272DE, 0x21A7A)],   // il entre dans une attraction sans file
  [0x4C, routine(0x275F3, 0x21A88)],   // il entre aux toilettes
  [0x4E, routine(0x2775A, 0x21A96)],   // aux toilettes
]);

// Les attractions (type 4), par mode (§ 10.3).
const ROUTINES_DES_ATTRACTIONS = new Map([
  [0x02, routine(0x2FB85, 0x21CB9)],   // à tours
  [0x04, routine(0x3006A, 0x21CCA)],   // à bouées
  [0x06, routine(0x41F3D, 0x21CDB)],   // à train
  [0x08, routine(0x420C7, 0x21CE9)],   // les routines des wagons : jamais pour une attraction
  [0x0A, routine(0x42392, 0x21CF7)],   //   dans les scénarios (vehicules.js)
  [0x1C, routine(0x30480, 0x21D05)],   // à voitures
  [0x1E, routine(0x30803, 0x21D13)],   // les spectacles
  [0x22, routine(0x43BAA, 0x21D21)],   // non établi (la routine des wagons du monorail)
  [0x24, routine(0x66976, 0x21D2F)],   // BOUNCY CASTLE après l'explosion
  [0x26, routine(0x66AFD, 0x21D3D)],   // PLANE FLYER après l'explosion
]);

// Le personnel (type 8), par état (personnel.js). La table d'origine : 31 états en 0x21D61, les routines
// en 0x21D80, l'aiguillage en 0x21E18. L'état 0x2A n'a pas de routine.
const ROUTINES_DU_PERSONNEL = new Map([
  [0x02, routine(0x326DA, 0x21E3A)],   // l'amuseur flâne
  [0x04, routine(0x32A06, 0x21E29)],   // il rejoint des visiteurs
  [0x06, routine(0x32BCF, 0x21E4B)],   // il les amuse
  [0x08, routine(0x33133, 0x21E5C)],   // le mécanicien attend une panne
  [0x0A, routine(0x33482, 0x21E6D)],   // il marche vers une case
  [0x0C, routine(0x33742, 0x21E7E)],   // il ferme l'attraction et pose ses barrières (ici)
  [0x0E, routine(0x33AF3, 0x21EA0)],   // il répare (ici)
  [0x10, routine(0x33BF1, 0x21E8F)],   // il enlève ses barrières et rouvre (ici)
  [0x12, routine(0x333CB, 0x21EB1)],   // l'appel reçu
  [0x14, routine(0x33F14, 0x21EC2)],   // il erre jusqu'à l'herbe (ici)
  [0x16, routine(0x617E0, 0x21ED3)],   // l'agent d'entretien embauché (ici)
  [0x18, routine(0x62FEA, 0x21EE4)],   // il parcourt les allées
  [0x1A, routine(0x62CBB, 0x21EF5)],   // hors des allées
  [0x1C, routine(0x638EF, 0x21F06)],   // il balaie
  [0x1E, routine(0x619BF, 0x21F17)],   // sur l'herbe
  [0x22, routine(0x629DB, 0x21F28)],   // non établi
  [0x24, routine(0x62B9C, 0x21F39)],   // non établi
  [0x26, routine(0x6369E, 0x21F4A)],   // il entre dans des toilettes
  [0x28, routine(0x63803, 0x21F5B)],   // il les nettoie
  [0x2C, routine(0x64641, 0x21F82)],   // non établis
  [0x2E, routine(0x64641, 0x21F82)],
  [0x30, routine(0x63A85, 0x21F71)],   // il suit sa tournée
  [0x32, routine(0x64641, 0x21F82)],
  [0x34, routine(0x34149, 0x21F90)],   // le gardien patrouille
  [0x36, routine(0x3455A, 0x21F9E)],   // il marche vers une case
  [0x38, routine(0x34728, 0x21FAC)],   // il escorte les voyous
  [0x3A, routine(0x3502B, 0x21FBA)],   // la grève : vers l'entrée,
  [0x3C, routine(0x35208, 0x21FC8)],   //   y manifester,
  [0x3E, routine(0x3542D, 0x21FD6)],   //   reprendre le travail ;
  [0x3F, routine(0x35652, 0x21FE4)],   // l'amuseur qui fuit un voyou (voyous.js)
]);

// Les véhicules (type 0xE), par état (vehicules.js).
const ROUTINES_DES_VEHICULES = new Map([
  [0x08, routine(0x420C7, 0x2206E)],   // wagon en gare
  [0x0A, routine(0x42392, 0x2207C)],   // wagon en marche
  [0x0C, routine(0x42E06, 0x2208A)],   // wagon dans un élément de plusieurs cases
  [0x14, routine(0x613CA, 0x22098)],   // bus en route
  [0x16, routine(0x6160D, 0x220A6)],   // bus à l'arrêt
  [0x18, routine(0x61772, 0x220B4)],   // bus qui attend
  [0x20, routine(0x43A33, 0x220C2)],   // wagon sorti de la voie
  [0x22, routine(0x43BAA, 0x220D0)],   // wagon du monorail
]);

// Les objets de type 0x1A (les voyous, vraisemblablement : les gardiens les arrêtent), états 1 à 10.
// Aucun dans les scénarios. La table d'origine : 0x22156, indexée par l'état − 1.
const ROUTINES_DES_VOYOUS = new Map([
  [1, routine(0x4C696, 0x221AA)], [2, routine(0x4C864, 0x221BB)], [3, routine(0x4C9DD, 0x221CC)],
  [4, routine(0x4D1CA, 0x221DA)], [5, routine(0x4D644, 0x221E8)], [6, routine(0x4D69C, 0x221F6)],
  [7, routine(0x4DA0C, 0x22204)], [8, routine(0x4D88D, 0x22212)], [9, routine(0x4DAD1, 0x22220)],
  [10, routine(0x4DD81, 0x2222E)],
]);

const RETOUR_DU_LIVRE = 0x22133;   // l'appel de 0x78943 pour la dette d'une boutique
// Ce que 0x21681 met sur la pile avant d'appeler : ebx, esi, edi, ebp et 0x20 octets de variables.
const CADRE_DE_LA_MISE_A_JOUR = 48;

export function mettreAJourLesObjets(jeu, debut, fin) {
  const pile = ((jeu.T.lireRegistre('esp') >>> 0) - CADRE_DE_LA_MISE_A_JOUR) >>> 0;
  const appeler = (r, ...args) => jeu.appelerDepuis(r.retour, pile, r.adresse, ...args);

  for (const compte of [MECONTENTS, NEUTRES, CONTENTS, EGARES, PARTANTS, SANS_CHEMIN]) {
    poserMot(jeu, long(jeu, COMPTES) + compte, 0);
  }
  if ((octet(jeu, PAS_DE_SIMULATION) & 0x3F) === 0) poserMot(jeu, long(jeu, COMPTES) + VISITEURS_DES_FILES, 0);
  poserLong(jeu, PASSAGE, long(jeu, PASSAGE) + 1);

  let o = debut >>> 0;
  for (; o < (fin >>> 0); o = (o + TAILLE_OBJET) >>> 0) {
    switch (octet(jeu, o + 4)) {
      case VISITEUR: {
        const etat = octet(jeu, o + 0xC);
        const r = ROUTINES_DES_VISITEURS.get(etat);
        if (r) appeler(r, o);
        if (etat === 0x06) compter(jeu, EGARES);
        if (etat === 0x40) compter(jeu, PARTANTS);
        apresLeVisiteur(jeu, o);
        break;
      }
      case ATTRACTION: {
        const r = ROUTINES_DES_ATTRACTIONS.get(octet(jeu, o + 0xC));
        if (r) appeler(r, o);
        if ((octet(jeu, PASSAGE) & 0x3F) === 0) ajouterAuMot(jeu, long(jeu, COMPTES) + VISITEURS_DES_FILES, mot(jeu, o + 0x2A));
        break;
      }
      case PERSONNEL: {
        const r = ROUTINES_DU_PERSONNEL.get(octet(jeu, o + 0xC));
        if (r) appeler(r, o);
        break;
      }
      case VEHICULE: {
        const r = ROUTINES_DES_VEHICULES.get(octet(jeu, o + 0xC));
        if (r) appeler(r, o);
        break;
      }
      case BOUTIQUE:
        mettreAJourUneBoutique(jeu, o, pile);
        break;
      case VOYOU: {
        const r = ROUTINES_DES_VOYOUS.get(octet(jeu, o + 0xC));
        if (r) appeler(r, o);
        break;
      }
      default:
        break;
    }
  }
  return o;
}

function compter(jeu, compte) {
  ajouterAuMot(jeu, long(jeu, COMPTES) + compte, 1);
}

// Après la routine d'un visiteur (0x21A99 à 0x21C08).
function apresLeVisiteur(jeu, v) {
  if (octet(jeu, v + 0xB9) !== 0) poserOctet(jeu, v + 0xB9, octet(jeu, v + 0xB9) - 1);

  if (octetSigne(jeu, v + 0x4F) !== -1) {
    const parc = long(jeu, FICHE_DU_PARC);
    const contentement = motSigne(jeu, v + 0x54);
    if (contentement <= motSigne(jeu, parc + 2)) compter(jeu, MECONTENTS);
    else if (contentement <= motSigne(jeu, parc + 0)) compter(jeu, NEUTRES);
    else compter(jeu, CONTENTS);
  }

  const parc = long(jeu, FICHE_DU_PARC);
  if (octet(jeu, parc + 0x77) === 1 && (octet(jeu, PASSAGE) & 0xF) === 0) {
    let bonus = (((long(jeu, PAS_DE_SIMULATION) - long(jeu, parc + 0x78)) >>> 0) >>> 7) + 1;
    if (u16(bonus) > 10) bonus = 10;
    poserMot(jeu, v + 0x54, mot(jeu, v + 0x54) + bonus);
  }

  const meteo = octet(jeu, METEO);
  if ((meteo & 0xF) === 0 || (octet(jeu, PASSAGE) & 0xF) !== 0) return;
  if (meteo & 8) {
    poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) + (meteo >> 2) + 1);
    poserMot(jeu, v + 0x82, mot(jeu, v + 0x82) - (meteo + 8));
    poserLong(jeu, v + 0x75, long(jeu, v + 0x75) - ((meteo >> 1) + 8));
  } else if (!(octet(jeu, v + 5) & 0x80)) {
    poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) - ((meteo >> 1) + 1));
    poserMot(jeu, v + 0x82, mot(jeu, v + 0x82) + 2 * meteo + 8);
    poserLong(jeu, v + 0x75, long(jeu, v + 0x75) + meteo + 8);
  }
}

// La boutique (0x220D8 à 0x22151) : l'animation, et la dette payée un mois après la construction.
function mettreAJourUneBoutique(jeu, b, pile) {
  if ((octet(jeu, PASSAGE) & 3) === 0) imageSuivante(jeu, b);
  if (mot(jeu, b + 0x38) === 0) return;
  if (((long(jeu, PAS_DE_SIMULATION) - long(jeu, b + 0x3E)) >>> 0) < 1000) return;
  jeu.appelerDepuis(RETOUR_DU_LIVRE, pile, INSCRIRE_AU_LIVRE, 1, Math.imul(-motSigne(jeu, b + 0x38), 100));
  const fiche = long(jeu, FICHE_DU_JOUEUR);
  poserLong(jeu, fiche + 0xE, long(jeu, fiche + 0xE) - Math.imul(motSigne(jeu, b + 0x38), 100));
  poserMot(jeu, b + 0x38, 0);
}

// ==========================================================================================================
// 0x283A6 — les arrivées : quand le bus est reparti (état 0x1A), il revient, plein.
//
// Le bus est un objet unique (son numéro dans le mot +2BE des comptes), réutilisé d'un voyage à
// l'autre. 0x67CD4 dit combien il amène de visiteurs, 0x6128F le relance depuis la case (63, 61) de la
// carte vers l'ouest (direction 3), et 0x2845A crée ses passagers sur cette case : chacun passe dans
// l'état 0x1C (dans le bus) et prend la tête de la liste des arrivants du bus (mot +47, chaîné par le
// +47 de chacun), que l'arrêt du bus (0x6160D) déposera. Plus de place dans la table des objets : le
// visiteur n'est pas créé.
//
// Rend, comme l'original, l'adresse du bus s'il n'est pas reparti, sinon le nombre de visiteurs tentés.
// Exercé par les cinq scénarios (le bus part au début de chaque partie, puis environ tous les 1 240
// pas) ; la table des objets pleine, relue instruction par instruction.
const CASE_D_ARRIVEE_DU_BUS = 0xF7F;   // colonne 63, rangée 61
const VERS_L_OUEST = 3;
const BUS_PARTI = 0x1A, DANS_LE_BUS = 0x1C;

export function faireArriverLeBus(jeu) {
  const bus = objet(jeu, mot(jeu, long(jeu, COMPTES) + NUMERO_DU_BUS));
  if (octet(jeu, bus + 0xC) !== BUS_PARTI) return bus;
  const nombre = s16(jeu.appeler(COMPTER_LES_ARRIVANTS));
  jeu.appeler(LANCER_LE_BUS, CASE_D_ARRIVEE_DU_BUS, VERS_L_OUEST);
  let k = 0;
  for (; s16(k) < nombre; k++) {
    const v = jeu.appeler(CREER_UN_VISITEUR, CASE_D_ARRIVEE_DU_BUS) >>> 0;
    if (v === 0) continue;
    poserOctet(jeu, v + 0xC, DANS_LE_BUS);
    poserMot(jeu, v + 0x47, mot(jeu, bus + 0x47));
    poserMot(jeu, bus + 0x47, numeroDObjet(jeu, v));
  }
  return k;
}

// ==========================================================================================================
// 0x67CD4 — combien de visiteurs amène le prochain bus. Il en range aussi le nombre dans l'octet +47 de
// la fiche du parc (le seuil de l'attrait du prix au guichet, 0x223C1) et dans l'octet +5EE des comptes,
// et fixe la vitesse des bus (octet +5CF des comptes) à 16.
//
// Le départ est l'attrait du prix d'entrée, calculé comme 0x6804A (visiteurs-outils.js) : a − (prix −
// j) × a / j, où a = octet +48 de la fiche du parc + octet signé +21, j = +4 × (+105 / 2 + +8A) / 128 ;
// attrait × 100 / octet +48 va au mot +2C0 des comptes (la barre des messages, 0x5CBDB, le compare à
// une série de paliers). Il est corrigé selon la taille du parc et son pays
// (la fiche 0xB7B38 + 0x1C × l'octet signé +5 de la fiche du joueur) : moins de 8 attractions, × (p3 +
// 200) / 700 si le mot +3 du pays est sous 500 ; moins de 16, × (p5 + 1 000) / 4 000 si le mot +5 est
// sous 3 000 ; sinon × (p7 + 2 000) / 7 000 si le mot +7 est sous 5 000. Dans la démo (pays 11 : 550,
// 1 500, 3 000 ; 22 attractions), × 5 000 / 7 000.
//
// Une retenue (mot +6C0 des comptes) le diminue. Elle ne bouge que si des visiteurs sont déjà repartis
// (mot long +6BC des comptes, et +6B8 les attractions qu'ils ont faites, 0x28752) : avec r, la part en
// pour cent des attractions du parc qu'un visiteur reparti a faites en moyenne, elle croît de 4 si r
// est nul, de 1 si le parc a moins de 10 attractions et r moins de 10 ; puis, si elle n'est pas nulle,
// elle décroît de 1 quand r dépasse 10. Les deux autres paliers de l'original, − 2 au-delà de 30 et − 4 au-delà de 50, ne sont jamais
// atteints : ils ne sont testés que quand r ne dépasse pas 10 (anomalie reproduite). Elle est bornée à
// 5/6 de l'octet +48, et à 0.
//
// Le nombre est borné à l'octet +48 de la fiche du parc, diminué de la retenue ; si les présents (mot
// +1F) le porteraient au-delà de 800, il est reporté au mot +33 et le bus arrive vide ; négatif, il
// devient 0. Un parc au mot long +8A (sa richesse, vraisemblablement) de 3 au plus n'attire personne.
//
// La fiche du parc est prise ici par la fiche du joueur (mot +2), l'octet +48 dans [0xD3818] ; dans les
// scénarios c'est la même. Le programme divise sans vérifier j, l'octet +48 ni le nombre d'attractions :
// une division par zéro lève une exception, reproduite.
//
// Le résultat. L'unique appelant n'en lit que le mot bas ; le mot haut d'eax est reproduit tel quel :
// sans visiteur possible (+8A ≤ 3), l'original ne pose que le mot bas de sa variable [ebp-8], et le mot
// haut est ce que la pile portait là ; ailleurs, la borne et la retenue sont prises avec le mot haut d'un
// pointeur (celui de la fiche du parc, puis celui des comptes), que la soustraction fait passer dans le
// résultat.
//
// Exercé : sans visiteur possible (+8A ≤ 3), au premier bus de chacun des cinq scénarios, et au second
// de parc.json et ecrans.json (le parc vide) ; le calcul entier, par demo.json, simulation.json et
// construction.json, dans le parc de la démo (22 attractions : la correction des parcs de 16
// attractions et plus ; le nombre toujours borné par l'octet +48 ; la retenue qui croît de 4, puis que
// r, jamais au-delà de 10, laisse en l'état). Jamais exercés, et relus instruction par instruction : les
// parcs de moins de 16 attractions, la retenue qui croît de 1 ou décroît, ses bornes, le report au-delà
// de 800, un nombre négatif. (Le plafond de 800 est tenu par table-des-objets.js, qui le relève avec
// plus de visiteurs.)

export function compterLesArrivants(jeu) {
  const pileALEntree = long(jeu, ((jeu.T.lireRegistre('esp') >>> 0) - 24) >>> 0);
  const comptes = long(jeu, COMPTES);
  const ficheDuJoueur = (long(jeu, FICHES_DES_JOUEURS) + octet(jeu, comptes + 0x40) * TAILLE_FICHE_JOUEUR) >>> 0;
  const parc = (FICHES_DES_PARCS + mot(jeu, ficheDuJoueur + 2) * TAILLE_FICHE_PARC) >>> 0;
  const pays = (PAYS + octetSigne(jeu, ficheDuJoueur + 5) * TAILLE_PAYS) >>> 0;
  poserOctet(jeu, long(jeu, COMPTES) + 0x5CF, 0x10);
  if (longSigne(jeu, parc + 0x8A) <= 3) return (pileALEntree & 0xFFFF0000) >>> 0;

  const plafond = () => octet(jeu, long(jeu, FICHE_DU_PARC) + 0x48);
  const attraitMaximal = () => plafond() + octetSigne(jeu, parc + 0x21);
  const prixDeReference = () => {
    const richesse = ((long(jeu, parc + 0x105) >>> 1) + long(jeu, parc + 0x8A)) | 0;
    return Math.imul(richesse, mot(jeu, parc + 4)) >>> 7;
  };
  const a = attraitMaximal();
  const ecart = (mot(jeu, parc + 0x1D) - prixDeReference()) | 0;
  let n = (a - idiv(Math.imul(ecart, attraitMaximal()), prixDeReference() | 0)) | 0;
  poserMot(jeu, long(jeu, COMPTES) + 0x2C0, idiv(Math.imul(s16(n), 100), plafond()));

  const attractions = octet(jeu, parc + 0x82);
  const corriger = (palier, limite, plus, diviseur) => {
    const p = mot(jeu, pays + palier);
    if (p < limite) n = idiv(Math.imul(s16(n), p + plus), diviseur);
  };
  if (attractions < 8) corriger(3, 500, 200, 700);
  else if (attractions < 16) corriger(5, 3000, 1000, 4000);
  else corriger(7, 5000, 2000, 7000);

  const retenue = long(jeu, COMPTES) + 0x6C0;
  if (longSigne(jeu, long(jeu, COMPTES) + 0x6BC) !== 0) {
    const moyenne = idiv(Math.imul(longSigne(jeu, long(jeu, COMPTES) + 0x6B8), 100),
      longSigne(jeu, long(jeu, COMPTES) + 0x6BC));
    const r = idiv(moyenne, octet(jeu, parc + 0x82));
    if (r === 0) poserMot(jeu, retenue, mot(jeu, retenue) + 4);
    else if (octet(jeu, parc + 0x82) < 10 && r < 10) poserMot(jeu, retenue, mot(jeu, retenue) + 1);
    if (mot(jeu, retenue) !== 0) {
      if (r > 10) poserMot(jeu, retenue, mot(jeu, retenue) - 1);
      else if (r > 30) poserMot(jeu, retenue, mot(jeu, retenue) - 2);   // jamais : r ≤ 10 ici
      else if (r > 50) poserMot(jeu, retenue, mot(jeu, retenue) - 4);   // jamais
    }
    const borne = idiv(plafond() * 5, 6);
    if (motSigne(jeu, retenue) > borne) poserMot(jeu, retenue, borne);
    if (motSigne(jeu, retenue) < 0) poserMot(jeu, retenue, 0);
  }

  if (plafond() < s16(n)) n = ((long(jeu, FICHE_DU_PARC) & 0xFFFF0000) | plafond()) | 0;
  n = (n - ((long(jeu, COMPTES) & 0xFFFF0000) | mot(jeu, long(jeu, COMPTES) + 0x6C0))) | 0;
  // (Avec plus de visiteurs, hors du jeu d'origine, le plafond vient de table-des-objets.js.)
  if (s16(n) + motSigne(jeu, parc + 0x1F) > plafondDesPresents(jeu)) {
    poserMot(jeu, parc + 0x33, mot(jeu, parc + 0x33) + n);
    n = 0;
  }
  if (s16(n) < 0) n = 0;
  poserOctet(jeu, parc + 0x47, n);
  poserOctet(jeu, long(jeu, COMPTES) + 0x5EE, n);
  return n;
}

// ==========================================================================================================
// 0x6128F — lancer le bus : il repart du milieu de la case `numeroDeCase` (colonne + 64 × rangée) dans
// la direction donnée, dans l'état 0x14 (en route, vehicules.js), à la vitesse fixée par 0x67CD4 (octet
// +5CF des comptes du joueur, lu ici par le numéro du joueur : 0xD4A0B + 0x6C2 × [0xD665C]). Sa longueur
// vient de l'octet +49 de la fiche du parc (2 dans la démo) : de 0 à 8, autant de sections de milieu
// (+26) sur le premier modèle (+A = 0, dessin-attractions.js) ; au-delà, le second modèle (+A = 1), avec
// 9 sections de moins. Il est inscrit sur la liste de sa case.
//
// Rend le numéro de l'objet du bus, ou 0 si son adresse est nulle (jamais : la table n'est pas en 0).
// Exercé par les cinq scénarios ; la vitesse nulle, le second modèle et l'adresse nulle, relus
// instruction par instruction.
export function lancerLeBus(jeu, numeroDeCase, direction) {
  const bus = objet(jeu, mot(jeu, long(jeu, COMPTES) + NUMERO_DU_BUS));
  if (bus === 0) return 0;
  const n = u16(numeroDeCase);
  poserOctet(jeu, bus + 4, VEHICULE);
  poserOctet(jeu, bus + 7, n % 64);
  poserOctet(jeu, bus + 9, n >> 6);
  poserOctet(jeu, bus + 6, 0x80);
  poserOctet(jeu, bus + 8, 0x80);
  poserOctet(jeu, bus + 0x13, octet(jeu, COMPTES_DES_PARCS + 0x5CF + mot(jeu, JOUEUR) * TAILLE_COMPTES));
  poserOctet(jeu, bus + 0xC, 0x14);
  poserOctet(jeu, bus + 0x12, direction);
  poserMot(jeu, bus + 0x14, pasParCase(jeu, bus));
  poserMot(jeu, bus + 0x26, octet(jeu, long(jeu, FICHE_DU_PARC) + 0x49));
  if (mot(jeu, bus + 0x26) >= 9) {
    poserMot(jeu, bus + 0xA, 1);
    poserMot(jeu, bus + 0x26, mot(jeu, bus + 0x26) - 9);
  } else {
    poserMot(jeu, bus + 0xA, 0);
  }
  jeu.appeler(POSER_EN_TETE, bus, mot(jeu, bus + 6), mot(jeu, bus + 8));
  return numeroDObjet(jeu, bus);
}

// ==========================================================================================================
// 0x2845A — créer un visiteur au milieu de la case `numeroDeCase`, dans le premier emplacement libre de
// la table des objets (type 0) ; les 100 derniers emplacements ne sont jamais pris. Rend son adresse, ou
// 0 s'il n'y a pas de place.
//
// Le visiteur neuf : type 2 ; son argent (+6F) vaut le mot +3E des comptes moins 0 à 127 au hasard — ce
// mot est nul dans la partie de la démo, et l'argent, sur 16 bits, y vaut donc 65 409 à 65 536 ; sa
// vitesse (+13) 8 ou 16 au hasard ; +4F à −1 (il n'a pas encore payé) ; son contentement (+54) (2 −
// octet 0xD66F2) × 50, 100 dans la démo (0xD66F2 : non établi, un niveau de difficulté
// vraisemblablement) ; l'heure de son arrivée (+5B) et de son dernier plaisir (+75) ; +8B à 0 ; un genre
// de visiteur (+59) de 0 à 7 au hasard. Un visiteur du genre 0 prend en plus le bit 2 de +5 (sa
// silhouette à part, visiteurs-etats-a.js) avec une chance de q / 256, q = prix / 128 − (octet signé
// +21) / 2 + mot +9F de la fiche du parc, 32 au plus : d'autant plus que l'entrée est chère ; ce qu'il
// représente, non établi. Il prend la figure de marche de sa direction (+12), qui n'est pas posée : c'est
// celle qu'avait l'objet effacé qui occupait l'emplacement. Il est inscrit sur la liste de sa case.
//
// Le hasard est tiré trois fois, quatre pour le genre 0. L'original calcule aussi l'adresse de la fiche
// du pays du joueur, sans s'en servir : non transcrit.
//
// Exercé par demo.json, simulation.json et construction.json. Jamais exercés, et relus instruction par
// instruction : la table pleine, et la silhouette à part — dans la démo, q vaut −2 (prix 50, octet +21
// à 5, mot +9F nul) : aucune chance.
const EMPLACEMENTS_RESERVES = 100;

export function creerUnVisiteur(jeu, numeroDeCase) {
  const n = u16(numeroDeCase);
  // (Avec la table agrandie, hors du jeu d'origine, la limite vient de table-des-objets.js.)
  const limite = () => limiteDesVisiteurs(jeu, (long(jeu, FIN_DES_OBJETS) - EMPLACEMENTS_RESERVES * TAILLE_OBJET) >>> 0);
  for (let v = (baseDesObjets(jeu) + TAILLE_OBJET) >>> 0; limite() > v; v = (v + TAILLE_OBJET) >>> 0) {
    if (octet(jeu, v + 4) !== 0) continue;
    poserOctet(jeu, v + 4, VISITEUR);
    poserOctet(jeu, v + 7, n % 64);
    poserOctet(jeu, v + 9, n >> 6);
    poserOctet(jeu, v + 6, 0x80);
    poserOctet(jeu, v + 8, 0x80);
    poserMot(jeu, v + 0x6F, mot(jeu, long(jeu, COMPTES) + 0x3E) - (u16(jeu.appeler(HASARD)) % 128));
    poserOctet(jeu, v + 0x13, (u16(jeu.appeler(HASARD)) % 2) * 8 + 8);
    poserOctet(jeu, v + 0x4F, 0xFF);
    poserMot(jeu, v + 0x54, (2 - octet(jeu, 0xD66F2)) * 50);
    poserLong(jeu, v + 0x5B, long(jeu, PAS_DE_SIMULATION));
    poserLong(jeu, v + 0x75, long(jeu, PAS_DE_SIMULATION));
    poserOctet(jeu, v + 0x8B, 0);
    poserOctet(jeu, v + 0x59, u16(jeu.appeler(HASARD)) % 8);
    if (octet(jeu, v + 0x59) === 0) {
      const parc = long(jeu, FICHE_DU_PARC);
      const prix = mot(jeu, parc + 0x1D);
      let chance = ((prix >> 7) - Math.trunc(octetSigne(jeu, parc + 0x21) / 2) + mot(jeu, parc + 0x9F)) | 0;
      if (s16(chance) > 0x20) chance = 0x20;
      if ((u16(jeu.appeler(HASARD)) % 256) < s16(chance)) poserOctet(jeu, v + 5, octet(jeu, v + 5) | 4);
    }
    poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
    jeu.appeler(POSER_EN_TETE, v, mot(jeu, v + 6), mot(jeu, v + 8));
    return v;
  }
  return 0;
}

// ==========================================================================================================
// 0x2293A — l'état 6 : le visiteur cherche une allée.
//
// Il avance tout droit, son animation un pas sur quatre, et décompte (+14). Au bout du compte, son
// humeur est mise à jour (0x672A5) et il demande son chemin vers la case qu'il vise (+56, +57 ; masque
// d'obstacles 0x29CD, limite 150). Arrivé, ou bloqué : 0x22834 lui choisit une autre destination, et
// il redemande au pas suivant (compte à 1), sans avancer. Sur une allée qui s'ouvre quelque part, il se
// remet à se promener (état 8, 0x22E22) : il garde la direction du chemin si elle est ouverte,
// sinon il prend celle que la table 0xB4990 ouvre ; il oublie le contournement d'obstacle (bits 0x30 de
// +5). Ailleurs, il prend la direction du chemin, et avance.
//
// Anomalie reproduite : pour savoir si la direction du chemin est ouverte sur l'allée, le programme
// teste la direction elle-même (0 à 3) contre le masque des directions ouvertes, et non son bit : vers
// le haut (0), jamais ouverte ; vers la droite (1), ouverte si le haut l'est ; vers le bas (2), si la
// droite l'est ; vers la gauche (3), si le haut ou la droite l'est.
//
// Rend 1 quand il retrouve une allée, 0 sinon. Le reste : l'original range dans [ebp-8] la position
// verticale après le pas, quand il y en a un. Exercé par simulation.json (3 428 appels), toutes les
// voies sauf la vitesse nulle, relue instruction par instruction.
const MASQUE_DES_EGARES = 0x29CD, LIMITE_DU_CHEMIN = 150;

export function chercherSonChemin(jeu, v, reste) {
  if ((octet(jeu, PASSAGE) & 3) === 0) imageSuivante(jeu, v);
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (motSigne(jeu, v + 0x14) <= 0) {
    jeu.appeler(HUMEUR, v);
    poserMot(jeu, v + 0x14, pasParCase(jeu, v));
    const d = s16(jeu.appeler(CHEMIN, v, LIMITE_DU_CHEMIN, MASQUE_DES_EGARES));
    if (d === ARRIVE || d < 0) {
      jeu.appeler(CHOISIR_UNE_DESTINATION, v);
      poserMot(jeu, v + 0x14, 1);
      return 0;
    }
    const sol = octet(jeu, celluleDe(jeu, v) + 2);
    if (octet(jeu, SOLS + sol * 4) & SOL_ALLEE) {
      const ouvertes = octet(jeu, DIRECTIONS_DES_ALLEES + octet(jeu, FORMES + sol * 4));
      if (ouvertes !== 0) {
        poserMot(jeu, v + 0x14, 0);
        poserOctet(jeu, v + 0xC, 8);
        const direction = (d & ouvertes) !== 0 ? d : octet(jeu, DIRECTION_DU_MASQUE + ouvertes);
        poserOctet(jeu, v + 0x12, direction);
        poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
        poserOctet(jeu, v + 5, octet(jeu, v + 5) & 0xCF);
        return 1;
      }
    }
    poserOctet(jeu, v + 0x12, d);
    poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
  }
  const [x, y] = pasSuivant(jeu, v);
  reste.noter(y);
  jeu.appeler(PLACER, v, x, y);
  return 0;
}

// ==========================================================================================================
// 0x2276C — l'état 0x20 : le visiteur n'a pas de chemin vers la sortie. Il est compté (mot +634 des
// comptes), et tous les 50 passages il redemande son chemin (masque 0x29C1, limite 150) : s'il en a un,
// ou s'il est arrivé, il repasse dans l'état 6 (0x2293A). À chaque essai, son contentement est ramené au
// seuil des mécontents (mot +2 de la fiche du parc, −100 dans la démo).
//
// Rend 1 à chaque essai, 0 entre deux. Le reste : l'original range son résultat dans [ebp-8]. Exercé par
// simulation.json (471 appels) : l'attente, et le chemin retrouvé à chaque essai. Jamais exercés, et
// relus instruction par instruction : l'arrivée (4) et l'absence de chemin (négatif).
const MASQUE_DES_SANS_CHEMIN = 0x29C1, ATTENTE_SANS_CHEMIN = 50;

export function attendreUnChemin(jeu, v, reste) {
  return reste.noter(attendre(jeu, v));
}

function attendre(jeu, v) {
  compter(jeu, SANS_CHEMIN);
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (motSigne(jeu, v + 0x14) > 0) return 0;
  poserMot(jeu, v + 0x54, mot(jeu, long(jeu, FICHE_DU_PARC) + 2));
  poserMot(jeu, v + 0x14, ATTENTE_SANS_CHEMIN);
  const d = s16(jeu.appeler(CHEMIN, v, LIMITE_DU_CHEMIN, MASQUE_DES_SANS_CHEMIN));
  if (d >= 0 && d <= ARRIVE) {
    poserOctet(jeu, v + 0xC, 6);
    poserMot(jeu, v + 0x14, 0);
    poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
  }
  return 1;
}

// ==========================================================================================================
// 0x2634B — l'état 0x16 : le visiteur joue à un jeu d'adresse (boutique de la famille 8, § 10.4), sur la
// case de la boutique. La partie dure le temps de l'animation de la boutique, que 0x21681 fait avancer
// tous les 4 passages : quand l'image suivante sera la dernière, la boutique se libère (+47, le client
// en cours), reprend sa figure de repos (mot +2B de sa fiche au catalogue 0xD3C62) et le visiteur
// regagne l'allée (état 0x18, 0x2641F). Sans boutique sur sa case, rien.
//
// Rend 1 à la fin de la partie, 0 sinon. Le reste : l'original range dans [ebp-8] l'adresse de la fiche
// de la boutique. Exercé par simulation.json (119 appels) et construction.json (2), toutes les voies.
export function jouerAuJeuDAdresse(jeu, v, reste) {
  const boutique = jeu.appeler(OBJET_SUR_LA_CASE, celluleDe(jeu, v), BOUTIQUE) >>> 0;
  if (boutique === 0) return 0;
  const fiche = CATALOGUE_DES_BOUTIQUES + mot(jeu, boutique + 0x16);
  reste.noter(fiche);
  if ((octet(jeu, PASSAGE) & 3) !== 0) return 0;
  const suivante = mot(jeu, objetGraphique(jeu, mot(jeu, boutique + 0xA)) + 6);
  if (!derniereImage(jeu, suivante)) return 0;
  poserMot(jeu, boutique + 0x47, 0);
  poserMot(jeu, boutique + 0xA, figure(jeu, mot(jeu, fiche + 0x2B)));
  poserOctet(jeu, v + 0xC, 0x18);
  poserMot(jeu, v + 0x14, 0);
  return 1;
}

// ==========================================================================================================
// 0x66189 — un incident projette un visiteur : il quitte son attraction ou son véhicule (+47 à 0) et
// s'envole depuis l'objet `source`, à la vitesse 2 × `vitesse` + 16. Le compte des incidents (mot +A1
// de la fiche du parc) augmente. Rien si l'objet n'est pas un visiteur.
//
// Trois façons de voler, au hasard (un tiers chacune ; la troisième au lieu de la première pour les
// cas 3 et 5) :
//   - 0x32 : il culbute, avec 0 à 4 rebonds (+C4) ;
//   - 0x44 : il vole, sans rebond ;
//   - 0x46 : il vole hors du parc, sans rebond : à l'atterrissage il s'en va (0x28752).
// L'appelant dit le cas, qui fixe le point de départ et l'altitude (+5F, en pixels) :
//   0, 5  deux cases plus bas que la source, à 0x48 (0x65F71, 0x6662D l'explosion ; 0x258D9 le RACE
//         CAR RIDE) ;
//   1     sur la source, à la hauteur du morceau de voie de sa case × 0x18 + 0x30 (0x65D25, l'éjection
//         d'un wagon). Sans morceau de voie, le programme lit la hauteur à l'adresse 0x79 ;
//   2     sur la source, à la hauteur du morceau de voie de la case d'où elle vient (0x42392, 0x43BAA :
//         un wagon), 0x48 sans morceau ;
//   3     sur la source, à 0x48, avec la figure du circuit (0x65E3D, le canal) ;
//   4, et au-delà de 5 : aucun appelant ne les passe ; l'original part alors de deux variables qu'il n'a
//         pas écrites, reproduites en relisant la pile.
// Il monte avec une vitesse verticale (+65) de 10 à 19 au hasard, sa pesanteur (+34) à −1, et il est
// posé en queue de la liste de sa nouvelle case (0x18ADF). 0x65A20 le fait voler.
//
// Rend, comme l'original, l'adresse du visiteur si ce n'en est pas un, sinon ce que rend 0x18ADF.
// Exercé par simulation.json (12 appels) et construction.json (1), tous du cas 1 (le wagon usé du BIG
// DIPPER éjecte son passager dans une courbe), avec les trois façons de voler ; les autres cas, et
// l'objet qui n'est pas un visiteur, relus instruction par instruction.
const VOL_CULBUTE = 0x32, VOL = 0x44, VOL_HORS_DU_PARC = 0x46;
const ALTITUDE_DE_DEPART = 0x48;

export function projeterUnVisiteur(jeu, cas, v, source, vitesse) {
  // Les variables [ebp-4] et [ebp-8] de l'original (x et y du départ), que les cas 4 et au-delà de 5
  // lisent sans les avoir écrites.
  const entree = jeu.T.lireRegistre('esp') >>> 0;
  let x = long(jeu, (entree - 20) >>> 0), y = long(jeu, (entree - 24) >>> 0);

  if (octet(jeu, v + 4) !== VISITEUR) return v;
  const parc = long(jeu, FICHE_DU_PARC);
  poserMot(jeu, parc + 0xA1, mot(jeu, parc + 0xA1) + 1);
  poserMot(jeu, v + 0x47, 0);
  let facon = u16(jeu.appeler(HASARD)) % 3;
  if (facon === 0 && (u16(cas) === 3 || u16(cas) === 5)) facon = 2;
  if (facon === 0) {
    poserOctet(jeu, v + 0xC, VOL_CULBUTE);
    poserMot(jeu, v + 0xA, figureDAllure(jeu, v, ALLURE_CULBUTE));
    poserOctet(jeu, v + 0xC4, u16(jeu.appeler(HASARD)) % 5);
  } else {
    poserOctet(jeu, v + 0xC, facon === 1 ? VOL : VOL_HORS_DU_PARC);
    poserOctet(jeu, v + 0xB1, 0);
    poserOctet(jeu, v + 0xB2, 0);
    poserMot(jeu, v + 0xA, figureDAllure(jeu, v, ALLURE_EN_VOL));
    poserOctet(jeu, v + 0xC4, 0);
  }
  poserOctet(jeu, v + 0x13, 2 * vitesse + 0x10);

  const hauteurDeLaVoie = (morceau) => u16(octet(jeu, morceau + 0x79) * 0x18 + 0x30);
  switch (u16(cas)) {
    case 0:
    case 5:
      poserMot(jeu, v + 0x5F, ALTITUDE_DE_DEPART);
      x = mot(jeu, source + 6);
      y = u16(mot(jeu, source + 8) + 0x200);
      break;
    case 1: {
      const morceau = jeu.appeler(OBJET_SUR_LA_CASE, celluleDe(jeu, source), MORCEAU_DE_VOIE) >>> 0;
      poserMot(jeu, v + 0x5F, hauteurDeLaVoie(morceau));
      x = mot(jeu, source + 6);
      y = mot(jeu, source + 8);
      break;
    }
    case 2: {
      const derriere = motSigne(jeu, DIRECTIONS_OPPOSEES + octet(jeu, source + 0x12) * 2);
      const c = (celluleDe(jeu, source) + motSigne(jeu, VOISINES + derriere * 2) * 4) >>> 0;
      const morceau = jeu.appeler(OBJET_SUR_LA_CASE, c, MORCEAU_DE_VOIE) >>> 0;
      poserMot(jeu, v + 0x5F, morceau > baseDesObjets(jeu) ? hauteurDeLaVoie(morceau) : ALTITUDE_DE_DEPART);
      x = mot(jeu, source + 6);
      y = mot(jeu, source + 8);
      break;
    }
    case 3:
      poserMot(jeu, v + 0xA, figureDAllure(jeu, v, ALLURE_CIRCUIT));
      poserMot(jeu, v + 0x5F, ALTITUDE_DE_DEPART);
      x = mot(jeu, source + 6);
      y = mot(jeu, source + 8);
      break;
    default:
      break;
  }
  poserOctet(jeu, v + 0x65, (u16(jeu.appeler(HASARD)) % 10) + 10);
  poserOctet(jeu, v + 0x64, 0);
  poserMot(jeu, v + 0x34, 0xFFFF);
  return jeu.appeler(PLACER_EN_QUEUE, v, u16(x), u16(y));
}

// ==========================================================================================================
// 0x65A20 — les états 0x32, 0x44 et 0x46 : le visiteur projeté par un incident (0x66189) vole.
//
// L'altitude (+5F, en pixels) monte de la vitesse verticale (+65, signée), qui diminue à chaque pas de
// la pesanteur (+34, −1 au départ) ; l'animation avance trois pas de simulation sur quatre. En vol
// (+64 nul), il avance dans sa direction à sa vitesse (+13) — sur une diagonale fixe dans l'état 0x46,
// vitesse + 20 vers la droite et vitesse + 5 vers le bas ; posé (+64 non nul), il attend la fin de
// l'animation du rebond (et reprend, dans l'état 0x32, la figure de la culbute). Près du bord de la
// carte (colonne 1 ou 62, rangée 1 ou 55), sa vitesse tombe à 0.
//
// Quand l'altitude devient négative (mot de 0xFDE9 à 0xFFFF), il touche le sol : s'il lui reste des
// rebonds (+C4), il rebondit (vitesse verticale inversée, pesanteur doublée, figure du rebond, un
// rebond de moins) ; sinon, dans l'état 0x46 il quitte le parc (0x28752) ; ailleurs, sur un sol sans
// drapeau (l'herbe), il reste à terre (état 0x42, 0x253BD) ; sur tout autre sol, il quitte le parc.
//
// L'octet +B1 compte les pas du vol tant que l'octet +B2 est nul ; dans l'état 0x44, passé 15, +B2
// passe à 1 et +B1 redescend jusqu'à 0. Dans les autres états, +B2 reste ce que 0x66189 y a mis (0
// pour l'état 0x46 ; pour 0x32, ce qu'il valait avant). Ce que ce compte règle, non établi (le dessin,
// vraisemblablement).
//
// Rend dans al 0, le reste d'eax étant celui de l'adresse du visiteur, ou de ce qu'a rendu 0x28752. Le
// reste : l'original range dans [ebp-8] la position verticale visée. Exercé par simulation.json (484
// appels) et construction.json (39) : le vol dans les trois états, le bord de la carte, les trois
// atterrissages. Jamais exercés, et relus instruction par instruction : les rebonds (aucun visiteur de
// l'état 0x32 n'en avait) et l'attente posée qui les suit.
export function voler(jeu, v, reste) {
  if (octet(jeu, v + 0xB2) !== 0) {
    if (octet(jeu, v + 0xB1) > 0) poserOctet(jeu, v + 0xB1, octet(jeu, v + 0xB1) - 1);
  } else {
    const avant = octet(jeu, v + 0xB1);
    poserOctet(jeu, v + 0xB1, avant + 1);
    if (avant >= 0xF && octet(jeu, v + 0xC) === VOL) poserOctet(jeu, v + 0xB2, 1);
  }

  let x, y;
  if (octet(jeu, v + 0xC) === VOL_HORS_DU_PARC) {
    x = u16(octet(jeu, v + 0x13) + mot(jeu, v + 6) + 0x14);
    y = u16(octet(jeu, v + 0x13) + mot(jeu, v + 8) + 5);
  } else {
    [x, y] = pasSuivant(jeu, v);
  }
  reste.noter(y);
  if ((octet(jeu, PAS_DE_SIMULATION) & 3) !== 0) imageSuivante(jeu, v);

  if (octet(jeu, v + 0x64) === 0) {
    jeu.appeler(PLACER, v, x, y);
    poserOctet(jeu, v + 0x65, octet(jeu, v + 0x65) + octet(jeu, v + 0x34));
    poserMot(jeu, v + 0x5F, mot(jeu, v + 0x5F) + octetSigne(jeu, v + 0x65));
  } else if (derniereImage(jeu, mot(jeu, v + 0xA))) {
    if (octet(jeu, v + 0xC) === VOL_CULBUTE) poserMot(jeu, v + 0xA, figureDAllure(jeu, v, ALLURE_CULBUTE));
    poserOctet(jeu, v + 0x64, 0);
  }

  const colonne = octet(jeu, v + 7), rangee = octet(jeu, v + 9);
  if (colonne === 1 || colonne === 0x3E || rangee === 1 || rangee === 0x37) poserOctet(jeu, v + 0x13, 0);

  let eax = v;
  if (mot(jeu, v + 0x5F) > 0xFDE8) {
    poserMot(jeu, v + 0x5F, 0);
    if (octetSigne(jeu, v + 0xC4) > 0) {
      poserMot(jeu, v + 0xA, figureDAllure(jeu, v, ALLURE_REBOND));
      poserOctet(jeu, v + 0x65, -octet(jeu, v + 0x65));
      poserOctet(jeu, v + 0x64, 1);
      poserMot(jeu, v + 0x34, mot(jeu, v + 0x34) << 1);
      poserOctet(jeu, v + 0xC4, octet(jeu, v + 0xC4) - 1);
      poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) + 1);
    } else if (octet(jeu, v + 0xC) === VOL_HORS_DU_PARC) {
      eax = jeu.appeler(QUITTER_LE_PARC, v);
    } else if (drapeauxDuSol(jeu, celluleDe(jeu, v)) === 0) {
      poserMot(jeu, v + 0xA, figureDAllure(jeu, v, ALLURE_A_TERRE));
      imageSuivante(jeu, v);
      poserOctet(jeu, v + 0xC, 0x42);
      imageSuivante(jeu, v);
    } else {
      eax = jeu.appeler(QUITTER_LE_PARC, v);
    }
  }
  return (eax & 0xFFFFFF00) >>> 0;
}

// ==========================================================================================================
// 0x253BD — l'état 0x42 : le visiteur retombé sur l'herbe après un vol (0x65A20) joue son animation, une
// image à chaque pas sauf un sur 21. À la dernière image, il se relève et s'en va : état 0x40 (0x22BA6,
// vers la sortie), puis 6 ; il vise la case de l'entrée du parc (mot +2CA des comptes) trois rangées plus
// haut, une colonne à droite — une à gauche s'il est déjà dans la colonne de l'entrée ; vitesse 16,
// milieu de sa case, contentement à −1 000.
//
// Rend, comme l'original, l'adresse du visiteur quand il se relève, sinon celle de son objet graphique.
// Pas de reste à laisser : sans variable [ebp-8] ni appel, l'original ne touche pas à E' − 24. Exercé
// par simulation.json (30 appels) ; le visiteur déjà dans la colonne de l'entrée, relu instruction par
// instruction.
export function seRelever(jeu, v) {
  if (((long(jeu, PASSAGE) >>> 0) % 21) !== 0) imageSuivante(jeu, v);
  const graphique = objetGraphique(jeu, mot(jeu, v + 0xA));
  if (!(octet(jeu, graphique + 5) & 1)) return graphique;
  poserOctet(jeu, v + 0xC, 0x40);
  poserOctet(jeu, v + 0xD, 6);
  const entree = mot(jeu, long(jeu, COMPTES) + ENTREE_DU_PARC);
  poserOctet(jeu, v + 0x56, entree % 64);
  poserOctet(jeu, v + 0x57, (entree >> 6) - 3);
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
  poserOctet(jeu, v + 0x13, 0x10);
  poserMot(jeu, v + 0x14, 0);
  poserMot(jeu, v + 0x54, -1000);
  poserOctet(jeu, v + 6, 0x80);
  poserOctet(jeu, v + 8, 0x80);
  const dejaDansLaColonne = octet(jeu, v + 7) === octet(jeu, v + 0x56);
  poserOctet(jeu, v + 0x56, octet(jeu, v + 0x56) + (dejaDansLaColonne ? -1 : 1));
  return v;
}

// ==========================================================================================================
// 0x28752 — un objet quitte le parc. Un visiteur qui avait payé l'entrée (+4F ≠ −1) est compté : un
// présent de moins (mot +1F de la fiche du parc, s'il n'est pas nul), son contentement versé au bilan
// (+43), ses attractions faites (+81) et un départ de plus aux statistiques des comptes (+6B8, +6BC) ;
// son +4F repasse à −1. Un autre objet dont l'octet +4F n'est pas −1 perd son type. Puis l'objet est
// effacé (0x18B62 : retiré de sa case, ses 200 octets remis à zéro).
//
// Rend ce que rend 0x18B62. Exercé par simulation.json (10 appels) et construction.json (1) ; le cas
// d'un objet qui n'est pas un visiteur, relu instruction par instruction.
export function quitterLeParc(jeu, o) {
  if (octetSigne(jeu, o + 0x4F) !== -1) {
    if (octet(jeu, o + 4) === VISITEUR) {
      const parc = long(jeu, FICHE_DU_PARC);
      if (mot(jeu, parc + 0x1F) !== 0) poserMot(jeu, parc + 0x1F, mot(jeu, parc + 0x1F) - 1);
      poserLong(jeu, parc + 0x43, long(jeu, parc + 0x43) + motSigne(jeu, o + 0x54));
      const comptes = long(jeu, COMPTES);
      poserLong(jeu, comptes + 0x6B8, long(jeu, comptes + 0x6B8) + octet(jeu, o + 0x81));
      poserLong(jeu, comptes + 0x6BC, long(jeu, comptes + 0x6BC) + 1);
      poserOctet(jeu, o + 0x4F, 0xFF);
    } else {
      poserOctet(jeu, o + 4, 0);
    }
  }
  return jeu.appeler(EFFACER_L_OBJET, o);
}

// ==========================================================================================================
// 0x28671 — donner à un visiteur ou à un employé la figure de marche de sa direction (+12) : pour le
// visiteur, celle de son genre ; pour l'agent d'entretien sur l'herbe (état, ou état suivant, 0x1E), la
// figure 0xC3 + direction ; pour les autres employés, la première figure de marche de leur métier plus la
// direction. Les autres objets ne changent pas.
//
// Rend, comme l'original, l'adresse de l'objet, dont l'octet bas est remplacé par le type pour un objet
// qui n'est ni visiteur ni employé. Exercé par construction.json (1 appel, un agent d'entretien) ; le
// reste, relu instruction par instruction.
export function prendreLaFigureDeMarche(jeu, o) {
  const type = octet(jeu, o + 4);
  if (type === VISITEUR) {
    poserMot(jeu, o + 0xA, figureDeMarche(jeu, o));
    return o;
  }
  if (type !== PERSONNEL) return ((o & 0xFFFFFF00) | type) >>> 0;
  const metier = METIERS + octet(jeu, o + 0x59) * TAILLE_METIER;
  const direction = octet(jeu, o + 0x12);
  if (mot(jeu, metier + 0x2C) === 0x16 && (octet(jeu, o + 0xD) === 0x1E || octet(jeu, o + 0xC) === 0x1E)) {
    poserMot(jeu, o + 0xA, figure(jeu, 0xC3 + direction));
  } else {
    poserMot(jeu, o + 0xA, figure(jeu, mot(jeu, metier + 0x26) + direction));
  }
  return o;
}

// ==========================================================================================================
// 0x2053E — le premier objet de ce type et de cet état sur une case (l'adresse de sa cellule), ou 0 ; 0
// aussi pour une adresse hors de la carte. Type et état sont comparés comme des mots. Appelée par
// 0x33BF1, pour les barrières du mécanicien (type 0x14, état 2). Exercé par simulation.json (85 appels) ;
// l'adresse hors de la carte, relue instruction par instruction.
export function objetDansLEtat(jeu, c, type, etat) {
  c >>>= 0;
  if (c < long(jeu, CARTE) || c >= long(jeu, FIN_DE_LA_CARTE)) return 0;
  const base = baseDesObjets(jeu);
  for (let o = objetSigne(jeu, mot(jeu, c)); o > base; o = objetSigne(jeu, mot(jeu, o + 2))) {
    if (octet(jeu, o + 0xC) === u16(etat) && octet(jeu, o + 4) === u16(type)) return o;
  }
  return 0;
}

// ==========================================================================================================
// Le mécanicien (personnel.js : 0x33133 l'attend dans l'état 8, 0x333CB et 0x33482 le mènent à
// l'entrée de l'attraction usée, dont le kiosque est dans son mot +16 ; en arrivant, 0x33482 garde dans
// son octet +58 l'ouverture de l'attraction). Arrivé, il fait le tour de l'attraction en posant des
// barrières (état 0xC, 0x33742), la répare (0xE, 0x33AF3), refait le tour en enlevant les barrières
// (0x10, 0x33BF1), et s'en va (0x14, 0x33F14) jusqu'à une case d'herbe, où il attend la panne suivante
// (état 8).
//
// Le tour : la fiche du genre de l'attraction (catalogue 0xCCED0) décrit 22 étapes. L'étape i a une
// case, le mot +0x34 + 2 × i ajouté à celle de l'attraction (colonne + 64 × rangée) moins le mot +0x2A
// de la fiche, et un octet +0x8C + i, les côtés de cette case où poser une barrière (bit k, le côté k,
// voir BARRIERES) ; une étape sans barrière est sautée. Le mot long +20 du mécanicien compte les étapes
// faites. À chaque étape, il marche vers sa case (état 0xA, 0x33482), y reprend l'état noté dans +D (0xC
// à l'aller, 0x10 au retour), joue son animation, puis passe à l'étape suivante.
//
// Les barrières : des objets de type 0x14 dans l'état 2 (un décor animé), posés sur la case du
// mécanicien, au bord de la case (octets +6, +8) avec la figure du côté (table 0xB8CAE : haut (0x80,
// 0), figure 206 ; droite (0xFF, 0x80), 207 ; bas (0x80, 0xFF), 206 ; gauche (0, 0x80), 207).
const BARRIERES = 0xB8CAE;         // 4 octets par côté : +0 x, +1 y dans la case, +2 mot la figure
const ETAPES_DU_TOUR = 0x16;
const FIGURE_DU_MECANICIEN_QUI_ARRIVE = 0xCD;   // 0x19A / 2 : la figure prise à l'arrivée (+5F)
const FIGURE_DU_MECANICIEN_QUI_ATTEND = 0xC7;   // 0x18E / 2
const MARCHER = 0xA, FERMER = 0xC, REPARER = 0xE, ROUVRIR = 0x10, ERRER = 0x14, ATTENDRE_UNE_PANNE = 8;
// Les attractions que 0x33BF1 rouvre en rétablissant l'ouverture que le mécanicien a gardée dans son
// octet +58 (fermée par le joueur, elle le reste) : celles dont la figure +0x22 de la fiche est 0xDB
// (MONORAIL), 0x17 (ROLLER COASTER) ou 0x16 (BIG DIPPER) dans le catalogue de la démo — ni LOOP THE
// LOOP, ni CORK SCREW, ni WATER SPLASH. Les autres sont rouvertes (+4B = 1), même si le joueur les avait
// fermées.
const FIGURE_DU_MONORAIL = 0xDB;
const FIGURES_A_OUVERTURE_GARDEE = [0xDB, 0x17, 0x16];

const kiosqueDuMecanicien = (jeu, m) => objet(jeu, mot(jeu, m + 0x16));
const estUnKiosque = (jeu, k) => octet(jeu, k + 4) === KIOSQUE || octet(jeu, k + 4) === AUTRE_KIOSQUE;

// L'étape suivante du tour (0x339B2 à 0x33AE2, et de même 0x33D08 à 0x33E2E) : la première dont
// l'octet +0x8C n'est pas nul. Le mécanicien en prend la case pour cible, et marche. Rend faux quand
// le tour est fini (22 étapes).
function etapeSuivante(jeu, m, attraction, fiche) {
  for (;;) {
    const etape = long(jeu, m + 0x20);
    if (etape >= ETAPES_DU_TOUR) return false;
    if (octet(jeu, fiche + etape + 0x8C) !== 0) break;
    poserLong(jeu, m + 0x20, etape + 1);
  }
  const etape = long(jeu, m + 0x20);
  const origine = u16((octet(jeu, attraction + 9) << 6) + octet(jeu, attraction + 7) - mot(jeu, fiche + 0x2A));
  const cible = u16(origine + mot(jeu, fiche + ((etape * 2) >>> 0) + 0x34));
  poserOctet(jeu, m + 0x56, cible % 64);
  poserOctet(jeu, m + 0x57, cible >> 6);
  poserMot(jeu, m + 0x14, pasParCase(jeu, m));
  poserOctet(jeu, m + 0xC, MARCHER);
  poserMot(jeu, m + 0xA, figureDuMecanicienQuiMarche(jeu, m));
  poserLong(jeu, m + 0x20, long(jeu, m + 0x20) + 1);
  return true;
}

// ==========================================================================================================
// 0x33742 — l'état 0xC : le mécanicien, arrivé, ferme l'attraction et pose ses barrières.
//
// À chaque pas : il se marque (bit 3 de +5 ; sens non établi) ; le kiosque (+16) n'a plus de mécanicien
// appelé (+4D à 0) ; l'attraction est fermée — pour le MONORAIL, sa file est renvoyée (0x32142) et ses
// comptes remis à zéro ; pour les autres, 0x31668 fait descendre ses passagers et renvoie sa file — et
// passe en réparation (+4B = −1), le mécanicien inscrit dans son mot +61. Si l'objet de +16 n'est pas un
// kiosque, le mécanicien repart au hasard (0x33E3F), et la suite le traite pourtant comme un kiosque
// (anomalie reproduite, jamais vue).
//
// Son animation avance ; à sa dernière image, il n'est plus en route (bit 1 de +5), pose les barrières
// de l'étape qu'il vient d'atteindre (aucune en arrivant au kiosque), et passe à l'étape suivante ; le
// tour fini, il retourne au kiosque pour réparer (état 0xA puis 0xE).
//
// Rend 1 quand il passe à l'étape suivante, 0 sinon. Le reste : l'original range son résultat dans
// [ebp-8]. Exercé par simulation.json (1 234 appels) ; relus instruction par instruction : le MONORAIL,
// l'objet qui n'est pas un kiosque, la table des objets pleine, la vitesse nulle.
export function fermerPourReparer(jeu, m, reste) {
  return reste.noter(fermer(jeu, m));
}

function fermer(jeu, m) {
  poserOctet(jeu, m + 5, octet(jeu, m + 5) | 8);
  const kiosque = kiosqueDuMecanicien(jeu, m);
  if (!estUnKiosque(jeu, kiosque)) jeu.appeler(REPARTIR_AU_HASARD, m);
  poserMot(jeu, kiosque + 0x4D, 0);
  const attraction = objet(jeu, mot(jeu, kiosque + 0x16));
  const fiche = CATALOGUE_DES_ATTRACTIONS + mot(jeu, attraction + 0x16);
  if (mot(jeu, fiche + 0x22) === FIGURE_DU_MONORAIL) {
    jeu.appeler(APPELER_LE_SUIVANT, objet(jeu, mot(jeu, attraction + 0x1E)), attraction);
    poserMot(jeu, attraction + 0x47, 0);
    poserMot(jeu, attraction + 0x1E, 0);
    poserMot(jeu, attraction + 0x2A, 0);
  } else {
    jeu.appeler(FERMER_L_ATTRACTION, attraction);
  }
  poserOctet(jeu, attraction + 0x4B, 0xFF);
  poserMot(jeu, attraction + 0x61, numeroDObjet(jeu, m));

  imageSuivante(jeu, m);
  if (!derniereImage(jeu, mot(jeu, m + 0xA))) return 0;
  poserOctet(jeu, m + 5, octet(jeu, m + 5) & 0xFD);
  if (long(jeu, m + 0x20) !== 0) {
    for (let cote = 0; u16(cote) < 4; cote++) {
      if (octet(jeu, (long(jeu, m + 0x20) + fiche + 0x8B) >>> 0) & (1 << u16(cote))) poserUneBarriere(jeu, m, u16(cote));
    }
  }
  if (etapeSuivante(jeu, m, attraction, fiche)) return 1;
  poserOctet(jeu, m + 0x56, octet(jeu, kiosque + 7));
  poserOctet(jeu, m + 0x57, octet(jeu, kiosque + 9));
  poserMot(jeu, m + 0x14, 1);
  poserOctet(jeu, m + 0xC, MARCHER);
  poserMot(jeu, m + 0x5F, figure(jeu, FIGURE_DU_MECANICIEN_QUI_ARRIVE));
  poserOctet(jeu, m + 0xD, REPARER);
  poserLong(jeu, m + 0x20, 0);
  return 1;
}

// Une barrière sur le côté `cote` de la case du mécanicien, dans le premier emplacement libre de la table
// des objets ; aucune s'il n'y en a pas.
function poserUneBarriere(jeu, m, cote) {
  const fin = long(jeu, FIN_DES_OBJETS);
  for (let p = (baseDesObjets(jeu) + TAILLE_OBJET) >>> 0; p < fin; p = (p + TAILLE_OBJET) >>> 0) {
    if (octet(jeu, p + 4) !== 0) continue;
    poserOctet(jeu, p + 4, DECOR);
    poserOctet(jeu, p + 0xC, 2);
    poserOctet(jeu, p + 7, octet(jeu, m + 7));
    poserOctet(jeu, p + 9, octet(jeu, m + 9));
    poserOctet(jeu, p + 6, octet(jeu, BARRIERES + cote * 4));
    poserOctet(jeu, p + 8, octet(jeu, BARRIERES + cote * 4 + 1));
    poserMot(jeu, p + 0xA, figure(jeu, mot(jeu, BARRIERES + cote * 4 + 2)));
    jeu.appeler(POSER_EN_TETE, p, mot(jeu, p + 6), mot(jeu, p + 8));
    jeu.appeler(DEPLACER_ET_RANGER, p, mot(jeu, p + 6), mot(jeu, p + 8));
    return;
  }
}

// ==========================================================================================================
// 0x33AF3 — l'état 0xE : le mécanicien répare. Son animation avance tous les 4 pas, et il compte le temps
// passé (mot long +20). À chaque fin d'animation, l'usure de l'attraction (+2E) baisse de 5 ; quand elle
// tombe à 0, il retourne au kiosque (état 0xA) pour refaire le tour en enlevant les barrières (état
// suivant 0x10), son compte d'étapes remis à zéro.
//
// Rend, comme l'original, l'adresse de l'objet graphique de son image hors fin d'animation, le mot haut de
// l'adresse de l'attraction avec l'usure restante en mot bas quand elle baisse, l'adresse du mécanicien
// quand la réparation est finie. Le reste : l'original range dans [ebp-8] l'adresse du kiosque, à chaque
// fin d'animation. Exercé par simulation.json (766 appels), toutes les voies.
export function reparer(jeu, m, reste) {
  if ((octet(jeu, PASSAGE) & 3) === 0) imageSuivante(jeu, m);
  const graphique = objetGraphique(jeu, mot(jeu, m + 0xA));
  poserLong(jeu, m + 0x20, long(jeu, m + 0x20) + 1);
  if (!(octet(jeu, graphique + 5) & 1)) return graphique;
  const kiosque = reste.noter(kiosqueDuMecanicien(jeu, m));
  const attraction = objet(jeu, mot(jeu, kiosque + 0x16));
  const usure = u16(mot(jeu, attraction + 0x2E) - 5);
  if (s16(usure) > 0) {
    poserMot(jeu, attraction + 0x2E, usure);
    return ((attraction & 0xFFFF0000) | usure) >>> 0;
  }
  poserMot(jeu, attraction + 0x2E, 0);
  poserOctet(jeu, m + 0x56, octet(jeu, kiosque + 7));
  poserOctet(jeu, m + 0x57, octet(jeu, kiosque + 9));
  poserMot(jeu, m + 0x14, 1);
  poserOctet(jeu, m + 0xC, MARCHER);
  poserOctet(jeu, m + 0xD, ROUVRIR);
  poserMot(jeu, m + 0x5F, figure(jeu, FIGURE_DU_MECANICIEN_QUI_ARRIVE));
  poserLong(jeu, m + 0x20, 0);
  return m;
}

// ==========================================================================================================
// 0x33BF1 — l'état 0x10 : le mécanicien refait le tour et enlève ses barrières. Son animation avance tous
// les 4 pas ; à sa dernière image, il efface toutes les barrières de sa case (objets de type 0x14 dans
// l'état 2, 0x2053E, 0x18B62), puis passe à l'étape suivante du tour. Le tour fini, il repart au hasard
// (0x33E3F) et l'attraction rouvre : ouverte (+4B = 1), ou, pour le MONORAIL, le ROLLER COASTER et le BIG
// DIPPER, avec l'ouverture gardée dans son octet +58. Si l'objet de +16 n'est pas un kiosque, il repart
// au hasard dès la fin de l'animation, et la suite le traite pourtant comme un kiosque (anomalie
// reproduite, jamais vue).
//
// Rend 1 quand il passe à l'étape suivante ou finit, 0 sinon. Le reste : l'original range son résultat
// dans [ebp-8]. Exercé par simulation.json (850 appels), dont la réouverture du BIG DIPPER avec son
// ouverture gardée ; relus instruction par instruction : l'objet qui n'est pas un kiosque, le MONORAIL
// et le ROLLER COASTER, la vitesse nulle.
export function rouvrirLAttraction(jeu, m, reste) {
  return reste.noter(rouvrir(jeu, m));
}

function rouvrir(jeu, m) {
  if ((octet(jeu, PASSAGE) & 3) === 0) imageSuivante(jeu, m);
  if (!derniereImage(jeu, mot(jeu, m + 0xA))) return 0;
  const kiosque = kiosqueDuMecanicien(jeu, m);
  if (!estUnKiosque(jeu, kiosque)) jeu.appeler(REPARTIR_AU_HASARD, m);
  const attraction = objet(jeu, mot(jeu, kiosque + 0x16));
  const fiche = CATALOGUE_DES_ATTRACTIONS + mot(jeu, attraction + 0x16);
  const c = celluleDe(jeu, m);
  for (;;) {
    const barriere = jeu.appeler(OBJET_DANS_L_ETAT, c, DECOR, 2) >>> 0;
    if (barriere === 0) break;
    if (octet(jeu, barriere + 0xC) === 2) jeu.appeler(EFFACER_L_OBJET, barriere);
  }
  if (etapeSuivante(jeu, m, attraction, fiche)) return 1;
  jeu.appeler(REPARTIR_AU_HASARD, m);
  if (FIGURES_A_OUVERTURE_GARDEE.includes(mot(jeu, fiche + 0x22))) {
    poserOctet(jeu, attraction + 0x4B, octet(jeu, m + 0x58));
  } else {
    poserOctet(jeu, attraction + 0x4B, 1);
  }
  return 1;
}

// ==========================================================================================================
// 0x33E3F — le mécanicien repart au hasard : il vise une case à 8 cases au plus de la sienne (colonne et
// rangée ± 0 à 15 − 8, reste signé de la division par 64 : près du bord gauche ou haut, une colonne
// négative, prise comme un octet), passe dans l'état 0x14 (0x33F14), augmente son mot +2A (sens non
// établi) et n'est plus marqué (bit 3 de +5). Si les employés sont en grève (octet +681 des comptes), il
// note sa case (+4D) et rejoint la grève (état 0x3A).
//
// Rend, comme l'original, l'adresse du mécanicien en grève, sinon celle des comptes. Exercé par
// simulation.json (4 appels) ; la grève, relue instruction par instruction.
export function repartirAuHasard(jeu, m) {
  viserAuHasard(jeu, m);
  poserMot(jeu, m + 0x2A, mot(jeu, m + 0x2A) + 1);
  poserOctet(jeu, m + 0xC, ERRER);
  poserOctet(jeu, m + 0xD, ERRER);
  poserMot(jeu, m + 0xA, figureDuMecanicienQuiMarche(jeu, m));
  poserOctet(jeu, m + 5, octet(jeu, m + 5) & 0xF7);
  const comptes = long(jeu, COMPTES);
  if (octet(jeu, comptes + 0x681) === 0) return comptes;
  poserMot(jeu, m + 0x4D, (octet(jeu, m + 9) << 6) + octet(jeu, m + 7));
  poserOctet(jeu, m + 0xC, 0x3A);
  poserMot(jeu, m + 0x14, 0);
  return m;
}

// ==========================================================================================================
// 0x33F14 — l'état 0x14 : le mécanicien erre vers une case d'herbe où attendre la prochaine panne. Il
// compte son temps d'errance (+34), son animation avance tous les 4 pas, et il avance dans sa direction
// (0x1864A). À chaque case nouvelle, si c'est de l'herbe (un sol sans drapeau) où aucun autre employé
// ne se trouve, il s'y arrête, au milieu, pour attendre une panne (état 8, 0x33133, compte à 200). Sinon
// il demande son chemin vers sa cible (masque 0x39C1, limite 150) : arrivé ou bloqué, il tire une autre
// cible au hasard autour de lui (comme 0x33E3F), et redemande, autant de fois qu'il le faut ; sinon il
// prend la direction du chemin.
//
// Anomalie : il avance avant de regarder où il va, et la direction qu'il garde en sortant d'une
// réparation peut le faire entrer dans des cases qui lui sont interdites. Sur une case d'où toute
// cible est hors d'atteinte (une case d'herbe enclose de clôtures, où attend déjà un employé), il
// tire des cibles sans fin : LE JEU SE FIGE, dans l'original comme ici. Hors du jeu d'origine, réglage
// « corriger les déplacements du personnel » allumé (corrections.js), il renonce après 256 tirages
// et attend là.
//
// Rend 1 quand il s'arrête, 0 sinon. Le reste : l'original range son résultat dans [ebp-8]. Exercé par
// simulation.json (233 appels) ; relu instruction par instruction : un autre employé sur la case
// d'herbe.
const MASQUE_DU_MECANICIEN = 0x39C1;

export function retournerAuRepos(jeu, m, reste) {
  return reste.noter(errer(jeu, m));
}

function errer(jeu, m) {
  poserMot(jeu, m + 0x34, mot(jeu, m + 0x34) + 1);
  if ((octet(jeu, PASSAGE) & 3) === 0) imageSuivante(jeu, m);
  const [x, y] = pasSuivant(jeu, m);
  if (u16(jeu.appeler(DEPLACER_ET_RANGER, m, x, y)) === 0) return 0;

  const c = celluleDe(jeu, m);
  if (drapeauxDuSol(jeu, c) === 0) {
    const base = baseDesObjets(jeu);
    let o = objetSigne(jeu, mot(jeu, c));
    while (o > base && !(octet(jeu, o + 4) === PERSONNEL && o !== m)) o = objetSigne(jeu, mot(jeu, o + 2));
    if (o <= base) return attendreIci(jeu, m);
  }
  for (let essais = 1; ; essais++) {
    const d = s16(jeu.appeler(CHEMIN, m, LIMITE_DU_CHEMIN, MASQUE_DU_MECANICIEN));
    if (d >= 0 && d < 4) {
      poserOctet(jeu, m + 0x12, d);
      poserMot(jeu, m + 0xA, mot(jeu, long(jeu, FIGURES) + 0x174 + d * 2));
      return 0;
    }
    // Hors du jeu d'origine (corrections.js, éteint par défaut) : enfermé, il renonce.
    if (renoncerAErrer(essais)) return attendreIci(jeu, m);
    viserAuHasard(jeu, m);
  }
}

// Il s'arrête au milieu de sa case pour attendre la prochaine panne (état 8, compte à 200).
function attendreIci(jeu, m) {
  poserMot(jeu, m + 0xA, figure(jeu, FIGURE_DU_MECANICIEN_QUI_ATTEND));
  poserOctet(jeu, m + 0xC, ATTENDRE_UNE_PANNE);
  poserMot(jeu, m + 0x14, 200);
  poserOctet(jeu, m + 6, 0x80);
  poserOctet(jeu, m + 8, 0x80);
  return 1;
}

// Une cible au hasard autour de l'employé, colonne puis rangée : ± 0 à 15 − 8 cases, le reste signé de
// la division par 64 (idiv) rangé dans un octet.
function viserAuHasard(jeu, m) {
  poserOctet(jeu, m + 0x56, (octet(jeu, m + 7) + (jeu.appeler(HASARD) & 0xF) - 8) % 64);
  poserOctet(jeu, m + 0x57, (octet(jeu, m + 9) + (jeu.appeler(HASARD) & 0xF) - 8) % 64);
}

// ==========================================================================================================
// 0x31668 — fermer une attraction : ses passagers descendent un à un (0x31F95, qui la retire de sa liste,
// mot +47), le premier de sa file est renvoyé (0x32142) et la file oubliée (+1E, +2A), l'attraction est
// fermée (+4B = 0) et revient au repos (phase +32 à 0). Le MONORAIL (figure 0xDB) a sa propre fermeture,
// 0x448BA. Appelée par 0x33742 (la réparation) et par l'écran de l'attraction (0x3B76E), entre autres.
//
// Anomalie reproduite : pour une attraction dans le mode 4 ou 0x1C, 0x31F95 ne la retire pas de sa
// liste, et un passager ferait boucler la fermeture sans fin (jamais vu : ces attractions-là n'ont pas
// de passagers dans leur liste).
//
// Rend, comme l'original, ce que rend 0x448BA pour le MONORAIL, sinon l'adresse de l'attraction.
// Exercé par simulation.json (1 234 appels) et construction.json (1, par l'écran de l'attraction) ; le
// MONORAIL, relu instruction par instruction.
export function fermerLAttraction(jeu, a) {
  const fiche = CATALOGUE_DES_ATTRACTIONS + mot(jeu, a + 0x16);
  if (mot(jeu, fiche + 0x22) === FIGURE_DU_MONORAIL) return jeu.appeler(FERMER_LE_MONORAIL, a);
  for (let p = objet(jeu, mot(jeu, a + 0x47)); p > baseDesObjets(jeu); p = objet(jeu, mot(jeu, a + 0x47))) {
    jeu.appeler(DESCENDRE_DE_L_ATTRACTION, p, a);
    poserMot(jeu, p + 0x47, 0);
  }
  jeu.appeler(APPELER_LE_SUIVANT, objet(jeu, mot(jeu, a + 0x1E)), a);
  poserMot(jeu, a + 0x47, 0);
  poserMot(jeu, a + 0x1E, 0);
  poserMot(jeu, a + 0x2A, 0);
  poserOctet(jeu, a + 0x4B, 0);
  poserMot(jeu, a + 0x32, 0);
  return a;
}

// ==========================================================================================================
// 0x617E0 — l'état 0x16 : l'agent d'entretien vient d'être embauché (personnel.js), et regarde le sol de
// sa case :
//   - une allée, une file ou un bout de file (drapeaux 0x1A) : il se met à parcourir les allées (état
//     0x18, 0x62FEA, appelé aussitôt), sans direction (+12 = 4) ;
//   - de l'herbe (sol sans drapeau) : il se tourne vers la case d'herbe voisine à l'image de sol la plus
//     basse (moins de 3 : l'herbe la plus courte ? non établi), en regardant à gauche, en bas, à droite
//     puis en haut, et passe dans l'état 0x1E (sur l'herbe, 0x619BF), sa case de départ notée (+64, +65,
//     et sa direction dans le mot +61), à la vitesse 16 ;
//   - ailleurs : il vise la case (32, 16) — une case fixe, non établi —, fait demi-tour, et passe dans
//     l'état 0x22 (0x629DB, non établi), puis 0x1E, avec la figure 0xC3 + direction.
// Dans les deux premiers cas, il prend sa figure de marche (0x28671), son compte à 0.
//
// Rend dans al 1, le reste d'eax étant celui de l'adresse de l'agent (ce que rend 0x28671 pour un
// employé). Le reste de pile : l'original range 1 dans l'octet bas de [ebp-8]. Exercé par
// construction.json (1 appel, l'agent embauché sur une allée) ; l'herbe et le reste, relus instruction
// par instruction. Dans le dernier cas, le compte à rebours divise par la vitesse que l'original vient
// de poser à 16 : son recours à 0x19ED3 pour une vitesse nulle ne sert jamais.
const SOLS_DES_ALLEES = 0x1A;

export function commencerLEntretien(jeu, o, reste) {
  reste.noter(1);
  const numero = u16((octet(jeu, o + 9) << 6) + octet(jeu, o + 7));
  const carte = long(jeu, CARTE);
  const drapeaux = mot(jeu, SOLS + octet(jeu, carte + numero * 4 + 2) * 4);
  if (drapeaux & SOLS_DES_ALLEES) {
    poserOctet(jeu, o + 0xC, 0x18);
    poserOctet(jeu, o + 0x12, 4);
    jeu.appeler(PARCOURIR_LES_ALLEES, o);
  } else if (drapeaux === 0) {
    let plusBasse = 3;
    for (let d = 3; d !== 0xFF; d = (d - 1) & 0xFF) {
      const voisine = (carte + (numero + motSigne(jeu, VOISINES + d * 2)) * 4) >>> 0;
      if (mot(jeu, SOLS + octet(jeu, voisine + 2) * 4) !== 0) continue;
      const image = octet(jeu, voisine + 2);
      if (plusBasse > image) {
        plusBasse = image;
        poserOctet(jeu, o + 0x12, d);
      }
    }
    poserOctet(jeu, o + 0xC, 0x1E);
    poserOctet(jeu, o + 0x64, octet(jeu, o + 7));
    poserOctet(jeu, o + 0x65, octet(jeu, o + 9));
    poserMot(jeu, o + 0x61, octet(jeu, o + 0x12));
    poserOctet(jeu, o + 0x13, 0x10);
  } else {
    poserOctet(jeu, o + 0x56, 0x20);
    poserOctet(jeu, o + 0x57, 0x10);
    poserOctet(jeu, o + 0x13, 0x10);
    poserOctet(jeu, o + 0xC, 0x22);
    poserOctet(jeu, o + 0xD, 0x1E);
    poserOctet(jeu, o + 0x12, octet(jeu, DIRECTIONS_OPPOSEES + octet(jeu, o + 0x12) * 2));
    poserMot(jeu, o + 0x14, pasParCase(jeu, o));
    poserMot(jeu, o + 0xA, mot(jeu, long(jeu, FIGURES) + 0x186 + octet(jeu, o + 0x12) * 2));
    return ((o & 0xFFFFFF00) | 1) >>> 0;
  }
  poserMot(jeu, o + 0x14, 0);
  return ((jeu.appeler(PRENDRE_LA_FIGURE_DE_MARCHE, o) & 0xFFFFFF00) | 1) >>> 0;
}

// ==========================================================================================================
// `memoire: 'entiere'` : ces fonctions écrivent dans les objets du parc, les listes des cases et les
// fiches du joueur (le tas) ; la comparaison appel par appel restaure et compare toute la mémoire.
// `retour` : chacune rend dans eax exactement ce que rendait l'original, reste de calcul compris. Les
// routines que 0x21681 appelle reçoivent leur reste de pile (avecLeReste), sauf 0x253BD, qui n'en a pas.
const reecriture = (adresse, nom, fn, args) => ({ adresse, nom, fn, arguments: args, retour: true, memoire: 'entiere' });

export const reecritures = [
  reecriture(0x21681, 'mettreAJourLesObjets', mettreAJourLesObjets, 2),
  reecriture(0x283A6, 'faireArriverLeBus', faireArriverLeBus, 0),
  reecriture(0x67CD4, 'compterLesArrivants', compterLesArrivants, 0),
  reecriture(0x6128F, 'lancerLeBus', lancerLeBus, 2),
  reecriture(0x2845A, 'creerUnVisiteur', creerUnVisiteur, 1),
  reecriture(0x2293A, 'chercherSonChemin', avecLeReste(chercherSonChemin), 1),
  reecriture(0x2276C, 'attendreUnChemin', avecLeReste(attendreUnChemin), 1),
  reecriture(0x2634B, 'jouerAuJeuDAdresse', avecLeReste(jouerAuJeuDAdresse), 1),
  reecriture(0x65A20, 'voler', avecLeReste(voler), 1),
  reecriture(0x253BD, 'seRelever', seRelever, 1),
  reecriture(0x66189, 'projeterUnVisiteur', projeterUnVisiteur, 4),
  reecriture(0x28752, 'quitterLeParc', quitterLeParc, 1),
  reecriture(0x28671, 'prendreLaFigureDeMarche', prendreLaFigureDeMarche, 1),
  reecriture(0x2053E, 'objetDansLEtat', objetDansLEtat, 3),
  reecriture(0x617E0, 'commencerLEntretien', avecLeReste(commencerLEntretien), 1),
  reecriture(0x33742, 'fermerPourReparer', avecLeReste(fermerPourReparer), 1),
  reecriture(0x33AF3, 'reparer', avecLeReste(reparer), 1),
  reecriture(0x33BF1, 'rouvrirLAttraction', avecLeReste(rouvrirLAttraction), 1),
  reecriture(0x33E3F, 'repartirAuHasard', repartirAuHasard, 1),
  reecriture(0x33F14, 'retournerAuRepos', avecLeReste(retournerAuRepos), 1),
  reecriture(0x31668, 'fermerLAttraction', fermerLAttraction, 1),
];

export const enAttente = [];
