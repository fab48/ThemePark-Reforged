// Les événements du jeu, la sauvegarde, le chargement et l'amorçage d'une partie.
//
// Réécriture lisible des fonctions 0x2CCF8, 0x2DF12, 0x2E035, 0x2E20C, 0x19EEE, 0x1A2CA, 0x104A3,
// 0x10010, 0x12452, 0x1A836 et 0x10D42 du jeu d'origine.
//
// --- LA FILE DES ÉVÉNEMENTS (0x2CCF8) ---------------------------------------------------------------
//
// Le jeu ne fait presque jamais agir l'interface sur-le-champ. Un clic dans le parc, une touche, un
// bouton d'écran déposent une **demande** dans la case du joueur, et la boucle du parc (0x11C45) la fait
// exécuter en fin d'image par 0x2CCF8, pour les quatre joueurs à la fois. C'est le point de passage par
// lequel une partie en réseau aurait fait parvenir aux autres machines ce que chacun venait de faire :
// l'aiguillage traite les quatre cases, et la plupart des effets ne valent que pour le joueur courant
// ([0xD665C]), les autres ne faisant que recopier leur demande.
//
// Cinq cases de 6 octets, en 0xD441E — c'est le seul bloc de la file sauvegardé avec la partie —, et la
// copie de l'image précédente, juste devant, en 0xD4400 :
//
//   +0  octet  le numéro du joueur (posé une fois pour toutes par 0x1A2CA)
//   +1  octet  le type de l'événement          (0xD441F ; l'image précédente, 0xD4401)
//   +2  mot    la première valeur              (0xD4420 ; 0xD4402)
//   +4  mot    la seconde                      (0xD4422 ; 0xD4404)
//
// L'aiguillage est un `repne scasb` sur la table de 36 octets 0x2CD30 (0x5A, puis 0x42 à 0x00 de deux en
// deux, et un octet parasite pris dans la table de sauts qui suit) : un type inconnu ne fait rien.
//
// **Les traînées.** Les quatre outils de tracé (le mur, le chemin, la barrière de file, la rivière), les
// rails et l'outil 16 ne posent pas seulement sur la case visée : si l'image précédente portait le même
// type d'événement, la routine relie la case précédente à la case courante — d'abord le long des
// rangées, puis le long des colonnes, en s'arrêtant juste avant la case précédente, qui a été posée à
// l'image d'avant. C'est ce qui permet de tracer un chemin en glissant la souris sans trou, même quand
// le pointeur saute plusieurs cases en une image.
//
// **La liste des événements**, et ce que chacun fait (les numéros d'outil renvoient au § 6.7) :
//
//   0x00  rien
//   0x02  un mur (outil 1) : 0x287D8(article, case, 1), avec traînée ; bruitage 6
//   0x04  un chemin (outil 2) : 0x28943(case, 1), avec traînée ; bruitage 6
//   0x06  une barrière de file (outil 3) : 0x28E5A(article, case, 1), avec traînée ; bruitage 6
//   0x08  la rivière (outil 4) : 0x29340(case, 1), avec traînée ; bruitage 6
//   0x0A  poser une attraction ou une boutique (outils 5, 6, 26) : 0x2EBB7(case, fiche)
//   0x0C  0x3568E(joueur, case) — désigner l'objet d'une case, vraisemblablement
//   0x0E  0x40DA6(case)
//   0x10  embaucher (outil 9) : 0x32232(case, métier)
//   0x12  les rails d'une attraction (outil 10) : 0x29835(case, valeur2 & 3, valeur2 >> 2), avec
//         traînée, précédé de 0x4395B ; bruitage 9. Une demande identique à celle de l'image
//         précédente est ignorée
//   0x14  l'entrée ou la sortie d'une attraction (outils 11 et 17) : 0x29835(case, 2, valeur2 >> 2)
//   0x16  0x412E0(case, 0xB8, 1) ; bruitage 6
//   0x18  0x2B576(case, 1)                      0x1A  0x2B62F(case)
//   0x1C  un panneau (outil 15) : 0x40E92(case)
//   0x1E  0x29686(case, 1), avec traînée ; bruitage 9
//   0x20  un looping (outil 18) : 0x29E03(case, 1, fiche) ; bruitage 9
//   0x22  déplacer un employé, envoyer un mécanicien (outils 19 et 21) : 0x348ED(case, objet)
//   0x24  démolir : l'entrée de l'attraction en cours de pose est d'abord achevée, puis la case visée
//         est rendue au sol (bit 5 de son octet +3) ou l'objet qui s'y trouve est ôté (0x205D7)
//   0x26  sauver la partie dans l'emplacement 0 (0x2DF12)
//   0x28  charger l'emplacement 0 (0x2E035)
//   0x2A  quitter le parc : [0xD6688] levé
//   0x2C  0x64CF5(valeur1, objet du parc n° valeur2)
//   0x2E  acheter une action (0x4A571)          0x30  en vendre une (0x4AAF1)
//   0x32, 0x34  [0xD7786] augmenté : le compteur d'accusés de réception du réseau, que la fin d'année
//         attend joueur par joueur (fin-annee.js, 0x7401C)
//   0x36  pour le joueur courant, une écriture au livre des comptes de −5 000 par joueur du réseau ;
//         pour un autre, un voyou arrive (0x4C592, genre tiré au hasard)
//   0x38  de l'argent : le solde du joueur courant augmente, et un message s'affiche (écran 0x56).
//         Anomalie reproduite : le solde et la somme sont toujours ceux du joueur courant, quelle que
//         soit la case traitée ; seul le nom du message vient de la case
//   0x3A  une nouvelle partie avec une graine de hasard imposée (valeur1 << 16 | valeur2) : le pays du
//         joueur est mis de côté, repris après, et le prix du billet recalculé — c'est RECOMMENCER, du
//         menu (menus.js, 0x50CCD)
//   0x3C  0x7B65C(valeur1) — la mise à prix d'une vente aux enchères (fin-annee.js)
//   0x3E  0x7C128(valeur1)
//   0x40  drapeau : 0x49704 est appelée en sortant (la synchronisation du réseau)
//   0x42  la vitesse du jeu ([0xD6634], § 5.3)
//   0x5A  0x2DEF8() — qui ne fait qu'effacer la demande de sortie
//
// À chaque tour, la case est recopiée dans l'image précédente, puis son type et sa première valeur sont
// effacés ; la seconde ne l'est pas. Si le jeu est en réseau ([0xD7792] > 1), 0x499F2 est appelée en
// entrant.
//
// --- LE FORMAT DES SAUVEGARDES ----------------------------------------------------------------------
//
// Sauver (0x2DF12) et charger (0x2E035) écrivent et relisent la même liste de blocs, la table 0xB1515 :
// des couples (adresse, taille) jusqu'à une adresse nulle. Les trois premiers sont les grands tableaux
// du tas, dont l'adresse n'est connue qu'à l'exécution et que les deux routines rechargent depuis
// [0xD3B00], [0xD3B08] et [0xD3B10] avant de s'en servir ; les cinquante autres sont des variables du
// programme, écrites à la file, sans en-tête, sans numéro de version et sans compression. Les tailles
// font 304 668 octets en tout, exactement la taille d'un `.GY`.
//
//   1   [0xD3B00]  13 650   les 25 fiches de joueur (0x222 octets chacune)
//   2   [0xD3B08]  16 384   la carte, 64 × 64 cellules de 4 octets
//   3   [0xD3B10] 240 000   les 1 200 objets du parc, 200 octets chacun
//   4-9 0xD667A, 0xD6666, 0xD6662, 0xD666A, 0xD6660, 0xD6668 : la caméra et la case désignée
//   10  0xD3AFC    le compteur de pas du calendrier    11  0xD3AF4  l'état du générateur de hasard
//   12  0xD6672    13  0xD6674
//   14  0xD441E   30   les cinq cases d'événement
//   15  0xD443C 8 650   les comptes des cinq joueurs (0x6C2 chacun)
//   16  0xD665C  le joueur courant     17  0xD6676   18  0xD6670  l'outil en main
//   19  0xD666E   20  0xD666C   21  0xD6678   22  0xD663C   23  0xD663E   24  0xD77A0
//   25  0xD6658   26  0xD665A   27  0xD6648   28  0xD664E   29  0xD664A   30  0xD6646
//   31  0xD6650   32  0xD6644   33  0xD779D
//   34  0xCF1E0 14 800  les 25 fiches de parc (0x250 octets)
//   35  0xD7798  la barre d'outils    36  0xD6624  l'origine du dessin   37  0xD778D   38  0xD661C
//   39  0xCCED0  6 400  le catalogue des attractions   40  0xD3C62  1 926  celui des boutiques
//   41  0xCCA70  1 120  celui des décors               42  0xD37DC     44  celui des chemins
//   43  0xD43E8     14  celui des barrières            44  0xD35C0    540  celui du personnel
//   45  0xD3C00     98                                 46  0xD7768
//   47  0xD6634  la vitesse du jeu                     48  0xD3C00     98  (le même bloc, deux fois)
//   49  0xB7B38    700  les 25 pays (0x1C octets)      50  0xD6690    141  les noms et l'argent de départ
//   51  0xD7763    52  0xD7762    53  0xD3AF8  les passages de la mise à jour des objets
//
// Avec la table des objets agrandie (reglages.js, table-des-objets.js), hors du jeu d'origine, les
// objets au-delà du 1 200ᵉ enregistrement suivent les 53 blocs, quand il y en a.
//
// Le nom du fichier vient de l'emplacement demandé : −1 donne `<installation>save/<nom>.gy`, la partie
// en cours ; 0 à 9 donnent `.g0` à `.g9` ; toute autre valeur négative donne `save/DEMO.GY`, le parc de
// la démonstration (§ 7). Le chargement remet ensuite la caméra, demande un redessin complet et relance
// l'ambiance du parc si celui-ci est ouvert.
//
// --- L'AMORÇAGE D'UNE PARTIE ------------------------------------------------------------------------
//
// 0x10010 est le `main` du programme : il lit la ligne de commande, appelle 0x104A3 qui met tout en
// place, puis 0x11C45, la boucle qui tient le jeu du début à la fin, et sort par `exit`.
//
// 0x104A3 charge les images et les textes, choisit le mode vidéo (il tente la haute résolution par
// « *WB_SCREEN », se rabat sur 320x200 et la lettre `m` des noms de fichiers), réserve la table des
// objets du parc (« *THING ») en demandant de moins en moins, et prépare le pointeur de la souris.
//
// 0x19EEE repart de zéro : tout est effacé — la carte, les objets, les fiches de parc, les comptes —,
// les catalogues et les 25 fiches de joueur reviennent à leur modèle, le calendrier est remis à zéro,
// la caméra recentrée, l'entrée du parc posée et le bus créé. 0x1A2CA suit, qui désigne le joueur
// courant et recalcule les trois pointeurs par lesquels tout le jeu l'atteint : sa fiche [0xD3808],
// ses comptes [0xD3814] et la fiche de son parc [0xD3818].
//
// 0x12452 est l'entrée dans le parc : la graine du hasard y est posée (0x7FBE5), les catalogues
// reçoivent leurs noms traduits, les vingt-six couleurs de l'interface sont cherchées dans la palette,
// le mode d'affichage est repris, une nouvelle partie est créée, et l'emplacement demandé sur la ligne
// de commande est chargé.
//
// 0x1A836 est l'écran titre : il a sa propre boucle et ne rend la main qu'une fois l'écran 0x50 quitté.
// Tant que le joueur n'a pas de nom, il en demande un (0x793B1) ; ensuite il écrit ses six lignes et
// attend un clic ou une touche de F1 à F6.
//
// --- LES OPTIONS DE LA LIGNE DE COMMANDE ------------------------------------------------------------
//
// Un argument commence par `-` ou `/`, et porte ensuite autant de lettres qu'on veut, chacune prise
// isolément ; celles qui demandent un chemin consomment tout le reste de l'argument.
//
//   -c<chemin>  le CD ([0xD3BBC])            -d<chemin>  l'installation ([0xD3BDE])
//   -l<lettre>  la langue : la table 0xB7E17 donne « U0 », « G1 », « I2 », « S3 », « F4 », « P5 », puis
//               « 66 » à « 99 » ; la lettre est mise en majuscule et cherchée dans les deux positions,
//               si bien que `-lF` et `-l4` choisissent le français. Introuvable : la langue 0
//   -n<n>       charger l'emplacement n − 1 en entrant dans le parc ([0xD668A])
//   -m<n>       le nombre de joueurs en réseau ([0xD7792]), ramené à 1 si 0x493BE ne trouve rien
//   -e          [0xD6680] levé          -o  [0xBA722] mis à zéro
//   -p          [0xBECB2] = 2           -r  [0xBECB2] = 1
//   -s          [0xBA720] mis à zéro    -S  [0xBA720] et [0xBA714] mis à zéro
//
// Les majuscules valent les minuscules pour toutes sauf `s`. Le lanceur du dépôt passe
// `-cD:/game/ -dC:/THEME.CD/ -l4`.
//
// --- CE QUE LA COMPARAISON NE PEUT PAS ATTEINDRE ----------------------------------------------------
//
// 0x10010 ne rend jamais la main : elle se termine par `exit`. La comparaison appel par appel ne peut
// donc pas l'éprouver — elle exécuterait la transcription, qui jouerait la partie entière et ne
// reviendrait pas — et l'outil la déclare « jamais appelée ». C'est le rejeu qui en fait foi : il rejoue
// la même partie avec et sans elle. Sa dernière instruction, le retour au DOS, n'est exercée par aucun
// scénario.

