// Les écrans de gestion : les boutons des fiches, le graphique des comptes, les catalogues d'achat,
// les pensées des visiteurs, et la pose d'une boutique, d'une entrée et d'une sortie.
//
// Réécriture lisible des fonctions 0x3B76E, 0x5877B, 0x5969C, 0x360C5, 0x36BFC, 0x30E22, 0x6A73D,
// 0x193FD, 0x19A9E, 0x3568E et 0x407FD du jeu d'origine. Chaque constante vient du programme de 1994 ;
// `moteur/node/comparer.mjs` et `moteur/node/verifier.mjs` prouvent que le comportement est
// identique (voir en fin de fichier). À lire avec `moteur/jeu/fenetres.js` (la machinerie des
// fenêtres) et `moteur/jeu/ecrans-achat.js` (les écrans eux-mêmes), docs/retro-ingenierie.md § 11.2.
//
// --- CE QUE LE JOUEUR FAIT ICI -------------------------------------------------------------------
//
// Une fenêtre ouverte montre des boutons ; 0x3B011 (ecrans-achat.js) trouve celui que le pointeur
// vise et appelle **0x3B76E**, qui exécute sa commande. Un même numéro de commande sert à plusieurs
// écrans : le bouton « + » (commande 0x14) augmente la file d'attente d'une attraction, le salaire
// d'un employé, le prix d'entrée du parc ou le prix de vente d'une boutique, selon l'écran ouvert
// (0xD6652). C'est là que se règlent le salaire de l'employé (fenêtres 7 à 0xA, écran 0x1C, par pas
// de 2 jusqu'à 6 000), le prix du billet (écran 0x38), la longueur de file (écran 0x14), les prix
// d'achat et de vente d'une boutique (écrans 0x16 et 0x23), l'emprunt (± 50 000), et la fermeture
// d'une attraction.
//
// **0x5877B** dessine le milieu de l'écran des finances : le graphique des comptes. Neuf courbes
// (que le joueur allume et éteint), trois échelles de temps (le mois, l'année, quatre ans), douze
// points chacune. **0x5969C**, qu'il appelle, dessine et fait vivre les boutons de ce graphique.
//
// **0x360C5** remplit un catalogue d'achat (attractions, boutiques, personnel, décors) : la liste
// des articles qu'on peut acheter, triée par prix, avec un drapeau sur ceux qu'on ne peut pas payer.
// **0x36BFC** prépare l'écran des pensées : quarante bulles lancées des deux côtés, et la légende.
//
// **0x30E22** dessine, sous le pointeur, le fantôme de ce qu'on est en train de construire :
// l'emprise de l'attraction case par case, puis son image ; **0x6A73D** trace une variante de cette
// image. **0x193FD** et **0x19A9E** placent l'entrée et la sortie d'une attraction : elles
// choisissent, parmi les portes du genre, celle qui est la plus proche du pointeur. **0x3568E**
// pose enfin une boutique, quand l'événement de l'image le demande.
//
// --- LES TABLES ----------------------------------------------------------------------------------
//
// **Le catalogue d'achat ouvert**, 0xCE9D8, 13 octets par article, au plus 0xD778E articles :
//   +0 mot    le nom (numéro de chaîne)         +2 mot   l'objet graphique
//   +4 long   le prix                            +8 mot   l'outil de construction de l'article
//   +0xA octet le numéro de l'article dans son catalogue d'origine
//   +0xB octet 1 : trop cher pour le solde du joueur (l'écran le barre d'un fond plein)
// 0xD7787 désigne l'article choisi. Le tri se fait par 0x811AA (qsort) avec 0x6A83E, qui compare
// les prix.
//
// **Les catalogues d'origine**, chargés depuis le disque (ils sont vides dans le fichier) :
//   attractions  0xCCED0, 200 octets : +0x22 le nom, +0x2A la case d'ancrage, +0x34 les 22 cases
//                de l'emprise (mots signés), +0x60 les images du sol, +0x84 non établi (le
//                programme ne le lit pas), +0x8C les 22 drapeaux de porte, +0xA2 le prix,
//                +0xA6 la file d'attente la plus longue, +0xB0 le type d'objet, +0xB4 la forme du
//                sol, +0xB5 le genre d'outil, +0xBC un objet graphique de plus, +0xBF l'image du
//                catalogue, +0xC5 disponible ;
//   boutiques    0xD3C62, 107 octets : +0x22 le nom, +0x24 la famille, +0x26 l'image du
//                catalogue, +0x28 l'enseigne, +0x2A le nombre de cases, +0x2B les images,
//                +0x37 les cases, +0x49 le prix, +0x4D le prix d'achat, +0x4F le prix de vente,
//                +0x5D la quantité commandée, +0x5F la qualité, +0x66 disponible, +0x68 le
//                nombre possédé, +0x69 l'attrait ;
//   personnel    0xD35C0, 0x36 octets : +0x22 le nom, +0x24 le salaire, +0x2A l'image,
//                +0x2C l'état d'embauche ;
//   décors       0xCCA70, 0x38 octets : +0x22 le nom, +0x24 l'objet graphique, +0x28 le prix,
//                +0x2A l'outil, +0x35 disponible.
// (Les décalages sont donnés depuis le début de la fiche ; le programme, lui, les écrit toujours
//  sous la forme « adresse absolue + numéro × taille ».)
//
// **Les courbes du graphique des comptes**, 0xBA0C8, 4 octets par courbe, neuf courbes :
//   +0 octet  le sens (0 : vers le haut ; 1 : vers le bas)
//   +1 octet  la courbe est allumée
//   +2 octet  sa couleur, indice dans la petite palette 0xD7870
//   +3 octet  son nom, indice dans la table de chaînes [0xD7B84]
// Les boutons du graphique en portent le reflet : 0xBA0B0 (3 × 2 octets, l'échelle de temps) et
// 0xBA0B6 (9 × 2 octets, les courbes), chacun « enfoncé ou non » suivi de son intitulé.
// 0xD77A3 porte l'échelle choisie : 0 le mois, 1 l'année, 2 quatre ans.
//
// --- CE QUI N'EST PAS ÉTABLI ---------------------------------------------------------------------
//
// Ce que sont exactement les neuf séries du graphique (leurs noms vivent dans les fichiers de
// textes, pas dans le programme) ; le champ +0x1C d'un objet du parc, où 0x3B76E range le salaire
// validé ; le mot +0x2C0 des comptes, recalculé à la sortie de l'écran des finances ; le sens des
// drapeaux de porte 5, 7, 0xA, 0xB d'une attraction, que 0x19A9E ne traite pas ; et le rôle du mot
// +0x73 d'une attraction, où 0x19A9E range la case de la sortie.

// --- Accès à la mémoire ---------------------------------------------------------------------------
import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';
import { cameraCentreeSurLObjet } from './corrections.js';
import { noterLeCadrageSurUnObjet } from './vue-fluide.js';

const s16 = (v) => (v << 16) >> 16;
const s8 = (v) => (v << 24) >> 24;
const u16 = (v) => v & 0xFFFF;
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// Division entière du processeur : `idiv` tronque vers zéro, `div` travaille sur des entiers non
// signés. Le compilateur rend aussi la division par 64 par `cdq ; shl edx,6 ; sbb eax,edx ; sar
// eax,6`, qui est exactement `idiv 64` — d'où `parCase`.
const idiv = (a, b) => (a / b) | 0;
const div = (a, b) => Math.floor((a >>> 0) / (b >>> 0)) >>> 0;
const reste = (a, b) => ((a >>> 0) % (b >>> 0)) >>> 0;
const parCase = (v) => idiv(v, 0x40);

// Les variables locales de l'original qui doivent vivre en mémoire (les textes qu'on compose avant
// de les écrire) : on descend le pointeur de pile comme le fait son `enter`, et l'on rend l'adresse
// de la zone ainsi réservée. Le pointeur est remis en place à la fin.
function avecTampon(jeu, taille, corps) {
  const T = jeu.T;
  T.sauver();
  const avant = T.R.esp;
  const bas = ((avant >>> 0) - taille) >>> 0;
  T.R.esp = bas | 0;
  T.charger();
  try {
    return corps(bas);
  } finally {
    T.sauver();
    T.R.esp = avant;
    T.charger();
  }
}

// --- Les variables du jeu --------------------------------------------------------------------------
const MODE_AFFICHAGE = 0xDE5F6;      // mot : 1 = 320x200, 8 = 640x480
const EPAISSEUR = 0xD778A;           // octet : l'unité de l'interface, 2 en 320x200, 1 en 640x480
const ECRAN = 0xD6652;               // mot : le genre d'écran ouvert ; 0 = la vue du parc
const FENETRE = 0xB14E6;             // mot : la fenêtre ouverte
const ZONE_EN_COURS = 0xD381C;       // pointeur sur la zone cliquable retenue, -1 s'il n'y en a pas
const COMMANDES = 0xB7537;           // 6 octets par commande de bouton
const ETAT_DU_JEU = 0xB14D6;         // octet : 1 reprendre, 2 quitter, 3 recommencer (0x11C45)
const REDESSINER_LA_CARTE = 0xD666E; // mot : la vue du parc est à refaire
const OUTIL = 0xD6670;               // mot : l'outil de construction en cours (§ 6.7)
const OUTIL_SUSPENDU = 0xD6626;      // mot : l'outil mis de côté le temps de la fenêtre
const FENETRE_A_OUVRIR = 0xD6622;    // mot : l'argument de la routine différée 0xD3828
const ROUTINE_DIFFEREE = 0xD3828;    // pointeur : ce que la boucle fera en fin d'image
const OBJET_DESIGNE = 0xD6678;       // mot : l'objet du parc dont la fenêtre parle
const LIGNE_CHOISIE = 0xB14DE;       // mot : la ligne choisie dans une liste
const NOMBRE_DE_LIGNES = 0xD6628;    // mot : le nombre de lignes de la liste
const LISTE = 0xD382C;               // 14 octets par ligne ; +0 la fiche du catalogue (le nom)
const OBJET_DE_LA_LIGNE = 0xD3836;   // LISTE + 0x0A : l'objet du parc que la ligne décrit
const PAGE_DES_PENSEES = 0xB14ED;    // mot : la page de légende affichée sous les pensées
const PAGES_GAUCHE = 0xB14EF, PAGES_DROITE = 0xB14F0;  // octets : combien de légendes de chaque côté
const SENS_DU_TRI = 0xD779B;         // octet : 1, 2 ou 3, le critère de tri d'une liste

const ARTICLES = 0xCE9D8;            // le catalogue d'achat ouvert, 13 octets par article
const TAILLE_ARTICLE = 0xD;
const NOMBRE_D_ARTICLES = 0xD778E;   // octet
const ARTICLE_CHOISI = 0xD7787;      // octet signé

const ATTRACTIONS = 0xCCED0, TAILLE_ATTRACTION = 200;  // le catalogue des attractions
const BOUTIQUES = 0xD3C62, TAILLE_BOUTIQUE = 0x6B;     // le catalogue des boutiques
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;         // le catalogue du personnel
const DECORS = 0xCCA70, TAILLE_DECOR = 0x38;           // le catalogue des décors et installations

const GENRE_D_ATTRACTION = 0xD665A;  // mot : le genre choisi dans le catalogue des attractions
const GENRE_DE_BOUTIQUE = 0xD664A;   // mot : celui du catalogue des boutiques
const GENRE_DE_METIER = 0xD6644;     // mot : celui du catalogue du personnel
const GENRE_DE_DECOR = 0xD6646;      // mot : celui du catalogue des décors

const FICHE_DU_JOUEUR = 0xD3808;     // pointeur : +0x0A le solde, +0x0E les dépenses de l'image,
                                     // +0x12 le prêt, +0x37 la valeur bâtie
const COMPTES_DU_JOUEUR = 0xD3814;   // pointeur : les comptes du parc (§ 10.8)
const PARC_DU_JOUEUR = 0xD3818;      // pointeur : la fiche du parc
const PAS_DE_SIMULATION = 0xD3AFC;   // mot long : 1 000 pas par mois, 12 000 par an
const OBJETS_DU_PARC = 0xD3B10, TAILLE_OBJET = 200;
const FIN_DES_OBJETS = 0xD3B78;      // pointeur : la fin de la table des objets
const CARTE = 0xD3B08;               // pointeur : 4 octets par case, +2 la tuile
const FIGURES = 0xD3B38;             // pointeur : table de mots, figure -> objet graphique
const IMAGES_DU_SOL = 0xD3B90;       // pointeur : la banque des images de sol, 6 octets par image
const PALETTE_DU_PARC = 0xD3B8C;     // pointeur : la palette du parc
const OBJETS_GRAPHIQUES = 0xD3B80;   // pointeur : 8 octets par objet graphique
const MORCEAUX = 0xD3B7C;            // pointeur : 10 octets par morceau
const BANQUE_D_IMAGES = 0xD3BB8;     // pointeur : 6 octets par image
const DRAPEAUX_TRACEUR = 0xBECBC;    // mot : les drapeaux appliqués à la prochaine image (§ 6.5)

const TUILES = 0xB44D9;              // 4 octets par tuile ; le mot +0 dit ce qu'elle laisse passer
const VOISINES = 0xB4920;            // 4 mots signés : -0x40, 1, 0x40, -1
const LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;  // mots : 48/32 ou 24/16
const CASE_VISEE = 0xD6676;          // mot : la case sous le pointeur
const CASE_SAUVEE = 0xD662E, TUILE_SAUVEE = 0xD662A;     // la case que le fantôme a modifiée
const CASE_DU_CHEMIN = 0xD662C;      // mot : la case d'allée à laquelle l'entrée se raccorde

const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;            // mots signés
const APPUI_DROIT = 0xDE5A4, APPUI_GAUCHE = 0xDE5A6;
const DROIT_MAINTENU = 0xDE5AA, GAUCHE_MAINTENU = 0xDE5AC;

// Les couleurs de l'interface : onze teintes fixes en 0xD776B..0xD7783, recopiées par 0x5877B dans
// la petite palette 0xD7870 dont chaque courbe tire la sienne.
const COULEURS = 0xD7770;            // 0xD7770 est la couleur des traits et des textes
const PALETTE_DES_COURBES = 0xD7870;
const COURBES = 0xBA0C8;             // 4 octets par courbe
const BOUTONS_D_ECHELLE = 0xBA0B0;   // 2 octets par bouton d'échelle de temps
const BOUTONS_DE_COURBE = 0xBA0B6;   // 2 octets par bouton de courbe
const ECHELLE_DU_TEMPS = 0xD77A3;    // octet : 0 le mois, 1 l'année, 2 quatre ans
const TEINTES_DE_L_ECRAN = 0xB14DA;  // pointeur vers six couleurs (+5 : celle des textes)
const CHAINES_DU_GRAPHIQUE = 0xD7B84;  // pointeur : table de pointeurs de textes
const NOMS_DES_MOIS = 0xD7B90;         // pointeur : table de pointeurs de textes
const TEXTES = 0xD7BD0;                // pointeur : la grande table des textes de l'interface

