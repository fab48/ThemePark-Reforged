// Le panneau de commande du parc : la barre d'outils, les jauges, la date, l'argent et les réglages
// de l'objet désigné, redessinés à chaque image.
//
// Réécriture lisible des fonctions 0x4E359, 0x4DE1A, 0x4FB79, 0x4C0B2, 0x4DFAC, 0x50366, 0x82950 et
// 0x4C50B du jeu d'origine. Chaque constante vient du programme de 1994 ; `moteur/node/comparer.mjs`
// et `moteur/node/verifier.mjs` prouvent que le comportement est identique (voir en fin de fichier).
//
// --- Ce que le joueur voit -----------------------------------------------------------------------
//
// Tout en bas de l'écran du parc, une bande de 40 lignes : à gauche les dix boutons d'outils, au
// milieu deux panneaux, à droite les six réglages de l'objet choisi. Au-dessus, la barre des
// messages (panneau.js). En haut à gauche, la date ; en haut à droite, sept petites icônes.
//
// Deux fonctions se partagent le travail, à chaque image, et la seconde est appelée par la première :
//
//  - **0x4DE1A** dessine les douze cases de la barre d'outils (zones 4 à 15) **dans le tampon de
//    fond**, pas sur la surface de dessin : le fond est ce que la restauration par blocs remet
//    sous les sprites à chaque image (§ 6.6), si bien que la barre n'a pas à être retracée quand
//    rien n'y bouge. Elle fait aussi avancer, d'une image par appel, l'animation du bouton pressé ;
//  - **0x4E359** dessine tout le reste, sur la surface de dessin : les icônes du haut, la date, les
//    deux jauges, le visage de l'humeur, l'argent, les six réglages de l'objet désigné, et son nom
//    qui défile.
//
// Trois fonctions de service s'y ajoutent : **0x4C0B2** met une somme en toutes lettres, **0x4FB79**
// écrit un texte qui défile dans une fenêtre étroite, **0x4C50B** rend le nom d'un joueur. Et deux
// mises en place, appelées au changement de résolution et à l'entrée dans le parc : **0x4DFAC**
// descend les zones du bas à la hauteur de l'écran, **0x50366** pose l'échelle et les couleurs de la
// barre de menus. Enfin, **0x82950**, qui n'a rien à voir avec le panneau : c'est l'amorçage du tas
// du jeu, qui ramasse d'un coup toute la mémoire libre de la machine.
//
// --- Les deux résolutions -------------------------------------------------------------------------
//
// L'espace de dessin fait toujours 640 de large (§ 6.1) ; il fait 400 de haut en 320x200 (chaque
// pixel logique vaut un demi-pixel d'écran) et 480 en 640x480 (un pour un). Le mot 0xDE5F6 vaut 1
// ou 8 ; le programme le teste tantôt par `& 1` (basse résolution), tantôt par `& 5` et `& 0xA`.
// Les longueurs de l'interface sont donc dites en unités logiques et doublées en basse résolution :
// un caractère de la petite police avance de 8 unités en 320x200, de 4 en 640x480, et son cadre
// mesure 12 unités de haut, ou 6. La barre d'outils occupe les 40 dernières lignes : 360 à 400, ou
// 440 à 480.
//
// --- La table des zones ---------------------------------------------------------------------------
//
// C'est elle qui porte la géométrie du panneau : 12 octets par zone en 0xB93C3 (interface-parc.js).
// Le rectangle (x0, y0, x1, y1) sert ici de position de dessin, et les octets +8 et +9, la première
// et la dernière image de l'animation d'un bouton pressé, servent d'abord de **numéro d'icône** :
//
//   zone  ce que ce lot y dessine
//   4–15  les douze cases de la barre d'outils (0x4DE1A), icônes 1 à 0x16
//   12    les deux jauges et le visage de l'humeur, par-dessus la case
//   13    l'argent, centré
//   14    le nom de l'objet désigné, qui défile sur 16 caractères
//   16    le remplissage de l'attraction : icône 0x39 + 0 à 7
//   17    la durée du tour : icône 0x2A + n
//   18    le bouton de la fiche : icône 0x19, fixe
//   19    la sécurité de l'attraction (icône 0x22 + n), ou le mécanicien qu'on envoie
//   20    ouvrir ou fermer (icône 0x1F + 0 à 2), ou l'employé qu'on déplace
//   21    la vitesse de l'attraction : icône 0x32 + n
//   22–28 les sept icônes du coin haut droit ; quatre seulement sont dessinées ici
//
// Les sept icônes du haut (leurs propres octets +8) : 0x4C, 0x47, 0x46, 0x49, 0x48, 0x4B, 0x4A pour
// les zones 22 à 28. 0x4E359 n'en dessine que quatre, chacune sous condition :
//
//   zone 22  icône 0x4C  une découverte vient d'être faite ([0xD7768], economie.js) — elle clignote
//   zone 24  icône 0x46  la fiche du parc +0xCC n'est pas nulle
//   zone 23  icône 0x47  la fiche du parc +0xD4 n'est pas nulle
//   zone 26  icône 0x48  la fiche du parc +0xD0 n'est pas nulle
//
// Ces trois mots du parc sont incrémentés par l'embauche (0x6EE22) en même temps que le nombre
// d'employés (+0xC2) : vraisemblablement le nombre d'employés de trois métiers — l'icône ne
// s'allume que si l'on en a un. Le clic sur les zones 23 à 26 amène la vue sur l'employé suivant du
// métier (interface-parc.js). Les zones 25, 27 et 28 n'ont pas d'icône dessinée ici : non établi.
//
// --- Ce que 0x4E359 lit dans l'état du jeu ---------------------------------------------------------
//
// La date, en haut à gauche : « jour MOIS ». Le mois est l'octet +0x5ED des comptes du joueur
// ([0xD3814], economie.js), son nom le texte [[0xD7B90] + 4 × mois], et le jour vaut
// (pas % 1000) / (0xB7E06[mois] + 1) + 1 — la table 0xB7E06 donne, mois par mois, 32, 35, 32, 33,
// 32, 33, 32, 32, 33, 32, 33, 32, soit 1 000 pas de simulation découpés en 31, 28, 31, 30… jours.
//
// Les deux jauges, dans la zone 12 :
//
//  - le **bus** : un fond 0xD9 de toute la largeur, puis un remplissage 0xDF proportionnel à
//    l'octet +0x5EE des comptes (les passagers du bus, écrit avec +0x47 de la fiche du parc par
//    0x67FE9) sur l'octet +0x48 de la fiche du parc (la capacité des bus) ;
//  - les **visiteurs présents** (mot +0x1F de la fiche du parc), en couleur 0x18 : un dixième du
//    nombre, compté par rangées de 38 ; les rangées pleines font un bloc, le reste une barre en bas
//    à droite. Chaque longueur est arrondie au pair supérieur, un pixel d'écran en basse résolution.
//
// Le **visage de l'humeur**, à côté, quand il y a des visiteurs : sept images (0x1C, 0x1D, 0x1E,
// 0x4D, 0x4E, 0x4F, 0x50, table 0xB93BC) choisies en comparant le mot long +0xAE de la fiche du parc
// aux deux seuils de contentement +0 et +2, avec les marges 300 et 50.
//
// L'**argent**, centré dans la zone 13 : les 250 premiers pas de chaque mois, et une image sur deux
// (bit 3 du compteur de pas), c'est la **variation du solde sur le mois écoulé** (+0xD5 de la fiche
// du joueur), en rouge si elle est négative ; le reste du temps, le solde +0xA moins +0xE. Ce que
// compte +0xE n'est pas établi : d'autres fonctions l'augmentent et le diminuent de 100 fois
// l'argent d'un visiteur (0x2F344, 0x22145).
//
// **Anomalie reproduite** : le texte est centré en comptant 8 unités par caractère, la largeur d'un
// caractère en basse résolution seulement. En 640x480 il est donc décalé de deux unités par
// caractère vers la gauche.
//
// Les **six réglages**, zones 16 à 21, dépendent de ce qu'on tient ou de ce qu'on a désigné :
//
//  - outil 5 (poser une attraction) : rien n'est dessiné, et le panneau du nom montre
//    « NOM @ PRIX » pris dans le catalogue des attractions, dans la couleur 0xD777C ;
//  - sinon, l'objet désigné (mot 0xD6678, objets de 200 octets depuis [0xD3B10]) choisit, par son
//    type +4 : 2 un visiteur, 4 une attraction, 8 un employé, 0xA une boutique, 0x18 un panneau.
//    Tout autre type, ou aucun objet, ne dessine rien.
//
// L'attraction montre les six réglages : le remplissage (+0x26 sur +0xA6 de sa fiche), la durée
// (+0x34 sur +0xAC, seulement si +0xAC n'est pas nul), la fiche, la sécurité (+0x2E sur l'octet
// +0xA8) — remplacée, une image sur deux, par l'icône du mécanicien en route quand l'employé +0x49
// existe et que son mot +0x4D n'est pas nul —, l'ouverture (l'octet +0x4B : 0 ouverte, −1 fermée,
// autre en cours ; l'octet +0xC4, un compte à rebours que **cette fonction décrémente** un pas sur
// quatre, force l'image 2) et la vitesse (l'octet +0x13).
//
// L'employé montre sa fiche, puis, si aucun écran n'est ouvert, l'icône 0x21 quand son état +0xC
// est entre 0xA et 0x10, sinon l'icône 27. Le mécanicien (métier de code 0x16) a en plus deux
// images d'outils dans les zones 16 et 17 quand il répare (états 0x2C et 0x2E), et une troisième
// zone 21 ; dans ses autres états de travail (0x16, 0x18, 0x1C, 0x24, 0x26, 0x28, 0x30) une seule
// image zone 16. Un employé d'un autre métier à l'état 8 reçoit l'icône 26, zone 19.
//
// Le nom, enfin, défile sur 16 caractères dans la zone 14, au rythme d'un caractère toutes les
// quatre images (mot 0xD6636, que la sélection d'un objet remet à zéro) : le nom du genre de
// l'attraction, le nom du visiteur, celui du décor, celui de la boutique, ou le métier de
// l'employé — et, si le jeu est en pause ([0xD779C]), le texte 14 de l'interface à la place de tout.
//
// --- L'animation des boutons (0x4DE1A) -------------------------------------------------------------
//
// Un seul octet, 0xD779F, porte l'image en cours de l'animation, et chaque bouton n'a que deux
// images, la sienne au repos (+8 de sa zone) et la sienne enfoncée (+9). Le clic gauche (0x15FBD)
// écrit dans 0xD779F la première image du bouton pressé ; 0x4DE1A, pour chaque bouton, dessine son
// image de repos — sauf si le compteur tombe dans son intervalle, auquel cas il dessine le compteur
// et le fait avancer. Passé la dernière image, le compteur y reste : **le bouton choisi reste
// enfoncé** jusqu'au clic suivant, qui donne au compteur la valeur d'un autre bouton.
//
// La fin de l'animation baisse aussi l'octet 0xD7767 (« une animation est en cours ») et, si la
// barre d'outils venait d'être rallumée ([0xD7798] == 1), la remet à 0 et demande un redessin de la
// carte. Enfin, la boucle ne dessine tout cela que si on le lui demande (argument 1), si une
// animation court, ou **si un écran est ouvert** — auquel cas le fond que l'écran a sali doit être
// repeint ; sinon elle passe directement à 0x4E359.
//
// --- L'amorçage du tas (0x82950) -------------------------------------------------------------------
//
// Rien à voir avec le parc : appelée par les allocateurs (0x5F550, 0x5F63F, 0x7E8D0, 0x7E9B8,
// 0x8B980), elle ramasse une fois pour toutes toute la mémoire libre de la machine et la range en
// liste chaînée. Voir son commentaire.

