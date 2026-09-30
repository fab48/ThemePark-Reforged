// Le pas du calendrier et de l'économie : ce que la boucle du parc fait avancer à chaque image, hors
// des objets du parc — le temps, l'argent, la bourse, la recherche, la météo, les négociations,
// l'arrivée des voyous, l'ambiance sonore de la foule, l'usure de l'herbe.
//
// Réécriture lisible des fonctions 0x12B1F (le pas), 0x49B5B (un concurrent en bourse, et son
// banquier), 0x4A571 et 0x4AAF1 (acheter, vendre une action), 0x53F13 (la recherche du mois),
// 0x80568 et 0x805A4 (l'ambiance sonore) du jeu d'origine. Chaque constante vient du programme de
// 1994 ; `moteur/node/comparer.mjs` compare chaque appel à la transcription, `moteur/node/verifier.mjs`
// rejoue la même partie avec et sans ce module. Voir docs/guide-reecriture.md.

import { Cadre } from './cadre.js';

// --- Les joueurs et leurs fiches (docs/retro-ingenierie.md § 7 et § 10.8) ----------------------------
//
// [0xD3B00] désigne une table de 25 fiches de 0x222 octets, une par joueur : le joueur humain (fiche 0
// dans les parties étudiées) et ses concurrents. Dans la partie DEMO : la fiche 0 est de sorte 1,
// les fiches 1 à 20 de sorte 3, les fiches 21 à 24 de sorte 0 ; chaque fiche a le parc de son rang.
// Ce que ces fonctions en lisent et en écrivent :
//
//   +0     octet      la sorte : 0 fiche vide, 1 le joueur humain, 3 un concurrent ; 6, traitée comme 1
//                     (un joueur humain), non établie
//   +1     octet      le rang de la fiche (0 à 24), recopié dans les nouvelles de la bourse
//   +2     mot        le numéro de son parc (fiche du parc en 0xCF1E0 + parc × 0x250) ; c'est aussi
//                     l'index de ses comptes (0xD443C + parc × 0x6C2)
//   +5     octet      le pays du parc : le mot 0xB7B43 + pays × 0x1C est son taux d'intérêt annuel,
//                     en centièmes de pour cent (632, soit 6,32 %, pour le pays 11 de la partie DEMO) ;
//                     l'écran des finances l'affiche avec le mot qui le précède (2,80 %, son nom non
//                     établi). Ces valeurs ne sont pas celles de l'exécutable (475 pour ce pays) : la
//                     table est rechargée, avec la partie vraisemblablement
//   +0A    mot long   le solde en banque
//   +12    mot long   le prêt de la banque
//   +16    mot long   le solde à la fin du mois précédent
//   +1A    octet      a, de 0 à 4 : le caractère du concurrent en bourse, avec +1B (b), +1C (c) et
//   +1B, +1C, +1F     +1F (d), chacun de 0 à 4 ; ils choisissent les coefficients des tables
//                     0xB91AC à 0xB9355 (voir jouerEnBourse). Leur nom dans le jeu, non établi
//   +30    mot signé  un bonus de préférence pour le parc désigné par +32 (voir jouerEnBourse)
//   +32    octet      le rang de la fiche qui détient la plus grosse part de son parc (−1 : aucune)
//   +35    mot signé  le compteur de découvert : il monte tant que le solde reste sous le seuil de
//                     réserve ; le banquier prête d'office quand il dépasse prêt / 256 + 100
//   +95    octet      le rang du parc au classement (1 le premier, vraisemblablement ; écrit ailleurs)
//   +A3    25 mots    le nombre d'actions que le joueur détient dans chaque parc, indexé par le
//                     numéro du parc
//   +D5    mot long   la variation du solde sur le mois écoulé
//   +DD, +16D  trois historiques de 12 mots longs (mois, années, périodes de quatre ans ; le plus
//                     récent en dernier) : le solde, la capitalisation boursière du parc
//   +1FD   trois historiques de 12 octets : le rang au classement
//
// --- Les parcs --------------------------------------------------------------------------------------
//
// Une fiche de 0x250 octets par parc, en 0xCF1E0 ; [0xD3818] désigne celle du joueur courant
// (§ 10.8). Ce que ces fonctions en lisent et en écrivent :
//
//   +19    mot long   une somme de l'année, remise à zéro à la fin de l'année (0x729D8) : 977 172
//                     pour le parc du joueur dans la partie DEMO ; la bourse la lit. Laquelle, non établi
//   +1D    mot        le prix d'entrée (§ 10.2) ; +1F mot signé : le nombre de visiteurs présents
//   +21    octet signé la réputation du parc, vraisemblablement ; +22 : sa valeur précédente (la
//                     bourse lit la tendance +21 − +22). Non établi
//   +33    mot        les entrées cumulées (0x223C1 l'augmente à chaque visiteur qui entre) ; +51,
//                     octet : la moyenne, sur les mois écoulés de l'année, de la capacité des bus
//                     +48 (0x68E34)
//   +47    octet      les passagers des bus : son historique est le graphique « PASSAGERS BUS » de
//                     l'écran des finances ; le guichet le lit aussi comme seuil (§ 10.2)
//   +48, +49 octets   la capacité des bus, 0xB78CC[+49] (20, 24, 28… 208), et son niveau, que le
//                     joueur achète (0x78CEF) et que lit la création du bus (0x6128F)
//   +4B, +4D mot, octet  la capacité de l'entrepôt (les livraisons de marchandises y sont plafonnées)
//                     et son niveau, acheté à l'écran 0x79A04
//   +4A, +4E octets   les plafonds de ces deux niveaux, de 0 à 19, que relève la recherche du
//                     domaine 5 (« pour augmenter la capacité des bus et de votre entrepôt »)
//   +52    mot signé  le nombre de voyous (0x4C592 en ajoute un, 0x4C696 en retire un)
//   +5C, +5E, +60, +62 mots  les actions du parc : détenues par les autres joueurs, par son
//                     propriétaire, encore en vente, et leur nombre total
//   +66, +6A mots longs  le cours de l'action, et le cours précédent
//   +6E, +72 mots longs  la plus haute et la plus basse capitalisation, cours × (total / 10)
//   +77    octet      1 : une vente aux enchères de plans est en cours, vraisemblablement — la touche
//                     F l'allume et l'éteint (0x13BF3, code 0x21), le pas inscrit 5 par pas à la
//                     catégorie « achat de plans aux enchères », la boucle du parc l'anime (0x6D508,
//                     bruitages par 0x80FE0) et les visiteurs y gagnent du contentement, d'autant plus
//                     qu'elle dure (0x21681) ; +78, mot long : le pas où elle a commencé
//   +7C, +7E mots     le nombre d'installations (toilettes, fontaines…), et de cases d'un sol marqué
//                     0x800 (non établi)
//   +82    octet      le nombre d'attractions ; +97 mot long : l'usure moyenne des attractions
//                     (0x68E34)
//   +C2, +C4 mots     le nombre d'employés, et de renvois (0x32232 embauche, 0x325DA renvoie)
//   +C6, +E1 mots longs  le pas de la dernière négociation avec le personnel, avec les fournisseurs
//                     (écrits par 0x44EA5)
//   +DA    mot signé  lu par l'arrivée des voyous ; aucune instruction ne l'écrit par [0xD3818] :
//                     non établi
//   +EC, +F8 octets   le nombre de buvettes à manger et à boire (0x68E34)
//   +110, +112 mots   la réserve du budget de recherche (où revient le budget d'un domaine fini), et
//                     un drapeau de l'écran de la recherche (0x51780) ; sens exact non établi
//   +114   6 mots signés  le budget mensuel de recherche de chaque domaine
//   +120   6 mots signés  les points de recherche accumulés dans chaque domaine
//   +12C   mot long   le total des points de recherche dépensés
//   +248   6 octets   un octet par domaine, remis à zéro quand le domaine est fini ; +24E, +24F :
//                     remis à zéro quand les six le sont (non établi)
//
// --- Les comptes du joueur courant ([0xD3814], 0xD443C + joueur × 0x6C2) ----------------------------
//
//   +41    octet      le numéro du parc du joueur (écrit par 0x6E7E6)
//   +2B1   octet      remis à zéro chaque mois (non établi)
//   +2D2, +366, +3FA, +48E, +522  mots longs : les totaux du mois — recette des entrées (0x223C1),
//                     recette des boutiques (0x68616), les salaires (catégorie 13 du livre) et la
//                     catégorie 6, total des recettes, total des dépenses (simulation-outils.js, le
//                     livre des comptes)
//   +2D6, +36A, +3FE, +492, +526  leurs trois historiques de 12 mots longs
//   +5ED   octet      le mois de l'année, de 0 à 11
//   +5EF   trois historiques de 12 octets : l'attrait du prix d'entrée (+47 du parc)
//   +637, +638, +63C  la dernière nouvelle de la bourse : le rang de l'acheteur, le pas, sa part du
//                     parc du joueur en pour cent
//   +64C, +664  6 mots longs chacun : ce que chaque domaine de recherche a coûté, et ce qu'il doit
//                     coûter en tout pour être fini
//   +67C   mot long   le pas du dernier achat d'actions du parc du joueur par un concurrent
//   +682, +683  octets  une négociation en cours avec le personnel, avec les fournisseurs
//   +690   mot long   le pas du dernier tirage de l'arrivée des voyous
//
// --- La pile ---------------------------------------------------------------------------------------
//
// Aucune de ces fonctions n'est appelée par la mise à jour des objets du parc (0x21681) : la
// contrainte des restes de pile relus par 0x223C1 (visiteurs-etats-a.js, « La pile ») ne les concerne
// pas, et elles n'écrivent rien sous le pointeur de pile. Leurs appels passent par `jeu.appeler`.

const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;

// --- les accès à la mémoire du jeu, petit-boutiste ---------------------------------------------------
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

