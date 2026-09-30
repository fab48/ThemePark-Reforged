// Les visiteurs : la marche sur les allées, et tout ce qui s'y décide.
//
// À chaque pas de simulation, la mise à jour des objets du parc (0x21681) confie chaque visiteur
// (objet de type 2) à la routine de son état, l'octet +0xC. L'état 8 est celui du visiteur qui se
// promène sur les allées du parc, ou sur la route qui mène du bus au portique : c'est 0x22E22, la
// routine la plus appelée de la simulation (165 923 fois en 120 s de simulation.json). Elle fait
// avancer le visiteur vers le centre de la case suivante et, à chaque case atteinte, décide de la
// suite : continuer, tourner, entrer quelque part, rentrer chez soi, ou se déclarer égaré.
//
// Réécriture lisible de 0x22E22 et de ses auxiliaires propres : 0x22834 (se choisir un but),
// 0x277E1 (profiter d'un élément du décor), 0x280E4 (une file d'attente où entrer ?) et 0x68149
// (acheter dans cette boutique ?).
//
// ---------------------------------------------------------------------------------------------
// L'OBJET VISITEUR (200 octets, table [0xD3B10]) — les champs que lisent et écrivent ces fonctions
//
//   +0x02 mot signé  objet suivant sur la même case
//   +0x04 octet      type : 2
//   +0x05 octet      drapeaux : 2, posé en entrant dans une file (et par d'autres états ; sens
//                    exact non établi) ; 8, a déjà profité de la grande fontaine (voir
//                    profiterDUnElement) ; 0x40 lu par 0x2789A
//   +0x06 mot        position horizontale en 256es de case : octet +6 la fraction, +7 la colonne
//   +0x08 mot        position verticale : octet +8 la fraction, +9 la rangée
//   +0x0A mot        l'objet graphique affiché (l'image courante de son animation)
//   +0x0C octet      l'état (voir plus bas)
//   +0x0D octet      l'état d'avant, gardé en passant au guichet ou aux toilettes
//   +0x12 octet      la direction : 0 vers le haut de la carte (rangée − 1), 1 vers la droite
//                    (colonne + 1), 2 vers le bas, 3 vers la gauche
//   +0x13 octet      la vitesse, en 256es de case par pas (16 ou 8 dans la démo)
//   +0x14 mot signé  compte à rebours des pas : jusqu'au centre de la case suivante, en marche
//   +0x16 mot        le numéro de l'objet où il se rend : boutique, attraction
//   +0x18...         un bit par genre d'attraction déjà essayé (le numéro du bit est l'octet
//                    +0xC1 de la fiche du genre)
//   +0x20 mot long   compteur remis à zéro en passant au guichet ou aux toilettes
//   +0x49 mot        la case de la boutique où il entre (rangée × 64 + colonne)
//   +0x4F octet      le joueur dans le parc duquel il est entré ; −1 tant qu'il n'a pas passé le
//                    guichet (0x223C1 y range [0xD665C])
//   +0x50 octet signé  l'estomac : sous 1 il a faim, au-delà de 8 il est repu (0x2789A)
//   +0x51 octet signé  la soif, de même
//   +0x52 mot        un bit par objet acheté ou jeu essayé (le mot +0x58 de la fiche de la boutique)
//   +0x54 mot signé  le bonheur
//   +0x56, +0x57     la case qu'il vise (colonne, rangée) quand il est égaré ou qu'il rentre
//   +0x58 octet      la direction d'avant
//   +0x59 octet      l'allure : son apparence, fiche de 0x24 octets de la table 0xB49F4
//   +0x5A octet      une des trois animations d'attente, tirée en entrant dans une file
//   +0x63 octet      ce qu'il a en main et jettera : 1 un gobelet, 2 un emballage (les deux
//                    octets +0x5C des boutiques qui les produisent) ; 4 : il va vomir
//   +0x6F mot        son argent
//   +0x75 mot long   le pas de simulation de son entrée dans le parc
//   +0x81 octet      le nombre d'attractions essayées (lu par 0x2789A et 0x672A5)
//   +0x82 mot signé  la lassitude : croît en marchant (0x672A5 : 32 moins bonheur/128 par case
//                    en état 8), bondit quand il a tout vu ou qu'il vomit ; il rentre quand elle
//                    est trop haute
//   +0x96 mot        (pas >> 7) de la dernière fois qu'un arbre ou un buisson l'a réjoui
//   +0xB7 mot        la bulle de pensée : un numéro de figure (table [0xD3B38])
//   +0xB9 octet      combien de temps la bulle reste : 50 ici, 200 dans 0x2789A
//   +0xC7 octet      compte à rebours, en cases, avant de jeter ce qu'il a en main
//
// LES ÉTATS DU VISITEUR (octet +0xC ; la routine de chaque état, table 0x21723 de 0x21681) :
//   2  0x2223B   arrive : attend, puis rejoint une allée (état 8)
//   4  0x223C1   au guichet du portique : paie l'entrée (mot +0x1D de la fiche du parc)
//   6  0x2293A   égaré : cherche un chemin vers la case visée (+0x56, +0x57)
//   8  0x22E22   se promène (ce module)
//   0xA 0x243DD  entre dans une file d'attente ; 0xC, 0x34 : y attend (0x24DFE, 0x24D4B)
//   0x14 0x25E1B dans une boutique
//   0x1A 0x273C8 s'arrête un instant pour manifester son humeur (posé par 0x2789A)
//   0x1E 0x266D7 quitte la carte par la route (le sol 0xED)
//   0x3E 0x25339 vomit
//   0x40 0x22BA6 rentre : marche vers le portique
//   0x4A 0x272DE entre dans une attraction sans file (sol 0x4000)
//   0x4C 0x275F3 aux toilettes
//
// COMMENT UN VISITEUR DÉCIDE, à chaque case atteinte (arriverSurUneCase) :
//   1. il jette ce qu'il a en main quand le compte à rebours +0xC7 tombe à zéro : sur une allée
//      qui n'en porte pas déjà, un déchet de plus (bits 0 à 2 de l'octet +3 de la case, dessinés
//      comme décors éparpillés ; compteur +0x80 de la fiche du parc) ; s'il devait vomir, il vomit ;
//   2. il pense (0x2789A), et peut s'arrêter là pour manifester son humeur ;
//   3. son humeur est mise à jour (0x672A5) ;
//   4. il rentre (état 0x40) s'il a fait son temps : lassitude ≥ 2 000 × nombre d'attractions ou
//      ≥ 12 000, plus de 4 000 pas dans le parc (quatre mois), ou parc fermé ;
//   5. hors d'une allée, il est égaré (état 6) ; une case à sens imposé lui donne sa direction ;
//   6. il regarde les quatre cases voisines, sauf celle d'où il vient, dans l'ordre haut, droite,
//      bas, gauche, et la première occasion l'emporte : la route de sortie s'il a fait son temps
//      (seuil de lassitude 8 000 ici), le guichet s'il n'est pas encore entré, une boutique qui le
//      tente, une attraction sans file, une file d'attente, des toilettes ; en passant, un arbre
//      le réjouit, la grande fontaine l'enchante (et, par une anomalie, le renvoie chez lui), des
//      toilettes sales l'écœurent ;
//   7. sinon il choisit sa direction parmi les sorties de l'allée : une table (0xB533A) la donne
//      pour chaque ensemble de sorties et direction d'arrivée, ou bien il tire au hasard, avec
//      une chance sur deux de corriger le tirage (voir choisirSaDirection) ;
//   8. un panneau indicateur sur la case peut l'emporter : vers la sortie s'il a fait son temps,
//      vers la boutique annoncée si elle le tente (7 fois sur 16), vers l'attraction annoncée s'il
//      ne l'a pas essayée et qu'elle l'attire assez.
//
// LA PILE. Ces fonctions reproduisent aussi ce que l'original laisse dans la pile, sous le
// pointeur de pile : le jeu lit des variables locales qu'il n'a pas écrites (voir Cadre, plus bas).
//
// VÉRIFICATION. moteur/node/comparer.mjs (appel par appel, mémoire entière) et
// moteur/node/verifier.mjs (rejeu comparé) sur les cinq scénarios. Ce que les scénarios n'exercent
// pas — simulation.json (330 s) est le plus complet pour ce module — et qui n'est donc pas vérifié
// par eux :
//   - les cases à sens imposé (ici ou voisines), l'allée sans sortie, la grande fontaine (aucune
//     dans le parc de la démo), la flèche de sortie des panneaux (aucune), l'entrée d'une attraction
//     sans file (aucune), les toilettes trop sales, le calcul d'achat d'un objet (aucune boutique
//     d'objets dans le parc) ; et les bulles « mécontent », « trop cher », « pas bon »,
//     « pas désaltérant », « encore un gobelet », « pas faim » et celles des jeux refusés ;
//   - le guichet parc fermé : inatteignable, un parc fermé renvoie déjà chacun chez soi
//     (aFaitSonTemps, avant l'examen des voisines) ; l'erreur de vitesse nulle (0x19ED3).
// Toutes ces branches, sauf ces deux-là et la bulle « pas bon », ont été comparées hors des
// scénarios du dépôt, en modifiant l'état du parc en cours de partie (toilettes salies, allées à
// sens imposé ou sans sortie, fontaine, panneaux vers la sortie, kiosques tournés vers une allée,
// boutiques changées en boutiques d'objets, prix, argent et bonheur changés) : 0 divergence, pile
// morte comprise.

// --- Accès à la mémoire ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);
const HAUT = 0xFFFF0000;            // la moitié haute d'un registre, qu'une écriture de 16 bits laisse

// Division entière du processeur (idiv) : un diviseur nul lève une exception, comme sur la machine.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

