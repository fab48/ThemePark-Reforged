// L'affichage : l'image du jeu (des indices de couleur, 320x200 ou 640x480) et sa palette, agrandies
// à la taille de la fenêtre.
//
// Par WebGL2, la carte graphique reçoit les indices tels quels et la palette à part, et c'est le
// nuanceur qui colore et agrandit, en deux passes : les couleurs d'abord, à la taille de l'image
// (la palette, la traînée des animations, et Scale2x pour le rendu « lissé »), dans une texture ;
// puis l'agrandissement, pixel de l'écran par pixel de l'écran, qui ne lit plus que cette texture (en
// une passe, chaque pixel de l'écran refaisait la palette et la traînée de ses quatre voisins, et
// Scale2x de chacun : 28 lectures de texture par pixel, en 4K). Six rendus :
//  - « pixels nets » : chaque pixel du jeu reste un rectangle franc ; seul le liseré entre deux pixels
//    voisins est adouci, sur la largeur d'un pixel de l'écran au plus (« sharp bilinear »). La taille
//    des pixels reste ainsi égale à tout agrandissement, même fractionnaire, et même avec
//    l'étirement 4:3 du 320x200 (1,2 en hauteur), qui donnait des lignes inégales en pixels bruts ;
//  - « lissé » : les bords obliques sont d'abord adoucis par Scale2x (EPX), calculé sur les indices
//    de couleur, donc sans mélange de teintes ; l'image doublée est ensuite agrandie comme ci-dessus ;
//  - « lissé anticrénelé » : Scale2x, puis xBR sur l'image doublée : des courbes plus rondes que xBR
//    seul, sans les marches de deux pixels du lissé ;
//  - « anticrénelé » : xBR (niveau 2), qui suit les bords obliques et les fond sur la largeur d'un
//    pixel de l'écran, à toute échelle ; les bords droits restent nets, adoucis comme ci-dessus ;
//  - « xBRZ » : le successeur de xBR (Zenju), qui suit mieux les lignes et les coins, sans inventer de
//    couleur, net et sans pixels visibles, à toute échelle ;
//  - « brut » : le plus proche voisin, en facteur entier quand l'image tient, comme avant.
// Sans WebGL2, un canevas 2D fait le rendu brut.

import { estPartagee } from './memoire-partagee.js';

const NUANCEUR_SOMMETS = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2(gl_VertexID & 1, gl_VertexID >> 1);   // un carré en bande de deux triangles
  uv = vec2(p.x, 1.0 - p.y);                          // la ligne 0 de l'image est en haut
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Scale2x, sur une fonction `uint indice(ivec2)` que le nuanceur définit : le pixel q de l'image
// doublée. P est le pixel d'origine, A, B, C, D ses voisins du haut, de droite, de gauche et du bas ;
// un coin prend la couleur de ses deux voisins s'ils sont égaux entre eux et différents des deux autres.
const GLSL_SCALE2X = `
uint scale2x(ivec2 q) {
  ivec2 p = q >> 1, s = q & 1;
  uint P = indice(p);
  uint A = indice(p + ivec2(0, -1)), B = indice(p + ivec2(1, 0));
  uint C = indice(p + ivec2(-1, 0)), D = indice(p + ivec2(0, 1));
  if (s.y == 0) {
    if (s.x == 0) return (C == A && C != D && A != B) ? A : P;
    return (A == B && A != C && B != D) ? B : P;
  }
  if (s.x == 0) return (D == C && D != B && C != A) ? C : P;
  return (B == D && B != A && D != C) ? D : P;
}`;

// xBR, niveau 2 (l'algorithme de Hyllian, 2011) : pour chacun des quatre coins du pixel E, une règle
// décide si un bord oblique passe par ce coin (à 45°, et à 30° ou 60° au niveau 2), d'après les écarts
// de luminance dans le voisinage 5x5 (sans ses coins) ; le coin prend alors la couleur du voisin de
// l'autre côté du bord, fondue sur la largeur d'un pixel de l'écran : c'est l'anticrénelage. Les quatre
// coins vont ensemble, un par composante des vecteurs (x : en bas à droite, y : en haut à droite, z : en
// haut à gauche, w : en bas à gauche), le voisinage tourné d'un quart de tour de l'un à l'autre :
//            A1 B1 C1
//         A0  A  B  C  C4
//         D0  D  E  F  F4
//         G0  G  H  I  I4
//            G5 H5 I5
// Pour le coin x, le bord va de H à F : E diffère de F et de H, et les écarts le long du bord (wd1)
// sont plus petits qu'en travers (wd2). Un coin carré (F = B, H = D : un bord droit qui tourne) n'est
// arrondi que si la diagonale se prolonge (E = I, E = G ou E = C : « CORNER_B »).
// En deux temps, comme les xBR à plusieurs passes : les règles, qui ne dépendent que du voisinage,
// une fois par pixel de l'image (NUANCEUR_BORDS : cinq bits par coin) ; puis, pour chaque pixel de
// l'écran, le fondu au point visé, qui ne lit plus que les règles de E et cinq couleurs.
const GLSL_XBR_REGLES = `
const float XBR_SEUIL = 0.3;         // deux luminances à moins de 0,3 l'une de l'autre sont « égales »
vec4 xbrEcart(vec4 a, vec4 b) { return abs(a - b); }
vec4 xbrEgal(vec4 a, vec4 b) { return step(xbrEcart(a, b), vec4(XBR_SEUIL)); }
vec4 xbrInegal(vec4 a, vec4 b) { return 1.0 - xbrEgal(a, b); }
vec4 xbrDifferent(vec4 a, vec4 b) { return vec4(notEqual(a, b)); }
vec4 xbrDistance(vec4 a, vec4 b, vec4 c, vec4 d, vec4 e, vec4 f, vec4 g, vec4 h) {
  return xbrEcart(a, b) + xbrEcart(a, c) + xbrEcart(d, e) + xbrEcart(d, f) + 4.0 * xbrEcart(g, h);
}
float luma(ivec2 q) { return dot(texelCouleur(q), vec3(0.299, 0.587, 0.114)); }

// Les règles des quatre coins du pixel o, cinq bits par coin : 1 bord faible à 45°, 2 bord à 45°,
// 4 bord à 30°, 8 bord à 60°, 16 le coin prend F (sinon H ; tournés de même pour les autres coins).
uvec4 reglesXbr(ivec2 o) {
  vec4 b = vec4(luma(o + ivec2(0, -1)), luma(o + ivec2(-1, 0)), luma(o + ivec2(0, 1)), luma(o + ivec2(1, 0)));
  vec4 c = vec4(luma(o + ivec2(1, -1)), luma(o + ivec2(-1, -1)), luma(o + ivec2(-1, 1)), luma(o + ivec2(1, 1)));
  vec4 e = vec4(luma(o));
  vec4 d = b.yzwx, f = b.wxyz, g = c.zwxy, h = b.zwxy, i = c.wxyz;
  vec4 i4 = vec4(luma(o + ivec2(2, 1)), luma(o + ivec2(1, -2)), luma(o + ivec2(-2, -1)), luma(o + ivec2(-1, 2)));
  vec4 i5 = vec4(luma(o + ivec2(1, 2)), luma(o + ivec2(2, -1)), luma(o + ivec2(-1, -2)), luma(o + ivec2(-2, 1)));
  vec4 h5 = vec4(luma(o + ivec2(0, 2)), luma(o + ivec2(2, 0)), luma(o + ivec2(0, -2)), luma(o + ivec2(-2, 0)));
  vec4 f4 = h5.yzwx;
  vec4 regle0 = xbrDifferent(e, f) * xbrDifferent(e, h);
  vec4 regle1 = regle0 * (xbrInegal(f, b) * xbrInegal(h, d) + xbrEgal(e, i) * xbrInegal(f, i4) * xbrInegal(h, i5)
    + xbrEgal(e, g) + xbrEgal(e, c));
  vec4 regle30 = xbrDifferent(e, g) * xbrDifferent(d, g);
  vec4 regle60 = xbrDifferent(e, c) * xbrDifferent(b, c);
  vec4 wd1 = xbrDistance(e, c, g, i, h5, f4, h, f);
  vec4 wd2 = xbrDistance(h, d, i5, f, i4, b, e, i);
  vec4 bordFaible = step(wd1, wd2) * regle0;
  vec4 bord = step(wd1 + 0.1, wd2) * step(0.5, regle1);
  vec4 bord30 = step(2.0 * xbrEcart(f, g), xbrEcart(h, c)) * regle30 * bord;
  vec4 bord60 = step(2.0 * xbrEcart(h, c), xbrEcart(f, g)) * regle60 * bord;
  vec4 px = step(xbrEcart(e, f), xbrEcart(e, h));
  return uvec4(bordFaible + 2.0 * bord + 4.0 * bord30 + 8.0 * bord60 + 16.0 * px);
}`;

