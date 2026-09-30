// La page : affiche l'image produite par le jeu et lui transmet la souris et le clavier. Elle joue
// aussi son son : les fichiers que le jeu demande (audio.js).
//
// Le jeu (moteur-du-jeu.js) tourne dans un Web Worker (travailleur.js), avec qui la page partage sa
// mémoire (SharedArrayBuffer) ; ou dans le fil de la page même, par tranches (le fichier unique ouvert
// en file://, local.html), la même disposition dans une mémoire ordinaire. Tout ce qui dépend de
// l'endroit d'où vient la page (la façon, l'adresse des assets, des films, du processeur audio) est dans
// environnement.js, que la distribution remplace par environnement-distribution.js. Les accès à la
// mémoire partagée passent par `A` : Atomics, ou de simples accès (memoire-partagee.js, `atomiques`).
//
// `?force=2d,elements` (dans l'adresse de la page) : les replis, pris même quand le navigateur a mieux
// (l'affichage en 2D sans WebGL2 ; les bruitages par éléments <audio>, comme en double-clic, au lieu
// de Web Audio : audio.js), pour les éprouver.

import * as environnement from './environnement.js';
import { lecteurDuSon, adresseDesSons } from './audio.js';
import { nouvelAffichage, RENDUS, NOMS_DES_RENDUS } from './affichage.js';
import { DefilementFluide } from './defilement-fluide.js';
import { Glisser } from './glisser.js';
import { TAILLE_ECRAN, IMAGE_MAX, vuesDeLEcran, Z, atomiques } from './memoire-partagee.js';
import { Zoom, Molette, bornesDuNiveau, tailleDuNiveau, MARGE as MARGE_DU_ZOOM } from './zoom.js';
import { installerDebogage } from './debogage.js';
import { Retouches } from './retouches.js';
import { ranger, exporterLesParties, importerLesParties } from './donnees.js';
import { jouerLeFilm, filmEnCours, toucherLeFilm } from './films.js';
import { LANGUES_DU_CD, languesDeLaPage } from '../hote/langues.js';
import { RenduHD } from './rendu-hd.js';

// 'travailleur' (le moteur dans un Web Worker) ou 'page' (dans ce fil) : environnement.js.
const fil = environnement.fil;
const forces = new Set((new URLSearchParams(location.search).get('force') || '').split(',').filter(Boolean));

const canvas = document.getElementById('ecran');
const affichage = nouvelAffichage(canvas, forces.has('2d'));
globalThis.affichageDeLaPage = affichage;    // (pour les essais : lu depuis la console)
// La ligne d'état (le journal du jeu, les comptes rendus de la page) est dans l'onglet « Réglages »
// de la fenêtre de débogage ; le bandeau du haut n'en montre que ce que le joueur doit voir (#etat :
// une erreur, la fin du programme), pour garder l'écran net.
const etat = document.getElementById('journal-de-la-page');
const avis = document.getElementById('etat');
const avertir = (texte) => { etat.textContent = texte; avis.textContent = texte; };
const cadence = document.getElementById('cadence');

// Les réglages de la page sont allumés par défaut, sans que le joueur ait rien à faire ; un choix fait
// dans l'onglet « Réglages » du débogage est gardé sous themepark.reglages.<nom> (oui, non). Les clés
// d'avant (themepark.son, .640x480, .defilement, .fluide, .grandevue, .corrections, .capture,
// .animations.x2) ne sont plus lues : écrites quand les défauts étaient autres (la grande vue et les
// corrections éteintes), elles les ramèneraient.
function reglageGarde(nom, parDefaut = true) {
  try {
    const v = localStorage.getItem(`themepark.reglages.${nom}`);
    return v === null ? parDefaut : v === 'oui';
  } catch (e) { return parDefaut; }            // (stockage indisponible)
}
function garderLeReglage(nom, valeur) {
  try { localStorage.setItem(`themepark.reglages.${nom}`, valeur ? 'oui' : 'non'); } catch (e) { /* stockage indisponible */ }
}

if (fil === 'travailleur' && !window.crossOriginIsolated) {
  avertir('la page doit etre servie par moteur/node/serveur.mjs (isolation d\'origine requise)');
  throw new Error('crossOriginIsolated');
}

// L'en-tête, la palette, l'image affichée ; puis, pour le défilement fluide et le zoom, la dernière
// image du parc publiée par le jeu, sa vue seule, les régions de l'interface et le curseur (voir
// travailleur.js, memoire-partagee.js). Chaque image peut aller jusqu'à la taille maximale de la
// grande vue (moteur/jeu/grande-vue.js).
// (dans le fil de la page, des mémoires ordinaires)
const Memoire = fil === 'travailleur' ? SharedArrayBuffer : ArrayBuffer;
const ecran = new Memoire(TAILLE_ECRAN);
const vues = vuesDeLEcran(ecran);
const { entete, palette, pixels, imageFluide, vueDuParc } = vues;
const A = atomiques(ecran);
const entrees = new Memoire(4 * (4 + 4 * 256));
const file = new Int32Array(entrees);

const travailleur = fil === 'travailleur' ? environnement.creerTravailleur() : null;
let introductionEnCours = false;
// Les messages du jeu : du travailleur, ou, dans le fil de la page, de moteur-du-jeu.js directement.
function recevoir(message) {
  const e = { data: message };
  if (e.data.journal) {
    etat.textContent = e.data.journal; console.log(e.data.journal);
    if (/^ERREUR/.test(e.data.journal)) avis.textContent = e.data.journal;
  }
  // un fichier écrit par le jeu (une partie, la fin d'année) ou effacé : rangé dans le navigateur
  // (donnees.js)
  if (e.data.fichier) {
    const { chemin, octets } = e.data.fichier;
    ranger(chemin, octets).catch((err) => { etat.textContent = `${chemin} : non rangé (${err.message})`; });
  }
  if (e.data.diag) { etat.textContent = e.data.diag; }
  // l'introduction (INTRO.EXE) joue son film : un clic la passe, sans capturer la souris
  if (e.data.introduction !== undefined) introductionEnCours = e.data.introduction;
  // un film en mp4 (films.js) : la page le joue sur l'image du jeu, le jeu attend sa fin (entete[Z.FILM])
  if (e.data.film) {
    son.volume(0);
    jouerLeFilm(e.data.film, { url: environnement.urlDuFilm, canvas, rectangle: () => affichage.rectangleImage(), muet: sonCoupe, surGeste: () => activerSon(), surFin: () => {
      son.volume(sonCoupe ? 0 : 1);
      A.store(entete, Z.FILM, 1);
      A.notify(entete, Z.FILM);
    } });
  }
  if (e.data.debogage !== undefined) debogage.recevoir(e.data.debogage);
  // le rendu HD : la liste d'affichage de chaque image (liste-affichage.js, rendu-hd.js)
  if (e.data.listeHD) renduHD.recevoir(e.data.listeHD);
  // le son : ce que le jeu demande, avec le fichier à jouer (audio.js)
  if (e.data.son) son.recevoir(e.data.son);
  // La fin du programme. Le menu titre quitte le jeu par F4 (« revoir l'introduction »), avec le
  // code 10, sur lequel le lanceur d'origine (THEME.BAT) relançait l'introduction puis le jeu : la
  // page se relance de même. F6 (« retour au DOS ») rend 0 : la page attend un clic pour relancer.
  // Les fichiers écrits ont été rangés avant (message `fichier`).
  if (e.data.fin) {
    if (e.data.fin.code === 10) { setTimeout(() => location.reload(), 200); return; }
    avertir("Theme Park est terminé : un clic sur l'image le relance");
    canvas.addEventListener('click', () => location.reload(), { once: true });
  }
}
if (travailleur) travailleur.onmessage = (e) => recevoir(e.data);
// La langue du jeu : le jeu ne la choisit qu'au lancement (option -l et le chiffre de son emplacement,
// le n de LANGn-0.DAT), d'où un rechargement de la page quand on en change. Le choix est gardé. Les
// langues et leurs noms viennent du manifeste des textes (textes/index.json des assets :
// moteur/hote/langues.js), lu avant le lancement ; jusque-là, celles du CD.
let LANGUES = LANGUES_DU_CD.map((l) => [String(l.emplacement), l.nom]);
let langue = '4';
function poserLesLangues(liste) {
  if (liste && liste.length) LANGUES = liste;
  let gardee = null;
  try { gardee = localStorage.getItem('themepark.langue'); } catch (e) { /* stockage indisponible */ }
  langue = LANGUES.some(([c]) => c === gardee) ? gardee : LANGUES[0][0];
  boutonLangue.textContent = `langue : ${LANGUES.find(([c]) => c === langue)[1]}`;
}
// Les sons remplacés (le manifeste sons/index.json : fichiers-des-sons.js), pris ou non au lancement.
const remplacementsVoulus = reglageGarde('remplacements');
environnement.preparerLesDonnees(etat).then(async (d) => {
  // (les langues du manifeste des textes, avant de dire la sienne au jeu)
  await languesDeLaPage(d.paquet).then(poserLesLangues, (err) => console.warn(`langues : ${err.message}`));
  // (les fichiers des sons, là où sont les assets : audio.js)
  adresseDUnSon = adresseDesSons(d.paquet, environnement.urlDUnSon);
  // (le pack HD, là où sont les assets : rendu-hd.js)
  paquetDesDonnees = d.paquet;
  if (niveauHD) allumerLeRenduHD();
  const lancement = { ecran, entrees, son: true, remplacements: remplacementsVoulus,
    ligneCommande: `-cD:/game/ -dC:/THEME.CD/ -l${langue}`, racine: String(environnement.racine),
    donnees: { paquet: d.paquet, sauvegardes: d.sauvegardes } };
  if (travailleur) {
    travailleur.postMessage(lancement, d.sauvegardes.map(([, octets]) => octets.buffer));
    return null;
  }
  // Dans le fil de la page : le moteur réentrant, conduit par tranches (moteur-du-jeu.js). Une erreur
  // dans ce que la page fait d'un message ne doit pas arrêter le jeu.
  return environnement.chargerLeMoteur().then((moteur) => moteur.lancerLeJeu(lancement, {
    fil: 'page',
    envoyer: (message) => { try { recevoir(message); } catch (err) { console.error(err); } },
    lireLesAnimations: environnement.lireLesAnimations,
  }));
}).catch((err) => { avertir(`ERREUR : ${err.message}`); console.error(err); });
const boutonLangue = document.getElementById('langue');
poserLesLangues(null);
boutonLangue.addEventListener('click', (e) => {
  const k = LANGUES.findIndex(([c]) => c === langue);
  const suivante = LANGUES[(k + 1) % LANGUES.length];
  try { localStorage.setItem('themepark.langue', suivante[0]); } catch (err) { /* idem */ }
  boutonLangue.textContent = `langue : ${suivante[1]} (relance…)`;
  e.stopPropagation();
  setTimeout(() => location.reload(), 150);
});
// Le bouton des sons remplacés : comme la langue, un changement relance la page.
const boutonRemplacements = document.getElementById('remplacements');
boutonRemplacements.textContent = `sons remplacés : ${remplacementsVoulus ? 'oui' : 'non'}`;
boutonRemplacements.addEventListener('click', (e) => {
  garderLeReglage('remplacements', !remplacementsVoulus);
  boutonRemplacements.textContent = `sons remplacés : ${remplacementsVoulus ? 'non' : 'oui'} (relance…)`;
  e.stopPropagation();
  setTimeout(() => location.reload(), 150);
});

