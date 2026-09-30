// Le dessin des fenêtres et des textes de l'interface.
//
// Réécriture lisible de 0x35F21, 0x3CC79, 0x3D72B, 0x3E0D4, 0x3E149, 0x3E34E, 0x3E553, 0x3E5E4,
// 0x3E673, 0x3E705, 0x3EF1D, 0x3F49E, 0x40858, 0x408D3, 0x40D3E et 0x40D79.
// Voir docs/guide-reecriture.md.
//
// UNE FENÊTRE EST UNE LISTE DE MORCEAUX, CHACUN UNE LISTE D'ORDRES DE DESSIN.
//
// La table des fenêtres, 0xB762D, donne 21 octets par fenêtre :
//   +0 à +9   jusqu'à dix numéros de morceaux, terminés par 0xFD
//   +0x0A     mot : le numéro d'écran que la fenêtre occupe (0xD6652 ; 0 = la vue du parc)
//   +0x0C     mot long : l'adresse d'une variable qui porte une palette — toujours 0xD3B8C
//   +0x10     octet : non nul, la palette de +0x0C est posée à l'ouverture
//   +0x11     mot long : une routine appelée après le dessin ; 0 = aucune
// Elle compte 27 fenêtres (0 à 26), la dernière vide.
//
// Un morceau est un groupe d'ordres dans la table 0xB67C4, 11 octets par ordre :
//   +0   octet : le code de l'ordre ; un code ≥ 0x80 est l'en-tête d'un groupe, 0xFF en marque la
//        fin, 0xFE la fin de la table entière
//   +1, +3, +5, +7  quatre mots : le rectangle (x0, y0, x1, y1)
//   +9   mot : le paramètre (couleur, numéro d'image, numéro de texte, deux couleurs…)
// 0x408D3 cherche l'en-tête d'un numéro donné et rend le premier ordre qui le suit ; 0x3CC79 les
// exécute jusqu'à 0xFF. Un numéro de morceau absent de la table (0x8F, cité par la fenêtre 10) ne
// dessine rien.
//
// L'ESPACE DE DESSIN ET SON UNITÉ. Tout se dessine dans l'espace logique de 640 de large
// (retro-ingenierie.md § 6.1). L'octet 0xD778A est l'unité de l'interface : **2 en basse
// résolution** (mode 1, 320x200, où l'espace logique est deux fois trop grand et où tout est
// divisé par deux à la sortie) et **1 en haute** (mode 8, 640x480) ; 0x10D42 le pose au
// changement de mode. C'est l'épaisseur d'un trait, le pas d'un biseau, la marge d'un cadre : un
// pixel de l'écran, dit dans l'espace logique.
// Les rectangles des tables, eux, sont écrits une fois pour toutes dans un espace de 640x400 : la
// ligne la plus basse d'un bouton est 348. Seuls les pavages de fond (ordre 0x06) descendent
// jusqu'à 480, pour couvrir aussi l'écran plus haut de la haute résolution. Une même fenêtre sert
// donc aux deux modes, à la même taille apparente ; le scénario de construction les ouvre toutes
// en 320x200.
//
// LES COULEURS. Un pointeur fixe, [0xB14DA] = 0xB67BE, donne six teintes, toujours les mêmes :
//   +0 = 0x40 le fond, +1 = 0x43 le clair, +2 = 0x41, +3 = 0x22 le sombre, +4 = 0x20,
//   +5 = 0x25 la couleur des textes.
// Le programme n'écrit jamais dans 0xB14DA : la fiche est une constante du fichier. Les teintes
// +1 et +3 font le relief extérieur d'un cadre, +2 et +4 le relief intérieur ; le sens s'inverse
// selon le paramètre de relief de 0x3E705. Les panneaux gris de 0x3E0D4 emploient 0x40/0x41/0x42
// écrits en dur.
//
// LES POLICES. Deux, sans rapport l'une avec l'autre :
//  - la **petite police**, 3x6 pixels dessinés à la main (0x80E88 et 0x80F34, dessin-objets.js),
//    qui écrit les enseignes des kiosques ;
//  - la **police de l'interface**, ici : des images d'une banque à part, [0xD3B64], 6 octets par
//    image comme toutes les banques du jeu (+0 les pixels, +4 la largeur, +5 la hauteur). La
//    table 0xB51C1, 256 octets, donne le numéro d'image d'un code de caractère ; elle ne connaît
//    que 45 signes — `%` `'` `-` `0`–`9` `:` `A`–`Z` `.` `,` `(` `)` `/` — et renvoie les
//    minuscules sur les majuscules. Tout le reste vaut 0, l'image vide. La hauteur de ligne,
//    0xD7765, est celle de l'image du `W` (0xB5218, numéro 0x25), relevée au changement de mode.
//
// LES ORDRES tracent des images d'une autre banque, [0xD3B54], celle de l'interface : cadres,
// icônes, fonds. Même format de 6 octets.
//
// LES BOUTONS. Un ordre 0x40 (bouton) ou 0x41 (panneau inerte) confie son rectangle à 0x36001,
// qui l'inscrit dans la table des zones de la fenêtre, 0xCE898, 10 octets par zone (+0 x0, +2 y0,
// +4 x1, +6 y1, +8 le code du bouton, +9 : 1 pour un bouton, 0 pour un panneau) ; 0xD778B les
// compte. 0x36001 n'inscrit que si 0xB14E6 est nul, c'est-à-dire pendant l'ouverture. Ensuite,
// 0x3D72B redessine ces zones à chaque image : un bouton prend son image dans la table 0xB7537
// (6 octets : +0 l'image au repos, +2 l'image enfoncée, +4 non établi), et 0xD778C porte le
// numéro de la zone enfoncée (0xFF : aucune). 0x40858 classe le code d'un bouton en quatre
// genres ; le genre 2 se dessine non pas par une image mais par un cadre à coins.
//
// OÙ L'ON DESSINE. 0x35F21 échange la surface de dessin [0xDE5BC] contre le tampon de fond
// [0xD3B98] le temps de l'ouverture : le décor de la fenêtre est peint dans le fond, que la
// restauration par blocs (0x54ED6) remettra à chaque image, et seuls les boutons et les valeurs
// sont retracés ensuite dans la surface.

import { ADRESSES } from './etat.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const s8 = (v) => (v << 24) >> 24;
// `idiv` : division entière tronquée vers zéro. Le compilateur la rend aussi par
// `cdq ; sub eax,edx ; sar eax,1` (moitié) et `cdq ; shl edx,8 ; sbb eax,edx ; sar eax,8` (256es).
const idiv = (a, b) => (a / b) | 0;
const moitie = (v) => (v / 2) | 0;
const sur256 = (v) => (v / 256) | 0;

