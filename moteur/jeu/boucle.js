// Ce que la boucle du parc fait à chaque image, hors simulation et dessin : clavier, menus, fenêtres,
// palette, météo, visite de la démonstration.
//
// Réécriture lisible des fonctions 0x13BF3, 0x13B9A, 0x1A706, 0x1B229, 0x5B5D0, 0x4FD85, 0x50651,
// 0x6B9CB, 0x47606, 0x47D38, 0x47D74, 0x47DBA, 0x4820D et 0x48296 du jeu d'origine. La boucle
// elle-même, 0x11C45, reste transcrite : elle ne rend la main qu'en quittant le parc.
//
// Une image de la boucle du parc (0x11C45), dans l'ordre :
//  - 0x1107F relève la souris et le clavier ;
//  - pendant la démonstration, 0x5B5D0 promène la caméra ;
//  - 0x4FD85 gère la barre de menus déroulants, si elle est ouverte ;
//  - un ou plusieurs pas de simulation, selon la vitesse du jeu (docs/retro-ingenierie.md § 5.3) ;
//  - puis, dans la vue du parc (écran 0, et les écrans 0x4A, 0x54, 0x56 et 0x64 qui s'y affichent
//    par-dessus) : 0x13B9A dessine la carte ; si la barre d'outils est là ([0xD7798]), 0x50651 dessine
//    la barre de menus ; tant que le compteur de pas est sous 500, 0x1B229, qui ne fait rien ; 0x6B9CB
//    traite les fenêtres ; 0x47606 fait tomber la pluie ; 0x13BF3 reçoit la touche de l'image ;
//    0x145FB les boutons de la souris (interface-parc.js) ;
//  - la commande différée : une ligne de menu choisie dans 0x4FD85 est exécutée ici, en fin d'image
//    (le pointeur [0xD3828], et ses arguments) ; si c'est une touche, 0x13BF3 la reçoit ;
//  - 0x2CCF8 applique les événements de l'image (vitesse, argent, sauvegarde...) ;
//  - 0x1A706 fait avancer le fondu d'ouverture de la palette ;
//  - la présentation de l'image (presentation.js).
//
// Les fonctions de ce module qui n'ont d'autre appelant qu'une autre fonction du module (0x47D74,
// 0x47DBA, 0x48296...) sont appelées par jeu.appeler, comme l'original : c'est leur entrée que la
// comparaison appel par appel surveille, et c'est ainsi qu'elles sont prouvées.
//
// Les cinq scénarios de vérification ne touchent qu'une partie de ce que la boucle sait faire : ils ne
// pressent que cinq touches, n'ouvrent ni la barre de menus, ni les catalogues surgissants, et n'ont
// ni orage ni fin de démonstration. Le reste a été prouvé par des parties d'exploration, comparées de
// la même façon, appel par appel : le clavier du parc touche par touche (y compris les touches de
// triche, avec un joueur nommé HORZA), la barre de menus en 320x200 et en 640x480, les catalogues
// surgissants, la démonstration jusqu'à sa fin, et l'orage forcé par la météo. Chaque fonction dit ce
// qui, chez elle, reste sans preuve.

import { dansLeCadre } from './cadre.js';
import { cadrageDeLaVue, releverLaVue } from './vue-fluide.js';
import { ecran } from './grande-vue.js';

const s16 = (v) => (v << 16) >> 16;
const s8 = (v) => (v << 24) >> 24;

const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const ecrireMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const ecrireLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// --- Les variables du jeu --------------------------------------------------------------------------

const ECRAN = 0xD6652;               // mot : l'écran affiché, 0 = la vue du parc
const COLONNE = 0xD667A;             // mot signé : la caméra, colonne de la carte
const RANGEE = 0xD6666;              // mot signé : la caméra, rangée
const REDESSINER_CARTE = 0xD666E;    // mot : demande de redessin complet de la carte
const LARGEUR_TUILE = 0xD663A;       // mot : 48 en basse résolution, 24 en haute
const HAUTEUR_TUILE = 0xD6654;       // mot : 32 ou 16
const MODE_AFFICHAGE = 0xDE5F6;      // mot : 1 = 320x200, 8 = 640x480
const VITESSE = 0xD6634;             // mot signé : la vitesse du jeu (§ 5.3)
const PAS_DE_SIMULATION = 0xD3AFC;   // mot long : le calendrier, 1 000 pas par mois
const OUTIL = 0xD6670;               // mot : l'outil choisi (0 = aucun)
const OUTIL_MIS_DE_COTE = 0xD6626;   // mot : l'outil repris quand la barre de menus se referme (0x4FD2D)
const EN_PAUSE = 0xD779C;            // octet : le jeu est en pause (touche P) ; la boucle ne simule plus
const PANNEAU = 0xD7798;             // octet : la barre d'outils du bas, non nul quand elle est affichée
                                     // (2 en jeu, posé par 0x12452) ; rôle exact non établi
const JOUEUR = 0xD665C;              // mot : le joueur courant
const FICHE_DU_PARC = 0xD3818;       // pointeur : la fiche du parc du joueur (§ 10.8)
const PALETTE_DU_PARC = 0xD3B8C;     // pointeur : la palette du parc
const PALETTE_AFFICHEE = 0xCEEE0;    // 768 octets : la palette en cours de fondu, telle qu'envoyée à la carte
const TEXTES = 0xD7BCC;              // pointeur : la table des textes de l'interface (4 octets par texte)
const MESSAGES = 0xD7BC0;            // pointeur : une autre table de textes (les questions, les messages)
const TRICHE = 0xD6682;              // mot : 1 si le joueur s'appelle HORZA (voir clavierDuParc)
const JOUEURS_EN_RESEAU = 0xD7792;   // octet : le nombre de joueurs d'une partie en réseau, lu sur la ligne
                                     // de commande (0x10010) ; 0 sans l'option, ramené à 1 si le réseau manque
const TOUCHE_DE_L_IMAGE = 0xDE688;   // octet : la touche lue par 0x875A4 (scancode du BIOS)

// La souris (docs/retro-ingenierie.md § 6.7).
const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;           // mots signés
const GAUCHE_MAINTENU = 0xDE5AC, DROIT_MAINTENU = 0xDE5AA;
const APPUI_GAUCHE = 0xDE5A6, APPUI_DROIT = 0xDE5A4;

// Les événements. Chaque joueur a une case de 6 octets, en 0xD441E : le type à +1, la valeur (mot) à
// +2. L'interface y poste une demande, que 0x2CCF8 applique en fin d'image, pour tous les joueurs
// (vraisemblablement pour le jeu à plusieurs, où la demande doit parvenir aux autres machines).
const EVENEMENT_TYPE = 0xD441F, EVENEMENT_VALEUR = 0xD4420;
const EV_SAUVER = 0x26;              // 0x2DF12(0) : sauvegarder dans l'emplacement 0, save/<nom>.g0 (§ 7)
const EV_CHARGER = 0x28;             // 0x2E035(0) : recharger l'emplacement 0
const EV_JOUEURS = 0x36;             // jeu en réseau : rôle non établi
const EV_ARGENT = 0x38;              // la valeur s'ajoute au solde du joueur, un message s'affiche (écran 0x56)
const EV_VITESSE = 0x42;             // la valeur devient la vitesse du jeu (0x2DE5F)

function posterEvenement(jeu, type) {
  jeu.m8[EVENEMENT_TYPE + 6 * mot(jeu, JOUEUR)] = type;
}
function posterValeur(jeu, valeur) {
  ecrireMot(jeu, EVENEMENT_VALEUR + 6 * mot(jeu, JOUEUR), valeur);
}

// Les boutons de la souris oubliés : maintenus et appuis, tous remis à zéro.
function oublierLesBoutons(jeu) {
  ecrireMot(jeu, DROIT_MAINTENU, 0);
  ecrireMot(jeu, APPUI_DROIT, 0);
  ecrireMot(jeu, GAUCHE_MAINTENU, 0);
  ecrireMot(jeu, APPUI_GAUCHE, 0);
}

// --- Les routines appelées -----------------------------------------------------------------------

const RECADRER_CAMERA = 0x184DF;         // carte.js
const DESSINER_CARTE = 0x1B837;          // (colonne, rangée, rangées visibles), dessin-carte.js
const ATTENDRE_BALAYAGE = 0x80BE4;       // attend le retour du balayage vertical (port 0x3DA)
const POSER_PALETTE = 0x808B0;           // (palette) : envoie les 256 couleurs à la carte
const REMPLIR = 0x7F1A0;                 // (destination, octet, n) : memset
const COPIER = 0x80958;                  // (destination, source, n) : memcpy
const HASARD = 0x18B92;                  // le générateur de hasard, 0 à 32 767 (§ 10.1)
const OUVRIR_FENETRE = 0x35F21;          // (numéro) : ouvre une fenêtre ou un écran (table 0xB762D)
const CURSEUR = 0x116E4;                 // (image) : change l'image du pointeur
const LARGEUR_TEXTE = 0x3F677;           // (texte) : largeur en pixels
const ECRIRE_TEXTE = 0x3F49E;            // (x, y, texte, ?, couleur)
const RECTANGLE = 0x1188C;               // (x, y, largeur, hauteur, couleur) : un rectangle plein
const FERMER_BARRE_DE_MENUS = 0x4FD2D;   // referme la barre, reprend l'outil mis de côté, ôte la pause
const PLACER_MENU = 0x503DA;             // (menu) : calcule la taille d'un menu qui s'ouvre, sans ligne choisie
const DESSINER_MENU = 0x508A3;           // (menu)
const PRESENTER_BASSE = 0x80210;         // (400) : présente l'image, 320x200 (presentation.js)
const PRESENTER_HAUTE = 0x55507;         // présente l'image par blocs, 640x480 (presentation.js)

