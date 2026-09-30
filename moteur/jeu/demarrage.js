// Le démarrage du programme et les routines en assembleur qui ne se comportent pas comme des
// fonctions : le point d'entrée de la bibliothèque C de Watcom, `__CMain`, ses erreurs fatales, le
// gestionnaire de l'IRQ 0 de SOS et son chaînage vers l'ancien gestionnaire.
//
// Tant que la transcription mécanique tournait sous le code lisible, ces routines restaient les
// siennes : elles ne rendent pas la main par un `ret` à leur appelant (le point d'entrée, `__CMain`
// et les erreurs fatales finissent par le service 4Ch du DOS ; le gestionnaire, par `iretd` ; le
// chaînage change de pile), et la comparaison appel par appel ne sait pas les éprouver seules. Le
// moteur autonome (moteur/hote/processeur.js) n'a plus de transcription : elles sont réécrites ici,
// instruction par instruction quand il le faut, avec les mêmes effets sur la mémoire et sur les
// registres que la transcription. Leur preuve est le rejeu comparé de parties entières
// (moteur/node/verifier.mjs --autonome) : la même partie jouée avec la transcription et sans elle ;
// pour les erreurs fatales, qu'aucune partie n'atteint, la même fin provoquée des deux côtés
// (moteur/node/eprouver-fins.mjs).
//
// La convention 'brute' : la routine reçoit les registres R et fait elle-même son retour (`ret`,
// `retf`, `iretd`), sans que l'enveloppe touche au pointeur de pile.
//
// Voir docs/retro-ingenierie.md, § 12 (le démarrage de Watcom) et § 9 (la minuterie de SOS).

// --- La mémoire -------------------------------------------------------------------------------------
const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// La pile du jeu, par R.esp.
function empiler(jeu, R, v) {
  R.esp = (R.esp - 4) | 0;
  poserLong(jeu, R.esp, v);
}
function depiler(jeu, R) {
  const v = long(jeu, R.esp) | 0;
  R.esp = (R.esp + 4) | 0;
  return v;
}
// `call adresse` : l'adresse de retour de l'original empilée, puis l'appelée, qui la retire. Sur une
// transcription (l'introduction, verifier-intro.mjs --lisible), ses registres sont d'abord chargés
// de R, puis relus : le moteur autonome n'a que R, et `charger` et `sauver` n'y font rien.
function appelerDepuis(jeu, R, retour, adresse) {
  empiler(jeu, R, retour);
  jeu.T.charger();
  jeu.T.appeler(adresse);
  jeu.T.sauver();
}
// Un service du DOS ou du BIOS, rendu par l'hôte sur les registres R (les registres d'une
// transcription chargés avant, pour un gestionnaire transcrit qu'il livrerait, et après).
const servir = (jeu, n) => { jeu.T.charger(); jeu.machine.interruption(n); jeu.T.charger(); };
// L'adresse linéaire d'un décalage dans un segment.
const lineaire = (jeu, selecteur, decalage) => (jeu.machine.base(selecteur) + (decalage >>> 0)) >>> 0;

// --- Les variables de la bibliothèque C (runtime.js les nomme aussi) ---------------------------------
const PILE_AU_DEPART = 0xC2D4C;         // esp au point d'entrée
const LIMITE_SEGMENT = 0xC2D38;         // limite du segment de données + 1
const SELECTEUR_PSP = 0xC2D44;          // mot : le sélecteur du PSP (0x24 d'abord, celui de DOS/4GW ensuite)
const VERSION_DOS = 0xC2D6E;            // octets : version majeure puis mineure du DOS
const EXTENDEUR = 0xC2D66;              // octet : 1 pour DOS/4GW
const PHAR_LAP = 0xBECD0;               // mot : le sélecteur que rend l'extendeur dans gs
const PARAMETRES_EXTENDEUR = 0xBECCC;
const SELECTEUR_DES_DONNEES = 0x7E340;  // mot, dans le code : le ds du programme, pour ses gestionnaires
const BLOC_ENVIRONNEMENT = 0xC2D68;     // pointeur lointain (décalage, sélecteur) vers l'environnement
const SELECTEUR_ENVIRONNEMENT = 0xC2D6C;
const LIGNE_DE_COMMANDE = 0xE133C;      // (arrondie à 16) : la ligne de commande recopiée
const PAS_DE_87 = 0xC2D64;              // mot : « no87= » trouvé dans l'environnement
const BAS_DE_PILE = 0xC2D48;            // _STACKLOW
const PILE_APRES_ARGUMENTS = 0xC2D34;
const DEBUT_DU_BSS = 0xCC808;           // les variables non initialisées, mises à zéro
const FIN_DU_BSS = 0xE133C;
const LIGNE = 0xC2D3C, NOM_DU_PROGRAMME = 0xC2D40;
const TAILLE_DE_LA_PILE = 0xC2D50, HAUT_DE_LA_RESERVE = 0xC2D54;
const ARGV_MAIN = 0xE1328, ARGC_MAIN = 0xE132C;

