// Poser, tracer et construire : ce que fait le clic dans la vue du parc.
//
// Réécriture lisible des fonctions 0x15FBD, 0x1788D, 0x2EBB7, 0x31748, 0x287D8, 0x29835, 0x205D7,
// 0x32232, 0x43689 et 0x4091A du jeu d'origine. Chaque constante vient du programme de 1994 ;
// `moteur/node/comparer.mjs` et `moteur/node/verifier.mjs` prouvent que le comportement est
// identique (voir en fin de fichier).
//
// --- Les deux boutons de la souris, et les zones de l'écran -------------------------------------
//
// À chaque image, 0x145FB (interface-parc.js) parcourt les zones de l'écran du parc qui contiennent
// le pointeur et appelle, selon les indicateurs de la zone, l'appui du bouton gauche (0x15FBD) ou
// celui du bouton droit (0x1788D). Les deux reçoivent le numéro de la zone. La table des zones est
// décrite en tête de `moteur/jeu/interface-parc.js` ; les zones utiles ici sont :
//
//   4 à 13   les dix boutons de la barre d'outils ;
//   16 à 21  les six réglages de l'objet choisi (0xD6678) ;
//   22 à 28  les sept icônes du coin haut droit ;
//   29       la vue du parc ;
//   30       la barre des messages.
//
// **Le bouton gauche** (0x15FBD) donne un outil (chemins, barrières), ouvre une fenêtre d'achat
// (attractions, boutiques, décors, personnel), règle l'objet choisi, amène la vue sur l'employé
// suivant d'un métier, ou — sur la vue du parc — **pose ce que le joueur tient**. Le numéro de zone
// est ramené de 4 à 0 (les quatre bords n'y viennent jamais : leurs indicateurs 0x19 ne portent pas
// l'appui gauche 0x02), puis aiguillé par une table de sauts en 0x15FC6 à 27 entrées.
//
// **Le bouton droit** (0x1788D) ouvre le **catalogue surgissant** de l'outil (0x6AA49, panneau.js),
// défait les réglages que le bouton gauche fait, et — sur la vue du parc — poste la demande de
// retrait de ce qui est sous le pointeur.
//
// --- Poser un objet : la demande de pose --------------------------------------------------------
//
// Ni 0x15FBD ni 0x1788D ne posent quoi que ce soit eux-mêmes. Ils écrivent une **demande de pose**
// dans la table 0xD441F + 6 × joueur (+0 octet la sorte, +1 mot la case, +3 mot un paramètre),
// c'est-à-dire directement dans la case du joueur de la file des événements (0xD441E, type en +1) ;
// 0x2CCF8, appelée en fin d'image par la boucle du parc, l'exécute — c'est elle qui appelle
// 0x2EBB7, 0x287D8, 0x29835, 0x205D7… Les sortes que ce module écrit :
//
//   sorte  ce qu'on pose                                  paramètre
//   0x0A   une attraction                                 la fiche du catalogue [0xD665A]
//   0x0C   une boutique                                   —
//   0x0E   un arbre ou un décor                           —
//   0x10   un employé à embaucher                         la fiche du métier [0xD6644]
//   0x12   les rails d'une attraction                     4 × fiche + 1 (bouton gauche)
//   0x14   les rails, variante du bouton droit            4 × fiche + 2
//   0x16   un looping                                     —
//   0x18   la sortie d'une attraction                     —
//   0x1A   un chemin qu'on pose d'un clic                 le mot +4 de la fiche de chemin
//   0x1C   un panneau indicateur                          —
//   0x20   le mécanicien qu'on envoie                     la fiche de l'attraction
//   0x22   l'employé qu'on déplace                        l'objet choisi [0xD6678]
//   0x24   le retrait (bouton droit)                      —
//   0x2C   l'objet de l'outil 20                          l'objet choisi [0xD6678]
//
// Le bouton gauche **maintenu** (0x175B5, interface-parc.js) poste les sortes 2, 4, 6, 8, 0x12 et
// 0x1E : ce qu'on trace en glissant (murs, chemins, barrières, rivière, rails).
//
// --- Le prix ------------------------------------------------------------------------------------
//
// Le prix n'est vérifié qu'au moment de la construction, dans 0x2EBB7 : si le solde du joueur
// ([0xD3808] + 0x0A) moins le coût, moins ce qui est déjà engagé ([0xD3808] + 0x0E), est négatif,
// l'écran 0x56 s'ouvre (0x7F652) et rien n'est posé. Sinon le coût est ajouté à l'engagement +0x0E
// et à la dépense +0x37, et l'attraction retient le sien dans son mot +0x123.
//
// --- Les tables employées -----------------------------------------------------------------------
//
//   0xB4920   les quatre pas d'une direction, en cases (mots signés : −64, +1, +64, −1)
//   0xB48EC   la direction opposée (mots)
//   0xB44D9   les images de sol, 4 octets : +0 mot de drapeaux, +3 octet le numéro de forme
//   0xB44DC   le numéro de forme d'une image de sol (l'octet +3 de la même table)
//   0xB49C1   les directions ouvertes d'une forme d'allée
//   0xB4980   le masque de directions d'une forme de mur
//   0xB4B1D   le bit d'une direction, pour un mur (0x287D8) ou un rail (0x29835)
//   0xB8BA0   la forme d'un mur d'après le masque de ses quatre voisins
//   0xB8C11   la forme d'un rail d'après le masque de ses quatre voisins
//   0xB8BD8   le masque de directions d'une forme de rail
//   0xB8C35   le bit d'une direction, dans le vocabulaire des rails
//   0xB4B2A   le pas (en cases) d'un masque d'une seule direction
//   0xB7AEA   les deux directions de sortie d'une forme de rail (2 octets par forme)
//   0xB7B18   le bit de retour d'une direction de rail
//   0xB7B21   les directions ouvertes d'une forme de rail
//   0xB5302   le contentement que donne une case de voie, par hauteur (mots)
//   0xB7A45   les cinq dispositions de la gare d'une attraction à voie (0x1D octets chacune :
//             +0 mot le décalage de la case du portique, puis cinq couples (dx, dy) de mots)
//   0xB7ADA   l'objet graphique du kiosque d'une attraction, par direction
//   0xB7AE2   l'objet graphique du kiosque d'une gare, par disposition
//   0xB493A   la direction qu'ouvre une forme d'allée (0xFF : aucune)
//   0xB491C   le bit d'une direction, dans le vocabulaire des allées
//   0xB4970   la direction d'un masque d'allée
//   0xCCED0   le catalogue des attractions : 200 octets par genre (§ 10.3)
//   0xD3C62   le catalogue des boutiques : 107 octets par genre (§ 10.4)
//   0xD35C0   le catalogue des métiers : 0x36 octets par métier (§ 10.5)
//   0xD37DC   le catalogue des chemins : 11 octets par sorte
//   0xB93C3   la table des zones de l'écran (§ 6.7)
//   0xCC818   les deux barres de jauges de la barre d'outils : 40 cases de 15 octets, l'octet +0xD
//             de chacune étant son image ; 0x398DF les dessine à chaque image
//
// --- Les variables touchées ---------------------------------------------------------------------
//
//   0xD6670  mot : l'outil en main
//   0xD6678  mot : l'objet du parc choisi
//   0xD6652  mot : l'écran en cours (0 = la vue du parc)
//   0xD666E  mot : il faut refaire le fond de la carte
//   0xD779F  octet : l'image courante de l'animation d'un bouton pressé (0x4DE1A la fait avancer)
//   0xD7767  octet : il faut redessiner la barre d'outils, vraisemblablement ; posé par tout appui
//            sur un bouton, jamais remis à zéro par ce module. Non établi
//   0xD7768  octet : posé par la zone 22 (la fiche du premier article marqué). Non établi
//   0xB14C2  mot : 4 quand le pointeur est sur la vue du parc
//   0xDE5A0  mot : le double-clic en attente, oublié dès qu'on pose quelque chose
//   [0xD3814] + 0x680  octet : la disposition de la gare qu'on va poser (0 à 3 ; −1 = aucune)
//   [0xD3814] + 0x63D  mot : le dernier employé montré par les icônes 23 à 26
//   [0xD3814] + 0x2D0  mot : l'attraction dont on pose l'entrée ou la sortie
//   [0xD3814] + 0x2BA, + 0x2BC  mots : la case de l'entrée qu'on cherche, et son sol
//   [0xD3808] + 0x0A, + 0x0E, + 0x37  le solde, l'engagement en cours et les dépenses du joueur

// --- Accès à la mémoire --------------------------------------------------------------------------
import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';
import { cameraCentreeSurLObjet } from './corrections.js';
import { noterLeCadrageSurUnObjet } from './vue-fluide.js';

const s16 = (v) => (v << 16) >> 16;
const s8 = (v) => (v << 24) >> 24;
const octet = (jeu, a) => jeu.m8[a];
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const motLong = (jeu, a) => jeu.dv.getUint32(a, true);
const motLongSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const adresse = (jeu, a) => jeu.dv.getUint32(a, true);
const ecrireOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const ecrireMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const ecrireMotLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// Division entière du processeur (idiv) : tronquée vers zéro.
function diviser(a, b) {
  if (b === 0) throw new Error('division par zero');
  return (a / b) | 0;
}

// --- La carte et les objets du parc ---------------------------------------------------------------
const CARTE = 0xD3B08;                 // pointeur : 64 × 64 cellules de 4 octets
const OBJETS = 0xD3B10, FIN_DES_OBJETS = 0xD3B78;
const TAILLE_OBJET = 200;
const TAILLE_CARTE = 64;
const SOLS = 0xB44D9;                  // 4 octets par image de sol
const FORMES_DES_SOLS = 0xB44DC;       // l'octet +3 de la même table
const PAS_DES_DIRECTIONS = 0xB4920;    // mot signé par direction
const DIRECTIONS_OPPOSEES = 0xB48EC;   // mot par direction
const OBJETS_DES_ELEMENTS = 0xD3B38;   // pointeur : un mot par élément

const cellule = (jeu, numero) => adresse(jeu, CARTE) + (numero & 0xFFFF) * 4;
const objet = (jeu, numero) => adresse(jeu, OBJETS) + numero * TAILLE_OBJET;
const drapeauxDuSol = (jeu, cel) => mot(jeu, SOLS + jeu.m8[cel + 2] * 4);
const formeDuSol = (jeu, cel) => jeu.m8[FORMES_DES_SOLS + jeu.m8[cel + 2] * 4];
const pasDeLaDirection = (jeu, d) => motSigne(jeu, PAS_DES_DIRECTIONS + d * 2);
const objetDElement = (jeu, element) => mot(jeu, adresse(jeu, OBJETS_DES_ELEMENTS) + element * 2);

// --- L'état de l'interface -------------------------------------------------------------------------
const OUTIL = 0xD6670;                 // mot
const OBJET_CHOISI = 0xD6678;          // mot
const ECRAN_COURANT = 0xD6652;         // mot
const REDESSINER_CARTE = 0xD666E;      // mot
const CASE_VISEE = 0xD6676;            // mot : rangée × 64 + colonne
const CAMERA_COLONNE = 0xD667A, CAMERA_RANGEE = 0xD6666;  // mots signés
const LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;   // mots
const MODE_AFFICHAGE = 0xDE5F6;        // mot : bit 0 posé en 320x200
const POINTEUR_SUR_LE_PARC = 0xB14C2;  // mot
const IMAGE_DU_BOUTON = 0xD779F;       // octet
const BARRE_A_REFAIRE = 0xD7767;       // octet, rôle non établi
const ARTICLE_MARQUE = 0xD7768;        // octet, rôle non établi
const DOUBLE_CLIC_EN_ATTENTE = 0xDE5A0; // mot
const APPUI_DROIT_EN_ATTENTE = 0xDE5A4, DROIT_ENFONCE = 0xDE5AA;
const GAUCHE_ENFONCE = 0xDE5AC;
const ZONES = 0xB93C3, TAILLE_ZONE = 12;   // la table des zones ; +8 la première image du bouton

// --- Les joueurs et leurs fiches (§ 10.8) ----------------------------------------------------------
const FICHE_JOUEUR = 0xD3808;          // pointeur : +0x0A le solde, +0x0E l'engagement, +0x37 les dépenses
const COMPTES = 0xD3814;               // pointeur : les comptes du parc
const FICHE_DU_PARC = 0xD3818;         // pointeur
const JOUEUR_COURANT = 0xD665C;        // mot
const COMPTES_BRUTS = 0xD443C, TAILLE_COMPTES = 0x6C2;
const FICHES_DES_PARCS = 0xCF1E0, TAILLE_FICHE_PARC = 0x250;
const NOUVELLE_DEMANDE = 0xD441F;      // 6 octets par joueur
const PAS_DE_SIMULATION = 0xD3AFC;     // mot long

// --- Les catalogues ---------------------------------------------------------------------------------
const ATTRACTIONS = 0xCCED0, TAILLE_ATTRACTION = 200;
const BOUTIQUES = 0xD3C62, TAILLE_BOUTIQUE = 0x6B;
const METIERS = 0xD35C0, TAILLE_METIER = 0x36;
const CHEMINS = 0xD37DC, TAILLE_CHEMIN = 11;
const FICHE_ATTRACTION = 0xD665A, FICHE_BOUTIQUE = 0xD664A;
const FICHE_EMPLOYE = 0xD6644, FICHE_CHEMIN = 0xD6648;

// --- Les fonctions appelées ------------------------------------------------------------------------
const VIDER_LA_CASE = 0x205D7;
const CHERCHER_SUR_LA_CASE = 0x204B9;  // (cellule, type) : simulation-outils.js
const POSER_EN_TETE = 0x185C1;         // (objet, x, y) : simulation-outils.js
const RETIRER_L_OBJET = 0x18B62;       // (objet)
const INSCRIRE_AU_LIVRE = 0x78943;     // (catégorie, montant) : simulation-outils.js
const RELEVER_LES_STATISTIQUES = 0x68E34;
const JOUER_UN_BRUITAGE = 0x80C80;     // (numéro, ?) : simulation-outils.js
const EMETTRE_UN_SON = 0x80FE0;        // (numéro, ?)
const OUVRIR_UNE_FENETRE = 0x35F21;    // (numéro) : fenetres.js
const RECADRER_CAMERA = 0x184DF;       // carte.js
const OUVRIR_LE_CATALOGUE = 0x6AA49;   // panneau.js
const RAILS_SUR_UNE_CASE = 0x29835;
const RACCORDER_LES_RAILS = 0x2A2F1;   // (cellule, sens)
const EFFACER_LES_RAILS = 0x2C6B8;     // (case)
const MANQUE_D_ARGENT = 0x7F652;       // prépare l'écran 0x56
const EVALUER_LA_VOIE = 0x43689;       // (kiosque, relever)
const REMETTRE_ZERO = 0x7F1A0;         // memset

// =================================================================================================
// 0x205D7 — vider une case : en ôter tout ce qui s'y trouve.
//
// Appelée par tout ce qui pose quelque chose (0x18BC0, 0x287D8, 0x29835, 0x2EBB7, 0x2CCF8…). Une
// case **réservée** (bit 3 de son octet +3 : l'entrée du parc et sa clôture) n'est jamais vidée.
//
// S'il y a un **décor fixe** (mot +0 négatif), les décors −1 à −0x0B s'enlèvent (0x411AA) et les
// autres restent : le décor du terrain ne se retire pas.
//
// Sinon la liste des objets de la case est parcourue ; le premier objet qui **ouvre un écran** met
// fin au parcours (l'octet local `fini`), mais la fonction continue jusqu'au bout de la liste sans
// plus rien faire, puis passe au sol. Selon le type de l'objet :
//
//   4    une attraction    [0xD3810] = l'objet, écran 0x4A (l'écran « démolir ? », vraisemblablement)
//   0xA  une boutique      idem
//   6    un kiosque        idem, mais pour l'attraction qu'il sert (son mot +0x16)
//   0x12 un morceau de voie   rien : les rails s'enlèvent par 0x2C6B8
//   0x14 selon l'état      l'état 8 est un panneau indicateur : voir ci-dessous
//   0x18 une installation  0x4121E l'enlève
//
// Le panneau indicateur (type 0x14, état 8) porte trois flèches, mots +0x69, +0x6B et +0x6D : vers
// une attraction, une boutique et la sortie. Avec l'outil 14 en main, la flèche qui montre l'objet
// désigné par les comptes (mot +0x2C8) est seule effacée ; s'il en reste une, le panneau est gardé.
// Sinon le panneau entier est ôté (0x18B62) et la fonction s'arrête là.
//
// Enfin le sol, d'après ses drapeaux : 1 un mur (0x2B955), 2 une allée (0x2BA40), 8 une file
// (0x2BCEE), 0x40 un circuit (0x2C2EC **puis** 0x2C4E5 : le même bit est examiné deux fois de
// suite), 0x800 l'outil 12 (0x412E0). Hors des drapeaux 4 et 0x20 (sol d'attraction et sortie), le
// sol est remis à 0 et le fond de la carte refait.
//
// Anomalie reproduite : avec l'outil 14, si l'objet désigné n'est ni une attraction (4), ni une
// boutique (0xA), ni du type 0x14, le numéro de la flèche à effacer est lu **sans avoir été
// écrit** — c'est la variable locale [ebp-8], qui garde ce qu'un appel précédent a laissé sur la
// pile. La réécriture ouvre donc le même cadre que l'original (voir `cadreDe`) et lit le même
// octet. Aucun scénario n'y passe.
const OUVRIR_ECRAN_DEMOLIR = 0x4A;
const OBJET_MONTRE = 0xD3810;          // mot long : l'objet que l'écran ouvert présente

