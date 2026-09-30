// Des états des visiteurs, appelés par la mise à jour des objets du parc (0x21681) : second lot.
//
// Module du chantier de la simulation : réécriture lisible en cours. Voir docs/guide-reecriture.md.
//
// À chaque passage, 0x21681 parcourt tous les objets du parc et confie chaque visiteur (type 2) à la
// routine de son état, l'octet +C. Ce module en réécrit neuf, et cinq auxiliaires :
//
//   état 0x1A  0x273C8  la pause : il s'arrête un instant, puis reprend l'état mis de côté
//   état 0x1E  0x266D7  il va vers l'arrêt du bus, pour quitter le parc
//              0x26BDE    ... et prend place dans la file de l'arrêt (état 0x22)
//   état 0x34  0x24D4B  la file d'une attraction avance, ou il y renonce : il fait avancer celui qui
//                       le suit, puis s'avance à son tour (état 0xA)
//   état 0x38  0x25FE7  dans une boutique, il attend d'être le premier au comptoir
//   état 0x3A  0x260F4  il est servi
//              0x68616    ... et paie : ce qu'il achète, ce que cela lui fait, ce que gagne le parc
//   état 0x3C  0x27494  il montre son humeur, puis passe à la pause (0x1A)
//   état 0x3E  0x25339  une animation jouée une fois (vraisemblablement le visiteur qui vomit, voir
//                       plus bas), puis il reprend sa promenade (état 8)
//   état 0x4A  0x272DE  il entre dans une attraction sans file
//   état 0x4C  0x275F3  il entre dans les toilettes
//              0x30B19  il monte dans une attraction (appelée par les attractions et par l'état 0x4A)
//              0x32142  le visiteur qui fait la queue derrière celui qui monte est appelé à avancer
//              0x65D25  il est éjecté d'un wagon (appelée par les véhicules, 0x42392)
//
// Les autres états sont réécrits ailleurs (visiteurs.js, visiteurs-outils.js, visiteurs-etats-a.js),
// et nommés ici comme là : 4 le guichet d'entrée du parc, 8 la promenade sur les allées, 0xA il
// s'avance dans la file d'une attraction, 0xC il fait la queue, 0xE sur l'attraction, 0x14 il va
// vers une boutique, 0x16 au jeu d'adresse, 0x18 il revient de la boutique vers l'allée, 0x22 il
// attend le bus du départ, 0x4E aux toilettes.
//
// LE VISITEUR, un objet du parc de 200 octets (table [0xD3B10]). Les champs que lisent et écrivent
// les fonctions de ce module :
//
//   +2   mot signé  l'objet suivant sur la même case (la liste de la case, retro-ingenierie.md § 6.4)
//   +4   octet      le type : 2
//   +5   octet      bit 0 posé par un achat (0x68616) ; sens non établi
//   +6   mot        position horizontale en 256es de case : l'octet +7 est la colonne, l'octet +6 la
//                   place dans la case (0x80 au milieu)
//   +8   mot        position verticale : l'octet +9 est la rangée, l'octet +8 la place dans la case
//   +A   mot        l'objet graphique qui le représente (l'image courante de son animation)
//   +C   octet      l'état
//   +D   octet      l'état que reprend le visiteur à la sortie du guichet d'entrée
//                   (visiteurs-outils.js) ; 0x32142 le relit comme +C
//   +12  octet      la direction : 0 nord (rangée −1), 1 est (colonne +1), 2 sud, 3 ouest
//   +13  octet      la vitesse : ce qu'il avance à chaque passage, en 256es de case
//   +14  mot        un décompte, en passages : jusqu'à la prochaine décision en marchant ; le temps
//                   à passer aux toilettes
//   +16  mot        le numéro de l'objet qu'il vise ou qu'il occupe : l'attraction où il monte, la
//                   boutique où il achète
//   +18… bits       les genres d'attractions essayés : le bit n° [genre + 0xC1] (0x30B19)
//   +1E  mot        dans la file d'une attraction, le numéro du visiteur qui le suit
//   +20  mot long   au guichet d'entrée (état 4, 0x223C1), un compte de ses décisions : voir « La
//                   pile », plus bas
//   +28  mot        l'écart avec lequel il s'est rangé dans la file de l'arrêt (0x26BDE) : 0x80
//   +47  mot        dans une attraction, le passager suivant (la liste part du mot +47 de l'attraction)
//   +4F  octet      −1 quand il a quitté le parc (0x28752) ; sinon compté dans les relevés
//   +50  octet signé  l'estomac : ce qu'il a mangé (sous 9, il a encore faim)
//   +51  octet signé  ce qu'il a bu (sous 9, il a encore soif)
//   +52  mot        les boutiques de souvenirs et jeux déjà faits : un bit par boutique (son mot +52)
//   +53  octet      bit 1 : il a gagné au jeu d'adresse
//   +54  mot signé  l'humeur : sous le seuil [[0xD3818] + 2] (−100) il est mécontent, sous le
//                   seuil [[0xD3818]] (200) indifférent, au-delà content
//   +58  octet      la direction mise de côté pendant une pause
//   +59  octet      sa sorte (son allure) : l'élément de la table des apparences 0xB49F4
//   +5A  octet      l'émotion en attente, 1 à 3, tirée au hasard par la promenade (0 : aucune) ;
//                   +3 à chaque attraction (voir montrerSonHumeur)
//   +63  octet      ce qu'il a sur lui et laissera par terre : les bits des déchets de la case
//                   (octet +3 de la cellule, les « décors éparpillés » de dessin-carte.js) ; 1 après
//                   une boisson, 2 après un repas ; 4 le fait passer dans l'état 0x3E (0x22E22)
//   +6F  mot        son argent
//   +8B  octet signé  le décompte de la pause et de l'humeur (états 0x1A et 0x3C)
//   +8C  mot        l'objet graphique de ce qu'il porte (le souvenir acheté)
//   +BC  octet      l'état à reprendre après la pause
//   +C7  octet      tiré entre 2 et 11 après un repas ou une boisson ; sens non établi
//
// Les objets d'un autre type que lisent et écrivent ces fonctions sont décrits avec elles : la
// boutique (type 0xA) avant attendreSonTour, les toilettes (0x18) à entrerAuxToilettes,
// l'attraction (4) avant faireAvancerLaFile.
//
// LA PILE. Le programme d'origine lit parfois une variable locale qu'il n'a pas écrite : au guichet
// d'entrée (état 4, 0x223C1), quand le mot long +20 du visiteur vaut 1, le visiteur saute le pas qui
// aurait écrit sa variable [ebp − 8] (0x22413), puis tire de l'octet bas de celle-ci — la place dans
// la case qu'il croit lire — le décompte de son recentrage (0x22572). Il y trouve ce qu'y a laissé
// l'une des routines que 0x21681 a appelées avant lui, au même niveau de pile, pour d'autres objets :
// celle d'avant, ou une plus ancienne quand les suivantes n'écrivent pas là (comme 0x273C8, 0x27494
// et 0x25339). Relevé sur les 330 s de simulation.json : 255 lectures, 37 valeurs différentes ; la
// routine appelée juste avant était le plus souvent la promenade (0x22E22, 161 fois), puis 0x223C1
// elle-même, 0x273C8 et 0x27494. La partie dépend donc de ce que les routines laissent dans la pile
// (visiteurs-etats-a.js et attractions.js l'ont établi aussi ; docs/architecture.md tenait ces
// octets pour jamais lus).
//
// Pour que la partie reste identique, chaque fonction de ce module reproduit son cadre de pile
// d'origine (la classe Cadre) : les registres sauvés à l'entrée, ses variables locales avec leurs
// valeurs, et ses appels, faits à la même profondeur, avec la même adresse de retour et le même
// ebx (que les fonctions appelées sauvent dans leur cadre), pour qu'elles y laissent à leur tour les
// mêmes restes. C'est plus que ce que lit 0x223C1 (l'octet en E − 24, E la pile à l'entrée), et
// c'est vérifié : sur les 330 s de simulation.json, un appel sur dix de chaque fonction, la pile
// entière, sous le pointeur de pile compris, est la même octet pour octet après la réécriture
// qu'après la transcription. Ne sont pas reproduits eax, ecx et edx au moment des appels : aucune
// des fonctions appelées n'en garde de reste dans la pile.
//
// Vérification : moteur/scenarios/simulation.json (le parc de la démo laissé à lui-même huit mois
// de jeu) et construction.json exercent toutes les fonctions de ce module ; ce qu'aucun scénario
// n'exerce est signalé « non vérifié ». Voir le bas du fichier.

import { reglages } from './reglages.js';   // hors du jeu d'origine : la correction des éjections

// --- La mémoire ---------------------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const motLong = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserMotLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);
const ajouterAuMotLong = (jeu, a, v) => poserMotLong(jeu, a, motLong(jeu, a) + v);
const HAUT = 0xFFFF0000;            // la moitié haute d'un registre, qu'une écriture de 16 bits garde

// Division entière du processeur (idiv) : tronquée vers zéro ; un diviseur nul lève une exception,
// comme sur la machine.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

// --- Le cadre de pile d'origine -----------------------------------------------------------------
//
// Voir « La pile », en tête. Toutes les fonctions de ce module commencent par sauver ebx, esi et edi
// puis ouvrent un cadre (enter n, 0, ou push ebp ; mov ebp, esp) ; leurs variables locales sont à
// [ebp − k], leurs appels partent de ebp − n, et leurs arguments sont à [ebp + 0x14], [ebp + 0x18]…
//
// `ebx` suit le registre ebx du programme d'origine, que certaines fonctions emploient à leurs
// calculs (un diviseur, un décalage) entre deux appels : on l'y pose avant chaque appel, et on
// rend ensuite à l'appelant celui qu'il avait.
class Cadre {
  constructor(jeu, locales) {
    const R = jeu.T.R;                  // les registres à l'entrée, relevés par l'enveloppe
    this.jeu = jeu;
    this.retour = R.esp >>> 0;          // le sommet de la pile : l'adresse de retour
    this.espEntree = R.esp;
    this.ebpEntree = R.ebp;
    this.ebxEntree = R.ebx;
    this.ebx = R.ebx >>> 0;
    this.edx = R.edx >>> 0;             // relu par le calcul d'un pas (pasEtSesRestes)
    poserMotLong(jeu, this.retour - 4, R.ebx);
    poserMotLong(jeu, this.retour - 8, R.esi);
    poserMotLong(jeu, this.retour - 12, R.edi);
    poserMotLong(jeu, this.retour - 16, R.ebp);
    this.ebp = this.retour - 16;
    this.esp = this.ebp - locales;
  }

  // Une variable locale, [ebp − k] : un mot long, ou un octet.
  local(k, valeur) { poserMotLong(this.jeu, this.ebp - k, valeur); }
  localOctet(k, valeur) { poserOctet(this.jeu, this.ebp - k, valeur); }

  // L'argument n (1 pour le premier), quand la fonction s'en sert comme d'une variable.
  argument(n, valeur) { poserMotLong(this.jeu, this.retour + 4 * n, valeur); }

