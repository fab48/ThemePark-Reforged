// Le gestionnaire de souris du jeu et le pilote qu'il commande.
//
// Réécriture lisible des fonctions 0x7D7E2, 0x7CFC6, 0x7D4F9, 0x11303, 0x11191, 0x10992, 0x1142A
// et 0x118FE du jeu d'origine. Chaque constante vient du programme de 1994 ; `moteur/node/comparer.mjs`
// et `moteur/node/verifier.mjs` prouvent que le comportement est identique (voir en fin de fichier).
//
// =================================================================================================
// CE QUE LE JEU FAIT DE LA SOURIS
// =================================================================================================
//
// Une souris de PC ne connaît que des déplacements. Le pilote (interruption 0x33) en tient un
// pointeur, borné à une plage que le programme lui donne (fonctions 7 et 8, ici 0x11303) et qu'il
// peut replacer où il veut (fonction 4, ici 0x11191). Le jeu ne se contente pas de recopier ce
// pointeur : il tient **son propre** curseur, en 0xBECAC (horizontale) et 0xBECAE (verticale), dans
// un espace logique de 640x400 — 0 à 638 sur 0 à 478 exactement, les deux bornes du gestionnaire.
//
// Le pilote appelle 0x7D7E2 à chaque événement (fonction 0x0C : le jeu lui a donné cette routine et
// un masque). Ce n'est pas un appel ordinaire : les paramètres arrivent dans les registres —
// eax le masque de l'événement, ebx l'état des boutons, ecx et edx la position du pointeur, esi et
// edi les « mickeys », que le jeu ignore — et la routine se termine par un retour lointain.
// L'hôte l'appelle de la même façon (`Machine.appelerGestionnaire`, genre `retf`), d'où le
// `convention: 'registres'` et le `nettoie: 4` (les 8 octets que le `retf` dépile) de la réécriture.
//
// Les bits du masque : 1 déplacement, 2 appui gauche, 4 relâchement gauche, 8 appui droit,
// 0x10 relâchement droit, 0x20 appui du bouton du milieu, 0x40 son relâchement.
//
// --- Les trois façons de suivre la souris ---------------------------------------------------------
//
// 1. **Par écarts, en 320x200.** Le gestionnaire ajoute à son curseur l'écart entre la position
//    reçue du pilote et la précédente (0xBEC94, 0xBEC96), puis borne le tout. C'est la voie normale
//    en basse résolution, où le pilote est borné à 0–638 × 0–398.
//
// 2. **Par position, en 640x480.** Le pilote y est borné huit fois plus finement (0–5104 × 0–3824) :
//    le gestionnaire divise par 8 la position reçue et la pose telle quelle. Mais cette pose a lieu
//    **avant** le reste du travail, et quand un outil est choisi la voie 1 s'y ajoute : c'est le
//    double comptage décrit plus bas.
//
// 3. **Projetée sur les axes de la carte**, pendant le tracé d'un chemin : un outil de tracé est
//    choisi, le pointeur est sur la vue du parc (0xB14C2 = 4) et le bouton gauche est maintenu.
//    L'écart n'est plus ajouté tel quel : si le mouvement est surtout vertical (|2·dy| > |dx|),
//    seul dy/2 s'ajoute à l'horizontale, sinon dx + dy/2 ; dy s'ajoute toujours à la verticale.
//    Les tuiles du parc faisant deux fois plus de large que de haut, cela colle le curseur aux
//    deux diagonales de la grille — on trace droit sans viser juste. La position obtenue est rangée
//    en 0xB14E2/0xB14E4, et la boucle du parc (0x11C45) y replace le pointeur du pilote par 0x11191.
//
// --- Le double comptage en 640x480 (défaut d'origine, reproduit ici) -------------------------------
//
// En 640x480, 0x7D7E2 commence par poser `curseur = pilote / 8`. Puis, si l'outil en cours est l'un
// de ceux qui mènent à la branche des outils (1 à 4, 10 ou 16), il **ajoute encore** l'écart
// `pilote/8 − précédent`. Le curseur va donc à `pilote + écart` : il parcourt le double de la
// distance. Avec les petits pas rapprochés d'une vraie souris, cela ne se voit guère ; avec un grand
// pas, le curseur part au double. Pendant un tracé (voie 3), le même parcours ajoute deux fois
// l'écart vertical : le curseur descend deux fois plus vite que la main. L'hôte découpe pour cette
// raison les mouvements du navigateur en petits pas (docs/journal-des-essais.md § 5.5).
//
// Le défaut se mesure : en 640x480 avec un outil en main, viser un point en boucle fermée ne
// converge pas. Déplacer le pointeur de l'écart qui reste déplace le curseur du double, et l'erreur
// change de signe sans diminuer — c'est ce que signale le compositeur de scénarios quand on lui
// demande de tracer un chemin en haute résolution.
//
// --- Ce que le jeu fait du pointeur du pilote -----------------------------------------------------
//
// Le gestionnaire remet 0xB14E2/0xB14E4 à 0xFFFF (« rien à poser ») au début de chaque événement, et
// n'y écrit une position que dans les deux cas où il a décidé lui-même où doit être le curseur :
// la projection sur les axes (voie 3) et le saut au coin de la case à l'appui du bouton gauche.
// La boucle du parc lit ces deux mots et, s'ils ne valent pas 0xFFFF, appelle 0x11191 : le pointeur
// du pilote rejoint le curseur du jeu, et l'écart suivant repart de là. Le jeu replace aussi le
// pointeur au centre, 0x11191(320, 200), chaque fois qu'il change la plage du pilote : au passage
// d'un mode à l'autre (touche R, 0x13BF3) et à l'ouverture comme à la fermeture d'un écran plein
// (0x5C04F, 0x5B88D, 0x5BBC6).
//
// --- Le curseur à l'écran -------------------------------------------------------------------------
//
// Le pointeur est un curseur logiciel, dessiné deux fois de deux façons :
//  - par 0x7D775, dans la surface de dessin, juste avant chaque présentation d'image
//    (moteur/jeu/presentation.js) ; il lève alors 0xBECA4 ;
//  - par le gestionnaire lui-même, **directement dans la fenêtre vidéo** (0x7D4F9 efface, 0x7CFC6
//    retrace), tant que 0xBECA4 est baissé. C'est ce qui rend le pointeur fluide entre deux images :
//    il suit la souris à la cadence des interruptions, pas à celle du jeu.
// Les deux tracés gardent les pixels recouverts dans un tampon (0xDE554 pour le tracé direct) et les
// remettent avant de se déplacer. En 640x480, la fenêtre vidéo ne montre que 64 Ko : le tracé direct
// change de banque en chemin (0x7E6BC) et remet ensuite celle qui était montrée (0xDE596).
//
// --- Le relevé de la souris, 0x10992 --------------------------------------------------------------
//
// C'est l'autre voie, celle des options d'enregistrement et de relecture (`-r` et `-p`, l'octet
// 0xBECB2, lu par 0x1107F) : au lieu d'attendre les événements du pilote, on l'interroge (fonction 3)
// et l'on recopie chaque image dans un tampon de 6 octets, ou l'on relit ce tampon au lieu du pilote.
// En jeu normal (0xBECB2 nul) 0x1107F ne l'appelle pas : les scénarios de vérification ne l'exercent
// donc jamais, et elle reste en attente.
//
// =================================================================================================

