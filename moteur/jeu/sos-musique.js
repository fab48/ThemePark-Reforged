// Le pilote FM de la bibliothèque HMI SOS, et le chargement des modules de HMIDRV.386.
//
// Réécriture lisible de trente routines de SOS, liées dans MAIN.EXE, que le jeu n'atteint
// qu'avec une carte son. Voir docs/guide-reecriture.md ; docs/retro-ingenierie.md § 9.4 et § 9.5.
//
// LE PILOTE FM (0xA002). Pour les cartes à puce FM (AdLib, Sound Blaster et leurs cousines), SOS
// n'a pas besoin de module extérieur : le pilote est compilé dans le programme. sosMIDIInitSystem
// (0x83FC6) range sa table en 0xE0C26, cinq pointeurs lointains, que SOS appelle par `call far`
// (0x87202 pour les messages) :
//
//   0  0x8E485  envoyer un message MIDI (le « SendData » des pilotes MIDI de SOS)
//   1  0x8E4B4  installer le pilote : port de la puce, voix éteintes (« Init »)
//   2  0x8E4EF  le défaire (« UnInit »)
//   3  0x8E50D  tout remettre à zéro (« Reset »)
//   4  0x8E52B  recevoir une banque d'instruments (sosMIDISetInsData, 0x8564A)
//
// Les noms entre guillemets sont ceux que l'on prête aux fonctions d'un pilote MIDI de SOS : ils sont
// reconnus à la place de chaque routine dans la table, pas lus dans le programme.
//
// LA PUCE (Yamaha OPL2, ou OPL3 dont seul le premier banc sert). Neuf voix de deux opérateurs ;
// chaque opérateur a un décalage de registre (table 0xC47FD, par couples : premier opérateur, second
// opérateur de chaque voix). 0x8EBD8 écrit un registre : l'index sur le port de base, six lectures
// du port suivant pour laisser la puce le prendre, la donnée sur ce port, trente-cinq lectures du
// port de base. Le pilote tient une copie de ce qu'il écrit :
//
//   0xC478C[op]  registre 0x40 (niveau de sortie, KSL)      0xC47AC[op]  registre 0x80 (maintien, relâchement)
//   0xC47BC[v]   registre 0xA0 (fréquence, octet bas)       0xC47C5[v]   registre 0xB0 (fréquence haute,
//   0xC47E0      registre 0xBD (percussions, profondeurs)                octave, bit 0x20 : la note sonne)
//
// L'ÉTAT MIDI. Seize canaux, neuf voix. Par canal (mots longs) : 0xC4850 le programme (l'instrument),
// 0xC48B4 la courbure de hauteur (octet fort, 0x40 au centre), 0xC48F4 vrai si le canal a été courbé,
// 0xC4934 le contrôleur 102 (2 par défaut ; non établi : l'amplitude de la courbure,
// vraisemblablement), 0xC4978 le volume (contrôleur 7), 0xC49DC vrai si le volume a été changé,
// 0xC4A1C la pédale de maintien (contrôleur 64). Par voix : 0xC47EC l'octet de la note qu'elle joue
// (0 : libre), 0xC4890 son canal (mot long), 0xC49B8 la vélocité de sa note (mot long), 0xC47E1 vrai
// quand un instrument y est chargé. Les relâchements retenus par la pédale : 0xC4A78 leur nombre,
// seize au plus, rangés par trois octets (note, vélocité, canal) en 0xC4A7C.
//
// LES BANQUES. INST.BNK puis DRUM.BNK, au format BNK d'AdLib : en-tête (le nombre d'instruments en
// +8, le décalage des fiches de noms en +0xC, celui des instruments en +0x10), fiches de noms de 12
// octets (numéro, un octet, nom), instruments de 30 octets (+0 et +1, puis les treize paramètres du
// premier opérateur — KSL, multiplicateur, rétroaction, attaque, maintien, entretien, chute,
// relâchement, niveau, trémolo, vibrato, KSR, connexion —, ceux du second, et les deux formes
// d'onde en +0x1C et +0x1D). 0x8E196 les convertit sur place en octets de registres. Les instruments
// de la première banque sont pris par programme (0xC4828, sélecteur 0xC482C), ceux de la seconde,
// les percussions du canal 9, par note (0xC483E, sélecteur 0xC4842) ; pour une percussion, le
// troisième octet de la fiche de nom (0xC4838, sélecteur 0xC483C) donne la hauteur à jouer : dans
// DRUM.BNK, 0x0C pour la grosse caisse (note 35), 0x3C pour la caisse claire (note 38).
//
// DEUX TABLES CONSTANTES. 0xC4AAC, 64 octets, l'atténuation par vélocité (0x3F à 0) ; 0xC4AC0, la
// fréquence de chaque note (mot long : octave et numéro de fréquence, prêts pour les registres 0xA0
// et 0xB0). Ses vraies valeurs commencent à la note 12 (0x157, un do) : les douze premières entrées
// tombent dans la fin de la table des vélocités.
//
// LES MODULES DE HMIDRV.386 (0x8ECEF, 0x8EDA6, 0x8F00C), appelés par sosDIGIInitDriver (0x84C98)
// pour les bruitages : l'hôte joue les modules, mais c'est le code de SOS qui les charge (§ 9.4).
//
// LA PILE. Le séquenceur de SOS joue la musique depuis la minuterie, sur la pile privée de son
// gestionnaire d'interruption (0x8A369, de 0xC370E à 0xC4716), dans les variables du programme ;
// mais le jeu envoie aussi des messages hors de toute interruption (0x87202, le désaccord des
// attractions usées), et une interruption peut alors tomber pendant une lecture du port de la puce.
// D'où trois précautions :
//  - le pointeur de pile est tenu là où l'original l'avait (`dansLeCadre`, `appel`) : le
//    gestionnaire range en 0xC370E celui du code qu'il interrompt ;
//  - la mémoire est lue dans l'ordre de l'original par rapport aux accès aux ports : ce qu'une
//    interruption change entre deux écritures de la puce est vu au même moment ;
//  - chaque routine laisse dans la pile ce que l'original y laissait : registres sauvés (ebx et ebp
//    ont, le temps de la routine, les valeurs de l'original), arguments, adresses de retour (le
//    premier nombre de chaque `appel`), variables locales, dans leur dernier état. Personne ne relit
//    ces restes (le rejeu le prouve, pile privée exclue) ; mais la pile privée est dans les
//    variables que la comparaison appel par appel relève.

// --- arithmétique de 1994 ----------------------------------------------------------------------
const octet = (jeu, a) => jeu.m8[a >>> 0];
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Un pointeur lointain (décalage, sélecteur), ramené à une adresse de la mémoire.
const lointain = (jeu, decalage, selecteur) => ((decalage >>> 0) + jeu.machine.base(selecteur & 0xFFFF)) >>> 0;
// Le sélecteur des données, que SOS passe avec l'adresse de ses messages (`mov eax, ds`).
const selecteurDesDonnees = (jeu) => jeu.T.R.ds & 0xFFFF;

// --- la pile ------------------------------------------------------------------------------------
// Dans une réécriture, T.R fait foi ; on le recharge dans les registres de la transcription à
// chaque changement, pour que l'hôte et les appels (qui relèvent T.R) le voient.
function poserRegistres(jeu, registres) {
  Object.assign(jeu.T.R, registres);
  jeu.T.charger();
}
const EBX_ESI_EDI_EBP = ['ebx', 'esi', 'edi', 'ebp'];
const ESI_EDI_EBP = ['esi', 'edi', 'ebp'];
const EBP = ['ebp'];
// Le corps d'une routine, avec le prologue de l'original : les registres `sauves` empilés, ebp
// pointant sur le dernier, puis `locales` octets de variables. Rend `corps(ebp)` ; au retour, ebx,
// ebp et la pile sont remis.
function dansLeCadre(jeu, sauves, locales, corps) {
  const R = jeu.T.R;
  const entree = R.esp, ebxEntree = R.ebx, ebpEntree = R.ebp;
  let a = entree >>> 0;
  for (const r of sauves) { a -= 4; poserLong(jeu, a, R[r]); }
  poserRegistres(jeu, { ebp: a | 0, esp: (a - locales) | 0 });
  try {
    return corps(a);
  } finally {
    poserRegistres(jeu, { esp: entree, ebx: ebxEntree, ebp: ebpEntree });
  }
}
// ebx, que l'original charge au milieu d'une routine : les appelées l'empilent.
const poserEbx = (jeu, v) => poserRegistres(jeu, { ebx: v | 0 });
// Un appel direct à une autre routine du module, comme l'original le faisait : ses arguments et
// l'adresse de retour de l'original (`retour`) empilés.
function appel(jeu, retour, args, fn) {
  const esp = jeu.T.R.esp;
  let a = (esp - 4 * args.length) >>> 0;
  args.forEach((v, k) => poserLong(jeu, a + 4 * k, v));
  a -= 4;
  poserLong(jeu, a, retour);
  poserRegistres(jeu, { esp: a | 0 });
  try {
    return fn();
  } finally {
    poserRegistres(jeu, { esp });
  }
}
// Un appel à une routine hors du module, de la même hauteur et avec la même adresse de retour.
const appelExterne = (jeu, retour, adresse, ...args) => jeu.appelerDepuis(retour, jeu.T.R.esp, adresse, ...args);

// Les ports, rendus par l'hôte comme à la transcription : registres à jour avant le service (une
// interruption peut y être livrée), rechargés après.
function sortiePort(jeu, port, valeur) {
  jeu.T.charger();
  jeu.machine.sortie(port & 0xFFFF, valeur & 0xFF, 1);
  jeu.T.charger();
}
function entreePort(jeu, port) {
  jeu.T.charger();
  const v = jeu.machine.entree(port & 0xFFFF, 1);
  jeu.T.charger();
  return v & 0xFF;
}

