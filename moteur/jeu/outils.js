// Les outils de pose de la barre d'outils, et ce qui les défait.
//
// Réécriture lisible de 0x29340, 0x29686, 0x29E03, 0x2B576, 0x2B62F, 0x2B955, 0x2BA40, 0x2C2EC,
// 0x2C4E5, 0x2C913, 0x348ED, 0x40E92, 0x411AA, 0x4121E, 0x412E0 et 0x416EA.
// Voir docs/guide-reecriture.md, et docs/retro-ingenierie.md § 11.5 (la file des événements).
//
// Seize fonctions voisines de celles de construire.js (mur, allée, rails). Chacune sert un outil
// (le mot 0xD6670, interface-parc.js) de trois façons : le survol de la vue du parc (0x149A4) en
// demande l'aperçu (argument `poser` nul : la fonction rend l'image qu'elle poserait, sans rien
// écrire) ; la file des événements (0x2CCF8, evenements.js) l'exécute ; vider une case (0x205D7,
// construire.js) appelle son contraire. D'après les images que produit le scénario outils-basse :
//
//   outil 4   la rivière, un canal d'eau (images de sol 0x8B et suivantes)   0x29340, demande 0x08
//   outil 12  un lac, trois cases sur trois (images 0xB8 et suivantes)        0x412E0, demande 0x16 ;
//             son aperçu, 0x416EA
//   outil 13  une flèche de sens unique peinte sur une allée                 0x2B576, demande 0x18
//   outil 14  un panneau indicateur à trois flèches                          0x2B62F, demande 0x1A
//   outil 15  une installation (les toilettes) : objet de type 0x18          0x40E92, demande 0x1C
//   outil 16  un circuit (images de sol 0xCD et suivantes)                   0x29686, demande 0x1E
//   outil 18  un looping sur une voie                                         0x29E03, demande 0x20
//   outils 19 et 21 : reposer l'employé porté                                 0x348ED, demande 0x22
//
// Et pour défaire (appelées par 0x205D7) : 0x2B955 un mur, 0x2BA40 une allée, 0x2C2EC et 0x2C4E5
// une case de rivière ou de circuit (le drapeau de sol 0x40), 0x411AA un décor fixe, 0x4121E une
// installation ; et 0x2C913, appelée par 0x2C6B8 (voies.js), un looping, qui redevient voie droite.
//
// LES SOLS. Chaque case de la carte ([0xD3B08], 64 × 64 cellules de 4 octets) porte en +2 son
// image de sol ; la table 0xB44D9 donne, pour chaque image, 4 octets : le mot +0 ses drapeaux (1 un
// mur, 2 une allée, 4 une attraction, 8 une file, 0x40 l'eau — rivière et circuit —, 0x800 un lac,
// 0x8000 : les panneaux voisins s'y orientent), l'octet +3 son numéro de forme. Une famille de sols
// (les murs, la rivière…) occupe des images consécutives, une par forme : l'image d'une case est la
// première de sa famille plus sa forme, et changer de forme, c'est retrancher l'ancienne et ajouter
// la nouvelle. Les formes des tracés : 0 isolée, 1 à 4 les virages, 5 et 6 les droites nord-sud et
// est-ouest, 7 à 0xA les bouts ouverts à l'ouest, à l'est, au sud et au nord (voies.js, § 11.15).
//
// VÉRIFICATION : voir le rapport de fin de module, et « enAttente ».

import { Cadre } from './cadre.js';
import { garderLePont } from './corrections.js';   // hors du jeu d'origine (reglages.js)

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const idiv = (a, b) => ((a | 0) / (b | 0)) | 0;

const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// --- les variables du jeu ----------------------------------------------------------------------
const CARTE = 0xD3B08;                // pointeur : 64 × 64 cellules de 4 octets (+0 mot le premier
                                      // objet posé, négatif pour un décor fixe ; +2 le sol ; +3 des
                                      // drapeaux : 8 case réservée, 0x10 un panneau indicateur,
                                      // 0x20 une flèche de sens unique, bits 6-7 sa direction)
const TAILLE_CARTE = 64;
const OBJETS = 0xD3B10, TAILLE_OBJET = 200;   // pointeur : la table des 1 200 objets du parc
const FIN_DES_OBJETS = 0xD3B78;       // pointeur : la fin de cette table
const OBJETS_DES_ELEMENTS = 0xD3B38;  // pointeur : un mot par élément, son objet graphique
const IMAGES_DE_SOL = 0xD3B90;        // pointeur : les images de sol, 6 octets chacune
const FICHE_DU_JOUEUR = 0xD3808;      // pointeur : +0x37 les dépenses (mot long), +0x63 + fiche le
                                      // nombre d'attractions de chaque fiche
const FICHE_DU_PARC = 0xD3818;        // pointeur : +0x7C les décors fixes, +0x7E les cases de lac,
                                      // +0x83 les installations tournées vers une allée
const COMPTES = 0xD4704;              // mot, 0x6C2 octets par joueur : l'objet que désignent les
                                      // comptes du joueur ([0xD3814] + 0x2C8, § 11.5)
const TAILLE_COMPTES = 0x6C2;
const JOUEUR = 0xD665C;               // mot : le joueur de cette machine
const REDESSINER_CARTE = 0xD666E;     // mot : le fond de la vue est à refaire
const MODE = 0xDE5F6;                 // octet : bit 0 la basse résolution (320x200)
const LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;   // mots : 48×32 ou 24×16
const FICHE_DECOR = 0xD6646;          // mot : la fiche choisie dans le catalogue des décors

const SOLS = 0xB44D9;                 // 4 octets par image de sol : +0 le mot des drapeaux
const FORMES_DES_SOLS = 0xB44DC;      //   +3 le numéro de forme
const VOISINES = 0xB4920;             // 4 mots signés : −64, 1, 64, −1 (nord, est, sud, ouest)
const HUIT_VOISINES = 0xB8C3E;        // 8 mots signés : les huit cases autour
const BIT_VERS_LA_CASE = 0xB4B1D;     // 4 octets : depuis la voisine k, le bit de la direction qui
                                      // ramène à la case (4, 8, 1, 2)
const PAS_DE_LA_DIRECTION = 0xB4B2A;  // mot signé par bit de direction : le pas en cases
const PAS_DE_LA_DIRECTION_BIS = 0xB7DF4;  // la même table, recopiée ailleurs (0x2C2EC la lit)
const OPPOSEE = 0xB8C35;              // octet par bit de direction : la direction opposée
const EXTREMITES = 0xB8BB0;           // 2 octets par forme : les deux directions de ses bouts
const FORME_D_APRES_SORTIES = 0xB8C01;    // octet par masque de sorties : la forme
const SORTIES_DES_BOUTS = 0xB8BD8;    // octet par forme : la sortie d'un bout (formes 7 à 0xA),
                                      // 0 pour toute autre
const SORTIES_DES_ALLEES = 0xB4990;   // octet par forme d'allée : ses sorties (5 nord-sud, 0xA est-ouest)
const SORTIES_DE_L_EAU = 0xB49C1;     // octet par forme de rivière : ses sorties
const MUR_D_APRES_VOISINS = 0xB8BA0;  // octet par masque : la forme d'un mur
const SORTIES_DES_MURS = 0xB4980;     // octet par forme de mur : ses voisins raccordés
const PONT_SUR_ALLEE = 0xB8BC6;       // octet par forme : la forme d'allée, 0x10 et 0x11 les ponts
const PONT_SUR_FILE = 0xB8BEF;        // octet par forme : la forme de file, 0xB et 0xC les ponts

