# Les animations des attractions

Demande A de [demandes.md](demandes.md) : fluidifier les attractions. L'étude de faisabilité est dans
[faisabilite.md](faisabilite.md) (section A) ; ce document en donne le recensement et le prototype.

## Le recensement

`node moteur/node/animations.mjs` joue `simulation.json` jusqu'au parc (20 s), puis lit, sans rien
écrire, le catalogue des genres, les figures, les objets graphiques et leurs morceaux dans la mémoire
du jeu (§ 6.4 et § 10.3 de [retro-ingenierie.md](retro-ingenierie.md)). Pour chaque genre, il suit
depuis les figures du repos (+0x24), de la marche (+0x26) et de l'arrêt (+0x28) la chaîne des images
(mot +6), jusqu'à retomber dans la boucle ; les états qui partagent une boucle sont regroupés.
`--markdown fichier` écrit le tableau ci-dessous, `--json fichier` le détail. Depuis le 28 septembre
2026, il écrit à la suite un second tableau, les autres animations du parc (plus bas, « Les autres
animations du parc »).

Les colonnes :

- **Pas par image** : une attraction à tours avance d'une image tous les 2 × délai + 1 pas, un
  numéro de spectacle tous les délai + 1 pas ; **images/s** à la vitesse normale (30 pas par seconde).
  Les figures des attractions à train sont celles d'éléments de voie, menées par les wagons (§ 10.6) :
  pas de cadence ici.
- **Places** : les morceaux marqués 0x80 de l'image, où les passagers sont tracés.
- **Saut des places** : de combien de pixels (en 640x480) une place se déplace d'une image à la
  suivante, en moyenne et au plus. Les morceaux de deux images successives sont appariés au plus près
  (par le pied de leur image, 48 pixels au plus : `apparier`, `moteur/jeu/animations-intercalees.js`).