import { dansLeCadre } from './cadre.js';
import { ecran } from './grande-vue.js';

// --- Accès à la mémoire ---------------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;

const octet = (jeu, a) => jeu.m8[a];
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// La division entière du processeur (`idiv`, `div`) : tronquée vers zéro ; un diviseur nul lève une
// exception, comme sur la machine.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

// Les tampons de texte que l'original loge dans son cadre de pile : ici, sous le pointeur de pile,
// dans la zone que les vérificateurs ne comparent pas.
function variablesLocales(jeu, taille) {
  const T = jeu.T;
  T.sauver();
  const bas = ((T.R.esp >>> 0) - taille) >>> 0;
  T.R.esp = bas | 0;
  T.charger();
  return bas;
}

// --- Les variables du jeu --------------------------------------------------------------------------
const MODE = 0xDE5F6;                 // mot : 1 = 320x200, 8 = 640x480 (etat.js)
const SURFACE = 0xDE5BC;              // pointeur : l'image en cours de construction
const FOND = 0xD3B98;                 // pointeur : le tampon de fond, que la restauration remet
const PAS_DE_SIMULATION = 0xD3AFC;    // mot long : 1 000 pas par mois, 12 000 par an
const ECRAN_COURANT = 0xD6652;        // mot : 0 = la vue du parc
const FENETRE_SOUS_LE_POINTEUR = 0xB14BD;  // mot signé : −1 = aucune (fenetres.js)
const BARRE_DE_MENUS = 0xB14D2;       // mot signé : −1 = la barre de menus est fermée (boucle.js)
const EN_PAUSE = 0xD779C;             // octet : le jeu est en pause (touche P)
const REDESSINER_LA_CARTE = 0xD666E;  // mot : demande de redessin complet
const PANNEAU = 0xD7798;              // octet : la barre d'outils du bas est affichée
const ANIMATION_EN_COURS = 0xD7767;   // octet : un bouton est en train de s'enfoncer
const IMAGE_DU_BOUTON = 0xD779F;      // octet : l'image en cours de cette animation
const NOUVELLE_DECOUVERTE = 0xD7768;  // octet : la recherche vient d'aboutir (economie.js)
const DEFILEMENT_DU_NOM = 0xD6636;    // mot : le décalage du nom qui défile ; la sélection le remet à 0
const OUTIL = 0xD6670;                // mot : l'outil en main (interface-parc.js)
const OUTIL_ATTRACTION = 5;
const FICHE_D_ATTRACTION = 0xD665A;   // mot : le décalage de l'attraction choisie dans son catalogue
const OBJET_DESIGNE = 0xD6678;        // mot : le rang de l'objet désigné, 0 = aucun

const FICHE_DU_JOUEUR = 0xD3808;      // pointeur : sa fiche (economie.js)
const COMPTES_DU_JOUEUR = 0xD3814;    // pointeur : ses comptes, 0xD443C + joueur × 0x6C2
const PARC_DU_JOUEUR = 0xD3818;       // pointeur : la fiche de son parc
const OBJETS_DU_PARC = 0xD3B10;       // pointeur : les objets du parc, 200 octets chacun
const FICHES_DES_JOUEURS = 0xD3B00;   // pointeur : les 25 fiches de joueur, 0x222 octets
const JOUEUR = 0xD665C;               // mot : le joueur courant
const COMPTES = 0xD443C, TAILLE_COMPTES = 0x6C2;   // le nom du joueur est en tête de ses comptes
const TAILLE_FICHE_DE_JOUEUR = 0x222;
const TAILLE_OBJET = 0xC8;

const IMAGES_DU_PANNEAU = 0xD3B68;    // pointeur : la banque d'images de l'interface, 6 octets par entrée
const NOMS_DES_MOIS = 0xD7B90;        // pointeur : 4 octets par mois
const NOMS_DES_JOUEURS = 0xD7B98;     // pointeur : la table des noms de joueur (concurrents.js)
const TEXTES = 0xD7BCC;               // pointeur : les textes de l'interface, 4 octets par texte
const NOMS_DES_OBJETS = 0xD7BD0;      // pointeur : les noms ; +0x168 ceux des genres de visiteur
const JOURS_DU_MOIS = 0xB7E06;        // 12 octets : pas de simulation par jour, moins un

