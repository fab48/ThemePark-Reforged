// La fin de l'année : la bourse et la valeur des parcs, les impôts locaux et l'inflation, les trophées,
// les classements, l'écran du classement et des trophées, le bilan de l'année, la vente du parc aux
// enchères, la nouvelle année.
//
// Le pas de simulation (0x12B1F) appelle 0x7401C chaque fois que le compteur de pas (0xD3AFC, 1 000
// par mois) atteint un multiple de 12 000 : la partie s'arrête sur deux écrans qui attendent un clic,
// puis repart pour une année. Ce module réécrit 0x7401C et les neuf fonctions qu'il est seul à appeler
// (ou presque) :
//
//   0x7401C  finirLAnnee               la fin de l'année, du début à la sauvegarde
//   0x78B53  ouvrirUnLivreNeuf         un livre de comptes neuf (appelée aussi au chargement)
//   0x729D8  bourseDeFinDAnnee         valeur des parcs, dividendes, faillites, taux de l'année
//   0x51111  impotsEtInflation         les impôts locaux, l'inflation des prix et des pays
//   0x76FA3  decernerLesTrophees       les neuf trophées, et leurs primes
//   0x76F03  chargerLEcranDesTrophees  le fond et les images de l'écran des trophées
//   0x73347  appliquerLeClassement     l'attrait et les notes des parcs d'après le classement
//   0x4ADE6  coursDeFinDAnnee          le cours des actions (au niveau de jeu 2)
//   0x7C36D  detailDeLAnnee            l'écran du bilan de l'année, et l'offre de vendre le parc
//   0x73EE8  trouverUnAcheteur         un concurrent assez riche pour acheter un parc
//
// Réécriture lisible, prouvée identique à la transcription : voir docs/guide-reecriture.md, et plus bas
// « Vérification ». Le sens des champs et des écrans vient de ce que ces fonctions en font, et des
// textes que le jeu affiche avec eux (lus dans la partie : tables [0xD7BB8], [0xD7BB4], [0xD7BC0],
// [0xD7BD0], [0xD7B94]).
//
// --- Les joueurs, leurs parcs, leurs comptes -----------------------------------------------------------
//
// 25 fiches de joueur de 0x222 octets en [0xD3B00] (la fiche 0, le joueur ; [0xD3808] celle du joueur
// courant, [0xD665C]), 25 fiches de parc de 0x250 octets en 0xCF1E0 (celle d'un joueur : mot +2 de sa
// fiche ; [0xD3818] celle du joueur courant), et les comptes, 0xD443C + joueur × 0x6C2 ([0xD3814]).
// Ce que ces fonctions en lisent et en écrivent (« non établi » quand rien n'appuie un sens) :
//
//   fiche  +0    octet  la sorte : 0 fiche vide, 1 le joueur humain, 3 un concurrent (tous dans la
//                       démo), 7 un concurrent à mettre en place (0x6E7E6), 6 non établi
//          +2    mot    le numéro du joueur (son parc, ses comptes)
//          +5    octet  son pays (table 0xB7B38), signé
//          +0A   long   le solde ; +12 long, le prêt ; +16 long, le solde de l'an dernier (posé par
//                       0x12B1F après la fin d'année ; le bilan le montre comme tel)
//          +1A…+1C, +20…+25  octets du profil de concurrent (non établi)
//          +27…+2C  six notes, d'après le classement (0x73347)
//          +37…+5B  dix longs : les investissements de chacune des dix dernières années (le prix des
//                       attractions et des boutiques construites s'y ajoute), l'année en cours en +37
//          +95   mot    la somme des rangs, puis la place au classement général (1 le premier)
//          +97…+9C  le rang dans chacune des six catégories (0 le premier)
//          +A1   mot    (non établi : 0x744 à chaque fin d'année)
//          +A3   25 mots : les actions qu'il détient dans le parc de chaque joueur
//          +D9   long   (non établi : 128 au moins, suit l'inflation, concurrents seulement)
//          +221  octet  le terrain acheté (plus d'impôts locaux)
//   parc   +0, +2 les seuils de contentement ; +18 ouvert ; +19 long, la valeur du parc : les
//          investissements des dix dernières années amortis ; +1F mot, les visiteurs ; +21, +22 l'attrait
//          (octet signé) et l'ancien ; +23, +2B, +33, +37, +3F, +43 des compteurs de l'année (+23 → +27,
//          +2B → +2F, +33 → +35 à la nouvelle année ; +43, le contentement cumulé des visiteurs partis,
//          fait la catégorie « satisfaction ») ; +5C, +5E, +60, +62 des nombres d'actions (+62 les
//          actions émises, +60 celles en vente) ; +66 long, le cours de l'action ; +6A l'ancien ; +6E,
//          +72 les plus haut et plus bas de la capitalisation ; +82 les attractions ; +92, +93, +97 le
//          délai d'animation, le seuil d'usure et l'usure moyens des attractions (0x68E34) ; +A7 le
//          profil de concurrent (−1 : aucun) ; +AE le contentement moyen ; +E0 les boutiques ; +7C,
//          +7E, +80, +83, +84, +8A, +9F, +A1, +C2, +CA, +CC, +D4, +12C : non établi
//   comptes  +3E mot (non établi) ; +40, +41 octets (des numéros de parc, non établi) ; +42 le solde au
//          début de la période ; +46 le livre ; +492, +526 les recettes et les dépenses de chaque mois ;
//          +5ED ; +636 l'avertissement de faillite (1, puis 2 : la partie perdue) ; +641, +642, +644,
//          +648, +64A les records de ses montagnes russes (hauteur, longueur, prix), de sa rivière et de
//          son circuit de voitures ; +684 dividendes encaissés, +688 payés, +68C impôts locaux ; +694 à
//          +6B4 les chiffres de l'année précédente, pour le bilan ; +6B8, +6BC remis à zéro
//
// Les pays : table 0xB7B38, fiches de 0x1C octets jusqu'à un octet nul. +9 mot, l'inflation de
// l'année (en dix-millièmes) ; +B mot, un taux (non établi, pèse sur le cours des actions) ; +E octet,
// les années sans impôts locaux ; +F mot, l'impôt par case ; +1A octet, 0xFF pays libre.
//
// --- Le cadre de pile, et les restes --------------------------------------------------------------------
//
// Voir la classe Cadre. Aucune de ces fonctions n'est appelée par la mise à jour des objets du parc
// (0x21681) : l'octet que relit l'état 4 des visiteurs ne les concerne pas (guide, « Les restes de
// pile »). 0x7401C relit trois de ses variables sans les avoir écrites (voir finirLAnnee) : la
// réécriture les lit aux mêmes adresses.
//
// --- Vérification ----------------------------------------------------------------------------------------
//
// simulation.json passe une fin d'année : tous ces appels y sont comparés un à un, 0 divergence
// (0x73EE8 : 120 fois, une par image du bilan ; les autres une fois ; 0x78B53 aussi au chargement, dans
// les cinq scénarios), et le rejeu est identique sur les cinq scénarios, avec et sans brouillage des
// restes de pile. Le comparateur doit restaurer le disque entre ses deux exécutions : 0x7401C finit par
// la sauvegarde automatique (0x2DF12, save/<nom>.GY, « FN » dans la démo), et la transcription, jouée
// d'abord, crée le fichier que la réécriture trouverait ensuite — un service du DOS de moins, et cinq
// microsecondes d'écart sur l'heure de l'hôte.
// Ce que simulation.json n'exerce pas : l'offre d'achat du terrain (après douze ans), la partie perdue,
// la faillite d'un concurrent, la fin par inactivité, les nouveautés annoncées (le niveau 2 de la démo
// les saute), et la vente du parc jusqu'à l'acheteur (aucun concurrent n'est assez riche). Le reste l'est
// par un scénario composé qui, à la fin de l'année, ouvre les bulles des trois formes de trophée, passe
// d'une page à l'autre et revient, puis, au bilan, clique l'offre de vente, répond oui et voit les
// enchères : 0 divergence appel par appel.

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
const ajouterAuLong = (jeu, a, v) => poserLong(jeu, a, (long(jeu, a) + v) | 0);
const ajouterAuMot = (jeu, a, v) => poserMot(jeu, a, mot(jeu, a) + v);

// Division entière signée, tronquée vers zéro (idiv), et son reste. Une division par zéro arrêtait le
// programme d'origine (exception du processeur) : elle arrête aussi la réécriture, comme la
// transcription.
function idiv(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}
function imod(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) % (b | 0)) | 0;
}

// --- Les fiches des joueurs et des parcs -------------------------------------------------------------

const FICHES = 0xD3B00;              // pointeur : 25 fiches de joueur de 0x222 octets
const FIN_DES_FICHES = 0xD3820;      // pointeur : la fin de la table
const TAILLE_FICHE = 0x222;
const NOMBRE_DE_FICHES = 25;
const FICHES_D_ORIGINE = 0xBA840;    // 25 fiches de 0x222 octets : l'état neuf d'un concurrent
const PARCS = 0xCF1E0;               // 25 fiches de parc de 0x250 octets (indexées par le mot +2 de la fiche)
const TAILLE_PARC = 0x250;
const JOUEUR_COURANT = 0xD665C;      // mot
const FICHE_COURANTE = 0xD3808;      // pointeur : la fiche du joueur courant
const COMPTES_COURANTS = 0xD3814;    // pointeur : 0xD443C + joueur × 0x6C2
const PARC_COURANT = 0xD3818;        // pointeur : la fiche de son parc
const PAS_DE_SIMULATION = 0xD3AFC;   // mot long : 1 000 pas par mois
const PAS_PAR_AN = 12000;

const fiche = (jeu, k) => long(jeu, FICHES) + k * TAILLE_FICHE;
const parcDeLaFiche = (jeu, f) => PARCS + mot(jeu, f + 2) * TAILLE_PARC;

// --- Les fonctions appelées --------------------------------------------------------------------------

const HASARD = 0x18B92;
const INSCRIRE_AU_LIVRE = 0x78943;   // (catégorie, montant)
const CHARGER_UN_FICHIER = 0x7F0B0;  // (nom, destination) : rend la taille
const RELOGER_LES_SPRITES = 0x10C80; // (table, fin de la table, données des sprites)

// --- Le cadre de pile --------------------------------------------------------------------------------
//
// Ces fonctions passent aux fonctions qu'elles appellent l'adresse de tampons pris dans leurs variables
// locales (les textes qu'on compose avant de les écrire à l'écran). Pour que tout soit à la même place
// que dans l'original, la réécriture ouvre le même cadre : les registres ebx, esi, edi et ebp empilés
// à l'entrée, puis `enter taille, 0` ; ebp désigne le cadre, et le pointeur de pile descend sous les
// variables locales, là où l'original appelait. Les appels partent donc de la même hauteur, et les
// tampons sont aux mêmes adresses. L'enveloppe (moteur/jeu/index.js) remet la pile à sa place au
// retour ; `fermer` rend ebp à l'appelant.
class Cadre {
  constructor(jeu, tailleDesLocales) {
    const T = jeu.T;
    T.sauver();
    const R = T.R, entree = R.esp >>> 0;
    this.jeu = jeu;
    this.ebpAppelant = R.ebp;
    this.ebx = R.ebx;
    this.esi = R.esi;
    this.edi = R.edi;
    poserLong(jeu, entree - 4, R.ebx);
    poserLong(jeu, entree - 8, R.esi);
    poserLong(jeu, entree - 12, R.edi);
    poserLong(jeu, entree - 16, R.ebp);
    this.ebp = entree - 16;
    R.ebp = this.ebp;
    R.esp = this.ebp - tailleDesLocales;
    T.charger();
  }

  // L'adresse d'une variable locale, [ebp - decalage].
  local(decalage) { return this.ebp - decalage; }

  // Le `leave` et les `pop` : ebp, edi, esi et ebx redeviennent ceux de l'appelant (des fonctions
  // appelées, écrites en assembleur, ne les gardent pas toutes).
  fermer() {
    const T = this.jeu.T;
    T.sauver();
    T.R.ebp = this.ebpAppelant;
    T.R.ebx = this.ebx;
    T.R.esi = this.esi;
    T.R.edi = this.edi;
    T.charger();
  }
}

function dansLeCadre(tailleDesLocales, routine) {
  return (jeu, ...args) => {
    const cadre = new Cadre(jeu, tailleDesLocales);
    try {
      return routine(jeu, cadre, ...args);
    } finally {
      cadre.fermer();
    }
  };
}

// =====================================================================================================
// 0x78B53 — ouvrir un livre de comptes neuf.
//
// Le livre des comptes du joueur courant est vidé (son nombre d'écritures, octet +46 des comptes,
// remis à zéro) et le solde du moment (mot long +0A de la fiche) noté en +42 des comptes : le solde au
// début de la période. Appelée au chargement d'une partie (0x19EEE, 0x1A2CA) et au début de la fin
// d'année (0x7401C).
export function ouvrirUnLivreNeuf(jeu) {
  const comptes = long(jeu, COMPTES_COURANTS);
  poserOctet(jeu, comptes + 0x46, 0);
  poserLong(jeu, comptes + 0x42, long(jeu, long(jeu, FICHE_COURANTE) + 0x0A));
}

// =====================================================================================================
// 0x76F03 — charger l'écran des trophées.
//
// Le fond (data/mawar1-0.dat) va dans le tampon de fond [0xD3B98] ; les images des coupes
// (data/mcup-0.dat) dans [0xD3BA8], leur taille notée en [0xD35A0] ; leur table (data/mcup-0.tab, six
// octets par image : décalage, largeur, hauteur) dans [0xD3BB8]. La table est reliée aux images par
// 0x10C80, qui change chaque décalage en adresse, puis devient la table de sprites courante ([0xD3B24],
// données [0xD3B3C]).
//
// Anomalie reproduite : la fin de la table est calculée à la taille du fichier × 6 au lieu de la
// taille : 0x10C80 traite ainsi six fois trop d'entrées, et « reloge » (ajoute l'adresse des images à
// tout mot long qui lui est inférieur, et double en basse résolution les octets +4 et +5) la mémoire
// qui suit la table.
export function chargerLEcranDesTrophees(jeu) {
  jeu.appeler(0x40D3E);
  jeu.appeler(CHARGER_UN_FICHIER, 0xB8241, long(jeu, 0xD3B98));          // data/mawar1-0.dat
  poserLong(jeu, 0xD35A0, jeu.appeler(CHARGER_UN_FICHIER, 0xB8280, long(jeu, 0xD3BA8)));  // data/mcup-0.dat
  const taille = jeu.appeler(CHARGER_UN_FICHIER, 0xB82BF, long(jeu, 0xD3BB8));             // data/mcup-0.tab
  poserLong(jeu, 0xD3B30, long(jeu, 0xD3BB8) + Math.imul(taille, 6));
  jeu.appeler(RELOGER_LES_SPRITES, long(jeu, 0xD3BB8), long(jeu, 0xD3B30), long(jeu, 0xD3BA8));
  poserLong(jeu, 0xD3B24, long(jeu, 0xD3BB8));
  poserLong(jeu, 0xD3B3C, long(jeu, 0xD3BA8));
  jeu.appeler(0x80BE4);
}