const ATTRACTIONS = 0xCCED0, TAILLE_ATTRACTION = 200;   // le catalogue des attractions
const DECORS = 0xCCA70, TAILLE_DECOR = 0x38;           // le catalogue des décors et installations
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;         // le catalogue du personnel (§ 10.5)
const IMAGES_DES_GENRES_DE_VOIE = 0xB4397;             // 10 octets par genre de voie : +0 la 1re figure

// --- les fonctions du jeu appelées ---------------------------------------------------------------
const RETRACER_LE_SOL = 0x2CBC0;      // (case, image + 1) : retrace la case dans le fond
const CHERCHER_SUR_LA_CASE = 0x204B9; // (cellule, type) : le premier objet de ce type, ou 0
const VIDER_LA_CASE = 0x205D7;        // (case), construire.js
const RACCORDER_L_ALLEE = 0x28D5A;    // (case) : reprend l'image d'une allée d'après ses voisines
const POSER_EN_TETE = 0x185C1;        // (objet, x, y) : l'inscrire sur la liste de sa case
const PLACER = 0x18A44;               // (objet, x, y) : l'amener en (x, y), en 256es de case
const RETIRER_L_OBJET = 0x18B62;      // (objet) : le retirer de sa case, remettre ses 200 octets à 0
const VALEUR_ABSOLUE = 0x80BF2;
const INSCRIRE_AU_LIVRE = 0x78943;    // (catégorie, montant) : simulation-outils.js
const TRACER_BASSE = 0x5EC9C, TRACER_HAUTE = 0x55BD4;  // (x, y, image)

// --- petits accès ------------------------------------------------------------------------------
const cellule = (jeu, numero) => (long(jeu, CARTE) + (numero & 0xFFFF) * 4) >>> 0;
// La cellule d'une case décalée : l'original additionne sur 32 bits, sans borner.
const celluleDecalee = (jeu, numero, decalage) => (long(jeu, CARTE) + (numero + decalage) * 4) >>> 0;
const voisine = (jeu, cel, k) => (cel + motSigne(jeu, VOISINES + k * 2) * 4) >>> 0;
const drapeaux = (jeu, cel) => mot(jeu, SOLS + jeu.m8[cel + 2] * 4);
const forme = (jeu, cel) => jeu.m8[FORMES_DES_SOLS + jeu.m8[cel + 2] * 4];
const objet = (jeu, numero) => (long(jeu, OBJETS) + numero * TAILLE_OBJET) >>> 0;
const numeroDObjet = (jeu, o) => idiv(o - long(jeu, OBJETS), TAILLE_OBJET);
const objetGraphique = (jeu, element) => mot(jeu, long(jeu, OBJETS_DES_ELEMENTS) + element * 2);
const retracer = (jeu, numero, image) => jeu.appeler(RETRACER_LE_SOL, numero & 0xFFFF, (image + 1) & 0xFFFF);
const basseResolution = (jeu) => (jeu.m8[MODE] & 1) !== 0;

// Changer la forme d'une case en gardant sa famille de sols.
function changerDeForme(jeu, cel, nouvelle) {
  jeu.m8[cel + 2] = (nouvelle + jeu.m8[cel + 2] - forme(jeu, cel)) & 0xFF;
}

// Les drapeaux de sol.
const MUR = 1, ALLEE = 2, FILE = 8, EAU = 0x40, LAC = 0x800;
const RESERVEE = 8;                   // bit de l'octet +3 d'une cellule : l'entrée du parc, sa clôture

// =================================================================================================
// 0x29340 (outil 4, demande 0x08) et 0x29686 (outil 16, demande 0x1E) — une case de rivière, une
// case de circuit.
//
// Les deux sont des tracés d'eau (drapeau 0x40), dont la forme dit les sorties. La case se raccorde
// à au plus deux voisines (nord, est, sud, ouest, dans cet ordre) : une voisine d'eau compte si
// c'est un bout ouvert (formes 7 à 0xA) ou une case isolée (forme 0) ; un morceau déjà pris des deux
// côtés est ignoré. Avec `poser`, chaque voisine qui compte gagne une sortie vers la case, et la
// case prend la forme de ses sorties (0xB8C01) ; sans `poser`, la fonction rend l'image qu'elle
// poserait. Rend 0 si la case est refusée, 1 si elle est posée.
//
// Rivière et circuit ne se mêlent pas : les images de circuit commencent à 0xCD, celles de la
// rivière à 0x8B. La rivière ignore une voisine de circuit, le circuit ne compte que ses pareilles.
// Anomalie probable, reproduite : la borne haute (0xD8) est comparée à l'image de la case posée et
// non à celle de la voisine ; une case dont le sol est 0xD8 ou plus renverse donc les deux tests
// (la rivière y compte une voisine de circuit, le circuit n'en compte aucune). Sens non établi.
//
// LA RIVIÈRE (0x29340) passe sur l'herbe, ou sous une allée ou une file droite (sorties 5 ou 0xA),
// qui devient un pont : sa forme passe à 0x10 ou 0x11 (0xB8BC6 pour une allée, 0xB8BEF pour une
// file), et la fonction rend l'image du pont, ou, en posant, cette image dans le mot bas d'eax — le
// mot haut étant celui que 0x2CBC0 a laissé. Une allée ou une file qui est déjà un pont (drapeaux
// 0x42, 0x48), une case réservée, tout autre sol : refusés. Une voisine allée ou file ne compte que
// si la case n'en est pas une ; en posant, on ne la change pas.
const RIVIERE = 0x8B, CIRCUIT = 0xCD, FIN_DU_CIRCUIT = 0xD8;

export function riviereSurUneCase(jeu, numeroCase, poser) {
  const m8 = jeu.m8;
  const numero = numeroCase & 0xFFFF;
  const pose = (poser & 0xFFFF) !== 0;
  const cel = cellule(jeu, numero);
  const d = drapeaux(jeu, cel);
  if (d !== 0 && (d & (ALLEE | FILE)) === 0) return 0;
  if (d === (EAU | ALLEE) || d === (EAU | FILE)) return 0;
  if (m8[cel + 3] & RESERVEE) return 0;
  let sorties = 0;
  if (d & (ALLEE | FILE)) {
    sorties = m8[SORTIES_DES_ALLEES + forme(jeu, cel)];
    if (sorties !== 5 && sorties !== 0xA) return 0;
  }

  let masque = 0;
  let raccordees = 0;
  for (let k = 0; k < 4 && raccordees < 2; k++) {
    const v = voisine(jeu, cel, k);
    const dv = drapeaux(jeu, v);
    if ((dv & EAU) === 0) continue;
    if (m8[v + 2] >= CIRCUIT && m8[cel + 2] < FIN_DU_CIRCUIT) continue;
    if ((dv & (ALLEE | FILE)) && (d & (ALLEE | FILE)) === 0) {
      raccordees++;
      masque |= 1 << k;
      continue;
    }
    const formeVoisine = forme(jeu, v);
    const sortie = m8[SORTIES_DES_BOUTS + formeVoisine];
    if (sortie === 0 && formeVoisine !== 0) continue;
    raccordees++;
    masque |= 1 << k;
    if (!pose || (dv & (ALLEE | FILE))) continue;
    changerDeForme(jeu, v, m8[FORME_D_APRES_SORTIES + (m8[BIT_VERS_LA_CASE + k] | sortie)]);
    retracer(jeu, numero + mot(jeu, VOISINES + k * 2), m8[v + 2]);
  }

  // Sous une allée ou une file : un pont.
  if (d & (ALLEE | FILE)) {
    const table = (d & ALLEE) ? PONT_SUR_ALLEE : PONT_SUR_FILE;
    // Une allée nord-sud prend la forme 0x11, est-ouest 0x10 ; pour une file, c'est l'inverse.
    const choix = (d & ALLEE) ? (sorties === 5 ? 0x11 : 0x10) : (sorties === 5 ? 0x10 : 0x11);
    const image = (m8[table + choix] + m8[cel + 2] - forme(jeu, cel)) & 0xFF;
    if (!pose) return image;
    m8[cel + 2] = image;
    const eax = retracer(jeu, numero, m8[cel + 2]);
    return (eax & ~0xFFFF) | image;
  }

  const formeDeLaCase = m8[FORME_D_APRES_SORTIES + masque];
  if (!pose) return formeDeLaCase + RIVIERE;
  m8[cel + 2] = formeDeLaCase + RIVIERE;
  retracer(jeu, numero, m8[cel + 2]);
  return 1;
}

