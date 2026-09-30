// Le rendu HD : l'image du jeu recomposée à ×k d'après la liste d'affichage (liste-affichage-format.js),
// chaque sprite remplacé par sa version HD s'il y en a une (images/hd/, un « pack HD »), sinon agrandi
// au plus proche.
//
// LE PRINCIPE. Le travailleur relève ce que le jeu dessine (liste-affichage.js) et envoie, avec chaque
// image, le lot des opérations qui y ont mené. La page rejoue ces opérations, dans l'ordre, sur ses
// propres versions des tampons du jeu (la surface, le fond, le motif du curseur, l'écran), k fois plus
// grandes : l'ordre du jeu fait la profondeur, comme dans le jeu. Le tampon de l'écran est ce qui est
// montré. Le rendu de référence (liste-affichage-reference.js) fait la même chose à ×1 ; le banc
// travail/hd/banc.mjs prouve qu'il redonne l'image du jeu au pixel près.
//
// TROIS COUCHES PAR TAMPON (WebGL2, une texture chacune, dessinées ensemble) :
//  - l'indice : l'image de 1994, indices de couleur (ce que serait le tampon du jeu, agrandi au plus
//    proche) ;
//  - la couleur HD, prémultipliée (RGBA8) ;
//  - la transmission T (R8) : la part de l'indice qu'on voit sous la couleur HD.
// Le pixel montré vaut couleur × modulation + T × palette[indice]. Un pixel de 1994 (sprite sans
// remplaçant, rectangle, pixels relevés) pose son indice, une couleur nulle et T = 1 : il suit la
// palette du moment, fondus compris. Un pixel HD se mêle par-dessus (couleur ← c + couleur × (1 − a),
// T ← T × (1 − a)) : un bord adouci laisse voir ce qui est dessous, en 1994 comme en HD. La couleur HD,
// elle, ne connaît pas la palette : pendant un fondu (la palette assombrie), elle est modulée par
// le rapport de la palette du moment à la dernière palette pleine (`modulation`).
// Tout se fait par le mélange des cartes graphiques (ONE, ONE_MINUS_SRC_ALPHA), sans lire le tampon
// qu'on dessine : les sprites de 1994 et les HD passent donc dans les mêmes appels, par instances.
//
// LES APPELS. Les opérations se suivent par séries de même sorte vers le même tampon : une série de
// sprites (et de rectangles, et de pixels) est un seul appel instancié ; une série de recopies d'un
// tampon vers un autre, un autre. Les sprites de 1994 sont rangés dans un atlas (indice, masque) ; les
// pixels relevés, dans un atlas de passage vidé à chaque lot ; les images HD, dans un atlas RGBA.
//
// LE PACK HD (assets/images/hd/ ; images/hd/ dans la distribution) : un manifeste index.json,
//   { "echelle": 2,
//     "sprites": { "MSPR-0/1234": "MSPR-0/1234.png",
//                  "MPOINTER/0": { "fichier": "MPOINTER/0.png", "echelle": 4, "ancre": [2, 2] } },
//     "fichiers": { "MMENU-0.DAT": { "fichier": "fonds/MMENU-0.png", "largeur": 320 } } }
// Un sprite est nommé par sa banque (le fichier .TAB du jeu, sans extension) et son numéro dans la
// banque. Son image est à `echelle` pixels pour un pixel du jeu (celle du manifeste par défaut) ;
// `ancre` : le pixel de l'image HD où tombe le coin haut gauche du sprite de 1994 (0, 0 par défaut :
// une image plus grande que le sprite déborde à droite et en bas, ou de tous côtés avec une ancre).
// « fichiers » : les images plein écran que le jeu lit d'un fichier (les fonds des écrans), par nom de
// fichier ; `largeur` : sa largeur dans le jeu (320 ou 640).

import { OP, MODE, parcourir } from './liste-affichage-format.js';
import { cheminDansLaDistribution } from '../hote/distribution.js';