// Le cadre de pile de l'original : `push ebx/esi/edi` puis `enter taille, 0`. On descend le
// pointeur de pile d'autant, si bien que les appels partent de la même hauteur que dans l'original
// et que les variables locales sont aux mêmes adresses. L'enveloppe (moteur/jeu/index.js) remet la
// pile en place au retour. Rend l'adresse de `ebp`.
function cadreDe(jeu, taille) {
  const T = jeu.T;
  T.sauver();
  const ebp = ((T.R.esp >>> 0) - 16) >>> 0;
  T.R.esp = (ebp - taille) | 0;
  T.charger();
  return ebp;
}

export function viderLaCase(jeu, numeroCase) {
  const ebp = cadreDe(jeu, 0x1C);
  const cel = cellule(jeu, numeroCase);
  if (jeu.m8[cel + 3] & 8) return;     // case réservée : l'entrée du parc

  const contenu = motSigne(jeu, cel);
  if (contenu < 0) {                   // un décor fixe
    if (contenu >= -0x0B) jeu.appeler(0x411AA, cel);
    return;
  }

  let courant = objet(jeu, contenu);
  let fini = 0;
  while (courant > adresse(jeu, OBJETS) && fini === 0) {
    if (objet(jeu, mot(jeu, OBJET_CHOISI)) === courant) ecrireMot(jeu, OBJET_CHOISI, 0);
    const type = jeu.m8[courant + 4];
    if (type === 4 || type === 0xA) {
      ecrireMotLong(jeu, OBJET_MONTRE, courant);
      ecrireMot(jeu, ECRAN_COURANT, OUVRIR_ECRAN_DEMOLIR);
      fini = 1;
    } else if (type === 6) {           // un kiosque : c'est son attraction qu'on présente
      ecrireMotLong(jeu, OBJET_MONTRE, objet(jeu, mot(jeu, courant + 0x16)));
      ecrireMot(jeu, ECRAN_COURANT, OUVRIR_ECRAN_DEMOLIR);
      fini = 1;
    } else if (type === 0x14) {
      if (jeu.m8[courant + 0xC] === 8) {   // un panneau indicateur
        if (ecarterUneFleche(jeu, ebp, courant)) return;
        jeu.appeler(RETIRER_L_OBJET, courant);
        return;
      }
    } else if (type === 0x18) {
      jeu.appeler(0x4121E, courant);
    }
    courant = objet(jeu, motSigne(jeu, courant + 2));
  }

  // Le sol. `drapeaux` est relu à chaque fois dans l'original : il ne change pas entre-temps.
  const drapeaux = drapeauxDuSol(jeu, cel);
  if (drapeaux & 1) jeu.appeler(0x2B955, numeroCase & 0xFFFF);
  if (drapeaux & 2) {
    jeu.appeler(0x2BA40, numeroCase & 0xFFFF);
    if (mot(jeu, adresse(jeu, COMPTES) + 0x2BC) === 0) jeu.appeler(EMETTRE_UN_SON, 0, 6);
    return;
  }
  if (drapeaux & 8) {
    jeu.appeler(0x2BCEE, numeroCase & 0xFFFF);
    jeu.appeler(EMETTRE_UN_SON, 0, 6);
    return;
  }
  if (drapeaux & 0x40) {
    jeu.appeler(0x2C2EC, numeroCase & 0xFFFF);
    jeu.appeler(EMETTRE_UN_SON, 0, 6);
  }
  if (drapeaux & 0x40) {               // le même bit, une seconde fois
    jeu.appeler(0x2C4E5, numeroCase & 0xFFFF);
    jeu.appeler(EMETTRE_UN_SON, 0, 6);
  }
  if (drapeaux & 0x800) {
    jeu.appeler(0x412E0, numeroCase & 0xFFFF, 0, 1);
    jeu.appeler(EMETTRE_UN_SON, 0, 6);
  }
  if ((drapeaux & 0x24) === 0) {
    jeu.m8[cel + 2] = 0;
    ecrireMot(jeu, REDESSINER_CARTE, 1);
  }
}

// Le panneau indicateur, avec l'outil 14 en main : effacer la seule flèche qui montre l'objet
// désigné par les comptes (mot +0x2C8). Rend vrai s'il reste une flèche, et que le panneau est donc
// gardé ; faux s'il faut l'ôter tout entier.
function ecarterUneFleche(jeu, ebp, panneau) {
  if (mot(jeu, OUTIL) !== 0xE) return false;
  const montre = objet(jeu, mot(jeu, adresse(jeu, COMPTES) + 0x2C8));
  if (montre <= adresse(jeu, OBJETS)) return false;
  const type = jeu.m8[montre + 4];
  // [ebp-8] : le numéro de la flèche. Écrit pour les types 4, 0xA et 0x14 seulement ; sinon lu tel
  // que la pile le porte (anomalie reproduite, voir l'en-tête de la fonction).
  if (type === 4) ecrireMotLong(jeu, ebp - 8, 0);
  else if (type === 0xA) ecrireMotLong(jeu, ebp - 8, 1);
  else if (type === 0x14) ecrireMotLong(jeu, ebp - 8, 2);
  const fleche = mot(jeu, ebp - 8);
  if (mot(jeu, panneau + fleche * 2 + 0x69) === 0) return false;
  ecrireMot(jeu, panneau + fleche * 2 + 0x69, 0);
  for (let k = 0; k < 3; k++) if (mot(jeu, panneau + k * 2 + 0x69) !== 0) return true;
  return false;
}

// =================================================================================================
// 0x287D8 — un mur sur une case : lequel irait, et le poser.
//
// `sol` est l'image de sol de base du mur (le mot +4 de sa fiche du catalogue 0xCCA92) ; `poser`
// nul ne fait que rendre l'image qui conviendrait.
//
// Rend 0 si la case ne peut pas recevoir de mur : un sol qui porte des drapeaux, une case réservée
// (bit 3 de +3), ou une case déjà occupée (mot +0 non nul).
//
// Sinon les quatre voisines sont examinées : une voisine dont le sol partage un drapeau avec le mur
// qu'on pose, et qui n'est pas réservée, entre dans un masque de quatre bits. À la pose, la voisine
// change aussi de forme : sa forme devient celle que donne 0xB8BA0 pour le masque de son masque de
// directions (0xB4980, d'après sa forme actuelle) et du bit de la direction (0xB4B1D) — les murs se
// raccordent. La case, elle, reçoit `sol` + la forme que donne 0xB8BA0 pour le masque.
//
// Sans pose, la valeur rendue est `sol` + cette forme : l'image de sol de l'aperçu (0x149A4).
const MASQUE_DES_FORMES_DE_MUR = 0xB4980;
const BIT_DE_DIRECTION = 0xB4B1D;
const FORMES_DE_MUR = 0xB8BA0;

export function murSurUneCase(jeu, sol, numeroCase, poser) {
  const cel = cellule(jeu, numeroCase);
  if (drapeauxDuSol(jeu, cel) !== 0) return 0;
  if (jeu.m8[cel + 3] & 8) return 0;
  if (mot(jeu, cel) !== 0) return 0;

  let voisines = 0;
  for (let k = 0; k < 4; k++) {
    const voisine = cel + pasDeLaDirection(jeu, k) * 4;
    if ((drapeauxDuSol(jeu, voisine) & mot(jeu, SOLS + (sol & 0xFFFF) * 4)) === 0) continue;
    if (jeu.m8[voisine + 3] & 8) continue;
    voisines = (voisines | (1 << k)) & 0xFF;
    if ((poser & 0xFFFF) === 0) continue;
    // La voisine se raccorde : on lui remet la même image, forme changée.
    const masque = jeu.m8[MASQUE_DES_FORMES_DE_MUR + formeDuSol(jeu, voisine)];
    const forme = jeu.m8[FORMES_DE_MUR + (jeu.m8[BIT_DE_DIRECTION + k] | masque)];
    jeu.m8[voisine + 2] = (forme + jeu.m8[voisine + 2] - formeDuSol(jeu, voisine)) & 0xFF;
  }

  if ((poser & 0xFFFF) === 0) return (sol + jeu.m8[FORMES_DE_MUR + voisines]) | 0;
  jeu.appeler(VIDER_LA_CASE, numeroCase & 0xFFFF);
  jeu.m8[cel + 2] = (jeu.m8[FORMES_DE_MUR + voisines] + (sol & 0xFF)) & 0xFF;
  ecrireMot(jeu, REDESSINER_CARTE, 1);
  return 1;
}

// =================================================================================================
// 0x32232 — embaucher un employé, et le poser sur une case.
//
// La case doit porter un sol qui accepte quelqu'un : ses drapeaux croisent 0x21A (2 une allée,
// 8 une file, 0x10 un bout de file, 0x200 non établi), ou bien ils sont nuls (l'herbe). Sinon rien.
//
// Le premier emplacement libre de la table des objets du parc (octet +4 nul) reçoit le nouvel
// employé (type 8) ; s'il n'y en a pas, rien. Le salaire d'embauche du métier (+0x24 de sa fiche)
// est inscrit au livre des comptes en catégorie 6, **en négatif** : c'est une dépense.
//
// Les champs posés, d'après le catalogue des métiers (§ 10.5) : +0x36 et +0x1C le salaire, +0x3E
// l'heure d'embauche, +0x59 le métier, +0x0A son objet graphique (l'image de la marche +0x28 du
// métier, plus la direction), +6/+7 et +8/+9 la position (au centre de la case, 0x80), +0x61 la
// case, +0x0C l'état d'embauche du métier, +0x13 la vitesse, +0x14 et +0x20 la patience, 400.
//
// Puis, selon cet état : 2 (un amuseur) et 8 (le mécanicien) et 0x16 (l'agent d'entretien) portent
// le salaire en +0x9A et comptent un employé de plus dans la fiche du parc (+0xD4 les amuseurs,
// +0xCC les mécaniciens, +0xD0 les agents d'entretien — le numéro du parc est l'octet +0x41 des
// comptes) ; le mécanicien et l'agent d'entretien deviennent l'objet choisi, et l'agent d'entretien
// voit sa tournée (+0x9C, 8 cases) effacée et son +0xAC remis à zéro.
//
// Anomalie reproduite : le gardien (état 0x34) ne reçoit **pas** de salaire en +0x9A — il travaille
// gratuitement jusqu'à ce que son écran lui en règle un.
//
// Enfin, si l'octet +0x681 des comptes est levé (on a demandé une tournée, vraisemblablement),
// l'employé passe à l'état 0x3A et vise la case où il est ; et la fiche du parc compte un employé
// de plus (+0xC2). Rend 1 si l'embauche a eu lieu.
const SALAIRE_DU_METIER = 0x24;        // dans une fiche de 0xD35C0
const IMAGE_D_ATTENTE = 0x28;
const ETAT_D_EMBAUCHE = 0x2C;
const VITESSE_DU_METIER = 0x31;
const NOMBRE_DU_METIER = 0x33;
const DEPENSE_PERSONNEL = 6;           // la catégorie du livre des comptes

export function embaucherUnEmploye(jeu, numeroCase, metier) {
  const cel = cellule(jeu, numeroCase);
  if ((drapeauxDuSol(jeu, cel) & 0x21A) === 0 && drapeauxDuSol(jeu, cel) !== 0) return 0;

  const fiche = METIERS + (metier & 0xFFFF) * TAILLE_METIER;
  for (let e = adresse(jeu, OBJETS) + TAILLE_OBJET; e < adresse(jeu, FIN_DES_OBJETS); e += TAILLE_OBJET) {
    if (jeu.m8[e + 4] !== 0) continue;

    const salaire = mot(jeu, fiche + SALAIRE_DU_METIER);
    jeu.appeler(INSCRIRE_AU_LIVRE, DEPENSE_PERSONNEL, (-salaire) | 0);
    ecrireMot(jeu, e + 0x36, salaire);
    ecrireMot(jeu, e + 0x1C, salaire);
    ecrireMot(jeu, e + 0x32, 0);
    ecrireMot(jeu, e + 0x34, 0);
    ecrireMot(jeu, e + 0x3C, 0);
    ecrireMotLong(jeu, e + 0x3E, motLong(jeu, PAS_DE_SIMULATION));
    ecrireMot(jeu, e + 0x28, 0);
    ecrireMot(jeu, e + 0x2A, 0);
    jeu.m8[e + 0x5A] = 0;
    jeu.m8[e + 4] = 8;                 // type 8 : le personnel
    ecrireMot(jeu, e + 0x0E, 2);
    jeu.m8[e + 0x12] = 0;              // la direction
    jeu.m8[e + 0x59] = metier & 0xFF;
    const metierPose = jeu.m8[e + 0x59];
    ecrireMot(jeu, e + 0x0A,
      objetDElement(jeu, jeu.m8[e + 0x12] + mot(jeu, METIERS + metierPose * TAILLE_METIER + IMAGE_D_ATTENTE)));
    jeu.m8[e + 7] = (numeroCase & 0xFFFF) % TAILLE_CARTE;
    jeu.m8[e + 9] = (numeroCase & 0xFFFF) >> 6;
    jeu.m8[e + 6] = 0x80;
    jeu.m8[e + 8] = 0x80;
    ecrireMot(jeu, e + 0x61, numeroCase & 0xFFFF);
    jeu.m8[e + 0x0C] = jeu.m8[fiche + ETAT_D_EMBAUCHE];
    jeu.m8[e + 0x13] = jeu.m8[METIERS + metierPose * TAILLE_METIER + VITESSE_DU_METIER];
    ecrireMot(jeu, e + 0x14, 400);
    ecrireMotLong(jeu, e + 0x20, 400);
    jeu.m8[METIERS + metierPose * TAILLE_METIER + NOMBRE_DU_METIER] =
      (jeu.m8[METIERS + metierPose * TAILLE_METIER + NOMBRE_DU_METIER] + 1) & 0xFF;
    jeu.appeler(POSER_EN_TETE, e, mot(jeu, e + 6), mot(jeu, e + 8));

    const etat = jeu.m8[e + 0x0C];
    if (etat === 2) {
      ecrireMot(jeu, e + 0x9A, mot(jeu, fiche + SALAIRE_DU_METIER));
      compterUnEmploye(jeu, 0xD4);
    } else if (etat === 8) {
      ecrireMot(jeu, e + 0x9A, mot(jeu, fiche + SALAIRE_DU_METIER));
      compterUnEmploye(jeu, 0xCC);
      ecrireMot(jeu, OBJET_CHOISI, diviser(e - adresse(jeu, OBJETS), TAILLE_OBJET));
    } else if (etat === 0x16) {
      compterUnEmploye(jeu, 0xD0);
      ecrireMot(jeu, e + 0x9A, mot(jeu, fiche + SALAIRE_DU_METIER));
      jeu.m8[e + 0xAC] = 0;
      jeu.appeler(REMETTRE_ZERO, e + 0x9C, 0xFF, 0x10);   // la tournée : 8 cases
      ecrireMot(jeu, OBJET_CHOISI, diviser(e - adresse(jeu, OBJETS), TAILLE_OBJET));
    }

    if (jeu.m8[adresse(jeu, COMPTES) + 0x681] !== 0) {
      ecrireMot(jeu, e + 0x4D, jeu.m8[e + 7] + jeu.m8[e + 9] * TAILLE_CARTE);
      jeu.m8[e + 0x0C] = 0x3A;
      ecrireMot(jeu, e + 0x14, 0);
    }
    ecrireMot(jeu, adresse(jeu, FICHE_DU_PARC) + 0xC2, mot(jeu, adresse(jeu, FICHE_DU_PARC) + 0xC2) + 1);
    return 1;
  }
  return 0;
}

