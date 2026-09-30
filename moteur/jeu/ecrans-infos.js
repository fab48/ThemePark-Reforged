// Le tutoriel du premier parc, la minuterie du jeu, et quelques routines de l'écran.
//
// Réécriture lisible des fonctions 0x59C85, 0x59C06, 0x5CAD0, 0x5CA82, 0x55EFA, 0x55FCF, 0x55B86,
// 0x54CE4 et 0x53E6E du jeu d'origine. Voir docs/guide-reecriture.md.
//
// Le nom du fichier vient du découpage du chantier ; son sujet réel est surtout le tutoriel. Neuf
// fonctions éparses, en quatre familles :
//
// LE TUTORIEL — 0x59C85 et 0x59C06. Un joueur qui répond NON à « DEJA JOUE? » sur sa fiche
// (0xD66F7, titre.js) commence avec l'octet 0xBA0F8 à 0 : c'est le numéro de l'étape d'un tutoriel
// que le conseiller mène dans la barre des messages. Tant que l'octet est positif ou nul, la barre
// (0x5CBDB, panneau.js) ne cherche pas de remarque et appelle 0x59C85 à chaque image, qui fait
// clignoter le bouton à presser, marque au sol la case où construire, et passe à l'étape suivante
// quand le joueur a fait ce qu'on lui demandait. Le détail est avant `etapeDuTutoriel`.
//
// LA MINUTERIE — 0x5CAD0 et 0x5CA82. Le lancement (0x104A3) installe le gestionnaire 0x5CA82 sur
// l'interruption 8 et programme le circuit de la minuterie pour qu'elle batte quatre fois plus
// vite que les 18,2 Hz du BIOS (diviseur 16 384, 72,83 Hz, § 6.6 de la rétro-ingénierie) ; le
// gestionnaire compte les tics en 0xB14B5 et rend la main au BIOS une fois sur quatre, qui garde
// ainsi son heure. Avec une carte son, la bibliothèque SOS a sa propre minuterie : on s'y abonne
// (0x822F4) avec 0x5CA6B, qui ne fait que compter.
//
// L'ÉCRAN — 0x55EFA, 0x55FCF, 0x55B86 et 0x54CE4, qui complètent presentation.js et ecran.js :
// agrandir en 640x480 une image faite en 320x200, effacer l'écran, remplir un rectangle en
// marquant ses blocs, vider la grille des blocs à présenter.
//
// LA RECHERCHE — 0x53E6E, l'animation d'une des sept molettes de l'écran de la recherche (0x51780).

import { ecran } from './grande-vue.js';

// --- arithmétique de 1994 -----------------------------------------------------------------------
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const s8 = (v) => (v << 24) >> 24;
// `idiv` : division entière tronquée vers zéro.
const idiv = (a, b) => (a / b) | 0;

const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// --- les variables du jeu -----------------------------------------------------------------------
const MODE_VIDEO = 0xDE5F6;              // mot : bit 0 levé en 320x200 ; 8 en 640x480
const EN_640X480 = 8;
const PAS_DE_SIMULATION = 0xD3AFC;       // mot long : les pas depuis le début de la partie
const GAUCHE_ENFONCE = 0xDE5AC;          // mot : le bouton gauche est tenu
const OUTIL = 0xD6670;                   // mot : l'outil en main
const PREMIERE_FENETRE = 0xB14B9;        // mot : la première fenêtre de la liste (−1 : aucune)
const REDESSINER_CARTE = 0xD666E;        // mot
const CAMERA_COLONNE = 0xD667A, CAMERA_RANGEE = 0xD6666;  // mots signés
const LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;   // mots
const ORIGINE_X = 0xD6624;               // mot signé : l'origine du dessin de la carte
const CARTE = 0xD3B08;                   // pointeur : 64 × 64 cellules de 4 octets, +2 l'image de sol
const SOLS = 0xB44D9;                    // 4 octets par image de sol : +0 les drapeaux
const OBJETS = 0xD3B10, FIN_DES_OBJETS = 0xD3B78, TAILLE_OBJET = 200;
const OBJETS_GRAPHIQUES = 0xD3B38;       // pointeur : une table de mots, l'objet graphique d'un élément
const IMAGES_DU_PANNEAU = 0xD3B68;       // pointeur : les images de l'interface, 6 octets par image
const IMAGES_DES_SOLS = 0xD3B90;         // pointeur : les images de sol, 6 octets par image
const ZONES = 0xB93C3, TAILLE_ZONE = 12; // les zones de l'écran : +0 x, +2 y, +8 et +9 les images
const FICHE_DU_JOUEUR = 0xD3808;         // pointeur : +0x06 non établi, +0x0A le solde
const COMPTES = 0xD3814;                 // pointeur : les comptes du parc
const FICHE_DU_PARC = 0xD3818;           // pointeur : +0x18 le parc est ouvert
const TEXTES_DU_TUTORIEL = 0xD7B74;      // table de textes : le message de chaque étape

