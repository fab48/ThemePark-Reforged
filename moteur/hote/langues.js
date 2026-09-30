// Les langues du jeu : le manifeste des textes (assets/textes/index.json), qui dit quelles langues le
// jeu a, sous quel nom la page les montre, et à quel emplacement de 1994 chacune se loge.
//
// Le jeu ne connaît une langue que par un chiffre : l'option -l de sa ligne de commande (-l4) le
// cherche dans la table 0xB7E17 du programme (« U0 », « G1 », « I2 », « S3 », « F4 », « P5 », « 66 »,
// « 77 », « 88 », « 99 » : moteur/jeu/evenements.js, choisirLaLangue), et le chiffre retenu remplace
// le premier 0 de data/lang0-0.dat (chargerLesTextes). Rien d'autre du jeu ne dépend de la langue.
// Le CD porte les cinq premiers fichiers (LANG0-0.DAT à LANG4-0.DAT : anglais, allemand, italien,
// espagnol, français) ; les emplacements 5 à 9 sont libres : une langue ajoutée s'y loge sans en
// chasser aucune, ou prend la place d'une des cinq.
//
// Le manifeste :
//   {
//     "version": 1,
//     "codage": "cp437",                    les fichiers sont en vrais caractères, refaits en octets
//                                           de la page 437 du DOS (formats-du-cd.js)
//     "langues": [                          dans l'ordre du menu de la page (bouton « langue »)
//       { "nom": "français", "fichier": "textes/LANG4.json", "emplacement": 4 },
//       { "nom": "brezhoneg", "fichier": "textes/brezhoneg.json", "emplacement": 5,
//         "caracteres": { "Ñ": "0xA5" } },  des correspondances signe -> octet en plus, prises avant
//       ...                                 celles de la page 437 (un alphabet que la page n'a pas,
//     ]                                     dessiné dans les polices à ces codes : images/polices/)
//   }
// Une langue sans `emplacement` (null) reste sur le disque sans que le jeu la voie. Deux langues au
// même emplacement : la première l'a (la seconde est signalée).
//
// Partagé par les assets (assets-du-jeu.js : l'extraction écrit le manifeste, la recomposition refait
// LANGn-0.DAT) et par la page (principal.js : le menu des langues), à qui ce module lit le manifeste
// sans charger le reste des assets.

import { cheminDansLaDistribution } from './distribution.js';

export const MANIFESTE_DES_TEXTES = 'textes/index.json';

// Les langues du CD, dans l'ordre du menu de la page : le nom qu'elle montre, l'emplacement.
export const LANGUES_DU_CD = [
  { nom: 'français', emplacement: 4 }, { nom: 'anglais', emplacement: 0 }, { nom: 'allemand', emplacement: 1 },
  { nom: 'italien', emplacement: 2 }, { nom: 'espagnol', emplacement: 3 },
];

// Le manifeste que l'extraction écrit, d'après les fichiers des langues du CD (emplacement -> fichier).
export function manifesteDesTextes(fichiers) {
  return {
    version: 1,
    description: 'Les langues du jeu : voir moteur/hote/langues.js, et le README (« Modder le jeu », « Traduire »). '
      + "L'ordre est celui du menu de la page ; « emplacement » : le chiffre de l'option -l du jeu (0 à 9), le n de LANGn-0.DAT.",
    codage: 'cp437',
    langues: LANGUES_DU_CD.filter((l) => fichiers.has(l.emplacement))
      .map((l) => ({ nom: l.nom, fichier: fichiers.get(l.emplacement), emplacement: l.emplacement })),
  };
}

// Les langues que le jeu verra : [{ nom, fichier, emplacement, caracteres }], dans l'ordre du menu, un
// emplacement au plus par langue. `signaler` : le mode souple (sans lui, une anomalie est une erreur).
export function languesDuManifeste(manifeste, signaler = null) {
  const probleme = (m) => { if (!signaler) throw new Error(m); signaler(m); };
  if (!manifeste || manifeste.version !== 1 || !Array.isArray(manifeste.langues)) throw new Error(`${MANIFESTE_DES_TEXTES} : illisible, ou d'une autre version`);
  const prises = new Map();
  const langues = [];
  for (const l of manifeste.langues) {
    if (l.emplacement === null || l.emplacement === undefined) continue;
    const n = Number(l.emplacement);
    if (!Number.isInteger(n) || n < 0 || n > 9) { probleme(`${MANIFESTE_DES_TEXTES} : ${l.nom} : emplacement ${l.emplacement}, 0 à 9 attendu`); continue; }
    if (typeof l.fichier !== 'string') { probleme(`${MANIFESTE_DES_TEXTES} : ${l.nom} : pas de fichier`); continue; }
    if (prises.has(n)) { probleme(`${MANIFESTE_DES_TEXTES} : ${l.nom} et ${prises.get(n)} veulent l'emplacement ${n} : ${prises.get(n)} le garde`); continue; }
    prises.set(n, l.nom);
    langues.push({ nom: String(l.nom || `langue ${n}`), fichier: l.fichier, emplacement: n, caracteres: l.caracteres || {} });
  }
  return langues;
}

// --- Côté page -----------------------------------------------------------------------------------------
// Lire un asset (chemin relatif à assets/) du paquet que la page donne au moteur (moteur/web/donnees.js,
// environnement-distribution.js : { genre: 'url' | 'opfs' | 'compagnons', ... }).
export async function lireUnAssetDeLaPage(paquet, chemin) {
  if (paquet.genre === 'url') {
    const base = paquet.base.endsWith('/') ? paquet.base : paquet.base + '/';
    const place = paquet.disposition === 'distribution' ? cheminDansLaDistribution(chemin) : chemin;
    const r = await fetch(base + place.split('/').map(encodeURIComponent).join('/'), { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${chemin} : erreur ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  if (paquet.genre === 'opfs') {
    let d = await navigator.storage.getDirectory();
    const parties = `${paquet.dossier || 'assets'}/${chemin}`.split('/');
    for (const p of parties.slice(0, -1)) d = await d.getDirectoryHandle(p);
    return new Uint8Array(await (await (await d.getFileHandle(parties[parties.length - 1])).getFile()).arrayBuffer());
  }
  if (paquet.genre === 'compagnons') return paquet.lireAsset(chemin);
  throw new Error(`données inconnues : ${paquet.genre}`);
}

// Le menu des langues de la page : [[chiffre de l'option -l, nom]], d'après le manifeste des textes ;
// des assets d'avant le manifeste (index.textes : { LANGn-0: fichier }) ont les langues du CD.
export async function languesDeLaPage(paquet) {
  const json = async (c) => JSON.parse(new TextDecoder().decode(await lireUnAssetDeLaPage(paquet, c)));
  const index = await json('index.json');
  if (typeof index.textes === 'string') {
    return languesDuManifeste(await json(index.textes), (m) => console.warn(`assets : ${m}`)).map((l) => [String(l.emplacement), l.nom]);
  }
  const presentes = new Set(Object.keys(index.textes || {}).map((n) => Number(/^LANG(\d)-0$/.exec(n) && n[4])));
  return LANGUES_DU_CD.filter((l) => presentes.has(l.emplacement)).map((l) => [String(l.emplacement), l.nom]);
}
