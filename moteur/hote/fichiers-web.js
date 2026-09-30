// Systeme de fichiers vu par le jeu, dans un Web Worker : requetes synchrones vers le serveur
// local (moteur/node/serveur.mjs). Les requetes synchrones sont permises dans un worker, et le
// code du jeu attend ses fichiers de facon synchrone, comme sous DOS.
//
// Les ecritures sont gardees ici, et chaque fichier ecrit est envoye au serveur une seule fois,
// quand le jeu n'y a plus ecrit depuis 100 ms (viderSiCalme, que le travailleur appelle a chaque
// tour de sa boucle), ou avant d'etre relu, recree ou efface. Chaque ecriture du jeu envoyait tout
// le fichier : la sauvegarde de fin d'annee s'ecrit en 53 blocs, soit 53 requetes synchrones et
// 15 Mo pour un fichier de 305 Ko, et le jeu restait fige 0,3 a 0,5 s au clic qui ferme l'annee
// (retour 45 de docs/demandes.md ; en vitesse ultra-rapide, une fin d'annee toutes les 19 s).

export class FichiersWeb {
  constructor(base = '/jeu', courant = 'C:/THEME.CD/') {
    this.base = base;
    this.courant = courant.toUpperCase();
    this.index = JSON.parse(this.requete('GET', `${base}/index.json`, 'text'));
    this.cache = new Map();
    this.enAttente = new Map();          // chemin -> () => son contenu, a envoyer
    this.derniereEcriture = 0;
  }

  // Envoyer au serveur les fichiers ecrits (tous, ou le seul `n`).
  vider(n = null) {
    for (const [k, contenu] of [...this.enAttente]) {
      if (n !== null && k !== n) continue;
      this.enAttente.delete(k);
      this.requete('PUT', `${this.base}/fichier?chemin=${encodeURIComponent(k)}`, 'text', contenu());
    }
  }

  viderSiCalme(maintenant = performance.now()) {
    if (this.enAttente.size && maintenant - this.derniereEcriture > 100) this.vider();
  }

  // Une requete synchrone. Une requete qui echoue sur le reseau (NetworkError) arretait le jeu sur une
  // ERREUR : vu dans le navigateur integre de Claude, cache (docs/demandes.md, retour 50 ; la cause
  // n'est pas etablie). Elle est refaite, deux fois au plus, par precaution : lire, ecrire tout le
  // fichier ou l'effacer peut se refaire sans dommage.
  requete(methode, url, type = 'arraybuffer', corps = null) {
    for (let essai = 1; ; essai++) {
      const x = new XMLHttpRequest();
      x.open(methode, url, false);
      if (type) x.responseType = type;
      try {
        x.send(corps);
      } catch (err) {
        if (essai >= 3) throw err;
        continue;
      }
      if (x.status >= 400) return null;
      return x.response;
    }
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

  existe(nom) { return this.index[this.normaliser(nom)] !== undefined; }

  lireTout(n) {
    if (this.enAttente.has(n)) return this.enAttente.get(n)().slice();
    if (this.cache.has(n)) return this.cache.get(n);
    const r = this.requete('GET', `${this.base}/fichier?chemin=${encodeURIComponent(n)}`);
    if (!r) return null;
    const d = new Uint8Array(r);
    if (n.includes('/DATA/')) this.cache.set(n, d);      // les donnees ne changent pas
    return d;
  }

  ouvrir(nom) {
    const n = this.normaliser(nom);
    if (this.index[n] === undefined) return null;
    const d = this.lireTout(n);
    return d ? this.fichier(n, d) : null;
  }

  creer(nom) {
    const n = this.normaliser(nom);
    if (!n.startsWith('C:/')) return null;
    this.enAttente.delete(n);
    this.index[n] = 0;
    this.requete('PUT', `${this.base}/fichier?chemin=${encodeURIComponent(n)}`, 'text', new Uint8Array(0));
    return this.fichier(n, new Uint8Array(0));
  }

  effacer(nom) {
    const n = this.normaliser(nom);
    this.enAttente.delete(n);
    delete this.index[n];
    this.requete('DELETE', `${this.base}/fichier?chemin=${encodeURIComponent(n)}`, 'text');
  }

  lister(motif) {
    const n = this.normaliser(motif);
    const dossier = n.slice(0, n.lastIndexOf('/') + 1);
    const base = n.slice(n.lastIndexOf('/') + 1);
    const re = new RegExp('^' + base.replace(/[.+^${}()|[\]]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return Object.entries(this.index)
      .filter(([k]) => k.startsWith(dossier) && !k.slice(dossier.length).includes('/') && re.test(k.slice(dossier.length)))
      .map(([k, taille]) => ({ nom: k.slice(dossier.length), taille }));
  }

  // (d : le tampon, agrandi du double au besoin ; taille : ce qu'il a du fichier)
  fichier(n, donnees) {
    const moi = this;
    let d = donnees, taille = donnees.length;
    return {
      taille: () => taille,
      lire(pos, nb, m8, dest) {
        const k = Math.max(0, Math.min(nb, taille - pos));
        if (k > 0) m8.set(d.subarray(pos, pos + k), dest);
        return k;
      },
      ecrire(pos, octets) {
        if (!n.startsWith('C:/')) return 0;
        const fin = pos + octets.length;
        if (fin > d.length) { const nd = new Uint8Array(Math.max(fin, 2 * d.length)); nd.set(d.subarray(0, taille)); d = nd; }
        d.set(octets, pos);
        taille = Math.max(taille, fin);
        moi.index[n] = taille;
        moi.enAttente.set(n, () => d.subarray(0, taille));
        moi.derniereEcriture = performance.now();
        return octets.length;
      },
    };
  }
}