// --- son : allumé par défaut, il démarre au premier clic ou à la première touche (le navigateur ne
// l'autorise qu'après un geste) ; le bouton de l'onglet « Réglages » le coupe ------------------------
// (les fichiers joués : audio.js ; leur adresse est connue avec les données, plus haut)
let adresseDUnSon = environnement.urlDUnSon;
const son = lecteurDuSon({ adresse: (c) => adresseDUnSon(c), parElements: forces.has('elements') });
globalThis.sonDeLaPage = son;    // (pour les essais : lu depuis la console)
const boutonSon = document.getElementById('son');
// Le choix est gardé d'une visite à l'autre : une page où le son a été coupé se recharge muette.
let sonCoupe = !reglageGarde('son');
if (sonCoupe) { son.volume(0); boutonSon.textContent = 'son : non'; }
// (Le libellé n'est posé que si le son n'a pas été coupé entre-temps : le clic sur le bouton suit
// l'appui qui active le son.) Coupé, le son n'est pas même activé : le bouton seul le rétablit.
const activerSon = () => { if (!sonCoupe) son.activer().then(() => { if (!sonCoupe) boutonSon.textContent = 'son : oui'; }); };
window.addEventListener('pointerdown', activerSon);
window.addEventListener('mousedown', activerSon);      // (Chrome 49 à 54 n'ont pas pointerdown)
window.addEventListener('keydown', activerSon);
boutonSon.addEventListener('click', (e) => {
  sonCoupe = !sonCoupe;
  garderLeReglage('son', !sonCoupe);
  son.volume(sonCoupe ? 0 : 1);
  boutonSon.textContent = sonCoupe ? 'son : non' : 'son : oui';
  if (!sonCoupe) son.activer();
  canvas.focus();
  e.stopPropagation();
});

function envoyer(type, a = 0, b = 0) {
  const k = A.load(file, 0);
  if (k - A.load(file, 1) >= 256) return;         // file pleine : on perd l'evenement
  const base = 4 + 4 * (k % 256);
  file[base] = type; file[base + 1] = a; file[base + 2] = b;
  A.store(file, 0, k + 1);
}

// --- 640x480 d'office : le travailleur appuie sur R à la place du joueur (voir travailleur.js) ---
// Le choix est gardé par le navigateur, d'une visite à l'autre.
const boutonHR = document.getElementById('hr');
let hauteResolution = reglageGarde('640x480');
const afficherHR = () => { boutonHR.textContent = `640x480 : ${hauteResolution ? 'oui' : 'non'}`; };
afficherHR();
envoyer(6, hauteResolution ? 1 : 0);
boutonHR.addEventListener('click', (e) => {
  hauteResolution = !hauteResolution;
  garderLeReglage('640x480', hauteResolution);
  afficherHR();
  envoyer(6, hauteResolution ? 1 : 0);
  canvas.focus();
  e.stopPropagation();
});

// --- défilement adouci : en 640x480, la vue avance au rythme du 320x200 (moteur/jeu/reglages.js) ---
const boutonDefilement = document.getElementById('defilement');
let defilementDoux = reglageGarde('defilement');
const afficherDefilement = () => { boutonDefilement.textContent = `défilement : ${defilementDoux ? 'doux' : "d'origine"}`; };
afficherDefilement();
envoyer(8, defilementDoux ? 1 : 0);
boutonDefilement.addEventListener('click', (e) => {
  defilementDoux = !defilementDoux;
  garderLeReglage('defilement', defilementDoux);
  afficherDefilement();
  envoyer(8, defilementDoux ? 1 : 0);
  canvas.focus();
  e.stopPropagation();
});

// --- défilement fluide : la vue glisse au pixel d'une case à la suivante (moteur/jeu/reglages.js,
// moteur/web/defilement-fluide.js). Le jeu n'en est pas changé : seule l'image montrée l'est. ------
const boutonFluide = document.getElementById('fluide');
let defilementFluide = reglageGarde('fluide');
const afficherFluide = () => { boutonFluide.textContent = `fluide : ${defilementFluide ? 'oui' : 'non'}`; };
afficherFluide();
envoyer(9, defilementFluide ? 1 : 0);
boutonFluide.addEventListener('click', (e) => {
  defilementFluide = !defilementFluide;
  garderLeReglage('fluide', defilementFluide);
  afficherFluide();
  envoyer(9, defilementFluide ? 1 : 0);
  canvas.focus();
  e.stopPropagation();
});

// --- grande vue : dans le parc en 640x480, une image plus grande, au format de la zone d'affichage,
// qui montre plus de cases (moteur/jeu/grande-vue.js). Un écart assumé : allumée, la partie peut
// différer de l'original. Le parc est montré à un NIVEAU de zoom continu, l'interface à l'échelle de
// la grande vue de base (720 lignes) : la page recompose l'image (zoom.js). La molette, dans la vue du
// parc, déplace le niveau visé ; le niveau montré le rejoint en douceur, et la taille de l'image du jeu
// suit de loin : la plus petite qui couvre le parc montré, avec une marge (de 480 lignes à 1600, 2560
// de large au plus) ; plus près que la plus petite, la page agrandit la seule vue du parc, jusqu'à 4
// fois. Le cadre fixe suit le format de la zone, pas le zoom. Le niveau est gardé. ------------------
const boutonGrandeVue = document.getElementById('grandevue');
// Le zoom (zoom.js) : l'image composée, le parc au niveau du zoom et l'interface à taille fixe.
const zoom = new Zoom();
const molette = new Molette();
let grandeVue = reglageGarde('grandevue');
const HAUTEUR_DE_BASE = 720;         // la grande vue où l'interface a sa taille : le niveau 0
// Le niveau gardé ; à défaut, celui du cran gardé par la molette d'avant (sa hauteur h, ou 480 / m
// pour un cran agrandi m fois : le niveau log2(720 / h)).
try {
  const n = localStorage.getItem('themepark.zoom.niveau'), h = Number(localStorage.getItem('themepark.zoom'));
  const niveau = n !== null ? Number(n) : h > 0 ? Math.log2(HAUTEUR_DE_BASE / h) : 0;
  if (Number.isFinite(niveau)) zoom.niveau = zoom.niveauVise = niveau;
} catch (e) { /* idem */ }
let niveauGarde = zoom.niveau;
const formatDeLaZone = () => {
  const zone = canvas.parentElement.getBoundingClientRect();
  return zone.width >= 1 && zone.height >= 1 ? zone.width / zone.height : 0;
};
// Le cadre fixe de la grande vue, en pixels CSS (comme affichage.js le pose) : le format de la zone.
function cadreDeLaZone() {
  const zone = canvas.parentElement.getBoundingClientRect();
  const rapport = zone.width / zone.height;
  const k = Math.min(zone.width / rapport, zone.height);
  return { largeur: k * rapport, hauteur: k };
}
// Les lignes du panneau du bas, sous la vue du parc (la dernière image publiée ; 44 d'origine).
let basDuJeu = 44;
// Les bornes du niveau pour la zone (zoom.js, bornesDuNiveau) ; le niveau visé et le montré y sont
// ramenés.
function bornerLeNiveau() {
  if (!formatDeLaZone()) return;
  const { largeur: Wf, hauteur: Hf } = cadreDeLaZone();
  const { min, max } = bornesDuNiveau(Wf, Hf, HAUTEUR_DE_BASE, affichage.composePossible);
  zoom.niveauMin = min; zoom.niveauMax = max;
  zoom.niveauVise = Math.max(min, Math.min(max, zoom.niveauVise));
  zoom.niveau = Math.max(min, Math.min(max, zoom.niveau));
}
// La taille du jeu pour le niveau n (zoom.js, tailleDuNiveau) : la plus petite image qui couvre le
// parc montré, avec sa marge, et la hauteur qui fait aller le parc jusqu'au panneau du bas.
function tailleDuJeu(n) {
  const { largeur: Wf, hauteur: Hf } = cadreDeLaZone();
  return tailleDuNiveau(n, Wf, Hf, HAUTEUR_DE_BASE, basDuJeu, affichage.composePossible);
}
// La taille demandée au jeu et pas encore reçue : { largeur, hauteur, t }.
let demandeDeTaille = null;
// La taille du niveau visé, sans ancrage : au lancement, en allumant la grande vue, quand la zone
// change de taille. Le jeu garde sa caméra ; la portion, sa place dans le monde (zoom.js, recevoir).
function envoyerLaTaille() {
  if (!formatDeLaZone()) return;
  bornerLeNiveau();
  const { largeur, hauteur } = tailleDuJeu(zoom.niveauVise);
  if (demandeDeTaille && demandeDeTaille.largeur === largeur && demandeDeTaille.hauteur === hauteur) return;
  envoyer(11, largeur, hauteur);
  demandeDeTaille = { largeur, hauteur, t: performance.now() };
}
// Le bouton : la taille de l'image du jeu et le zoom, en pour cent de l'échelle de l'interface.
const libelleDuZoom = () => `${zoom.W ? `${zoom.W}x${zoom.H}, ` : ''}zoom ${Math.round(100 * (zoom.W ? zoom.p / zoom.u : 2 ** zoom.niveau))} %`;
let zoomAffiche = '';
const afficherGrandeVue = () => {
  zoomAffiche = libelleDuZoom();
  boutonGrandeVue.textContent = `grande vue : ${grandeVue ? `oui (${zoomAffiche})` : 'non'}`;
  // en grande vue, le cadre garde le format de la zone : ni un écran plein en 640x480, ni le zoom ne
  // changent sa taille
  affichage.fixerLeCadre(grandeVue ? formatDeLaZone() || null : null);
};
envoyerLaTaille();
afficherGrandeVue();
envoyer(10, grandeVue ? 1 : 0);
boutonGrandeVue.addEventListener('click', (e) => {
  grandeVue = !grandeVue;
  garderLeReglage('grandevue', grandeVue);
  envoyerLaTaille();
  afficherGrandeVue();
  envoyer(10, grandeVue ? 1 : 0);
  canvas.focus();
  e.stopPropagation();
});
let attenteTaille = null;
function tailleAChange() {
  clearTimeout(attenteTaille);
  attenteTaille = setTimeout(() => { envoyerLaTaille(); afficherGrandeVue(); }, 300);
}
// La molette : seulement quand le jeu montre la vue du parc en grande vue (entete[16]) ; ailleurs,
// elle ne fait rien. Vers soi, on s'éloigne (plus de cases) ; vers l'avant, on s'approche. Chaque
// événement déplace le niveau visé (zoom.js, `Molette` : un cran, un quart d'octave, davantage quand
// la molette tourne vite ; le pincement d'un pavé tactile, à son échelle). Le niveau montré le rejoint
// en douceur, le point du parc sous le pointeur gardé (dessiner, `zoom.avancer`), et la taille de
// l'image du jeu suit (`suivreLeNiveau`).
let derniereMolette = -Infinity;
canvas.addEventListener('wheel', (e) => {
  if (!grandeVue || !entete[16]) return;
  e.preventDefault();
  if (glisseDuMilieu) return;            // (la molette qu'on enfonce pour glisser tourne parfois d'un cran)
  const maintenant = performance.now();
  const d = molette.pas(e, maintenant);
  if (!d) return;
  derniereMolette = maintenant;
  bornerLeNiveau();
  zoom.viser(d);
  if (composeeEtat.active) {
    if (!capturee()) pointeurDuCadre(e);
    suivreLeNiveau(maintenant);          // (un zoom arrière : l'image plus grande, demandée aussitôt)
    return;
  }
  // Sans image composée (pas de WebGL2) : l'image du jeu, montrée entière, prend d'un coup la taille
  // du niveau, autour du curseur, que le jeu garde à la même fraction de l'image (grande-vue.js).
  zoom.niveau = zoom.niveauVise;
  const { largeur, hauteur } = tailleDuJeu(zoom.niveau);
  if (largeur !== entete[1] || hauteur !== entete[2]) {
    if (!capturee()) {
      const r = affichage.rectangleImage();
      envoyer(1, Math.round((e.clientX - r.left) * 65536 / r.width), Math.round((e.clientY - r.top) * 65536 / r.height));
    }
    envoyer(16, largeur, hauteur);
  }
  afficherGrandeVue();
}, { passive: false });

