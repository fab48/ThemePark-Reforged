// Le zoom de la grande vue, côté page : le parc à l'échelle voulue, l'interface à taille fixe.
//
// La grande vue (moteur/jeu/grande-vue.js) a la taille que la page demande : dézoomer, c'est une
// image plus grande, qui montre plus de cases. Montrée telle quelle dans le cadre, elle rapetissait
// tout, l'interface comme le parc. Ici, sans DOM, la page recompose l'image : le parc à l'échelle du
// zoom (p pixels de l'écran par pixel du jeu), l'interface à celle de la grande vue de base (u : 720
// lignes ajustées à la fenêtre), chaque morceau accroché à son bord du cadre.
//
// LE NIVEAU (retour 53 de docs/demandes.md). L'échelle du parc est continue : p = u · 2^niveau, le
// niveau en octaves depuis l'échelle de l'interface (0 : un pixel du parc pour un pixel de
// l'interface ; 1 : deux fois plus près ; −1 : deux fois plus loin). La molette ne déplace qu'un
// niveau VISÉ (`Molette`, plus bas : un cran, un quart d'octave, davantage quand elle tourne vite) ;
// le niveau montré le rejoint à chaque image (`avancer`), d'une approche exponentielle : chaque cran
// part vite et finit en douceur, et des crans rapprochés se fondent en un seul mouvement. Le point du
// parc sous l'ANCRE (le pointeur, ou le milieu du parc quand le pointeur est sur l'interface) y
// reste, à chaque image.
//
// LA TAILLE DU JEU suit le niveau de loin (principal.js, `suivreLeNiveau`) : la plus petite image qui
// couvre le parc montré, avec une case de marge de chaque côté (`tailleDuNiveau`) ; plus grande dès
// qu'un zoom arrière vise plus loin qu'elle, plus petite une fois le zoom posé. Le parc montré n'est
// donc qu'une PORTION de la vue du jeu, agrandie m = p · W / Wf fois (m ≥ 1), de coin s dans l'image
// du jeu. Chaque taille est demandée avec la place de la nouvelle vue autour de la portion visée, la
// marge partagée comme l'ancre partage le cadre (`decalagePour`) ; à l'arrivée de l'image, la portion
// garde son coin dans le monde (`recevoir`) : rien ne bouge à l'écran. Tant qu'une image plus grande
// est attendue (`attente`), le niveau montré ne va pas plus loin que ce que couvre l'image courante,
// l'ancre tenue (`echelleLimite`) : il ralentit en s'en approchant, et repart quand elle arrive.
//
// CE QUE PUBLIE LE JEU, à chaque image du parc (vue-fluide.js, travailleur.js) : l'image complète,
// la vue du parc seule (avant l'interface) et sa place dans le monde, les régions de l'interface
// (grande-vue.js, regionsDeLInterface : des rectangles, chacun avec son accroche) et le curseur (son
// image, sa position, et les pixels qu'il recouvre dans l'image). Le jeu n'en est pas changé.
//
// LES ÉTIQUETTES. Chaque pixel du jeu appartient au parc (0) ou à la région k (k + 1) : dans le
// rectangle de la région, un pixel qui diffère de la vue seule (ou sous le haut du panneau, tout
// d'interface ; un trou d'un pixel entre deux pixels d'interface en est aussi), s'il n'est pas déjà
// pris par une région de devant. Le curseur est d'abord rendu à l'image (ses pixels recouverts) :
// la page le dessine elle-même, à taille fixe, là où le jeu a le sien (positionDuCurseur).
//
// LES TRANSFORMATIONS, en pixels CSS du cadre (Wf x Hf) :
//   le parc      f = (q − s) · p,                   p = u · 2^niveau (au moins ce que couvre l'image)
//   une région   f = o + q · u,                     u = Hf / hauteur de la grande vue de base
// avec o selon l'accroche : HAUT_GAUCHE (0, 0) ; HAUT_DROIT (Wf − W·u, 0) ; BAS, le milieu de la
// barre d'outils au milieu du bas du cadre ; CENTRE, le centre de l'image au centre du cadre ;
// FENETRE (un catalogue), comme BAS, puis ramenée dans le cadre si elle en sort. Une région
// « étendue » (le panneau, la barre de menus) est prolongée par sa colonne du bord quand elle est
// moins large que le cadre (zoom avant). La hauteur du jeu est choisie par la page pour que le parc
// aille jusqu'au haut du panneau (`hauteurDuJeu`).
//
// LA SOURIS. Un point du cadre va à la première région dont le pixel, par la transformation
// inverse, porte son étiquette ; sinon au parc. Les bords du cadre sont les bords du jeu (le
// défilement au bord de l'écran). Et à l'inverse, un point du jeu (le curseur que le jeu déplace)
// revient au cadre par la transformation de son étiquette.
//
// LA PORTION. s est tenu dans le repère de l'image : quand la caméra du jeu défile, la portion la
// suit. Elle est bornée à la vue du parc (`borner`), remise au centre quand la caméra saute (une
// fiche, la carte), amenée sur l'objet que le jeu vient de cadrer (`centrerSur`), et poussée par la page quand le pointeur tient un bord et que la caméra, butée au
// bord de la carte, ne suit plus (`pousser`). Au bord du cadre, le jeu reçoit toujours le bord de SON
// écran (le défilement).

