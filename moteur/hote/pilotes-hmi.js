// Les bibliothèques de pilotes de HMI, HMIDET.386 et HMIDRV.386, en fichiers virtuels.
//
// SOS, la bibliothèque de son du jeu, ouvre ces deux fichiers pour y chercher un module par son
// identifiant (moteur/jeu/sos-bruitages.js, § 9, et sos-musique.js, « Les modules de HMIDRV.386 ») :
// il lit l'en-tête du fichier (0x2C octets : la marque « 386 », en +0x20 le rang du dernier module, en
// +0x24 la taille de l'en-tête, en +0x28 un mot de contrôle), puis l'en-tête de chaque module (0x30
// octets : son nom, en +0x20 sa taille d'origine, en +0x24 la taille de son code, en +0x28 son
// identifiant, en +0x2C ses drapeaux — l'octet +0x2D, bit 7 : utilisable), passe le code de ceux qui
// ne conviennent pas, et charge dans un bloc alloué le code de celui qui convient. Ce code ne tourne
// jamais : l'hôte répond à sa place (moteur/hote/son.js, `appel`). Du code, l'hôte ne relit que
// l'identifiant (en +5, après le saut du début), et, pour un module de détection de la Sound Blaster
// 16, la description de la carte que sa fonction 2 désigne (en +0x83) et les mots où elle range le
// port, l'état et ce qu'elle vérifie (jusqu'à +0x133) : son.js, `fonctionDeDetection`.
//
// Le moteur n'a donc besoin que de ces en-têtes, et de ces quelques octets : assets/donnees/
// pilotes-hmi.json les décrit (décrireLesPilotes, à l'extraction) ; `fabriquerLePilote` en refait
// un fichier de la taille de l'original, les modules à leur place, leur code à zéro hormis ce que
// l'hôte relit. SOS y trouve ce qu'il cherchait aux mêmes positions : les mêmes tailles de blocs
// alloués, les mêmes lectures. Seul diffère, dans le bloc où il charge un module, le code de 1994
// que rien n'exécute ni ne lit.

import { octetsEnTexte, texteEnOctets } from './tables-du-programme.js';

const TAILLE_ENTETE_MODULE = 0x30;
const IDENTIFIANT_DANS_LE_CODE = 5;
// Les modules dont l'hôte relit une partie du code : ceux de détection de la Sound Blaster 16 qu'il
// imite (son.js, DETECTION_SB16), utilisables (bit 7 de l'octet +0x2D), de +0x83 à +0x133.
const GARDES = { identifiants: [0xE015, 0xE016, 0xE017, 0xE018], debut: 0x83, fin: 0x133 };
export const PILOTES = ['GAME/HMIDET.386', 'GAME/HMIDRV.386'];

const hex = (v) => '0x' + (v >>> 0).toString(16).toUpperCase();
const nombre = (v) => (typeof v === 'number' ? v : parseInt(String(v).replace(/^0x/i, ''), 16));
const garde = (m) => GARDES.identifiants.includes(nombre(m.identifiant)) && (nombre(m.drapeaux) & 0x8000) !== 0;

// Un champ de texte de n octets : ses caractères, jusqu'au dernier octet non nul (un nom plus court
// écrit sur un plus long en laisse la fin : « sbstd.com\x00om ») ; \xNN hors de l'ASCII imprimable.
function chaine(octets, o, n) {
  let fin = o + n;
  while (fin > o && octets[fin - 1] === 0) fin--;
  return octetsEnTexte(octets.subarray(o, fin), false);
}
function poserChaine(sortie, o, n, texte, quoi) {
  const b = texteEnOctets(texte);
  if (b.length > n) throw new Error(`pilotes : ${quoi} « ${texte} » dépasse ${n} octets`);
  sortie.set(b, o);
}

