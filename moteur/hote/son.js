// Le son : ce que la carte son et les pilotes de HMI fournissaient au jeu en 1994.
//
// Theme Park passe par la bibliotheque HMI SOS, liee dans MAIN.EXE et donc transcrite. Deux voies :
//
// - La musique. Le sequenceur de SOS lit les morceaux (.HMP) au rythme de la minuterie, et son
//   pilote FM, lui aussi compile dans MAIN.EXE, les joue en ecrivant les registres de la puce OPL
//   par les ports 0x388 et 0x389. L'hote fournit la puce (opl.js) : tout le reste est le code
//   d'origine, instruments (INST.BNK, DRUM.BNK) et allocation des voix compris.
//
// - Les bruitages. Ici SOS charge deux modules exterieurs depuis HMIDRV.386 : un pilote materiel
//   (la Sound Blaster, son DMA, son interruption) et un module de melange, que la bibliotheque
//   appelle par leur adresse. Ce code-la n'est pas dans MAIN.EXE et n'est pas transcrit : l'hote le
//   remplace. SOS garde les echantillons en cours dans 32 descripteurs de 0x6C octets qui
//   appartiennent au module de melange ; sosDIGIStartSample, sosDIGIStopSample et
//   sosDIGISampleDone (transcrits) les remplissent et les lisent, et le module les consomme a
//   chaque appel de sa routine de remplissage, que le jeu fait appeler par la minuterie de SOS
//   (60 a 240 fois par seconde). L'hote tient ce role : il melange les echantillons actifs et tient
//   les descripteurs a jour, fin de lecture et boucles comprises.
//
// Le son est produit en temps virtuel : chaque evenement (registre de la puce, remplissage) est date,
// et le son est rendu jusqu'a sa date avant d'etre applique. La partie est donc la meme avec ou sans
// sortie sonore, et le son d'une partie rejouee est toujours le meme.
//
// Deux facons de rendre ce son, qui ne changent rien a la partie (les descripteurs avancent de meme,
// au meme rythme) :
//  - le RENDU (par defaut : Node, les verificateurs, l'extraction des films et des musiques) : la
//    puce FM et le melange des bruitages produisent des echantillons, remis a `surSortie` (stereo
//    entrelacee, 44 100 Hz, flottants), que le lanceur Node ecrit dans un fichier WAV ;
//  - les EVENEMENTS (la page, `evenements(recepteur)`) : ni synthese ni melange. L'hote dit ce que le
//    jeu demande — tel bruitage de telle banque commence, a tel volume, en boucle ou non, change de
//    volume, s'arrete ; tel morceau commence, reprend, finit, s'arrete ; le volume et le tempo de la
//    musique — et la page joue des fichiers (moteur/web/audio.js) : les WAV des bruitages, les mp3
//    des musiques, ou ce qu'un moddeur a mis a leur place. La puce recoit toujours ses registres (le
//    jeu peut relire son etat), mais n'est plus jamais rendue.
//
// Adresses et structures : docs/retro-ingenierie.md, section « Le son ».

import { Opl, FREQUENCE_OPL } from './opl.js';

export const FREQUENCE_SON = 44100;

// Le repit des bruitages (voir Son.repit) : en secondes, du depart entendu d'un bruitage au suivant.
// HURRAY (0x26), malgre son nom un « huuum » ecoeure d'une seule voix, est joue par 0x80FE0 au
// premier pas de chaque visiteur a l'ecran sur une case souillee de vomi, et relance des qu'il
// finit : mesure sur la partie de Fabien (FAB.GY du 28 septembre, 188 s a vitesse normale), 97
// departs, un toutes les 1,6 s (mediane), entendu 60 % du temps. SICK (0xD), le vomi, est joue par
// 0x80C80 pour tout visiteur qui vomit, meme hors de l'ecran, et par-dessus un autre en cours.
export const REPITS_DES_BRUITAGES = { SICK: 5, HURRAY: 10 };

// Tables de SOS, indexees par le numero du pilote numerique (0 a 4).
// Les tables de SOS ou l'hote trouve les modules charges, aux adresses de MAIN.EXE ; le programme de
// l'introduction, INTRO.EXE, a les siennes (option `sos` du constructeur).
export const SOS_DE_MAIN = {
  entreePilote: 0xC3206,         // adresse du pilote materiel charge
  idPilote: 0xC32E2,             // son identifiant (0xE017 : Sound Blaster 16, 16 bits)
  entreeMelangeur: 0xC3238,      // adresse du module de melange charge
  moduleDeDetection: 0xE0CC4,    // adresse du module de detection charge (HMIDET.386)
};

// Ce que l'hote lit de la couche de Bullfrog et de SOS pour dire, en evenements, ce que le jeu
// demande (voir evenements). Adresses de MAIN.EXE, que l'introduction transportee (image-intro.js)
// partage : elle lance ses morceaux et ses bruitages par les memes routines (0x80A20, 0x80C80).
export const COUCHE_DE_BULLFROG = {
  musiquePrete: 0xBA714,         // octet : la musique est ouverte
  musiqueVoulue: 0xBA715,        // octet : l'option MUSIQUE du jeu (menus.js, la touche S)
  morceauEnCours: 0xBA71A,       // mot : le numero du morceau lance par 0x80A20, 0 aucun
  tempo: 0xBA718,                // mot : le tempo du morceau, en pour cent (0x80E40, les attractions)
  morceauSos: 0xD7984,           // mot long : la poignee SOS du morceau
  morceauJoue: 0xBFF4E,          // 8 x 4 : vrai tant que le morceau de cette poignee joue (sosMIDISongDone)
  volumeGeneral: 0xC2AC5,        // octet, 0 a 127 : le volume de la musique ([ et ] dans le parc, 0x800AB)
  tableDesMorceaux: 0xD790C,     // la table de la banque de musique chargee (32 octets par morceau)
  tableDesBruitages: 0xD7B60,    // celle de la banque de bruitages (nom, donnees en +0x12, taille en +0x1A)
  nombreDeBruitages: 0xD7B68,    // mot
  fichierDesMorceaux: 0xBEDF4,   // le descripteur de ressource du .dat charge : son nom en tete
  fichierDesBruitages: 0xBEE78,  // (« data/music0-0.dat », « data/snds0-2.dat » : la banque et sa qualite)
};

