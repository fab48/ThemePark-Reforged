// Les voies des attractions à train, et quelques fonctions voisines de la construction.
//
// Réécriture lisible de 0x2A2F1, 0x2A2B1, 0x2C6B8, 0x1FEB5, 0x28E5A, 0x31D32, 0x3302A, 0x20F4C,
// 0x2DEF8, 0x2E9E8 et 0x2EA62. Voir docs/guide-reecriture.md.
//
// LES VOIES. Une voie (montagnes russes, grand huit…) est faite de morceaux, des objets du parc de
// type 0x12 posés un par case (docs/retro-ingenierie.md § 6.4 et § 11.5). Dans un morceau :
//   +0x05 bit 4  la hauteur est imposée (les rails de la gare) : on ne peut pas la changer ;
//   +0x0A        l'objet graphique dessiné ;
//   +0x0C        la forme : quelles directions il relie (table 0xB7B21), ci-dessous ;
//   +0x16        le genre de voie, qui choisit la ligne d'images (table 0xB4397, 10 octets par genre) ;
//   +0x44        la forme dessinée : la forme, ou pour une pente celle qui dit de combien elle monte ;
//   +0x79        la hauteur, de 0 à 14 ;
//   +0x7A        le premier wagon posé sur le morceau ; +0x90 un second objet graphique (§ 0x1FEB5).
//
// LES DIRECTIONS sont des bits : 1 le nord (une rangée plus haut, −64 cases), 2 l'est (+1), 4 le sud
// (+64), 8 l'ouest (−1). La table 0xB4B2A donne le pas de chaque direction en cases, 0xB8C35 la
// direction opposée. Les formes : 1 à 4 les virages (nord-est, est-sud, sud-ouest, ouest-nord),
// 5 et 6 les droites nord-sud et est-ouest — les seules qui puissent monter ou descendre —, 7 à 0xA
// les bouts de voie ouverts à l'ouest, à l'est, au sud et au nord ; au-delà, les pièces spéciales
// (les loopings, 0x13 à 0x16 ; 0xB à 0x12 ne se règlent pas en hauteur).
//
// SUIVRE UNE VOIE. Plusieurs fonctions la parcourent de la même façon : on part d'un morceau dans
// ses deux sens à la fois (la table 0xB7AEA donne, par forme, deux directions « d'arrivée » qui
// font sortir par chacune des deux extrémités) ; à chaque pas, la direction suivante est celle des
// sorties du morceau qui ne ramène pas en arrière — sorties & ~opposée(arrivée) —, et la case
// suivante est à un pas dans cette direction. On s'arrête quand les deux sens se rejoignent sur la
// même case (une voie fermée), ou quand les deux sont au bout (une voie ouverte). Le morceau de
// départ est traité deux fois, une par sens.
//
// ÉLEVER OU ABAISSER (0x2A2F1). Le morceau change de hauteur, puis ses voisins sur la voie suivent :
// une pente (forme 5 ou 6) peut rattraper deux crans d'écart, un autre morceau doit être de niveau.
// Si un morceau à hauteur imposée devrait bouger, tout est défait. Après quoi chaque pente reprend
// la forme dessinée qui correspond à l'écart avec son voisin du haut (nord ou ouest).
//
// LES AUTRES FONCTIONS du module, voisines par leur rôle :
//   0x2C6B8  retirer un morceau de voie (le bouton droit sur un rail déjà au plus bas) ;
//   0x1FEB5  dessiner un morceau de voie et les wagons qui s'y trouvent, passagers compris ;
//   0x28E5A  poser une barrière de file (outil 3), ou en calculer l'aperçu ;
//   0x31D32  après la pose de la sortie d'une attraction, revenir à l'outil de son circuit ou de
//            ses rails s'ils ne touchent pas encore la gare ;
//   0x3302A  envoyer le mécanicien libre le plus proche vers une attraction ;
//   0x20F4C  tracer une image de l'interface, au double de sa taille en 640x480 ;
//   0x2DEF8  effacer la demande de sortie du parc (la demande 0x5A de la file des événements) ;
//   0x2E9E8  écrire la fiche du joueur dans save/<surnom>.GD ;
//   0x2EA62  vérifier le code de triche, puis relire la fiche du joueur, ou en préparer une neuve.

import { ADRESSES } from './etat.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const idiv = (a, b) => (a / b) | 0;

const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setInt32(a >>> 0, v | 0, true);

// Les variables locales de l'original qui doivent être en mémoire (un tampon dont on passe
// l'adresse) : on descend le pointeur de pile comme son prologue, et l'on rend l'adresse de la zone
// réservée ; l'enveloppe (index.js) remet la pile en place au retour. Avec `taille` = 16 + la
// taille du `enter`, le tampon tombe à l'adresse même où l'original l'avait.
function variablesLocales(jeu, taille) {
  const T = jeu.T;
  T.sauver();
  const bas = ((T.R.esp >>> 0) - taille) >>> 0;
  T.R.esp = bas | 0;
  T.charger();
  return bas;
}

// --- les variables du jeu ----------------------------------------------------------------------
const OBJETS_DU_PARC = 0xD3B10;     // pointeur : objets de 200 octets, numérotés à partir de 1
const FIN_DES_OBJETS = 0xD3B78;     // pointeur : la fin de la table
const TAILLE_OBJET = 200;
const CARTE = 0xD3B08;              // pointeur : 64 x 64 cellules de 4 octets (+2 le sol, +3 drapeaux)
const OBJETS_GRAPHIQUES = 0xD3B80;  // pointeur : 8 octets ; +0 premier morceau, +2 largeur, +3 hauteur, +6 le suivant
const MORCEAUX = 0xD3B7C;           // pointeur : 10 octets ; +0 image, +2 dx, +4 dy, +6 drapeaux, +8 suivant
const IMAGES = 0xD3BB8;             // pointeur : 6 octets ; +0 pixels, +4 largeur, +5 hauteur
const FIGURES = 0xD3B38;            // pointeur : numéro de figure → objet graphique (mots)
const COMPTES = 0xD3814;            // pointeur : les comptes du parc du joueur courant
const DRAPEAUX_TRACEUR = 0xBECBC;   // mot : les drapeaux appliqués à la prochaine image (§ 6.5)
const MODE_AFFICHAGE = ADRESSES.modeAffichage;   // 0xDE5F6 — 1 = 320x200, 8 = 640x480
const FACON_DE_DESSINER = 0xD667C;  // mot : 8 la vue réduite
const REDUCTION_LARGEUR = 0xD6640, REDUCTION_HAUTEUR = 0xD6642;   // mots : les diviseurs de la vue réduite
const REDESSINER_LA_CARTE = 0xD666E;  // mot : la vue du parc est à refaire
const OUTIL = 0xD6670;              // mot : l'outil en main
const SORTIR = 0xD6688;             // mot : la demande de sortie du parc
const TRICHE = 0xD6682;             // mot : 1 si le joueur s'appelle HORZA

