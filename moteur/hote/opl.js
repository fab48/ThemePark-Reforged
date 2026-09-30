// SPDX-License-Identifier: LGPL-2.1-or-later
//
// Ce fichier est derive de Nuked OPL3, Copyright (C) 2013-2020 Nuke.YKT, logiciel libre distribue
// sous la licence GNU LGPL, version 2.1 ou (a votre choix) toute version ulterieure. Il est
// distribue sous la meme licence, sans aucune garantie ; son texte est dans LICENCES/LGPL-2.1.txt.
// Le reste du depot n'est pas concerne.
//
// Modification : reecriture en JavaScript pour le moteur de Theme Park, 21 septembre 2026. Le
// generateur d'enveloppe, la generation de la phase (vibrato, bits des percussions, bruit), les
// formes d'onde et l'avance des horloges suivent le fonctionnement et le decoupage de Nuked OPL3 ;
// la structure des canaux, le rendu, les minuteries et les instantanes sont propres a ce fichier.
//
// La puce de synthese FM des cartes son de 1994 : Yamaha YMF262 (OPL3), compatible YM3812 (OPL2).
//
// La musique de Theme Park est jouee par le pilote FM de la bibliotheque HMI SOS, qui est compile
// dans MAIN.EXE et donc transcrit : il ecrit les registres de la puce par les ports 0x388 et 0x389,
// comme en 1994. Il ne manque que la puce elle-meme, la voici. Elle recoit des ecritures de
// registres et produit des echantillons a sa frequence propre, 49 716 Hz (14,318 MHz / 288).
//
// Operateurs, canaux a 2 et 4 operateurs, mode percussions, minuteries et registre d'etat. Les
// tables de sinus logarithmique et d'exponentielle sont calculees par leur formule plutot que
// recopiees de la ROM de la puce : les ecarts sont de quelques millimes, inaudibles.

export const FREQUENCE_OPL = 49716;

// --- tables --------------------------------------------------------------------------------------
// Sinus logarithmique : -log2(sin(x)) sur un quart de periode, en 1/256 d'octave.
const LOGSIN = new Uint16Array(256);
// Exponentielle : 2^(i/256) - 1, sur 10 bits.
const EXP = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  LOGSIN[i] = Math.round(-Math.log2(Math.sin((i + 0.5) * Math.PI / 512)) * 256);
  EXP[i] = Math.round((Math.pow(2, i / 256) - 1) * 1024);
}
// Multiplicateur de frequence des operateurs, doubles (0 vaut 1/2).
const MULTIPLE = [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 20, 24, 24, 30, 30];
// Attenuation selon la hauteur de la note (KSL), et son echelle selon le registre.
const KSL_ROM = [0, 32, 40, 45, 48, 51, 53, 55, 56, 58, 59, 60, 61, 62, 63, 64];
const KSL_DECALAGE = [8, 1, 2, 0];
// Pas de l'enveloppe pour les taux rapides, selon les deux bits bas du taux et de la minuterie.
const EG_PAS = [[0, 0, 0, 0], [1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 0]];
// Operateurs d'un canal : le registre d'un operateur est adresse par son rang dans la puce,
// qui n'est pas celui des canaux (0x20 + 0..5, 8..13, 16..21 pour chaque banc).
const RANG_OPERATEUR = [0, 1, 2, 3, 4, 5, -1, -1, 6, 7, 8, 9, 10, 11, -1, -1, 12, 13, 14, 15, 16, 17, -1, -1,
  -1, -1, -1, -1, -1, -1, -1, -1];
// Pour chaque canal d'un banc (0..8), ses deux operateurs dans l'ordre de la puce.
const OPERATEURS_DU_CANAL = [[0, 3], [1, 4], [2, 5], [6, 9], [7, 10], [8, 11], [12, 15], [13, 16], [14, 17]];

const ATTAQUE = 0, DECROISSANCE = 1, SOUTIEN = 2, RELACHE = 3;
const SILENCE = 0x1000;          // attenuation au-dela de laquelle l'exponentielle rend 0

// Niveau logarithmique (1/256 d'octave) -> amplitude lineaire sur 13 bits.
function exponentielle(niveau) {
  if (niveau > 0x1FFF) niveau = 0x1FFF;
  return ((EXP[(niveau & 0xFF) ^ 0xFF] + 1024) << 1) >> (niveau >> 8);
}

