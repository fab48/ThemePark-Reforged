// Des fonctions auxiliaires que se partagent les parties de la simulation : le hasard, les listes
// d'objets posées sur les cases de la carte, le choix d'une direction vers une cible, le parcours
// d'une file d'attente, le raccord des allées et le tracé d'un sol, le livre des comptes, le relevé
// des statistiques d'un parc et le lancement d'un bruitage.
//
// Réécriture lisible des fonctions 0x18B92, 0x80BF2, 0x185C1, 0x1883E, 0x18918, 0x18A44, 0x18ADF,
// 0x204B9, 0x281D5, 0x349EB, 0x28D5A, 0x2CBC0, 0x78943, 0x68E34 et 0x80C80 du jeu d'origine. Chaque
// constante vient du programme de 1994 ; `moteur/node/comparer.mjs` compare chaque appel à la
// transcription, `moteur/node/verifier.mjs` rejoue la même partie avec et sans ce module.
//
// Ces fonctions sont appelées par toute la simulation, certaines des centaines de milliers de fois
// par partie : elles sont transcrites au plus près, jusque dans leurs anomalies, signalées en
// commentaire.

import { cesserDeLongerSansIssue } from './corrections.js';   // hors du jeu d'origine (reglages.js)

// --- les données -----------------------------------------------------------------------------------

// Les objets du parc : enregistrements de 200 octets, numérotés à partir de 1 (l'enregistrement 0 ne
// sert que de sentinelle), de [0xD3B10] + 200 à [0xD3B78] exclu (docs/retro-ingenierie.md § 6.4).
const OBJETS_DU_PARC = 0xD3B10;
const FIN_DES_OBJETS_DU_PARC = 0xD3B78;
const TAILLE_OBJET = 200;
const PERSONNEL = 8;
//   +0  mot    l'objet précédent sur la même case ; 0 = l'objet est en tête de la liste de la case
//   +2  mot    l'objet suivant sur la même case ; 0 = fin, négatif = un décor qui clôt la liste
//   +4  octet  le type : 2 visiteur, 4 attraction, 6 et 0x1C kiosque d'attraction, 8 personnel,
//              0xA boutique… (objets.js)
//   +5  octet  des drapeaux ; les bits 0x10 et 0x20 disent qu'il contourne un obstacle (0x349EB)
//   +6  mot    la position sur l'axe des colonnes, en 256es de case : l'octet fort, +7, est la colonne
//   +8  mot    la position sur l'axe des rangées, en 256es de case : l'octet fort, +9, est la rangée
//   +12 octet  la direction où il va (voir DIRECTIONS)
//   +16 mot    selon le type, un genre (fiche d'un catalogue) ou le numéro d'un autre objet
//   +56, +57 octets  la colonne et la rangée de la case où il se rend (0x349EB)
//   +71 mot    le numéro de la case où prend fin le contournement d'un obstacle (0x349EB)
//
// Les listes des cases sont doublement chaînées : le mot +0 de la cellule (§ 6.2) désigne le
// premier objet, chaque objet désigne le suivant par son mot +2 et le précédent par son mot +0.

// La carte : 64 x 64 cellules de 4 octets, rangée après rangée, de [0xD3B08] à [0xD3B04] exclu. Une
// case est désignée tantôt par l'adresse de sa cellule, tantôt par son numéro, rangée × 64 + colonne.
const CARTE = 0xD3B08;
const FIN_DE_LA_CARTE = 0xD3B04;
const COLONNES = 64;
//   +0  mot    le premier objet posé sur la case ; 0 = rien, négatif = un décor fixe
//   +2  octet  l'image du sol

// Les images de sol : 4 octets chacune, en 0xB44D9. Le mot +0 porte les drapeaux du sol, l'octet +3
// le numéro de ses connexions dans la table 0xB49D3 (un octet par numéro : les côtés par où le sol
// se raccorde, 1 rangée précédente, 2 colonne suivante, 4 rangée suivante, 8 colonne précédente).
const SOLS = 0xB44D9;
const CONNEXIONS = 0xB49D3;
// Les drapeaux établis ici : 2, une allée (images 85 à 102, 117 à 120, 137, 138, 150 à 157, 216 à
// 236, dont les 47 entre lesquelles 0x28D5A choisit d'après les voisines) ; 8, une file d'attente
// (images 121 à 133). Les autres (1, 4, 0x10, 0x20, 0x40, 0x80, 0x100, 0x400, 0x800, 0x1000, 0x2000,
// 0x4000, 0x8000) ne sont ici que des obstacles pour qui les a dans son masque (0x349EB) : ce qu'ils
// sont, non établi. 0x40 marque aussi quatre images d'allées (101, 102, 119, 120), que 0x28D5A ne
// raccorde que par les côtés, et deux de files (132, 133).
const ALLEE = 2;
const FILE_D_ATTENTE = 8;
const ALLEE_A_PART = 0x40;

// Les quatre directions, et le pas de cellule de chacune (mots signés, table 0xB4920) : 0, la rangée
// précédente (le haut de l'écran) ; 1, la colonne suivante (la droite) ; 2, la rangée suivante (le
// bas) ; 3, la colonne précédente (la gauche). Tourner de +1, c'est tourner dans le sens des
// aiguilles d'une montre.
const DIRECTIONS = 0xB4920;
const HAUT = 0, DROITE = 1, BAS = 2, GAUCHE = 3;

// Le générateur de hasard : son état, un mot long, fait partie de la partie sauvegardée.
const ETAT_DU_HASARD = 0xD3AF4;
const MULTIPLICATEUR_DU_HASARD = 0xBB40E62D;

// Le temps : le compteur de pas de simulation, 1 000 par mois, 12 000 par an.
const PAS_DE_SIMULATION = 0xD3AFC;
const PAS_PAR_AN = 12000, PAS_PAR_MOIS = 1000;

// --- les accès à la mémoire ------------------------------------------------------------------------
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
const ajouterAuMot = (jeu, a, v) => ecrireMot(jeu, a, mot(jeu, a) + v);
const ajouterAuMotLong = (jeu, a, v) => ecrireMotLong(jeu, a, motLong(jeu, a) + v);

// Les divisions du processeur : `idiv` tronque vers zéro, `div` divise sans signe ; un diviseur nul
// ou un quotient qui déborde lèvent une exception, comme sur la machine (et dans la transcription).
function idiv(a, b, bits = 32) {
  if (b === 0) throw new Error('division par zero');
  const q = Math.trunc(a / b), limite = 2 ** (bits - 1);
  if (q >= limite || q < -limite) throw new Error('debordement de division');
  return q;
}
function div(a, b) {
  if (b === 0) throw new Error('division par zero');
  return Math.floor(a / b);
}

const baseDesObjets = (jeu) => motLong(jeu, OBJETS_DU_PARC);

// L'adresse de l'objet numéro n, n signé : un numéro négatif (un décor) ou nul mène au-dessous ou
// sur la sentinelle, ce que les boucles testent par une comparaison d'adresses non signée.
const objetNumero = (jeu, n) => (baseDesObjets(jeu) + n * TAILLE_OBJET) >>> 0;

// Le numéro d'un objet d'après son adresse (idiv du programme).
const numeroDeLObjet = (jeu, objet) => idiv((objet - baseDesObjets(jeu)) | 0, TAILLE_OBJET);

// La cellule d'une case, d'après sa colonne et sa rangée, ou d'après son numéro. Sans contrôle de
// bornes : hors de la carte, on lit ce qui se trouve avant ou après elle.
const cellule = (jeu, colonne, rangee) => (motLong(jeu, CARTE) + (rangee * COLONNES + colonne) * 4) >>> 0;
const celluleNumero = (jeu, n) => (motLong(jeu, CARTE) + n * 4) >>> 0;
const numeroDeCellule = (jeu, c) => ((c - motLong(jeu, CARTE)) | 0) >> 2;

// La cellule voisine dans une direction.
const pasDeLaDirection = (jeu, d) => motSigne(jeu, DIRECTIONS + 2 * d);
const voisine = (jeu, c, d) => (c + pasDeLaDirection(jeu, d) * 4) >>> 0;

// Les drapeaux du sol d'une case, et ses connexions.
const drapeauxDuSol = (jeu, c) => mot(jeu, SOLS + octet(jeu, c + 2) * 4);
const connexionsDuSol = (jeu, c) => octet(jeu, CONNEXIONS + octet(jeu, SOLS + 3 + octet(jeu, c + 2) * 4));

// L'octet fort d'une position en 256es de case : le numéro de la case.
const caseDe = (position) => (position >>> 8) & 0xFF;

// --- le hasard -------------------------------------------------------------------------------------

