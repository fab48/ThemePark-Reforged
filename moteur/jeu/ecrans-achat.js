// Les écrans d'achat, de fiche et de liste : attractions, boutiques, décors, personnel.
//
// Réécriture lisible des fonctions 0x370EC, 0x37E6D, 0x3854C, 0x398DF, 0x3A569, 0x3B011, 0x3B3B8 et
// 0x3D8B8 du jeu d'origine. Chaque constante vient du programme de 1994 ; `moteur/node/comparer.mjs`
// et `moteur/node/verifier.mjs` prouvent que le comportement est identique (voir en fin de fichier).
//
// --- Les fenêtres et leurs écrans ----------------------------------------------------------------
//
// `0x35F21(n)` ouvre la fenêtre n : une table en 0xB762D, 21 octets par fenêtre, dit de quoi elle est
// faite (+0 la liste de ses panneaux, octets terminés par 0xFD, que 0x3CC79 dessine), quel genre
// d'écran elle porte (mot +0xA, rangé dans 0xD6652) et quelle fonction la remplit (mot long +0x11).
// La boucle du parc, 0x11C45, appelle ensuite à chaque image la routine du genre d'écran, qu'elle
// trouve en cherchant ce genre dans la liste 0x11D7F (`repne scasb`) et en sautant à l'adresse de
// même rang dans la table 0x11D9F :
//
//   fenêtre  0xD6652  routine    l'écran
//   0x00     0x38     0x3A569    les finances : pays, inflation, taux, solde, prêt, prix d'entrée
//   0x01     0x36     0x370EC    acheter une attraction (catalogue 0xCCED0)
//   0x02     0x3A     0x370EC    acheter une boutique (catalogue 0xD3C62)
//   0x03     0x3C     0x370EC    embaucher un employé (catalogue 0xD35C0)
//   0x04     0x3E     0x370EC    acheter un décor ou une installation (catalogue 0xCCA70)
//   0x06     0x42     0x3854C    la fiche d'un visiteur
//   0x07–0A  0x1C     0x3854C    la fiche d'un employé (une fenêtre par métier)
//   0x0C     0x16     0x3854C    la fiche d'une boutique
//   0x0D     0x14     0x3854C    la fiche d'une attraction
//   0x0E     0x20     0x37E6D    la liste des attractions (F6)
//   0x0F     0x22     0x37E6D    la liste des boutiques (F5)
//   0x10     0x1E     0x37E6D    la liste du personnel (F7)
//   0x11     0x23     0x3854C    la fiche d'un jeu d'adresse (boutique de famille 8)
//   0x13     0x08     0x398DF    les pensées des visiteurs
//   0x14     0x3A     0x370EC    acheter un jeu d'adresse
//   0x15     0x60     0x3854C    la fiche d'une installation (toilettes, fontaine)
//
// Qui ouvre quoi, par les zones de l'écran du parc (0x15FBD, clic gauche, docs § 6.7) : les boutons 6
// à 9 de la barre d'outils ouvrent les quatre catalogues d'achat, les deux barres de jauges (zone 12)
// ouvrent les pensées, l'argent (zone 13) ouvre les finances ; le clic sur un objet du parc (0x15FBD et
// 0x20FF5) ouvre sa fiche, choisie sur son type — 2 visiteur, 4 attraction, 0xA boutique (fenêtre
// 0x11 si sa famille vaut 8, un jeu d'adresse), 8 employé (une fenêtre par valeur +0x2C du métier :
// 2 amuseur → 8, 8 mécanicien → 9, 0x16 homme à tout faire → 7, 0x34 gardien → 0xA), 0x18
// installation ; les touches F5, F6 et F7 ouvrent les trois listes (0x13BF3).
//
// --- Les éléments de l'écran ---------------------------------------------------------------------
//
// La mise en page vit dans une table en 0xB67C4, 11 octets par élément : un octet de repère, puis
// quatre mots signés x0, y0, x1, y1, puis un mot. `0x408D3(repère)` rend l'élément qui suit celui
// que marque `repère` ; les écrans avancent ensuite de 0xB en 0xB, élément par élément, et sautent
// une case en ajoutant 0x16. Les repères employés ici : 0x80 l'image de l'article, 0x83 les cinq
// cases du catalogue, 0x89 la fiche d'un visiteur, 0x8A la jauge d'un employé, 0x92 le cadre d'une
// liste, 0x98 et 0x99 les colonnes de chiffres, 0x9A la case du nom, 0xA1 le visiteur.
//
// --- Les zones cliquables de la fenêtre ----------------------------------------------------------
//
// 0x3CC79, en dessinant la fenêtre, remplit une table de zones en 0xCE898, 10 octets par zone
// (x0, y0, x1, y1 mots signés, puis l'octet +8, numéro de commande, et l'octet +9, 1 si la zone est
// vivante) ; leur nombre est dans 0xD778B. Chaque commande a sa fiche dans 0xB7537, 6 octets : deux
// mots, puis +4 la touche du clavier qui la déclenche et +5 sa sorte — 8 un bouton qui se répète
// tant qu'on le tient, 2 un bouton qui agit au relâchement. 0x3B011 cherche la zone visée et appelle
// 0x3B76E, qui exécute la commande ; 0xD778C porte la zone en cours, 0xFF s'il n'y en a pas.
//
// --- Les variables de l'écran ouvert -------------------------------------------------------------
//
//   0xB14D9  octet : l'état de la fenêtre — 1 elle s'ouvre (ses zones apparaissent une à une),
//            3 elle est prête, 4 le choix glisse vers 0xB14E0, 5 elle se ferme
//   0xB14D7  octet : le compte à rebours de l'animation et de la répétition d'un bouton
//   0xB14DE  mot : la ligne choisie dans une liste ; 0xB14E0 : celle vers où elle glisse, -1 sinon
//   0xB14E6  mot : la fenêtre ouverte ; 0xB14DA : pointeur sur une fiche de couleurs (+5 : la
//            couleur du texte)
//   0xD7787  octet : l'article choisi dans un catalogue d'achat ; 0xD778E : le nombre d'articles
//   0xD6678  mot : l'objet du parc dont on regarde la fiche ; 0xD6628 : le nombre de lignes d'une
//            liste, 0xD382C la liste elle-même (14 octets par ligne)
//   0xD77CC  mot : on est en train de taper un nom dans la case du nom ; 0xD77A8 : ce qu'on tape
//
// --- Ce qui n'est pas établi ---------------------------------------------------------------------
//
// Le genre d'écran 0x58, que 0x3B011 et 0x3D8B8 traitent à part (aucune fenêtre de la table ne le
// porte) ; ce que compte exactement le champ +0x34 d'un employé, dont sa fiche tire la jauge
// « TEMPS DE TRAVAIL » en le rapportant au temps de service ; le champ +0xA9 du genre d'une
// attraction, dont la fiche tire l'appréciation « CAPACITE », et son +0xC6, la note montrée en
// dixièmes après son nom ; les mots +0 et +2 d'une fiche de commande (0xB7537) ; et les tables de
// chaînes [0xD7B70], [0xD7B78], [0xD7B7C], [0xD7B88], [0xD7BC0], [0xD7BC4], [0xD7BD0], dont seul
// l'usage est connu.

// --- Accès à la mémoire ---------------------------------------------------------------------------
const s16 = (v) => (v << 16) >> 16;
const s8 = (v) => (v << 24) >> 24;
const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// Division entière du processeur : tronquée vers zéro.
const idiv = (a, b) => (a / b) | 0;

// Les variables locales de l'original qui doivent vivre en mémoire (les textes qu'on compose avant de
// les écrire) : on descend le pointeur de pile comme le fait son `enter`, et l'on rend l'adresse de
// la zone ainsi réservée ; les appels suivants empilent plus bas. Le pointeur est remis en place à la
// fin, pour qu'une réécriture qui en appelle une autre directement ne fasse pas descendre la pile.
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
const ECRAN = 0xD6652;               // mot : le genre d'écran ouvert ; 0 = la vue du parc
const FENETRE = 0xB14E6;             // mot : le numéro de la fenêtre ouverte
const TABLE_DES_FENETRES = 0xB762D, TAILLE_FENETRE = 0x15;

const ETAT_FENETRE = 0xB14D9;        // octet : 1 ouverture, 3 prête, 4 le choix glisse, 5 fermeture
const COMPTE_A_REBOURS = 0xB14D7;    // octet
const LIGNE_CHOISIE = 0xB14DE;       // mot : la ligne d'une liste
const LIGNE_VISEE = 0xB14E0;         // mot : celle vers où le choix glisse, -1 si aucune
const COULEURS = 0xB14DA;            // pointeur : +5 la couleur du texte de l'écran

const ZONES = 0xCE898, TAILLE_ZONE = 10;   // les zones cliquables de la fenêtre
const NOMBRE_DE_ZONES = 0xD778B;     // octet
const ZONE_COURANTE = 0xD778C;       // octet : la zone visée, 0xFF si aucune
const ZONE_EN_COURS = 0xD381C;       // pointeur sur la zone visée, -1 si aucune
const COMMANDES = 0xB7537, TAILLE_COMMANDE = 6;  // +4 la touche, +5 la sorte (8 répétée, 2 au relâché)

const ARTICLE_CHOISI = 0xD7787;      // octet : l'article au milieu d'un catalogue d'achat
const NOMBRE_D_ARTICLES = 0xD778E;   // octet
const CATALOGUE = 0xCE9D8, TAILLE_ARTICLE = 13;  // ce que 0x360C5 a préparé pour l'affichage
//   +0 mot : le nom (indice dans [0xD7BD0]) ; +2 mot : l'image ; +4 mot long : le prix ;
//   +8 mot : non établi ; +0xA octet : la fiche dans le catalogue d'origine ; +0xB octet : trop cher
const COULEUR_TROP_CHER = 0xD777C;   // octet : le fond d'un article qu'on n'a pas les moyens d'acheter

const OBJET_CHOISI = 0xD6678;        // mot : l'objet du parc dont on regarde la fiche
const OBJETS = 0xD3B10, TAILLE_OBJET = 0xC8;
const LISTE = 0xD382C, TAILLE_LIGNE = 14;   // les lignes d'une liste : +0 le nom, +4, +6, +8 des mots
const NOMBRE_DE_LIGNES = 0xD6628;    // mot
const COULEUR_DES_LISTES = 0xB67C3;  // octet, posé une fois pour toutes (37)

const SAISIE_DU_NOM = 0xD77CC;       // mot : on tape un nom dans la case du nom
const NOM_TAPE = 0xD77A8;            // le nom en cours de frappe
const CLAVIER = 0xDE688;             // octet : la touche de l'image

const MODE_AFFICHAGE = 0xDE5F6;      // mot : 1 = 320x200, 8 = 640x480
const SURFACE = 0xDE5BC;             // pointeur : l'image en cours de construction
const TAMPON_DE_FOND = 0xD3B98;      // pointeur : le fond, gardé d'une image à l'autre
const MEMOIRE_VIDEO = 0xA0000;