// =====================================================================================================
// 0x73EE8 — trouver un acheteur pour un parc mis en vente.
//
// Rend le premier joueur (de 0 à 24) dont la fortune dépasse la moitié du prix : ni fiche vide, ni le
// joueur `exclu` (un octet signé), ni le joueur courant. Sa fortune : son solde (+0A) moins son prêt
// (+12), plus la valeur des actions qu'il détient dans chaque parc (mot +A3 + 2 × joueur : le nombre
// d'actions ; cours : mot long +66 du parc de ce joueur). Rend −1 s'il n'y en a pas.
export function trouverUnAcheteur(jeu, prix, exclu) {
  for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
    const candidat = long(jeu, FICHES) + k * TAILLE_FICHE;
    if (octet(jeu, candidat) === 0 || k === s8(exclu) || k === mot(jeu, JOUEUR_COURANT)) continue;
    let actions = 0;
    for (let j = 0; j < NOMBRE_DE_FICHES; j++) {
      const f = fiche(jeu, j);
      const nombre = mot(jeu, candidat + 0xA3 + 2 * j);
      if (octet(jeu, f) === 0 || nombre === 0) continue;
      actions = (actions + Math.imul(nombre, long(jeu, parcDeLaFiche(jeu, f) + 0x66))) | 0;
    }
    const fortune = (actions + ((long(jeu, candidat + 0x0A) - long(jeu, candidat + 0x12)) | 0)) | 0;
    if (fortune > idiv(prix, 2)) return k;
  }
  return -1;
}

// =====================================================================================================
// 0x729D8 — la bourse à la fin de l'année : valeur des parcs, dividendes, faillites, taux.
//
// Pour chaque joueur (fiche non vide) :
//  - la valeur de son parc (mot long +19 du parc, « VALEUR DU PARC » au bilan) : ses investissements
//    des dix dernières années (mots longs +37 à +5B de sa fiche, l'année écoulée en +37), amortis par
//    la table 0xB52DA (dix mots, en centièmes : 100, 95, 85, 75, 65, 55, 45, 35, 25, 10) ;
//    l'historique est décalé d'un cran et +37 repart de zéro ; le mot +A1 de la fiche passe à 0x744
//    (sens non établi) ;
//  - les dividendes : pour chaque autre joueur k dont il détient des actions (mot +A3 + 2k) et dont le
//    solde est positif, dividende = actions × solde de k / (32 × nombre d'actions du parc de k, mot
//    +62), ou / 16 s'il en détient la moitié ou plus ; 30 000 au plus. Les concurrents les reçoivent
//    et les versent sur leur solde ; un joueur de sorte 1 (le joueur humain) ou 6 (non établi) ne les
//    touche que par le livre des comptes, s'il est le joueur courant (catégorie 0x15, noté en +684 des
//    comptes). Anomalie reproduite : ce que verse un joueur de sorte 1 ou 6 ne passe au livre
//    (catégorie 0x16, en dépense, noté en +688) que si le détenteur des actions est le joueur courant
//    — l'original teste la fiche du détenteur, et non celle du payeur. Le joueur courant n'étant jamais
//    détenteur de ses propres actions dans cette boucle, il ne verse en fait jamais de dividendes ;
//  - sa fortune : son solde plus la valeur de ses actions (actions × cours, mot long +66 du parc), plus,
//    pour le joueur courant, la valeur de ses stocks (table 0xD3C00, fiches de 14 octets : mot +2 ×
//    mot +4, jusqu'à un mot +0 nul).
//  - la faillite : une fortune négative, ou un cours (+66 du parc) de 99 au plus. Pour le joueur
//    courant, un premier avertissement (octet +636 des comptes à 1) ; la seconde fois, la partie est
//    perdue : 0x5C7D1(1), le temps remis à zéro, 0x19EEE, tous les pays (table 0xB7B38, fiches de 0x1C
//    octets, jusqu'à un octet nul) marqués 0xFF en +1A, l'écran 0x50, octet +636 à 2, et la fonction
//    s'arrête là. Un concurrent en faillite disparaît : son parc fermé (+18), sa fiche vidée (+0, +1),
//    son pays libéré (0xFF), son cours et ses actions à zéro ; les actions qu'il détenait sont
//    revendues (le parc concerné voit son cours baisser, 99 au moins) ; celles qu'on détenait de lui,
//    annulées ; le compte des concurrents (octet 0xD77A2) diminue, et sa fiche repart de l'état neuf
//    (0xBA840). Sans faillite, le joueur courant voit son avertissement levé (+636 à 0), et chaque prêt
//    (+12) s'ajoute à la somme des prêts.
// Puis le taux de l'année : [0xD668C] = somme des prêts / 400 000 + 3 − hasard(6), 1 au moins ;
// [0xD668E] = (taux + 2 + hasard(2)) × 128 / 12 ; et chaque parc voit son mot +CA baisser de
// taux × 100 / 128 (sens non établi).
export const bourseDeFinDAnnee = dansLeCadre(0x20, (jeu, cadre) => {
  let sommeDesPrets = 0, dividendesRecus = 0, dividendesVerses = 0;
  for (let f = long(jeu, FICHES); f >>> 0 < long(jeu, FIN_DES_FICHES); f += TAILLE_FICHE) {
    if (octet(jeu, f) === 0) continue;
    const parc = parcDeLaFiche(jeu, f);

    // La valeur du parc, et le décalage de l'historique des investissements.
    poserLong(jeu, parc + 0x19, 0);
    for (let k = 9; k >= 0; k--) {
      const part = idiv(Math.imul(long(jeu, f + 0x37 + 4 * k), mot(jeu, 0xB52DA + 2 * k)), 100);
      ajouterAuLong(jeu, parc + 0x19, part);
      if (k !== 0) poserLong(jeu, f + 0x37 + 4 * k, long(jeu, f + 0x33 + 4 * k));
    }
    poserLong(jeu, f + 0x37, 0);
    poserMot(jeu, f + 0xA1, 0x744);

    // Les dividendes, et la valeur des actions détenues.
    let fortune = 0;
    for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
      const autre = fiche(jeu, k);
      if (octet(jeu, autre) === 0) continue;
      const actions = mot(jeu, f + 0xA3 + 2 * k);
      if (actions === 0 || mot(jeu, f + 2) === mot(jeu, autre + 2)) continue;
      const parcDeLAutre = parcDeLaFiche(jeu, autre);
      if (longSigne(jeu, autre + 0x0A) > 0) {
        const nombreDActions = mot(jeu, parcDeLAutre + 0x62);
        const diviseur = actions < (nombreDActions >> 1) ? nombreDActions << 5 : nombreDActions << 4;
        let dividende = idiv(Math.imul(actions, long(jeu, autre + 0x0A)), diviseur);
        if (dividende > 30000) dividende = 30000;
        const sorte = octet(jeu, f);
        if (sorte === 1 || sorte === 6) {
          if (mot(jeu, f + 2) === mot(jeu, JOUEUR_COURANT)) dividendesRecus = (dividendesRecus + dividende) | 0;
        } else {
          ajouterAuLong(jeu, f + 0x0A, dividende);
        }
        const sorteDeLAutre = octet(jeu, autre);
        if (sorteDeLAutre === 1 || sorteDeLAutre === 6) {
          if (mot(jeu, f + 2) === mot(jeu, JOUEUR_COURANT)) dividendesVerses = (dividendesVerses + dividende) | 0;
        } else {
          ajouterAuLong(jeu, autre + 0x0A, -dividende);
        }
      }
      fortune = (fortune + Math.imul(mot(jeu, f + 0xA3 + 2 * k), long(jeu, parcDeLAutre + 0x66))) | 0;
    }
    if (idiv(f - long(jeu, FICHES), TAILLE_FICHE) === mot(jeu, JOUEUR_COURANT)) {
      for (let k = 0; mot(jeu, 0xD3C00 + s8(k) * 0xE) !== 0; k = s8(k + 1)) {
        fortune = (fortune + Math.imul(mot(jeu, 0xD3C04 + s8(k) * 0xE), mot(jeu, 0xD3C02 + s8(k) * 0xE))) | 0;
      }
    }

    // La faillite.
    if (((long(jeu, f + 0x0A) + fortune) | 0) >= 0 && longSigne(jeu, parc + 0x66) > 0x63) {
      if (mot(jeu, long(jeu, FICHE_COURANTE) + 2) === mot(jeu, f + 2)) poserOctet(jeu, long(jeu, COMPTES_COURANTS) + 0x636, 0);
      sommeDesPrets = (sommeDesPrets + long(jeu, f + 0x12)) | 0;
      continue;
    }
    if (mot(jeu, long(jeu, FICHE_COURANTE) + 2) === mot(jeu, f + 2)) {
      if (octet(jeu, long(jeu, COMPTES_COURANTS) + 0x636) === 1) {
        // La partie est perdue.
        jeu.appeler(0x5C7D1, 1);
        poserLong(jeu, PAS_DE_SIMULATION, 0);
        jeu.appeler(0x19EEE);
        for (let k = 0; octet(jeu, 0xB7B38 + s8(k) * 0x1C) !== 0; k = s8(k + 1)) poserOctet(jeu, 0xB7B52 + s8(k) * 0x1C, 0xFF);
        poserMot(jeu, 0xD6652, 0x50);
        poserOctet(jeu, long(jeu, COMPTES_COURANTS) + 0x636, 2);
        return;
      }
      poserOctet(jeu, long(jeu, COMPTES_COURANTS) + 0x636, 1);
      continue;
    }
    faillirUnConcurrent(jeu, f, parc);
  }

  if (dividendesRecus !== 0) {
    jeu.appeler(INSCRIRE_AU_LIVRE, 0x15, dividendesRecus);
    poserLong(jeu, long(jeu, COMPTES_COURANTS) + 0x684, dividendesRecus);
  }
  if (dividendesVerses !== 0) {
    jeu.appeler(INSCRIRE_AU_LIVRE, 0x16, -dividendesVerses);
    poserLong(jeu, long(jeu, COMPTES_COURANTS) + 0x688, dividendesVerses);
  }

  // Le taux de l'année.
  const variation = 3 - (u16(jeu.appeler(HASARD)) % 6);
  poserMot(jeu, 0xD668C, idiv(sommeDesPrets, 400000) + variation);
  if (motSigne(jeu, 0xD668C) < 1) poserMot(jeu, 0xD668C, 1);
  const demi = u16(jeu.appeler(HASARD)) % 2;
  poserMot(jeu, 0xD668E, idiv((motSigne(jeu, 0xD668C) + 2 + demi) << 7, 12));
  for (let f = long(jeu, FICHES); f >>> 0 < long(jeu, FIN_DES_FICHES); f += TAILLE_FICHE) {
    if (octet(jeu, f) === 0) continue;
    const parc = parcDeLaFiche(jeu, f);
    const baisse = idiv(motSigne(jeu, 0xD668C) * 100, 128);
    poserMot(jeu, parc + 0xCA, motSigne(jeu, parc + 0xCA) - baisse);
  }
});

// Un concurrent fait faillite (0x72E32 à 0x731EC).
function faillirUnConcurrent(jeu, f, parc) {
  poserOctet(jeu, parc + 0x18, 0);
  poserOctet(jeu, f, 0);
  poserOctet(jeu, f + 1, 0);
  poserOctet(jeu, 0xB7B52 + octetSigne(jeu, f + 5) * 0x1C, 0xFF);
  poserOctet(jeu, parc + 0xA7, 0xFF);
  poserLong(jeu, parc + 0x66, 0);
  poserMot(jeu, parc + 0x62, 0);
  for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
    const autre = fiche(jeu, k);
    if (octet(jeu, autre) === 0) continue;
    const actions = mot(jeu, f + 0xA3 + 2 * k);
    if (actions > 0 && mot(jeu, f + 2) !== k) {
      // Ses actions du parc de k sont revendues : le cours de ce parc baisse.
      const p = parcDeLaFiche(jeu, autre);
      poserLong(jeu, p + 0x6A, long(jeu, p + 0x66));
      ajouterAuMot(jeu, p + 0x60, actions);
      ajouterAuLong(jeu, p + 0x66, -idiv(actions * 100, mot(jeu, p + 0x62)));
      const capitalisation = Math.imul(idiv(mot(jeu, p + 0x62), 10), long(jeu, p + 0x66));
      if (capitalisation < longSigne(jeu, p + 0x72)) {
        poserLong(jeu, p + 0x72, Math.imul(idiv(mot(jeu, p + 0x62), 10), long(jeu, p + 0x66)));
      }
      ajouterAuMot(jeu, p + 0x5C, -actions);
      if (longSigne(jeu, p + 0x66) <= 0x63) poserLong(jeu, p + 0x66, 0x63);
      poserMot(jeu, f + 0xA3 + 2 * k, 0);
    } else if (actions > 0) {
      poserMot(jeu, f + 0xA3 + 2 * k, 0);
      poserMot(jeu, parc + 0x5E, 0);
    }
  }
  for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
    const a = fiche(jeu, k) + 0xA3 + 2 * mot(jeu, f + 2);
    if (mot(jeu, a) > 0) poserMot(jeu, a, 0);
  }
  poserMot(jeu, parc + 0x5C, 0);
  poserMot(jeu, parc + 0x60, 0);
  poserOctet(jeu, 0xD77A2, octet(jeu, 0xD77A2) - 1);
  const numero = mot(jeu, f + 2);
  jeu.m8.copyWithin(long(jeu, FICHES) + numero * TAILLE_FICHE, FICHES_D_ORIGINE + numero * TAILLE_FICHE,
    FICHES_D_ORIGINE + numero * TAILLE_FICHE + TAILLE_FICHE);
}