import { ADRESSES } from './etat.js';
import { ecran } from './grande-vue.js';
import { reglages } from './reglages.js';

// --- Lecture et écriture de la mémoire du jeu ------------------------------------------------------
const s16 = (v) => (v << 16) >> 16;
const octet = (jeu, a) => jeu.m8[a];
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// --- Le curseur du jeu ----------------------------------------------------------------------------
const CURSEUR_X = ADRESSES.sourisX;        // 0xBECAC — mot, 0 à 638
const CURSEUR_Y = ADRESSES.sourisY;        // 0xBECAE — mot, 0 à 478
// 638 et 478 : deux de moins que la largeur et la hauteur de l'écran, `ecran` (grande-vue.js), qui
// valent 640 et 480 hors de la grande vue.
const curseurXMax = () => ecran.largeur - 2;   // 0x27E
const curseurYMax = () => ecran.hauteur - 2;   // 0x1DE
const PRECEDENT_X = 0xBEC94, PRECEDENT_Y = 0xBEC96;  // mots : l'origine des écarts
const CLIC_X = 0xBECA8, CLIC_Y = 0xBECAA;  // mots : où était le curseur au premier appui d'un bouton

// L'octet 0xBECB3, posé à 1 par le gestionnaire, n'est relu nulle part dans le programme : la
// réécriture le pose quand même, c'est de la mémoire comparée.
const SOURIS_VUE = 0xBECB3;
const REENTRANCE = 0xBEC98;                // mot long : 1 pendant le traitement d'un événement
const CURSEUR_AFFICHE = 0xBECB4;           // mot long : 0 tant que le curseur n'est pas armé
const DELAI_DU_DOUBLE_CLIC = 0xBECB0;      // mot : 10 images (posé par 0x12452)
const TRACE_DIRECT_SUSPENDU = 0xBECA4;     // mot long : levé par 0x7D775, tant que le curseur est
                                           // dessiné dans la surface (presentation.js)
const MASQUE_RECU = 0xDE57C;               // mot long : le masque de l'événement en cours

// Les boutons. Pour chacun, deux mots : « maintenu », que le gestionnaire tient à jour, et
// « appui », qu'il lève et qu'il revient à celui qui le traite de remettre à zéro.
const GAUCHE_ENFONCE = 0xDE5AC, APPUI_GAUCHE = 0xDE5A6;
const DROIT_ENFONCE = 0xDE5AA, APPUI_DROIT = 0xDE5A4;
const MILIEU_ENFONCE = 0xDE5A8, APPUI_MILIEU = 0xDE5A2;
const COMPTE_DU_DOUBLE_CLIC = 0xDE59E;     // mot : décompté par le pas de simulation (economie.js)
const DOUBLE_CLIC_EN_ATTENTE = 0xDE5A0;    // mot : levé ici, remis à 0 par 0x1803C

// Bits du masque d'événement du pilote (le bit 0, le déplacement, ne mène à aucun traitement
// particulier : le gestionnaire recale son curseur à chaque événement, quel qu'il soit).
const APPUI_DU_GAUCHE = 2, RELACHE_DU_GAUCHE = 4;
const APPUI_DU_DROIT = 8, RELACHE_DU_DROIT = 0x10;
const APPUI_DU_MILIEU = 0x20, RELACHE_DU_MILIEU = 0x40;

// --- L'interface du parc --------------------------------------------------------------------------
const MODE_AFFICHAGE = ADRESSES.modeAffichage;   // 0xDE5F6 — 1 = 320x200, 8 = 640x480
const OUTIL = 0xD6670;                     // mot : l'outil en main (interface-parc.js)
const POINTEUR_SUR_LE_PARC = 0xB14C2;      // mot : 4 si le pointeur est sur la vue du parc
const POINTEUR_A_POSER_X = 0xB14E2;        // mots : la position à imposer au pilote ; 0xFFFF = rien
const POINTEUR_A_POSER_Y = 0xB14E4;
const COLONNE_VISEE = 0xD6662, RANGEE_VISEE = 0xD666A;  // la case sous le pointeur, depuis la caméra
const ORIGINE_DESSIN_X = ADRESSES.origineDessinX;       // 0xD6624

// --- Le curseur dessiné directement dans la fenêtre vidéo -----------------------------------------
const MEMOIRE_VIDEO = 0xA0000;
const FIN_DE_LA_FENETRE = 0xB0000;         // au-delà, il faut passer à la banque suivante
const TAILLE_FENETRE = 0x10000;
const TRANSPARENT = 0xFE;                  // la couleur du motif qui laisse voir le fond

const POSE_X = 0xDE54C, POSE_Y = 0xDE54E;  // mots : où le curseur est tracé, en pixels de l'écran
const LARGEUR_TRACEE = 0xDE550;            // mots : ce qui tient encore à l'écran
const HAUTEUR_TRACEE = 0xDE552;
const TAMPON_DU_FOND = 0xDE554;            // mot long : les pixels recouverts, 64x64 au plus
const DECALAGE = 0xDE558;                  // mot long : la pose, en octets depuis le début de l'écran
const POINTEUR_MOTIF = 0xDE56C;            // mots longs : les trois curseurs de la copie
const POINTEUR_ECRAN = 0xDE570;
const POINTEUR_TAMPON = 0xDE574;
const LARGEUR_CURSEUR = 0xDE58C, HAUTEUR_CURSEUR = 0xDE58E;  // mots : la taille du motif
const MOTIF = 0xDE590;                     // mot long : les pixels du curseur
const PAS_DU_MOTIF = 0xDE594;              // mot : octets d'une ligne du motif
const BANQUE_SAUVEE = 0xDE596;             // mot : la banque montrée avant le tracé
const BANQUE_DU_TRACE = 0xDE598;           // mot : la banque où l'on écrit
const BANQUE_MONTREE = 0xBECDC;            // mot : celle que 0x7E6BC a choisie en dernier
const COLONNE_COPIEE = 0xDE59A, LIGNE_COPIEE = 0xDE59C;  // mots : les compteurs des deux boucles
const LIGNE_DE_L_ECRAN = 0xDE5B8;          // mot long : octets par ligne, 320 ou 640
const HAUTEUR_DE_L_ECRAN = 0xDE5C0;        // mot long
const TAILLE_DU_TAMPON = 64 * 64;          // ce que 0x7CFC6 peut au plus sauver

// --- Le pilote de souris --------------------------------------------------------------------------
const INTERRUPTION_SOURIS = 0x33;
const APPEL_D_INTERRUPTION = 0x7F085;      // (n° d'interruption, registres d'entrée, de sortie)
const TAILLE_REGISTRES = 0x1C;             // eax +0, ebx +4, ecx +8, edx +12, esi +16, edi +20,
                                           // retenue +24 — la structure du compilateur Watcom