// --- La pile d'origine -------------------------------------------------------------------------
//
// Le jeu lit parfois une variable locale qu'il n'a pas écrite. 0x223C1 (l'état 4, au guichet) ne
// calcule sa position ([ebp-8]) que dans la première phase de l'entrée ; dans la seconde (mot long
// +0x20 à 1), elle s'en sert pour régler le compte à rebours (|0x80 − octet bas| / vitesse), et lit
// donc ce que la routine précédente a laissé à cette place : 0x21681 appelle les routines d'état
// l'une après l'autre à la même hauteur de pile, et c'est le plus souvent 0x22E22, pour un autre
// visiteur (chez elle, [ebp-8] est le rang tiré parmi les directions possibles). Ce qu'une fonction
// laisse sous le pointeur de pile fait donc partie de son effet : sans cela, le visiteur au guichet
// repart avec un autre compte à rebours, et la partie diverge (vu à 39,76 s de simulation.json ;
// comparer.mjs ne le voit pas, qui ne compare pas la pile morte). Chaque fonction de ce module
// reproduit donc son cadre d'origine :
//   - les registres qu'elle empilait à l'entrée : ebx, esi, edi, puis ebp ;
//   - chacune de ses variables locales, telle qu'elle l'écrivait, restes de calcul compris ;
//   - ses appels partent de la même hauteur de pile, sous ses variables locales, pour que les
//     fonctions appelées laissent leurs propres traces aux mêmes adresses ; et l'adresse de retour
//     d'origine (celle de l'instruction qui suit l'appel) remplace l'adresse fictive qu'empile
//     jeu.appeler.
// Les fonctions appelées empilent à leur tour ebx, esi, edi et ebp : ces registres doivent avoir,
// à chaque appel, la valeur qu'ils avaient dans l'original. ebp y désigne le cadre ; edi ne change
// pas ; ebx sert de registre de travail à 0x22E22 et à 0x22834, esi une fois à 0x22E22 (0x242C9),
// et `cadre.ebx`, `cadre.esi` suivent la valeur qu'ils auraient (ce n'est utile qu'avant un appel
// qui suit). fermer() rend ebx, esi et ebp. Un registre de travail peut aussi compter pour
// l'appelé : 0x281D5 garde dans une variable locale la moitié haute de edx, qu'elle n'écrit pas ;
// `cadre.edx`, quand on le pose, est chargé pour le seul appel qui suit.
// Les restes que laisse l'original dans eax, ecx et edx en sortant ne sont pas reproduits.
// La réécriture ne relit jamais ce qu'elle écrit ainsi : cadre.octet et cadre.long notent au fil du
// code, à leur place sous ebp, ce que l'original y aurait écrit.
class Cadre {
  constructor(jeu, tailleDesLocales) {
    const T = jeu.T;
    T.sauver();
    const R = T.R, entree = R.esp >>> 0;
    this.jeu = jeu;
    this.edxEntree = R.edx;         // 0x22E22 garde des restes de edx et de ebx d'entrée dans deux
    this.ebxEntree = R.ebx;         // de ses variables locales
    this.ebx = R.ebx;
    this.esiEntree = R.esi;
    this.esi = R.esi;
    this.edx = undefined;
    this.ebpAppelant = R.ebp;
    jeu.dv.setUint32(entree - 4, R.ebx >>> 0, true);
    jeu.dv.setUint32(entree - 8, R.esi >>> 0, true);
    jeu.dv.setUint32(entree - 12, R.edi >>> 0, true);
    jeu.dv.setUint32(entree - 16, R.ebp >>> 0, true);
    this.ebp = entree - 16;
    this.bas = this.ebp - tailleDesLocales;
    R.esp = this.bas;               // l'enveloppe remettra la pile à sa place au retour
    R.ebp = this.ebp;
    T.charger();
  }

  // Le 'leave' et les 'pop' : ebp, ebx et esi redeviennent ceux de l'appelant.
  fermer() {
    const T = this.jeu.T;
    T.sauver();
    T.R.ebp = this.ebpAppelant;
    T.R.ebx = this.ebxEntree;
    T.R.esi = this.esiEntree;
    T.charger();
  }

  octet(decalage, v) { this.jeu.m8[this.ebp - decalage] = v; }

  long(decalage, v) { this.jeu.dv.setUint32(this.ebp - decalage, v >>> 0, true); }

  appeler(retour, adresse, ...args) {
    const T = this.jeu.T;
    T.sauver();
    T.R.ebx = this.ebx;
    T.R.esi = this.esi;
    if (this.edx !== undefined) T.R.edx = this.edx;
    this.edx = undefined;
    T.charger();
    const resultat = this.jeu.appeler(adresse, ...args);
    this.jeu.dv.setUint32(this.bas - 4 * args.length - 4, retour, true);
    return resultat;
  }
}

// Exécute `corps(cadre)` dans le cadre d'origine d'une fonction, et le referme quoi qu'il arrive.
function dansLeCadre(jeu, tailleDesLocales, corps) {
  const cadre = new Cadre(jeu, tailleDesLocales);
  try {
    return corps(cadre);
  } finally {
    cadre.fermer();
  }
}

// --- Le temps -----------------------------------------------------------------------------------
const PAS_DE_SIMULATION = 0xD3AFC;  // mot long : 1 000 pas par mois de jeu
const MISES_A_JOUR = 0xD3AF8;       // octet : incrémenté par 0x21681 à chaque passage sur les objets

// --- Le parc du joueur courant ([0xD665C] ; pointeurs posés par 0x1A2CA) -----------------------
const FICHE_DU_PARC = 0xD3818;      // pointeur : 0xCF1E0 + joueur × 0x250
//   +0x00 mot signé  bonheur au-delà duquel un visiteur est content (200 dans la démo)
//   +0x02 mot signé  bonheur en deçà duquel il est mécontent (−100 dans la démo)
//   +0x06 mot        la marge tolérée par les visiteurs, en points au-delà du prix coûtant (40)
//   +0x18 octet      le parc est ouvert (0x20FF5 le pose quand on clique sur le portique)
//   +0x37 mot long   cumul du plaisir que les arbres et les buissons ont donné
//   +0x80 mot        nombre de déchets jetés sur les allées
//   +0x82 octet      nombre d'attractions (+1 à la construction, −1 à la démolition)
const PARC = 0xD3814;               // pointeur : 0xD443C + joueur × 0x6C2 (nom du parc en tête)
const CASE_DU_PORTIQUE = 0x2CA;     //   mot : la case du portique d'entrée, rangée × 64 + colonne

// --- Les objets et la carte ---------------------------------------------------------------------
const OBJETS = 0xD3B10;             // pointeur : les objets du parc, 200 octets, numérotés depuis 1
const TAILLE_OBJET = 200;
const VISITEUR = 2, ATTRACTION = 4, KIOSQUE = 6, BOUTIQUE = 0xA, ENTREE_OU_PANNEAU = 0x14, INSTALLATION = 0x18;
const GRILLE = 0xD3B08;             // pointeur : 64 × 64 cellules de 4 octets
//   +0 mot signé  le premier objet posé sur la case, ou un décor (négatif)
//   +2 octet      le sol
//   +3 octet      bits 0 à 2 : les déchets (dessinés comme décors éparpillés) ; bit 4 : un
//                 panneau indicateur ; bit 5 : un sens imposé, dont la direction est dans les
//                 bits 6 et 7 (dessin-carte.js y trace un « sprite centré » choisi par les mêmes
//                 bits, vraisemblablement une flèche : non établi)
const PANNEAU_SUR_LA_CASE = 0x10, SENS_IMPOSE = 0x20;

// --- Les sols : 4 octets par sol, à partir de 0xB44D9 -------------------------------------------
const PROPRIETES_DES_SOLS = 0xB44D9;  // +0 mot : les propriétés
const FORMES_DES_SOLS = 0xB44DC;      // +3 octet : la forme, qui donne les sorties
const SORTIES_DES_FORMES = 0xB4990;   // octet par forme : bit d = on peut sortir dans la direction d
// Propriétés relevées dans la table (numéros de sol entre parenthèses) :
const ALLEE = 0x0002;           // les allées (85 à 100, 137, 138, 150 à 157, 216 à 236 ; 0x42 : 101…)
const ENTREE_DE_FILE = 0x0010;  // le début d'une file d'attente (128 à 131, avec 8, les files)
const GUICHET = 0x0080;         // le guichet du portique (sol 5)
const COMPTOIR = 0x0100;        // devant une boutique (sol 158)
const ENTREE_DIRECTE = 0x4000;  // devant une attraction sans file (sol 134)
const TOILETTES = 0x8000;       // devant les toilettes (sol 103)
const SOL_DE_SORTIE = 0xED;     // la route par où l'on quitte la carte (aucune propriété)

// --- Les directions : 0 haut, 1 droite, 2 bas, 3 gauche -----------------------------------------
const DECALAGES_DES_VOISINES = 0xB4920;  // mot signé par direction, en cases : −64, +1, +64, −1
const PAS_DES_DIRECTIONS = 0xB4932;      // deux octets signés par direction : dx, dy
const DIRECTIONS_OPPOSEES = 0xB48EC;     // mot par direction : 2, 3, 0, 1
const DIRECTION_NATURELLE = 0xB533A;     // octet signé [sorties × 4 + direction d'arrivée] : la
                                         // direction à prendre, ou −1 : à tirer au hasard. Elle
                                         // n'est −1 que pour deux sorties ou plus.

// --- Les figures --------------------------------------------------------------------------------
const FIGURES = 0xD3B38;            // pointeur : table de mots, numéro de figure → objet graphique
const OBJETS_GRAPHIQUES = 0xD3B80;  // pointeur : 8 octets par objet ; +6 l'image suivante
const ALLURES = 0xB49F4;            // 0x24 octets par allure : +0 mot, première des quatre figures
const TAILLE_ALLURE = 0x24;         // de la marche (une par direction) ; +8 mot, celle du vomissement
const VOMIR = 8;