// Un employé de plus dans la fiche du parc courant. Le numéro du parc est l'octet +0x41 des comptes
// du joueur courant, et non le numéro du joueur.
function compterUnEmploye(jeu, decalage) {
  const parc = jeu.m8[COMPTES_BRUTS + 0x41 + mot(jeu, JOUEUR_COURANT) * TAILLE_COMPTES];
  const a = FICHES_DES_PARCS + decalage + parc * TAILLE_FICHE_PARC;
  ecrireMot(jeu, a, mot(jeu, a) + 1);
}

// =================================================================================================
// 0x4091A — remplir les deux barres de jauges de la barre d'outils.
//
// La table 0xCC818 décrit 40 cases de 15 octets, dessinées à chaque image par 0x398DF ; l'octet
// +0x0D de chacune est son image. Les vingt premières forment la barre de l'humeur des visiteurs,
// les vingt suivantes (0xCC944) celle de leur état.
//
// **L'humeur** se partage sur vingt cases au prorata des visiteurs contents (mot +0x2B8 des comptes)
// et neutres (+0x2B6), rapportés au nombre de visiteurs du parc (mot +0x1F de sa fiche) : image 1
// pour les contents, 2 pour les neutres, 3 pour le reste, 6 pour ce qui dépasse.
//
// Anomalie reproduite : la part des mécontents est calculée comme 20 moins celle des contents, sans
// retirer celle des neutres. Dès qu'il y a un visiteur neutre, la barre déborde donc sur la barre
// suivante, qui reçoit autant de cases d'image 3 ; et le remplissage final (image 6) ne se fait plus.
//
// **L'état** compte les visiteurs (type 2) selon deux octets, +0x50 et +0x51 (l'estomac et la soif,
// vraisemblablement : non établi), chacun comparé à 4 en signé : image 8 pour les deux au-dessous,
// 4 pour le premier seul, 5 pour le second seul ; le quatrième compte est calculé mais jamais
// dessiné, et le reste de la barre reçoit l'image 6.
//
// Les parts sont des octets non signés dans la première barre, des mots non signés dans la seconde ;
// les cases sont parcourues par une adresse, dont l'écart au début de la table est ramené à 16 bits
// avant d'être divisé par 15.
const JAUGES = 0xCC818, TAILLE_JAUGE = 15, IMAGE_DE_LA_JAUGE = 0x0D;
const JAUGE_DE_L_ETAT = 0xCC944;

export function remplirLesJauges(jeu) {
  const comptes = COMPTES_BRUTS + mot(jeu, JOUEUR_COURANT) * TAILLE_COMPTES;
  let contents = 0, neutres = 0, mecontents = 0;
  let curseur = JAUGES;
  const caseSuivante = () => { const c = curseur; curseur += TAILLE_JAUGE; return c; };
  // Le reste de la barre, jusqu'à la vingtième case : l'écart est ramené à 16 bits, puis divisé.
  const resteDeLaBarre = (limite, image) => {
    while (((curseur - JAUGES) & 0xFFFF) / TAILLE_JAUGE >>> 0 < limite) {
      jeu.m8[caseSuivante() + IMAGE_DE_LA_JAUGE] = image;
    }
  };

  const visiteurs = motSigne(jeu, adresse(jeu, FICHE_DU_PARC) + 0x1F);
  if (visiteurs > 0) {
    contents = diviser(mot(jeu, comptes + 0x2B8) * 20, visiteurs) & 0xFF;
    neutres = diviser(mot(jeu, comptes + 0x2B6) * 20, visiteurs) & 0xFF;
    mecontents = (0x14 - (contents + mecontents)) & 0xFF;   // mecontents vaut encore 0 : voir l'anomalie
    while (contents > 0) { jeu.m8[caseSuivante() + IMAGE_DE_LA_JAUGE] = 1; contents--; }
    while (neutres > 0) { jeu.m8[caseSuivante() + IMAGE_DE_LA_JAUGE] = 2; neutres--; }
    while (mecontents > 0) { jeu.m8[caseSuivante() + IMAGE_DE_LA_JAUGE] = 3; mecontents--; }
    resteDeLaBarre(0x14, 6);
  }

  let calmes = 0, assoiffes = 0, affames = 0, pressants = 0;
  for (let v = adresse(jeu, OBJETS) + TAILLE_OBJET; v < adresse(jeu, FIN_DES_OBJETS); v += TAILLE_OBJET) {
    if (jeu.m8[v + 4] !== 2) continue;
    if (s8(jeu.m8[v + 0x50]) < 4) {
      if (s8(jeu.m8[v + 0x51]) < 4) calmes++; else assoiffes++;
    } else if (s8(jeu.m8[v + 0x51]) < 4) affames++; else pressants++;
  }
  const total = (calmes + assoiffes + affames + pressants) & 0xFFFF;
  if (total === 0) return;
  calmes = diviser((calmes & 0xFFFF) * 20, total);
  assoiffes = diviser((assoiffes & 0xFFFF) * 20, total);
  affames = diviser((affames & 0xFFFF) * 20, total);
  pressants = diviser((pressants & 0xFFFF) * 20, total);   // calculé, jamais dessiné
  curseur = JAUGE_DE_L_ETAT;
  while ((calmes & 0xFFFF) > 0) { jeu.m8[caseSuivante() + IMAGE_DE_LA_JAUGE] = 8; calmes--; }
  while ((assoiffes & 0xFFFF) > 0) { jeu.m8[caseSuivante() + IMAGE_DE_LA_JAUGE] = 4; assoiffes--; }
  while ((affames & 0xFFFF) > 0) { jeu.m8[caseSuivante() + IMAGE_DE_LA_JAUGE] = 5; affames--; }
  resteDeLaBarre(0x28, 6);
}

// =================================================================================================
// 0x43689 — suivre la voie d'une attraction depuis sa gare, et la noter.
//
// `kiosque` est l'objet du portique de départ (ses octets +7 et +9 donnent sa case, +0x12 sa
// direction, +0x16 la fiche de l'attraction). La fonction part de la case voisine dans cette
// direction et suit les rails **dans les deux sens à la fois** : la forme du premier morceau
// (0xB7AEA, deux octets par forme) donne les deux directions de sortie, et chaque pas croise les
// directions ouvertes du morceau atteint (0xB7B21) avec l'inverse du bit de retour (0xB7B18).
//
// Le circuit est bouclé quand les deux marches se retrouvent sur la même case (après le premier
// pas) : la fonction rend alors le plaisir total, la somme sur tous les morceaux de
// `0xB5302[hauteur] + [fiche de l'attraction + 0xBA]`, et, si `relever` est levé, retient dans les
// comptes le meilleur plaisir (+0x644), la plus longue voie (+0x642) et la plus grande hauteur
// (+0x641).
//
// Deux sommes sont tenues : celle du retour ne compte un morceau **que la première fois** qu'il est
// parcouru avec cette hauteur et cette forme (octets +0xBE et +0xBD, mémoire du dernier passage),
// l'autre le compte toujours. Sans `relever`, la mémoire du morceau est mise à jour ; avec, elle ne
// l'est pas. Ce sont donc bien deux appels successifs qui donnent le même résultat.
//
// Une voie qui s'arrête rend −(plaisir + 1), toujours négatif : c'est ainsi que 0x15FBD sait que le
// circuit n'est pas fermé. S'il n'y a aucun rail contre la gare, la valeur rendue est la constante
// 0xC4653601, un nombre négatif quelconque qui sert de « rien du tout ».
const SORTIES_DES_RAILS = 0xB7AEA;     // 2 octets par forme
const RETOUR_DES_RAILS = 0xB7B18;
const OUVERTURES_DES_RAILS = 0xB7B21;
const PAS_D_UN_MASQUE = 0xB4B2A;       // mot signé par masque d'une seule direction
const PLAISIR_PAR_HAUTEUR = 0xB5302;   // mot par hauteur
const RIEN_DU_TOUT = 0xC4653601 | 0;

export function evaluerLaVoie(jeu, kiosque, relever) {
  const depart = cellule(jeu,
    (s16(jeu.m8[kiosque + 9]) * TAILLE_CARTE + s16(jeu.m8[kiosque + 7])
      + pasDeLaDirection(jeu, jeu.m8[kiosque + 0x12])) & 0xFFFF);
  let morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, depart, 0x12) >>> 0;
  if (morceau === 0) return RIEN_DU_TOUT;

  // Deux marches : leur direction courante (un bit) et la case où elles en sont.
  const sens = [jeu.m8[SORTIES_DES_RAILS + jeu.m8[morceau + 0xC] * 2],
    jeu.m8[SORTIES_DES_RAILS + jeu.m8[morceau + 0xC] * 2 + 1]];
  const ou = [depart, depart];
  let commence = 0;                    // le premier pas ne peut pas boucler
  let plaisirNeuf = 0, plaisirTotal = 0, hauteurMax = 0, morceaux = 0;
  const plaisirDuMorceau = () =>
    mot(jeu, PLAISIR_PAR_HAUTEUR + jeu.m8[morceau + 0x79] * 2)
    + mot(jeu, ATTRACTIONS + 0xBA + mot(jeu, kiosque + 0x16));

  while (((sens[1] + sens[0]) & 0xFFFFFFFF) !== 0) {
    for (let m = 0; m < 2; m++) {
      if (sens[m] === 0) continue;
      morceau = jeu.appeler(CHERCHER_SUR_LA_CASE, ou[m], 0x12) >>> 0;
      if (morceau === 0) { sens[m] = 0; continue; }
      if (ou[0] === ou[1] && s16(commence) !== 0) {
        // Les deux marches se sont rejointes : le circuit est bouclé.
        if ((relever & 0xFF) !== 0) {
          const comptes = adresse(jeu, COMPTES);
          if ((plaisirTotal & 0xFFFF) > motLongSigne(jeu, comptes + 0x644)) {
            ecrireMotLong(jeu, comptes + 0x644, plaisirNeuf & 0xFFFF);
          }
          if ((morceaux & 0xFFFF) > mot(jeu, comptes + 0x642)) ecrireMot(jeu, comptes + 0x642, morceaux);
          if ((hauteurMax & 0xFFFF) > jeu.m8[comptes + 0x641]) jeu.m8[comptes + 0x641] = hauteurMax & 0xFF;
        }
        return plaisirNeuf & 0xFFFF;
      }
      commence = 1;
      sens[m] = (~jeu.m8[RETOUR_DES_RAILS + sens[m]] & jeu.m8[OUVERTURES_DES_RAILS + jeu.m8[morceau + 0xC]]) & 0xFF;
      if (sens[m] === 0) continue;
      ou[m] = ou[m] + motSigne(jeu, PAS_D_UN_MASQUE + sens[m] * 2) * 4;
      if (jeu.m8[morceau + 0xBE] !== jeu.m8[morceau + 0x79] || jeu.m8[morceau + 0xBD] !== jeu.m8[morceau + 0x44]) {
        if ((relever & 0xFF) === 0) {
          jeu.m8[morceau + 0xBE] = jeu.m8[morceau + 0x79];
          jeu.m8[morceau + 0xBD] = jeu.m8[morceau + 0x44];
        }
        plaisirNeuf = (plaisirNeuf + (plaisirDuMorceau() & 0xFFFF)) | 0;
      }
      plaisirTotal = (plaisirTotal + (plaisirDuMorceau() & 0xFFFF)) | 0;
      if (jeu.m8[morceau + 0x79] > (hauteurMax & 0xFFFF)) hauteurMax = jeu.m8[morceau + 0x79];
      morceaux = (morceaux + 1) | 0;
    }
  }
  return (-((plaisirNeuf & 0xFFFF) + 1)) | 0;
}

// =================================================================================================
// 0x29835 — les rails sur une case : quelle pièce irait, et la poser.
//
// `mode` dit ce qu'on demande : 0 l'aperçu (0x149A4 s'en sert), 1 la pose au bouton gauche, 2 le
// retrait au bouton droit, et les bits au-delà de 2 sont recopiés dans l'octet +5 du morceau posé
// (le bit 4, mis par 0x2EBB7, marque vraisemblablement les morceaux de la gare : le bouton droit ne
// les retire pas). `ficheAttraction` désigne la fiche du catalogue, dont l'octet +0xB4 donne le
// **genre de voie** (§ 10.6) : c'est lui que porte le mot +0x16 de chaque morceau.
//
// **Si la case porte déjà un morceau** (ou si elle est réservée, ou si son sol vaut exactement 0x40,
// 4 ou 0x100 — un circuit, un sol d'attraction ou un sol non établi), il n'y a rien à poser : le
// morceau d'un autre genre, ou marqué 4, est laissé ; sinon, selon le mode, 0x2A2F1 élève la voie
// (mode 1, sauf pour le monorail, genre 3) ou l'abaisse (mode 2). Quand 0x2A2F1 rend −1, la voie ne
// descend plus : elle est effacée (0x2C6B8), et un sol marqué 0x400 est remis à zéro.
//
// **Sinon**, les quatre voisines sont examinées, jusqu'à deux morceaux du même genre : leur
// direction entre dans un masque, et 0xB8C11 en donne la forme de la pièce à poser. Au mode 0, cette
// forme est rendue telle quelle, et rien n'est posé. Sinon, chaque voisine trouvée est raccordée
// (sa forme devient celle de son masque de directions plus le bit de la direction) et le premier
// emplacement libre de la table des objets reçoit le nouveau morceau (type 0x12), qui hérite de la
// hauteur de la dernière voisine (+0x79) et du morceau maître de l'élément (+0x85).
//
// Sans voisine, la pose n'est possible qu'avec le bit 4 du mode — la première pièce d'une voie, que
// 0x2EBB7 pose contre la gare : le maître est alors le kiosque voisin (type 4, état 6).
//
// La case reçoit le sol 0x68 si elle n'en avait aucun, et le fond de la carte est refait.
const GENRE_DE_LA_VOIE = 0xB4;         // dans une fiche du catalogue des attractions
const OUVERTURES_DES_FORMES = 0xB8BD8; // le masque de directions d'une forme de rail
const FORMES_DE_RAIL = 0xB8C11;        // la forme d'après le masque des voisines
const BIT_DE_DIRECTION_RAIL = 0xB8C35;
const ELEMENTS_DES_VOIES = 0xB4397;    // 10 octets par genre : le mot +0 est l'élément de base