const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;
const APPUI_DROIT = 0xDE5A4, APPUI_GAUCHE = 0xDE5A6;   // mots : 1 à l'appui, à remettre à 0
const DROIT_ENFONCE = 0xDE5AA, GAUCHE_ENFONCE = 0xDE5AC;

const PAS_DE_SIMULATION = 0xD3AFC;   // mot long
const FICHE_DU_JOUEUR = 0xD3808, COMPTES_DU_JOUEUR = 0xD3814, PARC_DU_JOUEUR = 0xD3818;
const PAYS = 0xB7B38, TAILLE_PAYS = 0x1C;   // +9 l'inflation, +0xB le taux, en centièmes de pour cent

const GENRES_D_ATTRACTION = 0xCCED0, TAILLE_GENRE = 0xC8;    // le catalogue de la partie
const REFERENCE_D_ATTRACTION = 0xB17A4 - 4;                  // les fiches de référence, 0xB17A0 + 4
const FICHES_DE_BOUTIQUE = 0xD3C62, TAILLE_BOUTIQUE = 0x6B;
const MARCHANDISES = 0xD3C00;        // la réserve d'une boutique : +2 le coût, +4 le nom
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;
const INSTALLATIONS = 0xCCA70, TAILLE_INSTALLATION = 0x38;

// Les tables de chaînes, chacune un tableau de pointeurs.
const NOMS_DES_PAYS = 0xD7B70;       // [+4 × l'octet +0 du pays]
const TEXTES_DU_VISITEUR = 0xD7B78;  // +0x2C.. : son ancienneté et son humeur
const TEXTES_COURTS = 0xD7B7C;       // les appréciations (excitation, prix…)
const TEXTES_DES_PENSEES = 0xD7B88;
const TEXTES_DE_L_ECRAN = 0xD7BC0;   // +0xCC, +0xD0, +0xD4
const TEXTES_DES_DECORS = 0xD7BC4, TEXTES_DES_METIERS = 0xD7BA0;
const TEXTES_DES_BOUTIQUES = 0xD7BA4, TEXTES_DES_ARTICLES = 0xD7B9C;
const TEXTES_DES_NOMS = 0xD7BD0;     // les noms des attractions et des boutiques, et les intitulés
const INTITULES = 0xD7B84;           // +0x50 « INFLATION », +0x54 le taux d'intérêt

// Les formats de la bibliothèque C, en mémoire à ces adresses.
const F_NOMBRE = 0xB0158;            // "%d"
const F_NOM_ET_DECIMAL = 0xB015F;    // "%s %d.%d"
const F_CHAINE = 0xB0168;            // "%s"
const F_INCONNU = 0xB016B;           // "?"
const F_POUR_CENT = 0xB016D;         // "%d%%"
const F_A = 0xB0172;                 // "%d AT %d"
const F_SUR = 0xB017B;               // "%d/%d"
const F_ENTRE_PARENTHESES = 0xB0181; // "%d(%d)"
const F_DEUX_NOMBRES = 0xB0188;      // "%s %d %d"
const F_NOM_ET_NOMBRE = 0xB0191;     // "%s %d"
const F_DEUX_NOMS = 0xB0197;         // "%s - %s"
const F_POURCENTAGE = 0xB019F;       // "%s: %d.%d%%"

// --- Les fonctions appelées -------------------------------------------------------------------------
const ELEMENT = 0x408D3;             // (repère) : l'élément de mise en page qui suit ce repère
const FORMATER = 0x7F652;            // sprintf
const ECRIRE_CENTRE = 0x3F377;       // (x0, x1, y, texte, mode, couleur) : centré entre x0 et x1
const ECRIRE = 0x3F49E;              // (x, y, texte, mode, couleur)
const LARGEUR_DU_TEXTE = 0x3F714;    // (texte) : sa largeur en pixels
const ECRIRE_AVEC_CURSEUR = 0x3F7BD;  // (x, y, texte, mode, couleur) : le texte qu'on est en train de taper
const RECTANGLE = 0x1188C;           // (x, y, largeur, hauteur, couleur)
// (x0, y0, x1, y1, couleur, 0) : un trait. Les deux routines ne diffèrent que par la fenêtre de
// découpe, doublée en basse résolution.
const TRAIT_BASSE = 0x81374, TRAIT_HAUTE = 0x8148C;
const IMAGE_DANS_UN_CADRE = 0x3EF1D;  // (x0, y0, x1, y1, image)
const TEXTE_DANS_UN_CADRE = 0x40BBC;  // (x0, y0, x1, y1, texte, couleur, 0)
const DESSINER_OBJET = 0x209B5;      // (objet graphique, x, y)
const DESSINER_IMAGE = 0x20F4C;      // (x, y, image, 0)
const COPIER_320 = 0x80E20;          // (source, destination, lignes de 320 octets)
const COPIER_ECRAN = 0x54ED6;        // (source, destination) : l'écran entier, 640x480
const DESSINER_LA_BARRE = 0x4DE1A;   // (mode) : le panneau de commande du parc
const DESSINER_LA_FENETRE = 0x3CC79; // (fenêtre) : ses panneaux et ses zones cliquables
const AVANT_LA_FENETRE = 0x40D3E, FERMER_LA_FENETRE = 0x40D79;
const PREPARER_LE_FOND = 0x3D72B;
const EXECUTER_LA_COMMANDE = 0x3B76E;
const BRUITAGE = 0x80C80;            // (propriétaire, bruitage)
const TRAITER_LE_PARC = 0x145FB;     // les zones de l'écran du parc
const PRESENTER_320 = 0x80210, PRESENTER_640 = 0x55507;
const JAUGE_BASSE = 0x80E88, JAUGE_HAUTE = 0x80F34;   // (x, y, texte, couleur)
const CADRE_DE_L_ECRAN = 0x5877B;
const NOM_DU_JOUEUR = 0x4C50B;
const COPIER_CHAINE = 0x7E1ED;
const TAPER_UN_NOM = 0x793B1;        // (invite, tampon) : 0 on tape encore, 1 validé, 2 abandonné
const POSER_LE_CURSEUR = 0x7D775, RETIRER_LE_CURSEUR = 0x7D79E;
const CHOISIR_BANQUE = 0x7E6BC;
const SERVIR_L_HOTE = 0x1107F;
// Les trois routines communes aux écrans, réécrites ici aussi : les écrans les appellent par leur
// entrée, comme le fait l'original, pour que l'hôte et les vérificateurs voient les mêmes appels.
const DEBUT_D_IMAGE = 0x3B3B8, FIN_D_IMAGE = 0x3D8B8, BOUTONS_DE_LA_FENETRE = 0x3B011;
const ANIMER_LES_PENSEES = 0x4091A;
const HASARD = 0x18B92;

// L'élément de mise en page : quatre mots signés à partir de +1.
const elementX0 = (jeu, e) => motSigne(jeu, e + 1);
const elementY0 = (jeu, e) => motSigne(jeu, e + 3);
const elementX1 = (jeu, e) => motSigne(jeu, e + 5);
const elementY1 = (jeu, e) => motSigne(jeu, e + 7);

// La couleur du texte de l'écran courant.
const couleurDuTexte = (jeu) => octet(jeu, long(jeu, COULEURS) + 5);

// Écrire le tampon centré dans la largeur de l'élément, quatre pixels sous son bord haut : le geste
// que les écrans répètent à chaque ligne de chiffres.
function ecrireDansLElement(jeu, e, tampon, mode = 0) {
  jeu.appeler(ECRIRE_CENTRE, elementX0(jeu, e), elementX1(jeu, e), s16(mot(jeu, e + 3) + 4),
    tampon, mode, couleurDuTexte(jeu));
}

// =====================================================================================================
// 0x3D8B8 — la fin de l'image d'un écran : le panneau du parc, puis l'animation de la fenêtre.
//
// Le panneau de commande est redessiné par-dessus l'écran ouvert : le temps de l'appel, le pointeur du
// tampon de fond désigne la surface de dessin, car 0x4DE1A dessine toujours dans le fond. L'écran 0x58
// (non établi, aucun scénario ne l'ouvre) s'en passe.
//
// Vient ensuite l'animation de la fenêtre, selon 0xB14D9 :
//   1  elle s'ouvre : toutes les images que compte 0xB14D7, une zone cliquable de plus devient
//      visible ; la dernière passée, la fenêtre est prête (état 3) ;
//   4  le choix glisse d'une ligne par image vers 0xB14E0, puis la fenêtre est prête ;
//   3 et 4  les boutons sont examinés (0x3B011) ;
//   5  elle se ferme : le fond est refait et l'image présentée, et la fenêtre repasse prête.
export function finirLImageDeLEcran(jeu) {
  if (mot(jeu, ECRAN) !== 0x58) {
    const fond = long(jeu, TAMPON_DE_FOND);
    poserLong(jeu, TAMPON_DE_FOND, long(jeu, SURFACE));
    jeu.appeler(DESSINER_LA_BARRE, 1);
    poserLong(jeu, TAMPON_DE_FOND, fond);
  }
  const etat = octet(jeu, ETAT_FENETRE);
  if (etat === 1) {
    poserOctet(jeu, COMPTE_A_REBOURS, octet(jeu, COMPTE_A_REBOURS) - 1);
    if (octet(jeu, COMPTE_A_REBOURS) === 0) {
      if (octetSigne(jeu, ZONE_COURANTE) === -1) {
        if (octet(jeu, NOMBRE_DE_ZONES) > 0) {
          poserOctet(jeu, ZONE_COURANTE, 0);
          poserOctet(jeu, COMPTE_A_REBOURS, 1);
        }
      } else if (octetSigne(jeu, ZONE_COURANTE) < octet(jeu, NOMBRE_DE_ZONES)) {
        poserOctet(jeu, ZONE_COURANTE, octet(jeu, ZONE_COURANTE) + 1);
        poserOctet(jeu, COMPTE_A_REBOURS, 1);
      } else {
        poserOctet(jeu, ETAT_FENETRE, 3);
        poserOctet(jeu, ZONE_COURANTE, 0xFF);
      }
    }
  } else if (etat === 4) {
    if (mot(jeu, LIGNE_CHOISIE) === mot(jeu, LIGNE_VISEE) || motSigne(jeu, LIGNE_VISEE) === -1) {
      poserOctet(jeu, ETAT_FENETRE, 3);
      poserMot(jeu, LIGNE_VISEE, 0xFFFF);
    } else if (motSigne(jeu, LIGNE_CHOISIE) < motSigne(jeu, LIGNE_VISEE)) {
      poserMot(jeu, LIGNE_CHOISIE, mot(jeu, LIGNE_CHOISIE) + 1);
    } else if (motSigne(jeu, LIGNE_CHOISIE) > motSigne(jeu, LIGNE_VISEE)) {
      poserMot(jeu, LIGNE_CHOISIE, mot(jeu, LIGNE_CHOISIE) - 1);
    }
    jeu.appeler(BOUTONS_DE_LA_FENETRE);
  } else if (etat === 3) {
    jeu.appeler(BOUTONS_DE_LA_FENETRE);
  } else if (etat === 5) {
    const fenetre = TABLE_DES_FENETRES + TAILLE_FENETRE * mot(jeu, FENETRE);
    if (octet(jeu, fenetre + 0x10) !== 0) {
      jeu.appeler(PREPARER_LE_FOND);
      if (mot(jeu, MODE_AFFICHAGE) & 1) jeu.appeler(PRESENTER_320, 0x190);
      else jeu.appeler(PRESENTER_640);
    }
    poserOctet(jeu, ETAT_FENETRE, 3);
  }
  jeu.appeler(PREPARER_LE_FOND);
}