const LIRE_LA_SOURIS = 3;                  // ebx les boutons, ecx et edx la position
const PLACER_LE_POINTEUR = 4;              // ecx et edx la position voulue
const PLAGE_HORIZONTALE = 7, PLAGE_VERTICALE = 8;   // ecx le minimum, edx le maximum
const REMISE_A_ZERO_MATERIELLE = 0x2F;
// Bornes du pilote : 638 × 398 en basse résolution ; huit fois plus fin en haute, où le jeu
// multiplie par 8 tout ce qu'il lui donne, et 478 × 8 en verticale. (En grande vue, grande-vue.js,
// la largeur et la hauteur de l'écran moins deux.)
const piloteXMax = () => ecran.largeur - 2;      // 0x27E
const PILOTE_Y_MAX_BASSE = 0x18E;
const piloteYMaxHaute = () => ecran.hauteur - 2; // 0x1DE

const MODE_ENTREES = 0xBECB2;              // octet : 0 normal, 1 enregistrement (-r), 2 relecture (-p)
const TAMPON_DES_ENTREES = 0xD3AEC;        // mot long : 6 octets par image, 4 000 images au plus
const IMAGE_ENREGISTREE = 0xD3AF0;         // mot long : l'image en cours
const DERNIERE_IMAGE_ENREGISTREE = 0xF9F;  // 3 999
const TOUCHE_ENREGISTREE = 0xDE688;        // octets : la touche et son code, enregistrés eux aussi
const CODE_ENREGISTRE = 0xDE689;
const IMAGE_DU_CURSEUR = 0xBECB8;          // mot long : l'objet graphique du curseur (posé par 0x116E4)

// L'écran (0xD6652) d'où l'on vient, pour chacun des sept écrans pleins : 0x798D7 y range le sien
// avant d'ouvrir le 0x52, 0x515A0 le 0x4E, et ainsi de suite ; chacun le relit en sortant.
const ECRANS_D_OU_L_ON_VIENT = 0xB9ED8;
const TAILLE_DES_ECRANS_D_OU_L_ON_VIENT = 8;

// --- Les fonctions appelées -----------------------------------------------------------------------
const VALEUR_ABSOLUE = 0x80BF2;
const CHOISIR_BANQUE = 0x7E6BC;            // (banque) : int 10h 4F05h, et note la banque en 0xBECDC
const MARQUER_ZONE_SALE = 0x54D38;         // (x, y, largeur, hauteur) : la grille des blocs
const EFFACER_LE_CURSEUR = 0x7D4F9;
const TRACER_LE_CURSEUR = 0x7CFC6;
const TRACER_IMAGE = 0x5EC9C;              // (x, y, image) — basse résolution
const TRACER_IMAGE_MARQUEE = 0x55BD4;      // (x, y, image) — haute résolution
const REMPLIR = 0x7F1A0;                   // (destination, octet, n) : memset

const basseResolution = (jeu) => (mot(jeu, MODE_AFFICHAGE) & 1) !== 0;
const hauteResolution = (jeu) => (mot(jeu, MODE_AFFICHAGE) & 8) !== 0;

// =================================================================================================
// 0x7D7E2 — LE GESTIONNAIRE DE SOURIS
// =================================================================================================
//
// La routine que le pilote appelle à chaque événement. Elle reçoit le masque dans eax et la position
// du pointeur dans ecx et edx (voir l'en-tête pour la convention d'appel).
export function gestionnaireDeSouris(jeu, R) {
  const masque = R.eax | 0;
  let x = R.ecx | 0;
  let y = R.edx | 0;
  const pilote = [x, y];            // (le tracé à la main, plus bas : la position du pilote, entière)

  // Un événement livré pendant le traitement du précédent est purement ignoré.
  if (long(jeu, REENTRANCE) !== 0) return;
  poserLong(jeu, REENTRANCE, 1);

  // En basse résolution, une position au-delà de 640 est ramenée à 640. Le pilote y étant borné à
  // 638 (0x11303), cela ne se produit pas ; la garde reste dans le programme.
  if (basseResolution(jeu) && x > 0x280) x = 0x280;

  // En haute résolution, le pilote compte huit fois plus fin : la position divisée par 8 devient
  // directement celle du curseur. C'est la première moitié du double comptage.
  if (hauteResolution(jeu)) {
    x >>= 3;
    y >>= 3;
    poserMot(jeu, CURSEUR_X, x);
    poserMot(jeu, CURSEUR_Y, y);
  }

  // Par défaut, le jeu n'a rien à imposer au pilote.
  poserMot(jeu, POINTEUR_A_POSER_X, 0xFFFF);
  poserMot(jeu, POINTEUR_A_POSER_Y, 0xFFFF);

  const dx = s16((x & 0xFFFF) - mot(jeu, PRECEDENT_X));
  const dy = s16((y & 0xFFFF) - mot(jeu, PRECEDENT_Y));

  // Tant que le curseur n'est pas armé, le gestionnaire s'arrête là — et, faute de remettre la
  // garde de réentrance à zéro, il reste bloqué : tout événement suivant ressort aussitôt par le
  // test du début. Défaut d'origine, reproduit. En pratique 0x7DF44 arme le curseur avant que le
  // pilote ne soit branché, et le jeu ne le désarme (0x104A3, 0x7E0E1) qu'en quittant.
  if (long(jeu, CURSEUR_AFFICHE) === 0) return;

  poserOctet(jeu, SOURIS_VUE, 1);
  poserLong(jeu, MASQUE_RECU, masque);

  // Les outils qu'on trace en glissant (1 murs, 2 chemins, 3 barrières de file, 4 rivière,
  // 10 rails, 16 non établi) demandent un curseur qui suit la grille : c'est la branche où le
  // gestionnaire ajoute les écarts, et, pendant un tracé, les projette sur les axes de la carte.
  const outil = mot(jeu, OUTIL);
  const outilDeTrace = (outil >= 1 && outil <= 4) || outil === 0x0A || outil === 0x10;

  if (outilDeTrace && mot(jeu, POINTEUR_SUR_LE_PARC) === 4) {
    if (mot(jeu, GAUCHE_ENFONCE) === 1) {
      if (traceALaMain(jeu)) projeterLaMain(jeu, pilote);
      else projeterSurLesAxes(jeu, dx, dy);
    } else if ((masque & APPUI_DU_GAUCHE) !== 0) {
      collerAuCoinDeLaCase(jeu);
      laMain.resteX = laMain.resteY = 0;
    } else {
      suivreParEcarts(jeu, dx, dy, x, y);
    }
  } else if (outilDeTrace) {
    suivreParEcarts(jeu, dx, dy, x, y);
  } else if (basseResolution(jeu)) {
    // Sans outil, en basse résolution : les écarts, sans borne basse — seul le plafond commun
    // ci-dessous s'applique.
    poserMot(jeu, CURSEUR_X, mot(jeu, CURSEUR_X) + dx);
    poserMot(jeu, CURSEUR_Y, mot(jeu, CURSEUR_Y) + dy);
    poserMot(jeu, PRECEDENT_X, x);
    poserMot(jeu, PRECEDENT_Y, y);
  } else {
    // Sans outil, en haute résolution : la position du pilote, telle quelle. (Elle vient déjà
    // d'être posée plus haut : cette écriture ne change rien, c'est le chemin sans double compte.)
    poserMot(jeu, CURSEUR_X, x);
    poserMot(jeu, CURSEUR_Y, y);
    poserMot(jeu, PRECEDENT_X, x);
    poserMot(jeu, PRECEDENT_Y, y);
  }

  // Le plafond commun à toutes les voies (sans plancher : les branches qui en ont un l'ont déjà posé).
  if (motSigne(jeu, CURSEUR_X) > curseurXMax()) poserMot(jeu, CURSEUR_X, curseurXMax());
  if (motSigne(jeu, CURSEUR_Y) > curseurYMax()) poserMot(jeu, CURSEUR_Y, curseurYMax());

  traiterLesBoutons(jeu, masque);

  // Le tracé direct du curseur, tant que 0x7D775 ne l'a pas suspendu. En 640x480 il a pu changer de
  // banque en chemin : on remet celle qui était montrée.
  if (long(jeu, TRACE_DIRECT_SUSPENDU) === 0) {
    poserMot(jeu, BANQUE_SAUVEE, mot(jeu, BANQUE_MONTREE));
    jeu.appeler(EFFACER_LE_CURSEUR);
    jeu.appeler(TRACER_LE_CURSEUR);
    if (hauteResolution(jeu)) jeu.appeler(CHOISIR_BANQUE, motSigne(jeu, BANQUE_SAUVEE));
  }

  if (traceALaMain(jeu)) [laMain.x, laMain.y] = pilote;
  poserLong(jeu, REENTRANCE, 0);
}