const SOMMETS_SPRITES = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_quad;      // x0, y0, x1, y1 : le rectangle dessiné, en pixels du jeu
layout(location = 1) in vec4 a_origine;   // ox, oy, sx, sy : pixel (i, j) du sprite en (ox + sx·i, oy + sy·j)
layout(location = 2) in vec4 a_image;     // ax, ay, l, h : le sprite de 1994 dans son atlas (l = 0 : un plein)
layout(location = 3) in vec4 a_hd;        // hx, hy, hl, hh : l'image HD dans son atlas (hl = 0 : aucune)
layout(location = 4) in vec4 a_hd2;       // ancre x, ancre y, échelle, couleur (silhouette, plein)
layout(location = 5) in vec4 a_divers;    // drapeaux (1 silhouette, 2 atlas de passage), étirement x, y
uniform vec2 u_cible;
out vec2 v_p;
flat out vec4 v_origine, v_image, v_hd, v_hd2, v_divers;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 p = mix(a_quad.xy, a_quad.zw, c);
  v_p = p; v_origine = a_origine; v_image = a_image; v_hd = a_hd; v_hd2 = a_hd2; v_divers = a_divers;
  gl_Position = vec4(p / u_cible * 2.0 - 1.0, 0.0, 1.0);
}`;

const PIXELS_SPRITES = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_atlas;        // RG8 : l'indice, le masque
uniform highp sampler2D u_passage;      // de même, les pixels relevés du lot
uniform highp sampler2D u_atlasHD;      // RGBA8 prémultiplié
uniform highp sampler2D u_palette;
uniform vec2 u_tailleHD;
in vec2 v_p;
flat in vec4 v_origine, v_image, v_hd, v_hd2, v_divers;
layout(location = 0) out vec4 o_indice;
layout(location = 1) out vec4 o_couleur;
layout(location = 2) out vec4 o_transmis;
void main() {
  int drapeaux = int(v_divers.x);
  bool silhouette = (drapeaux & 1) != 0;
  vec2 X = floor(v_p);
  float indice = v_hd2.w, m = 0.0;
  if (v_image.z == 0.0) m = 1.0;
  else {
    vec2 i = (X - v_origine.xy) * v_origine.zw;
    if (all(greaterThanEqual(i, vec2(0.0))) && all(lessThan(i, v_image.zw))) {
      ivec2 t = ivec2(v_image.xy + i);
      vec2 v = (drapeaux & 2) != 0 ? texelFetch(u_passage, t, 0).rg : texelFetch(u_atlas, t, 0).rg;
      m = v.g > 0.002 ? 1.0 : 0.0;      // (le masque vaut 0 ou 1, soit 1/255 une fois normalisé)
      if (!silhouette) indice = floor(v.r * 255.0 + 0.5);
    }
  }
  vec4 hd = vec4(0.0);
  if (v_hd.z > 0.0) {
    // la position dans le sprite, continue (un pixel retourné i couvre ]ox − i − 1, ox − i] + 1)
    vec2 u = vec2(v_origine.z > 0.0 ? v_p.x - v_origine.x : v_origine.x + 1.0 - v_p.x,
                  v_origine.w > 0.0 ? v_p.y - v_origine.y : v_origine.y + 1.0 - v_p.y) * v_divers.yz;
    vec2 h = u * v_hd2.z + v_hd2.xy;
    if (all(greaterThanEqual(h, vec2(0.0))) && all(lessThan(h, v_hd.zw))) {
      hd = texture(u_atlasHD, (v_hd.xy + h) / u_tailleHD);
      if (silhouette) hd.rgb = texelFetch(u_palette, ivec2(int(indice), 0), 0).rgb * hd.a;
    }
  }
  if (m == 0.0 && hd.a <= 0.0) discard;
  o_indice = vec4(indice / 255.0 * m, 0.0, 0.0, m);
  if (m > 0.0) { o_couleur = vec4(hd.rgb, 1.0); o_transmis = vec4(1.0 - hd.a, 0.0, 0.0, 1.0); }
  else { o_couleur = hd; o_transmis = vec4(0.0, 0.0, 0.0, hd.a); }
}`;

const SOMMETS_COPIES = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_quad;      // le rectangle de destination
layout(location = 1) in vec4 a_copie;     // décalage vers la source (sx − dx, sy − dy), couleur transparente
uniform vec2 u_cible;
flat out vec4 v_copie;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  v_copie = a_copie;
  gl_Position = vec4(mix(a_quad.xy, a_quad.zw, c) / u_cible * 2.0 - 1.0, 0.0, 1.0);
}`;

const PIXELS_COPIES = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_indice, u_couleur, u_transmis;
uniform float u_k;
flat in vec4 v_copie;
layout(location = 0) out vec4 o_indice;
layout(location = 1) out vec4 o_couleur;
layout(location = 2) out vec4 o_transmis;
void main() {
  ivec2 s = ivec2(gl_FragCoord.xy) + ivec2(v_copie.xy * u_k);
  vec4 i = texelFetch(u_indice, s, 0);
  float t = texelFetch(u_transmis, s, 0).r;
  if (v_copie.z >= 0.0 && abs(i.r * 255.0 - v_copie.z) < 0.5 && t > 0.999) discard;
  o_indice = vec4(i.r, 0.0, 0.0, 1.0);
  o_couleur = vec4(texelFetch(u_couleur, s, 0).rgb, 1.0);
  o_transmis = vec4(t, 0.0, 0.0, 1.0);
}`;