import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';
import {
  enregistrementsDemandes, finDeLaTable, octetsAEffacer, ecrireLaSuite, lireLaSuite,
} from './table-des-objets.js';   // hors du jeu d'origine (reglages.js)

const s16 = (v) => (v << 16) >> 16;
const s8 = (v) => (v << 24) >> 24;

const octet = (jeu, a) => jeu.m8[a];
const ecrireOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const ecrireMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const ecrireLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// --- Les variables du jeu ---------------------------------------------------------------------------

const JOUEUR = 0xD665C;              // mot : le joueur courant
const FICHE_DU_JOUEUR = 0xD3808;     // pointeur : sa fiche, [0xD3B00] + joueur × 0x222
const COMPTES_DU_JOUEUR = 0xD3814;   // pointeur : ses comptes, 0xD443C + joueur × 0x6C2
const PARC_DU_JOUEUR = 0xD3818;      // pointeur : la fiche de son parc, 0xCF1E0 + joueur × 0x250
const FICHES = 0xD3B00;              // pointeur : les 25 fiches de joueur
const CARTE = 0xD3B08;               // pointeur : 64 × 64 cellules de 4 octets (§ 6.2)
const OBJETS = 0xD3B10;              // pointeur : les objets du parc, 200 octets chacun
const FIN_DES_OBJETS = 0xD3B78;      // pointeur : la fin de la table des objets
const COMPTES = 0xD443C, TAILLE_COMPTES = 0x6C2;
const PARCS = 0xCF1E0, TAILLE_PARC = 0x250;
const TAILLE_FICHE = 0x222;
const MODELE_DES_FICHES = 0xBA840;   // 25 fiches de joueur toutes faites, recopiées par 0x19EEE
const PAYS = 0xB7B38, TAILLE_PAYS = 0x1C;   // 25 pays : +0x0D la difficulté, +0x1A le joueur qui l'a

const ECRAN = 0xD6652;               // mot : l'écran affiché (0 = la vue du parc, 0x50 = l'écran titre)
const COLONNE = 0xD667A, RANGEE = 0xD6666;  // mots signés : la caméra
const REDESSINER_CARTE = 0xD666E;    // mot : demande de redessin complet de la carte
const LARGEUR_TUILE = 0xD663A, HAUTEUR_TUILE = 0xD6654;
const ORIGINE_X = 0xD6624;           // mot signé : l'origine du dessin en pixels
const MODE_AFFICHAGE = 0xDE5F6;      // mot : 1 = 320x200, 8 = 640x480
const EPAISSEUR = 0xD778A;           // octet : l'unité de l'interface, 2 en 320x200, 1 en 640x480
const VITESSE = 0xD6634;             // mot signé : la vitesse du jeu (§ 5.3)
const PAS_DE_SIMULATION = 0xD3AFC;   // mot long : le calendrier, 1 000 pas par mois
const PASSAGES = 0xD3AF8;            // mot long : les passages de la mise à jour des objets
const HASARD = 0xD3AF4;              // mot long : l'état du générateur (§ 10.1)
const OUTIL = 0xD6670;               // mot : l'outil en main
const SORTIR = 0xD6688;              // mot : la demande de sortie du parc
const BARRE_D_OUTILS = 0xD7798;      // octet : 2 en jeu, posé par 0x12452
const SURFACE = 0xDE5BC;             // pointeur : l'image en cours de construction
const TAMPON_DE_FOND = 0xD3B98;      // pointeur : le fond, gardé d'une image à l'autre
const PALETTE_DU_PARC = 0xD3B8C;     // pointeur : la palette
const HAUTEUR_DE_LIGNE = 0xD7765;    // octet : la hauteur du « W » de la police des écrans
const TEXTES_DE_BASE = 0xD7BD0;      // pointeur : la première section des textes (les noms)
const TEXTES_DU_TITRE = 0xD7BD4;     // pointeur : la section 16, les lignes du menu principal
const MESSAGES = 0xD7BC0;            // pointeur : la section 6, les questions et les messages
const OWNER = 0xD6690;               // le nom du propriétaire, tapé dans la liste à choix 0x576FE
const NOM_DU_JOUEUR = 0xD66B0;       // huit octets et un zéro : le nom tapé à l'écran titre
const NOM_DU_PARC = 0xD66D0;         // le nom du parc, s'il a été choisi
const ARGENT_DE_DEPART = 0xD6718;    // mot long : le solde du début de partie
const GENRE_DE_PARTIE = 0xD66F1;     // octet : 0, 1 ou 2 ; 2 en jeu normal
const DOSSIER_DU_JEU = 0xD3BDE;      // le chemin de l'installation (-d)
const DOSSIER_DU_CD = 0xD3BBC;       // le chemin du CD (-c)
const LANGUE = 0xD775F;              // octet : le rang de la langue dans la table 0xB7E17
const LANGUES = 0xB7E17;             // table de pointeurs vers des codes de deux lettres
const JOUEURS_EN_RESEAU = 0xD7792;   // octet : le nombre de joueurs (option -m)
const ACCUSES_DE_RECEPTION = 0xD7786;  // octet : les événements 0x32 et 0x34 l'augmentent
const EMPLACEMENT_A_CHARGER = 0xD668A; // mot : l'option -n, +1 (0 = aucun)
const SEQUENCE = 0xBA0F8;            // octet signé : négatif hors séquence
const SOURIS_Y = 0xBECAE;            // mot signé
const GAUCHE_MAINTENU = 0xDE5AC;     // mot
const TOUCHE_DE_L_IMAGE = 0xDE688;   // octet : le scancode lu par 0x875A4

// --- Les événements ---------------------------------------------------------------------------------

const EVENEMENT = 0xD441E;           // +0 joueur, +1 type, +2 valeur 1, +4 valeur 2
const PRECEDENT = 0xD4400;           // la même chose, à l'image précédente
const CASES_D_EVENEMENT = 4;         // les quatre joueurs traités à chaque image (la table en porte 5)

const type = (jeu, k) => octet(jeu, EVENEMENT + 6 * k + 1);
const valeur1 = (jeu, k) => mot(jeu, EVENEMENT + 6 * k + 2);
const valeur2 = (jeu, k) => mot(jeu, EVENEMENT + 6 * k + 4);
const typePrecedent = (jeu, k) => octet(jeu, PRECEDENT + 6 * k + 1);
const valeur1Precedente = (jeu, k) => mot(jeu, PRECEDENT + 6 * k + 2);

// --- Les fonctions du jeu appelées ici ---------------------------------------------------------------

const BRUITAGE_UNIQUE = 0x80FE0;     // (propriétaire, bruitage) : sauf s'il joue déjà
const BRUITAGE = 0x80C80;            // (propriétaire, bruitage)
const HASARD_SUIVANT = 0x18B92;      // () : 0 à 32 767 (§ 10.1)
const INSCRIRE_AU_LIVRE = 0x78943;   // (poste, somme)
const SPRINTF = 0x7F652;
const STRCPY = 0x7E1ED;
const STRLEN = 0x7E822;
const ATOI = 0x7E216;
const MAJUSCULE = 0x7E1D8;           // (caractère) : toupper
const OUVRIR = 0x7EB70;              // (nom, mode) : négatif en échec
const LIRE = 0x7EBE0;                // (poignée, tampon, octets)
const ECRIRE_FICHIER = 0x7ED80;      // (poignée, tampon, octets)
const FERMER = 0x7EC20;              // (poignée)
const RESERVER = 0x7E8D0;            // (octets) : malloc
const MESSAGE_D_ERREUR = 0x7E83E;    // (format, ...) : printf sur la console
const REMPLIR = 0x7F1A0;             // (destination, octet, n) : memset
const COPIER = 0x80958;              // (destination, source, n) : memcpy
const CHARGER_UN_FICHIER = 0x7F0B0;  // (nom, destination)
const ECHEC_DU_CHARGEMENT = 0x5F550;     // (nom) : 0 si la ressource a bien été chargée
const DEMANDER_UNE_RESSOURCE = 0x5F63F;  // (nom) : 1 si elle est disponible
const RENDRE_UNE_RESSOURCE = 0x5F76D;    // (nom)
const COULEUR_LA_PLUS_PROCHE = 0x80250;  // (palette, rouge, vert, bleu)
const POSER_LA_PALETTE = 0x808B0;    // (palette)
const CURSEUR = 0x116E4;             // (image) : change l'image du pointeur
const OUVRIR_ECRAN_PLEIN = 0x40D3E, FERMER_ECRAN_PLEIN = 0x40D79;
const ECRIRE_TEXTE = 0x3F49E;        // (x, y, texte, normal, couleur)
const LISTE_A_CHOIX = 0x576FE;       // la saisie des informations du joueur, à l'écran titre
const CARTE_DU_MONDE = 0x560D2;      // () : le pays choisi, −1 si l'on renonce
const CHOISIR_UNE_PARTIE = 0x1AF83;  // (mode) : la liste des dix emplacements
const TAPER_UN_NOM = 0x793B1;        // (invite, tampon) : 0 on tape encore, 1 validé, 2 abandonné
const VERIFIER_LE_CODE = 0x2EA62;    // () : le nom du joueur est-il « HORZA » (§ 7)
const FONDU = 0x1A706;               // () : fait avancer le fondu d'ouverture
const POSER_LE_CURSEUR = 0x7D775, RENDRE_LE_CURSEUR = 0x7D79E;
const BANQUE_VESA = 0x7E6BC;         // (banque)
const RESTAURER_PAR_BLOCS = 0x54ED6; // (fond, surface) : haute résolution
const RECOPIER_LIGNES_320 = 0x80E20; // (destination, source, lignes)
const ENTREES_DE_L_IMAGE = 0x1107F;  // () : la souris et le clavier
const EFFACER_LA_DEMANDE_DE_SORTIE = 0x2DEF8;
const SYNCHRONISER_AVANT = 0x499F2, SYNCHRONISER_APRES = 0x49704;   // le réseau
const ARRETER_L_AMBIANCE = 0x80350;  // (propriétaire, bruitage)
const REGLER_L_AMBIANCE = 0x80568;   // (propriétaire, bruitage, mode, volume)
const POSER_L_ENTREE_DU_PARC = 0x18BC0;
const BOUCLE_DU_PARC = 0x11C45;
const PREPARER_LE_PROGRAMME = 0x104A3;

// =====================================================================================================