const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// --- les variables du jeu ----------------------------------------------------------------------
const MODE = ADRESSES.modeAffichage;      // mot : 1 = 320x200, 8 = 640x480
const SURFACE = ADRESSES.tamponEcran;     // pointeur : la surface de dessin, [0xDE5BC]
const FOND = 0xD3B98;                     // pointeur : le tampon de fond
const ECRAN_COURANT = ADRESSES.ecranCourant;      // mot 0xD6652
const REDESSINER_CARTE = ADRESSES.redessinerCarte; // mot 0xD666E
const LARGEUR_TUILE = ADRESSES.largeurTuile;      // mot 0xD663A : 48 ou 24
const HAUTEUR_TUILE = ADRESSES.hauteurTuile;      // mot 0xD6654 : 32 ou 16

const EPAISSEUR = 0xD778A;         // octet : l'unité de l'interface, 2 en 320x200, 1 en 640x480
const HAUTEUR_DE_LIGNE = 0xD7765;  // octet : hauteur de l'image du « W » de la police
const TEINTES = 0xB14DA;           // pointeur vers six couleurs (voir l'en-tête)
const BANQUE_INTERFACE = 0xD3B54;  // pointeur : images des cadres, icônes et fonds, 6 octets
const BANQUE_POLICE = 0xD3B64;     // pointeur : images de la police de l'interface, 6 octets
const CARACTERES = 0xB51C1;        // 256 octets : code de caractère -> numéro d'image
const TEXTES = 0xD7BD0;            // pointeur vers une table de pointeurs de textes
const DRAPEAUX_TRACEUR = 0xBECBC;  // mot : drapeaux appliqués à la prochaine image (§ 6.5)

const TABLE_DES_FENETRES = 0xB762D;   // 21 octets par fenêtre
const TAILLE_FENETRE = 21;
const ECRAN_DE_LA_FENETRE = TABLE_DES_FENETRES + 0x0A;  // 0xB7637, relu par 0x3D72B
const TABLE_DES_ORDRES = 0xB67C4;     // 11 octets par ordre
const TAILLE_ORDRE = 11;
const TABLE_DES_BOUTONS = 0xB7537;    // 6 octets par bouton
const ZONES = 0xCE898;                // 10 octets par zone de la fenêtre courante
const TAILLE_ZONE = 10;
const NOMBRE_DE_ZONES = 0xD778B;      // octet : combien 0x36001 en a inscrit
const ZONE_ENFONCEE = 0xD778C;        // octet signé : la zone enfoncée, 0xFF (−1) si aucune
const FENETRE_OUVERTE = 0xB14E6;      // mot : la fenêtre en cours ; 0 pendant son ouverture
const FENETRE_COURANTE = 0xD6608;     // mot : la dernière fenêtre demandée à 0x35F21
const OUTIL = 0xD6670;                // mot : l'outil de construction en cours (§ 6.7)
const OUTIL_SUSPENDU = 0xD6626;       // mot : l'outil mis de côté le temps de la fenêtre
const ECRAN_PLEIN = 0xB150F;          // octet, posé par 0x40D3E, levé par 0x40D79 (§ 6.6)
const RAFRAICHISSEMENT_TOTAL = 0xD6BCD;  // octet : l'image entière circule, sans la grille
const OBJET_DESIGNE = 0xD6678;        // mot : l'objet du parc dont la fenêtre parle
const OBJETS_DU_PARC = 0xD3B10;       // pointeur : enregistrements de 200 octets
const TAILLE_OBJET_DU_PARC = 0xC8;
const FIGURES = 0xD3B38;              // pointeur : table de mots, figure -> objet graphique

// --- les routines appelées ---------------------------------------------------------------------
const LIGNE_BASSE = 0x81374, LIGNE_HAUTE = 0x8148C;      // (x0, y0, x1, y1, couleur, 0)
const LIGNE2_BASSE = 0x949BC, LIGNE2_HAUTE = 0x949DA;    // (x0, y0, x1, y1, couleur)
const RECTANGLE_PLEIN = 0x1188C;                          // (x, y, largeur, hauteur, couleur)
const TRACER_BASSE = 0x5EC9C, TRACER_HAUTE = 0x55BD4;    // (x, y, entrée d'image)
const TRACER_SILHOUETTE = 0x117B3;                        // (x, y, entrée, couleur)
// (x, y, entrée, drapeaux) : en 640x480, l'image est tracée au double de sa taille par 0x66DFA ;
// en 320x200, telle quelle, avec les drapeaux donnés. Les images des boutons et des icônes de
// l'interface sont donc dessinées pour l'espace logique de la basse résolution.
const TRACER_ICONE = 0x20F4C;
const TRACER_REDUIT = 0x66DFA;                            // (entrée, x, y, largeur, hauteur)
const VALEUR_ABSOLUE = 0x80BF2;
const DESSINER_CARTE = 0x1B837;                           // (colonne, rangée, rangées) § 6.3
const INSCRIRE_UNE_ZONE = 0x36001;                        // (ordre) -> table 0xCE898
const PANNEAU_DE_JAUGES = 0x3DE18;                        // (x0, y0, x1, y1)
const TEXTE_CENTRE = 0x3F377;                             // (x0, x1, y, texte, normal, couleur)
const CHARGER_UNE_IMAGE = 0x7F0B0;                        // (nom de fichier, destination)
const ATTENDRE_BALAYAGE = 0x80BE4;                         // attend le retour du balayage vertical
const POSER_LA_PALETTE = 0x808B0;                         // (palette)
const AVANT_ECRAN_PLEIN = 0x80990;
const VIDER_GRILLE = 0x54CE4;

const basseResolution = (jeu) => (jeu.m8[MODE] & 1) !== 0;
const teinte = (jeu, k) => jeu.m8[(long(jeu, TEINTES) + k) | 0];
const imageInterface = (jeu, n) => (long(jeu, BANQUE_INTERFACE) + Math.imul(n, 6)) | 0;
const imagePolice = (jeu, n) => (long(jeu, BANQUE_POLICE) + Math.imul(n, 6)) | 0;

// Une ligne, dans la routine du mode courant. Le sixième paramètre vaut toujours zéro ; son rôle
// n'est pas établi.
function ligne(jeu, x0, y0, x1, y1, couleur) {
  jeu.appeler(basseResolution(jeu) ? LIGNE_BASSE : LIGNE_HAUTE, x0, y0, x1, y1, couleur & 0xFF, 0);
}

// La seconde routine de ligne du jeu (0x949BC en basse résolution, 0x949DA en haute) : elle divise
// elle-même ses coordonnées par deux en mode 1, là où 0x81374 double sa fenêtre de découpe. Ce qui
// la distingue de la première n'est pas établi ; seuls l'ordre 0x05 et le tableau de l'ordre 0x17
// s'en servent.
function ligne2(jeu, x0, y0, x1, y1, couleur) {
  jeu.appeler(basseResolution(jeu) ? LIGNE2_BASSE : LIGNE2_HAUTE, x0, y0, x1, y1, couleur & 0xFF);
}

