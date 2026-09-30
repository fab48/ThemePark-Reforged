// Le chemin de sortie du jeu : ce que le programme défait en quittant, du parc jusqu'au retour au DOS.
//
// Réécriture lisible des routines que le scénario `quitter` exerce (la démonstration, puis F6).
// Voir docs/guide-reecriture.md ; docs/retro-ingenierie.md § 9 pour le son, § 12 pour la
// bibliothèque C.
//
// L'ordre de la sortie. La boucle du parc (0x11C45, amorcage.js) rend la main au `main` (0x10010,
// evenements.js) après avoir appelé 0x185B0, qui ne fait rien. Le `main` appelle alors :
//
//  1. 0x108B1, quitter le programme : la minuterie du jeu rendue (0x5CB6C), la souris arrêtée — ou,
//     avec les options -r et -p, les gestes enregistrés écrits dans RECORD.GAM —, le son arrêté
//     (0x10977 : 0x7EED0 les bruitages, 0x7EF60 la musique et la bibliothèque SOS), et le mode vidéo
//     trouvé au lancement rétabli (0x7E270) ;
//  2. 0x10C2F, les ressources de la table 0xB0B6C rendues au tas du jeu (0x5F7A5) ;
//  3. le retour au DOS : les trois vecteurs de nettoyage (0xBECC0 à 0xBECC8, qui montrent tous 0x7E2A0,
//     un simple `ret`), puis les routines de fin de la bibliothèque C (0x87307), dont la seule est la
//     fermeture des flots (0x904C5), et le service 4Ch.
//
// LE TAS DU JEU (0x7EDC0, 0x7EE48). Les 256 descripteurs de 0x12 octets en 0xDF9C8, chaînés
// (systeme.js, § 5) : +0 adresse du bloc, +4 taille (0 : descripteur libre), +8 suivant, +0xC
// précédent, +0x10 octet « pris », +0x11 octet « sorte ». La tête de la chaîne est toujours le
// premier descripteur. Ces deux routines appartiennent à systeme.js, où elles seront à ranger.
//
// LES FLOTS DE LA BIBLIOTHÈQUE C (0x87307, 0x904C5, 0x904DF, 0x831A1, 0x83257, 0x8B8B4, 0x9046C,
// 0x8B8E8). Le FILE de Watcom (runtime.js) : +0 position dans le tampon, +4 octets en attente, +8
// tampon, +0xC drapeaux (mot long), +0x10 descripteur, +0x19 numéro du fichier temporaire. Les
// flots ouverts sont chaînés en [0xE12A0] par des maillons { suivant, FILE* } ; un flot fermé rend
// son maillon à la liste [0xE0D08]. Les noms d'origine de Watcom, entre guillemets simples, sont
// reconnus à la forme du code, pas lus dans le programme. Ces routines appartiennent à runtime.js.

// --- arithmétique de 1994 ----------------------------------------------------------------------
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Exécuter `corps(ebp)` avec le pointeur de pile là où l'original l'avait après son prologue :
// `sauves` octets de registres empilés (ebp compris), puis `locales` octets de variables. Les appels
// faits dans `corps` empilent à la même hauteur que ceux de l'original et ne recouvrent pas les
// variables posées en mémoire (le même que dans systeme.js).
function avecCadre(jeu, sauves, locales, corps) {
  const T = jeu.T;
  T.sauver();
  const entree = T.R.esp;
  const ebp = ((entree >>> 0) - sauves) >>> 0;
  T.R.esp = (ebp - locales) | 0;
  T.charger();
  try {
    return corps(ebp);
  } finally {
    T.sauver();
    T.R.esp = entree;
    T.charger();
  }
}

