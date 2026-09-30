// Le socle d'exécution : la bibliothèque C de Watcom (fichiers, flots, tas, chaînes, démarrage) et
// quatre routines de Bullfrog de même niveau (clavier, fenêtre de dessin, remplissage, dépaquetage).
//
// Le jeu est lié à la bibliothèque C de Watcom 9.x (« WATCOM C/C++32 Run-Time system », dit la
// chaîne de 0x7E2CE). Tout ce qui touche au DOS passe par elle : ouvrir, lire, écrire et fermer un
// fichier, allouer la mémoire, lire la ligne de commande et l'environnement. Les noms d'origine de
// Watcom sont donnés entre guillemets simples à chaque fonction ; ils sont reconnus à la forme du
// code et aux constantes (les drapeaux O_*, les codes errno), pas lus dans le programme, qui n'a pas
// de symboles.
//
// LES SERVICES. Ces routines appellent le DOS (int 21h), le DPMI (int 31h) et le BIOS (int 16h)
// directement, par l'instruction `int`. La réécriture fait rendre le même service par l'hôte, dans
// le même ordre et avec les mêmes registres d'entrée (`servir`) : chaque service coûte du temps
// virtuel et livre les interruptions en attente, si bien qu'un service de plus ou de moins
// décalerait toute la partie. L'idiome de Watcom `rcl eax, 1 ; ror eax, 1` range la retenue (l'échec
// du service) dans le bit de signe du résultat : `resultatDos`.
//
// LE TAS. Watcom gère la mémoire en « régions » obtenues du DPMI (0x90151, blocs de mémoire étendue
// 0501h), chaînées dans [0xE1330] ; chaque région porte une liste de blocs. Un bloc commence par sa
// taille, bit 0 à 1 s'il est pris ; un bloc libre porte ensuite ses liens (précédent, suivant) dans
// la liste circulaire des blocs libres, dont la sentinelle est dans le descripteur du tas
// (0xC4728, voir TAS). Une région finit par un mot -1 suivi d'un pointeur vers la région suivante.
//
// Voir docs/guide-reecriture.md ; docs/retro-ingenierie.md § 12.

import { Cadre } from './cadre.js';

const s16 = (v) => (v << 16) >> 16;

// --- Les variables de la bibliothèque -------------------------------------------------------------
const ERRNO = 0xE1298;               // errno, dont 0x8A99C rend l'adresse
const DOSERRNO = 0xE129C;            // _doserrno, dont 0x8A9A2 rend l'adresse
const VERSION_DOS = 0xC2D6E;         // octet : version majeure du DOS
const ERRNO_DU_DOS = 0xC31D4;        // table : erreur DOS (0 à 0x13) -> errno
const MODES_IO = 0xC4D88;            // pointeur vers la table des modes des descripteurs (__io_mode)
const NOMBRE_DESCRIPTEURS = 0xC4D34; // taille de cette table (__NFiles)
const MASQUE_CREATION = 0xC4D30;     // umask, appliqué aux permissions d'un fichier créé
const MODE_PAR_DEFAUT = 0xC2F7D;     // _fmode : 0x200 (binaire) ou 0x100 (texte), mot non aligné

// Les modes d'ouverture (O_*) et les bits de __io_mode, ceux de Watcom.
const O_WRONLY_RDWR = 3, O_APPEND = 0x10, O_CREAT = 0x20, O_TRUNC = 0x40;
const O_TEXT = 0x100, O_BINARY = 0x200, O_EXCL = 0x400;
const IO_LECTURE = 1, IO_ECRITURE = 2, IO_BINAIRE = 0x40, IO_AJOUT = 0x80;
const IO_TERMINAL = 0x2000, IO_INITIALISE = 0x4000;
// Les codes d'errno de Watcom employés ici.
const EEXIST = 7, EBADF = 4, EACCES = 6, EINVAL = 9, ENOSPC = 0xC, ENOMEM = 5;

// Les flots (FILE) : +0 position dans le tampon, +4 octets en attente, +8 tampon, +0xC drapeaux,
// +0x10 descripteur, +0x14 taille du tampon, +0x18 un octet de secours (tampon d'un flot sans
// tampon). Vingt flots statiques de 0x1A octets en 0xC2D74 ; au-delà, des flots alloués.
const FLOTS = 0xC2D74, FLOTS_FIN = 0xC2F7C, TAILLE_FLOT = 0x1A;
const FLOTS_OUVERTS = 0xE12A0;       // liste des flots ouverts : { suivant, FILE* }
const FLOTS_FERMES = 0xE0D08;        // liste des maillons récupérables
// Les drapeaux d'un flot, en mot : _READ 1, _WRITE 2, _UNGET 4, _BIGBUF 8, _EOF 0x10, _SFERR 0x20,
// _BINARY 0x40, _IOFBF 0x100, _IOLBF 0x200, _IONBF 0x400, _TMPFIL 0x800 (fichier temporaire, effacé
// à la fermeture : sortie.js), _DIRTY 0x1000, _ISTTY 0x2000, _DYNAMIC 0x4000 (flot alloué).
const F_LECTURE = 1, F_RENDU = 4, F_FIN = 0x10, F_ERREUR = 0x20, F_BINAIRE = 0x40;
const F_SANS_TAMPON = 0x400, F_TERMINAL = 0x2000;
const CARACTERE_DE_COTE = 0xC2D58;   // le caractère que 'ungetch' met de côté pour la console

// Le tas (§ en tête). Le descripteur en 0xC4728 : +8 le bloc libre où reprendre la recherche,
// +0xC la plus grande taille libre avant lui, +0x10 la plus grande taille libre connue, +0x14 le
// nombre de blocs pris, +0x18 le nombre de blocs libres, +0x1C la sentinelle de la liste des blocs
// libres (dont +0x20 le dernier et +0x24 le premier bloc libre).
const TAS = 0xC4728;
const TAS_PREMIERE_REGION = 0xC4720, TAS_REGIONS = 0xC4724;
const TAS_REPRISE = TAS + 8, TAS_AVANT_REPRISE = TAS + 0xC, TAS_PLUS_GRAND = TAS + 0x10;
const TAS_PRIS = TAS + 0x14, TAS_LIBRES = TAS + 0x18;
const TAS_MODIFIE = 0xE1334;         // octet remis à zéro par chaque allocation et libération
const REGIONS_DPMI = 0xE1330;        // chaîne des régions obtenues du DPMI
const TAS_PERMIS = 0xCC788;          // non nul : le tas peut grandir
const LIMITE_SEGMENT = 0xC2D38;      // limite du segment de données + 1 ; -2 : ne plus grandir
const EXTENDEUR = 0xC2D66;           // octet : l'extendeur DOS (1 : DOS/4GW, le seul vu ici)
const PAS_DU_TAS = 0xCACE4;          // _amblksiz : taille minimale d'une extension du tas
const MEMOIRE_DOS = 0xE1338;         // plus grand bloc DOS à demander (repli de 0x90151)

// Le démarrage.
const LIGNE_DE_COMMANDE = 0xC2D3C, NOM_DU_PROGRAMME = 0xC2D40;
const ARGV = 0xBECD8, ARGC = 0xBECD4, ARGV_MAIN = 0xE1328, ARGC_MAIN = 0xE132C;
const ENVIRONNEMENT = 0xC4750, ENVIRONNEMENT_FIN = 0xC4754;
const BLOC_ENVIRONNEMENT = 0xC2D68; // pointeur lointain (décalage, sélecteur) vers l'environnement
const ROUTINES_INIT = 0xCC7E4, ROUTINES_INIT_FIN = 0xCC802;
const BAS_DE_PILE = 0xC2D48;         // _STACKLOW
const SELECTEUR_PILE = 0xC4D8C;
const ETALON_HORLOGE = 0xE1288;

// Les fonctions que ce module appelle par leur adresse.
const STRLEN = 0x7E822, MEMCPY = 0x80958, MEMSET = 0x7F1A0, INT386 = 0x7F085;
const PRTF = 0x883DF, FOPEN_INTERNE = 0x82FF8, DEBORDEMENT_DE_PILE = 0x8F5AB;
const TAS_RESERVE = 0x90104, SBRK = 0x931CB;
const SORTIE_FPRINTF = 0x8750A;
const MOTEUR_DE_SCANF = 0x8AD11, FERMER_UN_FLOT = 0x831A1;

// ================================================================================================
// 0. Les services
// ================================================================================================

const avecBas16 = (v, bas) => (v & ~0xFFFF) | (bas & 0xFFFF);
const avecAh = (v, ah) => (v & ~0xFF00) | ((ah & 0xFF) << 8);

// Rendre un service comme l'instruction `int n` d'origine : poser les registres d'entrée, laisser
// l'hôte répondre (il peut livrer au passage une interruption de la minuterie ou de la souris, qui
// exécute le code du jeu), relever les registres de sortie, et remettre ceux de l'appelant. `esp`,
// quand il est donné, est le pointeur de pile de l'original au moment du service : un gestionnaire
// livré pendant le service empile sous lui, et ne doit pas écraser un tampon que la réécriture a
// posé, comme l'original, dans la pile.
function servir(jeu, n, entree) {
  const T = jeu.T, R = T.R;
  T.sauver();
  const garde = { ...R };
  Object.assign(R, entree);
  T.charger();
  jeu.machine.interruption(n);
  const sortie = {
    eax: R.eax | 0, ebx: R.ebx | 0, ecx: R.ecx | 0, edx: R.edx | 0,
    esi: R.esi | 0, edi: R.edi | 0, CF: R.CF, ZF: R.ZF,
  };
  Object.assign(R, garde);
  T.charger();
  return sortie;
}

// `rcl eax, 1 ; ror eax, 1` : la retenue du service devient le bit de signe du résultat.
const resultatDos = (s) => ((s.eax & 0x7FFFFFFF) | (s.CF ? 0x80000000 : 0)) | 0;

// Appeler une fonction transcrite comme l'original : à la même hauteur de pile (`entree`, le point
// d'entrée de l'appelant, moins `descente`, ce que l'original a empilé et réservé avant l'appel) et
// avec la même adresse de retour.
const appelOrigine = (jeu, entree, descente, retour, adresse, ...args) =>
  jeu.appelerDepuis(retour, (entree - descente) | 0, adresse, ...args);

const lire32 = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const ecrire32 = (jeu, a, v) => jeu.dv.setInt32(a >>> 0, v | 0, true);
const lire16 = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const ecrire16 = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);

// ================================================================================================
// 1. errno
// ================================================================================================

// 0x8A99C — '__get_errno_ptr' : l'adresse d'errno.
const adresseErrno = () => ERRNO;
// 0x8A9A2 — '__get_doserrno_ptr' : l'adresse de _doserrno.
const adresseDoserrno = () => DOSERRNO;

const poserErrno = (jeu, code) => ecrire32(jeu, ERRNO, code);

// 0x88324 — '__set_errno_dos' : une erreur du DOS devient un errno. Le code du DOS est rangé tel
// quel (son octet bas) dans _doserrno, et traduit par la table 0xC31D4 ; à partir du DOS 3, les
// erreurs réseau (0x20 et plus) et « fichier existant » (0x50) sont d'abord ramenées à des codes
// connus de la table. Un code de 0x100 ou plus porte déjà son errno dans son octet haut. Rend -1.
function erreurDos(jeu, code) {
  let c = code & 0xFF;
  ecrire32(jeu, DOSERRNO, c);
  let errno;
  if ((code >>> 0) < 0x100) {
    if (jeu.m8[VERSION_DOS] >= 3) {
      if (c === 0x50) c = 0x0E;
      else if (c >= 0x22) c = 0x13;
      else if (c >= 0x20) c = 5;
    }
    if (c > 0x13) c = 0x13;
    errno = (jeu.m8[ERRNO_DU_DOS + c] << 24) >> 24;
  } else {
    errno = (code >>> 8) & 0xFF;
  }
  poserErrno(jeu, errno);
  return -1;
}

// 0x882E4 — '_dosret0'(code, échec) : conclure un service du DOS qui ne rend rien d'autre que son
// succès. `échec` est le mot haut de l'idiome `sbb ecx, ecx ; mov cx, ax` (0xFFFF si la retenue
// était mise), `code` l'erreur du DOS. Rend 0, ou -1 avec errno. L'original passe par sa voisine
// 0x882FC ('_dosretax', qui rendrait le code lui-même en cas de succès) ; appelée ici seulement en
// cas d'échec, elle se réduit à '__set_errno_dos'.
function conclureServiceDos(jeu, code, echec) {
  if (echec === 0) return 0;
  return erreurDos(jeu, code);
}

// ================================================================================================
// 2. Les descripteurs : leur mode, et les appels du DOS sur les fichiers
// ================================================================================================

// 0x8F3B6 — 'isatty' : le descripteur désigne-t-il un périphérique (IOCTL 4400h, bit 0x80 des
// informations) ? Sur l'hôte, les descripteurs 0 à 4.
function estUnTerminal(jeu, descripteur) {
  const R = jeu.T.R;
  const s = servir(jeu, 0x21, {
    eax: (descripteur & ~0xFFFF) | 0x4400, ebx: avecBas16(R.ebx, descripteur),
  });
  return (s.edx & 0x80) !== 0 ? 1 : 0;
}

// 0x8F3D6 — '__GetIOMode' : le mode d'un descripteur (0 s'il est hors de la table). Les six
// premiers, ouverts par le DOS avant le programme, sont complétés à la première lecture : marqués
// initialisés, et « terminal » si c'en est un — un service IOCTL de plus, la première fois.
function modeIo(jeu, descripteur) {
  const d = descripteur | 0;
  if ((d >>> 0) >= (lire32(jeu, NOMBRE_DESCRIPTEURS) >>> 0)) return 0;
  if (d <= 5) {
    const octet = lire32(jeu, MODES_IO) + d * 4 + 1;
    if (!(jeu.m8[octet] & 0x40)) {
      jeu.m8[octet] |= 0x40;                       // IO_INITIALISE
      if (estUnTerminal(jeu, d)) jeu.m8[lire32(jeu, MODES_IO) + d * 4 + 1] |= 0x20;   // IO_TERMINAL
    }
  }
  return lire32(jeu, lire32(jeu, MODES_IO) + d * 4);
}

// 0x8F428 — '__SetIOMode' : ranger le mode d'un descripteur, toujours marqué initialisé.
function poserModeIo(jeu, descripteur, mode) {
  ecrire32(jeu, lire32(jeu, MODES_IO) + descripteur * 4, mode | IO_INITIALISE);
}

