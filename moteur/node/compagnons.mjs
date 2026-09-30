// Les compagnons de la distribution (moteur/hote/distribution.js) : pour chaque dossier que le jeu lit
// (images/, sons/, donnees/, animations/), un script qui porte ses fichiers en base 64, pour la page
// ouverte d'un double-clic (file://), qui ne peut pas lire les fichiers eux-mêmes. Et le manifeste
// des sons remplacés (sons/index.json, moteur/web/fichiers-des-sons.js), que la page, servie ou non,
// lit pour savoir quel fichier jouer à la place d'un son : elle ne peut pas lister un dossier.
//
// C'est le pendant, sous Node, de refaire.cmd (lanceur/refaire.ps1, PowerShell 5.1) : mêmes règles
// (distribution.js : COMPAGNONS, HORS_COMPAGNON, compresse), même forme de fichier. Seule la
// compression diffère d'un octet à l'autre (le gzip de Node n'est pas celui de .NET) ; la page lit
// l'un comme l'autre.
//
// Usage : node moteur/node/compagnons.mjs [dossier de la distribution, site/ par défaut]

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { COMPAGNONS, HORS_COMPAGNON, MANIFESTE_DES_SONS, compresse } from '../hote/distribution.js';
import { manifesteDesSons } from '../web/fichiers-des-sons.js';

// Les fichiers d'un dossier, récursivement, en chemins relatifs à la distribution (séparés par /),
// dans l'ordre des noms (le même que refaire.ps1 : ordinal).
function fichiersDe(distribution, dossier) {
  const res = [];
  const parcourir = (relatif) => {
    const d = path.join(distribution, ...relatif.split('/'));
    if (!fs.existsSync(d)) return;
    for (const f of fs.readdirSync(d).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
      const c = `${relatif}/${f}`;
      if (fs.statSync(path.join(d, f)).isDirectory()) parcourir(c); else res.push(c);
    }
  };
  parcourir(dossier);
  return res;
}

// Le manifeste des sons remplacés, d'après les fichiers de sons/ (et ce qu'il disait déjà, écrit à la
// main) : `racine` est la distribution, ou assets/ (le serveur local le fait à la demande). Rend
// { bruitages, musiques }.
export function leManifesteDesSons(racine) {
  let ancien = null;
  try { ancien = JSON.parse(fs.readFileSync(path.join(racine, ...MANIFESTE_DES_SONS.split('/')), 'utf8')); } catch { /* aucun */ }
  return manifesteDesSons(fichiersDe(racine, 'sons'), ancien);
}
export function ecrireLeManifesteDesSons(distribution) {
  const manifeste = leManifesteDesSons(distribution);
  fs.mkdirSync(path.join(distribution, 'sons'), { recursive: true });
  fs.writeFileSync(path.join(distribution, ...MANIFESTE_DES_SONS.split('/')), JSON.stringify(manifeste, null, 1));
  return manifeste;
}

// Écrire les compagnons ; rend [{ script, fichiers, octets }].
export function ecrireLesCompagnons(distribution) {
  ecrireLeManifesteDesSons(distribution);
  const bilan = [];
  for (const c of COMPAGNONS) {
    const lignes = [
      `// ${c.script} : les fichiers de ${c.dossier}/, en base 64, pour la page ouverte d'un double-clic (file://),`,
      "// qui ne peut pas les lire elle-même. Fait d'après le dossier : ne pas le modifier à la main, mais modifier",
      '// les fichiers du dossier, puis relancer refaire.cmd.',
      '(function (F) {',
    ];
    let n = 0;
    for (const chemin of fichiersDe(distribution, c.dossier)) {
      if (chemin === c.script || HORS_COMPAGNON.test(chemin) || !c.garder(chemin)) continue;
      const octets = fs.readFileSync(path.join(distribution, ...chemin.split('/')));
      const valeur = compresse(chemin) ? 'gzip:' + zlib.gzipSync(octets, { level: 9 }).toString('base64') : octets.toString('base64');
      lignes.push(`F['${chemin.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'] = '${valeur}';`);
      n++;
    }
    lignes.push('}((window.ThemePark = window.ThemePark || {}).fichiers || (window.ThemePark.fichiers = {})));', '');
    const texte = lignes.join('\n');
    fs.writeFileSync(path.join(distribution, ...c.script.split('/')), texte);
    bilan.push({ script: c.script, fichiers: n, octets: Buffer.byteLength(texte) });
  }
  return bilan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distribution = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'site'));
  if (!fs.existsSync(path.join(distribution, 'theme-park.html'))) {
    console.error(`${distribution} : pas une distribution (theme-park.html manque)`);
    process.exit(1);
  }
  for (const b of ecrireLesCompagnons(distribution)) console.log(`${b.script} : ${b.fichiers} fichiers, ${(b.octets / 1048576).toFixed(2)} Mo`);
}
