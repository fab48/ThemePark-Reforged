// Le glisser au bouton du milieu, côté page (principal.js) : la vue suit la main au pixel près.
//
// La caméra du jeu va par cases entières (24 x 16 pixels en 640x480), bornée à la carte : de 0 à 63
// en colonnes et en rangées, pour le coin haut gauche de la vue (carte.js). Ce module, sans DOM, tient
// la vue MONTRÉE : la main la déplace au pixel dans le plan du monde, celui de vue-fluide.js (la case
// (c, r) en x = c·L + r·L/3, y = r·H, en pixels de l'image publiée), et la caméra la suit par cases,
// demandée par la page au travailleur (message 24 : travailleur.js, placerLaCamera). La vue montrée
// est prise dans ce que le jeu a dessiné : les mosaïques du défilement fluide (defilement-fluide.js)
// et du zoom (affichage.js), où chaque vue publiée est collée à sa place dans le monde.
//
// LA CAMÉRA DEVANT LA VUE. Une vue montrée entre deux cases n'est couverte que si le jeu a dessiné ce
// qui l'entoure. La caméra est donc demandée à la case qui la devance dans le sens de la main (arrondie
// vers l'avant), et la vue montrée reste entre les deux dernières places publiées de la caméra, plus le
// jeu de la portion du zoom : comme la glisse du défilement fluide, elle traîne derrière la caméra.
// Une main plus rapide que le jeu attend l'image suivante ; rien n'est perdu, la vue rattrape la main.
//
// LE ZOOM. La portion du parc montrée (zoom.js) est plus petite que l'image du jeu, de sa marge
// (MARGE) : la caméra est demandée pour que la portion soit au milieu de l'image, et la vue montrée
// bouge au pixel dans ce jeu, entre deux pas de la caméra. Là où la caméra bute (le haut et la gauche
// de la carte), la portion va encore jusqu'au bord de l'image.
//
// LES BORDS. La vue voulue est bornée à ce que la caméra peut atteindre : les rangées d'abord, puis les
// colonnes pour cette rangée (la vue est oblique : une rangée de plus décale la carte de L/3). Buter
// contre un bord n'accumule rien : la main qui revient fait aussitôt revenir la vue, et une main qui
// descend contre le haut de la carte ne fait plus partir la vue de côté.
//
// LE CURSEUR (retour 56). Il reste sur le point du parc qu'il a saisi (`saisie`, dans le monde) : la
// page le place à chaque image à saisie − la vue montrée, à l'échelle du zoom. Il suit donc la main
// tant que la vue la suit, et s'arrête avec elle contre un bord de la carte.
//
// LE RELÂCHEMENT. La vue montrée attend la dernière caméra demandée (ATTENTE_CAMERA au plus), puis
// rejoint en douceur la vue du jeu, ou la place la plus proche de la portion dans l'image du zoom :
// un clic tombe sur ce que le joueur voit.

const DERNIERE_CASE = 63;       // la caméra va de 0 à 63 (carte.js)
const SEUIL_DU_SENS = 4;        // pixels à rebours avant que l'arrondi de la caméra ne change de sens
const AVANCE_MAX = 8;           // cases : la vue voulue ne devance pas davantage ce que le jeu a dessiné
const ATTENTE_CAMERA = 300;     // ms : au relâchement, la dernière caméra demandée est attendue autant
const DUREE_FIN = 120;          // ms : la vue montrée rejoint celle du jeu

const borner = (v, min, max) => Math.max(min, Math.min(max, v));
// v arrondi vers l'avant dans le sens donné (1 : au-dessus, −1 : au-dessous, 0 : au plus près).
function arrondiVers(v, sens) {
  if (sens > 0) return Math.ceil(v - 1e-6);
  if (sens < 0) return Math.floor(v + 1e-6);
  return Math.round(v);
}

export class Glisser {
  constructor() {
    this.actif = false;         // la vue montrée est celle du glisser (tenu, relâché, puis la fin)
    this.P = [0, 0];            // la vue voulue par la main : le coin du parc montré, dans le monde
    this.sens = [0, 0];         // le sens où va P, par axe (l'arrondi de la caméra)
    this.contre = [0, 0];       // le chemin fait à rebours de ce sens
    this.repere = null;         // la dernière vue publiée : { x, y, C, R, L, H }
    this.avant = [0, 0];        // sa place précédente, par axe
    this.camera = null;         // la dernière caméra demandée, [C, R]
    this.relache = null;        // l'heure du relâchement
    this.fin = null;            // { t, de, a } : la vue montrée rejoint celle du jeu
    this.saisie = null;         // le point du parc sous le curseur au départ, dans le monde
    this.curseur = null;        // (page) où le curseur est montré, là où est ce point
  }