// --- les variables ------------------------------------------------------------------------------
// Le son (§ 9.3).
const MUSIQUE_PRETE = 0xBA714;        // octet : la bibliothèque de musique est initialisée
const BRUITAGES_PRETS = 0xBA720;      // octet : celle des bruitages
const MORCEAU_EN_COURS = 0xBA71A;     // mot : 0 aucun
const SECONDE_PISTE = 0xBA710;        // octet : un second pilote de musique
const MORCEAU_SOS = 0xD7984, PILOTE_MUSIQUE = 0xD7980, PILOTE_MUSIQUE_2 = 0xD78DC;
const PILOTE_NUMERIQUE = 0xD7B44;
const EVENEMENT_DU_MELANGE = 0xD7B48; // la poignée de la routine de remplissage à la minuterie de SOS
// Les blocs de mémoire DOS des pilotes, à rendre : (décalage, sélecteur) chacun.
const PILOTES_EN_MEMOIRE_DOS = 0xD7994;   // octet : non nul si les deux blocs ont été pris
const BLOC_DOS_1 = 0xD798E, SELECTEUR_DOS_1 = 0xD7992;
const BLOC_DOS_2 = 0xD7988, SELECTEUR_DOS_2 = 0xD798C;
const BLOC_DOS_3 = 0xD78E0, SELECTEUR_DOS_3 = 0xD78E4;
// Deux structures de SOS rendues à la fin (0x86120), non établies : celle de la musique, celle des
// bruitages.
const FIN_DE_LA_MUSIQUE = 0xBEDF4, FIN_DES_BRUITAGES = 0xBEE78;

// La minuterie du jeu (ecrans-infos.js, 0x5CAD0).
const POIGNEE_DE_LA_MINUTERIE = 0xE3000;  // l'événement de SOS auquel le jeu s'est abonné
const ANCIEN_GESTIONNAIRE = 0xD78B0;      // mot long, puis 0xD78B4 mot : l'IRQ 0 du BIOS

// Les entrées enregistrées (souris-jeu.js).
const CURSEUR_AFFICHE = 0xBECB4;          // mot long : la souris du jeu est installée
const SOURCE_DES_ENTREES = 0xBECB2;       // octet : 0 normal, 1 enregistrement (-r), 2 relecture (-p)
const TAMPON_DES_ENTREES = 0xD3AEC;       // mot long : 6 octets par image
const IMAGE_ENREGISTREE = 0xD3AF0;        // mot long : le nombre d'images enregistrées
const RECORD_GAM = 0xB00C0;               // « RECORD.GAM »
const CREATION = 0x222;                   // le mode d'ouverture d'une création (0x7EB70)

// La vidéo.
const MODE_TEXTE_D_ORIGINE = 0xDE5F4;     // mot : le mode trouvé au lancement (systeme.js)
const MODE_AFFICHAGE = 0xDE5F6;           // mot : 1 = 320x200, 8 = 640x480
const REGS_EAX = 0;                       // la structure REGS d'int386 : eax en tête
const INT_VIDEO = 0x10;

// Les ressources.
const RESSOURCES_DE_SORTIE = 0xB0B6C;     // data/mspr-0.inf et la suite (amorcage.js)
const RESSOURCE_POINTEUR = 0x3E, TAILLE_RESSOURCE = 0x4F;

// Le tas du jeu.
const DESCRIPTEURS = 0xDF9C8;
const adresseDe = (jeu, d) => long(jeu, d);
const tailleDe = (jeu, d) => long(jeu, d + 4);
const suivant = (jeu, d) => long(jeu, d + 8);
const precedent = (jeu, d) => long(jeu, d + 0xC);
const PRIS = 0x10, SORTE = 0x11;

// Les flots.
const FLOTS = 0xC2D74, TAILLE_FLOT = 0x1A;
const FLOTS_STANDARD_FIN = FLOTS + 5 * TAILLE_FLOT;   // stdin, stdout, stderr, stdaux, stdprn
const FLOTS_OUVERTS = 0xE12A0;            // liste des flots ouverts : { suivant, FILE* }
const FLOTS_FERMES = 0xE0D08;             // liste des maillons récupérables
const ROUTINES_FIN = 0xCC802, ROUTINES_FIN_FIN = 0xCC808;   // une entrée de 6 octets
const FAITE = 2;                          // l'état d'une routine déjà exécutée
// Les octets des drapeaux d'un flot : +0xC bit 3, _BIGBUF (tampon alloué) ; +0xD bit 3, fichier
// temporaire à effacer ; +0xD bit 4, _DIRTY (tampon à écrire) ; +0xD bit 6, flot à fermer tout à
// fait même s'il est standard.
const BIGBUF = 8, TEMPORAIRE = 8, SALE = 0x10, TOUJOURS_FERMER = 0x40;

