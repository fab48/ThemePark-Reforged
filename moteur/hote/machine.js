// La machine hote : ce que DOS/4GW, le DOS, le BIOS, la carte VGA, le clavier, la souris et la
// minuterie fournissaient au jeu en 1994, recree au niveau des services (et non des circuits).
//
// Le code du jeu (transcrit) appelle l'hote par l'objet H : interruptions logicielles, ports
// d'entree/sortie, bases de segments, appels lointains, et 'tic' pour le temps qui passe.
// Le temps est virtuel et deterministe : deux executions avec les memes entrees donnent
// exactement le meme resultat, ce qui permet de comparer la transcription et le code reecrit.

import { chargerLE } from './le.js';
import { chargerLImage } from './image-programme.js';
import { Video } from './video.js';
import { Son } from './son.js';

export const TAILLE_MEMOIRE = 64 << 20;

// selecteurs, dans l'esprit de DOS/4GW
const SEL_CODE = 0x170, SEL_DONNEES = 0x178, SEL_PSP = 0x100, SEL_ENV = 0x108;
const LIN_PSP = 0x1000, LIN_ENV = 0x1200;
// memoire conventionnelle simulee : entre la fin des objets du jeu et 1 Mo
const DOS_DEBUT = 0xE4000, DOS_FIN = 0x100000;
const TAS_DEBUT = 0x100000;                          // memoire etendue (au-dela de 1 Mo)

// Les routines de MAIN.EXE que l'hôte remplace ou enveloppe : le cœur d'int386x, _chain_intr, et le
// repère d'image (la pose du curseur, par laquelle toute image présentée commence).
export const ADRESSES_DE_MAIN = { int386x: 0x89F90, chainIntr: 0x821BE, image: 0x7D775 };

export class Sortie extends Error {
  constructor(code) { super('sortie du programme, code ' + code); this.code = code; }
}
export class Arret extends Error {
  constructor(raison) { super(raison); }
}
// _chain_intr : le gestionnaire du jeu passe la main a l'ancien gestionnaire et ne revient pas
class Chainage extends Error {
  constructor(sel, off) { super('chainage'); this.sel = sel; this.off = off; }
}
const SEL_BIOS = 0x1F0;     // selecteur fictif des gestionnaires d'origine (BIOS)

// L'etat de l'hote sauve par les instantanes (voir Machine.instantane) : les valeurs simples, puis
// les tables, copiees avec leurs entrees.
const CHAMPS_INSTANTANE = ['us', 'prochaineImage', 'images', 'ticsSansTemps', 'gardes', 'prochainTic',
  'prochainObservateur', 'ticksBios', 'pitDiviseur', 'pitMode', 'pitOctet', 'picMasque', 'etatMaj', 'port60',
  'enInterruption', 'selLibre', 'tasLibre', 'handleLibre', 'handleFichierLibre', 'dta'];
const TABLES_INSTANTANE = ['descripteurs', 'blocsDos', 'blocs', 'vecteursPM', 'vecteursRM', 'handles'];
function copierTable(table) {
  return new Map([...table].map(([c, v]) => [c, v && typeof v === 'object' ? { ...v } : v]));
}

// Le pointeur du navigateur (voir deplacerPointeur) : un mouvement est livre au jeu en pas d'au plus
// 1/160 de la largeur de l'ecran (4 pixels logiques), comme les interruptions rapprochees d'une
// souris de PC ; 300 ms apres le dernier deplacement du pointeur par le jeu, chaque mouvement
// rattrape un quart de l'ecart avec le pointeur du navigateur.
const PAS_PAR_ECRAN = 160;
const RECALAGE_APRES_US = 300000;
const RECALAGE = 0.25;
function versZero(ecart) {
  if (ecart === 0) return 0;
  const part = Math.max(1, Math.round(Math.abs(ecart) * RECALAGE));
  return Math.sign(ecart) * Math.min(part, Math.abs(ecart));
}

// Le garde-fou de l'horloge (voir tic) : au bout de GARDE_TICS tics sans aucun service rendu au jeu,
// le temps avance de GARDE_US. Le plus long travail mesuré entre deux services est de 14 tics (le
// passage en 640x480) ; une attente active en fait des milliers.
const GARDE_TICS = 250;
const GARDE_US = 25000;

// Les touches que garde le tampon du clavier du BIOS (voir toucheAppuyee).
const TAMPON_DU_CLAVIER = 15;

// Pile d'appels du jeu, lue dans la pile JavaScript : chaque fonction transcrite s'appelle f_xxxxx.
export function pileJeu() {
  Error.stackTraceLimit = 60;
  return (new Error().stack || '').split('\n').map((l) => /at (f_[0-9a-f]+)/.exec(l)).filter(Boolean)
    .map((m) => m[1]).join(' < ');
}

export class Machine {
  // exe : Uint8Array de MAIN.EXE ; T : module transcrit ; fichiers : systeme de fichiers virtuel ;
  // son : les cartes a declarer au jeu, { numerique, musique } (voir son.js), ou rien pour un jeu muet
  // memoireEtendue : des octets de plus au-delà des TAILLE_MEMOIRE que voit le jeu, hors de son tas ;
  // la grande vue y range ses tampons (moteur/jeu/grande-vue.js). Rien par défaut.
  // programme : (machine, T) => pose les fonctions du jeu dans T avant le démarrage : le moteur
  // autonome (moteur/hote/processeur.js) n'a pas de transcription, et reçoit ainsi tout le code
  // lisible (moteur/jeu/index.js, poserLeProgramme). Rien avec la transcription, qui a déjà tout.
  // image : à la place de exe, l'image des données du programme (image-programme.js) : le moteur
  // autonome n'a pas besoin du code de MAIN.EXE.
  // adresses : celles des trois routines du programme que l'hôte remplace ou enveloppe (voir
  // installerRemplacements et le repère d'image) ; par défaut, celles de MAIN.EXE. Le programme de
  // l'introduction, INTRO.EXE, a les siennes (moteur/hote/intro.js).
  constructor({ exe, image = null, remplissageDuCode = 0, T, fichiers, journal = () => {}, ligneCommande = '', son = null,
    memoireEtendue = 0, programme = null, adresses = ADRESSES_DE_MAIN }) {
    this.T = T;
    this.adresses = adresses;
    this.programme = programme;
    this.fichiers = fichiers;
    this.journal = journal;
    this.memoire = new ArrayBuffer(TAILLE_MEMOIRE + memoireEtendue);
    this.m8 = new Uint8Array(this.memoire);
    this.dv = new DataView(this.memoire);
    this.le = image ? chargerLImage(image, this.m8, remplissageDuCode) : chargerLE(exe, this.m8);
    this.video = new Video(this);
    // descripteurs
    this.descripteurs = new Map();
    this.descripteurs.set(SEL_CODE, { base: 0, limite: 0xFFFFFFFF });
    this.descripteurs.set(SEL_DONNEES, { base: 0, limite: 0xFFFFFFFF });
    this.descripteurs.set(SEL_PSP, { base: LIN_PSP, limite: 0xFF });
    this.descripteurs.set(SEL_ENV, { base: LIN_ENV, limite: 0x7FF });
    this.descripteurs.set(SEL_BIOS, { base: 0, limite: 0xFFFFF });
    this.selLibre = 0x200;
    // memoire
    this.blocsDos = new Map();       // memoire conventionnelle : selecteur -> {lin, taille}
    this.tasLibre = TAS_DEBUT;
    this.blocs = new Map();          // handle -> {lin, taille}
    this.handleLibre = 1;
    // interruptions
    this.vecteursPM = new Map();     // numero -> {sel, off}
    this.vecteursRM = new Map();
    this.picMasque = 0;
    // fichiers ouverts
    this.handles = new Map();
    this.handleFichierLibre = 5;
    this.dta = 0;
    // temps virtuel (microsecondes)
    this.us = 0;
    // Le jeu de 1994 n'a pas d'horloge : il avance d'un pas de simulation par image dessinee, aussi
    // vite que le processeur le permet. On lui en donne une : chaque image presentee vaut une duree
    // fixe. Toute presentation d'une image a l'ecran commence par poser le curseur de la souris dans
    // l'image, 0x7D775 : parc en basse (0x80210) et haute resolution (0x55507), menus, ecrans fixes.
    // C'est le repere. La cadence ne depend donc plus ni de la machine ni de la facon dont le code
    // est ecrit.
    this.cadenceImages = 30;
    this.adresseImage = adresses.image;
    this.prochaineImage = 0;
    this.images = 0;
    this.ticsSansTemps = 0;
    this.pitDiviseur = 65536;
    this.pitMode = 0;
    this.pitOctet = 0;
    this.prochainTic = 0;
    this.prochainObservateur = 0;
    this.ticksBios = 0;
    // entrees
    this.clavier = [];               // codes de touches en attente (scancodes, port 60h)
    this.toucheBios = [];            // tampon du BIOS : (scancode << 8) | ascii
    this.etatMaj = 0;
    this.port60 = 0;
    this.souris = { x: 320, y: 100, boutons: 0, xmin: 0, xmax: 639, ymin: 0, ymax: 199, visible: false,
      rappel: null, masque: 0, mickeyX: 0, mickeyY: 0, file: [],
      navigateur: null,              // derniere position du pointeur du navigateur (deplacerPointeur)
      placement: -1e12 };            // instant du dernier deplacement du pointeur par le jeu
    this.compteurs = new Map();
    this.inconnus = new Map();
    this.enInterruption = false;
    this.observateurs = [];
    // la carte son et ses pilotes (son.js) ; la ligne de commande et l'environnement les declarent
    this.son = son ? new Son(this, son) : null;
    this.ligneCommande = this.son ? `${ligneCommande} ${this.son.optionLigneCommande()}`.trim() : ligneCommande;
    this.preparerEnvironnement();
  }

