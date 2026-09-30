// La bibliothèque HMI SOS, partie numérique et plomberie : les échantillons, les modules de
// HMIDRV.386, la mémoire DPMI, la minuterie, le gestionnaire de morceau ; et, liés à côté d'elle
// dans MAIN.EXE, le chargeur des banques de sons et le `scanf` de Watcom.
//
// Réécriture lisible des fonctions que le scénario `son` (avec carte son, `--son`) exerce. Voir
// docs/guide-reecriture.md ; docs/retro-ingenierie.md § 9 pour le son.
//
// 1. LES ÉCHANTILLONS (0x8943F, 0x89A48, 0x892DB, 0x879F8, 0x8BB9B). Les 32 descripteurs d'un pilote
//    numérique, de 0x6C octets, appartiennent au module de mélange (que l'hôte tient, son.js) ; SOS
//    y accède par une table de pointeurs lointains, 0xE0EC0 + 0xC0 × pilote, 6 octets par
//    descripteur, que 0x8BB9B remplit à l'installation du pilote. Noms de SOS : sosDIGIStartSample,
//    sosDIGIStopSample, sosDIGISampleDone, sosDIGISetSampleVolume.
//
// 2. LES MODULES DE HMIDRV.386 (0x8BD24, 0x8BE57, 0x8BEB9, 0x8BEF2, 0x8BF23, 0x8BF52). De petites
//    routines en assembleur qui chargent les registres et appellent le module par son adresse, le
//    numéro de fonction dans eax, le module dans fs:edi. L'hôte répond à la place du module
//    (son.js, `fonctionPilote`, `fonctionMelangeur`) : la réécriture l'atteint par la même porte que
//    la transcription, l'appel indirect vers une adresse que le programme ne connaît pas.
//    0x8BF81 regarde si Windows 3.1 tourne (int 2Fh, 1600h) et, si oui, lui demande de ne pas
//    traduire le DMA (Virtual DMA Services, int 4Bh, 810Bh).
//
// 3. LA MÉMOIRE DPMI (0x8BB41, 0x8BBCB, 0x8BBF6, 0x8BC3C) : verrouiller une zone (0600h), une
//    adresse de ds rendue linéaire (0006h), un sélecteur fait sur une adresse linéaire (0000h,
//    0007h, 0008h), un bloc de mémoire DOS pris et verrouillé (0100h).
//
// 4. LA MINUTERIE DE SOS (0x8A426, 0x8A3E0, 0x8A4B1, 0x8A4DD). SOS prend l'IRQ 0 (int 21h, 3508h
//    puis 2508h vers 0x8A369), règle la cadence du 8253 (port 0x43, mode 0x36, diviseur sur le
//    port 0x40) et masque ou démasque l'IRQ 0 au contrôleur d'interruptions (port 0x21, bit 0).
//    Le gestionnaire lui-même, 0x8A369, et le chaînage vers l'ancien, 0x8A55E, restent en attente
//    (voir `enAttente`).
//
// 5. LA MUSIQUE (0x88D91, 0x88D4B, 0x87238, 0x89E5C). 0x88D91 est le gestionnaire d'un morceau :
//    un événement de la minuterie de SOS (0x8280A l'appelle, appel lointain, après avoir posé le
//    numéro du morceau en [0xC34ED]), qui avance chaque piste du morceau et remet ses messages au
//    pilote (0x863E5). 0x88D4B fabrique un pointeur lointain ; 0x87238 pose un drapeau de la
//    musique et rend l'ancien (vraisemblablement sosMIDIEnableChannelStealing) ; 0x89E5C règle le
//    tempo d'un morceau.
//
// 6. LES BANQUES DE SONS (0x8B980, 0x8BAB0), de Bullfrog : charger un fichier dans un bloc du tas du
//    jeu, ou le rendre.
//
// 7. LE `scanf` DE WATCOM (0x8AD11, 0x8AF18, 0x8AFE5, 0x8B09D, 0x8B5BB, 0x8B7B8, 0x8B7EC), que
//    `sscanf` (0x833A5, par `vsscanf` 0x83377) appelle. Les noms d'origine d'Open Watcom (scnf.c),
//    entre guillemets simples, sont reconnus à la forme du code : '__scnf', 'get_opt',
//    'scan_white', 'scan_string', 'scan_int', 'radix_value', 'cgetw'. Et, de la même bibliothèque,
//    '_dosretax' (0x882FC).
//
// LA HAUTEUR DE PILE. Avec la carte son, le gestionnaire de l'IRQ 0 (0x8A369) range `esp` en
// [0xC370E] : une interruption livrée pendant un service rendu par l'hôte (port, int 31h) ou pendant
// une fonction appelée laisse donc en mémoire la hauteur de pile du code interrompu. Chaque
// réécriture de ce module rend ses services et fait ses appels exactement à la hauteur où
// l'original les faisait (ses registres empilés et ses variables locales déduits de l'entrée), avec
// l'adresse de retour de l'original.
//
// NON EXERCÉ par les scénarios (son, et demo, quitter, ecrans, fin-annee rejoués avec --son),
// réécrit d'après le désassemblage : la routine de fin d'un morceau (jamais posée), le
// méta-événement de tempo, sosDIGIStartSample au-delà du pilote 0xE106 ou sans descripteur libre,
// la minuterie non déclarée ([0xC4718] nul), Windows 3.1, une banque sans fichier (« * ») ou mal
// lue, et du `scanf` tout ce qui n'est pas %d, %x et %s sans signe (%i, %o, %u, %c, %n, %[, les
// réels, le « % » littéral, un caractère du format qui ne correspond pas).

// --- mémoire ------------------------------------------------------------------------------------
const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Un pointeur lointain rangé en mémoire : décalage (4 octets) puis sélecteur (2 octets).
const selecteurDe = (jeu, a) => mot(jeu, a + 4);
const lineaire = (jeu, decalage, selecteur) => (jeu.machine.base(selecteur & 0xFFFF) + (decalage >>> 0)) >>> 0;
const pointeurLointain = (jeu, a) => lineaire(jeu, long(jeu, a), selecteurDe(jeu, a));
const estNul = (jeu, a) => long(jeu, a) === 0 && mot(jeu, a + 4) === 0;

// Les classes de caractères de Watcom ('_IsTable'), indexées par le code plus un, sur un octet.
const CLASSES = 0xB0A5C;
const ESPACE = 0x02, CHIFFRE = 0x20;
const estUnBlanc = (jeu, c) => (octet(jeu, CLASSES + ((c + 1) & 0xFF)) & ESPACE) !== 0;
const estUnChiffre = (jeu, c) => (octet(jeu, CLASSES + ((c + 1) & 0xFF)) & CHIFFRE) !== 0;

// --- registres, appels et services -------------------------------------------------------------
// Dans une réécriture, T.R fait foi : l'enveloppe (index.js) l'a relevé à l'entrée et le recharge
// au retour. Avant un appel ou un service, on le recharge dans la transcription.

// Ce que l'original laisse sous son point d'entrée : ses registres empilés et ses variables. Avec la
// carte son, beaucoup de ces fonctions tournent sous l'interruption de la minuterie, sur la pile
// privée de SOS (0xC3716 à 0xC4716), que la comparaison appel par appel compare comme n'importe
// quelle variable : elles y écrivent donc ce qu'y écrivait l'original (le rejeu, lui, ne regarde
// pas cette pile). `empiler(jeu, entree, a, b…)` pose a à entree − 4, b à entree − 8…, comme des
// `push` de 32 bits (un registre de segment empilé occupe quatre octets, comme dans la
// transcription).
function empiler(jeu, entree, ...valeurs) {
  valeurs.forEach((v, k) => poserLong(jeu, entree - 4 * (k + 1), v));
}
// Les quatre registres qu'empile le prologue du code C de SOS.
const empilerLePrologue = (jeu, entree) => {
  const R = jeu.T.R;
  empiler(jeu, entree, R.ebx, R.esi, R.edi, R.ebp);
};
// Les huit qu'empilent les routines en assembleur (`push ebp ; mov ebp, esp`, puis esi, edi, ebx,
// ecx, fs, gs, es), et un neuvième, es encore, pour les portes des modules.
const empilerLesRegistres = (jeu, entree, esEncore = false) => {
  const R = jeu.T.R;
  empiler(jeu, entree, R.ebp, R.esi, R.edi, R.ebx, R.ecx, R.fs, R.gs, R.es, ...(esEncore ? [R.es] : []));
};

// Les registres que les routines en assembleur empilent en entrant et dépilent en sortant.
const SAUVES = ['esi', 'edi', 'ebx', 'ecx', 'ebp', 'es', 'fs', 'gs', 'ds'];
const relever = (R) => Object.fromEntries(SAUVES.map((k) => [k, R[k]]));
const remettre = (R, sauves) => Object.assign(R, sauves);
const bas16 = (registre, v) => ((registre & ~0xFFFF) | (v & 0xFFFF)) | 0;
const bas8 = (registre, v) => ((registre & ~0xFF) | (v & 0xFF)) | 0;

// Appeler une fonction du jeu comme l'original : `pile`, son pointeur de pile juste avant
// d'empiler les arguments, `retour`, l'adresse qui suit son `call`.
function appelerDepuis(jeu, retour, pile, adresse, ...args) {
  jeu.T.charger();
  return jeu.appelerDepuis(retour, pile >>> 0, adresse >>> 0, ...args);
}

// Un appel lointain par un pointeur (`call far [m]`) : l'argument, le sélecteur de code et
// l'adresse de retour empilés, puis la routine, qui rend la main par un `retf`.
function appelerLoinDepuis(jeu, retour, pile, decalage, selecteur, argument) {
  const T = jeu.T, R = T.R, m = jeu.machine;
  const avant = R.esp;
  let esp = (pile - 4) | 0; m.w32(esp, argument);
  esp = (esp - 4) | 0; m.w32(esp, R.cs);
  esp = (esp - 4) | 0; m.w32(esp, retour);
  R.esp = esp;
  T.charger();
  const f = m.appelLointain(decalage >>> 0, selecteur & 0xFFFF);
  T.charger();
  if (f) f();
  T.sauver();
  R.esp = avant;
  T.charger();
}

// Appeler un module de HMIDRV.386 (`call dword ptr [ebp+8]`), les registres déjà posés dans R :
// le module est empilé, puis l'adresse de retour. Le module ne fait pas partie du programme : la
// transcription s'adresse alors à l'hôte, qui répond à sa place (son.js) ; la réécriture aussi.
function appelerLeModule(jeu, retour, pile, module) {
  const T = jeu.T, R = T.R, m = jeu.machine;
  let esp = (pile - 4) | 0; m.w32(esp, module);
  esp = (esp - 4) | 0; m.w32(esp, retour);
  R.esp = esp;
  T.charger();
  const f = T.fonction(module >>> 0);
  if (f !== undefined) f();
  else m.hote().appelInconnu(module >>> 0);
  T.sauver();
  R.esp = pile;                           // le `ret` du module, puis `add esp, 4`
}

// Un service rendu par l'hôte, à la hauteur de pile `pile`.
function interruption(jeu, pile, n) {
  const R = jeu.T.R;
  R.esp = pile;
  jeu.T.charger();
  jeu.machine.interruption(n);
  jeu.T.charger();
}
function entreePort(jeu, pile, port) {
  const R = jeu.T.R;
  R.esp = pile;
  R.edx = bas16(R.edx, port);             // `mov dx, port`
  jeu.T.charger();
  const v = jeu.machine.entree(port, 1) & 0xFF;
  jeu.T.charger();
  R.eax = bas8(R.eax, v);                 // `in al, dx`
  return v;
}
function sortiePort(jeu, pile, port, valeur) {
  const R = jeu.T.R;
  R.esp = pile;
  R.edx = bas16(R.edx, port);
  R.eax = bas8(R.eax, valeur);            // `out dx, al`
  jeu.T.charger();
  jeu.machine.sortie(port, valeur & 0xFF, 1);
  jeu.T.charger();
}

// =================================================================================================
// 1. LES ÉCHANTILLONS
// =================================================================================================

// La table des descripteurs : pour chaque pilote numérique (0 à 4), 32 pointeurs lointains.
const DESCRIPTEURS = 0xE0EC0, PAR_PILOTE = 0xC0, PAR_DESCRIPTEUR = 6;
const NOMBRE_DE_DESCRIPTEURS = 32;
const TAILLE_DESCRIPTEUR = 0x6C;
const entreeDuDescripteur = (pilote, k) => (DESCRIPTEURS + Math.imul(pilote, PAR_PILOTE) + Math.imul(k, PAR_DESCRIPTEUR)) >>> 0;

// Le descripteur d'échantillon (docs/retro-ingenierie.md § 9.4 ; son.js le lit et le tient à jour).
const D = {
  DEBUT: 0x00,           // pointeur lointain : début des données
  POSITION: 0x08,        // pointeur lointain : position courante
  BOUCLE: 0x10,          // pointeur lointain : début + point de boucle
  RESTE: 0x18,           // octets restant à jouer (le point de boucle, avec une boucle partielle)
  TAILLE: 0x1C,          // pour reprendre une boucle
  LONGUEUR_BOUCLE: 0x20,
  APRES_BOUCLE: 0x2C,    // ce qui suit la boucle
  DRAPEAUX: 0x30,
  VOLUME: 0x32,          // 0 à 0x7FFF
  IDENTIFIANT: 0x34,     // le « numéro » de Bullfrog
  CANAL: 0x36,
  BOUCLES: 0x38,         // boucles restantes, 0xFFFF : sans fin
  RESERVE_3A: 0x3A,
  RAPPEL: 0x3C,          // pointeur lointain : routine de fin
  PAS: 0x44,             // pas de hauteur
  FRACTION: 0x48,        // l'hôte y garde la fraction de la position
  CHAMP_4A: 0x4A,        // recopié de la structure de départ (+0x1A) ; non établi
  CHAMP_4C: 0x4C,
  TAILLE_BIS: 0x50,
  PANORAMIQUE: 0x54,     // +0x54 à +0x60 : panoramique et fondus, sept mots
  CHAMP_64: 0x64,
  CHAMP_68: 0x68,
};
const EN_COURS = 0x8000, PREMIER_PASSAGE = 0x2000;
const EN_COURS_OCTET_HAUT = 0x80;         // le bit 0x8000 vu dans l'octet haut des drapeaux