// La taille de l'image du jeu suit le niveau (zoom.js, « La taille du jeu ») : plus grande dès que le
// niveau visé sort de ce qu'elle couvre (pour lui, et AVANCE octave plus loin : le cran suivant est
// déjà couvert) ; plus petite quand le zoom est posé depuis POSE ms et qu'elle a EN_TROP pixels de
// large de plus qu'il ne faut. Une demande à la fois, oubliée après ATTENTE_MAX ms (le jeu a quitté
// la vue du parc). Rien pendant un tracé ou un glisser ; pour rapetisser, ni pendant un défilement, ni
// avec un catalogue ouvert (accroché au bas du cadre par la barre d'outils, il bougerait). Pas plus
// grande quand le jeu peine déjà à tenir le temps réel : chaque taille dessine plus de cases
// (travailleur.js mesure la part du temps où il calcule, entete[Z.CALCUL], en millièmes).
const AVANCE = 0.3, EN_TROP = 96, POSE = 700, ATTENTE_MAX = 1500, CALCUL_MAX = 750;
function suivreLeNiveau(maintenant) {
  const d = demandeDeTaille;
  if (d && ((zoom.W === d.largeur && zoom.H === d.hauteur) || maintenant - d.t > ATTENTE_MAX)) demandeDeTaille = null;
  zoom.attente = !!demandeDeTaille && demandeDeTaille.largeur > zoom.W;
  if (demandeDeTaille || boutons || glisseDuMilieu || glisser.actif || !zoom.W) return;
  if (tailleDuJeu(zoom.niveauVise).largeur > zoom.W) {
    if (entete[Z.CALCUL] > CALCUL_MAX) {
      etat.textContent = `zoom arrière arrêté : le jeu calcule déjà ${Math.round(entete[Z.CALCUL] / 10)} % du temps`;
      zoom.niveauVise = Math.max(zoom.niveauVise, Math.log2(zoom.Wf / (zoom.u * Math.max(32, zoom.W - MARGE_DU_ZOOM))));
      return;
    }
    demanderUneTaille(tailleDuJeu(zoom.niveauVise - AVANCE), zoom.niveauVise, maintenant);
    zoom.attente = true;
    return;
  }
  const pose = zoom.niveau === zoom.niveauVise && maintenant - derniereMolette > POSE && !fluide.glisse
    && maintenant - Math.max(cameraBougee[0], cameraBougee[1]) > POSE && !zoom.fenetreOuverte;
  const juste = tailleDuJeu(zoom.niveau);
  if (pose && juste.largeur + EN_TROP <= zoom.W) demanderUneTaille(juste, zoom.niveau, maintenant);
}
// Une taille demandée au jeu, ancrée : la place de la nouvelle vue (message 22 : zoom.js,
// decalagePour, autour de la portion du niveau n), puis la taille (message 16). Le jeu garde le
// curseur sur son pixel du monde (grande-vue.js, preparerLAncrage), que le pointeur de la page
// montre ; sur l'interface, la page dit où il sera (message 19 : le même pixel de la même région, qui
// suit son bord). Le curseur que le jeu pose alors n'est pas un déplacement à suivre (zoomEnvoyeA).
function demanderUneTaille({ largeur, hauteur }, n, maintenant) {
  if (largeur === zoom.W && hauteur === zoom.H) return;
  const [x, y, k] = zoom.versLeJeu(pointeur.x, pointeur.y);
  if (k >= 0) envoyer(19, ...zoom.pointDeLInterfaceApres(k, x, y, largeur, hauteur));
  envoyer(22, ...zoom.decalagePour(n, ancreDuZoom(), largeur, hauteur, basDuJeu));
  envoyer(16, largeur, hauteur);
  demandeDeTaille = { largeur, hauteur, t: maintenant };
  zoomEnvoyeA = maintenant;
}
// L'ancre du zoom : le pointeur, s'il est sur le parc ; sinon le milieu du parc.
function ancreDuZoom() {
  const [, , k] = zoom.versLeJeu(pointeur.x, pointeur.y);
  return k < 0 && (capturee() || !dehors) ? [pointeur.x, pointeur.y] : [zoom.Wf / 2, zoom.hauteurDuParc() / 2];
}

// --- corrections : des défauts du jeu de 1994, le personnel formé qui tourne en rond, les passagers
// éjectés trop tôt, les visiteurs qui ne trouvent pas la sortie, les trains qui font des tours en
// trop, les files oubliées et le labyrinthe arrêté hors de vue (moteur/jeu/reglages.js, moteur/jeu/corrections.js,
// vehicules.js, attractions.js). Un écart assumé :
// allumées, la partie diffère de l'original. Allumées par défaut ; le bouton « original bug fix » de
// l'onglet « Réglages » les éteint toutes (le jeu de 1994 tel quel, défauts compris) ; le choix est
// gardé. Son libellé est fixe : l'état est dit par le bouton enfoncé et par la ligne voisine. ------
const boutonCorrections = document.getElementById('corrections');
const etatDesCorrections = document.getElementById('corrections-etat');
let corrections = reglageGarde('corrections');
const afficherCorrections = () => {
  boutonCorrections.setAttribute('aria-pressed', corrections ? 'true' : 'false');
  etatDesCorrections.textContent = corrections ? 'allumé : les défauts de 1994 corrigés' : 'éteint : les défauts de 1994 tels quels';
};
afficherCorrections();
envoyer(15, corrections ? 1 : 0);
boutonCorrections.addEventListener('click', (e) => {
  corrections = !corrections;
  garderLeReglage('corrections', corrections);
  afficherCorrections();
  envoyer(15, corrections ? 1 : 0);
  canvas.focus();
  e.stopPropagation();
});

// --- animations intercalées (moteur/jeu/animations-intercalees.js) : les attractions à tours montrées
// deux fois plus vite, par les dessins du jeu, passagers compris, et derrière ce qui bouge une traînée
// semi-transparente, tirée des images interpolées par RIFE (assets/animations/import/), mêlée après la
// palette. Le jeu n'en est pas changé : seule l'image montrée l'est. Allumé par défaut (la glisse et
// les images de RIFE montrées nettes, essayées d'abord, sont retirées) ; le choix est gardé.
const boutonAnimations = document.getElementById('animations');
const FACONS = ['non', '×2 + traînée'];
let animations = reglageGarde('animations') ? 1 : 0;
const avecTrainee = () => animations === 1;
// (le travailleur dit combien d'attractions ont des images importées, entete[Z.ANIM_IMAGES], 1 + ce
// nombre, une fois chargées ; sans aucune, le bouton le dit)
const afficherAnimations = () => {
  const aucune = animations === 1 && entete[Z.ANIM_IMAGES] === 1;
  boutonAnimations.textContent = `animations : ${FACONS[animations]}${aucune ? ' (aucune image importée)' : ''}`;
};
afficherAnimations();
envoyer(18, animations);
boutonAnimations.addEventListener('click', (e) => {
  animations = (animations + 1) % FACONS.length;
  garderLeReglage('animations', animations > 0);
  afficherAnimations();
  envoyer(18, animations);
  canvas.focus();
  e.stopPropagation();
});

// --- le rendu HD (rendu-hd.js) : l'image recomposée à ×k d'après la liste d'affichage que relève le
// travailleur (liste-affichage.js, message 25), chaque sprite remplacé par sa version du pack HD
// (assets/images/hd/) s'il y en a une. Éteint par défaut ; le choix (non, ×2, ×3, ×4) est gardé. Allumé,
// l'image n'est plus composée par affichage.js (ni zoom composé, ni glisse du défilement fluide : la
// grande vue montre l'image du jeu entière, sa taille suivant la molette), qui continue de tenir le
// cadre et le repère de la souris sous le canevas du rendu. ------------------------------------------
const renduHD = new RenduHD(canvas.parentElement);
globalThis.renduHDDeLaPage = renduHD;       // (pour les essais : lu depuis la console)
renduHD.demanderUnRecalage = () => envoyer(26, 1);
const NIVEAUX_HD = [0, 2, 3, 4];
let niveauHD = 0, paquetDesDonnees = null, packCharge = null;
try { niveauHD = NIVEAUX_HD.includes(Number(localStorage.getItem('themepark.renduhd'))) ? Number(localStorage.getItem('themepark.renduhd')) : 0; } catch (e) { /* idem */ }
const boutonRenduHD = document.createElement('button');
boutonRenduHD.type = 'button';
boutonRenduHD.id = 'rendu-hd';
boutonRenduHD.title = "L'image recomposée à deux, trois ou quatre fois sa taille d'après ce que le jeu dessine, "
  + 'chaque sprite remplacé par son image HD (assets/images/hd/, un pack HD) ou agrandi au plus proche ; '
  + 'le jeu n\'en est pas changé. Allumé : ni zoom composé, ni défilement fluide';