// La division entière du processeur (`idiv`) : tronquée vers zéro ; un diviseur nul lève une
// exception, comme sur la machine (et dans la transcription).
function idiv(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

// --- les données -------------------------------------------------------------------------------------

// Le temps : le compteur de pas de simulation, 1 000 par mois, 12 000 par an (§ 10.1).
const PAS_DE_SIMULATION = 0xD3AFC;
const PAS_PAR_MOIS = 1000, PAS_PAR_AN = 12000;
const pas = (jeu) => motLong(jeu, PAS_DE_SIMULATION);

// Les joueurs.
const FICHES = 0xD3B00;              // pointeur : les 25 fiches des joueurs
const TAILLE_FICHE = 0x222, NOMBRE_DE_FICHES = 25;
const JOUEUR = 0xD665C;              // mot : le joueur courant
const FICHE_DU_JOUEUR = 0xD3808;     // pointeur : sa fiche
const COMPTES_DU_JOUEUR = 0xD3814;   // pointeur : ses comptes
const PARC_DU_JOUEUR = 0xD3818;      // pointeur : la fiche de son parc
const PARCS = 0xCF1E0, TAILLE_PARC = 0x250;
const COMPTES = 0xD443C, TAILLE_COMPTES = 0x6C2;
const ficheNumero = (jeu, k) => (motLong(jeu, FICHES) + k * TAILLE_FICHE) >>> 0;
const parcDeLaFiche = (jeu, fiche) => PARCS + mot(jeu, fiche + 2) * TAILLE_PARC;
// Les actions que la fiche détient dans le parc numéro `parc`.
const actions = (fiche, parc) => fiche + 0xA3 + parc * 2;
// Le joueur désigné par une fiche, au sens de [0xD665C] : son rang dans la table.
const rangDeLaFiche = (jeu, fiche) => idiv((fiche - motLong(jeu, FICHES)) | 0, TAILLE_FICHE);

// Le niveau de jeu choisi aux options (0x50CCD, trois boutons exclusifs) : 0, 1 ou 2 — vraisemblablement
// le bac à sable, la simulation et le jeu complet. La bourse ne joue qu'au niveau 2 ; les négociations
// et les voyous ne viennent pas au niveau 0.
const NIVEAU_DE_JEU = 0xD66F1;
const ECRAN_COURANT = 0xD6652;       // mot : 0 le parc ; 0x32 et 0x4C, deux écrans où l'on ne négocie pas
const REDESSINER_LA_CARTE = 0xD666E;

// Les fonctions appelées.
const HASARD = 0x18B92;              // simulation-outils.js
const INSCRIRE_AU_LIVRE = 0x78943;   // (catégorie, montant) : simulation-outils.js
const COPIER = 0x80958;              // (destination, source, octets) : copie en avant, par mots longs
const CONCURRENTS = 0x6EE22;         // concurrents.js
const FIN_D_ANNEE = 0x7401C;         // fin-annee.js
const NEGOCIER = 0x44EA5;            // (2 le personnel, 4 les fournisseurs) : l'écran data/mneg-0.dat
const FAIRE_VENIR_UN_VOYOU = 0x4C592; // (genre)
const POSER_LA_PALETTE = 0x808B0;    // (palette) : les 256 couleurs, par les ports 0x3C8 et 0x3C9
const ARRETER_L_AMBIANCE = 0x80350;  // (propriétaire, bruitage) : sosDIGIStopSample s'il joue encore
const JOUER_SAUF_EN_COURS = 0x80FE0; // (propriétaire, bruitage) : docs/retro-ingenierie.md § 9.3
const JOUER_LE_RACHAT = 0x5C7D1;     // (2) : l'animation TAKEOVER (faillite.js), rien d'autre

// Les catégories du livre des comptes (simulation-outils.js) : le relevé de compte du jeu (l'écran
// des finances) donne à chacune son libellé, par la table de textes [0xD7BB0] indexée par la
// catégorie — 0 achat d'attraction, 1 achat de boutique, 2 achat d'ornement, 3 prime de licenciement,
// 4 recettes mensuelles des boutiques, 5 recettes mensuelles des entrées, 6 embauche de personnel,
// 7 intérêts payés, 8 double intérêts payés, 9 remboursement de prêt, 10 prêt contracté, 11 achat
// d'actions, 12 vente d'actions, 13 salaires, 14 embauche homme de main, 15 récompense, 16 achat de
// stock, 17 vente de stock, 18 recherche, 19 prix gagné, 20 amélioration des installations,
// 21 encaissement de dividendes, 22 paiement de dividendes, 23 installation de rails/pistes, 24 achat
// de plans aux enchères, 25 impôts locaux. Celles qu'inscrit ce module :
const LIVRE = {
  recetteDesBoutiques: 4, recetteDesEntrees: 5, interets: 7, interetsDuDecouvert: 8,
  achatDActions: 0xB, venteDActions: 0xC, salaires: 0xD, stock: 0x10, recherche: 0x12,
  ameliorationDesInstallations: 0x14, plansAuxEncheres: 0x18,
};

// ======================================================================================================
// 0x12B1F — un pas du calendrier
// ======================================================================================================

// La boucle du parc (0x11C45) l'appelle à chaque image où la simulation avance, avant la mise à jour
// des objets (0x21681). Dans l'ordre :
//   - le pas avance ; un délai de la souris (0xDE59E, posé par le gestionnaire 0x7D7E2) décompte ;
//   - les concurrents jouent (0x6EE22) ;
//   - au niveau de jeu 2, et passé 2 000 pas, une fiche de joueur passe en bourse (0x49B5B) : la
//     fiche (pas mod 1 000) mod 25, soit pas mod 25 (25 divise 1 000) : chacune tous les 25 pas ;
//     seulement quand le joueur courant est le 0 ;
//   - la vente aux enchères de plans, si elle est en cours, coûte 5 par pas ;
//   - le stock commandé pour les boutiques arrive ;
//   - tous les 32 pas, l'ambiance sonore de la foule suit le nombre de visiteurs ;
//   - tous les 64 pas, passé la deuxième année : les voyous, les négociations, la météo ;
//   - chaque mois : le bilan, les intérêts, les salaires, la recherche, les historiques ; chaque
//     année, la fin d'année (0x7401C) ;
//   - tous les 16 pas, un compteur (0xD6656, lu par 0x1F8F8 : non établi) ;
//   - l'herbe s'use au bord d'une allée tirée au hasard.
//
// Le hasard (0x18B92) est tiré aux mêmes endroits, dans le même ordre : une fois par voyou possible,
// une fois par négociation possible, une fois pour la météo (deux quand elle commence), puis une
// dernière fois pour l'herbe, à chaque pas.
//
// Un reste de pile (le sixième, index.js `resteRelu`) : la boucle du parc appelle le calendrier puis
// la mise à jour des objets (0x21681) de la même hauteur, et l'état 4 des visiteurs (0x223C1) peut
// relire comme sa variable [ebp-8], jamais écrite, l'octet 0x58 sous l'entrée du calendrier, quand
// aucune routine d'objet appelée avant lui n'y a rien écrit. C'est l'ebx que le hasard a sauvé en
// entrant, au tirage de l'herbe : le dernier appel du calendrier, fait du fond de son cadre (push ebx,
// esi, edi, enter 0x40). Le pas ouvre donc le cadre de l'original, y appelle ses sous-fonctions à la
// même hauteur, et appelle le hasard de l'herbe avec l'adresse de retour et l'ebx de l'original.
export function pasDuCalendrier(jeu) {
  const cadre = new Cadre(jeu, 0x40);
  try {
    unPasDuCalendrier(jeu);
  } finally {
    cadre.fermer();
  }
}

function unPasDuCalendrier(jeu) {
  ecrireMotLong(jeu, PAS_DE_SIMULATION, pas(jeu) + 1);
  if (mot(jeu, DELAI_DE_LA_SOURIS) !== 0) ajouterAuMot(jeu, DELAI_DE_LA_SOURIS, -1);
  jeu.appeler(CONCURRENTS);

  if (pas(jeu) >= 2000 && octet(jeu, NIVEAU_DE_JEU) === 2 && mot(jeu, JOUEUR) === 0) {
    const k = (pas(jeu) % PAS_PAR_MOIS) % NOMBRE_DE_FICHES;
    jeu.appeler(JOUER_EN_BOURSE, ficheNumero(jeu, k));
  }

  if (octet(jeu, motLong(jeu, PARC_DU_JOUEUR) + 0x77) === 1) jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.plansAuxEncheres, -5);

  livrerLesMarchandises(jeu);
  if ((octet(jeu, PAS_DE_SIMULATION) & 0x1F) === 0) reglerLAmbianceDeLaFoule(jeu);
  if ((octet(jeu, PAS_DE_SIMULATION) & 0x3F) === 0 && pas(jeu) > 2 * PAS_PAR_AN) {
    faireVenirLesVoyous(jeu);
    if (octet(jeu, NIVEAU_DE_JEU) !== 0) negocier(jeu);
    faireLaMeteo(jeu);
  }
  const finDuMois = pas(jeu) % PAS_PAR_MOIS === 0;
  if (finDuMois) finirLeMois(jeu);
  if ((octet(jeu, PAS_DE_SIMULATION) & 0xF) === 0) ajouterAuMot(jeu, COMPTEUR_DE_16_PAS, 1);
  // L'ebx de l'original au tirage de l'herbe (0x139A8) : la dernière valeur que le pas y a mise.
  // Hors fin de mois, le diviseur du test du mois (0x133AB, mov ebx, 0x3E8 ; un reste non nul saute
  // droit à 0x13998). En fin de mois, la boucle qui range les historiques (0x1362D, parcourue au
  // moins une fois : son compte, [ebp-4], vaut 1, 2 ou 3) le recharge en dernier du pointeur des
  // comptes du joueur ([0xD3814], en 0x13937), qui ne change plus jusqu'au tirage : 0xD443C pour le
  // joueur 0.
  poserEbx(jeu, finDuMois ? motLong(jeu, COMPTES_DU_JOUEUR) : PAS_PAR_MOIS);
  userLHerbe(jeu);
}

function poserEbx(jeu, valeur) {
  jeu.T.sauver();
  jeu.T.R.ebx = valeur | 0;
  jeu.T.charger();
}

const DELAI_DE_LA_SOURIS = 0xDE59E;   // mot : décompté à chaque pas ; son rôle, non établi
const COMPTEUR_DE_16_PAS = 0xD6656;   // mot : remis à zéro par 0x2E035
const JOUER_EN_BOURSE = 0x49B5B;

// --- le stock des boutiques ----------------------------------------------------------------------------

// Les marchandises (§ 10.4 : la réserve d'une boutique, fiche +0x67, y renvoie) : une table de
// fiches de 14 octets en 0xD3C00, close par un mot +0 nul :
//   +0 mot   non nul tant que la table continue (son sens, non établi)
//   +2 mot   le prix unitaire ;  +4 mot : le stock ;  +6 mot : la quantité commandée
//   +A mot   le délai de livraison, en pas (0 : rien en commande) ;  +C mot : les pas écoulés
// Une commande arrivée est payée (catégorie « achat de stock »), rangée dans le stock sans dépasser la
// capacité de l'entrepôt (+0x4B), et la commande est soldée.
const MARCHANDISES = 0xD3C00, TAILLE_MARCHANDISE = 14;

function livrerLesMarchandises(jeu) {
  for (let k = 0; ; k = (k + 1) | 0) {
    const m = MARCHANDISES + (k & 0xFFFF) * TAILLE_MARCHANDISE;
    if (mot(jeu, m) === 0) return;
    if (mot(jeu, m + 0xA) === 0) continue;
    ajouterAuMot(jeu, m + 0xC, 1);
    if (mot(jeu, m + 0xC) < mot(jeu, m + 0xA)) continue;
    jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.stock, Math.imul(mot(jeu, m + 6), -mot(jeu, m + 2)));
    const capacite = mot(jeu, motLong(jeu, PARC_DU_JOUEUR) + 0x4B);
    if (mot(jeu, m + 4) + mot(jeu, m + 6) > capacite) ecrireMot(jeu, m + 4, capacite);
    else ajouterAuMot(jeu, m + 4, mot(jeu, m + 6));
    ecrireMot(jeu, m + 6, 0);
    ecrireMot(jeu, m + 0xA, 0);
    ecrireMot(jeu, m + 0xC, 0);
  }
}

// --- l'ambiance de la foule ----------------------------------------------------------------------------

// Le bruit de la foule est le bruitage 0x15, joué en boucle pour le propriétaire 0 (0x80568, mode 3) à
// un volume de visiteurs / 4 + 20, 70 au plus ; sans visiteurs, il s'arrête (0x80350). Il n'est
// relancé que si le volume change ([0xB14B4] garde le dernier). Un nombre de visiteurs négatif vaut 0.
const VOLUME_DE_LA_FOULE = 0xB14B4;
const BRUIT_DE_LA_FOULE = 0x15;
const REGLER_L_AMBIANCE = 0x80568;