// Les fonctions appelées.
const INITIALISATIONS = 0x872C4;        // '__InitRtns' (runtime.js)
const PILE_DISPONIBLE = 0x8F440;        // 'stackavail' (runtime.js)
const PAS_DU_TAS = 0x8F449;             // _amblksiz (runtime.js)
const ROUTINES_DE_FIN = 0x87307;        // '__FiniRtns' (sortie.js)
const REPRENDRE_DS = 0x7E570;           // '__GETDS' (systeme.js)

// Les liens : ce que l'éditeur de liens a fixé dans MAIN.EXE autour du démarrage — `__CMain` et le
// `main` du jeu, les trois vecteurs de nettoyage (qui montrent tous 0x7E2A0, un `ret`), la console
// (« con », 0x7E342, dans le code) et le message des flottants, et les adresses de retour des appels
// (la place des instructions qui les suivent). L'introduction, liée à la même bibliothèque, a les
// siens (intro.js) : le même code, à d'autres adresses.
export const LIENS_DU_JEU = {
  cMain: 0x87274, main: 0x10010, nettoyages: [0xBECC0, 0xBECC4, 0xBECC8],
  console: 0x7E342, pasDeFlottants: 0xB0A14,
  retours: {
    initialisations: 0x7E534, cMain: 0x7E53B,                    // le point d'entrée
    pileDisponible: 0x87289, pasDuTas: 0x872A9, main: 0x872BA,   // __CMain
    nettoyages: [0x7E2AA, 0x7E2B0, 0x7E2BC, 0x7E2C2],            // exit
    routinesDeFin: 0x7E569,                                      // la fin commune
  },
};

// ================================================================================================
// 1. Le point d'entrée
// ================================================================================================

