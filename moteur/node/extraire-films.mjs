// Convertir les films du CD en mp4 : l'introduction (data/intro.dat), les films des attractions
// (data/rideani.NNN, la loupe de la fiche d'une attraction) et celui de la partie gagnée
// (data/wingame.dat), tels que le jeu les joue — image par image, avec leur musique et leurs
// bruitages —, captés sur le moteur autonome sous Node, puis encodés par ffmpeg (H.264 et AAC, en
// 640x400 : deux fois le 320x200 du jeu, pixels nets, pour que la couleur reste entière). La page joue
// ces mp4 à la place des films du jeu (moteur/web/films.js) ; les fichiers FLC quittent alors les
// assets (index.json : films).
//
// Usage : node moteur/node/extraire-films.mjs [--assets dossier] [--seulement introduction|attractions|gagnee]
//                                             [--garder-flc] [--sortie-brute dossier]
//   ffmpeg : dans le PATH, désigné par la variable FFMPEG, ou C:\ffmpeg\bin\ffmpeg.exe.
//
// Le film d'une attraction est joué par 0x5C04F (moteur/jeu/son-du-jeu.js, jouerUnFilmEnPleinEcran),
// que le jeu appelle depuis la fiche de l'attraction ; l'outil l'appelle lui-même, entre deux images
// du parc, pour chaque attraction, puis pour la partie gagnée. L'image affichée est relevée à chaque
// milliseconde virtuelle et gardée quand elle change ; le son de la carte émulée est écrit en WAV.

import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { Machine, Sortie, Arret, ADRESSES_DE_MAIN } from '../hote/machine.js';
import { FichiersNode } from '../hote/fichiers-node.js';
import { creerProcesseur } from '../hote/processeur.js';
import { lireLImage } from '../hote/image-programme.js';
import { FREQUENCE_SON } from '../hote/son.js';
import { poserLeProgramme, poserLIntroduction } from '../jeu/index.js';
import { composerLesFichiers, composerLeProgramme, filmsRemplaces } from '../hote/assets-du-jeu.js';
import { RACINE } from './partie.mjs';

const args = process.argv.slice(2);
const opt = (nom, def) => { const k = args.indexOf(nom); return k >= 0 ? args[k + 1] : def; };
const ASSETS = path.resolve(opt('--assets', path.join(RACINE, 'assets')));
const SEULEMENT = opt('--seulement', null);
const GARDER_FLC = args.includes('--garder-flc');
const JOUER_LE_FILM = 0x5C04F;         // (genre, attraction) : 1 la partie gagnée, 2 une attraction
const FENETRE_VIDEO = 0xA0000;
const ECRAN_COURANT = 0xD6652;         // mot : 0 = la vue du parc
const IMAGE_DU_FILM = 0xBA7D0;         // mot : le numéro de l'image en cours du film (son-du-jeu.js)
const ESPACE = 57;                     // la touche qui arrête un film rejoué en boucle
const MODE_13H = 0x13;
const ATTRACTIONS = 32;                // les numéros essayés : le jeu dit lui-même s'il y a un film

function ffmpeg() {
  const candidats = [process.env.FFMPEG, 'C:/ffmpeg/bin/ffmpeg.exe',
    path.join(os.homedir(), 'AppData', 'Local', 'Flowframes', 'FlowframesData', 'pkgs', 'av', 'ffmpeg.exe')];
  for (const c of candidats) if (c && fs.existsSync(c)) return c;
  try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return 'ffmpeg'; } catch { return null; }
}
const ENCODEUR = ffmpeg();
if (!ENCODEUR) { console.error('ffmpeg est introuvable : le mettre dans le PATH ou dans la variable FFMPEG'); process.exit(1); }

