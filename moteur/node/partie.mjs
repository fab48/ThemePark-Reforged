// Jouer une partie sous Node, sans écran : c'est la base du lanceur et du vérificateur.
//
// Le temps étant virtuel, une partie rejouée avec le même script d'entrées se déroule exactement
// de la même façon : c'est ce qui permet de comparer deux exécutions.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Machine, Sortie, Arret } from '../hote/machine.js';
import { FichiersNode } from '../hote/fichiers-node.js';
import { installer, installerCompare, poserLeProgramme } from '../jeu/index.js';
import { creerProcesseur } from '../hote/processeur.js';
import { extraireLImage, lireLImage } from '../hote/image-programme.js';
import { composerLeProgramme } from '../hote/assets-du-jeu.js';
import { PILOTES, fabriquerLePilote } from '../hote/pilotes-hmi.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
export const RACINE = path.resolve(ICI, '..', '..');
export const CD = path.join(RACINE, 'jeu', 'GAME');
export const INSTALL = path.join(RACINE, 'travail', 'c', 'THEME.CD');

// Les chemins du CD et de l'installation, en tête de toute ligne de commande donnée au jeu.
export const CHEMINS = '-cD:/game/ -dC:/THEME.CD/';

// Lire un scénario. C'est soit une liste d'événements, soit un objet qui dit aussi comment lancer
// le jeu :
//   { "ligneCommande": "-l4 -n-1 -eso /S",       les options du jeu, après les chemins (CHEMINS)
//     "fichiers": { "RECORD.GAM": "fichiers/RECORD.GAM" },  déposés dans l'installation neuve ;
//                                                la source est relative au fichier du scénario
//     "evenements": [ ... ] }
// Rend { evenements, ligneCommande (complète, ou undefined : celle de jouer() par défaut),
// fichiers (nom dans l'installation -> chemin absolu de la source) }, à passer à jouer().
export function lireScenario(fichier) {
  if (!fichier || !fs.existsSync(fichier)) return { evenements: [], ligneCommande: undefined, fichiers: {} };
  const s = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  if (Array.isArray(s)) return { evenements: s, ligneCommande: undefined, fichiers: {} };
  const dossier = path.dirname(path.resolve(fichier));
  const fichiers = {};
  for (const [nom, source] of Object.entries(s.fichiers || {})) fichiers[nom] = path.resolve(dossier, source);
  return {
    evenements: s.evenements || [],
    ligneCommande: s.ligneCommande === undefined ? undefined : `${CHEMINS} ${s.ligneCommande}`,
    fichiers,
  };
}

export async function chargerTranscription() {
  return import(pathToFileURL(path.join(RACINE, 'travail', 'transcrit', 'jeu.js')).href);
}

// Les assets (moteur/node/extraire-jeu.mjs), s'ils sont là : leur index, et de quoi lire un fichier.
const ASSETS = path.join(RACINE, 'assets');
const indexDesAssets = () => (fs.existsSync(path.join(ASSETS, 'index.json'))
  ? JSON.parse(fs.readFileSync(path.join(ASSETS, 'index.json'), 'utf8')) : null);
const lireUnAsset = async (c) => new Uint8Array(fs.readFileSync(path.join(ASSETS, ...c.split('/'))));

// L'image des données du programme (moteur/hote/image-programme.js) : refaite des tables lisibles des
// assets (assets/programme/, moteur/hote/tables-du-programme.js) s'ils sont là, sinon tirée de
// MAIN.EXE ; gardée pour les parties suivantes. `partie` : 'introduction' pour celle d'INTRO.EXE
// (null si les assets ne l'ont pas).
const images = new Map();
export async function chargerLImageDuProgramme(partie = 'programme') {
  if (images.has(partie)) return images.get(partie);
  const index = indexDesAssets();
  let image = null;
  if (index) {
    const octets = await composerLeProgramme(index, lireUnAsset, partie);
    image = octets && lireLImage(octets);
  } else if (partie === 'programme') {
    image = await extraireLImage(new Uint8Array(fs.readFileSync(path.join(CD, 'MAIN.EXE'))));
  }
  images.set(partie, image);
  return image;
}