// Tracer une image de banque, dans la routine du mode courant (§ 6.5 : le code C prend 0x5EC9C en
// mode 1 et 0x55BD4 sinon, qui marque en plus les blocs touchés).
function tracer(jeu, x, y, entree) {
  jeu.appeler(basseResolution(jeu) ? TRACER_BASSE : TRACER_HAUTE, x, y, entree);
}

// =================================================================================================
// LES CADRES ET LES PANNEAUX
// =================================================================================================

// 0x3E149 — le cadre biseauté : quatre traits, deux couleurs.
//
// Le haut et la gauche prennent `couleurHautGauche`, la droite et le bas `couleurBasDroite` ;
// c'est ce qui donne le relief. Les trois côtés qui suivent le premier commencent une épaisseur
// plus loin, pour ne pas repasser sur le coin.
// Anomalie reproduite : le trait du bas est décalé d'une épaisseur vers la droite, d'où un pixel
// qui dépasse à droite et un trou d'un pixel à gauche, en bas.
// La fonction est appelée des milliers de fois par image : c'est le trait de toute l'interface.
export function cadreBiseaute(jeu, x0, y0, x1, y1, couleurBasDroite, couleurHautGauche) {
  const e = octet(jeu, EPAISSEUR);
  ligne(jeu, s16(x0), s16(y0), s16(x1), s16(y0), couleurHautGauche);          // haut
  ligne(jeu, s16(x1), s16(y0 + e), s16(x1), s16(y1), couleurBasDroite);       // droite
  ligne(jeu, s16(x0 + e), s16(y1), s16(x1 + e), s16(y1), couleurBasDroite);   // bas
  ligne(jeu, s16(x0), s16(y0 + e), s16(x0), s16(y1), couleurHautGauche);      // gauche
}

// 0x3E34E — le rectangle d'une seule couleur.
//
// Chaque trait déborde d'une épaisseur au-delà de son coin de fin, ce qui ferme les angles.
export function rectangleUni(jeu, x0, y0, x1, y1, couleur) {
  const e = octet(jeu, EPAISSEUR);
  ligne(jeu, s16(x0), s16(y0), s16(x1 + e), s16(y0), couleur);   // haut
  ligne(jeu, s16(x1), s16(y0), s16(x1), s16(y1 + e), couleur);   // droite
  ligne(jeu, s16(x0), s16(y1), s16(x1 + e), s16(y1), couleur);   // bas
  ligne(jeu, s16(x0), s16(y0), s16(x0), s16(y1 + e), couleur);   // gauche
}

// 0x3E0D4 — le panneau gris enfoncé.
//
// Un aplat de la couleur 0x41 bordé d'un biseau 0x42 en bas et à droite, 0x40 en haut et à gauche :
// un creux. Les trois couleurs sont écrites en dur, sans passer par la fiche des teintes. C'est le
// fond des cases de valeurs des écrans de gestion.
export function panneauEnfonce(jeu, x0, y0, x1, y1) {
  const e = octet(jeu, EPAISSEUR);
  jeu.appeler(RECTANGLE_PLEIN, s16(x0), s16(y0), s16(e + (x1 - x0)), s16(e + (y1 - y0)), 0x41);
  jeu.appeler(0x3E149, u16(x0), u16(y0), u16(x1), u16(y1), 0x42, 0x40);
}

// 0x3E705 — le cadre à coins arrondis.
//
// Quatre traits, un cadre biseauté à l'intérieur, puis quatre images de coin. `relief` non nul
// donne le cadre en saillie (clair en haut et à gauche), nul le donne en creux ; `coin` est le
// numéro de la première de quatre images consécutives de la banque de l'interface — le jeu n'en
// emploie que trois jeux, 0xA1, 0xA5 et 0xA9.
// Les traits extérieurs s'arrêtent à deux épaisseurs des coins, où les images prennent le relais ;
// les images de coin sont posées à trois épaisseurs des bords opposés.
export function cadreACoins(jeu, x0, y0, x1, y1, relief, coin) {
  const e = octet(jeu, EPAISSEUR);
  const enSaillie = (relief & 0xFF) !== 0;
  const dehorsClair = enSaillie ? teinte(jeu, 1) : teinte(jeu, 3);
  const dehorsSombre = enSaillie ? teinte(jeu, 3) : teinte(jeu, 1);
  ligne(jeu, s16(x0 + 2 * e), s16(y0), s16(x1 - e), s16(y0), dehorsClair);          // haut
  ligne(jeu, s16(x0), s16(y0 + 2 * e), s16(x0), s16(y1 - e), dehorsClair);          // gauche
  ligne(jeu, s16(x1), s16(y0 + 2 * e), s16(x1), s16(y1 - e), dehorsSombre);         // droite
  ligne(jeu, s16(x0 + 2 * e), s16(y1), s16(x1 - e), s16(y1), dehorsSombre);         // bas
  const dedansBas = enSaillie ? teinte(jeu, 4) : teinte(jeu, 2);
  const dedansHaut = enSaillie ? teinte(jeu, 2) : teinte(jeu, 4);
  jeu.appeler(0x3E149, u16(x0 + e), u16(y0 + e), u16(x1 - e), u16(y1 - e), dedansBas, dedansHaut);

  const n = u16(coin);
  tracer(jeu, s16(x0), s16(y0), imageInterface(jeu, n));                     // coin haut gauche
  tracer(jeu, s16(x1 - 3 * e), s16(y0), imageInterface(jeu, n + 1));         // haut droite
  tracer(jeu, s16(x0), s16(y1 - 3 * e), imageInterface(jeu, n + 2));         // bas gauche
  tracer(jeu, s16(x1 - 3 * e), s16(y1 - 3 * e), imageInterface(jeu, n + 3)); // bas droite
}

// Le fond d'un cadre à coins : un aplat de la teinte de fond, puis le cadre. Les trois variantes
// ne diffèrent que par la marge de l'aplat, le jeu de coins et le relief.
function cadreRempli(jeu, x0, y0, x1, y1, margeDeFin, relief, coin) {
  const e = octet(jeu, EPAISSEUR);
  jeu.appeler(RECTANGLE_PLEIN, s16(2 * e + x0), s16(2 * e + y0),
    s16((x1 - x0) - margeDeFin * e), s16((y1 - y0) - margeDeFin * e), teinte(jeu, 0));
  jeu.appeler(0x3E705, s16(x0), s16(y0), s16(x1), s16(y1), relief, coin);
}