// 0x2CCF8 — la file des événements : appliquer, pour les quatre joueurs, la demande de l'image.
export function appliquerLesEvenements(jeu) {
  let synchroniser = false;
  if (octet(jeu, JOUEURS_EN_RESEAU) > 1) jeu.appeler(SYNCHRONISER_AVANT);

  for (let k = 0; k < CASES_D_EVENEMENT; k++) {
    switch (type(jeu, k)) {
      case 0x02: poserEtTrainer(jeu, k, (c) => jeu.appeler(0x287D8, valeur2(jeu, k), c, 1), 6); break;
      case 0x04: poserEtTrainer(jeu, k, (c) => jeu.appeler(0x28943, c, 1), 6); break;
      case 0x06: poserEtTrainer(jeu, k, (c) => jeu.appeler(0x28E5A, valeur2(jeu, k), c, 1), 6); break;
      case 0x08: poserEtTrainer(jeu, k, (c) => jeu.appeler(0x29340, c, 1), 6); break;
      case 0x0A:
        if (mot(jeu, JOUEUR) === k) jeu.appeler(0x2EBB7, valeur1(jeu, k), valeur2(jeu, k));
        break;
      case 0x0C:
        if (mot(jeu, JOUEUR) === k) jeu.appeler(0x3568E, octet(jeu, EVENEMENT + 6 * k), valeur1(jeu, k));
        break;
      case 0x0E:
        if (mot(jeu, JOUEUR) === k) jeu.appeler(0x40DA6, valeur1(jeu, k));
        break;
      case 0x10:
        if (mot(jeu, JOUEUR) === k) jeu.appeler(0x32232, valeur1(jeu, k), valeur2(jeu, k));
        break;
      case 0x12: poserDesRails(jeu, k); break;
      case 0x14:
        // L'entrée ou la sortie d'une attraction : le deuxième argument vaut 2, et non le genre de
        // pièce que l'outil des rails choisit.
        if (mot(jeu, JOUEUR) === k) {
          jeu.appeler(0x4395B);
          if ((jeu.appeler(0x29835, valeur1(jeu, k), 2, valeur2(jeu, k) >> 2) & 0xFFFF) !== 0) {
            jeu.appeler(BRUITAGE_UNIQUE, 0, 9);
          }
        }
        break;
      case 0x16:
        if (mot(jeu, JOUEUR) === k
            && (jeu.appeler(0x412E0, valeur1(jeu, k), 0xB8, 1) & 0xFFFF) !== 0) {
          jeu.appeler(BRUITAGE_UNIQUE, 0, 6);
        }
        break;
      case 0x18:
        if (mot(jeu, JOUEUR) === k) jeu.appeler(0x2B576, valeur1(jeu, k), 1);
        break;
      case 0x1A:
        if (mot(jeu, JOUEUR) === k) jeu.appeler(0x2B62F, valeur1(jeu, k));
        break;
      case 0x1C:
        if (mot(jeu, JOUEUR) === k) jeu.appeler(0x40E92, valeur1(jeu, k));
        break;
      case 0x1E: poserEtTrainer(jeu, k, (c) => jeu.appeler(0x29686, c, 1), 9); break;
      case 0x20:
        if (mot(jeu, JOUEUR) === k) {
          jeu.appeler(0x29E03, valeur1(jeu, k), 1, valeur2(jeu, k));
          jeu.appeler(BRUITAGE_UNIQUE, 0, 9);
        }
        break;
      case 0x22:
        if (mot(jeu, JOUEUR) === k) jeu.appeler(0x348ED, valeur1(jeu, k), valeur2(jeu, k));
        break;
      case 0x24: demolir(jeu, k); break;
      case 0x26: jeu.appeler(0x2DF12, 0); break;
      case 0x28: jeu.appeler(0x2E035, 0); break;
      case 0x2A: ecrireMot(jeu, SORTIR, 1); break;
      case 0x2C:
        if (mot(jeu, JOUEUR) === k) {
          jeu.appeler(0x64CF5, valeur1(jeu, k), (long(jeu, OBJETS) + valeur2(jeu, k) * 200) >>> 0);
        }
        break;
      case 0x2E: jeu.appeler(0x4A571, valeur1(jeu, k) & 0xFF, ficheVisee(jeu, k)); break;
      case 0x30: jeu.appeler(0x4AAF1, valeur1(jeu, k) & 0xFF, ficheVisee(jeu, k)); break;
      case 0x32: case 0x34:
        ecrireOctet(jeu, ACCUSES_DE_RECEPTION, octet(jeu, ACCUSES_DE_RECEPTION) + 1);
        break;
      case 0x36:
        if (mot(jeu, JOUEUR) === k) {
          jeu.appeler(INSCRIRE_AU_LIVRE, 0xE, Math.imul(octet(jeu, JOUEURS_EN_RESEAU), -5000));
        } else {
          jeu.appeler(0x4C592, (jeu.appeler(HASARD_SUIVANT) & 0xFFFF) % 4);
        }
        break;
      case 0x38: donnerDeLArgent(jeu, k); break;
      case 0x3A: repartirAvecUneGraine(jeu, k); break;
      case 0x3C: jeu.appeler(0x7B65C, valeur1(jeu, k)); break;
      case 0x3E: jeu.appeler(0x7C128, valeur1(jeu, k)); break;
      case 0x40: synchroniser = true; break;
      case 0x42: ecrireMot(jeu, VITESSE, valeur1(jeu, k)); break;
      case 0x5A: jeu.appeler(EFFACER_LA_DEMANDE_DE_SORTIE); break;
      default: break;                 // 0x00, et tout type que la table 0x2CD30 ne connaît pas
    }
    // La case devient l'image précédente, et se vide — sauf sa seconde valeur, jamais effacée.
    ecrireOctet(jeu, PRECEDENT + 6 * k + 1, type(jeu, k));
    ecrireMot(jeu, PRECEDENT + 6 * k + 2, valeur1(jeu, k));
    ecrireMot(jeu, PRECEDENT + 6 * k + 4, valeur2(jeu, k));
    ecrireOctet(jeu, EVENEMENT + 6 * k + 1, 0);
    ecrireMot(jeu, EVENEMENT + 6 * k + 2, 0);
  }

  if (synchroniser) jeu.appeler(SYNCHRONISER_APRES);
}

// La pose d'un élément de tracé, puis la traînée jusqu'à la case de l'image précédente.
function poserEtTrainer(jeu, k, poser, bruitage) {
  if (mot(jeu, JOUEUR) !== k) return;
  if ((poser(valeur1(jeu, k)) & 0xFFFF) !== 0) jeu.appeler(BRUITAGE_UNIQUE, 0, bruitage);
  if (typePrecedent(jeu, k) !== type(jeu, k)) return;
  trainer(jeu, k, poser);
}

// La traînée : de la case courante vers la case précédente, d'abord le long des rangées, puis le long
// des colonnes. La case précédente elle-même n'est pas reposée : l'image précédente s'en est chargée.
function trainer(jeu, k, poser) {
  const depart = valeur1(jeu, k), arrivee = valeur1Precedente(jeu, k);
  let colonne = depart % 64, rangee = (depart / 64) | 0;
  const colonneVisee = arrivee % 64, rangeeVisee = (arrivee / 64) | 0;
  const pasColonne = colonne < colonneVisee ? 1 : -1;
  const pasRangee = rangee < rangeeVisee ? 1 : -1;
  while (rangee !== rangeeVisee) {
    poser(((rangee << 6) + colonne) & 0xFFFF);
    rangee += pasRangee;
  }
  while (colonne !== colonneVisee) {
    poser(((rangee << 6) + colonne) & 0xFFFF);
    colonne += pasColonne;
  }
}

// L'événement 0x12, les rails : comme les tracés, mais la demande est d'abord comparée à celle de
// l'image précédente — glisser sans changer de case ne repose rien —, et la case marquée est annulée.
function poserDesRails(jeu, k) {
  if (mot(jeu, JOUEUR) !== k) return;
  if (typePrecedent(jeu, k) === type(jeu, k) && valeur1Precedente(jeu, k) === valeur1(jeu, k)) return;
  const poser = (c) => jeu.appeler(0x29835, c, valeur2(jeu, k) & 3, valeur2(jeu, k) >> 2);
  jeu.appeler(0x4395B);
  if ((poser(valeur1(jeu, k)) & 0xFFFF) !== 0) jeu.appeler(BRUITAGE_UNIQUE, 0, 9);
  if (typePrecedent(jeu, k) !== type(jeu, k)) return;
  trainer(jeu, k, poser);
}

// L'événement 0x24, la démolition. Si l'outil 0x11 est en main — la sortie d'une attraction qu'on vient
// de poser —, la case mise de côté dans les comptes (+0x2BC) est achevée : une allée si le genre de
// l'attraction (+0x2BA, table 0xB44D9) porte le bit 1, sinon l'objet est ôté. La case visée est ensuite
// rendue au sol si elle était réservée (bit 5 de son octet +3), sinon son objet est ôté.
function demolir(jeu, k) {
  if (mot(jeu, JOUEUR) !== k) return;
  if (mot(jeu, OUTIL) === 0x11) {
    const comptes = COMPTES + TAILLE_COMPTES * mot(jeu, JOUEUR);
    const caseMiseDeCote = mot(jeu, comptes + 0x2BC);
    if (caseMiseDeCote !== 0) {
      if (octet(jeu, 0xB44D9 + 4 * mot(jeu, comptes + 0x2BA)) & 2) {
        jeu.appeler(0x28943, caseMiseDeCote, 1);
      } else {
        jeu.appeler(0x205D7, caseMiseDeCote);
      }
    }
    ecrireMot(jeu, OUTIL, 0);
  }
  const cellule = (long(jeu, CARTE) + 4 * valeur1(jeu, k)) >>> 0;
  if (octet(jeu, cellule + 3) & 0x20) {
    ecrireOctet(jeu, cellule + 3, octet(jeu, cellule + 3) & 0xDF);
    ecrireMot(jeu, REDESSINER_CARTE, 1);
  } else {
    jeu.appeler(0x205D7, valeur1(jeu, k));
  }
}

// La fiche du joueur visé par un ordre de bourse : l'octet +0x40 des comptes de la case traitée.
function ficheVisee(jeu, k) {
  const vise = octet(jeu, COMPTES + TAILLE_COMPTES * k + 0x40);
  return (long(jeu, FICHES) + TAILLE_FICHE * vise) >>> 0;
}

// L'événement 0x38 : le code de triche et la fin d'année donnent de l'argent. Anomalie reproduite — la
// somme et le solde sont toujours ceux du joueur courant, même quand la case traitée est celle d'un
// autre ; seul le nom du message vient de la case.
function donnerDeLArgent(jeu, k) {
  const fiche = long(jeu, FICHE_DU_JOUEUR);
  ecrireLong(jeu, fiche + 0xA, longSigne(jeu, fiche + 0xA) + valeur1(jeu, mot(jeu, JOUEUR)));
  jeu.appeler(SPRINTF, (long(jeu, COMPTES_DU_JOUEUR) + 0x1B1) >>> 0,
    long(jeu, long(jeu, MESSAGES) + 8), COMPTES + TAILLE_COMPTES * k);
  ecrireMot(jeu, ECRAN, 0x56);
}

// L'événement 0x3E : une nouvelle partie dont la graine de hasard est imposée (le jeu en réseau, où
// toutes les machines doivent tirer la même suite). Le pays du joueur, octet +5 de sa fiche, est mis de
// côté et rétabli après, et le prix du billet recalculé : 1 128 + (2 − difficulté du pays) × 500.
function repartirAvecUneGraine(jeu, k) {
  ecrireLong(jeu, HASARD, ((valeur1(jeu, k) << 16) | valeur2(jeu, k)) >>> 0);
  const pays = s8(octet(jeu, long(jeu, FICHE_DU_JOUEUR) + 5));
  jeu.appeler(0x19EEE);
  ecrireOctet(jeu, PAYS + TAILLE_PAYS * (pays & 0xFFFF) + 0x1A, octet(jeu, JOUEUR));
  ecrireOctet(jeu, long(jeu, FICHE_DU_JOUEUR) + 5, pays);
  const difficulte = octet(jeu, PAYS + TAILLE_PAYS * s8(octet(jeu, long(jeu, FICHE_DU_JOUEUR) + 5)) + 0xD);
  ecrireMot(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x3E, 0x468 + (2 - difficulte) * 0x1F4);
}

// =====================================================================================================

// Le chemin d'une sauvegarde, et la liste des blocs à écrire.
const CHEMIN_PARTIE_EN_COURS = 0xB0120;   // "%ssave/%s.gy"
const CHEMIN_DEMO = 0xB012D;              // "%ssave/DEMO.GY"
const CHEMIN_EMPLACEMENT = 0xB013C;       // "%ssave/%s.g%d"
const BLOCS = 0xB1515;                    // (adresse, taille) jusqu'à une adresse nulle

