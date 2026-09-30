// L'introduction : les fonctions propres d'INTRO.EXE, le film d'ouverture que le lanceur de 1994
// (THEME.BAT) exécutait avant le jeu.
//
// INTRO.EXE est un second programme, lié à la même bibliothèque que MAIN.EXE (Watcom, HMI SOS, la
// couche de son et le lecteur de films de Bullfrog) : 466 de ses 497 fonctions sont, instruction pour
// instruction, celles de MAIN.EXE. Transporté dans la disposition mémoire de MAIN.EXE (outils/intro.py
// en tire la carte, moteur/hote/image-intro.js y pose ses données), il tourne avec le code lisible du
// jeu, qui vise ces adresses-là. Restent ses fonctions propres, réécrites ici, chacune à son adresse
// dans INTRO.EXE plus 0x800000 (VIRTUEL, moteur/hote/intro-carte.js) : les adresses de MAIN.EXE ne
// vont pas au-delà de 0x100000. Leurs données propres (textes, script, variables : 3 Ko) sont posées
// à la place du code de MAIN.EXE, entre ses îles (0x6A660 à 0x6B348) ; les commentaires donnent
// chaque adresse dans la disposition transportée, puis, entre crochets, dans INTRO.EXE.
//
// Ce que fait l'introduction (0x810110, `main`) : le dossier du jeu pris dans la ligne de commande
// (« -C:/THEME.CD »), quatre tampons, les cartes son lues dans sndsetup.inf et ouvertes, une
// minuterie à 120 Hz (celle de SOS, ou la sienne sans carte son), le mode 320x200, le clavier pris ;
// puis le film data/intro.dat, image par image, avec son script (musique et bruitages) ; tout est
// rendu en sortant. Une touche l'arrête.
//
// Beaucoup de ces fonctions propres sont celles du jeu, liées ailleurs : le démarrage de Watcom, son
// `__CMain` et son `exit` appellent le `main` de l'introduction ; l'ouverture des bruitages de Bullfrog
// (son-du-jeu.js) vient d'une version voisine de son code, compilée autrement, aux variables propres
// à l'introduction. Celles-là prennent la réécriture du jeu, avec les liens de l'introduction ; trois
// autres, identiques octet pour octet, la prennent telle quelle (index.js, COPIES_DE_L_INTRODUCTION).
//
// LA PILE ET LES REGISTRES. Avec une carte son, la minuterie de SOS interrompt le code à chaque
// service rendu par l'hôte (int, lecture d'un port) : son gestionnaire range le pointeur de pile du
// code interrompu en 0xC370E, et son répartiteur empile ebx, esi, edi et ebp sur sa pile privée
// (son-du-jeu.js, « LA PILE PRIVÉE DE SOS »). Les réécritures ouvrent donc le cadre de l'original
// (`ouvrir`) et posent ces quatre registres comme lui, jusque dans ce que laissent ses boucles.
//
// LE TEMPS. Le film attend entre deux images que la minuterie ait compté le délai (0x810C2B), en
// relisant la mémoire sans rien demander à l'hôte : c'est le garde-fou de l'hôte (machine.js, `tic`)
// qui y fait passer le temps, par pas de 25 ms, comme sous la transcription.
//
// Preuve : moteur/node/verifier-intro.mjs --lisible (le code lisible posé sur la transcription
// transportée) et --autonome (sans aucune transcription), contre la transcription transportée, elle-
// même prouvée identique à INTRO.EXE joué dans sa propre disposition : la même image toutes les
// 100 ms, le même son, la même mémoire, pile privée de SOS comprise, et chaque interruption de la
// minuterie de SOS à la même hauteur de pile.

import { pointDEntree, cMain, pasDeFlottants } from './demarrage.js';
import { ouvrirLesBruitages } from './son-du-jeu.js';

