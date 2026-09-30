// Extraire les assets du jeu (moteur/hote/assets-du-jeu.js) depuis le CD de Theme Park : les données
// de MAIN.EXE et d'INTRO.EXE sans leur code, les images en PNG, les bruitages en WAV, les morceaux en
// HMP et en MIDI, les textes en JSON, le reste tel quel. Puis vérifie que les fichiers du CD se
// refont, octet pour octet, depuis ces assets : c'est ce que fait le moteur avant de lancer le jeu.
//
// Usage : node moteur/node/extraire-jeu.mjs [source] [destination] [--sans-verification]
//   source       l'image ISO du CD (THEMECD.ISO), ou le dossier où elle a été déroulée (celui qui
//                contient GAME/) ; par défaut le dossier jeu/, à la racine
//   destination  par défaut assets/
//
// Les films du CD (FLC) restent tels quels dans donnees/ : moteur/node/extraire-films.mjs les convertit
// en mp4. Le serveur local (serveur.mjs) fait cette extraction au premier lancement s'il trouve jeu/
// et pas d'assets ; la distribution (construire-distribution.mjs) embarque les assets.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { RACINE } from './partie.mjs';
import { lireISO } from '../hote/iso9660.js';
import { preparerLesAssets, composerLesFichiers, composerLeProgramme, filmsRemplaces, RETENU, FILM } from '../hote/assets-du-jeu.js';
import { extraireLImage, ecrireLImage } from '../hote/image-programme.js';
import { extraireLImageDeLIntro } from '../hote/image-intro.js';
import { PILOTES, fabriquerLePilote } from '../hote/pilotes-hmi.js';
import { BANQUES_DES_POLICES } from '../hote/polices.js';
import { MANIFESTE_DES_TEXTES } from '../hote/langues.js';

// Le CD : { chemins, lire }, depuis son image ISO ou depuis un dossier.
export async function sourceDuCD(source) {
  if (!fs.existsSync(source)) throw new Error(`source introuvable : ${source}`);
  if (fs.statSync(source).isDirectory()) {
    const chemins = [], reels = new Map();
    const parcourir = (d, prefixe) => {
      for (const f of fs.readdirSync(d)) {
        const c = path.join(d, f), cle = prefixe + f.toUpperCase();
        if (fs.statSync(c).isDirectory()) parcourir(c, cle + '/');
        else { chemins.push(cle); reels.set(cle, c); }
      }
    };
    parcourir(source, '');
    return { chemins, lire: async (c) => new Uint8Array(fs.readFileSync(reels.get(c))) };
  }
  const fd = fs.openSync(source, 'r');
  const lire = (position, taille) => {
    const b = Buffer.alloc(taille);
    fs.readSync(fd, b, 0, taille, position);
    return new Uint8Array(b.buffer, b.byteOffset, taille);
  };
  const iso = await lireISO(lire);
  return { chemins: [...iso.fichiers.keys()], lire: (c) => iso.lireFichier(c) };
}

const deflate = (octets) => new Uint8Array(zlib.deflateSync(octets, { level: 9 }));
const inflate = (octets) => new Uint8Array(zlib.inflateSync(octets));

