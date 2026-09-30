// Le système de fichiers vu par le jeu dans la page, pour le moteur autonome : les fichiers du CD,
// refaits depuis les assets (assets-du-jeu.js) avant le démarrage, et les sauvegardes de la page.
//
// Les assets sont lus de trois façons :
//  - 'url' : servis avec la page : dans assets/ (le serveur local), ou dans les dossiers de la
//    distribution (`disposition: 'distribution'` : site/, moteur/hote/distribution.js, qui dit où va
//    chaque asset) ;
//  - 'opfs' : dans le stockage privé du navigateur (Origin Private File System), où la page a déroulé
//    l'image du CD que le joueur lui a donnée (moteur/web/extraction-travailleur.js) ;
//  - 'compagnons' : la distribution ouverte d'un double-clic (file://), où la page ne peut rien lire
//    d'un fichier voisin : les mêmes assets viennent des scripts compagnons (images/images.js...), que
//    lit la fonction `lireAsset(chemin)` donnée avec le paquet (moteur/web/environnement-distribution.js).
//    Le moteur tourne alors dans le fil de la page, qui passe le paquet tel quel.
// La recomposition est souple (assets-du-jeu.js, `signaler`) : un asset modifié à la main, ou
// absent, est signalé dans la console, et le jeu continue avec ce qu'il a quand il le peut.
// Une fois refaits, les fichiers du jeu sont en mémoire, et le jeu les lit de façon synchrone, comme
// sous DOS. Seuls les gros fichiers de données (les films FLC, jusqu'à 18 Mo, tant qu'ils ne sont pas
// convertis en mp4) sont lus à la demande : par morceaux de 256 Ko (en-tête Range) depuis le site,
// par un FileReaderSync depuis l'OPFS.
//
// Les sauvegardes (tout ce que le jeu écrit, dans C:/THEME.CD/) sont gardées ici, en mémoire : la page
// les donne au démarrage, et chaque fichier écrit lui est renvoyé une fois, quand le jeu n'y a plus
// écrit depuis 100 ms (`viderSiCalme`, que le travailleur appelle à chaque tour) ; elle le range
// dans le navigateur (IndexedDB, moteur/web/donnees.js). La sauvegarde de fin d'année s'écrit en 53
// blocs : un envoi par bloc figeait le jeu (retour 45 de docs/demandes.md).

import { cheminSurLeCD, composerLesFichiers, composerLeProgramme } from './assets-du-jeu.js';
import { inflate } from './inflate.js';
import { cheminDansLaDistribution } from './distribution.js';

const MORCEAU = 256 * 1024;
const GROS = 2 * MORCEAU;            // au-delà, un fichier de données est lu à la demande

// Le zlib des PNG, décompressé par le navigateur ; sans DecompressionStream (Chrome 49 à 79, Firefox
// 52 à 112), par inflate.js.
async function gonfler(octets) {
  if (typeof DecompressionStream === 'undefined') return inflate(octets);
  const flux = new DecompressionStream('deflate');
  const ecrivain = flux.writable.getWriter();
  ecrivain.write(octets);
  ecrivain.close();
  return new Uint8Array(await new Response(flux.readable).arrayBuffer());
}