  // Appelle une fonction du jeu depuis la profondeur d'origine, avec ebp sur ce cadre et le ebx du
  // programme, puis remet dans la pile l'adresse de retour d'origine (jeu.appeler en empile une
  // fictive).
  appeler(retour, adresse, ...args) {
    const { T } = this.jeu;
    T.sauver(); T.R.esp = this.esp; T.R.ebp = this.ebp; T.R.ebx = this.ebx | 0; T.charger();
    const resultat = this.jeu.appeler(adresse, ...args);
    poserMotLong(this.jeu, this.esp - 4 * args.length - 4, retour);
    T.sauver(); T.R.esp = this.espEntree; T.R.ebp = this.ebpEntree; T.R.ebx = this.ebxEntree; T.charger();
    return resultat;
  }
}

// --- Les données du jeu -------------------------------------------------------------------------
// Le nombre de passages de la mise à jour des objets : 0x21681 l'incrémente à chaque appel. Il
// cadence les animations — le plus souvent, un visiteur passe à l'image suivante un passage sur
// quatre.
const PASSAGES = 0xD3AF8;           // mot long

const GRILLE = 0xD3B08;             // pointeur : la carte, 64x64 cellules de 4 octets (§ 6.2)
const OBJETS = 0xD3B10;             // pointeur : les objets du parc, numérotés à partir de 1
const TAILLE_OBJET = 200;
const OBJETS_GRAPHIQUES = 0xD3B80;  // pointeur : 8 octets par objet graphique ; le mot +6 est
                                    // l'image suivante de l'animation (objets.js)
const FIGURES = 0xD3B38;            // pointeur : mots, numéro de figure → objet graphique

// Les apparences des visiteurs : 18 mots par sorte (octet +59), chacun un numéro de figure.
//   mot 0      la marche : la figure de la direction d est le mot 0 + d
//   mot 3      l'humeur contente, mot 5 indifférente, mot 6 mécontente (montrerSonHumeur)
//   mots 8, 9, 10  les humeurs 2, 1, 3 de l'octet +5A, par la table EXPRESSIONS
//   mot 4      l'animation de l'état 0x3E (0x22E22) ; les autres mots, non établis ici
const APPARENCES = 0xB49F4;
const TAILLE_APPARENCE = 0x24;
const MARCHE = 0, CONTENT = 3, INDIFFERENT = 5, MECONTENT = 6;
// Mots : pour chaque humeur de l'octet +5A (0 à 3), le mot de l'apparence qui la montre : 0, 9, 8,
// 10. L'humeur 0 n'y est cherchée qu'après une humeur hors limites (voir montrerSonHumeur).
const EXPRESSIONS = 0xB4B3C;

// Les directions. DEPLACEMENTS : (dx, dy) en octets signés pour chacune ; nord (0, −1), est (1, 0),
// sud (0, 1), ouest (−1, 0). DIRECTION_OPPOSEE : un octet tous les deux (2, 3, 0, 1). VOISINES :
// mots signés, l'écart en cellules de la case voisine dans chaque direction (−64, 1, 64, −1).
const DEPLACEMENTS = 0xB4932;
const DIRECTION_OPPOSEE = 0xB48EC;
const VOISINES = 0xB4920;
const NORD = 0, EST = 1, SUD = 2, OUEST = 3;
const TAILLE_CARTE = 64;
const BORD = 0x3F;                  // la dernière colonne et la dernière rangée de la carte
const DEMI_CASE = 0xB8B9C;          // mot : 128, la moitié d'une case en 256es

// Les structures du parc, pointées ; ce qu'on en sait vient des champs lus ici et dans 0x21681.
//   [0xD3808]  la fiche du joueur en cours, dans la table [0xD3B00] (§ 7) :
//              +0xA mot long : le solde ; +0xE mot long : non établi, diminué avec le solde du
//              règlement d'une boutique (reglerLaDette)
//   [0xD3814]  les comptes du parc : +0x2CA mot, une case, rangée × 64 + colonne — (32, 60) dans
//              la démo, dont le sol est 0x88, celui de l'arrêt du bus devant le portique d'entrée ;
//              +0x366 mot long, ce qu'ont rapporté les boutiques (le bénéfice de chaque vente).
//              0x78943 y tient le journal des opérations.
//   [0xD3818]  les réglages et relevés du parc : +0 et +2 mots signés, les seuils de l'humeur
//              (200 et −100 dans la démo) ; +6 mot, la majoration jugée normale d'un prix, en
//              pour cent (40) ; +0x3F mot long, la valeur des lots gagnés au jeu d'adresse ;
//              +0x84 mot long, le nombre de passages aux toilettes
const JOUEUR = 0xD3808;
const COMPTES = 0xD3814;
const PARC = 0xD3818;

// Le catalogue des boutiques : fiches de 107 octets, nom en tête. Le mot +16 d'une boutique est le
// décalage de sa fiche (107 × genre). (docs/retro-ingenierie.md situe ces fiches en 0xD3C86, 0x24
// plus loin, famille en tête : c'est la même table, vue depuis l'octet +0x24.)
//   +0x22 mot    un identifiant : 0x113 désigne le café (COFFEE SHOP)
//   +0x24 octet  la famille : 1 à manger, 2 à boire, 4 souvenirs, 8 jeu d'adresse (ARCADE)
//   +0x25 octet  la sorte de vente : bit 0 nourrit, bit 1 désaltère (les glaces font les deux),
//                4 souvenir, 8 jeu d'adresse
//   +0x28 mot    la figure du vendeur qui sert (0xB9 dans la démo) ; 0 : pas d'animation
//   +0x4D mot    le prix de revient ; au jeu d'adresse, la valeur du lot
//   +0x4F mot    le prix de vente
//   +0x56, +0x57 octets signés  ce que l'achat ajoute à la faim et à la soif satisfaites (les frites :
//                +3 et −1, elles donnent soif)
//   +0x5A mot    la figure de l'objet emporté (souvenirs)
//   +0x5C octet  le déchet laissé (1 gobelet, 2 emballage ; 0 aucun) : les bits de l'octet +63
//   +0x5D octet  au jeu d'adresse, la chance de gagner : n × 128 / 100 sur 128 (5 : 6 chances)
//   +0x5E octet  l'ingrédient dosé, 0 à 4 (5 et plus : aucun) ; +0x5F octet, la dose (2 par
//                défaut). Vraisemblablement le sel, la glace, le sucre… que le joueur règle : non
//                établi, sauf le café (voir payerSonAchat)
//   +0x60, +0x62 mots  au jeu d'adresse, les figures montrées quand on gagne et quand on perd
//   +0x67 octet signé  la marchandise en réserve qui est vendue (−1 : aucune), dans MARCHANDISES
//   +0x69 octet  au jeu d'adresse, ce que perdre coûte en plus en humeur
const FICHES_BOUTIQUES = 0xD3C62;
const CAFE = 0x113;
const A_MANGER = 1, A_BOIRE = 2, SOUVENIRS = 4, JEU_D_ADRESSE = 8;
const NOURRIT = 1, DESALTERE = 2;
const FIGURE_DU_VENDEUR = 0xB9;     // la fin du service se reconnaît au retour à sa première image
// Les marchandises en réserve : 14 octets chacune ; +2 mot, leur coût du moment ; +4 mot, le stock.
// Le stock n'est décompté que si l'octet 0xD66F1 vaut 2 (2 dans la démo ; ses autres valeurs, non
// établies : un niveau de jeu où l'on gère les réserves ?).
const MARCHANDISES = 0xD3C00;
const TAILLE_MARCHANDISE = 0xE;
const GESTION_DES_RESERVES = 0xD66F1;

// Le catalogue des décors et petits bâtiments, fiches de 0x38 octets : le mot +16 des toilettes y
// désigne la leur, et l'octet 0xCCAA1 + genre × 0x38 est le temps qu'on y passe, en plus de ce qu'on a
// mangé et bu : 50, 150 et 25 pour les genres 15, 16 et 17, ceux des toilettes de la démo. Où
// commence chaque fiche, donc quel nom va avec quel genre, n'est pas établi ici (personnel.js et
// visiteurs-outils.js diffèrent d'une fiche : OUTHOUSE, SUPER TOILET, CENTRE FOUNTAIN, ou BOGGY
// CRAPPER, OUTHOUSE, SUPER TOILET).
const DUREE_AUX_TOILETTES = 0xCCAA1;
const TAILLE_DECOR = 0x38;

// Le catalogue des attractions (0xCCED0, fiches de 200 octets, retro-ingenierie.md § 6.4).
//   +0xB4 octet  3 : une attraction dont les passagers ne sont pas comptés (lesquelles, non établi)
//   +0xC1 octet  le bit du genre dans le champ +18 des visiteurs (les genres déjà essayés)
const GENRES_ATTRACTIONS = 0xCCED0;

// Le sol de l'arrêt du bus (octet +2 de la cellule) : là où le bus prend ceux qui partent.
const SOL_DE_L_ARRET = 0x88;

// Les états des visiteurs.
const PROMENADE = 8;                // il se promène sur les allées (0x22E22)
const S_AVANCE_DANS_LA_FILE = 0xA;  // il s'avance dans la file d'une attraction (0x243DD)
const FAIT_LA_QUEUE = 0xC;          // il fait la queue, arrêté dans la file (0x24DFE)
const SUR_L_ATTRACTION = 0xE;       // (0x24F41)
const AU_JEU = 0x16;                // au jeu d'adresse, le temps du jeu (0x2634B)
const REVIENT_DE_LA_BOUTIQUE = 0x18;  // il revient vers l'allée (0x2641F)
const EN_PAUSE = 0x1A;
const ATTEND_LE_BUS = 0x22;         // dans la file de l'arrêt (0x2698E)
const LA_FILE_AVANCE = 0x34;
const SERVI = 0x3A;
const HUMEUR = 0x3C;
const AUX_TOILETTES = 0x4E;         // (0x2775A)
const ETAT_PAR_DEFAUT = 6;          // repris après une pause quand aucun état n'a été mis de côté
const ENTRE_SANS_FILE = 0x4A;        // il entre dans une attraction sans file (0x272DE, ici)

// --- Les fonctions appelées ---------------------------------------------------------------------
const OBJET_DU_TYPE_SUR_LA_CASE = 0x204B9;  // (cellule, type) → le premier objet de ce type, ou 0
const DEPLACER = 0x18A44;                   // (objet, x, y) : le pose ailleurs, change de case s'il le faut
const HASARD = 0x18B92;                     // le générateur du jeu : 0 à 0x7FFF
const VALEUR_ABSOLUE = 0x80BF2;
const REFLECHIR = 0x2789A;                  // (visiteur, 0) : ses pensées et émotions (visiteurs-outils.js) ;
                                            // 1 s'il s'arrête pour exprimer une émotion
// 0x2DEF8 ne fait que remettre à zéro le mot 0xD6688, la demande de sortie de la boucle du parc
// (posée par 0x1A836 et 0x2CCF8, lue en 0x11C51). 0x19ED3 l'appelle et rend 1 : le programme s'en
// sert à la place d'une division par une vitesse nulle. Vraisemblablement le reste d'une routine de
// signalement d'erreur ; rôle exact non établi.
const EFFACER_LA_DEMANDE_DE_SORTIE = 0x2DEF8;
const DIVISION_PAR_ZERO = 0x19ED3;
const QUITTER_LE_PARC = 0x28752;            // (visiteur) : le retire du parc et des relevés
const ENREGISTRER_UNE_OPERATION = 0x78943;  // (catégorie, montant) : le solde et le journal
const L_ATTRACTION_EST_PLEINE = 0x31ED3;    // (attraction)
const ACCIDENT = 0x66189;                   // (cause, visiteur, véhicule, vitesse)
// Les fonctions de ce module qui en appellent une autre du module passent, elles aussi, par
// jeu.appeler : c'est l'entrée de la fonction que surveillent les vérificateurs.
const PRENDRE_LA_FILE_DU_DEPART = 0x26BDE;
const PAYER_SON_ACHAT = 0x68616;
const APPELER_LE_SUIVANT = 0x32142;