const index = JSON.parse(fs.readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
const TRAVAIL = fs.mkdtempSync(path.join(os.tmpdir(), 'themepark-films-'));
const CD = path.join(TRAVAIL, 'cd');
const INSTALL = path.join(TRAVAIL, 'install');
fs.mkdirSync(path.join(INSTALL, 'SAVE'), { recursive: true });
const journal = (s) => console.log(s);

// Le CD, refait depuis les assets dans un dossier de travail (le jeu lit ses fichiers d'origine).
{
  const lireAsset = async (c) => new Uint8Array(fs.readFileSync(path.join(ASSETS, ...c.split('/'))));
  const fichiers = await composerLesFichiers(index, lireAsset, (o) => new Uint8Array(zlib.inflateSync(o)));
  for (const [chemin, octets] of fichiers) {
    const dest = path.join(CD, ...chemin.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, octets);
  }
  journal(`${fichiers.size} fichiers du CD refaits dans ${CD}`);
}
if (!Object.keys(index.films?.bruts || {}).length) { console.error("les assets n'ont plus de film FLC (déjà convertis ?)"); process.exit(1); }
// les images du programme et de l'introduction, refaites de leurs tables lisibles (assets/programme/)
const lireUnAsset = async (c) => new Uint8Array(fs.readFileSync(path.join(ASSETS, ...c.split('/'))));
const programme = lireLImage(await composerLeProgramme(index, lireUnAsset, 'programme'));
const octetsDeLIntro = await composerLeProgramme(index, lireUnAsset, 'introduction');
const introduction = octetsDeLIntro ? lireLImage(octetsDeLIntro) : null;

// --- La capture ---------------------------------------------------------------------------------
// Les images : à chaque milliseconde virtuelle, la fenêtre vidéo (en 320x200 : les films y sont
// toujours) et la palette, gardées quand elles changent, chacune en PNG à palette. Le son : les
// blocs de la carte, en entiers de 16 bits, dans un fichier brut ; un WAV à la fin.
class Capture {
  constructor(nom) {
    this.dossier = path.join(TRAVAIL, nom);
    fs.mkdirSync(this.dossier, { recursive: true });
    this.images = [];                    // { us, fichier }
    this.derniere = Buffer.alloc(64000);
    this.dernierePalette = Buffer.alloc(768);
    this.active = false;
    this.brut = fs.openSync(path.join(this.dossier, 'son.raw'), 'w');
    this.trames = 0;                     // paires d'échantillons écrites
  }
  // l'observateur, posé sur la machine
  observer(m) {
    if (!this.active || m.video.mode !== MODE_13H) return;
    const fenetre = Buffer.from(m.m8.buffer, m.m8.byteOffset + FENETRE_VIDEO, 64000);
    const palette = Buffer.from(m.video.palette.buffer, m.video.palette.byteOffset, 768);
    if (fenetre.equals(this.derniere) && palette.equals(this.dernierePalette)) return;
    fenetre.copy(this.derniere);
    palette.copy(this.dernierePalette);
    // Un fondu de palette change l'image à chaque milliseconde : une image au plus par centième de
    // seconde (la dernière l'emporte), ce que l'œil ne distingue pas et que la vidéo supporte.
    const precedente = this.images[this.images.length - 1];
    if (precedente && m.us - precedente.us < 10000) {
      fs.writeFileSync(precedente.fichier, pngIndexe(fenetre, palette));
      return;
    }
    const fichier = path.join(this.dossier, `${String(this.images.length).padStart(6, '0')}.png`);
    fs.writeFileSync(fichier, pngIndexe(fenetre, palette));
    this.images.push({ us: m.us, fichier });
  }
  // un bloc de son (flottants, stéréo entrelacée)
  son(bloc) {
    const b = Buffer.alloc(2 * bloc.length);
    for (let k = 0; k < bloc.length; k++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, bloc[k])) * 32767), 2 * k);
    fs.writeSync(this.brut, b);
    this.trames += bloc.length / 2;
  }
  async finir() {
    fs.closeSync(this.brut);
    const donnees = fs.readFileSync(path.join(this.dossier, 'son.raw'));
    const wav = Buffer.alloc(44);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + donnees.length, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
    wav.writeUInt32LE(FREQUENCE_SON, 24); wav.writeUInt32LE(FREQUENCE_SON * 4, 28);
    wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(donnees.length, 40);
    this.wav = path.join(this.dossier, 'son.wav');
    fs.writeFileSync(this.wav, Buffer.concat([wav, donnees]));
    fs.unlinkSync(path.join(this.dossier, 'son.raw'));
  }
}