// =====================================================================================================
// 0x3B011 — les boutons de la fenêtre ouverte.
//
// Les zones cliquables, que 0x3CC79 a rangées en 0xCE898, sont examinées tant qu'aucune n'est retenue
// (0xD381C vaut -1). Une zone est retenue quand la touche de sa commande est frappée — la commande
// part aussitôt —, ou quand le bouton gauche est pressé dedans. Une zone retenue est ensuite suivie
// d'image en image : tant que le pointeur y reste, un bouton de sorte 8 répète sa commande (20 images
// d'attente la première fois, puis 3), un bouton de sorte 2 l'exécute quand le bouton est relâché.
// Le pointeur sorti de la zone, ou le bouton relâché, la relâchent.
//
// Sans zone retenue, l'écran laisse passer les entrées vers l'écran du parc (0x145FB) — sauf l'écran
// 0x58, non établi, qui se contente de remettre les boutons de la souris à zéro.
export function traiterLesBoutonsDeLaFenetre(jeu) {
  if (octetSigne(jeu, COMPTE_A_REBOURS) > 0) poserOctet(jeu, COMPTE_A_REBOURS, octet(jeu, COMPTE_A_REBOURS) - 1);
  poserOctet(jeu, ZONE_COURANTE, 0xFF);
  if (long(jeu, ZONE_EN_COURS) === 0xFFFFFFFF) chercherLaZoneVisee(jeu);
  if (long(jeu, ZONE_EN_COURS) === 0xFFFFFFFF) {
    if (mot(jeu, ECRAN) !== 0x58) jeu.appeler(TRAITER_LE_PARC);
    else rendreLesBoutons(jeu);
    return;
  }
  const zone = long(jeu, ZONE_EN_COURS);
  if (octet(jeu, zone + 9) === 0) {
    poserLong(jeu, ZONE_EN_COURS, -1);
    return;
  }
  if (!pointeurDansLaZone(jeu, zone)) {
    // Le pointeur a quitté la zone : elle n'est relâchée qu'une fois le bouton gauche relevé.
    if (mot(jeu, GAUCHE_ENFONCE) === 0) {
      poserLong(jeu, ZONE_EN_COURS, -1);
      rendreLesBoutons(jeu);
    }
    return;
  }
  const commande = COMMANDES + TAILLE_COMMANDE * octet(jeu, zone + 8);
  poserOctet(jeu, ZONE_COURANTE, numeroDeLaZone(zone));
  if (octet(jeu, commande + 5) === 8) {
    if (mot(jeu, GAUCHE_ENFONCE) === 0) poserOctet(jeu, COMPTE_A_REBOURS, 0);
    if (octet(jeu, COMPTE_A_REBOURS) === 0) {
      jeu.appeler(EXECUTER_LA_COMMANDE);
      if (mot(jeu, GAUCHE_ENFONCE) !== 0) {
        poserOctet(jeu, COMPTE_A_REBOURS, 3);
      } else {
        poserOctet(jeu, COMPTE_A_REBOURS, 0xFF);
        poserLong(jeu, ZONE_EN_COURS, -1);
        rendreLesBoutons(jeu);
      }
      jeu.appeler(BRUITAGE, 0, 1);
    }
    if (octetSigne(jeu, COMPTE_A_REBOURS) > 0) poserOctet(jeu, COMPTE_A_REBOURS, octet(jeu, COMPTE_A_REBOURS) - 1);
  } else if (octet(jeu, commande + 5) === 2 && mot(jeu, GAUCHE_ENFONCE) === 0) {
    jeu.appeler(EXECUTER_LA_COMMANDE);
    poserLong(jeu, ZONE_EN_COURS, -1);
    rendreLesBoutons(jeu);
    jeu.appeler(BRUITAGE, 0, 1);
  }
}

// Les quatre mots de la souris remis à zéro : l'écran vient de consommer le clic.
function rendreLesBoutons(jeu) {
  poserMot(jeu, DROIT_ENFONCE, 0);
  poserMot(jeu, GAUCHE_ENFONCE, 0);
  poserMot(jeu, APPUI_DROIT, 0);
  poserMot(jeu, APPUI_GAUCHE, 0);
}

const numeroDeLaZone = (zone) => idiv(((zone - ZONES) & 0xFFFF) >>> 0, TAILLE_ZONE) & 0xFF;

function pointeurDansLaZone(jeu, zone) {
  const x = motSigne(jeu, SOURIS_X), y = motSigne(jeu, SOURIS_Y);
  return x >= motSigne(jeu, zone) && x <= motSigne(jeu, zone + 4)
    && y >= motSigne(jeu, zone + 2) && y <= motSigne(jeu, zone + 6);
}

// La recherche de la zone visée : la première dont la touche est frappée, ou la première que l'appui
// du bouton gauche désigne. Une zone de sorte 8 ainsi saisie attend 20 images avant de se répéter.
function chercherLaZoneVisee(jeu) {
  poserLong(jeu, ZONE_EN_COURS, ZONES);
  while ((ZONES + TAILLE_ZONE * octet(jeu, NOMBRE_DE_ZONES)) >>> 0 > long(jeu, ZONE_EN_COURS)) {
    const zone = long(jeu, ZONE_EN_COURS);
    if (octet(jeu, zone + 9) === 1) {
      const commande = COMMANDES + TAILLE_COMMANDE * octet(jeu, zone + 8);
      if (octet(jeu, commande + 4) === octet(jeu, CLAVIER)) {
        jeu.appeler(EXECUTER_LA_COMMANDE);
        poserOctet(jeu, ZONE_COURANTE, numeroDeLaZone(zone));
        poserLong(jeu, ZONE_EN_COURS, -1);
        break;
      }
      if (mot(jeu, APPUI_GAUCHE) !== 0 && pointeurDansLaZone(jeu, zone)) {
        poserMot(jeu, APPUI_GAUCHE, 0);
        if (octet(jeu, commande + 5) === 8) poserOctet(jeu, COMPTE_A_REBOURS, 0x14);
        poserOctet(jeu, ZONE_COURANTE, numeroDeLaZone(zone));
        break;
      }
    }
    poserLong(jeu, ZONE_EN_COURS, long(jeu, ZONE_EN_COURS) + TAILLE_ZONE);
  }
  if (octetSigne(jeu, ZONE_COURANTE) === -1) poserLong(jeu, ZONE_EN_COURS, -1);
}

// =====================================================================================================
// 0x3B3B8 — le début de l'image d'un écran : le fond.
//
// Les fenêtres 6 à 0xA, 0xC, 0xD et 0x11 — les fiches, qui se posent sur la vue du parc — sont
// redessinées en entier à chaque image, avec leurs zones cliquables et la fonction de remplissage que
// la table leur donne. Les autres, qui occupent tout l'écran, ne redessinent que ce que l'image
// précédente a sali : le fond gardé en [0xD3B98] revient sur la surface de dessin.
export function commencerLImageDeLEcran(jeu) {
  jeu.appeler(AVANT_LA_FENETRE);
  const n = mot(jeu, FENETRE);
  if ((n >= 6 && n <= 0xA) || (n >= 0xC && n <= 0xD) || n === 0x11) {
    const fenetre = TABLE_DES_FENETRES + TAILLE_FENETRE * n;
    jeu.appeler(DESSINER_LA_FENETRE, fenetre);
    if (long(jeu, fenetre + 0x11) !== 0) jeu.appeler(long(jeu, fenetre + 0x11));
  } else if (mot(jeu, MODE_AFFICHAGE) & 1) {
    // 200 lignes de 320 octets : l'écran entier en basse résolution. L'original calcule cette hauteur
    // par un second test du mode, toujours vrai ici ; sa branche à 480 lignes est morte.
    jeu.appeler(COPIER_320, long(jeu, TAMPON_DE_FOND), long(jeu, SURFACE), idiv(0x190, 2) & 0xFFFF);
  } else {
    jeu.appeler(COPIER_ECRAN, long(jeu, TAMPON_DE_FOND), long(jeu, SURFACE));
  }
}

// =====================================================================================================
// 0x3A569 — l'écran des finances (0xD6652 = 0x38, fenêtre 0).
//
// Ce que le joueur y voit (relevé en jeu) : en haut « ROYAUME-UNI - IT'S YOU BUDDY », son pays et son
// nom, puis deux jauges, « INFLATION » et « INTERET », en centièmes de pour cent (table des pays
// 0xB7B38, +9 et +0xB) ; au milieu le graphique des comptes (0x5877B) ; en bas quatre nombres :
// « CASH DISPONIBLE » (+0x0A de sa fiche), « VALEUR DU PARC » (+0x19 du parc), « PRET EN COURS »
// (+0x12) et « PRIX DES BILLETS » (+0x1D du parc).
// Les pour-cent sont écrits « %d.%d » : 632 donne bien « 6.32 », mais 605 donne « 6.5 », le zéro des
// centièmes manquant. L'anomalie est celle de 1994 ; elle est reproduite telle quelle.
export function ecranDesFinances(jeu) {
  jeu.appeler(DEBUT_D_IMAGE);
  avecTampon(jeu, 0x80, (tampon) => {
    const fiche = long(jeu, FICHE_DU_JOUEUR);
    const comptes = long(jeu, COMPTES_DU_JOUEUR);
    const parc = long(jeu, PARC_DU_JOUEUR);
    const couleur = couleurDuTexte(jeu);
    const nom = jeu.appeler(NOM_DU_JOUEUR, octet(jeu, comptes + 0x40));
    const pays = PAYS + TAILLE_PAYS * octetSigne(jeu, fiche + 5);
    jeu.appeler(FORMATER, tampon, F_DEUX_NOMS,
      long(jeu, long(jeu, NOMS_DES_PAYS) + 4 * octet(jeu, pays)), nom);
    jeu.appeler(ECRIRE, 0x1C, 0xC, tampon, 0, couleur);
    ecrireUnePart(jeu, tampon, long(jeu, long(jeu, INTITULES) + 0x50), mot(jeu, pays + 9), 0x1A);
    ecrireUnePart(jeu, tampon, long(jeu, long(jeu, INTITULES) + 0x54), mot(jeu, pays + 0xB), 0x26);
    jeu.appeler(CADRE_DE_L_ECRAN, 0x1FC, 0xC4, 0xAA, 0x1E, 1);
    let e = jeu.appeler(ELEMENT, 0x98);
    jeu.appeler(FORMATER, tampon, F_NOMBRE, longSigne(jeu, fiche + 0x0A));   // le solde
    ecrireDansLElement(jeu, e, tampon);
    e += 0xB;
    jeu.appeler(FORMATER, tampon, F_NOMBRE, longSigne(jeu, parc + 0x19));    // la valeur du parc
    ecrireDansLElement(jeu, e, tampon);
    e += 0xB;
    jeu.appeler(FORMATER, tampon, F_NOMBRE, longSigne(jeu, fiche + 0x12));   // le prêt
    ecrireDansLElement(jeu, e, tampon);
    e += 0x16;
    jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, parc + 0x1D));          // le prix d'entrée
    ecrireDansLElement(jeu, e, tampon);
  });
  jeu.appeler(FIN_D_IMAGE);
}

