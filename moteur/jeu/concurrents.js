// Les parcs concurrents : chaque mois, chaque concurrent fait tourner son parc — des visiteurs qui
// arrivent, mangent, boivent, jouent, font des attractions et repartent — puis décide, en joueur
// automatique, de ses embauches, de ses constructions, de ses prix et de ses emprunts.
//
// Réécriture lisible des fonctions 0x6E7E6, 0x6EE22, 0x7085C, 0x7376C et 0x73B82 du jeu d'origine :
//
//   0x6E7E6  preparerLesJoueurs        à la nouvelle partie (0x19EEE) et à la fin de l'année (0x7401C) :
//                                      les fiches marquées 7 deviennent le joueur ou un concurrent ;
//   0x6EE22  mettreAJourLesParcs       à chaque pas de simulation (0x12B1F) : le mois de chaque parc ;
//   0x7085C  simulerLeParcConcurrent   les visiteurs d'un parc concurrent, en moyennes ;
//   0x7376C  construireUneAttraction   un concurrent achète une attraction ;
//   0x73B82  construireUneBoutique     un concurrent achète une boutique.
//
// Chaque constante vient du programme de 1994 ; `moteur/node/comparer.mjs` compare chaque appel à la
// transcription, `moteur/node/verifier.mjs` rejoue la même partie avec et sans ce module. Ce qui n'est
// pas établi est dit « non établi » ; les anomalies du programme sont reproduites et signalées.
//
// --- Un concurrent n'a pas de carte ------------------------------------------------------------------
//
// Le parc d'un concurrent n'existe que par sa fiche de parc (0x250 octets en 0xCF1E0) : aucun objet,
// aucune case. Ses visiteurs sont un nombre et des moyennes — contentement, estomac, soif, argent,
// ennui, fatigue —, ses attractions et ses boutiques des compteurs et des moyennes de caractéristiques
// prises dans les catalogues de référence. Une fois par mois (1 000 pas), décalés de 40 pas d'un
// concurrent à l'autre, 0x7085C fait passer le mois à ses visiteurs, puis 0x6EE22 le fait décider.
//
// --- La fiche d'un joueur ([0xD3B00] + n × 0x222, dans le tas) -----------------------------------------
//
// 25 fiches, le joueur humain et ses concurrents (docs/retro-ingenierie.md § 7). Ce que lisent et
// écrivent ces fonctions :
//
//   +0     octet  le type : 0 absent, 1 joueur humain, 3 concurrent, 6 hors jeu (non établi : son
//                 mois est sauté), 7 à préparer (0x6E7E6)
//   +2     mot    le numéro de sa fiche de parc (0xCF1E0 + numéro × 0x250)
//   +5     octet  le terrain qu'il occupe dans la table des terrains 0xB7B38 ; −1 aucun
//   +6     long   le capital de départ (100 000 dans tous les modèles) ; +0xA le reçoit à la préparation
//   +0xA   long   le solde en banque, signé
//   +0x12  long   le prêt, signé : il coûte chaque mois prêt × [0xD668E] / 16 384
//   +0x1A  octet  le caractère : la ligne des tables de décision (0 à 4)
//   +0x1B  octet  la conduite : leur colonne (0 à 4) ; elle change quand l'argent manque (voir +0x9D)
//   +0x1C  octet  le goût : la colonne des tables du choix des attractions et du décor (0 à 4)
//   +0x1E  octet  la prudence : la colonne des tables du réglage des attractions et de la conduite de
//                 repli (0 à 4). Les quatre noms sont de convention : ce sont les indices des tables,
//                 leur sens au-delà de ce que disent les tables n'est pas établi
//   +0x1F  octet  l'aléa : chaque tirage de ses décisions est pris modulo aléa + 1 (0 à 3)
//   +0x27  octet signé  six penchants, de −5 à 5 (nuls dans les modèles 0xBA840 ; qui les pose, non
//   ...                 établi). +0x27 pèse le prix d'une attraction et relève ses prix ; +0x28 baisse
//   +0x2C               le prix d'entrée ; +0x29 et +0x2B pèsent l'intensité et la capacité d'une
//                       attraction et règlent la vitesse des attractions ; +0x2A, +0x2B, +0x2C jouent
//                       sur le personnel ; +0x2C est en outre une réserve de décor, que l'achat de décor
//                       consomme
//   +0x2E  mot    la période de sa mise à jour, en pas (1 000 : un mois)
//   +0x33  mot    le compteur de la période ; posé à 40 × numéro de parc par 0x6E7E6
//   +0x35  mot signé  le besoin d'argent : monte quand il ne peut pas embaucher, construire, ou quand
//                     son solde est bas ; au-delà de prêt / 256 + 100, il emprunte 50 000 ; sous −100,
//                     il en rembourse 50 000
//   +0x37  long   ce qu'il a dépensé en constructions ; +0x37 + 4 × âge : dix cases, qu'une attraction
//                 retirée diminue de son prix à la case de son âge en années (sens exact non établi)
//   +0x63  octet  par genre d'attraction (catalogue de référence 0xB16F8) : 0 pas construite, l'année
//                 de construction + 1, −1 interdite (posé par 0x6E7E6 pour cinq genres)
//   +0x83  octet  par genre de boutique (catalogue 0xB2FF8) : l'année de construction (0 l'année 0,
//                 d'où une boutique rachetable la première année)
//   +0x95  mot    le rang de sa préparation (compteur 0xD77A2)
//   +0x9D  octet  sa conduite d'origine, que +0x1B retrouve quand il est riche
//   +0xA1  mot    1 860 à la préparation (sens non établi)
//   +0xA3  mot    par joueur j, en +0xA3 + 2 × numéro de parc de j : des parts de son parc (0x73EE8,
//                 hors de ce module, les estime au cours de l'action du parc, +0x66) ; remises à zéro
//                 à la préparation
//
// --- La fiche d'un parc (0xCF1E0 + numéro × 0x250) -----------------------------------------------------
//
// Celle du joueur courant est désignée par [0xD3818] (§ 10.8). Pour un concurrent, ces fonctions en
// font les comptes de son parc :
//
//   +0, +2  mots   les seuils du contentement (content, mécontent) ; +4 le jugement du prix d'entrée ;
//                  +6 la marge tolérée ; +8, +0xA, +0xB, +0xD des coefficients de l'humeur (§ 10.2)
//   +0xF   octet signé  l'attraction projetée (genre), −1 aucune ; +0x10 long le pas du projet ;
//                       +0x14 long le bénéfice mensuel au moment du projet
//   +0x18  octet  parc ouvert
//   +0x1D  mot    le prix d'entrée
//   +0x1F  mot signé  les visiteurs présents
//   +0x21  octet signé  l'attrait (retiré d'un point par attraction retirée, jusqu'à −19)
//   +0x23  long   la recette des entrées ; +0x2B celle des boutiques et des jeux (lots déduits)
//   +0x33  mot    les visiteurs venus ; +0x47 octet ceux du dernier mois
//   +0x3B  long   les salaires versés ; +0x3F les lots gagnés aux jeux ; +0x43 le contentement emporté
//                 par les partants
//   +0x48  octet  l'affluence : le plafond des arrivées d'un mois, et l'attrait de base (20)
//   +0x52  mot    un fléau qui ronge les stocks et les amuseurs (les voyous, vraisemblablement) ; +0xDA
//                 le réduit chaque mois (les gardiens ?) — non établi
//   +0x60, +0x62  mots   10 à la préparation ; +0x62 × +0x66 est la valeur du parc qui borne ses emprunts
//   +0x66  long   10 000 : le cours de son action, vraisemblablement (0x73EE8) ; +0x6A, +0x6E, +0x72 :
//                 10 000, 10 001, 9 999 (non établi)
//   +0x76  octet  des conditions du mois (la météo, vraisemblablement : 0xB14CC en donne l'intensité)
//   +0x77  octet  1 : + 100 de contentement
//   +0x7C, +0x7E  mots   le petit et le grand décor, que le contentement moyen reçoit chaque mois (un
//                        quart de +0x7C, +0x7E entier) ; une pièce de grand décor y compte pour 9 (voir
//                        `depenserLaReserveDeDecor` ; ce qu'est ce décor, non établi)
//   +0x80  mot signé  la saleté : + un quart des repas et des boissons servis, − 32 par agent d'entretien
//   +0x82  octet  les attractions ; +0x8A long la somme de leurs intensités (fiche +0xA9), +0x90 mot sa
//                 moyenne ; +0x8E mot la somme de leurs capacités (+0xA6) ; +0x92 octet le délai moyen
//                 (+0xB8), que le concurrent règle entre 0 et 6 ; +0x93 mot le seuil d'usure moyen (+0xA8) ;
//                 +0x95 mot la durée moyenne (+0xAC) ; +0x97 long l'usure ; +0x9B long leur âge moyen
//                 (+1 par mois de marche) ; +0x9F mot les attractions retirées ; +0xA1 mot les pannes
//   +0x83  octet  les toilettes ; +0x84 long leur usage ; +0x88 mot leur capacité (non établi : aucun
//                 concurrent n'en construit ici)
//   +0xAA  long   la somme des contentements ; +0xAE le contentement moyen
//   +0xB2, +0xB4  mots signés  l'estomac et la soif moyens ; +0xB6 long l'argent moyen ; +0xBA long
//                              l'ennui moyen (temps depuis la dernière attraction) ; +0xBE la fatigue
//   +0xC2  mot    le personnel ; +0xC4 les licenciés ; +0xCC les mécaniciens, +0xCE leur salaire ; +0xD0
//                 les agents d'entretien, +0xD2 leur salaire ; +0xD4 les amuseurs, +0xD6 long leur
//                 salaire moyen
//   +0xE0  octet  les boutiques ; +0xE7 les boutiques de souvenirs, +0xE8 leur prix moyen, +0xEA leur
//                 coût ; +0xEC les stands de nourriture, +0xEE, +0xF0 l'apport moyen à l'estomac et à la
//                 soif, +0xF2 le prix, +0xF4 le coût, +0xF6 le stock (par +0xED, non établi) ; +0xF8 les
//                 buvettes, +0xFA, +0xFC, +0xFE, +0x100 de même, +0x102 le stock (par +0xF9) ; +0x104
//                 les jeux, +0x105 long leur attrait (non établi), +0x109 mot, +0x10B octet la chance,
//                 +0x10C le lot, +0x10E le prix
//
// --- Les catalogues de référence --------------------------------------------------------------------
//
// Un concurrent construit d'après les catalogues de référence, pas d'après celui de la partie :
//
//   0xB16F8  les attractions, 200 octets : +0x22 mot non nul tant que la table continue ; +0xA2 long le
//            prix ; +0xA6 mot la capacité ; +0xA8 le seuil d'usure ; +0xA9 l'intensité ; +0xAA mot le
//            délai d'apparition (les attractions dont (+0xAA − 5) / 10 dépasse 12 × mois + 1 ne sont pas
//            encore proposées, sens exact non établi) ; +0xAC la durée ; +0xAE mot (6 partout) ; +0xB0 le
//            mode (6 : à train) ; +0xB4 la voie (2 : montagnes russes à éléments) ; +0xB5 mot, dont les
//            valeurs 4, 0x10 et 0x12 (RIVIERE, CIRCUIT AUTO, LOOPING, TIRE-BOUCHON, MEGA SPLASH)
//            interdisent le genre aux concurrents ; +0xB8 le délai d'animation. 29 genres.
//   0xB2FF8  les boutiques, 0x6B octets : +0x22 mot non nul tant que la table continue ; +0x25 la
//            famille (1 manger, 2 boire, 3 les glaces, 4 souvenirs, 8 jeux) ; +0x49 long le prix de
//            construction ; +0x4D le coût ; +0x4F le prix ; +0x56, +0x57 les apports ; +0x58 mot non nul
//            pour les souvenirs et les jeux. 17 genres.
//   0xBDD92  six tailles de montagnes russes, 0x27 octets : +0 long le prix (15 000 à 60 000),
//            +0x1D + caractère la capacité, +0x22 + caractère l'intensité (lues par 0x73969, hors de ce
//            module).
//
// --- Les tables de décision (données statiques, 5 × 5) ------------------------------------------------
//
// Indexées par [caractère][conduite] sauf mention : octets en table + 5 × ligne + colonne, mots en
// table + 10 × ligne + 2 × colonne, longs en table + 0x14 × ligne + 4 × colonne. Leur usage :
//
//   0xBDE7C  marge des boutiques, en % du coût (5 à 140)
//   0xBDE95  part du hasard et de l'affluence dans le prix d'entrée (octet signé, 4 à 32)
//   0xBDEAE  contentement exigé (−2 à −3 000) : au-dessus, une attraction achetée apaise davantage son
//            besoin d'argent ; en dessous, n'en trouver aucune le presse davantage
//   0xBDEE0  contentement sous lequel il embauche un amuseur (−1 à −750), au-dessus duquel il en débauche
//   0xBDF2B, 0xBDF44, 0xBDF76, 0xBDFA8  poids du choix d'une boutique : prix de construction, prix de
//            vente, apport à l'estomac, apport à la soif
//   0xBDFDA  poids de la capacité dans le choix d'une attraction
//   0xBE070  solde sous lequel il se sent pauvre (2 000 à 18 000)
//   0xBE138  part du solde, en 1 024es, pour une montagne russe
//   0xBE16A  mois de validité d'un projet (moins 3) ; et [caractère][goût], multiple du bénéfice
//            mensuel qu'il escompte pour une attraction
//   0xBE183  écart de score qu'il faut pour préférer attendre une attraction
//   0xBE1B5  estomac moyen sous lequel il ajoute des stands (octet signé)
//   0xBE1CE  attractions par stand
//   0xBE1E7  [goût][conduite] poids de l'intensité ; 0xBE219 [goût][conduite] poids du prix
//   0xBE232  saleté tolérée par agent d'entretien
//   0xBE264, 0xBE296  réserves à garder après une attraction, après un stand
//   0xBE2C8, 0xBE32C  [goût][conduite] réserves à garder après le petit et le grand décor
//   0xBE390, 0xBE3DB  [caractère][prudence] le contentement sous lequel il accélère ses attractions,
//                     celui au-dessus duquel il les ralentit
//   0xBE40D, 0xBE3C2  l'usure au-delà de laquelle il veut un mécanicien de plus (0xBE40D, diminuée de
//                     ses penchants et d'un tirage), celle au-delà de laquelle il l'embauche d'office
//                     (0xBE3C2) ; [caractère][prudence], elles bornent aussi le réglage de la vitesse :
//                     il n'accélère que sous 0xBE3C2, ne ralentit qu'au-delà de 0xBE40D
//   0xBE426  [caractère][prudence] la conduite de repli quand il est pauvre
//
// Les autres tables de la zone (0xBDF12, 0xBE00C, 0xBE0A2, 0xBE0D4, 0xBE106, 0xBE24B) ne sont pas lues
// ici.

// --- les données -----------------------------------------------------------------------------------

const FICHES_DES_JOUEURS = 0xD3B00;     // pointeur : 25 fiches de 0x222 octets
const FIN_DES_FICHES = 0xD3820;         // pointeur : la fin de la table
const TAILLE_FICHE = 0x222;
const NOMBRE_DE_FICHES = 25;
const JOUEUR_COURANT = 0xD665C;         // mot
const COMPTES_DU_JOUEUR = 0xD3814;      // pointeur : ses comptes (0xD443C + joueur × 0x6C2)
const COMPTES = 0xD443C, TAILLE_COMPTES = 0x6C2;
const PARC_DU_JOUEUR = 0xD3818;         // pointeur : la fiche de parc du joueur courant
const PARCS = 0xCF1E0, TAILLE_PARC = 0x250;
const PAS_DE_SIMULATION = 0xD3AFC;      // long : 1 000 pas par mois, 12 000 par an
const PAS_PAR_AN = 12000, PAS_PAR_MOIS = 1000;
const TAUX_D_INTERET = 0xD668E;         // mot signé : l'intérêt mensuel, en 16 384es (140 à la nouvelle partie)
const PREPARES = 0xD77A2;               // octet : les fiches préparées
const METEO = 0xB14CC;                  // octet : l'intensité des conditions du mois (non établi)

