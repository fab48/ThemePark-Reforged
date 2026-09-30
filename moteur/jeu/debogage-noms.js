// Les noms lisibles des fonctions du jeu, pour la fenêtre de débogage : l'onglet « État du parc »
// (debogage.js, « Le guet ») dit quelle fonction a écrit chaque grandeur, par son nom dans moteur/jeu.
//
// Un module à part, importé par moteur/web/moteur-du-jeu.js seulement, du côté du jeu (le travailleur,
// ou le fil de la page) : la page prend dans debogage.js la description des onglets, et n'a pas à
// charger tout le moteur pour autant. Rien ne s'exécute ici qu'une table de noms, faite au chargement.

import { MODULES, EN_ATTENTE } from './index.js';
import { reecritures as demarrage } from './demarrage.js';
import { nommerLesFonctions } from './debogage.js';

// adresse → [nom, module] ; une fonction posée par plusieurs listes garde le nom de la première
// (celui de son module terminé plutôt que des listes d'attente).
const noms = new Map();
for (const [module, liste] of Object.entries(MODULES)) {
  for (const r of liste) if (!noms.has(r.adresse)) noms.set(r.adresse, [r.nom, module]);
}
for (const r of EN_ATTENTE) if (!noms.has(r.adresse)) noms.set(r.adresse, [r.nom, 'en attente']);
for (const r of demarrage) if (!noms.has(r.adresse)) noms.set(r.adresse, [r.nom, 'demarrage']);
nommerLesFonctions(noms);
