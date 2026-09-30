// Le relevé de la liste d'affichage : ce que le jeu dessine, opération par opération, pour le rendu HD
// de la page (rendu-hd.js). Le format est dans liste-affichage-format.js.
//
// COMMENT, SANS TOUCHER AU CODE LISIBLE. Comme les autres enveloppes de la page (moteur-du-jeu.js) :
// chaque routine de tracé du jeu est enveloppée à son adresse (T.remplacer). L'enveloppe lit les
// arguments de l'appel et l'état du tracé (la surface visée, la fenêtre, les drapeaux du traceur),
// note l'opération, puis appelle la routine telle quelle : le jeu fait exactement ce qu'il faisait, et
// rien de ce qui est noté ne retourne dans sa mémoire. Relevé éteint, l'enveloppe ne fait qu'un test.
//
// LES ROUTINES ENVELOPPÉES (l'inventaire, et pourquoi chacune) :
//  - le traceur de sprites (traceur.js) : 0x5ED21 (appelé en registres par 0x11AF4, le sprite enfoncé,
//    0x11BD5, la silhouette, et 0x5ED0C), 0x5EC9C et 0x5ECD4 (une entrée de banque), 0x55BD4 (la même,
//    blocs marqués). Le traceur écrit toujours dans la surface [0xDE5BC], que le jeu fait pointer
//    ailleurs le temps d'un tracé (le fond pendant la carte, le motif du curseur) : le tampon visé est
//    lu à chaque appel. La variante (miroirs, silhouette, fusion...) et la découpe sont décidées ici
//    comme le traceur les décide, anomalies comprises (une silhouette coupée n'est pas tracée) ;
//  - les rectangles pleins (0x7F5BC, 0x81D88), les pixels (0x80C00, 0x80C40), le remplissage de
//    lignes (0x81590), memset (0x7F1A0) et memcpy (0x80958) quand ils visent un tampon suivi ;
//  - les recopies de tampon à tampon : lignes de 320 et de 640 (0x80E20, 0x81CB0), bandes de blocs
//    (0x55C24), le panneau recopié du fond à la fin de la carte (en ligne dans 0x1B837) ;
//  - la présentation, de la surface à l'écran : bandes de blocs (0x55DE6), l'écran entier (0x80210,
//    0x81CD4, et en ligne dans 0x55507 et la boucle du parc, que trahit l'appel de 0x7D79E qui la suit
//    toujours), l'écran effacé (0x55FCF) ;
//  - le curseur : son motif décodé (0x7DDD7, dans un tampon de 64x64), posé dans la surface (0x7D2DD,
//    ce qu'il recouvre gardé), retiré (0x7D6C5, 0x7D79E), tracé et effacé directement à l'écran par le
//    gestionnaire de souris (0x7CFC6, 0x7D4F9) ;
//  - ce qui écrit en ligne, pixel par pixel, sans rien qu'on sache nommer mieux : la petite police
//    (0x80E88, 0x80F34), les segments et les lignes (0x81374, 0x8148C, 0x949BC, 0x949DA), les variantes
//    rares du traceur (fusion, compression, agrandissement) : relevés PAR DIFFÉRENCE, le rectangle
//    qu'ils peuvent toucher lu avant et après l'appel (OP.PIXELS).
// Les chargements de fichiers (0x7F0B0, 0x1180E) sont notés pour nommer les sprites : une banque est
// un fichier .TAB (6 octets par image) ; le sprite n de la banque MSPR-0 a pour données le mot long de
// son entrée n, relogé (0x10C80).
//
// Ce qui manque encore, le rendu de référence le montre (travail/hd/banc.mjs) ; la page s'en protège
// par les recalages (plus bas, `recaler`) : des OP.PIXELS qui redonnent les pixels du jeu là où la
// liste ne suffit pas.

import { OP, MODE, ECRAN, TRANSPARENT_DU_CURSEUR, Ecrivain, rectanglesDUnePlage, morceauxDUneCopie,
  decoderUnSprite } from './liste-affichage-format.js';
import { ecran as geometrie } from '../jeu/grande-vue.js';
import { Reference } from './liste-affichage-reference.js';

// --- les variables du jeu ------------------------------------------------------------------------
const SURFACE = 0xDE5BC, FOND = 0xD3B98, PAS_LIGNE = 0xDE5B8, HAUTEUR_ECRAN = 0xDE5C0;
const MODE_AFFICHAGE = 0xDE5F6;
const FENETRE_GAUCHE = 0xDE5D0, FENETRE_HAUT = 0xDE5E0, FENETRE_LARGEUR = 0xDE5C8, FENETRE_HAUTEUR = 0xDE5F0;
const FENETRE_DROITE = 0xDE5EC;
const DRAPEAUX = 0xBECBC;
const RAFRAICHISSEMENT_TOTAL = 0xD6BCD, ECRAN_PLEIN = 0xB150F;
const PANNEAU_Y = 0xB93F5;
const ZONES_DU_PARC = 0xB93C3;       // la table des zones de l'écran du parc, 12 octets (x0, y0, x1, y1...)
// le curseur (systeme.js, souris-jeu.js)
const CURSEUR_AFFICHE = 0xBECB4, CURSEUR_DECODE = 0xDE590;
const CUR_X = 0xDE55C, CUR_Y = 0xDE55E, CUR_LARGEUR = 0xDE560, CUR_HAUTEUR = 0xDE562, CUR_DECALAGE = 0xDE568;
const POSE_X = 0xDE54C, POSE_Y = 0xDE54E, LARGEUR_TRACEE = 0xDE550, HAUTEUR_TRACEE = 0xDE552;
const DECALAGE_DIRECT = 0xDE558;
// Les deux tampons des pixels que le curseur recouvre : des tampons à part, de 64x64 au plus, que le
// relevé ne connaît que par leur rôle (des numéros sans adresse).
const SOUS_LE_CURSEUR = -1, SOUS_LE_CURSEUR_ECRAN = -2;