function nommerLaSauvegarde(jeu, depuis, retours, tampon, emplacement) {
  if (emplacement >= 0) {
    depuis(retours[2], SPRINTF, tampon, CHEMIN_EMPLACEMENT, DOSSIER_DU_JEU, NOM_DU_JOUEUR, emplacement);
  } else if (emplacement === -1) {
    depuis(retours[0], SPRINTF, tampon, CHEMIN_PARTIE_EN_COURS, DOSSIER_DU_JEU, NOM_DU_JOUEUR);
  } else {
    depuis(retours[1], SPRINTF, tampon, CHEMIN_DEMO, DOSSIER_DU_JEU, NOM_DU_JOUEUR);
  }
}

// Les trois premiers blocs sont les grands tableaux du tas : leur adresse n'est connue qu'à
// l'exécution, et les deux routines la remettent dans la table avant de s'en servir.
function rafraichirLesBlocs(jeu) {
  ecrireLong(jeu, BLOCS + 0x00, long(jeu, FICHES));
  ecrireLong(jeu, BLOCS + 0x08, long(jeu, CARTE));
  ecrireLong(jeu, BLOCS + 0x10, long(jeu, OBJETS));
}

// Le tampon du nom de fichier est la variable [ebp-0x4C] de l'original, 0x5C octets sous son point
// d'entrée : les deux routines reprennent donc son cadre, pour que les appels qu'elles font n'écrasent
// pas le nom qu'elles viennent d'y écrire.
const TAMPON_DU_CHEMIN = 0x5C;
const CADRE_DE_LA_SAUVEGARDE = 0x5C;     // 12 octets de registres, 4 d'ebp, 0x4C de variables
const CADRE_DU_CHARGEMENT = 0x60;        // ... et 0x50 de variables

// 0x2DF12 — sauver la partie dans un emplacement. Rend 1 si le fichier a pu être écrit.
export function sauverLaPartie(jeu, emplacement) {
  const entree = jeu.T.lireRegistre('esp') >>> 0;
  const cadre = (entree - CADRE_DE_LA_SAUVEGARDE) >>> 0;
  const tampon = (entree - TAMPON_DU_CHEMIN) >>> 0;
  const depuis = (retour, adresse, ...args) => jeu.appelerDepuis(retour, cadre, adresse, ...args);

  rafraichirLesBlocs(jeu);
  nommerLaSauvegarde(jeu, depuis, [0x2DF61, 0x2DF81, 0x2DFA6], tampon, s8(emplacement));

  const poignee = depuis(0x2DFB7, OUVRIR, tampon, 0x222) | 0;
  if (poignee < 0) return 0;
  for (let k = 0; long(jeu, BLOCS + 8 * k) !== 0; k++) {
    depuis(0x2E007, ECRIRE_FICHIER, poignee, long(jeu, BLOCS + 8 * k), long(jeu, BLOCS + 8 * k + 4));
  }
  // Hors du jeu d'origine : la suite de la table agrandie (table-des-objets.js), dans le tampon du nom,
  // dont on n'a plus besoin.
  ecrireLaSuite(jeu, (a, n) => depuis(0x2E007, ECRIRE_FICHIER, poignee, a, n), tampon);
  depuis(0x2E015, FERMER, poignee);
  depuis(0x2E01D, 0x51011);
  return 1;
}

// 0x2E035 — charger la partie d'un emplacement. Rend 1 si le fichier a pu être lu.
export function chargerLaPartie(jeu, emplacement) {
  const entree = jeu.T.lireRegistre('esp') >>> 0;
  const cadre = (entree - CADRE_DU_CHARGEMENT) >>> 0;
  const tampon = (entree - TAMPON_DU_CHEMIN) >>> 0;
  const depuis = (retour, adresse, ...args) => jeu.appelerDepuis(retour, cadre, adresse, ...args);

  rafraichirLesBlocs(jeu);
  nommerLaSauvegarde(jeu, depuis, [0x2E084, 0x2E0A4, 0x2E0C9], tampon, s8(emplacement));

  const poignee = depuis(0x2E0DA, OUVRIR, tampon, 0x200) | 0;
  if (poignee < 0) return 0;
  for (let k = 0; long(jeu, BLOCS + 8 * k) !== 0; k++) {
    depuis(0x2E12E, LIRE, poignee, long(jeu, BLOCS + 8 * k), long(jeu, BLOCS + 8 * k + 4));
  }
  // Hors du jeu d'origine : la table agrandie vidée au-delà des 53 blocs, puis sa suite relue.
  lireLaSuite(jeu, (a, n) => depuis(0x2E12E, LIRE, poignee, a, n), tampon);
  depuis(0x2E13C, FERMER, poignee);

  // Les trois drapeaux du genre de partie relu : un seul est levé, celui que dit [0xD66F1].
  ecrireOctet(jeu, 0xD775E, 0);
  ecrireOctet(jeu, 0xD7759, 0);
  ecrireOctet(jeu, 0xD7761, 0);
  const genre = octet(jeu, GENRE_DE_PARTIE);
  if (genre === 0) ecrireOctet(jeu, 0xD7761, 1);
  else if (genre === 1) ecrireOctet(jeu, 0xD7759, 1);
  else if (genre === 2) ecrireOctet(jeu, 0xD775E, 1);

  ecrireMot(jeu, 0xD6656, 0);
  ecrireOctet(jeu, SEQUENCE, 0xFF);
  ecrireMot(jeu, REDESSINER_CARTE, 1);
  if (octet(jeu, long(jeu, PARC_DU_JOUEUR) + 0x18) === 0) {
    depuis(0x2E1BE, 0x19334);                          // le parc est fermé
    depuis(0x2E1CC, ARRETER_L_AMBIANCE, 0, 0x15);
  } else {
    depuis(0x2E1F1, REGLER_L_AMBIANCE, 0, 0x15, 3, octet(jeu, 0xB14B4));
  }
  return 1;
}

// =====================================================================================================

// 0x2E20C — charger les textes de la langue, et en dresser les 26 tables.
//
// Le nom `data/lang0-0.dat` (0xB105C) porte le rang de la langue à la place du premier `0` : il est
// parcouru jusqu'au `-`, et le caractère qui le précède reçoit `'0' + langue`. Le fichier commence par
// un mot, le nombre de sections, puis un mot par section, le nombre de chaînes qu'elle porte, puis
// toutes les chaînes à la file, terminées par un zéro. Chaque section reçoit une table de pointeurs
// réservée sur le tas, rangée dans la variable qui lui revient. Une section au-delà de la 25ᵉ n'a pas
// de variable : ses chaînes continuent de s'écrire à la suite de la table précédente.
//
// Rend 1 si tout a été lu et réservé, 0 sinon.
const NOM_DES_TEXTES = 0xB105C;
const TABLES_DES_TEXTES = [
  0xD7BD0, 0xD7B98, 0xD7BCC, 0xD7B94, 0xD7BC8, 0xD7BC4, 0xD7BC0, 0xD7BBC, 0xD7BB8, 0xD7BB4,
  0xD7BB0, 0xD7BAC, 0xD7BA8, 0xD7BA4, 0xD7BA0, 0xD7B9C, 0xD7BD4, 0xD7B90, 0xD7B8C, 0xD7B88,
  0xD7B84, 0xD7B70, 0xD7B80, 0xD7B7C, 0xD7B78, 0xD7B74,
];
const DEBUT_DES_TEXTES = 0xD35A8;    // pointeur : le fichier chargé
const FIN_DES_TEXTES = 0xD35A4;      // pointeur : sa fin

export function chargerLesTextes(jeu) {
  let k = 0;
  while (octet(jeu, NOM_DES_TEXTES + k) !== 0x2D && octet(jeu, NOM_DES_TEXTES + k) !== 0) k++;
  if (octet(jeu, NOM_DES_TEXTES + k) !== 0) {
    ecrireOctet(jeu, NOM_DES_TEXTES + k - 1, octet(jeu, LANGUE) + 0x30);
  }
  if (jeu.appeler(DEMANDER_UNE_RESSOURCE, NOM_DES_TEXTES) !== 1) return 0;

  const base = long(jeu, DEBUT_DES_TEXTES);
  const nombres = (base + 2) >>> 0;              // un mot par section : le nombre de ses chaînes
  let chaine = (base + 2 + 2 * motSigne(jeu, base)) >>> 0;
  let section = -1, rang = 0, table = 0;

  while (chaine >>> 0 < long(jeu, FIN_DES_TEXTES)) {
    if (section === -1 || rang === mot(jeu, nombres + 2 * section)) {
      section++;
      rang = 0;
      if ((section & 0xFFFF) <= 0x19) {
        const reservee = jeu.appeler(RESERVER, 4 * motSigne(jeu, nombres + 2 * section)) >>> 0;
        ecrireLong(jeu, TABLES_DES_TEXTES[section], reservee);
        if (long(jeu, TABLES_DES_TEXTES[section]) === 0) return 0;
        table = long(jeu, TABLES_DES_TEXTES[section]);
      }
    }
    ecrireLong(jeu, table, chaine);
    table = (table + 4) >>> 0;
    while (octet(jeu, chaine) !== 0 && chaine >>> 0 < long(jeu, FIN_DES_TEXTES)) {
      chaine = (chaine + 1) >>> 0;
    }
    chaine = (chaine + 1) >>> 0;
    rang++;
  }
  return 1;
}

// =====================================================================================================

// 0x19EEE — une nouvelle partie : tout effacer et tout remettre au départ.
export function nouvellePartie(jeu) {
  jeu.appeler(0x80DC0);
  jeu.appeler(0x80990);

  // Les comptes du joueur, la carte, les objets du parc et les 25 fiches de parc : à zéro.
  jeu.appeler(REMPLIR, COMPTES + TAILLE_COMPTES * mot(jeu, JOUEUR), 0, TAILLE_COMPTES);
  jeu.appeler(REMPLIR, long(jeu, CARTE), 0, 0x4000);
  jeu.appeler(REMPLIR, long(jeu, OBJETS), 0, octetsAEffacer(jeu));   // 0x3A980 en 1994
  jeu.appeler(REMPLIR, PARCS, 0, 0x39D0);

  // Les catalogues repartent de leur modèle.
  jeu.appeler(COPIER, 0xCCED0, 0xB16F8, 0x1900);   // les attractions
  jeu.appeler(COPIER, 0xD3C62, 0xB2FF8, 0x786);    // les boutiques
  jeu.appeler(COPIER, 0xCCA70, 0xB377E, 0x460);    // les décors
  jeu.appeler(COPIER, 0xD37DC, 0xB3BDE, 0x2C);     // les chemins
  jeu.appeler(COPIER, 0xD43E8, 0xB3C0A, 0xE);      // les barrières des files
  jeu.appeler(COPIER, 0xD35C0, 0xB3C18, 0x21C);    // le personnel
  jeu.appeler(COPIER, 0xD3C00, 0xB43C5, 0x62);

  ecrireMot(jeu, 0xD6678, 0);
  ecrireMot(jeu, 0xD664A, 0);
  ecrireMot(jeu, 0xD6646, mot(jeu, 0xD664A));
  ecrireMot(jeu, 0xD665A, mot(jeu, 0xD6646));

  // Aucun pays n'appartient plus à personne.
  for (let k = 0; octet(jeu, PAYS + TAILLE_PAYS * k) !== 0; k++) {
    ecrireOctet(jeu, PAYS + TAILLE_PAYS * k + 0x1A, 0xFF);
  }

  ecrireOctet(jeu, SEQUENCE, 0xFF);
  ecrireLong(jeu, PAS_DE_SIMULATION, 0);

  // Les 25 fiches de joueur reviennent à leur modèle.
  for (let k = 0; k < 0x19; k++) {
    const source = (MODELE_DES_FICHES + TAILLE_FICHE * k) >>> 0;
    const destination = (long(jeu, FICHES) + TAILLE_FICHE * k) >>> 0;
    jeu.m8.copyWithin(destination, source, source + TAILLE_FICHE);
  }

  ecrireOctet(jeu, 0xD66F5, 1);
  ecrireOctet(jeu, 0xD66F0, octet(jeu, 0xB7F8B));   // 25 : rôle non établi
  ecrireOctet(jeu, GENRE_DE_PARTIE, 2);
  if (octet(jeu, JOUEURS_EN_RESEAU) > 1) {
    ecrireMot(jeu, JOUEUR, jeu.appeler(0x49414, octet(jeu, JOUEURS_EN_RESEAU)));
  }
  jeu.appeler(0x1A2CA, mot(jeu, JOUEUR));
  ecrireOctet(jeu, (long(jeu, FICHES) + TAILLE_FICHE * mot(jeu, JOUEUR)) >>> 0, 7);
  jeu.appeler(0x6E7E6);
  jeu.appeler(0x78B53);

  ecrireMot(jeu, OUTIL, 0);
  ecrireMot(jeu, 0xD668E, 0x8C);
  ecrireMot(jeu, 0xD668C, 7);
  ecrireOctet(jeu, 0xD7768, 0);
  ecrireMot(jeu, REDESSINER_CARTE, 1);
  jeu.appeler(POSER_L_ENTREE_DU_PARC, 0x1020);     // la case 0x1020 : colonne 32, rangée 64

  // Le bus : le premier objet libre devient un objet de type 0xE, état 0x1A, et son numéro est rangé
  // dans le mot +0x2BE des comptes.
  for (let o = (long(jeu, OBJETS) + 200) >>> 0; o >>> 0 < long(jeu, FIN_DES_OBJETS); o = (o + 200) >>> 0) {
    if (octet(jeu, o + 4) !== 0) continue;
    ecrireOctet(jeu, o + 4, 0xE);
    ecrireOctet(jeu, o + 0xC, 0x1A);
    ecrireMot(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x2BE, ((o - long(jeu, OBJETS)) / 200) | 0);
    break;
  }

  // La caméra au milieu de la carte, d'après la taille d'une tuile et la hauteur de l'écran (640x480,
  // plus en grande vue : grande-vue.js).
  ecrireMot(jeu, COLONNE, 0x20 - ((((largeurDeLaVue(jeu) / mot(jeu, LARGEUR_TUILE)) | 0) / 2) | 0) + 2);
  const hauteur = (octet(jeu, MODE_AFFICHAGE) & 1) ? 0x190 : hauteurDeLaVue(jeu);
  ecrireMot(jeu, RANGEE,
    0x40 - (((mot(jeu, HAUTEUR_TUILE) + hauteur - 1) / mot(jeu, HAUTEUR_TUILE)) | 0) - 2);
  ecrireMot(jeu, 0xD6678, 0);
  jeu.appeler(0x78B53);

  ecrireOctet(jeu, long(jeu, PARC_DU_JOUEUR) + 0x77, 0);      // pas de feux d'artifice
  ecrireLong(jeu, long(jeu, PARC_DU_JOUEUR) + 0x78, 0xFFFFFFFF);
  ecrireOctet(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x636, 0);
  for (let k = 0; k < 8; k++) ecrireOctet(jeu, long(jeu, PARC_DU_JOUEUR) + 0x248 + k, 1);
}