// =====================================================================================================
// 0x73347 — les suites du classement.
//
// Appelée quand le joueur a validé l'écran du classement, dont le dessin a rangé chaque joueur : son
// mot +95 est sa place au classement général (1 le premier), ses octets +97 à +9C son rang (0 le
// premier) dans chacune des six catégories (voir finirLAnnee). Pour chaque joueur :
//  - l'attrait de son parc (octet signé +21 de la fiche du parc, qui s'ajoute à l'attrait du prix
//    d'entrée, retro-ingenierie.md § 10.2) : l'ancien est gardé en +22 ; sa place est prise en
//    pourcentage d'un nombre de joueurs, l'octet 0xD77A2 (1 s'il est nul), et le premier quart du
//    classement reçoit un bonus (table 0xB52ED, par place : 10, 7, 5, 4, 3, 2, 1, puis 0), le dernier
//    quart un malus (table 0xB52F8, par place depuis la fin : −8 pour le dernier, puis −6, −5, −4,
//    −3, −2, −1, 0). Anomalie : 0xD77A2 n'est pas le nombre de joueurs classés ; seule la faillite
//    d'un concurrent le fait varier (0x729D8, qui le diminue) ; il vaut 1 dans la partie de la démo,
//    qui compte 21 joueurs, et le pourcentage (pris sur un octet) n'y a pas de sens : le premier reçoit
//    le malus du dernier (−8). Ce qu'il compte au juste, non établi ;
//  - six notes, octets +27 à +2C : (rang − handicap × [0xD77A2] / 100) / 2, le handicap étant l'octet
//    signé +20 à +25 de sa fiche (+27 : rang +97 et handicap +20 ; +29 : +98, +22 ; +2A : +99, +23 ;
//    +2B : +9A, +24 ; +28 : +9B, +21 ; +2C : +9C, +25), 1 au moins ;
//  - puis chaque rang au-delà de (octet +1C + 1) / 2 en est diminué ; pour le rang +97, seulement une
//    fois passées les années de la table 0xBE057 (5 × 5 octets, selon les octets +1A et +1B de la
//    fiche : 2 à 20 ans). Sens de ces octets, non établi.
export const appliquerLeClassement = dansLeCadre(0x10, (jeu) => {
  for (let f = long(jeu, FICHES); f >>> 0 < long(jeu, FIN_DES_FICHES); f += TAILLE_FICHE) {
    if (octet(jeu, f) === 0) continue;
    const parc = parcDeLaFiche(jeu, f);
    poserOctet(jeu, parc + 0x22, octet(jeu, parc + 0x21));
    poserOctet(jeu, 0xD77A2, octet(jeu, 0xD77A2) === 0 ? 1 : octet(jeu, 0xD77A2));
    const place = mot(jeu, f + 0x95);
    const pourcentage = idiv(place * 100, octet(jeu, 0xD77A2)) & 0xFF;
    if (pourcentage <= 0x19) {
      poserOctet(jeu, parc + 0x21, octet(jeu, 0xB52ED + place));
    } else if (pourcentage >= 0x4B) {
      poserOctet(jeu, parc + 0x21, octet(jeu, 0xB52F8 + octet(jeu, 0xD77A2) - place));
    }

    const note = (rang, handicap) => idiv(octet(jeu, f + rang) - idiv(octetSigne(jeu, f + handicap) * octet(jeu, 0xD77A2), 100), 2);
    poserOctet(jeu, f + 0x27, note(0x97, 0x20));
    poserOctet(jeu, f + 0x29, note(0x98, 0x22));
    poserOctet(jeu, f + 0x2A, note(0x99, 0x23));
    poserOctet(jeu, f + 0x2B, note(0x9A, 0x24));
    poserOctet(jeu, f + 0x28, note(0x9B, 0x21));
    poserOctet(jeu, f + 0x2C, note(0x9C, 0x25));
    for (const champ of [0x27, 0x29, 0x2A, 0x2B, 0x28, 0x2C]) {
      if (octet(jeu, f + champ) === 0) poserOctet(jeu, f + champ, 1);
    }

    const seuil = (octet(jeu, f + 0x1C) + 1) >> 1;
    if (octet(jeu, f + 0x97) > seuil) {
      const annees = octet(jeu, 0xBE057 + octet(jeu, f + 0x1A) * 5 + octet(jeu, f + 0x1B));
      if (annees * PAS_PAR_AN < long(jeu, PAS_DE_SIMULATION)) poserOctet(jeu, f + 0x97, octet(jeu, f + 0x97) - seuil);
    }
    for (const rang of [0x9A, 0x98, 0x9B, 0x99, 0x9C]) {
      if (octet(jeu, f + rang) > seuil) poserOctet(jeu, f + rang, octet(jeu, f + rang) - seuil);
    }
  }
});

// =====================================================================================================
// 0x4ADE6 — le cours des actions à la fin de l'année (seulement quand l'octet 0xD66F1 vaut 2 : le
// niveau de jeu où la bourse est gérée, vraisemblablement ; il vaut 2 dans la partie de la démo).
//
// Pour chaque joueur, le cours de son parc (mot long +66 de la fiche du parc ; l'ancien noté en +6A)
// gagne : la valeur du parc (+19) / 256, 1 000 au plus ; sa trésorerie (solde − prêt) / 256,
// bornée à −2 000 et 1 000 ; (mot +35 − 8 × octet +51 du parc) × 16, mêmes bornes ; 256 × l'évolution
// de son attrait (+21 − +22) + 128 × l'attrait ; (128 − hasard(256)) × 4 ; et la moitié de (800 − le
// taux +B de son pays, table 0xB7B38), −400 au moins. Puis il perd 100 × actions en vente
// (+60) / actions émises (+62), et reste entre 99 et 15 000 : au-delà de 15 000, tant que les actions
// émises restent sous 0x6590, l'action est divisée en deux (cours / 2, et les nombres d'actions +5C,
// +5E, +60, +62, et ceux que détient chaque joueur, doublés). Enfin la capitalisation (actions / 10 ×
// cours) met à jour le plus bas (+72) et le plus haut (+6E) de l'année.
export const coursDeFinDAnnee = dansLeCadre(0x1C, (jeu) => {
  for (let f = long(jeu, FICHES); f >>> 0 < long(jeu, FIN_DES_FICHES); f += TAILLE_FICHE) {
    if (octet(jeu, f) === 0) continue;
    const parc = parcDeLaFiche(jeu, f);
    poserLong(jeu, parc + 0x6A, long(jeu, parc + 0x66));
    let pays = 800 - mot(jeu, 0xB7B43 + octetSigne(jeu, f + 5) * 0x1C);
    if (pays < -800) pays = -800;
    let valeur = idiv(longSigne(jeu, parc + 0x19), 256);
    if (valeur > 1000) valeur = 1000;
    let tresorerie = idiv((long(jeu, f + 0x0A) - long(jeu, f + 0x12)) | 0, 256);
    if (tresorerie > 1000) tresorerie = 1000;
    else if (tresorerie < -2000) tresorerie = -2000;
    let activite = (mot(jeu, parc + 0x35) - (octet(jeu, parc + 0x51) << 3)) << 4;
    if (activite > 1000) activite = 1000;
    else if (activite < -2000) activite = -2000;
    const attrait = ((octetSigne(jeu, parc + 0x21) - octetSigne(jeu, parc + 0x22)) << 8) + (octetSigne(jeu, parc + 0x21) << 7);
    const somme = valeur + attrait + activite + tresorerie;
    const alea = (0x80 - u16(jeu.appeler(HASARD)) % 256) << 2;
    ajouterAuLong(jeu, parc + 0x66, somme + alea + idiv(pays, 2));
    if (mot(jeu, parc + 0x62) > 0) {
      ajouterAuLong(jeu, parc + 0x66, -idiv(mot(jeu, parc + 0x60) * 100, mot(jeu, parc + 0x62)));
    }
    if (longSigne(jeu, parc + 0x66) < 0x63) poserLong(jeu, parc + 0x66, 0x63);
    while (longSigne(jeu, parc + 0x66) > 15000 && mot(jeu, parc + 0x62) < 0x6590) {
      poserLong(jeu, parc + 0x66, idiv(longSigne(jeu, parc + 0x66), 2));
      for (const champ of [0x62, 0x5E, 0x5C, 0x60]) poserMot(jeu, parc + champ, mot(jeu, parc + champ) << 1);
      for (let k = 0; k <= 0x18; k++) {
        const a = fiche(jeu, k) + 0xA3 + 2 * mot(jeu, f + 2);
        if (mot(jeu, a) > 0) poserMot(jeu, a, mot(jeu, a) << 1);
      }
    }
    if (longSigne(jeu, parc + 0x66) > 15000) poserLong(jeu, parc + 0x66, 15000);
    else if (longSigne(jeu, parc + 0x66) < 0x63) poserLong(jeu, parc + 0x66, 0x63);
    const capitalisation = () => Math.imul(idiv(mot(jeu, parc + 0x62), 10), long(jeu, parc + 0x66));
    if (capitalisation() < longSigne(jeu, parc + 0x72)) poserLong(jeu, parc + 0x72, capitalisation());
    if (capitalisation() > longSigne(jeu, parc + 0x6E)) poserLong(jeu, parc + 0x6E, capitalisation());
  }
});

// =====================================================================================================
// 0x51111 — les impôts locaux et l'inflation, à la fin de l'année.
//
// Pour chaque joueur, son pays : la fiche 0xB7B38 + 0x1C × l'octet signé +5 de sa fiche (le pays 0 si
// négatif), dont le mot +9 est l'inflation de l'année (en dix-millièmes), le mot +B un autre taux (non
// établi), l'octet +E le nombre d'années sans impôts locaux, le mot +F l'impôt par case.
//  - Les impôts locaux (« IMPOTS LOCAUX » au bilan), si le terrain n'est pas acheté (octet +221 de la
//    fiche nul, voir finirLAnnee) : pour le
//    joueur courant, le nombre de cases dont le sol porte des drapeaux (0xB44D9), en parcourant la
//    carte [0xD3B08] sur 0x4100 octets — 64 cellules de trop, une rangée après la fin de la carte :
//    anomalie reproduite ; pour un concurrent autre que de sorte 1, (attractions + boutiques, octets
//    +82 et +E0 du parc) × 32 ; impôt = cases × impôt par case / 100. Le compte n'est pas remis à zéro
//    d'un joueur à l'autre (anomalie reproduite : un joueur de sorte 1 qui n'est pas le joueur courant
//    paie selon le compte du joueur précédent, et le joueur courant ajoute ses cases au compte laissé).
//    Une fois passées les années d'exemption, le joueur courant le paie au livre (catégorie 0x19,
//    noté en +68C des comptes), un concurrent sur son solde ; et l'impôt par case du pays augmente de
//    l'inflation.
//  - L'inflation : pour un joueur de sorte 1, le prix de chaque attraction (mot long +A2 des fiches
//    0xCCED0) et de chaque boutique (mot long +49 des fiches 0xD3C62) augmente de l'inflation, arrondi
//    au multiple de 250 inférieur (en valeur absolue) ; le mot +3E des comptes aussi, au 1/16 de
//    l'inflation, mis à 0 sous 200 et borné à 10 000 (non établi : un prix ?). Pour un joueur d'une
//    autre sorte (ni 1 ni 6), le mot long +D9 de la fiche, 128 au moins, augmente de l'inflation.
//  - L'inflation du pays varie de inflation / 4 − hasard(inflation / 2), entre 10 et 10 000 ; puis,
//    si elle a varié, le taux +B de hasard(2 × variation), 10 au moins ; au-delà de 15 000, il est
//    ramené à 10 000 (anomalie reproduite : le seuil et la borne diffèrent).
export const impotsEtInflation = dansLeCadre(0x2C, (jeu) => {
  let cases = 0;   // l'original n'en lit que le mot bas (movsx)
  for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
    const f = fiche(jeu, k);
    if (octet(jeu, f) === 0) continue;
    const pays = octetSigne(jeu, f + 5) < 0 ? 0xB7B38 : 0xB7B38 + octetSigne(jeu, f + 5) * 0x1C;
    const parc = parcDeLaFiche(jeu, f);
    const estLeJoueurCourant = () => idiv(f - long(jeu, FICHES), TAILLE_FICHE) === mot(jeu, JOUEUR_COURANT);

    if (octet(jeu, f + 0x221) === 0) {
      if (estLeJoueurCourant()) {
        const carte = long(jeu, 0xD3B08);
        for (let c = carte; ((carte + 0x4100) >>> 0) > (c >>> 0); c += 4) {
          if (mot(jeu, 0xB44D9 + octet(jeu, c + 2) * 4) !== 0) cases = (cases + 1) | 0;
        }
      } else if (octet(jeu, f) !== 1) {
        cases = (octet(jeu, parc + 0x82) + octet(jeu, parc + 0xE0)) << 5;
      }
      const impot = idiv(Math.imul(s16(cases), mot(jeu, pays + 0xF)), 100);
      if (impot !== 0 && ((long(jeu, PAS_DE_SIMULATION) / PAS_PAR_AN) >>> 0) > octet(jeu, pays + 0xE)) {
        if (estLeJoueurCourant()) {
          jeu.appeler(INSCRIRE_AU_LIVRE, 0x19, -impot);
          poserLong(jeu, long(jeu, COMPTES_COURANTS) + 0x68C, impot);
        } else if (octet(jeu, f) !== 1) {
          ajouterAuLong(jeu, f + 0x0A, -impot);
        }
        poserMot(jeu, pays + 0xF, idiv(Math.imul(mot(jeu, pays + 0xF), mot(jeu, pays + 9)), 10000) + mot(jeu, pays + 0xF));
      }
    }

    if (octet(jeu, f) === 1) {
      const inflation = (a) => {
        poserLong(jeu, a, (idiv(Math.imul(mot(jeu, pays + 9), long(jeu, a)), 10000) + long(jeu, a)) | 0);
        poserLong(jeu, a, (long(jeu, a) - imod(long(jeu, a), 250)) | 0);
      };
      for (let j = 0; mot(jeu, 0xCCEF2 + j * 200) !== 0; j = (j + 1) & 0xFF) inflation(0xCCF72 + j * 200);
      for (let j = 0; mot(jeu, 0xD3C84 + j * 0x6B) !== 0; j = (j + 1) & 0xFF) inflation(0xD3CAB + j * 0x6B);
      const comptes = long(jeu, COMPTES_COURANTS);
      let valeur = idiv(mot(jeu, comptes + 0x3E) * (mot(jeu, pays + 9) >> 4), 10000) + mot(jeu, comptes + 0x3E);
      if (valeur < 200) valeur = 0;
      if (valeur > 10000) valeur = 10000;
      poserMot(jeu, long(jeu, COMPTES_COURANTS) + 0x3E, valeur);
    } else if (octet(jeu, f) !== 6) {
      if (longSigne(jeu, f + 0xD9) < 0x80) poserLong(jeu, f + 0xD9, 0x80);
      ajouterAuLong(jeu, f + 0xD9, idiv(Math.imul(long(jeu, f + 0xD9), mot(jeu, pays + 9)), 10000));
    }

    const moitie = mot(jeu, pays + 9) >> 1;
    const alea = imod(u16(jeu.appeler(HASARD)), moitie);
    const variation = (mot(jeu, pays + 9) >> 2) - alea;
    if (variation === 0) continue;
    if (mot(jeu, pays + 9) + variation < 10) poserMot(jeu, pays + 9, 10);
    else if (mot(jeu, pays + 9) + variation > 10000) poserMot(jeu, pays + 9, 10000);
    else ajouterAuMot(jeu, pays + 9, variation);
    const ecart = imod(u16(jeu.appeler(HASARD)), variation * 2);
    if (mot(jeu, pays + 0xB) + ecart < 10) poserMot(jeu, pays + 0xB, 10);
    else if (mot(jeu, pays + 0xB) + ecart > 15000) poserMot(jeu, pays + 0xB, 10000);
    else ajouterAuMot(jeu, pays + 0xB, ecart);
  }
});