const CATALOGUE_DES_ATTRACTIONS = 0xCCED0;   // fiches de 200 octets, le nom en tête ; +0xA2 le prix
const PRIX_DES_ATTRACTIONS = 0xCCF72;        // = CATALOGUE_DES_ATTRACTIONS + 0xA2
const CATALOGUE_DES_DECORS = 0xCCA70;        // fiches de 0x38 octets ; interface-parc.js le voit en +0x22
const CATALOGUE_DES_BOUTIQUES = 0xD3C62;     // fiches désignées par le mot +0x16 de l'objet
const MARCHANDISES = 0xD3C00, TAILLE_MARCHANDISE = 0xE;
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;   // interface-parc.js le voit en +0x22
const METIER_MECANICIEN = 0x16;              // le code +0x2C du métier

// Les couleurs de l'interface, posées à l'entrée dans le parc (0x12452).
const COULEUR_DU_TEXTE = 0xD7773;     // octet : le texte normal
const COULEUR_ROUGE = 0xD777C;        // octet : une somme négative, le nom d'un article à acheter
const COULEUR_DU_FOND = 0xD777E;      // octet : le fond d'une case de valeur
const BISEAU_HAUT = 0xD776E, BISEAU_BAS = 0xD776F;
const FOND_DE_LA_JAUGE = 0xD9, REMPLISSAGE_DE_LA_JAUGE = 0xDF, BARRE_DES_VISITEURS = 0x18;

// Les proportions et les couleurs de la barre de menus (boucle.js), posées par 0x50366.
const ECHELLE = 0xD7793, MARGE = 0xD7794, HAUTEUR_LIGNE = 0xD6620;
const COULEUR_BARRE = 0xD7797, COULEUR_TITRE = 0xD7791;
const FOND_DU_MENU = 0xD7796, TEXTE_DU_MENU = 0xD7790;
const LIGNE_CHOISIE = 0xD778F, LIGNE_INACTIVE = 0xD7799;

// --- Les fonctions appelées --------------------------------------------------------------------------
const RECTANGLE = 0x1188C;            // (x, y, largeur, hauteur, couleur) : un rectangle plein
const CADRE_BISEAUTE = 0x3E149;       // (x0, y0, x1, y1, couleurBasDroite, couleurHautGauche)
const RECTANGLE_UNI = 0x3E34E;        // (x0, y0, x1, y1, couleur) : le contour
const TRACER_320 = 0x5EC9C;           // (x, y, image) : en 320x200
const TRACER_640 = 0x55BD4;           // (x, y, image) : en 640x480, marque les blocs touchés (§ 6.6)
const ECRIRE_320 = 0x80E88;           // (x, y, texte, couleur) : la petite police (dessin-objets.js)
const ECRIRE_640 = 0x80F34;
const JAUGE_DE_STOCK = 0x7B3F6;       // (marchandise, x, y, largeur, hauteur, 2) : le stock d'une boutique
const SPRINTF = 0x7F652, STRLEN = 0x7E822, MEMSET = 0x7F1A0, TRIER = 0x811AA;
const VALEUR_ABSOLUE = 0x80BF2;
const RAFRAICHIR_LE_PANNEAU = 0x4E359, ECRIRE_EN_DEFILANT = 0x4FB79, ECRIRE_UNE_SOMME = 0x4C0B2;

const FORMAT_MILLIONS = 0xB01F6;      // "%dM"
const FORMAT_MILLIERS = 0xB01FA;      // "%dK"
const FORMAT_UNITES = 0xB01FE;        // "%d"
const FORMAT_DATE = 0xB0204;          // "%d %s"
const FORMAT_ARTICLE = 0xB020A;       // "%s @ %d   "

const basseResolution = (jeu) => (octet(jeu, MODE) & 1) !== 0;
const image = (jeu, n) => (long(jeu, IMAGES_DU_PANNEAU) + 6 * n) >>> 0;
const tracer = (jeu, x, y, dessin) =>
  jeu.appeler(basseResolution(jeu) ? TRACER_320 : TRACER_640, s16(x), s16(y), dessin);
const ecrire = (jeu, x, y, texte, couleur) =>
  jeu.appeler(basseResolution(jeu) ? ECRIRE_320 : ECRIRE_640, s16(x), s16(y), texte, couleur);

// --- La table des zones ------------------------------------------------------------------------------
const ZONES = 0xB93C3, TAILLE_ZONE = 12;
const zone = (z) => ZONES + TAILLE_ZONE * z;
const zx0 = (jeu, z) => motSigne(jeu, zone(z));
const zy0 = (jeu, z) => motSigne(jeu, zone(z) + 2);
const zx1 = (jeu, z) => motSigne(jeu, zone(z) + 4);
const zy1 = (jeu, z) => motSigne(jeu, zone(z) + 6);
const zIcone = (jeu, z) => octet(jeu, zone(z) + 8);
const zIconeFin = (jeu, z) => octet(jeu, zone(z) + 9);

const BORD_DROIT = 1, BORD_BAS = 2, BORD_GAUCHE = 3;
const PREMIER_OUTIL = 4, DERNIER_OUTIL = 15;
const JAUGES = 12, ARGENT = 13, NOM = 14;
const REMPLISSAGE = 16, DUREE = 17, FICHE = 18, SECURITE = 19, OUVERTURE = 20, VITESSE = 21;
const ICONE_DECOUVERTE = 22, ICONE_D4 = 23, ICONE_CC = 24, ICONE_D0 = 26;
const VUE_DU_PARC = 29;

// Une icône de réglage : posée au coin de sa zone, quatre unités plus haut.
const tracerReglage = (jeu, z, n) => tracer(jeu, zx0(jeu, z), s16(u16(mot(jeu, zone(z) + 2) - 4)), image(jeu, n));

// =====================================================================================================
// 0x50366 — L'ÉCHELLE ET LES COULEURS DE LA BARRE DE MENUS
// =====================================================================================================
//
// Appelée au changement de résolution (0x10D42), à l'entrée dans le parc (0x12452) et à l'ouverture
// de la barre de menus (0x4FCC5). Les six couleurs sont écrites en dur : ni la fiche des teintes ni
// le fichier de langue n'y touchent. Les deux tests du mode (`& 5` puis `& 0xA`) ne laissent rien
// faire si le mode n'est ni l'un ni l'autre — il ne vaut jamais que 1 ou 8.
export function reglerLaBarreDeMenus(jeu) {
  if ((octet(jeu, MODE) & 5) !== 0) {           // 320x200 : tout est doublé
    poserOctet(jeu, ECHELLE, 2);
    poserOctet(jeu, MARGE, 8);
  } else if ((octet(jeu, MODE) & 0xA) !== 0) {  // 640x480
    poserOctet(jeu, ECHELLE, 1);
    poserOctet(jeu, MARGE, 4);
  }
  poserOctet(jeu, COULEUR_BARRE, 0x6A);
  poserOctet(jeu, COULEUR_TITRE, 0x72);
  poserOctet(jeu, FOND_DU_MENU, 0xB7);
  poserOctet(jeu, TEXTE_DU_MENU, 0xB0);
  poserOctet(jeu, LIGNE_CHOISIE, 0xB5);
  poserOctet(jeu, LIGNE_INACTIVE, 0xAD);
  poserMot(jeu, HAUTEUR_LIGNE, 6);
}