// Les catalogues, et leurs fiches d'origine (celles de l'exécutable, recopiées à la fin).
const ATTRACTIONS = 0xCCED0, TAILLE_ATTRACTION = 200;   // +0x22 le genre, +0xC5 disponible, +0xC7 construites
const BOUTIQUES = 0xD3C62, TAILLE_BOUTIQUE = 0x6B;       // +0x22 le genre, +0x2B l'élément, +0x66 disponible, +0x68 construites
const DECORS = 0xCCA70, TAILLE_DECOR = 0x38;             // +0x37 : gardé tel quel à la fin du tutoriel
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;           // +0x22 le genre, +0x26 l'élément, +0x33 employés
const CHEMINS = 0xD37DC, BARRIERES = 0xD43E8;
const FICHE_ATTRACTION = 0xD665A, FICHE_BOUTIQUE = 0xD664A, FICHE_METIER = 0xD6644;  // mots : la fiche en main
const REMISES_A_NEUF = [
  // destination, fiche d'origine, octets
  [ATTRACTIONS, 0xB16F8, 0x1900],
  [BOUTIQUES, 0xB2FF8, 0x786],
  [DECORS, 0xB377E, 0x460],
  [CHEMINS, 0xB3BDE, 0x2C],
  [BARRIERES, 0xB3C0A, 0xE],
  [METIERS, 0xB3C18, 0x21C],
];

// Les variables du tutoriel.
const ETAPE = 0xBA0F8;                   // octet signé : l'étape, −1 hors tutoriel
const OBJET_DU_TUTORIEL = 0xD7880;       // mot long : l'attraction ou la boutique qu'on a posée
const FIN_DE_L_ATTENTE = 0xD7884;        // mot long : le pas où le tutoriel se termine
const MOT_REMIS_A_ZERO = 0xD3684;        // mot : remis à zéro à chaque image ; jamais lu tel quel. Non établi

// La minuterie.
const TICS = 0xB14B5;                    // mot long : les tics de la minuterie du jeu
const ANCIEN_GESTIONNAIRE = 0xD78B0;     // mot long, puis 0xD78B4 mot : celui du BIOS, déplacement et sélecteur
const MUSIQUE_PRETE = 0xBA714, BRUITAGES_PRETS = 0xBA720;  // octets

// La grille des blocs de l'écran (ecran.js) : 20 colonnes sur 30 rangées en 0xD671D, ou celle de la
// grande vue (`ecran`, grande-vue.js).

// Les molettes de la recherche : 0x1D octets par molette, 7 molettes.
const MOLETTES = 0xB9814, TAILLE_MOLETTE = 0x1D;  // +0 l'image (0 à 3), +1 octet signé les crans à tourner

// --- les fonctions appelées ---------------------------------------------------------------------
const POSER_LA_CAMERA = 0x59C06;         // ce module
const TRACER_BASSE = 0x5EC9C;            // (x, y, image) en 320x200
const TRACER_HAUTE = 0x55BD4;            // (x, y, image) en 640x480, blocs marqués
const DESSINER_UN_OBJET = 0x209B5;       // (objet graphique, x, y)
const DESSINER_SUSPENDU = 0x20E37;       // (objet graphique, x, y), interface-parc.js
const FANTOME = 0x30E22;                 // (fiche du genre, x, y), ecrans-gestion.js
const CHERCHER_SUR_LA_CASE = 0x204B9;    // (cellule, type) : l'objet de ce type sur la case, 0 sinon
const DEMOLIR_UNE_ATTRACTION = 0x31748;  // (objet) : le contraire de sa construction (construire.js)
const DEMOLIR_UNE_BOUTIQUE = 0x35C4A;    // (objet), sens exact non établi
const DESSINER_LA_BARRE = 0x5E2C5;       // (texte), panneau.js
const COPIER = 0x80958;                  // (destination, source, octets)
const MARQUER_ZONE_SALE = 0x54D38;       // (x, y, largeur, hauteur), ecran.js
const REMPLIR_UN_RECTANGLE = 0x81D88;    // (x, y, largeur, hauteur, couleur) dans la surface
const RECOPIER_BASSE = 0x80E20;          // (source, destination, lignes)
const ATTENDRE_BALAYAGE = 0x80BE4;
const CHOISIR_LA_BANQUE = 0x7E6BC;       // (banque VESA)
const REPRENDRE_DS = 0x7E570;            // __GETDS : ds reçoit le sélecteur des données
const CHAINER = 0x821BE;                 // _chain_intr(déplacement, sélecteur) : ne revient pas
const ECRIRE_UN_PORT = 0x821DF;          // outp(port, valeur)
const LIRE_UN_VECTEUR = 0x8164E;         // _dos_getvect(n) : edx:eax
const POSER_UN_VECTEUR = 0x828EB;        // _dos_setvect(n, déplacement, sélecteur)
const MINUTERIE_DE_SOS = 0x822F4;        // s'abonner à la minuterie de la bibliothèque de son

// =================================================================================================
// LE TUTORIEL
// =================================================================================================