// =====================================================================================================
// 0x76FA3 — décerner les trophées de l'année ; rend la somme des primes.
//
// Les trophées : 9 fiches de 8 octets en 0xB79FD, dont finirLAnnee remet la mention à zéro avant l'appel :
//   +0  octet  l'image de la coupe (table [0xD3B24] de l'écran des trophées)
//   +1  octet  la mention : 1 à 5 (« EXCELLENTE. BONUS 10000 », « BONNE. BONUS 5000 », « MOYENNE. »,
//              « MAUVAISE. », « LAMENTABLE. », table [0xD7BB4]) ; pour le trophée 6, des bits ; 0 : aucun
//   +2  octet  la forme : 1 cinq mentions, 2 décerné ou non, 3 des distinctions (des bits)
//   +3  mot    la position à l'écran (x, puis y en +5)
//   +7  octet  le numéro de son texte (table [0xD7BB8])
// La mention 1 rapporte une prime de 10 000, la mention 2 5 000 ; un trophée décerné 10 000 ou 5 000.
// Ce que mesure chacun (fiche du parc [0xD3818], comptes [0xD3814], année = pas / 12 000) :
//   0 (0xB79FE) « LA SECURITE DANS VOTRE PARC EST … », s'il a des attractions : 16 × (mot signé +CC −
//     attractions / 4) + seuil d'usure moyen (+93) − 3 × usure moyenne (+97) − mot +A1 / (année + 1)
//     − 128 × mot +9F / (année + 1) ; seuils 30, 15, 0, −30 ;
//   1 (0xB7A06) « LA POPULARITE DE VOTRE PARC EST … », parc ouvert : 100 × mot +33 / (12 × octet +51) ;
//     seuils 90, 75, 55, 35 ;
//   2 (0xB7A0E) « LA TECHNOLOGIE DE VOS ATTRACTIONS EST … » : mot long +12C / (année + 1) ; seuils 200,
//     150, 100, 50 ;
//   3 (0xB7A16) « VOTRE MISE EN PLACE AUTOUR DES ATTRACTIONS EST … », s'il a des attractions : la
//     variété — pour chaque attraction du parc, +1 pour la première et la deuxième d'un même genre, −1
//     au-delà — comparée à 2 × année + 6 (ou 20), 3 × année / 2 + 5, année + 4, année / 2 + 3 ;
//   4 (0xB7A1E) « LES VISITEURS PENSENT QUE L'AMBIANCE DE VOTRE PARC EST … », s'il a des visiteurs
//     (mot +1F) : le contentement moyen (+AE) comparé aux seuils du parc (+0, content, et +2,
//     mécontent) : au-delà du premier, jusqu'à 100 en dessous, au-delà du second, jusqu'à 200 en
//     dessous, en dessous ;
//   5 (0xB7A26) « VOUS AVEZ LE PLUS LONG CIRCUIT DE VOITURES DU MONDE », 6 (0xB7A2E) « VOUS AVEZ LES
//     MONTAGNES RUSSES LES PLUS HAUTES / LONGUES / CHERES DU MONDE ! », 8 (0xB7A3E) « VOUS AVEZ LA PLUS
//     LONGUE RIVIERE DU MONDE » : les records des comptes du joueur (+64A ; +641, +642, +644 ; +648),
//     s'ils sont les meilleurs de tous les joueurs — les comptes des autres joueurs de sorte 1, ou, pour
//     les concurrents qui en ont un, les valeurs de leur profil (tables 0xBDD92, 0xBDD96, 0xBDDA0 de 0x27
//     octets, selon l'octet +A7 de leur parc et l'octet +1A de leur fiche ; +641, +642 et +644
//     seulement) — et au-delà d'un seuil (30 ; 4, 30, 30 000 ; 30). Le trophée 6 prend un bit par
//     record : 1 la hauteur, 2 la longueur, 4 le prix ;
//   7 (0xB7A36) « VOTRE PARC EST LE MIEUX COTE DU MONDE SUR LE MARCHE », au niveau 2 (octet 0xD66F1) :
//     la plus forte capitalisation (actions × cours, sur les 25 fiches, vides comprises), si c'est celle
//     du parc du joueur (octet +40 des comptes).
// Au passage, chaque attraction à train qui n'est pas un monorail est confiée à 0x43689(attraction, 1)
// (non établi).
//
// Les comparaisons mêlent les signes comme l'original : les records des joueurs (octet, mots) sont
// lus sans signe et comparés au meilleur lu avec signe ; le mot long +644 est comparé avec signe à
// celui d'un joueur, sans signe à celui d'un profil.
export const decernerLesTrophees = dansLeCadre(0x6C, (jeu, cadre) => {
  const TROPHEES = 0xB79FE;           // l'octet +1 (la mention) du premier trophée
  const mention = (k, v) => poserOctet(jeu, TROPHEES + 8 * k, v);
  let prix = 0;
  const annee = u16((long(jeu, PAS_DE_SIMULATION) / PAS_PAR_AN) >>> 0);

  // Le nombre d'attractions de chaque genre, compté dans les variables locales de l'original.
  const parGenre = cadre.local(0x68);
  for (let k = 0; k < 0x20; k++) poserOctet(jeu, parGenre + k, 0);

  if (octet(jeu, 0xD66F1) === 2) {
    let meilleure = 0, premier = -1;
    for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
      const parc = parcDeLaFiche(jeu, fiche(jeu, k));
      const capitalisation = Math.imul(mot(jeu, parc + 0x62), long(jeu, parc + 0x66));
      if (capitalisation > meilleure) {
        meilleure = capitalisation;
        premier = s8(k);
      }
    }
    if (premier === octet(jeu, long(jeu, COMPTES_COURANTS) + 0x40)) {
      mention(7, 1);
      prix += 10000;
    }
  } else {
    mention(7, 0);
  }

  let variete = 0;
  for (let o = long(jeu, 0xD3B10) + 200; o >>> 0 < long(jeu, 0xD3B78); o += 200) {
    if (octet(jeu, o + 4) !== 4) continue;
    if (octet(jeu, o + 0xC) === 6 && octet(jeu, 0xCCF84 + mot(jeu, o + 0x16)) !== 3) jeu.appeler(0x43689, o, 1);
    const compte = parGenre + idiv(mot(jeu, o + 0x16), 200);
    const deja = octet(jeu, compte);
    poserOctet(jeu, compte, deja + 1);
    variete += deja <= 1 ? 1 : -1;
  }

  // Les meilleurs relevés : ceux du joueur d'abord, puis ceux des autres.
  const comptes = long(jeu, COMPTES_COURANTS);
  let record641 = octet(jeu, comptes + 0x641), record642 = mot(jeu, comptes + 0x642);
  let record644 = long(jeu, comptes + 0x644), record648 = mot(jeu, comptes + 0x648);
  let record64A = mot(jeu, comptes + 0x64A);
  for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
    const f = fiche(jeu, k);
    if (octet(jeu, f) === 1 && mot(jeu, f + 2) !== mot(jeu, JOUEUR_COURANT)) {
      const autres = 0xD443C + mot(jeu, f + 2) * 0x6C2;
      if (octet(jeu, autres + 0x641) > s8(record641)) record641 = octet(jeu, autres + 0x641);
      if (mot(jeu, autres + 0x642) > s16(record642)) record642 = mot(jeu, autres + 0x642);
      if (longSigne(jeu, autres + 0x644) > (record644 | 0)) record644 = long(jeu, autres + 0x644);
      if (mot(jeu, autres + 0x648) > s16(record648)) record648 = mot(jeu, autres + 0x648);
      if (mot(jeu, autres + 0x64A) > s16(record64A)) record64A = mot(jeu, autres + 0x64A);
    } else {
      const profil = octetSigne(jeu, parcDeLaFiche(jeu, f) + 0xA7);
      if (profil === -1) continue;
      const niveau = octet(jeu, f + 0x1A);
      const p = profil * 0x27;
      if (octet(jeu, 0xBDDA0 + p + niveau) > s8(record641)) record641 = octet(jeu, 0xBDDA0 + p + niveau);
      if (mot(jeu, 0xBDD96 + p + 2 * niveau) > s16(record642)) record642 = mot(jeu, 0xBDD96 + p + 2 * niveau);
      if (long(jeu, 0xBDD92 + p) > (record644 >>> 0)) record644 = long(jeu, 0xBDD92 + p);
    }
  }
  if (s8(record641) === octet(jeu, comptes + 0x641) && octet(jeu, comptes + 0x641) > 4) {
    poserOctet(jeu, 0xB7A2E, octet(jeu, 0xB7A2E) | 1);
    prix += 10000;
  }
  if (s16(record642) === mot(jeu, comptes + 0x642) && mot(jeu, comptes + 0x642) > 0x1E) {
    poserOctet(jeu, 0xB7A2E, octet(jeu, 0xB7A2E) | 2);
    prix += 10000;
  }
  if ((record644 | 0) === longSigne(jeu, comptes + 0x644) && longSigne(jeu, comptes + 0x644) > 30000) {
    poserOctet(jeu, 0xB7A2E, octet(jeu, 0xB7A2E) | 4);
    prix += 10000;
  }
  if (s16(record648) === mot(jeu, comptes + 0x648) && mot(jeu, comptes + 0x648) > 0x1E) {
    mention(8, 1);
    prix += 5000;
  }
  if (s16(record64A) === mot(jeu, comptes + 0x64A) && mot(jeu, comptes + 0x64A) > 0x1E) {
    mention(5, 1);
    prix += 5000;
  }

  const parc = long(jeu, PARC_COURANT);
  const parAn = (v) => idiv(v, annee + 1);
  // Cinq mentions selon quatre seuils décroissants ; les deux premières rapportent 10 000 et 5 000.
  const mentionSelon = (k, v, seuils) => {
    if (v >= seuils[0]) { prix += 10000; mention(k, 1); }
    else if (v >= seuils[1]) { prix += 5000; mention(k, 2); }
    else if (v >= seuils[2]) mention(k, 3);
    else if (v >= seuils[3]) mention(k, 4);
    else mention(k, 5);
  };

  mentionSelon(2, parAn(long(jeu, parc + 0x12C)), [200, 150, 100, 50]);

  if (octet(jeu, parc + 0x82) !== 0) {
    let note = (motSigne(jeu, parc + 0xCC) - (octet(jeu, parc + 0x82) >> 2)) << 4;
    note += motSigne(jeu, parc + 0x93) - Math.imul(long(jeu, parc + 0x97), 3);
    note -= parAn(mot(jeu, parc + 0xA1));
    note -= parAn(mot(jeu, parc + 0x9F) << 7);
    mentionSelon(0, note | 0, [30, 15, 0, -30]);
  }

  if (octet(jeu, parc + 0x18) !== 0) {
    mentionSelon(1, idiv(mot(jeu, parc + 0x33) * 100, octet(jeu, parc + 0x51) * 12), [90, 75, 55, 35]);
  }

  if (octet(jeu, parc + 0x82) !== 0) {
    if (annee * 2 + 6 <= variete || variete >= 20) { prix += 10000; mention(3, 1); }
    else if (((annee * 3) >> 1) + 5 <= variete) { prix += 5000; mention(3, 2); }
    else if (annee + 4 <= variete) mention(3, 3);
    else if ((annee >> 1) + 3 <= variete) mention(3, 4);
    else mention(3, 5);
  }

  if (mot(jeu, parc + 0x1F) !== 0) {
    const contentement = longSigne(jeu, parc + 0xAE);
    const content = motSigne(jeu, parc + 0), mecontent = motSigne(jeu, parc + 2);
    if (content <= contentement) { prix += 10000; mention(4, 1); }
    else if (content - 100 <= contentement && content > contentement) { prix += 5000; mention(4, 2); }
    else if (mecontent <= contentement && content - 100 > contentement) mention(4, 3);
    else if (mecontent - 200 <= contentement && mecontent > contentement) mention(4, 4);
    else if (mecontent - 200 > contentement) mention(4, 5);
  }
  return prix | 0;
});