// =====================================================================================================
// 0x4DFAC — LES ZONES DU BAS, À LA HAUTEUR DE L'ÉCRAN
// =====================================================================================================
//
// Les ordonnées du bas sont nulles dans le fichier : c'est cette fonction, appelée au changement de
// résolution (0x10D42) et à l'entrée dans le parc (0x12452), qui les pose. La barre d'outils prend
// les 40 dernières lignes, les six réglages s'arrêtent 12 unités plus haut, la vue du parc 42.
//
// Le programme recalcule la hauteur de l'écran à chaque écriture, et la zone 15 est servie deux
// fois : par la boucle des outils et par la liste des réglages, avec les mêmes valeurs. Reproduit.
export function adapterLesZonesALaResolution(jeu) {
  // (480 : la hauteur de l'écran, `ecran`, grande-vue.js ; plus grande en grande vue.)
  const hauteur = () => (basseResolution(jeu) ? 400 : ecran.hauteur);
  for (let z = PREMIER_OUTIL; z <= DERNIER_OUTIL; z++) {
    poserMot(jeu, zone(z) + 2, hauteur() - 0x28);
    poserMot(jeu, zone(z) + 6, hauteur());
  }
  poserMot(jeu, zone(BORD_DROIT) + 6, hauteur());
  poserMot(jeu, zone(BORD_BAS) + 2, hauteur() - 2);
  poserMot(jeu, zone(BORD_BAS) + 6, hauteur() + 2);
  poserMot(jeu, zone(BORD_GAUCHE) + 6, hauteur());
  poserMot(jeu, zone(VUE_DU_PARC) + 6, hauteur() - 0x2A);
  for (let z = DERNIER_OUTIL; z <= VITESSE; z++) poserMot(jeu, zone(z) + 2, hauteur() - 0x28);
  for (let z = REMPLISSAGE; z <= VITESSE; z++) poserMot(jeu, zone(z) + 6, hauteur() - 0xC);
  poserMot(jeu, zone(DERNIER_OUTIL) + 6, hauteur());
}

// =====================================================================================================
// 0x4C0B2 — UNE SOMME EN TOUTES LETTRES
// =====================================================================================================
//
// Au-delà du million, la somme est dite en millions (« 12M ») ; au-delà de mille, en milliers
// (« 47K ») ; en dessous, telle quelle. Le seuil est pris sur la valeur absolue, le quotient sur la
// valeur signée : −1 500 donne « −1K ».
//
// **Anomalie reproduite** : les deux branches du milieu sont identiques — au-delà de 999 999 comme
// au-delà de 999, la somme est divisée par mille et suivie d'un K. La première ne sert donc à rien.
export function ecrireUneSomme(jeu, tampon, valeur) {
  const absolue = jeu.appeler(VALEUR_ABSOLUE, valeur) >>> 0;
  if (absolue > 0x98967F) jeu.appeler(SPRINTF, tampon, FORMAT_MILLIONS, diviser(valeur | 0, 1000000));
  else if (absolue > 0xF423F) jeu.appeler(SPRINTF, tampon, FORMAT_MILLIERS, diviser(valeur | 0, 1000));
  else if (absolue > 0x3E7) jeu.appeler(SPRINTF, tampon, FORMAT_MILLIERS, diviser(valeur | 0, 1000));
  else jeu.appeler(SPRINTF, tampon, FORMAT_UNITES, valeur);
  return tampon;
}

// =====================================================================================================
// 0x4C50B — LE NOM D'UN JOUEUR
// =====================================================================================================
//
// Le joueur humain — le genre 1 ou 6 de sa fiche — et celui dont c'est le tour portent le nom saisi
// au début de la partie, rangé en tête de leurs comptes (0xD443C + joueur × 0x6C2). Les autres
// prennent un nom de la table [0xD7B98], choisi par l'octet +1 de leur fiche (concurrents.js).
export function nomDuJoueur(jeu, joueur) {
  const rang = joueur & 0xFF;
  const fiche = (long(jeu, FICHES_DES_JOUEURS) + TAILLE_FICHE_DE_JOUEUR * rang) >>> 0;
  if (octet(jeu, fiche) === 1 || octet(jeu, fiche) === 6 || mot(jeu, JOUEUR) === rang) {
    return (COMPTES + TAILLE_COMPTES * rang) >>> 0;
  }
  return long(jeu, (long(jeu, NOMS_DES_JOUEURS) + 4 * octet(jeu, fiche + 1)) >>> 0);
}

// =====================================================================================================
// 0x4FB79 — UN TEXTE QUI DÉFILE DANS UNE FENÊTRE ÉTROITE
// =====================================================================================================
//
// (x, y, largeur, décalage, texte, couleur). Si le texte tient dans la largeur — comptée en
// caractères —, il est écrit tel quel. Sinon la fonction en découpe une fenêtre de `largeur`
// caractères, prise **en boucle** à partir du caractère (décalage modulo la longueur) : le texte
// tourne sans fin, sans séparateur, la fin revenant coller au début.
//
// Le tampon de l'original tient dans son cadre de pile : quarante caractères utiles avant d'écraser
// ses propres variables. Ses deux appelants demandent 16 (le nom de l'objet désigné, 0x4E359) et 9
// caractères (l'écran de la recherche, 0x51780).
export function ecrireEnDefilant(jeu, x, y, largeur, decalage, texte, couleur) {
  if (texte === 0) return;
  const longueur = u16(jeu.appeler(STRLEN, texte));
  if (longueur === 0) return;
  if (u16(largeur) > longueur) {                       // il tient : rien ne défile
    ecrire(jeu, x, y, texte, couleur & 0xFF);
    return;
  }
  const fenetre = variablesLocales(jeu, 0x4C);
  let source = diviser(u16(decalage), longueur);
  source = u16(decalage) - source * longueur;          // le reste de la division
  let k = 0;
  while (u16(k) < u16(largeur)) {
    if (u16(source) >= longueur) source = 0;
    jeu.m8[(fenetre + u16(k)) >>> 0] = octet(jeu, (texte + u16(source)) >>> 0);
    source++;
    k++;
  }
  jeu.m8[(fenetre + u16(k)) >>> 0] = 0;
  ecrire(jeu, x, y, fenetre, couleur & 0xFF);
}

// =====================================================================================================
// 0x4DE1A — LA BARRE D'OUTILS, UNE IMAGE
// =====================================================================================================
//
// Les douze cases sont peintes **dans le tampon de fond** : la restauration par blocs les remettra
// sur la surface à chaque image (§ 6.6). On ne les repeint donc que lorsqu'il le faut — quand
// l'appelant le demande (argument 1 : la boucle du parc le fait à l'entrée, au changement de
// résolution et après un écran), quand une animation de bouton court, ou quand un écran est ouvert
// par-dessus, qui a sali le fond.
//
// Le mot [0xD6652] est comparé une dernière fois juste avant l'appel de 0x4E359, sans que personne
// ne lise le résultat : calcul mort du compilateur, non transcrit.
//
// Le cadre de l'original (`enter 0x18`) : après chaque case, le retour du tracé reste dans sa
// variable [ebp-0x10] (320x200) ou [ebp-0x18] (640x480), et l'adresse de cette variable dans
// [ebp-0x14], que la barre des messages 0x5CBDB relit ensuite (index.js, `resteRelu`).
export const dessinerLaBarreDOutils = dansLeCadre(0x18, (jeu, cadre, forcer) => {
  if ((forcer & 0xFF) !== 1 && octet(jeu, ANIMATION_EN_COURS) === 0 && mot(jeu, ECRAN_COURANT) === 0) {
    jeu.appeler(RAFRAICHIR_LE_PANNEAU);
    return;
  }
  const surface = long(jeu, SURFACE);
  poserLong(jeu, SURFACE, long(jeu, FOND));
  for (let z = PREMIER_OUTIL; z <= DERNIER_OUTIL; z++) {
    let n = zIcone(jeu, z);                            // le bouton au repos
    if (octet(jeu, IMAGE_DU_BOUTON) >= n && octet(jeu, IMAGE_DU_BOUTON) <= zIconeFin(jeu, z)) {
      n = octet(jeu, IMAGE_DU_BOUTON);                 // c'est lui qu'on presse : l'image suivante
      poserOctet(jeu, IMAGE_DU_BOUTON, n + 1);
      if (octet(jeu, IMAGE_DU_BOUTON) > zIconeFin(jeu, z)) {   // l'animation est finie
        poserOctet(jeu, ANIMATION_EN_COURS, 0);
        poserOctet(jeu, IMAGE_DU_BOUTON, zIconeFin(jeu, z));   // le bouton reste enfoncé
        if (octet(jeu, PANNEAU) === 1) {               // la barre vient d'être rallumée
          poserOctet(jeu, PANNEAU, 0);
          poserMot(jeu, REDESSINER_LA_CARTE, 1);
        }
      }
    }
    const trace = tracer(jeu, zx0(jeu, z), s16(u16(mot(jeu, zone(z) + 2) - 4)), image(jeu, u16(n)));
    const variable = cadre.local(basseResolution(jeu) ? 0x10 : 0x18);
    poserLong(jeu, variable, trace);
    poserLong(jeu, cadre.local(0x14), variable);
  }
  if (ecran.grande) peindreLesBandesDuBas(jeu);
  poserLong(jeu, SURFACE, surface);
  jeu.appeler(RAFRAICHIR_LE_PANNEAU);
});