export function railsSurUneCase(jeu, numeroCase, mode, ficheAttraction) {
  const cel = cellule(jeu, numeroCase);
  const genre = () => s16(s8(jeu.m8[ATTRACTIONS + GENRE_DE_LA_VOIE + (ficheAttraction & 0xFFFF) * TAILLE_ATTRACTION]));
  const morceauDe = (c) => jeu.appeler(CHERCHER_SUR_LA_CASE, c, 0x12) >>> 0;
  const surPlace = morceauDe(cel);
  const drapeaux = drapeauxDuSol(jeu, cel);
  if (surPlace !== 0 || (jeu.m8[cel + 3] & 8) || drapeaux === 0x40 || drapeaux === 4 || drapeaux === 0x100) {
    return eleverOuAbaisserLaVoie(jeu, cel, surPlace, mode, genre());
  }
  if ((mode & 0xFFFF) === 2) {         // le bouton droit sur une case sans rails : la vider
    jeu.appeler(VIDER_LA_CASE, numeroCase & 0xFFFF);
    return 0;
  }

  // Les voisines du même genre, jusqu'à deux.
  let maitre = 0;
  const regarderLesVoisines = (raccorder) => {
    let masque = 0, compte = 0, hauteur = 0;
    for (let k = 0; k < 4 && compte < 2; k++) {
      const v = morceauDe(cel + pasDeLaDirection(jeu, k) * 4);
      if (v === 0) continue;
      if (mot(jeu, v + 0x16) !== genre()) continue;
      const ouvertures = jeu.m8[OUVERTURES_DES_FORMES + jeu.m8[v + 0xC]];
      if (ouvertures === 0 && jeu.m8[v + 0xC] !== 0) continue;
      compte++;
      masque = (masque | (1 << k)) & 0xFF;
      if (!raccorder) { maitre = mot(jeu, v + 0x85); continue; }
      // (L'original calcule ici un pas qu'il n'emploie pas : calcul mort, non transcrit.)
      jeu.m8[v + 0xC] = jeu.m8[FORMES_DE_RAIL + (jeu.m8[BIT_DE_DIRECTION + k] | ouvertures)];
      jeu.m8[v + 0x44] = jeu.m8[v + 0xC];
      ecrireMot(jeu, v + 0xA,
        objetDElement(jeu, mot(jeu, ELEMENTS_DES_VOIES + mot(jeu, v + 0x16) * 10) + jeu.m8[v + 0x44]));
      hauteur = jeu.m8[v + 0x79];
    }
    return [masque, hauteur];
  };

  let [masque] = regarderLesVoisines(false);
  if (masque === 0) {
    // Aucune voisine : seule la première pièce d'une voie neuve peut se poser (bit 4 du mode).
    if ((mode & 4) === 0) return 0;
    for (let k = 0; k < 4; k++) {
      const gare = jeu.appeler(CHERCHER_SUR_LA_CASE, cel + pasDeLaDirection(jeu, k) * 4, 4) >>> 0;
      if (gare !== 0 && jeu.m8[gare + 0xC] === 6) {
        maitre = diviser(gare - adresse(jeu, OBJETS), TAILLE_OBJET);
        break;
      }
    }
    if ((maitre & 0xFFFF) === 0) return 0;
  }
  if ((mode & 0xFFFF) === 0) return jeu.m8[FORMES_DE_RAIL + masque];

  let neuf = adresse(jeu, OBJETS) + TAILLE_OBJET;
  while (neuf < adresse(jeu, FIN_DES_OBJETS) && jeu.m8[neuf + 4] !== 0) neuf += TAILLE_OBJET;
  if (neuf === adresse(jeu, FIN_DES_OBJETS)) return 0;

  let hauteur;
  [masque, hauteur] = regarderLesVoisines(true);
  jeu.m8[neuf + 4] = 0x12;
  jeu.m8[neuf + 7] = (numeroCase & 0xFFFF) % TAILLE_CARTE;
  jeu.m8[neuf + 9] = (numeroCase & 0xFFFF) >> 6;
  jeu.m8[neuf + 0xC] = jeu.m8[FORMES_DE_RAIL + masque];
  jeu.m8[neuf + 0x79] = hauteur;
  ecrireMot(jeu, neuf + 0x16, genre());
  jeu.m8[neuf + 0x44] = jeu.m8[neuf + 0xC];
  ecrireMot(jeu, neuf + 0xA,
    objetDElement(jeu, mot(jeu, ELEMENTS_DES_VOIES + mot(jeu, neuf + 0x16) * 10) + jeu.m8[neuf + 0x44]));
  ecrireMot(jeu, neuf + 0x85, maitre);
  jeu.m8[neuf + 5] = (jeu.m8[neuf + 5] | (mode & 0xFC)) & 0xFF;
  jeu.appeler(POSER_EN_TETE, neuf, mot(jeu, neuf + 6), mot(jeu, neuf + 8));
  jeu.appeler(RACCORDER_LES_RAILS, cel, 0);
  if (jeu.m8[adresse(jeu, COMPTES) + 0x680] === 0xFF) jeu.m8[adresse(jeu, COMPTES) + 0x680] = 0;
  if (drapeauxDuSol(jeu, cel) === 0) jeu.m8[cel + 2] = 0x68;
  ecrireMot(jeu, REDESSINER_CARTE, 1);
  return 1;
}

// La case porte déjà un morceau de voie (ou refuse d'en recevoir un) : l'élever, l'abaisser, ou
// l'effacer quand elle ne peut plus descendre. Rend toujours 0.
function eleverOuAbaisserLaVoie(jeu, cel, morceau, mode, genre) {
  if (mot(jeu, morceau + 0x16) !== genre) return 0;
  if (jeu.m8[morceau + 5] & 4) return 0;
  const maitre = objet(jeu, mot(jeu, morceau + 0x85));
  if (maitre <= adresse(jeu, OBJETS)) return 0;
  if (jeu.m8[maitre + 0x4B] !== 0) return 0;   // la voie est déjà ouverte aux visiteurs
  if ((mode & 0xFFFF) === 1 && mot(jeu, morceau + 0x16) !== 3) {
    jeu.appeler(RACCORDER_LES_RAILS, cel, 1);
    return 0;
  }
  if ((mode & 0xFFFF) !== 2) return 0;
  if (s16(jeu.appeler(RACCORDER_LES_RAILS, cel, -1)) !== -1) return 0;
  jeu.appeler(EFFACER_LES_RAILS, mot(jeu, CASE_VISEE));
  if (jeu.m8[SOLS + 1 + jeu.m8[cel + 2] * 4] & 4) jeu.m8[cel + 2] = 0;   // le drapeau 0x400
  return 0;
}

// =================================================================================================
// 0x1788D — l'appui du bouton droit sur une zone de l'écran du parc.
//
// Sur un bouton de la barre d'outils, il ouvre le **catalogue surgissant** de l'article : chaque
// catalogue a sa fiche de 0x24F octets depuis 0xD6BCE, dont l'octet +9 dit s'il est fermé (2, posé
// par 0x12452 à l'entrée dans le parc et par 0x6A912 quand on le referme) ou ouvert (4). Fermé,
// 0x6A85C l'ouvre ; ouvert, 0x6AA49 le ramène devant. Chaque bouton pressé note aussi la première
// image de son animation (l'octet +8 de sa zone) et demande le redessin de la barre.
//
// Sur les réglages de l'objet choisi, il fait l'inverse du bouton gauche : baisser le remplissage,
// la durée d'un tour ou la vitesse d'une attraction. Sur la vue du parc, il poste la demande de
// **retrait** (sorte 0x24) de ce qui est sous le pointeur — sauf avec les rails en main (outil 10),
// où il poste la sorte 0x14, qui abaisse la voie.
//
//   zone 4   les chemins    : catalogue 0
//   zone 5   les barrières  : l'outil 3, sans catalogue
//   zone 6   les attractions: catalogue 1, et la gare remise à la disposition 2
//   zone 7   les boutiques  : catalogue 2
//   zone 8   les décors     : catalogue 3
//   zone 9   le personnel   : catalogue 4
//   zone 10  la carte du parc : la fenêtre 0xB
//   zone 11  le mode question : l'outil 8
//   zone 12  les jauges     : la fenêtre 0x13
//   zone 13  l'argent       : 0x77A55, un écran qui charge ses propres images et a sa propre boucle
//                             (lequel, non établi)
//   zone 16  le remplissage d'une attraction, baissé de 1 ou d'un dixième de son maximum (+0xA6)
//   zone 17  la durée d'un tour, baissée d'un huitième de son maximum (+0xAC), sur +0x34 et +0x36
//   zone 18  la vue amenée sur l'objet choisi, centré à l'écran
//   zone 21  la vitesse d'une attraction (+0x13), baissée de 1
//   zone 29  la vue du parc : la demande de retrait
//   zone 30  la barre des messages : la barre de menus (0x4FCC5)
//
// Les zones 14, 15, 19, 20 et 22 à 28 ne font rien. Chaque action finit par le bruitage 0 (le clic).
const CATALOGUES = 0xD6BCE, TAILLE_CATALOGUE = 0x24F, ETAT_DU_CATALOGUE = 9;
const OUVRIR_UN_CATALOGUE = 0x6A85C;   // le catalogue fermé : l'ouvrir
const CATALOGUE_DEVANT = 0x6AA49;      // le catalogue ouvert : le ramener au premier plan
const ECRAN_DE_L_ARGENT = 0x77A55;
const BARRE_DE_MENUS = 0x4FCC5;
const GARE_A_POSER = 0x680;            // octet des comptes : la disposition de la gare

export function boutonDroitSurUneZone(jeu, zone) {
  const z = zone & 0xFFFF;
  const clic = () => jeu.appeler(JOUER_UN_BRUITAGE, 0, 1);
  const imageDuBouton = () => { jeu.m8[IMAGE_DU_BOUTON] = jeu.m8[ZONES + 8 + z * TAILLE_ZONE]; };
  const catalogue = (n) => {
    if (jeu.m8[CATALOGUES + ETAT_DU_CATALOGUE + n * TAILLE_CATALOGUE] === 2) jeu.appeler(OUVRIR_UN_CATALOGUE, n);
    else jeu.appeler(CATALOGUE_DEVANT, n);
  };
  const choisi = () => objet(jeu, mot(jeu, OBJET_CHOISI));
  const ficheDeLObjetChoisi = () => ATTRACTIONS + mot(jeu, choisi() + 0x16);

  switch (z) {
    case 4:
      catalogue(0);
      imageDuBouton();
      jeu.m8[BARRE_A_REFAIRE] = 1;
      clic();
      return;
    case 5:
      ecrireMot(jeu, OUTIL, 3);
      imageDuBouton();
      jeu.m8[BARRE_A_REFAIRE] = 1;
      clic();
      return;
    case 6:
      catalogue(1);
      imageDuBouton();
      jeu.m8[adresse(jeu, COMPTES) + GARE_A_POSER] = 2;
      jeu.m8[BARRE_A_REFAIRE] = 1;
      clic();
      return;
    case 7: case 8: case 9: {
      catalogue({ 7: 2, 8: 3, 9: 4 }[z]);
      imageDuBouton();
      jeu.m8[BARRE_A_REFAIRE] = 1;
      clic();
      return;
    }
    case 10:
      jeu.appeler(OUVRIR_UNE_FENETRE, 0xB);
      imageDuBouton();
      jeu.m8[BARRE_A_REFAIRE] = 1;
      clic();
      return;
    case 11:
      ecrireMot(jeu, OUTIL, 8);
      imageDuBouton();
      jeu.m8[BARRE_A_REFAIRE] = 1;
      clic();
      return;
    case 12:
      jeu.appeler(OUVRIR_UNE_FENETRE, 0x13);
      imageDuBouton();
      jeu.m8[BARRE_A_REFAIRE] = 1;
      clic();
      return;
    case 13:
      imageDuBouton();
      jeu.appeler(ECRAN_DE_L_ARGENT);
      clic();
      return;
    case 0x10:                          // zone 16 : baisser le remplissage
      if (mot(jeu, OBJET_CHOISI) !== 0 && mot(jeu, choisi() + 0x26) > 0) {
        const maximum = motSigne(jeu, ficheDeLObjetChoisi() + 0xA6);
        if (maximum < 10) ecrireMot(jeu, choisi() + 0x26, mot(jeu, choisi() + 0x26) - 1);
        else ecrireMot(jeu, choisi() + 0x26, mot(jeu, choisi() + 0x26) - diviser(maximum, 10));
      }
      clic();
      return;
    case 0x11: {                        // zone 17 : baisser la durée d'un tour
      if (mot(jeu, OBJET_CHOISI) !== 0 && motSigne(jeu, choisi() + 0x34) > 0) {
        const pas = mot(jeu, ficheDeLObjetChoisi() + 0xAC) >> 3;
        ecrireMot(jeu, choisi() + 0x34, motSigne(jeu, choisi() + 0x34) - pas);
        ecrireMot(jeu, choisi() + 0x36, motSigne(jeu, choisi() + 0x36) - pas);
      }
      clic();
      return;
    }
    case 0x12:                          // zone 18 : amener la vue sur l'objet choisi
      if (mot(jeu, OBJET_CHOISI) !== 0) {
        centrerLaVueSur(jeu, choisi());
        jeu.appeler(RECADRER_CAMERA);
        ecrireMot(jeu, REDESSINER_CARTE, 1);
      }
      clic();
      return;
    case 0x15:                          // zone 21 : baisser la vitesse
      if (mot(jeu, OBJET_CHOISI) !== 0 && jeu.m8[choisi() + 0x13] > 0) {
        jeu.m8[choisi() + 0x13] = (jeu.m8[choisi() + 0x13] - 1) & 0xFF;
      }
      clic();
      return;
    case 0x1D:                          // zone 29 : la vue du parc
      ecrireMot(jeu, POINTEUR_SUR_LE_PARC, 4);
      if (motSigne(jeu, ECRAN_COURANT) !== 0) return;
      retirerSousLePointeur(jeu);
      return;
    case 0x1E:                          // zone 30 : la barre des messages
      jeu.appeler(BARRE_DE_MENUS);
      return;
    default:
      return;
  }
}

// Amener la caméra de façon à montrer l'objet au milieu de l'écran : 640 pixels de large, 400 ou 480
// de haut selon le mode, divisés par la tuile puis par deux. (Plus en grande vue, grande-vue.js.)
// L'obliquité des rangées n'est pas comptée : l'objet tombe à droite et en bas du milieu. Hors du jeu
// d'origine, réglage corrigerLeCadrageSurUnObjet allumé, la caméra qui le met au milieu de la vue du
// parc (corrections.js). Dans les deux cas, la page est prévenue (vue-fluide.js), pour y amener aussi
// la portion zoomée qu'elle montre.
function centrerLaVueSur(jeu, o) {
  const corrigee = cameraCentreeSurLObjet(jeu, o);
  if (corrigee) {
    ecrireMot(jeu, CAMERA_COLONNE, corrigee[0]);
    ecrireMot(jeu, CAMERA_RANGEE, corrigee[1]);
  } else {
    ecrireMot(jeu, CAMERA_COLONNE, jeu.m8[o + 7] - diviser(diviser(largeurDeLaVue(jeu), mot(jeu, LARGEUR_TUILE)), 2));
    const hauteur = (jeu.m8[MODE_AFFICHAGE] & 1) ? 0x190 : hauteurDeLaVue(jeu);
    const tuile = mot(jeu, HAUTEUR_TUILE);
    ecrireMot(jeu, CAMERA_RANGEE, jeu.m8[o + 9] - diviser(diviser(tuile + hauteur - 1, tuile), 2));
  }
  noterLeCadrageSurUnObjet(jeu, o);
}

// Le bouton droit sur la vue du parc : poster la demande de retrait. Avec une attraction en main
// (outil 5), la gare passe à la disposition suivante quand le genre de l'attraction est 6 (une
// attraction à voie) ; avec les rails (outil 10), la demande 0x14 abaisse la voie au lieu de
// l'ôter. L'outil 26, qui vaut 5 partout ailleurs, n'a droit ici à aucun de ces égards.
function retirerSousLePointeur(jeu) {
  const outil = mot(jeu, OUTIL);
  const demande = NOUVELLE_DEMANDE + mot(jeu, JOUEUR_COURANT) * 6;
  if (outil === 5) {
    if (mot(jeu, ATTRACTIONS + 0xB0 + mot(jeu, FICHE_ATTRACTION) * TAILLE_ATTRACTION) === 6) {
      const comptes = adresse(jeu, COMPTES);
      jeu.m8[comptes + GARE_A_POSER] = (jeu.m8[comptes + GARE_A_POSER] + 1) & 3;
    }
  } else if (outil === 0xA) {
    jeu.m8[demande] = 0x14;
    ecrireMot(jeu, demande + 1, mot(jeu, CASE_VISEE));
    ecrireMot(jeu, demande + 3, (mot(jeu, FICHE_ATTRACTION) << 2) + 2);
    return;
  }
  jeu.m8[demande] = 0x24;
  ecrireMot(jeu, demande + 1, mot(jeu, CASE_VISEE));
}