boutonAnimations.parentElement.appendChild(boutonRenduHD);
const afficherRenduHD = () => {
  const n = renduHD.imagesHD.size;
  boutonRenduHD.textContent = !renduHD.possible ? 'rendu HD : impossible (WebGL2)'
    : `rendu HD : ${niveauHD ? `×${niveauHD}${packCharge ? ` (${n} image${n > 1 ? 's' : ''} HD)` : ''}` : 'non'}`
    + (niveauHD && renduHD.recalages ? `, ${renduHD.recalages} recalage${renduHD.recalages > 1 ? 's' : ''}` : '');
};
// (un recalage : le travailleur a trouvé une différence entre la liste et le jeu, et redonné ses pixels)
renduHD.surRecalage = () => afficherRenduHD();
function allumerLeRenduHD() {
  if (!renduHD.possible || !niveauHD) return;
  // le pack d'abord (une fois), puis le relevé : le travailleur redonne alors tous ses tampons
  if (!packCharge) packCharge = renduHD.chargerLePack(paquetDesDonnees).then(() => afficherRenduHD(), (err) => console.warn(err));
  packCharge.then(() => {
    if (!niveauHD) return;
    renduHD.eteindre();
    renduHD.allumer(niveauHD);
    affichage.sansComposition = true;
    envoyer(25, 1);
  });
}
function eteindreLeRenduHD() {
  envoyer(25, 0);
  renduHD.eteindre();
  affichage.sansComposition = false;
}
afficherRenduHD();
boutonRenduHD.addEventListener('click', (e) => {
  if (!renduHD.possible) return;
  niveauHD = NIVEAUX_HD[(NIVEAUX_HD.indexOf(niveauHD) + 1) % NIVEAUX_HD.length];
  try { localStorage.setItem('themepark.renduhd', String(niveauHD)); } catch (err) { /* idem */ }
  if (niveauHD) { if (paquetDesDonnees) allumerLeRenduHD(); } else eteindreLeRenduHD();
  afficherRenduHD();
  canvas.focus();
  e.stopPropagation();
});

// --- la fenêtre de débogage (debogage.js) : le bouton « débogage » du bandeau ou la touche ². Son
// onglet « Réglages » montre les boutons des réglages de la page (#reglages-de-la-page). -----------
const debogage = installerDebogage({ envoyer, canvas });

// --- la souris capturée -------------------------------------------------------------------------
// Au premier clic sur le jeu, la page capture le pointeur (pointer lock) : il ne peut plus sortir de
// l'image, et le jeu ne reçoit plus que des mouvements, comme d'une souris de PC ; bloqué au bord,
// le pointeur fait défiler la vue. Ce premier clic n'agit pas dans le jeu. Échap libère la souris :
// le navigateur l'impose, sauf en plein écran, où le clavier est verrouillé (maintenir Échap).
const boutonCapture = document.getElementById('capture');
const indice = document.getElementById('indice');
let captureVoulue = reglageGarde('capture');
const capturee = () => document.pointerLockElement === canvas;
// Un navigateur peut refuser la capture (un navigateur intégré, par exemple) : la souris reste alors
// libre et les clics vont au jeu, jusqu'à ce que le joueur réessaie par le bouton.
let captureRefusee = false;
function afficherCapture() {
  boutonCapture.textContent = `souris : ${captureVoulue ? 'capturée' : 'libre'}`;
  indice.textContent = !captureVoulue ? ''
    : captureRefusee ? 'capture refusée par le navigateur : souris libre'
    : capturee() ? 'Échap : libérer la souris' : 'clic sur le jeu : capturer la souris';
}
function refuserCapture() { captureRefusee = true; afficherCapture(); }
function capturer() {
  let demande;
  try { demande = canvas.requestPointerLock(); } catch (err) { refuserCapture(); return; }
  if (demande && demande.catch) demande.catch(refuserCapture);    // Chrome : une promesse
}
afficherCapture();
document.addEventListener('pointerlockchange', afficherCapture);
document.addEventListener('pointerlockerror', refuserCapture);
boutonCapture.addEventListener('click', (e) => {
  captureVoulue = !captureVoulue;
  captureRefusee = false;
  garderLeReglage('capture', captureVoulue);
  if (!captureVoulue && capturee()) document.exitPointerLock();
  afficherCapture();
  canvas.focus();
  e.stopPropagation();
});

// --- plein écran : l'image seule, agrandie à tout l'écran ; le clavier y est verrouillé
// pour qu'Échap reste au jeu (maintenir Échap pour sortir), et la souris est capturée -------------
// (Chrome jusqu'à 70 et Firefox jusqu'à 63 n'ont que les formes préfixées ; leur demande ne rend pas
// de promesse, ce que tolère `await`.)
const boutonPleinEcran = document.getElementById('pleinecran');
const elementEnPleinEcran = () => document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || null;
function demanderLePleinEcran(el) {
  if (el.requestFullscreen) return el.requestFullscreen({ navigationUI: 'hide' });
  if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
  if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
  throw new Error('plein écran indisponible');
}
function quitterLePleinEcran() {
  const f = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
  return f ? f.call(document) : undefined;
}
boutonPleinEcran.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (elementEnPleinEcran()) { await quitterLePleinEcran(); return; }
  try {
    await demanderLePleinEcran(canvas.parentElement);
    if (navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock(['Escape']).catch(() => {});
    if (captureVoulue && !captureRefusee) capturer();
  } catch (err) {
    avertir(`plein écran refusé : ${err.message}`);
  }
  canvas.focus();
});
for (const evenement of ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange']) {
  document.addEventListener(evenement, () => {
    boutonPleinEcran.textContent = elementEnPleinEcran() ? 'fenêtre' : 'plein écran';
    affichage.ajuster();
    tailleAChange();
  });
}

// --- les parties : elles ne vivent que dans ce navigateur, pour cette adresse (donnees.js) ;
// exportées dans un fichier, elles se gardent ailleurs, ou se reprennent sur une autre adresse -----
document.getElementById('exporter').addEventListener('click', async (e) => {
  e.stopPropagation();
  try {
    const { texte, nombre } = await exporterLesParties();
    if (!nombre) { etat.textContent = 'parties : aucune dans ce navigateur, rien à exporter'; canvas.focus(); return; }
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
    lien.download = 'sauvegardes-themepark.json';
    document.body.appendChild(lien);          // (d'anciens Firefox ne suivaient pas un lien hors de la page)
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(lien.href), 60000);
    etat.textContent = `parties : ${nombre} fichier(s) exporté(s), dans sauvegardes-themepark.json`;
  } catch (err) {
    etat.textContent = `parties : export impossible (${err.message})`;
  }
  canvas.focus();
});
// L'import range les fichiers dans le navigateur, puis relance la page : le jeu ne lit ses
// sauvegardes qu'au démarrage (travailleur.js).
const fichierDesParties = document.getElementById('fichier-des-parties');
document.getElementById('importer').addEventListener('click', (e) => {
  e.stopPropagation();
  fichierDesParties.click();
});
fichierDesParties.addEventListener('change', async () => {
  const f = fichierDesParties.files[0];
  fichierDesParties.value = '';
  if (!f) return;
  try {
    // (Blob.text : Chrome 76, Firefox 69 ; avant, un FileReader)
    const texte = f.text ? await f.text() : await new Promise((ok, ko) => {
      const l = new FileReader();
      l.onload = () => ok(l.result);
      l.onerror = () => ko(l.error);
      l.readAsText(f);
    });
    const nombre = await importerLesParties(texte);
    etat.textContent = `parties : ${nombre} fichier(s) importé(s) de ${f.name} ; relance…`;
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    etat.textContent = `parties : import impossible (${err.message})`;
  }
});

// --- le rendu de l'image agrandie (moteur/web/affichage.js) ; le choix est gardé -----------------
const boutonRendu = document.getElementById('rendu');
let rendu = 'net';
try { rendu = RENDUS.includes(localStorage.getItem('themepark.rendu')) ? localStorage.getItem('themepark.rendu') : 'net'; } catch (e) { /* idem */ }
const afficherRendu = () => { boutonRendu.textContent = `rendu : ${NOMS_DES_RENDUS[affichage.rendu]}`; };
affichage.choisirRendu(rendu);
afficherRendu();
boutonRendu.addEventListener('click', (e) => {
  rendu = RENDUS[(RENDUS.indexOf(affichage.rendu) + 1) % RENDUS.length];
  affichage.choisirRendu(rendu);
  try { localStorage.setItem('themepark.rendu', rendu); } catch (err) { /* idem */ }
  afficherRendu();
  canvas.focus();
  e.stopPropagation();
});

