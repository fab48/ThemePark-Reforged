// Les données du jeu, côté page : où sont les assets (moteur/hote/assets-du-jeu.js), et où vivent
// les sauvegardes.
//
// Les assets :
//  - servis avec la page, dans assets/ à la racine du site (le serveur local les sert depuis assets/ ;
//    la distribution, elle, a sa façon : moteur/web/environnement-distribution.js) ;
//  - sinon, extraits dans le stockage privé du navigateur (OPFS) de l'image du CD que le joueur
//    donne à la page (moteur/web/extraction.js) : rien n'est envoyé nulle part.
//
// Les sauvegardes, tout ce que le jeu écrit dans son installation (C:/THEME.CD/) — ses parties, ses
// réglages — vivent dans le navigateur, et nulle part ailleurs : IndexedDB, base « themepark », un
// enregistrement par fichier, sous le chemin que le jeu lui donne. Chaque adresse de page a les
// siennes (le navigateur les range par origine : http://localhost:8123 et :8125 ne partagent rien).
// Le travailleur les reçoit toutes au démarrage et renvoie chaque fichier écrit, une fois, quand le
// jeu est calme (fichiers-paquet.js) : une sauvegarde de fin d'année, écrite en 53 blocs, est rangée
// en une fois.
//
// La reprise : le serveur local gardait autrefois les sauvegardes dans son dossier d'installation
// (travail/c/THEME.CD). Il ne les écrit plus, mais les montre encore, en lecture seule
// (sauvegardes/index.json) : à la première visite, les parties qui n'y sont pas déjà en sont
// recopiées dans le navigateur. Une seule fois : c'est noté dans le stockage local.

const BASE = 'themepark';
const MAGASIN = 'sauvegardes';
const INSTALLATION = 'C:/THEME.CD/';
const REPRISE_FAITE = 'themepark.sauvegardes.reprises';

function ouvrirLaBase() {
  return new Promise((resoudre, rejeter) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => resoudre(r.result);
    r.onerror = () => rejeter(r.error);
  });
}
function demande(r) {
  return new Promise((resoudre, rejeter) => { r.onsuccess = () => resoudre(r.result); r.onerror = () => rejeter(r.error); });
}

// Les sauvegardes gardées par le navigateur : [[chemin vu par le jeu, octets]].
async function sauvegardesDuNavigateur() {
  const base = await ouvrirLaBase();
  const t = base.transaction(MAGASIN, 'readonly').objectStore(MAGASIN);
  const [cles, valeurs] = await Promise.all([demande(t.getAllKeys()), demande(t.getAll())]);
  base.close();
  return cles.map((c, k) => [c, new Uint8Array(valeurs[k])]);
}
async function rangerDansLeNavigateur(chemin, octets) {
  const base = await ouvrirLaBase();
  const t = base.transaction(MAGASIN, 'readwrite').objectStore(MAGASIN);
  await demande(octets ? t.put(octets, chemin) : t.delete(chemin));
  base.close();
}

// Les assets sont-ils servis avec la page ?
async function paquetServi(racine) {
  try {
    const r = await fetch(new URL('assets/index.json', racine), { cache: 'no-store' });
    if (!r.ok) return null;
    const index = await r.json();
    return index && index.version ? { genre: 'url', base: new URL('assets/', racine).href } : null;
  } catch (e) {
    return null;
  }
}

// Les assets extraits dans le stockage privé du navigateur ?
export async function paquetDuNavigateur() {
  try {
    const racine = await navigator.storage.getDirectory();
    const dossier = await racine.getDirectoryHandle('assets');
    const f = await (await dossier.getFileHandle('index.json')).getFile();
    const index = JSON.parse(await f.text());
    return index && index.version ? { genre: 'opfs', dossier: 'assets' } : null;
  } catch (e) {
    return null;
  }
}

// Les parties que le serveur local gardait autrefois (voir « La reprise »), ou null : un site
// statique n'en a pas.
async function partiesDuServeur(racine) {
  try {
    const r = await fetch(new URL('sauvegardes/index.json', racine), { cache: 'no-store' });
    if (!r.ok) return null;
    const liste = await r.json();
    return await Promise.all(Object.keys(liste).map(async (relatif) => {
      const f = await fetch(new URL('sauvegardes/' + relatif.split('/').map(encodeURIComponent).join('/'), racine), { cache: 'no-store' });
      if (!f.ok) throw new Error(`${relatif} : ${f.status}`);
      return [INSTALLATION + relatif, new Uint8Array(await f.arrayBuffer())];
    }));
  } catch (e) {
    return null;
  }
}