// Voie 1 : le curseur suit les écarts, et le pointeur du pilote reste l'origine des suivants.
// En 640x480, le curseur ayant déjà reçu la position du pilote, c'est ici que l'écart est compté
// une seconde fois. Sauf avec la correction du tracé à la souris (plus bas) : le curseur y garde la
// position du pilote. Les pas de l'hôte grandissant avec l'image (onze pixels par événement en
// grande vue de 1824 de large, machine.js), le curseur, un outil en main, filait d'autant devant la
// main et visait une autre case que celle qu'on voyait sous elle.
function suivreParEcarts(jeu, dx, dy, x, y) {
  if (!traceALaMain(jeu)) {
    poserMot(jeu, CURSEUR_X, mot(jeu, CURSEUR_X) + dx);
    poserMot(jeu, CURSEUR_Y, mot(jeu, CURSEUR_Y) + dy);
  }
  bornerLeCurseur(jeu);
  poserMot(jeu, PRECEDENT_X, x);
  poserMot(jeu, PRECEDENT_Y, y);
}

// Voie 3 : pendant le tracé d'un chemin, l'écart est projeté sur les deux diagonales de la grille.
// Une tuile fait deux fois plus de large que de haut : un mouvement « surtout vertical »
// (|2·dy| > |dx|) ne fait avancer l'horizontale que de dy/2, l'autre de dx + dy/2.
// La position obtenue est celle qu'on imposera au pilote, et c'est elle, non le pointeur, qui sert
// d'origine à l'écart suivant.
function projeterSurLesAxes(jeu, dx, dy) {
  const surtoutVertical = jeu.appeler(VALEUR_ABSOLUE, 2 * dy) > jeu.appeler(VALEUR_ABSOLUE, dx);
  const avance = surtoutVertical ? (dy >> 1) : (dx + (dy >> 1));
  poserMot(jeu, CURSEUR_X, motSigne(jeu, CURSEUR_X) + avance);
  poserMot(jeu, CURSEUR_Y, mot(jeu, CURSEUR_Y) + dy);
  bornerLeCurseur(jeu);
  poserMot(jeu, PRECEDENT_X, mot(jeu, CURSEUR_X));
  poserMot(jeu, PRECEDENT_Y, mot(jeu, CURSEUR_Y));
  poserMot(jeu, POINTEUR_A_POSER_X, mot(jeu, CURSEUR_X));
  poserMot(jeu, POINTEUR_A_POSER_Y, mot(jeu, CURSEUR_Y));
}

// Hors du jeu d'origine, `reglages.corrigerLeTraceALaSouris` (la page l'allume) : le tracé à la main,
// en haute résolution. La voie 3 d'origine part de la position du pilote et y ajoute encore l'écart :
// la route file au double de la main (d'autant plus que les événements sont espacés : plusieurs dans
// une même image s'y compensent en partie), et, la projection n'avançant l'horizontale que de dy >> 1
// par événement, une main lente ne la fait plus avancer du tout sans ce double comptage, et la route
// sort de sa rangée. Ici l'écart est celui de la main : pris sur le pilote, en unités (huit par pixel),
// depuis sa position à l'événement précédent ou là où le jeu l'a replacé (placerLePointeur) ; compté
// une fois, projeté comme dans l'original mais sans arrondi (les fractions de pixel gardées d'un
// événement au suivant), et ajouté à la position précédente du curseur, celle où le jeu recolle le
// pointeur.
const laMain = { x: 0, y: 0, resteX: 0, resteY: 0 };
const traceALaMain = (jeu) => reglages.corrigerLeTraceALaSouris && hauteResolution(jeu);
function projeterLaMain(jeu, [px, py]) {
  const dx = (px - laMain.x) / 8, dy = (py - laMain.y) / 8;
  const ax = laMain.resteX + (Math.abs(2 * dy) > Math.abs(dx) ? dy / 2 : dx + dy / 2), ay = laMain.resteY + dy;
  const ix = Math.trunc(ax), iy = Math.trunc(ay);
  laMain.resteX = ax - ix; laMain.resteY = ay - iy;
  poserMot(jeu, CURSEUR_X, motSigne(jeu, PRECEDENT_X) + ix);
  poserMot(jeu, CURSEUR_Y, motSigne(jeu, PRECEDENT_Y) + iy);
  bornerLeCurseur(jeu);
  poserMot(jeu, PRECEDENT_X, mot(jeu, CURSEUR_X));
  poserMot(jeu, PRECEDENT_Y, mot(jeu, CURSEUR_Y));
  poserMot(jeu, POINTEUR_A_POSER_X, mot(jeu, CURSEUR_X));
  poserMot(jeu, POINTEUR_A_POSER_Y, mot(jeu, CURSEUR_Y));
}

