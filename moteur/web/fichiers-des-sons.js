// Les fichiers des sons : ce que la page joue pour chaque son que le jeu demande, et le manifeste des
// sons remplacés. Module sans DOM : le moteur l'emploie (dans son Worker ou dans le fil de la page,
// moteur-du-jeu.js) pour dire, avec chaque événement de son (moteur/hote/son.js), le fichier à jouer ;
// les outils de la distribution (moteur/node/compagnons.mjs, le serveur local) pour écrire le manifeste.
//
// Les fichiers d'origine (chemins d'assets/index.json, relatifs à assets/, les mêmes dans la
// distribution) :
//   sons/bruitages/BANQUE/NOM.wav   un bruitage (SNDS0-2 : la banque du jeu en 16 bits, celle que le jeu
//                                   charge avec la Sound Blaster 16 ; SNDS1-2 : l'introduction)
//   sons/musiques/FM/NOM.mp3        un morceau, tel que la puce FM le jouait (moteur/node/musiques.mjs)
//
// Remplacer un son, pour un moddeur :
//   - le plus simple : écraser le fichier (même nom, même format : un WAV par un WAV, un mp3 par un
//     mp3). Rien d'autre à faire, servie comme en double-clic : la page lit les fichiers eux-mêmes ;
//   - dans un autre format (ogg, mp3 pour un bruitage, wav, flac...) : poser le fichier à côté de
//     l'original, du même nom (sons/bruitages/SNDS0-2/CASH.ogg, sons/musiques/FM/RIDE4.ogg), puis
//     lancer refaire.cmd, qui l'inscrit au manifeste (sons/index.json) : la page ne peut pas lister
//     un dossier.
//   Le manifeste peut aussi s'écrire à la main ; refaire.cmd garde ce qui y est écrit tant que le
//   fichier désigné existe. Ses clés : « BANQUE/NOM » ou « NOM » pour un bruitage (NOM : celui du
//   fichier d'origine sans extension, NULL-3 pour le troisième NULL), le nom ou le numéro du morceau
//   dans sa banque (« RIDE4 », « 4 ») pour une musique ; ses valeurs : un chemin relatif à sons/.
//   L'ancien dossier des sons de remplacement (sons/remplacements/bruitages/NOM.ext, musiques/NOM.ext)
//   est encore lu : ses fichiers y sont inscrits comme « NOM ».
//
// Le jeu, lui, n'en voit rien : ses banques gardent les durées d'origine (index.json, `tailles` ;
// assets-du-jeu.js, `bruitagesMuets`). Un bruitage joue jusqu'à la fin de son fichier, sauf si le jeu
// l'arrête ; un morceau est relancé quand le jeu le relance.

import { MANIFESTE_DES_SONS, FORMATS_AUDIO } from '../hote/distribution.js';

export { MANIFESTE_DES_SONS, FORMATS_AUDIO };
// La crête des mp3 des musiques : moteur/node/musiques.mjs les ramène tous à −1 dB, pour l'écoute.
// Dans le jeu, chaque morceau avait son niveau, celui que la puce lui donnait au volume plein
// (index.json, `niveaux` : la crête d'origine, 0,114 pour HRTBEAT, 0,855 pour RIDE4) : la page joue
// le mp3 d'origine à niveau / CRETE_DES_MP3 (audio.js), le mélange de 1994 revient. Un fichier du
// manifeste est joué tel quel (le moddeur a choisi son niveau).
export const CRETE_DES_MP3 = 0.891;

const tige = (f) => f.slice(f.lastIndexOf('/') + 1).replace(/\.[^.]*$/, '');