// --- les fonctions d'autres modules ou non réécrites --------------------------------------------
const INT386 = 0x7F085;                   // (n, entrée, sortie)
const ARRETER_LA_SOURIS = 0x7E0E1;
const OUVRIR = 0x7EB70, ECRIRE = 0x7ED80, FERMER = 0x7EC20;
const RENDRE_UNE_RESSOURCE = 0x5F76D;     // amorcage.js
const BILAN_DU_TAS = 0x82C78;
const ECRIRE_UN_PORT = 0x821DF;           // outp(port, valeur)
const POSER_UN_VECTEUR = 0x828EB;         // _dos_setvect(n, déplacement, sélecteur)
const RETIRER_EVENEMENT = 0x8260A;        // sosTIMERRemoveEvent(poignée)
const ARRETER_TOUS_LES_BRUITAGES = 0x80DC0;
const BRUITAGES_EN_COURS = 0x879C0;       // non nul tant qu'un bruitage joue (non établi au-delà)
const VOLUME_GENERAL = 0x87A84;           // (pilote, volume)
const FERMER_LA_MINUTERIE_SOS = 0x822C1;  // (0) : non établi
const DEFAIRE_LE_PILOTE_NUMERIQUE = 0x853CA;  // sosDIGIUnInitDriver(pilote, 1, 1)
const FERMER_SOS_NUMERIQUE = 0x84C6E;     // sosDIGIUnInitSystem, vraisemblablement
const RENDRE_UNE_STRUCTURE = 0x86120;     // (structure) : non établi
const ARRETER_MORCEAU = 0x7FC8D, LIBERER_MORCEAU = 0x7FBC2;
const REMETTRE_PILOTE = 0x8474A, DESACTIVER_PILOTE = 0x84639, FERMER_SOS = 0x84162;
const RENDRE_MEMOIRE_DOS = 0x7F068;       // (décalage, sélecteur)
const VIDER = 0x8B817;                    // '__flush' (runtime.js)
const POSITIONNER = 0x88394;              // 'lseek'(descripteur, décalage, origine)
const FERMER_DESCRIPTEUR = 0x8639A;       // 'close'
const LIBERER_FLOT = 0x8AC14;             // '__freefp'
const NOM_TEMPORAIRE = 0x831D8;           // (tampon, numéro) : le nom d'un fichier temporaire
const EFFACER = 0x8B91D;                  // 'remove'(nom)
const FREE = 0x8B8F8;                     // '_nfree' (runtime.js, 'liberer')

// ================================================================================================
// 1. Quitter le programme
// ================================================================================================

// 0x108B1 — quitter le programme, appelée par le `main` quand la boucle du parc a rendu la main. Ce
// n'est pas la fin d'une partie perdue (faillite.js) : c'est la sortie vers le DOS.
//
// Si la souris du jeu a été installée, la minuterie est d'abord rendue. En jeu normal, la souris est
// arrêtée ; avec -r ou -p, et un tampon de gestes, celui-ci est écrit dans RECORD.GAM (6 octets par
// image enregistrée), puis rendu au tas. Viennent ensuite 0x7E874 (vide), l'arrêt du son, et, si la
// minuterie a été rendue, le retour au mode vidéo d'origine.
//
// ANOMALIE REPRODUITE : avec -p, le tampon relu est lui aussi réécrit dans RECORD.GAM, jusqu'à
// l'image où la relecture s'est arrêtée — le fichier relu est donc tronqué à ce qui a été rejoué.
function quitterLeProgramme(jeu) {
  let minuterieRendue = false;
  if (long(jeu, CURSEUR_AFFICHE) !== 0) {
    jeu.appeler(0x5CB6C);
    minuterieRendue = true;
  }
  if ((jeu.m8[SOURCE_DES_ENTREES] & 3) === 0 && long(jeu, CURSEUR_AFFICHE) !== 0) {
    jeu.appeler(ARRETER_LA_SOURIS);
  } else if (long(jeu, TAMPON_DES_ENTREES) !== 0) {
    const poignee = jeu.appeler(OUVRIR, RECORD_GAM, CREATION) | 0;
    if (poignee !== -1) {
      jeu.appeler(ECRIRE, poignee, long(jeu, TAMPON_DES_ENTREES), Math.imul(long(jeu, IMAGE_ENREGISTREE), 6));
      jeu.appeler(FERMER, poignee);
    }
    jeu.appeler(0x7EDC0, long(jeu, TAMPON_DES_ENTREES));
  }
  jeu.appeler(0x7E874);
  jeu.appeler(0x10977);
  if (minuterieRendue) jeu.appeler(0x7E270);
}