// 0x1A2CA — désigner le joueur courant et recalculer tout ce qui en dépend.
export function poserLeJoueurCourant(jeu, joueur) {
  ecrireMot(jeu, JOUEUR, joueur);
  ecrireLong(jeu, COMPTES_DU_JOUEUR, COMPTES + TAILLE_COMPTES * mot(jeu, JOUEUR));
  ecrireLong(jeu, FICHE_DU_JOUEUR, (long(jeu, FICHES) + TAILLE_FICHE * mot(jeu, JOUEUR)) >>> 0);
  ecrireLong(jeu, PARC_DU_JOUEUR, PARCS + TAILLE_PARC * mot(jeu, JOUEUR));
  ecrireOctet(jeu, EVENEMENT + 6 * mot(jeu, JOUEUR), octet(jeu, JOUEUR));

  // Le nom du propriétaire en tête de ses comptes, le nom du parc en +0x20 ; à défaut, les textes de
  // la première section (0x12E pour l'un, 0x49 pour l'autre).
  if (octet(jeu, OWNER) !== 0) {
    jeu.appeler(STRCPY, long(jeu, COMPTES_DU_JOUEUR), OWNER);
  } else {
    jeu.appeler(STRCPY, long(jeu, COMPTES_DU_JOUEUR), long(jeu, long(jeu, TEXTES_DE_BASE) + 0x4B8));
  }
  if (octet(jeu, NOM_DU_PARC) !== 0) {
    jeu.appeler(SPRINTF, (long(jeu, COMPTES_DU_JOUEUR) + 0x20) >>> 0, 0xB00DC, NOM_DU_PARC);
  } else {
    jeu.appeler(STRCPY, (long(jeu, COMPTES_DU_JOUEUR) + 0x20) >>> 0,
      long(jeu, long(jeu, TEXTES_DE_BASE) + 0x124));
  }

  ecrireMot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x7C, 0);
  ecrireMot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x7E, 0);
  ecrireMot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x1D, 0x32);     // le seuil du contentement
  ecrireLong(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x638, -0x3E8);
  ecrireMot(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x2CE, mot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x1D));

  // Le solde et la valeur de départ, et le prêt : la moitié du solde arrondie à 50 000 près, sauf en
  // partie normale ([0xD66F1] = 2) quand [0xD671C] n'est pas nul.
  ecrireLong(jeu, long(jeu, FICHE_DU_JOUEUR) + 0xA, long(jeu, ARGENT_DE_DEPART));
  ecrireLong(jeu, long(jeu, FICHE_DU_JOUEUR) + 0x16, long(jeu, long(jeu, FICHE_DU_JOUEUR) + 0xA));
  if (octet(jeu, GENRE_DE_PARTIE) === 2 && octet(jeu, 0xD671C) === 0) {
    const moitie = (longSigne(jeu, long(jeu, FICHE_DU_JOUEUR) + 0xA) / 2) | 0;
    ecrireLong(jeu, long(jeu, FICHE_DU_JOUEUR) + 0x12, moitie - (moitie % 0xC350));
  }

  for (let k = 0; k < 3; k++) {
    ecrireLong(jeu, long(jeu, FICHE_DU_JOUEUR) + 0x30 * k + 0x109,
      long(jeu, long(jeu, FICHE_DU_JOUEUR) + 0xA));
    ecrireOctet(jeu, long(jeu, FICHE_DU_JOUEUR) + 0xC * k + 0x208,
      octet(jeu, long(jeu, FICHE_DU_JOUEUR) + 0x95));
    const valeur = Math.imul(longSigne(jeu, long(jeu, PARC_DU_JOUEUR) + 0x66),
      mot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x62));
    ecrireLong(jeu, long(jeu, FICHE_DU_JOUEUR) + 0x30 * k + 0x199, valeur);
  }
  for (let k = 0; k < 6; k++) {
    ecrireLong(jeu, long(jeu, COMPTES_DU_JOUEUR) + 4 * k + 0x64C, 0);
    ecrireLong(jeu, long(jeu, COMPTES_DU_JOUEUR) + 4 * k + 0x664, 0);
    ecrireMot(jeu, long(jeu, PARC_DU_JOUEUR) + 2 * k + 0x114, 0);
  }

  // La valeur des catalogues : chaque article compte pour ce qu'on en possède, multiplié.
  for (let k = 0; mot(jeu, 0xCCEF2 + 0xC8 * k) !== 0; k++) {
    ecrireLong(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x668,
      longSigne(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x668) + mot(jeu, 0xCCF7A + 0xC8 * k) * 0x200);
  }
  for (let k = 0; mot(jeu, 0xD3C84 + 0x6B * k) !== 0; k++) {
    ecrireLong(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x66C,
      longSigne(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x66C) + mot(jeu, 0xD3CC6 + 0x6B * k) * 0x200);
  }
  for (let k = 0; mot(jeu, 0xCCA92 + 0x38 * k) !== 0; k++) {
    ecrireLong(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x674,
      longSigne(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x674) + mot(jeu, 0xCCA9C + 0x38 * k) * 0x80);
  }

  ecrireLong(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x678, 0x32000);
  ecrireLong(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x670, 0x55730);
  ecrireLong(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x664, 0x7A120);
  ecrireOctet(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x5CF, 0x20);
  ecrireMot(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x5D0, 0x14);
  ecrireMot(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x615, mot(jeu, long(jeu, PARC_DU_JOUEUR) + 0xD2));
  ecrireMot(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x617, mot(jeu, long(jeu, PARC_DU_JOUEUR) + 0xCE));
  ecrireMot(jeu, long(jeu, COMPTES_DU_JOUEUR) + 0x613, mot(jeu, long(jeu, PARC_DU_JOUEUR) + 0xD6));
  ecrireLong(jeu, long(jeu, PARC_DU_JOUEUR) + 0x12C, 0);
  ecrireMot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x112, 1);
  ecrireMot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x110, mot(jeu, long(jeu, PARC_DU_JOUEUR) + 0x112));
  ecrireOctet(jeu, long(jeu, PARC_DU_JOUEUR) + 0x18, 0);      // le parc est fermé
  ecrireMot(jeu, long(jeu, PARC_DU_JOUEUR) + 0, 0xC8);
  ecrireMot(jeu, long(jeu, PARC_DU_JOUEUR) + 2, 0xFF9C);
  jeu.appeler(0x78B53);
}

// =====================================================================================================

// 0x10D42 — passer d'une résolution à l'autre (1 = 320x200, 8 = 640x480).
//
// Les tables d'enseignes ([0xD3B7C], 10 octets par entrée, et [0xD3B80], 8 octets) sont écrites pour la
// basse résolution : passer en 640x480 double leurs largeurs, revenir les divise. Les images de la
// barre d'outils sont rechargées sous leur nom en `h` ou en `m`. Anomalie reproduite : le mode est rangé
// dans [0xDE5F6] jusqu'à trois fois de suite.
export function changerDeResolution(jeu, mode) {
  jeu.appeler(0x7E0E1);
  if ((mode & 0xFFFF) === 1) {
    for (let k = 0; long(jeu, 0xB13FF + 0x4F * k) !== 0; k++) poserLaLettre(jeu, k, 0x6D);   // 'm'
    jeu.appeler(CHARGER_UN_FICHIER, 0xB13C1, long(jeu, 0xD3B4C));
    jeu.appeler(CHARGER_UN_FICHIER, 0xB1410, long(jeu, 0xD3B68));
    ecrireMot(jeu, LARGEUR_TUILE, 0x30);
    ecrireMot(jeu, HAUTEUR_TUILE, 0x20);
    if (mot(jeu, MODE_AFFICHAGE) === 8) {
      for (let p = long(jeu, 0xD3B7C); p >>> 0 < long(jeu, 0xD3B74); p = (p + 0xA) >>> 0) {
        ecrireMot(jeu, p + 2, mot(jeu, p + 2) << 1);
        ecrireMot(jeu, p + 4, mot(jeu, p + 4) << 1);
      }
      for (let p = long(jeu, 0xD3B80); p >>> 0 < long(jeu, 0xD3B50); p = (p + 8) >>> 0) {
        ecrireOctet(jeu, p + 2, octet(jeu, p + 2) << 1);
        ecrireOctet(jeu, p + 3, octet(jeu, p + 3) << 1);
      }
      ecrireMot(jeu, MODE_AFFICHAGE, mode);
      jeu.appeler(0x1036D);
    }
    ecrireMot(jeu, MODE_AFFICHAGE, mode);
    jeu.appeler(0x10C80, long(jeu, 0xD3B68), long(jeu, 0xD3B6C), long(jeu, 0xD3B4C));
    ecrireOctet(jeu, EPAISSEUR, 2);
  } else if ((mode & 0xFFFF) === 8) {
    for (let k = 0; long(jeu, 0xB13FF + 0x4F * k) !== 0; k++) poserLaLettre(jeu, k, 0x68);   // 'h'
    jeu.appeler(CHARGER_UN_FICHIER, 0xB13C1, long(jeu, 0xD3B4C));
    jeu.appeler(CHARGER_UN_FICHIER, 0xB1410, long(jeu, 0xD3B68));
    jeu.appeler(0x10C80, long(jeu, 0xD3B68), long(jeu, 0xD3B6C), long(jeu, 0xD3B4C));
    ecrireMot(jeu, LARGEUR_TUILE, 0x18);
    ecrireMot(jeu, HAUTEUR_TUILE, 0x10);
    if (mot(jeu, MODE_AFFICHAGE) !== 8) {
      for (let p = long(jeu, 0xD3B7C); p >>> 0 < long(jeu, 0xD3B74); p = (p + 0xA) >>> 0) {
        ecrireMot(jeu, p + 2, (s16(mot(jeu, p + 2)) / 2) | 0);
        ecrireMot(jeu, p + 4, (s16(mot(jeu, p + 4)) / 2) | 0);
      }
      for (let p = long(jeu, 0xD3B80); p >>> 0 < long(jeu, 0xD3B50); p = (p + 8) >>> 0) {
        ecrireOctet(jeu, p + 2, (octet(jeu, p + 2) / 2) | 0);
        ecrireOctet(jeu, p + 3, (octet(jeu, p + 3) / 2) | 0);
      }
      jeu.appeler(0x1041A);
      jeu.appeler(0x10CE4, long(jeu, 0xD3B68), long(jeu, 0xD3B6C));
      ecrireMot(jeu, MODE_AFFICHAGE, mode);
    }
    ecrireOctet(jeu, EPAISSEUR, 1);
  }
  ecrireMot(jeu, MODE_AFFICHAGE, mode);
  jeu.appeler(0x7DF44);
  jeu.appeler(0x1146E, 0x140, 0xC8);
  jeu.appeler(0x4DFAC);
  jeu.appeler(0x50366);
  jeu.appeler(0x51011);
  ecrireMot(jeu, 0xD6612, 0);
  ecrireMot(jeu, 0xD6616, mot(jeu, 0xB93F5) - octet(jeu, long(jeu, 0xD3B54) + 0x7D) - 0xA);
  ecrireOctet(jeu, HAUTEUR_DE_LIGNE, octet(jeu, long(jeu, 0xD3B64) + 6 * octet(jeu, 0xB5218) + 5));
}