function reglerLAmbianceDeLaFoule(jeu) {
  const visiteurs = motSigne(jeu, motLong(jeu, PARC_DU_JOUEUR) + 0x1F);
  let volume = 0;
  if (visiteurs > 0) {
    volume = (visiteurs >> 2) + 20;
    if (volume > 70) volume = 70;
  }
  if (octet(jeu, VOLUME_DE_LA_FOULE) === volume) return;
  ecrireOctet(jeu, VOLUME_DE_LA_FOULE, volume);
  if (volume === 0) jeu.appeler(ARRETER_L_AMBIANCE, 0, BRUIT_DE_LA_FOULE);
  else jeu.appeler(REGLER_L_AMBIANCE, 0, BRUIT_DE_LA_FOULE, 3, volume);
}

// --- les voyous --------------------------------------------------------------------------------------

// Une fois par an au plus (12 000 pas après le tirage précédent, comptes +0x690), passé la quatrième
// année, tant que le parc compte moins de 4 voyous, le sort décide s'il en vient. Le seuil, de 32 à
// 256 sur 512 : réputation (+0x21) − +0xDA − voyous présents − installations / 8 − cases 0x800 (+0x7E)
// + usure moyenne des attractions / 8 + prix d'entrée / 32. S'il est atteint (et hors du niveau de
// jeu 0), un voyou arrive (0x4C592, de genre hasard mod 4), puis jusqu'à 15 autres chances, sur 1 024
// cette fois, d'en faire venir un de plus, 4 en tout au plus. Le tirage est daté même s'il ne vient
// personne.
function faireVenirLesVoyous(jeu) {
  const parc = motLong(jeu, PARC_DU_JOUEUR);
  const comptes = motLong(jeu, COMPTES_DU_JOUEUR);
  if (((pas(jeu) - motLong(jeu, comptes + 0x690)) >>> 0) <= PAS_PAR_AN || pas(jeu) <= 4 * PAS_PAR_AN
      || motSigne(jeu, parc + 0x52) >= 4) return;
  const tirage = (jeu.appeler(HASARD) & 0xFFFF) % 512;
  let seuil = (octetSigne(jeu, parc + 0x21) - motSigne(jeu, parc + 0xDA) - motSigne(jeu, parc + 0x52)
    - (mot(jeu, parc + 0x7C) >> 3) - mot(jeu, parc + 0x7E) + idiv(motLongSigne(jeu, parc + 0x97), 8)
    + (mot(jeu, parc + 0x1D) >> 5)) | 0;
  if (seuil > 0x100) seuil = 0x100;
  else if (seuil < 0x20) seuil = 0x20;
  if (tirage <= seuil && octet(jeu, NIVEAU_DE_JEU) !== 0) {
    jeu.appeler(FAIRE_VENIR_UN_VOYOU, (jeu.appeler(HASARD) & 0xFFFF) % 4);
    let venus = 1;
    for (let essai = 0; essai < 16 && venus < 4; essai++) {
      if ((jeu.appeler(HASARD) & 0xFFFF) % 1024 > seuil) continue;
      jeu.appeler(FAIRE_VENIR_UN_VOYOU, (jeu.appeler(HASARD) & 0xFFFF) % 4);
      venus++;
    }
  }
  ecrireMotLong(jeu, motLong(jeu, COMPTES_DU_JOUEUR) + 0x690, pas(jeu));
}

// --- les négociations --------------------------------------------------------------------------------

// Une négociation en cours (comptes +0x682 le personnel, +0x683 les fournisseurs) revient à l'écran
// un mois après la précédente séance ([0xD3BB0], [0xD3BAC], écrits par 0x44EA5). Sinon, passé la
// troisième année, hors des écrans 0x32 et 0x4C, l'une ou l'autre peut s'ouvrir, au plus tôt deux
// ans après une négociation du même genre et un an après une de l'autre genre :
//   - le personnel, s'il y a des employés, avec une chance sur 2 048 de
//     8 × renvois + employés + 8 × réputation + 2 × [0xD668C] + capacité des bus / 8 ;
//   - sinon les fournisseurs, s'il y a des buvettes (à manger ou à boire), avec une chance de
//     8 × buvettes + 8 × réputation + 2 × [0xD668C] + capacité de l'entrepôt / 32.
// [0xD668C], mot signé : un facteur de l'année, tiré à chaque fin d'année par 0x729D8 (le plus grand de
// 1 et de 3 − hasard mod 6 : 1 quatre fois sur six, 2 et 3 une fois sur six chacun) et qui vaut 7 au début
// d'une partie (0x19EEE) ; son nom dans le jeu, non établi.
const SEANCE_DU_PERSONNEL = 0xD3BB0, SEANCE_DES_FOURNISSEURS = 0xD3BAC;
const PERSONNEL = 2, FOURNISSEURS = 4;
const FACTEUR_DE_L_ANNEE = 0xD668C;

function negocier(jeu) {
  const comptes = motLong(jeu, COMPTES_DU_JOUEUR);
  if (octet(jeu, comptes + 0x682) !== 0) {
    if (((pas(jeu) - motLong(jeu, SEANCE_DU_PERSONNEL)) >>> 0) >= PAS_PAR_MOIS) jeu.appeler(NEGOCIER, PERSONNEL);
    return;
  }
  if (octet(jeu, comptes + 0x683) !== 0) {
    if (((pas(jeu) - motLong(jeu, SEANCE_DES_FOURNISSEURS)) >>> 0) >= PAS_PAR_MOIS) jeu.appeler(NEGOCIER, FOURNISSEURS);
    return;
  }
  const parc = motLong(jeu, PARC_DU_JOUEUR);
  const depuis = (champ) => (pas(jeu) - motLong(jeu, parc + champ)) >>> 0;
  const ecran = mot(jeu, ECRAN_COURANT);
  const ecranPermis = ecran !== 0x32 && ecran !== 0x4C;
  const buvettes = octet(jeu, parc + 0xEC) + octet(jeu, parc + 0xF8);
  if (pas(jeu) > 3 * PAS_PAR_AN && depuis(0xC6) > 2 * PAS_PAR_AN && depuis(0xE1) > PAS_PAR_AN
      && mot(jeu, parc + 0xC2) !== 0 && ecranPermis) {
    const tirage = (jeu.appeler(HASARD) & 0xFFFF) % 2048;
    const seuil = motSigne(jeu, parc + 0xC4) * 8 + mot(jeu, parc + 0xC2) + octetSigne(jeu, parc + 0x21) * 8
      + motSigne(jeu, FACTEUR_DE_L_ANNEE) * 2 + (octet(jeu, parc + 0x48) >> 3);
    if (tirage <= seuil) jeu.appeler(NEGOCIER, PERSONNEL);
  } else if (pas(jeu) > 3 * PAS_PAR_AN && depuis(0xE1) > 2 * PAS_PAR_AN && depuis(0xC6) > PAS_PAR_AN
      && buvettes !== 0 && ecranPermis) {
    const tirage = (jeu.appeler(HASARD) & 0xFFFF) % 2048;
    const seuil = buvettes * 8 + octetSigne(jeu, parc + 0x21) * 8 + motSigne(jeu, FACTEUR_DE_L_ANNEE) * 2
      + (mot(jeu, parc + 0x4B) >> 5);
    if (tirage <= seuil) jeu.appeler(NEGOCIER, FOURNISSEURS);
  }
}

// --- la météo ----------------------------------------------------------------------------------------

// Le temps qu'il fait, [0xB14CC] : 0 beau, sinon l'une de trois intempéries, 1, 2 ou 4, que la boucle
// du parc dessine (0x11C45 : 2 par 0x47A27, 360 éléments ; 1 et 4 par 0x47606), que les visiteurs
// subissent (0x21681) et que d'autres routines consultent. Leur nature exacte n'est pas établie ; la 2,
// la plus fréquente en hiver et absente au printemps et en été, est vraisemblablement la neige.
// Au plus 4 intempéries par an ([0xB14D1], remis à zéro par la fin d'année 0x7401C). Quand il fait
// beau, à chaque tirage (tous les 64 pas), sur 512 :
//   décembre à février   2 : 3 chances, 4 : 2, 1 : 1
//   mars à mai           4 : 2 chances, 1 : 2
//   juin à août          4 : 1 chance,  1 : 1
//   septembre à novembre 2 : 1 chance,  4 : 1, 1 : 2
// L'intempérie commence au pas [0xB14CD], avec un vent [0xB14CB] de −3 à 3 (la dérive des éléments
// dessinés). Elle cesse au-delà de 1 000 pas, ou, passé 200 pas, avec une chance sur 16 à chaque
// tirage ; la palette du parc ([0xD3B8C]) est alors reposée, si le parc est à l'écran.
//
// Anomalie reproduite : la fin d'intempérie est aussi examinée quand il fait beau mais que les 4 de
// l'année ont eu lieu. Elle tire alors le hasard (entre 200 et 1 000 pas après le début de la
// dernière), et repose la palette à chaque tirage au-delà.
const TEMPS = 0xB14CC, DEBUT_DU_TEMPS = 0xB14CD, VENT = 0xB14CB, INTEMPERIES_DE_L_ANNEE = 0xB14D1;
const TEMPS_B14C9 = 0xB14C9;   // mot : remis à zéro avec le temps ; aucune instruction ne le lit
const PALETTE_DU_PARC = 0xD3B8C;

function faireLaMeteo(jeu) {
  if (octet(jeu, TEMPS) === 0 && octet(jeu, INTEMPERIES_DE_L_ANNEE) < 4) {
    const mois = ((pas(jeu) % PAS_PAR_AN) / PAS_PAR_MOIS | 0) + 1;
    const tirage = (jeu.appeler(HASARD) & 0xFFFF) % 512;
    const temps = choisirLeTemps(mois, tirage);
    if (temps === null) finirLIntemperie(jeu);   // jamais : le mois va de 1 à 12
    else if (temps !== 0) ecrireOctet(jeu, TEMPS, temps);
    if (octet(jeu, TEMPS) !== 0) {
      ecrireOctet(jeu, INTEMPERIES_DE_L_ANNEE, octet(jeu, INTEMPERIES_DE_L_ANNEE) + 1);
      ecrireMotLong(jeu, DEBUT_DU_TEMPS, pas(jeu));
      ecrireOctet(jeu, VENT, 3 - (jeu.appeler(HASARD) & 0xFFFF) % 7);
    }
    return;
  }
  const duree = (pas(jeu) - motLong(jeu, DEBUT_DU_TEMPS)) | 0;
  if (duree > 1000) finirLIntemperie(jeu);
  else if (duree > 200 && (jeu.appeler(HASARD) & 0xFFFF) % 16 === 0) finirLIntemperie(jeu);
}

// Le temps tiré pour un mois (1 à 12) et un tirage (0 à 511) : 0 s'il reste beau. Le programme prévoit
// un dernier cas, hors des quatre saisons, qui finit l'intempérie : `null`, jamais atteint.
function choisirLeTemps(mois, tirage) {
  if (mois >= 12 || mois <= 2) return [2, 2, 2, 4, 4, 1][tirage] || 0;
  if (mois <= 5) return [4, 4, 1, 1][tirage] || 0;
  if (mois <= 8) return [4, 1][tirage] || 0;
  if (mois <= 11) return [2, 4, 1, 1][tirage] || 0;
  return null;
}