// 0x7E874 — une fonction vide, appelée en quittant le programme (un point d'accroche, non établi).
function rienALaFin() {}

// 0x185B0 — une fonction vide, appelée par la boucle du parc juste avant de rendre la main.
function rienEnQuittantLeParc() {}

// 0x7E2A0 — un simple `ret` : ce que montrent les trois vecteurs de nettoyage 0xBECC0 à 0xBECC8.
function aucunNettoyage() {}

// 0x5CB6C — rendre la minuterie du jeu (le contraire de 0x5CAD0, ecrans-infos.js). Si la
// bibliothèque de son la tenait, on s'y désabonne ; sinon le compteur 0 du circuit de minuterie
// reprend son diviseur d'origine (0, soit 65 536 : 18,2 Hz) et l'IRQ 0 son gestionnaire du BIOS.
function rendreLaMinuterie(jeu) {
  if (jeu.m8[MUSIQUE_PRETE] !== 0 || jeu.m8[BRUITAGES_PRETS] !== 0) {
    jeu.appeler(RETIRER_EVENEMENT, long(jeu, POIGNEE_DE_LA_MINUTERIE));
    return;
  }
  jeu.appeler(ECRIRE_UN_PORT, 0x43, 0x36);
  jeu.appeler(ECRIRE_UN_PORT, 0x40, 0);
  jeu.appeler(ECRIRE_UN_PORT, 0x40, 0);
  jeu.appeler(POSER_UN_VECTEUR, 8, long(jeu, ANCIEN_GESTIONNAIRE), mot(jeu, ANCIEN_GESTIONNAIRE + 4));
}

// 0x7E270 — rendre le mode vidéo trouvé au lancement (int 10h, fonction 0 : ah nul, al le mode).
// La structure des registres est sur la pile, là où l'original la posait : l'hôte lit aussi les
// champs que le jeu n'a pas remplis.
function rendreLeModeVideo(jeu) {
  avecCadre(jeu, 16, 0x38, (ebp) => {
    const entree = ebp - 0x1C, sortie = ebp - 0x38;
    poserLong(jeu, entree + REGS_EAX, mot(jeu, MODE_TEXTE_D_ORIGINE));
    jeu.appeler(INT386, INT_VIDEO, entree, sortie);
  });
}

// 0x10C2F — rendre au tas les ressources de la table 0xB0B6C, en basse comme en haute résolution
// (un autre mode ne rend rien).
function rendreLesRessources(jeu) {
  const mode = mot(jeu, MODE_AFFICHAGE);
  if (mode === 1 || mode === 8) jeu.appeler(0x5F7A5, RESSOURCES_DE_SORTIE);
}

// 0x5F7A5 — rendre chaque ressource d'une table (fiches de 0x4F octets, jusqu'à celle dont le
// pointeur +0x3E est nul ; amorcage.js).
function rendreUneTable(jeu, table) {
  for (let r = table >>> 0; long(jeu, r + RESSOURCE_POINTEUR) !== 0; r = (r + TAILLE_RESSOURCE) >>> 0) {
    jeu.appeler(RENDRE_UNE_RESSOURCE, r);
  }
}

// ================================================================================================
// 2. Le son
// ================================================================================================

// 0x10977 — arrêter le son : les bruitages, puis la musique.
function arreterLeSon(jeu) {
  jeu.appeler(0x7EED0);
  jeu.appeler(0x7EF60);
}

// 0x7EED0 — défaire les bruitages : tout arrêter, attendre que plus rien ne joue, couper le
// volume, retirer le mélange de la minuterie de SOS — et la minuterie elle-même si la musique ne
// s'en sert pas —, puis défaire le pilote numérique et le système.
function defaireLesBruitages(jeu) {
  if (jeu.m8[BRUITAGES_PRETS] === 0) return;
  jeu.appeler(ARRETER_TOUS_LES_BRUITAGES);
  while (jeu.appeler(BRUITAGES_EN_COURS) !== 0) { /* attente active */ }
  jeu.appeler(VOLUME_GENERAL, long(jeu, PILOTE_NUMERIQUE), 0);
  jeu.appeler(RETIRER_EVENEMENT, long(jeu, EVENEMENT_DU_MELANGE));
  if (jeu.m8[MUSIQUE_PRETE] === 0) jeu.appeler(FERMER_LA_MINUTERIE_SOS, 0);
  jeu.appeler(DEFAIRE_LE_PILOTE_NUMERIQUE, long(jeu, PILOTE_NUMERIQUE), 1, 1);
  jeu.appeler(FERMER_SOS_NUMERIQUE);
  jeu.appeler(RENDRE_UNE_STRUCTURE, FIN_DES_BRUITAGES);
}