// La mémoire au-delà de la pile : la mémoire conventionnelle du DOS, puis le tas, où vivent les objets
// du parc et les tampons alloués. Déclarée à la comparaison appel par appel (champ `zones`) pour les
// appels qui peuvent y écrire : le chargement d'une partie, le changement de résolution, les écrans.
const FIN_DE_LA_PILE = 0xE2340;          // PILE_HAUT de index.js
const auDelaDeLaPile = (jeu) => [[FIN_DE_LA_PILE, jeu.machine.tasLibre]];

// =================================================================================================
// Le clavier
// =================================================================================================

// Les touches, par leur scancode (clavier américain : sur un clavier français, [ et ] sont ^ et $, et
// / est !). Le jeu lit le scancode, donc la touche physique.
const T_ECHAP = 0x01, T_HUIT = 0x09, T_R = 0x13, T_T = 0x14, T_O = 0x18, T_P = 0x19;
const T_CROCHET_OUVRANT = 0x1A, T_CROCHET_FERMANT = 0x1B, T_S = 0x1F, T_F = 0x21, T_L = 0x26;
const T_Z = 0x2C, T_C = 0x2E, T_B = 0x30, T_N = 0x31, T_M = 0x32, T_BARRE_OBLIQUE = 0x35;
const T_F3 = 0x3D, T_F4 = 0x3E, T_F5 = 0x3F, T_F6 = 0x40, T_F7 = 0x41, T_F8 = 0x42;
const T_ORIGINE = 0x47, T_HAUT = 0x48, T_PAGE_HAUT = 0x49, T_GAUCHE = 0x4B, T_DROITE = 0x4D;
const T_FIN = 0x4F, T_BAS = 0x50, T_PAGE_BAS = 0x51;

// Les modificateurs, tels que 0x875A4 les tire de l'état du clavier (int 16h, fonction 12h).
const MAJ = 1, CTRL = 2, ALT = 4;

// Les écrans où le clavier du parc ne fait rien. (La boucle n'appelle directement 0x13BF3 que dans la
// vue du parc et les écrans 0x4A, 0x54, 0x56 et 0x64 ; ce filtre ne sert qu'à la commande différée
// d'un menu, qui peut arriver sur n'importe quel écran.)
const ECRANS_SANS_CLAVIER = new Set([0x14, 0x16, 0x1C, 0x23, 0x42, 0x60]);

// Un octet que lève la commande 3 des menus (0x50CCD) — aucune ligne de la barre de menus du parc ne
// l'emploie — et que rien ne baisse ensuite : il réduit le clavier du parc aux flèches, et suspend
// les actions de la souris dans 0x145FB. Rôle non établi ; jamais levé.
const CLAVIER_REDUIT = 0xB14C6;

// Le passage d'une résolution à l'autre n'est permis que si la carte vidéo sait faire les deux
// (0x104A3 pose 9 dans cet octet au démarrage, sinon 1).
const MODES_VIDEO = 0xD7795;