// 0x18B92 — le générateur de hasard du jeu : un nombre de 0 à 32 767.
//
// Un générateur multiplicatif pur (sans incrément) : état ← état × 0xBB40E62D, modulo 2³², et le
// tirage est l'état décalé de 8 bits, sur 15 bits (les bits 8 à 22). Le multiplicateur valant 5
// modulo 8, un état impair parcourt un cycle de 2³⁰ valeurs ; un état nul le resterait. Les bits
// faibles du tirage ont une période courte : tirage modulo 2^k revient au bout de 2^(k+6) tirages
// (128 pour un tirage à pile ou face, 256 modulo 4). Or, de ses 147 appels, plus de la moitié prend
// le tirage modulo une constante — une puissance de deux (2 à 4 096) près d'une fois sur deux,
// sinon 3, 5, 6, 7, 9, 10, 20, 27, 50, 300, 480, 638, 640 ou 1 000 —, une vingtaine modulo une
// variable, et une vingtaine n'en garde que quelques bits (masque ou test d'un bit). La suite des
// tirages étant commune à toute la simulation, ces périodes ne se voient que pour qui tire seul.
//
// L'état, un mot long en 0xD3AF4, est posé à 0x7FBE5 par 0x12452, à l'entrée de la boucle du parc
// (0x11C45) : c'est de là que descend, 1 448 tirages plus tard, celui relevé à la première image
// des scénarios. Il fait partie de la partie sauvegardée : au chargement de la partie DEMO
// (simulation.json), il prend la valeur rangée dans DEMO.GY (0xCCD2F1F1, au décalage 0x41EE2), et
// la partie reprend sa suite. Il passe aussi par la file des événements (0xD441E, 6 octets par
// case, evenements.js) : RECOMMENCER, la commande 6 de 0x50CCD (menus.js ; menus.json appelle bien
// 0x50CCD), y poste la demande 0x3A avec l'état courant (mot fort en +2, mot faible en +4), et
// 0x2CCF8 l'y recharge pour que la nouvelle partie reparte de la même graine.
export function hasard(jeu) {
  const etat = Math.imul(motLong(jeu, ETAT_DU_HASARD), MULTIPLICATEUR_DU_HASARD | 0);
  ecrireMotLong(jeu, ETAT_DU_HASARD, etat);
  return (etat >>> 8) & 0x7FFF;
}

// L'entrée de 0x18B92, quand le code appelle le hasard par la table (et non une réécriture, en
// JavaScript). L'original ouvre un cadre (push ebx, esi, edi, enter 4) : il laisse, sous son point
// d'entrée, l'ebx de l'appelant 4 octets plus bas, puis esi, edi, ebp et le tirage. De ces restes,
// un seul est relu : l'ebx laissé par le tirage de l'usure de l'herbe, le dernier appel du calendrier
// (0x12B1F, retour 0x139AD), que l'état 4 des visiteurs (0x223C1) relit comme sa variable [ebp-8]
// (index.js, `resteRelu`, sixième cas). On n'écrit donc que lui : le hasard est tiré des millions de
// fois, et le rejeu empoisonné prouve que les autres ne comptent pas. L'enveloppe (index.js) vient
// de sauver les registres : T.R est à jour.
function hasardALEntree(jeu) {
  const R = jeu.T.R;
  ecrireMotLong(jeu, (R.esp - 4) >>> 0, R.ebx);
  return hasard(jeu);
}

// 0x80BF2 — valeur absolue d'un entier de 32 bits. Comme `neg`, l'opposé de -2³¹ reste -2³¹.
export function valeurAbsolue(jeu, v) {
  v |= 0;
  return v < 0 ? -v | 0 : v;
}
const abs = (v) => valeurAbsolue(null, v);

// --- les listes d'objets des cases -----------------------------------------------------------------

// 0x185C1 — poser un objet en tête de la liste de la case (x, y), x et y en 256es de case.
//
// L'objet ne quitte pas pour autant la liste où il était : c'est à l'appelant de l'avoir retiré
// (0x18918). Son mot +0 n'est pas touché (le retrait l'a remis à zéro) ; son mot +2 ne l'est que
// si la case portait déjà quelque chose — sur une case vide, il garde sa valeur, nulle après un
// retrait. Un décor en tête de case passe derrière l'objet et clôt toujours la liste.
export function poserEnTete(jeu, objet, x, y) {
  const c = cellule(jeu, caseDe(x), caseDe(y));
  const numero = numeroDeLObjet(jeu, objet);
  const premier = mot(jeu, c);
  if (premier !== 0) {
    ecrireMot(jeu, objet + 2, premier);
    if (motSigne(jeu, objet + 2) > 0) ecrireMot(jeu, objetNumero(jeu, premier), numero);
  }
  ecrireMot(jeu, c, numero);
}

// 0x1883E — poser un objet en queue de la liste de la case (x, y).
//
// Anomalie reproduite : si la case porte un décor (mot +0 négatif), seul ou en fin de liste, l'objet
// prend sa place — le décor disparaît de la liste de la case (0x185C1, lui, le garde en fin de
// liste). Et sur une case vide, les mots +0 et +2 de l'objet ne sont pas touchés.
//
// Vérification : les appels des scénarios (0x18ADF, pour les véhicules surtout) posent tous l'objet
// au bout d'une liste d'objets. La case vide, la case à décor et la liste close par un décor ont
// été comparées à part, en y posant un visiteur sous le comparateur : sans divergence, et le décor
// disparaît bien de la case.
export function poserEnQueue(jeu, objet, x, y) {
  const c = cellule(jeu, caseDe(x), caseDe(y));
  const base = baseDesObjets(jeu);
  let dernier = objetNumero(jeu, motSigne(jeu, c));
  if (dernier <= base) {
    ecrireMot(jeu, c, numeroDeLObjet(jeu, objet));
    return;
  }
  while (motSigne(jeu, dernier + 2) > 0) dernier = objetNumero(jeu, motSigne(jeu, dernier + 2));
  ecrireMot(jeu, dernier + 2, numeroDeLObjet(jeu, objet));
  ecrireMot(jeu, objet + 0, numeroDeLObjet(jeu, dernier));
}

// 0x18918 — retirer un objet de la liste de sa case (colonne +7, rangée +9), et remettre à zéro ses
// deux liens.
//
// En tête de liste (précédent nul), la case passe à son suivant. Sinon, le précédent n'est pas pris
// dans le mot +0 : la liste est parcourue depuis la tête jusqu'à l'objet qui désigne celui-ci.
// Si l'objet n'y figure pas, la liste reste telle quelle.
export function retirer(jeu, objet) {
  const c = cellule(jeu, octet(jeu, objet + 7), octet(jeu, objet + 9));
  if (mot(jeu, objet + 0) === 0) {
    ecrireMot(jeu, c, mot(jeu, objet + 2));
    if (motSigne(jeu, c) > 0) ecrireMot(jeu, objetNumero(jeu, motSigne(jeu, objet + 2)), 0);
  } else {
    const numero = numeroDeLObjet(jeu, objet) & 0xFFFF;
    let p = objetNumero(jeu, motSigne(jeu, c));
    while (motSigne(jeu, p + 2) > 0) {
      if (motSigne(jeu, p + 2) === numero) {
        ecrireMot(jeu, p + 2, mot(jeu, objet + 2));
        if (motSigne(jeu, p + 2) > 0) ecrireMot(jeu, objetNumero(jeu, motSigne(jeu, objet + 2)), mot(jeu, objet + 0));
        break;
      }
      p = objetNumero(jeu, motSigne(jeu, p + 2));
    }
  }
  ecrireMot(jeu, objet + 2, 0);
  ecrireMot(jeu, objet + 0, 0);
}

// 0x18A44 — amener un objet à la position (x, y), en 256es de case. Rend 1 s'il a changé de case,
// 0 sinon.
//
// Une position hors de la carte (case de 64 ou plus sur l'un des axes) est refusée : rien ne
// change, et la fonction rend 0. Dans la même case, seule la position change. Sinon l'objet est
// retiré de la liste de son ancienne case et posé en tête de celle de la nouvelle.
export function deplacer(jeu, objet, x, y) {
  if (caseDe(x) >= COLONNES || caseDe(y) >= COLONNES) return 0;
  return changerDePosition(jeu, objet, x, y, poserEnTete);
}

// 0x18ADF — comme 0x18A44, sans le contrôle des bornes de la carte, et l'objet est posé en queue
// de la liste de sa nouvelle case (0x1883E).
export function deplacerEnQueue(jeu, objet, x, y) {
  return changerDePosition(jeu, objet, x, y, poserEnQueue);
}

function changerDePosition(jeu, objet, x, y, poser) {
  let change = 0;
  if (caseDe(x) !== octet(jeu, objet + 7) || caseDe(y) !== octet(jeu, objet + 9)) {
    retirer(jeu, objet);
    poser(jeu, objet, x & 0xFFFF, y & 0xFFFF);
    change = 1;
  }
  ecrireMot(jeu, objet + 6, x);
  ecrireMot(jeu, objet + 8, y);
  return change;
}

// 0x204B9 — le premier objet du type demandé posé sur une case, désignée par l'adresse de sa
// cellule ; 0 s'il n'y en a pas, ou si l'adresse tombe hors de la carte. Le parcours s'arrête à la
// fin de la liste ou sur un décor. Le type est comparé comme un mot : au-delà de 255, jamais trouvé.
export function chercherSurLaCase(jeu, c, type) {
  if (c < motLong(jeu, CARTE) || c >= motLong(jeu, FIN_DE_LA_CARTE)) return 0;
  const base = baseDesObjets(jeu);
  for (let p = objetNumero(jeu, motSigne(jeu, c)); p > base; p = objetNumero(jeu, motSigne(jeu, p + 2))) {
    if (octet(jeu, p + 4) === (type & 0xFFFF)) return p;
  }
  return 0;
}