const HASARD = 0x18B92;
const RELEVER_LES_STATISTIQUES = 0x68E34;
const CONSTRUIRE_UNE_MONTAGNE_RUSSE = 0x73969;

// Les terrains du monde : 24 fiches de 28 octets, closes par un octet nul ; +0x1A le joueur qui
// l'occupe, −1 libre.
const TERRAINS = 0xB7B38, TAILLE_TERRAIN = 0x1C, OCCUPANT = 0x1A;

// Le catalogue des métiers (docs/retro-ingenierie.md § 10.5) : fiches de 0x36 octets, +0x22 mot non nul
// tant que la table continue, +0x24 le salaire d'embauche, +0x2C la sorte (2 amuseur, 8 mécanicien,
// 0x16 agent d'entretien).
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;

// Les catalogues de référence.
const ATTRACTIONS = 0xB16F8, TAILLE_ATTRACTION = 200;
const BOUTIQUES = 0xB2FF8, TAILLE_BOUTIQUE = 0x6B;
const MONTAGNES_RUSSES = 0xBDD92, TAILLE_MONTAGNE_RUSSE = 0x27;

// Les champs de la fiche d'un joueur.
const TYPE = 0, NUMERO_DE_PARC = 2, TERRAIN = 5, CAPITAL = 6, SOLDE = 0xA, PRET = 0x12;
const CARACTERE = 0x1A, CONDUITE = 0x1B, GOUT = 0x1C, PRUDENCE = 0x1E, ALEA = 0x1F;
const PENCHANT_27 = 0x27, PENCHANT_28 = 0x28, PENCHANT_29 = 0x29, PENCHANT_2A = 0x2A, PENCHANT_2B = 0x2B;
const RESERVE_DE_DECOR = 0x2C;
const PERIODE = 0x2E, COMPTEUR = 0x33, BESOIN_D_ARGENT = 0x35, DEPENSES_DE_CONSTRUCTION = 0x37;
const ANNEE_DE_L_ATTRACTION = 0x63, ANNEE_DE_LA_BOUTIQUE = 0x83;
const RANG = 0x95, CONDUITE_D_ORIGINE = 0x9D, CHAMP_A1 = 0xA1, PARTS = 0xA3;
const JOUEUR = 1, CONCURRENT = 3, HORS_JEU = 6, A_PREPARER = 7;

// Les champs de la fiche d'un parc.
const PROJET = 0xF, DATE_DU_PROJET = 0x10, BENEFICE_DU_PROJET = 0x14, OUVERT = 0x18;
const PRIX_D_ENTREE = 0x1D, VISITEURS = 0x1F, ATTRAIT = 0x21;
const RECETTE_DES_ENTREES = 0x23, RECETTE_DES_BOUTIQUES = 0x2B, VENUS = 0x33;
const SALAIRES_VERSES = 0x3B, LOTS_GAGNES = 0x3F, CONTENTEMENT_EMPORTE = 0x43, ARRIVES = 0x47;
const AFFLUENCE = 0x48, FLEAU = 0x52, ACTIONS = 0x62, COURS = 0x66;
const CONDITIONS = 0x76, BONUS_77 = 0x77, PETIT_DECOR = 0x7C, GRAND_DECOR = 0x7E, SALETE = 0x80;
const NOMBRE_D_ATTRACTIONS = 0x82, TOILETTES = 0x83, USAGE_DES_TOILETTES = 0x84, CAPACITE_DES_TOILETTES = 0x88;
const INTENSITE_TOTALE = 0x8A, CAPACITE_TOTALE = 0x8E, INTENSITE_MOYENNE = 0x90, DELAI_MOYEN = 0x92;
const SEUIL_D_USURE = 0x93, DUREE_MOYENNE = 0x95, USURE = 0x97, AGE_MOYEN = 0x9B;
const RETIREES = 0x9F, PANNES = 0xA1;
// +0xA7 : la taille de sa dernière montagne russe à éléments (0x73969 ; 0xFF : aucune ; qui la relit :
// non établi).
const MONTAGNE_RUSSE = 0xA7;
const CONTENTEMENT_TOTAL = 0xAA, CONTENTEMENT = 0xAE, ESTOMAC = 0xB2, SOIF = 0xB4, ARGENT = 0xB6;
const ENNUI = 0xBA, FATIGUE = 0xBE;
const PERSONNEL = 0xC2, LICENCIES = 0xC4;
const MECANICIENS = 0xCC, SALAIRE_DES_MECANICIENS = 0xCE, AGENTS = 0xD0, SALAIRE_DES_AGENTS = 0xD2;
const AMUSEURS = 0xD4, SALAIRE_DES_AMUSEURS = 0xD6, CONTRE_LE_FLEAU = 0xDA;
const NOMBRE_DE_BOUTIQUES = 0xE0;
const SOUVENIRS = 0xE7, PRIX_DES_SOUVENIRS = 0xE8, COUT_DES_SOUVENIRS = 0xEA;
// Les stands de nourriture et les buvettes ont des champs de même forme, à 0xC octets d'écart.
const NOURRITURE = { nombre: 0xEC, stock: 0xED, estomac: 0xEE, soif: 0xF0, prix: 0xF2, cout: 0xF4, reserve: 0xF6 };
const BOISSONS = { nombre: 0xF8, stock: 0xF9, estomac: 0xFA, soif: 0xFC, prix: 0xFE, cout: 0x100, reserve: 0x102 };
const JEUX = 0x104, ATTRAIT_DES_JEUX = 0x105, CHAMP_109 = 0x109, CHANCE_AU_JEU = 0x10B, LOT = 0x10C, PRIX_DU_JEU = 0x10E;

// Les tables de décision.
const MARGE_DES_BOUTIQUES = 0xBDE7C, PART_DU_PRIX_D_ENTREE = 0xBDE95, CONTENTEMENT_EXIGE = 0xBDEAE;
const CONTENTEMENT_DES_AMUSEURS = 0xBDEE0;
const POIDS_DU_PRIX_DE_BOUTIQUE = 0xBDF2B, POIDS_DU_PRIX_DE_VENTE = 0xBDF44;
const POIDS_DE_L_ESTOMAC = 0xBDF76, POIDS_DE_LA_SOIF = 0xBDFA8, POIDS_DE_LA_CAPACITE = 0xBDFDA;
const SOLDE_DE_PAUVRETE = 0xBE070, PART_POUR_UNE_MONTAGNE_RUSSE = 0xBE138, MOIS_D_UN_PROJET = 0xBE16A;
const ECART_POUR_ATTENDRE = 0xBE183, ESTOMAC_DES_STANDS = 0xBE1B5, ATTRACTIONS_PAR_STAND = 0xBE1CE;
const POIDS_DE_L_INTENSITE = 0xBE1E7, POIDS_DU_PRIX = 0xBE219, SALETE_PAR_AGENT = 0xBE232;
const RESERVE_D_ATTRACTION = 0xBE264, RESERVE_DE_STAND = 0xBE296;
const RESERVE_DU_PETIT_DECOR = 0xBE2C8, RESERVE_DU_GRAND_DECOR = 0xBE32C;
const CONTENTEMENT_POUR_ACCELERER = 0xBE390, USURE_DES_MECANICIENS = 0xBE3C2;
const CONTENTEMENT_POUR_RALENTIR = 0xBE3DB, USURE_TOLEREE = 0xBE40D, CONDUITE_DE_REPLI = 0xBE426;

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
const ajouterALOctet = (jeu, a, v) => ecrireOctet(jeu, a, octet(jeu, a) + v);

// Les divisions du processeur : `idiv` tronque vers zéro, `div` divise sans signe, `idiv16` est la
// division de 16 bits (`cwd` ; `idiv` d'un mot) ; un diviseur nul ou un quotient qui déborde lèvent
// une exception, comme sur la machine (et dans la transcription).
function idiv(a, b) {
  a |= 0; b |= 0;
  if (b === 0) throw new Error('division par zero');
  const q = Math.trunc(a / b);
  if (q >= 2 ** 31 || q < -(2 ** 31)) throw new Error('debordement de division');
  return q;
}
function div(a, b) {
  a >>>= 0; b >>>= 0;
  if (b === 0) throw new Error('division par zero');
  return Math.floor(a / b);
}
function idiv16(a, b) {
  a = s16(a); b = s16(b);
  if (b === 0) throw new Error('division par zero');
  const q = Math.trunc(a / b);
  if (q > 32767 || q < -32768) throw new Error('debordement de division');
  return q;
}
// La division par une puissance de deux que le compilateur écrit `cdq ; shl edx, k ; sbb eax, edx ;
// sar eax, k` : tronquée vers zéro, comme `idiv`.
const quotient = (v, diviseur) => Math.trunc((v | 0) / diviseur);

const mul = Math.imul;
const pasDeSimulation = (jeu) => motLong(jeu, PAS_DE_SIMULATION);
const annee = (jeu) => div(pasDeSimulation(jeu), PAS_PAR_AN);
const baseDesFiches = (jeu) => motLong(jeu, FICHES_DES_JOUEURS);
const ficheDuParc = (jeu, fiche) => PARCS + mot(jeu, fiche + NUMERO_DE_PARC) * TAILLE_PARC;

// Les tables de décision, lues à la ligne et à la colonne voulues.
const octetDeTable = (jeu, table, ligne, colonne) => octet(jeu, table + 5 * ligne + colonne);
const octetSigneDeTable = (jeu, table, ligne, colonne) => octetSigne(jeu, table + 5 * ligne + colonne);
const motDeTable = (jeu, table, ligne, colonne) => mot(jeu, table + 10 * ligne + 2 * colonne);
const motSigneDeTable = (jeu, table, ligne, colonne) => motSigne(jeu, table + 10 * ligne + 2 * colonne);
const longDeTable = (jeu, table, ligne, colonne) => motLongSigne(jeu, table + 0x14 * ligne + 4 * colonne);

// Un tirage du hasard du concurrent : de 0 à son aléa.
const tirage = (jeu, fiche) => {
  const alea = octet(jeu, fiche + ALEA);
  return (jeu.appeler(HASARD) & 0xFFFF) % (alea + 1);
};

// --- la préparation des joueurs ---------------------------------------------------------------------

// 0x6E7E6 — préparer les fiches marquées 7 : le joueur courant, ou un concurrent.
//
// La nouvelle partie (0x19EEE) copie les 25 modèles de fiches de 0xBA840, libère les 24 terrains du
// monde et marque 7 la fiche du joueur courant ; la fin de l'année (0x7401C, hors de ce module) appelle
// aussi cette fonction, quand elle a marqué 7 des fiches libres pour de nouveaux concurrents. Chaque
// fiche marquée 7, dans l'ordre :
//
//  - reçoit un compteur de période de 40 × numéro de parc : les parcs sont mis à jour à 40 pas
//    d'écart ; le compteur des préparées (0xD77A2) monte d'un ;
//  - si c'est le joueur courant : il devient le joueur (type 1), prend le dernier terrain qu'il occupe
//    dans la table des terrains, ses comptes retiennent sa fiche et son parc (octets +0x40 et +0x41),
//    et son parc reçoit ses seuils de contentement et ses coefficients selon les options de la
//    partie (0xD66F2, 0xD66F5 : non établi, deux niveaux de difficulté vraisemblablement) ; son parc
//    est fermé ;
//  - sinon c'est un concurrent (type 3) : il prend un terrain libre, chacun avec une chance sur huit
//    dans l'ordre de la table, à défaut le premier libre ; son parc reçoit des seuils fixes, s'ouvre,
//    et cinq genres d'attractions lui sont interdits ; son solde part du capital, plus 50 000 par
//    point de l'option 0xD66F6 ;
//  - enfin le parc, joueur ou concurrent, repart de zéro : sans visiteurs, sans projet, le salaire de
//    chaque sorte de personnel pris au catalogue des métiers (la moyenne des amuseurs), l'action à
//    10 000 pour 10 parts, l'affluence de base (0xB78CC), et ses parts dans les autres parcs effacées.
//
// Puis la mise à jour des parcs (0x6EE22) est faite une fois.
//
// Anomalie reproduite : un concurrent qui ne trouve aucun terrain libre redevient absent (type 0), et
// la fonction s'arrête là — les fiches suivantes restent marquées 7, et 0x6EE22 n'est pas appelée.
export function preparerLesJoueurs(jeu) {
  for (let fiche = baseDesFiches(jeu); fiche < motLong(jeu, FIN_DES_FICHES); fiche = (fiche + TAILLE_FICHE) >>> 0) {
    if (octet(jeu, fiche + TYPE) !== A_PREPARER) continue;
    ecrireMot(jeu, fiche + COMPTEUR, mul(mot(jeu, fiche + NUMERO_DE_PARC), 40));
    ajouterALOctet(jeu, PREPARES, 1);
    const numero = idiv(fiche - baseDesFiches(jeu), TAILLE_FICHE);
    let parc;
    if (mot(jeu, JOUEUR_COURANT) === numero) {
      parc = preparerLeJoueur(jeu, fiche, numero);
    } else {
      if (!trouverUnTerrain(jeu, fiche, numero)) {
        ecrireOctet(jeu, fiche + TYPE, 0);
        return;
      }
      parc = preparerUnConcurrent(jeu, fiche);
    }
    remettreLeParcAZero(jeu, fiche, parc);
  }
  mettreAJourLesParcs(jeu);
}

function preparerLeJoueur(jeu, fiche, numero) {
  for (let k = 0; octet(jeu, TERRAINS + k * TAILLE_TERRAIN) !== 0; k = (k + 1) & 0xFF) {
    if (octetSigne(jeu, TERRAINS + k * TAILLE_TERRAIN + OCCUPANT) === mot(jeu, JOUEUR_COURANT)) {
      ecrireOctet(jeu, fiche + TERRAIN, k);
    }
  }
  ecrireOctet(jeu, fiche + TYPE, JOUEUR);
  ecrireMot(jeu, fiche + NUMERO_DE_PARC, mot(jeu, JOUEUR_COURANT));
  ecrireOctet(jeu, COMPTES + mot(jeu, JOUEUR_COURANT) * TAILLE_COMPTES + 0x40, numero);
  ecrireOctet(jeu, COMPTES + mot(jeu, JOUEUR_COURANT) * TAILLE_COMPTES + 0x41, octet(jeu, fiche + NUMERO_DE_PARC));
  const parc = ficheDuParc(jeu, fiche);
  ecrireOctet(jeu, parc + OUVERT, 0);
  const option2 = octet(jeu, 0xD66F2), option5 = octet(jeu, 0xD66F5);
  ecrireMot(jeu, parc + 0, 200 + option2 * 50);
  ecrireMot(jeu, parc + 2, -200 + option2 * 50);
  ecrireMot(jeu, parc + 4, 100 + (2 - option5) * 40);
  ecrireMot(jeu, parc + 6, 25 + (2 - option5) * 15);
  ecrireMot(jeu, parc + 8, 104 + (2 - option2) * 20);
  ecrireOctet(jeu, parc + 0xA, 0x10);
  ecrireMot(jeu, parc + 0xB, 0x80);
  ecrireMot(jeu, parc + 0xD, 10);
  return parc;
}

