// Poser dans le parc (décors, wagons, rails), défiler pendant un tracé, la barre de menus, l'écran
// de la bourse, et quelques routines d'interface sans famille.
//
// Réécriture lisible de 0x40DA6, 0x41936, 0x41EB4, 0x4395B, 0x439DC, 0x47268, 0x4FCC5, 0x4FD2D,
// 0x4B11E, 0x4B56C, 0x4BDD6, 0x4C167, 0x407A0, 0x40BBC, 0x4790C et 0x4E2DB.
// Voir docs/guide-reecriture.md.
//
// Seize fonctions que les scénarios exercent sans qu'aucun module ne les ait encore prises. Elles se
// rangent en quatre familles, indiquées ici pour la suite du chantier :
//
// POSER DANS LE PARC — 0x40DA6 exécute la demande 0x0E de la file des événements (un arbre ou un
// décor, evenements.js) ; 0x41936 met les wagons d'une attraction sur sa voie quand elle ouvre, et
// 0x41EB4 les ôte quand elle ferme (construire.js, zone 20) ; 0x439DC dit si une case porte un
// morceau de rails (l'aperçu de l'outil 10, interface-parc.js) ; 0x4395B annule la case marquée des
// comptes du parc (interface-parc.js, evenements.js).
//
// DÉFILER PENDANT UN TRACÉ — 0x47268, appelée par le bouton gauche maintenu (0x175B5) juste avant
// qu'il poste la demande de l'image. Contrairement à ce que laissait croire son appelant, elle ne
// recopie ni n'exécute aucune demande : quand la demande en cours ([0xD4401 + 6 × joueur]) est un
// tracé (2, 4, 6, 8, 0x12 ou 0x1E : mur, chemin, barrière, rivière, rails, et la sorte 0x1E), elle
// enferme le pointeur dans la vue du parc et fait défiler la vue quand il en touche un bord, dans
// le sens où le tracé avance. C'est ce qui permet de tracer un chemin plus long que l'écran.
//
// LA BARRE DE MENUS — 0x4FCC5 l'ouvre (zone 30, construire.js), 0x4FD2D la referme (boucle.js,
// 0x4FD85, 0x50CCD). Elles appartiennent au sujet de boucle.js (la barre de menus, 0x4FD85).
//
// L'ÉCRAN DE LA BOURSE (écran 0x44) — 0x4B11E l'ouvre (Ctrl+S, le menu AFFICHAGE, ou 0x1B23A),
// 0x4B56C le dessine et le mène à chaque image (depuis la boucle du parc), 0x4BDD6 écrit une ligne
// de joueur, 0x4C167 une ligne du tableau des cours. Elles mériteraient leur propre module, bourse.js.
//
// SANS FAMILLE — 0x407A0 allume ou éteint un bouton d'une fenêtre ; 0x40BBC écrit un texte coupé en
// lignes dans un cadre ; 0x4790C sème les 360 flocons de l'intempérie 2 (la neige, vraisemblablement)
// au lancement d'une partie ; 0x4E2DB dessine la bande du haut de l'écran quand la barre d'outils
// est masquée et que le pointeur y entre.

import { ADRESSES } from './etat.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';

const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const idiv = (a, b) => (a / b) | 0;

const octet = (jeu, a) => jeu.m8[a >>> 0];
const octetSigne = (jeu, a) => s8(jeu.m8[a >>> 0]);
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Le cadre de pile de l'original : `push ebx/esi/edi`, puis `enter taille, 0` (ou `push ebp` sans
// variables). La réécriture l'ouvre de même : les registres sauvés sont écrits à leur place, le
// pointeur de pile descend sous les variables locales, les appels partent donc de la même hauteur
// que dans l'original et les variables locales sont aux mêmes adresses (les tampons de texte dont
// on passe l'adresse, et celles que l'original lit sans les avoir écrites). En sortant, ebx, esi,
// edi et ebp redeviennent ceux de l'appelant, comme par les `pop` de l'original : des fonctions
// appelées, écrites en assembleur, ne les gardent pas toutes. L'enveloppe (index.js) remet la
// pile en place. La routine reçoit l'adresse de `ebp`.
function dansLeCadre(taille, routine) {
  return (jeu, ...args) => {
    const T = jeu.T;
    T.sauver();
    const R = T.R, entree = R.esp >>> 0;
    const sauves = { ebx: R.ebx, esi: R.esi, edi: R.edi, ebp: R.ebp };
    poserLong(jeu, entree - 4, R.ebx);
    poserLong(jeu, entree - 8, R.esi);
    poserLong(jeu, entree - 12, R.edi);
    poserLong(jeu, entree - 16, R.ebp);
    const ebp = (entree - 16) >>> 0;
    R.ebp = ebp | 0;
    R.esp = (ebp - taille) | 0;
    T.charger();
    try {
      return routine(jeu, ebp, ...args);
    } finally {
      T.sauver();
      Object.assign(T.R, sauves);
      T.charger();
    }
  };
}

// --- les variables du jeu ----------------------------------------------------------------------
const MODE = ADRESSES.modeAffichage;             // mot : 1 = 320x200, 8 = 640x480
const REDESSINER_CARTE = ADRESSES.redessinerCarte;
const CAMERA_COLONNE = ADRESSES.cameraColonne;   // mots signés
const CAMERA_RANGEE = ADRESSES.cameraRangee;
const LARGEUR_TUILE = ADRESSES.largeurTuile;     // mots : 48/32 en 320x200, 24/16 en 640x480
const HAUTEUR_TUILE = ADRESSES.hauteurTuile;
const PAS_DE_SIMULATION = ADRESSES.pasDeSimulation;
const VITESSE = ADRESSES.vitesseJeu;             // mot signé
const ECRAN_COURANT = ADRESSES.ecranCourant;     // mot
const SOURIS_X = ADRESSES.sourisX, SOURIS_Y = ADRESSES.sourisY;   // mots signés

const JOUEUR = 0xD665C;               // mot : le joueur de cette machine
const DEMANDE_EN_COURS = 0xD4401;     // 6 octets par joueur : +0 la sorte, +1 la case, +3 un paramètre
const NOUVELLE_DEMANDE = 0xD441F;     // la demande que le joueur poste pour l'image suivante
const CASE_VISEE = 0xD6676;           // mot : la case sous le pointeur

const CARTE = 0xD3B08;                // pointeur : 64 × 64 cellules de 4 octets (+0 mot le premier
                                      // objet posé, négatif pour un décor ; +2 le sol ; +3 drapeaux)
const SOLS = 0xB44D9;                 // 4 octets par image de sol : le mot +0, ce qu'elle interdit
const OBJETS = 0xD3B10, TAILLE_OBJET = 200;   // pointeur : la table des objets du parc
const FIN_DES_OBJETS = 0xD3B78;       // pointeur : la fin de cette table
const VOISINES = 0xB4920;             // 4 mots signés : −64, 1, 64, −1 (haut, droite, bas, gauche)
const COMPTES_DU_PARC = 0xD3814;      // pointeur : les comptes du parc (§ 10.8)
const FICHE_DU_PARC = 0xD3818;        // pointeur : la fiche du parc du joueur
const PASSAGES = 0xD3AF8;             // mot long : les passages de la mise à jour des objets

const DECORS = 0xCCA70, TAILLE_DECOR = 0x38;  // le catalogue des décors et installations
const GENRE_DE_DECOR = 0xD6646;       // mot : la fiche choisie dans ce catalogue

const OUTIL = 0xD6670;                // mot : l'outil en main
const OUTIL_MIS_DE_COTE = 0xD6626;    // mot : l'outil repris quand la barre de menus se referme
const EN_PAUSE = 0xD779C;             // octet : le jeu est en pause
const BARRE_DE_MENUS = 0xB14D2;       // mot signé : −1 pas de barre, sinon son premier titre
const MENU_DEROULE = 0xB14D4;         // mot signé : le menu déroulé, −1 aucun
const IMAGES_DU_POINTEUR = 0xB52C1;   // octet par outil : l'image du pointeur
const BANQUE_POINTEURS = 0xD3B84;     // pointeur : les images du pointeur, 6 octets chacune