const SOMMETS_PLEIN = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 c = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  v_uv = c;
  gl_Position = vec4(c * 2.0 - 1.0, 0.0, 1.0);
}`;

// La couleur de chaque pixel de l'écran à ×k : couleur HD modulée, plus T × palette[indice].
const PIXELS_COMPOSITION = `#version 300 es
precision highp float;
uniform highp sampler2D u_indice, u_couleur, u_transmis, u_palette;
uniform vec3 u_modulation;
out vec4 o;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int i = int(texelFetch(u_indice, p, 0).r * 255.0 + 0.5);
  vec3 c = texelFetch(u_couleur, p, 0).rgb * u_modulation + texelFetch(u_transmis, p, 0).r * texelFetch(u_palette, ivec2(i, 0), 0).rgb;
  o = vec4(c, 1.0);
}`;

// L'image composée, posée sur le cadre (retournée : la ligne 0 des tampons est le haut de l'image).
const PIXELS_AFFICHAGE = `#version 300 es
precision highp float;
uniform highp sampler2D u_image;
uniform vec2 u_taille;              // la partie utile de la texture
uniform vec2 u_texture;
in vec2 v_uv;
out vec4 o;
void main() {
  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y) * u_taille;
  o = vec4(texture(u_image, p / u_texture).rgb, 1.0);
}`;

// Le nombre de flottants d'une instance de sprite (six vec4), d'une recopie (deux).
const F_SPRITE = 24, F_COPIE = 8;
const COTE_ATLAS = 2048, COTE_PASSAGE = 2048, COTE_HD = 4096;
// Au plus tant de pixels (×k compris) par tampon : trois textures (6 octets par pixel) par tampon.
const PIXELS_MAX = 12e6;

function compiler(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function programme(gl, sommets, pixels, uniformes) {
  const p = gl.createProgram();
  gl.attachShader(p, compiler(gl, gl.VERTEX_SHADER, sommets));
  gl.attachShader(p, compiler(gl, gl.FRAGMENT_SHADER, pixels));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (const n of uniformes) u[n] = gl.getUniformLocation(p, n);
  return { p, u };
}

// Le rangement d'images dans un atlas, par étagères : rend [x, y] ou null quand il est plein.
class Etageres {
  constructor(cote) { this.cote = cote; this.vider(); }
  vider() { this.x = 0; this.y = 0; this.h = 0; }
  placer(l, h) {
    if (l > this.cote || h > this.cote) return null;
    if (this.x + l > this.cote) { this.x = 0; this.y += this.h; this.h = 0; }
    if (this.y + h > this.cote) return null;
    const p = [this.x, this.y];
    this.x += l;
    if (h > this.h) this.h = h;
    return p;
  }
}

export class RenduHD {
  // `main` : l'élément où poser le canevas du rendu, par-dessus celui du jeu (qui garde la souris).
  constructor(main) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'rendu-hd';
    Object.assign(this.canvas.style, { position: 'absolute', pointerEvents: 'none', display: 'none', left: '0', top: '0', imageRendering: 'auto' });
    main.appendChild(this.canvas);
    this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    this.possible = !!this.gl;
    this.actif = false;
    this.k = 2;                        // le facteur voulu
    this.file = [];                    // les lots reçus, pas encore rejoués
    this.pack = null;                  // le manifeste du pack HD
    this.imagesHD = new Map();         // 'BANQUE/n' ou 'fichier:NOM' -> { etat, x, y, l, h, echelle, ancre }
    this.stats = { lots: 0, ops: 0, appels: 0, ms: 0, images: 0, sansHD: 0, avecHD: 0 };
    this.demanderUnRecalage = () => {};  // posé par la page : le travailleur redonne tous les tampons
    this.recalages = 0;                // les recalages de la vérification du travailleur
    this.surRecalage = null;           // (posé par la page : les montrer)
    if (this.possible) this.preparer();
  }

  preparer() {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.sprites = programme(gl, SOMMETS_SPRITES, PIXELS_SPRITES, ['u_cible', 'u_atlas', 'u_passage', 'u_atlasHD', 'u_palette', 'u_tailleHD']);
    this.copies = programme(gl, SOMMETS_COPIES, PIXELS_COPIES, ['u_cible', 'u_indice', 'u_couleur', 'u_transmis', 'u_k']);
    this.composition = programme(gl, SOMMETS_PLEIN, PIXELS_COMPOSITION, ['u_indice', 'u_couleur', 'u_transmis', 'u_palette', 'u_modulation']);
    this.affichage = programme(gl, SOMMETS_PLEIN, PIXELS_AFFICHAGE, ['u_image', 'u_taille', 'u_texture']);
    // Unités de texture : 0 l'atlas de 1994, 1 celui de passage, 2 l'atlas HD, 3 la palette, 4 à 6 la
    // source d'une recopie, 7 à 9 l'écran pour la composition, 10 l'image composée.
    const texture = (unite, interne, format, type, l, h, lineaire = false) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unite);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, lineaire ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, lineaire ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, interne, l, h, 0, format, type, null);
      return t;
    };
    this.texture = texture;
    this.atlas = { t: texture(0, gl.RG8, gl.RG, gl.UNSIGNED_BYTE, COTE_ATLAS, COTE_ATLAS), etageres: new Etageres(COTE_ATLAS), generation: 0 };
    this.passage = { t: texture(1, gl.RG8, gl.RG, gl.UNSIGNED_BYTE, COTE_PASSAGE, COTE_PASSAGE), etageres: new Etageres(COTE_PASSAGE) };
    this.atlasHD = null;               // créé avec la première image HD
    texture(2, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 1, 1);
    this.texturePalette = texture(3, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 256, 1);
    this.composee = { t: texture(10, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, 1, 1, true), l: 1, h: 1, fbo: gl.createFramebuffer() };
    // Les sommets : aucun tampon de sommets (gl_VertexID) ; les instances, par attributs.
    this.vaoSprites = gl.createVertexArray();
    this.instancesSprites = gl.createBuffer();
    gl.bindVertexArray(this.vaoSprites);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instancesSprites);
    for (let k = 0; k < 6; k++) {
      gl.enableVertexAttribArray(k);
      gl.vertexAttribPointer(k, 4, gl.FLOAT, false, F_SPRITE * 4, k * 16);
      gl.vertexAttribDivisor(k, 1);
    }
    this.vaoCopies = gl.createVertexArray();
    this.instancesCopies = gl.createBuffer();
    gl.bindVertexArray(this.vaoCopies);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instancesCopies);
    for (let k = 0; k < 2; k++) {
      gl.enableVertexAttribArray(k);
      gl.vertexAttribPointer(k, 4, gl.FLOAT, false, F_COPIE * 4, k * 16);
      gl.vertexAttribDivisor(k, 1);
    }
    this.vaoVide = gl.createVertexArray();
    gl.bindVertexArray(null);
    this.lot = new Float32Array(4096 * F_SPRITE);
    this.serie = null;                 // { sorte: 'sprites' | 'copies', cible, source, n }
    this.tampons = new Map();          // id -> { l, h, textures: [indice, couleur, transmis], fbo }
    this.definitions = new Map();      // clé -> sprite de 1994 (et son image HD)
    this.chaines = new Map();
    this.palette = new Uint8Array(1024);
    this.paletteVGA = new Uint8Array(768);
    this.pleine = null;                // les sommes de la dernière palette pleine, pour la modulation
    this.modulation = [1, 1, 1];
    this.image = null;                 // la dernière image complète : { numero, l, h }
    this.aMontrer = false;
    this.echelle = null;               // le repère OP.ECHELLE en attente de ses pixels
    this.source = null;                // le repère OP.SOURCE en attente
  }

  // --- allumer, éteindre, le facteur ---------------------------------------------------------------
  allumer(k = this.k) {
    this.k = k;
    this.kActuel = k;            // (le facteur de tous les tampons : plus petit si l'un d'eux est trop grand)
    this.actif = true;
    this.file.length = 0;
    this.image = null;
    this.canvas.style.display = 'block';
  }
  eteindre() {
    this.actif = false;
    this.file.length = 0;
    this.canvas.style.display = 'none';
    // (les tampons sont oubliés : rallumé, le travailleur les redonne)
    for (const t of this.tampons.values()) this.oublierTampon(t);
    this.tampons.clear();
    this.definitions.clear();
    this.atlas.etageres.vider();
    this.atlas.generation++;
  }
  recevoir(lot) {
    if (!this.actif) return;
    this.file.push(lot);
    // les recalages de la vérification (liste-affichage.js) : là, la page montre les pixels de 1994
    if (lot.recalages !== undefined && lot.recalages !== this.recalages) {
      this.recalages = lot.recalages;
      if (this.surRecalage) this.surRecalage(this.recalages);
    }
  }

  // --- le pack HD ----------------------------------------------------------------------------------
  // `paquet` : le paquet des données (donnees.js, environnement-distribution.js) ; le manifeste est lu, et
  // toutes ses images chargées (le rendu les prend dès qu'elles sont là). Rend une promesse du nombre
  // d'images.
  async chargerLePack(paquet) {
    const lire = lecteurDesAssets(paquet);
    if (!lire) return 0;
    let texte;
    try { texte = await lire('images/hd/index.json', true); } catch (err) { return 0; }
    if (!texte) return 0;
    const pack = JSON.parse(texte);
    this.pack = pack;
    const echelle = pack.echelle || 1;
    const entrees = [];
    for (const [cle, v] of Object.entries(pack.sprites || {})) {
      const d = typeof v === 'string' ? { fichier: v } : v;
      entrees.push([cle.toUpperCase(), { fichier: d.fichier, echelle: d.echelle || echelle, ancre: d.ancre || [0, 0] }]);
    }
    for (const [nom, v] of Object.entries(pack.fichiers || {})) {
      const d = typeof v === 'string' ? { fichier: v } : v;
      entrees.push(['FICHIER:' + nom.toUpperCase(), { fichier: d.fichier, echelle: d.echelle || echelle, ancre: d.ancre || [0, 0], largeur: d.largeur || 320 }]);
    }
    let n = 0;
    await Promise.all(entrees.map(async ([cle, d]) => {
      try {
        const octets = await lire('images/hd/' + d.fichier, false);
        const bitmap = await createImageBitmap(new Blob([octets], { type: 'image/png' }), { premultiplyAlpha: 'premultiply', colorSpaceConversion: 'none' });
        if (this.poserUneImageHD(cle, bitmap, d)) n++;
      } catch (err) {
        console.warn(`rendu HD : ${d.fichier} illisible (${err.message})`);
      }
    }));
    // les sprites déjà définis prennent leur image
    for (const s of this.definitions.values()) s.hd = this.imageHDDe(s);
    return n;
  }
  poserUneImageHD(cle, bitmap, d) {
    const gl = this.gl;
    if (!this.atlasHD) {
      this.atlasHD = { t: this.texture(2, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, COTE_HD, COTE_HD, true), etageres: new Etageres(COTE_HD) };
      // (transparent partout : les marges des images restent transparentes)
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.atlasHD.t, 0);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
    }
    // une marge d'un pixel transparent tout autour : le filtrage bilinéaire n'y prend pas la voisine
    const p = this.atlasHD.etageres.placer(bitmap.width + 2, bitmap.height + 2);
    if (!p) { console.warn(`rendu HD : l'atlas HD est plein (${cle})`); return false; }
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasHD.t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, p[0] + 1, p[1] + 1, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    this.imagesHD.set(cle, { x: p[0] + 1, y: p[1] + 1, l: bitmap.width, h: bitmap.height, echelle: d.echelle, ancre: d.ancre, largeur: d.largeur });
    return true;
  }
  imageHDDe(s) {
    if (!s.banque || s.numero < 0) return null;
    return this.imagesHD.get(`${s.banque}/${s.numero}`) || null;
  }

  // --- rejouer les lots ----------------------------------------------------------------------------
  // Tous les lots reçus, dans l'ordre. Rend vrai si une image nouvelle est prête à montrer.
  appliquer() {
    if (!this.actif || !this.possible || !this.file.length) return false;
    const t0 = performance.now();
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    const lots = this.file;
    this.file = [];
    let neuve = false;
    for (const lot of lots) {
      this.passage.etageres.vider();
      parcourir(lot, (code, m, p, o) => {
        this.stats.ops++;
        switch (code) {
          case OP.BUFFER: this.finirLaSerie(); this.definirTampon(m[p + 1], m[p + 2], m[p + 3]); break;
          case OP.DEF: this.definir(m, p, o); break;
          case OP.OUBLIER: this.definitions.delete(m[p + 1]); break;
          case OP.CHAINE: this.chaines.set(m[p + 1], String.fromCharCode(...o.subarray(m[p + 2], m[p + 2] + m[p + 3]))); break;
          case OP.PALETTE: this.poserLaPalette(o.subarray(m[p + 1], m[p + 1] + 768)); break;
          case OP.SPRITE: this.sprite(m, p); break;
          case OP.FILL: this.remplir(m[p + 1], m[p + 2], m[p + 3], m[p + 4], m[p + 5], m[p + 6]); break;
          case OP.COPY: this.copier(m[p + 1], m[p + 2], m[p + 3], m[p + 4], m[p + 5], m[p + 6], m[p + 7], m[p + 8], m[p + 9]); break;
          case OP.PIXELS: this.pixels(m[p + 1], m[p + 2], m[p + 3], m[p + 4], m[p + 5], o, m[p + 6]); break;
          case OP.ECHELLE: this.echelle = { tampon: m[p + 1], cle: m[p + 2], x: m[p + 3], y: m[p + 4], l: m[p + 5], h: m[p + 6] }; break;
          case OP.SOURCE: this.source = { tampon: m[p + 1], x: m[p + 2], y: m[p + 3], l: m[p + 4], h: m[p + 5], nom: this.chaines.get(m[p + 6]), decalage: m[p + 7] }; break;
          case OP.IMAGE: this.image = { numero: m[p + 1], l: m[p + 2], h: m[p + 3] }; neuve = true; break;
          default: break;
        }
      });
      this.finirLaSerie();
      this.stats.lots++;
    }
    if (neuve) this.aMontrer = true;
    this.stats.ms += performance.now() - t0;
    return neuve;
  }

  // Un tampon du jeu, à ×k : trois textures et leur tampon d'image, remis à zéro (indice 0, couleur
  // nulle, T = 1). Le facteur est borné par la taille (PIXELS_MAX) : la grande vue la plus grande
  // passe à ×2, ×1 au-delà.
  definirTampon(id, l, h) {
    const gl = this.gl;
    let t = this.tampons.get(id);
    const k = this.facteurPour(l, h);
    if (k < this.kActuel) {
      // Trop grand à ce facteur (la grande vue la plus loin) : tous les tampons passent au facteur plus
      // petit (les recopies vont de l'un à l'autre), vidés, et le travailleur les redonne.
      this.kActuel = k;
      for (const u of [...this.tampons.values()]) if (u.id !== id) this.definirTampon(u.id, u.l, u.h);
      this.demanderUnRecalage();
      t = this.tampons.get(id);
    }
    if (!t || t.l !== l || t.h !== h || t.k !== k) {
      if (t) this.oublierTampon(t);
      t = { id, l, h, k, L: l * k, H: h * k, fbo: gl.createFramebuffer() };
      t.textures = [
        this.texture(4, gl.R8, gl.RED, gl.UNSIGNED_BYTE, t.L, t.H),
        this.texture(4, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, t.L, t.H),
        this.texture(4, gl.R8, gl.RED, gl.UNSIGNED_BYTE, t.L, t.H),
      ];
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      t.textures.forEach((x, k2) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + k2, gl.TEXTURE_2D, x, 0));
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
      this.tampons.set(id, t);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 2, [1, 0, 0, 0]);
  }
  facteurPour(l, h) {
    let k = this.kActuel || this.k;
    while (k > 1 && l * h * k * k > PIXELS_MAX) k--;
    return k;
  }
  oublierTampon(t) {
    const gl = this.gl;
    for (const x of t.textures) gl.deleteTexture(x);
    gl.deleteFramebuffer(t.fbo);
  }

  // Un sprite de 1994 : rangé dans l'atlas à son premier usage (valeurs et masque entrelacés).
  definir(m, p, o) {
    const l = m[p + 2], h = m[p + 3], a = m[p + 4];
    const s = {
      l, h, rg: new Uint8Array(2 * l * h), place: null, generation: -1,
      banque: m[p + 5] >= 0 ? (this.chaines.get(m[p + 5]) || '').toUpperCase() : null, numero: m[p + 6],
      lignes: m[p + 7], largeur: m[p + 8], hauteur: m[p + 9],
    };
    for (let k = 0; k < l * h; k++) { s.rg[2 * k] = o[a + k]; s.rg[2 * k + 1] = o[a + l * h + k]; }
    s.hd = this.imageHDDe(s);
    this.definitions.set(m[p + 1], s);
  }
  placeDansLAtlas(s) {
    if (s.generation === this.atlas.generation) return s.place;
    let p = this.atlas.etageres.placer(s.l, s.h);
    if (!p) {
      // plein : tout est oublié, et chaque sprite y reviendra à son prochain usage (la série en cours
      // est dessinée d'abord : ses instances désignent l'ancien rangement)
      this.finirLaSerie();
      this.atlas.etageres.vider();
      this.atlas.generation++;
      p = this.atlas.etageres.placer(s.l, s.h);
      if (!p) return null;
    }
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.t);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, p[0], p[1], s.l, s.h, gl.RG, gl.UNSIGNED_BYTE, s.rg);
    s.place = p;
    s.generation = this.atlas.generation;
    return p;
  }

  poserLaPalette(vga) {
    this.paletteVGA.set(vga);
    const somme = [0, 0, 0];
    for (let i = 0; i < 256; i++) {
      for (let c = 0; c < 3; c++) { this.palette[4 * i + c] = Math.round(vga[3 * i + c] * 255 / 63); somme[c] += vga[3 * i + c]; }
      this.palette[4 * i + 3] = 255;
    }
    // La modulation des couleurs HD : le rapport à la dernière palette « pleine ». Une palette qui n'est
    // pas plus sombre que celle-là de plus de 5 % le devient ; un fondu (plus sombre) la garde.
    const total = somme[0] + somme[1] + somme[2];
    if (!this.pleine || total >= 0.95 * (this.pleine[0] + this.pleine[1] + this.pleine[2])) this.pleine = somme;
    this.modulation = somme.map((v, c) => Math.min(1, this.pleine[c] ? v / this.pleine[c] : 1));
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texturePalette);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.palette);
  }

  // --- les séries --------------------------------------------------------------------------------
  serieDe(sorte, cible, source = null) {
    const s = this.serie;
    if (s && s.sorte === sorte && s.cible === cible && s.source === source) {
      if ((s.n + 1) * (sorte === 'sprites' ? F_SPRITE : F_COPIE) <= this.lot.length) return s;
    }
    this.finirLaSerie();
    this.serie = { sorte, cible, source, n: 0 };
    return this.serie;
  }
  finirLaSerie() {
    const s = this.serie;
    this.serie = null;
    if (!s || !s.n) return;
    const gl = this.gl;
    const t = s.cible;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.L, t.H);
    if (s.sorte === 'sprites') {
      const P = this.sprites;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.u_cible, t.l, t.h);
      gl.uniform1i(P.u.u_atlas, 0); gl.uniform1i(P.u.u_passage, 1); gl.uniform1i(P.u.u_atlasHD, 2); gl.uniform1i(P.u.u_palette, 3);
      gl.uniform2f(P.u.u_tailleHD, COTE_HD, COTE_HD);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.atlas.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.passage.t);
      gl.bindVertexArray(this.vaoSprites);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instancesSprites);
      gl.bufferData(gl.ARRAY_BUFFER, this.lot.subarray(0, s.n * F_SPRITE), gl.STREAM_DRAW);
    } else {
      const P = this.copies, src = s.source;
      gl.useProgram(P.p);
      gl.uniform2f(P.u.u_cible, t.l, t.h);
      gl.uniform1f(P.u.u_k, t.k);
      gl.uniform1i(P.u.u_indice, 4); gl.uniform1i(P.u.u_couleur, 5); gl.uniform1i(P.u.u_transmis, 6);
      for (let k = 0; k < 3; k++) { gl.activeTexture(gl.TEXTURE4 + k); gl.bindTexture(gl.TEXTURE_2D, src.textures[k]); }
      gl.bindVertexArray(this.vaoCopies);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instancesCopies);
      gl.bufferData(gl.ARRAY_BUFFER, this.lot.subarray(0, s.n * F_COPIE), gl.STREAM_DRAW);
    }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s.n);
    this.stats.appels++;
    if (s.sorte === 'copies') {
      // (la source n'est plus liée : elle peut redevenir une cible)
      for (let k = 0; k < 3; k++) { gl.activeTexture(gl.TEXTURE4 + k); gl.bindTexture(gl.TEXTURE_2D, null); }
    }
  }

  // Une instance de la série de sprites de la cible.
  instance(t, x0, y0, x1, y1, ox, oy, sx, sy, image, hd, ancreX, ancreY, echelle, couleur, drapeaux, ex, ey) {
    x0 = Math.max(x0, 0); y0 = Math.max(y0, 0); x1 = Math.min(x1, t.l); y1 = Math.min(y1, t.h);
    if (x1 <= x0 || y1 <= y0) return;
    const s = this.serieDe('sprites', t);
    const f = this.lot, b = s.n * F_SPRITE;
    f[b] = x0; f[b + 1] = y0; f[b + 2] = x1; f[b + 3] = y1;
    f[b + 4] = ox; f[b + 5] = oy; f[b + 6] = sx; f[b + 7] = sy;
    f[b + 8] = image[0]; f[b + 9] = image[1]; f[b + 10] = image[2]; f[b + 11] = image[3];
    if (hd) { f[b + 12] = hd.x; f[b + 13] = hd.y; f[b + 14] = hd.l; f[b + 15] = hd.h; } else { f[b + 12] = f[b + 13] = f[b + 14] = f[b + 15] = 0; }
    f[b + 16] = ancreX; f[b + 17] = ancreY; f[b + 18] = echelle; f[b + 19] = couleur;
    f[b + 20] = drapeaux; f[b + 21] = ex; f[b + 22] = ey; f[b + 23] = 0;
    s.n++;
  }

  sprite(m, p) {
    const t = this.tampons.get(m[p + 1]), s = this.definitions.get(m[p + 2]);
    if (!t || !s) return;
    const x = m[p + 3], y = m[p + 4], mode = m[p + 5], couleur = m[p + 6];
    const mh = (mode & MODE.MIROIR_H) !== 0, mv = (mode & MODE.MIROIR_V) !== 0;
    // le rectangle couvert : [x, x + l) droit, ]x + largeur − l, x + largeur] retourné
    const bx0 = mh ? x + s.largeur - s.l + 1 : x, by0 = mv ? y + s.hauteur - s.h + 1 : y;
    const hd = s.hd;
    // (pour les essais : les sprites tracés, par nom, si on le demande depuis la console)
    if (this.parNom && s.banque) { const n = `${s.banque}/${s.numero}`; this.parNom.set(n, (this.parNom.get(n) || 0) + 1); }
    // l'image HD peut déborder du sprite (une ancre, une image plus grande) : le rectangle la couvre aussi
    let x0 = bx0, y0 = by0, x1 = bx0 + s.l, y1 = by0 + s.h;
    if (hd) {
      const ax = hd.ancre[0] / hd.echelle, ay = hd.ancre[1] / hd.echelle + s.lignes;
      const hl = hd.l / hd.echelle, hh = hd.h / hd.echelle;
      // (u = p − x, ou x + largeur + 1 − p : le rectangle de l'image HD, dans le tampon)
      const ux0 = -ax, ux1 = hl - ax, uy0 = -ay, uy1 = hh - ay;
      const X0 = mh ? x + s.largeur + 1 - ux1 : x + ux0, X1 = mh ? x + s.largeur + 1 - ux0 : x + ux1;
      const Y0 = mv ? y + s.hauteur + 1 - uy1 : y + uy0, Y1 = mv ? y + s.hauteur + 1 - uy0 : y + uy1;
      x0 = Math.min(x0, Math.floor(X0)); y0 = Math.min(y0, Math.floor(Y0));
      x1 = Math.max(x1, Math.ceil(X1)); y1 = Math.max(y1, Math.ceil(Y1));
      this.stats.avecHD++;
    } else this.stats.sansHD++;
    x0 = Math.max(x0, m[p + 7]); y0 = Math.max(y0, m[p + 8]); x1 = Math.min(x1, m[p + 9]); y1 = Math.min(y1, m[p + 10]);
    const place = this.placeDansLAtlas(s);
    if (!place) return;
    this.instance(t, x0, y0, x1, y1, mh ? x + s.largeur : x, mv ? y + s.hauteur : y, mh ? -1 : 1, mv ? -1 : 1,
      [place[0], place[1], s.l, s.h], hd, hd ? hd.ancre[0] : 0, hd ? hd.ancre[1] + s.lignes * (hd ? hd.echelle : 0) : 0,
      hd ? hd.echelle : 1, couleur, (mode & MODE.SILHOUETTE) ? 1 : 0, 1, 1);
  }

  remplir(id, x, y, l, h, couleur) {
    const t = this.tampons.get(id);
    if (!t) return;
    this.instance(t, x, y, x + l, y + h, 0, 0, 1, 1, [0, 0, 0, 0], null, 0, 0, 1, couleur, 0, 1, 1);
  }

  copier(s, sx, sy, d, dx, dy, l, h, transparente) {
    const ts = this.tampons.get(s), td = this.tampons.get(d);
    if (!ts || !td) return;
    if (sx < 0) { dx -= sx; l += sx; sx = 0; }
    if (sy < 0) { dy -= sy; h += sy; sy = 0; }
    if (dx < 0) { sx -= dx; l += dx; dx = 0; }
    if (dy < 0) { sy -= dy; h += dy; dy = 0; }
    l = Math.min(l, ts.l - sx, td.l - dx);
    h = Math.min(h, ts.h - sy, td.h - dy);
    if (l <= 0 || h <= 0) return;
    if (ts === td) {
      // (un tampon dans lui-même : par un tampon de passage, la carte graphique ne lisant pas ce qu'elle écrit)
      const tmp = this.tamponDePassage(l, h);
      this.copier(s, sx, sy, tmp.id, 0, 0, l, h, -1);
      this.copier(tmp.id, 0, 0, d, dx, dy, l, h, transparente);
      return;
    }
    const serie = this.serieDe('copies', td, ts);
    const f = this.lot, b = serie.n * F_COPIE;
    f[b] = dx; f[b + 1] = dy; f[b + 2] = dx + l; f[b + 3] = dy + h;
    f[b + 4] = sx - dx; f[b + 5] = sy - dy; f[b + 6] = transparente; f[b + 7] = 0;
    serie.n++;
  }
  tamponDePassage(l, h) {
    const id = -1000;
    let t = this.tampons.get(id);
    if (!t || t.l < l || t.h < h || t.k !== this.kActuel) {
      this.finirLaSerie();
      this.definirTampon(id, Math.max(l, t ? t.l : 0), Math.max(h, t ? t.h : 0));
      t = this.tampons.get(id);
    }
    return t;
  }

  // Des pixels relevés : dans l'atlas de passage (en morceaux s'il le faut), posés comme un sprite. Un
  // repère OP.ECHELLE ou OP.SOURCE juste avant leur donne une image HD : le sprite étiré, le fond du fichier.
  pixels(id, x, y, l, h, o, a) {
    const t = this.tampons.get(id);
    const echelle = this.echelle, source = this.source;
    this.echelle = null; this.source = null;
    if (!t) return;
    let hd = null, ox = x, oy = y, ex = 1, ey = 1, ancre = [0, 0], echelleHD = 1;
    if (echelle && echelle.tampon === id) {
      const s = this.definitions.get(echelle.cle);
      if (s && s.hd && echelle.l > 0 && echelle.h > 0) {
        hd = s.hd; ox = echelle.x; oy = echelle.y; ex = s.largeur / echelle.l; ey = s.hauteur / echelle.h;
        ancre = hd.ancre; echelleHD = hd.echelle;
      }
    } else if (source && source.tampon === id && source.nom) {
      const i = this.imagesHD.get('FICHIER:' + source.nom.toUpperCase());
      if (i) {
        hd = i; ancre = i.ancre; echelleHD = i.echelle;
        ox = source.x - (source.decalage % i.largeur); oy = source.y - Math.floor(source.decalage / i.largeur);
      }
    }
    const gl = this.gl;
    const M = 1024;
    for (let j0 = 0; j0 < h; j0 += M) {
      for (let i0 = 0; i0 < l; i0 += M) {
        const lm = Math.min(M, l - i0), hm = Math.min(M, h - j0);
        let p = this.passage.etageres.placer(lm, hm);
        if (!p) { this.finirLaSerie(); this.passage.etageres.vider(); p = this.passage.etageres.placer(lm, hm); }
        const rg = new Uint8Array(2 * lm * hm);
        for (let j = 0; j < hm; j++) {
          const v = a + (j0 + j) * l + i0, q = a + l * h + (j0 + j) * l + i0;
          for (let i = 0; i < lm; i++) { rg[2 * (j * lm + i)] = o[v + i]; rg[2 * (j * lm + i) + 1] = o[q + i]; }
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.passage.t);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, p[0], p[1], lm, hm, gl.RG, gl.UNSIGNED_BYTE, rg);
        // (l'image HD est posée sur le rectangle des pixels : sa position locale suit ox, oy)
        this.instance(t, x + i0, y + j0, x + i0 + lm, y + j0 + hm, x + i0, y + j0, 1, 1, [p[0], p[1], lm, hm], hd,
          ancre[0] + (x + i0 - ox) * ex * echelleHD, ancre[1] + (y + j0 - oy) * ey * echelleHD, echelleHD, 0, 2, ex, ey);
      }
    }
  }

  // --- montrer -----------------------------------------------------------------------------------
  // Poser la dernière image complète sur le cadre `r` (le rectangle de l'image du jeu, en pixels CSS,
  // relatif à l'élément parent du canevas). Rend vrai si une image a été posée.
  dessiner(r) {
    if (!this.actif || !this.possible) return false;
    this.appliquer();
    const e = this.tampons.get(0);
    if (!e || !this.image) return false;
    const gl = this.gl, c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const L = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== L || c.height !== H) { c.width = L; c.height = H; }
    Object.assign(c.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    if (!this.aMontrer && !this.redessiner) return false;
    this.aMontrer = false;
    this.redessiner = false;
    const t0 = performance.now();
    gl.disable(gl.BLEND);
    // 1. la composition, à ×k
    const k = this.composee;
    if (k.l < e.L || k.h < e.H) {
      k.l = Math.max(k.l, e.L); k.h = Math.max(k.h, e.H);
      gl.activeTexture(gl.TEXTURE10);
      gl.bindTexture(gl.TEXTURE_2D, k.t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, k.l, k.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, k.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, k.t, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, k.fbo);
    gl.viewport(0, 0, e.L, e.H);
    const P = this.composition;
    gl.useProgram(P.p);
    for (let j = 0; j < 3; j++) { gl.activeTexture(gl.TEXTURE7 + j); gl.bindTexture(gl.TEXTURE_2D, e.textures[j]); }
    gl.uniform1i(P.u.u_indice, 7); gl.uniform1i(P.u.u_couleur, 8); gl.uniform1i(P.u.u_transmis, 9); gl.uniform1i(P.u.u_palette, 3);
    gl.uniform3f(P.u.u_modulation, ...this.modulation);
    gl.bindVertexArray(this.vaoVide);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    for (let j = 0; j < 3; j++) { gl.activeTexture(gl.TEXTURE7 + j); gl.bindTexture(gl.TEXTURE_2D, null); }
    // 2. sur le cadre, filtrée
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, L, H);
    const Q = this.affichage;
    gl.useProgram(Q.p);
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, k.t);
    gl.uniform1i(Q.u.u_image, 10);
    gl.uniform2f(Q.u.u_taille, e.L, e.H);
    gl.uniform2f(Q.u.u_texture, k.l, k.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND);
    this.stats.images++;
    this.stats.ms += performance.now() - t0;
    return true;
  }
}