- **Morceaux** : parmi les autres morceaux appariés, ceux qui gardent leur image et se déplacent (une
  pose qu'on peut interpoler exactement), ceux qui changent d'image (ce qui tourne ou se déforme :
  seule une image nouvelle ferait mieux qu'un saut), ceux qui ne bougent pas.
- **Note de saccade** : le saut moyen des places multiplié par la durée d'une image (en dixièmes de
  seconde) ; plus elle est haute, plus les passagers sautent loin et rarement.

| Genre | Mode | Délai | Pas par image | Images/s | État(s) | Images par boucle | Places | Saut des places (px, moyen / max) | Morceaux : même image déplacée / image changée / fixes | Note de saccade |
|---|---|---|---|---|---|---|---|---|---|---|
| FLIGHT SIM | à tours | 4 | 9 | 3,3 | repos | 6 | 0 | 0 / 0 | 0 / 6 / 0 | 0 |
| TREE HOUSE | à tours | 4 | 9 | 3,3 | repos | 8 | 1 | 12,6 / 41,2 | 6 / 6 / 34 | 37,8 |
| TREE HOUSE | à tours | 4 | 9 | 3,3 | marche, arret | 28 | 1 | 3,5 / 4 | 0 / 20 / 168 | 10,5 |
| PIRATE BOAT | à tours | 4 | 9 | 3,3 | repos | 18 | 8 | 6,7 / 42,6 | 0 / 48 / 24 | 20,1 |
| PIRATE BOAT | à tours | 4 | 9 | 3,3 | marche | 16 | 8 | 7,8 / 47,5 | 0 / 42 / 22 | 23,5 |
| PIRATE BOAT | à tours | 4 | 9 | 3,3 | arret | 16 | 8 | 7,5 / 42,6 | 0 / 48 / 16 | 22,4 |
| PLANE FLYER | à tours | 4 | 9 | 3,3 | repos, marche, arret | 4 | 4 | 10,5 / 18,1 | 0 / 8 / 0 | 31,6 |
| MAZE | à tours | 4 | 9 | 3,3 | repos, marche, arret | 1 | 0 | 0 / 0 | 0 / 0 / 0 | 0 |
| GHOST HOUSE | à tours | 4 | 9 | 3,3 | repos | 6 | 1 | 8,6 / 10,1 | 1 / 14 / 6 | 25,8 |
| GHOST HOUSE | à tours | 4 | 9 | 3,3 | marche | 4 | 0 | 0 / 0 | 0 / 6 / 4 | 0 |
| GHOST HOUSE | à tours | 4 | 9 | 3,3 | arret | 5 | 1 | 9,9 / 14,6 | 1 / 13 / 5 | 29,8 |
| HAUNTED HOUSE | à tours | 4 | 9 | 3,3 | repos, marche, arret | 15 | 0 | 0 / 0 | 0 / 63 / 15 | 0 |
| RUBBER TUBING | à bouées | 4 | — | — | aucun objet graphique (voie, bouées ou voitures) | — | — | — | — | — |
| RACE CAR RIDE | à voitures | 4 | — | — | aucun objet graphique (voie, bouées ou voitures) | — | — | — | — | — |
| ROLLER COASTER | à train | 4 | — | — | aucun objet graphique (voie, bouées ou voitures) | — | — | — | — | — |
| LOOP THE LOOP | à train | 0 | — | — | repos, arret | 20 | 1 | 10,8 / 17 | 1 / 18 / 20 | 0 |
| LOOP THE LOOP | à train | 0 | — | — | marche | 19 | 1 | 11,4 / 15,6 | 1 / 17 / 19 | 0 |
| CORK SCREW | à train | 0 | — | — | repos, arret | 10 | 1 | 11,8 / 18,5 | 0 / 9 / 10 | 0 |
| CORK SCREW | à train | 0 | — | — | marche | 10 | 1 | 12,4 / 19,2 | 0 / 9 / 10 | 0 |
| BIG WHEEL | à tours | 4 | 9 | 3,3 | repos, marche, arret | 6 | 6 | 6,3 / 11,5 | 0 / 39 / 0 | 18,8 |
| MERRY-GO-ROUND | à tours | 4 | 9 | 3,3 | repos | 6 | 4 | 5,8 / 9,7 | 24 / 6 / 0 | 17,5 |
| BOUNCY CASTLE | à tours | 4 | 9 | 3,3 | repos, marche | 5 | 4 | 3,6 / 7 | 0 / 5 / 0 | 10,8 |
| BOUNCY CASTLE | à tours | 4 | 9 | 3,3 | arret | 6 | 4 | 1,8 / 10,5 | 0 / 6 / 0 | 5,5 |
| SPACE SHUTTLE | à tours | 4 | 9 | 3,3 | repos | 28 | 6 | 10 / 44,8 | 0 / 50 / 18 | 29,9 |
| SPACE SHUTTLE | à tours | 4 | 9 | 3,3 | marche | 8 | 6 | 16,6 / 40 | 0 / 16 / 8 | 49,7 |
| SPACE SHUTTLE | à tours | 4 | 9 | 3,3 | arret | 20 | 6 | 9 / 36 | 0 / 34 / 18 | 27 |
| BIG DIPPER | à train | 4 | — | — | aucun objet graphique (voie, bouées ou voitures) | — | — | — | — | — |
| WATER SPLASH | à train | 0 | — | — | repos, arret | 7 | 1 | 11 / 15 | 0 / 14 / 7 | 0 |
| WATER SPLASH | à train | 0 | — | — | marche | 7 | 1 | 11,2 / 15 | 0 / 15 / 7 | 0 |
| MONORAIL | à train | 4 | — | — | aucun objet graphique (voie, bouées ou voitures) | — | — | — | — | — |
| SNAKES AND LADDERS | à tours | 3 | 7 | 4,3 | repos | 19 | 1 | 3,3 / 31,1 | 6 / 8 / 85 | 7,6 |
| SNAKES AND LADDERS | à tours | 3 | 7 | 4,3 | marche | 1 | 0 | 0 / 0 | 0 / 0 / 0 | 0 |
| SNAKES AND LADDERS | à tours | 3 | 7 | 4,3 | arret | 16 | 1 | 8,5 / 41,8 | 0 / 0 / 64 | 19,8 |
| OBSERVATION TOWER | à tours | 4 | 9 | 3,3 | repos, marche, arret | 4 | 0 | 0 / 0 | 0 / 2 / 12 | 0 |
| PARASOL CHAIRS | à tours | 4 | 9 | 3,3 | repos, marche, arret | 3 | 6 | 12,4 / 18 | 0 / 12 / 0 | 37,3 |
| COWBOY ACTS | spectacle | 4 | 5 | 6 | repos, marche, arret | 1 | 24 | 0 / 0 | 0 / 0 / 0 | 0 |
| CLOWN ACTS | spectacle | 4 | 5 | 6 | repos, marche, arret | 1 | 24 | 0 / 0 | 0 / 0 / 0 | 0 |
| DOLPHIN ACTS | spectacle | 4 | 5 | 6 | repos, marche, arret | 1 | 24 | 0 / 0 | 0 / 0 / 0 | 0 |
| MEDIEVAL ACTS | spectacle | 4 | 5 | 6 | repos, marche, arret | 1 | 24 | 0 / 0 | 0 / 0 / 0 | 0 |
| SUPER SPINNER | à tours | 4 | 9 | 3,3 | repos | 7 | 0 | 0 / 0 | 0 / 7 / 0 | 0 |
| SUPER SPINNER | à tours | 4 | 9 | 3,3 | marche | 2 | 0 | 0 / 0 | 0 / 2 / 0 | 0 |
| SUPER SPINNER | à tours | 4 | 9 | 3,3 | arret | 7 | 0 | 0 / 0 | 0 / 7 / 0 | 0 |
| OBSERVATORY | à tours | 4 | 9 | 3,3 | repos, marche, arret | 1 | 0 | 0 / 0 | 0 / 0 / 0 | 0 |
| PLANET ROCKET | à tours | 4 | 9 | 3,3 | repos, marche, arret | 4 | 0 | 0 / 0 | 0 / 4 / 0 | 0 |

| Spectacle | Numéros (figure : images par boucle), et les entractes (valeur négative du programme) |
|---|---|
| COWBOY ACTS | 396 : 54 ; entracte 12 ; 397 : 50 ; 398 : 44 ; entracte 40 ; 399 : 35 |
| CLOWN ACTS | 388 : 33 ; 389 : 65 ; 390 : 43 ; entracte 40 ; 391 : 31 |
| DOLPHIN ACTS | 401 : 21 ; 401 : 21 ; 402 : 27 ; entracte 40 ; 403 : 22 |
| MEDIEVAL ACTS | 406 : 47 ; 407 : 45 ; entracte 12 ; 408 : 59 ; entracte 40 ; 409 : 25 |

L'usure : la figure 0x167 (fumée), 4 images, une par dessin.

## Ce qu'on en tire

**Les plus saccadées.** Toutes les attractions à tours tournent au délai 4 : 3,3 images par seconde
(4,3 pour SNAKES AND LADDERS, au délai 3), quand la page en affiche 60. Les passagers sautent le plus
loin dans SPACE SHUTTLE en marche (17 pixels par image, jusqu'à 40), PARASOL CHAIRS (12, en 3 images
seulement), PLANE FLYER (10,5, en 4 images), TREE HOUSE au repos et GHOST HOUSE (9 à 13) ; puis BIG
WHEEL et les tasses (MERRY-GO-ROUND, 6 pixels). Les spectacles, à 6 images par seconde et de 21 à 65
images par numéro, sont déjà fins. Les attractions sans objet graphique (trains, bouées, voitures)
ne relèvent pas de cette demande : leurs wagons avancent en 256es de case, c'est une affaire de
position, comme le défilement fluide.

**Ce qui gagnerait le plus, et comment.**

- *Par la pose seule* (des images du jeu, posées à des positions intermédiaires) : ce qui bouge sans
  changer d'image. C'est rare : les rebords des tasses (MERRY-GO-ROUND, 24 déplacements par boucle),
  quelques morceaux de TREE HOUSE et de SNAKES AND LADDERS, et les places de tous les genres.
- *Il faudrait des images nouvelles* partout ailleurs : dans presque toutes les attractions, ce qui
  bouge est dessiné dans une image propre à chaque étape (colonne « image changée ») — les bras de la
  BIG WHEEL (six par image, 36 images en tout, un tous les 10 degrés), les avions de PLANE FLYER et les
  tasses elles-mêmes (dans le plateau), la navette, le bateau pirate. Les plus rentables, en images à
  fabriquer : PARASOL CHAIRS (3 images par boucle, 12 pixels de saut : trois intermédiaires par image
  quadrupleraient la cadence pour 9 images), PLANE FLYER (4 images), BIG WHEEL et les tasses (6
  images, peu de morceaux), puis SPACE SHUTTLE en marche (8 images, le plus grand saut).

## Le prototype : `animationsIntercalees`

*Retiré le 27 septembre 2026, comme la façon « images » : la façon retenue est « ×2 + traînée »
(plus bas). Ce qui suit en garde l'histoire.*

Réglage `animationsIntercalees` (`moteur/jeu/reglages.js`, éteint par défaut), bouton « animations »
de la page : non, glisse (et, depuis, images, puis ×2 + traînée). La glisse ne retenait que la BIG WHEEL (`GENRES`,
`moteur/jeu/animations-intercalees.js`) : le recensement la montre faite de morceaux posés à des
positions calculées (six bras avec leur nacelle, six places, la structure), avec peu d'images par
tour. Le mécanisme est décrit dans [architecture.md](architecture.md), « Les réglages : les
animations intercalées ».

**Ce qui est choisi, et pourquoi.** Des trois voies de la demande — interpoler la pose, fondre deux
images d'origine, des images intermédiaires déposées —, le prototype prend la première, et la
deuxième en option :

- *la glisse* (« glisse ») : les morceaux de l'image courante sont appariés à ceux de la suivante,
  et chacun est posé sur le chemin de l'un à l'autre ; celui qui change d'image prend la plus proche
  dans le temps (il change d'image à mi-chemin). Les passagers suivent leur place ;
- *le fondu* (« fondu », retiré le 26 septembre 2026 : le grain était laid) : de plus, les deux
  côtés (les images courantes menées vers la suivante, les images suivantes ramenées vers la
  courante) étaient mêlés par une trame de Bayer 4x4, d'autant plus vers la suivante que l'on
  avançait. L'image est indexée : un vrai fondu de couleurs n'existe pas dans la palette, la trame en
  tenait lieu ;
- *les images déposées* : la chaîne est faite depuis, par des images de l'attraction entière,
  cuites puis interpolées par RIFE (section « Les images cuites », plus bas, façon « images »).

Rien n'est retouché dans le jeu : l'objet graphique +0x0A, le délai, les boucles, leur compte et la
place des passagers restent ceux de 1994 ; seule l'image montrée par la page change.

**Résultat.** Mesuré sous Node sur le parc de la démonstration, la vue menée sur la roue
(`travail/scenarios/roue-basse.json` et `roue-haute.json` : `simulation.json` jusqu'au parc, puis
40 flèches vers le bas et 6 vers la gauche, et R pour le 640x480) :

- la pose à t = 0, tracée par le traceur à part, redonne exactement l'image du jeu : 1 228 relevés
  sans un pixel d'écart en 320x200 ; de même en 640x480, sauf les deux images du changement de mode
  (relevées dans un mode, contrôlées dans l'autre ; la page ne les retouche pas, les largeurs
  différant) ;
- sur 1 892 images montrées en 60 s, 1 091 sont retouchées (la roue à l'écran et en mouvement) ;
- à l'œil (bandes PNG de `travail/essai-animations.mjs --bande`, dans `travail/captures/`) : les
  nacelles et leurs passagers avancent au pixel pendant la première moitié de chaque image, puis les
  bras prennent leur nouvelle image. **Le saut reste**, placé au milieu de l'intervalle et réduit de
  moitié en position, parce que les bras et la fleur du moyeu sont des images différentes à chaque
  étape de 10 degrés. Le fondu remplace ce saut par une trame qui passe d'une pose à l'autre : plus
  continu, mais d'un grain visible à mi-chemin. Le mouvement gagne en continuité ; il ne devient pas
  celui d'une roue qui tourne sans à-coup. En se déplaçant, un bras découvre ce qui est derrière lui
  (le kiosque, la clôture), comme il se doit.

**Preuves.**

- Réglage éteint : `node moteur/node/verifier.mjs --empoisonner` IDENTIQUE sur `parc` (84 s, 766
  relevés) et `construction` (150 s, 1 281 relevés).
- Réglage allumé : `travail/essai-animations.mjs` joue une partie éteinte puis allumée, l'image
  retouchée comme par le travailleur 60 fois par seconde virtuelle : même mémoire du jeu toutes les
  100 ms, toute la mémoire chaque seconde et même heure, sur `roue-basse` (60 s, 548 relevés, glisse,
  320x200) et `roue-haute` (60 s, 548 relevés, fondu, 640x480).
- Dans le navigateur (son coupé) : DEMO, F3, la vue menée sur la roue en 640x480 ; « glisse » puis
  « fondu », le jeu tourne sans erreur ; le bouton est remis à « non ».

## Les images cuites, interpolées par RIFE (façon « images »)

*La façon « images », qui montrait ces images nettes, est retirée le 27 septembre 2026 ; les images
restent, et font la traînée de la façon « ×2 + traînée » (plus bas).*

La voie des images déposées, suivie de bout en bout (mode d'emploi dans le [README](../README.md),
« Des images intermédiaires d'animation avec RIFE »). Plutôt que d'interpoler chaque sprite à part,
on **cuit** l'animation : à chaque étape, l'attraction entière, tous ses morceaux composés dans
l'ordre du jeu, parties immobiles comprises, **sauf les places** (les passagers dépendent de la
partie). C'est ce que RIFE interpole le mieux (une image entière, avec son contexte) et ce que le
joueur manipule le plus simplement (un dossier par attraction). La taille ne compte plus : 4 Ko de
plus par image n'y changent rien.

- **L'export** (`moteur/node/exporter-animations.mjs`) lit les tables dans la mémoire du jeu comme le
  recensement, prend les boucles des figures du repos, de la marche et de l'arrêt (sans l'amorce),
  compose chaque étape avec les sprites de `MSPR-0` (vérifié : les adresses de pixels de la table des
  images sont celles de `MSPR-0`), la pose à `ancrage + (dx, dy)` comme le jeu, et écrit
  `assets/animations/origine/<ATTRACTION>/boucle/0000.png`... en x4 au plus proche voisin sur le
  magenta pur, l'étape 0 répétée à la fin (la paire dernière → première, que RIFE doit voir). Toutes
  les images d'une boucle ont la même taille (l'emprise de toutes les étapes, l'ancrage compris, 4
  pixels de marge, arrondie à 8 : x4, des multiples de 32). Par défaut, toutes les attractions à
  tours : quinze genres, vingt-six boucles (une boucle d'une image n'est pas exportée ; celle du
  repos l'est, le départ la finissant en tournant déjà). BIG WHEEL : 6 étapes,
  416x512 ; PLANE FLYER : 4, 512x320 ; MERRY-GO-ROUND : 6, 416x256 (la boucle du repos : les figures
  de la marche et de l'arrêt des tasses valent 0 ; qu'elle soit bien celle des tasses en marche n'est
  pas encore vu dans une partie) ; PARASOL CHAIRS : 3, 512x384 ; SPACE SHUTTLE : 8 en marche, 20 à
  l'arrêt ; PIRATE BOAT : 16 et 16 ; TREE HOUSE : 28. La couleur de ces attractions la plus proche du
  magenta en est à 112 (un violet des PARASOL CHAIRS, de PLANET ROCKET).
- **L'import** (`moteur/node/importer-animations.mjs`) lit ce que Flowframes rend, démêle chaque
  pixel (un mélange d'une couleur de l'attraction et du magenta : la part a et la couleur c qui
  l'expliquent le mieux, sur la moyenne de chaque bloc 4x4 ; opaque si a ≥ ½ et de la couleur c,
  déjà une couleur du jeu ; à écart égal, la part la plus forte, sans quoi un violet de l'attraction
  se lirait comme un autre violet mêlé de magenta), reconnaît les étapes d'origine parmi les images
  rendues (moins de 2 % de pixels différents) et range les autres, dans l'ordre, entre l'étape s et
  l'étape s + 1. Il écrit `assets/animations/import/rendu.json` (chaque étape et chaque intermédiaire
  en 1x, indices de `MPALETTE`, et les déplacements des places mesurés par RIFE).
- **Le rendu** (`animations-intercalees.js`, façon `'images'`) : pour une attraction dont le genre a
  des images et dont l'image G mène à G' comme dans l'export (et dont les morceaux sont ceux de
  l'export : la signature), l'emprise s'étend à l'image cuite ; à l'instant t, l'intermédiaire
  j = round(t (n + 1)), borné à n (j = 0 : l'étape G cuite), est posé par son ancrage sur le « avant » :
  la couche du fond, les passagers là où RIFE a emporté le contenu de leur place (sinon glissés de
  leur place dans G vers celle de G'), puis la couche de devant (architecture.md, « Les passagers et
  les deux couches »). La retouche de l'image montrée est celle du prototype. Sans images, rien n'est
  retouché.

**Preuves.**

- Export relu à l'œil : les planches (`<ATTRACTION>/boucle-planche.png`) montrent le socle immobile
  d'une étape à l'autre, la croix d'ancrage au même point, le fond uni.
- Import d'images d'essai (avant RIFE : un fondu enchaîné x4, étapes recopiées, comme une sortie de
  Flowframes) : toutes les étapes reconnues pour les quatre attractions (17, 25, 25 et 13 images ; 3
  intermédiaires par passage).
- Ancrage : l'étape cuite posée seule redonne l'image du jeu au pixel près hors des passagers
  (`controlerLesImagesCuites`) : 1 228 relevés sur `roue-basse` (320x200), sans un pixel d'écart ; sur
  `roue-haute` (640x480) de même, sauf les deux relevés du changement de mode (58 pixels, comme pour la
  glisse).
- État du jeu : `travail/essai-animations.mjs --cuites`, éteint puis allumé, ÉTAT IDENTIQUE sur
  `roue-haute` et `roue-basse` (60 s, 548 relevés chacun). Réglage éteint, `verifier.mjs
  --empoisonner` IDENTIQUE sur `parc` (84 s, 766 relevés) et `construction` (150 s, 1 281 relevés).
- Dans le navigateur (son coupé), DEMO : « images cuites pour 4 attraction(s) », le jeu tourne sans
  erreur en « images ».

**Limites.** Les intermédiaires sont montrés en 1x, aux couleurs du jeu. Au premier essai, les
passagers passaient devant l'attraction cuite, même là où le jeu trace un morceau devant eux (la
structure de la BIG WHEEL, tracée après les places), et rien n'était montré quand la page compose
elle-même l'image (glisse du défilement fluide, zoom de la grande vue) : réglé depuis, par les deux
couches et par les retouches publiées pour la page (architecture.md, « Les réglages : les animations
intercalées »).

## Deux fois plus vite, et une traînée (façon « ×2 + traînée »)

La façon retenue, et depuis le 27 septembre 2026 la seule : le bouton « animations » de la page vaut
« ×2 + traînée » par défaut, ou « non » ; la glisse et les images de RIFE montrées nettes (plus haut)
sont retirées, à la demande de Fabien (retour 36 de [demandes.md](demandes.md)).

**Pourquoi.** Relue en jeu, la façon « images » ne convainc que pour le château et la maison hantée :
ailleurs, des pixels ratés et des poses tordues, là où RIFE fond une étape dans l'autre au lieu de
dessiner une pose entre elles. Sur la navette, aucun outil ne fait mieux : RIFE, DAIN et XVFI (par
Flowframes), Interprite, un fantôme, un flou ramené à la palette (essais du 27 septembre 2026,
`travail/trainees/`, LISEZMOI.txt). Le choix de Fabien : **aucune image inventée n'est montrée
nette.** L'attraction passe deux fois plus vite par les dessins du jeu (6,7 images par seconde au lieu
de 3,3), et une traînée semi-transparente, faite des images de RIFE, suit ce qui bouge. Le flou n'est
qu'un sillage : là où RIFE se trompe, on ne voit qu'une trace pâle, qui s'efface en deux étapes.