const BULLES_GAUCHE = 0xCC818, BULLES_DROITE = 0xCC944;  // 0xF octets par bulle de pensée
const PENSEES_GAUCHE = 0xB7958, PENSEES_DROITE = 0xB79AD; // 5 octets par légende, 0 termine
const IMAGES_DES_BULLES = 0xB49F4;   // 0x24 octets par variante de bulle

// --- Les routines appelées ------------------------------------------------------------------------
const RECTANGLE = 0x1188C;           // (x, y, largeur, hauteur, couleur)
const CADRE_BISEAUTE = 0x3E149;      // (x0, y0, x1, y1, dedansBas, dedansHaut)
const TEXTE_CADRE = 0x3F3DA;         // (x0, x1, y, texte, couleur) : le texte d'un bouton
const TEXTE_CENTRE = 0x3F377;        // (x0, x1, y, texte, mode, couleur)
const ECRIRE_TEXTE = 0x3F49E;        // (x, y, texte, mode, couleur)
const ELEMENT = 0x408D3;             // (repère) : l'élément de mise en page qui suit ce repère
const BOUTON_VIVANT = 0x407A0;       // (commande, vivante) : allume ou éteint une zone cliquable
const LIGNE_BASSE = 0x949BC, LIGNE_HAUTE = 0x949DA;   // (x0, y0, x1, y1, couleur)
const JAUGE_BASSE = 0x80E88, JAUGE_HAUTE = 0x80F34;   // (x, y, texte, couleur) : la petite police
const TRACER_IMAGE = 0x5EC9C, TRACER_IMAGE_MARQUEE = 0x55BD4;  // (x, y, image)
const DESSINER_OBJET = 0x209B5;      // (objet graphique, x, y)
const FORMATER = 0x7F652;            // sprintf
const STRLEN = 0x7E822;
const TRIER = 0x811AA;               // qsort(base, nombre, taille, comparaison)
const COMPARER_LES_PRIX = 0x6A83E;   // la comparaison du tri des catalogues d'achat
const COMPARER_LES_LIGNES = 0x3F2C5; // celle du tri d'une liste
const CHOISIR_COULEUR = 0x80250;     // (palette, rouge, vert, bleu) : la couleur la plus proche
const HASARD = 0x18B92;              // le générateur de hasard, 0 à 32 767 (§ 10.1)
const VALEUR_ABSOLUE = 0x80BF2;
const ANIMER_LES_PENSEES = 0x4091A;
const FERMER_LA_FENETRE = 0x40D79;
const OUVRIR_UNE_FENETRE = 0x35F21;  // la routine différée qui ouvre une fenêtre
const OUVRIR_L_ENTREPOT = 0x798D7, OUVRIR_LES_RECHERCHES = 0x515A0;  // deux autres routines différées
const PREMIER_OBJET_DU_TYPE = 0x204B9;  // (cellule, type) : le premier objet de ce type, ou 0
const POSER_SUR_LA_CASE = 0x185C1;   // (objet, x, y) en 256es de case
const DEPLACER = 0x18A44;            // (objet, x, y) en 256es de case
const OUBLIER_LE_CHEMIN = 0x2BCEE;   // (case) : défait le raccord d'allée d'une case
const RACCORDER = 0x28E5A;           // (sol, case, 1) : refait le raccord d'allée
const RENDRE_L_OUTIL = 0x31D32;      // remet l'outil de construction en main
const PREPARER_LA_CASE = 0x205D7;    // (case) : vide la case avant d'y bâtir
const RENVOYER_L_EMPLOYE = 0x325DA;  // (employé) : le renvoi (voyous.js)
const FERMER_L_ATTRACTION = 0x31668; // (attraction) : la ferme et démonte ses wagons
const MESSAGE = 0x78943;             // (numéro, valeur) : la bulle du conseiller
const PRIX_MOYEN_DES_ATTRACTIONS = 0x6804A;
const OUVRIR_LA_BOURSE = 0x4B11E, OUVRIR_LE_RELEVE_BANCAIRE = 0x77A55;

// Les deux traceurs : en basse résolution l'écran entier est recopié à chaque tour, en haute
// seuls les blocs marqués le sont (ecran.js), d'où le second.
const tracer = (jeu) => (mot(jeu, MODE_AFFICHAGE) & 1) ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE;
const ligne = (jeu) => (mot(jeu, MODE_AFFICHAGE) & 1) ? LIGNE_BASSE : LIGNE_HAUTE;
const jauge = (jeu) => (mot(jeu, MODE_AFFICHAGE) & 1) ? JAUGE_BASSE : JAUGE_HAUTE;

// Les formats de 0x7F652, dans le fichier.
const F_NOM_ET_NOMBRE = 0xB0324;     // « %s:%d »
const F_TEXTE = 0xB032A;             // « %s »
const F_NOMBRE = 0xB032D;            // « %d »

const objetDuParc = (jeu, n) => (long(jeu, OBJETS_DU_PARC) + TAILLE_OBJET * u16(n)) >>> 0;
const tuileDeLaCase = (jeu, c) => octet(jeu, long(jeu, CARTE) + 4 * s16(c) + 2);
const poserLaTuile = (jeu, c, v) => poserOctet(jeu, long(jeu, CARTE) + 4 * s16(c) + 2, v);
// Ce que laisse passer une tuile : le mot +0 de sa fiche de 4 octets.
const passageDeLaTuile = (jeu, tuile) => mot(jeu, TUILES + 4 * tuile);
const figure = (jeu, n) => mot(jeu, (long(jeu, FIGURES) + 2 * n) >>> 0);

// Les quatre mots de la souris remis à zéro : l'écran vient de consommer le clic.
function rendreLesBoutons(jeu) {
  poserMot(jeu, APPUI_DROIT, 0);
  poserMot(jeu, DROIT_MAINTENU, 0);
  poserMot(jeu, APPUI_GAUCHE, 0);
  poserMot(jeu, GAUCHE_MAINTENU, 0);
}

