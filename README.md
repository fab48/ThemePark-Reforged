# Theme Park — reconstruction du moteur

Reconstruction d'un moteur moderne pour **Theme Park** (Bullfrog Productions, 1994, version CD),
à partir du jeu d'origine : tout le programme est d'abord **transcrit** instruction par instruction
en JavaScript, vérifié contre un émulateur de processeur, puis **réécrit à la main**, fonction par
fonction, en code lisible — chaque réécriture étant confrontée à la transcription.

Le nouveau moteur **joue avec les données du jeu d'origine**, extraites du CD en formats
d'aujourd'hui (`assets/`) : les images en PNG, les bruitages en WAV, les musiques en HMP, MIDI et
MP3, les films en MP4, les textes en JSON, les données de `MAIN.EXE` et d'`INTRO.EXE` sans leur
code, et le rendu des animations intercalées. Le dépôt les contient, pour se suffire à lui-même :
c'est un travail de conservation, d'amélioration et de compréhension d'un jeu de 1994, aujourd'hui
abandonware. Ces fichiers restent la propriété de leurs auteurs (Bullfrog, Electronic Arts) : le
dépôt reste privé. Avant de lancer le jeu, le moteur refait à partir de ces assets, octet pour
octet, les fichiers que le jeu de 1994 lisait (l'extraction le vérifie sur les 115 fichiers du CD) ;
seuls les films sont joués par la page, en vidéo, à la place du lecteur du jeu. La transcription,
qui ne sert plus qu'à la vérification, vit dans l'atelier, hors du dépôt (voir « Contenu »).

**État : la réécriture est terminée. Le jeu tourne dans le navigateur, sans émulateur et sans le
code de 1994 — sur le seul code lisible —, du film d'introduction et de l'écran titre jusqu'au parc
et à ses écrans de gestion, avec sa musique et ses bruitages, servi par un petit serveur Node, ou en
distribution : un dossier qu'on sert ou qu'on ouvre d'un double-clic, et dont on peut modifier les
images et les sons.** La
réécriture lisible couvre le rendu et la caméra, la simulation — visiteurs, attractions, personnel,
véhicules, économie, concurrents, fin d'année —, la boucle du parc, l'interface du parc et ses
menus, l'écran titre, la carte du monde, la construction et les voies, les sauvegardes, la souris,
le tutoriel, les recherches, l'entrepôt, la bourse et la vente aux enchères, les catalogues et les
feux d'artifice, les voyous et le gardien, l'agent d'entretien, les négociations et la grève, les
explosions et le monorail, les outils de pose, la carte du parc et le relevé bancaire, les
nouveautés, la faillite, la sortie du programme, le son — la couche de Bullfrog, les films des
attractions et la bibliothèque HMI SOS, pilote FM compris —, et le socle — démarrage, curseur, carte
vidéo, tas, fichiers, bibliothèque C de Watcom : 847 fonctions dans 56 modules, toutes celles qu'une
partie peut atteindre, prouvées identiques à l'original sur 46 scénarios de vérification, dont 3
avec carte son (et, pour les 45 que ce rejeu ne sait pas éprouver, la plupart faute d'être
atteintes, appel par appel sur des bancs d'essai, ou par l'introduction). Les 250 autres fonctions
du programme sont hors d'usage, chacune pour une raison nommée : le jeu en réseau (NetBIOS), les
pilotes d'autres cartes son, du code mort... L'introduction, `INTRO.EXE`, un second programme lié à
la même bibliothèque, est transportée dans la disposition mémoire du jeu : ses 466 fonctions
communes y prennent le code lisible du jeu, ses 30 propres sont réécrites, et le film joué est
identique à l'original sur ses 186 secondes (docs/architecture.md, « Le moteur autonome »).

## Contenu

Le dépôt garde le résultat : le jeu autonome, qui tourne entièrement dans le navigateur, et toute la
documentation.

| Dossier | Rôle |
|---|---|
| `moteur/` | le nouveau moteur : la page web (`moteur/web/`), l'hôte, ce que DOS fournissait (`moteur/hote/`), le code lisible (`moteur/jeu/`) ; et, dans `moteur/node/`, le serveur local, la construction de la distribution (le moteur réentrant, l'assembleur, l'abaissement en ES2015, les compagnons), l'extraction des assets depuis le CD et la conversion des films |
| `docs/` | la méthode, la rétro-ingénierie, le journal des essais |
| `assets/` | les données du jeu, tirées du CD en formats d'aujourd'hui (`index.json` en fait l'inventaire) : `programme/` (les données de `MAIN.EXE` et d'`INTRO.EXE`, sans leur code), `images/` (les banques de sprites en planches PNG, les fonds, les palettes), `sons/` (les bruitages en WAV, les musiques en HMP, MIDI et MP3, les timbres FM ; `LISEZMOI.txt` : les remplacer), `films/` (MP4), `textes/` (les cinq langues, en JSON), `donnees/` (les tables que le jeu lit telles quelles), `parties/` (le parc de démonstration) ; et le rendu des animations intercalées (`animations/import/rendu.json`) |
| `Theme Park.cmd`, `theme-park.sh`, `lanceur/` | jouer sans rien installer : un serveur minimal (PowerShell sous Windows, python3 ailleurs), puis le navigateur |

L'atelier reste sur la machine de développement, hors du dépôt : le CD déroulé (`jeu/`, d'où les
assets sont extraits, et que lisent les vérificateurs), les outils de la décompilation (`outils/`),
les vérificateurs, leurs scénarios et leurs bancs d'essai (`moteur/scenarios/`, et dans
`moteur/node/` : `verifier*.mjs`, `eprouver*.mjs`, `lancer.mjs`...), la chaîne des animations
intercalées (export, RIFE, import) et ses fichiers de travail, et `travail/` (la transcription, les
résultats des vérifications, les enquêtes). La documentation en parle, avec leurs commandes ; un
clone du dépôt ne les a pas.

Documents :

- [docs/architecture.md](docs/architecture.md) : la méthode, ce qui remplace DOS, comment lancer.
- [docs/guide-reecriture.md](docs/guide-reecriture.md) : comment réécrire une fonction et prouver
  qu'elle fait exactement ce que faisait l'original.
- [docs/retro-ingenierie.md](docs/retro-ingenierie.md) : structure du binaire, variables et
  fonctions identifiées, fonctionnement du rendu, de la cadence et du défilement, de la
  simulation, de l'interface et du socle.
- [docs/journal-des-essais.md](docs/journal-des-essais.md) : tout ce qui a été tenté, avec les
  verdicts et les impasses.

## Mise en route

Les données du jeu sont dans le dépôt (`assets/`) : il n'y a rien à extraire, et Node (18 ou plus)
suffit pour jouer. Pour repartir du CD (son image ISO, ou le dossier où elle est déroulée) :

```bash
node moteur/node/extraire-jeu.mjs chemin/vers/THEMECD.ISO
node moteur/node/extraire-films.mjs
```

Le premier écrit les assets, puis vérifie que les 115 fichiers du CD se refont à l'identique depuis
eux ; le second, qui demande ffmpeg (dans le `PATH` ou désigné par la variable `FFMPEG`), convertit
les films en MP4 — l'introduction, les films des attractions, la partie gagnée —, tels que le jeu
les joue, son compris, et retire alors les films FLC des assets. Python, avec capstone et unicorn,
ne sert qu'aux outils de transcription et de vérification, dans l'atelier.