// 0x3E553 — le panneau en creux à coins 0xA5. L'aplat s'arrête une épaisseur avant le bord droit
// et le bord bas (marge de trois épaisseurs pour deux d'entrée) : le biseau y reste visible.
export function panneauCreux(jeu, x0, y0, x1, y1) { cadreRempli(jeu, x0, y0, x1, y1, 3, 0, 0xA5); }

// 0x3E5E4 — le panneau en creux à coins 0xA1, dont l'aplat va jusqu'au bord.
export function panneauCreuxCarre(jeu, x0, y0, x1, y1) { cadreRempli(jeu, x0, y0, x1, y1, 2, 0, 0xA1); }

// 0x3E673 — le panneau en saillie à coins 0xA9 : un bouton au repos.
export function panneauSaillant(jeu, x0, y0, x1, y1) { cadreRempli(jeu, x0, y0, x1, y1, 2, 1, 0xA9); }

// =================================================================================================
// LE TEXTE
// =================================================================================================

// 0x3F49E — écrire une chaîne, et rendre l'abscisse où elle s'arrête.
//
// La fonction la plus appelée du jeu : 19 346 fois dans la démonstration, une par chaîne, et
// près de 300 000 appels au traceur derrière elle. C'est elle que cherchait le § 6.5 en disant du
// tracé silhouette de 0x11BD5 qu'il était « probablement le texte ».
//
// `normal` nul : chaque signe est tracé en silhouette de `couleur` (drapeau 0x40 du traceur, posé
// pour toute la chaîne), par 0x117B3, en coordonnées **non signées**. Sinon, les images de la
// police sont tracées telles quelles, en coordonnées signées, et `couleur` est ignorée.
//
// L'espace n'a pas d'image : il avance de 8 en basse résolution, 4 en haute — huit et quatre
// unités de l'espace logique, soit la même largeur à l'écran. Chaque autre signe avance de la
// largeur de son image plus deux unités en basse résolution, une en haute.
//
// La ligne de base : la virgule et le point descendent de (hauteur de ligne − hauteur de l'image),
// le tiret se pose à mi-hauteur, le deux-points descend de deux. Anomalie reproduite : le plus et
// le deux-points partagent ce dernier cas, mais le plus n'a pas d'image et sort avant, par le
// test d'image nulle ; ce cas ne sert donc qu'au deux-points.
// Autre anomalie reproduite : un signe inconnu (image 0) n'est pas tracé, mais l'avance est
// calculée avec la largeur de l'image 0.
//
// Le traceur est remis à zéro en sortant, qu'on ait posé le drapeau ou non.
//
// UN RESTE DE PILE RELU. Comme l'état 4 des visiteurs (journal des essais, § 5.6), une fonction du
// jeu lit ici une variable qu'elle n'a pas écrite, et y trouve ce que cette routine a laissé sous
// son point d'entrée. La liste à choix de l'écran titre, 0x576FE, appelée sans argument par
// 0x1A836 juste après la boucle qui écrit ses six lignes, lit son octet `[ebp-0x14]` en 0x57CA0
// puis le compare au numéro de la ligne en cours en 0x57E38 : la ligne qui l'égale est écrite en
// couleur [0xD7773] au lieu de la couleur du texte, c'est-à-dire montrée comme choisie. Or
// `[ebp-0x14]` de 0x576FE tombe exactement sur l'emplacement où 0x3F49E, appelée avec cinq
// arguments à la même hauteur de pile, a sauvé `ebp` : E − 16, E étant son point d'entrée. La
// valeur y est en fait constante — l'octet bas du `ebp` de 0x1A836 —, assez grand pour ne désigner
// aucune ligne : l'anomalie ne se voit pas dans le jeu d'origine.
// La réécriture n'a pas de cadre en mémoire ; elle repose donc, en sortant, les quatre registres
// que le prologue d'origine sauve (`push ebx`, `push esi`, `push edi`, puis le `ebp` de l'`enter`).
// On les repose à la fin, et non au début : les appels au traceur passent par cette même zone.
// Seul l'octet de E − 16 est relu, à notre connaissance ; les trois autres sont reposés par
// fidélité au cadre d'origine.
export function ecrireTexte(jeu, x, y, texte, normal, couleur) {
  const R = jeu.T.R;
  const pile = R.esp >>> 0;
  const sauves = [R.ebx, R.esi, R.edi, R.ebp];
  if (u16(normal) === 0) poserMot(jeu, DRAPEAUX_TRACEUR, 0x40);
  const mode1 = basseResolution(jeu);
  let abscisse = x;             // le mot de l'argument : relu en 16 bits, rendu en 32
  let p = texte;
  for (;;) {
    const c = octet(jeu, p);
    if (c === 0) break;
    if (c === 0x20) {                                   // l'espace
      abscisse = (s16(abscisse) + (mode1 ? 8 : 4)) | 0;
      p = (p + 1) | 0;
      continue;
    }
    const image = octet(jeu, CARACTERES + c);
    if (image !== 0) {
      let descente = 0;
      if (c === 0x2C || c === 0x2E) {                   // la virgule et le point, sur la ligne
        descente = octet(jeu, HAUTEUR_DE_LIGNE) - octet(jeu, imagePolice(jeu, image) + 5);
      } else if (c === 0x2D) {                          // le tiret, à mi-hauteur
        descente = moitie(octet(jeu, HAUTEUR_DE_LIGNE));
      } else if (c === 0x2B || c === 0x3A) {            // le plus (mort) et le deux-points
        descente = 2;
      }
      if (u16(normal) !== 0) {
        tracer(jeu, s16(abscisse), s16(y + descente), imagePolice(jeu, image));
      } else {
        jeu.appeler(TRACER_SILHOUETTE, u16(abscisse), u16(y + descente),
          imagePolice(jeu, image), couleur & 0xFF);
      }
    }
    const largeur = octet(jeu, imagePolice(jeu, image) + 4);
    abscisse = (s16(abscisse) + largeur + (mode1 ? 2 : 1)) | 0;
    p = (p + 1) | 0;
  }
  poserMot(jeu, DRAPEAUX_TRACEUR, 0);
  for (let k = 0; k < 4; k++) poserLong(jeu, (pile - 4 - 4 * k) | 0, sauves[k]);
  return abscisse;
}

// =================================================================================================
// LE DESSIN D'UN OBJET GRAPHIQUE DANS UN CADRE
// =================================================================================================