// 0x59C06 — amener la vue sur le coin du terrain où le tutoriel fait construire.
//
// La colonne de la caméra est choisie pour que la colonne 0x22 soit au milieu de l'écran (0x280, la
// largeur logique, divisée par la largeur d'une tuile, donne les colonnes visibles) ; la rangée,
// pour que la rangée 0x3D soit au bas de l'écran : 400 lignes logiques en 320x200, 480 en 640x480,
// arrondies à la tuile supérieure. (En grande vue, grande-vue.js, l'écran est plus grand.)
function poserLaCamera(jeu) {
  const largeur = mot(jeu, LARGEUR_TUILE);
  poserMot(jeu, CAMERA_COLONNE, 0x22 - idiv(idiv(ecran.largeur, largeur), 2));
  const lignes = (octet(jeu, MODE_VIDEO) & 1) ? 0x190 : ecran.hauteur;
  const hauteur = mot(jeu, HAUTEUR_TUILE);
  poserMot(jeu, CAMERA_RANGEE, 0x40 - idiv(hauteur + lignes - 1, hauteur) - 3);
  poserMot(jeu, REDESSINER_CARTE, 1);
}

// Le repère clignote : allumé huit pas sur seize, quand les quatre bits bas du pas vont de 7 à 14.
// Allumé, un bouton montre son image enfoncée, un marquage au sol s'éteint ou change de case.
const allume = (jeu) => (((long(jeu, PAS_DE_SIMULATION) & 0xF) - 7) >>> 0) <= 7;

// Une image de l'interface ou du sol, tracée dans la surface par la routine du mode en cours.
function tracer(jeu, x, y, image) {
  jeu.appeler((octet(jeu, MODE_VIDEO) & 1) ? TRACER_BASSE : TRACER_HAUTE, x, y, image);
}

// Le bouton de la zone `zone` de la barre d'outils, dessiné quatre points plus haut que sa place,
// dans son image enfoncée (+9) quand le repère est allumé, normale (+8) sinon.
function faireClignoterLeBouton(jeu, zone) {
  const z = ZONES + zone * TAILLE_ZONE;
  const image = octet(jeu, z + (allume(jeu) ? 9 : 8));
  tracer(jeu, motSigne(jeu, z), s16(mot(jeu, z + 2) - 4), long(jeu, IMAGES_DU_PANNEAU) + image * 6);
}

// Le point de l'écran d'une case de la carte : la projection de dessin-carte.js, où chaque rangée
// décale d'un tiers de tuile vers la droite. Calculé sur 32 bits, gardé sur 16.
function pointDeLaCase(jeu, colonne, rangee) {
  const largeur = mot(jeu, LARGEUR_TUILE);
  const dRangee = rangee - motSigne(jeu, CAMERA_RANGEE);
  const x = (Math.imul(colonne - motSigne(jeu, CAMERA_COLONNE), largeur) + motSigne(jeu, ORIGINE_X)
    + Math.imul(idiv(largeur, 3), dRangee)) | 0;
  const y = Math.imul(mot(jeu, HAUTEUR_TUILE), u16(dRangee));
  return { x: s16(x), y: s16(y) };
}

// Une image de sol (son décalage dans la table des images de sol) posée sur une case.
function marquerLaCase(jeu, colonne, rangee, image, ecart = 0) {
  const p = pointDeLaCase(jeu, colonne, rangee);
  tracer(jeu, s16(p.x + ecart), s16(p.y + ecart), long(jeu, IMAGES_DES_SOLS) + image);
}
const SOL_BLEU = 0x204, SOL_VERT = 0x2DC, SOL_CROIX = 0x3CC;   // les images 86, 122 et 162

// Les drapeaux du sol d'une case (numéro de cellule = rangée × 64 + colonne).
function solDeLaCase(jeu, colonne, rangee) {
  const cellule = long(jeu, CARTE) + (rangee * 64 + colonne) * 4;
  return octet(jeu, SOLS + octet(jeu, cellule + 2) * 4);
}
// Des drapeaux de sol (construire.js) : 2 une allée, 8 une file d'attente, 0x20 une sortie d'attraction.
const ALLEE = 2, FILE = 8, SORTIE = 0x20;

const genreDeLAttraction = (jeu) => mot(jeu, ATTRACTIONS + mot(jeu, FICHE_ATTRACTION) * TAILLE_ATTRACTION + 0x22);
const genreDeLaBoutique = (jeu) => mot(jeu, BOUTIQUES + mot(jeu, FICHE_BOUTIQUE) * TAILLE_BOUTIQUE + 0x22);
const genreDuMetier = (jeu, fiche) => mot(jeu, METIERS + fiche * TAILLE_METIER + 0x22);
const objetGraphique = (jeu, element) => mot(jeu, long(jeu, OBJETS_GRAPHIQUES) + element * 2);
const caseDeLObjet = (objet, jeu) => octet(jeu, objet + 9) * 64 + octet(jeu, objet + 7);

// Les genres que le tutoriel fait construire ou embaucher (le mot +0x22 de leur fiche), nommés
// d'après ce que le jeu affiche au passage.
const GENRE_ATTRACTION = 0x14;           // le CHATEAU MOU
const GENRE_BOUTIQUE = 0x21;             // les GLACES MOTTO
const ARTISTE = 0x34, NETTOYEUR = 0x39, MECANICIEN = 0x38;