// --- Outils -------------------------------------------------------------------------------------
function tableDesObjets(jeu) { return motLong(jeu, OBJETS); }

// L'objet numéro n : l'adresse, sans contrôle. Les numéros sont lus tantôt signés (les listes des
// cases), tantôt non signés (les autres liens) : c'est à l'appelant de le dire.
function objet(jeu, n) { return tableDesObjets(jeu) + n * TAILLE_OBJET; }

// Le numéro d'un objet, par une division signée comme dans le programme.
function numero(jeu, o) { return diviser((o - tableDesObjets(jeu)) | 0, TAILLE_OBJET); }

// La cellule de la carte où se trouve un objet.
function celluleDe(jeu, o) {
  return motLong(jeu, GRILLE) + (octet(jeu, o + 9) * TAILLE_CARTE + octet(jeu, o + 7)) * 4;
}

function figure(jeu, n) { return mot(jeu, motLong(jeu, FIGURES) + 2 * n); }
function objetGraphique(jeu, index) { return motLong(jeu, OBJETS_GRAPHIQUES) + index * 8; }

// L'image suivante de l'animation d'un objet.
function avancerLAnimation(jeu, o) {
  poserMot(jeu, o + 0xA, mot(jeu, objetGraphique(jeu, mot(jeu, o + 0xA)) + 6));
}

// La plupart des états animent le visiteur un passage sur quatre.
function animerUnPassageSurQuatre(jeu, o) {
  if ((motLong(jeu, PASSAGES) & 3) === 0) avancerLAnimation(jeu, o);
}

// La figure d'une apparence : le mot `champ` de celle de la sorte du visiteur, plus un décalage.
function figureDeLApparence(jeu, o, champ, decalage = 0) {
  return figure(jeu, mot(jeu, APPARENCES + octet(jeu, o + 0x59) * TAILLE_APPARENCE + 2 * champ) + decalage);
}

// La silhouette de marche dans sa direction : l'image de repos d'un visiteur.
function silhouetteDeMarche(jeu, o) {
  return figureDeLApparence(jeu, o, MARCHE, octet(jeu, o + 0x12));
}

// Anime le visiteur un passage sur quatre, et rend ce que vaut alors edx dans le programme : l'image
// suivante dans sa moitié basse (mov dx, [objet graphique + 6]) et, dans sa moitié haute, celle de
// l'index de l'image précédente multiplié par 8 ; sans animation, edx à l'entrée.
function animerEtRelever(jeu, v, cadre) {
  if ((motLong(jeu, PASSAGES) & 3) !== 0) return cadre.edx;
  const image = mot(jeu, v + 0xA);
  avancerLAnimation(jeu, v);
  return (((image << 3) & HAUT) | mot(jeu, v + 0xA)) >>> 0;
}

// Un pas dans sa direction, à sa vitesse : la nouvelle position (x, y), en mots — au-delà de 0xFFFF,
// elle reboucle. Le programme calcule chaque coordonnée dans un registre de 32 bits dont il n'écrit
// que la moitié basse, et range le tout dans ses variables locales : leurs moitiés hautes sont des
// restes (celle de l'adresse du visiteur, celle de edx ou de ebx avant le calcul), qu'on reproduit
// parce qu'ils restent dans la pile. `ebx` : le registre où 0x266D7 met le déplacement horizontal
// (le troisième élément rendu est ce qu'il y laisse) ; null pour 0x275F3, qui le met dans edx.
function pasEtSesRestes(jeu, v, edx, ebx) {
  const d = octet(jeu, v + 0x12), vitesse = octet(jeu, v + 0x13);
  const dx = octetSigne(jeu, DEPLACEMENTS + 2 * d) & 0xFFFF;
  const dy = octetSigne(jeu, DEPLACEMENTS + 2 * d + 1) & 0xFFFF;
  const hautDuVisiteur = v & HAUT;
  let produit;
  if (ebx === null) produit = Math.imul((edx & HAUT) | dx, hautDuVisiteur | vitesse);
  else produit = Math.imul((edx & HAUT) | vitesse, (ebx & HAUT) | dx);
  const x = ((hautDuVisiteur | mot(jeu, v + 6)) + produit) | 0;
  produit = Math.imul((produit & HAUT) | dy, hautDuVisiteur | vitesse);
  const y = ((hautDuVisiteur | mot(jeu, v + 8)) + produit) | 0;
  return [x, y, ebx === null ? null : ((ebx & HAUT) | dx) >>> 0];
}

function sortirDeLaBoutique(jeu, v) {
  poserOctet(jeu, v + 0xC, REVIENT_DE_LA_BOUTIQUE);
  poserMot(jeu, v + 0x14, 0);
}

// ================================================================================================

// 0x273C8 — état 0x1A, la pause.
//
// Le visiteur s'arrête, le temps que son décompte (+8B) tombe à zéro ; son animation continue (celle
// de l'émotion que lui a donnée 0x2789A, ou l'humeur de montrerSonHumeur). Puis il reprend sa
// silhouette de marche, sa direction mise de côté (+58) et l'état mis de côté (+BC), ou l'état 6
// s'il n'y en avait pas ; le décompte est réarmé à 0x30 pour la prochaine fois. Rend 1 quand la pause
// finit, 0 sinon.
//
// Relevé dans simulation.json : les états repris sont 8 (la promenade, presque toujours), 2, 4, 0xC,
// 0x10 et 0x40. Non vérifié : la reprise de l'état 6, sans état mis de côté.
export function sArreterUnInstant(jeu, v) {
  const cadre = new Cadre(jeu, 4);
  animerUnPassageSurQuatre(jeu, v);
  poserOctet(jeu, v + 0x8B, octet(jeu, v + 0x8B) - 1);
  if (octetSigne(jeu, v + 0x8B) > 0) { cadre.local(4, 0); return 0; }
  poserOctet(jeu, v + 0x8B, 0x30);
  poserMot(jeu, v + 0xA, silhouetteDeMarche(jeu, v));
  poserOctet(jeu, v + 0xC, octet(jeu, v + 0xBC));
  if (octet(jeu, v + 0xC) === 0) poserOctet(jeu, v + 0xC, ETAT_PAR_DEFAUT);
  poserOctet(jeu, v + 0xBC, 0);
  poserOctet(jeu, v + 0x12, octet(jeu, v + 0x58));
  cadre.local(4, 1);
  return 1;
}

// 0x27494 — état 0x3C, montrer son humeur.
//
// On l'y met quand on lui demande d'exprimer ce qu'il ressent (0x2789A forcée par 0x32BCF,
// visiteurs-outils.js). Le visiteur attend que son décompte (+8B) tombe à zéro, puis montre son
// humeur pendant une pause de 0x20 passages (état 0x1A). L'image : l'émotion en attente, l'octet +5A,
// s'il en a une (1 à 3, tirée au hasard par la promenade, 0x22E22) ; sinon son humeur générale, +54,
// comparée aux deux seuils du parc (les mots 3, 5 et 6 de son apparence ; ce qu'ils montrent, non
// vérifié sur image). Rend 1 quand il passe à la pause, 0 sinon.
//
// Anomalies, reproduites. Chaque attraction ajoute 3 à l'octet +5A (0x30B19) : une émotion en attente
// y devient 4 à 6, hors limites ; elle est alors remise à 0, et le visiteur montre le mot 0 de son
// apparence, sa silhouette de marche vers le nord. Relevé dans simulation.json : +5A valait 0, ou 4 à
// 6, jamais 1 à 3 — ce dernier cas n'est donc pas vérifié. Et les seuils sont ici exclusifs : un
// visiteur exactement au seuil bas est montré entre les deux, alors que le relevé de 0x21681 (qui
// compare avec « au plus ») le compte parmi les mécontents.
export function montrerSonHumeur(jeu, v) {
  const cadre = new Cadre(jeu, 4);
  animerUnPassageSurQuatre(jeu, v);
  poserOctet(jeu, v + 0x8B, octet(jeu, v + 0x8B) - 1);
  if (octetSigne(jeu, v + 0x8B) > 0) { cadre.local(4, 0); return 0; }

  if (octet(jeu, v + 0x5A) !== 0) {
    if (octet(jeu, v + 0x5A) > 3) poserOctet(jeu, v + 0x5A, 0);
    const champ = mot(jeu, EXPRESSIONS + 2 * octet(jeu, v + 0x5A));
    poserMot(jeu, v + 0xA, figureDeLApparence(jeu, v, champ));
  } else {
    const parc = motLong(jeu, PARC);
    const humeur = motSigne(jeu, v + 0x54);
    let champ = CONTENT;
    if (humeur < motSigne(jeu, parc + 2)) champ = MECONTENT;
    else if (humeur < motSigne(jeu, parc + 0)) champ = INDIFFERENT;
    poserMot(jeu, v + 0xA, figureDeLApparence(jeu, v, champ));
  }
  poserOctet(jeu, v + 0xC, EN_PAUSE);
  poserOctet(jeu, v + 0x8B, 0x20);
  cadre.local(4, 1);
  return 1;
}

// 0x25339 — état 0x3E, une animation jouée une fois.
//
// Le visiteur déroule son animation trois passages sur quatre, et reprend sa promenade (état 8) avec
// sa silhouette quand il atteint une image marquée comme dernière (bit 0 de l'octet +5 de l'objet
// graphique, c'est-à-dire bit 8 du mot +4 que objets.js laisse non établi). Ce qu'elle montre : la
// promenade (0x22E22) l'y fait entrer, avec le mot 4 de son apparence, quand le bit 2 de son octet
// +63 est posé, en laissant sur sa case le déchet correspondant ; vraisemblablement le visiteur qui
// vomit, non vérifié sur image.
export function jouerUneAnimation(jeu, v) {
  new Cadre(jeu, 0);
  if ((motLong(jeu, PASSAGES) & 3) !== 0) avancerLAnimation(jeu, v);
  if (octet(jeu, objetGraphique(jeu, mot(jeu, v + 0xA)) + 5) & 1) {
    poserOctet(jeu, v + 0xC, PROMENADE);
    poserMot(jeu, v + 0xA, silhouetteDeMarche(jeu, v));
  }
}

