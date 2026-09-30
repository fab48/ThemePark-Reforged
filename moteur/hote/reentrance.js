// Les pilotes du moteur réentrant (moteur/node/reentrer.mjs).
//
// Le moteur réentrant est la variante du moteur autonome où les fonctions du jeu qui appellent
// d'autres fonctions du jeu sont des générateurs : à chaque retour d'appel, si l'hôte l'a demandé
// (`machine.pauseDemandee`, posée par un observateur : une image à montrer, de l'avance sur le temps
// réel, des entrées à lire), le moteur rend la main à celui qui le conduit, avec cette demande. Ce
// module n'est pas utilisé par le moteur actuel ; reentrer.mjs le copie avec la variante.
//
// La convention, partout : une fonction de la table du processeur (et `demarrer`, et ce que rend
// `appelLointain`) rend undefined quand elle a fini, ou un itérateur qui la finira ; les fonctions
// ordinaires, les feuilles, ne coûtent ainsi aucun générateur.

// Une valeur est-elle un itérateur (l'exécution d'un générateur, ou un Immediat) ?
export function estIterateur(x) {
  return typeof x === 'object' && x !== null && typeof x.next === 'function';
}

// Un résultat déjà là, que `yield*` parcourt comme un générateur qui aurait fini sans rendre la main :
// `(yield* new Immediat(v))` vaut v. C'est ce que rend `jeu.appeler` quand l'appelée a fini d'une
// traite et que rien ne demande de pause, le cas de loin le plus fréquent : un petit objet, au lieu
// d'un générateur à créer puis à parcourir.
export class Immediat {
  constructor(valeur) { this.valeur = valeur; }
  [Symbol.iterator]() { return this; }
  next() { return { done: true, value: this.valeur }; }
}

// Parcourir ce qu'a rendu une fonction qui peut être ordinaire ou générateur : `(yield* deleguer(f()))`
// vaut le résultat de f dans les deux cas.
export function deleguer(r) {
  return typeof r === 'object' && r !== null && typeof r.next === 'function' ? r : new Immediat(r);
}

// Exécuter d'une traite, sans jamais rendre la main : les demandes de pause sont ignorées. Pour ce que
// l'hôte appelle de façon synchrone, les gestionnaires d'interruption (machine.js) : sur la machine de
// 1994, une interruption s'exécute jusqu'à son iretd, et le code interrompu attend.
// Une demande de pause n'est jamais rendue pendant une interruption (jeu.appelerReentrant regarde
// machine.enInterruption) : toute demande qui arrive ici vient d'un appel que l'analyse de
// reentrer.mjs croyait sans pause, et elle est perdue ; on les compte (statistiques.pausesAvalees),
// les vérificateurs les affichent.
export const statistiques = { pausesAvalees: 0 };
export function executerSansPause(r) {
  if (!estIterateur(r)) return r;
  let e = r.next();
  while (!e.done) { statistiques.pausesAvalees++; e = r.next(); }
  return e.value;
}

// Le pilote de Node (les vérificateurs, le lanceur) : démarrer la machine et conduire le programme
// jusqu'au bout sans jamais dormir ; chaque demande de pause est rendue puis reprise aussitôt, et
// comptée (machine.pausesRendues), avec le plus long intervalle de temps virtuel passé sans rendre la
// main depuis la première image présentée (machine.plusLongSansPause, en µs) : une attente du joueur
// qui ne rendrait pas la main s'y verrait. (Avant la première image, le démarrage de la bibliothèque
// C étalonne sa boucle d'attente sur deux secondes du DOS, 0x89F27, sans appel du jeu : deux secondes
// virtuelles, une fraction de seconde réelle, que l'on ne compte pas.) Les exceptions (Sortie, Arret)
// remontent comme avec le moteur ordinaire.
export function piloterSansDormir(machine) {
  machine.pausesRendues = 0;
  machine.plusLongSansPause = 0;
  statistiques.pausesAvalees = 0;
  machine.statistiquesReentrance = statistiques;
  let derniere = null;
  const execution = machine.demarrer();
  if (!estIterateur(execution)) return;
  for (let e = execution.next(); !e.done; e = execution.next()) {
    machine.pausesRendues++;
    if (derniere !== null && machine.us - derniere > machine.plusLongSansPause) machine.plusLongSansPause = machine.us - derniere;
    if (machine.images > 0) derniere = machine.us;
  }
}

// La garde du temps réel, pour le pilote de la page (moteur/web/moteur-du-jeu.js). Les observateurs ne
// passent qu'au fil du temps virtuel (machine.js, chaque milliseconde virtuelle) ; or le temps virtuel
// n'avance qu'aux services rendus au jeu et aux images, et un pas de simulation n'en demande presque
// pas. Le jeu accéléré (F4 : vitesse + 1 pas par image, sans borne dans le jeu de 1994) fait tenir des
// dizaines de pas dans une image, sans qu'aucun observateur ne passe : le moteur ne rendait la main
// qu'à l'image suivante, et une image pouvait prendre des centaines de millisecondes réelles, la page
// figée d'autant (retour 80 de docs/demandes.md). La garde fait de `machine.pauseDemandee` un accesseur :
// ce que les observateurs y posent est rendu tel quel ; quand rien n'y est posé et que l'heure réelle a
// passé `garde.echeance` (posée par le pilote au début de chaque tranche), elle y pose `demande`. Le
// moteur réentrant lit ce champ à chaque retour d'un appel qui peut rendre la main (jeu/index.js,
// `enPause`) : entre deux pas de simulation, entre deux étapes d'un pas, dans les attentes. Rendre la
// main là ne change rien à la partie (les vérificateurs la font rendre à chaque milliseconde
// virtuelle) : la garde ne touche qu'au temps réel. L'horloge n'est lue qu'une fois sur LECTURES
// lectures du champ, pour que la garde ne coûte presque rien.
const LECTURES = 16;
export function garderLeTempsReel(machine, demande, horloge = () => performance.now()) {
  let posee = machine.pauseDemandee === undefined ? null : machine.pauseDemandee;
  let compte = 0;
  const garde = { echeance: Infinity, rendues: 0 };
  Object.defineProperty(machine, 'pauseDemandee', {
    configurable: true,
    enumerable: true,
    get() {
      if (posee === null && ++compte >= LECTURES) {
        compte = 0;
        if (horloge() >= garde.echeance) { posee = demande; garde.rendues++; }
      }
      return posee;
    },
    set(v) { posee = v; },
  });
  return garde;
}

// Pour la page (à venir) : reprendre l'exécution jusqu'à la prochaine demande de pause. Rend la
// demande (ce qu'avait posé l'observateur, par exemple { pause: ms }), ou null quand le programme a
// fini. Le pilote de la page appelle `reprendre` puis rend la main au navigateur (setTimeout,
// requestAnimationFrame) le temps que dit la demande.
export function reprendre(execution) {
  if (!estIterateur(execution)) return null;
  const e = execution.next();
  return e.done ? null : e.value;
}