// --- La mémoire -------------------------------------------------------------------------------------
const s16 = (v) => (v << 16) >> 16;
const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Le cadre de l'original : les registres qu'il empile en entrant (`empiles`, dans l'ordre ; ebp, le
// dernier, reçoit le pointeur de pile), puis `locales` octets de variables. Ses appels partent de la
// même hauteur que ceux de l'original. `fermer` rend les registres empilés.
function ouvrir(jeu, empiles, locales = 0) {
  const T = jeu.T;
  T.sauver();
  const R = T.R, gardes = {};
  let esp = R.esp >>> 0;
  for (const r of empiles) { esp -= 4; poserLong(jeu, esp, R[r]); gardes[r] = R[r]; }
  if (empiles[empiles.length - 1] === 'ebp') R.ebp = esp;
  R.esp = (esp - locales) | 0;
  T.charger();
  return {
    ebp: esp,
    local: (decalage) => (esp - decalage) >>> 0,
    fermer() { T.sauver(); Object.assign(R, gardes); T.charger(); },
  };
}
function dansLeCadre(jeu, empiles, locales, corps) {
  const cadre = ouvrir(jeu, empiles, locales);
  try { return corps(cadre); } finally { cadre.fermer(); }
}
// Des registres posés comme l'original les laisse, avant un appel ou en sortant.
function poser(jeu, valeurs) {
  Object.assign(jeu.T.R, valeurs);
  jeu.T.charger();
}
// Une écriture sur un port (qui ne livre pas d'interruption).
function ecrirePort(jeu, port, valeur) {
  jeu.T.charger();
  jeu.machine.sortie(port, valeur & 0xFF, 1);
}
// Un pas d'une attente active, que la transcription fait tous les 10 000 tours de boucle : le
// garde-fou de l'hôte y fait passer le temps et livre les interruptions.
function patienter(jeu) {
  jeu.T.charger();
  jeu.machine.tic();
  jeu.T.charger();
}

// --- Les variables ---------------------------------------------------------------------------------
// Celles du jeu, que l'introduction partage (son-du-jeu.js et systeme.js les nomment aussi).
const MUSIQUE_PRETE = 0xBA714, BRUITAGES_PRETS = 0xBA720;
const SURFACE = 0xDE5BC;                // l'image en construction, 320x200 [0x4C114]
const TAMPON_DU_FILM = 0xD3B94;         // ce qu'on lit du film [0x4C104]
const TAMPON_DE_PALETTE = 0xD35B8;      // le morceau de palette lu (0x60F92) [0x4C108]
const NOM_DU_FILM = 0xBA7EC;            // [0x40A50]
const FICHIER_DU_FILM = 0xBA7E4;        // [0x40A48]
const DELAI_ENTRE_IMAGES = 0xBA7E8;     // mot long : en tics de la minuterie, ici [0x40A4C]
const TAILLE_DU_BLOC = 0xBA7C8;         // [0x40A2C]
const MORCEAUX_DE_L_IMAGE = 0xBA7CC;    // [0x40A30]
const IMAGES_RESTANTES = 0xBA7C2;       // [0x40A26]
const IMAGE_DU_FILM = 0xBA7D0;          // [0x40A34]
const PALETTE_CHANGEE = 0xBA81E;        // [0x40A84]
const TAMPON_DU_FILM_EN_MEMOIRE = 0xBEEFC;   // [0x40C5C]
const MODE_TEXTE_D_ORIGINE = 0xDE5F4, MODE_AFFICHAGE = 0xDE5F6;
const PAS_LIGNE = 0xDE5B8, HAUTEUR_ECRAN = 0xDE5C0;
const FENETRE_VIDEO = 0xA0000;
// Le clavier : l'ancien vecteur 9 (décalage, sélecteur), le code précédent (0xE0 : une touche
// étendue), la première touche frappée — partagés avec le gestionnaire du jeu.
const ANCIEN_CLAVIER = 0xDEDC0, ANCIEN_CLAVIER_SELECTEUR = 0xDEDC4;
const CODE_PRECEDENT = 0xDEDC6, PREMIERE_TOUCHE = 0xDEDC7;
// La table des blocs de mémoire du DOS pris par SOS, rendus en sortant : 12 octets par entrée
// (adresse, sélecteur, drapeau ; un drapeau nul la termine) [0x4C680].
const BLOCS_DOS = 0xDEDC8;

// Celles de l'introduction, posées à la place du code de MAIN.EXE.
const ARGUMENT = 0x6B0D0;               // pointeur : la ligne de commande, sans son « - » [0x4C100]
const DOSSIER_DU_JEU = 0x6B040;         // « C:/THEME.CD/ » [0x4C070]
const BARRE = 0x6A674;                  // « / » [0x40004]
const FILM = 0x6A678;                   // « data/intro.dat », 15 octets [0x40008]
const SCRIPT = 0x6AC00;                 // le script du film [0x40710]
const PALETTE = 0x6B0F0;                // pointeur : la palette du film, 768 octets [0x4C110]
const TICS = 0x6AF42;                   // mot : les tics comptés depuis l'image précédente [0x40A82]
const DIVISEUR = 0x6ABF4;               // mot long : celui de la minuterie, 0x26AF (120 Hz) [0x40704]
const RESTE_POUR_LE_BIOS = 0x6ABF8;     // mot long : de quoi rendre au BIOS son tic de 18,2 Hz [0x40708]
const ANCIENNE_MINUTERIE = 0x6B108, ANCIENNE_MINUTERIE_SELECTEUR = 0x6B10C;   // [0x4C118]
const TIC_PAR_SOS = 0x6ABFF;            // octet : le tic est un événement de la minuterie de SOS [0x4070F]
const EVENEMENT_DU_TIC = 0x6A660;       // sa poignée [0xE3000]
const CHAINER_LE_CLAVIER = 0x6ABFE;     // octet : rendre aussi chaque touche à l'ancien gestionnaire
                                        // (jamais posé) [0x4070E]
const TOUCHE = 0x6B2C0;                 // octet : le dernier code du clavier [0x4C560]
const TOUCHES = 0x6B240;                // 128 octets : chaque touche, 1 enfoncée [0x4C4E0]
const BOUTON = 0x6B32E;                 // mot : jamais posé, relu par le film [0x4C5CE]
const LIGNE_DU_SCRIPT = 0x6AF10;        // mot [0x40A20]
const GENRE_DU_BLOC = 0x6AF14;          // mot [0x40A24]
const IMAGE_6AF2E = 0x6AF2E;            // mot : remis à zéro, jamais relu (non établi) [0x40A3E]
const REPETITIONS = 0x6AF32;            // mot : les passes du film qui restent [0x40A42]
const PALETTE_A_POSER = 0x6AF34;        // mot long : 1, les palettes du film sont posées [0x40A44]

// Les fonctions du jeu (le code lisible, à leurs adresses de MAIN.EXE).
const SELECTEUR_DES_DONNEES = 0x7E570;
const ALLOUER = 0x7E8D0, LIBERER = 0x7EDC0;
const LIRE_UN_VECTEUR = 0x8164E, POSER_UN_VECTEUR = 0x828EB, CHAINER_L_INTERRUPTION = 0x821BE;
const LIRE_UN_PORT = 0x81A8E9, ECRIRE_UN_PORT = 0x821DF;
const INT386 = 0x7F085, INT_VIDEO = 0x10, INT_SOURIS = 0x33, POSER_LA_FENETRE = 0x87790;
const POSER_LA_PALETTE = 0x808B0, ATTENDRE_LE_BALAYAGE = 0x80BE4, MODE_D_ORIGINE = 0x7E270;
const VOLUME_DE_LA_MUSIQUE = 0x800AB;
const TIMER_REGISTER_EVENT = 0x822F4, TIMER_REMOVE_EVENT = 0x8260A;
const DEFAIRE_LES_BRUITAGES = 0x7EED0, DEFAIRE_LA_MUSIQUE = 0x7EF60;
const RENDRE_MEMOIRE_DOS = 0x8A7FC, LIBERER_MEMOIRE = 0x8B8E8;
const SOPEN = 0x8616E, CLOSE = 0x8639A, LIRE_LE_FILM = 0x83670, LIRE_L_EN_TETE = 0x60EF3;
const CHARGER_LA_BANQUE_DE_MUSIQUE = 0x83420, CHARGER_LA_BANQUE_DE_BRUITAGES = 0x83540;
const LANCER_UN_MORCEAU = 0x80A20, ARRETER_LA_MUSIQUE = 0x80990, LIRE_LE_FILM_D_AVANCE = 0x83700;
const JOUER_UN_BRUITAGE = 0x80C80, ARRETER_UN_BRUITAGE = 0x80350, ARRETER_TOUS_LES_BRUITAGES = 0x80DC0;
const JOUER_EN_BOUCLE = 0x81AD0, VOLUME_D_UN_BRUITAGE = 0x81984;
// Les décodeurs des morceaux d'une image FLC (son-du-jeu.js), par genre.
const DECODEURS = new Map([
  [7, 0x61033],       // deltas par mots
  [0xC, 0x6110A],     // deltas par octets
  [4, 0x60F92],       // palette de 256 niveaux
  [0xB, 0x81098B],    // palette de 64 niveaux : la seconde copie de 0x60F92 (index.js)
  [0xF, 0x611B1],     // image pleine
  [0x10, 0x60F56],    // copie brute
]);
const SAUTER_UN_BLOC = 0x60F74;
// Celles de l'introduction.
const UN_TIC = 0x810010, GESTIONNAIRE_DU_CLAVIER = 0x813440;
const LECTEUR = 0x81064C, SUIVRE_LE_SCRIPT = 0x810310, DECODER_UNE_IMAGE = 0x8107F2;
const POSER_LA_PALETTE_DU_FILM = 0x8109B2, ATTENDRE_LE_DELAI = 0x810C2B;
const PASSER_EN_BASSE = 0x813990, PLAGE_DE_LA_SOURIS = 0x8155D8;
const LIRE_LA_MUSIQUE = 0x810C50, LIRE_LES_BRUITAGES = 0x810EC0;

// ================================================================================================
// 1. Le démarrage
// ================================================================================================

// Les liens de l'introduction (demarrage.js, LIENS_DU_JEU) : son `__CMain` (0x818246 [0x18246]) appelle
// son `main` (0x810110 [0x10110]) ; `exit`, recopié au bout de `__CMain` (0x817F26 [0x17F26]), prend
// ses propres vecteurs de nettoyage (0x6AFE4 à 0x6AFEC [0x40DE4]), qui montrent le `ret` de la
// bibliothèque (0x7E2A0) ; la console et le message des flottants sont les siens (0x8115CA [0x115CA] :
// une île de son code, que l'image ne pose pas — l'hôte ne connaît pas « con », de toute façon).
const LIENS = {
  cMain: 0x818246, main: 0x810110, nettoyages: [0x6AFE4, 0x6AFE8, 0x6AFEC],
  console: 0x8115CA, pasDeFlottants: 0xB0764,
  retours: {
    initialisations: 0x8117BC, cMain: 0x8117C3,
    pileDisponible: 0x81825B, pasDuTas: 0x81827B, main: 0x81828C,
    nettoyages: [0x817F2F, 0x817F35, 0x817F41, 0x817F47],
    routinesDeFin: 0x8117F1,
  },
};

// Le `strcpy` que le compilateur écrit en ligne : deux octets par tour. Rend esi : sur le zéro final
// s'il tombe au premier octet d'un tour, derrière lui sinon.
function copierLaChaine(jeu, source, destination) {
  const m8 = jeu.m8;
  for (;;) {
    let c = m8[source]; m8[destination] = c;
    if (c === 0) return source;
    c = m8[source + 1]; source += 2; m8[destination + 1] = c; destination += 2;
    if (c === 0) return source;
  }
}
// La fin d'une chaîne (`repne scasb`, puis `dec edi`).
function finDeLaChaine(jeu, a) {
  while (jeu.m8[a] !== 0) a++;
  return a;
}

// 0x810110 [0x10110] — `main`(argc, argv). La ligne de commande « -C:/THEME.CD » (ou « /… ») donne le
// dossier du jeu, suivi de « / ». Puis quatre tampons pris au tas du jeu (l'image 0xFA00 octets, le
// film 0x11300, les palettes 0x1000 chacun) ; s'il en manque un, ceux déjà pris sont rendus et
// l'introduction s'arrête. Les deux cartes son de sndsetup.inf, ouvertes ; le volume de la musique à
// 0x50 ; le tic de 120 Hz inscrit à la minuterie de SOS si l'une des deux est ouverte, sinon la
// minuterie prise à son compte. Le mode 320x200, le délai de 0x15 tics entre deux images, le nom du
// film, le clavier pris, et le film joué (interruptible, palettes posées) ; enfin tout est rendu.
// `main` ne rend rien : eax y reste ce qu'a laissé la dernière fonction (verifier-intro.mjs).
function principal(jeu, argc, argv) {
  const R = jeu.T.R;
  dansLeCadre(jeu, ['esi', 'edi', 'ebp'], 0, () => {
    const argument = long(jeu, argv + 4);
    poserLong(jeu, ARGUMENT, argument);
    const c = octet(jeu, argument);
    if (c === 0x2D || c === 0x2F) {                 // « - » ou « / »
      poserLong(jeu, ARGUMENT, argument + 1);
      let esi = copierLaChaine(jeu, argument + 1, DOSSIER_DU_JEU);
      esi = copierLaChaine(jeu, BARRE, finDeLaChaine(jeu, DOSSIER_DU_JEU));
      poser(jeu, { esi, edi: DOSSIER_DU_JEU });
    }
    const tampons = [[SURFACE, 0xFA00], [TAMPON_DU_FILM, 0x11300], [TAMPON_DE_PALETTE, 0x1000], [PALETTE, 0x1000]];
    let pris = 0;
    for (const [variable, taille] of tampons) {
      const bloc = jeu.appeler(ALLOUER, taille);
      poserLong(jeu, variable, bloc);
      if (bloc === 0) break;
      pris++;
    }
    if (pris === 4) {
      jeu.appeler(LIRE_LA_MUSIQUE);
      jeu.appeler(LIRE_LES_BRUITAGES);
      if (octet(jeu, MUSIQUE_PRETE) !== 0) jeu.appeler(VOLUME_DE_LA_MUSIQUE, 0x50);
      if (octet(jeu, MUSIQUE_PRETE) !== 0 || octet(jeu, BRUITAGES_PRETS) !== 0) {
        jeu.appeler(TIMER_REGISTER_EVENT, 0x78, UN_TIC, R.cs & 0xFFFF, EVENEMENT_DU_TIC, R.ds & 0xFFFF);
        poserOctet(jeu, TIC_PAR_SOS, 1);
      } else {
        jeu.appeler(0x810078);
      }
      poser(jeu, { edi: NOM_DU_FILM, esi: FILM });
      jeu.appeler(0x8102E8);
      poserLong(jeu, DELAI_ENTRE_IMAGES, 0x15);
      jeu.m8.copyWithin(NOM_DU_FILM, FILM, FILM + 15);      // movsd ×3, movsw, movsb
      poser(jeu, { edi: NOM_DU_FILM + 15, esi: FILM + 15 });
      jeu.appeler(0x81355C);
      jeu.appeler(LECTEUR, 1, 1, SCRIPT);
      jeu.appeler(0x8135C8);
      jeu.appeler(0x8102FC);
      if (octet(jeu, TIC_PAR_SOS) !== 0) jeu.appeler(TIMER_REMOVE_EVENT, long(jeu, EVENEMENT_DU_TIC));
      else jeu.appeler(0x8100E0);
      jeu.appeler(DEFAIRE_LES_BRUITAGES);
      jeu.appeler(DEFAIRE_LA_MUSIQUE);
    }
    // les tampons pris, rendus du dernier au premier
    if (pris === 0) return;
    for (let k = pris - 1; k >= 0; k--) jeu.appeler(LIBERER, long(jeu, tampons[k][0]));
    jeu.appeler(0x8138D0);
  });
}

// ================================================================================================
// 2. La minuterie et le clavier
// ================================================================================================

// 0x810010 [0x10010] — un tic : le compte que le film attend, avancé 120 fois par seconde. SOS
// l'appelle comme un événement de sa minuterie (un appel lointain, d'où le `retf`), sur sa pile
// privée ; sans carte son, le gestionnaire de l'IRQ 0 de l'introduction (0x81001C).
function unTic(jeu, R) {
  poserLong(jeu, R.esp - 4, R.ebp);                        // push ebp
  poserMot(jeu, TICS, mot(jeu, TICS) + 1);
}

// 0x81001C [0x1001C] — le gestionnaire de l'IRQ 0 que l'introduction pose sans carte son (0x810078),
// la minuterie réglée à 120 Hz : un tic (0x810010, par un appel lointain) ; le diviseur ajouté à ce
// qui revient au BIOS, qui reçoit un tic chaque fois que le compte passe 0x10000 (18,2 fois par
// seconde) : on lui chaîne alors l'interruption (0x821BE, qui ne revient pas). Sinon, la fin
// d'interruption, et `iretd`.
function gestionnaireDeLaMinuterie(jeu, R) {
  // pushad, puis ds, es, fs, gs ; ebp sur eux
  const esp = R.esp;
  R.esp = (R.esp - 32) | 0;
  [R.edi, R.esi, R.ebp, esp, R.ebx, R.edx, R.ecx, R.eax].forEach((v, k) => poserLong(jeu, R.esp + 4 * k, v));
  const entree = { eax: R.eax, ecx: R.ecx, edx: R.edx, ebx: R.ebx, ebp: R.ebp, esi: R.esi, edi: R.edi };
  const segments = [R.ds, R.es, R.fs, R.gs];
  for (const s of segments) { R.esp = (R.esp - 4) | 0; poserLong(jeu, R.esp, s); }
  R.ebp = R.esp;
  R.DF = false;
  jeu.T.charger();
  jeu.appeler(SELECTEUR_DES_DONNEES);
  // push cs ; call 0x810010 : l'appel lointain, dont le `retf` retire aussi cs
  poserLong(jeu, R.esp - 4, R.cs);
  R.esp = (R.esp - 4) | 0;
  jeu.appeler(UN_TIC);
  const diviseur = long(jeu, DIVISEUR);
  poserLong(jeu, RESTE_POUR_LE_BIOS, long(jeu, RESTE_POUR_LE_BIOS) + diviseur);
  R.eax = diviseur | 0;
  if (long(jeu, RESTE_POUR_LE_BIOS) >= 0x10000) {
    poserLong(jeu, RESTE_POUR_LE_BIOS, long(jeu, RESTE_POUR_LE_BIOS) - 0x10000);
    jeu.appeler(CHAINER_L_INTERRUPTION, long(jeu, ANCIENNE_MINUTERIE), mot(jeu, ANCIENNE_MINUTERIE_SELECTEUR));
  }
  R.edx = 0x20;
  R.eax = (R.eax & ~0xFF) | 0x20;
  ecrirePort(jeu, 0x20, 0x20);                             // fin d'interruption
  // pop gs, fs, es, ds ; popad ; iretd
  R.gs = segments[3]; R.fs = segments[2]; R.es = segments[1]; R.ds = segments[0];
  Object.assign(R, entree);
  R.esp = esp;
  iretd(jeu, R);
}

// Les drapeaux d'un mot d'état empilé, rendus par `iretd`.
function iretd(jeu, R) {
  const v = long(jeu, R.esp + 8);
  R.CF = (v & 1) !== 0; R.ZF = (v & 0x40) !== 0; R.SF = (v & 0x80) !== 0; R.IF = (v & 0x200) !== 0;
  R.DF = (v & 0x400) !== 0; R.OF = (v & 0x800) !== 0;
  R.esp = (R.esp + 12) | 0;
}

// 0x810078 [0x10078] — prendre la minuterie, sans carte son : le diviseur 0x26AF (120 Hz), l'ancien
// vecteur 8 gardé, la minuterie reprogrammée (mode 0x36, octet bas puis haut) et le gestionnaire
// 0x81001C posé.
function prendreLaMinuterie(jeu) {
  const R = jeu.T.R;
  dansLeCadre(jeu, ['ebp'], 0, () => {
    poserLong(jeu, DIVISEUR, 0x26AF);
    poserLong(jeu, RESTE_POUR_LE_BIOS, 0);
    const decalage = jeu.appeler(LIRE_UN_VECTEUR, 8);
    poserMot(jeu, ANCIENNE_MINUTERIE_SELECTEUR, R.edx);
    poserLong(jeu, ANCIENNE_MINUTERIE, decalage);
    poser(jeu, { edx: 0x43, eax: (R.eax & ~0xFF) | 0x36 });
    ecrirePort(jeu, 0x43, 0x36);
    const diviseur = long(jeu, DIVISEUR);
    poser(jeu, { edx: 0x40, eax: diviseur & 0xFF });
    ecrirePort(jeu, 0x40, diviseur);
    poser(jeu, { eax: (diviseur >>> 8) & 0xFF });
    ecrirePort(jeu, 0x40, diviseur >>> 8);
    jeu.appeler(POSER_UN_VECTEUR, 8, 0x81001C, R.cs & 0xFFFF);
  });
}

// 0x8100E0 [0x100E0] — rendre la minuterie : le diviseur d'origine (0 : 65 536) et l'ancien vecteur 8.
function rendreLaMinuterie(jeu) {
  const R = jeu.T.R;
  dansLeCadre(jeu, ['ebp'], 0, () => {
    poser(jeu, { edx: 0x43, eax: (R.eax & ~0xFF) | 0x36 });
    ecrirePort(jeu, 0x43, 0x36);
    poser(jeu, { edx: 0x40, eax: R.eax & ~0xFF });
    ecrirePort(jeu, 0x40, 0);
    ecrirePort(jeu, 0x40, 0);
    jeu.appeler(POSER_UN_VECTEUR, 8, long(jeu, ANCIENNE_MINUTERIE), mot(jeu, ANCIENNE_MINUTERIE_SELECTEUR));
  });
}

// 0x81A8E9 [0x1A8E9] — inp(port).
function lireUnPort(jeu, port) {
  const R = jeu.T.R;
  poserLong(jeu, R.esp - 4, R.ebp);                        // push ebp
  poser(jeu, { edx: port, eax: 0 });
  jeu.T.charger();
  const v = jeu.machine.entree(port & 0xFFFF, 1) & 0xFF;
  jeu.T.charger();
  return v;
}

// 0x813440 [0x13440] — le gestionnaire du clavier (IRQ 1, vecteur 9) : le code lu au port 0x60. Après
// le préfixe 0xE0 des touches étendues, les codes 0x2A et 0xAA (une Maj. fantôme) sont notés 0x80 ;
// sinon la touche est notée enfoncée ou relâchée (bit 7) dans la table, et la première touche
// enfoncée, retenue. L'acquittement au clavier (bit 7 du port 0x61, levé puis rendu), puis, si on le
// demande (jamais), l'ancien gestionnaire ; la fin d'interruption, et `iretd`.
function gestionnaireDuClavier(jeu, R) {
  const esp = R.esp;
  R.esp = (R.esp - 32) | 0;
  [R.edi, R.esi, R.ebp, esp, R.ebx, R.edx, R.ecx, R.eax].forEach((v, k) => poserLong(jeu, R.esp + 4 * k, v));
  const entree = { eax: R.eax, ecx: R.ecx, edx: R.edx, ebx: R.ebx, ebp: R.ebp, esi: R.esi, edi: R.edi };
  const segments = [R.ds, R.es, R.fs, R.gs];
  for (const s of segments) { R.esp = (R.esp - 4) | 0; poserLong(jeu, R.esp, s); }
  const ebp = R.esp >>> 0;
  R.ebp = ebp;
  R.esp = (R.esp - 8) | 0;                                 // deux variables
  R.DF = false;
  jeu.T.charger();
  jeu.appeler(SELECTEUR_DES_DONNEES);
  const code = jeu.appeler(LIRE_UN_PORT, 0x60) & 0xFF;
  poserOctet(jeu, TOUCHE, code);
  if (octet(jeu, CODE_PRECEDENT) === 0xE0 && (code === 0x2A || code === 0xAA)) {
    poserOctet(jeu, CODE_PRECEDENT, code);
    poserOctet(jeu, TOUCHE, 0x80);
  } else {
    poserOctet(jeu, CODE_PRECEDENT, code);
    const touche = code & 0x7F;
    poserLong(jeu, ebp - 4, (R.eax & ~0xFFFF) | touche);
    poserOctet(jeu, TOUCHES + touche, code > 0x7F ? 0 : 1);
  }
  const etat = jeu.appeler(LIRE_UN_PORT, 0x61);
  poserLong(jeu, ebp - 4, etat);
  poserLong(jeu, ebp - 8, etat);
  poserLong(jeu, ebp - 4, etat | 0x80);
  jeu.appeler(ECRIRE_UN_PORT, 0x61, s16(etat | 0x80));
  jeu.appeler(ECRIRE_UN_PORT, 0x61, s16(etat));
  if (octet(jeu, TOUCHE) < 0x80 && octet(jeu, PREMIERE_TOUCHE) === 0) poserOctet(jeu, PREMIERE_TOUCHE, octet(jeu, TOUCHE));
  if (octet(jeu, CHAINER_LE_CLAVIER) !== 0) {
    jeu.appeler(CHAINER_L_INTERRUPTION, long(jeu, ANCIEN_CLAVIER), mot(jeu, ANCIEN_CLAVIER_SELECTEUR));
  }
  jeu.appeler(ECRIRE_UN_PORT, 0x20, 0x20);
  R.gs = segments[3]; R.fs = segments[2]; R.es = segments[1]; R.ds = segments[0];
  Object.assign(R, entree);
  R.esp = esp;
  iretd(jeu, R);
}

// 0x81355C [0x1355C] — prendre le clavier : la table des touches vidée, l'ancien vecteur 9 gardé, le
// gestionnaire 0x813440 posé.
function prendreLeClavier(jeu) {
  const R = jeu.T.R;
  dansLeCadre(jeu, ['ebx', 'esi', 'edi', 'ebp'], 4, (cadre) => {
    for (let k = 0; k < 0x80; k++) poserOctet(jeu, TOUCHES + k, 0);
    poserLong(jeu, cadre.local(4), 0x80);
    const decalage = jeu.appeler(LIRE_UN_VECTEUR, 9);
    const selecteur = R.edx & 0xFFFF;
    poserMot(jeu, ANCIEN_CLAVIER_SELECTEUR, selecteur);
    poserLong(jeu, ANCIEN_CLAVIER, decalage);
    poser(jeu, { ebx: R.cs, ecx: GESTIONNAIRE_DU_CLAVIER });
    jeu.appeler(POSER_UN_VECTEUR, 9, GESTIONNAIRE_DU_CLAVIER, R.cs & 0xFFFF);
  });
}

// 0x8135C8 [0x135C8] — rendre le clavier : l'ancien vecteur 9.
function rendreLeClavier(jeu) {
  dansLeCadre(jeu, ['ebx', 'esi', 'edi', 'ebp'], 0, () => {
    jeu.appeler(POSER_UN_VECTEUR, 9, long(jeu, ANCIEN_CLAVIER), mot(jeu, ANCIEN_CLAVIER_SELECTEUR));
  });
}

// ================================================================================================
// 3. L'écran
// ================================================================================================

// 0x8102E8 [0x102E8] — passer en 320x200, la palette des morceaux lus (vide encore) posée.
function passerEnBasse(jeu) {
  dansLeCadre(jeu, ['ebp'], 0, () => jeu.appeler(PASSER_EN_BASSE, long(jeu, TAMPON_DE_PALETTE)));
}

// 0x8102FC [0x102FC] — rendre le mode vidéo trouvé au lancement (0x7E270).
function rendreLeMode(jeu) {
  dansLeCadre(jeu, ['ebp'], 0, () => jeu.appeler(MODE_D_ORIGINE));
}

// 0x813990 [0x13990] — passer en 320x200 (mode 13h) : la fonction 0Fh note d'abord le mode d'origine,
// s'il ne l'est pas déjà ; puis la palette, la plage de la souris (0x8155D8) et la fenêtre. C'est la
// fonction du jeu (0x7EC50, systeme.js), qui appelle ici la plage de la souris de l'introduction.
function passerEnBasseResolution(jeu, palette) {
  dansLeCadre(jeu, ['ebx', 'esi', 'edi', 'ebp'], 0x38, (cadre) => {
    const entree = cadre.local(0x1C), sortie = cadre.local(0x38);
    poserLong(jeu, entree, 0xF00);
    jeu.appeler(INT386, INT_VIDEO, entree, sortie);
    if (mot(jeu, MODE_TEXTE_D_ORIGINE) === 0) poserMot(jeu, MODE_TEXTE_D_ORIGINE, octet(jeu, sortie));
    poserLong(jeu, entree, 0x13);
    poserLong(jeu, PAS_LIGNE, 320);
    poserLong(jeu, HAUTEUR_ECRAN, 200);
    jeu.appeler(INT386, INT_VIDEO, entree, sortie);
    jeu.appeler(POSER_LA_PALETTE, palette);
    jeu.appeler(PLAGE_DE_LA_SOURIS);
    jeu.appeler(POSER_LA_FENETRE, 0, 0, 0x140, 0xC8);
  });
}

// 0x8155D8 [0x155D8] — la plage du pointeur de la souris (fonctions 7 et 8), selon le mode d'affichage
// du jeu (0xDE5F6, que l'introduction ne pose pas : aucune n'est réglée) : en 8, 0 à 0x1400 sur 0 à
// 0xF00 ; en 2 et 4, 0 à 640 sur 0 à 480 et 400 ; en 1, 0 à 640 sur 0 à 400. (La même que celle du
// jeu, 0x7E126, avec deux modes de plus.)
const PLAGES_DE_LA_SOURIS = new Map([[8, [0x1400, 0xF00]], [2, [0x280, 0x1E0]], [4, [0x280, 0x190]], [1, [0x280, 0x190]]]);
function plageDeLaSouris(jeu) {
  dansLeCadre(jeu, ['ebx', 'esi', 'edi', 'ebp'], 0x38, (cadre) => {
    const entree = cadre.local(0x1C), sortie = cadre.local(0x38);
    for (const [mode, [largeur, hauteur]] of PLAGES_DE_LA_SOURIS) {
      if (mot(jeu, MODE_AFFICHAGE) !== mode) continue;
      for (const [fonction, maximum] of [[7, largeur], [8, hauteur]]) {
        poserMot(jeu, entree, fonction);
        poserMot(jeu, entree + 8, 0);               // cx : le minimum
        poserMot(jeu, entree + 0xC, maximum);       // dx : le maximum
        jeu.appeler(INT386, INT_SOURIS, entree, sortie);
      }
    }
  });
}

// ================================================================================================
// 4. Le film
// ================================================================================================
//
// Le lecteur de films de Bullfrog, dans une version voisine de celle du jeu (0x60C44, son-du-jeu.js) :
// le même fichier FLC, les mêmes décodeurs ; mais le délai entre deux images se compte en tics de la
// minuterie (0x810010), l'image est toujours copiée telle quelle dans la fenêtre vidéo, la palette
// posée après chaque attente, et le script est le sien (0x810310).

// Lire `n` octets du film en `destination`.
const lireLeFilm = (jeu, destination, n) => jeu.appeler(LIRE_LE_FILM, long(jeu, FICHIER_DU_FILM), destination, n);

// 0x81064C [0x1064C] — jouer le film nommé en 0xBA7EC, avec son script : `interruptible`, une touche
// (0x6B2C0) ou le bouton (0x6B32E, jamais posé) l'arrêtent ; `palette` : 1, les palettes du film sont
// posées. Image par image : le script, le décodage, la palette, la copie dans la fenêtre vidéo (si le
// délai n'est pas nul), l'attente du délai, la palette posée. Le film est rejoué tant que 0x6AF32,
// qui vaut 1, n'est pas épuisé : il ne l'est donc qu'une fois. Tous les registres sont rendus.
function jouerLeFilm(jeu, interruptible, palette, script) {
  const R = jeu.T.R;
  // push ebp ; mov ebp, esp ; push eax, ebx, ecx, edx, edi, esi
  const cadre = ouvrir(jeu, ['ebp']);
  const gardes = { eax: R.eax, ebx: R.ebx, ecx: R.ecx, edx: R.edx, edi: R.edi, esi: R.esi };
  [R.eax, R.ebx, R.ecx, R.edx, R.edi, R.esi].forEach((v, k) => poserLong(jeu, cadre.ebp - 4 * (k + 1), v));
  poser(jeu, { esp: (cadre.ebp - 24) | 0 });
  try {
    poserMot(jeu, REPETITIONS, 1);
    poserMot(jeu, LIGNE_DU_SCRIPT, 0);
    poserLong(jeu, PALETTE_A_POSER, palette);
    for (;;) {
      const fichier = jeu.appeler(SOPEN, NOM_DU_FILM, 0x200, 0x40) | 0;    // O_BINARY, SH_DENYNO
      if (fichier <= 0) return;
      poserLong(jeu, FICHIER_DU_FILM, fichier);
      poserMot(jeu, IMAGE_DU_FILM, 0);
      poserMot(jeu, IMAGE_6AF2E, 0);
      jeu.appeler(SUIVRE_LE_SCRIPT, script);
      poserMot(jeu, TICS, 0);
      for (;;) {
        poser(jeu, { eax: 4 });
        lireLeFilm(jeu, TAILLE_DU_BLOC, 4);
        lireLeFilm(jeu, GENRE_DU_BLOC, 2);
        const genre = mot(jeu, GENRE_DU_BLOC);
        poser(jeu, { eax: (R.eax & ~0xFFFF) | genre });
        if (genre === 0xAF12) { jeu.appeler(LIRE_L_EN_TETE); continue; }
        if (genre !== 0xF1FA) break;
        const restantes = (mot(jeu, IMAGES_RESTANTES) - 1) & 0xFFFF;
        poserMot(jeu, IMAGES_RESTANTES, restantes);
        const image = (mot(jeu, IMAGE_DU_FILM) + 1) & 0xFFFF;
        poserMot(jeu, IMAGE_DU_FILM, image);
        poser(jeu, { eax: (R.eax & ~0xFFFF) | image });
        jeu.appeler(SUIVRE_LE_SCRIPT, script);
        jeu.appeler(DECODER_UNE_IMAGE);
        if (long(jeu, DELAI_ENTRE_IMAGES) !== 0) {
          if (mot(jeu, PALETTE_CHANGEE) === 1) {
            jeu.appeler(ATTENDRE_LE_BALAYAGE);
            jeu.appeler(POSER_LA_PALETTE_DU_FILM);
          }
          // push ecx, edi, esi ; rep movsd ; pop : ces trois registres sont rendus
          jeu.m8.copyWithin(FENETRE_VIDEO, long(jeu, SURFACE), long(jeu, SURFACE) + 64000);
        }
        jeu.appeler(ATTENDRE_LE_DELAI);
        const couleurs = long(jeu, PALETTE);
        poser(jeu, { esi: couleurs });
        jeu.appeler(POSER_LA_PALETTE, couleurs);
        poser(jeu, { eax: (R.eax & ~0xFFFF) | mot(jeu, IMAGES_RESTANTES) });
        if (mot(jeu, IMAGES_RESTANTES) === 0) break;
        if (interruptible !== 0 && (mot(jeu, BOUTON) !== 0 || octet(jeu, TOUCHE) !== 0)) poserMot(jeu, REPETITIONS, 0);
        if (mot(jeu, REPETITIONS) === 0) break;
      }
      jeu.appeler(CLOSE, long(jeu, FICHIER_DU_FILM));
      // Une attente active de 500 tours sur 0x6AF32, que rien ne peut changer pendant ce temps (bx
      // en garde le compte) ; puis une passe de moins.
      if (mot(jeu, REPETITIONS) === 0) { poser(jeu, { ebx: (R.ebx & ~0xFFFF) | 0x1F4 }); return; }
      poser(jeu, { ebx: R.ebx & ~0xFFFF });
      poserMot(jeu, REPETITIONS, mot(jeu, REPETITIONS) - 1);
      if (mot(jeu, REPETITIONS) === 0) return;
    }
  } finally {
    poser(jeu, gardes);
    cadre.fermer();
  }
}

// 0x8107F2 [0x107F2] — décoder une image du film : le nombre de ses morceaux, le reste de son en-tête,
// puis chaque morceau selon son genre (DECODEURS), lu en 0x6AF14. C'est celle du jeu (0x60E30), qui
// ne connaît pas la palette de 64 niveaux (genre 0xB). Registres : ceux que laissent les décodeurs,
// ax à zéro.
function decoderUneImage(jeu, R) {
  lireLeFilm(jeu, MORCEAUX_DE_L_IMAGE, 2);
  lireLeFilm(jeu, long(jeu, TAMPON_DU_FILM), 8);
  for (;;) {
    poser(jeu, { eax: (R.eax & ~0xFFFF) | mot(jeu, MORCEAUX_DE_L_IMAGE) });
    if (mot(jeu, MORCEAUX_DE_L_IMAGE) === 0) return;
    poserMot(jeu, MORCEAUX_DE_L_IMAGE, mot(jeu, MORCEAUX_DE_L_IMAGE) - 1);
    lireLeFilm(jeu, TAILLE_DU_BLOC, 4);
    lireLeFilm(jeu, GENRE_DU_BLOC, 2);
    const genre = mot(jeu, GENRE_DU_BLOC);
    poser(jeu, { eax: (R.eax & ~0xFFFF) | genre });
    jeu.appeler(DECODEURS.get(genre) ?? SAUTER_UN_BLOC);
  }
}

// 0x8109B2 [0x109B2] — poser la palette lue, si le film le demande : des paquets (couleurs sautées,
// nombre de couleurs — 0 pour 256 —, puis trois octets par couleur) reportés sur la palette du film,
// aussitôt posée. C'est celle du jeu (0x60FB9), sans l'attente du balayage, que le lecteur fait
// avant. esi est rendu ; edi reste derrière les paquets.
function poserLaPaletteDuFilm(jeu, R) {
  const esi = R.esi;
  poserLong(jeu, R.esp - 4, esi);                          // push esi
  poserMot(jeu, PALETTE_CHANGEE, 0);
  if (long(jeu, PALETTE_A_POSER) !== 1) return;
  const m8 = jeu.m8;
  let source = long(jeu, TAMPON_DE_PALETTE);
  let paquets = mot(jeu, source);
  source += 2;
  let couleur = long(jeu, PALETTE);
  let saut = 0;
  do {
    saut = m8[source++];
    couleur += 3 * saut;
    let n = m8[source++];
    do {
      m8[couleur++] = m8[source++];
      m8[couleur++] = m8[source++];
      m8[couleur++] = m8[source++];
      n = (n - 1) & 0xFF;
    } while (n !== 0);
    paquets = (paquets - 1) & 0xFFFF;
  } while (paquets !== 0);
  const couleurs = long(jeu, PALETTE);
  poser(jeu, {
    eax: R.eax & ~0xFFFF, ebx: R.ebx & ~0xFFFF, ecx: saut, edx: R.edx & ~0xFF, esi: couleurs, edi: source,
    esp: (R.esp - 4) | 0,
  });
  jeu.appeler(POSER_LA_PALETTE, couleurs);
  poser(jeu, { esi, esp: (R.esp + 4) | 0 });
}

// 0x810C2B [0x10C2B] — attendre que la minuterie ait compté le délai entre deux images (plus de
// 0xBA7E8 tics), puis remettre le compte à zéro. Rien de nul : aucune attente.
function attendreLeDelai(jeu, R) {
  if (long(jeu, DELAI_ENTRE_IMAGES) === 0) return;
  poserLong(jeu, R.esp - 4, R.eax);                        // push eax
  const eax = R.eax;
  poser(jeu, { esp: (R.esp - 4) | 0 });
  while (mot(jeu, TICS) <= longSigne(jeu, DELAI_ENTRE_IMAGES)) patienter(jeu);
  poserMot(jeu, TICS, 0);
  poser(jeu, { eax, esp: (R.esp + 4) | 0 });
}

// 0x810310 [0x10310] — exécuter les lignes du script dont le numéro est celui de l'image en cours.
// Une ligne : l'image (mot), la commande (une lettre, majuscule ou minuscule), l'argument (mot long).
//   A  le délai entre les images (en tics)       B  charger la banque de musique
//   E  charger la banque de bruitages (octet)    F  le volume d'un bruitage
//   L  lire le film d'avance, puis M             M  lancer un morceau
//   R  jouer un bruitage sans fin                S  jouer un bruitage ; 0 : tout arrêter
//   T  arrêter un bruitage ; 0 : tout arrêter    X  arrêter la musique
// Les autres lettres sont sautées. La même commande que celle des films du jeu (0x5FC16), avec F en
// plus, et l'argument pris sur ses quatre octets pour A, L, S et T (le jeu n'en prend que le mot bas).
function suivreLeScript(jeu, script) {
  dansLeCadre(jeu, ['ebx', 'ebp'], 0, () => {
    poser(jeu, { ebx: script });
    for (;;) {
      const ligne = (script + s16(mot(jeu, LIGNE_DU_SCRIPT)) * 7) | 0;
      if (mot(jeu, ligne) !== mot(jeu, IMAGE_DU_FILM)) return;
      const argument = long(jeu, ligne + 3), mot16 = s16(argument);
      const bruitages = octet(jeu, BRUITAGES_PRETS) !== 0;
      const c = octet(jeu, ligne + 2);
      const lettre = c >= 0x61 && c <= 0x7A ? c - 0x20 : c;
      switch (String.fromCharCode(lettre)) {
        case 'A': poserLong(jeu, DELAI_ENTRE_IMAGES, argument); break;
        case 'B': jeu.appeler(CHARGER_LA_BANQUE_DE_MUSIQUE, argument & 0xFFFF); break;
        case 'E': jeu.appeler(CHARGER_LA_BANQUE_DE_BRUITAGES, argument & 0xFF); break;
        case 'F': if (bruitages) jeu.appeler(VOLUME_D_UN_BRUITAGE, 0, mot16, 0); break;
        case 'L':
          if (long(jeu, TAMPON_DU_FILM_EN_MEMOIRE) !== 0) {
            jeu.appeler(LIRE_LE_FILM_D_AVANCE, long(jeu, FICHIER_DU_FILM), long(jeu, TAMPON_DU_FILM_EN_MEMOIRE), argument);
          }
          jeu.appeler(LANCER_UN_MORCEAU, mot16);
          break;
        case 'M': jeu.appeler(LANCER_UN_MORCEAU, mot16); break;
        case 'R': if (bruitages) jeu.appeler(JOUER_EN_BOUCLE, 0, mot16, -1); break;
        case 'S':
          if (bruitages) {
            if (argument !== 0) jeu.appeler(JOUER_UN_BRUITAGE, 0, mot16);
            else jeu.appeler(ARRETER_TOUS_LES_BRUITAGES);
          }
          break;
        case 'T':
          if (bruitages) {
            if (argument !== 0) jeu.appeler(ARRETER_UN_BRUITAGE, 0, mot16);
            else jeu.appeler(ARRETER_TOUS_LES_BRUITAGES);
          }
          break;
        case 'X': jeu.appeler(ARRETER_LA_MUSIQUE); break;
        default: break;
      }
      poserMot(jeu, LIGNE_DU_SCRIPT, mot(jeu, LIGNE_DU_SCRIPT) + 1);
    }
  });
}

// ================================================================================================
// 5. Les cartes son
// ================================================================================================
//
// Les deux cartes sont lues dans sndsetup.inf, dans le dossier du jeu (sa première ligne, les
// bruitages : « nom = carte port irq dma » ; la seconde, la musique : « nom = carte port »), puis dans
// les variables d'environnement BF_SOUND et BF_MUSIC, qui l'emportent — l'hôte les pose quand il
// déclare une carte (machine.js). La même lecture que celle du jeu (divers.js, 0x5F7D4 et 0x5FAB0),
// sur un autre fichier ; l'ouverture est celle du jeu (son-du-jeu.js, 0x6010C et 0x6058B).

const MUSIQUE_VOULUE = 0xBA715, BRUITAGES_VOULUS = 0xBA721;
const MINUTERIE_DE_SOS_OUVERTE = 0xBA71C;
const CARTE_DE_MUSIQUE = 0xD7914;       // son nom [0x4C17C]
const PORT_DE_LA_MUSIQUE = 0xD7910;     // [0x4C178]
const NOM_DE_LA_CARTE = 0x6B1D4;        // celui de la carte des bruitages [0x4C344]
const PORT_NUMERIQUE = 0xD7B64, IRQ_NUMERIQUE = 0xD7B4C, DMA_NUMERIQUE = 0xD7A68;
const PILOTE_MUSIQUE = 0xD7980;         // la poignée du pilote de musique
const MATERIEL_MIDI = 0xD7978;          // structure matériel de sosMIDIInitDriver : le port en +0
// La structure d'initialisation du pilote de musique, 0x4C150 dans INTRO.EXE : la carte en pose le
// début sur une variable du jeu (0xD78E6), ses champs +4 et +8, que l'introduction met à zéro, parmi
// ses données propres. Le pilote FM ne les lit pas.
const INIT_MIDI = 0xD78E6, INIT_MIDI_4 = 0x6B144, INIT_MIDI_8 = 0x6B148;
const INSTRUMENTS = 0xD798E, PERCUSSIONS = 0xD7988;    // pointeurs lointains : INST.BNK, DRUM.BNK
const BANQUES_FM_PRISES = 0xD7994, GENRE_DE_BANQUE = 0xD7995;
// Des octets d'état de la couche MIDI de Bullfrog, remis à zéro à l'ouverture (son-du-jeu.js).
const OCTETS_MIDI_A_ZERO = [0xC29F5, 0xC29FF, 0xC2A00, 0xC2A01, 0xC2A02, 0xC2A03, 0xC2A04, 0xC2A25,
  0xC2A2F, 0xC2A30, 0xC2A31, 0xC2A32, 0xC2A33, 0xC2A34, 0xC2A05, 0xC2A0F, 0xC2A10, 0xC2A11, 0xC2A12,
  0xC2A13, 0xC2A14];

// Les textes [dans INTRO.EXE].
const SNDSETUP = 0x6A688;                 // « sndsetup.inf » [0x40018]
const LECTURE = 0x6A698, LECTURE_2 = 0x6A77C;    // « r » [0x40028, 0x4010C]
const SANS_PILOTES_MUSIQUE = 0x6A69C;     // « Warning - No sound drivers defined. Run the 'Setup'
                                          //   program. » [0x4002C]
const SANS_PILOTES_BRUITAGES = 0x6A780;   // la même, « Run the 'Install' program. » [0x40110]
const AUCUNE = 0x6A6DC, AUCUNE_2 = 0x6A7C0;      // « none » [0x4006C, 0x40150]
const FORMAT_DE_LIGNE = 0x6A6E4, FORMAT_DE_LIGNE_2 = 0x6A7C8;   // « %s = %s %x %d %d »
const FORMAT_DE_LA_MUSIQUE = 0x6A6F8;     // « %s = %s %x » [0x40088]
const BF_MUSIC = 0x6A704, FORMAT_DE_BF_MUSIC = 0x6A710;          // « %s %x » [0x400A0]
const BF_SOUND = 0x6A7DC, FORMAT_DE_BF_SOUND = 0x6A7E8;          // « %s %x %d %d » [0x40178]
const CHEMIN_VIDE = 0x6A834;              // le dossier des pilotes : « » [0x401C4]
const ERREUR_SOS = 0x6A838;               // « \nError : %s\n » [0x401C8]
const INST_BNK = 0x6A848, SANS_INST = 0x6A858;   // « data\inst.bnk », « Unable to load inst.bnk. »
const DRUM_BNK = 0x6A87C, SANS_DRUM = 0x6A88C;   // « data\drum.bnk », « Unable to load drum.bnk. »
const SANS_MUSIQUE = 0x6A8B0;             // « \nError opening music files\n » [0x40240]
// Les cartes de musique et leur pilote de SOS : la puce FM (0xA002), la Roland (0xA004), l'AWE32
// (0xA008), le General MIDI (0xA001). Toutes comparées sans égard à la casse ; une autre carte, rien.
const CARTES_DE_MUSIQUE = [
  [0x6A718, 0xA002], [0x6A720, 0xA002], [0x6A728, 0xA002], [0x6A730, 0xA002],  // ADLIB SBLAST SBPRO ADLIBG
  [0x6A738, 0xA002], [0x6A740, 0xA002], [0x6A748, 0xA002], [0x6A750, 0xA002],  // SB16FM GRAVIS PASFM COMPATIBLE
  [0x6A75C, 0xA004], [0x6A764, 0xA008], [0x6A76C, 0xA001], [0x6A774, 0xA001],  // ROLAND SBAWE32 GENERAL WBLAST
];
// Les liens de l'ouverture des bruitages (son-du-jeu.js, BRUITAGES_DU_JEU) : les noms des cartes
// numériques [0x4025C à 0x402BC], les messages, le nom de la carte, la structure de la détection
// [0x4C2D8] et le pilote demandé [0x4C33C].
const BRUITAGES = {
  noms: [0x6A8CC, 0x6A8D4, 0x6A8DC, 0x6A8E4, 0x6A8EC, 0x6A8F8, 0x6A904, 0x6A90C, 0x6A914, 0x6A91C, 0x6A92C],
  moinsBien: 0x6A938, aucun: 0x6A98C, erreur: 0x6A9B8, cheminVide: 0x6A9B4,
  nomDeLaCarte: NOM_DE_LA_CARTE, capacites: 0x6B168, piloteDemande: 0x6B1CC,
};

// Les fonctions du jeu, et celles de l'introduction.
const FOPEN = 0x83023, FSCANF = 0x83155, FCLOSE = 0x83175, GETENV = 0x832F5, SSCANF = 0x833A5;
const STRICMP = 0x833D8, MESSAGE = 0x7E83E;
const TIMER_INIT_SYSTEM = 0x821FC, TIMER_UNINIT_SYSTEM = 0x822C1;
const MIDI_INIT_SYSTEM = 0x83FC6, MIDI_INIT_DRIVER = 0x816A78, MIDI_UNINIT_DRIVER = 0x84639;
const MIDI_UNINIT_SYSTEM = 0x84162, MIDI_SET_INS_DATA = 0x8564A, TEXTE_D_ERREUR_SOS = 0x84843;
const TAILLE_DECOMPRESSEE = 0x7F4B0, OUVRIR_UN_FICHIER = 0x7EB70, LIRE_UN_FICHIER = 0x7EBE0;
const FERMER_UN_FICHIER = 0x7EC20;
const OUVRIR_LA_MUSIQUE = 0x8111E0, CHARGER_UN_FICHIER_ENTIER = 0x8114D4, OUVRIR_LES_BRUITAGES = 0x812650;

// « none » recopié (movsd, movsb) dans les deux noms de carte, faute de sndsetup.inf, après
// l'avertissement ; esi et edi restent derrière la seconde copie.
function sansFichier(jeu, avertissement, aucune) {
  poser(jeu, { edi: CARTE_DE_MUSIQUE, esi: aucune });
  jeu.appeler(MESSAGE, avertissement);
  jeu.m8.copyWithin(CARTE_DE_MUSIQUE, aucune, aucune + 5);
  jeu.m8.copyWithin(NOM_DE_LA_CARTE, aucune, aucune + 5);
  poser(jeu, { edi: NOM_DE_LA_CARTE + 5, esi: aucune + 5 });
}

// 0x810C50 [0x10C50] — la carte de musique : le chemin de sndsetup.inf fait (le dossier du jeu, suivi
// du nom — il le reste pour 0x810EC0), sa seconde ligne lue, puis BF_MUSIC. « none » éteint la
// musique ; une carte connue l'ouvre (0x8111E0) avec son pilote.
function lireLaCarteDeMusique(jeu) {
  dansLeCadre(jeu, ['ebx', 'esi', 'edi', 'ebp'], 0x68, (cadre) => {
    const esi = copierLaChaine(jeu, SNDSETUP, finDeLaChaine(jeu, DOSSIER_DU_JEU));
    poser(jeu, { esi, edi: DOSSIER_DU_JEU });
    const flot = jeu.appeler(FOPEN, DOSSIER_DU_JEU, LECTURE);
    poser(jeu, { ebx: flot });
    if (flot === 0) {
      sansFichier(jeu, SANS_PILOTES_MUSIQUE, AUCUNE);
    } else {
      const texte = cadre.local(0x68), nombre = cadre.local(4);
      jeu.appeler(FSCANF, flot, FORMAT_DE_LIGNE, texte, texte, nombre, nombre, nombre);   // les bruitages
      jeu.appeler(FSCANF, flot, FORMAT_DE_LA_MUSIQUE, texte, CARTE_DE_MUSIQUE, PORT_DE_LA_MUSIQUE);
      jeu.appeler(FCLOSE, flot);
    }
    const variable = jeu.appeler(GETENV, BF_MUSIC);
    if (variable !== 0) jeu.appeler(SSCANF, variable, FORMAT_DE_BF_MUSIC, CARTE_DE_MUSIQUE, PORT_DE_LA_MUSIQUE);
    if (jeu.appeler(STRICMP, CARTE_DE_MUSIQUE, AUCUNE) === 0) {
      poserOctet(jeu, MUSIQUE_PRETE, 0);
      poserOctet(jeu, MUSIQUE_VOULUE, 0);
    }
    if (octet(jeu, MUSIQUE_PRETE) === 0) return;
    for (const [nom, pilote] of CARTES_DE_MUSIQUE) {
      if (jeu.appeler(STRICMP, CARTE_DE_MUSIQUE, nom) !== 0) continue;
      jeu.appeler(OUVRIR_LA_MUSIQUE, pilote);
      return;
    }
  });
}

// 0x810EC0 [0x10EC0] — la carte des bruitages : la première ligne de sndsetup.inf (nom, port, irq,
// dma), puis BF_SOUND. « none » éteint les bruitages ; sinon ils sont ouverts (0x812650).
function lireLaCarteDeBruitages(jeu) {
  dansLeCadre(jeu, ['ebx', 'esi', 'edi', 'ebp'], 0x64, (cadre) => {
    const flot = jeu.appeler(FOPEN, DOSSIER_DU_JEU, LECTURE_2);
    poser(jeu, { ebx: flot });
    if (flot === 0) {
      sansFichier(jeu, SANS_PILOTES_BRUITAGES, AUCUNE_2);
    } else {
      jeu.appeler(FSCANF, flot, FORMAT_DE_LIGNE_2, cadre.local(0x64), NOM_DE_LA_CARTE, PORT_NUMERIQUE,
        IRQ_NUMERIQUE, DMA_NUMERIQUE);
      jeu.appeler(FCLOSE, flot);
    }
    const variable = jeu.appeler(GETENV, BF_SOUND);
    if (variable !== 0) {
      jeu.appeler(SSCANF, variable, FORMAT_DE_BF_SOUND, NOM_DE_LA_CARTE, PORT_NUMERIQUE, IRQ_NUMERIQUE, DMA_NUMERIQUE);
    }
    if (jeu.appeler(STRICMP, NOM_DE_LA_CARTE, AUCUNE_2) === 0) {
      poserOctet(jeu, BRUITAGES_PRETS, 0);
      poserOctet(jeu, BRUITAGES_VOULUS, 0);
    }
    if (octet(jeu, BRUITAGES_PRETS) !== 0) jeu.appeler(OUVRIR_LES_BRUITAGES);
  });
}

// L'erreur d'une fonction de SOS, écrite (« Error : texte »).
function signalerErreurSos(jeu, erreur) {
  jeu.appeler(MESSAGE, ERREUR_SOS, jeu.appeler(TEXTE_D_ERREUR_SOS, erreur));
}
// La musique éteinte après une erreur : le pilote défait s'il est installé, SOS fermé.
function eteindreLaMusique(jeu, piloteInstalle) {
  if (piloteInstalle) jeu.appeler(MIDI_UNINIT_DRIVER, long(jeu, PILOTE_MUSIQUE), 1);
  jeu.appeler(MIDI_UNINIT_SYSTEM);
  jeu.appeler(TIMER_UNINIT_SYSTEM, 0);
  poserOctet(jeu, MUSIQUE_PRETE, 0);
  poserOctet(jeu, MUSIQUE_VOULUE, 0);
}

// 0x8111E0 [0x111E0] — ouvrir la musique avec le pilote `pilote` : la minuterie de SOS,
// sosMIDIInitSystem, sosMIDIInitDriver (0x816A78) sur le port lu ; pour la puce FM, les banques
// d'instruments INST.BNK et DRUM.BNK (sosMIDISetInsData) ; enfin la banque de musique 0. Chaque
// erreur éteint la musique. La même que celle du jeu (0x6010C), avec son anomalie : un échec de
// sosMIDISetInsData pour INST.BNK éteint la musique, mais DRUM.BNK est encore chargé et passé au
// pilote fermé.
function ouvrirLaMusique(jeu, pilote) {
  const R = jeu.T.R;
  dansLeCadre(jeu, ['ebp'], 0, () => {
    for (const a of OCTETS_MIDI_A_ZERO) poserOctet(jeu, a, 0);
    jeu.appeler(TIMER_INIT_SYSTEM, 0xFF00, 0);
    poserOctet(jeu, MINUTERIE_DE_SOS_OUVERTE, 1);
    const ds = R.ds & 0xFFFF;
    jeu.appeler(MIDI_INIT_SYSTEM, CHEMIN_VIDE, ds, 0);
    poserMot(jeu, INIT_MIDI_8, 0);
    poserLong(jeu, INIT_MIDI_4, 0);
    poserLong(jeu, MATERIEL_MIDI, long(jeu, PORT_DE_LA_MUSIQUE));
    const erreur = jeu.appeler(MIDI_INIT_DRIVER, pilote, MATERIEL_MIDI, ds, INIT_MIDI, ds, PILOTE_MUSIQUE, ds);
    if (erreur !== 0) {
      signalerErreurSos(jeu, erreur);
      eteindreLaMusique(jeu, false);
      return;
    }
    switch (pilote >>> 0) {
      case 0xA002:
        for (const [nom, place, echec] of [[INST_BNK, INSTRUMENTS, SANS_INST], [DRUM_BNK, PERCUSSIONS, SANS_DRUM]]) {
          const decalage = jeu.appeler(CHARGER_UN_FICHIER_ENTIER, nom) >>> 0;
          const selecteur = R.edx & 0xFFFF;
          poserMot(jeu, place + 4, selecteur);
          poserLong(jeu, place, decalage);
          if (decalage === 0 && selecteur === 0) {
            jeu.appeler(MESSAGE, echec);
            poserOctet(jeu, MUSIQUE_PRETE, 0);
            poserOctet(jeu, MUSIQUE_VOULUE, 0);
            break;
          }
          const refus = jeu.appeler(MIDI_SET_INS_DATA, long(jeu, PILOTE_MUSIQUE), decalage, selecteur, 1);
          if (refus !== 0) {
            signalerErreurSos(jeu, refus);
            eteindreLaMusique(jeu, true);
          }
        }
        if (octet(jeu, MUSIQUE_PRETE) !== 0) {
          poserOctet(jeu, BANQUES_FM_PRISES, 1);
          poserOctet(jeu, GENRE_DE_BANQUE, 0);
        }
        break;
      case 0xA004: poserOctet(jeu, BANQUES_FM_PRISES, 0); poserOctet(jeu, GENRE_DE_BANQUE, 1); break;
      case 0xA001: case 0xA008: poserOctet(jeu, BANQUES_FM_PRISES, 0); poserOctet(jeu, GENRE_DE_BANQUE, 2); break;
      default: break;
    }
    if (octet(jeu, MUSIQUE_PRETE) === 0) return;
    if (jeu.appeler(CHARGER_LA_BANQUE_DE_MUSIQUE, 0) !== 0) {
      jeu.appeler(MESSAGE, SANS_MUSIQUE);
      eteindreLaMusique(jeu, true);
    }
  });
}

// 0x8114D4 [0x114D4] — charger un fichier entier (sa taille décompressée, 0x7F4B0) dans un bloc du tas
// du jeu ; rend un pointeur lointain, décalage dans eax et sélecteur (celui des données) dans edx, ou
// 0:0. ebx garde la taille, esi le descripteur, edi le bloc. Anomalies, comme celle du jeu (0x604D9) :
// le fichier est fermé même s'il n'a pas pu être ouvert (descripteur -1) ; une lecture incomplète
// perd le bloc.
function chargerUnFichierEntier(jeu, nom) {
  const R = jeu.T.R;
  let decalage = 0, selecteur = 0;
  dansLeCadre(jeu, ['ebx', 'esi', 'edi', 'ebp'], 0xC, (cadre) => {
    poserLong(jeu, cadre.local(4), 0);
    poser(jeu, { edi: 0 });
    const taille = jeu.appeler(TAILLE_DECOMPRESSEE, nom) | 0;
    poserLong(jeu, cadre.local(8), 0);
    poser(jeu, { ebx: taille });
    let bloc = 0;
    if (taille > 0) {
      const fichier = jeu.appeler(OUVRIR_UN_FICHIER, nom, 0x200) | 0;
      poser(jeu, { esi: fichier });
      poserLong(jeu, cadre.local(0xC), fichier);
      if (fichier !== -1) {
        bloc = jeu.appeler(ALLOUER, taille) >>> 0;
        poser(jeu, { edi: bloc });
        if (bloc !== 0 && (jeu.appeler(LIRE_UN_FICHIER, fichier, bloc, taille) | 0) !== taille) {
          bloc = 0;
          poser(jeu, { edi: 0 });
        }
      }
      jeu.appeler(FERMER_UN_FICHIER, long(jeu, cadre.local(0xC)));
    }
    if (bloc !== 0) {
      poserMot(jeu, cadre.local(4), R.ds);
      poserLong(jeu, cadre.local(8), bloc);
    }
    selecteur = long(jeu, cadre.local(4));
    decalage = long(jeu, cadre.local(8));
  });
  poser(jeu, { edx: selecteur });
  return decalage;
}

// ================================================================================================
// 6. La sortie
// ================================================================================================

// 0x8138D0 [0x138D0] — rendre les blocs de mémoire du DOS de la table 0xDEDC8 (ceux que SOS a pris
// pour ses tampons) : un bloc qui a un sélecteur est rendu au DOS (0x8A7FC), un autre au tas
// (0x8B8E8), et l'entrée est vidée. eax reste sur l'entrée finale, celle dont le drapeau est nul
// (`main` le rend : le code de sortie de l'introduction en est l'octet bas).
function rendreLesBlocsDos(jeu) {
  const R = jeu.T.R;
  dansLeCadre(jeu, ['ebx', 'esi', 'edi', 'ebp'], 4, (cadre) => {
    let entree = BLOCS_DOS;
    for (;;) {
      poserLong(jeu, cadre.local(4), entree);
      if (long(jeu, entree + 8) === 0) break;
      if (long(jeu, entree + 4) !== 0) jeu.appeler(RENDRE_MEMOIRE_DOS, mot(jeu, entree + 4));
      else jeu.appeler(LIBERER_MEMOIRE, long(jeu, entree));
      poserLong(jeu, entree + 8, 0);
      poserLong(jeu, entree, 0);
      poserLong(jeu, entree + 4, 0);
      entree += 0xC;
    }
    poser(jeu, { eax: entree });
  });
  return R.eax;
}

export const reecritures = [
  // 0x811554 [0x11554] — le point d'entrée, celui du jeu (0x7E2CC) ; 0x818246 [0x18246] — `__CMain`
  // (0x87274) ; 0x823153 [0x23153] — l'erreur des flottants (0x8FBC7), qu'un crochet de printf désigne.
  { adresse: 0x811554, nom: 'pointDEntreeDeLIntroduction', fn: (jeu, R) => pointDEntree(jeu, R, LIENS), convention: 'brute' },
  { adresse: 0x818246, nom: 'cMainDeLIntroduction', fn: (jeu, R) => cMain(jeu, R, LIENS), convention: 'brute' },
  { adresse: 0x823153, nom: 'pasDeFlottantsDeLIntroduction', fn: (jeu, R) => pasDeFlottants(jeu, R, LIENS), convention: 'brute' },
  { adresse: 0x810110, nom: 'principal', fn: principal, arguments: 2 },
  { adresse: 0x810010, nom: 'unTic', fn: unTic, convention: 'registres', nettoie: 4 },
  { adresse: 0x81001C, nom: 'gestionnaireDeLaMinuterie', fn: gestionnaireDeLaMinuterie, convention: 'brute' },
  { adresse: 0x810078, nom: 'prendreLaMinuterie', fn: prendreLaMinuterie },
  { adresse: 0x8100E0, nom: 'rendreLaMinuterie', fn: rendreLaMinuterie },
  { adresse: 0x81A8E9, nom: 'lireUnPort', fn: lireUnPort, arguments: 1, retour: true },
  { adresse: 0x813440, nom: 'gestionnaireDuClavier', fn: gestionnaireDuClavier, convention: 'brute' },
  { adresse: 0x81355C, nom: 'prendreLeClavier', fn: prendreLeClavier },
  { adresse: 0x8135C8, nom: 'rendreLeClavier', fn: rendreLeClavier },
  { adresse: 0x8102E8, nom: 'passerEnBasse', fn: passerEnBasse },
  { adresse: 0x8102FC, nom: 'rendreLeMode', fn: rendreLeMode },
  { adresse: 0x813990, nom: 'passerEnBasseResolution', fn: passerEnBasseResolution, arguments: 1 },
  { adresse: 0x8155D8, nom: 'plageDeLaSouris', fn: plageDeLaSouris },
  { adresse: 0x81064C, nom: 'jouerLeFilm', fn: jouerLeFilm, arguments: 3 },
  { adresse: 0x8107F2, nom: 'decoderUneImage', fn: decoderUneImage, convention: 'registres' },
  { adresse: 0x8109B2, nom: 'poserLaPaletteDuFilm', fn: poserLaPaletteDuFilm, convention: 'registres' },
  { adresse: 0x810C2B, nom: 'attendreLeDelai', fn: attendreLeDelai, convention: 'registres' },
  { adresse: 0x810310, nom: 'suivreLeScript', fn: suivreLeScript, arguments: 1 },
  { adresse: 0x8138D0, nom: 'rendreLesBlocsDos', fn: rendreLesBlocsDos, retour: true },
  { adresse: 0x810C50, nom: 'lireLaCarteDeMusique', fn: lireLaCarteDeMusique },
  { adresse: 0x810EC0, nom: 'lireLaCarteDeBruitages', fn: lireLaCarteDeBruitages },
  { adresse: 0x8111E0, nom: 'ouvrirLaMusique', fn: ouvrirLaMusique, arguments: 1 },
  { adresse: 0x8114D4, nom: 'chargerUnFichierEntier', fn: chargerUnFichierEntier, arguments: 1, retour: true },
  // 0x812650 [0x12650] — ouvrir les bruitages : celle du jeu (0x6058B), avec les liens de l'introduction.
  { adresse: 0x812650, nom: 'ouvrirLesBruitagesDeLIntroduction', fn: (jeu) => ouvrirLesBruitages(jeu, BRUITAGES) },
];