// 0x275F3 — état 0x4C, entrer dans les toilettes.
//
// Le visiteur marche, un pas par passage, jusqu'à ce que son décompte (+14) tombe à zéro. Il est
// alors dans la cabine : état 0x4E, au milieu de la case. Si des toilettes (type 0x18) sont sur la
// case et en service (leur état +C vaut 2), son décompte devient le temps qu'il y passera : quatre
// passages par point d'estomac et de soif (ce qu'il a mangé et bu), plus la durée propre aux
// toilettes, lue dans leur fiche ; elles comptent un usage de plus (+3C), le parc aussi. Sinon le
// décompte reste à zéro. Rend toujours 1.
//
// Les toilettes : +C octet, l'état (2 : en service) ; +16 mot, leur fiche dans le catalogue des
// décors ; +3C mot, le nombre d'usages.
//
// Relevé dans simulation.json : des séjours de 9 à 57 passages, tous dans des toilettes du genre 17.
// Non vérifié : une case sans toilettes en service.
export function entrerAuxToilettes(jeu, v) {
  const cadre = new Cadre(jeu, 0x10);
  const [x, y] = pasEtSesRestes(jeu, v, animerEtRelever(jeu, v, cadre), null);
  cadre.local(8, x);
  cadre.local(0xC, y);
  cadre.appeler(0x27686, DEPLACER, v, x & 0xFFFF, y & 0xFFFF);
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  cadre.local(4, 1);
  if (motSigne(jeu, v + 0x14) > 0) return 1;

  poserOctet(jeu, v + 0xC, AUX_TOILETTES);
  poserOctet(jeu, v + 6, 0x80);
  poserOctet(jeu, v + 8, 0x80);
  const toilettes = cadre.appeler(0x276E4, OBJET_DU_TYPE_SUR_LA_CASE, celluleDe(jeu, v), 0x18) >>> 0;
  cadre.local(0x10, toilettes);
  if (toilettes > tableDesObjets(jeu) && octet(jeu, toilettes + 0xC) === 2) {
    const mangeEtBu = octetSigne(jeu, v + 0x50) + octetSigne(jeu, v + 0x51);
    const duree = octet(jeu, DUREE_AUX_TOILETTES + mot(jeu, toilettes + 0x16) * TAILLE_DECOR);
    poserMot(jeu, v + 0x14, mangeEtBu * 4 + duree);
    poserMot(jeu, toilettes + 0x3C, mot(jeu, toilettes + 0x3C) + 1);
    ajouterAuMotLong(jeu, motLong(jeu, PARC) + 0x84, 1);
  }
  return 1;
}

// --- Les boutiques ------------------------------------------------------------------------------
//
// Le visiteur qui entre dans une boutique (état 0x14, 0x25E1B) se pose sur sa case, dans la liste
// des objets de la case, et attend son tour (0x38) ; le premier visiteur de la liste est servi (0x3A)
// pendant que le vendeur fait son geste, puis il paie et revient vers l'allée (0x18). Au jeu
// d'adresse, il joue (0x16) et le jeu montre s'il a gagné.
//
// La boutique, un objet du parc de type 0xA : +A mot, son objet graphique ; +14 mot signé, le nombre
// de ventes (qui rend, par 1/256, les clients plus enclins à acheter à manger et à boire) ; +16 mot,
// sa fiche (107 × genre) ; +38 mot signé, une somme qu'elle doit, en centaines (reglerLaDette ; d'où
// elle vient, non établi) ; +47 mot, au jeu d'adresse, le joueur en cours ; +52 mot, son bit parmi
// les souvenirs et jeux déjà faits des visiteurs ; +5F mot, l'image courante du vendeur qui sert,
// 0 s'il ne sert pas ; +94 mot, au jeu d'adresse, les lots gagnés.
//
// Relevé dans simulation.json : on sert à manger (avec le geste du vendeur), à boire (avec et sans)
// et au jeu d'adresse ; les boutiques de souvenirs du catalogue ne sont jamais visitées. Non vérifiés
// dans ces trois fonctions : une case sans boutique, la dette d'une boutique (+38 : aucune n'en a),
// les souvenirs, le jeu d'adresse déjà fait, et une famille hors de 1, 2, 4 et 8.

// 0x25FE7 — état 0x38, attendre son tour au comptoir.
//
// Sans boutique sur sa case, le visiteur repart (0x18). Sinon, quand il est le premier visiteur de la
// liste de la case, il est servi (état 0x3A) et le vendeur commence son geste, si la boutique en a
// un : son image courante part de la seconde image de la figure du vendeur.
export function attendreSonTour(jeu, v) {
  const cadre = new Cadre(jeu, 0xC);
  const boutique = cadre.appeler(0x2601E, OBJET_DU_TYPE_SUR_LA_CASE, celluleDe(jeu, v), 0xA) >>> 0;
  cadre.local(4, boutique);
  if (boutique === 0) { sortirDeLaBoutique(jeu, v); return; }
  animerUnPassageSurQuatre(jeu, v);
  const premier = cadre.appeler(0x26083, OBJET_DU_TYPE_SUR_LA_CASE, celluleDe(jeu, v), 2) >>> 0;
  cadre.local(0xC, premier);
  if (premier !== v) return;
  poserOctet(jeu, v + 0xC, SERVI);
  const fiche = FICHES_BOUTIQUES + mot(jeu, boutique + 0x16);
  cadre.local(8, fiche);
  if (mot(jeu, fiche + 0x28) !== 0) {
    poserMot(jeu, boutique + 0x5F, mot(jeu, objetGraphique(jeu, figure(jeu, mot(jeu, fiche + 0x28))) + 6));
  }
}

// Une somme que doit la boutique (+38, en centaines) est débitée au passage d'un client : une
// opération de catégorie 1 au journal (0x78943, qui la retire du solde), et autant en moins sur le
// mot long +0xE de la fiche du joueur. `retour` : l'adresse de retour de l'appel, selon l'endroit.
function reglerLaDette(jeu, cadre, retour, boutique) {
  if (mot(jeu, boutique + 0x38) === 0) return;
  cadre.appeler(retour, ENREGISTRER_UNE_OPERATION, 1, Math.imul(-motSigne(jeu, boutique + 0x38), 100));
  ajouterAuMotLong(jeu, motLong(jeu, JOUEUR) + 0xE, Math.imul(-motSigne(jeu, boutique + 0x38), 100));
  poserMot(jeu, boutique + 0x38, 0);
}

// 0x260F4 — état 0x3A, être servi.
//
// Sans boutique sur sa case, le visiteur repart (0x18). Selon la famille de la boutique :
//  - à manger, à boire, souvenirs : si le vendeur fait son geste, on le laisse finir (son image
//    avance un passage sur trois, le client un sur quatre) ; revenu à la première image de la
//    figure 0xB9, il a servi : le client paie et repart. Sans geste, le client paie tout de suite
//    et repart, et c'est alors seulement que la dette de la boutique est réglée ;
//  - jeu d'adresse : la dette est réglée, le client joue et paie, le jeu montre l'image du gain ou
//    de la perte, et le client passe au jeu (état 0x16) ;
//  - toute autre famille : rien ne se passe.
//
// La fin du geste est reconnue à la figure 0xB9, écrite en dur, et non à celle de la fiche (+0x28) :
// une boutique dont le vendeur aurait une autre figure ne finirait de servir que si son animation
// passait par cette image. Toutes celles du catalogue qui ont un geste ont la figure 0xB9.
export function etreServi(jeu, v) {
  const cadre = new Cadre(jeu, 0xC);
  const boutique = cadre.appeler(0x2612B, OBJET_DU_TYPE_SUR_LA_CASE, celluleDe(jeu, v), 0xA) >>> 0;
  cadre.local(4, boutique);
  if (boutique === 0) { sortirDeLaBoutique(jeu, v); return; }
  const fiche = FICHES_BOUTIQUES + mot(jeu, boutique + 0x16);
  cadre.local(8, fiche);
  const famille = octet(jeu, fiche + 0x24);
  cadre.localOctet(0xC, famille);

  if (famille === A_MANGER || famille === A_BOIRE || famille === SOUVENIRS) {
    if (mot(jeu, boutique + 0x5F) !== 0) {
      cadre.ebx = 3;                              // le diviseur
      if (motLong(jeu, PASSAGES) % 3 === 0) {
        poserMot(jeu, boutique + 0x5F, mot(jeu, objetGraphique(jeu, mot(jeu, boutique + 0x5F)) + 6));
      }
      animerUnPassageSurQuatre(jeu, v);
      if (mot(jeu, boutique + 0x5F) === figure(jeu, FIGURE_DU_VENDEUR)) {
        cadre.appeler(0x2620A, PAYER_SON_ACHAT, v, boutique);
        sortirDeLaBoutique(jeu, v);
      }
    } else {
      cadre.appeler(0x2622C, PAYER_SON_ACHAT, v, boutique);
      reglerLaDette(jeu, cadre, 0x26251, boutique);
      sortirDeLaBoutique(jeu, v);
    }
  } else if (famille === JEU_D_ADRESSE) {
    reglerLaDette(jeu, cadre, 0x262AB, boutique);
    cadre.ebx = TAILLE_OBJET;                     // le diviseur du numéro
    poserMot(jeu, boutique + 0x47, numero(jeu, v));
    const gagne = cadre.appeler(0x262F0, PAYER_SON_ACHAT, v, boutique) & 0xFF;
    poserMot(jeu, boutique + 0xA, figure(jeu, mot(jeu, fiche + (gagne ? 0x60 : 0x62))));
    poserOctet(jeu, v + 0xC, AU_JEU);
  }
}

// La marge d'une vente : le prix en pour cent du coût.
function prixEnPourCent(prix, cout) { return diviser(prix * 100, cout); }

// Ce que coûte au client, en humeur, un prix plus élevé que la majoration normale : le double de
// l'écart, en points de pour cent. Négatif, c'est une bonne affaire.
function exces(jeu, prix, cout) {
  return (prixEnPourCent(prix, cout) - 100 - mot(jeu, motLong(jeu, PARC) + 6)) * 2;
}

// Ce que toute vente fait : la boutique compte une vente, le parc encaisse la recette (au solde du
// joueur et aux comptes des boutiques), le client paie le prix.
function encaisser(jeu, v, boutique, fiche, recette) {
  poserMot(jeu, boutique + 0x14, mot(jeu, boutique + 0x14) + 1);
  ajouterAuMotLong(jeu, motLong(jeu, JOUEUR) + 0xA, recette);
  ajouterAuMotLong(jeu, motLong(jeu, COMPTES) + 0x366, recette);
  poserMot(jeu, v + 0x6F, mot(jeu, v + 0x6F) - mot(jeu, fiche + 0x4F));
}

// Ce que l'achat nourrit et désaltère.
function nourrirEtDesalterer(jeu, v, fiche) {
  poserOctet(jeu, v + 0x50, octet(jeu, v + 0x50) + octet(jeu, fiche + 0x56));
  poserOctet(jeu, v + 0x51, octet(jeu, v + 0x51) + octet(jeu, fiche + 0x57));
}

// Le client prend le bit de la boutique et emporte l'objet de la fiche.
function emporter(jeu, v, boutique, fiche) {
  poserMot(jeu, v + 0x52, mot(jeu, v + 0x52) | mot(jeu, boutique + 0x52));
  poserMot(jeu, v + 0x8C, figure(jeu, mot(jeu, fiche + 0x5A)));
}

// Un souvenir ou un jeu ne se fait qu'une fois : la boutique doit avoir son bit (+52), et le client
// ne pas l'avoir déjà. Une boutique sans bit ne vend donc rien de cette façon.
function dejaFait(jeu, v, boutique) {
  const bit = mot(jeu, boutique + 0x52);
  return bit === 0 || (mot(jeu, v + 0x52) & bit) !== 0;
}

