// Le défilement fluide, côté page (moteur/jeu/reglages.js, `defilementFluide`).
//
// Le jeu déplace sa caméra par cases entières ; ici, la vue montrée glisse au pixel d'une position
// de la caméra à la suivante. Le jeu n'en sait rien : il publie, à chaque image du parc, la vue
// qu'il vient de dessiner (sans l'interface), l'image complète qu'il présente, et la position de la
// vue dans le monde (moteur/jeu/vue-fluide.js). Ce module, sans DOM, en fait l'image à montrer.
//
// LA VUE TRAÎNE DERRIÈRE LA CAMÉRA. Chaque pas de la caméra devient un point de passage, daté dans
// le futur : l'intervalle moyen entre les pas après le point précédent. La vue montrée va de point en
// point en ligne droite. Les pas n'arrivent pas à intervalles réguliers — au bord de l'écran, un pas
// toutes les trois images, mais la page les reçoit au rafraîchissement suivant ; au clavier, au
// rythme de la répétition des touches, que le jeu lit une par image —, et une glisse calée sur
// l'intervalle de chaque pas avancerait par à-coups, s'arrêtant quand un pas tarde, bondissant quand
// deux se suivent. L'intervalle moyen (une moyenne glissante, entre 25 et 160 ms, repartant de
// 100 ms après un repos) régularise la vitesse. Quand la caméra accélère, la vue rattrape son retard en rapprochant les points suivants
// (jusqu'à un demi-intervalle : la vitesse au plus doublée), pour qu'un point ne soit pas daté à plus
// d'un intervalle et demi de l'arrivée de son pas. Après un repos (plus de 250 ms sans pas), la glisse
// repart de la position montrée. La position montrée est donc toujours entre des positions que la
// caméra a occupées. Le bord avant de la vue, du côté où l'on va, est couvert par l'image courante,
// qui est en avance ; seule la bande arrière, qui sort de l'écran, n'y est pas : le jeu l'a dessinée
// une ou deux images plus tôt.
//
// LA MOSAÏQUE. Chaque vue publiée est collée à sa place dans un plan du monde de 4096x4096 indices
// de couleur, adressé modulo 4096. La fenêtre montrée y est découpée à la position de la glisse :
// elle ne lit que la vue courante et ce qu'un pas de la caméra en découvre, recollé une ou deux images
// plus tôt ; le plan n'a donc à tenir qu'une vue et un pas autour (la grande vue va jusqu'à 2560 de
// large), pas le monde entier.
//
// L'INTERFACE reste à sa place. Tout ce que le jeu a tracé par-dessus la vue (barre de menus,
// fenêtres, barre des messages, curseur, marques de la case visée) est ce qui diffère entre l'image
// complète et la vue seule ; le panneau de commande, en bas, en est en entier. Un pixel d'interface
// qui aurait par hasard la couleur de la vue dessous ne diffère pas : les trous d'un pixel, entre
// deux pixels d'interface, sont bouchés.
//
// Pas de glisse (la vue saute, comme dans le jeu d'origine) : au premier pas après un changement de
// mode ou une reprise, pour un saut de plus de 6 cases, et tant que le bouton gauche est tenu. Tout
// appui d'un bouton finit la glisse en cours (caler) avant de partir au jeu.

const COTE = 4096, MASQUE = COTE - 1;
const INTERVALLE_MIN = 25, INTERVALLE_MAX = 160, INTERVALLE_DEPART = 100;   // ms, entre deux pas
const REPOS = 250;                       // ms sans pas : la caméra s'est arrêtée
const SAUT_MAX = 6;                      // cases franchies par la caméra en une image : au-delà, pas de glisse