// =================================================================================================
// 0x15FBD — l'appui du bouton gauche sur une zone de l'écran du parc.
//
// Le numéro de zone est ramené de 4 à 0 et aiguillé par une table de sauts de 27 entrées (0x15FC6) :
// au-delà de la zone 30, rien. Les zones 14 et 15 (les panneaux inertes) ne font rien non plus.
//
//   zone 4   les chemins    : l'outil du chemin en main (le mot +8 de sa fiche)
//   zone 5   les barrières  : l'outil 3
//   zone 6   les attractions: la fenêtre 1 si l'écran n'est pas déjà 0x36 ; et, toujours, la gare
//                             remise à la disposition 2
//   zone 7   les boutiques  : la fenêtre 0x14 pour un jeu d'adresse (famille 8), sinon 2
//   zone 8   les décors     : la fenêtre 4          zone 9  le personnel : la fenêtre 3
//   zone 10  la carte du parc : 0x40641 la prépare, puis l'écran 0x12
//   zone 11  le mode question : l'écran fermé, et l'outil 8
//   zone 12  les jauges     : la fenêtre 0x13       zone 13  l'argent : la fenêtre 0
//   zone 16  le remplissage d'une attraction, monté de 1 ou d'un dixième de son maximum (+0xA6) et
//            borné à ce maximum ; pour un agent d'entretien (métier 0x16), 0x64387 à la place
//   zone 17  la durée d'un tour, montée d'un huitième du maximum (+0xAC), sur +0x34 et +0x36
//   zone 18  la fiche de l'objet choisi : la fenêtre dépend de son type (voir `ouvrirLaFiche`)
//   zone 19  la sécurité d'une attraction (0x3302A appelle le mécanicien le plus proche et pose
//            l'octet +0xC4), ou l'outil 0x15 pour un employé à l'état 8 (le mécanicien)
//   zone 20  ouvrir ou fermer une attraction, ou prendre en main l'employé choisi (voir
//            `ouvrirOuFermer`)
//   zone 21  la vitesse d'une attraction (+0x13), montée de 1 jusqu'à 5
//   zone 22  la fiche du premier article marqué du bit 1 dans les catalogues des attractions puis
//            des boutiques (fenêtre 0x12) ; s'il n'y en a qu'un au plus, l'octet 0xD7768 retombe
//   zones 23 à 26  la vue amenée sur l'employé suivant du métier 2, 8, 0x34 ou 0x16 ; les zones 27
//            et 28 parcourent la table sans jamais rien trouver
//   zone 29  la vue du parc : **poser ce que le joueur tient**
//   zone 30  la barre des messages : la barre de menus (0x4FCC5)
//
// Chaque bouton note la première image de son animation et joue le bruitage 0 (le clic).
const LISTE_DES_ATTRACTIONS = 0xD6610;   // mot : l'article que la fenêtre 0x12 présente
const GENRE_DE_LA_LISTE = 0xD6614;       // mot : 4 une attraction, 0xA une boutique
const MECANICIEN_DEMANDE = 0x5D2;        // octet des comptes : l'état d'où vient l'employé pris
const TEXTES = 0xD7BD0;                  // pointeur sur la table des textes
const PREPARER_LA_CARTE = 0x40641;
const COMMANDER_UN_EMPLOYE = 0x64387;    // (zone, employé)
const APPELER_LE_MECANICIEN = 0x3302A;   // (attraction) : rend non nul si un mécanicien vient
const FERMER_L_ATTRACTION = 0x31668;
const OTER_LES_TRAINS = 0x41EB4;
const FERMER_LE_MONORAIL = 0x448BA;
const EVALUER_LE_MONORAIL = 0x44439;     // (attraction, relever) comme 0x43689, pour le genre 0xDB
const OUVRIR_TOUTES_LES_VOIES = 0x447E3; // (attraction, prix)
const OUVRIR_L_ATTRACTION = 0x41936;     // (fiche, attraction, remplissage)
const ANNULER_L_ENTREE = 0x31D32;
const DEPENSE_CONSTRUCTION = 0x17;       // la catégorie du livre des comptes

export function boutonGaucheSurUneZone(jeu, zone) {
  const index = (zone - 4) & 0xFFFF;
  if (index > 0x1A) return;
  const clic = () => jeu.appeler(JOUER_UN_BRUITAGE, 0, 1);
  const imageDuBouton = () => { jeu.m8[IMAGE_DU_BOUTON] = jeu.m8[ZONES + 8 + (zone & 0xFFFF) * TAILLE_ZONE]; };
  const ecran = () => mot(jeu, ECRAN_COURANT);
  const choisi = () => objet(jeu, mot(jeu, OBJET_CHOISI));
  const metierDe = (o) => mot(jeu, METIERS + jeu.m8[o + 0x59] * TAILLE_METIER + ETAT_D_EMBAUCHE);
  const ficheAttractionDe = (o) => ATTRACTIONS + mot(jeu, o + 0x16);

  switch (index) {
    case 0:                             // zone 4 : les chemins
      ecrireMot(jeu, OUTIL, mot(jeu, CHEMINS + 8 + mot(jeu, FICHE_CHEMIN) * TAILLE_CHEMIN));
      imageDuBouton();
      jeu.m8[BARRE_A_REFAIRE] = 1;
      clic();
      return;
    case 1:                             // zone 5 : les barrières de file
      ecrireMot(jeu, OUTIL, 3);
      imageDuBouton();
      jeu.m8[BARRE_A_REFAIRE] = 1;
      clic();
      return;
    case 2:                             // zone 6 : les attractions
      if (ecran() !== 0x36) {
        imageDuBouton();
        jeu.appeler(OUVRIR_UNE_FENETRE, 1);
        clic();
      }
      jeu.m8[adresse(jeu, COMPTES) + GARE_A_POSER] = 2;
      return;
    case 3:                             // zone 7 : les boutiques
      if (ecran() !== 0x3A) {
        imageDuBouton();
        const famille = jeu.m8[BOUTIQUES + 0x24 + mot(jeu, FICHE_BOUTIQUE) * TAILLE_BOUTIQUE];
        jeu.appeler(OUVRIR_UNE_FENETRE, famille === 8 ? 0x14 : 2);
        clic();
      }
      return;
    case 4:                             // zone 8 : les arbres et les décors
      if (ecran() !== 0x3E) { imageDuBouton(); jeu.appeler(OUVRIR_UNE_FENETRE, 4); clic(); }
      return;
    case 5:                             // zone 9 : le personnel
      if (ecran() !== 0x3C) { imageDuBouton(); jeu.appeler(OUVRIR_UNE_FENETRE, 3); clic(); }
      return;
    case 6:                             // zone 10 : la carte du parc
      if (ecran() !== 0x12) {
        jeu.appeler(PREPARER_LA_CARTE);
        ecrireMot(jeu, ECRAN_COURANT, 0x12);
        imageDuBouton();
        clic();
      }
      return;
    case 7:                             // zone 11 : le mode question
      if (ecran() !== 0) { ecrireMot(jeu, ECRAN_COURANT, 0); ecrireMot(jeu, REDESSINER_CARTE, 1); }
      ecrireMot(jeu, OUTIL, 8);
      imageDuBouton();
      clic();
      return;
    case 8:                             // zone 12 : les deux barres de jauges
      if (ecran() !== 8) { jeu.appeler(OUVRIR_UNE_FENETRE, 0x13); imageDuBouton(); clic(); }
      return;
    case 9:                             // zone 13 : l'argent
      if (ecran() !== 0x38) { imageDuBouton(); jeu.appeler(OUVRIR_UNE_FENETRE, 0); clic(); }
      return;
    case 0xA: case 0xB:                 // zones 14 et 15 : les deux panneaux inertes
      return;

    case 0xC:                           // zone 16 : monter le remplissage
      if (mot(jeu, OBJET_CHOISI) !== 0) {
        const o = choisi();
        if (metierDe(o) === 0x16) {
          if (ecran() === 0) jeu.appeler(COMMANDER_UN_EMPLOYE, zone & 0xFF, o);
        } else {
          const fiche = ficheAttractionDe(o);
          const maximum = motSigne(jeu, fiche + 0xA6);
          if (mot(jeu, o + 0x26) < maximum) {
            if (maximum < 10) ecrireMot(jeu, o + 0x26, mot(jeu, o + 0x26) + 1);
            else ecrireMot(jeu, o + 0x26, mot(jeu, o + 0x26) + diviser(maximum, 10));
          }
          if (mot(jeu, o + 0x26) > maximum) ecrireMot(jeu, o + 0x26, mot(jeu, fiche + 0xA6));
        }
        clic();
      }
      return;

    case 0xD:                           // zone 17 : monter la durée d'un tour
      if (mot(jeu, OBJET_CHOISI) !== 0) {
        const o = choisi();
        if (metierDe(o) === 0x16) {
          jeu.appeler(COMMANDER_UN_EMPLOYE, zone & 0xFF, o);
        } else {
          const maximum = mot(jeu, ficheAttractionDe(o) + 0xAC);
          if (motSigne(jeu, o + 0x34) < maximum) {
            ecrireMot(jeu, o + 0x34, motSigne(jeu, o + 0x34) + (maximum >> 3));
            ecrireMot(jeu, o + 0x36, motSigne(jeu, o + 0x36) + (maximum >> 3));
          }
        }
      }
      clic();
      return;

    case 0xE:                           // zone 18 : la fiche de l'objet choisi
      if (mot(jeu, OBJET_CHOISI) !== 0) { ouvrirLaFiche(jeu, choisi()); clic(); }
      return;

    case 0xF:                           // zone 19 : la sécurité, ou le mécanicien qu'on prend
      if (mot(jeu, OBJET_CHOISI) !== 0) {
        const o = choisi();
        const type = jeu.m8[o + 4];
        if (type === 4) {
          if ((jeu.appeler(APPELER_LE_MECANICIEN, o) & 0xFFFF) !== 0) {
            jeu.m8[o + 0xC4] = 8;
            clic();                     // deux bruitages de suite : le second vient après
          }
        } else if (type === 8) {
          if (jeu.m8[o + 4] === 8 && jeu.m8[o + 0xC] === 8) ecrireMot(jeu, OUTIL, 0x15);
          clic();
        }
        clic();
      }
      return;

    case 0x10:                          // zone 20 : ouvrir ou fermer, ou déplacer l'employé
      if (mot(jeu, OBJET_CHOISI) !== 0) { ouvrirOuFermer(jeu, choisi()); clic(); }
      return;

    case 0x11:                          // zone 21 : monter la vitesse
      if (mot(jeu, OBJET_CHOISI) !== 0) {
        const o = choisi();
        if (metierDe(o) === 0x16) {
          if (ecran() === 0) jeu.appeler(COMMANDER_UN_EMPLOYE, zone & 0xFF, o);
        } else if (jeu.m8[o + 0x13] < 6) {
          jeu.m8[o + 0x13] = (jeu.m8[o + 0x13] + 1) & 0xFF;
        }
        clic();
      }
      return;

    case 0x12:                          // zone 22 : la fiche du premier article marqué
      montrerLesArticlesMarques(jeu);
      return;

    case 0x19:                          // zone 29 : la vue du parc
      if (ecran() !== 0) return;
      poserDansLaVue(jeu);
      return;

    case 0x1A:                          // zone 30 : la barre des messages
      jeu.appeler(BARRE_DE_MENUS);
      return;

    default:                            // zones 23 à 28 : l'employé suivant d'un métier
      amenerLaVueSurLEmployeSuivant(jeu, zone);
      return;
  }
}

// Zone 18 : la fenêtre de la fiche, selon le type de l'objet choisi. Un employé a une fenêtre par
// métier (l'état d'embauche de son catalogue) ; une boutique, deux selon sa famille — le jeu
// d'adresse (famille 8) fait passer à la barre d'outils son lot (+0x4D), son prix (+0x4F) et sa
// chance (+0x5D).
function ouvrirLaFiche(jeu, o) {
  const type = jeu.m8[o + 4];
  if (type === 2) {                     // un visiteur
    jeu.appeler(OUVRIR_UNE_FENETRE, 6);
  } else if (type === 4) {              // une attraction
    jeu.appeler(OUVRIR_UNE_FENETRE, 0xD);
  } else if (type === 8) {              // le personnel
    const metier = mot(jeu, METIERS + jeu.m8[o + 0x59] * TAILLE_METIER + ETAT_D_EMBAUCHE);
    if (metier === 2) jeu.appeler(OUVRIR_UNE_FENETRE, 8);
    else if (metier === 8) jeu.appeler(OUVRIR_UNE_FENETRE, 9);
    else if (metier === 0x16) jeu.appeler(OUVRIR_UNE_FENETRE, 7);
    else if (metier === 0x34) jeu.appeler(OUVRIR_UNE_FENETRE, 0xA);
  } else if (type === 0xA) {            // une boutique
    const fiche = BOUTIQUES + mot(jeu, o + 0x16);
    if (jeu.m8[fiche + 0x24] === 8) {
      jeu.appeler(OUVRIR_UNE_FENETRE, 0x11);
      ecrireMot(jeu, 0xD6618, mot(jeu, fiche + 0x4D));
      ecrireMot(jeu, 0xD661A, mot(jeu, fiche + 0x4F));
      jeu.m8[0xD7785] = jeu.m8[fiche + 0x5D];
    } else {
      jeu.appeler(OUVRIR_UNE_FENETRE, 0xC);
    }
  } else if (type === 0x18) {           // une installation
    if (jeu.m8[o + 0xC] === 2) jeu.appeler(OUVRIR_UNE_FENETRE, 0x15);
  }
}

// Zone 20 : le bouton qui ouvre ou ferme. Un employé qu'on n'est pas en train de commander (états
// 0xA à 0x10) passe à l'état 0x2A et vient sous le pointeur (outil 0x13) ; son état de départ est
// gardé dans les comptes pour qu'on puisse le lui rendre.
//
// Une attraction ouverte (+0x4B = 1) se ferme : celle qui a une gare (état 6) renvoie ses clients
// (0x31668) et ôte ses trains (0x41EB4), et le joueur reprend les rails en main (outil 10) — ou,
// pour le genre 0xDB, 0x448BA fait les deux. Une attraction fermée s'ouvre : celle qui a une gare
// doit d'abord avoir un circuit complet (0x43689, ou 0x44439 pour le genre 0xDB, rendent un plaisir
// négatif si la voie ne boucle pas, et le joueur reprend les rails) et de quoi la payer, sinon
// l'écran 0x56 dit le manque d'argent ; sinon elle s'ouvre tout de suite (+0x4B = 1).
//
// L'attraction ouverte est payée une seule fois : l'octet +0xBF retient que la facture a été
// inscrite au livre (catégorie 0x17).
function ouvrirOuFermer(jeu, o) {
  const type = jeu.m8[o + 4];
  if (type === 8) {                     // un employé : le prendre en main
    if ((jeu.m8[o + 0xC] < 0xA || jeu.m8[o + 0xC] > 0x10) && mot(jeu, ECRAN_COURANT) === 0) {
      ecrireMot(jeu, OUTIL, 0x13);
      jeu.m8[adresse(jeu, COMPTES) + MECANICIEN_DEMANDE] = jeu.m8[o + 0xC];
      jeu.m8[o + 0xC] = 0x2A;
    }
    return;
  }
  if (type !== 4) return;
  ecrireMot(jeu, FICHE_ATTRACTION, diviser(mot(jeu, o + 0x16), TAILLE_ATTRACTION));
  const monorail = () => mot(jeu, ATTRACTIONS + 0x22 + mot(jeu, o + 0x16)) === 0xDB;

  if (jeu.m8[o + 0x4B] === 1) {         // elle est ouverte : la fermer
    if (jeu.m8[o + 0xC] === 6) {
      if (monorail()) {
        jeu.appeler(FERMER_LE_MONORAIL, o);
      } else {
        jeu.appeler(FERMER_L_ATTRACTION, o);
        jeu.appeler(OTER_LES_TRAINS, o);
      }
      ecrireMot(jeu, OUTIL, 0xA);
      ecrireMot(jeu, DROIT_ENFONCE, 0);
      ecrireMot(jeu, GAUCHE_ENFONCE, mot(jeu, DROIT_ENFONCE));
    } else {
      jeu.appeler(FERMER_L_ATTRACTION, o);
    }
    return;
  }
  if (jeu.m8[o + 0x4B] !== 0) return;
  if (jeu.m8[o + 0xC] !== 6) {          // sans gare : elle s'ouvre tout de suite
    jeu.m8[o + 0x4B] = 1;
    return;
  }

  const prix = jeu.appeler(monorail() ? EVALUER_LE_MONORAIL : EVALUER_LA_VOIE, o, 1) | 0;
  if (prix < 0) {                       // la voie ne boucle pas : reprendre les rails en main
    ecrireMot(jeu, OUTIL, 0xA);
    if (monorail()) {
      ecrireMot(jeu, DROIT_ENFONCE, 0);
      ecrireMot(jeu, GAUCHE_ENFONCE, mot(jeu, DROIT_ENFONCE));
    }
    return;
  }
  const joueur = adresse(jeu, FICHE_JOUEUR);
  if (motLongSigne(jeu, joueur + 0x0A) - prix - motLongSigne(jeu, joueur + 0x0E) < 0 && jeu.m8[o + 0xBF] === 0) {
    ecrireMot(jeu, ECRAN_COURANT, 0x56);
    jeu.appeler(MANQUE_D_ARGENT, adresse(jeu, COMPTES) + 0x1B1, motLong(jeu, adresse(jeu, TEXTES) + 0x394), prix);
    return;
  }
  if (monorail()) {
    jeu.appeler(OUVRIR_TOUTES_LES_VOIES, o, prix);
    ecrireMot(jeu, OUTIL, 0);
    return;
  }
  const ouverte = jeu.appeler(OUVRIR_L_ATTRACTION, ATTRACTIONS + mot(jeu, o + 0x16), o, mot(jeu, o + 0x26));
  if ((ouverte & 0xFF) !== 0) {
    jeu.m8[o + 0x4B] = 1;
    if (jeu.m8[o + 0xBF] === 0) {
      jeu.appeler(INSCRIRE_AU_LIVRE, DEPENSE_CONSTRUCTION, (-prix) | 0);
      jeu.m8[o + 0xBF] = 1;
    }
  }
  ecrireMot(jeu, OUTIL, 0);
}

