// L'image du programme : ce que le moteur autonome garde de MAIN.EXE — ses données, pas son code.
//
// Le code lisible (moteur/jeu/) garde l'état du jeu à ses adresses de 1994 et lit les tables et les
// valeurs de départ du programme là où MAIN.EXE les range : l'objet des données, chargé à 0xB0000,
// ses relocations appliquées (les pointeurs vers des fonctions y valent les adresses de celles-ci,
// par lesquelles le moteur les désigne toujours). Quelques tables sont logées dans l'objet du code,
// entre les fonctions : les couleurs des flocons (0x47A23), les pas des directions (0x62CB3), les
// décalages des catalogues (0x6A648), les chiffres de itoa (0x8FB2A), le sélecteur des données
// (0x7E340)... Le moteur autonome (moteur/hote/processeur.js) n'exécute aucune instruction : il lui
// suffit de ces octets-là.
//
// `extraireLImage` les tire de MAIN.EXE : l'objet des données jusqu'à son dernier octet non nul (le
// reste, comme l'objet 2, est à zéro), et, dans l'objet du code, les « îles » : les octets que le
// désassembleur ne décode pas en instructions (outils/desassembler.py, `trous` ; 127 îles, 13 213
// octets), soit toutes les données logées dans le code, avec leurs tables de sauts, et deux petites
// îles de plus (voir `ILES`). `ecrireLImage` et `lireLImage` en font un fichier (le format de
// programme.bin ; les assets n'en gardent que des tables lisibles, tables-du-programme.js, dont
// assets-du-jeu.js le refait) ; `chargerLImage` le pose en mémoire au démarrage, à la place du
// chargeur LE (le.js). Tout cela tourne sous Node comme dans la page, qui peut donc
// extraire l'image du CD du joueur.
//
// Le code lisible vise les adresses d'une édition précise de MAIN.EXE : celle du CD de 1994
// (841 223 octets). `EDITION` en garde l'empreinte ; une autre édition est refusée.

import { chargerLE } from './le.js';

export const EDITION = {
  taille: 841223,
  sha256: '79d3e5734b11bb3a4d290fce9b5e87aae44940e01525b74ca23803af7707c85e',
};

// Les objets de MAIN.EXE, tels que le chargeur les place (le.js, BASES_JEU).
const CODE = [0x10000, 0x94DEB];
const DONNEES = [0xB0000, 0xE2340];
const VARIABLES = [0xE3000, 0xE3110];      // l'objet 2 : 0x110 octets, tous nuls au départ

// Les îles de données de l'objet du code : [adresse, taille]. Deux ne sont pas des trous du
// désassembleur, mais des octets que le programme lit aussi comme des données : « con » (0x7E342),
// le nom de la console où les erreurs fatales écrivent leur message, décodé comme des instructions
// à la suite de la marque de Watcom ; et 0x878B0, l'instruction qui suit l'appel de l'erreur de
// pile dans `write`, dont l'adresse de retour tient lieu de message (demarrage.js, 0x8F5AB) : un
// octet, 0xBF, et le zéro qui le termine.
export const ILES = [
  [0x10000, 16], [0x100EC, 5], [0x1011E, 5], [0x10172, 5], [0x101A5, 5], [0x11539, 162],
  [0x11D7F, 32], [0x13CDA, 31], [0x14A14, 5], [0x14A85, 5], [0x14AA8, 5], [0x14CB3, 5],
  [0x14CDA, 5], [0x14D47, 5], [0x175EC, 5], [0x18028, 2], [0x1B24B, 32], [0x1BB85, 5],
  [0x1C9EE, 33], [0x1E9B3, 29], [0x21723, 36], [0x21D61, 31], [0x2A57A, 5], [0x2A5A3, 5],
  [0x2A5D0, 5], [0x2CD30, 35], [0x36117, 5], [0x39F34, 2], [0x39F7B, 2], [0x3A002, 5], [0x3B52F, 5],
  [0x3CCCA, 23], [0x3D922, 5], [0x40895, 2], [0x408AF, 2], [0x408B3, 2], [0x42618, 5], [0x43DF8, 5],
  [0x47A23, 4], [0x51929, 5], [0x54613, 5], [0x55EDA, 24], [0x5B624, 26], [0x5BF14, 315],
  [0x5C46B, 2], [0x5C50C, 2], [0x5EE02, 5], [0x5EE5D, 5], [0x5EEAA, 5], [0x5EEFD, 5], [0x5EF5B, 5],
  [0x5EFE3, 5], [0x5F0C1, 2], [0x5F172, 5], [0x5F205, 5], [0x5F279, 2], [0x5F356, 5], [0x5F3D3, 5],
  [0x5F431, 2], [0x5F4EA, 2], [0x5F4FC, 2], [0x5F51D, 2], [0x5F53D, 14], [0x5FCE9, 5], [0x5FD79, 5],
  [0x5FE9D, 623], [0x60F38, 30], [0x62CB3, 8], [0x65EEA, 2], [0x698FC, 5], [0x6991C, 5],
  [0x6A648, 16], [0x77BC7, 5], [0x7E2CE, 116], [0x7E342, 4], [0x7E6B9, 3], [0x7E74F, 211], [0x7E871, 3],
  [0x7E885, 3], [0x7E9B6, 2], [0x7EA96, 2], [0x7EE46, 2], [0x7F066, 2], [0x7F3D6, 26], [0x805A2, 2],
  [0x81F32, 2], [0x83038, 145], [0x833C5, 19], [0x83606, 2], [0x84237, 2], [0x855FA, 46],
  [0x85680, 241], [0x85AFD, 1089], [0x86026, 228], [0x8632E, 108], [0x878B0, 2], [0x87CAA, 12],
  [0x88313, 17],
  [0x89377, 166], [0x89AD4, 870], [0x89EF0, 38], [0x89FEB, 125], [0x8A06B, 765], [0x8A3CB, 21],
  [0x8A77E, 126], [0x8BC89, 71], [0x8BDF4, 56], [0x8CF13, 86], [0x8EC12, 121], [0x8ECD9, 5],
  [0x8F1EC, 27], [0x8F229, 134], [0x8F34B, 90], [0x8F58B, 3], [0x8F5E9, 32], [0x8F62C, 35],
  [0x8FB2A, 37], [0x8FBD3, 37], [0x903DD, 11], [0x904D4, 11], [0x9070D, 6], [0x92130, 117],
  [0x92CD5, 23], [0x92E94, 34], [0x92F5B, 34], [0x92FA8, 20], [0x9311B, 176], [0x93293, 1250],
  [0x93785, 4663],
];