// L'agrandissement net (« sharp bilinear ») et xBR, sur les fonctions `vec3 texelCouleur(ivec2)` et
// `uvec4 texelRegles(ivec2)` que le nuanceur définit (les couleurs de la première passe, les règles
// de NUANCEUR_BORDS) ; pos est un point de l'image, en texels (0 au coin haut gauche), k les pixels
// de l'écran par texel.
const GLSL_AGRANDIR = `
vec3 net(vec2 pos, vec2 k) {
  vec2 c = pos - 0.5;
  vec2 i = floor(c);
  vec2 f = clamp((c - i - 0.5) * k + 0.5, 0.0, 1.0);
  ivec2 a = ivec2(i);
  vec3 haut = mix(texelCouleur(a), texelCouleur(a + ivec2(1, 0)), f.x);
  vec3 bas = mix(texelCouleur(a + ivec2(0, 1)), texelCouleur(a + ivec2(1, 1)), f.x);
  return mix(haut, bas, f.y);
}

const vec4 XBR_A = vec4(1.0, -1.0, -1.0, 1.0);
const vec4 XBR_B45 = vec4(1.0, 1.0, -1.0, -1.0), XBR_C45 = vec4(1.5, 0.5, -0.5, 0.5);
const vec4 XBR_B30 = vec4(0.5, 2.0, -0.5, -2.0), XBR_C30 = vec4(1.0, 1.0, -0.5, 0.0);
const vec4 XBR_B60 = vec4(2.0, 0.5, -2.0, -0.5), XBR_C60 = vec4(2.0, 0.0, -1.0, 0.5);

// xBR au point pos (s : pixels de l'écran par texel, pour la largeur du fondu)
vec3 xbr(vec2 pos, float s) {
  ivec2 o = ivec2(floor(pos));
  vec2 fp = pos - vec2(o);
  uvec4 r = texelRegles(o);
  vec4 bordFaible = vec4(r & 1u), bord = vec4((r >> 1) & 1u), bord30 = vec4((r >> 2) & 1u);
  vec4 bord60 = vec4((r >> 3) & 1u), px = vec4((r >> 4) & 1u);
  vec3 E = texelCouleur(o);
  if (((r.x | r.y | r.z | r.w) & 15u) == 0u) return E;       // (aucun bord : E, sans rien lire de plus)
  vec3 B = texelCouleur(o + ivec2(0, -1)), D = texelCouleur(o + ivec2(-1, 0));
  vec3 F = texelCouleur(o + ivec2(1, 0)), H = texelCouleur(o + ivec2(0, 1));
  // les droites des bords (45°, 30°, 60°) au point fp du pixel E, et le fondu sur la largeur d'un
  // pixel de l'écran de part et d'autre
  vec4 fx45 = XBR_A * fp.y + XBR_B45 * fp.x;
  vec4 fx30 = XBR_A * fp.y + XBR_B30 * fp.x;
  vec4 fx60 = XBR_A * fp.y + XBR_B60 * fp.x;
  vec4 delta = vec4(1.0 / s);
  vec4 delta30 = vec4(0.5, 1.0, 0.5, 1.0) / s, delta60 = delta30.yxwz;
  vec4 part45i = clamp((fx45 + delta - XBR_C45 - 0.25) / (2.0 * delta), 0.0, 1.0) * bordFaible;
  vec4 part45 = clamp((fx45 + delta - XBR_C45) / (2.0 * delta), 0.0, 1.0) * bord;
  vec4 part30 = clamp((fx30 + delta30 - XBR_C30) / (2.0 * delta30), 0.0, 1.0) * bord30;
  vec4 part60 = clamp((fx60 + delta60 - XBR_C60) / (2.0 * delta60), 0.0, 1.0) * bord60;
  vec4 part = max(max(part30, part60), max(part45, part45i));
  // le coin prend celui de ses deux voisins le plus proche de E ; des deux paires de coins opposés, le
  // résultat qui s'écarte le plus de E l'emporte
  vec3 r1 = mix(E, mix(H, F, px.x), part.x);
  r1 = mix(r1, mix(B, D, px.z), part.z);
  vec3 r2 = mix(E, mix(F, B, px.y), part.y);
  r2 = mix(r2, mix(D, H, px.w), part.w);
  return dot(abs(E - r1), vec3(1.0)) <= dot(abs(E - r2), vec3(1.0)) ? r2 : r1;
}

// xBR à toute échelle : le pixel de l'écran couvre [pos − ½/k, pos + ½/k] de l'image ; s'il passe la
// frontière de deux pixels de l'image, chaque part est évaluée en son milieu et comptée pour sa
// surface (sans quoi, agrandis d'un facteur fractionnaire, les pixels de l'image auraient à l'écran
// des largeurs inégales, comme en rendu brut).
vec3 anticrenele(vec2 pos, vec2 k) {
  vec2 h = 0.5 / k;
  vec2 a = pos - h, b = pos + h;
  vec2 frontiere = floor(b);
  bvec2 coupe = greaterThan(frontiere, a);
  vec2 wa = mix(vec2(1.0), (frontiere - a) / (b - a), vec2(coupe));
  vec2 ma = mix(pos, 0.5 * (a + frontiere), vec2(coupe)), mb = 0.5 * (frontiere + b);
  float s = 0.5 * (k.x + k.y);
  vec3 r = xbr(ma, s) * (wa.x * wa.y);
  if (coupe.x) r += xbr(vec2(mb.x, ma.y), s) * ((1.0 - wa.x) * wa.y);
  if (coupe.y) r += xbr(vec2(ma.x, mb.y), s) * (wa.x * (1.0 - wa.y));
  if (coupe.x && coupe.y) r += xbr(mb, s) * ((1.0 - wa.x) * (1.0 - wa.y));
  return r;
}`;

// xBRZ (Zenju, 2012-2016 ; le successeur de xBR, retour 51 de docs/demandes.md), à toute échelle comme
// ci-dessus. Deux temps aussi. Les règles : chaque bloc 2 × 2 de l'image (f g / j k, dans son voisinage
// 4 × 4) donne un type de fondu (0 aucun, 1 normal, 2 dominant) aux coins intérieurs de deux de ses
// pixels, ceux de la diagonale la moins marquée, d'après les écarts de couleur (YCbCr) le long des deux
// diagonales ; chaque pixel reçoit ainsi les types de ses quatre coins, un par composante (x : en bas à
// droite, y : en haut à droite, z : en haut à gauche, w : en bas à gauche, comme xBR). Puis le fondu, pour
// chaque point de l'écran : chaque coin marqué du pixel E prend, derrière une droite, la couleur du plus
// proche de ses deux voisins F et H — une droite à 45° qui coupe le coin (fondu d'angle), ou, si le
// voisinage forme une ligne, à 45°, douce (1:2) ou raide (2:1) selon les écarts F–G et H–C ; fondue sur la
// largeur d'un pixel de l'écran. Les seuils de Zenju : deux couleurs à moins de 30/255 sont égales, une
// direction est dominante à 3,6 fois, raide à 2,2 fois. Les quatre coins sont un seul coin bas droit,
// retourné (les règles sont symétriques).
const GLSL_XBRZ_REGLES = `
float xbrzDistance(vec3 a, vec3 b) {
  const vec3 w = vec3(0.2627, 0.6780, 0.0593);
  vec3 d = a - b;
  float y = dot(d, w);
  float cb = 0.5 / (1.0 - w.b) * (d.b - y), cr = 0.5 / (1.0 - w.r) * (d.r - y);
  return sqrt(y * y + cb * cb + cr * cr);
}
// Le bloc dont le coin haut gauche est q : (coin bas droit de f, bas gauche de g, haut droit de j, haut
// gauche de k), avec f = q, g = q + (1, 0), j = q + (0, 1), k = q + (1, 1).
uvec4 xbrzBloc(ivec2 q) {
  vec3 b = texelCouleur(q + ivec2(0, -1)), c = texelCouleur(q + ivec2(1, -1));
  vec3 e = texelCouleur(q + ivec2(-1, 0)), f = texelCouleur(q), g = texelCouleur(q + ivec2(1, 0)), h = texelCouleur(q + ivec2(2, 0));
  vec3 i = texelCouleur(q + ivec2(-1, 1)), j = texelCouleur(q + ivec2(0, 1)), k = texelCouleur(q + ivec2(1, 1)), l = texelCouleur(q + ivec2(2, 1));
  vec3 n = texelCouleur(q + ivec2(0, 2)), o = texelCouleur(q + ivec2(1, 2));
  uvec4 r = uvec4(0u);
  if ((f == g && j == k) || (f == j && g == k)) return r;
  float jg = xbrzDistance(i, f) + xbrzDistance(f, c) + xbrzDistance(n, k) + xbrzDistance(k, h) + 4.0 * xbrzDistance(j, g);
  float fk = xbrzDistance(e, j) + xbrzDistance(j, o) + xbrzDistance(b, g) + xbrzDistance(g, l) + 4.0 * xbrzDistance(f, k);
  if (jg < fk) {
    uint t = 3.6 * jg < fk ? 2u : 1u;
    if (f != g && f != j) r.x = t;
    if (k != j && k != g) r.w = t;
  } else if (fk < jg) {
    uint t = 3.6 * fk < jg ? 2u : 1u;
    if (j != f && j != k) r.z = t;
    if (g != f && g != k) r.y = t;
  }
  return r;
}
uvec4 reglesXbrz(ivec2 o) {
  return uvec4(xbrzBloc(o).x, xbrzBloc(o - ivec2(0, 1)).z, xbrzBloc(o - ivec2(1, 1)).w, xbrzBloc(o - ivec2(1, 0)).y);
}`;