import { GENRES, LARGEUR_MAX, HAUTEUR_MIN, HAUTEUR_MAX, tailleDeLaGrandeVue } from '../jeu/grande-vue.js';

const { HAUT_GAUCHE, HAUT_DROIT, BAS, CENTRE, FENETRE } = GENRES;

// La réponse du zoom : la molette (`Molette`), le niveau montré (`avancer`), le niveau visé (`viser`).
export const REPONSE = {
  pasDuCran: 0.25,       // octave par cran d'une molette tournée lentement (× 1,19)
  vitesseDouce: 6,       // crans par seconde : jusque-là, pas d'accélération
  acceleration: 0.6,     // au-delà, le pas croît comme (vitesse / vitesseDouce) ^ acceleration...
  gainMax: 2.5,          // ...jusqu'à 2,5 fois (0,62 octave, × 1,54 par cran)
  memoire: 120,          // ms : la vitesse de la molette oublie les crans passés en ce temps
  pincementMax: 0.5,     // octave au plus par événement de pincement (Ctrl + molette)
  tau: 90,               // ms : la constante de temps du niveau montré (95 % du chemin en 270 ms)
  aimant: 0.06,          // octave : un niveau visé qui revient si près de 0 y est posé
};

// La marge de l'image du jeu autour du parc montré, en largeur (pixels du jeu) : la caméra du jeu va
// par cases (24 pixels de large, 16 de haut) ; la nouvelle vue, centrée à une demi-case près, couvre
// encore la portion. Plus de deux cases de chaque côté : un cran de zoom arrière part aussitôt, dans
// cette marge (10 % de large au niveau 0, 8 % après l'arrondi de la caméra), le temps que le jeu
// dessine une image plus grande (deux à quatre images de la page). En hauteur, la marge suit le
// format du cadre (67 lignes en 16/9).
export const MARGE = 128;

// LA MOLETTE. Un événement devient un pas du niveau visé, en octaves (négatif : on s'éloigne). Un
// cran ordinaire vaut 100 pixels (Chrome, Edge) ou 3 lignes (Firefox) ; un pavé tactile en envoie des
// fractions, en rafales. La réponse n'est pas linéaire : à pas de molette égaux, l'échelle est
// multipliée d'autant (le niveau est un logarithme) ; et la vitesse de la molette (en crans par
// seconde, mémoire de 120 ms, remise à zéro quand le sens change) agrandit le pas : jusqu'à 6 crans
// par seconde, un cran vaut un quart d'octave ; une molette lancée va jusqu'à 2,5 fois plus loin par
// cran. Le pincement d'un pavé tactile (Chrome : Ctrl + molette, une échelle de e^(−deltaY / 100))
// est pris à son échelle, sans accélération.
export class Molette {
  constructor(reponse = REPONSE) {
    this.r = reponse;
    this.vitesse = 0;
    this.t = -Infinity;
    this.sens = 0;
  }

