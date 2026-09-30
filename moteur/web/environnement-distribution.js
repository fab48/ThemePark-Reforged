// Ce qui dépend de l'endroit d'où vient la page : ici, la distribution (moteur/node/
// construire-distribution.mjs, écrite dans site/) : theme-park.html et, à côté, les assets en fichiers
// ordinaires, dans des dossiers clairs (images/, sons/, films/, animations/, donnees/ :
// moteur/hote/distribution.js). L'assembleur prend ce module à la place d'environnement.js (mêmes
// exports). Le moteur est le moteur réentrant, qui tourne dans le fil de la page (moteur-du-jeu.js) :
// ni Worker, ni mémoire partagée, ni en-têtes d'isolation.
//
// Deux façons de lire les assets, choisies au chargement :
//  - servie par HTTP (Theme Park.cmd, theme-park.sh, n'importe quel serveur) : la page lit les
//    dossiers eux-mêmes (fichiers-paquet.js, genre 'url', disposition 'distribution') ; un asset
//    modifié est pris au rechargement. C'est la façon de référence, celle du moddeur.
//  - ouverte d'un double-clic (file://), ou si donnees/index.json ne se lit pas : la page ne peut rien
//    lire d'un fichier voisin, mais elle peut exécuter un <script src> voisin. Elle charge donc les
//    compagnons (images/images.js, sons/sons.js, donnees/donnees.js ; animations/animations.js à la
//    demande), qui portent les mêmes fichiers en base 64 (distribution.js en donne la forme), et les
//    lit de là (genre 'compagnons'). refaire.cmd les refait après une modification. Les films et les
//    sons, eux, se lisent directement : <video src="films/…"> et <audio src="sons/…"> sont permis en
//    file:// (audio.js : les bruitages y passent par des éléments audio, pas par Web Audio). Le
//    compagnon des sons ne porte donc que ce que le moteur lit (les morceaux HMP, les timbres) et le
//    manifeste des sons remplacés.
// Servie, la page ne charge aucun compagnon.
//
// Les sauvegardes vivent dans le navigateur (IndexedDB, donnees.js), pour l'origine de la page :
// celle du double-clic (file://) ne voit pas celles de la page servie, ni l'inverse (les boutons
// « parties : exporter » et « importer » les portent de l'une à l'autre).

import { degonflerGzip } from '../hote/inflate.js';
import { cheminDansLaDistribution, COMPAGNONS, RENDU } from '../hote/distribution.js';
import { sauvegardesDuNavigateur } from './donnees.js';
import { lancerLeJeu } from './moteur-du-jeu.js';

// Quelques méthodes du DOM que la fenêtre de débogage (debogage.js) emploie, posées si elles manquent
// (append : Chrome 54, Firefox 49 ; replaceChildren : Chrome 86, Firefox 78).
(function () {
  const P = Element.prototype;
  const noeud = (x) => (typeof x === 'string' ? document.createTextNode(x) : x);
  if (!P.append) P.append = function (...xs) { for (const x of xs) this.appendChild(noeud(x)); };
  if (!P.replaceChildren) P.replaceChildren = function (...xs) { while (this.firstChild) this.removeChild(this.firstChild); this.append(...xs); };
}());

// Le dossier de la page : la racine de la distribution.
export const racine = new URL('.', location.href);
export const fil = 'page';
export const creerTravailleur = () => { throw new Error('la distribution fait tourner le moteur dans la page'); };
export const chargerLeMoteur = () => Promise.resolve({ lancerLeJeu });

// --- servie, ou en double-clic -------------------------------------------------------------------
let mode = null;
function leMode() {
  if (!mode) {
    mode = location.protocol === 'file:' || typeof fetch !== 'function' ? Promise.resolve('compagnons')
      : fetch(new URL(cheminDansLaDistribution('index.json'), racine).href, { cache: 'no-cache' })
        .then((r) => (r.ok ? 'servie' : 'compagnons'), () => 'compagnons');
    mode.then((m) => {
      console.log(m === 'servie' ? 'assets : lus dans les dossiers de la distribution'
        : 'assets : lus dans les compagnons (images/images.js, sons/sons.js, donnees/donnees.js)');
    });
  }
  return mode;
}