// 0x8616E — 'sopen'(nom, mode, partage, permissions) : ouvrir un fichier, le créer au besoin.
// Rend le descripteur, ou -1 avec errno.
//
// Le nom est pris après ses espaces de tête. On tente d'abord d'ouvrir (3Dh) ; si le fichier existe
// et qu'on l'ouvre pour écrire, O_EXCL fait échouer (EEXIST) et O_TRUNC le vide, par une écriture
// de zéro octet (40h). S'il n'existe pas (erreur 2) et que O_CREAT est demandé, il est créé (3Ch),
// refermé, puis rouvert avec le mode demandé : la création du DOS ne sait ouvrir qu'en lecture et
// écriture. Les permissions (0x180 par défaut), passées au masque [0xC4D30], ne décident que de
// l'attribut « lecture seule ». Le mode du descripteur est enfin rangé : lecture, écriture, ajout,
// terminal, et binaire ou texte selon O_BINARY, O_TEXT ou, à défaut, _fmode.
function ouvrirFichier(jeu, nom, mode, partage, permissions) {
  const { m8 } = jeu;
  const R = jeu.T.R;
  const entree = R.esp >>> 0;
  let p = nom;
  while (m8[p] === 0x20) p++;
  const acces = mode & 0x83;
  const alOuverture = ((acces | partage) & 0xFF);
  let descripteur = -1;
  let r = resultatDos(servir(jeu, 0x21, { eax: 0x3D00 | alOuverture, edx: p }));
  let dernier = r;                                   // edi : le dernier résultat du DOS
  if (r >= 0) descripteur = r & 0xFFFF;

  const fermerDos = (h, eax) => servir(jeu, 0x21, { eax: avecAh(eax, 0x3E), ebx: avecBas16(R.ebx, h) });

  if ((mode & O_WRONLY_RDWR) && descripteur !== -1 && !estUnTerminal(jeu, descripteur)) {
    if (mode & O_EXCL) {
      fermerDos(descripteur, 0);
      poserErrno(jeu, EEXIST);
      return -1;
    }
    if (mode & O_TRUNC) {
      // Écrire zéro octet tronque le fichier ; le tampon désigné, une variable de la pile de
      // l'original, n'est pas lu.
      r = resultatDos(servir(jeu, 0x21, {
        eax: 0x4000, ebx: avecBas16(R.ebx, descripteur), ecx: 0, edx: (entree - 20) | 0,
      }));
      dernier = r;
      if (r < 0) {
        fermerDos(descripteur, r);
        return erreurDos(jeu, dernier & 0xFFFF);
      }
    }
  }

  if (descripteur === -1) {
    if (!(mode & O_CREAT) || (dernier & 0xFFFF) !== 2) return erreurDos(jeu, dernier & 0xFFFF);
    let pm = permissions === 0 ? 0x180 : permissions;
    pm ^= lire32(jeu, MASQUE_CREATION);
    const attribut = (pm & 0x80) ? 0 : 1;            // sans droit d'écriture : lecture seule
    r = resultatDos(servir(jeu, 0x21, { eax: avecAh(pm, 0x3C), ecx: attribut, edx: p }));
    if (r < 0) return erreurDos(jeu, r & 0xFFFF);
    const cree = r & 0xFFFF;
    r = resultatDos(fermerDos(cree, cree));
    if (r < 0) return erreurDos(jeu, r & 0xFFFF);
    r = resultatDos(servir(jeu, 0x21, { eax: (r & ~0xFFFF) | 0x3D00 | alOuverture, edx: p }));
    if (r < 0) return erreurDos(jeu, r & 0xFFFF);
    descripteur = r & 0xFFFF;
  }

  const ancien = modeIo(jeu, descripteur);
  let nouveau = (ancien & ~0xFF) | (ancien & 0x3C);
  if (estUnTerminal(jeu, descripteur)) nouveau |= IO_TERMINAL;
  const a = acces & 0x7F;
  if (a === 2) nouveau |= IO_LECTURE | IO_ECRITURE;
  if (a === 0) nouveau |= IO_LECTURE;
  if (a === 1) nouveau |= IO_ECRITURE;
  if (mode & O_APPEND) nouveau |= IO_AJOUT;
  const binaire = nouveau | IO_BINAIRE;
  if (mode & (O_TEXT | O_BINARY)) {
    if (mode & O_BINARY) nouveau = binaire;
  } else if (lire32(jeu, MODE_PAR_DEFAUT) === O_BINARY) {
    nouveau = binaire;
  }
  poserModeIo(jeu, descripteur, nouveau);
  return descripteur;
}

// 0x8614F — 'open'(nom, mode, permissions) : sopen sans partage.
const ouvrir = (jeu, nom, mode, permissions) => ouvrirFichier(jeu, nom, mode, 0, permissions);

// 0x875EC — 'creat'(nom, permissions) : ouvrir en lecture et écriture, créer, vider (0x62).
const creer = (jeu, nom, permissions) => ouvrirFichier(jeu, nom, 0x62, 0, permissions);

// 0x8639A — 'close' : fermer (3Eh) et oublier le mode du descripteur. Rend 0, ou -1 (EBADF) si le
// DOS refuse — l'erreur du DOS n'est pas consultée.
function fermer(jeu, descripteur) {
  const R = jeu.T.R;
  const r = resultatDos(servir(jeu, 0x21, { eax: avecAh(R.eax, 0x3E), ebx: avecBas16(R.ebx, descripteur) }));
  if (r >= 0) { poserModeIo(jeu, descripteur, 0); return 0; }
  poserErrno(jeu, EBADF);
  return -1;
}

// 0x87601 — 'setmode'(descripteur, mode) : passer un descripteur en binaire (0x200) ou en texte
// (0x100), et avec lui le flot ouvert dessus. Rend l'ancien mode.
function changerMode(jeu, descripteur, mode) {
  const m = modeIo(jeu, descripteur);
  if (m === 0) { poserErrno(jeu, EBADF); return -1; }
  const ancien = (m & IO_BINAIRE) ? O_BINARY : O_TEXT;
  if (mode === ancien) return ancien;
  if (mode !== O_BINARY && mode !== O_TEXT) { poserErrno(jeu, EINVAL); return -1; }
  poserModeIo(jeu, descripteur, (m & ~IO_BINAIRE) | (mode === O_BINARY ? IO_BINAIRE : 0));
  for (let p = lire32(jeu, FLOTS_OUVERTS); p !== 0; p = lire32(jeu, p)) {
    const f = lire32(jeu, p + 4);
    if (lire32(jeu, f + 0xC) !== 0 && descripteur === lire32(jeu, f + 0x10)) {
      jeu.m8[f + 0xC] &= ~F_BINAIRE;
      if (mode === O_BINARY) jeu.m8[f + 0xC] |= F_BINAIRE;
      break;
    }
  }
  return ancien;
}

// 0x876B7 — 'read'(descripteur, tampon, n) : lire (3Fh). En mode texte, les retours chariot sont
// retirés et un ^Z arrête le tri de ce qui a été lu ; on relit alors pour compléter, sauf sur un
// terminal. Rend le nombre d'octets rendus, ou -1.
//
// Anomalie de Watcom, reproduite : le ^Z n'arrête pas la lecture, seulement le tri du morceau lu —
// la lecture suivante reprend après lui.
//
// Le service part du cadre de l'original (ebx, esi, edi, ebp empilés, 16 octets de variables), avec
// ses registres : esi, le compte, puis la fin du morceau lu ; edi, la destination ; en mode texte, eax
// garde la position du tri, et ebx son compte. Une interruption de la minuterie de SOS pendant la
// lecture range ce pointeur de pile en 0xC370E, et son répartiteur empile ces registres sur sa pile
// privée : le film de l'introduction lit son fichier pendant que la musique joue.
function lire(jeu, descripteur, tampon, n) {
  const { m8 } = jeu;
  const cadre = new Cadre(jeu, 0x10);
  try {
    const R = jeu.T.R;
    const m = modeIo(jeu, descripteur);
    if (m === 0) { poserErrno(jeu, EBADF); return -1; }
    if (!(m & IO_LECTURE)) { poserErrno(jeu, EACCES); return -1; }
    if (m & IO_BINAIRE) {
      const r = resultatDos(servir(jeu, 0x21, {
        eax: avecAh(m, 0x3F), ebx: avecBas16(R.ebx, descripteur), ecx: n, edx: tampon, esi: n, edi: tampon,
      }));
      if (r >= 0) return r;
      return erreurDos(jeu, r & 0xFFFF);
    }
    let total = 0, reste = n | 0, dest = tampon, eax = m, ebx = R.ebx, esi = n;
    for (;;) {
      const r = resultatDos(servir(jeu, 0x21, {
        eax: avecAh(eax, 0x3F), ebx: avecBas16(ebx, descripteur), ecx: reste, edx: dest, esi, edi: dest,
      }));
      if (r < 0) return erreurDos(jeu, r & 0xFFFF);
      if (r === 0) return total;
      let k = 0, lu = dest, ecrit = dest;
      const fin = (dest + r) >>> 0;
      while ((lu >>> 0) < fin) {
        const c = m8[lu];
        if (c === 0x1A) break;
        if (c !== 0x0D) { k++; m8[ecrit++] = c; }
        lu++;
      }
      total = (total + k) | 0;
      reste = (reste - k) | 0;
      dest = (dest + k) | 0;
      eax = lu; ebx = k; esi = fin;
      if (m & IO_TERMINAL) return total;
      if (reste === 0) return total;
    }
  } finally { cadre.fermer(); }
}

// Se placer à la fin du fichier (4202h), pour un descripteur ouvert en ajout. L'idiome est ici sur
// 16 bits : la retenue devient le bit 15 de dx, et le résultat dx:ax est négatif en cas d'échec.
function allerALaFin(jeu, descripteur, eax) {
  const R = jeu.T.R;
  const s = servir(jeu, 0x21, { eax: (eax & ~0xFFFF) | 0x4202, ebx: avecBas16(R.ebx, descripteur), ecx: 0, edx: 0 });
  const dx = (s.edx & 0x7FFF) | (s.CF ? 0x8000 : 0);
  return ((dx << 16) | (s.eax & 0xFFFF)) | 0;
}

// 0x877E5 — 'write'(descripteur, tampon, n) : écrire (40h). Un descripteur en ajout se place
// d'abord à la fin. En mode texte, chaque saut de ligne est précédé d'un retour chariot : le texte
// est converti par morceaux dans un tampon pris dans la pile ('alloca'), de 0x200 octets, ou 0x80
// s'il reste moins de 0x230 octets de pile. Rend n, ou le nombre d'octets écrits si le disque est
// plein (ENOSPC), ou -1.
function ecrire(jeu, descripteur, tampon, n) {
  const { m8 } = jeu;
  const R = jeu.T.R;
  const entree = R.esp >>> 0;
  const m = modeIo(jeu, descripteur);
  if (m === 0) { poserErrno(jeu, EBADF); return -1; }
  if (!(m & IO_ECRITURE)) { poserErrno(jeu, EACCES); return -1; }
  const ebx = avecBas16(R.ebx, descripteur);
  if (m & IO_AJOUT) {
    const position = allerALaFin(jeu, descripteur, m);
    if (position < 0) return erreurDos(jeu, position & 0xFFFF);
  }
  if (m & IO_BINAIRE) {
    const r = resultatDos(servir(jeu, 0x21, { eax: 0x4000, ebx, ecx: n, edx: tampon }));
    if (r < 0) return erreurDos(jeu, r & 0xFFFF);
    if (r !== (n | 0)) { poserErrno(jeu, ENOSPC); return r; }
    return n | 0;
  }

  // La pile de l'original : quatre registres sauvés et 0x18 octets de variables ; 'stackavail'
  // (0x8F440) y est appelé, puis le tampon est réservé dessous.
  const cadre = entree - 16;
  const disponible = (cadre - 0x18 - 4 - lire32(jeu, BAS_DE_PILE)) >>> 0;
  if (disponible < 0xB0) appelOrigine(jeu, entree, 16 + 0x18, 0x878B0, DEBORDEMENT_DE_PILE);
  const taille = disponible < 0x230 ? 0x80 : 0x200;
  const conversion = (cadre - 0x18 - ((taille + 3) & ~3)) | 0;
  const vider = (compte) => resultatDos(servir(jeu, 0x21, {
    eax: 0x4000, ebx, ecx: compte, edx: conversion, esp: conversion,
  }));

  let k = 0, pris = 0, fait = 0, source = tampon;
  while ((pris >>> 0) < (n >>> 0)) {
    if (m8[source] === 0x0A) {
      m8[conversion + k] = 0x0D;
      k++;
      if (k === taille) {
        const r = vider(taille);
        if (r < 0) return erreurDos(jeu, r & 0xFFFF);
        if (r !== taille) { poserErrno(jeu, ENOSPC); return (fait + r) | 0; }
        fait = pris; k = 0;
      }
    }
    m8[conversion + k] = m8[source];
    pris++; k++; source++;
    if (k === taille) {
      const r = vider(taille);
      if (r < 0) return erreurDos(jeu, r & 0xFFFF);
      if (r !== taille) { poserErrno(jeu, ENOSPC); return (fait + r) | 0; }
      fait = pris; k = 0;
    }
  }
  if (k !== 0) {
    const r = vider(k);
    if (r < 0) return erreurDos(jeu, r & 0xFFFF);
    if (r !== k) { poserErrno(jeu, ENOSPC); return (fait + r) | 0; }
  }
  return n | 0;
}

// 0x88394 — 'lseek'(descripteur, décalage, origine) : se placer (42h). Rend la position, ou -1.
function positionner(jeu, descripteur, decalage, origine) {
  const R = jeu.T.R;
  const s = servir(jeu, 0x21, {
    eax: avecAh(origine, 0x42), ebx: avecBas16(R.ebx, descripteur), ecx: decalage >>> 16, edx: decalage,
  });
  const r = resultatDos(s);
  if (r < 0) { erreurDos(jeu, r & 0xFFFF); return -1; }
  return ((s.edx & 0xFFFF) << 16) | (s.eax & 0xFFFF);
}

// 0x90588 — '__qwrite'(descripteur, tampon, n) : écrire sans conversion (40h), à la fin du fichier
// pour un descripteur en ajout ; c'est l'écriture du tampon d'un flot. Rend le nombre d'octets
// écrits (ENOSPC s'il en manque), ou -1.
function ecrireBrut(jeu, descripteur, tampon, n) {
  const R = jeu.T.R;
  const m = modeIo(jeu, descripteur);
  if (m & IO_AJOUT) {
    const position = allerALaFin(jeu, descripteur, m);
    if (position < 0) return erreurDos(jeu, position & 0xFFFF);
  }
  const r = resultatDos(servir(jeu, 0x21, { eax: 0x4000, ebx: avecBas16(R.ebx, descripteur), ecx: n, edx: tampon }));
  if (r < 0) return erreurDos(jeu, r & 0xFFFF);
  if (r !== (n | 0)) poserErrno(jeu, ENOSPC);
  return r;
}

// ================================================================================================
// 3. Les flots
// ================================================================================================