// 0x68616 — le client paie son achat.
//
// Le second argument, la boutique, n'est pas lu : le programme l'écrase aussitôt par l'objet que
// désigne le mot +16 du visiteur (c'est la même boutique). Rend, dans l'octet bas de eax, 1 si le
// client a gagné au jeu d'adresse, 0 sinon ; le reste du registre n'est pas significatif.
//
// Trois façons d'acheter, selon la sorte de vente de la fiche (octet +0x25) :
//
// SOUVENIRS (bit 2) — s'il ne l'a pas déjà (dejaFait), le client achète si
//     argent / 8 + humeur / 16 + 50 − exces − prix / 2  >  0
//   Le parc gagne la marge (prix − coût) ; l'humeur du client monte de ce que l'achat nourrit et
//   désaltère (rien, pour les souvenirs du catalogue) et baisse de (prix en % − 125) / 16. Il emporte
//   l'objet (+8C) et prend le bit de la boutique.
//
// JEU D'ADRESSE (bit 3) — s'il n'y a pas déjà joué, le client joue, sans condition : il gagne si
//   le hasard (sur 128) tombe sous la chance du jeu. Gagnant, le lot (le « coût » de la fiche) est
//   une dépense du parc (opération 0x13 au journal, cumulée en [[0xD3818] + 0x3F]), et son humeur
//   monte du quart de sa valeur ; perdant, elle baisse du prix et de l'octet +0x69. Le parc encaisse
//   le prix entier. Le programme calcule aussi une note de l'envie de jouer (argent, humeur, prix,
//   chance, lot), puis l'oublie : elle ne sert que la pile.
//
// À MANGER, À BOIRE (bits 0 et 1) — le client n'achète que s'il a encore faim (estomac sous 9) et
//   que la boutique nourrit, ou encore soif (ce qu'il a bu sous 9) et qu'elle désaltère ; et si
//     humeur / 16 + ventes / 256 + 32 × (ce que l'achat nourrit et désaltère − ce qu'il a déjà
//     mangé et bu) + argent / 8 − prix − exces  >  0
//   Une marchandise tirée des réserves (+0x67) doit y être en stock ; le stock baisse de un quand
//   0xD66F1 vaut 2. Au café, une dose au-dessus de 3 double la vitesse du client (jusqu'à 0x20 :
//   au-delà, plus rien). Puis l'ingrédient dosé agit sur l'humeur, avec un peu de hasard, et sur ce
//   qu'il a mangé ou bu (dose d, hasard h de 0 à 15) :
//     0 : humeur + (2 − d) × 32 + 8 − h, bu − d/2 (les frites)
//     1 : humeur − ((2 − d) × 32 + 8 − h), bu + d/2 (le cola)
//     2 : humeur + (2 − d) × 32 + 8 − h, estomac − d/2 (le burger, le restaurant)
//     3 : humeur + (1 − d) × 32 + 8 − h, bu − d/2 (le saloon)
//     4 : humeur + (2 − d) × 32 + 8 − h, estomac − d/2 (les glaces)
//   Le parc encaisse le prix entier pour une marchandise des réserves (déjà payée à l'achat du
//   stock), la marge sinon ; l'humeur baisse de (prix en % du coût − 125) / 4, le coût étant celui
//   du moment pour une marchandise des réserves. Le client complète ses déchets, tire l'octet +C7
//   (2 à 11), et son humeur monte de ce que l'achat nourrit et désaltère.
//
// Toutes les divisions sont tronquées vers zéro.
//
// Relevé dans simulation.json : ventes à manger, à boire, de glaces et au jeu d'adresse (gagné deux
// fois), stocks épuisés compris. Non vérifiés : les souvenirs ; le jeu d'adresse déjà fait ; une
// boutique qui ne nourrit ni ne désaltère ; un client sans faim ni soif, ou sans envie d'acheter ;
// le café à une dose au-dessus de 3.
//
// Le cadre : [ebp − 0x18] la fiche ; [ebp − 0x1C] l'envie d'acheter un souvenir ; [ebp − 0x14] la
// note du jeu d'adresse ; octet [ebp − 4] la chance, octet [ebp − 0xC] le gain, recopié en fin dans
// l'octet [ebp − 8] ; [ebp − 0x10] un calcul mort du café ; octet [ebp − 0x20] l'ingrédient dosé.
export function payerSonAchat(jeu, v) {
  const cadre = new Cadre(jeu, 0x20);
  cadre.local(0x1C, 0);
  cadre.local(0x14, 0);
  cadre.localOctet(4, 0);
  cadre.localOctet(0xC, 0);
  const boutique = objet(jeu, mot(jeu, v + 0x16));
  cadre.argument(2, boutique);
  const fiche = FICHES_BOUTIQUES + mot(jeu, boutique + 0x16);
  cadre.local(0x18, fiche);
  const gagne = acheter(jeu, cadre, v, boutique, fiche);
  cadre.localOctet(8, gagne);
  return gagne;
}

function acheter(jeu, cadre, v, boutique, fiche) {
  const sorte = octet(jeu, fiche + 0x25);
  const prix = mot(jeu, fiche + 0x4F), cout = mot(jeu, fiche + 0x4D);

  if (sorte & SOUVENIRS) {
    if (dejaFait(jeu, v, boutique)) return 0;
    const penalite = exces(jeu, prix, cout);
    const humeur = diviser(motSigne(jeu, v + 0x54), 16);
    const envie = (mot(jeu, v + 0x6F) >> 3) + (humeur + 50) - penalite - (prix >> 1);
    cadre.local(0x1C, envie);
    if (envie <= 0) return 0;
    encaisser(jeu, v, boutique, fiche, prix - cout);
    poserOctet(jeu, v + 0x63, octet(jeu, fiche + 0x5C));
    poserOctet(jeu, v + 5, octet(jeu, v + 5) | 1);
    nourrirEtDesalterer(jeu, v, fiche);
    poserMot(jeu, v + 0x54, mot(jeu, v + 0x54) + octetSigne(jeu, fiche + 0x56) + octetSigne(jeu, fiche + 0x57));
    poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) - diviser(prixEnPourCent(prix, cout) - 125, 16));
    emporter(jeu, v, boutique, fiche);
    return 0;
  }

  if (sorte & JEU_D_ADRESSE) {
    if (dejaFait(jeu, v, boutique)) return 0;
    const chance = octet(jeu, fiche + 0x5D);
    cadre.local(0x14, (mot(jeu, v + 0x6F) >> 4) + diviser(motSigne(jeu, v + 0x54), 8) - 2 * prix
      + (chance * 32 - 0x140) + (cout >> 3) + 2 * octet(jeu, fiche + 0x69));
    cadre.ebx = 100;                              // le diviseur
    const seuil = diviser(chance << 7, 100) & 0xFF;
    cadre.localOctet(4, seuil);
    let gagne = 0;
    const tirage = cadre.appeler(0x68894, HASARD) & 0xFFFF;
    cadre.ebx = 128;                              // le diviseur
    if (tirage % 128 < seuil) {
      cadre.appeler(0x688BC, ENREGISTRER_UNE_OPERATION, 0x13, -cout);
      poserMot(jeu, boutique + 0x94, mot(jeu, boutique + 0x94) + 1);
      ajouterAuMotLong(jeu, motLong(jeu, PARC) + 0x3F, cout);
      poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) + (cout >> 2));
      poserOctet(jeu, v + 0x53, octet(jeu, v + 0x53) | 2);
      gagne = 1;
      cadre.localOctet(0xC, gagne);
    } else {
      poserMot(jeu, v + 0x54, mot(jeu, v + 0x54) - (octet(jeu, fiche + 0x69) + prix));
    }
    encaisser(jeu, v, boutique, fiche, prix);
    poserOctet(jeu, v + 0x63, octet(jeu, fiche + 0x5C));
    poserOctet(jeu, v + 5, octet(jeu, v + 5) | 1);
    nourrirEtDesalterer(jeu, v, fiche);
    emporter(jeu, v, boutique, fiche);
    return gagne;
  }

  if (!(sorte & (NOURRIT | DESALTERE))) return 0;
  const faim = octetSigne(jeu, v + 0x50), soif = octetSigne(jeu, v + 0x51);
  if (!((faim < 9 && (sorte & NOURRIT)) || (soif < 9 && (sorte & DESALTERE)))) return 0;
  const apport = octetSigne(jeu, fiche + 0x56) + octetSigne(jeu, fiche + 0x57);
  const envie = diviser(motSigne(jeu, v + 0x54), 16) + diviser(motSigne(jeu, boutique + 0x14), 256)
    + apport * 32 - (faim + soif) * 32 + (mot(jeu, v + 0x6F) >> 3) - prix - exces(jeu, prix, cout);
  if (envie <= 0) return 0;

  const reserve = octetSigne(jeu, fiche + 0x67);
  const marchandise = MARCHANDISES + reserve * TAILLE_MARCHANDISE;
  if (reserve !== -1) {
    if (mot(jeu, marchandise + 4) === 0) return 0;
    if (octet(jeu, GESTION_DES_RESERVES) === 2) poserMot(jeu, marchandise + 4, mot(jeu, marchandise + 4) - 1);
  } else if (mot(jeu, fiche + 0x22) === CAFE && octet(jeu, fiche + 0x5F) > 3) {
    // Le programme calcule ici (dose − 3) × 16, dans un registre dont la moitié haute est celle du
    // pointeur de la fiche, puis l'oublie : le calcul ne sert que la pile.
    cadre.local(0x10, (((fiche & HAUT) | octet(jeu, fiche + 0x5F)) - 3) << 4);
    if (octet(jeu, v + 0x13) <= 0x20) poserOctet(jeu, v + 0x13, octet(jeu, v + 0x13) << 1);
  }

  cadre.localOctet(0x20, octet(jeu, fiche + 0x5E));
  doser(jeu, cadre, v, fiche);

  poserMot(jeu, boutique + 0x14, mot(jeu, boutique + 0x14) + 1);
  if (reserve !== -1) {
    ajouterAuMotLong(jeu, motLong(jeu, JOUEUR) + 0xA, prix);
    ajouterAuMotLong(jeu, motLong(jeu, COMPTES) + 0x366, prix);
    const coutDuMoment = mot(jeu, marchandise + 2);
    cadre.ebx = coutDuMoment;                     // le diviseur
    poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) - diviser(prixEnPourCent(prix, coutDuMoment) - 125, 4));
  } else {
    ajouterAuMotLong(jeu, motLong(jeu, JOUEUR) + 0xA, prix - cout);
    ajouterAuMotLong(jeu, motLong(jeu, COMPTES) + 0x366, prix - cout);
    cadre.ebx = diviser(prixEnPourCent(prix, cout) - 125, 4);   // ce que perd l'humeur
    poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) - cadre.ebx);
  }
  poserMot(jeu, v + 0x6F, mot(jeu, v + 0x6F) - prix);
  poserOctet(jeu, v + 0x63, octet(jeu, v + 0x63) | octet(jeu, fiche + 0x5C));
  poserOctet(jeu, v + 0xC7, (cadre.appeler(0x68DD8, HASARD) & 0xFFFF) % 10 + 2);
  poserOctet(jeu, v + 5, octet(jeu, v + 5) | 1);
  nourrirEtDesalterer(jeu, v, fiche);
  poserMot(jeu, v + 0x54, mot(jeu, v + 0x54) + apport);
  return 0;
}

// L'ingrédient dosé (fiche +0x5E) et sa dose (+0x5F) : voir payerSonAchat. Un tirage du hasard
// pour chacun des cinq ingrédients connus, aucun sinon ; chacun a son appel dans le programme,
// d'où les cinq adresses de retour.
const RETOURS_DU_DOSAGE = [0x68B44, 0x68B9C, 0x68BF4, 0x68C4C, 0x68CA1];

