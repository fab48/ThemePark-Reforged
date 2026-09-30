// Les entrées de l'écran du parc : zones sous le pointeur, survol, clics.
//
// Réécriture lisible des fonctions 0x145FB, 0x1A27E, 0x149A4, 0x175B5, 0x1803C, 0x20E37, 0x28943
// et 0x18BC0 du jeu d'origine. Chaque constante vient du programme de 1994 ; `moteur/node/comparer.mjs`
// et `moteur/node/verifier.mjs` prouvent que le comportement est identique (voir en fin de fichier).
//
// --- La table des zones ------------------------------------------------------------------------
//
// L'écran du parc est découpé en zones rectangulaires, décrites par une table en 0xB93C3, 12 octets
// par zone, terminée par une abscisse négative :
//   +0, +2, +4, +6  mots signés : x0, y0, x1, y1 ; le pointeur est dans la zone si x0 <= x < x1 et
//                   y0 <= y < y1 (coordonnées du pointeur : 0–639 × 0–399 en basse résolution,
//                   0–639 × 0–479 en haute) ;
//   +8, +9          octets : la première et la dernière image de l'animation du bouton quand on le
//                   presse (0x15FBD les recopie dans 0xD779F, que 0x4DE1A fait avancer) ;
//   +10             octet : les indicateurs, qui disent ce que la zone fait de la souris ;
//   +11             octet : toujours 0.
// Les ordonnées des zones du bas sont celles du programme une fois en jeu (relevées pendant les
// scénarios) : la barre d'outils occupe les 40 dernières lignes, 360–399 ou 440–479.
//
//   zone  rectangle (basse rés.)   ind.  survol (0x149A4)
//   0     0,0 – 640,2              0x19  bord haut : défilement, direction 0
//   1     638,0 – 642,400          0x19  bord droit : direction 1
//   2     0,398 – 640,402          0x19  bord bas : direction 2
//   3     0,0 – 2,400              0x19  bord gauche : direction 3
//   4     0,360 – 48,400           0x07  bouton des chemins                  → texte 7
//   5     48,360 – 96,400          0x07  bouton des barrières (files)        → texte 8
//   6     96,360 – 144,400         0x07  bouton des attractions              → texte 9
//   7     144,360 – 192,400        0x07  bouton des boutiques                → texte 0xA
//   8     192,360 – 240,400        0x07  bouton des arbres, murs et lacs     → texte 0xB
//   9     240,360 – 288,400        0x07  bouton du personnel                 → texte 0xC
//   10    288,360 – 336,400        0x07  bouton de la carte du parc          → texte 0xD
//   11    336,360 – 384,400        0x07  bouton du mode question             → texte 0xE
//   12    384,360 – 432,400        0x07  les barres des visiteurs et du bus  → texte 0xF
//   13    432,360 – 480,400        0x07  l'argent                            → texte 0x10
//   14    480,360 – 560,400        0     (panneau, sans effet ; 0x1A27E seule)
//   15    559,360 – 640,400        0     (panneau, sans effet ; 0x1A27E seule)
//   16    534,360 – 558,388        0x07  remplissage d'une attraction        → texte 0x11
//   17    508,360 – 532,388        0x07  durée d'un tour                     → texte 0x12
//   18    482,360 – 506,388        0x07  l'objet choisi (0xD6678)            → texte 0x13
//   19    560,360 – 584,388        0x07  sécurité, ou mécanicien             → texte 0x17
//   20    586,360 – 610,388        0x07  ouvrir/fermer, ou déplacer          → texte 0x19
//   21    612,360 – 638,388        0x07  vitesse d'une attraction            → texte 0x1B
//   22–28 458..640, 0 – 26         0x03  sept icônes du haut à droite : pas de texte
//   29    0,16 – 638,358           0x2F  la vue du parc (358 : 438 en haute résolution)
//   30    2,2 – 636,16             0x06  la barre des messages : pas de survol
//
// Au clic gauche (0x15FBD, transcrite), d'après son code : 4 et 5 donnent les outils des chemins et
// des barrières, 6 à 9 ouvrent les menus des attractions, des boutiques, des décors et du personnel,
// 10 la carte du parc (écran 0x12), 11 le mode question (outil 8) ; 16, 17 et 21 règlent le
// remplissage, la durée d'un tour et la vitesse de l'attraction choisie ; 22 ouvre la fiche de la
// première attraction ou boutique marquée (bit 1 de ses indicateurs de catalogue, rôle non établi) ;
// 23 à 26 amènent la vue sur l'employé suivant d'un métier (codes 2, 8, 0x34, 0x16 de son catalogue ;
// les textes 0x22 à 0x25 nomment l'artiste, le nettoyeur, le mécanicien et le gardien, dans cet
// ordre vraisemblablement : non établi) ; 27 et 28 ne font rien de visible.
//
// Les textes (table [0xD7BC8], relevés en jeu dans la version française) : 7 « LE BOUTON GAUCHE
// PERMET DE PLACER DES CHEMINS… », 0xA « … VOIR LES BOUTIQUES A VENDRE… », 0xD « … ACTIVE LA CARTE
// DU PARC », 0x10 « INDIQUE L'ARGENT DONT VOUS DISPOSEZ (%d)… », etc. Pour 0x13, 0x17 et 0x19, la
// barre des messages (0x5CBDB) choisit le texte d'après l'objet choisi 0xD6678 : 0x13 à 0x16 selon
// que c'est une attraction, une personne, une boutique ou un employé ; 0x17 ou 0x18 (sécurité, ou le
// mécanicien) ; 0x19 ou 0x1A (ouvrir ou fermer l'attraction, ou déplacer l'employé).
//
// Les indicateurs, dans l'ordre où 0x145FB les examine pour chaque zone qui contient le pointeur :
//
//   ind.   condition                                          appel
//   0x01   survol, sauf si l'octet 0xB14C6 est posé           0x149A4
//   0x20   double-clic (mot 0xDE5A0), sauf 0xB14C6            0x1803C, remet 0xDE5A0 à 0
//   0x02   appui du bouton gauche (0xDE5A6), sauf 0xB14C6     0x15FBD, remet 0xDE5A6 à 0
//   0x04   appui du bouton droit (0xDE5A4), sauf 0xB14C6      0x1788D, remet 0xDE5A4 à 0
//   0x08   bouton gauche maintenu (0xDE5AC)                   0x175B5, remet 0xDE5A6 à 0
//   0x10   bouton droit maintenu (0xDE5AA)                    0x18003, remet 0xDE5A4 à 0
//
// Avant les indicateurs, chaque zone qui contient le pointeur passe par 0x1A27E. La première action
// déclenchée (0x20 à 0x10) met fin au parcours ; le survol, non. Le double-clic : le gestionnaire de
// souris 0x7D7E2 pose 0xDE5A0 quand le bouton gauche est pressé alors que le compte à rebours
// 0xDE59E, armé au clic précédent avec 0xBECB0 (10), n'est pas épuisé.
//
// --- Les outils ----------------------------------------------------------------------------------
//
// Le mot 0xD6670 est l'outil en main, que choisissent les boutons de la barre et les menus. Dans la
// vue du parc, le survol (0x149A4) en montre l'effet sur la case sous le pointeur, le bouton gauche
// maintenu (0x175B5) en poste la pose pour les outils qu'on fait glisser. D'après les catalogues qui
// les désignent, les textes qu'ils affichent et le clic gauche (0x15FBD, transcrite) qui les donne
// (« non établi » pour le reste) :
//
//   1   les murs (catalogue 0xCCA92, fiches de 0x38 octets dont le mot +8 est l'outil)
//   2   les chemins (catalogue 0xD37DC, fiches de 11 octets ; bouton 4)
//   3   les barrières des files (catalogue 0xD43E8 ; bouton 5)
//   4   la rivière                 5   les attractions (catalogue 0xCCED0, fiche [0xD665A])
//   6   les boutiques (catalogue 0xD3C62, fiche [0xD664A])           7   les arbres et décors (0xCCA92)
//   8   le mode question (bouton 11)                                 9   le personnel (0xD35E2, [0xD6644])
//   10  les rails d'une attraction
//   11  l'entrée de l'attraction qu'on vient de poser, 17 sa sortie (dans construction.json, l'outil
//       passe de 5 à 11 puis à 17 à chaque clic dans le parc)
//   12  non établi (0x416EA ; fiche de 0xCCA92 dont l'objet vaut 184)
//   13  non établi (0x2B576 ; fiche de 0xD37DC)
//   14  non établi : une flèche tournée vers l'objet [[0xD3814] + 0x2C8]
//   15  les panneaux : objets du parc de type 0x18 (fiches de 0xCCA92, outil 15)
//   16  non établi (0x29686)                                         18  un looping
//   19  l'employé qu'on déplace (bouton 20 quand l'objet choisi 0xD6678 est un employé, texte 0x1A),
//       porté sous le pointeur
//   21  le mécanicien à envoyer (bouton 19, texte 0x18) : le survol n'en montre rien
//   22  l'entrée du parc (0x18BC0) ; ce qui choisit cet outil, non établi       26  comme 5
//
// --- Les variables touchées ----------------------------------------------------------------------
//
//   0xB14C2  mot : 4 quand le pointeur est sur la vue du parc (0x145FB le remet à 0 à chaque image) ;
//            le gestionnaire de souris ne projette l'écart sur les axes de la carte, pendant le
//            tracé d'un chemin, que dans ce cas (retro-ingenierie.md § 6.7)
//   0xB14B1  octet : un bord de l'écran a été survolé pendant l'image
//   0xB14E9  mot long : l'échéance du défilement au bord (carte.js)
//   0xD661E  mot : le texte à afficher dans la barre des messages ; 0x5CBDB l'affiche et le remet à 0
//   0xD6662, 0xD666A  mots : la colonne et la rangée de la case sous le pointeur, relatives à la caméra
//   0xD6660, 0xD6668  mots : le coin haut gauche de cette case à l'écran
//   0xD6676  mot : cette case, rangée × 64 + colonne

// --- Accès à la mémoire --------------------------------------------------------------------------
import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';

const s16 = (v) => (v << 16) >> 16;
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const adresse = (jeu, a) => jeu.dv.getUint32(a, true);
const ecrireMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);