Jouer dans le navigateur :

```bash
node moteur/node/serveur.mjs
```

puis <http://localhost:8123/> (ou, sans Node, « Theme Park.cmd » sous Windows, `theme-park.sh`
ailleurs : un serveur minimal, puis le navigateur). La page joue d'abord le film d'introduction,
comme le lanceur d'origine ; une touche ou un clic le passe. Le joueur n'a rien à régler : tout est
allumé d'office — le son (au premier clic ou à la première touche, les navigateurs l'interdisant
avant), le 640x480, le défilement doux et fluide, la grande vue, la souris capturée au clic, les
corrections des défauts de 1994, les animations intercalées, les sons remplacés. L'écran ne
montre que l'image du jeu et, en haut, un bandeau discret : plein écran, rendu, langue, débogage.
Les autres boutons sont dans l'onglet « Réglages » de la fenêtre de débogage (bouton « débogage »
ou touche ²) : son, 640x480, défilement, grande vue, souris, animations, sons remplacés,
« original bug fix » (éteint : les défauts de 1994 tels quels), la ligne d'état et la cadence. Les
parties sont gardées par le navigateur (le serveur ne sert que des fichiers), et chaque adresse, port
compris, a les siennes : les boutons « parties : exporter » et « parties : importer » du même onglet
les mettent dans un fichier et les en reprennent, pour les garder ailleurs ou les porter d'une
adresse à l'autre.

La distribution, pour jouer sans Node et pour modder le jeu :

```bash
node moteur/node/construire-distribution.mjs
```

écrit dans `site/` (vidé d'abord) la page, `theme-park.html`, et à côté les assets en fichiers
ordinaires, rangés en dossiers clairs : `images/` (les planches PNG et leurs tables, les fonds, les
palettes), `sons/` (bruitages WAV et musiques MP3, que la page joue ; morceaux HMP et MIDI, timbres),
`films/`, `animations/` (`rendu.json`), `donnees/` (l'inventaire, le programme, les textes, la partie
de démonstration, les tables du CD) ; le moteur assemblé en un script, dans `moteur/` ; les lanceurs
(« Theme Park.cmd », `theme-park.sh`) et `refaire.cmd`. Environ 180 Mo, dont 49 de films et 69 de
`rendu.json`. Le moteur y tourne dans le fil de la page (le moteur réentrant, sans travailleur ni
mémoire partagée) : la distribution se sert telle quelle, sans en-têtes d'isolation, par ses
lanceurs ou n'importe quel serveur HTTP, et s'ouvre aussi d'un double-clic (`file://`), hors ligne.
Ouverte ainsi, la page ne peut pas lire les fichiers voisins : elle lit leurs compagnons
(`images/images.js`, `sons/sons.js`, `donnees/donnees.js`, `animations/animations.js`), les mêmes
fichiers en base 64. Les films et les sons n'en ont pas besoin : des éléments `<video>` et `<audio>`
les lisent directement (`sons/sons.js` ne porte que ce que le moteur lit lui-même : les morceaux HMP,
les timbres et le manifeste des sons remplacés, 0,1 Mo au lieu de 14). Elle vise aussi les navigateurs de 2016-2017 (Chrome 49, Firefox 52 : un second
script, abaissé en ES2015). Les parties sont gardées par le navigateur, pour chaque adresse : le
double-clic et la page servie ont chacun les leurs.
La page du fil de la page, servie en modules pour la mettre au point : <http://localhost:8123/local>.

La transcription, pour les outils de vérification (à refaire après toute modification de
`outils/transcrire.py`) :

```bash
python outils/desassembler.py
python outils/transcrire.py
```

Sans écran, pour les essais :

```bash
node moteur/node/lancer.mjs --duree 30 --captures 1
```

Avec `--son fichier.wav`, le lanceur écrit aussi ce que joue la carte son ; avec `--autonome`, c'est
le moteur autonome qui joue, comme dans la page (sans, la transcription seule).

## Modder le jeu

Dans la distribution, remplacer un fichier par un autre du même nom, puis recharger la page servie
(« Theme Park.cmd ») ; pour le double-clic, lancer d'abord `refaire.cmd` (PowerShell 5.1, rien à
installer ; `node moteur/node/compagnons.mjs site` fait de même), qui refait les compagnons d'après
les dossiers. Le `LISEZMOI.txt` de la distribution dit où est quoi.

- **Une image** (`images/banques/NOM.png`, `fonds/`, `palettes/`) : chaque pixel est un numéro de
  couleur de la palette du jeu, 255 la transparence ; le plus sûr est de garder l'image en couleurs
  indexées. Enregistrée en couleurs (RVB, RVBA : ce que font la plupart des éditeurs), elle est
  ramenée à la palette du jeu, couleur la plus proche, alpha sous 128 transparent. La table
  `NOM.json` fait foi : une planche plus petite est complétée de transparent. Les couleurs du jeu
  elles-mêmes sont dans `images/palettes/`.
- **Un son, une musique** : la page joue les fichiers eux-mêmes, servie comme en double-clic — les
  bruitages `sons/bruitages/SNDS0-2/NOM.wav` (la banque que le jeu charge), les musiques
  `sons/musiques/FM/NOM.mp3`. Le plus simple : écraser le fichier, même nom, même format (un WAV par
  un WAV de n'importe quelle qualité, 44 100 Hz stéréo compris ; un mp3 par un mp3), et recharger la
  page, sans `refaire.cmd`. Dans un autre format (ogg, flac, mp3 pour un bruitage…) : poser le
  fichier à côté de l'original, du même nom (`CASH.ogg` près de `CASH.wav`, `RIDE4.ogg` près de
  `RIDE4.mp3`), puis `refaire.cmd`, qui l'inscrit au manifeste `sons/index.json` (la page ne peut pas
  lister un dossier ; il s'écrit aussi à la main, une musique par son nom ou son numéro :
  `sons/LISEZMOI.txt`). Le jeu n'en voit rien : pour lui, chaque son garde la durée de l'original ;
  un bruitage remplacé joue jusqu'au bout de son fichier, sauf si le jeu l'arrête, une musique repart
  du début quand le jeu la relance. Le bouton « sons remplacés » (onglet Réglages) rend les
  originaux, sauf ceux qu'on a écrasés.
- **Un film** : un mp4 de même nom dans `films/` ; absent, il n'est pas montré.
- **Une police** (`images/polices/<police>.png` et `.json`) : un glyphe par code de caractère, plus
  bas.
- **Un texte, une langue** (`donnees/textes/`, `textes/` dans `assets/`) : plus bas, « Traduire le
  jeu ».
- **Des sprites en haute définition**, en vraies couleurs, à 2, 3 ou 4 fois leur taille
  (`images/hd/`) : plus bas, « Un pack HD ».

Ce qui ne va pas est dit dans la console du navigateur (« assets : … »), et le jeu continue avec ce
qu'il a ; sans musiques, textes ou tables, il ne démarre pas, et l'erreur nomme le fichier. Les
chemins de `donnees/index.json` restent ceux de `assets/` : `moteur/hote/distribution.js` est le seul
endroit qui dit où chacun va dans la distribution.