// --- affichage --------------------------------------------------------------------------------
// Sans glisse en cours, l'image du jeu telle quelle (la mémoire vidéo, où le gestionnaire de souris
// trace aussi le pointeur entre deux images). Pendant une glisse, l'image composée par le
// défilement fluide, à chaque rafraîchissement de l'écran.
const fluide = new DefilementFluide();
// Le glisser au bouton du milieu (glisser.js), et la dernière vue publiée par le jeu, qu'il suit : sa
// place dans le monde, la caméra qui l'a dessinée, la taille des tuiles.
const glisser = new Glisser();
globalThis.glisserDeLaPage = glisser;    // (pour les essais : lu depuis la console)
let repereDuJeu = null;
const copieVue = new Uint8Array(IMAGE_MAX), copieImage = new Uint8Array(IMAGE_MAX), composee = new Uint8Array(IMAGE_MAX);
const copieRegions = new Int32Array(vues.regions.length);
const copieSprite = new Uint8Array(64 * 64), copieDessous = new Uint8Array(64 * 64);
let sequenceLue = 0, composait = false;
// Le zoom (zoom.js) : l'image composée, le parc au niveau du zoom et l'interface à taille fixe.
// `active` : c'est elle qui est montrée ; `neuve` : une image publiée pas encore envoyée à l'affichage ;
// `lueA` : quand la dernière image publiée a été lue ; `avanceA` : quand le niveau a avancé.
globalThis.zoomDeLaPage = zoom;    // (pour les essais : lu depuis la console)
const composeeEtat = { active: false, neuve: false, W: 0, H: 0, lueA: 0, avanceA: 0 };
// Depuis quand la caméra du jeu n'a pas bougé, par axe (le zoom posé, `suivreLeNiveau` ; la portion
// poussée au bord, `pousserAuBord`), et depuis quand le pointeur tient un bord du cadre.
const cameraBougee = [0, 0], bordTenu = [0, 0, 0, 0];
// Le pointeur, en pixels CSS du cadre, quand l'image est composée : la page le tient elle-même (le
// jeu reçoit des positions, transformées par zoom.js). Le curseur, lui, est dessiné là où le jeu a
// le sien (zoom.js, positionDuCurseur).
const pointeur = { x: 0, y: 0 };
let deplacementsVus = 0, zoomEnvoyeA = -Infinity;
let cadragesVus = null;            // le compte des cadrages du jeu sur un objet (vue-fluide.js), déjà vus
// La dernière image du parc publiée, si elle est neuve et entière (verrou de séquence : l'écrivain
// rend entete[3] impair le temps d'écrire). Rend vrai si elle est neuve.
function lireImagePubliee(maintenant, pourLeFluide) {
  const s = A.load(entete, 3);
  if (s === sequenceLue || (s & 1)) return false;
  const l = entete[4], h = entete[5], hv = entete[6], x = entete[7], y = entete[8];
  const tuile = [entete[10], entete[11]], camera = entete[Z.CAMERA];
  const curseurDuJeu = [entete[Z.CURSEUR_X], entete[Z.CURSEUR_Y]];
  copieImage.set(imageFluide.subarray(0, l * h));
  copieVue.set(vueDuParc.subarray(0, l * hv));
  const grande = entete[Z.GRANDE] === 1;
  let n = 0, c = null;
  if (grande) {
    n = entete[Z.REGIONS];
    copieRegions.set(vues.regions.subarray(0, 6 * n));
    const cl = entete[Z.CURSEUR_L], ch = entete[Z.CURSEUR_H];
    copieSprite.set(vues.spriteCurseur.subarray(0, cl * ch));
    const rect = [entete[Z.POSE_X], entete[Z.POSE_Y], entete[Z.POSE_L], entete[Z.POSE_H]];
    const pose = (entete[Z.CURSEUR] & 2) !== 0;
    if (pose) copieDessous.set(vues.dessousCurseur.subarray(0, rect[2] * rect[3]));
    c = { visible: (entete[Z.CURSEUR] & 1) !== 0, x: entete[Z.CURSEUR_X], y: entete[Z.CURSEUR_Y],
      l: cl, h: ch, sprite: copieSprite, pose, rect, dessous: copieDessous };
  }
  const barreX = entete[Z.BARRE_X];
  const cadrages = entete[Z.CADRAGES], cadrageCase = entete[Z.CADRAGE_CASE], cadrageFin = entete[Z.CADRAGE_FIN];
  if (A.load(entete, 3) !== s) return false;    // réécrite pendant la copie : la suivante
  sequenceLue = s;
  repereDuJeu = { x, y, C: (camera << 16) >> 16, R: camera >> 16, L: tuile[0], H: tuile[1], curseur: curseurDuJeu };
  glisser.recevoir(repereDuJeu);
  const image = copieImage.subarray(0, l * h), vue = copieVue.subarray(0, l * hv);
  // En grande vue, le curseur est rendu à l'image (zoom.js) avant tout : le fluide compose alors
  // sans lui, et la page le dessine par-dessus.
  if (grande) {
    // la caméra a bougé ; un saut (plus qu'un pas de défilement : une fiche, la carte) remet la
    // portion au centre, comme la grande vue rallumée
    if (!zoom.grande) zoom.aCentrer = true;
    else if (zoom.W === l && zoom.H === h) {
      if (x !== zoom.x) cameraBougee[0] = maintenant;
      if (y !== zoom.y) cameraBougee[1] = maintenant;
      if (Math.abs(x - zoom.x) > l / 4 || Math.abs(y - zoom.y) > hv / 4) zoom.aCentrer = true;
    }
    zoom.recevoir({ W: l, H: h, hv, barreX, x, y, image, vue, regions: copieRegions, n, curseur: c });
    basDuJeu = h - hv;
    // Le jeu vient d'amener sa vue sur un objet (un employé dont on demande la vue, l'objet d'une liste :
    // vue-fluide.js) : la portion montrée y est amenée, l'objet au milieu du cadre. Sa place dans l'image
    // suit la projection du jeu : la case (c, r) en c·L + r·⌊L/3⌋ − x, r·H − y (plus sa position fine).
    // (Le premier compte lu, au chargement de la page, n'est qu'un repère.)
    if (cadrages !== cadragesVus && cadragesVus !== null) {
      const L = tuile[0], H = tuile[1];
      const cf = (cadrageCase & 0xFFFF) + (cadrageFin & 0xFF) / 256;
      const rf = (cadrageCase >>> 16) + ((cadrageFin >> 8) & 0xFF) / 256;
      zoom.centrerSur(cf * L + rf * Math.trunc(L / 3) - x, rf * H - y);
    }
  }
  cadragesVus = cadrages;
  zoom.grande = grande;
  // Le fluide : l'image composée du zoom a sa mosaïque dans la carte graphique (affichage.js) et n'a
  // besoin que de la position de la glisse ; sinon, toute la logique de defilement-fluide.js.
  const pourLeZoom = grande && composeeEtat.active;
  if (pourLeFluide && pourLeZoom) fluide.suivre({ largeur: l, hauteur: h, x, y, tuile }, maintenant);
  else if (pourLeFluide) fluide.recevoir({ largeur: l, hauteur: h, hauteurVue: hv, x, y, tuile, vue, image }, maintenant);
  return true;
}

// Le point du cadre (pixels CSS) sous l'événement, borné au cadre.
function pointeurDuCadre(e) {
  const r = affichage.rectangleImage();
  pointeur.x = Math.max(0, Math.min(r.width - 1e-3, e.clientX - r.left));
  pointeur.y = Math.max(0, Math.min(r.height - 1e-3, e.clientY - r.top));
}
// Le pointeur de la page, envoyé au jeu : le point du jeu sous lui (zoom.js), en position normalisée.
let pointeurEnvoye = '';
// Un bouton tenu dans l'image composée : ce qui était sous le pointeur à l'appui (zoom.js, saisir).
let tenue = null;
function envoyerLePointeur() {
  const [x, y] = zoom.versLeJeu(pointeur.x, pointeur.y, boutons ? tenue : null);
  pointeurEnvoye = `${x},${y},${zoom.W}`;
  envoyer(1, Math.floor((x + 0.5) * 65536 / zoom.W), Math.floor((y + 0.5) * 65536 / zoom.H));
}
// L'interface a bougé sous le pointeur (une fenêtre qui s'ouvre, se ferme, se déplace) : le point du
// jeu sous lui a changé, le jeu le reçoit.
function suivreLePointeur() {
  const [x, y] = zoom.versLeJeu(pointeur.x, pointeur.y);
  if (`${x},${y},${zoom.W}` !== pointeurEnvoye) envoyerLePointeur();
}
// Le pointeur de la page rejoint le curseur du jeu (en entrant dans l'image composée, et quand le
// jeu déplace lui-même son curseur). Agrandi, le curseur peut être hors de la portion montrée : le
// pointeur reste dans le cadre.
function pointeurSurLeCurseur(x, y) {
  const [fx, fy] = zoom.versLeCadre(x, y);
  pointeur.x = Math.max(0, Math.min(zoom.Wf - 1e-3, fx));
  pointeur.y = Math.max(0, Math.min(zoom.Hf - 1e-3, fy));
  recalerLePointeur();
}
// Le travailleur reçoit ce point comme sa nouvelle référence, sans mouvement (travailleur.js,
// message 20). Il compte les mouvements d'une position envoyée à la suivante : sans ce recalage, le
// premier mouvement après le recalage de la page rejouait l'écart entre l'ancienne position envoyée
// et le curseur que le jeu venait de placer. Pendant un tracé, le jeu replace son curseur à chaque
// image (la projection sur les axes) : l'écart rejoué à chaque image faisait filer la route en biais,
// trop loin, ou à rebours de la main selon le cran (retour 39 de docs/demandes.md).
function recalerLePointeur() {
  const [x, y] = zoom.versLeJeu(pointeur.x, pointeur.y, boutons ? tenue : null);
  pointeurEnvoye = `${x},${y},${zoom.W}`;
  envoyer(20, Math.floor((x + 0.5) * 65536 / zoom.W), Math.floor((y + 0.5) * 65536 / zoom.H));
}
// Zoom avant, le défilement au bord. Le pointeur au bord du cadre, le jeu reçoit le bord de son
// écran (zoom.js) et fait défiler sa caméra ; la portion agrandie la suit. Si la caméra ne bouge
// plus (butée au bord de la carte) depuis ATTENTE_BORD, la page pousse la portion dans la vue du jeu,
// VITESSE_BORD pixels du cadre par seconde.
const ATTENTE_BORD = 500, VITESSE_BORD = 600;
let bordVu = 0;
function pousserAuBord(maintenant) {
  const dt = Math.min(100, maintenant - bordVu);
  bordVu = maintenant;
  if (dehors && !capturee()) return;
  const sens = [pointeur.x < 1 ? -1 : pointeur.x > zoom.Wf - 1 ? 1 : 0,
    pointeur.y < 1 ? -1 : pointeur.y > zoom.Hf - 1 ? 1 : 0];
  // Le pilote de l'hôte ne reçoit que des mouvements (machine.js) : un pointeur immobile au bord
  // ne rattrape pas l'écart qui reste entre le curseur du jeu et le bord de son écran (quelques
  // pixels, après un saut vers le bord), et la vue ne défile pas. Tant que le curseur n'y est pas,
  // la page secoue le pointeur d'un pixel : chaque mouvement rattrape un quart de l'écart.
  const c = zoom.curseur;
  const loin = (sens[0] < 0 && c.x > 1) || (sens[0] > 0 && c.x < zoom.W - 2)
    || (sens[1] < 0 && c.y > 1) || (sens[1] > 0 && c.y < zoom.H - 2);
  if (loin) {
    const [x, y] = zoom.versLeJeu(pointeur.x, pointeur.y);
    envoyer(1, Math.floor((x - sens[0] + 0.5) * 65536 / zoom.W), Math.floor((y - sens[1] + 0.5) * 65536 / zoom.H));
    envoyerLePointeur();
  }
  if (zoom.m === 1) return;
  const d = [0, 0];
  for (let a = 0; a < 2; a++) {
    // bordTenu : [depuis quand, dans quel sens] par axe
    if (sens[a] !== bordTenu[2 + a]) { bordTenu[2 + a] = sens[a]; bordTenu[a] = maintenant; }
    if (sens[a] && maintenant - bordTenu[a] > ATTENTE_BORD && maintenant - cameraBougee[a] > ATTENTE_BORD) {
      d[a] = sens[a] * VITESSE_BORD * dt / 1000;
    }
  }
  if ((d[0] || d[1]) && zoom.pousser(d[0], d[1])) {
    if (boutons) envoyerLePointeur(); else suivreLePointeur();
  }
}
// La mesure du travail de la page par image montrée (ms), pour le compteur.
let travail = 0, travaux = 0;