// --- les variables ------------------------------------------------------------------------------
// La puce.
const PORT_DEMANDE = 0xC4774;        // mot long : le port reçu à l'installation
const PORT_PUCE = 0xC4778;           // mot long : le port de base (0x8EBD8 n'en lit que le mot)
const PORT_RETENU = 0xC47F7;         // mot long : le même, gardé à part (non établi : qui le relit)
const PUCE_OUVERTE = 0xC47FB;        // octet : vrai une fois la puce ouverte (0x8E57C)
const PILOTE_INSTALLE = 0xC4810;     // mot long : vrai une fois le pilote installé (0x8E41D)
const PORT_A_L_INSTALLATION = 0xE12A8; // mot long : le port, copié par 0x8E4B4
const COPIE_BD = 0xC47E0;            // octet : le registre 0xBD
const DRAPEAU_C47FC = 0xC47FC;       // octet, remis à zéro avec les voix (non établi)
const COPIE_40 = 0xC478C;            // par opérateur : registre 0x40, niveau de sortie et KSL
const COPIE_80 = 0xC47AC;            // par opérateur : registre 0x80, maintien et relâchement
const COPIE_A0 = 0xC47BC;            // par voix : registre 0xA0
const COPIE_B0 = 0xC47C5;            // par voix : registre 0xB0
const INSTRUMENT_CHARGE = 0xC47E1;   // onze octets : vrai si la voix a reçu un instrument
const OPERATEUR_1 = 0xC47FD;         // décalage du premier opérateur de la voix v, en OPERATEUR_1 + 2v
const OPERATEUR_2 = 0xC47FE;         // celui du second, en OPERATEUR_2 + 2v

// Les voix.
const NOTE_DE_LA_VOIX = 0xC47EC;     // octet par voix : la note jouée, 0 si la voix est libre
const CANAL_DE_LA_VOIX = 0xC4890;    // mot long par voix
const VELOCITE = 0xC49B8;            // mot long par voix (0x8DC05 et 0x8DCAE l'indicent par canal)

// Les canaux.
const PROGRAMME = 0xC4850;           // mot long par canal
const COURBURE = 0xC48B4;            // mot long par canal : l'octet fort de la courbure, 0x40 au centre
const COURBE = 0xC48F4;              // mot long par canal : vrai si le canal a été courbé
const CONTROLEUR_102 = 0xC4934;      // mot long par canal (non établi : l'amplitude de la courbure)
const VOLUME = 0xC4978;              // mot long par canal : le contrôleur 7, 0x7F par défaut
const VOLUME_CHANGE = 0xC49DC;       // mot long par canal
const PEDALE = 0xC4A1C;              // mot long par canal : le contrôleur 64
const COURBURE_PERMISE = 0xC484C;    // mot long : sans lui, une note ne suit pas la courbure du canal
const RELACHEMENTS_RETENUS = 0xC4A78; // mot long : le nombre de relâchements retenus par la pédale
const RELACHEMENTS = 0xC4A7C;        // seize fois trois octets : note, vélocité, canal
const MAX_RELACHEMENTS = 16;

// Les messages que le pilote se compose pour ses propres routines.
const MSG_RELACHEMENT = 0xC4A66;     // note, vélocité, canal
const MSG_PROGRAMME = 0xC4A69;       // programme, canal
const MSG_CONTROLEUR = 0xC4A6B;      // canal, contrôleur, valeur
const MSG_COURBURE = 0xC4A6E;        // canal, octet fort
const MSG_PROGRAMME_ZERO = 0xC4A76;  // programme 0, voix : posé pour chaque voix à la première banque
const PTR_MSG_PROGRAMME_ZERO = 0xC4A70; // son pointeur lointain (décalage ; sélecteur en 0xC4A74)
const SEL_MSG_PROGRAMME_ZERO = 0xC4A74;

// Les banques.
const PROCHAINE_EST_LA_SECONDE = 0xC4974; // mot long : la banque reçue ensuite sera celle des percussions
const BANQUE = 0xC481C;              // pointeur lointain de la première banque (sélecteur en 0xC4820)
const SEL_BANQUE = 0xC4820;
const NOMBRE_INSTRUMENTS = 0xC4814;  // mot long : le nombre d'instruments de la première banque
const NOMS = 0xC4822;                // ses fiches de noms (sélecteur en 0xC4826)
const SEL_NOMS = 0xC4826;
const INSTRUMENTS = 0xC4828;         // ses instruments (sélecteur en 0xC482C)
const SEL_INSTRUMENTS = 0xC482C;
const BANQUE_RECUE = 0xC482E;        // mot long : vrai une fois la première banque reçue
const PERCUSSIONS = 0xC4832;         // pointeur lointain de la seconde banque (sélecteur en 0xC4836)
const SEL_PERCUSSIONS = 0xC4836;
const NOMS_PERCUSSIONS = 0xC4838;    // ses fiches de noms, dont le troisième octet est la hauteur à jouer
const SEL_NOMS_PERCUSSIONS = 0xC483C;
const INSTRUMENTS_PERCUSSIONS = 0xC483E; // ses instruments, un par note (sélecteur en 0xC4842)
const SEL_INSTRUMENTS_PERCUSSIONS = 0xC4842;
const PERCUSSIONS_RECUES = 0xC4844;  // mot long : vrai une fois la seconde banque reçue

// Les tables constantes.
const ATTENUATION_PAR_VELOCITE = 0xC4AAC; // 64 octets, indexés par la vélocité divisée par deux
const FREQUENCE_DE_LA_NOTE = 0xC4AC0;     // mot long par note

// Les formats de la banque.
const ENTETE_NOMBRE = 0x08, ENTETE_NOMS = 0x0C, ENTETE_INSTRUMENTS = 0x10;
const TAILLE_INSTRUMENT = 0x1E, TAILLE_NOM = 0x0C;
const NOM_HAUTEUR = 2;               // dans une fiche de nom de DRUM.BNK : la hauteur à jouer
// Un instrument une fois converti (0x8E196) : l'octet à écrire dans chaque registre.
const I_20_1 = 0x0B, I_40_1 = 0x02, I_60_1 = 0x05, I_80_1 = 0x06, I_C0 = 0x0E, I_E0_1 = 0x1C;
const I_20_2 = 0x18, I_40_2 = 0x0F, I_60_2 = 0x12, I_80_2 = 0x13, I_E0_2 = 0x1D;

const NB_VOIX = 9, NB_CANAUX = 16, CANAL_DES_PERCUSSIONS = 9;
const CLE_ENFONCEE = 0x20;           // bit du registre 0xB0 : la note sonne

// Les modules de HMIDRV.386 (§ 9.4).
const DOSSIER_DES_PILOTES = 0xC34EE; // chaîne : le dossier, posé par sosDIGIInitSystem
const CHEMIN = 0xC35ED;              // chaîne : le chemin du fichier, construit ici
const NOM_HMIDRV = 0xB0A08;          // « hmidrv.386 »
const ENTETE_FICHIER = 0xE12FC;      // les 0x2C octets d'en-tête du fichier
const NOMBRE_MODULES = 0xE131C;      // son mot long +0x20
const ENTETE_MODULE = 0xE12CC;       // les 0x30 octets d'en-tête d'un module
const TAILLE_MODULE = 0xE12F0;       // +0x24 : la taille du code
const ID_MODULE = 0xE12F4;           // +0x28 : l'identifiant (0xE017 : Sound Blaster 16)
const OPTIONS_MODULE = 0xE12F9;      // +0x2D : le bit 7 marque un pilote matériel utilisable
const PILOTE_CHARGE = 0xC324C;       // mot long par pilote numérique : vrai une fois chargé
const ID_DU_PILOTE = 0xC32E2;        // mot long par pilote numérique
const ADRESSE_DU_PILOTE = 0xC3206;   // mot long par pilote numérique
const IMAGE_DU_PILOTE = 0xC31E8;     // pointeur lointain par pilote numérique, 6 octets (sélecteur en +4)
const MAX_PILOTES = 5;
// Les réponses de SOS.
const ERR_PAS_DE_MEMOIRE = 5, ERR_IDENTIFIANT = 6, ERR_DEJA_CHARGE = 9, ERR_NUMERO = 0xA,
  ERR_FICHIER = 0xF;

// Les routines de SOS et de la bibliothèque C appelées par le chargement.
const STRCPY = 0x7E1ED, STRCAT = 0x81336;
const OUVRIR = 0x8614F, LIRE = 0x876B7, DEPLACER = 0x88394, FERMER = 0x8639A;
const ALLOUER = 0x8A5A1, VERROUILLER = 0x8BB41, SELECTEUR_DU_BLOC = 0x8BBCB, POINTEUR_DU_SELECTEUR = 0x8BBF6;
const APPELER_FONCTION_8 = 0x8BD24;  // appelle la fonction 8 du pilote matériel : sa description
const ACCES_LECTURE = 0x200, DEPUIS_ICI = 1;
// La fréquence d'une note courbée (0x8D317), et sa pose dans les registres 0xA0 et 0xB0 (0x8E61D),
// appelées par leur adresse.
const FREQUENCE_COURBEE = 0x8D317, POSER_FREQUENCE = 0x8E61D;

// ================================================================================================
// LA PUCE
// ================================================================================================

// 0x8EBD8 — écrire un registre de la puce. Rend la dernière lecture du port, dans l'octet bas de
// la valeur écrite (eax).
function ecrirePuce(jeu, registre, valeur) {
  return dansLeCadre(jeu, EBP, 0, () => {
    const port = mot(jeu, PORT_PUCE);
    sortiePort(jeu, port, registre);
    for (let k = 0; k < 6; k++) entreePort(jeu, port + 1);
    sortiePort(jeu, port + 1, valeur);
    let lu = 0;
    for (let k = 0; k < 35; k++) lu = entreePort(jeu, port);
    return ((valeur & ~0xFF) | lu) | 0;
  });
}
// L'appel de 0x8EBD8 par les autres routines, qui lui passent toujours deux octets.
const ecrire = (jeu, retour, registre, valeur) =>
  appel(jeu, retour, [registre & 0xFF, valeur & 0xFF], () => ecrirePuce(jeu, registre & 0xFF, valeur & 0xFF));