// Une jauge « INTITULÉ: x.yy% », dessinée par la routine de la résolution courante.
function ecrireUnePart(jeu, tampon, intitule, centiemes, y) {
  jeu.appeler(FORMATER, tampon, F_POURCENTAGE, intitule, idiv(centiemes, 100), centiemes % 100);
  const couleur = couleurDuTexte(jeu);
  if (mot(jeu, MODE_AFFICHAGE) & 1) jeu.appeler(JAUGE_BASSE, 0x1C, y, tampon, couleur);
  else jeu.appeler(JAUGE_HAUTE, 0x1C, y, tampon, couleur);
}

// =====================================================================================================
// 0x37E6D — les trois listes : attractions (F6), boutiques (F5), personnel (F7).
//
// La liste, préparée par 0x3671D en 0xD382C (14 octets par ligne : le nom, puis trois mots), tient sur
// 24 lignes de 12 pixels. La ligne choisie (0xB14DE) est gardée au milieu : la première affichée est
// 0xB14DE − 12, bornée aux deux bouts. Passer le pointeur sur une autre ligne, bouton gauche enfoncé,
// la vise (0xB14E0) et fait glisser le choix (état 4).
//
// La ligne choisie porte un cadre : deux traits en travers, un fond plein et deux traits debout ; elle
// pousse de deux pixels vers le bas tout ce qui la suit, et la ligne juste après de deux de plus.
// Les colonnes de droite dépendent de la liste : pour les attractions et les boutiques, deux nombres,
// et pour les boutiques leur produit ; pour le personnel, un pourcentage puis un nombre.
export function ecranDeListe(jeu) {
  jeu.appeler(DEBUT_D_IMAGE);
  avecTampon(jeu, 0x80, (tampon) => {
    const cadre = jeu.appeler(ELEMENT, 0x92);
    const couleur = octet(jeu, COULEUR_DES_LISTES);
    const nombre = mot(jeu, NOMBRE_DE_LIGNES);
    if (nombre === 0) return;
    let premiere;
    if (motSigne(jeu, LIGNE_CHOISIE) < 0xC || nombre < 0x18) premiere = 0;
    else if (motSigne(jeu, LIGNE_CHOISIE) > nombre - 0xC) premiere = nombre - 0x18;
    else premiere = mot(jeu, LIGNE_CHOISIE) - 0xC;
    const x0 = motSigne(jeu, cadre + 1), x1 = motSigne(jeu, cadre + 5);
    let y = (mot(jeu, cadre + 3) + 0x1E) & 0xFFFF;
    for (let ligne = 0; ligne < 0x18 && (premiere & 0xFFFF) < mot(jeu, NOMBRE_DE_LIGNES);
      ligne++, y = (y + 0xC) & 0xFFFF, premiere = (premiere + 1) & 0xFFFF) {
      // Le survol, bouton gauche enfoncé, vise une autre ligne.
      if (mot(jeu, GAUCHE_ENFONCE) !== 0 && octet(jeu, ETAT_FENETRE) === 3
        && (premiere & 0xFFFF) !== motSigne(jeu, LIGNE_CHOISIE)
        && motSigne(jeu, SOURIS_X) >= x0 + 6 && motSigne(jeu, SOURIS_X) <= x1
        && motSigne(jeu, SOURIS_Y) >= y && motSigne(jeu, SOURIS_Y) <= y + 0xA) {
        poserMot(jeu, LIGNE_VISEE, premiere);
        poserOctet(jeu, ETAT_FENETRE, 4);
        rendreLesBoutons(jeu);
      }
      if ((premiere & 0xFFFF) === motSigne(jeu, LIGNE_CHOISIE)) {
        trait(jeu, x0 + 8, y, x1 - 4, y);
        trait(jeu, x0 + 8, y + 0xC, x1 - 4, y + 0xC);
        y = (y + 2) & 0xFFFF;
        jeu.appeler(RECTANGLE, s16(x0 + 8), s16(y), s16((x1 - x0 - 0xC) & 0xFFFF), 0xA, 0x21);
        trait(jeu, x0 + 6, y, x0 + 6, y + 0xA);
        trait(jeu, x1 - 4, y, x1 - 4, y + 0xA);
      } else if ((premiere & 0xFFFF) === motSigne(jeu, LIGNE_CHOISIE) + 1) {
        y = (y + 2) & 0xFFFF;
      }
      const l = LISTE + TAILLE_LIGNE * (premiere & 0xFFFF);
      jeu.appeler(ECRIRE, s16(x0 + 0xC), s16(y), long(jeu, l), 0, couleur);
      const colonne = (a, b, valeur) => {
        jeu.appeler(FORMATER, tampon, F_NOMBRE, valeur);
        jeu.appeler(ECRIRE_CENTRE, s16(x0 + a), s16(x0 + b), s16(y), tampon, 0, couleur);
      };
      const ecran = mot(jeu, ECRAN);
      if (ecran === 0x20) {            // les attractions : visiteurs servis, recette
        colonne(0xFA, 0x15E, motSigne(jeu, l + 4));
        colonne(0x15E, 0x1C2, motSigne(jeu, l + 6));
      } else if (ecran === 0x22) {     // les boutiques : ventes, prix, et leur produit
        colonne(0xDC, 0x140, motSigne(jeu, l + 4));
        colonne(0x140, 0x1A4, motSigne(jeu, l + 6));
        colonne(0x1A4, 0x208, Math.imul(motSigne(jeu, l + 4), motSigne(jeu, l + 6)));
      } else if (ecran === 0x1E) {     // le personnel : un pourcentage, puis le salaire
        jeu.appeler(FORMATER, tampon, F_POUR_CENT, motSigne(jeu, l + 6));
        jeu.appeler(ECRIRE_CENTRE, s16(x0 + 0xFA), s16(x0 + 0x15E), s16(y), tampon, 0, couleur);
        colonne(0x15E, 0x1C2, motSigne(jeu, l + 8));
      }
    }
  });
  jeu.appeler(FIN_D_IMAGE);
}

// Un trait de couleur 0x20, par la routine de la résolution courante.
function trait(jeu, x0, y0, x1, y1) {
  const routine = (mot(jeu, MODE_AFFICHAGE) & 1) ? TRAIT_BASSE : TRAIT_HAUTE;
  jeu.appeler(routine, s16(x0), s16(y0), s16(x1), s16(y1), 0x20, 0);
}

// =====================================================================================================
// 0x398DF — l'écran des pensées des visiteurs (0xD6652 = 8, fenêtre 0x13).
//
// Quarante bulles, rangées en 0xCC818, 15 octets chacune : +0 et +2 sa position, +4 l'abscisse où elle
// s'arrête, +6 celle d'où elle vient et où elle repart, +8 son image, +0xA la figure en cours dans sa
// suite d'animation (0xB49F4, 0x24 octets par sorte), +0xB sa phase, +0xC sa sorte, +0xD son genre
// (1 à 6 et 8 ; 0x4091A les distribue) et +0xE le compte à rebours de l'image.
//
// Les phases : 1 la bulle entre par le côté, huit pixels par image, jusqu'à son abscisse d'arrêt ;
// 2 elle attend, et une image sur 96 environ elle pense quelque chose (phase 4) ; 3 elle s'en va vers
// +6 ; 4 la pensée se joue jusqu'à la dernière image de sa suite, puis retour en 2 ; 5 les bulles des
// genres 4, 5, 6 et 8, qui portent en plus une image tirée de [0xD3B38]. Le parc vidé de ses visiteurs
// (mot +0x1F de sa fiche nul), toutes les bulles repartent.
//
// En haut à droite, « VISITEURS DANS LE PARC » (+0x1F du parc) et « PASSAGERS DANS LE BUS » (+0x47).
// En bas, sous « SIGNIFICATION DES PENSEES », deux colonnes titrées (tables 0xB7958 et 0xB79AD,
// 5 octets par ligne) sur un fond de la couleur que leur octet +4 choisit dans les six couleurs
// relevées au début — « NOURRITURE », « MAUVAISES PENSEES » — puis, pour chacune, jusqu'à trois
// lignes de détail à partir de 0xB14ED, chacune avec son image.
export function ecranDesPensees(jeu) {
  // Les six couleurs des fonds, relevées comme le fait l'original, avant tout dessin.
  const fonds = [octet(jeu, 0xD7769), octet(jeu, 0xD776E), octet(jeu, 0xD776A),
    octet(jeu, 0xD776D), octet(jeu, 0xD777E), octet(jeu, 0xD776C)];
  jeu.appeler(DEBUT_D_IMAGE);
  avecTampon(jeu, 0x80, (tampon) => {
    const parc = long(jeu, PARC_DU_JOUEUR);
    const couleur = couleurDuTexte(jeu);
    const cadre = jeu.appeler(ELEMENT, 0x99);
    const textes = long(jeu, TEXTES_DE_L_ECRAN);
    jeu.appeler(FORMATER, tampon, F_NOM_ET_NOMBRE, long(jeu, textes + 0xCC), motSigne(jeu, parc + 0x1F));
    jeu.appeler(ECRIRE, 0x132, 0x0E, tampon, 0, couleur);
    jeu.appeler(FORMATER, tampon, F_NOM_ET_NOMBRE, long(jeu, textes + 0xD0), octet(jeu, parc + 0x47));
    jeu.appeler(ECRIRE, 0x132, 0x1A, tampon, 0, couleur);
    dessinerLesPiedsDesBulles(jeu);
    animerLesBulles(jeu, cadre);
    if ((long(jeu, PAS_DE_SIMULATION) & 0xF) === 0xF) jeu.appeler(ANIMER_LES_PENSEES);
    ecrireLesDeuxTitres(jeu, tampon, fonds, couleur);
    ecrireLesDetails(jeu, couleur);
  });
  jeu.appeler(FIN_D_IMAGE);
}