const BARRE_D_OUTILS = 0xD7798;       // octet : la barre d'outils du bas est affichée
const HAUT_DE_LA_VUE = 0xB9531;       // mot signé : le haut de la vue du parc (sous la bande du haut)
const BAS_DE_LA_VUE = 0xB9401;        // mot signé : le haut de la barre d'outils
const SENS_DU_DEFILEMENT = 0xB14E8;   // octet : 1 haut, 2 droite, 4 bas, 8 gauche ; 0 immobile

const ZONES = 0xCE898, TAILLE_ZONE = 10;  // les zones cliquables de la fenêtre courante
const NOMBRE_DE_ZONES = 0xD778B;      // octet

const HAUTEUR_DE_LIGNE = 0xD7765;     // octet : hauteur de l'image du « W » de la police
const BANQUE_POLICE = 0xD3B64;        // pointeur : images de la police de l'interface, 6 octets
const CARACTERES = 0xB51C1;           // 256 octets : code de caractère -> numéro d'image
const BANQUE_INTERFACE = 0xD3B54;     // pointeur : images des cadres, icônes et fonds, 6 octets

const SURFACE = 0xDE5BC;              // pointeur : la surface de dessin
const FOND = 0xD3B98;                 // pointeur : le tampon de fond
const PALETTE = 0xD3B8C;              // pointeur : la palette courante
const TEXTES = 0xD7BC0;               // pointeur : la table des textes de l'interface
const FIGURES = 0xD3B38;              // pointeur : table de mots, figure -> objet graphique

// La bourse.
const FICHES_DES_JOUEURS = 0xD3B00, TAILLE_FICHE = 0x222;   // 25 fiches (concurrents.js)
const FICHE_DU_JOUEUR = 0xD3808;      // pointeur : celle du joueur de cette machine
const JOUEURS = 25;
const PARCS = 0xCF1E0, TAILLE_PARC = 0x250;   // fiches de parc (fin-annee.js, 0x4ADE6)
const EN_VENTE = 0x60;                // mot : les actions du parc encore en vente
const EMISES = 0x62;                  // mot : les actions émises
const COURS = 0x66;                   // long : le cours de l'action
const ANCIEN_COURS = 0x6A;            // long : le cours d'avant la dernière fin d'année
const PLUS_HAUT = 0x6E, PLUS_BAS = 0x72;  // longs : la capitalisation la plus haute, la plus basse
const PLACE = 0x95;                   // mot de la fiche du joueur : sa place au classement
const PARTS = 0xA3;                   // 25 mots de la fiche : les actions détenues dans chaque parc
const SOLDE = 0x0A, DEPENSES = 0x0E;  // longs de la fiche du joueur
const PARC_CHOISI = 0xB93B9;          // octet signé : la ligne choisie dans le tableau, −1 aucune
const MESSAGE = 0xD785C;              // octet : le texte affiché en bas de l'écran, 0 aucun
const DUREE_DU_MESSAGE = 0xD785D;     // octet : les images qui lui restent
const ECRAN_PRECEDENT = 0xD660E;      // mot : l'écran qu'on retrouvera en sortant
const ECRAN_DE_RETOUR = 0xB9EDB;      // octet : le même, pour 0x1B23A
const NIVEAU_DE_JEU = 0xD66F1;        // octet : 2 au niveau où la bourse se joue
const JOUEURS_EN_RESEAU = 0xD7792;    // octet
const AMBIANCE = 0xB14B4;             // octet : le volume de l'ambiance du parc
const ECRAN_BOURSE = 0x44;

// Boutons de la souris : l'appui, à remettre à zéro, et le bouton maintenu.
const DROIT_APPUI = 0xDE5A4, GAUCHE_APPUI = 0xDE5A6;
const DROIT_TENU = 0xDE5AA, GAUCHE_TENU = 0xDE5AC;

// Couleurs du cache de 0x12452 (divers.js).
const BLEU_PALE = 0xD776F, JAUNE_CHOISI = 0xD777E;

// La neige.
const FLOCONS = 0xD2BB0, NOMBRE_DE_FLOCONS = 0x168, TAILLE_FLOCON = 7;

// --- les fonctions du jeu appelées ---------------------------------------------------------------
const INSCRIRE_AU_LIVRE = 0x78943;       // (catégorie, montant) : le livre de comptes et le solde
const CHERCHER_SUR_LA_CASE = 0x204B9;    // (cellule, type) : le premier objet de ce type, ou 0
const RETIRER_L_OBJET = 0x18B62;         // (objet)
const POSER_L_OBJET = 0x1883E;           // (objet, x, y) en 256es de case
const RACCORDER_LES_RAILS = 0x2A2F1;     // (cellule, sens)
const PLAGE_DU_POINTEUR = 0x11303;       // (x min, x max, y min, y max)
const CURSEUR = 0x116E4;                 // (image) : change l'image du pointeur
const PROPORTIONS_DES_MENUS = 0x50366;
const HASARD = 0x18B92;                  // 0 à 32 767 (§ 10.1)
const ECRIRE_TEXTE = 0x3F49E;            // (x, y, texte, normal, couleur)
const ECRIRE_CENTRE = 0x3F377;           // (x0, x1, y, texte, normal, couleur)
const TRACER_BASSE = 0x5EC9C, TRACER_HAUTE = 0x55BD4;  // (x, y, image)
const DESSINER_OBJET = 0x209B5;          // (objet graphique, x, y)
const ECRIRE_320 = 0x80E88, ECRIRE_640 = 0x80F34;     // (x, y, texte, couleur) : la petite police
const COULEUR_LA_PLUS_PROCHE = 0x80250;  // (palette, r, g, b) -> index, dans al
const CHARGER_UN_FICHIER = 0x7F0B0;      // (nom, destination) : 0 en cas d'échec
const COPIER_L_ECRAN = 0x55EFA;          // (source, destination, lignes)
const RECOPIER_LE_FOND_320 = 0x80E20;    // (fond, surface, lignes)
const RECOPIER_LE_FOND_640 = 0x54ED6;    // (fond, surface) : par blocs
const OUVRIR_ECRAN_PLEIN = 0x40D3E, FERMER_ECRAN_PLEIN = 0x40D79;
const AFFICHER_UN_MESSAGE = 0x7C16C;     // (palette, texte) : la ligne de message du bas
const FORMATER = 0x7F652;                // sprintf
const LONGUEUR = 0x7E822;                // strlen
const COPIER_N = 0x81C7C;                // strncpy
const METTRE_EN_FORME = 0x56E7E;         // (tampon, nombre, largeur, mode) : titre.js
const ECRIRE_UNE_SOMME = 0x4C0B2;        // (tampon, somme) -> texte : ecran-parc.js
const NOM_DU_JOUEUR = 0x4C50B;           // (joueur) -> texte : ecran-parc.js
const BRUITAGE = 0x80FE0;                // (propriétaire, bruitage), sauf s'il joue déjà
const ARRETER_L_AMBIANCE = 0x80350;      // (propriétaire, bruitage)
const REGLER_L_AMBIANCE = 0x80568;       // (propriétaire, bruitage, mode, volume)
const EFFACER_320 = 0x81590, EFFACER_640 = 0x815B8;   // (surface, lignes, couleur)
const PRESENTER_320 = 0x80210, PRESENTER_640 = 0x55507;
const OUVRIR_UN_ECRAN = 0x1B23A;         // (écran)
const LIGNE_D_UN_JOUEUR = 0x4BDD6, LIGNE_DU_COURS = 0x4C167;   // ce module

const basseResolution = (jeu) => (jeu.m8[MODE] & 1) !== 0;
const texte = (jeu, decalage) => long(jeu, (long(jeu, TEXTES) + decalage) | 0);
const cellule = (jeu, numeroCase) => (long(jeu, CARTE) + 4 * numeroCase) | 0;
const numeroDObjet = (jeu, objet) => idiv(((objet | 0) - (long(jeu, OBJETS) | 0)) | 0, TAILLE_OBJET);
const objetNumero = (jeu, numero) => (long(jeu, OBJETS) + Math.imul(numero, TAILLE_OBJET)) >>> 0;
const couleur = (jeu, r, g, b) => jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE), r, g, b) & 0xFF;
const petitTexte = (jeu, x, y, t, c) => jeu.appeler(basseResolution(jeu) ? ECRIRE_320 : ECRIRE_640, x, y, t, c);
const fiche = (jeu, joueur) => (long(jeu, FICHES_DES_JOUEURS) + Math.imul(joueur, TAILLE_FICHE)) >>> 0;
const parc = (numero) => (PARCS + Math.imul(numero, TAILLE_PARC)) | 0;
const parts = (jeu, detenteur, parcDetenu) => mot(jeu, fiche(jeu, detenteur) + PARTS + 2 * parcDetenu);