// =====================================================================================================
// 0x3B76E — exécuter la commande du bouton visé.
//
// 0x3B011 a retenu une zone cliquable (0xD381C) ; son octet +8 donne le numéro de la commande, de 0
// à 0x28. Les commandes 0xD et 0x18, et tout numéro au-delà de 0x28, ne font rien.
//
// Plusieurs commandes se lisent différemment selon l'écran ouvert (0xD6652) : c'est le même bouton
// « + » qui rallonge une file d'attente, augmente un salaire, un prix de vente ou le prix du billet.
// Les écrans concernés :
//
//   0x08 les pensées      0x14 la fiche d'une attraction   0x16 la fiche d'une boutique
//   0x1C la fiche d'un employé                             0x1E, 0x20, 0x22 les trois listes
//   0x23 la fiche d'un jeu d'adresse                       0x36 acheter une attraction
//   0x38 les finances     0x3A acheter une boutique        0x3C embaucher   0x3E acheter un décor
//
// Une commande qui lève le drapeau de sortie referme la fenêtre : l'écran revient à la vue du parc
// (0xD6652 = 0), la carte est redessinée et 0x40D79 quitte l'écran plein.
export function executerLaCommande(jeu) {
  if (long(jeu, ZONE_EN_COURS) === 0xFFFFFFFF) return;
  let fermer = false;
  const ecran = () => mot(jeu, ECRAN);
  const commande = octet(jeu, long(jeu, ZONE_EN_COURS) + 8);
  // L'original calcule ici la fiche de la commande (0xB7537 + 6 × numéro) sans jamais la relire.
  const objet = () => objetDuParc(jeu, mot(jeu, OBJET_DESIGNE));
  // Le genre d'une boutique, tel que l'objet le porte : déjà multiplié par 107.
  const genreDeLObjet = () => mot(jeu, objet() + 0x16);
  const article = () => (ARTICLES + TAILLE_ARTICLE * octetSigne(jeu, ARTICLE_CHOISI)) | 0;

  switch (commande) {
    // --- 0 et 1 : descendre et monter d'une ligne ------------------------------------------------
    // Sur les pensées, la page de légende ; sur une liste, la ligne choisie.
    case 0x00:
      if (ecran() < 0x1E) {
        if (ecran() === 8 && octetSigne(jeu, PAGES_GAUCHE) > motSigne(jeu, PAGE_DES_PENSEES)
          && octetSigne(jeu, PAGES_DROITE) > motSigne(jeu, PAGE_DES_PENSEES)) {
          poserMot(jeu, PAGE_DES_PENSEES, mot(jeu, PAGE_DES_PENSEES) + 1);
        }
      } else if (estUneListe(jeu) && motSigne(jeu, LIGNE_CHOISIE) < mot(jeu, NOMBRE_DE_LIGNES) - 1) {
        poserMot(jeu, LIGNE_CHOISIE, mot(jeu, LIGNE_CHOISIE) + 1);
      }
      break;
    case 0x01:
      if (ecran() < 0x1E) {
        if (ecran() === 8 && motSigne(jeu, PAGE_DES_PENSEES) > 0) {
          poserMot(jeu, PAGE_DES_PENSEES, mot(jeu, PAGE_DES_PENSEES) - 1);
        }
      } else if (estUneListe(jeu) && motSigne(jeu, LIGNE_CHOISIE) > 0) {
        poserMot(jeu, LIGNE_CHOISIE, mot(jeu, LIGNE_CHOISIE) - 1);
      }
      break;

    // --- 2 : acheter l'article choisi du catalogue des attractions --------------------------------
    // L'outil de construction devient celui de l'article ; une attraction dont le mot +0xB0 vaut 6
    // (un kiosque) prend l'outil 10, celui qui pose une entrée.
    case 0x02: {
      poserMot(jeu, GENRE_D_ATTRACTION, octet(jeu, article() + 0x0A));
      const fiche = (ATTRACTIONS + TAILLE_ATTRACTION * mot(jeu, GENRE_D_ATTRACTION)) | 0;
      if (mot(jeu, fiche + 0xB0) === 6) poserMot(jeu, OUTIL, 0x0A);
      else poserMot(jeu, OUTIL, mot(jeu, fiche + 0xB5));
      fermer = true;
      break;
    }

    // --- 3 et 0x28 : valider et fermer ------------------------------------------------------------
    // Sur la fiche d'un employé, le salaire réglé devient le salaire retenu (+0x1C) ; sur les
    // finances, le prix du billet est noté dans les comptes et l'attrait du prix recalculé ; sur un
    // catalogue d'achat, l'article choisi passe en main, s'il est abordable.
    case 0x03:
    case 0x28:
      fermer = true;
      poserMot(jeu, OUTIL, mot(jeu, OUTIL_SUSPENDU));
      if (ecran() < 0x36) {
        if (ecran() >= 0x16) {
          if (ecran() === 0x1C) poserMot(jeu, objet() + 0x1C, mot(jeu, objet() + 0x9A));
          break;
        }
        if (ecran() !== 8) break;
        poserOctet(jeu, 0xD779F, 0);   // les pensées : le compteur de la bulle en cours
        break;
      }
      if (ecran() === 0x36) {
        // Une attraction : l'outil vient de l'article, sauf pour les genres 0xAF, 0xB0 et 0x108,
        // dont l'outil est le 5, celui qui pose une attraction à voie.
        if ((octet(jeu, article() + 0x0B) & 1) === 0) {
          poserMot(jeu, GENRE_D_ATTRACTION, octet(jeu, article() + 0x0A));
          const nom = mot(jeu, (ATTRACTIONS + TAILLE_ATTRACTION * mot(jeu, GENRE_D_ATTRACTION) + 0x22) | 0);
          if (nom === 0xAF || nom === 0xB0 || nom === 0x108) poserMot(jeu, OUTIL, mot(jeu, article() + 8));
          else poserMot(jeu, OUTIL, 5);
        }
      } else if (ecran() === 0x38) {
        // Les finances : le prix du billet est noté, et l'attrait du prix recalculé — mais quand il
        // n'a pas changé, le programme se contente de le recopier.
        const comptes = long(jeu, COMPTES_DU_JOUEUR), parc = long(jeu, PARC_DU_JOUEUR);
        if (mot(jeu, comptes + 0x2CE) === mot(jeu, parc + 0x1D)) {
          poserMot(jeu, comptes + 0x2CE, mot(jeu, parc + 0x1D));
        } else {
          poserMot(jeu, comptes + 0x2CE, mot(jeu, parc + 0x1D));
          const moyen = jeu.appeler(PRIX_MOYEN_DES_ATTRACTIONS);
          poserMot(jeu, comptes + 0x2C0, idiv(Math.imul(moyen, 100), octet(jeu, parc + 0x48)));
        }
      } else if (ecran() === 0x3A) {
        if ((octet(jeu, article() + 0x0B) & 1) === 0) {
          poserMot(jeu, OUTIL, mot(jeu, article() + 8));
          poserMot(jeu, GENRE_DE_BOUTIQUE, octet(jeu, article() + 0x0A));
        }
      } else if (ecran() === 0x3C) {
        if ((octet(jeu, article() + 0x0B) & 1) === 0) {
          poserMot(jeu, OUTIL, mot(jeu, article() + 8));
          poserMot(jeu, GENRE_DE_METIER, octet(jeu, article() + 0x0A));
        }
      } else if (ecran() === 0x3E) {
        if ((octet(jeu, article() + 0x0B) & 1) === 0) {
          poserMot(jeu, OUTIL, mot(jeu, article() + 8));
          poserMot(jeu, GENRE_DE_DECOR, octet(jeu, article() + 0x0A));
        }
      }
      break;

    // --- 4 : annuler et fermer --------------------------------------------------------------------
    case 0x04:
      fermer = true;
      poserMot(jeu, OUTIL, mot(jeu, OUTIL_SUSPENDU));
      if (ecran() === 0x1C) {
        poserMot(jeu, objet() + 0x9A, mot(jeu, objet() + 0x1C));   // le salaire retrouve sa valeur
      } else if (ecran() === 0x38) {
        poserMot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x1D, mot(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x2CE));
      }
      break;

    // --- 5 à 7 : quitter la partie ; 8 la bourse, 9 le relevé bancaire (carte-du-parc.js) -------
    case 0x05: poserOctet(jeu, ETAT_DU_JEU, 2); break;   // quitter
    case 0x06: poserOctet(jeu, ETAT_DU_JEU, 3); break;   // recommencer
    case 0x07: poserOctet(jeu, ETAT_DU_JEU, 1); break;   // reprendre
    case 0x08: jeu.appeler(OUVRIR_LA_BOURSE); break;   // l'écran de la bourse
    case 0x09: jeu.appeler(OUVRIR_LE_RELEVE_BANCAIRE); poserMot(jeu, ECRAN, 0x40); break;

    // --- 0x0A : « vendre » l'objet de la fiche, c'est-à-dire renvoyer l'employé (0x325DA) --------
    case 0x0A:
      jeu.appeler(RENVOYER_L_EMPLOYE, objet());
      poserMot(jeu, OBJET_DESIGNE, 0);
      poserMot(jeu, OUTIL, mot(jeu, OUTIL_SUSPENDU));
      fermer = true;
      break;

    // --- 0x0B : ouvrir la fiche de la ligne choisie d'une liste -----------------------------------
    // Le personnel donne une fenêtre par métier (état d'embauche 2 amuseur, 8 mécanicien,
    // 0x16 agent d'entretien, 0x34 gardien) ; une boutique de famille 8 est un jeu d'adresse.
    case 0x0B: {
      if (mot(jeu, NOMBRE_DE_LIGNES) === 0) break;
      poserLong(jeu, ROUTINE_DIFFEREE, OUVRIR_UNE_FENETRE);
      const choisi = long(jeu, (OBJET_DE_LA_LIGNE + 0x0E * motSigne(jeu, LIGNE_CHOISIE)) | 0);
      poserMot(jeu, OBJET_DESIGNE, idiv(choisi - long(jeu, OBJETS_DU_PARC), TAILLE_OBJET));
      if (ecran() === 0x1E) {
        const embauche = mot(jeu, (METIERS + TAILLE_METIER * octet(jeu, choisi + 0x59) + 0x2C) | 0);
        if (embauche === 2) poserMot(jeu, FENETRE_A_OUVRIR, 8);
        else if (embauche === 8) poserMot(jeu, FENETRE_A_OUVRIR, 9);
        else if (embauche === 0x16) poserMot(jeu, FENETRE_A_OUVRIR, 7);
        else if (embauche === 0x34) poserMot(jeu, FENETRE_A_OUVRIR, 0x0A);
      } else if (ecran() === 0x20) {
        poserMot(jeu, FENETRE_A_OUVRIR, 0x0D);
      } else if (ecran() === 0x22) {
        if (octet(jeu, (BOUTIQUES + mot(jeu, choisi + 0x16) + 0x24) | 0) === 8) poserMot(jeu, FENETRE_A_OUVRIR, 0x11);
        else poserMot(jeu, FENETRE_A_OUVRIR, 0x0C);
      }
      break;
    }

    // --- 0x0C : changer le critère de tri d'une liste ---------------------------------------------
    // Le tri passé, on retrouve l'objet de la fiche pour garder sa ligne choisie.
    case 0x0C: {
      poserOctet(jeu, SENS_DU_TRI, octet(jeu, SENS_DU_TRI) + 1);
      if (octet(jeu, SENS_DU_TRI) === 4) poserOctet(jeu, SENS_DU_TRI, 1);
      jeu.appeler(TRIER, LISTE, mot(jeu, NOMBRE_DE_LIGNES), 0x0E, COMPARER_LES_LIGNES);
      // Le type d'objet attendu selon la liste. Hors des trois listes, l'original lit ici une
      // variable qu'il n'a pas écrite ; aucun autre écran ne porte ce bouton.
      let type = 0;
      if (ecran() === 0x1E) type = 8;
      else if (ecran() === 0x20) type = 4;
      else if (ecran() === 0x22) type = 0x0A;
      if (mot(jeu, OBJET_DESIGNE) !== 0 && octet(jeu, objet() + 4) === type) {
        for (let k = 0; s16(k) < mot(jeu, NOMBRE_DE_LIGNES); k++) {
          if (objet() === long(jeu, (OBJET_DE_LA_LIGNE + 0x0E * s16(k)) | 0)) poserMot(jeu, LIGNE_CHOISIE, k);
        }
      }
      break;
    }

    // --- 0x0E : centrer la vue du parc sur l'objet ------------------------------------------------
    // Depuis la fiche d'une attraction (écran 0x14), la vue se porte sur son genre ; depuis une
    // liste, sur la ligne choisie. Le cadrage met la case au milieu de la vue.
    case 0x0E:
      if (ecran() < 0x1C) {
        if (ecran() < 0x14) break;
        if (ecran() === 0x14) {
          // La fiche d'une attraction : le conseiller nomme le genre avant que la vue s'y porte.
          if (mot(jeu, OBJET_DESIGNE) === 0) break;
          const o = objet();
          jeu.appeler(0x5C04F, 2, idiv(mot(jeu, o + 0x16), TAILLE_ATTRACTION) & 0xFF);
          centrerSurLObjet(jeu, o);
          poserMot(jeu, OUTIL, mot(jeu, OUTIL_SUSPENDU));
          fermer = true;
          break;
        }
        if (ecran() !== 0x16) break;
      } else if (ecran() > 0x1C) {
        // Les trois listes : l'objet de la ligne choisie devient l'objet de la fiche.
        if (ecran() < 0x20) {
          if (ecran() !== 0x1E) break;
        } else if (ecran() > 0x20 && ecran() !== 0x22) break;
        if (mot(jeu, NOMBRE_DE_LIGNES) === 0) break;
        poserMot(jeu, OBJET_DESIGNE,
          idiv(long(jeu, (OBJET_DE_LA_LIGNE + 0x0E * motSigne(jeu, LIGNE_CHOISIE)) | 0) - long(jeu, OBJETS_DU_PARC),
            TAILLE_OBJET));
        poserMot(jeu, LIGNE_CHOISIE, 0);
      }
      if (mot(jeu, OBJET_DESIGNE) !== 0) {
        centrerSurLObjet(jeu, objet());
        poserMot(jeu, OUTIL, mot(jeu, OUTIL_SUSPENDU));
        fermer = true;
      }
      break;

    // --- 0x0F à 0x12 : parcourir un catalogue d'achat ---------------------------------------------
    // Le catalogue des attractions (écran 0x36) rallume à chaque pas le bouton d'achat 2.
    case 0x0F:
      poserOctet(jeu, ARTICLE_CHOISI, 0);
      if (ecran() === 0x36) jeu.appeler(0x407FD);
      break;
    case 0x10:
      if (octetSigne(jeu, ARTICLE_CHOISI) > 0) poserOctet(jeu, ARTICLE_CHOISI, octet(jeu, ARTICLE_CHOISI) - 1);
      if (ecran() === 0x36) jeu.appeler(0x407FD);
      break;
    case 0x11:
      if (octetSigne(jeu, ARTICLE_CHOISI) < octetSigne(jeu, NOMBRE_D_ARTICLES) - 1) {
        poserOctet(jeu, ARTICLE_CHOISI, octet(jeu, ARTICLE_CHOISI) + 1);
      }
      if (ecran() === 0x36) jeu.appeler(0x407FD);
      break;
    case 0x12:
      poserOctet(jeu, ARTICLE_CHOISI, octetSigne(jeu, NOMBRE_D_ARTICLES) - 1);
      if (ecran() === 0x36) jeu.appeler(0x407FD);
      break;

    // --- 0x13 et 0x14 : le bouton « − » et le bouton « + » ----------------------------------------
    // Écran 0x14 : la file d'attente d'une attraction, de 2 au maximum de son genre.
    // Écran 0x16 et 0x23 : le prix de vente d'une boutique, de 0 à 998, par pas de 1.
    // Écran 0x1C : le salaire d'un employé, par pas de 2, du minimum de son métier à 6 000.
    // Écran 0x38 : le prix du billet, par pas de 2, de 0 à 2 000.
    case 0x13:
      if (ecran() < 0x1C) {
        if (ecran() >= 0x14) {
          if (ecran() === 0x14) {
            if (mot(jeu, objet() + 0x26) > 1) poserMot(jeu, objet() + 0x26, mot(jeu, objet() + 0x26) - 1);
          } else if (ecran() === 0x16) {
            const p = (BOUTIQUES + genreDeLObjet() + 0x4F) | 0;
            poserMot(jeu, p, mot(jeu, p) - (motSigne(jeu, p) !== 0 ? 1 : 0));
          }
        }
      } else if (ecran() === 0x1C) {
        baisserLeSalaire(jeu, objet());
      } else if (ecran() > 0x22) {
        if (ecran() === 0x23) {
          const p = (BOUTIQUES + genreDeLObjet() + 0x4F) | 0;
          poserMot(jeu, p, mot(jeu, p) - (motSigne(jeu, p) !== 0 ? 1 : 0));
        } else if (ecran() === 0x38) {
          const p = long(jeu, PARC_DU_JOUEUR) + 0x1D;
          if (mot(jeu, p) < 3) poserMot(jeu, p, 0);
          else poserMot(jeu, p, mot(jeu, p) - 2);
        }
      }
      break;
    case 0x14:
      if (ecran() < 0x1C) {
        if (ecran() >= 0x14) {
          if (ecran() === 0x14) {
            const o = objet();
            if (mot(jeu, o + 0x26) < motSigne(jeu, (ATTRACTIONS + mot(jeu, o + 0x16) + 0xA6) | 0)) {
              poserMot(jeu, o + 0x26, mot(jeu, o + 0x26) + 1);
            }
          } else if (ecran() === 0x16) {
            const p = (BOUTIQUES + genreDeLObjet() + 0x4F) | 0;
            poserMot(jeu, p, mot(jeu, p) + (mot(jeu, p) < 0x3E6 ? 1 : 0));
          }
        }
      } else if (ecran() === 0x1C) {
        const o = objet();
        if (mot(jeu, o + 0x9A) < 5999) poserMot(jeu, o + 0x9A, mot(jeu, o + 0x9A) + 2);
        else poserMot(jeu, o + 0x9A, 6000);
      } else if (ecran() > 0x22) {
        if (ecran() === 0x23) {
          const p = (BOUTIQUES + genreDeLObjet() + 0x4F) | 0;
          poserMot(jeu, p, mot(jeu, p) + (mot(jeu, p) < 0x3E6 ? 1 : 0));
        } else if (ecran() === 0x38) {
          const p = long(jeu, PARC_DU_JOUEUR) + 0x1D;
          if (mot(jeu, p) < 0x7CE) poserMot(jeu, p, mot(jeu, p) + 2);
          else poserMot(jeu, p, 2000);
        }
      }
      break;

    // --- 0x15 et 0x16 : rembourser et emprunter, par tranches de 50 000 ---------------------------
    // Le plafond du prêt : le nombre d'attractions du parc (+0x62) fois le mot long +0x66, plus
    // 50 000.
    case 0x15: {
      const fiche = long(jeu, FICHE_DU_JOUEUR);
      if (longSigne(jeu, fiche + 0x12) >= 50000) {
        poserLong(jeu, fiche + 0x12, longSigne(jeu, fiche + 0x12) - 50000);
        jeu.appeler(MESSAGE, 9, -50000);
      }
      break;
    }
    case 0x16: {
      const fiche = long(jeu, FICHE_DU_JOUEUR), parc = long(jeu, PARC_DU_JOUEUR);
      const plafond = (Math.imul(mot(jeu, parc + 0x62), longSigne(jeu, parc + 0x66)) + 50000) | 0;
      if (plafond > longSigne(jeu, fiche + 0x12)) {
        poserLong(jeu, fiche + 0x12, longSigne(jeu, fiche + 0x12) + 50000);
        jeu.appeler(MESSAGE, 0x0A, 50000);
      }
      break;
    }

    // --- 0x17 : choisir directement l'une des cinq cases d'un catalogue d'achat --------------------
    // Les cinq cases se suivent dans la table de mise en page à partir du repère 0x83 ; on cherche
    // celle dont le bord gauche est celui de la zone cliquée, ce qui donne son écart (-2 à +2) par
    // rapport à l'article du milieu.
    case 0x17: {
      let e = (jeu.appeler(ELEMENT, 0x83) + 0x42) | 0;
      let vise = -1;
      for (let k = -2; k < 3; k++) {
        if (motSigne(jeu, long(jeu, ZONE_EN_COURS)) === motSigne(jeu, e + 1)) {
          vise = s8(octetSigne(jeu, ARTICLE_CHOISI) + k);
          break;
        }
        e = (e + 0x0B) | 0;
      }
      if (vise >= 0 && vise < octetSigne(jeu, NOMBRE_D_ARTICLES)
        && (octet(jeu, (ARTICLES + TAILLE_ARTICLE * vise + 0x0B) | 0) & 1) === 0) {
        fermer = true;
        const a = (ARTICLES + TAILLE_ARTICLE * vise) | 0;
        poserMot(jeu, OUTIL, mot(jeu, a + 8));
        if (ecran() < 0x3A) {
          if (ecran() === 0x36) {
            poserMot(jeu, GENRE_D_ATTRACTION, octet(jeu, a + 0x0A));
            const nom = mot(jeu, (ATTRACTIONS + TAILLE_ATTRACTION * mot(jeu, GENRE_D_ATTRACTION) + 0x22) | 0);
            if (nom !== 0xAF && nom !== 0xB0 && nom !== 0x108) poserMot(jeu, OUTIL, 5);
          }
        } else if (ecran() === 0x3A) {
          poserMot(jeu, GENRE_DE_BOUTIQUE, octet(jeu, a + 0x0A));
        } else if (ecran() > 0x3B) {
          if (ecran() < 0x3D) poserMot(jeu, GENRE_DE_METIER, octet(jeu, a + 0x0A));
          else if (ecran() === 0x3E) poserMot(jeu, GENRE_DE_DECOR, octet(jeu, a + 0x0A));
        }
      }
      break;
    }

    // --- 0x19 à 0x1B : ouvrir les trois listes ----------------------------------------------------
    case 0x19: poserLong(jeu, ROUTINE_DIFFEREE, OUVRIR_UNE_FENETRE); poserMot(jeu, FENETRE_A_OUVRIR, 0x0E); break;
    case 0x1A: poserLong(jeu, ROUTINE_DIFFEREE, OUVRIR_UNE_FENETRE); poserMot(jeu, FENETRE_A_OUVRIR, 0x0F); break;
    case 0x1B: poserLong(jeu, ROUTINE_DIFFEREE, OUVRIR_UNE_FENETRE); poserMot(jeu, FENETRE_A_OUVRIR, 0x10); break;

    // --- 0x1C à 0x1F : la marchandise d'une boutique ----------------------------------------------
    // Le mot +0x53 de la fiche du genre est le prix d'achat (de 0 à 4 000, par pas de 400) et
    // l'octet +0x63 la quantité commandée (de 1 à 100).
    case 0x1C: {
      const p = (BOUTIQUES + genreDeLObjet() + 0x5D) | 0;
      poserOctet(jeu, p, octet(jeu, p) - (octet(jeu, p) > 1 ? 1 : 0));
      break;
    }
    case 0x1D: {
      const p = (BOUTIQUES + genreDeLObjet() + 0x5D) | 0;
      poserOctet(jeu, p, octet(jeu, p) + (octet(jeu, p) < 100 ? 1 : 0));
      break;
    }
    case 0x1E: {
      const p = (BOUTIQUES + genreDeLObjet() + 0x4D) | 0;
      poserMot(jeu, p, mot(jeu, p) - (mot(jeu, p) >= 0x191 ? 400 : 0));
      break;
    }
    case 0x1F: {
      const p = (BOUTIQUES + genreDeLObjet() + 0x4D) | 0;
      poserMot(jeu, p, mot(jeu, p) + (mot(jeu, p) < 4000 ? 400 : 0));
      break;
    }

    // --- 0x20 : fermer l'attraction de la fiche ---------------------------------------------------
    // Le kiosque d'entrée (+0x49) passe en main : sa case est notée, la tuile sauvée vaut 1, et
    // l'outil 0x0B laisse le joueur reposer l'entrée où il veut.
    case 0x20: {
      const comptes = long(jeu, COMPTES_DU_JOUEUR);
      const entree = objetDuParc(jeu, mot(jeu, objet() + 0x49));
      poserMot(jeu, comptes + 0x2BC, (octet(jeu, entree + 9) << 6) + octet(jeu, entree + 7));
      poserMot(jeu, comptes + 0x2BA, 1);
      poserMot(jeu, comptes + 0x2D0, mot(jeu, objet() + 0x49));
      jeu.appeler(FERMER_L_ATTRACTION, objet());
      poserMot(jeu, OUTIL, 0x0B);
      fermer = true;
      break;
    }

    // --- 0x21 et 0x22 : la qualité d'une boutique, de 0 à 4 ---------------------------------------
    case 0x21:
      if (mot(jeu, OBJET_DESIGNE) !== 0) {
        const p = (BOUTIQUES + genreDeLObjet() + 0x5F) | 0;
        if (octet(jeu, p) !== 0) poserOctet(jeu, p, octet(jeu, p) - 1);
      }
      break;
    case 0x22:
      if (mot(jeu, OBJET_DESIGNE) !== 0) {
        const p = (BOUTIQUES + genreDeLObjet() + 0x5F) | 0;
        if (octet(jeu, p) < 4) poserOctet(jeu, p, octet(jeu, p) + 1);
      }
      break;

    // --- 0x23 et 0x24 : l'entrepôt (écran 0x52) et le département des recherches (écran 0x4E) ---
    case 0x23: poserLong(jeu, ROUTINE_DIFFEREE, OUVRIR_L_ENTREPOT); poserMot(jeu, FENETRE_A_OUVRIR, 0); break;
    case 0x24: poserLong(jeu, ROUTINE_DIFFEREE, OUVRIR_LES_RECHERCHES); poserMot(jeu, FENETRE_A_OUVRIR, 0); break;

    default: break;   // 0x0D, 0x18 et au-delà de 0x28 : la commande ne fait rien
  }

  if (fermer) {
    poserMot(jeu, ECRAN, 0);
    poserMot(jeu, REDESSINER_LA_CARTE, 1);
    jeu.appeler(FERMER_LA_FENETRE);
    // L'original relit ici l'octet +0x10 de la fiche de la fenêtre sans rien en faire.
  }
}