// Division entière du processeur (idiv) : tronquée vers zéro ; un diviseur nul lève une exception,
// comme sur la machine.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

// --- La table des zones --------------------------------------------------------------------------
const ZONES = 0xB93C3;
const TAILLE_ZONE = 12;
const INDICATEURS = 10;              // l'octet des indicateurs, dans une zone
const SURVOL = 0x01, APPUI_GAUCHE = 0x02, APPUI_DROIT = 0x04;
const GAUCHE_MAINTENU = 0x08, DROIT_MAINTENU = 0x10, DOUBLE_CLIC = 0x20;
const VUE_DU_PARC = 0x1D;            // la zone de la vue du parc
const BORD_GAUCHE = 3;               // les zones 0 à 3 sont les bords, numérotés comme les directions

// --- La souris (docs/retro-ingenierie.md § 6.7) --------------------------------------------------
const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;  // mots signés
const APPUI_DROIT_EN_ATTENTE = 0xDE5A4;        // mot : passe à 1 à l'appui, remis à 0 par qui le traite
const APPUI_GAUCHE_EN_ATTENTE = 0xDE5A6;
const DROIT_ENFONCE = 0xDE5AA;                 // mot : 1 tant que le bouton est enfoncé
const GAUCHE_ENFONCE = 0xDE5AC;
const DOUBLE_CLIC_EN_ATTENTE = 0xDE5A0;        // mot : posé par 0x7D7E2, remis à 0 à chaque image

// --- L'état de l'interface -----------------------------------------------------------------------
const POINTEUR_SUR_LE_PARC = 0xB14C2;  // mot : 4 si le pointeur est sur la vue du parc, sinon 0
const BORD_SURVOLE = 0xB14B1;          // octet
const ECHEANCE_DEFILEMENT = 0xB14E9;   // mot long : -1 = aucune (carte.js, defilerAuBord)
// L'octet 0xB14C6 suspend le survol, le double-clic et les appuis. Seule écriture du programme : 1,
// par le cas 3 de 0x50CCD (appelée par adresse, depuis une table), qui appelle ensuite 0x4FD2D ; rien
// ne le remet à 0. Rôle non établi ; nul dans les cinq scénarios.
const ENTREES_SUSPENDUES = 0xB14C6;
// Trois conditions qui suspendent tout le traitement ; leur rôle n'est pas établi. Dans les cinq
// scénarios, 0xB14BD et 0xB14D2 valent toujours -1 et 0xD779C, 0.
const ATTENTE_1 = 0xB14BD, ATTENTE_2 = 0xB14D2;  // mots signés : -1 = rien en cours
const ATTENTE_3 = 0xD779C;                       // octet
// L'octet 0xD7798 vaut 2 en jeu (posé par 0x12452 à l'entrée dans le parc). À 0, la table des zones
// est ignorée et l'écran entier est la vue du parc ; la boucle du parc (0x11C45) et le clavier
// (0x13BF3) ne redessinent alors pas la barre d'outils (0x50651, 0x4DE1A) : vraisemblablement la
// barre masquée. Rôle exact non établi ; aucun scénario n'y passe.
const BARRE_D_OUTILS = 0xD7798;
const IMAGE_DU_BOUTON = 0xD779F;       // octet : l'image courante de l'animation d'un bouton
const INFOBULLE = 0xD661E;             // mot : le texte de la barre des messages
const ECRAN_COURANT = 0xD6652;         // mot : 0 = la vue du parc

// --- La vue et la carte ----------------------------------------------------------------------------
const ORIGINE_X = 0xD6624;             // mot signé : l'origine du dessin en pixels
const LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;  // mots : 48×32 ou 24×16
const CAMERA_COLONNE = 0xD667A, CAMERA_RANGEE = 0xD6666; // mots signés
const REDESSINER_CARTE = 0xD666E;      // mot
const COLONNE_VISEE = 0xD6662, RANGEE_VISEE = 0xD666A;   // relatives à la caméra
const CASE_X = 0xD6660, CASE_Y = 0xD6668;                // le coin haut gauche de la case à l'écran
const CASE_VISEE = 0xD6676;            // mot : rangée × 64 + colonne
const TAILLE_CARTE = 64;
const MODE_AFFICHAGE = 0xDE5F6;        // mot : 1 = 320x200, 8 = 640x480

// La carte : 64 × 64 cellules de 4 octets, [0xD3B08] ; +0 mot, le premier objet posé sur la case
// (0 = rien, négatif = un décor fixe) ; +2 octet, l'image du sol ; +3 octet, des drapeaux (le bit 3
// posé par l'entrée et la clôture du parc, 0x18BC0 ; le bit 5 lu par 0x1803C ; rôles non établis).
const CARTE = 0xD3B08;
// Les images de sol : 4 octets chacune en 0xB44D9 ; +0 mot, les drapeaux (2 une allée, 8 une file
// d'attente ; les autres, non établis) ; +3 octet, un numéro de forme (voir simulation-outils.js).
const SOLS = 0xB44D9;
const FORMES_DES_SOLS = 0xB44DC;
const IMAGES_DE_SOL = 0xD3B90;         // pointeur : 6 octets par image (pixels, largeur, hauteur)
// Les objets du parc : 200 octets chacun, numérotés à partir de 1, de [0xD3B10] + 200 à [0xD3B78].
const OBJETS = 0xD3B10, FIN_DES_OBJETS = 0xD3B78;
const TAILLE_OBJET = 200;
// Les objets graphiques (objets.js) : [0xD3B80] 8 octets, [0xD3B7C] morceaux de 10 octets,
// [0xD3BB8] images ; [0xD3B38] donne l'objet graphique d'un élément.
const OBJETS_GRAPHIQUES = 0xD3B80, MORCEAUX = 0xD3B7C, IMAGES = 0xD3BB8;
const OBJETS_DES_ELEMENTS = 0xD3B38;
const ELEMENTS_DES_DECORS = 0xB44C1;   // mot par décor : son élément
const DRAPEAUX_TRACEUR = 0xBECBC;      // mot : drapeaux du traceur pour la prochaine image

// Les joueurs : [0xD3814] pointe les comptes du parc du joueur courant (0xD443C + joueur × 0x6C2).
const COMPTES = 0xD3814;
const JOUEUR_COURANT = 0xD665C;        // mot
const PAS_DE_SIMULATION = 0xD3AFC;     // mot long non signé

// Les catalogues de ce qu'on construit (voir l'en-tête) :
const CONSTRUCTIBLES = 0xCCA92;        // fiches de 0x38 octets : +0 mot non nul, +4 mot l'objet, +8 mot l'outil
const TAILLE_CONSTRUCTIBLE = 0x38;
const FICHE_CONSTRUCTIBLE = 0xD6646;   // mot : la fiche en main
const ATTRACTIONS = 0xCCED0;           // fiches de 200 octets (objets.js)
const FICHE_ATTRACTION = 0xD665A;      // mot
const BOUTIQUES = 0xD3C62;             // fiches de 0x6B octets (simulation-outils.js)
const FICHE_BOUTIQUE = 0xD664A;        // mot
const EMPLOYES = 0xD35E2;              // fiches de 0x36 octets
const FICHE_EMPLOYE = 0xD6644;         // mot
const CHEMINS = 0xD37DC;               // fiches de 11 octets : +0 mot non nul, +4 mot, +8 mot l'outil
const FICHE_CHEMIN = 0xD6648;          // mot
const BARRIERES = 0xD43E8;             // fiches de 7 octets : +0 mot non nul, +2 mot l'image de sol
const FICHE_BARRIERE = 0xD664E;        // mot
const OUTIL = 0xD6670;                 // mot : l'outil en main
const OBJET_CHOISI = 0xD6678;          // mot : l'objet du parc choisi (l'employé déplacé, outil 19)

// Les demandes de pose, une par joueur, 6 octets : +0 octet la sorte, +1 mot la case, +3 mot un
// paramètre. Elles s'écrivent directement dans la case du joueur de la file des événements
// (0xD441E, type en +1 : [0xD441F + 6 × joueur]), que 0x2CCF8 applique en fin d'image ; la copie
// qu'elle garde de l'image précédente ([0xD4401 + 6 × joueur]) dit la demande déjà faite.
const DEMANDE_PRECEDENTE = 0xD4401;
const NOUVELLE_DEMANDE = 0xD441F;

// --- Les fonctions appelées ----------------------------------------------------------------------
const SURVOLER_ZONE = 0x149A4;
const RENDRE_TOUT_L_ECRAN = 0x1A27E;
const DOUBLE_CLIQUER = 0x1803C;
const CLIC_GAUCHE = 0x15FBD;           // l'action du bouton gauche (transcrite)
const CLIC_DROIT = 0x1788D;            // l'action du bouton droit (transcrite)
const GAUCHE_MAINTENU_SUR = 0x175B5;
const DROIT_MAINTENU_SUR = 0x18003;    // carte.js, defilerBoutonDroit
const RECADRER_CAMERA = 0x184DF;       // carte.js
const DEFILER = 0x183EC;               // carte.js, defilerCarte
const DEFILER_AU_BORD = 0x47598;       // carte.js, defilerAuBord
const ANNULER_LA_CASE_MARQUEE = 0x4395B;  // voir traiterLaCaseMarquee
const PLAGE_DU_POINTEUR = 0x11303;     // (x min, x max, y min, y max) : fonctions 7 et 8 de l'int 33h
const DEFILER_PENDANT_LE_TRACE = 0x47268;  // poses.js, defilerPendantLeTrace
const TRACER_IMAGE = 0x5EC9C;          // (x, y, image) — basse résolution
const TRACER_IMAGE_MARQUEE = 0x55BD4;  // (x, y, image) — haute résolution, marque les blocs touchés
const DESSINER_OBJET = 0x209B5;        // (objet graphique, x, y)
const DESSINER_MORCEAUX = 0x20BEB;     // (objet graphique, premier, nombre, x, y)
const DESSINER_CASE = 0x1C22A;         // (contenu de la case, x, y)
const DESSINER_OBJET_SUSPENDU = 0x20E37;
const POINT_BASSE_RESOLUTION = 0x80C00;  // (x, y, couleur), en coordonnées 640x400
const POINT_HAUTE_RESOLUTION = 0x80C40;  // (x, y, couleur)
const MARQUER_ZONE_SALE = 0x54D38;     // (x, y, largeur, hauteur)
const VALEUR_ABSOLUE = 0x80BF2;
const HASARD = 0x18B92;
const ALLEE_SUR_CASE = 0x28943;
const POSER_L_ENTREE = 0x18BC0;