// 0x7E2CC — le point d'entrée du programme ('_cstart_' de Watcom), où l'hôte le lance, les registres
// posés comme DOS/4GW les laissait : esp en haut de la pile, ds et ss sur les données, es sur le PSP.
// Le code commence par un saut par-dessus la marque de Watcom (« WATCOM C/C++32 Run-Time system »,
// en 0x7E2CE), puis :
//  - la pile alignée, sa hauteur notée ; la version du DOS demandée (service 30h, ebx = « PHAR ») ;
//  - l'extendeur reconnu : ni Phar Lap (« DX ») ni le mode d'Intel (« BC »), le service FF00h de
//    DOS/4GW répond (al non nul) : c'est lui, l'octet 0xC2D66 vaut 1 ;
//  - le sélecteur des données rangé dans le code (0x7E340), où les gestionnaires d'interruption le
//    reprennent (0x7E570) ;
//  - la ligne de commande du PSP recopiée en 0xE1340 (sans ses blancs de tête), suivie de deux zéros,
//    puis le nom du programme, pris à la fin de l'environnement ; « no87= » y est cherché au passage ;
//  - les variables non initialisées remises à zéro — 4 Ko seulement sous DOS/4GW, qui a déjà vidé
//    le reste ;
//  - les routines d'initialisation (0x872C4), puis `__CMain` (0x87274), qui ne revient pas.
// Les autres extendeurs ne sont pas réécrits : l'hôte est DOS/4GW (machine.js, service FF00h).
// `L` : les liens du programme (LIENS_DU_JEU, ou ceux de l'introduction).
export function pointDEntree(jeu, R, L = LIENS_DU_JEU) {
  const m = jeu.machine;
  R.IF = true;                                             // sti
  R.esp = R.esp & -4;                                      // and esp, ~3
  poserLong(jeu, PILE_AU_DEPART, R.esp);
  poserLong(jeu, LIMITE_SEGMENT, R.esp);
  R.eax = (R.eax & -65536) | 0x24;                         // mov ax, 0x24
  poserMot(jeu, SELECTEUR_PSP, R.eax);
  // la version du DOS
  R.ebx = 0x50484152;                                      // « PHAR »
  R.eax = 0x3000;
  servir(jeu, 0x21);
  poserOctet(jeu, VERSION_DOS, R.eax);
  poserOctet(jeu, VERSION_DOS + 1, R.eax >> 8);
  R.ecx = R.eax;
  R.esi = 0;
  R.edi = 0x81;
  R.eax = (R.eax >>> 16) | 0;
  if ((R.eax & 0xFFFF) === 0x4458 || (R.eax & 0xFFFF) === 0x4243) {
    throw new Error('0x7E2CC : extendeur Phar Lap ou Intel, non réécrit (l\'hôte est DOS/4GW)');
  }
  // DOS/4GW ?
  R.edx = (R.edx & -65536) | 0x78;
  R.eax = (R.eax & -65536) | 0xFF00;
  servir(jeu, 0x21);
  if ((R.eax & 0xFF) === 0) {
    throw new Error('0x7E2CC : pas d\'extendeur connu, non réécrit (l\'hôte est DOS/4GW)');
  }
  R.eax = R.gs;                                            // mov eax, gs
  if ((R.eax & 0xFFFF) !== 0) poserMot(jeu, PHAR_LAP, R.eax);
  R.eax = (R.eax & -256) | 1;                              // mov al, 1
  R.ebx = R.ds;
  poserMot(jeu, SELECTEUR_PSP, R.es);
  R.ecx = (R.ecx & -65536) | mot(jeu, lineaire(jeu, R.es, 0x2C));   // l'environnement, PSP:[0x2C]
  // 0x7E447 : commun à tous les extendeurs
  poserOctet(jeu, EXTENDEUR, R.eax);
  R.es = R.ebx & 0xFFFF;
  poserMot(jeu, lineaire(jeu, R.es, SELECTEUR_DES_DONNEES), R.ds);
  poserLong(jeu, BLOC_ENVIRONNEMENT, R.esi);
  poserMot(jeu, SELECTEUR_ENVIRONNEMENT, R.ecx);
  empiler(jeu, R, R.esi);
  R.es = mot(jeu, SELECTEUR_PSP);
  R.edx = ((LIGNE_DE_COMMANDE + 0xF) & -256) | ((LIGNE_DE_COMMANDE + 0xF) & 0xF0);
  // la ligne de commande : sauter ses blancs (repe scasb), puis la recopier (rep movsb)
  R.ecx = 0;
  let zf = true;                                           // sub ecx, ecx
  R.ecx = octet(jeu, lineaire(jeu, R.es, R.edi - 1));      // sa longueur, PSP:[0x80]
  R.DF = false;
  R.eax = (R.eax & -256) | 0x20;
  while (R.ecx !== 0) {
    const c = octet(jeu, lineaire(jeu, R.es, R.edi));
    R.edi = (R.edi + 1) | 0;
    R.ecx = (R.ecx - 1) | 0;
    zf = c === 0x20;
    if (!zf) break;
  }
  R.esi = (R.edi - 1) | 0;
  R.edi = R.edx;
  R.ebx = R.es;
  R.edx = R.ds;
  R.ds = R.ebx & 0xFFFF;                                   // ds : le PSP
  R.es = R.edx & 0xFFFF;                                   // es : les données
  if (!zf) {
    R.ecx = (R.ecx + 1) | 0;
    for (; R.ecx !== 0; R.ecx = (R.ecx - 1) | 0) {
      poserOctet(jeu, lineaire(jeu, R.es, R.edi), octet(jeu, lineaire(jeu, R.ds, R.esi)));
      R.esi = (R.esi + 1) | 0;
      R.edi = (R.edi + 1) | 0;
    }
  }
  // 0x7E495 : deux zéros
  R.eax = R.eax & -256;
  for (let k = 0; k < 2; k++) { poserOctet(jeu, lineaire(jeu, R.es, R.edi), 0); R.edi = (R.edi + 1) | 0; }
  R.esi = depiler(jeu, R);
  R.edi = (R.edi - 1) | 0;
  empiler(jeu, R, R.edi);
  empiler(jeu, R, R.edx);
  R.ds = mot(jeu, lineaire(jeu, R.es, SELECTEUR_ENVIRONNEMENT));
  R.ebp = 0;
  // l'environnement : « no87= » compté, chaque chaîne sautée jusqu'au double zéro
  for (;;) {
    const quatre = (jeu.dv.getInt32(lineaire(jeu, R.ds, R.esi), true) | 0x20202020) | 0;
    R.eax = quatre;
    if (quatre === 0x37386F6E && octet(jeu, lineaire(jeu, R.ds, R.esi + 4)) === 0x3D) R.ebp = (R.ebp + 1) | 0;
    for (;;) {                                             // cmp [esi], 0 ; lodsb ; jne
      const c = octet(jeu, lineaire(jeu, R.ds, R.esi));
      R.eax = (R.eax & -256) | c;
      R.esi = (R.esi + 1) | 0;
      if (c === 0) break;
    }
    if (octet(jeu, lineaire(jeu, R.ds, R.esi)) === 0) break;
  }
  // le double zéro, puis le compte (un mot), puis le nom du programme, recopié avec son zéro
  R.eax = (R.eax & -256) | octet(jeu, lineaire(jeu, R.ds, R.esi));
  R.esi = (R.esi + 3) | 0;
  for (;;) {                                               // cmp [esi], 0 ; movsb ; jne
    const c = octet(jeu, lineaire(jeu, R.ds, R.esi));
    poserOctet(jeu, lineaire(jeu, R.es, R.edi), c);
    R.esi = (R.esi + 1) | 0;
    R.edi = (R.edi + 1) | 0;
    if (c === 0) break;
  }
  R.ds = depiler(jeu, R) & 0xFFFF;
  R.esi = depiler(jeu, R);
  R.ebx = R.esp;
  poserMot(jeu, PAS_DE_87, R.ebp);
  poserLong(jeu, BAS_DE_PILE, R.edi);
  poserLong(jeu, PILE_APRES_ARGUMENTS, R.ebx);
  // les variables non initialisées : 4 Ko au plus sous DOS/4GW
  R.ecx = (FIN_DU_BSS - DEBUT_DU_BSS) | 0;
  R.edi = DEBUT_DU_BSS;
  if (octet(jeu, EXTENDEUR) === 1 && (R.ecx >>> 0) > 0x1000) R.ecx = 0x1000;
  R.edx = (R.edx & -256) | (R.ecx & 0xFF);
  R.ecx = (R.ecx >>> 2) | 0;
  R.eax = 0;
  for (; R.ecx !== 0; R.ecx = (R.ecx - 1) | 0) { poserLong(jeu, lineaire(jeu, R.es, R.edi), 0); R.edi = (R.edi + 4) | 0; }
  R.ecx = (R.ecx & -256) | (R.edx & 3);
  for (; R.ecx !== 0; R.ecx = (R.ecx - 1) | 0) { poserOctet(jeu, lineaire(jeu, R.es, R.edi), 0); R.edi = (R.edi + 1) | 0; }
  R.eax = (LIGNE_DE_COMMANDE + 0xF) & -16;
  poserLong(jeu, LIGNE, R.eax);
  poserLong(jeu, NOM_DU_PROGRAMME, R.esi);
  appelerDepuis(jeu, R, L.retours.initialisations, INITIALISATIONS);
  R.ebp = 0;
  appelerDepuis(jeu, R, L.retours.cMain, L.cMain);
  // `__CMain` ne revient pas : la sortie passe par le service 4Ch (Sortie, machine.js).
  throw new Error('0x7E2CC : __CMain est revenue');
}