// Les écrans qui portent une liste : 0x1E le personnel, 0x20 les attractions, 0x22 les boutiques.
// L'original les reconnaît par une cascade de comparaisons qui laisse aussi passer 0x1F et 0x21,
// numéros qu'aucune fenêtre ne porte.
function estUneListe(jeu) {
  const e = mot(jeu, ECRAN);
  return e < 0x1F || (e > 0x1F && (e < 0x21 || e === 0x22));
}

// Le salaire baisse de 2, sans descendre au salaire d'embauche du métier : celui du catalogue pour
// un amuseur (état 2), le minimum du parc pour le mécanicien (+0x617 des comptes) et pour l'agent
// d'entretien (+0x615). Le gardien (état 0x34) n'a pas de bouton « − » qui marche : son état ne
// figure pas dans la cascade.
function baisserLeSalaire(jeu, o) {
  const metier = (METIERS + TAILLE_METIER * octet(jeu, o + 0x59)) | 0;
  const embauche = mot(jeu, metier + 0x2C);
  const comptes = long(jeu, COMPTES_DU_JOUEUR);
  let minimum = null;
  if (embauche === 2) minimum = mot(jeu, metier + 0x24);
  else if (embauche === 8) minimum = mot(jeu, comptes + 0x617);
  else if (embauche === 0x16) minimum = mot(jeu, comptes + 0x615);
  if (minimum !== null && minimum + 1 < mot(jeu, o + 0x9A)) {
    poserMot(jeu, o + 0x9A, mot(jeu, o + 0x9A) - 2);
  }
}

// Porter la vue du parc sur un objet : sa case, moins la moitié de ce que l'écran montre.
// La hauteur visible se compte sur 480 lignes en haute résolution, 400 en basse. (La vue fait 640 sur
// 480, plus en grande vue : grande-vue.js.) Réglage corrigerLeCadrageSurUnObjet allumé, la caméra qui
// met l'objet au milieu de la vue du parc (corrections.js) ; la page est prévenue (vue-fluide.js).
function centrerSurLObjet(jeu, o) {
  const corrigee = cameraCentreeSurLObjet(jeu, o);
  if (corrigee) {
    poserMot(jeu, 0xD667A, corrigee[0]);
    poserMot(jeu, 0xD6666, corrigee[1]);
  } else {
    poserMot(jeu, 0xD667A, octet(jeu, o + 7) - idiv(idiv(largeurDeLaVue(jeu), mot(jeu, LARGEUR_TUILE)), 2));
    const hauteur = (mot(jeu, MODE_AFFICHAGE) & 1) ? 400 : hauteurDeLaVue(jeu);
    poserMot(jeu, 0xD6666, octet(jeu, o + 9)
      - idiv(idiv(mot(jeu, HAUTEUR_TUILE) + hauteur - 1, mot(jeu, HAUTEUR_TUILE)), 2));
  }
  noterLeCadrageSurUnObjet(jeu, o);
  jeu.appeler(0x184DF);
}

// =====================================================================================================
// 0x5877B — le graphique des comptes de l'écran des finances.
//
// Appelée par 0x3A569 (ecrans-achat.js) avec (0x1FC, 0xC4, 0xAA, 0x1E, 1) : le graphique se dessine
// de droite à gauche depuis l'abscisse 0x1FC, sur 0xAA pixels de haut au-dessus de l'ordonnée 0xC4,
// un point tous les 0x1E pixels, et l'on veut ses boutons.
//
// Neuf courbes possibles (0xBA0C8), dont seules les allumées sont tracées. Chacune se lit dans les
// comptes du joueur, qui gardent douze valeurs par échelle de temps et par série ; l'échelle
// choisie (0xD77A3) donne aussi le pas : 1 000 pas de simulation pour un mois, 12 000 pour une
// année, 48 000 pour quatre. Un point n'est tracé que si le temps qu'il représente est déjà écoulé.
//
// L'échelle verticale s'ajuste à chaque courbe : le plus haut et le plus bas des douze points. Deux
// cas particuliers du programme d'origine : quand tous les points sont égaux, le maximum est doublé
// et le minimum ramené à zéro ; et quand l'écart reste nul, il vaut 1 pour éviter la division par
// zéro. Les courbes de sens 1 (0xBA0C8 +0) se lisent à l'envers, vers le bas.
//
// À droite de chaque courbe, son nom et sa dernière valeur ; en dessous, les douze repères de temps
// — le nom du mois, l'année, ou l'année arrondie à un multiple de quatre.
export function dessinerLeGraphique(jeu, x, yBas, hauteur, pas, avecBoutons) {
  poserOctet(jeu, 0xD7870, octet(jeu, 0xD7773));
  poserOctet(jeu, 0xD7871, octet(jeu, 0xD777E));
  poserOctet(jeu, 0xD7874, octet(jeu, 0xD7775));
  poserOctet(jeu, 0xD7872, octet(jeu, 0xD777C));
  poserOctet(jeu, 0xD7875, octet(jeu, 0xD777A));
  poserOctet(jeu, 0xD7876, octet(jeu, 0xD776B));
  poserOctet(jeu, 0xD7878, jeu.appeler(CHOISIR_COULEUR, long(jeu, PALETTE_DU_PARC), 0x3F, 0x23, 0x23));
  poserOctet(jeu, 0xD7873, octet(jeu, 0xD776F));
  poserOctet(jeu, 0xD787A, octet(jeu, 0xD7783));
  poserOctet(jeu, 0xD7879, octet(jeu, 0xD7772));
  poserOctet(jeu, 0xD7877, octet(jeu, 0xD777D));

  // Le cadre : le trait du bas et celui du haut, du premier repère jusqu'au-delà des intitulés.
  const gauche = s16(x - Math.imul(pas, 0x0B) - 8);
  jeu.appeler(ligne(jeu), gauche, s16(yBas + 2), s16(x + 0x56), s16(yBas + 2), octet(jeu, COULEURS));
  jeu.appeler(ligne(jeu), gauche, s16(yBas - hauteur - 2), s16(x + 0x56), s16(yBas - hauteur - 2),
    octet(jeu, COULEURS));

  if (avecBoutons === 1) jeu.appeler(BOUTONS_DU_GRAPHIQUE);

  // Le pas de simulation que vaut un cran de l'échelle choisie.
  let parCran = 0;
  const echelle = octet(jeu, ECHELLE_DU_TEMPS);
  if (echelle === 0) parCran = 1;
  else if (echelle === 1) parCran = 0x0C;
  else if (echelle === 2) parCran = 0x30;

  avecTampon(jeu, 0x80, (tampon) => {
    for (let c = 0; c < 9; c++) {
      if (octet(jeu, COURBES + 4 * c + 1) !== 1) continue;

      // Les trois échelles × douze points de cette courbe, relevées dans les comptes.
      const points = [];
      for (let s = 0; s < 3; s++) {
        points.push([]);
        for (let m = 0; m < 12; m++) points[s].push(valeurDeLaCourbe(jeu, c, s, m));
      }
      const serie = points[octet(jeu, ECHELLE_DU_TEMPS)];

      // Le plus haut et le plus bas des points déjà atteints par le temps.
      let haut = 0xFA0A1F00 | 0, bas = 100000000;
      for (let m = 0x0B; s8(m) >= 0 && (Math.imul(parCran, (0x0C - m - 1) * 1000) >>> 0) < long(jeu, PAS_DE_SIMULATION); m--) {
        if (serie[m] > haut) haut = serie[m];
        if (serie[m] < bas) bas = serie[m];
      }
      if (haut === bas) { haut = haut << 1; bas = 0; }
      let etendue = (haut - bas) | 0;
      if (etendue === 0) etendue = 1;

      // L'ordonnée d'un point. La division du programme est non signée, et le résultat n'est
      // ramené à 16 bits qu'au moment du tracé. Un sens autre que 0 ou 1 — que la table ne porte
      // pas — laisserait l'ordonnée précédente en place.
      const ordonnee = (v, precedente) => {
        if (octet(jeu, COURBES + 4 * c) === 0) {
          return (u16(yBas) - div(Math.imul(v - bas, u16(hauteur)), etendue)) | 0;
        }
        if (octet(jeu, COURBES + 4 * c) === 1) {
          return (u16(yBas) + div(Math.imul(u16(hauteur), v - bas), etendue) - u16(hauteur)) | 0;
        }
        return precedente;
      };

      // Le nom de la courbe et sa dernière valeur, à droite du graphique.
      let xCourant = x, yCourant = ordonnee(serie[0x0B], 0);
      jeu.appeler(FORMATER, tampon, F_NOM_ET_NOMBRE,
        long(jeu, (long(jeu, CHAINES_DU_GRAPHIQUE) + 4 * octet(jeu, COURBES + 4 * c + 3)) | 0), serie[0x0B]);
      const couleur = octet(jeu, PALETTE_DES_COURBES + octet(jeu, COURBES + 4 * c + 2));
      const demiLigne = idiv((mot(jeu, MODE_AFFICHAGE) & 1) ? 0x0C : 6, 2);
      jeu.appeler(jauge(jeu), s16(xCourant + 4), s16(u16(yCourant) - demiLigne), tampon, couleur);

      // La courbe, point à point, de droite à gauche : le point d'abscisse x − (12 − m) × pas
      // porte la valeur du mois m − 1, celui d'abscisse x portant déjà la valeur du mois 11.
      for (let m = 0x0B; s8(m) > 0 && (Math.imul(parCran, (0x0C - m) * 1000) >>> 0) < long(jeu, PAS_DE_SIMULATION); m--) {
        const xSuivant = (x - Math.imul(0x0C - m, pas)) | 0;
        let ySuivant = ordonnee(serie[m - 1], yCourant);
        if (u16(ySuivant) < u16(yBas) - u16(hauteur)) ySuivant = (yBas - hauteur) | 0;
        else if (u16(ySuivant) > u16(yBas)) ySuivant = yBas;
        jeu.appeler(ligne(jeu), s16(xCourant), s16(yCourant), s16(xSuivant), s16(ySuivant), couleur);
        xCourant = xSuivant;
        yCourant = ySuivant;
      }
    }

    // Les douze repères de temps sous le graphique, de droite à gauche.
    let mois = div(reste(long(jeu, PAS_DE_SIMULATION), 12000), 1000);
    let annee = div(long(jeu, PAS_DE_SIMULATION), 12000);
    let quatreAns = (div(long(jeu, PAS_DE_SIMULATION), 12000) - (div(long(jeu, PAS_DE_SIMULATION), 12000) & 3)) | 0;
    for (let k = 0; k < 12; k++) {
      const xRepere = (x - Math.imul(k, pas)) | 0;
      const e = octet(jeu, ECHELLE_DU_TEMPS);
      if (e === 0) {
        jeu.appeler(FORMATER, tampon, F_TEXTE, long(jeu, (long(jeu, NOMS_DES_MOIS) + 4 * s8(mois)) | 0));
        ecrireLeRepere(jeu, tampon, xRepere, yBas);
        mois = s8(mois - 1);
        if (s8(mois) < 0) mois = 0x0B;
      } else if (e === 1) {
        jeu.appeler(FORMATER, tampon, F_NOMBRE, s16(annee));
        ecrireLeRepere(jeu, tampon, xRepere, yBas);
        annee = (annee - 1) | 0;
      } else if (e === 2) {
        jeu.appeler(FORMATER, tampon, F_NOMBRE, s16(quatreAns));
        ecrireLeRepere(jeu, tampon, xRepere, yBas);
        quatreAns = (quatreAns - 4) | 0;
      } else {
        continue;   // aucune autre échelle n'existe : ni repère ni trait
      }
      jeu.appeler(ligne(jeu), s16(xRepere), s16(yBas + 2), s16(xRepere), s16(yBas + 6), octet(jeu, COULEURS));
    }
  });
}