// 0x59C85 — une image du tutoriel.
//
// Tant qu'il dure, le joueur ne peut acheter que l'attraction du genre 0x14 (le CHATEAU MOU) et
// la boutique du genre 0x21 (les GLACES MOTTO) : à chaque image, tous les autres genres sont rendus
// indisponibles, et le solde du joueur est remis à la valeur de son mot +0x06 (non établi : le
// solde de départ, vraisemblablement) — le tutoriel ne coûte rien. Puis l'étape courante :
//
//   0      la vue est amenée sur le terrain du tutoriel (0x59C06)
//   1      on attend 400 pas, ou 50 et un clic ; l'outil est lâché
//   2, 11  le bouton des allées (zone 4) clignote, jusqu'à ce que l'outil 2 soit pris
//   3      deux cases de la rangée 0x35 sont marquées, colonnes 0x1C et 0x26 : jusqu'à ce qu'une
//          allée les couvre toutes les deux
//   4, 5   le bouton des attractions (zone 6) clignote ; on attend que la fiche en main soit celle
//          du genre 0x14 (outil 5), ou, à l'étape 4, que la première fenêtre soit la n° 1
//   6      le fantôme de l'attraction est dessiné en (0x23, 0x32), et l'on attend qu'elle y soit
//          posée — une attraction posée ailleurs est aussitôt démolie (0x31748)
//   7      on pose l'entrée (outil 0x0B) de l'attraction, que le tutoriel mène en (0x24, 0x32)
//   8      la sortie (outil 0x11) : on attend que le sol de (0x20, 0x32) porte celui d'une sortie
//   9      le bouton des files (zone 5) clignote, jusqu'à l'outil 3
//   10     deux cases de la colonne 0x24 marquées : jusqu'à une file sur (0x24, 0x33) et (0x24, 0x34)
//   12     deux cases de la colonne 0x20 : jusqu'à une allée sur (0x20, 0x33) et (0x20, 0x34)
//   13, 14 le bouton des boutiques (zone 7), jusqu'à la boutique du genre 0x21 en main (outil 6)
//   15     la boutique dessinée en (0x1D, 0x34), jusqu'à ce qu'elle y soit posée (sinon démolie)
//   16     on attend que le parc soit ouvert
//   17–25  trois employés, chacun en trois étapes : le bouton du personnel (zone 9) clignote
//          jusqu'au métier voulu en main (outil 9, ou la première fenêtre n° 4), puis on attend le
//          métier, puis l'employé est dessiné où le poser et l'on attend qu'il y soit : l'artiste
//          (0x34) en (0x21, 0x35), le nettoyeur (0x39) en (0x1F, 0x34), le mécanicien (0x38) en
//          (0x23, 0x33) — c'est-à-dire, pour le jeu, sur la case d'en dessous à gauche
//   26     on note le pas de la fin : 600 pas plus tard
//   27     le moment venu, les catalogues sont remis à neuf d'après ceux de l'exécutable (l'octet
//          +0x37 de chacun des 20 décors excepté), les objets du parc recomptés, et le tutoriel finit
//
// Enfin, aux étapes 1 à 25 et 27, la barre des messages montre le texte de l'étape.
//
// L'étape 11 est l'étape 2 (la table de sauts y renvoie) : après la file, on reprend les allées. Aux
// étapes 4, 17, 20 et 23, il suffit que le catalogue surgissant soit ouvert (fenêtre 1 ou 4) ; la
// fiche est vérifiée à l'étape suivante.
function etapeDuTutoriel(jeu) {
  // Seuls les genres du tutoriel restent disponibles.
  for (let k = 0; mot(jeu, ATTRACTIONS + k * TAILLE_ATTRACTION + 0x22) !== 0; k++) {
    if (mot(jeu, ATTRACTIONS + k * TAILLE_ATTRACTION + 0x22) !== GENRE_ATTRACTION) {
      poserOctet(jeu, ATTRACTIONS + k * TAILLE_ATTRACTION + 0xC5, 0);
    }
  }
  for (let k = 0; mot(jeu, BOUTIQUES + k * TAILLE_BOUTIQUE + 0x22) !== 0; k++) {
    if (mot(jeu, BOUTIQUES + k * TAILLE_BOUTIQUE + 0x22) !== GENRE_BOUTIQUE) {
      poserOctet(jeu, BOUTIQUES + k * TAILLE_BOUTIQUE + 0x66, 0);
    }
  }
  poserMot(jeu, MOT_REMIS_A_ZERO, 0);
  const fiche = long(jeu, FICHE_DU_JOUEUR);
  poserLong(jeu, fiche + 0x0A, long(jeu, fiche + 0x06));

  const avancer = () => poserOctet(jeu, ETAPE, octet(jeu, ETAPE) + 1);
  const etape = octet(jeu, ETAPE);
  const ecart16 = () => (mot(jeu, MODE_VIDEO) === EN_640X480 ? 8 : 0x10);

  switch (etape) {
    case 0:
      jeu.appeler(POSER_LA_CAMERA);
      avancer();
      break;

    case 1: {
      const pas = long(jeu, PAS_DE_SIMULATION);
      if (pas > 0x190 || (mot(jeu, GAUCHE_ENFONCE) !== 0 && pas > 0x32)) {
        avancer();
        poserMot(jeu, OUTIL, 0);
      }
      break;
    }

    case 2:
    case 11:
      faireClignoterLeBouton(jeu, 4);
      if (mot(jeu, OUTIL) === 2) avancer();
      break;

    case 3:
      marquerLaCase(jeu, allume(jeu) ? 0x26 : 0x1C, 0x35, SOL_BLEU);
      if ((solDeLaCase(jeu, 0x1C, 0x35) & ALLEE) && (solDeLaCase(jeu, 0x26, 0x35) & ALLEE)) avancer();
      break;

    case 4:
      faireClignoterLeBouton(jeu, 6);
      if (mot(jeu, PREMIERE_FENETRE) === 1
        || (mot(jeu, OUTIL) === 5 && genreDeLAttraction(jeu) === GENRE_ATTRACTION)) avancer();
      break;

    case 5:
      if (mot(jeu, OUTIL) === 5 && genreDeLAttraction(jeu) === GENRE_ATTRACTION) avancer();
      break;

    case 6: {
      if (!allume(jeu)) {
        const p = pointDeLaCase(jeu, 0x23, 0x32);
        jeu.appeler(FANTOME, ATTRACTIONS + mot(jeu, FICHE_ATTRACTION) * TAILLE_ATTRACTION, u16(p.x), u16(p.y));
      }
      for (let objet = long(jeu, OBJETS) + TAILLE_OBJET; objet < long(jeu, FIN_DES_OBJETS); objet += TAILLE_OBJET) {
        if (octet(jeu, objet + 4) !== 4) continue;          // une attraction
        if (caseDeLObjet(objet, jeu) === 0x31 * 64 + 0x21) {   // la case (0x21, 0x31), 0xC61
          avancer();
          poserLong(jeu, OBJET_DU_TUTORIEL, objet);
          break;
        }
        jeu.appeler(DEMOLIR_UNE_ATTRACTION, objet);
        poserMot(jeu, REDESSINER_CARTE, 1);
      }
      break;
    }

    case 7: {
      // L'entrée de l'attraction : le mot +0x49 de l'attraction désigne son objet d'entrée.
      if (mot(jeu, OUTIL) !== 0x0B) {
        const numero = mot(jeu, long(jeu, OBJET_DU_TUTORIEL) + 0x49);
        const entree = long(jeu, OBJETS) + numero * TAILLE_OBJET;
        if (octet(jeu, entree + 7) === 0x24 && octet(jeu, entree + 9) === 0x32) {
          avancer();
        } else {
          const comptes = long(jeu, COMPTES);
          poserMot(jeu, comptes + 0x2BC, caseDeLObjet(entree, jeu));
          poserMot(jeu, comptes + 0x2BA, 1);
          poserMot(jeu, comptes + 0x2D0, numero);
          poserMot(jeu, OUTIL, 0x0B);
        }
      }
      if (!allume(jeu)) {
        const p = pointDeLaCase(jeu, 0x24, 0x32);
        const ecart = mot(jeu, MODE_VIDEO) === EN_640X480 ? 0xF : 0x1F;
        jeu.appeler(DESSINER_UN_OBJET, objetGraphique(jeu, 0x69), s16(p.x + ecart), s16(p.y + ecart));
      }
      break;
    }

    case 8:
      if (mot(jeu, OUTIL) !== 0x11) {
        if ((solDeLaCase(jeu, 0x20, 0x32) & SORTIE) === 0) {
          poserMot(jeu, OUTIL, 0x11);
          const comptes = long(jeu, COMPTES);
          const attraction = long(jeu, OBJETS) + mot(jeu, comptes + 0x2D0) * TAILLE_OBJET;
          if (octet(jeu, attraction + 4) === 6) {
            const lie = long(jeu, OBJETS) + mot(jeu, attraction + 0x16) * TAILLE_OBJET;
            if (mot(jeu, lie + 0x73) !== 0) {
              poserMot(jeu, comptes + 0x2BC, mot(jeu, lie + 0x73));
              poserMot(jeu, comptes + 0x2BA, 1);
              break;                                        // rien n'est dessiné cette fois
            }
          }
        } else {
          avancer();
        }
      }
      if (!allume(jeu)) marquerLaCase(jeu, 0x20, 0x31, SOL_CROIX, ecart16());
      break;

    case 9:
      faireClignoterLeBouton(jeu, 5);
      if (mot(jeu, OUTIL) === 3) avancer();
      break;

    case 10:
      marquerLaCase(jeu, 0x24, allume(jeu) ? 0x34 : 0x33, SOL_VERT);
      if ((solDeLaCase(jeu, 0x24, 0x33) & FILE) && (solDeLaCase(jeu, 0x24, 0x34) & FILE)) avancer();
      break;

    case 12:
      if (!allume(jeu)) {
        marquerLaCase(jeu, 0x20, 0x34, SOL_BLEU);
        marquerLaCase(jeu, 0x20, 0x33, SOL_BLEU);
      }
      if ((solDeLaCase(jeu, 0x20, 0x34) & ALLEE) && (solDeLaCase(jeu, 0x20, 0x33) & ALLEE)) avancer();
      break;

    case 13:
      faireClignoterLeBouton(jeu, 7);
      if (mot(jeu, OUTIL) === 6) avancer();
      break;

    case 14:
      if (mot(jeu, OUTIL) === 6 && genreDeLaBoutique(jeu) === GENRE_BOUTIQUE) avancer();
      break;

    case 15: {
      if (!allume(jeu)) {
        const p = pointDeLaCase(jeu, 0x1D, 0x34);
        const enHaute = mot(jeu, MODE_VIDEO) === EN_640X480;
        const y = s16(p.y + (enHaute ? 8 : 0x10));
        const x = s16(p.x + (mot(jeu, LARGEUR_TUILE) >> 1) + (enHaute ? 4 : 8));
        const element = mot(jeu, BOUTIQUES + mot(jeu, FICHE_BOUTIQUE) * TAILLE_BOUTIQUE + 0x2B);
        jeu.appeler(DESSINER_UN_OBJET, objetGraphique(jeu, element), x, y);
      }
      for (let objet = long(jeu, OBJETS) + TAILLE_OBJET; objet < long(jeu, FIN_DES_OBJETS); objet += TAILLE_OBJET) {
        if (octet(jeu, objet + 4) !== 0x0A) continue;       // une boutique
        if (caseDeLObjet(objet, jeu) === 0x34 * 64 + 0x1D) {   // la case (0x1D, 0x34), 0xD1D
          avancer();
          poserLong(jeu, OBJET_DU_TUTORIEL, objet);
          break;
        }
        jeu.appeler(DEMOLIR_UNE_BOUTIQUE, objet);
        poserMot(jeu, REDESSINER_CARTE, 1);
      }
      break;
    }

    case 16:
      if (octet(jeu, long(jeu, FICHE_DU_PARC) + 0x18) !== 0) avancer();
      break;

    case 17: embaucher(jeu, ARTISTE); break;
    case 18: attendreLeMetier(jeu, ARTISTE); break;
    case 19: poserLEmploye(jeu, ARTISTE, 0x21, 0x35); break;
    case 20: embaucher(jeu, NETTOYEUR); break;
    case 21: attendreLeMetier(jeu, NETTOYEUR); break;
    case 22: poserLEmploye(jeu, NETTOYEUR, 0x1F, 0x34); break;
    case 23: embaucher(jeu, MECANICIEN); break;
    case 24: attendreLeMetier(jeu, MECANICIEN); break;
    case 25: poserLEmploye(jeu, MECANICIEN, 0x23, 0x33); break;

    case 26:
      avancer();
      poserLong(jeu, FIN_DE_L_ATTENTE, long(jeu, PAS_DE_SIMULATION) + 600);
      break;

    case 27:
      if (long(jeu, PAS_DE_SIMULATION) >= long(jeu, FIN_DE_L_ATTENTE)) terminerLeTutoriel(jeu);
      break;

    default:                                                // hors tutoriel (−1)
      break;
  }

  const e = octetSigne(jeu, ETAPE);
  if ((e > 0 && e < 0x1A) || e === 0x1B) {
    jeu.appeler(DESSINER_LA_BARRE, long(jeu, long(jeu, TEXTES_DU_TUTORIEL) + e * 4));
  }
}