// 0x87274 — '__CMain' : réserver la pile demandée ([0xC2D50], arrondie à 4) si elle tient sous la
// pile disponible (0x8F440), noter le haut de cette réserve, fixer le pas du tas (0x8F449), puis
// appeler `main`(argc, argv) (0x10010) ; si `main` revient, `exit` de son résultat (0x7E2A1).
export function cMain(jeu, R, L = LIENS_DU_JEU) {
  empiler(jeu, R, R.ebx);
  empiler(jeu, R, R.ebp);
  R.ebp = R.esp;
  R.ebx = ((long(jeu, TAILLE_DE_LA_PILE) + 3) & -4) | 0;
  appelerDepuis(jeu, R, L.retours.pileDisponible, PILE_DISPONIBLE);
  if ((R.ebx >>> 0) < (R.eax >>> 0)) {
    R.eax = R.ebx;
    R.esp = (R.esp - R.eax) | 0;
    R.eax = R.esp;
  } else R.eax = 0;
  R.ebx = long(jeu, TAILLE_DE_LA_PILE) | 0;
  R.eax = (R.eax + R.ebx) | 0;
  poserLong(jeu, HAUT_DE_LA_RESERVE, R.eax);
  appelerDepuis(jeu, R, L.retours.pasDuTas, PAS_DU_TAS);
  empiler(jeu, R, long(jeu, ARGV_MAIN));
  empiler(jeu, R, long(jeu, ARGC_MAIN));
  appelerDepuis(jeu, R, L.retours.main, L.main);
  R.esp = (R.esp + 8) | 0;
  empiler(jeu, R, R.eax);
  sortir(jeu, R, L);
}