// La reprise, une seule fois : les parties du serveur qui manquent au navigateur y sont recopiées ;
// celles que le navigateur a déjà ne sont pas remplacées.
async function reprendreLesParties(racine) {
  try { if (localStorage.getItem(REPRISE_FAITE) === 'oui') return; } catch (e) { return; }
  const parties = await partiesDuServeur(racine);
  if (parties && parties.length) {
    const deja = new Set((await sauvegardesDuNavigateur()).map(([chemin]) => chemin));
    let reprises = 0;
    for (const [chemin, octets] of parties) {
      if (deja.has(chemin)) continue;
      await rangerDansLeNavigateur(chemin, octets);
      reprises++;
    }
    console.log(`sauvegardes : ${reprises} fichier(s) repris du serveur`);
  }
  try { localStorage.setItem(REPRISE_FAITE, 'oui'); } catch (e) { /* stockage indisponible */ }
}

// Tout ce qu'il faut au travailleur pour démarrer : { paquet, sauvegardes }. `demanderLeCD()` est
// appelée s'il n'y a de paquet nulle part : elle rend une promesse, tenue quand le joueur a donné son
// CD et que le paquet est déroulé (moteur/web/extraction.js).
export async function preparerLesDonnees(racine, demanderLeCD) {
  let paquet = await paquetServi(racine) || await paquetDuNavigateur();
  if (!paquet) paquet = await demanderLeCD();
  let sauvegardes = [];
  try {
    await reprendreLesParties(racine);
    sauvegardes = await sauvegardesDuNavigateur();
  } catch (e) {
    console.warn('sauvegardes illisibles', e);
  }
  return { paquet, sauvegardes };
}

// Ranger un fichier écrit par le jeu (octets), ou l'effacer (null).
export const ranger = (chemin, octets) => rangerDansLeNavigateur(chemin, octets);

// (Pour la console et les essais : les sauvegardes du navigateur, à lire ou à remplacer.)
export { sauvegardesDuNavigateur, rangerDansLeNavigateur };

// L'export et l'import, pour les boutons « parties » de la page : les sauvegardes ne vivent que dans
// ce navigateur, et pour cette adresse ; un fichier les garde ailleurs, ou les porte d'une adresse à
// l'autre (le serveur local, le site). Le fichier : du JSON, { chemin vu par le jeu : octets en
// base 64 }, par exemple « C:/THEME.CD/SAVE/FAB.G0 » ; chaque joueur a son .GD (141 octets) et ses
// parties, .G0 à .G7 et .GY (la fin d'année), de 304 668 octets, davantage avec la table des objets
// agrandie (moteur/jeu/table-des-objets.js) : la taille n'est pas vérifiée.
function enBase64(octets) {
  let binaire = '';
  for (let k = 0; k < octets.length; k += 0x8000) binaire += String.fromCharCode(...octets.subarray(k, k + 0x8000));
  return btoa(binaire);
}
function depuisLaBase64(texte) {
  const binaire = atob(texte);
  const octets = new Uint8Array(binaire.length);
  for (let k = 0; k < binaire.length; k++) octets[k] = binaire.charCodeAt(k);
  return octets;
}
export async function exporterLesParties() {
  const parties = {};
  for (const [chemin, octets] of await sauvegardesDuNavigateur()) parties[chemin] = enBase64(octets);
  return { texte: JSON.stringify(parties), nombre: Object.keys(parties).length };
}
// L'import ne remplace que les fichiers qu'il apporte ; les autres restent. Tout est lu avant que rien
// ne soit rangé : un fichier qui n'est pas un export ne change rien. Rend le nombre de fichiers rangés.
export async function importerLesParties(texte) {
  let parties;
  try { parties = JSON.parse(texte); } catch (e) { throw new Error("ce n'est pas un export de parties"); }
  if (!parties || typeof parties !== 'object' || Array.isArray(parties)) throw new Error("ce n'est pas un export de parties");
  const fichiers = Object.entries(parties).map(([chemin, b64]) => {
    if (!chemin.startsWith(INSTALLATION) || chemin.includes('..') || typeof b64 !== 'string') {
      throw new Error(`${chemin} : pas un fichier de Theme Park`);
    }
    try { return [chemin, depuisLaBase64(b64)]; } catch (e) { throw new Error(`${chemin} : illisible`); }
  });
  for (const [chemin, octets] of fichiers) await rangerDansLeNavigateur(chemin, octets);
  return fichiers.length;
}
