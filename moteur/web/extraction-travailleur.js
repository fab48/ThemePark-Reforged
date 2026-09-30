// Dérouler l'image du CD que le joueur a donnée (extraction.js) dans le stockage privé du navigateur
// (OPFS, dossier assets/) : les assets du jeu (moteur/hote/assets-du-jeu.js), comme le fait
// moteur/node/extraire-jeu.mjs sous Node. Dans un travailleur, pour les accès synchrones de l'OPFS
// (les seuls que tous les navigateurs offrent en écriture). Les films FLC du CD restent tels quels :
// le jeu les joue lui-même.

import { lireISO } from '../hote/iso9660.js';
import { preparerLesAssets } from '../hote/assets-du-jeu.js';

// Le zlib des PNG, compressé par le navigateur.
async function compresser(octets) {
  const flux = new CompressionStream('deflate');
  const ecrivain = flux.writable.getWriter();
  ecrivain.write(octets);
  ecrivain.close();
  return new Uint8Array(await new Response(flux.readable).arrayBuffer());
}

onmessage = async (e) => {
  const { fichier } = e.data;
  try {
    const lire = async (position, taille) => new Uint8Array(await fichier.slice(position, position + taille).arrayBuffer());
    const iso = await lireISO(lire);
    const racine = await navigator.storage.getDirectory();
    // des assets précédents, complets ou non, sont d'abord retirés (et le paquet d'avant, jeu/)
    for (const ancien of ['assets', 'jeu']) {
      try { await racine.removeEntry(ancien, { recursive: true }); } catch (err) { /* il n'y en avait pas */ }
    }
    const assets = await racine.getDirectoryHandle('assets', { create: true });
    let n = 0;
    const ecrire = async (chemin, contenu) => {
      const octets = typeof contenu === 'string' ? new TextEncoder().encode(contenu) : contenu;
      let d = assets;
      const parties = chemin.split('/');
      for (const p of parties.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
      const acces = await (await d.getFileHandle(parties[parties.length - 1], { create: true })).createSyncAccessHandle();
      acces.truncate(0);
      acces.write(octets, { at: 0 });
      acces.flush();
      acces.close();
      n++;
      postMessage({ avancement: `CD : ${chemin} (${n} fichiers)` });
    };
    await preparerLesAssets({ chemins: [...iso.fichiers.keys()], lire: (c) => iso.lireFichier(c) }, ecrire,
      { deflate: compresser }, (s) => postMessage({ avancement: s }));
    postMessage({ fini: true });
  } catch (err) {
    postMessage({ erreur: err.message || String(err) });
  }
};