// 0x7E2A1 — 'exit'(code), le code au sommet de la pile : les vecteurs de nettoyage (des `ret`, ici),
// puis, dans un second cadre, les routines de fin de la bibliothèque (0x87307) et le service 4Ch.
// Le code du programme y saute aussi par `jmp` (evenements.js, `sortir`, en est la version appelée).
function sortir(jeu, R, L = LIENS_DU_JEU) {
  const [n0, n1, n2] = L.nettoyages, [r0, r1, r2, r3] = L.retours.nettoyages;
  empiler(jeu, R, R.ebp);
  R.ebp = R.esp;
  appelerDepuis(jeu, R, r0, long(jeu, n0));
  appelerDepuis(jeu, R, r1, long(jeu, n1));
  empiler(jeu, R, long(jeu, R.ebp + 4));
  empiler(jeu, R, R.ebp);
  R.ebp = R.esp;
  appelerDepuis(jeu, R, r2, long(jeu, n1));
  appelerDepuis(jeu, R, r3, long(jeu, n2));
  empiler(jeu, R, long(jeu, R.ebp + 4));
  R.eax = depiler(jeu, R);                                 // 0x7E53B : pop eax
  finirLeProgramme(jeu, R, L);
}

// 0x7E563 — la fin commune de `exit` et des erreurs fatales : le code (eax) empilé, les routines de
// fin de la bibliothèque (0x87307), puis le service 4Ch, qui ne revient pas (Sortie, machine.js).
function finirLeProgramme(jeu, R, L = LIENS_DU_JEU) {
  empiler(jeu, R, R.eax);
  appelerDepuis(jeu, R, L.retours.routinesDeFin, ROUTINES_DE_FIN);
  R.eax = depiler(jeu, R);
  R.eax = (R.eax & -65281) | (0x4C << 8);
  servir(jeu, 0x21);
  throw new Error('le service 4Ch est revenu');
}

// 0x7E53E — '__fatal_runtime_error' : on y saute, le message puis le code au sommet de la pile. Le
// message est écrit sur la console, « con » (0x7E342) ouvert en écriture (3D01h) sans vérifier le
// descripteur rendu — l'hôte ne connaît pas « con » : ax vaut 2, le code de l'erreur, et le message
// part sur la sortie d'erreur ; puis la fin commune, avec le code.
function erreurFatale(jeu, R, L = LIENS_DU_JEU) {
  R.eax = depiler(jeu, R);
  R.edx = depiler(jeu, R);
  empiler(jeu, R, R.edx);
  empiler(jeu, R, R.eax);
  R.edx = L.console;
  R.eax = (R.eax & -65536) | 0x3D01;
  servir(jeu, 0x21);
  R.ebx = (R.ebx & -65536) | (R.eax & 0xFFFF);            // mov bx, ax
  R.edx = depiler(jeu, R);
  R.esi = R.edx;
  R.DF = false;                                            // cld
  do {                                                     // lodsb ; cmp al, 0 ; jne
    R.eax = (R.eax & -256) | octet(jeu, R.esi);
    R.esi = (R.esi + 1) | 0;
  } while ((R.eax & 0xFF) !== 0);
  R.ecx = (R.esi - R.edx - 1) | 0;
  R.eax = (R.eax & -65281) | (0x40 << 8);
  servir(jeu, 0x21);
  R.eax = depiler(jeu, R);                                 // 0x7E562 : pop eax
  finirLeProgramme(jeu, R, L);
}