export class DefilementFluide {
  constructor() {
    this.mosaique = new Uint8Array(COTE * COTE);
    this.largeur = 0;
    this.hauteur = 0;
    this.image = null;           // l'image complète de la dernière image publiée
    this.interface = null;       // 1 là où cette image montre l'interface
    this.ecarts = null;
    this.cible = null;           // la position de la vue dans cette image : { x, y }
    this.points = [];            // la glisse : les points de passage { t, x, y }, dans l'ordre
    this.intervalle = INTERVALLE_DEPART;  // l'intervalle moyen entre deux pas (ms)
    this.dernierPas = -Infinity; // l'heure d'arrivée du dernier pas de la caméra (ms)
    this.boutonGauche = false;   // tenu (ou le glisser au bouton du milieu, qui tient la vue) : pas de glisse
    this.hauteurVue = 0;
    // L'interface en plages, ligne par ligne, pour la composition : [début, fin[ en pixels depuis le
    // début de l'image ; celles de la ligne y vont de debutsDesPlages[y] à debutsDesPlages[y + 1].
    this.plages = new Int32Array(1 << 14);
    this.debutsDesPlages = null;
    this.lignesAEcarts = null;   // 1 pour une ligne qui a au moins un écart (et sous la vue)
    this.vue32 = null;           // la vue lue par mots, gardée tant que son tampon ne change pas
  }

  // Hors de la vue du parc (écrans, menus) ou réglage éteint : tout est oublié.
  oublier() {
    this.largeur = this.hauteur = 0;
    this.cible = null;
    this.points = [];
  }

  // Finir la glisse : la vue montrée rejoint la caméra.
  caler() { this.points = []; }

  // Une image du parc publiée par le jeu (voir vue-fluide.js) ; maintenant en millisecondes.
  recevoir({ largeur, hauteur, hauteurVue, x, y, tuile, vue, image }, maintenant) {
    const neuf = largeur !== this.largeur || hauteur !== this.hauteur || !this.cible || !this.image;
    if (neuf) {
      this.largeur = largeur;
      this.hauteur = hauteur;
      this.image = new Uint8Array(largeur * hauteur);
      this.interface = new Uint8Array(largeur * hauteur);
      this.ecarts = new Uint8Array(largeur * hauteur);
      // Les mêmes, lus par mots de quatre pixels (masquer), et les plages d'interface par ligne.
      this.image32 = new Uint32Array(this.image.buffer);
      this.interface32 = new Uint32Array(this.interface.buffer);
      this.ecarts32 = new Uint32Array(this.ecarts.buffer);
      this.debutsDesPlages = new Int32Array(hauteur + 1);
      this.lignesAEcarts = new Uint8Array(hauteur + 1);
      this.mosaique.fill(0);
      this.points = [];
    }
    this.coller(vue, largeur, hauteurVue, x, y);
    this.image.set(image.subarray(0, largeur * hauteur));
    this.masquer(vue, hauteurVue);

    if (!neuf && (x !== this.cible.x || y !== this.cible.y)) this.pas(x, y, tuile, maintenant);
    this.cible = { x, y };
  }

  // Pour le zoom (zoom.js, affichage.js), qui garde sa mosaïque dans la carte graphique et y compose
  // la glisse : la position de la vue seule, pour la glisse ; ni mosaïque ni masque ici.
  suivre({ largeur, hauteur, x, y, tuile }, maintenant) {
    const neuf = largeur !== this.largeur || hauteur !== this.hauteur || !this.cible || this.image;
    if (neuf) {
      this.largeur = largeur;
      this.hauteur = hauteur;
      this.image = null;           // (la mosaïque d'ici n'est plus à jour : `recevoir` repartira de zéro)
      this.points = [];
    } else if (x !== this.cible.x || y !== this.cible.y) this.pas(x, y, tuile, maintenant);
    this.cible = { x, y };
  }

