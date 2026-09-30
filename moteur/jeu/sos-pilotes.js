// La bibliothèque HMI SOS : ses pilotes, sa minuterie, et la part du séquenceur qui parle au pilote.
//
// Réécriture lisible de vingt-neuf routines de SOS 4 (Sound Operating System, Human Machine
// Interfaces), liée dans MAIN.EXE, et de la couche de Bullfrog qui charge les banques de sons.
// Voir docs/guide-reecriture.md ; docs/retro-ingenierie.md § 9 pour le son.
//
// Six familles, dans l'ordre du fichier :
//
//  1. LA MINUTERIE DE SOS (0x821FC sosTIMERInitSystem, 0x822F4 sosTIMERRegisterEvent, 0x8260A
//     sosTIMERRemoveEvent, 0x82496 sosTIMERAlterEventRate, 0x827B9, 0x827DC, 0x8280A, 0x828C4).
//     SOS prend l'IRQ 0 (gestionnaire 0x8A369, en assembleur) et y fait tourner seize
//     « événements », chacun une routine lointaine appelée à sa fréquence propre : la minuterie
//     matérielle est réglée sur l'événement le plus rapide, et chaque événement a un accumulateur
//     16.16 qui déborde à la bonne cadence. L'événement 15 est réservé à l'ancien gestionnaire du
//     BIOS, à ses 18,2 Hz.
//  2. LES INSTALLATIONS (0x83FC6 sosMIDIInitSystem, 0x8418C sosMIDIInitDriver, 0x8564A
//     sosMIDISetInsData, 0x84C12 sosDIGIInitSystem, 0x84C98 sosDIGIInitDriver, 0x85551, et les
//     verrouillages de mémoire 0x83762 et 0x84888).
//  3. LA REMISE D'UN PILOTE DE MUSIQUE (0x8474A sosMIDIResetDriver).
//  4. LE SÉQUENCEUR VERS LE PILOTE (0x863E5, 0x86E23, 0x82174 sosMIDISongDone) : chaque message
//     MIDI d'une piste est remis au pilote, après, si SOS a le droit de voler des canaux, une
//     traduction du canal du morceau en canal du pilote.
//  5. LES BANQUES DE BULLFROG (0x83420, 0x834D4, 0x83540, 0x83608, 0x83670) : les fichiers
//     data/musicB-Q.dat et .tab, data/sndsB-Q.dat et .tab, et la lecture dans une séquence animée.
//  6. SSCANF (0x833A5, 0x83377, 0x8334A, 0x8336C) : la lecture de sndsetup.inf, par la
//     bibliothèque C de Watcom.
//
// LES APPELS LOINTAINS. SOS appelle ses événements de minuterie et les fonctions de ses pilotes par
// des pointeurs lointains (déplacement de 32 bits, sélecteur de 16), rangés dans des tables de six
// octets : `call fword ptr [...]`, et l'appelée rend la main par `retf`. `appelLointain` empile le
// sélecteur du code et l'adresse de retour de l'original, et laisse l'hôte trouver l'appelée : une
// fonction du programme, ou un module de HMIDRV.386 que l'hôte joue lui-même (moteur/hote/son.js).
//
// LA PILE. Les réécritures ouvrent le cadre de l'original (`ouvrirCadre`) : registres sauvés,
// variables locales, et les appels partent de la même hauteur. Plusieurs passent l'adresse d'une
// variable locale (un pointeur lointain que le chargeur de pilote remplit, la liste des arguments
// de sscanf) ; deux relisent une variable jamais écrite sur un chemin (anomalies, ci-dessous).
// Celles qui tournent pendant l'interruption laissent en outre sur la pile privée de SOS ce que
// l'original y laissait (voir « La pile privée de SOS », plus bas).
//
// EN ATTENTE : 0x828C4, l'événement 15, qui rend la main à l'ancien gestionnaire de l'IRQ 0 par
// 0x8A55E : celle-ci remonte la pile jusqu'au cadre de l'interruption (`lss esp`) et y saute par
// un `retf`, sans revenir. La transcription, qui fait de ce `retf` un retour ordinaire, dépile
// ensuite les registres de 0x828C4 et de 0x8280A dans la pile du gestionnaire ; aucune fonction
// JavaScript ne peut reproduire cela à l'identique.
//
// ANOMALIES D'ORIGINE, reproduites :
//  - 0x83FC6 (sosMIDIInitSystem) sans chemin de pilotes efface le premier octet du chemin des
//    pilotes numériques (0xC34EE), et non le sien (0xC2B20) ;
//  - 0x83762 verrouille quatre variables avec une taille nulle (fin et début de la même étiquette) ;
//  - 0x863E5 sans vol de canaux : un changement de contrôleur autre que le volume (0xBn, contrôleur
//    ≠ 7) n'est pas envoyé ; c'est le dernier message construit dans le tampon 0xC29D7 qui part à sa
//    place, avec la longueur du message d'origine (son.json le fait une fois, sur le contrôleur 116,
//    le début de boucle des morceaux HMP) ;
//  - 0x863E5 avec vol de canaux : en rendant un canal, l'état sauvé est rejoué avec le statut 0xC0
//    (changement de programme) pour la remise des contrôleurs (0x79), et la courbure (0xE0) sur
//    deux octets au lieu de trois ; un volume reçu alors qu'aucun canal n'a pu être pris est rangé
//    à l'indice 0xFF de la table des volumes (0xC2AC6 + pilote × 16 + 0xFF), hors de la ligne du
//    pilote ; 0x86E23 fait de même avec un canal jamais attribué (0xFF) ;
//  - 0x8418C et 0x84C98 laissent le pilote inscrit dans leur table quand son installation échoue
//    (sauf, pour le second, faute de tampon DMA) ;
//  - 0x8418C recopie six pointeurs de la table du pilote interne, qui n'en a que cinq : le sixième
//    est le premier de la table suivante ;
//  - 0x84C98 range la taille d'un module de mélange préchargé (0xC3238) et le reste du tampon DMA
//    (0xC32CE) depuis des variables jamais écrites quand il n'a pas eu à les charger ;
//  - 0x85551 garde le bloc de mémoire DOS qui chevauchait une frontière de 64 Ko et en prend un
//    autre, sans rendre le premier ; le sélecteur qu'elle rend dans dx a pour moitié haute d'edx
//    un reste de pile ;
//  - 0x83670 avance la position de la lecture en mémoire de la taille demandée, et non de ce
//    qu'elle a pu copier.
//
// EXERCÉ PAR LE SCÉNARIO son.json : la carte Sound Blaster 16 (pilote 0xE017) et sa puce FM (pilote
// interne 0xA002). Les autres pilotes (MT-32, General MIDI, AWE32, pilotes chargés depuis
// HMIMDRV.386), le vol de canaux (le jeu le coupe, 0x87238(0), à chaque morceau lancé, avant que
// le séquenceur n'envoie quoi que ce soit), la minuterie sans prise de l'IRQ 0, une minuterie
// pleine, et la lecture d'une séquence en mémoire (0x83670, [0xBEEFC], que rien n'écrit
// directement) ne le sont pas : ces chemins sont réécrits d'après le désassemblage, non prouvés.

// --- mémoire ----------------------------------------------------------------------------------------
const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Une adresse lointaine (sélecteur:déplacement) en adresse linéaire.
const lineaire = (jeu, off, sel) => (jeu.machine.base(sel & 0xFFFF) + (off >>> 0)) >>> 0;
// Le pointeur lointain rangé en `a` (déplacement, puis sélecteur), en adresse linéaire.
const pointeurLointain = (jeu, a) => lineaire(jeu, long(jeu, a), mot(jeu, a + 4));
// Un pointeur lointain de six octets recopié (le sélecteur d'abord, comme l'original).
function copierPointeurLointain(jeu, vers, depuis) {
  poserMot(jeu, vers + 4, mot(jeu, depuis + 4));
  poserLong(jeu, vers, long(jeu, depuis));
}

// Les registres de segment, tels que le code interrompu les a (le relevé de l'enveloppe).
const segmentDeDonnees = (jeu) => jeu.T.R.ds & 0xFFFF;
const segmentDePile = (jeu) => jeu.T.R.ss & 0xFFFF;
const segmentDeCode = (jeu) => jeu.T.R.cs & 0xFFFF;

// `div` de 32 bits, edx nul : la transcription s'arrête sur une division par zéro, la réécriture aussi.
function diviser(a, b) {
  b >>>= 0;
  if (b === 0) throw new Error('division par zero');
  return Math.floor((a >>> 0) / b) >>> 0;
}

// --- le cadre de l'original -------------------------------------------------------------------------
// `sauves` registres empilés en entrant (4 : ebx, esi, edi, ebp ; 1 : ebp seul), puis `locales`
// octets de variables : ebp désigne le cadre, le pointeur de pile descend sous les variables, et les
// appels partent de la hauteur de l'original. `fermer` rend les registres et la pile.
const ORDRE_DES_SAUVEGARDES = { 4: ['ebx', 'esi', 'edi', 'ebp'], 1: ['ebp'] };
function ouvrirCadre(jeu, sauves, locales) {
  const T = jeu.T;
  T.sauver();
  const R = T.R, entree = R.esp >>> 0;
  const noms = ORDRE_DES_SAUVEGARDES[sauves];
  const avant = {};
  noms.forEach((n, k) => { avant[n] = R[n]; poserLong(jeu, entree - 4 * (k + 1), R[n]); });
  const ebp = (entree - 4 * noms.length) >>> 0;
  R.ebp = ebp;
  R.esp = (ebp - locales) | 0;
  T.charger();
  return {
    ebp,
    local: (decalage) => (ebp - decalage) >>> 0,
    fermer() {
      T.sauver();
      Object.assign(T.R, avant);
      T.R.esp = entree | 0;
      T.charger();
    },
  };
}

// LA PILE PRIVÉE DE SOS. Les routines appelées pendant l'interruption de la minuterie (0x8260A,
// 0x822F4, 0x827DC, 0x863E5, 0x86E23) tournent sur la pile privée de SOS (0xC36EC à 0xC4716), qui
// est une variable du programme : la comparaison appel par appel la relève comme telle. Elles y
// laissent donc ce que l'original y laissait : leurs variables locales (`poserLocales`), l'adresse
// de retour de l'original à chaque appel (`appelerDepuis`), et, dans les registres que les
// appelées sauvent sur cette pile, les valeurs que l'original y avait (`registres`). Rien de tout
// cela n'est relu (le rejeu empoisonné le prouve) ; c'est le prix d'une comparaison exacte.
function poserLocales(jeu, cadre, locales) {
  for (const [decalage, valeur, taille = 4] of locales) {
    if (taille === 1) poserOctet(jeu, cadre.local(decalage), valeur);
    else poserLong(jeu, cadre.local(decalage), valeur);
  }
}
function poserRegistres(jeu, registres) {
  if (!registres) return;
  jeu.T.sauver();
  for (const [nom, valeur] of Object.entries(registres)) jeu.T.R[nom] = valeur | 0;
  jeu.T.charger();
}
// Appel proche de l'original, de la hauteur du cadre et avec son adresse de retour. Rend eax.
function appelerDepuis(jeu, retour, adresse, args = [], registres = null) {
  poserRegistres(jeu, registres);
  jeu.T.sauver();
  return jeu.appelerDepuis(retour, jeu.T.R.esp, adresse, ...args);
}

// Appel lointain de l'original : les arguments empilés de droite à gauche, puis le sélecteur du
// code et l'adresse de retour ; l'appelée rend la main par `retf`, l'appelant retire les arguments.
// Rend eax.
function appelLointain(jeu, retour, off, sel, ...args) {
  return appelLointainAvec(jeu, null, retour, off, sel, ...args);
}
function appelLointainAvec(jeu, registres, retour, off, sel, ...args) {
  const T = jeu.T, m = jeu.machine;
  poserRegistres(jeu, registres);
  T.sauver();
  const R = T.R;
  let esp = R.esp;
  for (let k = args.length - 1; k >= 0; k--) { esp = (esp - 4) | 0; m.w32(esp >>> 0, args[k]); }
  esp = (esp - 8) | 0;
  m.w32((esp + 4) >>> 0, R.cs);
  m.w32(esp >>> 0, retour);
  R.esp = esp;
  T.charger();
  const appelee = m.appelLointain(off >>> 0, sel & 0xFFFF);
  T.charger();
  if (appelee) appelee();
  T.sauver();
  R.esp = (R.esp + 4 * args.length) | 0;
  T.charger();
  return R.eax;
}

// === 1. LA MINUTERIE DE SOS ============================================================================

const FREQUENCE_DU_PIT = 0x1234DC;        // 1 193 180 Hz : l'horloge du 8253, divisée par le diviseur
const DIVISEUR_DU_BIOS = 0xFFFF;          // (65 535 : le diviseur le plus lent, 18,2 Hz)
const FREQUENCE_DU_BIOS = 0xFF00;         // la « fréquence » d'un événement réglé sur celle du BIOS
const PAS_BIOS_DE_BASE = 0x123333;        // 18,2 × 65 536 : le pas de l'événement du BIOS, multiplié par la fréquence
const PAS_UNITE = 0x10000;                // 1,0 en 16.16 : un appel à chaque tic
const NOMBRE_D_EVENEMENTS = 16;
const EVENEMENT_DU_BIOS = 15;             // l'emplacement réservé à l'ancien gestionnaire