function finirLIntemperie(jeu) {
  ecrireOctet(jeu, TEMPS, 0);
  ecrireMot(jeu, TEMPS_B14C9, 0);
  if (mot(jeu, ECRAN_COURANT) === 0) jeu.appeler(POSER_LA_PALETTE, motLong(jeu, PALETTE_DU_PARC));
}

// --- la fin du mois ------------------------------------------------------------------------------------

// Chaque mois : la carte est redessinée, le mois de l'année noté (comptes +0x5ED) ; à la fin de
// l'année, la fin d'année (0x7401C, argument 14 — son sens, fin-annee.js) et le mois repart de 0.
// Puis le bilan du joueur courant :
//   - la variation du solde sur le mois (fiche +0xD5), et le solde du mois (+0x16) ;
//   - les intérêts, au taux de son pays (0xB7B43) : solde positif, ceux du prêt, prêt × taux / 10 000
//     / 12, en catégorie 7 ; solde nul ou négatif, ceux du prêt plus ceux du découvert, au double du
//     taux (solde × taux × 2 / 10 000 / 12), ensemble en catégorie 8 ;
//   - au livre : la recette du mois des entrées (5) et des boutiques (4), les salaires (13), les
//     intérêts ;
//   - la recherche du mois (0x53F13) ;
//   - les historiques : chacun garde 12 valeurs, la plus récente en dernier, et avance d'un cran ;
//     chaque mois celui des mois, en plus chaque année celui des années, et tous les quatre ans
//     celui des périodes de quatre ans (au 4e, au 8e… an). Au cran nouveau, la valeur courante : le
//     solde, le rang, la capitalisation du parc (actions × cours), les totaux du mois, l'attrait ;
//   - les totaux du mois repartent de zéro.
//
// Les salaires payés sont ceux des métiers (0xD35C0 + métier × 0x36, mot +0x24 : le salaire du métier,
// que seule la négociation avec le personnel, 0x44EA5, modifie, et sous lequel 0x68E34 ne laisse
// descendre aucun employé ; § 10.5), un par employé, et non le salaire propre de chaque employé
// (+0x9A, que règle son écran, 0x3B76E, et que lisent les amuseurs, 0x32BCF) : que ce dernier soit
// payé ailleurs, non établi. Les produits sont sur 32 bits, comme les divisions (tronquées vers zéro).
const PAYS = 0xB7B43, TAILLE_PAYS = 0x1C;
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;
const OBJETS_DU_PARC = 0xD3B10, FIN_DES_OBJETS_DU_PARC = 0xD3B78, TAILLE_OBJET = 200;
const PERSONNEL_DU_PARC = 8;   // le type des employés
const RECHERCHER = 0x53F13;

function finirLeMois(jeu) {
  ecrireMot(jeu, REDESSINER_LA_CARTE, 1);
  let historiques = 1;
  ecrireOctet(jeu, motLong(jeu, COMPTES_DU_JOUEUR) + 0x5ED, (pas(jeu) % PAS_PAR_AN) / PAS_PAR_MOIS | 0);
  if (pas(jeu) % PAS_PAR_AN === 0) {
    jeu.appeler(FIN_D_ANNEE, 14);
    historiques++;
    if (pas(jeu) % (4 * PAS_PAR_AN) === 0) historiques++;
    ecrireOctet(jeu, motLong(jeu, COMPTES_DU_JOUEUR) + 0x5ED, 0);
  }

  const fiche = motLong(jeu, FICHE_DU_JOUEUR);
  const comptes = motLong(jeu, COMPTES_DU_JOUEUR);
  ecrireMotLong(jeu, fiche + 0xD5, motLong(jeu, fiche + 0xA) - motLong(jeu, fiche + 0x16));
  ecrireMotLong(jeu, fiche + 0x16, motLong(jeu, fiche + 0xA));
  ecrireOctet(jeu, comptes + 0x2B1, 0);

  const taux = mot(jeu, PAYS + octetSigne(jeu, fiche + 5) * TAILLE_PAYS);
  const solde = motLongSigne(jeu, fiche + 0xA), pret = motLongSigne(jeu, fiche + 0x12);
  const interetsDuPret = idiv(-idiv(Math.imul(pret, taux), 10000), 12);
  let interets = 0, interetsEtDecouvert = 0;
  if (solde > 0) interets = interetsDuPret;
  else interetsEtDecouvert = (idiv(idiv(Math.imul(Math.imul(solde, taux), 2), 10000), 12) + interetsDuPret) | 0;

  let salaires = 0;
  const fin = motLong(jeu, FIN_DES_OBJETS_DU_PARC);
  for (let p = (motLong(jeu, OBJETS_DU_PARC) + TAILLE_OBJET) >>> 0; p < fin; p = (p + TAILLE_OBJET) >>> 0) {
    if (octet(jeu, p + 4) === PERSONNEL_DU_PARC) salaires = (salaires + mot(jeu, METIERS + octet(jeu, p + 0x59) * TAILLE_METIER + 0x24)) | 0;
  }

  if (motLong(jeu, comptes + 0x2D2) !== 0) jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.recetteDesEntrees, motLong(jeu, comptes + 0x2D2));
  if (motLong(jeu, comptes + 0x366) !== 0) jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.recetteDesBoutiques, motLong(jeu, comptes + 0x366));
  if (salaires !== 0) jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.salaires, -salaires);
  if (interets !== 0) jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.interets, interets);
  else if (interetsEtDecouvert !== 0) jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.interetsDuDecouvert, interetsEtDecouvert);

  jeu.appeler(RECHERCHER);

  for (let h = 0; h < historiques; h++) avancerLesHistoriques(jeu, h);
  for (const total of [0x48E, 0x522, 0x2D2, 0x366, 0x3FA]) ecrireMotLong(jeu, motLong(jeu, COMPTES_DU_JOUEUR) + total, 0);
}

// Un historique de 12 valeurs avance d'un cran : la plus ancienne sort, et la valeur courante prend la
// dernière place. `h` : 0 les mois, 1 les années, 2 les périodes de quatre ans.
function avancerLesHistoriques(jeu, h) {
  const comptes = () => motLong(jeu, COMPTES_DU_JOUEUR);
  const fiche = () => motLong(jeu, FICHE_DU_JOUEUR);
  const decaler = (base, taille) => jeu.appeler(COPIER, base, base + taille, 11 * taille);
  decaler(comptes() + 0x492 + h * 0x30, 4);
  decaler(comptes() + 0x526 + h * 0x30, 4);
  decaler(comptes() + 0x2D6 + h * 0x30, 4);
  decaler(comptes() + 0x36A + h * 0x30, 4);
  decaler(comptes() + 0x3FE + h * 0x30, 4);
  decaler(comptes() + 0x5EF + h * 0xC, 1);
  decaler(fiche() + 0x1FD + h * 0xC, 1);
  decaler(fiche() + 0x16D + h * 0x30, 4);
  decaler(fiche() + 0xDD + h * 0x30, 4);
  const parc = motLong(jeu, PARC_DU_JOUEUR);
  ecrireMotLong(jeu, fiche() + 0x109 + h * 0x30, motLong(jeu, fiche() + 0xA));
  ecrireOctet(jeu, fiche() + 0x208 + h * 0xC, octet(jeu, fiche() + 0x95));
  ecrireMotLong(jeu, fiche() + 0x199 + h * 0x30, Math.imul(mot(jeu, parc + 0x62), motLong(jeu, parc + 0x66)));
  ecrireMotLong(jeu, comptes() + 0x4BE + h * 0x30, motLong(jeu, comptes() + 0x48E));
  ecrireMotLong(jeu, comptes() + 0x552 + h * 0x30, motLong(jeu, comptes() + 0x522));
  ecrireMotLong(jeu, comptes() + 0x302 + h * 0x30, motLong(jeu, comptes() + 0x2D2));
  ecrireMotLong(jeu, comptes() + 0x396 + h * 0x30, motLong(jeu, comptes() + 0x366));
  ecrireMotLong(jeu, comptes() + 0x42A + h * 0x30, motLong(jeu, comptes() + 0x3FA));
  ecrireOctet(jeu, comptes() + 0x5FA + h * 0xC, octet(jeu, parc + 0x47));
}

// --- l'usure de l'herbe --------------------------------------------------------------------------------

// Une case de la carte est tirée au hasard. Si c'est une allée, une file ou un circuit (drapeaux 2, 8,
// 0x40 du sol, § 10.7), la première de ses voisines (haut, droite, bas, gauche) qui est de l'herbe
// neuve (images 0 à 3) sans rien dessus devient de l'herbe usée, l'image 0x6C (0xB7E12[rangée mod 5] :
// les cinq valeurs sont 0x6C). À défaut, la première voisine usée (image 0x6C ou 0x6D, sol sans aucun
// drapeau) sans rien dessus s'use d'un cran de plus. Le programme teste cinq fois le même intervalle
// d'images, vestige vraisemblable d'une liste d'intervalles : un seul test ici.
//
// Aucun contrôle de bord : au bord de la carte, la « voisine » est lue, et peut être écrite, hors
// d'elle (anomalie reproduite).
const CARTE = 0xD3B08;
const SOLS = 0xB44D9;
const DIRECTIONS = 0xB4920;   // mots signés : −64, +1, +64, −1
const HERBE_USEE = 0xB7E12;
const ALLEE_FILE_OU_CIRCUIT = 0x4A;
const TIRAGE_DE_L_HERBE = 0x139AD;   // le retour de l'appel du hasard en 0x139A8

function userLHerbe(jeu) {
  const carte = motLong(jeu, CARTE);
  // appelé du fond du cadre du calendrier, avec l'adresse de retour de l'original (voir pasDuCalendrier)
  const tirage = jeu.appelerDepuis(TIRAGE_DE_L_HERBE, jeu.T.lireRegistre('esp') >>> 0, HASARD);
  const c = (carte + ((tirage & 0xFFFF) % 4096) * 4) >>> 0;
  if (!(octet(jeu, SOLS + octet(jeu, c + 2) * 4) & ALLEE_FILE_OU_CIRCUIT)) return;
  const voisine = (d) => (c + motSigne(jeu, DIRECTIONS + 2 * d) * 4) >>> 0;
  for (let d = 0; d < 4; d++) {
    const v = voisine(d);
    if (octet(jeu, v + 2) <= 3 && mot(jeu, v) === 0) {
      const rangee = idiv(((c - motLong(jeu, CARTE)) | 0) >> 2, 64);
      ecrireOctet(jeu, v + 2, octet(jeu, HERBE_USEE + rangee % 5));
      return;
    }
  }
  for (let d = 0; d < 4; d++) {
    const v = voisine(d);
    const image = octet(jeu, v + 2);
    if (mot(jeu, SOLS + image * 4) !== 0 || mot(jeu, v) !== 0) continue;
    if (image >= 0x6C && image < 0x6E) {
      ecrireOctet(jeu, v + 2, image + 1);
      return;
    }
  }
}

// ======================================================================================================
// 0x49B5B — un joueur en bourse, et son banquier
// ======================================================================================================