  pas({ deltaY, deltaMode, ctrlKey }, t) {
    if (!deltaY) return 0;
    const r = this.r;
    const crans = deltaMode === 1 ? deltaY / 3 : deltaMode === 2 ? deltaY * 10 : deltaY / 100;
    if (ctrlKey) return Math.max(-r.pincementMax, Math.min(r.pincementMax, -crans * Math.LOG2E));
    const sens = Math.sign(crans);
    const dt = Math.max(0, t - this.t);
    this.t = t;
    this.vitesse = sens === this.sens ? this.vitesse * Math.exp(-dt / r.memoire) : 0;
    this.sens = sens;
    const gain = Math.min(r.gainMax, Math.max(1, (this.vitesse / r.vitesseDouce) ** r.acceleration));
    this.vitesse += Math.abs(crans) * 1000 / r.memoire;
    return -crans * r.pasDuCran * gain;
  }
}

// Les largeurs permises au jeu pour un cadre de format `rapport` : de la grande vue de 480 lignes (la
// plus proche que le jeu sache dessiner : son interface est dans la même image) à celle de 1600
// lignes, 2560 de large au plus (la cadence : docs/architecture.md, « Jusqu'où dézoomer »).
export function largeursPermises(rapport) {
  return { min: tailleDeLaGrandeVue(HAUTEUR_MIN * rapport, HAUTEUR_MIN).largeur,
    max: Math.min(LARGEUR_MAX, tailleDeLaGrandeVue(HAUTEUR_MAX * rapport, HAUTEUR_MAX).largeur) };
}

// Les bornes du niveau dans un cadre de Wf x Hf, la grande vue de base ayant `base` lignes : du plus
// loin (la plus grande image, montrée entière) au plus près (la plus petite, agrandie 4 fois ; sans
// image composée, montrée entière).
export function bornesDuNiveau(Wf, Hf, base, compose = true) {
  const largeurDeBase = Wf * base / Hf;         // la largeur du jeu montrée au niveau 0
  const { min, max } = largeursPermises(Wf / Hf);
  return { min: Math.log2(largeurDeBase / max), max: Math.log2(largeurDeBase / min) + (compose ? 2 : 0) };
}

// La taille de l'image du jeu pour le niveau n, dans un cadre de Wf x Hf (base : les lignes de la
// grande vue de base ; bas : celles du panneau du jeu) : la plus petite qui couvre le parc montré, plus
// MARGE pixels en largeur, multiple de 32, et la hauteur qui fait aller le parc jusqu'au panneau. Sans
// image composée (compose faux), l'image est montrée entière : sa largeur est celle du niveau.
export function tailleDuNiveau(n, Wf, Hf, base, bas, compose = true) {
  const u = Hf / base;
  const { min, max } = largeursPermises(Wf / Hf);
  const juste = Wf / (u * 2 ** n);
  const W = Math.max(min, Math.min(max, compose ? Math.ceil((juste + MARGE) / 32) * 32 : Math.round(juste / 32) * 32));
  return { largeur: W, hauteur: hauteurDuJeu(W, Wf, Hf, u, bas, HAUTEUR_MIN, HAUTEUR_MAX) };
}

export class Zoom {
  constructor(reponse = REPONSE) {
    this.r = reponse;
    this.W = 0; this.H = 0; this.hv = 0; this.barreX = 0;
    this.x = 0; this.y = 0;                // la place de la vue de l'image dans le monde (vue-fluide.js)
    this.regions = [];                     // { genre, x0, y0, x1, y1, etendre, ox, oy }
    this.etiquettes = new Uint8Array(0);
    this.effacer = [];                     // les rectangles étiquetés à l'image précédente
    this.curseur = { visible: false, x: 0, y: 0, l: 0, h: 0, sprite: new Uint8Array(64 * 64) };
    this.Wf = 1; this.Hf = 1; this.u = 1; this.p = 1;
    this.m = 1;                            // l'agrandissement de la vue du jeu, p · W / Wf (au moins 1)
    this.s = [0, 0];                       // le coin de la portion du parc montrée, dans l'image du jeu
    this.glisse = [0, 0];                  // la glisse du défilement fluide montrée à la dernière image
    this.aCentrer = true;                  // la portion est à remettre au centre de la vue
    this.niveau = 0;                       // le niveau montré, en octaves : p = u · 2^niveau
    this.niveauVise = 0;                   // celui que la molette vise
    this.niveauMin = -1; this.niveauMax = 2.5;
    this.attente = false;                  // une image plus grande est attendue (principal.js)
  }

