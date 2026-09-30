// Les fonctions de MAIN.EXE que le moteur autonome n'a pas, et pourquoi.
//
// Le programme compte 1 098 fonctions. Le moteur autonome (moteur/hote/processeur.js) n'exécute que
// le code lisible : une fonction qui n'est ni réécrite (les listes `reecritures` et `enAttente` des
// modules, demarrage.js) ni rendue par l'hôte n'existe pas pour lui. Chacune des 250 autres est posée
// ici à son adresse, avec la raison de son absence : si le jeu l'appelait, il s'arrêterait en la
// nommant, au lieu d'aller dans une adresse inconnue.
//
// Aucune n'est à réécrire : toutes les fonctions qu'une partie peut atteindre sur l'hôte le sont, et
// celles de l'introduction (INTRO.EXE, qui partage ce code : moteur/jeu/intro.js) aussi — la
// détection des cartes son, que le jeu saute (option -o) et qu'elle fait, a été réécrite pour elle
// (sos-bruitages.js, section 9).
// Le classement suit le graphe d'appels du programme d'origine (travail/desasm.json) : une fonction
// est rangée avec la routine qui l'atteint.
//
//  - reseau : le jeu en réseau, lancé par l'option -m (NetBIOS, int 5Ch, n'existe pas dans l'hôte),
//    et ce qu'il est seul à appeler : `system`, le lancement d'un programme ;
//  - pilotes : les pilotes de musique compilés dans le programme pour d'autres cartes que la puce FM,
//    appelés par leur table : l'hôte ne déclare que la puce FM (BF_MUSIC=SB16FM) ;
//  - hote : l'intérieur d'`int386x`, dont l'hôte rend le cœur (0x89F90) ;
//  - extendeur : l'agrandissement du tas sous un autre extendeur que DOS/4GW, le seul que l'hôte
//    imite (le point d'entrée, demarrage.js, refuse les autres) ;
//  - donnees : ce que les données du jeu ne demandent jamais — les conversions de scanf %c, %n, %[
//    et des flottants (les cinq formats de scanf du programme n'ont que %s, %x et %d), le « %hf » de
//    printf, l'ouverture d'un fichier en ajout (le jeu n'ouvre que sndsetup.inf, en lecture), les
//    fichiers temporaires (il n'en crée pas) ;
//  - integrees : les sous-routines en assembleur du dépaquetage RNC (0x87B2C), que sa réécriture
//    fait elle-même ;
//  - mort : aucun chemin n'y mène (les états 0x28 à 0x2E des visiteurs, que seules ces fonctions
//    posent ; « con », 0x7E342, une donnée que le désassembleur a prise pour du code) ;
//  - bornes : des fonctions vides de SOS dont seule l'adresse sert, pour verrouiller des plages de
//    mémoire (DPMI 0600h) ; jamais appelées.

const RAISONS = {
  reseau: "le jeu en réseau (option -m) : NetBIOS n'existe pas dans l'hôte",
  pilotes: "un pilote de musique pour une autre carte que la puce FM : l'hôte ne déclare que la puce FM",
  hote: "l'intérieur d'int386x, que l'hôte rend lui-même",
  extendeur: "l'agrandissement du tas sous un autre extendeur que DOS/4GW, le seul que l'hôte imite",
  donnees: 'une conversion, un mode d\'ouverture ou un fichier temporaire que les données du jeu ne demandent jamais',
  integrees: 'une sous-routine du dépaquetage RNC (0x87B2C), que sa réécriture fait elle-même',
  mort: 'du code mort : aucun chemin du programme n\'y mène',
  bornes: "une borne de plage verrouillée de SOS : seule son adresse sert",
};