// Les huit formes d'onde, de phase 10 bits et d'enveloppe 9 bits.
function onde(forme, phase, enveloppe) {
  phase &= 0x3FF;
  const env = enveloppe << 3;
  let log, negatif = false;
  switch (forme) {
    case 0:           // sinus
      negatif = (phase & 0x200) !== 0;
      log = phase & 0x100 ? LOGSIN[(phase & 0xFF) ^ 0xFF] : LOGSIN[phase & 0xFF];
      break;
    case 1:           // demi-sinus
      log = phase & 0x200 ? SILENCE : phase & 0x100 ? LOGSIN[(phase & 0xFF) ^ 0xFF] : LOGSIN[phase & 0xFF];
      break;
    case 2:           // sinus redresse
      log = phase & 0x100 ? LOGSIN[(phase & 0xFF) ^ 0xFF] : LOGSIN[phase & 0xFF];
      break;
    case 3:           // quarts de sinus
      log = phase & 0x100 ? SILENCE : LOGSIN[phase & 0xFF];
      break;
    case 4:           // sinus alterne (OPL3)
      negatif = (phase & 0x300) === 0x100;
      log = phase & 0x200 ? SILENCE : phase & 0x80 ? LOGSIN[((phase ^ 0xFF) << 1) & 0xFF] : LOGSIN[(phase << 1) & 0xFF];
      break;
    case 5:           // sinus alterne redresse (OPL3)
      log = phase & 0x200 ? SILENCE : phase & 0x80 ? LOGSIN[((phase ^ 0xFF) << 1) & 0xFF] : LOGSIN[(phase << 1) & 0xFF];
      break;
    case 6:           // carre (OPL3)
      negatif = (phase & 0x200) !== 0;
      log = 0;
      break;
    default:          // dent de scie logarithmique (OPL3)
      if (phase & 0x200) { negatif = true; phase = (phase & 0x1FF) ^ 0x1FF; }
      log = phase << 3;
  }
  const v = exponentielle(log + env);
  return negatif ? ~v : v;
}

function nouvelOperateur(numero) {
  return {
    numero,
    canal: null,           // canal a 2 operateurs auquel l'operateur appartient
    // registres
    am: 0, vib: 0, egt: 0, ksr: 0, mult: 0, ksl: 0, tl: 0, ar: 0, dr: 0, sl: 0, rr: 0, forme: 0,
    // generateur de phase
    phase: 0, phaseSortie: 0, remise: false,
    // generateur d'enveloppe
    eg: 0x1FF, egSortie: 0x1FF, etatEg: RELACHE, cle: 0, kslCalc: 0,
    // sortie, et la precedente (contre-reaction)
    sortie: 0, precedente: 0, modulation: 0,
  };
}

function nouveauCanal(numero) {
  return {
    numero,
    ops: null,             // ses deux operateurs
    fnum: 0, bloc: 0, ksv: 0, fb: 0, cnt: 0,
    gauche: true, droite: true,
    paire: null,           // canal associe en mode 4 operateurs
    quatre: 0,             // 0 : canal a 2 operateurs ; 1 : premier d'une paire ; 2 : second
  };
}

export class Opl {
  constructor() {
    this.operateurs = Array.from({ length: 36 }, (_, k) => nouvelOperateur(k));
    this.canaux = Array.from({ length: 18 }, (_, k) => nouveauCanal(k));
    for (let c = 0; c < 18; c++) {
      const banc = c < 9 ? 0 : 18, [a, b] = OPERATEURS_DU_CANAL[c % 9];
      const canal = this.canaux[c];
      canal.ops = [this.operateurs[banc + a], this.operateurs[banc + b]];
      canal.ops[0].canal = canal; canal.ops[1].canal = canal;
    }
    // paires possibles en mode 4 operateurs : (0,3) (1,4) (2,5) dans chaque banc
    for (const [a, b] of [[0, 3], [1, 4], [2, 5], [9, 12], [10, 13], [11, 14]]) {
      this.canaux[a].paire = this.canaux[b]; this.canaux[b].paire = this.canaux[a];
    }
    this.reinitialiser();
  }