// =====================================================================================================
// 0x7C36D — l'écran du détail de l'année (le bilan), et la vente du parc.
//
// Une boucle d'affichage, une image par tour, jusqu'au clic sur le bouton de sortie. À chaque tour :
// l'écran est effacé, la fenêtre 0x19 tracée (0x35F21, sur la surface de dessin, qui tient lieu de
// fond le temps de l'appel ; le mot 0xD6608 est remis ensuite), puis 0x3D72B, un cadre (0x3E149) et
// les lignes du bilan, d'après la table 0xBEC0B (fiches de 9 octets, jusqu'à un premier octet négatif) :
//   +0 octet signé  le numéro du texte (table de pointeurs [0xD7BC0])
//   +1 mot          x ; +3 mot, la ligne (y = ligne × (octet 0xD7765 + 6) + 0x40) ; +5 et +7 mots, les x
//                   des deux colonnes de chiffres
// Fiche 0, le titre, centré (0x3F377) ; 1 et 2, deux intitulés (0x3F336) ; 3 à 12, un intitulé et deux
// montants (0x56E7E, en deux tampons de 0x50 octets : l'année écoulée, puis la précédente, notée au
// changement d'année par finirLAnnee dans les comptes +694 à +6B4) :
//    3 VALEUR DU PARC (+19 du parc ; +694), 4 VALEUR DES ACTIONS (le cours, +66 du parc ; +698),
//    5 SOLDE (+0A et +16 de la fiche), 6 PRET (+12 de la fiche ; +69C), 7 PRET MAXIMUM (actions ×
//    cours + 50 000, au multiple de 50 000 supérieur ; +6A0), 8 RECETTES (somme des douze mois, +492
//    des comptes ; +6A4), 9 DEPENSES (+526 ; +6A8), 10 DIVIDENDES ENCAISSES (+684 ; +6AC),
//    11 DIVIDENDES PAYES (+688 ; +6B0), 12 IMPOTS LOCAUX (+68C, 0 si le terrain est acheté ; +6B4).
// Le titre est « DETAILS DE FIN D'ANNEE », les colonnes « CETTE ANNEE » et « AN DERNIER ».
// Fiche 13, le bouton de sortie en (544, 300), 48 × 30 : un clic ([0xDE5AC]) dessus joue le bruitage
// 0x19 et quitte. Anomalie reproduite : la fiche 13 passe ensuite par le dessin des montants avec les
// tampons de la fiche 12, à la ligne 300 (y = 300 × hauteur + 0x40, hors de l'écran).
//
// La vente du parc : si la mise à prix (2 × la valeur du parc, au millier inférieur) dépasse 50 000 et
// que la partie a passé 60 000 pas (cinq ans), une offre s'affiche, « CLIQUEZ ICI POUR VENDRE LE PARC »
// et la mise à prix, avec son cadre, en (0x34, 0x12C). Le test de l'acheteur (0x73EE8, qui rend −1
// s'il n'y en a pas) est `!= 0` : l'offre s'affiche même sans acheteur (anomalie reproduite ; le joueur
// courant, exclu, ne pouvant être rendu, 0x73EE8 ne rend jamais 0 dans une partie à un joueur). Un clic
// sur l'offre pose la question (0x78E36) « VOUS VOULEZ VRAIMENT VENDRE VOTRE PARC AUX ENCHERES ? »,
// avec « MISE A PRIX » ; oui : 0x7B65C(mise à prix), puis la vente aux enchères, 0x7B73E, qui rend le
// joueur acheteur (−1 : aucun). L'acheteur paie le prix ([0xDE1C4]) et rembourse son prêt,
// en revendant au besoin ses actions (0x4AAF1, action par action, tant que son solde est négatif) ; le
// joueur revend toutes les siennes, empoche prix − prêt + solde ([0xD6718]), et son pays est compté
// (octets 0xD66F8, 0xD671C) ; la fiche de son parc est recopiée sur celle du parc de l'acheteur, puis
// 0x2E9E8 et 0x19EEE ; prêt à zéro, solde = [0xD6718]. S'il ne reste aucun pays sans parc vendu, 0x5C04F(1,
// 0). Enfin 0x560D2 : selon sa réponse, retour à la carte du monde (écran 0, 0xD666E = 1, 0x40D79) ou
// écran 0x50.
export const detailDeLAnnee = dansLeCadre(0xF4, (jeu, cadre) => {
  const montant = cadre.local(0xE0), montantPrecedent = cadre.local(0x90);   // deux tampons de texte
  const TEXTES = 0xD7BC0;
  const texte = (n) => long(jeu, long(jeu, TEXTES) + n);
  const parc = () => long(jeu, PARC_COURANT), comptes = () => long(jeu, COMPTES_COURANTS);
  const leJoueur = () => long(jeu, FICHE_COURANTE);

  const valeur = Math.imul(idiv(long(jeu, parc() + 0x19) * 2, 1000), 1000);
  const hauteurDeLigne = octet(jeu, 0xD7765) + 6;
  jeu.appeler(0x116E4, long(jeu, 0xD3B84) + 6);
  const couleur = jeu.appeler(0x80250, long(jeu, 0xD3B8C), 0x38, 0x20, 0xE) & 0xFF;
  poserLong(jeu, 0xD380C, 0);
  poserOctet(jeu, 0xD777F, 0x30);

  for (;;) {
    const basseResolution = (octet(jeu, 0xDE5F6) & 1) !== 0;
    jeu.appeler(0x7F1A0, long(jeu, 0xDE5BC), 0, basseResolution ? 0xFA00 : 0x1E0 * 0x280);
    const fond = long(jeu, 0xD3B98);
    poserLong(jeu, 0xD3B98, long(jeu, 0xDE5BC));
    const ecran = octet(jeu, 0xD6608);
    jeu.appeler(0x35F21, 0x19);
    poserMot(jeu, 0xD6608, ecran);
    poserLong(jeu, 0xD3B98, fond);
    jeu.appeler(0x3D72B);
    const bordure = jeu.appeler(0x80250, long(jeu, 0xD3B8C), 0x40, 0x40, 0x2C) & 0xFF;
    const fondDuCadre = jeu.appeler(0x80250, long(jeu, 0xD3B8C), 0x38, 0x2A, 0x1A) & 0xFF;
    jeu.appeler(0x3E149, 0x28, 0x1C, 0x258, 0x154, fondDuCadre, bordure);

    for (let k = 0, fiche = 0xBEC0B; octetSigne(jeu, fiche) >= 0; k++, fiche += 9) {
      const intitule = texte(octetSigne(jeu, fiche) * 4);
      const x = motSigne(jeu, fiche + 1), colonne1 = motSigne(jeu, fiche + 5), colonne2 = motSigne(jeu, fiche + 7);
      const y = s16(Math.imul(mot(jeu, fiche + 3), hauteurDeLigne) + 0x40);
      const deuxMontants = (a, b) => {
        jeu.appeler(0x56E7E, montant, a, 10, 0);
        jeu.appeler(0x56E7E, montantPrecedent, b, 10, 0);
      };
      const douzeMois = (champ) => {
        let somme = 0;
        for (let mois = 0; mois < 12; mois++) somme = (somme + long(jeu, comptes() + champ + 4 * mois)) | 0;
        return somme;
      };
      switch (k) {
        case 0:
          jeu.appeler(0x7F652, montant, 0xB06FB, intitule);        // "%s"
          jeu.appeler(0x3F377, x, colonne1, y, montant, 0, couleur);
          continue;
        case 1: case 2:
          jeu.appeler(0x7F652, montant, 0xB06FB, intitule);
          jeu.appeler(0x3F336, colonne1, y, montant, 0, couleur);
          continue;
        case 3: deuxMontants(long(jeu, parc() + 0x19), long(jeu, comptes() + 0x694)); break;
        case 4: deuxMontants(long(jeu, parc() + 0x66), long(jeu, comptes() + 0x698)); break;
        case 5: deuxMontants(long(jeu, leJoueur() + 0x0A), long(jeu, leJoueur() + 0x16)); break;
        case 6: deuxMontants(long(jeu, leJoueur() + 0x12), long(jeu, comptes() + 0x69C)); break;
        case 7: {
          const bourse = Math.imul(idiv((Math.imul(mot(jeu, parc() + 0x62), long(jeu, parc() + 0x66)) + 50000) | 0, 50000) + 1, 50000);
          deuxMontants(bourse, long(jeu, comptes() + 0x6A0));
          break;
        }
        case 8: deuxMontants(douzeMois(0x492), long(jeu, comptes() + 0x6A4)); break;
        case 9: deuxMontants(douzeMois(0x526), long(jeu, comptes() + 0x6A8)); break;
        case 10: deuxMontants(long(jeu, comptes() + 0x684), long(jeu, comptes() + 0x6AC)); break;
        case 11: deuxMontants(long(jeu, comptes() + 0x688), long(jeu, comptes() + 0x6B0)); break;
        case 12: {
          const impots = octet(jeu, leJoueur() + 0x221) !== 0 ? 0 : long(jeu, comptes() + 0x68C);
          deuxMontants(impots, long(jeu, comptes() + 0x6B4));
          break;
        }
        case 13: {
          const sx = motSigne(jeu, 0xBECAC), sy = motSigne(jeu, 0xBECAE);
          if (mot(jeu, 0xDE5AC) !== 0 && sx >= mot(jeu, fiche + 1) && sx <= mot(jeu, fiche + 1) + 0x30
              && sy >= mot(jeu, fiche + 3) && sy < mot(jeu, fiche + 3) + 0x1E) {
            jeu.appeler(0x80C80, 0, 0x19);
            oublierLeClic(jeu);
            return;
          }
          break;
        }
        default: break;
      }
      if (octet(jeu, montant) !== 0) {
        jeu.appeler(0x3F49E, x, y, intitule, 0, couleur);
        jeu.appeler(0x3F336, colonne1, y, montant, 0, couleur);
        jeu.appeler(0x3F336, colonne2, y, montantPrecedent, 0, couleur);
      }
    }

    if (valeur > 50000 && u16(jeu.appeler(0x73EE8, valeur, -1)) !== 0 && long(jeu, PAS_DE_SIMULATION) > 60000) {
      if (offrirLaVente(jeu, montant, valeur, couleur)) return;
    }
    jeu.appeler(0x80BE4);
    jeu.appeler(0x1A706);
    presenterLImage(jeu);
  }
});

// Les quatre mots du clic de la souris remis à zéro (0xDE5A4, 0xDE5A6, 0xDE5AA, 0xDE5AC ; l'ordre de
// 0x7C36D, que finirLAnnee écrit dans l'autre sens).
function oublierLeClic(jeu) {
  for (const a of [0xDE5A4, 0xDE5A6, 0xDE5AA, 0xDE5AC]) poserMot(jeu, a, 0);
}

// Présenter l'image : 0x80210(400) en basse résolution, 0x55507 en haute.
function presenterLImage(jeu) {
  if (octet(jeu, 0xDE5F6) & 1) jeu.appeler(0x80210, 0x190);
  else jeu.appeler(0x55507);
}

// L'offre de vente du parc, dans l'écran du bilan (0x7CB5A à 0x7CF6E) ; rend vrai si le parc est vendu
// (l'écran se referme).
function offrirLaVente(jeu, texte, valeur, couleur) {
  const TEXTES = 0xD7BC0;
  jeu.appeler(0x7F652, texte, 0xB073D, long(jeu, long(jeu, TEXTES) + 0x16C), valeur);     // "%s %d"
  const largeur = jeu.appeler(0x3F677, texte);
  jeu.appeler(0x3F49E, 0x38, 0x130, texte, 0, couleur);
  jeu.appeler(0x3E149, 0x34, 0x12C, u16(0x38 + largeur), u16(octet(jeu, 0xD7765) + 0x132), octet(jeu, 0xD7781), octet(jeu, 0xD7770));
  const sx = motSigne(jeu, 0xBECAC), sy = motSigne(jeu, 0xBECAE);
  if (!(mot(jeu, 0xDE5AC) !== 0 && sx >= 0x34 && sx <= s16(largeur) + 0x38 && sy >= 0x12C && sy < octet(jeu, 0xD7765) + 0x132)) return false;

  jeu.appeler(0x7F652, texte, long(jeu, long(jeu, TEXTES) + 0x184), valeur);
  if (u16(jeu.appeler(0x78E36, long(jeu, long(jeu, TEXTES) + 0x188), texte)) !== 1) return false;
  jeu.appeler(0x7B65C, valeur);
  const acheteur = s16(jeu.appeler(0x7B73E));
  if (acheteur === -1) return false;

  // L'acheteur paie, et rembourse son prêt ; à découvert, il revend ses actions une à une.
  const a = long(jeu, FICHES) + acheteur * TAILLE_FICHE;
  ajouterAuLong(jeu, a + 0x0A, -long(jeu, 0xDE1C4));
  ajouterAuLong(jeu, a + 0x0A, -long(jeu, a + 0x12));
  for (let j = 0; j < NOMBRE_DE_FICHES && longSigne(jeu, a + 0x0A) < 0; j++) {
    if (octet(jeu, fiche(jeu, j)) === 0 || mot(jeu, a + 0xA3 + 2 * j) === 0) continue;
    const actions = mot(jeu, a + 0xA3 + 2 * j);
    for (let n = 0; n < actions && longSigne(jeu, a + 0x0A) < 0; n++) jeu.appeler(0x4AAF1, j, a);
  }
  // Le joueur revend toutes ses actions.
  for (let j = 0; j < NOMBRE_DE_FICHES; j++) {
    while (mot(jeu, long(jeu, FICHE_COURANTE) + 0xA3 + 2 * j) > 0) jeu.appeler(0x4AAF1, j, long(jeu, FICHE_COURANTE));
  }
  const f = long(jeu, FICHE_COURANTE);
  poserLong(jeu, 0xD6718, ((long(jeu, 0xDE1C4) - long(jeu, f + 0x12)) + long(jeu, f + 0x0A)) | 0);
  const pays = 0xD66F8 + octetSigne(jeu, f + 5);
  if (octet(jeu, pays) === 0) poserOctet(jeu, 0xD671C, octet(jeu, 0xD671C) + 1);
  poserOctet(jeu, pays, octet(jeu, pays) + 1);
  const source = PARCS + mot(jeu, f + 2) * TAILLE_PARC, destination = PARCS + mot(jeu, a + 2) * TAILLE_PARC;
  for (let k = 0; k < TAILLE_PARC; k += 4) poserLong(jeu, destination + k, long(jeu, source + k));   // rep movsd
  jeu.appeler(0x2E9E8);
  jeu.appeler(0x19EEE);
  poserLong(jeu, long(jeu, FICHE_COURANTE) + 0x12, 0);
  poserLong(jeu, long(jeu, FICHE_COURANTE) + 0x0A, long(jeu, 0xD6718));

  // Reste-t-il un pays où le joueur n'a pas vendu de parc ?
  let k = 0;
  while (octet(jeu, 0xB7B38 + k * 0x1C) !== 0 && octet(jeu, 0xD66F8 + k) !== 0) k = (k + 1) & 0xFF;
  if (octet(jeu, 0xB7B38 + k * 0x1C) === 0) jeu.appeler(0x5C04F, 1, 0);
  if (s8(jeu.appeler(0x560D2)) !== -1) {
    poserMot(jeu, 0xD6652, 0);
    poserMot(jeu, 0xD666E, 1);
    jeu.appeler(0x40D79);
  } else {
    poserMot(jeu, 0xD6652, 0x50);
  }
  return true;
}

