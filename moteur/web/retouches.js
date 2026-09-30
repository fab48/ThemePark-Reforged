// Les retouches des animations intercalées, côté page (moteur/jeu/animations-intercalees.js).
//
// Le travailleur retouche lui-même l'image qu'il présente (l'intermédiaire posé sur la copie de
// l'écran). Mais la page ne montre pas toujours cette image : pendant une glisse du défilement fluide,
// elle compose la sienne depuis sa mosaïque du monde (defilement-fluide.js) ; en grande vue zoomée, la
// carte graphique compose le parc depuis la sienne (zoom.js, affichage.js). Les vues seules qui y sont
// recollées sont celles que publie le jeu, sans intermédiaire. Le travailleur publie donc aussi, à
// chaque image présentée, ses retouches (memoire-partagee.js) : pour chaque attraction, le rectangle,
// la pose (l'image intermédiaire tracée) et le « après » (ce que le jeu avait à cet endroit juste
// après avoir tracé l'attraction), avec la publication du parc qu'elles retouchent. La page les pose
// à son tour, avec la même règle que le travailleur : un pixel prend la pose si l'image y a encore la
// couleur du « après » (rien n'a été dessiné par-dessus l'attraction). La façon « ×2 » y ajoute sa
// traînée, en couleurs pleines (RGBA), que la carte graphique mêle après la palette (affichage.js).

import { Z, atomiques } from './memoire-partagee.js';