// --- les files d'attente ---------------------------------------------------------------------------

// Le côté opposé de chaque côté simple (octets signés, table 0xB4B21, indexée par le côté : 1 → 4,
// 2 → 8, 4 → 1, 8 → 2, -1 pour 0, 3, 5, 6, 7), et le pas de cellule de chaque côté (mots signés,
// table 0xB4B2A : 1 → -64, 2 → +1, 4 → +64, 8 → -1). Les deux tables ne vont pas au-delà du côté 8 :
// indexées par une combinaison de côtés plus grande, elles lisent les données qui les suivent — côté
// opposé 0 pour 9 et 10, pas de 0 pour 9, de 9 cases pour 10, de 10 pour 12.
const COTE_OPPOSE = 0xB4B21;
const PAS_DU_COTE = 0xB4B2A;

// 0x281D5 — l'attraction à laquelle mène une file d'attente, depuis une case (l'adresse de sa
// cellule) ; 0 si la file s'arrête avant.
//
// On suit la file case après case, en sortant de chacune par ses connexions moins le côté par où
// l'on est entré, et l'on cherche un kiosque (type 6) sur chaque case atteinte : le premier trouvé
// donne l'attraction qu'il sert (son mot +16). Une case de la file sans autre sortie que son entrée
// fait faire un dernier pas dans la même direction : s'il ne mène pas à un kiosque, la recherche
// échoue. Elle échoue aussi en atteignant une case qui n'est pas une file (drapeau 8) sans
// kiosque, ou si la case de départ n'a aucune connexion.
//
// Au départ, le « côté d'entrée » est l'ensemble des connexions de la case de départ : sur une case
// à deux côtés, le côté opposé et le pas lus dans les tables n'ont pas de sens (voir plus haut).
// Anomalie reproduite : partie d'un coin de file aux côtés 1 et 8 (connexions 9), la recherche fait
// des pas nuls et ne rend jamais la main — trois tels coins dans le parc de la démo ; les appelants
// (0x280E4, et 0x4C9DD sur la case où va entrer un visiteur) ne partent vraisemblablement que d'un
// bout de file. Aucun contrôle de bornes ni de boucle non plus : une file qui tournerait en rond
// sans kiosque ferait de même.
//
// Vérification : les scénarios n'exercent que des files qui mènent à un kiosque (289 appels dans
// simulation.json en 200 s, 693 en 330 s, 187 dans construction.json). Les trois échecs ont été
// comparés à part, en appelant la fonction sous le comparateur sur les 4 093 autres cases de la
// carte d'une partie : sans divergence.
export function attractionAuBoutDeLaFile(jeu, c) {
  let entree = connexionsDuSol(jeu, c);
  if (entree === 0) return 0;
  let dernierPas = false;
  for (;;) {
    if (dernierPas) return 0;
    if (!(octet(jeu, SOLS + octet(jeu, c + 2) * 4) & FILE_D_ATTENTE)) return 0;
    const sortie = connexionsDuSol(jeu, c) & ~octetSigne(jeu, COTE_OPPOSE + entree) & 0xFFFF;
    if (sortie !== 0) {
      c = (c + motSigne(jeu, PAS_DU_COTE + sortie * 2) * 4) >>> 0;
      entree = sortie;
    } else {
      c = (c + motSigne(jeu, PAS_DU_COTE + entree * 2) * 4) >>> 0;
      dernierPas = true;
    }
    const kiosque = chercherSurLaCase(jeu, c, 6);
    if (kiosque !== 0) return objetNumero(jeu, mot(jeu, kiosque + 0x16));
  }
}

// --- le choix d'une direction vers une cible -------------------------------------------------------

const CONTOURNE = 0x30;          // les deux bits du contournement, octet +5
const MAIN_GAUCHE = 0x10;        // l'obstacle à main gauche
const MAIN_DROITE = 0x20;        // l'obstacle à main droite
const ARRIVE = 4;                // rendu quand l'objet est sur la case de sa cible
const BLOQUE = -1;               // cerné de quatre obstacles, ou la sonde a fait plus de 150 pas
const INACCESSIBLE = -2;         // la cible est dans un obstacle, ou le contournement hors de portée

// Une case est praticable pour un masque d'obstacles si son sol n'a aucun des drapeaux du masque,
// ou si c'est une allée, toujours praticable.
function praticable(jeu, c, masque) {
  const drapeaux = drapeauxDuSol(jeu, c);
  return (drapeaux & masque) === 0 || (drapeaux & ALLEE) !== 0;
}

const quitterLeContournement = (jeu, objet) => ecrireOctet(jeu, objet + 5, octet(jeu, objet + 5) & ~CONTOURNE);

// 0x349EB — la direction du prochain pas d'un objet vers la case de sa cible (octets +56, +57) :
// 0 à 3 (voir DIRECTIONS), ARRIVE (4) sur la case même, BLOQUE (-1) ou INACCESSIBLE (-2). Le
// masque dit quels drapeaux de sol lui font obstacle ; la limite borne la prévision d'un
// contournement. Ses 17 appels passent en dur l'un des masques 0x29C1, 0x29CD, 0x39C1, 0x39C5 ou
// 0x39CD, et la limite 150 ou 50.
//
// L'objet va d'abord au plus droit : sur l'axe où l'écart est le plus grand (l'axe des rangées en
// cas d'égalité). Si la case suivante est un obstacle, une sonde part de cette case vers la cible,
// de la même façon, et traverse l'obstacle jusqu'à en ressortir. Deux suiveurs partent alors de
// l'objet, l'un l'obstacle à main gauche, l'autre à main droite, et avancent ensemble ; le premier
// qui atteint la case de sortie de la sonde l'emporte (le gauche, à égalité) : l'objet prend sa
// première direction, retient la main (bit 0x10 ou 0x20 de l'octet +5) et la case de sortie (mot
// +71). Si l'un des suiveurs revient à son point de départ dans sa première direction, il a fait le
// tour de l'obstacle sans rencontrer la case de sortie : la sonde reprend sa course vers la cible,
// jusqu'à la sortie suivante. Au-delà de `limite` pas des suiveurs, la cible est jugée
// inaccessible.
//
// Aux appels suivants, l'objet longe l'obstacle de la main retenue — il tente de tourner du côté
// de l'obstacle, puis tourne de l'autre côté tant que la case est un obstacle — jusqu'à se trouver
// sur la case de sortie, ou jusqu'à ce que l'obstacle s'arrête : quand il peut tourner du côté de
// l'obstacle et que la case en diagonale, de ce côté, n'est plus un obstacle. Ce dernier test ne
// regarde que le masque : une allée marquée d'un bit du masque (les allées à part, 0x42, pour les
// masques qui ont 0x40) y compte comme obstacle, à la différence de tous les autres tests.
//
// Le programme est écrit en sauts ; il est découpé ici en étapes, chacune rendant la suivante ou le
// résultat.
//
// Vérification : simulation.json (504 appels en 200 s, 3 042 en 330 s, masques 0x29CD, 0x39C1,
// 0x39C5) exerce toutes les étapes et toutes leurs issues, les limites 50 et 150 comprises, sauf
// deux : les 150 pas de la sonde, et le retour d'un suiveur à son départ quand la sonde est
// ressortie sur la cible même.
//
// Défaut d'origine : rien ne garantit que l'objet qui longe un obstacle en sorte. Le réglage des
// déplacements du personnel (corrections.js) fait cesser de longer l'employé qui, en continuant, n'en
// sortirait pas (sortieEnVue).
export function directionVersLaCible(jeu, objet, limite, masque) {
  const colonne = octet(jeu, objet + 7), rangee = octet(jeu, objet + 9);
  if (octet(jeu, objet + 0x56) === colonne && octet(jeu, objet + 0x57) === rangee) {
    quitterLeContournement(jeu, objet);
    return ARRIVE;
  }
  const t = {
    jeu, objet, limite: limite & 0xFFFF, masque: masque & 0xFFFF,
    ici: cellule(jeu, colonne, rangee),
    d: 0,                // la direction retenue
    premierPas: true,    // faux quand l'objet longeait déjà l'obstacle en arrivant
    sondages: 0,         // les pas de la sonde, 150 au plus sur tout l'appel
    sonde: 0,            // la cellule de la sonde
    dx: 0, dy: 0,        // l'écart à la cible, de l'objet puis de la sonde, en cases
  };
  let etape;
  if (octet(jeu, objet + 5) & CONTOURNE) {
    if (celluleNumero(jeu, mot(jeu, objet + 0x71)) === t.ici
        // hors du jeu d'origine : corrections.js, éteint par défaut
        || (octet(jeu, objet + 4) === PERSONNEL && cesserDeLongerSansIssue(() => sortieEnVue(t)))) {
      etape = cesserDeLonger;
    } else {
      const gauche = (octet(jeu, objet + 5) & MAIN_GAUCHE) !== 0;
      t.d = (octet(jeu, objet + 0x12) + (gauche ? -1 : 1)) & 3;
      t.premierPas = false;
      etape = longerLObstacle;
    }
  } else {
    etape = allerAuPlusDroit;
  }
  while (typeof etape === 'function') etape = etape(t);
  return etape;
}