// Les bibliothèques de pilotes de HMI telles que le moteur les donne au jeu : les fichiers virtuels
// que l'hôte refait de leurs en-têtes (moteur/hote/pilotes-hmi.js), si les assets en ont la
// description ; sinon (pas d'assets), celles du CD déroulé. Chemin vu par le jeu -> octets.
let pilotes = null;
export function pilotesDuMoteur() {
  if (pilotes) return pilotes;
  pilotes = new Map();
  const index = indexDesAssets();
  if (index && index.pilotes) {
    const description = JSON.parse(fs.readFileSync(path.join(ASSETS, ...index.pilotes.split('/')), 'utf8'));
    for (const c of PILOTES) if (description[c]) pilotes.set('D:/' + c, fabriquerLePilote(description[c]));
  }
  return pilotes;
}

// Le moteur réentrant (moteur/node/reentrer.mjs) : la variante du moteur autonome qui sait rendre la
// main, écrite dans travail/reentrant/moteur/. Ses modules (sa machine, son processeur, son code
// lisible, son pilote) remplacent ceux de moteur/ ; ses exceptions (Sortie, Arret) sont les siennes.
// Si la variante manque, ou est plus ancienne que ce dont elle est tirée, on le dit plutôt que de
// vérifier un moteur périmé.
export const MOTEUR_REENTRANT = path.join(RACINE, 'travail', 'reentrant', 'moteur');
let moteurReentrant = null;
export async function chargerLeMoteurReentrant() {
  if (moteurReentrant) return moteurReentrant;
  const temoin = path.join(MOTEUR_REENTRANT, 'rapport.txt');
  const aRefaire = 'lancer : node moteur/node/reentrer.mjs';
  if (!fs.existsSync(temoin)) throw new Error(`pas de moteur réentrant dans ${MOTEUR_REENTRANT} : ${aRefaire}`);
  const ecrit = fs.statSync(temoin).mtimeMs;
  const sources = [path.join(ICI, 'reentrer.mjs')];
  for (const d of ['jeu', 'hote']) {
    for (const f of fs.readdirSync(path.join(RACINE, 'moteur', d))) if (f.endsWith('.js')) sources.push(path.join(RACINE, 'moteur', d, f));
  }
  const recente = sources.find((f) => fs.statSync(f).mtimeMs > ecrit);
  if (recente) throw new Error(`le moteur réentrant est plus ancien que ${path.relative(RACINE, recente)} : ${aRefaire}`);
  const url = (f) => pathToFileURL(path.join(MOTEUR_REENTRANT, f)).href;
  const [m, p, j, r] = await Promise.all(['hote/machine.js', 'hote/processeur.js', 'jeu/index.js', 'hote/reentrance.js']
    .map((f) => import(url(f))));
  moteurReentrant = { Machine: m.Machine, Sortie: m.Sortie, Arret: m.Arret, creerProcesseur: p.creerProcesseur,
    poserLeProgramme: j.poserLeProgramme, piloter: r.piloterSansDormir, garderLeTempsReel: r.garderLeTempsReel };
  return moteurReentrant;
}
// Le moteur ordinaire, sous la même forme : `piloter` démarre la machine, qui rend la main à la fin.
const MOTEUR_ORDINAIRE = { Machine, Sortie, Arret, creerProcesseur, poserLeProgramme,
  piloter: (machine) => { machine.demarrer(); return 0; } };
// La demande de pause que le moteur réentrant reçoit, sous Node, à chaque passage des observateurs
// (chaque milliseconde virtuelle) : le pilote la reprend aussitôt, mais le chemin par lequel la page
// rendra la main au navigateur est ainsi parcouru, bien plus souvent qu'elle ne le fera.
const PAUSE = Object.freeze({ pause: 0 });