// 0x8AB79 — '__allocfp' : un flot libre, rendu ouvert en lecture et écriture. D'abord un maillon
// récupéré d'un flot fermé ; sinon un des vingt flots statiques inutilisé (avec un maillon neuf de
// 8 octets) ; sinon un flot alloué (0x22 octets : le maillon et le FILE, marqué _DYNAMIC). Rend le
// FILE, ou 0 (ENOMEM).
function allouerFlot(jeu) {
  let maillon = lire32(jeu, FLOTS_FERMES);
  let f, drapeaux;
  if (maillon !== 0) {
    ecrire32(jeu, FLOTS_FERMES, lire32(jeu, maillon));
    f = lire32(jeu, maillon + 4);
    drapeaux = (lire32(jeu, f + 0xC) & 0x4003) | 3;
  } else {
    for (f = FLOTS; f < FLOTS_FIN; f += TAILLE_FLOT) {
      if (!(jeu.m8[f + 0xC] & 3)) break;
    }
    if (f < FLOTS_FIN) {
      maillon = allouer(jeu, 8);
      if (maillon === 0) { poserErrno(jeu, ENOMEM); return 0; }
      drapeaux = 3;
    } else {
      drapeaux = 0x4003;
      maillon = allouer(jeu, 0x22);
      if (maillon === 0) { poserErrno(jeu, ENOMEM); return 0; }
      f = maillon + 8;
    }
  }
  ecrire32(jeu, f + 0xC, drapeaux);
  ecrire32(jeu, f, 0);
  ecrire32(jeu, maillon + 4, f);
  ecrire32(jeu, maillon, lire32(jeu, FLOTS_OUVERTS));
  ecrire32(jeu, FLOTS_OUVERTS, maillon);
  return f;
}

// 0x8AC14 — '__freefp' : retirer un flot de la liste des flots ouverts ; son maillon passe dans
// celle des flots fermés, et le flot est marqué libre à réutiliser (drapeaux | 3).
function libererFlot(jeu, f) {
  let precedent = FLOTS_OUVERTS;
  for (;;) {
    const maillon = lire32(jeu, precedent);
    if (maillon === 0) return;
    if (f === lire32(jeu, maillon + 4)) {
      jeu.m8[f + 0xC] |= 3;
      ecrire32(jeu, precedent, lire32(jeu, maillon));
      ecrire32(jeu, maillon, lire32(jeu, FLOTS_FERMES));
      ecrire32(jeu, FLOTS_FERMES, maillon);
      return;
    }
    precedent = maillon;
  }
}

// 0x8AC69 — '__chktty' : un flot ouvert sur un terminal est marqué _ISTTY, et mis en tampon par
// ligne (_IOLBF) si aucun mode de tampon n'a été choisi.
function verifierTerminal(jeu, f) {
  const { m8 } = jeu;
  if (m8[f + 0xD] & 0x20) return;
  if (!estUnTerminal(jeu, lire32(jeu, f + 0x10))) return;
  m8[f + 0xD] |= 0x20;
  if (!(m8[f + 0xD] & 7)) m8[f + 0xD] |= 2;
}

// 0x8F4FC — '__ioalloc' : donner son tampon à un flot. Taille : celle déjà choisie, sinon 0x86
// pour un terminal (_IOLBF), 1 sans tampon (_IONBF), 0x1000 sinon. Faute de mémoire, le flot
// passe sans tampon, sur son octet de secours.
function donnerTampon(jeu, f) {
  const { m8 } = jeu;
  verifierTerminal(jeu, f);
  if (lire32(jeu, f + 0x14) === 0) {
    const taille = (m8[f + 0xD] & 2) ? 0x86 : (m8[f + 0xD] & 4) ? 1 : 0x1000;
    ecrire32(jeu, f + 0x14, taille);
  }
  const tampon = allouer(jeu, lire32(jeu, f + 0x14));
  ecrire32(jeu, f + 8, tampon);
  if (tampon === 0) {
    m8[f + 0xD] &= 0xF8;
    m8[f + 0xD] |= 4;
    ecrire32(jeu, f + 8, f + 0x18);
    ecrire32(jeu, f + 0x14, 1);
  } else {
    m8[f + 0xC] |= 8;                                // _BIGBUF : tampon alloué
  }
  ecrire32(jeu, f, lire32(jeu, f + 8));
  ecrire32(jeu, f + 4, 0);
}

// 0x8B817 — '__flush' : un flot sale (_DIRTY) écrit son tampon ; un flot en lecture rend au
// fichier ce qu'il avait lu d'avance (lseek en arrière, sauf sur un terminal). Le tampon est vidé.
// Rend 0, ou -1 avec _SFERR.
function vider(jeu, f) {
  const { m8 } = jeu;
  let resultat = 0;
  let erreur = false;
  if (m8[f + 0xD] & 0x10) {
    m8[f + 0xD] &= 0xEF;
    if ((m8[f + 0xC] & 2) && lire32(jeu, f + 8) !== 0) {
      const r = ecrireBrut(jeu, lire32(jeu, f + 0x10), lire32(jeu, f + 8), lire32(jeu, f + 4));
      if (r === -1) { resultat = -1; erreur = true; }
      else if (r !== lire32(jeu, f + 4)) { poserErrno(jeu, ENOSPC); resultat = -1; erreur = true; }
    }
  } else if (lire32(jeu, f + 8) !== 0) {
    m8[f + 0xC] &= 0xEF;
    if (!(m8[f + 0xD] & 0x20)) {
      const enAttente = lire32(jeu, f + 4);
      const r = enAttente !== 0 ? positionner(jeu, lire32(jeu, f + 0x10), -enAttente | 0, 1) : 0;
      if (r === -1) { resultat = -1; erreur = true; }
    }
  }
  if (erreur) m8[f + 0xC] |= F_ERREUR;
  ecrire32(jeu, f, lire32(jeu, f + 8));
  ecrire32(jeu, f + 4, 0);
  return resultat;
}

// 0x8F454 — 'fputc'(c, f) : poser un caractère dans le tampon du flot. En mode texte, un saut de
// ligne est précédé d'un retour chariot. Le tampon est écrit quand il est plein, et après un saut de
// ligne pour un flot par ligne ou sans tampon. Rend le caractère, ou -1.
function poserCaractere(jeu, c, f) {
  const { m8 } = jeu;
  if (!(m8[f + 0xC] & 2)) {
    poserErrno(jeu, EBADF);
    m8[f + 0xC] |= F_ERREUR;
    return -1;
  }
  if (lire32(jeu, f + 8) === 0) donnerTampon(jeu, f);
  const empiler = (octet) => {
    m8[f + 0xD] |= 0x10;
    m8[lire32(jeu, f)] = octet;
    ecrire32(jeu, f, lire32(jeu, f) + 1);
    ecrire32(jeu, f + 4, lire32(jeu, f + 4) + 1);
  };
  let masque = 0x400;                                // _IONBF
  if (c === 0x0A) {
    masque = 0x600;                                  // _IONBF | _IOLBF
    if (!(m8[f + 0xC] & F_BINAIRE)) {
      empiler(0x0D);
      if (lire32(jeu, f + 4) === lire32(jeu, f + 0x14) && vider(jeu, f) !== 0) return -1;
    }
  }
  empiler(c & 0xFF);
  if ((lire32(jeu, f + 0xC) & masque) || lire32(jeu, f + 4) === lire32(jeu, f + 0x14)) {
    if (vider(jeu, f) !== 0) return -1;
  }
  return c & 0xFF;
}

// 0x8750A — la routine de sortie de fprintf, que le moteur de printf appelle pour chaque
// caractère : 'fputc' sur le flot rangé en tête de sa structure, et un caractère de plus au compte.
function sortieFprintf(jeu, specs, c) {
  poserCaractere(jeu, c, lire32(jeu, specs));
  ecrire32(jeu, specs + 0x10, lire32(jeu, specs + 0x10) + 1);
}

// 0x87524 — 'vfprintf'(f, format, arguments) : le moteur de printf (0x883DF) écrit dans le flot.
// Un flot sans tampon est mis en tampon complet le temps de l'appel, puis vidé : la ligne part en
// une fois. Les bits _EOF et _SFERR du flot sont mis de côté et rendus à la fin ; une erreur
// pendant l'appel rend -1.
function vfprintf(jeu, f, format, args) {
  const { m8 } = jeu;
  const entree = jeu.T.R.esp >>> 0;
  const garde = lire32(jeu, f + 0xC) & 0x30;
  m8[f + 0xC] &= 0xCF;
  if (lire32(jeu, f + 8) === 0) donnerTampon(jeu, f);
  let provisoire = false;
  if (m8[f + 0xD] & 4) {
    m8[f + 0xD] &= 0xFB;
    provisoire = true;
    m8[f + 0xD] |= 1;
  }
  let n = appelOrigine(jeu, entree, 16 + 4, 0x87572, PRTF, f, format, args, SORTIE_FPRINTF);
  if (provisoire) {
    m8[f + 0xD] &= 0xFE;
    m8[f + 0xD] |= 4;
    vider(jeu, f);
  }
  if (m8[f + 0xC] & F_ERREUR) n = -1;
  ecrire32(jeu, f + 0xC, lire32(jeu, f + 0xC) | garde);
  return n;
}

// 0x90480 — '__InitFiles' : au démarrage, stderr (le troisième flot) passe sans tampon, et chaque
// flot statique déjà ouvert (stdin, stdout, stderr, stdaux, stdprn) reçoit son maillon dans la
// liste des flots ouverts. Le retour de l'allocation n'est pas vérifié.
function initialiserFlots(jeu) {
  const { m8 } = jeu;
  const drapeauxErreur = FLOTS + 2 * TAILLE_FLOT + 0xD;
  m8[drapeauxErreur] &= 0xF8;
  m8[drapeauxErreur] |= 4;
  for (let f = FLOTS; lire32(jeu, f + 0xC) !== 0; f += TAILLE_FLOT) {
    const maillon = allouerNoyau(jeu, 8);
    ecrire32(jeu, maillon + 4, f);
    ecrire32(jeu, maillon, lire32(jeu, FLOTS_OUVERTS));
    ecrire32(jeu, FLOTS_OUVERTS, maillon);
  }
  ecrire32(jeu, FLOTS_FERMES, 0);
}

// --- La lecture -----------------------------------------------------------------------------------
// Aucun scénario ne lit un flot : le jeu ne le fait qu'au lancement, dans des cas que l'hôte n'offre
// pas — `sndsetup.inf`, la configuration du son écrite par le programme d'installation, que l'hôte
// remplace par des variables d'environnement (divers.js : `fscanf`, `fclose`), et une ressource
// introuvable (amorcage.js : `gets` attend la touche Entrée). Ces réécritures sont en attente ; le
// banc bibliotheque-c.mjs les éprouve une à une.

// Le `getc` que Watcom développe en ligne : l'octet suivant du tampon, ou, le tampon épuisé (le
// compte passe sous zéro), 0x8A8B1.
function prendreDansLeTampon(jeu, f) {
  const n = (lire32(jeu, f + 4) - 1) | 0;
  ecrire32(jeu, f + 4, n);
  if (n < 0) return remplirEtPrendre(jeu, f);
  const p = lire32(jeu, f);
  ecrire32(jeu, f, p + 1);
  return jeu.m8[p >>> 0];
}

// 0x8A838 — 'fgetc'(f) : le caractère suivant, ou -1. Un flot qui n'est pas ouvert en lecture rend
// -1 (EBADF, _SFERR). En mode texte, un retour chariot est sauté (le caractère qui le suit est rendu
// à sa place, sans autre examen qu'un ^Z) et un ^Z marque la fin du fichier (_EOF, -1).
function lireCaractere(jeu, f) {
  const { m8 } = jeu;
  let c;
  if (!(m8[f + 0xC] & F_LECTURE)) {
    poserErrno(jeu, EBADF);
    c = -1;
    m8[f + 0xC] |= F_ERREUR;
  } else {
    c = prendreDansLeTampon(jeu, f);
  }
  if (m8[f + 0xC] & F_BINAIRE) return c;
  if (c === 0x0D) c = prendreDansLeTampon(jeu, f);
  if (c === 0x1A) {
    c = -1;
    m8[f + 0xC] |= F_FIN;
  }
  return c;
}

// 0x8A8B1 — '__filbuf'(f) : remplir le tampon (0x8A8DC) et en rendre le premier octet, ou -1 si rien
// n'a été lu.
function remplirEtPrendre(jeu, f) {
  if (remplirLeTampon(jeu, f) === 0) return -1;
  ecrire32(jeu, f + 4, lire32(jeu, f + 4) - 1);
  const p = (lire32(jeu, f) + 1) | 0;
  ecrire32(jeu, f, p);
  return jeu.m8[(p - 1) >>> 0];
}

// 0x8A8DC — '__fill_buffer'(f) : lire de quoi remplir le tampon, que le flot reçoit au besoin
// (0x8F4FC). Un terminal par ligne ou sans tampon fait d'abord écrire les tampons des terminaux
// (0x903E8) : l'invite s'affiche avant la saisie. L'entrée standard (descripteur 0) sur un terminal
// sans tampon lit un caractère de la console (0x90420) ; sinon, le tampon entier — un octet sans
// tampon — est lu (0x9043B). Rien de lu : _EOF ; une erreur : _SFERR et un compte nul. Rend le
// nombre d'octets en attente.
function remplirLeTampon(jeu, f) {
  const { m8 } = jeu;
  if (lire32(jeu, f + 8) === 0) donnerTampon(jeu, f);
  if ((m8[f + 0xD] & 0x20) && (m8[f + 0xD] & 6)) viderLesFlots(jeu, F_TERMINAL);
  m8[f + 0xC] &= ~F_RENDU;
  ecrire32(jeu, f, lire32(jeu, f + 8));
  if ((lire32(jeu, f + 0xC) & (F_TERMINAL | F_SANS_TAMPON)) === (F_TERMINAL | F_SANS_TAMPON)
      && lire32(jeu, f + 0x10) === 0) {
    ecrire32(jeu, f + 4, 0);
    const c = lireLaConsole(jeu);
    if (c !== -1) {
      m8[lire32(jeu, f) >>> 0] = c;
      ecrire32(jeu, f + 4, 1);
    }
  } else {
    const n = (m8[f + 0xD] & 4) ? 1 : lire32(jeu, f + 0x14);
    ecrire32(jeu, f + 4, lireBrut(jeu, lire32(jeu, f + 0x10), lire32(jeu, f), n));
  }
  const lus = lire32(jeu, f + 4);
  if (lus === 0) m8[f + 0xC] |= F_FIN;
  else if (lus < 0) {
    m8[f + 0xC] |= F_ERREUR;
    ecrire32(jeu, f + 4, 0);
  }
  return lire32(jeu, f + 4);
}

// 0x903E8 — '__flushall'(masque) : écrire le tampon de chaque flot ouvert qui porte un bit du masque
// et qui est sale (_DIRTY, 0x8B817). Rend le nombre de flots qui portent un bit du masque.
function viderLesFlots(jeu, masque) {
  let n = 0;
  for (let maillon = lire32(jeu, FLOTS_OUVERTS); maillon !== 0; maillon = lire32(jeu, maillon)) {
    const f = lire32(jeu, maillon + 4);
    if (!(lire32(jeu, f + 0xC) & masque)) continue;
    n++;
    if (jeu.m8[f + 0xD] & 0x10) vider(jeu, f);
  }
  return n;
}