// =====================================================================================================
// 0x7401C — la fin de l'année.
//
// Appelée par le pas de simulation (0x12B1F) quand le compteur de pas passe un multiple de 12 000,
// avec l'écran à montrer en premier : 0xE, les trophées (0 serait le classement détaillé). Dans
// l'ordre :
//  1. après douze ans (0x23280 pas), si le terrain n'est pas acheté (octet +221 de la fiche), l'offre
//     de l'acheter (0x78E36, « VOULEZ-VOUS RACHETER VOTRE TERRAIN POUR %d », au prix de l'impôt par
//     case du pays × 4 096 / 50) ; acheté, le prix passe au livre (catégorie 0x19, celle des impôts
//     locaux, que le joueur ne paiera plus) et un second message l'annonce (« %s ACHETE SON TERRAIN AU
//     PAYS SUIVANT: %s ») ;
//  2. un livre de comptes neuf (0x78B53), la bourse (0x729D8) ; si la partie est perdue (octet +636
//     des comptes à 2), la fonction s'arrête là ; sinon les impôts et l'inflation (0x51111), les
//     trophées (0x76FA3, qui rend la somme des prix), la palette de l'écran (data/mawpal-0.dat en
//     0xCEBE0) et les limites de la souris (0x11303) ;
//  3. de nouveaux concurrents : s'il y a moins de joueurs (hors la fiche 0) que l'octet 0xD66F0 (25
//     dans la partie de la démo), jusqu'à min(0xD66F0, 4) fiches vides reçoivent la sorte 7, et
//     0x6E7E6 les met en place : quatre concurrents de plus chaque année, jusqu'au compte ;
//  4. les six classements (voir etablirLesClassements), et le rang de chacun dans ses fiches ;
//  5. l'écran : une boucle d'affichage, une image par tour (voir la boucle plus bas), jusqu'à un clic
//     sur le bouton « continuer », ou 1 000 images sans que la souris bouge ;
//  6. la nouvelle année (voir nouvelleAnnee).
//
// Le cadre de l'original (0x21C octets de variables) est reproduit : les textes sont composés dans
// ses tampons ([ebp−0x14C], [ebp−0x1C4], [ebp−0xD4], [ebp−0xC0], [ebp−0xAC]), aux mêmes adresses.
// L'argument (l'écran) est un octet de la pile de l'appelant, que la fonction réécrit en changeant
// d'écran ; la réécriture l'y écrit aussi.
export const finirLAnnee = dansLeCadre(0x21C, (jeu, cadre, ecranDemande) => {
  const s = {
    ecran: ecranDemande & 0xFF,
    tampon: cadre.local(0x14C),            // le texte à écrire
    tamponDeLaBulle: cadre.local(0x1C4),   // le texte de la bulle d'un trophée
    distinctions: cadre.local(0xD4),       // trois textes de 20 octets (trophée à distinctions)
    // Ce que l'original relit sans l'avoir écrit : la position de la souris à l'image précédente
    // ([ebp−0x5C], [ebp−0x78]), au premier tour, et la table que lirait un élément de type 12 placé
    // avant tout autre ([ebp−0x88] ; les deux écrans n'en ont pas) — les restes de la pile à l'entrée.
    sourisX: mot(jeu, cadre.local(0x5C)),
    sourisY: mot(jeu, cadre.local(0x78)),
    table: long(jeu, cadre.local(0x88)),
    rang: 0, nombre: 0, inactivite: 0,
    bulle: 0, bulleX: 0, bulleY: 0, texteX: 0, texteDroite: 0, texteY: 0, texteBas: 0,
    tropheeDeLaBulle: 0, coupeDeLaBulle: 0,
  };
  const ecrireLEcran = (v) => { s.ecran = v; poserOctet(jeu, cadre.ebp + 0x14, v); };

  const sansCurseur = octet(jeu, 0xB1510) !== 0;
  const ecran6608 = octet(jeu, 0xD6608);
  poserOctet(jeu, 0xB9EDC, octet(jeu, 0xD6652));
  jeu.appeler(0x116E4, long(jeu, 0xD3B84));
  if (!sansCurseur) jeu.appeler(0x1171F);
  jeu.appeler(0x40D3E);

  if (long(jeu, PAS_DE_SIMULATION) >= 0x23280 && octet(jeu, long(jeu, FICHE_COURANTE) + 0x221) === 0) {
    proposerLAchatDuTerrain(jeu, s.tampon);
  }

  if (octet(jeu, 0xD7792) !== 0) jeu.appeler(0x49704);
  jeu.appeler(0x78B53);
  jeu.appeler(0x729D8);
  if (octet(jeu, 0xD7792) !== 0) jeu.appeler(0x49704);
  if (octet(jeu, long(jeu, COMPTES_COURANTS) + 0x636) === 2) {
    terminer(jeu);
    return;
  }
  jeu.appeler(0x51111);
  for (let k = 0; k < 9; k++) poserOctet(jeu, 0xB79FE + 8 * k, 0);
  const prixDesTrophees = jeu.appeler(0x76FA3);
  jeu.appeler(CHARGER_UN_FICHIER, 0xB81C3, 0xCEBE0);       // data/mawpal-0.dat : la palette
  poserOctet(jeu, 0xD7786, 0);
  jeu.appeler(0x11303, 0, 0x27E, 0, 0x1DE);

  ajouterDesConcurrents(jeu);
  if (octet(jeu, 0xD7792) !== 0) jeu.appeler(0x49704);
  s.nombre = etablirLesClassements(jeu);
  s.rang = s.nombre;       // le mot [ebp−0x44] au sortir du calcul des rangs
  s.couleurs = choisirLesCouleurs(jeu);

  // La boucle de l'écran. Deux entrées : le changement d'écran (fond, curseur), et le tour d'image.
  let changerDEcran = true;
  for (;;) {
    if (changerDEcran) {
      if (s.ecran === 0) {
        jeu.appeler(CHARGER_UN_FICHIER, 0xB8202, long(jeu, 0xD3B98));      // data/mawar0-0.dat
        jeu.appeler(0x55EFA, long(jeu, 0xD3B98), long(jeu, 0xDE5BC), 0x190);
      } else if (s.ecran === 0xE) {
        jeu.appeler(0x76F03);
      }
      jeu.appeler(0x116E4, long(jeu, 0xD3B84) + octet(jeu, 0xB52D8) * 6);
      changerDEcran = false;
    }
    jeu.appeler(0x2CCF8);
    dessinerLesElements(jeu, s);
    if (s.ecran === 0xE) {
      jeu.appeler(0x116E4, long(jeu, 0xD3B84) + octet(jeu, 0xB52D8) * 6);
      dessinerLesTrophees(jeu, s);
      dessinerLaBulle(jeu, s);
    }

    // Le clic : il ferme d'abord une bulle ouverte ; sinon, le bouton du haut (568 à 616, 328 à 358)
    // passe d'un écran à l'autre, celui du bas (360 à 390) termine.
    let finir = false;
    if (mot(jeu, 0xDE5A6) !== 0) {
      for (const a of [0xDE5AA, 0xDE5AC, 0xDE5A4, 0xDE5A6]) poserMot(jeu, a, 0);
      const sx = motSigne(jeu, 0xBECAC), sy = motSigne(jeu, 0xBECAE);
      if (s16(s.bulle) !== 0) {
        s.bulle = 0;
      } else if (sx >= 0x238 && sx <= 0x268) {
        if (sy >= 0x148 && sy <= 0x166) {
          jeu.appeler(0x80C80, 0, 0x1A);
          if (s.ecran === 0) {
            ecrireLEcran(0xE);
            jeu.appeler(0x76F03);
          } else {
            ecrireLEcran(0);
            changerDEcran = true;
            continue;
          }
        } else if (sy >= 0x168 && sy <= 0x186) {
          finir = true;
        }
      }
    }
    if (!finir) {
      // 1 000 images sans que la souris bouge terminent aussi l'écran. Anomalie reproduite : au premier
      // tour, la position « précédente » est un reste de la pile.
      if (s.sourisX === mot(jeu, 0xBECAC) && s.sourisY === mot(jeu, 0xBECAE)) {
        s.inactivite++;
        if (s16(s.inactivite) > 1000) finir = true;
      } else {
        s.sourisX = mot(jeu, 0xBECAC);
        s.sourisY = mot(jeu, 0xBECAE);
        s.inactivite = 0;
      }
    }
    if (finir) break;
    presenterLImage(jeu);
  }

  nouvelleAnnee(jeu, prixDesTrophees, s16(s.inactivite) <= 1000);
  if (!sansCurseur) jeu.appeler(0x11761);
  const comptes = long(jeu, COMPTES_COURANTS);
  if (octet(jeu, comptes + 0x636) === 1) {
    poserMot(jeu, 0xD6608, ecran6608);
    jeu.appeler(0x1B23A, 0x64);
  } else {
    poserMot(jeu, 0xD6652, mot(jeu, 0xD660E));
    poserMot(jeu, 0xD6608, ecran6608);
    jeu.appeler(0x1B23A, octet(jeu, 0xB9EDC));
  }
  poserOctet(jeu, long(jeu, COMPTES_COURANTS) + 0x5ED, 0);
  poserOctet(jeu, 0xB14D1, 0);
  jeu.appeler(0x2DF12, -1);
  terminer(jeu);
});

// La sortie commune de 0x7401C (0x76EE6).
function terminer(jeu) {
  jeu.appeler(0x40D79);
  jeu.appeler(0x55FCF);
  if (octet(jeu, 0xD7792) !== 0) jeu.appeler(0x49704);
}

// L'offre d'acheter le terrain (0x740DC à 0x741E3).
function proposerLAchatDuTerrain(jeu, tampon) {
  const texte = (n) => long(jeu, long(jeu, 0xD7BC0) + n);
  jeu.appeler(0x116E4, long(jeu, 0xD3B84) + 6);
  jeu.appeler(0x7C282, long(jeu, 0xD3B8C));
  const pays = () => octetSigne(jeu, long(jeu, FICHE_COURANTE) + 5) * 0x1C;
  jeu.appeler(0x7F652, tampon, texte(0x120), idiv(mot(jeu, 0xB7B47 + pays()) << 12, 50));
  if (u16(jeu.appeler(0x78E36, tampon, 0)) !== 1) return;
  poserOctet(jeu, long(jeu, FICHE_COURANTE) + 0x221, 1);
  jeu.appeler(INSCRIRE_AU_LIVRE, 0x19, idiv(-(mot(jeu, 0xB7B47 + pays()) << 12), 50));
  const nomDuPays = long(jeu, long(jeu, 0xD7B70) + octet(jeu, 0xB7B38 + pays()) * 4);
  const nom = jeu.appeler(0x4C50B, octet(jeu, JOUEUR_COURANT));
  jeu.appeler(0x7F652, tampon, texte(0x124), nom, nomDuPays);
  jeu.appeler(0x78E36, tampon, 0);
}

// De nouveaux concurrents (0x7428B à 0x74365) : on compte les fiches occupées, hors la fiche 0 ; s'il
// y en a moins que l'octet 0xD66F0, jusqu'à 4 fiches vides (autres que celle du joueur courant)
// reçoivent la sorte 7, et 0x6E7E6 les met en place s'il y en a eu.
function ajouterDesConcurrents(jeu) {
  let occupees = 0;
  for (let k = 1; k < NOMBRE_DE_FICHES; k++) if (octet(jeu, fiche(jeu, k)) !== 0) occupees++;
  if (occupees >= octet(jeu, 0xD66F0)) return;
  let aAjouter = Math.min(octet(jeu, 0xD66F0), 4);
  const prevus = aAjouter;
  for (let k = 1; k < NOMBRE_DE_FICHES && aAjouter !== 0; k++) {
    const f = fiche(jeu, k);
    if (octet(jeu, f) !== 0 || k === mot(jeu, JOUEUR_COURANT)) continue;
    poserOctet(jeu, f, 7);
    aAjouter--;
  }
  if (aAjouter !== prevus) jeu.appeler(0x6E7E6);
}

// --- Les classements ---------------------------------------------------------------------------------
//
// Sept tables de 25 fiches de 5 octets, collées de 0xDE1E0 à 0xDE54B ; chaque fiche est un champ de bits :
// les 27 bits bas du mot long +0, une valeur (signée) ; les 5 bits bas de l'octet +4, un joueur ; les
// autres bits sont gardés. Chacune est triée par 0x811AA (le tri rapide de la bibliothèque C) avec la
// fonction de comparaison 0x3F296, qui rend valeur(b) − valeur(a) : par valeur décroissante.
const CLASSEMENT_GENERAL = 0xDE1E0;
// Les six catégories (leurs intitulés à l'écran 0, textes 252 à 257 de [0xD7BD0]), leur table, l'octet
// de la fiche qui reçoit le rang, et la valeur classée :
//   0xDE4CE +97  « LE PLUS RICHE » : solde − prêt + la valeur des actions détenues (× cours) ;
//   0xDE451 +9A  « LE PLUS GRAND » : 16 × attractions (+82) + 8 × boutiques (+E0) + 2 × mot +33 +
//                visiteurs (mot signé +1F) + octet +48 ;
//   0xDE3D4 +98  « LE PLUS AMUSANT » : délai d'animation moyen (+92) × attractions + mot long +8A +
//                4 × mot signé +D4 ;
//   0xDE357 +9B  « INSTALLATIONS » : 8 × boutiques + mot +C2 + 8 × octet +83 ;
//   0xDE2DA +99  « LE PLUS AGREABLE » : −2 × mot signé +80 − usure moyenne (+97) + 8 × mot signé +CC +
//                64 × mot +7E + mot +7C + mot long +37 / 64, plus, si l'octet +83 n'est pas nul,
//                4 × (20 − mot long +84 / octet +83) ;
//   0xDE25D +9C  « SATISFACTION » : le contentement cumulé des visiteurs partis (+43).
// (Les champs du parc dont le sens n'est pas établi sont donnés par leur place.)
const CATEGORIES = [
  { table: 0xDE4CE, rang: 0x97 }, { table: 0xDE451, rang: 0x9A }, { table: 0xDE3D4, rang: 0x98 },
  { table: 0xDE357, rang: 0x9B }, { table: 0xDE2DA, rang: 0x99 }, { table: 0xDE25D, rang: 0x9C },
];
const TRIER = 0x811AA, COMPARER_LES_VALEURS = 0x3F296;
const joueurDe = (jeu, fiche5) => octet(jeu, fiche5 + 4) & 0x1F;
function poserLeJoueur(jeu, fiche5, joueur) {
  poserOctet(jeu, fiche5 + 4, (octet(jeu, fiche5 + 4) & 0xE0) | (joueur & 0x1F));
}
function poserLaValeur(jeu, fiche5, valeur) {
  poserLong(jeu, fiche5, (long(jeu, fiche5) & 0xF8000000) | (valeur & 0x7FFFFFF));
}

// 0x74378 à 0x74A11 : remplir les six tables, les trier, puis donner à chaque joueur son rang dans
// chaque catégorie (octets +97 à +9C) et, en +95, la somme de ses rangs. Rend le nombre de joueurs.
function etablirLesClassements(jeu) {
  let nombre = 0;
  for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
    const f = fiche(jeu, k);
    poserMot(jeu, f + 0x95, 0);
    if (octet(jeu, f) === 0) continue;
    const parc = parcDeLaFiche(jeu, f);
    let actions = 0;
    for (let j = 0; j < NOMBRE_DE_FICHES; j++) {
      actions = (actions + Math.imul(mot(jeu, f + 0xA3 + 2 * j), long(jeu, parcDeLaFiche(jeu, fiche(jeu, j)) + 0x66))) | 0;
    }
    const r = 5 * u16(nombre);
    const [fortune, leParc, attractions, boutiques, personnel, dernier] = CATEGORIES.map((c) => c.table + r);
    poserLeJoueur(jeu, fortune, k);
    poserLaValeur(jeu, fortune, long(jeu, f + 0x0A) - long(jeu, f + 0x12) + actions);
    poserLeJoueur(jeu, leParc, k);
    poserLaValeur(jeu, leParc, (octet(jeu, parc + 0x82) << 4) + (octet(jeu, parc + 0xE0) << 3)
      + mot(jeu, parc + 0x33) * 2 + motSigne(jeu, parc + 0x1F) + octet(jeu, parc + 0x48));
    poserLeJoueur(jeu, attractions, k);
    poserLaValeur(jeu, attractions, octet(jeu, parc + 0x92) * octet(jeu, parc + 0x82) + long(jeu, parc + 0x8A)
      + (motSigne(jeu, parc + 0xD4) << 2));
    poserLeJoueur(jeu, boutiques, k);
    poserLaValeur(jeu, boutiques, (octet(jeu, parc + 0xE0) << 3) + mot(jeu, parc + 0xC2) + (octet(jeu, parc + 0x83) << 3));
    poserLeJoueur(jeu, personnel, k);
    poserLaValeur(jeu, personnel, -2 * motSigne(jeu, parc + 0x80) - long(jeu, parc + 0x97) + (motSigne(jeu, parc + 0xCC) << 3)
      + (mot(jeu, parc + 0x7E) << 6) + mot(jeu, parc + 0x7C) + (long(jeu, parc + 0x37) >>> 6));
    if (octet(jeu, parc + 0x83) !== 0) {
      const precedente = (long(jeu, personnel) << 5) >> 5;
      const parEmploye = Math.floor(long(jeu, parc + 0x84) / octet(jeu, parc + 0x83));
      poserLaValeur(jeu, personnel, ((0x14 - parEmploye) << 2) + precedente);
    }
    poserLeJoueur(jeu, dernier, k);
    nombre++;
    poserLaValeur(jeu, dernier, long(jeu, parc + 0x43));
  }

  for (const c of CATEGORIES) jeu.appeler(TRIER, c.table, u16(nombre), 5, COMPARER_LES_VALEURS);

  for (let r = 0; r < u16(nombre); r++) {
    for (const c of CATEGORIES) ajouterAuMot(jeu, fiche(jeu, joueurDe(jeu, c.table + 5 * r)) + 0x95, r);
    for (const c of CATEGORIES) poserOctet(jeu, fiche(jeu, joueurDe(jeu, c.table + 5 * r)) + c.rang, r);
  }
  return nombre;
}