// LE CIRCUIT (0x29686) ne va que sur un sol nu (drapeaux nuls) et non réservé ; il ne compte que
// les voisines de circuit (images 0xCD et au-delà, drapeau 0x40).
export function circuitSurUneCase(jeu, numeroCase, poser) {
  const m8 = jeu.m8;
  const numero = numeroCase & 0xFFFF;
  const pose = (poser & 0xFFFF) !== 0;
  const cel = cellule(jeu, numero);
  if (drapeaux(jeu, cel) !== 0 || (m8[cel + 3] & RESERVEE)) return 0;

  let masque = 0;
  let raccordees = 0;
  for (let k = 0; k < 4 && raccordees < 2; k++) {
    const v = voisine(jeu, cel, k);
    if ((m8[SOLS + m8[v + 2] * 4] & EAU) === 0) continue;
    if (m8[v + 2] < CIRCUIT || m8[cel + 2] >= FIN_DU_CIRCUIT) continue;
    const formeVoisine = forme(jeu, v);
    const sortie = m8[SORTIES_DES_BOUTS + formeVoisine];
    if (sortie === 0 && formeVoisine !== 0) continue;
    raccordees++;
    masque |= 1 << k;
    if (!pose) continue;
    changerDeForme(jeu, v, m8[FORME_D_APRES_SORTIES + (m8[BIT_VERS_LA_CASE + k] | sortie)]);
    retracer(jeu, numero + mot(jeu, VOISINES + k * 2), m8[v + 2]);
  }

  const formeDeLaCase = m8[FORME_D_APRES_SORTIES + masque];
  if (!pose) return formeDeLaCase + CIRCUIT;
  m8[cel + 2] = formeDeLaCase + CIRCUIT;
  retracer(jeu, numero, m8[cel + 2]);
  return 1;
}

// =================================================================================================
// 0x29E03 (outil 18, demande 0x20) — un looping sur une voie.
//
// Le looping est une fiche du catalogue des attractions ([0xD665A] quand l'outil est en main) ; il
// se pose sur des morceaux de voie droits (objets de type 0x12) déjà en place, et les remplace. Son
// sens dépend du mot +0x22 de la fiche : 0xAF ou 0x108, un looping est-ouest de trois cases (la case
// visée et les deux à l'est), sinon un looping nord-sud de quatre cases (la case visée et les trois
// au nord). Chaque case doit porter un morceau de voie qui n'est pas à hauteur imposée (bit 4 de
// +5, la gare), de forme 6 (est-ouest) ou 5 (nord-sud), et tous à la même hauteur (+0x79).
// Rend 0 si le looping ne va pas, sinon l'élément de la fiche (+0x24), qu'on pose ou non.
//
// En posant : le premier morceau prend la forme 0x13 (est-ouest) ou 0x15 (nord-sud), l'objet
// graphique de l'élément +0x24 et un second (+0x90) de l'élément +0x26 ; les suivants la forme 0x14
// ou 0x16 et aucun objet graphique ; tous retiennent le premier (+0x61), la vitesse +0xB2 de la
// fiche (+0x80), et leur forme dessinée (+0x44). Le looping se paie comme une attraction : un de
// plus pour la fiche (+0x63 + fiche de la fiche du joueur, +0xC7 du catalogue), le coût (+0xA2)
// ajouté aux dépenses (+0x37) et inscrit au livre des comptes, catégorie 0.
//
// Anomalies reproduites : le looping est-ouest vérifie que la voie est du genre de la fiche
// (+0x16 du morceau contre l'octet signé +0xB4), le nord-sud ne le vérifie pas ; la hauteur de
// référence est celle du premier morceau non nul — une hauteur 0 compte pour « pas encore vue »,
// si bien que les hauteurs 0, 5, 5 passent.
const MORCEAU_DE_VOIE = 0x12;
const LOOPING_EST_OUEST_A = 0xAF, LOOPING_EST_OUEST_B = 0x108;

export function loopingSurUneCase(jeu, numeroCase, poser, fiche) {
  const m8 = jeu.m8;
  const cel = cellule(jeu, numeroCase);
  if (m8[cel + 3] & RESERVEE) return 0;
  const f = ATTRACTIONS + (fiche & 0xFFFF) * TAILLE_ATTRACTION;
  const sorte = mot(jeu, f + 0x22);
  const estOuest = sorte === LOOPING_EST_OUEST_A || sorte === LOOPING_EST_OUEST_B;
  // Les cases du looping, de la première à la dernière.
  const cases = estOuest ? [0, 1, 2].map((k) => cel + k * 4) : [0, -1, -2, -3].map((k) => cel + k * 0x100);
  const formeDroite = estOuest ? 6 : 5;

  let hauteur = 0;
  for (const c of cases) {
    const morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, c >>> 0, MORCEAU_DE_VOIE) >>> 0;
    if (morceau === 0) return 0;
    if (m8[morceau + 5] & 4) return 0;
    if (estOuest && mot(jeu, morceau + 0x16) !== s8(m8[f + 0xB4])) return 0;
    if (m8[morceau + 0xC] !== formeDroite) return 0;
    if (hauteur === 0) hauteur = m8[morceau + 0x79];
    if (m8[morceau + 0x79] !== hauteur) return 0;
  }

  if ((poser & 0xFFFF) !== 0) {
    const [premiere, suivante] = estOuest ? [0x13, 0x14] : [0x15, 0x16];
    let premier = 0;
    for (let k = 0; k < cases.length; k++) {   // (une boucle : le moteur réentrant, reentrer.mjs)
      const c = cases[k], morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, c >>> 0, MORCEAU_DE_VOIE) >>> 0;
      if (k === 0) {
        m8[morceau + 0xC] = premiere;
        poserMot(jeu, morceau + 0xA, objetGraphique(jeu, mot(jeu, f + 0x24)));
        poserMot(jeu, morceau + 0x90, objetGraphique(jeu, mot(jeu, f + 0x26)));
        premier = numeroDObjet(jeu, morceau);
      } else {
        m8[morceau + 0xC] = suivante;
        poserMot(jeu, morceau + 0xA, 0);
      }
      m8[morceau + 0x80] = m8[f + 0xB2];
      poserMot(jeu, morceau + 0x61, premier);
      m8[morceau + 0x44] = m8[morceau + 0xC];
    }
    const joueur = long(jeu, FICHE_DU_JOUEUR);
    m8[joueur + (fiche & 0xFFFF) + 0x63] = (m8[joueur + (fiche & 0xFFFF) + 0x63] + 1) & 0xFF;
    m8[f + 0xC7] = (m8[f + 0xC7] + 1) & 0xFF;
    const cout = long(jeu, f + 0xA2);
    poserLong(jeu, long(jeu, FICHE_DU_JOUEUR) + 0x37, long(jeu, long(jeu, FICHE_DU_JOUEUR) + 0x37) + cout);
    jeu.appeler(INSCRIRE_AU_LIVRE, 0, (-cout) | 0);
  }
  return mot(jeu, f + 0x24);
}

