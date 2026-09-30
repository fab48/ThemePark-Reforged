# Faisabilité : la bascule des écrans pleins et les demandes A à D

Étude du 25 septembre 2026, faite sur la lecture du code et des documents, et sur deux mesures sous
Node (le scénario `ecrans-pleins` joué avec toutes les réécritures, la page imitée : une image
publiée par 1/60 s virtuelle, comme le `presenter` de `moteur/web/travailleur.js`, et résumée — taille,
mode, écran, indices nuls ou palette noire). Elle répond au bogue 3 et aux demandes A, B, C et D de
[demandes.md](demandes.md) ; la demande F (la fenêtre de paramètres et de débogage) est réalisée à
part et n'apparaît ici que par ses liens avec les autres points.

(Note du 26 septembre 2026 : les sprites HD dont parle l'étude ont été retirés, faute d'images à
montrer et pour leur coût ; voir [architecture.md](architecture.md), « Les sprites HD, retirés ».
Pour A, c'est la voie des images cuites, retouchées par la page, qui a été suivie.)

Deux familles de changements, à ne pas confondre :

- **côté page** (`moteur/web/`, et ce que le travailleur publie) : l'image montrée change, pas le
  jeu. Les vérificateurs ne sont pas concernés, rien n'est à prouver contre l'original ;
- **côté jeu, en réglage** (`moteur/jeu/reglages.js`, comme la grande vue) : un écart assumé, éteint
  par défaut, qui doit laisser le jeu d'origine intact quand il est éteint (rejeu empoisonné
  IDENTIQUE) ; allumé, la partie peut différer.

---

## Bogue 3 : la bascule des écrans pleins

### Ce que fait le jeu d'origine

`0x1171F` (`passerEn320`, `moteur/jeu/amorcage.js`) ne fait quelque chose **qu'en 640x480** (`mode & 8`) :
il rend le mode (`0x7E0E1`), passe en mode 13h (`0x7EC50`), remet les données à l'échelle
(`0x10D42(1)`) et lève `0xB1510`. `0x11761` (`revenirEn640`), appelée au début de chaque image de la vue
du parc, défait tout si `0xB1510` est levé, puis efface la mémoire vidéo (`0x55FCF`). En 320x200, rien
ne bascule. **Le jeu de 1994 le fait donc bien, et seulement depuis le 640x480.** Les écrans qui
basculent :

| Écran | Où | Remarque |
|---|---|---|
| le relevé bancaire (0x40) | `0x77A55`, `carte-du-parc.js` | clic droit sur l'argent |
| le département des recherches (0x4E) | `0x515A0`, `menus.js` | ne rebascule pas si un autre écran l'a déjà fait (`0xB9758`) |
| les négociations | `negociations.js` | idem, par `0xB1510` |
| la fin d'année (trophées, bilan, enchères) | `fin-annee.js` | idem |
| l'écran titre | `0x1A921`, `evenements.js` | depuis le parc (Alt+Échap) |
| les films des attractions | `son-du-jeu.js` | par `0x7EC50` directement |

Les autres écrans pleins — fiches ouvertes par `0x35F21`, gestion, listes, carte du parc, pensées,
finances — restent en 640x480 dans l'original. **En grande vue**, ils repassent en revanche de W x H
à 640x480 (`quitterLaVueDuParc`, `grande-vue.js`), puis reviennent à W x H : c'est un changement de
taille de plus, qui n'est pas dans l'original.

Sur une machine de 1994, le passage VESA 0x101 → mode 13h change la fréquence de balayage (60 → 70
Hz) : le moniteur se resynchronisait, écran noir d'une demi-seconde à deux secondes selon le modèle.
La bascule était donc bien plus visible qu'ici.

### Ce qu'on voit pendant la bascule (mesuré)

Une image par ligne, à 30 images par seconde (le relevé ouvert puis refermé, `ecrans-pleins`) :