// =================================================================================================
// POSER DANS LE PARC
// =================================================================================================

// 0x40DA6 — planter un arbre ou poser un décor sur une case (la demande 0x0E, outil 7).
//
// La case doit être libre : ni réservée (bit 3 de l'octet +3, l'entrée du parc), ni d'un sol qui
// l'interdit (mot +0 de l'image de sol non nul, un chemin par exemple), ni occupée par un objet
// (mot +0 positif ; un décor, négatif, est remplacé). Le décor est la fiche [0xD6646] du catalogue
// 0xCCA70 : son mot +0x26 est l'opposé de son numéro de décor, que la case reçoit ; son prix, le mot
// +0x28, est porté au livre de comptes (catégorie 2) ; l'octet +0x37 compte les exemplaires posés,
// et le mot +0x7C de la fiche du parc aussi (vraisemblablement le nombre de décors du parc). Le sol
// de la case est remis à 0, l'herbe. Rend 1 si le décor est posé, 0 sinon.
export function poserUnDecor(jeu, ebp, numeroCase) {
  const c = cellule(jeu, u16(numeroCase));
  if (octet(jeu, c + 3) & 8) return 0;
  if (mot(jeu, SOLS + 4 * octet(jeu, c + 2)) !== 0) return 0;
  if (motSigne(jeu, c) > 0) return 0;
  const decor = DECORS + Math.imul(mot(jeu, GENRE_DE_DECOR), TAILLE_DECOR);
  poserMot(jeu, c, mot(jeu, decor + 0x26));
  jeu.appeler(INSCRIRE_AU_LIVRE, 2, -mot(jeu, decor + 0x28) | 0);
  const leParc = long(jeu, FICHE_DU_PARC);
  poserMot(jeu, leParc + 0x7C, mot(jeu, leParc + 0x7C) + 1);
  poserOctet(jeu, decor + 0x37, octet(jeu, decor + 0x37) + 1);
  // (l'adresse de la cellule est recalculée par l'original après l'appel ; [0xD3B08] n'a pas changé)
  poserOctet(jeu, cellule(jeu, u16(numeroCase)) + 2, 0);
  return 1;
}

// Les morceaux de voie. Un morceau de rails est un objet de type 0x12 posé sur la case ; son état
// (octet +0xC) donne sa forme, et la table de sa sorte de voie ([0xB4399 + 10 × mot +0x16], 0x19
// octets par forme) donne à l'octet +0x11 de la forme les côtés par où il se raccorde, en masque de
// quatre bits (1 haut, 2 droite, 4 bas, 8 gauche). Deux tables de 13 octets se suivent :
// 0xB4B14 donne le sens (0 à 3, indice de 0xB4920) d'un masque d'un seul bit, −1 pour 0 ; 0xB4B21
// (= 0xB4B14 + 13) donne le bit du côté opposé (1↔4, 2↔8). 0xB8FCC donne, pour chacun des quatre
// sens de recherche, le sens de départ d'un wagon (3, 2, 3, 2).
const SENS_DU_MASQUE = 0xB4B14;
const COTE_OPPOSE = 0xB4B21;
const SENS_DE_DEPART = 0xB8FCC;
const SORTES_DE_VOIE = 0xB4399;       // long par sorte, 10 octets : la table des formes
const SENS_DU_GENRE_DB = 0xB48EC;     // 2 octets par sens : le sens de départ du genre 0xDB inversé
const GENRE_DB = 0xDB;                // un genre d'attraction à part (mot +0x22 de sa fiche)
const WAGON = 0xE;                    // le type d'objet des véhicules

// Une forme de voie qui porte un wagon : 7 à 0xA (les gares, vraisemblablement) et au-delà de
// 0x13 sont écartées.
const formeRoulante = (forme) => !((forme >= 7 && forme <= 0xA) || forme >= 0x14);
// Le masque des côtés par où se raccorde un morceau.
function raccords(jeu, morceau) {
  const table = long(jeu, SORTES_DE_VOIE + Math.imul(mot(jeu, morceau + 0x16), 10));
  return octet(jeu, (table + Math.imul(octet(jeu, morceau + 0xC), 0x19) + 0x11) | 0);
}
// Le côté par où l'on sort d'un morceau, quand on y est entré par le côté `entree` (en masque) :
// ses raccords, moins le côté d'entrée ; rend l'indice de sens, −1 s'il n'y en a pas.
function coteDeSortie(jeu, entree, lesRaccords) {
  const reste = (~octetSigne(jeu, COTE_OPPOSE + entree)) & lesRaccords;
  return octetSigne(jeu, SENS_DU_MASQUE + octetSigne(jeu, COTE_OPPOSE + reste));
}
const voisine = (jeu, sens) => 4 * motSigne(jeu, VOISINES + 2 * sens);