// 0x90420 — lire un caractère de la console, avec écho (service 01h), sauf s'il en reste un de côté
// en [0xC2D58] ('ungetch'), qui est rendu et oublié.
function lireLaConsole(jeu) {
  const c = lire32(jeu, CARACTERE_DE_COTE);
  ecrire32(jeu, CARACTERE_DE_COTE, 0);
  if (c !== 0) return c;
  return servir(jeu, 0x21, { eax: 0x100 }).eax & 0xFF;
}

// 0x9043B — '__qread'(descripteur, tampon, n) : lire (3Fh), sans conversion. Rend le nombre d'octets
// lus, ou -1.
function lireBrut(jeu, descripteur, tampon, n) {
  const R = jeu.T.R;
  const r = resultatDos(servir(jeu, 0x21, {
    eax: avecAh(descripteur, 0x3F), ebx: avecBas16(R.ebx, descripteur), ecx: n, edx: tampon,
  }));
  if (r >= 0) return r;
  return erreurDos(jeu, r & 0xFFFF);
}

// 0x8AC96 — 'ungetc'(c, f) : remettre un caractère dans le tampon d'un flot ouvert en lecture qui
// n'est pas sale. Le tampon vide, il est posé à son dernier octet ; sinon, juste avant la position,
// qui ne doit pas être au début du tampon. Remettre un autre caractère que celui qui était là marque
// le flot (_UNGET). La fin du fichier est effacée. Rend le caractère (son octet), ou -1.
function rendreCaractere(jeu, c, f) {
  const { m8 } = jeu;
  if ((c | 0) === -1) return -1;
  if (m8[f + 0xD] & 0x10) return -1;
  if (!(m8[f + 0xC] & F_LECTURE)) return -1;
  if (lire32(jeu, f + 8) === 0) donnerTampon(jeu, f);
  let autre = true;
  if (lire32(jeu, f + 4) === 0) {
    ecrire32(jeu, f + 4, 1);
    ecrire32(jeu, f, lire32(jeu, f + 8) + lire32(jeu, f + 0x14) - 1);
  } else {
    if (lire32(jeu, f) === lire32(jeu, f + 8)) return -1;
    ecrire32(jeu, f + 4, lire32(jeu, f + 4) + 1);
    ecrire32(jeu, f, lire32(jeu, f) - 1);
    autre = m8[lire32(jeu, f) >>> 0] !== (c | 0);
  }
  if (autre) m8[f + 0xC] |= F_RENDU;
  m8[lire32(jeu, f) >>> 0] = c;
  m8[f + 0xC] &= ~F_FIN;
  return c & 0xFF;
}

// 0x82DD1 — 'gets'(tampon) : lire une ligne de l'entrée standard (le premier flot), sans son saut de
// ligne, et la terminer par un zéro. `getc` en ligne pour un flot binaire, 'fgetc' sinon. Rend
// `tampon`, ou 0 — rien n'est alors terminé — si la fin du fichier arrive avant le premier
// caractère, ou après une erreur. _EOF et _SFERR sont effacés le temps de la lecture, puis ceux
// d'avant ajoutés aux nouveaux.
function lireUneLigne(jeu, tampon) {
  const { m8 } = jeu;
  const f = FLOTS;
  const garde = lire32(jeu, f + 0xC) & (F_FIN | F_ERREUR);
  m8[f + 0xC] &= ~(F_FIN | F_ERREUR);
  let p = tampon | 0, c;
  for (;;) {
    c = (m8[f + 0xC] & F_BINAIRE) ? prendreDansLeTampon(jeu, f) : lireCaractere(jeu, f);
    if (c === -1 || c === 0x0A) break;
    m8[p >>> 0] = c;
    p = (p + 1) | 0;
  }
  let resultat = tampon;
  if (c === -1 && (p === (tampon | 0) || (m8[f + 0xC] & F_ERREUR))) resultat = 0;
  else m8[p >>> 0] = 0;
  ecrire32(jeu, f + 0xC, lire32(jeu, f + 0xC) | garde);
  return resultat;
}

// fscanf lit par le moteur de scanf (0x8AD11, sos-bruitages.js) avec sa structure de lecture, dans
// la pile : +0 lire un caractère (0x830C9), +4 le rendre (0x83111), +8 le flot, +0x10 des drapeaux
// (bit 1 : fin de l'entrée).
const LECTURE_LIRE = 0, LECTURE_RENDRE = 4, LECTURE_FLOT = 8, LECTURE_DRAPEAUX = 0x10;
const LIRE_DU_FLOT = 0x830C9, RENDRE_AU_FLOT = 0x83111, VFSCANF = 0x83127;

// 0x830C9 — lire un caractère du flot de la structure : `getc` en ligne pour un flot binaire, 'fgetc'
// sinon. -1 lève le drapeau de fin de la structure.
function lireDuFlot(jeu, lecture) {
  const f = lire32(jeu, lecture + LECTURE_FLOT);
  const c = (jeu.m8[f + 0xC] & F_BINAIRE) ? prendreDansLeTampon(jeu, f) : lireCaractere(jeu, f);
  if (c === -1) jeu.m8[lecture + LECTURE_DRAPEAUX] |= 2;
  return c;
}

// 0x83111 — rendre le caractère c au flot de la structure : 'ungetc'.
const rendreAuFlot = (jeu, c, lecture) => rendreCaractere(jeu, c, lire32(jeu, lecture + LECTURE_FLOT));

// Le cadre `push ebp ; mov ebp, esp ; sub esp, locales` de l'original, pour les fonctions qui
// passent l'adresse d'une de leurs variables : l'appel suivant part de leur bas, et un gestionnaire
// livré pendant un service ne peut pas les écraser. `fermer` rend ebp à l'appelant.
function ouvrirCadre(jeu, locales) {
  const T = jeu.T;
  T.sauver();
  const R = T.R, entree = R.esp >>> 0, ebpAppelant = R.ebp;
  const ebp = entree - 4;
  ecrire32(jeu, ebp, ebpAppelant);
  R.ebp = ebp;
  T.charger();
  return {
    ebp,
    bas: ebp - locales,
    local: (decalage) => ebp - decalage,
    fermer() { T.sauver(); T.R.ebp = ebpAppelant; T.charger(); },
  };
}

// 0x83127 — 'vfscanf'(f, format, arguments) : le moteur de scanf sur la structure de lecture du flot,
// prise dans ses variables.
function vfscanf(jeu, f, format, args) {
  const cadre = ouvrirCadre(jeu, 0x14);
  try {
    const lecture = cadre.local(0x14);
    ecrire32(jeu, lecture + LECTURE_LIRE, LIRE_DU_FLOT);
    ecrire32(jeu, lecture + LECTURE_FLOT, f);
    ecrire32(jeu, lecture + LECTURE_RENDRE, RENDRE_AU_FLOT);
    return jeu.appelerDepuis(0x83150, cadre.bas, MOTEUR_DE_SCANF, lecture, format, args);
  } finally { cadre.fermer(); }
}

// 0x83155 — 'fscanf'(f, format, ...) : la liste des arguments commence après le format, dans la pile
// de l'appelant ; son adresse est une variable.
function fscanf(jeu, f, format) {
  const cadre = ouvrirCadre(jeu, 4);
  try {
    const liste = cadre.local(4);
    ecrire32(jeu, liste, cadre.ebp + 0x10);
    return jeu.appelerDepuis(0x83170, cadre.bas, VFSCANF, f, format, liste);
  } finally { cadre.fermer(); }
}

// 0x83175 — 'fclose'(f) : un flot de la liste des flots ouverts est fermé (0x831A1, sortie.js :
// tampon écrit, descripteur fermé, maillon rendu). Rend son résultat, ou -1 pour un flot inconnu.
function fermerFlot(jeu, f) {
  const entree = jeu.T.R.esp >>> 0;
  for (let maillon = lire32(jeu, FLOTS_OUVERTS); maillon !== 0; maillon = lire32(jeu, maillon)) {
    if (lire32(jeu, maillon + 4) === (f | 0)) return appelOrigine(jeu, entree, 4, 0x8319C, FERMER_UN_FLOT, f, 1);
  }
  return -1;
}

// ================================================================================================
// 4. Le tas
// ================================================================================================

// 0x8FC70 — le cœur de '_nmalloc' (en assembleur ; eax la taille, ebx le descripteur du tas). La
// taille est portée à un multiple de 4 avec l'en-tête, 12 au moins. La recherche part du bloc de
// reprise, ou du premier bloc libre si la taille demandée ne dépasse pas la plus grande taille
// libre vue avant la reprise ; un bloc assez grand est coupé (la fin reste libre, et devient la
// reprise) si le reste fait 12 octets ou plus, sinon pris en entier. Faute de bloc, la plus grande
// taille libre rencontrée est notée, pour que la prochaine demande trop grande échoue d'emblée.
// Rend le pointeur utile (après l'en-tête), ou 0.
function allouerDansLeTas(jeu, demande, tas) {
  if (demande === 0) return 0;
  let t = (demande >>> 0) + 7;
  if (t > 0xFFFFFFFF) return 0;
  t = (t & 0xFFFFFFFC) >>> 0;
  if (t < 12) t = 12;
  if (t > (lire32(jeu, tas + 0x10) >>> 0)) return 0;
  let bloc = lire32(jeu, tas + 8);
  let plusGrand = lire32(jeu, tas + 0xC) >>> 0;
  if (t <= plusGrand) { bloc = lire32(jeu, tas + 0x24); plusGrand = 0; }
  const sentinelle = tas + 0x1C;
  let taille;
  for (;;) {
    taille = lire32(jeu, bloc) >>> 0;
    if (t <= taille) break;
    if (taille > plusGrand) plusGrand = taille;
    bloc = lire32(jeu, bloc + 8);
    if (bloc === sentinelle) { ecrire32(jeu, tas + 0x10, plusGrand); return 0; }
  }
  const reste = (taille - t) >>> 0;
  ecrire32(jeu, tas + 0xC, plusGrand);
  ecrire32(jeu, tas + 0x14, lire32(jeu, tas + 0x14) + 1);
  const suivant = lire32(jeu, bloc + 8);
  if (reste >= 12) {
    const fin = bloc + t;
    ecrire32(jeu, tas + 8, fin);
    ecrire32(jeu, fin, reste);
    ecrire32(jeu, bloc, t);
    const precedent = lire32(jeu, bloc + 4);
    ecrire32(jeu, fin + 4, precedent);
    ecrire32(jeu, fin + 8, suivant);
    ecrire32(jeu, precedent + 8, fin);
    ecrire32(jeu, suivant + 4, fin);
  } else {
    ecrire32(jeu, tas + 0x18, lire32(jeu, tas + 0x18) - 1);
    const precedent = lire32(jeu, bloc + 4);
    ecrire32(jeu, precedent + 8, suivant);
    ecrire32(jeu, suivant + 4, precedent);
    ecrire32(jeu, tas + 8, precedent);
  }
  ecrire32(jeu, bloc, lire32(jeu, bloc) | 1);
  return bloc + 4;
}

// 0x8A5B1 — '_nmalloc'(taille) : allouer ; faute de place, agrandir le tas une fois (0x90239) et
// réessayer, puis demander à '__nmemneed' (0x903D6) s'il faut insister — il répond toujours non.
function allouerNoyau(jeu, taille) {
  if (taille === 0) return 0;
  let etendu = false;
  let p;
  for (;;) {
    p = allouerDansLeTas(jeu, taille, TAS);
    if (p !== 0) break;
    if (!etendu && agrandirLeTas(jeu, taille)) { etendu = true; continue; }
    if (memoireRequise(jeu, taille) === 0) break;
    etendu = false;
  }
  jeu.m8[TAS_MODIFIE] = 0;
  return p;
}

// 0x8A5A1 — 'malloc'.
const allouer = (jeu, taille) => allouerNoyau(jeu, taille);

// 0x903D6 — '__nmemneed' : rien à libérer ailleurs ; rend 0.
const memoireRequise = () => 0;

// 0x90239 — '__ExpandDGROUP'(taille) : agrandir le tas d'au moins `taille` octets. Sous DOS/4GW
// ([0xC2D66] = 1), une nouvelle région est demandée au DPMI (0x90151), arrondie à 4 Ko, jamais
// moins que _amblksiz ; les autres extendeurs (non exercés) passent par l'int 21h 4800h, ou par
// 'sbrk' au-delà du segment de données. La région est chaînée (0x8FE2B) — ou, si elle prolonge la
// dernière, ajoutée à celle-ci — et son espace libéré dans le tas. Rend 1, ou 0.
function agrandirLeTas(jeu, demande) {
  const { m8 } = jeu;
  if (lire32(jeu, TAS_PERMIS) === 0) return 0;
  if (lire32(jeu, LIMITE_SEGMENT) === -2) return 0;
  let n = (demande + 3) & ~3;
  if (n === 0) return 0;
  const extendeur = m8[EXTENDEUR];
  const entree = jeu.T.R.esp >>> 0;
  if (extendeur === 1 || extendeur === 9) n = (n + 0x2C) | 0;
  else n = (n - appelOrigine(jeu, entree, 12, 0x90281, TAS_RESERVE)) | 0;
  const t = (n + 0x20) | 0;
  if ((t >>> 0) < (n >>> 0)) return 0;
  n = t;
  if ((t >>> 0) < (lire32(jeu, PAS_DU_TAS) >>> 0)) n = lire32(jeu, PAS_DU_TAS) & ~1;
  n = ((n + 0xFFF) & ~0xFFF) | 0;

  let region;                                        // edx : où commence l'espace nouveau
  if (extendeur === 1 || extendeur === 9) {
    let r;
    if (extendeur === 1) {
      r = allouerRegionDpmi(jeu, n);
      n = (n - 0x14) | 0;
    } else {
      const s = servir(jeu, 0x21, { eax: 0x80004800, ebx: n });
      r = s.CF ? 0 : s.eax;
      n = (n - 8) | 0;
    }
    if (r === 0) return 0;
    region = (r + 8) | 0;
    ecrire32(jeu, r, 0);
  } else {
    if (extendeur >= 2 && extendeur <= 8) {
      const limite = jeu.machine.limiteSeg(jeu.T.R.ds);
      const lsl = limite >= 0 ? limite : (jeu.T.R.ds & 0xFFFF);
      ecrire32(jeu, LIMITE_SEGMENT, lsl + 1);
    }
    n = (n + lire32(jeu, LIMITE_SEGMENT)) | 0;
    if ((n >>> 0) < (lire32(jeu, LIMITE_SEGMENT) >>> 0)) n = -2;
    const r = appelOrigine(jeu, entree, 12, 0x9032D, SBRK, n);
    if (r === -1) return 0;
    if ((r >>> 0) > 0xFFFFFFF8) return 0;
    if ((n >>> 0) <= (r >>> 0)) return 0;
    region = r;
    n = (n - r) | 0;
  }

  const utile = (n - 8) | 0;
  if ((utile >>> 0) > (n >>> 0)) return 0;
  let taille = utile;
  let bloc;
  const derniere = lire32(jeu, TAS_PREMIERE_REGION);
  let prolonge = false;
  if (derniere !== 0) {
    const fin = (derniere + lire32(jeu, derniere)) | 0;
    const debut = (region - 8) | 0;
    if (debut === fin) {
      // L'espace nouveau prolonge la dernière région : sa marque de fin devient un bloc.
      taille = (utile + 8) | 0;
      ecrire32(jeu, derniere, lire32(jeu, derniere) + taille);
      ecrire32(jeu, taille + debut, -1);
      ecrire32(jeu, taille + debut + 4, 0);
      bloc = fin;
      prolonge = true;
    }
  }
  if (!prolonge) {
    if ((taille >>> 0) < 0x18) return 0;
    ecrire32(jeu, region, taille);
    bloc = ajouterRegion(jeu, region);
    taille = lire32(jeu, bloc);
  }
  ecrire32(jeu, bloc, taille | 1);
  ecrire32(jeu, TAS_PLUS_GRAND, -1);
  ecrire32(jeu, TAS_PRIS, lire32(jeu, TAS_PRIS) + 1);
  liberer(jeu, bloc + 4);
  return 1;
}

