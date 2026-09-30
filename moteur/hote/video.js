// Carte video : mode 13h (320x200, 256 couleurs, memoire lineaire en 0xA0000) et modes VESA
// a fenetre de 64 Ko (640x480 en 256 couleurs, par banques), palette programmee par les ports
// 3C8h/3C9h, balayage vertical lu sur le port 3DAh.
//
// En mode VESA, le jeu ecrit dans la fenetre 0xA0000-0xAFFFF de la banque courante. A chaque
// changement de banque, on range le contenu de la fenetre dans la memoire video complete.

const FENETRE = 0xA0000;

// L'etat simple de la carte, sauve par les instantanes.
const CHAMPS = ['mode', 'largeur', 'hauteur', 'vesa', 'hz', 'banque', 'dacEcriture', 'dacLecture', 'dacComposante', 'us'];

// Le premier octet qui differe entre deux tableaux, ou -1 ; sous Node, par la comparaison native.
export function premierEcart(x, y, n) {
  const Tampon = globalThis.Buffer;
  if (Tampon && Tampon.from(x.buffer, x.byteOffset, n).equals(Tampon.from(y.buffer, y.byteOffset, n))) return -1;
  for (let k = 0; k < n; k++) if (x[k] !== y[k]) return k;
  return -1;
}

export class Video {
  constructor(machine) {
    this.m = machine;
    this.mode = 3;
    this.largeur = 320;
    this.hauteur = 200;
    this.vesa = false;
    this.banque = 0;
    this.vram = new Uint8Array(1 << 20);        // memoire video complete (modes VESA)
    this.palette = new Uint8Array(768);         // composantes sur 6 bits
    this.dacEcriture = 0; this.dacLecture = 0; this.dacComposante = 0;
    this.hz = 70;
    this.registres = new Map();
    this.indexReg = new Map();
    this.images = 0;
  }

  // --- balayage vertical ---------------------------------------------------------------------------
  avancer(us) { this.us = us; }
  etat() {
    const periode = 1e6 / this.hz;
    const phase = (this.m.us % periode) / periode;
    const retour = phase < 0.06;
    // bit 3 : retour vertical ; bit 0 : affichage inactif (retours horizontaux frequents)
    return (retour ? 0x08 : 0) | (retour || (Math.floor(this.m.us * 31.5) & 1) ? 0x01 : 0);
  }

  // --- palette -------------------------------------------------------------------------------------
  indexEcriture(i) { this.dacEcriture = i; this.dacComposante = 0; }
  indexLecture(i) { this.dacLecture = i; this.dacComposante = 0; }
  etatDac() { return 0; }
  ecrireDac(v) {
    this.palette[this.dacEcriture * 3 + this.dacComposante] = v & 0x3F;
    if (++this.dacComposante === 3) { this.dacComposante = 0; this.dacEcriture = (this.dacEcriture + 1) & 0xFF; }
  }
  lireDac() {
    const v = this.palette[this.dacLecture * 3 + this.dacComposante];
    if (++this.dacComposante === 3) { this.dacComposante = 0; this.dacLecture = (this.dacLecture + 1) & 0xFF; }
    return v;
  }

  // --- registres (sequenceur, controleur graphique, CRTC) -----------------------------------------
  ecrireRegistre(port, v) {
    if (port === 0x3C4 || port === 0x3CE || port === 0x3D4) { this.indexReg.set(port, v); return; }
    const idx = this.indexReg.get(port - 1) || 0;
    this.registres.set(`${port - 1}:${idx}`, v);
  }
  lireRegistre(port) {
    const idx = this.indexReg.get(port - 1) || 0;
    return this.registres.get(`${port - 1}:${idx}`) || 0;
  }

  // --- BIOS video ----------------------------------------------------------------------------------
  bios(R) { this.biosModeReel(R, true); }