// La valeur d'un point : chaque courbe a sa place dans les comptes du joueur, par échelle de temps
// (0x30 octets, douze mots longs) ou, pour les deux courbes d'octets, par tranches de douze octets.
function valeurDeLaCourbe(jeu, courbe, echelle, mois) {
  const fiche = long(jeu, FICHE_DU_JOUEUR), comptes = long(jeu, COMPTES_DU_JOUEUR);
  const lg = (base, depart) => longSigne(jeu, (base + echelle * 0x30 + mois * 4 + depart) | 0);
  const oc = (base, depart) => octet(jeu, (base + echelle * 0x0C + mois + depart) | 0);
  switch (courbe) {
    case 0: return lg(fiche, 0xDD);
    case 1: return lg(comptes, 0x492);
    case 2: return lg(comptes, 0x526);
    case 3: return oc(comptes, 0x5EF);
    case 4: return lg(fiche, 0x16D);
    case 5: return lg(comptes, 0x2D6);
    case 6: return lg(comptes, 0x36A);
    case 7: return lg(comptes, 0x3FE);
    case 8: return oc(fiche, 0x1FD);
    default: return 0;
  }
}

// Un repère de temps, centré sous son trait : la petite police avance de 8 pixels par signe en basse
// résolution, de 4 en haute.
function ecrireLeRepere(jeu, tampon, xRepere, yBas) {
  const largeur = (mot(jeu, MODE_AFFICHAGE) & 1) ? 8 : 4;
  const demi = (Math.imul(jeu.appeler(STRLEN, tampon), largeur) >>> 1);
  jeu.appeler(jauge(jeu), s16(u16(xRepere) + 2 - demi), s16(yBas + 0x0A), tampon, octet(jeu, COULEURS));
}

// =====================================================================================================
// 0x5969C — les boutons du graphique des comptes.
//
// Trois boutons d'échelle de temps, larges de 0x7E, alignés à partir de l'abscisse 0xBC, entre les
// ordonnées 0xDA et 0xEA ; puis neuf boutons de courbe, de l'abscisse 0x1C à 0x9A, un tous les
// 0x12 pixels à partir de l'ordonnée 0x36.
//
// Le survol bouton gauche enfoncé suffit à agir, et le clic est consommé aussitôt. Les boutons
// d'échelle sont exclusifs ; ceux des courbes basculent. Un bouton enfoncé se dessine en creux (fond
// 0xD7778, relief 0xD7777/0xD7779) et son intitulé prend la couleur de sa courbe ; un bouton relâché
// se dessine en relief (fond 0xD7780, relief 0xD7770/0xD7781) et son intitulé la couleur commune.
export function boutonsDuGraphique(jeu) {
  // Les trois échelles de temps.
  for (let k = 0; k < 3; k++) {
    const x0 = 0xBC + Math.imul(k, 0x7E) + 4 * k, x1 = x0 + 0x7E, y0 = 0xDA, y1 = y0 + 0x10;
    if (dansLeBouton(jeu, x0, y0, x1, y1)) {
      if (k === 0) poserLEchelle(jeu, 0, 1, 0, 0);
      else if (k === 1) poserLEchelle(jeu, 1, 0, 1, 0);
      else if (k === 2) poserLEchelle(jeu, 2, 0, 0, 1);
      rendreLesBoutons(jeu);
    }
  }
  for (let k = 0; k < 3; k++) {
    const x0 = 0xBC + Math.imul(k, 0x7E) + 4 * k, x1 = x0 + 0x7E, y0 = 0xDA, y1 = y0 + 0x10;
    dessinerLeBouton(jeu, x0, y0, x1, y1, octet(jeu, BOUTONS_D_ECHELLE + 2 * k) === 1,
      octet(jeu, BOUTONS_D_ECHELLE + 2 * k + 1), null);
  }

  // Les neuf courbes.
  for (let k = 0; k < 9; k++) {
    const x0 = 0x1C, x1 = x0 + 0x7E, y0 = 0x36 + Math.imul(k, 0x10) + 2 * k, y1 = y0 + 0x10;
    if (dansLeBouton(jeu, x0, y0, x1, y1)) {
      poserOctet(jeu, COURBES + 4 * k + 1, octet(jeu, COURBES + 4 * k + 1) === 0 ? 1 : 0);
      poserOctet(jeu, BOUTONS_DE_COURBE + 2 * k, octet(jeu, COURBES + 4 * k + 1));
      rendreLesBoutons(jeu);
    }
    dessinerLeBouton(jeu, x0, y0, x1, y1, octet(jeu, BOUTONS_DE_COURBE + 2 * k) === 1,
      octet(jeu, BOUTONS_DE_COURBE + 2 * k + 1), octet(jeu, COURBES + 4 * k + 2));
  }
}

// Le pointeur est-il dans le bouton, bouton gauche enfoncé ? Les bords ne comptent pas.
function dansLeBouton(jeu, x0, y0, x1, y1) {
  return mot(jeu, GAUCHE_MAINTENU) !== 0
    && motSigne(jeu, SOURIS_X) > u16(x0) && motSigne(jeu, SOURIS_X) < u16(x1)
    && motSigne(jeu, SOURIS_Y) > u16(y0) && motSigne(jeu, SOURIS_Y) < u16(y1);
}

function poserLEchelle(jeu, echelle, a, b, c) {
  poserOctet(jeu, ECHELLE_DU_TEMPS, echelle);
  poserOctet(jeu, BOUTONS_D_ECHELLE, a);
  poserOctet(jeu, BOUTONS_D_ECHELLE + 2, b);
  poserOctet(jeu, BOUTONS_D_ECHELLE + 4, c);
}

// `teinte` : l'indice de la couleur de la courbe dans la petite palette, ou null pour un bouton
// d'échelle, dont l'intitulé enfoncé prend la teinte commune 0xD7773.
function dessinerLeBouton(jeu, x0, y0, x1, y1, enfonce, intitule, teinte) {
  const texte = long(jeu, (long(jeu, CHAINES_DU_GRAPHIQUE) + 4 * intitule) | 0);
  if (enfonce) {
    jeu.appeler(RECTANGLE, s16(x0 + 2), s16(y0 + 2), s16(x1 - x0 - 2), s16(y1 - y0 - 2), octet(jeu, 0xD7778));
    jeu.appeler(CADRE_BISEAUTE, u16(x0), u16(y0), u16(x1), u16(y1), octet(jeu, 0xD7779), octet(jeu, 0xD7777));
    const couleur = teinte === null ? octet(jeu, 0xD7773) : octet(jeu, PALETTE_DES_COURBES + teinte);
    jeu.appeler(TEXTE_CADRE, s16(x0), s16(x1), s16(y0 + 4), texte, couleur);
  } else {
    jeu.appeler(RECTANGLE, s16(x0 + 2), s16(y0 + 2), s16(x1 - x0 - 2), s16(y1 - y0 - 2), octet(jeu, 0xD7780));
    jeu.appeler(CADRE_BISEAUTE, u16(x0), u16(y0), u16(x1), u16(y1), octet(jeu, 0xD7781), octet(jeu, COULEURS));
    jeu.appeler(TEXTE_CADRE, s16(x0), s16(x1), s16(y0 + 4), texte, octet(jeu, COULEURS));
  }
}

const BOUTONS_DU_GRAPHIQUE = 0x5969C;   // appelée par son entrée, comme le fait l'original

// =====================================================================================================
// 0x360C5 — remplir le catalogue d'achat de la fenêtre qui s'ouvre.
//
// La table des fenêtres (0xB762D) donne cette routine aux fenêtres 1 (acheter une attraction),
// 2 et 0x14 (une boutique, un jeu d'adresse), 3 (embaucher) et 4 (un décor ou une installation).
// Chacune parcourt son catalogue d'origine jusqu'au premier article sans nom, ne garde que ceux
// dont le drapeau de disponibilité est levé, et note au passage ceux que le solde du joueur ne peut
// pas payer. La liste obtenue est triée par prix croissant.
//
// Le choix courant est ensuite retrouvé dans la liste triée — le genre qu'on avait déjà en main — et
// le bouton d'achat du catalogue des attractions n'est rallumé que si le genre choisi a une voie :
// son octet signé +0xB4, le genre de voie, différent de -1.
export function remplirLeCatalogue(jeu) {
  poserOctet(jeu, NOMBRE_D_ARTICLES, 0);
  poserOctet(jeu, ARTICLE_CHOISI, 0);
  const disponible = () => longSigne(jeu, long(jeu, FICHE_DU_JOUEUR) + 0x0A)
    - longSigne(jeu, long(jeu, FICHE_DU_JOUEUR) + 0x0E);
  // Ranger un article dans le catalogue ouvert.
  const ajouter = (numero, nom, figureDuNom, prix, outil, trop) => {
    const a = (ARTICLES + TAILLE_ARTICLE * octetSigne(jeu, NOMBRE_D_ARTICLES)) | 0;
    poserOctet(jeu, a + 0x0B, trop ? 1 : 0);
    poserMot(jeu, a + 0, nom);
    poserMot(jeu, a + 2, figure(jeu, figureDuNom));
    poserLong(jeu, a + 4, prix);
    poserMot(jeu, a + 8, outil);
    poserOctet(jeu, a + 0x0A, numero);
    poserOctet(jeu, NOMBRE_D_ARTICLES, octet(jeu, NOMBRE_D_ARTICLES) + 1);
  };

  const fenetre = mot(jeu, FENETRE);
  if (fenetre === 1) {
    // Les attractions. Le compteur est un mot long : le catalogue est parcouru sans repli.
    poserOctet(jeu, ARTICLE_CHOISI, octet(jeu, GENRE_D_ATTRACTION));
    for (let n = 0; mot(jeu, (ATTRACTIONS + TAILLE_ATTRACTION * u16(n) + 0x22) | 0) !== 0; n++) {
      const f = (ATTRACTIONS + TAILLE_ATTRACTION * u16(n)) | 0;
      if ((octet(jeu, f + 0xC5) & 1) === 0) continue;
      ajouter(n, mot(jeu, f + 0x22), mot(jeu, f + 0xBF), longSigne(jeu, f + 0xA2), mot(jeu, f + 0xB5),
        disponible() < longSigne(jeu, f + 0xA2));
    }
  } else if (fenetre === 2 || fenetre === 0x14) {
    remplirLesBoutiques(jeu, ajouter, disponible);
  } else if (fenetre === 3) {
    // Le personnel. Le compteur repasse par un mot : un catalogue de plus de 65 535 métiers
    // reboucherait, ce qui ne peut pas arriver.
    poserOctet(jeu, ARTICLE_CHOISI, mot(jeu, GENRE_DE_METIER));
    for (let n = 0; mot(jeu, (METIERS + TAILLE_METIER * n + 0x22) | 0) !== 0; n = u16(s16(n) + 1)) {
      const f = (METIERS + TAILLE_METIER * n) | 0;
      ajouter(n, mot(jeu, f + 0x22), mot(jeu, f + 0x2A), mot(jeu, f + 0x24), 9,
        disponible() < mot(jeu, f + 0x24));
    }
  } else if (fenetre === 4) {
    // Les décors et les installations.
    poserOctet(jeu, ARTICLE_CHOISI, mot(jeu, GENRE_DE_DECOR));
    for (let n = 0; mot(jeu, (DECORS + TAILLE_DECOR * n + 0x22) | 0) !== 0; n = u16(s16(n) + 1)) {
      const f = (DECORS + TAILLE_DECOR * n) | 0;
      if ((octet(jeu, f + 0x35) & 1) === 0) continue;
      ajouter(n, mot(jeu, f + 0x22), mot(jeu, f + 0x24), mot(jeu, f + 0x28), mot(jeu, f + 0x2A),
        disponible() < mot(jeu, f + 0x28));
    }
  }

  jeu.appeler(TRIER, ARTICLES, octetSigne(jeu, NOMBRE_D_ARTICLES), TAILLE_ARTICLE, COMPARER_LES_PRIX);

  // Retrouver, dans la liste triée, l'article que le joueur avait déjà choisi.
  for (let k = 0; s16(k) < octetSigne(jeu, NOMBRE_D_ARTICLES); k = u16(s16(k) + 1)) {
    const numero = octet(jeu, (ARTICLES + TAILLE_ARTICLE * k + 0x0A) | 0);
    if (numero === mot(jeu, GENRE_D_ATTRACTION) && mot(jeu, ECRAN) === 0x36) poserOctet(jeu, ARTICLE_CHOISI, k);
    else if (numero === mot(jeu, GENRE_DE_BOUTIQUE) && mot(jeu, ECRAN) === 0x3A) poserOctet(jeu, ARTICLE_CHOISI, k);
    else if (numero === mot(jeu, GENRE_DE_METIER) && mot(jeu, ECRAN) === 0x3C) poserOctet(jeu, ARTICLE_CHOISI, k);
    else if (numero === mot(jeu, GENRE_DE_DECOR) && mot(jeu, ECRAN) === 0x3E) poserOctet(jeu, ARTICLE_CHOISI, k);
  }

  if (mot(jeu, ECRAN) === 0x36) {
    const choisi = octet(jeu, (ARTICLES + TAILLE_ARTICLE * octetSigne(jeu, ARTICLE_CHOISI) + 0x0A) | 0);
    if (octetSigne(jeu, (ATTRACTIONS + TAILLE_ATTRACTION * choisi + 0xB4) | 0) !== -1) {
      jeu.appeler(BOUTON_VIVANT, 2, 1);
    }
  }
}