const BULLES = 0xCC818, TAILLE_BULLE = 0xF, MOITIE_DES_BULLES = 0xCC944, FIN_DES_BULLES = 0xCCA70;
const SUITES = 0xB49F4, TAILLE_SUITE = 0x24;       // les suites d'images, par sorte de bulle
const TABLE_DES_IMAGES = 0xD3B38;                  // [+2 × figure] : le numéro d'image
const OBJETS_GRAPHIQUES = 0xD3B80;                 // [8 × image] : +5 bit 0, la dernière de la suite
const MORCEAUX = 0xD3B7C, DESSINS = 0xD3BB8;
const IMAGES = 0xD3B54;                            // +0x5B8, +0x5BE, +0x5C4 : les trois pieds de bulle
const DESSINER_BASSE = 0x5EC9C, DESSINER_HAUTE = 0x55BD4;   // (x, y, dessin)

// Le pied de la bulle, dessiné sous les vingt premières bulles quand elles attendent (phase 2) ou
// pensent (phase 4). Trois pieds selon le genre.
function dessinerLesPiedsDesBulles(jeu) {
  for (let b = BULLES; MOITIE_DES_BULLES > b; b += TAILLE_BULLE) {
    if (octet(jeu, b + 0xB) !== 2 && octet(jeu, b + 0xB) !== 4) continue;
    const genre = octet(jeu, b + 0xD);
    let pied;
    if (genre === 1) pied = long(jeu, IMAGES) + 0x5B8;
    else if (genre === 2) pied = long(jeu, IMAGES) + 0x5C4;
    else if (genre === 3) pied = long(jeu, IMAGES) + 0x5BE;
    else continue;
    const routine = (mot(jeu, MODE_AFFICHAGE) & 1) ? DESSINER_BASSE : DESSINER_HAUTE;
    jeu.appeler(routine, s16(mot(jeu, b) - 0x12), s16(mot(jeu, b + 2) - 0x16), pied);
  }
}

// L'image que porte la figure +0xA de la suite de la sorte +0xC.
function imageDeLaFigure(jeu, b) {
  const suite = mot(jeu, SUITES + TAILLE_SUITE * octet(jeu, b + 0xC));
  return mot(jeu, long(jeu, TABLE_DES_IMAGES) + 2 * ((suite + octet(jeu, b + 0xA)) & 0xFFFF));
}

function animerLesBulles(jeu, cadre) {
  // [ebp-0xC] de l'original : la figure tirée au sort. Seuls les genres 1, 2 et 3 atteignent la
  // phase 2 (les autres passent de 1 à 5 sans s'arrêter), si bien qu'elle est toujours posée avant
  // d'être lue ; l'original, lui, la laisserait telle que l'itération précédente l'a laissée.
  let figure = 0;
  for (let b = BULLES; FIN_DES_BULLES > b; b += TAILLE_BULLE) {
    const reste = octet(jeu, b + 0xE);
    poserOctet(jeu, b + 0xE, reste - 1);
    if (reste === 0) {
      // L'image suivante de la suite, et le délai que lui donne la phase.
      poserMot(jeu, b + 8, mot(jeu, long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, b + 8) + 6));
      const phase = octet(jeu, b + 0xB);
      if (phase >= 1 && phase <= 3) poserOctet(jeu, b + 0xE, 3);
      else if (phase === 4) poserOctet(jeu, b + 0xE, 2);
      else if (phase === 5) poserOctet(jeu, b + 0xE, 3);
    }
    const phase = octet(jeu, b + 0xB);
    if (phase === 1) {
      // Elle entre : huit pixels par image, jusqu'à son abscisse d'arrêt.
      if (octet(jeu, b + 0xA) === 1) {
        poserMot(jeu, b, mot(jeu, b) + 8);
        if (motSigne(jeu, b) < motSigne(jeu, b + 4)) { finirLaBulle(jeu, b, cadre); continue; }
      } else {
        poserMot(jeu, b, mot(jeu, b) - 8);
        if (motSigne(jeu, b) > motSigne(jeu, b + 4)) { finirLaBulle(jeu, b, cadre); continue; }
      }
      poserMot(jeu, b, mot(jeu, b + 4));
      poserOctet(jeu, b + 0xB, 2);
      poserOctet(jeu, b + 0xA, 2);
      poserMot(jeu, b + 8, imageDeLaFigure(jeu, b));
      const genre = octet(jeu, b + 0xD);
      if (genre === 3) poserOctet(jeu, b + 0xA, 0);
      else if (genre === 4 || genre === 5 || genre === 6 || genre === 8) poserOctet(jeu, b + 0xB, 5);
    } else if (phase === 2) {
      // Elle attend : une image sur 96 environ, une pensée part.
      if ((jeu.appeler(HASARD) & 0x5F) === 0x5F) {
        const genre = octet(jeu, b + 0xD);
        if (genre === 1) {
          const t = (jeu.appeler(HASARD) & 0xFFFF) % 3;
          if (t === 0) figure = 3; else if (t === 1) figure = 7; else if (t === 2) figure = 0xA;
        } else if (genre === 2) {
          const t = (jeu.appeler(HASARD) & 0xFFFF) % 2;
          if (t === 0) figure = 2; else if (t === 1) figure = 6;
        } else if (genre === 3) {
          const t = (jeu.appeler(HASARD) & 0xFFFF) % 2;
          if (t === 0) figure = 5; else if (t === 1) figure = 9;
        }
        poserOctet(jeu, b + 0xB, 4);
        poserOctet(jeu, b + 0xE, 0);
        const suite = mot(jeu, SUITES + TAILLE_SUITE * octet(jeu, b + 0xC) + 2 * (figure & 0xFFFF));
        poserMot(jeu, b + 8, mot(jeu, long(jeu, TABLE_DES_IMAGES) + 2 * suite));
      }
    } else if (phase === 3) {
      // Elle s'en va ; si le parc a des visiteurs, elle revient aussitôt (phase 1).
      if (mot(jeu, b) !== mot(jeu, b + 6)) {
        poserMot(jeu, b, motSigne(jeu, b) + (octet(jeu, b + 0xA) === 1 ? 8 : -8));
      }
      if (motSigne(jeu, long(jeu, PARC_DU_JOUEUR) + 0x1F) > 0) {
        poserOctet(jeu, b + 0xB, 1);
        poserOctet(jeu, b + 0xA, motSigne(jeu, b + 6) < 0 ? 1 : 3);
        poserMot(jeu, b + 8, imageDeLaFigure(jeu, b));
        poserOctet(jeu, b + 0xE, 0);
      }
    } else if (phase === 4) {
      // La pensée se joue ; sa dernière image passée, la bulle attend de nouveau.
      const graphique = long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, b + 8);
      if (octet(jeu, graphique + 5) & 1) {
        poserOctet(jeu, b + 0xA, octet(jeu, b + 0xD) === 3 ? 0 : 2);
        poserOctet(jeu, b + 0xB, 2);
        poserMot(jeu, b + 8, imageDeLaFigure(jeu, b));
      }
    } else if (phase === 5) {
      dessinerLImageDeLaBulle(jeu, b);
    }
    finirLaBulle(jeu, b, cadre);
  }
}

// Phase 5 : une image de plus, choisie sur le genre, posée au-dessus de la bulle.
function dessinerLImageDeLaBulle(jeu, b) {
  const table = long(jeu, TABLE_DES_IMAGES);
  const genre = octet(jeu, b + 0xD);
  let graphique;
  if (genre === 4) graphique = long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, table + 0x432);
  else if (genre === 5) graphique = long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, table + 0x434);
  else if (genre === 6) graphique = long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, table + 0x4E4);
  else if (genre === 8) graphique = long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, table + 0x430);
  else return;   // aucun autre genre n'atteint la phase 5 ; l'original relirait une variable morte
  const morceau = long(jeu, MORCEAUX) + 0xA * mot(jeu, graphique);
  const dessin = long(jeu, DESSINS) + mot(jeu, morceau);
  const bulle = long(jeu, OBJETS_GRAPHIQUES) + 8 * mot(jeu, b + 8);
  const y = s16(((mot(jeu, b + 2) - octet(jeu, bulle + 3)) - octet(jeu, dessin + 5)) + 4);
  const routine = (mot(jeu, MODE_AFFICHAGE) & 1) ? DESSINER_BASSE : DESSINER_HAUTE;
  jeu.appeler(routine, s16(mot(jeu, b) - 0x14), y, dessin);
}

// La fin d'une bulle : le parc vidé, elle s'en va ; puis elle est dessinée dans le cadre.
function finirLaBulle(jeu, b, cadre) {
  const phase = octet(jeu, b + 0xB);
  if (mot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x1F) === 0 && phase !== 4 && phase !== 3) {
    poserOctet(jeu, b + 0xB, 3);
    poserOctet(jeu, b + 0xA, motSigne(jeu, b) > motSigne(jeu, b + 6) ? 3 : 1);
    poserMot(jeu, b + 8, imageDeLaFigure(jeu, b));
  }
  jeu.appeler(DESSINER_OBJET, mot(jeu, b + 8),
    s16((mot(jeu, b) - mot(jeu, cadre + 1)) + 4), s16((mot(jeu, b + 2) - mot(jeu, cadre + 3)) + 4));
}

// Les deux titres du bas, chacun sur un fond de sa couleur.
function ecrireLesDeuxTitres(jeu, tampon, fonds, couleur) {
  for (const [decalage, table] of [[0x37, 0xB7958], [0x42, 0xB79AD]]) {
    const e = jeu.appeler(ELEMENT, 0x99) + decalage;
    const ligne = table + 5 * motSigne(jeu, 0xB14ED);
    if (mot(jeu, ligne) === 0) continue;
    jeu.appeler(RECTANGLE, s16(mot(jeu, e + 1) + 2), s16(mot(jeu, e + 3) + 2), 0x12, 0x0E,
      fonds[octet(jeu, ligne + 4)] | 0);   // au-dela de 5, l original lirait la pile sous le tableau
    jeu.appeler(FORMATER, tampon, F_CHAINE,
      long(jeu, long(jeu, TEXTES_DES_PENSEES) + 4 * octet(jeu, ligne + 4)));
    jeu.appeler(ECRIRE_CENTRE, elementX0(jeu, e), elementX1(jeu, e), s16(mot(jeu, e + 3) + 4),
      tampon, 1, couleur);
  }
}

