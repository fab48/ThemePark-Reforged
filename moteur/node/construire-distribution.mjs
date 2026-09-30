// Construire la distribution : Theme Park en dossiers, la page et, à côté, les assets en fichiers
// ordinaires, qu'on peut modifier (le but : que quelqu'un puisse modder le jeu). Un seul produit, qui
// se sert sur un site ou par ses lanceurs, et s'ouvre aussi d'un double-clic, hors ligne, jusqu'à
// Chrome 49 et Firefox 52 :
//
//   theme-park.html          la page
//   moteur/                  le moteur et la page assemblés en un script : theme-park.js (la syntaxe des
//                            sources), theme-park-es2015.js (abaissé, pour les vieux navigateurs)
//   images/ sons/ films/     les assets, rangés par moteur/hote/distribution.js (le seul endroit qui dit
//   animations/ donnees/     où va chaque chemin de assets/index.json) ; et dans chaque dossier que le
//                            jeu lit, son compagnon (images/images.js...) : les mêmes fichiers en base 64,
//                            pour la page ouverte d'un double-clic (moteur/node/compagnons.mjs)
//   refaire.cmd, lanceur/    refaire les compagnons après une modification (lanceur/refaire.ps1) ;
//   Theme Park.cmd,          servir le dossier et ouvrir le navigateur (lanceur/serveur.ps1 sous
//   theme-park.sh            Windows, python3 ailleurs)
//   LISEZMOI.txt
//
// Pourquoi le moteur réentrant, dans le fil de la page. Ouverte depuis le disque, une page n'a ni
// isolation d'origine (donc ni mémoire partagée avec un Worker), ni modules, ni fetch ; les
// navigateurs de 2016-2017 ni Atomics, ni AudioWorklet, ni WebGL2, ni async/await. La distribution
// prend donc :
//  - le moteur réentrant (moteur/node/reentrer.mjs), qui tourne dans le fil de la page et lui rend la
//    main à chaque image (moteur/web/moteur-du-jeu.js, `fil: 'page'`) ; servie, la page n'a donc plus
//    besoin des en-têtes COOP et COEP (ni du service worker isolation.js) ;
//  - la page elle-même (principal.js et ses modules), avec environnement-distribution.js à la place
//    d'environnement.js : les assets viennent des dossiers (servie) ou des compagnons (file://) ;
//  - le tout réuni en un seul script classique (moteur/node/assembler.mjs, avec des substitutions :
//    les modules de moteur/jeu et moteur/hote pris dans le moteur réentrant), ramené à l'ES2015
//    (moteur/node/abaisser.mjs, qui re-analyse la sortie en ES2015).
// Le mode Worker (moteur/web/index.html, servi par moteur/node/serveur.mjs avec l'isolation d'origine)
// reste celui du dépôt, pour le développement.
//
// Usage : node moteur/node/construire-distribution.mjs [--sans-reentrer] [--destination dossier]
//   --sans-reentrer   ne pas refaire le moteur réentrant (travail/reentrant/moteur/)
//   --destination     site/ par défaut (hors du dépôt : il se reconstruit ; son contenu est vidé)
// L'analyseur est celui de Node (acorn, dans ses modules internes) : l'outil se relance lui-même avec
// --expose-internals s'il le faut.

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');
try {
  createRequire(import.meta.url)('internal/deps/acorn/acorn/dist/acorn');
} catch {
  const r = spawnSync(process.execPath, ['--expose-internals', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const { assembler } = await import('./assembler.mjs');
const { abaisser } = await import('./abaisser.mjs');
const { IMPORT: IMPORT_ANIMATIONS } = await import('./animations-fichiers.mjs');
const { cheminDansLaDistribution, RENDU } = await import('../hote/distribution.js');
const { ecrireLesCompagnons } = await import('./compagnons.mjs');

const args = process.argv.slice(2);
const opt = (nom, def) => { const k = args.indexOf(nom); return k >= 0 ? args[k + 1] : def; };
const DESTINATION = path.resolve(RACINE, opt('--destination', 'site'));
const ASSETS = path.join(RACINE, 'assets');
const WEB = path.join(RACINE, 'moteur', 'web');
const LANCEUR = path.join(RACINE, 'lanceur');
const REENTRANT = path.join(RACINE, 'travail', 'reentrant', 'moteur');
const Mo = (n) => `${(n / 1048576).toFixed(2)} Mo`;
const temps = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)} s`;

if (!fs.existsSync(path.join(ASSETS, 'index.json'))) {
  console.error("Pas d'assets (assets/index.json) : voir le README, « Mise en route » (node moteur/node/extraire-jeu.mjs).");
  process.exit(1);
}
// (la destination est vidée : jamais le dépôt, ni un dossier qui le contient)
if (DESTINATION === RACINE || RACINE.startsWith(DESTINATION + path.sep) || DESTINATION === path.parse(DESTINATION).root) {
  console.error(`${DESTINATION} : destination refusée (elle serait vidée)`);
  process.exit(1);
}

// --- 1. le moteur réentrant -----------------------------------------------------------------------------
if (!args.includes('--sans-reentrer')) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--expose-internals', path.join(ICI, 'reentrer.mjs')], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(1); }
  console.log(`moteur réentrant refait (${temps(t0)}) : ${(/total : .*/.exec(r.stdout) || [''])[0]}`);
}
if (!fs.existsSync(path.join(REENTRANT, 'jeu', 'index.js'))) {
  console.error('Le moteur réentrant manque : node moteur/node/reentrer.mjs');
  process.exit(1);
}

// --- 2. le script : la page assemblée, le moteur réentrant à la place du moteur, abaissée en ES2015 ------
let t0 = Date.now();
const MOTEUR = path.join(RACINE, 'moteur') + path.sep;
const substitutions = (chemin) => {
  if (chemin === path.join(WEB, 'environnement.js')) return path.join(WEB, 'environnement-distribution.js');
  for (const partie of ['jeu', 'hote']) {
    if (chemin.startsWith(MOTEUR + partie + path.sep)) {
      const autre = path.join(REENTRANT, partie, chemin.slice((MOTEUR + partie + path.sep).length));
      if (!fs.existsSync(autre)) throw new Error(`${path.relative(RACINE, autre)} : absent du moteur réentrant (le refaire)`);
      return autre;
    }
  }
  return null;
};
// (image-programme.js ne demande `crypto` à Node que sans crypto.subtle, pour l'extraction du CD :
// jamais dans la page)
const assemble = assembler(path.join(WEB, 'principal.js'), { racine: RACINE, substitutions, remplacements: { crypto: '{}' } });
const abaisse = abaisser(assemble.code, { nom: 'theme-park-es2015.js' });
// Deux scripts, et la page prend celui que son navigateur sait lire (le chargeur, plus bas) : le
// script assemblé tel quel, dans la syntaxe des sources (ES2022), pour les navigateurs d'aujourd'hui,
// et le script abaissé en ES2015 pour les autres. L'abaissement coûte cher à certains endroits :
// `{ ...R }` devient `Object.assign({}, R)`, et la copie qui en sort, remise ensuite dans R
// (runtime.js, `servir`, à chaque service du DOS), est douze fois plus lente dans le Chrome
// d'aujourd'hui ; l'écran titre, qui relit le clavier en boucle, passait de 9 % à 45 % du temps réel.
const compte = Object.entries(abaisse.compte).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ');
console.log(`script : ${assemble.modules.length} modules, ${Mo(assemble.code.length)} (ES2022), ${Mo(abaisse.code.length)} abaissé en ES2015 (${compte}) (${temps(t0)})`);
// Le chargeur (ES5) : le script moderne si le navigateur en lit la syntaxe (celle des sources : async,
// étalement d'objet, `?.`, `??`, `**`, catch sans paramètre), sinon l'ES2015 ; `?force=es2015` dans
// l'adresse impose le second, pour l'éprouver dans un navigateur récent. Un <script src> classique :
// permis en file://, où les modules ne le sont pas.
const CHARGEUR = `<script>
(function () {
  var moderne = false;
  if (!/[?&]force=[^&#]*es2015/.test(location.search)) {
    try { new Function('async function f() { await 0; } var o = { ...{ a: 1 } }; var b = o?.a ?? 2 ** 2; try {} catch {}'); moderne = true; } catch (e) { /* ES2015 */ }
  }
  var s = document.createElement('script');
  s.src = moderne ? 'moteur/theme-park.js' : 'moteur/theme-park-es2015.js';
  s.charset = 'utf-8';
  s.onerror = function () { document.getElementById('etat').textContent = 'ERREUR : ' + s.src + ' introuvable (la page va avec son dossier moteur/)'; };
  console.log('script : ' + (moderne ? 'moderne (ES2022)' : 'abaissé en ES2015'));
  document.body.appendChild(s);
}());
</script>`;

// --- 3. la page ----------------------------------------------------------------------------------------
const modele = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(WEB, 'debogage.css'), 'utf8');
function page() {
  let html = modele;
  // (le service worker de l'isolation : inutile, le moteur tourne dans le fil de la page)
  const debutIso = html.indexOf('<script>\n// L\'isolation');
  if (debutIso < 0) throw new Error("index.html : le script de l'isolation d'origine a changé");
  html = html.slice(0, debutIso) + html.slice(html.indexOf('</script>', debutIso) + '</script>\n'.length);
  const lien = '<link rel="stylesheet" href="debogage.css">';
  const module = '<script type="module" src="principal.js"></script>';
  if (!html.includes(lien) || !html.includes(module)) throw new Error('index.html : le lien de debogage.css ou le script de la page a changé');
  // (des fonctions : un texte remplaçant qui contient « $& » serait interprété par replace)
  html = html.replace(lien, () => `<style>\n${css}</style>`);
  html = html.replace('<meta charset="utf-8">\n', () => `<meta charset="utf-8">
<!-- Theme Park, la distribution, faite par moteur/node/construire-distribution.mjs : le moteur
     réentrant et la page réunis en un script (moteur/theme-park.js, et sa version ES2015), les
     assets en fichiers ordinaires dans les dossiers voisins. Servie (Theme Park.cmd), la page lit les
     dossiers ; ouverte d'un double-clic, les compagnons (images/images.js...) : voir LISEZMOI.txt. -->
<link rel="icon" href="data:,">\n`);
  // (l'icône vide : servie, la page ne demande pas /favicon.ico, qui n'existe pas)
  html = html.replace(module, () => CHARGEUR);
  return html;
}

// --- 4. vider la destination -----------------------------------------------------------------------------
t0 = Date.now();
fs.mkdirSync(DESTINATION, { recursive: true });
for (const f of fs.readdirSync(DESTINATION)) fs.rmSync(path.join(DESTINATION, f), { recursive: true, force: true });
console.log(`${path.relative(RACINE, DESTINATION) || DESTINATION}/ vidé (${temps(t0)})`);
const ecrire = (relatif, contenu) => {
  const f = path.join(DESTINATION, ...relatif.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, contenu);
};
const copier = (source, relatif) => {
  const f = path.join(DESTINATION, ...relatif.split('/'));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.copyFileSync(source, f);
};

ecrire('theme-park.html', page());
ecrire('moteur/theme-park.js', assemble.code);
ecrire('moteur/theme-park-es2015.js', abaisse.code);

// --- 5. les assets -------------------------------------------------------------------------------------
// Le contenu de assets/ tel quel, rangé par distribution.js : chaque dossier (programme/, images/,
// sons/, films/, textes/, donnees/, parties/, et ce qui viendrait s'y ajouter), sans rien supposer de
// la forme de chacun (le programme peut être un fichier ou des tables : c'est l'inventaire qui le dit).
// Ni le CD (assets/jeu/), ni l'atelier des animations (assets/animations/) : rendu.json seul, plus bas.
// L'inventaire (assets/index.json) est ensuite parcouru, pour dire ce qu'il désigne et qui manque.
t0 = Date.now();
const index = JSON.parse(fs.readFileSync(path.join(ASSETS, 'index.json'), 'utf8'));
const HORS_DISTRIBUTION = ['jeu', 'animations'];
const aCopier = new Set(['index.json']);
const ajouterLeDossier = (relatif) => {
  for (const f of fs.readdirSync(path.join(ASSETS, ...relatif.split('/')))) {
    const c = `${relatif}/${f}`;
    if (fs.statSync(path.join(ASSETS, ...c.split('/'))).isDirectory()) ajouterLeDossier(c); else aCopier.add(c);
  }
};
for (const f of fs.readdirSync(ASSETS)) {
  if (!HORS_DISTRIBUTION.includes(f) && fs.statSync(path.join(ASSETS, f)).isDirectory()) ajouterLeDossier(f);
}
// ce que l'inventaire désigne (toute chaîne qui a la forme d'un chemin d'asset, et les
// { dossier, fichiers }) et qui manque
const manquants = [];
const designe = (v) => {
  if (!/^[\w-]+\/[\w ./-]+\.\w+$/.test(v) || v.split('/').includes('..')) return;
  if (!fs.existsSync(path.join(ASSETS, ...v.split('/')))) manquants.push(v);
};
const parcourir = (v) => {
  if (typeof v === 'string') designe(v);
  else if (Array.isArray(v)) v.forEach(parcourir);
  else if (v && typeof v === 'object') {
    for (const x of Object.values(v)) parcourir(x);
    if (typeof v.dossier === 'string' && Array.isArray(v.fichiers)) for (const f of v.fichiers) designe(`${v.dossier}/${f}`);
  }
};
parcourir(index);
let octetsDesAssets = 0;
for (const c of [...aCopier].sort()) {
  copier(path.join(ASSETS, ...c.split('/')), cheminDansLaDistribution(c));
  octetsDesAssets += fs.statSync(path.join(ASSETS, ...c.split('/'))).size;
}
console.log(`assets : ${aCopier.size} fichiers, ${Mo(octetsDesAssets)} (${temps(t0)})`);
if (manquants.length) console.log(`  l'inventaire désigne des fichiers absents de assets/ : ${manquants.join(', ')}`);
// Les animations intercalées.
const rendu = path.join(IMPORT_ANIMATIONS, 'rendu.json');
if (fs.existsSync(rendu)) copier(rendu, RENDU);
else console.log(`pas d'animations intercalées (${path.relative(RACINE, rendu)} manque)`);

// --- 6. les compagnons, les lanceurs --------------------------------------------------------------------
t0 = Date.now();
const compagnons = ecrireLesCompagnons(DESTINATION);
console.log(`compagnons : ${compagnons.map((b) => `${b.script} ${Mo(b.octets)}`).join(', ')} (${temps(t0)})`);
copier(path.join(RACINE, 'Theme Park.cmd'), 'Theme Park.cmd');
copier(path.join(RACINE, 'theme-park.sh'), 'theme-park.sh');
copier(path.join(LANCEUR, 'serveur.ps1'), 'lanceur/serveur.ps1');
copier(path.join(LANCEUR, 'refaire.ps1'), 'lanceur/refaire.ps1');
// (les .cmd en fins de ligne Windows : cmd.exe lit mal un fichier en fins de ligne Unix)
ecrire('refaire.cmd', [
  '@echo off',
  'rem Refaire les compagnons (images\\images.js, sons\\sons.js, donnees\\donnees.js, animations\\animations.js)',
  'rem d\'apres les dossiers, apres avoir modifie une image, un son... : la page ouverte d\'un double-clic',
  'rem les lit a la place des fichiers. Servie (Theme Park.cmd), elle lit les fichiers eux-memes.',
  'cd /d "%~dp0"',
  'powershell -NoProfile -ExecutionPolicy Bypass -File "lanceur\\refaire.ps1"',
  'pause',
  ''].join('\r\n'));
ecrire('LISEZMOI.txt', '﻿' + fs.readFileSync(path.join(LANCEUR, 'LISEZMOI-distribution.txt'), 'utf8'));

// --- 7. le bilan ----------------------------------------------------------------------------------------
const taille = (relatif) => {
  const f = path.join(DESTINATION, ...relatif.split('/'));
  if (!fs.statSync(f).isDirectory()) return { octets: fs.statSync(f).size, fichiers: 1 };
  let octets = 0, fichiers = 0;
  for (const x of fs.readdirSync(f)) { const t = taille(`${relatif}/${x}`); octets += t.octets; fichiers += t.fichiers; }
  return { octets, fichiers };
};
let total = 0;
console.log('');
for (const f of fs.readdirSync(DESTINATION).sort()) {
  const t = taille(f);
  total += t.octets;
  console.log(`  ${(f + (t.fichiers > 1 || fs.statSync(path.join(DESTINATION, f)).isDirectory() ? '/' : '')).padEnd(22)} ${Mo(t.octets).padStart(11)}  ${t.fichiers} fichier(s)`);
}
for (const b of compagnons) console.log(`    dont ${b.script.padEnd(26)} ${Mo(b.octets).padStart(11)}  ${b.fichiers} fichiers portés`);
console.log(`distribution écrite dans ${path.relative(RACINE, DESTINATION) || DESTINATION} : ${Mo(total)}`);