  // --- journal -------------------------------------------------------------------------------
  compte(cle) { this.compteurs.set(cle, (this.compteurs.get(cle) || 0) + 1); }
  inconnu(cle) {
    const n = (this.inconnus.get(cle) || 0) + 1;
    this.inconnus.set(cle, n);
    if (n <= 3) this.journal('INCONNU ' + cle);
  }

  // --- memoire -------------------------------------------------------------------------------
  r8(a) { return this.m8[a]; }
  r16(a) { return this.dv.getUint16(a, true); }
  r32(a) { return this.dv.getUint32(a, true); }
  w8(a, v) { this.m8[a] = v; }
  w16(a, v) { this.dv.setUint16(a, v, true); }
  w32(a, v) { this.dv.setUint32(a, v >>> 0, true); }
  chaineC(a, max = 260) {
    let s = '';
    for (let k = 0; k < max; k++) { const c = this.m8[a + k]; if (!c) break; s += String.fromCharCode(c); }
    return s;
  }
  ecrireChaine(a, s) { for (let k = 0; k < s.length; k++) this.m8[a + k] = s.charCodeAt(k); this.m8[a + s.length] = 0; }

  // Memoire conventionnelle : le premier trou assez grand entre les blocs en place, qui se liberent.
  // Le jeu en prend la totalite au demarrage (0x82950), puis rend un bloc de 64 000 octets : c'est
  // la que la bibliotheque C loge ensuite ses petits blocs (voir int 21h/48h), dont les tampons de
  // fichiers et les pilotes de son. Chaque bloc a son selecteur, cle de blocsDos.
  allouerDos(paragraphes) {
    const taille = paragraphes * 16;
    let lin = DOS_DEBUT;
    for (const b of [...this.blocsDos.values()].sort((x, y) => x.lin - y.lin)) {
      if (b.lin - lin >= taille) break;
      lin = Math.max(lin, (b.lin + b.taille + 15) & ~15);
    }
    if (lin + taille > DOS_FIN) return null;
    this.m8.fill(0, lin, lin + taille);
    return lin;
  }
  // le plus grand trou, en paragraphes : ce que le DOS rend quand une allocation echoue
  plusGrandBlocDos() {
    let lin = DOS_DEBUT, max = 0;
    for (const b of [...this.blocsDos.values()].sort((x, y) => x.lin - y.lin)) {
      max = Math.max(max, b.lin - lin);
      lin = Math.max(lin, (b.lin + b.taille + 15) & ~15);
    }
    return Math.max(max, DOS_FIN - lin) >> 4;
  }
  // un bloc de memoire conventionnelle et son selecteur, ou null
  blocDos(paragraphes) {
    const lin = this.allouerDos(paragraphes);
    if (lin === null) return null;
    const sel = this.nouveauSelecteur(lin, paragraphes * 16 - 1);
    this.blocsDos.set(sel, { lin, taille: paragraphes * 16 });
    return { lin, sel };
  }
  libererDos(sel) {
    sel &= 0xFFF8;
    if (!this.blocsDos.delete(sel)) return false;
    this.descripteurs.delete(sel);
    return true;
  }
  allouerTas(taille) {
    const lin = (this.tasLibre + 0xFFF) & ~0xFFF;
    if (lin + taille > TAILLE_MEMOIRE) return null;
    this.tasLibre = lin + taille;
    this.m8.fill(0, lin, lin + taille);
    return lin;
  }
  nouveauSelecteur(base = 0, limite = 0xFFFFF) {
    const s = this.selLibre;
    this.selLibre += 8;
    this.descripteurs.set(s, { base, limite });
    return s;
  }

  // --- environnement de depart -------------------------------------------------------------------
  preparerEnvironnement() {
    // PSP : ligne de commande en 0x80, selecteur d'environnement en 0x2C
    const psp = LIN_PSP;
    this.m8.fill(0, psp, psp + 256);
    this.w16(psp, 0x20CD);
    this.w16(psp + 0x2C, SEL_ENV);
    const cmd = ' ' + this.ligneCommande;
    this.m8[psp + 0x80] = cmd.length;
    for (let k = 0; k < cmd.length; k++) this.m8[psp + 0x81 + k] = cmd.charCodeAt(k);
    this.m8[psp + 0x81 + cmd.length] = 0x0D;
    // environnement : chaines, double zero, compteur, nom du programme
    let a = LIN_ENV;
    const variables = ['COMSPEC=C:\\COMMAND.COM', 'PATH=C:\\', 'DOS4G=QUIET', ...(this.son ? this.son.environnement() : [])];
    for (const v of variables) { this.ecrireChaine(a, v); a += v.length + 1; }
    this.m8[a++] = 0;
    this.w16(a, 1); a += 2;
    this.ecrireChaine(a, 'C:\\THEME.CD\\MAIN.EXE');
    // donnees du BIOS
    this.m8[0x449] = 3;
    this.w16(0x463, 0x3D4);
  }

  // --- execution -----------------------------------------------------------------------------------
  hote() {
    return {
      base: (sel) => this.base(sel),
      limite: (sel) => this.limiteSeg(sel),
      interruption: (n) => this.interruption(n),
      entree: (port, taille) => this.entree(port, taille),
      sortie: (port, v, taille) => this.sortie(port, v, taille),
      tic: () => this.tic(),
      appelLointain: (off, sel) => this.appelLointain(off, sel),
      appelInconnu: (adr) => {
        // les modules de son que la bibliotheque HMI charge depuis HMIDRV.386 (voir son.js)
        const f = this.son && this.son.appel(adr >>> 0, false);
        if (f) return f();
        throw new Arret('appel indirect vers une adresse inconnue 0x' + adr.toString(16));
      },
    };
  }