  // La caméra a fait un pas (ou plusieurs dans la même image) : un point de passage de plus.
  pas(x, y, tuile, maintenant) {
    const ici = this.position(maintenant);
    const ecart = maintenant - this.dernierPas;
    this.dernierPas = maintenant;
    // un saut de la caméra (la carte du parc, un changement d'origine), pas un défilement
    const loin = Math.abs(x - this.cible.x) > SAUT_MAX * tuile[0] || Math.abs(y - this.cible.y) > SAUT_MAX * tuile[1];
    if (loin || this.boutonGauche) { this.points = []; return; }
    if (ecart > REPOS) this.intervalle = INTERVALLE_DEPART;    // un nouveau défilement, peut-être d'un autre genre
    else this.intervalle = Math.max(INTERVALLE_MIN, Math.min(INTERVALLE_MAX, 0.5 * this.intervalle + 0.5 * ecart));
    let t;
    if (ecart > REPOS || this.points.length === 0) {
      // départ, reprise, ou glisse déjà finie : de la position montrée, à l'allure moyenne
      this.points = [{ t: maintenant, x: ici.x, y: ici.y }];
      t = maintenant + this.intervalle;
    } else {
      const precedent = this.points[this.points.length - 1].t;
      // un intervalle après le précédent ; plus tôt si la vue a pris trop de retard, mais jamais
      // moins d'un demi-intervalle après lui (la vitesse au plus doublée, sans à-coup)
      t = Math.max(precedent + this.intervalle / 2, Math.min(precedent + this.intervalle, maintenant + 1.5 * this.intervalle));
    }
    this.points.push({ t, x, y });
  }

  // La vue seule, collée à sa place dans la mosaïque, ligne par ligne (une ligne peut passer le bord
  // du plan : elle continue de l'autre côté).
  coller(vue, largeur, hauteurVue, x, y) {
    for (let ligne = 0; ligne < hauteurVue; ligne++) {
      const base = ((y + ligne) & MASQUE) * COTE;
      const source = vue.subarray(ligne * largeur, (ligne + 1) * largeur);
      const x0 = x & MASQUE;
      const avant = Math.min(largeur, COTE - x0);
      this.mosaique.set(source.subarray(0, avant), base + x0);
      if (avant < largeur) this.mosaique.set(source.subarray(avant), base);
    }
  }