// Un terrain libre pour un concurrent : rend faux s'il n'y en a aucun.
function trouverUnTerrain(jeu, fiche, numero) {
  ecrireOctet(jeu, fiche + TERRAIN, -1);
  const occuper = (k) => {
    ecrireOctet(jeu, TERRAINS + k * TAILLE_TERRAIN + OCCUPANT, numero);
    ecrireOctet(jeu, fiche + TERRAIN, k);
  };
  for (let k = 0; octet(jeu, TERRAINS + k * TAILLE_TERRAIN) !== 0; k = (k + 1) & 0xFF) {
    if (octetSigne(jeu, TERRAINS + k * TAILLE_TERRAIN + OCCUPANT) !== -1) continue;
    if ((jeu.appeler(HASARD) & 0xFFFF) % 8 !== 0) continue;
    occuper(k);
    break;
  }
  if (octetSigne(jeu, fiche + TERRAIN) === -1) {
    for (let k = 0; octet(jeu, TERRAINS + k * TAILLE_TERRAIN) !== 0; k = (k + 1) & 0xFF) {
      if (octetSigne(jeu, TERRAINS + k * TAILLE_TERRAIN + OCCUPANT) === -1) { occuper(k); break; }
    }
  }
  return octetSigne(jeu, fiche + TERRAIN) !== -1;
}

function preparerUnConcurrent(jeu, fiche) {
  ecrireOctet(jeu, fiche + TYPE, CONCURRENT);
  const parc = ficheDuParc(jeu, fiche);
  ecrireMot(jeu, parc + 0, 300);
  ecrireMot(jeu, parc + 2, -150);
  ecrireMot(jeu, parc + 4, 160);
  ecrireMot(jeu, parc + 6, 25);
  ecrireMot(jeu, parc + 8, 104);
  ecrireOctet(jeu, parc + 0xA, 0x10);
  ecrireMot(jeu, parc + 0xB, 0x80);
  ecrireMot(jeu, parc + 0xD, 10);
  ecrireOctet(jeu, parc + OUVERT, 1);
  ecrireOctet(jeu, parc + 0x51, 20);
  // Les genres interdits : ceux dont le mot +0xB5 vaut 0x12, 4 ou 0x10.
  for (let g = 0; mot(jeu, ATTRACTIONS + g * TAILLE_ATTRACTION + 0x22) !== 0; g = (g + 1) & 0xFF) {
    const sorte = mot(jeu, ATTRACTIONS + g * TAILLE_ATTRACTION + 0xB5);
    if (sorte === 0x12 || sorte === 4 || sorte === 0x10) ecrireOctet(jeu, fiche + ANNEE_DE_L_ATTRACTION + g, 0xFF);
  }
  ecrireMotLong(jeu, fiche + SOLDE, motLong(jeu, fiche + CAPITAL) + octet(jeu, 0xD66F6) * 50000);
  return parc;
}

function remettreLeParcAZero(jeu, fiche, parc) {
  ecrireMot(jeu, fiche + CHAMP_A1, 0x744);
  ecrireOctet(jeu, parc + 0xA7, 0xFF);
  ecrireOctet(jeu, parc + 0xA8, 0xFF);
  ecrireOctet(jeu, parc + 0xA9, 0xFF);
  ecrireMot(jeu, parc + VISITEURS, 0);
  ecrireMotLong(jeu, parc + CONTENTEMENT, 0);
  ecrireMotLong(jeu, parc + SALAIRE_DES_AMUSEURS, 0);
  ecrireMot(jeu, parc + SALAIRE_DES_MECANICIENS, 0);
  ecrireMot(jeu, parc + SALAIRE_DES_AGENTS, 0);
  // Les salaires d'embauche, par sorte de métier (le mot +0x2C de la fiche du métier).
  let amuseurs = 0;
  for (let k = 0; mot(jeu, METIERS + k * TAILLE_METIER + 0x22) !== 0; k = (k + 1) & 0xFF) {
    const metier = METIERS + k * TAILLE_METIER;
    const sorte = mot(jeu, metier + 0x2C);
    if (sorte === 2) {
      ajouterAuMotLong(jeu, parc + SALAIRE_DES_AMUSEURS, mot(jeu, metier + 0x24));
      amuseurs = (amuseurs + 1) & 0xFF;
    } else if (sorte === 8) {
      ecrireMot(jeu, parc + SALAIRE_DES_MECANICIENS, mot(jeu, metier + 0x24));
    } else if (sorte === 0x16) {
      ecrireMot(jeu, parc + SALAIRE_DES_AGENTS, mot(jeu, metier + 0x24));
    }
  }
  ecrireMotLong(jeu, parc + SALAIRE_DES_AMUSEURS, amuseurs > 0 ? div(motLong(jeu, parc + SALAIRE_DES_AMUSEURS), amuseurs) : 0);
  ecrireMot(jeu, fiche + RANG, octet(jeu, PREPARES));
  ecrireOctet(jeu, fiche + CONDUITE_D_ORIGINE, octet(jeu, fiche + CONDUITE));
  ecrireMotLong(jeu, parc + COURS, 10000);
  ecrireMotLong(jeu, parc + 0x6A, 10000);
  ecrireMotLong(jeu, parc + 0x6E, 10001);
  ecrireMotLong(jeu, parc + 0x72, 9999);
  ecrireMot(jeu, parc + ACTIONS, 10);
  ecrireMot(jeu, parc + 0x60, mot(jeu, parc + ACTIONS));
  ecrireMot(jeu, parc + 0x5C, 0);
  ecrireMot(jeu, parc + 0x5E, 0);
  ecrireOctet(jeu, parc + PROJET, 0xFF);
  ecrireMotLong(jeu, parc + DATE_DU_PROJET, -1);
  ecrireMotLong(jeu, parc + 0xC6, 0);
  ecrireMot(jeu, parc + 0xCA, 100);
  ecrireMotLong(jeu, parc + 0xE1, 0);
  ecrireMot(jeu, parc + 0xE5, 100);
  ecrireOctet(jeu, parc + 0x49, 0);
  ecrireOctet(jeu, parc + 0x4A, 0);
  ecrireOctet(jeu, parc + AFFLUENCE, octet(jeu, 0xB78CC));
  ecrireOctet(jeu, parc + 0x4D, 0);
  ecrireOctet(jeu, parc + 0x4E, 0);
  ecrireMot(jeu, parc + 0x4B, mot(jeu, 0xB7930));
  for (let k = 0; k < NOMBRE_DE_FICHES; k++) {
    const autre = mot(jeu, baseDesFiches(jeu) + k * TAILLE_FICHE + NUMERO_DE_PARC);
    ecrireMot(jeu, fiche + PARTS + 2 * autre, 0);
  }
}

// --- le mois des parcs --------------------------------------------------------------------------------

// 0x6EE22 — à chaque pas de simulation (0x12B1F), avancer le compteur de chaque joueur ; celui dont le
// compteur atteint sa période (1 000 pas : un mois) repart de zéro et vit son mois :
//
//  - le joueur humain (type 1), s'il est le joueur courant : le relevé des statistiques de son parc
//    (0x68E34), pour la fiche que désignent ses comptes (octet +0x40) ;
//  - un joueur de type 6 : rien ;
//  - un concurrent (tout autre type non nul) : son parc tourne (0x7085C), puis il décide (voir
//    `leMoisDUnConcurrent`).
//
// Les compteurs étant posés à 40 × numéro de parc (0x6E7E6), les 20 concurrents de la partie DEMO
// passent chacun à leur tour, à 40 pas d'écart.
export function mettreAJourLesParcs(jeu) {
  for (let n = 0; n < NOMBRE_DE_FICHES; n++) {
    const fiche = (baseDesFiches(jeu) + n * TAILLE_FICHE) >>> 0;
    if (octet(jeu, fiche + TYPE) === 0) continue;
    ajouterAuMot(jeu, fiche + COMPTEUR, 1);
    if (mot(jeu, fiche + COMPTEUR) !== mot(jeu, fiche + PERIODE)) continue;
    ecrireMot(jeu, fiche + COMPTEUR, 0);
    const parc = ficheDuParc(jeu, fiche);
    const type = octet(jeu, fiche + TYPE);
    if (type === JOUEUR) {
      if (mot(jeu, JOUEUR_COURANT) === n) {
        const sienne = octet(jeu, motLong(jeu, COMPTES_DU_JOUEUR) + 0x40);
        jeu.appeler(RELEVER_LES_STATISTIQUES, (baseDesFiches(jeu) + sienne * TAILLE_FICHE) >>> 0);
      }
    } else if (type !== HORS_JEU) {
      simulerLeParcConcurrent(jeu, parc, fiche);
      leMoisDUnConcurrent(jeu, fiche, parc);
    }
  }
}

// Le mois d'un concurrent, une fois ses visiteurs passés (0x6EE22, suite). Dans l'ordre :
//
//  1. il paie son personnel : mécaniciens, agents d'entretien, amuseurs ;
//  2. il fait ses comptes : ses recettes cumulées (entrées, boutiques) et ses salaires versés, divisés
//     par le rang du mois dans l'année, plus l'intérêt de son prêt (qu'il paie aussi) ; leur différence
//     est son bénéfice mensuel, qui lui sert de budget (« disponible ») pour la suite ;
//  3. il embauche ou débauche (`gererLePersonnel`) ;
//  4. il ajoute des stands et des buvettes si l'estomac moyen de ses visiteurs est bas ;
//  5. il construit l'attraction qu'il projetait, ou en choisit une (`choisirUneAttraction`) ;
//  6. riche, il achète des boutiques de souvenirs et des jeux ;
//  7. il dépense sa réserve de décor ;
//  8. il règle la vitesse de ses attractions, fixe son prix d'entrée et ses prix de vente ;
//  9. son besoin d'argent suit son solde ; il emprunte ou rembourse 50 000 ;
// 10. pauvre, il prend sa conduite de repli ; riche, il revient à sa conduite d'origine.
//
// Le caractère, le goût et la prudence ne changent jamais ; la conduite ne change qu'à la fin.
function leMoisDUnConcurrent(jeu, fiche, parc) {
  const car = octet(jeu, fiche + CARACTERE), cond = octet(jeu, fiche + CONDUITE);
  const gout = octet(jeu, fiche + GOUT), prud = octet(jeu, fiche + PRUDENCE);
  const besoin = (delta) => ajouterAuMot(jeu, fiche + BESOIN_D_ARGENT, delta);

  // 1. Les salaires.
  for (const [nombre, salaire, long] of [[MECANICIENS, SALAIRE_DES_MECANICIENS, false],
    [AGENTS, SALAIRE_DES_AGENTS, false], [AMUSEURS, SALAIRE_DES_AMUSEURS, true]]) {
    const paie = mul(motSigne(jeu, parc + nombre), long ? motLong(jeu, parc + salaire) : mot(jeu, parc + salaire));
    ajouterAuMotLong(jeu, fiche + SOLDE, -paie);
    ajouterAuMotLong(jeu, parc + SALAIRES_VERSES, paie);
  }

  // 2. Les comptes du mois.
  const mois = (div(pasDeSimulation(jeu) % PAS_PAR_AN, PAS_PAR_MOIS) + 1) & 0xFF;
  const recettes = idiv(motLongSigne(jeu, parc + RECETTE_DES_ENTREES) + motLongSigne(jeu, parc + RECETTE_DES_BOUTIQUES), mois);
  const interet = () => quotient(mul(motSigne(jeu, TAUX_D_INTERET), motLongSigne(jeu, fiche + PRET)), 16384);
  const depenses = (idiv(motLongSigne(jeu, parc + SALAIRES_VERSES), mois) + interet()) | 0;
  const benefice = (recettes - depenses) | 0;
  if (motLongSigne(jeu, fiche + PRET) > 0) ajouterAuMotLong(jeu, fiche + SOLDE, -interet());

  // 3. Le personnel.
  let disponible = gererLePersonnel(jeu, fiche, parc, benefice, besoin, car, cond);

  // 4. Les stands de nourriture et les buvettes.
  ajouterDesStands(jeu, fiche, parc, besoin, car, cond, NOURRITURE);
  ajouterDesStands(jeu, fiche, parc, besoin, car, cond, BOISSONS);

  // 5. Une attraction.
  choisirUneAttraction(jeu, fiche, parc, benefice, disponible, besoin, car, cond, gout);

  // 6. Riche — son solde dépasse (6 − conduite) × 20 000 —, il achète chaque boutique de souvenirs et
  // chaque jeu qu'il n'a pas, tant qu'il lui en reste (6 − conduite) × 10 000 (prêt / 8 réservé). Il
  // les paie, sans que son parc les compte : 0x73B82 ne tient le compte que des familles 1, 2 et 4,
  // et les jeux (8) n'y figurent pas.
  if (mul(6 - octet(jeu, fiche + CONDUITE), 20000) < motLongSigne(jeu, fiche + SOLDE)) {
    for (let i = 0; mot(jeu, BOUTIQUES + i * TAILLE_BOUTIQUE + 0x22) !== 0; i++) {
      const b = BOUTIQUES + i * TAILLE_BOUTIQUE;
      const reste = (motLongSigne(jeu, fiche + SOLDE) - motLongSigne(jeu, b + 0x49)
        - quotient(motLongSigne(jeu, fiche + PRET), 8)) | 0;
      if (reste > mul(6 - octet(jeu, fiche + CONDUITE), 10000) && octet(jeu, fiche + ANNEE_DE_LA_BOUTIQUE + i) === 0
        && motSigne(jeu, b + 0x58) > 0) {
        construireUneBoutique(jeu, s16(i), fiche);
      }
    }
  }

  // 7. Le décor.
  depenserLaReserveDeDecor(jeu, fiche, parc, gout, cond);

  // 8. La vitesse des attractions : le délai moyen (+0x92, de 0 à 6) baisse d'un cran — elles vont plus
  // vite, amusent davantage et s'usent plus — si le contentement est sous un seuil et l'usure faible ;
  // il monte si le contentement est haut et l'usure forte.
  const accelerer = (motSigneDeTable(jeu, CONTENTEMENT_POUR_ACCELERER, car, prud) - mul(octetSigne(jeu, fiche + PENCHANT_29), 20)
    - mul(octetSigne(jeu, fiche + PENCHANT_2B), 20)) | 0;
  if (accelerer > motLongSigne(jeu, parc + CONTENTEMENT)
    && octetDeTable(jeu, USURE_DES_MECANICIENS, car, prud) > motLongSigne(jeu, parc + USURE) && octet(jeu, parc + DELAI_MOYEN) > 0) {
    ajouterALOctet(jeu, parc + DELAI_MOYEN, -1);
  } else if (motSigneDeTable(jeu, CONTENTEMENT_POUR_RALENTIR, car, prud) < motLongSigne(jeu, parc + CONTENTEMENT)
    && octetDeTable(jeu, USURE_TOLEREE, car, prud) < motLongSigne(jeu, parc + USURE) && octet(jeu, parc + DELAI_MOYEN) < 6) {
    ajouterALOctet(jeu, parc + DELAI_MOYEN, 1);
  }

  // Le prix d'entrée : entre 1,25 et 2,5 fois l'intensité totale de ses attractions, selon l'affluence,
  // l'attrait, ses penchants et le hasard, ramenés à la part (affluence + attrait). Négatif, il vaut 0.
  let part = (octet(jeu, parc + AFFLUENCE) - octetSigneDeTable(jeu, PART_DU_PRIX_D_ENTREE, car, cond)
    + octetSigne(jeu, parc + ATTRAIT) + quotient(octetSigne(jeu, fiche + PENCHANT_27), 8)
    - quotient(octetSigne(jeu, fiche + PENCHANT_28), 8)) | 0;
  part = (part + quotient(tirage(jeu, fiche), 2)) | 0;
  const intensite = motLongSigne(jeu, parc + INTENSITE_TOTALE);
  const haut = quotient(mul(intensite, 320), 128), bas = quotient(mul(intensite, 160), 128);
  const prix = (idiv(mul(haut - bas, part), octet(jeu, parc + AFFLUENCE) + octetSigne(jeu, parc + ATTRAIT))
    + quotient(mul(intensite, 160), 128)) | 0;
  ecrireMot(jeu, parc + PRIX_D_ENTREE, prix < 0 ? 0 : prix);

  // Les prix de vente : le coût moyen, plus une marge en % (table, plus 2 × penchant +0x27).
  const marge = octetDeTable(jeu, MARGE_DES_BOUTIQUES, car, cond) + octetSigne(jeu, fiche + PENCHANT_27) * 2;
  for (const S of [NOURRITURE, BOISSONS]) {
    ecrireMot(jeu, parc + S.prix, idiv(mul(mot(jeu, parc + S.cout), marge), 100) + mot(jeu, parc + S.cout));
  }
  ecrireMot(jeu, parc + PRIX_DES_SOUVENIRS, idiv(mul(marge, mot(jeu, parc + COUT_DES_SOUVENIRS)), 100)
    + mot(jeu, parc + COUT_DES_SOUVENIRS));

  // 9. Le besoin d'argent : sous le solde de pauvreté, il monte d'un 64e de l'écart ; au-dessus, il
  // baisse d'un 2 048e. Assez pressant — au-delà de prêt / 256 + 100 — et si la valeur du parc (parts
  // × cours) couvre le prêt augmenté, il emprunte 50 000 ; très bas — sous −100 —, avec 50 000 de prêt
  // au moins et plus de 50 000 en banque, il en rembourse 50 000. Le besoin repart alors de zéro.
  const pauvrete = motDeTable(jeu, SOLDE_DE_PAUVRETE, car, cond);
  const solde = motLongSigne(jeu, fiche + SOLDE);
  if (pauvrete > solde) ecrireMot(jeu, fiche + BESOIN_D_ARGENT, motSigne(jeu, fiche + BESOIN_D_ARGENT) + quotient(pauvrete - solde, 64));
  else ecrireMot(jeu, fiche + BESOIN_D_ARGENT, motSigne(jeu, fiche + BESOIN_D_ARGENT) - quotient(solde - pauvrete, 2048));
  if (motSigne(jeu, fiche + BESOIN_D_ARGENT) > quotient(motLongSigne(jeu, fiche + PRET), 256) + 100
    && valeurDuParc(jeu, parc) >= ((motLongSigne(jeu, fiche + PRET) + 50000) | 0)) {
    emprunter(jeu, fiche, 50000);
  } else if (motSigne(jeu, fiche + BESOIN_D_ARGENT) < -100 && motLongSigne(jeu, fiche + PRET) >= 50000
    && motLongSigne(jeu, fiche + SOLDE) > 50000) {
    emprunter(jeu, fiche, -50000);
  }

  // 10. La conduite : sous deux fois le solde de pauvreté, la conduite de repli ; au-delà de trois
  // fois, la conduite d'origine.
  if (mul(pauvrete, 2) > motLongSigne(jeu, fiche + SOLDE)) {
    ecrireOctet(jeu, fiche + CONDUITE, octetDeTable(jeu, CONDUITE_DE_REPLI, car, prud));
  } else if (mul(pauvrete, 3) < motLongSigne(jeu, fiche + SOLDE)
    && octet(jeu, fiche + CONDUITE_D_ORIGINE) !== octet(jeu, fiche + CONDUITE)) {
    ecrireOctet(jeu, fiche + CONDUITE, octet(jeu, fiche + CONDUITE_D_ORIGINE));
  }
}