// Extraire les assets dans `destination` ; rend l'index. Des films déjà convertis en mp4
// (extraire-films.mjs) sont gardés : les films FLC ne sont pas remis.
export async function extraire(cd, destination, journal = () => {}) {
  const fichierIndex = path.join(destination, 'index.json');
  const precedent = fs.existsSync(fichierIndex) ? JSON.parse(fs.readFileSync(fichierIndex, 'utf8')) : null;
  // Les tables du programme sont refaites entières (une zone renommée ne doit pas laisser son ancien
  // fichier) ; ce que les extractions d'avant écrivaient et qui n'est plus un asset part : les images
  // binaires du programme (programme.bin, intro.bin) et les bibliothèques de pilotes de HMI.
  fs.rmSync(path.join(destination, 'programme'), { recursive: true, force: true });
  for (const f of ['donnees/HMIDET.386', 'donnees/HMIDRV.386']) fs.rmSync(path.join(destination, ...f.split('/')), { force: true });
  // Les polices sont refaites entières (images/polices/) ; les banques qui ne portent que des polices
  // (MFONT-0) n'ont plus de planche dans images/banques/ : leurs images sont dans celles des polices.
  fs.rmSync(path.join(destination, 'images', 'polices'), { recursive: true, force: true });
  for (const n of Object.keys(BANQUES_DES_POLICES)) {
    for (const e of ['png', 'json']) fs.rmSync(path.join(destination, 'images', 'banques', `${n}.${e}`), { force: true });
  }
  // Les langues ajoutées au manifeste des textes (celles qui ne viennent pas du CD) y sont gardées.
  const fichierDesTextes = path.join(destination, ...MANIFESTE_DES_TEXTES.split('/'));
  const languesAjoutees = [];
  if (fs.existsSync(fichierDesTextes)) {
    try {
      const m = JSON.parse(fs.readFileSync(fichierDesTextes, 'utf8'));
      for (const l of m.langues || []) if (!/^textes\/LANG\d\.json$/.test(l.fichier)) languesAjoutees.push(l);
    } catch (e) { journal(`${MANIFESTE_DES_TEXTES} illisible, refait d'après le CD (${e.message})`); }
  }
  let fichiers = 0, octets = 0;
  const index = await preparerLesAssets(cd, async (chemin, contenu) => {
    const dest = path.join(destination, ...chemin.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, contenu);
    fichiers++;
    octets += fs.statSync(dest).size;
  }, { deflate }, journal);
  journal(`${fichiers} fichiers écrits, ${(octets / 1048576).toFixed(1)} Mo`);
  if (languesAjoutees.length && fs.existsSync(fichierDesTextes)) {
    const m = JSON.parse(fs.readFileSync(fichierDesTextes, 'utf8'));
    m.langues.push(...languesAjoutees);
    fs.writeFileSync(fichierDesTextes, JSON.stringify(m, null, 1) + '\n');
    journal(`langues ajoutées, gardées dans ${MANIFESTE_DES_TEXTES} : ${languesAjoutees.map((l) => `${l.nom} (${l.fichier})`).join(', ')}`);
  }
  // Les niveaux d'origine des musiques (mesurés par moteur/node/musiques.mjs, que l'extraction ne fait
  // pas) : gardés.
  let niveauxGardes = false;
  for (const [nom, b] of Object.entries((precedent && precedent.musiques) || {})) {
    const neuve = index.musiques[nom];
    if (neuve && Array.isArray(b.niveaux) && b.niveaux.length === neuve.entrees.length) { neuve.niveaux = b.niveaux; niveauxGardes = true; }
  }
  if (niveauxGardes) fs.writeFileSync(fichierIndex, JSON.stringify(index, null, 1));
  const films = precedent && precedent.films;
  if (films && films.convertis) {
    const existe = (f) => f && fs.existsSync(path.join(destination, ...f.split('/')));
    const attractions = Object.fromEntries(Object.entries(films.attractions || {}).filter(([, f]) => existe(f)));
    const garde = { ...index.films, convertis: true, attractions, enBoucle: films.enBoucle || {} };
    if (existe(films.introduction)) garde.introduction = films.introduction;
    if (existe(films.partieGagnee)) garde.partieGagnee = films.partieGagnee;
    const remplaces = filmsRemplaces(garde, existe);
    for (const chemin of remplaces) {
      fs.unlinkSync(path.join(destination, ...garde.bruts[chemin].split('/')));
      delete index.donnees[chemin];
      delete garde.bruts[chemin];
    }
    index.films = garde;
    fs.writeFileSync(fichierIndex, JSON.stringify(index, null, 1));
    journal(`films : ${(garde.introduction ? 1 : 0) + Object.keys(attractions).length + (garde.partieGagnee ? 1 : 0)} mp4 gardés, ${remplaces.length} films FLC retirés`);
  }
  return index;
}