// Les couleurs de l'écran, cherchées dans sa palette (0x80250(palette, rouge, vert, bleu), composantes
// de 0 à 63), dans l'ordre de l'original.
function choisirLesCouleurs(jeu) {
  jeu.appeler(0x7C282, 0xCEBE0);
  const couleur = (r, v, b) => jeu.appeler(0x80250, 0xCEBE0, r, v, b) & 0xFF;
  const c = {};
  c.brunFonce = couleur(0x19, 0xF, 0);         // [ebp−0x10]
  c.blanc = couleur(0x3F, 0x3F, 0x3F);         // [ebp−0x20]
  c.brun = couleur(0x19, 0x11, 0);             // [ebp−8]
  c.or = couleur(0x2D, 0x23, 0);               // [ebp−0xC]
  c.noir = couleur(0, 0, 0);                   // [ebp−0x18]
  c.rouge = couleur(0x3F, 0, 0);               // [ebp−0x1C]
  c.gris = couleur(0x2B, 0x2D, 0x2F);          // [ebp−0x14]
  c.grisClair = couleur(0x34, 0x38, 0x3C);     // [ebp−4]
  return c;
}

// --- La page ---------------------------------------------------------------------------------------------
//
// Les éléments de chaque écran : la table 0xBE440, fiches de 11 octets, de l'écran (0 ou 0xE) jusqu'à
// un type nul : +0 le type, +1 x, +3 y, +5 une largeur, +9 un numéro de texte (mots signés).
//   écran 0 (le classement par catégorie), fiches 0 à 12 : le titre (type 1), et six colonnes (types
//     4 à 9, une par catégorie) sous leur intitulé (type 3, textes 252 à 257) ;
//   écran 0xE (les trophées), fiches 14 à 17 : le titre (type 2, « CLASSEMENT '2000 » : le format
//     [[0xD7B94]] avec l'année 1994 + pas / 12 000), le classement général (type 11), et deux éléments
//     de type 12.
const ELEMENTS = 0xBE440, TAILLE_ELEMENT = 11;

function dessinerLesElements(jeu, s) {
  const c = s.couleurs, tampon = s.tampon;
  const annee = ((long(jeu, PAS_DE_SIMULATION) / PAS_PAR_AN) >>> 0) + 1994;
  const nomDuJoueur = (j) => jeu.appeler(0x4C50B, j);
  const couleurDuJoueur = (j, humain, autre) => {
    const sorte = octet(jeu, fiche(jeu, j));
    return sorte === 1 || sorte === 6 ? humain : autre;
  };
  for (let e = s.ecran; ; e++) {
    const el = ELEMENTS + u16(e) * TAILLE_ELEMENT;
    const type = octet(jeu, el);
    if (type === 0) break;
    const x = motSigne(jeu, el + 1);
    switch (type) {
      case 1: case 2: {
        // Le titre, avec l'année : le fond est d'abord remis sur la surface de dessin.
        jeu.appeler(0x55EFA, long(jeu, 0xD3B98), long(jeu, 0xDE5BC), 0x190);
        const titres = long(jeu, 0xD7B94);
        jeu.appeler(0x7F652, tampon, long(jeu, titres), long(jeu, titres + (type === 1 ? 8 : 4)), annee);
        if (type === 1) jeu.appeler(0x3F377, x, motSigne(jeu, el + 5), motSigne(jeu, el + 3), tampon, 0, c.or);
        else jeu.appeler(0x3F377, 0, 0x280, 0x2E, tampon, 0, c.brunFonce);
        break;
      }
      case 3:
        jeu.appeler(0x3F377, x, motSigne(jeu, el + 5), motSigne(jeu, el + 3),
          long(jeu, long(jeu, 0xD7BD0) + mot(jeu, el + 9) * 4), 0, c.brun);
        break;
      case 4: case 5: case 6: case 7: case 8: case 9: {
        // Une colonne : cinq joueurs autour du joueur courant, avec leur rang.
        s.table = [0xDE4CE, 0xDE25D, 0xDE3D4, 0xDE451, 0xDE357, 0xDE2DA][type - 4];
        let y = mot(jeu, el + 3);
        for (s.rang = 0; s.rang < u16(s.nombre); s.rang = u16(s.rang + 1)) {
          if (joueurDe(jeu, s.table + 5 * s.rang) !== octet(jeu, JOUEUR_COURANT)) continue;
          const [debut, fin] = fenetre(s.rang - 2, 5, s.nombre);
          for (let i = debut; s16(i) < fin; i++) {
            const j = joueurDe(jeu, s.table + 5 * s16(i));
            const couleur = couleurDuJoueur(j, c.or, c.brun);
            jeu.appeler(0x7F652, tampon, 0xB06E8, s16(i) + 1, nomDuJoueur(j));      // "%d.%s"
            jeu.appeler(0x3F49E, x, s16(y), tampon, 0, couleur);
            y = u16(y + octet(jeu, 0xD7765) + 8);
          }
        }
        break;
      }
      case 11: {
        // Le classement général : les joueurs rangés par la somme de leurs rangs (+95). Les dix premiers,
        // puis, s'il est plus loin, le joueur dont le parc est l'octet +41 des comptes, en y = 324 ; et
        // chacun reçoit en +95 sa place (1 le premier) — à chaque image.
        s.table = CLASSEMENT_GENERAL;
        s.nombre = 0;
        for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
          const f = fiche(jeu, k);
          if (octet(jeu, f) === 0) continue;
          const r = s.table + 5 * u16(s.nombre);
          poserLeJoueur(jeu, r, k);
          s.nombre++;
          poserLaValeur(jeu, r, -mot(jeu, f + 0x95));
        }
        jeu.appeler(TRIER, s.table, u16(s.nombre), 5, COMPARER_LES_VALEURS);
        let y = mot(jeu, el + 3);
        for (s.rang = 0; s.rang < u16(s.nombre); s.rang = u16(s.rang + 1)) {
          const j = joueurDe(jeu, s.table + 5 * s.rang);
          if (s.rang < 10) {
            const couleur = couleurDuJoueur(j, c.blanc, c.or);
            jeu.appeler(0x7F652, tampon, 0xB06EE, s.rang + 1, nomDuJoueur(j));     // "%d) %s"
            jeu.appeler(0x3F49E, x, s16(y), tampon, 0, couleur);
            y = u16(y + 0x14);
          } else if (mot(jeu, fiche(jeu, j) + 2) === octet(jeu, 0xD447D + mot(jeu, JOUEUR_COURANT) * 0x6C2)) {
            jeu.appeler(0x7F652, tampon, 0xB06EE, s.rang + 1, nomDuJoueur(j));
            jeu.appeler(0x3F49E, x, 0x144, tampon, 0, c.brun);
          }
          poserMot(jeu, fiche(jeu, joueurDe(jeu, s.table + 5 * s.rang)) + 0x95, s.rang + 1);
        }
        break;
      }
      case 12: {
        // Le joueur courant et son voisin, dans la dernière table dessinée. Anomalie reproduite : le
        // compteur ([ebp−0x44]) n'est pas remis à zéro ; après le classement général (type 11), il vaut
        // déjà le nombre de joueurs, et rien n'est dessiné.
        let y = mot(jeu, el + 3);
        for (; s.rang < u16(s.nombre); s.rang = u16(s.rang + 1)) {
          if (joueurDe(jeu, s.table + 5 * s.rang) !== octet(jeu, JOUEUR_COURANT)) continue;
          const [debut, fin] = fenetre(s.rang - 1, 1, s.nombre);
          for (let i = debut; s16(i) < fin; i++) {
            const j = joueurDe(jeu, s.table + 5 * s16(i));
            const couleur = couleurDuJoueur(j, c.or, c.brun);
            jeu.appeler(0x7F652, tampon, 0xB06EE, s16(i) + 1, nomDuJoueur(j));
            jeu.appeler(0x3F49E, x, s16(y), tampon, 0, couleur);
            y = u16(y + octet(jeu, 0xD7765) + 0xC);
          }
        }
        break;
      }
      default: break;      // 10, et au-delà de 12 : rien
    }
  }
}

// Les rangs à montrer autour d'un joueur : de `debut` (0 au moins) à `debut + largeur`, ramenés dans la
// table (les cinq derniers) s'ils la dépassent. Rend [début (mot), fin (mot non signé)].
function fenetre(debut, largeur, nombre) {
  let d = u16(debut);
  if (s16(d) < 0) d = 0;
  let f = u16(d + largeur);
  if (f > u16(nombre)) {
    f = u16(nombre);
    d = f - 5 < 0 ? 0 : f - 5;
  }
  return [d, f];
}

// --- Les trophées ------------------------------------------------------------------------------------
//
// Chaque trophée décerné (octet +1 non nul, voir decernerLesTrophees) est dessiné (0x20F4C(x, y,
// image, 0), images de la table [0xD3B24], six octets chacune : +4 largeur, +5 hauteur). Le survoler
// change le pointeur (0x116E4, image 0xB52D9 au lieu de 0xB52D8, vraisemblablement) ; un clic ouvre sa
// bulle (bruitage 0x1A), si aucune ne l'est.
//   forme 1, cinq mentions : la coupe, sa plaque (+0x42 ; +0x48 pour la mention 5), et pour les
//     mentions 1 à 3 un ornement (+0x3C, +0x30, +0x36) ; la bulle 1, avec « trophée mention » et
//     l'image de la coupe (0x14 pour la mention 1, 0x12 pour 2, 0x13 pour 3) ;
//   forme 2, décerné : la bulle 2, son nom ;
//   forme 3, à distinctions : un ornement par bit (1 : +0x4E, 2 : +0x54, 4 : +0x5A) et un texte par
//     bit (textes 6, 7, 9) ; la bulle 3 énumère les distinctions (texte 8 entre elles).
function dessinerLesTrophees(jeu, s) {
  const images = () => long(jeu, 0xD3B24);
  const dessiner = (x, y, image) => jeu.appeler(0x20F4C, u16(x), u16(y), image, 0);
  const noms = () => long(jeu, 0xD7BB8);
  for (let k = 0; k < 9; k++) {
    const t = 0xB79FD + 8 * k;
    const mention = octet(jeu, t + 1);
    if (mention === 0) continue;
    const forme = octet(jeu, t + 2);
    const x = mot(jeu, t + 3), y = mot(jeu, t + 5);
    const coupe = () => images() + octet(jeu, t) * 6;
    const survole = () => {
      const sx = motSigne(jeu, 0xBECAC), sy = motSigne(jeu, 0xBECAE);
      return sx > x && sx < x + octet(jeu, coupe() + 4) && sy > y && sy < y + octet(jeu, coupe() + 5);
    };
    const peutOuvrir = () => {
      jeu.appeler(0x116E4, long(jeu, 0xD3B84) + octet(jeu, 0xB52D9) * 6);
      return mot(jeu, 0xDE5A6) !== 0 && s16(s.bulle) === 0;
    };
    const oublierLeClicDuTrophee = () => { for (const a of [0xDE5AA, 0xDE5AC, 0xDE5A4, 0xDE5A6]) poserMot(jeu, a, 0); };
    const nom = (n) => long(jeu, noms() + n * 4);

    if (forme === 1) {
      if (mention >= 1 && mention <= 5) {
        dessiner(x, y, coupe());
        dessiner(x + 0xA, y + 0xC, images() + (mention === 5 ? 0x48 : 0x42));
        if (mention <= 3) dessiner(x + 0x20, y + 0x26, images() + [0x3C, 0x30, 0x36][mention - 1]);
      }
      if (survole() && peutOuvrir()) {
        jeu.appeler(0x80C80, 0, 0x1A);
        s.bulleX = 0x8A; s.bulleY = 0x16; s.bulle = 1;
        jeu.appeler(0x7F652, s.tamponDeLaBulle, 0xB06F5, nom(octet(jeu, t + 7)),
          long(jeu, long(jeu, 0xD7BB4) + mention * 4));                                  // "%s %s"
        s.texteX = 0xCA; s.texteDroite = 0x1B8; s.texteY = 0x52; s.texteBas = 0x100;
        s.tropheeDeLaBulle = k;
        s.coupeDeLaBulle = 0;
        if (mention === 1) s.coupeDeLaBulle = 0x14;
        else if (mention === 2) s.coupeDeLaBulle = 0x12;
        else if (mention === 3) s.coupeDeLaBulle = 0x13;
        oublierLeClicDuTrophee();
      }
    } else if (forme === 2) {
      dessiner(x, y, coupe());
      if (survole() && peutOuvrir()) {
        jeu.appeler(0x80C80, 0, 0x1A);
        ouvrirUneBulleCentree(jeu, s, 2);
        jeu.appeler(0x7F652, s.tamponDeLaBulle, 0xB06FB, nom(octet(jeu, t + 7)));       // "%s"
        placerLeTexteDeLaBulle(jeu, s, 0x20);
        s.tropheeDeLaBulle = k;
        oublierLeClicDuTrophee();
      }
    } else if (forme === 3) {
      let textes = 0;
      dessiner(x, y, coupe());
      const distinction = (bit, dx, dy, image, texte) => {
        if (!(octet(jeu, t + 1) & bit)) return;
        dessiner(x + dx, y + dy, images() + image);
        jeu.appeler(0x7F652, s.distinctions + textes * 0x14, 0xB06FB, nom(texte));
        textes = (textes + 1) & 0xFF;
      };
      distinction(1, 0x1E, 0x32, 0x4E, 6);
      distinction(2, 0xE, 0x30, 0x54, 7);
      distinction(4, 0x2E, 0x30, 0x5A, 9);
      if (survole() && peutOuvrir()) {
        jeu.appeler(0x80C80, 0, 0x1A);
        ouvrirUneBulleCentree(jeu, s, 3);
        const n = octet(jeu, t + 7);
        const [d1, d2, d3] = [s.distinctions, s.distinctions + 0x14, s.distinctions + 0x28];
        if (textes === 1) jeu.appeler(0x7F652, s.tamponDeLaBulle, 0xB06FE, nom(n), d1, nom(n + 1));
        if (textes === 2) jeu.appeler(0x7F652, s.tamponDeLaBulle, 0xB0707, nom(n), d1, nom(8), d2, nom(n + 1));
        if (textes === 3) jeu.appeler(0x7F652, s.tamponDeLaBulle, 0xB0716, nom(n), d1, d2, nom(8), d3, nom(n + 1));
        placerLeTexteDeLaBulle(jeu, s, 0x18);
        s.tropheeDeLaBulle = k;
        oublierLeClicDuTrophee();
      }
    }
  }
}