// La structure de départ (_SOS_START_SAMPLE), que le jeu remplit en 0xBA729.
const S = {
  DONNEES: 0x00,         // pointeur lointain
  TAILLE: 0x08,
  BOUCLES: 0x0C,
  CANAL: 0x0E,
  VOLUME: 0x10,
  IDENTIFIANT: 0x12,
  RAPPEL: 0x14,          // pointeur lointain
  CHAMP_1A: 0x1A,
  DRAPEAUX: 0x1C,
  FIN_BOUCLE: 0x20,      // non établi : la longueur utile, dont on retire boucle et point de boucle
  POINT_DE_BOUCLE: 0x24,
  LONGUEUR_BOUCLE: 0x28,
  PAS: 0x2C,
  PANORAMIQUE: 0x32,     // sept mots, jusqu'à +0x3E
};
const BOUCLE_PARTIELLE = 0x40;            // l'octet bas des drapeaux de départ

// Le pilote matériel installé, par numéro de pilote : son identifiant, et un drapeau d'état.
const ID_DU_PILOTE = 0xC32E2;
const PILOTE_PRET = 0xC3274;
const PREMIER_PILOTE_SANS_DESCRIPTEURS = 0xE106;   // à partir d'ici, sosDIGIStartSample ne remplit rien

// Un pointeur lointain par pilote, lu par sosDIGIStartSample dans une variable jamais relue (non
// établi).
const TABLE_C31E8 = 0xC31E8;

const PAS_DE_DESCRIPTEUR_LIBRE = -1;
const ECHANTILLON_INCONNU = 0xA;

// 0x8943F — sosDIGIStartSample(pilote, départ) : le premier descripteur libre (bit 0x8000 éteint)
// reçoit l'échantillon décrit par la structure de départ (pointeur lointain) ; rend son numéro, ou
// −1 si les 32 jouent. Au-delà du pilote 0xE106 — des cartes qui mélangent elles-mêmes, non
// établi —, rien n'est rempli et la fonction rend 0.
function demarrerUnEchantillon(jeu, pilote, departDecalage, departSelecteur) {
  const R = jeu.T.R, ebp = R.esp - 16;
  // Le cadre de l'original : [ebp-4] le numéro essayé, [ebp-8] le résultat, [ebp-0x20] le
  // sélecteur du descripteur ; les autres variables ne sont jamais relues.
  empilerLePrologue(jeu, R.esp);
  const t = TABLE_C31E8 + Math.imul(pilote, 6);
  poserMot(jeu, ebp - 0x18, mot(jeu, t + 4));
  poserLong(jeu, ebp - 0x1C, long(jeu, t));
  const s = lineaire(jeu, departDecalage, departSelecteur);
  if (long(jeu, ID_DU_PILOTE + 4 * pilote) >= PREMIER_PILOTE_SANS_DESCRIPTEURS) {
    R.gs = departSelecteur & 0xFFFF;
    poserMot(jeu, ebp - 0x10, mot(jeu, s + 4));
    poserLong(jeu, ebp - 0x14, long(jeu, s));
    poserLong(jeu, ebp - 0xC, long(jeu, s + 8));
    poserLong(jeu, ebp - 8, 0);
    return 0;
  }
  for (let k = 0; k < NOMBRE_DE_DESCRIPTEURS; k++) {
    const entree = entreeDuDescripteur(pilote, k);
    R.gs = selecteurDe(jeu, entree);
    const d = pointeurLointain(jeu, entree);
    poserLong(jeu, ebp - 4, k);
    if (mot(jeu, d + D.DRAPEAUX) & EN_COURS) continue;
    poserMot(jeu, ebp - 0x20, R.gs);
    poserLong(jeu, ebp - 8, k);
    // Début et position : les données, pointeur lointain recopié tel quel.
    poserMot(jeu, d + D.DEBUT + 4, mot(jeu, s + S.DONNEES + 4));
    poserLong(jeu, d + D.DEBUT, long(jeu, s + S.DONNEES));
    poserMot(jeu, d + D.POSITION + 4, mot(jeu, s + S.DONNEES + 4));
    poserLong(jeu, d + D.POSITION, long(jeu, s + S.DONNEES));
    // Le début de la boucle.
    poserMot(jeu, d + D.BOUCLE + 4, mot(jeu, s + S.DONNEES + 4));
    poserLong(jeu, d + D.BOUCLE, long(jeu, s + S.DONNEES) + long(jeu, s + S.POINT_DE_BOUCLE));
    if (octet(jeu, s + S.DRAPEAUX) & BOUCLE_PARTIELLE) {
      poserLong(jeu, d + D.RESTE, long(jeu, s + S.POINT_DE_BOUCLE));
      poserLong(jeu, d + D.TAILLE, long(jeu, s + S.POINT_DE_BOUCLE));
      poserLong(jeu, d + D.LONGUEUR_BOUCLE, long(jeu, s + S.LONGUEUR_BOUCLE));
      poserLong(jeu, d + D.APRES_BOUCLE, long(jeu, s + S.FIN_BOUCLE)
        - (long(jeu, s + S.POINT_DE_BOUCLE) + long(jeu, s + S.LONGUEUR_BOUCLE)));
    } else {
      poserLong(jeu, d + D.RESTE, long(jeu, s + S.TAILLE));
      poserLong(jeu, d + D.TAILLE, long(jeu, s + S.TAILLE));
    }
    poserMot(jeu, d + D.VOLUME, mot(jeu, s + S.VOLUME));
    poserMot(jeu, d + D.IDENTIFIANT, mot(jeu, s + S.IDENTIFIANT));
    // Les drapeaux du jeu, plus « en cours » et « premier passage ».
    poserMot(jeu, d + D.DRAPEAUX, mot(jeu, s + S.DRAPEAUX) | EN_COURS | PREMIER_PASSAGE);
    poserMot(jeu, d + D.CANAL, mot(jeu, s + S.CANAL));
    poserMot(jeu, d + D.RAPPEL + 4, mot(jeu, s + S.RAPPEL + 4));
    poserLong(jeu, d + D.RAPPEL, long(jeu, s + S.RAPPEL));
    poserMot(jeu, d + D.BOUCLES, mot(jeu, s + S.BOUCLES));
    poserMot(jeu, d + D.CHAMP_4A, mot(jeu, s + S.CHAMP_1A));
    poserMot(jeu, d + D.RESERVE_3A, 0);
    poserLong(jeu, d + D.PAS, long(jeu, s + S.PAS));
    poserMot(jeu, d + D.FRACTION, 0);
    poserLong(jeu, d + D.CHAMP_4C, 0);
    poserLong(jeu, d + D.TAILLE_BIS, long(jeu, s + S.TAILLE));
    for (let j = 0; j < 7; j++) poserMot(jeu, d + D.PANORAMIQUE + 2 * j, mot(jeu, s + S.PANORAMIQUE + 2 * j));
    poserLong(jeu, d + D.CHAMP_64, 0);
    poserMot(jeu, d + D.CHAMP_68, 0);
    return k;
  }
  poserLong(jeu, ebp - 4, NOMBRE_DE_DESCRIPTEURS);
  poserLong(jeu, ebp - 8, PAS_DE_DESCRIPTEUR_LIBRE);
  return PAS_DE_DESCRIPTEUR_LIBRE;
}

// 0x89A48 — sosDIGIStopSample(pilote, identifiant) : le premier descripteur qui porte cet
// identifiant (qu'il joue ou non) est arrêté et perd son identifiant ; rend 0, ou 0xA si aucun ne
// le porte. L'identifiant est comparé en 16 bits signés à l'argument entier.
function arreterUnEchantillon(jeu, pilote, identifiant) {
  const R = jeu.T.R, ebp = R.esp - 16;
  empilerLePrologue(jeu, R.esp);          // [ebp-4] le numéro essayé, [ebp-8] le résultat
  for (let k = 0; k < NOMBRE_DE_DESCRIPTEURS; k++) {
    const entree = entreeDuDescripteur(pilote, k);
    R.gs = selecteurDe(jeu, entree);
    const d = pointeurLointain(jeu, entree);
    poserLong(jeu, ebp - 4, k);
    if (motSigne(jeu, d + D.IDENTIFIANT) !== (identifiant | 0)) continue;
    poserOctet(jeu, d + D.DRAPEAUX + 1, octet(jeu, d + D.DRAPEAUX + 1) & ~EN_COURS_OCTET_HAUT);
    poserMot(jeu, d + D.IDENTIFIANT, 0);
    poserLong(jeu, ebp - 8, 0);
    return 0;
  }
  poserLong(jeu, ebp - 4, NOMBRE_DE_DESCRIPTEURS);
  poserLong(jeu, ebp - 8, ECHANTILLON_INCONNU);
  return ECHANTILLON_INCONNU;
}

// 0x892DB — sosDIGISampleDone(pilote, identifiant) : 1 si l'échantillon est fini, 0 s'il joue. Le
// PREMIER descripteur qui porte l'identifiant en décide ; aucun : fini. (Un descripteur fini garde
// son identifiant ; comme sosDIGIStartSample prend toujours le premier libre, un descripteur fini
// placé avant celui qui joue le même identifiant ne peut pas exister, et la réponse reste juste.)
function echantillonFini(jeu, pilote, identifiant) {
  const R = jeu.T.R, ebp = R.esp - 16;
  // Le cadre : [ebp-4] le numéro essayé, [ebp-8] « trouvé », [ebp-0xC] le résultat.
  empilerLePrologue(jeu, R.esp);
  poserLong(jeu, ebp - 8, 0);
  for (let k = 0; k < NOMBRE_DE_DESCRIPTEURS; k++) {
    const entree = entreeDuDescripteur(pilote, k);
    R.gs = selecteurDe(jeu, entree);
    const d = pointeurLointain(jeu, entree);
    poserLong(jeu, ebp - 4, k);
    if (motSigne(jeu, d + D.IDENTIFIANT) !== (identifiant | 0)) continue;
    poserLong(jeu, ebp - 8, 1);
    const fini = (mot(jeu, d + D.DRAPEAUX) & EN_COURS) ? 0 : 1;
    poserLong(jeu, ebp - 0xC, fini);
    return fini;
  }
  poserLong(jeu, ebp - 4, NOMBRE_DE_DESCRIPTEURS);
  poserLong(jeu, ebp - 0xC, 1);
  return 1;
}

// 0x879F8 — sosDIGISetSampleVolume(pilote, identifiant, volume) : −1 si le pilote n'est pas prêt,
// 0 si un descripteur porte l'identifiant (le premier reçoit le volume), 0xA sinon.
function reglerLeVolume(jeu, pilote, identifiant, volume) {
  const R = jeu.T.R, ebp = R.esp - 16;
  empilerLePrologue(jeu, R.esp);          // [ebp-4] le numéro essayé, [ebp-8] le résultat
  if (long(jeu, PILOTE_PRET + 4 * pilote) === 0) {
    poserLong(jeu, ebp - 8, -1);
    return -1;
  }
  for (let k = 0; k < NOMBRE_DE_DESCRIPTEURS; k++) {
    const entree = entreeDuDescripteur(pilote, k);
    R.gs = selecteurDe(jeu, entree);
    const d = pointeurLointain(jeu, entree);
    poserLong(jeu, ebp - 4, k);
    if (motSigne(jeu, d + D.IDENTIFIANT) !== (identifiant | 0)) continue;
    poserMot(jeu, d + D.VOLUME, volume);
    poserLong(jeu, ebp - 8, 0);
    return 0;
  }
  poserLong(jeu, ebp - 4, NOMBRE_DE_DESCRIPTEURS);
  poserLong(jeu, ebp - 8, ECHANTILLON_INCONNU);
  return ECHANTILLON_INCONNU;
}

// 0x8BB9B — remplir une table de 32 pointeurs lointains vers les descripteurs, rangés tous les
// 0x6C octets à partir du pointeur lointain donné (sosDIGIInitDriver, avec l'adresse que le module
// de mélange a rendue).
function remplirLaTableDesDescripteurs(jeu, table, decalage, selecteur) {
  empilerLesRegistres(jeu, jeu.T.R.esp);
  for (let k = 0; k < NOMBRE_DE_DESCRIPTEURS; k++) {
    poserLong(jeu, table + PAR_DESCRIPTEUR * k, decalage + TAILLE_DESCRIPTEUR * k);
    poserMot(jeu, table + PAR_DESCRIPTEUR * k + 4, selecteur);
  }
}

// =================================================================================================
// 2. LES MODULES DE HMIDRV.386
// =================================================================================================
//
// Toutes ces routines ont la même forme : `push ebp ; mov ebp, esp`, puis esi, edi, ebx, ecx, fs,
// gs et deux fois es empilés (36 octets sous l'entrée), le module empilé et appelé ; au retour,
// tout est dépilé : seuls eax et edx gardent ce que le module y a mis. Les arguments : le module
// (son adresse), puis le pointeur lointain du module (décalage, sélecteur), qui va dans fs:edi.
const EMPILES_PAR_LES_PORTES = 36;
const FONCTION = { MATERIEL: 0, FIN: 1, INSTALLATION_MELANGE: 0x0A, FREQUENCE: 2, REGLAGE: 3, DEPART_DMA: 4, ARRET_DMA: 5,
  DESCRIPTION: 8 };

function porteDuModule(jeu, fonction, module, decalage, selecteur, registres, retour) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R);
  empilerLesRegistres(jeu, entree, true);
  R.edi = decalage; R.fs = selecteur & 0xFFFF;         // `lfs edi, [ebp+0xC]`
  R.eax = fonction;
  registres(R);
  appelerLeModule(jeu, retour, entree - EMPILES_PAR_LES_PORTES, module);
  return { entree, sauves };
}