// 0x41936 — mettre les wagons d'une attraction sur sa voie, quand elle ouvre.
//
// `fiche` est la fiche du genre dans le catalogue des attractions, `attraction` l'objet du parc,
// `nombre` le nombre de wagons. Le mot +0x26 de l'attraction reçoit le nombre de wagons (pour le
// genre 0xDB : deux fois ce nombre par morceau de sa chaîne +0xC0/+0xC2, non établi), le mot +0x30
// est remis à zéro.
//
// D'abord la voie est éprouvée : à partir de la case de l'attraction (octets +7 et +9), on cherche
// parmi ses quatre voisines un morceau de rails d'une forme roulante, puis on suit la voie de morceau
// en morceau, `nombre` fois ; si elle s'interrompt, rien n'est posé et la fonction rend 0. Puis
// chaque wagon prend une place libre de la table des objets (octet +4 nul) après l'attraction : le
// premier sur la première voisine qui porte des rails (quelle qu'en soit la forme), les suivants
// chacun un morceau plus loin que le précédent. Un wagon est un objet de type 0xE, au milieu de sa
// case, qui connaît son attraction (+0x16), son rang (+0x20), sa tête de train (+0x45) et le wagon
// suivant (+0x61), et part dans le sens +0x12 ; son état +0xC vaut 8 (0x22 pour le genre 0xDB,
// avec +0xE à 8). Rend 1.
//
// Anomalies reproduites : l'appelant 0x15FBD passe comme fiche 0xCCED0 + genre, sans le multiplier
// par la taille d'une fiche (200) : le test du genre 0xDB y lit un octet sans rapport ; un sens −1
// (masque vide) relance la recherche parmi les voisines de la case atteinte ; le premier wagon ne
// vérifie pas la forme du morceau qu'il prend, et les suivants ne vérifient pas qu'un morceau suit ;
// faute de place libre, un wagon est simplement sauté.
export function poserLesWagons(jeu, ebp, laFiche, attraction, nombre) {
  const n = u16(nombre);
  const objets = () => long(jeu, OBJETS);
  const genreDB = () => mot(jeu, laFiche + 0x22) === GENRE_DB;
  const caseDe = (o) => cellule(jeu, (s16(octet(jeu, o + 9)) << 6) + s16(octet(jeu, o + 7)));

  let c = caseDe(attraction);
  if (genreDB()) {
    poserMot(jeu, attraction + 0x26, 0);
    for (let p = objetNumero(jeu, mot(jeu, attraction + 0xC0)); p > objets();
      p = objetNumero(jeu, mot(jeu, p + 0xC2))) {
      poserMot(jeu, attraction + 0x26, mot(jeu, attraction + 0x26) + 2 * n);
    }
  } else {
    poserMot(jeu, attraction + 0x26, n);
  }
  poserMot(jeu, attraction + 0x30, 0);

  // Éprouver la voie.
  let sens = -1;
  for (let i = 0; i < n; i++) {
    if (sens === -1) {
      for (let k = 0; k < 4; k++) {
        const morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, (c + voisine(jeu, k)) | 0, 0x12) >>> 0;
        if (morceau > objets() && formeRoulante(octet(jeu, morceau + 0xC))) {
          sens = octet(jeu, SENS_DE_DEPART + k);
          c = (c + voisine(jeu, k)) | 0;
          break;
        }
      }
      if (sens === -1) return 0;
    } else {
      // On sort de la case par le côté `sens` : on entre dans la suivante par le côté opposé.
      const entree = u16(octetSigne(jeu, COTE_OPPOSE + (1 << (sens & 31))));
      c = (c + voisine(jeu, octetSigne(jeu, SENS_DU_MASQUE + entree))) | 0;
      const morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, c, 0x12) >>> 0;
      if (morceau < objets()) return 0;
      if (!formeRoulante(octet(jeu, morceau + 0xC))) return 0;
      sens = s16(coteDeSortie(jeu, entree, raccords(jeu, morceau)));
    }
  }

  // Poser les wagons.
  let tete = 0, precedent = 0;
  for (let i = 0; i < n; i++) {
    let wagon = (attraction + TAILLE_OBJET) >>> 0;
    while (wagon < long(jeu, FIN_DES_OBJETS) && octet(jeu, wagon + 4) !== 0) wagon = (wagon + TAILLE_OBJET) >>> 0;
    if (wagon >= long(jeu, FIN_DES_OBJETS)) continue;

    if (tete !== 0) {
      // Un morceau plus loin que le wagon précédent, dans son sens.
      c = caseDe(precedent);
      const entree = s16(octetSigne(jeu, COTE_OPPOSE + (1 << (octet(jeu, precedent + 0x12) & 31))));
      c = (c + voisine(jeu, octetSigne(jeu, SENS_DU_MASQUE + entree))) | 0;
      const morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, c, 0x12) >>> 0;
      const reste = (~octetSigne(jeu, COTE_OPPOSE + entree)) & raccords(jeu, morceau);
      poserOctet(jeu, wagon + 0x12, octet(jeu, SENS_DU_MASQUE + octetSigne(jeu, COTE_OPPOSE + reste)));
      poserMot(jeu, wagon + 0x45, numeroDObjet(jeu, tete));
      poserMot(jeu, wagon + 0x61, 0);
      poserMot(jeu, precedent + 0x61, numeroDObjet(jeu, wagon));
      if (genreDB()) {
        poserOctet(jeu, wagon + 0xC, 0x22);
        poserMot(jeu, wagon + 0xE, 8);
      } else {
        poserOctet(jeu, wagon + 0xC, 8);
      }
    } else {
      // La tête du train, sur la première voisine qui porte des rails.
      c = caseDe(attraction);
      let trouve = false;
      for (let k = 0; k < 4; k++) {
        const morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, (c + voisine(jeu, k)) | 0, 0x12) >>> 0;
        if (morceau <= objets()) continue;
        c = (c + voisine(jeu, k)) | 0;
        poserOctet(jeu, wagon + 0x12, octet(jeu, SENS_DE_DEPART + k));
        if (genreDB() && octet(jeu, attraction + 0xC4) !== 0) {
          poserOctet(jeu, wagon + 0x12, octet(jeu, SENS_DU_GENRE_DB + 2 * octet(jeu, wagon + 0x12)));
        }
        poserMot(jeu, attraction + 0x45, numeroDObjet(jeu, wagon));
        tete = wagon;
        poserMot(jeu, wagon + 0x45, 0);
        poserOctet(jeu, wagon + 0xC, 8);
        trouve = true;
        break;
      }
      if (!trouve) continue;
    }

    precedent = wagon;
    poserOctet(jeu, wagon + 4, WAGON);
    const numeroCase = u16(((c | 0) - (long(jeu, CARTE) | 0)) >> 2);
    poserOctet(jeu, wagon + 6, 0x80);
    poserOctet(jeu, wagon + 8, 0x80);
    poserOctet(jeu, wagon + 7, numeroCase % 64);
    poserOctet(jeu, wagon + 9, numeroCase >> 6);
    poserMot(jeu, wagon + 0x16, numeroDObjet(jeu, attraction));
    poserMot(jeu, wagon + 0x30, 0);
    poserLong(jeu, wagon + 0x20, i);
    // Les mots +6 et +8 sont la position en 256es de case : 0x80, le milieu, plus 256 × colonne.
    jeu.appeler(POSER_L_OBJET, wagon, mot(jeu, wagon + 6), mot(jeu, wagon + 8));
  }
  return 1;
}

// 0x41EB4 — ôter les wagons d'une attraction, quand elle ferme.
//
// La chaîne commence au mot +0x45 de l'attraction et se suit par le mot +0x61 de chaque wagon ;
// chacun est retiré de la carte et de la table (0x18B62). Un wagon dans l'état 0xC désigne par son
// mot +0x7E un objet (vraisemblablement le visiteur à bord), dont le mot +0x7A est remis à zéro.
export function oterLesWagons(jeu, ebp, attraction) {
  let wagon = objetNumero(jeu, mot(jeu, attraction + 0x45));
  while (wagon > long(jeu, OBJETS)) {
    if (octet(jeu, wagon + 0xC) === 0xC) poserMot(jeu, objetNumero(jeu, mot(jeu, wagon + 0x7E)) + 0x7A, 0);
    const suivant = objetNumero(jeu, mot(jeu, wagon + 0x61));
    jeu.appeler(RETIRER_L_OBJET, wagon);
    if (suivant <= long(jeu, OBJETS)) break;
    wagon = suivant;
  }
}

// 0x4395B — annuler la case marquée des comptes du parc (voir interface-parc.js,
// traiterLaCaseMarquee). Le mot +0x5CA, positif, désigne une case : l'octet signé +0x5CC change de
// signe, 0x2A2F1 est appelée sur la cellule de la case avec ce sens, et le mot passe en négatif.
export function annulerLaCaseMarquee(jeu, ebp) {
  const comptes = long(jeu, COMPTES_DU_PARC);
  if (motSigne(jeu, comptes + 0x5CA) <= 0) return;
  poserOctet(jeu, comptes + 0x5CC, -octet(jeu, comptes + 0x5CC));
  jeu.appeler(RACCORDER_LES_RAILS, cellule(jeu, motSigne(jeu, comptes + 0x5CA)), octetSigne(jeu, comptes + 0x5CC));
  poserMot(jeu, comptes + 0x5CA, -mot(jeu, comptes + 0x5CA));
}

// 0x439DC — la case porte-t-elle un morceau de rails (un objet de type 0x12) ? Rend 1 ou 0.
//
// Calcul mort, non transcrit : l'original divise les passages [0xD3AF8] par 11 et teste le reste,
// sans rien en faire.
export function porteDesRails(jeu, ebp, numeroCase) {
  return jeu.appeler(CHERCHER_SUR_LA_CASE, cellule(jeu, u16(numeroCase)), 0x12) !== 0 ? 1 : 0;
}

// =================================================================================================
// DÉFILER PENDANT UN TRACÉ
// =================================================================================================

// Les sortes de demande qu'on trace en glissant : mur, chemin, barrière, rivière, rails, et 0x1E.
const SORTES_TRACEES = new Set([2, 4, 6, 8, 0x12, 0x1E]);