// Les tables des sols (docs/retro-ingenierie.md § 10.7) : 4 octets par image de sol.
const PROPRIETES_DES_SOLS = 0xB44D9;  // mot : 8 file, 0x40 circuit, 0x400…
const FORMES_DES_SOLS = 0xB44DC;      // octet : la forme de l'allée, de la file ou du circuit
const OUVERTURES_DES_CIRCUITS = 0xB49C1;  // forme → directions ouvertes d'un circuit
const SORTIES_D_UNE_FILE = 0xB49D3;   // forme → directions ouvertes d'une file (bits 1 << d)
const VOISINES = 0xB4920;             // mots : le pas en cases vers les voisines 0 à 3 (N, E, S, O)
const DIRECTIONS_OPPOSEES = 0xB48EC;  // mots : la direction opposée à d (2, 3, 0, 1)

// Les tables des voies (l'en-tête).
const DIRECTIONS_DE_DEPART = 0xB7AEA;  // deux octets par forme : les deux directions « d'arrivée »
const SORTIES_DES_FORMES = 0xB7B21;    // octet par forme : les directions qu'elle relie
const OPPOSEE = 0xB8C35;               // octet par direction (bit) : la direction opposée
const PAS_EN_CASES = 0xB4B2A;          // mot signé par direction (bit) : le pas en cases
const EXTREMITES = 0xB8BB0;            // deux octets par forme (0 à 0xA) : ses deux sorties
const FORME_PAR_SORTIES = 0xB8C11;     // octet par masque de sorties : la forme qui les relie
const PENTES_NORD_SUD = 0xB8C25;       // mots, indexés par l'écart de hauteur : la forme dessinée
const PENTES_EST_OUEST = 0xB8C2F;      //   d'une droite 5 ou 6 (de −2 à +2 : 0xF, 0xC, 5, 0xE, 0x11…)
const IMAGES_DES_GENRES_DE_VOIE = 0xB4397;  // mot à +0 de chaque fiche de 10 octets : la 1re figure

const TYPE_MORCEAU_DE_VOIE = 0x12;
const TYPE_KIOSQUE = 6;

// --- les fonctions du jeu appelées ---------------------------------------------------------------
const OBJET_SUR_LA_CASE = 0x204B9;     // (cellule, type) : le premier objet de ce type, ou 0
const VALEUR_ABSOLUE = 0x80BF2;
const BRUITAGE_UNIQUE = 0x80FE0;       // (propriétaire, bruitage), sauf s'il joue déjà
const DETRUIRE = 0x18B62;              // (objet) : le retire de sa case et remet ses 200 octets à zéro
const RACCORDER_LE_LOOPING = 0x2C913;  // (cellule) : non établi ; appelé pour les formes au-delà de 0xA
const RETRACER_LE_SOL = 0x2CBC0;       // (cellule, sol + 1) : retrace la case dans le fond
const TRACER_BASSE = 0x5EC9C, TRACER_HAUTE = 0x55BD4;   // (x, y, entrée d'image)
const TRACER_A_L_ECHELLE = 0x66DFA;    // (image, x, y, largeur, hauteur)
const FORMATER = 0x7F652;              // sprintf
const OUVRIR = 0x7EB70;                // (nom, mode) : négatif en échec
const LIRE = 0x7EBE0;                  // (poignée, tampon, octets)
const ECRIRE_FICHIER = 0x7ED80;        // (poignée, tampon, octets)
const FERMER = 0x7EC20;                // (poignée)
const REMPLIR = 0x7F1A0;               // (destination, octet, n) : memset

// Ces fonctions-ci sont du module ; on les appelle par leur entrée, pour que la comparaison appel
// par appel les voie.
const EFFACER_LA_DEMANDE_DE_SORTIE = 0x2DEF8;
const POSER_LA_HAUTEUR = 0x2A2B1;
const ELEVER_LA_VOIE = 0x2A2F1;

const objet = (jeu, numero) => (long(jeu, OBJETS_DU_PARC) + Math.imul(numero, TAILLE_OBJET)) | 0;
const morceauDeVoie = (jeu, cellule) => jeu.appeler(OBJET_SUR_LA_CASE, cellule, TYPE_MORCEAU_DE_VOIE);
const basseResolution = (jeu) => (jeu.m8[MODE_AFFICHAGE] & 1) !== 0;

// =================================================================================================
// LES VOIES
// =================================================================================================

// 0x2DEF8 — effacer la demande de sortie du parc.
export function effacerLaDemandeDeSortie(jeu) {
  poserMot(jeu, SORTIR, 0);
}

// 0x2A2B1 — donner une hauteur à un morceau de voie. Rend 1 si c'est impossible : le morceau a une
// hauteur imposée (+5 bit 4, les rails de la gare) et elle est autre. La hauteur demandée est un
// octet signé comparé à la hauteur non signée : une hauteur négative (−1, −2) n'est donc jamais
// « la même », et un morceau libre la reçoit telle quelle, 0xFF ou 0xFE.
export function poserLaHauteur(jeu, morceau, hauteur) {
  hauteur = s8(hauteur);
  if ((octet(jeu, morceau + 5) & 4) !== 0 && octet(jeu, morceau + 0x79) !== hauteur) return 1;
  poserOctet(jeu, morceau + 0x79, hauteur);
  return 0;
}