// 0x3EF1D — poser un objet graphique dans un rectangle : centré s'il y tient, réduit sinon.
//
// L'objet graphique est une chaîne de morceaux (objets.js) ; ses octets +2 et +3 donnent son
// emprise. Un premier passage relève le plus petit décalage horizontal et le plus petit décalage
// vertical de la chaîne, qui servent d'origine.
//
// S'il tient dans le rectangle, chaque morceau est tracé à sa place, la chaîne étant centrée.
// Sinon, on calcule un facteur en 256es pour chaque axe, on garde le plus petit en valeur absolue
// (0x80BF2), et chaque image est confiée à 0x66DFA, qui la trace à la taille voulue ; l'ensemble
// est centré de la même façon, et chaque morceau est décalé de deux unités vers le bas et la
// droite — sans que ces deux unités s'expliquent.
//
// Un morceau dont les drapeaux ont le bit 7 posé est sauté. Les autres posent leurs drapeaux dans
// le traceur, remis à zéro en sortant.
// Seul l'ordre 0x10 emploie cette fonction, pour montrer l'emblème d'un pays ou d'une attraction.
export function objetDansUnCadre(jeu, x0, y0, x1, y1, objetGraphique) {
  const MORCEAUX = 0xD3B7C, OBJETS_GRAPHIQUES = 0xD3B80, IMAGES = 0xD3BB8;
  const base = long(jeu, MORCEAUX);
  const suivant = (m) => (base + Math.imul(mot(jeu, m + 8), 10)) | 0;
  const fiche = (long(jeu, OBJETS_GRAPHIQUES) + u16(objetGraphique) * 8) | 0;
  const largeurNaturelle = octet(jeu, fiche + 2), hauteurNaturelle = octet(jeu, fiche + 3);
  const largeurCible = s16(x1 - x0), hauteurCible = s16(y1 - y0);

  // L'origine de la chaîne : le plus petit décalage de chaque axe.
  let minX = 0x7FFF, minY = 0x7FFF;
  for (let m = (base + Math.imul(mot(jeu, fiche), 10)) | 0; (m >>> 0) > (base >>> 0); m = suivant(m)) {
    if (motSigne(jeu, m + 2) < s16(minX)) minX = motSigne(jeu, m + 2);
    if (motSigne(jeu, m + 4) < s16(minY)) minY = motSigne(jeu, m + 4);
  }
  let m = (base + Math.imul(mot(jeu, fiche), 10)) | 0;

  if (largeurNaturelle <= largeurCible && hauteurNaturelle <= hauteurCible) {
    // À sa taille, centré dans le rectangle.
    const ox = (s16(x0) + moitie(largeurCible - largeurNaturelle)) | 0;
    const oy = (s16(y0) + moitie(hauteurCible - hauteurNaturelle)) | 0;
    for (; (m >>> 0) > (base >>> 0); m = suivant(m)) {
      if (octet(jeu, m + 6) & 0x80) continue;
      poserMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, m + 6));
      const image = (long(jeu, IMAGES) + mot(jeu, m)) | 0;
      tracer(jeu, s16(ox - s16(minX) + motSigne(jeu, m + 2)), s16(oy - s16(minY) + motSigne(jeu, m + 4)), image);
    }
  } else {
    // Réduit : le facteur en 256es, le plus petit des deux axes en valeur absolue.
    let facteur = idiv(largeurCible << 8, largeurNaturelle);
    const facteurVertical = idiv(hauteurCible << 8, hauteurNaturelle);
    if (jeu.appeler(VALEUR_ABSOLUE, facteur) > jeu.appeler(VALEUR_ABSOLUE, facteurVertical)) {
      facteur = facteurVertical;
    }
    for (; (m >>> 0) > (base >>> 0); m = suivant(m)) {
      if (octet(jeu, m + 6) & 0x80) continue;
      poserMot(jeu, DRAPEAUX_TRACEUR, mot(jeu, m + 6));
      const image = (long(jeu, IMAGES) + mot(jeu, m)) | 0;
      const largeur = sur256(Math.imul(octet(jeu, image + 4), facteur));
      const hauteur = sur256(Math.imul(octet(jeu, image + 5), facteur));
      const ox = (s16(x0) + moitie(largeurCible - sur256(Math.imul(largeurNaturelle, facteur)))) | 0;
      const px = (ox + sur256(Math.imul(motSigne(jeu, m + 2) - s16(minX), facteur))) | 0;
      const oy = (s16(y0) + moitie(hauteurCible - sur256(Math.imul(hauteurNaturelle, facteur)))) | 0;
      const py = (oy + sur256(Math.imul(motSigne(jeu, m + 4) - s16(minY), facteur))) | 0;
      jeu.appeler(TRACER_REDUIT, image, s16(px + 2), s16(py + 2), u16(largeur), u16(hauteur));
    }
  }
  poserMot(jeu, DRAPEAUX_TRACEUR, 0);
}

// =================================================================================================
// LES ORDRES DE DESSIN D'UNE FENÊTRE
// =================================================================================================

// 0x408D3 — trouver un morceau dans la table des ordres.
//
// La table est une suite d'ordres de 11 octets ; un en-tête porte le numéro du morceau, 0xFE clôt
// la table. La fonction rend l'adresse de l'ordre qui suit l'en-tête cherché, ou 0 si le numéro
// n'existe pas — ce qui arrive : la fenêtre 10 cite le morceau 0x8F, absent.
// Le morceau 0x81 figure deux fois dans la table ; seul le premier est atteint.
export function trouverUnMorceau(jeu, numero) {
  for (let a = TABLE_DES_ORDRES; ; a = (a + TAILLE_ORDRE) | 0) {
    const code = octet(jeu, a);
    if (code === 0xFE) return 0;
    if (code === (numero & 0xFF)) return (a + TAILLE_ORDRE) | 0;
  }
}

// 0x40858 — le genre d'un bouton, d'après son code.
//
// Quatre genres, dont 0x3D72B ne distingue que le 2 : celui-là se redessine par un cadre à coins
// en saillie au lieu d'une image. Ce que valent les genres 0, 1 et 3 n'est pas établi ; d'autres
// fonctions de l'interface, hors de ce module, s'en servent.
// Le code 0x17 est le seul du genre 2 ; le code 0x18 le seul du genre 0.
export function genreDeBouton(jeu, code) {
  const c = code & 0xFF;
  if (c < 0x13) {
    if (c < 2) return 3;
    if (c <= 0x0F) return 1;
    if (c <= 0x11) return 3;
    return 1;                       // 0x12
  }
  if (c <= 0x14) return 3;          // 0x13, 0x14
  if (c < 0x17) return 1;           // 0x15, 0x16
  if (c <= 0x17) return 2;          // 0x17
  if (c < 0x19) return 0;           // 0x18
  if (c <= 0x20) return 1;
  if (c <= 0x22) return 3;
  return 0;
}