// Le fondu de xBRZ, sur `texelCouleur` et `texelRegles` (voir GLSL_AGRANDIR) ; s : pixels de l'écran par
// texel. (Le coin bas droit ; les trois autres par symétrie : leurs voisins retournés, le point aussi.)
const GLSL_XBRZ = `
bool xbrzEgal(vec3 a, vec3 b) { return xbrzDistance(a, b) < 30.0 / 255.0; }
// La part du point q (dans le pixel, de −0,5 à 0,5, repère du coin bas droit) derrière la droite passant
// par \`origine\` de direction \`dir\`, du côté du coin, fondue sur la largeur d'un pixel de l'écran.
float xbrzPart(vec2 q, vec2 origine, vec2 dir, float s) {
  vec2 p0 = q - origine;
  vec2 ecart = p0 - dir * (dot(p0, dir) / dot(dir, dir));
  float v = sign(dot(p0, vec2(-dir.y, dir.x))) * length(ecart) * s;
  return smoothstep(-0.7071, 0.7071, v);
}
// Un coin de E : t son type, tHd et tBg ceux des coins voisins (en haut à droite et en bas à gauche, dans
// le repère du coin), b c / d e f / g h i le voisinage retourné.
vec3 xbrzCoin(uint t, uint tHd, uint tBg, vec3 b, vec3 c, vec3 d, vec3 e, vec3 f, vec3 g, vec3 h, vec3 i,
    vec2 q, vec3 res, float s) {
  if (t == 0u) return res;
  bool ligne = t == 2u || !((tHd != 0u && !xbrzEgal(e, g)) || (tBg != 0u && !xbrzEgal(e, c))
    || (xbrzEgal(g, h) && xbrzEgal(h, i) && xbrzEgal(i, f) && xbrzEgal(f, c) && !xbrzEgal(e, i)));
  vec2 origine = vec2(0.0, 0.7071), dir = vec2(1.0, -1.0);
  if (ligne) {
    float fg = xbrzDistance(f, g), hc = xbrzDistance(h, c);
    bool douce = 2.2 * fg <= hc && e != g && d != g;
    bool raide = 2.2 * hc <= fg && e != c && b != c;
    origine = vec2(0.0, douce ? 0.25 : 0.5);
    dir = vec2(douce ? 2.0 : 1.0, raide ? -2.0 : -1.0);
  }
  vec3 px = xbrzDistance(e, f) <= xbrzDistance(e, h) ? f : h;
  return mix(res, px, xbrzPart(q, origine, dir, s));
}
vec3 xbrz(vec2 pos, float s) {
  ivec2 o = ivec2(floor(pos));
  vec3 E = texelCouleur(o);
  uvec4 r = texelRegles(o);
  if (r == uvec4(0u)) return E;
  vec2 q = pos - vec2(o) - 0.5;
  vec3 A = texelCouleur(o + ivec2(-1, -1)), B = texelCouleur(o + ivec2(0, -1)), C = texelCouleur(o + ivec2(1, -1));
  vec3 D = texelCouleur(o + ivec2(-1, 0)), F = texelCouleur(o + ivec2(1, 0));
  vec3 G = texelCouleur(o + ivec2(-1, 1)), H = texelCouleur(o + ivec2(0, 1)), I = texelCouleur(o + ivec2(1, 1));
  vec3 res = E;
  res = xbrzCoin(r.x, r.y, r.w, B, C, D, E, F, G, H, I, q, res, s);
  res = xbrzCoin(r.w, r.z, r.x, B, A, F, E, D, I, H, G, vec2(-q.x, q.y), res, s);
  res = xbrzCoin(r.y, r.x, r.z, H, I, D, E, F, A, B, C, vec2(q.x, -q.y), res, s);
  res = xbrzCoin(r.z, r.w, r.y, H, G, F, E, D, C, B, A, -q, res, s);
  return res;
}
// À toute échelle, comme anticrenele (plus haut).
vec3 anticreneleXbrz(vec2 pos, vec2 k) {
  vec2 h = 0.5 / k;
  vec2 a = pos - h, b = pos + h;
  vec2 frontiere = floor(b);
  bvec2 coupe = greaterThan(frontiere, a);
  vec2 wa = mix(vec2(1.0), (frontiere - a) / (b - a), vec2(coupe));
  vec2 ma = mix(pos, 0.5 * (a + frontiere), vec2(coupe)), mb = 0.5 * (frontiere + b);
  float s = 0.5 * (k.x + k.y);
  vec3 r = xbrz(ma, s) * (wa.x * wa.y);
  if (coupe.x) r += xbrz(vec2(mb.x, ma.y), s) * ((1.0 - wa.x) * wa.y);
  if (coupe.y) r += xbrz(vec2(ma.x, mb.y), s) * (wa.x * (1.0 - wa.y));
  if (coupe.x && coupe.y) r += xbrz(mb, s) * ((1.0 - wa.x) * (1.0 - wa.y));
  return r;
}`;

// LES BORDS : les règles de xBR pour chaque pixel d'une texture de couleurs, `decalage` et
// `tailleUtile` disant où elle en a (celle de l'image a une marge d'un texel : décalage 1).
const NUANCEUR_BORDS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D couleurs;
uniform ivec2 decalage, tailleUtile;
out uvec4 regles;
vec3 texelCouleur(ivec2 q) { return texelFetch(couleurs, clamp(q + decalage, ivec2(0), tailleUtile - 1), 0).rgb; }
${GLSL_XBR_REGLES}
void main() { regles = reglesXbr(ivec2(gl_FragCoord.xy) - decalage); }`;
// Les règles de xBRZ, de même.
const NUANCEUR_BORDS_XBRZ = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D couleurs;
uniform ivec2 decalage, tailleUtile;
out uvec4 regles;
vec3 texelCouleur(ivec2 q) { return texelFetch(couleurs, clamp(q + decalage, ivec2(0), tailleUtile - 1), 0).rgb; }
${GLSL_XBRZ_REGLES}
void main() { regles = reglesXbrz(ivec2(gl_FragCoord.xy) - decalage); }`;