// Un PNG à palette (320x200), écrit tout de suite : le moteur ne rend pas la main pendant la capture.
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c; });
function pngIndexe(indices, palette) {
  const bloc = (type, corps) => {
    const t = Buffer.from(type, 'ascii'), taille = Buffer.alloc(4), crc = Buffer.alloc(4);
    taille.writeUInt32BE(corps.length);
    let c = -1;
    for (const b of t) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
    for (const b of corps) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8);
    crc.writeUInt32BE((c ^ -1) >>> 0);
    return Buffer.concat([taille, t, corps, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(320, 0); ihdr.writeUInt32BE(200, 4); ihdr[8] = 8; ihdr[9] = 3;
  const plte = Buffer.alloc(768);
  for (let k = 0; k < 768; k++) plte[k] = (palette[k] << 2 | palette[k] >> 4) & 0xFF;
  const brut = Buffer.alloc(321 * 200);
  for (let y = 0; y < 200; y++) { brut[y * 321] = 0; indices.copy(brut, y * 321 + 1, y * 320, (y + 1) * 320); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('PLTE', plte),
    bloc('IDAT', zlib.deflateSync(brut, { level: 1 })), bloc('IEND', Buffer.alloc(0))]);
}

// Encoder un segment [debut, fin] (µs virtuelles) d'une capture en mp4.
function encoder(capture, debut, fin, sortie) {
  const images = capture.images.filter((i) => i.us > debut && i.us <= fin);
  if (images.length < 2) return 0;
  const liste = [];
  images.forEach((i, k) => {
    const suivante = k + 1 < images.length ? images[k + 1].us : fin;
    liste.push(`file '${i.fichier.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`, `duration ${((suivante - i.us) / 1e6).toFixed(6)}`);
  });
  liste.push(`file '${images[images.length - 1].fichier.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`);   // (le dernier, répété : la règle du démultiplexeur)
  const fichierListe = path.join(capture.dossier, path.basename(sortie, '.mp4') + '.txt');
  fs.writeFileSync(fichierListe, liste.join('\n') + '\n');
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  execFileSync(ENCODEUR, ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', fichierListe,
    '-ss', (debut / 1e6).toFixed(6), '-to', (fin / 1e6).toFixed(6), '-i', capture.wav,
    '-map', '0:v:0', '-map', '1:a:0',
    '-vf', 'scale=640:400:flags=neighbor,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-threads', '4', '-vsync', 'vfr',
    '-c:a', 'aac', '-b:a', '160k', '-ar', String(FREQUENCE_SON), '-movflags', '+faststart', sortie], { stdio: 'inherit' });
  return images.length;
}

const fichiersDuJeu = (courant) => new FichiersNode({
  'C:/THEME.CD/DATA/': [path.join(INSTALL, 'DATA'), path.join(CD, 'GAME', 'DATA')],
  'C:/THEME.CD/SAVE/': [path.join(INSTALL, 'SAVE'), path.join(CD, 'GAME', 'SAVE')],
  'D:/GAME/': path.join(CD, 'GAME'), 'C:/THEME.CD/': INSTALL,
}, courant);

const films = { attractions: {}, enBoucle: {} };
const SORTIE = path.join(ASSETS, 'films');
let t0 = Date.now();