// 0x8BD24 — fonction 8 : la description de la carte. Le module la rend en fs:edx ; la porte range
// ce pointeur lointain là où l'appelant le demande.
function descriptionDeLaCarte(jeu, module, decalage, selecteur, destinationDecalage, destinationSelecteur) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, FONCTION.DESCRIPTION, module, decalage, selecteur, () => {}, 0x8BD40);
  poserLong(jeu, entree - EMPILES_PAR_LES_PORTES - 4, R.ds);   // `push ds`, le temps d'un `lds`
  const destination = lineaire(jeu, destinationDecalage, destinationSelecteur);
  poserLong(jeu, destination, R.edx);
  poserMot(jeu, destination + 4, R.fs);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BE57 — fonction 0x0A du module de mélange : son installation, le tampon DMA en es:edi, sa
// taille en ecx, deux paramètres en edx et ebx (non établis). Le module rend trois décalages depuis
// son début : edi sa routine de remplissage, ecx ses données, esi ses descripteurs ; la porte en
// fait trois pointeurs lointains (le code en cs, le reste en ds), interruptions coupées.
function installerLeMelange(jeu, module, decalage, selecteur, tamponDecalage, tamponSelecteur, taille,
  parametreEdx, parametreEbx, sortie) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, FONCTION.INSTALLATION_MELANGE, module, decalage, selecteur, (R) => {
    R.ecx = taille;
    R.edi = tamponDecalage; R.es = tamponSelecteur & 0xFFFF;
    R.edx = parametreEdx;
    R.ebx = parametreEbx;
    R.gs = R.ds;                                   // `push ds ; pop gs`
  }, 0x8BE82);
  R.IF = false;                                    // cli
  poserLong(jeu, sortie, R.edi + module);
  poserLong(jeu, sortie + 8, R.ecx + module);
  poserLong(jeu, sortie + 0x10, R.esi + module);
  poserMot(jeu, sortie + 4, R.cs);
  poserMot(jeu, sortie + 0xC, R.ds);
  poserMot(jeu, sortie + 0x14, R.ds);
  R.eax = bas16(R.eax, R.ds);                      // les sélecteurs sont passés par ax
  R.IF = true;                                     // sti
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BEB9 — fonction 0 : le matériel. Port en bx, IRQ en cl, DMA en ch (et dx) : seuls les mots
// bas des registres changent.
function declarerLeMateriel(jeu, module, decalage, selecteur, port, irq, dma) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, FONCTION.MATERIEL, module, decalage, selecteur, (R) => {
    R.ebx = bas16(R.ebx, port);
    R.ecx = bas16(R.ecx, (irq & 0xFF) | ((dma & 0xFF) << 8));
    R.edx = bas16(R.edx, dma);
  }, 0x8BEE3);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BEF2 — fonction 4 : le départ du DMA, deux paramètres en edi et ecx (non établis).
function demarrerLeDma(jeu, module, decalage, selecteur, parametreEdi, parametreEcx) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, FONCTION.DEPART_DMA, module, decalage, selecteur, (R) => {
    R.ecx = parametreEcx;
    R.edi = parametreEdi;
  }, 0x8BF14);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BF23 — fonction 2 : la fréquence d'échantillonnage, en bx.
function reglerLaFrequence(jeu, module, decalage, selecteur, frequence) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, FONCTION.FREQUENCE, module, decalage, selecteur, (R) => {
    R.ebx = bas16(R.ebx, frequence);
  }, 0x8BF43);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BF52 — fonction 3 : un réglage, bx = 8 (non établi).
const REGLAGE_DEMANDE = 8;
function reglerLaCarte(jeu, module, decalage, selecteur) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, FONCTION.REGLAGE, module, decalage, selecteur, (R) => {
    R.ebx = bas16(R.ebx, REGLAGE_DEMANDE);
  }, 0x8BF72);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BF81 — sous Windows 3.1 en mode étendu (int 2Fh, 1600h rend 0x0A03 : Windows 3.10), demander
// aux Virtual DMA Services de ne plus traduire le canal DMA (int 4Bh, 810Bh, canal en ebx). Sept
// registres empilés, ebp compris : 32 octets sous l'entrée.
const EMPILES_PAR_LES_ROUTINES = 32;
const WINDOWS_310 = 0x0A03;
function pasDeTraductionDuDma(jeu, canal) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R), pile = entree - EMPILES_PAR_LES_ROUTINES;
  empilerLesRegistres(jeu, entree);
  R.eax = bas16(R.eax, 0x1600);
  interruption(jeu, pile, 0x2F);
  if ((R.eax & 0xFFFF) === WINDOWS_310) {
    R.eax = bas16(R.eax, 0x810B);
    R.ebx = canal;
    R.edx = bas16(R.edx, 0);
    interruption(jeu, pile, 0x4B);
    R.eax = bas16(R.eax, 0);
  }
  remettre(R, sauves);
  R.esp = entree;
}

// =================================================================================================
// 3. LA MÉMOIRE DPMI
// =================================================================================================

// 0x8BB41 — verrouiller une zone (DPMI 0600h) : adresse linéaire en bx:cx, taille en si:di.
function verrouillerUneZone(jeu, adresse, taille) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R);
  empilerLesRegistres(jeu, entree);
  R.ecx = bas16(R.ecx, adresse);
  R.ebx = bas16(R.ebx, adresse >>> 16);
  R.edi = bas16(R.edi, taille);
  R.esi = bas16(R.esi, taille >>> 16);
  R.eax = bas16(R.eax, 0x600);
  interruption(jeu, entree - EMPILES_PAR_LES_ROUTINES, 0x31);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BBCB — une adresse de ds rendue linéaire : la base du segment de données (DPMI 0006h, en
// cx:dx) plus l'adresse.
function adresseLineaire(jeu, adresse) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R);
  empilerLesRegistres(jeu, entree);
  R.eax = bas16(R.eax, 6);
  R.ebx = bas16(R.ebx, R.ds);
  interruption(jeu, entree - EMPILES_PAR_LES_ROUTINES, 0x31);
  const base = ((R.ecx << 16) | (R.edx & 0xFFFF)) >>> 0;
  remettre(R, sauves);
  R.esp = entree;
  return (adresse + base) | 0;
}

// 0x8BBF6 — un sélecteur sur une adresse linéaire : un descripteur alloué (DPMI 0000h), sa base
// posée (0007h) et sa limite portée à 4 Go (0008h). Rend le pointeur lointain sélecteur:0 dans
// edx:eax (seul dx change dans edx). Le sélecteur est gardé sur la pile, poussé sur 16 bits.
function selecteurSurUneAdresse(jeu, adresse) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R), pile = entree - EMPILES_PAR_LES_ROUTINES;
  empilerLesRegistres(jeu, entree);
  R.eax = bas16(R.eax, 0);
  R.ecx = bas16(R.ecx, 1);
  interruption(jeu, pile, 0x31);
  const selecteur = R.eax & 0xFFFF;
  poserMot(jeu, pile - 2, selecteur);             // `push ax`
  R.ebx = bas16(R.ebx, selecteur);
  R.eax = bas16(R.eax, 7);
  R.edx = bas16(R.edx, adresse);
  R.ecx = bas16(R.ecx, adresse >>> 16);
  interruption(jeu, pile - 2, 0x31);
  R.eax = bas16(R.eax, 8);
  R.ecx = bas16(R.ecx, 0xFFFF);
  R.edx = bas16(R.edx, 0xFFFF);
  interruption(jeu, pile - 2, 0x31);
  R.edx = bas16(R.edx, mot(jeu, pile - 2));       // `pop dx`
  R.eax = 0;
  remettre(R, sauves);
  R.esp = entree;
  return 0;
}

// 0x8BC3C — un bloc de mémoire DOS (DPMI 0100h, `paragraphes` en ebx), dont l'adresse linéaire
// (segment × 16) est rangée en [sortie], puis verrouillé (0600h) depuis la base de son sélecteur
// (0006h). **Anomalie reproduite** : la taille verrouillée est paragraphes × 16 calculée sur
// 16 bits, et son mot haut (si) mis à zéro : au-delà de 64 Ko, le verrou ne couvre qu'une partie
// du bloc. Le sélecteur du bloc n'est pas rendu.
function prendreDeLaMemoireDos(jeu, paragraphes, sortie) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R), pile = entree - EMPILES_PAR_LES_ROUTINES;
  empilerLesRegistres(jeu, entree);
  R.eax = bas16(R.eax, 0x100);
  R.ebx = paragraphes;
  interruption(jeu, pile, 0x31);
  R.eax = ((R.eax & 0xFFFF) << 4) | 0;
  R.esi = sortie;
  poserLong(jeu, sortie, R.eax);
  R.eax = bas16(R.eax, 6);
  R.ebx = bas16(R.ebx, R.edx);                    // le sélecteur du bloc
  interruption(jeu, pile, 0x31);
  R.ebx = bas16(R.ebx, R.ecx);
  R.ecx = bas16(R.ecx, R.edx);
  R.esi = bas16(R.esi, 0);
  R.edi = bas16(R.edi, (paragraphes & 0xFFFF) << 4);
  R.eax = bas16(R.eax, 0x600);
  interruption(jeu, pile, 0x31);
  remettre(R, sauves);
  R.esp = entree;
}

// =================================================================================================
// 4. LA MINUTERIE DE SOS
// =================================================================================================

// L'octet « minuterie de SOS installée », posé par 0x821FC. **Anomalie reproduite** : ces routines
// le testent comme un mot long, avec les trois octets qui le suivent.
const MINUTERIE_INSTALLEE = 0xC4718;
const PIC_MASQUE = 0x21, IRQ0 = 0x01;
const PIT_COMMANDE = 0x43, PIT_COMPTEUR_0 = 0x40, PIT_MODE_3 = 0x36;   // compteur 0, octet bas puis haut, onde carrée
// Le gestionnaire de SOS et ce qu'il garde : la routine qu'il appelle (pointeur lointain), un
// segment de données (non établi : jamais relu par le programme), le segment de sa pile privée
// (dont le pointeur, 0xC3706, est posé ailleurs), l'ancien vecteur de l'IRQ 0.
const ROUTINE_DE_L_IRQ0 = 0xC36FC, SEGMENT_DE_DONNEES = 0xC3704, SEGMENT_PILE_PRIVEE = 0xC370A;
const ANCIEN_VECTEUR = 0xC36F0;
const GESTIONNAIRE_DE_SOS = 0x8A369;

function masquerLIrq0(jeu, pile) {
  const v = entreePort(jeu, pile, PIC_MASQUE);
  sortiePort(jeu, pile, PIC_MASQUE, v | IRQ0);
}
function demasquerLIrq0(jeu, pile) {
  const v = entreePort(jeu, pile, PIC_MASQUE);
  sortiePort(jeu, pile, PIC_MASQUE, v & ~IRQ0);
}
function programmerLeCompteur(jeu, pile, diviseur) {
  sortiePort(jeu, pile, PIT_COMMANDE, PIT_MODE_3);
  const R = jeu.T.R;
  R.eax = diviseur;
  sortiePort(jeu, pile, PIT_COMPTEUR_0, diviseur);
  sortiePort(jeu, pile, PIT_COMPTEUR_0, diviseur >>> 8);   // `mov al, ah`
}

// 0x8A426 — installer le gestionnaire de l'IRQ 0 : la routine à appeler (pointeur lointain) et les
// segments de données retenus, puis, si la minuterie est déclarée, l'IRQ 0 masquée, l'ancien
// vecteur gardé (int 21h, 3508h), 0x8A369 posé (2508h, ds = cs), le compteur programmé, l'IRQ 0
// démasquée.
function installerLeGestionnaire(jeu, diviseur, routineDecalage, routineSelecteur) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R), pile = entree - EMPILES_PAR_LES_ROUTINES;
  empilerLesRegistres(jeu, entree);
  R.edi = routineDecalage; R.es = routineSelecteur & 0xFFFF;     // `les edi, [ebp+0xC]`
  poserLong(jeu, ROUTINE_DE_L_IRQ0, R.edi);
  poserMot(jeu, ROUTINE_DE_L_IRQ0 + 4, R.es);
  poserMot(jeu, SEGMENT_DE_DONNEES, R.ds);
  poserMot(jeu, SEGMENT_PILE_PRIVEE, R.ds);
  if (long(jeu, MINUTERIE_INSTALLEE) !== 0) {
    masquerLIrq0(jeu, pile);
    R.eax = bas16(R.eax, 0x3508);
    interruption(jeu, pile, 0x21);
    poserLong(jeu, ANCIEN_VECTEUR, R.ebx);
    poserMot(jeu, ANCIEN_VECTEUR + 4, R.es);
    const ds = R.ds;
    R.eax = bas16(R.eax, 0);
    R.es = 0;
    R.eax = bas16(R.eax, 0x2508);
    R.edx = GESTIONNAIRE_DE_SOS;
    R.ds = R.cs;
    poserLong(jeu, pile - 4, ds);                 // `push ds`
    interruption(jeu, pile - 4, 0x21);
    R.ds = ds;
    programmerLeCompteur(jeu, pile, diviseur);
    demasquerLIrq0(jeu, pile);
  }
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8A3E0 — changer la cadence de la minuterie : l'IRQ 0 masquée le temps de reprogrammer le
// compteur 0 du 8253.
function changerLaCadence(jeu, diviseur) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R), pile = entree - EMPILES_PAR_LES_ROUTINES;
  empilerLesRegistres(jeu, entree);
  if (long(jeu, MINUTERIE_INSTALLEE) !== 0) {
    masquerLIrq0(jeu, pile);
    programmerLeCompteur(jeu, pile, diviseur);
    demasquerLIrq0(jeu, pile);
  }
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8A4B1 — masquer l'IRQ 0 (la minuterie de SOS suspendue).
function suspendreLaMinuterie(jeu) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R);
  empilerLesRegistres(jeu, entree);
  if (long(jeu, MINUTERIE_INSTALLEE) !== 0) masquerLIrq0(jeu, entree - EMPILES_PAR_LES_ROUTINES);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8A4DD — démasquer l'IRQ 0.
function reprendreLaMinuterie(jeu) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R);
  empilerLesRegistres(jeu, entree);
  if (long(jeu, MINUTERIE_INSTALLEE) !== 0) demasquerLIrq0(jeu, entree - EMPILES_PAR_LES_ROUTINES);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8A509 — rendre l'IRQ 0 à son ancien gestionnaire (sosTIMERUnInitSystem, 0x822C1, en quittant),
