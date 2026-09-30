// Systeme de fichiers vu par le jeu, sous Node.
//
// Le jeu recoit en ligne de commande le chemin du CD (-cD:/game/) et celui de l'installation
// (-dC:/THEME.CD/). On fait correspondre ces lecteurs a des dossiers locaux : le CD, en lecture
// seule, et un dossier d'installation inscriptible pour les sauvegardes et les reglages. Des fichiers
// virtuels (`virtuels` : chemin vu par le jeu -> octets), faits par l'hote, passent avant les dossiers :
// les bibliotheques de pilotes de HMI refaites de leurs en-tetes (moteur/hote/pilotes-hmi.js).

import fs from 'fs';
import path from 'path';

export class FichiersNode {
  // lecteurs : { 'D:/GAME/': 'dossier du CD', 'C:/THEME.CD/': 'dossier inscriptible' }
  constructor(lecteurs, courant = 'C:/THEME.CD/', journal = () => {}, virtuels = new Map()) {
    this.lecteurs = Object.entries(lecteurs).map(([k, v]) => [k.toUpperCase(), v]);
    this.courant = courant.toUpperCase();
    this.journal = journal;
    this.ouverts = [];
    this.virtuels = new Map([...virtuels].map(([k, v]) => [this.normaliser(k), v]));
  }

  normaliser(nom) {
    let n = nom.replace(/\\/g, '/').toUpperCase();
    if (!/^[A-Z]:/.test(n)) n = this.courant + n;
    // resoudre . et ..
    const parts = [];
    for (const p of n.split('/')) {
      if (p === '.' || p === '') continue;
      if (p === '..') parts.pop(); else parts.push(p);
    }
    return parts.join('/');
  }

  // Un prefixe peut designer plusieurs dossiers : le premier est celui ou l'on ecrit, les
  // suivants servent de repli en lecture (l'installation d'origine recopiait des fichiers du CD).
  hote(nom) {
    const n = this.normaliser(nom);
    for (const [prefixe, dossiers] of this.lecteurs) {
      const p = prefixe.replace(/\/$/, '');
      if (n === p || n.startsWith(p + '/')) {
        const reste = n.slice(p.length + 1).split('/').filter(Boolean);
        const liste = Array.isArray(dossiers) ? dossiers : [dossiers];
        const inscriptible = prefixe.startsWith('C:');
        for (const d of liste) {
          const chemin = path.join(d, ...reste);
          if (fs.existsSync(chemin)) return { chemin, inscriptible: inscriptible && d === liste[0] };
        }
        return { chemin: path.join(liste[0], ...reste), inscriptible };
      }
    }
    return null;
  }

  existe(nom) {
    if (this.virtuels.has(this.normaliser(nom))) return true;
    const h = this.hote(nom);
    return !!h && fs.existsSync(h.chemin) && fs.statSync(h.chemin).isFile();
  }

  ouvrir(nom, mode) {
    const v = this.virtuels.get(this.normaliser(nom));
    if (v) return this.fichier({ chemin: null, inscriptible: false }, Buffer.from(v));
    const h = this.hote(nom);
    if (!h || !fs.existsSync(h.chemin) || !fs.statSync(h.chemin).isFile()) return null;
    return this.fichier(h, fs.readFileSync(h.chemin));
  }

  creer(nom) {
    const h = this.hote(nom);
    if (!h || !h.inscriptible) return null;
    fs.mkdirSync(path.dirname(h.chemin), { recursive: true });
    fs.writeFileSync(h.chemin, Buffer.alloc(0));
    return this.fichier(h, Buffer.alloc(0));
  }

  effacer(nom) {
    const h = this.hote(nom);
    if (h && h.inscriptible && fs.existsSync(h.chemin)) fs.unlinkSync(h.chemin);
  }

  lister(motif) {
    const h = this.hote(motif);
    if (!h) return [];
    const dossier = path.dirname(h.chemin);
    if (!fs.existsSync(dossier)) return [];
    const base = path.basename(h.chemin).toUpperCase();
    const re = new RegExp('^' + base.replace(/[.+^${}()|[\]]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return fs.readdirSync(dossier)
      .filter((f) => re.test(f.toUpperCase()) && fs.statSync(path.join(dossier, f)).isFile())
      .map((f) => ({ nom: f, taille: fs.statSync(path.join(dossier, f)).size }));
  }

  fichier(h, donnees) {
    const moi = this;
    let d = donnees;
    return {
      taille: () => d.length,
      lire(pos, n, m8, dest) {
        const k = Math.max(0, Math.min(n, d.length - pos));
        if (k > 0) m8.set(d.subarray(pos, pos + k), dest);
        return k;
      },
      ecrire(pos, octets) {
        if (!h.inscriptible) return 0;
        if (pos + octets.length > d.length) { const nd = Buffer.alloc(pos + octets.length); d.copy(nd); d = nd; }
        Buffer.from(octets).copy(d, pos);
        fs.writeFileSync(h.chemin, d);
        return octets.length;
      },
    };
  }
}
