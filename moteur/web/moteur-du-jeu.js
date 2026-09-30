// Le jeu, prêt à tourner : la machine, ses observateurs, et ce qu'elle publie pour la page. Ce module
// sert aux deux façons de faire tourner le moteur ; seule change la façon de rendre la main.
//
//  - Dans un Web Worker (travailleur.js, `fil: 'travailleur'`), le mode de la page servie. Le code du
//    jeu ne rend jamais la main (il boucle comme sous DOS) : le travailleur se cale sur le temps réel
//    en dormant (Atomics.wait). L'image et les entrées passent par de la mémoire partagée avec la page
//    (memoire-partagee.js).
//  - Dans le fil de la page (`fil: 'page'`), sans Worker ni SharedArrayBuffer : la distribution,
//    servie ou ouverte en file:// (moteur/node/construire-distribution.mjs), ou moteur/web/local.html. Il faut alors
//    le moteur réentrant (moteur/node/reentrer.mjs), où les fonctions du jeu qui peuvent mener à une
//    pause sont des générateurs : l'observateur pose `machine.pauseDemandee` au lieu de dormir, le
//    moteur rend la main au retour de l'appel en cours, et le pilote (`piloterDansLaPage`, plus bas)
//    rend la main au navigateur dès que le jeu a de l'avance sur le temps réel, ou que la tranche a
//    pris BUDGET ms (même au milieu d'une image : la garde du temps réel, reentrance.js), ou qu'une
//    image est présentée ; il le reprend à l'image suivante de l'écran (requestAnimationFrame, ou un
//    minuteur quand elle ne vient pas). La même disposition de l'écran vit dans une mémoire
//    ordinaire ; les entrées arrivent par la même file, que la page remplit entre deux tranches.
//
// C'est le moteur autonome : le code lisible seul (moteur/hote/processeur.js, moteur/jeu/), sans
// transcription ni MAIN.EXE ; les données du jeu viennent des assets (moteur/hote/assets-du-jeu.js),
// que la page a trouvés (moteur/web/donnees.js, ou dans la page même) et dont le moteur refait les
// fichiers du CD.
//
// Les enveloppes posées sur des routines du jeu (plus bas, installerRemplacements) sont écrites pour
// les deux moteurs : une routine rend undefined quand elle a fini, ou, dans le moteur réentrant,
// l'itérateur qui la finira ; l'enveloppe rend ce qu'elle rend, et fait son propre travail après
// (`puis`). Celle du film (0x5C04F) attend la page : dans le fil de la page, c'est un générateur qui
// rend la main jusqu'à la fin du film ; 0x5C04F est un point de pause de reentrer.mjs.

import { Machine, Sortie, Arret, ADRESSES_DE_MAIN } from '../hote/machine.js';
import { FichiersDuPaquet, ouvrirLePaquet } from '../hote/fichiers-paquet.js';
import { creerProcesseur } from '../hote/processeur.js';
import { lireLImage } from '../hote/image-programme.js';
import { poserLeProgramme, poserLIntroduction } from '../jeu/index.js';
import { reglages } from '../jeu/reglages.js';
import { vueFluide } from '../jeu/vue-fluide.js';
import { MEMOIRE_ETENDUE, demanderLaTaille, ecran as geometrie, ECRANS_DU_PARC } from '../jeu/grande-vue.js';
import { REPITS_DES_BRUITAGES } from '../hote/son.js';
import { fichiersDesSons, MANIFESTE_DES_SONS } from './fichiers-des-sons.js';
import { vuesDeLEcran, Z, REGIONS_MAX, CHAMPS_REGION, RETOUCHES_MAX, RETOUCHES_OCTETS, TRAINEES_OCTETS, atomiques } from './memoire-partagee.js';
import { debogage, accidents } from '../jeu/debogage.js';
import '../jeu/debogage-noms.js';     // les noms des fonctions, pour l'état du parc de la fenêtre de débogage
import { appliquer as intercalerLesAnimations, definirLesImagesCuites, attractionsDeLaTrainee,
  dernieresRetouches } from '../jeu/animations-intercalees.js';
import { creerLeReleve } from './liste-affichage.js';
import { garderLeTempsReel } from '../hote/reentrance.js';

// Ce que le pilote de la page passe à chaque reprise (`next(PILOTE)`) : un générateur qui attend la
// page (le film) sait ainsi qu'il est conduit par un pilote qui rend la main au navigateur. Parcouru
// d'une traite (`executerSansPause` du moteur réentrant, une erreur d'analyse), il ne reçoit rien, et
// cesse d'attendre plutôt que de figer la page.
const PILOTE = { pilote: true };
// La demande de pause de l'observateur (dans le fil de la page) : le pilote calcule lui-même, au
// moment où le moteur rend la main, l'avance sur le temps réel.
const DEMANDE = { pause: 0 };
// Le temps réel qu'une tranche du moteur peut prendre au plus, dans le fil de la page (ms) : au-delà,
// la main est rendue au navigateur (l'image, les entrées), même si le jeu est en retard, et même au
// milieu d'une image : la garde du temps réel (reentrance.js, garderLeTempsReel ; retour 80).
const BUDGET = 12;

// Une valeur est-elle un itérateur (ce que rend une routine du moteur réentrant qui n'a pas fini) ?
const estIterateur = (x) => typeof x === 'object' && x !== null && typeof x.next === 'function';
// Ce que rend `r` (le retour d'une routine), puis `apres(valeur)` : aussitôt si la routine a fini,
// sinon à sa fin, par un générateur qui la parcourt.
function puis(r, apres) {
  if (!estIterateur(r)) { apres(r); return r; }
  return (function* () { const v = yield* r; apres(v); return v; }());
}