let derniere = -1, images = 0, t = performance.now();
// Les animations intercalées (retouches.js) : les retouches du travailleur, reposées par la page quand
// elle compose elle-même l'image (glisse du défilement fluide, zoom) ; et le compteur des images
// intermédiaires réellement montrées (« anim N/s »), une par image retouchée neuve.
const retouches = new Retouches(vues);
let animImages = 0, animDerniere = null;
// (par chemin, pour les essais depuis la console : p l'image du travailleur, f la glisse, z le zoom)
const animParChemin = globalThis.animParChemin = { p: 0, f: 0, z: 0 };
function compterAnim(cle) {
  if (cle === animDerniere) return;
  animDerniere = cle;
  animImages++;
  animParChemin[cle[0]]++;
}
function dessiner() {
  const n = A.load(entete, 0);
  const maintenant = performance.now();
  const debut = maintenant;
  let compose = false;
  // (pas de glisse du défilement fluide pendant un tracé, ni pendant le glisser, qui tient la vue)
  fluide.boutonGauche = (boutons & 1) !== 0 || glisseDuMilieu || glisser.actif;
  let retouchesNeuves = animations > 0 && retouches.lire();
  // L'image composée du zoom : en grande vue, quand le jeu publie ses images du parc (à tous les
  // niveaux : l'image du jeu couvre le parc montré avec une marge, elle n'est jamais montrée telle
  // quelle). Tenue pendant un changement de taille : l'image présentée par le travailleur a sa
  // nouvelle taille avant que le parc ait publié la sienne ; la composition garde l'image d'avant
  // (300 ms au plus), au lieu de montrer une image nue d'une autre taille.
  const zoomPossible = grandeVue && entete[Z.FRAIS] === 1 && affichage.composePossible;
  const zoomTenu = composeeEtat.active && grandeVue && entete[16] === 1 && affichage.composePossible
    && maintenant - composeeEtat.lueA < 300;
  const fluideActif = defilementFluide && entete[9] === 1;
  let neuve = false;
  if (fluideActif || zoomPossible || zoomTenu) neuve = lireImagePubliee(maintenant, fluideActif);
  if (neuve) composeeEtat.lueA = maintenant;
  // (les retouches d'une image sont publiées juste avant elle : relues si elle vient d'arriver)
  if (neuve && animations > 0 && retouches.lire()) retouchesNeuves = true;
  if (!fluideActif) fluide.oublier();
  if (zoom.grande && ((zoomPossible && zoom.W === entete[1] && zoom.H === entete[2]) || zoomTenu)) {
    const { largeur: Wf, hauteur: Hf } = cadreDeLaZone();
    bornerLeNiveau();
    zoom.cadrer(Wf, Hf, HAUTEUR_DE_BASE);
    if (!composeeEtat.active) {
      // en entrant : le pointeur de la page part du curseur du jeu
      composeeEtat.active = true;
      composeeEtat.neuve = true;
      composeeEtat.lueA = composeeEtat.avanceA = maintenant;
      pointeurSurLeCurseur(zoom.curseur.x, zoom.curseur.y);
      deplacementsVus = A.load(entete, Z.DEPLACEMENTS);
    }
    // Le niveau montré rejoint le niveau visé, l'ancre tenue (zoom.js, avancer) ; la taille du jeu suit.
    // (Pendant le glisser, ce que le zoom déplace pour garder son ancre est ajouté à la main.)
    const sAvantLeZoom = zoom.s;
    zoom.avancer(maintenant - composeeEtat.avanceA, ancreDuZoom());
    if (glisser.actif) glisser.decaler(zoom.s[0] - sAvantLeZoom[0], zoom.s[1] - sAvantLeZoom[1]);
    composeeEtat.avanceA = maintenant;
    suivreLeNiveau(maintenant);
    if (zoom.niveau === zoom.niveauVise && zoom.niveau !== niveauGarde) {
      niveauGarde = zoom.niveau;
      try { localStorage.setItem('themepark.zoom.niveau', zoom.niveau.toFixed(3)); } catch (err) { /* idem */ }
    }
    if (libelleDuZoom() !== zoomAffiche) afficherGrandeVue();
    // La taille a changé : le jeu a posé son curseur sur son pixel du monde (ou là où la page l'a dit),
    // sous le pointeur ; ce point devient la référence des mouvements suivants, sans mouvement (un
    // mouvement compté depuis la position envoyée dans l'ancienne image déplacerait le curseur).
    if (zoom.W !== composeeEtat.W || zoom.H !== composeeEtat.H) {
      composeeEtat.W = zoom.W; composeeEtat.H = zoom.H;
      recalerLePointeur();
    }
    // Le jeu a déplacé son curseur lui-même (pas l'ancrage d'un changement de taille, que la page fait) :
    // le pointeur de la page le rejoint, souris capturée, où il n'est qu'une position tenue par la page.
    // Souris libre, le pointeur est la main, et il y reste : la page n'y peut rien, et le moindre
    // mouvement le renverrait de toute façon là où est la main, envoyant au jeu comme un mouvement tout
    // l'écart entre la main et le curseur qu'il vient de placer. Pendant un tracé, où le jeu recolle son
    // curseur aux axes de la grille à chaque image, cet écart rejoué image après image faisait partir le
    // curseur dans tous les sens (retour 70 de docs/demandes.md) : le travailleur compte les mouvements
    // d'une position envoyée à la suivante, de la main à la main, comme hors de la grande vue, et le
    // pilote de l'hôte ramène le curseur sous la main quand le jeu cesse de le placer (machine.js).
    const d = A.load(entete, Z.DEPLACEMENTS);
    if (d !== deplacementsVus) {
      deplacementsVus = d;
      if (maintenant - zoomEnvoyeA > 500 && (capturee() || dehors)) {
        const v = entete[Z.DEPLACEMENT];
        pointeurSurLeCurseur((v << 16) >> 16, v >> 16);
      }
    }
    if (neuve) { composeeEtat.neuve = true; if (!boutons) suivreLePointeur(); }
    // la glisse : la vue montrée, décalée de la vue de l'image (le glisser au bouton du milieu, ou le
    // défilement fluide)
    let glisse = [0, 0];
    if (glisser.actif) glisse = placerLaPortionDuGlisser(maintenant);
    else {
      pousserAuBord(maintenant);
      if (fluideActif && fluide.cible && fluide.largeur === zoom.W && fluide.hauteur === zoom.H) {
        const v = fluide.position(maintenant);
        glisse = [v.x - fluide.cible.x, v.y - fluide.cible.y];
      }
    }
    zoom.glisse = glisse;
    // les animations intercalées, dans les copies de l'image et de la vue envoyées à la carte graphique
    if (neuve) retouches.oublierLesCopies();
    if (animations > 0 && (neuve || retouchesNeuves) && retouches.pour(sequenceLue)) {
      const { rects, changes } = retouches.retoucherLesCopies(copieImage, copieVue, zoom.W, zoom.hv);
      if (!composeeEtat.neuve) affichage.retoucherCompose(zoom, copieImage, copieVue, zoom.x, zoom.y, rects);
      if (changes) compterAnim(`z${retouches.lu}`);
    }
    // la traînée de la façon « ×2 », aux coordonnées de l'image publiée
    if (neuve || retouchesNeuves || !avecTrainee()) {
      affichage.poserLesTraineesCompose(avecTrainee() && retouches.pour(sequenceLue) ? retouches.liste : null, zoom.W, zoom.H);
    }
    // (bouton du milieu tenu, le curseur est montré sur le point du parc saisi ; le jeu, qui le reçoit,
    // l'y rejoint une image plus tard : placerLaPortionDuGlisser)
    affichage.afficherCompose(zoom, composeeEtat.neuve, copieImage, copieVue, zoom.x, zoom.y, glisse, palette,
      glisseDuMilieu && glisser.actif && glisser.curseur ? glisser.curseur : zoom.positionDuCurseur());
    composeeEtat.neuve = false;
    composait = false;
    derniere = n;
    images++;
    travail += performance.now() - debut; travaux++;
    afficherLaCadence(maintenant);
    requestAnimationFrame(dessiner);
    return;
  }
  if (composeeEtat.active) { composeeEtat.active = false; composeeEtat.W = composeeEtat.H = 0; derniere = -1; }
  // Le rendu HD : l'image du jeu reste montrée dessous (elle tient le cadre et le repère de la souris,
  // affichage.rectangleImage) ; le rendu la recouvre de la sienne, faite des lots reçus.
  if (renduHD.actif) {
    const l = entete[1], h = entete[2];
    if (n !== derniere && l && h) { derniere = n; affichage.afficher(pixels, palette, l, h); }
    // (pour les essais : l'image du jeu gardée, à comparer à celle du rendu, renduHDDeLaPage.comparer)
    if (renduHD.garderLesImages) renduHD.imageDuJeu = { n, l, h, pixels: pixels.slice(0, l * h), palette: palette.slice() };
    const r = affichage.rectangleImage(), z = canvas.parentElement.getBoundingClientRect();
    if (renduHD.dessiner({ left: r.left - z.left, top: r.top - z.top, width: r.width, height: r.height })) images++;
    travail += performance.now() - debut; travaux++;
    afficherLaCadence(maintenant);
    requestAnimationFrame(dessiner);
    return;
  }
  // (le glisser au bouton du milieu impose la vue montrée ; sans image à composer, il laisse la main)
  const pareil = fluideActif && fluide.largeur === entete[1] && fluide.hauteur === entete[2];
  const imposee = pareil && glisser.actif ? vueDuGlisser(maintenant) : null;
  if (glisser.actif && !pareil && !glisseDuMilieu) glisser.actif = false;
  if (fluideActif) {
    compose = pareil && fluide.composer(composee, maintenant, imposee);
    // les animations intercalées, reposées dans l'image composée, à la position de la glisse
    if (compose && animations > 0 && fluide.cible && retouches.pour(sequenceLue)) {
      if (retouches.poser(composee, fluide.largeur, fluide.hauteurVue, fluide.cible.x - fluide.px, fluide.cible.y - fluide.py)) {
        compterAnim(`f${retouches.lu}`);
      }
    }
    // en grande vue, le fluide compose sans le curseur (zoom.js) : il est remis à sa place
    if (compose && zoom.grande) poserLeCurseur(composee, fluide.largeur, fluide.hauteur);
  }
  // Pendant une glisse du défilement fluide, l'image indexée qu'il compose ; sinon, celle du jeu. (La
  // traînée de la façon « ×2 » : à la position de la glisse ; ou celle de l'image présentée, à défaut la
  // dernière lue, d'une image voisine, plutôt que rien pendant une image.)
  if (compose) {
    const cible = fluide.cible;
    affichage.poserLesTrainees(avecTrainee() && cible && retouches.pour(sequenceLue) ? retouches.liste : null,
      fluide.largeur, fluide.hauteur, cible ? cible.x - fluide.px : 0, cible ? cible.y - fluide.py : 0, fluide.hauteurVue);
    affichage.afficher(composee, palette, fluide.largeur, fluide.hauteur);
    images++;
  } else if (n !== derniere || composait) {
    derniere = n;
    const l = entete[1], h = entete[2];
    if (l && h) {
      if (avecTrainee()) retouches.lire();
      affichage.poserLesTrainees(avecTrainee() ? retouches.dePresentee(n) || retouches.derniere() : null, l, h);
      affichage.afficher(pixels, palette, l, h);
      images++;
      if (animations > 0 && entete[Z.ANIM_PIXELS] > 0) compterAnim(`p${n}`);
    }
  }
  composait = compose;
  travail += performance.now() - debut; travaux++;
  afficherLaCadence(maintenant);
  requestAnimationFrame(dessiner);
}
// Le compteur, chaque seconde : les images montrées, le travail de la page par image, la part du
// temps réel où le jeu calcule (travailleur.js).
function afficherLaCadence(maintenant) {
  if (maintenant - t <= 1000) return;
  cadence.textContent = `${images} im/s, page ${travaux ? (travail / travaux).toFixed(1) : 0} ms, jeu ${Math.round(entete[Z.CALCUL] / 10)} %`
    + (animations > 0 ? `, anim ${animImages}/s` : '')
    + (son.actif ? `, son ${son.retard()} ms d'avance, ${son.bilan.manques} manques` : '');
  images = 0; t = maintenant; travail = 0; travaux = 0; animImages = 0;
  afficherAnimations();
}
// Le curseur du jeu posé dans une image composée par le fluide (grande vue au cran de base).
function poserLeCurseur(image, l, h) {
  const c = zoom.curseur;
  if (!c.visible) return;
  for (let y = 0; y < c.h; y++) {
    const yy = c.y + y;
    if (yy < 0 || yy >= h) continue;
    for (let x = 0; x < c.l; x++) {
      const v = c.sprite[y * c.l + x], xx = c.x + x;
      if (v !== 0xFE && xx >= 0 && xx < l) image[yy * l + xx] = v;
    }
  }
}
requestAnimationFrame(dessiner);
window.addEventListener('resize', () => { affichage.ajuster(); tailleAChange(); });

