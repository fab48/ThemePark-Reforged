// Serveur local du jeu dans le navigateur.
//
// Le jeu tourne dans un Web Worker qui partage sa memoire d'image et d'entrees avec la page
// (SharedArrayBuffer) : il faut donc servir la page avec l'isolation d'origine (en-tetes COOP et
// COEP). Le serveur sert aussi :
//   GET  /assets/...                     les assets du jeu (assets/, moteur/hote/assets-du-jeu.js) : index.json,
//                                        programme/, images/, sons/, textes/, donnees/, films/... ; les gros
//                                        fichiers sont lus par parties (Range)
//   GET  /sauvegardes/index.json         les parties que le serveur gardait autrefois, dans son dossier
//   GET  /sauvegardes/<chemin>           d'installation, et l'une d'elles : en lecture seule, pour que la
//                                        page les reprenne une fois (moteur/web/donnees.js). Les
//                                        sauvegardes vivent dans le navigateur ; le serveur n'écrit rien.
//   GET  /assets/sons/index.json         le manifeste des sons remplacés (moteur/web/fichiers-des-sons.js),
//                                        fait à la demande d'après assets/sons/ : un son posé à côté de son
//                                        original (CASH.ogg près de CASH.wav) est pris au rechargement
//   GET  /animations/rendu.json          les animations cuites importées (assets/animations/import/rendu.json,
//                                        importer-animations.mjs ; moteur/jeu/animations-intercalees.js)
//   GET  /reentrant/...                  le même site, avec le moteur réentrant (moteur/node/reentrer.mjs,
//                                        écrit dans travail/reentrant/moteur/) à la place de moteur/jeu et
//                                        moteur/hote : la page locale, où le moteur tourne dans le fil de la
//                                        page comme dans le fichier unique (moteur/web/local.html) ;
//                                        /local y mène
//
// Sans assets (assets/index.json), le serveur les extrait au demarrage depuis le CD deroule dans jeu/
// (moteur/node/extraire-jeu.mjs fait de meme, a la demande). Le moteur est le moteur autonome : le code
// lisible seul, sans transcription ni MAIN.EXE (moteur/web/travailleur.js).
//
// Usage : node moteur/node/serveur.mjs [port] [ancien dossier d'installation]      puis http://localhost:8123/

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { IMPORT as IMPORT_ANIMATIONS } from './animations-fichiers.mjs';
import { sourceDuCD, extraire } from './extraire-jeu.mjs';
import { leManifesteDesSons } from './compagnons.mjs';
import { MANIFESTE_DES_SONS } from '../hote/distribution.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');
const PORT = parseInt(process.argv[2] || '8123', 10);
const CD = path.join(RACINE, 'jeu');
const ASSETS = path.join(RACINE, 'assets');
// L'ancien dossier d'installation (sauvegardes, réglages), lu seulement pour la reprise :
// travail/c/THEME.CD, ou celui que donne le second argument — un dossier à part pour les essais.
const INSTALL = process.argv[3] ? path.resolve(process.argv[3]) : path.join(RACINE, 'travail', 'c', 'THEME.CD');
// Le moteur réentrant (moteur/node/reentrer.mjs) : ses jeu/ et hote/, servis sous /reentrant/.
const REENTRANT = path.join(RACINE, 'travail', 'reentrant', 'moteur');

// Les assets, extraits du CD déroulé (jeu/) s'ils manquent.
if (!fs.existsSync(path.join(ASSETS, 'index.json'))) {
  if (!fs.existsSync(path.join(CD, 'GAME', 'MAIN.EXE'))) {
    console.error('Ni assets du jeu (assets/index.json), ni CD déroulé (jeu/GAME) : voir le README, « Mise en route ».');
    process.exit(1);
  }
  await extraire(await sourceDuCD(CD), ASSETS, (s) => console.log('assets :', s));
}

// Un chemin sous un dossier, sans en sortir, en retrouvant la casse réelle des noms (le jeu écrit
// FAB.g0, le disque garde FAB.G0) ; null s'il n'existe pas.
function dansLeDossier(dossier, relatif) {
  const parties = relatif.split('/').filter(Boolean);
  if (parties.some((p) => p === '..' || p.includes('\\') || p.includes(':'))) return null;
  let c = dossier;
  for (const p of parties) {
    const trouve = fs.existsSync(c) && fs.statSync(c).isDirectory()
      ? fs.readdirSync(c).find((f) => f.toUpperCase() === p.toUpperCase()) : undefined;
    if (trouve) c = path.join(c, trouve);
    else return null;
  }
  return c;
}