// 0x13BF3 — la touche de l'image, dans le parc : (modificateurs, touche).
//
// La boucle passe à chaque image la touche que 0x875A4 a lue (0 s'il n'y en a pas) et l'état des
// touches Maj, Ctrl et Alt. La plupart des touches sont aussi des lignes de la barre de menus, qui
// affiche le raccourci et simule la touche quand on la choisit (0x4FD85) : les noms ci-dessous sont
// ceux des menus de la version française.
//
// Le code de triche. Si le joueur s'appelle HORZA, 0x2EA62 lève le mot 0xD6682 ; le nom n'est pas
// écrit en clair dans le programme mais codé, chaque lettre décalée à gauche de son rang (en 0xB8C58 :
// 48 9E 48 D0 10, soit H<<0, O<<1, R<<2, Z<<3, A<<4, sur un octet ; d'autres noms passent, « HORZQ »
// par exemple, puisque les bits sortis de l'octet sont perdus). Les touches F8, 8, C et Z ne font
// quelque chose qu'avec ce mot levé. Vérifié en jeu : un joueur nommé HORZA qui presse C reçoit
// 50 000 et le message « C'EST VOUS VIENT D'UTILISER LE CHEAT MODE ».
//
// Les touches exercées par les cinq scénarios : R (de 320x200 à 640x480), F3, F4, F5 et Échap sans
// modificateur. Les autres l'ont été par des parties d'exploration, comparées appel par appel — sauf
// F8, 8, M et Alt+Échap : l'écran ou la question qu'elles ouvrent a sa propre boucle, dont aucune de
// ces parties ne sort, si bien que leur appel ne s'achève pas et n'est pas comparé. Restent aussi sans
// preuve le filtre des écrans, le clavier réduit ([0xB14C6]) et Ctrl+T (jeu en réseau).
export function clavierDuParc(jeu, modificateurs, touche) {
  const m8 = jeu.m8;
  modificateurs &= 0xFF;
  touche &= 0xFF;
  if (ECRANS_SANS_CLAVIER.has(mot(jeu, ECRAN))) return;

  if (m8[CLAVIER_REDUIT] === 1) {
    switch (touche) {
      case T_HAUT: ecrireMot(jeu, RANGEE, mot(jeu, RANGEE) - 1); ecrireMot(jeu, REDESSINER_CARTE, 1); break;
      case T_GAUCHE: ecrireMot(jeu, COLONNE, mot(jeu, COLONNE) - 1); ecrireMot(jeu, REDESSINER_CARTE, 1); break;
      case T_DROITE: ecrireMot(jeu, COLONNE, mot(jeu, COLONNE) + 1); ecrireMot(jeu, REDESSINER_CARTE, 1); break;
      case T_BAS: ecrireMot(jeu, RANGEE, mot(jeu, RANGEE) + 1); ecrireMot(jeu, REDESSINER_CARTE, 1); break;
      default: break;
    }
    jeu.appeler(RECADRER_CAMERA);
    return;
  }

  const triche = mot(jeu, TRICHE) !== 0;
  switch (touche) {
    // --- la vue -----------------------------------------------------------------------------------
    // Les flèches déplacent la caméra d'une case, puis la recadrent dans la carte.
    case T_HAUT:
      ecrireMot(jeu, RANGEE, mot(jeu, RANGEE) - 1);
      ecrireMot(jeu, REDESSINER_CARTE, 1);
      jeu.appeler(RECADRER_CAMERA);
      break;
    case T_GAUCHE:
      ecrireMot(jeu, COLONNE, mot(jeu, COLONNE) - 1);
      ecrireMot(jeu, REDESSINER_CARTE, 1);
      jeu.appeler(RECADRER_CAMERA);
      break;
    case T_BAS:
      ecrireMot(jeu, RANGEE, mot(jeu, RANGEE) + 1);
      ecrireMot(jeu, REDESSINER_CARTE, 1);
      jeu.appeler(RECADRER_CAMERA);
      break;
    case T_DROITE:
      ecrireMot(jeu, COLONNE, mot(jeu, COLONNE) + 1);
      jeu.appeler(RECADRER_CAMERA);              // ici avant la demande de redessin, comme l'original
      ecrireMot(jeu, REDESSINER_CARTE, 1);
      break;
    // Les touches Origine, Page haut, Fin et Page bas (7, 9, 1 et 3 du pavé) déplacent aussi la
    // caméra d'une case, sans la recadrer, mais s'arrêtent d'elles-mêmes : Origine à la colonne 4
    // (et non 0, anomalie : la vue ne peut plus revenir tout à fait à gauche par cette touche),
    // Page haut à la rangée 0, Page bas et Fin quand le bord de la carte entre dans l'écran.
    case T_ORIGINE:
      if (motSigne(jeu, COLONNE) > 4) ecrireMot(jeu, COLONNE, mot(jeu, COLONNE) - 1);
      ecrireMot(jeu, REDESSINER_CARTE, 1);
      break;
    case T_PAGE_BAS: {
      const colonnesVisibles = (ecran.largeur / mot(jeu, LARGEUR_TUILE)) | 0;
      if (motSigne(jeu, COLONNE) < 0x40 - colonnesVisibles) ecrireMot(jeu, COLONNE, mot(jeu, COLONNE) + 1);
      ecrireMot(jeu, REDESSINER_CARTE, 1);
      break;
    }
    case T_PAGE_HAUT:
      if (motSigne(jeu, RANGEE) > 0) ecrireMot(jeu, RANGEE, mot(jeu, RANGEE) - 1);
      ecrireMot(jeu, REDESSINER_CARTE, 1);
      break;
    case T_FIN: {
      if (motSigne(jeu, RANGEE) < 0x40 - rangeesVisibles(jeu)) ecrireMot(jeu, RANGEE, mot(jeu, RANGEE) + 1);
      ecrireMot(jeu, REDESSINER_CARTE, 1);
      break;
    }
    case T_R:                                    // CHANGEMENT DE RESOLUTION
      changerDeResolution(jeu);
      break;

    // --- le temps ---------------------------------------------------------------------------------
    // Les menus proposent quatre vitesses (OPTIONS, VITESSE, commandes 10 à 13 de 0x50CCD) : lent -2,
    // normal 0, rapide 1, ultra-rapide 20, c'est-à-dire un pas de simulation toutes les deux images,
    // puis 1, 2 et 21 pas par image (§ 5.3). F3 ralentit le jeu d'un cran, F4 l'accélère : la nouvelle
    // vitesse part dans un événement, que 0x2CCF8 applique en fin d'image. Aucune borne : depuis la
    // vitesse normale, F3 donne -1, qui fait un pas par image comme 0, puis -2, le lent, -3... ; F4
    // donne 1, le rapide, puis 2, 3... jusqu'au-delà de l'ultra-rapide. Les coches du menu (octets
    // 0xD775A à 0xD775D) ne suivent pas.
    case T_F3:
      posterEvenement(jeu, EV_VITESSE);
      posterValeur(jeu, mot(jeu, VITESSE) - 1);
      break;
    case T_F4:
      posterEvenement(jeu, EV_VITESSE);
      posterValeur(jeu, mot(jeu, VITESSE) + 1);
      break;
    case T_P:                                    // la pause : la boucle ne simule plus (pas de ligne de menu)
      m8[EN_PAUSE] = m8[EN_PAUSE] === 0 ? 1 : 0;
      break;

    // --- les écrans (menu AFFICHAGE) ---------------------------------------------------------------
    case T_F5: jeu.appeler(OUVRIR_FENETRE, 0xF); break;     // LISTE DES BOUTIQUES/STANDS
    case T_F6: jeu.appeler(OUVRIR_FENETRE, 0xE); break;     // LISTE DES ATTRACTIONS
    case T_F7: jeu.appeler(OUVRIR_FENETRE, 0x10); break;    // LISTE DU PERSONNEL
    case T_M:                                    // CARTE DU MONDE : un écran qui a sa propre boucle (0x560D2)
      jeu.appeler(0x560D2);
      ecrireMot(jeu, REDESSINER_CARTE, 1);
      break;
    case T_N: jeu.appeler(0x515A0); break;       // DEPARTEMENT DES RECHERCHES, l'écran 0x4E
    case T_S:
      if (modificateurs & MAJ) jeu.appeler(0x798D7);            // GESTION DES STOCKS, l'écran 0x52
      else if (modificateurs & ALT) posterEvenement(jeu, EV_SAUVER);
      else if (modificateurs & CTRL) jeu.appeler(0x4B11E);      // BOURSE, l'écran 0x44
      else basculerLeSon(jeu);
      break;
    case T_L:
      if (modificateurs & ALT) posterEvenement(jeu, EV_CHARGER);
      break;
    case T_ECHAP:
      // Alt+Échap, QUITTER (menu PARC), après confirmation (texte 0x40 de la table [0xD7BC0]) : la
      // partie est sauvegardée (0x2DF12(-1), save/<nom>.gy), puis 0x19EEE et 0x1A836 ferment le parc.
      // Échap seul reprend l'outil 8, le mode question (le « ? » de la barre d'outils, interface-parc.js).
      if (modificateurs & ALT) {
        const reponse = jeu.appeler(0x78E36, long(jeu, long(jeu, MESSAGES) + 0x100), 0);
        if ((reponse & 0xFFFF) === 1) {
          jeu.appeler(0x2DF12, -1);
          jeu.appeler(0x19EEE);
          jeu.appeler(0x1A836);
        }
      } else {
        ecrireMot(jeu, OUTIL, 8);
      }
      break;

    // --- le parc (menu PARC) -----------------------------------------------------------------------
    case T_O: ouvrirOuFermerLeParc(jeu); break;  // PARC OUVERT
    case T_F: {
      // FEUX D'ARTIFICE : l'octet +0x77 de la fiche du parc. Levé, il note l'heure (+0x78) et lance
      // 0x6D4B7 ; tant qu'il l'est, la boucle appelle 0x6D508 à chaque image (le tir, ses bruitages),
      // et 0x21681 en tient compte pour les visiteurs.
      const fiche = long(jeu, FICHE_DU_PARC);
      m8[fiche + 0x77] = m8[fiche + 0x77] === 0 ? 1 : 0;
      if (m8[fiche + 0x77] !== 0) {
        ecrireLong(jeu, fiche + 0x78, long(jeu, PAS_DE_SIMULATION));
        jeu.appeler(0x6D4B7);
      } else {
        ecrireLong(jeu, fiche + 0x78, -1);
      }
      break;
    }

    // --- la musique -------------------------------------------------------------------------------
    // [ et ] baissent et montent le volume de la musique ([0xB1513], de 0 à 127, par pas de 4),
    // quand il y a de la musique ([0xBA714]).
    case T_CROCHET_OUVRANT:
      if (m8[0xBA714] !== 0) {
        ecrireMot(jeu, 0xB1513, mot(jeu, 0xB1513) - 4);
        if (motSigne(jeu, 0xB1513) < 0) ecrireMot(jeu, 0xB1513, 0);
        jeu.appeler(0x11AD3, m8[0xB1513]);
      }
      break;
    case T_CROCHET_FERMANT:
      if (m8[0xBA714] !== 0) {
        ecrireMot(jeu, 0xB1513, mot(jeu, 0xB1513) + 4);
        if (motSigne(jeu, 0xB1513) > 0x7F) ecrireMot(jeu, 0xB1513, 0x7F);
        jeu.appeler(0x11AD3, m8[0xB1513]);
      }
      break;

    // --- des bascules --------------------------------------------------------------------------------
    case T_T:
      // Ctrl+T, en réseau seulement : un événement dont le rôle n'est pas établi ; la touche est
      // effacée. Maj+T, RENDRE TOUT PETIT (menu AFFICHAGE) : l'octet 0xD7762, et trois mots, 0xD6640,
      // 0xD6642 et 0xD667C, qui passent à 3, 4 et 8, ou à 0 ; leur effet sur le dessin n'est pas établi.
      if ((modificateurs & CTRL) && m8[JOUEURS_EN_RESEAU] > 1) {
        posterEvenement(jeu, EV_JOUEURS);
        m8[TOUCHE_DE_L_IMAGE] = 0;
        break;
      }
      if (modificateurs & MAJ) {
        m8[0xD7762] = m8[0xD7762] === 0 ? 1 : 0;
        const leve = m8[0xD7762] !== 0;
        ecrireMot(jeu, 0xD6640, leve ? 3 : 0);
        ecrireMot(jeu, 0xD6642, leve ? 4 : 0);
        ecrireMot(jeu, 0xD667C, leve ? 8 : 0);
      }
      break;
    case T_B:                                    // Maj+B, ACHAT BUS AUTO (menu OPTIONS), lu par 0x53F13
      if (modificateurs & MAJ) m8[0xD7763] = m8[0xD7763] === 0 ? 1 : 0;
      break;
    case T_BARRE_OBLIQUE:                        // CONSEILLER (menu OPTIONS), lu par la barre des messages 0x5CBDB
      m8[0xD778D] = m8[0xD778D] === 0 ? 1 : 0;
      break;

    // --- la triche (joueur HORZA) ------------------------------------------------------------------
    // F8 et 8 appellent ce que la boucle appelle pour les écrans 0x32 et 0x4C (0x44EA5, avec 2 ou 4) ;
    // ce qu'ils montrent n'est pas établi.
    case T_F8: if (triche) jeu.appeler(0x44EA5, 2); break;
    case T_HUIT: if (triche) jeu.appeler(0x44EA5, 4); break;
    case T_C:
      // De l'argent : 50 000, ou 15 536 avec Ctrl.
      if (triche) {
        posterEvenement(jeu, EV_ARGENT);
        posterValeur(jeu, (modificateurs & CTRL) ? 0x3CB0 : 0xC350);
      }
      break;
    case T_Z:
      // Chaque article d'un catalogue marqué d'un octet à 1 : vraisemblablement tout ce qui se
      // découvre par la recherche, d'un coup (non établi). Alt : le catalogue des attractions, en
      // 0xCCED0 (200 octets par article), Ctrl : celui des boutiques, en 0xD3C62 (0x6B octets), Maj :
      // celui des installations et décors, en 0xCCA70 (0x38 octets). Un catalogue finit au premier
      // article dont le mot +0x22 est nul.
      if ((modificateurs & ALT) && triche) toutDecouvrir(jeu, 0xCCED0, 0xC8, 0xC5);
      else if ((modificateurs & CTRL) && triche) toutDecouvrir(jeu, 0xD3C62, 0x6B, 0x66);
      else if ((modificateurs & MAJ) && triche) toutDecouvrir(jeu, 0xCCA70, 0x38, 0x35);
      break;

    default:
      break;                                     // pas de touche, ou une touche sans effet dans le parc
  }
}

// Les rangées de tuiles que montre l'écran : 400 lignes logiques en basse résolution, 480 en haute
// (les mêmes hauteurs que 0x184DF), arrondies à la tuile supérieure. (La largeur et la hauteur de
// l'écran de la haute résolution sont celles de `ecran`, grande-vue.js : 640 et 480 hors de la grande
// vue.)
function rangeesVisibles(jeu) {
  const hauteurEcran = (jeu.m8[MODE_AFFICHAGE] & 1) ? 400 : ecran.hauteur;
  const hauteurTuile = mot(jeu, HAUTEUR_TUILE);
  return ((hauteurTuile + hauteurEcran - 1) / hauteurTuile) | 0;
}

function toutDecouvrir(jeu, catalogue, taille, drapeau) {
  for (let article = catalogue; mot(jeu, article + 0x22) !== 0; article += taille) jeu.m8[article + drapeau] = 1;
}

// S sans modificateur : les bruitages ([0xBA721]) et la musique ([0xBA715]) s'allument ou s'éteignent,
// chacun seulement si le jeu en a ([0xBA720], [0xBA714]) ; sinon ils restent éteints.
function basculerLeSon(jeu) {
  const m8 = jeu.m8;
  m8[0xBA721] = m8[0xBA720] !== 0 && m8[0xBA721] === 0 ? 1 : 0;
  m8[0xBA715] = m8[0xBA714] !== 0 && m8[0xBA715] === 0 ? 1 : 0;
}