| Moment | Images publiées |
|---|---|
| ouverture du relevé depuis le 640x480 | parc 640x480 → **1 image 320x200 noire** (indices nuls) → relevé 320x200 |
| fermeture (Espace) | relevé 320x200 → **1 image 640x480 noire** (indices nuls) → **1 image 640x480 à palette noire** → parc |
| fermeture du relevé en 320x200 (sans bascule) | relevé → 1 image noire (indices nuls) → 1 image à palette noire → parc |
| passage en grande vue (touche R, 1280x720) | 1 image 640x480 noire → 1 image 640x480 du parc → 1 image 1280x720 noire → parc 1280x720 |

Deux causes se superposent :

1. **Les images noires.** Le changement de mode de l'hôte (`Video.changerMode`, `changerModeLibre`)
   vide la mémoire vidéo, `0x55FCF` aussi ; et le travailleur publie au repère d'image (`0x7D775`,
   `Machine.avancer` → `observateurs`), c'est-à-dire **avant** la copie de l'image que le jeu vient de
   dessiner : la première publication après un changement de mode est donc l'écran vide. L'image à
   palette noire vient du jeu lui-même (`0x7C32D` éteint la palette par `0x4820D` au retour d'un
   écran à part) : elle existe aussi en 320x200, sans bascule.
2. **Le cadre de la page qui change de taille.** `affichage.js` (`dimensions`, `ajuster`) taille le
   canevas au format de l'image : 320x200 (étiré de 1,2) et 640x480 donnent le même cadre 4:3, mais la
   grande vue est au format de la zone (16:9). À chaque passage entre un écran plein et le parc en
   grande vue, le canevas change de taille, `canvas.width` est réécrit (le tampon est vidé) et la page
   se remet en page : c'est le « clignotement de la fenêtre ». Sans grande vue, seul le point 1 joue.

À confirmer par une mesure dans le navigateur : la fermeture d'un écran plein en grande vue (la
mesure sous Node n'a pas pu y aller, le scénario divergeant une fois la grande vue allumée).

### L'adoucir

| Moyen | Où | Difficulté |
|---|---|---|
| **Un cadre fixe** : le canevas prend toute la zone, une fois pour toutes ; l'image y est placée par `gl.viewport` (bandes noires), au format 4:3 ou à celui de la grande vue. Plus de redimensionnement du canevas. La souris (`position` dans `principal.js`) doit alors se rapporter au rectangle de l'image, et non plus à celui du canevas | `affichage.js`, `principal.js` | petite |
| **Garder la dernière image** : ne pas publier une image dont tous les indices sont nuls dans les 300 ms qui suivent un changement de mode (ou, plus juste, ne publier après un changement de mode qu'une image qu'une présentation a remplie : les crochets de fin de présentation de `vue-fluide.js`, `0x80210` et `0x55507`, le disent) | `travailleur.js` (ou `Video`) | petite |
| **Un fondu enchaîné** : à un changement de taille ou d'écran (`0xD6652`), la page garde la texture précédente et mélange l'ancienne et la nouvelle image pendant 150 à 250 ms (une seconde texture et un facteur de mélange dans le nuanceur ; pour les sprites HD, deux textures HD) | `affichage.js` | moyenne |
| **Rester en 640x480 dans le jeu** (un réglage qui supprimerait la bascule) | les écrans en 320x200 | grande, déconseillé |

Le dernier moyen n'apporterait rien à l'œil : ces écrans sont dessinés pour le mode 1 (fonds de
320x200 chargés tels quels dans la surface, lignes de 320 octets par `0x81590`, traceur qui divise
les coordonnées par deux), et leurs images n'existent qu'en 320x200 ; la page les agrandit déjà. La
« basse définition » est celle des images d'origine (voir C pour les fonds HD).

**Risques.** Garder la dernière image cache aussi des images noires que l'original montre (le noir
d'après la fermeture du relevé, en 320x200 comme en 640x480) : c'est un choix d'affichage, à mettre
derrière un réglage de la page (« transitions adoucies », allumé par défaut), et à borner (300 ms,
indices tous nuls seulement) pour ne pas figer un vrai fondu au noir (fin de partie, films). Avec les
sprites HD, un cliché de plus de 300 ms fait déjà revenir à l'image indexée : pas de conflit. Le
défilement fluide n'est pas concerné (pas de glisse au changement de mode).