const BLANC = 0xF;                     // la couleur des quatre points du curseur de case

// =================================================================================================
// 0x145FB — les entrées de l'écran du parc, à chaque image.
//
// Appelée par la boucle du parc (0x11C45) et par 0x3B011. Parcourt les zones qui contiennent le
// pointeur et déclenche, pour chacune, 0x1A27E, le survol, puis la première action dont la condition
// est remplie (voir l'en-tête). À la fin, le double-clic est oublié, et l'échéance du défilement au
// bord remise à -1 si aucun bord n'a été survolé : quitter le bord, ne serait-ce qu'une image, fait
// repartir le délai.
export function traiterLesEntreesDuParc(jeu) {
  const dv = jeu.dv, m8 = jeu.m8;
  ecrireMot(jeu, POINTEUR_SUR_LE_PARC, 0);
  m8[BORD_SURVOLE] = 0;

  const suspendu = motSigne(jeu, ATTENTE_1) !== -1 || motSigne(jeu, ATTENTE_2) !== -1 || m8[ATTENTE_3] !== 0;
  if (!suspendu) {
    traiterLaCaseMarquee(jeu);
    if (m8[BARRE_D_OUTILS] !== 0) parcourirLesZones(jeu);
    else sansBarreDOutils(jeu);
  }

  ecrireMot(jeu, DOUBLE_CLIC_EN_ATTENTE, 0);
  if (m8[BORD_SURVOLE] === 0) dv.setInt32(ECHEANCE_DEFILEMENT, -1, true);
}

// Le mot +0x5CA des comptes du parc, positif, désigne une case : 0x4395B est alors appelée, sauf si
// le pointeur est sur cette case, où elle ne l'est qu'aux images dont le compte des pas de
// simulation, modulo 11, vaut 5. 0x4395B change le signe de l'octet +0x5CC, appelle 0x2A2F1 — qui
// élève ou abaisse les rails d'une attraction (texte 0x1D) — sur la cellule de la case avec cet
// octet, puis passe le mot en négatif, ce qui la rend inactive : vraisemblablement une hausse ou une
// baisse des rails annulée quand le pointeur quitte la case. Aucune écriture d'une valeur positive
// n'a été trouvée dans le programme : rôle non établi ; aucun scénario n'y passe.
function traiterLaCaseMarquee(jeu) {
  const marquee = motSigne(jeu, adresse(jeu, COMPTES) + 0x5CA);
  if (marquee <= 0) return;
  if (marquee !== mot(jeu, CASE_VISEE) || adresse(jeu, PAS_DE_SIMULATION) % 11 === 5) {
    jeu.appeler(ANNULER_LA_CASE_MARQUEE);
  }
}

// Le pointeur est-il dans la zone ? Comparaisons de mots signés, bornes basses comprises.
function pointeurDans(jeu, z) {
  const a = ZONES + z * TAILLE_ZONE;
  const x = motSigne(jeu, SOURIS_X), y = motSigne(jeu, SOURIS_Y);
  return x >= motSigne(jeu, a) && x < motSigne(jeu, a + 4) && y >= motSigne(jeu, a + 2) && y < motSigne(jeu, a + 6);
}

// Les indicateurs sont relus à chaque test, comme dans l'original.
const indicateurs = (jeu, z) => jeu.m8[ZONES + z * TAILLE_ZONE + INDICATEURS];

function parcourirLesZones(jeu) {
  const m8 = jeu.m8;
  for (let z = 0; motSigne(jeu, ZONES + z * TAILLE_ZONE) >= 0; z = (z + 1) & 0xFFFF) {
    if (!pointeurDans(jeu, z)) continue;
    jeu.appeler(RENDRE_TOUT_L_ECRAN, z);
    if ((indicateurs(jeu, z) & SURVOL) && m8[ENTREES_SUSPENDUES] === 0) jeu.appeler(SURVOLER_ZONE, z);

    if ((indicateurs(jeu, z) & DOUBLE_CLIC) && mot(jeu, DOUBLE_CLIC_EN_ATTENTE) !== 0 && m8[ENTREES_SUSPENDUES] === 0) {
      jeu.appeler(DOUBLE_CLIQUER, z);
      ecrireMot(jeu, DOUBLE_CLIC_EN_ATTENTE, 0);
      return;
    }
    if ((indicateurs(jeu, z) & APPUI_GAUCHE) && mot(jeu, APPUI_GAUCHE_EN_ATTENTE) !== 0 && m8[ENTREES_SUSPENDUES] === 0) {
      jeu.appeler(CLIC_GAUCHE, z);
      ecrireMot(jeu, APPUI_GAUCHE_EN_ATTENTE, 0);
      return;
    }
    if ((indicateurs(jeu, z) & APPUI_DROIT) && mot(jeu, APPUI_DROIT_EN_ATTENTE) !== 0 && m8[ENTREES_SUSPENDUES] === 0) {
      jeu.appeler(CLIC_DROIT, z);
      ecrireMot(jeu, APPUI_DROIT_EN_ATTENTE, 0);
      return;
    }
    // Les deux boutons maintenus ne sont pas suspendus par 0xB14C6. Anomalie reproduite : après
    // chacun, c'est le mot de l'*appui* du même bouton qui est remis à zéro, et non celui du bouton
    // maintenu (qu'efface le relevé de la souris au relâchement).
    if ((indicateurs(jeu, z) & GAUCHE_MAINTENU) && mot(jeu, GAUCHE_ENFONCE) !== 0) {
      jeu.appeler(GAUCHE_MAINTENU_SUR, z);
      ecrireMot(jeu, APPUI_GAUCHE_EN_ATTENTE, 0);
      return;
    }
    if ((indicateurs(jeu, z) & DROIT_MAINTENU) && mot(jeu, DROIT_ENFONCE) !== 0) {
      jeu.appeler(DROIT_MAINTENU_SUR, z);
      ecrireMot(jeu, APPUI_DROIT_EN_ATTENTE, 0);
      return;
    }
  }
}

// Sans la barre d'outils (0xD7798 nul), tout l'écran est la vue du parc. Les deux boutons maintenus
// ensemble font revenir la barre : origine du dessin à 0x70, 0xD7798 = 1, l'animation des boutons à
// son début, la caméra trois colonnes plus loin, et les quatre mots des boutons effacés. Sinon, la
// vue du parc reçoit le survol et chacune des quatre actions dont le bouton est en jeu, à la suite ;
// ici, c'est bien le mot du bouton droit maintenu qui est remis à zéro, et celui du gauche ne l'est
// pas.
function sansBarreDOutils(jeu) {
  const m8 = jeu.m8;
  if (mot(jeu, GAUCHE_ENFONCE) !== 0 && mot(jeu, DROIT_ENFONCE) !== 0) {
    ecrireMot(jeu, ORIGINE_X, 0x70);
    m8[BARRE_D_OUTILS] = 1;
    m8[IMAGE_DU_BOUTON] = 0;
    ecrireMot(jeu, REDESSINER_CARTE, 1);
    ecrireMot(jeu, CAMERA_COLONNE, mot(jeu, CAMERA_COLONNE) + 3);
    jeu.appeler(RECADRER_CAMERA);
    ecrireMot(jeu, APPUI_DROIT_EN_ATTENTE, 0);
    ecrireMot(jeu, APPUI_GAUCHE_EN_ATTENTE, 0);
    ecrireMot(jeu, DROIT_ENFONCE, 0);
    ecrireMot(jeu, GAUCHE_ENFONCE, 0);
    return;
  }
  if (m8[ENTREES_SUSPENDUES] === 0) jeu.appeler(SURVOLER_ZONE, VUE_DU_PARC);
  if (mot(jeu, APPUI_GAUCHE_EN_ATTENTE) !== 0) {
    jeu.appeler(CLIC_GAUCHE, VUE_DU_PARC);
    ecrireMot(jeu, APPUI_GAUCHE_EN_ATTENTE, 0);
  }
  if (mot(jeu, GAUCHE_ENFONCE) !== 0) jeu.appeler(GAUCHE_MAINTENU_SUR, VUE_DU_PARC);
  if (mot(jeu, APPUI_DROIT_EN_ATTENTE) !== 0) {
    jeu.appeler(CLIC_DROIT, VUE_DU_PARC);
    ecrireMot(jeu, APPUI_DROIT_EN_ATTENTE, 0);
  }
  if (mot(jeu, DROIT_ENFONCE) !== 0) {
    jeu.appeler(DROIT_MAINTENU_SUR, VUE_DU_PARC);
    ecrireMot(jeu, DROIT_ENFONCE, 0);
  }
}

// =================================================================================================
// 0x1A27E — rendre au pointeur tout l'écran.
//
// Pendant qu'on fait glisser un outil de construction, 0x47268 enferme le pointeur dans la vue du
// parc (x de 25 à 630, y du haut de la vue à 28 lignes au-dessus de la barre d'outils). Ceci, appelé
// pour chaque zone qui contient le pointeur, avant son survol, rend au pilote de la souris l'écran
// entier : 0x11303(0, 640, 0, 480), que 0x11303 ramène à 0–638 × 0–398 en basse résolution, et à
// 0–638 × 0–478, fois 8, en haute. Le glisser suivant, dans la même image, enferme de nouveau.
// Sauf pour les zones 1 à 4 et 16. Ces nombres sont ceux des outils qu'on fait glisser (0x175B5, et
// le gestionnaire de souris 0x7D7E2 qui teste l'outil contre 1 à 4, 10 et 16) : un numéro de zone
// comparé à des numéros d'outils, vraisemblablement une confusion ; non établi, reproduit.
export function rendreToutLEcranAuPointeur(jeu, zone) {
  const z = zone & 0xFFFF;
  if ((z >= 1 && z <= 4) || z === 0x10) return;
  jeu.appeler(PLAGE_DU_POINTEUR, 0, 0x280, 0, 0x1E0);
}