// 0x90151 — une région de mémoire du DPMI (0501h) de `taille` octets, après avoir rendu les
// régions devenues vides (0x8FF5B). Elle commence par son en-tête : +0 le handle DPMI, +4 la
// taille, +8 la région suivante, +0x10 le sélecteur DOS (0 pour une région DPMI) ; le tas prend
// la suite en +0xC. Faute de mémoire étendue, et pour 64 Ko au plus, un repli (non exercé) prend
// un bloc de mémoire conventionnelle au DOS (48h), après avoir sondé la place par une demande
// démesurée qu'il rend aussitôt. Rend l'adresse de l'en-tête + 0xC, ou 0.
function allouerRegionDpmi(jeu, taille) {
  const R = jeu.T.R;
  rendreRegionsVides(jeu);
  const s = servir(jeu, 0x31, {
    eax: 0x0501, ebx: avecBas16(R.ebx, taille >>> 16), ecx: avecBas16(R.ecx, taille),
  });
  let r = 0;
  if (!s.CF) {
    r = (((s.ebx & 0xFFFF) << 16) | (s.ecx & 0xFFFF)) | 0;
    ecrire16(jeu, r, s.edi);
    ecrire16(jeu, r + 2, s.esi);
  }
  const chainer = (region, selecteur) => {
    ecrire32(jeu, region + 4, taille);
    ecrire32(jeu, region + 8, lire32(jeu, REGIONS_DPMI));
    ecrire32(jeu, REGIONS_DPMI, region);
    ecrire32(jeu, region + 0x10, selecteur);
    return (region + 0xC) | 0;
  };
  if (r !== 0) return chainer(r, 0);

  if (lire16(jeu, MEMOIRE_DOS + 2) & 0xFFF0) ecrire32(jeu, MEMOIRE_DOS, 0xFFFFF);
  if ((taille >>> 0) > 0x10000) return 0;
  const sonde = resultatDos(servir(jeu, 0x21, {
    eax: 0x4800, ebx: (lire32(jeu, MEMOIRE_DOS) >>> 4) | 1,
  }));
  if (sonde < 0) return 0;
  const bloc = resultatDos(servir(jeu, 0x21, { eax: avecAh(sonde, 0x48), ebx: taille >>> 4 }));
  servir(jeu, 0x21, { eax: avecAh(sonde, 0x49), es: sonde });
  if (bloc < 0) return 0;
  const b = servir(jeu, 0x31, { eax: 6, ebx: bloc });
  const base = (((b.ecx & 0xFFFF) << 16) | (b.edx & 0xFFFF)) | 0;
  return chainer(base, bloc);
}

// 0x8FF5B — rendre au DPMI (0502h), ou au DOS (49h), les régions dont tout l'espace est libre :
// leur premier bloc, libre, en couvre la longueur.
function rendreRegionsVides(jeu) {
  let precedente = 0;
  let region = lire32(jeu, REGIONS_DPMI);
  while (region !== 0) {
    if (((lire32(jeu, region + 0x20) + 0xC) | 0) === lire32(jeu, region + 0x14)) {
      retirerRegion(jeu, precedente, region);
      const handle = lire32(jeu, region);
      const selecteur = lire32(jeu, region + 0x10);
      const suivante = lire32(jeu, region + 8);
      if (selecteur === 0) {
        servir(jeu, 0x31, {
          eax: 0x0502, ebx: suivante, edx: handle >>> 16,
          esi: avecBas16(jeu.T.R.esi, handle >>> 16), edi: avecBas16(jeu.T.R.edi, handle),
        });
      } else {
        servir(jeu, 0x21, { eax: 0x4900 | (selecteur & 0xFF), ebx: suivante, es: selecteur & 0xFFFF });
      }
      region = suivante;
    } else {
      precedente = region;
      region = lire32(jeu, region + 8);
    }
  }
}

// 0x8FEC1 — détacher une région du tas : de la chaîne DPMI (après `precedente`), de la liste des
// régions du tas (0x8FEA5) et, si son premier bloc est libre, de la liste des blocs libres. La
// région d'avant est raccordée à celle d'après par le pointeur qui suit sa marque de fin.
function retirerRegion(jeu, precedente, region) {
  const avant = lire32(jeu, region + 0x18);
  if (avant !== 0) {
    const tete = region + 0x14;
    ecrire32(jeu, avant + lire32(jeu, avant) + 4, lire32(jeu, tete + lire32(jeu, tete) + 4));
  }
  if (precedente === 0) ecrire32(jeu, REGIONS_DPMI, lire32(jeu, region + 8));
  else ecrire32(jeu, precedente + 8, lire32(jeu, region + 8));
  const tete = region + 0x14;
  if (tete === lire32(jeu, TAS_PREMIERE_REGION)) ecrire32(jeu, TAS_PREMIERE_REGION, lire32(jeu, region + 0x1C));
  if (tete === lire32(jeu, TAS_REGIONS)) ecrire32(jeu, TAS_REGIONS, lire32(jeu, region + 0x1C));
  detacher(jeu, tete);
  if (!(jeu.m8[region + 0x20] & 1)) {
    const premier = region + 0x20;
    detacher(jeu, premier);
    ecrire32(jeu, TAS_LIBRES, lire32(jeu, TAS_LIBRES) - 1);
    if (premier === lire32(jeu, TAS_REPRISE)) ecrire32(jeu, TAS_REPRISE, lire32(jeu, region + 0x28));
  }
}

// 0x8FEA5 — retirer un maillon d'une liste doublement chaînée (+4 précédent, +8 suivant).
function detacher(jeu, maillon) {
  const precedent = lire32(jeu, maillon + 4);
  const suivant = lire32(jeu, maillon + 8);
  if (precedent !== 0) ecrire32(jeu, precedent + 8, suivant);
  if (suivant !== 0) ecrire32(jeu, suivant + 4, precedent);
}

// 0x8FE2B — chaîner une région dans la liste des régions du tas, triée par adresse, et en faire un
// seul bloc (sa longueur moins l'en-tête de 12 octets), suivi de la marque de fin -1 et du premier
// bloc de la région suivante. Rend le bloc. Anomalie reproduite : une région placée en tête devient
// aussi la « première région » [0xC4720], que 0x90239 prend pour la dernière.
function ajouterRegion(jeu, region) {
  let precedente = 0;
  let suivante = lire32(jeu, TAS_REGIONS);
  while (suivante !== 0 && (region >>> 0) >= (suivante >>> 0)) {
    precedente = suivante;
    suivante = lire32(jeu, suivante + 8);
  }
  ecrire32(jeu, region + 4, precedente);
  ecrire32(jeu, region + 8, suivante);
  if (precedente !== 0) {
    ecrire32(jeu, precedente + 8, region);
    ecrire32(jeu, precedente + lire32(jeu, precedente) + 4, region + 0xC);
  } else {
    ecrire32(jeu, TAS_PREMIERE_REGION, region);
    ecrire32(jeu, TAS_REGIONS, region);
  }
  let premierSuivant = 0;
  if (suivante !== 0) {
    ecrire32(jeu, suivante + 4, region);
    premierSuivant = suivante + 0xC;
  }
  const bloc = region + 0xC;
  const taille = (lire32(jeu, region) - 0xC) | 0;
  ecrire32(jeu, bloc, taille);
  if ((bloc >>> 0) <= (lire32(jeu, TAS_REPRISE) >>> 0) && (taille >>> 0) > (lire32(jeu, TAS_AVANT_REPRISE) >>> 0)) {
    ecrire32(jeu, TAS_AVANT_REPRISE, taille);
  }
  ecrire32(jeu, bloc + taille, -1);
  ecrire32(jeu, bloc + taille + 4, premierSuivant);
  return bloc;
}

// 0x8FD20 — le cœur de 'free' (en assembleur ; eax le pointeur, ebx le descripteur du tas). Un
// bloc qui n'est pas pris est ignoré. Le bloc libéré fusionne avec le bloc libre qui le suit, puis
// avec celui qui le précède s'ils se touchent ; sinon il est inséré dans la liste des blocs libres,
// à sa place par adresse. Pour trouver cette place, Watcom part de la reprise, ou du premier bloc
// libre, et avance ; quand les blocs pris sont nombreux, il cherche d'abord en avant du bloc, pas
// plus loin que deux fois le nombre moyen de blocs pris par bloc libre.
function libererDansLeTas(jeu, p, tas) {
  if (p === 0) return;
  const bloc = (p - 4) | 0;
  let taille = lire32(jeu, bloc);
  if (!(taille & 1)) return;
  taille &= ~1;
  const voisin = (bloc + taille) | 0;
  let place;                                         // edi : le bloc libre devant lequel insérer
  if (!(lire32(jeu, voisin) & 1)) {
    if (voisin === lire32(jeu, tas + 8)) ecrire32(jeu, tas + 8, bloc);
    ecrire32(jeu, bloc, taille + lire32(jeu, voisin));
    const precedent = lire32(jeu, voisin + 4);
    place = lire32(jeu, voisin + 8);
    ecrire32(jeu, precedent + 8, place);
    ecrire32(jeu, place + 4, precedent);
    ecrire32(jeu, tas + 0x18, lire32(jeu, tas + 0x18) - 1);
  } else {
    ecrire32(jeu, bloc, taille);
    place = chercherPlace(jeu, bloc, tas);
  }

  let taillePlacee = lire32(jeu, bloc);
  const suivant = place;
  const precedent = lire32(jeu, place + 4);
  let libere = bloc;
  if (((precedent + lire32(jeu, precedent)) | 0) === bloc) {
    taillePlacee = (taillePlacee + lire32(jeu, precedent)) | 0;
    ecrire32(jeu, precedent, taillePlacee);
    if (bloc === lire32(jeu, tas + 8)) ecrire32(jeu, tas + 8, precedent);
    libere = precedent;
  } else {
    ecrire32(jeu, tas + 0x18, lire32(jeu, tas + 0x18) + 1);
    ecrire32(jeu, bloc + 8, suivant);
    ecrire32(jeu, bloc + 4, precedent);
    ecrire32(jeu, precedent + 8, bloc);
    ecrire32(jeu, suivant + 4, bloc);
  }
  ecrire32(jeu, tas + 0x14, lire32(jeu, tas + 0x14) - 1);
  const t = taillePlacee >>> 0;
  if ((libere >>> 0) < (lire32(jeu, tas + 8) >>> 0) && t > (lire32(jeu, tas + 0xC) >>> 0)) ecrire32(jeu, tas + 0xC, t);
  if (t > (lire32(jeu, tas + 0x10) >>> 0)) ecrire32(jeu, tas + 0x10, t);
}

// La place d'un bloc libéré dans la liste des blocs libres (0x8FD62 à 0x8FDDC) : le premier bloc
// libre d'adresse plus haute.
function chercherPlace(jeu, bloc, tas) {
  const b = bloc >>> 0;
  const reprise = lire32(jeu, tas + 8);
  if (b < (reprise >>> 0)) {
    if (b > (lire32(jeu, reprise + 4) >>> 0)) return reprise;
    const premier = lire32(jeu, tas + 0x24);
    if (b < (premier >>> 0)) return premier;
  } else {
    const apres = lire32(jeu, reprise + 8);
    if (b < (apres >>> 0)) return apres;
    if (b > (lire32(jeu, tas + 0x20) >>> 0)) return tas + 0x1C;   // après le dernier : la sentinelle
  }
  // Chercher en avant du bloc, parmi les blocs qui le suivent dans sa région.
  const pris = lire32(jeu, tas + 0x14) >>> 0;
  const libres = lire32(jeu, tas + 0x18) >>> 0;
  let essais = Math.floor(pris / (((libres + 1) >>> 0) || 0x100000000)) >>> 0;
  if (essais < libres) {
    essais = (essais * 2) >>> 0;
    if (((pris - libres) >>> 0) <= libres) essais = 0;
    let x = (bloc + lire32(jeu, bloc)) | 0;
    for (;;) {
      const t = lire32(jeu, x);
      if (!(t & 1)) return x;
      if (t === -1) break;
      x = (x + (t & ~1)) | 0;
      essais = (essais - 1) >>> 0;
      if (essais === 0) break;
    }
  }
  let x = lire32(jeu, tas + 8);
  if (b < (x >>> 0)) x = lire32(jeu, tas + 0x24);
  while (!(b < (x >>> 0))) x = lire32(jeu, x + 8);
  return x;
}

// 0x8B8F8 — '_nfree' ; 'free' (0x8B8E8, sortie.js) ne fait que l'appeler : dans le modèle plat, le
// tas de Watcom n'a qu'une sorte de mémoire.
function liberer(jeu, p) {
  libererDansLeTas(jeu, p, TAS);
  jeu.m8[TAS_MODIFIE] = 0;
}