**Dépendances.** Aucune. Le cadre fixe est le socle de C et de D.

**Étapes.** 1) Cadre fixe et souris rapportée à l'image (petite, sans risque pour le jeu). 2) Tenue
de la dernière image, derrière un réglage de la page. 3) Fondu enchaîné, si le résultat des deux
premières ne suffit pas. 4) Mesurer dans le navigateur : relevé, recherches, fiche ouverte en grande
vue, avec et sans sprites HD. 5) Le bogue 3 est alors attribué au jeu d'origine (la bascule) et à la
page (le cadre), et corrigé côté page.

---

## A : des images d'animation en plus pour les attractions

### Comment une attraction est animée

- **Les données.** Un objet graphique (`[0xD3B80]`, 8 octets) est une chaîne de morceaux
  (`[0xD3B7C]`, 10 octets : image, dx, dy, drapeaux, suivant), chacun une image de la banque
  (`[0xD3BB8]`, 6 octets : pixels, largeur, hauteur). **Le mot +6 d'un objet graphique désigne l'image
  suivante de l'animation**, le bit 0 de l'octet +5 marque la dernière de la boucle
  (`imageSuivante`, `derniereDeLaBoucle`, `attractions.js`). Ces tables viennent vraisemblablement de
  `MSPR-0.INF` (à établir). Les images de repos, de marche et d'arrêt sont dans la fiche du genre
  (+0x24, +0x26, +0x28), l'incident en +0x5F, la fumée de l'usure en +0x8E (figure 0x167), le décor et
  le numéro d'un spectacle en +0x87 et +0x89.
- **La simulation** (`attractions.js`, `0x2FB85` et les autres modes) : l'attraction garde en +0x0A
  l'objet graphique courant ; `imageDue` décompte +0x14, et l'animation avance d'une image tous les
  **2 × délai + 1 pas** (délai +0x13, recopié de la fiche +0xB8, réglable de 0 à 6 par le joueur).
- **Le dessin** : `0x1B837` (`dessin-carte.js`) parcourt la carte, `0x1C22A` (`objets.js`) confie
  l'attraction à `0x1D87A` (`dessin-attractions.js`), qui trace l'objet +0x0A par `0x209B5` et les
  passagers par `0x69840` : **les places sont des morceaux de l'objet graphique lui-même** (drapeau
  0x80), où chaque passager prend l'image de sa sorte.
- **La cadence** : un pas par image à la vitesse normale, 30 images par seconde. Délai 3 : une image
  d'animation tous les 7 pas, 4,3 par seconde ; délai 0 : une par image. Plus vite (vitesse + 1 pas par
  image), l'animation va aussi vite que la simulation.

### L'animation fait partie de la simulation

Oui, et à plusieurs titres : au départ (phase 1) et à l'arrêt (phase 3), l'attraction **attend la
fin de la boucle** d'animation ; le mécanicien ôte 5 d'usure **par boucle** (`0x33AF3`) ; les
passagers des manèges qui tournent (disposition 0 et 1) changent de place à chaque boucle (compteur
+0x20) ; l'usure d'un départ dépend du délai. Ajouter des images aux boucles, ou changer le délai,
change donc la partie. **Ralentir la cadence** n'est possible que par le délai, qui est déjà un
réglage du jeu (et qui change l'usure et le débit) ; un ralenti de l'affichage seul est impossible,
l'image devant suivre l'état (clics, passagers). Les wagons des attractions à voie, eux, avancent en
256es de case par pas : leur fluidité est une affaire de position, pas d'image (à traiter comme le
défilement fluide, hors de cette demande).

### Trois façons d'intercaler des images