  reinitialiser() {
    for (const op of this.operateurs) Object.assign(op, nouvelOperateur(op.numero), { canal: op.canal });
    for (const c of this.canaux) Object.assign(c, { fnum: 0, bloc: 0, ksv: 0, fb: 0, cnt: 0, gauche: true, droite: true, quatre: 0 });
    this.registres = new Uint8Array(0x200);
    this.nouveau = 0;           // bit NEW (0x105) : fonctions de l'OPL3
    this.nts = 0;               // selection de note (0x08, bit 6)
    this.rythme = 0;            // registre 0xBD
    this.tremoloProfond = false; this.vibratoProfond = false;
    this.compteur = 0;          // echantillons produits (minuterie des oscillateurs basse frequence)
    this.tremoloPos = 0; this.tremolo = 0; this.vibratoPos = 0;
    this.egMinuterie = 0; this.egEtat = 0; this.egAjout = 0; this.egMinuterieBas = 0;
    this.bruit = 1;
    this.rmHh2 = 0; this.rmHh3 = 0; this.rmHh7 = 0; this.rmHh8 = 0; this.rmTc3 = 0; this.rmTc5 = 0;
    this.minuteries = { valeur1: 0, valeur2: 0, controle: 0, debut1: 0, debut2: 0, etat: 0 };
  }

  // --- registres -----------------------------------------------------------------------------------
  // registre : 0..0x1FF (le banc haut est celui des ports base+2 et base+3) ; us : l'heure, pour les
  // minuteries.
  ecrire(registre, valeur, us = 0) {
    registre &= 0x1FF; valeur &= 0xFF;
    this.registres[registre] = valeur;
    const haut = registre & 0x100, r = registre & 0xFF;
    const banc = haut ? 18 : 0;
    if (r >= 0x20 && r <= 0xF5 && r !== 0xBD && (r < 0xA0 || r >= 0xE0)) {
      const rang = RANG_OPERATEUR[r & 0x1F];
      if (rang < 0) return;
      const op = this.operateurs[banc + rang];
      switch (r & 0xE0) {
        case 0x20:
          op.am = valeur >> 7 & 1; op.vib = valeur >> 6 & 1; op.egt = valeur >> 5 & 1;
          op.ksr = valeur >> 4 & 1; op.mult = valeur & 0x0F;
          break;
        case 0x40: op.ksl = valeur >> 6; op.tl = valeur & 0x3F; break;
        case 0x60: op.ar = valeur >> 4; op.dr = valeur & 0x0F; break;
        case 0x80: op.sl = valeur >> 4; if (op.sl === 0x0F) op.sl = 0x1F; op.rr = valeur & 0x0F; break;
        case 0xE0: op.forme = this.nouveau ? valeur & 7 : valeur & 3; break;
      }
      return;
    }
    if (r >= 0xA0 && r <= 0xC8 && (r & 0x0F) <= 8) {
      const canal = this.canaux[(haut ? 9 : 0) + (r & 0x0F)];
      switch (r & 0xF0) {
        case 0xA0:
          // le second canal d'une paire a 4 operateurs suit le premier
          if (canal.quatre !== 2) this.frequence(canal, (canal.fnum & 0x300) | valeur, canal.bloc);
          break;
        case 0xB0:
          if (canal.quatre === 2) break;
          this.frequence(canal, (canal.fnum & 0xFF) | (valeur & 3) << 8, valeur >> 2 & 7);
          this.cle(canal, valeur & 0x20);
          break;
        case 0xC0:
          canal.fb = valeur >> 1 & 7; canal.cnt = valeur & 1;
          canal.gauche = this.nouveau ? (valeur & 0x10) !== 0 : true;
          canal.droite = this.nouveau ? (valeur & 0x20) !== 0 : true;
          break;
      }
      return;
    }
    switch (registre) {
      case 0x02: this.minuteries.valeur1 = valeur; return;
      case 0x03: this.minuteries.valeur2 = valeur; return;
      case 0x04: {
        const m = this.minuteries;
        if (valeur & 0x80) { m.etat = 0; return; }
        if ((valeur & 1) && !(m.controle & 1)) m.debut1 = us;
        if ((valeur & 2) && !(m.controle & 2)) m.debut2 = us;
        m.controle = valeur;
        return;
      }
      case 0x08: this.nts = valeur >> 6 & 1; return;
      case 0xBD:
        this.tremoloProfond = (valeur & 0x80) !== 0; this.vibratoProfond = (valeur & 0x40) !== 0;
        this.rythmes(valeur);
        return;
      case 0x104: this.quatreOperateurs(valeur); return;
      case 0x105: this.nouveau = valeur & 1; return;
    }
  }