  biosModeReel(R, protege = false) {
    const ax = R.eax & 0xFFFF, ah = ax >> 8;
    if (ah === 0x00) { this.changerMode(ax & 0x7F); return; }
    if (ah === 0x0F) { R.eax = (R.eax & ~0xFFFF) | (80 << 8) | this.mode; R.ebx &= ~0xFF00; return; }
    if (ah === 0x10) { return; }
    if (ah === 0x4F) return this.vbe(R, protege);
    if (ah === 0x0B || ah === 0x02 || ah === 0x09 || ah === 0x0E) return;
    this.m.inconnu('int 10 ax=' + ax.toString(16));
  }

  changerMode(mode) {
    this.mode = mode;
    this.vesa = mode >= 0x100;
    if (mode === 0x13) { this.largeur = 320; this.hauteur = 200; this.hz = 70; }
    else if (mode === 0x101) { this.largeur = 640; this.hauteur = 480; this.hz = 60; }
    else if (mode === 0x100) { this.largeur = 640; this.hauteur = 400; this.hz = 70; }
    this.banque = 0;
    this.m.m8.fill(0, FENETRE, FENETRE + 0x10000);
    this.vram.fill(0);
    this.m.journal(`mode video ${mode.toString(16)} (${this.largeur}x${this.hauteur})`);
  }

  // La grande vue (moteur/jeu/grande-vue.js), hors du jeu d'origine : un mode VESA à fenêtre de 64 Ko
  // de largeur x hauteur, que le jeu ne demande pas lui-même par l'int 10h. Il garde le numéro du
  // mode 640x480, 0x101, que le jeu relirait (4F03h).
  changerModeLibre(largeur, hauteur) {
    this.mode = 0x101;
    this.vesa = true;
    this.largeur = largeur; this.hauteur = hauteur; this.hz = 60;
    const taille = Math.max(1 << 20, ((largeur * hauteur + 0xFFFF) >>> 16) << 16);
    if (this.vram.length < taille) this.vram = new Uint8Array(taille);
    this.banque = 0;
    this.m.m8.fill(0, FENETRE, FENETRE + 0x10000);
    this.vram.fill(0);
    this.m.journal(`mode video libre (${largeur}x${hauteur})`);
  }

  vbe(R, protege) {
    const ax = R.eax & 0xFFFF;
    const m = this.m;
    const dest = protege ? (R.edi >>> 0) + m.base(R.es) : ((R.es & 0xFFFF) << 4) + (R.edi & 0xFFFF);
    const ok = () => { R.eax = (R.eax & ~0xFFFF) | 0x004F; };
    switch (ax) {
      case 0x4F00: {   // informations VBE
        m.m8.fill(0, dest, dest + 256);
        m.ecrireChaine(dest, 'VESA');
        m.w16(dest + 4, 0x0102);
        // liste des modes : placee dans le bloc lui-meme
        const liste = dest + 0x100 - 16;
        m.w16(liste, 0x100); m.w16(liste + 2, 0x101); m.w16(liste + 4, 0xFFFF);
        m.w16(dest + 0x0E, liste & 0xF); m.w16(dest + 0x10, liste >> 4);
        m.w16(dest + 0x12, 16);
        return ok();
      }
      case 0x4F01: {   // informations sur un mode
        const mode = R.ecx & 0x1FF;
        m.m8.fill(0, dest, dest + 256);
        const l = mode === 0x101 ? 640 : 640, h = mode === 0x101 ? 480 : 400;
        m.w16(dest, 0x9B);            // attributs : supporte, couleur, graphique
        m.m8[dest + 2] = 7; m.m8[dest + 3] = 0;          // fenetre A lisible/inscriptible
        m.w16(dest + 4, 64);          // granularite (Ko)
        m.w16(dest + 6, 64);          // taille de fenetre (Ko)
        m.w16(dest + 8, 0xA000);      // segment de la fenetre A
        m.w32(dest + 0x0C, 0);        // fonction de fenetre (non fournie : passer par int 10h)
        m.w16(dest + 0x10, l);        // octets par ligne
        m.w16(dest + 0x12, l); m.w16(dest + 0x14, h);
        m.m8[dest + 0x19] = 8; m.m8[dest + 0x1B] = 4;   // 8 bits par pixel, modele a palette
        return ok();
      }
      case 0x4F02: this.changerMode(R.ebx & 0x1FF); return ok();
      case 0x4F03: R.ebx = (R.ebx & ~0xFFFF) | this.mode; return ok();
      case 0x4F05: {
        if ((R.ebx & 0xFF00) === 0) { this.changerBanque(R.edx & 0xFFFF); }
        else { R.edx = (R.edx & ~0xFFFF) | this.banque; }
        return ok();
      }
    }
    m.inconnu('VBE ' + ax.toString(16));
    R.eax = (R.eax & ~0xFFFF) | 0x014F;
  }