// La lettre de résolution d'un nom de fichier d'images. Les noms de la table 0xB13B5 (0x4F octets par
// entrée, le nom en +0xC) font tous dix-sept caractères, et la lettre à changer est la sixième : le jeu
// écrit à l'entrée + la longueur du nom, ce qui tombe exactement dessus.
function poserLaLettre(jeu, k, lettre) {
  const entree = 0xB13B5 + 0x4F * k;
  ecrireOctet(jeu, entree + jeu.appeler(STRLEN, entree + 0xC), lettre);
}

// =====================================================================================================

// 0x12452 — l'entrée dans le parc : tout ce qu'il faut poser avant la première image.
export function entrerDansLeParc(jeu) {
  ecrireLong(jeu, HASARD, 0x7FBE5);          // la graine, la même à chaque partie (§ 10.1)
  ecrireLong(jeu, 0xD35AC, long(jeu, PALETTE_DU_PARC));
  jeu.appeler(0x11191, 0x140, 0xC8);
  ecrireMot(jeu, ECRAN, 0x66);
  jeu.appeler(0x11191, 0x140, 0xC8);

  // Les catalogues reçoivent les noms traduits : chaque article porte le numéro de son texte.
  for (let k = 0; mot(jeu, 0xB171A + 0xC8 * k) !== 0; k++) {
    jeu.appeler(STRCPY, 0xB16F8 + 0xC8 * k,
      long(jeu, long(jeu, TEXTES_DE_BASE) + 4 * mot(jeu, 0xB171A + 0xC8 * k)));
    // L'enseigne de l'article : son octet +2 est ramené à 0xFF s'il est sous 0x2D.
    const enseigne = (long(jeu, 0xD3B80)
      + 8 * mot(jeu, long(jeu, 0xD3B38) + 2 * mot(jeu, 0xB17B7 + 0xC8 * k))) >>> 0;
    if (octet(jeu, enseigne + 2) < 0x2D) ecrireOctet(jeu, enseigne + 2, 0xFF);
  }
  for (let k = 0; mot(jeu, 0xB301A + 0x6B * k) !== 0; k++) {
    jeu.appeler(STRCPY, 0xB2FF8 + 0x6B * k,
      long(jeu, long(jeu, TEXTES_DE_BASE) + 4 * mot(jeu, 0xB301A + 0x6B * k)));
  }
  for (let k = 0; mot(jeu, 0xB3C3A + 0x36 * k) !== 0; k++) {
    jeu.appeler(STRCPY, 0xB3C18 + 0x36 * k,
      long(jeu, long(jeu, TEXTES_DE_BASE) + 4 * mot(jeu, 0xB3C3A + 0x36 * k)));
  }
  for (let k = 0; mot(jeu, 0xB37A0 + 0x38 * k) !== 0; k++) {
    jeu.appeler(STRCPY, 0xB377E + 0x38 * k,
      long(jeu, long(jeu, TEXTES_DE_BASE) + 4 * mot(jeu, 0xB37A0 + 0x38 * k)));
  }

  // Les vingt-six couleurs de l'interface, cherchées une fois pour toutes dans la palette du parc.
  const couleur = (r, v, b) =>
    jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE_DU_PARC), r, v, b) & 0xFF;
  ecrireOctet(jeu, 0xD777E, couleur(0x3F, 0x3F, 0x3F));
  ecrireOctet(jeu, 0xD7773, couleur(0, 0, 0));
  ecrireOctet(jeu, 0xD777A, couleur(0, 0, 0x10));
  ecrireOctet(jeu, 0xD7775, couleur(0, 0x3F, 0));
  ecrireOctet(jeu, 0xD7774, couleur(0, 0x30, 0));
  ecrireOctet(jeu, 0xD7772, couleur(0x3F, 0x30, 0x17));
  ecrireOctet(jeu, 0xD7776, couleur(0x19, 0xA, 0));
  ecrireOctet(jeu, 0xD7784, couleur(0x3F, 0x1A, 7));
  ecrireOctet(jeu, 0xD7783, couleur(0x3F, 0x17, 0x17));
  ecrireOctet(jeu, 0xD777C, couleur(0x3F, 0, 0));
  ecrireOctet(jeu, 0xD777D, couleur(0x3F, 0, 0x3F));
  ecrireOctet(jeu, 0xD7782, couleur(0x3F, 0x17, 0x3F));
  ecrireOctet(jeu, 0xD777B, couleur(0x30, 0, 0));
  ecrireOctet(jeu, 0xD7779, couleur(0x2F, 0x3F, 0x3F));
  ecrireOctet(jeu, 0xD7778, couleur(0x19, 0x2C, 0x3F));
  ecrireOctet(jeu, 0xD7777, couleur(0x10, 0x1F, 0x36));
  ecrireOctet(jeu, 0xD7781, couleur(0x3F, 0x3F, 0x26));
  ecrireOctet(jeu, 0xD7780, couleur(0x3F, 0x33, 0x1F));
  ecrireOctet(jeu, 0xD7770, couleur(0x38, 0x20, 0xF));
  ecrireOctet(jeu, 0xD776B, couleur(0x3F, 0x30, 0));
  ecrireOctet(jeu, 0xD776F, couleur(0x19, 0x19, 0x1E));
  ecrireOctet(jeu, 0xD7769, couleur(0x3F, 0x3F, 0x22));
  ecrireOctet(jeu, 0xD776E, couleur(0x15, 0x15, 0x15));
  ecrireOctet(jeu, 0xD776A, couleur(0x10, 0x28, 9));
  ecrireOctet(jeu, 0xD776D, couleur(0x12, 0x22, 0x3A));
  ecrireOctet(jeu, 0xD776C, couleur(0x2A, 0x3E, 0x3F));

  ecrireOctet(jeu, 0xD77A3, 0);
  ecrireMot(jeu, 0xBECB0, 0xA);
  ecrireMot(jeu, VITESSE, 0);
  ecrireOctet(jeu, 0xD775B, 1);
  ecrireOctet(jeu, 0xD7763, 1);
  ecrireOctet(jeu, BARRE_D_OUTILS, 2);
  jeu.appeler(0x4DFAC);
  ecrireMot(jeu, 0xD661C, 0xFFFF);
  ecrireMot(jeu, 0xBECBC, 0);
  ecrireMot(jeu, VITESSE, 0);
  jeu.appeler(0x10D42, mot(jeu, MODE_AFFICHAGE));

  ecrireLong(jeu, FIN_DES_OBJETS, finDeLaTable(jeu, long(jeu, OBJETS)));   // + 0x3A8B8 en 1994
  ecrireMot(jeu, 0xD666C, 1);
  for (let k = 0; k < 5; k++) ecrireOctet(jeu, 0xD6BD7 + 0x24F * k, 2);   // les catalogues repliés

  ecrireLong(jeu, PAS_DE_SIMULATION, 1);
  ecrireLong(jeu, PASSAGES, 1);
  ecrireMot(jeu, SORTIR, 0);
  ecrireMot(jeu, REDESSINER_CARTE, 1);
  ecrireOctet(jeu, 0xD77A2, 0);
  ecrireMot(jeu, 0xD6638, mot(jeu, long(jeu, 0xD3B38) + 0x1A0));

  jeu.appeler(0x19EEE);
  jeu.appeler(0x4790C, 0x168, 0xD2BB0);
  if (mot(jeu, EMPLACEMENT_A_CHARGER) !== 0) {
    jeu.appeler(0x2E035, s8(octet(jeu, EMPLACEMENT_A_CHARGER) - 1));
  }
  jeu.appeler(0x51094);
  jeu.appeler(0x50366);
  ecrireMot(jeu, ORIGINE_X, -((mot(jeu, LARGEUR_TUILE) * 3 / 4) | 0));
  ecrireOctet(jeu, 0xD778D, 1);
  ecrireOctet(jeu, GENRE_DE_PARTIE, 2);
}

// =====================================================================================================