  frequence(canal, fnum, bloc) {
    canal.fnum = fnum; canal.bloc = bloc;
    canal.ksv = (bloc << 1) | ((fnum >> (9 - this.nts)) & 1);
    let ksl = (KSL_ROM[fnum >> 6] << 2) - ((8 - bloc) << 5);
    if (ksl < 0) ksl = 0;
    canal.ops[0].kslCalc = ksl; canal.ops[1].kslCalc = ksl;
    // le second canal d'une paire a 4 operateurs suit la frequence du premier
    if (canal.quatre === 1) this.frequence(canal.paire, fnum, bloc);
  }

  cle(canal, marche) {
    const ops = canal.quatre === 1 ? [...canal.ops, ...canal.paire.ops] : canal.quatre === 2 ? [] : canal.ops;
    for (const op of ops) this.cleOperateur(op, marche ? 1 : 0, 1);
  }
  // deux sources de declenchement : le canal (bit 0) et les percussions (bit 1)
  cleOperateur(op, marche, source) {
    op.cle = marche ? op.cle | source : op.cle & ~source;
  }

  rythmes(valeur) {
    const avant = this.rythme;
    this.rythme = valeur & 0x3F;
    const o = this.operateurs;
    if (this.rythme & 0x20) {
      this.cleOperateur(o[12], valeur & 0x10, 2); this.cleOperateur(o[15], valeur & 0x10, 2);   // grosse caisse
      this.cleOperateur(o[13], valeur & 0x01, 2);      // charleston
      this.cleOperateur(o[16], valeur & 0x08, 2);      // caisse claire
      this.cleOperateur(o[14], valeur & 0x04, 2);      // tom
      this.cleOperateur(o[17], valeur & 0x02, 2);      // cymbale
    } else if (avant & 0x20) {
      for (const k of [12, 13, 14, 15, 16, 17]) this.cleOperateur(o[k], 0, 2);
    }
  }

  quatreOperateurs(valeur) {
    const premiers = [0, 1, 2, 9, 10, 11];
    for (let k = 0; k < 6; k++) {
      const c = this.canaux[premiers[k]], actif = this.nouveau && (valeur >> k & 1);
      c.quatre = actif ? 1 : 0; c.paire.quatre = actif ? 2 : 0;
    }
  }

  // registre d'etat : minuteries echues (bits 6 et 5) et leur interruption (bit 7)
  etat(us = 0) {
    const m = this.minuteries;
    if ((m.controle & 1) && !(m.controle & 0x40) && us - m.debut1 >= 80 * (256 - m.valeur1)) m.etat |= 0x40;
    if ((m.controle & 2) && !(m.controle & 0x20) && us - m.debut2 >= 320 * (256 - m.valeur2)) m.etat |= 0x20;
    return m.etat ? m.etat | 0x80 : 0;
  }

  // --- generation ----------------------------------------------------------------------------------
  enveloppe(op) {
    const canal = op.canal;
    let sortie = op.eg + (op.tl << 2) + (op.kslCalc >> KSL_DECALAGE[op.ksl]) + (op.am ? this.tremolo : 0);
    op.egSortie = sortie > 0x1FF ? 0x1FF : sortie;
    let taux = 0, remise = false;
    if (op.cle && op.etatEg === RELACHE) { remise = true; taux = op.ar; }
    else {
      switch (op.etatEg) {
        case ATTAQUE: taux = op.ar; break;
        case DECROISSANCE: taux = op.dr; break;
        case SOUTIEN: if (!op.egt) taux = op.rr; break;
        default: taux = op.rr;
      }
    }
    op.remise = remise;
    const ks = canal.ksv >> ((op.ksr ^ 1) << 1);
    const t = ks + (taux << 2);
    let tHaut = t >> 2;
    const tBas = t & 3;
    if (tHaut & 0x10) tHaut = 0x0F;
    let pas = 0;
    if (taux !== 0) {
      if (tHaut < 12) {
        if (this.egEtat) {
          const d = tHaut + this.egAjout;
          if (d === 12) pas = 1;
          else if (d === 13) pas = (tBas >> 1) & 1;
          else if (d === 14) pas = tBas & 1;
        }
      } else {
        pas = (tHaut & 3) + EG_PAS[tBas][this.egMinuterieBas];
        if (pas & 4) pas = 3;
        if (!pas) pas = this.egEtat;
      }
    }
    let eg = op.eg, inc = 0;
    if (remise && tHaut === 0x0F) eg = 0;                 // attaque instantanee
    const eteint = (op.eg & 0x1F8) === 0x1F8;
    if (op.etatEg !== ATTAQUE && !remise && eteint) eg = 0x1FF;
    switch (op.etatEg) {
      case ATTAQUE:
        if (op.eg === 0) op.etatEg = DECROISSANCE;
        else if (op.cle && pas > 0 && tHaut !== 0x0F) inc = (~op.eg) >> (4 - pas);
        break;
      case DECROISSANCE:
        if ((op.eg >> 4) === op.sl) op.etatEg = SOUTIEN;
        else if (!eteint && !remise && pas > 0) inc = 1 << (pas - 1);
        break;
      default:
        if (!eteint && !remise && pas > 0) inc = 1 << (pas - 1);
    }
    op.eg = (eg + inc) & 0x1FF;
    if (remise) op.etatEg = ATTAQUE;
    if (!op.cle) op.etatEg = RELACHE;
  }