// Les modules de detection de HMIDET.386 que l'hote imite : ceux de la Sound Blaster 16 (8 ou 16
// bits, mono ou stereo), qui ont tous le meme code. Le module commence par un saut vers son
// aiguillage (`jmp`, 5 octets), suivi de son identifiant.
const DETECTION_SB16 = new Set([0xE015, 0xE016, 0xE017, 0xE018]);
const DET_PORT = 0x127;          // mot : le port trouve (fonction 0), relu par la fonction 1
const DET_SELECTEURS = [0xC7, 0xCF, 0xD7, 0xDF];   // l'aiguillage y range son ds
const DET_ETAT = 0x131;          // mot : le resultat de la verification (fonction 3)
const DET_A_VERIFIER = 0x12F;    // mot, puis octets en +4 et +6 : le port, l'IRQ et le DMA a verifier
const DET_DESCRIPTION = 0x83;    // la description de la carte, que la fonction 2 designe

// Ce que l'hote range dans les images des modules charges, qu'il n'execute pas.
const DESCRIPTION = 0x100;       // description du pilote materiel (lue par sosDIGIInitDriver)
const REMPLISSAGE = 0x10;        // « routine » de remplissage du module de melange
const DONNEES = 0x40;
const DESCRIPTEURS = 0x100;      // les 32 descripteurs d'echantillon
const TAILLE_DESCRIPTEUR = 0x6C;

// Descripteur d'echantillon (rempli par sosDIGIStartSample, 0x8943F)
const D_DEBUT = 0x00;            // pointeur lointain : debut des donnees
const D_POSITION = 0x08;         // pointeur lointain : position courante
const D_RESTE = 0x18;            // octets restant a jouer
const D_TAILLE = 0x1C;           // taille, pour reprendre une boucle
const D_DRAPEAUX = 0x30;         // 0x8000 en cours, 0x4000 en boucle, 0x2000 premier passage, 0x0100 volume
const D_VOLUME = 0x32;           // 0 a 0x7FFF
const D_BOUCLES = 0x38;          // boucles restantes, 0xFFFF : sans fin
const D_RAPPEL = 0x3C;           // pointeur lointain de la routine de fin (inutilise par le jeu)
const D_FRACTION = 0x48;         // l'hote y garde la fraction de la position (16 bits)

// Pilotes numeriques qui jouent des echantillons de 16 bits (les autres : 8 bits non signes).
const SEIZE_BITS = new Set([0xE004, 0xE006, 0xE008, 0xE00A, 0xE00D, 0xE00E, 0xE017, 0xE018, 0xE020]);

// puissance moyenne d'un son stereo entrelace (calculee une fois par son)
const PUISSANCES = new WeakMap();
function puissanceMoyenne(pcm) {
  if (!PUISSANCES.has(pcm)) {
    let p = 0;
    for (let k = 0; k < pcm.length; k++) p += pcm[k] * pcm[k];
    PUISSANCES.set(pcm, pcm.length ? p / pcm.length : 0);
  }
  return PUISSANCES.get(pcm);
}

export class Son {
  // numerique : ligne BF_SOUND (« carte port irq dma ») ; musique : ligne BF_MUSIC (« carte port »).
  // Les noms de cartes sont ceux du programme d'installation : SB16, SBPRO, SBLAST... et ADLIB,
  // SB16FM... pour la musique.
  // sos : les adresses des tables de SOS (SOS_DE_MAIN par defaut).
  constructor(machine, options = {}) {
    const { numerique = 'SB16 220 5 1', musique = 'SB16FM 388', sos = SOS_DE_MAIN } = options === true ? {} : options;
    this.machine = machine;
    this.sos = sos;
    this.carteNumerique = numerique;      // ce que le jeu lira dans BF_SOUND
    this.carteMusique = musique;          // et dans BF_MUSIC
    this.basePuce = parseInt((musique || '').split(/\s+/)[1] || '388', 16);
    this.opl = new Opl();
    this.index = [0, 0x100];
    this.pilotes = [];               // par numero de pilote SOS : son etat
    this.frames = 0;                 // echantillons de sortie rendus par la puce
    this.emis = 0;                   // echantillons remis a surSortie
    this.melanges = 0;               // echantillons ou les bruitages sont deja melanges
    this.attente = new Float32Array(2 * 4096);   // rendus, pas encore remis (a partir de `emis`)
    this.oplProduits = 0;            // echantillons de la puce produits
    this.oplA = new Float64Array(2); this.oplB = new Float64Array(2);
    this.oplTampon = new Int32Array(2);
    // Equilibre entre la puce FM et les bruitages : les morceaux joues au volume plein culminent vers
    // 0,9 (RIDE4, INTRO3), les bruitages au volume plein a 0,6.
    this.gainMusique = 1.0;
    this.gainEffets = 0.6;
    this.surSortie = null;
    this.signales = new Set();
    // sons de remplacement (voir remplacer)
    this.remplacements = null;
    this.voix = new Array(32).fill(null);   // par descripteur : le remplacement qu'il joue
    this.libres = [];                        // remplacements qui finissent apres leur descripteur
    this.nomsBruitages = new Map();          // adresse des donnees -> nom
    this.morceauRemplace = null;             // { nom, pcm, pos, rms } : le morceau remplace en cours
    this.niveauPuce = 0;                     // puissance moyenne de la puce (morceau remplace)
    // repit des bruitages (voir repit)
    this.repits = null;                      // nom -> delai en echantillons de sortie ; null : aucun
    this.muets = new Array(32).fill(false);  // par descripteur : son depart est tu (repit)
    this.entendus = new Map();               // nom -> echantillon de sortie du dernier depart entendu
    // les evenements (voir evenements) ; null : le rendu
    this.recepteur = null;
    this.enAttente = [];                     // evenements pas encore remis au recepteur
    this.numeroDeSon = 0;                    // le dernier identifiant de bruitage donne
    this.musique = { morceau: 0, joue: false, volume: -1, tempo: -1, dejaJoue: 0 };   // l'etat deja annonce
    this.banques = new Map();                // adresse d'un descripteur de ressource -> [adresse de la table, nom de la banque]
    if (options && typeof options.evenements === 'function') this.evenements(options.evenements);
  }