// Longer l'obstacle : partant de t.d (tournée du côté de l'obstacle), tourner de l'autre côté tant
// que la case est un obstacle, quatre fois au plus.
function longerLObstacle(t) {
  const { jeu, objet, masque } = t;
  const gauche = (octet(jeu, objet + 5) & MAIN_GAUCHE) !== 0;
  let essais = 4;
  while (essais !== 0 && !praticable(jeu, voisine(jeu, t.ici, t.d), masque)) {
    essais--;
    t.d = (t.d + (gauche ? 1 : -1)) & 3;
  }
  if (essais === 0) {
    quitterLeContournement(jeu, objet);
    return BLOQUE;
  }
  if (essais !== 4 || t.premierPas) return t.d;
  // Rien du côté de l'obstacle : la case en diagonale de ce côté dit s'il continue.
  const cote = (t.d + (gauche ? -1 : 1)) & 3;
  const diagonale = (t.ici + (pasDeLaDirection(jeu, cote) + pasDeLaDirection(jeu, t.d)) * 4) >>> 0;
  if (drapeauxDuSol(jeu, diagonale) & masque) return t.d;
  return cesserDeLonger;
}

function cesserDeLonger(t) {
  quitterLeContournement(t.jeu, t.objet);
  return allerAuPlusDroit;
}

// Hors du jeu d'origine (corrections.js, le réglage des déplacements du personnel) : l'employé qui
// longe un obstacle cessera-t-il de le longer, en continuant ainsi `limite` pas au plus ? Sur sa case
// de sortie (+0x71), là où l'obstacle s'arrête, ou cerné, comme dans longerLObstacle. Sinon, dévié du
// trajet du suiveur (la formation, les toilettes ; ou des drapeaux laissés par le chemin de sa tournée,
// 0x63E5D, dont il part en grève), il tournerait sans fin autour d'un autre obstacle.
function sortieEnVue(t) {
  const { jeu, objet, masque, limite } = t;
  const gauche = (octet(jeu, objet + 5) & MAIN_GAUCHE) !== 0;
  const sortie = celluleNumero(jeu, mot(jeu, objet + 0x71));
  let ici = t.ici, direction = octet(jeu, objet + 0x12);
  for (let n = 0; n < limite; n++) {
    let d = (direction + (gauche ? -1 : 1)) & 3, essais = 4;
    while (essais !== 0 && !praticable(jeu, voisine(jeu, ici, d), masque)) {
      essais--;
      d = (d + (gauche ? 1 : -1)) & 3;
    }
    if (essais === 0) return true;
    if (essais === 4) {
      const cote = (d + (gauche ? -1 : 1)) & 3;
      const diagonale = (ici + (pasDeLaDirection(jeu, cote) + pasDeLaDirection(jeu, d)) * 4) >>> 0;
      if (!(drapeauxDuSol(jeu, diagonale) & masque)) return true;
    }
    ici = voisine(jeu, ici, d);
    direction = d;
    if (ici === sortie) return true;
  }
  return false;
}

// Au plus droit : la direction de l'écart le plus grand ; si la case suivante est praticable, c'est
// elle. Sinon la sonde part de cette case.
function allerAuPlusDroit(t) {
  const { jeu, objet, masque } = t;
  t.dx = s16(octet(jeu, objet + 7) - octet(jeu, objet + 0x56));
  t.dy = s16(octet(jeu, objet + 9) - octet(jeu, objet + 0x57));
  t.d = directionDeLEcart(t.dx, t.dy, t.d);
  const suivante = voisine(jeu, t.ici, t.d);
  if (praticable(jeu, suivante, masque)) return t.d;
  // L'objet n'étant pas sur sa cible, l'écart n'est jamais nul ici : test sans effet, transcrit.
  if (t.dx === 0 && t.dy === 0) return INACCESSIBLE;
  t.sonde = suivante;
  return sonder;
}

// La direction qui réduit l'écart (dx, dy) = position − cible : sur l'axe des colonnes si son écart
// est strictement le plus grand, sinon sur celui des rangées ; aucun écart, la direction reste.
function directionDeLEcart(dx, dy, d) {
  if (abs(dx) > abs(dy)) return dx > 0 ? GAUCHE : DROITE;
  if (dy !== 0) return dy > 0 ? HAUT : BAS;
  return d;
}

// Un pas de la sonde vers la cible. Tant qu'elle est dans l'obstacle, elle avance ; ressortie, on
// prévoit le contournement. Arrivée sur la cible sans en être sortie : la cible est dans l'obstacle.
function sonder(t) {
  const { jeu, objet, masque } = t;
  const n = numeroDeCellule(jeu, t.sonde);
  t.dx = s16((n % COLONNES) - octet(jeu, objet + 0x56));
  t.dy = s16(((n / COLONNES) | 0) - octet(jeu, objet + 0x57));
  if (abs(t.dx) > abs(t.dy)) t.sonde = voisine(jeu, t.sonde, t.dx > 0 ? GAUCHE : DROITE);
  else if (t.dy !== 0) t.sonde = voisine(jeu, t.sonde, t.dy > 0 ? HAUT : BAS);
  t.sondages++;
  if ((t.sondages & 0xFFFF) > 150) return BLOQUE;
  if (praticable(jeu, t.sonde, masque)) return prevoir;
  if (t.dx === 0 && t.dy === 0) return INACCESSIBLE;
  return sonder;
}

// La prévision : deux suiveurs partent de l'objet, au plus `limite` pas chacun. Leurs positions
// sont des numéros de case sur 16 bits, sans contrôle de bornes.
function prevoir(t) {
  const { jeu, objet, masque, limite } = t;
  const carte = motLong(jeu, CARTE);
  const libre = (n, d) => praticable(jeu, (carte + (pasDeLaDirection(jeu, d) + n) * 4) >>> 0, masque);
  let droite = numeroDeCellule(jeu, t.ici) & 0xFFFF, gauche = droite;
  let dGauche = (t.d + 1) & 3, dDroite = (t.d - 1) & 3;
  let premiereGauche = 0, premiereDroite = 0;
  for (let k = 0; ; k++) {
    if ((k & 0xFFFF) >= limite) return INACCESSIBLE;
    // Chacun tente de tourner du côté de son obstacle, puis tourne de l'autre côté tant que la case
    // est un obstacle.
    dGauche = (dGauche - 1) & 3;
    dDroite = (dDroite + 1) & 3;
    for (let n = 4; n !== 0; n--) {
      if (!libre(gauche, dGauche)) dGauche = (dGauche + 1) & 3;
      if (!libre(droite, dDroite)) dDroite = (dDroite - 1) & 3;
    }
    if (k === 0) { premiereGauche = dGauche; premiereDroite = dDroite; }
    gauche = (gauche + pasDeLaDirection(jeu, dGauche)) & 0xFFFF;
    droite = (droite + pasDeLaDirection(jeu, dDroite)) & 0xFFFF;
    const sortie = numeroDeCellule(jeu, t.sonde);
    if (gauche === sortie) return prendreLaMain(t, premiereGauche, MAIN_GAUCHE, gauche);
    if (droite === sortie) return prendreLaMain(t, premiereDroite, MAIN_DROITE, droite);
    const depart = numeroDeCellule(jeu, t.ici);
    if ((gauche === depart && dGauche === premiereGauche) || (droite === depart && dDroite === premiereDroite)) {
      if (t.dx === 0 && t.dy === 0) return INACCESSIBLE;
      return sonder;
    }
  }
}

// Le suiveur gagnant : l'objet prend sa première direction et retient la main et la case de sortie.
// On reprend alors à « longer l'obstacle », sans que ce soit pour autant un premier pas.
function prendreLaMain(t, direction, main, caseDeSortie) {
  t.d = direction;
  ecrireOctet(t.jeu, t.objet + 5, octet(t.jeu, t.objet + 5) | main);
  ecrireMot(t.jeu, t.objet + 0x71, caseDeSortie);
  return longerLObstacle;
}

// --- les allées et le sol ---------------------------------------------------------------------------

// Les huit voisines d'une case (mots signés, table 0xB8C3E) : -65, -64, -63, -1, +1, +63, +64,
// +65 ; le bit k d'un masque de voisinage désigne la k-ième. Les bits 1, 3, 4 et 6 sont les côtés.
const VOISINES = 0xB8C3E;
const COTES = (1 << 1) | (1 << 3) | (1 << 4) | (1 << 6);
// L'image d'allée de chaque masque de voisinage (256 octets).
const IMAGE_D_ALLEE = 0xB4D5A;

