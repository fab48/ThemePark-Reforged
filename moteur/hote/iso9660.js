// Lire une image ISO 9660 : le CD de Theme Park, sous Node comme dans la page (le joueur y donne
// l'image de son CD). Même lecture que outils/extraire_iso.py : le descripteur de volume primaire au
// secteur 16, puis les répertoires ; les noms rendus sans le suffixe de version « ;1 ».
//
// `lire(position, taille)` rend (éventuellement par une promesse) les octets demandés de l'image :
// sous Node, une lecture du fichier ; dans la page, une tranche du File choisi par le joueur.

const SECTEUR = 2048;

// Les fichiers de l'image : Map chemin (en majuscules, séparé par /) -> { lba, taille }.
export async function lireISO(lire) {
  const pvd = await lire(16 * SECTEUR, SECTEUR);
  const identifiant = String.fromCharCode(...pvd.subarray(1, 6));
  if (identifiant !== 'CD001') throw new Error("ce n'est pas une image de CD (ISO 9660)");
  const dvp = new DataView(pvd.buffer, pvd.byteOffset, pvd.byteLength);
  const fichiers = new Map();
  const parcourir = async (lba, taille, chemin) => {
    const donnees = await lire(lba * SECTEUR, taille);
    const dv = new DataView(donnees.buffer, donnees.byteOffset, donnees.byteLength);
    for (let i = 0; i < donnees.length;) {
      const longueur = donnees[i];
      if (longueur === 0) { i = (Math.floor(i / SECTEUR) + 1) * SECTEUR; continue; }
      const lbaE = dv.getUint32(i + 2, true), tailleE = dv.getUint32(i + 10, true);
      const repertoire = (donnees[i + 25] & 2) !== 0;
      const n = donnees[i + 32];
      const brut = donnees.subarray(i + 33, i + 33 + n);
      i += longueur;
      if (n === 1 && (brut[0] === 0 || brut[0] === 1)) continue;      // . et ..
      const nom = String.fromCharCode(...brut).split(';')[0].replace(/\.$/, '').toUpperCase();
      const c = chemin ? `${chemin}/${nom}` : nom;
      if (repertoire) await parcourir(lbaE, tailleE, c);
      else fichiers.set(c, { lba: lbaE, taille: tailleE });
    }
  };
  await parcourir(dvp.getUint32(156 + 2, true), dvp.getUint32(156 + 10, true), '');
  return {
    fichiers,
    async lireFichier(chemin) {
      const f = fichiers.get(chemin.toUpperCase());
      if (!f) throw new Error(`${chemin} n'est pas sur le CD`);
      return lire(f.lba * SECTEUR, f.taille);
    },
  };
}