// Les trois étapes d'une embauche.
function embaucher(jeu, metier) {
  faireClignoterLeBouton(jeu, 9);
  if (mot(jeu, PREMIERE_FENETRE) === 4
    || (mot(jeu, OUTIL) === 9 && genreDuMetier(jeu, mot(jeu, FICHE_METIER)) === metier)) {
    poserOctet(jeu, ETAPE, octet(jeu, ETAPE) + 1);
  }
}
function attendreLeMetier(jeu, metier) {
  if (mot(jeu, OUTIL) === 9 && genreDuMetier(jeu, mot(jeu, FICHE_METIER)) === metier) {
    poserOctet(jeu, ETAPE, octet(jeu, ETAPE) + 1);
  }
}
function poserLEmploye(jeu, metier, colonne, rangee) {
  if (!allume(jeu)) {
    const p = pointDeLaCase(jeu, colonne, rangee);
    const element = mot(jeu, METIERS + mot(jeu, FICHE_METIER) * TAILLE_METIER + 0x26);
    jeu.appeler(DESSINER_SUSPENDU, objetGraphique(jeu, element), p.x, p.y);
  }
  // L'employé cherché est sur la case de la rangée suivante, une colonne à gauche (0x204B9, type 8).
  const cellule = long(jeu, CARTE) + ((rangee + 1) * 64 + colonne - 1) * 4;
  const employe = jeu.appeler(CHERCHER_SUR_LA_CASE, cellule, 8);
  if (employe !== 0 && genreDuMetier(jeu, octet(jeu, employe + 0x59)) === metier) {
    poserOctet(jeu, ETAPE, octet(jeu, ETAPE) + 1);
  }
}