// =================================================================================================
// 0x149A4 — le survol d'une zone de l'écran du parc.
//
// Seulement dans la vue du parc (0xD6652 nul). Les bords font défiler la vue (0x47598, après un
// délai) et notent qu'un bord a été survolé ; les boutons de la barre affichent leur texte dans la
// barre des messages (voir la table de l'en-tête) ; la vue du parc montre l'outil en main sur la case
// sous le pointeur. Les autres zones ne font rien.
const TEXTE_DES_BOUTONS = {
  4: 7, 5: 8, 6: 9, 7: 0xA, 8: 0xB, 9: 0xC, 10: 0xD, 11: 0xE, 12: 0xF, 13: 0x10,
  16: 0x11, 17: 0x12, 18: 0x13, 19: 0x17, 20: 0x19, 21: 0x1B,
};

export function survolerUneZone(jeu, zone) {
  if (motSigne(jeu, ECRAN_COURANT) !== 0) return;
  const z = zone & 0xFFFF;
  if (z <= BORD_GAUCHE) {
    jeu.appeler(DEFILER_AU_BORD, z);
    jeu.m8[BORD_SURVOLE] = 1;
    return;
  }
  const texte = TEXTE_DES_BOUTONS[z];
  if (texte !== undefined) {
    ecrireMot(jeu, INFOBULLE, texte);
    return;
  }
  // (L'original reteste ici l'écran courant et, s'il n'était pas nul, afficherait le texte 7 : la
  // branche est morte, l'écran ayant été testé à l'entrée.)
  if (z === VUE_DU_PARC) survolerLeParc(jeu);
}

// La case sous le pointeur. La vue est oblique : chaque rangée est décalée d'un tiers de tuile vers
// la droite (retro-ingenierie.md § 5.1). La colonne se lit donc sur x − y/2 (en basse résolution, le
// tiers de 48 est 16, soit la moitié des 32 lignes d'une rangée ; en haute, 8 pour 16 lignes), la
// rangée sur y. Les deux sont bornées à la carte, relativement à la caméra.
function caseSousLePointeur(jeu) {
  const largeur = mot(jeu, LARGEUR_TUILE), hauteur = mot(jeu, HAUTEUR_TUILE);
  const y = motSigne(jeu, SOURIS_Y);
  const decale = motSigne(jeu, SOURIS_X) - motSigne(jeu, ORIGINE_X) - diviser(y, 2);
  // Le +10 et le −10 ramènent la division tronquée à un arrondi vers le bas, pour les dix premières
  // colonnes à gauche de l'origine.
  ecrireMot(jeu, COLONNE_VISEE, diviser(largeur * 10 + decale, largeur) - 10);
  ecrireMot(jeu, RANGEE_VISEE, diviser(y, hauteur));

  const colonne = motSigne(jeu, CAMERA_COLONNE) + motSigne(jeu, COLONNE_VISEE);
  if (colonne < 0) ecrireMot(jeu, COLONNE_VISEE, 0);
  else if (colonne >= TAILLE_CARTE) ecrireMot(jeu, COLONNE_VISEE, TAILLE_CARTE - mot(jeu, CAMERA_COLONNE) - 1);
  const rangee = motSigne(jeu, CAMERA_RANGEE) + motSigne(jeu, RANGEE_VISEE);
  if (rangee < 0) ecrireMot(jeu, RANGEE_VISEE, 0);
  else if (rangee >= TAILLE_CARTE) ecrireMot(jeu, RANGEE_VISEE, TAILLE_CARTE - mot(jeu, CAMERA_RANGEE) - 1);

  // Le coin haut gauche de la case à l'écran, et son numéro. Calculs sur 16 bits.
  const dc = motSigne(jeu, COLONNE_VISEE), dr = motSigne(jeu, RANGEE_VISEE);
  ecrireMot(jeu, CASE_X, motSigne(jeu, ORIGINE_X) + largeur * dc + diviser(largeur, 3) * dr);
  ecrireMot(jeu, CASE_Y, dr * motSigne(jeu, HAUTEUR_TUILE));
  const r = (mot(jeu, RANGEE_VISEE) + mot(jeu, CAMERA_RANGEE)) & 0xFFFF;
  const c = (mot(jeu, COLONNE_VISEE) + mot(jeu, CAMERA_COLONNE)) & 0xFFFF;
  ecrireMot(jeu, CASE_VISEE, (r << 6) + c);
}

const caseX = (jeu) => motSigne(jeu, CASE_X);
const caseY = (jeu) => motSigne(jeu, CASE_Y);
const cellule = (jeu, numero) => adresse(jeu, CARTE) + numero * 4;
const celluleVisee = (jeu) => cellule(jeu, mot(jeu, CASE_VISEE));
const drapeauxDuSol = (jeu, c) => jeu.m8[SOLS + jeu.m8[c + 2] * 4];   // l'octet bas des drapeaux
const hauteResolutionExacte = (jeu) => motSigne(jeu, MODE_AFFICHAGE) === 8;

// Une image de sol, tracée au coin de la case sous le pointeur, avec le traceur du mode.
function tracerImageDeSol(jeu, x, y, numero) {
  const image = adresse(jeu, IMAGES_DE_SOL) + (numero + 1) * 6;
  jeu.appeler(jeu.etat.basseResolution ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE, x, y, image);
}

// Si la case sous le pointeur porte quelque chose, c'est redessiné par-dessus l'aperçu. Le contenu
// passé est celui de la cellule `source` (la case visée elle-même, sauf pour le mur, voir
// apercuDuMur) ; il est passé signé, le coin non signé, comme dans l'original.
function redessinerLaCaseVisee(jeu, source = celluleVisee) {
  if (mot(jeu, celluleVisee(jeu)) === 0) return;
  jeu.appeler(DESSINER_CASE, motSigne(jeu, source(jeu)), mot(jeu, CASE_X), mot(jeu, CASE_Y));
}

// L'aperçu des sols qu'on pose (murs, chemins, barrières, rivière) : la routine de l'outil dit
// quelle image de sol irait sur la case (0 : aucune). Si une image convient, elle est tracée, avec
// ce que porte la case, et le texte « vous pouvez… » ; sinon, le texte « vous ne pouvez pas… », à
// moins que la case ne porte déjà un sol de ce genre (le drapeau).
function apercuDeSol(jeu, image, texteOui, texteNon, drapeau, texteAvant, source = celluleVisee) {
  if ((image & 0xFFFF) !== 0) {
    if (texteAvant) ecrireMot(jeu, INFOBULLE, texteOui);
    tracerImageDeSol(jeu, caseX(jeu), caseY(jeu), image & 0xFFFF);
    redessinerLaCaseVisee(jeu, source);
    if (!texteAvant) ecrireMot(jeu, INFOBULLE, texteOui);
  } else if ((drapeauxDuSol(jeu, celluleVisee(jeu)) & drapeau) === 0) {
    ecrireMot(jeu, INFOBULLE, texteNon);
  }
}

// Le point où poser un objet sur la case : décalages écrits en dur pour chaque mode, depuis la
// moitié de la largeur de tuile (voir objets.js, pointDuDecor). Le mode est ici comparé à 8.
function pointSurLaCase(jeu, dxHaute, dxBasse, dyHaute, dyBasse) {
  const haute = hauteResolutionExacte(jeu);
  const y = s16(caseY(jeu) + (haute ? dyHaute : dyBasse));
  const x = s16(caseX(jeu) + (mot(jeu, LARGEUR_TUILE) >> 1) + (haute ? dxHaute : dxBasse));
  return [x, y];
}

// Le milieu de la case.
function milieuDeLaCase(jeu) {
  const y = s16(diviser(mot(jeu, HAUTEUR_TUILE), 2) + caseY(jeu));
  const x = s16(diviser(mot(jeu, LARGEUR_TUILE), 2) + caseX(jeu));
  return [x, y];
}

const objetDElement = (jeu, element) => mot(jeu, adresse(jeu, OBJETS_DES_ELEMENTS) + element * 2);

function survolerLeParc(jeu) {
  ecrireMot(jeu, POINTEUR_SUR_LE_PARC, 4);
  caseSousLePointeur(jeu);
  switch (mot(jeu, OUTIL)) {
    case 1: apercuDuMur(jeu); break;
    case 2: apercuDuChemin(jeu); break;
    case 3: apercuDeLaBarriere(jeu); break;
    case 4: apercuDeLaRiviere(jeu); break;
    case 5: case 26: apercuDeLAttraction(jeu); break;
    case 6: apercuDeLaBoutique(jeu); break;
    case 7: apercuDuDecor(jeu); break;
    case 9: employeSousLePointeur(jeu); break;
    case 10: apercuDesRails(jeu); break;
    case 11: jeu.appeler(0x193FD); break;
    case 12: jeu.appeler(0x416EA, caseX(jeu), caseY(jeu), mot(jeu, CASE_VISEE)); break;
    case 13: apercuOutil13(jeu); break;
    case 14: apercuOutil14(jeu); break;
    case 15: apercuDuPanneau(jeu); break;
    case 16: apercuOutil16(jeu); break;
    case 17: jeu.appeler(0x19A9E); break;
    case 18: apercuDuLooping(jeu); break;
    case 19: employeDeplace(jeu); break;
    case 22: deplacerLEntreeDuParc(jeu); break;
    default: break;                  // 0, 8, 20, 21, 23 à 25 et au-delà de 26 : rien
  }
  marquerLesCoinsDeLaCase(jeu);
}

// Outil 1 : un mur, de la fiche [0xD6646] de 0xCCA92, par 0x287D8. Textes 5 et 6.
// Anomalie reproduite : pour redessiner ce que porte la case, le programme passe le contenu de la
// cellule dont le numéro est l'image de sol de la case visée (son octet +2), une cellule des quatre
// premières rangées de la carte, au lieu de celui de la case visée ; le test qui précède porte,
// lui, sur la case visée. Sans effet : 0x287D8 ne propose un mur que sur une case sans drapeaux de
// sol, non réservée et vide (mot +0 nul), si bien que ce redessin n'a jamais lieu.
function apercuDuMur(jeu) {
  const objet = mot(jeu, CONSTRUCTIBLES + 4 + mot(jeu, FICHE_CONSTRUCTIBLE) * TAILLE_CONSTRUCTIBLE);
  const image = jeu.appeler(0x287D8, objet, mot(jeu, CASE_VISEE), 0);
  apercuDeSol(jeu, image, 5, 6, 1, false, (j) => cellule(j, j.m8[celluleVisee(j) + 2]));
}