// Un parcours de voie dans les deux sens (l'en-tête). `visiter(morceau, cellule)` est appelé pour
// chaque morceau, dans l'ordre de l'original ; il rend `false` pour tout arrêter. Rend `'rejoint'`
// quand les deux sens se sont retrouvés, `'bouts'` quand les deux sont arrivés au bout, et
// `'arrete'` si `visiter` a arrêté le parcours.
function parcourirLaVoie(jeu, depart, visiter) {
  const premier = morceauDeVoie(jeu, depart);
  const forme = octet(jeu, premier + 0xC);
  const directions = [octet(jeu, DIRECTIONS_DE_DEPART + 2 * forme), octet(jeu, DIRECTIONS_DE_DEPART + 2 * forme + 1)];
  const cellules = [depart, depart];
  let avance = false;
  while (directions[0] + directions[1] !== 0) {
    for (let sens = 0; sens < 2; sens++) {
      if (directions[sens] === 0) continue;
      const morceau = morceauDeVoie(jeu, cellules[sens]);
      if (visiter(morceau, cellules[sens]) === false) return 'arrete';
      if (cellules[0] === cellules[1] && avance) return 'rejoint';
      directions[sens] = ~octet(jeu, OPPOSEE + directions[sens]) & octet(jeu, SORTIES_DES_FORMES + octet(jeu, morceau + 0xC)) & 0xFF;
      cellules[sens] = (cellules[sens] + 4 * motSigne(jeu, PAS_EN_CASES + 2 * directions[sens])) | 0;
      avance = true;
    }
  }
  return 'bouts';
}

// La forme dessinée d'une pente, d'après l'écart de hauteur avec son voisin du haut, et son image.
function redessinerLaPente(jeu, morceau, voisin, table) {
  const ecart = (octet(jeu, voisin + 0x79) - octet(jeu, morceau + 0x79)) | 0;
  poserOctet(jeu, morceau + 0x44, mot(jeu, table + 2 * ecart));
  const premiere = mot(jeu, IMAGES_DES_GENRES_DE_VOIE + 10 * mot(jeu, morceau + 0x16));
  poserMot(jeu, morceau + 0xA, mot(jeu, long(jeu, FIGURES) + 2 * (premiere + octet(jeu, morceau + 0x44))));
}

// 0x2A2F1 — élever (écart +1) ou abaisser (−1) la voie au morceau de la case `cellule` (une
// adresse dans la carte) ; l'écart 0 ne fait que remettre les voisins d'accord (après un retrait).
//
// Rend 0 s'il n'y a pas de morceau sur la case ; −1 si la hauteur sortirait de 0 à 14 (le bouton
// droit retire alors le morceau, 0x29835) ; 1 si c'est fait, avec le bruitage 9 ; −2 si un morceau
// à hauteur imposée a tout fait défaire.
//
// Trois parcours de la voie : le premier note la hauteur de chaque morceau ; le second change la
// hauteur du morceau, puis, pour chaque morceau, règle ses deux voisins selon sa forme ; en cas
// d'échec, le troisième repose les hauteurs notées, et le quatrième redonne aux pentes leur forme
// dessinée. Les voisins ne sont pas pris le long de la voie mais aux cases d'à côté, dans les deux
// directions de la forme.
//
// **Anomalies reproduites.** Dans le premier parcours, un morceau manquant sur la voie (la case
// suivante n'a pas de rail) fait appeler 0x2DEF8, qui efface la demande de sortie du parc, puis le
// parcours continue sur l'objet nul, dont il lit la hauteur à l'adresse 0x79. Le réglage des
// voisins ne vérifie jamais qu'il y a un morceau sur la case voisine : sur l'objet nul, 0x2A2B1 lit
// et écrit l'octet 0x79. Les hauteurs notées vont dans un tampon de 1 200 octets sur la pile de
// l'original, sans contrôle ; une voie assez longue pour le déborder écraserait ses variables — la
// réécriture s'arrête sur une erreur plutôt que d'inventer la suite.
export function eleverLaVoie(jeu, cellule, ecart) {
  let morceau = morceauDeVoie(jeu, cellule);
  if (morceau === 0) return 0;

  // 1. Noter les hauteurs, dans l'ordre du parcours.
  const notees = [];
  parcourirLaVoie(jeu, cellule, (m) => {
    if (m === 0) jeu.appeler(EFFACER_LA_DEMANDE_DE_SORTIE);
    if (notees.length >= 1200) throw new Error('0x2A2F1 : voie plus longue que le tampon des hauteurs');
    notees.push(octet(jeu, m + 0x79));
  });

  // 2. La nouvelle hauteur. Le calcul se fait sur 16 bits signés.
  morceau = morceauDeVoie(jeu, cellule);
  const hauteur = s16(ecart + octet(jeu, morceau + 0x79));
  if (hauteur > 14 || hauteur < 0) return -1;
  poserOctet(jeu, morceau + 0x79, hauteur);

  // Mettre le voisin de la case `cellule + decalage` à la hauteur de `m` : 1 si c'est impossible.
  const deNiveau = (m, c, decalage) => {
    const voisin = morceauDeVoie(jeu, (c + decalage) | 0);
    return jeu.appeler(POSER_LA_HAUTEUR, voisin, s8(octet(jeu, m + 0x79))) & 0xFFFF;
  };
  // Le voisin, s'il est lui-même une pente, peut garder jusqu'à deux crans d'écart ; au-delà, il
  // est ramené à deux crans. Une pente n'a pas de voisine obligée : la voisine d'une pente est
  // traitée à part, par `pente`.
  const ramenerADeuxCrans = (m, voisin) => {
    const difference = s16(octet(jeu, voisin + 0x79) - octet(jeu, m + 0x79));
    if (jeu.appeler(VALEUR_ABSOLUE, difference) <= 2) return 0;
    const cible = difference > 0 ? octet(jeu, m + 0x79) + 2 : octet(jeu, m + 0x79) - 2;
    return jeu.appeler(POSER_LA_HAUTEUR, voisin, s8(cible)) & 0xFFFF;
  };
  const suivre = (m, c, decalage) => {
    const voisin = morceauDeVoie(jeu, (c + decalage) | 0);
    const forme = octet(jeu, voisin + 0xC);
    if (forme === 5 || forme === 6) return ramenerADeuxCrans(m, voisin);
    return jeu.appeler(POSER_LA_HAUTEUR, voisin, s8(octet(jeu, m + 0x79))) & 0xFFFF;
  };
  // Le morceau est une pente : son voisin du haut (nord ou ouest) est ramené à deux crans, quelle
  // que soit sa forme, puis la pente prend la forme dessinée de l'écart qui reste.
  const pente = (m, c, decalage, table) => {
    const voisin = morceauDeVoie(jeu, (c + decalage) | 0);
    if (ramenerADeuxCrans(m, voisin) !== 0) return 1;
    redessinerLaPente(jeu, m, voisin, table);
    return 0;
  };

  const NORD = -0x100, EST = 4, SUD = 0x100, OUEST = -4;   // en octets de carte
  const reglerLesVoisins = (m, c) => {
    switch (octet(jeu, m + 0xC)) {
      case 1: return deNiveau(m, c, NORD) || suivre(m, c, EST);
      case 2: return suivre(m, c, EST) || suivre(m, c, SUD);
      case 3: return deNiveau(m, c, OUEST) || suivre(m, c, SUD);
      case 4: return deNiveau(m, c, OUEST) || deNiveau(m, c, NORD);
      case 5: return suivre(m, c, SUD) || pente(m, c, NORD, PENTES_NORD_SUD);
      case 6: return suivre(m, c, EST) || pente(m, c, OUEST, PENTES_EST_OUEST);
      case 7: return deNiveau(m, c, OUEST);
      case 8: return suivre(m, c, EST);
      case 9: return suivre(m, c, SUD);
      case 0xA: return deNiveau(m, c, NORD);
      case 0x13: case 0x14: return suivre(m, c, EST) || deNiveau(m, c, OUEST);
      case 0x15: case 0x16: return suivre(m, c, SUD) || deNiveau(m, c, NORD);
      default: return 0;
    }
  };

  let echec = false;
  parcourirLaVoie(jeu, cellule, (m, c) => {
    if (reglerLesVoisins(m, c) !== 0) { echec = true; return false; }
    return true;
  });
  if (!echec) {
    jeu.appeler(BRUITAGE_UNIQUE, 0, 9);
    return 1;
  }

  // 3. Défaire : reposer les hauteurs notées, dans le même ordre.
  let k = 0;
  parcourirLaVoie(jeu, cellule, (m) => { poserOctet(jeu, m + 0x79, notees[k++]); });
  // 4. Redonner aux pentes la forme dessinée de l'écart avec leur voisin du haut.
  parcourirLaVoie(jeu, cellule, (m, c) => {
    const forme = octet(jeu, m + 0xC);
    if (forme === 5) redessinerLaPente(jeu, m, morceauDeVoie(jeu, (c - 0x100) | 0), PENTES_NORD_SUD);
    else if (forme === 6) redessinerLaPente(jeu, m, morceauDeVoie(jeu, (c - 4) | 0), PENTES_EST_OUEST);
  });
  return -2;
}