1. **Dans l'image HD seulement** (`moteur/jeu/sprites-hd.js`, fidèle : le jeu ne change pas). Un
   sprite HD pourrait avoir des sous-images (`MSPR-0/00042-1.png`, `-2`…), choisies selon
   l'avancement de l'image courante, lu dans l'attraction : 1 − (+0x14 + 1) / (2 × délai + 1). Il
   faut un crochet en lecture seule dans `0x1D87A` pour relier les poses de l'objet à son attraction.
   **Limites fortes** : la règle de sûreté du module (un bloc HD n'est montré que là où le jeu a posé
   le sprite d'origine, plus le débordement sur ses pixels transparents) confine chaque sous-image à
   l'emprise de l'image d'origine ; les passagers, sprites à part, ne peuvent pas se déplacer entre
   deux places ; délai 0 ne laisse aucune place ; rien sans les sprites HD. Code : moyenne ; images :
   grande.
2. **Des objets graphiques intercalés, dessinés par le jeu** (réglage non fidèle, comme la grande
   vue ; recommandé). La simulation garde +0x0A et son rythme ; seul `0x1D87A`/`0x69840`, réglage
   allumé, trace à la place un objet graphique intermédiaire choisi par le même avancement. Ces
   intermédiaires sont de vrais objets graphiques, avec leurs places (drapeau 0x80) : les passagers
   suivent le mouvement. Il faut ajouter des images à la banque `MSPR-0` et des entrées aux trois
   tables — en recopiant les tables hors de la mémoire du jeu, comme les tampons de la grande vue,
   pour ne toucher ni au tas ni aux sauvegardes (les objets du parc ne gardent que des numéros) —
   plus une table « image → intermédiaires ». En 320x200, les dimensions des images sont doublées au
   chargement (`0x10C80`) : les nouvelles aussi. Le dessin a des effets (le clic est attribué pendant
   le dessin, `0x20FF5` compare le pointeur aux images tracées) : la partie peut différer d'un clic
   près. Montré en image indexée comme en HD. Code : moyenne ; images : grande.
3. **Une interpolation automatique de l'image finale** (flot optique, IA), côté page : pixel art,
   interface et curseur par-dessus, vitesse du navigateur — à écarter.

**Fabriquer les images.** Un outil sous Node (petite) inventorie les boucles : pour chaque genre, les
chaînes +6 depuis +0x24, +0x26, +0x28, +0x5F, les figures des spectacles ; il rend chaque objet
graphique entier (sans passagers) et chaque paire (image, suivante). Les intermédiaires sont dessinés
ou générés (RIFE, FILM, ou un modèle d'image guidé) sur les versions agrandies, puis, pour la voie 2,
ramenés à la palette `MPALETTE` et à la taille d'origine, les places reportées à la main. C'est le gros
du travail, et le résultat sur du pixel art est incertain : à essayer sur une attraction avant tout.

**Risques.** Qualité des images générées ; volume (une trentaine de genres, des boucles de 4 à 16
images, à établir par l'inventaire) ; artefacts de transparence (bogue 1) qui toucheraient d'abord
les sprites HD ; une attraction à délai 0 ne gagne rien.

**Dépendances.** Les sprites HD (voie 1 ; voie 2 pour les versions HD des intermédiaires) ; le
bogue 1 ; F, pour lire en direct +0x0A, +0x13, +0x14, +0x20 et la phase +0x32 pendant la mise au
point.

**Étapes.** 1) L'inventaire des boucles (outil, petite). 2) Un prototype de la voie 2 sur une
attraction simple sans places tournantes (un spectacle ou FLIGHT SIM), intermédiaires dessinés à la
main. 3) Juger à l'écran, à la vitesse normale et plus vite. 4) Si c'est concluant, la chaîne de
fabrication (génération, palette, places) et l'extension aux autres genres ; la voie 1 seulement si
l'on veut rester strictement fidèle.

---

## B : le multilingue

### Ce que contient le CD

Cinq fichiers de textes, `jeu/GAME/DATA/LANG0-0.DAT` à `LANG4-0.DAT` : anglais, allemand, italien,
espagnol, français. La table `0xB7E17` du programme donne « U0 G1 I2 S3 F4 P5 66 77 88 99 » ; `-l`
prend la lettre ou le chiffre (`-lF` = `-l4`), et le lanceur comme la page passent `-l4`
(`principal.js`, `lancer.mjs`, `partie.mjs`). **Le portugais (P5) est prévu mais absent du CD** : `-l5`
échoue au chargement (« failed to allocate memory for language text », `0x104A3`). Le programme est
le même pour toutes les langues.

`0x2E20C` (`chargerLesTextes`, `evenements.js`) remplace le premier `0` du nom par le rang de la
langue (`[0xD775F]`), charge le fichier (un mot : 26 sections ; un mot par section ; les chaînes à la
file) et dresse 26 tables de pointeurs sur le tas (`TABLES_DES_TEXTES`). Relevé : 1 093 à 1 149
chaînes selon la langue, **les mêmes nombres par section** sauf la section 16 (le menu de l'écran titre
et les crédits : 87, 80, 80, 39, 94) et la 25 (le tutoriel : 29 en anglais et en français, 28 ailleurs,
la dernière vide).

Les noms des catalogues (attractions, boutiques, métiers, décors) sont recopiés des textes dans les
catalogues de référence à l'entrée dans le parc (`0x12452`, `entrerDansLeParc`), puis dans ceux de la
partie à la nouvelle partie (`0x19EEE`) ; **ceux de la partie sont sauvegardés** : un parc garde les
noms de la langue où il a été créé (le parc de la démonstration, `DEMO.GY`, est en anglais).

### Les textes dans les images, les polices

- **Images.** Les fonds relus (`MSTATE`, `MRES`, `MSTOCK`, `MAUCT`, `MMENU`) n'ont d'autre texte que
  des marques (« theme PARK », « BULLFROG », « LIVECASH MIDLAND ») ; l'interface (`MREQ-0`) est faite
  d'icônes. Rien à traduire dans les images vues ; à vérifier sur `MNEG`, `MAWAR0/1`, `MGLOBE`,
  `MMAP`, les films (`RIDEANI.*`, `BUSTED`, `TAKOVER`) et `INTRO.EXE` (hors du moteur).
- **Polices** (`MFONT-0`, 104 images ; tables `0xB51C1` pour la police de l'interface, `0xB50C1` pour
  la grande police des titres). Chiffres, majuscules, quelques signes ; les minuscules renvoient aux
  majuscules. En plus des 45 signes du § 11.2 de la rétro-ingénierie, les tables mènent à une dizaine
  d'images accentuées : Ä Ö Ü (codes 0x8E, 0x99, 0x9A de la page 437 et leurs équivalents Latin-1,
  minuscules comprises), ß, À È Ì Ò Ù (codes Latin-1 seulement), Ñ (0xA4, 0xA5). **Il n'y a ni É, ni Ê,
  ni Ç, ni Ó, ni Í.** Les textes allemands (page 437) sont donc complets ; les textes français sont
  écrits sans accents, et les rares accents des fichiers (« barri\x8Are » en français, « atracci\xA2n »,
  « v\xA1a » en espagnol, des mots en minuscules) tombent sur l'image vide : fidèle à l'original.