// 0x104A3 — mettre le programme en place : les images, les textes, le mode vidéo, le son, la souris.
export function preparerLeProgramme(jeu) {
  let bon = true;
  ecrireOctet(jeu, 0xD7764, 0);
  ecrireMot(jeu, MODE_AFFICHAGE, 1);
  jeu.appeler(0x11921);
  if (jeu.appeler(ECHEC_DU_CHARGEMENT, 0xB0B6C) !== 0) bon = false;   // data/mspr-0.inf
  if (jeu.appeler(ECHEC_DU_CHARGEMENT, 0xB11E7) !== 0) bon = false;   // *GLASS
  jeu.appeler(0x1095C);

  // La haute résolution : si « *WB_SCREEN » répond, les noms d'images passent en `h` et l'on essaie de
  // les charger. Chargés, le mode 9 est retenu et l'on demande « *VESA » ; sinon « *WB_SCREEN » est
  // rendu et l'on repart en basse résolution.
  if (jeu.appeler(DEMANDER_UNE_RESSOURCE, 0xB10FA) === 1) {
    for (let k = 0; long(jeu, 0xB13FF + 0x4F * k) !== 0; k++) poserLaLettre(jeu, k, 0x68);
    if (jeu.appeler(ECHEC_DU_CHARGEMENT, 0xB13C1) !== 0) {
      jeu.appeler(RENDRE_UNE_RESSOURCE, 0xB10FA);
    } else {
      ecrireOctet(jeu, 0xD7795, 9);
      jeu.appeler(DEMANDER_UNE_RESSOURCE, 0xB1149);
    }
  }

  // À défaut, la basse résolution : une image de 320x400, et les noms en `m`.
  if ((octet(jeu, 0xD7795) & 8) === 0) {
    ecrireOctet(jeu, 0xD7795, 1);
    ecrireLong(jeu, 0xB1140, 0x1F400);
    for (let k = 0; long(jeu, 0xB13FF + 0x4F * k) !== 0; k++) poserLaLettre(jeu, k, 0x6D);
    if (!(jeu.appeler(DEMANDER_UNE_RESSOURCE, 0xB10FA) === 1
        && jeu.appeler(ECHEC_DU_CHARGEMENT, 0xB13C1) === 0)) {
      jeu.appeler(0x10977);
      if (jeu.appeler(DEMANDER_UNE_RESSOURCE, 0xB10FA) === 1
          && jeu.appeler(ECHEC_DU_CHARGEMENT, 0xB13C1) === 0) {
        jeu.appeler(0x1095C);
      } else {
        jeu.appeler(MESSAGE_D_ERREUR, 0xB0004, 0x1F400);   // failed to allocate lowres %d screen
        bon = false;
      }
    }
  }

  if (jeu.appeler(0x2E20C) === 0) {
    jeu.appeler(MESSAGE_D_ERREUR, 0xB0029);   // failed to allocate memory for language text
    bon = false;
  }

  if (bon) {
    // Le tampon de fond suit l'image dans la même réservation, à la moitié de sa taille.
    ecrireLong(jeu, TAMPON_DE_FOND, (long(jeu, SURFACE) + (long(jeu, 0xB1140) >>> 1)) >>> 0);
    ecrireLong(jeu, 0xD3B94, long(jeu, TAMPON_DE_FOND));
    jeu.appeler(0x1036D);
    jeu.appeler(0x6A658);
    jeu.appeler(0x7E860);
    if ((octet(jeu, 0xBECB2) & 3) === 0) {
      if ((jeu.appeler(0x7DF44) & 0xFFFF) !== 1) {
        jeu.appeler(MESSAGE_D_ERREUR, 0xB0057);   // Mouse Driver Not Found...
      }
    } else {
      // Les options -p et -r : 24 000 octets de gestes enregistrés, relus de RECORD.GAM avec -p.
      ecrireLong(jeu, 0xD3AEC, jeu.appeler(RESERVER, 0x5DC0));
      if ((octet(jeu, 0xBECB2) & 2) !== 0) {
        const poignee = jeu.appeler(OUVRIR, 0xB00C0, 0x200) | 0;
        if (poignee !== -1) {
          jeu.appeler(LIRE, poignee, long(jeu, 0xD3AEC), 0x5DC0);
          jeu.appeler(FERMER, poignee);
        }
      }
    }
    if (long(jeu, 0xBECB4) !== 0) {
      // La palette de départ, puis le pointeur de la souris borné à l'espace logique.
      if (octet(jeu, MODE_AFFICHAGE) & 1) jeu.appeler(0x7EC50, long(jeu, PALETTE_DU_PARC));
      else jeu.appeler(0x7ECF0, long(jeu, PALETTE_DU_PARC));
      jeu.appeler(0x11303, 0, 0x27E, 0, 0x1DE);
      jeu.appeler(0x11191, 0x140, 0xC8);
      ecrireMot(jeu, 0xBEC94, 0x140);
      ecrireMot(jeu, 0xBEC96, 0xC8);
      ecrireMot(jeu, 0xB14E2, 0xFFFF);
      ecrireMot(jeu, 0xB14E4, 0xFFFF);
      jeu.appeler(0x7DDD7, (long(jeu, 0xD3B84) + 6) >>> 0);
      jeu.appeler(0x5CAD0);
    }
  } else {
    ecrireLong(jeu, 0xBECB4, 0);
  }

  if (bon) {
    // La table des objets du parc, la ressource « *THING » : 1 200 enregistrements de 200 octets, puis
    // de moins en moins, par pas de dix ; 4 000 d'abord avec la table agrandie (table-des-objets.js).
    // Si rien ne passe, 0x10977 est appelée, puis on redemande.
    if (reserverLaTableDesObjets(jeu) === 0) {
      jeu.appeler(0x10977);
      if (reserverLaTableDesObjets(jeu) === 0) ecrireLong(jeu, 0xBECB4, 0);
      else jeu.appeler(0x1095C);
    }
  }

  if (s16(jeu.appeler(0x115DB, 0xB87EA)) < 0) ecrireOctet(jeu, 0xB14AE, 0);
}

function reserverLaTableDesObjets(jeu) {
  let n = enregistrementsDemandes();
  while ((n & 0xFFFF) > 0) {
    ecrireLong(jeu, 0xB1369, (n & 0xFFFF) * 0xC8);
    if (jeu.appeler(DEMANDER_UNE_RESSOURCE, 0xB1323) === 1) break;
    n = (n - 0xA) | 0;
  }
  return n & 0xFFFF;
}

// =====================================================================================================

// 0x10010 — le `main` du programme : la ligne de commande, la mise en place, la boucle, la sortie.
//
// Le cadre d'origine, `push ebx/esi/edi` puis `enter 0x14, 0`, est reproduit pour que 0x104A3 et la
// boucle du parc tournent à la hauteur de pile qui était la leur. Cette fonction ne rend jamais la main.
const CADRE_DU_PROGRAMME = 0x24;     // 12 octets de registres, 4 d'ebp, 0x14 de variables

export function programmePrincipal(jeu, nombre, listeDesArguments) {
  const entree = jeu.T.lireRegistre('esp') >>> 0;
  const cadre = (entree - CADRE_DU_PROGRAMME) >>> 0;
  const depuis = (retour, adresse, ...args) => jeu.appelerDepuis(retour, cadre, adresse, ...args);

  for (let k = 1; (k & 0xFFFF) < (nombre & 0xFFFF); k++) {
    let p = long(jeu, (listeDesArguments + 4 * (k & 0xFFFF)) >>> 0);
    if (octet(jeu, p) !== 0x2D && octet(jeu, p) !== 0x2F) continue;   // ni '-' ni '/'
    p = (p + 1) >>> 0;
    let argumentFini = false;
    while (!argumentFini) {
      const lettre = octet(jeu, p);
      p = (p + 1) >>> 0;                      // p montre maintenant le reste de l'argument
      if (lettre === 0) break;
      switch (lettre) {
        case 0x43: case 0x63:                 // -c : le dossier du CD
          ecrireOctet(jeu, 0xB0B69, 0);
          depuis(0x10278, STRCPY, DOSSIER_DU_CD, p);
          argumentFini = true;
          break;
        case 0x44: case 0x64:                 // -d : le dossier de l'installation
          ecrireOctet(jeu, 0xB0B69, 0);
          depuis(0x102AD, STRCPY, DOSSIER_DU_JEU, p);
          argumentFini = true;
          break;
        case 0x45: case 0x65: ecrireMot(jeu, 0xD6680, 1); break;              // -e
        case 0x4C: case 0x6C: choisirLaLangue(jeu, depuis, p); break;         // -l
        case 0x4D: case 0x6D:                                                 // -m : le réseau
          ecrireOctet(jeu, JOUEURS_EN_RESEAU, depuis(0x102DF, ATOI, p));
          if (octet(jeu, JOUEURS_EN_RESEAU) > 1 && (depuis(0x102F5, 0x493BE) & 0xFFFF) !== 0) {
            ecrireOctet(jeu, JOUEURS_EN_RESEAU, 1);
          }
          break;
        case 0x4E: case 0x6E:                                                 // -n : l'emplacement
          ecrireMot(jeu, EMPLACEMENT_A_CHARGER, depuis(0x10289, ATOI, p));
          break;
        case 0x4F: case 0x6F: ecrireOctet(jeu, 0xBA722, 0); break;            // -o
        case 0x50: case 0x70: ecrireOctet(jeu, 0xBECB2, 2); break;            // -p
        case 0x52: case 0x72: ecrireOctet(jeu, 0xBECB2, 1); break;            // -r
        case 0x73: ecrireOctet(jeu, 0xBA720, 0); break;                       // -s
        case 0x53: ecrireOctet(jeu, 0xBA720, 0); ecrireOctet(jeu, 0xBA714, 0); break;  // -S
        default: break;
      }
    }
  }

  depuis(0x10319, PREPARER_LE_PROGRAMME);
  if (octet(jeu, 0xB0B68) !== 0) ecrireMot(jeu, 0xDE5F4, octet(jeu, 0xB0B68));
  if (long(jeu, 0xBECB4) !== 0) depuis(0x1033E, BOUCLE_DU_PARC);
  if (octet(jeu, JOUEURS_EN_RESEAU) !== 0) depuis(0x1034C, 0x49B20);
  depuis(0x10351, 0x108B1);
  depuis(0x10356, 0x10C2F);
  sortir(jeu, octet(jeu, 0xB1512) !== 0 ? 0xA : 0);
}

// L'option -l : la lettre est mise en majuscule dans l'argument lui-même, puis cherchée dans les deux
// positions de chaque code de la table 0xB7E17. Introuvable, la langue revient à 0.
function choisirLaLangue(jeu, depuis, p) {
  ecrireOctet(jeu, p, depuis(0x101C6, MAJUSCULE, octet(jeu, p)));
  ecrireOctet(jeu, LANGUE, 0);
  for (;;) {
    const code = long(jeu, LANGUES + 4 * octet(jeu, LANGUE));
    if (code === 0) break;
    if (octet(jeu, code) === octet(jeu, p) || octet(jeu, code + 1) === octet(jeu, p)) break;
    ecrireOctet(jeu, LANGUE, octet(jeu, LANGUE) + 1);
  }
  if (long(jeu, LANGUES + 4 * octet(jeu, LANGUE)) === 0) ecrireOctet(jeu, LANGUE, 0);
}

// Le retour au DOS : les quatre vecteurs de nettoyage du démarrage C, puis 0x87307 et le service 0x4C.
// Aucun scénario ne l'exerce.
function sortir(jeu, code) {
  jeu.appeler(long(jeu, 0xBECC0));
  jeu.appeler(long(jeu, 0xBECC4));
  jeu.appeler(long(jeu, 0xBECC4));
  jeu.appeler(long(jeu, 0xBECC8));
  jeu.appeler(0x87307, code);
  jeu.T.ecrireRegistres({ eax: 0x4C00 | (code & 0xFF) });
  jeu.machine.interruption(0x21);
}

// =====================================================================================================

// 0x1A836 — l'écran titre et le menu principal. Sa propre boucle : elle ne rend la main qu'une fois
// l'écran 0x50 quitté, soit par une commande du menu, soit parce que la démonstration démarre.
//
// Le cadre d'origine : `push ebx`, `push esi`, `push edi`, puis `enter 0x64, 0`. La réécriture le
// reproduit — la valeur d'`ebp` et la hauteur de pile des appels —, car la liste à choix 0x576FE relit
// comme sa variable [ebp-0x14] l'octet bas de l'`ebp` que 0x3F49E a sauvé sous son point d'entrée
// (fenetres.js, 0x3F49E) : sans le même cadre, la ligne montrée comme choisie changerait.
const CADRE_DE_L_ECRAN_TITRE = 0x74;      // 12 octets de registres, 4 d'ebp, 0x64 de variables
const RETOUR_DU_TEXTE = 0x1AA96;          // le retour de l'appel de 0x3F49E dans 0x1A836