  // --- les evenements (la page) ----------------------------------------------------------------------
  // `recepteur(liste)` recoit, par paquets, ce que le jeu demande, date en secondes de temps virtuel
  // (`t`) :
  //   { t, genre: 'bruitage', action: 'jouer', id, banque, nom, numero, volume, boucle }
  //   { t, genre: 'bruitage', action: 'volume', id, volume }   { t, genre: 'bruitage', action: 'arreter', id }
  //   { t, genre: 'musique', action: 'jouer', morceau, banque, nom, reprise, volume, tempo }
  //   { t, genre: 'musique', action: 'fini' | 'arreter', morceau }
  //   { t, genre: 'musique', action: 'volume', volume }   { t, genre: 'musique', action: 'tempo', tempo }
  // banque : SNDS0-2, MUSIC0-0... (le fichier que le jeu a charge) ; numero : la place du son dans sa
  // banque, a partir de 1 (celle d'assets/index.json, `fichiers`, plus un) ; volume : de 0 a 1 (le
  // descripteur de SOS, ou le volume general de la musique sur 127) ; boucle : le jeu le rejoue sans
  // fin (drapeau 0x4000), la page le boucle jusqu'a son arret ; tempo : en pour cent. Un bruitage
  // non boucle qui finit n'a pas d'evenement : le fichier joue jusqu'a sa propre fin. Un morceau
  // « fini » est relance par le jeu quand il le veut (0x801A0 : la musique du parc boucle ainsi) :
  // `jouer` avec `reprise`.
  evenements(recepteur) {
    this.recepteur = recepteur || null;
    this.journal(recepteur ? 'evenements pour la page (ni synthese ni melange)' : 'rendu');
  }
  signaler(e) { this.enAttente.push(e); }
  remettre() {
    if (!this.enAttente.length || !this.recepteur) return;
    const liste = this.enAttente;
    this.enAttente = [];
    this.recepteur(liste);
  }

  // La banque chargee d'apres son descripteur de ressource (« data\snds0-2.dat » -> SNDS0-2), gardee
  // tant que la table n'a pas change d'adresse.
  nomDeBanque(descripteur, table) {
    const connu = this.banques.get(descripteur);
    if (connu && connu[0] === table) return connu[1];
    const nom = this.machine.chaineC(descripteur, 62).replace(/\\/g, '/').split('/').pop().replace(/\.[^.]*$/, '').toUpperCase();
    this.banques.set(descripteur, [table, nom]);
    return nom;
  }
  // Un bruitage par l'adresse de ses donnees : { banque, nom, numero }. Plusieurs entrees peuvent
  // partager une adresse (les NULL.RAW, vides) : la premiere qui a des octets l'emporte.
  bruitageDe(debut) {
    const B = COUCHE_DE_BULLFROG, m = this.machine, table = m.r32(B.tableDesBruitages), n = m.r16(B.nombreDeBruitages);
    let trouve = 0;
    for (let k = 1; k <= n && table; k++) {
      if (m.r32(table + 32 * k + 0x12) !== debut) continue;
      if (!trouve) trouve = k;
      if (m.r32(table + 32 * k + 0x1A)) { trouve = k; break; }
    }
    return {
      banque: table ? this.nomDeBanque(B.fichierDesBruitages, table) : null,
      nom: trouve ? m.chaineC(table + 32 * trouve, 18).replace(/\.[^.]*$/, '').toUpperCase() : null,
      numero: trouve,
    };
  }
  // Le morceau `n` de la banque de musique chargee : { banque, nom }.
  morceauDe(n) {
    const B = COUCHE_DE_BULLFROG, m = this.machine, table = m.r32(B.tableDesMorceaux);
    if (!n || !table) return { banque: null, nom: null };
    return {
      banque: this.nomDeBanque(B.fichierDesMorceaux, table),
      nom: m.chaineC(table + 32 * n, 18).replace(/\.[^.]*$/, '').toUpperCase(),
    };
  }

  // L'etat de la musique, compare a celui deja annonce : ce qui a change devient un evenement. Lu a
  // chaque image et a chaque tic de remplissage : la couche de Bullfrog pose ces variables hors des
  // interruptions, le sequenceur de SOS dit pendant elles quand un morceau finit.
  observerLaMusique(t) {
    const B = COUCHE_DE_BULLFROG, m = this.machine, e = this.musique;
    const permise = m.m8[B.musiquePrete] !== 0 && m.m8[B.musiqueVoulue] !== 0;
    const morceau = permise ? m.r16(B.morceauEnCours) : 0;
    const poignee = m.r32(B.morceauSos) >>> 0;
    const joue = morceau !== 0 && poignee < 8 && m.r32(B.morceauJoue + 4 * poignee) !== 0;
    const volume = m.m8[B.volumeGeneral], tempo = m.r16(B.tempo);
    if (volume !== e.volume) {
      e.volume = volume;
      this.signaler({ t, genre: 'musique', action: 'volume', volume: Math.min(1, volume / 127) });
    }
    if (tempo !== e.tempo && tempo > 0) {
      e.tempo = tempo;
      this.signaler({ t, genre: 'musique', action: 'tempo', tempo });
    }
    if (morceau !== e.morceau) {
      if (e.morceau) this.signaler({ t, genre: 'musique', action: 'arreter', morceau: e.morceau });
      e.morceau = morceau;
      e.joue = false;
    }
    if (morceau && joue !== e.joue) {
      e.joue = joue;
      if (joue) {
        this.signaler({ t, genre: 'musique', action: 'jouer', morceau, ...this.morceauDe(morceau),
          reprise: this.musique.dejaJoue === morceau, volume: Math.min(1, volume / 127), tempo: tempo || 100 });
        this.musique.dejaJoue = morceau;
      } else this.signaler({ t, genre: 'musique', action: 'fini', morceau });
    }
    if (!morceau) this.musique.dejaJoue = 0;
  }