// --- Les catalogues -----------------------------------------------------------------------------
const GENRES_DE_BOUTIQUES = 0xD3C62;  // 107 octets par genre ; l'objet boutique en donne le décalage
//   (mot +0x16). Relevé dans la démo : nom en tête (MR. WHIPPY ICES, BIG TIME FRIES...) ;
//   +0x24 la famille : 1 à manger, 2 à boire, 4 objets, 8 jeux ; +0x25 ce qu'elle procure, mêmes
//   bits (3 pour les glaces) ; +0x4D le prix coûtant ; +0x4F le prix de vente ; +0x56, +0x57
//   (signés) ce qu'elle apporte à l'estomac et contre la soif ; +0x58 le bit de l'objet ou du jeu
//   ; +0x5C le déchet qu'elle laisse (1 gobelet, 2 emballage) ; +0x5D et +0x69 : l'attrait d'un
//   jeu (sens exact non établi) ; +0x67 (signé) l'article en stock, −1 aucun.
const STOCKS = 0xD3C04;             // 14 octets par article ; +0 mot, la quantité en stock
const GENRES_D_ATTRACTIONS = 0xCCED0;  // 200 octets par genre (nom en tête) ; l'attraction en donne
//   le décalage (mot +0x16). +0xC1 : le bit du genre chez le visiteur ; +0xA6 (signé), +0xA9,
//   +0xB8 : ce qui fait son attrait sur un panneau (sens de chacun non établi).
const ELEMENTS = 0xCCA70;           // 0x38 octets par élément de décor ou installation (nom en tête :
//   TROPICAL BUSH, PALM TREE, LAMP POST... LAKE, les clôtures, BOGGY CRAPPER, OUTHOUSE, SUPER
//   TOILET, CENTRE FOUNTAIN) ; la table s'arrête sur un mot +0x22 nul. +0x26 mot : l'identifiant
//   (le numéro négatif du décor sur la carte, pour les arbres) ; +0x28 mot : le prix ; +0x2A mot :
//   la catégorie (7 arbres, buissons et lampadaires ; 1 clôtures ; 12 le lac ; 15 les
//   installations) ; toilettes : +0x31 leur désagrément, +0x32 la saleté au-delà de laquelle on
//   n'y entre plus, +0x33 le nombre de places.
const TAILLE_ELEMENT = 0x38;
const LA_GRANDE_FONTAINE = 0x143;   // l'identifiant de CENTRE FOUNTAIN (élément 18)

// --- Les fonctions appelées ---------------------------------------------------------------------
const HASARD = 0x18B92;             // le générateur du jeu : rend 0 à 0x7FFF
const DEPLACER = 0x18A44;           // (objet, x, y) : déplace un objet et le change de case au besoin
const CHERCHER_SUR_LA_CASE = 0x204B9;  // (cellule, type) : le premier objet de ce type sur la case, ou 0
const DIVISION_PAR_ZERO = 0x19ED3;  // vitesse nulle : rend 1, efface la demande de sortie
const PENSER = 0x2789A;             // (visiteur, 0) : la bulle de pensée ; non nul s'il s'arrête
const HUMEUR = 0x672A5;             // (visiteur) : bonheur, lassitude, faim et soif
const JOUER_UN_BRUITAGE = 0x80C80;  // (propriétaire, bruitage)
const ATTRACTION_AU_BOUT_DE_LA_FILE = 0x281D5;  // (cellule) : suit la file jusqu'au kiosque
// Les fonctions de ce module s'appellent entre elles par leur entrée, comme les autres : c'est ce
// qui les fait comparer par comparer.mjs à chaque appel.
const SE_CHOISIR_UN_BUT = 0x22834;
const PROFITER_D_UN_ELEMENT = 0x277E1;
const PEUT_ENTRER_DANS_LA_FILE = 0x280E4;
const EST_TENTE_PAR_LA_BOUTIQUE = 0x68149;

// --- Les bulles de pensée (numéros de figure ; le sens vient de 0x2789A, qui les pose aussi) ----
const BULLE_ENCORE_UN_GOBELET = 0x227;   // il a encore en main le gobelet de ce genre de boutique
const BULLE_ENCORE_UN_EMBALLAGE = 0x21E; // de même, l'emballage
const BULLE_PAS_FAIM = 0x21C;            // 0x2789A la pose quand l'estomac est entre 4 et 8
const BULLE_PAS_SOIF = 0x21D;            // de même pour la soif
const BULLE_PAS_D_ARGENT = 0x22A;        // 0x2789A la pose sous 400
const BULLE_MECONTENT = 0x274;           // 0x2789A la pose sous le seuil +0x02 de la fiche du parc
const BULLE_DEJA_EU = 0x228;             // il a déjà cet objet, ou a déjà joué à ce jeu
const BULLE_TROP_CHER = 0x233;           // la marge dépasse 100 % du prix coûtant
const BULLE_PAS_BON = 0x22F;             // on y mange mal (apport +0x56 sous 2)
const BULLE_PAS_DESALTERANT = 0x22E;     // on y boit mal (apport +0x57 sous 2)
const BULLE_JEU_PEU_ATTIRANT = 0x231;    // jeu dont l'octet +0x5D est sous 5 (sens non établi)
const BULLE_JEU_DECEVANT = 0x230;        // jeu dont le mot +0x4D est sous 2 000 (sens non établi)
const BULLE_PAS_TENTE = 0x232;           // aucune raison particulière
const DUREE_DE_LA_BULLE = 50;

const CONTINUER = -1;               // une case voisine qui ne décide de rien : on passe à la suivante

// =============================================================================================
// Petits outils
// =============================================================================================

function objetNumero(jeu, n) {
  return (long(jeu, OBJETS) + n * TAILLE_OBJET) >>> 0;
}

function numeroDeLObjet(jeu, objet) {
  return ((objet - long(jeu, OBJETS)) / TAILLE_OBJET) | 0;
}

// Les visiteurs posés sur une case. La liste s'arrête sur 0 ou sur un décor (négatif) : le
// programme compare l'adresse obtenue à celle de la table, sans signe. Rend aussi l'adresse où le
// parcours s'est arrêté (le programme la garde dans une variable locale).
function visiteursSurLaCase(jeu, cellule) {
  const base = long(jeu, OBJETS);
  let n = 0, o = objetNumero(jeu, motSigne(jeu, cellule));
  for (; o > base; o = objetNumero(jeu, motSigne(jeu, o + 2))) {
    if (octet(jeu, o + 4) === VISITEUR) n++;
  }
  return { nombre: n, arret: o };
}

function celluleDuVisiteur(jeu, v) {
  return (long(jeu, GRILLE) + (octet(jeu, v + 9) * 64 + octet(jeu, v + 7)) * 4) | 0;
}

function voisineDans(jeu, cellule, direction) {
  return (cellule + motSigne(jeu, DECALAGES_DES_VOISINES + 2 * direction) * 4) | 0;
}

function proprietesDuSol(jeu, sol) {
  return mot(jeu, PROPRIETES_DES_SOLS + sol * 4);
}

function sortiesDuSol(jeu, sol) {
  return octet(jeu, SORTIES_DES_FORMES + octet(jeu, FORMES_DES_SOLS + sol * 4));
}

function opposee(jeu, direction) {
  return mot(jeu, DIRECTIONS_OPPOSEES + 2 * direction);
}

function parcOuvert(jeu) {
  return octet(jeu, long(jeu, FICHE_DU_PARC) + 0x18) !== 0;
}

// L'image suivante d'une animation.
function imageSuivante(jeu, objetGraphique) {
  return mot(jeu, long(jeu, OBJETS_GRAPHIQUES) + objetGraphique * 8 + 6);
}

// La figure de la marche dans la direction du visiteur, selon son allure.
function figureDeMarche(jeu, v) {
  const premiere = mot(jeu, ALLURES + octet(jeu, v + 0x59) * TAILLE_ALLURE);
  return mot(jeu, long(jeu, FIGURES) + (premiere + octet(jeu, v + 0x12)) * 2);
}

function tourner(jeu, v, direction) {
  poserOctet(jeu, v + 0x12, direction);
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
}

// Le programme ne change la direction, et la figure, que si elle diffère de la direction d'arrivée.
function tournerVers(jeu, v, direction, arrivee) {
  if (direction !== arrivee) tourner(jeu, v, direction);
}

function penser(jeu, v, bulle) {
  poserMot(jeu, v + 0xB7, bulle);
  poserOctet(jeu, v + 0xB9, DUREE_DE_LA_BULLE);
}

// Combien de pas pour parcourir `distance` 256es de case à la vitesse du visiteur. Une vitesse
// nulle est une erreur que 0x19ED3 signale (appelée depuis l'instruction qui précède `retour`) ;
// elle rend 1. Le programme divise par ebx, où il a chargé la vitesse.
function pasPour(jeu, cadre, retour, v, distance) {
  const vitesse = octet(jeu, v + 0x13);
  if (vitesse === 0) return s16(cadre.appeler(retour, DIVISION_PAR_ZERO));
  cadre.ebx = vitesse;
  return (distance / vitesse) | 0;
}

// Le genre d'attraction est-il déjà essayé ? Un bit par genre, à partir de l'octet +0x18.
function dejaEssayee(jeu, v, genre) {
  const rang = octet(jeu, genre + 0xC1);
  return (octet(jeu, v + 0x18 + (rang >> 3)) & (1 << (rang & 7))) !== 0;
}