// L'ordre 0x06 : paver un rectangle d'une même image, de gauche à droite et de haut en bas.
// Le pas est la taille de l'image moins une épaisseur, ce qui fait se recouvrir les pavés d'un
// pixel. La dernière colonne et la dernière rangée ne sont posées que si elles tiennent en entier.
function paver(jeu, ordre, x0, y0, x1, y1) {
  const e = octet(jeu, EPAISSEUR);
  const image = imageInterface(jeu, mot(jeu, ordre + 9));
  const pasX = s16(octet(jeu, image + 4) - e), pasY = s16(octet(jeu, image + 5) - e);
  for (let y = y0; s16(y) <= s16(y1) - pasY; y = (y + pasY) | 0) {
    for (let x = x0; s16(x) <= s16(x1) - pasX; x = (x + pasX) | 0) {
      tracer(jeu, s16(x), s16(y), image);
    }
  }
}

// L'ordre 0x15 : la vue du parc autour de l'objet dont la fenêtre parle.
//
// La fenêtre montre l'objet 0xD6678 au milieu d'un morceau de carte. La colonne de départ recule
// de la moitié des colonnes visibles, la rangée de la moitié des rangées du tiers supérieur, et
// l'on demande un redessin complet du fond avant d'appeler 0x1B837 (§ 6.3). Les objets de type 4,
// 0x0A et 0x10 sont cadrés deux rangées plus haut que les autres.
// Le nombre de rangées visibles est ⌈hauteur / hauteur de tuile⌉, hauteur valant 400 en basse
// résolution et 480 en haute ; on en retranche un tiers, la fenêtre n'occupant pas tout l'écran.
function vueDuParc(jeu) {
  if (mot(jeu, OBJET_DESIGNE) === 0) return;
  const objet = (long(jeu, OBJETS_DU_PARC) + Math.imul(mot(jeu, OBJET_DESIGNE), TAILLE_OBJET_DU_PARC)) | 0;
  const colonne = (octet(jeu, objet + 7) + 1 - moitie(idiv(640, mot(jeu, LARGEUR_TUILE)))) | 0;

  const hauteur = () => (basseResolution(jeu) ? 400 : 480);
  const rangeesVisibles = () => idiv(mot(jeu, HAUTEUR_TUILE) + hauteur() - 1, mot(jeu, HAUTEUR_TUILE));
  let rangee = (octet(jeu, objet + 9) - 2 - moitie(rangeesVisibles() - idiv(rangeesVisibles(), 3))) | 0;
  const type = octet(jeu, objet + 4);
  if (!(type === 4 || type === 0x0A || type === 0x10)) rangee = (rangee + 2) | 0;

  poserMot(jeu, REDESSINER_CARTE, 1);
  const rangees = (rangeesVisibles() - idiv(rangeesVisibles(), 3)) | 0;
  jeu.appeler(DESSINER_CARTE, s16(colonne), s16(rangee), s16(rangees));
}

// L'ordre 0x17 : le cadre d'un tableau — un panneau en creux, une bande de titre, une colonne à
// droite, puis des séparateurs tous les 14 pixels jusqu'au bas du cadre.
function cadreDeTableau(jeu, x0, y0, x1, y1) {
  jeu.appeler(0x3E553, s16(x0), s16(y0), s16(x1), s16(y1));
  jeu.appeler(RECTANGLE_PLEIN, s16(x0 + 6), s16(y0 + 6), s16((x1 - x0) - 0x0A), 0x16, 0x41);
  jeu.appeler(RECTANGLE_PLEIN, s16(x1 - 0x38), s16(y0 + 0x18), 0x34, s16((y1 - y0) - 0x1C), 0x41);
  for (let y = (y0 + 0x28) | 0; s16(y) < s16(y1); y = (y + 0x0E) | 0) {
    ligne2(jeu, s16(x0 + 6), s16(y), s16(x1 - 0x32), s16(y), 0x41);
  }
}

// Un ordre 0x40 ou 0x41 : un bouton ou un panneau inerte, inscrit dans la table des zones de la
// fenêtre par 0x36001. Certains objets du parc — types 4, 6 et 0x1C — n'ont pas le bouton dont le
// code est 0x20 : l'ordre est alors passé.
function bouton(jeu, ordre) {
  const objet = (long(jeu, OBJETS_DU_PARC) + Math.imul(mot(jeu, OBJET_DESIGNE), TAILLE_OBJET_DU_PARC)) | 0;
  const type = octet(jeu, objet + 0x0C);
  const sansCeBouton = (type === 4 || type === 6 || type === 0x1C);
  if (sansCeBouton && mot(jeu, ordre + 9) === 0x20) return;
  jeu.appeler(INSCRIRE_UNE_ZONE, ordre);
}