// Outil 2 : un chemin, par 0x28943 (l'allée qui irait sur la case). Textes 1 et 2 ; ici le texte
// est posé avant le tracé.
function apercuDuChemin(jeu) {
  const image = jeu.appeler(ALLEE_SUR_CASE, mot(jeu, CASE_VISEE), 0);
  apercuDeSol(jeu, image, 1, 2, 2, true);
}

// Outil 3 : une barrière de file d'attente, de la fiche [0xD664E] de 0xD43E8, par 0x28E5A.
// Textes 3 et 4.
function apercuDeLaBarriere(jeu) {
  const sol = mot(jeu, BARRIERES + 2 + mot(jeu, FICHE_BARRIERE) * 7);
  const image = jeu.appeler(0x28E5A, sol, mot(jeu, CASE_VISEE), 0);
  apercuDeSol(jeu, image, 3, 4, 8, false);
}

// Outil 4 : la rivière, par 0x29340. Textes 0x20 et 0x21, le premier posé avant le tracé.
function apercuDeLaRiviere(jeu) {
  const image = jeu.appeler(0x29340, mot(jeu, CASE_VISEE), 0);
  apercuDeSol(jeu, image, 0x20, 0x21, 0x40, true);
}

// Outils 5 et 26 : l'emprise d'une attraction, fiche [0xD665A] du catalogue 0xCCED0, par 0x30E22.
function apercuDeLAttraction(jeu) {
  jeu.appeler(0x30E22, ATTRACTIONS + mot(jeu, FICHE_ATTRACTION) * 200, mot(jeu, CASE_X), mot(jeu, CASE_Y));
}

// Outil 6 : le bâtiment d'une boutique, fiche [0xD664A] du catalogue 0xD3C62 (son mot +0x2B est
// l'élément qui le représente), au centre de la case.
function apercuDeLaBoutique(jeu) {
  const [x, y] = pointSurLaCase(jeu, 4, 8, 8, 16);
  const element = mot(jeu, BOUTIQUES + 0x2B + mot(jeu, FICHE_BOUTIQUE) * 0x6B);
  jeu.appeler(DESSINER_OBJET, objetDElement(jeu, element), x, y);
}

// Outil 7 : un décor de la fiche [0xD6646] de 0xCCA92, dont l'objet est l'opposé d'un numéro de
// décor, au centre de la case.
function apercuDuDecor(jeu) {
  const [x, y] = pointSurLaCase(jeu, 4, 8, 8, 16);
  const decor = -motSigne(jeu, CONSTRUCTIBLES + 4 + mot(jeu, FICHE_CONSTRUCTIBLE) * TAILLE_CONSTRUCTIBLE);
  const element = mot(jeu, ELEMENTS_DES_DECORS + decor * 2);
  jeu.appeler(DESSINER_OBJET, objetDElement(jeu, element), x, y);
}

// Outil 9 : l'employé à embaucher, fiche [0xD6644] du catalogue 0xD35E2 (son mot +4 est l'élément
// de sa silhouette), suspendu 40 lignes au-dessus du pointeur.
function employeSousLePointeur(jeu) {
  const y = s16(mot(jeu, SOURIS_Y) - 0x28);
  const x = motSigne(jeu, SOURIS_X);
  const element = mot(jeu, EMPLOYES + 4 + mot(jeu, FICHE_EMPLOYE) * 0x36);
  jeu.appeler(DESSINER_OBJET_SUSPENDU, objetDElement(jeu, element), x, y);
}

// Outil 10 : les rails. Si la case porte déjà un morceau de rails (0x439DC : un objet de type 0x12),
// texte 0x1D (« élever les rails… ») ; sinon texte 0x1C (« placez les rails ici… »), et la pièce que
// 0x29835 choisit, parmi les éléments de l'attraction [0xD665A] (table 0xB4397, 10 octets par
// sorte, d'après l'octet signé +0xB4 de sa fiche), au milieu de la case.
function apercuDesRails(jeu) {
  if ((jeu.appeler(0x439DC, mot(jeu, CASE_VISEE)) & 0xFFFF) !== 0) {
    ecrireMot(jeu, INFOBULLE, 0x1D);
    return;
  }
  ecrireMot(jeu, INFOBULLE, 0x1C);
  const piece = jeu.appeler(0x29835, mot(jeu, CASE_VISEE), 0, mot(jeu, FICHE_ATTRACTION)) & 0xFFFF;
  if (piece === 0xFFFF) return;
  const [x, y] = milieuDeLaCase(jeu);
  const sorte = (jeu.m8[ATTRACTIONS + 0xB4 + mot(jeu, FICHE_ATTRACTION) * 200] << 24) >> 24;
  const element = piece + mot(jeu, 0xB4397 + sorte * 10);
  jeu.appeler(DESSINER_OBJET, objetDElement(jeu, element), x, y);
}

// Outil 13 : ce que 0x2B576 désigne (−1 : rien), l'élément 0x257 + n, posé à (L/2 + 15, 16) du coin
// de la case en basse résolution, (L/2 + 7, 8) en haute. Rôle non établi.
function apercuOutil13(jeu) {
  const n = s16(jeu.appeler(0x2B576, mot(jeu, CASE_VISEE), 0));
  if (n === -1) return;
  const [x, y] = pointSurLaCase(jeu, 7, 15, 8, 16);
  jeu.appeler(DESSINER_OBJET, mot(jeu, adresse(jeu, OBJETS_DES_ELEMENTS) + n * 2 + 0x4AE), x, y);
}

// Outil 14 : l'élément 0xAC, puis une pièce de l'élément 0xAD (objets.js, dessinerMorceaux) : si les
// comptes du parc désignent un objet (mot +0x2C8), une flèche tournée vers lui depuis la case sous
// le pointeur — selon l'axe où il est le plus loin —, parmi quatre pour une attraction (type 4), les
// quatre suivantes pour une boutique (type 10), les quatre d'après pour le type 0x14 ; sinon, les
// quatre pièces 0, 4 ou 8, tour à tour tous les dix pas de simulation. Rôle non établi.
function apercuOutil14(jeu) {
  const bas = pointSurLaCase(jeu, 7, 15, 0xF, 0x1F);
  jeu.appeler(DESSINER_OBJET, mot(jeu, adresse(jeu, OBJETS_DES_ELEMENTS) + 0x158), bas[0], bas[1]);
  const objet = adresse(jeu, OBJETS) + mot(jeu, adresse(jeu, COMPTES) + 0x2C8) * TAILLE_OBJET;
  const pieces = () => mot(jeu, adresse(jeu, OBJETS_DES_ELEMENTS) + 0x15A);
  if (objet > adresse(jeu, OBJETS)) {
    const visee = mot(jeu, CASE_VISEE);
    const dc = jeu.m8[objet + 7] - (visee % TAILLE_CARTE);
    const eloignementColonnes = jeu.appeler(VALEUR_ABSOLUE, s16(dc));
    const dr = jeu.m8[objet + 9] - (visee >> 6);
    const eloignementRangees = jeu.appeler(VALEUR_ABSOLUE, s16(dr));
    let sens;
    if (eloignementColonnes > eloignementRangees) sens = s16(dc) > 0 ? 1 : 3;
    else sens = s16(dr) > 0 ? 2 : 0;
    const type = jeu.m8[objet + 4];
    let premier;
    if (type === 4) premier = sens;
    else if (type === 10) premier = 4 + sens;
    else if (type === 0x14) premier = 8 + sens;
    else return;
    const [x, y] = pointSurLaCase(jeu, 7, 15, 0xF, 0x1F);
    jeu.appeler(DESSINER_MORCEAUX, pieces(), premier & 0xFFFF, 1, x, y);
    return;
  }
  const [x, y] = pointSurLaCase(jeu, 7, 15, 0xF, 0x1F);
  const tour = ((adresse(jeu, PAS_DE_SIMULATION) % 30) / 10) | 0;
  jeu.appeler(DESSINER_MORCEAUX, pieces(), (tour << 2) & 0xFFFF, 4, x, y);
}

// Outil 15 : un panneau, fiche [0xD6646] de 0xCCA92 (son objet est l'élément de base).
function apercuDuPanneau(jeu) {
  const haute = hauteResolutionExacte(jeu);
  const y = s16(caseY(jeu) + (haute ? 0xB : 0x16));
  const x = s16(caseX(jeu) + ((mot(jeu, LARGEUR_TUILE) * 0xA0) >> 8) + (haute ? 5 : 0xB));
  const element = motSigne(jeu, CONSTRUCTIBLES + 4 + mot(jeu, FICHE_CONSTRUCTIBLE) * TAILLE_CONSTRUCTIBLE);
  jeu.appeler(DESSINER_OBJET, mot(jeu, adresse(jeu, OBJETS_DES_ELEMENTS) + element * 2), x, y);
}

// Outil 16 : l'image de sol que 0x29686 choisit (0 : aucune), posée sur le bas de la case d'après sa
// hauteur, puis ce que porte la case. Pas de texte. Rôle non établi.
function apercuOutil16(jeu) {
  const n = jeu.appeler(0x29686, mot(jeu, CASE_VISEE), 0) & 0xFFFF;
  if (n === 0) return;
  const image = adresse(jeu, IMAGES_DE_SOL) + (n + 1) * 6;
  const y = s16(mot(jeu, CASE_Y) + mot(jeu, HAUTEUR_TUILE) - jeu.m8[image + 5]);
  jeu.appeler(jeu.etat.basseResolution ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE, caseX(jeu), y, image);
  redessinerLaCaseVisee(jeu);
}