// options : { duree (s virtuelles), script (liste d'evenements), reecritures (liste de noms,
//   null = toutes, [] = aucune), journal, observateur (machine) => void, ligneCommande,
//   son (les cartes a declarer au jeu, voir moteur/hote/son.js ; absent : jeu muet),
//   empoisonner (brouiller la pile laissee par chaque reecriture, voir moteur/jeu/index.js),
//   fichiers (nom dans l'installation -> chemin de la source : copies deposees avant le demarrage,
//   voir lireScenario), memoireEtendue (octets de mémoire de l'hôte hors de celle du jeu : la
//   grande vue, moteur/jeu/grande-vue.js ; rien par défaut),
//   autonome (le moteur autonome : le code lisible seul, sans transcription, moteur/hote/processeur.js ;
//   `reecritures`, `comparer` et `empoisonner` sont alors sans objet),
//   image (la mémoire du programme prise dans son image, sans le code de MAIN.EXE :
//   moteur/hote/image-programme.js ; avec `autonome`), remplissageDuCode (l'octet mis à la place du
//   code hors de ses îles de données, 0 par défaut),
//   reentrant (le moteur réentrant, moteur/node/reentrer.mjs : le moteur autonome, qui rend la main à
//   chaque demande de pause ; `autonome` va de soi), garde (avec reentrant : la garde du temps réel de
//   la page, l'échéance toujours passée, voir plus bas) }
// Rend { machine, T, fin, pauses (les pauses rendues par le moteur réentrant) }.
export async function jouer(options = {}) {
  const {
    duree = 30, script = [], reecritures = [], journal = () => {},
    observateur = null, ligneCommande = CHEMINS + ' -l4',
    installation = INSTALL,
  } = options;
  if (options.reentrant) options = { ...options, autonome: true };
  const { Machine, Sortie, Arret, creerProcesseur, poserLeProgramme, piloter, garderLeTempsReel } = options.reentrant
    ? await chargerLeMoteurReentrant() : MOTEUR_ORDINAIRE;
  fs.mkdirSync(path.join(installation, 'SAVE'), { recursive: true });
  for (const [nom, source] of Object.entries(options.fichiers || {})) {
    fs.mkdirSync(path.dirname(path.join(installation, nom)), { recursive: true });
    fs.copyFileSync(source, path.join(installation, nom));
  }
  const T = options.autonome ? creerProcesseur() : await chargerTranscription();
  const fichiers = new FichiersNode({
    'C:/THEME.CD/DATA/': [path.join(installation, 'DATA'), path.join(CD, 'DATA')],
    'C:/THEME.CD/SAVE/': [path.join(installation, 'SAVE'), path.join(CD, 'SAVE')],
    'D:/GAME/': CD, 'C:/THEME.CD/': installation,
  }, 'C:/THEME.CD/', journal, pilotesDuMoteur());
  const machine = new Machine({
    exe: options.image ? null : new Uint8Array(fs.readFileSync(path.join(CD, 'MAIN.EXE'))),
    image: options.image ? await chargerLImageDuProgramme() : null,
    remplissageDuCode: options.remplissageDuCode || 0,
    T, fichiers, journal, ligneCommande, son: options.son || null,
    memoireEtendue: options.memoireEtendue || 0,
    programme: options.autonome ? (m, t) => journal(`moteur autonome : ${poserLeProgramme(m, t)} fonctions lisibles`) : null,
  });
  // (garde : la garde du temps réel du pilote de la page, reentrance.js, son échéance toujours passée :
  // le moteur rend la main à presque chaque frontière d'appel où il le peut, et non plus seulement au
  // passage des observateurs ; la partie doit rester la même, retour 80)
  if (options.reentrant && options.garde) garderLeTempsReel(machine, PAUSE, () => 0).echeance = 0;
  machine.programmer(script);
  machine.observateurs.push((m) => {
    m.livrerScenario();
    if (observateur) observateur(m);
    if (m.us >= duree * 1e6) throw new Arret(`duree atteinte (${duree} s virtuelles)`);
    if (options.reentrant) m.pauseDemandee = PAUSE;
  });
  const anciennes = machine.installerRemplacements.bind(machine);
  machine.installerRemplacements = () => {
    anciennes();
    if (options.autonome) return;
    const poses = options.comparer
      ? installerCompare(machine, T, reecritures, null, console.log, options.echantillon || 1, !!options.memoireEntiere)
      : installer(machine, T, reecritures, { empoisonner: !!options.empoisonner, graine: options.graine });
    if (poses.length) journal('reecritures posees : ' + poses.join(', '));
  };
  let fin = null;
  try {
    piloter(machine);
    fin = 'rendu la main';
  } catch (e) {
    if (e instanceof Sortie) fin = 'sortie ' + e.code;
    else if (e instanceof Arret) fin = 'arret : ' + e.message;
    else fin = 'ERREUR : ' + (e.stack || e);
  }
  return { machine, T, fin };
}

// Empreinte d'un bloc de mémoire (FNV-1a, 32 bits) : sert à comparer deux exécutions. `h` permet de
// poursuivre l'empreinte d'un bloc précédent.
export function empreinte(m8, debut, fin, h = 0x811C9DC5) {
  for (let a = debut; a < fin; a++) {
    h ^= m8[a];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