// Les boutiques : le prix est un mot long, et le nom vient du mot +0x26 de la fiche.
function remplirLesBoutiques(jeu, ajouter, disponible) {
  poserOctet(jeu, ARTICLE_CHOISI, octet(jeu, GENRE_DE_BOUTIQUE));
  for (let n = 0; mot(jeu, (BOUTIQUES + TAILLE_BOUTIQUE * n + 0x22) | 0) !== 0; n = u16(s16(n) + 1)) {
    const f = (BOUTIQUES + TAILLE_BOUTIQUE * n) | 0;
    if ((octet(jeu, f + 0x66) & 1) === 0) continue;
    ajouter(n, mot(jeu, f + 0x22), mot(jeu, f + 0x26), longSigne(jeu, f + 0x49), 6,
      disponible() < longSigne(jeu, f + 0x49));
  }
}

// =====================================================================================================
// 0x407FD — le catalogue des attractions (écran 0x36) : le bouton 2 n'est vivant que si l'article
// choisi a une voie (genre de voie de sa fiche, +0xB4, différent de −1) ; le même test qu'à la fin
// de 0x360C5, ci-dessus. Appelée à chaque changement d'article (0x3B76E).
const NUMEROS_DES_ARTICLES = ARTICLES + 0x0A;  // +0xA : le numéro dans le catalogue d'origine
const FICHE_GENRE_DE_VOIE = 0xB4;              // octet signé : −1 sans voie
export function allumerLeBoutonDeLaVoie(jeu) {
  const article = NUMEROS_DES_ARTICLES + octetSigne(jeu, ARTICLE_CHOISI) * TAILLE_ARTICLE;
  const fiche = ATTRACTIONS + octet(jeu, article) * TAILLE_ATTRACTION;
  const aUneVoie = octetSigne(jeu, fiche + FICHE_GENRE_DE_VOIE) !== -1;
  jeu.appeler(BOUTON_VIVANT, 2, aUneVoie ? 1 : 0);
}

// =====================================================================================================
// 0x36BFC — préparer l'écran des pensées des visiteurs (fenêtre 0x13).
//
// Quarante bulles : vingt lancées du côté gauche, vingt du côté droit, une paire par tour de boucle.
// Chaque bulle part d'un bord du cadre de l'écran (repère 0x99 de la table de mise en page) et
// entre vers l'intérieur ; un tirage au sort décide si la paire entre par les bords longs ou par les
// bords courts, et les compteurs de chaque côté écartent les bulles de 0x14 pixels l'une de l'autre.
// Le mot +4 est leur place dans la file, de 0x34 à 0x24E par pas de 0x1C.
//
// L'état de départ vaut 1 si le parc est ouvert depuis un moment (mot +0x1F de sa fiche), 3 sinon ;
// le sens (+0xA) dépend du signe de l'abscisse, et l'objet graphique (+8) se prend dans la table des
// variantes de bulle, 0xB49F4.
//
// Viennent ensuite le titre de l'écran et les trois pastilles de légende — verte, jaune, rouge —,
// puis le compte des légendes de chaque colonne, que les flèches de l'écran feront défiler.
export function preparerLesPensees(jeu) {
  // L'original calcule ici les comptes du joueur sans les relire.
  let gaucheHaut = 0, gaucheBas = 0, droiteHaut = 0, droiteBas = 0;
  const cadre = jeu.appeler(ELEMENT, 0x99);
  let g = BULLES_GAUCHE, d = BULLES_DROITE;

  for (let rang = 0x34; s16(rang) <= 0x24E; rang += 0x1C, g += 0x0F, d += 0x0F) {
    const etat = motSigne(jeu, long(jeu, PARC_DU_JOUEUR) + 0x1F) > 0 ? 1 : 3;
    poserOctet(jeu, d + 0x0B, etat);
    poserOctet(jeu, g + 0x0B, octet(jeu, d + 0x0B));
    poserOctet(jeu, g + 0x0C, u16(jeu.appeler(HASARD)) % 8);
    poserOctet(jeu, d + 0x0C, u16(jeu.appeler(HASARD)) % 8);
    poserMot(jeu, g + 2, 0x62);
    poserMot(jeu, d + 2, 0xAA);
    poserMot(jeu, d + 4, rang);
    poserMot(jeu, g + 4, mot(jeu, d + 4));
    if ((jeu.appeler(HASARD) & 0x10) === 0) {
      poserMot(jeu, g + 0, motSigne(jeu, cadre + 1) - 0x1E - Math.imul(gaucheBas, 0x14));
      gaucheBas = (gaucheBas + 1) & 0xFF;
      poserMot(jeu, d + 0, motSigne(jeu, cadre + 5) + 0x1E + Math.imul(droiteHaut, 0x14));
      droiteHaut = (droiteHaut + 1) & 0xFF;
    } else {
      poserMot(jeu, g + 0, motSigne(jeu, cadre + 5) + 0x14 + Math.imul(gaucheHaut, 0x14));
      gaucheHaut = (gaucheHaut + 1) & 0xFF;
      poserMot(jeu, d + 0, motSigne(jeu, cadre + 1) - 0x14 - Math.imul(droiteBas, 0x14));
      droiteBas = (droiteBas + 1) & 0xFF;
    }
    poserMot(jeu, g + 6, mot(jeu, g + 0));
    poserMot(jeu, d + 6, mot(jeu, d + 0));
    poserOctet(jeu, g + 0x0A, motSigne(jeu, g + 6) < 0 ? 1 : 3);
    poserOctet(jeu, d + 0x0A, motSigne(jeu, d + 6) < 0 ? 1 : 3);
    poserMot(jeu, g + 8, figure(jeu, mot(jeu, IMAGES_DES_BULLES + 0x24 * octet(jeu, g + 0x0C)) + octet(jeu, g + 0x0A)));
    poserMot(jeu, d + 8, figure(jeu, mot(jeu, IMAGES_DES_BULLES + 0x24 * octet(jeu, d + 0x0C)) + octet(jeu, d + 0x0A)));
  }

  jeu.appeler(ANIMER_LES_PENSEES);

  // Le titre, puis trois pastilles de couleur suivies de leur légende.
  const couleurDuTexte = octet(jeu, long(jeu, TEINTES_DE_L_ECRAN) + 5);
  let e = (cadre + 0x0B) | 0;
  jeu.appeler(TEXTE_CENTRE, motSigne(jeu, e + 1), motSigne(jeu, e + 5), s16(mot(jeu, e + 3) + 6),
    long(jeu, long(jeu, TEXTES) + 0x4DC), 1, couleurDuTexte);
  for (const [couleur, texte] of [[0x92, 0x4C4], [0x36, 0x4C8], [0xA7, 0x4CC]]) {
    e = (e + 0x0B) | 0;
    const marge = octet(jeu, EPAISSEUR);
    jeu.appeler(RECTANGLE, s16(marge + mot(jeu, e + 1)), s16(marge + mot(jeu, e + 3)),
      s16(mot(jeu, e + 5) - mot(jeu, e + 1) - marge), s16(mot(jeu, e + 7) - mot(jeu, e + 3) - marge), couleur);
    jeu.appeler(ECRIRE_TEXTE, s16(mot(jeu, e + 5) + 8), motSigne(jeu, e + 3),
      long(jeu, long(jeu, TEXTES) + texte), 0, couleurDuTexte);
  }

  // Le nombre de légendes de chaque colonne : les tables s'arrêtent sur un mot nul.
  poserOctet(jeu, PAGES_GAUCHE, 0);
  for (let p = PENSEES_GAUCHE; mot(jeu, p) !== 0; p += 5) poserOctet(jeu, PAGES_GAUCHE, octet(jeu, PAGES_GAUCHE) + 1);
  poserOctet(jeu, PAGES_DROITE, 0);
  for (let p = PENSEES_DROITE; mot(jeu, p) !== 0; p += 5) poserOctet(jeu, PAGES_DROITE, octet(jeu, PAGES_DROITE) + 1);
  poserMot(jeu, PAGE_DES_PENSEES, 0);
}

// =====================================================================================================
// 0x30E22 — le fantôme de ce qu'on est en train de construire.
//
// Appelée par le survol de la vue du parc (0x149A4) et par la séquence de démonstration (0x59C85),
// avec la fiche du genre et le point où poser son ancre. Ce que l'on dessine dépend du type d'objet
// que la fiche annonce (son mot +0xB0) :
//
//  - **6, un morceau de voie** : les six éléments de la forme courante (0x680 des comptes) dans la
//    table 0xB7AC2. Un élément négatif est l'objet graphique du genre lui-même, posé à son ancre ;
//    un élément positif est un morceau de voie, tracé une ou deux fois selon la forme, plus une
//    pièce de décor au-dessus ;
//  - **4 et 0x1C, une voie qu'on raccorde** : on cherche parmi les quatre cases voisines de celle
//    que vise le pointeur une case et une suivante qui laissent passer la voie (bit 0x40 des
//    tuiles), et l'on retient sa forme ; puis l'objet graphique du genre est tracé à son ancre ;
//  - **tout le reste** : les 22 cases de l'emprise sont couvertes de l'image de sol du genre, puis
//    l'objet graphique du genre est tracé. La fiche peut en porter un second (+0xBC).
//
// L'ancre se lit dans le mot +0x2A de la fiche : sa colonne et sa rangée donnent le décalage, et les
// octets +0x2C et +0x2D l'affinent au 256e de case. Les deux résolutions ne divisent pas ces
// 256es de la même manière, d'où les deux branches partout.
export function dessinerLeFantome(jeu, fiche, x, y) {
  const type = mot(jeu, fiche + 0xB0);
  if (type === 6) {
    dessinerUnMorceauDeVoie(jeu, fiche, x, y);
    return;
  }
  if (type === 4 || type === 0x1C) {
    chercherLaFormeDeVoie(jeu);
    const [px, py] = pointDeLAncre(jeu, fiche, x, y);
    jeu.appeler(DESSINER_OBJET, figure(jeu, motSigne(jeu, formeCourante(jeu, 0xB7A60))), s16(px), s16(py));
    return;
  }

  // Le sol de l'emprise : les 22 cases du genre, chacune à sa place.
  const genre = mot(jeu, GENRE_D_ATTRACTION);
  for (let k = 0; s16(k) < 0x16; k++) {
    if (mot(jeu, (ATTRACTIONS + TAILLE_ATTRACTION * genre + 0x60 + 2 * s16(k)) | 0) === 0) continue;
    const c = motSigne(jeu, (fiche + 0x34 + 2 * s16(k)) | 0);
    const colonne = c % 0x40, rangee = parCase(c);
    const image = (long(jeu, IMAGES_DU_SOL)
      + 6 * (motSigne(jeu, (fiche + 0x60 + 2 * s16(k)) | 0) + 1)) | 0;
    const px = s16(x + Math.imul(colonne, mot(jeu, LARGEUR_TUILE))
      + Math.imul(idiv(mot(jeu, HAUTEUR_TUILE), 2), rangee));
    const py = s16(u16(Math.imul(rangee, mot(jeu, HAUTEUR_TUILE))) + y + mot(jeu, HAUTEUR_TUILE)
      - octet(jeu, image + 5));
    jeu.appeler(tracer(jeu), px, py, image);
  }

  const [px, py] = pointDeLAncre(jeu, fiche, x, y);
  if (mot(jeu, fiche + 0x24) !== 0) {
    jeu.appeler(DESSINER_L_OBJET_SANS_DECOR, figure(jeu, mot(jeu, fiche + 0x24)), s16(px), s16(py));
  } else if (mot(jeu, fiche + 0x2E) !== 0) {
    jeu.appeler(DESSINER_OBJET, figure(jeu, motSigne(jeu, fiche + 0x2E)), s16(px), s16(py));
  }
  if (mot(jeu, fiche + 0xBC) !== 0) {
    jeu.appeler(DESSINER_OBJET, figure(jeu, mot(jeu, fiche + 0xBC)), s16(px), s16(py));
  }
}

// Le point où poser l'objet graphique d'un genre : son ancre, au 256e de case près.
function pointDeLAncre(jeu, fiche, x, y) {
  const c = motSigne(jeu, fiche + 0x2A);
  const colonne = c % 0x40, rangee = parCase(c);
  const enHaute = mot(jeu, MODE_AFFICHAGE) === 8;
  const ecartX = (Math.imul(mot(jeu, LARGEUR_TUILE), octet(jeu, fiche + 0x2C)) >> 8)
    + (octet(jeu, fiche + 0x2D) >> (enHaute ? 5 : 4));
  const ecartY = octet(jeu, fiche + 0x2D) >> (enHaute ? 4 : 3);
  const px = (s16(x) + Math.imul(colonne, mot(jeu, LARGEUR_TUILE))
    + Math.imul(idiv(mot(jeu, HAUTEUR_TUILE), 2), rangee) + ecartX) | 0;
  const py = (s16(y) + Math.imul(mot(jeu, HAUTEUR_TUILE), rangee) + ecartY) | 0;
  return [px, py];
}

// La forme de voie courante, dans une table de 0x1D octets par forme.
const formeCourante = (jeu, table) =>
  (table + 0x1D * octet(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x680)) | 0;