// Outil 18 : un looping, par 0x29E03 (0 : impossible). Textes 0x1E et 0x1F.
function apercuDuLooping(jeu) {
  const element = jeu.appeler(0x29E03, mot(jeu, CASE_VISEE), 0, mot(jeu, FICHE_ATTRACTION)) & 0xFFFF;
  if (element === 0) {
    ecrireMot(jeu, INFOBULLE, 0x1F);
    return;
  }
  ecrireMot(jeu, INFOBULLE, 0x1E);
  const [x, y] = milieuDeLaCase(jeu);
  jeu.appeler(DESSINER_OBJET, objetDElement(jeu, element), x, y);
}

// Outil 19 : l'employé qu'on déplace (l'objet choisi [0xD6678]) pend sous le pointeur ; tous les
// quatre pas de simulation, son objet graphique passe au suivant de l'animation (mot +6 de l'objet
// graphique) : il gigote.
function employeDeplace(jeu) {
  const employe = () => adresse(jeu, OBJETS) + mot(jeu, OBJET_CHOISI) * TAILLE_OBJET;
  if ((jeu.m8[PAS_DE_SIMULATION] & 3) === 0) {
    const suivant = mot(jeu, adresse(jeu, OBJETS_GRAPHIQUES) + mot(jeu, employe() + 0xA) * 8 + 6);
    ecrireMot(jeu, employe() + 0xA, suivant);
  }
  const y = motSigne(jeu, SOURIS_Y), x = motSigne(jeu, SOURIS_X);
  jeu.appeler(DESSINER_OBJET_SUSPENDU, mot(jeu, employe() + 0xA), x, y);
}

// Outil 22 : l'entrée du parc suit le pointeur. Elle est ôtée (0x18BC0(0)), reposée au bord bas de la
// carte, à la colonne de la case visée (numéro 64 × 64 + colonne, la rangée qui suit la dernière), et
// la caméra descendue pour montrer le bas de la carte : rangée 62 moins le nombre de rangées que
// montre l'écran (400 lignes en basse résolution, 480 en haute, arrondi au-dessus).
function deplacerLEntreeDuParc(jeu) {
  jeu.appeler(POSER_L_ENTREE, 0);
  jeu.appeler(POSER_L_ENTREE, (mot(jeu, CASE_VISEE) % TAILLE_CARTE + 0x1000) & 0xFFFF);
  const hauteur = jeu.etat.basseResolution ? 0x190 : hauteurDeLaVue(jeu);   // grande-vue.js
  const tuile = mot(jeu, HAUTEUR_TUILE);
  const rangees = diviser(tuile + hauteur - 1, tuile);
  ecrireMot(jeu, CAMERA_RANGEE, TAILLE_CARTE - rangees - 2);
  jeu.appeler(RECADRER_CAMERA);
}

// Les quatre coins de la case visée, marqués d'un point blanc : c'est le curseur de case, dessiné
// quel que soit l'outil, même sans outil. Les deux coins du bas sont décalés de 16 pixels vers la
// droite, le tiers d'une tuile de 48 (le décalage d'une rangée à la suivante) ; le décalage reste 16
// en haute résolution, où ce tiers vaut 8 : les deux coins du bas y sont vraisemblablement tracés
// 8 pixels trop à droite. Anomalie reproduite.
// En haute résolution, le bloc de chaque point est d'abord marqué pour la présentation (0x54D38) ;
// les coordonnées sont relues, comme dans l'original, mais 0x54D38 n'y touche pas.
function marquerLesCoinsDeLaCase(jeu) {
  const x = mot(jeu, CASE_X), y = mot(jeu, CASE_Y);
  const largeur = mot(jeu, LARGEUR_TUILE), hauteur = mot(jeu, HAUTEUR_TUILE);
  const coins = [[x, y], [x + largeur, y], [x + 0x10, y + hauteur], [x + largeur + 0x10, y + hauteur]];
  for (const [cx, cy] of coins) {
    if (jeu.etat.basseResolution) {
      jeu.appeler(POINT_BASSE_RESOLUTION, s16(cx), s16(cy), BLANC);
    } else {
      jeu.appeler(MARQUER_ZONE_SALE, s16(cx), s16(cy), 1, 1);
      jeu.appeler(POINT_HAUTE_RESOLUTION, s16(cx), s16(cy), BLANC);
    }
  }
}

// =================================================================================================
// 0x175B5 — le bouton gauche maintenu sur une zone.
//
// Sur un bord, la vue défile tout de suite (0x183EC), sans le délai du survol. Sur la vue du parc,
// pour les outils qu'on fait glisser, la pose sur la case visée est demandée : 0x47268 fait
// d'abord défiler la vue si l'on trace contre le bord de l'écran, puis la demande est écrite dans
// la file des événements (voir NOUVELLE_DEMANDE), que 0x2CCF8 appliquera, et le double-clic
// oublié. Les rails ne sont redemandés que si l'outil ou la case changent depuis la demande de
// l'image précédente. Les autres outils ne font rien ici : ils agissent au clic (0x15FBD).
export function boutonGaucheMaintenu(jeu, zone) {
  if (motSigne(jeu, ECRAN_COURANT) !== 0) return;
  const z = zone & 0xFFFF;
  if (z <= BORD_GAUCHE) {
    jeu.appeler(DEFILER, z);
    return;
  }
  if (z !== VUE_DU_PARC) return;
  // (L'écran courant est retesté ici ; il vaut forcément 0.)
  if (jeu.m8[ENTREES_SUSPENDUES] !== 0) return;
  ecrireMot(jeu, POINTEUR_SUR_LE_PARC, 4);
  const outil = mot(jeu, OUTIL);
  const joueur = () => mot(jeu, JOUEUR_COURANT) * 6;
  const demander = (sorte, parametre) => {
    jeu.appeler(DEFILER_PENDANT_LE_TRACE);
    jeu.m8[NOUVELLE_DEMANDE + joueur()] = sorte;
    ecrireMot(jeu, NOUVELLE_DEMANDE + 1 + joueur(), mot(jeu, CASE_VISEE));
    if (parametre !== undefined) ecrireMot(jeu, NOUVELLE_DEMANDE + 3 + joueur(), parametre());
    ecrireMot(jeu, DOUBLE_CLIC_EN_ATTENTE, 0);
  };
  switch (outil) {
    case 1:          // un mur : l'objet de la fiche
      demander(2, () => mot(jeu, CONSTRUCTIBLES + 4 + mot(jeu, FICHE_CONSTRUCTIBLE) * TAILLE_CONSTRUCTIBLE));
      break;
    case 2:          // un chemin
      demander(4);
      break;
    case 3:          // une barrière : son image de sol
      demander(6, () => mot(jeu, BARRIERES + 2 + mot(jeu, FICHE_BARRIERE) * 7));
      break;
    case 4:          // la rivière
      demander(8);
      break;
    case 10:         // les rails : 4 × attraction + 3
      if (jeu.m8[DEMANDE_PRECEDENTE + joueur()] !== outil || mot(jeu, DEMANDE_PRECEDENTE + 1 + joueur()) !== mot(jeu, CASE_VISEE)) {
        demander(0x12, () => (mot(jeu, FICHE_ATTRACTION) << 2) + 3);
      }
      break;
    case 16:
      demander(0x1E);
      break;
    default:
      break;
  }
}

// =================================================================================================
// 0x1803C — le double-clic sur la vue du parc : prendre en main l'outil de ce qu'on montre.
//
// D'après le sol de la case visée et ses drapeaux (0xB44D9), la fiche du catalogue qui le pose
// devient la fiche en main, et son outil l'outil en main : un mur (drapeau 1, outil 1), l'outil 12
// (drapeau 0x800), un chemin (drapeau 2, sauf si l'outil en main est 13 ou 14), une barrière de file
// (drapeau 8, outil 3). Le sol d'une fiche se retrouve par son numéro de forme retranché (octet
// 0xB44DC du sol). Une case dont l'octet +3 porte le bit 5 donne l'outil 13 (sauf s'il est déjà en
// main), et rien d'autre. Enfin, un décor fixe au bout de la liste des objets de la case donne sa
// fiche de 0xCCA92 (outil 7).
// Le double-clic sur le sol 0x88, l'arrêt du bus devant l'entrée, ouvre de plus l'écran 0x54 (un des
// écrans pleins de la boucle du parc ; lequel, non établi).
// Chaque catalogue est parcouru en entier : c'est la dernière fiche qui convient qui l'emporte.
export function doubleCliquerSurLeParc(jeu, zone) {
  if (motSigne(jeu, ECRAN_COURANT) !== 0) return;
  if ((zone & 0xFFFF) !== VUE_DU_PARC) return;
  const m8 = jeu.m8;
  const sol = m8[celluleVisee(jeu) + 2];
  const drapeaux = mot(jeu, SOLS + sol * 4);
  const forme = () => sol - m8[FORMES_DES_SOLS + sol * 4];
  if (sol === 0x88) ecrireMot(jeu, ECRAN_COURANT, 0x54);

  const prendreConstructible = (outilCherche, convient) => {
    for (let k = 0; mot(jeu, CONSTRUCTIBLES + k * TAILLE_CONSTRUCTIBLE) !== 0; k = (k + 1) & 0xFFFF) {
      const fiche = CONSTRUCTIBLES + k * TAILLE_CONSTRUCTIBLE;
      if (mot(jeu, fiche + 8) === outilCherche && convient(fiche)) {
        ecrireMot(jeu, FICHE_CONSTRUCTIBLE, k);
        ecrireMot(jeu, OUTIL, mot(jeu, fiche + 8));
      }
    }
  };
  const prendreChemin = (outilCherche, convient) => {
    for (let k = 0; mot(jeu, CHEMINS + k * 11) !== 0; k = (k + 1) & 0xFFFF) {
      const fiche = CHEMINS + k * 11;
      if (mot(jeu, fiche + 8) === outilCherche && convient(fiche)) {
        ecrireMot(jeu, FICHE_CHEMIN, k);
        ecrireMot(jeu, OUTIL, mot(jeu, fiche + 8));
      }
    }
  };

  if (drapeaux & 1) prendreConstructible(1, (f) => motSigne(jeu, f + 4) === forme());
  if (drapeaux & 0x800) prendreConstructible(0xC, (f) => motSigne(jeu, f + 4) === forme());
  if ((m8[celluleVisee(jeu) + 3] & 0x20) && mot(jeu, OUTIL) !== 0xD) {
    prendreChemin(0xD, () => true);
    return;
  }
  if ((drapeaux & 2) && mot(jeu, OUTIL) !== 0xD && mot(jeu, OUTIL) !== 0xE) {
    prendreChemin(2, (f) => mot(jeu, f + 4) === forme());
  }
  if (drapeaux & 8) {
    for (let k = 0; mot(jeu, BARRIERES + k * 7) !== 0; k = (k + 1) & 0xFFFF) {
      if (mot(jeu, BARRIERES + k * 7 + 2) === forme()) {
        ecrireMot(jeu, FICHE_BARRIERE, k);
        ecrireMot(jeu, OUTIL, 3);
      }
    }
  }
  // La liste des objets de la case, jusqu'au décor qui la clôt, s'il y en a un.
  for (let contenu = mot(jeu, celluleVisee(jeu)); contenu !== 0;) {
    if (s16(contenu) < 0) {
      prendreConstructible(7, (f) => mot(jeu, f + 4) === contenu);
      return;
    }
    contenu = mot(jeu, adresse(jeu, OBJETS) + s16(contenu) * TAILLE_OBJET + 2);
  }
}