// Le visiteur a-t-il fait son temps ? Quatre raisons de rentrer :
//   - sa lassitude atteint 2 000 fois le nombre d'attractions du parc ;
//   - elle dépasse un plafond, qui varie selon l'endroit (voir les appels) ;
//   - il est dans le parc depuis plus de 4 000 pas, quatre mois de jeu (différence non signée) ;
//   - le parc est fermé.
// Rien n'est écrit : l'ordre des tests ne compte pas.
function aFaitSonTemps(jeu, v, plafondDepasse) {
  const fiche = long(jeu, FICHE_DU_PARC);
  const lassitude = motSigne(jeu, v + 0x82);
  return lassitude >= octet(jeu, fiche + 0x82) * 2000 || plafondDepasse(lassitude)
    || ((long(jeu, PAS_DE_SIMULATION) - long(jeu, v + 0x75)) >>> 0) > 4000
    || octet(jeu, fiche + 0x18) === 0;
}
const AU_MOINS_12000 = (lassitude) => lassitude >= 12000;
const PLUS_DE_12000 = (lassitude) => lassitude > 12000;
const PLUS_DE_8000 = (lassitude) => lassitude > 8000;

// Le chemin du retour : l'état 0x40, et pour but la case du portique.
function rentrer(jeu, v) {
  poserOctet(jeu, v + 0xC, 0x40);
  const portique = mot(jeu, long(jeu, PARC) + CASE_DU_PORTIQUE);
  poserOctet(jeu, v + 0x56, portique % 64);
  poserOctet(jeu, v + 0x57, portique >> 6);
}

// =============================================================================================
// 0x22E22 — l'état 8 : le visiteur se promène
// =============================================================================================

// Les variables locales de 0x22E22, par leur place sous ebp (voir Cadre).
const LOCALES_PROMENADE = 0x98;
const P = {
  arrivee: 0x04,            // octet : la direction d'arrivée
  tirage: 0x08,             // octet : le rang tiré parmi les directions possibles
  tiragePanneau: 0x0C,      // octet : le tirage sur seize devant un panneau
  nombrePossibles: 0x10,    // octet : le nombre de directions possibles
  interdites: 0x14,         // octet : les directions interdites
  direction: 0x18,          // octet : la direction examinée (compteur des deux boucles)
  proprietesIci: 0x1C,
  proprietesVoisine: 0x20,
  indexCase: 0x24,
  sorties: 0x28,
  x: 0x2C,
  y: 0x30,
  sortiesIci: 0x34,
  resultat: 0x38,
  divers3C: 0x3C,           // la durée d'entrée dans une boutique + 1, le nombre de visiteurs aux
                            // toilettes, ou le contenu d'une case voisine
  choix: 0x40,              // la direction choisie
  divers44: 0x44,           // le rang de l'élément de décor, puis le sol de la case
  clients: 0x48,
  kiosque: 0x4C,
  panneau: 0x50,
  parcoursDeLaFile: 0x54,
  boutique: 0x58,
  ici: 0x5C,
  genreAnnonce: 0x60,
  genreBoutique: 0x64,
  modeleToilettes: 0x68,
  parcours: 0x6C,
  caseBoutique: 0x70,
  cible: 0x74,
  possibles: 0x78,          // quatre octets : les directions possibles
  toilettes: 0x7C,
  dureeTraversee: 0x80,
  directionGuichet: 0x84,   // octet
  dureesGuichet: [0x88, 0x8C, 0x90, 0x94],
  dureeBoutique: 0x98,
};

// Rend 1 quand le visiteur change d'état ou s'arrête (ce que 0x21681 ignore), 0 sinon.
export function sePromener(jeu, v) {
  return dansLeCadre(jeu, LOCALES_PROMENADE, (cadre) => {
    const resultat = marcher(jeu, cadre, v);
    cadre.long(P.resultat, resultat);
    return resultat;
  });
}

function marcher(jeu, cadre, v) {
  // En chemin vers le centre de la case suivante : un pas de sa vitesse dans sa direction, et une
  // image de plus de son animation tous les quatre passages de 0x21681.
  if (motSigne(jeu, v + 0x14) > 0) {
    let edx = cadre.edxEntree;
    if ((octet(jeu, MISES_A_JOUR) & 3) === 0) {
      const suivante = imageSuivante(jeu, mot(jeu, v + 0xA));
      edx = ((mot(jeu, v + 0xA) * 8) & HAUT) | suivante;
      poserMot(jeu, v + 0xA, suivante);
    }
    const direction = octet(jeu, v + 0x12), vitesse = octet(jeu, v + 0x13);
    // Le programme calcule sur 32 bits avec des registres dont il n'a écrit que la moitié basse :
    // la moitié haute des variables locales x et y garde ces restes ; seule la basse est passée.
    cadre.ebx = (cadre.ebxEntree & HAUT) | (octetSigne(jeu, PAS_DES_DIRECTIONS + 2 * direction) & 0xFFFF);
    const produitX = Math.imul((edx & HAUT) | vitesse, cadre.ebx);
    const x = (((v & HAUT) | mot(jeu, v + 6)) + produitX) | 0;
    const produitY = Math.imul((produitX & HAUT) | (octetSigne(jeu, PAS_DES_DIRECTIONS + 2 * direction + 1) & 0xFFFF), (v & HAUT) | vitesse);
    const y = (((v & HAUT) | mot(jeu, v + 8)) + produitY) | 0;
    cadre.long(P.x, x);
    cadre.long(P.y, y);
    cadre.appeler(0x22EC3, DEPLACER, v, x & 0xFFFF, y & 0xFFFF);
  }
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (motSigne(jeu, v + 0x14) > 0) return 0;
  return arriverSurUneCase(jeu, cadre, v);
}

// Arrivé au centre d'une case.
function arriverSurUneCase(jeu, cadre, v) {
  const ici = celluleDuVisiteur(jeu, v);
  cadre.long(P.ici, ici);
  jeterCeQuIlAEnMain(jeu, cadre, v, ici);
  if ((cadre.appeler(0x22FE0, PENSER, v, 0) & 0xFFFF) !== 0) return 1;
  cadre.appeler(0x22FFD, HUMEUR, v);
  cadre.octet(P.interdites, 0);
  const arrivee = octet(jeu, v + 0x12);
  cadre.octet(P.arrivee, arrivee);
  const traversee = pasPour(jeu, cadre, 0x2301B, v, 0x100);   // une case jusqu'au prochain centre
  cadre.long(P.dureeTraversee, traversee);
  poserMot(jeu, v + 0x14, traversee);
  const proprietes = proprietesDuSol(jeu, octet(jeu, ici + 2));
  cadre.long(P.proprietesIci, proprietes);

  if (aFaitSonTemps(jeu, v, AU_MOINS_12000)) {
    rentrer(jeu, v);
    return 1;
  }
  if ((proprietes & ALLEE) === 0) return seDireEgare(jeu, cadre, v);
  if (octet(jeu, ici + 3) & SENS_IMPOSE) {
    // (0x22E22 rend 0 ici, le compte à rebours déjà reposé pour la case suivante.)
    tourner(jeu, v, octet(jeu, ici + 3) >> 6);
    return 0;
  }

  // Les quatre voisines, sauf celle d'où il vient ; la première occasion l'emporte. Au passage,
  // certaines interdisent une direction à la marche ordinaire.
  let interdites = 0;
  for (let d = 0; d < 4; d++) {
    cadre.octet(P.direction, d);
    const voisine = voisineDans(jeu, ici, d);
    if (octet(jeu, voisine + 2) === SOL_DE_SORTIE) {
      // La route : il quitte la carte s'il a fait son temps — ici dès 8 000 de lassitude.
      if (aFaitSonTemps(jeu, v, PLUS_DE_8000)) {
        poserOctet(jeu, v + 0xC, 0x1E);
        tournerVers(jeu, v, d, arrivee);
        return 1;
      }
      continue;
    }
    if (d === opposee(jeu, arrivee)) continue;   // on ne revient pas sur ses pas
    const proprietesVoisine = proprietesDuSol(jeu, octet(jeu, voisine + 2));
    cadre.long(P.proprietesVoisine, proprietesVoisine);
    let decision;
    if (proprietesVoisine & GUICHET) {
      // Le guichet du portique ne concerne que ceux qui ne sont pas encore entrés. Parc fermé,
      // il leur barre la route : la direction qu'ils suivent est interdite (et remplace celles
      // qu'une case voisine précédente a pu interdire).
      if (octetSigne(jeu, v + 0x4F) !== -1) continue;
      if (!parcOuvert(jeu)) {
        interdites = (1 << (octet(jeu, v + 0x12) & 31)) & 0xFF;
        cadre.octet(P.interdites, interdites);
        continue;
      }
      return passerAuGuichet(jeu, cadre, v, d, arrivee);
    } else if (proprietesVoisine & COMPTOIR) {
      decision = entrerDansLaBoutique(jeu, cadre, v, voisine, d, arrivee);
    } else if (proprietesVoisine & ENTREE_DIRECTE) {
      decision = entrerDansLAttraction(jeu, cadre, v, voisine, d, arrivee);
    } else if (proprietesVoisine & ENTREE_DE_FILE) {
      decision = entrerDansLaFile(jeu, cadre, v, voisine, d, arrivee);
    } else if (proprietesVoisine & TOILETTES) {
      decision = passerPresDesToilettes(jeu, cadre, v, voisine, d, arrivee);
    } else {
      const decors = octet(jeu, voisine + 3);
      if (decors & SENS_IMPOSE) {
        // Une case à sens imposé qui pointe vers lui : on n'y entre pas à contresens.
        if (motSigne(jeu, DIRECTIONS_OPPOSEES + 2 * d) === decors >> 6) {
          interdites = (interdites | (1 << d)) & 0xFF;
          cadre.octet(P.interdites, interdites);
        }
      } else {
        admirerUnArbreVoisin(jeu, cadre, v, voisine);
      }
      continue;
    }
    if (decision !== CONTINUER) return decision;
  }
  cadre.octet(P.direction, 4);

  return choisirSaDirection(jeu, cadre, v, ici, arrivee, interdites);
}