// 0x8A636 — '_expand'(p, taille) : agrandir ou réduire un bloc sur place. Réduire rend la fin au
// tas si elle fait 12 octets ou plus. Agrandir absorbe les blocs libres qui suivent ; au bout de la
// région, sous DOS/4GW, la région entière est redimensionnée par le DPMI (0x8FFCF) ; sinon le tas
// est agrandi une fois. Rend p, ou 0 si la place manque (le bloc garde alors ce qu'il a absorbé).
function etendre(jeu, p, demande) {
  const { m8 } = jeu;
  let t = ((demande + 7) & 0xFFFFFFFC) >>> 0;
  if ((demande >>> 0) > t) t = 0xFFFFFFFF;
  if (t < 12) t = 12;
  const bloc = (p - 4) | 0;
  const actuelle = (lire32(jeu, bloc) & ~1) >>> 0;
  if (actuelle >= t) {
    const reste = (actuelle - t) >>> 0;
    if (reste < 12) return p;
    ecrire32(jeu, bloc, t | 1);
    const fin = (bloc + t) | 0;
    ecrire32(jeu, fin, reste | 1);
    ecrire32(jeu, TAS_PRIS, lire32(jeu, TAS_PRIS) + 1);
    liberer(jeu, fin + 4);
    return p;
  }
  let etendu = false;
  let manque = (t - actuelle) >>> 0;
  let voisin = (bloc + actuelle) | 0;
  for (;;) {
    const taille = lire32(jeu, voisin);
    if (taille === -1) {
      if (m8[EXTENDEUR] === 9) return 0;
      if (m8[EXTENDEUR] === 1) return redimensionnerRegion(jeu, bloc, t);
      if (etendu) return 0;
      if (!agrandirLeTas(jeu, manque)) return 0;
      etendu = true;
      continue;
    }
    if (taille & 1) return 0;
    const suivant = lire32(jeu, voisin + 8);
    const precedent = lire32(jeu, voisin + 4);
    if (voisin === lire32(jeu, TAS_REPRISE)) ecrire32(jeu, TAS_REPRISE, precedent);
    const u = taille >>> 0;
    if (u >= manque && ((u - manque) >>> 0) >= 12) {
      const nouveau = (voisin + manque) | 0;
      ecrire32(jeu, nouveau, u - manque);
      ecrire32(jeu, nouveau + 4, precedent);
      ecrire32(jeu, nouveau + 8, suivant);
      ecrire32(jeu, precedent + 8, nouveau);
      ecrire32(jeu, suivant + 4, nouveau);
      ecrire32(jeu, bloc, lire32(jeu, bloc) + manque);
      m8[TAS_MODIFIE] = 0;
      return p;
    }
    ecrire32(jeu, precedent + 8, suivant);
    ecrire32(jeu, suivant + 4, precedent);
    ecrire32(jeu, bloc, lire32(jeu, bloc) + u);
    m8[TAS_MODIFIE] = 0;
    ecrire32(jeu, TAS_LIBRES, lire32(jeu, TAS_LIBRES) - 1);
    if (u >= manque) return p;
    manque = (manque - u) >>> 0;
    voisin = (voisin + u) | 0;
  }
}

// 0x8A623 — '_expand', l'entrée publique.
const etendreBloc = (jeu, p, taille) => etendre(jeu, p, taille);

// 0x8FFCF — agrandir un bloc en redimensionnant sa région DPMI (0503h), quand il en est le premier
// bloc et que la région ne contient rien d'autre. La région est détachée, redimensionnée (arrondie
// à 4 Ko avec ses en-têtes), puis rechaînée ; ce qui dépasse la taille voulue est rendu au tas.
// Rend le nouveau pointeur du bloc — la région a pu changer d'adresse —, ou 0 (la région est alors
// rechaînée telle quelle).
function redimensionnerRegion(jeu, bloc, taille) {
  rendreRegionsVides(jeu);
  let precedente = 0;
  let region = lire32(jeu, REGIONS_DPMI);
  while (region !== 0) {
    if (bloc === region + 0x20) {
      if ((((lire32(jeu, region + 0x20) & ~1) + 0xC) | 0) !== lire32(jeu, region + 0x14)) return 0;
      if (lire32(jeu, region + 0x10) !== 0) return 0;
      retirerRegion(jeu, precedente, region);
      let longueur = ((taille + 0x2C + 0xFFF) & ~0xFFF) | 0;
      precedente = region;
      const s = servir(jeu, 0x31, {
        eax: (region & ~0xFFFF) | 0x0503, ebx: avecBas16(region, longueur >>> 16),
        ecx: avecBas16(jeu.T.R.ecx, longueur),
        esi: avecBas16(jeu.T.R.esi, lire16(jeu, region + 2)), edi: avecBas16(jeu.T.R.edi, lire16(jeu, region)),
      });
      let nouvelle = 0;
      if (!s.CF) {
        nouvelle = (((s.ebx & 0xFFFF) << 16) | (s.ecx & 0xFFFF)) | 0;
        ecrire16(jeu, nouvelle, s.edi);
        ecrire16(jeu, nouvelle + 2, s.esi);
      }
      let r = nouvelle, resultat = nouvelle;
      if (nouvelle === 0) {
        r = precedente;
        resultat = 0;
      } else {
        ecrire32(jeu, nouvelle + 4, longueur);
        longueur = (longueur - 0x14 - 8) | 0;
        resultat = nouvelle + 0x24;
        ecrire32(jeu, nouvelle + 0x14, longueur);
      }
      ecrire32(jeu, r + 8, lire32(jeu, REGIONS_DPMI));
      ecrire32(jeu, REGIONS_DPMI, r);
      ecrire32(jeu, r + 0xC, 0);
      ecrire32(jeu, r + 0x10, 0);
      ajouterRegion(jeu, r + 0x14);
      if (resultat !== 0) {
        const reste = (lire32(jeu, r + 0x20) - taille) >>> 0;
        if (reste >= 12) {
          ecrire32(jeu, r + 0x20, taille | 1);
          const fin = (r + 0x20 + taille) | 0;
          ecrire32(jeu, fin, reste | 1);
          ecrire32(jeu, TAS_PLUS_GRAND, -1);
          ecrire32(jeu, TAS_PRIS, lire32(jeu, TAS_PRIS) + 1);
          liberer(jeu, fin + 4);
        }
      }
      jeu.m8[r + 0x20] |= 1;
      return resultat;
    }
    precedente = region;
    region = lire32(jeu, region + 8);
  }
  return 0;
}

// ================================================================================================
// 5. Les chaînes
// ================================================================================================

const minuscule = (c) => (c >= 0x41 && c <= 0x5A ? c + 0x20 : c);

// 0x833D8 — 'stricmp' : comparer sans tenir compte de la casse (ASCII seulement).
function comparerSansCasse(jeu, a, b) {
  const { m8 } = jeu;
  for (;;) {
    const c1 = minuscule(m8[a]), c2 = minuscule(m8[b]);
    if (c1 !== c2 || c2 === 0) return c1 - c2;
    a++; b++;
  }
}

// 0x8B92D — 'strnicmp' : la même, sur n caractères au plus.
function comparerSansCasseN(jeu, a, b, n) {
  const { m8 } = jeu;
  for (;;) {
    if (n === 0) return 0;
    const c1 = minuscule(m8[a]), c2 = minuscule(m8[b]);
    if (c1 !== c2) return c1 - c2;
    if (c2 === 0) return 0;
    n = (n - 1) | 0; a++; b++;
  }
}

// 0x874D8 — 'strncmp'.
function comparerN(jeu, a, b, n) {
  const { m8 } = jeu;
  for (;;) {
    if (n === 0) return 0;
    if (m8[a] !== m8[b]) return m8[a] - m8[b];
    if (m8[a] === 0) return 0;
    n = (n - 1) | 0; a++; b++;
  }
}

// 0x8A987 — 'tolower', sur l'entier entier (comparaisons signées).
const enMinuscule = (jeu, c) => ((c | 0) >= 0x41 && (c | 0) <= 0x5A ? (c + 0x20) | 0 : c);

// 0x832F5 — 'getenv' : la valeur d'une variable d'environnement (après le '='), le nom comparé
// sans tenir compte de la casse ; 0 si elle est absente.
function lireEnvironnement(jeu, nom) {
  let p = lire32(jeu, ENVIRONNEMENT);
  if (p === 0 || nom === 0) return 0;
  const entree = jeu.T.R.esp >>> 0;
  const n = appelOrigine(jeu, entree, 16, 0x83313, STRLEN, nom);
  for (let e = lire32(jeu, p); e !== 0; p += 4, e = lire32(jeu, p)) {
    if (comparerSansCasseN(jeu, e, nom, n) === 0 && jeu.m8[e + n] === 0x3D) return (e + n + 1) | 0;
  }
  return 0;
}

// 0x83023 — 'fopen'(nom, mode) : l'ouverture commune (0x82FF8), sans flot à réutiliser.
function ouvrirFlot(jeu, nom, mode) {
  const entree = jeu.T.R.esp >>> 0;
  return appelOrigine(jeu, entree, 4, 0x83033, FOPEN_INTERNE, nom, mode, 0);
}

// ================================================================================================
// 6. Le démarrage
// ================================================================================================

// 0x872C4 — '__InitRtns' : exécuter les routines d'initialisation de la table 0xCC7E4 (six octets
// chacune : un état, 2 une fois faite ; une priorité ; l'adresse). À chaque tour, la routine non
// faite de plus petite priorité — la dernière de la table à égalité : les cinq routines du jeu,
// toutes de priorité 32, passent donc à rebours (0x8F574, 0x90629, 0x90480, 0x89F27, 0x8734A).
function executerInitialisations(jeu) {
  const { m8 } = jeu;
  const T = jeu.T, R = T.R;
  const entree = R.esp >>> 0;
  const esEntree = R.es;
  for (;;) {
    let choisie = ROUTINES_INIT_FIN;
    let priorite = 0xFF;
    for (let e = ROUTINES_INIT; e < ROUTINES_INIT_FIN; e += 6) {
      if (m8[e] === 2) continue;
      if (m8[e + 1] <= priorite) { choisie = e; priorite = m8[e + 1]; }
    }
    if (choisie === ROUTINES_INIT_FIN) break;
    const routine = lire32(jeu, choisie + 2);
    if (routine !== 0) {
      T.sauver(); R.es = R.ds; T.charger();          // push ds ; pop es
      appelOrigine(jeu, entree, 16, 0x872FD, routine);
    }
    m8[choisie] = 2;
  }
  T.sauver(); R.es = esEntree; T.charger();
}

// 0x873FD — '_SplitParms'(ligne, argv, &fin) : découper la ligne de commande en arguments, séparés
// par des espaces ou des tabulations ; un argument entre guillemets garde ses espaces, et \" (ou \\
// entre guillemets) donne le caractère protégé. Avec argv nul, on compte seulement ; sinon chaque
// argument est recopié sur place, sans ses guillemets ni ses barres, et terminé par un zéro. Rend
// le nombre d'arguments ; `fin` reçoit l'endroit où le découpage s'est arrêté.
function decouperArguments(jeu, ligne, argv, adresseFin) {
  const { m8 } = jeu;
  let n = 0, p = ligne;
  for (;;) {
    while (m8[p] === 0x20 || m8[p] === 9) p++;
    if (m8[p] === 0) break;
    let debut, dest;
    if (m8[p] === 0x22) {
      p++;
      debut = p; dest = p;
      while (m8[p] !== 0x22 && m8[p] !== 0) {
        if (m8[p] === 0x5C && (m8[p + 1] === 0x22 || m8[p + 1] === 0x5C)) p++;
        if (argv !== 0) m8[dest++] = m8[p];
        p++;
      }
    } else {
      debut = p; dest = p;
      while (m8[p] !== 0 && m8[p] !== 0x20 && m8[p] !== 9) {
        if (m8[p] === 0x5C && m8[p + 1] === 0x22) p++;
        if (argv !== 0) m8[dest++] = m8[p];
        p++;
      }
    }
    const suite = p + 1;
    if (argv !== 0) {
      ecrire32(jeu, argv + n * 4, debut);
      n++;
      if (m8[p] === 0) { m8[dest] = 0; break; }
      p = suite;
      m8[dest] = 0;
    } else {
      n++;
      if (m8[p] === 0) break;
      p = suite;
    }
  }
  ecrire32(jeu, adresseFin, p);
  return n;
}

// 0x8734A — '__Init_Argv' : argc et argv. La ligne de commande [0xC2D3C] est comptée, recopiée dans
// un bloc alloué, puis découpée sur place ; argv (après la copie) commence par le nom du programme
// [0xC2D40] et finit par un pointeur nul. main reçoit argc et argv par [0xE132C] et [0xE1328].
function initialiserArguments(jeu) {
  const entree = jeu.T.R.esp >>> 0;
  const fin = (entree - 20) | 0;                     // la variable [ebp-4] de l'original
  const n = (decouperArguments(jeu, lire32(jeu, LIGNE_DE_COMMANDE), 0, fin) + 1) | 0;
  const longueur = (lire32(jeu, fin) - lire32(jeu, LIGNE_DE_COMMANDE) + 1) | 0;
  const bloc = allouer(jeu, (n * 4 + 4 + longueur) | 0);
  if (bloc !== 0) {
    ecrire32(jeu, ARGV, bloc + longueur);
    appelOrigine(jeu, entree, 20, 0x873A1, MEMCPY, bloc, lire32(jeu, LIGNE_DE_COMMANDE), longueur);
    const argv = lire32(jeu, ARGV);
    ecrire32(jeu, argv, lire32(jeu, NOM_DU_PROGRAMME));
    decouperArguments(jeu, bloc, argv + 4, fin);
    ecrire32(jeu, lire32(jeu, ARGV) + n * 4, 0);
    ecrire32(jeu, ARGC, n);
  } else {
    ecrire32(jeu, ARGV, 0);
    ecrire32(jeu, ARGC, 0);
  }
  ecrire32(jeu, ARGC_MAIN, n);
  ecrire32(jeu, ARGV_MAIN, lire32(jeu, ARGV));
}

// 0x90629 — '__setenvp' : recopier l'environnement du DOS (dans son propre segment, désigné par le
// pointeur lointain [0xC2D68]) dans un bloc alloué, et en dresser le tableau [0xC4750], terminé par
// un pointeur nul et suivi d'un octet nul par variable ([0xC4754]).
function initialiserEnvironnement(jeu) {
  const { m8 } = jeu;
  if (lire32(jeu, ENVIRONNEMENT) !== 0) return;
  const entree = jeu.T.R.esp >>> 0;
  const debut = lire32(jeu, BLOC_ENVIRONNEMENT);
  const base = jeu.machine.base(lire16(jeu, BLOC_ENVIRONNEMENT + 4));
  const octet = (a) => m8[(base + a) >>> 0];
  let n = 0, p = debut;
  while (octet(p) !== 0) {
    while (octet(p) !== 0) p++;
    p++;
    n++;
  }
  let longueur = (p - debut) | 0;
  if (longueur === 0) longueur = 1;
  const copie = allouerNoyau(jeu, longueur);
  if (copie === 0) return;
  const tableau = allouerNoyau(jeu, (n + n * 4 + 4) | 0);
  if (tableau === 0) { liberer(jeu, copie); return; }
  ecrire32(jeu, ENVIRONNEMENT, tableau);
  let k = 0, decalage = 0, dest = copie;
  p = debut;
  while (octet(p) !== 0) {
    ecrire32(jeu, lire32(jeu, ENVIRONNEMENT) + decalage, dest);
    let c;
    do { c = octet(p); p++; m8[dest++] = c; } while (c !== 0);
    decalage += 4;
    k++;
  }
  ecrire32(jeu, lire32(jeu, ENVIRONNEMENT) + decalage, 0);
  const apres = (lire32(jeu, ENVIRONNEMENT) + decalage + 4) | 0;
  ecrire32(jeu, ENVIRONNEMENT_FIN, apres);
  appelOrigine(jeu, entree, 28, 0x906F7, MEMSET, apres, 0, k);
}