function doser(jeu, cadre, v, fiche) {
  const ingredient = octet(jeu, fiche + 0x5E);
  if (ingredient > 4) return;
  const dose = octet(jeu, fiche + 0x5F);
  const base = ingredient === 3 ? 1 : 2;
  cadre.ebx = (base - dose) << 5;
  const effet = cadre.ebx + 8 - (cadre.appeler(RETOURS_DU_DOSAGE[ingredient], HASARD) & 0xFFFF) % 16;
  const moitie = dose >> 1;
  switch (ingredient) {
    case 0:  // plus la dose est forte, moins il est content, et plus vite il aura soif
    case 3:  // de même, la dose neutre étant 1 au lieu de 2
      poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) + effet);
      poserOctet(jeu, v + 0x51, octetSigne(jeu, v + 0x51) - moitie);
      break;
    case 1:  // à l'inverse : plus la dose est forte, plus il est content, et moins vite il aura soif
      poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) - effet);
      poserOctet(jeu, v + 0x51, octetSigne(jeu, v + 0x51) + moitie);
      break;
    case 2:
    case 4:  // plus la dose est forte, moins il est content, et plus vite il aura faim
      poserMot(jeu, v + 0x54, motSigne(jeu, v + 0x54) + effet);
      poserOctet(jeu, v + 0x50, octetSigne(jeu, v + 0x50) - moitie);
      break;
  }
}

// --- Les attractions ----------------------------------------------------------------------------
//
// La file d'une attraction est une chaîne de visiteurs : l'attraction désigne le premier par son mot
// +1E, et chacun celui qui le suit par le sien. Qui fait la queue est arrêté (état 0xC) ; qui
// s'avance (0xA) s'arrête derrière le dernier, ou devant le kiosque d'entrée s'il est le premier
// (visiteurs-etats-a.js). Quand le premier monte (0x30B19), celui qui le suit est appelé (0x34) :
// il appelle à son tour le sien, puis s'avance ; l'appel remonte ainsi la file, un visiteur par
// passage. Un visiteur qui renonce à faire la queue (attraction fermée, ou plus de 6 000 pas
// d'attente, 0x24DFE) passe aussi par l'état 0x34.
//
// L'attraction, un objet du parc de type 4 : +16 mot, sa fiche dans le catalogue 0xCCED0 ; +1C mot,
// posé à 8 quand un visiteur monte (sens non établi) ; +1E mot, le premier de sa file (remis à 0
// quand il monte) ; +26 mot, sa capacité ; +2A mot, le compte de ceux qui ont rejoint la file
// (visiteurs-etats-a.js), remis à 0 quand un visiteur monte ; +2E mot, l'usure (retro-ingenierie.md
// § 6.3, la musique qui se désaccorde) ; +30 mot signé, le nombre de passagers à bord ; +3C mot, le
// nombre de visiteurs accueillis ; +47 mot, le premier passager, les suivants chaînés par leur propre
// mot +47.

// 0x24D4B — état 0x34, la file avance.
//
// Le visiteur transmet l'appel à celui qui le suit (+1E) : s'il fait la queue (état 0xC), celui-ci
// est appelé à son tour (0x34) ; en pause ou en train de montrer son humeur (0x1A, 0x3C), l'appel
// est mis de côté pour après (+BC) ; déjà appelé, rien. Dans tout autre état, 0x2DEF8 remet à zéro
// la demande de sortie de la boucle du parc (0xD6688). Puis le visiteur perd son suiveur et
// s'avance dans la file (0xA). Rend 1.
//
// Ce dernier cas n'a rien d'impossible : le lien +1E peut désigner un visiteur qui a déjà quitté la
// file — relevé dans simulation.json, un suiveur en promenade (8) ou sur l'attraction (0xE) cinq fois
// en 330 s, un suiveur qui fait la queue 229 fois. Qu'une demande de sortie posée juste avant soit
// alors perdue n'est pas établi.
//
// Anomalie, reproduite : quand le suiveur faisait la queue, c'est la silhouette du visiteur lui-même
// qui est remise, et non celle du suiveur comme dans 0x32142. Non vérifié : un suiveur en pause, en
// train de montrer son humeur, ou déjà appelé.
export function faireAvancerLaFile(jeu, v) {
  const cadre = new Cadre(jeu, 8);
  const suivant = objet(jeu, mot(jeu, v + 0x1E));
  cadre.local(8, suivant);
  if (suivant > tableDesObjets(jeu)) {
    if (octet(jeu, suivant + 0xC) === FAIT_LA_QUEUE) {
      poserOctet(jeu, suivant + 0xC, LA_FILE_AVANCE);
      poserMot(jeu, v + 0xA, silhouetteDeMarche(jeu, v));
    }
    const etat = octet(jeu, suivant + 0xC);
    if (etat === HUMEUR || etat === EN_PAUSE) poserOctet(jeu, suivant + 0xBC, LA_FILE_AVANCE);
    else if (etat !== LA_FILE_AVANCE) cadre.appeler(0x24DDF, EFFACER_LA_DEMANDE_DE_SORTIE);
  }
  poserMot(jeu, v + 0x1E, 0);
  poserOctet(jeu, v + 0xC, S_AVANCE_DANS_LA_FILE);
  cadre.local(4, 1);
  return 1;
}

// 0x32142 — (visiteur, attraction) : appeler un visiteur qui fait la queue.
//
// Si le visiteur (un numéro 0 donne l'adresse de la table elle-même, qui n'est pas un objet) fait la
// queue (0xC) — dans son état, son second état (+D) ou l'état mis de côté (+BC) —, il est appelé
// (0x34) et reprend sa silhouette de marche. Dans tous les cas, l'attraction n'a plus de premier
// dans sa file (+1E).
//
// Relevé dans simulation.json : 1 392 fois sans suiveur, 104 fois un suiveur qui fait la queue,
// 4 fois un suiveur qui s'avance encore (0xA, rien à faire). Non vérifié : l'appel reconnu par +D ou
// par +BC.
export function appelerLeSuivant(jeu, o, attraction) {
  new Cadre(jeu, 0);
  if ((o >>> 0) > tableDesObjets(jeu)) {
    for (const champ of [0xC, 0xD, 0xBC]) {
      if (octet(jeu, o + champ) === FAIT_LA_QUEUE) {
        poserOctet(jeu, o + champ, LA_FILE_AVANCE);
        poserMot(jeu, o + 0xA, silhouetteDeMarche(jeu, o));
        break;
      }
    }
  }
  poserMot(jeu, attraction + 0x1E, 0);
}

// 0x30B19 — (visiteur, attraction) : le visiteur monte dans l'attraction.
//
// Il le peut s'il fait la queue (0xC) ou entre dans une attraction sans file (0x4A, 0x272DE), et
// que l'attraction est bien celle qu'il vise (+16). Alors celui qui le suit est appelé, il entre dans
// la liste des passagers, en tête, marque le genre de l'attraction parmi ceux qu'il a essayés, et son
// octet +5A gagne 3 (voir montrerSonHumeur) ; l'attraction compte un visiteur de plus, et un passager
// de plus à bord, sauf pour les attractions dont la fiche a l'octet +0xB4 à 3 ; pleine, elle le
// signale (0x31ED3). Rend 1. Sinon, l'attraction n'a plus de premier dans sa file, et la fonction
// rend 0.
//
// Non vérifiés : la montée depuis l'état 0x4A, et le refus (toutes les montées relevées partaient de
// l'état 0xC).
//
// Défaut du jeu d'origine : tous les 256 pas, chaque visiteur fait une pause d'une trentaine de pas
// (0x1A, 0x2789A), même dans une file, et reprend ensuite la queue (l'état mis de côté, +BC). Si
// l'attraction le fait monter pendant ce temps, la montée échoue et elle oublie sa file (+1E) : à
// chaque retour en gare d'un train, une chance sur huit environ. Vu sur la partie « Jeu02 » de Fabien
// (retour 65 de docs/demandes.md). Corrigé par un réglage (corrigerLaFileEnPause, plus bas).
export function monterDansLAttraction(jeu, v, attraction) {
  const cadre = new Cadre(jeu, 8);
  const etat = octet(jeu, v + 0xC);
  if (!((etat === FAIT_LA_QUEUE || etat === ENTRE_SANS_FILE)
    && (numero(jeu, attraction) & 0xFFFF) === mot(jeu, v + 0x16))) {
    // Hors du jeu d'origine (reglages.js, corrigerLaFileEnPause) : le premier de la file, en pause
    // ou montrant son humeur, qui reprendra la queue (+BC), garde sa place ; l'attraction réessaie au
    // pas suivant. Le jeu d'origine oublie sa file : plus personne ne monte avant que ce visiteur
    // l'abandonne, au bout de 6 000 pas (0x24DFE).
    if (reglages.corrigerLaFileEnPause && (etat === EN_PAUSE || etat === HUMEUR)
      && octet(jeu, v + 0xBC) === FAIT_LA_QUEUE && (numero(jeu, attraction) & 0xFFFF) === mot(jeu, v + 0x16)) {
      cadre.local(4, 0);
      return 0;
    }
    poserMot(jeu, attraction + 0x1E, 0);
    cadre.local(4, 0);
    return 0;
  }
  cadre.ebx = numero(jeu, attraction);            // le programme y a gardé le numéro comparé
  cadre.appeler(0x30B71, APPELER_LE_SUIVANT, objet(jeu, mot(jeu, v + 0x1E)), attraction);
  poserMot(jeu, attraction + 0x2A, 0);
  poserOctet(jeu, v + 0xC, SUR_L_ATTRACTION);
  poserMot(jeu, v + 0x47, mot(jeu, attraction + 0x47));
  cadre.ebx = TAILLE_OBJET;                       // le diviseur des numéros
  poserMot(jeu, attraction + 0x47, numero(jeu, v));
  const fiche = GENRES_ATTRACTIONS + mot(jeu, attraction + 0x16);
  cadre.local(8, fiche);
  const bit = octet(jeu, fiche + 0xC1);
  poserOctet(jeu, v + 0x18 + (bit >> 3), octet(jeu, v + 0x18 + (bit >> 3)) | (1 << (bit & 7)));
  poserMot(jeu, v + 0x16, numero(jeu, attraction));
  poserOctet(jeu, v + 0x5A, octet(jeu, v + 0x5A) + 3);
  poserMot(jeu, attraction + 0x3C, mot(jeu, attraction + 0x3C) + 1);
  poserMot(jeu, attraction + 0x1C, 8);
  if (octet(jeu, fiche + 0xB4) !== 3) {
    poserMot(jeu, attraction + 0x30, mot(jeu, attraction + 0x30) + 1);
    if (motSigne(jeu, attraction + 0x30) >= mot(jeu, attraction + 0x26)) {
      cadre.appeler(0x30C41, L_ATTRACTION_EST_PLEINE, attraction);
    }
  }
  cadre.local(4, 1);
  return 1;
}