  demarrer() {
    const T = this.T;
    T.initialiser(this.memoire, this.hote());
    if (this.programme) this.programme(this, T);
    this.installerRemplacements();
    T.ecrireRegistres({
      eax: 0, ebx: 0, ecx: 0, edx: 0, esi: 0, edi: 0, ebp: 0, esp: this.le.pileInitiale,
      cs: SEL_CODE, ds: SEL_DONNEES, es: SEL_PSP, ss: SEL_DONNEES, fs: 0, gs: 0, DF: false, IF: true,
    });
    T.appeler(this.le.pointEntree);
  }

  base(sel) {
    sel &= 0xFFFF;
    if ((sel & ~3) === 0) return 0;
    const d = this.descripteurs.get(sel & ~3);
    if (!d) { this.inconnu('selecteur ' + sel.toString(16)); return 0; }
    return d.base;
  }
  limiteSeg(sel) {
    const d = this.descripteurs.get(sel & 0xFFF8);
    return d ? d.limite : -1;
  }

  // Remplacements de fonctions du jeu par des services natifs
  installerRemplacements() {
    const T = this.T, R = T.R;
    // 0x89F90 : coeur d'int386x (Watcom). Il saute a l'interruption par un 'ret' sur une table de
    // petites routines 'int N ; ret' : on execute l'interruption directement.
    // Entree : esi = numero, edi -> registres d'entree, edx -> registres de sortie, ebx -> SREGS.
    // Les registres du service sont recharges dans la transcription avant de le rendre : une
    // interruption livree pendant le service (appelerGestionnaire) releve les registres du code
    // interrompu, et les lui rend ensuite. Sans cela, le service recevait ceux du code au moment de
    // l'appel du coeur (eax = adresse des SREGS depuis int386, esi = numero...) au lieu de ceux de
    // la structure (journal des essais, § 5.9).
    T.remplacer(this.adresses.int386x, () => {
      T.sauver();
      const n = R.esi & 0xFF, pin = R.edi >>> 0, pout = R.edx >>> 0, psr = R.ebx >>> 0;
      const sauve = { ...R };
      R.eax = this.r32(pin); R.ebx = this.r32(pin + 4); R.ecx = this.r32(pin + 8);
      R.edx = this.r32(pin + 12); R.esi = this.r32(pin + 16); R.edi = this.r32(pin + 20);
      R.es = this.r16(psr); R.ds = this.r16(psr + 6);
      T.charger();
      this.interruption(n);          // travaille directement sur R
      this.w32(pout, R.eax); this.w32(pout + 4, R.ebx); this.w32(pout + 8, R.ecx);
      this.w32(pout + 12, R.edx); this.w32(pout + 16, R.esi); this.w32(pout + 20, R.edi);
      this.w32(pout + 24, R.CF ? 1 : 0);
      this.w16(psr, R.es); this.w16(psr + 6, R.ds);
      const cf = R.CF;
      Object.assign(R, sauve);
      R.CF = cf;
      R.esp = (R.esp + 4) | 0;      // le 'ret' de la fonction remplacee
      T.charger();
    });
    if (this.adresseImage) {
      const suite = T.originale(this.adresseImage);
      T.remplacer(this.adresseImage, () => { this.nouvelleImage(); suite(); });
    }
    // 0x821BE : _chain_intr(off, sel). Defait la pile du gestionnaire et saute par 'retf' vers
    // l'ancien gestionnaire, qui fera l'iretd : on remonte jusqu'a l'hote par une exception.
    T.remplacer(this.adresses.chainIntr, () => {
      T.sauver();
      const esp = R.esp >>> 0;
      throw new Chainage(this.r32(esp + 8) & 0xFFFF, this.r32(esp + 4));
    });
  }

  // gestionnaires d'origine (BIOS), atteints par chainage
  gestionnaireBios(n) {
    if (n === 8) { this.ticksBios++; this.w32(0x46C, this.ticksBios); }
  }

  // --- temps ---------------------------------------------------------------------------------------
  periodePit() { return (this.pitDiviseur || 65536) * 1e6 / 1193182; }

  // un tour de la boucle principale du jeu : le temps saute a l'image suivante
  nouvelleImage() {
    this.images++;
    const periode = 1e6 / this.cadenceImages;
    if (this.us < this.prochaineImage) this.avancer(this.prochaineImage - this.us);
    // cadence stricte : le temps consomme par les services pendant l'image est absorbe
    this.prochaineImage += periode;
    if (this.prochaineImage < this.us) this.prochaineImage = this.us + periode;
    // Les drapeaux du processeur avant de livrer : `livrerInterruptions` regarde IF, et la
    // transcription ne recopie ses registres dans `T.R` qu'en appelant l'hote. Ici, l'appel vient
    // du repere d'image (0x7D775), qui n'est pas un service : sans cette synchronisation, l'hote
    // deciderait sur un IF perime, vieux de la derniere sauvegarde — et une reecriture, qui
    // sauvegarde a d'autres moments, ferait livrer le tic une image plus tot ou plus tard.
    // (Sauvegarder au debut de `livrerInterruptions`, plus general, casse la partie : les appels
    // venus d'un service y sont deja synchronises, et le faire une seconde fois ecrase l'etat.)
    this.T.sauver();
    this.livrerInterruptions();
    // le son de l'image ecoulee, a chaque image au moins
    if (this.son) this.son.rendreJusqua(this.son.horizon());
  }

  avancer(us) {
    this.ticsSansTemps = 0;
    this.us += us;
    this.video.avancer(this.us);
    // les observateurs (image, entrees, calage sur le temps reel) passent toutes les millisecondes
    if (this.us >= this.prochainObservateur) {
      this.prochainObservateur = this.us + 1000;
      for (const o of this.observateurs) o(this);
    }
  }

  // Appele par le code transcrit tous les 'quota' sauts en arriere (10 000). Le temps n'avance pas
  // ici : il n'avance qu'aux evenements observables du jeu (une image dessinee, un service rendu),
  // ce qui le rend insensible a la facon dont le code est ecrit — une fonction reecrite plus courte
  // ne fait pas deriver l'horloge.
  // Seule exception, le garde-fou, pour les attentes actives : ces boucles qui relisent la memoire
  // sans appeler aucun service, en attendant qu'une interruption la change (« cliquez pour
  // continuer », 0x57584, attend ainsi le bouton de la souris). Sans lui, elles ne finiraient
  // jamais. Son seuil est tres au-dessus du plus long travail mesure entre deux services : il ne se
  // declenche pas pendant un dessin, si lourd soit-il, et l'horloge reste la meme que le dessin
  // soit transcrit ou reecrit. (Un seuil de 5 tics le faisait partir au milieu des redessins
  // complets en 640x480, et deux executions ne livraient plus les interruptions au meme moment.)
  tic() {
    if (++this.ticsSansTemps >= GARDE_TICS) {
      this.gardes = (this.gardes || 0) + 1;
      this.avancer(GARDE_US);
      this.livrerInterruptions();
    }
  }

  livrerInterruptions() {
    if (this.enInterruption) return;
    const T = this.T;
    if (!T.R.IF) return;
    // minuterie
    while (this.us >= this.prochainTic) {
      this.prochainTic += this.periodePit();
      if (this.vecteursPM.has(8)) { if (!(this.picMasque & 1)) this.irq(0); }
      else this.gestionnaireBios(8);
    }
    // souris : la routine enregistree par int 33h/0Ch est appelee comme une procedure lointaine.
    // Avec le pointeur du navigateur, chaque evenement porte la position du pilote au moment ou il
    // est livre, comme sur la machine d'origine ; les scenarios, eux, donnent des positions absolues.
    const s = this.souris;
    while (s.file.length && s.file[0].quand <= this.us) {
      const ev = s.file.shift();
      if (ev.relatif) { this.livrerDeplacement(ev); continue; }
      if (!s.rappel || !(ev.masque & s.masque)) continue;
      this.compte('souris');
      const x = s.navigateur ? s.x : ev.x, y = s.navigateur ? s.y : ev.y;
      this.appelerGestionnaire(s.rappel.off, 'retf', {
        eax: ev.masque, ebx: ev.boutons, ecx: x, edx: y, esi: s.mickeyX & 0xFFFF, edi: s.mickeyY & 0xFFFF,
      });
    }
    // clavier
    if (this.clavier.length && !(this.picMasque & 2)) {
      this.port60 = this.clavier.shift();
      this.irq(1);
    }
  }