// 0x8E57C — ouvrir la puce : le port (lu à l'adresse lointaine donnée) doit être 0x388 ou 0x380 ;
// sinon la routine rend 1, dans l'octet bas du décalage reçu. La forme d'onde est permise (registre
// 1, bit 0x20) et les voix éteintes.
function ouvrirPuce(jeu, decalage, selecteur) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 4, (ebp) => {
    const p = lointain(jeu, decalage, selecteur);
    if (long(jeu, p) !== 0x388 && long(jeu, p) !== 0x380) {
      poserOctet(jeu, ebp - 4, 1);
      return ((decalage & ~0xFF) | 1) | 0;
    }
    poserLong(jeu, PORT_RETENU, long(jeu, p));
    poserLong(jeu, PORT_PUCE, long(jeu, p));
    ecrire(jeu, 0x8E5D3, 0x01, 0x20);
    poserOctet(jeu, COPIE_BD, 0);
    appel(jeu, 0x8E5E5, [0], () => eteindreLesVoix(jeu, 0));
    poserOctet(jeu, PUCE_OUVERTE, 1);
    poserOctet(jeu, ebp - 4, 0);
    return 0;
  });
}

// 0x8E6B3 — éteindre les neuf voix (registre 0xB0 à zéro, copie comprise), oublier les
// instruments chargés, et ne garder que les deux profondeurs du registre 0xBD. L'argument ne sert
// pas.
function eteindreLesVoix(jeu, _inutilise) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 8, (ebp) => {
    for (let v = 0; v < NB_VOIX; v++) {
      poserOctet(jeu, COPIE_B0 + v, 0);
      ecrire(jeu, 0x8E6F6, 0xB0 + v, octet(jeu, COPIE_B0 + v));
    }
    for (let v = 0; v < 11; v++) poserOctet(jeu, INSTRUMENT_CHARGE + v, 0);
    poserOctet(jeu, DRAPEAU_C47FC, 0);
    poserOctet(jeu, COPIE_BD, octet(jeu, COPIE_BD) & 0xC0);
    ecrire(jeu, 0x8E73C, 0xBD, octet(jeu, COPIE_BD));
    poserLong(jeu, ebp - 8, 11);
    poserOctet(jeu, ebp - 4, 0);
    return 0;
  });
}

// 0x8E8AF — arrêter la puce : registre 0xBD à zéro, touches relâchées, les seconds opérateurs
// réduits au silence (niveau 0x3F, KSL 3). Rend 2 si la puce n'a pas été ouverte (dans l'octet bas
// de eax tel qu'il était à l'entrée). **Anomalie reproduite** : la copie du registre 0xB0 garde
// son bit « la note sonne ».
function arreterPuce(jeu) {
  const eaxEntree = jeu.T.R.eax;
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 8, (ebp) => {
    if (octet(jeu, PUCE_OUVERTE) === 0) {
      poserOctet(jeu, ebp - 8, 2);
      return ((eaxEntree & ~0xFF) | 2) | 0;
    }
    poserOctet(jeu, COPIE_BD, 0);
    ecrire(jeu, 0x8E8E7, 0xBD, octet(jeu, COPIE_BD));
    for (let v = 0; v < NB_VOIX; v++) ecrire(jeu, 0x8E919, 0xB0 + v, octet(jeu, COPIE_B0 + v) & ~CLE_ENFONCEE);
    for (let v = 0; v < NB_VOIX; v++) ecrire(jeu, 0x8E94C, 0x40 + octet(jeu, OPERATEUR_2 + 2 * v), 0xFF);
    for (let v = 0; v < 11; v++) poserOctet(jeu, INSTRUMENT_CHARGE + v, 0);
    poserOctet(jeu, ebp - 4, 11);
    poserOctet(jeu, ebp - 8, 0);
    return 0;
  });
}

// 0x8E76D — poser la fréquence d'une voix et enfoncer la touche : 0xA0 reçoit l'octet bas, 0xB0
// l'octet haut avec le bit 0x20 — d'abord sans, pour relâcher une note qui sonnerait encore. La
// voix est marquée occupée (la note elle-même est posée ensuite par l'appelant).
function lancerVoix(jeu, voix, frequence) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 8, (ebp) => {
    const v = voix & 0xFF;
    poserOctet(jeu, COPIE_A0 + v, frequence);
    poserOctet(jeu, COPIE_B0 + v, (frequence >>> 8) | CLE_ENFONCEE);
    ecrire(jeu, 0x8E7B5, 0xA0 + v, octet(jeu, COPIE_A0 + v));
    ecrire(jeu, 0x8E7D6, 0xB0 + v, octet(jeu, COPIE_B0 + v) & ~CLE_ENFONCEE);
    ecrire(jeu, 0x8E7F3, 0xB0 + v, octet(jeu, COPIE_B0 + v));
    poserOctet(jeu, NOTE_DE_LA_VOIX + v, 1);
    poserOctet(jeu, ebp - 8, 0);
    return 0;
  });
}

// 0x8E82F — relâcher la touche d'une voix. Rend 6 si la voix était libre.
function couperVoix(jeu, voix) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 4, (ebp) => {
    const v = voix & 0xFF;
    if (octet(jeu, NOTE_DE_LA_VOIX + v) === 0) {
      poserOctet(jeu, ebp - 4, 6);
      return 6;
    }
    poserOctet(jeu, COPIE_B0 + v, octet(jeu, COPIE_B0 + v) & ~CLE_ENFONCEE);
    ecrire(jeu, 0x8E873, 0xB0 + v, octet(jeu, COPIE_B0 + v));
    poserOctet(jeu, NOTE_DE_LA_VOIX + v, 0);
    poserOctet(jeu, ebp - 4, 0);
    return 0;
  });
}
const couper = (jeu, retour, voix) => appel(jeu, retour, [voix & 0xFF], () => couperVoix(jeu, voix));

// 0x8E99D — charger un instrument converti dans une voix. Tous ses registres sont écrits, sauf le
// niveau du second opérateur, que la note pose ensuite d'après sa vélocité : il n'est que copié.
function chargerInstrument(jeu, decalage, selecteur, voix) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0x38, (ebp) => {
    const v = voix & 0xFF;
    const i = lointain(jeu, decalage, selecteur);
    const op1 = octet(jeu, OPERATEUR_1 + 2 * v);
    const r20a = octet(jeu, i + I_20_1), r40a = octet(jeu, i + I_40_1), r60a = octet(jeu, i + I_60_1);
    const r80a = octet(jeu, i + I_80_1), rC0 = octet(jeu, i + I_C0), rE0a = octet(jeu, i + I_E0_1);
    const r20b = octet(jeu, i + I_20_2), r40b = octet(jeu, i + I_40_2), r60b = octet(jeu, i + I_60_2);
    const r80b = octet(jeu, i + I_80_2), rE0b = octet(jeu, i + I_E0_2);
    poserOctet(jeu, COPIE_80 + octet(jeu, OPERATEUR_2 + 2 * v), r80b);
    poserOctet(jeu, COPIE_80 + octet(jeu, OPERATEUR_1 + 2 * v), r80a);
    ecrire(jeu, 0x8EA7C, op1 + 0x20, r20a);
    ecrire(jeu, 0x8EA92, op1 + 0x40, r40a);
    poserOctet(jeu, COPIE_40 + op1, r40a);
    ecrire(jeu, 0x8EAB4, op1 + 0x60, r60a);
    ecrire(jeu, 0x8EACA, op1 + 0x80, r80a);
    ecrire(jeu, 0x8EAE0, v + 0xC0, rC0);
    ecrire(jeu, 0x8EAF6, op1 + 0xE0, rE0a);
    const op2 = octet(jeu, OPERATEUR_2 + 2 * v);
    ecrire(jeu, 0x8EB1C, op2 + 0x20, r20b);
    poserOctet(jeu, COPIE_40 + op2, r40b);
    ecrire(jeu, 0x8EB3E, op2 + 0x60, r60b);
    ecrire(jeu, 0x8EB54, op2 + 0x80, r80b);
    ecrire(jeu, 0x8EB6A, op2 + 0xE0, rE0b);
    poserOctet(jeu, INSTRUMENT_CHARGE + v, 1);
    // les restes : les paramètres lus, rangés par l'original dans ses variables
    [[0x18, op2], [0x10, r20a], [0x0C, r40a], [0x34, r60a], [0x14, r80a], [0x38, rC0], [0x1C, rE0a],
      [0x20, r20b], [0x24, r40b], [0x28, r60b], [0x2C, r80b], [0x30, rE0b]]
      .forEach(([k, x]) => poserLong(jeu, ebp - k, x));
    poserOctet(jeu, ebp - 4, 0);
    return 0;
  });
}

// Le niveau de sortie (registre 0x40, six bits bas) d'un opérateur pour une vélocité : 0x2000 moins
// le produit de deux compléments à 0x40 — l'atténuation de la vélocité (table 0xC4AAC), doublée, et
// le niveau de l'instrument —, divisé par 128.
const niveauDeSortie = (double, niveauInstrument) =>
  ((0x2000 - Math.imul(double, 0x40 - niveauInstrument)) | 0) >>> 7;

// ================================================================================================
// LES MESSAGES
// ================================================================================================

// 0x8E485 — la fonction 0 du pilote : un message MIDI, dont l'adresse lointaine est le premier
// argument. Appel lointain (retour par `retf`) ; les deux derniers arguments (la longueur et le
// numéro du pilote, vraisemblablement : voir 0x87202) ne servent pas.
function envoyerDonneesMidi(jeu, R) {
  const e = R.esp >>> 0;
  const decalage = long(jeu, e + 8), selecteur = mot(jeu, e + 0xC);
  const a3 = long(jeu, e + 0x10), a4 = long(jeu, e + 0x14);
  dansLeCadre(jeu, ESI_EDI_EBP, 4, (ebp) => {
    appel(jeu, 0x8E4A3, [a4, a3, decalage, selecteur], () => aiguillerMessage(jeu, a4, a3, decalage, selecteur));
    poserLong(jeu, ebp - 4, 0);
  });
  R.eax = 0;
}