  // depart : le coin du parc montré, dans le monde ; repere : la vue publiée ; glisse : de combien la
  // vue montrée dépasse celle de l'image (la glisse du défilement fluide en cours), couvert aussi ;
  // curseur : sa place dans la vue montrée, en pixels du monde (le point saisi en est déduit).
  commencer(depart, repere, glisse = [0, 0], curseur = [0, 0]) {
    this.actif = true;
    this.saisie = [depart[0] + curseur[0], depart[1] + curseur[1]];
    this.P = [depart[0], depart[1]];
    this.sens = [0, 0];
    this.contre = [0, 0];
    this.repere = repere;
    this.avant = [repere.x + glisse[0], repere.y + glisse[1]];
    this.camera = null;
    this.relache = null;
    this.fin = null;
  }

  // Une vue publiée ; sa place précédente est gardée, par axe.
  recevoir(repere) {
    if (!this.actif) return;
    if (repere.x !== this.repere.x) this.avant[0] = this.repere.x;
    if (repere.y !== this.repere.y) this.avant[1] = this.repere.y;
    this.repere = repere;
  }

  // La main, de (dx, dy) pixels du monde : le parc la suit, le coin montré va à rebours.
  bouger(dx, dy) {
    if (this.relache !== null) return;
    [-dx, -dy].forEach((d, a) => {
      if (!d) return;
      this.P[a] += d;
      const s = Math.sign(d);
      if (s === this.sens[a]) this.contre[a] = 0;
      else if (this.sens[a] === 0 || (this.contre[a] += Math.abs(d)) >= SEUIL_DU_SENS) {
        this.sens[a] = s;
        this.contre[a] = 0;
      }
    });
  }

  // Un déplacement de la vue montrée venu d'ailleurs (le zoom qui garde son ancre), repris par la main.
  decaler(dx, dy) {
    this.P[0] += dx;
    this.P[1] += dy;
  }

  // La caméra à demander, [C, R], pour une portion de jeu [lx, ly] dans l'image (0 hors du zoom). La
  // vue voulue est d'abord ramenée à ce que la caméra peut atteindre, et à AVANCE_MAX cases au plus de
  // ce que le jeu a dessiné (une caméra refusée, hors de la vue du parc, ne laisse pas filer la main).
  viser([lx, ly]) {
    const { x, y, C, R, L, H } = this.repere;
    const biais = L / 3;                            // le tiers de tuile par rangée (L vaut 24 : 8)
    const K = x - C * L - R * biais;                 // la vue de la caméra (C, R) est en C·L + R·L/3 + K
    const P = this.P, [ax, ay] = this.avant;
    P[1] = borner(P[1], Math.min(ay, y) - AVANCE_MAX * H, Math.max(ay, y) + ly + AVANCE_MAX * H);
    P[1] = borner(P[1], 0, DERNIERE_CASE * H + ly);
    const Rv = borner(arrondiVers((P[1] - ly / 2) / H, this.sens[1]), 0, DERNIERE_CASE);
    const x0 = K + Rv * biais;                       // la vue de la colonne 0, à cette rangée
    P[0] = borner(P[0], Math.min(ax, x) - AVANCE_MAX * L, Math.max(ax, x) + lx + AVANCE_MAX * L);
    P[0] = borner(P[0], x0, x0 + DERNIERE_CASE * L + lx);
    const Cv = borner(arrondiVers((P[0] - lx / 2 - x0) / L, this.sens[0]), 0, DERNIERE_CASE);
    return [Cv, Rv];
  }

  // La vue montrée à l'heure t : la vue voulue, dans ce que couvrent les deux dernières vues publiées
  // et le jeu de la portion. Relâchée, une fois la caméra arrivée, elle rejoint la vue du jeu (ou sa
  // place la plus proche dans le jeu de la portion) ; `actif` tombe quand elle y est.
  affichee([lx, ly], t) {
    const { x, y, C, R } = this.repere;
    if (this.fin) {
      const k = Math.min(1, (t - this.fin.t) / DUREE_FIN), e = k * (2 - k);
      if (k >= 1) this.actif = false;
      const { de, a } = this.fin;
      return [de[0] + (a[0] - de[0]) * e, de[1] + (a[1] - de[1]) * e];
    }
    const [ax, ay] = this.avant;
    const vue = [borner(this.P[0], Math.min(ax, x), Math.max(ax, x) + lx),
      borner(this.P[1], Math.min(ay, y), Math.max(ay, y) + ly)];
    if (this.relache !== null) {
      const arrivee = !this.camera || (C === this.camera[0] && R === this.camera[1]);
      if (arrivee || t - this.relache > ATTENTE_CAMERA) {
        const a = [x + borner(vue[0] - x, 0, lx), y + borner(vue[1] - y, 0, ly)];
        if (a[0] === vue[0] && a[1] === vue[1]) this.actif = false;
        else this.fin = { t, de: vue, a };
      }
    }
    return vue;
  }

  // Le bouton relâché : la vue voulue ne bouge plus.
  relacher(t) {
    if (this.actif && this.relache === null) this.relache = t;
  }

  // La place du point saisi dans la vue montrée en `vue` (son coin), en pixels du monde : celle du
  // curseur.
  pointSaisi(vue) {
    return [this.saisie[0] - vue[0], this.saisie[1] - vue[1]];
  }
}