// 0x47268 — pendant un tracé, enfermer le pointeur dans la vue et faire défiler la vue au bord.
//
// Le sens du défilement se décide sur le bord que touche le pointeur et sur la marche du tracé, la
// case de la demande en cours (celle de l'image précédente) comparée à la case visée : au bord
// gauche, la vue monte si le tracé remonte les rangées, sinon va à gauche s'il remonte les colonnes
// (ou s'il est immobile et que rien ne défilait) ; au bord droit, symétriquement vers le bas ou la
// droite ; entre les deux, le haut et le bas de la vue font monter et descendre. Sinon le sens
// défilant est gardé tel quel. La vue avance d'une case dans ce sens — en 320x200 à la vitesse
// normale, une image sur quatre seulement (les pas de simulation multiples de 4) —, sans sortir de
// la carte, et la carte est redessinée.
//
// Anomalies reproduites : la vue ne va pas plus à gauche que la colonne 4, alors qu'elle monte
// jusqu'à la rangée 0 ; sans barre d'outils ([0xD7798] nul), les bords de la vue ne sont pas posés
// et l'original les lit dans ses variables locales laissées telles quelles sur la pile — la
// réécriture ouvre le même cadre et les lit au même endroit.
export function defilerPendantLeTrace(jeu, ebp) {
  const avancer = (long(jeu, PAS_DE_SIMULATION) & 3) === 0 || (jeu.m8[MODE] & 8) !== 0 || mot(jeu, VITESSE) !== 0;

  const joueur = mot(jeu, JOUEUR);
  if (!SORTES_TRACEES.has(octet(jeu, DEMANDE_EN_COURS + 6 * joueur))) return;

  let gauche, droite, haut, bas;
  if (octet(jeu, BARRE_D_OUTILS) !== 0) {
    gauche = 0x19;
    droite = ecran.largeur - 10;                     // 0x276 (grande-vue.js)
    haut = s16(mot(jeu, HAUT_DE_LA_VUE) + 8);
    bas = s16(mot(jeu, BAS_DE_LA_VUE) - 0x1C);
    // Les deux résolutions font le même appel.
    jeu.appeler(PLAGE_DU_POINTEUR, gauche, droite, motSigne(jeu, HAUT_DE_LA_VUE), bas);
  } else {
    gauche = motSigne(jeu, ebp - 0x24);
    droite = motSigne(jeu, ebp - 0x18);
    haut = motSigne(jeu, ebp - 0x1C);
    bas = motSigne(jeu, ebp - 0x20);
  }

  const depuis = mot(jeu, DEMANDE_EN_COURS + 6 * joueur + 1);
  const colonneAvant = depuis % 64 & 0xFF, rangeeAvant = (depuis >> 6) & 0xFF;
  const vers = mot(jeu, CASE_VISEE);
  const colonne = vers % 64 & 0xFF, rangee = (vers >> 6) & 0xFF;
  const immobile = colonne === colonneAvant && rangee === rangeeAvant;

  const x = motSigne(jeu, SOURIS_X), y = motSigne(jeu, SOURIS_Y);
  if (x <= gauche) {
    if (rangee < rangeeAvant) poserOctet(jeu, SENS_DU_DEFILEMENT, 1);
    else if (colonne < colonneAvant) poserOctet(jeu, SENS_DU_DEFILEMENT, 8);
    else if (octet(jeu, SENS_DU_DEFILEMENT) === 0 && immobile) poserOctet(jeu, SENS_DU_DEFILEMENT, 8);
  } else if (x >= droite) {
    if (rangee > rangeeAvant) poserOctet(jeu, SENS_DU_DEFILEMENT, 4);
    else if (colonne > colonneAvant) poserOctet(jeu, SENS_DU_DEFILEMENT, 2);
    else if (octet(jeu, SENS_DU_DEFILEMENT) === 0 && immobile) poserOctet(jeu, SENS_DU_DEFILEMENT, 2);
  } else if (y <= haut) {
    poserOctet(jeu, SENS_DU_DEFILEMENT, 1);
  } else if (y >= bas) {
    poserOctet(jeu, SENS_DU_DEFILEMENT, 4);
  } else {
    poserOctet(jeu, SENS_DU_DEFILEMENT, 0);
  }

  if (!avancer) return;
  const sensDefilement = octet(jeu, SENS_DU_DEFILEMENT);
  if (sensDefilement & 8) {
    if (motSigne(jeu, CAMERA_COLONNE) > 4) poserMot(jeu, CAMERA_COLONNE, mot(jeu, CAMERA_COLONNE) - 1);
  } else if (sensDefilement & 2) {
    const derniere = 64 - idiv(largeurDeLaVue(jeu), mot(jeu, LARGEUR_TUILE));
    if (motSigne(jeu, CAMERA_COLONNE) < derniere) poserMot(jeu, CAMERA_COLONNE, mot(jeu, CAMERA_COLONNE) + 1);
  }
  if (sensDefilement & 1) {
    if (motSigne(jeu, CAMERA_RANGEE) > 0) poserMot(jeu, CAMERA_RANGEE, mot(jeu, CAMERA_RANGEE) - 1);
  } else if (sensDefilement & 4) {
    const hauteurEcran = basseResolution(jeu) ? 0x190 : hauteurDeLaVue(jeu);
    const h = mot(jeu, HAUTEUR_TUILE);
    const derniere = 64 - idiv(h + hauteurEcran - 1, h);
    if (motSigne(jeu, CAMERA_RANGEE) < derniere) poserMot(jeu, CAMERA_RANGEE, mot(jeu, CAMERA_RANGEE) + 1);
  }
  if (octet(jeu, SENS_DU_DEFILEMENT) !== 0) poserMot(jeu, REDESSINER_CARTE, 1);
}

// =================================================================================================
// LA BARRE DE MENUS (boucle.js, 0x4FD85)
// =================================================================================================

// Le pointeur prend l'image de l'outil en main.
function pointeurDeLOutil(jeu) {
  jeu.appeler(CURSEUR, (long(jeu, BANQUE_POINTEURS) + 6 * octet(jeu, IMAGES_DU_POINTEUR + mot(jeu, OUTIL))) | 0);
}

// 0x4FCC5 — ouvrir la barre de menus (sauf en pause) : le premier titre, aucun menu déroulé, les
// proportions (0x50366), et l'outil en main mis de côté : le pointeur redevient une flèche.
export function ouvrirLaBarreDeMenus(jeu, ebp) {
  if (octet(jeu, EN_PAUSE) !== 0) return;
  poserMot(jeu, BARRE_DE_MENUS, 0);
  poserMot(jeu, MENU_DEROULE, 0xFFFF);
  jeu.appeler(PROPORTIONS_DES_MENUS);
  poserMot(jeu, OUTIL_MIS_DE_COTE, mot(jeu, OUTIL));
  poserMot(jeu, OUTIL, 0);
  pointeurDeLOutil(jeu);
}

// 0x4FD2D — refermer la barre de menus : l'outil mis de côté revient en main, et la pause est ôtée.
export function fermerLaBarreDeMenus(jeu, ebp) {
  poserMot(jeu, BARRE_DE_MENUS, 0xFFFF);
  poserMot(jeu, MENU_DEROULE, 0xFFFF);
  poserOctet(jeu, EN_PAUSE, 0);
  poserMot(jeu, OUTIL, mot(jeu, OUTIL_MIS_DE_COTE));
  pointeurDeLOutil(jeu);
}

// =================================================================================================
// L'ÉCRAN DE LA BOURSE
// =================================================================================================
//
// Chaque parc a ses actions (sa fiche de parc, 0xCF1E0 + n × 0x250 : +0x60 en vente, +0x62 émises,
// +0x66 le cours) et chaque joueur en détient dans les autres (mots +0xA3 de sa fiche, un par parc).
// L'écran montre en haut la ligne du joueur et la valeur de son portefeuille, à droite le tableau
// des cours des 25 parcs, et, quand une ligne du tableau est choisie, ce parc, qui en détient, et ce
// qu'il détient. Deux boutons achètent et vendent (les demandes 0x2E et 0x30 de la file des
// événements), un troisième ferme l'écran. On n'y joue qu'au niveau 2 ([0xD66F1]).
//
// Les textes (table [0xD7BC0]) : +0x108, +0x10C, +0x110, +0x114, +0x118, +0x11C les intitulés,
// +0xE8 le message affiché aux autres niveaux, +0x128 (0x4A), +0x12C (0x4B), +0x130 (0x4C) les
// refus : rien à vendre, pas assez d'argent, plus d'actions en vente.