// 0x3CC79 — dessiner une fenêtre : exécuter les ordres de chacun de ses morceaux.
//
// La fiche donne jusqu'à dix numéros de morceaux, terminés par 0xFD ; chaque morceau est une suite
// d'ordres qui s'arrête à 0xFF. Les codes que la table de saut ne connaît pas ne dessinent rien —
// et c'est le cas du code 0x11, employé quatorze fois dans les données : il réserve
// vraisemblablement une place que la routine propre à la fenêtre remplira, mais rien ne l'établit.
// Les codes 0x03, 0x04, 0x05, 0x08, 0x14, 0x17 et 0x18 sont écrits ici mais n'apparaissent dans
// aucun morceau de la table : ils ne sont pas vérifiés.
export function dessinerUneFenetre(jeu, fiche) {
  const e = () => octet(jeu, EPAISSEUR);
  for (let k = 0; ; k = (k + 1) & 0xFF) {
    if (octet(jeu, (fiche + k) | 0) === 0xFD) return;
    let ordre = jeu.appeler(0x408D3, octet(jeu, (fiche + k) | 0));
    while (ordre !== 0) {
      const x0 = mot(jeu, ordre + 1), y0 = mot(jeu, ordre + 3);
      const x1 = mot(jeu, ordre + 5), y1 = mot(jeu, ordre + 7);
      const p = mot(jeu, ordre + 9);
      switch (octet(jeu, ordre)) {
        case 0x01:   // aplat d'une couleur ; le paramètre −1 demande la teinte de fond
          jeu.appeler(RECTANGLE_PLEIN, s16(x0), s16(y0), s16(e() + s16(x1 - x0)), s16(e() + s16(y1 - y0)),
            p === 0xFFFF ? teinte(jeu, 0) : (p & 0xFF));
          break;
        case 0x02: {  // un texte de la table [0xD7BD0], à gauche ou centré entre x0 et x1
          const texte = long(jeu, (long(jeu, TEXTES) + 4 * p) | 0);
          if (x1 === 0) jeu.appeler(0x3F49E, s16(x0), s16(y0), texte, y1, teinte(jeu, 5));
          else jeu.appeler(TEXTE_CENTRE, s16(x0), s16(x1), s16(y0), texte, y1, teinte(jeu, 5));
          break;
        }
        case 0x03:   // un rectangle d'une seule couleur (jamais employé)
          jeu.appeler(0x3E34E, x0, y0, x1, y1, p & 0xFF);
          break;
        case 0x04:   // une image de l'interface (jamais employé)
          tracer(jeu, s16(x0), s16(y0), imageInterface(jeu, p));
          break;
        case 0x05:   // un trait de la seconde routine (jamais employé)
          ligne2(jeu, s16(x0), s16(y0), s16(x1), s16(y1), p & 0xFF);
          break;
        case 0x06:   // paver le rectangle d'une image
          paver(jeu, ordre, x0, y0, x1, y1);
          break;
        case 0x07:   // une icône de l'interface (doublée en 640x480)
          jeu.appeler(TRACER_ICONE, x0, y0, imageInterface(jeu, p), 0);
          break;
        case 0x08:   // un panneau en creux, et 0xB14C0 = −2 (jamais employé)
          jeu.appeler(0x3E553, s16(x0), s16(y0), s16(x1), s16(y1));
          poserMot(jeu, 0xB14C0, 0xFFFE);
          break;
        case 0x09:   // un panneau en creux à coins carrés
          jeu.appeler(0x3E5E4, s16(x0), s16(y0), s16(x1), s16(y1));
          break;
        case 0x0A:   // un panneau en creux
          jeu.appeler(0x3E553, s16(x0), s16(y0), s16(x1), s16(y1));
          break;
        case 0x0B:   // un cadre biseauté : octet bas en bas et à droite, octet haut en haut
          jeu.appeler(0x3E149, x0, y0, x1, y1, p & 0xFF, (p >> 8) & 0xFF);
          break;
        case 0x0F:   // un panneau gris enfoncé
          jeu.appeler(0x3E0D4, s16(x0), s16(y0), s16(x1), s16(y1));
          break;
        case 0x10: { // l'emblème du pays ou de l'attraction en cours, ajusté au rectangle
          const choix = mot(jeu, 0xD6614);
          let table = 0;
          if (choix === 4) table = 0xCCF8F;
          else if (choix === 0x0A) table = 0xD3C88;
          if (table !== 0) {
            const figure = mot(jeu, (table + mot(jeu, 0xD6610)) | 0);
            const objetGraphique = mot(jeu, (long(jeu, FIGURES) + 2 * figure) | 0);
            jeu.appeler(0x3EF1D, s16(x0), s16(y0), s16(x1), s16(y1), objetGraphique);
          }
          break;
        }
        case 0x12:   // le panneau des jauges (0x3DE18)
          jeu.appeler(PANNEAU_DE_JAUGES, s16(x0), s16(y0), s16(x1), s16(y1));
          break;
        case 0x13:   // un cadre à coins 0xA5, en creux
          jeu.appeler(0x3E705, s16(x0), s16(y0), s16(x1), s16(y1), 0, 0xA5);
          break;
        case 0x14:   // un aplat de la couleur donnée (jamais employé)
          jeu.appeler(RECTANGLE_PLEIN, s16(x0), s16(y0), s16(e() + s16(x1 - x0)), s16(e() + s16(y1 - y0)), p & 0xFF);
          break;
        case 0x15:   // la vue du parc autour de l'objet désigné
          vueDuParc(jeu);
          break;
        case 0x16:   // un aplat de la teinte de fond, bordé d'un biseau 0x21 / 0x42
          jeu.appeler(RECTANGLE_PLEIN, s16(x0), s16(y0), s16(e() + s16(x1 - x0)), s16(e() + s16(y1 - y0)), teinte(jeu, 0));
          jeu.appeler(0x3E149, x0, y0, x1, y1, 0x21, 0x42);
          break;
        case 0x17:   // le cadre d'un tableau (jamais employé)
          cadreDeTableau(jeu, x0, y0, x1, y1);
          break;
        case 0x18:   // charger une image dans le tampon de fond (jamais employé)
          jeu.appeler(CHARGER_UNE_IMAGE, long(jeu, (long(jeu, TEXTES) + 4 * p) | 0), long(jeu, FOND));
          break;
        case 0x40:   // un bouton
        case 0x41:   // un panneau inerte
          bouton(jeu, ordre);
          break;
        case 0xFF:   // fin du morceau
          ordre = 0;
          continue;
        default:     // un code inconnu — dont 0x11 — ne dessine rien
          break;
      }
      ordre = (ordre + TAILLE_ORDRE) | 0;
    }
  }
}

// 0x3D72B — redessiner les zones de la fenêtre courante.
//
// Appelée à chaque image tant qu'une fenêtre est ouverte, mais seulement si l'écran affiché est
// bien celui de la fenêtre : la table des fenêtres donne cet écran à son octet +0x0A.
// Une zone de sorte 1 est un bouton : du genre 2, il se redessine par un cadre à coins en saillie,
// quatre pixels en retrait — et pas du tout tant qu'il est enfoncé, le creux restant celui que le
// fond porte. Des autres genres, on trace l'image de la table 0xB7537, celle au repos ou celle
// enfoncée selon 0xD778C. Une zone de sorte 0 est un panneau inerte, redessiné en creux gris.
// La borne de la boucle est relue à chaque tour : une zone inscrite en cours de route serait vue.
export function redessinerLesZones(jeu) {
  const fenetre = mot(jeu, FENETRE_OUVERTE);
  if (mot(jeu, ECRAN_COURANT) !== mot(jeu, (ECRAN_DE_LA_FENETRE + Math.imul(fenetre, TAILLE_FENETRE)) | 0)) return;

  const finDesZones = () => (ZONES + Math.imul(octet(jeu, NOMBRE_DE_ZONES), TAILLE_ZONE)) | 0;
  for (let zone = ZONES; (finDesZones() >>> 0) > (zone >>> 0); zone = (zone + TAILLE_ZONE) | 0) {
    // 0xD778C vaut 0xFF quand aucune zone n'est enfoncée : l'adresse calculée tombe alors avant
    // la table, et ne peut égaler aucune zone.
    const enfoncee = ((ZONES + Math.imul(octetSigne(jeu, ZONE_ENFONCEE), TAILLE_ZONE)) | 0) === zone;
    if (octet(jeu, zone + 9) === 1) {
      const code = octet(jeu, zone + 8);
      const fiche = (TABLE_DES_BOUTONS + Math.imul(code, 6)) | 0;
      if ((jeu.appeler(0x40858, code) & 0xFF) === 2) {
        if (!enfoncee) {
          jeu.appeler(0x3E705, s16(mot(jeu, zone) + 4), s16(mot(jeu, zone + 2) + 4),
            s16(mot(jeu, zone + 4) - 4), s16(mot(jeu, zone + 6) - 4), 1, 0xA9);
        }
      } else {
        jeu.appeler(TRACER_ICONE, mot(jeu, zone), mot(jeu, zone + 2),
          imageInterface(jeu, mot(jeu, fiche + (enfoncee ? 2 : 0))), 0);
      }
    } else {
      jeu.appeler(0x3E0D4, motSigne(jeu, zone), motSigne(jeu, zone + 2),
        motSigne(jeu, zone + 4), motSigne(jeu, zone + 6));
    }
  }
}