// 0x2C913 — défaire un looping : ses morceaux redeviennent de la voie droite.
//
// Appelée par 0x2C6B8 (retirer un morceau de voie, voies.js) pour une pièce spéciale, avec la
// cellule du morceau. Le looping est retrouvé à partir de n'importe lequel de ses morceaux : on
// remonte vers l'ouest (est-ouest) ou le sud (nord-sud) jusqu'au premier, puis ses trois ou quatre
// morceaux reprennent la forme droite, 6 ou 5, et l'image de leur genre de voie (0xB4397 : la
// première figure du genre, plus la forme). Le looping est rendu : un de moins pour sa fiche, et
// son coût retiré des dépenses — mais rien n'est inscrit au livre des comptes (non remboursé).
//
// La fiche n'est pas retenue par les morceaux : elle est cherchée dans le catalogue par son mot
// +0x22 — 0x108 pour un looping est-ouest sur une voie de genre non nul, 0xAF sur le genre 0, 0xB0
// pour tout looping nord-sud (anomalie : la pose accepte n'importe quelle fiche qui n'est pas
// est-ouest). La recherche ne s'arrête qu'à une fiche qui convient.
export function defaireUnLooping(jeu, celluleDuMorceau) {
  const m8 = jeu.m8;
  let cel = celluleDuMorceau >>> 0;
  let morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, cel, MORCEAU_DE_VOIE) >>> 0;
  if (morceau === 0 || (m8[cel + 3] & RESERVEE)) return;

  const chercherLaFiche = (sorte) => {
    let k = 0;
    while (mot(jeu, ATTRACTIONS + s16(k) * TAILLE_ATTRACTION + 0x22) !== sorte) k = (k + 1) | 0;
    return s16(k);
  };
  const rendre = (k) => {
    const f = ATTRACTIONS + k * TAILLE_ATTRACTION;
    const joueur = long(jeu, FICHE_DU_JOUEUR);
    m8[joueur + k + 0x63] = (m8[joueur + k + 0x63] - 1) & 0xFF;
    poserLong(jeu, joueur + 0x37, long(jeu, joueur + 0x37) - long(jeu, f + 0xA2));
    m8[f + 0xC7] = (m8[f + 0xC7] - 1) & 0xFF;
  };
  const redresser = (formeDroite) => {
    m8[morceau + 0xC] = formeDroite;
    m8[morceau + 0x44] = formeDroite;
    const premiereFigure = mot(jeu, IMAGES_DES_GENRES_DE_VOIE + mot(jeu, morceau + 0x16) * 10);
    poserMot(jeu, morceau + 0xA, objetGraphique(jeu, premiereFigure + m8[morceau + 0x44]));
  };

  if (m8[morceau + 0xC] <= 0x14) {     // est-ouest : 0x13 le premier, 0x14 les suivants
    rendre(chercherLaFiche(mot(jeu, morceau + 0x16) !== 0 ? LOOPING_EST_OUEST_B : LOOPING_EST_OUEST_A));
    let k = 0;
    while (m8[morceau + 0xC] === 0x14) {
      k = s16(k - 1);
      morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, (cel + k * 4) >>> 0, MORCEAU_DE_VOIE) >>> 0;
    }
    cel = (cel + k * 4) >>> 0;
    for (let n = 0; n < 3; n++) {
      redresser(6);
      cel = (cel + 4) >>> 0;
      morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, cel, MORCEAU_DE_VOIE) >>> 0;
    }
  } else {                             // nord-sud : 0x15 le premier, au sud ; 0x16 les suivants
    const k0 = chercherLaFiche(0xB0);
    // L'ordre des trois retraits diffère de l'autre branche ; sans effet.
    const f = ATTRACTIONS + k0 * TAILLE_ATTRACTION;
    const joueur = long(jeu, FICHE_DU_JOUEUR);
    poserLong(jeu, joueur + 0x37, long(jeu, joueur + 0x37) - long(jeu, f + 0xA2));
    m8[f + 0xC7] = (m8[f + 0xC7] - 1) & 0xFF;
    m8[long(jeu, FICHE_DU_JOUEUR) + k0 + 0x63] = (m8[long(jeu, FICHE_DU_JOUEUR) + k0 + 0x63] - 1) & 0xFF;
    let k = 0;
    while (m8[morceau + 0xC] === 0x16) {
      k = s16(k + 1);
      morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, (cel + k * 0x100) >>> 0, MORCEAU_DE_VOIE) >>> 0;
    }
    cel = (cel + k * 0x100) >>> 0;
    for (let n = 0; n < 4; n++) {
      redresser(5);
      cel = (cel - 0x100) >>> 0;
      morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, cel, MORCEAU_DE_VOIE) >>> 0;
    }
  }
  poserMot(jeu, REDESSINER_CARTE, 1);
}

// =================================================================================================
// 0x2B576 (outil 13, demande 0x18) — une flèche de sens unique peinte sur une allée.
//
// La flèche est dans l'octet +3 de la cellule : le bit 0x20 la marque, les bits 6 et 7 sa direction
// (0 à 3). Elle ne va que sur une allée simple (drapeaux de sol exactement 2) non réservée ; sinon
// la fonction rend −1. Sur une case qui en porte déjà une, elle rend la direction suivante, et en
// posant la fait tourner d'un quart ; sur une case sans flèche, elle rend la direction que gardent
// les bits 6 et 7 (dans le mot bas, le mot haut restant à 0xFFFF : l'original n'écrit que le mot
// bas de sa variable, initialisée à −1), et en posant peint la flèche dans cette direction.
export function flecheSurUneAllee(jeu, numeroCase, poser) {
  const m8 = jeu.m8;
  const cel = cellule(jeu, numeroCase);
  if (m8[cel + 3] & RESERVEE) return -1;
  if (drapeaux(jeu, cel) !== ALLEE) return -1;
  const pose = (poser & 0xFF) !== 0;
  if (m8[cel + 3] & 0x20) {
    const direction = ((m8[cel + 3] >> 6) + 1) & 3;
    if (pose) {
      m8[cel + 3] = (m8[cel + 3] & 0x1F) | (direction << 6) | 0x20;
      poserMot(jeu, REDESSINER_CARTE, 1);
    }
    return direction;
  }
  const direction = m8[cel + 3] >> 6;
  if (pose) {
    m8[cel + 3] |= 0x20;
    poserMot(jeu, REDESSINER_CARTE, 1);
  }
  return (0xFFFF0000 | direction) | 0;
}

// =================================================================================================
// 0x2B62F (outil 14, demande 0x1A) — un panneau indicateur, ou une flèche de plus sur un panneau.
//
// Le panneau (objet de type 0x14, état 8) se dresse sur une allée non réservée. Il porte trois
// flèches, qui montrent une attraction, une boutique et un objet de type 0x14 : pour chacune, en
// +0x66 + n l'octet de sa direction (0 nord, 1 est, 2 sud, 3 ouest) et en +0x69 + 2n le mot du
// numéro de l'objet montré. L'objet à montrer est celui que désignent les comptes du joueur (le mot
// +0x2C8, choisi par le clic sur une attraction ou une boutique, vraisemblablement).
//
//  - Sur une case sans panneau : il faut un objet désigné et un emplacement libre dans la table des
//    objets ; le panneau y est créé, posé sur la case (0x185C1), et la cellule marquée (bit 0x10).
//  - Sur un panneau déjà là, l'objet montré est celui que désignent les comptes, et à défaut celui
//    de la première flèche posée (ou l'objet 0 si aucune ne l'est).
// Puis la flèche de la sorte de l'objet (attraction 0, boutique 1, type 0x14 : 2) le montre : la
// direction est celle de l'axe où l'objet est le plus loin ; si la flèche montrait déjà quelque
// chose, elle tourne plutôt d'un quart. Rend 1, ou 0 si rien n'a été fait.
//
// Anomalie reproduite : le numéro de flèche est une variable locale ([ebp−0x14]) que seule la sorte
// de l'objet écrit. Pour un objet qui n'est ni attraction, ni boutique, ni de type 0x14, il est lu
// **sans avoir été écrit**, comme la boucle qui efface les trois flèches d'un panneau neuf (elle
// efface trois fois la « flèche » d'indice [ebp−0x14] au lieu des flèches 0, 1 et 2) : on y lit ce
// qu'un appel précédent a laissé sur la pile. La réécriture ouvre le cadre de l'original pour lire
// le même mot.
const PANNEAU_INDICATEUR = 0x14, ETAT_PANNEAU = 8;
const INSTALLATION = 0x18;
const FLECHE_ATTRACTION = 0, FLECHE_BOUTIQUE = 1, FLECHE_TYPE_14 = 2;