// 0x2C6B8 — retirer le morceau de voie de la case numéro `numero` (0 à 4 095).
//
// Rien si la case n'a pas de morceau, ou si elle est marquée (+3 bit 8 : les rails de la gare, que
// le bouton droit n'ôte pas). Une pièce spéciale (forme au-delà de 0xA) est confiée à 0x2C913. Pour
// une pièce ordinaire, chacune de ses deux voisines sur la voie perd la sortie qui menait à elle :
// sa forme devient celle des sorties qui lui restent (une voisine elle-même spéciale passe d'abord
// par 0x2C913), puis on remet la voie d'accord de part et d'autre (0x2A2F1, écart 0), et le morceau
// disparaît.
//
// **Anomalie reproduite.** La voisine n'est pas cherchée avant d'être modifiée : si la case voisine
// n'a pas de rail, les écritures tombent sur l'objet nul, aux adresses 0xA, 0xC et 0x44. Et le
// programme compare deux octets de la pièce (+0xBE à +0x79, +0xBD à +0x44) sans rien faire du
// résultat.
export function retirerUnMorceauDeVoie(jeu, numero) {
  const cellule = (long(jeu, CARTE) + 4 * u16(numero)) | 0;
  const morceau = morceauDeVoie(jeu, cellule);
  if (morceau === 0 || (octet(jeu, cellule + 3) & 8) !== 0) return;
  if (octet(jeu, morceau + 0xC) > 0xA) {
    jeu.appeler(RACCORDER_LE_LOOPING, cellule);
    return;
  }

  const voisines = [0, 0];
  for (let k = 0; k < 2; k++) {
    const sortie = octet(jeu, EXTREMITES + 2 * octet(jeu, morceau + 0xC) + k);
    if (sortie === 0) continue;
    const voisine = (cellule + 4 * motSigne(jeu, PAS_EN_CASES + 2 * sortie)) | 0;
    voisines[k] = voisine;
    let autre = morceauDeVoie(jeu, voisine);
    if (octet(jeu, autre + 0xC) > 0xA) jeu.appeler(RACCORDER_LE_LOOPING, voisine);
    const restantes = octet(jeu, SORTIES_DES_FORMES + octet(jeu, autre + 0xC)) & ~octet(jeu, OPPOSEE + sortie);
    poserOctet(jeu, autre + 0xC, octet(jeu, FORME_PAR_SORTIES + (restantes & 0xFF)));
    poserOctet(jeu, autre + 0x44, octet(jeu, autre + 0xC));
    const premiere = mot(jeu, IMAGES_DES_GENRES_DE_VOIE + 10 * mot(jeu, autre + 0x16));
    poserMot(jeu, autre + 0xA, mot(jeu, long(jeu, FIGURES) + 2 * (premiere + octet(jeu, autre + 0x44))));
  }
  if (voisines[0] !== 0) jeu.appeler(ELEVER_LA_VOIE, voisines[0], 0);
  if (voisines[1] !== 0) jeu.appeler(ELEVER_LA_VOIE, voisines[1], 0);
  jeu.appeler(DETRUIRE, morceau);
  poserMot(jeu, REDESSINER_LA_CARTE, 1);
}

// =================================================================================================
// LE DESSIN D'UN MORCEAU DE VOIE ET DE SES WAGONS
// =================================================================================================

function tracer(jeu, x, y, image) {
  jeu.appeler(basseResolution(jeu) ? TRACER_BASSE : TRACER_HAUTE, s16(x), s16(y), image);
}