// 0x28D5A — raccorder une allée à ses voisines : son image de sol est choisie d'après les allées
// des huit cases voisines, puis retracée. Une case qui n'est pas une allée, ou une allée marquée
// 0x40, n'est pas touchée ; une voisine marquée 0x40 ne compte que par un côté, pas par un coin.
// Aucun contrôle de bornes : au bord de la carte, les « voisines » sont lues hors d'elle.
export function raccorderLAllee(jeu, numero) {
  const n = numero & 0xFFFF;
  const c = celluleNumero(jeu, n);
  const drapeaux = drapeauxDuSol(jeu, c);
  if (!(drapeaux & ALLEE) || (drapeaux & ALLEE_A_PART)) return;
  let voisinage = 0;
  for (let k = 0; k < 8; k++) {
    const v = drapeauxDuSol(jeu, (c + motSigne(jeu, VOISINES + 2 * k) * 4) >>> 0);
    if (!(v & ALLEE)) continue;
    if (!(v & ALLEE_A_PART) || (COTES & (1 << k))) voisinage |= 1 << k;
  }
  ecrireOctet(jeu, c + 2, octet(jeu, IMAGE_D_ALLEE + voisinage));
  retracerLeSol(jeu, n, octet(jeu, c + 2) + 1);
}

// La vue et l'écran (voir etat.js et docs/retro-ingenierie.md § 5.1, § 6.3).
const CAMERA_COLONNE = 0xD667A, CAMERA_RANGEE = 0xD6666;
const ORIGINE_DESSIN_X = 0xD6624, LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;
const MODE_AFFICHAGE = 0xDE5F6;
const SURFACE_DE_DESSIN = 0xDE5BC;  // pointeur : là où trace le traceur
const TAMPON_DE_FOND = 0xD3B98;     // pointeur : le fond de la carte, gardé d'une image à l'autre
const IMAGES_DE_SOL = 0xD3B90;      // pointeur : la table des images de sol, 6 octets par image
const ECRAN_PLEIN = 0xB150F;        // octet : un écran plein recouvre le parc (presentation.js)
// L'ordonnée du haut du panneau de commande, lue ici sur la zone 5 de la table des zones de
// l'écran 0xB93C3 (la deuxième icône du panneau ; dessin-carte.js lit la zone 4) : 360 en basse
// résolution, 440 en haute.
const HAUT_DU_PANNEAU = 0xB9401;
const TRACER_IMAGE = 0x5EC9C;           // (x, y, image) : tracé simple
const TRACER_IMAGE_MARQUEE = 0x55BD4;   // (x, y, image) : tracé, et marquage des blocs touchés

// 0x2CBC0 — retracer l'image de sol `image` d'une case (son numéro) dans le tampon de fond, sans
// attendre que la carte soit redessinée. Le traceur est détourné vers le tampon le temps du tracé.
//
// Le point est celui de la projection (§ 5.1) plus 4 pixels à droite, le bas de l'image posé sur
// le bas de la tuile ; il est ramené à 16 bits. Rien n'est tracé si un écran plein recouvre le parc,
// ni si l'image commence à moins de 10 pixels du haut du panneau ou plus bas. Aucun contrôle sur
// l'axe horizontal : c'est le traceur qui coupe.
//
// Appelants : le raccord des allées (0x28D5A), 0x28943, 0x28E5A, 0x29340, 0x29686, 0x2BA40,
// 0x2C2EC, 0x2C4E5, et 0x6284C, qui fait passer à l'image suivante une herbe (image de sol 0 à 2)
// sur laquelle se trouve un objet — l'usure ou la tonte, non établi —, et ne la retrace que sur
// l'écran du parc.
//
// Vérification : dans les cinq scénarios, les 27 appels ont lieu à l'installation du parc, pour
// l'allée de l'entrée (rangées 54 à 59), la caméra en (0, 0) : l'image tombe toujours sous le
// panneau. Le tracé lui-même n'est exercé par aucun scénario ; il a été comparé à part, en appelant
// la fonction sous le comparateur sur toutes les cases visibles d'une partie, en basse et en haute
// résolution, et sous un écran plein : sans divergence.
export function retracerLeSol(jeu, numero, image) {
  if (octet(jeu, ECRAN_PLEIN) !== 0) return;
  const surface = motLong(jeu, SURFACE_DE_DESSIN);
  ecrireMotLong(jeu, SURFACE_DE_DESSIN, motLong(jeu, TAMPON_DE_FOND));
  const n = numero & 0xFFFF;
  const rangee = (n >> 6) - motSigne(jeu, CAMERA_RANGEE);
  const colonne = (n % COLONNES) - motSigne(jeu, CAMERA_COLONNE);
  const largeur = mot(jeu, LARGEUR_TUILE), hauteur = mot(jeu, HAUTEUR_TUILE);
  const x = s16(s16(colonne) * largeur + motSigne(jeu, ORIGINE_DESSIN_X) + idiv(largeur, 3) * s16(rangee) + 4);
  const entree = (motLong(jeu, IMAGES_DE_SOL) + (image & 0xFFFF) * 6) >>> 0;
  const y = s16(rangee * hauteur + hauteur - octet(jeu, entree + 5));
  if (y < motSigne(jeu, HAUT_DU_PANNEAU) - 10) {
    const basse = (mot(jeu, MODE_AFFICHAGE) & 1) !== 0;
    jeu.appeler(basse ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE, x, y, entree);
  }
  ecrireMotLong(jeu, SURFACE_DE_DESSIN, surface);
}

// --- le livre des comptes ----------------------------------------------------------------------------

// Les comptes du joueur : une structure en [0xD3814] (0xD443C pendant les scénarios), qui porte
// aussi d'autres réglages (+615, +617, lus plus bas ; +63F…) — ce qu'elle est au juste, non établi ;
// et sa fiche de joueur : [0xD3808], dans la table des fiches [0xD3B00] (retro-ingenierie.md § 7).
const COMPTES_DU_JOUEUR = 0xD3814;
const FICHE_DU_JOUEUR = 0xD3808;
//   comptes +46    octet  le nombre d'écritures du livre, 49 au plus
//   comptes +47    le livre : 7 octets par écriture — catégorie, jour, mois (octets), montant (mot
//                  long signé)
//   comptes +3FA   mot long  un total que diminuent les catégories 6 et 13 (non établi)
//   comptes +48E   mot long  le total des recettes, et des catégories 4 et 5
//   comptes +522   mot long  le total des dépenses
//   fiche +0A      mot long  le solde en banque
const NOMBRE_D_ECRITURES = 0x46, LIVRE = 0x47, TAILLE_ECRITURE = 7, ECRITURES_MAX = 0x31;
const TOTAL_3FA = 0x3FA, TOTAL_DES_RECETTES = 0x48E, TOTAL_DES_DEPENSES = 0x522;
const SOLDE = 0x0A;
// Le nombre de pas de simulation par jour, pour chaque mois (table 0xB7E06) : 32, 35, 32, 33, 32,
// 33, 32, 32, 33, 32, 33, 32 — 1 000 pas divisés par 31, 28 ou 30 jours.
const PAS_PAR_JOUR = 0xB7E06;