// La fin : les catalogues reprennent leurs valeurs de l'exécutable — sauf l'octet +0x37 des 20
// décors, gardé — puis chaque attraction, boutique et employé du parc est recompté dans son
// catalogue, et le tutoriel s'arrête (−1).
function terminerLeTutoriel(jeu) {
  const gardes = [];
  for (let k = 0; k < 20; k++) gardes.push(octet(jeu, DECORS + k * TAILLE_DECOR + 0x37));
  for (const [destination, source, octets] of REMISES_A_NEUF) jeu.appeler(COPIER, destination, source, octets);
  for (let k = 0; k < 20; k++) poserOctet(jeu, DECORS + k * TAILLE_DECOR + 0x37, gardes[k]);

  for (let objet = long(jeu, OBJETS) + TAILLE_OBJET; objet < long(jeu, FIN_DES_OBJETS); objet += TAILLE_OBJET) {
    const type = octet(jeu, objet + 4);
    // Le mot +0x16 d'une attraction ou d'une boutique est le décalage de sa fiche dans le catalogue.
    let compte = -1;
    if (type === 4) compte = ATTRACTIONS + 0xC7 + mot(jeu, objet + 0x16);
    else if (type === 8) compte = METIERS + 0x33 + octet(jeu, objet + 0x59) * TAILLE_METIER;
    else if (type === 0x0A) compte = BOUTIQUES + 0x68 + mot(jeu, objet + 0x16);
    if (compte >= 0) poserOctet(jeu, compte, octet(jeu, compte) + 1);
  }
  poserOctet(jeu, ETAPE, 0xFF);
}