// 0x8DD58 — aiguiller un message selon son statut : 0x90 frapper une note (vélocité nulle :
// la relâcher), 0x80 la relâcher, 0xB0 un contrôleur, 0xC0 un changement de programme, 0xE0 une
// courbure. Les autres (pression, système) sont ignorés. Chaque routine reçoit, sauf la frappe,
// un petit message recomposé dans les variables du pilote.
function aiguillerMessage(jeu, _a, _b, decalage, selecteur) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 4, (ebp) => {
    const p = lointain(jeu, decalage, selecteur);
    const ds = selecteurDesDonnees(jeu);
    const statut = octet(jeu, p) & 0xF0;
    poserOctet(jeu, ebp - 4, statut);
    // la routine 0x8DB06, 0x92F7D, 0x8D4CF ou 0x8D255, sur un message du pilote
    const transmettre = (retour, message, routine) =>
      appel(jeu, retour, [0, 0, message, ds], () => routine(jeu, 0, 0, message, ds));
    const relacher = (retour) => {
      poserOctet(jeu, MSG_RELACHEMENT + 2, octet(jeu, p) & 0x0F);
      poserOctet(jeu, MSG_RELACHEMENT, octet(jeu, p + 1));
      poserOctet(jeu, MSG_RELACHEMENT + 1, octet(jeu, p + 2));
      transmettre(retour, MSG_RELACHEMENT, relacherNote);
    };
    switch (statut) {
      case 0x90:
        if (octet(jeu, p + 2) !== 0) {
          const note = octet(jeu, p + 1), velocite = octet(jeu, p + 2), canal = octet(jeu, p) & 0x0F;
          appel(jeu, 0x8DDF5, [note, velocite, canal], () => jouerNote(jeu, note, velocite, canal));
        } else relacher(0x8DE37);
        break;
      case 0x80:
        relacher(0x8DE7C);
        break;
      case 0xC0:
        poserOctet(jeu, MSG_PROGRAMME, octet(jeu, p + 1));
        poserOctet(jeu, MSG_PROGRAMME + 1, octet(jeu, p) & 0x0F);
        transmettre(0x8DEB4, MSG_PROGRAMME, changerProgramme);
        break;
      case 0xB0:
        poserOctet(jeu, MSG_CONTROLEUR, octet(jeu, p) & 0x0F);
        poserOctet(jeu, MSG_CONTROLEUR + 1, octet(jeu, p + 1));
        poserOctet(jeu, MSG_CONTROLEUR + 2, octet(jeu, p + 2));
        transmettre(0x8DEF6, MSG_CONTROLEUR, changerControleur);
        break;
      case 0xE0:
        poserOctet(jeu, MSG_COURBURE, octet(jeu, p) & 0x0F);
        poserOctet(jeu, MSG_COURBURE + 1, octet(jeu, p + 2));
        transmettre(0x8DF2B, MSG_COURBURE, courberLaHauteur);
        break;
      default:
        break;
    }
  });
}

// 0x92EB6 — choisir la voix d'une nouvelle note : la première libre ; sinon, en parcourant les
// canaux dans l'ordre, la première voix d'un canal qui n'a pas été courbé ; sinon la voix du numéro
// du canal (moins 9 à partir de 9). La note ne sert pas. Rend la voix dans l'octet bas de eax, dont
// le reste est ce que la recherche y a laissé.
function choisirUneVoix(jeu, canalArg, _note) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0xC, (ebp) => {
    const fin = (i, voix, eax) => {
      poserLong(jeu, ebp - 8, i);
      poserOctet(jeu, ebp - 4, voix);
      return ((eax & ~0xFF) | voix) | 0;
    };
    for (let v = 0; v < NB_VOIX; v++) if (octet(jeu, NOTE_DE_LA_VOIX + v) === 0) return fin(v, v, v);
    let eax = 0;
    for (let c = 0; c < NB_CANAUX; c++) {
      eax = 4 * c;
      if (long(jeu, COURBE + 4 * c) !== 0) continue;
      for (let v = 0; v < NB_VOIX; v++) {
        eax = longSigne(jeu, CANAL_DE_LA_VOIX + 4 * v);
        poserLong(jeu, ebp - 0xC, v);
        if ((eax >>> 0) === c) return fin(c, v, eax);
      }
      poserLong(jeu, ebp - 0xC, NB_VOIX);
    }
    // l'argument lui-même est diminué de 9, dans la pile
    let voix = canalArg & 0xFF;
    if (voix >= 9) {
      voix = (voix - 9) & 0xFF;
      poserOctet(jeu, ebp + 0x14, voix);
    }
    return fin(NB_CANAUX, voix, eax);
  });
}

// 0x8D616 — frapper une note. La voix choisie est relâchée, prend le canal, reçoit l'instrument du
// programme du canal (du canal 9, celui de la note, dans la banque des percussions), sa vélocité
// pondérée par le volume du canal règle le niveau, et la touche est enfoncée à la fréquence de la
// note (d'une percussion : à la hauteur de sa fiche). Une note mélodique suit ensuite la courbure
// de son canal, s'il a été courbé et si la courbure est permise.
// **Anomalies reproduites** : la vitesse de relâchement de la voix est poussée au maximum cinq fois
// de suite ; le premier opérateur ne reçoit le niveau que si l'octet de rétroaction et connexion de
// l'instrument est nul, test fait sur l'octet entier et non sur le bit de connexion ; une percussion
// ne le reçoit jamais.
function jouerNote(jeu, noteArg, velociteArg, canalArg) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0x14, (ebp) => {
    const note = noteArg & 0xFF, velocite = velociteArg & 0xFF, canal = canalArg & 0xFF;
    if (canal >= NB_CANAUX) return;
    const percussion = canal === CANAL_DES_PERCUSSIONS;
    // les adresses de retour de l'original, sur ses deux chemins
    const R = percussion
      ? { choix: 0x8D8EE, coupe: 0x8D8FE, rel2: 0x8D960, rel1: 0x8D997, instrument: 0x8D9C0, niv1: 0, niv2: 0x8DA9C, touche: 0x8DACF }
      : { choix: 0x8D64B, coupe: 0x8D65B, rel2: 0x8D6BD, rel1: 0x8D6F4, instrument: 0x8D724, niv1: 0x8D826, niv2: 0x8D862, touche: 0x8D87C };
    const voix = appel(jeu, R.choix, [canal, note], () => choisirUneVoix(jeu, canal, note)) & 0xFF;
    couper(jeu, R.coupe, voix);
    poserLong(jeu, CANAL_DE_LA_VOIX + 4 * voix, canal);
    let relachement = 0;
    for (let k = 0; k < 5; k++) {
      let op = octet(jeu, OPERATEUR_2 + 2 * voix);
      ecrire(jeu, R.rel2, 0x80 + op, octet(jeu, COPIE_80 + op) | 0x0F);
      op = octet(jeu, OPERATEUR_1 + 2 * voix);
      relachement = octet(jeu, COPIE_80 + op) | 0x0F;
      ecrire(jeu, R.rel1, 0x80 + op, relachement);
    }
    // l'instrument
    const [base, selecteur] = percussion
      ? [long(jeu, INSTRUMENTS_PERCUSSIONS) + note * TAILLE_INSTRUMENT, mot(jeu, SEL_INSTRUMENTS_PERCUSSIONS)]
      : [long(jeu, INSTRUMENTS) + Math.imul(long(jeu, PROGRAMME + 4 * canal), TAILLE_INSTRUMENT), mot(jeu, SEL_INSTRUMENTS)];
    poserEbx(jeu, base);
    appel(jeu, R.instrument, [base >>> 0, selecteur, voix], () => chargerInstrument(jeu, base >>> 0, selecteur, voix));
    // le niveau : la vélocité pondérée par le volume du canal (division signée, 127 pour 128)
    poserLong(jeu, VELOCITE + 4 * voix, velocite);
    const volume = ((longSigne(jeu, VOLUME + 4 * canal) << 7) / 0x7F) | 0;
    const ponderee = (Math.imul(longSigne(jeu, VELOCITE + 4 * voix), volume) >> 7) & 0xFF;
    const niveau2 = octet(jeu, COPIE_40 + octet(jeu, OPERATEUR_2 + 2 * voix)) & 0x3F;
    const double = (0x40 - octet(jeu, ATTENUATION_PAR_VELOCITE + (ponderee >> 1))) << 1;
    const x = niveauDeSortie(double, niveau2);
    if (!percussion) {
      const programme = Math.imul(long(jeu, PROGRAMME + 4 * canal), TAILLE_INSTRUMENT);
      poserEbx(jeu, programme);
      const instrument = lointain(jeu, long(jeu, INSTRUMENTS) + programme, mot(jeu, SEL_INSTRUMENTS));
      if (octet(jeu, instrument + I_C0) === 0) {
        const op1 = octet(jeu, OPERATEUR_1 + 2 * voix);
        ecrire(jeu, R.niv1, 0x40 + op1, (octet(jeu, COPIE_40 + op1) & 0xC0) | (x & 0xFF));
      }
    }
    const op2 = octet(jeu, OPERATEUR_2 + 2 * voix);
    const niveau = (octet(jeu, COPIE_40 + op2) & 0xC0) | (x & 0xFF);
    ecrire(jeu, R.niv2, 0x40 + op2, niveau);
    // la touche
    let hauteur = note;
    if (percussion) {
      poserEbx(jeu, note * TAILLE_NOM);
      hauteur = octet(jeu, lointain(jeu, long(jeu, NOMS_PERCUSSIONS) + note * TAILLE_NOM, mot(jeu, SEL_NOMS_PERCUSSIONS))
        + NOM_HAUTEUR);
    }
    const frequence = long(jeu, FREQUENCE_DE_LA_NOTE + 4 * hauteur);
    appel(jeu, R.touche, [voix, frequence], () => lancerVoix(jeu, voix, frequence));
    poserOctet(jeu, NOTE_DE_LA_VOIX + voix, note);
    if (!percussion && long(jeu, COURBURE_PERMISE) !== 0 && long(jeu, COURBE + 4 * canal) !== 0) {
      const f = appelExterne(jeu, 0x8D8C3, FREQUENCE_COURBEE, long(jeu, COURBURE + 4 * canal), note, voix);
      appelExterne(jeu, 0x8D8D1, POSER_FREQUENCE, voix, f);
    }
    // les restes : les variables de l'original, et deux de ses arguments, qu'il a réemployés
    poserOctet(jeu, ebp - 8, canal);
    poserOctet(jeu, ebp - 4, niveau);
    poserOctet(jeu, ebp - 0xC, relachement);
    poserLong(jeu, ebp - 0x14, 5);
    poserLong(jeu, ebp - 0x10, x);
    poserOctet(jeu, ebp + 0x1C, voix);
    poserOctet(jeu, ebp + 0x18, ponderee);
  });
}