// Zone 22 : ouvrir la fiche (fenêtre 0x12) du premier article marqué du bit 1, d'abord parmi les
// attractions du catalogue, puis parmi les boutiques ; les deux catalogues sont parcourus en entier,
// mais seul le premier article marqué ouvre une fenêtre. Un article au plus fait retomber 0xD7768.
// Le rôle de ce bit, et celui de 0xD7768, ne sont pas établis.
function montrerLesArticlesMarques(jeu) {
  let marques = 0;
  for (let k = 0; mot(jeu, ATTRACTIONS + 0x22 + (k & 0xFFFF) * TAILLE_ATTRACTION) !== 0; k = (k + 1) | 0) {
    if ((jeu.m8[ATTRACTIONS + 0xC5 + (k & 0xFFFF) * TAILLE_ATTRACTION] & 2) === 0) continue;
    marques = (marques + 1) | 0;
    if ((marques & 0xFFFF) !== 1) continue;
    ecrireMot(jeu, LISTE_DES_ATTRACTIONS, (k & 0xFFFF) * TAILLE_ATTRACTION);
    ecrireMot(jeu, GENRE_DE_LA_LISTE, 4);
    jeu.appeler(OUVRIR_UNE_FENETRE, 0x12);
  }
  for (let k = 0; mot(jeu, BOUTIQUES + 0x22 + (k & 0xFFFF) * TAILLE_BOUTIQUE) !== 0; k = (k + 1) | 0) {
    if ((jeu.m8[BOUTIQUES + 0x66 + (k & 0xFFFF) * TAILLE_BOUTIQUE] & 2) === 0) continue;
    marques = (marques + 1) | 0;
    if ((marques & 0xFFFF) !== 1) continue;
    ecrireMot(jeu, LISTE_DES_ATTRACTIONS, (k & 0xFFFF) * TAILLE_BOUTIQUE);
    ecrireMot(jeu, GENRE_DE_LA_LISTE, 0xA);
    jeu.appeler(OUVRIR_UNE_FENETRE, 0x12);
  }
  if ((marques & 0xFFFF) <= 1) jeu.m8[ARTICLE_MARQUE] = 0;
}

// Zones 23 à 28 : amener la vue sur l'employé suivant du métier que la zone demande. La table des
// objets est parcourue à partir de celui qui suit le dernier montré (mot +0x63D des comptes) et
// boucle jusqu'à revenir sur lui. Les zones 27 et 28 n'ont pas de métier : elles font le tour sans
// rien trouver.
//
// Anomalie reproduite : au bout de la table, le parcours repart de l'emplacement 0, qui n'est jamais
// un objet (la table commence à l'emplacement 1) ; il est donc simplement sauté.
const METIER_DE_LA_ZONE = { 0: 2, 1: 8, 2: 0x34, 3: 0x16 };

function amenerLaVueSurLEmployeSuivant(jeu, zone) {
  const comptes = () => adresse(jeu, COMPTES);
  let o = objet(jeu, mot(jeu, comptes() + 0x63D) + 1);
  for (;;) {
    if (jeu.m8[o + 4] === 8) {
      ecrireMot(jeu, OBJET_CHOISI, diviser(o - adresse(jeu, OBJETS), TAILLE_OBJET));
      ecrireMot(jeu, GAUCHE_ENFONCE, 0);
      const rang = (zone - 0x17) & 0xFFFF;
      const metier = METIER_DE_LA_ZONE[rang];
      if (rang <= 5 && metier !== undefined
        && mot(jeu, METIERS + jeu.m8[o + 0x59] * TAILLE_METIER + ETAT_D_EMBAUCHE) === metier) {
        centrerLaVueSur(jeu, o);
        ecrireMot(jeu, comptes() + 0x63D, diviser(o - adresse(jeu, OBJETS), TAILLE_OBJET));
        ecrireMot(jeu, REDESSINER_CARTE, 1);
        jeu.appeler(RECADRER_CAMERA);
        return;
      }
    }
    if (objet(jeu, mot(jeu, comptes() + 0x63D)) === o) return;
    o = (adresse(jeu, FIN_DES_OBJETS) - TAILLE_OBJET === o) ? adresse(jeu, OBJETS) : o + TAILLE_OBJET;
  }
}

// Zone 29 : poser ce que le joueur tient. La plupart des outils postent une demande de pose (voir
// l'en-tête du module) que 0x2CCF8 exécutera en fin d'image ; tous oublient le double-clic en
// attente. Deux outils agissent sur place : 11, qui cherche où poser l'entrée de l'attraction, et
// 17, qui abandonne la pose de la sortie (0x31D32). L'outil 19 ne pose l'employé qu'il porte que si
// le sol de la case l'accepte : ses drapeaux ne doivent rien croiser de 0x39C5 (mur, sol
// d'attraction, file, sortie, circuit, eau et deux drapeaux non établis).
function poserDansLaVue(jeu) {
  ecrireMot(jeu, POINTEUR_SUR_LE_PARC, 4);
  const outil = mot(jeu, OUTIL);
  const demande = NOUVELLE_DEMANDE + mot(jeu, JOUEUR_COURANT) * 6;
  const poster = (sorte, parametre) => {
    jeu.m8[demande] = sorte;
    ecrireMot(jeu, demande + 1, mot(jeu, CASE_VISEE));
    if (parametre !== undefined) ecrireMot(jeu, demande + 3, parametre);
    ecrireMot(jeu, DOUBLE_CLIC_EN_ATTENTE, 0);
  };
  switch (outil) {
    case 5: case 0x1A:                  // une attraction (l'outil 26 fait comme le 5)
      poster(0x0A, mot(jeu, FICHE_ATTRACTION));
      return;
    case 6: poster(0x0C); return;       // une boutique
    case 7: poster(0x0E); return;       // un arbre ou un décor
    case 9: poster(0x10, mot(jeu, FICHE_EMPLOYE)); return;
    case 0xA: poster(0x12, (mot(jeu, FICHE_ATTRACTION) << 2) + 1); return;   // les rails
    case 0xB: chercherOuMettreLEntree(jeu); return;
    case 0xC: poster(0x16); return;     // un looping
    case 0xD: poster(0x18); return;     // la sortie d'une attraction
    case 0xE: poster(0x1A, mot(jeu, CHEMINS + 4 + mot(jeu, FICHE_CHEMIN) * TAILLE_CHEMIN)); return;
    case 0xF: poster(0x1C); return;     // un panneau indicateur
    case 0x11:                          // abandonner la pose de la sortie
      jeu.appeler(ANNULER_L_ENTREE);
      ecrireMot(jeu, OUTIL, 0);
      ecrireMot(jeu, DOUBLE_CLIC_EN_ATTENTE, 0);
      return;
    case 0x12: poster(0x20, mot(jeu, FICHE_ATTRACTION)); return;   // le mécanicien qu'on envoie
    case 0x13:                          // l'employé qu'on porte : seulement sur un sol libre
      if ((drapeauxDuSol(jeu, celluleVisee(jeu)) & 0x39C5) !== 0) return;
      poster(0x22, mot(jeu, OBJET_CHOISI));
      ecrireMot(jeu, OUTIL, 0);
      return;
    case 0x14: poster(0x2C, mot(jeu, OBJET_CHOISI)); return;
    case 0x16:                          // l'entrée du parc : la pose est finie
      ecrireMot(jeu, OUTIL, 0);
      ecrireMot(jeu, DOUBLE_CLIC_EN_ATTENTE, 0);
      return;
    default:                            // 0 à 4, 8, 0x10, 0x15, 0x17 et au-delà : rien
      return;
  }
}

const celluleVisee = (jeu) => cellule(jeu, mot(jeu, CASE_VISEE));

// Outil 11 : l'entrée de l'attraction qu'on vient de poser (mot +0x2D0 des comptes). Le kiosque
// (type 6, état différent de 0x1E) mène à son attraction, dont le mot +0x73 est la case de l'entrée
// cherchée. Les 22 décalages de la fiche du genre (mots depuis +0x34) sont essayés depuis la case de
// l'attraction moins son décalage d'origine (+0x2A) : celui qui tombe sur +0x73 donne le sol à
// poser (mot +0x60 de la fiche), rangé dans les comptes avec la case (+0x2BA et +0x2BC).
// L'outil passe à 17 (la sortie) dans tous les cas ; sans entrée à trouver, 0x31D32 défait tout et
// l'outil retombe à 0.
function chercherOuMettreLEntree(jeu) {
  ecrireMot(jeu, OUTIL, 0x11);
  const comptes = adresse(jeu, COMPTES);
  let o = objet(jeu, mot(jeu, comptes + 0x2D0));
  const abandonner = () => {
    jeu.appeler(ANNULER_L_ENTREE);
    ecrireMot(jeu, OUTIL, 0);
    ecrireMot(jeu, comptes + 0x2BC, 0);
    ecrireMot(jeu, comptes + 0x2BA, 0);
    ecrireMot(jeu, DOUBLE_CLIC_EN_ATTENTE, 0);
  };
  if (jeu.m8[o + 4] !== 6 || jeu.m8[o + 0xC] === 0x1E) return abandonner();
  o = objet(jeu, mot(jeu, o + 0x16));
  if (mot(jeu, o + 0x73) === 0) return abandonner();

  const fiche = ATTRACTIONS + mot(jeu, o + 0x16);
  const base = ((jeu.m8[o + 9] << 6) + jeu.m8[o + 7] - mot(jeu, fiche + 0x2A)) & 0xFFFF;
  for (let k = 0; (k & 0xFFFF) < 0x16; k = (k + 1) | 0) {
    if (base + motSigne(jeu, fiche + (k & 0xFFFF) * 2 + 0x34) !== mot(jeu, o + 0x73)) continue;
    ecrireMot(jeu, comptes + 0x2BC, mot(jeu, o + 0x73));
    ecrireMot(jeu, comptes + 0x2BA, mot(jeu, fiche + (k & 0xFFFF) * 2 + 0x60));
    break;
  }
  ecrireMot(jeu, 0xD662A, 0);           // mot remis à zéro à chaque essai ; rôle non établi
}

// =================================================================================================
// 0x2EBB7 — construire une attraction sur une case.
//
// Appelée par 0x2CCF8 quand elle traite une demande de sorte 0x0A. `fiche` est le rang du genre dans
// le catalogue 0xCCED0 (§ 10.3), dont voici les champs employés :
//
//   +0x22  un nombre : 0x64 (100) marque un genre à part (voir plus bas)
//   +0x24  l'élément de l'objet graphique de l'attraction (0 : aucun)
//   +0x2A  le décalage de la case de l'attraction depuis celle qu'on montre
//   +0x2C, +0x2D  sa position fine dans la case
//   +0x2E  0x26A : le kiosque prend l'objet graphique de la gare (0xB7AE2) ; 0 : aucun objet ;
//          sinon celui de sa direction (0xB7ADA)
//   +0x30  le décalage de la case du kiosque
//   +0x32  le décalage de la case de l'entrée (−9999 : aucune entrée)
//   +0x34 … +0x5E  22 décalages de cases (mots signés) : l'emprise
//   +0x60 … +0x8A  les 22 images de sol correspondantes (0 : la case n'est pas de l'emprise)
//   +0x8C  0x0F : l'attraction n'a pas d'entrée à poser
//   +0xA2  le coût, mot long        +0xA6  le remplissage       +0xA9  l'attrait
//   +0xAC  la durée d'un tour       +0xAE  un mot non établi    +0xB0  le genre
//   +0xB4  le genre de voie         +0xB8  la vitesse de départ +0xBA  le prix d'une case de voie
//   +0xBC, +0xBE  pour la rivière : un élément et un genre      +0xC7  le nombre possédés
//
// **Le genre** (+0xB0) mène à quatre chemins : 4 et 0x1C veulent un circuit d'allées fermé autour de
// la case (un circuit automobile, vraisemblablement), 6 veut de la place pour les cinq cases de la
// gare d'une attraction à voie, 0x1E est la rivière, et les autres se posent tels quels.
//
// **Les contrôles**, dans l'ordre : les 22 cases de l'emprise doivent être libres de sol et non
// réservées ; le genre 100 refuse les deux cases de la rangée suivante si elles sont réservées ; la
// case du portique de la gare (table 0xB7A45, la disposition en cours étant l'octet +0x680 des
// comptes) doit être sans sol ; il faut deux emplacements libres dans la table des objets (le
// kiosque et l'attraction), et un troisième pour les genres 4, 6 et 0x1C (le second kiosque) ; enfin
// le solde doit couvrir le coût, sinon l'écran 0x56 dit le manque d'argent.
//
// **La pose** : les sols de l'emprise sont posés (chaque case étant d'abord vidée par 0x205D7), le
// sol 0xAB marque la case du portique, puis l'attraction (type 4, ouverte) et son kiosque (type 6)
// sont créés et mis sur leurs cases. Le coût va à l'engagement du joueur (+0x0E, par centaines), à
// ses dépenses (+0x37) et dans le mot +0x5B de l'attraction. La fiche du parc compte une attraction
// de plus (+0x82), son attrait moyen (+0x8A, l'attrait divisé par le nombre d'attractions du même
// genre) et son remplissage (+0x8E) ; les statistiques sont reprises (0x68E34) et l'humeur recalculée
// (0x6804A). L'attraction devient l'objet choisi, et le joueur passe à l'outil 11 (poser l'entrée) —
// sauf pour le genre 100, et sauf si le kiosque n'a pas d'objet graphique ou si la fiche porte 0x0F
// en +0x8C.
//
// Pour le genre 6, les cinq cases de la gare reçoivent enfin leurs rails (0x29835 en mode 5 : poser,
// et marquer le morceau du bit 4 pour que le bouton droit ne l'ôte pas), l'attraction est refermée
// (+0x4B = 0) et le joueur reprend les rails en main.
//
// Anomalie reproduite : dans la recherche d'un circuit d'allées (genres 4 et 0x1C), la direction que
// donne la table 0xB493A est comparée à −1 après avoir été étendue **sans signe** depuis un octet :
// la comparaison n'est donc jamais vraie, et une case dont la table rend 0xFF fait lire les tables de
// directions bien au-delà de leurs quatre entrées.
const EMPRISE_DECALAGES = 0x34;        // dans une fiche du catalogue des attractions
const EMPRISE_SOLS = 0x60;
const CASES_DE_L_EMPRISE = 0x16;
const COUT_DE_L_ATTRACTION = 0xA2;     // mot long
const GARES = 0xB7A45;                 // 0x1D octets par disposition
const TAILLE_GARE = 0x1D;
const OBJETS_DES_GARES = 0xB7AE2;      // l'objet graphique du kiosque d'une gare
const OBJETS_DES_KIOSQUES = 0xB7ADA;   // celui d'un kiosque ordinaire, par direction
const DIRECTION_D_UNE_ALLEE = 0xB493A; // 0xFF : la forme n'ouvre aucune direction
const BIT_D_UNE_ALLEE = 0xB491C;
const DIRECTION_D_UN_MASQUE = 0xB4970;
const OUVERTURES_DES_ALLEES = 0xB49C1;
const FICHES_DES_JOUEURS = 0xD3B00, TAILLE_FICHE_JOUEUR = 0x222;
const RECALCULER_L_HUMEUR = 0x6804A;