### Les polices

Le jeu écrit avec trois polices ; `images/polices/` en a une planche PNG chacune (et deux de plus,
jamais montrées) :

| Police | D'où | Glyphes | Où on la voit |
|---|---|---|---|
| `petite` | le programme (0xBA2FC), 3 × 6 points, chasse 4 | 173 (0x20 à 0xCC) | la bulle des messages, les enseignes des kiosques, les jauges, les nombres des écrans |
| `interface` | la banque `MFONT-0`, 5 points de haut, par la table 0xB51C1 du programme | 55 images, 104 codes | les fenêtres, les menus, l'écran titre |
| `titres` | `MFONT-0`, 17 points de haut, par la table 0xB50C1 | 43 images (et 6 sans code), 97 codes | les titres des écrans de gestion |
| `watcom-8x8`, `watcom-8x14` | le programme (bibliothèque graphique de Watcom) | 256 chacune | nulle part : seul du code hors d'usage les lit |

Chaque planche range un glyphe par code, 16 codes par rangée (le code 0x41, « A », en colonne 1 de la
rangée 4), dans des cases séparées d'un trait gris que la lecture ignore ; la table `<police>.json`
redit, pour chaque code, son `signe` (le caractère de la page 437 du DOS à ce code), sa place (`x`,
`y`), sa `largeur`, sa `hauteur` et sa `chasse`. Redessiner un glyphe, recharger la page (servie) ou
lancer `refaire.cmd` (double-clic) : il est dans le jeu, la banque `MFONT-0` et les tables du
programme étant refaites des planches (`moteur/hote/polices.js`).

- `petite`, `watcom-*` : d'un seul trait. Un point opaque et sombre est encré, tout le reste est vide
  (le fond transparent, ou blanc si l'éditeur aplatit la transparence) ; la taille est fixe. Les
  cases grisées en entier sont des codes que la police n'a pas (la petite police s'arrête à 0xCC :
  au-delà, le jeu lirait d'autres données). La chasse de `watcom-8x8` est une donnée du programme
  (`chasse`, `decalage`).
- `interface`, `titres` : en couleurs du jeu, comme les banques d'images (255 transparent, une planche
  en RVB ramenée à la palette `MPALETTE`). Le glyphe est le coin de sa case de `largeur` × `hauteur`
  (la table fait foi : un point dessiné au-delà est ignoré, et signalé dans la console) ; la chasse
  (largeur + 1 pour l'interface, largeur − 1 pour les titres, qui se chevauchent) est calculée par le
  jeu. Un code qui montre le glyphe d'un autre (« a » celui de « A » : ces deux polices n'ont que des
  majuscules) a une case vide et `"comme": "0x41"` : redessiner « A » change aussi « a » ; dessiner
  dans la case de « a » lui donne son propre glyphe. **Un glyphe nouveau** : dessiner dans la case
  vide d'un code que la table n'a pas (0x90, « É ») ; sa taille est celle du dessin, depuis le coin
  de la case (ou, en ajoutant le code à la table sans `image`, sa `largeur` et sa `hauteur`). Les
  glyphes se posent par le haut (sauf `,` et `.`, posés sur la ligne) : un accent au-dessus d'une
  majuscule allonge le glyphe vers le bas de l'écran. La banque tient 255 images (105 aujourd'hui).
  `sansCode`, dans `titres.json` : six grandes lettres que le jeu n'emploie pas (ß Ù Ò Ì È Á),
  qu'une entrée de la table peut donner à un code (`"image": 98`…).

### Traduire le jeu

`textes/index.json` (dans la distribution, `donnees/textes/index.json`) dit les langues, dans l'ordre
du menu « langue » de la page :

```json
{ "version": 1, "codage": "cp437", "langues": [
  { "nom": "français", "fichier": "textes/LANG4.json", "emplacement": 4 },
  { "nom": "brezhoneg", "fichier": "textes/brezhoneg.json", "emplacement": 5,
    "caracteres": { "À": "0xE0" } },
  ... ] }
```

- **L'emplacement** est le chiffre par lequel le jeu connaît la langue : son option `-l` (la table
  0xB7E17 du programme en connaît dix : U0 G1 I2 S3 F4 P5 66 77 88 99) et le `n` du fichier
  `LANGn-0.DAT` qu'il lit. Le CD en remplit cinq (0 anglais, 1 allemand, 2 italien, 3 espagnol,
  4 français) ; une langue ajoutée prend un emplacement libre (5 à 9) sans en chasser aucune, ou
  celui d'une des cinq, qu'on retire alors du manifeste (ou dont on met l'emplacement à `null`).
  Deux langues au même emplacement : la première le garde, la seconde est signalée. Rien d'autre du
  jeu ne dépend de la langue (mais des fonds plein écran portent du texte dessiné : `images/fonds/`).
- **Le fichier** : 26 groupes, un tableau de textes chacun, en vrais caractères. Le code lit un texte
  par son groupe et son rang : une traduction garde **le nombre de textes de chaque groupe**, dans le
  même ordre (le mieux : partir de `LANG4.json` ou de `LANG0.json`). Seul le groupe 16 varie d'une
  langue à l'autre : le menu de l'écran titre, puis les remerciements, terminés par `+` et `*`. Les
  codes de format (`%s`, `%d`…) restent, dans le même ordre ; les `\N` des messages du DOS sont du
  texte. Le fichier n'a pas de limite de longueur, mais l'écran en a une : les textes ne sont ni
  coupés ni réduits (sauf ceux de la bulle des messages, coupés aux espaces), et une ligne trop
  longue déborde de sa fenêtre ; rester près de la longueur d'origine, et regarder. Les textes
  d'origine sont en majuscules : l'interface et les titres n'ont pas de minuscules (elles montrent les
  majuscules), la petite police si.