  // --- sons de remplacement --------------------------------------------------------------------------
  // Pour mettre le jeu a niveau sans toucher a sa logique : un son d'aujourd'hui joue a la place
  // d'un son de 1994. `r` : { bruitages: { NOM: pcm }, musiques: { NOM: pcm } }, NOM etant le nom du
  // jeu sans extension (BUTTON, RIDE4, voir outils/extraire_sons.py), pcm un Float32Array stereo
  // entrelace a 44 100 Hz. Le jeu n'en voit rien : ses descripteurs d'echantillon avancent au rythme
  // de l'original, seul le son produit change. Un bruitage remplacant joue jusqu'a sa propre fin,
  // sauf si le jeu l'arrete ; une musique remplacante boucle, a un volume qui suit celui que la puce
  // aurait eu.
  remplacer(r) {
    const table = (o) => new Map(Object.entries(o || {}).map(([nom, pcm]) => [nom.toUpperCase(), pcm]));
    this.remplacements = { bruitages: table(r.bruitages), musiques: table(r.musiques) };
    const n = this.remplacements.bruitages.size, m = this.remplacements.musiques.size;
    this.machine.journal(`son : ${n} bruitages et ${m} musiques de remplacement`);
  }

  // Le nom d'un bruitage, par l'adresse de ses donnees, dans la table de la banque chargee
  // ([0xD7B60], entrees de 32 octets : nom, puis pointeur des donnees en +0x12).
  nomBruitage(debut) {
    const m = this.machine, table = m.r32(0xD7B60), n = m.r16(0xD7B68);
    const cle = `${table}:${debut}`;
    if (!this.nomsBruitages.has(cle)) {
      let nom = null;
      for (let k = 1; k <= n && table; k++) {
        if (m.r32(table + 32 * k + 0x12) === debut) nom = m.chaineC(table + 32 * k, 18).replace(/\.[^.]*$/, '').toUpperCase();
      }
      this.nomsBruitages.set(cle, nom);
    }
    return this.nomsBruitages.get(cle);
  }
  // Le morceau en cours : son numero en [0xBA71A], la table de sa banque en [0xD790C].
  nomMorceau() {
    const m = this.machine, n = m.r16(0xBA71A), table = m.r32(0xD790C);
    if (!n || !table) return null;
    return m.chaineC(table + 32 * n, 18).replace(/\.[^.]*$/, '').toUpperCase();
  }

  // un remplacement dans le bloc : `voix` avance d'autant, rend faux quand il est fini
  jouerVoix(voix, bloc, n, volume) {
    const pcm = voix.pcm, fin = pcm.length / 2;
    for (let j = 0; j < n; j++) {
      if (voix.pos >= fin) {
        if (!voix.boucle) return false;
        voix.pos = 0;
      }
      bloc[2 * j] += pcm[2 * voix.pos] * volume;
      bloc[2 * j + 1] += pcm[2 * voix.pos + 1] * volume;
      voix.pos++;
    }
    return true;
  }

  // --- repit des bruitages ------------------------------------------------------------------------------
  // Certains bruitages reviennent sans cesse (REPITS_DES_BRUITAGES). `delais` : { NOM: secondes }, ou
  // null pour le son de 1994. Le depart d'un tel bruitage moins de `secondes` apres le dernier depart
  // entendu du meme est joue muet : comme pour les remplacements, le jeu n'en voit rien, le descripteur
  // avance au rythme de l'original (0x80FE0 le trouve en cours tant qu'il l'aurait ete). Un bruitage
  // joue en boucle (ambiance) n'est jamais tu. Le temps est celui du son rendu : la meme partie donne
  // toujours le meme son.
  repit(delais) {
    const entrees = Object.entries(delais || {});
    this.repits = entrees.length ? new Map(entrees.map(([nom, s]) => [nom.toUpperCase(), Math.round(s * FREQUENCE_SON)])) : null;
    if (this.repits) this.machine.journal(`son : repit des bruitages, ${entrees.map(([nom, s]) => `${nom} ${s} s`).join(', ')}`);
  }
  // Le depart du bruitage `nom` (au debut du bloc en cours de melange) : entendu, ou tu pendant son repit.
  entendre(nom) {
    const delai = this.repits && this.repits.get(nom);
    if (!delai) return true;
    const dernier = this.entendus.get(nom);
    if (dernier !== undefined && this.melanges - dernier < delai) return false;
    this.entendus.set(nom, this.melanges);
    return true;
  }

  journal(message) {
    if (this.signales.has(message)) return;
    this.signales.add(message);
    this.machine.journal('son : ' + message);
  }

  // Les variables d'environnement lues par le jeu (0x5F7D4 et 0x5FAB0) : elles tiennent lieu du
  // fichier sndsetup.inf ecrit par le programme d'installation.
  environnement() {
    const v = [];
    if (this.carteNumerique) v.push('BF_SOUND=' + this.carteNumerique);
    if (this.carteMusique) v.push('BF_MUSIC=' + this.carteMusique);
    return v;
  }

  // Sans l'option -o, le jeu fait chercher la carte par les pilotes de detection de HMIDET.386, qui
  // sondent le materiel ([0xBA722], vrai par defaut) : il s'en tient alors a la configuration declaree.
  optionLigneCommande() { return '-o'; }

  // Le jeu etait lance depuis D:\GAME, ou SOS trouvait ses pilotes (hmidrv.386...) ; l'hote le lance
  // depuis le dossier d'installation. On les cherche donc sur le CD.
  ouvrirPilote(nom) {
    const base = nom.replace(/\\/g, '/').split('/').pop();
    if (!/^HMI(DRV|MDRV|DET)\.386$/i.test(base)) return null;
    return this.machine.fichiers.ouvrir('D:/GAME/' + base.toUpperCase(), 0);
  }