// =================================================================================================
// LA MINUTERIE
// =================================================================================================

// 0x5CAD0 — installer la minuterie du jeu.
function installerLaMinuterie(jeu) {
  const R = jeu.T.R;
  if (octet(jeu, MUSIQUE_PRETE) !== 0 || octet(jeu, BRUITAGES_PRETS) !== 0) {
    // La bibliothèque de son tient déjà la minuterie : on s'abonne à 60 Hz avec 0x5CA6B, qui ne
    // fait qu'incrémenter le compteur. 0xE3000 : non établi (la pile de la routine, vraisemblablement).
    jeu.appeler(MINUTERIE_DE_SOS, 0x3C, 0x5CA6B, R.cs & 0xFFFF, 0xE3000, R.ds & 0xFFFF);
    return;
  }
  // L'ancien gestionnaire, rendu dans edx:eax.
  const deplacement = jeu.appeler(LIRE_UN_VECTEUR, 8);
  const selecteur = jeu.T.R.edx;
  poserMot(jeu, ANCIEN_GESTIONNAIRE + 4, selecteur);
  poserLong(jeu, ANCIEN_GESTIONNAIRE, deplacement);
  // Le compteur 0, mode 3 (0x36), diviseur 0x4000 écrit octet bas puis octet haut.
  jeu.appeler(ECRIRE_UN_PORT, 0x43, 0x36);
  jeu.appeler(ECRIRE_UN_PORT, 0x40, 0x00);
  jeu.appeler(ECRIRE_UN_PORT, 0x40, 0x40);
  jeu.appeler(POSER_UN_VECTEUR, 8, 0x5CA82, jeu.T.R.cs & 0xFFFF);
}

// 0x5CA82 — le gestionnaire de l'interruption de la minuterie.
//
// Appelé par l'hôte comme par le processeur : registres et drapeaux sur la pile, retour par
// `iretd` (d'où `nettoie: 8` : les 12 octets empilés, moins l'adresse de retour). L'original sauve
// tout (`pushad` et les quatre segments) et le rend ; la réécriture le rend aussi. Une fois sur
// quatre, la main passe au gestionnaire du BIOS par _chain_intr, qui ne revient pas : c'est lui
// qui acquitte l'interruption. Sinon, on l'acquitte soi-même (0x20 au port 0x20).
function gestionnaireDeLaMinuterie(jeu, R) {
  const entree = { ...R };
  jeu.appeler(REPRENDRE_DS);
  poserLong(jeu, TICS, long(jeu, TICS) + 1);
  if ((octet(jeu, TICS) & 3) === 0) {
    jeu.appeler(CHAINER, long(jeu, ANCIEN_GESTIONNAIRE), mot(jeu, ANCIEN_GESTIONNAIRE + 4));
  }
  jeu.appeler(ECRIRE_UN_PORT, 0x20, 0x20);
  Object.assign(R, entree);
}

// =================================================================================================
// L'ÉCRAN
// =================================================================================================

// 0x55EFA — agrandir en 640x480 une image faite en 320x200.
//
// En 320x200, simple recopie de 200 lignes par 0x80E20 — le nombre de lignes demandé est ignoré.
// Sinon, chaque point de la source est doublé en largeur et chaque ligne en hauteur : `lignes` est
// le nombre de lignes de 640 points écrites, lignes/2 celui des lignes de 320 lues. Puis, si la
// destination n'est pas l'écran et qu'on en a écrit au moins 400, les 80 lignes suivantes sont mises
// à zéro : le bas d'une image de 480 lignes.
//
// Défauts d'origine, reproduits : le compteur des lignes lues, sur 16 bits, est testé après usage,
// si bien que moins de deux lignes demandées en font lire 65 536 ; et au-delà de 400 lignes, la
// mise à zéro déborde de 80 lignes après l'image. Les appelants demandent toujours 400.
// La routine préserve tous les registres ; la réécriture rend eax, ecx et edx comme elle.
function agrandirLImage(jeu, source, destination, lignes) {
  const R = jeu.T.R;
  const { eax, ecx, edx } = R;
  if (mot(jeu, MODE_VIDEO) & 1) {
    jeu.appeler(RECOPIER_BASSE, source, destination, 0xC8);
    Object.assign(R, { eax, ecx, edx });
    return;
  }
  const m8 = jeu.m8;
  let s = source >>> 0, d = destination >>> 0;
  let paires = (u16(lignes) >>> 1);
  do {
    for (let fois = 0; fois < 2; fois++) {
      for (let k = 0; k < 320; k++) {
        const c = m8[s + k];
        m8[d++] = c;
        m8[d++] = c;
      }
    }
    s += 320;
    paires = (paires - 1) & 0xFFFF;
  } while (paires !== 0);
  if ((destination >>> 0) !== 0xA0000 && u16(lignes) >= 0x190) m8.fill(0, d, d + 0x3200 * 4);
}
const zonesDeLImage = (jeu, source, destination, lignes) => {
  const paires = (u16(lignes) >>> 1) || 0x10000;
  const d = destination >>> 0;
  return [[d, d + paires * 1280 + 0x3200 * 4]];
};