// 0x22F03 à 0x22FD0. Le compte à rebours +0xC7 ne court que s'il a été posé (par des toilettes
// sales ici, par les boutiques ailleurs). Un déchet ne s'ajoute que sur une allée, et une seule
// fois de chaque sorte par case.
function jeterCeQuIlAEnMain(jeu, cadre, v, ici) {
  if (octet(jeu, v + 0xC7) === 0) return;
  poserOctet(jeu, v + 0xC7, octet(jeu, v + 0xC7) - 1);
  if (octet(jeu, v + 0xC7) !== 0 || octet(jeu, v + 0x63) === 0) return;
  if ((octet(jeu, ici + 3) & octet(jeu, v + 0x63)) === 0 && (proprietesDuSol(jeu, octet(jeu, ici + 2)) & ALLEE)) {
    const fiche = long(jeu, FICHE_DU_PARC);
    poserMot(jeu, fiche + 0x80, mot(jeu, fiche + 0x80) + 1);
    poserOctet(jeu, ici + 3, octet(jeu, ici + 3) | octet(jeu, v + 0x63));
  }
  if (octet(jeu, v + 0x63) & 4) {
    // Il vomit : l'état 0x3E, l'animation de son allure prise à sa deuxième image, et le bruitage
    // 0xD. La suite de l'arrivée se déroule quand même, et peut encore changer son état.
    poserOctet(jeu, v + 0xC, 0x3E);
    const figure = mot(jeu, ALLURES + octet(jeu, v + 0x59) * TAILLE_ALLURE + VOMIR);
    poserMot(jeu, v + 0xA, imageSuivante(jeu, mot(jeu, long(jeu, FIGURES) + figure * 2)));
    cadre.appeler(0x22FCA, JOUER_UN_BRUITAGE, 0, 0xD);
  }
  poserOctet(jeu, v + 0x63, 0);
}

// 0x2437B : hors d'une allée (ou sur une case sans sortie), le visiteur se choisit un but et passe
// à l'état 6, qui cherche un chemin.
function seDireEgare(jeu, cadre, v) {
  cadre.appeler(0x24384, SE_CHOISIR_UN_BUT, v);
  poserOctet(jeu, v + 0xC, 6);
  poserMot(jeu, v + 0x14, 0);
  poserMot(jeu, v + 0xA, figureDeMarche(jeu, v));
  return 1;
}

// --- Les cases voisines -------------------------------------------------------------------------

// 0x232D5 : le guichet. Le compte à rebours devient le temps d'atteindre le bord de sa case dans la
// direction du guichet ; l'état et la direction d'avant sont gardés pour après.
// ANOMALIE, reproduite : pour les directions horizontales, la distance est prise au bord opposé
// (vers la droite, la fraction +6 au lieu de 0xFF − fraction). Au centre de la case (0x80), où
// arrive un visiteur, l'écart n'est que d'un 256e de case.
const RETOURS_GUICHET = [0x232E3, 0x23325, 0x23367, 0x233AF];
function passerAuGuichet(jeu, cadre, v, d, arrivee) {
  cadre.octet(P.directionGuichet, d);
  const distances = [octet(jeu, v + 8), octet(jeu, v + 6), 0xFF - octet(jeu, v + 8), 0xFF - octet(jeu, v + 6)];
  const duree = pasPour(jeu, cadre, RETOURS_GUICHET[d], v, distances[d]);
  cadre.long(P.dureesGuichet[d], duree);
  poserMot(jeu, v + 0x14, duree);
  poserOctet(jeu, v + 0xD, octet(jeu, v + 0xC));
  poserOctet(jeu, v + 0x58, octet(jeu, v + 0x12));
  tournerVers(jeu, v, d, arrivee);
  poserLong(jeu, v + 0x20, 0);
  poserOctet(jeu, v + 0xC, 4);
  return 1;
}

// 0x2346C : une boutique (objet de type 0xA sur la case voisine ; une boutique de plusieurs cases
// renvoie à son objet principal par son mot +0x49).
function entrerDansLaBoutique(jeu, cadre, v, voisine, d, arrivee) {
  const trouvee = cadre.appeler(0x2348B, CHERCHER_SUR_LA_CASE, voisine, BOUTIQUE);
  cadre.long(P.boutique, trouvee);
  if (trouvee === 0 || !parcOuvert(jeu)) return CONTINUER;
  let boutique = trouvee;
  if (mot(jeu, trouvee + 0x49) !== 0) {
    boutique = objetNumero(jeu, mot(jeu, trouvee + 0x49));
    cadre.long(P.boutique, boutique);
  }
  const genre = GENRES_DE_BOUTIQUES + mot(jeu, boutique + 0x16);
  cadre.long(P.genreBoutique, genre);

  if ((octet(jeu, v + 0x63) & octet(jeu, genre + 0x5C)) !== 0) {
    // Il a encore en main le gobelet ou l'emballage de ce que vend la boutique : pas maintenant.
    // S'il porte le drapeau 2 de l'octet +5, celui-ci tombe à la place de la bulle.
    if (octet(jeu, v + 5) & 2) poserOctet(jeu, v + 5, octet(jeu, v + 5) & 0xFD);
    else if (octet(jeu, v + 0x63) & 1) penser(jeu, v, BULLE_ENCORE_UN_GOBELET);
    else if (octet(jeu, v + 0x63) & 2) penser(jeu, v, BULLE_ENCORE_UN_EMBALLAGE);
    return CONTINUER;
  }

  // La place devant le comptoir : un seul client à la fois devant un jeu, moins de quatre ailleurs.
  cadre.long(P.caseBoutique, voisine);
  const { nombre: clients, arret } = visiteursSurLaCase(jeu, voisine);
  cadre.long(P.clients, clients);
  cadre.long(P.parcours, arret);
  const famille = octet(jeu, genre + 0x24);
  if (!((famille === 8 && clients === 0) || (famille !== 8 && clients < 4))) return CONTINUER;
  if ((cadre.appeler(0x23590, EST_TENTE_PAR_LA_BOUTIQUE, v, boutique) & 0xFF) === 0) return CONTINUER;
  const demiCase = pasPour(jeu, cadre, 0x235A9, v, 0x80);
  cadre.long(P.dureeBoutique, demiCase);
  const duree = demiCase + 1;                        // une demi-case, plus un pas
  cadre.long(P.divers3C, duree);
  if (s16(duree) <= 0) return CONTINUER;
  poserMot(jeu, v + 0x49, octet(jeu, boutique + 7) + octet(jeu, boutique + 9) * 64);
  poserMot(jeu, v + 0x16, numeroDeLObjet(jeu, boutique));
  poserOctet(jeu, v + 0x56, octet(jeu, v + 7));      // d'où il vient, pour en ressortir
  poserOctet(jeu, v + 0x57, octet(jeu, v + 9));
  poserOctet(jeu, v + 0xC, 0x14);
  poserOctet(jeu, v + 0x58, arrivee);
  poserMot(jeu, v + 0x14, duree);
  tournerVers(jeu, v, d, arrivee);
  return 1;
}

// 0x236F6 : une attraction sans file. Le kiosque de l'attraction (objet de type 6) doit lui faire
// face, l'attraction être ouverte (octet +0x4B à 1, parc ouvert) et son mot +0x32 nul (à l'arrêt ?
// non établi), et son genre pas encore essayé.
function entrerDansLAttraction(jeu, cadre, v, voisine, d, arrivee) {
  const kiosque = cadre.appeler(0x23715, CHERCHER_SUR_LA_CASE, voisine, KIOSQUE);
  cadre.long(P.kiosque, kiosque);
  if (kiosque === 0) return CONTINUER;
  if (d !== opposee(jeu, octet(jeu, kiosque + 0x12))) return CONTINUER;
  const attraction = objetNumero(jeu, mot(jeu, kiosque + 0x16));
  cadre.long(P.cible, attraction);
  if (!(octet(jeu, attraction + 0x4B) === 1 && parcOuvert(jeu))) return CONTINUER;
  if (mot(jeu, attraction + 0x32) !== 0) return CONTINUER;
  if (dejaEssayee(jeu, v, GENRES_D_ATTRACTIONS + mot(jeu, attraction + 0x16))) return CONTINUER;
  poserMot(jeu, v + 0x16, numeroDeLObjet(jeu, attraction));
  poserOctet(jeu, v + 0xC, 0x4A);
  tournerVers(jeu, v, d, arrivee);
  return 1;
}

// 0x2382F : le début d'une file d'attente. Il y entre si 0x280E4 le permet, centré sur sa case,
// avec une des trois animations d'attente tirée au hasard.
// Le premier test est toujours vrai à ce point : il a passé celui de aFaitSonTemps, donc sa
// lassitude est sous 2 000 × le nombre d'attractions. (Le programme le fait quand même, avec ≤ là
// où l'on attendrait ≥ : sans doute une inversion, sans effet.) Il parcourt ensuite les objets de
// la case en comparant leur état à 0xC, sans rien faire du résultat : boucle morte, dont seule
// reste l'adresse où elle s'arrête, dans sa variable locale.
function entrerDansLaFile(jeu, cadre, v, voisine, d, arrivee) {
  const fiche = long(jeu, FICHE_DU_PARC);
  const lassitude = motSigne(jeu, v + 0x82);
  const essai = lassitude <= octet(jeu, fiche + 0x82) * 2000 || lassitude > 12000
    || ((long(jeu, PAS_DE_SIMULATION) - long(jeu, v + 0x75)) >>> 0) > 4000 || octet(jeu, fiche + 0x18) === 0;
  if (!essai) return CONTINUER;
  if ((cadre.appeler(0x238A1, PEUT_ENTRER_DANS_LA_FILE, v, voisine) & 0xFFFF) === 0) return CONTINUER;
  cadre.long(P.parcoursDeLaFile, visiteursSurLaCase(jeu, voisine).arret);
  poserOctet(jeu, v + 0x5A, (cadre.appeler(0x23909, HASARD) & 0xFFFF) % 3 + 1);
  poserOctet(jeu, v + 0xC, 0xA);
  poserOctet(jeu, v + 5, octet(jeu, v + 5) | 2);
  tournerVers(jeu, v, d, arrivee);
  poserOctet(jeu, v + 8, 0x80);
  poserOctet(jeu, v + 6, 0x80);
  return 1;
}