// 0x4B11E — ouvrir l'écran de la bourse.
//
// Le fond, data/mshare-0.dat, est chargé dans la surface de dessin puis recopié dans le tampon de
// fond ; les intitulés y sont écrits une fois pour toutes (la surface pointe le temps de les
// écrire sur le fond). En réseau, la demande 0x40 (la synchronisation) est postée.
const FOND_DE_LA_BOURSE = 0xB872D;    // « data/mshare-0.dat »
export function ouvrirLaBourse(jeu, ebp) {
  if (jeu.appeler(CHARGER_UN_FICHIER, FOND_DE_LA_BOURSE, long(jeu, SURFACE)) === 0) return;

  poserMot(jeu, ECRAN_PRECEDENT, mot(jeu, ECRAN_COURANT) !== ECRAN_BOURSE ? mot(jeu, ECRAN_COURANT) : 0);
  poserOctet(jeu, ECRAN_DE_RETOUR, octet(jeu, ECRAN_PRECEDENT));
  poserMot(jeu, ECRAN_COURANT, ECRAN_BOURSE);
  jeu.appeler(COPIER_L_ECRAN, long(jeu, SURFACE), long(jeu, FOND), 0x190);
  const surface = long(jeu, SURFACE);
  poserLong(jeu, ebp - 8, surface);
  poserLong(jeu, SURFACE, long(jeu, FOND));
  jeu.appeler(0x81984, 0, 0x15, 0);    // non établi (le son)
  jeu.appeler(0x81AD0, 0, 0xE, -1);    // non établi (le son)

  const bleu = couleur(jeu, 0xA, 0x17, 0x2A);
  poserOctet(jeu, ebp - 4, bleu);
  petitTexte(jeu, 0x28, 0xA, texte(jeu, 0x108), bleu);
  petitTexte(jeu, 0x1B4, 0xA, texte(jeu, 0x11C), bleu);
  petitTexte(jeu, 0x28, 0x18, texte(jeu, 0x10C), bleu);
  petitTexte(jeu, 0x64, 0x18, texte(jeu, 0x110), bleu);
  petitTexte(jeu, 0x28, 0xEA, texte(jeu, 0x118), couleur(jeu, 0x40, 0x1E, 0x1E));
  petitTexte(jeu, 0x28, 0xCE, texte(jeu, 0x114), couleur(jeu, 0x25, 0x2A, 3));
  if (octet(jeu, NIVEAU_DE_JEU) !== 2) jeu.appeler(AFFICHER_UN_MESSAGE, long(jeu, PALETTE), texte(jeu, 0xE8));

  poserLong(jeu, SURFACE, surface);
  poserOctet(jeu, MESSAGE, 0);
  if (octet(jeu, JOUEURS_EN_RESEAU) > 1) poserOctet(jeu, NOUVELLE_DEMANDE + 6 * mot(jeu, JOUEUR), 0x40);
}

// Le pointeur est-il dans le rectangle ? Mots signés, bornes basses comprises, hautes exclues.
function pointeurDans(jeu, x0, y0, x1, y1) {
  const x = motSigne(jeu, SOURIS_X), y = motSigne(jeu, SOURIS_Y);
  return x >= x0 && y >= y0 && x < x1 && y < y1;
}
function oublierLesBoutons(jeu) {
  for (const a of [DROIT_TENU, DROIT_APPUI, GAUCHE_APPUI, GAUCHE_TENU]) poserMot(jeu, a, 0);
}
const BOUTON_ACHETER = [0x238, 0x104, 0x268, 0x124];
const BOUTON_VENDRE = [0x238, 0x128, 0x268, 0x146];
const BOUTON_SORTIR = [0x238, 0x148, 0x268, 0x166];

// 0x4B56C — l'écran de la bourse, à chaque image.
export function menerLaBourse(jeu, ebp) {
  const tampon = (ebp - 0x4C) >>> 0;
  const joueur = mot(jeu, JOUEUR);

  if (basseResolution(jeu)) jeu.appeler(RECOPIER_LE_FOND_320, long(jeu, FOND), long(jeu, SURFACE), 0xC8);
  else jeu.appeler(RECOPIER_LE_FOND_640, long(jeu, FOND), long(jeu, SURFACE));
  jeu.appeler(CURSEUR, (long(jeu, BANQUE_POINTEURS) + 6) | 0);
  jeu.appeler(OUVRIR_ECRAN_PLEIN);

  // Un parc choisi qui a disparu n'est plus choisi.
  const choisi = () => octetSigne(jeu, PARC_CHOISI);
  if (choisi() !== -1 && octet(jeu, fiche(jeu, choisi())) === 0) poserOctet(jeu, PARC_CHOISI, 0xFF);

  // La ligne du joueur, en haut.
  const enVenteChezLui = mot(jeu, long(jeu, FICHE_DU_PARC) + EN_VENTE);
  const bleu = couleur(jeu, 0x11, 0x21, 0x3A);
  poserOctet(jeu, ebp - 4, bleu);
  const clair = couleur(jeu, 0x18, 0x2C, 0x40);
  jeu.appeler(LIGNE_D_UN_JOUEUR, 0x30, 0x26, joueur, clair, bleu, enVenteChezLui);

  // La valeur de son portefeuille : ses actions dans chaque parc présent, au cours du parc de la
  // fiche (mot +2), en haut à droite.
  let portefeuille = 0;
  const saFiche = long(jeu, FICHE_DU_JOUEUR);
  for (let k = 0; k < JOUEURS; k++) {
    const detenues = mot(jeu, saFiche + PARTS + 2 * k);
    if (detenues === 0 || octet(jeu, fiche(jeu, k)) === 0) continue;
    const cours = long(jeu, parc(mot(jeu, fiche(jeu, k) + 2)) + COURS);
    portefeuille = (portefeuille + Math.imul(detenues, cours)) | 0;
  }
  jeu.appeler(METTRE_EN_FORME, tampon, portefeuille, 0xD, 1);
  petitTexte(jeu, 0x1B4, 0x18, tampon, bleu);

  // Le tableau des cours : une ligne par parc présent, 14 lignes d'écart. Au niveau 2, la ligne
  // survolée s'éclaire, et un clic la choisit.
  for (let k = 0, y = 0x32; k < JOUEURS; k++, y += 0xE) {
    if (octet(jeu, fiche(jeu, k)) === 0) continue;
    let teinte = bleu;
    const ys = y & 0xFFFF;
    if (pointeurDans(jeu, 0x1B8, ys, 0x226, ys + 0xE) && octet(jeu, NIVEAU_DE_JEU) === 2) {
      if (mot(jeu, GAUCHE_TENU) !== 0) {
        oublierLesBoutons(jeu);
        poserOctet(jeu, PARC_CHOISI, k);
      } else {
        teinte = octet(jeu, BLEU_PALE);
      }
    }
    if (choisi() === k) teinte = octet(jeu, JAUNE_CHOISI);
    jeu.appeler(LIGNE_DU_COURS, 0x1B8, ys, k, teinte);
  }

  if (choisi() !== -1) {
    const jaune = octet(jeu, JAUNE_CHOISI);
    const leChoisi = choisi();
    jeu.appeler(LIGNE_D_UN_JOUEUR, 0x30, 0xDC, leChoisi, jaune, jaune, mot(jeu, parc(leChoisi) + EN_VENTE));

    // Qui détient des actions du parc choisi : de bas en haut, au-dessus de sa ligne.
    for (let i = 0, y = 0xBE; i < JOUEURS; i++) {
      if (!(y > (basseResolution(jeu) ? 0xC : 6) + 0x22)) break;
      const detenues = parts(jeu, i, choisi());
      if (detenues === 0) continue;
      jeu.appeler(LIGNE_D_UN_JOUEUR, 0x30, y, i, jaune, jaune, detenues);
      y = (y - 0xC) & 0xFFFF;
    }
    // Ce que détient le parc choisi : de haut en bas, sous sa ligne.
    for (let i = 0, y = 0xFA; i < JOUEURS; i++) {
      if (!(y < 0x190 - (basseResolution(jeu) ? 0xC : 6))) break;
      const detenues = parts(jeu, choisi(), i);
      if (detenues === 0) continue;
      jeu.appeler(LIGNE_D_UN_JOUEUR, 0x30, y, i, jaune, jaune, detenues);
      y = (y + 0xC) & 0xFFFF;
    }

    if (mot(jeu, GAUCHE_TENU) !== 0 && octet(jeu, NIVEAU_DE_JEU) === 2) {
      if (pointeurDans(jeu, ...BOUTON_ACHETER)) {
        const p = parc(choisi());
        const disponible = (long(jeu, saFiche + SOLDE) - long(jeu, saFiche + DEPENSES)) | 0;
        if (mot(jeu, p + EN_VENTE) === 0) {
          poserOctet(jeu, MESSAGE, 0x4C);
          poserOctet(jeu, DUREE_DU_MESSAGE, 0xC8);
          jeu.appeler(BRUITAGE, 0, 0x1F);
        } else if (disponible > longSigne(jeu, p + COURS)) {
          jeu.appeler(BRUITAGE, 0, 0x1E);
          poserOctet(jeu, NOUVELLE_DEMANDE + 6 * mot(jeu, JOUEUR), 0x2E);
          poserMot(jeu, NOUVELLE_DEMANDE + 6 * mot(jeu, JOUEUR) + 1, choisi());
        } else {
          poserOctet(jeu, MESSAGE, 0x4B);
          poserOctet(jeu, DUREE_DU_MESSAGE, 0xC8);
          jeu.appeler(BRUITAGE, 0, 0x1F);
        }
        oublierLesBoutons(jeu);
      } else if (pointeurDans(jeu, ...BOUTON_VENDRE)) {
        if (mot(jeu, long(jeu, FICHE_DU_JOUEUR) + PARTS + 2 * choisi()) !== 0) {
          jeu.appeler(BRUITAGE, 0, 0x1A);
          poserOctet(jeu, NOUVELLE_DEMANDE + 6 * mot(jeu, JOUEUR), 0x30);
          poserMot(jeu, NOUVELLE_DEMANDE + 6 * mot(jeu, JOUEUR) + 1, choisi());
        } else {
          jeu.appeler(BRUITAGE, 0, 0x1F);
          poserOctet(jeu, MESSAGE, 0x4A);
          poserOctet(jeu, DUREE_DU_MESSAGE, 0xC8);
        }
        oublierLesBoutons(jeu);
      }
    }
  }

  // Le message du bas, 200 images.
  if (octet(jeu, MESSAGE) !== 0) {
    jeu.appeler(AFFICHER_UN_MESSAGE, long(jeu, PALETTE), texte(jeu, 4 * octet(jeu, MESSAGE)));
    poserOctet(jeu, DUREE_DU_MESSAGE, octet(jeu, DUREE_DU_MESSAGE) - 1);
    if (octet(jeu, DUREE_DU_MESSAGE) === 0) poserOctet(jeu, MESSAGE, 0);
  }

  // Sortir : l'écran est effacé, présenté, et l'on retourne à l'écran d'avant ; l'ambiance du parc
  // reprend. L'écran plein ouvert plus haut n'est refermé que dans ce cas.
  if (mot(jeu, GAUCHE_TENU) === 0 || !pointeurDans(jeu, ...BOUTON_SORTIR)) return;
  oublierLesBoutons(jeu);
  jeu.appeler(BRUITAGE, 0, 0x19);
  if (basseResolution(jeu)) jeu.appeler(EFFACER_320, long(jeu, SURFACE), 0x190, 0);
  else jeu.appeler(EFFACER_640, long(jeu, SURFACE), 0x1E0, 0);
  if (basseResolution(jeu)) jeu.appeler(PRESENTER_320, 0x190);
  else jeu.appeler(PRESENTER_640);
  jeu.appeler(OUVRIR_UN_ECRAN, octet(jeu, ECRAN_DE_RETOUR));
  jeu.appeler(ARRETER_L_AMBIANCE, 0, 0xE);
  if (octet(jeu, long(jeu, FICHE_DU_PARC) + 0x18) !== 0) jeu.appeler(REGLER_L_AMBIANCE, 0, 0x15, 3, octet(jeu, AMBIANCE));
  jeu.appeler(FERMER_ECRAN_PLEIN);
}