// La valeur du parc, parts × cours, qui borne les emprunts. Le programme la multiplie par 128 sur
// 32 bits avant de la rediviser : au-delà de 16 777 215, elle déborde.
const valeurDuParc = (jeu, parc) => quotient(mul(mul(mot(jeu, parc + ACTIONS), motLongSigne(jeu, parc + COURS)), 128), 128);

// Emprunter (ou rembourser, somme négative) : le prêt et le solde bougent ensemble, le besoin
// d'argent repart de zéro.
function emprunter(jeu, fiche, somme) {
  ajouterAuMotLong(jeu, fiche + PRET, somme);
  ajouterAuMotLong(jeu, fiche + SOLDE, somme);
  ecrireMot(jeu, fiche + BESOIN_D_ARGENT, 0);
}

// Le personnel (0x6EE22). Avec un bénéfice, trois décisions l'une après l'autre, chacune tant qu'il
// reste un budget (sinon le besoin d'argent monte de 2) :
//
//  - les mécaniciens, selon l'usure (+0x97) : au-delà d'un seuil (table 0xBE40D, moins les penchants
//    +0x2C / 4 et +0x2A / 8 et un tirage), il en embauche un — d'office si l'usure dépasse aussi la
//    table 0xBE3C2, sinon s'il en a les moyens et aucune attraction en projet ; en deçà, il en
//    débauche un ;
//  - les agents d'entretien, selon la saleté (+0x80) : même logique, le seuil étant la table 0xBE232
//    moins 4 × +0x2C, 2 × +0x2A, 2 × +0x2B et 4 × un tirage, et l'embauche d'office au-delà de
//    2 × table × (agents + 1) ;
//  - les amuseurs, selon le contentement : sous la table 0xBDEE0 plus 4 × +0x2A, 8 × +0x2B et 16 × un
//    tirage, il en embauche un s'il en a les moyens ; au-delà, il en débauche un.
//
// Sans bénéfice, il débauche un amuseur, à défaut un agent, à défaut un mécanicien si l'usure est
// sous la table 0xBE3C2 ; son besoin d'argent monte (de 3, de 5 ou 10, de 10 ou 20).
//
// Anomalie reproduite : pour les amuseurs, « en avoir les moyens » est testé sans signe (`jbe` après
// le calcul de bénéfice − 4 × (amuseurs + 1) × salaire) : tout reste non nul, même négatif, suffit.
// Rend le budget restant.
function gererLePersonnel(jeu, fiche, parc, benefice, besoin, car, cond) {
  let disponible = benefice;
  const embaucher = (nombre, salaire, long) => {
    ajouterAuMot(jeu, parc + nombre, 1);
    ajouterAuMot(jeu, parc + PERSONNEL, 1);
    disponible = (disponible - (long ? motLong(jeu, parc + salaire) : mot(jeu, parc + salaire))) | 0;
  };
  const debaucher = (nombre, salaire, long) => {
    ajouterAuMot(jeu, parc + nombre, -1);
    ajouterAuMot(jeu, parc + PERSONNEL, -1);
    ajouterAuMot(jeu, parc + LICENCIES, 1);
    disponible = (disponible + (long ? motLong(jeu, parc + salaire) : mot(jeu, parc + salaire))) | 0;
  };
  const sansProjet = () => octetSigne(jeu, parc + PROJET) === -1;
  const usure = () => motLongSigne(jeu, parc + USURE);
  const salete = () => motSigne(jeu, parc + SALETE);

  if (benefice <= 0) {
    if (mot(jeu, parc + AMUSEURS) !== 0) {
      debaucher(AMUSEURS, SALAIRE_DES_AMUSEURS, true);
      besoin(3);
    } else if (mot(jeu, parc + AGENTS) !== 0) {
      debaucher(AGENTS, SALAIRE_DES_AGENTS, false);
      besoin(salete() > octetDeTable(jeu, SALETE_PAR_AGENT, car, cond) * 4 ? 10 : 5);
    } else if (mot(jeu, parc + MECANICIENS) !== 0 && octetDeTable(jeu, USURE_DES_MECANICIENS, car, cond) > usure()) {
      debaucher(MECANICIENS, SALAIRE_DES_MECANICIENS, false);
      besoin(octetDeTable(jeu, USURE_TOLEREE, car, cond) < usure() ? 20 : 10);
    }
    return disponible;
  }

  // Les mécaniciens.
  const seuilDesMecaniciens = (octetDeTable(jeu, USURE_TOLEREE, car, cond) - quotient(octetSigne(jeu, fiche + RESERVE_DE_DECOR), 4)
    - quotient(octetSigne(jeu, fiche + PENCHANT_2A), 8) - tirage(jeu, fiche)) | 0;
  if (seuilDesMecaniciens < usure()) {
    if (octetDeTable(jeu, USURE_DES_MECANICIENS, car, cond) < usure()
      || (((benefice - mot(jeu, parc + SALAIRE_DES_MECANICIENS)) | 0) > 0 && sansProjet())) {
      embaucher(MECANICIENS, SALAIRE_DES_MECANICIENS, false);
    } else {
      besoin(1);
    }
  } else if (mot(jeu, parc + MECANICIENS) !== 0) {
    debaucher(MECANICIENS, SALAIRE_DES_MECANICIENS, false);
    besoin(-10);
  }

  // Les agents d'entretien.
  if (disponible > 0) {
    const tolere = octetDeTable(jeu, SALETE_PAR_AGENT, car, cond);
    let seuil = (tolere - octetSigne(jeu, fiche + RESERVE_DE_DECOR) * 4 - octetSigne(jeu, fiche + PENCHANT_2A) * 2
      - octetSigne(jeu, fiche + PENCHANT_2B) * 2) | 0;
    seuil = (seuil - tirage(jeu, fiche) * 4) | 0;
    if (salete() > seuil) {
      if (salete() > mul(tolere * 2, motSigne(jeu, parc + AGENTS) + 1)
        || (((benefice - mul(mot(jeu, parc + SALAIRE_DES_AGENTS), motSigne(jeu, parc + AGENTS) + 1)) | 0) > 0 && sansProjet())) {
        embaucher(AGENTS, SALAIRE_DES_AGENTS, false);
      } else {
        besoin(1);
      }
    } else if (mot(jeu, parc + AGENTS) !== 0) {
      debaucher(AGENTS, SALAIRE_DES_AGENTS, false);
      besoin(-10);
    }
  } else {
    besoin(2);
  }

  // Les amuseurs.
  if (disponible > 0) {
    let seuil = (motSigneDeTable(jeu, CONTENTEMENT_DES_AMUSEURS, car, cond) + octetSigne(jeu, fiche + PENCHANT_2A) * 4
      + octetSigne(jeu, fiche + PENCHANT_2B) * 8) | 0;
    seuil = (tirage(jeu, fiche) * 16 + seuil) | 0;
    if (seuil > motLongSigne(jeu, parc + CONTENTEMENT)) {
      const reste = (benefice - mul(mul(motSigne(jeu, parc + AMUSEURS) + 1, motLong(jeu, parc + SALAIRE_DES_AMUSEURS)), 4)) | 0;
      if (reste !== 0 && sansProjet()) embaucher(AMUSEURS, SALAIRE_DES_AMUSEURS, true);
      else besoin(1);
    } else if (mot(jeu, parc + AMUSEURS) !== 0) {
      debaucher(AMUSEURS, SALAIRE_DES_AMUSEURS, true);
      besoin(-5);
    }
  } else {
    besoin(2);
  }
  return disponible;
}

// Les stands (0x6EE22) : si l'estomac moyen des visiteurs est sous la table 0xBE1B5, et s'il a moins de
// (attractions − tirage / 2) / table 0xBE1CE + 1 stands de la sorte, il achète la boutique au plus bas
// score : poids × prix de construction − poids × prix de vente − poids × apport à l'estomac − poids ×
// apport à la soif, parmi celles qu'il n'a pas et qu'il peut payer ; chaque boutique trop chère fait
// monter son besoin d'argent.
//
// Pour la nourriture, il garde la réserve de la table 0xBE296 ; pour les boissons, aucune, et les deux
// poids des apports sont échangés : la soif y compte comme l'estomac pour la nourriture. Deux anomalies,
// reproduites, font que les buvettes ne s'ajoutent vraisemblablement pas comme voulu : la condition des
// buvettes relit l'estomac moyen (+0xB2) et non la soif (+0xB4), et leur choix ne retient, comme celui
// des stands, que les boutiques de la famille 1 (manger) — les glaces (famille 3) sont les seules à
// compter aussi comme buvette.
function ajouterDesStands(jeu, fiche, parc, besoin, car, cond, S) {
  if (!(motSigne(jeu, parc + ESTOMAC) < octetSigneDeTable(jeu, ESTOMAC_DES_STANDS, car, cond))) return;
  const voulus = idiv(octet(jeu, parc + NOMBRE_D_ATTRACTIONS) - quotient(tirage(jeu, fiche), 2),
    octetDeTable(jeu, ATTRACTIONS_PAR_STAND, car, cond)) + 1;
  if (!(octet(jeu, parc + S.nombre) < voulus)) return;
  const pourManger = S === NOURRITURE;
  const reserve = pourManger ? motDeTable(jeu, RESERVE_DE_STAND, car, cond) : 0;
  const poidsEstomac = motDeTable(jeu, pourManger ? POIDS_DE_L_ESTOMAC : POIDS_DE_LA_SOIF, car, cond);
  const poidsSoif = motDeTable(jeu, pourManger ? POIDS_DE_LA_SOIF : POIDS_DE_L_ESTOMAC, car, cond);
  let meilleur = 10000000, choix = -1;
  for (let i = 0; mot(jeu, BOUTIQUES + i * TAILLE_BOUTIQUE + 0x22) !== 0; i++) {
    const b = BOUTIQUES + i * TAILLE_BOUTIQUE;
    const reste = (motLongSigne(jeu, fiche + SOLDE) - motLongSigne(jeu, b + 0x49)
      - quotient(motLongSigne(jeu, fiche + PRET), 16)) | 0;
    if (!(reste > reserve)) { besoin(1); continue; }
    if (octet(jeu, fiche + ANNEE_DE_LA_BOUTIQUE + i) !== 0 || (octet(jeu, b + 0x25) & 1) === 0) continue;
    const score = (mul(octetDeTable(jeu, POIDS_DU_PRIX_DE_BOUTIQUE, car, cond), motLongSigne(jeu, b + 0x49))
      - mul(motDeTable(jeu, POIDS_DU_PRIX_DE_VENTE, car, cond), mot(jeu, b + 0x4F))
      - mul(poidsEstomac, octetSigne(jeu, b + 0x56)) - mul(poidsSoif, octetSigne(jeu, b + 0x57))) | 0;
    if (score < meilleur) { meilleur = score; choix = i; }
  }
  if (s16(choix) !== -1) construireUneBoutique(jeu, s16(choix), fiche);
}