// Refaire les fichiers du CD depuis les assets de `destination` et les comparer au CD ; rend
// { identiques, differents: [chemins], manquants: [chemins] }.
export async function verifier(cd, destination, journal = () => {}) {
  const index = JSON.parse(fs.readFileSync(path.join(destination, 'index.json'), 'utf8'));
  const lireAsset = async (c) => new Uint8Array(fs.readFileSync(path.join(destination, ...c.split('/'))));
  const refaits = await composerLesFichiers(index, lireAsset, inflate);
  const resultat = { identiques: 0, differents: [], manquants: [], enMp4: [] };
  let total = 0;
  for (const c of cd.chemins.filter(RETENU).sort()) {
    const original = await cd.lire(c), refait = refaits.get(c);
    // (un film FLC que son mp4 remplace n'est plus refait : extraire-films.mjs l'a converti)
    if (!refait && index.films && index.films.convertis && FILM(c.slice(c.lastIndexOf('/') + 1))) { resultat.enMp4.push(c); continue; }
    if (!refait) { resultat.manquants.push(c); continue; }
    total += original.length;
    if (refait.length === original.length && Buffer.compare(Buffer.from(refait.buffer, refait.byteOffset, refait.length), Buffer.from(original.buffer, original.byteOffset, original.length)) === 0) resultat.identiques++;
    else resultat.differents.push(`${c} (${original.length} octets sur le CD, ${refait.length} refaits)`);
  }
  journal(`vérification : ${resultat.identiques} fichiers du CD refaits à l'identique depuis les assets (${(total / 1048576).toFixed(1)} Mo)`
    + (resultat.enMp4.length ? ` ; ${resultat.enMp4.length} films remplacés par leur mp4` : '')
    + (resultat.differents.length ? ` ; DIFFÉRENTS : ${resultat.differents.join(', ')}` : '')
    + (resultat.manquants.length ? ` ; MANQUANTS : ${resultat.manquants.join(', ')}` : ''));

  // Le programme et l'introduction : leurs images, refaites des tables lisibles, contre celles que
  // donnent MAIN.EXE et INTRO.EXE ; et contre les programme.bin et intro.bin des assets d'avant les
  // tables, si une copie en est gardée (travail/programme/).
  const egaux = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.length), Buffer.from(b.buffer, b.byteOffset, b.length)) === 0;
  const image = await extraireLImage(await cd.lire('GAME/MAIN.EXE'));
  const parties = [['programme', 'MAIN.EXE', 'programme.bin', ecrireLImage(image)]];
  if (index.introduction) parties.push(['introduction', 'INTRO.EXE', 'intro.bin', ecrireLImage(await extraireLImageDeLIntro(await cd.lire('GAME/INTRO.EXE'), image))]);
  for (const [partie, exe, bin, attendu] of parties) {
    const refait = await composerLeProgramme(index, lireAsset, partie);
    const reference = path.join(RACINE, 'travail', 'programme', bin);
    const ancien = fs.existsSync(reference) ? new Uint8Array(fs.readFileSync(reference)) : null;
    const bon = egaux(refait, attendu) && (!ancien || egaux(refait, ancien));
    if (!bon) resultat.differents.push(`${partie} (${refait.length} octets refaits des tables, ${attendu.length} tirés de ${exe})`);
    journal(`vérification : ${partie} refait des tables lisibles, ${refait.length} octets, ${bon ? 'identique' : 'DIFFÉRENT'} à l'image tirée de ${exe}`
      + (ancien ? ` et à l'ancien ${bin} (travail/programme/)` : ''));
  }

  // Les bibliothèques de pilotes de HMI ne sont pas comparées octet pour octet (elles ne sont pas
  // RETENU) : l'hôte en refait des fichiers virtuels, dont le code des modules est à zéro. On vérifie
  // qu'ils en ont la forme : la taille, et chaque octet hors du code des modules.
  const pilotes = index.pilotes ? JSON.parse(fs.readFileSync(path.join(destination, ...index.pilotes.split('/')), 'utf8')) : {};
  for (const c of PILOTES) {
    if (!cd.chemins.includes(c)) continue;
    const original = await cd.lire(c);
    if (!pilotes[c]) { resultat.manquants.push(c); continue; }
    const refait = fabriquerLePilote(pilotes[c]);
    let p = pilotes[c].enTete.taille, bon = refait.length === original.length && egaux(refait.subarray(0, p), original.subarray(0, p));
    for (const m of pilotes[c].modules) {
      bon = bon && egaux(refait.subarray(p, p + 0x30), original.subarray(p, p + 0x30));
      p += 0x30 + m.taille;
    }
    if (!bon) resultat.differents.push(`${c} (en-têtes)`);
    journal(`vérification : ${c.slice(5)} non comparé octet pour octet (un fichier virtuel de l'hôte, le code de ses `
      + `${pilotes[c].modules.length} modules à zéro) ; ses en-têtes : ${bon ? 'identiques' : 'DIFFÉRENTS'}`);
  }
  return resultat;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const source = path.resolve(args[0] || path.join(RACINE, 'jeu'));
  const destination = path.resolve(args[1] || path.join(RACINE, 'assets'));
  const t0 = Date.now();
  const cd = await sourceDuCD(source);
  await extraire(cd, destination, (s) => console.log(s));
  if (!process.argv.includes('--sans-verification')) {
    const r = await verifier(cd, destination, (s) => console.log(s));
    if (r.differents.length || r.manquants.length) process.exitCode = 1;
  }
  console.log(`assets écrits dans ${path.relative(RACINE, destination) || destination} en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