// 0x4BDD6 — une ligne de joueur : sa place au classement (« %02d »), son nom, son solde disponible
// (en toutes lettres, 0x4C0B2, dans la couleur `couleurDuSolde`), `nombre` (« %03d » : les actions
// en vente de son parc, ou celles qu'il détient) et le cours de son action (« %5d »).
//
// Anomalie reproduite : le cours est lu dans la fiche de parc du numéro du joueur, et non dans celle
// que désigne sa fiche (mot +2) ; de même, 0x4C50B reçoit l'octet bas du numéro. Les deux ne
// diffèrent pas tant que chaque joueur tient le parc de son numéro.
const FORMAT_PLACE = 0xB01E8, FORMAT_NOMBRE = 0xB01ED, FORMAT_COURS = 0xB01F2, FORMAT_ENTIER = 0xB01FE;
export function ligneDUnJoueur(jeu, ebp, x, y, joueur, teinte, couleurDuSolde, nombre) {
  const tampon = (ebp - 0x14) >>> 0;
  const j = u16(joueur), c = teinte & 0xFF, ys = s16(y);
  const f = fiche(jeu, j);
  jeu.appeler(FORMATER, tampon, FORMAT_PLACE, mot(jeu, f + PLACE));
  petitTexte(jeu, s16(x), ys, tampon, c);
  petitTexte(jeu, s16(x + 0x20), ys, jeu.appeler(NOM_DU_JOUEUR, joueur & 0xFF), c);
  const disponible = (long(jeu, f + SOLDE) - long(jeu, f + DEPENSES)) | 0;
  petitTexte(jeu, s16(x + 0x102), ys, jeu.appeler(ECRIRE_UNE_SOMME, tampon, disponible), couleurDuSolde & 0xFF);
  jeu.appeler(FORMATER, tampon, FORMAT_NOMBRE, u16(nombre));
  petitTexte(jeu, s16(x + 0x132), ys, tampon, c);
  jeu.appeler(FORMATER, tampon, FORMAT_COURS, long(jeu, parc(j) + COURS));
  petitTexte(jeu, s16(x + 0x154), ys, tampon, c);
}

// 0x4C167 — une ligne du tableau des cours : la tendance, les marques de détention, les trois
// premières lettres du nom du joueur et son cours en centaines.
//
// La tendance : une flèche (figure 0x2A4, mot +0x548 de la table des figures) si la capitalisation
// (actions émises / 10 × cours) atteint son plus haut de l'année, une autre (0x2A6) si elle touche
// son plus bas, sinon la hausse (0x2A3) ou la baisse (0x2A5) du cours depuis la fin d'année ; rien
// s'il n'a pas bougé. Les marques, à droite : le parc a des actions en vente (0x2AA), il détient des
// actions du joueur (0x2A7), le joueur en détient de lui (0x2A8) ; décalées de deux points vers le
// haut et la gauche par marque qui les recouvre. Le cours s'écrit « %d », amputé de ses deux
// derniers chiffres.
export function ligneDuCours(jeu, ebp, x, y, joueur, teinte) {
  const tampon = (ebp - 0x14) >>> 0;
  const j = joueur & 0xFF, c = teinte & 0xFF;
  const p = parc(j);
  const figure = (decalage) => mot(jeu, long(jeu, FIGURES) + decalage);
  const xt = s16(x + 0x68), yt = s16(y + 0xA);

  const capitalisation = Math.imul(idiv(mot(jeu, p + EMISES), 10), longSigne(jeu, p + COURS));
  const cours = longSigne(jeu, p + COURS), ancien = longSigne(jeu, p + ANCIEN_COURS);
  if (capitalisation >= longSigne(jeu, p + PLUS_HAUT)) jeu.appeler(DESSINER_OBJET, figure(0x548), xt, yt);
  else if (capitalisation <= longSigne(jeu, p + PLUS_BAS)) jeu.appeler(DESSINER_OBJET, figure(0x54C), xt, yt);
  else if (cours > ancien) jeu.appeler(DESSINER_OBJET, figure(0x546), xt, yt);
  else if (cours < ancien) jeu.appeler(DESSINER_OBJET, figure(0x54A), xt, yt);

  const moi = mot(jeu, JOUEUR);
  const ilMeDetient = () => parts(jeu, j, moi) !== 0;   // il détient des actions de mon parc
  const jeLeDetiens = () => parts(jeu, moi, j) !== 0;   // je détiens des actions du sien
  if (mot(jeu, p + EN_VENTE) !== 0) {
    let xm = x + 0x74, ym = y + 0xA;
    if (ilMeDetient()) { xm -= 2; ym -= 2; }
    if (jeLeDetiens()) { xm -= 2; ym -= 2; }
    jeu.appeler(DESSINER_OBJET, figure(0x554), s16(xm), s16(ym));
  }
  if (ilMeDetient()) {
    let xm = x + 0x74, ym = y + 0xA;
    if (jeLeDetiens()) { xm -= 2; ym -= 2; }
    jeu.appeler(DESSINER_OBJET, figure(0x54E), s16(xm), s16(ym));
  }
  if (jeLeDetiens()) jeu.appeler(DESSINER_OBJET, figure(0x550), s16(x + 0x74), s16(y + 0xA));

  jeu.appeler(COPIER_N, tampon, jeu.appeler(NOM_DU_JOUEUR, j), 3);
  poserOctet(jeu, tampon + 3, 0);
  jeu.appeler(ECRIRE_TEXTE, s16(x), s16(y), tampon, 0, c);
  jeu.appeler(FORMATER, tampon, FORMAT_ENTIER, long(jeu, p + COURS));
  const longueur = s16(jeu.appeler(LONGUEUR, tampon));
  if (longueur > 1) poserOctet(jeu, tampon + longueur - 2, 0);
  jeu.appeler(ECRIRE_TEXTE, s16(x + 0x3C), s16(y), tampon, 0, c);
}

