// Ce qui dépend de l'endroit d'où vient la page : ici, la page du dépôt, servie (moteur/node/serveur.mjs,
// ou un serveur ordinaire avec isolation.js). La distribution (moteur/node/construire-distribution.mjs)
// prend à la place environnement-distribution.js, qui a les mêmes exports : l'assembleur y substitue
// ce module.
//
// Deux façons de faire tourner le moteur (moteur-du-jeu.js) :
//  - 'travailleur' (index.html) : dans un Web Worker, avec de la mémoire partagée : il faut l'isolation
//    d'origine (COOP et COEP : le serveur local, ou isolation.js sur un site statique) ;
//  - 'page' (local.html, ou index.html?fil=page) : dans le fil de la page, comme la distribution. Il
//    faut le moteur réentrant (moteur/node/reentrer.mjs), que le serveur local sert sous /reentrant/ :
//    la page locale est /reentrant/moteur/web/local.html (le serveur y mène depuis /local).
// Ce module est le seul de la page à lire `import.meta` et à faire un `import()` : l'assembleur les
// refuse, et la distribution n'en a pas besoin.

import { preparerLesDonnees as preparerLesDonneesServies } from './donnees.js';
import { demanderLeCD } from './extraction.js';

// La racine du site : la page vit dans moteur/web/ ; les modules aussi.
export const racine = new URL('../../', import.meta.url);

const parametres = new URLSearchParams(location.search);
export const fil = document.documentElement.getAttribute('data-fil') === 'page' || parametres.get('fil') === 'page'
  ? 'page' : 'travailleur';

// Le moteur dans son Web Worker (fil 'travailleur').
export const creerTravailleur = () => new Worker(new URL('./travailleur.js', import.meta.url), { type: 'module' });
// Le moteur pour le fil de la page, chargé à la demande (la page du travailleur ne le charge pas).
export const chargerLeMoteur = () => import('./moteur-du-jeu.js');

// Un film en mp4 (films.js) : assets/films/..., servi avec la page.
export const urlDuFilm = (fichier) => new URL('assets/' + fichier.split('/').map(encodeURIComponent).join('/'), racine).href;
// Un son (audio.js) : assets/sons/..., servi avec la page.
export const urlDUnSon = urlDuFilm;

// Ce qu'il faut au moteur pour démarrer : { paquet, sauvegardes } (donnees.js ; sans assets servis,
// la page demande le CD : extraction.js).
export const preparerLesDonnees = (etat) => preparerLesDonneesServies(racine, () => demanderLeCD(etat));
// Les animations intercalées, pour le moteur dans le fil de la page : le texte de rendu.json, par une
// promesse (le travailleur, lui, le lit d'une requête synchrone).
export function lireLesAnimations() {
  return fetch(new URL('animations/rendu.json', racine).href).then((r) => (r.ok ? r.text() : null), () => null);
}