// Le petit et le grand décor (0x6EE22) : la réserve de décor (+0x2C) positive, il achète autant de
// petit décor qu'elle compte de points, dans la limite de ce qu'il peut payer en gardant la réserve
// de la table 0xBE2C8 (au prix de 100 la pièce) ; puis réserve / (caractère + 1) pièces de grand
// décor, en gardant la réserve de la table 0xBE32C (5 000 la pièce, chacune comptant 9 au parc). La
// réserve de décor perd ce qu'il a acheté.
//
// Deux anomalies, reproduites : le petit décor, compté 100 la pièce pour savoir ce qu'il peut s'offrir,
// n'est payé qu'une pièce la pièce ; et quand le grand décor dépasse ses moyens, le nombre de pièces
// est ramené à (solde − réserve) / 100 et non / 5 000 : il peut en acheter cinquante fois trop, et
// s'endetter d'autant.
function depenserLaReserveDeDecor(jeu, fiche, parc, gout, cond) {
  if (!(octetSigne(jeu, fiche + RESERVE_DE_DECOR) > 0)) return;
  let petits = octetSigne(jeu, fiche + RESERVE_DE_DECOR);
  const reservePetit = longDeTable(jeu, RESERVE_DU_PETIT_DECOR, gout, cond);
  if (((motLongSigne(jeu, fiche + SOLDE) - mul(petits, 100)) | 0) < reservePetit) {
    petits = idiv(motLongSigne(jeu, fiche + SOLDE) - reservePetit, 100);
  }
  if (petits > 0) {
    ajouterAuMot(jeu, parc + PETIT_DECOR, petits);
    ajouterAuMotLong(jeu, fiche + SOLDE, -petits);
  } else {
    petits = 0;
  }
  let grands = idiv(octetSigne(jeu, fiche + RESERVE_DE_DECOR), octet(jeu, fiche + CARACTERE) + 1);
  const reserveGrand = longDeTable(jeu, RESERVE_DU_GRAND_DECOR, gout, cond);
  if (((motLongSigne(jeu, fiche + SOLDE) - mul(grands, 5000)) | 0) < reserveGrand) {
    grands = idiv(motLongSigne(jeu, fiche + SOLDE) - reserveGrand, 100);
  }
  if (grands > 0) {
    ajouterAuMot(jeu, parc + GRAND_DECOR, mul(grands, 9));
    ajouterAuMotLong(jeu, fiche + SOLDE, -mul(grands, 5000));
  } else {
    grands = 0;
  }
  ecrireOctet(jeu, fiche + RESERVE_DE_DECOR, octet(jeu, fiche + RESERVE_DE_DECOR) - ((petits + grands) & 0xFF));
}

// Le choix d'une attraction (0x6EE22).
//
// S'il a une attraction en projet (+0xF), que son bénéfice et son budget dépassent encore le bénéfice
// du moment du projet et que le projet a moins de table 0xBE16A + 3 mois, il l'achète s'il peut la payer
// en gardant la réserve de la table 0xBE264 (prêt / 8 réservé) ; le besoin d'argent baisse alors de 25
// (contentement au-dessus de la table 0xBDEAE) ou de 10.
//
// Sinon, jusqu'à dix essais. Chaque essai passe en revue les genres qu'il n'a pas (et qui ne lui sont
// pas interdits) et que le temps a rendus disponibles ; le score d'un genre est
//     (penchant +0x27 / 3 + 1) × prix × table 0xBE219 − (+0x29 / 3 + 1) × intensité × table 0xBE1E7
//                                                    − (+0x2B / 3 + 1) × capacité × table 0xBDFDA,
// le plus bas l'emporte, un tirage × 3 000 venant l'aider. Deux meilleurs sont retenus : celui qu'il
// peut payer tout de suite (solde − prix − prêt / 8 > 0), et celui qu'il pourra payer (solde − prix −
// prêt / 16 + table 0xBE16A [caractère][goût] × budget, au-delà de la réserve 0xBE264), meilleur des
// deux. Les montagnes russes (mode 6) ne passent pas par ce contrôle : leur taille (de 1 à 6) est
// celle dont le prix encadre solde × table 0xBE138 / 1 024 ; leur score se fait avec les demi-penchants
// et les caractéristiques de cette taille (0xBDD92).
//
//  - aucun des deux : sans aucune capacité d'attraction, il emprunte 50 000 si la valeur de son parc
//    le permet (et refait un essai), sinon il abandonne ; avec, son besoin d'argent monte de 5 ou de 1
//    selon le contentement (table 0xBDEAE) et il refait un essai ;
//  - le meilleur à venir est meilleur que le meilleur immédiat de plus de la table 0xBE183 : il en fait
//    son projet ;
//  - sinon il achète le meilleur — une montagne russe à éléments (voie 2) par 0x73969, avec sa
//    taille, toute autre par 0x7376C —, et son besoin d'argent baisse de 25 ou de 10.
//
// La taille passée à 0x73969 est celle de la dernière montagne russe évaluée, que l'original garde
// dans une variable ([ebp-0xc]) non initialisée à l'entrée, commune à tous les concurrents du pas.
// Sans effet : la taille ne dépend que du solde, le même pour toutes les montagnes russes d'un essai,
// et un genre de voie 2 n'est retenu qu'une fois sa taille calculée dans le même essai (les trois
// genres de voie 2 sont de mode 6) ; la réécriture la garde donc le temps d'un appel.
//
// Anomalies reproduites :
//  - les tailles vont de 1 à 6, mais la table n'en a que six (0 à 5) : la taille 6 lit les octets de
//    la table suivante (0xBDE7C) comme un prix de 420 416 005, dont le score déborde de ses 32 bits ;
//    un concurrent dont solde × 0xBE138 / 1 024 dépasse 60 000 évalue ainsi une montagne russe
//    démesurée ;
//  - quand le meilleur à venir n'est pas assez meilleur, c'est quand même lui qu'il achète, qu'il
//    puisse le payer ou non ;
//  - le délai d'apparition compare (+0xAA − 5) / 10 à 12 × mois écoulés + 1 : passé le premier mois,
//    tous les genres sont disponibles ;
//  - une montagne russe à éléments mise en projet est achetée plus tard par 0x7376C, au prix et aux
//    caractéristiques du catalogue, et non par 0x73969 à la taille de ses moyens.
function choisirUneAttraction(jeu, fiche, parc, benefice, disponible, besoin, car, cond, gout) {
  const exige = () => motSigneDeTable(jeu, CONTENTEMENT_EXIGE, car, cond);
  const projet = octetSigne(jeu, parc + PROJET);
  if (benefice > motLongSigne(jeu, parc + BENEFICE_DU_PROJET) && disponible > motLongSigne(jeu, parc + BENEFICE_DU_PROJET)
    && projet !== -1
    && div(pasDeSimulation(jeu) - motLong(jeu, parc + DATE_DU_PROJET), PAS_PAR_MOIS) < octetDeTable(jeu, MOIS_D_UN_PROJET, car, cond) + 3) {
    const reste = (motLongSigne(jeu, fiche + SOLDE) - motLongSigne(jeu, ATTRACTIONS + projet * TAILLE_ATTRACTION + 0xA2)
      - quotient(motLongSigne(jeu, fiche + PRET), 8)) | 0;
    if (reste > motDeTable(jeu, RESERVE_D_ATTRACTION, car, cond)) {
      construireUneAttraction(jeu, projet, fiche);
      oublierLeProjet(jeu, parc);
      besoin(exige() < motLongSigne(jeu, parc + CONTENTEMENT) ? -25 : -10);
    }
    return;
  }

  let fini = false, voie = -1;
  for (let essai = 0; !fini && essai < 10; essai++) {
    let meilleur = 10000000, meilleurImmediat = 10000000, choix = -1, choixImmediat = -1;
    for (let g = 0; mot(jeu, ATTRACTIONS + g * TAILLE_ATTRACTION + 0x22) !== 0; g++) {
      const a = ATTRACTIONS + g * TAILLE_ATTRACTION;
      if (octet(jeu, fiche + ANNEE_DE_L_ATTRACTION + g) !== 0) continue;
      if (!((idiv(mot(jeu, a + 0xAA) - 5, 10) >>> 0) <= ((mul(div(pasDeSimulation(jeu), PAS_PAR_MOIS), 12) + 1) >>> 0))) continue;
      if (mot(jeu, a + 0xB0) === 6) {
        voie = tailleDeMontagneRusse(jeu, fiche, car, cond);
        if (voie === -1) continue;
        const m = MONTAGNES_RUSSES + voie * TAILLE_MONTAGNE_RUSSE;
        const score = (mul(quotient(octetSigne(jeu, fiche + PENCHANT_27), 2) + 1,
          mul(motLong(jeu, m), octetDeTable(jeu, POIDS_DU_PRIX, gout, cond)))
          - mul(mul(motDeTable(jeu, POIDS_DE_L_INTENSITE, gout, cond), octet(jeu, m + 0x22 + octet(jeu, fiche + CARACTERE))),
            quotient(octetSigne(jeu, fiche + PENCHANT_29), 2) + 1)
          - mul(mul(octet(jeu, m + 0x1D + octet(jeu, fiche + CARACTERE)), motDeTable(jeu, POIDS_DE_LA_CAPACITE, car, cond)),
            quotient(octetSigne(jeu, fiche + PENCHANT_2B), 2) + 1)) | 0;
        if (((score - tirage(jeu, fiche) * 3000) | 0) < meilleur) { meilleur = score; choix = g; }
        continue;
      }
      const score = (mul(quotient(octetSigne(jeu, fiche + PENCHANT_27), 3) + 1,
        mul(motLong(jeu, a + 0xA2), octetDeTable(jeu, POIDS_DU_PRIX, gout, cond)))
        - mul(mul(motDeTable(jeu, POIDS_DE_L_INTENSITE, gout, cond), octet(jeu, a + 0xA9)),
          quotient(octetSigne(jeu, fiche + PENCHANT_29), 3) + 1)
        - mul(mul(motSigne(jeu, a + 0xA6), motDeTable(jeu, POIDS_DE_LA_CAPACITE, car, cond)),
          quotient(octetSigne(jeu, fiche + PENCHANT_2B), 3) + 1)) | 0;
      const payable = (motLongSigne(jeu, fiche + SOLDE) - motLongSigne(jeu, a + 0xA2)
        - quotient(motLongSigne(jeu, fiche + PRET), 8)) | 0;
      if (payable > 0) {
        if (((score - tirage(jeu, fiche) * 3000) | 0) < meilleurImmediat) {
          meilleurImmediat = score;
          choixImmediat = g;
          if (meilleurImmediat < meilleur) { meilleur = meilleurImmediat; choix = choixImmediat; }
        }
      } else {
        besoin(1);
      }
      if (disponible > 0) {
        const aVenir = (motLongSigne(jeu, fiche + SOLDE) - motLongSigne(jeu, a + 0xA2)
          - quotient(motLongSigne(jeu, fiche + PRET), 16) + mul(octetDeTable(jeu, MOIS_D_UN_PROJET, car, gout), disponible)) | 0;
        if (aVenir > motDeTable(jeu, RESERVE_D_ATTRACTION, car, cond)) {
          if (((score - tirage(jeu, fiche) * 3000) | 0) < meilleur) { meilleur = score; choix = g; }
        } else {
          besoin(1);
        }
      }
    }

    if (s16(choixImmediat) === -1 && s16(choix) === -1) {
      if (motSigne(jeu, parc + CAPACITE_TOTALE) < 1) {
        if (valeurDuParc(jeu, parc) >= ((motLongSigne(jeu, fiche + PRET) + 50000) | 0)) emprunter(jeu, fiche, 50000);
        else fini = true;
      } else if (exige() > motLongSigne(jeu, parc + CONTENTEMENT)) {
        besoin(5);
      } else if (exige() < motLongSigne(jeu, parc + CONTENTEMENT)) {
        besoin(1);
      }
      continue;
    }
    if (((meilleurImmediat - motDeTable(jeu, ECART_POUR_ATTENDRE, car, cond)) | 0) > meilleur) {
      ecrireOctet(jeu, parc + PROJET, choix);
      ecrireMotLong(jeu, parc + DATE_DU_PROJET, pasDeSimulation(jeu));
      ecrireMotLong(jeu, parc + BENEFICE_DU_PROJET, benefice);
    } else {
      if (octet(jeu, (ATTRACTIONS + mul(s16(choix), TAILLE_ATTRACTION) + 0xB4) >>> 0) === 2) {
        jeu.appeler(CONSTRUIRE_UNE_MONTAGNE_RUSSE, s16(choix), voie, fiche);
      } else {
        construireUneAttraction(jeu, s16(choix), fiche);
      }
      oublierLeProjet(jeu, parc);
      besoin(exige() < motLongSigne(jeu, parc + CONTENTEMENT) ? -25 : -10);
    }
    fini = true;
  }
}

// La taille de montagne russe à sa portée : celle (de 1 à 6) dont le prix de la taille précédente et
// le sien encadrent strictement solde × table 0xBE138 / 1 024, comparés sans signe ; −1 aucune.
function tailleDeMontagneRusse(jeu, fiche, car, cond) {
  let taille = -1;
  for (let k = 1; k <= 6; k++) {
    const moyens = quotient(mul(motLongSigne(jeu, fiche + SOLDE), motDeTable(jeu, PART_POUR_UNE_MONTAGNE_RUSSE, car, cond)), 1024) >>> 0;
    if (moyens > motLong(jeu, MONTAGNES_RUSSES + (k - 1) * TAILLE_MONTAGNE_RUSSE)
      && moyens < motLong(jeu, MONTAGNES_RUSSES + k * TAILLE_MONTAGNE_RUSSE)) {
      taille = k;
    }
  }
  return taille;
}

function oublierLeProjet(jeu, parc) {
  ecrireOctet(jeu, parc + PROJET, 0xFF);
  ecrireMotLong(jeu, parc + DATE_DU_PROJET, -1);
}

// --- le parc d'un concurrent ----------------------------------------------------------------------------