  // Une image publiée. image : W x H (le curseur y est rendu à ce qu'il recouvre, ici même) ;
  // vue : W x hv, en (x, y) du monde ; regions : Int32Array de n x 6 ; curseur : voir travailleur.js.
  recevoir({ W, H, hv, barreX, x, y, image, vue, regions, n, curseur }) {
    if (W !== this.W || H !== this.H) {
      // Une autre taille (le zoom, la fenêtre) : sa vue est à une autre place du monde ; la portion y
      // garde son coin (la glisse finie : le défilement fluide repart de la vue de l'image).
      if (this.W && !this.aCentrer) {
        this.s = [this.x + this.glisse[0] + this.s[0] - x, this.y + this.glisse[1] + this.s[1] - y];
      } else this.aCentrer = true;
      this.W = W; this.H = H;
      this.etiquettes = new Uint8Array(W * H);
      this.effacer = [[0, 0, W, H]];
      this.glisse = [0, 0];
    }
    this.x = x; this.y = y;
    this.hv = hv; this.barreX = barreX;
    const c = this.curseur;
    c.visible = curseur.visible; c.x = curseur.x; c.y = curseur.y; c.l = curseur.l; c.h = curseur.h;
    c.sprite.set(curseur.sprite.subarray(0, c.l * c.h));
    if (curseur.pose) {
      const [x0, y0, l, h] = curseur.rect;
      for (let yy = 0; yy < h; yy++) {
        if (y0 + yy < 0 || y0 + yy >= H) continue;
        for (let xx = 0; xx < l; xx++) {
          if (x0 + xx < 0 || x0 + xx >= W) continue;
          image[(y0 + yy) * W + x0 + xx] = curseur.dessous[yy * l + xx];
        }
      }
    }
    this.regions = [];
    for (let k = 0; k < n; k++) {
      const b = k * 6;
      this.regions.push({ genre: regions[b], x0: regions[b + 1], y0: regions[b + 2], x1: regions[b + 3],
        y1: regions[b + 4], etendre: regions[b + 5], ox: 0, oy: 0 });
    }
    this.etiqueter(image, vue);
    this.placer();
  }

  etiqueter(image, vue) {
    const W = this.W, hv = this.hv, e = this.etiquettes;
    for (const [x0, y0, x1, y1] of this.effacer) for (let y = y0; y < y1; y++) e.fill(0, y * W + x0, y * W + x1);
    // les rectangles où les étiquettes ont changé, à envoyer à la carte graphique (affichage.js)
    this.aEnvoyer = this.effacer;
    this.effacer = [];
    this.regions.forEach((r, k) => {
      const n = k + 1;
      for (let y = r.y0; y < r.y1; y++) {
        const o = y * W;
        if (y >= hv) {
          for (let i = o + r.x0; i < o + r.x1; i++) if (e[i] === 0) e[i] = n;
          continue;
        }
        for (let i = o + r.x0; i < o + r.x1; i++) if (e[i] === 0 && image[i] !== vue[i]) e[i] = n;
      }
      // les trous d'un pixel, entre deux pixels de la région (à gauche et à droite, ou dessus et dessous)
      for (let y = Math.max(1, r.y0); y < Math.min(hv, r.y1 - 1); y++) {
        const o = y * W;
        for (let i = o + Math.max(1, r.x0); i < o + Math.min(W - 1, r.x1 - 1); i++) {
          if (e[i] !== 0) continue;
          if ((e[i - 1] === n && e[i + 1] === n) || (e[i - W] === n && e[i + W] === n)) e[i] = n;
        }
      }
      this.effacer.push([r.x0, r.y0, r.x1, r.y1]);
    });
    this.aEnvoyer = this.aEnvoyer.concat(this.effacer);
  }

  // Le cadre (Wf x Hf, pixels CSS) et la hauteur de la grande vue de base : les échelles et les accroches.
  cadrer(Wf, Hf, hauteurDeBase) {
    this.Wf = Wf; this.Hf = Hf;
    this.u = Hf / hauteurDeBase;
    this.placer();
  }

  // La hauteur du cadre au-dessus du panneau (montré, lui, à l'échelle u) : celle du parc.
  hauteurDuParc() { return this.Hf - (this.H - this.hv) * this.u; }