// 0x8FBC7 — l'erreur « Floating-point support not loaded » (0xB0A14), code 1 : la conversion d'un
// flottant que printf et scanf confient à des crochets ([0xC57F8], [0xC57FC]) quand le programme
// n'a pas le code des flottants — Theme Park ne l'a pas, et ses formats n'en demandent pas.
export function pasDeFlottants(jeu, R, L = LIENS_DU_JEU) {
  empiler(jeu, R, 1);
  empiler(jeu, R, L.pasDeFlottants);
  erreurFatale(jeu, R, L);
}

// 0x8F5AB — '__STKOVERFLOW' : « Stack Overflow! » (0xC4D8E) et le code 1, posés dans eax et edx comme
// pour une fonction à registres, puis le saut à l'erreur fatale, qui les prend dans la pile
// (anomalie de la bibliothèque, reproduite) : le message est l'adresse de retour de l'appelant —
// 'write' seul l'appelle (0x878B0 : l'octet 0xBF, puis un zéro, image-programme.js) — et le code
// le mot suivant, une variable de 'write'. Seule une pile presque pleine y mène.
const DEBORDEMENT_DE_PILE = 0xC4D8E;
function debordementDePile(jeu, R) {
  R.eax = DEBORDEMENT_DE_PILE;
  R.edx = 1;
  erreurFatale(jeu, R);
}

// ================================================================================================
// 2. La minuterie de SOS
// ================================================================================================

const SOS_OCCUPE = 0xC4716;             // mot : 1 pendant le gestionnaire (pas de réentrée)
const SOS_PILE_INTERROMPUE = 0xC370E;   // pointeur lointain : la pile du code interrompu
const SOS_PILE_PRIVEE = 0xC3706;        // pointeur lointain : le haut de la pile privée de SOS
const SOS_EVENEMENTS = 0xC36FC;         // pointeur lointain : la routine des événements (0x8280A)
const SOS_ANCIEN_GESTIONNAIRE = 0xC36F0; // pointeur lointain : l'ancien gestionnaire de l'IRQ 0
const SOS_IRQ0_PRISE = 0xC4718;         // non nul : SOS a pris l'IRQ 0

// Les drapeaux d'un mot d'état empilé (popfd).
function poserLesDrapeaux(R, v) {
  R.CF = (v & 1) !== 0; R.ZF = (v & 0x40) !== 0; R.SF = (v & 0x80) !== 0; R.IF = (v & 0x200) !== 0;
  R.DF = (v & 0x400) !== 0; R.OF = (v & 0x800) !== 0;
}
function iretd(jeu, R) {
  poserLesDrapeaux(R, long(jeu, R.esp + 8));
  R.esp = (R.esp + 12) | 0;
}