// 0x7085C — le mois des visiteurs d'un parc concurrent (sa fiche de parc, sa fiche de joueur), s'il est
// ouvert. Tout se fait en moyennes :
//
//  1. des visiteurs partent : ceux qui s'ennuient (ennui au-delà de 3 000), les fatigués (fatigue
//     au-delà de 4 000, et de 3 000 × attractions / 8), trois quarts du compte, 50 au plus ; ils
//     emportent le contentement moyen ;
//  2. d'autres arrivent : l'attrait (affluence + attrait) diminué de l'écart entre le prix d'entrée et
//     sa valeur j = +4 × (attrait des jeux / 2 + intensité totale) / 128, comme au guichet d'un parc
//     (0x6804A), borné à l'affluence, trois quarts du compte ; aucun si le parc n'a pas d'intensité ou
//     compte 800 visiteurs. Ils arrivent contents (50) avec 2 000 moins le prix d'entrée, qu'ils paient
//     au concurrent ;
//  3. s'il reste des visiteurs : le fléau (+0x52), les conditions du mois (+0x76), les repas, les
//     boissons, les toilettes, les souvenirs, les jeux et les attractions (`lesVisiteursDuMois`) ;
//  4. les agents d'entretien nettoient ; la saleté restante, et le décor, jouent sur le contentement ;
//  5. les attractions s'usent ; les mécaniciens réparent ; trop usée, celle qui a le plus produit
//     (intensité × capacité × ancienneté) est retirée ; usée, elle tombe en panne (`userLesAttractions`) ;
//  6. l'ennui et la fatigue avancent de 1 000 pour qui n'a pas fait d'attraction ; la fatigue baisse
//     d'un seizième du contentement, et au-delà de 4 000 elle coûte du contentement.
//
// Les nombres de visiteurs se comptent sur 16 bits signés, comme dans le programme.
export function simulerLeParcConcurrent(jeu, parc, fiche) {
  if (octet(jeu, parc + OUVERT) === 0) return;
  const partants = compterLesPartants(jeu, parc);
  ajouterAuMotLong(jeu, parc + CONTENTEMENT_EMPORTE, mul(partants, motLongSigne(jeu, parc + CONTENTEMENT)));
  ajouterAuMotLong(jeu, parc + CONTENTEMENT_TOTAL, -mul(partants, motLongSigne(jeu, parc + CONTENTEMENT)));
  const arrivants = s16(quotient(compterLesArrivants(jeu, parc) * 3, 4));
  ecrireOctet(jeu, parc + ARRIVES, arrivants);
  ajouterAuMot(jeu, parc + VENUS, arrivants);

  // Les moyennes, pondérées par les restants et les arrivants.
  const restants = motSigne(jeu, parc + VISITEURS) - partants;
  const total = (restants + arrivants) | 0;
  if (total > 0) {
    ecrireMotLong(jeu, parc + CONTENTEMENT, idiv(mul(motLongSigne(jeu, parc + CONTENTEMENT), restants) + mul(arrivants, 50), total));
    ecrireMot(jeu, parc + ESTOMAC, idiv(mul(motSigne(jeu, parc + ESTOMAC), restants), total));
    ecrireMot(jeu, parc + SOIF, idiv(mul(restants, motSigne(jeu, parc + SOIF)), total));
    ecrireMotLong(jeu, parc + ARGENT, div(mul(motLong(jeu, parc + ARGENT), restants)
      + mul(2000 - mot(jeu, parc + PRIX_D_ENTREE), arrivants), total));
    ecrireMotLong(jeu, parc + ENNUI, div(mul(restants, motLong(jeu, parc + ENNUI)), total));
    ecrireMotLong(jeu, parc + FATIGUE, idiv(mul(restants, motLongSigne(jeu, parc + FATIGUE)), total));
  } else {
    ecrireMotLong(jeu, parc + CONTENTEMENT, 0);
    ecrireMot(jeu, parc + ESTOMAC, 0);
    ecrireMot(jeu, parc + SOIF, 0);
    ecrireMotLong(jeu, parc + ARGENT, 0);
    ecrireMotLong(jeu, parc + ENNUI, 0);
    ecrireMotLong(jeu, parc + FATIGUE, 0);
  }
  ajouterAuMot(jeu, parc + VISITEURS, arrivants);
  ajouterAuMot(jeu, parc + VISITEURS, -partants);
  ajouterAuMotLong(jeu, fiche + SOLDE, mul(mot(jeu, parc + PRIX_D_ENTREE), arrivants));
  ajouterAuMotLong(jeu, parc + RECETTE_DES_ENTREES, mul(arrivants, mot(jeu, parc + PRIX_D_ENTREE)));

  const manegeurs = motSigne(jeu, parc + VISITEURS) > 0 ? lesVisiteursDuMois(jeu, parc, fiche, arrivants) : 0;

  // Les agents d'entretien : − 32 de saleté chacun ; et ils nettoient les toilettes, d'une part de
  // leur usage (agents / toilettes).
  if (mot(jeu, parc + AGENTS) !== 0) {
    ecrireMot(jeu, parc + SALETE, mot(jeu, parc + SALETE) - (mot(jeu, parc + AGENTS) << 5));
    if (octet(jeu, parc + TOILETTES) > 0) {
      const nettoye = div(mul(motSigne(jeu, parc + AGENTS), motLong(jeu, parc + USAGE_DES_TOILETTES)), octet(jeu, parc + TOILETTES));
      if (nettoye > motLong(jeu, parc + USAGE_DES_TOILETTES)) ecrireMotLong(jeu, parc + USAGE_DES_TOILETTES, 0);
      else ecrireMotLong(jeu, parc + USAGE_DES_TOILETTES, motLong(jeu, parc + USAGE_DES_TOILETTES) - nettoye);
    }
  }
  if (motSigne(jeu, parc + SALETE) < 0) ecrireMot(jeu, parc + SALETE, 0);
  else if (motSigne(jeu, parc + SALETE) > 0) ajouterAuMotLong(jeu, parc + CONTENTEMENT, -motSigne(jeu, parc + SALETE));
  if (mot(jeu, parc + PETIT_DECOR) !== 0) ajouterAuMotLong(jeu, parc + CONTENTEMENT, mot(jeu, parc + PETIT_DECOR) >> 2);
  if (mot(jeu, parc + GRAND_DECOR) !== 0) ajouterAuMotLong(jeu, parc + CONTENTEMENT, mot(jeu, parc + GRAND_DECOR));

  if (manegeurs > 1) userLesAttractions(jeu, parc, fiche, manegeurs);

  // L'ennui et la fatigue : ceux qui ont fait une attraction repartent de 1 000 − durée moyenne
  // d'ennui et gardent leur fatigue ; les autres prennent 1 000 de chaque.
  const visiteurs = motSigne(jeu, parc + VISITEURS);
  if (visiteurs > 0) {
    ecrireMotLong(jeu, parc + ENNUI, mul(visiteurs - manegeurs, motLong(jeu, parc + ENNUI) + 1000)
      + mul(1000 - motSigne(jeu, parc + DUREE_MOYENNE), manegeurs));
    ecrireMotLong(jeu, parc + FATIGUE, mul(visiteurs - manegeurs, motLongSigne(jeu, parc + FATIGUE) + 1000)
      + mul(manegeurs, motLongSigne(jeu, parc + FATIGUE)));
    ecrireMotLong(jeu, parc + ENNUI, div(motLong(jeu, parc + ENNUI), visiteurs));
    ecrireMotLong(jeu, parc + FATIGUE, idiv(motLongSigne(jeu, parc + FATIGUE), visiteurs));
  } else {
    ecrireMotLong(jeu, parc + ENNUI, 0);
    ecrireMotLong(jeu, parc + FATIGUE, 0);
  }
  ajouterAuMotLong(jeu, parc + FATIGUE, -quotient(motLongSigne(jeu, parc + CONTENTEMENT), 16));
  if (motLongSigne(jeu, parc + FATIGUE) > 4000) {
    ajouterAuMotLong(jeu, parc + CONTENTEMENT, -quotient(motLongSigne(jeu, parc + FATIGUE) - 4000, 256));
  }
}

// Les partants du mois (0x7085C). L'ennui compte sans signe (`shr`) : visiteurs × (ennui − 3 000)
// / 2 048 ; la fatigue, visiteurs × (fatigue − 4 000) / 8 192, puis, au-delà de 3 000 × attractions / 8,
// la part de l'écart jusqu'à 3 000 × attractions. Trois quarts du tout, bornés aux visiteurs, à 50 et à 0.
// Chaque terme est ramené à 16 bits avant d'y ajouter le suivant.
function compterLesPartants(jeu, parc) {
  const visiteurs = motSigne(jeu, parc + VISITEURS);
  const attractions = octet(jeu, parc + NOMBRE_D_ATTRACTIONS);
  let partants = 0;
  if (motLong(jeu, parc + ENNUI) > 3000) partants = mul(visiteurs, motLong(jeu, parc + ENNUI) - 3000) >>> 11;
  if (motLongSigne(jeu, parc + FATIGUE) > 4000) {
    partants = s16(partants) + quotient(mul(visiteurs, motLongSigne(jeu, parc + FATIGUE) - 4000), 8192);
  }
  const seuil = quotient(attractions * 3000, 8);
  if (seuil < motLongSigne(jeu, parc + FATIGUE) && attractions > 0) {
    partants = s16(partants) + idiv(mul(visiteurs, motLongSigne(jeu, parc + FATIGUE) - seuil), attractions * 3000 - seuil);
  }
  partants = s16(quotient(s16(partants) * 3, 4));
  if (partants > visiteurs) partants = visiteurs;
  if (partants > 50) partants = 50;
  if (partants < 0) partants = 0;
  return partants;
}

// Les arrivants du mois (0x7085C), avant d'en prendre les trois quarts : le calcul est celui du
// guichet (retro-ingenierie.md § 10.2), fait sur 16 bits — la division est celle d'un mot (`idiv` de
// 16 bits), d'où une exception si le quotient déborde.
function compterLesArrivants(jeu, parc) {
  const visiteurs = motSigne(jeu, parc + VISITEURS);
  if (motLongSigne(jeu, parc + INTENSITE_TOTALE) <= 1 || visiteurs >= 800) return 0;
  const attrait = octet(jeu, parc + AFFLUENCE) + octetSigne(jeu, parc + ATTRAIT);
  const valeur = mul(mot(jeu, parc + 4), (motLong(jeu, parc + ATTRAIT_DES_JEUX) >>> 1) + motLongSigne(jeu, parc + INTENSITE_TOTALE)) >>> 7;
  const ecart = mot(jeu, parc + PRIX_D_ENTREE) - valeur;
  let arrivants = s16(attrait - idiv16(mul(ecart, attrait), valeur));
  if (arrivants < 0) arrivants = 0;
  else if (octet(jeu, parc + AFFLUENCE) < arrivants) arrivants = octet(jeu, parc + AFFLUENCE);
  if (visiteurs + arrivants > 800) arrivants = 0;
  return arrivants;
}

// Les visiteurs présents (0x7085C). Rend le nombre de ceux qui ont fait une attraction.
//
// Anomalie reproduite : les conditions du mois (+0x76 : bit 3, ou tout autre bit) ne s'appliquent pas
// au parc du concurrent mais à celui du joueur courant ([0xD3818]) : son contentement, son ennui et sa
// fatigue moyens. Avec le bit 3, ils bougent d'une quantité fixe ; sans lui, ils deviennent des sommes
// pondérées (le nombre des visiteurs du concurrent, moins 16 × ses amuseurs, à la valeur modifiée, les
// autres à l'ancienne) jamais redivisées : la moyenne du joueur devient une somme, jusqu'au prochain
// relevé de ses statistiques (0x68E34).
function lesVisiteursDuMois(jeu, parc, fiche, arrivants) {
  const visiteurs = motSigne(jeu, parc + VISITEURS);

  // Le fléau (+0x52) : il ronge les stocks et les amuseurs ; nombreux au regard des boutiques de
  // souvenirs (fléau × 8 × souvenirs au-delà des visiteurs), il coûte 100 de contentement à tous. Le
  // champ +0xDA l'abat ensuite.
  if (mot(jeu, parc + FLEAU) !== 0) {
    for (const champ of [NOURRITURE.reserve, BOISSONS.reserve, AMUSEURS]) ajouterAuMot(jeu, parc + champ, -mot(jeu, parc + FLEAU));
    const touches = mul(motSigne(jeu, parc + FLEAU) << 3, octet(jeu, parc + SOUVENIRS)) > visiteurs ? visiteurs : 0;
    ecrireMotLong(jeu, parc + CONTENTEMENT_TOTAL, mul(motLongSigne(jeu, parc + CONTENTEMENT), visiteurs - touches)
      + mul(touches, motLongSigne(jeu, parc + CONTENTEMENT) - 100));
    ecrireMotLong(jeu, parc + CONTENTEMENT, idiv(motLongSigne(jeu, parc + CONTENTEMENT_TOTAL), visiteurs));
  }
  if (mot(jeu, parc + CONTRE_LE_FLEAU) !== 0) ajouterAuMot(jeu, parc + FLEAU, -mot(jeu, parc + CONTRE_LE_FLEAU));
  if (motSigne(jeu, parc + FLEAU) < 0) ecrireMot(jeu, parc + FLEAU, 0);

  // Les conditions du mois, appliquées au parc du joueur courant (voir l'anomalie).
  const meteo = octet(jeu, METEO);
  const joueur = () => motLong(jeu, PARC_DU_JOUEUR);
  if (octet(jeu, parc + CONDITIONS) & 8) {
    ajouterAuMotLong(jeu, joueur() + CONTENTEMENT, mul(quotient(meteo, 4) + 1, 62));
    ajouterAuMotLong(jeu, joueur() + FATIGUE, -mul(meteo + 8, 62));
    ajouterAuMotLong(jeu, joueur() + ENNUI, -mul(quotient(meteo, 2) + 8, 62));
  } else if (octet(jeu, parc + CONDITIONS) !== 0) {
    let touches = s16(mot(jeu, parc + VISITEURS) - (mot(jeu, parc + AMUSEURS) << 4));
    if (touches < 0) touches = 0;
    const autres = visiteurs - touches;
    const J = joueur();
    ecrireMotLong(jeu, J + CONTENTEMENT, mul(motLong(jeu, J + CONTENTEMENT) - mul(quotient(meteo, 2) + 1, 62), touches)
      + mul(motLong(jeu, J + CONTENTEMENT), autres));
    ecrireMotLong(jeu, J + FATIGUE, mul(touches, mul(meteo * 2 + 8, 62) + motLong(jeu, J + FATIGUE))
      + mul(autres, motLong(jeu, J + FATIGUE)));
    ecrireMotLong(jeu, J + ENNUI, mul(touches, mul(meteo + 8, 62) + motLong(jeu, J + ENNUI))
      + mul(autres, motLong(jeu, J + ENNUI)));
  }
  if (octet(jeu, parc + BONUS_77) === 1) ajouterAuMotLong(jeu, parc + CONTENTEMENT, 100);

  // Les repas et les boissons (voir `servir` pour l'anomalie des boissons).
  if (motSigne(jeu, parc + ESTOMAC) < 7 && motSigne(jeu, parc + NOURRITURE.estomac) > 0 && motSigne(jeu, parc + SALETE) < 250) {
    servir(jeu, parc, fiche, NOURRITURE);
  }
  if (motSigne(jeu, parc + SOIF) < 7 && motSigne(jeu, parc + BOISSONS.soif) > 0 && motSigne(jeu, parc + SALETE) < 250) {
    servir(jeu, parc, fiche, BOISSONS);
  }

  if (octet(jeu, parc + TOILETTES) !== 0) allerAuxToilettes(jeu, parc);

  // Les souvenirs : au plus un par arrivant et par boutique, selon l'argent (/ 8), le contentement et
  // la marge ((prix × 100 / coût) × 4 − 500), sur 512.
  if (arrivants !== 0 && octet(jeu, parc + SOUVENIRS) !== 0) {
    const plafond = mul(arrivants, octet(jeu, parc + SOUVENIRS));
    const envie = ((motLong(jeu, parc + ARGENT) >>> 3) + motLongSigne(jeu, parc + CONTENTEMENT)
      + (idiv(mot(jeu, parc + PRIX_DES_SOUVENIRS) * 100, mot(jeu, parc + COUT_DES_SOUVENIRS)) << 2) - 500) | 0;
    let achats = s16(quotient(mul(s16(plafond), envie), 512));
    if (achats > mul(octet(jeu, parc + SOUVENIRS), arrivants)) achats = s16(plafond);
    else if (achats < 0) achats = 0;
    ecrireMotLong(jeu, parc + ARGENT, div(mul(motLong(jeu, parc + ARGENT), visiteurs - achats)
      + mul(motLong(jeu, parc + ARGENT) - mot(jeu, parc + PRIX_DES_SOUVENIRS), achats), visiteurs));
    const gain = mul(mot(jeu, parc + PRIX_DES_SOUVENIRS) - mot(jeu, parc + COUT_DES_SOUVENIRS), achats);
    ajouterAuMotLong(jeu, fiche + SOLDE, gain);
    ajouterAuMotLong(jeu, parc + RECETTE_DES_BOUTIQUES, gain);
  }

  // Les jeux d'adresse : les joueurs tirent chacun leur chance (+0x10B × 128 / 100 sur 128) ; les
  // gagnants prennent le lot, et un quart du lot en contentement.
  if (arrivants !== 0 && octet(jeu, parc + JEUX) !== 0) {
    const plafond = mul(arrivants, octet(jeu, parc + JEUX));
    const envie = (quotient(motLongSigne(jeu, parc + CONTENTEMENT), 8) + (motLong(jeu, parc + ARGENT) >>> 4)
      - (mot(jeu, parc + PRIX_DU_JEU) << 1) + ((octet(jeu, parc + CHANCE_AU_JEU) << 5) - 320)
      + (mot(jeu, parc + LOT) >> 2) + (motSigne(jeu, parc + CHAMP_109) << 3)) | 0;
    let joueurs = s16(quotient(mul(s16(plafond), envie), 512));
    if (joueurs > mul(octet(jeu, parc + JEUX), arrivants)) joueurs = s16(plafond);
    else if (joueurs < 0) joueurs = 0;
    const chance = s16(idiv(octet(jeu, parc + CHANCE_AU_JEU) << 7, 100));
    let gagnants = 0;
    for (let i = 0; i < joueurs; i++) {
      if ((jeu.appeler(HASARD) & 0xFFFF) % 128 < chance) gagnants++;
    }
    gagnants = s16(gagnants);
    ecrireMotLong(jeu, parc + CONTENTEMENT_TOTAL, mul(gagnants, (mot(jeu, parc + LOT) >> 2) + motLongSigne(jeu, parc + CONTENTEMENT))
      + mul(visiteurs - gagnants, motLongSigne(jeu, parc + CONTENTEMENT)));
    ecrireMotLong(jeu, parc + CONTENTEMENT, idiv(motLongSigne(jeu, parc + CONTENTEMENT_TOTAL), visiteurs));
    const argent = motLong(jeu, parc + ARGENT);
    ecrireMotLong(jeu, parc + ARGENT, div(mul(argent, visiteurs - joueurs + gagnants)
      + mul(argent - mot(jeu, parc + PRIX_DU_JEU), joueurs) + mul(mot(jeu, parc + LOT) + argent, gagnants), visiteurs));
    const lots = mul(mot(jeu, parc + LOT), gagnants);
    ajouterAuMotLong(jeu, parc + LOTS_GAGNES, lots);
    ajouterAuMotLong(jeu, fiche + SOLDE, mul(mot(jeu, parc + PRIX_DU_JEU), joueurs) - lots);
    ajouterAuMotLong(jeu, parc + RECETTE_DES_BOUTIQUES, mul(mot(jeu, parc + PRIX_DU_JEU), joueurs) - lots);
  }

  // Les attractions : chacune accueille deux fois la capacité moyenne, la deuxième la moitié, la
  // troisième le tiers… (jusqu'à un sixième) ; puis × 1 000 / durée moyenne, borné aux visiteurs. Qui
  // a fait une attraction perd un point d'estomac et de soif, et gagne son plaisir : intensité moyenne
  // × 4, intensité totale / 8, (6 − délai) × 16 ; les autres perdent selon leur faim, leur soif,
  // l'ennui et le nombre d'attractions qu'ils n'ont pas faites.
  let manegeurs = 0;
  const attractions = octet(jeu, parc + NOMBRE_D_ATTRACTIONS);
  if (attractions > 0) {
    let rang = 0;
    for (let k = attractions; k > 0; k--) {
      let part = idiv(motSigne(jeu, parc + CAPACITE_TOTALE) * 2, attractions);
      if (s16(rang) > 0) part = idiv(part, s16(rang));
      manegeurs = (manegeurs & 0xFFFF) + part;
      if (s16(rang) < 6) rang++;
    }
  }
  if (motSigne(jeu, parc + DUREE_MOYENNE) > 0) manegeurs = idiv((manegeurs & 0xFFFF) * 1000, motSigne(jeu, parc + DUREE_MOYENNE));
  if ((manegeurs & 0xFFFF) > visiteurs) manegeurs = mot(jeu, parc + VISITEURS);
  manegeurs &= 0xFFFF;
  const autres = visiteurs - manegeurs;
  ecrireMot(jeu, parc + SOIF, idiv(mul(autres, motSigne(jeu, parc + SOIF)) + mul(motSigne(jeu, parc + SOIF) - 1, manegeurs), visiteurs));
  ecrireMot(jeu, parc + ESTOMAC, idiv(mul(autres, motSigne(jeu, parc + ESTOMAC)) + mul(motSigne(jeu, parc + ESTOMAC) - 1, manegeurs), visiteurs));
  const contentement = motLongSigne(jeu, parc + CONTENTEMENT);
  const sansAttraction = (contentement - ((8 - motSigne(jeu, parc + ESTOMAC)) << 2) - ((8 - motSigne(jeu, parc + SOIF)) << 2)
    - (attractions << 3) - ((motLong(jeu, parc + ENNUI) << 5) >>> 11)) | 0;
  const plaisir = (contentement + (motSigne(jeu, parc + INTENSITE_MOYENNE) << 2)
    + quotient(motLongSigne(jeu, parc + INTENSITE_TOTALE), 8) + ((6 - octet(jeu, parc + DELAI_MOYEN)) << 4)) | 0;
  ecrireMotLong(jeu, parc + CONTENTEMENT_TOTAL, mul(autres, sansAttraction) + mul(plaisir, manegeurs) + quotient(contentement, 32));
  ecrireMotLong(jeu, parc + CONTENTEMENT, idiv(motLongSigne(jeu, parc + CONTENTEMENT_TOTAL), visiteurs));

  // Les amuseurs relèvent un contentement négatif : 8 visiteurs chacun gagnent un quart de leur salaire.
  if (motSigne(jeu, parc + AMUSEURS) > 0 && motLongSigne(jeu, parc + CONTENTEMENT) < 0) {
    const amuses = s16(mot(jeu, parc + AMUSEURS) << 3);
    ecrireMotLong(jeu, parc + CONTENTEMENT_TOTAL, mul(amuses, (motLong(jeu, parc + SALAIRE_DES_AMUSEURS) >>> 2) + motLongSigne(jeu, parc + CONTENTEMENT))
      + mul(visiteurs - amuses, motLongSigne(jeu, parc + CONTENTEMENT)));
    ecrireMotLong(jeu, parc + CONTENTEMENT, idiv(motLongSigne(jeu, parc + CONTENTEMENT_TOTAL), visiteurs));
  }
  return manegeurs;
}