  placer() {
    const { W, H, hv, Wf, Hf, u } = this;
    if (!W) return;
    // l'échelle du niveau, jamais plus loin que ce que couvre l'image du jeu (une fenêtre qu'on vient
    // d'agrandir, un zoom arrière arrêté, en attendant une image plus grande)
    this.p = Math.max(u * 2 ** this.niveau, Wf / W, hv > 0 ? this.hauteurDuParc() / hv : 0);
    this.m = this.p * W / Wf;
    this.borner();
    const xc = this.barreX + 320;
    for (const r of this.regions) {
      if (r.genre === HAUT_GAUCHE) { r.ox = 0; r.oy = 0; }
      else if (r.genre === HAUT_DROIT) { r.ox = Wf - W * u; r.oy = 0; }
      else if (r.genre === CENTRE) { r.ox = Wf / 2 - (W / 2) * u; r.oy = Hf / 2 - (H / 2) * u; }
      else {
        r.ox = Wf / 2 - xc * u; r.oy = Hf - H * u;
        if (r.genre === FENETRE) {
          // ramenée dans le cadre : d'abord le bord droit et le bas, puis le gauche et le haut
          const fx1 = r.ox + r.x1 * u, fy1 = r.oy + r.y1 * u;
          if (fx1 > Wf) r.ox -= fx1 - Wf;
          if (fy1 > Hf) r.oy -= fy1 - Hf;
          if (r.ox + r.x0 * u < 0) r.ox = -r.x0 * u;
          if (r.oy + r.y0 * u < 0) r.oy = -r.y0 * u;
        }
      }
    }
  }

  // Les bornes de la portion montrée : la vue du parc (W x hv), moins ce qu'en montre le cadre au-dessus
  // du panneau.
  bornes() {
    const { W, hv, Wf, p } = this;
    return [Math.max(0, W - Wf / p), Math.max(0, hv - this.hauteurDuParc() / p)];
  }

  borner() {
    const [lx, ly] = this.bornes();
    if (this.aCentrer) { this.s = [lx / 2, ly / 2]; this.aCentrer = false; }
    this.s = [Math.max(0, Math.min(lx, this.s[0])), Math.max(0, Math.min(ly, this.s[1]))];
  }

  // Le niveau visé déplacé de d octaves (la molette), borné ; posé sur 0 (l'échelle de l'interface)
  // quand il y revient à moins de `aimant` : on retrouve le zoom d'origine sans le chercher.
  viser(d) {
    let n = this.niveauVise + d;
    if (Math.abs(n) < this.r.aimant && Math.abs(n) < Math.abs(this.niveauVise)) n = 0;
    this.niveauVise = Math.max(this.niveauMin, Math.min(this.niveauMax, n));
  }

  // Le niveau montré rejoint le niveau visé, dt millisecondes après l'image précédente ; le point du
  // parc sous l'ancre [ax, ay] (pixels du cadre) y reste. Rend vrai s'il a bougé.
  avancer(dt, [ax, ay]) {
    if (!this.W || this.niveau === this.niveauVise) return false;
    const q = [ax / this.p + this.s[0], ay / this.p + this.s[1]];      // le point de l'image sous l'ancre
    let n = this.niveau + (this.niveauVise - this.niveau) * (1 - Math.exp(-Math.min(dt, 100) / this.r.tau));
    if (Math.abs(this.niveauVise - n) < 1e-3) n = this.niveauVise;
    // Une image plus grande attendue : le niveau montré va à pleine allure jusqu'à ce que couvre encore
    // celle-ci, l'ancre tenue ; s'il allait la passer, il fait la moitié du chemin qui lui reste (un
    // freinage de quelques images, sans heurt), et repart vers le niveau visé dès qu'elle arrive.
    if (this.attente && n < this.niveau) {
      const limite = this.echelleLimite(q, [ax, ay]);
      const nl = limite > 0 ? Math.min(this.niveau, Math.log2(limite / this.u)) : -Infinity;
      if (n < nl) n = nl + (this.niveau - nl) / 2;
      if (this.niveau - n < 1e-4) n = this.niveau;
    }
    if (n === this.niveau) return false;
    this.niveau = n;
    this.placer();
    this.s = [q[0] - ax / this.p, q[1] - ay / this.p];
    this.borner();
    return true;
  }