// L'empreinte SHA-256 d'un fichier, en hexadécimal (Node ou navigateur).
export async function empreinte(octets) {
  const vue = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  if (globalThis.crypto && globalThis.crypto.subtle) {
    const h = await globalThis.crypto.subtle.digest('SHA-256', vue);
    return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  const { createHash } = await import('crypto');
  return createHash('sha256').update(vue).digest('hex');
}

// L'image tirée de MAIN.EXE : { pointEntree, pileInitiale, source (empreinte de MAIN.EXE),
// blocs: [{ adresse, octets }] }. Refuse une autre édition que celle du CD de 1994.
export async function extraireLImage(exe) {
  const octets = exe instanceof Uint8Array ? exe : new Uint8Array(exe);
  const source = await empreinte(octets);
  if (octets.length !== EDITION.taille || source !== EDITION.sha256) {
    throw new Error(`MAIN.EXE n'est pas celui du CD de 1994 (${octets.length} octets, empreinte ${source.slice(0, 16)}…) : `
      + 'le moteur en vise les adresses exactes');
  }
  const m8 = new Uint8Array(0x100000);        // les objets finissent avant 0xE3110
  const le = chargerLE(octets, m8);
  let fin = DONNEES[1];
  while (fin > DONNEES[0] && m8[fin - 1] === 0) fin--;
  const blocs = [{ adresse: DONNEES[0], octets: m8.slice(DONNEES[0], fin) }];
  for (const [adresse, taille] of ILES) blocs.push({ adresse, octets: m8.slice(adresse, adresse + taille) });
  return { pointEntree: le.pointEntree, pileInitiale: le.pileInitiale, source, blocs };
}

// Le fichier programme.bin : « TPIM », la version, le point d'entrée, la pile, l'empreinte de
// MAIN.EXE (32 octets), le nombre de blocs, leurs (adresse, taille), puis leurs octets à la suite.
const MAGIE = 0x4D495054;                     // « TPIM »
export function ecrireLImage(image) {
  const entete = 4 * 5 + 32 + 8 * image.blocs.length;
  const total = entete + image.blocs.reduce((t, b) => t + b.octets.length, 0);
  const sortie = new Uint8Array(total);
  const dv = new DataView(sortie.buffer);
  dv.setUint32(0, MAGIE, true);
  dv.setUint32(4, 1, true);
  dv.setUint32(8, image.pointEntree, true);
  dv.setUint32(12, image.pileInitiale, true);
  for (let k = 0; k < 32; k++) sortie[16 + k] = parseInt(image.source.slice(2 * k, 2 * k + 2), 16);
  dv.setUint32(48, image.blocs.length, true);
  let o = 52, p = entete;
  for (const b of image.blocs) {
    dv.setUint32(o, b.adresse, true);
    dv.setUint32(o + 4, b.octets.length, true);
    o += 8;
    sortie.set(b.octets, p);
    p += b.octets.length;
  }
  return sortie;
}

export function lireLImage(fichier) {
  const octets = fichier instanceof Uint8Array ? fichier : new Uint8Array(fichier);
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  if (dv.getUint32(0, true) !== MAGIE || dv.getUint32(4, true) !== 1) throw new Error("ce n'est pas une image du programme (programme.bin)");
  const source = Array.from(octets.subarray(16, 48), (b) => b.toString(16).padStart(2, '0')).join('');
  const n = dv.getUint32(48, true);
  const blocs = [];
  let o = 52, p = 52 + 8 * n;
  for (let k = 0; k < n; k++) {
    const adresse = dv.getUint32(o, true), taille = dv.getUint32(o + 4, true);
    blocs.push({ adresse, octets: octets.subarray(p, p + taille) });
    o += 8;
    p += taille;
  }
  return { pointEntree: dv.getUint32(8, true), pileInitiale: dv.getUint32(12, true), source, blocs };
}

// Poser l'image dans la mémoire du jeu : les objets remis à zéro, puis les blocs. Rend ce que le
// chargeur LE rendait et que l'hôte emploie (le point d'entrée, la pile initiale). `remplissage` : ce
// que reçoit la place du code hors des îles (0 ; les vérificateurs y mettent autre chose, pour
// prouver que rien ne la lit).
export function chargerLImage(image, m8, remplissage = 0) {
  m8.fill(remplissage, CODE[0], CODE[1]);
  for (const [debut, fin] of [DONNEES, VARIABLES]) m8.fill(0, debut, fin);
  for (const b of image.blocs) m8.set(b.octets, b.adresse);
  return { pointEntree: image.pointEntree, pileInitiale: image.pileInitiale, nbRelocations: 0, image: true };
}