const IRQ0_PRISE = 0xC4718;               // dword : SOS a installé son gestionnaire de l'IRQ 0 (0x8A369)
const DIVISEUR_COURANT = 0xC33B9;         // dword : diviseur programmé dans la minuterie
const ROUTINE_D_EVENEMENT = 0xC33BD;      // 16 × 6 : pointeur lointain de la routine (nul : libre)
const FREQUENCE_D_EVENEMENT = 0xC341D;    // 16 × 4 : fréquence demandée, en Hz (ou FREQUENCE_DU_BIOS)
const PAS_D_EVENEMENT = 0xC345D;          // 16 × 4 : pas de l'accumulateur, 16.16
const ACCUMULATEUR = 0xC349D;             // 16 × 4 : accumulateur 16.16 ; le bit 16 déclenche l'appel
const MORCEAU_D_EVENEMENT = 0xC34DD;      // 16 octets : le morceau que l'événement joue (0xFF : aucun)
const MORCEAU_COURANT = 0xC34ED;          // octet : le morceau de l'événement en cours (lu par le séquenceur)
const EVENEMENT_EN_COURS = 0xDEDB8;       // dword : l'indice de la boucle des événements, en mémoire

const PROGRAMMER_LE_PIT = 0x8A3E0;        // (diviseur) : ports 0x43 et 0x40, IRQ 0 masquée le temps
const INSTALLER_LE_GESTIONNAIRE = 0x8A426; // (inutilisé, déplacement, sélecteur) : int 21h/25h, IRQ 0
const MASQUER_L_IRQ0 = 0x8A4B1;           // port 0x21, bit 0 (si IRQ0_PRISE)
const DEMASQUER_L_IRQ0 = 0x8A4DD;
const DISPATCHER = 0x8280A;
const CHAINER_AU_BIOS = 0x828C4;

const routineLibre = (jeu, i) =>
  long(jeu, ROUTINE_D_EVENEMENT + 6 * i) === 0 && mot(jeu, ROUTINE_D_EVENEMENT + 6 * i + 4) === 0;