- **Sons** : aucune voix connue dans les bruitages (à vérifier : `SNDS0`, `SNDS1`).

### Changer de langue

| Quoi | Comment | Difficulté |
|---|---|---|
| **Au lancement** | un choix de la page (gardé comme les autres) qui passe `-l<n>` au travailleur ; changer relance le jeu (écran titre). Rien ne change dans le jeu | petite |
| **À chaud, sans relancer** | un réglage : charger `LANGn-0.DAT` hors de la mémoire du jeu (la mémoire étendue de la grande vue), y dresser les 26 tables, écrire les 26 pointeurs et `[0xD775F]` ; refaire la copie des noms de `0x12452` dans les catalogues de référence **et** dans ceux de la partie (en ne remplaçant que les noms restés ceux de l'ancienne langue : le joueur a pu renommer), puis redemander la carte et la fenêtre ouverte | moyenne |
| **Une langue nouvelle** (portugais, néerlandais…) | écrire un `LANG5-0.DAT` au même format (le format est simple), et la traduction de ~1 100 chaînes aux longueurs contraintes | petite pour l'outil, grande pour la traduction |
| **Le français accentué** | des images de plus dans `MFONT-0` et des entrées dans les deux tables (au chargement, réglage non fidèle), et un fichier de textes réécrit | moyenne |

À chaud, des tables propres évitent le débordement (les sections 16 et 25 n'ont pas partout le même
nombre de chaînes) et laissent le tas intact. Les textes déjà copiés ailleurs (messages en attente
dans la barre, saisies) gardent leur langue jusqu'à leur remplacement ; le plus sûr est de n'autoriser
le changement qu'à l'écran titre ou dans le parc sans fenêtre ouverte.

**Ce qui n'existe qu'en une langue** : les marques dans les images, les noms des catalogues du parc de
démonstration (anglais), les crédits (propres à chaque fichier), l'introduction (`INTRO.EXE`).

**Risques.** Les textes allemands sont plus longs (35,7 Ko contre 30,2 en anglais) : l'original les
coupait déjà dans les mêmes cadres (même programme), mais un titre de plus de 28 octets déborderait la
vague des titres (anomalie connue, § 11.16). Une sauvegarde faite dans une langue garde ses noms dans
une autre.

**Dépendances.** F peut accueillir le choix de la langue ; aucune avec A, C, D.

**Étapes.** 1) Le choix au lancement dans la page (petite). 2) Un outil qui compare les cinq fichiers
section par section, pour relever les écarts de sens et de longueur. 3) Le changement à chaud, derrière
un réglage. 4) Plus tard, si voulu : une langue nouvelle, les accents français.