  // La plus petite échelle où la portion qui garde le point q de l'image sous l'ancre [ax, ay] tient
  // encore dans la vue du parc (0 : l'ancre n'en borne rien).
  echelleLimite(q, [ax, ay]) {
    const Hp = this.hauteurDuParc();
    let i = Infinity;                      // 1 / p au plus
    if (ax > 0) i = Math.min(i, q[0] / ax);
    if (ax < this.Wf) i = Math.min(i, (this.W - q[0]) / (this.Wf - ax));
    if (ay > 0) i = Math.min(i, q[1] / ay);
    if (ay < Hp) i = Math.min(i, (this.hv - q[1]) / (Hp - ay));
    if (i === Infinity) return 0;
    return i > 0 ? 1 / i : this.p;
  }

  // Pour une image de W1 x H1 (bas : les lignes de son panneau), la place de sa vue par rapport à celle
  // de l'image courante, en pixels du monde (le jeu la pose à la case près : grande-vue.js,
  // preparerLAncrage), pour la portion du niveau n où le point du parc sous l'ancre [ax, ay] reste
  // sous l'ancre. La marge est partagée comme l'ancre partage le cadre : un zoom arrière autour de la
  // même ancre élargit la portion d'autant de chaque côté, et toute la marge sert (au milieu du cadre,
  // la portion est centrée). Au moins une demi-case et un pixel de chaque côté, pour l'arrondi.
  decalagePour(n, [ax, ay], W1, H1, bas) {
    const p1 = this.u * 2 ** n, Hp = this.hauteurDuParc();
    const gauche = this.glisse[0] + this.s[0] + ax / this.p - ax / p1;
    const haut = this.glisse[1] + this.s[1] + ay / this.p - ay / p1;
    const part = (marge, f, cote, min) => (marge < 2 * min ? marge / 2
      : Math.max(min, Math.min(marge - min, marge * Math.max(0, Math.min(1, f / cote)))));
    const mx = W1 - this.Wf / p1, my = H1 - bas - Hp / p1;
    return [Math.round(gauche - part(mx, ax, this.Wf, 13)), Math.round(haut - part(my, ay, Hp, 9))];
  }

  // Où sera, dans une image de W1 x H1, le pixel (x, y) de la région k de l'image courante : là où le
  // jeu pose son interface (grande-vue.js : les icônes au bord droit, la barre d'outils au milieu du
  // bas, la boîte à question au centre), à la même place du cadre.
  pointDeLInterfaceApres(k, x, y, W1, H1) {
    const r = this.regions[k], barre = (W) => ((W - 640) >> 1) & ~1;
    if (!r) return [x, y];
    if (r.genre === HAUT_DROIT) return [x + W1 - this.W, y];
    if (r.genre === CENTRE) return [x + ((W1 - 640) >> 1) - ((this.W - 640) >> 1), y + ((H1 - 480) >> 1) - ((this.H - 480) >> 1)];
    if (r.genre === BAS || r.genre === FENETRE) return [x + barre(W1) - barre(this.W), y + H1 - this.H];
    return [x, y];
  }

  // Un catalogue est-il ouvert (accroché au bas du cadre par la barre d'outils : il bouge quand
  // l'image du jeu change de largeur) ?
  get fenetreOuverte() { return this.regions.some((r) => r.genre === FENETRE); }

  // La portion amenée sur le point (x, y) de l'image : au milieu du cadre au-dessus du panneau, autant
  // que la vue du jeu le permet (bornée). Le jeu vient d'amener sa vue sur un objet (un employé dont on
  // demande la vue : retour 76 de docs/demandes.md) ; il le met au milieu de SON écran, dont la page ne
  // montre qu'une portion, gardée à sa place dans l'image quand la caméra saute peu (principal.js).
  centrerSur(x, y) {
    this.cadre = [x, y];                   // (gardé pour les essais : lu depuis la console)
    this.aCentrer = false;
    this.s = [x - this.Wf / (2 * this.p), y - this.hauteurDuParc() / (2 * this.p)];
    this.borner();
  }

  // La portion poussée de (dx, dy) pixels du cadre ; vrai si elle a bougé.
  pousser(dx, dy) {
    const avant = `${this.s}`;
    this.s = [this.s[0] + dx / this.p, this.s[1] + dy / this.p];
    this.borner();
    return `${this.s}` !== avant;
  }