// 0x1FEB5 — dessiner le morceau de voie `morceau` à (x, y), puis ses wagons, `decalage` plus bas.
//
// Appelée par la routine des morceaux de voie (0x1F205). Chaque image est tracée avec, dans
// 0xBECBC, les drapeaux de son morceau d'objet graphique (+6).
//
// 1. Le premier morceau de l'objet graphique du rail (+0xA).
// 2. Les wagons, chaînés à partir de +0x7A (+0x7A de chaque wagon : le suivant). L'objet graphique
//    du wagon est celui du rail, ou celui de +0x90 si le premier wagon a son octet +0x12 au-dessus
//    de 1 (non établi) ; le mot +0x7C du wagon dit combien d'images avancer dans son animation
//    (chaîne +6 des objets graphiques). On en trace les morceaux, sauf le premier : ceux marqués
//    0x80 sont des places, où l'on dessine le passager (+0x47 du wagon) s'il y en a un. Un
//    passager de genre 0 (+0x59) montre l'image de la place telle quelle ; sinon l'image de la
//    place est cherchée dans la ligne de référence de la table 0xB9A78 (47 images) et remplacée par
//    celle du même rang dans la ligne du genre, recentrée en largeur et calée en bas.
// 3. Si le mot +0x16 du rail vaut 1 (non établi), la figure 0x16E (mot +0x2DC de [0xD3B38]) par
//    dessus.
//
// **Anomalies reproduites.** Dans la vue réduite (0xD667C bit 3), la fonction s'arrête tout de suite
// après avoir posé les drapeaux du premier morceau dans 0xBECBC, et ne les remet pas à zéro ; la
// branche de la figure qui trace à l'échelle de la vue réduite n'est donc jamais prise. Après la
// figure, 0xBECBC n'est pas remis à zéro non plus.
export function dessinerUnMorceauDeVoie(jeu, morceau, x, y, decalage) {
  const images = () => long(jeu, IMAGES);
  let graphique = (long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, morceau + 0xA)) | 0;
  let piece = (long(jeu, MORCEAUX) + 10 * mot(jeu, graphique)) | 0;
  poserMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, piece + 6));
  if ((octet(jeu, FACON_DE_DESSINER) & 8) !== 0) return;

  // 1. Le rail.
  tracer(jeu, x + mot(jeu, piece + 2), y + decalage + mot(jeu, piece + 4), (mot(jeu, piece) + images()) | 0);
  y = (y + decalage) | 0;

  // 2. Les wagons.
  let wagon = objet(jeu, mot(jeu, morceau + 0x7A));
  if (octet(jeu, wagon + 0x12) > 1) graphique = (long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, morceau + 0x90)) | 0;
  poserMot(jeu, DRAPEAUX_TRACEUR, 0);
  wagon = objet(jeu, mot(jeu, morceau + 0x7A));
  while ((wagon >>> 0) > (long(jeu, OBJETS_DU_PARC) >>> 0)) {
    // L'image de l'animation : avancer de +0x7C crans, sans dépasser la dernière.
    let reste = mot(jeu, wagon + 0x7C);
    let image = graphique;
    while (reste !== 0 && mot(jeu, image + 6) !== 0) {
      image = (long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, image + 6)) | 0;
      reste = u16(reste - 1);
    }
    const premier = (long(jeu, MORCEAUX) + 10 * mot(jeu, image)) | 0;
    piece = (long(jeu, MORCEAUX) + 10 * mot(jeu, premier + 8)) | 0;
    while ((piece >>> 0) > (long(jeu, MORCEAUX) >>> 0)) {
      if ((octet(jeu, piece + 6) & 0x80) === 0) {
        poserMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, piece + 6));
        tracer(jeu, x + mot(jeu, piece + 2), y + mot(jeu, piece + 4), (mot(jeu, piece) + images()) | 0);
      } else {
        dessinerUnePlace(jeu, wagon, piece, x, y);
      }
      piece = (long(jeu, MORCEAUX) + 10 * mot(jeu, piece + 8)) | 0;
    }
    poserMot(jeu, DRAPEAUX_TRACEUR, 0);
    wagon = objet(jeu, mot(jeu, wagon + 0x7A));
  }

  // 3. La figure du mot +0x16.
  if (mot(jeu, morceau + 0x16) !== 1) return;
  graphique = (long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, long(jeu, FIGURES) + 0x2DC)) | 0;
  piece = (long(jeu, MORCEAUX) + 10 * mot(jeu, graphique)) | 0;
  poserMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, piece + 6));
  if ((octet(jeu, FACON_DE_DESSINER) & 8) !== 0) {
    // Jamais atteint (voir plus haut) : le tracé à l'échelle de la vue réduite.
    const rx = mot(jeu, REDUCTION_LARGEUR), ry = mot(jeu, REDUCTION_HAUTEUR);
    const largeur = octet(jeu, graphique + 2), hauteur = octet(jeu, graphique + 3);
    const px = (idiv(idiv(motSigne(jeu, piece + 2) << 8, largeur << 8), rx) + s16(x)) | 0;
    const py = (idiv(idiv(motSigne(jeu, piece + 4) << 8, hauteur << 8), ry) + s16(y)) | 0;
    jeu.appeler(TRACER_A_L_ECHELLE, (mot(jeu, piece) + images()) | 0, s16(px), s16(py),
      u16(idiv(largeur, rx)), u16(idiv(hauteur, ry)));
    return;
  }
  tracer(jeu, x + mot(jeu, piece + 2), y + mot(jeu, piece + 4), (mot(jeu, piece) + images()) | 0);
}

// Une place d'un wagon (morceau marqué 0x80) : le passager, s'il y en a un.
function dessinerUnePlace(jeu, wagon, piece, x, y) {
  const LIGNES_DES_PASSAGERS = 0xB9A78;   // 47 mots par genre de visiteur ; la ligne 0 sert de clé
  const passager = objet(jeu, mot(jeu, wagon + 0x47));
  if ((passager >>> 0) <= (long(jeu, OBJETS_DU_PARC) >>> 0)) return;
  const genre = octet(jeu, passager + 0x59);
  if (genre === 0) {
    const image = (long(jeu, IMAGES) + mot(jeu, piece)) | 0;
    if ((image >>> 0) <= (long(jeu, IMAGES) >>> 0)) return;
    poserMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, piece + 6));
    tracer(jeu, x + mot(jeu, piece + 2), y + mot(jeu, piece + 4), image);
    return;
  }
  for (let rang = 0; rang < 0x2F; rang++) {
    if (mot(jeu, LIGNES_DES_PASSAGERS + 2 * rang) !== mot(jeu, piece)) continue;
    const image = (long(jeu, IMAGES) + mot(jeu, LIGNES_DES_PASSAGERS + genre * 0x5E + 2 * rang)) | 0;
    const place = (mot(jeu, piece) + long(jeu, IMAGES)) | 0;
    const px = (octet(jeu, place + 4) >> 1) + (s16(x) - (octet(jeu, image + 4) >> 1));
    const py = y - octet(jeu, image + 5) + octet(jeu, place + 5);
    poserMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, piece + 6));
    tracer(jeu, px + mot(jeu, piece + 2), py + mot(jeu, piece + 4), image);
    return;
  }
}