export function ecranTitre(jeu) {
  const entree = jeu.T.lireRegistre('esp') >>> 0;
  const cadre = (entree - CADRE_DE_L_ECRAN_TITRE) >>> 0;
  const nom = (entree - 0x5C) >>> 0;        // [ebp-0x4C] : le nom qu'on tape
  const chemin = (entree - 0x3C) >>> 0;     // [ebp-0x2C] : le nom du fichier de la partie en cours
  const ebpAvant = jeu.T.lireRegistre('ebp') | 0;
  jeu.T.ecrireRegistres({ ebp: (entree - 16) | 0 });
  const depuis = (retour, adresse, ...args) => jeu.appelerDepuis(retour, cadre, adresse, ...args);

  depuis(0x1A842, 0x80990);
  depuis(0x1A847, 0x80DC0);
  ecrireMot(jeu, REDESSINER_CARTE, 1);
  ecrireLong(jeu, 0xD380C, 0xFF);
  ecrireOctet(jeu, 0xD777F, 1);
  depuis(0x1A86C, POSER_LA_PALETTE, long(jeu, PALETTE_DU_PARC));
  ecrireMot(jeu, OUTIL, 0);
  depuis(0x1A889, 0x1146E, 0x140, 0xC8);
  depuis(0x1A89A, CURSEUR, (long(jeu, 0xD3B84) + 6) >>> 0);
  ecrireMot(jeu, ECRAN, 0x50);
  ecrireOctet(jeu, 0xD7771, 0);
  depuis(0x1A8B2, OUVRIR_ECRAN_PLEIN);
  ecrireOctet(jeu, nom, 0);

  let etat = 'recommencer';
  while (etat === 'recommencer') {
    etat = 'boucle';
    // Y a-t-il une partie à reprendre ? Au-delà de vingt pas de simulation, oui d'office ; sinon on
    // regarde si le fichier existe. 0 : aucune, 1 : commencée, 2 : un fichier l'attend.
    depuis(0x1A8D1, SPRINTF, chemin, 0xB00E2, DOSSIER_DU_JEU, NOM_DU_JOUEUR);
    let partie;
    if (long(jeu, PAS_DE_SIMULATION) > 0x14) {
      partie = 1;
    } else {
      const poignee = depuis(0x1A8F4, OUVRIR, chemin, 0x202) | 0;
      if (poignee >= 0) { partie = 2; depuis(0x1A910, FERMER, poignee); } else partie = 0;
    }
    depuis(0x1A921, 0x1171F);

    while (mot(jeu, ECRAN) === 0x50) {
      let ligne = 0xFF;
      depuis(0x1A938, ENTREES_DE_L_IMAGE);
      if (octet(jeu, 0xD7771) === 0) {
        // Le fond de l'écran titre, chargé une fois puis gardé dans le tampon de fond.
        depuis(0x1A952, CHARGER_UN_FICHIER, 0xB800A, long(jeu, SURFACE));
        depuis(0x1A96C, 0x55EFA, long(jeu, SURFACE), long(jeu, TAMPON_DE_FOND), 0x190);
        ecrireOctet(jeu, 0xD7771, 1);
      }
      if (octet(jeu, MODE_AFFICHAGE) & 1) {
        depuis(0x1A996, RECOPIER_LIGNES_320, long(jeu, TAMPON_DE_FOND), long(jeu, SURFACE), 0xC8);
      } else {
        depuis(0x1A9B5, RESTAURER_PAR_BLOCS, long(jeu, TAMPON_DE_FOND), long(jeu, SURFACE));
      }

      // Les six lignes du menu. La ligne survolée passe en couleur 0xF2, les autres en 0xE6 ;
      // « continuer la partie » est grisée (0xDC) s'il n'y en a pas. Rien n'est survolé tant que le
      // joueur n'a pas de nom.
      let y = 0xAA;
      for (let k = 1; k < 7; k++) {
        const survolee = motSigne(jeu, SOURIS_Y) >= y
          && motSigne(jeu, SOURIS_Y) < y + octet(jeu, HAUTEUR_DE_LIGNE) + 6
          && octet(jeu, NOM_DU_JOUEUR) !== 0;
        if (survolee && k !== s8(ligne)) ligne = k;
        let couleur = k === s8(ligne) ? 0xF2 : 0xE6;
        if (k === 3 && partie === 0) couleur = 0xDC;
        depuis(RETOUR_DU_TEXTE, ECRIRE_TEXTE, 0xB4, s16(y),
          long(jeu, long(jeu, TEXTES_DU_TITRE) + 4 * k), 0, couleur);
        y += octet(jeu, HAUTEUR_DE_LIGNE) + 6;
      }

      // Pas encore de nom : on en demande un, et l'on reprend tout dès qu'il est validé. Les espaces
      // et les tabulations sont sautés, et le nom tenu à huit caractères.
      let valide = false;
      if (octet(jeu, NOM_DU_JOUEUR) === 0) {
        if ((depuis(0x1AABF, TAPER_UN_NOM, long(jeu, long(jeu, MESSAGES) + 0x18C), nom) & 0xFFFF) === 1) {
          let j = 0;
          for (let i = 0; j < 8 && octet(jeu, nom + i) !== 0; i++) {
            const c = octet(jeu, nom + i);
            if (c === 0x20 || c === 9) continue;
            ecrireOctet(jeu, NOM_DU_JOUEUR + j, c);
            j++;
          }
          ecrireOctet(jeu, NOM_DU_JOUEUR + j, 0);
          depuis(0x1AB32, VERIFIER_LE_CODE);
          valide = true;
        }
      }
      if (valide) { etat = 'recommencer'; break; }

      // Le menu : un clic ou Entrée prennent la ligne survolée, F1 à F6 la ligne qu'elles nomment.
      let tranche = false;
      if (mot(jeu, GAUCHE_MAINTENU) !== 0 || octet(jeu, TOUCHE_DE_L_IMAGE) === 0x1C) {
        tranche = commandeDuMenu(jeu, depuis, (ligne - 1) & 0xFF, partie, true);
      } else if (((octet(jeu, TOUCHE_DE_L_IMAGE) - 0x3B) & 0xFF) <= 5) {
        tranche = commandeDuMenu(jeu, depuis, (octet(jeu, TOUCHE_DE_L_IMAGE) - 0x3B) & 0xFF, partie, false);
      }
      if (tranche) { etat = 'rendu'; break; }

      depuis(0x1AEC5, FONDU);
      presenterLEcranTitre(jeu, depuis);
    }
    // L'écran a changé sans qu'aucune commande ne tranche : la démonstration démarre.
    if (etat === 'boucle') depuis(0x1AF7E, FERMER_ECRAN_PLEIN);
  }
  jeu.T.ecrireRegistres({ ebp: ebpAvant });
}

// Les six commandes du menu principal. Rend `true` quand l'écran titre doit rendre la main.
//
// Le jeu en a deux copies, celle de la souris et celle du clavier, aux mêmes effets près d'un seul
// point, reproduit ici : « continuer la partie » sur une partie commencée mais sans fichier ne ferme
// l'écran plein (0x40D79) que par la touche F3, pas par le clic.
function commandeDuMenu(jeu, depuis, commande, partie, parLaSouris) {
  const r = parLaSouris
    ? { son: 0x1AB96, liste: 0x1ABA5, joueur: 0x1ABB2, monde: 0x1ABBA, fermer1: 0x1ABD9,
        son2: 0x1ABFA, charger: 0x1AC05, fermer2: 0x1AC21, son3: 0x1AC39, relire: 0x1AC4E,
        fermer3: 0x1AC6D, intro: 0x1AC9F, credits: 0x1ACCD, son6: 0x1ACE0 }
    : { son: 0x1AD4F, liste: 0x1AD5E, joueur: 0x1AD6B, monde: 0x1AD73, fermer1: 0x1AD92,
        son2: 0x1ADB3, charger: 0x1ADBE, fermer2: 0x1ADDA, son3: 0x1ADF2, relire: 0x1AE07,
        fermer3: 0x1AE26, intro: 0x1AE5D, credits: 0x1AE8B, son6: 0x1AE9E };
  switch (commande) {
    case 0:            // F1 : un nouveau propriétaire
      depuis(r.son, BRUITAGE, 0, 1);
      ecrireOctet(jeu, 0xD7771, 0);
      depuis(r.liste, LISTE_A_CHOIX);
      depuis(r.joueur, 0x1A2CA, mot(jeu, JOUEUR));
      if (s8(depuis(r.monde, CARTE_DU_MONDE)) !== -1) {
        ecrireMot(jeu, ECRAN, 0);
        ecrireMot(jeu, REDESSINER_CARTE, 1);
        depuis(r.fermer1, FERMER_ECRAN_PLEIN);
        return true;
      }
      ecrireMot(jeu, ECRAN, 0x50);
      return false;
    case 1:            // F2 : charger une partie
      depuis(r.son2, BRUITAGE, 0, 1);
      if ((depuis(r.charger, CHOISIR_UNE_PARTIE, 0) & 0xFF) !== 0) {
        ecrireOctet(jeu, 0xD7771, 0);
        ecrireMot(jeu, ECRAN, 0);
        depuis(r.fermer2, FERMER_ECRAN_PLEIN);
        return true;
      }
      return false;
    case 2:            // F3 : continuer la partie
      depuis(r.son3, BRUITAGE, 0, 1);
      if (partie === 2) {
        if ((depuis(r.relire, 0x2E035, -1) & 0xFFFF) !== 0) {
          ecrireMot(jeu, ECRAN, 0);
          ecrireMot(jeu, REDESSINER_CARTE, 1);
          depuis(r.fermer3, FERMER_ECRAN_PLEIN);
          return true;
        }
      } else if (partie === 1) {
        ecrireMot(jeu, ECRAN, 0);
        ecrireMot(jeu, REDESSINER_CARTE, 1);
        if (!parLaSouris) depuis(0x1AE4B, FERMER_ECRAN_PLEIN);
        return true;
      }
      return false;
    case 3:            // F4 : revoir l'introduction
      if (s16(depuis(r.intro, 0x115DB, 0xB8049)) > -1) {
        ecrireMot(jeu, SORTIR, 1);
        ecrireOctet(jeu, 0xB1512, 1);
        return true;
      }
      return false;
    case 4:            // F5 : les remerciements
      depuis(r.credits, 0x1B513, (long(jeu, TEXTES_DU_TITRE) + 0x1C) >>> 0);
      return false;
    case 5:            // F6 : retour au DOS
      depuis(r.son6, BRUITAGE, 0, 1);
      ecrireOctet(jeu, EVENEMENT + 6 * mot(jeu, JOUEUR) + 1, 0x2A);
      ecrireMot(jeu, SORTIR, 1);
      return true;
    default:
      return false;
  }
}

// L'image de l'écran titre, envoyée telle quelle à la mémoire vidéo : en une fois en 320x200, en cinq
// banques VESA en 640x480.
function presenterLEcranTitre(jeu, depuis) {
  if (octet(jeu, MODE_AFFICHAGE) & 1) {
    depuis(0x1AED3, POSER_LE_CURSEUR);
    const source = long(jeu, SURFACE);
    jeu.m8.copyWithin(0xA0000, source, source + 0x3E80 * 4);
    depuis(0x1AEEA, RENDRE_LE_CURSEUR);
    return;
  }
  depuis(0x1AEF4, POSER_LE_CURSEUR);
  const retours = [0x1AEFC, 0x1AF1A, 0x1AF32, 0x1AF4A, 0x1AF62];
  const mots = [0x4000, 0x4000, 0x4000, 0x4000, 0x2C00];
  let source = long(jeu, SURFACE);
  for (let banque = 0; banque < 5; banque++) {
    depuis(retours[banque], BANQUE_VESA, banque);
    jeu.m8.copyWithin(0xA0000, source, source + mots[banque] * 4);
    source = (source + mots[banque] * 4) >>> 0;
  }
  depuis(0x1AF74, RENDRE_LE_CURSEUR);
}

// =====================================================================================================

// `memoire: 'entiere'` pour tout ce qui touche au tas : la carte, les objets du parc, les fiches des
// joueurs, les tables de textes réservées. 0x2CCF8 est appelée à chaque image et ne fait presque jamais
// rien : elle ne demande la mémoire entière que lorsqu'une des quatre cases porte une demande.
const FIN_DE_LA_PILE = 0xE2340;          // PILE_HAUT de index.js
const toutLeTas = (jeu) => [[FIN_DE_LA_PILE, jeu.machine.tasLibre]];
const uneDemandeEstPosee = (jeu) => {
  for (let k = 0; k < CASES_D_EVENEMENT; k++) if (type(jeu, k) !== 0) return true;
  return octet(jeu, JOUEURS_EN_RESEAU) > 1;
};

export const reecritures = [
  { adresse: 0x2CCF8, nom: 'appliquerLesEvenements', fn: (jeu) => appliquerLesEvenements(jeu), arguments: 0,
    zones: (jeu) => (uneDemandeEstPosee(jeu) ? toutLeTas(jeu) : []) },
  { adresse: 0x2DF12, nom: 'sauverLaPartie', fn: sauverLaPartie, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x2E035, nom: 'chargerLaPartie', fn: chargerLaPartie, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x2E20C, nom: 'chargerLesTextes', fn: (jeu) => chargerLesTextes(jeu), arguments: 0, retour: true,
    memoire: 'entiere' },
  { adresse: 0x19EEE, nom: 'nouvellePartie', fn: (jeu) => nouvellePartie(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x1A2CA, nom: 'poserLeJoueurCourant', fn: poserLeJoueurCourant, arguments: 1, memoire: 'entiere' },
  { adresse: 0x104A3, nom: 'preparerLeProgramme', fn: (jeu) => preparerLeProgramme(jeu), arguments: 0,
    memoire: 'entiere' },
  { adresse: 0x12452, nom: 'entrerDansLeParc', fn: (jeu) => entrerDansLeParc(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x10D42, nom: 'changerDeResolution', fn: changerDeResolution, arguments: 1, memoire: 'entiere' },
  { adresse: 0x1A836, nom: 'ecranTitre', fn: (jeu) => ecranTitre(jeu), arguments: 0, memoire: 'entiere' },
  { adresse: 0x10010, nom: 'programmePrincipal', fn: programmePrincipal, arguments: 2, memoire: 'entiere' },
];

export const enAttente = [];