// 0x23993 : des toilettes (objet de type 0x18 dans l'état 2 ; l'état 4 est vraisemblablement la
// grande fontaine, non établi : 0x277E1 ne traite à part que son identifiant).
// Le modèle est l'élément numéro +0x16 de la table 0xCCA70 ; la saleté des toilettes est leur mot
// +0x3C.
function passerPresDesToilettes(jeu, cadre, v, voisine, d, arrivee) {
  const toilettes = cadre.appeler(0x239B2, CHERCHER_SUR_LA_CASE, voisine, INSTALLATION);
  cadre.long(P.toilettes, toilettes);
  if ((toilettes >>> 0) <= long(jeu, OBJETS)) return CONTINUER;
  const etat = octet(jeu, toilettes + 0xC);
  if (etat === 4) {
    cadre.appeler(0x23CC8, PROFITER_D_UN_ELEMENT, v, ELEMENTS + mot(jeu, toilettes + 0x16) * TAILLE_ELEMENT);
    return CONTINUER;
  }
  if (etat !== 2) return CONTINUER;

  const modele = ELEMENTS + mot(jeu, toilettes + 0x16) * TAILLE_ELEMENT;
  cadre.long(P.modeleToilettes, modele);
  const { nombre: occupants, arret } = visiteursSurLaCase(jeu, voisine);
  cadre.long(P.divers3C, occupants);
  cadre.long(P.parcours, arret);
  const salete = mot(jeu, toilettes + 0x3C);
  const desagrement = octet(jeu, modele + 0x31), saleteMax = octet(jeu, modele + 0x32);

  // Il y entre s'il reste une place, que l'estomac ou la soif dépassent 4, et qu'elles sont assez
  // propres.
  if (octet(jeu, modele + 0x33) > occupants
      && (octetSigne(jeu, v + 0x50) > 4 || octetSigne(jeu, v + 0x51) > 4) && salete < saleteMax) {
    poserOctet(jeu, v + 0x56, octet(jeu, v + 7));
    poserOctet(jeu, v + 0x57, octet(jeu, v + 9));
    poserOctet(jeu, v + 0xD, octet(jeu, v + 0xC));
    poserOctet(jeu, v + 0x58, octet(jeu, v + 0x12));
    tournerVers(jeu, v, d, arrivee);
    poserLong(jeu, v + 0x20, 0);
    poserOctet(jeu, v + 0xC, 0x4C);
    return 1;
  }

  // Sinon, trop sales, elles l'écœurent : il vomira dans 1 à 8 cases (bit 4 de ce qu'il a en main),
  // ou son bonheur baisse. Celui qui a déjà quelque chose en main est plus sensible.
  if (octet(jeu, v + 0x63) !== 0) {
    if (salete > ((saleteMax * 3) >> 2)) return vomirBientot(jeu, cadre, v, 0x23B4E, 0x23B6C);
    if (salete > (saleteMax >> 1)) {
      poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) - (desagrement + (salete >> 1)));
      return 1;
    }
  } else {
    if (salete > ((saleteMax * 7) >> 3)) return vomirBientot(jeu, cadre, v, 0x23BF8, 0x23C16);
    if (salete > ((saleteMax * 3) >> 2)) {
      poserOctet(jeu, v + 0x63, octet(jeu, v + 0x63) | 4);
      poserOctet(jeu, v + 0xC7, (cadre.appeler(0x23C51, HASARD) & 0xFFFF) % 8 + 1);
      poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) - ((salete >> 2) + (desagrement >> 1)));
      return 1;
    }
  }
  return CONTINUER;
}

function vomirBientot(jeu, cadre, v, retourDuTirage, retourDeLHumeur) {
  poserOctet(jeu, v + 0x63, octet(jeu, v + 0x63) | 4);
  poserOctet(jeu, v + 0xC7, (cadre.appeler(retourDuTirage, HASARD) & 0xFFFF) % 8 + 1);
  cadre.ebx = 8;                    // le diviseur du tirage
  cadre.appeler(retourDeLHumeur, HUMEUR, v);
  return 1;
}

// 0x23D25 : un décor voisin (mot +0 de la case négatif) — si c'est un élément de la table 0xCCA70,
// 0x277E1 lui en fait profiter. Pas plus d'une fois par période de 128 pas (mot +0x96), que
// 0x277E1 ne tient d'ailleurs que pour les arbres et les buissons.
function admirerUnArbreVoisin(jeu, cadre, v, voisine) {
  const decor = motSigne(jeu, voisine);
  cadre.long(P.divers3C, (voisine & HAUT) | (decor & 0xFFFF));
  if (decor >= 0) return;
  if ((long(jeu, PAS_DE_SIMULATION) >>> 7) === mot(jeu, v + 0x96)) return;
  for (let k = 0; ; k++) {
    cadre.long(P.divers44, k);
    if (mot(jeu, ELEMENTS + (k & 0xFFFF) * TAILLE_ELEMENT + 0x22) === 0) return;
    if (mot(jeu, ELEMENTS + (k & 0xFFFF) * TAILLE_ELEMENT + 0x26) === (decor & 0xFFFF)) {
      cadre.appeler(0x23DAE, PROFITER_D_UN_ELEMENT, v, ELEMENTS + (k & 0xFFFF) * TAILLE_ELEMENT);
      return;
    }
  }
}

// --- La direction -------------------------------------------------------------------------------

// 0x23DBA à 0x24379. Les sorties de l'allée, moins les directions interdites s'il en reste, donnent
// par la table 0xB533A la direction à prendre selon la direction d'arrivée. Quand la table ne
// décide pas (−1), il tire au hasard parmi les sorties, sauf le demi-tour. Le tirage n'est pas
// uniforme : c'est le nombre de sorties ET le hasard, ramené à la moitié quand il déborde (sur
// trois sorties : 1/4, 1/2, 1/4 ; sur deux : 1/2, 1/2). Ensuite, une chance sur deux de corriger :
//   - si l'on pouvait aller tout droit et qu'il tourne, il repart tout droit ;
//   - sinon, il fait demi-tour sur sa direction tirée (vers une case qui peut n'être pas une allée
//     : il s'y dira égaré à l'arrivée) ;
// chaque correction sous une condition sur la case visée (voir sortiesLuesDeTravers).
function choisirSaDirection(jeu, cadre, v, ici, arrivee, interdites) {
  // (Le numéro de la case est calculé sur 32 bits à partir de registres dont seule la moitié
  // basse a été écrite : la variable locale garde, en haut, un reste de l'adresse du visiteur.)
  const b7 = octet(jeu, v + 7), b9 = octet(jeu, v + 9);
  cadre.long(P.indexCase, ((((v & HAUT) | b9) << 6) + ((v & HAUT) | b7)) | 0);
  const indexCase = (b7 + b9 * 64) & 0xFFFF;
  let sorties = sortiesDuSol(jeu, octet(jeu, long(jeu, GRILLE) + indexCase * 4 + 2));
  cadre.long(P.sorties, sorties);
  if (sorties === 0) return seDireEgare(jeu, cadre, v);
  if ((sorties & ~interdites & 0xFFFF) !== 0) {
    sorties = sorties & ~interdites & 0xFFFF;
    cadre.long(P.sorties, sorties);
  }

  let direction = octetSigne(jeu, DIRECTION_NATURELLE + sorties * 4 + arrivee);
  cadre.long(P.choix, direction & 0xFFFF);
  if (direction === -1) {
    sorties &= ~(1 << (opposee(jeu, arrivee) & 0xFF));
    cadre.long(P.sorties, sorties);
    const possibles = [];
    for (let k = 0; k < 4; k++) {
      if (sorties & (1 << k)) {
        cadre.octet(P.possibles - possibles.length, k);
        possibles.push(k);
      }
    }
    const n = possibles.length;
    cadre.octet(P.direction, 4);
    cadre.octet(P.nombrePossibles, n);
    // La table ne rend −1 que pour deux sorties ou plus : il en reste au moins une. Sans elle, le
    // programme lirait un octet de pile jamais écrit.
    if (n === 0) throw new Error('0x22E22 : aucune sortie après le demi-tour');
    let tirage = n & (cadre.appeler(0x23EA2, HASARD) & 0xFF);
    cadre.octet(P.tirage, tirage);
    if (tirage > n - 1) {
      tirage = n >> 1;
      cadre.octet(P.tirage, tirage);
    }
    direction = possibles[tirage];
    cadre.long(P.choix, direction);

    if (arrivee !== direction) {
      const versLaVisee = sortiesLuesDeTravers(jeu, indexCase, direction);
      if (sorties & (1 << arrivee)) {
        if ((versLaVisee & (1 << opposee(jeu, arrivee))) && (cadre.appeler(0x23F45, HASARD) & 4)) {
          direction = arrivee;
          cadre.long(P.choix, direction);
        }
      } else if ((versLaVisee & (1 << opposee(jeu, arrivee))) && !(versLaVisee & (1 << direction))) {
        if (cadre.appeler(0x23FE9, HASARD) & 4) {
          direction = opposee(jeu, direction);
          cadre.long(P.choix, direction);
        }
      }
    }
  }

  cadre.long(P.divers44, (ici & HAUT) | octet(jeu, ici + 2));
  const sortiesIci = sortiesDuSol(jeu, octet(jeu, ici + 2));
  cadre.long(P.sortiesIci, sortiesIci);
  if (octet(jeu, ici + 3) & PANNEAU_SUR_LA_CASE) {
    const panneau = cadre.appeler(0x2403D, CHERCHER_SUR_LA_CASE, ici, ENTREE_OU_PANNEAU);
    cadre.long(P.panneau, panneau);
    if (panneau !== 0 && octet(jeu, panneau + 0xC) === 8) {
      const suivi = suivreLePanneau(jeu, cadre, v, panneau, sortiesIci);
      if (suivi !== CONTINUER) return suivi;
    }
  }
  tourner(jeu, v, direction & 0xFF);
  return 0;
}