export function panneauIndicateur(jeu, numeroCase) {
  const cadre = new Cadre(jeu, 0x2C);
  try {
    return poserUnPanneau(jeu, cadre, numeroCase);
  } finally {
    cadre.fermer();
  }
}

function poserUnPanneau(jeu, cadre, numeroCase) {
  const m8 = jeu.m8;
  const numero = numeroCase & 0xFFFF;
  const cel = cellule(jeu, numero);
  if (m8[cel + 3] & RESERVEE) return 0;
  if ((m8[SOLS + m8[cel + 2] * 4] & ALLEE) === 0) return 0;
  const objets = long(jeu, OBJETS);
  const designe = () => objet(jeu, mot(jeu, COMPTES + mot(jeu, JOUEUR) * TAILLE_COMPTES));
  // Le numéro de flèche, jamais initialisé : le mot [ebp−0x14] du cadre.
  let fleche = mot(jeu, cadre.local(0x14));

  let panneau = jeu.appeler(CHERCHER_SUR_LA_CASE, cel, PANNEAU_INDICATEUR) >>> 0;
  let cible;
  if (panneau !== 0 && m8[panneau + 0xC] === ETAT_PANNEAU) {
    cible = designe();
    if (cible <= objets) {
      for (let n = 0; n < 3; n++) {
        cible = objet(jeu, mot(jeu, panneau + 0x69 + n * 2));
        if (cible > objets) break;
      }
    }
  } else {
    cible = designe();
    if (cible <= objets) return 0;
    const fin = long(jeu, FIN_DES_OBJETS);
    let libre = false;
    for (panneau = (objets + TAILLE_OBJET) >>> 0; panneau < fin; panneau = (panneau + TAILLE_OBJET) >>> 0) {
      if (m8[panneau + 4] === 0) { libre = true; break; }
    }
    if (libre) {
      m8[panneau + 4] = PANNEAU_INDICATEUR;
      m8[panneau + 0xC] = ETAT_PANNEAU;
      m8[panneau + 7] = numero % TAILLE_CARTE;
      m8[panneau + 9] = numero >> 6;
      jeu.appeler(POSER_EN_TETE, panneau, mot(jeu, panneau + 6), mot(jeu, panneau + 8));
      m8[cel + 3] |= 0x10;
      for (let n = 0; n < 3; n++) poserMot(jeu, panneau + 0x69 + fleche * 2, 0);   // l'anomalie
    } else if (panneau === fin) {
      return 0;
    }
    // (Une table dont la fin ne tomberait pas sur un emplacement laisserait l'original continuer
    // avec l'adresse au-delà de la fin : reproduit.)
  }

  // La direction : l'axe le plus éloigné, vers l'objet.
  const dc = s16(m8[panneau + 7] - m8[cible + 7]);
  const dr = s16(m8[panneau + 9] - m8[cible + 9]);
  const ecartColonnes = jeu.appeler(VALEUR_ABSOLUE, dc) | 0;
  const ecartRangees = jeu.appeler(VALEUR_ABSOLUE, dr) | 0;
  let direction;
  if (ecartColonnes > ecartRangees) direction = dc > 0 ? 3 : 1;
  else direction = dr > 0 ? 0 : 2;

  const type = m8[cible + 4];
  if (type === 4) fleche = FLECHE_ATTRACTION;
  else if (type === 0xA) fleche = FLECHE_BOUTIQUE;
  else if (type === PANNEAU_INDICATEUR) fleche = FLECHE_TYPE_14;
  if (mot(jeu, panneau + 0x69 + fleche * 2) !== 0) {
    m8[panneau + 0x66 + fleche] = (m8[panneau + 0x66 + fleche] + 1) & 3;
  } else {
    m8[panneau + 0x66 + fleche] = direction;
  }
  poserMot(jeu, panneau + 0x69 + fleche * 2, numeroDObjet(jeu, cible));
  return 1;
}

// =================================================================================================
// Défaire ce que la case porte (appelées par 0x205D7, vider la case, construire.js).
//
// 0x2B955 — ôter un mur : les murs voisins perdent leur raccord vers la case (table 0xB4980 des
// voisins d'une forme de mur, moins le bit de la direction, puis 0xB8BA0). Le sol de la case
// elle-même est remis à zéro par l'appelant. Rend 0 si la case n'est pas un mur non réservé, 1 sinon.
export function oterUnMur(jeu, numeroCase) {
  const m8 = jeu.m8;
  const cel = cellule(jeu, numeroCase);
  if ((m8[SOLS + m8[cel + 2] * 4] & MUR) === 0 || (m8[cel + 3] & RESERVEE)) return 0;
  for (let k = 0; k < 4; k++) {
    const v = voisine(jeu, cel, k);
    if ((m8[SOLS + m8[v + 2] * 4] & MUR) === 0) continue;
    const raccords = m8[SORTIES_DES_MURS + forme(jeu, v)] & ~m8[BIT_VERS_LA_CASE + k];
    changerDeForme(jeu, v, m8[MUR_D_APRES_VOISINS + raccords]);
  }
  return 1;
}

// 0x2BA40 — ôter une allée. La case redevient de l'herbe (sol 0) ; un pont redevient de l'eau
// (images 0x90 et 0x91 d'après les sorties 5 et 0xA de la rivière ; une autre forme reste telle
// quelle). Puis les installations (type 0x18) des quatre voisines dont le sol porte le drapeau
// 0x8000 et qui ne sont pas de l'état 4 se tournent vers la dernière allée qui les borde encore
// (leur objet graphique suit : l'objet de leur fiche de décor, plus la direction) ; les allées des
// huit cases autour se raccordent de nouveau (0x28D5A), et la flèche de sens unique est effacée
// (bits 5 à 7 de l'octet +3). Rend 0 si la case n'est pas une allée non réservée, 1 sinon.
export function oterUneAllee(jeu, numeroCase) {
  const m8 = jeu.m8;
  const numero = numeroCase & 0xFFFF;
  const cel = cellule(jeu, numero);
  if ((m8[SOLS + m8[cel + 2] * 4] & ALLEE) === 0 || (m8[cel + 3] & RESERVEE)) return 0;

  let allees = 0;
  for (let k = 0; k < 8; k++) {
    const v = (cel + motSigne(jeu, HUIT_VOISINES + k * 2) * 4) >>> 0;
    if (m8[SOLS + m8[v + 2] * 4] & ALLEE) allees |= 1 << k;
  }

  if (m8[SOLS + m8[cel + 2] * 4] & EAU) {
    const sorties = m8[SORTIES_DE_L_EAU + forme(jeu, cel)];
    if (sorties === 5) {
      m8[cel + 2] = 0x90;
      retracer(jeu, numero, m8[cel + 2]);
    } else if (sorties === 0xA) {
      m8[cel + 2] = 0x91;
      retracer(jeu, numero, m8[cel + 2]);
    }
  } else {
    m8[cel + 2] = 0;
    retracer(jeu, numero, 0);
  }

  const objets = long(jeu, OBJETS);
  for (let k = 0; k < 4; k++) {
    const v = voisine(jeu, cel, k);
    if ((m8[SOLS + 1 + m8[v + 2] * 4] & 0x80) === 0) continue;
    const installation = jeu.appeler(CHERCHER_SUR_LA_CASE, v, INSTALLATION) >>> 0;
    if (installation <= objets || m8[installation + 0xC] === 4) continue;
    for (let j = 0; j < 4; j++) {
      const w = voisine(jeu, v, j);
      if ((m8[SOLS + m8[w + 2] * 4] & ALLEE) === 0) continue;
      m8[installation + 0x12] = j;
      const base = motSigne(jeu, DECORS + 0x26 + mot(jeu, installation + 0x16) * TAILLE_DECOR);
      poserMot(jeu, installation + 0xA, objetGraphique(jeu, base + m8[installation + 0x12]));
    }
  }

  for (let k = 0; k < 8; k++) {
    if (allees & (1 << k)) jeu.appeler(RACCORDER_L_ALLEE, (numero + mot(jeu, HUIT_VOISINES + k * 2)) & 0xFFFF);
  }
  m8[cel + 3] &= 0x1F;
  return 1;
}