export function construireUneAttraction(jeu, numeroCase, fiche) {
  const cel = cellule(jeu, numeroCase);
  const f = ATTRACTIONS + (fiche & 0xFFFF) * TAILLE_ATTRACTION;
  const genre = () => mot(jeu, f + 0xB0);
  const gare = () => jeu.m8[adresse(jeu, COMPTES) + GARE_A_POSER];
  const etat = { prix: 0, entree: 0, allees4: 0, allees1C: 0 };

  // (1) les 22 cases de l'emprise doivent être libres de sol et non réservées.
  for (let k = 0; k < CASES_DE_L_EMPRISE; k++) {
    if (mot(jeu, f + EMPRISE_SOLS + k * 2) === 0) continue;
    const v = cel + motSigne(jeu, f + EMPRISE_DECALAGES + k * 2) * 4;
    if (drapeauxDuSol(jeu, v) !== 0 || (jeu.m8[v + 3] & 8) !== 0) return 0;
  }
  // (2) le genre 100 : les deux cases de la rangée suivante ne doivent pas être réservées.
  if (mot(jeu, f + 0x22) === 0x64 && ((jeu.m8[cel + 0xFF] & 8) || (jeu.m8[cel + 0xFB] & 8))) return 0;
  // (3) la case du portique d'une gare doit être sans sol.
  const g = genre();
  if (g === 4 || g === 6 || g === 0x1C) {
    const portique = cel + motSigne(jeu, GARES + gare() * TAILLE_GARE) * 4;
    if (drapeauxDuSol(jeu, portique) !== 0) return 0;
  }

  // (4) deux emplacements libres : le kiosque puis l'attraction.
  const fin = () => adresse(jeu, FIN_DES_OBJETS);
  for (let kiosque = adresse(jeu, OBJETS) + TAILLE_OBJET; kiosque < fin(); kiosque += TAILLE_OBJET) {
    if (jeu.m8[kiosque + 4] !== 0) continue;
    for (let attraction = kiosque + TAILLE_OBJET; attraction < fin(); attraction += TAILLE_OBJET) {
      if (jeu.m8[attraction + 4] !== 0) continue;
      const sorte = genre();
      if (sorte === 4 || sorte === 0x1C) {
        return circuitDAllees(jeu, numeroCase, fiche, cel, kiosque, attraction, etat);
      }
      if (sorte === 6) {
        return placeDeLaGare(jeu, numeroCase, fiche, cel, kiosque, attraction, etat);
      }
      if (sorte === 0x1E) {
        const v = cel + motSigne(jeu, f + 0x32) * 4;
        if (drapeauxDuSol(jeu, v) !== 0 && mot(jeu, f + 0x32) !== 0) return 0;
        jeu.m8[attraction + 0x59] = jeu.m8[f + 0xBE];
        ecrireMot(jeu, attraction + 0x87, objetDElement(jeu, mot(jeu, f + 0xBC)));
      }
      return poserLAttraction(jeu, numeroCase, fiche, cel, kiosque, attraction, 0, etat);
    }
  }
  return 0;
}

// Genres 4 et 0x1C : il faut un circuit d'allées fermé autour de la case, et un troisième
// emplacement libre. Chacune des quatre voisines qui porte une allée (drapeau 0x40) est suivie de
// case en case, la forme du sol disant les directions ouvertes ; revenir sur la case de départ ferme
// le circuit, et l'on compte alors les cases parcourues et leur prix. Aucune ne boucle : l'écran 0x56
// dit qu'il n'y a pas la place.
function circuitDAllees(jeu, numeroCase, fiche, cel, kiosque, attraction, etat) {
  const f = ATTRACTIONS + (fiche & 0xFFFF) * TAILLE_ATTRACTION;
  const comptes = () => adresse(jeu, COMPTES);
  for (let sortie = attraction + TAILLE_OBJET; sortie < adresse(jeu, FIN_DES_OBJETS); sortie += TAILLE_OBJET) {
    if (jeu.m8[sortie + 4] !== 0) continue;
    for (let d = 0; d < 4; d++) {
      const sol = jeu.m8[cel + pasDeLaDirection(jeu, d) * 4 + 2];
      if ((mot(jeu, SOLS + sol * 4) & 0x40) === 0) continue;
      let direction = jeu.m8[DIRECTION_D_UNE_ALLEE + jeu.m8[FORMES_DES_SOLS + sol * 4]];
      // (L'original compare ici la direction à −1 après une extension sans signe : jamais vrai.)
      etat.prix = 0;
      let ou = cel + (pasDeLaDirection(jeu, direction) + pasDeLaDirection(jeu, d)) * 4;
      for (;;) {
        const ouvertures = jeu.m8[OUVERTURES_DES_ALLEES + formeDuSol(jeu, ou)]
          & ~jeu.m8[BIT_D_UNE_ALLEE + direction];
        if ((ouvertures & 0xFFFF) === 0) break;
        if (cel + pasDeLaDirection(jeu, d) * 4 === ou) {
          // Le circuit est fermé : la gare peut s'installer.
          jeu.m8[kiosque + 0x12] = jeu.m8[comptes() + GARE_A_POSER];
          jeu.m8[sortie + 0x12] = jeu.m8[comptes() + GARE_A_POSER];
          etat.entree = mot(jeu, GARES + jeu.m8[comptes() + GARE_A_POSER] * TAILLE_GARE);
          return poserLAttraction(jeu, numeroCase, fiche, cel, kiosque, attraction, sortie, etat);
        }
        if (mot(jeu, f + 0xB0) === 4) etat.allees4 = (etat.allees4 + 1) | 0;
        else if (mot(jeu, f + 0xB0) === 0x1C) etat.allees1C = (etat.allees1C + 1) | 0;
        etat.prix = (etat.prix + mot(jeu, f + 0xBA)) | 0;
        direction = jeu.m8[DIRECTION_D_UN_MASQUE + (ouvertures & 0xFFFF)];
        ou = ou + pasDeLaDirection(jeu, direction) * 4;
      }
    }
    jeu.appeler(MANQUE_D_ARGENT, comptes() + 0x1B1, motLong(jeu, adresse(jeu, TEXTES) + 0x354));
    ecrireMot(jeu, ECRAN_COURANT, 0x56);
    return 0;
  }
  return 0;
}

// Genre 6 : les cinq cases de la gare (table 0xB7A45, cinq couples de mots à +2) doivent être libres
// de rails et de sol, et non réservées ; il faut aussi un troisième emplacement libre pour le second
// kiosque.
function placeDeLaGare(jeu, numeroCase, fiche, cel, kiosque, attraction, etat) {
  const comptes = () => adresse(jeu, COMPTES);
  for (let sortie = attraction + TAILLE_OBJET; sortie < adresse(jeu, FIN_DES_OBJETS); sortie += TAILLE_OBJET) {
    if (jeu.m8[sortie + 4] !== 0) continue;
    for (let k = 0; k < 5; k++) {
      const base = GARES + gareDecalage(jeu, k);
      const decalage = s16(mot(jeu, base + 4) * TAILLE_CARTE + mot(jeu, base + 2));
      const v = cel + decalage * 4;
      if (jeu.m8[v + 3] & 8) return 0;
      if (jeu.appeler(CHERCHER_SUR_LA_CASE, v, 0x12) !== 0) return 0;
      if (drapeauxDuSol(jeu, v) !== 0) return 0;
    }
    jeu.m8[kiosque + 0x12] = jeu.m8[comptes() + GARE_A_POSER];
    jeu.m8[sortie + 0x12] = jeu.m8[comptes() + GARE_A_POSER];
    etat.entree = mot(jeu, GARES + jeu.m8[comptes() + GARE_A_POSER] * TAILLE_GARE);
    return poserLAttraction(jeu, numeroCase, fiche, cel, kiosque, attraction, sortie, etat);
  }
  return 0;
}

// Le décalage, dans la table des gares, du k-ième couple de la disposition en cours.
function gareDecalage(jeu, k) {
  return jeu.m8[adresse(jeu, COMPTES) + GARE_A_POSER] * TAILLE_GARE + k * 4;
}

// La pose proprement dite, une fois les contrôles passés et les emplacements trouvés.
function poserLAttraction(jeu, numeroCase, fiche, cel, kiosque, attraction, sortie, etat) {
  const f = ATTRACTIONS + (fiche & 0xFFFF) * TAILLE_ATTRACTION;
  const comptes = () => adresse(jeu, COMPTES);
  const parc = () => adresse(jeu, FICHE_DU_PARC);
  const joueur = () => adresse(jeu, FICHE_JOUEUR);
  const rang = (o) => diviser(o - adresse(jeu, OBJETS), TAILLE_OBJET);
  const caseDe = (decalage) => adresse(jeu, CARTE) + ((numeroCase & 0xFFFF) + decalage) * 4;

  etat.prix = (etat.prix + motLong(jeu, f + COUT_DE_L_ATTRACTION)) | 0;
  if (motLongSigne(jeu, joueur() + 0x0A) - etat.prix - motLongSigne(jeu, joueur() + 0x0E) < 0) {
    ecrireMot(jeu, ECRAN_COURANT, 0x56);
    jeu.appeler(MANQUE_D_ARGENT, comptes() + 0x1B1, motLong(jeu, adresse(jeu, TEXTES) + 0x394), etat.prix);
    return 0;
  }

  // Les sols de l'emprise, chaque case étant d'abord vidée.
  for (let k = 0; k < CASES_DE_L_EMPRISE; k++) {
    if (mot(jeu, f + EMPRISE_SOLS + k * 2) === 0) continue;
    jeu.appeler(VIDER_LA_CASE, ((numeroCase & 0xFFFF) + mot(jeu, f + EMPRISE_DECALAGES + k * 2)) & 0xFFFF);
    jeu.m8[caseDe(motSigne(jeu, f + EMPRISE_DECALAGES + k * 2)) + 2] = jeu.m8[f + EMPRISE_SOLS + k * 2];
  }
  if ((etat.entree & 0xFFFF) !== 0) jeu.m8[caseDe(s16(etat.entree)) + 2] = 0xAB;
  jeu.appeler(EMETTRE_UN_SON, 0, 0x28);

  // L'attraction.
  jeu.m8[attraction + 4] = 4;
  ecrireMot(jeu, attraction + 0x38, diviser(etat.prix, 100));
  ecrireMotLong(jeu, joueur() + 0x0E, motLong(jeu, joueur() + 0x0E) + motSigne(jeu, attraction + 0x38) * 100);
  jeu.m8[attraction + 6] = jeu.m8[f + 0x2C];
  jeu.m8[attraction + 8] = jeu.m8[f + 0x2D];
  const caseAttraction = motSigne(jeu, f + 0x2A) + (numeroCase & 0xFFFF);
  jeu.m8[attraction + 7] = caseAttraction % TAILLE_CARTE;
  jeu.m8[attraction + 9] = diviser(caseAttraction, TAILLE_CARTE);
  if (mot(jeu, f + 0x24) !== 0) ecrireMot(jeu, attraction + 0xA, objetDElement(jeu, mot(jeu, f + 0x24)));
  ecrireMot(jeu, attraction + 0x16, (fiche & 0xFFFF) * TAILLE_ATTRACTION);
  jeu.m8[attraction + 0x13] = jeu.m8[f + 0xB8];
  ecrireMot(jeu, attraction + 0x14, jeu.m8[attraction + 0x13]);
  ecrireMot(jeu, attraction + 0x34, mot(jeu, f + 0xAC));
  ecrireMot(jeu, attraction + 0x26, mot(jeu, f + 0xA6));
  ecrireMot(jeu, attraction + 0x28, 0x60);
  ecrireMot(jeu, attraction + 0x2C, mot(jeu, f + 0xAE));
  ecrireMot(jeu, attraction + 0x2E, 0);
  jeu.m8[attraction + 0x4B] = 1;
  jeu.m8[attraction + 0x0C] = jeu.m8[f + 0xB0];
  ecrireMot(jeu, attraction + 0x61, 0);
  ecrireMot(jeu, attraction + 0x3A, 0);
  ecrireMot(jeu, attraction + 0x3C, 0);
  ecrireMotLong(jeu, attraction + 0x3E, motLong(jeu, PAS_DE_SIMULATION));
  ecrireMot(jeu, attraction + 0x49, rang(kiosque));
  ecrireMot(jeu, attraction + 0x45, 0);
  ecrireMot(jeu, attraction + 0x8E, mot(jeu, adresse(jeu, OBJETS_DES_ELEMENTS) + 0x2CE));
  ecrireMotLong(jeu, joueur() + 0x37, motLong(jeu, joueur() + 0x37) + etat.prix);
  ecrireMotLong(jeu, attraction + 0x5B, etat.prix);
  if (motSigne(jeu, f + 0x32) === -9999) ecrireMot(jeu, attraction + 0x73, 0);
  else ecrireMot(jeu, attraction + 0x73, (((numeroCase & 0xFFFF) + mot(jeu, f + 0x32)) & 0xFFFF) + etat.entree);
  jeu.appeler(POSER_EN_TETE, attraction, mot(jeu, attraction + 6), mot(jeu, attraction + 8));

  // Le kiosque.
  jeu.m8[kiosque + 4] = 6;
  jeu.m8[kiosque + 6] = 0x80;
  jeu.m8[kiosque + 8] = 0xFF;
  const caseKiosque = motSigne(jeu, f + 0x30) + (numeroCase & 0xFFFF);
  jeu.m8[kiosque + 7] = caseKiosque % TAILLE_CARTE;
  jeu.m8[kiosque + 9] = diviser(caseKiosque, TAILLE_CARTE);
  jeu.m8[kiosque + 0x0C] = jeu.m8[f + 0xB0];
  if (mot(jeu, f + 0x2E) === 0x26A) {
    ecrireMot(jeu, kiosque + 0xA,
      objetDElement(jeu, mot(jeu, OBJETS_DES_GARES + jeu.m8[comptes() + GARE_A_POSER] * 2)));
  } else if (mot(jeu, f + 0x2E) === 0) {
    ecrireMot(jeu, kiosque + 0xA, 0);
  } else {
    ecrireMot(jeu, kiosque + 0xA, objetDElement(jeu, mot(jeu, OBJETS_DES_KIOSQUES + jeu.m8[kiosque + 0x12] * 2)));
  }
  ecrireMot(jeu, kiosque + 0x16, rang(attraction));
  jeu.appeler(POSER_EN_TETE, kiosque, mot(jeu, kiosque + 6), mot(jeu, kiosque + 8));

  // Le second kiosque des genres 4, 6 et 0x1C : la sortie, posée sur la case de l'entrée.
  const g = mot(jeu, f + 0xB0);
  if (g === 4 || g === 6 || g === 0x1C) {
    ecrireMot(jeu, kiosque + 0x49, rang(sortie));
    ecrireMot(jeu, sortie + 0x49, rang(kiosque));
    jeu.m8[sortie + 4] = 6;
    jeu.m8[sortie + 6] = 0x80;
    jeu.m8[sortie + 8] = 0xFF;
    jeu.m8[sortie + 7] = mot(jeu, attraction + 0x73) % TAILLE_CARTE;
    jeu.m8[sortie + 9] = diviser(mot(jeu, attraction + 0x73), TAILLE_CARTE);
    jeu.m8[sortie + 0x0C] = 6;
    ecrireMot(jeu, sortie + 0x16, rang(attraction));
    ecrireMot(jeu, sortie + 0xA, 0);
    jeu.appeler(POSER_EN_TETE, sortie, mot(jeu, sortie + 6), mot(jeu, sortie + 8));
  }

  // Ce que le joueur tient ensuite : l'entrée de l'attraction, sauf pour le genre 100.
  ecrireMot(jeu, OUTIL, 0);
  if (mot(jeu, f + 0x22) === 0x64) {
    jeu.m8[caseDe(motSigne(jeu, f + 0x32)) + 2] = 0xA1;
  } else if (mot(jeu, kiosque + 0xA) !== 0 && jeu.m8[f + 0x8C] !== 0x0F) {
    ecrireMot(jeu, comptes() + 0x2D0, rang(kiosque));
    ecrireMot(jeu, comptes() + 0x2BC, 0);
    ecrireMot(jeu, OUTIL, 0xB);
    ecrireMot(jeu, 0xD662A, 0);
    ecrireMot(jeu, 0xD662E, 0);
    ecrireMot(jeu, 0xD662C, 0);
    if (mot(jeu, f + 0xB0) === 0x1E) jeu.m8[caseDe(motSigne(jeu, f + 0x32)) + 2] = 0xA2;
  }

  // Les comptes du parc.
  jeu.m8[parc() + 0x82] = (jeu.m8[parc() + 0x82] + 1) & 0xFF;
  let memeGenre = 0;
  for (let o = adresse(jeu, OBJETS) + TAILLE_OBJET; o < adresse(jeu, FIN_DES_OBJETS); o += TAILLE_OBJET) {
    if (jeu.m8[o + 4] === 4 && diviser(mot(jeu, o + 0x16), TAILLE_ATTRACTION) === (fiche & 0xFFFF)) {
      memeGenre = (memeGenre + 1) & 0xFF;
    }
  }
  const attrait = jeu.m8[f + 0xA9];
  ecrireMotLong(jeu, parc() + 0x8A,
    motLong(jeu, parc() + 0x8A) + (memeGenre !== 0 ? diviser(attrait, memeGenre) : attrait));
  ecrireMot(jeu, parc() + 0x8E, mot(jeu, parc() + 0x8E) + mot(jeu, f + 0xA6));
  jeu.m8[ATTRACTIONS + 0xC7 + mot(jeu, attraction + 0x16)] =
    (jeu.m8[ATTRACTIONS + 0xC7 + mot(jeu, attraction + 0x16)] + 1) & 0xFF;
  ecrireMot(jeu, OBJET_CHOISI, rang(attraction));
  ecrireMot(jeu, REDESSINER_CARTE, 1);
  jeu.appeler(RELEVER_LES_STATISTIQUES,
    adresse(jeu, FICHES_DES_JOUEURS) + jeu.m8[comptes() + 0x40] * TAILLE_FICHE_JOUEUR);
  ecrireMot(jeu, comptes() + 0x2C0,
    diviser(Math.imul(jeu.appeler(RECALCULER_L_HUMEUR) | 0, 100), jeu.m8[parc() + 0x48]));

  // Les rails de la gare, ou le record d'allées d'un circuit.
  if (g === 6) {
    for (let k = 0; k < 5; k++) {
      const base = GARES + gareDecalage(jeu, k);
      const decalage = motSigne(jeu, base + 4) * TAILLE_CARTE + motSigne(jeu, base + 2);
      const numero = ((cel + decalage * 4 - adresse(jeu, CARTE)) >> 2) & 0xFFFF;
      jeu.appeler(RAILS_SUR_UNE_CASE, numero, 5, fiche & 0xFFFF);
    }
    jeu.m8[attraction + 0x12] = jeu.m8[DIRECTIONS_OPPOSEES + jeu.m8[comptes() + GARE_A_POSER] * 2];
    jeu.m8[attraction + 0x4B] = 0;
    jeu.m8[attraction + 0xBF] = 0;
    ecrireMot(jeu, OUTIL, 0xA);
  } else if (g === 4) {
    if ((etat.allees4 & 0xFFFF) > mot(jeu, comptes() + 0x648)) ecrireMot(jeu, comptes() + 0x648, etat.allees4);
  } else if (g === 0x1C) {
    if ((etat.allees1C & 0xFFFF) > mot(jeu, comptes() + 0x64A)) ecrireMot(jeu, comptes() + 0x64A, etat.allees1C);
  }
  jeu.m8[adresse(jeu, FICHE_JOUEUR) + (fiche & 0xFFFF) + 0x63] =
    (jeu.m8[adresse(jeu, FICHE_JOUEUR) + (fiche & 0xFFFF) + 0x63] + 1) & 0xFF;
  return 1;
}