// Le fantôme d'un morceau de voie : six éléments, décrits dans 0xB7AC2, six octets par forme.
function dessinerUnMorceauDeVoie(jeu, fiche, x, y) {
  const forme = octet(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x680);
  for (let k = 0; u16(k) < 6; k++) {
    const element = s16(octetSigne(jeu, (0xB7AC2 + 6 * forme + u16(k)) | 0));
    if (element < 0) {
      // L'objet graphique du genre lui-même, à son ancre.
      const [px, py] = pointDeLAncre(jeu, fiche, x, y);
      jeu.appeler(DESSINER_OBJET, figure(jeu, motSigne(jeu, formeCourante(jeu, 0xB7A60))), s16(px), s16(py));
      continue;
    }
    // Un morceau de voie : sa place dans la forme, puis ses images.
    const voie = (Math.imul(octet(jeu, (0xB7A5B + Math.imul(forme, 0x1D) + element) | 0), 0x19)
      + longSigne(jeu, (0xB4399 + 10 * octetSigne(jeu, fiche + 0xB4)) | 0)) | 0;
    const colonne = motSigne(jeu, (0xB7A47 + 4 * element + Math.imul(forme, 0x1D)) | 0);
    const rangee = motSigne(jeu, (0xB7A49 + 4 * element + Math.imul(forme, 0x1D)) | 0);
    const px = (s16(x) + Math.imul(mot(jeu, LARGEUR_TUILE), colonne)
      + Math.imul(idiv(mot(jeu, HAUTEUR_TUILE), 2), rangee)) | 0;
    const py = (s16(y) + s16(Math.imul(s16(rangee + 1), mot(jeu, HAUTEUR_TUILE)))) | 0;
    jeu.appeler(DESSINER_OBJET, figure(jeu, motSigne(jeu, voie)), s16(px), s16(py));
    if (octet(jeu, fiche + 0xB4) !== 3) {
      jeu.appeler(DESSINER_OBJET, figure(jeu, motSigne(jeu, voie + 2)), s16(px), s16(py));
    }
    // Le décor qui coiffe le morceau, remonté d'une hauteur de tuile et demie.
    const remontee = (mot(jeu, MODE_AFFICHAGE) & 8) ? 0x0C : 0x18;
    const piece = (octet(jeu, (0xB7A5B + Math.imul(forme, 0x1D) + element) | 0)
      + mot(jeu, (0xB4397 + 10 * octetSigne(jeu, fiche + 0xB4)) | 0)) | 0;
    jeu.appeler(DESSINER_OBJET, figure(jeu, piece), s16(px), s16(py - remontee));
  }
}

// La voie qu'on raccorde : parmi les quatre voisines de la case visée, on cherche celle qui laisse
// passer la voie (bit 0x40) et dont la case d'après, prise dans le sens de la forme, la laisse
// passer aussi. La première trouvée devient la forme courante.
function chercherLaFormeDeVoie(jeu) {
  const carte = long(jeu, CARTE);
  const tuile = (c) => octet(jeu, (carte + 4 * c + 2) | 0);
  for (let k = 0; s16(k) < 4; k++) {
    const voisine = (motSigne(jeu, VOISINES + 2 * s16(k)) + mot(jeu, CASE_VISEE)) | 0;
    if ((octet(jeu, TUILES + 4 * tuile(voisine)) & 0x40) === 0) continue;
    const forme = mot(jeu, (0xB48EC + 2 * s16(k)) | 0);
    const suivante = (motSigne(jeu, (0xB7A45 + Math.imul(forme, 0x1D)) | 0)
      + mot(jeu, CASE_VISEE) + motSigne(jeu, VOISINES + 2 * s16(k))) | 0;
    if ((octet(jeu, TUILES + 4 * tuile(suivante)) & 0x40) === 0) continue;
    poserOctet(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x680, forme);
    return;
  }
}

// =====================================================================================================
// 0x6A73D — dessiner un objet graphique en sautant ses morceaux marqués.
//
// C'est 0x209B5 (objets.js) en plus court : même chaîne de morceaux, même tracé, mais les morceaux
// dont les drapeaux portent le bit 0x80 sont passés, et les drapeaux ne sont pas remis à zéro à la
// fin. Le fantôme d'une construction s'en sert pour ne montrer que la partie utile d'un objet.
export function dessinerLObjetSansDecor(jeu, index, x, y) {
  const objet = (long(jeu, OBJETS_GRAPHIQUES) + 8 * u16(index)) | 0;
  for (let n = mot(jeu, objet); n !== 0;) {
    const m = (long(jeu, MORCEAUX) + 10 * n) | 0;
    if ((octet(jeu, m + 6) & 0x80) === 0) {
      const decalage = mot(jeu, m + 0);
      if (decalage !== 0) {
        poserMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, m + 6));
        jeu.appeler(tracer(jeu), s16(x + motSigne(jeu, m + 2)), s16(y + motSigne(jeu, m + 4)),
          (long(jeu, BANQUE_D_IMAGES) + decalage) | 0);
      }
    }
    n = mot(jeu, m + 8);
  }
}

const DESSINER_L_OBJET_SANS_DECOR = 0x6A73D;   // appelée par son entrée, comme le fait l'original

// =====================================================================================================
// 0x193FD — poser l'entrée d'une attraction.
//
// L'objet qu'on tient (mot +0x2D0 des comptes) doit être un kiosque (type 6) ; il est rattaché à une
// attraction (+0x16), dont le genre donne les 22 cases de l'emprise et, pour chacune, un drapeau de
// porte. Pour chaque porte, on regarde les quatre cases voisines : celle qui est libre — ou occupée
// par l'attraction elle-même — et la plus proche du pointeur l'emporte.
//
// Le kiosque va sur la case voisine, la porte reçoit une tuile de passage (0xA7 à 0xAB, selon la
// tuile qui s'y trouvait et le côté d'où l'on vient), et la case du kiosque la tuile 0x86. Les deux
// cases ainsi maquillées sont gardées (0xD662E et le mot +0x2BC des comptes) pour que l'image
// suivante les rende. L'allée voisine (0xD662C) est raccordée si elle change.
//
// Le kiosque prend enfin sa direction (+0x12) et son objet graphique (+0xA) : d'abord d'après le
// côté de la porte, puis d'après l'allée trouvée, qui a le dernier mot.
//
// Sans emplacement possible, la fonction ne fait rien ; si l'objet tenu n'est pas un kiosque, l'outil
// de construction est rendu et l'outil remis à zéro.
export function poserLEntree(jeu) {
  const comptes = long(jeu, COMPTES_DU_JOUEUR);
  const kiosque = objetDuParc(jeu, mot(jeu, comptes + 0x2D0));
  if (octet(jeu, kiosque + 4) !== 6) {
    jeu.appeler(RENDRE_L_OUTIL);
    poserMot(jeu, OUTIL, 0);
    return;
  }
  const attraction = objetDuParc(jeu, mot(jeu, kiosque + 0x16));
  const genre = (ATTRACTIONS + mot(jeu, attraction + 0x16)) | 0;
  // La case d'origine de l'emprise : celle de l'attraction, moins l'ancre du genre.
  const origine = ((octet(jeu, attraction + 9) << 6) + octet(jeu, attraction + 7)
    - motSigne(jeu, genre + 0x2A)) | 0;

  let meilleure = 9999, kiosqueSur = 0, porteSur = 0;
  for (let k = 0; s16(k) < 0x16; k++) {
    if (octet(jeu, (genre + 0x8C + s16(k)) | 0) === 0) continue;
    for (let v = 0; s16(v) < 4; v++) {
      const porte = motSigne(jeu, (genre + 0x34 + 2 * s16(k)) | 0);
      const voisine = s16(porte + motSigne(jeu, VOISINES + 2 * s16(v)) + origine);
      const passage = passageDeLaTuile(jeu, tuileDeLaCase(jeu, voisine));
      if (passage !== 0 && !(passage === 0x4000
        && jeu.appeler(PREMIER_OBJET_DU_TYPE, (long(jeu, CARTE) + 4 * voisine) | 0, 6) === kiosque)) continue;
      const distance = s16(jeu.appeler(VALEUR_ABSOLUE, motSigne(jeu, CASE_VISEE) % 0x40 - voisine % 0x40)
        + jeu.appeler(VALEUR_ABSOLUE, parCase(motSigne(jeu, CASE_VISEE)) - parCase(voisine)));
      if (distance >= s16(meilleure)) continue;
      meilleure = distance;
      kiosqueSur = voisine;
      porteSur = s16(porte + origine);
    }
  }
  if (s16(meilleure) === 9999) return;

  // Déplacer le kiosque sur la case retenue, en gardant sa position fine dans la case.
  jeu.appeler(DEPLACER, kiosque, u16((kiosqueSur % 0x40 << 8) | octet(jeu, kiosque + 6)),
    u16((parCase(kiosqueSur) << 8) | octet(jeu, kiosque + 8)));

  // Rendre la tuile que le fantôme précédent avait remplacée, puis maquiller la porte.
  if (mot(jeu, TUILE_SAUVEE) !== 0) poserLaTuile(jeu, motSigne(jeu, CASE_SAUVEE), octet(jeu, TUILE_SAUVEE));
  poserMot(jeu, TUILE_SAUVEE, tuileDeLaCase(jeu, porteSur));
  poserMot(jeu, CASE_SAUVEE, porteSur);
  switch (mot(jeu, TUILE_SAUVEE)) {
    case 0xA3: poserLaTuile(jeu, porteSur, s16(kiosqueSur) === s16(porteSur) + 0x40 ? 0xA9 : 0xA8); break;
    case 0xA4: poserLaTuile(jeu, porteSur, s16(kiosqueSur) === s16(porteSur) - 0x40 ? 0xA9 : 0xAA); break;
    case 0xA5: poserLaTuile(jeu, porteSur, s16(kiosqueSur) === s16(porteSur) - 0x40 ? 0xA7 : 0xAA); break;
    case 0xA6: poserLaTuile(jeu, porteSur, s16(kiosqueSur) === s16(porteSur) + 0x40 ? 0xA7 : 0xA8); break;
    default: poserLaTuile(jeu, porteSur, 0xAB); break;
  }

  // La case du kiosque : sa tuile est gardée dans les comptes et remplacée par 0x86.
  if (mot(jeu, comptes + 0x2BC) !== 0) {
    poserLaTuile(jeu, motSigne(jeu, comptes + 0x2BC), octet(jeu, comptes + 0x2BA));
  }
  poserMot(jeu, comptes + 0x2BC, kiosqueSur);
  poserMot(jeu, comptes + 0x2BA, tuileDeLaCase(jeu, kiosqueSur));
  poserLaTuile(jeu, kiosqueSur, 0x86);

  if (mot(jeu, CASE_DU_CHEMIN) !== 0) {
    jeu.appeler(OUBLIER_LE_CHEMIN, mot(jeu, CASE_DU_CHEMIN));
    jeu.appeler(RACCORDER, 0x79, mot(jeu, CASE_DU_CHEMIN), 1);
  }

  // La direction du kiosque, d'après le côté de la porte.
  if (s16(kiosqueSur) === s16(porteSur) + 0x40) poserOctet(jeu, kiosque + 0x12, 2);
  else if (s16(kiosqueSur) > s16(porteSur)) poserOctet(jeu, kiosque + 0x12, 1);
  else if (s16(kiosqueSur) === s16(porteSur) - 0x40) poserOctet(jeu, kiosque + 0x12, 0);
  else poserOctet(jeu, kiosque + 0x12, 3);
  poserMot(jeu, kiosque + 0x0A, figure(jeu, mot(jeu, (0xB7ADA + 2 * octet(jeu, kiosque + 0x12)) | 0)));

  // L'allée voisine : la première des quatre qui porte le bit 0x10.
  let allee = 0;
  for (let v = 0; s16(v) < 4; v++) {
    const c = s16(kiosqueSur + motSigne(jeu, VOISINES + 2 * s16(v)));
    if ((octet(jeu, TUILES + 4 * tuileDeLaCase(jeu, c)) & 0x10) !== 0) {
      allee = s16(u16(kiosqueSur) + mot(jeu, VOISINES + 2 * s16(v)));
      break;
    }
  }
  if (s16(allee) !== motSigne(jeu, CASE_DU_CHEMIN) && s16(allee) !== 0) {
    poserMot(jeu, CASE_DU_CHEMIN, allee);
    if (mot(jeu, CASE_DU_CHEMIN) !== 0) {
      jeu.appeler(OUBLIER_LE_CHEMIN, mot(jeu, CASE_DU_CHEMIN));
      jeu.appeler(RACCORDER, 0x79, mot(jeu, CASE_DU_CHEMIN), 1);
    }
  }

  // L'allée a le dernier mot sur l'image et la direction du kiosque.
  const figures = long(jeu, FIGURES);
  if (motSigne(jeu, CASE_DU_CHEMIN) === s16(kiosqueSur) + 0x40) {
    poserMot(jeu, kiosque + 0x0A, mot(jeu, figures + 0xDA));
    poserOctet(jeu, kiosque + 0x12, 2);
  } else if (motSigne(jeu, CASE_DU_CHEMIN) === s16(kiosqueSur) - 0x40) {
    poserMot(jeu, kiosque + 0x0A, mot(jeu, figures + 0xD4));
    poserOctet(jeu, kiosque + 0x12, 0);
  } else if (motSigne(jeu, CASE_DU_CHEMIN) === s16(kiosqueSur) - 1) {
    poserMot(jeu, kiosque + 0x0A, mot(jeu, figures + 0x1AA));
    poserOctet(jeu, kiosque + 0x12, 3);
  } else if (motSigne(jeu, CASE_DU_CHEMIN) === s16(kiosqueSur) + 1) {
    poserMot(jeu, kiosque + 0x0A, mot(jeu, figures + 0xD2));
    poserOctet(jeu, kiosque + 0x12, 1);
  }
  poserMot(jeu, REDESSINER_LA_CARTE, 1);
}