// si SOS l'a prise : l'IRQ 0 masquée, l'ancien vecteur remis, le 8253 rendu au rythme du BIOS
// (diviseur 0 : 65 536), l'IRQ 0 démasquée. Anomalie de SOS, reproduite : le vecteur est remis par
// l'int 31h avec ax = 2508h, le numéro du service du DOS (int 21h, 25h, vecteur 8, celui de
// l'installation) ; le DPMI n'a pas de fonction 2508h, l'hôte la refuse, et le gestionnaire de SOS
// reste en place.
function rendreLaMinuterie(jeu) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R), pile = entree - EMPILES_PAR_LES_ROUTINES;
  empilerLesRegistres(jeu, entree);
  if (long(jeu, MINUTERIE_INSTALLEE) !== 0) {
    masquerLIrq0(jeu, pile);
    const ds = R.ds;
    poserLong(jeu, pile - 4, ds);                 // `push ds`
    R.eax = bas16(R.eax, 0x2508);
    R.ecx = bas16(R.ecx, mot(jeu, ANCIEN_VECTEUR + 4));
    R.edx = long(jeu, ANCIEN_VECTEUR) | 0;
    R.ds = R.ecx & 0xFFFF;
    interruption(jeu, pile - 4, 0x31);
    R.ds = ds;
    R.eax = bas16(R.eax, 0);
    sortiePort(jeu, pile, 0x40, 0);
    sortiePort(jeu, pile, 0x40, 0);
    demasquerLIrq0(jeu, pile);
  }
  remettre(R, sauves);
  R.esp = entree;
}

// =================================================================================================
// 5. LA MUSIQUE
// =================================================================================================

// 0x87238 — poser le drapeau [0xC29E1] et rendre l'ancien. Nul, 0x863E5 et 0x86E23 envoient les
// messages au pilote tels quels (le volume, contrôleur 7, pondéré par le volume général [0xC2AC5]) ;
// non nul, ils passent par la table des canaux 0xC1DA7. Vraisemblablement
// sosMIDIEnableChannelStealing ; le jeu le met à 0 à chaque morceau lancé (0x80A20).
const VOL_DE_CANAUX = 0xC29E1;
function permettreLeVolDeCanaux(jeu, permis) {
  const entree = jeu.T.R.esp;
  const ancien = long(jeu, VOL_DE_CANAUX);
  empilerLePrologue(jeu, entree);
  empiler(jeu, entree - 16, ancien, ancien);
  poserLong(jeu, VOL_DE_CANAUX, permis);
  return ancien;
}

// 0x88D4B — fabriquer un pointeur lointain : décalage dans eax, sélecteur dans dx. L'original range
// le sélecteur par un mot dans une variable de quatre octets et rend celle-ci entière dans edx : le
// mot haut d'edx est ce qui traînait sur la pile, 18 octets sous l'entrée (les appelants ne
// lisent que dx).
function pointeurLointainDe(jeu, decalage, selecteur) {
  const R = jeu.T.R, entree = R.esp;
  empilerLePrologue(jeu, entree);
  poserMot(jeu, entree - 20, selecteur);
  poserLong(jeu, entree - 24, decalage);
  R.edx = longSigne(jeu, entree - 20);
  return decalage;
}

// Le gestionnaire de morceau. Ses tables, indexées par le numéro du morceau s (en [0xC34ED]) :
const MORCEAU_DU_GESTIONNAIRE = 0xC34ED;
const MORCEAU_ACTIF = 0xBFF4E;            // mot long par morceau
const MORCEAU_EN_PAUSE = 0xBFF2E;         // mot long par morceau (non établi : en pause)
const NOMBRE_DE_PISTES = 0xBFE5A;         // mot long par morceau
const PISTES_RESTANTES = 0xBFE3A;         // mot long par morceau
const TICS_DE_LA_PISTE = 0xBFA0A;         // 0x80 par morceau, un mot long par piste : tics écoulés
const DELAI_DE_LA_PISTE = 0xBF60A;        // 0x80 par morceau : délai du prochain événement
const POSITION_DE_LA_PISTE = 0xBF00A;     // 0xC0 par morceau, un pointeur lointain par piste
const AFFECTATION_DES_PISTES = 0xBFE0A;   // pointeur lointain par morceau : un mot long par piste
const STRUCTURE_DU_MORCEAU = 0xBFF8E;     // pointeur lointain par morceau
const EVENEMENT_DU_MORCEAU = 0xBFFBE;     // mot long par morceau : sa poignée à la minuterie, −1 aucune
const MORCEAU_DE_L_EVENEMENT = 0xC34DD;   // octet par poignée d'événement : le morceau, 0xFF aucun
const LONGUEUR_PAR_STATUT = 0xBFF6E;      // octets : longueur d'un message, par statut >> 4
const LONGUEUR_SYSTEME = 0xBFF7E;         // octets : longueur des messages 0xF0 à 0xFF, par statut & 0xF
const RAPPEL_DE_FIN = 0x300;              // dans la structure du morceau : pointeur lointain de la routine de fin
const META = 0xFF, FIN_DE_PISTE = 0x2F, TEMPO = 0x51, LONGUEUR_TEMPO = 5, LONGUEUR_FIN = 3;
const SYSTEME = 0xF0;
const AUCUN_EVENEMENT = -1, AUCUN_MORCEAU = 0xFF;

const ENVOYER_UN_MESSAGE = 0x863E5;       // (morceau, décalage, sélecteur, affectation, longueur)
const LIRE_UN_DELAI = 0x80034;            // (décalage, sélecteur, &délai, ds) : rend les octets lus
const COUPER_LES_CANAUX = 0x86E23;        // (morceau) : notes coupées, contrôleurs remis, volume à 0
const RETIRER_UN_EVENEMENT = 0x8260A;     // sosTIMERRemoveEvent(poignée)
const REMETTRE_LE_MORCEAU = 0x7FD96;      // (morceau, &pointeur lointain de la structure) : non établi

// 0x88D91 — le gestionnaire de morceau, appelé à chaque tic de son événement. Pour chaque piste :
// un tic de plus ; tant que le délai du prochain événement est échu, l'événement est traité — un
// message MIDI remis au pilote (0x863E5), ou un méta-événement : fin de piste, tempo, autre —, la
// position avance de sa longueur, puis du délai suivant (0x80034, qui le range dans la table). Un
// délai nul enchaîne l'événement suivant sans attendre ; sinon on passe à la piste suivante.
//
// Quand la dernière piste finit : le morceau est désactivé, ses canaux coupés (0x86E23), son
// événement retiré de la minuterie, le morceau remis (0x7FD96, par un pointeur lointain vers une
// copie locale de son pointeur), puis sa routine de fin appelée si elle existe (appel lointain,
// le numéro du morceau en argument), et le gestionnaire rend la main aussitôt.
//
// **Anomalie reproduite** : si le morceau n'a pas d'événement (poignée −1), l'octet 0xC34DC, juste
// avant la table des morceaux par événement, reçoit 0xFF.
//
// Appel lointain (retf), sous l'interruption, sur la pile privée de SOS. Le cadre de l'original
// est tenu en mémoire, comme il le tenait : 16 octets de registres sauvés, puis 0x34 de variables
// — [ebp-4] la piste (un octet), [ebp-0x10] la longueur de l'événement puis les octets du délai,
// [ebp-0x18] et [ebp-0x14] la position avancée (décalage, sélecteur), [ebp-0x34] le genre d'un
// méta-événement (un octet), [ebp-0x30] à [ebp-0x1C] les copies de la fin du morceau. Les appels
// sont faits 0x44 octets sous l'entrée, avec l'ebp du cadre et l'ebx qu'avait l'original : les
// fonctions appelées les empilent.
const LOCALES_DU_GESTIONNAIRE = 0x34;
function gestionnaireDeMorceau(jeu, R) {
  const entree = R.esp >>> 0;
  const ebp = entree - 16, pile = ebp - LOCALES_DU_GESTIONNAIRE;
  const appelant = { ebx: R.ebx, ebp: R.ebp };
  empilerLePrologue(jeu, entree);
  const g = { gs: R.gs, ebx: R.ebx };
  // Un appel : gs, ebx et ebp tels que l'original les avait ; gs relevé au retour.
  g.appeler = (retour, adresse, ...args) => {
    R.gs = g.gs; R.ebx = g.ebx; R.ebp = ebp;
    const resultat = appelerDepuis(jeu, retour, pile, adresse, ...args);
    g.gs = R.gs;
    return resultat;
  };
  const sortir = () => { R.gs = g.gs; R.ebx = appelant.ebx; R.ebp = appelant.ebp; };
  const s = octet(jeu, MORCEAU_DU_GESTIONNAIRE);
  if (long(jeu, MORCEAU_ACTIF + 4 * s) === 0 || long(jeu, MORCEAU_EN_PAUSE + 4 * s) !== 0) { sortir(); return; }
  const PISTE = ebp - 4, LONGUEUR = ebp - 0x10, AVANCEE = ebp - 0x18, GENRE = ebp - 0x34;
  poserOctet(jeu, PISTE, 0);
  for (let t = 0; t < long(jeu, NOMBRE_DE_PISTES + 4 * s); t = (t + 1) & 0xFF, poserOctet(jeu, PISTE, t)) {
    const tics = TICS_DE_LA_PISTE + 0x80 * s + 4 * t;
    const delai = DELAI_DE_LA_PISTE + 0x80 * s + 4 * t;
    const position = POSITION_DE_LA_PISTE + PAR_PILOTE * s + PAR_DESCRIPTEUR * t;
    poserLong(jeu, tics, long(jeu, tics) + 1);
    if (estNul(jeu, position)) continue;
    g.ebx = s << 7;
    if (long(jeu, delai) > long(jeu, tics)) continue;
    for (;;) {
      g.gs = selecteurDe(jeu, position);
      const p = pointeurLointain(jeu, position);
      const statut = octet(jeu, p);
      poserLong(jeu, LONGUEUR, statut < SYSTEME
        ? octet(jeu, LONGUEUR_PAR_STATUT + (statut >> 4))
        : octet(jeu, LONGUEUR_SYSTEME + (statut & 0xF)));
      if (statut === META) {
        g.ebx = long(jeu, position);
        const genre = octet(jeu, p + 1);
        poserOctet(jeu, GENRE, genre);
        if (genre === FIN_DE_PISTE) {
          poserMot(jeu, position + 4, 0);
          poserLong(jeu, position, 0);
          const restantes = PISTES_RESTANTES + 4 * s;
          poserLong(jeu, restantes, long(jeu, restantes) - 1);
          if (long(jeu, restantes) === 0) {
            finirLeMorceau(jeu, R, s, ebp, g);
            sortir();
            return;
          }
          poserLong(jeu, LONGUEUR, LONGUEUR_FIN);
        } else if (genre === TEMPO) {
          poserLong(jeu, LONGUEUR, LONGUEUR_TEMPO);
        }
      } else {
        const affectations = AFFECTATION_DES_PISTES + PAR_DESCRIPTEUR * s;
        g.gs = selecteurDe(jeu, affectations);
        const affectation = long(jeu, pointeurLointain(jeu, affectations) + 4 * t);
        g.ebx = mot(jeu, position + 4);
        g.appeler(0x8913C, ENVOYER_UN_MESSAGE, s, long(jeu, position), mot(jeu, position + 4), affectation,
          long(jeu, LONGUEUR));
      }
      poserLong(jeu, tics, 0);
      if (estNul(jeu, position)) break;
      // La position avance de la longueur de l'événement, puis des octets du délai qui suit.
      const avancer = (n) => {
        poserMot(jeu, AVANCEE + 4, mot(jeu, position + 4));
        poserLong(jeu, AVANCEE, long(jeu, position) + n);
        poserMot(jeu, position + 4, mot(jeu, AVANCEE + 4));
        poserLong(jeu, position, long(jeu, AVANCEE));
      };
      avancer(long(jeu, LONGUEUR));
      poserLong(jeu, LONGUEUR, g.appeler(0x8922E, LIRE_UN_DELAI, long(jeu, position), mot(jeu, position + 4), delai,
        R.ds & 0xFFFF));
      avancer(long(jeu, LONGUEUR));
      if (long(jeu, delai) !== 0) break;
    }
  }
  sortir();
}

// La fin du morceau. 0x7FD96 reçoit l'adresse d'une variable du cadre : la copie du pointeur
// lointain du morceau.
function finirLeMorceau(jeu, R, s, ebp, g) {
  poserLong(jeu, MORCEAU_ACTIF + 4 * s, 0);
  g.appeler(0x88FCC, COUPER_LES_CANAUX, s);
  const evenement = EVENEMENT_DU_MORCEAU + 4 * s;
  if (longSigne(jeu, evenement) !== AUCUN_EVENEMENT) g.appeler(0x88FF7, RETIRER_UN_EVENEMENT, long(jeu, evenement));
  poserOctet(jeu, MORCEAU_DE_L_EVENEMENT + longSigne(jeu, evenement), AUCUN_MORCEAU);
  poserLong(jeu, evenement, AUCUN_EVENEMENT);
  // La structure du morceau et sa routine de fin, copiées dans les variables locales.
  const structure = STRUCTURE_DU_MORCEAU + PAR_DESCRIPTEUR * s;
  g.gs = selecteurDe(jeu, structure);
  const morceau = pointeurLointain(jeu, structure);
  const RAPPEL = ebp - 0x20, COPIE_DU_RAPPEL = ebp - 0x28, COPIE_DU_MORCEAU = ebp - 0x30;
  poserMot(jeu, RAPPEL + 4, mot(jeu, morceau + RAPPEL_DE_FIN + 4));
  poserLong(jeu, RAPPEL, long(jeu, morceau + RAPPEL_DE_FIN));
  poserMot(jeu, COPIE_DU_MORCEAU + 4, mot(jeu, structure + 4));
  poserLong(jeu, COPIE_DU_MORCEAU, long(jeu, structure));
  poserMot(jeu, COPIE_DU_RAPPEL + 4, mot(jeu, RAPPEL + 4));
  poserLong(jeu, COPIE_DU_RAPPEL, long(jeu, RAPPEL));
  poserMot(jeu, structure + 4, 0);
  poserLong(jeu, structure, 0);
  g.appeler(0x890AB, REMETTRE_LE_MORCEAU, s, COPIE_DU_MORCEAU, R.ss & 0xFFFF);
  if (long(jeu, RAPPEL) !== 0 || mot(jeu, RAPPEL + 4) !== 0) {
    R.gs = g.gs; R.ebx = g.ebx; R.ebp = ebp;
    appelerLoinDepuis(jeu, 0x890C6, ebp - LOCALES_DU_GESTIONNAIRE, long(jeu, RAPPEL), mot(jeu, RAPPEL + 4), s);
    g.gs = R.gs;
  }
}