// Les tables du caractère d'un concurrent (données du programme, jamais écrites) ; a, b, c, d sont les
// octets +1A, +1B, +1C, +1F de sa fiche, de 0 à 4. Valeurs pour a = 0 (puis a = 4) :
const TABLES = {
  bonusPropre: 0xB91AC,    // octets [a][c] : 1 2 5 8 12 (8 10 13 16 20) — préférence pour son parc
  bonusDeLaPart: 0xB91C5,  // octets [a][c] : 6 8 8 10 10 (1 2 4 6 6) — × la part d'un autre dans son parc
  coefActivite: 0xB91F7,   // octets [a][d] : 3 2 2 1 1 — × (entrées cumulées − 8 × moyenne +51)
  coefValeur: 0xB9210,     // octets [a][d] : 3 2 2 1 1 — × valeur du parc (+19) / 512
  coefReputation: 0xB9229, // octets [a][d] : 2 2 1 1 1 — × (256 × tendance + 128 × réputation)
  coefDetenue: 0xB9274,    // octets [a][d] : 3 2 2 1 1 — × la part du parc qu'il détient, en %
  coefEnVente: 0xB928D,    // octets [a][d] : tous 1 — × la part du parc encore en vente, en %
  coefFortune: 0xB92A6,    // octets [a][d] : tous 1 — × (solde − prêt) / 256 de l'autre joueur
  seuil: 0xB92BF,          // mots [a][b] : 0 700 1000 1200 1600 (200 300 400 800 900)
  reserve: 0xB92F1,        // mots longs [a][c] : 13 000 à 25 000 (2 000 à 7 500) — l'argent qu'il garde
  plancher: 0xB9355,       // mots longs [a][c] : 100 à 3 000 (500 à 5 000)
};
const coef = (jeu, table, a, x) => octet(jeu, table + a * 5 + x);

// Un pas de bourse d'un joueur : il note chaque parc, puis vend une action du plus mal noté qu'il
// détient, ou achète une action du mieux noté qu'il peut payer ; enfin son banquier surveille son
// découvert. La fiche d'un joueur humain (sortes 1 et 6) ou vide n'est pas traitée.
//
// La note d'un parc P (la fiche du propriétaire, F) :
//   ((256 × (réputation − précédente) + 128 × réputation) × coefRéputation)
//   + (entrées cumulées − 8 × moyenne +51) × 16 × coefActivité
//   + (solde − prêt de F) / 256 × coefFortune + valeur du parc / 512 × coefValeur
//   + (hasard mod (d + 1)) × 256
//   − coefEnVente × (actions en vente × 100) / total
//   + coefDétenue × part détenue (en %), quadruplée entre 40 et 60 %
//   + le bonus +30 de la fiche si F est le joueur de +32.
// Sont notés : les autres parcs dont il reste des actions en vente ou dont il détient des actions,
// parmi ceux des concurrents ; ceux des joueurs humains, un mois après que quelqu'un a acheté des
// actions de leur parc (comptes +0x67C) — sans autre condition.
//
// Il vendrait le parc le plus mal noté dont il détient des actions, si sa note est sous le seuil de
// vente : seuil [a][b], plus 1 000 000 s'il est sous le plancher (passé la première année), ou 100
// si son compteur de découvert est sous −100 et son solde sous 50 000. Il achèterait le mieux noté
// dont la note, moins le cours / 32, dépasse le seuil [a][b], s'il en reste en vente et si son solde
// moins le cours reste au-dessus du plancher.
//
// Son propre parc est noté à part, s'il en reste en vente : même note, sans le hasard, avec
// l'activité × 4 (au lieu de 16), l'action en vente comptée après la division, la part quadruplée
// entre 30 et 50 %, et des bonus de préférence à l'achat et à la vente, qui passent à 30 × bonus
// + 1 000 dès qu'un autre joueur en détient autant que lui (plus que lui, pour l'achat) et a plus
// d'argent que la moitié de la capitalisation du parc.
//
// La décision : vendre le parc choisi s'il diffère de celui à acheter ; si c'est le même, le vendre
// si le solde est sous le plancher ; sinon acheter, si le solde dépasse la réserve — ou, pour son
// propre parc, s'il dépasse le quart de la réserve, ou pendant la première année s'il est positif.
//
// Anomalies reproduites :
//  - la part d'un autre joueur dans son parc (qui désigne +32 et fixe +30) est rapportée au nombre
//    d'actions du parc de cet autre joueur, pas du sien ;
//  - le rang passé à l'achat et à la vente est celui d'une fiche ; pour son propre parc, c'est le
//    numéro du parc (octet bas) : les deux coïncident dans les parties étudiées ;
//  - le compteur de découvert monte de 10 sous la réserve, de 20 sous le plancher, de 50 sous zéro,
//    tests faits dans cet ordre : la réserve dépassant partout le plancher, et le plancher zéro, seuls
//    les +10 servent ;
//  - la valeur du parc que le banquier compare au prêt est la capitalisation sur 25 bits (le produit
//    cours × actions est multiplié puis divisé par 128, en 32 bits) : au-delà de 16 777 215, elle
//    devient négative.
export function jouerEnBourse(jeu, fiche) {
  fiche >>>= 0;
  const sorte = octet(jeu, fiche);
  if (sorte === 0 || sorte === 1 || sorte === 6) return;
  const monParc = parcDeLaFiche(jeu, fiche);
  const a = octet(jeu, fiche + 0x1A), b = octet(jeu, fiche + 0x1B), c = octet(jeu, fiche + 0x1C);
  const d = () => octet(jeu, fiche + 0x1F);
  const plancher = motLongSigne(jeu, TABLES.plancher + a * 0x14 + c * 4);
  const reserve = motLongSigne(jeu, TABLES.reserve + a * 0x14 + c * 4);
  const seuil = mot(jeu, TABLES.seuil + a * 10 + b * 2);
  const solde = () => motLongSigne(jeu, fiche + 0xA);
  const mesActions = (parc) => mot(jeu, actions(fiche, parc));
  const numeroDeMonParc = mot(jeu, fiche + 2);

  let seuilDeVente;
  if (solde() < plancher && pas(jeu) > PAS_PAR_AN) seuilDeVente = 1000000;
  else if (motSigne(jeu, fiche + 0x35) < -100 && solde() < 50000) seuilDeVente = 100;
  else seuilDeVente = 0;
  seuilDeVente += seuil;
  let seuilDAchat = seuil;
  let aVendre = 0xFFFF, aAcheter = 0xFFFF;   // mots : un rang, −1 : aucun
  let plusGrossePart = 0, detenteurDeLaPlusGrossePart = -1, bonusDeLaPart = -1;
  let bonusPropreALAchat = coef(jeu, TABLES.bonusPropre, a, c);
  let bonusPropreALaVente = coef(jeu, TABLES.bonusPropre, a, c);
  const bonusRenforce = coef(jeu, TABLES.bonusPropre, a, c) * 30 + 1000;
  const moitieDeLaCapitalisation = () => idiv(Math.imul(motLongSigne(jeu, monParc + 0x66), mot(jeu, monParc + 0x62)), 2);

  for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
    const autre = ficheNumero(jeu, k);
    const sonParc = parcDeLaFiche(jeu, autre);
    const numeroDeSonParc = mot(jeu, autre + 2);
    const humain = octet(jeu, autre) === 1 || octet(jeu, autre) === 6;
    let noter;
    if (humain) {
      const comptes = COMPTES + numeroDeSonParc * TAILLE_COMPTES;
      noter = ((pas(jeu) - motLong(jeu, comptes + 0x67C)) >>> 0) > PAS_PAR_MOIS;
    } else {
      noter = numeroDeSonParc !== numeroDeMonParc && (mot(jeu, sonParc + 0x60) !== 0 || mesActions(numeroDeSonParc) !== 0);
    }
    if (!noter) continue;

    let note = noteDeBase(jeu, sonParc, autre, a, d(), 16);
    note = (note + (((jeu.appeler(HASARD) & 0xFFFF) % (d() + 1)) << 8)) | 0;
    const total = mot(jeu, sonParc + 0x62);
    if (total !== 0) {
      note = (note - idiv(Math.imul(coef(jeu, TABLES.coefEnVente, a, d()), Math.imul(mot(jeu, sonParc + 0x60), 100)), total)) | 0;
      const part = idiv(mesActions(numeroDeSonParc) * 100, total);
      const coefPart = coef(jeu, TABLES.coefDetenue, a, d());
      note = (note + Math.imul(part > 40 && part < 60 ? coefPart << 2 : coefPart, part)) | 0;
      if (octetSigne(jeu, fiche + 0x32) === k) note = (note + motSigne(jeu, fiche + 0x30)) | 0;
      // La part que détient cet autre joueur dans mon parc, rapportée à son parc (anomalie).
      const saPartChezMoi = idiv(mot(jeu, actions(autre, numeroDeMonParc)) * 100, total);
      if (s16(plusGrossePart) < saPartChezMoi) {
        plusGrossePart = saPartChezMoi;
        detenteurDeLaPlusGrossePart = k;
        bonusDeLaPart = Math.imul(saPartChezMoi, coef(jeu, TABLES.bonusDeLaPart, a, c));
      }
    }
    const lesSiennes = mot(jeu, actions(autre, numeroDeMonParc)), lesMiennes = mesActions(numeroDeMonParc);
    if (lesSiennes > lesMiennes && ((motLongSigne(jeu, autre + 0xA) - moitieDeLaCapitalisation()) | 0) > 0) {
      bonusPropreALAchat = bonusRenforce;
    }
    if (lesSiennes + 1 > lesMiennes && ((motLongSigne(jeu, autre + 0xA) - moitieDeLaCapitalisation()) | 0) > 0) {
      bonusPropreALaVente = bonusRenforce;
    }
    if (note < seuilDeVente && mesActions(numeroDeSonParc) !== 0) {
      seuilDeVente = note;
      aVendre = k;
    }
    if (((note - idiv(motLongSigne(jeu, sonParc + 0x66), 32)) | 0) > seuilDAchat && mot(jeu, sonParc + 0x60) !== 0
        && ((solde() - motLongSigne(jeu, sonParc + 0x66)) | 0) > plancher) {
      seuilDAchat = note;
      aAcheter = k;
    }
  }

  if (detenteurDeLaPlusGrossePart >= 0) ecrireOctet(jeu, fiche + 0x32, detenteurDeLaPlusGrossePart);
  if (bonusDeLaPart > 0) ecrireMot(jeu, fiche + 0x30, idiv(bonusDeLaPart, 2));

  if (mot(jeu, monParc + 0x60) !== 0) {
    let note = noteDeBase(jeu, monParc, fiche, a, d(), 4);
    const total = mot(jeu, monParc + 0x62);
    if (total !== 0) {
      note = (note - Math.imul(idiv(Math.imul(mot(jeu, monParc + 0x60), 100), total), coef(jeu, TABLES.coefEnVente, a, d()))) | 0;
      const part = idiv(mesActions(numeroDeMonParc) * 100, total);
      const coefPart = coef(jeu, TABLES.coefDetenue, a, d());
      note = (note + Math.imul(part > 30 && part < 51 ? coefPart << 2 : coefPart, part)) | 0;
    }
    if (((note + bonusPropreALAchat) | 0) > seuilDAchat && mot(jeu, monParc + 0x60) !== 0
        && ((solde() - motLongSigne(jeu, monParc + 0x66)) | 0) > plancher) {
      aAcheter = numeroDeMonParc;
    }
    if (((note + bonusPropreALaVente) | 0) < seuilDeVente && mesActions(numeroDeMonParc) !== 0) {
      aVendre = numeroDeMonParc;
    }
  }

  if (s16(aVendre) !== -1 && aVendre !== aAcheter) {
    jeu.appeler(VENDRE_UNE_ACTION, aVendre & 0xFF, fiche);
  } else if (s16(aVendre) !== -1 && solde() < plancher) {
    jeu.appeler(VENDRE_UNE_ACTION, aVendre & 0xFF, fiche);
  } else if ((s16(aAcheter) !== -1 && solde() > reserve)
      || (s16(aAcheter) === numeroDeMonParc && (idiv(reserve, 4) < solde() || (pas(jeu) < PAS_PAR_AN && solde() > 0)))) {
    jeu.appeler(ACHETER_UNE_ACTION, aAcheter & 0xFF, fiche);
  }

  surveillerLeDecouvert(jeu, fiche, monParc, plancher, reserve);
}