// PREMIÈRE PASSE : les couleurs de l'image, dans une texture (avec une marge d'un texel tout autour :
// le texel (0, 0) est le pixel (−1, −1), que l'agrandissement lit au bord, comme la passe unique
// d'avant le lisait).
const NUANCEUR_COULEURS = `#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D indices;   // l'image du jeu : un indice de couleur par pixel
uniform sampler2D palette;          // 256 couleurs, sur une ligne
uniform sampler2D trainee;          // la traînée des attractions (façon « ×2 », animations-intercalees.js)
uniform bool avecTrainee;
uniform vec2 taille;                // largeur et hauteur de l'image du jeu
uniform bool lisse;                 // l'image doublée par Scale2x
out vec4 couleur;

uint indice(ivec2 p) {
  p = clamp(p, ivec2(0), ivec2(taille) - 1);
  return texelFetch(indices, p, 0).r;
}
vec3 teinte(uint i) { return texelFetch(palette, ivec2(int(i), 0), 0).rgb; }
// La couleur du pixel p de l'image du jeu, la traînée mêlée par-dessus (RGBA, alpha droit).
vec3 teinteEn(ivec2 p, uint i) {
  vec3 c = teinte(i);
  if (!avecTrainee) return c;
  vec4 t = texelFetch(trainee, clamp(p, ivec2(0), ivec2(taille) - 1), 0);
  return mix(c, t.rgb, t.a);
}
${GLSL_SCALE2X}

void main() {
  ivec2 q = ivec2(gl_FragCoord.xy) - 1;
  couleur = vec4(lisse ? teinteEn(q >> 1, scale2x(q)) : teinteEn(q, indice(q)), 1.0);
}`;

// SECONDE PASSE : l'agrandissement.
const NUANCEUR_PIXELS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D couleurs;         // la première passe
uniform highp usampler2D regles;    // les règles de xBR (NUANCEUR_BORDS), en rendu anticrénelé
uniform vec2 grille;                // sa taille utile : l'image du jeu, ou l'image doublée (lissé)
uniform vec2 sortie;                // pixels de l'écran occupés par l'image
uniform int rendu;                  // 0 brut, 1 pixels nets (et lissé), 3 anticrénelé (xBR, et lissé anticrénelé), 5 xBRZ
in vec2 uv;
out vec4 couleur;

vec3 texelCouleur(ivec2 q) { return texelFetch(couleurs, clamp(q, ivec2(-1), ivec2(grille)) + 1, 0).rgb; }
uvec4 texelRegles(ivec2 q) { return texelFetch(regles, clamp(q, ivec2(-1), ivec2(grille)) + 1, 0); }
${GLSL_AGRANDIR}
${GLSL_XBRZ_REGLES}
${GLSL_XBRZ}

void main() {
  vec2 p = uv * grille;
  if (rendu == 0) { couleur = vec4(texelCouleur(ivec2(p)), 1.0); return; }
  vec2 k = sortie / grille;
  couleur = vec4(rendu == 5 ? anticreneleXbrz(p, k) : rendu == 3 ? anticrenele(p, k) : net(p, k), 1.0);
}`;

// LA COMPOSITION DU ZOOM (moteur/web/zoom.js) : en grande vue zoomée, le parc à l'échelle du cran,
// l'interface à taille fixe, le curseur par-dessus. Pour chaque pixel du cadre : le curseur ; sinon la
// première région de l'interface dont le pixel du jeu, par sa transformation, porte l'étiquette ;
// sinon le parc. Le parc est pris dans une mosaïque du monde gardée dans la carte graphique (la vue
// seule de chaque image y est recollée à sa place, 4096 de côté, adressée modulo, comme celle du
// défilement fluide, defilement-fluide.js) : sous l'interface, qui est montrée ailleurs, c'est le
// parc ; et pendant une glisse du défilement fluide, la vue y est simplement lue décalée, sans rien
// recomposer. Ce que l'image a de plus que la vue seule hors des régions (les marques de la case
// visée, l'aperçu de l'outil) est montré à sa place, comme par le défilement fluide. Les régions sont
// agrandies « pixels nets » (sauf en rendu brut) : les écarts ne durent qu'un pixel ; le parc, dans le
// rendu choisi (lissé et anticrénelé compris), depuis ses couleurs, que calcule une première passe
// (NUANCEUR_MONDE) sur la portion du monde qu'il montre.
const REGIONS_MAX = 16, COTE_MOSAIQUE = 4096;
const NUANCEUR_MONDE = `#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D mosaique;  // le monde : les vues seules recollées, modulo 4096
uniform sampler2D palette;
uniform sampler2D trainee;          // la traînée (façon « ×2 »), aux coordonnées de l'image publiée
uniform bool avecTrainee;
uniform ivec2 taille;               // W, H
uniform ivec2 cible;                // la position de la vue de l'image dans le monde
uniform ivec2 origine;              // le point du monde (de la grille doublée, en lissé) du texel (0, 0)
uniform bool lisse;
out vec4 couleur;

vec3 teinte(uint i) { return texelFetch(palette, ivec2(int(i), 0), 0).rgb; }
uint indice(ivec2 w) { return texelFetch(mosaique, w & ${COTE_MOSAIQUE - 1}, 0).r; }
// La couleur du monde en w, la traînée mêlée par-dessus : elle est aux coordonnées de l'image publiée,
// dont la vue est en « cible » du monde.
vec3 teinteDuMonde(ivec2 w, uint i) {
  vec3 c = teinte(i);
  if (!avecTrainee) return c;
  ivec2 q = w - cible;
  if (any(lessThan(q, ivec2(0))) || any(greaterThanEqual(q, taille))) return c;
  vec4 t = texelFetch(trainee, q, 0);
  return mix(c, t.rgb, t.a);
}
${GLSL_SCALE2X}

void main() {
  ivec2 q = origine + ivec2(gl_FragCoord.xy);
  couleur = vec4(lisse ? teinteDuMonde(q >> 1, scale2x(q)) : teinteDuMonde(q, indice(q)), 1.0);
}`;

const NUANCEUR_COMPOSITION = `#version 300 es
precision highp float;
precision highp int;
uniform highp usampler2D image;     // l'image publiée, sans le curseur
uniform highp usampler2D mosaique;  // le monde : les vues seules recollées, modulo 4096
uniform highp usampler2D etiquettes;// 0 le parc, k + 1 la région k
uniform highp usampler2D curseur;   // l'image du curseur, 0xFE transparent
uniform sampler2D palette;
uniform sampler2D couleursDuMonde;  // la première passe : les couleurs du parc montré
uniform highp usampler2D reglesDuMonde; // leurs règles de xBR (NUANCEUR_BORDS), en rendu anticrénelé
uniform ivec2 origineDuMonde;       // le point du monde (de la grille doublée, en lissé) de son texel (0, 0)
uniform ivec2 tailleDuMonde;
uniform ivec2 taille;               // W, H
uniform ivec2 cible;                // la position de la vue de l'image dans le monde
uniform vec2 glisse;                // la position montrée (défilement fluide), moins la cible
uniform vec2 cadre;                 // en pixels de l'écran
uniform float u, p;                 // pixels de l'écran par pixel du jeu : l'interface, le parc
uniform vec2 decalage;              // le coin de la portion du parc montrée (zoom avant), pixels du jeu
uniform int n;
uniform ivec4 rect[${REGIONS_MAX}];
uniform vec2 origine[${REGIONS_MAX}];
uniform int etendre[${REGIONS_MAX}];
uniform vec2 posCurseur;            // pixels de l'écran
uniform ivec2 tailleCurseur;
uniform int rendu;                  // 0 brut, 1 pixels nets, 2 lissé, 3 anticrénelé, 4 lissé anticrénelé, 5 xBRZ
in vec2 uv;
out vec4 couleur;