// 0x89E5C — le tempo d'un morceau, en pour cent de celui de son fichier (vraisemblablement
// sosMIDISetSongTempo ; appelée par 0x80E40, systeme.js, pour la musique des attractions). Le mot
// long +0x38 de la structure du morceau (sa cadence d'origine, en tics par seconde : non établi
// au-delà) est mis à l'échelle — tempo × 65 536 / 100, en 16.16 —, au moins 1, et devient la
// fréquence de l'événement du morceau à la minuterie de SOS (0x82496) ; la fonction rend la
// fréquence alors retenue (0x827B9). Un morceau fini n'est pas touché : elle rend 0.
//
// ebx garde, pendant les deux appels, le produit mis à l'échelle, gs le sélecteur de la structure,
// comme dans l'original (une interruption livrée pendant l'appel les voit). Exercée par films et
// musique-negociations (214 appels).
const MORCEAU_FINI = 0x82174;
const CHANGER_LA_FREQUENCE = 0x82496, FREQUENCE_D_UN_EVENEMENT = 0x827B9;
const CADENCE_DU_MORCEAU = 0x38;
function reglerLeTempo(jeu, morceau, tempo) {
  const R = jeu.T.R, entree = R.esp >>> 0;
  const ebp = entree - 16, pile = ebp - 0xC;
  const appelant = { ebx: R.ebx, ebp: R.ebp };
  empilerLePrologue(jeu, entree);
  const appeler = (retour, adresse, ...args) => { R.ebp = ebp; return appelerDepuis(jeu, retour, pile, adresse, ...args); };
  let resultat = 0;
  if (appeler(0x89E70, MORCEAU_FINI, morceau) === 0) {
    const echelle = Math.floor(((tempo << 16) >>> 0) / 100);
    poserLong(jeu, ebp - 4, echelle);
    const structure = STRUCTURE_DU_MORCEAU + 6 * morceau;
    const produit = Math.imul(echelle, long(jeu, pointeurLointain(jeu, structure) + CADENCE_DU_MORCEAU));
    const frequence = (produit >>> 16) || 1;
    poserLong(jeu, ebp - 8, frequence);
    R.gs = selecteurDe(jeu, structure);
    R.ebx = produit;
    appeler(0x89ECE, CHANGER_LA_FREQUENCE, long(jeu, EVENEMENT_DU_MORCEAU + 4 * morceau), frequence);
    resultat = appeler(0x89EE2, FREQUENCE_D_UN_EVENEMENT, long(jeu, EVENEMENT_DU_MORCEAU + 4 * morceau));
  }
  poserLong(jeu, ebp - 0xC, resultat);
  R.ebx = appelant.ebx;
  R.ebp = appelant.ebp;
  return resultat;
}

// =================================================================================================
// 6. LES BANQUES DE SONS
// =================================================================================================
//
// La fiche d'une banque : le nom du fichier en +0 (« * » en tête : un bloc vide, sans fichier),
// +0x1C l'adresse où ranger le pointeur du bloc, +0x20 celle où ranger sa fin (0 : aucune), +0x24
// la taille, +0x28 bit 0 : le bloc est pris par 0x7E9B8 (arrondi à 16) plutôt que 0x7E8D0.
const FICHE = { NOM: 0, POINTEUR: 0x1C, FIN: 0x20, TAILLE: 0x24, DRAPEAUX: 0x28 };
const SANS_FICHIER = 0x2A;                // '*'
const RAMASSER_LA_MEMOIRE = 0x82950, RENDRE_UN_BLOC = 0x7EDC0;
const ALLOUER = 0x7E8D0, ALLOUER_ARRONDI = 0x7E9B8;
const TAILLE_DEPLIEE = 0x7F4B0, CHARGER_UN_FICHIER = 0x7F0B0;

// 0x8BAB0 — rendre le bloc d'une banque, s'il y en a un, et oublier son pointeur.
function rendreUneBanque(jeu, fiche) {
  const entree = jeu.T.R.esp;
  const pointeur = long(jeu, fiche + FICHE.POINTEUR);
  if (long(jeu, pointeur) === 0) return;
  appelerDepuis(jeu, 0x8BAD4, entree - 16, RENDRE_UN_BLOC, long(jeu, pointeur));
  poserLong(jeu, long(jeu, fiche + FICHE.POINTEUR), 0);
}

// 0x8B980 — charger une banque : le tas amorcé (0x82950), l'ancien bloc rendu, un bloc pris à la
// taille du fichier une fois déplié (0x7F4B0), le fichier lu et déplié dedans (0x7F0B0). Rend 1 ;
// 0 si le fichier est vide ou introuvable, ou si sa lecture n'a pas rendu la taille attendue ; −1
// si le bloc n'a pu être pris (0 pour un bloc sans fichier).
// **Anomalies reproduites** : après une lecture incomplète, le bloc n'est pas rendu (il est
// seulement oublié), et la fin est écrite sans vérifier que son adresse n'est pas nulle.
function chargerUneBanque(jeu, fiche) {
  const entree = jeu.T.R.esp, pile = entree - 24;
  appelerDepuis(jeu, 0x8B991, pile, RAMASSER_LA_MEMOIRE);
  const allouer = (octet(jeu, fiche + FICHE.DRAPEAUX) & 1) ? ALLOUER_ARRONDI : ALLOUER;
  appelerDepuis(jeu, 0x8B9B3, pile, 0x8BAB0, fiche);
  if (octet(jeu, fiche + FICHE.NOM) === SANS_FICHIER) {
    const bloc = appelerDepuis(jeu, 0x8B9C7, pile, allouer, long(jeu, fiche + FICHE.TAILLE));
    poserLong(jeu, long(jeu, fiche + FICHE.POINTEUR), bloc);
    if (long(jeu, long(jeu, fiche + FICHE.POINTEUR)) === 0) return 0;
  } else {
    poserLong(jeu, fiche + FICHE.TAILLE, appelerDepuis(jeu, 0x8B9F2, pile, TAILLE_DEPLIEE, fiche));
    if (longSigne(jeu, fiche + FICHE.TAILLE) <= 0) return 0;
    const bloc = appelerDepuis(jeu, 0x8BA1A, pile, allouer, long(jeu, fiche + FICHE.TAILLE));
    poserLong(jeu, long(jeu, fiche + FICHE.POINTEUR), bloc);
    if (long(jeu, long(jeu, fiche + FICHE.POINTEUR)) === 0) return -1;
    const lus = appelerDepuis(jeu, 0x8BA3C, pile, CHARGER_UN_FICHIER, fiche, long(jeu, long(jeu, fiche + FICHE.POINTEUR)));
    if ((lus | 0) !== longSigne(jeu, fiche + FICHE.TAILLE)) {
      poserLong(jeu, long(jeu, fiche + FICHE.POINTEUR), 0);
      poserLong(jeu, long(jeu, fiche + FICHE.FIN), 0);
      poserLong(jeu, fiche + FICHE.TAILLE, 0);
      return 0;
    }
  }
  if (long(jeu, fiche + FICHE.FIN) !== 0) {
    poserLong(jeu, long(jeu, fiche + FICHE.FIN),
      long(jeu, long(jeu, fiche + FICHE.POINTEUR)) + long(jeu, fiche + FICHE.TAILLE));
  }
  return 1;
}

// =================================================================================================
// 7. LE `scanf` DE WATCOM
// =================================================================================================
//
// La description de la lecture ('_SCNF_SPECS'), sur la pile de `vsscanf` : +0 la routine qui
// prend un caractère ('cget_rtn', 0x8334A pour une chaîne), +4 celle qui le rend ('uncget_rtn',
// 0x8336C), +8 la position dans la chaîne, +0xC la largeur du champ (−1 : aucune), +0x10 les
// drapeaux, un octet.
const SPECS = { PRENDRE: 0, RENDRE: 4, LARGEUR: 0xC, DRAPEAUX: 0x10 };
const F = {
  AFFECTER: 0x01,        // pas de « * » : la valeur est rangée
  FIN_DE_LECTURE: 0x02,  // 'eoinp'
  LOINTAIN: 0x04,        // « F » : l'argument est un pointeur lointain
  PROCHE: 0x08,          // « N »
  COURT: 0x10,           // « h »
  LONG: 0x20,            // « l » ou « w »
  LONG_DOUBLE: 0x40,     // « L »
  DEUX_POINTS: 0x80,     // effacé par 'get_opt' et jamais posé : la lecture « segment:décalage » est morte
};
const FIN = -1;          // EOF
const drapeaux = (jeu, specs) => octet(jeu, specs + SPECS.DRAPEAUX);
const poserDrapeaux = (jeu, specs, v) => poserOctet(jeu, specs + SPECS.DRAPEAUX, v);

// Prendre un caractère, en rendre un : les routines de la description, appelées comme l'original
// (hauteur de pile et adresse de retour de l'appel).
const prendre = (jeu, retour, pile, specs) => appelerDepuis(jeu, retour, pile, long(jeu, specs + SPECS.PRENDRE), specs) | 0;
const rendre = (jeu, retour, pile, specs, c) => appelerDepuis(jeu, retour, pile, long(jeu, specs + SPECS.RENDRE), c, specs);

// 0x8B7EC — 'cgetw' : un caractère du champ, ou EOF si la largeur est épuisée (elle est décomptée
// à chaque appel) ou la lecture finie.
function prendreDansLeChamp(jeu, specs) {
  const entree = jeu.T.R.esp;
  const largeur = longSigne(jeu, specs + SPECS.LARGEUR);
  poserLong(jeu, specs + SPECS.LARGEUR, largeur - 1);
  if (largeur === 0) return FIN;
  const c = prendre(jeu, 0x8B800, entree - 8, specs);
  return (drapeaux(jeu, specs) & F.FIN_DE_LECTURE) ? FIN : c;
}
const cgetw = (jeu, retour, pile, specs) => appelerDepuis(jeu, retour, pile, 0x8B7EC, specs) | 0;

// 0x8B7B8 — 'radix_value' : la valeur d'un chiffre jusqu'en base 16 (tolower, 0x8A987), 16 sinon.
function valeurDuChiffre(jeu, c) {
  c |= 0;
  if (c >= 0x30 && c <= 0x39) return c - 0x30;
  const m = appelerDepuis(jeu, 0x8B7D3, jeu.T.R.esp - 4, 0x8A987, c) | 0;
  if (m >= 0x61 && m <= 0x66) return m - 0x57;
  return 16;
}

// 0x8AF18 — 'get_opt' : après un « % », l'astérisque, la largeur, « N » ou « F », puis « h », « l »,
// « w » ou « L ». Rend la position dans le format.
function lireLesOptions(jeu, format, specs) {
  let f = format >>> 0;
  let d = (drapeaux(jeu, specs) | F.AFFECTER) & ~(F.LOINTAIN | F.PROCHE | F.COURT | F.LONG | F.LONG_DOUBLE | F.DEUX_POINTS);
  poserDrapeaux(jeu, specs, d);
  poserLong(jeu, specs + SPECS.LARGEUR, -1);
  if (octet(jeu, f) === 0x2A) {                        // « * »
    f++;
    poserDrapeaux(jeu, specs, drapeaux(jeu, specs) & ~F.AFFECTER);
  }
  if (estUnChiffre(jeu, octet(jeu, f))) {
    let largeur = 0;
    do {
      largeur = (Math.imul(largeur, 10) + (octet(jeu, f) - 0x30)) | 0;
      f++;
    } while (estUnChiffre(jeu, octet(jeu, f)));
    poserLong(jeu, specs + SPECS.LARGEUR, largeur);
  }
  if (octet(jeu, f) === 0x4E) { f++; poserDrapeaux(jeu, specs, drapeaux(jeu, specs) | F.PROCHE); }        // « N »
  else if (octet(jeu, f) === 0x46) { f++; poserDrapeaux(jeu, specs, drapeaux(jeu, specs) | F.LOINTAIN); } // « F »
  const c = octet(jeu, f);
  if (c === 0x68) { f++; poserDrapeaux(jeu, specs, drapeaux(jeu, specs) | F.COURT); }                     // « h »
  else if (c === 0x6C || c === 0x77) { f++; poserDrapeaux(jeu, specs, drapeaux(jeu, specs) | F.LONG); }   // « l », « w »
  else if (c === 0x4C) { f++; poserDrapeaux(jeu, specs, drapeaux(jeu, specs) | F.LONG_DOUBLE); }         // « L »
  return f;
}

// 0x8AFE5 — 'scan_white' : sauter les blancs de l'entrée ; le premier caractère qui n'en est pas
// un est rendu (sauf en fin de lecture). Rend le nombre de blancs sautés.
function sauterLesBlancs(jeu, specs) {
  const pile = jeu.T.R.esp - 12;
  let n = 0, c;
  for (;;) {
    c = prendre(jeu, 0x8AFF2, pile, specs);
    if (!estUnBlanc(jeu, c)) break;
    n++;
  }
  if (!(drapeaux(jeu, specs) & F.FIN_DE_LECTURE)) rendre(jeu, 0x8B013, pile, specs, c);
  return n;
}

// L'argument suivant de la liste : un pointeur, proche (4 octets) ou lointain (6, rangés sur 8).
// `liste` est l'adresse de la variable qui parcourt les arguments.
function argumentSuivant(jeu, liste, specs) {
  const R = jeu.T.R;
  if (drapeaux(jeu, specs) & F.LOINTAIN) {
    poserLong(jeu, liste, long(jeu, liste) + 8);
    const a = long(jeu, liste) - 8;
    return { decalage: long(jeu, a), selecteur: mot(jeu, a + 4) };
  }
  poserLong(jeu, liste, long(jeu, liste) + 4);
  return { decalage: long(jeu, long(jeu, liste) - 4), selecteur: R.ds & 0xFFFF };
}