// =================================================================================================
// 0x20E37 — dessiner un objet graphique suspendu au point (x, y).
//
// Comme 0x209B5 (objets.js), l'objet est tracé morceau par morceau ; mais le point est son haut :
// chaque morceau est descendu de la hauteur d'emprise de l'objet (octet +3). Pas de vue réduite ni de
// tracé tronqué. Sert à ce qui pend sous le pointeur : l'employé à embaucher (outil 9), l'employé
// qu'on déplace (outil 19) ; aussi appelée par 0x59C85.
export function dessinerObjetSuspendu(jeu, index, x, y) {
  const objet = adresse(jeu, OBJETS_GRAPHIQUES) + (index & 0xFFFF) * 8;
  let m = adresse(jeu, MORCEAUX) + mot(jeu, objet) * 10;
  while (m > adresse(jeu, MORCEAUX)) {
    const image = adresse(jeu, IMAGES) + mot(jeu, m);
    if (image > adresse(jeu, IMAGES)) {
      ecrireMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, m + 6));
      const ym = s16(y + mot(jeu, m + 4) + jeu.m8[objet + 3]);
      const xm = s16(x + mot(jeu, m + 2));
      jeu.appeler(jeu.etat.basseResolution ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE, xm, ym, image);
    }
    m = adresse(jeu, MORCEAUX) + mot(jeu, m + 8) * 10;
  }
  ecrireMot(jeu, DRAPEAUX_TRACEUR, 0);
}

// =================================================================================================
// 0x28943 — l'allée sur une case : laquelle irait, et la poser.
//
// Rend 0 si une allée ne peut pas aller sur la case : un sol qui n'accepte pas d'allée (drapeaux
// non nuls, sans le drapeau 0x400, hors des images 0x8B à 0x95 marquées 0x40), une case déjà
// réservée (bit 3 de son octet +3, voir 0x18BC0), un décor au bout de la liste de ses objets, ou un
// sol marqué 0x40 dont la sorte (table 0xB49C1, par numéro de forme) n'est ni 5 ni 10.
// Sinon, l'image de l'allée dépend des voisines : les huit cases autour (pas en 0xB8C3E) qui sont
// des allées, ou dont le premier objet est de type 0x1C tourné vers la case (octet +0x12, table
// 0xB8C4E) — ce type, non établi — forment un masque de huit bits, et la table 0xB4D5A donne l'image.
// Sur un sol marqué 0x40, l'image est 0x65 pour la sorte 5 et 0x66 pour la sorte 10.
// Sans `poser`, rend l'image. Avec, pose l'image (0x2CBC0 retrace le sol), tourne vers la nouvelle
// allée les panneaux (type 0x18) des quatre voisines dont le sol porte le drapeau 0x8000 et que rien
// n'oriente encore vers une allée, raccorde les voisines du masque (0x28D5A), et rend 1.
export function alleeSurUneCase(jeu, numeroCase, poser) {
  const m8 = jeu.m8;
  const numero = numeroCase & 0xFFFF;
  const cel = cellule(jeu, numero);
  const drapeaux = mot(jeu, SOLS + m8[cel + 2] * 4);

  // Le bout de la liste des objets de la case : la table elle-même (liste terminée par 0), ou en
  // deçà si la liste se termine par un décor.
  let bout = adresse(jeu, OBJETS) + motSigne(jeu, cel) * TAILLE_OBJET;
  while (bout > adresse(jeu, OBJETS)) bout = adresse(jeu, OBJETS) + motSigne(jeu, bout + 2) * TAILLE_OBJET;

  if (drapeaux !== 0 && (drapeaux & 0x400) === 0) {
    const sol = m8[cel + 2];
    if (!(sol >= 0x8B && sol < 0x96 && (drapeaux & 0x40))) return 0;
  }
  if (m8[cel + 3] & 8) return 0;
  if (bout < adresse(jeu, OBJETS)) return 0;

  let sorte = 0;
  if (drapeaux & 0x40) {
    sorte = m8[0xB49C1 + m8[FORMES_DES_SOLS + m8[cel + 2] * 4]];
    if (sorte !== 5 && sorte !== 0xA) return 0;
  }

  let voisines = 0;
  for (let k = 0; k < 8; k++) {
    const voisine = cel + motSigne(jeu, 0xB8C3E + k * 2) * 4;
    if (m8[SOLS + m8[voisine + 2] * 4] & 2) {
      voisines |= 1 << k;
      continue;
    }
    const premier = motSigne(jeu, voisine);
    if (premier <= 0) continue;
    const objet = adresse(jeu, OBJETS) + premier * TAILLE_OBJET;
    if (m8[objet + 4] === 0x1C && mot(jeu, 0xB8C4E + m8[objet + 0x12] * 2) === k) voisines |= 1 << k;
  }

  const raccorderLesVoisines = () => {
    for (let k = 0; k < 8; k++) {
      if (voisines & (1 << k)) jeu.appeler(0x28D5A, (numero + mot(jeu, 0xB8C3E + k * 2)) & 0xFFFF);
    }
  };

  if (drapeaux & 0x40) {
    const image = sorte === 5 ? 0x65 : 0x66;
    if ((poser & 0xFFFF) === 0) return image;
    m8[cel + 2] = image;
    jeu.appeler(0x2CBC0, numero, (m8[cel + 2] + 1) & 0xFFFF);
    raccorderLesVoisines();
    return 1;
  }
  if ((poser & 0xFFFF) === 0) return m8[0xB4D5A + voisines];

  m8[cel + 2] = m8[0xB4D5A + voisines];
  jeu.appeler(0x2CBC0, numero, (m8[cel + 2] + 1) & 0xFFFF);
  for (let k = 0; k < 4; k++) {
    const pas = motSigne(jeu, 0xB4920 + k * 2);
    const voisine = cel + pas * 4;
    if ((m8[SOLS + 1 + m8[voisine + 2] * 4] & 0x80) === 0) continue;
    const panneau = jeu.appeler(0x204B9, voisine, 0x18) >>> 0;
    if (panneau <= adresse(jeu, OBJETS) || m8[panneau + 0xC] === 4) continue;
    const derriere = cel + (motSigne(jeu, 0xB4920 + m8[panneau + 0x12] * 2) + pas) * 4;
    if (m8[SOLS + m8[derriere + 2] * 4] & 2) continue;
    m8[panneau + 0x12] = m8[0xB48EC + k * 2];
    const base = motSigne(jeu, CONSTRUCTIBLES + 4 + mot(jeu, panneau + 0x16) * TAILLE_CONSTRUCTIBLE);
    ecrireMot(jeu, panneau + 0xA, objetDElement(jeu, m8[panneau + 0x12] + base));
  }
  raccorderLesVoisines();
  return 1;
}