  // --- le temps --------------------------------------------------------------------------------------
  // L'heure d'un evenement. Pendant une interruption de la minuterie, c'est l'heure nominale de ce
  // tic : l'hote livre d'un coup les tics echus pendant une image, et la musique, jouee par ces tics,
  // doit garder son rythme.
  maintenant() {
    const m = this.machine;
    if (m.enInterruption) return Math.min(m.us, m.prochainTic - m.periodePit());
    return m.us;
  }
  // Jusqu'ou le son peut etre rendu sans devancer un evenement a venir : le prochain tic de la
  // minuterie n'a pas encore ete livre.
  horizon() {
    const m = this.machine;
    return Math.min(m.us, m.prochainTic);
  }

  // --- ports de la puce FM ---------------------------------------------------------------------------
  gerePort(port) { return port >= this.basePuce && port < this.basePuce + 4; }
  entree(port) {
    if (port === this.basePuce) return this.opl.etat(this.machine.us);
    return 0xFF;
  }
  sortie(port, v) {
    const k = port - this.basePuce;
    if (k === 0) this.index[0] = v & 0xFF;
    else if (k === 2) this.index[1] = 0x100 | (v & 0xFF);
    else {
      this.rendreJusqua(this.maintenant());
      this.opl.ecrire(this.index[k >> 1], v, this.machine.us);
    }
  }

  // --- les modules de HMIDRV.386 ------------------------------------------------------------------------
  // Un appel du code du jeu vers une adresse qu'il ne connait pas : si c'est un module de SOS,
  // l'hote le joue. `lointain` : appel lointain (retf), sinon proche (ret).
  appel(adresse, lointain) {
    const m = this.machine;
    for (let i = 0; i < 5; i++) {
      const materiel = m.r32(this.sos.entreePilote + 4 * i) >>> 0;
      const melangeur = m.r32(this.sos.entreeMelangeur + 4 * i) >>> 0;
      if (!lointain && materiel && adresse === materiel) return () => this.fonctionPilote(i, materiel);
      if (!lointain && melangeur && adresse === melangeur) return () => this.fonctionMelangeur(i, melangeur);
      if (lointain && melangeur && adresse === melangeur + REMPLISSAGE) return () => this.remplissage(i);
    }
    // le module de detection, en dernier : SOS n'efface pas son adresse, et le pilote materiel, charge
    // ensuite, prend souvent sa place en memoire
    const detection = m.r32(this.sos.moduleDeDetection) >>> 0;
    if (!lointain && detection && adresse === detection) return () => this.fonctionDeDetection(detection);
    return null;
  }

  pilote(i) {
    if (!this.pilotes[i]) this.pilotes[i] = { frequence: 22050, bits: 8, descripteurs: 0, actif: false, id: 0 };
    return this.pilotes[i];
  }

  // Le pilote materiel : appele par les petites routines 0x8BCD0 a 0x8BFB8 de SOS, numero de fonction
  // dans eax, reponse dans les registres.
  fonctionPilote(i, entree) {
    const T = this.machine.T, R = T.R, m = this.machine;
    T.sauver();
    const p = this.pilote(i);
    p.id = m.r32(this.sos.idPilote + 4 * i) & 0xFFFF;
    p.bits = SEIZE_BITS.has(p.id) ? 16 : 8;
    const f = R.eax >>> 0;
    switch (f) {
      case 8: {      // description de la carte : fs:edx
        const d = entree + DESCRIPTION;
        m.m8.fill(0, d, d + 0x6C);
        m.w32(d + 0x24, p.bits);                             // bits par echantillon
        m.w32(d + 0x68, p.bits === 16 ? 0x1002 : 0x1000);    // module de melange a charger
        R.edx = DESCRIPTION;
        this.journal(`pilote numerique 0x${p.id.toString(16)} (${p.bits} bits)`);
        break;
      }
      case 2: p.frequence = R.ebx & 0xFFFF; break;           // frequence d'echantillonnage
      case 4: p.actif = true; break;                         // demarrage du DMA
      case 5: p.actif = false; break;                        // arret
      case 0: case 1: case 3: break;                         // materiel, fin, reglages
      default: this.journal(`fonction ${f} du pilote materiel`);
    }
    R.eax = 0;
    R.esp = (R.esp + 4) | 0;
    T.charger();
  }