// 0x8B09D — 'scan_string' (%s) : les blancs sautés, puis les caractères jusqu'au prochain blanc,
// dans la largeur du champ ; rangés (octets, ou mots avec « l »), terminés par un zéro. Rend le
// nombre de caractères pris, blancs sautés compris ; 0 en fin de lecture.
function lireUneChaine(jeu, specs, liste) {
  const R = jeu.T.R;
  const pile = R.esp - 28, esAvant = R.es;
  const taille = (drapeaux(jeu, specs) & F.LONG) ? 2 : 1;
  let destination = 0;
  if (drapeaux(jeu, specs) & F.AFFECTER) {
    const a = argumentSuivant(jeu, liste, specs);
    R.es = a.selecteur;
    destination = lineaire(jeu, a.decalage, a.selecteur);
  }
  const ranger = (v) => {
    if (taille === 1) poserOctet(jeu, destination, v); else poserMot(jeu, destination, v);
  };
  let n = 0, c;
  for (;;) {
    c = prendre(jeu, 0x8B0EC, pile, specs);
    if (!estUnBlanc(jeu, c)) break;
    n++;
  }
  if (drapeaux(jeu, specs) & F.FIN_DE_LECTURE) {
    n = 0;
  } else {
    const largeur = longSigne(jeu, specs + SPECS.LARGEUR);
    poserLong(jeu, specs + SPECS.LARGEUR, largeur - 1);
    let rendu = true;
    if (largeur !== 0) {
      for (;;) {
        n++;
        if (drapeaux(jeu, specs) & F.AFFECTER) { ranger(c); destination += taille; }
        c = cgetw(jeu, 0x8B143, pile, specs);
        if (c === FIN) { rendu = false; break; }
        if (estUnBlanc(jeu, c)) break;
      }
    }
    if (rendu) rendre(jeu, 0x8B166, pile, specs, c);
  }
  if ((drapeaux(jeu, specs) & F.AFFECTER) && n > 0) ranger(0);
  R.es = esAvant;
  return n;
}

// 0x8B5BB — 'scan_int' (%d, %i, %o, %u, %x, %X, %p) : blancs sautés, un signe si `signe` le permet,
// puis les chiffres de la base (0 : la base se lit au préfixe, « 0x » 16, « 0 » 8, sinon 10). Le
// dernier caractère lu est rendu. Rend le nombre de caractères du nombre plus les blancs et le
// signe, ou 0 et moins s'il n'y a pas de chiffre. La valeur est rangée sur 16 bits avec « h »,
// sur 32 sinon.
function lireUnEntier(jeu, specs, liste, base, signe) {
  const R = jeu.T.R;
  const pile = R.esp - 36;
  let valeur = 0, chiffres = 0, autres = 0, c;
  let signeLu = 0x2B;                                   // « + »
  const fini = () => {
    if (signeLu === 0x2D) valeur = -valeur | 0;
    if (chiffres <= 0) return chiffres;
    chiffres += autres;
    if (!(drapeaux(jeu, specs) & F.AFFECTER)) return chiffres;
    const a = argumentSuivant(jeu, liste, specs);
    const destination = lineaire(jeu, a.decalage, a.selecteur);
    if (drapeaux(jeu, specs) & F.COURT) poserMot(jeu, destination, valeur);
    else poserLong(jeu, destination, valeur);
    return chiffres;
  };
  for (;;) {
    c = prendre(jeu, 0x8B5D8, pile, specs);
    if (!estUnBlanc(jeu, c)) break;
    autres++;
  }
  if (drapeaux(jeu, specs) & F.FIN_DE_LECTURE) return fini();
  const largeur = longSigne(jeu, specs + SPECS.LARGEUR);
  poserLong(jeu, specs + SPECS.LARGEUR, largeur - 1);
  const rendreEtFinir = () => { rendre(jeu, 0x8B74F, pile, specs, c); return fini(); };
  if (largeur === 0) return rendreEtFinir();
  if (signe !== 0 && (c === 0x2B || c === 0x2D)) {
    autres++;
    signeLu = c;
    c = cgetw(jeu, 0x8B632, pile, specs);
    if (c === FIN) return fini();
  }
  // Le préfixe « 0x » : deux caractères de plus comptés avec les blancs.
  const prefixe = (retourZero, retourX) => {
    chiffres = 1;
    c = cgetw(jeu, retourZero, pile, specs);
    if (c === FIN) return false;
    if (c === 0x78 || c === 0x58) {
      autres++;
      chiffres = 0;
      c = cgetw(jeu, retourX, pile, specs);
      autres++;
      if (c === FIN) return false;
      return 'x';
    }
    return true;
  };
  if (base === 0) {
    if (c === 0x30) {
      const p = prefixe(0x8B656, 0x8B67A);
      if (p === false) return fini();
      base = p === 'x' ? 16 : 8;
    } else {
      base = 10;
    }
  } else if (base === 16 && c === 0x30) {
    if (prefixe(0x8B6B7, 0x8B6DB) === false) return fini();
  }
  for (;;) {
    const v = appelerDepuis(jeu, 0x8B6F5, pile, 0x8B7B8, c) | 0;
    if (v >= base) break;
    valeur = (Math.imul(valeur, base) + v) | 0;
    chiffres++;
    c = cgetw(jeu, 0x8B70E, pile, specs);
    if (c === FIN) return fini();
  }
  // La suite « :décalage » d'un %p lointain : morte, le drapeau n'étant jamais posé.
  if (c === 0x3A && (drapeaux(jeu, specs) & F.DEUX_POINTS)) {
    for (;;) {
      chiffres++;
      c = cgetw(jeu, 0x8B723, pile, specs);
      if (c === FIN) return fini();
      const v = appelerDepuis(jeu, 0x8B734, pile, 0x8B7B8, c) | 0;
      if (v >= base) break;
      valeur = (Math.imul(valeur, base) + v) | 0;
    }
  }
  return rendreEtFinir();
}

// 0x8AD11 — '__scnf' : le moteur de `scanf`. Un blanc du format saute les blancs de l'entrée ; un
// autre caractère doit être lu tel quel ; « % » introduit une conversion. Rend le nombre de valeurs
// rangées, ou −1 si la lecture a fini avant la première.
//
// La position dans le format vit dans l'argument lui-même ([ebp+0x18]), que la conversion « [ »
// reçoit par son adresse ; la réécriture l'y garde.
const SCANF_CONVERSIONS = 0x8AD11;
const LIRE_UN_REEL = 0x8B2FB, LIRE_UN_CARACTERE = 0x8B01C, LIRE_UN_ENSEMBLE = 0x8B21C, COMPTER = 0x8B18D;
function scanf(jeu, specs, format, liste) {
  const entree = jeu.T.R.esp, pile = entree - 24;
  const FORMAT = entree + 8;                           // l'argument « format »
  const lireFormat = () => long(jeu, FORMAT);
  const avancer = (f) => poserLong(jeu, FORMAT, f);
  poserDrapeaux(jeu, specs, drapeaux(jeu, specs) & ~F.FIN_DE_LECTURE);
  let ranges = 0, lus = 0;
  const conversion = (retour, adresse, ...args) => appelerDepuis(jeu, retour, pile, adresse, specs, ...args) | 0;
  const echec = (c) => {
    if (!(drapeaux(jeu, specs) & F.FIN_DE_LECTURE)) rendre(jeu, 0x8AD7C, pile, specs, c);
  };
  boucle: for (;;) {
    const f = lireFormat();
    avancer(f + 1);
    let c = octet(jeu, f);
    if (c === 0) break;
    if (estUnBlanc(jeu, c)) {
      lus += conversion(0x8AD53, 0x8AFE5);
    } else if (c !== 0x25) {
      const lu = prendre(jeu, 0x8AD66, pile, specs);
      if (lu !== c) { echec(lu); break; }
      lus++;
    } else {
      const g = appelerDepuis(jeu, 0x8AD95, pile, 0x8AF18, lireFormat(), specs) >>> 0;
      avancer(g);
      c = octet(jeu, g);
      if (c !== 0) avancer(g + 1);
      let r = null;
      switch (c) {
        case 0x64: r = conversion(0x8AE4C, 0x8B5BB, liste, 10, 1); break;              // d
        case 0x69: r = conversion(0x8AE4C, 0x8B5BB, liste, 0, 1); break;               // i
        case 0x6F: r = conversion(0x8AE4C, 0x8B5BB, liste, 8, 1); break;               // o
        case 0x75: r = conversion(0x8AE4C, 0x8B5BB, liste, 10, 0); break;              // u
        case 0x58: case 0x70: case 0x78: r = conversion(0x8AE4C, 0x8B5BB, liste, 16, 1); break;  // X p x
        case 0x45: case 0x47: case 0x65: case 0x66: case 0x67:                        // E G e f g
          r = conversion(0x8AE6E, LIRE_UN_REEL, liste); break;
        case 0x73: r = conversion(0x8AE7A, 0x8B09D, liste); break;                     // s
        case 0x5B: r = conversion(0x8AE87, LIRE_UN_ENSEMBLE, liste, FORMAT); break;    // [
        case 0x63: r = conversion(0x8AE93, LIRE_UN_CARACTERE, liste); break;           // c
        case 0x6E: conversion(0x8AEB4, COMPTER, liste, lus); break;                    // n
        case 0x25: {                                                                   // %
          const lu = prendre(jeu, 0x8AEBC, pile, specs);
          if (lu !== 0x25) { echec(lu); break boucle; }
          break;
        }
        default: break;
      }
      if (r !== null) {
        if (r <= 0) break;
        lus += r;
        if (drapeaux(jeu, specs) & F.AFFECTER) ranges++;
      }
    }
    if (drapeaux(jeu, specs) & F.FIN_DE_LECTURE) {
      // L'entrée est finie : un « %n » qui suit est encore servi.
      const h = lireFormat();
      if (octet(jeu, h) === 0x25) {
        avancer(h + 1);
        const g = appelerDepuis(jeu, 0x8AEE5, pile, 0x8AF18, lireFormat(), specs) >>> 0;
        avancer(g);
        if (octet(jeu, g) === 0x6E) conversion(0x8AEFA, COMPTER, liste, lus);
      }
      break;
    }
  }
  if (ranges === 0 && (drapeaux(jeu, specs) & F.FIN_DE_LECTURE)) return -1;
  return ranges;
}

// =================================================================================================