---

## C : monter en 720p

### Où l'on en est

La grande vue (`grande-vue.js`) donne au parc une image de W x H (720 lignes au plus, 1280x720 en
16:9), barre d'outils et barre des messages centrées en bas, icônes au coin droit, barre de menus sur
toute la largeur, bandeau du bas uni. Restent en dehors :

- **les boîtes de dialogue et messages par-dessus le parc** (écrans 0x4A, 0x54, 0x56, 0x64 : questions,
  « démolir ? ») : dessinés aux coordonnées du 640x480, au coin haut gauche ;
- **les écrans pleins en 640x480** (fiches `0x35F21`, gestion, listes, carte du parc, pensées,
  finances) : la grande vue en sort, la page les montre en 4:3 ;
- **les écrans en 320x200** (relevé, recherches, négociations, fin d'année, titre, carte du monde,
  films) : images d'origine de 320x200.

### Ce qu'il faudrait pour un jeu entièrement en 1280x720

1. **Un cadre de 1280x720 pour tout** (côté page, petite ; c'est le cadre fixe du bogue 3). Le parc
   en grande vue remplit le cadre ; tout autre écran y est centré à **960x720** : ×1,5 pour le 640x480,
   ×3 pour le 320x200 étiré à 4:3 (320x240 × 3), avec des bandes (noires, ou un fond flouté de l'image).
   Un bouton « 1280x720 fixe » envoie cette taille au lieu de celle de la zone (`envoyerLaTaille`).
2. **Les dialogues centrés dans la grande vue** (réglage, moyenne à grande). Le jeu les dessine en
   coordonnées de 640x480 ; plutôt que de réécrire leurs rectangles, décaler le repère le temps de leur
   dessin : la surface `[0xDE5BC]`, le fond `[0xD3B98]` et la grille des blocs d'un décalage multiple
   de 32 en x et de 16 en y (la grille est un tableau à deux dimensions de pas `pasRangee` : un
   décalage de blocs entiers y tombe juste), la fenêtre de découpe à 640x480 ; et, pendant le
   traitement de leurs entrées, la souris (`0xBECAC`, `0xBECAE`) ramenée dans leur repère, les zones
   cliquables (`0xCE898`) restant celles de 640x480. Point d'appui : la routine du message dans la
   boucle du parc (`vueDuParc`, `amorcage.js`, `0x78B7E` pour 0x4A). À prototyper sur « démolir ? ».
3. **Les écrans pleins en 640x480**, deux voies :
   - centrés dans le cadre par la page (point 1) : petite, et suffisant ;
   - dessinés au centre de la grande surface, le parc figé autour (réglage, grande) : ces écrans
     prennent le chemin des rafraîchissements totaux (`[0xD6BCD]` : `0x81CB0` recopie 480 lignes,
     `0x81CD4` présente l'image entière, `0x815B8`, `0x55EFA` supposent des lignes de 640) ; chaque
     routine qu'ils appellent devrait lire la géométrie dans `ecran`, comme l'a fait la grande vue pour
     le parc — un inventaire du même ordre, sur beaucoup plus de code.
4. **Les écrans en 320x200** : la définition vient des images. Il faudrait des **fonds HD** (13 fonds
   dans `assets/fonds/`, agrandis) et les banques de ces écrans (`MRSSPR`, `MSTSPR`, `MAUSPR`, `MPLAY`,
   `MHAND`, `MCUP`) en HD. Le module des sprites HD ne suit aujourd'hui que les six banques résidentes
   et la palette `MPALETTE` : il faudrait reconnaître un fond au chargement de son fichier dans la
   surface (`0x7F0B0` avec `data/mstate-0.dat`…) et suivre la palette de l'écran. Moyenne à grande,
   plus les images.
5. **L'interface du parc** : faite. Le pointeur reste l'original agrandi.

**Risques.** Le décalage du repère (point 2) touche la souris et la grille : une zone oubliée donne un
clic à côté ou un bloc non présenté ; il faut le borner aux écrans listés et le vérifier écran par
écran. La voie « parc figé autour » (point 3) est un chantier de l'ampleur de la grande vue.

**Dépendances.** Le cadre fixe (bogue 3) ; les sprites HD (fonds HD) ; D, qui fait varier la taille de
la grande vue.

**Étapes.** 1) Cadre de 1280x720 et écrans centrés à 960x720 (page). 2) Option « 1280x720 fixe ». 3)
Prototype du décalage de repère sur 0x4A, puis 0x54, 0x56, 0x64. 4) Fonds HD pour les écrans en
320x200. 5) Seulement ensuite, et si l'on y tient, les écrans pleins dessinés dans la grande surface.