  // Un module de detection de HMIDET.386, que SOS charge pour chercher la carte (sosDIGIDetect...,
  // 0x85950 et 0x85F3E dans MAIN.EXE ; le jeu les saute par son option -o, pas l'introduction) et
  // appelle par ses portes (0x8BD84, 0x8BCD0, 0x8BDAF), numero de fonction dans ax, le module dans
  // fs. Pour la Sound Blaster 16, d'apres son code : 0, chercher la carte en sondant le mixeur des
  // ports 0x210 a 0x240 (registre 0x3F ecrit puis relu) et rendre son port, ou 0 ; 1, lire dans le
  // mixeur l'IRQ (registre 0x80, dans ch) et le DMA (0x81, dans cl) de la carte du port trouve ;
  // 2, designer sa description (edx) ; 3, verifier un port, une IRQ et un DMA donnes. L'hote rend ce
  // que la carte qu'il declare (BF_SOUND) repondrait. Les portes rendent ebx, ecx, esi, edi et les
  // segments : seuls eax, edx, et ce que la porte relit (ch, cl), comptent.
  fonctionDeDetection(module) {
    const T = this.machine.T, R = T.R, m = this.machine;
    T.sauver();
    const id = m.r16(module + 5);
    if (!DETECTION_SB16.has(id)) throw new Error(`module de detection 0x${id.toString(16)} : non imite par l'hote`);
    const [, port = '220', irq = '5', dma = '1'] = (this.carteNumerique || '').split(/\s+/);
    const carte = { port: parseInt(port, 16), irq: parseInt(irq, 10), dma: parseInt(dma, 10) };
    // l'aiguillage : ds = fs (le module) range dans quatre mots, et ax recoit le bx de l'appelant
    for (const d of DET_SELECTEURS) m.w16(module + d, R.fs);
    const f = R.eax & 0xFFFF;
    R.eax = (R.eax & ~0xFFFF) | (R.ebx & 0xFFFF);
    // ce que le mixeur du port p rend pour l'IRQ et le DMA : la carte declaree, sinon un port vide (0xFF)
    const irqDuMixeur = (p) => (p === carte.port ? { 2: 3, 5: 5, 7: 7 }[carte.irq] ?? 0x0A : 0x0A);
    const dmaDuMixeur = (p) => (p === carte.port ? { 0: 0, 1: 1 }[carte.dma] ?? 3 : 3);
    switch (f) {
      case 0: {
        const trouve = [0x210, 0x220, 0x230, 0x240].includes(carte.port) ? carte.port : 0;
        if (trouve) m.w16(module + DET_PORT, trouve);
        R.eax = (R.eax & ~0xFFFF) | trouve;
        R.edx = (R.edx & ~0xFFFF) | ((trouve || 0x240) + 5);
        break;
      }
      case 1: {
        const p = m.r16(module + DET_PORT);
        R.ecx = (R.ecx & ~0xFFFF) | (irqDuMixeur(p) << 8) | dmaDuMixeur(p);
        R.eax = (R.eax & ~0xFFFF) | p;
        R.edx = (R.edx & ~0xFFFF) | ((p + 5) & 0xFFFF);
        break;
      }
      case 2: R.edx = DET_DESCRIPTION; break;
      case 3: {
        // le port, l'IRQ et le DMA a verifier (ax, ch, cl) sont notes ; sans carte a ce port, 0x10 ;
        // sinon le port est retenu, et l'IRQ puis le DMA lus au mixeur sont compares
        const p = R.eax & 0xFFFF, i = (R.ecx >>> 8) & 0xFF, d = R.ecx & 0xFF;
        m.w16(module + DET_A_VERIFIER, p);
        m.m8[module + DET_A_VERIFIER + 4] = i;
        m.m8[module + DET_A_VERIFIER + 6] = d;
        let etat = 0x10;
        if (p === carte.port) {
          m.w16(module + DET_PORT, p);
          etat = i !== irqDuMixeur(p) ? 0x11 : d !== dmaDuMixeur(p) ? 0x12 : 0;
        }
        m.w16(module + DET_ETAT, etat);
        R.eax = (R.eax & ~0xFFFF) | etat;
        R.edx = (R.edx & ~0xFFFF) | ((p + 5) & 0xFFFF);
        break;
      }
      default: throw new Error(`fonction ${f} du module de detection : non imitee`);
    }
    this.journal(`detection : module 0x${id.toString(16)}`);
    R.esp = (R.esp + 4) | 0;
    T.charger();
  }

  // Le module de melange : sa fonction 0x0A rend trois adresses relatives a son debut (edi : la
  // routine de remplissage, ecx : ses donnees, esi : les descripteurs d'echantillon).
  fonctionMelangeur(i, entree) {
    const T = this.machine.T, R = T.R, m = this.machine;
    T.sauver();
    const f = R.eax >>> 0;
    if (f === 0x0A) {
      const p = this.pilote(i);
      p.descripteurs = entree + DESCRIPTEURS;
      m.m8.fill(0, p.descripteurs, p.descripteurs + 32 * TAILLE_DESCRIPTEUR);
      R.edi = REMPLISSAGE; R.ecx = DONNEES; R.esi = DESCRIPTEURS;
      p.melangeur = entree;
    } else this.journal(`fonction ${f} du module de melange`);
    R.eax = 0;
    R.esp = (R.esp + 4) | 0;
    T.charger();
  }

  // La routine de remplissage, appelee par la minuterie de SOS (appel lointain, sans argument) :
  // les bruitages sont melanges jusqu'a ce tic, puis le son est remis.
  remplissage(i) {
    const T = this.machine.T, R = T.R;
    T.sauver();
    const t = this.maintenant();
    this.rendreJusqua(t);
    const cible = this.frames;
    if (cible > this.melanges) {
      const n = cible - this.melanges, debut = 2 * (this.melanges - this.emis);
      for (const p of this.pilotes) {
        // (en evenements, les descripteurs avancent sans que rien soit melange)
        if (p && p.actif && p.descripteurs) this.melanger(p, this.recepteur ? null : this.attente.subarray(debut, debut + 2 * n), n);
      }
      this.melanges = cible;
    }
    this.emettre(cible);
    if (this.recepteur) { this.observerLaMusique(t / 1e6); this.remettre(); }
    R.esp = (R.esp + 8) | 0;
    T.charger();
  }

  // --- rendu --------------------------------------------------------------------------------------------
  // La puce est rendue jusqu'a l'heure `us`, avant chaque ecriture de registre et a chaque image. Les
  // bruitages, eux, ne sont melanges qu'aux tics de remplissage, comme le faisait le module de SOS :
  // le son rendu attend jusque-la. Le resultat ne depend ainsi que de la partie, et non des moments
  // ou l'on demande le son.
  //
  // En evenements, rien n'est rendu : les compteurs avancent de meme (la taille des blocs de
  // melange, donc l'avance des descripteurs que le jeu relit, en depend), et l'etat de la musique est
  // observe.
  rendreJusqua(us) {
    const cible = Math.floor(us * FREQUENCE_SON / 1e6);
    if (this.recepteur) this.observerLaMusique(us / 1e6);
    if (cible <= this.frames) { if (this.recepteur) this.remettre(); return; }
    if (!this.recepteur) {
      const n = cible - this.frames, debut = 2 * (this.frames - this.emis);
      if (debut + 2 * n > this.attente.length) {
        const plus = new Float32Array(Math.max(2 * this.attente.length, debut + 2 * n));
        plus.set(this.attente.subarray(0, debut));
        this.attente = plus;
      }
      this.attente.fill(0, debut, debut + 2 * n);
      this.rendrePuce(this.attente.subarray(debut, debut + 2 * n), n);
    }
    this.frames = cible;
    // sans bruitages, ou si la minuterie de SOS ne tourne plus (plus d'une seconde d'attente), le
    // son de la puce part aussitot
    if (!this.pilotes.some((p) => p && p.actif && p.descripteurs) || cible - this.emis > FREQUENCE_SON) {
      this.melanges = Math.max(this.melanges, cible);
      this.emettre(cible);
    }
    if (this.recepteur) this.remettre();
  }