// Hors du jeu d'origine : en grande vue (grande-vue.js), la barre d'outils est centrée en bas de
// l'écran, et le panneau de commande, recopié du fond sur toute la largeur (dessin-carte.js), a deux
// bandes de part et d'autre. Chaque ligne des bandes prend la couleur du bord gauche de la barre sur
// cette ligne : le panneau bleu et ses biseaux se prolongent, sans motif répété (paver l'image d'un
// panneau montrait des motifs, et une couleur seule tranchait avec les biseaux).
function peindreLesBandesDuBas(jeu) {
  const y = s16(u16(mot(jeu, zone(DERNIER_OUTIL) + 2) - 4));
  const gauche = zx0(jeu, PREMIER_OUTIL), droite = zx1(jeu, DERNIER_OUTIL);
  const largeur = ecran.largeur;
  const fond = long(jeu, SURFACE);         // le fond : la surface y pointe pendant ce dessin
  for (let ligne = Math.max(0, y); ligne < ecran.hauteur; ligne++) {
    const debut = (fond + ligne * largeur) >>> 0;
    const couleur = jeu.m8[debut + gauche + 1];
    if (gauche > 0) jeu.m8.fill(couleur, debut, debut + gauche);
    if (droite < largeur) jeu.m8.fill(couleur, debut + droite, debut + largeur);
  }
}

// =====================================================================================================
// 0x4E359 — LE PANNEAU DE COMMANDE, UNE IMAGE
// =====================================================================================================

// Les quatre icônes du coin haut droit et la date, en haut à gauche : tout ce qui se pose par-dessus
// la vue du parc, et que l'on ne dessine donc pas quand une fenêtre ou la barre de menus le couvre.
function dessinerLesIcones(jeu) {
  const parc = long(jeu, PARC_DU_JOUEUR);
  if (octet(jeu, NOUVELLE_DECOUVERTE) !== 0 && (long(jeu, PAS_DE_SIMULATION) & 0xF) > 7) {
    tracer(jeu, zx0(jeu, ICONE_DECOUVERTE), zy0(jeu, ICONE_DECOUVERTE), image(jeu, zIcone(jeu, ICONE_DECOUVERTE)));
  }
  if (mot(jeu, parc + 0xCC) !== 0) tracer(jeu, zx0(jeu, ICONE_CC), zy0(jeu, ICONE_CC), image(jeu, zIcone(jeu, ICONE_CC)));
  if (mot(jeu, parc + 0xD4) !== 0) tracer(jeu, zx0(jeu, ICONE_D4), zy0(jeu, ICONE_D4), image(jeu, zIcone(jeu, ICONE_D4)));
  if (mot(jeu, parc + 0xD0) !== 0) tracer(jeu, zx0(jeu, ICONE_D0), zy0(jeu, ICONE_D0), image(jeu, zIcone(jeu, ICONE_D0)));

  // La date : « jour MOIS », dans un creux de six caractères au coin haut gauche.
  const tampon = variablesLocales(jeu, 0x10);
  const mois = octet(jeu, (long(jeu, COMPTES_DU_JOUEUR) + 0x5ED) >>> 0);
  const parJour = octet(jeu, JOURS_DU_MOIS + mois) + 1;
  const pas = long(jeu, PAS_DE_SIMULATION);
  const jour = diviser(pas - diviser(pas, 1000) * 1000, parJour) + 1;
  jeu.appeler(SPRINTF, tampon, FORMAT_DATE, jour, long(jeu, (long(jeu, NOMS_DES_MOIS) + 4 * mois) >>> 0));

  const hauteurTexte = basseResolution(jeu) ? 0xC : 6;     // la hauteur d'un caractère
  const largeurTexte = basseResolution(jeu) ? 8 : 4;       // ce qu'avance un caractère
  jeu.appeler(RECTANGLE, 2, 2, s16(largeurTexte * 6 + 6), s16(hauteurTexte), octet(jeu, COULEUR_DU_FOND));
  jeu.appeler(CADRE_BISEAUTE, 0, 0, u16(largeurTexte * 6 + 8), u16(hauteurTexte + 2),
    octet(jeu, BISEAU_BAS), octet(jeu, BISEAU_HAUT));
  ecrire(jeu, 4, 2, tampon, octet(jeu, COULEUR_DU_TEXTE));
}

// Les deux jauges de la zone 12, et le visage de l'humeur des visiteurs.
function dessinerLesJauges(jeu) {
  const parc = long(jeu, PARC_DU_JOUEUR);
  const comptes = long(jeu, COMPTES_DU_JOUEUR);
  const gauche = s16(zx0(jeu, JAUGES) + 4);
  const droite = s16(zx1(jeu, JAUGES) - 4);
  const hauteur = 0xC;
  let bas = s16(zy1(jeu, JAUGES) - 0xE);

  // Le bus : son fond, puis ce qu'il porte de passagers sur ce qu'il peut en porter.
  jeu.appeler(RECTANGLE, gauche, bas, s16(droite - gauche - 2), hauteur, FOND_DE_LA_JAUGE);
  if (octet(jeu, (comptes + 0x5EE) >>> 0) !== 0) {
    const plein = diviser((droite - gauche - 2) * octet(jeu, (comptes + 0x5EE) >>> 0),
      octet(jeu, (parc + 0x48) >>> 0));
    jeu.appeler(RECTANGLE, gauche, bas, s16(plein), hauteur, REMPLISSAGE_DE_LA_JAUGE);
  }

  // Les visiteurs présents, un trait par dizaine, trente-huit par rangée : le bloc des rangées
  // pleines, puis le reste en bas à droite. Chaque longueur est arrondie au pair supérieur.
  const visiteurs = mot(jeu, (parc + 0x1F) >>> 0);
  if (visiteurs !== 0) {
    const rangees = (diviser(diviser(visiteurs, 10), 0x26) + 1) & 0xFE;
    if (s16(rangees) > 1) {
      jeu.appeler(RECTANGLE, gauche, s16(bas + hauteur - rangees), s16(droite - gauche - 2), s16(rangees),
        BARRE_DES_VISITEURS);
    }
    bas = s16(bas + (hauteur - 2 - rangees));
    const q = diviser(visiteurs, 10);
    const reste = ((q - diviser(q, 0x26) * 0x26) + 1) & 0xFE;
    if (s16(reste) > 1) {
      jeu.appeler(RECTANGLE, s16(droite - 2 - reste), bas, s16(reste), 2, BARRE_DES_VISITEURS);
    }

    // Le visage : sept images, du sourire à la grimace, selon l'écart entre la mesure +0xAE et les
    // deux seuils de contentement du parc.
    const mesure = longSigne(jeu, (parc + 0xAE) >>> 0);
    const seuilHaut = motSigne(jeu, parc), seuilBas = motSigne(jeu, (parc + 2) >>> 0);
    let n;
    if (seuilHaut + 300 < mesure) n = octet(jeu, 0xB93BC);
    else if (seuilHaut + 0x32 < mesure) n = octet(jeu, 0xB93BD);
    else if (seuilHaut - 0x32 < mesure) n = octet(jeu, 0xB93BE);
    else if (seuilBas + 0x32 < mesure) n = octet(jeu, 0xB93BF);
    else if (seuilBas - 0x32 < mesure) n = octet(jeu, 0xB93C0);
    else if (seuilBas - 300 < mesure) n = octet(jeu, 0xB93C1);
    else n = octet(jeu, 0xB93C2);
    tracer(jeu, s16(u16(mot(jeu, zone(JAUGES)) + 0xC)), s16(u16(mot(jeu, zone(JAUGES) + 2) + 2)), image(jeu, n));
  }
}