// 0x8A369 — le gestionnaire de l'IRQ 0 que SOS pose (vecteur 8) quand il prend la minuterie. Pas de
// réentrée ([0xC4716]) ; sinon : les registres et les segments du code interrompu empilés, ds et es
// repris (0x7E570), le drapeau levé, la pile interrompue notée en [0xC370E], la pile privée de SOS
// prise (haut en 0xC4716), la routine des événements appelée (0x8280A, appel lointain), la pile
// interrompue reprise, la fin d'interruption envoyée (port 0x20), le drapeau baissé, les registres
// rendus, `iretd`. L'hôte l'appelle comme un gestionnaire (machine.js, appelerGestionnaire), et rend
// ensuite au code interrompu tous ses registres.
function gestionnaireDeLaMinuterie(jeu, R) {
  empiler(jeu, R, R.ds);
  appelerDepuis(jeu, R, 0x8A36F, REPRENDRE_DS);
  const occupe = mot(jeu, SOS_OCCUPE) === 1;
  R.ds = depiler(jeu, R) & 0xFFFF;
  if (occupe) { iretd(jeu, R); return; }
  // pushad, puis es, fs, gs, ds
  const esp = R.esp;
  R.esp = (R.esp - 32) | 0;
  poserLong(jeu, R.esp + 28, R.eax); poserLong(jeu, R.esp + 24, R.ecx); poserLong(jeu, R.esp + 20, R.edx);
  poserLong(jeu, R.esp + 16, R.ebx); poserLong(jeu, R.esp + 12, esp); poserLong(jeu, R.esp + 8, R.ebp);
  poserLong(jeu, R.esp + 4, R.esi); poserLong(jeu, R.esp, R.edi);
  empiler(jeu, R, R.es);
  empiler(jeu, R, R.fs);
  empiler(jeu, R, R.gs);
  empiler(jeu, R, R.ds);
  appelerDepuis(jeu, R, 0x8A38A, REPRENDRE_DS);
  empiler(jeu, R, R.ds);                                   // push ds ; pop es
  R.es = depiler(jeu, R) & 0xFFFF;
  poserMot(jeu, SOS_OCCUPE, 1);
  poserLong(jeu, SOS_PILE_INTERROMPUE, R.esp);
  poserMot(jeu, SOS_PILE_INTERROMPUE + 4, R.ss);
  R.esp = long(jeu, SOS_PILE_PRIVEE) | 0;                  // lss esp, [0xC3706]
  R.ss = mot(jeu, SOS_PILE_PRIVEE + 4);
  // call fword ptr [0xC36FC] : l'hôte trouve l'appelée (une fonction du programme ou un module de son)
  R.esp = (R.esp - 8) | 0;
  poserLong(jeu, R.esp + 4, R.cs);
  poserLong(jeu, R.esp, 0x8A3AF);
  const appelee = jeu.machine.appelLointain(long(jeu, SOS_EVENEMENTS), mot(jeu, SOS_EVENEMENTS + 4));
  if (appelee) { jeu.T.charger(); appelee(); jeu.T.sauver(); }
  R.esp = long(jeu, SOS_PILE_INTERROMPUE) | 0;             // lss esp, [0xC370E]
  R.ss = mot(jeu, SOS_PILE_INTERROMPUE + 4);
  R.eax = (R.eax & -256) | 0x20;
  jeu.machine.sortie(0x20, 0x20, 1);                       // fin d'interruption
  poserMot(jeu, SOS_OCCUPE, 0);
  R.ds = depiler(jeu, R) & 0xFFFF;
  R.gs = depiler(jeu, R) & 0xFFFF;
  R.fs = depiler(jeu, R) & 0xFFFF;
  R.es = depiler(jeu, R) & 0xFFFF;
  // popad (l'esp empilé est sauté)
  R.edi = long(jeu, R.esp) | 0; R.esi = long(jeu, R.esp + 4) | 0; R.ebp = long(jeu, R.esp + 8) | 0;
  R.ebx = long(jeu, R.esp + 16) | 0; R.edx = long(jeu, R.esp + 20) | 0; R.ecx = long(jeu, R.esp + 24) | 0;
  R.eax = long(jeu, R.esp + 28) | 0;
  R.esp = (R.esp + 32) | 0;
  iretd(jeu, R);
}