// 0x2C2EC et 0x2C4E5 — ôter une case de rivière ou de circuit (drapeau 0x40). Les deux voisines que
// ses bouts touchent (0xB8BB0 : deux directions par forme) perdent leur sortie vers la case — leur
// forme est refaite d'après leurs sorties (0xB49C1) moins la direction opposée —, puis la case
// redevient de l'herbe. 0x2C2EC ne touche une voisine que si elle est de l'eau ; 0x2C4E5, sa
// jumelle, ne le vérifie pas (et lit le pas dans 0xB4B2A plutôt que dans sa copie 0xB7DF4).
// 0x205D7 appelle l'une puis l'autre sur la même case : la seconde n'y trouve plus d'eau et ne fait
// rien.
//
// Défaut de 1994 : une voisine qui est un pont (eau et allée, ou eau et file) est traitée comme une case
// de rivière, et son image, refaite dans la famille des allées, devient une route en T tournée vers
// l'herbe de la case effacée et vers l'eau (retour 75 de docs/demandes.md). Le réglage
// corrigerLesPonts la laisse telle quelle (corrections.js, garderLePont).
function oterDeLEau(jeu, numeroCase, verifierLaVoisine, pasDesDirections) {
  const m8 = jeu.m8;
  const numero = numeroCase & 0xFFFF;
  const cel = cellule(jeu, numero);
  if ((m8[SOLS + m8[cel + 2] * 4] & EAU) === 0 || (m8[cel + 3] & RESERVEE)) return;
  for (let bout = 0; bout < 2; bout++) {
    const direction = m8[EXTREMITES + forme(jeu, cel) * 2 + bout];
    if (direction === 0) continue;
    const v = (cel + motSigne(jeu, PAS_DE_LA_DIRECTION + direction * 2) * 4) >>> 0;
    if (verifierLaVoisine && (m8[SOLS + m8[v + 2] * 4] & EAU) === 0) continue;
    // Un pont voisin serait refait comme une case de rivière : une route en T vers l'herbe et l'eau
    // (réglage corrigerLesPonts, corrections.js). Éteint, il l'est, comme en 1994.
    if (garderLePont(drapeaux(jeu, v))) continue;
    const sorties = m8[SORTIES_DE_L_EAU + forme(jeu, v)] & ~m8[OPPOSEE + direction];
    changerDeForme(jeu, v, m8[FORME_D_APRES_SORTIES + sorties]);
    retracer(jeu, numero + mot(jeu, pasDesDirections + direction * 2), m8[v + 2]);
  }
  m8[cel + 2] = 0;
  retracer(jeu, numero, 0);
}

export const oterDeLaRiviere = (jeu, numeroCase) => oterDeLEau(jeu, numeroCase, true, PAS_DE_LA_DIRECTION_BIS);
export const oterDeLaRiviereSansVerifier = (jeu, numeroCase) =>
  oterDeLEau(jeu, numeroCase, false, PAS_DE_LA_DIRECTION);

// 0x411AA — ôter un décor fixe (mot +0 de la cellule négatif, de −1 à −0x0B). Chaque fiche du
// catalogue des décors dont l'objet (+0x26) est ce décor en compte un de moins (+0x37), si elle en
// comptait ; la cellule est vidée, et la fiche du parc compte un décor de moins (+0x7C).
export function oterUnDecorFixe(jeu, cel) {
  const m8 = jeu.m8;
  cel >>>= 0;
  for (let k = 0; mot(jeu, DECORS + 0x22 + k * TAILLE_DECOR) !== 0; k = (k + 1) & 0xFFFF) {
    const f = DECORS + k * TAILLE_DECOR;
    if (mot(jeu, f + 0x26) === mot(jeu, cel) && m8[f + 0x37] !== 0) m8[f + 0x37] -= 1;
  }
  poserMot(jeu, cel, 0);
  const parc = long(jeu, FICHE_DU_PARC);
  poserMot(jeu, parc + 0x7C, mot(jeu, parc + 0x7C) - 1);
}

// 0x4121E — ôter une installation (objet de type 0x18) : une de moins pour sa fiche de décor (+0x37),
// et pour la fiche du parc si elle est de l'état 2 (+0x83) ; le sol de sa case (ou des six cases de
// son emprise, état 4, table 0xB8FBE) redevient de l'herbe ; l'objet est retiré (0x18B62).
const EMPRISE_DES_GRANDES = 0xB8FBE;  // 6 mots signés : −65, −64, −63, −1, 0, 1

export function oterUneInstallation(jeu, installation) {
  const m8 = jeu.m8;
  installation >>>= 0;
  if (m8[installation + 0xC] === 2) {
    const parc = long(jeu, FICHE_DU_PARC);
    m8[parc + 0x83] = (m8[parc + 0x83] - 1) & 0xFF;
  }
  const f = DECORS + mot(jeu, installation + 0x16) * TAILLE_DECOR;
  m8[f + 0x37] = (m8[f + 0x37] - 1) & 0xFF;
  const numero = m8[installation + 9] * TAILLE_CARTE + m8[installation + 7];
  if (m8[installation + 0xC] === 4) {
    for (let k = 0; k < 6; k++) {
      m8[celluleDecalee(jeu, numero, motSigne(jeu, EMPRISE_DES_GRANDES + k * 2)) + 2] = 0;
    }
  } else {
    m8[celluleDecalee(jeu, numero, 0) + 2] = 0;
  }
  jeu.appeler(RETIRER_L_OBJET, installation);
}

// =================================================================================================
// 0x40E92 (outil 15, demande 0x1C) — poser une installation (objet de type 0x18), fiche [0xD6646]
// du catalogue des décors : les toilettes du scénario outils-basse, par exemple.
//
// L'état de l'installation est l'octet +0x2E de sa fiche. L'état 4, une grande installation, veut
// six cases de sol nu (0xB8FBE : la case, sa voisine est, et les trois au nord) ; toute
// installation veut une case de sol nu, non réservée, sans objet, et un emplacement libre dans la
// table des objets. La case est vidée (0x205D7), l'objet créé : son objet graphique (+0x26 de la
// fiche), sa fiche (+0x16). L'état 2 se tourne vers la première allée voisine (nord, est, sud,
// ouest) : objet graphique suivant d'autant, direction en +0x12, le mot +0x14 pris de l'octet +0x31
// de la fiche, et la fiche du parc en compte une de plus (+0x83). L'état 4 marque ses six cases du
// sol 0x67. Puis l'objet est posé (0x185C1), la fiche compte une installation de plus (+0x37), et
// si son octet +0x30 est levé, la case prend elle aussi le sol 0x67. Rend 1, ou 0 si refusé.
// Rien n'est payé ici (l'achat, s'il y en a un, se fait ailleurs ; non établi).
const SOL_D_INSTALLATION = 0x67;