const ACHETER_UNE_ACTION = 0x4A571, VENDRE_UNE_ACTION = 0x4AAF1;

// La part de la note commune aux autres parcs et au sien : réputation et tendance, activité (× 16 pour
// les autres, × 4 pour le sien), fortune du propriétaire, valeur du parc.
function noteDeBase(jeu, parc, proprietaire, a, d, activite) {
  const reputation = octetSigne(jeu, parc + 0x21);
  let note = Math.imul(((reputation - octetSigne(jeu, parc + 0x22)) << 8) + (reputation << 7), coef(jeu, TABLES.coefReputation, a, d));
  note = (note + Math.imul(coef(jeu, TABLES.coefActivite, a, d), (mot(jeu, parc + 0x33) - (octet(jeu, parc + 0x51) << 3)) * activite)) | 0;
  const fortune = (motLongSigne(jeu, proprietaire + 0xA) - motLongSigne(jeu, proprietaire + 0x12)) | 0;
  note = (note + Math.imul(idiv(fortune, 256), coef(jeu, TABLES.coefFortune, a, d))) | 0;
  note = (note + Math.imul(idiv(motLongSigne(jeu, parc + 0x19), 512), coef(jeu, TABLES.coefValeur, a, d))) | 0;
  return note;
}

// Le banquier : le compteur de découvert monte tant que le solde est sous la réserve (voir plus haut) ;
// passé prêt / 256 + 100, si la valeur du parc couvre le prêt augmenté de 50 000, la banque prête
// d'office 50 000 (au prêt et au solde) et le compteur repart de zéro.
function surveillerLeDecouvert(jeu, fiche, monParc, plancher, reserve) {
  const solde = motLongSigne(jeu, fiche + 0xA);
  if (solde < reserve) ajouterAuMot(jeu, fiche + 0x35, 10);
  else if (solde < plancher) ajouterAuMot(jeu, fiche + 0x35, 20);
  else if (solde < 0) ajouterAuMot(jeu, fiche + 0x35, 50);
  const pret = motLongSigne(jeu, fiche + 0x12);
  if (motSigne(jeu, fiche + 0x35) <= idiv(pret, 256) + 100) return;
  const valeur = Math.imul(motLongSigne(jeu, monParc + 0x66), mot(jeu, monParc + 0x62)) << 7 >> 7;
  if (valeur < ((pret + 50000) | 0)) return;
  ajouterAuMotLong(jeu, fiche + 0x12, 50000);
  ajouterAuMotLong(jeu, fiche + 0xA, 50000);
  ecrireMot(jeu, fiche + 0x35, 0);
}

// ======================================================================================================
// 0x4A571 et 0x4AAF1 — acheter, vendre une action
// ======================================================================================================

// Le joueur de la fiche `joueur` achète une action du parc de la fiche de rang `k` (octet bas).
//
// Le parc tient ses actions en trois paquets (§ plus haut) : l'action passe de « en vente » à « chez
// son propriétaire » ou « chez les autres ». Le cours monte de 100 / total (division entière : il ne
// bouge pas au-delà de 100 actions), l'ancien est gardé, et l'acheteur paie le nouveau : au livre
// (catégorie 11) si c'est le joueur courant, sinon directement sur son solde. Un cours au-delà de
// 15 000, tant que le parc a moins de 26 000 actions, déclenche une division de l'action : cours
// moitié, paquets doublés, et les actions détenues doublées. La plus haute capitalisation est tenue à
// jour, et le cours plafonné à 15 000. Quand un autre joueur achète une action du parc du joueur
// courant, la nouvelle est notée dans ses comptes. Si le joueur courant, acheteur, détient alors
// toutes les actions du parc, 0x5C7D1 (argument 2) joue l'animation du rachat (TAKEOVER, faillite.js)
// et rouvre l'écran d'avant : elle ne fait rien d'autre.
//
// Anomalie reproduite : à la division de l'action, ce sont les actions que chacun détient dans le parc
// de l'ACHETEUR qui doublent, pas dans le parc dont l'action se divise (les deux ne coïncident que si
// l'acheteur achète ses propres actions).
export function acheterUneAction(jeu, k, joueur) {
  joueur >>>= 0;
  k &= 0xFF;
  const vendue = ficheNumero(jeu, k);
  const numero = mot(jeu, vendue + 2);
  const parc = PARCS + numero * TAILLE_PARC;
  ajouterAuMot(jeu, actions(joueur, numero), 1);
  ajouterAuMot(jeu, parc + 0x60, -1);
  ajouterAuMot(jeu, parc + (mot(jeu, joueur + 2) === numero ? 0x5E : 0x5C), 1);
  ecrireMotLong(jeu, parc + 0x6A, motLong(jeu, parc + 0x66));
  ajouterAuMotLong(jeu, parc + 0x66, idiv(100, mot(jeu, parc + 0x62)));
  const courant = mot(jeu, JOUEUR) === rangDeLaFiche(jeu, joueur);
  if (courant) jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.achatDActions, -motLongSigne(jeu, parc + 0x66));
  else ajouterAuMotLong(jeu, joueur + 0xA, -motLongSigne(jeu, parc + 0x66));

  if (motLongSigne(jeu, parc + 0x66) > 15000 && mot(jeu, parc + 0x62) < 26000) {
    ecrireMotLong(jeu, parc + 0x66, idiv(motLongSigne(jeu, parc + 0x66), 2));
    for (const paquet of [0x62, 0x5E, 0x5C, 0x60]) ecrireMot(jeu, parc + paquet, mot(jeu, parc + paquet) << 1);
    for (let j = 0; j < NOMBRE_DE_FICHES; j++) {
      const detenues = actions(ficheNumero(jeu, j), mot(jeu, joueur + 2));
      if (mot(jeu, detenues) !== 0) ecrireMot(jeu, detenues, mot(jeu, detenues) << 1);
    }
  }
  const capitalisation = Math.imul(motLongSigne(jeu, parc + 0x66), idiv(mot(jeu, parc + 0x62), 10));
  if (capitalisation > motLongSigne(jeu, parc + 0x6E)) ecrireMotLong(jeu, parc + 0x6E, capitalisation);
  if (motLongSigne(jeu, parc + 0x66) > 15000) ecrireMotLong(jeu, parc + 0x66, 15000);

  const comptes = motLong(jeu, COMPTES_DU_JOUEUR);
  if (k === octet(jeu, comptes + 0x41) && joueur !== motLong(jeu, FICHE_DU_JOUEUR)) {
    ecrireMotLong(jeu, comptes + 0x638, pas(jeu));
    ecrireOctet(jeu, comptes + 0x637, octet(jeu, joueur + 1));
    ecrireOctet(jeu, comptes + 0x63C, idiv(mot(jeu, actions(joueur, numero)) * 100, mot(jeu, parc + 0x62)));
    ecrireMotLong(jeu, comptes + 0x67C, pas(jeu));
  }
  if (courant && mot(jeu, parc + 0x62) === mot(jeu, actions(joueur, numero))) jeu.appeler(JOUER_LE_RACHAT, 2);
}

// Le joueur de la fiche `joueur` vend une action du parc de la fiche de rang `k` : le chemin inverse.
// Le cours baisse de 100 / total, le vendeur touche le nouveau (catégorie 12 pour le joueur courant),
// la plus basse capitalisation est tenue à jour, et le cours ne descend pas sous 99.
export function vendreUneAction(jeu, k, joueur) {
  joueur >>>= 0;
  k &= 0xFF;
  const numero = mot(jeu, ficheNumero(jeu, k) + 2);
  const parc = PARCS + numero * TAILLE_PARC;
  ajouterAuMot(jeu, actions(joueur, numero), -1);
  ajouterAuMot(jeu, parc + 0x60, 1);
  ajouterAuMot(jeu, parc + (mot(jeu, joueur + 2) === numero ? 0x5E : 0x5C), -1);
  ecrireMotLong(jeu, parc + 0x6A, motLong(jeu, parc + 0x66));
  ajouterAuMotLong(jeu, parc + 0x66, -idiv(100, mot(jeu, parc + 0x62)));
  if (mot(jeu, JOUEUR) === rangDeLaFiche(jeu, joueur)) jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.venteDActions, motLongSigne(jeu, parc + 0x66));
  else ajouterAuMotLong(jeu, joueur + 0xA, motLongSigne(jeu, parc + 0x66));
  const capitalisation = Math.imul(motLongSigne(jeu, parc + 0x66), idiv(mot(jeu, parc + 0x62), 10));
  if (capitalisation < motLongSigne(jeu, parc + 0x72)) ecrireMotLong(jeu, parc + 0x72, capitalisation);
  if (motLongSigne(jeu, parc + 0x66) < 99) ecrireMotLong(jeu, parc + 0x66, 99);
}

// ======================================================================================================
// 0x53F13 — la recherche du mois
// ======================================================================================================