// 0x65D25 — (visiteur, attraction, wagon, voie, vitesse) : le visiteur est-il éjecté du wagon ?
//
// Appelée par les wagons des attractions à voie (0x42392) pour leur passager, avec l'octet +0x44 du
// morceau de voie où ils roulent (sa sorte : non établi) et leur vitesse. Une attraction usée (usure
// +2E d'au moins 0x12) éjecte un passager une fois sur 64 (le hasard n'est tiré que si elle est
// usée), sur les sortes de voie 1 à 4 et au-dessus d'une vitesse de 0x23. Le passager quitte alors
// la liste de l'attraction et le wagon, l'attraction compte un passager de moins, et l'accident
// suit son cours (0x66189, cause 1). Rend, dans l'octet bas de eax, 1 s'il est éjecté, 0 sinon.
//
// Le programme lit aussi l'objet que vise le visiteur, puis l'oublie : il ne sert que la pile.
//
// Relevé : douze éjections dans simulation.json (voies 3 et 4, vitesses de 40 à 94), une dans
// construction.json (voie 1).
export function ejecterDuWagon(jeu, v, attraction, wagon, voie, vitesse) {
  const cadre = new Cadre(jeu, 0xC);
  const ejecte = verifierLEjection(jeu, cadre, v, attraction, wagon, voie, vitesse);
  cadre.localOctet(4, ejecte);
  return ejecte;
}

// L'usure à partir de laquelle un passager peut être éjecté : 0x12 dans le jeu d'origine, quel que
// soit le genre, alors que la panne ne vient qu'au seuil de sa fiche (+0xA8 : 80 pour les montagnes
// russes, jusqu'à 120 après la recherche) et l'explosion au double. Les montagnes russes éjectent
// donc dès l'usure 18, bien avant que le mécanicien soit appelé (au-delà de 39, personnel.js) : le
// bogue 5 de docs/demandes.md. Hors du jeu d'origine, réglage « corriger les éjections » allumé
// (reglages.js), le seuil est celui de la fiche : c'est de là que l'attraction montre son usure (la
// fumée, 0x1D87A, et la musique désaccordée, 0x1B837). Les éjections deviennent le signe d'une attraction négligée, qu'un mécanicien
// appelé à 40 a eu le temps de réparer. Le hasard n'étant tiré qu'au-delà du seuil, la suite du jeu
// change dès qu'une attraction a une usure entre les deux seuils.
const USURE_D_EJECTION = 0x12;
function seuilDEjection(jeu, attraction) {
  if (!reglages.corrigerLesEjections) return USURE_D_EJECTION;
  return octet(jeu, GENRES_ATTRACTIONS + mot(jeu, attraction + 0x16) + 0xA8);
}

function verifierLEjection(jeu, cadre, v, attraction, wagon, voie, vitesse) {
  voie &= 0xFF;
  if (voie >= 5 || voie === 0) return 0;
  if (mot(jeu, attraction + 0x2E) < seuilDEjection(jeu, attraction)) return 0;
  if ((cadre.appeler(0x65D4C, HASARD) & 0x3F) !== 0x3F) return 0;
  if (s16(vitesse) <= 0x23) return 0;

  // Retirer le visiteur de la liste des passagers.
  let p = objet(jeu, mot(jeu, attraction + 0x47));
  if (p === v) {
    poserMot(jeu, attraction + 0x47, mot(jeu, v + 0x47));
  } else {
    for (; p > tableDesObjets(jeu); p = objet(jeu, mot(jeu, p + 0x47))) {
      if (objet(jeu, mot(jeu, p + 0x47)) === v) {
        poserMot(jeu, p + 0x47, mot(jeu, v + 0x47));
        break;
      }
    }
  }
  cadre.local(0xC, p);
  poserMot(jeu, wagon + 0x47, 0);
  poserMot(jeu, attraction + 0x30, mot(jeu, attraction + 0x30) - 1);
  cadre.local(8, objet(jeu, mot(jeu, v + 0x16)));
  cadre.appeler(0x65E28, ACCIDENT, 1, v, wagon, s16(vitesse));
  return 1;
}

// --- Le départ ----------------------------------------------------------------------------------

// 0x266D7 — état 0x1E, le visiteur va vers l'arrêt du bus, pour quitter le parc.
//
// Il marche, un pas par passage, jusqu'à ce que son décompte (+14) tombe à zéro : au milieu d'une
// case ou à son bord (le décompte est le temps de parcourir une demi-case, 128 / vitesse). Là, il
// peut s'arrêter pour exprimer ce qu'il ressent (0x2789A, qui le met en pause) : la fonction rend
// alors 1. Sinon il réarme son décompte — une vitesse nulle le fait valoir 1 (0x19ED3) — et cherche
// la file de l'arrêt (prendreLaFileDuDepart) :
//  - il y prend place : état 0x22, avec sa silhouette de marche, et la fonction rend 1 ;
//  - il n'a rien trouvé : il se tourne vers la case de [[0xD3814] + 0x2CA], l'arrêt, selon l'axe
//    où elle est le plus loin (à égalité, nord-sud) ;
//  - il a seulement dû se tourner : il garde sa nouvelle direction.
// Dans ces deux derniers cas, si la case suivante dans sa direction est sur le bord de la carte
// (colonne ou rangée 63) ou au-delà, il quitte le parc (0x28752) et la fonction rend 1. Sinon, 0.
//
// Non vérifiés : la pause pour exprimer une émotion, la vitesse nulle, le demi-tour vers le nord et
// la sortie par le bord de la carte (dans la démo, l'arrêt est au sud de ceux qui partent).
//
// Le cadre : [ebp − 4] et [ebp − 8] le pas ; [ebp − 0x18] le résultat ; [ebp − 0x1C] le décompte ;
// [ebp − 0x14] la réponse de la file ; [ebp − 0xC] et [ebp − 0x10] l'écart à l'arrêt ; [ebp − 0x20]
// la direction est-ouest, [ebp − 0x24] la direction nord-sud.
export function rentrerChezSoi(jeu, v) {
  const cadre = new Cadre(jeu, 0x24);
  const resultat = partir(jeu, cadre, v);
  cadre.local(0x18, resultat);
  return resultat;
}

function partir(jeu, cadre, v) {
  const edx = animerEtRelever(jeu, v, cadre);
  if (mot(jeu, v + 0x14) !== 0) {
    const [x, y, ebx] = pasEtSesRestes(jeu, v, edx, cadre.ebx);
    cadre.ebx = ebx;
    cadre.local(4, x);
    cadre.local(8, y);
    cadre.appeler(0x26774, DEPLACER, v, x & 0xFFFF, y & 0xFFFF);
  }
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (motSigne(jeu, v + 0x14) > 0) return 0;

  if ((cadre.appeler(0x26798, REFLECHIR, v, 0) & 0xFFFF) !== 0) return 1;
  const vitesse = octet(jeu, v + 0x13);
  let decompte;
  if (vitesse === 0) {
    decompte = s16(cadre.appeler(0x267BA, DIVISION_PAR_ZERO));
  } else {
    cadre.ebx = vitesse;                          // le diviseur
    decompte = diviser(mot(jeu, DEMI_CASE), vitesse);
  }
  cadre.local(0x1C, decompte);
  poserMot(jeu, v + 0x14, decompte);

  const file = cadre.appeler(0x267FB, PRENDRE_LA_FILE_DU_DEPART, v, ATTEND_LE_BUS, SOL_DE_L_ARRET,
    motSigne(jeu, DEMI_CASE));
  cadre.local(0x14, file);
  if ((file & 0xFFFF) === 1) {
    poserOctet(jeu, v + 0xC, ATTEND_LE_BUS);
    poserMot(jeu, v + 0xA, silhouetteDeMarche(jeu, v));
    return 1;
  }
  if ((file & 0xFFFF) === 0) {
    const arret = mot(jeu, motLong(jeu, COMPTES) + 0x2CA);
    cadre.ebx = TAILLE_CARTE;                     // le diviseur
    const dx = (arret % TAILLE_CARTE) - octet(jeu, v + 7);
    cadre.local(0xC, dx);
    const ecartX = cadre.appeler(0x2687F, VALEUR_ABSOLUE, s16(dx)) | 0;
    cadre.ebx = ecartX;
    const dy = (arret >> 6) - octet(jeu, v + 9);
    cadre.local(0x10, dy);
    const ecartY = cadre.appeler(0x268B1, VALEUR_ABSOLUE, s16(dy)) | 0;
    let direction;
    if (ecartX > ecartY) {
      direction = s16(dx) > 0 ? EST : OUEST;
      cadre.local(0x20, direction);
    } else {
      direction = s16(dy) > 0 ? SUD : NORD;
      cadre.local(0x24, direction);
    }
    poserOctet(jeu, v + 0x12, direction);
    poserMot(jeu, v + 0xA, silhouetteDeMarche(jeu, v));
  }

  const d = octet(jeu, v + 0x12);
  const colonne = (octet(jeu, v + 7) + octetSigne(jeu, DEPLACEMENTS + 2 * d)) & 0xFFFF;
  const rangee = (octet(jeu, v + 9) + octetSigne(jeu, DEPLACEMENTS + 2 * d + 1)) & 0xFFFF;
  if (colonne >= BORD || rangee >= BORD) {
    cadre.appeler(0x26973, QUITTER_LE_PARC, v);
    return 1;
  }
  return 0;
}

// Le rang d'une place dans la case, le long d'un axe : 0 ou 1 avec un pas d'une demi-case.
function rang(place, pas) { return diviser(place, pas); }

// 0x26BDE — (visiteur, état, sol, pas) : prendre place dans la file de l'arrêt du bus.
//
// Appelée par rentrerChezSoi avec l'état 0x22, le sol de l'arrêt (0x88) et l'écart entre deux
// visiteurs de la file, une demi-case (128). Rend 1 si le visiteur a pris place — il a alors la
// direction de la file, sa place dans la case est alignée sur l'écart, et son mot +28 reçoit
// l'écart —, −1 s'il a seulement dû se tourner, 0 s'il n'a rien trouvé.
//
//  1. Sur sa case, il cherche le dernier de la file : parmi les visiteurs dans l'état donné, celui
//     qui est le moins avancé dans sa direction (le rang le plus grand vers le nord ou l'ouest, le
//     plus petit vers l'est ou le sud). S'il y en a un, il se compare à lui le long de l'axe de la
//     file : si ce dernier n'est pas devant lui, il fait demi-tour (−1) ; s'il est juste devant, au
//     rang voisin, il se range derrière (1) ; plus loin devant, il prend sa direction et continue
//     (−1).
//  2. Sinon, il regarde les quatre cases voisines, dans l'ordre nord, est, sud, ouest. Si c'est
//     l'arrêt (le sol donné), et qu'il est au bord de sa case de ce côté, il s'y tourne et prend
//     place (1). Sinon, si un visiteur y fait la queue dans cette direction, à l'entrée de cette
//     case, et que lui est au bord de la sienne, il prend place derrière (1).
//
// Anomalies, reproduites : quand la case porte des partants dans les deux sens de l'axe, le
// « dernier » retenu est simplement le dernier trouvé ; l'état cherché sur les cases voisines est
// 0x22 écrit en dur, quel que soit l'état demandé (le seul appelant demande 0x22) ; et les bords
// testés ne sont pas symétriques (0x100 − écart d'un côté, 0xFF − écart de l'autre, selon les cas).
//
// Relevé : 211 appels dans simulation.json, 4 dans construction.json ; les trois réponses y sont.
// Dans la démo, la file de l'arrêt court d'est en ouest : non vérifiés, les files nord-sud, l'arrêt
// ou un partant au nord ou au sud, et le dernier « plus loin devant ».
//
// Le cadre : [ebp − 0x18] la cellule ; [ebp − 0x20] l'objet examiné ; octet [ebp − 0x24] sa
// direction ; [ebp − 0xC] son rang, puis celui du dernier, ou la direction de la case voisine ;
// [ebp − 0x10] le rang du visiteur ; [ebp − 0x14] et [ebp − 4] le plus grand et le plus petit
// rang ; [ebp − 0x1C] le dernier ; [ebp − 0x28] et [ebp − 0x2C] des copies de la direction voisine ;
// [ebp − 8] le résultat.
export function prendreLaFileDuDepart(jeu, v, etat, sol, pas) {
  const cadre = new Cadre(jeu, 0x2C);
  const resultat = chercherLaFile(jeu, cadre, v, etat, sol, s16(pas));
  cadre.local(8, resultat);
  return resultat;
}