vec3 teinte(uint i) { return texelFetch(palette, ivec2(int(i), 0), 0).rgb; }
uint indiceImage(ivec2 q) { return texelFetch(image, clamp(q, ivec2(0), taille - 1), 0).r; }
uint etiquette(ivec2 q) { return texelFetch(etiquettes, clamp(q, ivec2(0), taille - 1), 0).r; }
uint monde(ivec2 w) { return texelFetch(mosaique, w & ${COTE_MOSAIQUE - 1}, 0).r; }
// la couleur du parc au texel q de la première passe
vec3 texelCouleur(ivec2 q) { return texelFetch(couleursDuMonde, clamp(q, ivec2(0), tailleDuMonde - 1), 0).rgb; }
uvec4 texelRegles(ivec2 q) { return texelFetch(reglesDuMonde, clamp(q, ivec2(0), tailleDuMonde - 1), 0); }
${GLSL_AGRANDIR}
${GLSL_XBRZ_REGLES}
${GLSL_XBRZ}
// L'agrandissement autour de pos (en texels), k pixels de l'écran par texel : net, ou le plus proche.
vec2 fraction(vec2 pos, float k, out ivec2 a) {
  vec2 c = pos - 0.5;
  vec2 i = floor(c);
  a = ivec2(i);
  return rendu != 0 ? clamp((c - i - 0.5) * k + 0.5, 0.0, 1.0) : step(0.5, c - i);
}
vec3 couleurDuParc(vec2 f) {
  vec2 q = f / p + decalage;
  // les marques posées sur la vue hors de l'interface, à leur place dans l'image
  ivec2 qi = ivec2(floor(q));
  if (qi.x < taille.x && qi.y < taille.y && etiquette(qi) == 0u) {
    uint i = indiceImage(qi);
    if (i != monde(cible + qi)) return teinte(i);
  }
  // le parc, depuis ses couleurs (en lissé, la grille doublée)
  float g = rendu == 2 || rendu == 4 ? 2.0 : 1.0;
  vec2 w = (vec2(cible) + glisse + q) * g - vec2(origineDuMonde);
  if (rendu == 3 || rendu == 4) return anticrenele(w, vec2(p / g));
  if (rendu == 5) return anticreneleXbrz(w, vec2(p));
  ivec2 a;
  vec2 t = fraction(w, p / g, a);
  vec3 haut = mix(texelCouleur(a), texelCouleur(a + ivec2(1, 0)), t.x);
  vec3 bas = mix(texelCouleur(a + ivec2(0, 1)), texelCouleur(a + ivec2(1, 1)), t.x);
  return mix(haut, bas, t.y);
}
// Un pixel voisin dans la région k (étiquette e) : le sien, ou celui du centre s'il n'en est pas.
vec3 regionOu(ivec2 q, uint e, vec3 centre, int k) {
  if (etendre[k] != 0) q.x = clamp(q.x, rect[k].x, rect[k].z - 1);
  if (etiquette(q) != e) return centre;
  return teinte(indiceImage(q));
}