// ANOMALIE, reproduite (0x23F13, 0x23F75, 0x23FC7) : pour décider d'une correction, le programme
// lit les sorties de la case visée dans la table des sorties par formes, 0xB4990, mais avec pour
// indice le mot des propriétés de son sol (0xB44D9) au lieu de sa forme (0xB44DC, comme partout
// ailleurs). Pour une allée (propriétés 2), il lit donc toujours la forme 2 : droite et bas.
function sortiesLuesDeTravers(jeu, indexCase, direction) {
  const visee = long(jeu, GRILLE) + (indexCase + motSigne(jeu, DECALAGES_DES_VOISINES + 2 * direction)) * 4;
  return octet(jeu, SORTIES_DES_FORMES + proprietesDuSol(jeu, octet(jeu, visee + 2)));
}

// 0x2402E : un panneau indicateur (objet de type 0x14 dans l'état 8) sur sa case. Ses trois
// flèches : +0x6D la sortie (le portique, objet de type 0x14 dans l'état 6, ou 4) et +0x68 sa
// direction ; +0x6B une boutique et +0x67 ; +0x69 une attraction et +0x66. Une flèche n'est suivie
// que si sa direction est une sortie de la case. Rend 0 s'il en suit une.
function suivreLePanneau(jeu, cadre, v, panneau, sortiesIci) {
  const base = long(jeu, OBJETS);
  if (mot(jeu, panneau + 0x6D) !== 0 && aFaitSonTemps(jeu, v, PLUS_DE_8000)) {
    const sortie = objetNumero(jeu, mot(jeu, panneau + 0x6D));
    cadre.long(P.cible, sortie);
    if (sortie > base && octet(jeu, sortie + 4) === ENTREE_OU_PANNEAU
        && (octet(jeu, sortie + 0xC) === 6 || octet(jeu, sortie + 0xC) === 4)
        && (sortiesIci & (1 << octet(jeu, panneau + 0x68)))) {
      tourner(jeu, v, octet(jeu, panneau + 0x68));
      return 0;
    }
  }
  if (mot(jeu, panneau + 0x6B) !== 0) {
    const boutique = objetNumero(jeu, mot(jeu, panneau + 0x6B));
    cadre.long(P.boutique, boutique);
    if (boutique > base && (cadre.appeler(0x241A1, EST_TENTE_PAR_LA_BOUTIQUE, v, boutique) & 0xFF) !== 0) {
      const tirage = (cadre.appeler(0x241AD, HASARD) & 0xFFFF) % 16;
      cadre.ebx = 0x10;             // le diviseur du tirage, encore là au tirage suivant
      cadre.octet(P.tiragePanneau, tirage);
      if (tirage > 8 && (sortiesIci & (1 << octet(jeu, panneau + 0x67)))) {
        tourner(jeu, v, octet(jeu, panneau + 0x67));
        return 0;
      }
    }
  }
  if (mot(jeu, panneau + 0x69) !== 0) {
    const attraction = objetNumero(jeu, mot(jeu, panneau + 0x69));
    cadre.long(P.cible, attraction);
    if (attraction > base && octet(jeu, attraction + 4) === ATTRACTION) {
      const genre = GENRES_D_ATTRACTIONS + mot(jeu, attraction + 0x16);
      cadre.long(P.genreAnnonce, genre);
      if (!dejaEssayee(jeu, v, genre)) {
        const attrait = mot(jeu, genre + 0xB8) * 4 + octet(jeu, genre + 0xA9) + motSigne(jeu, genre + 0xA6) * 4;
        cadre.esi = attrait;        // le programme le garde dans esi, que le générateur empile
        if ((cadre.appeler(0x242D1, HASARD) & 0xFFFF) % 256 + attrait > 200
            && (sortiesIci & (1 << octet(jeu, panneau + 0x66)))) {
          tourner(jeu, v, octet(jeu, panneau + 0x66));
          return 0;
        }
      }
    }
  }
  return CONTINUER;
}

// =============================================================================================
// 0x22834 — se choisir un but
// =============================================================================================

// Le visiteur égaré vise une case tirée au hasard à trois cases au plus de la sienne, ou le portique
// s'il a fait son temps (lassitude au-delà de 12 000 ici ; 0x22E22 le remet ensuite à l'état 6).
// ANOMALIE, reproduite : le but est un octet non signé, borné à la colonne 61 et à la rangée 55 ;
// près du bord gauche ou haut, une case « négative » devient 253 à 255, et la borne l'envoie à
// l'autre bout de la carte.
export function seChoisirUnBut(jeu, v) {
  dansLeCadre(jeu, 0, (cadre) => {
    if (aFaitSonTemps(jeu, v, PLUS_DE_12000)) {
      rentrer(jeu, v);
      return;
    }
    poserOctet(jeu, v + 0x56, (cadre.appeler(0x228D6, HASARD) & 0xFFFF) % 7 + octet(jeu, v + 7) - 3);
    cadre.ebx = 7;                  // le diviseur du premier tirage
    poserOctet(jeu, v + 0x57, (cadre.appeler(0x228F8, HASARD) & 0xFFFF) % 7 + octet(jeu, v + 9) - 3);
    if (octet(jeu, v + 0x56) > 61) poserOctet(jeu, v + 0x56, 61);
    if (octet(jeu, v + 0x57) > 55) poserOctet(jeu, v + 0x57, 55);
  });
}

// =============================================================================================
// 0x277E1 — profiter d'un élément du décor
// =============================================================================================

// Un arbre, un buisson ou un lampadaire (catégorie 7) réjouit le visiteur à raison d'un seizième de
// son prix (TROPICAL BUSH, 100 : +6), qui s'ajoute aussi au cumul de la fiche du parc ; la date est
// retenue pour n'en profiter qu'une fois par période de 128 pas. La grande fontaine (catégorie 15,
// identifiant 0x143), une fois par visiteur : +200 de bonheur, 1 000 de lassitude en moins, et le
// pas de son entrée dans le parc (mot long +0x75) divisé par deux. Les autres éléments ne font rien.
// Rend toujours 0.
// ANOMALIE, reproduite : +0x75 est un pas absolu, compté depuis le début de la partie ; le diviser
// par deux AUGMENTE le temps passé dans le parc (pas − entrée) de la moitié de ce pas. Dès que la
// partie a quelques milliers de pas (65 000 dans le parc de la démo), le visiteur enchanté par la
// fontaine a fait son temps (plus de 4 000 pas) et rentre chez lui à la case suivante. On voulait
// sans doute diviser le temps passé, pour qu'il reste plus longtemps.
// Non vérifié par les scénarios : la fontaine (aucune dans le parc de la démo).
export function profiterDUnElement(jeu, v, element) {
  return dansLeCadre(jeu, 8, (cadre) => {
    const categorie = mot(jeu, element + 0x2A);
    if (categorie === 7) {
      const plaisir = mot(jeu, element + 0x28) >> 4;
      poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) + plaisir);
      const fiche = long(jeu, FICHE_DU_PARC);
      poserLong(jeu, fiche + 0x37, long(jeu, fiche + 0x37) + plaisir);
      poserMot(jeu, v + 0x96, long(jeu, PAS_DE_SIMULATION) >>> 7);
    } else if (categorie === 0xF && (octet(jeu, v + 5) & 8) === 0) {
      cadre.long(8, (element & HAUT) | mot(jeu, element + 0x26));
      if (mot(jeu, element + 0x26) === LA_GRANDE_FONTAINE) {
        poserMot(jeu, v + 0x54, mot(jeu, v + 0x54) + 200);
        poserLong(jeu, v + 0x75, long(jeu, v + 0x75) >>> 1);
        poserMot(jeu, v + 0x82, mot(jeu, v + 0x82) - 1000);
        poserOctet(jeu, v + 5, octet(jeu, v + 5) | 8);
      }
    }
    cadre.long(4, 0);
    return 0;
  });
}

// =============================================================================================
// 0x280E4 — peut-il entrer dans cette file d'attente ?
// =============================================================================================

// `entree` est la case du début de la file. Non si un visiteur y attend déjà (états 0xC et 0x34 :
// la file est pleine jusqu'à son début), si le parc est fermé, si la file ne mène pas à une
// attraction (0x281D5 la suit jusqu'au kiosque), si l'attraction n'est pas ouverte (octet +0x4B),
// ou s'il en a déjà essayé le genre. Rend 1 ou 0.
export function peutEntrerDansLaFile(jeu, v, entree) {
  return dansLeCadre(jeu, 0x10, (cadre) => {
    const resultat = examinerLaFile(jeu, cadre, v, entree);
    cadre.long(4, resultat);
    return resultat;
  });
}