**L'avancement** (retour 44 : « en vitesse lente, les animations saccadent et bouclent sur deux
images »). Entre deux images du jeu, le temps montré avance à la cadence des pas de simulation : une
horloge, prise sur le compte des pas (0xD3AFC) et l'heure virtuelle de chaque publication, prolonge le
dernier pas connu à la durée d'un pas mesurée, une image du jeu en retard (l'image publiée n'est
présentée qu'à l'image suivante), sans jamais dépasser ce que la publication suivante peut apporter, ni
reculer. L'avancement d'avant supposait autant de pas après l'image qu'avant elle : juste aux vitesses
normale et rapide ; aux vitesses lentes, le jeu ne fait un pas qu'une image sur deux ou trois, et la
montrée reculait d'un demi-pas (d'un pas entier avec le défilement fluide, qui retouche aussi à la
publication) : l'étape montrée allait et venait entre deux dessins. Mesuré (90 s de `roue-haute`, la
roue et le bateau, vitesses 0, −1, −2, −3 et la pause, avec et sans le défilement fluide) : plus aucun
recul du temps montré, ni aller-retour de l'étape ; à la vitesse normale, les mêmes étapes qu'avant.

**L'image montrée.** À l'étape s de la boucle et à la fraction t de l'étape (γ = s + t), l'image
montrée est l'étape ⌊φ⌋ modulo le nombre d'étapes N : un dessin du jeu, tracé comme le jeu le
tracerait, morceau par morceau et dans son ordre, par le traceur à part (`tracerLEtape`,
`animations-intercalees.js`), avec ses passagers à ses places. Dans une boucle de marche prise à son
début, φ = 2γ : l'image du jeu n'est la montrée qu'une fois sur deux, l'attraction est retouchée dès
t = 0.