  emettre(jusqua) {
    const n = jusqua - this.emis;
    if (n <= 0) return;
    if (this.recepteur) { this.emis = jusqua; return; }
    const bloc = this.attente.slice(0, 2 * n);
    this.attente.copyWithin(0, 2 * n, 2 * (this.frames - this.emis));
    this.emis = jusqua;
    if (this.surSortie) this.surSortie(bloc);
  }

  // La puce, a 49 716 Hz, ramenee a 44 100 Hz par interpolation lineaire.
  rendrePuce(bloc, n) {
    const a = this.oplA, b = this.oplB, t = this.oplTampon, g = this.gainMusique / 32768;
    for (let k = 0; k < n; k++) {
      const pos = (this.frames + k) * FREQUENCE_OPL / FREQUENCE_SON;
      const e = Math.floor(pos);
      while (this.oplProduits <= e + 1) {
        this.opl.echantillon(t, 0);
        a[0] = b[0]; a[1] = b[1]; b[0] = t[0]; b[1] = t[1];
        this.oplProduits++;
      }
      const x = pos - e;
      bloc[2 * k] = (a[0] + (b[0] - a[0]) * x) * g;
      bloc[2 * k + 1] = (a[1] + (b[1] - a[1]) * x) * g;
    }
    if (this.remplacements && this.remplacements.musiques.size) this.remplacerMusique(bloc, n);
  }

  // Un morceau remplace : la puce continue de jouer, sans etre entendue, et son niveau (moyenne sur
  // deux secondes environ) regle celui du remplacant. La musique d'une attraction, que le jeu joue
  // bas, reste ainsi basse, sans qu'il faille savoir comment le jeu l'abaisse.
  remplacerMusique(bloc, n) {
    const nom = this.nomMorceau();
    if (!this.morceauRemplace || this.morceauRemplace.nom !== nom) {
      const pcm = nom && this.remplacements.musiques.get(nom);
      this.morceauRemplace = pcm ? { nom, pcm, pos: 0, boucle: true, rms: puissanceMoyenne(pcm) } : null;
    }
    const morceau = this.morceauRemplace;
    if (!morceau) return;
    let p = 0;
    for (let k = 0; k < 2 * n; k++) p += bloc[k] * bloc[k];
    this.niveauPuce += (p / (2 * n) - this.niveauPuce) * Math.min(1, n / (2 * FREQUENCE_SON));
    const gain = morceau.rms > 0 ? Math.min(4, Math.sqrt(this.niveauPuce / morceau.rms)) : 0;
    bloc.fill(0);
    this.jouerVoix(morceau, bloc, n, gain);
  }