// À l'appui du bouton gauche avec un outil de tracé, sur la vue du parc : le curseur saute au coin
// de la case visée (0xD6662 la colonne, 0xD666A la rangée, depuis la caméra), en 640x400 —
// 48 pixels par colonne, 16 de décalage par rangée, plus l'origine du dessin ; puis 30 pixels vers
// la droite, ou 15 en haute résolution, où tout est ensuite divisé par deux et reculé de 7.
// Le tracé part donc toujours d'un point de la grille, même si l'on a cliqué de travers.
function collerAuCoinDeLaCase(jeu) {
  const colonne = mot(jeu, COLONNE_VISEE);
  const rangee = mot(jeu, RANGEE_VISEE);
  const bord = basseResolution(jeu) ? 0x1E : 0x0F;
  poserMot(jeu, CURSEUR_X, colonne * 0x30 + rangee * 0x10 + mot(jeu, ORIGINE_DESSIN_X) + bord);
  poserMot(jeu, CURSEUR_Y, rangee * 0x20 + 0x10);
  if (hauteResolution(jeu)) {
    poserMot(jeu, CURSEUR_X, (motSigne(jeu, CURSEUR_X) >> 1) - 7);
    poserMot(jeu, CURSEUR_Y, motSigne(jeu, CURSEUR_Y) >> 1);
  }
  bornerLeCurseur(jeu);
  poserMot(jeu, PRECEDENT_X, mot(jeu, CURSEUR_X));
  poserMot(jeu, PRECEDENT_Y, mot(jeu, CURSEUR_Y));
  poserMot(jeu, POINTEUR_A_POSER_X, mot(jeu, CURSEUR_X));
  poserMot(jeu, POINTEUR_A_POSER_Y, mot(jeu, CURSEUR_Y));
}

function bornerLeCurseur(jeu) {
  const x = motSigne(jeu, CURSEUR_X);
  if (x < 0) poserMot(jeu, CURSEUR_X, 0);
  else if (x > curseurXMax()) poserMot(jeu, CURSEUR_X, curseurXMax());
  const y = motSigne(jeu, CURSEUR_Y);
  if (y < 0) poserMot(jeu, CURSEUR_Y, 0);
  else if (y > curseurYMax()) poserMot(jeu, CURSEUR_Y, curseurYMax());
}

// Les boutons. « Maintenu » suit l'état réel ; « appui » est une demande, levée au passage de
// relâché à enfoncé et que celui qui la traite remet à zéro. Le premier appui d'un bouton note
// aussi où était le curseur (0xBECA8, 0xBECAA).
// Le double-clic : au premier appui du bouton gauche on arme un compte à rebours (0xDE59E) à la
// valeur de 0xBECB0, dix, posée une fois pour toutes par 0x12452 ; il est décompté d'une unité par
// pas de simulation (0x12B1F, economie.js), et non par image — le double-clic est donc d'autant
// plus facile que le jeu est lent. Un second appui avant la fin lève 0xDE5A0, que la table des
// zones du parc traite comme un double-clic (0x1803C).
// Hors du jeu d'origine, `reglages.corrigerLeDoubleClicFantome` (la page l'allume) : le compte est
// aussi borné en temps réel, par les tics de la minuterie du jeu (0xB14B5) notés quand on l'arme ;
// les boucles qui arrêtent la simulation (fin d'année, négociations, questions, pause) le figeaient,
// et deux clics à plusieurs secondes d'écart y faisaient un double-clic.
const TICS_MINUTERIE = 0xB14B5;            // mot long : 72,8 par seconde
const TICS_DU_DOUBLE_CLIC = 25;            // 0,34 s, la fenêtre d'origine à la vitesse normale
const doubleClic = { armeA: null };        // (le tic où le compte a été armé ; hors de la mémoire du jeu)
function traiterLesBoutons(jeu, masque) {
  if ((masque & APPUI_DU_GAUCHE) !== 0) {
    if (mot(jeu, GAUCHE_ENFONCE) === 0) {
      const tic = jeu.dv.getInt32(TICS_MINUTERIE, true);
      if (reglages.corrigerLeDoubleClicFantome && motSigne(jeu, COMPTE_DU_DOUBLE_CLIC) > 0
          && (doubleClic.armeA === null || ((tic - doubleClic.armeA) >>> 0) > TICS_DU_DOUBLE_CLIC)) {
        poserMot(jeu, COMPTE_DU_DOUBLE_CLIC, 0);
      }
      if (motSigne(jeu, COMPTE_DU_DOUBLE_CLIC) > 0) poserMot(jeu, DOUBLE_CLIC_EN_ATTENTE, 1);
      else {
        poserMot(jeu, COMPTE_DU_DOUBLE_CLIC, mot(jeu, DELAI_DU_DOUBLE_CLIC));
        doubleClic.armeA = tic;
      }
    }
    if (mot(jeu, GAUCHE_ENFONCE) === 0 && mot(jeu, APPUI_GAUCHE) === 0) {
      poserMot(jeu, APPUI_GAUCHE, 1);
      noterLaPositionDuClic(jeu);
    }
    poserMot(jeu, GAUCHE_ENFONCE, 1);
  }
  if ((masque & RELACHE_DU_GAUCHE) !== 0) poserMot(jeu, GAUCHE_ENFONCE, 0);

  if ((masque & APPUI_DU_DROIT) !== 0) {
    if (mot(jeu, DROIT_ENFONCE) === 0 && mot(jeu, APPUI_DROIT) === 0) {
      poserMot(jeu, APPUI_DROIT, 1);
      noterLaPositionDuClic(jeu);
    }
    poserMot(jeu, DROIT_ENFONCE, 1);
  }
  if ((masque & RELACHE_DU_DROIT) !== 0) poserMot(jeu, DROIT_ENFONCE, 0);

  if ((masque & APPUI_DU_MILIEU) !== 0) {
    if (mot(jeu, MILIEU_ENFONCE) === 0 && mot(jeu, APPUI_MILIEU) === 0) {
      poserMot(jeu, APPUI_MILIEU, 1);
      noterLaPositionDuClic(jeu);
    }
    poserMot(jeu, MILIEU_ENFONCE, 1);
  }
  if ((masque & RELACHE_DU_MILIEU) !== 0) poserMot(jeu, MILIEU_ENFONCE, 0);
}

function noterLaPositionDuClic(jeu) {
  poserMot(jeu, CLIC_X, mot(jeu, CURSEUR_X));
  poserMot(jeu, CLIC_Y, mot(jeu, CURSEUR_Y));
}

// =================================================================================================
// LE CURSEUR TRACÉ DIRECTEMENT DANS LA FENÊTRE VIDÉO
// =================================================================================================
//
// 0x7CFC6 trace, 0x7D4F9 efface. Les deux travaillent sur la même pose (0xDE558, en octets depuis
// le début de l'écran) et le même tampon de fond (0xDE554) : effacer se fait toujours **avant** de
// retracer ailleurs, sans quoi le fond serait remis au mauvais endroit.
//
// En 320x200 le curseur du jeu, qui compte en 640x400, est divisé par deux pour l'écran ; la fenêtre
// vidéo tient l'écran entier et il n'y a pas de banque. En 640x480 les coordonnées sont celles de
// l'écran, l'image fait 300 Ko et la fenêtre 64 : le tracé surveille le débordement à chaque octet
// et passe à la banque suivante.