// Six domaines de recherche, chacun avec son budget mensuel (parc +0x114), ses points (+0x120), ce qu'il
// a coûté (comptes +0x64C) et ce qu'il doit coûter pour être fini (comptes +0x664). Chaque mois, pour
// chaque domaine :
//   - fini (coût atteint) : son budget retourne à la réserve (+0x110), budget et points à zéro ;
//   - sinon son budget est dépensé (et compté), et il gagne des points : budget / 16 (domaines 0 et 4),
//     / 64 (1, 2, 3), / 256 (5). Puis, jusqu'à 8 fois tant qu'il trouve, il cherche la découverte la
//     moins chère que ses points dépassent, la paie en points (et au total +0x12C), et l'applique.
// [0xD3588 + 4 × domaine] garde le prix de la découverte la moins chère examinée (100 000 au départ,
// 0 pour un domaine fini). Les dépenses du mois sont inscrites au livre (catégorie « recherche »). Les
// six domaines finis, deux drapeaux du parc passent à 1 et deux autres à 0 (non établi).
//
// Les six domaines portent, à l'écran de la recherche, les noms de la table [0xD7BB0] (indices 27 à
// 32) : « améliorer les attractions », « nouvelles attractions », « nouvelles boutiques », « formation
// du personnel », « nouvelles installations », « amélioration des installations » (« pour augmenter la
// capacité des bus et de votre entrepôt »).
//
//   0  améliorer les attractions (catalogue 0xCCED0, fiches de 200 octets ; celles de référence en
//      0xB16F8) : parmi les genres disponibles (+0xC5 bit 1) améliorés moins de 45 fois (+0xC6 < 90), le
//      prix est coût / 8 + améliorations / 2 + hasard mod 8 (+0xAA le coût de la fiche). L'amélioration
//      dépend du compte +0xC6 modulo 10 : 0 l'intensité +1 (jusqu'à 99, et la référence + 10), 2 la
//      capacité +1 (jusqu'au double de la référence), 4 la durée +50 (jusqu'au double), 6 le seuil
//      d'usure +5 (jusqu'à 120), 8 le prix de l'attraction × 15/16 arrondi à la centaine inférieure,
//      500 au moins ; le compte augmente de 2 : un compte impair ne donne jamais rien (1, 3, 5, 7, 9) ;
//      le bit 4 de +0xC5 marque le genre amélioré.
//   1  une nouvelle attraction : un genre pas encore disponible (+0xC5 nul), au prix coût × 8 ; il
//      devient disponible (+0xC5 |= 3), un bruitage (0x30) salue la découverte, [0xD7768] = 1.
//   2  une nouvelle boutique (catalogue 0xD3C62, 107 octets : +0x66 les drapeaux, +0x64 le coût) : de
//      même. Anomalie reproduite : le bruitage et [0xD7768] sont donnés à chaque meilleure candidate
//      rencontrée pendant la recherche, pas à la découverte.
//   3  la formation du personnel (catalogue des métiers 0xD35C0) : la vitesse d'un métier (+0x31),
//      si elle est sous 0x80, gagne 8, pour 8 points ; puis chaque employé prend celle de son métier,
//      sur-le-champ, au milieu de sa case : son décompte reste fait pour l'ancienne vitesse, et il file
//      plus loin que la case où il devait décider (défaut d'origine : docs/demandes.md, retour 59). Le prix
//      examiné est vitesse + hasard mod 16. Anomalie reproduite : le meilleur prix n'est jamais retenu
//      (le programme écrit l'ancien meilleur dans la variable du prix, au lieu de l'inverse) : c'est
//      le dernier métier que les points dépassent qui l'emporte, pas le moins cher.
//   4  une nouvelle installation (catalogue 0xCCA70, 0x38 octets : +0x35 les drapeaux, +0x2C le coût),
//      comme le domaine 1.
//   5  l'amélioration des installations, par tranche de 40 points : les plafonds +0x4A et +0x4E du parc
//      montent d'un cran (jusqu'à 19), ceux des niveaux des bus et de l'entrepôt ; si [0xD7763] (une
//      option, basculée par 0x13BF3), le niveau des bus +0x49 monte aussi, leur capacité +0x48 prend la
//      valeur 0xB78CC[+0x49], et le niveau est payé (0xB787C[+0x49], de 5 000 à 40 000, catégorie
//      « amélioration des installations »).
const MOINS_CHERE = 0xD3588;
const NOUVELLE_DECOUVERTE = 0xD7768;   // octet : lu par 0x4E359
const NIVEAU_AUTOMATIQUE = 0xD7763;
const ATTRACTIONS = 0xCCED0, REFERENCES = 0xB16F8, TAILLE_ATTRACTION = 200;
const BOUTIQUES = 0xD3C62, TAILLE_BOUTIQUE = 0x6B;
const INSTALLATIONS = 0xCCA70, TAILLE_INSTALLATION = 0x38;
const CAPACITE_DES_BUS = 0xB78CC, PRIX_DU_NIVEAU = 0xB787C;
const BRUITAGE_DE_LA_DECOUVERTE = 0x30;
const PAS_TROUVE = -1;

export function rechercher(jeu) {
  const comptes = motLong(jeu, COMPTES_DU_JOUEUR);
  const parc = motLong(jeu, PARC_DU_JOUEUR);
  let depense = 0, finis = 0;
  for (let domaine = 0; domaine < 6; domaine++) {
    const budget = parc + 0x114 + 2 * domaine;
    const cout = comptes + 0x64C + 4 * domaine;
    if (motLongSigne(jeu, cout) >= motLongSigne(jeu, comptes + 0x664 + 4 * domaine)) {
      ajouterAuMot(jeu, parc + 0x110, mot(jeu, budget));
      ecrireMot(jeu, budget, 0);
      ecrireMot(jeu, parc + 0x120 + 2 * domaine, 0);
      ecrireMotLong(jeu, MOINS_CHERE + 4 * domaine, 0);
      ecrireOctet(jeu, parc + 0x248 + domaine, 0);
      finis = (finis + 1) & 0xFF;
      continue;
    }
    depense = (depense + motSigne(jeu, budget)) | 0;
    ajouterAuMotLong(jeu, cout, motSigne(jeu, budget));
    ecrireMotLong(jeu, MOINS_CHERE + 4 * domaine, 100000);
    const r = { jeu, parc, domaine, points: parc + 0x120 + 2 * domaine };
    DOMAINES[domaine](r, motSigne(jeu, budget));
  }
  if (finis >= 6) {
    ecrireMot(jeu, parc + 0x112, 1);
    ecrireMot(jeu, parc + 0x110, 1);
    ecrireOctet(jeu, parc + 0x24E, 0);
    ecrireOctet(jeu, parc + 0x24F, 0);
  }
  if (depense !== 0) jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.recherche, -depense);
}

// Les points gagnés par le budget du mois.
function gagnerDesPoints(r, budget, diviseur) {
  ecrireMot(r.jeu, r.points, motSigne(r.jeu, r.points) + idiv(budget, diviseur));
}

// Le prix examiné le plus bas du domaine.
function noterLePrix(r, prix) {
  const a = MOINS_CHERE + 4 * r.domaine;
  if (prix < motLongSigne(r.jeu, a)) ecrireMotLong(r.jeu, a, prix);
}

// Payer une découverte en points.
function payer(r, prix) {
  ecrireMot(r.jeu, r.points, mot(r.jeu, r.points) - prix);
  ajouterAuMotLong(r.jeu, r.parc + 0x12C, prix);
}

function saluerLaDecouverte(jeu) {
  jeu.appeler(JOUER_SAUF_EN_COURS, 0, BRUITAGE_DE_LA_DECOUVERTE);
  ecrireOctet(jeu, NOUVELLE_DECOUVERTE, 1);
}

// Jusqu'à 8 découvertes par mois dans un domaine, tant que la précédente en a trouvé une.
function jusquAHuitFois(chercherUneFois) {
  let trouve = -2;
  for (let n = 0; n < 8 && trouve !== PAS_TROUVE; n++) trouve = chercherUneFois();
}

// Parcourir un catalogue (fiches de `taille` octets, closes par un mot +0x22 nul) et rendre le rang
// (octet signé) de la fiche au plus bas prix que les points dépassent, −1 s'il n'y en a pas.
function laMoinsChere(r, catalogue, taille, prixDe, aLaMeilleure = null) {
  const { jeu } = r;
  let meilleurPrix = 1000000, choisie = PAS_TROUVE;
  for (let g = 0; mot(jeu, catalogue + (g & 0xFFFF) * taille + 0x22) !== 0; g = (g + 1) & 0xFFFF) {
    const prix = prixDe(catalogue + g * taille);
    if (prix === null) continue;
    noterLePrix(r, prix);
    if (prix < meilleurPrix && motSigne(jeu, r.points) > prix) {
      choisie = s8(g);
      meilleurPrix = prix;
      if (aLaMeilleure) aLaMeilleure();
    }
  }
  return { choisie, prix: meilleurPrix };
}

const DOMAINES = [
  // 0 — améliorer les attractions.
  (r, budget) => {
    const { jeu } = r;
    gagnerDesPoints(r, budget, 16);
    jusquAHuitFois(() => {
      const { choisie, prix } = laMoinsChere(r, ATTRACTIONS, TAILLE_ATTRACTION, (f) => {
        if (!(octet(jeu, f + 0xC5) & 1) || octet(jeu, f + 0xC6) >= 90) return null;
        return (mot(jeu, f + 0xAA) >> 3) + (octet(jeu, f + 0xC6) >> 1) + (jeu.appeler(HASARD) & 0xFFFF) % 8;
      });
      if (choisie === PAS_TROUVE) return choisie;
      ameliorer(jeu, ATTRACTIONS + choisie * TAILLE_ATTRACTION, REFERENCES + choisie * TAILLE_ATTRACTION);
      payer(r, prix);
      return choisie;
    });
  },
  // 1 — une nouvelle attraction.
  (r, budget) => {
    gagnerDesPoints(r, budget, 64);
    jusquAHuitFois(() => decouvrir(r, ATTRACTIONS, TAILLE_ATTRACTION, 0xC5, 0xAA, true));
  },
  // 2 — une nouvelle boutique : le bruitage est donné pendant la recherche (anomalie).
  (r, budget) => {
    gagnerDesPoints(r, budget, 64);
    jusquAHuitFois(() => decouvrir(r, BOUTIQUES, TAILLE_BOUTIQUE, 0x66, 0x64, false));
  },
  // 3 — le personnel.
  (r, budget) => {
    const { jeu } = r;
    gagnerDesPoints(r, budget, 64);
    jusquAHuitFois(() => {
      let choisi = PAS_TROUVE;
      for (let g = 0; mot(jeu, METIERS + g * TAILLE_METIER + 0x22) !== 0; g = (g + 1) & 0xFFFF) {
        const vitesse = octet(jeu, METIERS + g * TAILLE_METIER + 0x31);
        if (vitesse >= 0x80) continue;
        const prix = vitesse + (jeu.appeler(HASARD) & 0xFFFF) % 16;
        noterLePrix(r, prix);
        // Le meilleur prix reste à 1 000 000 : le dernier métier que les points dépassent l'emporte.
        if (prix < 1000000 && motSigne(jeu, r.points) > prix) choisi = s8(g);
      }
      if (choisi !== PAS_TROUVE) {
        const f = METIERS + choisi * TAILLE_METIER;
        ecrireOctet(jeu, f + 0x31, octet(jeu, f + 0x31) + 8);
        payer(r, 8);
      }
      const fin = motLong(jeu, FIN_DES_OBJETS_DU_PARC);
      for (let p = (motLong(jeu, OBJETS_DU_PARC) + TAILLE_OBJET) >>> 0; p < fin; p = (p + TAILLE_OBJET) >>> 0) {
        if (octet(jeu, p + 4) === PERSONNEL_DU_PARC) ecrireOctet(jeu, p + 0x13, octet(jeu, METIERS + octet(jeu, p + 0x59) * TAILLE_METIER + 0x31));
      }
      return choisi;
    });
  },
  // 4 — une nouvelle installation.
  (r, budget) => {
    gagnerDesPoints(r, budget, 16);
    jusquAHuitFois(() => decouvrir(r, INSTALLATIONS, TAILLE_INSTALLATION, 0x35, 0x2C, true));
  },
  // 5 — les niveaux du parc, par tranches de 40 points.
  (r, budget) => {
    const { jeu, parc } = r;
    gagnerDesPoints(r, budget, 256);
    for (let n = 0; n < 8 && motSigne(jeu, r.points) > 40; n++) {
      ecrireMotLong(jeu, MOINS_CHERE + 4 * r.domaine, 40);
      payer(r, 40);
      if (octet(jeu, parc + 0x4A) < 19) {
        ecrireOctet(jeu, parc + 0x4A, octet(jeu, parc + 0x4A) + 1);
        if (octet(jeu, NIVEAU_AUTOMATIQUE) !== 0) {
          ecrireOctet(jeu, parc + 0x49, octet(jeu, parc + 0x49) + 1);
          ecrireOctet(jeu, parc + 0x48, octet(jeu, CAPACITE_DES_BUS + octet(jeu, parc + 0x49)));
          jeu.appeler(INSCRIRE_AU_LIVRE, LIVRE.ameliorationDesInstallations, -motLongSigne(jeu, PRIX_DU_NIVEAU + octet(jeu, parc + 0x49) * 4));
        }
      }
      if (octet(jeu, parc + 0x4E) < 19) ecrireOctet(jeu, parc + 0x4E, octet(jeu, parc + 0x4E) + 1);
    }
  },
];