// 0x8DB06 — relâcher une note (message : note, vélocité, canal) : chaque voix qui la joue sur ce
// canal. Si la pédale du canal est enfoncée, le relâchement est retenu (seize au plus ; au-delà,
// il se fait aussitôt).
function relacherNote(jeu, _a, _b, decalage, selecteur) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0xC, (ebp) => {
    poserOctet(jeu, ebp - 4, 0);
    const p = lointain(jeu, decalage, selecteur);
    if (octet(jeu, p + 2) >= NB_CANAUX) return;
    // (l'original teste ensuite, sans effet, que le canal est inférieur à 16 ou égal à 9)
    const n = long(jeu, RELACHEMENTS_RETENUS);
    if (long(jeu, PEDALE + 4 * octet(jeu, p + 2)) !== 0 && n < MAX_RELACHEMENTS) {
      poserOctet(jeu, RELACHEMENTS + 3 * n, octet(jeu, p));
      poserOctet(jeu, RELACHEMENTS + 3 * n + 1, octet(jeu, p + 1));
      poserOctet(jeu, RELACHEMENTS + 3 * n + 2, octet(jeu, p + 2));
      poserLong(jeu, RELACHEMENTS_RETENUS, n + 1);
      return;
    }
    for (let v = 0; v < NB_VOIX; v++) {
      if (octet(jeu, NOTE_DE_LA_VOIX + v) !== octet(jeu, p)) continue;
      if (long(jeu, CANAL_DE_LA_VOIX + 4 * v) !== octet(jeu, p + 2)) continue;
      couper(jeu, 0x8DBF1, v);
      poserOctet(jeu, NOTE_DE_LA_VOIX + v, 0);
    }
    poserLong(jeu, ebp - 8, NB_VOIX);
  });
}

// 0x8D4CF — un contrôleur (message : canal, numéro, valeur) : 7 le volume, 64 la pédale de
// maintien, 102 (non établi), 121 remettre les contrôleurs, 123 relâcher toutes les notes.
// **Anomalie reproduite** : quand la pédale se relève, les relâchements retenus sont rejoués du
// rang « nombre » jusqu'au rang 1 : le premier retenu ne l'est jamais, et le rang « nombre », au-delà
// du dernier, rejoue ce qui y traîne. Un relâchement rejoué pour un canal dont la pédale est encore
// enfoncée serait retenu de nouveau au même rang, et la boucle ne finirait pas.
function changerControleur(jeu, _a, _b, decalage, selecteur) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 8, (ebp) => {
    const p = lointain(jeu, decalage, selecteur);
    const controleur = octet(jeu, p + 1);
    poserOctet(jeu, ebp - 8, controleur);
    switch (controleur) {
      case 7: {
        const canal = octet(jeu, p), valeur = octet(jeu, p + 2);
        appel(jeu, 0x8D546, [canal, valeur], () => reglerVolume(jeu, canal, valeur));
        break;
      }
      case 0x40:
        poserLong(jeu, PEDALE + 4 * octet(jeu, p), octet(jeu, p + 2));
        if (octet(jeu, p + 2) !== 0) break;
        while (long(jeu, RELACHEMENTS_RETENUS) !== 0) {
          const retenu = RELACHEMENTS + 3 * long(jeu, RELACHEMENTS_RETENUS), ds = selecteurDesDonnees(jeu);
          appel(jeu, 0x8D5C8, [0, 0, retenu, ds], () => relacherNote(jeu, 0, 0, retenu, ds));
          poserLong(jeu, RELACHEMENTS_RETENUS, long(jeu, RELACHEMENTS_RETENUS) - 1);
        }
        break;
      case 0x66:
        poserLong(jeu, CONTROLEUR_102 + 4 * octet(jeu, p), octet(jeu, p + 2));
        break;
      case 0x79: {
        const canal = octet(jeu, p);
        appel(jeu, 0x8D572, [canal], () => remettreLesControleurs(jeu, canal));
        break;
      }
      case 0x7B: {
        const canal = octet(jeu, p);
        appel(jeu, 0x8D55C, [canal], () => relacherLeCanal(jeu, canal));
        break;
      }
      default:
        break;
    }
  });
}

// Le canal est-il servi ? Moins de 16. (L'original laisse passer aussi « 9 si les percussions sont
// reçues », mais seulement parmi les canaux de 16 et plus : le cas ne se présente jamais.)
const canalServi = (jeu, canal) =>
  (canal >>> 0) < NB_CANAUX || (canal === CANAL_DES_PERCUSSIONS && long(jeu, PERCUSSIONS_RECUES) !== 0);

// 0x8DC05 — relâcher toutes les notes d'un canal (contrôleur 123), après avoir remis son volume, sa
// pédale et la vélocité (**anomalie** : indicée ici par le canal, là où les notes l'indicent par la
// voix).
function relacherLeCanal(jeu, canal) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 4, (ebp) => {
    if (!canalServi(jeu, canal)) return;
    poserLong(jeu, VOLUME + 4 * canal, 0x7F);
    poserLong(jeu, VELOCITE + 4 * canal, 0x7F);
    poserLong(jeu, VOLUME_CHANGE + 4 * canal, 0);
    poserLong(jeu, PEDALE + 4 * canal, 0);
    for (let v = 0; v < NB_VOIX; v++) {
      if (long(jeu, CANAL_DE_LA_VOIX + 4 * v) !== (canal >>> 0)) continue;
      couper(jeu, 0x8DC9A, v);
      poserOctet(jeu, NOTE_DE_LA_VOIX + v, 0);
    }
    poserLong(jeu, ebp - 4, NB_VOIX);
  });
}

// 0x8DCAE — remettre les contrôleurs d'un canal (contrôleur 121) : volume, vélocité (indicée par
// le canal, comme ci-dessus), pédale, courbure au centre, contrôleur 102 à 2.
function remettreLesControleurs(jeu, canal) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0, () => {
    if (!canalServi(jeu, canal)) return;
    poserLong(jeu, VOLUME + 4 * canal, 0x7F);
    poserLong(jeu, VELOCITE + 4 * canal, 0x7F);
    poserLong(jeu, VOLUME_CHANGE + 4 * canal, 0);
    poserLong(jeu, PEDALE + 4 * canal, 0);
    poserLong(jeu, COURBURE + 4 * canal, 0x40);
    poserLong(jeu, CONTROLEUR_102 + 4 * canal, 2);
  });
}

// 0x92CEC — le volume d'un canal (contrôleur 7) : retenu, puis appliqué aux voix qui jouent sur ce
// canal, comme à la frappe d'une note. Différences avec 0x8D616, reproduites : la division est
// non signée, le complément de l'atténuation est doublé par « << 7 >>> 6 », et l'octet de
// connexion est lu dans la première banque, au programme du canal, même pour les percussions.
function reglerVolume(jeu, canal, valeur) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0x10, (ebp) => {
    if ((canal >>> 0) >= NB_CANAUX) return;
    const volume = valeur & 0xFF;
    poserLong(jeu, VOLUME + 4 * canal, volume);
    poserLong(jeu, VOLUME_CHANGE + 4 * canal, 1);
    for (let v = 0; v < NB_VOIX; v++) {
      if (octet(jeu, NOTE_DE_LA_VOIX + v) === 0) continue;
      if (long(jeu, CANAL_DE_LA_VOIX + 4 * v) !== (canal >>> 0)) continue;
      const pondere = (Math.imul(((volume << 7) / 0x7F) >>> 0, long(jeu, VELOCITE + 4 * v)) >>> 7) & 0xFF;
      const niveau2 = octet(jeu, COPIE_40 + octet(jeu, OPERATEUR_2 + 2 * v)) & 0x3F;
      const double = ((0x40 - octet(jeu, ATTENUATION_PAR_VELOCITE + (pondere >> 1))) << 7) >>> 6;
      const x = niveauDeSortie(double, niveau2);
      const programme = Math.imul(long(jeu, PROGRAMME + 4 * long(jeu, CANAL_DE_LA_VOIX + 4 * v)), TAILLE_INSTRUMENT);
      poserEbx(jeu, programme);
      const instrument = lointain(jeu, long(jeu, INSTRUMENTS) + programme, mot(jeu, SEL_INSTRUMENTS));
      if (octet(jeu, instrument + I_C0) === 0) {
        const op1 = octet(jeu, OPERATEUR_1 + 2 * v);
        ecrire(jeu, 0x92E4A, 0x40 + op1, (octet(jeu, COPIE_40 + op1) & 0xC0) | x);
      }
      const op2 = octet(jeu, OPERATEUR_2 + 2 * v);
      const niveau = (octet(jeu, COPIE_40 + op2) & 0xC0) | x;
      ecrire(jeu, 0x92E87, 0x40 + op2, niveau);
      // les restes de ce tour
      poserOctet(jeu, ebp - 4, pondere);
      poserLong(jeu, ebp - 0xC, x);
      poserLong(jeu, ebp - 0x10, niveau);
    }
    poserLong(jeu, ebp - 8, NB_VOIX);
  });
}