// 0x7CFC6 — tracer le curseur : sauver les pixels recouverts, poser le motif par-dessus.
// La couleur 0xFE du motif laisse voir le fond (c'est ce qui donne sa forme à la flèche).
export function tracerLeCurseur(jeu) {
  const basse = basseResolution(jeu);
  const largeurLigne = long(jeu, LIGNE_DE_L_ECRAN);

  poserMot(jeu, POSE_X, mot(jeu, CURSEUR_X));
  poserMot(jeu, POSE_Y, mot(jeu, CURSEUR_Y));
  if (basse) {
    poserMot(jeu, POSE_X, motSigne(jeu, POSE_X) >> 1);
    poserMot(jeu, POSE_Y, motSigne(jeu, POSE_Y) >> 1);
  }
  poserLong(jeu, DECALAGE, Math.imul(largeurLigne, motSigne(jeu, POSE_Y)) + motSigne(jeu, POSE_X));

  // En 640x480, la pose peut être au-delà de la première banque.
  if (!basse) {
    poserMot(jeu, BANQUE_DU_TRACE, long(jeu, DECALAGE) >>> 16);
    jeu.appeler(CHOISIR_BANQUE, motSigne(jeu, BANQUE_DU_TRACE));
  }

  // Ce qui tient encore à l'écran, en largeur comme en hauteur : le curseur est rogné au bord.
  poserMot(jeu, LARGEUR_TRACEE, largeurLigne - mot(jeu, POSE_X));
  if (motSigne(jeu, LARGEUR_TRACEE) > motSigne(jeu, LARGEUR_CURSEUR)) {
    poserMot(jeu, LARGEUR_TRACEE, mot(jeu, LARGEUR_CURSEUR));
  }
  poserMot(jeu, HAUTEUR_TRACEE, mot(jeu, HAUTEUR_DE_L_ECRAN) - mot(jeu, POSE_Y));
  if (motSigne(jeu, HAUTEUR_TRACEE) > motSigne(jeu, HAUTEUR_CURSEUR)) {
    poserMot(jeu, HAUTEUR_TRACEE, mot(jeu, HAUTEUR_CURSEUR));
  }

  poserLong(jeu, POINTEUR_TAMPON, long(jeu, TAMPON_DU_FOND));
  poserLong(jeu, POINTEUR_ECRAN, (long(jeu, DECALAGE) & 0xFFFF) + MEMOIRE_VIDEO);
  poserLong(jeu, POINTEUR_MOTIF, long(jeu, MOTIF));

  // En 640x480, le carré de 64x64 que le curseur occupe est marqué sale : la présentation par blocs
  // le fera circuler. (Le curseur est tracé dans la fenêtre vidéo, pas dans la surface : sans cela,
  // la trace qu'il laisse ne serait jamais effacée.)
  if (!basse) {
    jeu.appeler(MARQUER_ZONE_SALE, motSigne(jeu, CURSEUR_X), motSigne(jeu, CURSEUR_Y), 0x40, 0x40);
  }

  const m8 = jeu.m8;
  let tampon = long(jeu, POINTEUR_TAMPON);
  let ecran = long(jeu, POINTEUR_ECRAN);
  let motif = long(jeu, POINTEUR_MOTIF);
  let banque = mot(jeu, BANQUE_DU_TRACE);
  // La banque suivante, quand le pointeur d'écran sort de la fenêtre.
  const suivreLaBanque = () => {
    if (ecran < FIN_DE_LA_FENETRE) return;
    banque = (banque + 1) & 0xFFFF;
    poserMot(jeu, BANQUE_DU_TRACE, banque);
    jeu.appeler(CHOISIR_BANQUE, s16(banque));
    ecran -= TAILLE_FENETRE;
  };

  const hauteur = motSigne(jeu, HAUTEUR_TRACEE);
  const largeur = motSigne(jeu, LARGEUR_TRACEE);
  let ligne = 0, colonne = 0, uneLigneFaite = false;
  for (ligne = 0; ligne < hauteur; ligne++) {
    uneLigneFaite = true;
    for (colonne = 0; colonne < largeur; colonne++) {
      m8[tampon++] = m8[ecran];
      if (m8[motif] !== TRANSPARENT) m8[ecran] = m8[motif];
      ecran++;
      if (!basse) suivreLaBanque();
      motif++;
    }
    ecran += largeurLigne - largeur;
    if (!basse) suivreLaBanque();
    motif += motSigne(jeu, PAS_DU_MOTIF) - largeur;
  }
  poserMot(jeu, LIGNE_COPIEE, ligne);
  // 0xDE59A n'est remis à zéro qu'en entrant dans une ligne : si la hauteur est nulle, il garde
  // ce qu'y avait laissé l'appel précédent.
  if (uneLigneFaite) poserMot(jeu, COLONNE_COPIEE, colonne);
  poserLong(jeu, POINTEUR_TAMPON, tampon);
  poserLong(jeu, POINTEUR_ECRAN, ecran);
  poserLong(jeu, POINTEUR_MOTIF, motif);
}

// 0x7D4F9 — effacer le curseur : remettre à l'écran les pixels que le tampon garde.
// Les mesures (pose, largeur, hauteur, décalage) sont celles du dernier tracé : la routine ne les
// recalcule pas, elle ne refait que le chemin.
export function effacerLeCurseur(jeu) {
  const basse = basseResolution(jeu);
  const largeurLigne = long(jeu, LIGNE_DE_L_ECRAN);

  if (!basse) {
    poserMot(jeu, BANQUE_DU_TRACE, long(jeu, DECALAGE) >>> 16);
    jeu.appeler(CHOISIR_BANQUE, motSigne(jeu, BANQUE_DU_TRACE));
  }
  poserLong(jeu, POINTEUR_TAMPON, long(jeu, TAMPON_DU_FOND));
  poserLong(jeu, POINTEUR_ECRAN, (long(jeu, DECALAGE) & 0xFFFF) + MEMOIRE_VIDEO);

  const m8 = jeu.m8;
  let tampon = long(jeu, POINTEUR_TAMPON);
  let ecran = long(jeu, POINTEUR_ECRAN);
  let banque = mot(jeu, BANQUE_DU_TRACE);
  const suivreLaBanque = () => {
    if (ecran < FIN_DE_LA_FENETRE) return;
    banque = (banque + 1) & 0xFFFF;
    poserMot(jeu, BANQUE_DU_TRACE, banque);
    jeu.appeler(CHOISIR_BANQUE, s16(banque));
    ecran -= TAILLE_FENETRE;
  };

  const hauteur = motSigne(jeu, HAUTEUR_TRACEE);
  const largeur = motSigne(jeu, LARGEUR_TRACEE);
  let ligne = 0, colonne = 0, uneLigneFaite = false;
  for (ligne = 0; ligne < hauteur; ligne++) {
    uneLigneFaite = true;
    for (colonne = 0; colonne < largeur; colonne++) {
      m8[ecran++] = m8[tampon++];
      if (!basse) suivreLaBanque();
    }
    ecran += largeurLigne - largeur;
    if (!basse) suivreLaBanque();
  }
  poserMot(jeu, LIGNE_COPIEE, ligne);
  if (uneLigneFaite) poserMot(jeu, COLONNE_COPIEE, colonne);
  poserLong(jeu, POINTEUR_TAMPON, tampon);
  poserLong(jeu, POINTEUR_ECRAN, ecran);
}