// =================================================================================================
// LA BARRIÈRE DE FILE
// =================================================================================================

// 0x28E5A — la barrière de file (outil 3) sur la case numéro `numero`. `base` est la première image
// de sol des files ; si `poser` est nul, on ne change rien et l'on rend l'image qu'aurait la case
// (l'aperçu) ; sinon on pose et l'on rend 1. Rend 0 si la case ne s'y prête pas.
//
// La case doit être nue, ou d'un sol à drapeau 0x400, ou un circuit (0x40) d'image 0x8B à 0x95 ;
// jamais marquée (+3 bit 8). Sur un circuit, seules les droites (formes 5 et 0xA) s'y prêtent : la
// barrière prend alors la forme 0x10 ou 0x11, qui laisse passer le circuit.
//
// Deux passes sur les quatre voisines (nord, est, sud, ouest) :
//  1. un kiosque (objet de type 6) : s'il est d'une attraction (état 4, 6 ou 0x1C), il doit regarder
//     vers la case (sa direction +0x12 opposée à la voisine), sinon refus ; la file s'y raccorde, à
//     moins qu'elle n'y tombe sur une file déjà ouverte vers lui. Au plus un kiosque : on s'arrête
//     au premier ;
//  2. les files voisines, tant qu'on en a moins de deux : une file de circuit, si la case n'en est
//     pas une, compte sans plus ; une file qu'on peut prolonger (0xB8BD8 : les bouts de file) se
//     raccorde, et, si l'on pose, elle gagne la sortie vers la case et est retracée.
// La forme vient de 0xB8BEF d'après le masque des voisines raccordées. Si l'on pose près d'un
// kiosque : celui d'une attraction fait de l'objet +0x49 un kiosque de sortie (type 0x1C) et note la
// case dans l'attraction (+0x73) ; un autre prend l'image et la direction qui regardent la case.
export function poserUneBarriereDeFile(jeu, base, numero, poser) {
  numero = u16(numero);
  const cellule = (long(jeu, CARTE) + 4 * numero) | 0;
  const sol = octet(jeu, cellule + 2);
  const drapeaux = mot(jeu, PROPRIETES_DES_SOLS + 4 * sol);
  let masque = 0, nombre = 0, kiosque = 0, forme = 0;

  let libre;
  if (drapeaux === 0 || (drapeaux & 0x400) !== 0) libre = true;
  else libre = sol >= 0x8B && sol < 0x96 && (drapeaux & 0x40) !== 0;
  if (!libre || (octet(jeu, cellule + 3) & 8) !== 0) return 0;
  if ((drapeaux & 0x40) !== 0) {
    forme = octet(jeu, OUVERTURES_DES_CIRCUITS + octet(jeu, FORMES_DES_SOLS + 4 * sol));
    if (forme !== 5 && forme !== 0xA) return 0;
  }

  for (let passe = 0; passe <= 1; passe++) {
    for (let d = 0; d <= 3; d++) {
      const voisine = (cellule + 4 * motSigne(jeu, VOISINES + 2 * d)) | 0;
      if (passe === 0) {
        const k = jeu.appeler(OBJET_SUR_LA_CASE, voisine, TYPE_KIOSQUE);
        if (k === 0) continue;
        const etat = octet(jeu, k + 0xC);
        if ((etat === 6 || etat === 4 || etat === 0x1C) && octet(jeu, k + 0x12) !== mot(jeu, DIRECTIONS_OPPOSEES + 2 * d)) return 0;
        const devant = (voisine + 4 * motSigne(jeu, VOISINES + 2 * octet(jeu, k + 0x12))) | 0;
        const solDevant = octet(jeu, devant + 2);
        if ((octet(jeu, PROPRIETES_DES_SOLS + 4 * solDevant) & 8) !== 0) {
          const sorties = octet(jeu, SORTIES_D_UNE_FILE + octet(jeu, FORMES_DES_SOLS + 4 * solDevant));
          const vers = motSigne(jeu, DIRECTIONS_OPPOSEES + 2 * octet(jeu, k + 0x12));
          if ((sorties & (1 << (vers & 31))) !== 0) continue;
        }
        kiosque = voisine;
        nombre++;
        masque = (1 << d) & 0xFF;
        break;
      } else {
        const solVoisin = octet(jeu, voisine + 2);
        const drapeauxVoisin = mot(jeu, PROPRIETES_DES_SOLS + 4 * solVoisin);
        if ((drapeauxVoisin & 8) === 0 || nombre >= 2) continue;
        if ((drapeauxVoisin & 0x40) !== 0 && (drapeaux & 0x40) === 0) {
          nombre++;
          masque |= 1 << d;
          continue;
        }
        const formeVoisine = octet(jeu, FORMES_DES_SOLS + 4 * solVoisin);
        const bout = octet(jeu, 0xB8BD8 + formeVoisine);   // la sortie qu'un bout de file peut ouvrir
        if (bout === 0 && formeVoisine !== 0) continue;
        nombre++;
        masque |= 1 << d;
        if (u16(poser) === 0) continue;
        const ouverte = octet(jeu, 0xB8BEF + (octet(jeu, 0xB4B1D + d) | bout));
        poserOctet(jeu, voisine + 2, ouverte + octet(jeu, voisine + 2) - formeVoisine);
        jeu.appeler(RETRACER_LE_SOL, u16(numero + mot(jeu, VOISINES + 2 * d)), u16(octet(jeu, voisine + 2) + 1));
      }
    }
  }

  if ((drapeaux & 0x40) !== 0) masque = forme === 5 ? 0x10 : 0x11;
  if (u16(poser) === 0) return (base + octet(jeu, 0xB8BEF + masque)) | 0;
  poserOctet(jeu, cellule + 2, octet(jeu, 0xB8BEF + masque) + base);
  jeu.appeler(RETRACER_LE_SOL, numero, u16(octet(jeu, cellule + 2) + 1));
  if (kiosque === 0) return 1;

  const k = jeu.appeler(OBJET_SUR_LA_CASE, kiosque, TYPE_KIOSQUE);
  const etat = octet(jeu, k + 0xC);
  if (etat === 6 || etat === 4 || etat === 0x1C) {
    const sortie = objet(jeu, mot(jeu, k + 0x49));
    poserOctet(jeu, sortie + 4, 0x1C);
    const attraction = objet(jeu, mot(jeu, sortie + 0x16));
    poserMot(jeu, attraction + 0x73, octet(jeu, sortie + 9) * 64 + octet(jeu, sortie + 7));
    return 1;
  }
  // Un autre kiosque se tourne vers la case : sa figure et sa direction.
  const numeroDuKiosque = ((kiosque - long(jeu, CARTE)) >> 2) | 0;
  const figures = long(jeu, FIGURES);
  let figure = -1, direction = 0;
  if (numero === numeroDuKiosque + 0x40) { figure = 0xDA; direction = 2; }
  else if (numero === numeroDuKiosque - 0x40) { figure = 0xD4; direction = 0; }
  else if (numero === numeroDuKiosque - 1) { figure = 0x1AA; direction = 3; }
  else if (numero === numeroDuKiosque + 1) { figure = 0xD2; direction = 1; }
  if (figure >= 0) {
    poserMot(jeu, k + 0xA, mot(jeu, figures + figure));
    poserOctet(jeu, k + 0x12, direction);
  }
  return 1;
}