export class Retouches {
  constructor(vues) {
    this.vues = vues;
    this.A = atomiques(vues.entete.buffer);   // (Atomics, ou de simples accès : memoire-partagee.js)
    this.lu = -1;               // la séquence lue (entete[Z.RETOUCHES])
    this.image = -1;            // la publication du parc que retouche `liste` (entete[3])
    this.liste = [];            // { x, y, l, h, pose, apres, trainee (RGBA ou null) }
    // Les dernières retouches lues de deux publications du parc : { image, liste, k, presentee }, k le
    // tampon de leurs octets, presentee l'image présentée qu'elles retouchent (−1 : aucune). Le
    // travailleur publie celles d'une image juste avant elle : tant que la page montre encore la
    // précédente, elle en garde les retouches (`pour`). Trois tampons : deux gardés, un pour la
    // lecture en cours, qui peut échouer sans abîmer les autres.
    this.lues = [];
    this.tampons = [new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)];
    this.tamponsTrainees = [new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)];
    this.sauvees = [];          // ce que retoucherLesCopies a remplacé, pour le rendre
  }

  // Lire les retouches publiées, si elles sont neuves et entières. Rend vrai si elles le sont.
  lire() {
    const e = this.vues.entete;
    const s = this.A.load(e, Z.RETOUCHES);
    if (s === this.lu || (s & 1)) return false;
    const n = e[Z.RETOUCHES_N], image = e[Z.RETOUCHES_IMAGE], presentee = e[Z.RETOUCHES_PRESENTEE];
    const rects = Array.from(this.vues.rectanglesRetouches.subarray(0, 4 * n));
    const avecTrainee = Array.from(this.vues.traineesPresentes.subarray(0, n));
    let total = 0, totalTrainees = 0;
    for (let k = 0; k < n; k++) {
      total += 2 * rects[4 * k + 2] * rects[4 * k + 3];
      if (avecTrainee[k]) totalTrainees += 4 * rects[4 * k + 2] * rects[4 * k + 3];
    }
    const libre = [0, 1, 2].find((k) => !this.lues.some((x) => x.k === k));
    if (this.tampons[libre].length < total) this.tampons[libre] = new Uint8Array(total);
    if (this.tamponsTrainees[libre].length < totalTrainees) this.tamponsTrainees[libre] = new Uint8Array(totalTrainees);
    const octets = this.tampons[libre], trainees = this.tamponsTrainees[libre];
    octets.set(this.vues.octetsRetouches.subarray(0, total));
    trainees.set(this.vues.octetsTrainees.subarray(0, totalTrainees));
    if (this.A.load(e, Z.RETOUCHES) !== s) return false;
    this.lu = s;
    const liste = [];
    for (let k = 0, o = 0, ot = 0; k < n; k++) {
      const [x, y, l, h] = rects.slice(4 * k, 4 * k + 4), t = l * h;
      const trainee = avecTrainee[k] ? trainees.subarray(ot, ot + 4 * t) : null;
      if (trainee) ot += 4 * t;
      liste.push({ x, y, l, h, pose: octets.subarray(o, o + t), apres: octets.subarray(o + t, o + 2 * t), trainee });
      o += 2 * t;
    }
    // (des retouches plus anciennes de la même image sont dépassées)
    this.lues = [...this.lues.filter((x) => x.image !== image), { image, liste, k: libre, presentee }].slice(-2);
    return true;
  }

  // Les retouches lues de l'image présentée n (entete[0]), pour y mêler la traînée ; null sinon.
  dePresentee(n) {
    const x = this.lues.find((y) => y.presentee === n);
    return x ? x.liste : null;
  }

  // Les dernières retouches lues d'une image présentée, quelle qu'elle soit ; null sinon.
  derniere() {
    const x = [...this.lues].reverse().find((y) => y.presentee >= 0);
    return x ? x.liste : null;
  }

  // Prendre les retouches de la publication `image` du parc (celle que la page montre), si elles
  // sont lues : elles deviennent `liste`. Rend faux sinon.
  pour(image) {
    const x = this.lues.find((y) => y.image === image);
    if (!x) return false;
    this.image = image;
    this.liste = x.liste;
    return true;
  }

  // Poser les retouches dans une image de largeur l, décalées de (dx, dy), sur ses `lignes` premières
  // lignes. Rend le nombre de pixels changés.
  poser(cible, l, lignes, dx, dy) {
    let changes = 0;
    for (const r of this.liste) {
      for (let y = 0; y < r.h; y++) {
        const Y = r.y + y + dy;
        if (Y < 0 || Y >= lignes) continue;
        for (let x = 0; x < r.l; x++) {
          const X = r.x + x + dx;
          if (X < 0 || X >= l) continue;
          const o = Y * l + X, q = y * r.l + x;
          if (cible[o] !== r.apres[q] || cible[o] === r.pose[q]) continue;
          cible[o] = r.pose[q];
          changes++;
        }
      }
    }
    return changes;
  }

  // Les copies de l'image publiée et de sa vue seule (l × hv) que la page envoie à la carte graphique
  // (zoom) : les retouches précédentes défaites, les nouvelles posées. Rend { rects, changes } : les
  // rectangles touchés ([x0, y0, x1, y1], à renvoyer à la carte graphique) et les pixels changés.
  retoucherLesCopies(image, vue, l, hv) {
    const rects = [];
    for (const s of this.sauvees) {
      if (s.L !== l) continue;       // (l'image a changé de taille depuis : rien à y rendre)
      for (let y = 0; y < s.h; y++) {
        image.set(s.image.subarray(y * s.l, (y + 1) * s.l), (s.y + y) * l + s.x);
        if (s.y + y < hv) vue.set(s.vue.subarray(y * s.l, (y + 1) * s.l), (s.y + y) * l + s.x);
      }
      rects.push([s.x, s.y, s.x + s.l, s.y + s.h]);
    }
    this.sauvees = [];
    for (const r of this.liste) {
      const x0 = Math.max(0, r.x), x1 = Math.min(l, r.x + r.l), y0 = Math.max(0, r.y), y1 = r.y + r.h;
      if (x1 <= x0) continue;
      const s = { x: x0, y: y0, l: x1 - x0, h: y1 - y0, L: l };
      s.image = new Uint8Array(s.l * s.h); s.vue = new Uint8Array(s.l * s.h);
      for (let y = 0; y < s.h; y++) {
        s.image.set(image.subarray((y0 + y) * l + x0, (y0 + y) * l + x1), y * s.l);
        if (y0 + y < hv) s.vue.set(vue.subarray((y0 + y) * l + x0, (y0 + y) * l + x1), y * s.l);
      }
      this.sauvees.push(s);
      rects.push([x0, y0, x1, y1]);
    }
    const changes = this.poser(image, l, Infinity, 0, 0) + this.poser(vue, l, hv, 0, 0);
    return { rects, changes };
  }

  // Les copies viennent d'être refaites (une image publiée neuve) : rien à défaire.
  oublierLesCopies() { this.sauvees = []; }
}