---

## D : zoomer et dézoomer à la molette

### Deux façons

- **Agrandir l'image côté page** (un facteur entre l'image du jeu et l'écran, recadrée) : le jeu
  dessinerait toujours la plus grande vue, la page en montrerait une partie. L'interface (barre
  d'outils, icônes, menus) serait coupée ou agrandie avec le parc, le bord de l'écran que le jeu
  surveille pour défiler ne serait plus sous la main, et la souris demanderait une conversion inverse.
  **À écarter**, sauf pour une loupe plus près que 640x480, qui n'est pas demandée.
- **Une vraie vue de taille variable** (recommandé) : la molette change la taille de la grande vue,
  de 480 lignes (« 640x480 au plus près » ; au format de la zone, 864x480 en 16:9, ou 640x480 exact)
  à 1920x1200 au plus (la mosaïque du défilement fluide, 4096 de côté, la borne ; le monde fait 2 048
  pixels de large : à 1920, le parc tient presque en entier). Le jeu dessine plus ou moins de cases ;
  la page affiche l'image dans le cadre fixe, à l'échelle zone / taille.

### Ce qu'il faut faire

- **La page** (`principal.js`) : un `wheel` sur le canevas (`preventDefault`, aussi en souris
  capturée), des crans de hauteur multiples de 16 (480, 528, 576, 624, 672, 720, 816, 912, 1008,
  1080, 1200), la largeur tirée du format de la zone et arrondie à 32 (`tailleDeLaGrandeVue`) ; un
  envoi par 100 ms au plus (entrée 11). Le cadre fixe du bogue 3 évite une remise en page par cran.