// 0x55FCF — effacer l'écran (la mémoire vidéo, pas la surface de dessin).
//
// En 320x200, les 64 000 octets de la fenêtre 0xA0000. En 640x480, après le retour du balayage,
// les 307 200 points banque par banque : quatre banques de 64 Ko, puis 45 056 octets de la
// cinquième. eax, ecx et edi sont rendus tels qu'ils étaient.
function effacerLEcran(jeu) {
  const R = jeu.T.R;
  const { eax, ecx } = R;
  const m8 = jeu.m8;
  if (mot(jeu, MODE_VIDEO) & 1) {
    m8.fill(0, 0xA0000, 0xA0000 + 0x3E80 * 4);
    return;
  }
  jeu.appeler(ATTENDRE_BALAYAGE);
  for (let banque = 0; banque < 5; banque++) {
    jeu.appeler(CHOISIR_LA_BANQUE, banque);
    m8.fill(0, 0xA0000, 0xA0000 + (banque < 4 ? 0x4000 : 0x2C00) * 4);
  }
  Object.assign(R, { eax, ecx });
}

// 0x55B86 — remplir un rectangle de la surface d'une couleur, en 640x480 : ses blocs sont d'abord
// marqués à présenter. Appelée par 0x1188C, qui passe en 320x200 par 0x7F5BC.
function remplirUnRectangle(jeu, x, y, largeur, hauteur, couleur) {
  jeu.appeler(MARQUER_ZONE_SALE, s16(x), s16(y), s16(largeur), s16(hauteur));
  jeu.appeler(REMPLIR_UN_RECTANGLE, s16(x), s16(y), u16(largeur), u16(hauteur), u16(couleur));
}

// 0x54CE4 — vider la grille des blocs à présenter : 30 rangées de 20 blocs, deux octets par bloc,
// dont seul le premier, le compte, est remis à zéro.
function viderLaGrille(jeu) {
  for (let k = 0; k < ecran.rangees * ecran.colonnes; k++) jeu.m8[ecran.grille + k * 2] = 0;
}

// =================================================================================================
// LA RECHERCHE
// =================================================================================================

// 0x53E6E — faire tourner d'un cran la molette `n` de l'écran de la recherche.
//
// Chaque molette a quatre images (l'octet +0, tracé par 0x51780 comme l'image 4 + n° de la banque
// [0xD3B20]) et un nombre signé de crans qu'il lui reste à faire (+1) : un cran en avant s'il est
// positif, en arrière s'il est négatif, l'image tournant de 0 à 3.
function tournerLaMolette(jeu, n) {
  const m = MOLETTES + u16(n & 0xFF) * TAILLE_MOLETTE;
  const crans = octetSigne(jeu, m + 1);
  if (crans > 0) {
    poserOctet(jeu, m, octet(jeu, m) + 1);
    poserOctet(jeu, m + 1, crans - 1);
  } else if (crans < 0) {
    poserOctet(jeu, m, octet(jeu, m) - 1);
    poserOctet(jeu, m + 1, crans + 1);
  }
  if (octetSigne(jeu, m) < 0) poserOctet(jeu, m, 3);
  else if (octetSigne(jeu, m) >= 4) poserOctet(jeu, m, 0);
}

// =================================================================================================

export const reecritures = [
  // Les démolitions des étapes 6 et 15 (0x31748, 0x35C4A) écrivent dans les objets du parc, au tas :
  // la comparaison appel par appel doit restaurer toute la mémoire.
  { adresse: 0x59C85, nom: 'etapeDuTutoriel', fn: (jeu) => etapeDuTutoriel(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x59C06, nom: 'poserLaCameraDuTutoriel', fn: (jeu) => poserLaCamera(jeu), arguments: 0 },
  { adresse: 0x5CAD0, nom: 'installerLaMinuterie', fn: (jeu) => installerLaMinuterie(jeu), arguments: 0 },
  { adresse: 0x5CA82, nom: 'gestionnaireDeLaMinuterie', fn: gestionnaireDeLaMinuterie, convention: 'registres',
    nettoie: 8 },
  { adresse: 0x55EFA, nom: 'agrandirLImage', fn: agrandirLImage, arguments: 3, zones: zonesDeLImage },
  { adresse: 0x55FCF, nom: 'effacerLEcran', fn: (jeu) => effacerLEcran(jeu), arguments: 0 },
  { adresse: 0x55B86, nom: 'remplirUnRectangle', fn: remplirUnRectangle, arguments: 5 },
  { adresse: 0x54CE4, nom: 'viderLaGrille', fn: (jeu) => viderLaGrille(jeu), arguments: 0 },
  { adresse: 0x53E6E, nom: 'tournerLaMolette', fn: tournerLaMolette, arguments: 1 },
];

export const enAttente = [];