// L'argent, centré dans la zone 13.
function dessinerLArgent(jeu) {
  const tampon = variablesLocales(jeu, 0x10);
  const fiche = long(jeu, FICHE_DU_JOUEUR);
  const pas = long(jeu, PAS_DE_SIMULATION);
  const y = s16(zy1(jeu, ARGENT) - 0xE);
  let couleur;
  if (pas - diviser(pas, 1000) * 1000 < 0xFA && (pas & 0xF) > 7) {
    // Le début du mois : la variation du solde sur le mois écoulé, qui clignote, en rouge si elle
    // est négative.
    jeu.appeler(ECRIRE_UNE_SOMME, tampon, long(jeu, (fiche + 0xD5) >>> 0));
    couleur = longSigne(jeu, (fiche + 0xD5) >>> 0) < 0 ? octet(jeu, COULEUR_ROUGE) : octet(jeu, COULEUR_DU_TEXTE);
  } else {
    jeu.appeler(ECRIRE_UNE_SOMME, tampon, (long(jeu, (fiche + 0xA) >>> 0) - long(jeu, (fiche + 0xE) >>> 0)) | 0);
    couleur = octet(jeu, COULEUR_DU_FOND);
  }
  // Anomalie reproduite : un caractère est compté pour 8 unités, sa largeur en basse résolution
  // seulement ; en 640x480 le texte est décalé vers la gauche de deux unités par caractère.
  const milieu = (zx0(jeu, ARGENT) + zx1(jeu, ARGENT)) | 0;
  const x = s16((((milieu - (jeu.appeler(STRLEN, tampon) << 3)) | 0) >>> 1));
  ecrire(jeu, x, y, tampon, u16(couleur));
}

// Les six réglages de l'objet désigné, et le nom qu'il faudra faire défiler.
// Rend { texte, couleur } : l'original les garde dans [ebp-0x3C] et [ebp-0x20].
function dessinerLesReglages(jeu) {
  // Une attraction en main : pas de réglages, mais son nom et son prix, en couleur d'article.
  if (mot(jeu, OUTIL) === OUTIL_ATTRACTION) {
    const tampon = variablesLocales(jeu, 0x34);
    const f = (CATALOGUE_DES_ATTRACTIONS + TAILLE_OBJET * mot(jeu, FICHE_D_ATTRACTION)) >>> 0;
    jeu.appeler(SPRINTF, tampon, FORMAT_ARTICLE, f,
      long(jeu, (PRIX_DES_ATTRACTIONS + TAILLE_OBJET * mot(jeu, FICHE_D_ATTRACTION)) >>> 0));
    return { texte: tampon, couleur: u16(octet(jeu, COULEUR_ROUGE)) };
  }
  const couleur = u16(octet(jeu, COULEUR_DU_TEXTE));
  const objet = (long(jeu, OBJETS_DU_PARC) + TAILLE_OBJET * mot(jeu, OBJET_DESIGNE)) >>> 0;
  if (objet <= long(jeu, OBJETS_DU_PARC)) return { texte: 0, couleur };   // rien de désigné

  switch (octet(jeu, (objet + 4) >>> 0)) {
    case 2: return { texte: dessinerVisiteur(jeu, objet), couleur };
    case 4: return { texte: dessinerAttraction(jeu, objet), couleur };
    case 8: return { texte: dessinerEmploye(jeu, objet), couleur };
    case 0xA: return { texte: dessinerBoutique(jeu, objet), couleur };
    case 0x18: return { texte: dessinerDecor(jeu, objet), couleur };
    default: return { texte: 0, couleur };
  }
}

// Le bouton de fiche, zone 18 : la même icône pour tous les types d'objet.
const tracerLeBoutonDeFiche = (jeu) => tracerReglage(jeu, FICHE, zIcone(jeu, FICHE));

// Un visiteur (type 2) : sa fiche, et le nom de son genre.
function dessinerVisiteur(jeu, objet) {
  tracerLeBoutonDeFiche(jeu);
  return long(jeu, (long(jeu, NOMS_DES_OBJETS) + 4 * octet(jeu, (objet + 0x59) >>> 0) + 0x168) >>> 0);
}

// Un panneau indicateur (type 0x18) : sa fiche seulement dans l'état 2, et le nom de son modèle.
function dessinerDecor(jeu, objet) {
  if (octet(jeu, (objet + 0xC) >>> 0) === 2) tracerLeBoutonDeFiche(jeu);
  return (CATALOGUE_DES_DECORS + 0x38 * mot(jeu, (objet + 0x16) >>> 0)) >>> 0;
}

// Une boutique (type 0xA) : sa fiche, et, si elle vend quelque chose (l'octet +0x67 de sa fiche
// n'est pas −1), la jauge du stock de cette marchandise, encadrée, à cheval sur les zones 16 et 17.
function dessinerBoutique(jeu, objet) {
  tracerLeBoutonDeFiche(jeu);
  const fiche = (CATALOGUE_DES_BOUTIQUES + mot(jeu, (objet + 0x16) >>> 0)) >>> 0;
  if (s8(octet(jeu, (fiche + 0x67) >>> 0)) !== -1) {
    jeu.appeler(JAUGE_DE_STOCK,
      (MARCHANDISES + TAILLE_MARCHANDISE * s8(octet(jeu, (fiche + 0x67) >>> 0))) >>> 0,
      u16(mot(jeu, zone(DUREE)) + 2), u16(mot(jeu, zone(DUREE) + 2) + 2),
      u16(mot(jeu, zone(REMPLISSAGE) + 4) - mot(jeu, zone(DUREE)) - 4),
      u16(mot(jeu, zone(REMPLISSAGE) + 6) - mot(jeu, zone(DUREE) + 2) - 8), 2);
    jeu.appeler(RECTANGLE_UNI, mot(jeu, zone(DUREE)), mot(jeu, zone(DUREE) + 2),
      u16(mot(jeu, zone(REMPLISSAGE) + 4) - 2), u16(mot(jeu, zone(REMPLISSAGE) + 6) - 6),
      octet(jeu, COULEUR_DU_TEXTE));
  }
  return fiche;
}