  // execute le gestionnaire d'interruption materielle 'n' (0 = minuterie, 1 = clavier)
  irq(n) {
    const v = this.vecteursPM.get(8 + n);
    if (!v) return;
    this.compte('irq' + n);
    this.appelerGestionnaire(v.off, 'iret');
  }

  // appel d'une routine du jeu depuis l'hote, de facon transparente pour le code interrompu
  appelerGestionnaire(off, genre, regs = {}) {
    const T = this.T, R = T.R;
    T.sauver();
    const sauve = { ...R };
    this.enInterruption = true;
    try {
      let esp = R.esp;
      if (genre === 'iret') {
        esp -= 12;
        this.w32(esp + 8, this.drapeauxDe(R)); this.w32(esp + 4, SEL_CODE); this.w32(esp, 0xFFFFFFF0);
      } else {
        esp -= 8;
        this.w32(esp + 4, SEL_CODE); this.w32(esp, 0xFFFFFFF0);
      }
      Object.assign(R, regs, { esp, cs: SEL_CODE });
      T.charger();
      try {
        T.appeler(off);
      } catch (e) {
        if (!(e instanceof Chainage)) throw e;
        if (e.sel === SEL_BIOS) this.gestionnaireBios(e.off);
        else if ((e.sel & ~3) === SEL_CODE) { T.charger(); T.appeler(e.off); }
      }
      T.sauver();
    } finally {
      this.enInterruption = false;
    }
    const resultat = { ...R };
    Object.assign(R, sauve);
    T.charger();
    return resultat;
  }

  drapeauxDe(R) {
    return (R.CF ? 1 : 0) | 2 | (R.ZF ? 0x40 : 0) | (R.SF ? 0x80 : 0) | (R.IF ? 0x200 : 0) | (R.DF ? 0x400 : 0) | (R.OF ? 0x800 : 0);
  }

  appelLointain(off, sel) {
    const son = this.son && this.son.appel(off >>> 0, true);
    if (son) return son;
    if ((sel & ~3) === SEL_CODE) {
      const f = this.T.fonction ? this.T.fonction(off) : null;
      return () => this.T.appeler(off);
    }
    throw new Arret(`appel lointain vers ${sel.toString(16)}:${off.toString(16)}`);
  }

  // --- ports ---------------------------------------------------------------------------------------
  entree(port, taille) {
    this.livrerInterruptions();
    this.compte('in ' + port.toString(16));
    if (this.son && this.son.gerePort(port)) return this.son.entree(port);
    switch (port) {
      case 0x3DA: this.avancer(2); this.livrerInterruptions(); return this.video.etat();
      case 0x3C9: return this.video.lireDac();
      case 0x3C7: return this.video.etatDac();
      case 0x60: return this.port60;
      case 0x64: return this.clavier.length ? 1 : 0;
      case 0x61: return 0;
      case 0x21: return this.picMasque;
      case 0x40: { const v = Math.floor((this.us / this.periodePit() % 1) * this.pitDiviseur); return this.pitOctet++ & 1 ? v >> 8 & 0xFF : v & 0xFF; }
      case 0x3C5: case 0x3CF: case 0x3D5: return this.video.lireRegistre(port);
      default: this.inconnu('in ' + port.toString(16)); return 0xFF;
    }
  }

  sortie(port, v, taille) {
    this.compte('out ' + port.toString(16));
    if (this.son && this.son.gerePort(port)) return this.son.sortie(port, v);
    switch (port) {
      case 0x3C8: this.video.indexEcriture(v & 0xFF); return;
      case 0x3C7: this.video.indexLecture(v & 0xFF); return;
      case 0x3C9: this.video.ecrireDac(v & 0xFF); return;
      case 0x20: case 0xA0: return;                         // fin d'interruption
      case 0x21: this.picMasque = v & 0xFF; return;
      case 0xA1: return;
      case 0x43: this.pitMode = v & 0xFF; this.pitOctet = 0; return;
      case 0x40:
        if (this.pitOctet++ & 1) { this.pitDiviseur = (this.pitDiviseur & 0xFF) | (v & 0xFF) << 8; this.prochainTic = this.us + this.periodePit(); }
        else this.pitDiviseur = (this.pitDiviseur & 0xFF00) | (v & 0xFF);
        return;
      case 0x61: return;
      case 0x3C4: case 0x3C5: case 0x3CE: case 0x3CF: case 0x3D4: case 0x3D5:
        if (taille === 2) { this.video.ecrireRegistre(port, v & 0xFF); this.video.ecrireRegistre(port + 1, (v >> 8) & 0xFF); }
        else this.video.ecrireRegistre(port, v & 0xFF);
        return;
      default: this.inconnu('out ' + port.toString(16));
    }
  }

  // --- interruptions logicielles ------------------------------------------------------------------
  // Chaque service rendu au jeu est un point sur pour livrer les interruptions en attente : les
  // registres du code appelant sont dans R, et l'hote les restitue intacts apres le gestionnaire.
  interruption(n) {
    this.avancer(5);                 // chaque service coute un peu de temps, comme sur la machine
    this.livrerInterruptions();
    const R = this.T.R;
    this.compte('int ' + n.toString(16) + ':' + (n === 0x31 ? (R.eax & 0xFFFF) : (R.eax >> 8) & 0xFF).toString(16));
    switch (n) {
      case 0x21: return this.dos(R);
      case 0x31: return this.dpmi(R);
      case 0x10: return this.video.bios(R);
      case 0x16: return this.biosClavier(R);
      case 0x33: return this.pilotesouris(R);
      case 0x2F: if ((R.eax & 0xFFFF) === 0x1600) { R.eax &= ~0xFF; return; } break;
      case 0x4B: R.CF = true; return;
      case 0x1A: if (((R.eax >> 8) & 0xFF) === 0) { R.ecx = (R.ecx & ~0xFFFF) | (this.ticksBios >> 16 & 0xFFFF); R.edx = (R.edx & ~0xFFFF) | (this.ticksBios & 0xFFFF); R.eax &= ~0xFF; return; } break;
    }
    this.inconnu(`int ${n.toString(16)} ax=${(R.eax & 0xFFFF).toString(16)}`);
    R.CF = true;
  }