// Une bulle centrée (formes 2 et 3) : sa largeur est celle des images +0x64 et +0x6A.
function ouvrirUneBulleCentree(jeu, s, bulle) {
  const images = long(jeu, 0xD3B24);
  s.bulleX = idiv(0x280 - octet(jeu, images + 0x64) - octet(jeu, images + 0x6A), 2);
  s.bulleY = 0xFA;
  s.bulle = bulle;
}

function placerLeTexteDeLaBulle(jeu, s, marge) {
  const images = long(jeu, 0xD3B24);
  s.texteX = s.bulleX + 0x20;
  s.texteDroite = s.bulleX + octet(jeu, images + 0x64) + octet(jeu, images + 0x6A) - 0x20;
  s.texteY = s.bulleY + marge;
  s.texteBas = octet(jeu, images + 0x65) + s.bulleY - 0x14;
}

// La bulle ouverte (0x76092 à 0x76643) : un cadre d'images, et le texte (0x40BBC(x, y, droite, bas,
// texte, couleur, 1)).
function dessinerLaBulle(jeu, s) {
  const c = s.couleurs;
  const images = () => long(jeu, 0xD3B24);
  const dessiner = (x, y, image) => jeu.appeler(0x20F4C, u16(x), u16(y), images() + image, 0);
  const img = (d) => octet(jeu, images() + d);
  const texte = (couleur) => jeu.appeler(0x40BBC, u16(s.texteX), u16(s.texteY), u16(s.texteDroite), u16(s.texteBas),
    s.tamponDeLaBulle, couleur, 1);
  const bulle = s16(s.bulle);
  if (bulle === 1) {
    // Le grand cadre, 0x14C × 0x14A : quatre coins (+0x7E) et cinq morceaux par côté.
    jeu.appeler(0x116E4, long(jeu, 0xD3B84) + octet(jeu, 0xB52D8) * 6);
    dessiner(s.bulleX, s.bulleY, 0x7E);
    for (let i = 0; i < 5; i++) dessiner(img(0x82) + s.bulleX + img(0x88) * i, s.bulleY, 0x84);
    dessiner(s.bulleX + 0x14C, s.bulleY, 0x7E);
    for (let i = 0; i < 5; i++) dessiner(s.bulleX + 0x14C, img(0x83) + s.bulleY + img(0x8F) * i, 0x8A);
    dessiner(s.bulleX + 0x14C, s.bulleY + 0x14A, 0x7E);
    for (let i = 0; i < 5; i++) dessiner(img(0x82) + s.bulleX + img(0x94) * i, s.bulleY + 0x14A, 0x90);
    dessiner(s.bulleX, s.bulleY + 0x14A, 0x7E);
    for (let i = 0; i < 5; i++) dessiner(s.bulleX, img(0x83) + s.bulleY + img(0x9B) * i, 0x96);
    // Le fond, et des filets (0x1188C(x, y, largeur, hauteur, couleur), mots signés).
    const rect = (x, y, l, h, couleur) => jeu.appeler(0x1188C, s16(x), s16(y), s16(l), s16(h), couleur);
    rect(img(0x82) + s.bulleX + 2, img(0x83) + s.bulleY + 2, 0x14C - img(0x82) - 2, 0x14A - img(0x83) - 2, s.couleurs.grisClair);
    rect(0xB6, 0x3E, 0x114, 4, c.gris);
    rect(0xB6, 0x42, 4, 0x10E, c.gris);
    rect(0x1C6, 0x42, 4, 0x10E, c.gris);
    rect(0xB6, 0x150, 0x114, 4, c.gris);
    rect(img(0x82) + s.bulleX, img(0x83) + s.bulleY, 0x14C - img(0x82), 2, c.gris);
    rect(img(0x82) + s.bulleX, img(0x83) + s.bulleY, 2, 0x14A - img(0x83), c.gris);
    jeu.appeler(0x20F4C, u16(s.bulleX + 0xEE), u16(s.bulleY + 0xF6), images() + s16(s.coupeDeLaBulle) * 6, 0);
    texte(octet(jeu, 0xB79FE + s16(s.tropheeDeLaBulle) * 8) === 5 ? c.rouge : c.noir);
  } else if (bulle === 3 || bulle === 2) {
    jeu.appeler(0x116E4, long(jeu, 0xD3B84) + octet(jeu, 0xB52D8) * 6);
    dessiner(s.bulleX, s.bulleY, 0x60);
    dessiner(img(0x64) + s.bulleX, s.bulleY, 0x66);
    texte(c.brun);
  }
}

// --- La nouvelle année (0x767AC à 0x76E5A) ------------------------------------------------------------
//
//  - Pour chaque parc : les compteurs de l'année sont remis à zéro, l'ancien gardé (+23 → +27, +2B →
//    +2F, +33 → +35 ; +43, +37, +3F à zéro) ; pour un concurrent (sorte autre que 1), à partir de la
//    deuxième année, les mots +7C et +7E grandissent au hasard (hasard(4 × année), puis hasard(année) / 2).
//  - Le prix des trophées au livre (catégorie 0xF), les suites du classement (0x73347), le cours des
//    actions (0x4ADE6, au niveau 2 : octet 0xD66F1), le retour des images du parc (data/mspr-0.dat et
//    .tab, 0x1180E, 0x10C80), 0x7C32D ; le bilan (0x7C36D), sauf si l'écran s'est fermé seul.
//  - Les chiffres de l'année écoulée sont notés dans les comptes, pour le bilan de l'an prochain :
//    +694 valeur du parc, +698 cours, +69C prêt, +6A0 prêt maximum, +6A4 et +6A8 recettes et
//    dépenses, +6AC et +6B0 dividendes, +6B4 impôts locaux ; +6B8 et +6BC remis à zéro. Anomalie
//    reproduite (condition inversée par rapport au bilan) : les impôts notés sont ceux de l'année si
//    le terrain est acheté, 0 sinon.
//  - Les nouveautés (sauf si l'écran s'est fermé seul, et sauf au niveau 2) : chaque genre
//    d'attraction (catalogue 0xCCED0) puis de boutique (0xD3C62) qui devient disponible cette année
//    (année de sortie, mot +AA ou +64, divisée par 6, ou par 3 si l'octet 0xD66F1 n'est pas nul) et n'a
//    pas encore été annoncé (bit 1 de l'octet +C5 ou +66), ou dont l'annonce est demandée (bit 2), est
//    annoncé dans la fenêtre 0x12 (0x35F21 ; le genre en 0xD6610, la sorte en 0xD6614 : 4 ou 0xA),
//    qu'on fait tourner (0x1107F, 0x3A8EF, une image) tant que l'écran est 0x48.
//  - La suite : l'octet 0xD441F + 6 × joueur à 0x34, 0x2CCF8 jusqu'à ce que l'octet 0xD7786 rattrape
//    0xD7792, 0x81590 ou 0x815B8, 0x55FCF, une image.
function nouvelleAnnee(jeu, prixDesTrophees, aSuivre) {
  const annee = (long(jeu, PAS_DE_SIMULATION) / PAS_PAR_AN) >>> 0;
  for (let f = long(jeu, FICHES); f >>> 0 < long(jeu, FIN_DES_FICHES); f += TAILLE_FICHE) {
    if (octet(jeu, f) === 0) continue;
    const parc = parcDeLaFiche(jeu, f);
    poserLong(jeu, parc + 0x27, long(jeu, parc + 0x23));
    poserLong(jeu, parc + 0x23, 0);
    poserLong(jeu, parc + 0x2F, long(jeu, parc + 0x2B));
    poserLong(jeu, parc + 0x2B, 0);
    poserLong(jeu, parc + 0x43, 0);
    poserMot(jeu, parc + 0x35, mot(jeu, parc + 0x33));
    poserMot(jeu, parc + 0x33, 0);
    poserLong(jeu, parc + 0x37, 0);
    poserLong(jeu, parc + 0x3F, 0);
    if (octet(jeu, f) === 1 || annee === 0) continue;
    const a = imod(u16(jeu.appeler(HASARD)), annee << 2);
    poserMot(jeu, parc + 0x7C, mot(jeu, parc + 0x7C) + a);
    const b = idiv(imod(u16(jeu.appeler(HASARD)), annee), 2);
    poserMot(jeu, parc + 0x7E, mot(jeu, parc + 0x7E) + b);
  }

  jeu.appeler(INSCRIRE_AU_LIVRE, 0xF, prixDesTrophees);
  jeu.appeler(0x73347);
  if (octet(jeu, 0xD66F1) === 2) jeu.appeler(0x4ADE6);
  jeu.appeler(0x1180E, 0xB0BBB, long(jeu, 0xD3BA8), long(jeu, 0xD35A0));       // data/mspr-0.dat
  jeu.appeler(CHARGER_UN_FICHIER, 0xB0C0A, long(jeu, 0xD3BB8));                 // data/mspr-0.tab
  jeu.appeler(RELOGER_LES_SPRITES, long(jeu, 0xD3BB8), long(jeu, 0xD3B88), long(jeu, 0xD3BA8));
  jeu.appeler(0x7C32D);
  if (aSuivre) jeu.appeler(0x7C36D);

  const comptes = () => long(jeu, COMPTES_COURANTS);
  const parc = () => long(jeu, PARC_COURANT);
  poserLong(jeu, comptes() + 0x6B8, 0);
  poserLong(jeu, comptes() + 0x6BC, 0);
  poserLong(jeu, comptes() + 0x694, long(jeu, parc() + 0x19));
  poserLong(jeu, comptes() + 0x698, long(jeu, parc() + 0x66));
  poserLong(jeu, comptes() + 0x69C, long(jeu, long(jeu, FICHE_COURANTE) + 0x12));
  poserLong(jeu, comptes() + 0x6A0,
    Math.imul(idiv((Math.imul(long(jeu, parc() + 0x66), mot(jeu, parc() + 0x62)) + 50000) | 0, 50000) + 1, 50000));
  poserLong(jeu, comptes() + 0x6A8, 0);
  poserLong(jeu, comptes() + 0x6A4, 0);
  for (let mois = 0; mois < 12; mois++) {
    ajouterAuLong(jeu, comptes() + 0x6A4, long(jeu, comptes() + 0x492 + 4 * mois));
    ajouterAuLong(jeu, comptes() + 0x6A8, long(jeu, comptes() + 0x526 + 4 * mois));
  }
  poserLong(jeu, comptes() + 0x6AC, long(jeu, comptes() + 0x684));
  poserLong(jeu, comptes() + 0x6B0, long(jeu, comptes() + 0x688));
  poserLong(jeu, comptes() + 0x6B4, octet(jeu, long(jeu, FICHE_COURANTE) + 0x221) !== 0 ? long(jeu, comptes() + 0x68C) : 0);

  if (aSuivre && octet(jeu, 0xD66F1) !== 2) {
    const anneeCourante = u16((long(jeu, PAS_DE_SIMULATION) / PAS_PAR_AN) >>> 0);   // relue : le bilan a pu vendre le parc
    const diviseur = octet(jeu, 0xD66F1) === 0 ? 6 : 3;
    jeu.appeler(0x116E4, long(jeu, 0xD3B84) + octet(jeu, 0xB52C1) * 6);
    annoncerLesNouveautes(jeu, 4, 0xCCED0, 200, 0xAA, 0xC5, anneeCourante, diviseur);
    annoncerLesNouveautes(jeu, 0xA, 0xD3C62, 0x6B, 0x64, 0x66, anneeCourante, diviseur);
    poserOctet(jeu, 0xD7768, 0);
  }

  poserOctet(jeu, 0xD441F + mot(jeu, JOUEUR_COURANT) * 6, 0x34);
  while (octet(jeu, 0xD7786) < octet(jeu, 0xD7792)) jeu.appeler(0x2CCF8);
  if (octet(jeu, 0xDE5F6) & 1) jeu.appeler(0x81590, long(jeu, 0xDE5BC), 0x190, 0);
  else jeu.appeler(0x815B8, long(jeu, 0xDE5BC), 0x1E0, 0);
  jeu.appeler(0x55FCF);
  presenterLImage(jeu);
}

// Annoncer les genres nouveaux d'un catalogue (fiches de `taille` octets, jusqu'à un mot +22 nul).
function annoncerLesNouveautes(jeu, sorte, catalogue, taille, champDeLAnnee, champDesDrapeaux, anneeCourante, diviseur) {
  poserMot(jeu, 0xD6614, sorte);
  for (let k = 0; mot(jeu, catalogue + u16(k) * taille + 0x22) !== 0; k++) {
    const g = catalogue + u16(k) * taille;
    const disponible = idiv(mot(jeu, g + champDeLAnnee), diviseur) <= anneeCourante;
    if (!((disponible && !(octet(jeu, g + champDesDrapeaux) & 1)) || (octet(jeu, g + champDesDrapeaux) & 2))) continue;
    poserMot(jeu, 0xD6610, u16(k) * taille);
    jeu.appeler(0x35F21, 0x12);
    poserOctet(jeu, g + champDesDrapeaux, octet(jeu, g + champDesDrapeaux) | 1);
    while (mot(jeu, 0xD6652) === 0x48) {
      jeu.appeler(0x1107F);
      jeu.appeler(0x3A8EF);
      presenterLImage(jeu);
    }
  }
}

// `memoire: 'entiere'` : ces fonctions écrivent dans les fiches, les parcs et les tables de sprites du
// tas, et appellent des fonctions qui écrivent partout. Toutes sont appelées par simulation.json ;
// aucune n'est en attente.
export const reecritures = [
  { adresse: 0x7401C, nom: 'finirLAnnee', fn: finirLAnnee, arguments: 1, memoire: 'entiere' },
  { adresse: 0x78B53, nom: 'ouvrirUnLivreNeuf', fn: ouvrirUnLivreNeuf, arguments: 0, memoire: 'entiere' },
  { adresse: 0x7C36D, nom: 'detailDeLAnnee', fn: detailDeLAnnee, arguments: 0, memoire: 'entiere' },
  { adresse: 0x76FA3, nom: 'decernerLesTrophees', fn: decernerLesTrophees, arguments: 0, retour: true, memoire: 'entiere' },
  { adresse: 0x73347, nom: 'appliquerLeClassement', fn: appliquerLeClassement, arguments: 0, memoire: 'entiere' },
  { adresse: 0x4ADE6, nom: 'coursDeFinDAnnee', fn: coursDeFinDAnnee, arguments: 0, memoire: 'entiere' },
  { adresse: 0x51111, nom: 'impotsEtInflation', fn: impotsEtInflation, arguments: 0, memoire: 'entiere' },
  { adresse: 0x76F03, nom: 'chargerLEcranDesTrophees', fn: dansLeCadre(4, chargerLEcranDesTrophees), arguments: 0, memoire: 'entiere' },
  { adresse: 0x73EE8, nom: 'trouverUnAcheteur', fn: trouverUnAcheteur, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x729D8, nom: 'bourseDeFinDAnnee', fn: bourseDeFinDAnnee, arguments: 0, memoire: 'entiere' },
];

export const enAttente = [];