  changerBanque(b) {
    if (b === this.banque) return;
    this.rangerFenetre();
    this.banque = b;
    const src = b * 0x10000;
    this.m.m8.set(this.vram.subarray(src, src + 0x10000), FENETRE);
  }
  rangerFenetre() {
    this.vram.set(this.m.m8.subarray(FENETRE, FENETRE + 0x10000), this.banque * 0x10000);
  }

  // --- instantanes ---------------------------------------------------------------------------------
  // L'etat de la carte, pour la comparaison appel par appel (voir Machine.instantane). La memoire
  // video complete n'est copiee qu'en mode VESA, et seulement ses banques utiles. `dans` permet de
  // reutiliser les copies d'un instantane precedent.
  instantane(dans = {}) {
    dans.champs = CHAMPS.map((k) => this[k]);
    if (!dans.palette) dans.palette = new Uint8Array(768);
    dans.palette.set(this.palette);
    const utile = this.vesa ? Math.min(this.vram.length, ((this.largeur * this.hauteur + 0xFFFF) >>> 16) << 16) : 0;
    if (utile) {
      if (!dans.vram || dans.vram.length !== utile) dans.vram = new Uint8Array(utile);
      dans.vram.set(this.vram.subarray(0, utile));
    }
    dans.utile = utile;
    dans.registres = new Map(this.registres);
    dans.indexReg = new Map(this.indexReg);
    return dans;
  }

  restaurer(s) {
    CHAMPS.forEach((k, i) => { this[k] = s.champs[i]; });
    this.palette.set(s.palette);
    if (s.utile) this.vram.set(s.vram.subarray(0, s.utile));
    this.registres = new Map(s.registres);
    this.indexReg = new Map(s.indexReg);
  }

  // Ce qui differe entre deux instantanes (a : obtenu, b : reference).
  ecarts(a, b) {
    const ecarts = [];
    CHAMPS.forEach((k, i) => { if (a.champs[i] !== b.champs[i]) ecarts.push(`video.${k} : ${a.champs[i]} / ${b.champs[i]}`); });
    const premier = premierEcart;
    const p = premier(a.palette, b.palette, 768);
    if (p >= 0) ecarts.push(`palette, couleur ${Math.floor(p / 3)}`);
    if (a.utile !== b.utile) ecarts.push('memoire video : pas la meme etendue');
    else if (a.utile) {
      const v = premier(a.vram, b.vram, a.utile);
      if (v >= 0) ecarts.push(`memoire video, octet 0x${v.toString(16)} (banque ${v >>> 16}) : ${a.vram[v]} / ${b.vram[v]}`);
    }
    return ecarts;
  }

  // --- image affichee ------------------------------------------------------------------------------
  // Retourne { largeur, hauteur, rgba } de l'ecran tel qu'il serait affiche.
  image() {
    const l = this.largeur, h = this.hauteur;
    const rgba = new Uint8ClampedArray(l * h * 4);
    let src;
    if (this.vesa) { this.rangerFenetre(); src = this.vram; }
    else src = this.m.m8.subarray(FENETRE, FENETRE + l * h);
    const pal = this.palette;
    for (let k = 0; k < l * h; k++) {
      const c = src[k] * 3;
      rgba[4 * k] = pal[c] << 2 | pal[c] >> 4;
      rgba[4 * k + 1] = pal[c + 1] << 2 | pal[c + 1] >> 4;
      rgba[4 * k + 2] = pal[c + 2] << 2 | pal[c + 2] >> 4;
      rgba[4 * k + 3] = 255;
    }
    return { largeur: l, hauteur: h, rgba };
  }
}