  // --- DOS -----------------------------------------------------------------------------------------
  dos(R) {
    if (!this.traceDos || ((R.eax >> 8) & 0xFF) === 0x2C) return this.dos2(R);
    const h = (v) => (v >>> 0).toString(16);
    const avant = `ax=${h(R.eax & 0xFFFF)} bx=${h(R.ebx)} cx=${h(R.ecx)} dx=${h(R.edx)}`;
    this.dos2(R);
    this.journal(`int 21 ${avant} -> eax=${h(R.eax)} ebx=${h(R.ebx)} ecx=${h(R.ecx)} edx=${h(R.edx)} CF=${R.CF ? 1 : 0}  [${pileJeu().split(' < ').slice(0, 4).join(' < ')}]`);
  }
  dos2(R) {
    const ah = (R.eax >> 8) & 0xFF, al = R.eax & 0xFF;
    const ax = (v) => { R.eax = (R.eax & ~0xFFFF) | (v & 0xFFFF); };
    const ok = () => { R.CF = false; };
    const erreur = (code) => { ax(code); R.CF = true; };
    switch (ah) {
      case 0x30: ax(0x0005); R.ebx &= ~0xFFFF; R.ecx &= ~0xFFFF; R.eax &= 0xFFFF; return ok();
      case 0x4A: return ok();
      case 0xFF:
        if ((R.eax & 0xFFFF) === 0xFF00 && (R.edx & 0xFFFF) === 0x78) { R.eax = 0x4734FF01; R.gs = 0; return ok(); }
        break;
      case 0x2C: {   // heure
        this.avancer(5); this.livrerInterruptions();
        const s = Math.floor(this.us / 1e6), cs = Math.floor(this.us / 1e4) % 100;
        R.ecx = (R.ecx & ~0xFFFF) | ((Math.floor(s / 3600) % 24) << 8) | (Math.floor(s / 60) % 60);
        R.edx = (R.edx & ~0xFFFF) | ((s % 60) << 8) | cs;
        return ok();
      }
      case 0x2A: {   // date : 21 septembre 1994, un mercredi
        R.ecx = (R.ecx & ~0xFFFF) | 1994; R.edx = (R.edx & ~0xFFFF) | (9 << 8) | 21; ax((R.eax & 0xFF00) | 3); return ok();
      }
      case 0x25: this.vecteursPM.set(al, { sel: R.ds & 0xFFFF, off: R.edx >>> 0 }); this.journal(`vecteur ${al.toString(16)} -> ${(R.edx >>> 0).toString(16)}`); return ok();
      case 0x35: { const v = this.vecteursPM.get(al) || { sel: SEL_BIOS, off: al }; R.es = v.sel; R.ebx = v.off; return ok(); }
      case 0x0B: ax(R.eax & 0xFF00); return ok();       // pas de caractere en attente sur l'entree standard
      case 0x08: case 0x01: ax((R.eax & 0xFF00) | 0x0D); return ok();
      case 0x3C: case 0x3D: return this.ouvrir(R, ah === 0x3C);
      case 0x3E: this.handles.delete(R.ebx & 0xFFFF); return ok();
      case 0x3F: return this.lire(R);
      case 0x40: return this.ecrire(R);
      case 0x42: return this.positionner(R);
      case 0x41: { const nom = this.chaineC(R.edx >>> 0); this.journal('effacer ' + nom); this.fichiers.effacer?.(nom); return ok(); }
      case 0x43: { const nom = this.chaineC(R.edx >>> 0); if (this.fichiers.existe(nom)) { R.ecx &= ~0xFFFF; return ok(); } return erreur(2); }
      case 0x44:
        if (al === 0) { const h = R.ebx & 0xFFFF; R.edx = (R.edx & ~0xFFFF) | (h < 5 ? 0x80D3 : 0x0002); return ok(); }
        break;
      case 0x1A: this.dta = R.edx >>> 0; return ok();
      case 0x2F: R.es = SEL_DONNEES; R.ebx = this.dta; return ok();
      case 0x4E: case 0x4F: return this.chercher(R, ah === 0x4E);
      // DOS/4GW sert l'allocation du DOS en memoire conventionnelle : bx paragraphes -> un selecteur.
      // La bibliotheque C s'y replie (0x90151) pour ses blocs de 64 Ko au plus, quand la memoire
      // etendue est epuisee ; en echec, bx donne le plus grand bloc disponible.
      case 0x48: {
        const bloc = this.blocDos(R.ebx & 0xFFFF);
        if (!bloc) { R.ebx = (R.ebx & ~0xFFFF) | this.plusGrandBlocDos(); return erreur(8); }
        ax(bloc.sel); return ok();
      }
      case 0x49: this.libererDos(R.es); return ok();
      case 0x4C: throw new Sortie(al);
      case 0x4B: this.journal('exec ' + this.chaineC(R.edx >>> 0) + ' (ignore)'); ax(0); return ok();
      case 0x4D: ax(0); return ok();
      case 0x37: if (al === 0) { R.edx = (R.edx & ~0xFF) | 0x2F; ax(R.eax & 0xFF00); return ok(); } break;
      case 0xED: return erreur(1);
      case 0x19: ax((R.eax & 0xFF00) | 2); return ok();
      case 0x0E: ax((R.eax & 0xFF00) | 26); return ok();
      case 0x47: this.ecrireChaine(R.esi >>> 0, 'THEME.CD'); return ok();
      case 0x3B: return ok();
      case 0x36: R.eax = 64; R.ebx = 10000; R.ecx = 512; R.edx = 20000; return ok();
    }
    this.inconnu(`int 21 ah=${ah.toString(16)} al=${al.toString(16)}`);
    return erreur(1);
  }

  ouvrir(R, creer) {
    const nom = this.chaineC(R.edx >>> 0);
    const f = creer ? this.fichiers.creer(nom)
      : this.fichiers.ouvrir(nom, R.eax & 3) || (this.son && this.son.ouvrirPilote(nom));
    if (!f) {
      this.journal(`ouvrir ${nom} : introuvable`);
      R.eax = (R.eax & ~0xFFFF) | 2; R.CF = true; return;
    }
    // comme le DOS : le plus petit numero libre (la bibliotheque C a une table de taille fixe)
    let h = 5;
    while (this.handles.has(h)) h++;
    this.handles.set(h, { nom, f, pos: 0 });
    this.journal(`ouvrir ${nom} -> ${h} (${f.taille()} octets)`);
    R.eax = (R.eax & ~0xFFFF) | h; R.CF = false;
  }
  lire(R) {
    const h = R.ebx & 0xFFFF, n = R.ecx >>> 0, dest = R.edx >>> 0;
    const o = this.handles.get(h);
    if (!o) {
      if (h === 0) { R.eax = 0; R.CF = false; return; }
      R.eax = 6; R.CF = true; return;
    }
    const lu = o.f.lire(o.pos, n, this.m8, dest + this.base(R.ds));
    if (this.traceFichiers) this.journal(`lire ${o.nom} [${o.pos}] ${n} octets -> ${(dest >>> 0).toString(16)} : ${lu}`);
    o.pos += lu;
    R.eax = lu; R.CF = false;
  }
  ecrire(R) {
    const h = R.ebx & 0xFFFF, n = R.ecx >>> 0, src = (R.edx >>> 0) + this.base(R.ds);
    if (h === 1 || h === 2) {
      let s = '';
      for (let k = 0; k < n; k++) s += String.fromCharCode(this.m8[src + k]);
      this.journal('[console] ' + s.replace(/\r?\n$/, ''));
      R.eax = n; R.CF = false; return;
    }
    const o = this.handles.get(h);
    if (!o) { R.eax = 6; R.CF = true; return; }
    const ec = o.f.ecrire(o.pos, this.m8.subarray(src, src + n));
    o.pos += ec;
    R.eax = ec; R.CF = false;
  }
  positionner(R) {
    const h = R.ebx & 0xFFFF, mode = R.eax & 0xFF;
    const o = this.handles.get(h);
    if (!o) { R.eax = 6; R.CF = true; return; }
    const d = ((R.ecx & 0xFFFF) << 16 | (R.edx & 0xFFFF)) | 0;
    o.pos = mode === 0 ? d >>> 0 : mode === 1 ? o.pos + d : o.f.taille() + d;
    R.eax = (R.eax & ~0xFFFF) | (o.pos & 0xFFFF);
    R.edx = (R.edx & ~0xFFFF) | (o.pos >>> 16 & 0xFFFF);
    R.CF = false;
  }
  chercher(R, premier) {
    if (premier) {
      const motif = this.chaineC(R.edx >>> 0);
      this.recherche = this.fichiers.lister(motif);
      this.journal(`chercher ${motif} : ${this.recherche.length}`);
    }
    const suivant = this.recherche && this.recherche.shift();
    if (!suivant) { R.eax = (R.eax & ~0xFFFF) | 18; R.CF = true; return; }
    const dta = this.dta;
    this.m8[dta + 0x15] = 0x20;
    this.w16(dta + 0x16, 0); this.w16(dta + 0x18, (14 << 9) | (6 << 5) | 21);
    this.w32(dta + 0x1A, suivant.taille);
    this.ecrireChaine(dta + 0x1E, suivant.nom.toUpperCase());
    R.CF = false;
  }