// Une découverte dans un catalogue (domaines 1, 2, 4) : une fiche dont l'octet `drapeaux` est nul,
// au prix de son mot `cout` × 8 ; elle devient disponible (drapeaux |= 3). `saluerALaFin` : le
// bruitage et [0xD7768] à la découverte ; sinon (les boutiques), à chaque meilleure candidate.
function decouvrir(r, catalogue, taille, drapeaux, cout, saluerALaFin) {
  const { jeu } = r;
  const { choisie } = laMoinsChere(r, catalogue, taille,
    (f) => (octet(jeu, f + drapeaux) !== 0 ? null : mot(jeu, f + cout) << 3),
    saluerALaFin ? null : () => saluerLaDecouverte(jeu));
  if (choisie === PAS_TROUVE) return choisie;
  const f = catalogue + choisie * taille;
  ecrireOctet(jeu, f + drapeaux, octet(jeu, f + drapeaux) | 3);
  payer(r, mot(jeu, f + cout) << 3);
  if (saluerALaFin) saluerLaDecouverte(jeu);
  return choisie;
}

// Améliorer une fiche d'attraction (domaine 0), d'après son compte d'améliorations modulo 10.
function ameliorer(jeu, f, reference) {
  ecrireOctet(jeu, f + 0xC5, octet(jeu, f + 0xC5) | 4);
  switch (octet(jeu, f + 0xC6) % 10) {
    case 0:
      if (octet(jeu, f + 0xA9) < 99 && octet(jeu, f + 0xA9) < octet(jeu, reference + 0xA9) + 10) ecrireOctet(jeu, f + 0xA9, octet(jeu, f + 0xA9) + 1);
      break;
    case 2:
      if (motSigne(jeu, f + 0xA6) < motSigne(jeu, reference + 0xA6) * 2) ajouterAuMot(jeu, f + 0xA6, 1);
      break;
    case 4:
      if (mot(jeu, f + 0xAC) < mot(jeu, reference + 0xAC) * 2) ajouterAuMot(jeu, f + 0xAC, 50);
      break;
    case 6:
      if (octet(jeu, f + 0xA8) < 120) ecrireOctet(jeu, f + 0xA8, octet(jeu, f + 0xA8) + 5);
      break;
    case 8: {
      let prix = idiv(Math.imul(motLongSigne(jeu, f + 0xA2), 15), 16);
      prix = (prix - prix % 100) | 0;
      ecrireMotLong(jeu, f + 0xA2, prix < 500 ? 500 : prix);
      break;
    }
    default:
      break;
  }
  ecrireOctet(jeu, f + 0xC6, octet(jeu, f + 0xC6) + 2);
}

// ======================================================================================================
// 0x80568 et 0x805A4 — l'ambiance sonore
// ======================================================================================================

// La couche de Bullfrog au-dessus de HMI SOS (docs/retro-ingenierie.md § 9.3, simulation-outils.js).
const BRUITAGES_PRETS = 0xBA720, BRUITAGES_ACTIFS = 0xBA721;
const NOMBRE_DE_BRUITAGES = 0xD7B68;
const PILOTE_NUMERIQUE = 0xD7B44;
const BANQUE_DE_BRUITAGES = 0xD7B60;   // pointeur : entrées de 32 octets, données en +0x12, taille en +0x1A
const DERNIER_ECHANTILLON = 0xD7B40;
const PROPRIETAIRES = 0xD7998;         // 32 × (mot propriétaire, mot bruitage)
const VOLUMES = 0xD7A18;               // 32 mots
const DEPART = 0xBA729;                // la structure _SOS_START_SAMPLE
const ECHANTILLONS = 32;
const VOLUME_VISE = 0xBED58;           // mot : le volume que doit atteindre la prochaine ambiance
const MONTEES = 0xE3010;               // 32 poignées d'événement de minuterie de SOS : la montée
const AUTRES_EVENEMENTS = 0xE3090;     // 32 autres poignées (la descente, vraisemblablement)
const MONTEE_ACTIVE = 0xDECE8, AUTRE_ACTIF = 0xDED98;   // 32 octets chacun
const VOLUMES_VISES = 0xDECA8;         // 32 mots
const MONTER_LE_VOLUME = 0x803E0;      // la routine appelée par la minuterie
const ECHANTILLON_TERMINE = 0x892DB;   // sosDIGISampleDone(pilote, numéro)
const LANCER_ECHANTILLON = 0x8943F;    // sosDIGIStartSample(pilote, départ : décalage, sélecteur)
const INSCRIRE_UN_EVENEMENT = 0x822F4; // sosTIMERRegisterEvent(fréquence, routine, &poignée)
const RETIRER_UN_EVENEMENT = 0x8260A;  // sosTIMERRemoveEvent(poignée)

// 0x80568 — régler une ambiance : le volume visé est noté ; en mode 3, l'ambiance (propriétaire,
// bruitage) est lancée ou relancée vers ce volume (0x805A4). Les autres modes ne font que noter le
// volume (les appelants : le pas du calendrier, la foule ; 0x1B23A, huit fois ; 0x13BF3, 0x20FF5,
// 0x2E035, 0x4B56C, 0x50CCD, 0x51780, 0x5C04F).
export function reglerUneAmbiance(jeu, proprietaire, bruitage, mode, volume) {
  ecrireMot(jeu, VOLUME_VISE, volume);
  if ((mode & 0xFF) === 3) jeu.appeler(LANCER_L_AMBIANCE, s16(proprietaire), s16(bruitage));
}

const LANCER_L_AMBIANCE = 0x805A4;

// 0x805A4 — lancer une ambiance : un bruitage joué en boucle sans fin, qui part du silence et monte
// vers le volume visé, 20 fois par seconde, par la minuterie de SOS (0x803E0).
//
// Sans bruitages (jeu muet, option coupée) ou pour un numéro au-delà du nombre de bruitages (comparé
// signé), rien. Si le même bruitage joue encore pour le même propriétaire, sa montée est relancée
// vers le nouveau volume. Sinon, le premier numéro d'échantillon libre (0 à 31) le joue : volume 0,
// boucles sans fin (0xFFFF), drapeaux 0x4100, puis sa montée est inscrite. Aucun de libre, rien.
export function lancerUneAmbiance(jeu, proprietaire, bruitage) {
  if (octet(jeu, BRUITAGES_PRETS) === 0 || octet(jeu, BRUITAGES_ACTIFS) === 0) return;
  if (s16(bruitage) > mot(jeu, NOMBRE_DE_BRUITAGES)) return;
  const pilote = () => motLong(jeu, PILOTE_NUMERIQUE);
  const termine = (k) => jeu.appeler(ECHANTILLON_TERMINE, pilote(), k) !== 0;
  for (let k = 0; k < ECHANTILLONS; k++) {
    if (mot(jeu, PROPRIETAIRES + 4 * k) !== (proprietaire & 0xFFFF) || mot(jeu, PROPRIETAIRES + 4 * k + 2) !== (bruitage & 0xFFFF)) continue;
    if (termine(k)) continue;
    relancerLaMontee(jeu, k);
    return;
  }
  let libre = -1;
  for (let k = 0; k < ECHANTILLONS; k++) {
    if (termine(k)) { libre = k; break; }
  }
  if (libre < 0) return;
  ecrireMot(jeu, PROPRIETAIRES + 4 * libre, proprietaire);
  ecrireMot(jeu, PROPRIETAIRES + 4 * libre + 2, bruitage);
  ecrireMot(jeu, DEPART + 0x1C, 0x4100);
  ecrireMot(jeu, DEPART + 0xC, 0xFFFF);
  ecrireMot(jeu, DEPART + 0x10, 0);
  ecrireMot(jeu, VOLUMES + 2 * libre, mot(jeu, DEPART + 0x10));
  ecrireMot(jeu, DEPART + 0x12, libre);
  const entree = (motLong(jeu, BANQUE_DE_BRUITAGES) + s16(bruitage) * 32) >>> 0;
  ecrireMotLong(jeu, DEPART + 8, motLong(jeu, entree + 0x1A) - 0x10);
  const selecteur = jeu.T.R.ds & 0xFFFF;
  ecrireMot(jeu, DEPART + 4, selecteur);
  ecrireMotLong(jeu, DEPART + 0, motLong(jeu, entree + 0x12));
  ecrireMotLong(jeu, DERNIER_ECHANTILLON, jeu.appeler(LANCER_ECHANTILLON, pilote(), DEPART, selecteur));
  relancerLaMontee(jeu, libre);
}

// La montée du volume de l'échantillon k : les événements de minuterie en cours sont retirés, puis la
// montée (0x803E0, 20 appels par seconde) est inscrite, avec le volume visé.
function relancerLaMontee(jeu, k) {
  if (octet(jeu, MONTEE_ACTIVE + k) !== 0) jeu.appeler(RETIRER_UN_EVENEMENT, motLong(jeu, MONTEES + 4 * k));
  if (octet(jeu, AUTRE_ACTIF + k) !== 0) {
    jeu.appeler(RETIRER_UN_EVENEMENT, motLong(jeu, AUTRES_EVENEMENTS + 4 * k));
    ecrireOctet(jeu, AUTRE_ACTIF + k, 0);
  }
  jeu.appeler(INSCRIRE_UN_EVENEMENT, 0x14, MONTER_LE_VOLUME, jeu.T.R.cs & 0xFFFF, MONTEES + 4 * k, jeu.T.R.ds & 0xFFFF);
  ecrireOctet(jeu, MONTEE_ACTIVE + k, 1);
  ecrireMot(jeu, VOLUMES_VISES + 2 * k, mot(jeu, VOLUME_VISE));
}

// ======================================================================================================

// `memoire: 'entiere'` : ces fonctions écrivent dans le tas (les fiches des joueurs, la carte, les
// objets du parc), et le pas du calendrier appelle une bonne part de la simulation.
export const reecritures = [
  { adresse: 0x12B1F, nom: 'pasDuCalendrier', fn: pasDuCalendrier, arguments: 0, memoire: 'entiere' },
  { adresse: 0x49B5B, nom: 'jouerEnBourse', fn: jouerEnBourse, arguments: 1, memoire: 'entiere' },
  { adresse: 0x4A571, nom: 'acheterUneAction', fn: acheterUneAction, arguments: 2, memoire: 'entiere' },
  { adresse: 0x4AAF1, nom: 'vendreUneAction', fn: vendreUneAction, arguments: 2, memoire: 'entiere' },
  { adresse: 0x53F13, nom: 'rechercher', fn: rechercher, arguments: 0, memoire: 'entiere' },
  { adresse: 0x80568, nom: 'reglerUneAmbiance', fn: reglerUneAmbiance, arguments: 4, memoire: 'entiere' },
  { adresse: 0x805A4, nom: 'lancerUneAmbiance', fn: lancerUneAmbiance, arguments: 2, memoire: 'entiere' },
];

export const enAttente = [];