// =================================================================================================
// L'ENTRÉE ET LA SORTIE D'UNE ATTRACTION, LE MÉCANICIEN
// =================================================================================================

// 0x31D32 — après la pose de la sortie d'une attraction (outil 17), revenir à l'outil de la voie.
//
// L'objet dont on posait l'entrée et la sortie est `[[0xD3814] + 0x2D0]` ; son mot +0x16 désigne
// l'attraction, et celui de l'attraction sa fiche de genre (catalogue 0xCCED0). Selon l'octet +0xC
// de l'attraction : 4 et 0x1C (un circuit), si aucune des quatre cases voisines n'est un sol de
// circuit (drapeau 0x40) ; 6 (une voie), si aucune n'a de morceau de voie : l'outil en main devient
// celui de la fiche (+0xB5), pour que le joueur trace le circuit ou les rails.
//
// **Anomalie reproduite** : la valeur 0x40 du drapeau cherché est choisie par un test (état 0x1C ou
// non) dont les deux branches donnent la même valeur.
export function revenirALaVoie(jeu) {
  const objetPose = objet(jeu, mot(jeu, long(jeu, COMPTES) + 0x2D0));
  const attraction = objet(jeu, mot(jeu, objetPose + 0x16));
  const fiche = (0xCCED0 + mot(jeu, attraction + 0x16)) | 0;
  const etat = octet(jeu, attraction + 0xC);
  const cellule = (long(jeu, CARTE) + 4 * (octet(jeu, attraction + 9) * 64 + octet(jeu, attraction + 7))) | 0;
  const voisine = (d) => (cellule + 4 * motSigne(jeu, VOISINES + 2 * d)) | 0;
  let d = 0;
  if (etat === 4 || etat === 0x1C) {
    for (; d < 4; d++) {
      if ((mot(jeu, PROPRIETES_DES_SOLS + 4 * octet(jeu, voisine(d) + 2)) & 0x40) !== 0) break;
    }
  } else if (etat === 6) {
    for (; d < 4; d++) {
      if (jeu.appeler(OBJET_SUR_LA_CASE, voisine(d), TYPE_MORCEAU_DE_VOIE) !== 0) break;
    }
  } else {
    return;
  }
  if (d === 4) poserMot(jeu, OUTIL, mot(jeu, fiche + 0xB5));
}

// 0x3302A — envoyer le mécanicien le plus proche réparer l'attraction `attraction`.
//
// On cherche, parmi les employés (type 8) dans l'état 8 (le mécanicien qui attend), celui dont la
// distance en cases (colonnes plus rangées) est la plus petite, sous 10 000 ; à égalité, le
// premier. Il reçoit l'état 0x12, le kiosque d'entrée de l'attraction (+0x49) comme but (+0x16), la
// figure 0xBE de [0xD3B38] (mot +0x17C) comme image, et le drapeau +5 bit 1 ; son numéro est noté
// dans l'attraction (+0x4D). Rend 1, ou 0 s'il n'y en a aucun.
export function envoyerUnMecanicien(jeu, attraction) {
  let meilleur = 0, plusCourte = 10000;
  const fin = long(jeu, FIN_DES_OBJETS) >>> 0;
  for (let e = (long(jeu, OBJETS_DU_PARC) + TAILLE_OBJET) >>> 0; e < fin; e += TAILLE_OBJET) {
    if (octet(jeu, e + 4) !== 8 || octet(jeu, e + 0xC) !== 8) continue;
    const distance = jeu.appeler(VALEUR_ABSOLUE, octet(jeu, e + 7) - octet(jeu, attraction + 7))
      + jeu.appeler(VALEUR_ABSOLUE, octet(jeu, e + 9) - octet(jeu, attraction + 9));
    if (u16(distance) < u16(plusCourte)) { plusCourte = distance; meilleur = e; }
  }
  if (meilleur === 0) return 0;
  poserMot(jeu, attraction + 0x4D, idiv(meilleur - long(jeu, OBJETS_DU_PARC), TAILLE_OBJET));
  poserMot(jeu, meilleur + 0x16, mot(jeu, attraction + 0x49));
  poserOctet(jeu, meilleur + 0xC, 0x12);
  poserMot(jeu, meilleur + 0xA, mot(jeu, long(jeu, FIGURES) + 0x17C));
  poserOctet(jeu, meilleur + 5, octet(jeu, meilleur + 5) | 2);
  return 1;
}

// =================================================================================================
// L'INTERFACE ET LA FICHE DU JOUEUR
// =================================================================================================

// 0x20F4C — tracer l'image `image` de l'interface à (x, y), avec les drapeaux du traceur `drapeaux`.
// En 640x480, l'interface étant dessinée dans l'espace de 320x200, l'image est tracée au double de
// sa taille (0x66DFA), sans les drapeaux ; sinon elle est tracée telle quelle, puis 0xBECBC est
// remis à zéro.
export function tracerUneImageDeLInterface(jeu, x, y, image, drapeaux) {
  if ((octet(jeu, MODE_AFFICHAGE) & 8) !== 0) {
    jeu.appeler(TRACER_A_L_ECHELLE, image, s16(x), s16(y), u16(octet(jeu, image + 4) * 2), u16(octet(jeu, image + 5) * 2));
    return;
  }
  poserMot(jeu, DRAPEAUX_TRACEUR, drapeaux);
  jeu.appeler(basseResolution(jeu) ? TRACER_BASSE : TRACER_HAUTE, s16(x), s16(y), image);
  poserMot(jeu, DRAPEAUX_TRACEUR, 0);
}