  // --- DPMI ----------------------------------------------------------------------------------------
  dpmi(R) {
    const ax = R.eax & 0xFFFF;
    const ok = () => { R.CF = false; };
    switch (ax) {
      case 0x0000: {   // allouer des descripteurs
        const n = R.ecx & 0xFFFF;
        const premier = this.selLibre;
        for (let k = 0; k < n; k++) this.nouveauSelecteur(0, 0);
        R.eax = (R.eax & ~0xFFFF) | premier; return ok();
      }
      case 0x0001: this.descripteurs.delete(R.ebx & 0xFFF8); return ok();
      case 0x0006: { const b = this.base(R.ebx); R.ecx = (R.ecx & ~0xFFFF) | (b >>> 16); R.edx = (R.edx & ~0xFFFF) | (b & 0xFFFF); return ok(); }
      case 0x0007: { const d = this.descripteurs.get(R.ebx & 0xFFF8); if (d) d.base = ((R.ecx & 0xFFFF) << 16 | (R.edx & 0xFFFF)) >>> 0; return ok(); }
      case 0x0008: { const d = this.descripteurs.get(R.ebx & 0xFFF8); if (d) d.limite = ((R.ecx & 0xFFFF) << 16 | (R.edx & 0xFFFF)) >>> 0; return ok(); }
      case 0x0009: return ok();
      case 0x000A: { const d = this.descripteurs.get(R.ebx & 0xFFF8) || { base: 0, limite: 0xFFFFFFFF }; R.eax = (R.eax & ~0xFFFF) | this.nouveauSelecteur(d.base, d.limite); return ok(); }
      case 0x0100: {   // memoire DOS : bx paragraphes -> ax segment, dx selecteur
        const bloc = this.blocDos(R.ebx & 0xFFFF);
        if (!bloc) {
          R.eax = (R.eax & ~0xFFFF) | 8; R.ebx = (R.ebx & ~0xFFFF) | this.plusGrandBlocDos(); R.CF = true; return;
        }
        R.eax = (R.eax & ~0xFFFF) | (bloc.lin >> 4); R.edx = (R.edx & ~0xFFFF) | bloc.sel;
        this.journal(`DOS : ${(R.ebx & 0xFFFF) * 16} octets en ${bloc.lin.toString(16)}`);
        return ok();
      }
      case 0x0101: this.libererDos(R.edx); return ok();     // dx : le selecteur du bloc
      case 0x0200: { const v = this.vecteursRM.get(R.ebx & 0xFF) || { seg: 0, off: 0 }; R.ecx = (R.ecx & ~0xFFFF) | v.seg; R.edx = (R.edx & ~0xFFFF) | v.off; return ok(); }
      case 0x0201: this.vecteursRM.set(R.ebx & 0xFF, { seg: R.ecx & 0xFFFF, off: R.edx & 0xFFFF }); return ok();
      case 0x0202: R.ecx = (R.ecx & ~0xFFFF) | SEL_CODE; R.edx = 0; return ok();
      case 0x0203: return ok();
      case 0x0204: { const v = this.vecteursPM.get(R.ebx & 0xFF) || { sel: SEL_BIOS, off: R.ebx & 0xFF }; R.ecx = (R.ecx & ~0xFFFF) | v.sel; R.edx = v.off; return ok(); }
      case 0x0205: this.vecteursPM.set(R.ebx & 0xFF, { sel: R.ecx & 0xFFFF, off: R.edx >>> 0 }); this.journal(`vecteur PM ${(R.ebx & 0xFF).toString(16)} -> ${(R.edx >>> 0).toString(16)}`); return ok();
      case 0x0300: return this.interruptionModeReel(R);
      case 0x0303: {   // rappel en mode reel : on memorise la routine protegee
        const off = R.esi >>> 0;
        this.rappelMR = { off, sel: R.ds & 0xFFFF, struct: R.edi >>> 0 };
        this.journal(`rappel mode reel -> ${off.toString(16)}`);
        R.ecx = (R.ecx & ~0xFFFF) | 0xF000; R.edx = (R.edx & ~0xFFFF) | 0x0100; return ok();
      }
      case 0x0304: return ok();
      case 0x0400: R.eax = (R.eax & ~0xFFFF) | 0x005A; R.ebx = (R.ebx & ~0xFFFF) | 0x3; R.ecx = (R.ecx & ~0xFF) | 4; R.edx = (R.edx & ~0xFFFF) | 0x0870; return ok();
      case 0x0500: {
        const libre = TAILLE_MEMOIRE - this.tasLibre;
        const dest = (R.edi >>> 0) + this.base(R.es);
        for (let k = 0; k < 0x30; k += 4) this.w32(dest + k, 0xFFFFFFFF);
        this.w32(dest, libre); this.w32(dest + 4, libre >>> 12); this.w32(dest + 8, libre >>> 12);
        this.w32(dest + 0x14, libre >>> 12); this.w32(dest + 0x18, TAILLE_MEMOIRE >>> 12); this.w32(dest + 0x1C, libre >>> 12);
        return ok();
      }
      case 0x0501: {   // bloc de memoire : bx:cx octets -> bx:cx lineaire, si:di handle
        const taille = ((R.ebx & 0xFFFF) << 16 | (R.ecx & 0xFFFF)) >>> 0;
        const lin = this.allouerTas(taille);
        if (lin === null) { R.CF = true; R.eax = (R.eax & ~0xFFFF) | 0x8013; return; }
        const hd = this.handleLibre++;
        this.blocs.set(hd, { lin, taille });
        R.ebx = (R.ebx & ~0xFFFF) | (lin >>> 16); R.ecx = (R.ecx & ~0xFFFF) | (lin & 0xFFFF);
        R.esi = (R.esi & ~0xFFFF) | (hd >>> 16); R.edi = (R.edi & ~0xFFFF) | (hd & 0xFFFF);
        this.journal(`DPMI 0501 : ${taille} octets en ${lin.toString(16)}`);
        return ok();
      }
      case 0x0502: return ok();
      case 0x0503: {
        const hd = ((R.esi & 0xFFFF) << 16 | (R.edi & 0xFFFF)) >>> 0;
        const taille = ((R.ebx & 0xFFFF) << 16 | (R.ecx & 0xFFFF)) >>> 0;
        const ancien = this.blocs.get(hd);
        const lin = this.allouerTas(taille);
        if (lin === null) { R.CF = true; return; }
        if (ancien) this.m8.copyWithin(lin, ancien.lin, ancien.lin + Math.min(ancien.taille, taille));
        this.blocs.delete(hd);
        const nh = this.handleLibre++;
        this.blocs.set(nh, { lin, taille });
        R.ebx = (R.ebx & ~0xFFFF) | (lin >>> 16); R.ecx = (R.ecx & ~0xFFFF) | (lin & 0xFFFF);
        R.esi = (R.esi & ~0xFFFF) | (nh >>> 16); R.edi = (R.edi & ~0xFFFF) | (nh & 0xFFFF);
        return ok();
      }
      case 0x0600: case 0x0601: case 0x0602: case 0x0603: return ok();
      case 0x0800: { // correspondance d'adresse physique : identite
        R.ebx = R.ebx & ~0xFFFF | (R.ebx & 0xFFFF); return ok();
      }
    }
    this.inconnu('DPMI ' + ax.toString(16));
    R.CF = true;
  }