  phase(op) {
    const canal = op.canal;
    let fnum = canal.fnum;
    if (op.vib) {
      let ecart = (fnum >> 7) & 7;
      const v = this.vibratoPos;
      if (!(v & 3)) ecart = 0;
      else if (v & 1) ecart >>= 1;
      if (!this.vibratoProfond) ecart >>= 1;
      if (v & 4) ecart = -ecart;
      fnum += ecart;
    }
    const base = (fnum << canal.bloc) >> 1;
    const ph = op.phase;
    if (op.remise) op.phase = 0;
    // la sortie est prise avant l'increment
    op.phaseSortie = ph >>> 9;
    const n = op.numero;
    if (n === 13) {                                     // charleston : bits pour le bruit
      this.rmHh2 = (ph >>> 11) & 1; this.rmHh3 = (ph >>> 12) & 1;
      this.rmHh7 = (ph >>> 16) & 1; this.rmHh8 = (ph >>> 17) & 1;
    }
    if (n === 17 && (this.rythme & 0x20)) { this.rmTc3 = (ph >>> 12) & 1; this.rmTc5 = (ph >>> 14) & 1; }
    if ((this.rythme & 0x20) && (n === 13 || n === 16 || n === 17)) {
      const x = (this.rmHh2 ^ this.rmHh7) | (this.rmHh3 ^ this.rmTc5) | (this.rmTc3 ^ this.rmTc5);
      if (n === 13) op.phaseSortie = (x << 9) | ((x ^ (this.bruit & 1)) ? 0xD0 : 0x34);
      else if (n === 16) op.phaseSortie = (this.rmHh8 << 9) | ((this.rmHh8 ^ (this.bruit & 1)) << 8);
      else op.phaseSortie = (x << 9) | 0x80;
    }
    op.phase = (op.phase + ((base * MULTIPLE[op.mult]) >>> 1)) >>> 0;
  }

  // Un operateur : phase + modulation, enveloppe. La contre-reaction du premier operateur d'un
  // canal est la moyenne de ses deux dernieres sorties.
  operateur(op, modulation) {
    op.precedente = op.sortie;
    op.sortie = onde(op.forme, op.phaseSortie + modulation, op.egSortie);
    return op.sortie;
  }
  contreReaction(canal) {
    const op = canal.ops[0];
    return canal.fb ? (op.precedente + op.sortie) >> (9 - canal.fb) : 0;
  }

  // Un echantillon : [gauche, droite] dans sortie[k], sortie[k + 1] (entiers ~16 bits).
  echantillon(sortie, k) {
    // sans le bit NEW, le banc haut de l'OPL3 reste muet : on ne le calcule pas
    const ops = this.operateurs, nbOps = this.nouveau ? 36 : 18;
    for (let i = 0; i < nbOps; i++) { this.enveloppe(ops[i]); this.phase(ops[i]); }
    let g = 0, d = 0;
    const percussions = (this.rythme & 0x20) !== 0;
    const nbCanaux = this.nouveau ? 18 : 9;
    for (let c = 0; c < nbCanaux; c++) {
      const canal = this.canaux[c];
      if (canal.quatre === 2) continue;
      let v;
      if (percussions && c >= 6 && c <= 8) v = this.percussion(canal);
      else if (canal.quatre === 1) v = this.canalQuatre(canal);
      else {
        const [a, b] = canal.ops;
        const m = this.operateur(a, this.contreReaction(canal));
        const s = this.operateur(b, canal.cnt ? 0 : m);
        v = canal.cnt ? m + s : s;
      }
      if (canal.gauche) g += v;
      if (canal.droite) d += v;
    }
    sortie[k] = g > 32767 ? 32767 : g < -32768 ? -32768 : g;
    sortie[k + 1] = d > 32767 ? 32767 : d < -32768 ? -32768 : d;
    this.avancerHorloges();
  }