const LISTES = {
  reseau: [
    0x482EB, 0x48438, 0x484BD, 0x48554, 0x485B4, 0x485F3, 0x48683, 0x487A0, 0x48920, 0x48951,
    0x48A01, 0x48A7E, 0x48B49, 0x48C11, 0x48CD9, 0x48DD0, 0x48EBC, 0x48F65, 0x49001, 0x490DF,
    0x49195, 0x49246, 0x492AF, 0x49358, 0x493BE, 0x49414, 0x49704, 0x499F2, 0x49B20, 0x7F3F0,
    0x81622, 0x81627, 0x816D6, 0x816F4, 0x8173D, 0x87EF8, 0x87F25, 0x87F44, 0x87F73, 0x882CD,
    0x8F57B, 0x8F58E, 0x8F5BC, 0x8F609, 0x8F64F, 0x8F668, 0x8F7C3, 0x8F82F, 0x8F8FA, 0x8F93B,
    0x8F9E1, 0x8FA01, 0x8FAF1, 0x8FB0E, 0x92FBC, 0x92FCF, 0x93275,
  ],
  pilotes: [
    0x8BAF9, 0x8C001, 0x8C022, 0x8C09D, 0x8C0E9, 0x8C10A, 0x8C411, 0x8C590, 0x8C627, 0x8C7B3,
    0x8C7F4, 0x8C86A, 0x8C87B, 0x8C93F, 0x8C9D9, 0x8CB05, 0x8CC96, 0x8CF8B, 0x8CFAC, 0x8D172,
    0x8D1E3, 0x8EC8B, 0x90713, 0x907BC, 0x90820, 0x90888, 0x90901, 0x90983, 0x90AD7, 0x90B05,
    0x90B70, 0x90EA8, 0x90ED6, 0x90F31, 0x91514, 0x9162C, 0x91663, 0x91697, 0x916C0, 0x916E9,
    0x91709, 0x91810, 0x91839, 0x918DB, 0x91985, 0x919B1, 0x919D3, 0x91A52, 0x91AC4, 0x91B5A,
    0x91BB4, 0x91DA5, 0x91F05, 0x91F0D, 0x91F4D, 0x92020, 0x920B4, 0x921A5, 0x921EB, 0x92274,
    0x922A9, 0x923AF, 0x92457, 0x9282D, 0x92973, 0x92C01, 0x92C9F,
  ],
  hote: [
    0x89FC7, 0x8A068,
  ],
  extendeur: [
    0x90104, 0x931CB,
  ],
  donnees: [
    0x831C5, 0x831D8, 0x887FE, 0x8A9A8, 0x8B01C, 0x8B18D, 0x8B1D8, 0x8B21C, 0x8B2FB, 0x8B811,
    0x8B91D, 0x90530, 0x90605,
  ],
  integrees: [
    0x87CC0, 0x87CC9, 0x87D0C, 0x87D8F,
  ],
  mort: [
    0x64F03, 0x6521B, 0x65419, 0x65820, 0x7E342,
  ],
  bornes: [
    0x7F67E, 0x80180, 0x82163, 0x821AD, 0x821EB, 0x828DA, 0x83751, 0x84821, 0x84832, 0x84866,
    0x84877, 0x85628, 0x85639, 0x85771, 0x85782, 0x8610A, 0x863D4, 0x87262, 0x879E7, 0x87B1A,
    0x88D3A, 0x88D6F, 0x88D80, 0x892B9, 0x892CA, 0x8941D, 0x8942E, 0x89E3A, 0x89E4B, 0x89F16,
    0x8A368, 0x8A5A0, 0x8BAE8, 0x8BB2C, 0x8BB40, 0x8BFEF, 0x8BFF0, 0x8C052, 0x8C06B, 0x8C084,
    0x8C0C7, 0x8C0D8, 0x8C60E, 0x8C7D2, 0x8C7E3, 0x8CC74, 0x8CC85, 0x8CEF1, 0x8CF02, 0x8CF69,
    0x8CF7A, 0x8D201, 0x8D21A, 0x8D233, 0x8D244, 0x8D4AD, 0x8D4BE, 0x8D5F4, 0x8D605, 0x8DAE4,
    0x8DAF5, 0x8DD36, 0x8DD47, 0x8DF33, 0x8DF44, 0x8E01B, 0x8E02C, 0x8E396, 0x8E3A7, 0x8E3FB,
    0x8E40C, 0x8E463, 0x8E474, 0x8E55A, 0x8E56B, 0x8E5FB, 0x8E60C, 0x8E691, 0x8E6A2, 0x8E74B,
    0x8E75C, 0x8E80D, 0x8E81E, 0x8E88D, 0x8E89E, 0x8E97B, 0x8E98C, 0x8EB84, 0x8EB95, 0x8EBC5,
    0x8ECDE, 0x8ED84, 0x8ED95, 0x8F207, 0x8F218, 0x8F2AF, 0x8F2C0, 0x8F329, 0x8F33A, 0x8F3A5,
  ],
};

// adresse -> raison
export const HORS_D_USAGE = new Map();
for (const [genre, adresses] of Object.entries(LISTES)) {
  for (const a of adresses) HORS_D_USAGE.set(a, `${RAISONS[genre]} (${genre})`);
}

// Le compte par genre, pour le journal et outils/avancement.py.
export const COMPTES = Object.fromEntries(Object.entries(LISTES).map(([g, l]) => [g, l.length]));

export class FonctionHorsDUsage extends Error {
  constructor(adresse, raison) {
    super(`la fonction 0x${adresse.toString(16).toUpperCase()} n'est pas dans le moteur autonome : ${raison}`);
    this.adresse = adresse;
    this.raison = raison;
  }
}