// O : le parc ouvre ou ferme ses portes (octet +0x18 de la fiche du parc). À l'ouverture, la musique
// en cours s'arrête (0x80990) et le morceau 0x13 démarre (0x80A20), puis 0x80568(0, 0x15, 3, [0xB14B4]).
// À la fermeture, 0x19334 passe en revue les objets du parc de type 4.
function ouvrirOuFermerLeParc(jeu) {
  const m8 = jeu.m8;
  const fiche = long(jeu, FICHE_DU_PARC);
  m8[fiche + 0x18] = m8[fiche + 0x18] === 0 ? 1 : 0;
  if (m8[fiche + 0x18] === 0) {
    jeu.appeler(0x19334);
    return;
  }
  if (mot(jeu, 0xBA71A) !== 0) jeu.appeler(0x80990);
  jeu.appeler(0x80A20, 0x13);
  jeu.appeler(0x80568, 0, 0x15, 3, m8[0xB14B4]);
}

// R : passer de 320x200 à 640x480, ou l'inverse (les scénarios ne font que l'aller ; le retour a été
// vérifié par une partie d'exploration). L'image s'éteint (0x4820D, par pas de 4), la carte vidéo
// change de mode (0x10D42, avec en [0xDE5F6] l'ancien mode), la vue est redessinée, puis l'image se
// rallume (0x48296) sur la palette du parc. Pendant tout le passage, [0xBECA4] est levé : le
// gestionnaire de souris ne trace plus le pointeur.
function changerDeResolution(jeu) {
  if (jeu.m8[MODES_VIDEO] !== 9) return;
  jeu.appeler(0x4820D, 4, long(jeu, PALETTE_DU_PARC));
  if (mot(jeu, MODE_AFFICHAGE) === 8) {
    ecrireLong(jeu, 0xBECA4, 1);
    ecrireMot(jeu, MODE_AFFICHAGE, 1);
    jeu.appeler(0x7EC50, long(jeu, PALETTE_DU_PARC));
    ecrireMot(jeu, MODE_AFFICHAGE, 8);
    jeu.appeler(0x10D42, 1);
  } else {
    ecrireLong(jeu, 0xBECA4, 1);
    ecrireMot(jeu, MODE_AFFICHAGE, 8);
    // L'original choisit ici entre 0x7EC50 et 0x7ECF0 selon le bit 1 du mode, qu'il vient de mettre
    // à 8 : c'est toujours 0x7ECF0.
    jeu.appeler(0x7ECF0, long(jeu, PALETTE_DU_PARC));
    // Le pilote de souris borné à 640x480 (0 à 638, 0 à 478), le pointeur au centre (§ 6.7).
    jeu.appeler(0x11303, 0, 0x27E, 0, 0x1DE);
    jeu.appeler(0x11191, 0x140, 0xC8);
    ecrireMot(jeu, 0xBEC94, 0x140);
    ecrireMot(jeu, 0xBEC96, 0xC8);
    ecrireMot(jeu, 0xB14E2, 0xFFFF);           // pas de tracé de chemin en cours
    ecrireMot(jeu, 0xB14E4, 0xFFFF);
    ecrireMot(jeu, MODE_AFFICHAGE, 1);
    jeu.appeler(0x10D42, 8);
    jeu.appeler(0x54CE4);                        // la grille des blocs vidée (ecran.js)
    ecrireMot(jeu, REDESSINER_CARTE, 1);
  }
  jeu.appeler(RECADRER_CAMERA);
  ecrireMot(jeu, REDESSINER_CARTE, 1);
  if (motSigne(jeu, BARRE_DE_MENUS) !== -1) jeu.appeler(FERMER_BARRE_DE_MENUS);
  jeu.appeler(POSER_PALETTE, PALETTE_AFFICHEE);  // encore noire : 0x4820D l'a vidée
  jeu.appeler(0x13B9A);
  if (jeu.m8[PANNEAU] !== 0) {
    jeu.appeler(0x50651);
    jeu.appeler(0x4DE1A, 0);
    jeu.appeler(0x5CBDB);
  }
  jeu.appeler(ATTENDRE_BALAYAGE);
  if (jeu.m8[MODE_AFFICHAGE] & 1) jeu.appeler(PRESENTER_BASSE, 0x190);
  else jeu.appeler(PRESENTER_HAUTE);
  jeu.appeler(0x48296, 4, long(jeu, PALETTE_DU_PARC));
  jeu.appeler(POSER_PALETTE, long(jeu, PALETTE_DU_PARC));
  ecrireLong(jeu, 0xBECA4, 0);
}

// =================================================================================================
// La vue
// =================================================================================================

// 0x13B9A — dessiner la vue du parc depuis la caméra, sur les rangées que montre l'écran.
//
// Le cadre de l'original, et ce qu'il y laisse : la hauteur de l'écran dans sa variable [ebp-4], et
// dans ebx la hauteur d'une tuile (0x13BC9, le diviseur du calcul des rangées), que 0x1B837 sauve en
// entrant. La barre des messages 0x5CBDB relira ce mot comme une variable jamais écrite (index.js,
// `resteRelu`, qui reconnaît cet appel à son adresse de retour : on le fait donc comme l'original).
//
// Hors du jeu d'origine : le défilement fluide (reglages.js), réglage allumé, relève ici la vue
// qui vient d'être dessinée, en lecture seule (vue-fluide.js). Éteint, cadrageDeLaVue rend null.
export const dessinerLaVue = dansLeCadre(4, (jeu, cadre) => {
  jeu.dv.setUint32(cadre.local(4), (jeu.m8[MODE_AFFICHAGE] & 1) ? 400 : 480, true);
  const rangees = s16(rangeesVisibles(jeu));
  const cadrage = cadrageDeLaVue(jeu);
  jeu.T.sauver();
  jeu.T.R.ebx = mot(jeu, HAUTEUR_TUILE);
  jeu.T.charger();
  jeu.appelerDepuis(0x13BEB, cadre.local(4), DESSINER_CARTE, motSigne(jeu, COLONNE), motSigne(jeu, RANGEE), rangees);
  if (cadrage) releverLaVue(jeu, cadrage);
});

// 0x1B229 — ne fait rien. La boucle l'appelle tant que le compteur de pas est sous 500, au début d'une
// partie : sans doute ce qui reste d'une fonction retirée à la compilation (non établi).
export function rienAuDebutDeLaPartie() {}

// =================================================================================================
// La palette
// =================================================================================================
//
// La palette de la carte vidéo (256 couleurs de trois composantes, de 0 à 63) est préparée dans
// PALETTE_AFFICHEE puis envoyée par 0x808B0. Les fondus la calculent pas à pas, d'une palette cible,
// par un niveau sur 256.

// 0x47D74 — destination = source × niveau / 256, composante par composante (le niveau est un mot).
export function assombrirLaPalette(jeu, destination, source, niveau) {
  niveau &= 0xFFFF;
  const m8 = jeu.m8;
  for (let i = 0; i < 0x300; i++) m8[destination + i] = (m8[source + i] * niveau) >> 8;
}

// 0x47D38 — assombrir de `obscurite` sur 256 (un octet) et poser la palette obtenue.
export function assombrirEtPoser(jeu, destination, source, obscurite) {
  jeu.appeler(0x47D74, destination, source, (0x100 - (obscurite & 0xFF)) & 0xFFFF);
  jeu.appeler(POSER_PALETTE, destination);
}

// 0x47DBA — un pas d'éclaircissement vers la palette cible : chaque composante devient
// cible × niveau / 256, sauf celles qui ont déjà atteint (ou dépassé) leur cible, qui la prennent.
// Puis on attend le balayage vertical et la palette part à la carte.
export function eclaircirVers(jeu, cible, courante, niveau) {
  niveau &= 0xFFFF;
  const m8 = jeu.m8;
  for (let i = 0; i < 0x300; i++) {
    const c = m8[courante + i], t = m8[cible + i];
    m8[courante + i] = c >= t ? t : (t * niveau) >> 8;
  }
  jeu.appeler(ATTENDRE_BALAYAGE);
  jeu.appeler(POSER_PALETTE, courante);
}

// 0x4820D — éteindre l'image : la palette s'assombrit par pas de `pas` sur 256 (4 pour la touche R :
// 64 palettes successives ; 8 à l'arrivée dans le parc, 0x7C32D : 32), envoyées aussitôt à la carte,
// sans attendre le balayage, puis devient noire. Un pas nul ne finirait jamais. L'original borne
// encore le niveau à 255 dans la boucle, où il est toujours sous 254 : sans effet.
export function eteindre(jeu, pas, palette) {
  pas &= 0xFF;
  for (let obscurite = 0; obscurite < 0xFE; obscurite = (obscurite + pas) & 0xFFFF) {
    jeu.appeler(COPIER, PALETTE_AFFICHEE, palette, 0x300);   // aussitôt recouverte par 0x47D38
    jeu.appeler(0x47D38, PALETTE_AFFICHEE, palette, obscurite);
  }
  jeu.appeler(REMPLIR, PALETTE_AFFICHEE, 0, 0x300);
  jeu.appeler(POSER_PALETTE, PALETTE_AFFICHEE);
}

// 0x48296 — rallumer l'image : depuis le noir, des pas d'éclaircissement (0x47DBA, un balayage chacun)
// de `pas` sur 256. Le dernier niveau reste sous 256 : l'appelant pose ensuite la palette exacte.
export function rallumer(jeu, pas, palette) {
  pas &= 0xFF;
  jeu.appeler(REMPLIR, PALETTE_AFFICHEE, 0, 0x300);
  for (let niveau = 0; niveau < 0x100; niveau = (niveau + pas) & 0xFFFF) {
    jeu.appeler(0x47DBA, palette, PALETTE_AFFICHEE, niveau);
  }
}