  canalQuatre(canal) {
    const [a, b] = canal.ops, [c, d] = canal.paire.ops;
    const m = this.operateur(a, this.contreReaction(canal));
    switch (canal.cnt << 1 | canal.paire.cnt) {
      case 0: { const x = this.operateur(b, m); const y = this.operateur(c, x); return this.operateur(d, y); }
      case 1: { const x = this.operateur(b, m); const y = this.operateur(c, 0); return x + this.operateur(d, y); }
      case 2: { const x = this.operateur(b, 0); const y = this.operateur(c, x); return m + this.operateur(d, y); }
      default: { const x = this.operateur(b, 0); const y = this.operateur(c, x); return m + this.operateur(d, 0); }
    }
  }

  // Mode percussions : grosse caisse (canal 6, deux operateurs), charleston et caisse claire
  // (canal 7), tom et cymbale (canal 8), chacun sur un seul operateur. Leur sortie compte double.
  percussion(canal) {
    const [a, b] = canal.ops;
    if (canal.numero === 6) {
      const m = this.operateur(a, this.contreReaction(canal));
      return 2 * this.operateur(b, canal.cnt ? 0 : m);
    }
    return 2 * (this.operateur(a, 0) + this.operateur(b, 0));
  }

  avancerHorloges() {
    const t = this.compteur;
    if ((t & 0x3F) === 0x3F) this.tremoloPos = (this.tremoloPos + 1) % 210;
    const p = this.tremoloPos < 105 ? this.tremoloPos : 210 - this.tremoloPos;
    this.tremolo = p >> (this.tremoloProfond ? 2 : 4);
    if ((t & 0x3FF) === 0x3FF) this.vibratoPos = (this.vibratoPos + 1) & 7;
    this.compteur = (t + 1) & 0x3FFFFFFF;
    // l'enveloppe avance un echantillon sur deux ; l'ecart entre deux pas depend du nombre de zeros
    // en fin de sa minuterie, dont seuls comptent les 13 bits bas
    if (this.egEtat) {
      let z = 0;
      while (z < 13 && ((this.egMinuterie >> z) & 1) === 0) z++;
      this.egAjout = z > 12 ? 0 : z + 1;
      this.egMinuterieBas = this.egMinuterie & 3;
      this.egMinuterie = (this.egMinuterie + 1) & 0x1FFF;
    }
    this.egEtat ^= 1;
    // bruit des percussions : registre a decalage de 23 bits
    const b = this.bruit;
    this.bruit = (b >>> 1) | ((((b >>> 14) ^ b) & 1) << 22);
  }

  // n echantillons a 49 716 Hz dans sortie (Int16Array ou Float32Array, gauche/droite entrelaces)
  generer(sortie, n, debut = 0) {
    for (let k = 0; k < n; k++) this.echantillon(sortie, debut + 2 * k);
  }

  // --- instantanes ---------------------------------------------------------------------------------
  instantane() {
    const copie = (o) => { const r = { ...o }; delete r.canal; delete r.ops; delete r.paire; return r; };
    const puce = {};
    for (const [k, v] of Object.entries(this)) if (typeof v !== 'object') puce[k] = v;
    return {
      puce, registres: this.registres.slice(), minuteries: { ...this.minuteries },
      operateurs: this.operateurs.map(copie), canaux: this.canaux.map(copie),
    };
  }
  restaurer(s) {
    Object.assign(this, s.puce);
    this.registres = s.registres.slice();
    this.minuteries = { ...s.minuteries };
    s.operateurs.forEach((o, k) => Object.assign(this.operateurs[k], o));
    s.canaux.forEach((c, k) => Object.assign(this.canaux[k], c));
  }
}