// --- souris -----------------------------------------------------------------------------------
// Position normalisée : 65 536 = la largeur (ou la hauteur) de l'image affichée. Le jeu reçoit les
// mouvements, pas la position (voir deplacerPointeur dans moteur/hote/machine.js) ; une position
// hors de l'image reste donc utile, bouton enfoncé, pour continuer un tracé commencé dedans.
function position(e) {
  const r = affichage.rectangleImage();
  return [Math.round((e.clientX - r.left) * 65536 / r.width), Math.round((e.clientY - r.top) * 65536 / r.height)];
}
let boutons = 0;
// Le bord de l'écran se déborde. Le jeu fait défiler la vue quand le pointeur touche un bord de
// l'image, sur 2 pixels à peine : un pointeur jusqu'à MARGE pixels au-delà de l'image compte encore,
// et le pilote de souris le bloque au bord, comme une souris poussée contre le bord de l'écran. Plus
// loin, ou hors de la fenêtre, le pointeur du jeu est ramené une fois un peu à l'intérieur de
// l'image, pour que la vue ne défile pas toute seule, puis la page cesse de le suivre.
const MARGE = 48;
let dehors = true;
function rentrer(e) {
  if (dehors || boutons || glisseDuMilieu) return;
  dehors = true;
  if (composeeEtat.active) {
    // (image composée : le pointeur ramené un peu à l'intérieur du cadre)
    const r = affichage.rectangleImage();
    pointeur.x = Math.max(24, Math.min(r.width - 24, pointeur.x));
    pointeur.y = Math.max(24, Math.min(r.height - 24, pointeur.y));
    envoyerLePointeur();
    return;
  }
  const [x, y] = position(e);
  const dedans = (v) => Math.max(1024, Math.min(65536 - 1024, v));
  envoyer(1, dedans(x), dedans(y));
}
// Le glisser au bouton du milieu (retours 49, 55 et 56 de docs/demandes.md) : la vue suit la main. Le
// bouton n'est pas transmis au jeu (qui le prenait pour le bouton gauche). Quand la page compose
// l'image (zoom, défilement fluide), elle tient la vue montrée au pixel, dans ce que le jeu a dessiné,
// et demande au travailleur la caméra qui la couvre (glisser.js ; message 24 : travailleur.js,
// placerLaCamera) ; sinon, le mouvement de la main, en pixels de l'image du jeu, part au travailleur
// (message 21, glisserLaVue), qui fait défiler la caméra du jeu case par case. Le curseur prend la main
// ouverte du jeu (message 23, retour 52) et reste sur le point du parc qu'il a saisi, à l'échelle du
// zoom (retour 56) : il suit la main tant que le parc la suit, et s'arrête avec lui contre un bord de
// la carte. La souris libre n'est plus capturée le temps du glisser : relâchée, elle reparaissait là
// où le glisser avait commencé, et le curseur y serait revenu.
let glisseDuMilieu = false;
let mainPrecedente = null;           // (souris libre) la dernière place du pointeur, en pixels CSS
let curseurAncre = null;             // (défilement fluide) où le curseur du jeu a été envoyé
function commencerLeGlisser(e) {
  glisseDuMilieu = true;
  envoyer(23, 1);
  mainPrecedente = [e.clientX, e.clientY];
  // La vue montrée, d'où part la main (la glisse du défilement fluide en cours comprise, puis finie),
  // et la place du curseur dans cette vue : là est le point du parc saisi.
  const maintenant = performance.now();
  const depart = vueMontree(maintenant);
  if (!depart) { glisser.actif = false; return; }
  let curseur;
  if (composeeEtat.active) {
    glisser.curseur = zoom.positionDuCurseur();
    curseur = [glisser.curseur[0] / zoom.p, glisser.curseur[1] / zoom.p];
    curseurAncre = null;
  } else {
    glisser.curseur = null;
    curseur = [repereDuJeu.curseur[0], repereDuJeu.curseur[1]];
    curseurAncre = curseur;
  }
  glisser.commencer(depart.coin, repereDuJeu, depart.glisse, curseur);
  fluide.caler();
  fluide.boutonGauche = true;
  viserLaCamera(jeuDeLaPortion());
}
function finirLeGlisser() {
  if (!glisseDuMilieu) return;
  glisseDuMilieu = false;
  envoyer(23, 0);
  glisser.relacher(performance.now());
}
function glisserLaVue(e) {
  // La main, en pixels CSS : le mouvement de la souris capturée, ou le chemin du pointeur libre.
  let mx = e.movementX, my = e.movementY;
  if (!capturee()) {
    if (mainPrecedente) { mx = e.clientX - mainPrecedente[0]; my = e.clientY - mainPrecedente[1]; }
    mainPrecedente = [e.clientX, e.clientY];
  }
  let dx, dy;
  if (composeeEtat.active) { dx = mx / zoom.p; dy = my / zoom.p; }
  else {
    const r = affichage.rectangleImage();
    if (!r.width || !r.height || !affichage.l) return;
    dx = mx * affichage.l / r.width; dy = my * affichage.h / r.height;
  }
  if (!dx && !dy) return;
  if (!glisser.actif) { envoyer(21, Math.round(dx * 16), Math.round(dy * 16)); return; }
  glisser.bouger(dx, dy);
  viserLaCamera(jeuDeLaPortion());       // (tout de suite : le jeu dessine la caméra au plus tôt)
}
// Le coin du parc montré, dans le monde, et de combien il dépasse la vue de l'image publiée (la glisse
// du défilement fluide) ; null si la page ne compose pas l'image (elle montre alors celle du jeu).
function vueMontree(maintenant) {
  if (!repereDuJeu) return null;
  if (composeeEtat.active) {
    return { coin: [zoom.x + zoom.glisse[0] + zoom.s[0], zoom.y + zoom.glisse[1] + zoom.s[1]], glisse: zoom.glisse };
  }
  if (defilementFluide && entete[9] === 1 && fluide.cible && fluide.image
    && fluide.largeur === entete[1] && fluide.hauteur === entete[2]) {
    const p = fluide.position(maintenant);
    return { coin: [p.x, p.y], glisse: [p.x - fluide.cible.x, p.y - fluide.cible.y] };
  }
  return null;
}
// Le jeu de la portion du parc montrée dans l'image du jeu (zoom.js, bornes) ; aucun hors du zoom.
const jeuDeLaPortion = () => (composeeEtat.active ? zoom.bornes() : [0, 0]);
// La caméra qui couvre la vue voulue, demandée au travailleur quand elle change.
function viserLaCamera(jeu) {
  const [c, r] = glisser.viser(jeu);
  if (glisser.camera && glisser.camera[0] === c && glisser.camera[1] === r) return;
  glisser.camera = [c, r];
  envoyer(24, c, r);
}
// Le zoom : la portion posée dans l'image à la vue montrée par le glisser ; ce qui dépasse de l'image
// est la glisse (rendue). Bouton tenu, le pointeur de la page est posé sur le point du parc saisi, à
// l'échelle du zoom, à quatre pixels du jeu au moins des bords du cadre (là, le jeu ferait défiler sa
// vue lui-même) ; le curseur y est montré, et le jeu reçoit le point sous lui.
function placerLaPortionDuGlisser(maintenant) {
  const jeu = zoom.bornes();
  viserLaCamera(jeu);
  const [x, y] = glisser.affichee(jeu, maintenant);
  zoom.s = [Math.max(0, Math.min(jeu[0], x - zoom.x)), Math.max(0, Math.min(jeu[1], y - zoom.y))];
  if (glisseDuMilieu) {
    const [cx, cy] = glisser.pointSaisi([x, y]), m = 4 * Math.max(zoom.p, zoom.u);
    pointeur.x = Math.max(m, Math.min(zoom.Wf - m, cx * zoom.p));
    pointeur.y = Math.max(m, Math.min(zoom.Hf - m, cy * zoom.p));
    glisser.curseur = [pointeur.x, pointeur.y];
  }
  suivreLePointeur();
  return [x - zoom.x - zoom.s[0], y - zoom.y - zoom.s[1]];
}
// Le défilement fluide : la vue montrée par le glisser, que la page compose.
function vueDuGlisser(maintenant) {
  viserLaCamera([0, 0]);
  const [x, y] = glisser.affichee([0, 0], maintenant);
  if (glisseDuMilieu) ancrerLeCurseurDuJeu(x, y);
  return { x, y };
}
// Le défilement fluide : le curseur, que le jeu dessine dans son image, est mené sur le point saisi, à
// quatre pixels au moins des bords de l'écran. Souris capturée, il est déplacé (message 7) de ce que ce
// point a fait depuis l'image précédente ; libre, il reçoit sa place (message 1), vers laquelle le
// pilote de l'hôte ramène le curseur du jeu (machine.js) : sans elle, il retournait peu à peu vers la
// souris d'avant le glisser.
function ancrerLeCurseurDuJeu(x, y) {
  const l = entete[1], h = entete[2];
  if (!l || !h || !curseurAncre) return;
  const [cx, cy] = glisser.pointSaisi([x, y]);
  const nx = Math.max(4, Math.min(l - 5, cx)), ny = Math.max(4, Math.min(h - 5, cy));
  const dx = nx - curseurAncre[0], dy = ny - curseurAncre[1];
  if (!dx && !dy) return;
  curseurAncre = [nx, ny];
  if (capturee()) envoyer(7, Math.round(dx * 65536 / l), Math.round(dy * 65536 / h));
  else envoyer(1, Math.floor((nx + 0.5) * 65536 / l), Math.floor((ny + 0.5) * 65536 / h));
}
window.addEventListener('mousemove', (e) => {
  if (glisseDuMilieu) { glisserLaVue(e); return; }
  const r = affichage.rectangleImage();
  if (capturee()) {
    if (composeeEtat.active) {
      // image composée : la page tient le pointeur, borné au cadre, et envoie des positions
      pointeur.x = Math.max(0, Math.min(r.width - 1e-3, pointeur.x + e.movementX));
      pointeur.y = Math.max(0, Math.min(r.height - 1e-3, pointeur.y + e.movementY));
      envoyerLePointeur();
      return;
    }
    // souris capturée : le mouvement seul, normalisé comme les positions
    envoyer(7, Math.round(e.movementX * 65536 / r.width), Math.round(e.movementY * 65536 / r.height));
    return;
  }
  // Au-dessus de l'image est le bandeau de la page : de ce côté, pas de marge (sauf bouton tenu, pour
  // un tracé), sans quoi aller cliquer un bouton faisait défiler le parc vers le haut.
  const margeHaut = boutons ? MARGE : 0;
  const proche = e.clientX > r.left - MARGE && e.clientX < r.right + MARGE
    && e.clientY > r.top - margeHaut && e.clientY < r.bottom + MARGE;
  if (!proche && !boutons) { rentrer(e); return; }
  dehors = false;
  if (composeeEtat.active) { pointeurDuCadre(e); envoyerLePointeur(); return; }
  const [x, y] = position(e); envoyer(1, x, y);
});
document.documentElement.addEventListener('mouseleave', rentrer);
canvas.addEventListener('mousedown', (e) => {
  canvas.focus();
  e.preventDefault();
  // Pendant un film en mp4, le clic le passe (films.js), ou le lance s'il attend le geste du joueur ;
  // pendant l'introduction du jeu, le clic la passe (le travailleur en fait une touche) : ni capture
  // ni glisse.
  if (filmEnCours()) { toucherLeFilm(); return; }
  if (introductionEnCours) { envoyer(2, 1); envoyer(2, 0); return; }
  if (e.button === 1) { commencerLeGlisser(e); return; }
  // La glisse du défilement fluide est finie avant tout clic : le clic tombe sur ce que le joueur
  // voit, qui est alors ce que voit le jeu. Bouton gauche tenu (un tracé), pas de glisse.
  fluide.caler();
  if (e.button !== 2) fluide.boutonGauche = true;
  if (captureVoulue && !captureRefusee && !capturee()) { capturer(); return; }  // ce clic capture, sans agir
  if (!capturee()) {
    if (composeeEtat.active) { pointeurDuCadre(e); envoyerLePointeur(); }
    else { const [x, y] = position(e); envoyer(1, x, y); }
  }
  if (composeeEtat.active && !boutons) tenue = zoom.saisir(pointeur.x, pointeur.y);
  boutons |= e.button === 2 ? 2 : 1; envoyer(2, boutons);
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 1) { finirLeGlisser(); return; }
  boutons &= ~(e.button === 2 ? 2 : 1);
  if (e.button !== 2) fluide.boutonGauche = false;
  envoyer(2, boutons);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('blur', finirLeGlisser);

// --- clavier : codes de touches du PC (jeu 1) -------------------------------------------------
const CODES = {
  Escape: 0x01, Digit1: 0x02, Digit2: 0x03, Digit3: 0x04, Digit4: 0x05, Digit5: 0x06, Digit6: 0x07,
  Digit7: 0x08, Digit8: 0x09, Digit9: 0x0A, Digit0: 0x0B, Minus: 0x0C, Equal: 0x0D, Backspace: 0x0E,
  Tab: 0x0F, KeyQ: 0x10, KeyW: 0x11, KeyE: 0x12, KeyR: 0x13, KeyT: 0x14, KeyY: 0x15, KeyU: 0x16,
  KeyI: 0x17, KeyO: 0x18, KeyP: 0x19, BracketLeft: 0x1A, BracketRight: 0x1B, Enter: 0x1C,
  ControlLeft: 0x1D, KeyA: 0x1E, KeyS: 0x1F, KeyD: 0x20, KeyF: 0x21, KeyG: 0x22, KeyH: 0x23,
  KeyJ: 0x24, KeyK: 0x25, KeyL: 0x26, Semicolon: 0x27, Quote: 0x28, Backquote: 0x29, ShiftLeft: 0x2A,
  Backslash: 0x2B, KeyZ: 0x2C, KeyX: 0x2D, KeyC: 0x2E, KeyV: 0x2F, KeyB: 0x30, KeyN: 0x31, KeyM: 0x32,
  Comma: 0x33, Period: 0x34, Slash: 0x35, ShiftRight: 0x36, NumpadMultiply: 0x37, AltLeft: 0x38,
  Space: 0x39, CapsLock: 0x3A, F1: 0x3B, F2: 0x3C, F3: 0x3D, F4: 0x3E, F5: 0x3F, F6: 0x40, F7: 0x41,
  F8: 0x42, F9: 0x43, F10: 0x44, NumLock: 0x45, ScrollLock: 0x46, Numpad7: 0x47, Numpad8: 0x48,
  Numpad9: 0x49, NumpadSubtract: 0x4A, Numpad4: 0x4B, Numpad5: 0x4C, Numpad6: 0x4D, NumpadAdd: 0x4E,
  Numpad1: 0x4F, Numpad2: 0x50, Numpad3: 0x51, Numpad0: 0x52, NumpadDecimal: 0x53, F11: 0x57, F12: 0x58,
  ArrowUp: 0x48, ArrowDown: 0x50, ArrowLeft: 0x4B, ArrowRight: 0x4D, Home: 0x47, End: 0x4F,
  PageUp: 0x49, PageDown: 0x51, Insert: 0x52, Delete: 0x53, NumpadEnter: 0x1C, ControlRight: 0x1D,
  AltRight: 0x38, IntlBackslash: 0x56,
};
const ASCII = { Enter: 13, NumpadEnter: 13, Backspace: 8, Escape: 27, Tab: 9 };
// Repli quand l'événement ne donne pas la touche physique (événements synthétiques, certains
// navigateurs) : on la déduit du caractère, selon la disposition du clavier PC américain.
const PAR_CARACTERE = {};
'qwertyuiop'.split('').forEach((c, k) => { PAR_CARACTERE[c] = 0x10 + k; });
'asdfghjkl'.split('').forEach((c, k) => { PAR_CARACTERE[c] = 0x1E + k; });
'zxcvbnm'.split('').forEach((c, k) => { PAR_CARACTERE[c] = 0x2C + k; });
'1234567890'.split('').forEach((c, k) => { PAR_CARACTERE[c] = 0x02 + k; });
Object.assign(PAR_CARACTERE, { ' ': 0x39, Enter: 0x1C, Escape: 0x01, Backspace: 0x0E, Tab: 0x0F,
  ArrowUp: 0x48, ArrowDown: 0x50, ArrowLeft: 0x4B, ArrowRight: 0x4D });
for (let k = 1; k <= 10; k++) PAR_CARACTERE['F' + k] = 0x3A + k;
function codeTouche(e) {
  if (CODES[e.code] !== undefined) return CODES[e.code];
  // (e.key manque à Chrome 49 et 50)
  if (!e.key) return undefined;
  const c = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return PAR_CARACTERE[c];
}
// Les touches mortes : l'état de Maj, Ctrl et Alt, tel que le BIOS le tient (bit 1 Maj gauche, bit 2
// Ctrl, bit 3 Alt), est envoyé avant chaque touche. Le jeu le lit à chaque frappe : sans lui, Maj+S
// (l'entrepôt), Alt+Échap (quitter), Ctrl+C et Alt+Z (la triche) étaient injouables dans la page.
let modificateurs = -1;
function envoyerModificateurs(e) {
  const etat = (e.shiftKey ? 2 : 0) | (e.ctrlKey ? 4 : 0) | (e.altKey ? 8 : 0);
  if (etat !== modificateurs) { modificateurs = etat; envoyer(17, etat); }
}
canvas.addEventListener('keydown', (e) => {
  envoyerModificateurs(e);
  const code = codeTouche(e);
  if (code === undefined) return;
  let ascii = ASCII[e.code] || ASCII[e.key] || 0;
  if (!ascii && e.key && e.key.length === 1) ascii = e.key.charCodeAt(0) & 0xFF;
  envoyer(3, code, ascii);
  e.preventDefault();
});
canvas.addEventListener('keyup', (e) => {
  envoyerModificateurs(e);
  const code = codeTouche(e);
  if (code !== undefined) { envoyer(4, code); e.preventDefault(); }
});
canvas.focus();