const COMPARES_AVEC_EDX = ['eax', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'];
// 0x882FC — '_dosretax'(code, échec) : conclure un service du DOS qui rend une valeur dans ax.
// `échec` est non nul si la retenue était mise (l'appelant le tire de `sbb edx, edx`) ; en cas
// d'échec, '__set_errno_dos' (0x88324, runtime.js) range l'erreur et la fonction rend −1 ; sinon
// elle rend le code. Rangée ici, à côté du `scanf`, faute de pouvoir toucher runtime.js, où sa
// voisine 0x882E4 est réécrite. Appelée par 0x8F82F (7 appels dans films : le code de retour d'un
// programme lancé, int 21h, 4Dh).
const ERREUR_DOS = 0x88324;
function conclureParAx(jeu, code, echec) {
  const R = jeu.T.R, entree = R.esp >>> 0;
  const ebp = entree - 4;
  empiler(jeu, entree, R.ebp);
  if (echec === 0) return code;
  const appelant = R.ebp;
  R.ebp = ebp;
  const resultat = appelerDepuis(jeu, 0x8830E, ebp, ERREUR_DOS, code);
  R.ebp = appelant;
  return resultat;
}

// Les descripteurs d'un pilote vivent dans le bloc du module de mélange, dans le tas : hors des
// zones que la comparaison remet d'office.
// =================================================================================================
// 8. LA FIN DES BRUITAGES
// =================================================================================================
//
// Ce que le jeu fait en quittant avec la carte son (0x7EED0, sortie.js) : attendre que les
// bruitages se taisent, couper le volume, arrêter le module, rendre la traduction du DMA à
// Windows. Exercé par le scénario quitter rejoué avec --son.

const VOLUME_MAXIMAL = 0x7FFF;
const PILOTE_NUMERIQUE_DU_JEU = 0xD7B44;   // la poignée du pilote numérique que le jeu a installé

// 0x8F2D1 — le nombre d'échantillons qui jouent sur un pilote : les descripteurs dont le bit 15 des
// drapeaux est levé.
function echantillonsEnCours(jeu, pilote) {
  const R = jeu.T.R, ebp = R.esp - 16;
  empilerLePrologue(jeu, R.esp);          // [ebp-4] le numéro, [ebp-8] le compte, [ebp-0xC] le résultat
  let n = 0;
  for (let k = 0; k < NOMBRE_DE_DESCRIPTEURS; k++) {
    const entree = entreeDuDescripteur(pilote, k);
    R.gs = selecteurDe(jeu, entree);
    if (motSigne(jeu, pointeurLointain(jeu, entree) + D.DRAPEAUX) & EN_COURS) n++;
  }
  poserLong(jeu, ebp - 4, NOMBRE_DE_DESCRIPTEURS);
  poserLong(jeu, ebp - 8, n);
  poserLong(jeu, ebp - 0xC, n);
  return n;
}

// 0x879C0 — les bruitages qui jouent encore sur le pilote numérique du jeu (0x8F2D1).
function bruitagesEnCours(jeu) {
  const R = jeu.T.R, entree = R.esp, ebp = entree - 16;
  empilerLePrologue(jeu, entree);         // [ebp-4] le résultat
  const n = appelerDepuis(jeu, 0x879D7, ebp - 4, 0x8F2D1, long(jeu, PILOTE_NUMERIQUE_DU_JEU));
  poserLong(jeu, ebp - 4, n);
  return n;
}

// 0x87A84 — le volume général d'un pilote (0 à 0x7FFF) : le volume de chacun de ses 32
// descripteurs multiplié par lui, divisé par 0x7FFF. Rend -1 si le pilote n'est pas prêt, 0 sinon.
// (Le produit est signé, la division non signée, comme dans l'original.)
function volumeGeneral(jeu, pilote, volume) {
  const R = jeu.T.R, ebp = R.esp - 16;
  empilerLePrologue(jeu, R.esp);          // [ebp-4] le numéro, [ebp-8] le volume calculé, [ebp-0xC] le résultat
  if (long(jeu, PILOTE_PRET + 4 * pilote) === 0) {
    poserLong(jeu, ebp - 0xC, -1);
    return -1;
  }
  for (let k = 0; k < NOMBRE_DE_DESCRIPTEURS; k++) {
    const entree = entreeDuDescripteur(pilote, k);
    R.gs = selecteurDe(jeu, entree);
    const d = pointeurLointain(jeu, entree);
    const v = Math.floor((Math.imul(volume, motSigne(jeu, d + D.VOLUME)) >>> 0) / VOLUME_MAXIMAL);
    poserLong(jeu, ebp - 8, v);
    poserMot(jeu, d + D.VOLUME, v);
  }
  poserLong(jeu, ebp - 4, NOMBRE_DE_DESCRIPTEURS);
  poserLong(jeu, ebp - 0xC, 0);
  return 0;
}

// 0x8BD59 — fonction 5 du module : l'arrêt du DMA.
function arreterLeDma(jeu, module, decalage, selecteur) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, FONCTION.ARRET_DMA, module, decalage, selecteur, () => {}, 0x8BD75);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BE2C — fonction 1 du module : sa fin.
function finirLeModule(jeu, module, decalage, selecteur) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, FONCTION.FIN, module, decalage, selecteur, () => {}, 0x8BE48);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BFB8 — le pendant de 0x8BF81 : sous Windows 3.1 en mode étendu, rendre aux Virtual DMA Services
// la traduction du canal DMA (int 4Bh, 810Ch).
function traductionDuDma(jeu, canal) {
  const R = jeu.T.R;
  const entree = R.esp, sauves = relever(R), pile = entree - EMPILES_PAR_LES_ROUTINES;
  empilerLesRegistres(jeu, entree);
  R.eax = bas16(R.eax, 0x1600);
  interruption(jeu, pile, 0x2F);
  if ((R.eax & 0xFFFF) === WINDOWS_310) {
    R.eax = bas16(R.eax, 0x810C);
    R.ebx = canal;
    R.edx = bas16(R.edx, 0);
    interruption(jeu, pile, 0x4B);
    R.eax = bas16(R.eax, 0);
  }
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BB6E — « déverrouiller » une zone : c'est la copie de 0x8BB41, service DPMI 0600h compris, qui
// verrouille. Anomalie de SOS, reproduite : la zone est verrouillée une seconde fois au lieu d'être
// rendue (0601h) ; l'hôte, qui ne pagine pas, n'en fait rien.
const deverrouillerUneZone = (jeu, adresse, taille) => verrouillerUneZone(jeu, adresse, taille);

// =================================================================================================
// 9. LA DÉTECTION DE LA CARTE (HMIDET.386)
// =================================================================================================
//
// sosDETInitSystem (0x85793), sosDETFindCard (0x85950), sosDETGetSettings (0x85F3E) et
// sosDETUnInitSystem (0x858FC) : chercher la carte son en essayant les modules de détection de
// HMIDET.386. Le fichier commence par un en-tête de 0x2C octets (le nombre de modules en +0x20) ;
// chaque module, par un en-tête de 0x30 octets (sa taille en +0x24, l'identifiant du pilote qu'il
// détecte en +0x28, un drapeau en +0x2D, bit 7 : utilisable), suivi de son code, que SOS charge dans
// un bloc de 4 Ko verrouillé et appelle par trois portes de la forme de celles de la section 2
// (0x8BD84, fonction 0 : chercher la carte ; 0x8BDAF, fonction 1 : ses réglages ; 0x8BCD0,
// fonction 2 : sa description). L'hôte répond à la place du module (son.js, `fonctionDeDetection`).
// Le jeu ne cherche jamais la carte : son option -o l'en dispense (l'hôte la déclare) ; l'intro-
// duction, si (intro.js : la même ouverture des bruitages, 0x6058B). La minuterie de SOS tourne
// déjà : chaque service peut l'interrompre, d'où les cadres et les registres de l'original.
const DET_OUVERTE = 0xC2D28;              // mot long : sosDETInitSystem fait
const DET_C2D2C = 0xC2D2C;                // mot long : remis à zéro à l'ouverture (non établi)
const DET_CHEMIN = 0xC35ED;               // le chemin de HMIDET.386, fait ici
const DET_NOM = 0xB09D0;                  // « HMIDET.386 »
const DET_FICHIER = 0xE0CB4;              // son descripteur
const DET_EN_TETE = 0xE0CC8;              // l'en-tête du fichier, 0x2C octets
const DET_NOMBRE_DE_MODULES = 0xE0CE8;    // dans cet en-tête
const DET_E0CF0 = 0xE0CF0;                // relu dans une variable, jamais servi (non établi)
const DET_TAMPON = 0xE0CB8;               // le bloc de 4 Ko (malloc) où le module est chargé
const DET_ADRESSE = 0xE0CC0;              // son adresse linéaire
const DET_POINTEUR = 0xE0CF4;             // un pointeur lointain dessus (le sélecteur en +4)
const DET_MODULE = 0xE0CC4;               // l'adresse du module chargé (l'hôte la guette, son.js)
const DET_EN_TETE_DU_MODULE = 0xE0C80;    // 0x30 octets
const DET_POSITION = 0xE0CB0;             // la place, dans le fichier, du module trouvé
const DET_REGLAGES = 0xC4764;             // mots : le port, le dma (+4), l'irq (+8)
const TAILLE_DET_EN_TETE = 0x2C, TAILLE_DET_EN_TETE_DU_MODULE = 0x30, TAILLE_DET_TAMPON = 0x1000;
const DET_TAILLE = 0x24, DET_IDENTIFIANT = 0x28, DET_DRAPEAU = 0x2D, DET_UTILISABLE = 0x80;
const DET_OUVRIR = 0x8614F, DET_LIRE = 0x876B7, DET_POSITIONNER = 0x88394, DET_FERMER = 0x8639A;
const DET_COPIER = 0x7E1ED, DET_AJOUTER = 0x81336, DET_MALLOC = 0x8A5A1, DET_LIBERER = 0x8B8E8;
const DET_CHERCHER = 0x8BD84, DET_REGLER = 0x8BDAF, DET_DECRIRE = 0x8BCD0;
const s8 = (v) => (v << 24) >> 24;

// Le prologue du code C de SOS, comme l'original : ebx, esi, edi, ebp empilés, ebp posé sur eux ;
// `pile`, le pointeur de pile sous les `locales` octets de variables ; `fermer` rend les registres.
function ouvrirLeCadre(jeu, locales) {
  const R = jeu.T.R, entree = R.esp >>> 0;
  empilerLePrologue(jeu, entree);
  const sauves = { ebx: R.ebx, esi: R.esi, edi: R.edi, ebp: R.ebp };
  const ebp = (entree - 16) | 0;
  R.ebp = ebp;
  return { ebp, pile: (ebp - locales) | 0, fermer: () => Object.assign(R, sauves) };
}

// 0x85793 — sosDETInitSystem(chemin lointain) : le chemin de HMIDET.386 (le dossier donné, ou aucun),
// le fichier ouvert et son en-tête lu, un bloc de 4 Ko pris (malloc), un pointeur lointain fait
// dessus, le bloc verrouillé, le fichier rembobiné. Rend 0 ; 3 si c'est déjà fait, 0xF sans fichier,
// 5 sans mémoire. (Le décalage du chemin seul est pris, son sélecteur ignoré.)
function initialiserLaDetection(jeu, cheminDecalage, cheminSelecteur) {
  const R = jeu.T.R;
  const c = ouvrirLeCadre(jeu, 0xC);
  const fin = (code) => { poserLong(jeu, c.ebp - 0xC, code); return code; };
  try {
    if (long(jeu, DET_OUVERTE) !== 0) return fin(3);
    poserLong(jeu, c.ebp - 8, TAILLE_DET_EN_TETE);
    if (cheminDecalage !== 0 || (cheminSelecteur & 0xFFFF) !== 0) {
      appelerDepuis(jeu, 0x857D7, c.pile, DET_COPIER, DET_CHEMIN, cheminDecalage);
      appelerDepuis(jeu, 0x857EB, c.pile, DET_AJOUTER, DET_CHEMIN, DET_NOM);
    } else {
      appelerDepuis(jeu, 0x85801, c.pile, DET_COPIER, DET_CHEMIN, DET_NOM);
    }
    poserLong(jeu, DET_FICHIER, appelerDepuis(jeu, 0x85814, c.pile, DET_OUVRIR, DET_CHEMIN, 0x200));
    if (longSigne(jeu, DET_FICHIER) === -1) return fin(0xF);
    appelerDepuis(jeu, 0x85845, c.pile, DET_LIRE, long(jeu, DET_FICHIER), DET_EN_TETE, long(jeu, c.ebp - 8));
    poserLong(jeu, c.ebp - 4, long(jeu, DET_E0CF0));
    poserLong(jeu, DET_TAMPON, appelerDepuis(jeu, 0x8585A, c.pile, DET_MALLOC, TAILLE_DET_TAMPON));
    if (long(jeu, DET_TAMPON) === 0) {
      appelerDepuis(jeu, 0x85876, c.pile, DET_FERMER, long(jeu, DET_FICHIER));
      return fin(5);
    }
    poserLong(jeu, DET_ADRESSE, appelerDepuis(jeu, 0x8588D, c.pile, 0x8BBCB, long(jeu, DET_TAMPON)));
    const decalage = appelerDepuis(jeu, 0x858A0, c.pile, 0x8BBF6, long(jeu, DET_ADRESSE));
    R.ebx = R.edx;                                         // mov ebx, edx ; mov ecx, eax
    R.ecx = decalage;
    poserMot(jeu, DET_POINTEUR + 4, R.ebx);
    poserLong(jeu, DET_POINTEUR, decalage);
    appelerDepuis(jeu, 0x858C4, c.pile, 0x8BB41, long(jeu, DET_TAMPON), TAILLE_DET_TAMPON);
    appelerDepuis(jeu, 0x858D6, c.pile, DET_POSITIONNER, long(jeu, DET_FICHIER), 0, 0);
    poserLong(jeu, DET_C2D2C, 0);
    poserLong(jeu, DET_OUVERTE, 1);
    return fin(0);
  } finally { c.fermer(); }
}

// 0x858FC — sosDETUnInitSystem() : le fichier fermé, le bloc « déverrouillé » (0x8BB6E, qui le
// verrouille encore) et rendu. Rend 0.
function fermerLaDetection(jeu) {
  const c = ouvrirLeCadre(jeu, 4);
  try {
    poserLong(jeu, DET_OUVERTE, 0);
    appelerDepuis(jeu, 0x8591D, c.pile, DET_FERMER, long(jeu, DET_FICHIER));
    appelerDepuis(jeu, 0x85930, c.pile, 0x8BB6E, long(jeu, DET_TAMPON), TAILLE_DET_TAMPON);
    appelerDepuis(jeu, 0x8593E, c.pile, DET_LIBERER, long(jeu, DET_TAMPON));
    poserLong(jeu, c.ebp - 4, 0);
    return 0;
  } finally { c.fermer(); }
}

// 0x85950 — sosDETFindCard(identifiant, &description lointaine, &poignée lointaine) : les modules
// de HMIDET.386 passés en revue ; le premier utilisable qui détecte ce pilote est chargé dans le
// bloc, et sa fonction 0 cherche la carte. Trouvée, sa description est recopiée (fonction 2), et la
// poignée reçoit ce que la fonction 0 a rendu (le port). Rend 0 ; 2 sans description, 6 pour un
// identifiant hors de 0xE000 à 0xE200, 7 sans module, 8 sans carte. Anomalie reproduite : la revue
// va jusqu'au module suivant le dernier (index ≤ nombre). gs et edx restent sur la poignée.
function chercherLaCarte(jeu, identifiant, descriptionDecalage, descriptionSelecteur, poigneeDecalage, poigneeSelecteur) {
  const R = jeu.T.R;
  const c = ouvrirLeCadre(jeu, 0x1C);
  const fin = (code) => { poserLong(jeu, c.ebp - 0x1C, code); return code; };
  const fichier = () => long(jeu, DET_FICHIER);
  try {
    poserLong(jeu, c.ebp - 8, 0);
    poserLong(jeu, c.ebp - 0x14, TAILLE_DET_EN_TETE_DU_MODULE);
    if (descriptionDecalage === 0 && (descriptionSelecteur & 0xFFFF) === 0) return fin(2);
    if ((identifiant >>> 0) < 0xE000 || (identifiant >>> 0) > 0xE200) return fin(6);
    poserLong(jeu, c.ebp - 0xC, 0);
    poserLong(jeu, c.ebp - 0x10, 0);
    appelerDepuis(jeu, 0x859BE, c.pile, DET_POSITIONNER, fichier(), 0, 0);
    appelerDepuis(jeu, 0x859D4, c.pile, DET_LIRE, fichier(), DET_EN_TETE, TAILLE_DET_EN_TETE);
    for (;;) {
      const i = long(jeu, c.ebp - 8);
      if (i > long(jeu, DET_NOMBRE_DE_MODULES) || long(jeu, c.ebp - 0xC) !== 0) break;
      poserLong(jeu, c.ebp - 0x18, appelerDepuis(jeu, 0x859FC, c.pile, DET_POSITIONNER, fichier(), 0, 1));
      appelerDepuis(jeu, 0x85A16, c.pile, DET_LIRE, fichier(), DET_EN_TETE_DU_MODULE, long(jeu, c.ebp - 0x14));
      const taille = long(jeu, DET_EN_TETE_DU_MODULE + DET_TAILLE);
      poserLong(jeu, c.ebp - 4, taille);
      if (long(jeu, DET_EN_TETE_DU_MODULE + DET_IDENTIFIANT) === (identifiant >>> 0)
        && (octet(jeu, DET_EN_TETE_DU_MODULE + DET_DRAPEAU) & DET_UTILISABLE)) {
        poserLong(jeu, c.ebp - 0xC, 1);
        appelerDepuis(jeu, 0x85A51, c.pile, DET_LIRE, fichier(), long(jeu, DET_TAMPON), taille);
        poserLong(jeu, DET_MODULE, long(jeu, DET_TAMPON));
      } else {
        appelerDepuis(jeu, 0x85A70, c.pile, DET_POSITIONNER, fichier(), taille, 1);
      }
      poserLong(jeu, c.ebp - 8, i + 1);
    }
    if (long(jeu, c.ebp - 0xC) !== 1) return fin(7);
    const module = [long(jeu, DET_MODULE), long(jeu, DET_POINTEUR), mot(jeu, DET_POINTEUR + 4)];
    const port = appelerDepuis(jeu, 0x85A9A, c.pile, DET_CHERCHER, ...module);
    poserLong(jeu, c.ebp - 0x10, port);
    if (port === 0) return fin(8);
    appelerDepuis(jeu, 0x85AC7, c.pile, DET_DECRIRE, ...module, descriptionDecalage, descriptionSelecteur & 0xFFFF);
    R.edx = poigneeDecalage;                               // lgs edx, [ebp+0x20]
    R.gs = poigneeSelecteur & 0xFFFF;
    poserLong(jeu, lineaire(jeu, poigneeDecalage, poigneeSelecteur), long(jeu, c.ebp - 0x10));
    poserLong(jeu, DET_POSITION, long(jeu, c.ebp - 0x18));
    return fin(0);
  } finally { c.fermer(); }
}

// 0x85F3E — sosDETGetSettings(&réglages lointains) : le module trouvé relu dans le bloc, sa carte
// cherchée de nouveau (fonction 0), puis ses réglages (fonction 1) recopiés : le port en +0, l'irq
// en +4, le dma en +8 (mots longs, relus sur les mots que la porte a rangés). Rend 0 ; 2 sans
// destination. gs reste sur la destination, edx sur l'irq.
function lireLesReglages(jeu, destinationDecalage, destinationSelecteur) {
  const R = jeu.T.R;
  const c = ouvrirLeCadre(jeu, 0x18);
  const fin = (code) => { poserLong(jeu, c.ebp - 0x18, code); return code; };
  const fichier = () => long(jeu, DET_FICHIER);
  try {
    poserLong(jeu, c.ebp - 0x14, TAILLE_DET_EN_TETE_DU_MODULE);
    if (destinationDecalage === 0 && (destinationSelecteur & 0xFFFF) === 0) return fin(2);
    appelerDepuis(jeu, 0x85F7D, c.pile, DET_POSITIONNER, fichier(), long(jeu, DET_POSITION), 0);
    appelerDepuis(jeu, 0x85F94, c.pile, DET_LIRE, fichier(), DET_EN_TETE_DU_MODULE, long(jeu, c.ebp - 0x14));
    const taille = long(jeu, DET_EN_TETE_DU_MODULE + DET_TAILLE);
    poserLong(jeu, c.ebp - 0x10, taille);
    appelerDepuis(jeu, 0x85FB3, c.pile, DET_LIRE, fichier(), long(jeu, DET_TAMPON), taille);
    const module = [long(jeu, DET_MODULE), long(jeu, DET_POINTEUR), mot(jeu, DET_POINTEUR + 4)];
    appelerDepuis(jeu, 0x85FCF, c.pile, DET_CHERCHER, ...module);
    appelerDepuis(jeu, 0x85FEB, c.pile, DET_REGLER, ...module);
    const destination = lineaire(jeu, destinationDecalage, destinationSelecteur);
    R.gs = destinationSelecteur & 0xFFFF;
    poserLong(jeu, destination, long(jeu, DET_REGLAGES));
    poserLong(jeu, destination + 8, long(jeu, DET_REGLAGES + 4));
    R.edx = long(jeu, DET_REGLAGES + 8);
    poserLong(jeu, destination + 4, R.edx);
    return fin(0);
  } finally { c.fermer(); }
}

// 0x8BD84 — fonction 0 du module de détection : chercher la carte. Le module rend son port dans eax
// (0 : pas de carte).
function detecterLaCarte(jeu, module, decalage, selecteur) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, 0, module, decalage, selecteur, () => {}, 0x8BDA0);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BDAF — fonction 1 : les réglages de la carte trouvée, le port dans ax, l'irq dans ch, le dma
// dans cl ; la porte range le port en 0xC4764, l'irq et le dma étendus (cbw) en 0xC476C et 0xC4768.
// ax sort sur le dma étendu.
function reglagesDeLaCarte(jeu, module, decalage, selecteur) {
  const R = jeu.T.R;
  const { entree, sauves } = porteDuModule(jeu, 1, module, decalage, selecteur, () => {}, 0x8BDCB);
  const irq = s8(R.ecx >>> 8), dma = s8(R.ecx);
  poserMot(jeu, DET_REGLAGES, R.eax);
  poserMot(jeu, DET_REGLAGES + 8, irq);
  poserMot(jeu, DET_REGLAGES + 4, dma);
  R.eax = bas16(R.eax, dma);
  remettre(R, sauves);
  R.esp = entree;
}