void main() {
  vec2 f = uv * cadre;
  // le curseur
  ivec2 c = ivec2(floor((f - posCurseur) / u));
  if (all(greaterThanEqual(c, ivec2(0))) && all(lessThan(c, tailleCurseur))) {
    uint i = texelFetch(curseur, c, 0).r;
    if (i != 0xFEu) { couleur = vec4(teinte(i), 1.0); return; }
  }
  for (int k = 0; k < ${REGIONS_MAX}; k++) {
    if (k >= n) break;
    vec2 pos = (f - origine[k]) / u;
    ivec2 q = ivec2(floor(pos));
    if (etendre[k] != 0) q.x = clamp(q.x, rect[k].x, rect[k].z - 1);
    if (q.x < rect[k].x || q.y < rect[k].y || q.x >= rect[k].z || q.y >= rect[k].w) continue;
    uint e = uint(k + 1);
    if (etiquette(q) != e) continue;
    vec3 centre = teinte(indiceImage(q));
    ivec2 a;
    vec2 t = fraction(pos, u, a);
    vec3 haut = mix(regionOu(a, e, centre, k), regionOu(a + ivec2(1, 0), e, centre, k), t.x);
    vec3 bas = mix(regionOu(a + ivec2(0, 1), e, centre, k), regionOu(a + ivec2(1, 1), e, centre, k), t.x);
    couleur = vec4(mix(haut, bas, t.y), 1.0);
    return;
  }
  couleur = vec4(couleurDuParc(f), 1.0);
}`;

export const RENDUS = ['net', 'lisse', 'lissexbr', 'xbr', 'xbrz', 'brut'];
export const NOMS_DES_RENDUS = { net: 'pixels nets', lisse: 'lissé', lissexbr: 'lissé anticrénelé', xbr: 'anticrénelé',
  xbrz: 'xBRZ', brut: 'brut' };
// le rendu, pour les nuanceurs (lissé : pixels nets sur l'image doublée, et lissé anticrénelé : xBR sur
// l'image doublée, sauf dans la composition, qui a leurs propres codes)
const CODES_DES_RENDUS = { brut: 0, net: 1, lisse: 2, xbr: 3, lissexbr: 4, xbrz: 5 };
const RENDUS_DOUBLES = ['lisse', 'lissexbr'];        // la première passe double l'image par Scale2x
const REGLES_DES_RENDUS = { xbr: 'xbr', lissexbr: 'xbr', xbrz: 'xbrz' };   // la passe des règles

// Le rectangle où poser l'image : le plus grand qui tient dans la zone, au rapport 4:3 du moniteur
// (le 320x200 était étiré de 1,2 en hauteur) ; en rendu brut, un facteur entier quand l'image tient.
function dimensions(zone, l, h, rendu) {
  const hauteurAffichee = l === 320 ? h * 1.2 : h;
  let k = Math.min(zone.width / l, zone.height / hauteurAffichee);
  if (rendu === 'brut' && k >= 1) k = Math.floor(k);
  return { largeur: l * k, hauteur: hauteurAffichee * k };
}

function compiler(gl, type, source) {
  const n = gl.createShader(type);
  gl.shaderSource(n, source);
  gl.compileShader(n);
  if (!gl.getShaderParameter(n, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(n));
  return n;
}

// Un programme (le nuanceur de sommets commun, celui des pixels donné) et ses uniformes, nommés.
function programmer(gl, source, noms) {
  const programme = gl.createProgram();
  gl.attachShader(programme, compiler(gl, gl.VERTEX_SHADER, NUANCEUR_SOMMETS));
  gl.attachShader(programme, compiler(gl, gl.FRAGMENT_SHADER, source));
  gl.linkProgram(programme);
  if (!gl.getProgramParameter(programme, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(programme));
  const u = {};
  for (const nom of noms) u[nom] = gl.getUniformLocation(programme, nom);
  return { programme, u };
}

// L'affichage par WebGL2. `afficher(indices, palette, l, h)` : palette en 6 bits par composante,
// comme celle du VGA.
class AffichageWebGL {
  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    gl.bindVertexArray(gl.createVertexArray());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // Unités de texture : 0 indices, 1 palette, 2 traînée, 3 à 7 la composition du zoom, 8 les couleurs
    // de la première passe, 9 celles du parc de la composition, 10 et 11 leurs règles de xBR.
    this.couleurs = programmer(gl, NUANCEUR_COULEURS, ['indices', 'palette', 'trainee', 'avecTrainee', 'taille', 'lisse']);
    gl.useProgram(this.couleurs.programme);
    gl.uniform1i(this.couleurs.u.indices, 0);
    gl.uniform1i(this.couleurs.u.palette, 1);
    gl.uniform1i(this.couleurs.u.trainee, 2);
    this.pixels = programmer(gl, NUANCEUR_PIXELS, ['couleurs', 'regles', 'grille', 'sortie', 'rendu']);
    gl.useProgram(this.pixels.programme);
    gl.uniform1i(this.pixels.u.couleurs, 8);
    gl.uniform1i(this.pixels.u.regles, 10);
    this.bords = programmer(gl, NUANCEUR_BORDS, ['couleurs', 'decalage', 'tailleUtile']);
    this.bordsXbrz = programmer(gl, NUANCEUR_BORDS_XBRZ, ['couleurs', 'decalage', 'tailleUtile']);
    this.textureIndices = this.nouvelleTexture(0);
    this.texturePalette = this.nouvelleTexture(1);
    // La traînée de la façon « ×2 » (poserLesTrainees) : une texture RGBA de la taille de l'image,
    // transparente hors des rectangles posés ; celle de la composition du zoom, unité 7.
    this.nouvelleTexture(2);
    this.trainee = { l: 0, h: 0, rects: [], active: false };
    this.zeros = new Uint8Array(0);
    // La texture des couleurs de la première passe, et son tampon d'image (agrandie au besoin) ; celle
    // des règles de xBR.
    this.passe = this.nouvellePasse(8);
    this.passeRegles = this.nouvellePasse(10, true);
    // Copies locales : WebGL refuse les vues sur une mémoire partagée entre fils d'exécution.
    this.copieIndices = new Uint8Array(0);           // agrandie à la taille de l'image
    this.copiePalette = new Uint8Array(256 * 4);
    this.l = 0; this.h = 0;                          // l'écran du jeu montré
    this.lIndices = 0; this.hIndices = 0;            // la texture des indices
    this.rendu = 'net';
    this.compose = null;             // la composition du zoom, quand c'est elle qui est montrée
    this.modeCompose = false;
  }

  // (le rendu HD allumé, rendu-hd.js, l'image n'est pas composée : principal.js pose sansComposition)
  get composePossible() { return !this.sansComposition; }

  // Une texture RGBA (unité `unite` ; `entiere` : des entiers, RGBA8UI) où dessine une passe :
  // { texture, tampon, l, h }, sa taille agrandie au besoin (preparerLaPasse). D'abord un texel, pour
  // qu'un nuanceur qui la déclare sans la lire ait une texture complète.
  nouvellePasse(unite, entiere = false) {
    const gl = this.gl;
    const texture = this.nouvelleTexture(unite);
    const tampon = gl.createFramebuffer();
    const format = entiere ? [gl.RGBA8UI, gl.RGBA_INTEGER] : [gl.RGBA8, gl.RGBA];
    gl.texImage2D(gl.TEXTURE_2D, 0, format[0], 1, 1, 0, format[1], gl.UNSIGNED_BYTE, null);
    return { unite, texture, tampon, format, l: 1, h: 1, attachee: false };
  }

  // La texture d'une passe, d'au moins l x h ; le tampon d'image lié, la zone de dessin posée.
  preparerLaPasse(passe, l, h) {
    const gl = this.gl;
    if (passe.l < l || passe.h < h) {
      passe.l = Math.max(passe.l, l); passe.h = Math.max(passe.h, h);
      gl.activeTexture(gl.TEXTURE0 + passe.unite);
      gl.texImage2D(gl.TEXTURE_2D, 0, passe.format[0], passe.l, passe.h, 0, passe.format[1], gl.UNSIGNED_BYTE, null);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, passe.tampon);
    if (!passe.attachee) {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, passe.texture, 0);
      passe.attachee = true;
    }
    gl.viewport(0, 0, l, h);
  }

  // Les règles de xBR (ou de xBRZ, `sorte` 'xbrz') d'une texture de couleurs (unité `unite`, de taille
  // utile l x h, `decalage` : sa marge), dans la passe `regles`.
  dessinerLesBords(regles, unite, l, h, decalage, sorte = 'xbr') {
    const gl = this.gl;
    const b = sorte === 'xbrz' ? this.bordsXbrz : this.bords;
    this.preparerLaPasse(regles, l, h);
    gl.useProgram(b.programme);
    gl.uniform1i(b.u.couleurs, unite);
    gl.uniform2i(b.u.decalage, decalage, decalage);
    gl.uniform2i(b.u.tailleUtile, l, h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // La composition du zoom (zoom.js), créée au premier usage. Unités 3 à 6 : image, vue,
  // étiquettes, curseur ; la palette est celle de l'unité 1 ; 7 la traînée, 9 les couleurs du parc.
  preparerLaComposition() {
    const gl = this.gl;
    const monde = programmer(gl, NUANCEUR_MONDE, ['mosaique', 'palette', 'trainee', 'avecTrainee', 'taille', 'cible',
      'origine', 'lisse']);
    gl.useProgram(monde.programme);
    gl.uniform1i(monde.u.mosaique, 4); gl.uniform1i(monde.u.palette, 1); gl.uniform1i(monde.u.trainee, 7);
    const { programme, u } = programmer(gl, NUANCEUR_COMPOSITION, ['image', 'mosaique', 'etiquettes', 'curseur', 'palette',
      'couleursDuMonde', 'reglesDuMonde', 'origineDuMonde', 'tailleDuMonde', 'taille', 'cible', 'glisse', 'cadre', 'u', 'p', 'decalage', 'n',
      'rect', 'origine', 'etendre', 'posCurseur', 'tailleCurseur', 'rendu']);
    gl.useProgram(programme);
    gl.uniform1i(u.image, 3); gl.uniform1i(u.mosaique, 4); gl.uniform1i(u.etiquettes, 5); gl.uniform1i(u.curseur, 6);
    gl.uniform1i(u.palette, 1);
    gl.uniform1i(u.couleursDuMonde, 9);
    gl.uniform1i(u.reglesDuMonde, 11);
    this.nouvelleTexture(7);
    this.traineeCompose = { l: 0, h: 0, rects: [], active: false };
    this.composition = {
      programme, u, monde, passe: this.nouvellePasse(9), passeRegles: this.nouvellePasse(11, true),
      textures: [3, 4, 5, 6].map((unite) => this.nouvelleTexture(unite)),
      tailles: [[0, 0], [0, 0], [0, 0], [0, 0]],
      copies: [new Uint8Array(0), null, new Uint8Array(0), new Uint8Array(64 * 64)],
      rect: new Int32Array(4 * REGIONS_MAX), origine: new Float32Array(2 * REGIONS_MAX), etendre: new Int32Array(REGIONS_MAX),
    };
    // la mosaïque : 4096 x 4096 indices, une fois pour toutes
    gl.activeTexture(gl.TEXTURE4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, COTE_MOSAIQUE, COTE_MOSAIQUE, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, null);
  }

  // Une texture d'indices de la composition (k : 0 image, 1 vue, 2 étiquettes, 3 curseur), l x h,
  // recopiée (WebGL refuse les vues sur une mémoire partagée).
  // (une vue sur une mémoire ordinaire passe telle quelle ; `rects` : seulement ces rectangles
  // [x0, y0, x1, y1] de l'image, si sa taille n'a pas changé)
  envoyerIndices(k, donnees, l, h, rects = null) {
    const gl = this.gl, c = this.composition;
    const n = l * h;
    let copie = donnees.subarray(0, n);
    if (estPartagee(donnees.buffer)) {
      if (c.copies[k].length < n) c.copies[k] = new Uint8Array(n);
      copie = c.copies[k].subarray(0, n);
      copie.set(donnees.subarray(0, n));
    }
    gl.activeTexture(gl.TEXTURE3 + k);
    if (c.tailles[k][0] !== l || c.tailles[k][1] !== h) {
      c.tailles[k] = [l, h];
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, l, h, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, copie);
    } else if (rects) {
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, l);
      for (const [x0, y0, x1, y1] of rects) {
        if (x1 <= x0 || y1 <= y0) continue;
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, x1 - x0, y1 - y0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, copie);
      }
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, l, h, gl.RED_INTEGER, gl.UNSIGNED_BYTE, copie);
    }
  }

  // La vue seule (l x hv) recollée dans la mosaïque en (x, y) du monde, modulo 4096 : jusqu'à quatre
  // morceaux, quand elle passe un bord du plan.
  // (`morceau` : seulement ce rectangle [x0, y0, x1, y1] de la vue)
  coller(vue, l, hv, x, y, morceau = null) {
    const gl = this.gl;
    const M = COTE_MOSAIQUE - 1;
    const [mx0, my0, mx1, my1] = morceau || [0, 0, l, hv];
    const lm = mx1 - mx0, hm = Math.min(hv, my1) - my0;
    if (lm <= 0 || hm <= 0) return;
    gl.activeTexture(gl.TEXTURE4);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, l);
    const x0 = (x + mx0) & M, y0 = (y + my0) & M;
    const la = Math.min(lm, COTE_MOSAIQUE - x0), ha = Math.min(hm, COTE_MOSAIQUE - y0);
    for (const [sx, dx, lx] of [[mx0, x0, la], [mx0 + la, 0, lm - la]]) {
      for (const [sy, dy, ly] of [[my0, y0, ha], [my0 + ha, 0, hm - ha]]) {
        if (lx <= 0 || ly <= 0) continue;
        gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, sx);
        gl.pixelStorei(gl.UNPACK_SKIP_ROWS, sy);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, dx, dy, lx, ly, gl.RED_INTEGER, gl.UNSIGNED_BYTE, vue);
      }
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
  }

  // Montrer la composition du zoom. z : le Zoom (zoom.js) ; `neuve` : une image publiée, à envoyer
  // (image : l'image sans le curseur ; vue : la vue seule, recollée en (x, y) du monde) ; glisse :
  // le décalage de la vue montrée (défilement fluide), en pixels du jeu ; curseur : sa position
  // dans le cadre, en pixels CSS.
  afficherCompose(z, neuve, image, vue, x, y, glisse, palette, curseur) {
    if (!this.composition) this.preparerLaComposition();
    if (neuve) {
      this.envoyerIndices(0, image, z.W, z.H);
      this.coller(vue, z.W, z.hv, x, y);
      this.envoyerIndices(2, z.etiquettes, z.W, z.H, z.aEnvoyer);
      this.envoyerLaPalette(palette);
      if (z.curseur.l && z.curseur.h) this.envoyerIndices(3, z.curseur.sprite, z.curseur.l, z.curseur.h);
      this.cible = [x, y];
    }
    this.compose = { z, curseur, glisse };
    if (!this.modeCompose || this.l !== z.W || this.h !== z.H) {
      this.modeCompose = true;
      this.l = z.W; this.h = z.H;
      this.ajuster();
    } else this.redessiner();
  }

  // Les animations intercalées (retouches.js) : seulement les rectangles retouchés de l'image et de
  // la vue (déjà envoyées entières), à renvoyer à la carte graphique ; la vue, dans la mosaïque en
  // (x, y) du monde. L'image est redessinée par afficherCompose.
  retoucherCompose(z, image, vue, x, y, rects) {
    if (!this.composition || !rects.length) return;
    this.envoyerIndices(0, image, z.W, z.H, rects);
    for (const r of rects) this.coller(vue, z.W, z.hv, x, y, r);
  }

  // La traînée de la façon « ×2 » (animations-intercalees.js, retouches.js), mêlée après la palette :
  // `liste`, des retouches { x, y, l, h, trainee (RGBA ou null) } (null : aucune traînée), posées dans
  // une image l × h, décalées de (dx, dy), sur ses `lignes` premières lignes.
  poserLesTrainees(liste, l, h, dx = 0, dy = 0, lignes = h) {
    this.majTrainee(this.trainee, 2, liste, l, h, dx, dy, lignes);
  }

  // La même pour la composition du zoom : aux coordonnées de l'image publiée (W × H).
  poserLesTraineesCompose(liste, W, H) {
    if (!this.composition) this.preparerLaComposition();
    this.majTrainee(this.traineeCompose, 7, liste, W, H, 0, 0, H);
  }

  // Une texture de traînée : les rectangles posés la fois précédente remis à zéro, les nouveaux posés.
  majTrainee(etat, unite, liste, l, h, dx, dy, lignes) {
    const gl = this.gl;
    const aPoser = (liste || []).filter((t) => t.trainee);
    if (!aPoser.length && !etat.rects.length && etat.l === l && etat.h === h) { etat.active = false; return; }
    gl.activeTexture(gl.TEXTURE0 + unite);
    if (etat.l !== l || etat.h !== h) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, l, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);   // (des zéros)
      etat.l = l; etat.h = h; etat.rects = [];
    }
    for (const [x0, y0, x1, y1] of etat.rects) {
      const n = 4 * (x1 - x0) * (y1 - y0);
      if (this.zeros.length < n) this.zeros = new Uint8Array(n);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, x1 - x0, y1 - y0, gl.RGBA, gl.UNSIGNED_BYTE, this.zeros);
    }
    etat.rects = [];
    for (const t of aPoser) {
      const X = t.x + dx, Y = t.y + dy;
      const x0 = Math.max(0, X), y0 = Math.max(0, Y), x1 = Math.min(l, X + t.l), y1 = Math.min(lignes, h, Y + t.h);
      if (x1 <= x0 || y1 <= y0) continue;
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, t.l);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0 - X);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0 - Y);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, x1 - x0, y1 - y0, gl.RGBA, gl.UNSIGNED_BYTE, t.trainee);
      etat.rects.push([x0, y0, x1, y1]);
    }
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    etat.active = etat.rects.length > 0;
  }

  // La palette du VGA, 6 bits par composante, étendue à 8 bits ; renvoyée à la carte graphique
  // seulement si elle a changé.
  envoyerLaPalette(palette) {
    const gl = this.gl;
    const p = this.copiePalette;
    let change = false;
    for (let c = 0, j = 0; c < 768; c += 3, j += 4) {
      const r = palette[c] << 2 | palette[c] >> 4, v = palette[c + 1] << 2 | palette[c + 1] >> 4;
      const b = palette[c + 2] << 2 | palette[c + 2] >> 4;
      if (p[j] !== r || p[j + 1] !== v || p[j + 2] !== b || p[j + 3] !== 255) {
        p[j] = r; p[j + 1] = v; p[j + 2] = b; p[j + 3] = 255;
        change = true;
      }
    }
    if (!change && this.paletteEnvoyee) return;
    this.paletteEnvoyee = true;
    gl.activeTexture(gl.TEXTURE1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, p);
  }

  // (vl x vh : le cadre en pixels de l'écran ; ratio : pixels de l'écran par pixel CSS)
  dessinerLaComposition(vx, vy, vl, vh, ratio) {
    const gl = this.gl, c = this.composition, { z, curseur, glisse } = this.compose;
    const u = c.u;
    const n = Math.min(REGIONS_MAX, z.regions.length);
    // les échelles de zoom.js sont en pixels CSS du cadre (z.Wf x z.Hf) ; ici en pixels de l'écran
    const kx = vl / z.Wf, ky = vh / z.Hf;
    const p = z.p * kx;
    // Première passe : les couleurs de la portion du monde que montre le parc (et trois pixels de
    // plus tout autour, que lisent l'agrandissement et xBR), en lissé sur la grille doublée.
    const g = RENDUS_DOUBLES.includes(this.rendu) ? 2 : 1;
    const x0 = Math.floor(this.cible[0] + glisse[0] + z.s[0]) - 3, y0 = Math.floor(this.cible[1] + glisse[1] + z.s[1]) - 3;
    const lm = g * (Math.ceil(vl / p) + 7), hm = g * (Math.ceil(vh / p) + 7);
    this.preparerLaPasse(c.passe, lm, hm);
    const m = c.monde.u;
    gl.useProgram(c.monde.programme);
    gl.uniform2i(m.taille, z.W, z.H);
    gl.uniform2i(m.cible, this.cible[0], this.cible[1]);
    gl.uniform2i(m.origine, g * x0, g * y0);
    gl.uniform1i(m.lisse, g === 2 ? 1 : 0);
    gl.uniform1i(m.avecTrainee, this.traineeCompose.active && this.traineeCompose.l === z.W && this.traineeCompose.h === z.H ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (REGLES_DES_RENDUS[this.rendu]) this.dessinerLesBords(c.passeRegles, c.passe.unite, lm, hm, 0, REGLES_DES_RENDUS[this.rendu]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Seconde passe : le cadre.
    gl.useProgram(c.programme);
    z.regions.slice(0, n).forEach((r, k) => {
      c.rect.set([r.x0, r.y0, r.x1, r.y1], 4 * k);
      c.origine.set([r.ox * kx, r.oy * ky], 2 * k);
      c.etendre[k] = r.etendre;
    });
    gl.uniform1i(u.n, n);
    gl.uniform4iv(u.rect, c.rect);
    gl.uniform2fv(u.origine, c.origine);
    gl.uniform1iv(u.etendre, c.etendre);
    gl.uniform2i(u.origineDuMonde, g * x0, g * y0);
    gl.uniform2i(u.tailleDuMonde, lm, hm);
    gl.uniform2i(u.taille, z.W, z.H);
    gl.uniform2i(u.cible, this.cible[0], this.cible[1]);
    gl.uniform2f(u.glisse, glisse[0], glisse[1]);
    gl.uniform2f(u.cadre, vl, vh);
    gl.uniform1f(u.u, z.u * ky);
    gl.uniform1f(u.p, p);
    gl.uniform2f(u.decalage, z.s[0], z.s[1]);
    const visible = curseur && z.curseur.visible && z.curseur.l > 0;
    gl.uniform2f(u.posCurseur, visible ? curseur[0] * kx : -1e6, visible ? curseur[1] * ky : -1e6);
    gl.uniform2i(u.tailleCurseur, visible ? z.curseur.l : 0, visible ? z.curseur.h : 0);
    gl.uniform1i(u.rendu, CODES_DES_RENDUS[this.rendu]);
    gl.viewport(vx, this.canvas.height - vy - vh, vl, vh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  nouvelleTexture(unite) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unite);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  choisirRendu(rendu) { this.rendu = rendu; this.ajuster(); }

  // Un cadre fixe, au format `rapport` (largeur sur hauteur), ou aucun (null) : en grande vue, le
  // cadre garde le format de la grande vue, et une image d'un autre format (les écrans pleins en
  // 640x480 ou 320x200) s'y inscrit, centrée sur du noir, au lieu de changer la taille du cadre à
  // chaque passage.
  fixerLeCadre(rapport) {
    if (rapport === this.rapportDuCadre) return;
    this.rapportDuCadre = rapport;
    this.ajuster();
  }

  // Le canevas prend la taille du cadre à l'écran, en pixels réels de l'écran ; l'image y occupe
  // `this.image` (en pixels CSS, relatifs au canevas).
  ajuster() {
    if (!this.l) return;
    const zone = this.canvas.parentElement.getBoundingClientRect();
    let cadre = null;
    if (this.rapportDuCadre) {
      const k = Math.min(zone.width / this.rapportDuCadre, zone.height);
      cadre = { width: k * this.rapportDuCadre, height: k };
    }
    // (la composition du zoom remplit le cadre : ses échelles sont les siennes, zoom.js)
    const { largeur, hauteur } = this.modeCompose && cadre ? { largeur: cadre.width, hauteur: cadre.height }
      : dimensions(cadre || zone, this.l, this.h, this.rendu);
    const L = cadre ? cadre.width : largeur, H = cadre ? cadre.height : hauteur;
    this.image = { x: (L - largeur) / 2, y: (H - hauteur) / 2, largeur, hauteur };
    const ratio = window.devicePixelRatio || 1;
    this.canvas.style.width = `${L}px`;
    this.canvas.style.height = `${H}px`;
    this.canvas.width = Math.max(1, Math.round(L * ratio));
    this.canvas.height = Math.max(1, Math.round(H * ratio));
    this.redessiner();
  }

  // Où est l'image à l'écran, en coordonnées de la page (pour la souris).
  rectangleImage() {
    const r = this.canvas.getBoundingClientRect();
    if (!this.image) return r;
    const k = r.width / (parseFloat(this.canvas.style.width) || r.width);
    return { left: r.left + this.image.x * k, top: r.top + this.image.y * k,
      width: this.image.largeur * k, height: this.image.hauteur * k,
      right: r.left + (this.image.x + this.image.largeur) * k, bottom: r.top + (this.image.y + this.image.hauteur) * k };
  }

  afficher(indices, palette, l, h) {
    const gl = this.gl;
    const n = l * h;
    const quitte = this.quitterLaComposition();
    if (this.copieIndices.length < n) this.copieIndices = new Uint8Array(n);
    this.copieIndices.set(indices.subarray(0, n));
    gl.activeTexture(gl.TEXTURE0);
    if (l !== this.lIndices || h !== this.hIndices) {
      this.lIndices = l; this.hIndices = h;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, l, h, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.copieIndices.subarray(0, n));
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, l, h, gl.RED_INTEGER, gl.UNSIGNED_BYTE, this.copieIndices.subarray(0, n));
    }
    let taille = quitte;
    if (l !== this.l || h !== this.h) { this.l = l; this.h = h; taille = true; }
    this.envoyerLaPalette(palette);
    if (taille) this.ajuster();
    else this.redessiner();
  }

  // Revenir à l'image seule ; rend vrai si la composition était montrée (le cadre est à refaire).
  quitterLaComposition() {
    if (!this.modeCompose) return false;
    this.modeCompose = false;
    this.compose = null;
    return true;
  }

  redessiner() {
    const gl = this.gl;
    if (!this.l) return;
    // l'image dans le cadre, le reste en noir (le viewport de WebGL compte depuis le bas)
    const ratio = this.canvas.width / (parseFloat(this.canvas.style.width) || this.canvas.width);
    const im = this.image || { x: 0, y: 0, largeur: this.canvas.width / ratio, hauteur: this.canvas.height / ratio };
    const vx = Math.round(im.x * ratio), vy = Math.round(im.y * ratio);
    const vl = Math.round(im.largeur * ratio), vh = Math.round(im.hauteur * ratio);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.modeCompose && this.compose) { this.dessinerLaComposition(vx, vy, vl, vh, ratio); return; }
    // Première passe : les couleurs, avec la marge d'un texel tout autour.
    const g = RENDUS_DOUBLES.includes(this.rendu) ? 2 : 1;
    const lg = g * this.l, hg = g * this.h;
    this.preparerLaPasse(this.passe, lg + 2, hg + 2);
    gl.useProgram(this.couleurs.programme);
    gl.uniform2f(this.couleurs.u.taille, this.l, this.h);
    gl.uniform1i(this.couleurs.u.lisse, g === 2 ? 1 : 0);
    gl.uniform1i(this.couleurs.u.avecTrainee, this.trainee.active && this.trainee.l === this.l && this.trainee.h === this.h ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (REGLES_DES_RENDUS[this.rendu]) this.dessinerLesBords(this.passeRegles, this.passe.unite, lg + 2, hg + 2, 1, REGLES_DES_RENDUS[this.rendu]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // Seconde passe : l'agrandissement.
    gl.useProgram(this.pixels.programme);
    gl.viewport(vx, this.canvas.height - vy - vh, vl, vh);
    gl.uniform2f(this.pixels.u.grille, lg, hg);
    gl.uniform2f(this.pixels.u.sortie, vl, vh);
    // (lissé : pixels nets sur l'image doublée ; lissé anticrénelé : xBR sur l'image doublée)
    gl.uniform1i(this.pixels.u.rendu, { lisse: 1, lissexbr: 3 }[this.rendu] ?? CODES_DES_RENDUS[this.rendu]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// Le repli, sans WebGL2 : le canevas a la taille de l'image, agrandie par le navigateur.
class Affichage2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.image = null;
    this.rendu = 'brut';
  }

  choisirRendu() { /* un seul rendu possible */ }
  fixerLeCadre() { /* le cadre suit l'image */ }
  rectangleImage() { return this.canvas.getBoundingClientRect(); }

  ajuster() {
    if (!this.image) return;
    const zone = this.canvas.parentElement.getBoundingClientRect();
    const { largeur, hauteur } = dimensions(zone, this.canvas.width, this.canvas.height, 'brut');
    this.canvas.style.width = `${largeur}px`;
    this.canvas.style.height = `${hauteur}px`;
  }

  get composePossible() { return false; }

  // La traînée de la façon « ×2 » : gardée, et mêlée par afficher (comme par le nuanceur).
  poserLesTrainees(liste, l, h, dx = 0, dy = 0, lignes = h) {
    this.trainees = liste && liste.some((t) => t.trainee) ? { liste, dx, dy, lignes } : null;
  }
  poserLesTraineesCompose() { /* pas de composition du zoom sans WebGL2 */ }

  afficher(indices, palette, l, h) {
    if (!this.image || this.canvas.width !== l || this.canvas.height !== h) {
      this.canvas.width = l; this.canvas.height = h;
      this.image = this.ctx.createImageData(l, h);
      this.ajuster();
    }
    const d = this.image.data;
    for (let k = 0, j = 0; k < l * h; k++, j += 4) {
      const c = indices[k] * 3;
      d[j] = palette[c] << 2 | palette[c] >> 4;
      d[j + 1] = palette[c + 1] << 2 | palette[c + 1] >> 4;
      d[j + 2] = palette[c + 2] << 2 | palette[c + 2] >> 4;
      d[j + 3] = 255;
    }
    if (this.trainees) {
      const { liste, dx, dy, lignes } = this.trainees;
      for (const t of liste) {
        if (!t.trainee) continue;
        for (let y = 0; y < t.h; y++) {
          const Y = t.y + y + dy;
          if (Y < 0 || Y >= Math.min(lignes, h)) continue;
          for (let x = 0; x < t.l; x++) {
            const X = t.x + x + dx, q = 4 * (y * t.l + x), a = t.trainee[q + 3];
            if (!a || X < 0 || X >= l) continue;
            const j = 4 * (Y * l + X), f = a / 255;
            for (let c = 0; c < 3; c++) d[j + c] = d[j + c] * (1 - f) + t.trainee[q + c] * f;
          }
        }
      }
    }
    this.ctx.putImageData(this.image, 0, 0);
  }
}

// `force2d` : le repli 2D même quand WebGL2 est là (principal.js, `?force=2d`), pour l'éprouver.
export function nouvelAffichage(canvas, force2d = false) {
  const gl = force2d ? null : canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false });
  if (gl) {
    try { return new AffichageWebGL(canvas, gl); } catch (err) { console.warn('WebGL2 inutilisable :', err); }
  }
  return new Affichage2D(canvas);
}