  // Le pixel du jeu d'une région sous le point f du cadre, ou null.
  pixelDeLaRegion(r, k, fx, fy) {
    let x = Math.floor((fx - r.ox) / this.u), y = Math.floor((fy - r.oy) / this.u);
    if (r.etendre) x = Math.max(r.x0, Math.min(r.x1 - 1, x));
    if (x < r.x0 || x >= r.x1 || y < r.y0 || y >= r.y1) return null;
    return this.etiquettes[y * this.W + x] === k + 1 ? [x, y] : null;
  }

  // Le point du jeu sous le point (fx, fy) du cadre : [x, y, région (−1 : le parc)]. `tenue` : un
  // bouton est tenu (un tracé, une fenêtre qu'on tire) ; le point suit la transformation de ce qui
  // était sous le pointeur à l'appui (`saisir`), même hors de lui, sans quoi une fenêtre tirée qui
  // prend du retard sur le pointeur le verrait passer au parc, à une autre échelle, et s'envolerait.
  versLeJeu(fx, fy, tenue = null) {
    const { W, H, Wf, Hf } = this;
    fx = Math.max(0, Math.min(Wf - 1e-3, fx));
    fy = Math.max(0, Math.min(Hf - 1e-3, fy));
    let q = null, k = -1;
    if (tenue && tenue.region) {
      q = [Math.floor((fx - tenue.ox) / this.u), Math.floor((fy - tenue.oy) / this.u)];
      k = tenue.k;
    }
    for (let i = 0; i < this.regions.length && !q && !tenue; i++) {
      q = this.pixelDeLaRegion(this.regions[i], i, fx, fy);
      if (q) k = i;
    }
    if (!q) q = [Math.floor(fx / this.p + this.s[0]), Math.floor(fy / this.p + this.s[1])];
    let [x, y] = q;
    // les bords du cadre sont ceux du jeu
    if (fx < 1) x = 0;
    if (fx > Wf - 1) x = W - 1;
    if (fy < 1) y = 0;
    if (fy > Hf - 1) y = H - 1;
    return [Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)), k];
  }

  // À l'appui d'un bouton : ce qui est sous le pointeur, et sa transformation (voir versLeJeu).
  saisir(fx, fy) {
    const [, , k] = this.versLeJeu(fx, fy);
    const r = this.regions[k];
    return r ? { region: true, k, ox: r.ox, oy: r.oy } : { region: false };
  }

  // Le point du cadre d'un point du jeu (le milieu de son pixel ; `coin` : son coin haut gauche).
  versLeCadre(x, y, coin = false) {
    const { W, H } = this;
    const d = coin ? 0 : 0.5;
    if (x >= 0 && y >= 0 && x < W && y < H) {
      const n = this.etiquettes[y * W + x];
      const r = this.regions[n - 1];
      if (r) return [r.ox + (x + d) * this.u, r.oy + (y + d) * this.u];
    }
    return [(x + d - this.s[0]) * this.p, (y + d - this.s[1]) * this.p];
  }

  // Où dessiner le curseur dans le cadre : là où est celui du jeu dans l'image publiée (son coin haut
  // gauche est le point visé), par la transformation du pixel visé. C'est là que tombera un clic : le
  // pilote de souris de l'hôte ne rejoint le pointeur de la page que peu à peu (machine.js).
  // Agrandi, un curseur du jeu hors de la portion montrée (au bord de son écran : le défilement) est
  // montré au bord du cadre.
  positionDuCurseur() {
    const [x, y] = this.versLeCadre(this.curseur.x, this.curseur.y, true);
    return [Math.max(0, Math.min(this.Wf - 1, x)), Math.max(0, Math.min(this.Hf - 1, y))];
  }
}

// La hauteur de l'image du jeu pour une largeur W : le parc, à l'échelle p = Wf / W, va jusqu'au haut
// du panneau (bande du bas de `bas` pixels du jeu, montrée à l'échelle u). Multiple de 16, arrondie
// au-dessus (quelques lignes du parc passent sous le panneau).
export function hauteurDuJeu(W, Wf, Hf, u, bas, hauteurMin, hauteurMax) {
  const p = Wf / W;
  const h = Math.ceil(((Hf - bas * u) / p + bas) / 16) * 16;
  return Math.max(hauteurMin, Math.min(hauteurMax, h));
}