const NOM_DU_JOUEUR = 0xD6690;      // la fiche du joueur, 0x8D octets : VOTRE NOM en tête
const SURNOM = 0xD66B0;             // celui des sauvegardes et du code de triche
const TAILLE_DE_LA_FICHE = 0x8D;
const DOSSIER_DU_JEU = 0xD3BDE;     // le chemin de l'installation
const CHEMIN_DE_LA_FICHE = 0xB014A; // « %ssave/%s.GD »
const CODE_DE_TRICHE = 0xB8C58;     // 48 9E 48 D0 10, puis 0
const ARGENT_DE_DEPART = 0xD6718;   // mot long
const ARGENTS_DE_DEPART = 0xB7F7C;  // 200 000, 150 000, 100 000
const NIVEAU_DE_DEPART = 0xD66F5;
const PARCS_VENDUS_PAR_PAYS = 0xD66F8;   // un octet par pays, 32
const GENRE_DE_PARTIE = 0xD66F1;    // 0 SIMPLE, 1 SIM., 2 GLOBALE
const MATERNELLE = 0xD7761, SIMULATION = 0xD7759, BUSINESS = 0xD775E;

// Le chemin de la fiche dans un tampon de la pile, là où l'original l'avait.
function cheminDeLaFiche(jeu, tampon) {
  jeu.appeler(FORMATER, tampon, CHEMIN_DE_LA_FICHE, DOSSIER_DU_JEU, SURNOM);
}

// 0x2E9E8 — écrire la fiche du joueur (0xD6690, 0x8D octets) dans save/<surnom>.GD. Rend 1, ou 0 si
// le fichier ne s'ouvre pas. (Mode 0x222 : lecture-écriture, création, binaire.)
export function ecrireLaFicheDuJoueur(jeu) {
  const tampon = variablesLocales(jeu, 16 + 0x2C);   // [ebp-0x2c]
  cheminDeLaFiche(jeu, tampon);
  const poignee = jeu.appeler(OUVRIR, tampon, 0x222);
  if (poignee < 0) return 0;
  jeu.appeler(ECRIRE_FICHIER, poignee, NOM_DU_JOUEUR, TAILLE_DE_LA_FICHE);
  jeu.appeler(FERMER, poignee);
  return 1;
}

// 0x2EA62 — le code de triche, puis la fiche du joueur.
//
// Le surnom est comparé à 0xB8C58 lettre à lettre, chaque lettre décalée à gauche de son rang
// (docs/retro-ingenierie.md § 7) : « HORZA » lève 0xD6682. La fonction ne le baisse jamais : un
// autre nom laisse le mot tel qu'il était.
//
// Puis la fiche gardée dans save/<surnom>.GD est relue (rend 1) ; à défaut (rend 0), une partie
// neuve : l'argent de départ selon le niveau, aucun pays vendu, et le mode de simulation.
export function verifierLeCodeDeTriche(jeu) {
  let rang = 0;
  while (octet(jeu, CODE_DE_TRICHE + rang) !== 0
    && ((octet(jeu, SURNOM + rang) << rang) & 0xFF) === octet(jeu, CODE_DE_TRICHE + rang)) rang++;
  if (octet(jeu, CODE_DE_TRICHE + rang) === 0 && octet(jeu, SURNOM + rang) === 0) poserMot(jeu, TRICHE, 1);

  const tampon = variablesLocales(jeu, 16 + 0x34);   // [ebp-0x30]
  cheminDeLaFiche(jeu, (tampon + 4) | 0);
  const poignee = jeu.appeler(OUVRIR, (tampon + 4) | 0, 0x200);
  if (poignee >= 0) {
    jeu.appeler(LIRE, poignee, NOM_DU_JOUEUR, TAILLE_DE_LA_FICHE);
    jeu.appeler(FERMER, poignee);
    return 1;
  }
  poserLong(jeu, ARGENT_DE_DEPART, long(jeu, ARGENTS_DE_DEPART + 4 * octet(jeu, NIVEAU_DE_DEPART)));
  jeu.appeler(REMPLIR, PARCS_VENDUS_PAR_PAYS, 0, 0x20);
  poserOctet(jeu, BUSINESS, 0);
  poserOctet(jeu, SIMULATION, 0);
  poserOctet(jeu, MATERNELLE, 0);
  switch (octet(jeu, GENRE_DE_PARTIE)) {
    case 0: poserOctet(jeu, MATERNELLE, 1); break;
    case 1: poserOctet(jeu, SIMULATION, 1); break;
    case 2: poserOctet(jeu, BUSINESS, 1); break;
    default: break;
  }
  return 0;
}

// =================================================================================================

export const reecritures = [
  { adresse: 0x2DEF8, nom: 'effacerLaDemandeDeSortie', fn: effacerLaDemandeDeSortie, arguments: 0 },
  { adresse: 0x2A2B1, nom: 'poserLaHauteur', fn: poserLaHauteur, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x2A2F1, nom: 'eleverLaVoie', fn: eleverLaVoie, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x2C6B8, nom: 'retirerUnMorceauDeVoie', fn: retirerUnMorceauDeVoie, arguments: 1, memoire: 'entiere' },
  { adresse: 0x1FEB5, nom: 'dessinerUnMorceauDeVoie', fn: dessinerUnMorceauDeVoie, arguments: 4 },
  { adresse: 0x28E5A, nom: 'poserUneBarriereDeFile', fn: poserUneBarriereDeFile, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x31D32, nom: 'revenirALaVoie', fn: revenirALaVoie, arguments: 0 },
  { adresse: 0x3302A, nom: 'envoyerUnMecanicien', fn: envoyerUnMecanicien, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x20F4C, nom: 'tracerUneImageDeLInterface', fn: tracerUneImageDeLInterface, arguments: 4 },
  { adresse: 0x2E9E8, nom: 'ecrireLaFicheDuJoueur', fn: ecrireLaFicheDuJoueur, arguments: 0, retour: true },
  { adresse: 0x2EA62, nom: 'verifierLeCodeDeTriche', fn: verifierLeCodeDeTriche, arguments: 0, retour: true },
];

export const enAttente = [];