// 0x31748 — démolir une attraction : le contraire de 0x2EBB7.
//
// Appelée par l'écran de démolition (0x78B7E), par le tutoriel (0x59C85, qui démolit l'attraction
// posée ailleurs que là où il l'attendait), et après une explosion (0x6662D, 0x66976). Dans l'ordre :
//
//  - les panneaux indicateurs (objets de type 0x14 dans l'état 8) dont la flèche des attractions
//    (+0x69) la désignait la perdent ; un panneau qui n'a plus aucune flèche (+0x69, +0x6B, +0x6D)
//    est retiré (0x18B62). Au passage, on compte les attractions du même genre, elle comprise ;
//  - le prix de construction encore dû (+0x38, en centaines) est retiré de la somme engagée du
//    joueur ; l'attraction est fermée (0x31668), et cesse d'être l'objet choisi si elle l'était ;
//  - la fiche du parc compte une attraction de moins (+0x82, s'il en restait), perd l'attrait moyen
//    que 0x2EBB7 avait ajouté (l'attrait du genre, fiche +0xA9, divisé par le nombre d'attractions
//    du genre, elle comprise) et son remplissage (fiche +0xA6, mot +0x8E) ;
//  - les 22 cases de l'emprise (décalages de la fiche +0x34, depuis la case de l'attraction moins le
//    décalage +0x2A) : sur chacune qui a un sol, les barrières (type 0x14, état 2) sont retirées, le
//    sol est effacé, et un premier objet négatif (un décor qui clôt la liste) oublié ; puis le sol de
//    la case d'origine de l'emprise, et celui de la case de sortie (+0x73) s'il porte le drapeau 0x20 ;
//  - le kiosque d'entrée (+0x49) : les files d'attente voisines sont vidées (0x205D7), son sol
//    effacé ; pour les attractions à bouées, à train et à voitures (modes 4, 6, 0x1C), le second
//    kiosque (+0x49 du premier) est vidé, retiré, son sol effacé ; puis le kiosque est retiré ;
//  - le sol de la case de l'attraction ; pour une attraction à train (mode 6), le monorail (genre
//    0xDB) passe par 0x44BB8 et perd les cinq morceaux de voie de sa gare (0x2C6B8, la disposition
//    de la table 0xB7A45 pour la direction opposée à la sienne) ; les autres trains, 0x41EB4, qui
//    ôte les trains, et 0x44C91, qui démonte la voie morceau par morceau (nouveautes.js) ;
//  - le nombre possédé du genre (fiche +0xC7) diminue ; si l'attraction a moins de dix ans (années
//    de 12 000 pas), son prix (+0x5B) amorti par la table 0xB52DA est retiré des dépenses de l'année
//    (fiche du joueur +0x37, qui fait la valeur du parc : fin-annee.js) ;
//  - l'attraction est retirée (0x18B62) ; les statistiques du parc sont refaites (0x68E34),
//    l'attrait du prix d'entrée aussi (0x6804A, rangé × 100 / octet +0x48 du parc dans le mot +0x2C0
//    des comptes) ; le compte du genre chez le joueur (+0x63) diminue.
//
// ANOMALIES REPRODUITES :
//  - sur une case de l'emprise, la recherche des barrières reprend toujours au premier objet de type
//    0x14 de la case : s'il n'est pas dans l'état 2, la boucle ne finit jamais ;
//  - l'âge est un mot long, mais seul son mot bas est comparé à 10 et sert d'indice.
const UNE_ANNEE = 0x2EE0;              // 12 000 pas
const AMORTISSEMENT = 0xB52DA;         // dix mots, en centièmes (fin-annee.js)
const MONORAIL = 0xDB;                 // l'identifiant du genre (fiche +0x22)
const FICHE_ATTRAIT = 0xA9, FICHE_REMPLISSAGE = 0xA6, FICHE_POSSEDES = 0xC7, FICHE_DECALAGE = 0x2A;

export function demolirUneAttraction(jeu, attraction) {
  const { m8 } = jeu;
  const base = adresse(jeu, OBJETS);
  const effacerLeSol = (numero) => { m8[cellule(jeu, numero) + 2] = 0; };
  const caseDe = (o) => (m8[o + 9] << 6) + m8[o + 7];

  // Les panneaux indicateurs, et les attractions du même genre.
  let duMemeGenre = 0;
  const numero = diviser((attraction - base) | 0, TAILLE_OBJET) & 0xFFFF;
  for (let o = base + TAILLE_OBJET; o < adresse(jeu, FIN_DES_OBJETS); o += TAILLE_OBJET) {
    if (m8[o + 4] === 4 && mot(jeu, attraction + 0x16) === mot(jeu, o + 0x16)) duMemeGenre = (duMemeGenre + 1) & 0xFF;
    if (m8[o + 4] !== 0x14 || m8[o + 0xC] !== 8) continue;
    if (mot(jeu, o + 0x69) !== numero) continue;
    ecrireMot(jeu, o + 0x69, 0);
    let k = 0;
    while (k < 3 && mot(jeu, o + 0x69 + 2 * k) === 0) k++;
    if (k === 3) jeu.appeler(RETIRER_L_OBJET, o);
  }

  if (mot(jeu, attraction + 0x38) !== 0) {
    const joueur = adresse(jeu, FICHE_JOUEUR);
    ecrireMotLong(jeu, joueur + 0xE, motLong(jeu, joueur + 0xE) - motSigne(jeu, attraction + 0x38) * 100);
  }
  const f = ATTRACTIONS + mot(jeu, attraction + 0x16);
  jeu.appeler(FERMER_L_ATTRACTION, attraction);
  if (((base + mot(jeu, OBJET_CHOISI) * TAILLE_OBJET) >>> 0) === (attraction >>> 0)) ecrireMot(jeu, OBJET_CHOISI, 0);

  const parc = adresse(jeu, FICHE_DU_PARC);
  if (m8[parc + 0x82] !== 0) m8[parc + 0x82] = (m8[parc + 0x82] - 1) & 0xFF;
  const attrait = duMemeGenre !== 0 ? diviser(m8[f + FICHE_ATTRAIT], duMemeGenre) : m8[f + FICHE_ATTRAIT];
  ecrireMotLong(jeu, parc + 0x8A, motLong(jeu, parc + 0x8A) - attrait);
  ecrireMot(jeu, parc + 0x8E, mot(jeu, parc + 0x8E) - mot(jeu, f + FICHE_REMPLISSAGE));

  // L'emprise.
  const origine = (caseDe(attraction) - mot(jeu, f + FICHE_DECALAGE)) & 0xFFFF;
  for (let k = 0; k < CASES_DE_L_EMPRISE; k++) {
    const cel = cellule(jeu, origine + mot(jeu, f + EMPRISE_DECALAGES + 2 * k));
    if (m8[cel + 2] === 0) continue;
    for (;;) {
      const barriere = jeu.appeler(CHERCHER_SUR_LA_CASE, cel, 0x14);
      if (barriere === 0) break;
      if (m8[barriere + 0xC] === 2) jeu.appeler(RETIRER_L_OBJET, barriere);
    }
    m8[cel + 2] = 0;
    if (motSigne(jeu, cel) < 0) ecrireMot(jeu, cel, 0);
  }
  effacerLeSol(origine);
  const sortie = mot(jeu, attraction + 0x73);
  if (sortie !== 0 && (drapeauxDuSol(jeu, cellule(jeu, sortie)) & 0x20)) effacerLeSol(sortie);

  // Le kiosque d'entrée, et le second kiosque des attractions à bouées, à train et à voitures.
  const kiosque = objet(jeu, mot(jeu, attraction + 0x49));
  if ((kiosque >>> 0) > (base >>> 0)) {
    const ici = caseDe(kiosque);
    for (let d = 0; d <= 3; d++) {
      const voisine = ici + pasDeLaDirection(jeu, d);
      if (drapeauxDuSol(jeu, adresse(jeu, CARTE) + voisine * 4) & 8) jeu.appeler(VIDER_LA_CASE, voisine & 0xFFFF);
    }
    effacerLeSol(ici);
    const mode = m8[attraction + 0xC];
    if (mode === 4 || mode === 6 || mode === 0x1C) {
      const second = objet(jeu, mot(jeu, kiosque + 0x49));
      if ((second >>> 0) > (base >>> 0)) {
        const la = caseDe(second);
        jeu.appeler(VIDER_LA_CASE, la);
        jeu.appeler(RETIRER_L_OBJET, second);
        effacerLeSol(la);
      }
    }
    jeu.appeler(RETIRER_L_OBJET, kiosque);
  }
  effacerLeSol(caseDe(attraction));

  // Les trains.
  if (m8[attraction + 0xC] === 6) {
    if (mot(jeu, f + 0x22) === MONORAIL) {
      jeu.appeler(0x44BB8, attraction);
      for (let k = 0; k < 5; k++) {
        const t = motSigne(jeu, DIRECTIONS_OPPOSEES + 2 * m8[attraction + 0x12]) * TAILLE_GARE + 4 * k;
        const decalage = motSigne(jeu, GARES + 4 + t) * TAILLE_CARTE + motSigne(jeu, GARES + 2 + t);
        jeu.appeler(EFFACER_LES_RAILS, (origine + decalage) & 0xFFFF);
      }
    } else {
      jeu.appeler(0x41EB4, attraction);
      jeu.appeler(0x44C91, attraction);
    }
  }

  // Les comptes.
  m8[f + FICHE_POSSEDES] = (m8[f + FICHE_POSSEDES] - 1) & 0xFF;
  const age = (((motLong(jeu, PAS_DE_SIMULATION) - motLong(jeu, attraction + 0x3E)) >>> 0) / UNE_ANNEE) >>> 0;
  if ((age & 0xFFFF) < 10) {
    const joueur = adresse(jeu, FICHE_JOUEUR);
    const prixAmorti = Math.imul(motLong(jeu, attraction + 0x5B), mot(jeu, AMORTISSEMENT + 2 * (age & 0xFFFF))) >>> 0;
    ecrireMotLong(jeu, joueur + 0x37, motLong(jeu, joueur + 0x37) - ((prixAmorti / 100) >>> 0));
  }
  jeu.appeler(RETIRER_L_OBJET, attraction);
  jeu.appeler(RELEVER_LES_STATISTIQUES,
    adresse(jeu, FICHES_DES_JOUEURS) + m8[adresse(jeu, COMPTES) + 0x40] * TAILLE_FICHE_JOUEUR);
  const humeur = jeu.appeler(RECALCULER_L_HUMEUR);
  ecrireMot(jeu, adresse(jeu, COMPTES) + 0x2C0, diviser(Math.imul(humeur, 100), m8[adresse(jeu, FICHE_DU_PARC) + 0x48]));
  const possedes = adresse(jeu, FICHE_JOUEUR) + diviser(f - ATTRACTIONS, TAILLE_ATTRACTION) + 0x63;
  m8[possedes] = (m8[possedes] - 1) & 0xFF;
}

// --- la liste des réécritures ----------------------------------------------------------------------

export const reecritures = [
  { adresse: 0x205D7, nom: 'viderLaCase', fn: viderLaCase, arguments: 1, memoire: 'entiere' },
  { adresse: 0x287D8, nom: 'murSurUneCase', fn: murSurUneCase, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x32232, nom: 'embaucherUnEmploye', fn: embaucherUnEmploye, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x4091A, nom: 'remplirLesJauges', fn: (jeu) => remplirLesJauges(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x43689, nom: 'evaluerLaVoie', fn: evaluerLaVoie, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x29835, nom: 'railsSurUneCase', fn: railsSurUneCase, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x1788D, nom: 'boutonDroitSurUneZone', fn: boutonDroitSurUneZone, arguments: 1, memoire: 'entiere' },
  { adresse: 0x15FBD, nom: 'boutonGaucheSurUneZone', fn: boutonGaucheSurUneZone, arguments: 1, memoire: 'entiere' },
  { adresse: 0x2EBB7, nom: 'construireUneAttraction', fn: construireUneAttraction, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x31748, nom: 'demolirUneAttraction', fn: demolirUneAttraction, arguments: 1, memoire: 'entiere' },
];

export const enAttente = [];