// 0x8A55E — rendre la main à l'ancien gestionnaire de l'IRQ 0 (appelée par l'événement 15, 0x828C4,
// au rythme du BIOS), si SOS a pris l'IRQ 0 ([0xC4718]). Le drapeau de réentrée baissé, la pile
// interrompue reprise ([0xC370E]), l'ancien vecteur ([0xC36F0]) glissé dans le cadre du
// gestionnaire, à la place des ecx et eax empilés par `pushad`, dont les valeurs reviennent dans les
// registres ; les segments et les autres registres dépilés, et `retf` : sur la machine d'origine,
// un saut à l'ancien gestionnaire, qui finit l'interruption par son `iretd`.
//
// Ici comme dans la transcription, qui en fait un retour ordinaire, ce `retf` revient à l'appelant
// (0x828C4) : l'ancien gestionnaire n'est pas appelé, le compteur du BIOS n'avance pas, et le
// gestionnaire de SOS finit l'interruption (il reprend sa pile en [0xC370E] : ce que dépilent en
// sortant 0x828C4 et 0x8280A, lu dans le cadre de l'interruption, ne compte pas).
function chainerLAncienGestionnaire(jeu, R) {
  if (long(jeu, SOS_IRQ0_PRISE) === 0) { R.esp = (R.esp + 4) | 0; return; }
  poserMot(jeu, SOS_OCCUPE, 0);
  R.esp = long(jeu, SOS_PILE_INTERROMPUE) | 0;             // lss esp, [0xC370E]
  R.ss = mot(jeu, SOS_PILE_INTERROMPUE + 4);
  R.eax = long(jeu, SOS_ANCIEN_GESTIONNAIRE) | 0;
  R.edx = long(jeu, SOS_ANCIEN_GESTIONNAIRE + 4) | 0;
  R.ecx = R.eax;
  R.eax = R.edx;
  R.ebp = R.esp;
  let t = long(jeu, R.ebp + 0x28) | 0;                     // xchg [ebp + 0x28], ecx
  poserLong(jeu, R.ebp + 0x28, R.ecx);
  R.ecx = t;
  t = long(jeu, R.ebp + 0x2C) | 0;                         // xchg [ebp + 0x2c], eax
  poserLong(jeu, R.ebp + 0x2C, R.eax);
  R.eax = t;
  R.ds = depiler(jeu, R) & 0xFFFF;
  R.gs = depiler(jeu, R) & 0xFFFF;
  R.fs = depiler(jeu, R) & 0xFFFF;
  R.es = depiler(jeu, R) & 0xFFFF;
  R.edi = depiler(jeu, R);
  R.esi = depiler(jeu, R);
  R.ebp = depiler(jeu, R);
  R.ebx = depiler(jeu, R);
  R.ebx = depiler(jeu, R);
  R.edx = depiler(jeu, R);
  R.esp = (R.esp + 8) | 0;                                 // retf
}

// 0x828C4 — l'événement 15 de la minuterie de SOS, réservé à l'ancien gestionnaire (appel lointain
// depuis 0x8280A) : 0x8A55E dans le cadre habituel (ebx, esi, edi, ebp empilés), puis `retf`.
function evenementDuBios(jeu, R) {
  empiler(jeu, R, R.ebx);
  empiler(jeu, R, R.esi);
  empiler(jeu, R, R.edi);
  empiler(jeu, R, R.ebp);
  R.ebp = R.esp;
  appelerDepuis(jeu, R, 0x828D5, 0x8A55E);
  R.ebp = depiler(jeu, R);
  R.edi = depiler(jeu, R);
  R.esi = depiler(jeu, R);
  R.ebx = depiler(jeu, R);
  R.esp = (R.esp + 8) | 0;                                 // retf
}

// Le point d'entrée n'est appelé par aucune fonction : l'hôte le lance (Machine.demarrer).
export const POINT_D_ENTREE = 0x7E2CC;

export const reecritures = [
  { adresse: 0x7E2CC, nom: 'pointDEntree', fn: pointDEntree, convention: 'brute' },
  { adresse: 0x87274, nom: 'cMain', fn: cMain, convention: 'brute' },
  { adresse: 0x8A369, nom: 'gestionnaireDeLaMinuterie', fn: gestionnaireDeLaMinuterie, convention: 'brute' },
  { adresse: 0x8A55E, nom: 'chainerLAncienGestionnaire', fn: chainerLAncienGestionnaire, convention: 'brute' },
  { adresse: 0x828C4, nom: 'evenementDuBios', fn: evenementDuBios, convention: 'brute' },
  { adresse: 0x8FBC7, nom: 'pasDeFlottants', fn: pasDeFlottants, convention: 'brute' },
  { adresse: 0x8F5AB, nom: 'debordementDePile', fn: debordementDePile, convention: 'brute' },
];