// Le fondu d'ouverture, mené une image à la fois par 0x1A706 : le niveau [0xD380C] (mot long, de 0 à
// 256) et le pas, l'octet [0xD777F] : 0 = fondu depuis le noir par pas de 12, plus de 1 = fondu par
// pas de cette valeur, 1 = terminé. La palette visée est pointée par [0xD35AC].
const NIVEAU_DU_FONDU = 0xD380C;
const PAS_DU_FONDU = 0xD777F;
const PALETTE_VISEE = 0xD35AC;
const METEO = 0xB14CC;               // octet : bit 0 la pluie, bit 2 l'orage (bit 1 : 0x47A27, non établi)

// 0x1A706 — un pas du fondu d'ouverture de la palette, à chaque image.
//
// Chaque pas éclaircit la palette affichée vers la palette visée (0x47DBA, qui attend le balayage),
// puis le niveau avance du pas ; passé 254, la palette visée est posée telle quelle et le fondu est
// terminé. Ceux qui changent le décor éteignent l'image, remettent le niveau à 0 et choisissent le
// pas : 8 à l'arrivée dans le parc (0x7C32D, 33 images), 12 à la fermeture d'un écran plein (0x5C04F)
// et dans 0x1AF83, 48 dans les écrans de fin d'année (0x7C36D, qui appelle lui-même 0x1A706), 255
// dans 0x5C7D1 ; 0x1A836 et 0x77A55 le mettent à 1. Le pas 0 — un fondu depuis le noir par pas de 12,
// arrêté d'un coup par mauvais temps ([0xB14CC] non nul : la palette posée, le niveau laissé à 1) —
// n'est que la valeur initiale de l'octet : dans les cinq scénarios, 0x1A836 l'a déjà remplacée au
// premier appel. Non exercé, vraisemblablement mort.
export function fonduDOuverture(jeu) {
  const m8 = jeu.m8;
  const pas = m8[PAS_DU_FONDU];
  const niveau = long(jeu, NIVEAU_DU_FONDU);
  if (niveau === 0 && pas === 0) {
    // première image : le noir
    jeu.appeler(REMPLIR, PALETTE_AFFICHEE, 0, 0x300);
    jeu.appeler(ATTENDRE_BALAYAGE);
    jeu.appeler(POSER_PALETTE, PALETTE_AFFICHEE);
    ecrireLong(jeu, NIVEAU_DU_FONDU, long(jeu, NIVEAU_DU_FONDU) + 12);
    return;
  }
  if (pas === 0) {
    if (niveau > 0xFE) {
      jeu.appeler(POSER_PALETTE, long(jeu, PALETTE_VISEE));
      m8[PAS_DU_FONDU] = 1;
    } else if (m8[METEO] !== 0) {
      ecrireLong(jeu, NIVEAU_DU_FONDU, 1);
      m8[PAS_DU_FONDU] = 1;
      jeu.appeler(POSER_PALETTE, long(jeu, PALETTE_VISEE));
    } else {
      jeu.appeler(0x47DBA, long(jeu, PALETTE_VISEE), PALETTE_AFFICHEE, niveau & 0xFFFF);
      ecrireLong(jeu, NIVEAU_DU_FONDU, long(jeu, NIVEAU_DU_FONDU) + 12);
    }
    return;
  }
  if (pas <= 1) return;                          // fondu terminé
  if (niveau > 0xFE) {
    jeu.appeler(POSER_PALETTE, long(jeu, PALETTE_VISEE));
    m8[PAS_DU_FONDU] = 1;
  } else {
    jeu.appeler(0x47DBA, long(jeu, PALETTE_VISEE), PALETTE_AFFICHEE, niveau & 0xFFFF);
    ecrireLong(jeu, NIVEAU_DU_FONDU, long(jeu, NIVEAU_DU_FONDU) + m8[PAS_DU_FONDU]);
  }
}

// =================================================================================================
// La pluie et l'orage
// =================================================================================================

const BAS_DE_LA_VUE = 0xB9401;       // mot signé : la pluie ne tombe pas plus bas (le haut du panneau)
const ECLAIR_EN_COURS = 0xB918C;     // mot : 0, ou l'image de l'éclair en cours (1 à 3)
const IMAGES_SANS_ECLAIR = 0xB9188;  // mot : images depuis le dernier éclair
const PROCHAIN_ECLAIR = 0xB918A;     // mot : l'éclair suivant part quand le compte le dépasse
const COULEUR_DE_LA_PLUIE = 0xC0;    // la tête de la goutte ; sa traînée prend les couleurs suivantes

// 0x47606 — la pluie et l'orage, à chaque image.
//   (gouttes, longueur, vent, periodeEclairs, tonnerre, eclairs, obscurite)
//
// La boucle l'appelle pour la pluie ([0xB14CC] bit 0) avec (180, 6, vent, 0, 0, 0, 0), pour l'orage
// (bit 2) avec (180, 6, vent, 50, 1, 2, 150) ; le vent est l'octet signé [0xB14CB].
//
// Chaque goutte naît à un endroit tiré au hasard (x de 0 à 637, y de 0 à 479, en coordonnées
// logiques) et laisse une traînée de `longueur` points, qui descend de 2 lignes et dérive de deux
// fois le vent à chaque point, dans les couleurs 0xC0, 0xC1... Rien n'est dessiné sous le haut du
// panneau. Le test des bords gauche et droit est toujours vrai (anomalie : « x + vent > 0 ou
// x + vent < 640 », au lieu de « et ») : les routines de point, qui écartent elles-mêmes ce qui sort
// de l'écran, rattrapent l'erreur. En 640x480, chaque point est marqué dans la grille des blocs.
//
// L'orage : un éclair part quand le compte des images passe le délai tiré au hasard après le précédent
// (de 0 à periodeEclairs - 1 ; 100 images pour le premier, valeur initiale de [0xB918A]). Il dure trois
// images : `eclairs` traits de foudre (0x47E39) à la première, puis le tonnerre (le bruitage 0,
// 0x80FE0) et de nouveaux traits aux deux suivantes. Entre les éclairs, la palette du parc, ramenée
// à (256 - obscurite)/256 de sa lumière (106/256 pour l'orage), est reposée à chaque image.
// Aucun des cinq scénarios n'a d'orage : il a été vérifié appel par appel en forçant [0xB14CC]
// (et le vent [0xB14CB]), en 320x200 et en 640x480.
export function pluieEtOrage(jeu, gouttes, longueur, vent, periodeEclairs, tonnerre, eclairs, obscurite) {
  gouttes &= 0xFFFF;
  longueur &= 0xFFFF;
  vent = s8(vent);
  periodeEclairs = s16(periodeEclairs);
  tonnerre &= 0xFF;
  eclairs &= 0xFF;
  obscurite &= 0xFF;
  const basseResolution = (jeu.m8[MODE_AFFICHAGE] & 1) !== 0;
  const point = (x, y, couleur) => {
    if (basseResolution) {
      jeu.appeler(0x80C00, x, y, couleur);
    } else {
      jeu.appeler(0x54D38, x, y, 1, 1);
      jeu.appeler(0x80C40, x, y, couleur);
    }
  };

  for (let goutte = 0; goutte < gouttes; goutte++) {
    let x = (jeu.appeler(HASARD) & 0xFFFF) % (ecran.largeur - 2);
    const y = (jeu.appeler(HASARD) & 0xFFFF) % ecran.hauteur;
    if (y < motSigne(jeu, BAS_DE_LA_VUE) - 1) point(x, y, COULEUR_DE_LA_PLUIE);
    for (let k = 1; k < longueur; k++) {
      x = s16(x + 2 * vent);
      // (ici le test des bords horizontaux, toujours vrai)
      if (y + 2 * k >= motSigne(jeu, BAS_DE_LA_VUE)) continue;
      point(x, s16(y + 2 * k), s16(COULEUR_DE_LA_PLUIE + k));
    }
  }

  if (periodeEclairs <= 0) return;
  const tonnerreEtFoudre = () => {
    if (tonnerre === 0) return;
    for (let k = 0; k < eclairs; k++) jeu.appeler(0x47E39, 0xA, (jeu.appeler(HASARD) & 0xFFFF) % 0x1B, 5);
  };
  if (mot(jeu, ECLAIR_EN_COURS) !== 0) {
    jeu.appeler(ATTENDRE_BALAYAGE);
    ecrireMot(jeu, ECLAIR_EN_COURS, mot(jeu, ECLAIR_EN_COURS) + 1);
    jeu.appeler(0x80FE0, 0, 0xF);
    tonnerreEtFoudre();
    if (mot(jeu, ECLAIR_EN_COURS) > 2) ecrireMot(jeu, ECLAIR_EN_COURS, 0);
    return;
  }
  if (mot(jeu, IMAGES_SANS_ECLAIR) > mot(jeu, PROCHAIN_ECLAIR)) {
    jeu.appeler(ATTENDRE_BALAYAGE);
    tonnerreEtFoudre();
    ecrireMot(jeu, IMAGES_SANS_ECLAIR, 0);
    ecrireMot(jeu, PROCHAIN_ECLAIR, ((jeu.appeler(HASARD) & 0xFFFF) % periodeEclairs) | 0);
    ecrireMot(jeu, ECLAIR_EN_COURS, 1);
    return;
  }
  if (obscurite !== 0) {
    jeu.appeler(COPIER, PALETTE_AFFICHEE, long(jeu, PALETTE_DU_PARC), 0x300);
    jeu.appeler(0x47D38, PALETTE_AFFICHEE, long(jeu, PALETTE_DU_PARC), obscurite);
  }
  ecrireMot(jeu, IMAGES_SANS_ECLAIR, mot(jeu, IMAGES_SANS_ECLAIR) + 1);
}

// =================================================================================================
// La démonstration
// =================================================================================================

const IMAGE_DE_LA_DEMO = 0xD787C;    // mot long : images depuis le début de la démonstration
const SOURIS_AU_DEPART_X = 0xD660A;  // mots : la position de la souris quand la démonstration a commencé
const SOURIS_AU_DEPART_Y = 0xD660C;
const FIN_DE_LA_DEMO = 0x5B82A;      // retour au menu principal