// Les repas ou les boissons (0x7085C). Chaque stand sert une part des visiteurs non épuisés (visiteurs
// × (12 000 − fatigue) / 12 000), le premier en entier, les suivants divisés par un malus qui monte de
// 4 − attractions / stands par stand ; l'envie (sur 1 024) tient aux apports, au nombre de stands, au
// contentement, à l'argent, à la faim et à la soif, au prix et à la marge ; le tout borné au stock
// (+0xED × +0xF6, ou +0xF9 × +0x102) et à deux fois les visiteurs. Les servis salissent (un quart),
// vident le stock, remplissent l'estomac et la soif (4 × l'apport), paient (le concurrent gagne prix
// − coût), et changent de contentement selon la marge.
//
// Anomalie reproduite : pour les boissons, l'envie se calcule avec les apports, le prix et le coût
// moyens des stands de nourriture (+0xEE, +0xF0, +0xF2, +0xF4) ; seul le nombre de stands est celui
// des buvettes. Sans stand de nourriture, le coût moyen est nul et la division lève une exception,
// comme dans le programme.
function servir(jeu, parc, fiche, S) {
  const visiteurs = motSigne(jeu, parc + VISITEURS);
  const attractions = octet(jeu, parc + NOMBRE_D_ATTRACTIONS);
  let servis = 0, malus = 0;
  for (let k = octet(jeu, parc + S.nombre); s16(k) > 0; k--) {
    let part = idiv(mul(visiteurs, 12000 - motLongSigne(jeu, parc + FATIGUE)), 12000);
    if (s16(malus) > 0) part = idiv(part, s16(malus));
    servis = s16(servis) + part;
    malus = s16(malus) + (4 - idiv(attractions, octet(jeu, parc + S.nombre)));
  }
  const D = NOURRITURE;   // l'anomalie : l'envie lit toujours les champs de la nourriture
  const envie = (((motSigne(jeu, parc + D.estomac) + motSigne(jeu, parc + D.soif)) << 7) + (octet(jeu, parc + S.nombre) << 6)
    + quotient(motLongSigne(jeu, parc + CONTENTEMENT), 4) + (motLong(jeu, parc + ARGENT) >>> 4)
    - ((motSigne(jeu, parc + ESTOMAC) + motSigne(jeu, parc + SOIF)) << 6) - (mot(jeu, parc + D.prix) >> 1)
    - (idiv(mot(jeu, parc + D.prix) * 100, mot(jeu, parc + D.cout)) - 125)) | 0;
  servis = s16(quotient(mul(s16(servis), envie), 1024));
  if (servis > mul(octet(jeu, parc + S.stock), mot(jeu, parc + S.reserve))) servis = s16(mul(mot(jeu, parc + S.reserve), octet(jeu, parc + S.stock)));
  else if (servis > visiteurs * 2) servis = s16(mot(jeu, parc + VISITEURS) * 2);
  else if (servis < 0) servis = 0;

  ecrireMot(jeu, parc + SALETE, motSigne(jeu, parc + SALETE) + quotient(servis, 4));
  if (octet(jeu, parc + S.stock) !== 0) {
    ecrireMot(jeu, parc + S.reserve, idiv(mul(mot(jeu, parc + S.reserve), octet(jeu, parc + S.stock)) - servis, octet(jeu, parc + S.stock)));
  } else {
    ecrireMot(jeu, parc + S.reserve, 0);
  }
  const autres = visiteurs - servis;
  ecrireMot(jeu, parc + ESTOMAC, idiv(mul(motSigne(jeu, parc + ESTOMAC) + (motSigne(jeu, parc + S.estomac) << 2), servis)
    + mul(autres, motSigne(jeu, parc + ESTOMAC)), visiteurs));
  ecrireMot(jeu, parc + SOIF, idiv(mul((motSigne(jeu, parc + S.soif) << 2) + motSigne(jeu, parc + SOIF), servis)
    + mul(autres, motSigne(jeu, parc + SOIF)), visiteurs));
  ecrireMotLong(jeu, parc + ARGENT, div(mul(autres, motLong(jeu, parc + ARGENT))
    + mul(servis, motLong(jeu, parc + ARGENT) - mot(jeu, parc + S.prix)), visiteurs));
  ajouterAuMotLong(jeu, fiche + SOLDE, mul(servis, mot(jeu, parc + S.prix) - mot(jeu, parc + S.cout)));
  ajouterAuMotLong(jeu, parc + RECETTE_DES_BOUTIQUES, mul(mot(jeu, parc + S.prix) - mot(jeu, parc + S.cout), servis));
  const regret = quotient(idiv(mot(jeu, parc + S.prix) * 100, mot(jeu, parc + S.cout)) - 125, 4);
  ecrireMotLong(jeu, parc + CONTENTEMENT_TOTAL, mul(motLongSigne(jeu, parc + CONTENTEMENT) + motSigne(jeu, parc + ESTOMAC)
    + motSigne(jeu, parc + SOIF) - regret, servis) + mul(autres, motLongSigne(jeu, parc + CONTENTEMENT)));
  ecrireMotLong(jeu, parc + CONTENTEMENT, idiv(motLongSigne(jeu, parc + CONTENTEMENT_TOTAL), visiteurs));
}

// Les toilettes (0x7085C) : si leur usage (+0x84) est sous 32 × leur capacité (+0x88), y vont ceux dont
// l'estomac, ou la soif, est haut (de 3 à 5 : visiteurs / (7 − jauge) ; 6 et plus : tous), dans la
// limite de la place restante et de toilettes × (capacité par toilette)² / 16 384 ; ils y vident estomac
// et soif, paient en contentement l'usage et leurs besoins, et leur fatigue change (+ 2 × (600 − 2 ×
// capacité par toilette)). Non établi : aucun concurrent n'a de toilettes dans les scénarios, et
// aucune fonction de ce module n'en construit.
function allerAuxToilettes(jeu, parc) {
  const visiteurs = motSigne(jeu, parc + VISITEURS);
  const toilettes = octet(jeu, parc + TOILETTES);
  const parToilette = s16(idiv(mot(jeu, parc + CAPACITE_DES_TOILETTES) << 7, toilettes));
  const plafond = quotient(mul(parToilette, toilettes), 4);
  if (!(motLong(jeu, parc + USAGE_DES_TOILETTES) < (plafond >>> 0))) return;
  let pressants = 0;
  const estomac = motSigne(jeu, parc + ESTOMAC);
  if (estomac > 2 && estomac < 6) pressants = idiv(visiteurs, 7 - estomac);
  else if (estomac >= 6) pressants = visiteurs;
  const soif = motSigne(jeu, parc + SOIF);
  if (soif > 2 && soif < 6) pressants = (pressants + idiv(visiteurs, 7 - soif)) | 0;
  else if (soif >= 6) pressants = (pressants + visiteurs) | 0;
  if (visiteurs < pressants) pressants = visiteurs;
  const place = (plafond - motLong(jeu, parc + USAGE_DES_TOILETTES)) | 0;
  if ((place >>> 0) < (pressants >>> 0)) pressants = place;
  let servis = quotient(mul(mul(toilettes, parToilette), parToilette), 16384);
  if (servis > pressants) servis = pressants;
  ecrireMotLong(jeu, parc + CONTENTEMENT_TOTAL, mul(motLongSigne(jeu, parc + CONTENTEMENT) - div(motLong(jeu, parc + USAGE_DES_TOILETTES), toilettes)
    - (motSigne(jeu, parc + ESTOMAC) << 2) - (motSigne(jeu, parc + SOIF) << 2) - quotient(parToilette, 4), servis)
    + mul(visiteurs - servis, motLongSigne(jeu, parc + CONTENTEMENT)));
  ecrireMotLong(jeu, parc + CONTENTEMENT, idiv(motLongSigne(jeu, parc + CONTENTEMENT_TOTAL), visiteurs));
  ecrireMot(jeu, parc + ESTOMAC, idiv(mul(motSigne(jeu, parc + ESTOMAC), visiteurs - servis), visiteurs));
  ecrireMot(jeu, parc + SOIF, idiv(mul(motSigne(jeu, parc + SOIF), visiteurs - servis), visiteurs));
  ecrireMotLong(jeu, parc + FATIGUE, idiv(mul(servis, (600 - parToilette * 2) * 2 + motLongSigne(jeu, parc + FATIGUE))
    + mul(visiteurs - servis, motLongSigne(jeu, parc + FATIGUE)), visiteurs));
}

// L'usure des attractions (0x7085C), s'il y a eu plus d'un visiteur sur les attractions. Leur âge
// moyen (+0x9B) prend un mois, l'usure (+0x97) 7 − délai moyen + durée moyenne / 256 + âge / 8. Au-delà
// des trois quarts du seuil d'usure moyen, les mécaniciens réparent : l'usure est ramenée à (attractions
// − mécaniciens) / attractions de ce qu'elle était (à zéro s'ils sont assez), l'âge prend
// mécaniciens × 10 / attractions (10 à défaut). Puis, au-delà du double du seuil, l'attraction qui a
// le plus produit — intensité × capacité × années depuis sa construction, comparés sans signe — est
// retirée (`retirerUneAttraction`) ; au-delà du seuil, des pannes : un tirage modulo usure × manégeurs
// / 1 000, puis un tirage modulo ce tirage, coûtent chacune 1 000 de contentement, réparti sur tous.
function userLesAttractions(jeu, parc, fiche, manegeurs) {
  ajouterAuMotLong(jeu, parc + AGE_MOYEN, 1);
  ajouterAuMotLong(jeu, parc + USURE, (7 - octet(jeu, parc + DELAI_MOYEN)) + quotient(motSigne(jeu, parc + DUREE_MOYENNE), 256)
    + quotient(motLongSigne(jeu, parc + AGE_MOYEN), 8));
  if (!(quotient(motSigne(jeu, parc + SEUIL_D_USURE) * 3, 4) < motLongSigne(jeu, parc + USURE))) return;
  const attractions = () => octet(jeu, parc + NOMBRE_D_ATTRACTIONS);
  if (motSigne(jeu, parc + MECANICIENS) > 0) {
    if (attractions() > motSigne(jeu, parc + MECANICIENS)) {
      ecrireMotLong(jeu, parc + USURE, idiv(mul(attractions() - motSigne(jeu, parc + MECANICIENS), motLongSigne(jeu, parc + USURE)), attractions()));
      ajouterAuMotLong(jeu, parc + AGE_MOYEN, idiv(motSigne(jeu, parc + MECANICIENS) * 10, attractions()));
    } else {
      ecrireMotLong(jeu, parc + USURE, 0);
      ajouterAuMotLong(jeu, parc + AGE_MOYEN, 10);
    }
  }
  if ((motSigne(jeu, parc + SEUIL_D_USURE) << 1) < motLongSigne(jeu, parc + USURE)) {
    retirerUneAttraction(jeu, parc, fiche);
  } else if (motSigne(jeu, parc + SEUIL_D_USURE) < motLongSigne(jeu, parc + USURE)) {
    let pannes = 0;
    if (quotient(mul(motLongSigne(jeu, parc + USURE), manegeurs), 1024) > 0) {
      const etendue = idiv(mul(motLongSigne(jeu, parc + USURE), manegeurs), 1000);
      pannes = (jeu.appeler(HASARD) & 0xFFFF) % etendue;
      if (pannes !== 0) pannes = (jeu.appeler(HASARD) & 0xFFFF) % pannes;
    }
    if (manegeurs < pannes) pannes = manegeurs;
    if (pannes !== 0) {
      const visiteurs = motSigne(jeu, parc + VISITEURS);
      ecrireMotLong(jeu, parc + CONTENTEMENT_TOTAL, mul(motLongSigne(jeu, parc + CONTENTEMENT), visiteurs) - mul(pannes, 1000));
      ecrireMotLong(jeu, parc + CONTENTEMENT, idiv(motLongSigne(jeu, parc + CONTENTEMENT_TOTAL), visiteurs));
      ajouterAuMot(jeu, parc + PANNES, 1);
    }
  }
}