// La description d'un fichier de pilotes (ses octets), vérifiée : le fichier qu'on en refait a les
// mêmes en-têtes, octet pour octet, que l'original. `detection` : c'est HMIDET.386 (des modules de
// détection, dont l'hôte relit une partie du code).
export function decrireLesPilotes(octets, detection) {
  const dv = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const d = {
    taille: octets.length,
    enTete: { marque: chaine(octets, 0, 0x20), dernierModule: dv.getUint32(0x20, true), taille: dv.getUint32(0x24, true),
      controle: hex(dv.getUint32(0x28, true)) },
    modules: [],
  };
  let p = d.enTete.taille;
  while (p + TAILLE_ENTETE_MODULE <= octets.length) {
    const m = { nom: chaine(octets, p, 0x20), tailleDOrigine: dv.getUint32(p + 0x20, true), taille: dv.getUint32(p + 0x24, true),
      identifiant: hex(dv.getUint32(p + 0x28, true)), drapeaux: hex(dv.getUint32(p + 0x2C, true)) };
    const code = p + TAILLE_ENTETE_MODULE;
    if (detection && garde(m)) m.code = { debut: hex(GARDES.debut), octets: Array.from(octets.subarray(code + GARDES.debut, code + GARDES.fin)) };
    d.modules.push(m);
    p = code + m.taille;
  }
  const refait = fabriquerLePilote(d);
  const memes = (a, b) => a.every((v, k) => v === b[k]);
  p = d.enTete.taille;
  let bon = p <= octets.length && memes(refait.subarray(0, p), octets.subarray(0, p)) && p + d.modules.reduce((t, m) => t + TAILLE_ENTETE_MODULE + m.taille, 0) === octets.length;
  for (const m of d.modules) {
    if (!bon) break;
    bon = memes(refait.subarray(p, p + TAILLE_ENTETE_MODULE), octets.subarray(p, p + TAILLE_ENTETE_MODULE))
      && octets[p + TAILLE_ENTETE_MODULE + IDENTIFIANT_DANS_LE_CODE] === (nombre(m.identifiant) & 0xFF)
      && octets[p + TAILLE_ENTETE_MODULE + IDENTIFIANT_DANS_LE_CODE + 1] === ((nombre(m.identifiant) >> 8) & 0xFF);
    p += TAILLE_ENTETE_MODULE + m.taille;
  }
  if (!bon) throw new Error("bibliothèque de pilotes de HMI d'une forme inattendue");
  return d;
}

// Le fichier virtuel : les en-têtes, et le code de chaque module à zéro, hormis son identifiant (en
// +5) et ce que la description garde.
export function fabriquerLePilote(d) {
  const sortie = new Uint8Array(d.taille);
  const dv = new DataView(sortie.buffer);
  poserChaine(sortie, 0, 0x20, d.enTete.marque, 'la marque');
  dv.setUint32(0x20, d.enTete.dernierModule, true);
  dv.setUint32(0x24, d.enTete.taille, true);
  dv.setUint32(0x28, nombre(d.enTete.controle), true);
  let p = d.enTete.taille;
  for (const m of d.modules) {
    poserChaine(sortie, p, 0x20, m.nom, 'le nom');
    dv.setUint32(p + 0x20, m.tailleDOrigine, true);
    dv.setUint32(p + 0x24, m.taille, true);
    dv.setUint32(p + 0x28, nombre(m.identifiant), true);
    dv.setUint32(p + 0x2C, nombre(m.drapeaux), true);
    const code = p + TAILLE_ENTETE_MODULE;
    if (m.taille >= IDENTIFIANT_DANS_LE_CODE + 2) dv.setUint16(code + IDENTIFIANT_DANS_LE_CODE, nombre(m.identifiant) & 0xFFFF, true);
    if (m.code) sortie.set(m.code.octets, code + nombre(m.code.debut));
    p = code + m.taille;
  }
  if (p !== d.taille) throw new Error(`pilotes : les modules font ${p} octets, le fichier ${d.taille}`);
  return sortie;
}

// Le texte de pilotes-hmi.json : une ligne par module.
export function pilotesEnJson(description) {
  const fichier = (d) => [
    '{',
    `    "taille": ${d.taille},`,
    `    "enTete": ${JSON.stringify(d.enTete)},`,
    '    "modules": [',
    d.modules.map((m) => '      ' + JSON.stringify(m)).join(',\n'),
    '    ]',
    '  }',
  ].join('\n');
  return '{\n' + Object.entries(description).map(([k, d]) => `  ${JSON.stringify(k)}: ${typeof d === 'object' && d.modules ? fichier(d) : JSON.stringify(d)}`).join(',\n') + '\n}\n';
}