const s16 = (v) => (v << 16) >> 16;
const s8 = (v) => (v << 24) >> 24;

// Ce que rend une routine : undefined quand elle a fini, ou (moteur réentrant) l'itérateur qui la
// finira ; `apres` est appelé à sa fin, comme dans moteur-du-jeu.js.
const estIterateur = (x) => typeof x === 'object' && x !== null && typeof x.next === 'function';
function puis(r, apres) {
  if (!estIterateur(r)) { apres(r); return r; }
  return (function* () { const v = yield* r; apres(v); return v; }());
}

// Les variantes du traceur (traceur.js, tracerSprite), dans l'ordre où il les choisit.
const RIEN = 0, SIMPLE = 1, H = 2, V = 3, HV = 4, FUSION = 5, COMPRESSION = 6, AGRANDI = 7, SILHOUETTE = 8;

// La variante que prendra le traceur, sa découpe comprise : une image qui déborde à gauche ou à droite
// n'est tracée que simple ou retournée ; avec un autre drapeau, pas du tout (anomalie de 1994).
function varianteDuTrace(x, y, largeur, hauteur, drapeaux, L, bas, bord) {
  if (hauteur === 0) return RIEN;
  if (y < 0) {
    if (drapeaux & 2) { if (hauteur + y + 1 <= 0) return RIEN; } else if (hauteur + y <= 0) return RIEN;
  } else if (hauteur + y >= bas) {
    if (drapeaux & 2) { if (y + 1 >= bas) return RIEN; } else if (bas - y <= 0) return RIEN;
  }
  if (x < 0) {
    if (drapeaux === 0) return largeur <= -x ? RIEN : SIMPLE;
    if (drapeaux & 1) return x + largeur + 1 < 0 ? RIEN : (drapeaux & 2 ? HV : H);
    if (drapeaux & 2) return largeur <= -x ? RIEN : V;
    return RIEN;
  }
  if (largeur + x >= L) {
    if (bord - x < 0) return RIEN;
    if (drapeaux === 0) return SIMPLE;
    if (drapeaux & 1) return drapeaux & 2 ? HV : H;
    if (drapeaux & 2) return V;
    return RIEN;
  }
  if (drapeaux & 1) return drapeaux & 2 ? HV : H;
  if (drapeaux === 0) return SIMPLE;
  if (drapeaux & 2) return V;
  if (drapeaux & 4) return FUSION;
  if (drapeaux & 8) return COMPRESSION;
  if (drapeaux & 0x20) return AGRANDI;
  if (drapeaux & 0x40) return SILHOUETTE;
  return SIMPLE;
}
const MODES = { [SIMPLE]: 0, [H]: MODE.MIROIR_H, [V]: MODE.MIROIR_V, [HV]: MODE.MIROIR_H | MODE.MIROIR_V, [SILHOUETTE]: MODE.SILHOUETTE };