// 0x8D255 — courber la hauteur d'un canal (message : canal, octet fort) : retenue, puis chaque voix
// qui joue sur ce canal reçoit sa fréquence courbée. Le canal des percussions est ignoré.
function courberLaHauteur(jeu, _a, _b, decalage, selecteur) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 4, (ebp) => {
    const p = lointain(jeu, decalage, selecteur);
    if (octet(jeu, p) >= NB_CANAUX || octet(jeu, p) === CANAL_DES_PERCUSSIONS) return;
    poserLong(jeu, COURBURE + 4 * octet(jeu, p), octet(jeu, p + 1));
    poserLong(jeu, COURBE + 4 * octet(jeu, p), 1);
    for (let v = 0; v < NB_VOIX; v++) {
      if (octet(jeu, NOTE_DE_LA_VOIX + v) === 0) continue;
      if (octet(jeu, p) !== long(jeu, CANAL_DE_LA_VOIX + 4 * v)) continue;
      const f = appelExterne(jeu, 0x8D2FF, FREQUENCE_COURBEE, octet(jeu, p + 1), octet(jeu, NOTE_DE_LA_VOIX + v), v);
      appelExterne(jeu, 0x8D30D, POSER_FREQUENCE, v, f);
    }
    poserLong(jeu, ebp - 4, NB_VOIX);
  });
}

// 0x92F7D — changer le programme d'un canal (message : programme, canal).
function changerProgramme(jeu, _a, _b, decalage, selecteur) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 4, () => {
    const p = lointain(jeu, decalage, selecteur);
    poserLong(jeu, PROGRAMME + 4 * octet(jeu, p + 1), octet(jeu, p));
  });
}

// ================================================================================================
// LA COURBURE DES NOTES
// ================================================================================================

// 0x8D317 — la fréquence d'une note courbée : (courbure, note, voix), la courbure étant l'octet fort
// du message 0xEn (0x40 au centre). Appelée par 0x8D255 (un canal courbé : chaque voix qui y joue)
// et 0x8D616 (une note jouée sur un canal courbé). Rend le mot des registres 0xB0 et 0xA0 : l'octave
// (bits 10 à 12) et le numéro de fréquence (bits 0 à 9).
//
// La fréquence de la note (FREQUENCE_DE_LA_NOTE, à partir de la note 12) est déplacée vers celle de
// la note située `amplitude` demi-tons plus bas (courbure sous 0x40) ou plus haut, amplitude qui est
// le contrôleur 102 du canal de la voix (2 par défaut), au prorata de l'écart au centre :
// (0x3F − courbure) × 1000 / 64 millièmes vers le bas, (courbure − 0x40) × 1000 / 64 vers le haut.
// Quand les deux fréquences ne sont pas dans la même octave (écart de plus de 0x2CF), la
// différence est prise autrement : vers le bas, sur les seuls numéros de fréquence (table 0xC4C88,
// modulo 0x400) ; vers le haut, la note est d'abord portée dans l'octave suivante (numéro de
// fréquence de la table 0xC4C8C, indexée par 11 − la note dans l'octave : 0x144 pour si, 0x132 pour
// la dièse…).
//
// La routine se sert de son deuxième argument comme d'une variable (la note moins 12) : la
// réécriture l'y range aussi, et laisse ses variables locales dans leur dernier état (voir « La
// pile »). ANOMALIE D'ORIGINE, reproduite : une note sous 12 donne un indice négatif, lu hors de la
// table, et la réduction à l'octave, par soustractions répétées d'un nombre sans signe, tourne alors
// des centaines de millions de fois (la réécriture calcule le même reste d'un coup). Non établi :
// pourquoi, vers le bas, la table 0xC4C88 est lue à l'amplitude seule, sans la note.
//
// Exercée par films (116 appels, depuis 0x8D255 et 0x8D616).
const FREQUENCE_DES_NOTES_DES_12 = FREQUENCE_DE_LA_NOTE + 4 * 12;   // 0xC4AF0 : la note 12, 0x157
const NUMEROS_VERS_LE_BAS = 0xC4C88;          // mots longs, indexés par l'amplitude (non établi)
const NUMEROS_DANS_L_OCTAVE_SUIVANTE = 0xC4C8C;   // mots longs, indexés par 11 − note : 0x144, 0x132…
const ECART_D_OCTAVE = 0x2CF;
function frequenceCourbee(jeu, courbure, note, voix) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0x1C, (ebp) => {
    const local = (k, v) => poserLong(jeu, ebp - k, v);
    const frequence = (n) => long(jeu, FREQUENCE_DES_NOTES_DES_12 + 4 * n);
    const n = (note - 12) >>> 0;
    poserLong(jeu, ebp + 0x18, n);                      // l'argument, devenu variable
    const dansLOctave = n % 12;
    local(0x18, dansLOctave);
    let f = frequence(n);
    let octave = f & 0x1C00, numero = f & 0x3FF;
    const amplitude = long(jeu, CONTROLEUR_102 + 4 * long(jeu, CANAL_DE_LA_VOIX + 4 * voix));
    let facteur, ecart;
    if ((courbure >>> 0) < 0x40) {
      facteur = Math.imul(0x3F - courbure, 1000) >>> 6;
      ecart = (f - frequence(n - amplitude)) >>> 0;
      if (ecart > ECART_D_OCTAVE) ecart = (numero - long(jeu, NUMEROS_VERS_LE_BAS + 4 * amplitude)) & 0x3FF;
      ecart = Math.floor((Math.imul(ecart, facteur) >>> 0) / 1000);
      f = (f - ecart) >>> 0;
    } else {
      facteur = Math.imul(courbure - 0x40, 1000) >>> 6;
      ecart = (frequence(n + amplitude) - f) >>> 0;
      if (ecart > ECART_D_OCTAVE) {
        octave = (octave + 0x400) >>> 0;
        numero = long(jeu, NUMEROS_DANS_L_OCTAVE_SUIVANTE + 4 * (0xB - dansLOctave));
        f = (octave | numero) >>> 0;
        ecart = (frequence(n + amplitude) - f) >>> 0;
      }
      ecart = Math.floor((Math.imul(ecart, facteur) >>> 0) / 1000);
      f = (f + ecart) >>> 0;
    }
    local(4, ecart);
    local(8, f);
    local(0xC, octave);
    local(0x10, numero);
    local(0x14, facteur);
    local(0x1C, f);
    return f | 0;
  });
}

// 0x8E61D — poser la fréquence d'une voix : l'octet bas dans le registre 0xA0 + voix, l'octet haut,
// avec le bit de la note qui sonne (0x20), dans le registre 0xB0 + voix, copies comprises. Rend 0.
function poserLaFrequence(jeu, voix, f) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 4, (ebp) => {
    const v = voix & 0xFF;
    poserOctet(jeu, COPIE_A0 + v, f);
    poserOctet(jeu, COPIE_B0 + v, (f >>> 8) | CLE_ENFONCEE);
    ecrire(jeu, 0x8E665, v + 0xA0, octet(jeu, COPIE_A0 + v));
    ecrire(jeu, 0x8E682, v + 0xB0, octet(jeu, COPIE_B0 + v));
    poserOctet(jeu, ebp - 4, 0);
    return 0;
  });
}

// ================================================================================================
// L'INSTALLATION ET LES BANQUES
// ================================================================================================

// 0x8E4B4 — la fonction 1 du pilote : l'installer, le quatrième argument étant le port de la puce.
// Appel lointain. Rend toujours 0, même si la puce refuse le port.
function installerLePilote(jeu, R) {
  const e = R.esp >>> 0;
  const port = long(jeu, e + 0x14);
  dansLeCadre(jeu, ESI_EDI_EBP, 4, (ebp) => {
    poserLong(jeu, PORT_A_L_INSTALLATION, port);
    const ds = selecteurDesDonnees(jeu);
    appel(jeu, 0x8E4DE, [port, port, PORT_A_L_INSTALLATION, ds],
      () => installerPuce(jeu, port, port, PORT_A_L_INSTALLATION, ds));
    poserLong(jeu, ebp - 4, 0);
  });
  R.eax = 0;
}

// 0x8E4EF — la fonction 2 du pilote : le défaire (sosMIDIUnInitDriver, 0x84639, en quittant).
// Appel lointain. Rend 0.
function defaireLePilote(jeu, R) {
  dansLeCadre(jeu, ESI_EDI_EBP, 4, (ebp) => {
    appel(jeu, 0x8E4FF, [], () => fermerPuce(jeu));
    poserLong(jeu, ebp - 4, 0);
  });
  R.eax = 0;
}

// 0x8E3B8 — fermer la puce : rouverte au port de base (0x8E57C, qui éteint les voix), arrêtée
// (0x8E8AF), marquée fermée (0x8EBA6) ; le pilote n'est plus installé.
const PORT_A_LA_FERMETURE = 0xC4770;   // mot long : le port de base, recopié pour 0x8E57C
function fermerPuce(jeu) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0, () => {
    poserLong(jeu, PORT_A_LA_FERMETURE, long(jeu, PORT_PUCE));
    const ds = selecteurDesDonnees(jeu);
    const r = appel(jeu, 0x8E3DF, [PORT_A_LA_FERMETURE, ds], () => ouvrirPuce(jeu, PORT_A_LA_FERMETURE, ds));
    poserRegistres(jeu, { eax: r | 0 });
    poserRegistres(jeu, { eax: appel(jeu, 0x8E3E7, [], () => arreterPuce(jeu)) | 0 });
    poserRegistres(jeu, { eax: appel(jeu, 0x8E3EC, [], () => marquerLaPuceFermee(jeu)) | 0 });
    poserLong(jeu, PILOTE_INSTALLE, 0);
  });
}

// 0x8EBA6 — la puce marquée fermée : 0x8E57C devra la rouvrir. Rend 0 dans l'octet bas d'eax.
function marquerLaPuceFermee(jeu) {
  const eaxEntree = jeu.T.R.eax;
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 4, (ebp) => {
    poserOctet(jeu, PUCE_OUVERTE, 0);
    poserOctet(jeu, ebp - 4, 0);
    return (eaxEntree & ~0xFF) | 0;
  });
}