// Pour les essais (depuis la console, `renduHDDeLaPage.comparer(...)`) : l'image composée à ×k, relue,
// comparée à l'image du jeu (indices et palette VGA de la page) au centre de chaque pixel du jeu.
// Rend { pixels, differents, l, h, k } ; sans pack HD, differents doit être 0.
RenduHD.prototype.comparer = function (indices, paletteVGA) {
  const e = this.tampons.get(0);
  if (!e || !this.image) return null;
  const gl = this.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.composee.fbo);
  const rgba = new Uint8Array(e.L * e.H * 4);
  gl.readPixels(0, 0, e.L, e.H, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let differents = 0;
  const k = e.k, c = k >> 1;
  for (let y = 0; y < e.h; y++) {
    for (let x = 0; x < e.l; x++) {
      const i = indices[y * e.l + x], o = ((y * k + c) * e.L + x * k + c) * 4;
      for (let q = 0; q < 3; q++) {
        if (Math.abs(rgba[o + q] - Math.round(paletteVGA[3 * i + q] * 255 / 63)) > 1) { differents++; break; }
      }
    }
  }
  return { pixels: e.l * e.h, differents, l: e.l, h: e.h, k };
};

// De quoi lire un asset (chemin relatif à assets/) dans le paquet des données : rend
// (chemin, texte) → promesse du contenu (texte ou octets), ou null s'il n'y a pas de quoi.
function lecteurDesAssets(paquet) {
  if (!paquet) return null;
  const decoder = (octets, texte) => (texte ? new TextDecoder().decode(octets) : octets);
  if (paquet.genre === 'url') {
    const base = paquet.base.endsWith('/') ? paquet.base : paquet.base + '/';
    const place = paquet.disposition === 'distribution' ? cheminDansLaDistribution : (c) => c;
    return async (c, texte) => {
      const r = await fetch(base + place(c).split('/').map(encodeURIComponent).join('/'), { cache: 'no-cache' });
      if (!r.ok) return null;
      return decoder(new Uint8Array(await r.arrayBuffer()), texte);
    };
  }
  if (paquet.genre === 'compagnons' && paquet.lireAsset) {
    return async (c, texte) => {
      let octets;
      try { octets = paquet.lireAsset(c); } catch (err) { return null; }
      return decoder(octets, texte);
    };
  }
  return null;
}