  // DPMI 0300h : interruption en mode reel ; es:edi -> structure de registres du mode reel
  interruptionModeReel(R) {
    const n = R.ebx & 0xFF;
    const s = (R.edi >>> 0) + this.base(R.es);
    const RM = {
      eax: this.r32(s + 0x1C), ebx: this.r32(s + 0x10), ecx: this.r32(s + 0x18), edx: this.r32(s + 0x14),
      esi: this.r32(s + 0x04), edi: this.r32(s + 0x00), ebp: this.r32(s + 0x08),
      es: this.r16(s + 0x22), ds: this.r16(s + 0x24), CF: false,
    };
    this.compte('rm int ' + n.toString(16) + ':' + (RM.eax & 0xFFFF).toString(16));
    switch (n) {
      case 0x10: this.video.biosModeReel(RM); break;
      case 0x33: this.piloteSourisModeReel(RM); break;
      case 0x2F: if ((RM.eax & 0xFFFF) === 0x1600) RM.eax &= ~0xFF; else RM.CF = true; break;
      default: this.inconnu(`int ${n.toString(16)} (mode reel) ax=${(RM.eax & 0xFFFF).toString(16)}`); RM.CF = true;
    }
    this.w32(s + 0x1C, RM.eax); this.w32(s + 0x10, RM.ebx); this.w32(s + 0x18, RM.ecx); this.w32(s + 0x14, RM.edx);
    this.w32(s + 0x04, RM.esi); this.w32(s + 0x00, RM.edi); this.w32(s + 0x08, RM.ebp);
    this.w16(s + 0x22, RM.es); this.w16(s + 0x24, RM.ds);
    this.w16(s + 0x20, (this.r16(s + 0x20) & ~1) | (RM.CF ? 1 : 0));
    R.CF = false;
  }

  // --- entrees venues de l'exterieur (script, navigateur) --------------------------------------------
  // position en coordonnees du pilote de souris (en mode 13h : x de 0 a 639, y de 0 a 199)
  deplacerSouris(x, y) {
    const s = this.souris;
    x = Math.max(s.xmin, Math.min(s.xmax, x | 0)); y = Math.max(s.ymin, Math.min(s.ymax, y | 0));
    if (x === s.x && y === s.y) return;
    s.mickeyX += (x - s.x) * 2; s.mickeyY += (y - s.y) * 2;
    s.x = x; s.y = y;
    // un deplacement remplace le deplacement precedent encore en attente
    const der = s.file[s.file.length - 1];
    if (der && der.masque === 1) { der.x = x; der.y = y; }
    else s.file.push({ masque: 1, boutons: s.boutons, x, y, quand: 0 });
  }
  // chaque changement de bouton est un evenement distinct : un clic bref n'est jamais perdu
  boutonsSouris(b) {
    const s = this.souris, avant = s.boutons;
    if (b === avant) return;
    let m = 0;
    if ((b & 1) && !(avant & 1)) m |= 2;
    if (!(b & 1) && (avant & 1)) m |= 4;
    if ((b & 2) && !(avant & 2)) m |= 8;
    if (!(b & 2) && (avant & 2)) m |= 16;
    s.boutons = b;
    // un clic humain dure au moins quelques centiemes : on espace les changements de bouton pour
    // que les boucles du jeu qui sondent l'etat 'enfonce' aient le temps de le voir
    const quand = Math.max(this.us, (s.dernierBouton || 0) + 40000);
    s.dernierBouton = quand;
    s.file.push({ masque: m, boutons: b, x: s.x, y: s.y, quand });
  }
  // Le pointeur du navigateur. Le navigateur donne des positions absolues ; une souris de PC ne
  // connait que des deplacements, et le jeu en tient compte : il deplace lui-meme le pointeur du
  // pilote (fonction 4), au centre de l'ecran quand il change de mode, et a chaque image pendant le
  // trace d'un chemin, pour le coller a la grille ; puis il additionne les ecarts entre deux
  // positions successives (retro-ingenierie.md § 6.7). Imposer la position du navigateur ferait
  // sauter le curseur apres chaque deplacement du jeu : on transmet donc le mouvement, applique a
  // partir de la ou se trouve le pointeur du pilote. (x, y) : la position du navigateur, (dx, dy) :
  // son mouvement depuis la precedente, en unites du pilote.
  deplacerPointeur(x, y, dx, dy) {
    const s = this.souris;
    const premier = !s.navigateur;
    s.navigateur = { x, y };
    if (premier) { this.deplacerSouris(x, y); return; }
    if (!dx && !dy) return;
    const der = s.file[s.file.length - 1];
    if (der && der.relatif && !der.capture) { der.dx += dx; der.dy += dy; }
    else s.file.push({ masque: 1, relatif: true, dx, dy, quand: 0 });
  }

  // La souris capturee par la page (pointer lock) : le navigateur ne donne plus que des mouvements,
  // exactement comme une souris de PC. Pas de recalage : il n'y a plus de pointeur du navigateur a
  // rejoindre, et le pointeur du pilote, bloque aux bords, fait defiler la vue comme sous DOS.
  deplacerSourisDe(dx, dy) {
    const s = this.souris;
    if (!dx && !dy) return;
    const der = s.file[s.file.length - 1];
    if (der && der.relatif && der.capture) { der.dx += dx; der.dy += dy; }
    else s.file.push({ masque: 1, relatif: true, capture: true, dx, dy, quand: 0 });
  }