// Un gros fichier servi avec la page, lu par morceaux à la demande, par des requêtes synchrones
// (permises dans un travailleur). Les deux derniers morceaux sont gardés ; un serveur qui rend le
// fichier entier à une demande partielle (il ignore Range, comme python -m http.server) est servi
// une fois, et le fichier gardé.
function lecteurParMorceaux(url, taille) {
  const morceaux = new Map();
  let entier = null;
  const demander = (position, nombre) => {
    for (let essai = 1; ; essai++) {
      const x = new XMLHttpRequest();
      x.open('GET', url, false);
      x.responseType = 'arraybuffer';
      x.setRequestHeader('Range', `bytes=${position}-${position + nombre - 1}`);
      try {
        x.send();
      } catch (err) {
        // (une requête perdue sur le réseau est refaite, deux fois au plus : docs/demandes.md, retour 50)
        if (essai >= 3) throw err;
        continue;
      }
      if (x.status >= 400) throw new Error(`${url} : erreur ${x.status}`);
      const d = new Uint8Array(x.response);
      if (x.status === 200) { entier = d; return d.subarray(position, position + nombre); }
      return d;
    }
  };
  const morceau = (k) => {
    let m = morceaux.get(k);
    if (!m) {
      const debut = k * MORCEAU;
      m = demander(debut, Math.min(MORCEAU, taille - debut));
      morceaux.set(k, m);
      if (morceaux.size > 2) morceaux.delete(morceaux.keys().next().value);
    }
    return m;
  };
  return {
    taille,
    lire(position, nombre) {
      if (entier) return entier.subarray(position, position + nombre);
      const sortie = new Uint8Array(nombre);
      for (let fait = 0; fait < nombre;) {
        const n = Math.floor((position + fait) / MORCEAU), dans = (position + fait) % MORCEAU;
        const m = entier ? entier.subarray(n * MORCEAU, (n + 1) * MORCEAU) : morceau(n);
        const part = Math.min(nombre - fait, m.length - dans);
        sortie.set(m.subarray(dans, dans + part), fait);
        fait += part;
      }
      return sortie;
    },
  };
}