// --- L'introduction -------------------------------------------------------------------------------
if (introduction && (!SEULEMENT || SEULEMENT === 'introduction')) {
  const capture = new Capture('introduction');
  const m = new Machine({
    image: introduction, T: creerProcesseur(), fichiers: fichiersDuJeu('D:/GAME/'), journal: () => {},
    ligneCommande: '-C:/THEME.CD', son: {}, adresses: { ...ADRESSES_DE_MAIN, image: 0 },
    programme: (machine, t) => poserLIntroduction(machine, t),
  });
  m.son.surSortie = (bloc) => capture.son(bloc);
  capture.active = true;
  m.observateurs.push((x) => capture.observer(x));
  let fin = 0;
  try { m.demarrer(); } catch (e) { if (!(e instanceof Sortie) && !(e instanceof Arret)) throw e; }
  fin = m.us;
  await capture.finir();
  journal(`introduction : ${capture.images.length} images sur ${(fin / 1e6).toFixed(1)} s, son ${(capture.trames / FREQUENCE_SON).toFixed(1)} s (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  const sortie = path.join(SORTIE, 'introduction.mp4');
  if (encoder(capture, 0, fin, sortie)) films.introduction = 'films/introduction.mp4';
}

// --- Les films des attractions et de la partie gagnée --------------------------------------------
if (!SEULEMENT || SEULEMENT === 'attractions' || SEULEMENT === 'gagnee') {
  t0 = Date.now();
  const capture = new Capture('attractions');
  const T = creerProcesseur();
  const m = new Machine({
    image: programme, T, fichiers: fichiersDuJeu('C:/THEME.CD/'), journal: () => {},
    ligneCommande: '-cD:/game/ -dC:/THEME.CD/ -l4', son: {},
    programme: (machine, t) => poserLeProgramme(machine, t),
  });
  m.son.surSortie = (bloc) => capture.son(bloc);
  m.observateurs.push((x) => capture.observer(x));
  // Le film en cours : l'appel de 0x5C04F, borné dans le temps.
  const segments = [];
  let courant = null;
  const anciennes = m.installerRemplacements.bind(m);
  m.installerRemplacements = () => {
    anciennes();
    const original = T.fonction(JOUER_LE_FILM);
    T.remplacer(JOUER_LE_FILM, () => {
      const argument = (k) => m.dv.getUint32((T.R.esp + 4 + 4 * k) >>> 0, true);
      courant = { genre: argument(0) & 0xFF, attraction: argument(1) & 0xFF, debut: m.us, fin: null };
      capture.active = true;
      original();
      courant.fin = m.us;
      capture.active = false;
      segments.push(courant);
      courant = null;
    });
  };
  // Un film que le jeu rejoue jusqu'à un clic ou une touche (attractions 8, 9, 16 : la table
  // 0xBA0FF) : une passe suffit, la page le rejouera en boucle ; il est arrêté par un clic (et une
  // touche) dès que sa première image revient. Et nul film ne dure plus de cinq minutes : au-delà,
  // l'outil s'arrête plutôt que de tourner sans fin.
  // (Le numéro d'image garde d'abord la valeur du film précédent, puis passe à 0 : seule une baisse
  // venant après une hausse, dans le même appel, est un rejeu.)
  let imagePrecedente = -1, vuMonter = false, clicTenu = false;
  m.observateurs.push((x) => {
    if (!courant) {
      if (clicTenu) { x.boutonsSouris(0); x.toucheRelachee(ESPACE); clicTenu = false; }
      imagePrecedente = -1;
      vuMonter = false;
      return;
    }
    if (x.us - courant.debut > 300e6) throw new Arret(`le film de l'attraction ${courant.attraction} ne finit pas`);
    const image = x.dv.getUint16(IMAGE_DU_FILM, true);
    if (imagePrecedente >= 0 && image > imagePrecedente) vuMonter = true;
    if (vuMonter && image < imagePrecedente && !clicTenu) {
      courant.boucle = true;
      x.boutonsSouris(1);
      x.toucheAppuyee(ESPACE, 32);
      clicTenu = true;
    }
    imagePrecedente = image;
  });
  // L'entrée dans le parc : l'écran titre, le nouveau propriétaire DEMO, R pour le 640x480, comme
  // les scénarios de l'atelier ; puis, entre deux images du parc, chaque film.
  const evenements = [
    { t: 3, souris: [600, 380, 0] }, { t: 3.15, souris: [600, 380, 1] }, { t: 3.35, souris: [600, 380, 0] },
    { t: 5.024, touche: 32, ascii: 68 }, { t: 5.158, relache: 32 }, { t: 5.324, touche: 18, ascii: 69 }, { t: 5.458, relache: 18 },
    { t: 5.624, touche: 50, ascii: 77 }, { t: 5.758, relache: 50 }, { t: 5.924, touche: 24, ascii: 79 }, { t: 6.024, relache: 24 },
    { t: 6.824, touche: 28, ascii: 13 }, { t: 6.924, relache: 28 }, { t: 9.524, touche: 61 }, { t: 9.624, relache: 61 },
    { t: 13.024, touche: 19, ascii: 82 }, { t: 13.124, relache: 19 },
  ];
  const appelerJeu = (adresse, ...a) => {
    const R = T.R, sauve = { ...R };
    let esp = R.esp;
    for (const v of [...a].reverse()) { esp -= 4; m.w32(esp, v); }
    esp -= 4; m.w32(esp, 0xFFFFFFF0);
    R.esp = esp;
    T.appeler(adresse);
    Object.assign(R, sauve);
  };
  function* programmeDesFilms() {
    if (SEULEMENT !== 'gagnee') {
      for (let a = 0; a < ATTRACTIONS; a++) { appelerJeu(JOUER_LE_FILM, 2, a); yield 500000; }
    }
    if (SEULEMENT !== 'attractions') { appelerJeu(JOUER_LE_FILM, 1, 0); yield 500000; }
  }
  let deroulement = null, prochain = 0, dansLeParcDepuis = null, enCours = false;
  m.observateurs.push((x) => {
    if (enCours) return;             // (un film joue : l'appel avance le temps, les observateurs passent)
    while (evenements.length && evenements[0].t * 1e6 <= x.us) {
      const e = evenements.shift();
      if (e.souris) { x.deplacerSouris(e.souris[0], e.souris[1]); x.boutonsSouris(e.souris[2] || 0); }
      if (e.touche !== undefined) x.toucheAppuyee(e.touche, e.ascii || 0);
      if (e.relache !== undefined) x.toucheRelachee(e.relache);
    }
    if (evenements.length || x.enInterruption || x.us < prochain) return;
    if (!deroulement) {
      // dans le parc (l'écran 0), en 640x480, depuis deux secondes
      const dansLeParc = x.dv.getUint16(ECRAN_COURANT, true) === 0 && x.video.mode !== MODE_13H;
      if (!dansLeParc) { dansLeParcDepuis = null; if (x.us > 90e6) throw new Arret('le parc ne vient pas'); return; }
      if (dansLeParcDepuis === null) { dansLeParcDepuis = x.us; return; }
      if (x.us - dansLeParcDepuis < 2e6) return;
      journal(`dans le parc à ${(x.us / 1e6).toFixed(1)} s virtuelles ; les films...`);
      deroulement = programmeDesFilms();
    }
    enCours = true;
    const r = deroulement.next();
    enCours = false;
    if (r.done) throw new Arret('fin des films');
    prochain = x.us + r.value;
  });
  try { m.demarrer(); } catch (e) { if (!(e instanceof Sortie) && !(e instanceof Arret)) throw e; journal(e.message); }
  await capture.finir();
  journal(`${segments.length} appels, ${capture.images.length} images, son ${(capture.trames / FREQUENCE_SON).toFixed(1)} s pour ${(m.us / 1e6).toFixed(1)} s virtuelles (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  for (const s of segments) {
    const nom = s.genre === 1 ? 'partie-gagnee' : `attraction-${String(s.attraction).padStart(2, '0')}`;
    const n = encoder(capture, s.debut, s.fin, path.join(SORTIE, nom + '.mp4'));
    if (!n) continue;
    if (s.genre === 1) films.partieGagnee = `films/${nom}.mp4`; else films.attractions[s.attraction] = `films/${nom}.mp4`;
    if (s.boucle) { films.enBoucle = films.enBoucle || {}; films.enBoucle[s.attraction] = true; }
    journal(`${nom} : ${n} images, ${((s.fin - s.debut) / 1e6).toFixed(1)} s${s.boucle ? ', rejoué en boucle par le jeu' : ''}`);
  }
}

// --- Les assets -----------------------------------------------------------------------------------
// L'index note les mp4 ; les films FLC quittent donnees/ (sauf --garder-flc). Une extraction refaite
// (extraire-jeu.mjs) garde les mp4 et ne remet pas les FLC.
index.films = { ...(index.films || {}), ...films, attractions: { ...(index.films?.attractions || {}), ...films.attractions },
  enBoucle: { ...(index.films?.enBoucle || {}), ...films.enBoucle } };
index.films.convertis = true;
if (!GARDER_FLC) {
  const existe = (f) => f && fs.existsSync(path.join(ASSETS, ...f.split('/')));
  for (const chemin of filmsRemplaces(index.films, existe)) {
    try { fs.unlinkSync(path.join(ASSETS, ...index.films.bruts[chemin].split('/'))); } catch { /* déjà parti */ }
    delete index.donnees[chemin];
    delete index.films.bruts[chemin];
  }
}
fs.writeFileSync(path.join(ASSETS, 'index.json'), JSON.stringify(index, null, 1));
fs.rmSync(TRAVAIL, { recursive: true, force: true });
const n = (films.introduction ? 1 : 0) + Object.keys(films.attractions).length + (films.partieGagnee ? 1 : 0);
journal(`${n} films en mp4 dans ${path.relative(RACINE, SORTIE)}`);