// 0x78943 — inscrire une recette (montant positif) ou une dépense (négatif) au livre des comptes du
// joueur, et la porter au solde et aux totaux.
//
// Une écriture porte la catégorie, le jour et le mois : si la dernière écriture est de même
// catégorie, du même jour et du même mois, le montant s'y ajoute. Le jour est le rang du pas dans le
// mois divisé par le nombre de pas d'un jour (0 à 31). Selon la catégorie (vues dans le livre de la
// partie DEMO et dans les scénarios : 0 à 7, 13, 15, 18, 19, 20, 23, 25 ; leur sens, non établi) :
//   4, 5     le montant va au total des recettes, et le solde ne bouge pas ;
//   6, 13    le montant va au solde, et est retranché du total +3FA et de celui des dépenses (une
//            dépense, négative, les augmente) ;
//   autres   le montant va au solde, et au total des recettes s'il est positif, à celui des
//            dépenses, en valeur absolue, s'il est négatif.
//
// Anomalie reproduite : le livre garde 50 écritures, mais leur nombre s'arrête à 49. Une fois
// plein, chaque écriture nouvelle décale les autres d'un cran et prend la 50e place — ce qui, la
// première fois, fait entrer à la 49e place le contenu d'une case jamais écrite (ou restée d'une
// partie précédente) — et c'est à l'avant-dernière écriture, la 49e, que se fait le regroupement :
// deux opérations semblables à la suite ne se regroupent pas, une troisième rejoint la première.
//
// Vérification : dans simulation.json, le livre de la partie DEMO est plein (décalage) jusqu'à la
// nouvelle année, vers 300 s, où il repart d'un livre de quelques écritures ; parc.json, ecrans.json
// et construction.json exercent aussi l'écriture nouvelle ; une recette hors des catégories 4 et 5
// (catégorie 15) n'arrive qu'après 300 s. Aucun scénario n'exerce le regroupement : il a été comparé
// à part, par des paires d'opérations semblables inscrites sous le comparateur, dans un livre plein,
// presque vide et vide — sans divergence.
//
// Le cadre de pile de l'original est reproduit sous le pointeur de pile (voir laisserLeCadre) : la
// mise à jour des objets du parc, 0x21681, appelle aussi cette fonction (catégorie 1, en 0x2212E), à
// la hauteur de pile où elle appelle la routine de chaque objet, et l'une d'elles relit ces restes.
export function inscrireAuLivre(jeu, categorie, montant) {
  const comptes = motLong(jeu, COMPTES_DU_JOUEUR);
  const nombre = octet(jeu, comptes + NOMBRE_D_ECRITURES);
  const dansLAnnee = motLong(jeu, PAS_DE_SIMULATION) % PAS_PAR_AN;
  const mois = (dansLAnnee / PAS_PAR_MOIS) | 0;
  const jour = idiv(dansLAnnee % PAS_PAR_MOIS, octet(jeu, PAS_PAR_JOUR + mois));
  const ecriture = (k) => comptes + LIVRE + k * TAILLE_ECRITURE;
  categorie &= 0xFF;
  let decalage = false;

  const derniere = ecriture(nombre - 1);
  if (nombre !== 0 && octet(jeu, derniere) === categorie && octet(jeu, derniere + 1) === jour
      && octet(jeu, derniere + 2) === mois) {
    ajouterAuMotLong(jeu, derniere + 3, montant);
  } else {
    if (nombre < ECRITURES_MAX) {
      ecrireOctet(jeu, comptes + NOMBRE_D_ECRITURES, nombre + 1);
    } else {
      for (let k = 0; k < nombre; k++) jeu.m8.copyWithin(ecriture(k), ecriture(k + 1), ecriture(k + 1) + TAILLE_ECRITURE);
      decalage = true;
    }
    const nouvelle = ecriture(nombre);
    ecrireOctet(jeu, nouvelle + 1, jour);
    ecrireOctet(jeu, nouvelle + 2, mois);
    ecrireOctet(jeu, nouvelle, categorie);
    ecrireMotLong(jeu, nouvelle + 3, montant);
  }

  const fiche = motLong(jeu, FICHE_DU_JOUEUR);
  montant |= 0;
  if (categorie === 4 || categorie === 5) {
    ajouterAuMotLong(jeu, comptes + TOTAL_DES_RECETTES, montant);
  } else if (categorie === 6 || categorie === 13) {
    ajouterAuMotLong(jeu, comptes + TOTAL_3FA, -montant);
    ajouterAuMotLong(jeu, comptes + TOTAL_DES_DEPENSES, -montant);
    ajouterAuMotLong(jeu, fiche + SOLDE, montant);
  } else {
    ajouterAuMotLong(jeu, fiche + SOLDE, montant);
    if (montant > 0) ajouterAuMotLong(jeu, comptes + TOTAL_DES_RECETTES, montant);
    else if (montant < 0) ajouterAuMotLong(jeu, comptes + TOTAL_DES_DEPENSES, -montant);
  }
  laisserLeCadre(jeu, { jour, mois, nombre, comptes, decalage, categorie });
}

// Le cadre de pile que laisse l'original de 0x78943 sous le pointeur de pile E de son entrée (sur
// l'adresse de retour) : ebx, esi, edi et ebp de l'appelant (E − 4 à E − 16), puis ses variables —
// le jour (E − 20, [ebp-4]), le mois (E − 24), le nombre d'écritures (E − 28 : le mot bas ; le mot
// haut est celui de l'adresse des comptes, restée dans le registre), le compteur du décalage,
// arrêté au nombre d'écritures (E − 32, sur ce chemin seulement), et l'octet de la catégorie
// (E − 36). Rien plus bas : la fonction n'en appelle aucune autre.
//
// Pourquoi : 0x21681 appelle la routine de chaque objet du parc (un argument) à la même hauteur de
// pile, et 0x223C1, l'état des visiteurs à l'entrée du parc, lit dans l'une de ses phases l'octet bas
// de sa variable [ebp-8] sans l'avoir écrite (visiteurs-etats-a.js, « La pile »). Appelée par 0x21681
// avec deux arguments, cette fonction a son entrée 4 octets plus bas que ces routines : leur [ebp-8]
// est son [ebp-4], le jour. Une routine qui la suivrait y trouverait donc le jour, et la partie en
// dépend. Les autres fonctions de ce module ne sont pas concernées : 0x21681 ne les appelle pas
// directement, et toutes les routines qu'il appelle et qui les appellent ont au moins 8 octets de
// variables — leur [ebp-8] est à elles, au-dessus du cadre de la fonction appelée (177 appels
// examinés).
//
// Vérifié : construction.json fait un appel par 0x21681 (entrée à 0xE228C, quand les routines des
// objets entrent à 0xE2290) ; après chacun des appels de construction.json, simulation.json (330 s)
// et parc.json, les 36 octets du cadre sont ceux de l'original.
function laisserLeCadre(jeu, { jour, mois, nombre, comptes, decalage, categorie }) {
  jeu.T.sauver();
  const R = jeu.T.R, E = R.esp >>> 0;
  ecrireMotLong(jeu, E - 4, R.ebx);
  ecrireMotLong(jeu, E - 8, R.esi);
  ecrireMotLong(jeu, E - 12, R.edi);
  ecrireMotLong(jeu, E - 16, R.ebp);
  ecrireMotLong(jeu, E - 20, jour);
  ecrireMotLong(jeu, E - 24, mois);
  ecrireMotLong(jeu, E - 28, (comptes & 0xFFFF0000) | nombre);
  if (decalage) ecrireMotLong(jeu, E - 32, nombre);
  ecrireOctet(jeu, E - 36, categorie);
}

// --- les statistiques d'un parc ---------------------------------------------------------------------

// Les parcs : une table de fiches de 0x250 octets en 0xCF1E0 ([0xD3818] désigne celle du joueur),
// indexée par le mot +2 de la fiche de joueur. Les champs remplis ici, sommes puis moyennes ; leur
// sens n'est pas établi, sauf ce qu'en disent les objets qui les alimentent.
const PARCS = 0xCF1E0, TAILLE_PARC = 0x250;
// Les catalogues : genres de boutiques (0xD3C62 + mot +16 de la boutique, qui vaut 107 × genre),
// genres d'attractions (0xCCED0 + mot +16), métiers du personnel (0x36 octets par métier, octet +59
// du membre du personnel ; le mot 0xD35EC est la sorte du métier, le mot 0xD35E4 un minimum).
const GENRES_DE_BOUTIQUES = 0xD3C62;
const GENRES_D_ATTRACTIONS = 0xCCED0;
const SORTES_DE_METIERS = 0xD35EC, MINIMUMS_DES_METIERS = 0xD35E4, TAILLE_METIER = 0x36;

// Les champs remis à zéro avant le relevé, avec leur taille.
const CHAMPS_DU_RELEVE = [
  [0xAA, 4], [0xAE, 4], [0x90, 2], [0x92, 1], [0x93, 2], [0x95, 2], [0x97, 4], [0x9B, 4], [0xB2, 2],
  [0xB4, 2], [0xB6, 4], [0xBA, 4], [0xBE, 4], [0xE8, 2], [0xEA, 2], [0xEE, 2], [0xF0, 2], [0xF2, 2],
  [0xF4, 2], [0xFA, 2], [0xFC, 2], [0xFE, 2], [0x100, 2], [0xA3, 2], [0x109, 2], [0x10C, 2],
  [0x10E, 2], [0x10B, 1], [0xA5, 2],
];

// 0x68E34 — relever les statistiques du parc d'un joueur (sa fiche) : parcourir tous les objets
// du parc, cumuler ce que disent les boutiques, le personnel, les visiteurs et les attractions,
// puis en tirer des moyennes. Le parc est désigné par le mot +2 de la fiche.
//
// Au passage, l'octet +51 du parc devient la moyenne, sur les mois écoulés de l'année, de son
// octet +48 : (mois × ancienne moyenne + +48) / (mois + 1).
//
// Deux anomalies, reproduites :
//  - le personnel passe, après son traitement propre, par celui des visiteurs (le `break` manque
//    dans le programme) : ses octets et mots +4F, +50, +51, +54, +6F, +75, +82 s'ajoutent aux
//    sommes des visiteurs, que divise ensuite le nombre de visiteurs (mot +1F du parc) ; dans la
//    partie de la démo, les 28 membres du personnel ont un octet +4F nul et sont tous comptés ;
//  - le mot +A3 retient, parmi les attractions dont l'octet +4B vaut 1, celle dont le mot +2E
//    dépasse une variable nulle au départ et jamais mise à jour : vraisemblablement un maximum
//    oublié, qui fait retenir la dernière de la table dont le mot +2E n'est pas nul.
// Le programme compte aussi les visiteurs dont le mot +54 dépasse 500 en valeur absolue, sans
// jamais relire ce compte : il n'est pas transcrit.
//
// Vérification : 6 appels en 200 s de simulation.json (9 en 330 s ; parc de 22 attractions), 5
// dans construction.json, un ou deux dans parc.json et ecrans.json (parc vide : aucun visiteur,
// aucune attraction). Aucun scénario n'exerce la famille de boutiques 4, un minimum de personnel
// à relever, ni le mot +A5 : ils ont été comparés à part, sur un parc préparé pour cela (mots +9A
// du personnel mis à zéro, une boutique passée au genre 7, de famille 4, une attraction à +3A =
// 0x41), ainsi qu'un parc sans visiteurs ni attractions et un nombre de visiteurs négatif — sans
// divergence.
export function releverLesStatistiques(jeu, fiche) {
  const parc = PARCS + mot(jeu, fiche + 2) * TAILLE_PARC;
  for (const [champ, taille] of CHAMPS_DU_RELEVE) {
    if (taille === 1) ecrireOctet(jeu, parc + champ, 0);
    else if (taille === 2) ecrireMot(jeu, parc + champ, 0);
    else ecrireMotLong(jeu, parc + champ, 0);
  }
  const mois = ((motLong(jeu, PAS_DE_SIMULATION) % PAS_PAR_AN) / PAS_PAR_MOIS) | 0;
  const cumul = mois * octet(jeu, parc + 0x51) + octet(jeu, parc + 0x48);
  ecrireOctet(jeu, parc + 0x51, idiv(cumul, mois + 1));

  const fin = motLong(jeu, FIN_DES_OBJETS_DU_PARC);
  for (let p = (baseDesObjets(jeu) + TAILLE_OBJET) >>> 0; p < fin; p = (p + TAILLE_OBJET) >>> 0) {
    switch (octet(jeu, p + 4)) {
      case 0xA: releverUneBoutique(jeu, parc, p); break;
      case 8: releverUnMembreDuPersonnel(jeu, p); releverUnVisiteur(jeu, parc, p); break;
      case 2: releverUnVisiteur(jeu, parc, p); break;
      case 4: releverUneAttraction(jeu, parc, p); break;
      default: break;
    }
  }
  calculerLesMoyennes(jeu, parc);
}