// Le relevé, pour une machine (moteur/hote/machine.js) et son processeur. `installer()` pose les
// enveloppes (une fois, après installerRemplacements) ; `actif` les allume ; `lot()` rend ce qui a
// été noté depuis le lot précédent.
export function creerLeReleve(machine, T) {
  const m8 = machine.m8, dv = machine.dv;
  const u32 = (a) => dv.getUint32(a, true);
  const i32 = (a) => dv.getInt32(a, true);
  const argument = (k) => dv.getUint32((T.R.esp + 4 + 4 * k) >>> 0, true);
  const basse = () => (dv.getUint16(MODE_AFFICHAGE, true) & 1) !== 0;
  const e = new Ecrivain();
  const releve = {
    actif: false,
    ecrivain: e,
    // statistiques, pour le banc et le diagnostic
    compte: { sprites: 0, differences: 0, nonSuivis: 0, definis: 0 },
    // les tampons suivis : adresse -> { id, adresse, l, h } ; l'écran à part
    tampons: new Map(),
    ecran: { id: ECRAN, l: 0, h: 0 },
    // les numéros des tampons sans adresse (les pixels sous le curseur)
    virtuels: new Map(),
  };
  let prochainTampon = 1;

  // --- les tampons -------------------------------------------------------------------------------
  function definirTampon(t) { e.op(OP.BUFFER, t.id, t.l, t.h); }
  // Le tampon qui commence à `adresse`, de l x h, suivi (défini) au besoin, ou redéfini s'il a changé de
  // taille (un changement de mode : la même mémoire lue avec un autre pas).
  function suivre(adresse, l, h) {
    if (!adresse || l <= 0 || h <= 0) return null;
    let t = releve.tampons.get(adresse);
    if (t && t.l === l && t.h === h) return t;
    if (!t) { t = { id: prochainTampon++, adresse, l, h }; releve.tampons.set(adresse, t); }
    t.l = l; t.h = h;
    definirTampon(t);
    // (la mémoire garde ce qu'elle avait, lu au nouveau pas : le jeu dessine par-dessus, et ce qu'il ne
    // recouvre pas reste ; la liste part donc de ce contenu)
    emettrePixels(t, 0, 0, l, h, lirePixels(t, 0, 0, l, h), null);
    return t;
  }
  function virtuel(cle) {
    let t = releve.virtuels.get(cle);
    if (!t) { t = { id: prochainTampon++, l: 64, h: 64 }; releve.virtuels.set(cle, t); definirTampon(t); }
    return t;
  }
  // L'écran : la taille du mode vidéo.
  function ecranSuivi() {
    const v = machine.video, t = releve.ecran;
    if (t.l !== v.largeur || t.h !== v.hauteur) {
      t.l = v.largeur; t.h = v.hauteur;
      definirTampon(t);
      emettrePixels(t, 0, 0, t.l, t.h, lirePixels(t, 0, 0, t.l, t.h), null);
    }
    return t;
  }
  // Les tampons que le jeu garde d'une image à l'autre : la surface, le fond (de la taille de l'écran, au
  // pas de la surface), le motif du curseur (64x64).
  function suivreLesTamponsDuJeu() {
    const pas = i32(PAS_LIGNE), h = i32(HAUTEUR_ECRAN);
    const surface = u32(SURFACE), fond = u32(FOND), motif = u32(CURSEUR_DECODE);
    if (pas > 64 && h > 0) {
      if (surface !== motif) suivre(surface, pas, h);
      if (fond) suivre(fond, pas, h);
    }
    if (motif) suivre(motif, 64, 64);
    ecranSuivi();
  }
  // Le tampon où écrit le traceur : la surface du moment, au pas du moment ; sa hauteur est celle de
  // l'écran (ou 64 pour le motif du curseur).
  function tamponDeDessin() {
    const a = u32(SURFACE), pas = i32(PAS_LIGNE);
    const t = releve.tampons.get(a);
    if (t && t.l === pas) return t;
    if (a === u32(CURSEUR_DECODE)) return suivre(a, 64, 64);
    const h = i32(HAUTEUR_ECRAN);
    if (pas < 64 || h <= 0) return null;
    return suivre(a, pas, h);
  }
  // Le tampon suivi qui contient l'adresse a (et la place de a dans ce tampon).
  function tamponContenant(a) {
    for (const t of releve.tampons.values()) {
      const d = a - t.adresse;
      if (d >= 0 && d < t.l * t.h) return t;
    }
    return null;
  }

  // --- les sprites -------------------------------------------------------------------------------
  // clé du sprite : ses données et sa taille (celle du traceur) -> numéro ; les définitions envoyées.
  const cles = new Map();
  let prochaineCle = 1;
  const chaines = new Map();
  let prochaineChaine = 1;
  function chaine(texte) {
    let id = chaines.get(texte);
    if (id !== undefined) return id;
    id = prochaineChaine++;
    chaines.set(texte, id);
    const a = e.placeOctets(texte.length);
    for (let k = 0; k < texte.length; k++) e.octets[a + k] = texte.charCodeAt(k) & 0xFF;
    e.op(OP.CHAINE, id, a, texte.length);
    return id;
  }

  // Les fichiers chargés : { nom (sans dossier ni extension), extension, debut, fin }, le plus récent
  // d'abord. Les banques : les .TAB.
  const fichiers = [];
  let index = null;             // données -> { banque, numero } (refait après chaque chargement)
  function lireUneChaine(a) {
    let s = '';
    for (let k = 0; k < 128 && m8[a + k]; k++) s += String.fromCharCode(m8[a + k]);
    return s;
  }
  function noterUnFichier(nomComplet, debut, taille) {
    if (!debut || !(taille > 0)) return;
    const base = nomComplet.replace(/\\/g, '/').split('/').pop().toUpperCase();
    const point = base.lastIndexOf('.');
    const f = { nom: point > 0 ? base.slice(0, point) : base, extension: point > 0 ? base.slice(point + 1) : '',
      debut, fin: debut + taille };
    for (let k = fichiers.length - 1; k >= 0; k--) {
      const g = fichiers[k];
      if (g.debut < f.fin && f.debut < g.fin) fichiers.splice(k, 1);     // recouvert : oublié
    }
    fichiers.unshift(f);
    index = null;
    // Un fichier lu directement dans un tampon suivi (un fond plein écran dans le fond, MMENU-0.DAT...) :
    // ses pixels, avec leur source (de quoi les remplacer par une image HD).
    if (releve.actif) {
      const t = tamponContenant(debut);
      if (t) copierUnePlage(debut, debut, Math.min(taille, t.adresse + t.l * t.h - debut), f);
    }
    // les sprites dont les données étaient là ne sont plus valables
    for (const [k, c] of cles) {
      if (c.p >= f.debut && c.p < f.fin) { cles.delete(k); if (releve.actif) e.op(OP.OUBLIER, c.id); }
    }
  }
  function construireLIndex() {
    index = { exactes: new Map(), triees: [] };
    for (const f of fichiers) {
      if (f.extension !== 'TAB') continue;
      for (let a = f.debut, n = 0; a + 6 <= f.fin; a += 6, n++) {
        const p = u32(a);
        if (!index.exactes.has(p)) index.exactes.set(p, { banque: f.nom, numero: n });
        index.triees.push([p, f.nom, n]);
      }
    }
    index.triees.sort((a, b) => a[0] - b[0]);
  }
  // Nommer un sprite : { banque, numero, lignes } (lignes : sautées au début, le tracé enfoncé), ou null.
  function identifier(p, entree) {
    if (entree) {
      for (const f of fichiers) {
        if (f.extension === 'TAB' && entree >= f.debut && entree < f.fin && (entree - f.debut) % 6 === 0) {
          return { banque: f.nom, numero: (entree - f.debut) / 6, lignes: 0 };
        }
      }
    }
    if (!index) construireLIndex();
    const x = index.exactes.get(p);
    if (x) return { ...x, lignes: 0 };
    // Au milieu des données d'un sprite : le dernier qui commence avant, et les lignes sautées.
    const t = index.triees;
    let a = 0, b = t.length - 1, k = -1;
    while (a <= b) { const c = (a + b) >> 1; if (t[c][0] <= p) { k = c; a = c + 1; } else b = c - 1; }
    if (k < 0 || p - t[k][0] > 0x10000) return null;
    let q = t[k][0], lignes = 0;
    while (q < p && lignes < 256) {
      for (let g = 0; g < 4096; g++) { const code = m8[q++]; if (code === 0) break; if (!(code & 0x80)) q += code; }
      lignes++;
    }
    return q === p ? { banque: t[k][1], numero: t[k][2], lignes } : null;
  }
  function cleDuSprite(p, largeur, hauteur, entree) {
    const k = `${p}:${largeur}:${hauteur}`;
    let c = cles.get(k);
    if (c) return c.id;
    c = { id: prochaineCle++, p };
    cles.set(k, c);
    const d = decoderUnSprite(m8, p, largeur, hauteur);
    const nom = identifier(p, entree);
    const a = e.placeOctets(2 * d.l * d.h);
    e.octets.set(d.valeurs, a);
    e.octets.set(d.masque, a + d.l * d.h);
    e.op(OP.DEF, c.id, d.l, d.h, a, nom ? chaine(nom.banque) : -1, nom ? nom.numero : -1, nom ? nom.lignes : 0, largeur, hauteur);
    releve.compte.definis++;
    return c.id;
  }

  // --- le relevé par différence ------------------------------------------------------------------
  // Le rectangle [x0, x1) x [y0, y1) du tampon t, lu avant l'appel et après : les pixels changés
  // deviennent une OP.PIXELS.
  function lirePixels(t, x0, y0, l, h) {
    const r = new Uint8Array(l * h);
    if (t.id === ECRAN) {
      const v = machine.video;
      if (v.vesa) v.rangerFenetre();
      const src = v.vesa ? v.vram : m8.subarray(0xA0000, 0xA0000 + t.l * t.h);
      for (let j = 0; j < h; j++) r.set(src.subarray((y0 + j) * t.l + x0, (y0 + j) * t.l + x0 + l), j * l);
      return r;
    }
    for (let j = 0; j < h; j++) {
      const a = t.adresse + (y0 + j) * t.l + x0;
      r.set(m8.subarray(a, a + l), j * l);
    }
    return r;
  }
  function parDifference(t, x0, y0, x1, y1, appel) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(t.l, x1); y1 = Math.min(t.h, y1);
    if (x1 <= x0 || y1 <= y0) return appel();
    const l = x1 - x0, h = y1 - y0;
    const avant = lirePixels(t, x0, y0, l, h);
    return puis(appel(), () => {
      const apres = lirePixels(t, x0, y0, l, h);
      emettrePixels(t, x0, y0, l, h, apres, avant);
    });
  }
  // Une OP.PIXELS : les pixels de `valeurs` (l x h) qui diffèrent de `avant` (tous si avant est null),
  // bornée à leur rectangle.
  function emettrePixels(t, x0, y0, l, h, valeurs, avant) {
    let a = l, b = h, c = -1, d = -1;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < l; i++) {
        const k = j * l + i;
        if (avant && valeurs[k] === avant[k]) continue;
        if (i < a) a = i; if (i > c) c = i; if (j < b) b = j; if (j > d) d = j;
      }
    }
    if (c < 0) return;
    const L = c - a + 1, Hh = d - b + 1;
    const o = e.placeOctets(2 * L * Hh);
    for (let j = 0; j < Hh; j++) {
      for (let i = 0; i < L; i++) {
        const k = (b + j) * l + a + i;
        e.octets[o + j * L + i] = valeurs[k];
        e.octets[o + L * Hh + j * L + i] = !avant || valeurs[k] !== avant[k] ? 1 : 0;
      }
    }
    e.op(OP.PIXELS, t.id, x0 + a, y0 + b, L, Hh, o);
    releve.compte.differences++;
  }

  // --- les opérations sur des plages linéaires ---------------------------------------------------
  function remplirUnePlage(t, debut, n, couleur) {
    for (const [x, y, l, h] of rectanglesDUnePlage(debut - t.adresse, n, t.l, t.h)) e.op(OP.FILL, t.id, x, y, l, h, couleur);
  }
  // Recopier n octets de src vers dst : d'un tampon suivi à un autre, par rectangles ; d'ailleurs (un
  // fichier, une image décodée), les pixels eux-mêmes.
  function copierUnePlage(src, dst, n, fichierLu = null) {
    const td = tamponContenant(dst);
    if (!td) return;
    const ts = fichierLu ? null : tamponContenant(src);
    if (ts) {
      for (const [sx, sy, dx, dy, l] of morceauxDUneCopie(src - ts.adresse, ts.l, dst - td.adresse, td.l, n)) {
        if (sy >= ts.h || dy >= td.h) continue;
        e.op(OP.COPY, ts.id, sx, sy, td.id, dx, dy, l, 1, -1);
      }
      return;
    }
    // Depuis la mémoire : par rectangles de la destination, les octets de la source.
    const f = fichierLu || fichiers.find((g) => src >= g.debut && src < g.fin);
    for (const [x, y, l, h] of rectanglesDUnePlage(dst - td.adresse, n, td.l, td.h)) {
      const decalage = (y * td.l + x) - (dst - td.adresse);
      if (f) e.op(OP.SOURCE, td.id, x, y, l, h, chaine(f.nom + '.' + f.extension), src + decalage - f.debut);
      const valeurs = new Uint8Array(l * h);
      for (let j = 0; j < h; j++) valeurs.set(m8.subarray(src + decalage + j * td.l, src + decalage + j * td.l + l), j * l);
      emettrePixels(td, x, y, l, h, valeurs, null);
    }
  }

  // --- les enveloppes ----------------------------------------------------------------------------
  // `envelopper(adresse, avant)` : `avant()` est appelé à l'entrée si le relevé est allumé ; il rend
  // undefined (rien à faire après), ou une fonction à appeler au retour de la routine, ou { appel }
  // qui prend en charge l'appel (le relevé par différence).
  const originales = new Map();
  function envelopper(adresse, avant) {
    const f = T.fonction(adresse);
    if (!f) return;
    originales.set(adresse, f);
    T.remplacer(adresse, () => {
      if (!releve.actif) return f();
      const r = avant(f);
      if (r === undefined) return f();
      if (typeof r === 'function') return puis(f(), r);
      return r.appel;              // (déjà appelée)
    });
  }

  // Un tracé du traceur : `pixels` ses données, (x, y) son coin, largeur et hauteur de la table (le
  // traceur les divise par deux en 320x200), param1 et param2 ses paramètres, `entree` l'entrée de
  // banque quand l'appelant la donne.
  function noterUnTrace(f, pixels, x, y, largeur, hauteur, param1, param2, entree) {
    const t = tamponDeDessin();
    if (!t) { releve.compte.nonSuivis++; return undefined; }
    if (basse()) { largeur >>= 1; hauteur >>= 1; x >>= 1; y >>= 1; }
    const drapeaux = dv.getUint16(DRAPEAUX, true);
    const gauche = i32(FENETRE_GAUCHE), haut = i32(FENETRE_HAUT);
    const L = i32(FENETRE_LARGEUR), bas = i32(FENETRE_HAUTEUR), bord = i32(FENETRE_DROITE);
    let v = varianteDuTrace(x, y, largeur, hauteur, drapeaux, L, bas, bord);
    if (v === COMPRESSION && param1 === 0 && param2 === 0) v = SIMPLE;      // rien de compressé
    if (v === AGRANDI && param1 === 0) v = RIEN;                            // aucun pixel posé
    if (v === RIEN) return undefined;
    const cle = cleDuSprite(pixels, largeur, hauteur, entree);
    if (v in MODES && gauche === 0 && haut === 0) {
      e.op(OP.SPRITE, t.id, cle, x, y, MODES[v], param1 & 0xFF, 0, 0, L, bas);
      releve.compte.sprites++;
      return undefined;
    }
    // Les variantes rares (et une fenêtre hors de l'origine) : par différence, sur ce que l'image peut
    // toucher.
    const facteur = v === AGRANDI ? Math.max(1, param1) : 1;
    const lignes = v === AGRANDI ? Math.max(1, s8(param2)) : 1;
    return { appel: parDifference(t, gauche + x - 1, haut + y - 1, gauche + x + 2 + 1024 * facteur, haut + y + 2 + hauteur * lignes, f) };
  }

  function installer() {
    // Le traceur.
    envelopper(0x5ED21, (f) => {
      const R = T.R, pile = R.esp >>> 0;
      return noterUnTrace(f, R.esi >>> 0, R.ebx | 0, R.ecx | 0, R.edx & 0xFF, (R.edx >>> 8) & 0xFF, m8[pile + 4], m8[pile + 8], 0);
    });
    for (const a of [0x5EC9C, 0x5ECD4, 0x55BD4]) {
      envelopper(a, (f) => {
        const image = argument(2);
        return noterUnTrace(f, u32(image), s16(argument(0)), s16(argument(1)), m8[image + 4], m8[image + 5], 0, 0, image);
      });
    }
    // Les pixels.
    envelopper(0x80C00, () => {
      const x = argument(0) & 0xFFFF, y = argument(1) & 0xFFFF, c = argument(2) & 0xFF;
      if (x >= 0x280 || y >= 0x190) return undefined;
      const t = tamponDeDessin();
      if (t) e.op(OP.FILL, t.id, x >> 1, y >> 1, 1, 1, c);
      return undefined;
    });
    envelopper(0x80C40, () => {
      const x = argument(0) & 0xFFFF, y = argument(1) & 0xFFFF, c = argument(2) & 0xFF;
      if (x >= geometrie.largeur || y >= geometrie.hauteur) return undefined;
      const t = tamponDeDessin();
      if (t) e.op(OP.FILL, t.id, x, y, 1, 1, c);
      return undefined;
    });
    // Les rectangles pleins (fusionnés par le bit 4 des drapeaux : par différence).
    for (const [a, bas] of [[0x7F5BC, true], [0x81D88, false]]) {
      envelopper(a, (f) => {
        const t = tamponDeDessin();
        if (!t) return undefined;
        let x = argument(0) & 0xFFFF, y = argument(1) & 0xFFFF, l = argument(2) & 0xFFFF, h = argument(3) & 0xFFFF;
        const c = argument(4) & 0xFF;
        if (bas) { x >>= 1; y >>= 1; l >>= 1; h >>= 1; }
        if (dv.getUint16(DRAPEAUX, true) & 4) return { appel: parDifference(t, x, y, x + l, y + h, f) };
        e.op(OP.FILL, t.id, x, y, l, h, c);
        return undefined;
      });
    }
    // Remplir des lignes de 320 octets ; memset.
    envelopper(0x81590, () => {
      const dst = argument(0), n = (argument(1) & 0xFFFF) * 320, c = argument(2) & 0xFF;
      const t = tamponContenant(dst);
      if (t) remplirUnePlage(t, dst, n, c);
      return undefined;
    });
    envelopper(0x7F1A0, () => {
      const dst = argument(0), c = argument(1) & 0xFF, n = argument(2);
      const t = tamponContenant(dst);
      if (t) remplirUnePlage(t, dst, n, c);
      return undefined;
    });
    // Les recopies.
    envelopper(0x80958, () => { copierUnePlage(argument(1), argument(0), argument(2)); return undefined; });
    envelopper(0x80E20, () => { copierUnePlage(argument(0), argument(1), (argument(2) & 0xFFFF) * 320); return undefined; });
    envelopper(0x81CB0, () => { copierUnePlage(argument(0), argument(1), (argument(2) & 0xFFFF) * geometrie.largeur); return undefined; });
    envelopper(0x55C24, () => {
      const src = argument(0), dst = argument(1), n = argument(2) >>> 0;
      const ts = tamponContenant(src), td = tamponContenant(dst);
      if (!td || n === 0) return undefined;
      if (ts && ts.l === geometrie.largeur && td.l === geometrie.largeur) {
        const a = src - ts.adresse, b = dst - td.adresse;
        e.op(OP.COPY, ts.id, a % ts.l, (a / ts.l) | 0, td.id, b % td.l, (b / td.l) | 0, 4 * n, 16, -1);
      } else {
        for (let j = 0; j < 16; j++) copierUnePlage(src + j * geometrie.largeur, dst + j * geometrie.largeur, 4 * n);
      }
      return undefined;
    });
    // Le panneau, recopié du fond sur la surface à la fin de la carte (0x1B837, en ligne) en 640x480.
    envelopper(0x1B837, () => () => {
      if (basse()) return;
      const haut = s16(dv.getUint16(PANNEAU_Y, true)) - 4;
      const ts = releve.tampons.get(u32(FOND)), td = releve.tampons.get(u32(SURFACE));
      if (ts && td) e.op(OP.COPY, ts.id, 0, haut, td.id, 0, haut, geometrie.largeur, geometrie.hauteur - haut, -1);
    });

    // En grande vue (hors du jeu d'origine, ecran-parc.js, peindreLesBandesDuBas) : les bandes de part et
    // d'autre de la barre d'outils, peintes en ligne dans le fond par 0x4DE1A juste avant qu'elle appelle
    // 0x4E359 : relevées par différence entre les deux, hors de la barre (dont les boutons sont des
    // sprites, déjà notés).
    let bandes = null;
    envelopper(0x4DE1A, () => {
      bandes = null;
      if (!geometrie.grande) return undefined;
      const t = releve.tampons.get(u32(FOND));
      if (!t) return undefined;
      const zone = (z) => ZONES_DU_PARC + 12 * z;
      const y = Math.max(0, s16(dv.getUint16(zone(15) + 2, true) - 4));
      const gauche = s16(dv.getUint16(zone(4), true)), droite = s16(dv.getUint16(zone(15) + 4, true));
      bandes = { t, y, gauche, droite, avant: lirePixels(t, 0, y, t.l, t.h - y) };
      return () => { bandes = null; };
    });
    envelopper(0x4E359, () => {
      if (!bandes) return undefined;
      const { t, y, gauche, droite, avant } = bandes;
      bandes = null;
      const apres = lirePixels(t, 0, y, t.l, t.h - y);
      for (let j = 0; j < t.h - y; j++) {
        for (let i = Math.max(0, gauche); i < Math.min(t.l, droite); i++) avant[j * t.l + i] = apres[j * t.l + i];
      }
      emettrePixels(t, 0, y, t.l, t.h - y, apres, avant);
      return undefined;
    });

    // La présentation.
    const surfaceVersEcran = (x, y, l, h) => {
      const ts = releve.tampons.get(u32(SURFACE)), te = ecranSuivi();
      if (ts) e.op(OP.COPY, ts.id, x, y, te.id, x, y, l, h, -1);
    };
    const toutPresenter = () => {
      const ts = releve.tampons.get(u32(SURFACE));
      if (ts) surfaceVersEcran(0, 0, ts.l, ts.h);
    };
    envelopper(0x55DE6, () => {
      const x = argument(0) & 0xFFFF, y = argument(1) & 0xFFFF, l = argument(2) & 0xFFFF;
      if (l) surfaceVersEcran(x, y, l, 16);
      return undefined;
    });
    envelopper(0x80210, () => () => toutPresenter());
    envelopper(0x81CD4, () => {
      const h = (argument(0) & 0xFFFF) === 400 ? 400 : 480;
      return () => surfaceVersEcran(0, 0, geometrie.largeur, h);
    });
    // 0x55507 : en rafraîchissement total, la grande vue présente tout en ligne (hors écran plein) ;
    // sinon 0x81CD4 (enveloppée) ou, écran plein, une copie en ligne que suit 0x7D79E (plus bas).
    envelopper(0x55507, () => {
      if (m8[RAFRAICHISSEMENT_TOTAL] !== 0 && m8[ECRAN_PLEIN] === 0 && geometrie.grande) return () => toutPresenter();
      return undefined;
    });
    envelopper(0x55FCF, () => () => { const t = ecranSuivi(); e.op(OP.FILL, t.id, 0, 0, t.l, t.h, 0); });

    // Le curseur. Son motif est décodé dans son tampon par memset et le traceur (enveloppés) : il suffit
    // que le tampon soit suivi avant.
    envelopper(0x7DDD7, () => { suivreLesTamponsDuJeu(); return undefined; });
    // Posé dans la surface : ce qu'il recouvre gardé dans les deux tampons, puis le motif, 0xFE transparent.
    envelopper(0x7D2DD, () => () => {
      const t = tamponDeDessin(), motif = releve.tampons.get(u32(CURSEUR_DECODE));
      const l = s16(dv.getUint16(CUR_LARGEUR, true)), h = s16(dv.getUint16(CUR_HAUTEUR, true));
      if (!t || !motif || l <= 0 || h <= 0) return;
      const x = s16(dv.getUint16(CUR_X, true)), y = s16(dv.getUint16(CUR_Y, true));
      e.op(OP.COPY, t.id, x, y, virtuel(SOUS_LE_CURSEUR).id, 0, 0, l, h, -1);
      e.op(OP.COPY, t.id, x, y, virtuel(SOUS_LE_CURSEUR_ECRAN).id, 0, 0, l, h, -1);
      e.op(OP.COPY, motif.id, 0, 0, t.id, x, y, l, h, TRANSPARENT_DU_CURSEUR);
    });
    const remettreSousLeCurseur = () => {
      const t = tamponDeDessin();
      const l = s16(dv.getUint16(CUR_LARGEUR, true)), h = s16(dv.getUint16(CUR_HAUTEUR, true));
      if (!t || l <= 0 || h <= 0) return;
      const d = i32(CUR_DECALAGE);
      e.op(OP.COPY, virtuel(SOUS_LE_CURSEUR).id, 0, 0, t.id, d % t.l, Math.floor(d / t.l), l, h, -1);
    };
    envelopper(0x7D6C5, () => { remettreSousLeCurseur(); return undefined; });
    // 0x7D79E suit les présentations entières faites en ligne (0x55507 en écran plein, la boucle du
    // parc, presenterToutLEcran d'amorcage.js), mais pas seulement (0x78E36 retire le curseur avant de
    // garder l'écran) : si l'écran est, à cet instant, la surface même, c'est qu'elle vient d'y être
    // recopiée (et sinon, la recopier ne changerait rien) ; puis le curseur est retiré de la surface
    // (0x7D6C5, appelée directement).
    envelopper(0x7D79E, () => {
      const ts = releve.tampons.get(u32(SURFACE)), te = ecranSuivi();
      if (ts && ts.l === te.l && ts.h === te.h) {
        const v = machine.video;
        if (v.vesa) v.rangerFenetre();
        const ecran = v.vesa ? v.vram : m8.subarray(0xA0000);
        const n = ts.l * ts.h;
        let egaux = true;
        for (let k = 0, a = ts.adresse; k < n; k++, a++) if (ecran[k] !== m8[a]) { egaux = false; break; }
        if (egaux) toutPresenter();
      }
      if (u32(CURSEUR_AFFICHE) !== 0) remettreSousLeCurseur();
      return undefined;
    });
    // Le tracé direct à l'écran, par le gestionnaire de souris.
    envelopper(0x7CFC6, () => () => {
      const te = ecranSuivi(), motif = releve.tampons.get(u32(CURSEUR_DECODE));
      const l = s16(dv.getUint16(LARGEUR_TRACEE, true)), h = s16(dv.getUint16(HAUTEUR_TRACEE, true));
      if (!motif || l <= 0 || h <= 0) return;
      const x = s16(dv.getUint16(POSE_X, true)), y = s16(dv.getUint16(POSE_Y, true));
      e.op(OP.COPY, te.id, x, y, virtuel(SOUS_LE_CURSEUR_ECRAN).id, 0, 0, l, h, -1);
      e.op(OP.COPY, motif.id, 0, 0, te.id, x, y, l, h, TRANSPARENT_DU_CURSEUR);
    });
    envelopper(0x7D4F9, () => {
      const te = ecranSuivi();
      const l = s16(dv.getUint16(LARGEUR_TRACEE, true)), h = s16(dv.getUint16(HAUTEUR_TRACEE, true));
      if (l <= 0 || h <= 0) return undefined;
      const d = i32(DECALAGE_DIRECT), pas = i32(PAS_LIGNE);
      e.op(OP.COPY, virtuel(SOUS_LE_CURSEUR_ECRAN).id, 0, 0, te.id, d % pas, Math.floor(d / pas), l, h, -1);
      return undefined;
    });

    // Ce qui écrit en ligne : par différence.
    // La petite police : 4 pixels de chasse, 6 lignes.
    for (const [a, bas] of [[0x80E88, true], [0x80F34, false]]) {
      envelopper(a, (f) => {
        const t = tamponDeDessin();
        if (!t) return undefined;
        let n = 0;
        const texte = argument(2);
        while (n < 256 && m8[texte + n]) n++;
        const x = bas ? s16(argument(0)) >> 1 : s16(argument(0)), y = bas ? s16(argument(1)) >> 1 : s16(argument(1));
        e.op(OP.TEXTE, t.id, x, y, chaine(lireUneChaine(texte)), 0, argument(3) & 0xFF);
        return { appel: parDifference(t, x, y, x + 4 * n + 1, y + 6, f) };
      });
    }
    // Un sprite étiré ou réduit (0x66DFA : img, x, y, largeur, hauteur) : son propre échantillonnage,
    // relevé par différence sur le rectangle demandé, après un repère qui le nomme.
    envelopper(0x66DFA, (f) => {
      const t = tamponDeDessin();
      if (!t) return undefined;
      const img = argument(0);
      let x = s16(argument(1)), y = s16(argument(2));
      const l = argument(3) & 0xFFFF, h = argument(4) & 0xFFFF;
      if (t.l === 320) { x = (x / 2) | 0; y = (y / 2) | 0; }
      if (l && h && u32(img)) {
        const d = basse() ? 1 : 0;
        const cle = cleDuSprite(u32(img), m8[img + 4] >> d, m8[img + 5] >> d, img);
        e.op(OP.ECHELLE, t.id, cle, x, y, t.l === 320 ? l >> 1 : l, t.l === 320 ? h >> 1 : h);
      }
      return { appel: parDifference(t, x - 1, y - 1, x + l + 1, y + h + 1, f) };
    });
    // Les segments (x1, y1, x2, y2, couleur, drapeaux) et les lignes (x1, y1, x2, y2, couleur).
    for (const [a, bas] of [[0x81374, true], [0x8148C, false], [0x949BC, true], [0x949DA, false]]) {
      envelopper(a, (f) => {
        const t = tamponDeDessin();
        if (!t) return undefined;
        const c = [0, 1, 2, 3].map((k) => (bas ? s16(argument(k)) >> 1 : s16(argument(k))));
        const x0 = Math.min(c[0], c[2]) - 1, x1 = Math.max(c[0], c[2]) + 2;
        const y0 = Math.min(c[1], c[3]) - 1, y1 = Math.max(c[1], c[3]) + 2;
        return { appel: parDifference(t, x0, y0, x1, y1, f) };
      });
    }

    envelopper(0x10C80, () => () => { index = null; });
  }

  // Les chargements sont notés même relevé éteint (un test de plus par fichier lu) : allumé en pleine
  // partie, le relevé sait déjà nommer les sprites.
  function installerLesChargements() {
    const noter = (a, lire) => {
      const f = T.fonction(a);
      if (f) T.remplacer(a, () => { const apres = lire(); return puis(f(), apres); });
    };
    noter(0x7F0B0, () => { const nom = lireUneChaine(argument(0)), dst = argument(1); return (r) => noterUnFichier(nom, dst, (r >>> 0) || (T.R.eax >>> 0)); });
    noter(0x1180E, () => { const nom = lireUneChaine(argument(0)), dst = argument(1), taille = argument(2); return () => noterUnFichier(nom, dst, taille); });
  }

  releve.installer = () => { installer(); installerLesChargements(); };
  // Allumer : les tampons du jeu définis, et leur contenu envoyé tel quel (le recalage : la liste part
  // de l'état du moment).
  releve.allumer = () => {
    releve.actif = true;
    // La vérification (plus bas, `verifier`) : un rendu de référence qui suit le flux depuis le recalage.
    reference = releve.verification ? new Reference() : null;
    releve.recaler();
  };
  releve.eteindre = () => { releve.actif = false; };
  // Tout redonner : chaque tampon suivi, l'écran compris, en pixels (la page repart de là).
  releve.recaler = () => {
    // (la page repart de rien : les sprites et les chaînes lui seront redéfinis à leur prochain usage)
    cles.clear();
    chaines.clear();
    suivreLesTamponsDuJeu();
    for (const t of releve.tampons.values()) {
      definirTampon(t);
      emettrePixels(t, 0, 0, t.l, t.h, lirePixels(t, 0, 0, t.l, t.h), null);
    }
    for (const t of releve.virtuels.values()) definirTampon(t);
    const te = ecranSuivi();
    definirTampon(te);
    emettrePixels(te, 0, 0, te.l, te.h, lirePixels(te, 0, 0, te.l, te.h), null);
    derniereePalette = null;
  };
  // La fin d'une image : la palette si elle a changé, puis OP.IMAGE.
  let derniereePalette = null;
  // LA VÉRIFICATION, pendant que la page rend en HD (`releve.verification`, allumée par défaut). Le
  // relevé est prouvé complet sur les scénarios (travail/hd/banc.mjs) ; mais un écran que les scénarios
  // n'atteignent pas pourrait écrire par un chemin que rien n'enveloppe. Le travailleur rejoue donc le
  // flux, à ×1, dans un rendu de référence (liste-affichage-reference.js, la définition même des
  // opérations), et toutes les `PERIODE_DE_VERIFICATION` images compare chaque tampon rejoué à celui du
  // jeu : ce qui diffère part à la page en pixels de 1994 (OP.PIXELS, le rectangle des pixels
  // différents), qui y retombe donc sur l'image d'origine, agrandie au plus proche ; `releve.recalages`
  // le compte (la page l'affiche). Coût mesuré : le rejeu, 0,2 à 1,5 ms par image selon la taille ; la
  // comparaison, quelques ms par seconde en grande vue.
  let reference = null, joue = 0, images = 0;
  const PERIODE_DE_VERIFICATION = 15;
  releve.verification = true;
  releve.recalages = 0;
  releve.pixelsRecales = 0;
  const jouerDansLaReference = () => {
    if (!reference || joue >= e.n) return;
    reference.jouer({ mots: e.mots.subarray(joue, e.n), octets: e.octets });
    joue = e.n;
  };
  function verifier() {
    jouerDansLaReference();
    const comparer = (t, r, jeu) => {
      const l = t.l, n = Math.min(r.pixels.length, jeu.length);
      let x0 = l, y0 = t.h, x1 = -1, y1 = -1, d = 0;
      for (let k = 0; k < n; k++) {
        if (r.pixels[k] === jeu[k]) continue;
        d++;
        const x = k % l, y = (k / l) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (!d) return;
      const L = x1 - x0 + 1, H = y1 - y0 + 1;
      const valeurs = new Uint8Array(L * H), avant = new Uint8Array(L * H);
      for (let j = 0; j < H; j++) {
        valeurs.set(jeu.subarray((y0 + j) * l + x0, (y0 + j) * l + x0 + L), j * L);
        avant.set(r.pixels.subarray((y0 + j) * l + x0, (y0 + j) * l + x0 + L), j * L);
      }
      emettrePixels(t, x0, y0, L, H, valeurs, avant);
      releve.recalages++;
      releve.pixelsRecales += d;
    };
    for (const t of releve.tampons.values()) {
      const r = reference.tampon(t.id);
      if (r && r.l === t.l && r.h === t.h) comparer(t, r, m8.subarray(t.adresse, t.adresse + t.l * t.h));
    }
    const te = ecranSuivi(), re = reference.tampon(te.id);
    if (re && re.l === te.l && re.h === te.h) comparer(te, re, lirePixels(te, 0, 0, te.l, te.h));
    jouerDansLaReference();
  }

  releve.image = (numero) => {
    suivreLesTamponsDuJeu();
    if (reference && ++images % PERIODE_DE_VERIFICATION === 0) verifier();
    const p = machine.video.palette;
    let change = !derniereePalette;
    if (!change) for (let k = 0; k < 768; k++) if (p[k] !== derniereePalette[k]) { change = true; break; }
    if (change) {
      derniereePalette = Uint8Array.from(p.subarray ? p.subarray(0, 768) : p.slice(0, 768));
      const a = e.placeOctets(768);
      e.octets.set(derniereePalette, a);
      e.op(OP.PALETTE, a);
    }
    const te = ecranSuivi();
    e.op(OP.IMAGE, numero, te.l, te.h);
    jouerDansLaReference();
  };
  releve.lot = () => { joue = 0; return e.lot(); };
  releve.lirePixels = lirePixels;
  releve.emettrePixels = emettrePixels;
  return releve;
}