  // Le masque de l'interface : ce qui diffère de la vue seule, et tout le bas de l'écran ; puis ses
  // plages, ligne par ligne (la composition recopie des plages plutôt que des pixels).
  //
  // Le travail se fait par mots de quatre pixels : la vue du parc, où l'image et la vue sont
  // égales, se traverse à un mot par tour. Un trou d'un pixel (un pixel de la vue entre deux pixels
  // d'interface, à gauche et à droite ou en haut et en bas) ne peut être que dans un mot qui a un
  // écart, ou dont le mot du dessus ou du dessous en a un : un mot sans écart, entre deux mots sans
  // écart, n'a pas de trou (chacun de ses pixels a un voisin sans écart dans le mot même, à gauche
  // ou à droite). Ce sont les seuls mots examinés pixel par pixel ; et une ligne n'est parcourue
  // que si elle ou l'une de ses voisines a un écart (l'interface n'occupe que quelques lignes de la
  // vue : barre de menus, curseur, marques). Le résultat est celui de la règle pixel par pixel
  // (`masquerPixelParPixel`, qui sert quand la largeur n'est pas un multiple de 4).
  masquer(vue, hauteurVue) {
    const l = this.largeur, h = this.hauteur, image = this.image, ecarts = this.ecarts, masque = this.interface;
    this.hauteurVue = hauteurVue;
    const n = l * hauteurVue;
    if ((l & 3) !== 0 || (vue.byteOffset & 3) !== 0) {
      this.masquerPixelParPixel(vue, hauteurVue);
      this.releverLesPlages(false);
      return;
    }
    if (!this.vue32 || this.vue32.buffer !== vue.buffer || this.vue32.byteOffset !== vue.byteOffset
      || this.vue32.length < n >> 2) {
      this.vue32 = new Uint32Array(vue.buffer, vue.byteOffset, (vue.buffer.byteLength - vue.byteOffset) >> 2);
    }
    const vue32 = this.vue32, image32 = this.image32, ecarts32 = this.ecarts32, lignes = this.lignesAEcarts;
    const parLigne = l >> 2;
    for (let y = 0; y < hauteurVue; y++) {
      let ecart = 0;
      for (let k = y * parLigne, fin = k + parLigne; k < fin; k++) {
        if (image32[k] === vue32[k]) { ecarts32[k] = 0; continue; }
        const i = k << 2;
        ecarts[i] = image[i] !== vue[i] ? 1 : 0;
        ecarts[i + 1] = image[i + 1] !== vue[i + 1] ? 1 : 0;
        ecarts[i + 2] = image[i + 2] !== vue[i + 2] ? 1 : 0;
        ecarts[i + 3] = image[i + 3] !== vue[i + 3] ? 1 : 0;
        ecart = 1;
      }
      lignes[y] = ecart;
    }
    lignes.fill(1, hauteurVue, h + 1);
    ecarts.fill(1, n, l * h);
    masque.set(ecarts);
    // trous d'un pixel, entre deux pixels d'interface
    for (let y = 1; y < hauteurVue; y++) {
      if (!lignes[y - 1] && !lignes[y] && !lignes[y + 1]) continue;
      const ligne = y * parLigne;
      for (let k = 0; k < parLigne; k++) {
        const mot = ecarts32[ligne + k];
        if (mot === 0x01010101) continue;                 // tout d'interface : pas de trou
        // (sous la dernière ligne de la vue, le bas de l'écran ; au-delà du tampon, rien)
        if (mot === 0 && ecarts32[ligne + k - parLigne] === 0 && (ecarts32[ligne + k + parLigne] | 0) === 0) continue;
        const x0 = k << 2;
        const fin = Math.min(x0 + 4, l - 1);
        for (let x = x0 === 0 ? 1 : x0, i = y * l + x; x < fin; x++, i++) {
          if (ecarts[i]) continue;
          if ((ecarts[i - 1] && ecarts[i + 1]) || (ecarts[i - l] && ecarts[i + l])) masque[i] = 1;
        }
      }
    }
    this.releverLesPlages(true);
  }

  // La règle, pixel par pixel.
  masquerPixelParPixel(vue, hauteurVue) {
    const l = this.largeur, h = this.hauteur, image = this.image, ecarts = this.ecarts, masque = this.interface;
    const n = l * hauteurVue;
    for (let i = 0; i < n; i++) ecarts[i] = image[i] !== vue[i] ? 1 : 0;
    ecarts.fill(1, n, l * h);
    masque.set(ecarts);
    for (let y = 1; y < hauteurVue; y++) {
      for (let x = 1, i = y * l + 1; x < l - 1; x++, i++) {
        if (ecarts[i]) continue;
        if ((ecarts[i - 1] && ecarts[i + 1]) || (ecarts[i - l] && ecarts[i + l])) masque[i] = 1;
      }
    }
  }

  // Les plages d'interface des lignes de la vue, depuis le masque (par mots quand c'est possible) ;
  // `parLignes` : les lignes à écarts sont connues (masquer), les autres sont sautées.
  releverLesPlages(parLignes) {
    const l = this.largeur, hv = this.hauteurVue, masque = this.interface, masque32 = this.interface32;
    const debuts = this.debutsDesPlages;
    let plages = this.plages, p = 0;
    const parMots = (l & 3) === 0, lignes = parLignes ? this.lignesAEcarts : null;
    for (let y = 0; y < hv; y++) {
      debuts[y] = p;
      // sans écart, une ligne n'a d'interface que par des trous entre ses deux voisines
      if (lignes && !lignes[y] && !(y > 0 && lignes[y - 1] && lignes[y + 1])) continue;
      const o = y * l;
      let debut = -1;
      for (let x = 0; x < l;) {
        if (parMots && (x & 3) === 0) {
          const mot = masque32[(o + x) >> 2];
          if (mot === 0) {
            if (debut >= 0) {
              if (p + 2 > plages.length) plages = this.agrandirLesPlages();
              plages[p++] = o + debut; plages[p++] = o + x; debut = -1;
            }
            x += 4;
            continue;
          }
          if (mot === 0x01010101) { if (debut < 0) debut = x; x += 4; continue; }
        }
        if (masque[o + x]) {
          if (debut < 0) debut = x;
        } else if (debut >= 0) {
          if (p + 2 > plages.length) plages = this.agrandirLesPlages();
          plages[p++] = o + debut; plages[p++] = o + x; debut = -1;
        }
        x++;
      }
      if (debut >= 0) {
        if (p + 2 > plages.length) plages = this.agrandirLesPlages();
        plages[p++] = o + debut; plages[p++] = o + l;
      }
    }
    debuts[hv] = p;
  }