// 0x89F27 — étalonner une boucle d'attente : attendre que la seconde du DOS (2Ch) change, puis
// compter les lectures de l'heure pendant la seconde suivante. Le compte va dans [0xE1288].
function etalonnerHorloge(jeu) {
  const R = jeu.T.R;
  let eax = R.eax, ecx = R.ecx, edx = R.edx;
  const heure = () => {
    const s = servir(jeu, 0x21, { eax: avecAh(eax, 0x2C), ecx, edx });
    eax = s.eax; ecx = s.ecx; edx = s.edx;
    return (s.edx >> 8) & 0xFF;
  };
  const depart = heure();
  let seconde;
  do { seconde = heure(); } while (seconde === depart);
  let compte = 0;
  do { compte++; } while (heure() === seconde);
  ecrire32(jeu, ETALON_HORLOGE, compte);
}

// 0x8F574 — noter le sélecteur de la pile.
const noterSelecteurPile = (jeu) => ecrire16(jeu, SELECTEUR_PILE, jeu.T.R.ss);

// 0x8F449 — _amblksiz = 32 Ko : les extensions du tas se font par 32 Ko au moins.
const fixerPasDuTas = (jeu) => ecrire32(jeu, PAS_DU_TAS, 0x8000);

// 0x8F440 — 'stackavail' : ce qui reste de pile sous l'appelant.
const pileDisponible = (jeu) => ((jeu.T.R.esp >>> 0) - lire32(jeu, BAS_DE_PILE)) | 0;

// 0x8A7FC — '_dos_freemem'(sélecteur) : rendre un bloc de mémoire conventionnelle au DPMI
// (0101h), par int386. La structure des registres est dans la pile, comme dans l'original ; ses
// champs autres que eax et edx ne sont pas initialisés (le service ne les lit pas).
function rendreMemoireDos(jeu, selecteur) {
  if ((selecteur & 0xFFFF) === 0) return;
  const entree = jeu.T.R.esp >>> 0;
  const cadre = entree - 16;
  const entrees = cadre - 0x1C, sorties = cadre - 0x38;
  ecrire32(jeu, entrees, 0x101);
  ecrire32(jeu, entrees + 0xC, selecteur & 0xFFFF);
  appelOrigine(jeu, entree, 16 + 0x38, 0x8A82E, INT386, 0x31, entrees, sorties);
}

// ================================================================================================
// 7. Les routines de Bullfrog
// ================================================================================================

// 0x875A4 — relever le clavier par le BIOS : l'état des touches de modification (int 16h 12h) dans
// [0xDE689] — 1 Maj, 2 Ctrl, 4 Alt —, et la touche en attente (11h puis 10h), s'il y en a une, dans
// [0xDE688] : son code de balayage. Rend tous les registres intacts.
const MODIFICATEURS = 0xDE689, TOUCHE = 0xDE688;
function releverClavier(jeu, R) {
  const { m8 } = jeu;
  let eax = R.eax;
  let s = servir(jeu, 0x16, { eax: avecAh(eax, 0x12) });
  eax = s.eax;
  const etat = eax & 0xFF;
  let m = 0;
  if (etat & 3) m = 1;
  if (etat & 4) m |= 2;
  if (etat & 8) m |= 4;
  m8[MODIFICATEURS] = m;
  m8[TOUCHE] = 0;
  s = servir(jeu, 0x16, { eax: avecAh(eax, 0x11) });
  eax = s.eax;
  if (!s.ZF) {
    s = servir(jeu, 0x16, { eax: avecAh(eax, 0x10) });
    m8[TOUCHE] = (s.eax >> 8) & 0xFF;
  }
}

// 0x87790 — la fenêtre de dessin (gauche, haut, largeur, hauteur), des mots signés ; la droite et
// le bas en sont déduits (§ 6.5).
const FENETRE_GAUCHE = 0xDE5D0, FENETRE_HAUT = 0xDE5E0, FENETRE_LARGEUR = 0xDE5C8;
const FENETRE_HAUTEUR = 0xDE5F0, FENETRE_DROITE = 0xDE5EC, FENETRE_BAS = 0xDE5D8;
function poserFenetre(jeu, gauche, haut, largeur, hauteur) {
  ecrire32(jeu, FENETRE_GAUCHE, s16(gauche));
  ecrire32(jeu, FENETRE_HAUT, s16(haut));
  ecrire32(jeu, FENETRE_LARGEUR, s16(largeur));
  ecrire32(jeu, FENETRE_HAUTEUR, s16(hauteur));
  ecrire32(jeu, FENETRE_DROITE, s16(gauche) + s16(largeur));
  ecrire32(jeu, FENETRE_BAS, s16(haut) + s16(hauteur));
}

// 0x87E67 — remplir `ecx` doubles mots du motif edx à partir de eax (en assembleur). L'original
// aligne d'abord sur 32 octets et remplit ensuite par paquets de 16 : le résultat est le même
// qu'un remplissage simple. Rend eax après la zone.
function remplirMots(jeu, R) {
  const dv = jeu.dv;
  let a = R.eax >>> 0;
  const n = R.ecx >>> 0;
  // Le nombre de doubles mots qui restent une fois l'adresse alignée sur 32 octets : ses trois
  // derniers sont posés par une suite déroulée qui décompte ecx, sauf après le troisième — ecx
  // finit à 1 quand il en reste trois, à 0 sinon.
  let apresAlignement = n;
  for (let b = a; apresAlignement > 0 && (b & 0x1F) !== 0; b += 4) apresAlignement--;
  for (let k = 0; k < n; k++, a += 4) dv.setInt32(a, R.edx, true);
  R.eax = a | 0;
  R.ecx = (apresAlignement & 3) === 3 ? 1 : 0;
}

// 0x87E30 — le cœur de 'memset' (en assembleur ; eax la destination, edx le motif répété sur
// quatre octets, ecx le nombre d'octets) : des octets jusqu'à l'alignement, des doubles mots, puis
// la fin. Anomalie reproduite : avant l'alignement, le motif tourne d'un octet à chaque octet posé,
// et les trois octets de la fin prennent dl, dh, dl — sans effet pour 'memset', dont le motif est
// fait de quatre octets égaux.
function remplir(jeu, R) {
  const m8 = jeu.m8;
  let n = R.ecx >>> 0;
  if (n === 0) return;
  let a = R.eax >>> 0;
  let motif = R.edx | 0;
  while (a & 3) {
    m8[a] = motif & 0xFF;
    a++;
    motif = (motif >>> 8) | (motif << 24);
    n--;
    if (n === 0) break;
  }
  R.eax = a; R.edx = motif; R.ecx = n >>> 2;
  remplirMots(jeu, R);
  a = R.eax >>> 0;
  const fin = n & 3;
  if (fin >= 1) m8[a] = motif & 0xFF;
  if (fin >= 2) m8[a + 1] = (motif >>> 8) & 0xFF;
  if (fin >= 3) m8[a + 2] = motif & 0xFF;
  R.ecx = fin === 3 ? 1 : 0;                         // le même décompte déroulé qu'en 0x87E67
}

// 0x88708 — les drapeaux d'une spécification de printf ('-', '#', '+', ' ', '0'), appelée par
// 0x885FF (bibliotheque.js). Un '+' annule un ' ' déjà vu, un ' ' est ignoré après un '+'. Rend le
// pointeur sur ce qui suit.
function analyserDrapeaux(jeu, format, specs) {
  const { m8 } = jeu;
  m8[specs + 0x14] = 0;
  let p = format;
  for (;; p++) {
    const c = m8[p];
    if (c === 0x2D) m8[specs + 0x14] |= 8;
    else if (c === 0x23) m8[specs + 0x14] |= 1;
    else if (c === 0x2B) { m8[specs + 0x14] |= 4; m8[specs + 0x14] &= 0xFD; }
    else if (c === 0x20) { if (!(m8[specs + 0x14] & 4)) m8[specs + 0x14] |= 2; }
    else if (c === 0x30) m8[specs + 0x16] = 0x30;
    else return p;
  }
}

// ================================================================================================
// 8. Le dépaquetage RNC — 0x87B2C
// ================================================================================================
//
// Les fichiers de données de Bullfrog sont compressés par la méthode 1 de Rob Northen Computing :
// un en-tête de 18 octets ("RNC", 1, taille dépaquetée et taille paquetée en gros-boutiste, deux
// sommes de contrôle, une marge, le nombre de morceaux), puis un flot de bits entrelacé d'octets
// littéraux. Chaque morceau commence par trois tables de Huffman (littéraux, distances, longueurs),
// puis un nombre de paires ; chaque paire est une copie depuis la sortie déjà écrite (distance et
// longueur), précédée et suivie d'une suite d'octets littéraux recopiés tels quels du flot.
//
// Le dépaquetage se fait sur place : si les données paquetées risquent d'être rattrapées par la
// sortie, elles sont d'abord déplacées à la fin du tampon (taille dépaquetée + marge).
//
// L'ÉTAT DU LECTEUR DE BITS, dans les variables de l'original : [0xC3114] la fenêtre de 16 bits
// dont on lit les bits de poids faible, [0xC3116] le mot suivant et [0xC3119] le nombre de ses bits
// encore valides. Les sommes de contrôle ne sont pas vérifiées. Rend la taille dépaquetée, ou 0 si
// l'en-tête n'est pas celui de la méthode 1 (la retenue est alors mise).
const RNC_TAILLE = 0xC3108, RNC_PAQUET = 0xC310C, RNC_PAIRES = 0xC3112;
const RNC_FENETRE = 0xC3114, RNC_SUIVANT = 0xC3116, RNC_MORCEAUX = 0xC3118, RNC_BITS = 0xC3119;
const RNC_LITTERAUX = 0xC2F88, RNC_DISTANCES = 0xC3008, RNC_LONGUEURS = 0xC3088;

// Les décalages de 16 bits du processeur : le compte est pris modulo 32 ; au-delà de 15, un
// décalage vide le mot, une rotation tourne modulo 16.
const shl16 = (v, c) => ((c & 0x1F) >= 16 ? 0 : (v << (c & 0x1F)) & 0xFFFF);
const shr16 = (v, c) => ((c & 0x1F) >= 16 ? 0 : (v & 0xFFFF) >>> (c & 0x1F));
const ror16 = (v, c) => { const k = (c & 0x1F) % 16; return ((v >>> k) | (v << (16 - k))) & 0xFFFF; };
const rol16 = (v, c) => { const k = (c & 0x1F) % 16; return ((v << k) | ((v & 0xFFFF) >>> (16 - k))) & 0xFFFF; };
const masque16 = (c) => (shl16(1, c) - 1) & 0xFFFF;

function depaqueter(jeu, source, destination) {
  const { m8 } = jeu;
  const R = jeu.T.R;
  const entree = R.esp >>> 0;
  R.DF = false;                                      // cld
  if (lire16(jeu, source) !== 0x4E52 || lire16(jeu, source + 2) !== 0x0143) { R.CF = true; return 0; }
  const grosBoutiste = (a) => ((m8[a] << 24) | (m8[a + 1] << 16) | (m8[a + 2] << 8) | m8[a + 3]) | 0;
  const taille = grosBoutiste(source + 4);
  ecrire32(jeu, RNC_TAILLE, taille);
  const paquet = grosBoutiste(source + 8);
  ecrire32(jeu, RNC_PAQUET, paquet);
  m8[RNC_MORCEAUX] = m8[source + 17];
  let flot = (source + 18) | 0;                      // esi : le mot du flot chargé dans [0xC3116]

  // Déplacer les données paquetées à la fin du tampon, à rebours, si la sortie les rattraperait.
  const finPaquet = (source + paquet + 0x12) >>> 0;
  if (finPaquet > (destination >>> 0)) {
    const fin = (destination + m8[source + 0x10] + taille) >>> 0;
    if (fin > finPaquet) {
      let s = finPaquet - 4, d = fin - 4;
      for (let k = (paquet >>> 2); k > 0; k--, s -= 4, d -= 4) ecrire32(jeu, d, lire32(jeu, s));
      s += 4; d += 4;
      const reste = paquet & 3;
      if (reste !== 0) {
        s--; d--;
        for (let k = reste; k > 0; k--, s--, d--) m8[d] = m8[s];
        s++; d++;
      }
      flot = d | 0;
    }
  }

  // 0x87D0C — lire n bits (n de 0 à 16) : les n bits bas de la fenêtre, qu'on remplit par le haut
  // avec les bits du mot suivant, en chargeant un nouveau mot quand celui-ci est épuisé.
  const lireBits = (n) => {
    let suivant = lire16(jeu, RNC_SUIVANT);
    let fenetre = lire16(jeu, RNC_FENETRE);
    let valides = m8[RNC_BITS];
    let c = n & 0xFF;
    const resultat = masque16(c) & fenetre;
    if (valides >= c) {
      valides = (valides - c) & 0xFF;
    } else {
      const k = valides;
      const bits = ror16(masque16(k) & suivant, k);
      suivant = shr16(suivant, k);
      fenetre = shr16(fenetre, k) | bits;
      flot = (flot + 2) | 0;
      suivant = lire16(jeu, flot);
      c = (c - k) & 0xFF;
      valides = (0x10 - c) & 0xFF;
    }
    const bits = ror16(masque16(c) & suivant, c);
    suivant = shr16(suivant, c);
    fenetre = shr16(fenetre, c) | bits;
    ecrire16(jeu, RNC_SUIVANT, suivant);
    ecrire16(jeu, RNC_FENETRE, fenetre);
    m8[RNC_BITS] = valides;
    return resultat;
  };

  // 0x87CC9 — décoder une valeur par une table de Huffman : trouver l'entrée dont le code égale
  // les bits de la fenêtre sous son masque (sans borne, comme l'original), consommer ces bits, puis
  // lire la valeur : son rang r s'il vaut 0 ou 1, sinon 2^(r−1) plus r−1 bits.
  const decoder = (table) => {
    const fenetre = lire16(jeu, RNC_FENETRE);
    let e = table;
    for (;;) {
      const masque = lire16(jeu, e), code = lire16(jeu, e + 2);
      e += 4;
      if ((masque & fenetre) === code) break;
    }
    const valeur = lire16(jeu, e + 0x3C);
    lireBits(valeur >> 8);
    const rang = valeur & 0xFF;
    if (rang < 2) return rang;
    const c = (rang - 1) & 0xFF;
    return (lireBits(c) | shl16(1, c)) & 0xFFFF;
  };

  // 0x87D8F — construire une table de Huffman canonique : le nombre de symboles (5 bits), la
  // longueur de chaque code (4 bits), puis pour chaque longueur de 1 à 16 et chaque symbole de cette
  // longueur, une entrée (masque, code renversé) en table + 4·i et (longueur, symbole) en
  // table + 0x40 + 4·i. Aucun symbole : la table précédente reste.
  //
  // Les longueurs sont rangées dans 16 octets de la pile de l'original, juste sous l'adresse de la
  // table et la destination qu'il y a sauvées : au-delà de 16 symboles, elles les écrasent, et la
  // réécriture fait de même ; au-delà de 24, elles écraseraient l'adresse de retour.
  const longueurs = (entree - 60) | 0;
  let sortie = destination;                          // edi
  const construireTable = (table) => {
    ecrire32(jeu, longueurs + 0x10, table);
    ecrire32(jeu, longueurs + 0x14, sortie);
    const n = lireBits(5);
    if (n !== 0) {
      if (n > 24) throw new Error(`dépaquetage RNC : table de ${n} symboles, l'original perd son adresse de retour`);
      for (let k = 0; k < n; k++) m8[longueurs + k] = lireBits(4) & 0xFF;
      let e = lire32(jeu, longueurs + 0x10);
      let code = 0, pas = 0x8000;
      for (let longueur = 1; longueur !== 0x11; longueur++, pas >>>= 1) {
        for (let k = 0; k < n; k++) {
          if (m8[longueurs + k] !== longueur) continue;
          ecrire16(jeu, e, masque16(longueur));
          let aligne = shr16(code, (16 - longueur) & 0xFF), renverse = 0;
          for (let b = 0; b < longueur; b++) { renverse = (renverse << 1) | (aligne & 1); aligne >>>= 1; }
          ecrire16(jeu, e + 2, renverse);
          ecrire16(jeu, e + 4 + 0x3C, (longueur << 8) | (k & 0xFF));
          e += 4;
          code = (code + pas) & 0xFFFF;
        }
      }
    }
    sortie = lire32(jeu, longueurs + 0x14);
  };

  // Recopier des octets littéraux du flot, puis réamorcer la fenêtre sur les deux mots qui suivent
  // (0x87C4A) : le nombre de bits valides ne change pas.
  const recopierLitteraux = () => {
    const n = decoder(RNC_LITTERAUX);
    if (n === 0) return;
    for (let k = 0; k < n; k++) m8[sortie++] = m8[flot++];
    const bits = m8[RNC_BITS];
    const mot = lire16(jeu, flot);
    let d = masque16(bits);
    ecrire16(jeu, RNC_FENETRE, lire16(jeu, RNC_FENETRE) & d);
    d &= rol16(mot, bits);
    const suivant = shl16(lire16(jeu, flot + 2), bits) | d;
    ecrire16(jeu, RNC_FENETRE, lire16(jeu, RNC_FENETRE) | shl16(mot, bits));
    ecrire16(jeu, RNC_SUIVANT, suivant);
  };

  m8[RNC_BITS] = 0;
  ecrire16(jeu, RNC_FENETRE, lire16(jeu, flot));
  lireBits(2);                                       // les deux drapeaux du flot, ignorés
  do {
    construireTable(RNC_LITTERAUX);
    construireTable(RNC_DISTANCES);
    construireTable(RNC_LONGUEURS);
    ecrire16(jeu, RNC_PAIRES, lireBits(16));
    recopierLitteraux();
    for (;;) {
      ecrire16(jeu, RNC_PAIRES, lire16(jeu, RNC_PAIRES) - 1);
      if (lire16(jeu, RNC_PAIRES) === 0) break;
      const distance = (decoder(RNC_DISTANCES) + 1) & 0xFFFF;
      const longueur = (decoder(RNC_LONGUEURS) + 2) & 0xFFFF;
      let depuis = (sortie - distance) | 0;
      for (let k = 0; k < longueur; k++) m8[sortie++] = m8[depuis++];
      recopierLitteraux();
    }
    m8[RNC_MORCEAUX] = (m8[RNC_MORCEAUX] - 1) & 0xFF;
  } while (m8[RNC_MORCEAUX] !== 0);
  R.CF = false;
  return lire32(jeu, RNC_TAILLE);
}