// Sous chaque titre, jusqu'à trois lignes de détail, chacune avec son image.
function ecrireLesDetails(jeu, couleur) {
  for (const cas of [8, 0xB]) {
    let e = jeu.appeler(ELEMENT, 0x99) + 0xB * cas;
    let ligne;
    if (cas === 8) {
      if (octetSigne(jeu, 0xB14EF) < motSigne(jeu, 0xB14ED)) continue;
      ligne = 0xB7958 + 5 * motSigne(jeu, 0xB14ED);
    } else {
      if (octetSigne(jeu, 0xB14F0) < motSigne(jeu, 0xB14ED)) continue;
      ligne = 0xB79AD + 5 * motSigne(jeu, 0xB14ED);
    }
    for (let k = mot(jeu, 0xB14ED); k <= motSigne(jeu, 0xB14ED) + 2; k = (k + 1) & 0xFFFF, ligne += 5) {
      if (mot(jeu, ligne) === 0) break;
      const graphique = long(jeu, OBJETS_GRAPHIQUES)
        + 8 * mot(jeu, long(jeu, TABLE_DES_IMAGES) + 2 * mot(jeu, ligne));
      const morceau = long(jeu, MORCEAUX) + 0xA * mot(jeu, graphique);
      const dessin = long(jeu, DESSINS) + mot(jeu, morceau);
      jeu.appeler(DESSINER_IMAGE, mot(jeu, e + 1), mot(jeu, e + 3), dessin, 0);
      jeu.appeler(TEXTE_DANS_UN_CADRE, (mot(jeu, e + 1) + 0x32) & 0xFFFF, mot(jeu, e + 3),
        mot(jeu, e + 5), mot(jeu, e + 7),
        long(jeu, long(jeu, TEXTES_DES_PENSEES) + 4 * mot(jeu, ligne + 2)), couleur, 0);
      e += 0xB;
    }
  }
}

// =====================================================================================================
// 0x370EC — les écrans d'achat : attractions (0x36), boutiques et jeux d'adresse (0x3A), personnel
// (0x3C), décors et installations (0x3E).
//
// 0x360C5, à l'ouverture de la fenêtre, a dressé en 0xCE9D8 la liste des articles que le joueur peut
// voir, et marqué (octet +0xB) ceux dont le prix dépasse ce qu'il a. L'écran montre cinq cases, celle
// du milieu portant l'article choisi (0xD7787) : un article hors de prix reçoit un fond plein.
//
// Sous le nom viennent les chiffres de l'article, qui diffèrent d'un catalogue à l'autre :
//   attraction : « CAPACITE », l'appréciation tirée de son octet +0xA9 divisé par 10, « FIABILITE »,
//                celle tirée de sa fiche de référence (0xB16F8 : durée × seuil d'usure / 16384,
//                plafonnée au dixième mot de la table), sa capacité (+0xA6) et son prix (+0xA2) ;
//   boutique   : le nom de l'article vendu, son prix d'achat (la marchandise de 0xD3C00 si elle en a
//                une, sinon son coût +0x4D) et son prix de vente (+0x4F) ; un jeu d'adresse montre à
//                la place son appréciation (+0x69), le lot (+0x4D) et le prix de la partie (+0x4F) ;
//   personnel  : un point d'interrogation, puis le salaire d'embauche (+0x24 du métier) ;
//   décor      : seulement son prix.
// À droite, la description de l'article, dans un cadre.
export function ecranDAchat(jeu) {
  jeu.appeler(DEBUT_D_IMAGE);
  avecTampon(jeu, 0x80, (tampon) => {
    const couleur = couleurDuTexte(jeu);
    // Les cinq cases : deux articles avant celui qu'on a choisi, deux après.
    let e = jeu.appeler(ELEMENT, 0x83);
    for (let k = s8(octet(jeu, ARTICLE_CHOISI) - 2);
      k <= octetSigne(jeu, ARTICLE_CHOISI) + 2; k = s8(k + 1), e += 0xB) {
      if (k < 0 || k > octetSigne(jeu, NOMBRE_D_ARTICLES) - 1) continue;
      const a = CATALOGUE + TAILLE_ARTICLE * k;
      if (octet(jeu, a + 0xB) & 1) {
        jeu.appeler(RECTANGLE, s16(mot(jeu, e + 1) + 8), s16(mot(jeu, e + 3) + 8),
          s16((mot(jeu, e + 5) - 8) - (mot(jeu, e + 1) + 8)),
          s16((mot(jeu, e + 7) - 8) - (mot(jeu, e + 3) + 8)), octet(jeu, COULEUR_TROP_CHER));
      }
      jeu.appeler(IMAGE_DANS_UN_CADRE, s16(mot(jeu, e + 1) + 8), s16(mot(jeu, e + 3) + 8),
        s16(mot(jeu, e + 5) - 8), s16(mot(jeu, e + 7) - 8), mot(jeu, a + 2));
    }
    // Le nom de l'article choisi, sous les cinq cases ; une attraction y ajoute sa note en dixièmes.
    const choisi = octetSigne(jeu, ARTICLE_CHOISI);
    const a = CATALOGUE + TAILLE_ARTICLE * choisi;
    const nom = long(jeu, long(jeu, TEXTES_DES_NOMS) + 4 * mot(jeu, a));
    if (mot(jeu, ECRAN) === 0x36) {
      const note = octet(jeu, GENRES_D_ATTRACTION + TAILLE_GENRE * octet(jeu, a + 0xA) + 0xC6);
      jeu.appeler(FORMATER, tampon, F_NOM_ET_DECIMAL, nom, idiv(note, 10), note % 10);
    } else {
      jeu.appeler(FORMATER, tampon, F_CHAINE, nom);
    }
    jeu.appeler(ECRIRE_CENTRE, elementX0(jeu, e), elementX1(jeu, e), s16(mot(jeu, e + 3) + 6),
      tampon, 0, couleur);

    e = jeu.appeler(ELEMENT, 0x98);
    const ecran = mot(jeu, ECRAN);
    if (ecran === 0x36) e = acheterUneAttraction(jeu, tampon, a, e, couleur);
    else if (ecran === 0x3A) e = acheterUneBoutique(jeu, tampon, a, e, couleur);
    else if (ecran === 0x3C) e = embaucherUnEmploye(jeu, tampon, a, e, couleur);
    else if (ecran === 0x3E) e = acheterUnDecor(jeu, tampon, a, e, couleur);
  });
  jeu.appeler(FIN_D_IMAGE);
}

// La description de l'article, écrite dans le cadre de l'élément 0x80.
function cadreDeTexte(jeu, texte, couleur) {
  const e = jeu.appeler(ELEMENT, 0x80);
  jeu.appeler(TEXTE_DANS_UN_CADRE, (mot(jeu, e + 1) + 0x10) & 0xFFFF, (mot(jeu, e + 3) + 4) & 0xFFFF,
    (mot(jeu, e + 5) - 0x10) & 0xFFFF, (mot(jeu, e + 7) - 8) & 0xFFFF, texte, couleur, 0);
}

// L'appréciation tirée de la fiche de référence du genre (0xB16F8) : durée × seuil d'usure / 16384,
// le mot 0xB17A4 étant la durée et l'octet 0xB17A0 le seuil. Une durée nulle donne le mot +0x20 de la
// table, une appréciation au-dessus de 9 le mot +0x24, sinon le mot de rang de l'appréciation.
function appreciationDeReference(jeu, tampon, genre) {
  const reference = 0xB17A0 + (genre - GENRES_D_ATTRACTION);
  const textes = long(jeu, TEXTES_COURTS);
  if (mot(jeu, reference + 4) === 0) {
    jeu.appeler(FORMATER, tampon, F_CHAINE, long(jeu, textes + 0x20));
    return;
  }
  const note = idiv(Math.imul(mot(jeu, reference + 4), octet(jeu, reference)), 0x4000);
  jeu.appeler(FORMATER, tampon, F_CHAINE, long(jeu, textes + (note > 9 ? 0x24 : 4 * note)));
}

function acheterUneAttraction(jeu, tampon, a, e, couleur) {
  const genre = GENRES_D_ATTRACTION + TAILLE_GENRE * octet(jeu, a + 0xA);
  jeu.appeler(FORMATER, tampon, F_CHAINE,
    long(jeu, long(jeu, TEXTES_COURTS) + 4 * idiv(octet(jeu, genre + 0xA9), 10)));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  appreciationDeReference(jeu, tampon, genre);
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, motSigne(jeu, genre + 0xA6));   // la capacité
  ecrireDansLElement(jeu, e, tampon);
  e += 0x16;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, longSigne(jeu, genre + 0xA2));  // le prix
  ecrireDansLElement(jeu, e, tampon);
  cadreDeTexte(jeu, long(jeu, long(jeu, TEXTES_DES_DECORS) + 4 * octet(jeu, genre + 0xC4)), couleur);
  return e;
}

function acheterUneBoutique(jeu, tampon, a, e, couleur) {
  const b = FICHES_DE_BOUTIQUE + TAILLE_BOUTIQUE * octet(jeu, a + 0xA);
  const noms = long(jeu, TEXTES_DES_NOMS);
  const x = 0x16;
  let y = 0x100;
  const intitule = (decalage, dy) => {
    y += dy;
    jeu.appeler(FORMATER, tampon, F_CHAINE, long(jeu, noms + decalage));
    jeu.appeler(ECRIRE, s16(x), s16(y), tampon, 0, couleur);
  };
  if (octet(jeu, b + 0x24) === 8) {
    // Un jeu d'adresse : l'appréciation, le lot, puis le prix de la partie.
    intitule(0x458, 0);
    jeu.appeler(FORMATER, tampon, F_CHAINE,
      long(jeu, long(jeu, TEXTES_COURTS) + 4 * idiv(octet(jeu, b + 0x69), 10)));
    ecrireDansLElement(jeu, e, tampon);
    e += 0xB;
    intitule(0x464, 0x14);
    jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, b + 0x4D));
    ecrireDansLElement(jeu, e, tampon);
    e += 0xB;
    intitule(0x468, 0x14);
    jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, b + 0x4F));
    ecrireDansLElement(jeu, e, tampon);
    e += 0x16;
  } else {
    // Une boutique : ce qu'elle vend, son prix d'achat, son prix de vente.
    intitule(0x1E0, 0);
    jeu.appeler(FORMATER, tampon, long(jeu, noms + 4 * mot(jeu, b + 0x53)));
    ecrireDansLElement(jeu, e, tampon);
    e += 0xB;
    intitule(0x1D8, 0x14);
    const reserve = octetSigne(jeu, b + 0x67);
    if (reserve !== -1) jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, MARCHANDISES + 0xE * reserve + 2));
    else jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, b + 0x4D));
    ecrireDansLElement(jeu, e, tampon);
    e += 0xB;
    intitule(0x1DC, 0x14);
    jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, b + 0x4F));
    ecrireDansLElement(jeu, e, tampon);
    e += 0x16;
  }
  intitule(0x3C4, 0x28);
  jeu.appeler(FORMATER, tampon, F_NOMBRE, longSigne(jeu, a + 4));   // le prix de la boutique
  ecrireDansLElement(jeu, e, tampon);
  cadreDeTexte(jeu, long(jeu, long(jeu, TEXTES_DES_BOUTIQUES) + 4 * octet(jeu, b + 0x6A)), couleur);
  return e;
}