  // Livre un mouvement du pointeur du navigateur comme une souris de PC l'aurait fait : en petits
  // pas, chacun signale au jeu. Le decoupage compte : en 640x480, quand un outil est choisi, le
  // gestionnaire du jeu part de la position du pilote et y ajoute encore l'ecart depuis la
  // precedente ; un seul grand pas enverrait le curseur au double de la distance.
  // Quand le jeu ne deplace plus lui-meme le pointeur depuis un moment, le mouvement est complete
  // d'une part de l'ecart qui reste entre le pointeur du pilote et celui du navigateur : le curseur
  // du jeu revient ainsi doucement sous la main.
  livrerDeplacement(ev) {
    const s = this.souris;
    let dx = ev.dx, dy = ev.dy;
    if (!ev.capture && s.navigateur && this.us - s.placement > RECALAGE_APRES_US) {
      dx += versZero(s.navigateur.x - (s.x + dx));
      dy += versZero(s.navigateur.y - (s.y + dy));
    }
    const pas = Math.max(1, Math.round((s.xmax - s.xmin + 1) / PAS_PAR_ECRAN));
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / pas));
    const x0 = s.x, y0 = s.y;
    for (let k = 1; k <= n; k++) {
      const x = Math.max(s.xmin, Math.min(s.xmax, x0 + Math.round(dx * k / n)));
      const y = Math.max(s.ymin, Math.min(s.ymax, y0 + Math.round(dy * k / n)));
      if (x === s.x && y === s.y) continue;
      s.mickeyX += (x - s.x) * 2; s.mickeyY += (y - s.y) * 2;
      s.x = x; s.y = y;
      if (!s.rappel || !(s.masque & 1)) continue;
      this.compte('souris');
      this.appelerGestionnaire(s.rappel.off, 'retf', {
        eax: 1, ebx: s.boutons, ecx: s.x, edx: s.y, esi: s.mickeyX & 0xFFFF, edi: s.mickeyY & 0xFFFF,
      });
    }
  }

  // L'etat des touches mortes, tel que le BIOS le rend (int 16h, fonction 12h) et le garde dans sa
  // zone de donnees : bit 0 Maj droite, bit 1 Maj gauche, bit 2 Ctrl, bit 3 Alt. Le jeu le lit a
  // chaque touche et en fait ses propres bits (1 Maj, 2 Ctrl, 4 Alt) : sans lui, aucune touche a
  // modificateur n'est atteignable par un scenario.
  poserModificateurs(etat) {
    this.etatMaj = etat & 0xFFFF;
    this.m8[0x417] = etat & 0xFF;
  }

  // Le tampon du BIOS ne garde que 15 touches (seize mots en 0x41E, l'un toujours libre) : au-delà,
  // le BIOS de 1994 bipait et perdait la touche. Sans cette borne, les touches frappées pendant que le
  // jeu ne les lit pas (la fin d'année, les négociations) ou plus vite qu'il ne les lit (une par image,
  // et F4 tenu, répété trente fois par seconde, quand les images ralentissent) s'accumulaient sans fin :
  // la vitesse du jeu continuait de monter, image après image, longtemps après la touche relâchée, et
  // les F3 attendaient derrière (retour 80 de docs/demandes.md). Aucun scénario n'en a plus d'une en
  // attente.
  toucheAppuyee(scancode, ascii = 0) {
    if (this.toucheBios.length < TAMPON_DU_CLAVIER) this.toucheBios.push((scancode << 8) | ascii);
    this.clavier.push(scancode);
  }
  toucheRelachee(scancode) { this.clavier.push(scancode | 0x80); }

  // Entrees programmees d'un scenario : { t (secondes virtuelles), souris: [x, y, boutons] |
  // touche + ascii | relache | modificateurs (l'etat des touches mortes, voir poserModificateurs) }. livrerScenario() transmet celles dont l'heure est venue ; la file
  // appartient a la machine pour que les instantanes la sauvent avec le reste.
  programmer(evenements) { this.scenario = { evenements: [...evenements], suivant: 0 }; }
  livrerScenario() {
    const sc = this.scenario;
    if (!sc) return;
    while (sc.suivant < sc.evenements.length && sc.evenements[sc.suivant].t * 1e6 <= this.us) {
      const e = sc.evenements[sc.suivant++];
      if (e.souris) { this.deplacerSouris(e.souris[0], e.souris[1]); this.boutonsSouris(e.souris[2] || 0); }
      if (e.modificateurs !== undefined) this.poserModificateurs(e.modificateurs);
      if (e.touche !== undefined) this.toucheAppuyee(e.touche, e.ascii || 0);
      if (e.relache !== undefined) this.toucheRelachee(e.relache);
      this.journal('evenement ' + JSON.stringify(e));
    }
  }

  // --- instantanes -----------------------------------------------------------------------------------
  // Tout ce que l'hote garde hors de la memoire du jeu et que le jeu peut observer : le temps et la
  // minuterie, les entrees en attente (celles d'un scenario comprises), la memoire allouee, les
  // selecteurs et les vecteurs d'interruption, les fichiers ouverts, la carte video. La comparaison
  // appel par appel execute deux fois une meme fonction a partir du meme etat : elle sauve cet etat,
  // le restaure entre les deux executions, et compare ce que chacune en a fait. La restauration se
  // fait en place : aucune reference tenue ailleurs ne se perd. `dans` permet de reutiliser les
  // copies d'un instantane precedent.
  instantane(dans = {}) {
    for (const k of CHAMPS_INSTANTANE) dans[k] = this[k];
    dans.clavier = this.clavier.slice();
    dans.toucheBios = this.toucheBios.slice();
    dans.souris = { ...this.souris, file: this.souris.file.map((e) => ({ ...e })) };
    dans.scenario = this.scenario ? this.scenario.suivant : 0;
    for (const k of TABLES_INSTANTANE) dans[k] = copierTable(this[k]);
    dans.video = this.video.instantane(dans.video);
    if (this.son) dans.son = this.son.instantane();
    return dans;
  }

  restaurer(s) {
    for (const k of CHAMPS_INSTANTANE) this[k] = s[k];
    this.clavier.length = 0; this.clavier.push(...s.clavier);
    this.toucheBios.length = 0; this.toucheBios.push(...s.toucheBios);
    for (const k of Object.keys(this.souris)) if (!(k in s.souris)) delete this.souris[k];
    Object.assign(this.souris, s.souris, { file: s.souris.file.map((e) => ({ ...e })) });
    if (this.scenario) this.scenario.suivant = s.scenario;
    for (const k of TABLES_INSTANTANE) {
      this[k].clear();
      for (const [c, v] of copierTable(s[k])) this[k].set(c, v);
    }
    this.video.restaurer(s.video);
    if (this.son && s.son) this.son.restaurer(s.son);
  }

  // Ce qui differe entre deux instantanes, a (obtenu) et b (reference) : [] s'ils sont egaux.
  // Le travail ecoule depuis le dernier service (ticsSansTemps) et les declenchements du garde-fou
  // ne sont pas compares : ils mesurent la quantite de code execute, qui differe par nature entre
  // une transcription et une reecriture. Ils ne comptent pour le jeu que si le garde-fou part, et
  // cela se voit alors sur l'heure, qui est comparee.
  ecartsInstantanes(a, b) {
    const ecarts = [];
    for (const k of CHAMPS_INSTANTANE) {
      if (k === 'ticsSansTemps' || k === 'gardes') continue;
      if (a[k] !== b[k]) ecarts.push(`hote.${k} : ${a[k]} / ${b[k]}`);
    }
    // les fichiers ouverts par leur nom et leur position : leur contenu ne change pas
    const resume = (k, x) => (k === 'handles' ? [...x].map(([c, v]) => [c, v.nom, v.pos]) : x);
    const json = (k, x) => JSON.stringify(resume(k, x), (c, v) => (v instanceof Map ? [...v] : v));
    for (const k of ['clavier', 'toucheBios', 'souris', 'scenario', ...TABLES_INSTANTANE]) {
      if (json(k, a[k]) !== json(k, b[k])) ecarts.push(`hote.${k} differe`);
    }
    const son = this.son && a.son && b.son ? this.son.ecarts(a.son, b.son) : [];
    return ecarts.concat(this.video.ecarts(a.video, b.video), son);
  }

  // --- clavier ---------------------------------------------------------------------------------------
  biosClavier(R) {
    const ah = (R.eax >> 8) & 0xFF;
    if (this.traceClavier && (this.nClavier = (this.nClavier || 0) + 1) % 2000000 === 0) {
      this.journal(`pile au ${this.nClavier}e appel clavier : ` + pileJeu());
    }
    switch (ah) {
      case 0x01: case 0x11:                               // touche disponible ?
        this.avancer(2);
        if (this.toucheBios.length) { R.ZF = false; R.eax = (R.eax & ~0xFFFF) | this.toucheBios[0]; }
        else R.ZF = true;
        return;
      case 0x00: case 0x10:                               // lire la touche
        R.eax = (R.eax & ~0xFFFF) | (this.toucheBios.shift() || 0); return;
      case 0x02: case 0x12: R.eax = (R.eax & ~0xFFFF) | this.etatMaj; return;
    }
    this.inconnu('int 16 ah=' + ah.toString(16));
  }

  // --- souris (int 33h) ----------------------------------------------------------------------------
  pilotesouris(R) { this.piloteSourisModeReel(R); }
  piloteSourisModeReel(R) {
    const s = this.souris;
    const ax = R.eax & 0xFFFF;
    const set = (r, v) => { R[r] = (R[r] & ~0xFFFF) | (v & 0xFFFF); };
    switch (ax) {
      case 0x00: set('eax', 0xFFFF); set('ebx', 2); return;
      case 0x01: s.visible = true; return;
      case 0x02: s.visible = false; return;
      case 0x03: set('ebx', s.boutons); set('ecx', s.x); set('edx', s.y); return;
      case 0x04: s.x = R.ecx & 0xFFFF; s.y = R.edx & 0xFFFF; s.placement = this.us; return;
      case 0x07: s.xmin = R.ecx & 0xFFFF; s.xmax = R.edx & 0xFFFF; return;
      case 0x08: s.ymin = R.ecx & 0xFFFF; s.ymax = R.edx & 0xFFFF; return;
      case 0x0B: set('ecx', s.mickeyX); set('edx', s.mickeyY); s.mickeyX = s.mickeyY = 0; return;
      case 0x0C: s.masque = R.ecx & 0xFFFF; s.rappel = { seg: R.es & 0xFFFF, off: R.edx >>> 0 }; this.journal(`souris : rappel ${s.rappel.seg.toString(16)}:${s.rappel.off.toString(16)} masque ${s.masque.toString(16)}`); return;
      case 0x0F: case 0x1A: case 0x13: case 0x1D: return;
      case 0x24: set('ebx', 0x0626); set('ecx', 0x0400); return;
    }
    this.inconnu('int 33 ax=' + ax.toString(16));
  }
}
