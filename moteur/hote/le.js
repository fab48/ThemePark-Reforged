// Chargeur d'executable LE (DOS/4GW) : place les objets de MAIN.EXE en memoire et applique les
// relocations. Meme logique que outils/le.py, dont il doit rester le miroir exact : le code
// transcrit a ete genere avec les memes bases de chargement.

// L'editeur de liens a pose l'objet 2 (0x110 octets de variables) a 0xA0000, la ou le jeu ecrit
// en absolu dans la memoire video VGA : on le deplace juste apres les donnees.
export const BASES_JEU = { 2: 0xE3000 };

export function lireLE(octets, bases = BASES_JEU) {
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const u32 = (o) => dv.getUint32(o, true);
  const h = u32(0x3C);
  if (octets[h] !== 0x4C || octets[h + 1] !== 0x45) throw new Error('pas un executable LE');
  const le = {
    nbPages: u32(h + 0x14),
    eipObjet: u32(h + 0x18), eip: u32(h + 0x1C),
    espObjet: u32(h + 0x20), esp: u32(h + 0x24),
    taillePage: u32(h + 0x28), tailleDernierePage: u32(h + 0x2C),
    tableObjets: h + u32(h + 0x40), nbObjets: u32(h + 0x44),
    tableFixupPages: h + u32(h + 0x68), tableFixupRecords: h + u32(h + 0x6C),
    pagesDonnees: u32(h + 0x80),
    objets: [],
  };
  for (let i = 0; i < le.nbObjets; i++) {
    const o = le.tableObjets + 24 * i;
    const numero = i + 1;
    le.objets.push({
      numero, tailleVirtuelle: u32(o), base: bases[numero] ?? u32(o + 4), drapeaux: u32(o + 8),
      indexPage: u32(o + 12), nbPages: u32(o + 16),
    });
  }
  le.pointEntree = le.objets[le.eipObjet - 1].base + le.eip;
  le.pileInitiale = le.objets[le.espObjet - 1].base + le.esp;
  return le;
}

function pageVersLineaire(le, page) {
  for (const ob of le.objets) {
    if (page >= ob.indexPage && page < ob.indexPage + ob.nbPages) {
      return ob.base + (page - ob.indexPage) * le.taillePage;
    }
  }
  throw new Error('page ' + page);
}

// Copie les objets dans la memoire m8 (Uint8Array couvrant l'espace lineaire) et applique les
// relocations. Retourne le descripteur LE. `surRelocation(source, cible)`, s'il est donne, est
// appele pour chaque champ de 32 bits reloge (l'image de l'introduction, image-intro.js, traduit
// ainsi les pointeurs logés dans les données d'INTRO.EXE).
export function chargerLE(octets, m8, bases = BASES_JEU, surRelocation = null) {
  const le = lireLE(octets, bases);
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const mem = new DataView(m8.buffer, m8.byteOffset, m8.byteLength);
  // pages
  for (const ob of le.objets) {
    m8.fill(0, ob.base, ob.base + ob.tailleVirtuelle);
    for (let p = ob.indexPage; p < ob.indexPage + ob.nbPages; p++) {
      const debut = le.pagesDonnees + (p - 1) * le.taillePage;
      const taille = p === le.nbPages ? le.tailleDernierePage : le.taillePage;
      const dest = ob.base + (p - ob.indexPage) * le.taillePage;
      m8.set(octets.subarray(debut, debut + taille), dest);
    }
  }
  // relocations
  let n = 0;
  for (let page = 1; page <= le.nbPages; page++) {
    const debut = dv.getUint32(le.tableFixupPages + 4 * (page - 1), true);
    const fin = dv.getUint32(le.tableFixupPages + 4 * page, true);
    let p = le.tableFixupRecords + debut;
    const pFin = le.tableFixupRecords + fin;
    const basePage = pageVersLineaire(le, page);
    while (p < pFin) {
      const src = octets[p], flags = octets[p + 1];
      p += 2;
      let offs = null, compte = 0;
      if (src & 0x20) { compte = octets[p]; p += 1; }
      else { offs = [dv.getInt16(p, true)]; p += 2; }
      if ((flags & 3) !== 0) throw new Error('relocation non interne');
      let obj;
      if (flags & 0x40) { obj = dv.getUint16(p, true); p += 2; } else { obj = octets[p]; p += 1; }
      let cible = 0;
      if ((src & 0xF) !== 2) {
        if (flags & 0x10) { cible = dv.getUint32(p, true); p += 4; } else { cible = dv.getUint16(p, true); p += 2; }
      }
      if (offs === null) {
        offs = [];
        for (let k = 0; k < compte; k++) offs.push(dv.getInt16(p + 2 * k, true));
        p += 2 * compte;
      }
      const valeur = (le.objets[obj - 1].base + cible) >>> 0;
      for (const off of offs) {
        const s = basePage + off;
        if ((src & 0xF) === 7) {
          // un champ peut deborder la fin de l'objet : on ecrit octet par octet
          const ob = le.objets.find((o) => s >= o.base && s < o.base + o.tailleVirtuelle);
          if (!ob) continue;
          for (let k = 0; k < 4 && s + k < ob.base + ob.tailleVirtuelle; k++) m8[s + k] = (valeur >>> (8 * k)) & 0xFF;
          if (surRelocation) surRelocation(s, valeur);
        } else if ((src & 0xF) === 5) {
          mem.setUint16(s, valeur & 0xFFFF, true);
        } else if ((src & 0xF) === 8) {
          mem.setInt32(s, valeur - (s + 4), true);
        }
        n++;
      }
    }
  }
  le.nbRelocations = n;
  return le;
}
