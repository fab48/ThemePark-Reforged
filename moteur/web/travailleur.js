// Le jeu tourne ici, dans un Web Worker : son code ne rend jamais la main (il boucle comme sous
// DOS), ce qui bloquerait la page. L'image et les entrees passent par de la memoire partagee avec la
// page ; le temps virtuel du jeu est cale sur le temps reel, en dormant (Atomics.wait).
//
// Le jeu lui-même, ses observateurs et ce qu'il publie sont dans moteur-du-jeu.js, qui sert aussi
// quand le moteur tourne dans le fil de la page (le fichier unique, sans Worker) ; ici, seulement ce
// qui est propre au travailleur : les messages vers la page, et la lecture synchrone des animations.

import { lancerLeJeu } from './moteur-du-jeu.js';

// Un fichier texte servi avec la page, lu d'une requete synchrone ; null s'il manque.
function lireUnTexte(url) {
  const x = new XMLHttpRequest();
  x.open('GET', url, false);
  try { x.send(); } catch (e) { return null; }
  return x.status < 400 ? x.responseText : null;
}

onmessage = (e) => {
  // donnees : le paquet et les sauvegardes (moteur/web/donnees.js) ; racine : l'adresse du site.
  const { racine } = e.data;
  lancerLeJeu(e.data, {
    fil: 'travailleur',
    envoyer: (message, transferts) => postMessage(message, transferts || []),
    // assets/animations/import/rendu.json (moteur/node/importer-animations.mjs), lu une fois
    lireLesAnimations: () => lireUnTexte(new URL('animations/rendu.json', racine).href),
  });
};