  agrandirLesPlages() {
    const plus = new Int32Array(this.plages.length * 2);
    plus.set(this.plages);
    this.plages = plus;
    return plus;
  }

  // La position montrée à l'heure dite, en pixels du monde (fractionnaire pendant une glisse). Les
  // points dépassés sont oubliés ; le dernier atteint, la glisse est finie.
  position(maintenant) {
    const p = this.points;
    while (p.length >= 2 && p[1].t <= maintenant) p.shift();
    if (p.length < 2) { this.points = []; return this.cible; }
    const [a, b] = p;
    const k = Math.max(0, Math.min(1, (maintenant - a.t) / (b.t - a.t)));
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  // Une glisse est-elle en cours ?
  get glisse() { return this.points.length >= 2; }

  // L'image à montrer, dans sortie (largeur × hauteur indices). Rend false s'il n'y a rien à
  // composer, la vue montrée étant celle du jeu : on montre alors l'image du jeu elle-même.
  // `imposee` : la vue montrée { x, y }, à la place de la glisse (le glisser au bouton du milieu,
  // glisser.js).
  composer(sortie, maintenant, imposee = null) {
    // (sans image : le zoom composait la glisse, `suivre` ; au sortir du zoom pendant une glisse, la
    // page repassait ici avant l'image suivante, sur une image nulle, et son affichage s'arrêtait)
    if (!this.cible || !this.image) return false;
    const p = imposee || this.position(maintenant);
    const px = Math.round(p.x), py = Math.round(p.y);
    if (px === this.cible.x && py === this.cible.y) return false;
    this.px = px; this.py = py;        // (la position composée : les retouches des animations s'y calent)
    this.composerA(sortie, px, py);
    return true;
  }

  // La composition pour la vue montrée en (px, py) du monde : chaque ligne de la vue recopiée de la
  // mosaïque (d'un ou deux morceaux : elle peut passer le bord du plan), puis ses plages d'interface
  // prises dans l'image du jeu ; le bas de l'écran, tout d'interface, d'un bloc.
  composerA(sortie, px, py) {
    const l = this.largeur, h = this.hauteur, hv = this.hauteurVue, image = this.image, mosaique = this.mosaique;
    const plages = this.plages, debuts = this.debutsDesPlages;
    const x0 = px & MASQUE, avant = Math.min(l, COTE - x0);
    for (let y = 0; y < hv; y++) {
      const base = ((py + y) & MASQUE) * COTE, o = y * l;
      sortie.set(mosaique.subarray(base + x0, base + x0 + avant), o);
      if (avant < l) sortie.set(mosaique.subarray(base, base + l - avant), o + avant);
      for (let k = debuts[y], fin = debuts[y + 1]; k < fin; k += 2) {
        const a = plages[k], b = plages[k + 1];
        if (b - a <= 16) for (let i = a; i < b; i++) sortie[i] = image[i];
        else sortie.set(image.subarray(a, b), a);
      }
    }
    sortie.set(image.subarray(hv * l, h * l), hv * l);
  }
}