// Les étapes de la visite : à l'image 2 le parc de la démonstration est rechargé, puis toutes les
// 500 images la caméra saute à un nouvel endroit (colonne, rangée) ; à l'image 6 000, la
// démonstration s'arrête.
const ETAPES_DE_LA_VISITE = new Map([
  [498, [0x1B, 0x34]], [998, [0x28, 0x2C]], [1498, [0x32, 0x18]], [1998, [0x1B, 0x17]],
  [2498, [0x31, 0x00]], [2998, [0x1A, 0x25]], [3498, [0x0C, 0x29]], [3998, [0x05, 0x2D]],
  [4498, [0x08, 0x17]], [4998, [0x1F, 0x18]], [5498, [0x36, 0x18]],
]);

// 0x5B5D0 — la visite guidée de la démonstration, une image.
//
// Au moindre geste du joueur (un bouton, une touche, la souris qui bouge), la démonstration s'arrête
// (0x5B82A remet aussi le compteur d'images à zéro). Le compteur est ensuite avancé, et la caméra
// posée selon l'étape, puis recadrée.
// Exercé par demo.json jusqu'à l'étape 998 (140 s) ; le reste de la visite et son arrêt, au bout des
// 6 000 images ou par un geste (la souris, une touche), l'a été par la même partie prolongée à 330 s
// et par deux variantes, comparées appel par appel.
export function visiteDeLaDemo(jeu) {
  if (gesteDuJoueur(jeu)) jeu.appeler(FIN_DE_LA_DEMO);
  const image = long(jeu, IMAGE_DE_LA_DEMO);
  ecrireLong(jeu, IMAGE_DE_LA_DEMO, image + 1);
  const etape = (image - 2) >>> 0;
  if (etape === 0) {
    jeu.appeler(0x2E035, -2);                    // recharger le parc de la démonstration, save/DEMO.GY
    ecrireMot(jeu, 0xB14C2, 0);
  } else if (etape === 5998) {
    jeu.appeler(FIN_DE_LA_DEMO);
  } else if (ETAPES_DE_LA_VISITE.has(etape)) {
    const [colonne, rangee] = ETAPES_DE_LA_VISITE.get(etape);
    ecrireMot(jeu, COLONNE, colonne);
    ecrireMot(jeu, RANGEE, rangee);
    ecrireMot(jeu, REDESSINER_CARTE, 1);
  }
  jeu.appeler(RECADRER_CAMERA);
}

function gesteDuJoueur(jeu) {
  return mot(jeu, GAUCHE_MAINTENU) !== 0 || mot(jeu, DROIT_MAINTENU) !== 0 || jeu.m8[TOUCHE_DE_L_IMAGE] !== 0
    || mot(jeu, SOURIS_AU_DEPART_X) !== mot(jeu, SOURIS_X) || mot(jeu, SOURIS_AU_DEPART_Y) !== mot(jeu, SOURIS_Y);
}

// La visite touche au tas quand elle recharge le parc ou arrête la démonstration.
function zonesDeLaVisite(jeu) {
  const etape = (long(jeu, IMAGE_DE_LA_DEMO) - 2) >>> 0;
  return gesteDuJoueur(jeu) || etape === 0 || etape === 5998 ? auDelaDeLaPile(jeu) : [];
}

// =================================================================================================
// La barre de menus déroulants
// =================================================================================================
//
// Une barre en haut de l'écran, avec des menus qui se déroulent et des sous-menus. Elle s'ouvre par un
// clic dans la bande du haut de l'écran du parc (la zone 30 de la table 0xB93C3 : 0x15FBD et 0x1788D
// appellent 0x4FCC5) et se referme au premier clic ailleurs. Aucun des cinq scénarios ne l'ouvre ;
// elle a été vérifiée par des parties d'exploration, dans les deux résolutions.
//
// Ce qu'elle contient, relevé en mémoire (version française) : PARC (RECOMMENCER, CHARGER et SAUVER,
// qui déroulent les dix emplacements JEU 00 à JEU 09, PARC OUVERT O, FEUX D'ARTIFICE F, QUITTER
// ALT ESC) ; OPTIONS (EFFETS SONORES et MUSIQUE, actives seulement s'il y a une carte son, CONSEILLER /,
// ACHAT BUS AUTO SHIFT B, les trois niveaux MATERNELLE, SIMULATION et BUSINESS, VITESSE, qui déroule
// LENT, NORMAL, RAPIDE et ULTRA-RAPIDE) ; AFFICHAGE (CHANGEMENT DE RESOLUTION R, les achats
// d'attractions, de boutiques, de décors et l'embauche, les listes F5, F6 et F7, CARTE DU PARC, BANQUE,
// RELEVE DE BANQUE, STATUT DU PARC, GESTION DES STOCKS SHIFT S, DEPARTEMENT DES RECHERCHES N, JEU,
// BOURSE CTRL S, CARTE DU MONDE M, RENDRE TOUT PETIT SHIFT T).
//
//  - [0xB14D2] (mot signé) : -1 = pas de barre ; sinon le rang de son premier titre dans la table
//    0xB53B6, 4 octets par titre : le numéro du menu (mot), le numéro du texte (mot, -1 = fin).
//  - [0xB14D4] (mot signé) : le menu déroulé, -1 = aucun.
//  - Les menus, en 0xB53C6, 0x354 octets chacun : le rectangle (x0, y0, x1, y1, mots signés), un mot
//    à +8 (écrit par 0x503DA), la ligne en surbrillance à +0xA (mot, -1 = aucune), puis les lignes à
//    +0xC, 0x15 octets chacune : le sous-menu (mot, -1 = aucun), le texte (mot, -1 = fin du menu),
//    des indicateurs à +4 (bit 1 : un filet sous la ligne), à +9 un pointeur vers l'octet qui rend
//    la ligne active (0 = toujours active), la commande à +0xD (un pointeur de fonction) avec son
//    argument à +0x11 (mot), et à +0x13, +0x14 les modificateurs et la touche qu'elle simule.
//  - [0xD3824] : le menu sous le pointeur, -1 = aucun.
//  - Les proportions : [0xD7793] l'échelle (2 en 320x200, 1 en 640x480), [0xD7794] la marge de gauche,
//    [0xD6620] la hauteur d'une ligne, [0xD7797] et [0xD7791] les deux couleurs (0x50366 les pose).
//
// Une commande choisie n'est pas exécutée tout de suite : la boucle l'appelle en fin d'image, depuis
// [0xD3828] (son argument en [0xD6622]) ; une ligne qui simule une touche y met 0x13BF3, avec les
// modificateurs et la touche en [0xD7789] et [0xD7788]. Les fonctions employées : 0x50CCD pour les
// réglages (les sons, les trois niveaux, les quatre vitesses, RECOMMENCER, le retour à la vue),
// 0x35F21 pour les fenêtres et les écrans, 0x2E035 et 0x2DF12 pour les dix emplacements de
// sauvegarde, 0x77A55 pour le relevé de banque.

const BARRE_DE_MENUS = 0xB14D2;
const MENU_DEROULE = 0xB14D4;
const TITRES = 0xB53B6;
const MENUS = 0xB53C6, TAILLE_MENU = 0x354, TAILLE_LIGNE = 0x15;
const MENU_SOUS_LE_POINTEUR = 0xD3824;
const ECHELLE = 0xD7793, MARGE = 0xD7794, HAUTEUR_LIGNE = 0xD6620;
const COULEUR_BARRE = 0xD7797, COULEUR_TITRE = 0xD7791;
const COMMANDE_DIFFEREE = 0xD3828, ARGUMENT_DIFFERE = 0xD6622;

const texteDuTitre = (jeu, titre) => long(jeu, long(jeu, TEXTES) + 4 * motSigne(jeu, titre + 2));