// =================================================================================================
// SANS FAMILLE
// =================================================================================================

// 0x407A0 — allumer ou éteindre un bouton de la fenêtre : la première zone de la table 0xCE898
// dont le code (+8) est `commande` reçoit `vivante` en +9.
export function boutonVivant(jeu, ebp, commande, vivante) {
  for (let zone = ZONES; idiv(u16(zone - ZONES), TAILLE_ZONE) < octet(jeu, NOMBRE_DE_ZONES); zone += TAILLE_ZONE) {
    if (octet(jeu, zone + 8) === u16(commande)) {
      poserOctet(jeu, zone + 9, vivante);
      return;
    }
  }
}

// 0x40BBC — écrire un texte dans un cadre, coupé aux espaces.
//
// Les signes s'ajoutent de gauche à droite depuis x0 (l'espace compte 8 points, un signe la largeur
// de son image plus 2) ; quand la ligne atteint x1, elle est coupée au dernier espace rencontré et
// écrite, centrée entre x0 et x1 si le bit 0 de `mise` est levé, et l'on passe à la ligne suivante
// (hauteur du « W » plus 2), tant qu'on ne dépasse pas `bas`. Le reste est écrit à la fin. Les
// coordonnées sont comparées en mots non signés.
//
// Anomalies reproduites : le dernier espace n'est pas oublié d'une ligne à l'autre — une ligne sans
// espace est coupée à la position de celui de la ligne d'avant, compté depuis son propre début ;
// et le premier signe d'une nouvelle ligne n'entre pas dans sa largeur.
export function texteDansUnCadre(jeu, ebp, x0, y, x1, bas, chaine, teinte, mise) {
  const hauteurDeLigne = octet(jeu, HAUTEUR_DE_LIGNE) + 2;
  const c = teinte & 0xFF;
  const ecrire = (t) => {
    if (mise & 1) jeu.appeler(ECRIRE_CENTRE, s16(x0), s16(x1), s16(y), t, 0, c);
    else jeu.appeler(ECRIRE_TEXTE, s16(x0), s16(y), t, 0, c);
  };
  let t = chaine >>> 0, x = x0, i = 0, espace = 0;
  while (octet(jeu, t + i) !== 0) {
    x += octet(jeu, t + i) === 0x20 ? 8 : octet(jeu, long(jeu, BANQUE_POLICE) + Math.imul(octet(jeu, CARACTERES + octet(jeu, t + i)), 6) + 4) + 2;
    if (u16(x) >= u16(x1)) {
      const garde = octet(jeu, t + espace);
      poserOctet(jeu, t + espace, 0);
      ecrire(t);
      poserOctet(jeu, t + espace, garde);
      t = (t + espace + 1) >>> 0;
      y += hauteurDeLigne;
      x = x0;
      i = 0;
      if (u16(y) > u16(bas)) return;
    }
    if (octet(jeu, t + i) === 0x20) espace = i;
    i = u16(i + 1);
  }
  if (i !== 0) ecrire(t);
}

// 0x4790C — semer les flocons : `nombre` éléments de 7 octets à partir de `table` (0x168 en
// 0xD2BB0, lus par 0x47A27 qui les fait tomber). Chacun : x au hasard sur 640 (mot +0), y sur 480
// (mot +2), une taille +4 de 1 à 3 — 3 pour un tirage sur 300 sous 100, 2 sous 200, 1 au-delà —,
// +5 à 1 et +6 à 0.
//
// Anomalies reproduites : le tirage sur 300 est rangé dans un octet, où les valeurs 256 à 299
// deviennent 0 à 43 et donnent la taille 3 ; un quatrième tirage est fait et jeté.
export function semerLesFlocons(jeu, ebp, nombre, table) {
  const tirage = (n) => (jeu.appeler(HASARD) & 0xFFFF) % n;
  for (let i = 0; i < u16(nombre); i++) {
    const f = (table + i * TAILLE_FLOCON) | 0;
    poserMot(jeu, f, tirage(ecran.largeur));         // 0x280 et 0x1E0 (grande-vue.js)
    poserMot(jeu, f + 2, tirage(ecran.hauteur));
    const taille = tirage(0x12C) & 0xFF;
    poserOctet(jeu, f + 4, taille < 100 ? 3 : taille < 200 ? 2 : 1);
    jeu.appeler(HASARD);
    poserOctet(jeu, f + 5, 1);
    poserOctet(jeu, f + 6, 0);
  }
}

// 0x4E2DB — la bande du haut de l'écran, quand la barre d'outils est masquée et que le pointeur y
// entre (boucle.js) : l'image 181 de la banque de l'interface, répétée sur toute la largeur.
export function bandeDuHaut(jeu, ebp) {
  const image = (long(jeu, BANQUE_INTERFACE) + 0x43E) | 0;
  for (let x = 0; s16(x) < ecran.largeur; x += octet(jeu, image + 4)) {   // 0x280 (grande-vue.js)
    jeu.appeler(basseResolution(jeu) ? TRACER_BASSE : TRACER_HAUTE, s16(x), 0, image);
  }
}

// =================================================================================================

export const reecritures = [
  { adresse: 0x40DA6, nom: 'poserUnDecor', fn: dansLeCadre(4, poserUnDecor), arguments: 1, retour: true, memoire: 'entiere' },
  // Le résultat n'est rendu que dans al, les autres octets d'eax gardant des restes de calcul ;
  // les deux appelants ne lisent que al : on ne compare pas eax.
  { adresse: 0x41936, nom: 'poserLesWagons', fn: dansLeCadre(0x30, poserLesWagons), arguments: 3, memoire: 'entiere' },
  { adresse: 0x41EB4, nom: 'oterLesWagons', fn: dansLeCadre(8, oterLesWagons), arguments: 1, memoire: 'entiere' },
  { adresse: 0x4395B, nom: 'annulerLaCaseMarquee', fn: dansLeCadre(0, annulerLaCaseMarquee), arguments: 0, memoire: 'entiere' },
  { adresse: 0x439DC, nom: 'porteDesRails', fn: dansLeCadre(8, porteDesRails), arguments: 1, retour: true },
  { adresse: 0x47268, nom: 'defilerPendantLeTrace', fn: dansLeCadre(0x2C, defilerPendantLeTrace), arguments: 0 },
  { adresse: 0x4FCC5, nom: 'ouvrirLaBarreDeMenus', fn: dansLeCadre(0, ouvrirLaBarreDeMenus), arguments: 0 },
  { adresse: 0x4FD2D, nom: 'fermerLaBarreDeMenus', fn: dansLeCadre(0, fermerLaBarreDeMenus), arguments: 0 },
  { adresse: 0x4B11E, nom: 'ouvrirLaBourse', fn: dansLeCadre(0x50, ouvrirLaBourse), arguments: 0, memoire: 'entiere' },
  { adresse: 0x4B56C, nom: 'menerLaBourse', fn: dansLeCadre(0x84, menerLaBourse), arguments: 0 },
  { adresse: 0x4BDD6, nom: 'ligneDUnJoueur', fn: dansLeCadre(0x50, ligneDUnJoueur), arguments: 6 },
  { adresse: 0x4C167, nom: 'ligneDuCours', fn: dansLeCadre(0x14, ligneDuCours), arguments: 4 },
  { adresse: 0x407A0, nom: 'boutonVivant', fn: dansLeCadre(4, boutonVivant), arguments: 2 },
  { adresse: 0x40BBC, nom: 'texteDansUnCadre', fn: dansLeCadre(0x10, texteDansUnCadre), arguments: 7 },
  { adresse: 0x4790C, nom: 'semerLesFlocons', fn: dansLeCadre(4, semerLesFlocons), arguments: 2 },
  { adresse: 0x4E2DB, nom: 'bandeDuHaut', fn: dansLeCadre(0x14, bandeDuHaut), arguments: 0 },
];

export const enAttente = [];