// =================================================================================================
// CE QUI COMMANDE LE PILOTE
// =================================================================================================
//
// Les fonctions du pilote passent par l'appel d'interruption du compilateur (0x7F085, `int386`) :
// deux structures de 28 octets, l'une pour les registres d'entrée, l'autre pour ceux de sortie.
// L'original les tenait dans ses variables locales ; la réécriture descend le pointeur de pile de
// la même façon et les y pose — cette mémoire est morte au retour, comme la sienne.

function avecRegistres(jeu, corps) {
  const T = jeu.T;
  T.sauver();
  const avant = T.R.esp;
  const bas = ((avant >>> 0) - 0x40) >>> 0;
  T.R.esp = bas | 0;
  T.charger();
  try {
    return corps(bas, bas + 0x20);
  } finally {
    T.sauver();
    T.R.esp = avant;
    T.charger();
  }
}

// Une fonction du pilote : ax la fonction, cx et dx ses deux paramètres. Rend les registres de
// sortie lus par celles qui en attendent (la seule est le relevé, fonction 3).
function appelerLePilote(jeu, fonction, cx, dx) {
  return avecRegistres(jeu, (entree, sortie) => {
    jeu.m8.fill(0, entree, entree + TAILLE_REGISTRES);
    jeu.m8.fill(0, sortie, sortie + TAILLE_REGISTRES);
    poserMot(jeu, entree + 0, fonction);
    poserMot(jeu, entree + 8, cx);
    poserMot(jeu, entree + 12, dx);
    jeu.appeler(APPEL_D_INTERRUPTION, INTERRUPTION_SOURIS, entree, sortie);
    return {
      ebx: long(jeu, sortie + 4),
      ecx: long(jeu, sortie + 8),
      edx: long(jeu, sortie + 12),
    };
  });
}

// 0x11303 — la plage où le pilote garde son pointeur (fonctions 7 et 8).
//
// L'abscisse maximale est toujours ramenée à 638, l'ordonnée à 398 en basse résolution et à 478 en
// haute. En haute résolution, tout est multiplié par huit : le pilote compte huit fois plus fin que
// l'écran, et c'est ce qui permet au gestionnaire de diviser par huit ce qu'il en reçoit.
// Un mode d'affichage autre que 1 ou 8 ne fait rien.
export function plageDuPointeur(jeu, xMin, xMax, yMin, yMax) {
  // Hors du jeu d'origine : en grande vue, la borne de l'écran entier (640 ou 480, que les appelants
  // écrivent en dur) est celle de la grande vue.
  if (ecran.grande) {
    if (s16(xMax) >= 0x27E) xMax = ecran.largeur;
    if (s16(yMax) >= 0x1DE) yMax = ecran.hauteur;
  }
  if (s16(xMax) > piloteXMax()) xMax = piloteXMax();
  const mode = mot(jeu, MODE_AFFICHAGE);
  if (mode === 1) {
    appelerLePilote(jeu, PLAGE_HORIZONTALE, xMin, xMax);
    if (s16(yMax) > PILOTE_Y_MAX_BASSE) yMax = PILOTE_Y_MAX_BASSE;
    appelerLePilote(jeu, PLAGE_VERTICALE, yMin, yMax);
  } else if (mode === 8) {
    appelerLePilote(jeu, PLAGE_HORIZONTALE, xMin << 3, xMax << 3);
    if (s16(yMax) > piloteYMaxHaute()) yMax = piloteYMaxHaute();
    appelerLePilote(jeu, PLAGE_VERTICALE, yMin << 3, yMax << 3);
  }
}

// 0x11191 — déplacer le pointeur du pilote (fonction 4), et le curseur du jeu avec lui.
//
// C'est par là que le jeu colle le pointeur à la grille pendant un tracé, et qu'il le remet au
// centre quand il change de mode ou ouvre un écran plein. Rien n'est fait si le curseur n'est pas
// armé, ni si l'abscisse vaut -1 (le « pas de position » de 0xB14E2).
//
// Deux particularités du programme d'origine :
//  - une abscisse nulle ou négative est bien envoyée au pilote, mais le curseur du jeu (0xBECAC)
//    n'est pas mis à jour ;
//  - une ordonnée nulle ou négative est ignorée : c'est l'ordonnée courante du curseur du jeu qui
//    part au pilote.
export function placerLePointeur(jeu, x, y) {
  if ((long(jeu, CURSEUR_AFFICHE) | 0) <= 0) return;
  // L'original teste d'abord « x et y valent tous deux -1 », puis « x vaut -1 » : le premier test
  // ne décide de rien, le second suffit.
  if (s16(x) === -1) return;
  const basse = basseResolution(jeu);
  const facteur = basse ? 0 : 3;             // en haute résolution, le pilote compte huit fois plus fin

  let cx;
  if (s16(x) > 0) {
    if (s16(x) > piloteXMax()) x = piloteXMax();
    poserMot(jeu, CURSEUR_X, x);
    cx = x << facteur;
  } else {
    cx = x << facteur;
  }

  let dx;
  if (s16(y) > 0) {
    const plafond = basse ? PILOTE_Y_MAX_BASSE : piloteYMaxHaute();
    if (s16(y) > plafond) y = plafond;
    poserMot(jeu, CURSEUR_Y, y);
    dx = y << facteur;
  } else {
    dx = mot(jeu, CURSEUR_Y) << facteur;
  }

  appelerLePilote(jeu, PLACER_LE_POINTEUR, cx, dx);
  if (traceALaMain(jeu)) { laMain.x = cx; laMain.y = dx; }
}

// 0x1142A — remise à zéro matérielle du pilote (fonction 0x2F). Appelée par 0x1146E, la remise à
// zéro complète de la souris, juste après lui avoir donné sa plage.
export function remiseAZeroDuPilote(jeu) {
  appelerLePilote(jeu, REMISE_A_ZERO_MATERIELLE, 0, 0);
}

// 0x118FE — oublier, pour chacun des sept écrans pleins, l'écran d'où l'on venait.
//
// Chaque écran plein range dans un octet de 0xB9ED8 l'écran courant (0xD6652) avant de s'ouvrir, et
// le relit en sortant : 0x798D7 pour l'écran 0x52, 0x515A0 pour le 0x4E, 0x77A55, 0x4B11E, 0x7401C,
// 0x44EA5, 0x5C7D1 pour les autres. 0x560D2 efface la table quand la partie change : le souvenir
// d'une partie précédente y ramènerait à un écran qui n'existe plus.
export function oublierLesEcransDOuLOnVient(jeu) {
  jeu.appeler(REMPLIR, ECRANS_D_OU_L_ON_VIENT, 0, TAILLE_DES_ECRANS_D_OU_L_ON_VIENT);
}