// 0x4FD85 — la barre de menus, à chaque image : quel menu se déroule, quelle ligne s'allume, quelle
// commande part.
//
// À l'ouverture de la barre, l'outil choisi est mis de côté (0x4FD2D le reprendra) et le pointeur
// redevient une flèche. Les titres sont parcourus de gauche à droite : celui que survole le pointeur
// déroule son menu, placé sous lui. Puis les menus déroulés, du premier au dernier sous-menu ouvert,
// désignent le menu sous le pointeur, dont la ligne survolée s'allume (et déroule son sous-menu).
// Un clic hors des menus referme la barre. Un clic sur une ligne sans sous-menu choisit sa commande ;
// un clic gauche referme en plus la barre.
//
// Anomalie : le clic choisit, dans le menu sous le pointeur, la ligne du rang qu'a la ligne allumée du
// dernier sous-menu ouvert. Les deux ne diffèrent que dans l'image où le pointeur passe d'un sous-menu
// à une autre ligne de son menu parent — l'image suivante, la chaîne des sous-menus est refaite. Une
// souris qui saute (un clic livré avec le mouvement) y tombe : vérifié en jeu, un clic sur SIMULATION
// venant de la ligne NORMAL du sous-menu des vitesses exécute la deuxième ligne d'OPTIONS, MUSIQUE.
export function gererLaBarreDeMenus(jeu) {
  const m8 = jeu.m8;
  if (motSigne(jeu, BARRE_DE_MENUS) === -1) return;
  if (mot(jeu, OUTIL) !== 0) {
    ecrireMot(jeu, OUTIL_MIS_DE_COTE, mot(jeu, OUTIL));
    ecrireMot(jeu, OUTIL, 0);
    // l'outil vaut 0 : le pointeur reprend la flèche (la table 0xB52C1 donne l'image de chaque outil,
    // la table [0xD3B84] les images, 6 octets chacune)
    jeu.appeler(CURSEUR, long(jeu, 0xD3B84) + 6 * m8[0xB52C1 + mot(jeu, OUTIL)]);
  }

  // Les titres : le survol de l'un d'eux déroule son menu.
  let x = m8[MARGE];
  for (let titre = TITRES + 4 * motSigne(jeu, BARRE_DE_MENUS); motSigne(jeu, titre + 2) !== -1; titre += 4) {
    const largeur = jeu.appeler(LARGEUR_TEXTE, texteDuTitre(jeu, titre));
    const e = m8[ECHELLE];
    const survole = motSigne(jeu, SOURIS_Y) <= 2 * motSigne(jeu, HAUTEUR_LIGNE) + 2 * e
      && motSigne(jeu, SOURIS_X) >= s16(x)
      && motSigne(jeu, SOURIS_X) <= s16(x) + s16(largeur) + 4 * e;
    if (survole && mot(jeu, MENU_DEROULE) !== mot(jeu, titre)) {
      ecrireMot(jeu, MENU_DEROULE, mot(jeu, titre));
      const menu = MENUS + TAILLE_MENU * motSigne(jeu, MENU_DEROULE);
      ecrireMot(jeu, menu, x - 2 * m8[ECHELLE]);
      ecrireMot(jeu, menu + 2, 2 * mot(jeu, HAUTEUR_LIGNE) + m8[ECHELLE]);
      ecrireMot(jeu, menu + 4, x - 2 * m8[ECHELLE]);
      jeu.appeler(PLACER_MENU, menu);
    }
    x = s16(x + 9 * m8[ECHELLE] + largeur);
  }

  // Les menus déroulés, en suivant les sous-menus des lignes allumées : le dernier qui contient le
  // pointeur est le menu sous le pointeur.
  ecrireLong(jeu, MENU_SOUS_LE_POINTEUR, -1);
  let dernier = -1;
  if (motSigne(jeu, MENU_DEROULE) !== -1) {
    let menu = MENUS + TAILLE_MENU * motSigne(jeu, MENU_DEROULE);
    for (;;) {
      dernier = menu;
      const sx = motSigne(jeu, SOURIS_X), sy = motSigne(jeu, SOURIS_Y);
      if (sx > motSigne(jeu, menu) && sx < motSigne(jeu, menu + 4)
        && sy > motSigne(jeu, menu + 2) && sy < motSigne(jeu, menu + 6)) {
        ecrireLong(jeu, MENU_SOUS_LE_POINTEUR, menu);
      }
      const allumee = mot(jeu, menu + 0xA);
      if (allumee === 0xFFFF) break;
      const ligne = menu + 0xC + TAILLE_LIGNE * allumee;
      if (motSigne(jeu, ligne) === -1) break;
      menu = MENUS + TAILLE_MENU * mot(jeu, ligne);
    }
  }

  const sousLePointeur = long(jeu, MENU_SOUS_LE_POINTEUR);
  if (sousLePointeur === 0xFFFFFFFF) {
    // Hors des menus : plus de ligne allumée, et un clic referme la barre.
    if (dernier !== -1) ecrireMot(jeu, dernier + 0xA, 0xFFFF);
    if (mot(jeu, APPUI_GAUCHE) !== 0 || mot(jeu, APPUI_DROIT) !== 0) {
      jeu.appeler(FERMER_BARRE_DE_MENUS);
      oublierLesBoutons(jeu);
    }
    return;
  }

  // Les lignes du menu sous le pointeur : celle qu'il survole s'allume. (Comme l'original, on relit
  // [0xD3824] à chaque usage.)
  const menu = () => long(jeu, MENU_SOUS_LE_POINTEUR);
  let y = (mot(jeu, sousLePointeur + 2) + 3 * m8[ECHELLE]) & 0xFFFF;
  for (let ligne = sousLePointeur + 0xC; motSigne(jeu, ligne + 2) !== -1; ligne += TAILLE_LIGNE) {
    const e = m8[ECHELLE];
    const sx = motSigne(jeu, SOURIS_X), sy = motSigne(jeu, SOURIS_Y);
    const survolee = sx > motSigne(jeu, menu()) && sx < motSigne(jeu, menu() + 4)
      && sy >= s16(y) && sy < s16(y) + e * motSigne(jeu, HAUTEUR_LIGNE) - e;
    if (survolee) {
      const condition = long(jeu, ligne + 9);
      if (condition !== 0 && m8[condition] === 0) {
        // une ligne inactive : rien d'allumé, et le clic est perdu
        ecrireMot(jeu, menu() + 0xA, 0xFFFF);
        if (mot(jeu, APPUI_GAUCHE) !== 0 || mot(jeu, APPUI_DROIT) !== 0) oublierLesBoutons(jeu);
      } else {
        ecrireMot(jeu, menu() + 0xA, (((ligne - menu()) & 0xFFFF) / TAILLE_LIGNE) | 0);
        if (motSigne(jeu, ligne) !== -1) {
          // la ligne a un sous-menu : il se déroule à côté, à sa hauteur
          const sousMenu = () => MENUS + TAILLE_MENU * motSigne(jeu, ligne);
          ecrireMot(jeu, sousMenu(), mot(jeu, menu()));
          ecrireMot(jeu, sousMenu() + 4, mot(jeu, menu() + 4));
          ecrireMot(jeu, sousMenu() + 2, y - 2 * m8[ECHELLE]);
          jeu.appeler(PLACER_MENU, sousMenu());
        }
      }
    }
    y = (y + ((m8[ECHELLE] * motSigne(jeu, HAUTEUR_LIGNE)) & 0xFFFF)) & 0xFFFF;
    if (m8[ligne + 4] & 2) y = (y + 2 * m8[ECHELLE]) & 0xFFFF;
  }

  // Le clic : sur la ligne allumée (voir l'anomalie plus haut).
  if (motSigne(jeu, dernier + 0xA) === -1) {
    oublierLesBoutons(jeu);
    return;
  }
  const choisie = menu() + 0xC + TAILLE_LIGNE * motSigne(jeu, dernier + 0xA);
  if (mot(jeu, APPUI_GAUCHE) === 0 && mot(jeu, APPUI_DROIT) === 0) return;
  if (motSigne(jeu, choisie) === -1) {
    if (m8[choisie + 0x14] !== 0) {
      ecrireLong(jeu, COMMANDE_DIFFEREE, 0x13BF3);
      m8[0xD7789] = m8[choisie + 0x13];
      m8[0xD7788] = m8[choisie + 0x14];
    } else {
      ecrireLong(jeu, COMMANDE_DIFFEREE, long(jeu, choisie + 0xD));
      ecrireMot(jeu, ARGUMENT_DIFFERE, mot(jeu, choisie + 0x11));
    }
    if (mot(jeu, APPUI_GAUCHE) !== 0) jeu.appeler(FERMER_BARRE_DE_MENUS);
  }
  oublierLesBoutons(jeu);
}

// 0x50651 — dessiner la barre de menus et ses menus déroulés.
//
// Sans barre, seul le haut de l'écran compte : quand le pointeur y entre (au-dessus de [0xB9531]),
// 0x4E2DB dessine une rangée d'images sur toute la largeur (vraisemblablement ce qui invite à ouvrir
// la barre). Avec la barre : un bandeau, un filet noir dessous, les titres (celui du menu déroulé en
// surbrillance), puis le menu déroulé et chacun de ses sous-menus ouverts (0x508A3).
//
// Le cadre de l'original (`enter 0x18`) : l'octet bas du retour du trait reste dans sa variable
// [ebp-0x18], que la barre des messages 0x5CBDB relit ensuite (index.js, `resteRelu`).
export const dessinerLaBarreDeMenus = dansLeCadre(0x18, (jeu, cadre) => {
  const m8 = jeu.m8;
  if (motSigne(jeu, BARRE_DE_MENUS) === -1) {
    if (motSigne(jeu, SOURIS_Y) < motSigne(jeu, 0xB9531)) jeu.appeler(0x4E2DB);
    return;
  }
  const bas = s16(2 * mot(jeu, HAUTEUR_LIGNE) + 2);
  jeu.appeler(RECTANGLE, 0, 0, ecran.largeur, bas, m8[COULEUR_BARRE]);
  m8[cadre.local(0x18)] = jeu.appeler((m8[MODE_AFFICHAGE] & 1) ? 0x949BC : 0x949DA, 0, bas, ecran.largeur, bas, 0) & 0xFF;   // un trait

  let x = m8[MARGE];
  for (let titre = TITRES + 4 * motSigne(jeu, BARRE_DE_MENUS); motSigne(jeu, titre + 2) !== -1; titre += 4) {
    const largeur = jeu.appeler(LARGEUR_TEXTE, texteDuTitre(jeu, titre));
    let couleur;
    if (mot(jeu, MENU_DEROULE) === mot(jeu, titre)) {
      const e = m8[ECHELLE];
      jeu.appeler(RECTANGLE, s16(x), 0, s16(3 * e + largeur), s16(2 * mot(jeu, HAUTEUR_LIGNE) + e), m8[COULEUR_TITRE]);
      couleur = m8[COULEUR_BARRE];
    } else {
      couleur = m8[COULEUR_TITRE];
    }
    const e = m8[ECHELLE];
    jeu.appeler(ECRIRE_TEXTE, s16(2 * e + x), s16(6 - e * e), texteDuTitre(jeu, titre), 0, couleur);
    x = s16(x + 9 * m8[ECHELLE] + largeur);
  }

  if (motSigne(jeu, MENU_DEROULE) === -1) return;
  let menu = MENUS + TAILLE_MENU * motSigne(jeu, MENU_DEROULE);
  for (;;) {
    jeu.appeler(DESSINER_MENU, menu);
    const allumee = motSigne(jeu, menu + 0xA);
    if (allumee === -1) break;
    const sousMenu = motSigne(jeu, menu + 0xC + TAILLE_LIGNE * allumee);
    if (sousMenu === -1) break;
    menu = MENUS + TAILLE_MENU * sousMenu;
  }
});