// --- les compagnons --------------------------------------------------------------------------------
// Les fichiers qu'ils ont apportés : { chemin dans la distribution : base 64 }.
const fichiersDesCompagnons = () => (window.ThemePark && window.ThemePark.fichiers) || {};
const chargements = new Map();
function chargerLeCompagnon(script) {
  if (!chargements.has(script)) {
    chargements.set(script, new Promise((resoudre) => {
      const s = document.createElement('script');
      s.src = script.split('/').map(encodeURIComponent).join('/');
      s.charset = 'utf-8';
      s.onload = () => resoudre(true);
      s.onerror = () => {
        console.warn(`${script} : introuvable. Ouverte d'un double-clic, la page lit les assets par ce fichier ; refaire.cmd le refait.`);
        resoudre(false);
      };
      document.head.appendChild(s);
    }));
  }
  return chargements.get(script);
}
const scriptDe = (dossier) => COMPAGNONS.find((c) => c.dossier === dossier).script;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALEURS = new Uint8Array(256).fill(255);
for (let k = 0; k < 64; k++) VALEURS[ALPHABET.charCodeAt(k)] = k;

// La base 64 d'une chaîne, à partir de `debut`, en octets ; les caractères hors de l'alphabet (sauts
// de ligne, « = ») sont sautés. Décodée ici, octet par octet : atob rendrait une chaîne binaire aussi
// grosse que le fichier, à recopier.
export function depuisLaBase64(texte, debut = 0) {
  const n = texte.length;
  const sortie = new Uint8Array(Math.floor((n - debut) * 3 / 4) + 3);
  let o = 0, acc = 0, bits = 0;
  for (let k = debut; k < n; k++) {
    const c = texte.charCodeAt(k);
    const v = c < 256 ? VALEURS[c] : 255;
    if (v === 255) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; sortie[o++] = (acc >> bits) & 0xFF; }
  }
  return o === sortie.length ? sortie : sortie.slice(0, o);
}

// Un fichier d'un compagnon, par son chemin dans la distribution ; `liberer` : sa base 64 est oubliée
// ensuite (rendu.json : 69 Mo une fois décompressé, lu une seule fois).
function lireDuCompagnon(chemin, liberer = false) {
  const F = fichiersDesCompagnons();
  const v = F[chemin];
  if (typeof v !== 'string') throw new Error(`${chemin} : absent des compagnons (refaire.cmd les refait d'après les dossiers)`);
  if (liberer) delete F[chemin];
  return v.slice(0, 5) === 'gzip:' ? degonflerGzip(depuisLaBase64(v, 5)) : depuisLaBase64(v);
}

// --- ce que la page demande ------------------------------------------------------------------------
// Ce qu'il faut au moteur pour démarrer : le paquet des assets, et les sauvegardes du navigateur.
export async function preparerLesDonnees() {
  let paquet;
  if (await leMode() === 'servie') {
    paquet = { genre: 'url', base: racine.href, disposition: 'distribution' };
  } else {
    await Promise.all(['donnees', 'images', 'sons'].map((d) => chargerLeCompagnon(scriptDe(d))));
    if (typeof fichiersDesCompagnons()[cheminDansLaDistribution('index.json')] !== 'string') {
      throw new Error(`${scriptDe('donnees')} manque ou ne porte pas ${cheminDansLaDistribution('index.json')} : `
        + 'lancer refaire.cmd, ou servir la page (Theme Park.cmd)');
    }
    paquet = { genre: 'compagnons', lireAsset: (c) => lireDuCompagnon(cheminDansLaDistribution(c)) };
  }
  let sauvegardes = [];
  try {
    sauvegardes = await sauvegardesDuNavigateur();
  } catch (e) {
    console.warn('sauvegardes indisponibles (IndexedDB) : les parties ne seront pas gardées', e);
  }
  return { paquet, sauvegardes };
}

// Les animations intercalées : le texte de rendu.json, par une promesse (null s'il n'y en a pas).
export function lireLesAnimations() {
  return leMode().then((m) => {
    if (m === 'servie') {
      return fetch(new URL(RENDU, racine).href, { cache: 'no-cache' }).then((r) => (r.ok ? r.text() : null), () => null);
    }
    return chargerLeCompagnon(scriptDe('animations')).then(() => {
      if (typeof fichiersDesCompagnons()[RENDU] !== 'string') return null;
      const t0 = performance.now();
      const texte = new TextDecoder().decode(lireDuCompagnon(RENDU, true));
      console.log(`animations : ${(texte.length / 1048576).toFixed(1)} Mo en ${Math.round(performance.now() - t0)} ms`);
      return texte;
    });
  });
}

// Un film (films.js) : films/…mp4, à côté de la page, servie ou non.
export function urlDuFilm(fichier) {
  return new URL(cheminDansLaDistribution(fichier).split('/').map(encodeURIComponent).join('/'), racine).href;
}

// Un son (audio.js) : sons/…, à côté de la page, servie ou non.
export const urlDUnSon = urlDuFilm;