// Préparer les fichiers du jeu, avant le démarrage (asynchrone : les assets se lisent ainsi, et
// l'OPFS ne donne ses accès synchrones que par une promesse). Rend { genre, index, fichiers (chemin
// sur le CD -> taille), programme (l'image du programme au format de programme.bin, que lit
// lireLImage), introduction (celle de l'introduction, ou null : des assets faits sans INTRO.EXE),
// lire(chemin, position, taille) → octets }.
export async function ouvrirLePaquet(paquet) {
  let lireAsset, paresseux;
  const enAttente = [];
  if (paquet.genre === 'url') {
    const base = paquet.base.endsWith('/') ? paquet.base : paquet.base + '/';
    const place = paquet.disposition === 'distribution' ? cheminDansLaDistribution : (c) => c;
    const url = (c) => base + place(c).split('/').map(encodeURIComponent).join('/');
    lireAsset = async (c) => {
      // (revalidé à chaque chargement : un asset modifié dans la distribution est pris au rechargement,
      // même servi par un serveur qui ne dit rien du cache)
      const r = await fetch(url(c), { cache: 'no-cache' });
      if (!r.ok) throw new Error(`${c} : erreur ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    };
    paresseux = (c, taille) => (taille > GROS ? lecteurParMorceaux(url(c), taille) : null);
  } else if (paquet.genre === 'opfs') {
    let dossier = await navigator.storage.getDirectory();
    for (const d of (paquet.dossier || 'assets').split('/')) dossier = await dossier.getDirectoryHandle(d);
    // (getFile : un instantané, que le jeu ne modifie jamais ; lu d'un FileReaderSync, synchrone dans
    // un travailleur. Les accès synchrones de l'OPFS, exclusifs, restaient tenus par le travailleur
    // de la page précédente quand on la rechargeait : le nouveau ne pouvait plus les ouvrir.)
    const prendre = async (chemin) => {
      let d = dossier;
      const parties = chemin.split('/');
      for (const p of parties.slice(0, -1)) d = await d.getDirectoryHandle(p);
      return (await d.getFileHandle(parties[parties.length - 1])).getFile();
    };
    lireAsset = async (c) => new Uint8Array(await (await prendre(c)).arrayBuffer());
    const lecteur = new FileReaderSync();
    paresseux = (c, taille) => {
      if (taille <= GROS) return null;
      const l = { taille, fichier: null, lire: (position, nombre) => new Uint8Array(lecteur.readAsArrayBuffer(l.fichier.slice(position, position + nombre))) };
      enAttente.push(prendre(c).then((f) => { l.fichier = f; }));
      return l;
    };
  } else if (paquet.genre === 'compagnons') {
    lireAsset = async (c) => paquet.lireAsset(c);
    paresseux = null;
  } else {
    throw new Error(`données inconnues : ${paquet.genre}`);
  }
  const index = JSON.parse(new TextDecoder().decode(await lireAsset('index.json')));
  const signaler = (message) => console.warn(`assets : ${message}`);
  // (les bruitages : la page joue leurs fichiers, le moteur ne dit que les événements (son.js) ; ses
  // banques sont des silences de la durée d'origine, sans lire les WAV : assets-du-jeu.js)
  const contenus = await composerLesFichiers(index, lireAsset, gonfler, paresseux, { signaler, bruitagesMuets: paquet.bruitagesMuets !== false });
  await Promise.all(enAttente);
  // l'image du programme et celle de l'introduction, refaites de leurs tables lisibles (assets-du-jeu.js)
  // (les polices en font une part : lues comme les planches des banques, en mode souple)
  const programme = await composerLeProgramme(index, lireAsset, 'programme', { inflate: gonfler, signaler });
  const introduction = await composerLeProgramme(index, lireAsset, 'introduction', { inflate: gonfler, signaler }).catch((err) => {
    console.warn(`assets : pas d'introduction (${err.message})`);
    return null;
  });
  const fichiers = {};
  for (const [c, f] of contenus) fichiers[c] = f instanceof Uint8Array ? f.length : f.taille;
  return {
    genre: paquet.genre, index, fichiers, programme, introduction, films: index.films || {},
    // un asset (chemin d'index.json), en octets : le manifeste des sons (moteur/web/fichiers-des-sons.js)
    lireAsset,
    lire(c, position, taille) {
      const f = contenus.get(c);
      return f instanceof Uint8Array ? f.subarray(position, position + taille) : f.lire(position, taille);
    },
  };
}

export class FichiersDuPaquet {
  // paquet : ce que rend ouvrirLePaquet ; sauvegardes : [[chemin vu par le jeu, octets]] ;
  // envoyer(chemin, octets | null) : un fichier écrit (ou effacé), pour la page.
  constructor(paquet, sauvegardes = [], envoyer = () => {}, courant = 'C:/THEME.CD/') {
    this.paquet = paquet;
    this.envoyer = envoyer;
    this.courant = courant.toUpperCase();
    this.ecrits = new Map();             // chemin vu par le jeu -> { d, taille }
    for (const [chemin, octets] of sauvegardes) this.ecrits.set(this.normaliser(chemin), { d: octets, taille: octets.length });
    this.effaces = new Set();            // fichiers du CD que le jeu a effacés (C:/THEME.CD/SAVE/DEMO.GY...)
    this.enAttente = new Set();
    this.derniereEcriture = 0;
  }

  normaliser(nom) {
    let n = nom.replace(/\\/g, '/').toUpperCase();
    if (!/^[A-Z]:/.test(n)) n = this.courant + n;
    const parts = [];
    for (const p of n.split('/')) {
      if (p === '.' || p === '') continue;
      if (p === '..') parts.pop(); else parts.push(p);
    }
    return parts.join('/');
  }

  // Le chemin sur le CD d'un fichier du jeu, s'il y est (et n'a pas été effacé ou remplacé).
  duPaquet(n) {
    if (this.effaces.has(n)) return null;
    const c = cheminSurLeCD(n);
    return c && this.paquet.fichiers[c] !== undefined ? c : null;
  }

  existe(nom) {
    const n = this.normaliser(nom);
    return this.ecrits.has(n) || this.duPaquet(n) !== null;
  }

  // (voir travailleur.js : la page reçoit les fichiers écrits une fois le jeu calme)
  viderSiCalme(maintenant = performance.now()) {
    if (this.enAttente.size && maintenant - this.derniereEcriture > 100) this.vider();
  }
  vider() {
    for (const n of this.enAttente) {
      const e = this.ecrits.get(n);
      this.envoyer(n, e ? e.d.slice(0, e.taille) : null);
    }
    this.enAttente.clear();
  }

  ouvrir(nom) {
    const n = this.normaliser(nom);
    if (this.ecrits.has(n)) return this.fichierEcrit(n);
    const c = this.duPaquet(n);
    return c ? this.fichierDuPaquet(c) : null;
  }

  creer(nom) {
    const n = this.normaliser(nom);
    if (!n.startsWith('C:/')) return null;
    this.ecrits.set(n, { d: new Uint8Array(0), taille: 0 });
    this.effaces.delete(n);
    this.enAttente.add(n);
    this.derniereEcriture = performance.now();
    return this.fichierEcrit(n);
  }

  effacer(nom) {
    const n = this.normaliser(nom);
    if (this.ecrits.delete(n)) { this.enAttente.add(n); this.derniereEcriture = performance.now(); }
    if (this.duPaquet(n) !== null && n.startsWith('C:/')) this.effaces.add(n);
  }

  lister(motif) {
    const n = this.normaliser(motif);
    const dossier = n.slice(0, n.lastIndexOf('/') + 1);
    const base = n.slice(n.lastIndexOf('/') + 1);
    const re = new RegExp('^' + base.replace(/[.+^${}()|[\]]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    const vus = new Map();
    for (const [k, e] of this.ecrits) vus.set(k, e.taille);
    // les fichiers du CD, sous les noms que le jeu leur donne (D:/GAME/..., et C:/THEME.CD/DATA/ ou SAVE/)
    for (const [c, taille] of Object.entries(this.paquet.fichiers)) {
      if (!c.startsWith('GAME/')) continue;
      const noms = ['D:/' + c];
      if (c.startsWith('GAME/DATA/')) noms.push('C:/THEME.CD/DATA/' + c.slice('GAME/DATA/'.length));
      if (c.startsWith('GAME/SAVE/')) noms.push('C:/THEME.CD/SAVE/' + c.slice('GAME/SAVE/'.length));
      for (const k of noms) if (!vus.has(k) && !this.effaces.has(k)) vus.set(k, taille);
    }
    return [...vus]
      .filter(([k]) => k.startsWith(dossier) && !k.slice(dossier.length).includes('/') && re.test(k.slice(dossier.length)))
      .map(([k, taille]) => ({ nom: k.slice(dossier.length), taille }));
  }

  // Un fichier du CD, en lecture seule : en mémoire, ou lu à la demande s'il est gros.
  fichierDuPaquet(c) {
    const taille = this.paquet.fichiers[c];
    const paquet = this.paquet;
    return {
      taille: () => taille,
      lire(pos, nb, m8, dest) {
        const k = Math.max(0, Math.min(nb, taille - pos));
        if (k > 0) m8.set(paquet.lire(c, pos, k), dest);
        return k;
      },
      ecrire: () => 0,
    };
  }

  // Un fichier écrit par le jeu (ou une sauvegarde donnée par la page) : en mémoire, agrandi du double
  // au besoin, renvoyé à la page quand le jeu est calme.
  fichierEcrit(n) {
    const moi = this;
    return {
      taille: () => moi.ecrits.get(n)?.taille ?? 0,
      lire(pos, nb, m8, dest) {
        const e = moi.ecrits.get(n);
        if (!e) return 0;
        const k = Math.max(0, Math.min(nb, e.taille - pos));
        if (k > 0) m8.set(e.d.subarray(pos, pos + k), dest);
        return k;
      },
      ecrire(pos, octets) {
        let e = moi.ecrits.get(n);
        if (!e) { e = { d: new Uint8Array(0), taille: 0 }; moi.ecrits.set(n, e); }
        const fin = pos + octets.length;
        if (fin > e.d.length) { const nd = new Uint8Array(Math.max(fin, 2 * e.d.length)); nd.set(e.d.subarray(0, e.taille)); e.d = nd; }
        e.d.set(octets, pos);
        e.taille = Math.max(e.taille, fin);
        moi.enAttente.add(n);
        moi.derniereEcriture = performance.now();
        return octets.length;
      },
    };
  }
}