function examinerLaFile(jeu, cadre, v, entree) {
  const base = long(jeu, OBJETS);
  let o = objetNumero(jeu, motSigne(jeu, entree));
  for (; o > base; o = objetNumero(jeu, motSigne(jeu, o + 2))) {
    if (octet(jeu, o + 4) === VISITEUR && (octet(jeu, o + 0xC) === 0xC || octet(jeu, o + 0xC) === 0x34)) break;
  }
  cadre.long(0xC, o);
  if (o > base) return 0;                          // quelqu'un attend au début de la file
  if (!parcOuvert(jeu)) return 0;
  cadre.edx = o;                                   // edx garde la dernière adresse du parcours
  const attraction = cadre.appeler(0x2816A, ATTRACTION_AU_BOUT_DE_LA_FILE, entree);
  cadre.long(0x10, attraction);
  if (attraction === 0) return 0;
  if (octet(jeu, attraction + 0x4B) !== 1) return 0;
  const genre = GENRES_D_ATTRACTIONS + mot(jeu, attraction + 0x16);
  cadre.long(8, genre);
  if (dejaEssayee(jeu, v, genre)) return 0;
  return 1;
}

// =============================================================================================
// 0x68149 — la boutique le tente-t-elle ?
// =============================================================================================

// Rend 1 s'il y achèterait. Sinon rend 0, et le plus souvent pose une bulle qui dit pourquoi.
// Trois calculs selon ce que procure la boutique (octet +0x25 de son genre) : un objet (4), un jeu
// (8), à manger ou à boire (1, 2). La marge est le prix de vente en pour cent du prix coûtant ; les
// visiteurs en tolèrent 100 + le mot +0x06 de la fiche du parc (40 dans la démo : 140 %).
//
// Le programme ne rend le résultat que dans l'octet bas de eax, le reste étant un résidu de calcul
// que son seul appelant, 0x22E22, ignore (`test al, al`) : la réécriture rend 0 ou 1, et ne déclare
// pas de résultat au comparateur.
export function estTenteParLaBoutique(jeu, v, boutique) {
  return dansLeCadre(jeu, 0x10, (cadre) => {
    cadre.long(8, 0);
    cadre.long(0xC, 0);
    const genre = GENRES_DE_BOUTIQUES + mot(jeu, boutique + 0x16);
    cadre.long(0x10, genre);
    const resultat = choisirDAcheter(jeu, cadre, v, boutique, genre);
    cadre.octet(4, resultat);
    return resultat;
  });
}

function choisirDAcheter(jeu, cadre, v, boutique, genre) {
  if (mot(jeu, v + 0x6F) <= mot(jeu, genre + 0x4F)) {
    penser(jeu, v, BULLE_PAS_D_ARGENT);
    return 0;
  }
  const procure = octet(jeu, genre + 0x25);
  if ((procure & 4) && mot(jeu, genre + 0x58) !== 0) return estTenteParUnObjet(jeu, cadre, v, genre);
  if (procure & 8) return estTenteParUnJeu(jeu, cadre, v, genre);
  return aFaimOuSoif(jeu, v, boutique, genre);
}

function marge(jeu, genre) {
  return diviser(mot(jeu, genre + 0x4F) * 100, mot(jeu, genre + 0x4D));
}

// Deux fois ce que la marge dépasse la tolérance.
function excesDeMarge(jeu, genre) {
  return (marge(jeu, genre) - 100 - mot(jeu, long(jeu, FICHE_DU_PARC) + 6)) * 2;
}

function bonheur(jeu, v) {
  return motSigne(jeu, v + 0x54);
}

function mecontent(jeu, v) {
  return bonheur(jeu, v) < motSigne(jeu, long(jeu, FICHE_DU_PARC) + 2);
}

// 0x6819B : un objet (jouet, ballon, souvenir). Pas deux fois le même.
//   envie = bonheur/16 + 50 + argent/8 − 2 × (marge − tolérance) − prix/2
function estTenteParUnObjet(jeu, cadre, v, genre) {
  if ((mot(jeu, v + 0x52) & mot(jeu, genre + 0x58)) !== 0) {
    penser(jeu, v, BULLE_DEJA_EU);
    return 0;
  }
  const envie = ((bonheur(jeu, v) / 16) | 0) + 50 + (mot(jeu, v + 0x6F) >> 3)
    - excesDeMarge(jeu, genre) - (mot(jeu, genre + 0x4F) >> 1);
  cadre.long(8, envie);
  if (envie > 0) return 1;
  if (mecontent(jeu, v)) penser(jeu, v, BULLE_MECONTENT);
  else if (marge(jeu, genre) - 100 > 100) penser(jeu, v, BULLE_TROP_CHER);
  else if (mot(jeu, v + 0x6F) < 500) penser(jeu, v, BULLE_PAS_D_ARGENT);
  else penser(jeu, v, BULLE_PAS_TENTE);
  return 0;
}

// 0x682CC : un jeu (ARCADE, COCONUT SHY, DUCK SHOOT...). Pas deux fois le même.
//   envie = argent/16 + bonheur/8 − 2 × prix + 32 × octet +0x5D − 320 + mot +0x4D / 8
//           + 2 × octet +0x69
// (Pour les jeux de la démo, le mot +0x4D vaut 1 200 : +150.)
function estTenteParUnJeu(jeu, cadre, v, genre) {
  if ((mot(jeu, v + 0x52) & mot(jeu, genre + 0x58)) !== 0) {
    penser(jeu, v, BULLE_DEJA_EU);
    return 0;
  }
  const envie = (mot(jeu, v + 0x6F) >> 4) + ((bonheur(jeu, v) / 8) | 0) - mot(jeu, genre + 0x4F) * 2
    + octet(jeu, genre + 0x5D) * 32 - 320 + (mot(jeu, genre + 0x4D) >> 3) + octet(jeu, genre + 0x69) * 2;
  cadre.long(0xC, envie);
  if (envie > 0) return 1;
  if (octet(jeu, genre + 0x5D) < 5) penser(jeu, v, BULLE_JEU_PEU_ATTIRANT);
  else if (mot(jeu, genre + 0x4D) < 2000) penser(jeu, v, BULLE_JEU_DECEVANT);
  else if (mot(jeu, v + 0x6F) < 400) penser(jeu, v, BULLE_PAS_D_ARGENT);
  else if (mecontent(jeu, v)) penser(jeu, v, BULLE_MECONTENT);
  else penser(jeu, v, BULLE_PAS_TENTE);
  return 0;
}

// 0x683EE : à manger ou à boire. Seulement s'il n'est pas repu (estomac sous 9 pour ce qui se
// mange, soif sous 9 pour ce qui se boit), et si l'article n'est pas en rupture de stock — sinon
// rien, pas même une bulle.
//   envie = bonheur/16 + (mot +0x14 de la boutique)/256 + 32 × (apports de la boutique)
//           − 32 × (estomac + soif) + argent/8 − prix − 2 × (marge − tolérance)
// Le mot +0x14 de l'objet boutique : sens non établi (0 à 33 dans la démo, sans effet sous 256).
function aFaimOuSoif(jeu, v, boutique, genre) {
  const procure = octet(jeu, genre + 0x25);
  const estomac = octetSigne(jeu, v + 0x50), soif = octetSigne(jeu, v + 0x51);
  if (!((estomac < 9 && (procure & 1)) || (soif < 9 && (procure & 2)))) return 0;
  const article = octetSigne(jeu, genre + 0x67);
  if (article !== -1 && mot(jeu, STOCKS + article * 14) === 0) return 0;

  const apports = octetSigne(jeu, genre + 0x56) + octetSigne(jeu, genre + 0x57);
  const envie = ((bonheur(jeu, v) / 16) | 0) + ((motSigne(jeu, boutique + 0x14) / 256) | 0)
    + apports * 32 - (estomac + soif) * 32 + (mot(jeu, v + 0x6F) >> 3) - mot(jeu, genre + 0x4F)
    - excesDeMarge(jeu, genre);
  if (envie > 0) return 1;

  if (estomac > 3 && (procure & 1)) penser(jeu, v, BULLE_PAS_FAIM);
  else if (soif > 3 && (procure & 2)) penser(jeu, v, BULLE_PAS_SOIF);
  else if (marge(jeu, genre) - 100 > 100) penser(jeu, v, BULLE_TROP_CHER);
  else if (octetSigne(jeu, genre + 0x56) < 2 && (procure & 1)) penser(jeu, v, BULLE_PAS_BON);
  else if (octetSigne(jeu, genre + 0x57) < 2 && (procure & 2)) penser(jeu, v, BULLE_PAS_DESALTERANT);
  else if (mot(jeu, v + 0x6F) < 400) penser(jeu, v, BULLE_PAS_D_ARGENT);
  else if (mecontent(jeu, v)) penser(jeu, v, BULLE_MECONTENT);
  else penser(jeu, v, BULLE_PAS_TENTE);
  return 0;
}

// `memoire: 'entiere'` : ces fonctions écrivent dans les objets du parc et dans la carte, qui
// vivent dans le tas ; la comparaison appel par appel doit restaurer et comparer toute la mémoire.
export const reecritures = [
  { adresse: 0x22E22, nom: 'sePromener', fn: sePromener, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x22834, nom: 'seChoisirUnBut', fn: seChoisirUnBut, arguments: 1, memoire: 'entiere' },
  { adresse: 0x277E1, nom: 'profiterDUnElement', fn: profiterDUnElement, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x280E4, nom: 'peutEntrerDansLaFile', fn: peutEntrerDansLaFile, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x68149, nom: 'estTenteParLaBoutique', fn: estTenteParLaBoutique, arguments: 2, memoire: 'entiere' },
];

export const enAttente = [];