// 0x7EF60 — défaire la musique : le morceau en cours arrêté et défait, les pilotes remis puis
// désactivés, la minuterie de SOS et le système fermés, les blocs de mémoire DOS des pilotes
// rendus.
//
// Contrairement à l'arrêt ordinaire (0x80990, systeme.js), le morceau est arrêté sans demander
// s'il est fini, et le numéro du morceau en cours n'est pas remis à zéro.
function defaireLaMusique(jeu) {
  if (jeu.m8[MUSIQUE_PRETE] === 0) return;
  const seconde = () => jeu.m8[SECONDE_PISTE] !== 0;
  if (mot(jeu, MORCEAU_EN_COURS) !== 0) {
    jeu.appeler(ARRETER_MORCEAU, long(jeu, MORCEAU_SOS));
    jeu.appeler(LIBERER_MORCEAU, long(jeu, MORCEAU_SOS));
    jeu.appeler(REMETTRE_PILOTE, long(jeu, PILOTE_MUSIQUE));
  }
  if (seconde()) jeu.appeler(REMETTRE_PILOTE, long(jeu, PILOTE_MUSIQUE_2));
  jeu.appeler(DESACTIVER_PILOTE, long(jeu, PILOTE_MUSIQUE), 1);
  if (seconde()) jeu.appeler(DESACTIVER_PILOTE, long(jeu, PILOTE_MUSIQUE_2), 1);
  jeu.appeler(FERMER_LA_MINUTERIE_SOS, 0);
  jeu.appeler(FERMER_SOS);
  if (jeu.m8[PILOTES_EN_MEMOIRE_DOS] !== 0) {
    jeu.appeler(RENDRE_MEMOIRE_DOS, long(jeu, BLOC_DOS_1), mot(jeu, SELECTEUR_DOS_1));
    jeu.appeler(RENDRE_MEMOIRE_DOS, long(jeu, BLOC_DOS_2), mot(jeu, SELECTEUR_DOS_2));
  }
  if (seconde()) jeu.appeler(RENDRE_MEMOIRE_DOS, long(jeu, BLOC_DOS_3), mot(jeu, SELECTEUR_DOS_3));
  jeu.appeler(RENDRE_UNE_STRUCTURE, FIN_DE_LA_MUSIQUE);
}

// 0x7F068 — rendre un bloc de la musique (les timbres de la puce FM, INST.BNK et DRUM.BNK, chargés
// par son-du-jeu.js), donné comme un pointeur lointain (décalage, sélecteur) : seul le décalage sert,
// c'est un bloc du tas du jeu (0x7EDC0).
function rendreUnBlocDesPilotes(jeu, bloc) {
  avecCadre(jeu, 16, 0, () => jeu.appeler(0x7EDC0, bloc));
}

// ================================================================================================
// 3. Le tas du jeu
// ================================================================================================

// 0x7EDC0 — rendre un bloc du tas du jeu. Le descripteur dont le bloc commence à `bloc` est marqué
// libre ; s'il y en a un, chaque descripteur libre de la chaîne est ensuite fondu dans son
// précédent (0x7EE48). Le bilan du tas est refait dans tous les cas.
function libererUnBloc(jeu, bloc) {
  let trouve = false;
  for (let d = DESCRIPTEURS; d !== 0; d = suivant(jeu, d)) {
    if (adresseDe(jeu, d) === (bloc >>> 0)) {
      jeu.m8[d + PRIS] = 0;
      trouve = true;
      break;
    }
  }
  if (trouve) {
    for (let d = DESCRIPTEURS; d !== 0; d = suivant(jeu, d)) {
      if (jeu.m8[d + PRIS] === 0) jeu.appeler(0x7EE48, d);
    }
  }
  jeu.appeler(BILAN_DU_TAS);
}