// Retirer l'attraction usée (0x7085C) : parmi les genres construits (octet +0x63 positif), celui dont
// intensité × capacité × (année − année de construction − 1) est le plus grand, sans signe. Le
// concurrent l'oublie (octet à 0), son âge en années (année + 1 − octet) décompte son prix d'une des
// dix cases de +0x37 ; le parc perd l'attraction, un point d'attrait (−19 au plus bas), et ses
// moyennes la retirent — l'âge moyen de 32 × son âge, l'usure de 16 × son âge.
function retirerUneAttraction(jeu, parc, fiche) {
  let pire = 0, choix = -1;
  for (let g = 0; mot(jeu, ATTRACTIONS + g * TAILLE_ATTRACTION + 0x22) !== 0; g++) {
    const construite = octetSigne(jeu, fiche + ANNEE_DE_L_ATTRACTION + g);
    if (construite <= 0) continue;
    const a = ATTRACTIONS + g * TAILLE_ATTRACTION;
    const production = mul(mul(octet(jeu, a + 0xA9), motSigne(jeu, a + 0xA6)), annee(jeu) - construite) >>> 0;
    if (production > (pire >>> 0)) { pire = production; choix = s8(g); }
  }
  if (choix === -1) return;
  const a = ATTRACTIONS + choix * TAILLE_ATTRACTION;
  const age = s16(annee(jeu) + 1 - octetSigne(jeu, fiche + ANNEE_DE_L_ATTRACTION + choix));
  if (age >= 0 && age < 10) ajouterAuMotLong(jeu, fiche + DEPENSES_DE_CONSTRUCTION + 4 * age, -motLong(jeu, a + 0xA2));
  ecrireOctet(jeu, fiche + ANNEE_DE_L_ATTRACTION + choix, 0);
  ajouterALOctet(jeu, parc + NOMBRE_D_ATTRACTIONS, -1);
  ajouterAuMot(jeu, parc + RETIREES, 1);
  ajouterALOctet(jeu, parc + ATTRAIT, -1);
  if (octetSigne(jeu, parc + ATTRAIT) < -19) ecrireOctet(jeu, parc + ATTRAIT, -19);
  const n = octet(jeu, parc + NOMBRE_D_ATTRACTIONS);
  if (n === 0) {
    ecrireMotLong(jeu, parc + INTENSITE_TOTALE, 0);
    ecrireMot(jeu, parc + INTENSITE_MOYENNE, 0);
    ecrireMotLong(jeu, parc + USURE, 0);
    ecrireMot(jeu, parc + SEUIL_D_USURE, 0);
    ecrireMot(jeu, parc + DUREE_MOYENNE, 0);
    ecrireMotLong(jeu, parc + AGE_MOYEN, 0);
    ecrireMot(jeu, parc + CAPACITE_TOTALE, 0);
    return;
  }
  ajouterAuMotLong(jeu, parc + INTENSITE_TOTALE, -octet(jeu, a + 0xA9));
  if (motLongSigne(jeu, parc + INTENSITE_TOTALE) < 0) ecrireMotLong(jeu, parc + INTENSITE_TOTALE, 0);
  ecrireMotLong(jeu, parc + AGE_MOYEN, idiv(mul(motLongSigne(jeu, parc + AGE_MOYEN), n + 1) - (age << 5), n));
  ecrireMotLong(jeu, parc + USURE, idiv(mul(n + 1, motLongSigne(jeu, parc + USURE)) - (age << 4), n));
  ecrireMot(jeu, parc + SEUIL_D_USURE, idiv(mul(motSigne(jeu, parc + SEUIL_D_USURE), n + 1) - octet(jeu, a + 0xA8), n));
  ecrireMot(jeu, parc + DUREE_MOYENNE, idiv(mul(motSigne(jeu, parc + DUREE_MOYENNE), n + 1) - mot(jeu, a + 0xAC), n));
  ecrireMot(jeu, parc + INTENSITE_MOYENNE, idiv(motLongSigne(jeu, parc + INTENSITE_TOTALE), n));
  ecrireMot(jeu, parc + CAPACITE_TOTALE, mot(jeu, parc + CAPACITE_TOTALE) - mot(jeu, a + 0xA6));
  if (motSigne(jeu, parc + CAPACITE_TOTALE) < 0) ecrireMot(jeu, parc + CAPACITE_TOTALE, 0);
}

// --- les constructions ------------------------------------------------------------------------------

// 0x7376C — un concurrent achète une attraction du genre donné (catalogue de référence) : il la paie,
// le compte de ses constructions monte d'autant, et son parc l'ajoute à ses sommes (intensité,
// capacité) et à ses moyennes (délai, usure — la sienne, fiche +0xAE, vaut 6 pour tous les genres —,
// seuil d'usure, durée ; l'âge moyen est rajeuni d'autant). L'octet du genre retient l'année + 1.
export function construireUneAttraction(jeu, genre, fiche) {
  genre = s16(genre);
  const parc = ficheDuParc(jeu, fiche);
  const a = ATTRACTIONS + mul(genre, TAILLE_ATTRACTION);
  ajouterAuMotLong(jeu, fiche + SOLDE, -motLong(jeu, a + 0xA2));
  ajouterAuMotLong(jeu, parc + INTENSITE_TOTALE, octet(jeu, a + 0xA9));
  ajouterAuMot(jeu, parc + CAPACITE_TOTALE, mot(jeu, a + 0xA6));
  ajouterAuMotLong(jeu, fiche + DEPENSES_DE_CONSTRUCTION, motLong(jeu, a + 0xA2));
  const n = octet(jeu, parc + NOMBRE_D_ATTRACTIONS);
  ecrireMot(jeu, parc + INTENSITE_MOYENNE, idiv(motLongSigne(jeu, parc + INTENSITE_TOTALE), n + 1));
  ecrireOctet(jeu, parc + DELAI_MOYEN, idiv(n * octet(jeu, parc + DELAI_MOYEN) + mot(jeu, a + 0xB8), n + 1));
  ecrireMotLong(jeu, parc + USURE, idiv(mul(n, motLongSigne(jeu, parc + USURE)) + mot(jeu, a + 0xAE), n + 1));
  ecrireMot(jeu, parc + SEUIL_D_USURE, idiv(mul(motSigne(jeu, parc + SEUIL_D_USURE), n) + octet(jeu, a + 0xA8), n + 1));
  ecrireMot(jeu, parc + DUREE_MOYENNE, idiv(mul(n, motSigne(jeu, parc + DUREE_MOYENNE)) + mot(jeu, a + 0xAC), n + 1));
  ecrireMotLong(jeu, parc + AGE_MOYEN, idiv(mul(n, motLongSigne(jeu, parc + AGE_MOYEN)), n + 1));
  ajouterALOctet(jeu, parc + NOMBRE_D_ATTRACTIONS, 1);
  ecrireOctet(jeu, fiche + ANNEE_DE_L_ATTRACTION + genre, annee(jeu) + 1);
}

// 0x73969 — un concurrent achète une montagne russe à éléments (voie 2) de la taille donnée : comme
// 0x7376C, mais le prix, l'intensité et la capacité sont ceux de la taille (table 0xBDD92 ;
// l'intensité et la capacité selon son caractère), la taille est retenue dans la fiche du parc
// (+0xA7), et l'octet du genre retient l'année, et non l'année + 1. (La taille 6 lit la table suivante :
// voir « Anomalies reproduites », plus haut.) Non exercée par les scénarios.
export function construireUneMontagneRusse(jeu, genre, taille, fiche) {
  genre = s16(genre);
  const parc = ficheDuParc(jeu, fiche);
  const a = ATTRACTIONS + mul(genre, TAILLE_ATTRACTION);
  const m = (MONTAGNES_RUSSES + mul(s8(taille), TAILLE_MONTAGNE_RUSSE)) >>> 0;
  const caractere = octet(jeu, fiche + CARACTERE);
  ajouterAuMotLong(jeu, fiche + SOLDE, -motLong(jeu, m));
  ecrireOctet(jeu, parc + MONTAGNE_RUSSE, taille);
  ajouterAuMotLong(jeu, parc + INTENSITE_TOTALE, octet(jeu, m + 0x22 + caractere));
  ajouterAuMot(jeu, parc + CAPACITE_TOTALE, octet(jeu, m + 0x1D + caractere));
  ajouterAuMotLong(jeu, fiche + DEPENSES_DE_CONSTRUCTION, motLong(jeu, m));
  const n = octet(jeu, parc + NOMBRE_D_ATTRACTIONS);
  ecrireMot(jeu, parc + INTENSITE_MOYENNE, idiv(motLongSigne(jeu, parc + INTENSITE_TOTALE), n + 1));
  ecrireOctet(jeu, parc + DELAI_MOYEN, idiv(n * octet(jeu, parc + DELAI_MOYEN) + mot(jeu, a + 0xB8), n + 1));
  ecrireMotLong(jeu, parc + USURE, idiv(mul(n, motLongSigne(jeu, parc + USURE)) + mot(jeu, a + 0xAE), n + 1));
  ecrireMot(jeu, parc + SEUIL_D_USURE, idiv(mul(motSigne(jeu, parc + SEUIL_D_USURE), n) + octet(jeu, a + 0xA8), n + 1));
  ecrireMot(jeu, parc + DUREE_MOYENNE, idiv(mul(n, motSigne(jeu, parc + DUREE_MOYENNE)) + mot(jeu, a + 0xAC), n + 1));
  ecrireMotLong(jeu, parc + AGE_MOYEN, idiv(mul(n, motLongSigne(jeu, parc + AGE_MOYEN)), n + 1));
  ajouterALOctet(jeu, parc + NOMBRE_D_ATTRACTIONS, 1);
  ecrireOctet(jeu, fiche + ANNEE_DE_L_ATTRACTION + genre, annee(jeu));
}

// 0x73B82 — un concurrent achète une boutique du genre donné (catalogue de référence) : il la paie,
// le compte de ses constructions monte d'autant, et selon la famille (octet +0x25) son parc l'ajoute
// aux moyennes des stands de nourriture (1 : apports, prix, coût), des buvettes (2) et des boutiques de
// souvenirs (4 : prix, coût) ; une glace (famille 3) compte des deux premières. Un jeu (8) n'entre dans
// aucune. L'octet du genre retient l'année.
export function construireUneBoutique(jeu, genre, fiche) {
  genre = s16(genre);
  const parc = ficheDuParc(jeu, fiche);
  const b = (BOUTIQUES + mul(genre, TAILLE_BOUTIQUE)) >>> 0;
  ajouterAuMotLong(jeu, fiche + SOLDE, -motLong(jeu, b + 0x49));
  for (const [bit, S] of [[1, NOURRITURE], [2, BOISSONS]]) {
    if ((octet(jeu, b + 0x25) & bit) === 0) continue;
    const n = octet(jeu, parc + S.nombre);
    ecrireMot(jeu, parc + S.estomac, idiv(mul(motSigne(jeu, parc + S.estomac), n) + octetSigne(jeu, b + 0x56), n + 1));
    ecrireMot(jeu, parc + S.soif, idiv(mul(n, motSigne(jeu, parc + S.soif)) + octetSigne(jeu, b + 0x57), n + 1));
    ecrireMot(jeu, parc + S.prix, idiv(mul(n, mot(jeu, parc + S.prix)) + mot(jeu, b + 0x4F), n + 1));
    ecrireMot(jeu, parc + S.cout, idiv(mul(n, mot(jeu, parc + S.cout)) + mot(jeu, b + 0x4D), n + 1));
    ajouterALOctet(jeu, parc + S.nombre, 1);
    ajouterALOctet(jeu, parc + NOMBRE_DE_BOUTIQUES, 1);
  }
  if (octet(jeu, b + 0x25) & 4) {
    const n = octet(jeu, parc + SOUVENIRS);
    ecrireMot(jeu, parc + PRIX_DES_SOUVENIRS, idiv(mul(n, mot(jeu, parc + PRIX_DES_SOUVENIRS)) + mot(jeu, b + 0x4F), n + 1));
    ecrireMot(jeu, parc + COUT_DES_SOUVENIRS, idiv(mul(mot(jeu, parc + COUT_DES_SOUVENIRS), n) + mot(jeu, b + 0x4D), n + 1));
    ajouterALOctet(jeu, parc + SOUVENIRS, 1);
    ajouterALOctet(jeu, parc + NOMBRE_DE_BOUTIQUES, 1);
  }
  ajouterAuMotLong(jeu, fiche + DEPENSES_DE_CONSTRUCTION, motLong(jeu, b + 0x49));
  ecrireOctet(jeu, fiche + ANNEE_DE_LA_BOUTIQUE + genre, annee(jeu));
}

// --- la liste des réécritures ----------------------------------------------------------------------------

// Ce que ces fonctions écrivent hors des zones comparées par défaut : les fiches des joueurs, dans le
// tas ; et, par 0x68E34 (qui relève le salaire minimal du personnel), les objets du parc.
function fiches(jeu) {
  return [[motLong(jeu, FICHES_DES_JOUEURS), motLong(jeu, FIN_DES_FICHES)]];
}
function fichesEtObjets(jeu) {
  return [...fiches(jeu), [motLong(jeu, 0xD3B10), motLong(jeu, 0xD3B78)]];
}

export const reecritures = [
  { adresse: 0x6E7E6, nom: 'preparerLesJoueurs', fn: (jeu) => preparerLesJoueurs(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x6EE22, nom: 'mettreAJourLesParcs', fn: (jeu) => mettreAJourLesParcs(jeu), arguments: 0, zones: fichesEtObjets },
  { adresse: 0x7085C, nom: 'simulerLeParcConcurrent', fn: simulerLeParcConcurrent, arguments: 2, zones: fiches },
  { adresse: 0x7376C, nom: 'construireUneAttraction', fn: construireUneAttraction, arguments: 2, zones: fiches },
  { adresse: 0x73B82, nom: 'construireUneBoutique', fn: construireUneBoutique, arguments: 2, zones: fiches },
];

export const enAttente = [
  // Aucun concurrent des scénarios n'achète de montagne russe à éléments.
  { adresse: 0x73969, nom: 'construireUneMontagneRusse', fn: construireUneMontagneRusse, arguments: 3, zones: fiches },
];