// Une boutique : selon la famille de son genre (octet +25 de la fiche : 4, 1, 2 ou 8, dans cet
// ordre de priorité), deux ou trois grandeurs de la fiche s'ajoutent aux sommes de sa famille.
function releverUneBoutique(jeu, parc, p) {
  const genre = GENRES_DE_BOUTIQUES + mot(jeu, p + 0x16);
  const famille = octet(jeu, genre + 0x25);
  if (famille & 4) {
    ajouterAuMot(jeu, parc + 0xEA, mot(jeu, genre + 0x4D));
    ajouterAuMot(jeu, parc + 0xE8, mot(jeu, genre + 0x4F));
  } else if (famille & 1) {
    ajouterAuMot(jeu, parc + 0xEE, octetSigne(jeu, genre + 0x56));
    ajouterAuMot(jeu, parc + 0xF0, octetSigne(jeu, genre + 0x57));
    ajouterAuMot(jeu, parc + 0xF4, mot(jeu, genre + 0x4D));
    ajouterAuMot(jeu, parc + 0xF2, mot(jeu, genre + 0x4F));
  } else if (famille & 2) {
    ajouterAuMot(jeu, parc + 0xFA, octetSigne(jeu, genre + 0x56));
    ajouterAuMot(jeu, parc + 0xFC, octetSigne(jeu, genre + 0x57));
    ajouterAuMot(jeu, parc + 0x100, mot(jeu, genre + 0x4D));
    ajouterAuMot(jeu, parc + 0xFE, mot(jeu, genre + 0x4F));
  } else if (famille & 8) {
    ajouterAuMot(jeu, parc + 0x10C, mot(jeu, genre + 0x4D));
    ajouterAuMot(jeu, parc + 0x10E, mot(jeu, genre + 0x4F));
    ecrireOctet(jeu, parc + 0x10B, octet(jeu, parc + 0x10B) + octet(jeu, genre + 0x5D));
  }
}

// Un membre du personnel : son mot +9A est relevé à un minimum qui dépend de la sorte de son métier
// — 2 : le minimum du métier ; 8 et 0x16 : les mots +617 et +615 des comptes du joueur ([0xD3814]).
// Sortes vues dans la partie DEMO : 2, 8, 0x16 et 0x34 (non traitée).
function releverUnMembreDuPersonnel(jeu, p) {
  const metier = octet(jeu, p + 0x59) * TAILLE_METIER;
  const sorte = mot(jeu, SORTES_DE_METIERS + metier);
  let minimum;
  if (sorte === 2) minimum = mot(jeu, MINIMUMS_DES_METIERS + metier);
  else if (sorte === 8) minimum = mot(jeu, motLong(jeu, COMPTES_DU_JOUEUR) + 0x617);
  else if (sorte === 0x16) minimum = mot(jeu, motLong(jeu, COMPTES_DU_JOUEUR) + 0x615);
  else return;
  if (mot(jeu, p + 0x9A) < minimum) ecrireMot(jeu, p + 0x9A, minimum);
}

// Un visiteur (et, par l'anomalie dite plus haut, un membre du personnel) dont l'octet +4F ne vaut
// pas -1. Le mot long +75 est un compte de pas : la somme +BA cumule le temps écoulé depuis.
function releverUnVisiteur(jeu, parc, p) {
  if (octetSigne(jeu, p + 0x4F) === -1) return;
  ajouterAuMotLong(jeu, parc + 0xAA, motSigne(jeu, p + 0x54));
  ajouterAuMot(jeu, parc + 0xB2, octetSigne(jeu, p + 0x50));
  ajouterAuMot(jeu, parc + 0xB4, octetSigne(jeu, p + 0x51));
  ajouterAuMotLong(jeu, parc + 0xB6, mot(jeu, p + 0x6F));
  ajouterAuMotLong(jeu, parc + 0xBA, motLong(jeu, PAS_DE_SIMULATION) - motLong(jeu, p + 0x75));
  ajouterAuMotLong(jeu, parc + 0xBE, motSigne(jeu, p + 0x82));
}

// Une attraction : trois grandeurs de la fiche de son genre, et son mot +2E (l'usure ? non établi,
// retro-ingenierie.md § 6.3). Le mot +A5 retient la dernière dont le mot +3A dépasse 0x40.
function releverUneAttraction(jeu, parc, p) {
  const genre = GENRES_D_ATTRACTIONS + mot(jeu, p + 0x16);
  ecrireOctet(jeu, parc + 0x92, octet(jeu, parc + 0x92) + octet(jeu, genre + 0xB8));
  ajouterAuMot(jeu, parc + 0x93, octet(jeu, genre + 0xA8));
  ajouterAuMot(jeu, parc + 0x95, mot(jeu, genre + 0xAC));
  ajouterAuMotLong(jeu, parc + 0x97, mot(jeu, p + 0x2E));
  if (mot(jeu, p + 0x3A) > 0x40) ecrireMot(jeu, parc + 0xA5, numeroDeLObjet(jeu, p));
  const plusGrand = 0;   // le maximum jamais mis à jour (voir l'anomalie plus haut)
  if (mot(jeu, p + 0x2E) > plusGrand && octet(jeu, p + 0x4B) === 1) ecrireMot(jeu, parc + 0xA3, numeroDeLObjet(jeu, p));
}

// Les moyennes : chaque somme divisée par un nombre que tient le parc (octets +E7, +EC, +F8, +104
// pour les quatre familles de boutiques, mot +1F pour les visiteurs, octet +82 pour les
// attractions). Les divisions sont celles du programme, signées ou non selon le champ.
function calculerLesMoyennes(jeu, parc) {
  const moyenneSansSigne = (champ, n) => ecrireMot(jeu, parc + champ, div(mot(jeu, parc + champ), n));
  const moyenneSignee = (champ, n) => ecrireMot(jeu, parc + champ, idiv(motSigne(jeu, parc + champ), n, 16));

  let n = octet(jeu, parc + 0xE7);
  if (n !== 0) { moyenneSansSigne(0xEA, n); moyenneSansSigne(0xE8, n); }
  n = octet(jeu, parc + 0xEC);
  if (n !== 0) { moyenneSignee(0xEE, n); moyenneSignee(0xF0, n); moyenneSansSigne(0xF4, n); moyenneSansSigne(0xF2, n); }
  n = octet(jeu, parc + 0xF8);
  if (n !== 0) { moyenneSignee(0xFA, n); moyenneSignee(0xFC, n); moyenneSansSigne(0x100, n); moyenneSansSigne(0xFE, n); }
  n = octet(jeu, parc + 0x104);
  if (n !== 0) {
    ecrireMot(jeu, parc + 0x109, div(motLong(jeu, parc + 0x105), n));
    moyenneSansSigne(0x10C, n);
    moyenneSansSigne(0x10E, n);
    ecrireOctet(jeu, parc + 0x10B, idiv(octet(jeu, parc + 0x10B), n));
  }
  // Le nombre de boutiques : la somme des quatre nombres, sur un octet.
  ecrireOctet(jeu, parc + 0xE0, octet(jeu, parc + 0xEC) + octet(jeu, parc + 0xF8) + octet(jeu, parc + 0xE7)
    + octet(jeu, parc + 0x104));

  const visiteurs = motSigne(jeu, parc + 0x1F);
  if (visiteurs === 0) {
    for (const [champ, taille] of [[0xB2, 2], [0xB4, 2], [0xB6, 4], [0xBA, 4], [0xAE, 4], [0xBE, 4]]) {
      if (taille === 2) ecrireMot(jeu, parc + champ, 0); else ecrireMotLong(jeu, parc + champ, 0);
    }
  } else {
    ecrireMotLong(jeu, parc + 0xAE, idiv(motLongSigne(jeu, parc + 0xAA), visiteurs));
    moyenneSignee(0xB2, visiteurs);
    moyenneSignee(0xB4, visiteurs);
    // `div` sans signe, par le nombre étendu avec son signe.
    ecrireMotLong(jeu, parc + 0xB6, div(motLong(jeu, parc + 0xB6), visiteurs >>> 0));
    ecrireMotLong(jeu, parc + 0xBA, div(motLong(jeu, parc + 0xBA), visiteurs >>> 0));
    ecrireMotLong(jeu, parc + 0xBE, idiv(motLongSigne(jeu, parc + 0xBE), visiteurs));
  }

  const attractions = octet(jeu, parc + 0x82);
  if (attractions === 0) {
    for (const [champ, taille] of [[0x90, 2], [0x92, 1], [0x93, 2], [0x95, 2], [0x97, 4]]) {
      if (taille === 1) ecrireOctet(jeu, parc + champ, 0);
      else if (taille === 2) ecrireMot(jeu, parc + champ, 0);
      else ecrireMotLong(jeu, parc + champ, 0);
    }
  } else {
    ecrireMot(jeu, parc + 0x90, idiv(motLongSigne(jeu, parc + 0x8A), attractions));
    ecrireOctet(jeu, parc + 0x92, idiv(octet(jeu, parc + 0x92), attractions));
    moyenneSignee(0x93, attractions);
    moyenneSignee(0x95, attractions);
    ecrireMotLong(jeu, parc + 0x97, idiv(motLongSigne(jeu, parc + 0x97), attractions));
  }
}

