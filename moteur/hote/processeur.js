// Le processeur du moteur autonome : ce qui reste de la machine x86 quand tout le programme est
// réécrit.
//
// Le moteur lisible (moteur/jeu/) garde la convention d'appel de 1994 : les arguments d'une fonction
// passent par la pile du jeu, dans sa mémoire, et son résultat par eax ; les fonctions se désignent
// par l'adresse qu'elles avaient dans MAIN.EXE, et c'est par ces adresses que le jeu range ses
// routines dans ses tables (les états des visiteurs, les gestionnaires d'interruption). Ce module
// offre à l'hôte et au code lisible la même interface que la transcription mécanique
// (travail/transcrit/jeu.js, produite par outils/transcrire.py) : les registres R, et une table des
// fonctions par adresse. Mais il n'exécute aucune instruction : chaque fonction de la table est une
// réécriture. Sans transcription, le moteur n'a plus besoin de MAIN.EXE pour tourner.
//
// Les registres vivent dans R, et nulle part ailleurs : `sauver` et `charger`, qui recopiaient ceux
// de la transcription, n'ont rien à faire ici.

export function creerProcesseur() {
  const R = {
    eax: 0, ecx: 0, edx: 0, ebx: 0, esp: 0, ebp: 0, esi: 0, edi: 0,
    cs: 0, ds: 0, es: 0, fs: 0, gs: 0, ss: 0,
    CF: false, ZF: false, SF: false, OF: false, DF: false, IF: true,
  };
  const FONCTIONS = new Map();
  // La première fonction posée à une adresse : celle du programme, que l'hôte enveloppe (le repère
  // d'image, 0x7D775) ou que les vérificateurs comparent.
  const ORIGINALES = new Map();
  let H = null;

  const introuvable = (adresse) => {
    const e = new Error(`pas de fonction en 0x${(adresse >>> 0).toString(16)} : le moteur autonome ne la connaît pas`);
    e.adresse = adresse >>> 0;
    return e;
  };

  return {
    R,
    autonome: true,
    initialiser(memoire, hote) {
      H = hote;
      for (const k of ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi', 'cs', 'ds', 'es', 'fs', 'gs', 'ss']) R[k] = 0;
      R.CF = R.ZF = R.SF = R.OF = R.DF = false;
      R.IF = true;
      FONCTIONS.clear();
      ORIGINALES.clear();
    },
    sauver() {},
    charger() {},
    reglerQuota() {},
    lireRegistre(n) { return R[n]; },
    ecrireRegistres(valeurs) { Object.assign(R, valeurs); },
    // Appeler la fonction d'une adresse. Une adresse inconnue du programme peut être celle d'un
    // module de son chargé depuis HMIDRV.386, que l'hôte joue lui-même (moteur/hote/son.js) ; sinon,
    // c'est une fonction que le moteur autonome n'a pas (moteur/jeu/hors-d-usage.js les nomme).
    appeler(adresse) {
      const f = FONCTIONS.get(adresse >>> 0);
      if (f !== undefined) { f(); return; }
      if (H) { H.appelInconnu(adresse >>> 0); return; }
      throw introuvable(adresse);
    },
    fonction(adresse) { return FONCTIONS.get(adresse >>> 0); },
    originale(adresse) {
      return ORIGINALES.has(adresse >>> 0) ? ORIGINALES.get(adresse >>> 0) : FONCTIONS.get(adresse >>> 0);
    },
    // Poser une fonction à une adresse. La première posée est celle du programme ; les suivantes
    // l'enveloppent ou la remplacent (l'hôte, la page).
    remplacer(adresse, fn) {
      if (!ORIGINALES.has(adresse >>> 0)) ORIGINALES.set(adresse >>> 0, fn);
      FONCTIONS.set(adresse >>> 0, fn);
    },
    connait(adresse) { return FONCTIONS.has(adresse >>> 0); },
    adresses() { return [...FONCTIONS.keys()]; },
  };
}