// Une attraction (type 4) : les six réglages, et le nom de son genre.
function dessinerAttraction(jeu, objet) {
  const fiche = (CATALOGUE_DES_ATTRACTIONS + mot(jeu, (objet + 0x16) >>> 0)) >>> 0;

  // Le remplissage : huit crans, borné à sept.
  let n = diviser(diviser(mot(jeu, (objet + 0x26) >>> 0) << 7, motSigne(jeu, (fiche + 0xA6) >>> 0)) * 7, 128);
  if (s16(n) > 7) n = 7;
  tracerReglage(jeu, REMPLISSAGE, zIcone(jeu, REMPLISSAGE) + s16(n));

  // La durée d'un tour, seulement si la fiche en donne une.
  if (mot(jeu, (fiche + 0xAC) >>> 0) !== 0) {
    const d = diviser(diviser(motSigne(jeu, (objet + 0x34) >>> 0) << 7, mot(jeu, (fiche + 0xAC) >>> 0)) * 7, 128);
    tracerReglage(jeu, DUREE, zIcone(jeu, DUREE) + s16(d));
  }

  // La zone 19 : le mécanicien en route, qui clignote, l'emporte sur la sécurité. L'icône employée
  // est celle de la zone 20 augmentée de deux, et non celle de la zone 19 : reproduit tel quel.
  let mecanicien = 0;
  const employe = (long(jeu, OBJETS_DU_PARC) + TAILLE_OBJET * mot(jeu, (objet + 0x49) >>> 0)) >>> 0;
  if (employe > long(jeu, OBJETS_DU_PARC) && mot(jeu, (employe + 0x4D) >>> 0) !== 0) {
    mecanicien = zIcone(jeu, OUVERTURE) + 2;
  }
  if (mecanicien !== 0 && (long(jeu, PAS_DE_SIMULATION) & 0xF) > 7) {
    tracerReglage(jeu, SECURITE, s16(mecanicien));
  } else {
    // La sécurité : le rapport de l'usure +0x2E à l'octet +0xA8 de la fiche, sur 256 et non sur 128
    // comme les deux jauges précédentes, et sans borne.
    const s = diviser(diviser(mot(jeu, (objet + 0x2E) >>> 0) << 7, octet(jeu, (fiche + 0xA8) >>> 0)) * 7, 256);
    tracerReglage(jeu, SECURITE, zIcone(jeu, SECURITE) + s16(s));
  }

  tracerLeBoutonDeFiche(jeu);

  // L'ouverture : l'octet +0x4B dit l'état (0 ouverte, −1 fermée, autre en cours) ; l'octet +0xC4
  // est un compte à rebours, que **cette fonction de dessin décrémente** un pas de simulation sur
  // quatre, et qui force l'image de l'attraction fermée tant qu'il court.
  let ouverture = 0;
  if (octet(jeu, (objet + 0x4B) >>> 0) !== 0) {
    ouverture = s8(octet(jeu, (objet + 0x4B) >>> 0)) === -1 ? 2 : 1;
  }
  if (octet(jeu, (objet + 0xC4) >>> 0) !== 0) {
    if ((octet(jeu, PAS_DE_SIMULATION) & 3) === 0) {
      poserOctet(jeu, (objet + 0xC4) >>> 0, octet(jeu, (objet + 0xC4) >>> 0) - 1);
    }
    ouverture = 2;
  }
  tracerReglage(jeu, OUVERTURE, zIcone(jeu, OUVERTURE) + s16(ouverture));

  tracerReglage(jeu, VITESSE, zIcone(jeu, VITESSE) + s16(u16(octet(jeu, (objet + 0x13) >>> 0))));
  return fiche;
}

// Un employé (type 8) : sa fiche, son état, ce qu'il tient en main s'il répare, et son métier.
function dessinerEmploye(jeu, objet) {
  tracerLeBoutonDeFiche(jeu);
  if (mot(jeu, ECRAN_COURANT) === 0) {
    const etat = octet(jeu, (objet + 0xC) >>> 0);
    if (etat >= 0xA && etat <= 0x10) tracerReglage(jeu, OUVERTURE, zIcone(jeu, OUVERTURE) + 2);
    else tracerReglage(jeu, OUVERTURE, 27);            // l'original écrit le décalage 0xA2 = 6 × 27

    const metier = (METIERS + TAILLE_METIER * octet(jeu, (objet + 0x59) >>> 0)) >>> 0;
    if (mot(jeu, (metier + 0x2C) >>> 0) === METIER_MECANICIEN) {
      if (etat === 0x2C || etat === 0x2E) {            // il répare : deux outils, et un troisième
        tracerReglage(jeu, REMPLISSAGE, 65);
        tracerReglage(jeu, DUREE, 66);
        tracerReglage(jeu, VITESSE, octet(jeu, (objet + 0xC) >>> 0) === 0x2E ? 67 : 68);
      } else if (etat === 0x16 || etat === 0x18 || etat === 0x1C || etat === 0x24
        || etat === 0x26 || etat === 0x28 || etat === 0x30) {
        tracerReglage(jeu, REMPLISSAGE, 69);
      }
    } else if (etat === 8) {
      tracerReglage(jeu, SECURITE, 26);
    }
  }
  return (METIERS + TAILLE_METIER * octet(jeu, (objet + 0x59) >>> 0)) >>> 0;
}

// 0x4E359 — le panneau de commande du parc, appelé à chaque image par 0x4DE1A.
export function rafraichirLEcranDuParc(jeu) {
  if (mot(jeu, ECRAN_COURANT) === 0
    && motSigne(jeu, FENETRE_SOUS_LE_POINTEUR) === -1
    && motSigne(jeu, BARRE_DE_MENUS) === -1) {
    dessinerLesIcones(jeu);
  }
  dessinerLesJauges(jeu);
  dessinerLArgent(jeu);
  const { texte, couleur } = dessinerLesReglages(jeu);

  // En pause, le panneau du nom porte le texte 14 de l'interface, quoi qu'on ait désigné.
  const aEcrire = octet(jeu, EN_PAUSE) !== 0 ? long(jeu, (long(jeu, TEXTES) + 0x38) >>> 0) : texte;
  if (aEcrire !== 0) {
    const decalage = mot(jeu, DEFILEMENT_DU_NOM);
    poserMot(jeu, DEFILEMENT_DU_NOM, decalage + 1);    // un caractère toutes les quatre images
    jeu.appeler(ECRIRE_EN_DEFILANT, u16(mot(jeu, zone(NOM)) + 0xC), u16(mot(jeu, zone(NOM) + 6) - 0xC),
      0x10, u16(decalage >> 2), aEcrire, couleur & 0xFF);
  }
}

// =====================================================================================================
// 0x82950 — RAMASSER TOUTE LA MÉMOIRE LIBRE
// =====================================================================================================
//
// L'amorçage du tas du jeu, appelé par les allocateurs (0x5F550, 0x5F63F, 0x7E8D0, 0x7E9B8, 0x8B980)
// et qui rend la main aussitôt s'il a déjà tourné. Il ne demande pas de la mémoire au fur et à
// mesure : il prend **tout** ce que la machine a de libre, d'un coup, et le range lui-même.
//
// Deux tables : les blocs bruts, 0xDEDC8, 256 entrées de 12 octets (adresse, sélecteur, taille) ; et
// les nœuds de la liste chaînée, 0xDF9C8, 256 entrées de 18 octets (adresse, taille, suivant,
// précédent, un octet d'état, le rang).
//
// Trois moissons, chacune par tailles décroissantes, et qui reprend la même taille tant qu'elle
// réussit :
//
//  1. la mémoire conventionnelle du DOS (0x82D6C), de 640 Ko à 1 Ko par pas de 1 Ko ; le segment
//     réel devient une adresse linéaire (× 16) et le sélecteur est gardé à part ;
//  2. la mémoire étendue (0x8A5A1), de 16 Mo à 4 Ko par pas de 4 Ko ; chaque bloc obtenu est ensuite
//     agrandi le plus possible (0x8A623) par pas de 16 octets, de 4 Ko à rien ;
//  3. les miettes (0x8A5A1), de 4 Ko à 16 octets par pas de 16 octets.
//
// Un bloc DOS de 64 000 octets est réservé avant tout et rendu à la fin (0x8A7FC) : sans lui, la
// première moisson ne laisserait rien de la mémoire basse au reste du programme.
//
// **Anomalie reproduite** : la troisième moisson, quand elle réussit, ajoute 4 096 à la taille
// demandée au lieu de 16 ; la boucle la reprend donc 4 080 octets plus haut, là où la moisson
// précédente a déjà échoué.
//
// Si l'agrandissement de la deuxième moisson échoue à toutes les tailles, le bloc est tout de même
// compté, avec une taille nulle : reproduit.
const BLOCS = 0xDEDC8, TAILLE_BLOC = 12;
const NOEUDS = 0xDF9C8, TAILLE_NOEUD = 0x12;
const NOMBRE_DE_BLOCS = 0x100;
const ALLOUER_DOS = 0x82D6C, LIBERER_DOS = 0x8A7FC;
const ALLOUER = 0x8A5A1, REDIMENSIONNER = 0x8A623;
const COMPARER_LES_BLOCS = 0x82930;