// 0x87273 et 0x8F9E0 — des routines vides (un `ret`), dont seule l'adresse sert : la bibliothèque les
// range dans des crochets qu'un programme qui en aurait besoin ferait pointer ailleurs. 0x87273 est
// le gestionnaire des exceptions du coprocesseur ('__FPE_handler', [0xC2D70], que rien ne lit ici) ;
// 0x8F9E0, la sauvegarde et la restitution de son état ([0xC4DC8] et [0xC4DCC]), que `spawn` appelle
// avant et après le lancement d'un programme, avec l'adresse d'un tampon de sa pile.
const rien = () => {};

// ================================================================================================
// Les entrées
// ================================================================================================

const TOUS_REGISTRES = ['eax', 'ecx', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'];

export const reecritures = [
  // errno
  { adresse: 0x8A99C, nom: 'adresseErrno', fn: adresseErrno, arguments: 0, retour: true },
  { adresse: 0x8A9A2, nom: 'adresseDoserrno', fn: adresseDoserrno, arguments: 0, retour: true },
  { adresse: 0x88324, nom: 'erreurDos', fn: erreurDos, arguments: 1, retour: true },
  { adresse: 0x882E4, nom: 'conclureServiceDos', fn: conclureServiceDos, arguments: 2, retour: true },
  // descripteurs et fichiers
  { adresse: 0x8F3B6, nom: 'estUnTerminal', fn: estUnTerminal, arguments: 1, retour: true },
  { adresse: 0x8F3D6, nom: 'modeIo', fn: modeIo, arguments: 1, retour: true },
  { adresse: 0x8F428, nom: 'poserModeIo', fn: poserModeIo, arguments: 2 },
  { adresse: 0x8616E, nom: 'ouvrirFichier', fn: ouvrirFichier, arguments: 4, retour: true },
  { adresse: 0x8614F, nom: 'ouvrir', fn: ouvrir, arguments: 3, retour: true },
  { adresse: 0x875EC, nom: 'creer', fn: creer, arguments: 2, retour: true },
  { adresse: 0x8639A, nom: 'fermer', fn: fermer, arguments: 1, retour: true },
  { adresse: 0x87601, nom: 'changerMode', fn: changerMode, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x876B7, nom: 'lire', fn: lire, arguments: 3, retour: true,
    zones: (jeu, d, tampon, n) => [[tampon >>> 0, (tampon >>> 0) + (n >>> 0)]] },
  { adresse: 0x877E5, nom: 'ecrire', fn: ecrire, arguments: 3, retour: true },
  { adresse: 0x88394, nom: 'positionner', fn: positionner, arguments: 3, retour: true },
  { adresse: 0x90588, nom: 'ecrireBrut', fn: ecrireBrut, arguments: 3, retour: true },
  // flots
  { adresse: 0x8AB79, nom: 'allouerFlot', fn: allouerFlot, arguments: 0, retour: true, memoire: 'entiere' },
  { adresse: 0x8AC14, nom: 'libererFlot', fn: libererFlot, arguments: 1, memoire: 'entiere' },
  { adresse: 0x8AC69, nom: 'verifierTerminal', fn: verifierTerminal, arguments: 1, memoire: 'entiere' },
  { adresse: 0x8F4FC, nom: 'donnerTampon', fn: donnerTampon, arguments: 1, memoire: 'entiere' },
  { adresse: 0x8B817, nom: 'vider', fn: vider, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x8F454, nom: 'poserCaractere', fn: poserCaractere, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x8750A, nom: 'sortieFprintf', fn: sortieFprintf, arguments: 2, memoire: 'entiere' },
  { adresse: 0x87524, nom: 'vfprintf', fn: vfprintf, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x90480, nom: 'initialiserFlots', fn: initialiserFlots, arguments: 0, memoire: 'entiere' },
  // tas
  { adresse: 0x8FC70, nom: 'allouerDansLeTas', convention: 'registres', memoire: 'entiere',
    fn: (jeu, R) => { R.eax = allouerDansLeTas(jeu, R.eax >>> 0, R.ebx >>> 0) | 0; },
    registresCompares: ['eax', 'ecx', 'esi', 'edi', 'ebp', 'esp'] },
  { adresse: 0x8A5B1, nom: 'allouerNoyau', fn: allouerNoyau, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x8A5A1, nom: 'allouer', fn: allouer, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x903D6, nom: 'memoireRequise', fn: memoireRequise, arguments: 1, retour: true },
  { adresse: 0x90239, nom: 'agrandirLeTas', fn: agrandirLeTas, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x90151, nom: 'allouerRegionDpmi', fn: allouerRegionDpmi, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x8FF5B, nom: 'rendreRegionsVides', fn: rendreRegionsVides, arguments: 0, memoire: 'entiere' },
  { adresse: 0x8FEC1, nom: 'retirerRegion', fn: retirerRegion, arguments: 2, memoire: 'entiere' },
  { adresse: 0x8FEA5, nom: 'detacher', fn: detacher, arguments: 1, memoire: 'entiere' },
  { adresse: 0x8FE2B, nom: 'ajouterRegion', fn: ajouterRegion, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x8FD20, nom: 'libererDansLeTas', convention: 'registres', memoire: 'entiere',
    fn: (jeu, R) => { libererDansLeTas(jeu, R.eax | 0, R.ebx >>> 0); },
    registresCompares: ['ebx', 'ecx', 'esi', 'edi', 'ebp', 'esp'] },
  { adresse: 0x8B8F8, nom: 'liberer', fn: liberer, arguments: 1, memoire: 'entiere' },
  { adresse: 0x8A636, nom: 'etendre', fn: etendre, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x8A623, nom: 'etendreBloc', fn: etendreBloc, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x8FFCF, nom: 'redimensionnerRegion', fn: redimensionnerRegion, arguments: 2, retour: true, memoire: 'entiere' },
  // chaînes
  { adresse: 0x833D8, nom: 'comparerSansCasse', fn: comparerSansCasse, arguments: 2, retour: true },
  { adresse: 0x8B92D, nom: 'comparerSansCasseN', fn: comparerSansCasseN, arguments: 3, retour: true },
  { adresse: 0x874D8, nom: 'comparerN', fn: comparerN, arguments: 3, retour: true },
  { adresse: 0x8A987, nom: 'enMinuscule', fn: enMinuscule, arguments: 1, retour: true },
  { adresse: 0x832F5, nom: 'lireEnvironnement', fn: lireEnvironnement, arguments: 1, retour: true },
  { adresse: 0x83023, nom: 'ouvrirFlot', fn: ouvrirFlot, arguments: 2, retour: true, memoire: 'entiere' },
  // démarrage
  { adresse: 0x872C4, nom: 'executerInitialisations', fn: executerInitialisations, arguments: 0,
    memoire: 'entiere', registresCompares: ['ebx', 'esi', 'edi', 'ebp', 'esp', 'es'] },
  { adresse: 0x873FD, nom: 'decouperArguments', fn: decouperArguments, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x8734A, nom: 'initialiserArguments', fn: initialiserArguments, arguments: 0, memoire: 'entiere' },
  { adresse: 0x90629, nom: 'initialiserEnvironnement', fn: initialiserEnvironnement, arguments: 0, memoire: 'entiere' },
  { adresse: 0x89F27, nom: 'etalonnerHorloge', fn: etalonnerHorloge, arguments: 0 },
  { adresse: 0x8F574, nom: 'noterSelecteurPile', fn: noterSelecteurPile, arguments: 0 },
  { adresse: 0x8F449, nom: 'fixerPasDuTas', fn: fixerPasDuTas, arguments: 0 },
  { adresse: 0x8F440, nom: 'pileDisponible', fn: pileDisponible, arguments: 0, retour: true },
  { adresse: 0x8A7FC, nom: 'rendreMemoireDos', fn: rendreMemoireDos, arguments: 1 },
  // Bullfrog
  { adresse: 0x875A4, nom: 'releverClavier', fn: releverClavier, convention: 'registres',
    registresCompares: TOUS_REGISTRES },
  { adresse: 0x87790, nom: 'poserFenetre', fn: poserFenetre, arguments: 4 },
  { adresse: 0x87E67, nom: 'remplirMots', fn: remplirMots, convention: 'registres',
    registresCompares: ['eax', 'ecx', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'],
    zones: (jeu, R) => [[R.eax >>> 0, (R.eax >>> 0) + 4 * (R.ecx >>> 0)]] },
  { adresse: 0x87E30, nom: 'remplir', fn: remplir, convention: 'registres',
    zones: (jeu, R) => [[R.eax >>> 0, (R.eax >>> 0) + (R.ecx >>> 0)]] },
  { adresse: 0x88708, nom: 'analyserDrapeaux', fn: analyserDrapeaux, arguments: 2, retour: true },
  { adresse: 0x87B2C, nom: 'depaqueter', fn: depaqueter, arguments: 2, retour: true,
    registresCompares: TOUS_REGISTRES, memoire: 'entiere' },
];

export const enAttente = [
  // '__CMain' : réserve la pile, appelle main (0x10010) et ne revient jamais — exit (0x7E2A1) suit.
  // Toute la partie se déroule sous elle : ni la comparaison appel par appel, ni le rejeu, qui
  // l'installe avant qu'elle soit appelée, ne peuvent l'éprouver seule.
  { adresse: 0x87274, nom: 'demarrerMain', arguments: 0, raison: 'contient toute la partie ; ne revient pas' },
  // Le cœur d'int386x : remplacé d'office par l'hôte (machine.js), sa transcription n'étant pas
  // exécutable (elle saute à l'interruption par un 'ret' sur une table de routines 'int N ; ret').
  { adresse: 0x89F90, nom: 'int386x', arguments: 0, raison: "remplacée par l'hôte" },
  // La lecture des flots (voir « La lecture ») : aucun scénario ne lit un flot.
  { adresse: 0x8A838, nom: 'lireCaractere', fn: lireCaractere, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x8A8B1, nom: 'remplirEtPrendre', fn: remplirEtPrendre, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x8A8DC, nom: 'remplirLeTampon', fn: remplirLeTampon, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x903E8, nom: 'viderLesFlots', fn: viderLesFlots, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x90420, nom: 'lireLaConsole', fn: lireLaConsole, arguments: 0, retour: true },
  { adresse: 0x9043B, nom: 'lireBrut', fn: lireBrut, arguments: 3, retour: true,
    zones: (jeu, d, tampon, n) => [[tampon >>> 0, (tampon >>> 0) + (n >>> 0)]] },
  { adresse: 0x8AC96, nom: 'rendreCaractere', fn: rendreCaractere, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x82DD1, nom: 'lireUneLigne', fn: lireUneLigne, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x830C9, nom: 'lireDuFlot', fn: lireDuFlot, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x83111, nom: 'rendreAuFlot', fn: rendreAuFlot, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x83127, nom: 'vfscanf', fn: vfscanf, arguments: 3, retour: true, memoire: 'entiere' },
  { adresse: 0x83155, nom: 'fscanf', fn: fscanf, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x83175, nom: 'fermerFlot', fn: fermerFlot, arguments: 1, retour: true, memoire: 'entiere' },
  // Les crochets vides : jamais appelés dans une partie.
  { adresse: 0x87273, nom: 'fpeVide', fn: rien, arguments: 0 },
  { adresse: 0x8F9E0, nom: 'etatDu87Vide', fn: rien, arguments: 1 },
];