// 0x7EE48 — fondre un descripteur libre dans son précédent, s'ils sont de la même sorte et que le
// précédent est libre lui aussi : le précédent prend sa taille et sa place dans la chaîne, et le
// descripteur, de taille nulle, redevient disponible. Il garde son lien vers le suivant, ce qui
// laisse 0x7EDC0 poursuivre sa traversée.
function fondreDansLePrecedent(jeu, d) {
  const p = precedent(jeu, d);
  if (p === 0) return;
  jeu.m8[d + PRIS] = 0;
  if (jeu.m8[d + SORTE] !== jeu.m8[p + SORTE] || jeu.m8[p + PRIS] !== 0) return;
  if (suivant(jeu, d) !== 0) poserLong(jeu, suivant(jeu, d) + 0xC, p);
  poserLong(jeu, p + 8, suivant(jeu, d));
  poserLong(jeu, p + 4, tailleDe(jeu, p) + tailleDe(jeu, d));
  poserLong(jeu, d + 4, 0);
}

// ================================================================================================
// 4. La bibliothèque C : les routines de fin et la fermeture des flots
// ================================================================================================

// 0x87307 — '__FiniRtns' : exécuter les routines de fin de la table 0xCC802 (entrées de 6 octets :
// état, priorité, adresse), de la plus haute priorité à la plus basse (à égalité, la dernière de la
// table d'abord), chacune une fois. Le pendant de 0x872C4 (runtime.js). Seul `es` est gardé autour
// des appels, qui le reçoivent égal à `ds`.
function executerLesRoutinesDeFin(jeu) {
  const { m8 } = jeu;
  const T = jeu.T, R = T.R;
  const entree = R.esp >>> 0;
  const esEntree = R.es;
  for (;;) {
    let choisie = ROUTINES_FIN_FIN;
    let priorite = 0;
    for (let e = ROUTINES_FIN; e < ROUTINES_FIN_FIN; e += 6) {
      if (m8[e] === FAITE) continue;
      if (priorite <= m8[e + 1]) { choisie = e; priorite = m8[e + 1]; }
    }
    if (choisie === ROUTINES_FIN_FIN) break;
    const routine = long(jeu, choisie + 2);
    if (routine !== 0) {
      T.sauver(); R.es = R.ds; T.charger();          // push ds ; pop es
      jeu.appelerDepuis(0x87340, (entree - 16) | 0, routine);
    }
    m8[choisie] = FAITE;
  }
  T.sauver(); R.es = esEntree; T.charger();
}

// 0x904C5 — '__full_io_exit' : la seule routine de fin. Fermer tous les flots, puis rendre au tas
// les maillons de la liste des flots fermés (le code de '__purgefp', en 0x8AC47, que la routine
// rejoint par un saut).
function fermerLesFlotsEnSortant(jeu) {
  jeu.appeler(0x904DF, 0);
  while (long(jeu, FLOTS_FERMES) !== 0) {
    const maillon = long(jeu, FLOTS_FERMES);
    const reste = long(jeu, maillon);
    jeu.appeler(0x8B8E8, maillon);
    poserLong(jeu, FLOTS_FERMES, reste);
  }
}

// 0x904DF — '__fcloseall'(premier) : fermer chaque flot ouvert. Les flots standard (les cinq
// premiers des vingt flots statiques) à partir du numéro `premier` sont vidés et libérés, mais leur
// descripteur reste ouvert, sauf s'ils portent le bit 0x40 de l'octet +0xD ; ceux d'avant ne sont
// pas touchés. Rend le nombre de flots fermés.
function fermerTousLesFlots(jeu, premier) {
  const limite = (Math.imul(premier, TAILLE_FLOT) + FLOTS) >>> 0;
  let fermes = 0;
  let maillon = long(jeu, FLOTS_OUVERTS);
  while (maillon !== 0) {
    const suivantMaillon = long(jeu, maillon);
    const f = long(jeu, maillon + 4);
    let fermerLeDescripteur = 1;
    if ((jeu.m8[f + 0xD] & TOUJOURS_FERMER) === 0) {
      if (f < limite) { maillon = suivantMaillon; continue; }
      if (f < FLOTS_STANDARD_FIN) fermerLeDescripteur = 0;
    }
    fermes++;
    jeu.appeler(0x831A1, f, fermerLeDescripteur);
    maillon = suivantMaillon;
  }
  return fermes;
}