// 0x35F21 — ouvrir une fenêtre.
//
// La surface de dessin est échangée contre le tampon de fond le temps du dessin : le décor de la
// fenêtre s'inscrit dans le fond, que la restauration par blocs remettra à chaque image. L'outil
// de construction en cours est mis de côté (0xD6626) et remplacé par « aucun ».
// 0xB14E6 est mis à zéro avant le dessin : c'est à cette condition que 0x36001 inscrit les zones
// des boutons ; il reçoit le numéro de la fenêtre juste après, ce qui ferme l'inscription. La
// routine propre à la fenêtre, si la fiche en donne une, est appelée ensuite.
// Ce que valent 0xD77CC, 0xB14F1, 0xB14F2, 0xB14D9 = 5 et 0xB1511 = 1 n'est pas établi.
export function ouvrirUneFenetre(jeu, numero) {
  poserMot(jeu, FENETRE_COURANTE, numero);
  const surface = long(jeu, SURFACE);
  poserLong(jeu, SURFACE, long(jeu, FOND));

  poserMot(jeu, 0xD77CC, 0);
  poserMot(jeu, OUTIL_SUSPENDU, mot(jeu, OUTIL));
  poserMot(jeu, OUTIL, 0);
  poserMot(jeu, FENETRE_OUVERTE, 0);
  poserOctet(jeu, NOMBRE_DE_ZONES, 0);
  poserOctet(jeu, ZONE_ENFONCEE, 0xFF);
  poserOctet(jeu, 0xB14F1, 0xFF);
  poserOctet(jeu, 0xB14F2, 0xFF);

  const fiche = (TABLE_DES_FENETRES + Math.imul(u16(numero), TAILLE_FENETRE)) | 0;
  if (octet(jeu, fiche + 0x10) !== 0) {
    jeu.appeler(ATTENDRE_BALAYAGE);
    jeu.appeler(POSER_LA_PALETTE, long(jeu, long(jeu, fiche + 0x0C)));
  }
  poserMot(jeu, ECRAN_COURANT, mot(jeu, fiche + 0x0A));
  jeu.appeler(0x3CC79, fiche);
  poserMot(jeu, FENETRE_OUVERTE, numero);
  const routine = long(jeu, fiche + 0x11);
  if (routine !== 0) jeu.appeler(routine);

  poserOctet(jeu, 0xB14D9, 5);
  poserLong(jeu, SURFACE, surface);
  poserOctet(jeu, 0xB1511, 1);
}

// =================================================================================================
// L'ÉCRAN PLEIN
// =================================================================================================

// 0x40D3E — passer à l'écran plein.
//
// L'octet 0xB150F dit qu'un écran occupe tout l'affichage ; l'octet 0xD6BCD demande que l'image
// entière circule, sans la grille des blocs (§ 6.6). La grille est vidée, et 0xB14C2 — l'état de
// la pose d'un chemin, § 6.7 — remis à zéro. Rien n'est fait si l'écran plein est déjà posé.
export function ouvrirEcranPlein(jeu) {
  if (octet(jeu, ECRAN_PLEIN) !== 0) return;
  jeu.appeler(AVANT_ECRAN_PLEIN);
  poserOctet(jeu, ECRAN_PLEIN, 1);
  jeu.appeler(VIDER_GRILLE);
  poserOctet(jeu, RAFRAICHISSEMENT_TOTAL, 1);
  poserMot(jeu, 0xB14C2, 0);
}

// 0x40D79 — quitter l'écran plein : les deux octets sont levés, la grille vidée, et la carte du
// parc redemandée. Appelée sans condition, même si l'écran plein n'était pas posé.
export function fermerEcranPlein(jeu) {
  poserOctet(jeu, ECRAN_PLEIN, 0);
  jeu.appeler(VIDER_GRILLE);
  poserOctet(jeu, RAFRAICHISSEMENT_TOTAL, 0);
  poserMot(jeu, REDESSINER_CARTE, 1);
}

// =================================================================================================

export const reecritures = [
  { adresse: 0x3F49E, nom: 'ecrireTexte', fn: ecrireTexte, arguments: 5, retour: true },
  { adresse: 0x3E149, nom: 'cadreBiseaute', fn: cadreBiseaute, arguments: 6 },
  { adresse: 0x3E34E, nom: 'rectangleUni', fn: rectangleUni, arguments: 5 },
  { adresse: 0x3E0D4, nom: 'panneauEnfonce', fn: panneauEnfonce, arguments: 4 },
  { adresse: 0x3E705, nom: 'cadreACoins', fn: cadreACoins, arguments: 6 },
  { adresse: 0x3E553, nom: 'panneauCreux', fn: panneauCreux, arguments: 4 },
  { adresse: 0x3E5E4, nom: 'panneauCreuxCarre', fn: panneauCreuxCarre, arguments: 4 },
  { adresse: 0x3E673, nom: 'panneauSaillant', fn: panneauSaillant, arguments: 4 },
  { adresse: 0x3EF1D, nom: 'objetDansUnCadre', fn: objetDansUnCadre, arguments: 5 },
  { adresse: 0x408D3, nom: 'trouverUnMorceau', fn: trouverUnMorceau, arguments: 1, retour: true },
  // Le genre est rendu dans al seul : l'original laisse les trois octets hauts d'eax tels que
  // l'appelant les avait, et son unique appelant ne lit que l'octet bas. On ne compare donc pas eax.
  { adresse: 0x40858, nom: 'genreDeBouton', fn: genreDeBouton, arguments: 1 },
  { adresse: 0x3D72B, nom: 'redessinerLesZones', fn: redessinerLesZones, arguments: 0 },
  { adresse: 0x40D3E, nom: 'ouvrirEcranPlein', fn: ouvrirEcranPlein, arguments: 0 },
  { adresse: 0x40D79, nom: 'fermerEcranPlein', fn: fermerEcranPlein, arguments: 0 },
  // Ces deux-là peuvent atteindre le dessin de la carte (ordre 0x15 -> 0x1B837, qui fait avancer
  // les enseignes dans les objets du parc) et, pour l'ouverture, la routine propre à la fenêtre,
  // qui écrit où elle veut : toute la mémoire est comparée. Quelques centaines d'appels par
  // scénario au plus.
  { adresse: 0x3CC79, nom: 'dessinerUneFenetre', fn: dessinerUneFenetre, arguments: 1, memoire: 'entiere' },
  { adresse: 0x35F21, nom: 'ouvrirUneFenetre', fn: ouvrirUneFenetre, arguments: 1, memoire: 'entiere' },
];