**Les boucles jouées une seule fois** (retour 38 : « le démarrage de la fusée et du bateau n'est pas
bon »). Le départ du PIRATE BOAT joue sa boucle du repos une seule fois, de l'étape 0 (à plat) à
l'étape 17 (le grand balancement à droite), l'amplitude croissant d'étape en étape ; son arrêt joue de
même le ralenti, du balancement à plat ; la marche, elle, part du haut à droite et tourne en rond
(l'étape 0 n'est pas le bas). Deux fois plus vite, la montée du départ se jouait deux fois : au
milieu du départ, le bateau revenait à plat pour recommencer (de même le ralenti, à l'arrêt, et la
navette). Le ×2 ne vaut donc que pour la boucle de la marche (celle qui porte la première image de la
figure de marche, fiche +0x26 ; la roue et les tasses n'en ont qu'une pour tout) ; une boucle que le
jeu ne joue qu'une fois suit le jeu, image pour image (φ = γ), traînée comprise. Jamais au-delà de sa
dernière image (retour 40 : « la navette au repos est à l'envers ») : à la dernière, t peut atteindre
1, et l'étape montrée revenait à la première de la boucle, que le jeu ne remontre pas — la pose du
haut, la tête en bas, pour la fin de l'arrêt de la navette. Et sa traînée ne remonte jamais avant son
début : ses images intermédiaires d'avant l'étape 0 mènent de la dernière étape à la première (un
fantôme de la navette la tête en haut, au départ).

**Partir de l'image du jeu.** La montrée va par segments : chacun part de l'image du jeu (φ = γ) et
finit là où le jeu quitte ou recommence la boucle (γ = N), la montrée revenue à l'étape 0, ou, à l'arrêt
en cours dans la même boucle (la roue), là où le jeu fige sa dernière image (γ = N − 1), la montrée sur
cette même étape ; entre les deux, à vitesse constante, le nombre de tours qui l'approche le plus du
double du jeu (à égalité, le plus lent). Une boucle de marche prise à son début en fait exactement
deux (φ = 2γ) ; une attraction qui entre dans la vue en pleine boucle ne saute plus de l'image du jeu
à son double, elle en part et rattrape le ×2 d'ici la fin de la boucle. Une attraction qu'on n'a pas
retouchée depuis un quart de seconde (hors de la vue) repart de même.

**La montée en régime** (retour 40 : la navette « démarre à fond »). Partie du repos — la marche prise
juste après une boucle jouée une fois (le départ du bateau, de la navette), ou la boucle unique d'une
attraction qui part (la roue) —, la montrée passait de ×1 à ×2 d'une image à l'autre : la navette,
arrivée en haut de son dernier balancement presque à l'arrêt, repartait d'un coup à un tour par
seconde. Elle va maintenant de ×1 à ×2 en ligne droite sur les deux premiers tours du jeu, mis bout à
bout : φ = φA + u + κ·u² (u = γ − γA ; κ tel que φ vaille 3N au bout des deux tours), trois tours
montrés, pour arriver à l'étape 0 quand le jeu recommence sa boucle ; la suite est au double.
Seulement si le temps du tour qui reste (+0x36) promet ce second tour du jeu (la marche finit à la
première fin de boucle après qu'il est écoulé) ; sinon, le double tout de suite. Mesuré sur la navette
(`roue-haute`) : le premier tour du jeu en montre 1,25, le second 1,75, et la montrée arrive à l'étape
0 à l'image même où le jeu recommence (60,49 s) ; puis ×2, sans saut.

**Les passagers suivent.** Places fixes : à chaque place, le passager que le jeu a mis à la même
place de l'image courante, centré sur elle et posé sur le même pied. Places qui tournent (dispositions
0 et 1 de la fiche +0xB3 : la BIG WHEEL, les tasses...) : le jeu fait avancer ses passagers d'une place
à chaque tour achevé (+0x20) ; montrés deux fois plus vite, ils doivent avancer deux fois plus. Le
relevé garde l'anneau du jeu (les passagers à bord dans l'ordre de leur chaîne, +0x47, la capacité de
la fiche +0xA6), et `passagersTournants` le rejoue, en lecture seule (`placerEnTournant` puis
`tracerAvecPassagers` de `dessin-attractions.js`), pour les tours de la montrée : ceux du jeu quand elle
part de son image, plus un à chaque fois qu'elle repasse par l'étape 0.