export function poserUneInstallation(jeu, numeroCase) {
  const m8 = jeu.m8;
  const numero = numeroCase & 0xFFFF;
  const numeroDeFiche = mot(jeu, FICHE_DECOR);
  const f = DECORS + numeroDeFiche * TAILLE_DECOR;
  if (mot(jeu, f + 0x2E) === 4) {
    for (let k = 0; k < 6; k++) {
      const c = celluleDecalee(jeu, numero, motSigne(jeu, EMPRISE_DES_GRANDES + k * 2));
      if (drapeaux(jeu, c) !== 0) return 0;
    }
  }
  const cel = cellule(jeu, numero);
  if ((m8[cel + 3] & RESERVEE) || drapeaux(jeu, cel) !== 0 || mot(jeu, cel) !== 0) return 0;

  const fin = long(jeu, FIN_DES_OBJETS);
  let o = (long(jeu, OBJETS) + TAILLE_OBJET) >>> 0;
  while (o < fin && m8[o + 4] !== 0) o = (o + TAILLE_OBJET) >>> 0;
  if (o >= fin) return 0;

  jeu.appeler(VIDER_LA_CASE, numero);
  m8[o + 4] = INSTALLATION;
  m8[o + 0xC] = m8[f + 0x2E];
  poserMot(jeu, o + 0xA, objetGraphique(jeu, motSigne(jeu, f + 0x26)));
  poserMot(jeu, o + 0x16, numeroDeFiche);
  const etat = m8[o + 0xC];
  if (etat === 2) {
    for (let k = 0; k < 4; k++) {
      const c = celluleDecalee(jeu, numero, motSigne(jeu, VOISINES + k * 2));
      if ((m8[SOLS + m8[c + 2] * 4] & ALLEE) === 0) continue;
      const base = motSigne(jeu, DECORS + 0x26 + mot(jeu, o + 0x16) * TAILLE_DECOR);
      poserMot(jeu, o + 0xA, objetGraphique(jeu, base + k));
      poserMot(jeu, o + 0x14, m8[f + 0x31]);
      m8[o + 0x12] = k;
      const parc = long(jeu, FICHE_DU_PARC);
      m8[parc + 0x83] = (m8[parc + 0x83] + 1) & 0xFF;
      break;
    }
  } else if (etat === 4) {
    for (let k = 0; k < 6; k++) {
      m8[celluleDecalee(jeu, numero, motSigne(jeu, EMPRISE_DES_GRANDES + k * 2)) + 2] = SOL_D_INSTALLATION;
    }
  }
  m8[o + 7] = numero % TAILLE_CARTE;
  m8[o + 9] = numero >> 6;
  jeu.appeler(POSER_EN_TETE, o, mot(jeu, o + 6), mot(jeu, o + 8));
  m8[f + 0x37] = (m8[f + 0x37] + 1) & 0xFF;
  if (m8[f + 0x30] !== 0) m8[cel + 2] = SOL_D_INSTALLATION;
  return 1;
}

// =================================================================================================
// 0x348ED (outils 19 et 21, demande 0x22) — reposer l'employé qu'on portait, sur une case.
//
// L'employé (objet n° `numeroObjet`) redevient du personnel (type 8) à l'arrêt : direction 0, objet
// graphique de l'attente de son métier (+0x28 de sa fiche), l'état et l'état précédent (+0xC, +0xD)
// ceux de l'embauche (+0x2C), vitesse 0x10, patience 400 (+0x14 et +0x20) ; la case (+0x61), puis
// il est amené au centre de la case (0x18A44 : position en 256es de case), et sa patience +0x14
// remise à zéro.
const IMAGE_D_ATTENTE = 0x28, ETAT_D_EMBAUCHE = 0x2C;
const CENTRE_DE_CASE = 0x80;

export function reposerUnEmploye(jeu, numeroCase, numeroObjet) {
  const m8 = jeu.m8;
  const e = objet(jeu, numeroObjet & 0xFFFF);
  const numero = numeroCase & 0xFFFF;
  m8[e + 4] = 8;
  poserMot(jeu, e + 0xE, 2);
  m8[e + 0x12] = 0;
  const metier = METIERS + m8[e + 0x59] * TAILLE_METIER;
  poserMot(jeu, e + 0xA, objetGraphique(jeu, mot(jeu, metier + IMAGE_D_ATTENTE) + m8[e + 0x12]));
  poserMot(jeu, e + 0x61, numero);
  m8[e + 0xC] = m8[metier + ETAT_D_EMBAUCHE];
  m8[e + 0xD] = m8[metier + ETAT_D_EMBAUCHE];
  m8[e + 0x13] = 0x10;
  poserMot(jeu, e + 0x14, 400);
  poserLong(jeu, e + 0x20, 400);
  const x = (((numero % TAILLE_CARTE) & 0xFF) << 8) | CENTRE_DE_CASE;
  const y = (((numero >> 6) & 0xFF) << 8) | CENTRE_DE_CASE;
  jeu.appeler(PLACER, e, x, y);
  poserMot(jeu, e + 0x14, 0);
}

// =================================================================================================
// 0x412E0 (outil 12, demande 0x16) — un lac : la case et ses huit voisines.
//
// Le lac occupe trois cases sur trois ; ses images de sol (drapeau 0x800) commencent à 0xB8, et la
// forme d'une case dit de quels côtés le lac continue (0 à 0xF). La table 0xB8F44, 10 octets par
// case (les huit voisines puis la case elle-même), donne pour chacune son décalage, ceux de deux
// cases qui la bordent du côté du lac (+2, +4), deux masques (+6, +7), une table de formes (+8 :
// 0xB8F9E ou 0xB8FAE) et l'image de son aperçu (+9, lue par 0x416EA).
//
// `sol` est l'image posée au centre : 0xB8 pour un lac, 0 pour l'effacer (0x205D7). `mode` : 1 pose
// pour de bon (la fiche du parc compte les cases de lac, +0x7E, et le lac se paie), 0 pour un
// aperçu (0x416EA, qui remet les sols ensuite), 2 comme 0 mais en marquant les cases réservées.
// Une case accepte le lac si son sol est nu ou déjà du lac, et qu'elle n'est pas réservée (ou que le
// mode est 2). Pour poser un lac, les neuf cases doivent l'accepter et ne porter aucun objet ;
// sinon la fonction rend 0 sans rien toucher.
//
// La case prend `sol`. Chaque voisine qui accepte le lac prend la forme que lui donnent les deux
// cases qui la bordent (du lac : leur forme ; d'autre chose : 0xF), filtrées par ses masques ; une
// forme 0xF efface la voisine (sol 0), une autre en fait un bord de lac (0xB8 + forme). Enfin le
// fond de la vue est à refaire, et si le compte des cases de lac a augmenté, le prix de la fiche 10
// du catalogue des décors (mot 0xCCCC8) est inscrit au livre des comptes, catégorie 2 — une fois,
// quel que soit le nombre de cases. La case du centre n'est jamais comptée.
const LAC_ORIGINE = 0xB8;
const CASES_DU_LAC = 0xB8F44, TAILLE_CASE_DU_LAC = 10;
const FORMES_DU_BORD_A = 0xB8F9E, FORMES_DU_BORD_B = 0xB8FAE;
const PRIX_DU_LAC = 0xCCCC8;          // le prix (+0x28) de la fiche 10 du catalogue des décors
const DEPENSE_DECORS = 2;             // la catégorie du livre des comptes
const POSER_UN_LAC = 0x412E0, APERCU = 0;