- **Le jeu** (`grande-vue.js`) : le changement de taille existe déjà (`entrerDansLaVueDuParc` quitte
  puis réapplique, carte redemandée). À ajouter : **garder le point visé**. La caméra est en cases
  entières (`0xD667A` colonne, `0xD6666` rangée, `etat.js`) ; à chaque cran, la décaler de la moitié
  de l'écart de taille (environ ΔR = −ΔH / 2 / 16 et ΔC = −ΔW / 2 / 24 − ΔR / 3, le biais de la vue, à caler sur la projection du § 5.1 de la rétro-ingénierie), ou autour
  de la case sous le pointeur, bornée par les bords de la carte (`carte.js`). L'ancrage saute d'une
  case au plus : le défilement fluide pourrait l'adoucir plus tard. La grande vue n'existe qu'en
  640x480 dans le parc : en 320x200, la molette ne fait rien (ou passe en 640x480, comme R).
- **La souris** : rien de neuf côté travailleur (positions normalisées, converties avec la taille du
  moment) ; la page doit seulement rapporter les positions au rectangle de l'image dans le cadre fixe.
- **La cadence** : le coût du dessin suit la surface (1920x1200 : 7,5 fois 640x480), et celui des
  sprites HD aussi (x2 à 1280x720 : environ 40 s de calcul pour 70 s de jeu ; au-delà de 3 840 x 1 440
  pixels HD, le facteur est déjà réduit). À mesurer au plus grand cran avec
  `travail/essai-grande-vue.mjs` avant de fixer la borne.
- **Défilement fluide** : pas de glisse au changement de taille (déjà la règle), la mosaïque est
  reprise ; compatible. **Sprites HD** : `appliquer` redemande la carte, le sol repasse en HD dès
  l'image suivante ; compatible.

**Risques.** Chaque cran est un changement de mode de l'hôte : sans la tenue de la dernière image
(bogue 3), une image noire par cran. La partie peut différer de l'original (c'est déjà le cas en
grande vue), et un peu plus : la caméra est déplacée par la page. La « vue réduite » du jeu d'origine
(`0xD667C` = 8, § 6.4) n'est pas un zoom du parc, et n'est pas en jeu ici.

**Dépendances.** La grande vue ; le cadre fixe et la tenue de la dernière image (bogue 3) ; C (le
cran de 720 lignes en est la taille « 720p »).

**Étapes.** 1) La molette dans la page, sans ancrage (petite). 2) L'ancrage de la caméra (moyenne).
3) La mesure de la cadence au plus grand cran, et la borne. 4) Un réglage « molette : zoom » dans la
page ou dans F.

---

## F : liens avec la fenêtre de paramètres et de débogage

F est réalisée à part ; elle croise les autres points ainsi :

- **Bogue 3** : montrer le mode (`0xDE5F6`), la bascule (`0xB1510`, `0xB9758`), l'écran (`0xD6652`),
  et un compteur des images publiées vides ou tenues.
- **A** : relire une attraction désignée (+0x0A, +0x13, +0x14, +0x20, +0x32, +0x2E) pour régler les
  intermédiaires.
- **B** : `[0xD775F]`, et un lieu naturel pour le choix de la langue.
- **C, D** : la géométrie `ecran` de `grande-vue.js`, la taille voulue, la caméra, le cran de zoom.
- **Fichiers partagés** : `principal.js`, `index.html`, `travailleur.js` (les numéros de type de la
  file des entrées : 1 à 12 sont pris, sauf 5 ; s'entendre sur les suivants) et `reglages.js`.

---

## Ordre de réalisation recommandé

1. **Bogue 3, côté page** : cadre fixe, souris rapportée à l'image, tenue de la dernière image
   (petite). C'est le socle de C et de D, et il corrige un défaut visible tout de suite.
2. **B, le choix de la langue au lancement** (petite) : quatre langues de plus pour presque rien.
3. **D, la molette** : d'abord sans ancrage, puis avec (moyenne) — elle réutilise la grande vue.
4. **C** : écrans centrés à 960x720 et « 1280x720 fixe » (petite), puis le décalage de repère des
   dialogues (moyenne à grande), puis les fonds HD.
5. **B, le changement à chaud** (moyenne), si le choix au lancement ne suffit pas.
6. **A** : l'inventaire des boucles, un prototype sur une attraction, puis décider (grande, surtout
   pour les images).

F avance en parallèle ; elle sert d'instrument à 1, 5 et 6.