**Les changements de boucle.** Le jeu ne passe d'une boucle à la suivante (du repos à la marche, de la
marche à l'arrêt) qu'à la dernière image de la précédente, marquée. À ce moment, la montrée finit son
second tour sur la même : le passage est continu, sans passage cuit. L'arrêt, lui, finit quand le jeu
atteint la dernière image de sa boucle (N − 1), qu'il fige ; en ×2 pur, la montrée n'en était qu'à
l'avant-dernière d'avant (la roue sautait de 20°) : le segment de l'arrêt finit donc sur cette
dernière image (plus haut, `phaseMontree`).

**La traînée.** La moyenne des images de RIFE (`rendu.json`, étapes et intermédiaires, les deux
couches superposées) des deux étapes qui précèdent la montrée, chacune pondérée par (1 − âge / 2)³ (le
dégradé « très rapide », choisi par Fabien) ; son opacité est la part pondérée des images qui ont
quelque chose à ce pixel, multipliée par le gain 2L / 4 = 1 (la même force près de la pièce qu'une
traînée d'une étape au dégradé linéaire). Elle est en couleurs pleines (RGBA, pas des indices de la
palette) : le travailleur la publie à part, et la carte graphique la mêle à l'image après la palette
(architecture.md). Elle ne passe que sur le décor et sur le « pied » de l'attraction (ce qui ne bouge
pas : à chaque pixel, la valeur qu'au moins 3 étapes sur 4 y ont ; la simple majorité figeait en décor
un bout de coque ou d'avion qui passe là plus d'une fois sur deux) : jamais sur la pièce qui bouge, sur
les passagers, ni sur ce qui est devant l'attraction. Juste après un changement de boucle, elle ne
remonte pas avant le début de la boucle. Une boucle sans intermédiaires n'a pas de traînée : la moyenne
de deux étapes n'y serait qu'un fantôme. Elle se calcule dans le travailleur (la moyenne d'images déjà
chargées), et se garde par étape tant que la palette ne change pas.