// --- les bruitages -----------------------------------------------------------------------------------

// La couche de Bullfrog au-dessus de la bibliothèque HMI SOS (docs/retro-ingenierie.md § 9.3).
const BRUITAGES_PRETS = 0xBA720;       // octet : 1 d'origine ; 0 si le jeu est muet (options -s, -S, échec des pilotes)
const BRUITAGES_ACTIFS = 0xBA721;      // octet : 1 d'origine ; l'option des bruitages, basculée par 0x13BF3 et 0x50CCD
const NOMBRE_DE_BRUITAGES = 0xD7B68;   // mot
const PILOTE_NUMERIQUE = 0xD7B44;      // mot long : le pilote de SOS
const BANQUE_DE_BRUITAGES = 0xD7B60;   // pointeur : entrées de 32 octets, données en +12, taille en +1A
const DERNIER_ECHANTILLON = 0xD7B40;   // mot long : ce qu'a rendu le dernier départ
const PROPRIETAIRES = 0xD7998;         // 32 x (mot propriétaire, mot bruitage)
const VOLUMES = 0xD7A18;               // 32 mots
const DEPART = 0xBA729;                // la structure _SOS_START_SAMPLE passée à SOS
//   +0  pointeur lointain (décalage +0, sélecteur +4) : les données
//   +8  mot long : la taille, moins 16
//   +10 mot : le volume ; +12 mot : le numéro de l'échantillon ; +1C mot : 0x100 (non établi)
const ECHANTILLONS = 32;
const VOLUME_PLEIN = 0x7FFF;
const ECHANTILLON_TERMINE = 0x892DB;   // sosDIGISampleDone(pilote, numéro)
const LANCER_ECHANTILLON = 0x8943F;    // sosDIGIStartSample(pilote, départ : décalage, sélecteur)

// 0x80C80 — jouer le bruitage `numero` pour le propriétaire `proprietaire`, volume plein.
//
// Sans bruitages (jeu muet, ou option des bruitages coupée) ou pour un numéro au-delà du nombre de
// bruitages, rien. Sinon le premier des 32 numéros d'échantillon dont SOS dit qu'il est libre est
// pris ; aucun de libre, rien. Le numéro est comparé signé : un numéro négatif passe le contrôle. Le
// sélecteur passé à SOS est celui des données du programme (registre ds).
//
// Les bruitages sont les entrées 1 à [0xD7B68] de la banque (0x83608 les compte en sautant la
// première) : le contrôle « numéro ≤ nombre » est donc juste.
//
// Vérification : les scénarios sont joués sans carte son, et seul le premier test y est exercé.
// Avec une carte son (verifier.mjs --son), simulation.json, demo.json, ecrans.json et
// construction.json lancent des bruitages (numéros d'échantillon 0 à 3) ; ces appels ont aussi été
// comparés un à un, par une variante du comparateur avec carte son, sans divergence, de même que le
// numéro trop grand, le dernier numéro, les 32 échantillons pris et l'option coupée, provoqués à
// part.
export function jouerUnBruitage(jeu, proprietaire, numero) {
  if (octet(jeu, BRUITAGES_PRETS) === 0 || octet(jeu, BRUITAGES_ACTIFS) === 0) return;
  if (s16(numero) > mot(jeu, NOMBRE_DE_BRUITAGES)) return;
  let libre = -1;
  for (let k = 0; k < ECHANTILLONS; k++) {
    if (jeu.appeler(ECHANTILLON_TERMINE, motLong(jeu, PILOTE_NUMERIQUE), k) !== 0) { libre = k; break; }
  }
  if (libre < 0) return;
  ecrireMot(jeu, PROPRIETAIRES + libre * 4, proprietaire);
  ecrireMot(jeu, PROPRIETAIRES + libre * 4 + 2, numero);
  ecrireMot(jeu, DEPART + 0x12, libre);
  ecrireMot(jeu, DEPART + 0x1C, 0x100);
  ecrireMot(jeu, DEPART + 0x10, VOLUME_PLEIN);
  ecrireMot(jeu, VOLUMES + libre * 2, mot(jeu, DEPART + 0x10));
  const bruitage = (motLong(jeu, BANQUE_DE_BRUITAGES) + s16(numero) * 32) >>> 0;
  ecrireMotLong(jeu, DEPART + 8, motLong(jeu, bruitage + 0x1A) - 0x10);
  const selecteur = jeu.T.R.ds & 0xFFFF;
  ecrireMot(jeu, DEPART + 4, selecteur);
  ecrireMotLong(jeu, DEPART + 0, motLong(jeu, bruitage + 0x12));
  ecrireMotLong(jeu, DERNIER_ECHANTILLON, jeu.appeler(LANCER_ECHANTILLON, motLong(jeu, PILOTE_NUMERIQUE), DEPART, selecteur));
}

// --- la liste des réécritures ------------------------------------------------------------------------

// Ce que les fonctions des listes écrivent hors des zones comparées par défaut : la table des objets
// du parc et la carte, toutes deux dans le tas.
function objetsEtCarte(jeu) {
  return [
    [motLong(jeu, OBJETS_DU_PARC), motLong(jeu, FIN_DES_OBJETS_DU_PARC)],
    [motLong(jeu, CARTE), motLong(jeu, FIN_DE_LA_CARTE)],
  ];
}

export const reecritures = [
  { adresse: 0x18B92, nom: 'hasard', fn: hasardALEntree, arguments: 0, retour: true },
  { adresse: 0x80BF2, nom: 'valeurAbsolue', fn: valeurAbsolue, arguments: 1, retour: true },
  { adresse: 0x185C1, nom: 'poserEnTete', fn: poserEnTete, arguments: 3, zones: objetsEtCarte },
  { adresse: 0x1883E, nom: 'poserEnQueue', fn: poserEnQueue, arguments: 3, zones: objetsEtCarte },
  { adresse: 0x18918, nom: 'retirer', fn: retirer, arguments: 1, zones: objetsEtCarte },
  { adresse: 0x18A44, nom: 'deplacer', fn: deplacer, arguments: 3, retour: true, zones: objetsEtCarte },
  { adresse: 0x18ADF, nom: 'deplacerEnQueue', fn: deplacerEnQueue, arguments: 3, retour: true, zones: objetsEtCarte },
  { adresse: 0x204B9, nom: 'chercherSurLaCase', fn: chercherSurLaCase, arguments: 2, retour: true },
  { adresse: 0x281D5, nom: 'attractionAuBoutDeLaFile', fn: attractionAuBoutDeLaFile, arguments: 1, retour: true },
  { adresse: 0x349EB, nom: 'directionVersLaCible', fn: directionVersLaCible, arguments: 3, retour: true,
    zones: objetsEtCarte },
  { adresse: 0x28D5A, nom: 'raccorderLAllee', fn: raccorderLAllee, arguments: 1, memoire: 'entiere' },
  { adresse: 0x2CBC0, nom: 'retracerLeSol', fn: retracerLeSol, arguments: 2, memoire: 'entiere' },
  { adresse: 0x78943, nom: 'inscrireAuLivre', fn: inscrireAuLivre, arguments: 2, memoire: 'entiere' },
  { adresse: 0x68E34, nom: 'releverLesStatistiques', fn: releverLesStatistiques, arguments: 1, memoire: 'entiere' },
  { adresse: 0x80C80, nom: 'jouerUnBruitage', fn: jouerUnBruitage, arguments: 2, memoire: 'entiere' },
];