// La résolution : `index` (assets/index.json), `manifeste` (sons/index.json lu, ou null). Rend une
// fonction qui complète un événement de son.js : `fichier` (le son à jouer, chemin d'assets) et
// `defaut` (l'original, si le fichier du manifeste ne se lit pas). Les événements sans son à jouer
// (volume, arrêt, tempo) passent tels quels.
export function fichiersDesSons(index, manifeste) {
  const man = manifeste || {};
  const bruitagesDuManifeste = man.bruitages || {}, musiquesDuManifeste = man.musiques || {};
  const dansLeManifeste = (table, cles) => {
    for (const c of cles) if (c && typeof table[c] === 'string') return 'sons/' + table[c].replace(/^\/+/, '');
    return null;
  };
  const cache = new Map();

  function bruitage(e) {
    const cle = `${e.banque}:${e.numero}`;
    if (!cache.has(cle)) {
      const b = (index.bruitages || {})[e.banque];
      const f = b && e.numero >= 1 ? b.fichiers[e.numero - 1] : null;
      const defaut = f ? `${b.dossier}/${f}` : null;
      const t = f ? tige(f) : e.nom;
      const fichier = dansLeManifeste(bruitagesDuManifeste, [`${e.banque}/${t}`, `${e.banque}/${e.nom}`, t, e.nom]);
      cache.set(cle, { fichier: fichier || defaut, defaut });
    }
    return cache.get(cle);
  }

  // Le morceau : le mp3 de la version FM de sa banque (MUSICb-0), quelle que soit la carte déclarée.
  function musique(e) {
    const cle = `${e.banque}:${e.morceau}`;
    if (!cache.has(cle)) {
      const numero = /^MUSIC(\d+)-\d+$/i.exec(e.banque || '');
      const fm = numero && (index.musiques || {})[`MUSIC${numero[1]}-0`];
      const f = fm && e.morceau >= 1 ? fm.fichiers[e.morceau - 1] : null;
      const defaut = f ? `${fm.dossier}/${tige(f)}.mp3` : null;
      const fichier = dansLeManifeste(musiquesDuManifeste, [e.nom, String(e.morceau), `${e.banque}/${e.morceau}`]);
      const crete = fm && Array.isArray(fm.niveaux) ? fm.niveaux[e.morceau - 1] : null;
      const niveauDuDefaut = typeof crete === 'number' ? Math.min(1, crete / CRETE_DES_MP3) : 1;
      cache.set(cle, { fichier: fichier || defaut, defaut, niveau: fichier ? 1 : niveauDuDefaut, niveauDuDefaut });
    }
    return cache.get(cle);
  }

  return (e) => {
    if (e.action !== 'jouer') return e;
    const r = e.genre === 'bruitage' ? bruitage(e) : musique(e);
    return Object.assign({}, e, r);
  };
}

// Le manifeste d'une distribution (ou d'assets/) : `chemins`, les fichiers de sons/ (chemins relatifs
// à la racine, séparés par /) ; `ancien` : le manifeste d'avant (ce qui y était écrit à la main est
// gardé si le fichier existe encore). Rend { bruitages, musiques } (vides : les sons d'origine).
export function manifesteDesSons(chemins, ancien = null) {
  const existe = new Set(chemins);
  const manifeste = { bruitages: {}, musiques: {} };
  const poser = (genre, cle, chemin) => { if (!(cle in manifeste[genre])) manifeste[genre][cle] = chemin.slice('sons/'.length); };
  const tries = [...chemins].sort();
  // (les fichiers posés à côté des originaux, puis l'ancien dossier des remplacements)
  for (const c of tries) {
    if (!FORMATS_AUDIO.test(c)) continue;
    let m = /^sons\/bruitages\/([^/]+)\/[^/]+$/.exec(c);
    if (m && !/\.wav$/i.test(c)) poser('bruitages', `${m[1]}/${tige(c)}`, c);
    m = /^sons\/musiques\/([^/]+)\/[^/]+$/.exec(c);
    if (m && !/\.mp3$/i.test(c)) poser('musiques', tige(c), c);
  }
  for (const c of tries) {
    if (!FORMATS_AUDIO.test(c)) continue;
    const m = /^sons\/remplacements\/(bruitages|musiques)\/[^/]+$/.exec(c);
    if (m) poser(m[1], tige(c), c);
  }
  for (const genre of ['bruitages', 'musiques']) {
    for (const [cle, valeur] of Object.entries((ancien && ancien[genre]) || {})) {
      if (typeof valeur === 'string' && existe.has('sons/' + valeur.replace(/^\/+/, '')) && !(cle in manifeste[genre])) {
        manifeste[genre][cle] = valeur;
      }
    }
  }
  return manifeste;
}