  // Les echantillons en cours, lus dans la memoire du jeu ; les descripteurs sont tenus a jour comme
  // le faisait le module de melange. `bloc` null (les evenements) : les descripteurs avancent de meme,
  // sans rien lire ni melanger, et ce qui commence, change de volume ou s'arrete est signale.
  melanger(p, bloc, n) {
    const m = this.machine, m8 = m.m8, dv = m.dv;
    const pas = Math.round(p.frequence * 65536 / FREQUENCE_SON);
    const seize = p.bits === 16, largeur = seize ? 2 : 1;
    const ev = this.recepteur !== null, t = this.melanges / FREQUENCE_SON;
    if (ev && !p.sons) p.sons = new Array(32).fill(null);   // par descripteur : { id, volume, boucle } annonce
    for (let k = 0; k < 32; k++) {
      const d = p.descripteurs + k * TAILLE_DESCRIPTEUR;
      let drapeaux = dv.getUint16(d + D_DRAPEAUX, true);
      // arrete par le jeu : son remplacant aussi
      if (!(drapeaux & 0x8000)) {
        this.voix[k] = null; this.muets[k] = false;
        if (ev && p.sons[k]) { this.signaler({ t, genre: 'bruitage', action: 'arreter', id: p.sons[k].id }); p.sons[k] = null; }
        continue;
      }
      if (drapeaux & 0x0640) this.journal(`drapeaux d'echantillon non geres : 0x${drapeaux.toString(16)}`);
      const volumeDuJeu = drapeaux & 0x0100 ? dv.getUint16(d + D_VOLUME, true) / 0x7FFF : 1;
      const volume = volumeDuJeu * this.gainEffets;
      let pos = (dv.getUint32(d + D_POSITION, true) + m.base(dv.getUint16(d + D_POSITION + 4, true))) >>> 0;
      let reste = dv.getUint32(d + D_RESTE, true);
      let fraction = dv.getUint16(d + D_FRACTION, true);
      let boucles = dv.getUint16(d + D_BOUCLES, true);
      const debut = (dv.getUint32(d + D_DEBUT, true) + m.base(dv.getUint16(d + D_DEBUT + 4, true))) >>> 0;
      if (drapeaux & 0x2000) {                // premier passage : un repit ? un remplacement ?
        const nom = this.remplacements || this.repits || ev ? this.nomBruitage(debut) : null;
        this.muets[k] = nom !== null && !(drapeaux & 0x4000) && !this.entendre(nom);
        const pcm = !this.muets[k] && nom && this.remplacements && this.remplacements.bruitages.get(nom);
        this.voix[k] = pcm ? { pcm, pos: 0, boucle: (drapeaux & 0x4000) !== 0 && boucles === 0xFFFF, volume } : null;
        if (ev) {
          // (un descripteur repris par le jeu avant qu'on l'ait vu libre : l'ancien son s'arrete)
          if (p.sons[k]) this.signaler({ t, genre: 'bruitage', action: 'arreter', id: p.sons[k].id });
          p.sons[k] = null;
          if (!this.muets[k]) {
            const id = ++this.numeroDeSon, boucle = (drapeaux & 0x4000) !== 0;
            p.sons[k] = { id, volume: volumeDuJeu, boucle };
            this.signaler({ t, genre: 'bruitage', action: 'jouer', id, ...this.bruitageDe(debut), volume: volumeDuJeu, boucle });
          }
        }
      } else if (ev && p.sons[k] && p.sons[k].volume !== volumeDuJeu) {
        // (la montee du volume des ambiances, 0x803E0, et sa descente, 0x81770 : vingt fois par seconde)
        p.sons[k].volume = volumeDuJeu;
        this.signaler({ t, genre: 'bruitage', action: 'volume', id: p.sons[k].id, volume: volumeDuJeu });
      }
      const voix = this.voix[k], muet = this.muets[k];
      let fini = false;
      for (let j = 0; j < n; j++) {
        if (reste < largeur) {
          if ((drapeaux & 0x4000) && boucles) {
            if (boucles !== 0xFFFF) boucles--;
            pos = debut; reste = dv.getUint32(d + D_TAILLE, true); fraction = 0;
            if (reste < largeur) { fini = true; break; }
          } else { fini = true; break; }
        }
        if (bloc && !voix && !muet) {
          let v, suivant;
          if (seize) {
            v = dv.getInt16(pos, true) / 32768;
            suivant = reste >= 4 ? dv.getInt16(pos + 2, true) / 32768 : v;
          } else {
            v = (m8[pos] - 128) / 128;
            suivant = reste >= 2 ? (m8[pos + 1] - 128) / 128 : v;
          }
          const s = (v + (suivant - v) * fraction / 65536) * volume;
          bloc[2 * j] += s; bloc[2 * j + 1] += s;
        }
        fraction += pas;
        while (fraction >= 65536 && reste >= largeur) { fraction -= 65536; pos += largeur; reste -= largeur; }
      }
      if (voix && bloc) {
        voix.volume = volume;
        if (!this.jouerVoix(voix, bloc, n, volume)) this.voix[k] = null;
        else if (fini) { this.libres.push(voix); this.voix[k] = null; }
      }
      // Fini de lui-meme : un son en boucle s'arrete (ses tours sont faits) ; un autre joue jusqu'a la
      // fin de son fichier, qui peut etre plus long que l'original (un son remplace).
      if (ev && fini && p.sons[k]) {
        if (p.sons[k].boucle) this.signaler({ t, genre: 'bruitage', action: 'arreter', id: p.sons[k].id });
        p.sons[k] = null;
      }
      drapeaux &= ~0x2000;
      if (fini) {
        drapeaux &= ~0x8000;
        if (dv.getUint32(d + D_RAPPEL, true) || dv.getUint16(d + D_RAPPEL + 4, true)) {
          this.journal("routine de fin d'echantillon non appelee");
        }
      }
      // la position est un decalage dans le segment de l'echantillon
      dv.setUint32(d + D_POSITION, (pos - m.base(dv.getUint16(d + D_POSITION + 4, true))) >>> 0, true);
      dv.setUint32(d + D_RESTE, reste, true);
      dv.setUint16(d + D_FRACTION, fraction, true);
      dv.setUint16(d + D_BOUCLES, boucles, true);
      dv.setUint16(d + D_DRAPEAUX, drapeaux, true);
    }
    if (bloc && this.libres.length) this.libres = this.libres.filter((v) => this.jouerVoix(v, bloc, n, v.volume));
  }

  // --- instantanes (comparaison appel par appel, voir Machine.instantane) ---------------------------------
  instantane() {
    return {
      puce: this.opl.instantane(), index: this.index.slice(), frames: this.frames, emis: this.emis,
      melanges: this.melanges, attente: this.attente.slice(0, 2 * (this.frames - this.emis)),
      oplProduits: this.oplProduits, oplA: [...this.oplA], oplB: [...this.oplB],
      pilotes: this.pilotes.map((p) => (p ? { ...p } : p)),
      voix: this.voix.map((v) => (v ? { ...v } : v)), libres: this.libres.map((v) => ({ ...v })),
      morceauRemplace: this.morceauRemplace ? { ...this.morceauRemplace } : null, niveauPuce: this.niveauPuce,
      muets: this.muets.slice(), entendus: [...this.entendus],
    };
  }
  restaurer(s) {
    this.voix = s.voix.map((v) => (v ? { ...v } : v)); this.libres = s.libres.map((v) => ({ ...v }));
    this.muets = s.muets.slice(); this.entendus = new Map(s.entendus);
    this.morceauRemplace = s.morceauRemplace ? { ...s.morceauRemplace } : null; this.niveauPuce = s.niveauPuce;
    this.opl.restaurer(s.puce);
    this.index = s.index.slice(); this.frames = s.frames; this.emis = s.emis; this.melanges = s.melanges;
    if (this.attente.length < s.attente.length) this.attente = new Float32Array(s.attente.length);
    this.attente.set(s.attente);
    this.oplProduits = s.oplProduits;
    this.oplA.set(s.oplA); this.oplB.set(s.oplB);
    this.pilotes = s.pilotes.map((p) => (p ? { ...p } : p));
  }
  ecarts(a, b) {
    const ecarts = [];
    if (a.frames !== b.frames) ecarts.push(`son.frames : ${a.frames} / ${b.frames}`);
    for (let r = 0; r < 0x200; r++) {
      if (a.puce.registres[r] !== b.puce.registres[r]) { ecarts.push(`son : registre 0x${r.toString(16)} de la puce`); break; }
    }
    if (JSON.stringify(a.pilotes) !== JSON.stringify(b.pilotes)) ecarts.push('son.pilotes differe');
    return ecarts;
  }
}