// =================================================================================================
// 0x18BC0 — poser l'entrée du parc, et refaire la clôture.
//
// L'entrée est décrite par la table 0xB4CCA, 6 octets par pièce, terminée par un sol −99 : +0 mot,
// le décalage de la case depuis celle de l'entrée ; +2 mot, un élément à poser en objet (0 : aucun) ;
// +4 mot, le sol (0 : aucun ; 0x55 : une allée, posée par 0x28943 ; 0x88 : l'arrêt du bus, dont la
// case est notée au mot +0x2CA des comptes). La case de l'entrée est notée au mot +0x63F des
// comptes ; `numeroCase` nul ôte seulement l'entrée. Dans les scénarios, l'entrée est posée une fois,
// au chargement, à la case 0x1020 (colonne 32 de la rangée qui suit la dernière : les décalages la
// ramènent dans la carte).
// Les pièces posées marquent leur case (bit 3 de l'octet +3), que 0x28943 refuse ensuite. Les objets
// sont posés dans le premier emplacement libre (octet +4 nul) de la table des objets, au centre de
// leur case ; ceux des éléments 0x13F, 0x21F et 0x220 deviennent des objets de type 0x14 (les poteaux
// à barres, objets.js), 0x13F et 0x220 avec l'octet +C à 6 ; les autres gardent le type 0.
// Puis la clôture est refaite, que l'entrée soit posée ou non : rangées 0 et 56 (sauf les colonnes 30
// à 34 de la 56, le passage de l'entrée) et colonnes 0 et 63 des rangées 1 à 55, là où rien n'est
// posé ; quatre coins ; et, sous le parc, les rangées 60 à 63 : une haie en 61, dont un élément sur
// 7 à 12, tiré au hasard, diffère (0xEE au lieu de 0xEF).
export function poserLEntreeDuParc(jeu, numeroCase) {
  const m8 = jeu.m8;
  ecrireMot(jeu, 0xD663C, 2);          // deux mots, non établis
  ecrireMot(jeu, 0xD663E, 0xB);
  const entreeDuParc = () => adresse(jeu, COMPTES) + 0x63F;
  const pieces = (fn) => {
    for (let k = 0; motSigne(jeu, 0xB4CCE + k * 6) !== -0x63; k = (k + 1) & 0xFFFF) fn(0xB4CCA + k * 6);
  };
  const celluleSignee = (c) => adresse(jeu, CARTE) + s16(c) * 4;

  // Ôter l'entrée en place.
  if (mot(jeu, entreeDuParc()) !== 0) {
    pieces((piece) => {
      const c = (mot(jeu, entreeDuParc()) + mot(jeu, piece)) & 0xFFFF;
      const sol = mot(jeu, piece + 4);
      if (sol === 0x55) {
        m8[celluleSignee(c) + 3] &= 0xF7;
        jeu.appeler(0x205D7, c);
      } else if (sol !== 0) {
        if (sol === 0x88) ecrireMot(jeu, adresse(jeu, COMPTES) + 0x2CA, 0);
        m8[celluleSignee(c) + 3] &= 0xF7;
        m8[celluleSignee(c) + 2] = 0;
      }
      if (mot(jeu, piece + 2) === 0) return;
      // Les poteaux (type 0x14) posés sur la case sont retirés (0x18B62). Anomalie reproduite : le
      // premier objet de la liste est lu signé, les suivants non signés ; un décor en cours de liste
      // mènerait loin au-delà de la table des objets.
      let objet = adresse(jeu, OBJETS) + motSigne(jeu, celluleSignee(c)) * TAILLE_OBJET;
      while (objet > adresse(jeu, OBJETS)) {
        const suivant = mot(jeu, objet + 2);
        if (m8[objet + 4] === 0x14) jeu.appeler(0x18B62, objet);
        objet = (adresse(jeu, OBJETS) + suivant * TAILLE_OBJET) >>> 0;
      }
    });
  }

  // Poser la nouvelle.
  ecrireMot(jeu, entreeDuParc(), numeroCase);
  if (mot(jeu, entreeDuParc()) !== 0) {
    pieces((piece) => {
      const c = (numeroCase + mot(jeu, piece)) & 0xFFFF;
      const sol = mot(jeu, piece + 4);
      if (sol === 0x55) {
        m8[celluleSignee(c) + 2] = 0;
        m8[celluleSignee(c) + 3] &= 0xF7;
        jeu.appeler(ALLEE_SUR_CASE, c, 1);
        m8[celluleSignee(c) + 3] |= 8;
      } else if (sol !== 0) {
        if (sol === 0x88) ecrireMot(jeu, adresse(jeu, COMPTES) + 0x2CA, c);
        m8[celluleSignee(c) + 2] = sol & 0xFF;
        m8[celluleSignee(c) + 3] |= 8;
      }
      const element = mot(jeu, piece + 2);
      if (element === 0) return;
      for (let o = adresse(jeu, OBJETS) + TAILLE_OBJET; o < adresse(jeu, FIN_DES_OBJETS); o += TAILLE_OBJET) {
        if (m8[o + 4] !== 0) continue;
        m8[o + 8] = 0x80;              // au centre de la case : 128/256 de case
        m8[o + 6] = m8[o + 8];
        m8[o + 7] = s16(c) % TAILLE_CARTE;
        m8[o + 9] = (s16(c) / TAILLE_CARTE) | 0;
        ecrireMot(jeu, o + 0xA, element);
        if (element === 0x13F || element === 0x220) {
          m8[o + 0xC] = 6;
          m8[o + 4] = 0x14;
        } else if (element === 0x21F) {
          m8[o + 4] = 0x14;
        }
        jeu.appeler(0x185C1, o, mot(jeu, o + 6), mot(jeu, o + 8));
        break;
      }
    });
  }

  refaireLaCloture(jeu);
}

// La clôture. Une case n'est garnie que si rien n'y est posé : ni sol, ni objet.
function refaireLaCloture(jeu) {
  const m8 = jeu.m8;
  const libre = (c, decalage) => m8[c + decalage + 2] === 0 && mot(jeu, c + decalage) === 0;
  const RANGEE = TAILLE_CARTE * 4;     // d'une rangée à la suivante, en octets
  let compte = 1;                      // jusqu'à la prochaine pièce différente de la haie
  for (let x = 0; x < TAILLE_CARTE; x++) {
    const c = cellule(jeu, x);
    if (libre(c, 0)) {                 // rangée 0
      m8[c + 2] = 0xCB;
      m8[c + 3] |= 8;
    }
    // Rangée 56, sauf le passage des colonnes 30 à 34. Anomalie reproduite : le sol lu est celui de la
    // rangée 56, mais le mot des objets celui de la rangée 57 (+0x3900 au lieu de +0x3800).
    if (m8[c + 56 * RANGEE + 2] === 0 && mot(jeu, c + 57 * RANGEE) === 0 && (x < 0x1E || x > 0x22)) {
      m8[c + 56 * RANGEE + 2] = 0xCB;
      m8[c + 56 * RANGEE + 3] |= 8;
    }
    // Rangée 55 : marquée, sauf les colonnes 31 à 33.
    if (x < 0x1F || x > 0x21) m8[c + 55 * RANGEE + 3] |= 8;

    const avant = compte;
    compte--;
    if ((avant & 0xFFFF) === 0) compte = (jeu.appeler(HASARD) & 0xFFFF) % 6 + 6;

    if (libre(c, 63 * RANGEE)) m8[c + 63 * RANGEE + 2] = 0xF1;
    if (libre(c, 62 * RANGEE)) m8[c + 62 * RANGEE + 2] = 0xF1;
    m8[c + 61 * RANGEE + 2] = (compte & 0xFFFF) === 0 ? 0xEE : 0xEF;
    if (libre(c, 60 * RANGEE)) m8[c + 60 * RANGEE + 2] = 0xED;
    m8[c + 63 * RANGEE + 3] |= 8;
    m8[c + 62 * RANGEE + 3] |= 8;
    m8[c + 61 * RANGEE + 3] |= 8;
    m8[c + 60 * RANGEE + 3] |= 8;
  }
  m8[cellule(jeu, 58 * TAILLE_CARTE + 32) + 3] |= 8;  // la case devant l'entrée
  for (let y = 1; y < 0x38; y++) {
    const c = cellule(jeu, y * TAILLE_CARTE);
    if (libre(c, 0)) {                                   // colonne 0
      m8[c + 2] = 0xCC;
      m8[c + 3] |= 8;
    }
    if (libre(c, 63 * 4)) {                              // colonne 63
      m8[c + 63 * 4 + 2] = 0xCC;
      m8[c + 63 * 4 + 3] |= 8;
    }
  }
  m8[cellule(jeu, 0) + 2] = 0xC8;                          // les quatre coins
  m8[cellule(jeu, 63) + 2] = 0xC9;
  m8[cellule(jeu, 56 * TAILLE_CARTE) + 2] = 0xC7;
  m8[cellule(jeu, 56 * TAILLE_CARTE + 63) + 2] = 0xCA;
}

// =================================================================================================
// Toutes prouvées par comparer.mjs (0 divergence, aucune jamais appelée sur l'ensemble des cinq
// scénarios) et verifier.mjs (IDENTIQUE, avec et sans --empoisonner) : demo.json et simulation.json
// exercent la vue du parc en basse résolution, parc.json et ecrans.json les bords et la barre
// d'outils dans les deux résolutions, construction.json les boutons, les menus et les outils.
//
// Ce que les scénarios n'exercent pas, et qui n'est donc pas prouvé par eux : la branche sans barre
// d'outils (0xD7798 nul), la case marquée (0x4395B), le clic droit sur une zone, les outils 1 à 4,
// 10, 12 à 16, 18, 19 et 22 du survol et ceux qu'on fait glisser (0x175B5), le retrait de l'entrée
// du parc, et 0x28943 ailleurs qu'à la pose de l'entrée. Ces chemins ont été éprouvés hors
// scénarios, en jouant une partie jusqu'à un point donné puis en appelant chaque fonction dans des
// états fabriqués (outil, fiches, position du pointeur, boutons, cases), transcription et
// réécriture comparées sur toute la mémoire à chaque appel : 34 606 cas, 0 divergence, dans les deux
// résolutions. L'épreuve détecte bien une faute : sur sept fautes volontaires, les cinq qui changent
// quelque chose y divergent (les deux autres sont sans effet observable).
//
// Quelques chemins restent sans preuve, faute d'un état qui les produise : le garde-fou de la
// division par zéro ; la borne d'une rangée négative (hors d'atteinte, le pointeur restant dans
// l'écran) ; le redessin de l'outil 1 (branche morte, ci-dessus) ; l'aperçu des rails quand 0x29835
// ne rend rien ; celui d'un looping possible (0x29E03 n'a jamais rien rendu) ; et, dans 0x28943, une
// voisine portant en tête un objet de type 0x1C, ou une voisine marquée 0x8000 sans panneau.
//
// `memoire: 'entiere'` : ces fonctions, ou celles qu'elles appellent (0x15FBD, 0x47268, 0x1C22A,
// 0x2CBC0…), écrivent dans le tas (la carte, les objets du parc) ; la comparaison appel par appel
// doit tout restaurer entre les deux exécutions.
export const reecritures = [
  { adresse: 0x145FB, nom: 'traiterLesEntreesDuParc', fn: (jeu) => traiterLesEntreesDuParc(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x1A27E, nom: 'rendreToutLEcranAuPointeur', fn: rendreToutLEcranAuPointeur, arguments: 1 },
  { adresse: 0x149A4, nom: 'survolerUneZone', fn: survolerUneZone, arguments: 1, memoire: 'entiere' },
  { adresse: 0x175B5, nom: 'boutonGaucheMaintenu', fn: boutonGaucheMaintenu, arguments: 1, memoire: 'entiere' },
  { adresse: 0x1803C, nom: 'doubleCliquerSurLeParc', fn: doubleCliquerSurLeParc, arguments: 1, memoire: 'entiere' },
  { adresse: 0x20E37, nom: 'dessinerObjetSuspendu', fn: dessinerObjetSuspendu, arguments: 3 },
  { adresse: 0x28943, nom: 'alleeSurUneCase', fn: alleeSurUneCase, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x18BC0, nom: 'poserLEntreeDuParc', fn: poserLEntreeDuParc, arguments: 1, memoire: 'entiere' },
];

export const enAttente = [];