- **Les caractères** : le jeu lit un octet par signe, celui de la page 437 du DOS (et non du Latin-1 :
  l'allemand écrit Ä en 0x8E, l'espagnol Ñ en 0xA5). Le fichier est en vrais caractères, refaits en
  octets de la page 437 ; `caracteres` y ajoute, pour la langue, des correspondances signe → octet
  prises d'abord. Un signe sans octet est une erreur qui nomme le groupe et le texte (dans la page :
  signalé, et remplacé par « ? »). **Un octet n'est lisible que si les polices ont un glyphe à ce
  code** : `interface` et `titres` n'ont que `' - . , : ( ) / %`, les chiffres, les lettres, et
  Ä Ö Ü Ñ (aux codes de la page 437 : 0x84 0x8E 0x99 0x9A 0xA4 0xA5) ; l'interface a aussi À È Ì Ò Ù
  ß, mais aux codes du Latin-1 (0xE0 0xE8 0xEC 0xF2 0xF9 0xDF : en page 437, α Φ ∞ ≥ ∙ ▀), qu'une
  langue atteint par `caracteres` (`"È": "0xE8"`), mais que la petite police n'a pas (elle s'arrête à
  0xCC). La petite police a l'ASCII (minuscules comprises) et ü ä Ä ö Ö Ü Ñ aux codes de la page 437,
  des bouche-trous ailleurs jusqu'à 0xCC. Tout autre signe (É, è, ç…) s'affiche vide, ou en bouche-trou,
  tant qu'on ne dessine pas son glyphe dans les trois planches, au code que la page 437 lui donne (É :
  0x90, è : 0x8A, ç : 0x87), ou à un code choisi avec `caracteres`. Le nom qu'on tape (joueur, parc)
  n'accepte que les lettres et les chiffres de l'ASCII.
- **L'extraction** (`extraire-jeu.mjs`) réécrit le manifeste d'après le CD, en y gardant les langues
  ajoutées.

**Un autre alphabet** (cyrillique, grec). Avec ces polices, il faut des codes libres : la page 437 a,
de 0x80 à 0xFF, bien des signes qu'une langue russe ou grecque n'emploie pas. On dessine chaque
lettre dans les trois planches à l'un de ces codes (les textes étant en majuscules, 33 lettres pour
le russe, 24 pour le grec), et `caracteres` en donne la correspondance (`"Ж": "0x80"`) : les fichiers
de textes s'écrivent alors en vrais caractères. Les limites : la petite police n'a que 77 codes au-delà
de l'ASCII (0x80 à 0xCC, sans pouvoir s'étendre : ses octets sont suivis d'autres données du
programme), ses glyphes font 3 × 6 points à chasse fixe (Ж, Щ, Ы y sont à peine lisibles) ; la banque
MFONT-0 tient 255 images, assez pour les deux alphabets ; et le nom qu'on tape reste en ASCII (la table
des classes de caractères de la bibliothèque C, 0xB0A5C, et le clavier de l'hôte ne connaissent que
lui). L'autre voie est celle de la liste d'affichage HD (une autre session la prépare) : les trois
routines qui écrivent du texte (0x3F49E, 0x3F7BD, 0x80E88/0x80F34) reçoivent la chaîne entière ; la
liste pourrait la noter (place, police, couleur, octets) et la page la rendre dans une police
d'aujourd'hui, les octets traduits en caractères par le manifeste de la langue — tout alphabet, à
toute taille. La mise en page, elle, resterait celle que le jeu calcule avec les chasses des glyphes
(largeurDuTexte, 0x3F677) : les chasses des planches devraient rester proches de celles de la police
de rendu.

### Un pack HD

Le réglage « rendu HD » (onglet Réglages du débogage : non, ×2, ×3, ×4 ; éteint par défaut) recompose
chaque image du jeu à 2, 3 ou 4 fois sa taille d'après ce que le jeu a dessiné, dans l'ordre où il l'a
dessiné (la liste d'affichage : docs/architecture.md, « Le rendu HD ») : chaque sprite qui a une image
dans le pack HD est posé en vraies couleurs, les autres sont agrandis au plus proche. Le jeu n'en est
pas changé. Il faut WebGL2 ; allumé, la page ne compose plus son zoom (la grande vue montre l'image du
jeu entière, sa taille suivant la molette) ni la glisse du défilement fluide.

Le pack est un dossier, `assets/images/hd/` (`images/hd/` dans la distribution), et son manifeste
`index.json` :

```json
{
  "version": 1,
  "echelle": 2,
  "sprites": {
    "MSPR-0/1012": "MSPR-0/1012.png",
    "MPOINTER/0": { "fichier": "MPOINTER/0.png", "echelle": 4, "ancre": [2, 2] }
  },
  "fichiers": {
    "MMENU-0.DAT": { "fichier": "fonds/MMENU-0.png", "largeur": 320 }
  }
}
```

- Un sprite est nommé par sa **banque** (le fichier `.TAB` du jeu, sans extension : `MSPR-0` les objets
  du parc et les visiteurs, `MBLK-0` le sol, `HPANEL-0` et `MPANEL-0` la barre d'outils en 640x480 et
  en 320x200, `MPOINTER` les pointeurs, `MFONT-0` les polices…) et son **numéro** dans la banque (celui
  des planches `images/banques/<banque>.png` et de leur table `.json`).
- Son image est un PNG en vraies couleurs, avec sa transparence (alpha : un bord adouci se mêle à ce
  qui est dessous), à `echelle` pixels pour un pixel du jeu (celle du manifeste par défaut ; elle peut
  différer du facteur choisi dans la page, l'image est alors mise à l'échelle). `ancre` : le pixel de
  l'image où tombe le coin haut gauche du sprite d'origine (0, 0 par défaut) ; une image peut déborder
  du sprite de tous côtés. Un sprite retourné par le jeu est retourné de même ; une silhouette (le
  texte de la grande police) prend la forme de l'image et la couleur du jeu.
- `fichiers` : les images plein écran que le jeu lit dans un fichier (les fonds des écrans), par le nom
  du fichier ; `largeur` : sa largeur dans le jeu.
- Une image HD ne suit pas la palette du jeu : pendant un fondu ou un orage, elle est assombrie comme
  la palette.

Pour partir des dessins d'origine : `node moteur/node/pack-hd.mjs --brut --echelle 4 MSPR-0/1004-1013`
écrit chaque sprite agrandi au plus proche, en vraies couleurs, dans `assets/images/hd/<banque>/<n>.png`,
et l'inscrit au manifeste ; on le redessine à la même taille, et la page servie le prend au
rechargement (en double-clic, après `refaire.cmd`). Sans `--brut`, l'outil fait un pack d'essai
(Scale2x, ou Scale3x, et un contour adouci) : c'est ainsi qu'a été fait celui du dépôt (198 sprites :
les arbres, le visiteur de la première sorte, le sol, les barres d'outils, les pointeurs). Pour choisir
quoi redessiner, la console de la page compte les sprites tracés (`renduHDDeLaPage.parNom = new Map()`,
puis relire cette table : nom → nombre de tracés), et le banc
`travail/hd/sprites-frequents.mjs` les plus tracés d'une partie.

Ce que le relevé n'aurait pas su décrire (un écran que les scénarios de vérification n'atteignent
pas) est rattrapé : le travailleur compare deux fois par seconde la liste rejouée au jeu, et redonne en
pixels de 1994 ce qui diffère ; le bouton le compte (« recalages »).

## Vérifications

| Outil | Ce qu'il prouve |
|---|---|
| `outils/verifier_transcription.py` | chaque instruction traduite donne le même résultat qu'Unicorn : 375 762 cas |
| `outils/pile.py` | aucun `ret` ne détourne le flot d'exécution à l'insu de la transcription |
| `outils/desassembler.py` | 97,5 % du code atteint, toutes les tables de sauts résolues |
| `moteur/node/comparer.mjs` | chaque appel d'une fonction réécrite laisse le même état que sa transcription : mémoire, registres, état de l'hôte |
| `moteur/node/verifier.mjs` | une partie rejouée avec et sans le code lisible reste identique : image, palette, mémoire ; avec `--empoisonner`, même quand la pile laissée par chaque réécriture est brouillée (`--graine` change le brouillage) ; avec `--autonome --image --remplir 0xCC`, le moteur autonome sur l'image des données seule, la place du code remplie de 0xCC, contre la transcription (`verifier-tout.mjs` : les 46 scénarios) |
| `moteur/node/eprouver.mjs` | les fonctions qu'aucun scénario n'atteint, appel par appel, sur des bancs d'essai (`moteur/scenarios/bancs/`) |
| `moteur/node/eprouver-fins.mjs` | les erreurs fatales, qui mettent fin au programme : la même fin des deux côtés |
| `moteur/node/verifier-intro.mjs` | l'introduction : `INTRO.EXE` transporté dans la disposition de `MAIN.EXE` joue le même film que dans la sienne (la carte d'`outils/intro.py`) ; avec `--lisible` puis `--autonome`, le code lisible, puis le moteur autonome seul, font de même, mémoire entière et chaque interruption de la minuterie de SOS comprises |
| `moteur/node/composer.mjs` | écrit un scénario de vérification à partir d'actions lisibles, en visant avec le curseur du jeu |
| `outils/avancement.py` | la part du programme réécrite et prouvée, et ce qui est hors d'usage, par raison |

## Les assets : les données du CD en formats d'aujourd'hui

`node moteur/node/extraire-jeu.mjs` (`moteur/hote/assets-du-jeu.js`, `formats-du-cd.js`, `png.js` :
tout en JavaScript, sans bibliothèque) lit le CD et écrit dans `assets/` :

- `programme/` : les données de `MAIN.EXE` et d'`INTRO.EXE`, sans leur code, en tables lisibles
  (plus bas) : `index.json`, le manifeste, dit chaque zone de l'image du programme — adresse, taille,
  type, fichier, nom, modules de `moteur/jeu` qui la lisent, description ; les `.json` en donnent
  les valeurs, un fichier par module lecteur (`economie.json`, `pays.json`, `catalogues-de-reference.json`…),
  `chaines.txt` les chaînes ; `intro/` ce que l'introduction pose autrement ;
- `images/banques/<BANQUE>.png` et `.json` : chaque banque de sprites en une planche PNG à palette,
  où chaque pixel est l'indice de couleur du jeu (la transparence notée 255) et le `.json` dit où est
  chaque image ; `images/fonds/<NOM>.png` : les fonds plein écran (320x200, à palette) ;
  `images/palettes/<NOM>.png` : les neuf palettes, en 16x16 ;
- `sons/bruitages/<BANQUE>/<NOM>.wav` : les 264 bruitages des six banques (deux banques, trois
  qualités) ; `sons/musiques/FM|MT32|GM/<NOM>.hmp` et `.mid` : les 27 morceaux dans leurs trois
  versions, tels que le jeu les lit et en MIDI standard (les boucles marquées `loopStart`,
  `loopEnd`) ; `sons/musiques/FM/<NOM>.mp3` : chaque morceau tel que le jeu le joue sur une Sound
  Blaster (par la puce FM émulée, ramené à une crête de −1 dB) ; `sons/instruments/` : les timbres FM ;
- `films/*.mp4` (`node moteur/node/extraire-films.mjs`, avec ffmpeg) : l'introduction, les films
  des attractions et celui de la partie gagnée, captés sur le moteur image par image avec leur
  script sonore, en 640x400 (deux fois le 320x200 du jeu, pixels nets) ;
- `textes/LANG<n>.json` : les textes des cinq langues, par groupes, une chaîne par entrée, en vrais
  caractères (les octets du jeu sont ceux de la page 437 du DOS) ; `textes/index.json`, le manifeste
  des langues (nom, fichier, emplacement : « Traduire le jeu ») ;
- `images/polices/` : les polices, une planche PNG et une table JSON chacune (« Les polices ») ; la
  petite police et les tables de caractères du programme, et la banque `MFONT-0`, en sont refaites ;
- `donnees/` : les tables lues telles quelles (animations `.ANI`, `.INF`) ; `donnees/pilotes-hmi.json` :
  les en-têtes des bibliothèques de pilotes de HMI (plus bas) ; `parties/DEMO.GY` : le parc de
  démonstration ;
- `index.json` : l'inventaire, et d'où vient chaque fichier du jeu.

Avant de lancer le jeu, le moteur refait de ces assets, en mémoire, les fichiers du CD que le code
de 1994 lit (`composerLesFichiers`) et l'image de son programme (`composerLeProgramme`) :
l'extraction vérifie qu'ils sont identiques, octet pour octet, aux 113 fichiers du CD qu'il lit et
à l'image tirée de `MAIN.EXE` et d'`INTRO.EXE`. Modifier un asset (une planche dans un éditeur
d'images, un texte dans son JSON, un bruitage en WAV, un prix dans une table du programme) modifie
donc le jeu. Les films, eux, sont joués par la page
(`moteur/web/films.js`) : le jeu attend leur fin comme il attendait celle de son film, et n'en voit
rien d'autre.

Les banques d'images :

| Banque | Sprites | Contenu |
|---|---:|---|
| MSPR-0 | 2516 | manèges, boutiques, visiteurs, personnel, décors, objets |
| MREQ-0 | 257 | fenêtres et boutons de l'interface |
| MBLK-0 | 243 | éléments de terrain et de construction |
| MFONT-0 | 104 | les polices de l'interface et des titres : dans `images/polices/`, pas dans `images/banques/` |
| MPANEL-0, HPANEL-0 | 83 + 83 | panneaux du bas, basse et haute résolution |
| MHAND-0 | 59 | animations de la main et du curseur |
| MCUP-0, MPOINTER, MSTSPR-0, MRSSPR-0, MPLAY-0, MAUSPR-0 | 130 | curseurs, écrans de résultats, enchères |

Total : 3472 images et 13 fonds plein écran.

**Les tables du programme.** Le code lisible lit ses tables et ses valeurs de départ aux adresses où
`MAIN.EXE` les range ; ces octets (130 Ko : l'objet des données et les îles de données du code) sont
dans `assets/programme/` en zones nommées et typées (`moteur/hote/tables-du-programme.js`). Chaque
octet appartient à une zone ; la carte des zones (`moteur/hote/carte-du-programme.js`) est faite par
`outils/carte-du-programme.mjs` d'après les accès du code désassemblé à chaque adresse (leur
largeur, les tables indexées, les adresses prises, les pointeurs), les noms et commentaires des
constantes de `moteur/jeu`, et des tables décrites à la main (`outils/tables-connues.mjs`) : le
catalogue de référence des attractions et celui des boutiques, champ par champ, les 24 pays, les
menus, la mise en page des fenêtres, les tables de ressources et de noms de fichiers, les éléments de
voie… Les zones des polices (la petite police, les tables de caractères, les deux polices de Watcom)
ne sont pas dans `programme/` : leur fichier, `../images/polices/<police>.json`, dit qu'elles sont
faites par les planches des polices. Une zone dont le sens n'est pas établi est marquée
`brut` dans le manifeste, avec ses octets (ou ses mots) et les modules qui la lisent. Les types :
entiers (`u8` à `s32`), pointeurs (`ptr`, en hexadécimal), structures, chaînes. Une zone ne change
jamais de taille (le code lit les suivantes à leur adresse) : une valeur hors de son type, un tableau
d'une autre longueur, une chaîne trop longue sont refusés à la recomposition, en nommant le fichier
et la zone.

**Les pilotes de HMI.** SOS ouvre `HMIDET.386` et `HMIDRV.386` pour y charger un module de pilote,
dont le code ne tourne jamais : l'hôte répond à sa place (`moteur/hote/son.js`). Les assets n'en
gardent que ce que SOS et l'hôte lisent — l'en-tête de chaque fichier et de chaque module, et, pour
les modules de détection de la Sound Blaster 16, la description de la carte
(`donnees/pilotes-hmi.json`, 12 Ko au lieu de 223) ; l'hôte en refait des fichiers de même forme, le
code des modules à zéro (`moteur/hote/pilotes-hmi.js`). La vérification de l'extraction ne les compare
donc pas octet pour octet, mais leurs en-têtes ; le scénario `son` joué avec ces fichiers puis avec ceux
du CD donne le même écran, la même mémoire du jeu et le même son.

## Des images intermédiaires d'animation avec RIFE

Les attractions à tours n'avancent que de 3,3 images par seconde. Le bouton « animations » de la page
(« ×2 + traînée », allumé par défaut) les montre deux fois plus vite dans leur boucle de marche, par
les dessins du jeu, passagers compris, avec derrière ce qui bouge une traînée semi-transparente, faite
d'images intermédiaires interpolées par RIFE (avec [Flowframes](https://github.com/n00mkrad/flowframes))
ou à la main avec Interprite ; ces images ne sont jamais montrées nettes. Le jeu n'en voit rien : la
partie, son rythme et son image restent ceux de 1994 (docs/animations.md, « Deux fois plus vite, et une
traînée » ; docs/architecture.md, « Les réglages : les animations intercalées »). La fontaine
(CENTRE FOUNTAIN, trois images, 1,9 par seconde) passe par la même chaîne, sous son nom ; sans couches,
elle s'interpole avec `--entieres` (docs/animations.md, « La fontaine, de la même façon »).

1. **Exporter** l'animation cuite :

   ```bash
   node moteur/node/exporter-animations.mjs [--attractions "BIG WHEEL,PLANE FLYER"]
   ```

   Par défaut toutes les attractions à tours (BIG WHEEL, MERRY-GO-ROUND, PARASOL CHAIRS, PLANE FLYER,
   SPACE SHUTTLE, PIRATE BOAT, TREE HOUSE... quinze, vingt-six boucles), vers `assets/animations/origine/`
   (versionné, comme `rife/`, `interprite/` et le rendu de l'import : le dépôt réimporte seul) : pour
   chaque attraction, `<ATTRACTION>/boucle/0000.png` (ou `marche/`, `arret/`
   quand l'attraction a une boucle par état, `repos/` pour celle du repos, que le départ finit),
   `0001.png`... une image par étape de l'animation, **dans l'ordre**, l'attraction entière (tous ses
   morceaux, sans les passagers, que le jeu pose lui-même), agrandie x4 au plus proche voisin, sur un
   fond **magenta pur (255, 0, 255)**, la couleur-clé (aucune couleur de ces attractions n'en est à
   moins de 112). Toutes les images d'une boucle ont la même taille, et la place de l'attraction au
   même point : ce qui tourne tourne autour du même centre que dans le jeu. **La boucle** : N étapes
   donnent N + 1 images, la dernière répète `0000.png`, pour que RIFE interpole aussi le passage de la
   dernière étape à la première. À côté : `<ATTRACTION>/boucle-planche.png` (les étapes côte à côte,
   l'ancrage marqué d'une croix, pour relire), `index.json` (étapes, sprites d'origine et leurs
   décalages, ancrage, facteur, couleur-clé, couleurs, places des passagers), `<boucle>-1x/` (les
   mêmes étapes à la taille du jeu, pour Interprite) et `LISEZMOI.txt` (le mode d'emploi détaillé).

   **Les deux couches.** Le jeu trace les passagers au milieu des morceaux de l'attraction : ce qu'il
   trace après la première place (la structure de la BIG WHEEL devant les nacelles) passe devant eux.
   Pour les attractions où c'est le cas, l'export écrit aussi, à côté de `boucle/`, `boucle-fond/`
   (ce qui est tracé avant les passagers) et `boucle-devant/` (ce qui l'est après) : la page pose le
   fond interpolé, les passagers, puis le devant interpolé, et chaque passager reste caché là où le
   jeu le cache.

2. **Interpoler.** Le plus simple, avec le RIFE que Flowframes a installé (RIFE 4.0 CUDA et son Python,
   dans `%LOCALAPPDATA%/Flowframes/FlowframesData/pkgs` ; rien n'est téléchargé) :

   ```bash
   node moteur/node/interpoler-animations.mjs [--attractions "BIG WHEEL"] [--entieres] [--facteur 10]
   ```

   Il interpole, une boucle après l'autre, les couches de chaque attraction exportée (et, avec
   `--entieres`, les boucles entières, sauf celles déjà rendues par Flowframes : `--remplacer` pour
   les refaire), en x10 (9 intermédiaires par étape), dans `assets/animations/rife/`. Les deux couches
   d'une boucle sont déformées par le mouvement estimé sur la boucle entière (chacune à part, elles
   glissaient l'une sur l'autre), et le script mesure où va chaque place de passager (`places.json`),
   pour que les passagers suivent leur nacelle. La roue prend une dizaine de secondes.

   Ou bien, dans Flowframes : en entrée le **dossier** d'une boucle ou d'une couche
   (`assets/animations/origine/BIG-WHEEL/boucle-fond`, puis `boucle-devant`) ; RIFE 4.0 CUDA ;
   facteur x10 (ou x4) ; sortie en suite d'images PNG. Couper la déduplication des images, la détection
   des changements de scène, tout redimensionnement (taille maximale au moins celle des images), et
   l'option de boucle (inutile : la boucle est déjà dans les images). Puis **déposer** les PNG (ou le
   dossier de sortie de Flowframes, tel quel) dans `assets/animations/rife/<ATTRACTION>/<boucle>/`
   (`boucle-fond/`, `boucle-devant/`...), sans les renommer, recadrer ni changer leur fond.
   `LISEZMOI.txt` de l'export détaille les réglages. Mieux vaut laisser les couches au script : faites
   dans Flowframes, chacune à part, elles glissent l'une sur l'autre.

   Pour ce que RIFE rate (une pièce qui tourne beaucoup d'une étape à la suivante : il fond les deux
   étapes au lieu de dessiner la pièce entre elles), Interprite : on y peint les pièces qui bougent
   et on pose leurs os, image par image, à partir de `<boucle>-1x/`, puis on dépose ses images dans
   `assets/animations/interprite/<ATTRACTION>/<boucle>/`. Une boucle d'Interprite l'emporte sur celle
   de RIFE ; `LISEZMOI.txt` détaille la marche.

3. **Importer** :

   ```bash
   node moteur/node/importer-animations.mjs [--attractions "BIG WHEEL"]
   ```

   Il retrouve la transparence (chaque pixel est lu comme un mélange d'une couleur de l'attraction
   et du magenta : les bords que RIFE a mêlés au fond perdent leur liseré), recale les images
   rendues sur les étapes d'origine (celles qu'il y reconnaît ; les autres sont les intermédiaires,
   dans l'ordre), les ramène aux couleurs du jeu, y fige ce qui ne bouge pas d'une image clé à
   l'autre (contre le scintillement), y joint les mesures des places (`places.json`) et écrit
   `assets/animations/import/rendu.json`, que lit la page (et `index.json`, ce qu'il a retrouvé de
   chaque boucle). Avec `--attractions`, les autres attractions déjà importées sont gardées.

   Pour voir ce que la page montrera, image par image :

   ```bash
   node moteur/node/voir-animations.mjs [--attractions "SPACE SHUTTLE"]
   ```

   écrit dans `assets/animations/import/images/<ATTRACTION>/` chaque boucle en PNG, une image par
   fichier à la taille du jeu, et la boucle animée (un PNG animé agrandi, à ouvrir dans un navigateur).

4. **Jouer** : `node moteur/node/serveur.mjs`, le bouton « animations » sur « ×2 + traînée » (le
   réglage par défaut) ; **recharger la page** après un nouvel import (les images sont lues une fois). Le
   compteur de l'onglet « Réglages » du débogage dit ce qui se passe : « anim N/s » est le nombre d'images intermédiaires
   réellement montrées par seconde (jusqu'à la cadence d'affichage quand une attraction cuite tourne à
   l'écran ; 0 si aucune ne tourne, ou si ses images ne sont pas celles de la partie). Le bouton
   affiche « (aucune image importée) » si `rendu.json` manque. Rien d'autre à régler : les images
   intermédiaires sont montrées avec tous les réglages de la page, défilement fluide (pendant la
   glisse aussi), grande vue et tous les niveaux de zoom. Une attraction sans images importées reste
   telle qu'en 1994 ; une attraction importée en deux couches l'emporte sur sa boucle entière.

Limites : une attraction cuite en une seule couche (déposée avant les couches) a ses passagers
masqués par ce qui les cachait à l'étape d'origine, déplacé avec eux : une approximation ; en deux
couches, l'ordre est celui du jeu. Les intermédiaires ne sont montrés qu'entre les deux étapes d'une
attraction en marche, pas au repos. Quelques boucles sont écartées (`ECARTEES`,
moteur/jeu/animations-intercalees.js) : PLANE FLYER, PARASOL CHAIRS et SPACE SHUTTLE en marche, où le
mouvement d'une étape à l'autre est trop grand pour RIFE, et SNAKES AND LADDERS, où il n'y a rien à
gagner ; elles restent telles qu'en 1994, sauf refaites avec Interprite.

## La fenêtre de débogage

Le bouton « débogage » du bas de la page, ou la touche **²** (qui ne va alors plus au jeu), ouvre à
droite un panneau qui montre l'état du jeu **lu en direct dans sa mémoire**, quatre fois par seconde.
Chaque valeur porte un nom français ; au survol, son adresse et le renvoi à
`docs/retro-ingenierie.md`. Les onglets :

- **Le parc** : la date (pas de simulation, jour, mois, année, pas jusqu'à la fin d'année), la
  vitesse, la pause, l'écran ouvert ; le solde, l'engagé, le prêt et son plafond, le billet, le cours
  de l'action ; les visiteurs présents, l'humeur du parc (le visage), mécontents, neutres et
  contents, la réputation, les déchets, le bus ; le niveau, la difficulté, les concurrents, le
  personnel, l'étape du tutoriel.
- **Mécaniques** : ce que le jeu ne montre pas — l'attrait du prix d'entrée (le prix de référence j,
  le seuil du guichet, le billet où les visiteurs hésitent), la marge tolérée et les coefficients de
  l'humeur ; les visiteurs en moyenne (contentement, estomac, soif, argent, fatigue, ennui, ce qu'ils
  font) ; le générateur de hasard et son prochain tirage ; la météo ; les voyous (prochain tirage,
  chance) ; les négociations et la grève (chances, indices, obstination) ; la banque.
- **Recherche** : le budget, et les six domaines (ouverts, budget, points, coût fait et à faire).
- **Objets** : les attractions (mode, phase, ouverture, usure sur seuil et ce qu'elle annonce —
  mécanicien, fumée, explosion —, file, passagers, départs, dû), les boutiques (prix, coût, l'excès de
  prix que voient les visiteurs, ventes, stock), le personnel (métier, état, salaire, patience), les
  voyous, les installations, les visiteurs. Une ligne cliquée ouvre la fiche de l'objet.
- **Fiche** : tous les champs connus d'un objet et ses 200 octets ; par défaut l'objet désigné dans
  le jeu (un clic sur un objet du parc), ou un numéro tapé.
- **Concurrents** : les 25 fiches de joueur (nom, solde, prêt, visiteurs, attractions, cours).
- **Secrets** : la triche (drapeau `0xD6682`, le surnom testé et le calcul du code HORZA) et ce que la
  documentation signale comme caché ou mort.
- **Commandes**, **hors du jeu d'origine** : donner de l'argent, changer la vitesse, forcer la météo
  ou la faire cesser, donner des points de recherche, réparer toutes les attractions, régler le
  contentement des visiteurs, lever ou baisser le drapeau tricheur. Chacune n'écrit que des variables
  établies par la documentation ; la partie diverge ensuite de celle de 1994, et une sauvegarde faite
  après garde ces valeurs.

Fermé, le panneau ne coûte rien au jeu : le travailleur ne fait qu'un test. Souris capturée, Échap
la libère pour aller dans le panneau. Voir docs/architecture.md, « La fenêtre de débogage ».

## Les sons

Les bruitages, les morceaux et les timbres sont dans les assets (plus haut). Les MP3 des musiques
sont rendus par `moteur/node/musiques.mjs` (atelier), qui fait jouer chaque morceau par le jeu
lui-même, et en note le niveau d'origine dans l'inventaire (`niveaux`). Les noms sont ceux du jeu :
`RIDE4`, la musique d'une attraction, `CASH`, la caisse.

Dans la page, **le navigateur joue les fichiers** : le pilote son de 1994 ne rend plus rien. Le jeu
garde ses ordres (tel bruitage à tel volume, en boucle, arrêté ; tel morceau lancé, relancé, arrêté,
son volume, son tempo), que l'hôte (`moteur/hote/son.js`) transmet en événements ; la page
(`moteur/web/audio.js`) joue les WAV par Web Audio (servie) ou par éléments `<audio>` (double-clic),
les mp3 par éléments `<audio>`, au niveau d'origine de chaque morceau. Les volumes du jeu agissent :
`[` et `]` dans le parc (la musique), la touche S et les options (musique, bruitages) ; le bouton
« son » de l'onglet Réglages coupe tout. Pour remplacer un son : plus haut, « Modder le jeu », et
`assets/sons/LISEZMOI.txt`. Voir docs/architecture.md, « Le son ».

Sous Node, l'hôte rend toujours le son lui-même, puce FM comprise (les vérificateurs, les films et
les musiques en sont faits) ; un dossier `bruitages/` et `musiques/` de sons de remplacement peut y
être mêlé :

```bash
node moteur/node/lancer.mjs --son sortie.wav --remplacements dossier
```

## Formats de données

Établis d'après [ThemeParkResourceViewer](https://github.com/tigrouind/ThemeParkResourceViewer)
de tigrouind, sous licence MIT, puis vérifiés sur les fichiers du CD.

**Banque d'images** : une paire `.DAT` (pixels) et `.TAB` (table). Une entrée de table fait
6 octets : position sur 4 octets en petit-boutiste, puis largeur et hauteur sur 1 octet chacune.

**Pixels** : codage par lignes. Chaque ligne est une suite de longueurs signées sur un octet.
Une valeur positive donne le nombre de pixels lus tels quels ensuite, une valeur négative le nombre
de pixels transparents, et zéro termine la ligne, le reste de la ligne étant transparent. La
transparence est tenue à part des couleurs ; l'indice 255 n'étant jamais un pixel opaque sur le CD,
les planches PNG des assets la notent 255.

**Palette** : 768 octets, soit 256 couleurs de trois composantes sur 6 bits, étendues à 8 bits par
`c << 2 | c >> 4`. Le jeu compte **neuf palettes, toutes différentes**. Se tromper de palette ne
change pas seulement les teintes : les dégradés tramés deviennent du bruit coloré et l'image paraît
cassée. Le parc et son interface utilisent `MPALETTE.DAT` ; chaque écran hors du parc a la sienne.

| Écran | Palette |
|---|---|
| parc, interface, police, curseurs, terrain | `MPALETTE` |
| tableau de fin d'année et ses sprites | `MRSPAL-0` |
| négociations et la poignée de main | `MNGPAL-0` |
| carte du monde | `MGLPAL-0` |
| remise des prix et les coupes | `MAWPAL-0` |
| relevé bancaire, fond Midland | `MSTAP-0` |
| stocks, actions et leurs sprites | `MSTPAL-0` |
| faillite | `BUSPAL` |
| rachat | `TAKPAL` |

Cette table vient de l'ordre des noms de fichiers dans l'exécutable, où chaque écran est suivi de sa
palette et de ses sprites, puis a été vérifiée image par image. Deux attributions restent à
confirmer en jeu, l'écran des actions et le fond Midland.

**Fond plein écran** : 64000 octets bruts, soit 320x200 en 256 couleurs.

**Banque de sons** : une paire `.DAT` et `.TAB`. Une entrée de table fait 32 octets : nom sur
18 octets, position dans le `.DAT` sur 4, 4 octets nuls, taille sur 4, puis `5A 00`. La première
entrée ne porte que la taille du `.DAT`.

| Banque | Contenu |
|---|---|
| `SNDS0-0`, `SNDS1-0` | bruitages, 8 bits non signés, 11 025 Hz |
| `SNDS0-1`, `SNDS1-1` | les mêmes, 8 bits, 22 050 Hz |
| `SNDS0-2`, `SNDS1-2` | les mêmes, 16 bits signés, 44 100 Hz |
| `MUSIC0-0`, `MUSIC1-0` | musiques au format HMP de HMI, pour la puce FM (`.HMP`) |
| `MUSIC0-1`, `MUSIC1-1` | les mêmes pour le Roland MT-32 (`.ROL`) |
| `MUSIC0-2`, `MUSIC1-2` | les mêmes en General MIDI (`.GEN`) |
| `INST.BNK`, `DRUM.BNK` | 128 timbres de mélodie et 128 de percussion pour la puce FM, format AdLib |

Le jeu joue chaque bruitage sans ses 16 derniers octets. Il charge la banque 0 au démarrage ; la
banque 1 est chargée par les films des attractions (`0x60C44`), dont le script lance aussi musiques
et bruitages. Le détail est dans la [rétro-ingénierie](docs/retro-ingenierie.md), section 9 (§ 9.6
pour les films).

## État

- [x] Extraction des images et des fonds
- [x] Désassemblage complet, tables de sauts et données logées dans le code résolues
- [x] Transcription de tout le programme en JavaScript, vérifiée contre Unicorn
- [x] Hôte : DOS, DPMI, BIOS, VGA, souris, clavier, minuterie ; le jeu tourne dans le navigateur
- [ ] Réécriture lisible, système par système :
  - [x] rendu et caméra : défilement, dessin de la carte et des objets, traceur de sprites,
    présentation à l'écran
  - [x] simulation : visiteurs, attractions, personnel, véhicules, économie, bourse,
    concurrents, fin d'année, voyous et gardien, agent d'entretien, grève, explosions, monorail
  - [ ] interface : la boucle du parc, le clavier, les menus, la souris, les entrées du parc, la
    construction, les voies et les outils de pose, les fenêtres, la barre des messages, le panneau
    de commande, les écrans d'achat, de fiche et de gestion, l'écran titre, la fiche du joueur, la
    carte du monde, les sauvegardes, le tutoriel, les recherches, l'entrepôt, la bourse, la vente
    aux enchères, les catalogues et les feux d'artifice, les négociations, la carte du parc, le
    relevé bancaire, les écrans « démolir ? » (`0x4A`) et du bus (`0x54`), les nouveautés, la
    faillite et le rachat, la sortie du programme, le film des attractions sont faits ; reste le jeu
    en réseau, que l'hôte ne peut pas exercer (il faudrait émuler NetBIOS)
  - [x] socle : le curseur, la carte vidéo, la minuterie, le tas, les fichiers, la bibliothèque C
    de Watcom, la couche de son de Bullfrog et la bibliothèque de son HMI SOS
  - [ ] ce qui reste, et pourquoi (réseau, pilotes de musique d'autres cartes, détection des cartes,
    code mort) : voir [architecture](docs/architecture.md), « Ce qui reste »
- [x] Son : musique FM et bruitages dans le navigateur, extraction en WAV, MP3 et MIDI
- [x] Les assets : toutes les données du CD en formats d'aujourd'hui (PNG, WAV, MIDI, MP3, MP4,
  JSON), refaites à l'identique pour le jeu ; les films joués en vidéo par la page
- [ ] Finition des images pour les écrans d'aujourd'hui : les images intermédiaires des attractions
  (RIFE, Interprite) sont en place, à revoir attraction par attraction ; les sprites HD, sans images
  à montrer, ont été retirés le 26 septembre 2026

## Licences

- `moteur/hote/opl.js`, la puce de synthèse FM, dérive de Nuked OPL3 (Copyright (C) 2013-2020
  Nuke.YKT) et reste sous licence GNU LGPL 2.1 ou ultérieure ; le texte de la licence est dans
  `LICENCES/LGPL-2.1.txt`.
- La licence du reste du dépôt n'est pas encore choisie : elle est à fixer avant toute publication.
- Les données du jeu d'origine (images, sons, musiques, films, textes) sont dans le dépôt,
  extraites du CD (voir plus haut) ; son code n'y est pas.

## Le jeu d'origine corrigé

Avant ce chantier, plusieurs défauts du jeu de 1994 ont été corrigés sur une copie personnelle, pour
le jouer sous DOSBox : souris figée en haute résolution, vitesse dépendante de la machine, cadence
d'affichage, retour des quatre vitesses de simulation. Cette voie est abandonnée au profit du
moteur, mais le détail reste consigné dans le [journal des essais](docs/journal-des-essais.md).

```bash
python outils/patch-theme-park.py [source] [destination]
```