**Sans à-coup.** Le premier calcul d'une boucle prend jusqu'à 15 ms (le temps que le moteur
JavaScript le compile) ; ceux qui suivent, moins d'une milliseconde. Il y en a donc un au plus par
image montrée : une étape dont la traînée n'est pas prête est montrée sans elle, et l'image suivante
la calcule (2 images sur 2 376 en 60 s sur `roue-haute`). Une image qui n'a rien calculé prépare ce
que les suivantes demanderont : la traînée de l'étape d'après, puis l'état des autres boucles de
l'attraction et leurs deux premières étapes, celles d'un changement de boucle. Le « pied » se trouve
par le vote de Boyer et Moore (une valeur qu'ont 3 étapes sur 4 est la majorité), et les deux couches
ne sont plus recopiées superposées pour chaque image, seulement lues ensemble. Mesuré sous Node, la
charge du travailleur seule sur `roue-haute` (60 s, l'image retouchée 60 fois par seconde) : la pire
image passe de 25-28 ms à 16 ms ; l'empreinte de toutes les retouches, calcul immédiat demandé
(`unCalculParImage` faux), est la même qu'avant, au bit près. Le chargement de `rendu.json` (72 Mo)
décode son base64 par une table au lieu d'`atob` : 0,1 s au lieu de 2 s, pendant lesquelles le jeu
s'arrêtait au premier passage sur « images » ou « ×2 ».

**Quelles attractions.** Toutes celles de `rendu.json`, les boucles qu'écartait la façon « images »
comprises (PLANE FLYER, PARASOL CHAIRS, SNAKES AND LADDERS : leurs images de RIFE ne sont jamais
montrées nettes, seule leur moyenne fait la traînée) : quinze genres. Essayée hors du jeu sur 13
boucles (les attractions non validées, la BIG WHEEL, les départs et les arrêts du bateau et de la
navette) : gain net pour la navette, PLANE FLYER, PIRATE BOAT, PARASOL CHAIRS et la BIG WHEEL ; léger
pour PLANET ROCKET, MERRY-GO-ROUND et l'échelle de TREE HOUSE ; nul pour la boucle de TREE HOUSE, où
presque rien ne bouge. Retenue par Fabien le 27 septembre 2026 pour toutes les animations, vue sur la
navette, les chaises et les avions.

**Preuves** (sous Node, `travail/essai-animations.mjs --trainee`, `essai-transitions-x2.mjs`,
`essai-passagers-x2.mjs`).

- État du jeu : éteint puis allumé, ÉTAT IDENTIQUE sur `roue-haute` et `roue-basse` (60 s, 548
  relevés chacun).
- L'étape courante, retracée par `tracerLEtape` pour les tours du jeu, redonne l'image du jeu au pixel
  près, passagers compris : 2 385 relevés sans un pixel d'écart sur `roue-basse` ; sur `roue-haute`, de
  même, sauf les 4 relevés du changement de mode (relevés dans un mode, contrôlés dans l'autre). Sur 6
  515 passagers tracés, l'anneau refait diffère 54 fois de celui que le relevé a noté, sans un pixel
  d'écart dans l'image. D'abord, en 320x200, 12 150 pixels d'écart : un passager qui dépasse le bord de
  la fenêtre, que le jeu ne trace pas du tout (0x5ED21 ne découpe au bord que le tracé simple et les
  miroirs) ; le traceur à part fait désormais de même.
- Les enchaînements (`roue-haute`, 150 s) : 7 265 images consécutives suivies, l'étape montrée reste
  ou avance d'une étape, jamais de deux, aucun saut ; 4 changements de boucle continus (le PIRATE
  BOAT, du repos à la marche et de la marche à l'arrêt, deux fois). Avec les boucles jouées une
  seule fois et les segments (retour 38) : le départ du bateau suit le jeu de l'étape 0 à la 17
  (avant, la montrée revenait de la 17 à la 0 au milieu du départ), la marche repart à l'étape 0 en
  ×2, l'arrêt suit le jeu jusqu'à sa dernière image ; tous les débuts de retouche partent de l'image
  du jeu (avant, 8 sur 13 sautaient, les attractions entrant dans la vue en pleine boucle), sauf les
  6 du changement de mode, où les relevés d'un mode ne servent pas dans l'autre ; les fins de retouche
  hors changement de mode sont sur l'image montrée ou sur la suivante du jeu. État du jeu IDENTIQUE,
  étape retracée égale à l'image du jeu, comme plus haut.
- Dans le navigateur (son coupé, sauvegardes copiées avant et vérifiées identiques après) : plus de
  256 couleurs à l'écran en rendu brut (la traînée mêlée après la palette : environ 740 dans l'image
  du travailleur, 450 à 610 au zoom de la grande vue), 60 images par seconde.

**Limites.** Au repos, rien. Les dessins du jeu restent ceux de 1994 : entre deux dessins, la pièce
saute encore, deux fois moins loin et deux fois plus souvent, la traînée en adoucit le saut ; au
départ et à l'arrêt du bateau et de la navette, à la cadence du jeu. Une roue qui s'arrête garde les
passagers de la montrée, qui a fait deux fois plus de tours que le jeu : aux places qui tournent, ils
changent de place quand la retouche cesse. En haut du looping de la navette, où manquent deux dessins (plus bas, « Ce qui
reste »), l'étape reste la plus longue. Un objet devant l'attraction qui aurait, à un pixel, la
couleur de l'attraction à cet endroit y laisse passer la pose montrée.

## La fontaine, de la même façon

Retour 54 de [demandes.md](demandes.md) : « il faut animer la fontaine de la même façon que les
attractions ».

**Ce qu'elle est.** CENTRE FOUNTAIN (FONTAINE CENTRALE, 20 000) est une installation : un objet du parc
de type 0x18, comme les toilettes (retro-ingenierie.md § 10.4), fiche 18 du catalogue des décors
0xCCA70, qui tient six cases. Sa figure (323) est une boucle de **trois images** (objets graphiques
1332, 1459 et 179 ; un sprite chacune, 1694 à 1696 : les jets et le ruissellement changent, la vasque
de pierre non). Le jeu la fait passer à l'image suivante quand il la dessine à un pas multiple de 16
(`objets.js`, `dessinerToilettes`) : **1,9 image par seconde**, la plus lente du parc (les attractions :
3,3). Les toilettes (BOGGY CRAPPER, OUTHOUSE, SUPER TOILET) n'ont qu'une image par direction : rien à
animer.

**Comment.** La chaîne des attractions, telle quelle :

- *l'export* (`exporter-animations.mjs`) prend aussi les installations animées du catalogue des
  décors (catégorie 15), rangées dans l'index comme une attraction : `sorte` 'installation',
  l'identifiant est leur rang dans le catalogue (18 ; celui d'un genre d'attraction se recouvrirait),
  16 pas par image. `CENTRE-FOUNTAIN/boucle/` : 3 étapes, 288x320 en x4, sans couches (pas de
  passagers) ;
- *RIFE* : `interpoler-animations.mjs --attractions "CENTRE FOUNTAIN" --entieres --facteur 20` (une
  boucle sans couches ne passe qu'avec `--entieres`) : 61 images, 19 intermédiaires par passage ;
- *l'import* (`importer-animations.mjs --attractions "CENTRE FOUNTAIN"`) : les trois passages
  retrouvés ; `rendu.json` garde la `sorte` ;
- *la page* : `dessinerToilettes` appelle `debutDInstallation` et `finDInstallation` autour du tracé
  de l'installation (réglage éteint, deux appels qui rendent aussitôt la main). Le relevé est celui
  d'une attraction (l'emprise, la surface avant et après le tracé), sans passagers ; le temps, après
  le pas dessiné, est la fraction (pas mod 16) / 16 de l'image courante. La boucle tourne toujours,
  sans départ ni arrêt : elle est montrée comme la marche d'une attraction, par segments qui partent de
  l'image du jeu (`phaseMontree`), avec la traînée de ses images de RIFE, aux mêmes règles ; d'abord deux
  fois plus vite, puis quatre (`VITESSE_DE_LA_FONTAINE`, plus bas). Rien à changer du côté de la page : ses retouches passent par les trois chemins
  (l'image du travailleur, la glisse, le zoom).

**Ce que ça donne.** Le jeu change d'image tous les 16 pas. En ×2, la montrée en change tous les 8 :
3,75 images par seconde ; en **×4, la façon retenue par Fabien** (retour 58), tous les 4 : **7,5 images
par seconde**, la cadence des personnages qui marchent. Chaque image montrée est l'un des trois dessins du jeu : une image fixe ne se distingue pas
du jeu, seule la cadence change. La traînée reste discrète : elle ne passe jamais sur la pièce qui bouge
(ici l'eau, presque partout), seulement sur le gazon et sur le « pied » (la vasque de pierre, la même
dans les trois images) ; mesuré sur une boucle de 3,2 s de la page reconstituée, elle touche 400 à
1 550 pixels par image (787 en moyenne, sur 6 545), d'un écart de couleur moyen de 7 (sur la somme des
trois composantes) : de l'eau passée sur de l'eau. Le gain est donc le ×2. Pour aller plus loin, la
vitesse de la fontaine est une constante à part (`vitesseDesInstallations`, deux comme les
attractions) : ×4 lui donnerait 7,5 images par seconde, la cadence des personnages qui marchent. Et une
autre piste, pour de l'eau qui ne tourne pas en profondeur comme la navette : les images de RIFE
montrées nettes (la façon « images », retirée pour les attractions), 37 images différentes par seconde.
Le film de comparaison (le jeu, ×2 + traînée, ×4 + traînée, les images de RIFE, à 60 images par
seconde) : `travail/captures/fontaine-comparaison.png` (PNG animé) et `fontaine-avant-apres.html`
(au ralenti, image par image, avec la frise des dessins montrés), à ouvrir dans un navigateur.

**Essayées, non retenues : les images de RIFE ×2** (retour 57). À la demande de Fabien, la fontaine a
été montrée avec ses images de RIFE nettes, sa boucle parcourue deux fois plus vite, sans traînée :
entre deux dessins, l'intermédiaire le plus proche de la phase montrée φ, j = round((φ − ⌊φ⌋)(n + 1))
borné à n, posé par son ancrage sur le « avant », le dessin du jeu lui-même à j = 0. Mesuré sur la
boucle de 3,2 s : 184 images nouvelles sur 192 (57 par seconde), contre 12 en ×2 + traînée ; état du jeu
identique (60 s). Le verdict de Fabien : « comme pour le reste au final sur la fontaine, on utilise ×2 +
traînée ». Le code de l'essai (`faconDesInstallations`) est retiré ; la comparaison reste dans
`travail/captures/fontaine-avant-apres.html`. Puis, la comparaison revue, son choix final : **×4 +
traînée** (retour 58), la même façon, quatre fois plus vite que le jeu.

**Preuves.** Le scénario `travail/scenarios/fontaine-haute.json`, composé (`composer.mjs`, partition
`fontaine-haute-partition.json`) : DEMO, F3, R, la fontaine achetée au catalogue des décors et posée
en haut à gauche de la vue 640x480, à 23 s, puis le pointeur écarté sur le panneau du bas. (Sans ce
dernier geste, l'outil de pose, resté en main, dessine au curseur une fontaine fixe, pile par-dessus la
vraie : entre les trois images du jeu, 74 pixels changeaient au lieu de 780, et les premières mesures de
la traînée, faites ainsi, étaient fausses.)

- Réglage éteint, `verifier.mjs --empoisonner` IDENTIQUE sur `parc` (84 s, 766 relevés),
  `construction` (150 s, 1 281) et `fontaine-haute` (60 s, 548 : la fontaine dessinée par la réécriture
  et par la transcription).
- Réglage allumé, `travail/essai-animations.mjs --trainee` sur `fontaine-haute` : ÉTAT IDENTIQUE (60 s,
  548 relevés) ; la fontaine retenue à chacune de ses 1 118 images dessinées ; l'étape retracée par
  `tracerLEtape` redonne l'image du jeu sans un pixel d'écart (1 117 relevés).
- Les attractions n'en sont pas changées (le relevé est maintenant commun, `commencerLeReleve`) : les
  retouches de 4 042 présentations de `roue-haute` (60 s, pixels et traînées) ont la même empreinte avec
  le module d'avant et celui d'après, chargés tour à tour à la place l'un de l'autre.
- Dans le navigateur intégré (un serveur d'essai sur une installation à part, son coupé : les
  sauvegardes du joueur vérifiées identiques après) : « animations : ×2 + traînée pour 16
  attraction(s) », la fontaine achetée et posée dans DEMO, aucune erreur.

## Les autres animations du parc

Recensement du 28 septembre 2026 (retour 54 : « vérifier tous les assets qui mériteraient aussi
d'être mieux animés »), par trois voies : le second tableau d'`animations.mjs` (chaque animation, sa
figure, sa boucle, sa cadence et le code qui la fait avancer, et la part de ses pixels qui change d'une
image à la suivante, les images composées comme le jeu), une lecture du code (tout ce qui fait passer
un objet graphique au suivant), et le relevé, image par image, de l'objet graphique +0x0A de chaque
objet du parc pendant 90 s du parc de la démonstration. Le jeu n'a aucune animation de palette (ni eau
ni lumières qui tournent : seulement les fondus et l'assombrissement de l'orage). Les décors (arbres,
lampadaires...) sont fixes : le jeu trace la première image de leur figure, sans en suivre la chaîne.
À la vitesse normale (30 pas par seconde) :

| Ce qui s'anime | Images | Images/s | Ce qui change d'une image à l'autre | Verdict |
|---|---|---|---|---|
| Attractions à tours | 3 à 28 par boucle | 3,3 (4,3) | la pièce, les passagers | fait : ×2 + traînée |
| **Fontaine** | 3 | **1,9** | 26 % des pixels | **fait : ×4 + traînée** (7,5 images/s) |
| Toilettes | 1 | — | — | rien à animer |
| Visiteurs et personnel en marche | 4 par direction | 7,5 ; la position avance à chaque pas, au 256e de case | 55 à 87 % (de petits sprites) | non : deux fois plus vite, le pas ne suivrait plus le déplacement (les pieds glisseraient) |
| Amuseurs et gardien qui attendent | 8 par direction | 5 | 5 à 8 % | non prioritaire |
| Mécanicien qui attend une panne | 1 à 19 (six figures) | 7,5 | 24 % | non prioritaire |
| Agent d'entretien qui balaie | 28 | 30 | 29 % | rien à faire |
| Geste du vendeur (glaces, frites, burgers, cola) | 11 | 10 | 54 % | rien à faire |
| Jeux d'adresse au repos (COCONUT SHY, DUCK SHOOT, GUN SHOOT) | 5 à 13 | 7,5 | 0 à 1 % (des images presque identiques) | rien à faire |
| Jeux d'adresse pendant une partie (+ RACE TRACK, TIN CAN ALLEY) | 4 à 29, jouées une fois | 7,5 | 2 à 6 % (la balle, les cibles : quelques pixels) | non : jouées une fois, elles suivraient le jeu image pour image (comme le départ du bateau) ; une traînée seule sur des pièces de quelques pixels |
| Ballons des clients (un dessin par boutique : BALLOON WORLD, TOY LAND, GIFT SHOP, NOVELTY SHOP) | 4, en boucle | 3,75, quand ils sont dessinés | 84 à 93 % d'un sprite d'environ 9 × 12 pixels (le ballon qui se balance) | possible (rien ne s'y oppose), mais sur un si petit sprite le gain se verrait peu |
| Fanions de certains morceaux de voie (figures 140, 142, 147, vus dans la démonstration) | 4 | 7,5, quand ils sont dessinés | le fanion | non prioritaire |
| Fumée d'une attraction usée | 4 | une par tracé | 81 % | rien à faire |
| Nuage d'une explosion | 4 | 30 | 55 % | rien à faire |
| Spectacles | 21 à 65 par numéro | 6 | — | rien à faire |
| Wagons, trains, bouées, voitures, bus | une image par direction | la position, à chaque pas | — | déjà fluides |
| Feux d'artifice, neige, pluie | des particules | 30 | — | rien à faire |
| **Enseignes défilantes** : le kiosque de chaque attraction (6 caractères), l'entrée du parc (12) | du texte | un caractère (4 pixels) tous les 8 pas, 3,75 par seconde ; tous les 16 pas à l'entrée, 1,9 | le texte saute d'un caractère | **candidat** : par le code, un défilement au pixel (aucune image à faire) |
| **Films des attractions** (la loupe de la fiche, `data/rideani.*`) | une vidéo FLC | 12,5 en 640x480 (8 centièmes par image, sauf si le script du film en décide autrement) | — | **candidat**, autre chantier : RIFE sur la vidéo (des images de synthèse, qui s'y prêtent bien) |
| Commissaire-priseur (vente aux enchères) | 20 poses | 1,2 | — | un écran rare |

Le détail (une ligne par boutique, par métier, par sorte de visiteur) est le second tableau
d'`animations.mjs`. Deux particularités du jeu, vues en passant : ce qui avance quand il est dessiné
(la fontaine, les fanions, les enseignes, les ballons des clients) ne bouge pas hors de la vue ; et
à une vitesse lente le jeu dessine plusieurs fois le même pas, si bien qu'au pas multiple de 16 la
fontaine saute deux ou trois images d'un coup (la montrée la suit, repartant de l'image du jeu), et
qu'en pause sur un tel pas elle tourne à 30 images par seconde.

**En bref.** Après la fontaine, rien d'autre dans le parc n'est aussi lent que les attractions : tout
le reste va de 3,75 à 30 images par seconde. Le plus lent en boucle, les ballons des clients (3,75), se
prêterait au ×2 + traînée, mais sur des sprites de quelques pixels ; les parties des jeux d'adresse sont
jouées une seule fois. Les deux vrais candidats qui restent ne relèvent pas du ×2 + traînée : les
enseignes défilantes (par le code) et les films des attractions (RIFE sur une vidéo).

## Par le code, ou par des images

Ce qui bouge par **position** (la même image posée ailleurs) se fluidifie par le code, sans image
nouvelle : il suffit de poser l'image entre ses deux positions. Ce qui change d'**image** demande des
images intermédiaires.

| Ce qui bouge | Par le code (position) | Par des images | État |
|---|---|---|---|
| Passagers des attractions à tours (places, 0x80) | oui : la place de G vers celle de G' | — | fait (glisse, et par-dessus les images cuites) ; en ×2, aux places des dessins du jeu, l'anneau des places qui tournent rejoué |
| Corps des attractions à tours (bras, nacelles, plateaux, avions, parasols) | non : chaque étape a ses images propres (les nacelles de la BIG WHEEL aussi : 34 images, une par position) | oui | fait pour les quinze genres (images cuites, RIFE), sauf les boucles écartées ; en ×2 + traînée (la façon retenue), toutes, les images de RIFE ne faisant que la traînée |
| Rebords des tasses (MERRY-GO-ROUND), quelques morceaux de TREE HOUSE, SNAKES AND LADDERS | oui (même image déplacée) | — | possible par la glisse ; les tasses passent par les images cuites |
| Wagons, trains, bouées, voitures du circuit | oui : ils avancent en 256es de case (§ 10.6) ; une image par direction | — | assez fluides selon le joueur : pas prioritaire |
| Visiteurs et personnel qui marchent | oui : position fine dans la case | leurs cycles de marche (4 images par direction, 7,5 par seconde) | assez fluides selon le joueur ; le ×2 désaccorderait le pas du déplacement (« Les autres animations du parc ») |
| Spectacles | — | déjà 6 images par seconde | rien à faire |
| La fontaine | — | 3 images, 1,9 par seconde | fait : ×4 + traînée (7,5 par seconde) |
| Enseignes défilantes (kiosques, entrée du parc) | oui : le texte glisserait au pixel au lieu de sauter d'un caractère | — | candidat |
| Films des attractions (loupe de la fiche) | — | une vidéo, 12,5 images par seconde : RIFE | candidat, autre chantier |

## Ce qui reste

0. **La façon retenue est « ×2 + traînée »** (27 septembre 2026). Les images de RIFE n'y sont jamais
   montrées nettes : les points 1 et 2 comptent moins, sauf pour la façon « images », gardée au bouton.
1. **Revoir les images de RIFE.** Toutes les attractions à tours sont passées par RIFE 4.0 (x10 ;
   x20 pour celles qui tiennent les 60 images par seconde). Relues par Fabien le 26 septembre 2026 :
   bonnes, BIG WHEEL (sauf un écart entre les sièges et les bras), BOUNCY CASTLE, FLIGHT SIM, GHOST
   HOUSE, HAUNTED HOUSE, OBSERVATION TOWER, SUPER SPINNER ; à revoir, MERRY-GO-ROUND, PARASOL CHAIRS,
   PIRATE BOAT, PLANE FLYER, PLANET ROCKET, SPACE SHUTTLE, TREE HOUSE (à refaire : Fabien en
   corrigera les fichiers) ; inutile, SNAKES AND LADDERS (écartée).
2. **Ce que RIFE rate** (une pièce qui tourne beaucoup d'une étape à l'autre : les avions, les
   chaises) : Interprite, à la main ; la chaîne est prête (`<boucle>-1x/` à l'export,
   `assets/animations/interprite/` à l'import, LISEZMOI.txt). La navette en marche passe par les poses
   que le jeu dessine pour son départ et son arrêt ([architecture.md](architecture.md), « Les poses à
   mi-chemin ») ; il lui manque deux dessins, en haut du looping.
3. **Les attractions à train, à bouées et à voitures** relèvent du code (tableau ci-dessus), et ne
   sont pas prioritaires.
4. **Les cycles de marche** des visiteurs et du personnel : écartés par le recensement du 28 septembre
   2026 (« Les autres animations du parc ») : 7,5 images par seconde déjà, la position avançant à chaque
   pas ; deux fois plus vite, le pas ne suivrait plus le déplacement, et des images de RIFE montrées
   nettes, Fabien n'en veut pas.
5. **Limite connue.** Un objet devant l'attraction qui aurait, à un pixel, la couleur de l'attraction
   à cet endroit y laisse passer la pose intermédiaire.
6. **La fontaine** (retours 54, 57 et 58) : en ×4 + traînée, choisi par Fabien après le ×2 et l'essai des
   images de RIFE ×2 ; la comparaison des façons est dans `travail/captures/` (`fontaine-avant-apres.html`,
   `fontaine-comparaison.png`).
7. **Les deux candidats du recensement** : les enseignes défilantes, par le code (un défilement au
   pixel) ; les films des attractions, par RIFE sur la vidéo. Et, de peu de gain, les ballons des
   clients en ×2 + traînée.