export function ramasserLaMemoireLibre(jeu) {
  if (long(jeu, BLOCS + 8) !== 0) return;              // le tas est déjà monté
  const reserve = jeu.appeler(ALLOUER_DOS, 0xFA00);
  for (let k = 0; k < NOMBRE_DE_BLOCS; k++) jeu.appeler(MEMSET, BLOCS + TAILLE_BLOC * k, 0, TAILLE_BLOC);
  for (let k = 0; k < NOMBRE_DE_BLOCS; k++) jeu.appeler(MEMSET, NOEUDS + TAILLE_NOEUD * k, 0, TAILLE_NOEUD);

  let n = 0;
  for (let taille = 0xA0000; taille >= 0x400; taille -= 0x400) {     // la mémoire conventionnelle
    const bloc = jeu.appeler(ALLOUER_DOS, taille);
    if ((bloc | 0) === 0) continue;
    poserLong(jeu, BLOCS + TAILLE_BLOC * n + 8, taille);
    poserLong(jeu, BLOCS + TAILLE_BLOC * n, (bloc & 0xFFFF) << 4);
    poserLong(jeu, BLOCS + TAILLE_BLOC * n + 4, bloc >>> 16);
    taille += 0x400;                                   // reprendre la même taille
    n++;
  }
  for (let taille = 0x1000000; taille >= 0x1000; taille -= 0x1000) { // la mémoire étendue
    poserLong(jeu, BLOCS + TAILLE_BLOC * n, jeu.appeler(ALLOUER, taille));
    if (long(jeu, BLOCS + TAILLE_BLOC * n) === 0) continue;
    for (let reste = 0x1000; reste > 0; reste -= 0x10) {
      if (jeu.appeler(REDIMENSIONNER, long(jeu, BLOCS + TAILLE_BLOC * n), (taille + reste) | 0) !== 0) {
        poserLong(jeu, BLOCS + TAILLE_BLOC * n + 8, (taille + reste) | 0);
        poserLong(jeu, BLOCS + TAILLE_BLOC * n + 4, 0);
        break;
      }
    }
    taille += 0x1000;
    n++;
  }
  for (let taille = 0x1000; taille >= 0x10; taille -= 0x10) {        // les miettes
    poserLong(jeu, BLOCS + TAILLE_BLOC * n, jeu.appeler(ALLOUER, taille));
    if (long(jeu, BLOCS + TAILLE_BLOC * n) === 0) continue;
    poserLong(jeu, BLOCS + TAILLE_BLOC * n + 8, taille);
    poserLong(jeu, BLOCS + TAILLE_BLOC * n + 4, 0);
    taille += 0x1000;                                  // anomalie : 0x1000 au lieu de 0x10
    n++;
  }

  jeu.appeler(TRIER, BLOCS, n, TAILLE_BLOC, COMPARER_LES_BLOCS);
  for (let k = 0; k < NOMBRE_DE_BLOCS; k++) poserLong(jeu, NOEUDS + TAILLE_NOEUD * k + 4, 0);
  for (let k = 0; k < n; k++) {
    poserLong(jeu, NOEUDS + TAILLE_NOEUD * k, long(jeu, BLOCS + TAILLE_BLOC * k));
    poserLong(jeu, NOEUDS + TAILLE_NOEUD * k + 4, long(jeu, BLOCS + TAILLE_BLOC * k + 8));
    poserLong(jeu, NOEUDS + TAILLE_NOEUD * k + 0xC, k === 0 ? 0 : NOEUDS + TAILLE_NOEUD * (k - 1));
    poserLong(jeu, NOEUDS + TAILLE_NOEUD * k + 8, NOEUDS + TAILLE_NOEUD * (k + 1));
    poserOctet(jeu, NOEUDS + TAILLE_NOEUD * k + 0x10, 0);
    poserOctet(jeu, NOEUDS + TAILLE_NOEUD * k + 0x11, k);
  }
  poserLong(jeu, NOEUDS + TAILLE_NOEUD * (n - 1) + 8, 0);
  jeu.appeler(LIBERER_DOS, (reserve >>> 16) & 0xFFFF);
}

// =====================================================================================================
// Toutes prouvées par comparer.mjs (0 divergence) sur les douze scénarios de moteur/scenarios, et par
// verifier.mjs (IDENTIQUE, avec --empoisonner, et sans sur demo.json). Chaque fonction est appelée
// par au moins un scénario : 0x4C50B manque à demo, feux, travaux et menus, mais la bourse l'appelle
// 12 895 fois ; 0x4FB79 manque à parc, ecrans et triche (le nom n'y défile que dans des écrans), mais
// les neuf autres l'appellent ; 0x50366 et 0x4DFAC sont appelées deux à six fois par scénario, dans
// les deux résolutions (parc, ecrans).
//
// Les branches n'ont pas été relevées une à une : ce que les scénarios désignent (attraction,
// employé, boutique, visiteur, panneau) dépend de leurs clics, et le mécanicien en réparation, les
// états d'employé 0x16 à 0x30 et le texte de pause ne sont vraisemblablement pas tous exercés.
//
// `zones` pour 0x4E359 : elle décrémente l'octet +0xC4 de l'objet désigné, dans le tas. `memoire:
// 'entiere'` pour 0x82950 : sans elle, la seconde exécution comparée repartait du tas de la
// bibliothèque C laissé par la première (mémoire conventionnelle et tas ne sont pas relevés par
// défaut), et s'égarait dans sa liste chaînée jusqu'à épuiser la durée du scénario.
export const reecritures = [
  { adresse: 0x50366, nom: 'reglerLaBarreDeMenus', fn: (jeu) => reglerLaBarreDeMenus(jeu), arguments: 0 },
  { adresse: 0x4DFAC, nom: 'adapterLesZonesALaResolution', fn: (jeu) => adapterLesZonesALaResolution(jeu), arguments: 0 },
  { adresse: 0x4C0B2, nom: 'ecrireUneSomme', fn: ecrireUneSomme, arguments: 2, retour: true },
  { adresse: 0x4C50B, nom: 'nomDuJoueur', fn: nomDuJoueur, arguments: 1, retour: true },
  { adresse: 0x4FB79, nom: 'ecrireEnDefilant', fn: ecrireEnDefilant, arguments: 6 },
  { adresse: 0x4DE1A, nom: 'dessinerLaBarreDOutils', fn: dessinerLaBarreDOutils, arguments: 1 },
  { adresse: 0x4E359, nom: 'rafraichirLEcranDuParc', fn: (jeu) => rafraichirLEcranDuParc(jeu), arguments: 0,
    zones: (jeu) => {
      // Le compte à rebours +0xC4 de l'attraction désignée, dans le tas des objets du parc.
      const objet = (long(jeu, OBJETS_DU_PARC) + TAILLE_OBJET * mot(jeu, OBJET_DESIGNE)) >>> 0;
      return [[objet, objet + TAILLE_OBJET]];
    } },
  { adresse: 0x82950, nom: 'ramasserLaMemoireLibre', fn: (jeu) => ramasserLaMemoireLibre(jeu), arguments: 0,
    // Elle ramasse toute la mémoire de la machine et bâtit dedans le tas de la bibliothèque C :
    // la comparaison doit tout remettre entre les deux exécutions, la mémoire conventionnelle et
    // le tas compris, sans quoi la seconde repart de ce que la première a laissé et s'égare dans
    // une liste chaînée qui n'est plus la sienne.
    memoire: 'entiere' },
];

export const enAttente = [];