// d : { ecran, entrees, son (vrai : le jeu a une carte son), remplacements (faux : les sons d'origine,
//   sans le manifeste des sons remplacés), ligneCommande, donnees: { paquet, sauvegardes } } ;
// hote : { fil ('travailleur' ou 'page'), envoyer(message, transferts) (à la page), lireLesAnimations()
//   (le texte de rendu.json, null s'il n'y en a pas, ou une promesse de l'un ou l'autre) }.
// Dans le fil de la page, rend une promesse tenue quand le jeu a démarré (il tourne ensuite par
// tranches) ; dans le travailleur, ne rend la main qu'à la fin du programme.
export async function lancerLeJeu(d, hote) {
  const { ecran, entrees, son, remplacements, ligneCommande, donnees } = d;
  const enPage = hote.fil === 'page';
  const envoyer = (message, transferts) => hote.envoyer(message, transferts);
  const journal = (s) => envoyer({ journal: s });
  // La disposition de la mémoire de l'écran : memoire-partagee.js. Les images vont jusqu'à la taille
  // maximale de la grande vue (moteur/jeu/grande-vue.js).
  const vues = vuesDeLEcran(ecran);
  const { entete, palette, pixels, imageFluide, vueDuParc } = vues;
  // Atomics sur la mémoire partagée ; de simples accès sur la mémoire ordinaire (fil de la page).
  const A = atomiques(ecran);
  // Le défilement fluide (moteur/jeu/vue-fluide.js) : la dernière image du parc publiée par le jeu,
  // et sa vue seule, sous un verrou de séquence (entete[3] impair pendant l'écriture) ; entete[4] à
  // [8] : largeur, hauteur, hauteur de la vue, position de la vue dans le monde ; [10], [11] : la
  // taille des tuiles ; [9] : le parc est à l'écran et publie ses images. En grande vue, pour le
  // zoom de la page (zoom.js), les entiers Z de memoire-partagee.js : les régions de l'interface et
  // le curseur, publiés avec l'image.
  const file = new Int32Array(entrees);
  const AF = atomiques(entrees);
  // entete[16] : la vue du parc est en grande vue, la molette y zoome (principal.js).
  // (dans le travailleur, de quoi dormir)
  const sommeil = enPage ? null : new Int32Array(new SharedArrayBuffer(4));
  const dormir = (ms) => Atomics.wait(sommeil, 0, 0, ms);

  journal('ouverture du paquet des donnees...');
  let paquet;
  try {
    paquet = await ouvrirLePaquet(donnees.paquet);
  } catch (err) {
    journal('ERREUR : ' + (err.message || err));
    return;
  }
  // Les films en mp4 (assets/films, moteur/web/films.js) : la page les joue à la place des films du
  // jeu ; le jeu attend leur fin ici, comme il attendait la fin de son film (entete[Z.FILM], que la page
  // pose à 1). Dans le travailleur, il dort ; dans le fil de la page, il rend la main (un générateur).
  const films = paquet.films || {};
  const demanderLeFilm = (fichier, boucle) => {
    A.store(entete, Z.FILM, 0);
    envoyer({ film: { fichier, boucle } });
  };
  const attendreLaPage = (fichier, boucle = false) => {
    demanderLeFilm(fichier, boucle);
    while (Atomics.load(entete, Z.FILM) === 0) Atomics.wait(entete, Z.FILM, 0, 1000);
  };
  function* attendreLaPageEnRendantLaMain(fichier, boucle = false) {
    demanderLeFilm(fichier, boucle);
    while (A.load(entete, Z.FILM) === 0) {
      if ((yield { pause: 50 }) !== PILOTE) { console.warn('film : attente parcourue sans pilote, abandonnée'); return; }
    }
  }
  // Les fichiers ecrits par le jeu (ses parties, la fin d'annee...) repartent vers la page, qui les range.
  const fichiers = new FichiersDuPaquet(paquet, donnees.sauvegardes,
    (chemin, octets) => envoyer({ fichier: { chemin, octets } }, octets && !enPage ? [octets.buffer] : []));
  const image = lireLImage(paquet.programme);
  const T = creerProcesseur();
  // la carte son : Sound Blaster 16 et sa puce FM (moteur/hote/son.js), jouee par la page
  // La mémoire de l'hôte a de quoi loger les tampons de la grande vue, hors de celle du jeu.
  const machine = new Machine({ image, T, fichiers, journal, ligneCommande, son: son ? {} : null,
    memoireEtendue: MEMOIRE_ETENDUE,
    programme: (m, t) => journal(`moteur autonome : ${poserLeProgramme(m, t)} fonctions lisibles`) });
  // Dans le fil de la page, il faut le moteur réentrant (le seul à savoir rendre la main) : avec le
  // moteur ordinaire, le jeu tournerait sans fin dans le fil de la page et la figerait.
  if (enPage && !('pauseDemandee' in machine)) {
    journal('ERREUR : le moteur réentrant manque (node moteur/node/reentrer.mjs ; la page locale est servie sous /reentrant/)');
    return;
  }
  // La garde du temps réel (fil de la page, retour 80 de docs/demandes.md) : les observateurs ne passent
  // qu'au fil du temps virtuel, qu'un pas de simulation ne fait presque pas avancer ; le jeu accéléré
  // (F4 : vitesse + 1 pas par image) faisait tenir des dizaines de pas dans une image, et le moteur ne
  // rendait la main qu'à l'image suivante, la page figée des centaines de millisecondes. La garde
  // demande la pause dès que la tranche a passé son échéance (`garde.echeance`, posée par le pilote),
  // à la prochaine frontière d'appel où le moteur sait rendre la main : entre deux pas, entre deux
  // objets du parc. La partie n'en est pas changée, seulement le temps réel où la page reprend la main.
  const garde = enPage ? garderLeTempsReel(machine, DEMANDE) : null;
  // Le son (moteur/hote/son.js, `evenements`) : ni synthèse ni mélange ici ; le jeu dit ce qu'il
  // demande, et la page joue les fichiers (audio.js, message `son`), chacun désigné par
  // fichiers-des-sons.js : l'original, ou ce que le manifeste sons/index.json met à sa place.
  let manifesteDesSons = null;
  if (son && remplacements !== false) {
    try {
      manifesteDesSons = JSON.parse(new TextDecoder().decode(await paquet.lireAsset(MANIFESTE_DES_SONS)));
    } catch (err) { /* pas de manifeste : les sons d'origine */ }
  }
  const completerLesSons = fichiersDesSons(paquet.index, manifesteDesSons);
  const envoyerLesSons = (liste) => envoyer({ son: liste.map(completerLesSons) });
  if (machine.son) machine.son.evenements(envoyerLesSons);
  // Le répit des bruitages (son.js) : le « huuum » du vomi, que le jeu relance sans cesse, et le vomi
  // ne se font entendre qu'après un délai. Seul le son produit change, pas la partie.
  if (machine.son) machine.son.repit(REPITS_DES_BRUITAGES);
  const anciennes = machine.installerRemplacements.bind(machine);
  machine.installerRemplacements = () => {
    anciennes();
    // La liste d'affichage du rendu HD (liste-affichage.js) : ses enveloppes, posées une fois ; éteintes
    // (le défaut), elles ne font qu'un test, et le jeu n'en voit rien. Allumées par le message 25.
    releve = creerLeReleve(machine, T);
    releve.installer();
    if (hdVoulu) releve.allumer();
    // L'heure du dernier dessin de la vue du parc (0x13B9A), et s'il l'a été en 320x200, pour le
    // 640x480 d'office (plus bas). L'enveloppe ne fait qu'appeler la fonction : la partie n'en est pas
    // changée.
    const dessinerLaVue = T.fonction(0x13B9A);
    T.remplacer(0x13B9A, () => {
      vueDessineeA = machine.us;
      vueDessineeEn320 = machine.dv.getUint16(0xDE5F6, true) === 1;
      return dessinerLaVue();
    });
    // Les déplacements du pointeur que le jeu impose (0x11191 : le pointeur du pilote et le curseur
    // du jeu posés ensemble), comptés pour la page, qui tient elle-même le pointeur quand elle
    // compose le zoom (zoom.js). La même enveloppe : la partie n'en est pas changée.
    const placerLePointeur = T.fonction(0x11191);
    T.remplacer(0x11191, () => puis(placerLePointeur(), () => {
      entete[Z.DEPLACEMENT] = (machine.dv.getInt16(0xBECAC, true) & 0xFFFF) | (machine.dv.getInt16(0xBECAE, true) << 16);
      A.add(entete, Z.DEPLACEMENTS, 1);
    }));
    // L'alarme de mise au point de 0x7E6BC (systeme.js, choisirLaBanque) : une banque au-delà de la
    // cinquième passe la couleur 0, le noir, au rouge vif. Le 640x480 d'origine n'en a que cinq et ne
    // la déclenche jamais ; la grande vue en a plus, et l'alarme, coupée tant que le réglage est
    // allumé, partait quand on l'éteignait, l'écran encore grand pour une présentation : le noir
    // restait rouge jusqu'au rechargement suivant de la palette (retour 43 de docs/demandes.md). Dans la
    // page, elle est défaite aussitôt : la couleur 0 et l'état du DAC reviennent à ce qu'ils étaient.
    // Le journal des accidents de la fenêtre de débogage (moteur/jeu/debogage.js) : l'explosion d'une
    // attraction (0x6662D, l'attraction en argument) et chaque visiteur projeté (0x66189 : le cas, le
    // visiteur, l'objet d'où il part). Les enveloppes ne font que noter, hors de la mémoire du jeu.
    const argument = (k) => machine.dv.getUint32((T.R.esp + 4 + 4 * k) >>> 0, true);
    // Le film d'une attraction ou de la partie gagnée (0x5C04F, son-du-jeu.js) : s'il est en mp4, la
    // page le joue et le jeu attend ; pour lui, c'est un film absent (il ne fait alors rien d'autre).
    // Sans mp4, la routine du jeu joue le film FLC s'il est là.
    if (films.introduction !== undefined || films.partieGagnee || Object.keys(films.attractions || {}).length) {
      const jouerLeFilm = T.fonction(0x5C04F);
      T.remplacer(0x5C04F, () => {
        const genre = argument(0) & 0xFF, attraction = argument(1) & 0xFF;
        const fichier = genre === 1 ? films.partieGagnee : (films.attractions || {})[String(attraction)];
        if (!fichier) return jouerLeFilm();
        // (le jeu rejouait certains films jusqu'à un clic ou une touche : la page fait de même)
        const boucle = genre !== 1 && !!(films.enBoucle || {})[String(attraction)];
        if (enPage) return attendreLaPageEnRendantLaMain(fichier, boucle);
        attendreLaPage(fichier, boucle);
      });
    }
    const exploser = T.fonction(0x6662D);
    T.remplacer(0x6662D, () => {
      accidents.explosion(machine, argument(0));
      let r;
      try { r = exploser(); } catch (err) { accidents.finDExplosion(); throw err; }
      if (!estIterateur(r)) { accidents.finDExplosion(); return r; }
      return (function* () { try { return yield* r; } finally { accidents.finDExplosion(); } }());
    });
    const projeter = T.fonction(0x66189);
    T.remplacer(0x66189, () => {
      accidents.projete(machine, argument(0) & 0xFFFF, argument(1), argument(2));
      return projeter();
    });
    // Le glisser au bouton du milieu (principal.js, message 23) : le pointeur prend la main ouverte, l'image
    // 13 de la banque des pointeurs ([0xD3B84], 6 octets par image). La boucle du parc repose à chaque
    // image le pointeur de l'outil par 0x116E4 (amorcage.js) : pendant le glisser, dans la vue du parc,
    // l'enveloppe lui passe la main ouverte à la place ; au relâchement, le pointeur de l'outil revient
    // de lui-même à l'image suivante.
    const changerLeCurseur = T.fonction(0x116E4);
    T.remplacer(0x116E4, () => {
      if (glisseEnCours && machine.dv.getInt16(0xD6652, true) === 0) {
        machine.dv.setUint32((T.R.esp + 4) >>> 0, (machine.dv.getUint32(0xD3B84, true) + 6 * MAIN_OUVERTE) >>> 0, true);
      }
      return changerLeCurseur();
    });
    const choisirLaBanque = T.fonction(0x7E6BC);
    T.remplacer(0x7E6BC, () => {
      const v = machine.video, p = v.palette;
      const avant = [p[0], p[1], p[2], v.dacEcriture, v.dacComposante];
      return puis(choisirLaBanque(), () => {
        if (p[0] === 0x3F && p[1] === 0 && p[2] === 0 && !(avant[0] === 0x3F && avant[1] === 0 && avant[2] === 0)) {
          [p[0], p[1], p[2], v.dacEcriture, v.dacComposante] = avant;
        }
      });
    });
  };
  let vueDessineeA = -Infinity, vueDessineeEn320 = false;

  let publieeA = -Infinity;
  let brouillon = new Uint8Array(0);
  vueFluide.surImage = (im) => {
    A.add(entete, 3, 1);
    // Les animations intercalées : les retouches de cette image, à l'instant de sa publication,
    // publiées AVANT elle (retouches.js). Publiées seulement à l'image montrée suivante, la page
    // composait entre-temps l'image du jeu nue : l'attraction revenait un instant à l'étape d'origine
    // entre deux intermédiaires, et tremblait. (Le brouillon : appliquer retouche l'image qu'on lui
    // donne, celle-ci reste celle du jeu.)
    if (reglages.animationsIntercalees) {
      const n = im.largeur * im.hauteur;
      if (brouillon.length < n) brouillon = new Uint8Array(n);
      brouillon.set(im.image.subarray(0, n));
      intercalerLesAnimations(machine.m8, machine.dv, brouillon, im.largeur, im.hauteur, machine.us, machine.video.palette);
      publierLesRetouches(A.load(entete, 3) + 1);
    }
    entete[4] = im.largeur; entete[5] = im.hauteur; entete[6] = im.hauteurVue;
    entete[7] = im.x; entete[8] = im.y; entete[10] = im.tuile[0]; entete[11] = im.tuile[1];
    entete[Z.CAMERA] = (im.camera[0] & 0xFFFF) | (im.camera[1] << 16);
    // (le dernier cadrage sur un objet : la page y amène la portion qu'elle montre, zoom.js)
    const oc = im.objetCadre;
    if (oc) {
      entete[Z.CADRAGES] = oc.nombre;
      entete[Z.CADRAGE_CASE] = oc.colonne | (oc.rangee << 16);
      entete[Z.CADRAGE_FIN] = oc.finX | (oc.finY << 8);
    }
    imageFluide.set(im.image);
    vueDuParc.set(im.vue);
    entete[Z.GRANDE] = im.grande ? 1 : 0;
    entete[Z.BARRE_X] = im.barreX || 0;
    const n = Math.min(REGIONS_MAX, im.regions ? im.regions.length : 0);
    for (let k = 0; k < n; k++) vues.regions.set(im.regions[k], k * CHAMPS_REGION);
    entete[Z.REGIONS] = n;
    const c = im.curseur;
    entete[Z.CURSEUR] = c ? (c.visible ? 1 : 0) | (c.pose ? 2 : 0) : 0;
    // (la place du curseur, pour toute image : le glisser au bouton du milieu l'ancre au parc)
    entete[Z.CURSEUR_X] = im.pointeur[0]; entete[Z.CURSEUR_Y] = im.pointeur[1];
    if (c) {
      entete[Z.CURSEUR_L] = c.largeur; entete[Z.CURSEUR_H] = c.hauteur;
      vues.spriteCurseur.set(c.sprite.subarray(0, c.largeur * c.hauteur));
      [entete[Z.POSE_X], entete[Z.POSE_Y], entete[Z.POSE_L], entete[Z.POSE_H]] = c.rect;
      if (c.pose) vues.dessousCurseur.set(c.dessous.subarray(0, c.rect[2] * c.rect[3]));
    }
    A.add(entete, 3, 1);
    publieeA = machine.us;
    if (im.grande) grandePublieeA = machine.us;
  };
  let grandePublieeA = -Infinity;

  let t0 = performance.now();        // (remis au départ du jeu, après l'introduction)
  const RETARD_MAX = 250;
  let retardOublie = 0;          // ms de retard du jeu sur le temps réel, oubliées (plus bas)
  let entreDeuxAFaire = false;   // l'image présentée entre deux du jeu (plus bas)
  let prochaineImage = 0;
  const periodeImage = 1e6 / 60;
  const PERIODE_DU_JEU = 1000 / 30;   // (ms : une image du jeu, machine.js, cadenceImages)
  // L'avance du temps virtuel sur le temps réel, en ms.
  const avanceSurLeReel = (m) => m.us / 1000 - (performance.now() - t0 - retardOublie);

  // Après un changement de mode (les écrans pleins passent en 320x200 et en reviennent), le jeu
  // présente d'abord un écran vide, puis une image à palette noire, avant la nouvelle image : sur un
  // moniteur de 1994, c'était un noir de resynchronisation. Pendant les 300 ms virtuelles qui suivent
  // le changement, ces images vides ne sont pas publiées ; la page garde la précédente.
  let modePrecedent = '', changementA = -Infinity;
  const imageVide = (source, n, pal) => {
    let noire = true;
    for (let k = 0; k < 768; k++) if (pal[k]) { noire = false; break; }
    if (noire) return true;
    const c = source[0];
    for (let k = 1; k < n; k++) if (source[k] !== c) return false;
    return true;
  };

  // `decalage` (µs) : une image présentée entre deux du jeu (plus bas, « à 60 images par seconde ») ;
  // l'écran est le même, les animations intercalées y sont posées d'autant plus loin.
  function presenter(m, decalage = 0) {
    const v = m.video;
    const l = v.largeur, h = v.hauteur;
    const mode = `${l}x${h}`;
    if (mode !== modePrecedent) { modePrecedent = mode; changementA = m.us; }
    if (basculeEnCours) return;      // 640x480 d'office en cours : la page garde l'image d'avant
    if (v.vesa) v.rangerFenetre();
    const source = v.vesa ? v.vram.subarray(0, l * h) : m.m8.subarray(0xA0000, 0xA0000 + l * h);
    if (m.us - changementA <= 3e5 && imageVide(source, l * h, v.palette)) return;
    pixels.set(source);
    // Les animations intercalées (reglages.js) : l'image montrée seule est retouchée ; les retouches
    // sont aussi publiées pour la page, qui les repose quand elle compose elle-même son image
    // (défilement fluide, zoom : retouches.js).
    entete[Z.ANIM_PIXELS] = intercalerLesAnimations(m.m8, m.dv, pixels, l, h, m.us + decalage, v.palette);
    // (avec l'image présentée qu'elles retouchent : la page y mêle la traînée de la façon « ×2 »)
    publierLesRetouches(undefined, A.load(entete, 0) + 1);
    palette.set(v.palette);
    entete[1] = l; entete[2] = h;
    // le parc publie ses images depuis moins de 100 ms virtuelles, dans le mode affiché
    entete[9] = reglages.defilementFluide && m.us - publieeA <= 1e5 && entete[4] === l && entete[5] === h ? 1 : 0;
    entete[16] = geometrie.grande && m.dv.getInt16(0xD6652, true) === 0 ? 1 : 0;
    // la grande vue publie ses images (le zoom de la page les compose), dans le mode affiché
    entete[Z.FRAIS] = geometrie.grande && m.us - grandePublieeA <= 1e5 && entete[4] === l && entete[5] === h
      && ECRANS_DU_PARC.includes(m.dv.getInt16(0xD6652, true)) ? 1 : 0;
    // Le rendu HD : les opérations qui ont mené à cette image, et sa fin (liste-affichage.js), envoyées
    // avec elle ; la page les rejoue toutes, dans l'ordre (rendu-hd.js).
    if (releve && releve.actif) {
      releve.image(A.load(entete, 0) + 1);
      const lot = releve.lot();
      lot.recalages = releve.recalages;      // (ce que la vérification a dû redonner en pixels de 1994)
      envoyer({ listeHD: lot }, enPage ? [] : [lot.mots.buffer, lot.octets.buffer]);
    }
    A.add(entete, 0, 1);
  }
  let releve = null, hdVoulu = false;

  // Les retouches de la dernière image (animations-intercalees.js), pour la page (retouches.js) : sous
  // le verrou de séquence entete[Z.RETOUCHES], avec la publication du parc qu'elles retouchent (par
  // défaut la dernière ; `image` : celle qui va paraître, pendant sa publication), l'image présentée
  // qu'elles retouchent (`presentee`, −1 : aucune), et la traînée de la façon « ×2 » (RGBA).
  let retouchesPubliees = 0;
  function publierLesRetouches(image = A.load(entete, 3), presentee = -1) {
    const liste = dernieresRetouches();
    if (!liste.length && !retouchesPubliees) return;
    A.add(entete, Z.RETOUCHES, 1);
    entete[Z.RETOUCHES_IMAGE] = image;
    entete[Z.RETOUCHES_PRESENTEE] = presentee;
    let n = 0, o = 0, ot = 0;
    for (const { r, pose, apres, trainee } of liste) {
      const t = r.l * r.h;
      if (n >= RETOUCHES_MAX || o + 2 * t > RETOUCHES_OCTETS) break;
      vues.rectanglesRetouches.set([r.x, r.y, r.l, r.h], 4 * n);
      vues.octetsRetouches.set(pose.subarray(0, t), o);
      vues.octetsRetouches.set(apres.subarray(0, t), o + t);
      const avec = !!trainee && ot + 4 * t <= TRAINEES_OCTETS;
      vues.traineesPresentes[n] = avec ? 1 : 0;
      if (avec) { vues.octetsTrainees.set(trainee.subarray(0, 4 * t), ot); ot += 4 * t; }
      o += 2 * t; n++;
    }
    entete[Z.RETOUCHES_N] = n;
    retouchesPubliees = n;
    A.add(entete, Z.RETOUCHES, 1);
  }

  // Le tracé à la souris suit la main : la correction du double comptage (moteur/jeu/reglages.js,
  // souris-jeu.js), toujours allumée dans la page.
  reglages.corrigerLeTraceALaSouris = true;
  // Le double-clic fantôme (reglages.js) : après la fin d'année, pas d'outil de la case sous le
  // pointeur (un lac) pris en main par deux clics espacés.
  reglages.corrigerLeDoubleClicFantome = true;
  // La table des objets agrandie et plus de visiteurs (reglages.js, table-des-objets.js) : un grand parc
  // ne bloque plus la construction. Avant le démarrage du programme, qui réserve la table une fois.
  reglages.grandeTableDesObjets = true;
  reglages.plusDeVisiteurs = true;
  // Les réglages de la page, allumés par défaut comme dans principal.js (le défilement adouci et
  // fluide, la grande vue, les corrections ; le 640x480 d'office plus bas) : la page envoie ses choix
  // dès le lancement (messages 6, 8, 9, 10, 15, 18), avant que le jeu ne démarre ; d'ici là, ce sont
  // les mêmes. (Les animations intercalées attendent le message 18, qui charge leurs images.)
  reglages.defilementAdouci = true;
  reglages.defilementFluide = true;
  reglages.grandeVue = true;
  reglages.corrigerLesDeplacementsDuPersonnel = true;
  reglages.corrigerLesEjections = true;
  reglages.corrigerLeRetourDesVisiteurs = true;
  reglages.corrigerLesToursEnTrop = true;
  reglages.corrigerLaFileEnPause = true;
  reglages.corrigerLeLabyrintheHorsDeVue = true;
  reglages.corrigerLeCadrageSurUnObjet = true;

  // Le pointeur arrive en coordonnees normalisees : 65 536 = la largeur (ou la hauteur) de l'image
  // affichee. On le convertit en unites du pilote de souris : le jeu travaille dans un espace logique
  // (640x400 en 320x200), deux unites par pixel, et huit fois plus finement en haute resolution
  // (souris-jeu.js, 0x11303). Le mouvement est calcule entre deux positions converties avec les memes
  // facteurs : il reste juste quand le mode change entre deux evenements. (Deduits de la plage du
  // pilote, les facteurs tombaient de 8 a 7 quand le jeu la resserre sur la vue, pendant un trace
  // en 640x480 : le trace y allait moins vite que la main.)
  let pointeurPrecedent = null;
  const facteurs = (m) => (m.video.largeur === 320 ? [2, 2] : [8, 8]);
  function versPilote(m, a, c) {
    const [fx, fy] = facteurs(m);
    return [Math.floor(a * m.video.largeur / 65536) * fx, Math.floor(c * m.video.hauteur / 65536) * fy];
  }
  // Souris capturée : des mouvements normalisés, convertis de même ; les fractions d'unité du pilote
  // sont gardées d'un mouvement au suivant, pour que les petits gestes ne se perdent pas.
  let resteX = 0, resteY = 0, cibleDuZoom = null, vueDuZoom = null;
  function mouvementCapture(m, a, c) {
    const [fx, fy] = facteurs(m);
    resteX += a * m.video.largeur * fx / 65536;
    resteY += c * m.video.hauteur * fy / 65536;
    const dx = Math.trunc(resteX), dy = Math.trunc(resteY);
    resteX -= dx; resteY -= dy;
    m.deplacerSourisDe(dx, dy);
    pointeurPrecedent = null;          // au retour du pointeur libre, pas de saut depuis l'ancienne position
  }

  // Les animations intercalées (rendu.json : moteur/node/importer-animations.mjs), lues une fois, à la
  // première demande ; le texte arrive tout de suite (le travailleur le lit d'une requête synchrone, le
  // fichier unique le décompresse) ou par une promesse (la page locale servie le télécharge).
  let imagesCuitesChargees = false, imagesCuitesPretes = false;
  function chargerLesAnimations() {
    imagesCuitesChargees = true;
    const poser = (texte) => {
      let n = 0;
      try { n = definirLesImagesCuites(texte ? JSON.parse(texte) : null); } catch (err) { journal(`animations illisibles : ${err.message}`); }
      imagesCuitesPretes = true;
      journal(`animations : ×2 + traînée pour ${n} attraction(s)`);
      entete[Z.ANIM_IMAGES] = 1 + attractionsDeLaTrainee();
    };
    let r;
    try { r = hote.lireLesAnimations(); } catch (err) { r = null; }
    if (r && typeof r.then === 'function') r.then(poser, () => poser(null));
    else poser(r);
  }

  // `introduction` : c'est INTRO.EXE qui tourne (plus bas). Il n'a ni souris ni rien de ce que la page
  // règle dans la mémoire du jeu : ces messages sont passés, les réglages de la page gardés pour le
  // jeu. Un clic y vaut une touche (Échap), qui arrête le film comme sous DOS.
  function lireEntrees(m, introduction = false) {
    // file circulaire : [0] ecriture, [1] lecture, puis 256 evenements de 4 entiers
    while (AF.load(file, 1) !== AF.load(file, 0)) {
      const k = AF.load(file, 1);
      const b = 4 + 4 * (k % 256);
      const type = file[b], a = file[b + 1], c = file[b + 2];
      if (introduction && [1, 7, 13, 14, 20, 21, 23, 24].includes(type)) {
        AF.store(file, 1, k + 1);
        continue;
      }
      if (introduction && type === 2) {
        if (a !== 0) { m.toucheAppuyee(0x01, 0x1B); m.toucheRelachee(0x01); }
        AF.store(file, 1, k + 1);
        continue;
      }
      if (type === 1) {          // souris : position normalisee du pointeur (voir versPilote)
        const [x, y] = versPilote(m, a, c);
        const [px, py] = pointeurPrecedent ? versPilote(m, pointeurPrecedent[0], pointeurPrecedent[1]) : [x, y];
        m.deplacerPointeur(x, y, x - px, y - py);
        pointeurPrecedent = [a, c];
      } else if (type === 20) {  // le pointeur de la page a rejoint le curseur du jeu : la référence
        // des mouvements suivants, sans mouvement (principal.js, recalerLePointeur)
        const [x, y] = versPilote(m, a, c);
        m.deplacerPointeur(x, y, 0, 0);
        pointeurPrecedent = [a, c];
      } else if (type === 21) glisserLaVue(m, a / 16, c / 16);
      else if (type === 24) placerLaCamera(m, a, c);
      else if (type === 23) {
        glisseEnCours = a === 1;
        vueVoulue = null;
        // (le curseur a suivi le parc, pas la main : le mouvement suivant part d'où il est)
        pointeurPrecedent = null;
      }
      else if (type === 2) m.boutonsSouris(a);
      else if (type === 3) m.toucheAppuyee(a, c);
      else if (type === 4) m.toucheRelachee(a);
      else if (type === 6) hauteResolutionForcee = a === 1;
      else if (type === 7) mouvementCapture(m, a, c);
      else if (type === 8) reglages.defilementAdouci = a === 1;
      else if (type === 9) reglages.defilementFluide = a === 1;
      else if (type === 10) reglages.grandeVue = a === 1;
      else if (type === 11) demanderLaTaille(a, c);
      else if (type === 16) {   // le zoom : une taille ancrée, sur la cible et la vue données juste avant
        demanderLaTaille(a, c, true, cibleDuZoom, vueDuZoom);
        cibleDuZoom = null;
        vueDuZoom = null;
      }
      else if (type === 19) cibleDuZoom = { x: a, y: c };   // où sera le curseur dans la nouvelle image
      else if (type === 22) vueDuZoom = { x: a, y: c };     // où sera sa vue, par rapport à l'ancienne (zoom.js)
      else if (type === 17) m.poserModificateurs(a);        // Maj, Ctrl, Alt enfoncées (bits du BIOS)
      else if (type === 13) debogage.demander(a, c);      // la fenêtre de débogage (moteur/jeu/debogage.js)
      else if (type === 14) debogage.commander(m, a, c, envoyer);
      else if (type === 25) {   // le rendu HD : 1 allumer le relevé (tous les tampons redonnés), 0 l'éteindre
        // (voulu avant que le jeu ne démarre, pendant l'introduction : allumé à la pose des enveloppes)
        hdVoulu = a === 1;
        if (releve) { if (a) releve.allumer(); else releve.eteindre(); }
      }
      else if (type === 26) {   // le rendu HD a perdu ses tampons : les redonner
        if (releve && releve.actif) releve.recaler();
      }
      else if (type === 18) {   // les animations intercalées : 0 non, 1 ×2 + traînée
        reglages.animationsIntercalees = a > 0;
        // (assets/animations/import/rendu.json, lu une fois)
        if (a > 0 && !imagesCuitesChargees) chargerLesAnimations();
        // (1 + le nombre d'attractions chargées ; 0 : rien de chargé)
        else if (imagesCuitesPretes) entete[Z.ANIM_IMAGES] = 1 + attractionsDeLaTrainee();
      }
      else if (type === 15) {   // les corrections de défauts du jeu de 1994 (moteur/jeu/reglages.js)
        reglages.corrigerLesDeplacementsDuPersonnel = a === 1;
        reglages.corrigerLesEjections = a === 1;
        reglages.corrigerLeRetourDesVisiteurs = a === 1;
        reglages.corrigerLesToursEnTrop = a === 1;
        reglages.corrigerLaFileEnPause = a === 1;
        reglages.corrigerLeLabyrintheHorsDeVue = a === 1;
        reglages.corrigerLesPonts = a === 1;
        reglages.corrigerLeCadrageSurUnObjet = a === 1;
      }
      AF.store(file, 1, k + 1);
    }
  }

  // Le glisser au bouton du milieu (principal.js) : la vue suit la main. Le jeu ne défile que case par
  // case (sa caméra compte en cases : 0x183EC, carte.js). Quand elle compose l'image (défilement
  // fluide, zoom), la page tient elle-même la vue montrée, au pixel, et demande la caméra qui la couvre
  // (message 24 : glisser.js) ; elle a pour cela la caméra de chaque vue publiée (vue-fluide.js). Sinon,
  // elle envoie la main (message 21, en pixels de l'image du jeu), et la vue voulue est tenue ici, dans
  // le plan du monde : la case (c, r) en x = c·L + r·⌊L/3⌋, y = r·H (la vue est oblique :
  // interface-parc.js). Ses rangées d'abord, puis ses colonnes pour cette rangée, sont bornées à ce que
  // la caméra atteint : une main qui descend contre le haut de la carte ne fait plus partir la vue de
  // côté, et rien ne s'accumule contre un bord. Seulement dans la vue du parc, caméra libre (0xBA0F8
  // négatif) ; comme 0x183EC, la caméra reste dans les 64 cases de la carte, et la carte est redessinée
  // (0xD666E).
  let vueVoulue = null, glisseEnCours = false;
  const MAIN_OUVERTE = 13;           // (l'image de la banque des pointeurs, voir l'enveloppe de 0x116E4)
  const cameraLibre = (m) => m.dv.getInt16(0xD6652, true) === 0 && ((m.m8[0xBA0F8] << 24) >> 24) < 0;
  function glisserLaVue(m, dx, dy) {
    const dv = m.dv;
    if (!cameraLibre(m)) { vueVoulue = null; return; }
    const L = dv.getUint16(0xD663A, true), H = dv.getUint16(0xD6654, true);
    if (!L || !H) return;
    const biais = Math.trunc(L / 3), f = m.video.largeur === 320 ? 2 : 1;   // (en 320x200, le jeu compte en 640x400)
    const c0 = dv.getInt16(0xD667A, true), r0 = dv.getInt16(0xD6666, true);
    if (!vueVoulue) vueVoulue = { x: c0 * L + r0 * biais, y: r0 * H };
    const v = vueVoulue;
    v.y = Math.max(0, Math.min(63 * H, v.y - dy * f));
    const r = Math.max(0, Math.min(63, Math.round(v.y / H)));
    v.x = Math.max(r * biais, Math.min(63 * L + r * biais, v.x - dx * f));
    const c = Math.round((v.x - r * biais) / L);
    // Le curseur reste sur le point du parc qu'il a saisi (retour 56) : il suit la vue, d'une case à
    // l'autre.
    if (placerLaCamera(m, c, r)) deplacerLeCurseurDe(m, -((c - c0) * L + (r - r0) * biais), -(r - r0) * H);
  }
  // Rend vrai si la caméra a changé.
  function placerLaCamera(m, c, r) {
    if (!cameraLibre(m)) return false;
    const dv = m.dv;
    c = Math.max(0, Math.min(63, c));
    r = Math.max(0, Math.min(63, r));
    if (c === dv.getInt16(0xD667A, true) && r === dv.getInt16(0xD6666, true)) return false;
    dv.setInt16(0xD667A, c, true);
    dv.setInt16(0xD6666, r, true);
    dv.setUint16(0xD666E, 1, true);
    return true;
  }
  // Le curseur du jeu déplacé de (dx, dy) pixels de l'espace logique (640x400 en 320x200), en restant à
  // 4 pixels des bords de l'écran : là, le jeu ferait défiler sa vue lui-même. Un pixel logique vaut une
  // unité du pilote de souris en 320x200, huit en haute résolution (versPilote).
  function deplacerLeCurseurDe(m, dx, dy) {
    const dv = m.dv, bas = m.video.largeur === 320;
    const k = bas ? 1 : 8, l = m.video.largeur * (bas ? 2 : 1), h = m.video.hauteur * (bas ? 2 : 1);
    const x = dv.getInt16(0xBECAC, true), y = dv.getInt16(0xBECAE, true);
    const nx = Math.max(4, Math.min(l - 5, x + dx)), ny = Math.max(4, Math.min(h - 5, y + dy));
    m.deplacerSourisDe((nx - x) * k, (ny - y) * k);
  }

  // 640x480 d'office. Le jeu démarre toujours en 320x200 et ne passe en 640x480 que par la touche R,
  // dans la vue du parc, quand l'octet 0xD7795 vaut 9 (0x13BF3). Si le joueur l'a demandé, on appuie
  // sur R à sa place : c'est le jeu qui bascule, par son propre code, comme si la touche avait été
  // frappée.
  // La vue du parc doit venir d'être dessinée, et en 320x200 : la fin d'année (0x7401C), les
  // négociations (0x44EA5), la fiche du joueur et la carte du monde tournent dans leurs propres
  // boucles, en 320x200, sans changer l'écran courant (0xD6652 reste 0). Un R frappé là attendait
  // dans le tampon du clavier (un toutes les 3 s), et le parc revenu basculait ensuite une fois par
  // R : il revenait de la fin d'année en 320x200, ou clignotait de l'un à l'autre (docs/demandes.md,
  // bogue 2). Une vue dessinée en 320x200 dit que c'est bien la boucle du parc qui tourne dans ce
  // mode ; elle vient d'entrer d'un parc en 640x480, sa dernière vue l'était en 640x480. On appuie donc
  // dès la première image du parc (l'attente d'une seconde qui en tenait lieu montrait une seconde de
  // parc en 320x200 à chaque partie commencée ou chargée, retour 41). Les fondus de R ne prennent pas
  // de temps ici (0x80BE4 n'attend que le bit 3 du port 0x3DA) : le fondu d'arrivée du jeu (0x1A706,
  // après la carte du monde ou le chargement) continue simplement en 640x480.
  // Tant que la bascule est armée (3 s au plus, si R se perdait) et 150 ms après la frappe, rien
  // n'est présenté : la page garde l'image d'avant, et ne montre ni l'image du parc en 320x200, ni,
  // en grande vue, l'image en 640x480 d'avant la grande.
  let hauteResolutionForcee = true, armeeDepuis = null, relacherR = null, prochainR = 0, frappeA = -Infinity;
  let basculeEnCours = false;
  function forcerHauteResolution(m) {
    if (relacherR !== null && m.us >= relacherR) { m.toucheRelachee(0x13); relacherR = null; }
    const armee = hauteResolutionForcee && m.dv.getInt16(0xDE5F6, true) === 1
      && m.dv.getInt16(0xD6652, true) === 0 && m.m8[0xD7795] === 9
      && vueDessineeEn320 && m.us - vueDessineeA < 2e5;
    if (!armee) armeeDepuis = null;
    else if (armeeDepuis === null) armeeDepuis = m.us;
    basculeEnCours = (armee && m.us - armeeDepuis < 3e6) || m.us - frappeA < 1.5e5;
    if (!armee || relacherR !== null || m.us < prochainR) return;
    m.toucheAppuyee(0x13, 0x72);              // R
    frappeA = m.us;
    relacherR = m.us + 1e5;
    prochainR = m.us + 2e6;                   // R perdu (lu par une boucle à elle) : réessayer dans 2 s
  }

  // La part du temps réel où le jeu calcule (le reste, il attend le temps réel) : mesurée chaque
  // seconde, pour la page (entete[Z.CALCUL]) et le diagnostic. Dans le fil de la page, l'attente est
  // le temps passé hors des tranches du moteur (la page y dessine aussi).
  let prochainEtat = 0, evenements = 0, attente = 0, attenteMesuree = 0, reelMesure = 0;
  // (fil de la page) le début de la tranche en cours, pour le budget ; une image a été présentée depuis
  // la dernière pause
  let debutTranche = 0, imagePresentee = false;
  machine.observateurs.push((m) => {
    const reel = performance.now() - t0;
    if (reel >= prochainEtat) {
      prochainEtat = reel + 1000;
      const calcul = reelMesure ? 1 - (attente - attenteMesuree) / (reel - reelMesure) : 0;
      attenteMesuree = attente; reelMesure = reel;
      entete[Z.CALCUL] = Math.round(1000 * calcul);
      // le curseur du jeu : sa position dans l'espace logique, que le jeu garde en 0xBECAC et 0xBECAE
      const curseur = `${m.dv.getInt16(0xBECAC, true)},${m.dv.getInt16(0xBECAE, true)}`;
      const camera = `${m.dv.getInt16(0xD667A, true)},${m.dv.getInt16(0xD6666, true)}`;
      // (la vitesse du jeu, que F3 et F4 changent, et les touches en attente dans le tampon du BIOS : de
      // quoi lire un jeu qui rame, retour 80)
      const vitesse = m.dv.getInt16(0xD6634, true);
      envoyer({ diag: `virtuel ${(m.us / 1e6).toFixed(1)} s, reel ${(reel / 1000).toFixed(1)} s, calcul ${Math.round(100 * calcul)} %, vitesse ${vitesse}, touches ${m.toucheBios.length}, entrees ${evenements}, souris ${m.compteurs.get('souris') || 0}, curseur ${curseur}, caméra ${camera}` });
    }
    if (AF.load(file, 1) !== AF.load(file, 0)) evenements++;
    lireEntrees(m);
    fichiers.viderSiCalme();         // les fichiers écrits, envoyés une fois (fichiers-paquet.js)
    forcerHauteResolution(m);
    if (debogage.onglet) debogage.tic(m, reel, envoyer);   // fenêtre fermée : ce test seul
    if (m.us >= prochaineImage) {
      prochaineImage = m.us + periodeImage;
      presenter(m);
      entreDeuxAFaire = true;
      imagePresentee = true;
    }
    // caler le temps virtuel sur le temps reel. Un retard de plus de RETARD_MAX ms (le jeu n'a pas
    // pu suivre : machine chargée) est oublié plutôt que rattrapé : rattrapé, il faisait tourner le
    // jeu à toute vitesse ensuite, le temps de combler le retard.
    let avance = avanceSurLeReel(m);
    if (avance < -RETARD_MAX) { retardOublie += -avance - RETARD_MAX; avance = -RETARD_MAX; }
    // Dans le fil de la page : rendre la main au pilote, qui attend l'avance, rend la main au navigateur
    // si la tranche a assez duré, ou pour qu'il montre l'image qui vient d'être présentée (plus bas).
    // (Au milieu d'une image, c'est la garde du temps réel qui la demande.)
    if (enPage) {
      if (avance > 2 || imagePresentee || performance.now() - debutTranche > BUDGET) m.pauseDemandee = DEMANDE;
      return;
    }
    if (avance > 2) {
      const t = performance.now();
      // À 60 images par seconde. Le jeu en présente 30 : son temps virtuel saute d'une image à la
      // suivante, puis le travailleur attend que le temps réel le rattrape. Les animations
      // intercalées allumées, au milieu de cette attente, l'image est présentée une fois de plus,
      // l'écran du jeu inchangé et les intermédiaires posés un demi-pas plus loin (presenter,
      // `decalage`) : l'attraction avance deux fois par image du jeu. La partie n'en voit rien.
      if (entreDeuxAFaire && reglages.animationsIntercalees && avance > 12) {
        entreDeuxAFaire = false;
        dormir(Math.min(avance / 2, 25));
        presenter(m, Math.round((performance.now() - t) * 1000));
        avance = avanceSurLeReel(m);
      }
      if (avance > 0) dormir(Math.min(avance, 50));
      attente += performance.now() - t;
    }
  });

  // Le pilote de la page : conduire le moteur réentrant par tranches, une à chaque image de l'écran
  // (requestAnimationFrame). Chaque tranche reprend l'exécution jusqu'à ce que le moteur rende la main
  // (DEMANDE, posée par l'observateur) avec de l'avance sur le temps réel, ou jusqu'à ce qu'elle ait
  // pris BUDGET ms (le jeu est en retard : la page doit tout de même dessiner et lire les entrées), ou
  // qu'elle ait présenté une image (la page la montre ; sauf si le jeu a plus d'une image de retard, où
  // il rattrape dans le budget). Le budget tient quoi qu'il arrive, même au milieu d'une image : la
  // garde du temps réel (plus haut) demande la pause à l'échéance, que les observateurs passent ou non
  // (le jeu accéléré par F4 fait des dizaines de pas de simulation par image, sans eux ; retour 80). Une
  // tranche qui trouve le jeu encore en avance ne le fait pas tourner : c'est ainsi qu'est honorée son
  // avance ; les animations intercalées allumées, elle présente l'image entre deux du jeu (comme le
  // travailleur à mi-attente : l'observateur, « À 60 images par seconde »). Calées sur l'écran, les
  // images du jeu sont publiées une par image montrée (réveillé par setTimeout, le moteur en publiait
  // parfois deux entre deux images de l'écran, et la page en perdait une). Quand l'écran ne rafraîchit
  // pas la page (onglet caché, panneau masqué du navigateur intégré : requestAnimationFrame ne vient
  // plus), un minuteur prend le relais. L'image est dessinée par la page (principal.js,
  // requestAnimationFrame), les entrées lues par l'observateur. `finir(erreur)` : le programme a fini
  // (erreur null) ou s'est arrêté.
  function piloterDansLaPage(execution, finir) {
    const avecRaf = typeof requestAnimationFrame === 'function';
    let fini = false, finPrecedente = 0, enAvanceDepuis = 0, avanceAuDepart = 0;
    // la tranche suivante : à la prochaine image de l'écran, ou par le minuteur, au plus tard dans
    // `ms` ms (et pas avant 50 ms si l'écran rafraîchit la page)
    const suivante = (ms) => {
      let faite = false, raf = 0;
      const lancer = () => {
        if (faite) return;
        faite = true;
        if (raf) cancelAnimationFrame(raf);
        clearTimeout(minuteur);
        tranche();
      };
      if (avecRaf) raf = requestAnimationFrame(lancer);
      const minuteur = setTimeout(lancer, avecRaf ? Math.max(ms, 50) : Math.max(0, ms));
    };
    function tranche() {
      if (fini) return;
      const debut = performance.now();
      if (finPrecedente) attente += debut - finPrecedente;
      const reste = avanceSurLeReel(machine);
      if (reste > 2) {
        // encore en avance : l'image entre deux du jeu, une fois
        if (entreDeuxAFaire && reglages.animationsIntercalees && avanceAuDepart > 12) {
          entreDeuxAFaire = false;
          presenter(machine, Math.round((debut - enAvanceDepuis) * 1000));
        }
        finPrecedente = performance.now();
        suivante(reste);
        return;
      }
      debutTranche = debut;
      // (l'échéance de la garde du temps réel : au-delà, le moteur rend la main où qu'il en soit)
      garde.echeance = debut + BUDGET;
      for (;;) {
        let e;
        imagePresentee = false;
        try {
          e = execution.next(PILOTE);
        } catch (err) {
          fini = true;
          finir(err);
          return;
        }
        if (e.done) { fini = true; finir(null); return; }
        finPrecedente = performance.now();
        if (e.value !== DEMANDE) { suivante(e.value && e.value.pause || 0); return; }   // (le film)
        const avance = avanceSurLeReel(machine);
        if (avance > 2) {
          enAvanceDepuis = finPrecedente;
          avanceAuDepart = avance;
          suivante(avance);
          return;
        }
        if (finPrecedente - debutTranche > BUDGET) { suivante(0); return; }
        // Une image vient d'être présentée : la page la montre avant que le moteur ne calcule la
        // suivante, sauf si le jeu a plus d'une image de retard (il rattrape, dans le budget).
        if (imagePresentee && avance > -PERIODE_DU_JEU) { suivante(0); return; }
      }
    }
    tranche();
  }

  // La fin du programme (le code de sortie du service 4Ch, ou null) : les fichiers écrits rangés, la
  // dernière image, et la page prévenue.
  function conclure(err) {
    let code = null;
    if (err === null) journal('le programme a rendu la main');
    else if (err instanceof Sortie) { code = err.code; journal('fin du jeu (code ' + err.code + ')'); }
    else if (err instanceof Arret) journal('arret : ' + err.message);
    else { journal('ERREUR : ' + (err.stack || err)); console.error(err); }
    fichiers.vider();
    presenter(machine);
    envoyer({ fin: { code } });
  }

  const reprendreLHorloge = () => {
    t0 = performance.now();
    retardOublie = 0;
    prochaineImage = 0;
  };

  // L'introduction, d'abord : le film mp4, si les assets l'ont ; sinon INTRO.EXE, que le lanceur de
  // 1994 (THEME.BAT) exécutait avant le jeu (moteur/hote/assets-du-jeu.js). Une machine à elle, dans la
  // disposition mémoire de MAIN.EXE (moteur/hote/image-intro.js), avec le code lisible du jeu et le
  // sien (moteur/jeu/intro.js), lancée comme THEME.BAT la lançait : depuis le dossier du CD, avec
  // « -C:/THEME.CD ». Elle joue son film (3 minutes) ; une touche l'arrête. Puis le jeu, sur une
  // horloge remise à zéro. Dans le fil de la page, INTRO.EXE ne tourne pas (le moteur réentrant ne
  // transforme que le jeu) : sans film mp4, on passe directement au jeu.
  if (films.introduction) {
    envoyer({ introduction: true });
    if (enPage) {
      demanderLeFilm(films.introduction, false);
      await new Promise((fin) => { const voir = () => (A.load(entete, Z.FILM) ? fin() : setTimeout(voir, 50)); voir(); });
    } else attendreLaPage(films.introduction);
    envoyer({ introduction: false });
    reprendreLHorloge();
  } else if (paquet.introduction && !enPage) {
    const intro = new Machine({
      image: lireLImage(paquet.introduction), T: creerProcesseur(), journal, ligneCommande: '-C:/THEME.CD',
      fichiers: new FichiersDuPaquet(paquet, [], () => {}, 'D:/GAME/'), son: son ? {} : null,
      adresses: { ...ADRESSES_DE_MAIN, image: 0 },
      programme: (m, t) => journal(`introduction : ${poserLIntroduction(m, t)} fonctions lisibles`),
    });
    if (intro.son) intro.son.evenements(envoyerLesSons);
    // L'image : le film est en 320x200 (mode 13h), la fenêtre vidéo telle quelle ; rien de ce que la
    // page compose pour le parc (défilement, zoom, animations intercalées).
    const presenterLIntroduction = (m) => {
      const l = 320, h = 200;
      pixels.set(m.m8.subarray(0xA0000, 0xA0000 + l * h));
      palette.set(m.video.palette);
      entete[1] = l; entete[2] = h;
      entete[9] = 0; entete[16] = 0; entete[Z.FRAIS] = 0; entete[Z.ANIM_PIXELS] = 0;
      A.add(entete, 0, 1);
    };
    let prochainDiag = 0;
    intro.observateurs.push((m) => {
      lireEntrees(m, true);
      if (m.us >= prochaineImage) { prochaineImage = m.us + periodeImage; presenterLIntroduction(m); }
      const reel = performance.now() - t0;
      if (reel >= prochainDiag) {
        prochainDiag = reel + 1000;
        envoyer({ diag: `introduction : virtuel ${(m.us / 1e6).toFixed(1)} s, réel ${(reel / 1000).toFixed(1)} s (une touche la passe)` });
      }
      let avance = avanceSurLeReel(m);
      if (avance < -RETARD_MAX) { retardOublie += -avance - RETARD_MAX; avance = -RETARD_MAX; }
      if (avance > 2) dormir(Math.min(avance, 50));
    });
    envoyer({ introduction: true });           // (la page : un clic la passe, principal.js)
    try {
      intro.demarrer();
    } catch (err) {
      if (err instanceof Sortie) journal("fin de l'introduction");
      else journal("l'introduction s'est arrêtée : " + (err.message || err));
    }
    envoyer({ introduction: false });
    reprendreLHorloge();
  }

  if (enPage) {
    let execution;
    try {
      execution = machine.demarrer();
    } catch (err) {
      conclure(err);
      return;
    }
    if (!estIterateur(execution)) { conclure(null); return; }
    piloterDansLaPage(execution, conclure);
    return;
  }
  try {
    machine.demarrer();
    conclure(null);
  } catch (err) {
    conclure(err);
  }
}