function embaucherUnEmploye(jeu, tampon, a, e, couleur) {
  const metier = METIERS + TAILLE_METIER * octet(jeu, a + 0xA);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_INCONNU);              // « ? » : rien à dire sur un employé
  ecrireDansLElement(jeu, e, tampon);
  e += 0x16;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, metier + 0x24));   // le salaire d'embauche
  ecrireDansLElement(jeu, e, tampon);
  cadreDeTexte(jeu, long(jeu, long(jeu, TEXTES_DES_METIERS) + 4 * octet(jeu, metier + 0x32)), couleur);
  return e;
}

function acheterUnDecor(jeu, tampon, a, e, couleur) {
  const decor = INSTALLATIONS + TAILLE_INSTALLATION * octet(jeu, a + 0xA);
  e += 0x2C;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, longSigne(jeu, a + 4));     // le prix
  ecrireDansLElement(jeu, e, tampon);
  cadreDeTexte(jeu, long(jeu, long(jeu, TEXTES_DES_ARTICLES) + 4 * octet(jeu, decor + 0x36)), couleur);
  return e;
}

// =====================================================================================================
// 0x3854C — la fiche de l'objet choisi (0xD6678) : visiteur, employé, boutique, jeu d'adresse,
// attraction, installation.
//
// Sans objet choisi, l'écran se referme aussitôt. Sinon chaque genre d'écran écrit ses chiffres dans
// les éléments de la colonne 0x98, puis vient la case du nom : cliquer dedans (sauf sur la fiche d'un
// visiteur) recopie le nom dans 0xD77A8 et ouvre la saisie. **Le nom appartient au catalogue, pas à
// l'objet** : renommer un employé renomme son métier, une boutique sa fiche, une attraction son
// genre ; tous ceux du même genre changent de nom d'un coup.
//
// La saisie est une boucle à part, qui tourne hors de la boucle du parc : elle sert l'hôte (0x1107F),
// appelle 0x793B1 et présente l'image elle-même, jusqu'à ce que 0x793B1 rende autre chose que 0. Il
// rend 1 quand le nom est validé, et c'est alors qu'il est recopié dans le catalogue ; pour toute
// autre valeur non nulle, la saisie est close mais la boucle repart — l'anomalie est celle de 1994.
export function ecranDeFiche(jeu) {
  jeu.appeler(DEBUT_D_IMAGE);
  avecTampon(jeu, 0x80, (tampon) => {
    if (mot(jeu, OBJET_CHOISI) === 0) {
      poserMot(jeu, ECRAN, 0);
      jeu.appeler(FERMER_LA_FENETRE);
      return;
    }
    const objet = long(jeu, OBJETS) + TAILLE_OBJET * mot(jeu, OBJET_CHOISI);
    const ecran = mot(jeu, ECRAN);
    let aRenommer = 0;
    if (ecran === 0x42) ficheDUnVisiteur(jeu, tampon, objet);
    else if (ecran === 0x1C) aRenommer = ficheDUnEmploye(jeu, tampon, objet);
    else if (ecran === 0x16) aRenommer = ficheDUneBoutique(jeu, tampon, objet);
    else if (ecran === 0x23) aRenommer = ficheDUnJeuDAdresse(jeu, tampon, objet);
    else if (ecran === 0x14) aRenommer = ficheDUneAttraction(jeu, tampon, objet);
    else if (ecran === 0x60) aRenommer = ficheDUneInstallation(jeu, tampon, objet);
    laCaseDuNom(jeu, tampon, aRenommer);
    jeu.appeler(FIN_D_IMAGE);
    if (mot(jeu, SAISIE_DU_NOM) !== 0) saisirLeNom(jeu, objet);
  });
}

// 0x385EE — la fiche d'un visiteur (0x42) : depuis quand il est là, son argent, son humeur et le
// temps qu'il a passé dans le parc ; puis son nom, que la case du nom montrera sans permettre de le
// changer. Un visiteur parti (état +0xC = 0x1C) referme l'écran et rend l'outil d'avant.
function ficheDUnVisiteur(jeu, tampon, objet) {
  let e = jeu.appeler(ELEMENT, 0xA1);
  const textes = long(jeu, TEXTES_DU_VISITEUR);
  const anciennete = (long(jeu, PAS_DE_SIMULATION) - long(jeu, objet + 0x5B)) >>> 0;
  if (anciennete >= 0x2EE0) jeu.appeler(FORMATER, tampon, F_CHAINE, long(jeu, textes + 0x2C));
  else jeu.appeler(FORMATER, tampon, F_CHAINE, long(jeu, textes + 4 * Math.floor(anciennete / 1000)));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, octet(jeu, objet + 0x81));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  // L'humeur : son contentement (+0x54) comparé aux deux seuils du parc (+0 et +2), dix degrés.
  const parc = long(jeu, PARC_DU_JOUEUR);
  const humeur = motSigne(jeu, objet + 0x54);
  const haut = motSigne(jeu, parc), bas = motSigne(jeu, parc + 2);
  let degre;
  if (humeur > haut + 1000) degre = 0x30;
  else if (humeur > haut + 500) degre = 0x34;
  else if (humeur > haut + 200) degre = 0x38;
  else if (humeur > haut) degre = 0x3C;
  else if (humeur > haut - 50) degre = 0x40;
  else if (humeur > bas + 50) degre = 0x44;
  else if (humeur > bas - 50) degre = 0x48;
  else if (humeur > bas - 200) degre = 0x4C;
  else if (humeur > bas - 500) degre = 0x50;
  else degre = 0x54;
  jeu.appeler(FORMATER, tampon, F_CHAINE, long(jeu, textes + degre));
  ecrireDansLElement(jeu, e, tampon);
  e += 0x16;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, objet + 0x6F));
  ecrireDansLElement(jeu, e, tampon);
  jeu.appeler(ELEMENT, 0x89);       // l'élément obtenu n'est pas relu : la case du nom le refait
  jeu.appeler(FORMATER, tampon,
    long(jeu, long(jeu, TEXTES_DES_NOMS) + 4 * octet(jeu, objet + 0x59) + 0x168));
  if (octet(jeu, objet + 0x0C) === 0x1C) {
    poserMot(jeu, OBJET_CHOISI, 0);
    poserMot(jeu, 0xD6670, mot(jeu, 0xD6626));    // l'outil qu'on avait en main revient
    poserMot(jeu, ECRAN, 0);
    poserMot(jeu, 0xD666E, 1);                    // la vue du parc à redessiner
  }
}

// 0x38A0E — la fiche d'un employé (0x1C). En jeu : la jauge « TEMPS DE TRAVAIL », « MOIS DE TRAVAIL »
// et « SALAIRE MENSUEL » ; selon le métier s'y ajoutent, pour un amuseur, son nombre d'amusements
// (+0x5A) et sa patience (+0x42), pour un mécanicien l'attraction où on l'appelle (+0x2A). La jauge
// rapporte son champ +0x34 au temps de service, plafonné à 0x55 : c'est la part du temps qu'il passe
// à travailler. Une durée nulle est remplacée par 2 : le programme évite ainsi la division par zéro
// au pas même de l'embauche.
function ficheDUnEmploye(jeu, tampon, objet) {
  let duree = (mot(jeu, PAS_DE_SIMULATION) - mot(jeu, objet + 0x3E)) & 0xFFFF;
  if (duree === 0) duree = 2;
  let e = jeu.appeler(ELEMENT, 0x98);
  jeu.appeler(FORMATER, tampon, F_NOMBRE, idiv(duree, 1000));
  ecrireDansLElement(jeu, e, tampon);
  e += 0x2C;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, objet + 0x9A));    // son salaire
  ecrireDansLElement(jeu, e, tampon);
  e -= 0x21;
  const metier = METIERS + TAILLE_METIER * octet(jeu, objet + 0x59);
  const sorte = mot(jeu, metier + 0x2C);
  if (sorte === 2) {            // un amuseur : « VISITEURS DIVERTIS » et « VISITEURS SATISFAITS »
    jeu.appeler(FORMATER, tampon, F_NOMBRE, octet(jeu, objet + 0x5A));
    ecrireDansLElement(jeu, e, tampon);
    e += 0xB;
    jeu.appeler(FORMATER, tampon, F_NOMBRE, motSigne(jeu, objet + 0x42));
    ecrireDansLElement(jeu, e, tampon);
  } else if (sorte === 8) {     // un mécanicien
    jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, objet + 0x2A));
    ecrireDansLElement(jeu, e, tampon);
  }
  const jauge = jeu.appeler(ELEMENT, 0x8A) + 0x21;
  let valeur = idiv(motSigne(jeu, objet + 0x34), duree);
  if ((valeur & 0xFFFF) > 0x55) valeur = 0x55;
  let largeur = Math.imul(valeur,
    (2 * octet(jeu, 0xD778A) + (mot(jeu, jauge + 5) - mot(jeu, jauge + 1))) & 0xFFFF) & 0xFFFF;
  if (largeur > 0xAC) largeur = 0xAC;
  jeu.appeler(RECTANGLE, 0x22, 0xE2, s16(largeur), 6, 0xDE);
  jeu.appeler(FORMATER, tampon, F_CHAINE, metier);   // le nom du métier, dans la case du nom
  return metier;
}

// 0x38CDD — la fiche d'une boutique (0x16). En jeu : « TYPE DE MARCHANDISES », « NOMBRE DE CLIENTS »,
// « PRIX D'ACHAT 9 AT 123 » (la marchandise de 0xD3C00 : sa quantité +4 et son prix +2) ou, sans
// marchandise, le coût +0x4D ; « PRIX DE VENTE » (+0x4F) ; et, quand elle dose un ingrédient
// (+0x5E différent de 6), « QUANTITE DE EAU : MOYENNE », la dose +0x5F.
function ficheDUneBoutique(jeu, tampon, objet) {
  const b = FICHES_DE_BOUTIQUE + mot(jeu, objet + 0x16);
  let e = jeu.appeler(ELEMENT, 0x98);
  jeu.appeler(FORMATER, tampon, long(jeu, long(jeu, TEXTES_DES_NOMS) + 4 * mot(jeu, b + 0x53)));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, motSigne(jeu, objet + 0x14));   // ses ventes
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  const reserve = s16(octetSigne(jeu, b + 0x67));
  if (reserve !== -1) {
    jeu.appeler(FORMATER, tampon, F_A, mot(jeu, MARCHANDISES + 0xE * reserve + 4),
      mot(jeu, MARCHANDISES + 0xE * reserve + 2));
  } else {
    jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, b + 0x4D));
  }
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, b + 0x4F));
  ecrireDansLElement(jeu, e, tampon);
  if (octet(jeu, b + 0x5E) !== 6) {
    jeu.appeler(FORMATER, tampon,
      long(jeu, long(jeu, TEXTES_DES_NOMS) + 4 * octet(jeu, b + 0x5F) + 0x474));
    e += 0xB;
    ecrireDansLElement(jeu, e, tampon);
  }
  jeu.appeler(FORMATER, tampon, F_CHAINE, b);
  return b;
}