// 0x8BCD0 — fonction 2 : la description de la carte, que le module rend en ds:edx (ds, son
// sélecteur) ; la porte en recopie 0x6A octets à la destination (rep movsb), et pose ce sélecteur
// dans les quatre pointeurs lointains qu'elle contient (+0x30, +0x38, +0x40, +0x48).
function descriptionDetectee(jeu, module, decalage, selecteur, destinationDecalage, destinationSelecteur) {
  const R = jeu.T.R, m8 = jeu.m8;
  const { entree, sauves } = porteDuModule(jeu, 2, module, decalage, selecteur, () => {}, 0x8BCEC);
  poserLong(jeu, entree - EMPILES_PAR_LES_PORTES - 4, R.ds);   // `push ds`, le temps des copies
  const source = lineaire(jeu, R.edx, selecteur);
  const destination = lineaire(jeu, destinationDecalage, destinationSelecteur);
  for (let k = 0; k < 0x6A; k++) m8[destination + k] = m8[source + k];
  for (const champ of [0x34, 0x3C, 0x44, 0x4C]) poserMot(jeu, destination + champ, selecteur);
  remettre(R, sauves);
  R.esp = entree;
}

const lesDescripteurs = (jeu, pilote) => {
  const d0 = pointeurLointain(jeu, entreeDuDescripteur(pilote, 0));
  return [[d0, d0 + NOMBRE_DE_DESCRIPTEURS * TAILLE_DESCRIPTEUR]];
};
const COMPARES_DES_PORTES = ['eax', 'edx', 'ebx', 'ecx', 'esi', 'edi', 'ebp', 'esp'];

export const reecritures = [
  // 1. Les échantillons
  { adresse: 0x8943F, nom: 'sosDIGIStartSample', fn: demarrerUnEchantillon, arguments: 3, retour: true, zones: lesDescripteurs },
  { adresse: 0x89A48, nom: 'sosDIGIStopSample', fn: arreterUnEchantillon, arguments: 2, retour: true, zones: lesDescripteurs },
  { adresse: 0x892DB, nom: 'sosDIGISampleDone', fn: echantillonFini, arguments: 2, retour: true, zones: lesDescripteurs },
  { adresse: 0x879F8, nom: 'sosDIGISetSampleVolume', fn: reglerLeVolume, arguments: 3, retour: true, zones: lesDescripteurs },
  // (la fin des bruitages, section 8)
  { adresse: 0x8F2D1, nom: 'echantillonsEnCours', fn: echantillonsEnCours, arguments: 1, retour: true },
  { adresse: 0x879C0, nom: 'bruitagesEnCours', fn: bruitagesEnCours, arguments: 0, retour: true },
  { adresse: 0x87A84, nom: 'volumeGeneral', fn: volumeGeneral, arguments: 2, retour: true, zones: lesDescripteurs },
  { adresse: 0x8BB9B, nom: 'remplirLaTableDesDescripteurs', fn: remplirLaTableDesDescripteurs, arguments: 3,
    registresCompares: COMPARES_DES_PORTES },
  // 2. Les modules de HMIDRV.386
  { adresse: 0x8BD24, nom: 'descriptionDeLaCarte', fn: descriptionDeLaCarte, arguments: 5, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BE57, nom: 'installerLeMelange', fn: installerLeMelange, arguments: 9, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BEB9, nom: 'declarerLeMateriel', fn: declarerLeMateriel, arguments: 6, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BEF2, nom: 'demarrerLeDma', fn: demarrerLeDma, arguments: 5, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BF23, nom: 'reglerLaFrequence', fn: reglerLaFrequence, arguments: 4, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BF52, nom: 'reglerLaCarte', fn: reglerLaCarte, arguments: 3, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BF81, nom: 'pasDeTraductionDuDma', fn: pasDeTraductionDuDma, arguments: 1, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BD59, nom: 'arreterLeDma', fn: arreterLeDma, arguments: 3, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BE2C, nom: 'finirLeModule', fn: finirLeModule, arguments: 3, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BFB8, nom: 'traductionDuDma', fn: traductionDuDma, arguments: 1, registresCompares: COMPARES_DES_PORTES },
  // 3. La mémoire DPMI
  { adresse: 0x8BB41, nom: 'verrouillerUneZone', fn: verrouillerUneZone, arguments: 2, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BB6E, nom: 'deverrouillerUneZone', fn: deverrouillerUneZone, arguments: 2, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BBCB, nom: 'adresseLineaire', fn: adresseLineaire, arguments: 1, retour: true, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BBF6, nom: 'selecteurSurUneAdresse', fn: selecteurSurUneAdresse, arguments: 1, retour: true, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BC3C, nom: 'prendreDeLaMemoireDos', fn: prendreDeLaMemoireDos, arguments: 2, registresCompares: COMPARES_DES_PORTES },
  // 4. La minuterie de SOS
  { adresse: 0x8A426, nom: 'installerLeGestionnaire', fn: installerLeGestionnaire, arguments: 3, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8A3E0, nom: 'changerLaCadence', fn: changerLaCadence, arguments: 1, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8A4B1, nom: 'suspendreLaMinuterie', fn: suspendreLaMinuterie, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8A4DD, nom: 'reprendreLaMinuterie', fn: reprendreLaMinuterie, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8A509, nom: 'rendreLIrq0AuBios', fn: rendreLaMinuterie, registresCompares: COMPARES_DES_PORTES },
  // 5. La musique
  { adresse: 0x87238, nom: 'sosMIDIEnableChannelStealing', fn: permettreLeVolDeCanaux, arguments: 1, retour: true },
  { adresse: 0x88D4B, nom: 'pointeurLointainDe', fn: pointeurLointainDe, arguments: 2, retour: true, registresCompares: COMPARES_AVEC_EDX },
  { adresse: 0x88D91, nom: 'gestionnaireDeMorceau', fn: gestionnaireDeMorceau, convention: 'registres', nettoie: 4 },
  { adresse: 0x89E5C, nom: 'reglerLeTempo', fn: reglerLeTempo, arguments: 2, retour: true },
  // 6. Les banques de sons
  { adresse: 0x8B980, nom: 'chargerUneBanque', fn: chargerUneBanque, arguments: 1, retour: true },
  { adresse: 0x8BAB0, nom: 'rendreUneBanque', fn: rendreUneBanque, arguments: 1 },
  // 7. Le scanf de Watcom
  { adresse: SCANF_CONVERSIONS, nom: 'scnf', fn: scanf, arguments: 3, retour: true },
  { adresse: 0x8AF18, nom: 'getOpt', fn: lireLesOptions, arguments: 2, retour: true },
  { adresse: 0x8AFE5, nom: 'scanWhite', fn: sauterLesBlancs, arguments: 1, retour: true },
  { adresse: 0x8B09D, nom: 'scanString', fn: lireUneChaine, arguments: 2, retour: true },
  { adresse: 0x8B5BB, nom: 'scanInt', fn: lireUnEntier, arguments: 4, retour: true },
  { adresse: 0x8B7B8, nom: 'radixValue', fn: valeurDuChiffre, arguments: 1, retour: true },
  { adresse: 0x8B7EC, nom: 'cgetw', fn: prendreDansLeChamp, arguments: 1, retour: true },
  { adresse: 0x882FC, nom: 'dosretax', fn: conclureParAx, arguments: 2, retour: true },
];

// Les routines d'interruption, qu'une fonction JavaScript appelée par l'enveloppe ne peut pas
// reproduire : elles ne rendent pas la main par un `ret`.
//  - 0x8A369, le gestionnaire de l'IRQ 0 de SOS : `pushad` et les segments sur la pile
//    interrompue, `esp` rangé en [0xC370E], bascule sur la pile privée (`lss esp`, haut 0xC4716),
//    appel lointain de la routine [0xC36FC] (0x8280A, les événements), retour sur la pile
//    interrompue, fin d'interruption (port 0x20), `iretd`. Réentrance évitée par le mot [0xC4716].
//  - 0x8A55E, appelé par un événement pour chaîner l'ancien gestionnaire du BIOS : il reprend
//    `esp` en [0xC370E], glisse l'ancien vecteur [0xC36F0] dans le cadre de 0x8A369, dépile les
//    registres du code interrompu et saute au BIOS par un `retf` (comme `_chain_intr`, 0x821BE,
//    que l'hôte remplace).
// (Elles sont réécrites dans demarrage.js.) Restent ici les fonctions de la détection de la carte
// (section 9), que seule l'introduction exerce (moteur/node/verifier-intro.mjs --lisible).
export const enAttente = [
  { adresse: 0x85793, nom: 'sosDETInitSystem', fn: initialiserLaDetection, arguments: 2, retour: true },
  { adresse: 0x858FC, nom: 'sosDETUnInitSystem', fn: fermerLaDetection, arguments: 0, retour: true },
  { adresse: 0x85950, nom: 'sosDETFindCard', fn: chercherLaCarte, arguments: 5, retour: true },
  { adresse: 0x85F3E, nom: 'sosDETGetSettings', fn: lireLesReglages, arguments: 2, retour: true },
  { adresse: 0x8BD84, nom: 'detecterLaCarte', fn: detecterLaCarte, arguments: 3, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BDAF, nom: 'reglagesDeLaCarte', fn: reglagesDeLaCarte, arguments: 3, registresCompares: COMPARES_DES_PORTES },
  { adresse: 0x8BCD0, nom: 'descriptionDetectee', fn: descriptionDetectee, arguments: 5, registresCompares: COMPARES_DES_PORTES },
];