// =================================================================================================
// 0x10992 — LE RELEVÉ DE LA SOURIS (enregistrement et relecture)
// =================================================================================================
//
// Appelée par 0x1107F, et seulement si 0xBECB2 n'est pas nul : en jeu normal, le jeu n'interroge
// jamais le pilote, il attend ses événements. Les deux modes :
//
//  - `-r` (0xBECB2 = 1) : on interroge le pilote (fonction 3), on range sa position et ses boutons
//    dans le curseur du jeu, puis on recopie l'image dans le tampon [0xD3AEC], 6 octets par image :
//    +0 la touche, +1 bits 0–1 les boutons et bits 2–4 le code de la touche, +2 sur 10 bits
//    l'abscisse, +4 sur 9 bits l'ordonnée ;
//  - `-p` (0xBECB2 = 2) : on relit ces 6 octets au lieu d'interroger le pilote.
//
// L'index d'image (0xD3AF0) avance jusqu'à 3 999 puis reste là. Ensuite, les deux mots d'appui et de
// maintien des boutons sont tenus comme dans le gestionnaire, et le curseur est tracé à sa place.
export function releverLaSouris(jeu) {
  const entrees = octet(jeu, MODE_ENTREES);
  let boutons = 0;

  if ((entrees & 1) !== 0) {
    const r = appelerLePilote(jeu, LIRE_LA_SOURIS, 0, 0);
    poserMot(jeu, CURSEUR_X, r.ecx);
    poserMot(jeu, CURSEUR_Y, r.edx);
    boutons = r.ebx & 3;
    if (long(jeu, TAMPON_DES_ENTREES) !== 0) {
      const image = long(jeu, TAMPON_DES_ENTREES) + Math.imul(long(jeu, IMAGE_ENREGISTREE), 6);
      poserMot(jeu, image + 2, (mot(jeu, image + 2) & 0xFC00) | (mot(jeu, CURSEUR_X) & 0x03FF));
      poserMot(jeu, image + 4, (mot(jeu, image + 4) & 0xFE00) | (mot(jeu, CURSEUR_Y) & 0x01FF));
      poserOctet(jeu, image + 1, (octet(jeu, image + 1) & 0xFC) | (boutons & 3));
      poserOctet(jeu, image + 0, octet(jeu, TOUCHE_ENREGISTREE));
      poserOctet(jeu, image + 1, (octet(jeu, image + 1) & 0xE3) | ((octet(jeu, CODE_ENREGISTRE) & 7) << 2));
    }
  } else if ((entrees & 2) !== 0) {
    const image = long(jeu, TAMPON_DES_ENTREES) + Math.imul(long(jeu, IMAGE_ENREGISTREE), 6);
    poserMot(jeu, CURSEUR_X, mot(jeu, image + 2) & 0x03FF);
    poserMot(jeu, CURSEUR_Y, mot(jeu, image + 4) & 0x01FF);
    boutons = octet(jeu, image + 1) & 3;
    poserOctet(jeu, TOUCHE_ENREGISTREE, octet(jeu, image + 0));
    poserOctet(jeu, CODE_ENREGISTRE, (octet(jeu, image + 1) << 3 & 0xFF) >> 5);
  }

  if ((boutons & 1) !== 0) {
    if (mot(jeu, APPUI_GAUCHE) === 0 && mot(jeu, GAUCHE_ENFONCE) === 0) {
      poserMot(jeu, APPUI_GAUCHE, 1);
      noterLaPositionDuClic(jeu);
    }
    poserMot(jeu, GAUCHE_ENFONCE, 1);
  } else {
    poserMot(jeu, GAUCHE_ENFONCE, 0);
  }
  if ((boutons & 2) !== 0) {
    if (mot(jeu, APPUI_DROIT) === 0 && mot(jeu, DROIT_ENFONCE) === 0) {
      poserMot(jeu, APPUI_DROIT, 1);
      noterLaPositionDuClic(jeu);
    }
    poserMot(jeu, DROIT_ENFONCE, 1);
  } else {
    poserMot(jeu, DROIT_ENFONCE, 0);
  }

  if (long(jeu, IMAGE_ENREGISTREE) < DERNIERE_IMAGE_ENREGISTREE) {
    poserLong(jeu, IMAGE_ENREGISTREE, long(jeu, IMAGE_ENREGISTREE) + 1);
  }

  if (long(jeu, IMAGE_DU_CURSEUR) !== 0) {
    const tracer = basseResolution(jeu) ? TRACER_IMAGE : TRACER_IMAGE_MARQUEE;
    jeu.appeler(tracer, motSigne(jeu, CURSEUR_X), motSigne(jeu, CURSEUR_Y), long(jeu, IMAGE_DU_CURSEUR));
  }
}

// =================================================================================================
//
// Toutes prouvées par comparer.mjs (0 divergence, état de l'hôte compris : l'heure, la file des
// événements de la souris, la position et les bornes du pilote, la banque vidéo, la palette) et par
// verifier.mjs avec --empoisonner (IDENTIQUE), sur demo.json, parc.json, ecrans.json,
// construction.json, simulation.json, fin-annee.json et feux.json. 0x118FE n'est appelée que quand
// une partie est chargée : seuls parc.json et ecrans.json l'exercent.
//
// Les trois branches des outils (l'écart compté deux fois en 640x480, le saut au coin de la case à
// l'appui du bouton gauche, la projection sur les axes pendant un tracé) ne sont atteintes que
// lorsqu'un outil de tracé est en main : travaux.json les exerce en 320x200, et un scénario composé
// pour ce lot (chemin et barrière tracés après la touche R) les exerce en 640x480, où le double
// comptage joue.
//
// Le tampon où 0x7CFC6 garde les pixels recouverts vit dans le tas : la comparaison appel par appel
// ne le relève que si la réécriture le déclare.
const zoneDuTampon = (jeu) => {
  const p = long(jeu, TAMPON_DU_FOND);
  return p >= 0x100000 ? [[p, p + TAILLE_DU_TAMPON]] : [];
};

export const reecritures = [
  { adresse: 0x7D7E2, nom: 'gestionnaireDeSouris', fn: gestionnaireDeSouris, convention: 'registres',
    nettoie: 4, zones: zoneDuTampon },
  { adresse: 0x7CFC6, nom: 'tracerLeCurseur', fn: (jeu) => tracerLeCurseur(jeu), arguments: 0,
    zones: zoneDuTampon },
  { adresse: 0x7D4F9, nom: 'effacerLeCurseur', fn: (jeu) => effacerLeCurseur(jeu), arguments: 0 },
  { adresse: 0x11303, nom: 'plageDuPointeur', fn: plageDuPointeur, arguments: 4 },
  { adresse: 0x11191, nom: 'placerLePointeur', fn: placerLePointeur, arguments: 2 },
  { adresse: 0x1142A, nom: 'remiseAZeroDuPilote', fn: (jeu) => remiseAZeroDuPilote(jeu), arguments: 0 },
  { adresse: 0x118FE, nom: 'oublierLesEcransDOuLOnVient', fn: (jeu) => oublierLesEcransDOuLOnVient(jeu), arguments: 0 },
];

// Non active : aucun scénario ne l'appelle, le relevé n'étant fait qu'avec les options `-r` et `-p`.
export const enAttente = [
  { adresse: 0x10992, nom: 'releverLaSouris', fn: (jeu) => releverLaSouris(jeu), arguments: 0 },
];