// 0x38F31 — la fiche d'un jeu d'adresse (0x23). En jeu : « DEPENDANCE » (l'appréciation tirée de
// l'octet +0x69 de sa fiche divisé par 10), « GAINS/JOUEURS 0/0 » (+0x94 et +0x14 de l'objet),
// « CHANCES DE GAGNER 25% » (+0x5D), « RECOMPENSE » (+0x4D) et « PRIX PAR JEU » (+0x4F).
function ficheDUnJeuDAdresse(jeu, tampon, objet) {
  const b = FICHES_DE_BOUTIQUE + mot(jeu, objet + 0x16);
  let e = jeu.appeler(ELEMENT, 0x98);
  jeu.appeler(FORMATER, tampon, F_CHAINE,
    long(jeu, long(jeu, TEXTES_COURTS) + 4 * idiv(octet(jeu, b + 0x69), 10)));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_SUR, mot(jeu, objet + 0x94), motSigne(jeu, objet + 0x14));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_POUR_CENT, octet(jeu, b + 0x5D));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, b + 0x4D));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, b + 0x4F));
  ecrireDansLElement(jeu, e, tampon);
  jeu.appeler(FORMATER, tampon, F_CHAINE, b);
  return b;
}

// 0x39144 — la fiche d'une attraction (0x14) : son prix de construction, les visiteurs servis, ses
// deux appréciations, puis sa capacité réglée sur celle de son genre. En jeu : « PRIX DE
// L'ATTRACTION », « NOMBRE DE VISITEURS », « CAPACITE », « FIABILITE », « CAPACITE MAXIMUM 5(5) ».
// La case du nom y porte le nom du genre suivi de sa note en dixièmes.
function ficheDUneAttraction(jeu, tampon, objet) {
  const genre = GENRES_D_ATTRACTION + mot(jeu, objet + 0x16);
  let e = jeu.appeler(ELEMENT, 0x98);
  jeu.appeler(FORMATER, tampon, F_NOMBRE, longSigne(jeu, genre + 0xA2));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, objet + 0x3C));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_CHAINE,
    long(jeu, long(jeu, TEXTES_COURTS) + 4 * idiv(octet(jeu, genre + 0xA9), 10)));
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  appreciationDeReference(jeu, tampon, genre);
  ecrireDansLElement(jeu, e, tampon);
  e += 0xB;
  jeu.appeler(FORMATER, tampon, F_ENTRE_PARENTHESES, mot(jeu, objet + 0x26), motSigne(jeu, genre + 0xA6));
  ecrireDansLElement(jeu, e, tampon);
  const note = octet(jeu, genre + 0xC6);
  jeu.appeler(FORMATER, tampon, F_DEUX_NOMBRES, genre, idiv(note, 10), note % 10);
  return genre;
}

// 0x39506 — la fiche d'une installation (0x60) : le nombre de fois qu'elle a servi.
function ficheDUneInstallation(jeu, tampon, objet) {
  const installation = INSTALLATIONS + TAILLE_INSTALLATION * mot(jeu, objet + 0x16);
  const e = jeu.appeler(ELEMENT, 0x98);
  jeu.appeler(FORMATER, tampon, F_NOMBRE, mot(jeu, objet + 0x3C));
  ecrireDansLElement(jeu, e, tampon);
  jeu.appeler(FORMATER, tampon, F_CHAINE, installation);
  return installation;
}

// 0x39598 — la case du nom, en bas de la fiche : le texte que la fiche vient de composer, centré,
// avec le curseur de saisie. Un clic dedans (bouton gauche enfoncé) ouvre la saisie : le nom de la
// fiche du catalogue est recopié dans 0xD77A8 et 0xD77CC est levé. Les fiches de visiteur en sont
// exemptées.
function laCaseDuNom(jeu, tampon, aRenommer) {
  const e = jeu.appeler(ELEMENT, 0x9A) + 0x37;
  if (mot(jeu, ECRAN) !== 0x42 && mot(jeu, GAUCHE_ENFONCE) !== 0
    && motSigne(jeu, SOURIS_X) >= motSigne(jeu, e + 1) && motSigne(jeu, SOURIS_X) < motSigne(jeu, e + 5)
    && motSigne(jeu, SOURIS_Y) >= motSigne(jeu, e + 3) && motSigne(jeu, SOURIS_Y) < motSigne(jeu, e + 7)) {
    rendreLesBoutons(jeu);
    jeu.appeler(COPIER_CHAINE, NOM_TAPE, aRenommer);
    poserMot(jeu, SAISIE_DU_NOM, 1);
  }
  const bord = motSigne(jeu, e + 1) + motSigne(jeu, e + 5);
  const largeur = s16(jeu.appeler(LARGEUR_DU_TEXTE, tampon));
  jeu.appeler(ECRIRE_AVEC_CURSEUR, s16(idiv(bord - largeur, 2)), s16(mot(jeu, e + 3) + 0xA), tampon, 0, 0);
}

// 0x396C3 — la saisie d'un nom : une boucle à part, qui présente l'image elle-même.
function saisirLeNom(jeu, objet) {
  let redessiner = 0;
  for (;;) {
    redessiner = octet(jeu, 0xB150F);
    jeu.appeler(SERVIR_L_HOTE);
    const reponse = jeu.appeler(TAPER_UN_NOM,
      long(jeu, long(jeu, TEXTES_DE_L_ECRAN) + 0xD4), NOM_TAPE) & 0xFFFF;
    if (reponse !== 0) {
      poserMot(jeu, SAISIE_DU_NOM, 0);
      if (reponse === 1) {
        // Le nom validé revient dans la fiche du catalogue, jamais dans l'objet.
        const ecran = mot(jeu, ECRAN);
        if (ecran === 0x1C) {
          jeu.appeler(COPIER_CHAINE, METIERS + TAILLE_METIER * octet(jeu, objet + 0x59), NOM_TAPE);
        } else if (ecran === 0x16 || ecran === 0x23) {
          jeu.appeler(COPIER_CHAINE, FICHES_DE_BOUTIQUE + mot(jeu, objet + 0x16), NOM_TAPE);
        } else if (ecran === 0x14) {
          jeu.appeler(COPIER_CHAINE, GENRES_D_ATTRACTION + mot(jeu, objet + 0x16), NOM_TAPE);
        } else if (ecran === 0x60) {
          jeu.appeler(COPIER_CHAINE,
            INSTALLATIONS + TAILLE_INSTALLATION * mot(jeu, objet + 0x16), NOM_TAPE);
        }
        break;
      }
    }
    presenterLImagePendantLaSaisie(jeu);
  }
  if (redessiner !== 0) jeu.appeler(AVANT_LA_FENETRE);
}

// La surface de dessin part vers l'écran : tout d'un coup en basse résolution, par cinq banques de
// 64 Ko en haute, le pointeur posé puis retiré autour de la copie.
function presenterLImagePendantLaSaisie(jeu) {
  jeu.appeler(POSER_LE_CURSEUR);
  if (mot(jeu, MODE_AFFICHAGE) & 1) {
    copierMotsLongs(jeu, long(jeu, SURFACE), MEMOIRE_VIDEO, 0x3E80);
  } else {
    let source = long(jeu, SURFACE);
    for (let banque = 0; banque < 5; banque++) {
      jeu.appeler(CHOISIR_BANQUE, banque);
      const motsLongs = banque === 4 ? 0x2C00 : 0x4000;
      copierMotsLongs(jeu, source, MEMOIRE_VIDEO, motsLongs);
      source = (source + 4 * motsLongs) >>> 0;
    }
  }
  jeu.appeler(RETIRER_LE_CURSEUR);
}

// `rep movsd` : n mots longs, du premier au dernier.
function copierMotsLongs(jeu, source, destination, n) {
  const octets = n * 4;
  if (octets <= 0) return;
  if (destination <= source || destination >= source + octets) {
    jeu.m8.copyWithin(destination, source, source + octets);
    return;
  }
  for (let k = 0; k < octets; k += 4) jeu.dv.setUint32(destination + k, jeu.dv.getUint32(source + k, true), true);
}

// =====================================================================================================
// Toutes prouvées par comparer.mjs (0 divergence, aucune jamais appelée sur l'ensemble des scénarios)
// et verifier.mjs (IDENTIQUE, avec et sans --empoisonner) : construction.json exerce les quatre écrans
// d'achat, les pensées, les finances et les fiches d'un employé, d'une attraction et d'une boutique,
// en basse résolution ; ecrans.json exerce les trois listes, en haute résolution.
//
// Ce que les scénarios du dépôt n'exercent pas : les listes en basse résolution, la case du nom et la
// saisie d'un nom, la fiche d'un jeu d'adresse (0x23) et celle d'un amuseur. Ces chemins sont prouvés
// par un scénario composé à part (70 s : le parc de la démonstration, la fiche des manèges renommée,
// celles d'un amuseur et d'un jeu d'adresse, puis la liste des boutiques en 320x200).
//
// Restent sans preuve, faute d'un état qui les produise : la fiche d'un visiteur (0x42) et celle d'une
// installation (0x60), qu'aucun clic n'a su atteindre ; la fiche d'un mécanicien (le seul métier de
// sorte 8) ; l'achat d'un jeu d'adresse (fenêtre 0x14) ; une boutique sans marchandise en réserve ;
// et le genre d'écran 0x58, qu'aucune fenêtre de la table n'ouvre.
//
// `memoire: 'entiere'` : les écrans passent, par 0x3D8B8, par 0x3B011, qui laisse les entrées aller à
// l'écran du parc (0x145FB) et écrit donc dans le tas ; le dessin d'un objet (0x209B5) et le
// remplissage d'une fenêtre (0x3CC79) peuvent y écrire aussi. La comparaison appel par appel doit
// donc tout restaurer, tas compris, entre les deux exécutions.
export const reecritures = [
  { adresse: 0x3B011, nom: 'traiterLesBoutonsDeLaFenetre', fn: traiterLesBoutonsDeLaFenetre, arguments: 0, memoire: 'entiere' },
  { adresse: 0x3B3B8, nom: 'commencerLImageDeLEcran', fn: commencerLImageDeLEcran, arguments: 0, memoire: 'entiere' },
  { adresse: 0x3D8B8, nom: 'finirLImageDeLEcran', fn: finirLImageDeLEcran, arguments: 0, memoire: 'entiere' },
  { adresse: 0x3A569, nom: 'ecranDesFinances', fn: ecranDesFinances, arguments: 0, memoire: 'entiere' },
  { adresse: 0x37E6D, nom: 'ecranDeListe', fn: ecranDeListe, arguments: 0, memoire: 'entiere' },
  { adresse: 0x398DF, nom: 'ecranDesPensees', fn: ecranDesPensees, arguments: 0, memoire: 'entiere' },
  { adresse: 0x370EC, nom: 'ecranDAchat', fn: ecranDAchat, arguments: 0, memoire: 'entiere' },
  { adresse: 0x3854C, nom: 'ecranDeFiche', fn: ecranDeFiche, arguments: 0, memoire: 'entiere' },
];

export const enAttente = [];