// Les fichiers de l'installation, par leur chemin relatif (en majuscules), avec leur taille : ceux de
// sa racine et de SAVE/, les seuls que le jeu lit (les autres dossiers sont des essais).
function fichiersDeLInstallation() {
  const res = {};
  const parcourir = (d, prefixe) => {
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d)) {
      const c = path.join(d, f), cle = prefixe + f.toUpperCase();
      if (fs.statSync(c).isDirectory()) { if (cle === 'SAVE') parcourir(c, cle + '/'); } else res[cle] = fs.statSync(c).size;
    }
  };
  parcourir(INSTALL, '');
  return res;
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
  '.aac': 'audio/aac', '.webm': 'audio/webm', '.mp4': 'video/mp4', '.mid': 'audio/midi', '.txt': 'text/plain; charset=utf-8' };

// Un fichier, entier ou par partie (Range : bytes=a-b).
function envoyerUnFichier(req, res, fichier, type = TYPES[path.extname(fichier).toLowerCase()] || 'application/octet-stream') {
  const taille = fs.statSync(fichier).size;
  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  const plage = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  if (!plage) { res.setHeader('Content-Length', taille); fs.createReadStream(fichier).pipe(res); return; }
  const debut = parseInt(plage[1], 10), fin = Math.min(taille - 1, plage[2] ? parseInt(plage[2], 10) : taille - 1);
  if (debut >= taille || fin < debut) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${taille}`); res.end(); return; }
  res.statusCode = 206;
  res.setHeader('Content-Range', `bytes ${debut}-${fin}/${taille}`);
  res.setHeader('Content-Length', fin - debut + 1);
  fs.createReadStream(fichier, { start: debut, end: fin }).pipe(res);
}

http.createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, 'http://localhost');
  let chemin = decodeURIComponent(url.pathname);
  // (sous /reentrant/, le même site, le moteur réentrant à la place de moteur/jeu et moteur/hote)
  const reentrant = chemin.startsWith('/reentrant/');
  if (reentrant) chemin = chemin.slice('/reentrant'.length);
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; res.end(); return; }
    // le manifeste des sons remplacés, fait à la demande (voir en tête)
    if (chemin === '/assets/' + MANIFESTE_DES_SONS) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(leManifesteDesSons(ASSETS)));
      return;
    }
    // les assets du jeu
    if (chemin.startsWith('/assets/')) {
      const f = dansLeDossier(ASSETS, chemin.slice('/assets/'.length));
      if (!f || !fs.statSync(f).isFile()) { res.statusCode = 404; res.end(); return; }
      envoyerUnFichier(req, res, f);
      return;
    }
    // les parties d'autrefois, en lecture seule, pour la reprise (voir en tête)
    if (chemin === '/sauvegardes/index.json') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(fichiersDeLInstallation()));
      return;
    }
    if (chemin.startsWith('/sauvegardes/')) {
      const f = dansLeDossier(INSTALL, chemin.slice('/sauvegardes/'.length));
      if (!f || !fs.statSync(f).isFile()) { res.statusCode = 404; res.end(); return; }
      envoyerUnFichier(req, res, f, 'application/octet-stream');
      return;
    }
    // animations cuites (moteur/jeu/animations-intercalees.js) : écrites par
    // moteur/node/importer-animations.mjs ; 404 s'il n'y en a pas (l'attraction reste celle de 1994)
    if (chemin === '/animations/rendu.json') {
      const f = path.join(IMPORT_ANIMATIONS, 'rendu.json');
      if (!fs.existsSync(f)) { res.statusCode = 404; res.end(); return; }
      envoyerUnFichier(req, res, f);
      return;
    }
    // la page et le moteur
    if (chemin === '/') { res.statusCode = 302; res.setHeader('Location', '/moteur/web/index.html'); res.end(); return; }
    if (chemin === '/local' && !reentrant) { res.statusCode = 302; res.setHeader('Location', '/reentrant/moteur/web/local.html'); res.end(); return; }
    if (reentrant && /^\/moteur\/(jeu|hote)\//.test(chemin)) {
      const f = path.normalize(path.join(REENTRANT, chemin.slice('/moteur'.length)));
      if (!f.startsWith(REENTRANT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
        res.statusCode = 404; res.end('introuvable (le moteur réentrant : node moteur/node/reentrer.mjs)'); return;
      }
      envoyerUnFichier(req, res, f);
      return;
    }
    const local = path.normalize(path.join(RACINE, chemin));
    if (!local.startsWith(RACINE) || !/^[\\/]moteur[\\/](web|hote|jeu)[\\/]/.test(local.slice(RACINE.length))
      || !fs.existsSync(local) || !fs.statSync(local).isFile()) {
      res.statusCode = 404; res.end('introuvable'); return;
    }
    envoyerUnFichier(req, res, local);
  } catch (e) {
    res.statusCode = 500; res.end(String(e));
  }
}).listen(PORT, () => console.log(`Theme Park : http://localhost:${PORT}/`));