// =====================================================================================================
// 0x19A9E — poser la sortie d'une attraction.
//
// Même départ que l'entrée : l'objet tenu doit être un kiosque, rattaché à une attraction dont le
// genre donne ses portes. Mais ici l'on ne regarde pas les cases voisines : on retient la porte
// elle-même la plus proche du pointeur, et son drapeau dit de quel côté la sortie s'ouvre.
//
// Les drapeaux 1, 2, 4 et 8 donnent directement un côté par la table 0xB4B14 ; les drapeaux 3, 6, 9
// et 0xC laissent le choix entre deux côtés, tranché par l'écart du pointeur le plus grand. Les
// drapeaux 5, 7, 0xA, 0xB et au-delà de 0xC ne sont pas traités : le côté garde alors ce qu'il
// valait au tour précédent — ou, au premier tour, ce que la pile contenait. Aucun scénario ne
// rencontre ce cas.
//
// La case retenue reçoit la tuile 0x9F + côté, gardée dans les comptes comme pour l'entrée, et le
// mot +0x73 de l'attraction retient la case de sa sortie.
//
// ANOMALIE, reproduite : le programme relève la tuile de la case voisine et la compare à zéro sans
// se servir du résultat — deux instructions mortes qui laissent le tri accepter n'importe quelle
// case.
export function poserLaSortie(jeu) {
  const comptes = long(jeu, COMPTES_DU_JOUEUR);
  const kiosque = objetDuParc(jeu, mot(jeu, comptes + 0x2D0));
  if (octet(jeu, kiosque + 4) !== 6) {
    jeu.appeler(RENDRE_L_OUTIL);
    poserMot(jeu, OUTIL, 0);
    return;
  }
  const attraction = objetDuParc(jeu, mot(jeu, kiosque + 0x16));
  const genre = (ATTRACTIONS + mot(jeu, attraction + 0x16)) | 0;
  const origine = ((octet(jeu, attraction + 9) << 6) + octet(jeu, attraction + 7)
    - motSigne(jeu, genre + 0x2A)) | 0;

  let meilleure = 9999, porteSur = 0, cote = 0;
  for (let k = 0; s16(k) < 0x16; k++) {
    if (octet(jeu, (genre + 0x8C + s16(k)) | 0) === 0) continue;
    const porte = s16(motSigne(jeu, (genre + 0x34 + 2 * s16(k)) | 0) + origine);
    const ecartX = motSigne(jeu, CASE_VISEE) % 0x40 - porte % 0x40;
    const ecartY = parCase(motSigne(jeu, CASE_VISEE)) - parCase(porte);
    const distance = s16(jeu.appeler(VALEUR_ABSOLUE, ecartX) + jeu.appeler(VALEUR_ABSOLUE, ecartY));
    if (distance >= s16(meilleure)) continue;

    // Le côté par où la sortie s'ouvre.
    const drapeau = octet(jeu, (genre + 0x8C + s16(k)) | 0);
    // Plus d'écart en colonne qu'en rangée : la sortie sort par le côté, sinon par le haut ou le bas.
    const plutotEnLargeur = () =>
      jeu.appeler(VALEUR_ABSOLUE, s16(ecartX)) > jeu.appeler(VALEUR_ABSOLUE, s16(ecartY));
    if (drapeau === 1 || drapeau === 2 || drapeau === 4 || drapeau === 8) {
      cote = octet(jeu, (0xB4B14 + octet(jeu, (genre + 0x8C + s16(k)) | 0)) | 0);
    } else if (drapeau === 3) cote = plutotEnLargeur() ? 1 : 0;
    else if (drapeau === 6) cote = plutotEnLargeur() ? 1 : 2;
    else if (drapeau === 9) cote = plutotEnLargeur() ? 3 : 0;
    else if (drapeau === 0x0C) cote = plutotEnLargeur() ? 3 : 2;
    // Les autres drapeaux laissent `cote` tel quel.

    // La tuile de la case voisine est relevée et comparée à zéro pour rien : le programme n'en fait
    // rien, la case est retenue de toute façon.
    passageDeLaTuile(jeu, tuileDeLaCase(jeu, s16(porte + motSigne(jeu, VOISINES + 2 * cote))));
    meilleure = distance;
    porteSur = porte;
  }
  if (s16(meilleure) === 9999) return;

  poserMot(jeu, REDESSINER_LA_CARTE, 1);
  if (mot(jeu, TUILE_SAUVEE) !== 0) poserLaTuile(jeu, motSigne(jeu, CASE_SAUVEE), octet(jeu, TUILE_SAUVEE));
  if (mot(jeu, comptes + 0x2BC) !== 0) {
    poserLaTuile(jeu, motSigne(jeu, comptes + 0x2BC), octet(jeu, comptes + 0x2BA));
  }
  poserMot(jeu, comptes + 0x2BC, porteSur);
  poserMot(jeu, comptes + 0x2BA, tuileDeLaCase(jeu, porteSur));
  poserLaTuile(jeu, porteSur, (cote + 0x9F) & 0xFF);
  poserMot(jeu, attraction + 0x73, porteSur);
}

// =====================================================================================================
// 0x3568E — poser une boutique.
//
// L'événement de fin d'image (0x2CCF8) l'appelle avec le joueur et la case visée ; le genre choisi
// est dans 0xD664A. La boutique n'est posée que si toutes ses cases sont libres — tuile qui ne
// laisse rien passer, et pas de drapeau 8 sur la case — et si le joueur peut la payer.
//
// Trop cher : l'écran 0x56 s'affiche, le message composé avec le prix et ce qu'il manque, compté
// avec l'inflation du pays (le mot long +0x1AD des comptes, en centièmes de pour cent, appliqué en
// négatif).
//
// Sinon, chaque case de l'emprise est vidée (0x205D7) et reçoit la tuile 0x9E ; les six premières
// cases qui portent une image donnent chacune un objet du parc de type 0x0A, pris dans le premier
// emplacement libre de la table. L'objet reçoit son genre, sa position, son image, son enseigne, sa
// qualité, ses marchandises, son heure de création, et le prix payé (+0x5B). Les compteurs du parc
// suivent : le nombre possédé du genre, le compte du joueur, la valeur bâtie, le compte par famille
// (1 manger, 2 boire, 4 souvenirs, 8 jeu d'adresse) et le total des installations.
//
// Pour un jeu d'adresse, l'attrait du parc (+0x105) monte de l'attrait du genre, divisé par le
// nombre de boutiques du même genre déjà en place.
export function poserUneBoutique(jeu, joueur, cellule) {
  const genre = mot(jeu, GENRE_DE_BOUTIQUE);
  const fiche = (BOUTIQUES + TAILLE_BOUTIQUE * genre) | 0;
  const caseDe = (k) => (u16(cellule) + motSigne(jeu, (fiche + 0x37 + 2 * u16(k)) | 0)) | 0;

  // Toutes les cases de l'emprise doivent être libres.
  for (let k = 0; u16(k) < octet(jeu, fiche + 0x2A); k++) {
    const adresse = (long(jeu, CARTE) + 4 * caseDe(k)) | 0;
    if (passageDeLaTuile(jeu, octet(jeu, adresse + 2)) !== 0) return 0;
    if ((octet(jeu, adresse + 3) & 8) !== 0) return 0;
  }

  // Le prix, comparé au solde amputé des dépenses de l'image.
  const compte = long(jeu, FICHE_DU_JOUEUR), comptes = long(jeu, COMPTES_DU_JOUEUR);
  const apresAchat = (longSigne(jeu, compte + 0x0A) - longSigne(jeu, fiche + 0x49) - longSigne(jeu, compte + 0x0E)) | 0;
  const marge = Math.imul(longSigne(jeu, comptes + 0x1AD), -0x32);
  if (apresAchat < idiv(marge, 100)) {
    poserMot(jeu, ECRAN, 0x56);
    jeu.appeler(FORMATER, (comptes + 0x1B1) | 0, long(jeu, long(jeu, TEXTES) + 0x394),
      longSigne(jeu, fiche + 0x49));
    return 0;
  }

  let emplacement = (long(jeu, OBJETS_DU_PARC) + TAILLE_OBJET) >>> 0;
  for (let k = 0; u16(k) < octet(jeu, fiche + 0x2A); k++) {
    jeu.appeler(PREPARER_LA_CASE, u16(cellule + motSigne(jeu, (fiche + 0x37 + 2 * u16(k)) | 0)));
    poserOctet(jeu, (long(jeu, CARTE) + 4 * caseDe(k) + 2) | 0, 0x9E);
    if (u16(k) >= 6 || mot(jeu, (fiche + 0x2B + 2 * u16(k)) | 0) === 0) continue;

    // Le premier emplacement libre de la table des objets du parc.
    while (emplacement < long(jeu, FIN_DES_OBJETS) && octet(jeu, emplacement + 4) !== 0) {
      emplacement += TAILLE_OBJET;
    }
    if (emplacement >= long(jeu, FIN_DES_OBJETS)) continue;

    poserMot(jeu, emplacement + 0x38, idiv(longSigne(jeu, fiche + 0x49), 100));
    poserLong(jeu, compte + 0x0E, longSigne(jeu, compte + 0x0E) + Math.imul(motSigne(jeu, emplacement + 0x38), 100));
    poserOctet(jeu, emplacement + 4, 0x0A);
    poserMot(jeu, emplacement + 0x16, TAILLE_BOUTIQUE * genre);
    const c = caseDe(k);
    poserMot(jeu, emplacement + 6, 0x80 | ((c % 0x40) << 8));
    poserMot(jeu, emplacement + 8, 0x80 | (parCase(c) << 8));
    poserMot(jeu, emplacement + 0x0A, figure(jeu, mot(jeu, (fiche + 0x2B + 2 * u16(k)) | 0)));
    poserMot(jeu, emplacement + 0x5F,
      mot(jeu, fiche + 0x28) === 0 ? 0 : figure(jeu, mot(jeu, fiche + 0x28)));
    poserMot(jeu, emplacement + 0x2E, 0);
    poserOctet(jeu, emplacement + 0x4B, 0);
    poserOctet(jeu, emplacement + 0x0C, octet(jeu, fiche + 0x55));
    poserOctet(jeu, emplacement + 0x51, octet(jeu, fiche + 0x57));
    poserOctet(jeu, emplacement + 0x50, octet(jeu, fiche + 0x56));
    poserMot(jeu, emplacement + 0x52, mot(jeu, fiche + 0x58));
    poserMot(jeu, emplacement + 0x14, 0);
    poserMot(jeu, emplacement + 0x34, mot(jeu, fiche + 0x4F));
    poserMot(jeu, emplacement + 0x36, mot(jeu, emplacement + 0x34));
    poserLong(jeu, emplacement + 0x3E, long(jeu, PAS_DE_SIMULATION));
    poserOctet(jeu, fiche + 0x68, octet(jeu, fiche + 0x68) + 1);
    poserOctet(jeu, (comptes + 0x61C + genre) | 0, octet(jeu, (comptes + 0x61C + genre) | 0) + 1);
    poserLong(jeu, compte + 0x37, longSigne(jeu, compte + 0x37) + longSigne(jeu, fiche + 0x49));
    poserLong(jeu, emplacement + 0x5B, long(jeu, fiche + 0x49));
    jeu.appeler(POSER_SUR_LA_CASE, emplacement, mot(jeu, emplacement + 6), mot(jeu, emplacement + 8));
    poserMot(jeu, REDESSINER_LA_CARTE, 1);

    // Les compteurs de la fiche du parc, par famille.
    const parc = long(jeu, PARC_DU_JOUEUR);
    const famille = octet(jeu, fiche + 0x24);
    if (famille === 1) poserOctet(jeu, parc + 0xEC, octet(jeu, parc + 0xEC) + 1);
    else if (famille === 2) poserOctet(jeu, parc + 0xF8, octet(jeu, parc + 0xF8) + 1);
    else if (famille === 4) poserOctet(jeu, parc + 0xE7, octet(jeu, parc + 0xE7) + 1);
    else if (famille === 8) {
      poserOctet(jeu, parc + 0x104, octet(jeu, parc + 0x104) + 1);
      // L'attrait d'un jeu d'adresse se partage entre ceux du même genre déjà bâtis.
      let deja = 0;
      for (let o = (long(jeu, OBJETS_DU_PARC) + TAILLE_OBJET) >>> 0; o < long(jeu, FIN_DES_OBJETS); o += TAILLE_OBJET) {
        if (octet(jeu, o + 4) === 0x0A && idiv(mot(jeu, o + 0x16), TAILLE_BOUTIQUE) === genre) deja = (deja + 1) & 0xFF;
      }
      if (deja === 0) poserLong(jeu, parc + 0x105, longSigne(jeu, parc + 0x105) + octet(jeu, fiche + 0x69));
      else poserLong(jeu, parc + 0x105, longSigne(jeu, parc + 0x105) + idiv(octet(jeu, fiche + 0x69), deja));
    }
    poserOctet(jeu, parc + 0xE0, octet(jeu, parc + 0xE0) + 1);
    poserMot(jeu, OUTIL, 0);
    poserMot(jeu, OBJET_DESIGNE, idiv(emplacement - long(jeu, OBJETS_DU_PARC), TAILLE_OBJET));
  }
  return 0;
}

// =====================================================================================================
// Les réécritures de ce module.
//
// `memoire: 'entiere'` pour celles qui écrivent dans les objets du parc ou dans la carte, deux tables
// du tas : sans restauration du tas entre les deux exécutions, la réécriture repartirait de l'état
// que la transcription vient de laisser.
// 0x3F2C5 — la comparaison du tri d'une liste (qsort, 0x811AA), selon le critère [0xD779B] : 1, le
// mot long +0 de chaque ligne (la fiche du catalogue) ; 2, le mot signé +6 ; 3, le mot signé +8 ;
// sinon, égales. Le second moins le premier : un tri décroissant. Non exercée : aucun scénario ne
// clique le bouton du tri.
function comparerLesLignes(jeu, a, b) {
  const critere = octet(jeu, SENS_DU_TRI);
  if (critere === 1) return (long(jeu, b) - long(jeu, a)) | 0;
  if (critere === 2) return (motSigne(jeu, b + 6) - motSigne(jeu, a + 6)) | 0;
  if (critere === 3) return (motSigne(jeu, b + 8) - motSigne(jeu, a + 8)) | 0;
  return 0;
}

export const reecritures = [
  { adresse: 0x3B76E, nom: 'executerLaCommande', fn: executerLaCommande, arguments: 0, memoire: 'entiere' },
  { adresse: 0x5877B, nom: 'dessinerLeGraphique', fn: dessinerLeGraphique, arguments: 5 },
  { adresse: 0x5969C, nom: 'boutonsDuGraphique', fn: boutonsDuGraphique, arguments: 0 },
  { adresse: 0x360C5, nom: 'remplirLeCatalogue', fn: remplirLeCatalogue, arguments: 0 },
  { adresse: 0x407FD, nom: 'allumerLeBoutonDeLaVoie', fn: allumerLeBoutonDeLaVoie, arguments: 0 },
  { adresse: 0x36BFC, nom: 'preparerLesPensees', fn: preparerLesPensees, arguments: 0 },
  { adresse: 0x30E22, nom: 'dessinerLeFantome', fn: dessinerLeFantome, arguments: 3 },
  { adresse: 0x6A73D, nom: 'dessinerLObjetSansDecor', fn: dessinerLObjetSansDecor, arguments: 3 },
  { adresse: 0x193FD, nom: 'poserLEntree', fn: poserLEntree, arguments: 0, memoire: 'entiere' },
  { adresse: 0x19A9E, nom: 'poserLaSortie', fn: poserLaSortie, arguments: 0, memoire: 'entiere' },
  { adresse: 0x3568E, nom: 'poserUneBoutique', fn: poserUneBoutique, arguments: 2, memoire: 'entiere' },
];

export const enAttente = [
  { adresse: 0x3F2C5, nom: 'comparerLesLignes', fn: comparerLesLignes, arguments: 2, retour: true },
];