function chercherLaFile(jeu, cadre, v, etat, sol, pas) {
  const demiPas = (pas / 2) | 0;
  const table = tableDesObjets(jeu);
  cadre.local(0x14, -1);
  cadre.local(4, 0x7F);
  const cellule = celluleDe(jeu, v);
  cadre.local(0x18, cellule);

  // 1. Le dernier de la file sur la case.
  let plusGrand = -1, plusPetit = 0x7F, dernier = 0;
  let o = objet(jeu, motSigne(jeu, cellule));
  for (; o > table; o = objet(jeu, motSigne(jeu, o + 2))) {
    if (octet(jeu, o + 0xC) !== (etat & 0xFFFF) || octet(jeu, o + 4) !== 2) continue;
    const direction = octet(jeu, o + 0x12);
    cadre.localOctet(0x24, direction);
    if (direction > OUEST) continue;
    const r = rang(octet(jeu, o + (direction & 1 ? 6 : 8)), pas);
    cadre.local(0xC, r);
    const versLeNordOuLOuest = direction === NORD || direction === OUEST;
    if (versLeNordOuLOuest ? s16(r) > s16(plusGrand) : s16(r) < s16(plusPetit)) {
      if (versLeNordOuLOuest) { plusGrand = r; cadre.local(0x14, r); } else { plusPetit = r; cadre.local(4, r); }
      dernier = o;
      cadre.local(0x1C, o);
    }
  }
  cadre.local(0x20, o);

  const versLeNordOuLOuest = s16(plusGrand) !== -1;
  if (versLeNordOuLOuest || s16(plusPetit) !== 0x7F) {
    const directionDuDernier = octet(jeu, dernier + 0x12);
    const place = (directionDuDernier & 1) ? 6 : 8;       // l'axe de la file : est-ouest ou nord-sud
    const rangDuDernier = rang(octet(jeu, dernier + place), pas);
    const sonRang = rang(octet(jeu, v + place), pas);
    cadre.local(0xC, rangDuDernier);
    cadre.local(0x10, sonRang);
    // Le dernier est devant le visiteur quand son rang est plus petit (file vers le nord ou
    // l'ouest) ou plus grand (vers l'est ou le sud) ; juste devant, au rang voisin.
    const devant = versLeNordOuLOuest ? s16(rangDuDernier) < s16(sonRang) : s16(rangDuDernier) > s16(sonRang);
    const justeDevant = versLeNordOuLOuest
      ? s16(rangDuDernier) + 1 === s16(sonRang) : s16(rangDuDernier) - 1 === s16(sonRang);
    if (!devant) {
      poserOctet(jeu, v + 0x12, octet(jeu, DIRECTION_OPPOSEE + 2 * directionDuDernier));
    } else if (justeDevant) {
      poserOctet(jeu, v + place, Math.imul(s16(sonRang), pas) + demiPas);
      poserOctet(jeu, v + 0x12, directionDuDernier);
      poserMot(jeu, v + 0x28, pas);
      return 1;
    } else {
      poserOctet(jeu, v + 0x12, directionDuDernier);
    }
    poserMot(jeu, v + 0xA, silhouetteDeMarche(jeu, v));
    return -1;
  }

  // 2. Les cases voisines.
  for (let k = 0; k < 4; k++) {
    cadre.local(0xC, k);
    const voisine = cellule + motSigne(jeu, VOISINES + 2 * k) * 4;
    if (octet(jeu, voisine + 2) === (sol & 0xFFFF)) {
      // L'entrée elle-même : il faut être au bord de la case, de son côté.
      cadre.local(0x28, k);
      switch (k) {
        case NORD: if (octet(jeu, v + 8) > pas) continue; poserOctet(jeu, v + 8, demiPas); break;
        case EST: if (octet(jeu, v + 6) < 0x100 - pas) continue; poserOctet(jeu, v + 6, 0x100 - demiPas); break;
        case SUD: if (octet(jeu, v + 8) < 0x100 - pas) continue; poserOctet(jeu, v + 8, 0x100 - demiPas); break;
        case OUEST: if (octet(jeu, v + 6) > pas) continue; poserOctet(jeu, v + 6, demiPas); break;
      }
      poserOctet(jeu, v + 0x12, k);
      poserMot(jeu, v + 0x28, pas);
      return 1;
    }
    // Un partant sur la case voisine, qui fait la queue dans cette direction, à l'entrée de sa case.
    let p = objet(jeu, motSigne(jeu, voisine));
    for (; p > table; p = objet(jeu, motSigne(jeu, p + 2))) {
      cadre.local(0x20, p);
      if (octet(jeu, p + 0xC) !== ATTEND_LE_BUS || octet(jeu, p + 4) !== 2) continue;
      if (octet(jeu, p + 0x12) !== k) continue;
      cadre.local(0x2C, k);
      if (!rangerDerriere(jeu, v, p, k, pas, demiPas)) continue;
      poserOctet(jeu, v + 0x12, octet(jeu, p + 0x12));
      poserMot(jeu, v + 0x28, pas);
      return 1;
    }
    cadre.local(0x20, p);
  }
  cadre.local(0xC, 4);
  return 0;
}

// Le visiteur peut-il se ranger derrière le partant `p`, qui fait la queue sur la case voisine dans
// la direction k ? Il faut que `p` soit encore à l'entrée de sa case et le visiteur au bord de la
// sienne ; il se cale alors contre ce bord.
function rangerDerriere(jeu, v, p, k, pas, demiPas) {
  switch (k) {
    case NORD:
      if (octet(jeu, p + 8) < 0x100 - pas || octet(jeu, v + 8) > pas) return false;
      poserOctet(jeu, v + 8, demiPas);
      return true;
    case EST:
      if (octet(jeu, p + 6) > pas || octet(jeu, v + 6) < 0xFF - pas) return false;
      poserOctet(jeu, v + 6, 0xFF - demiPas);
      return true;
    case SUD:
      if (octet(jeu, p + 8) > pas || octet(jeu, v + 8) < 0xFF - pas) return false;
      poserOctet(jeu, v + 8, 0xFF - demiPas);
      return true;
    case OUEST:
      if (octet(jeu, p + 6) < 0x100 - pas || octet(jeu, v + 6) > pas) return false;
      poserOctet(jeu, v + 6, demiPas);
      return true;
    default:
      return true;
  }
}

// 0x272DE — état 0x4A, entrer dans une attraction sans file.
//
// Le visiteur marche, un pas par passage, jusqu'à ce que son décompte (+14) tombe à zéro ; il n'a
// alors plus personne derrière lui (+1E), et monte dans l'attraction qu'il vise (+16, 0x30B19). Rend 1
// quand il est monté (ou refusé, 0x30B19 le laissant dans son état), 0 sinon. Même allure que
// l'entrée aux toilettes (0x275F3) : le cadre (x en [ebp-4], y en [ebp-8], le résultat en [ebp-0xC])
// et ses restes sont les mêmes.
//
// Exercé par circuit-auto (208 appels) : les visiteurs qui gagnent une voiture du RACE CAR RIDE.
const MONTER_DANS_L_ATTRACTION = 0x30B19;
export function entrerSansFile(jeu, v) {
  const cadre = new Cadre(jeu, 0xC);
  const [x, y] = pasEtSesRestes(jeu, v, animerEtRelever(jeu, v, cadre), null);
  cadre.local(4, x);
  cadre.local(8, y);
  cadre.appeler(0x27371, DEPLACER, v, x & 0xFFFF, y & 0xFFFF);
  poserMot(jeu, v + 0x14, mot(jeu, v + 0x14) - 1);
  if (motSigne(jeu, v + 0x14) > 0) { cadre.local(0xC, 0); return 0; }

  poserMot(jeu, v + 0x1E, 0);
  cadre.appeler(0x273AD, MONTER_DANS_L_ATTRACTION, v, (tableDesObjets(jeu) + mot(jeu, v + 0x16) * TAILLE_OBJET) >>> 0);
  cadre.local(0xC, 1);
  return 1;
}

// ================================================================================================
// Toutes ces fonctions écrivent dans les objets du parc (le tas), dans les fiches des joueurs et les
// relevés du parc : la comparaison appel par appel doit restaurer et comparer toute la mémoire.
const entiere = 'entiere';

export const reecritures = [
  { adresse: 0x273C8, nom: 'sArreterUnInstant', fn: sArreterUnInstant, arguments: 1, retour: true, memoire: entiere },
  { adresse: 0x27494, nom: 'montrerSonHumeur', fn: montrerSonHumeur, arguments: 1, retour: true, memoire: entiere },
  { adresse: 0x25339, nom: 'jouerUneAnimation', fn: jouerUneAnimation, arguments: 1, memoire: entiere },
  { adresse: 0x275F3, nom: 'entrerAuxToilettes', fn: entrerAuxToilettes, arguments: 1, retour: true, memoire: entiere },
  { adresse: 0x25FE7, nom: 'attendreSonTour', fn: attendreSonTour, arguments: 1, memoire: entiere },
  { adresse: 0x260F4, nom: 'etreServi', fn: etreServi, arguments: 1, memoire: entiere },
  // Rend un octet (al) ; le reste de eax n'est pas significatif et n'est pas comparé.
  { adresse: 0x68616, nom: 'payerSonAchat', fn: payerSonAchat, arguments: 2, memoire: entiere },
  { adresse: 0x24D4B, nom: 'faireAvancerLaFile', fn: faireAvancerLaFile, arguments: 1, retour: true, memoire: entiere },
  { adresse: 0x32142, nom: 'appelerLeSuivant', fn: appelerLeSuivant, arguments: 2, memoire: entiere },
  { adresse: 0x30B19, nom: 'monterDansLAttraction', fn: monterDansLAttraction, arguments: 2, retour: true, memoire: entiere },
  // Rend un octet (al), comme payerSonAchat.
  { adresse: 0x65D25, nom: 'ejecterDuWagon', fn: ejecterDuWagon, arguments: 5, memoire: entiere },
  { adresse: 0x266D7, nom: 'rentrerChezSoi', fn: rentrerChezSoi, arguments: 1, retour: true, memoire: entiere },
  { adresse: 0x26BDE, nom: 'prendreLaFileDuDepart', fn: prendreLaFileDuDepart, arguments: 4, retour: true, memoire: entiere },
  { adresse: 0x272DE, nom: 'entrerSansFile', fn: entrerSansFile, arguments: 1, retour: true, memoire: entiere },
];