// 0x8E41D — installer la puce : le port, lu à l'adresse lointaine donnée, est recopié, la puce
// ouverte (sa réponse ignorée) et les voix éteintes une seconde fois.
function installerPuce(jeu, _a, _b, decalage, selecteur) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0, () => {
    poserLong(jeu, PORT_DEMANDE, long(jeu, lointain(jeu, decalage, selecteur)));
    const ds = selecteurDesDonnees(jeu);
    appel(jeu, 0x8E446, [PORT_DEMANDE, ds], () => ouvrirPuce(jeu, PORT_DEMANDE, ds));
    appel(jeu, 0x8E451, [0], () => eteindreLesVoix(jeu, 0));
    poserLong(jeu, PILOTE_INSTALLE, 1);
    return 0;
  });
}

// 0x8E50D — la fonction 3 du pilote : tout remettre à zéro. Appel lointain.
function remettreLePilote(jeu, R) {
  dansLeCadre(jeu, ESI_EDI_EBP, 4, (ebp) => {
    appel(jeu, 0x8E51D, [], () => remettreLEtatMidi(jeu));
    poserLong(jeu, ebp - 4, 0);
  });
  R.eax = 0;
}

// 0x8DF55 — la puce arrêtée, la prochaine banque sera la première, les voix libres, les canaux
// remis : courbure au centre, programme 0, volume plein.
function remettreLEtatMidi(jeu) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 4, (ebp) => {
    appel(jeu, 0x8DF66, [], () => arreterPuce(jeu));
    poserLong(jeu, PROCHAINE_EST_LA_SECONDE, 0);
    for (let v = 0; v < NB_VOIX; v++) {
      poserOctet(jeu, NOTE_DE_LA_VOIX + v, 0);
      poserLong(jeu, CANAL_DE_LA_VOIX + 4 * v, 0);
      poserLong(jeu, VELOCITE + 4 * v, 0x7F);
    }
    for (let c = 0; c < NB_CANAUX; c++) {
      poserLong(jeu, COURBURE + 4 * c, 0x40);
      poserLong(jeu, PROGRAMME + 4 * c, 0);
      poserLong(jeu, COURBE + 4 * c, 0);
      poserLong(jeu, VOLUME + 4 * c, 0x7F);
      poserLong(jeu, VOLUME_CHANGE + 4 * c, 0);
    }
    poserLong(jeu, ebp - 4, NB_CANAUX);
  });
}

// 0x8E52B — la fonction 4 du pilote : recevoir une banque d'instruments, à l'adresse lointaine des
// deux premiers arguments. Appel lointain.
function recevoirUneBanque(jeu, R) {
  const e = R.esp >>> 0;
  const decalage = long(jeu, e + 8), selecteur = mot(jeu, e + 0xC), a4 = long(jeu, e + 0x14);
  dansLeCadre(jeu, ESI_EDI_EBP, 4, (ebp) => {
    appel(jeu, 0x8E549, [a4, a4, decalage, selecteur], () => rangerLaBanque(jeu, a4, a4, decalage, selecteur));
    poserLong(jeu, ebp - 4, 0);
  });
  R.eax = 0;
}

// 0x8E03D — ranger une banque, convertie : la première reçue est celle des instruments (et chaque
// voix reçoit le programme 0, par un message composé exprès), la seconde celle des percussions ; les
// deux alternent. **Anomalie reproduite** : les décalages des noms et des instruments de la seconde
// banque sont lus dans l'en-tête de la première. Sans effet ici : INST.BNK et DRUM.BNK ont le même
// en-tête (128 instruments, noms en 0x1C, instruments en 0x61C).
function rangerLaBanque(jeu, _a, _b, decalage, selecteurArg) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 8, (ebp) => {
    const selecteur = selecteurArg & 0xFFFF;
    poserOctet(jeu, ebp - 4, 0);
    appel(jeu, 0x8E05A, [decalage, selecteur], () => convertirLaBanque(jeu, decalage, selecteur));
    const premiere = () => lointain(jeu, long(jeu, BANQUE), mot(jeu, SEL_BANQUE));
    if (long(jeu, PROCHAINE_EST_LA_SECONDE) === 0) {
      poserLong(jeu, PROCHAINE_EST_LA_SECONDE, 1);
      poserMot(jeu, SEL_BANQUE, selecteur);
      poserLong(jeu, BANQUE, decalage);
      poserLong(jeu, NOMBRE_INSTRUMENTS, motSigne(jeu, premiere() + ENTETE_NOMBRE));
      const noms = long(jeu, premiere() + ENTETE_NOMS);
      poserMot(jeu, SEL_NOMS, selecteur);
      poserLong(jeu, NOMS, decalage + noms);
      const instruments = long(jeu, premiere() + ENTETE_INSTRUMENTS);
      poserMot(jeu, SEL_INSTRUMENTS, selecteur);
      poserLong(jeu, INSTRUMENTS, decalage + instruments);
      poserLong(jeu, BANQUE_RECUE, 1);
      for (let v = 0; v < NB_VOIX; v++) {
        poserOctet(jeu, MSG_PROGRAMME_ZERO, 0);
        poserOctet(jeu, MSG_PROGRAMME_ZERO + 1, v);
        poserMot(jeu, SEL_MSG_PROGRAMME_ZERO, selecteurDesDonnees(jeu));
        poserLong(jeu, PTR_MSG_PROGRAMME_ZERO, MSG_PROGRAMME_ZERO);
        const message = long(jeu, PTR_MSG_PROGRAMME_ZERO), ds = mot(jeu, SEL_MSG_PROGRAMME_ZERO);
        appel(jeu, 0x8E129, [v, 0x3E8, message, ds], () => changerProgramme(jeu, v, 0x3E8, message, ds));
      }
      poserOctet(jeu, ebp - 4, NB_VOIX);
    } else {
      poserLong(jeu, PROCHAINE_EST_LA_SECONDE, 0);
      poserMot(jeu, SEL_PERCUSSIONS, selecteur);
      poserLong(jeu, PERCUSSIONS, decalage);
      const noms = long(jeu, premiere() + ENTETE_NOMS);
      poserMot(jeu, SEL_NOMS_PERCUSSIONS, selecteur);
      poserLong(jeu, NOMS_PERCUSSIONS, decalage + noms);
      const instruments = long(jeu, premiere() + ENTETE_INSTRUMENTS);
      poserMot(jeu, SEL_INSTRUMENTS_PERCUSSIONS, selecteur);
      poserLong(jeu, INSTRUMENTS_PERCUSSIONS, decalage + instruments);
      poserLong(jeu, PERCUSSIONS_RECUES, 1);
    }
  });
}

// 0x8E196 — convertir sur place les instruments d'une banque BNK : les paramètres, un par octet,
// sont assemblés en octets de registres (0x20 : trémolo, vibrato, entretien, KSR, multiplicateur ;
// 0x40 : KSL, niveau ; 0x60 : attaque, chute ; 0x80 : maintien, relâchement ; 0xC0 : rétroaction,
// connexion), rangés à la place de l'un d'eux. **Anomalie reproduite** : les deux derniers
// instruments ne sont pas convertis (le compte s'arrête au nombre moins deux) ; les programmes 126
// et 127, et les percussions des notes 126 et 127, joueraient des paramètres bruts.
function convertirLaBanque(jeu, decalage, selecteurArg) {
  dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0x10, (ebp) => {
    const selecteur = selecteurArg & 0xFFFF;
    const banque = lointain(jeu, decalage, selecteur);
    let fiche = (decalage + long(jeu, banque + ENTETE_INSTRUMENTS)) >>> 0;
    let n = 0, dernier = null;
    for (; (n & 0xFFFF) < motSigne(jeu, banque + ENTETE_NOMBRE) - 2; n++) {
      const i = lointain(jeu, fiche, selecteur);
      const b = (k) => octet(jeu, i + k);
      poserOctet(jeu, i + 0x0B, (b(0x0B) << 7) | (b(0x0C) << 6) | (b(0x07) << 5) | (b(0x0D) << 4) | b(0x03));
      poserOctet(jeu, i + 0x02, (b(0x02) << 6) | b(0x0A));
      poserOctet(jeu, i + 0x05, (b(0x05) << 4) | b(0x08));
      poserOctet(jeu, i + 0x06, (b(0x06) << 4) | b(0x09));
      poserOctet(jeu, i + 0x0E, (b(0x04) << 1) | b(0x0E));
      poserOctet(jeu, i + 0x18, (b(0x18) << 7) | (b(0x19) << 6) | (b(0x14) << 5) | (b(0x1A) << 4) | b(0x10));
      poserOctet(jeu, i + 0x0F, (b(0x0F) << 6) | b(0x17));
      poserOctet(jeu, i + 0x12, (b(0x12) << 4) | b(0x15));
      dernier = (b(0x13) << 4) | b(0x16);
      poserOctet(jeu, i + 0x13, dernier);
      fiche = (fiche + TAILLE_INSTRUMENT) >>> 0;
    }
    // les restes : le sélecteur, la fiche, le compte, et la dernière valeur assemblée
    poserMot(jeu, ebp - 0xC, selecteurArg);
    poserLong(jeu, ebp - 0x10, fiche);
    poserLong(jeu, ebp - 4, n);
    if (dernier !== null) poserLong(jeu, ebp - 8, dernier);
  });
}

// ================================================================================================
// LES MODULES DE HMIDRV.386
// ================================================================================================
// Appelées une fois, à l'installation des bruitages, hors de toute interruption : leurs restes,
// dans la pile du jeu, ne sont pas reproduits.