export function lacSurUneCase(jeu, numeroCase, sol, mode) {
  const m8 = jeu.m8;
  const numero = numeroCase & 0xFFFF;
  const image = sol & 0xFFFF;
  const pourDeBon = (mode & 0xFFFF) === 1;
  const reserver = (mode & 0xFFFF) === 2;
  const parc = long(jeu, FICHE_DU_PARC);
  const casesAvant = mot(jeu, parc + 0x7E);
  const cel = cellule(jeu, numero);
  const estDuLac = (c) => (m8[SOLS + 1 + m8[c + 2] * 4] & (LAC >> 8)) !== 0;
  const accepte = (c) => {
    const d = drapeaux(jeu, c);
    return (d === 0 || (d & LAC) !== 0) && ((m8[c + 3] & RESERVEE) === 0 || reserver);
  };
  const caseDuLac = (k, champ) =>
    (cel + motSigne(jeu, CASES_DU_LAC + k * TAILLE_CASE_DU_LAC + champ) * 4) >>> 0;

  if (m8[SOLS + 1 + image * 4] & (LAC >> 8)) {
    for (let k = 0; k < 9; k++) {
      const c = caseDuLac(k, 0);
      if (mot(jeu, c) !== 0 || !accepte(c)) return 0;
    }
  }

  if (accepte(cel)) {
    m8[cel + 2] = image;
    if (reserver) m8[cel + 3] |= RESERVEE;
  }

  for (let k = 0; k < 8; k++) {
    const c = caseDuLac(k, 0);
    if (!accepte(c)) continue;
    const fiche = CASES_DU_LAC + k * TAILLE_CASE_DU_LAC;
    const a = caseDuLac(k, 2), b = caseDuLac(k, 4);
    const formeA = estDuLac(a) ? forme(jeu, a) : 0xF;
    const formeB = estDuLac(b) ? forme(jeu, b) : 0xF;
    const cotes = (formeA & m8[fiche + 6]) | (formeB & m8[fiche + 7]);
    const nouvelle = m8[(m8[fiche + 8] === 0 ? FORMES_DU_BORD_A : FORMES_DU_BORD_B) + cotes];
    if (nouvelle === 0xF) {
      if (pourDeBon && estDuLac(c)) poserMot(jeu, parc + 0x7E, mot(jeu, parc + 0x7E) - 1);
      m8[c + 2] = 0;
    } else {
      if (pourDeBon && !estDuLac(c)) poserMot(jeu, parc + 0x7E, mot(jeu, parc + 0x7E) + 1);
      m8[c + 2] = (m8[SOLS + 1 + image * 4] & (LAC >> 8)) ? image + nouvelle : nouvelle + LAC_ORIGINE;
      if (reserver) m8[c + 3] |= RESERVEE;
    }
  }

  poserMot(jeu, REDESSINER_CARTE, 1);
  if (mot(jeu, parc + 0x7E) > casesAvant) jeu.appeler(INSCRIRE_AU_LIVRE, DEPENSE_DECORS, -mot(jeu, PRIX_DU_LAC));
  return 1;
}

// 0x416EA — l'aperçu du lac sous le pointeur (le survol, outil 12), dessiné à partir du coin (x, y)
// de la case visée. Le lac est posé pour de faux (0x412E0, mode 0), ses neuf cases dessinées une à
// une avec le sol qu'il leur donne, puis remises dans leur état ; si le lac ne va pas, ce sont les
// images d'aperçu de la table (+9) qui sont dessinées. Le mot 0xD666E, que la pose lève, est rendu.
// Une case de rang (r, c) dans la table 0xB8F44 — décalage d rapporté à la case 0x2A0 = 10 × 64 +
// 32, pour lire sa rangée et sa colonne — est dessinée à (x + (c − 32) L + dy / 2 + 5, y + dy), où
// dy = (r − 10) H − 2 (L, H : la largeur et la hauteur d'une tuile).
export function apercuDuLac(jeu, x, y, numeroCase) {
  const m8 = jeu.m8;
  const numero = numeroCase & 0xFFFF;
  const cel = cellule(jeu, numero);
  const caseDuLac = (k) => (cel + motSigne(jeu, CASES_DU_LAC + k * TAILLE_CASE_DU_LAC) * 4) >>> 0;
  const anciens = [];
  for (let k = 0; k < 9; k++) anciens.push(m8[caseDuLac(k) + 2]);
  const redessiner = mot(jeu, REDESSINER_CARTE);

  const possible = (jeu.appeler(POSER_UN_LAC, numero, LAC_ORIGINE, APERCU) & 0xFFFF) !== 0;
  for (let k = 0; k < 9; k++) {
    const position = s16(mot(jeu, CASES_DU_LAC + k * TAILLE_CASE_DU_LAC) + 0x2A0);
    const rangee = idiv(position, TAILLE_CARTE);
    const colonne = position - rangee * TAILLE_CARTE;
    const dy = ((rangee - 10) * mot(jeu, HAUTEUR_TUILE) - 2) | 0;
    const dx = ((colonne - 0x20) * mot(jeu, LARGEUR_TUILE) + idiv(s16(dy), 2) + 5) | 0;
    const sol = possible ? m8[caseDuLac(k) + 2] : m8[CASES_DU_LAC + k * TAILLE_CASE_DU_LAC + 9];
    const imageDeSol = (long(jeu, IMAGES_DE_SOL) + (sol + 1) * 6) >>> 0;
    jeu.appeler(basseResolution(jeu) ? TRACER_BASSE : TRACER_HAUTE, s16(x + dx), s16(y + dy), imageDeSol);
    m8[caseDuLac(k) + 2] = anciens[k];
  }
  poserMot(jeu, REDESSINER_CARTE, redessiner);
}

// =================================================================================================
export const reecritures = [
  { adresse: 0x29340, nom: 'riviereSurUneCase', fn: riviereSurUneCase, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x29686, nom: 'circuitSurUneCase', fn: circuitSurUneCase, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x29E03, nom: 'loopingSurUneCase', fn: loopingSurUneCase, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x2B576, nom: 'flecheSurUneAllee', fn: flecheSurUneAllee, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x2B62F, nom: 'panneauIndicateur', fn: panneauIndicateur, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x2B955, nom: 'oterUnMur', fn: oterUnMur, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x2BA40, nom: 'oterUneAllee', fn: oterUneAllee, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x2C2EC, nom: 'oterDeLaRiviere', fn: oterDeLaRiviere, arguments: 1, memoire: 'entiere' },
  { adresse: 0x2C4E5, nom: 'oterDeLaRiviereSansVerifier', fn: oterDeLaRiviereSansVerifier, arguments: 1, memoire: 'entiere' },
  { adresse: 0x2C913, nom: 'defaireUnLooping', fn: defaireUnLooping, arguments: 1, memoire: 'entiere' },
  { adresse: 0x348ED, nom: 'reposerUnEmploye', fn: reposerUnEmploye, arguments: 2, memoire: 'entiere' },
  { adresse: 0x40E92, nom: 'poserUneInstallation', fn: poserUneInstallation, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x411AA, nom: 'oterUnDecorFixe', fn: oterUnDecorFixe, arguments: 1, memoire: 'entiere' },
  { adresse: 0x4121E, nom: 'oterUneInstallation', fn: oterUneInstallation, arguments: 1, memoire: 'entiere' },
  { adresse: 0x412E0, nom: 'lacSurUneCase', fn: lacSurUneCase, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x416EA, nom: 'apercuDuLac', fn: apercuDuLac, arguments: 3, memoire: 'entiere' },
];

export const enAttente = [];