// 0x831A1 — '__shutdown_stream'(f, fermerLeDescripteur) : fermer le flot (0x83257), puis rendre son
// maillon (0x8AC14). Rend le résultat de la fermeture.
function fermerUnFlot(jeu, f, fermerLeDescripteur) {
  const resultat = jeu.appeler(0x83257, f, fermerLeDescripteur);
  jeu.appeler(LIBERER_FLOT, f);
  return resultat;
}

// 0x83257 — '__doclose'(f, fermerLeDescripteur) : un flot sans drapeaux n'est pas ouvert (rend -1).
// Sinon, un tampon sale est écrit, puis le fichier est replacé à la position logique du flot ; le
// descripteur est fermé si demandé, le tampon alloué rendu, et un fichier temporaire effacé. Rend
// 0, ou une valeur non nulle si l'écriture ou la fermeture a échoué.
//
// Le nom du fichier temporaire est composé dans une variable locale de 16 octets : les appels
// partent de la hauteur de pile de l'original pour ne pas l'écraser.
function fermerLeFlot(jeu, f, fermerLeDescripteur) {
  const { m8 } = jeu;
  if (long(jeu, f + 0xC) === 0) return -1;
  const entree = jeu.T.lireRegistre('esp') >>> 0;
  const nom = (entree - 12 - 0x10) >>> 0;              // [ebp-0x10], sous ebx, esi et ebp
  let resultat = 0;
  if (m8[f + 0xD] & SALE) resultat = jeu.appeler(VIDER, f);
  const position = jeu.appeler(0x8B8B4, f) | 0;
  if (position !== -1) jeu.appeler(POSITIONNER, long(jeu, f + 0x10), position, 0);
  if (fermerLeDescripteur !== 0) resultat |= jeu.appeler(FERMER_DESCRIPTEUR, long(jeu, f + 0x10));
  if (m8[f + 0xC] & BIGBUF) {
    jeu.appeler(0x8B8E8, long(jeu, f + 8));
    poserLong(jeu, f + 8, 0);
  }
  if (m8[f + 0xD] & TEMPORAIRE) {
    jeu.appelerDepuis(0x832E0, nom, NOM_TEMPORAIRE, nom, m8[f + 0x19]);
    jeu.appelerDepuis(0x832EC, nom, EFFACER, nom);
  }
  return resultat;
}

// 0x8B8B4 — la position logique d'un flot : celle du descripteur (0x9046C), plus ce qui attend
// dans un tampon sale, ou moins ce qui a été lu d'avance. Rend -1 si le descripteur ne répond pas.
function positionDuFlot(jeu, f) {
  const position = jeu.appeler(0x9046C, long(jeu, f + 0x10)) | 0;
  if (position === -1) return -1;
  const enAttente = long(jeu, f + 4);
  if (enAttente === 0) return position;
  return (jeu.m8[f + 0xD] & SALE) ? (enAttente + position) | 0 : (position - enAttente) | 0;
}

// 0x9046C — 'tell'(descripteur) : lseek(descripteur, 0, SEEK_CUR).
function positionDuDescripteur(jeu, descripteur) {
  return jeu.appeler(POSITIONNER, descripteur, 0, 1);
}

// 0x8B8E8 — 'free' : le tas de Watcom n'a qu'une sorte de mémoire, '_nfree' fait le travail.
function libererMemoire(jeu, p) {
  jeu.appeler(FREE, p);
}

// ================================================================================================
// 5. Hors du chemin de sortie : le remplissage de l'écran en 640x480
// ================================================================================================
//
// 0x815B8 appartient à la carte vidéo de systeme.js, à côté de son double 0x81590 ; elle attend ici
// d'y être rangée.

const TOUS_REGISTRES = ['eax', 'ecx', 'edx', 'ebx', 'esi', 'edi', 'ebp', 'esp'];
const LIGNE_HAUTE = 640;