// 0x827DC — programmer la minuterie matérielle sur ce diviseur, et le retenir.
function reglerLaMinuterie(jeu, diviseur) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    poserLong(jeu, DIVISEUR_COURANT, diviseur);
    appelerDepuis(jeu, 0x827F8, PROGRAMMER_LE_PIT, [diviseur], { eax: diviseur });
    poserLocales(jeu, cadre, [[4, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// Le pas de chaque événement inscrit, recalculé pour le diviseur courant, et son accumulateur remis
// à zéro. Commun à 0x822F4 et 0x8260A. La fréquence réelle de la minuterie est entière
// (FREQUENCE_DU_PIT / diviseur, tronquée) ; le pas est fréquence demandée / fréquence réelle, en
// 16.16. L'événement du BIOS : un appel par tic si la minuterie est à 18,2 Hz, sinon 18,2 / réelle.
// Rend ebx et ecx tels que l'original les laisse (le dernier pas divisé, la dernière fréquence en
// 16.16), que la routine appelée ensuite sauve sur la pile.
function recalculerLesPas(jeu) {
  jeu.T.sauver();
  const registres = { ebx: jeu.T.R.ebx, ecx: jeu.T.R.ecx };
  for (let i = 0; i < NOMBRE_D_EVENEMENTS; i++) {
    if (routineLibre(jeu, i)) continue;
    const frequence = long(jeu, FREQUENCE_D_EVENEMENT + 4 * i);
    let pas;
    if (frequence === FREQUENCE_DU_BIOS) {
      if (long(jeu, DIVISEUR_COURANT) === DIVISEUR_DU_BIOS) {
        pas = PAS_UNITE;
      } else {
        pas = registres.ebx = diviser(PAS_BIOS_DE_BASE, diviser(FREQUENCE_DU_PIT, long(jeu, DIVISEUR_COURANT)));
      }
    } else {
      // `shl ecx, 16` : la fréquence en 16.16, tronquée à 32 bits
      registres.ecx = (frequence << 16) >>> 0;
      pas = registres.ebx = diviser(registres.ecx, diviser(FREQUENCE_DU_PIT, long(jeu, DIVISEUR_COURANT)));
    }
    poserLong(jeu, PAS_D_EVENEMENT + 4 * i, pas);
    poserLong(jeu, ACCUMULATEUR + 4 * i, 0);
  }
  return registres;
}

// 0x821FC — sosTIMERInitSystem(fréquence, drapeaux). Sans le bit 0 des drapeaux, SOS prend l'IRQ 0 :
// le gestionnaire 0x8A369 appellera 0x8280A à chaque tic. Avec une fréquence (et sans le bit 0),
// l'événement 15 est réservé à l'ancien gestionnaire, appelé par 0x828C4 au rythme du BIOS, et la
// minuterie est réglée sur cette fréquence (FREQUENCE_DU_BIOS : le diviseur du BIOS). Sinon, le
// diviseur retenu est celui du BIOS. Rend 0.
function initialiserLaMinuterie(jeu, frequence, drapeaux) {
  const cadre = ouvrirCadre(jeu, 4, 8);
  try {
    if (!(drapeaux & 1)) {
      poserOctet(jeu, IRQ0_PRISE, 1);
      jeu.appeler(MASQUER_L_IRQ0);
      jeu.appeler(INSTALLER_LE_GESTIONNAIRE, 0xFFFF, DISPATCHER, segmentDeCode(jeu));
      jeu.appeler(DEMASQUER_L_IRQ0);
    } else {
      poserOctet(jeu, IRQ0_PRISE, 0);
    }
    if (frequence === 0 || (drapeaux & 1)) {
      poserLong(jeu, DIVISEUR_COURANT, DIVISEUR_DU_BIOS);
      return 0;
    }
    const bios = EVENEMENT_DU_BIOS;
    if (frequence === FREQUENCE_DU_BIOS) {
      jeu.appeler(0x827DC, DIVISEUR_DU_BIOS);
      poserLong(jeu, FREQUENCE_D_EVENEMENT + 4 * bios, FREQUENCE_DU_BIOS);
    } else {
      jeu.appeler(0x827DC, diviser(FREQUENCE_DU_PIT, frequence));
      poserLong(jeu, FREQUENCE_D_EVENEMENT + 4 * bios, frequence);
    }
    poserMot(jeu, ROUTINE_D_EVENEMENT + 6 * bios + 4, segmentDeCode(jeu));
    poserLong(jeu, ROUTINE_D_EVENEMENT + 6 * bios, CHAINER_AU_BIOS);
    poserLong(jeu, PAS_D_EVENEMENT + 4 * bios, PAS_UNITE);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x822F4 — sosTIMERRegisterEvent(fréquence, déplacement, sélecteur, &poignée) : inscrire une
// routine lointaine, appelée `fréquence` fois par seconde, au premier emplacement libre. Si elle va
// plus vite que la minuterie, la minuterie est accélérée ; les pas de tous les événements sont
// recalculés. Rend 0, ou 0xB s'il n'y a plus de place.
function inscrireUnEvenement(jeu, frequence, off, sel, poigneeOff, poigneeSel) {
  const cadre = ouvrirCadre(jeu, 4, 0xC);
  try {
    let i = 0;
    while (i < NOMBRE_D_EVENEMENTS && !routineLibre(jeu, i)) i++;
    if (i >= NOMBRE_D_EVENEMENTS) {
      poserLocales(jeu, cadre, [[4, i], [0xC, 0xB]]);
      return 0xB;
    }
    if (octet(jeu, IRQ0_PRISE) !== 0) appelerDepuis(jeu, 0x8234D, MASQUER_L_IRQ0);
    const poignee = i;
    poserMot(jeu, ROUTINE_D_EVENEMENT + 6 * i + 4, sel);
    poserLong(jeu, ROUTINE_D_EVENEMENT + 6 * i, off);
    poserLong(jeu, FREQUENCE_D_EVENEMENT + 4 * i, frequence);
    if (diviser(FREQUENCE_DU_PIT, frequence) < long(jeu, DIVISEUR_COURANT)) {
      appelerDepuis(jeu, 0x8239B, 0x827DC, [diviser(FREQUENCE_DU_PIT, frequence)]);
    }
    const registres = recalculerLesPas(jeu);
    if (octet(jeu, IRQ0_PRISE) !== 0) appelerDepuis(jeu, 0x8247D, DEMASQUER_L_IRQ0, [], registres);
    poserLong(jeu, lineaire(jeu, poigneeOff, poigneeSel), poignee);
    poserLocales(jeu, cadre, [[4, NOMBRE_D_EVENEMENTS], [8, poignee], [0xC, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x8260A — sosTIMERRemoveEvent(poignée) : l'emplacement est libéré (sans contrôle de la poignée),
// la minuterie ramenée à l'événement le plus rapide qui reste (hors celui du BIOS), ou au diviseur
// du BIOS s'il n'en reste pas, et les pas recalculés. Rend 0.
function retirerUnEvenement(jeu, poignee) {
  const cadre = ouvrirCadre(jeu, 4, 0xC);
  try {
    poserMot(jeu, ROUTINE_D_EVENEMENT + 6 * poignee + 4, 0);
    poserLong(jeu, ROUTINE_D_EVENEMENT + 6 * poignee, 0);
    let plusRapide = 0;
    for (let i = 0; i < NOMBRE_D_EVENEMENTS; i++) {
      if (routineLibre(jeu, i)) continue;
      const frequence = long(jeu, FREQUENCE_D_EVENEMENT + 4 * i);
      if (frequence > plusRapide && frequence !== FREQUENCE_DU_BIOS) plusRapide = frequence;
    }
    poserLocales(jeu, cadre, [[8, plusRapide]]);
    if (plusRapide !== 0) appelerDepuis(jeu, 0x826AB, 0x827DC, [diviser(FREQUENCE_DU_PIT, plusRapide)]);
    else appelerDepuis(jeu, 0x826BA, 0x827DC, [DIVISEUR_DU_BIOS]);
    if (octet(jeu, IRQ0_PRISE) !== 0) appelerDepuis(jeu, 0x826CB, MASQUER_L_IRQ0);
    const registres = recalculerLesPas(jeu);
    if (octet(jeu, IRQ0_PRISE) !== 0) appelerDepuis(jeu, 0x827AA, DEMASQUER_L_IRQ0, [], registres);
    poserLocales(jeu, cadre, [[4, NOMBRE_D_EVENEMENTS], [0xC, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x82496 — sosTIMERAlterEventRate(poignée, fréquence) : changer la fréquence d'un événement
// inscrit. La minuterie est accélérée s'il le faut (jamais ralentie), et les pas de tous les
// événements recalculés, l'IRQ 0 masquée le temps du calcul. Rend 0, ou 0xA pour une poignée hors
// des seize emplacements ou libre. Appelée par le tempo d'un morceau (0x89E5C, sos-bruitages.js) ;
// exercée par films et musique-negociations (214 appels).
const ERR_POIGNEE = 0xA;
function changerLaFrequence(jeu, poignee, frequence) {
  const cadre = ouvrirCadre(jeu, 4, 8);
  try {
    if ((poignee >>> 0) >= NOMBRE_D_EVENEMENTS || routineLibre(jeu, poignee)) {
      poserLocales(jeu, cadre, [[8, ERR_POIGNEE]]);
      return ERR_POIGNEE;
    }
    if (octet(jeu, IRQ0_PRISE) !== 0) appelerDepuis(jeu, 0x824DD, MASQUER_L_IRQ0);
    poserLong(jeu, FREQUENCE_D_EVENEMENT + 4 * poignee, frequence);
    if (diviser(FREQUENCE_DU_PIT, frequence) < long(jeu, DIVISEUR_COURANT)) {
      appelerDepuis(jeu, 0x8250E, 0x827DC, [diviser(FREQUENCE_DU_PIT, frequence)]);
    }
    const registres = recalculerLesPas(jeu);
    poserLocales(jeu, cadre, [[4, NOMBRE_D_EVENEMENTS]]);
    if (octet(jeu, IRQ0_PRISE) !== 0) appelerDepuis(jeu, 0x825F0, DEMASQUER_L_IRQ0, [], registres);
    poserLocales(jeu, cadre, [[8, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x827B9 — la fréquence demandée pour un événement (sosTIMERGetEventRate, vraisemblablement), sans
// contrôle de la poignée. Appelée par 0x89E5C (214 appels dans films et musique-negociations).
function frequenceDUnEvenement(jeu, poignee) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    const frequence = long(jeu, FREQUENCE_D_EVENEMENT + ((poignee << 2) >>> 0));
    poserLocales(jeu, cadre, [[4, frequence]]);
    return frequence;
  } finally { cadre.fermer(); }
}

// 0x8280A — les événements de la minuterie, à chaque tic de l'IRQ 0 (appelée par le gestionnaire
// 0x8A369, sur la pile privée de SOS, par un appel lointain : `retf`). Chaque événement inscrit
// ajoute son pas à son accumulateur ; quand celui-ci passe l'unité (bit 16), sa partie entière est
// effacée, le morceau de l'événement devient le morceau courant (pour le séquenceur, 0x88D91), et
// la routine est appelée. L'indice de la boucle vit en mémoire (0xDEDB8), comme dans l'original, et
// les tables sont relues à chaque tour : une routine appelée peut en retirer une autre.
//
// Les registres. Après l'événement 15 (0x828C4, en attente), la transcription revient ici avec le
// pointeur de pile du gestionnaire, et dépile en sortant des registres qui n'ont rien à voir ;
// l'appelant, 0x8A369, recharge aussitôt sa pile (`lss esp`) et tous ses registres (`popal`) : rien
// de ce que rend cette routine n'est relu, d'où `registresCompares: []`.
function evenementsDeLaMinuterie(jeu) {
  const cadre = ouvrirCadre(jeu, 4, 0);
  try {
    poserLong(jeu, EVENEMENT_EN_COURS, 0);
    for (; long(jeu, EVENEMENT_EN_COURS) < NOMBRE_D_EVENEMENTS;
      poserLong(jeu, EVENEMENT_EN_COURS, long(jeu, EVENEMENT_EN_COURS) + 1)) {
      const i = long(jeu, EVENEMENT_EN_COURS);
      if (routineLibre(jeu, i)) continue;
      poserLong(jeu, ACCUMULATEUR + 4 * i, long(jeu, ACCUMULATEUR + 4 * i) + long(jeu, PAS_D_EVENEMENT + 4 * i));
      if (!(octet(jeu, ACCUMULATEUR + 4 * i + 2) & 1)) continue;
      poserMot(jeu, ACCUMULATEUR + 4 * i + 2, 0);
      const morceau = octet(jeu, MORCEAU_D_EVENEMENT + i);
      if (morceau !== 0xFF) poserOctet(jeu, MORCEAU_COURANT, morceau);
      const routine = ROUTINE_D_EVENEMENT + 6 * long(jeu, EVENEMENT_EN_COURS);
      appelLointain(jeu, 0x828BA, long(jeu, routine), mot(jeu, routine + 4));
    }
  } finally { cadre.fermer(); }
}

// 0x828C4 — l'événement 15 : l'ancien gestionnaire de l'IRQ 0, par 0x8A55E. Écrit d'après le
// désassemblage ; en attente (voir l'en-tête).
function chainerAuBios(jeu) {
  const cadre = ouvrirCadre(jeu, 4, 0);
  try {
    jeu.appeler(0x8A55E);
  } finally { cadre.fermer(); }
}

// === 2. LES INSTALLATIONS ==============================================================================

// Les verrouillages de mémoire : SOS verrouille (0x8BB41, DPMI 0600h) le code et les données que
// ses routines d'interruption touchent, pour qu'ils ne soient jamais paginés. Chaque couple est
// (début, taille), la taille étant la différence de deux étiquettes du programme.
const VERROUILLER = 0x8BB41;
// 0x83762 — pour la musique (appelée par sosMIDIInitSystem). Les quatre derniers : la taille est la
// différence d'une étiquette avec elle-même, et l'adresse est la variable suivante (anomalie).
const VERROUS_DE_LA_MUSIQUE = [
  [0x8BAE8, 0x44], [0x8BFF0, 0xD7], [0xE0C00, 0x4], [0x8C0D8, 0x6FA], [0x82163, 0x4A], [0x8C7E3, 0x491],
  [0x83751, 0x10D0], [0x85639, 0x138], [0x8CC85, 0x26C], [0x8CF02, 0x67], [0x88D3A, 0x35], [0x7F67E, 0xB02],
  [0x863D4, 0xE8E], [0x89E4B, 0xCB], [0x88D80, 0x539], [0x8CF7A, 0x2B9], [0x8D244, 0x269], [0x8D4BE, 0x136],
  [0x8D605, 0x4DF], [0x8DAF5, 0x241], [0x8DD47, 0x1EC], [0x8DF44, 0xD7], [0x8E02C, 0x36A], [0x8E3A7, 0x54],
  [0x8E40C, 0x57], [0x8E474, 0xE6], [0x8E56B, 0x90], [0x8E60C, 0x85], [0x8E6A2, 0xA9], [0x8E75C, 0xB1],
  [0x8E81E, 0x6F], [0x8E89E, 0xDD], [0x8E98C, 0x1F8], [0x8EB95, 0x30], [0x8EBD8, 0x400],
  [0xE12B0, 0], [0xE12B4, 0], [0xE12BC, 0], [0xE12C4, 0],
];
// 0x84888 — pour les bruitages (appelée par sosDIGIInitSystem) : dont la minuterie de SOS
// (0x821EB, 0x6EF octets), son gestionnaire (0x8A368) et sa pile privée (0xC36EC, 0x1030 octets).
const VERROUS_DES_BRUITAGES = [
  [0x84832, 0x34], [0x8ECDE, 0xA6], [0x892CA, 0x153], [0x84877, 0xDB1], [0x8ED95, 0x472], [0x8F218, 0x97],
  [0x8F2C0, 0x69], [0x8F33A, 0x6B], [0x8942E, 0xA0C], [0x821EB, 0x6EF], [0x879E7, 0x133], [0x85782, 0x988],
  [0x8A368, 0x238], [0x8BB40, 0x4AF], [0xE1280, 0x4], [0xC36EC, 0x1030],
];
function verrouillerTout(jeu, verrous) {
  const cadre = ouvrirCadre(jeu, 4, 0);
  try {
    for (const [debut, taille] of verrous) jeu.appeler(VERROUILLER, debut, taille);
  } finally { cadre.fermer(); }
}

const COPIER_CHAINE_LOINTAINE = 0x815E1;  // _fstrcpy(destination, sél., source, sél.)
const CHEMIN_DES_PILOTES_MIDI = 0xC2B20;  // le dossier des pilotes de musique
const CHEMIN_DES_PILOTES_NUMERIQUES = 0xC34EE;

// --- la musique : les pilotes internes --------------------------------------------------------------
// La table d'un pilote de musique : six pointeurs lointains, recopiée en 0xBFE7A + 0x24 × poignée.
const TABLE_DU_PILOTE_MIDI = 0xBFE7A;
const TAILLE_TABLE_MIDI = 0x24;
const F_ENVOYER = 0x00;                   // (message lointain, longueur, poignée)
const F_INITIALISER = 0x06;
const F_REMETTRE = 0x12;
const F_INSTRUMENTS = 0x18;               // (données lointaines, poignée, drapeau)
// Les tables des pilotes compilés dans le programme, remplies par sosMIDIInitSystem : à la suite,
// de six en six octets. Chaque pilote n'en a que cinq.
const PILOTES_INTERNES = [
  { table: 0xE0C62, routines: [0x8C022, 0x8C052, 0x8C06B, 0x8C084, 0x8C09D] },   // 0xA003, rappel
  { table: 0xE0C08, routines: [0x8CFAC, 0x8D172, 0x8D1E3, 0x8D201, 0x8D21A] },   // 0xA008, AWE32
  { table: 0xE0C44, routines: [0x8C10A, 0x8C411, 0x8C590, 0x8C60E, 0x8C627] },   // 0xA005, « numérique »
  { table: 0xE0C26, routines: [0x8E485, 0x8E4B4, 0x8E4EF, 0x8E50D, 0x8E52B] },   // 0xA002, FM (OPL)
];
const SYSTEME_MIDI_PRET = 0xC0042;

// 0x83FC6 — sosMIDIInitSystem(chemin lointain) : verrouille sa mémoire, retient le dossier des
// pilotes, et remplit les tables des pilotes internes. Rend 0.
function initialiserLaMusique(jeu, cheminOff, cheminSel) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    jeu.appeler(0x83762);
    if (cheminOff !== 0 || (cheminSel & 0xFFFF) !== 0) {
      jeu.appeler(COPIER_CHAINE_LOINTAINE, CHEMIN_DES_PILOTES_MIDI, segmentDeDonnees(jeu), cheminOff, cheminSel & 0xFFFF);
    } else {
      // anomalie : c'est le chemin des pilotes numériques qui est vidé
      poserOctet(jeu, CHEMIN_DES_PILOTES_NUMERIQUES, 0);
    }
    const cs = segmentDeCode(jeu);
    for (const { table, routines } of PILOTES_INTERNES) {
      routines.forEach((routine, k) => {
        poserMot(jeu, table + 6 * k + 4, cs);
        poserLong(jeu, table + 6 * k, routine);
      });
    }
    poserLong(jeu, SYSTEME_MIDI_PRET, 1);
    return 0;
  } finally { cadre.fermer(); }
}

const PILOTES_MIDI = 0xBEFCE;             // 5 × 4 : identifiant du pilote de chaque poignée (0 : libre)
const PILOTE_MIDI_ACTIF = 0xBEFA6;        // 5 × 4
const NOMBRE_DE_POIGNEES = 5;
const AUCUNE_POIGNEE = 6;
const CANAUX_DU_PILOTE = 0xC2A75;         // 5 × 16 : les canaux MIDI que le pilote joue (0 : aucun)
// Les canaux que joue chaque type de pilote, 16 octets par identifiant à partir de 0xA000 ; le
// programme calcule l'adresse comme 0x229E5 + identifiant × 16.
const CANAUX_PAR_TYPE = 0xC29E5;
const PILOTE_CHARGE = 0xBEF74;            // 5 × 6 : pointeur lointain du pilote chargé depuis HMIMDRV.386
const TAILLE_DU_PILOTE_CHARGE = 0xBEF92;  // 5 × 4
const NUL_LOINTAIN = 0xC2D1E;             // pointeur lointain toujours nul (0xC2D22 : son sélecteur)
const PARAMETRE_C2D24 = 0xC2D24;          // dword passé aux pilotes, non établi

// Les pilotes compilés dans le programme, par identifiant : la routine qui le prépare (s'il y en a
// une), sa table, l'adresse de retour de l'appel de son initialisation, et son dernier argument —
// le premier dword du matériel, ou 0xC2D24. Les autres (0xA004 MT-32, 0xA006, 0xA007, et tout ce
// qui dépasse 0xA008) sont chargés depuis HMIMDRV.386.
const PILOTES_COMPILES = new Map([
  [0xA002, { preparer: null, table: 0xE0C26, retour: 0x84373, avecMateriel: true }],       // FM
  [0xA003, { preparer: 0x8C001, table: 0xE0C62, retour: 0x84402, avecMateriel: false }],   // rappel
  [0xA005, { preparer: 0x8C0E9, table: 0xE0C44, retour: 0x842F3, avecMateriel: false }],   // « numérique »
  [0xA008, { preparer: 0x8CF8B, table: 0xE0C08, retour: 0x84492, avecMateriel: true }],    // AWE32
]);
const CHARGER_LE_PILOTE_MIDI = 0x8CC96;   // (id, poignée, &taille, &pointeur lointain)
const TABLE_DE_RELOGEMENT = 0xBEFE6;      // 5 × 6, non établi
const PREPARER_LE_PILOTE_CHARGE = 0x8BAF9; // (poignée, pointeur lointain)
const RELIER_LE_PILOTE_CHARGE = 0x8EC8B;  // (taille, code lointain, table lointaine) : remplit la table

// 0x8418C — sosMIDIInitDriver(id, &matériel, &init, &poignée), pointeurs lointains. Prend la
// première poignée libre, retient les canaux que ce type de pilote joue, recopie la table du pilote
// interne (ou charge le pilote depuis HMIMDRV.386 et le relie), puis l'initialise. Rend 0, 0xB
// s'il n'y a plus de poignée, ou l'erreur du pilote.
function installerUnPiloteDeMusique(jeu, id, materielOff, materielSel, initOff, initSel, poigneeOff, poigneeSel) {
  const cadre = ouvrirCadre(jeu, 4, 0x48);
  try {
    const init = lineaire(jeu, initOff, initSel);
    const materiel = lineaire(jeu, materielOff, materielSel);
    let p = AUCUNE_POIGNEE;
    for (let i = 0; i < NOMBRE_DE_POIGNEES; i++) {
      if (long(jeu, PILOTES_MIDI + 4 * i) === 0) { p = i; break; }
    }
    if (p === AUCUNE_POIGNEE) return 0xB;
    poserLong(jeu, PILOTES_MIDI + 4 * p, id);
    for (let c = 0; c < 16; c++) {
      poserOctet(jeu, CANAUX_DU_PILOTE + 16 * p + c, octet(jeu, (CANAUX_PAR_TYPE + (id - 0xA000) * 16 + c) >>> 0));
    }
    const table = TABLE_DU_PILOTE_MIDI + TAILLE_TABLE_MIDI * p;
    const initialiser = (retour, ...args) => appelLointain(jeu, retour,
      long(jeu, table + F_INITIALISER), mot(jeu, table + F_INITIALISER + 4), ...args);
    const compile = PILOTES_COMPILES.get(long(jeu, PILOTES_MIDI + 4 * p));
    if (compile) {
      if (compile.preparer) jeu.appeler(compile.preparer);
      // six pointeurs recopiés, pour cinq routines (anomalie)
      for (let k = 0; k < 6; k++) copierPointeurLointain(jeu, table + 6 * k, compile.table + 6 * k);
      const dernier = compile.avecMateriel ? long(jeu, materiel) : long(jeu, PARAMETRE_C2D24);
      // (paramètres de init +0x10 et +0x14, poignée, dernier)
      const erreur = initialiser(compile.retour, long(jeu, init + 0x10), mot(jeu, init + 0x14), p, dernier);
      if (erreur !== 0) return erreur;
    } else {
      // un pilote de HMIMDRV.386 : déjà chargé par l'appelant (init +4), ou chargé ici
      const selecteur = cadre.local(0x38), pointeur = cadre.local(0x3C), taille = cadre.local(0x24);
      poserMot(jeu, NUL_LOINTAIN + 4, 0);
      poserLong(jeu, NUL_LOINTAIN, 0);
      if (long(jeu, init + 4) !== long(jeu, NUL_LOINTAIN) || mot(jeu, init + 8) !== mot(jeu, NUL_LOINTAIN + 4)) {
        poserMot(jeu, selecteur, mot(jeu, init + 8));
        poserLong(jeu, pointeur, long(jeu, init + 4));
        poserLong(jeu, taille, long(jeu, init + 0xC));
      } else {
        const erreur = jeu.appeler(CHARGER_LE_PILOTE_MIDI, id, p, taille, pointeur, segmentDePile(jeu));
        if (erreur !== 0) return erreur;
        poserMot(jeu, init + 8, mot(jeu, selecteur));
        poserLong(jeu, init + 4, long(jeu, pointeur));
        poserLong(jeu, init + 0xC, long(jeu, taille));
      }
      poserMot(jeu, PILOTE_CHARGE + 6 * p + 4, mot(jeu, selecteur));
      poserLong(jeu, PILOTE_CHARGE + 6 * p, long(jeu, pointeur));
      poserLong(jeu, TAILLE_DU_PILOTE_CHARGE + 4 * p, long(jeu, taille));
      jeu.appeler(PREPARER_LE_PILOTE_CHARGE, p, TABLE_DE_RELOGEMENT + 6 * p, segmentDeDonnees(jeu));
      jeu.appeler(RELIER_LE_PILOTE_CHARGE, long(jeu, taille), long(jeu, pointeur), mot(jeu, selecteur),
        table, segmentDeDonnees(jeu));
      // son initialisation : le pointeur nul, 0xC2D24 et le matériel ; son résultat est ignoré
      initialiser(0x8460D, long(jeu, NUL_LOINTAIN), mot(jeu, NUL_LOINTAIN + 4), long(jeu, PARAMETRE_C2D24),
        long(jeu, materiel));
    }
    poserLong(jeu, PILOTE_MIDI_ACTIF + 4 * p, 1);
    poserLong(jeu, lineaire(jeu, poigneeOff, poigneeSel), p);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x8564A — sosMIDISetInsData(poignée, données lointaines, drapeau) : les instruments (INST.BNK,
// DRUM.BNK) passés à la fonction F_INSTRUMENTS du pilote. Rend 0.
function donnerLesInstruments(jeu, p, off, sel, drapeau) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    const f = TABLE_DU_PILOTE_MIDI + TAILLE_TABLE_MIDI * p + F_INSTRUMENTS;
    appelLointain(jeu, 0x8566E, long(jeu, f), mot(jeu, f + 4), off, sel & 0xFFFF, p, drapeau);
    return 0;
  } finally { cadre.fermer(); }
}

// --- les bruitages ----------------------------------------------------------------------------------
const SYSTEME_NUMERIQUE_PRET = 0xBEF70;

// 0x84C12 — sosDIGIInitSystem(chemin lointain) : verrouille sa mémoire et retient le dossier des
// pilotes. Rend 0.
function initialiserLesBruitages(jeu, cheminOff, cheminSel) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    jeu.appeler(0x84888);
    poserLong(jeu, SYSTEME_NUMERIQUE_PRET, 1);
    if (cheminOff !== 0 || (cheminSel & 0xFFFF) !== 0) {
      jeu.appeler(COPIER_CHAINE_LOINTAINE, CHEMIN_DES_PILOTES_NUMERIQUES, segmentDeDonnees(jeu), cheminOff, cheminSel & 0xFFFF);
    } else {
      poserOctet(jeu, CHEMIN_DES_PILOTES_NUMERIQUES, 0);
    }
    return 0;
  } finally { cadre.fermer(); }
}

// 0x85551 — un tampon DMA de `taille` octets en mémoire DOS, sans frontière de 64 Ko : un bloc de
// taille / 16 + 4 paragraphes (0x8BC3C, qui rend son sélecteur dans la variable), dont on prend
// l'adresse linéaire (0x8BBCB), rangée dans *adresse ; tant que le tampon y chevaucherait une
// frontière de 64 Ko, un autre bloc est pris (le précédent n'est pas rendu). Rend le pointeur
// lointain du bloc (0x8BBF6) : déplacement dans eax, sélecteur dans dx (edx : voir l'en-tête).
const PRENDRE_DE_LA_MEMOIRE_DOS = 0x8BC3C; // (paragraphes, &sélecteur)
const ADRESSE_DU_BLOC_DOS = 0x8BBCB;       // (sélecteur) -> adresse linéaire
const POINTEUR_DU_BLOC_DOS = 0x8BBF6;      // (adresse) -> pointeur lointain, edx:eax
function prendreUnTamponDma(jeu, taille, adresse) {
  const cadre = ouvrirCadre(jeu, 4, 0x18);
  let edx = 0;
  try {
    const bloc = cadre.local(4);
    const prendre = () => {
      jeu.appeler(PRENDRE_DE_LA_MEMOIRE_DOS, (taille >>> 4) + 4, bloc);
      poserLong(jeu, bloc, jeu.appeler(ADRESSE_DU_BLOC_DOS, long(jeu, bloc)));
      poserLong(jeu, adresse, long(jeu, bloc));
    };
    prendre();
    while ((long(jeu, bloc) & 0xFFFF) > ((0xFFFF - taille) >>> 0)) prendre();
    const deplacement = jeu.appeler(POINTEUR_DU_BLOC_DOS, long(jeu, bloc)) >>> 0;
    const selecteur = jeu.T.R.edx & 0xFFFF;
    poserMot(jeu, cadre.local(0xC), selecteur);
    poserLong(jeu, cadre.local(0x10), deplacement);
    poserMot(jeu, cadre.local(0x14), selecteur);
    poserLong(jeu, cadre.local(0x18), deplacement);
    edx = long(jeu, cadre.local(0x14));
    return deplacement;
  } finally {
    cadre.fermer();
    jeu.T.R.edx = edx | 0;              // après la fermeture, qui relève les registres
  }
}

const PILOTES_NUMERIQUES = 0xC3354;       // 5 × 4 : identifiant du pilote de chaque poignée
const PILOTE_MATERIEL = 0xC31E8;          // 5 × 6 : pointeur lointain du pilote matériel chargé
const ADRESSE_DU_PILOTE = 0xC3206;        // 5 × 4 : son adresse (celle que l'hôte reconnaît, son.js)
const DESCRIPTION_DE_LA_CARTE = 0xC336C;  // 5 × 6 : pointeur lointain de sa description (fonction 8)
const TAILLE_DU_TAMPON = 0xC329C;         // 5 × 4
const TAMPON_ALLOUE = 0xBEF5C;            // 5 × 4 : SOS a pris le tampon DMA lui-même
const TAMPON_DMA = 0xC32B0;               // 5 × 6 : pointeur lointain du tampon
const MELANGEUR = 0xC321A;                // 5 × 6 : pointeur lointain du module de mélange
const ADRESSE_DU_MELANGEUR = 0xC3238;     // 5 × 4 : son adresse (son.js)
const MELANGEUR_CHARGE = 0xC3260;         // 5 × 4
const CORRESPONDANCE_C3390 = 0xC3390;     // table indexée par le dword +8 du matériel, non établie
const REMPLISSAGE = 0xC32F6;              // 5 × 6 : la routine de remplissage du mélangeur (0xE0BE8)
const DONNEES_DU_MELANGEUR = 0xC3332;     // 5 × 6 : ses données (0xE0BF0)
const RESTE_C32CE = 0xC32CE;              // 5 × 4 : non établi (la variable que 0x85551 remplit)
const MATERIEL_C33B0 = 0xC33B0;           // 5 octets : l'octet bas du dword +8 du matériel
const DRAPEAU_C324C = 0xC324C, DRAPEAU_C3274 = 0xC3274;  // 5 × 4, mis à 1, non établis
const REPONSE_DU_MELANGEUR = 0xE0BE8;     // où 0x8BE57 range les trois adresses du mélangeur
const DESCRIPTEURS = 0xE0EC0;             // 5 × 0xC0, non établi
const COPIE_DE_L_INIT = 0xE0D80;          // 5 × 0x40 : la structure d'initialisation, recopiée
const PREMIER_PILOTE_SANS_TAMPON = 0xE106; // à partir de cet identifiant, pas de tampon DMA

const CHARGER_LE_PILOTE_MATERIEL = 0x8EDA6; // (id, poignée, &adresse, &pointeur lointain)
const DECRIRE_LA_CARTE = 0x8ECEF;          // (poignée, &description lointaine) : fonction 8
const OUBLIER_LE_PILOTE = 0x8EFA2;         // (poignée)
const CHARGER_LE_MELANGEUR = 0x8F00C;      // (id du module, &adresse, &pointeur lointain)
const INSTALLER_LE_MELANGEUR = 0x8BE57;    // fonction 0x0A du mélangeur
const COPIER_C0 = 0x8BB9B;                 // (destination, source lointaine), non établi
const PILOTE_F_8BF81 = 0x8BF81;            // (matériel +8), non établi
const REGLER_LE_MATERIEL = 0x8BEB9;        // fonction 0 : port, IRQ, DMA
const PILOTE_F_8BF52 = 0x8BF52;            // fonction 3
const PILOTE_F_8BF23 = 0x8BF23;            // fonction 2 : fréquence
const DEMARRER_LE_DMA = 0x8BEF2;           // fonction 4

// 0x84C98 — sosDIGIInitDriver(id, &matériel, &init, &poignée), pointeurs lointains (§ 9.4). Charge
// le pilote matériel depuis HMIDRV.386 (sauf s'il l'est déjà : init +0x24), lit la description de
// la carte, prend le tampon DMA (init +0xC) et le remplit de silence, charge et installe le module
// de mélange (init +0x30, ou celui qu'indique init +0x3C, ou la description +0x68), puis règle et
// démarre le pilote. Rend 0, 0xB s'il n'y a plus de poignée, 5 faute de mémoire DOS, ou l'erreur
// d'un chargement.
//
// La structure d'initialisation : +0 taille du tampon DMA, +4 son pointeur lointain, +0xC le
// prendre ici, +0x10 fréquence, +0x14 et +0x18 transmis au pilote (fonction 0), +0x1C la routine
// de remplissage (en retour), +0x24 le pilote matériel et +0x2C son adresse, +0x30 le mélangeur,
// +0x3C l'identifiant du mélangeur voulu.
function installerUnPiloteNumerique(jeu, id, materielOff, materielSel, initOff, initSel, poigneeOff, poigneeSel) {
  const cadre = ouvrirCadre(jeu, 4, 0x6C);
  try {
    const init = lineaire(jeu, initOff, initSel);
    const materiel = lineaire(jeu, materielOff, materielSel);
    // les variables dont l'adresse est passée, ou qu'un chemin relit sans les avoir écrites
    const adresseDuPilote = cadre.local(0x34);
    const pilote = cadre.local(0x4C);          // pointeur lointain : +0 déplacement, +4 sélecteur
    const resteDuTampon = cadre.local(0x38);
    const adresseDuMelangeur = cadre.local(0x24);
    const melangeur = cadre.local(0x5C);       // pointeur lointain
    const tailleDuTampon = long(jeu, init);
    const prendreLeTampon = long(jeu, init + 0xC);
    const frequence = long(jeu, init + 0x10);
    const reglage14 = long(jeu, init + 0x14), reglage18 = long(jeu, init + 0x18);
    let tamponSel = mot(jeu, init + 8), tamponOff = long(jeu, init + 4);

    let p = AUCUNE_POIGNEE;
    for (let i = 0; i < NOMBRE_DE_POIGNEES; i++) {
      if (long(jeu, PILOTES_NUMERIQUES + 4 * i) === 0) { p = i; break; }
    }
    if (p === AUCUNE_POIGNEE) return 0xB;
    poserLong(jeu, PILOTES_NUMERIQUES + 4 * p, id);

    // le pilote matériel
    if (long(jeu, init + 0x24) !== 0 || mot(jeu, init + 0x28) !== 0) {
      poserMot(jeu, pilote + 4, mot(jeu, init + 0x28));
      poserLong(jeu, pilote, long(jeu, init + 0x24));
      poserLong(jeu, adresseDuPilote, long(jeu, init + 0x2C));
    } else {
      const erreur = jeu.appeler(CHARGER_LE_PILOTE_MATERIEL, id, p, adresseDuPilote, pilote, segmentDePile(jeu));
      if (erreur !== 0) return erreur;
      poserMot(jeu, init + 0x28, mot(jeu, pilote + 4));
      poserLong(jeu, init + 0x24, long(jeu, pilote));
      poserLong(jeu, init + 0x2C, long(jeu, adresseDuPilote));
    }
    poserMot(jeu, PILOTE_MATERIEL + 6 * p + 4, mot(jeu, pilote + 4));
    poserLong(jeu, PILOTE_MATERIEL + 6 * p, long(jeu, pilote));
    poserLong(jeu, ADRESSE_DU_PILOTE + 4 * p, long(jeu, adresseDuPilote));
    const erreurDescription = jeu.appeler(DECRIRE_LA_CARTE, p, DESCRIPTION_DE_LA_CARTE + 6 * p, segmentDeDonnees(jeu));
    if (erreurDescription !== 0) return erreurDescription;

    if (long(jeu, PILOTES_NUMERIQUES + 4 * p) < PREMIER_PILOTE_SANS_TAMPON) {
      poserLong(jeu, TAILLE_DU_TAMPON + 4 * p, tailleDuTampon);
      if (prendreLeTampon !== 0) {
        poserLong(jeu, TAMPON_ALLOUE + 4 * p, 1);
        tamponOff = jeu.appeler(0x85551, tailleDuTampon, resteDuTampon) >>> 0;
        tamponSel = jeu.T.R.edx & 0xFFFF;
        if (tamponOff === 0 && tamponSel === 0) {
          jeu.appeler(OUBLIER_LE_PILOTE, p);
          poserLong(jeu, PILOTES_NUMERIQUES + 4 * p, 0);
          return 5;
        }
        poserMot(jeu, TAMPON_DMA + 6 * p + 4, tamponSel);
        poserLong(jeu, TAMPON_DMA + 6 * p, tamponOff);
        // le silence : 0 pour des échantillons signés (16 bits, ou 8 bits avec le bit 7 de +0x3D),
        // 0x80 pour des échantillons de 8 bits non signés
        const description = pointeurLointain(jeu, DESCRIPTION_DE_LA_CARTE + 6 * p);
        let silence = 0;
        if (long(jeu, description + 0x24) === 8 && !(octet(jeu, description + 0x3D) & 0x80)) silence = 0x80;
        const tampon = lineaire(jeu, tamponOff, tamponSel);
        for (let k = 0; k < tailleDuTampon; k++) poserOctet(jeu, tampon + k, silence);
      } else {
        poserMot(jeu, TAMPON_DMA + 6 * p + 4, tamponSel);
        poserLong(jeu, TAMPON_DMA + 6 * p, tamponOff);
        poserLong(jeu, TAMPON_ALLOUE + 4 * p, 0);
      }
      poserMot(jeu, init + 8, tamponSel);
      poserLong(jeu, init + 4, tamponOff);

      // le module de mélange
      if (long(jeu, init + 0x30) === 0 && mot(jeu, init + 0x34) === 0) {
        const voulu = long(jeu, init + 0x3C) !== 0
          ? long(jeu, init + 0x3C)
          : long(jeu, pointeurLointain(jeu, DESCRIPTION_DE_LA_CARTE + 6 * p) + 0x68);
        const erreur = jeu.appeler(CHARGER_LE_MELANGEUR, voulu, adresseDuMelangeur, melangeur, segmentDePile(jeu));
        if (erreur !== 0) return erreur;
      } else {
        // préchargé : son adresse (adresseDuMelangeur) n'est pas prise (anomalie)
        poserMot(jeu, melangeur + 4, mot(jeu, init + 0x34));
        poserLong(jeu, melangeur, long(jeu, init + 0x30));
      }
      poserMot(jeu, init + 0x34, mot(jeu, melangeur + 4));
      poserLong(jeu, init + 0x30, long(jeu, melangeur));
      poserMot(jeu, MELANGEUR + 6 * p + 4, mot(jeu, melangeur + 4));
      poserLong(jeu, MELANGEUR + 6 * p, long(jeu, melangeur));
      poserLong(jeu, ADRESSE_DU_MELANGEUR + 4 * p, long(jeu, adresseDuMelangeur));
      poserLong(jeu, MELANGEUR_CHARGE + 4 * p, 1);
      const correspondance = long(jeu, CORRESPONDANCE_C3390 + 4 * long(jeu, materiel + 8));
      jeu.appeler(INSTALLER_LE_MELANGEUR, long(jeu, adresseDuMelangeur), long(jeu, melangeur), mot(jeu, melangeur + 4),
        tamponOff, tamponSel, tailleDuTampon, correspondance, p, REPONSE_DU_MELANGEUR);
      copierPointeurLointain(jeu, REMPLISSAGE + 6 * p, REPONSE_DU_MELANGEUR);
      copierPointeurLointain(jeu, DONNEES_DU_MELANGEUR + 6 * p, REPONSE_DU_MELANGEUR + 8);
      jeu.appeler(COPIER_C0, DESCRIPTEURS + 0xC0 * p, long(jeu, REPONSE_DU_MELANGEUR + 0x10),
        mot(jeu, REPONSE_DU_MELANGEUR + 0x14));
    } else {
      poserMot(jeu, REMPLISSAGE + 6 * p + 4, 0);
      poserLong(jeu, REMPLISSAGE + 6 * p, 0);
    }
    // la routine de remplissage, rendue à l'appelant
    copierPointeurLointain(jeu, init + 0x1C, REMPLISSAGE + 6 * p);

    // le réglage du pilote matériel
    jeu.appeler(PILOTE_F_8BF81, long(jeu, materiel + 8));
    poserLong(jeu, RESTE_C32CE + 4 * p, long(jeu, resteDuTampon));   // jamais écrit sans tampon pris
    const port = long(jeu, materiel), irq = long(jeu, materiel + 4), dma = long(jeu, materiel + 8);
    poserOctet(jeu, MATERIEL_C33B0 + p, dma);
    const code = [long(jeu, adresseDuPilote), long(jeu, pilote), mot(jeu, pilote + 4)];
    jeu.appeler(REGLER_LE_MATERIEL, ...code, port, irq, dma, reglage14, reglage18);
    jeu.appeler(PILOTE_F_8BF52, ...code);
    jeu.appeler(PILOTE_F_8BF23, ...code, frequence);
    poserLong(jeu, resteDuTampon, long(jeu, RESTE_C32CE + 4 * p));
    jeu.appeler(DEMARRER_LE_DMA, ...code, long(jeu, resteDuTampon), tailleDuTampon);
    poserLong(jeu, DRAPEAU_C324C + 4 * p, 1);
    poserLong(jeu, DRAPEAU_C3274 + 4 * p, 1);

    // la structure d'initialisation, recopiée
    const copie = COPIE_DE_L_INIT + 0x40 * p;
    poserLong(jeu, copie, long(jeu, init));
    copierPointeurLointain(jeu, copie + 4, init + 4);
    poserLong(jeu, copie + 0xC, long(jeu, init + 0xC));
    poserLong(jeu, copie + 0x10, long(jeu, init + 0x10));
    poserLong(jeu, copie + 0x14, id);
    poserLong(jeu, copie + 0x18, long(jeu, init + 0x18));
    copierPointeurLointain(jeu, copie + 0x1C, init + 0x1C);
    copierPointeurLointain(jeu, copie + 0x24, init + 0x24);
    copierPointeurLointain(jeu, copie + 0x30, init + 0x30);
    poserLong(jeu, copie + 0x3C, long(jeu, init + 0x3C));
    poserLong(jeu, lineaire(jeu, poigneeOff, poigneeSel), p);
    return 0;
  } finally { cadre.fermer(); }
}

// === 3. ET 4. LE PILOTE DE MUSIQUE ET LE SÉQUENCEUR ====================================================

const MESSAGE = 0xC29D7;                  // 3 octets : le message que SOS construit pour le pilote
const VOL_DE_CANAUX = 0xC29E1;            // dword : sosMIDIEnableChannelStealing (0x87238)
const VOLUME_GENERAL = 0xC2AC5;           // octet, 0 à 127 : multiplie tout volume de canal
const VOLUME_DU_CANAL = 0xC2AC6;          // 5 × 16 : volume de chaque canal du pilote (le 9 : percussions)
const CANAL_DU_MORCEAU = 0xC1DA7;         // pilote × 128 + morceau × 16 + canal : canal du pilote (0xFF : aucun)
const CANAL_LOGIQUE = 0xC2077;            // pilote × 16 + canal du pilote : le canal du morceau qui le tient
const MORCEAU_DU_CANAL = 0xC20C7;         // pilote × 16 + canal du pilote : ce morceau
const PRIORITE_DU_CANAL = 0xC2027;        // pilote × 16 + canal du pilote : sa priorité (grande : faible)
// L'état d'un canal du morceau, gardé pour le rejouer quand il retrouve un canal du pilote : quatre
// emplacements de 5 octets par (pilote, canal) ; EMPLACEMENT_DU_CANAL dit lequel sert.
const ETAT_SAUVE = 0xC2117;               // pilote × 0x140 + canal × 0x14 + emplacement × 5
const E_PRIS = 0, E_COURBURE = 1, E_VOLUME = 2, E_PROGRAMME = 3, E_PEDALE = 4;
const EMPLACEMENT_DU_CANAL = 0xC2757;     // pilote × 128 + morceau × 16 + canal (0xFF : aucun)
const EN_TETE_DU_MORCEAU = 0xBFF8E;       // morceau × 6 : pointeur lointain de l'en-tête HMP
const PRIORITES_HMP = 0x40;               // dans l'en-tête : priorité de chaque canal, 16 dwords
const MORCEAU_EN_COURS = 0xBFF4E;         // morceau × 4 : non nul tant qu'il joue
const NOMBRE_DE_PISTES = 0xBFE5A;         // morceau × 4
const PILOTE_DES_PISTES = 0xBFE0A;        // morceau × 6 : pointeur lointain, un dword par piste
const PISTE = 0xC17A7;                    // morceau × 0xC0 + piste × 6 : pointeur lointain de la piste
const CANAL_DE_LA_PISTE = 8;              // octet de l'en-tête de la piste

// Remettre un message au pilote : sa fonction F_ENVOYER(message lointain, longueur, poignée).
// `registres` : ceux de l'original au moment de l'appel (voir « La pile privée de SOS »).
function envoyer(jeu, retour, p, off, sel, longueur, registres = null) {
  const f = TABLE_DU_PILOTE_MIDI + TAILLE_TABLE_MIDI * p + F_ENVOYER;
  appelLointainAvec(jeu, registres, retour, long(jeu, f), mot(jeu, f + 4), off, sel, longueur, p);
}
// Construire un message de trois octets dans le tampon de SOS et l'envoyer. L'original charge
// alors ebx de p × 0x24, eax du segment de données et edx de l'adresse du tampon.
function envoyerMessage(jeu, retour, p, statut, a, b, longueur = 3, autres = {}) {
  poserOctet(jeu, MESSAGE, statut);
  poserOctet(jeu, MESSAGE + 1, a);
  poserOctet(jeu, MESSAGE + 2, b);
  envoyer(jeu, retour, p, MESSAGE, segmentDeDonnees(jeu), longueur,
    { eax: segmentDeDonnees(jeu), edx: MESSAGE, ebx: p * TAILLE_TABLE_MIDI, ...autres });
}

const RESET_CONTROLEURS = 0x79, NOTES_ETEINTES = 0x7B, VOLUME = 7, PEDALE = 0x40;

// 0x8474A — sosMIDIResetDriver(poignée) : sur chacun des seize canaux, remise des contrôleurs puis
// extinction des notes, puis la fonction F_REMETTRE du pilote (nul lointain, poignée, 0xC2D24).
// Rend 0.
function remettreLePilote(jeu, p) {
  const cadre = ouvrirCadre(jeu, 4, 0xC);
  try {
    for (let canal = 0; canal < 16; canal++) {
      envoyerMessage(jeu, 0x847A8, p, canal | 0xB0, RESET_CONTROLEURS, 0);
      envoyerMessage(jeu, 0x847E6, p, canal | 0xB0, NOTES_ETEINTES, 0);
    }
    const f = TABLE_DU_PILOTE_MIDI + TAILLE_TABLE_MIDI * p + F_REMETTRE;
    appelLointain(jeu, 0x8480F, long(jeu, f), mot(jeu, f + 4),
      long(jeu, NUL_LOINTAIN), mot(jeu, NUL_LOINTAIN + 4), p, long(jeu, PARAMETRE_C2D24));
    return 0;
  } finally { cadre.fermer(); }
}

// 0x82174 — sosMIDISongDone(morceau) : 1 si le morceau ne joue plus.
function morceauFini(jeu, morceau) {
  return long(jeu, MORCEAU_EN_COURS + 4 * morceau) === 0 ? 1 : 0;
}

// 0x863E5 — remettre au pilote `p` un message MIDI du morceau (appelée par le séquenceur, 0x88D91,
// pendant l'interruption) : (morceau, message lointain, pilote, longueur). Rend 1 sans vol de
// canaux, sinon 0, ou −1 si aucun canal du pilote n'a pu lui être donné.
//
// Sans vol de canaux (le cas du jeu) : le message part tel quel, sauf le volume d'un canal (0xBn,
// contrôleur 7), multiplié par le volume général (/128) dans le tampon de SOS. Anomalie : tout
// autre contrôleur (0xBn) fait partir le tampon à la place du message.
//
// Avec vol de canaux : le canal du morceau est traduit en un canal du pilote. S'il n'en a pas, il
// prend le premier canal libre parmi ceux que le pilote joue (et y rejoue l'état qu'il avait
// gardé), ou, à défaut, vole celui de plus faible priorité (la plus grande valeur) si la sienne est
// plus forte — les notes de l'ancien propriétaire éteintes, ses contrôleurs remis. Le canal 9, les
// percussions, reste le 9. L'état du canal (programme, courbure, volume, pédale) est gardé au
// passage, puis le message part, le canal traduit et le volume multiplié, et il est remis tel qu'il
// était.
function envoyerUnMessageDuMorceau(jeu, morceau, off, sel, p, longueur) {
  const cadre = ouvrirCadre(jeu, 4, 0x38);
  try {
    const message = lineaire(jeu, off, sel);
    // les variables de l'original, dans son cadre (voir « La pile privée de SOS »)
    poserLocales(jeu, cadre, [[0x10, 0, 1], [0x14, 0xFF, 1], [0x24, -1]]);
    if (long(jeu, VOL_DE_CANAUX) === 0) {
      const genre = octet(jeu, message) & 0xF0;
      poserLocales(jeu, cadre, [[0x30, genre, 1]]);
      if (genre === 0xB0) {
        poserLocales(jeu, cadre, [[0x2C, octet(jeu, message + 1), 1]]);
        if (octet(jeu, message + 1) === VOLUME) {
          poserOctet(jeu, MESSAGE, octet(jeu, message));
          poserOctet(jeu, MESSAGE + 1, VOLUME);
          poserOctet(jeu, MESSAGE + 2, (octet(jeu, VOLUME_GENERAL) * octet(jeu, message + 2)) >>> 7);
        }
        envoyer(jeu, 0x8647A, p, MESSAGE, segmentDeDonnees(jeu), longueur,
          { eax: segmentDeDonnees(jeu), edx: MESSAGE, ebx: p * TAILLE_TABLE_MIDI });
      } else {
        envoyer(jeu, 0x86497, p, off, sel & 0xFFFF, longueur, { eax: p * TAILLE_TABLE_MIDI, edx: sel & 0xFFFF });
      }
      poserLocales(jeu, cadre, [[0x28, 1]]);
      return 1;
    }

    const statut = octet(jeu, message);
    const canal = statut & 0x0F;
    const ligne = p * 128 + morceau * 16;               // dans CANAL_DU_MORCEAU, EMPLACEMENT_DU_CANAL
    const canalDuMorceau = CANAL_DU_MORCEAU + ligne + canal;
    const emplacementDuCanal = EMPLACEMENT_DU_CANAL + ligne + canal;
    const etat = (k, champ) => ETAT_SAUVE + p * 0x140 + canal * 0x14 + k * 5 + champ;
    // la priorité du canal dans l'en-tête du morceau (lue seulement quand l'original la lit)
    const prioriteDuMorceau = () => pointeurLointain(jeu, EN_TETE_DU_MORCEAU + 6 * morceau) + canal * 4 + PRIORITES_HMP;
    // un emplacement d'état libre pour ce canal du morceau, s'il en reste
    const prendreUnEmplacement = () => {
      for (let k = 0; k < 4; k++) {
        if (octet(jeu, etat(k, E_PRIS)) === 0xFF) {
          poserOctet(jeu, etat(k, E_PRIS), 1);
          poserOctet(jeu, emplacementDuCanal, k);
          return;
        }
      }
    };
    let volume = -1;
    let meilleurePriorite = 0, meilleur = 0xFF;
    let traduit = octet(jeu, canalDuMorceau);

    for (;;) {
      if (traduit !== 0xFF) {
        poserOctet(jeu, message, traduit | (statut & 0xF0));
        break;
      }
      if (canal === 9) {
        poserOctet(jeu, canalDuMorceau, 9);
        traduit = 9;
        continue;
      }
      // un canal libre parmi ceux que le pilote joue
      let libre = -1;
      for (let i = 0; i < 16; i++) {
        while (octet(jeu, CANAUX_DU_PILOTE + 16 * p + i) === 0 && i < 16) i++;
        if (i < 16 && octet(jeu, CANAL_LOGIQUE + 16 * p + i) === 0xFF) { libre = i; break; }
      }
      if (libre >= 0) {
        poserOctet(jeu, canalDuMorceau, libre);
        traduit = libre;
        poserOctet(jeu, CANAL_LOGIQUE + 16 * p + libre, canal);
        poserOctet(jeu, MORCEAU_DU_CANAL + 16 * p + libre, morceau);
        poserOctet(jeu, PRIORITE_DU_CANAL + 16 * p + libre, octet(jeu, prioriteDuMorceau()));
        const k = octet(jeu, emplacementDuCanal);
        if (k !== 0xFF) {
          // l'état gardé, rejoué sur le canal retrouvé
          poserOctet(jeu, VOLUME_DU_CANAL + 16 * p + traduit, 0x7F);
          envoyerMessage(jeu, 0x8665E, p, traduit | 0xC0, RESET_CONTROLEURS, 0);        // (sic : 0xC0)
          if (octet(jeu, etat(k, E_PROGRAMME)) !== 0xFF) {
            poserOctet(jeu, MESSAGE, traduit | 0xC0);
            poserOctet(jeu, MESSAGE + 1, octet(jeu, etat(k, E_PROGRAMME)));
            envoyer(jeu, 0x866D2, p, MESSAGE, segmentDeDonnees(jeu), 2,
              { eax: segmentDeDonnees(jeu), edx: MESSAGE, ebx: p * TAILLE_TABLE_MIDI });
          }
          if (octet(jeu, etat(k, E_COURBURE)) !== 0xFF) {
            envoyerMessage(jeu, 0x8674D, p, traduit | 0xE0, 0, octet(jeu, etat(k, E_COURBURE)), 2);   // (sic : 2)
          }
          if (octet(jeu, etat(k, E_VOLUME)) !== 0xFF) {
            envoyerMessage(jeu, 0x867C8, p, traduit | 0xB0, VOLUME, octet(jeu, etat(k, E_VOLUME)));
          }
          if (octet(jeu, etat(k, E_PEDALE)) !== 0xFF) {
            envoyerMessage(jeu, 0x86843, p, traduit | 0xB0, PEDALE, octet(jeu, etat(k, E_PEDALE)));
          }
        } else {
          prendreUnEmplacement();
        }
        continue;
      }
      // pas de canal libre : le moins prioritaire des canaux joués
      for (let i = 0; i < 16; i++) {
        while (octet(jeu, CANAUX_DU_PILOTE + 16 * p + i) === 0 && i < 16) i++;
        if (i >= 16) continue;
        const priorite = octet(jeu, PRIORITE_DU_CANAL + 16 * p + i);
        if (priorite > meilleurePriorite && priorite !== 0xFF) {
          meilleurePriorite = priorite;
          meilleur = i;
        }
      }
      if (meilleur === 0xFF) break;
      if (meilleurePriorite > long(jeu, prioriteDuMorceau())) {
        // le vol : l'ancien propriétaire perd son canal
        poserOctet(jeu, canalDuMorceau, meilleur);
        const ancien = CANAL_DU_MORCEAU + p * 128 + octet(jeu, MORCEAU_DU_CANAL + 16 * p + meilleur) * 16
          + octet(jeu, CANAL_LOGIQUE + 16 * p + meilleur);
        poserOctet(jeu, ancien, 0xFF);
        poserOctet(jeu, CANAL_LOGIQUE + 16 * p + meilleur, canal);
        poserOctet(jeu, MORCEAU_DU_CANAL + 16 * p + meilleur, morceau);
        traduit = meilleur;
        poserOctet(jeu, PRIORITE_DU_CANAL + 16 * p + meilleur, octet(jeu, prioriteDuMorceau()));
        poserOctet(jeu, VOLUME_DU_CANAL + 16 * p + traduit, 0x7F);
        envoyerMessage(jeu, 0x86A83, p, traduit | 0xB0, NOTES_ETEINTES, 0);
        envoyerMessage(jeu, 0x86AC1, p, traduit | 0xB0, RESET_CONTROLEURS, 0);
        if (octet(jeu, emplacementDuCanal) === 0xFF) prendreUnEmplacement();
        continue;
      }
      if (octet(jeu, emplacementDuCanal) === 0xFF) prendreUnEmplacement();
      break;
    }

    // l'état du canal, gardé
    if (canal === 9) {
      if (statut === 0xB9 && octet(jeu, message + 1) === VOLUME) volume = octet(jeu, message + 2);
      poserOctet(jeu, VOLUME_DU_CANAL + 16 * p + 9, volume);
    } else {
      const genre = statut & 0xF0;
      const garde = (champ, v) => poserOctet(jeu, etat(octet(jeu, emplacementDuCanal), champ), v);
      if (genre === 0xB0) {
        const controleur = octet(jeu, message + 1);
        if (controleur === VOLUME) {
          garde(E_VOLUME, octet(jeu, message + 2));
          volume = octet(jeu, message + 2);
          poserOctet(jeu, VOLUME_DU_CANAL + 16 * p + traduit, volume);
        } else if (controleur === PEDALE) {
          garde(E_PEDALE, octet(jeu, message + 2));
        }
      } else if (genre === 0xC0) {
        garde(E_PROGRAMME, octet(jeu, message + 1));
      } else if (genre === 0xE0) {
        garde(E_COURBURE, octet(jeu, message + 2));
      }
    }
    if (traduit === 0xFF) return -1;
    if (volume !== -1) poserOctet(jeu, message + 2, Math.imul(octet(jeu, VOLUME_GENERAL), volume) >>> 7);
    envoyer(jeu, 0x86DE5, p, off, sel & 0xFFFF, longueur, { eax: p * TAILLE_TABLE_MIDI, edx: sel & 0xFFFF });
    poserOctet(jeu, message, canal | (statut & 0xF0));
    if (volume !== -1) poserOctet(jeu, message + 2, volume);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x86E23 — faire taire un morceau (appelée à son arrêt, 0x7FC8D, et par le séquenceur à sa fin) :
// pour chaque piste confiée à un pilote, sur son canal, notes éteintes, contrôleurs remis,
// courbure au centre (0x40 0x40), volume nul. Avec vol de canaux, c'est le canal du pilote qui la
// jouait, rendu libre, et l'état gardé est oublié. Rend 1.
function faireTaireLeMorceau(jeu, morceau) {
  const cadre = ouvrirCadre(jeu, 4, 0x1C);
  try {
    let piste = 0;
    for (; piste < long(jeu, NOMBRE_DE_PISTES + 4 * morceau); piste++) {
      const p = longSigne(jeu, pointeurLointain(jeu, PILOTE_DES_PISTES + 6 * morceau) + 4 * piste);
      poserLocales(jeu, cadre, [[0x10, p]]);
      if (p === -1 || p === 0xFF) continue;
      const canal = octet(jeu, pointeurLointain(jeu, PISTE + 0xC0 * morceau + 6 * piste) + CANAL_DE_LA_PISTE);
      poserLocales(jeu, cadre, [[8, canal, 1], [0x18, 3]]);
      const ecx = { ecx: 4 * piste };       // ce qu'ecx garde de l'original : la piste × 4
      if (long(jeu, VOL_DE_CANAUX) === 0) {
        envoyerMessage(jeu, 0x86EF4, p, canal | 0xB0, NOTES_ETEINTES, 0, 3, ecx);
        envoyerMessage(jeu, 0x86F32, p, canal | 0xB0, RESET_CONTROLEURS, 0, 3, ecx);
        envoyerMessage(jeu, 0x86F70, p, canal | 0xE0, 0x40, 0x40, 3, ecx);
        envoyerMessage(jeu, 0x86FAE, p, canal | 0xB0, VOLUME, 0, 3, ecx);
        continue;
      }
      const ligne = p * 128 + morceau * 16 + canal;
      const traduit = octet(jeu, CANAL_DU_MORCEAU + ligne);
      poserOctet(jeu, CANAL_DU_MORCEAU + ligne, 0xFF);
      const k = octet(jeu, EMPLACEMENT_DU_CANAL + ligne);
      poserLocales(jeu, cadre, [[0xC, traduit, 1], [4, k, 1]]);
      poserOctet(jeu, CANAL_LOGIQUE + 16 * p + traduit, 0xFF);
      poserOctet(jeu, MORCEAU_DU_CANAL + 16 * p + traduit, 0xFF);
      envoyerMessage(jeu, 0x8706C, p, traduit | 0xB0, NOTES_ETEINTES, 0, 3, ecx);
      envoyerMessage(jeu, 0x870AA, p, traduit | 0xB0, RESET_CONTROLEURS, 0, 3, ecx);
      envoyerMessage(jeu, 0x870E8, p, traduit | 0xE0, 0x40, 0x40, 3, ecx);
      envoyerMessage(jeu, 0x87126, p, traduit | 0xB0, VOLUME, 0, 3, ecx);
      if (k === 0xFF) continue;
      const etat = ETAT_SAUVE + p * 0x140 + canal * 0x14 + k * 5;
      for (const champ of [E_PROGRAMME, E_COURBURE, E_VOLUME, E_PEDALE, E_PRIS]) poserOctet(jeu, etat + champ, 0xFF);
      poserOctet(jeu, EMPLACEMENT_DU_CANAL + ligne, 0xFF);
    }
    poserLocales(jeu, cadre, [[0x14, piste], [0x1C, 1]]);
    return 1;
  } finally { cadre.fermer(); }
}

// === 5. LES BANQUES DE BULLFROG =======================================================================

const FORMATER = 0x7F652;                 // sprintf
const CHARGER_LA_RESSOURCE = 0x8B980;     // (descripteur) : 1 si chargée
const RENDRE_LA_RESSOURCE = 0x8BAB0;      // (descripteur)
const MUSIQUE_INITIALISEE = 0xBA714, BRUITAGES_INITIALISES = 0xBA720;
const QUALITE_DE_LA_MUSIQUE = 0xD7995;    // octet : 0 FM, 1 MT-32, 2 General MIDI (§ 9.1)
const QUALITE_DES_BRUITAGES = 0xBA727;    // octet : 0 à 2 (§ 9.1)
// Les descripteurs de ressource (le nom en tête) et leurs gabarits.
const MUSIQUE_DAT = 0xBEDF4, MUSIQUE_TAB = 0xBEE20;
const GABARIT_MUSIQUE_DAT = 0xB0798, GABARIT_MUSIQUE_TAB = 0xB07AC;   // data/music%d-%d.dat, .tab
const BRUITAGES_DAT = 0xBEE78, BRUITAGES_TAB = 0xBEEA4;
const GABARIT_BRUITAGES_DAT = 0xB07C0, GABARIT_BRUITAGES_TAB = 0xB07D4; // data/snds%d-%d.dat, .tab
// Les tables chargées : entrées de 32 octets (la première ne sert pas), le pointeur des données en
// +0x12, relatif au début du fichier .dat tant qu'on ne l'a pas relogé.
const TABLE_DES_MORCEAUX = 0xD790C, FIN_DES_MORCEAUX = 0xD7908, DONNEES_DES_MORCEAUX = 0xD797C;
const NOMBRE_DE_MORCEAUX = 0xBA71D;
const TABLE_DES_BRUITAGES = 0xD7B60, FIN_DES_BRUITAGES = 0xD7B50, DONNEES_DES_BRUITAGES = 0xD7B3C;
const NOMBRE_DE_BRUITAGES = 0xD7B68;
const TAILLE_ENTREE = 0x20, E_DONNEES = 0x12;

// Charger une banque : ses deux fichiers nommés d'après la banque et la qualité, la table relogée.
// Rend 0, ou 1 si l'un manque (le .dat chargé est alors rendu).
function chargerUneBanque(jeu, dat, tab, gabaritDat, gabaritTab, banque, qualite, reloger) {
  jeu.appeler(FORMATER, dat, gabaritDat, banque, qualite);
  jeu.appeler(FORMATER, tab, gabaritTab, banque, qualite);
  if ((jeu.appeler(CHARGER_LA_RESSOURCE, dat) & 0xFFFF) !== 1) return 1;
  if ((jeu.appeler(CHARGER_LA_RESSOURCE, tab) & 0xFFFF) === 1) {
    reloger();
    return 0;
  }
  jeu.appeler(RENDRE_LA_RESSOURCE, dat);
  return 1;
}

// 0x83420 — charger la banque de musique `banque` (mot), dans la qualité de la carte.
function chargerLaBanqueDeMusique(jeu, banque) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    if (octet(jeu, MUSIQUE_INITIALISEE) === 0) return 1;
    return chargerUneBanque(jeu, MUSIQUE_DAT, MUSIQUE_TAB, GABARIT_MUSIQUE_DAT, GABARIT_MUSIQUE_TAB,
      banque & 0xFFFF, octet(jeu, QUALITE_DE_LA_MUSIQUE), () => jeu.appeler(0x834D4));
  } finally { cadre.fermer(); }
}

// 0x83540 — charger la banque de bruitages `banque` (octet), dans la qualité choisie.
function chargerLaBanqueDeBruitages(jeu, banque) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    if (octet(jeu, BRUITAGES_INITIALISES) === 0) return 1;
    return chargerUneBanque(jeu, BRUITAGES_DAT, BRUITAGES_TAB, GABARIT_BRUITAGES_DAT, GABARIT_BRUITAGES_TAB,
      banque & 0xFF, octet(jeu, QUALITE_DES_BRUITAGES), () => jeu.appeler(0x83608));
  } finally { cadre.fermer(); }
}

// Reloger une table : chaque entrée après la première reçoit l'adresse du .dat chargé, et on compte.
function relogerUneTable(jeu, table, fin, donnees, nombre) {
  if (long(jeu, table) === 0 || long(jeu, donnees) === 0) return;
  let entree = long(jeu, table) + TAILLE_ENTREE;
  poserMot(jeu, nombre, 0);
  while (entree < long(jeu, fin)) {
    poserLong(jeu, entree + E_DONNEES, long(jeu, entree + E_DONNEES) + long(jeu, donnees));
    entree += TAILLE_ENTREE;
    poserMot(jeu, nombre, mot(jeu, nombre) + 1);
  }
}
// 0x834D4 — la table des morceaux, relogée ; leur nombre en 0xBA71D.
const relogerLesMorceaux = (jeu) =>
  relogerUneTable(jeu, TABLE_DES_MORCEAUX, FIN_DES_MORCEAUX, DONNEES_DES_MORCEAUX, NOMBRE_DE_MORCEAUX);
// 0x83608 — la table des bruitages, relogée ; leur nombre en 0xD7B68.
const relogerLesBruitages = (jeu) =>
  relogerUneTable(jeu, TABLE_DES_BRUITAGES, FIN_DES_BRUITAGES, DONNEES_DES_BRUITAGES, NOMBRE_DE_BRUITAGES);

// 0x83670 — lire `n` octets (poignée, destination, n) : d'un fichier (0x7EBE0), ou, si une séquence
// animée est lue depuis la mémoire ([0xBEEFC]), de là, sans dépasser sa fin. Rend ce qui a été lu.
// Anomalie : la position avance de `n` même si la fin a arrêté la copie.
const LECTURE_EN_MEMOIRE = 0xBEEFC;       // dword : vrai si l'on lit en mémoire
const CURSEUR_DE_LECTURE = 0xBEF00;       // l'adresse de la prochaine lecture
const FIN_DE_LECTURE = 0xBEF04;           // la taille des données
const POSITION_DE_LECTURE = 0xBEF08;      // ce qui en a été consommé
const LIRE = 0x7EBE0;
function lireUneSequence(jeu, poignee, destination, n) {
  const cadre = ouvrirCadre(jeu, 4, 8);
  try {
    if (long(jeu, LECTURE_EN_MEMOIRE) === 0) return jeu.appeler(LIRE, poignee, destination, n);
    let lus = 0;
    while (lus < n && ((lus + long(jeu, POSITION_DE_LECTURE)) >>> 0) < long(jeu, FIN_DE_LECTURE)) {
      const source = long(jeu, CURSEUR_DE_LECTURE);
      poserLong(jeu, CURSEUR_DE_LECTURE, source + 1);
      poserOctet(jeu, destination + lus, octet(jeu, source));
      lus++;
    }
    poserLong(jeu, POSITION_DE_LECTURE, long(jeu, POSITION_DE_LECTURE) + n);
    return lus;
  } finally { cadre.fermer(); }
}

// 0x83700 — lire un film d'avance (la commande L du script sonore, son-du-jeu.js) : `n` octets du
// fichier dans le tampon de la lecture en mémoire ([0xBEEFC]), que 0x83670 lira ensuite depuis le
// début. Le tampon passé en argument ne sert pas : c'est [0xBEEFC] qui est rempli (son-du-jeu.js
// n'appelle cette fonction que s'il existe, et le lui passe). Rend ce qui a été lu. Aucun film du CD
// n'emploie la commande L.
const LIRE_UN_FICHIER = 0x876B7;          // 'read'(descripteur, tampon, n) (runtime.js)
function lireUnFilmDAvance(jeu, fichier, _tampon, n) {
  const cadre = ouvrirCadre(jeu, 4, 8);
  try {
    const lus = appelerDepuis(jeu, 0x8371F, LIRE_UN_FICHIER, [fichier, long(jeu, LECTURE_EN_MEMOIRE), n]) | 0;
    poserLong(jeu, CURSEUR_DE_LECTURE, long(jeu, LECTURE_EN_MEMOIRE));
    poserLong(jeu, FIN_DE_LECTURE, lus);
    poserLong(jeu, POSITION_DE_LECTURE, 0);
    poserLocales(jeu, cadre, [[4, lus], [8, lus]]);
    return lus;
  } finally { cadre.fermer(); }
}

// === 6. SSCANF ========================================================================================
// La bibliothèque C de Watcom : sscanf lit dans une chaîne par le moteur de scanf (0x8AD11), à qui
// l'on passe une petite structure de lecture : +0 lire un caractère (0x8334A), +4 le rendre
// (0x8336C), +8 la position dans la chaîne, +0x10 des drapeaux (bit 1 : fin de chaîne atteinte) ;
// +0xC et +0x10 ne sont pas initialisés (le moteur efface lui-même le bit 1).
const MOTEUR_DE_SCANF = 0x8AD11;
const S_LIRE = 0, S_RENDRE = 4, S_POSITION = 8, S_DRAPEAUX = 0x10;
const FIN_DE_CHAINE = 2;

// 0x8334A — lire un caractère de la chaîne : l'octet suivant, ou −1 (et le drapeau) à la fin.
function lireUnCaractere(jeu, lecture) {
  const position = long(jeu, lecture + S_POSITION);
  const c = octet(jeu, position);
  if (c !== 0) {
    poserLong(jeu, lecture + S_POSITION, position + 1);
    return c;
  }
  poserOctet(jeu, lecture + S_DRAPEAUX, octet(jeu, lecture + S_DRAPEAUX) | FIN_DE_CHAINE);
  return -1;
}

// 0x8336C — rendre le dernier caractère (c, lecture) : la position recule. Rend la structure.
function rendreUnCaractere(jeu, c, lecture) {
  poserLong(jeu, lecture + S_POSITION, long(jeu, lecture + S_POSITION) - 1);
  return lecture;
}

// 0x83377 — vsscanf(chaîne, format, arguments).
function vsscanf(jeu, chaine, format, argumentsVariables) {
  const cadre = ouvrirCadre(jeu, 1, 0x14);
  try {
    const lecture = cadre.local(0x14);
    poserLong(jeu, lecture + S_LIRE, 0x8334A);
    poserLong(jeu, lecture + S_POSITION, chaine);
    poserLong(jeu, lecture + S_RENDRE, 0x8336C);
    return jeu.appeler(MOTEUR_DE_SCANF, lecture, format, argumentsVariables);
  } finally { cadre.fermer(); }
}

// 0x833A5 — sscanf(chaîne, format, ...) : la liste des arguments commence juste après le format,
// dans la pile de l'appelant.
function sscanf(jeu, chaine, format) {
  const cadre = ouvrirCadre(jeu, 1, 4);
  try {
    const liste = cadre.local(4);
    poserLong(jeu, liste, cadre.ebp + 0x10);
    return jeu.appeler(0x83377, chaine, format, liste);
  } finally { cadre.fermer(); }
}

// --- les listes -------------------------------------------------------------------------------------
// `memoire: 'entiere'` pour les installations et les chargements (un appel ou deux par partie, qui
// écrivent dans le tas : banques, pilotes, tampon DMA) ; `zones` pour ce qui écrit dans le tas à
// un endroit connu.
// === 7. LA FIN =========================================================================================
//
// En quittant avec la carte son (0x7EED0 et 0x7EF60, sortie.js), chaque installation est défaite :
// les pilotes de musique et le pilote numérique, la minuterie rendue au BIOS, les deux systèmes
// fermés (leur mémoire « déverrouillée »), les ressources des banques rendues. Exercé par le
// scénario quitter rejoué avec --son.
//
// ANOMALIES D'ORIGINE, reproduites : le déverrouillage redemande un verrouillage (0x8BB6E,
// sos-bruitages.js) ; le vecteur de l'IRQ 0 n'est pas rendu (0x8A509, idem) ; les blocs des pilotes
// chargés et du module de mélange ne sont pas rendus, seulement oubliés (0x8CE87, 0x8EFA2, 0x8F1AE),
// comme le tampon DMA que SOS avait pris (0x853CA).

const RENDRE_LA_MINUTERIE = 0x8A509;
const DEVERROUILLER = 0x8BB6E;
const DEVERROUILLER_LA_MUSIQUE = 0x83B94, DEVERROUILLER_LES_BRUITAGES = 0x84A4D;
const OUBLIER_UN_PILOTE_DE_MUSIQUE = 0x8CE87;
const ARRETER_LE_DMA = 0x8BD59, FINIR_LE_MODULE = 0x8BE2C, TRADUCTION_DU_DMA = 0x8BFB8;
const OUBLIER_LE_MELANGEUR = 0x8F1AE;
const ID_DU_PILOTE_NUMERIQUE = 0xC32E2;   // 5 × 4 : l'identifiant du pilote (celui que lit son.js)
const TEXTES_D_ERREUR = 0xBEF0C;          // la table des textes des erreurs de SOS
const F_FINIR = 0x0C;                     // la fonction de fin d'un pilote de musique, dans sa table
const TAILLE_D_UNE_RESSOURCE = 0x2C;

// Les mêmes plages que les verrouillages, « déverrouillées » dans le même ordre.
function deverrouillerTout(jeu, verrous) {
  const cadre = ouvrirCadre(jeu, 4, 0);
  try {
    for (const [debut, taille] of verrous) jeu.appeler(DEVERROUILLER, debut, taille);
  } finally { cadre.fermer(); }
}

// 0x822C1 — sosTIMERUnInitSystem(0) : si SOS a pris l'IRQ 0, la rendre (0x8A509), l'IRQ 0 masquée
// le temps de le faire. Rend 0.
function fermerLaMinuterie(jeu) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    if (octet(jeu, IRQ0_PRISE) !== 0) {
      appelerDepuis(jeu, 0x822DB, MASQUER_L_IRQ0);
      appelerDepuis(jeu, 0x822E0, RENDRE_LA_MINUTERIE);
      appelerDepuis(jeu, 0x822E5, DEMASQUER_L_IRQ0);
    }
    poserLocales(jeu, cadre, [[4, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x84162 — sosMIDIUnInitSystem() : la mémoire de la musique « déverrouillée », le système fermé.
function fermerLaMusique(jeu) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    appelerDepuis(jeu, 0x84173, DEVERROUILLER_LA_MUSIQUE);
    poserLong(jeu, SYSTEME_MIDI_PRET, 0);
    poserLocales(jeu, cadre, [[4, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x84C6E — sosDIGIUnInitSystem() : la mémoire des bruitages « déverrouillée », le système fermé.
function fermerLesBruitages(jeu) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    appelerDepuis(jeu, 0x84C7F, DEVERROUILLER_LES_BRUITAGES);
    poserLong(jeu, SYSTEME_NUMERIQUE_PRET, 0);
    poserLocales(jeu, cadre, [[4, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x84639 — sosMIDIUnInitDriver(poignée, complet) : la fonction de fin du pilote (F_FINIR de sa
// table) appelée avec le pointeur nul et deux fois 0xC2D24 ; puis, si `complet`, une seconde fois,
// avec la poignée, pour un pilote compilé dans le programme, ou le pilote chargé depuis
// HMIMDRV.386 oublié (0x8CE87). La poignée est rendue. Rend 0, ou 1 si le pilote n'est pas actif.
function defaireUnPiloteDeMusique(jeu, p, complet) {
  const cadre = ouvrirCadre(jeu, 4, 0x10);
  try {
    if (long(jeu, PILOTE_MIDI_ACTIF + 4 * p) === 0) {
      poserLocales(jeu, cadre, [[4, 1]]);
      return 1;
    }
    const f = TABLE_DU_PILOTE_MIDI + TAILLE_TABLE_MIDI * p + F_FINIR;
    const finir = (retour, troisieme) => appelLointain(jeu, retour, long(jeu, f), mot(jeu, f + 4),
      long(jeu, NUL_LOINTAIN), mot(jeu, NUL_LOINTAIN + 4), troisieme, long(jeu, PARAMETRE_C2D24));
    finir(0x84684, long(jeu, PARAMETRE_C2D24));
    if (complet !== 0) {
      const id = long(jeu, PILOTES_MIDI + 4 * p);
      poserLocales(jeu, cadre, [[0x10, id]]);
      if (PILOTES_COMPILES.has(id)) finir(0x846F4, p);
      else appelerDepuis(jeu, 0x84701, OUBLIER_UN_PILOTE_DE_MUSIQUE, [p]);
    }
    poserMot(jeu, PILOTE_CHARGE + 6 * p + 4, 0);
    poserLong(jeu, PILOTE_CHARGE + 6 * p, 0);
    poserLong(jeu, PILOTES_MIDI + 4 * p, 0);
    poserLong(jeu, PILOTE_MIDI_ACTIF + 4 * p, 0);
    poserLocales(jeu, cadre, [[4, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x8CE87 — oublier un pilote de musique chargé depuis HMIMDRV.386 : 0xA si la poignée dépasse 5 ou
// n'est pas active ; sinon, elle ne l'est plus (son bloc n'est pas rendu). Rend 0.
function oublierUnPiloteDeMusique(jeu, p) {
  const cadre = ouvrirCadre(jeu, 4, 0xC);
  try {
    if ((p >>> 0) > 5 || long(jeu, PILOTE_MIDI_ACTIF + 4 * p) === 0) {
      poserLocales(jeu, cadre, [[4, 0xA]]);
      return 0xA;
    }
    poserLong(jeu, PILOTE_MIDI_ACTIF + 4 * p, 0);
    poserMot(jeu, cadre.local(8), mot(jeu, PILOTE_CHARGE + 6 * p + 4));
    poserLocales(jeu, cadre, [[0xC, long(jeu, PILOTE_CHARGE + 6 * p)], [4, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x853CA — sosDIGIUnInitDriver(poignée, arrêter, oublier) : le pilote numérique défait. Il n'est
// plus prêt ; avec `arrêter`, le tampon DMA que SOS avait pris est oublié (pas rendu) ; le module
// arrête son DMA (fonction 5) et finit (fonction 1) ; Windows retrouve la traduction du DMA
// (0x8BFB8) ; avec `oublier`, le pilote matériel et le module de mélange sont oubliés (0x8EFA2,
// 0x8F1AE). Ses pointeurs et sa poignée sont effacés. Rend 0, ou 1 si le pilote n'est pas installé.
function defaireUnPiloteNumerique(jeu, p, arreter, oublier) {
  const cadre = ouvrirCadre(jeu, 4, 0x18);
  try {
    if (long(jeu, DRAPEAU_C324C + 4 * p) === 0) {
      poserLocales(jeu, cadre, [[8, 1]]);
      return 1;
    }
    poserLong(jeu, DRAPEAU_C3274 + 4 * p, 0);
    if (long(jeu, ID_DU_PILOTE_NUMERIQUE + 4 * p) < PREMIER_PILOTE_SANS_TAMPON
      && long(jeu, TAMPON_ALLOUE + 4 * p) !== 0 && arreter !== 0) {
      poserMot(jeu, cadre.local(0xC), mot(jeu, TAMPON_DMA + 6 * p + 4));
      poserLong(jeu, cadre.local(0x10), long(jeu, TAMPON_DMA + 6 * p));
      poserLong(jeu, TAMPON_ALLOUE + 4 * p, 0);
    }
    const selecteur = mot(jeu, PILOTE_MATERIEL + 6 * p + 4), decalage = long(jeu, PILOTE_MATERIEL + 6 * p);
    const module = long(jeu, ADRESSE_DU_PILOTE + 4 * p);
    poserMot(jeu, cadre.local(0x14), selecteur);
    poserLong(jeu, cadre.local(0x18), decalage);
    poserLong(jeu, cadre.local(4), module);
    appelerDepuis(jeu, 0x85489, ARRETER_LE_DMA, [module, decalage, selecteur]);
    appelerDepuis(jeu, 0x8549C, FINIR_LE_MODULE, [module, decalage, selecteur]);
    appelerDepuis(jeu, 0x854AF, TRADUCTION_DU_DMA, [octet(jeu, MATERIEL_C33B0 + p)]);
    if (oublier !== 0) {
      appelerDepuis(jeu, 0x854C0, OUBLIER_LE_PILOTE, [p]);
      appelerDepuis(jeu, 0x854DA, OUBLIER_LE_MELANGEUR, [long(jeu, MELANGEUR + 6 * p), mot(jeu, MELANGEUR + 6 * p + 4)]);
    }
    for (const table of [PILOTE_MATERIEL, REMPLISSAGE, MELANGEUR]) {
      poserMot(jeu, table + 6 * p + 4, 0);
      poserLong(jeu, table + 6 * p, 0);
    }
    poserLong(jeu, PILOTES_NUMERIQUES + 4 * p, 0);
    poserLong(jeu, DRAPEAU_C324C + 4 * p, 0);
    poserLocales(jeu, cadre, [[8, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x8EFA2 — oublier le pilote matériel chargé depuis HMIDRV.386 : 0xA si la poignée dépasse 5 ou
// n'est pas installée ; sinon, elle ne l'est plus (son bloc n'est pas rendu). Rend 0.
function oublierLePiloteNumerique(jeu, p) {
  const cadre = ouvrirCadre(jeu, 4, 0xC);
  try {
    if ((p >>> 0) > 5 || long(jeu, DRAPEAU_C324C + 4 * p) === 0) {
      poserLocales(jeu, cadre, [[4, 0xA]]);
      return 0xA;
    }
    poserLong(jeu, DRAPEAU_C324C + 4 * p, 0);
    poserMot(jeu, cadre.local(8), mot(jeu, PILOTE_MATERIEL + 6 * p + 4));
    poserLocales(jeu, cadre, [[0xC, long(jeu, PILOTE_MATERIEL + 6 * p)], [4, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x8F1AE — oublier le module de mélange (pointeur lointain) : 2 s'il est nul, 0 sinon (son bloc
// n'est pas rendu).
function oublierLeMelangeur(jeu, decalage, selecteur) {
  const cadre = ouvrirCadre(jeu, 4, 0xC);
  try {
    if (decalage === 0 && (selecteur & 0xFFFF) === 0) {
      poserLocales(jeu, cadre, [[4, 2]]);
      return 2;
    }
    poserMot(jeu, cadre.local(8), selecteur);
    poserLocales(jeu, cadre, [[0xC, decalage], [4, 0]]);
    return 0;
  } finally { cadre.fermer(); }
}

// 0x84843 — sosGetErrorString(code) : le texte d'une erreur de SOS (sa table, 0xBEF0C).
function texteDUneErreur(jeu, code) {
  const cadre = ouvrirCadre(jeu, 4, 4);
  try {
    const texte = long(jeu, TEXTES_D_ERREUR + 4 * code);
    poserLocales(jeu, cadre, [[4, texte]]);
    return texte;
  } finally { cadre.fermer(); }
}

// 0x86120 — rendre les ressources d'une liste (entrées de 0x2C octets, jusqu'à la première dont
// +0x1C est nul) : 0x8BAB0 pour chacune. L'original avance dans son argument même.
function rendreLesRessources(jeu, liste) {
  const cadre = ouvrirCadre(jeu, 4, 0);
  try {
    const argument = cadre.ebp + 0x14;
    let e = liste >>> 0;
    while (long(jeu, e + 0x1C) !== 0) {
      appelerDepuis(jeu, 0x8613E, RENDRE_LA_RESSOURCE, [e]);
      e = (e + TAILLE_D_UNE_RESSOURCE) >>> 0;
      poserLong(jeu, argument, e);
    }
  } finally { cadre.fermer(); }
}

export const reecritures = [
  // 1. la minuterie
  { adresse: 0x821FC, nom: 'initialiserLaMinuterie', fn: initialiserLaMinuterie, arguments: 2, retour: true },
  { adresse: 0x822F4, nom: 'inscrireUnEvenement', fn: inscrireUnEvenement, arguments: 5, retour: true },
  { adresse: 0x8260A, nom: 'retirerUnEvenement', fn: retirerUnEvenement, arguments: 1, retour: true },
  { adresse: 0x827DC, nom: 'reglerLaMinuterie', fn: reglerLaMinuterie, arguments: 1, retour: true },
  { adresse: 0x82496, nom: 'changerLaFrequence', fn: changerLaFrequence, arguments: 2, retour: true },
  { adresse: 0x827B9, nom: 'frequenceDUnEvenement', fn: frequenceDUnEvenement, arguments: 1, retour: true },
  { adresse: 0x8280A, nom: 'evenementsDeLaMinuterie', fn: (jeu) => evenementsDeLaMinuterie(jeu),
    convention: 'registres', nettoie: 4, registresCompares: [] },
  // 2. les installations
  { adresse: 0x83762, nom: 'verrouillerLaMusique', fn: (jeu) => verrouillerTout(jeu, VERROUS_DE_LA_MUSIQUE) },
  { adresse: 0x84888, nom: 'verrouillerLesBruitages', fn: (jeu) => verrouillerTout(jeu, VERROUS_DES_BRUITAGES) },
  { adresse: 0x83FC6, nom: 'initialiserLaMusique', fn: initialiserLaMusique, arguments: 2, retour: true },
  { adresse: 0x8418C, nom: 'installerUnPiloteDeMusique', fn: installerUnPiloteDeMusique, arguments: 7, retour: true,
    memoire: 'entiere' },
  { adresse: 0x8564A, nom: 'donnerLesInstruments', fn: donnerLesInstruments, arguments: 4, retour: true,
    memoire: 'entiere' },
  { adresse: 0x84C12, nom: 'initialiserLesBruitages', fn: initialiserLesBruitages, arguments: 2, retour: true },
  { adresse: 0x84C98, nom: 'installerUnPiloteNumerique', fn: installerUnPiloteNumerique, arguments: 7, retour: true,
    memoire: 'entiere' },
  { adresse: 0x85551, nom: 'prendreUnTamponDma', fn: prendreUnTamponDma, arguments: 2, retour: true,
    memoire: 'entiere', registresCompares: ['eax', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'] },
  // 3. et 4. le pilote de musique, le séquenceur
  { adresse: 0x8474A, nom: 'remettreUnPiloteDeMusique', fn: remettreLePilote, arguments: 1, retour: true },
  { adresse: 0x82174, nom: 'morceauFini', fn: morceauFini, arguments: 1, retour: true },
  { adresse: 0x863E5, nom: 'envoyerUnMessageDuMorceau', fn: envoyerUnMessageDuMorceau, arguments: 5, retour: true,
    zones: (jeu, morceau, off, sel) => { const a = lineaire(jeu, off, sel); return [[a, a + 3]]; } },
  { adresse: 0x86E23, nom: 'faireTaireLeMorceau', fn: faireTaireLeMorceau, arguments: 1, retour: true },
  // 5. les banques de Bullfrog
  { adresse: 0x83420, nom: 'chargerLaBanqueDeMusique', fn: chargerLaBanqueDeMusique, arguments: 1, retour: true,
    memoire: 'entiere' },
  { adresse: 0x83540, nom: 'chargerLaBanqueDeBruitages', fn: chargerLaBanqueDeBruitages, arguments: 1, retour: true,
    memoire: 'entiere' },
  { adresse: 0x834D4, nom: 'relogerLesMorceaux', fn: relogerLesMorceaux,
    zones: (jeu) => [[long(jeu, TABLE_DES_MORCEAUX), long(jeu, FIN_DES_MORCEAUX)]] },
  { adresse: 0x83608, nom: 'relogerLesBruitages', fn: relogerLesBruitages,
    zones: (jeu) => [[long(jeu, TABLE_DES_BRUITAGES), long(jeu, FIN_DES_BRUITAGES)]] },
  { adresse: 0x83670, nom: 'lireUneSequence', fn: lireUneSequence, arguments: 3, retour: true,
    zones: (jeu, poignee, destination, n) => [[destination, destination + n]] },
  // 6. sscanf
  { adresse: 0x833A5, nom: 'sscanf', fn: sscanf, arguments: 2, retour: true },
  { adresse: 0x83377, nom: 'vsscanf', fn: vsscanf, arguments: 3, retour: true },
  { adresse: 0x8334A, nom: 'lireUnCaractere', fn: lireUnCaractere, arguments: 1, retour: true },
  { adresse: 0x8336C, nom: 'rendreUnCaractere', fn: rendreUnCaractere, arguments: 2, retour: true },
  // 7. la fin
  { adresse: 0x822C1, nom: 'fermerLaMinuterie', fn: fermerLaMinuterie, arguments: 1, retour: true },
  { adresse: 0x84162, nom: 'fermerLaMusique', fn: fermerLaMusique, arguments: 0, retour: true },
  { adresse: 0x84C6E, nom: 'fermerLesBruitages', fn: fermerLesBruitages, arguments: 0, retour: true },
  { adresse: 0x83B94, nom: 'deverrouillerLaMusique', fn: (jeu) => deverrouillerTout(jeu, VERROUS_DE_LA_MUSIQUE) },
  { adresse: 0x84A4D, nom: 'deverrouillerLesBruitages', fn: (jeu) => deverrouillerTout(jeu, VERROUS_DES_BRUITAGES) },
  { adresse: 0x84639, nom: 'defaireUnPiloteDeMusique', fn: defaireUnPiloteDeMusique, arguments: 2, retour: true,
    memoire: 'entiere' },
  { adresse: 0x853CA, nom: 'defaireUnPiloteNumerique', fn: defaireUnPiloteNumerique, arguments: 3, retour: true,
    memoire: 'entiere' },
  { adresse: 0x8EFA2, nom: 'oublierLePiloteNumerique', fn: oublierLePiloteNumerique, arguments: 1, retour: true },
  { adresse: 0x8F1AE, nom: 'oublierLeMelangeur', fn: oublierLeMelangeur, arguments: 2, retour: true },
  { adresse: 0x86120, nom: 'rendreLesRessourcesDesBanques', fn: rendreLesRessources, arguments: 1, memoire: 'entiere' },
];

export const enAttente = [
  // Aucun film du CD n'emploie la commande L (son-du-jeu.js).
  { adresse: 0x83700, nom: 'lireUnFilmDAvance', fn: lireUnFilmDAvance, arguments: 3, retour: true, memoire: 'entiere' },
  // Jamais atteintes par les scénarios : un pilote de musique chargé depuis HMIMDRV.386 (l'hôte ne
  // déclare que la puce FM), et le texte d'une erreur de SOS.
  { adresse: 0x8CE87, nom: 'oublierUnPiloteDeMusique', fn: oublierUnPiloteDeMusique, arguments: 1, retour: true },
  { adresse: 0x84843, nom: 'texteDUneErreur', fn: texteDUneErreur, arguments: 1, retour: true },
  // L'événement 15 : saute à l'ancien gestionnaire de l'IRQ 0 sans revenir (voir l'en-tête).
  { adresse: 0x828C4, nom: 'chainerAuBios', fn: (jeu) => chainerAuBios(jeu), convention: 'registres', nettoie: 4 },
];
