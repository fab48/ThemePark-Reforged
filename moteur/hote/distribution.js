// La distribution : Theme Park en dossiers, à côté de sa page (moteur/node/construire-distribution.mjs
// l'écrit dans site/). Les assets y sont des fichiers ordinaires, qu'on peut modifier :
//
//   theme-park.html      la page ; moteur/ : le moteur assemblé (theme-park.js, et theme-park-es2015.js
//                        pour les vieux navigateurs)
//   images/              les planches PNG des sprites et leurs tables JSON, les fonds, les palettes
//   sons/                les bruitages WAV et les musiques MP3, que la page joue (moteur/web/audio.js) ;
//                        les morceaux HMP (et MIDI) et les timbres FM, que le jeu lit ; index.json, le
//                        manifeste des sons remplacés (moteur/web/fichiers-des-sons.js)
//   films/               les mp4
//   animations/          rendu.json, les animations intercalées
//   donnees/             index.json (l'inventaire), le programme, les textes, les parties de démo, et
//                        dans tables/ les fichiers du CD que le jeu lit tels quels
//
// Ce module est le SEUL endroit qui dit où va un asset : les chemins de assets/index.json (relatifs à
// assets/) restent la source de vérité, et `cheminDansLaDistribution` les traduit. La construction
// (Node) et la page (fichiers-paquet.js, environnement-distribution.js) l'importent toutes deux.
//
// Les compagnons. Ouverte d'un double-clic (file://), la page ne peut ni lire un fichier voisin
// (fetch est refusé) ni les pixels d'une image voisine (le canvas serait « souillé ») ; elle peut en
// revanche exécuter un <script src> voisin. Chaque dossier lu par le jeu a donc son compagnon, un
// script qui porte les mêmes fichiers en base 64 : images/images.js, sons/sons.js,
// donnees/donnees.js, animations/animations.js. Les films n'en ont pas : <video src="films/…"> se lit
// en file://, et les sons pas davantage : <audio src="sons/…"> aussi (moteur/web/audio.js). sons.js ne
// porte donc que ce que le moteur lit lui-même : les morceaux HMP (le séquenceur du jeu les joue, sans
// être entendu), les timbres, et le manifeste des sons remplacés ; les WAV des bruitages, le moteur de
// la page n'en prend que la durée, écrite dans l'inventaire (index.json, `tailles`). Un compagnon se refait par refaire.cmd (lanceur/refaire.ps1, PowerShell 5.1) ou par la
// construction ; les deux suivent les règles ci-dessous (COMPAGNONS, compresse) : les changer ici,
// c'est les changer aussi dans lanceur/refaire.ps1.
//
// La forme d'un compagnon (ES5, un script classique) :
//   (function (F) {
//   F['images/banques/MSPR-0.png'] = 'iVBORw0…';           le fichier, en base 64
//   F['images/banques/MSPR-0.json'] = 'gzip:H4sIA…';       le fichier compressé par gzip, en base 64
//   }((window.ThemePark = window.ThemePark || {}).fichiers || (window.ThemePark.fichiers = {})));
// La clé est le chemin dans la distribution. Ce qui est déjà compressé (PNG, MP3, OGG...) va tel quel ;
// le reste passe par gzip (rendu.json : 69 Mo, 4 Mo compressé), que la page décompresse
// (moteur/hote/inflate.js, `degonflerGzip`, qui vérifie la somme CRC-32).

// Le chemin d'un asset (relatif à assets/, tel que le donne index.json) dans la distribution.
export function cheminDansLaDistribution(chemin) {
  if (chemin === 'index.json') return 'donnees/index.json';
  const premier = chemin.slice(0, chemin.indexOf('/') + 1);
  if (premier === 'images/' || premier === 'sons/' || premier === 'films/') return chemin;
  if (premier === 'donnees/') return 'donnees/tables/' + chemin.slice('donnees/'.length);
  // programme/, textes/, parties/, et ce que de nouveaux assets apporteraient : sous donnees/
  return 'donnees/' + chemin;
}

// Les animations intercalées (assets/animations/import/rendu.json, hors de l'inventaire).
export const RENDU = 'animations/rendu.json';
// Le manifeste des sons remplacés (moteur/web/fichiers-des-sons.js) : la page ne peut pas lister un
// dossier ; refaire.cmd (et la construction) le réécrivent d'après sons/. Et les formats de son que
// les navigateurs lisent.
export const MANIFESTE_DES_SONS = 'sons/index.json';
export const FORMATS_AUDIO = /\.(mp3|ogg|oga|opus|wav|flac|m4a|aac|webm)$/i;

// Les compagnons : le dossier, le script, et ce qui y entre (chemin relatif à la distribution). Des
// sons, seulement ce que le moteur lit (plus haut) : les HMP, les timbres (.BNK), le manifeste.
export const COMPAGNONS = [
  { dossier: 'images', script: 'images/images.js', garder: () => true },
  { dossier: 'sons', script: 'sons/sons.js', garder: (c) => /\.(hmp|bnk)$/i.test(c) || c === MANIFESTE_DES_SONS },
  { dossier: 'donnees', script: 'donnees/donnees.js', garder: () => true },
  { dossier: 'animations', script: 'animations/animations.js', garder: () => true },
];
// Ni les scripts (les compagnons eux-mêmes), ni les notes (LISEZMOI.txt...) n'entrent dans un
// compagnon ; les autres .txt, si (les chaînes du programme, par exemple).
export const HORS_COMPAGNON = /(\.js|(^|\/)(LISEZMOI|README)[^/]*)$/i;
// Ce qui est compressé dans un compagnon : tout, sauf ce qui l'est déjà.
export const compresse = (chemin) => !/\.(png|mp3|mp4|ogg|opus|m4a|flac)$/i.test(chemin);