// 0x815B8 — remplir `lignes` lignes de 640 octets à partir de `destination` (par `rep stosd` sur
// es:edi, l'octet répété dans les quatre du mot long). edi avance jusqu'à la fin de la zone, et
// reste là : l'original ne le sauve pas. Le double en 320x200 est 0x81590 (systeme.js).
function remplirDesLignesHaute(jeu, R) {
  const esp = R.esp >>> 0;
  const destination = long(jeu, esp + 4), lignes = mot(jeu, esp + 8), octet = jeu.m8[esp + 12];
  const n = lignes * LIGNE_HAUTE;
  jeu.m8.fill(octet, destination, destination + n);
  R.edi = (destination + n) | 0;
}

// ================================================================================================
// Les entrées
// ================================================================================================

export const reecritures = [
  // quitter le programme
  { adresse: 0x108B1, nom: 'quitterLeProgramme', fn: quitterLeProgramme, arguments: 0, memoire: 'entiere' },
  { adresse: 0x7E874, nom: 'rienALaFin', fn: rienALaFin, arguments: 0 },
  { adresse: 0x185B0, nom: 'rienEnQuittantLeParc', fn: rienEnQuittantLeParc, arguments: 0 },
  { adresse: 0x7E2A0, nom: 'aucunNettoyage', fn: aucunNettoyage, arguments: 0 },
  { adresse: 0x5CB6C, nom: 'rendreLaMinuterie', fn: rendreLaMinuterie, arguments: 0 },
  { adresse: 0x7E270, nom: 'rendreLeModeVideo', fn: rendreLeModeVideo, arguments: 0 },
  { adresse: 0x10C2F, nom: 'rendreLesRessources', fn: rendreLesRessources, arguments: 0, memoire: 'entiere' },
  { adresse: 0x5F7A5, nom: 'rendreUneTable', fn: rendreUneTable, arguments: 1, memoire: 'entiere' },
  // le son
  { adresse: 0x10977, nom: 'arreterLeSon', fn: arreterLeSon, arguments: 0, memoire: 'entiere' },
  { adresse: 0x7EED0, nom: 'defaireLesBruitages', fn: defaireLesBruitages, arguments: 0, memoire: 'entiere' },
  { adresse: 0x7EF60, nom: 'defaireLaMusique', fn: defaireLaMusique, arguments: 0, memoire: 'entiere' },
  { adresse: 0x7F068, nom: 'rendreUnBlocDesPilotes', fn: rendreUnBlocDesPilotes, arguments: 2, memoire: 'entiere' },
  // le tas du jeu
  { adresse: 0x7EDC0, nom: 'libererUnBloc', fn: libererUnBloc, arguments: 1 },
  { adresse: 0x7EE48, nom: 'fondreDansLePrecedent', fn: fondreDansLePrecedent, arguments: 1 },
  // la bibliothèque C
  { adresse: 0x87307, nom: 'executerLesRoutinesDeFin', fn: executerLesRoutinesDeFin, arguments: 0,
    memoire: 'entiere', registresCompares: ['ebx', 'esi', 'edi', 'ebp', 'esp', 'es'] },
  { adresse: 0x904C5, nom: 'fermerLesFlotsEnSortant', fn: fermerLesFlotsEnSortant, arguments: 0, memoire: 'entiere' },
  { adresse: 0x904DF, nom: 'fermerTousLesFlots', fn: fermerTousLesFlots, arguments: 1, retour: true,
    memoire: 'entiere' },
  { adresse: 0x831A1, nom: 'fermerUnFlot', fn: fermerUnFlot, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x83257, nom: 'fermerLeFlot', fn: fermerLeFlot, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x8B8B4, nom: 'positionDuFlot', fn: positionDuFlot, arguments: 1, retour: true },
  { adresse: 0x9046C, nom: 'positionDuDescripteur', fn: positionDuDescripteur, arguments: 1, retour: true },
  { adresse: 0x8B8E8, nom: 'libererMemoire', fn: libererMemoire, arguments: 1, memoire: 'entiere' },
  // la carte vidéo
  { adresse: 0x815B8, nom: 'remplirDesLignesHaute', fn: remplirDesLignesHaute, convention: 'registres',
    arguments: 3, registresCompares: TOUS_REGISTRES,
    zones: (jeu, R) => {
      const esp = R.esp >>> 0, debut = jeu.machine.r32(esp + 4) >>> 0;
      return [[debut, debut + jeu.machine.r16(esp + 8) * LIGNE_HAUTE]];
    } },
];

export const enAttente = [];