// =================================================================================================
// Les fenêtres
// =================================================================================================
//
// Les catalogues surgissants : un clic droit sur une icône de la barre d'outils (0x1788D appelle
// 0x6A85C ou 0x6AA49) ouvre par-dessus le parc la grille des attractions, des boutiques, des décors ou
// du personnel, avec leurs prix. Le survol d'un article en montre le nom dans le titre (0x6AE91) ; le
// clic gauche le prend en main (il devient l'outil) et referme la fenêtre ; le clic droit ouvre sa
// fiche (0x35F21) et referme aussi.
//
// La liste des fenêtres ouvertes, en 0xD6BCE, 0x24F octets chacune : le rectangle (x, y, largeur,
// hauteur, mots signés), le type à +9 (4 = une fenêtre qui laisse passer la souris hors d'elle ; toute
// autre la capture entière), les lignes à +0x12, 13 octets chacune (l'outil qu'elle choisit, mot ; la
// valeur qu'elle donne, octet +2 ; des indicateurs, octet +3, bit 0 : ligne inactive), à +0x217 une
// fenêtre à ouvrir au clic droit (mot, 0 = aucune), à +0x219 le pointeur où écrire la valeur de la
// ligne, à +0x249 la fenêtre suivante de la liste (mot, -1 = fin), à +0x24D la ligne survolée (mot,
// -6 = aucune). [0xB14B9] est la première fenêtre de la liste (-1 = aucune) ; [0xB14BD] celle sous le
// pointeur. Aucun des cinq scénarios n'ouvre de fenêtre : le reste a été vérifié par une partie
// d'exploration (survol, clic gauche, clic droit).

const FENETRES = 0xD6BCE, TAILLE_FENETRE = 0x24F, TAILLE_LIGNE_FENETRE = 0xD;
const PREMIERE_FENETRE = 0xB14B9;
const FENETRE_SOUS_LE_POINTEUR = 0xB14BD;
const AUCUNE_LIGNE = -6;

const fenetreSousLePointeur = (jeu) => FENETRES + TAILLE_FENETRE * motSigne(jeu, FENETRE_SOUS_LE_POINTEUR);
const ligneSurvolee = (jeu) => {
  const f = fenetreSousLePointeur(jeu);
  return f + TAILLE_LIGNE_FENETRE * motSigne(jeu, f + 0x24D);
};

// 0x6B9CB — la souris dans les fenêtres, à chaque image : quelle fenêtre est sous le pointeur, quelle
// ligne il survole, et le clic sur cette ligne.
//
// Un clic gauche sur une ligne active écrit sa valeur là où la fenêtre le demande et choisit son
// outil ; si [0xB14BF] est levé, la fenêtre se referme (0x6A912). Un clic droit, si la fenêtre en
// prévoit une, écrit de même la valeur et ouvre une autre fenêtre, puis referme celle-ci.
// Rien de tout cela quand [0xB14C7] n'est pas -1. Ces deux octets ne sont écrits nulle part dans le
// programme : [0xB14C7] vaut toujours -1 et [0xB14BF] 0xFF, leurs valeurs initiales. Leur rôle n'est
// pas établi.
export function sourisDansLesFenetres(jeu) {
  const m8 = jeu.m8;
  if (motSigne(jeu, FENETRE_SOUS_LE_POINTEUR) !== -1) {
    ecrireMot(jeu, fenetreSousLePointeur(jeu) + 0x24D, AUCUNE_LIGNE);
    ecrireMot(jeu, FENETRE_SOUS_LE_POINTEUR, 0xFFFF);
  }
  if (motSigne(jeu, 0xB14C7) !== -1) return;

  for (let f = mot(jeu, PREMIERE_FENETRE); f !== 0xFFFF; f = mot(jeu, FENETRES + TAILLE_FENETRE * f + 0x249)) {
    const fenetre = FENETRES + TAILLE_FENETRE * f;
    if (m8[fenetre + 9] !== 4) { ecrireMot(jeu, FENETRE_SOUS_LE_POINTEUR, f); break; }
    const sx = motSigne(jeu, SOURIS_X), sy = motSigne(jeu, SOURIS_Y);
    const x = motSigne(jeu, fenetre), y = motSigne(jeu, fenetre + 2);
    if (sx >= x && sx <= x + motSigne(jeu, fenetre + 4) && sy >= y && sy <= y + motSigne(jeu, fenetre + 6)) {
      ecrireMot(jeu, FENETRE_SOUS_LE_POINTEUR, f);
      break;
    }
  }
  if (motSigne(jeu, FENETRE_SOUS_LE_POINTEUR) === -1) return;

  jeu.appeler(0x6AE91, mot(jeu, FENETRE_SOUS_LE_POINTEUR));   // la ligne survolée
  if (motSigne(jeu, fenetreSousLePointeur(jeu) + 0x24D) === AUCUNE_LIGNE) return;

  if (mot(jeu, APPUI_GAUCHE) !== 0) {
    if (!(m8[ligneSurvolee(jeu) + 0x15] & 1)) {
      ecrireMot(jeu, long(jeu, fenetreSousLePointeur(jeu) + 0x219), m8[ligneSurvolee(jeu) + 0x14]);
      ecrireMot(jeu, OUTIL, mot(jeu, ligneSurvolee(jeu) + 0x12));
      if (m8[0xB14BF] !== 0) jeu.appeler(0x6A912, mot(jeu, FENETRE_SOUS_LE_POINTEUR));
    }
    ecrireMot(jeu, GAUCHE_MAINTENU, 0);
    ecrireMot(jeu, APPUI_GAUCHE, 0);
    return;
  }
  if (mot(jeu, APPUI_DROIT) === 0) return;
  if (mot(jeu, fenetreSousLePointeur(jeu) + 0x217) === 0) return;
  ecrireMot(jeu, long(jeu, fenetreSousLePointeur(jeu) + 0x219), m8[ligneSurvolee(jeu) + 0x14]);
  jeu.appeler(OUVRIR_FENETRE, mot(jeu, fenetreSousLePointeur(jeu) + 0x217));
  ecrireMot(jeu, APPUI_DROIT, 0);
  ecrireMot(jeu, DROIT_MAINTENU, 0);
  jeu.appeler(0x6A912, mot(jeu, FENETRE_SOUS_LE_POINTEUR));
}

// =================================================================================================

// Les zones déclarées à la comparaison appel par appel : ce que la fonction écrit hors des variables du
// jeu, de la mémoire vidéo et des tampons d'image. Une touche peut charger, sauvegarder, changer de
// mode vidéo ou ouvrir un écran : tout le tas. Le dessin de la carte (0x1B837) fait avancer le texte
// des enseignes dans les objets du parc : 0x13B9A demande toute la mémoire, comme lui.
const palette300 = (jeu, destination) => [[destination >>> 0, (destination >>> 0) + 0x300]];

export const reecritures = [
  { adresse: 0x13BF3, nom: 'clavierDuParc', fn: clavierDuParc, arguments: 2,
    zones: (jeu, modificateurs, touche) => ((touche & 0xFF) !== 0 ? auDelaDeLaPile(jeu) : []) },
  { adresse: 0x13B9A, nom: 'dessinerLaVue', fn: (jeu) => dessinerLaVue(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x1B229, nom: 'rienAuDebutDeLaPartie', fn: () => rienAuDebutDeLaPartie(), arguments: 0 },
  { adresse: 0x1A706, nom: 'fonduDOuverture', fn: (jeu) => fonduDOuverture(jeu), arguments: 0 },
  { adresse: 0x47D74, nom: 'assombrirLaPalette', fn: assombrirLaPalette, arguments: 3,
    zones: (jeu, destination) => palette300(jeu, destination) },
  { adresse: 0x47D38, nom: 'assombrirEtPoser', fn: assombrirEtPoser, arguments: 3,
    zones: (jeu, destination) => palette300(jeu, destination) },
  { adresse: 0x47DBA, nom: 'eclaircirVers', fn: eclaircirVers, arguments: 3,
    zones: (jeu, cible, courante) => palette300(jeu, courante) },
  { adresse: 0x4820D, nom: 'eteindre', fn: eteindre, arguments: 2 },
  { adresse: 0x48296, nom: 'rallumer', fn: rallumer, arguments: 2 },
  { adresse: 0x47606, nom: 'pluieEtOrage', fn: pluieEtOrage, arguments: 7 },
  { adresse: 0x5B5D0, nom: 'visiteDeLaDemo', fn: (jeu) => visiteDeLaDemo(jeu), arguments: 0,
    zones: (jeu) => zonesDeLaVisite(jeu) },
  { adresse: 0x4FD85, nom: 'gererLaBarreDeMenus', fn: (jeu) => gererLaBarreDeMenus(jeu), arguments: 0,
    zones: (jeu) => (motSigne(jeu, BARRE_DE_MENUS) !== -1 ? auDelaDeLaPile(jeu) : []) },
  { adresse: 0x50651, nom: 'dessinerLaBarreDeMenus', fn: (jeu) => dessinerLaBarreDeMenus(jeu), arguments: 0 },
  { adresse: 0x6B9CB, nom: 'sourisDansLesFenetres', fn: (jeu) => sourisDansLesFenetres(jeu), arguments: 0,
    zones: (jeu) => (mot(jeu, APPUI_GAUCHE) !== 0 || mot(jeu, APPUI_DROIT) !== 0 ? auDelaDeLaPile(jeu) : []) },
];

// Aucune fonction de ce module n'attend son premier appel : les cinq scénarios les exercent toutes.
export const enAttente = [];