// Chercher un module de HMIDRV.386 par son identifiant, le charger dans un bloc alloué, et rendre
// l'adresse du bloc (en `adresseRendue`, pointeur proche) et un pointeur lointain par un sélecteur
// dont la base est le début du bloc (en `(decalageRendu, selecteurRendu)`). `veutOption` : un pilote
// matériel doit aussi porter le bit 7 de l'octet +0x2D. `apres` : ce que fait l'appelant une fois le
// fichier fermé.
// **Anomalies reproduites** : le parcours lit un en-tête de plus que le nombre de modules ; un
// module introuvable ne se signale pas — le pointeur lointain rendu est alors fait de deux variables
// jamais écrites, lues dans la pile là où l'original les avait ; faute de mémoire, le fichier reste
// ouvert.
function chargerUnModule(jeu, ebp, id, adresseRendue, decalageRendu, selecteurRendu, veutOption, apres) {
  jeu.appeler(STRCPY, CHEMIN, DOSSIER_DES_PILOTES);
  jeu.appeler(STRCAT, CHEMIN, NOM_HMIDRV);
  const fichier = jeu.appeler(OUVRIR, CHEMIN, ACCES_LECTURE);
  if ((fichier | 0) === -1) return ERR_FICHIER;
  jeu.appeler(LIRE, fichier, ENTETE_FICHIER, 0x2C);
  let trouve = false;
  let selecteurDuBloc = 0, decalageDuBloc = 0;
  for (let rang = 0; !(rang > long(jeu, NOMBRE_MODULES)) && !trouve; rang++) {
    jeu.appeler(LIRE, fichier, ENTETE_MODULE, 0x30);
    const taille = long(jeu, TAILLE_MODULE);
    if (long(jeu, ID_MODULE) === (id >>> 0) && (!veutOption || (octet(jeu, OPTIONS_MODULE) & 0x80))) {
      trouve = true;
      const bloc = jeu.appeler(ALLOUER, taille);
      if (bloc === 0) return ERR_PAS_DE_MEMOIRE;
      jeu.appeler(VERROUILLER, bloc, taille);
      const selecteur = jeu.appeler(SELECTEUR_DU_BLOC, bloc);
      decalageDuBloc = jeu.appeler(POINTEUR_DU_SELECTEUR, selecteur);
      selecteurDuBloc = jeu.T.R.edx & 0xFFFF;
      jeu.appeler(LIRE, fichier, bloc, taille);
      poserLong(jeu, adresseRendue, bloc);
    } else {
      jeu.appeler(DEPLACER, fichier, taille, DEPUIS_ICI);
    }
  }
  jeu.appeler(FERMER, fichier);
  apres();
  if (!trouve) {
    selecteurDuBloc = mot(jeu, ebp - 0x2C);
    decalageDuBloc = long(jeu, ebp - 0x30);
  }
  const rendu = lointain(jeu, decalageRendu, selecteurRendu);
  poserMot(jeu, rendu + 4, selecteurDuBloc);
  poserLong(jeu, rendu, decalageDuBloc);
  return 0;
}

// 0x8EDA6 — charger le pilote matériel `id` (0xE000 à 0xE200) comme pilote numérique numéro `n`
// (0 à 5) : son identifiant est retenu et le pilote marqué chargé.
function chargerLePiloteMateriel(jeu, id, n, adresseRendue, decalageRendu, selecteurRendu) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0x30, (ebp) => {
    if ((n >>> 0) > MAX_PILOTES) return ERR_NUMERO;
    if (long(jeu, PILOTE_CHARGE + 4 * n) !== 0) return ERR_DEJA_CHARGE;
    if ((id >>> 0) < 0xE000 || (id >>> 0) > 0xE200) return ERR_IDENTIFIANT;
    return chargerUnModule(jeu, ebp, id, adresseRendue, decalageRendu, selecteurRendu, true, () => {
      poserLong(jeu, ID_DU_PILOTE + 4 * n, long(jeu, ID_MODULE));
      poserLong(jeu, PILOTE_CHARGE + 4 * n, 1);
    });
  });
}

// 0x8F00C — charger le module de mélange `id` (0x1000 à 0x1023).
function chargerLeModuleDeMelange(jeu, id, adresseRendue, decalageRendu, selecteurRendu) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0x30, (ebp) => {
    if ((id >>> 0) < 0x1000 || (id >>> 0) > 0x1023) return ERR_IDENTIFIANT;
    return chargerUnModule(jeu, ebp, id, adresseRendue, decalageRendu, selecteurRendu, false, () => {});
  });
}

// 0x8ECEF — demander au pilote matériel numéro `n` sa description (sa fonction 8, par 0x8BD24, qui
// range en (decalage, selecteur) le pointeur lointain de la réponse). Rend 1 si le pilote n'est pas
// chargé, 2 si l'adresse de la réponse est nulle.
function demanderLaDescription(jeu, n, decalage, selecteurArg) {
  return dansLeCadre(jeu, EBX_ESI_EDI_EBP, 0x10, () => {
    const selecteur = selecteurArg & 0xFFFF;
    const image = IMAGE_DU_PILOTE + Math.imul(n, 6);
    if (long(jeu, image) === 0 && mot(jeu, image + 4) === 0) return 1;
    const selecteurImage = mot(jeu, image + 4), decalageImage = long(jeu, image);
    const pilote = long(jeu, ADRESSE_DU_PILOTE + 4 * n);
    if (decalage === 0 && selecteur === 0) return 2;
    jeu.appeler(APPELER_FONCTION_8, pilote, decalageImage, selecteurImage, decalage, selecteur);
    return 0;
  });
}

// ================================================================================================

// Les quatre entrées de la table du pilote reviennent par `retf` : leurs arguments commencent 8
// octets au-dessus du pointeur de pile, et le retour retire 4 octets de plus que l'adresse proche.
const lointaine = { convention: 'registres', nettoie: 4 };

export const reecritures = [
  // la table du pilote FM
  { adresse: 0x8E485, nom: 'envoyerDonneesMidi', fn: envoyerDonneesMidi, ...lointaine },
  { adresse: 0x8E4B4, nom: 'installerLePilote', fn: installerLePilote, ...lointaine, memoire: 'entiere' },
  { adresse: 0x8E4EF, nom: 'defaireLePiloteFm', fn: defaireLePilote, ...lointaine, memoire: 'entiere' },
  { adresse: 0x8E50D, nom: 'remettreLePilote', fn: remettreLePilote, ...lointaine },
  { adresse: 0x8E52B, nom: 'recevoirUneBanque', fn: recevoirUneBanque, ...lointaine, memoire: 'entiere' },
  // les messages
  { adresse: 0x8DD58, nom: 'aiguillerMessage', fn: aiguillerMessage, arguments: 4 },
  { adresse: 0x8D616, nom: 'jouerNote', fn: jouerNote, arguments: 3 },
  { adresse: 0x8DB06, nom: 'relacherNote', fn: relacherNote, arguments: 4 },
  { adresse: 0x8D4CF, nom: 'changerControleur', fn: changerControleur, arguments: 4 },
  { adresse: 0x8DC05, nom: 'relacherLeCanal', fn: relacherLeCanal, arguments: 1 },
  { adresse: 0x8DCAE, nom: 'remettreLesControleurs', fn: remettreLesControleurs, arguments: 1 },
  { adresse: 0x92CEC, nom: 'reglerVolume', fn: reglerVolume, arguments: 2 },
  { adresse: 0x8D255, nom: 'courberLaHauteur', fn: courberLaHauteur, arguments: 4 },
  { adresse: 0x92F7D, nom: 'changerProgramme', fn: changerProgramme, arguments: 4 },
  { adresse: 0x92EB6, nom: 'choisirUneVoix', fn: choisirUneVoix, arguments: 2, retour: true },
  { adresse: 0x8D317, nom: 'frequenceCourbee', fn: frequenceCourbee, arguments: 3, retour: true },
  { adresse: 0x8E61D, nom: 'poserLaFrequence', fn: poserLaFrequence, arguments: 2, retour: true },
  // la puce
  { adresse: 0x8EBD8, nom: 'ecrirePuce', fn: ecrirePuce, arguments: 2, retour: true },
  { adresse: 0x8E57C, nom: 'ouvrirPuce', fn: ouvrirPuce, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x8E6B3, nom: 'eteindreLesVoix', fn: eteindreLesVoix, arguments: 1, retour: true },
  { adresse: 0x8E8AF, nom: 'arreterPuce', fn: arreterPuce, arguments: 0, retour: true },
  { adresse: 0x8E3B8, nom: 'fermerPuce', fn: fermerPuce, arguments: 0, memoire: 'entiere' },
  { adresse: 0x8EBA6, nom: 'marquerLaPuceFermee', fn: marquerLaPuceFermee, arguments: 0, retour: true },
  { adresse: 0x8E76D, nom: 'lancerVoix', fn: lancerVoix, arguments: 2, retour: true },
  { adresse: 0x8E82F, nom: 'couperVoix', fn: couperVoix, arguments: 1, retour: true },
  { adresse: 0x8E99D, nom: 'chargerInstrument', fn: chargerInstrument, arguments: 3, retour: true },
  // l'installation et les banques
  { adresse: 0x8E41D, nom: 'installerPuce', fn: installerPuce, arguments: 4, retour: true, memoire: 'entiere' },
  { adresse: 0x8DF55, nom: 'remettreLEtatMidi', fn: remettreLEtatMidi, arguments: 0 },
  { adresse: 0x8E03D, nom: 'rangerLaBanque', fn: rangerLaBanque, arguments: 4, memoire: 'entiere' },
  { adresse: 0x8E196, nom: 'convertirLaBanque', fn: convertirLaBanque, arguments: 2, memoire: 'entiere' },
  // les modules de HMIDRV.386
  { adresse: 0x8EDA6, nom: 'chargerLePiloteMateriel', fn: chargerLePiloteMateriel, arguments: 5, retour: true, memoire: 'entiere' },
  { adresse: 0x8F00C, nom: 'chargerLeModuleDeMelange', fn: chargerLeModuleDeMelange, arguments: 4, retour: true, memoire: 'entiere' },
  { adresse: 0x8ECEF, nom: 'demanderLaDescription', fn: demanderLaDescription, arguments: 3, retour: true, memoire: 'entiere' },
];

export const enAttente = [];
