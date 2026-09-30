# Architecture : de l'exécutable de 1994 au moteur lisible

Ce document décrit la méthode retenue pour remplacer le moteur d'origine, et ce qui est en place.

---

## Le problème

Theme Park est un programme de 545 Ko de code x86, compilé par Watcom C/C++ pour DOS et lancé par
l'extendeur DOS/4GW. Le récrire « à l'oreille », à partir d'une lecture du désassemblage, donnerait
un jeu ressemblant mais pas le jeu : les centaines de constantes de simulation, les arrondis, les
files d'attente, les humeurs des visiteurs se perdraient en route, sans qu'on puisse jamais dire où.

La méthode retenue est celle des projets de décompilation sérieux : **obtenir d'abord une copie
exécutable et fidèle, puis la rendre lisible morceau par morceau, chaque morceau étant vérifié
contre la copie fidèle.** On ne remplace jamais du code compris « à peu près » : on remplace du code
dont on a prouvé qu'il fait la même chose.

---

## Les deux temps

### 1. La transcription mécanique (faite)

`outils/transcrire.py` traduit **chacune des 1 098 fonctions** du jeu en une fonction JavaScript
qui reproduit ses instructions une à une : les registres sont des variables, la mémoire est un
tableau d'octets où le programme est chargé à ses adresses d'origine, la pile est la vraie pile.

Ce code n'est pas beau, mais il est juste, et il tourne : le jeu démarre, affiche son écran titre,
son menu, et joue sa démo, sans émulateur.

Deux précautions le rendent digne de confiance :

- **Vérification instruction par instruction.** `outils/verifier_transcription.py` exécute chaque
  instruction du jeu dans Unicorn — un émulateur de processeur de référence — et dans sa traduction
  JavaScript, à partir du même état tiré au hasard, puis compare registres, indicateurs et mémoire.
  375 762 cas sur 125 626 instructions ; les conditions de saut (`cmp` suivi de `jl`, etc.) sont
  vérifiées séparément, 29 727 cas.
- **Analyse de pile.** `outils/pile.py` suit la hauteur de pile dans chaque fonction et signale tout
  `ret` qui ne revient pas à son appelant — c'est ainsi qu'a été trouvé `_chain_intr`, qui saute à
  l'ancien gestionnaire d'interruption par un `retf`.

### 2. La réécriture lisible (faite)

Chaque fonction transcrite peut être remplacée à l'exécution par une fonction écrite à la main,
lisible, nommée, commentée. La transcription reste disponible comme référence : on rejoue la même
partie avec et sans la fonction réécrite et on compare image par image.

Toutes les fonctions qu'une partie peut atteindre sont maintenant réécrites, et la transcription a
quitté le jeu : le **moteur autonome** n'exécute que le code lisible, sur une image des seules
données de `MAIN.EXE`. Elle ne sert plus que de référence aux outils de vérification. Voir « Le
moteur autonome », plus bas.

---

## Ce qui remplace DOS

Le jeu de 1994 parlait à DOS, au BIOS, à la carte VGA, à la souris et à l'horloge. `moteur/hote/`
refait ces services — au niveau des services, pas des circuits :

| Fichier | Rôle |
|---|---|
| `processeur.js` | le moteur autonome : les registres, et la table des fonctions du code lisible, par adresse — sans une instruction de 1994 |
| `image-programme.js` | l'image des données de `MAIN.EXE` (au format de `programme.bin`) : l'objet des données et les îles de données logées dans le code |
| `image-intro.js`, `intro-carte.js` | l'image de l'introduction : les données d'`INTRO.EXE` posées dans la disposition mémoire de `MAIN.EXE`, d'après la carte qu'`outils/intro.py` tire des deux programmes |
| `tables-du-programme.js`, `carte-du-programme.js` | ces images en tables lisibles (`assets/programme/`) : la carte des zones nommées et typées (faite par `outils/carte-du-programme.mjs`), leur écriture en JSON et en texte, et leur recomposition, octet pour octet |
| `polices.js`, `langues.js` | les polices du jeu en planches PNG (un glyphe par code) et en tables JSON, dont se refont la petite police et les tables de caractères du programme et la banque `MFONT-0` ; le manifeste des langues (`assets/textes/index.json` : nom, fichier, emplacement de 1994), que lisent la recomposition et le menu des langues de la page |
| `pilotes-hmi.js` | les bibliothèques de pilotes de HMI (`HMIDET.386`, `HMIDRV.386`) refaites en fichiers virtuels depuis leurs en-têtes (`assets/donnees/pilotes-hmi.json`) |
| `iso9660.js`, `assets-du-jeu.js`, `formats-du-cd.js`, `png.js`, `fichiers-paquet.js` | le CD lu dans son image ISO ; les assets du jeu — les données du CD en formats d'aujourd'hui (PNG à palette, WAV, HMP et MIDI, JSON), extraites du CD et dont le moteur refait, octet pour octet, les fichiers que le jeu lit — ; les formats du CD (banques d'images et de sons, textes, HMP) et le PNG, écrits sans bibliothèque ; les fichiers du jeu dans la page : refaits depuis les assets, lus par requêtes ou dans le stockage du navigateur, et les écritures du jeu, rendues à la page une fois, 100 ms après la dernière (la sauvegarde de fin d'année, en 53 blocs, figeait le jeu 0,3 à 0,5 s quand chaque bloc partait) |
| `le.js` | charge l'exécutable LE et applique ses relocations (pour la transcription, qui sert de référence) |
| `machine.js` | mémoire, descripteurs de segment, interruptions DOS et DPMI, ports, minuterie, souris, clavier |
| `video.js` | mode 13h et modes VESA à banques, palette, balayage vertical |
| `son.js` | la carte son : les modules de pilote HMI que le jeu chargeait, le mélange des bruitages, la sortie |
| `opl.js` | la puce de synthèse FM (Yamaha OPL3, compatible OPL2) |
| `fichiers-node.js` | les fichiers du jeu sous Node : le CD, et un dossier d'installation inscriptible (celui de chaque vérificateur) |
| `fichiers-web.js` | ne sert plus : la page demandait ses fichiers au serveur, qui gardait les sauvegardes ; elle refait maintenant les fichiers du jeu depuis les assets (`fichiers-paquet.js`) |

**Le temps est virtuel, et cadencé par les images.** Le jeu de 1994 n'a pas d'horloge : il avance
d'un pas de simulation par image dessinée, aussi vite que le processeur le permet. L'hôte lui en
donne une, sans jamais lire l'horloge de la machine :

- **chaque image présentée vaut 1/30 de seconde.** Toute présentation d'une image commence par
  poser le curseur de la souris dans l'image, `0x7D775` — dans le parc en basse et en haute résolution, dans
  les menus, sur les écrans fixes. C'est le repère ;
- chaque service rendu au jeu (interruption, port) coûte quelques microsecondes ;
- les interruptions (minuterie, souris) sont livrées au début de chaque service et à chaque image ;
- un garde-fou fait avancer le temps dans les attentes actives, ces boucles qui relisent la
  mémoire sans appeler aucun service en attendant qu'une interruption la change : 25 ms au bout de
  2,5 millions de sauts arrière sans service. Le plus long travail mesuré entre deux services (le
  passage en 640x480) en compte 140 000 : le garde-fou ne part jamais au milieu d'un dessin.

Deux conséquences. Deux exécutions avec les mêmes entrées donnent exactement la même partie, ce qui
rend les comparaisons possibles. Et le temps ne dépend pas de la façon dont le code est écrit : une
fonction réécrite, plus courte que sa transcription, ne fait pas dériver l'horloge. Dans le
navigateur, ce temps virtuel est ensuite calé sur le temps réel.

Ce modèle a été trouvé par étapes, et chaque étape fausse a laissé une trace instructive dans le
[journal des essais](journal-des-essais.md), § 5.3.

**La souris est relative.** Une souris de PC ne connaît que des déplacements, et le jeu en tient
compte : il additionne des écarts, et déplace lui-même le pointeur du pilote (au centre, à chaque
changement de mode ou d'écran plein ; sur la grille, pendant le tracé d'un chemin). Le navigateur,
lui, donne des positions absolues. L'hôte les traduit en déplacements, appliqués à partir de la
position où le jeu a mis le pointeur, et découpés en petits pas comme les interruptions d'une vraie
souris (`Machine.deplacerPointeur`). Quand le jeu cesse de déplacer le pointeur, chaque mouvement
rattrape une part de l'écart avec le pointeur du navigateur : le curseur du jeu revient sous la
main. Les scénarios de vérification, eux, donnent des positions absolues (`deplacerSouris`).

Au premier clic sur le jeu, la page capture la souris (*pointer lock*) : le navigateur ne donne plus
que des mouvements, transmis tels quels (`Machine.deplacerSourisDe`), exactement comme une souris de
PC. Le pointeur ne sort plus de l'image, et, bloqué au bord, il fait défiler la vue. En plein écran,
le clavier est verrouillé pour qu'Échap reste au jeu.

**Le tracé à la souris** (retour 37 de [demandes.md](demandes.md) : « le cliquer-glisser pour dessiner
des routes est complètement cassé » ; la route filait trop loin, en biais). Pendant qu'on trace un
chemin, une barrière, une rivière ou des rails en haute résolution, le gestionnaire de souris
d'origine part de la position du pilote et y ajoute encore l'écart, puis le jeu recolle le pointeur à
la grille à chaque image (retro-ingenierie.md § 6.7, « le double comptage ») : le curseur allait au
double de la main, et d'autant plus que les événements de la souris étaient espacés (plusieurs dans
une même image s'y compensent en partie). En 640x480, un hasard le masquait : le travailleur déduisait
de la plage du pilote le nombre de ses unités par pixel, et, le jeu resserrant cette plage sur la vue
pendant un tracé, le trouvait de 7 au lieu de 8. En grande vue, rien ne le masquait. Deux changements,
hors du jeu d'origine : le travailleur prend le facteur exact (2 unités par pixel en 320x200, 8 en haute
résolution), et le réglage `corrigerLeTraceALaSouris` (reglages.js ; la page l'allume toujours, les
vérificateurs non) fait compter l'écart de la main une seule fois (`projeterLaMain`, souris-jeu.js) :
pris sur le pilote depuis sa position à l'événement précédent, ou là où le jeu l'a replacé, projeté
sur les axes de la grille comme dans l'original mais sans arrondi (les fractions de pixel gardées
d'un événement au suivant : sans le double comptage, une main lente ne faisait plus avancer
l'horizontale, et la route sortait de sa rangée), et ajouté à la position précédente du curseur.
Mesuré sous Node en imitant la page (souris libre et capturée, 640x480 et grande vue 1088x720) : pour
100 pixels de la main, le curseur en fait 100 à droite, à gauche, en bas et en diagonale, contre 200
avant, et suit la rangée en bas (+50 à l'horizontale pour 100 en bas) ; dans la page, 97 au lieu
d'environ 200. Réglage éteint, `verifier.mjs --empoisonner` reste IDENTIQUE sur `trace-haute` (641
relevés), `travaux`, `parc` et `murs-rails`.

Puis (retour 39 : « toujours cassé, surtout en grande vue zoomée en arrière ; selon le zoom, le
déplacement est inversé »), deux autres causes. **L'image composée du zoom** : la page y tient son
pointeur (zoom.js), l'envoie en positions, et le recale sur le curseur du jeu chaque fois que le jeu le
place (0x11191 : à chaque image d'un tracé, la projection sur les axes). Le travailleur, lui, comptait
le mouvement depuis la dernière position envoyée : le premier mouvement après un recalage rejouait
l'écart entre la main et le curseur projeté, image après image — la route filait en biais, trop loin,
ou à rebours de la main quand cet écart l'emportait. La page envoie maintenant chaque recalage au
travailleur (`recalerLePointeur`, message 20) : la nouvelle référence des mouvements, sans mouvement.
**Un outil en main** (voie 1 du gestionnaire, hors tracé), le curseur comptait aussi l'écart deux fois ;
l'hôte découpant les mouvements en pas d'un 160e de l'écran (onze pixels à 1824 de large), il filait
d'autant devant la main et visait une autre case que celle qu'on voyait sous elle : avec la même
correction, il garde la position du pilote. Mesuré sous Node en imitant la page zoomée (1824x1026 et
1088x720, souris capturée, main 100 pixels vers le bas) : avant, le curseur montait de 30 (inversé),
ou filait de 48 pixels trop bas et de 85 de côté ; après, il descend de 106 le long de l'axe de la
grille (+61 à l'horizontale, la projection du jeu). Dans la page, au cran 13/18 de la grande vue
(1728x1008), 108 pixels du jeu vers le bas : le curseur en fait 100, et 50 de côté, sans à-coup.
Réglage éteint, les 46 scénarios de `verifier.mjs --empoisonner` restent IDENTIQUES.

**Le glisser au bouton du milieu** (retours 49 et 55). Tenu, il fait glisser la vue ; le bouton n'est
plus transmis au jeu, qui le prenait pour le gauche. La caméra du jeu ne va que par cases (24 x 16
pixels en 640x480), bornée à la carte : de 0 à 63 en colonnes et en rangées, pour le coin haut gauche
de la vue (0x184DF). La première version cumulait la main en rangées (dy / H) et en colonnes
((dx − dy / 2) / W), bornées chacune de son côté : contre le haut de la carte, la rangée restait à 0
mais la correction des colonnes jouait encore, et une main qui descendait faisait partir la vue de
côté ; l'excès s'accumulait contre les bords ; et la vue avançait par cases, que le défilement fluide
lissait avec retard (retour 55, « bloqué sur un axe » ; mesuré dans le parc de démonstration, caméra
40,4 : cent pixels vers le bas la menaient à 44,0, la vue quatre colonnes de côté).

Quand la page compose l'image (zoom, défilement fluide), elle tient maintenant elle-même la vue
montrée, au pixel, dans le plan du monde de vue-fluide.js (`glisser.js`) : la main la déplace, elle
est prise dans les mosaïques où chaque vue publiée est collée à sa place, et la caméra la suit,
demandée par la page (message 24, `placerLaCamera`) à la case qui la devance dans le sens de la main,
pour que ce qui entre à l'écran soit déjà dessiné ; la vue montrée reste entre les deux dernières
places publiées de la caméra, comme la glisse du défilement fluide. Le travailleur publie pour cela la
caméra de chaque vue (`Z.CAMERA`). Dans le zoom, la caméra est demandée pour que la portion montrée
soit au milieu de l'image du jeu : la portion bouge au pixel dans la marge de l'image, et, là où la
caméra bute, va encore jusqu'au bord de l'image. La vue voulue est bornée à ce que la caméra atteint,
les rangées d'abord, puis les colonnes pour cette rangée (la vue est oblique : une rangée de plus
décale la carte de L/3) ; buter n'accumule rien, la main qui revient fait aussitôt revenir la vue. Au
relâchement, la vue attend la dernière caméra demandée, puis rejoint en 120 ms la vue du jeu, ou la
place la plus proche dans la marge du zoom : un clic tombe sur ce qu'on voit. La molette ne zoome pas
pendant le glisser (on l'enfonce pour glisser, elle tourne parfois d'un cran). Sans image composée (ni
zoom ni défilement fluide), la page envoie la main (message 21), et le travailleur tient la vue voulue
de la même façon, bornée, en cases (`glisserLaVue`). Mesuré dans la page, parc de démonstration : au
dézoom le plus loin, la main vers le bas mène la vue au haut de la carte sans la décaler de côté ; à
165 %, la vue montrée suit la main au pixel à chaque image, et un aller-retour la ramène exactement à
son point de départ ; en 640x480 fluide et sans fluide, la caméra suit de même, sans excès aux bords.
Reste : au dézoom le plus loin, la vue du jeu est plus grande que la carte, et la caméra ne passant
ni au-dessus ni à gauche de son coin, la carte n'y peut être centrée ; il faudrait une caméra négative,
que le code du jeu ne connaît pas (la case sous le pointeur, `caseSousLePointeur`, la borne par
rapport à la caméra ; la transcription lit la caméra en quelque 170 endroits).

Pendant le glisser (retour 52), le pointeur prend la main ouverte du jeu : le travailleur enveloppe
0x116E4, que la boucle du parc appelle à chaque image avec le pointeur de l'outil, et lui passe l'image
13 de la banque des pointeurs (`[0xD3B84]`) tant que la page le demande (message 23) ; au relâchement,
le pointeur de l'outil revient de lui-même. Le curseur reste sur le point du parc qu'il a saisi
(retour 56 ; il restait d'abord immobile) : placé à chaque image à ce point moins la vue montrée, à
l'échelle du zoom (`pointSaisi`), il suit la main tant que le parc la suit et s'arrête avec lui contre
un bord, à quatre pixels du jeu au moins des bords du cadre (là, le jeu ferait défiler sa vue
lui-même). Dans le zoom, la page le dessine là et y pose son pointeur, dont le jeu reçoit le point.
En 640x480 fluide, c'est le curseur du jeu qui est mené sur le point saisi : déplacé (message 7) souris
capturée, ou placé (message 1) souris libre, le pilote de l'hôte ramenant le curseur du jeu vers la
dernière place reçue (machine.js) ; sans image composée, le travailleur le déplace avec la caméra,
d'une case à l'autre (`deplacerLeCurseurDe`). La souris libre n'est plus capturée le temps du
glisser : relâchée, elle reparaissait là où le glisser avait commencé, et le curseur y serait revenu ;
elle suit la main, et le curseur la rejoint au relâchement si un bord l'a arrêté. Souris capturée, le
pointeur reste où le glisser a laissé le curseur. Mesuré dans la page (souris libre, 165 %) : le
curseur montré suit la main au pixel près, s'arrête contre le haut de la carte quand la main continue,
et repart dès qu'elle revient.

**Le double-clic fantôme** (retour 42 : un objet lac sur le curseur après l'écran de fin d'année). Le
compte à rebours du double-clic (0xDE59E) n'est décompté que par le pas de simulation ; les boucles qui
arrêtent la simulation (la fin d'année, les négociations, les questions, la pause) le figeaient, et
leurs deux derniers clics, à des secondes d'écart, faisaient un double-clic, que la vue du parc
traitait à son retour (0x1803C) : l'outil de la case sous le pointeur passait en main. Défaut du jeu de
1994 (la transcription seule fait de même). Réglage `corrigerLeDoubleClicFantome` (toujours allumé
dans la page) : un second appui plus de 25 tics de la minuterie (0,34 s) après le premier réarme le
compte (`traiterLesBoutons`, souris-jeu.js).

**Le tampon du clavier** (retour 80). Le jeu lit une touche par image, par le BIOS (int 16h, 0x875A4),
et pas du tout pendant la fin d'année ou les négociations. Le tampon du BIOS de 1994 n'en gardait que
15 (seize mots en 0x41E, l'un toujours libre ; au-delà, un bip, et la touche perdue) ; celui de l'hôte
n'avait pas de borne : F4 tenu, répété trente fois par seconde quand les images ralentissaient, ou
frappé pendant un écran qui ne lit pas le clavier, y restait, et la vitesse du jeu continuait de monter
une image après l'autre, longtemps après la touche relâchée, les F3 attendant derrière. Il est borné à
15 (`toucheAppuyee`, machine.js) ; aucun des scénarios n'a jamais plus d'une touche en attente, sauf
`vitesse-f3-f4` (42 sans la borne).

**La table des objets agrandie** (retour 60 de [demandes.md](demandes.md) : des cases de montagnes
russes impossibles à construire, un monorail qui bloque, une attraction à train qui n'ouvre pas). Tout
ce qui vit dans le parc — visiteurs, attractions, kiosques, boutiques, personnel, le bus, chaque
morceau de voie et chaque wagon — est un enregistrement de 200 octets d'une seule table, la ressource
« *THING » : 1 200 enregistrements réservés par 0x104A3, dont 1 198 servent (l'objet 0 n'existe pas,
et 0x12452 pose la fin en dur, `[0xD3B10]` + 0x3A8B8). Les visiteurs n'en prennent jamais les 100
derniers (0x2845A), et le bus arrive vide au-delà de 800 présents (0x67CD4). Sur la partie de Fabien,
885 visiteurs et 195 morceaux de voie (dont 93 du monorail, bâti dans la réserve) occupaient tout :
chaque pose cherchait un emplacement libre et renonçait sans rien dire, pendant que l'aperçu montrait la
pièce. Défaut du jeu de 1994, que le moteur reproduisait. Réglage `grandeTableDesObjets` (toujours
allumé dans la page) : 4 000 enregistrements, 3 998 emplacements, les visiteurs gardés aux 1 098
premiers comme en 1994 ; `plusDeVisiteurs` (de même) : le bus amène du monde jusqu'à 1 600 présents,
et les visiteurs occupent au plus les 2 399 premiers emplacements, ce qui en laisse toujours 1 599 pour
construire. La table se réserve une fois, au démarrage : le travailleur allume le réglage avant.
Rien d'autre ne connaît sa taille : tout ce qui la parcourt s'arrête à sa fin, `[0xD3B78]`, et les
numéros d'objet sont des mots. La sauvegarde garde le format de 1994 ; les enregistrements au-delà du
1 200ᵉ la suivent, s'il y en a (« OBJ+ », leur nombre, puis eux-mêmes) ; au chargement, la table est
vidée au-delà, puis la suite relue (`moteur/jeu/table-des-objets.js`). Mesuré sous Node sur la partie
de Fabien : les rails se posent de nouveau au premier clic ; une sauvegarde qui a 15 objets au-delà
(307 676 octets) est relue à l'identique, objets et carte ; 885 visiteurs, 1 080 dix minutes de jeu
plus tard, pour 81 s de calcul par 600 s de jeu en vitesse rapide. Les sommes que le relevé des
statistiques fait sur 16 bits (la faim et la soif, 0x68E34) restent loin de déborder : des octets
proches de 0, au plus 10.

**Les réglages.** Les écarts assumés avec le jeu d'origine vivent dans `moteur/jeu/reglages.js`,
tous désactivés par défaut : les vérificateurs comparent toujours le jeu d'origine, et la page active
ce que le joueur choisit. Le premier est le défilement adouci : en 640x480, le jeu d'origine avance de
deux colonnes par image au bord de l'écran, et la vue traverse la carte en une seconde à 30 images
par seconde ; adouci, il avance d'une colonne tous les 7 tics de sa minuterie, la vitesse à l'écran
du 320x200. Le second, le défilement fluide, ne change que ce qui est montré : section suivante. Le
troisième, la grande vue, agrandit l'écran du parc : section « Les réglages : la grande vue ». Les
suivants, les corrections
(`corrigerLesDeplacementsDuPersonnel`, `corrigerLesEjections`, `corrigerLeRetourDesVisiteurs`,
`corrigerLesToursEnTrop`, `corrigerLaFileEnPause`, `corrigerLeLabyrintheHorsDeVue`, `corrigerLesPonts`, `corrigerLeCadrageSurUnObjet`, un seul bouton « original bug fix » dans la page, allumé par défaut, message 15 au travailleur), corrigent des défauts du jeu
de 1994 et changent la partie :
l'employé formé à une vitesse qui ne divise pas 256 est posé au milieu de sa case à chaque case
(`moteur/jeu/corrections.js` ; le mécanicien enfermé qui figeait le jeu y renonce à errer ; celui
qui longe un obstacle sans plus pouvoir en sortir, dévié par la formation, cesse de longer et refait
son plan, dans `0x63E5D` et `0x349EB` ; l'agent d'entretien sans tournée tire sa sortie également
entre les sorties d'un carrefour, au lieu du tirage biaisé vers le haut et la droite), et un
passager n'est éjecté qu'au seuil d'usure de la fiche plutôt qu'à 18 (`0x65D25`) ; et le visiteur
qui s'en va prend un plus court chemin vers le portique (`0x22BA6`, un parcours en largeur dans
`corrections.js`, au lieu de `0x349EB` qui s'y perd au bord de l'eau), la direction du jeu gardée
tant que rien n'est sur la route ; le train qui revient en gare avec des wagons encore dans un
looping s'arrête quand même, et ces wagons finissent le looping puis roulent jusqu'à leur place
derrière le wagon qui les précède (`0x42C6E`, vehicules.js), au lieu de repartir pour un tour plus
rapide ; et le premier d'une file, en pause (une trentaine de pas tous les 256), garde sa place quand
l'attraction veut le faire monter (`0x30B19`), au lieu que la file soit oubliée 6 000 pas ; et le
labyrinthe fait descendre le passager que son dessin montre (+4D, que seul le dessin remet à 0), au lieu
de rester à l'arrêt sans fin quand on ne le regarde plus (`0x2FB85`, attractions.js) ; et effacer une
case de rivière laisse tel quel le pont voisin (`0x2C2EC`, outils.js, `garderLePont` de corrections.js),
que le jeu refaisait comme une case d'eau, dans la famille des allées : une allée ordinaire en T, sans
eau dessous, tournée vers l'herbe effacée et vers la rivière, que les visiteurs suivaient ; et la vue
amenée sur un employé ou l'objet d'une liste le met au milieu de la vue du parc, à la case près
(`cameraCentreeSurLObjet` de corrections.js, appelée par construire.js et ecrans-gestion.js), au lieu
de l'y poser à droite et en bas, l'obliquité des rangées et le panneau oubliés (96 et 30 pixels en
640x480, 176 et 30 en grande vue de 800 lignes : « Le cadrage sur un objet », section de la grande
vue) ; bogues 4 et 5 et retours 62, 65, 69, 75 et 76 de [demandes.md](demandes.md). La
table des objets agrandie et plus de visiteurs lèvent une limite du
jeu de 1994 (plus haut). Le dernier, les animations intercalées, montre des images
intermédiaires entre deux images de l'animation d'une attraction, sans rien changer au jeu : section
« Les réglages : les animations intercalées ». (Les sprites HD, un temps réglage à part, ont été
retirés : section « Les sprites HD, retirés ».)

Deux fonctions du jeu sont remplacées d'office par l'hôte, parce qu'elles font des choses qu'une
transcription fonction-par-fonction ne peut pas reproduire (une troisième, `0x7D775`, la pose du
curseur, est seulement enveloppée : c'est le repère d'image de l'hôte ; sa réécriture reste donc en
attente) :

| Adresse | Ce que c'est | Pourquoi |
|---|---|---|
| `0x89F90` | cœur de `int386x` (Watcom) | atteint l'interruption par un `ret` sur une table de routines `int N ; ret` |
| `0x821BE` | `_chain_intr` | défait la pile du gestionnaire et saute à l'ancien par un `retf` |

---

## Les réglages : le défilement fluide

Le jeu déplace sa caméra par cases entières : la vue saute de 24 pixels à l'écran par colonne, de 16
par rangée (et 8 de côté), dans les deux modes. Avec `reglages.defilementFluide`, elle glisse au pixel d'une position de
la caméra à la suivante, en 320x200 comme en 640x480. **Le jeu n'en est pas changé** : caméra,
simulation, entrées, dessin restent ceux de 1994 ; seule l'image montrée diffère.

*Pourquoi pas une vue plus grande, dessinée par le jeu.* Dessiner la vue a des effets sur l'état :
l'enseigne d'un kiosque défile (l'octet +0xBB de l'objet) seulement s'il est dessiné, la première
attraction visible réclame la musique, le clic est attribué pendant le dessin, l'objet choisi joue
son bruitage, chaque tracé marque la grille des blocs du 640x480. Une vue élargie dessinée par le
jeu changerait donc la partie, à moins de sauver et restaurer toute la machine (64 Mo, l'hôte, le
son) à chaque image et de dessiner deux fois. Et le traceur, la grille des blocs et des routines
encore transcrites supposent des lignes de 640 ou 320 octets.

*Ce qui est fait : la vue traîne derrière la caméra, dans une mosaïque.* La projection du jeu est
une translation (§ 5.1 de la rétro-ingénierie, `parcourirLaVue` dans `dessin-carte.js`) : pour la
caméra (C, R), la vue est le coin (X, Y) d'un plan du monde, X = C·L + R·⌊L/3⌋ + q·L − 640 avec
q = ⌊(640 − origineDessinX)/L⌋, Y = R·H (moitié moins en 320x200). Chaque pas de la caméra devient
un point de passage, daté un intervalle moyen après le précédent ; l'image montrée va de point en
point en ligne droite. L'intervalle moyen (moyenne glissante des écarts entre pas, de 25 à 160 ms,
repartant de 100 ms après un repos) régularise la vitesse : les pas arrivent irrégulièrement — au
bord de l'écran un toutes les trois images, reçus au rafraîchissement suivant ; au clavier au rythme
de la répétition des touches, que le jeu lit une par image — et une glisse calée sur chaque écart
avançait par à-coups, ce qui se voyait surtout au clavier. Quand la caméra accélère, les points
suivants se rapprochent (jusqu'à un demi-intervalle, la vitesse au plus doublée) pour que le retard
ne dépasse pas un intervalle et demi. La position montrée est ainsi toujours entre des
positions que la caméra a occupées : le bord avant, du côté où l'on va, est couvert par l'image que
le jeu vient de dessiner, en avance ; la bande arrière, qui sort de l'écran, l'a été une ou deux
images plus tôt. Les vues successives sont donc recollées à leur place dans une mosaïque du monde
(4096x4096 indices de couleur, adressée modulo), où la fenêtre montrée est découpée. Une marge
dessinée par le jeu n'apporterait du neuf que sur la bande qui s'en va.

*Qui fait quoi.*

| Où | Quoi |
|---|---|
| `moteur/jeu/vue-fluide.js` | deux crochets en lecture seule : à la fin de la vue du parc (`0x13B9A`, `boucle.js`), la vue seule — la surface au-dessus du panneau de commande, avant l'interface, et en 640x480 le fond dans les blocs que l'image n'a pas touchés — et sa position (X, Y) ; à la fin de la présentation (`0x80210`, `0x55507`, `presentation.js`), l'image complète, curseur compris. Les deux partent ensemble au rappel `vueFluide.surImage`. Réglage éteint (et grande vue éteinte : le zoom s'en sert aussi), un test de booléen, rien d'autre |
| `moteur/web/travailleur.js` | écrit l'image publiée en mémoire partagée, sous un verrou de séquence ; dit à la page si le parc publie (l'en-tête, mot 9) |
| `moteur/web/defilement-fluide.js` | sans DOM : la mosaïque, le masque de l'interface, la glisse, la composition |
| `moteur/web/principal.js` | le bouton « fluide », la composition à chaque rafraîchissement de l'écran pendant une glisse ; hors glisse, l'image du jeu telle quelle |

*L'interface reste à sa place.* Ce que le jeu trace par-dessus la vue (barre de menus, fenêtres,
barre des messages, curseur, coins de la case visée, aperçu de l'outil) est ce qui diffère entre
l'image complète et la vue seule ; le panneau de commande en est en entier. Pendant une glisse, ces
pixels sont pris dans l'image du jeu, à leur place ; les autres, dans la mosaïque, à la position de
la glisse. Un pixel d'interface qui aurait la couleur de la vue dessous n'est pas vu comme tel : les
trous d'un pixel entre deux pixels d'interface sont bouchés. Le masque est relevé par mots de quatre
pixels (l'image et la vue égales se traversent à un mot par tour ; les trous ne sont cherchés que
dans les lignes qui ont un écart ou une voisine qui en a), puis rangé en plages par ligne ; la
composition recopie chaque ligne de la mosaïque, puis ses plages d'interface, et le bas de l'écran
d'un bloc, au lieu de choisir pixel par pixel.

*La souris.* Le jeu calcule la case visée depuis sa caméra ; pendant une glisse, l'image montrée en
est décalée d'au plus un pas. Plutôt que de corriger la position envoyée au jeu — il faudrait lui
donner des mouvements que le joueur n'a pas faits, et il dessine lui-même son curseur —, **la glisse
est finie avant tout clic** : un appui de bouton cale d'abord l'image sur la caméra, puis part au
jeu ; ce que voit le joueur au moment du clic est ce que voit le jeu. Bouton gauche tenu (un tracé,
un outil qu'on glisse), pas de glisse du tout : le tracé reste sur ses cases. Pas de glisse non plus
quand la caméra franchit plus de 6 cases d'une image à l'autre (la carte du parc), au changement de
mode, ni hors de la vue du parc.

*Limites.* Pendant une glisse, les marques que le jeu pose sur le monde après le dessin de la carte
(coins de la case visée, aperçu de l'outil) restent à leur place à l'écran, décalées au plus d'un
pas, jusqu'à la fin de la glisse ; la bande arrière montre le monde d'une ou deux images plus tôt ;
dans une glisse en diagonale, un coin de la taille du pas peut manquer aux vues récentes et venir de
plus loin dans la mosaïque.

*Preuves.* Réglage éteint, les vérificateurs rejouent le jeu d'origine. Réglage allumé, une partie
jouée deux fois, éteint puis allumé, donne la même mémoire du jeu toutes les 100 ms, toute la
mémoire (pile et images comprises) chaque seconde, et la même heure ; la logique de la page, rejouée
sur les images publiées, redonne l'image du jeu à l'octet près quand la vue montrée est à la
caméra (le détail est dans le [journal des essais](journal-des-essais.md), § 2.3).

---

## Les réglages : la grande vue

Avec `reglages.grandeVue` (bouton « grande vue » de la page), la vue du parc en 640x480 devient
une image plus grande, au format de la zone d'affichage : sa taille suit le zoom choisi à la molette
(la plus petite image qui couvre le parc montré, avec une marge : « Le zoom continu », plus bas), de
480 à 1600 lignes, 2560 de large au plus, largeur multiple de 32 — 1408x800 au niveau 0 en 16/9.
Le parc remplit l'écran ; la barre d'outils et la barre des messages sont
centrées en bas, sur une bande pavée de part et d'autre ; les icônes du haut sont au coin droit ; la
barre de menus fait toute la largeur. **C'est un écart assumé : la partie peut différer de
l'original** — dessiner plus de cases, c'est dessiner plus d'objets, et le dessin a des effets
(section précédente : enseignes, musique, clic attribué pendant le dessin), et la caméra se cadre
sur un écran plus grand (0x184DF, les objets qu'une fiche ou le tutoriel amène au milieu). Éteint,
rien ne change.

*La géométrie de l'écran.* Le programme écrit partout 640 et 480 en dur : la largeur et le pas
d'une ligne de la surface, la hauteur, la grille des blocs de 32x16 (20 x 30, en `0xD671D`), les
bornes du curseur et du pilote de souris (638, 478), le bord droit du parcours de la carte, les
cadrages de la caméra (`640 / largeur de tuile`). `moteur/jeu/grande-vue.js` tient ces valeurs dans
`ecran` ; chaque réécriture concernée les y lit. Tant que la grande vue n'est pas appliquée, ce sont
les constantes d'origine : les vérificateurs rejouent donc toujours le jeu de 1994. Une exception, le
bord droit du parcours de la carte (`bordDuDessin`, plus bas, « La case sous le pointeur »). L'inventaire
des endroits touchés : présentation (`presentation.js`, et la présentation en ligne de la boucle du
parc dans `amorcage.js`), grille (`ecran.js`, `ecrans-infos.js`), dessin de la carte, point,
rectangle et effacement (`systeme.js`), petite police et enseignes (`dessin-objets.js`), pluie,
neige, éclairs, barre de menus et ses menus, catalogues surgissants, bulle des messages, souris
(`souris-jeu.js`), bords de l'écran (`carte.js`, `poses.js`), cadrages de caméra (`carte.js`,
`boucle.js`, `construire.js`, `ecrans-gestion.js`, `evenements.js`, `personnel.js`,
`interface-parc.js`, `carte-du-parc.js`, `ecrans-infos.js`) et le défilement fluide (`vue-fluide.js`).
Les segments des cadres (`0x8148C`, `bibliotheque.js`) écrivaient avec un pas de 640 en dur : ils
prennent aussi la largeur de `ecran` (les cadres de la boîte à question, des menus déroulants).
Le traceur, les lignes quelconques et le curseur lisaient déjà le pas `[0xDE5B8]`, la hauteur `[0xDE5C0]` et la
fenêtre de découpe : rien à y faire. Une fonction encore transcrite, `0x81CD4` (la présentation
entière), ne connaît que 640x480 : en grande vue, sa réécriture fait le travail à sa taille.

*Où elle s'applique.* Seulement dans la vue du parc (l'écran 0 et les messages 0x4A, 0x54, 0x56 et
0x64 qui s'y affichent), en mode 8. La boucle du parc l'applique au début de la routine de la vue du
parc (là où elle appelle déjà `0x11761`, le retour du 320x200), et revient en 640x480 au début de
celle de tout autre écran ; tout changement de mode vidéo (`0x7EC50`, `0x7ECF0`) y revient d'abord.
Les écrans pleins — fiches ouvertes par `0x35F21`, gestion, carte du parc, listes — restent donc le
code de 1994 en 640x480, que la page montre à l'échelle. Une fenêtre ouverte en pleine image (un
clic sur un objet) a été dessinée dans la grande surface, en coordonnées de 640x480 : au retour en
640x480, le coin haut gauche 640x480 des deux grands tampons est recopié dans ceux d'origine.

*Les feux d'artifice* (touche F, retour 48 de demandes.md). Le jeu dessine le spectacle autour du
centre d'un écran de 640 × 400 ; en grande vue, il restait dans le coin haut gauche, à une autre place
du parc à chaque cran. À l'allumage (0x6D4B7), le point du monde au centre de la vue est retenu, en
cases (la caméra, et la case sous ce point comme l'interface la calcule) ; au dessin (0x6D9D8), le
spectacle est décalé jusqu'à là où ce point est à l'écran, sans rien dessiner hors de la vue du parc
(catalogues.js). Rien n'est écrit dans la mémoire du jeu ; hors de la grande vue, le dessin d'origine.

*L'alarme du rouge.* Une banque VESA au-delà de la cinquième passe la couleur 0 au rouge vif
(`0x7E6BC`, une alarme de mise au point restée dans le jeu, retro-ingenierie.md) ; le 640x480 n'a que
cinq banques, la grande vue davantage. L'alarme est coupée tant que la grande vue est allumée
(systeme.js) ; mais en l'éteignant, l'écran encore grand pour une présentation, elle partait, et le
noir restait rouge jusqu'au rechargement suivant de la palette (retour 43 de demandes.md). Le
travailleur enveloppe `0x7E6BC` et, si l'appel vient de passer la couleur 0 au rouge, lui rend sa
valeur et l'état du DAC : dans la page, l'alarme ne se voit plus (essayé : la grande vue éteinte et
rallumée trois fois, et les quatre rendus à cinq crans, le noir reste noir).

*Le 640x480 d'office* (bouton « 640x480 » de la page, travailleur.js). Le jeu démarre toujours le
parc en 320x200 et n'en sort que par la touche R (0x13BF3). Le travailleur la frappe à la place du
joueur dès que la boucle du parc a dessiné sa vue en 320x200 (`vueDessineeEn320`, noté par une
enveloppe de 0x13B9A) ; la fin d'année, les négociations, la fiche du joueur et la carte du monde,
qui tournent en 320x200 sans changer l'écran courant, ne dessinent pas la vue du parc (bogue 2). Tant
que la bascule est armée (3 s au plus) et 150 ms après la frappe, rien n'est présenté : la page garde
l'image d'avant, sans montrer le parc en 320x200, ni, en grande vue, en 640x480 d'abord (retour 41 ;
avant, le parc restait une seconde en 320x200 à chaque partie commencée ou chargée).

*L'appliquer.* La surface `[0xDE5BC]` et le fond `[0xD3B98]` sont pointés sur deux tampons de
W x H **hors de la mémoire du jeu** : l'hôte de la page a près de 5 Mo de plus que les 64 Mo que voit le jeu
(`Machine({ memoireEtendue })`), ce qui ne change rien à son tas. La grille des blocs y passe aussi,
toute marquée. Pas de ligne et hauteur, fenêtre de découpe (`0x87790`), mode vidéo de l'hôte
(`Video.changerModeLibre`, une fenêtre de 64 Ko par banques comme le 640x480), bornes du pilote de
souris ; la table des zones de l'écran du parc (`0xB93C3`) est refaite — bords et vue à la taille de
l'écran, zones 4 à 21 (barre d'outils, réglages) décalées de `(W − 640) / 2` et descendues de
`H − 480`, icônes 22 à 28 poussées au bord droit — et l'abscisse de la barre des messages
(`[0xD6612]`) suit la barre d'outils ; la carte est redemandée. En sortir défait tout, table des
zones d'origine comprise ; revenu dans la vue du parc (réglage éteint, taille changée), la carte est
redemandée, barre d'outils comprise. Les bornes de souris que les appelants écrivent en dur (640,
480 : `0x1A27E` à chaque image) valent, en grande vue, l'écran entier.

*La page.* L'image partagée avec le travailleur a la taille maximale (2560x1600 ; la disposition
de la mémoire partagée est dans `moteur/web/memoire-partagee.js`). La page envoie la
taille voulue (entrée 11) à chaque changement de la zone d'affichage (fenêtre, plein écran) et le
réglage (entrée 10). Le cadre fixe du canevas (`affichage.fixerLeCadre`) a le format de la zone :
ni un écran plein en 640x480, ni le zoom ne changent sa taille. Hors zoom, la souris n'a rien
de nouveau : positions normalisées, converties avec les facteurs du moment (pilote huit fois plus
fin que l'écran) ; zoomée, voir « Le zoom et l'interface ».

*Le zoom à la molette* (demande D, puis retour 53). D'abord par crans : la largeur de la grande vue
était celle qui donne le format de la zone pour une hauteur parmi 480, 528, 576, 624, 672, 720, 816,
912, 1008, 1088, 1200, 1296, 1440 et 1600 (13 crans en 16/9, jusqu'à 2560x1440), plus quatre crans
agrandis par la page (« Le zoom avant ») ; un cran par 150 ms au plus, chacun d'un coup. Le zoom est
désormais continu (« Le zoom continu », plus bas) : la page montre le parc à un niveau quelconque et
demande au jeu la plus petite image qui le couvre, avec une marge. Dézoomer, c'est toujours dessiner
plus de cases ; le parc est montré au niveau du zoom, l'interface à taille fixe. La molette n'agit que
si le jeu montre la vue du parc elle-même en grande vue (le travailleur le publie en `entete[16]` ;
l'en-tête partagé a aujourd'hui 64 entiers) : ailleurs, écrans pleins, messages, grande vue éteinte,
elle ne fait rien. Vers soi on s'éloigne, vers l'avant on s'approche. Le niveau est gardé
(`themepark.zoom.niveau` ; à défaut, le cran d'avant, `themepark.zoom`, converti) et le bouton
l'affiche, avec la taille de l'image du jeu : « grande vue : oui (1408x800, zoom 100 %) ». Chaque
taille part par l'entrée 16 (comme l'entrée 11, mais ancrée), précédée de l'entrée 22, la place de la
nouvelle vue, et, si le pointeur est sur l'interface, de l'entrée 19, où sera le curseur. Le zoom
arrière s'arrête quand le jeu calcule déjà plus de 75 % du temps réel (mesuré par le travailleur).

*L'ancrage.* Au changement de taille ancré, `grande-vue.js` (`preparerLAncrage`), avant de
quitter l'ancienne taille, calcule la caméra qui garde sous le curseur la case qui y était. Le
curseur va où la page l'a dit (entrée 19), sinon il garde sa place dans l'image : de (sx, sy) il
passe à (sx·W1/W0, sy·H1/H0). La projection de
la carte place le coin haut gauche de la vue en X = C·L + R·⌊L/3⌋ − d(W), d(W) = B − ⌊(B −
origineDessinX)/L⌋·L, B le bord du dessin pour la largeur W (`bordDuDessin`), Y = R·H (voir
`vue-fluide.js`) : on veut X1 + sx1 = X0 + sx et Y1 + sy1 =
Y0 + sy, d'où la rangée R puis la colonne C, arrondies à la case (la caméra du jeu va par cases
entières : l'écart est d'une demi-case au plus, 12 pixels de large, 8 de haut) et bornées à la carte
(0 à 63 : près d'un bord, le point dérive, comme au défilement). La grande vue réappliquée, la
caméra est posée, la carte redemandée, et le pointeur du pilote et le curseur du jeu placés
ensemble par `0x11191` (fonction 4 du pilote). Pas d'ancrage dans un message par-dessus le parc,
ni pendant un cadrage imposé par le jeu (`0xBA0F8`). Le défilement fluide ne glisse pas au
changement de taille (la vue sautée est « loin ») : la mosaïque est reprise.
Avec l'entrée 22 (le zoom continu), la page donne elle-même la place de la nouvelle vue : son
décalage (dx, dy) par rapport à l'ancienne, en pixels du monde, compté depuis la caméra du moment de
l'ancrage (un pas de défilement entre la demande et l'ancrage est gardé). On veut X1 = X0 + dx et
Y1 = Y0 + dy, d'où R puis C, arrondis et bornés de même ; puis, avec la vue obtenue (Xa, Ya), le
curseur garde son pixel du monde exactement : sa place dans la nouvelle image est X0 + sx − Xa,
Y0 + sy − Ya (plus d'écart d'une demi-case sous le pointeur), à moins que l'entrée 19 ne la donne.

*La case sous le pointeur* (retour 19 de [demandes.md](demandes.md) : l'aperçu d'une allée ou
d'une attraction, et la case cliquée, tombaient à une demi-case de la case dessinée). Deux calculs
situent les cases à l'écran. Le dessin de la carte (`parcourirLaVue`) parcourt chaque rangée depuis
le bord droit, 640 écrit en dur, et pose la case de la colonne dc de la caméra en
x = d + 24·dc + 8·dr, d = 640 − ⌊(640 − origine)/24⌋·24. Tout ce qui vise une case — la case sous le
pointeur et l'aperçu de l'outil (`interface-parc.js`), le coin où le tracé colle le curseur
(`souris-jeu.js`), les outils simulés — la pose en origine + 24·dc + 8·dr, l'origine du dessin
`0xD6624` valant −36. D'où un écart de (640 + 36) mod 24 = 4 pixels dans le jeu de 1994 (le sol est
tracé 4 pixels à droite de l'aperçu : `dessin-carte.js`). La grande vue parcourait les rangées depuis
son propre bord, W, et l'écart devenait (W + 36) mod 24 : 4 pixels quand W est multiple de 24
(928), 12 à 1152, 1344 ou 864 — une demi-case —, 20 à 896. Le dessin part désormais du premier
bord, au bord de l'écran ou jusqu'à 16 pixels au-delà, qui garde l'écart d'origine : W + ((640 − W)
mod 24) (`bordDuDessin`, `grande-vue.js`), que suivent aussi la projection du défilement fluide
(`vue-fluide.js`) et l'ancrage du zoom. Une case qui commence au-delà du bord n'est pas tracée (le
traceur coupe à droite). Hors de la grande vue, 640 : rien ne change pour les vérificateurs.
*Preuves* : sous Node (trace-haute), l'image de sol de la case visée, décodée et cherchée dans le
tampon du fond, est à l'aperçu + 4 pixels à 640, 928, 1152 et 896 de large (avant : + 4, + 4, + 12,
+ 20) ; `essai-fluide-grande.mjs` à 1280x720 (bord déplacé de 8 pixels) : 1 331 compositions calées
sur 1 331 égales à l'image du jeu ; `essai-zoom.mjs` : le point visé reste à moins d'une demi-case
à chaque cran (hors caméra bornée) ; `verifier.mjs --empoisonner` IDENTIQUE sur `parc`,
`construction` et `trace-haute`.

*Le zoom et l'interface* (retours 7 à 10 de [demandes.md](demandes.md)). Jusque-là, un cran
changeait la taille réelle de l'image du jeu, que la page ramenait au cadre : dézoomer rapetissait
tout, l'interface (barre d'outils, icônes, date, barre de menus, catalogues, boîtes à question,
curseur) comme le parc. Désormais le parc est montré à l'échelle du zoom, p pixels de l'écran par
pixel du jeu (p = Wf / W au temps des crans, Wf la largeur du cadre ; aujourd'hui p = u·2^niveau,
« Le zoom continu »), et l'interface à celle de la grande vue de base, u = Hf / 720 (la grande vue
sans zoom ajustée à la fenêtre) : sa taille à l'écran ne dépend plus du zoom.

*Pourquoi la page, et pas le jeu.* L'autre voie, le jeu dessinant l'interface à une taille logique
fixe et la vue du parc dans une surface plus grande, sépare ce que le programme de 1994 fait dans une
seule surface : la carte, les objets, les marques de la case visée, le panneau (tracé dans le fond),
les icônes, les menus, les fenêtres et la boîte à question partagent la surface `[0xDE5BC]`, le fond
`[0xD3B98]`, la grille des blocs et le repère du curseur (`0xBECAC`), dont le jeu tire aussi bien la
zone de l'interface visée (`0xB93C3`) que la case du parc et le clic attribué pendant le dessin des
objets. Il faudrait deux repères et deux surfaces dans chacune de ces routines, et réduire le parc en
indices de couleur, au plus proche. La page, elle, dispose déjà de la vue du parc seule et de l'image
complète (le défilement fluide) : il lui manquait de savoir où est chaque morceau d'interface, ce que
le jeu sait exactement. Le jeu n'est pas changé : trois relevés en lecture seule.

*Ce que publie le jeu.* En grande vue, le relevé de `vue-fluide.js` a lieu même sans le défilement
fluide, aussi sous les messages qui s'affichent par-dessus le parc (0x4A, 0x54, 0x56, 0x64 : la
présentation en ligne de la boucle du parc, `amorcage.js`, publie alors l'image), et, pour la question
modale 0x78E36 qui ne redessine pas le parc, avec la dernière vue relevée. Avec l'image et la vue
seule : les régions de l'interface (`regionsDeLInterface`, `grande-vue.js`), des rectangles du jeu du
dessus au dessous, chacun avec son accroche — la boîte à question (CENTRE, si `auCentreDeLaGrandeVue`
l'a dessinée), les catalogues ouverts (FENETRE, leurs fiches en `0xD6BCE`, avec 4 pixels de marge pour
l'ombre), les menus déroulés (`0xB53C6`), les icônes du coin (HAUT_DROIT, zones 22 à 28), la barre de
menus, la rangée du haut ou la date (HAUT_GAUCHE), la barre des messages et le panneau (BAS) ; et le
curseur : son image (`[0xDE590]`, `[0xDE58C]` x `[0xDE58E]` au pas `[0xDE594]`, 0xFE transparent), sa
position, et les pixels qu'il recouvre dans l'image (`[0xDE564]`, sur le rectangle `[0xDE55C]` à
`[0xDE562]`, s'il y est resté : 0x7D775 sans 0x7D79E). Le tout passe par la mémoire partagée
(`memoire-partagee.js`, en-tête de 64 entiers, entiers `Z`), sous le verrou de séquence de l'image.

*Les étiquettes* (`moteur/web/zoom.js`). Le curseur rendu à l'image, chaque pixel du jeu appartient
au parc ou à la première région dont le rectangle le contient et où il diffère de la vue seule (sous
le haut du panneau, tout est interface ; un trou d'un pixel entre deux pixels d'une région en est).
Les régions sont accrochées au cadre : HAUT_GAUCHE au coin haut gauche, HAUT_DROIT au coin haut droit,
BAS le milieu de la barre d'outils au milieu du bas, CENTRE au centre ; un catalogue est accroché comme
le bas (il s'ouvre au-dessus de la barre d'outils) puis ramené dans le cadre s'il en sort : c'est la
règle des fenêtres qu'on déplace, qui les laisse suivre le pointeur pas pour pas. Le panneau et la
barre de menus sont « étendus » : zoomé en avant, plus étroits que le cadre, ils sont prolongés par
leur colonne du bord (le panneau a des côtés unis ; la barre s'arrête aux icônes). La hauteur demandée
au jeu fait aller le parc, à l'échelle p, jusqu'au haut du panneau, montré à l'échelle u
(`hauteurDuJeu` : H = ⌈((Hf − b·u) / p + b) / 16⌉·16, b les 44 lignes du panneau) : 1344 au lieu de
1440 au cran le plus large en 16/9, quelques lignes de plus qu'au cran au plus près.

*L'image* (`affichage.js`, la composition). Un nuanceur (après la première passe des couleurs du
parc : plus bas, « L'affichage ») : pour chaque pixel de l'écran, le
curseur (à l'échelle u), sinon la première région dont le pixel, par sa transformation inverse,
porte l'étiquette, sinon le parc. Le parc est lu dans une mosaïque du monde tenue dans la carte
graphique (4096 de côté, adressée modulo, comme celle du défilement fluide) : la vue seule de chaque
image y est recollée, si bien que sous l'interface (montrée ailleurs), c'est le parc qui paraît, et
qu'une glisse du défilement fluide n'est qu'un décalage lu dans la mosaïque, fractionnaire : plus
aucun envoi d'image à chaque rafraîchissement de l'écran, ni recomposition par le processeur. Ce que
l'image a de plus que la vue hors des régions (marques de la case visée, aperçu de l'outil) est
montré à sa place, comme par le défilement fluide. Agrandissement « pixels nets » des deux échelles
(le parc, dans le rendu choisi).
Au temps des crans, au cran de base (p et u à 3 % près), l'image du jeu était montrée telle quelle.
Avec le zoom continu, elle couvre le parc montré avec une marge et ne coïncide plus avec lui : en
grande vue, l'image est toujours composée, niveau 0 compris (les animations intercalées y sont
reposées).

*La souris.* La page tient le pointeur, en pixels du cadre : souris libre, là où est le pointeur ;
capturée, elle y ajoute les mouvements, bornés au cadre. Elle envoie au jeu des positions : le pixel
de la première région dont l'étiquette est sous le pointeur, sinon celui du parc ; les bords du cadre
sont ceux du jeu (le défilement au bord de l'écran). Un bouton tenu garde la transformation de ce
qu'il a saisi à l'appui (une fenêtre tirée qui prend du retard sur le pointeur ne passe pas au
parc) ; une interface qui bouge sous le pointeur (une fenêtre fermée) lui renvoie sa position. Quand
le jeu déplace lui-même son curseur (`0x11191` : le coin de la case au clic, la projection sur les
axes d'un tracé), le travailleur le compte et, souris capturée, la page y replace son pointeur ;
souris libre, le pointeur est la main et y reste, les mouvements allant de la main à la main
(recalé sur le curseur, il renvoyait au jeu à chaque image d'un tracé tout l'écart entre la main et
le curseur projeté : retour 70 de [demandes.md](demandes.md)). Le curseur est dessiné
là où le jeu a le sien, par la transformation de son pixel : c'est là que tombe un clic (le pilote
de l'hôte ne rejoint un pointeur qui saute que par quarts, `machine.js`).

*Le cadrage sur un objet* (retour 76 de [demandes.md](demandes.md)). Le jeu amène sa vue sur un
employé (icônes du personnel, bouton de sa fiche) ou sur l'objet d'une liste en le mettant, à peu près,
au milieu de SON écran (à droite et en bas du milieu dans le jeu de 1994 : l'obliquité des rangées et
le panneau oubliés ; au milieu avec `corrigerLeCadrageSurUnObjet`, section « Les réglages » plus haut).
La page n'en montre qu'une portion, gardée à sa place dans l'image quand la caméra saute peu : l'objet
tombait au bord du cadre, voire hors de lui, au zoom avant. Le jeu publie donc, avec la vue relevée
(`cadrageDeLaVue`, en même temps que la caméra : un cadrage fait pendant le traitement des entrées,
après le dessin de la vue, part avec la vue suivante), le compte de ses cadrages sur un objet, la case
et la position fine de l'objet (`noterLeCadrageSurUnObjet`, vue-fluide.js ; en-tête 41 à 43) ; à un
compte nouveau, la page place la portion pour que l'objet, en c·L + r·⌊L/3⌋ − x, r·H − y dans
l'image, soit au milieu du cadre au-dessus du panneau (`centrerSur`, zoom.js), bornée à la vue du jeu.
Rien n'est écrit dans la mémoire du jeu. Au zoom 100 %, la marge de l'image (128 pixels de large) ne
rattrape pas tout l'écart du jeu de 1994 (176 pixels à 800 lignes) : la correction du jeu fait le reste.

*La cadence* (retours 7 et 10). Le jeu tient-il le temps réel ? Le travailleur mesure désormais la
part du temps réel où il calcule (le reste, il attend l'heure) : le diagnostic l'affiche (« calcul
N % ») et le compteur de la page aussi (« jeu N % »), avec le travail de la page par image montrée
(« page N ms »). Sous Node (`travail/essai-zoom-cadence.mjs`, trace-haute, relevé pour la page
compris), le jeu publie toujours 30 images du parc par seconde de jeu, et calcule, par seconde de
jeu, au repos puis en défilement : 33 et 67 ms à 864x480, 62 et 127 ms à 1280x720, 127 et 259 ms à
1920x1088, 203 et 440 ms à 2560x1440 (défilement fluide éteint : les mêmes, à 5 % près). Dans le
navigateur intégré, le travailleur tient le temps réel à tous les crans (temps virtuel égal au temps
réel, avant comme après), et calcule 11 % du temps à 896x512, 16 % au cran de base (1344x736), 21 %
à 1696x912, 23 % à 2016x1072, 30 % à 2400x1264, 31 à 35 % à 2560x1344. Le jeu n'est donc pas plus lent
au loin tant que la machine lui laisse ce temps ; sur une machine chargée, c'est le travailleur qui
prend du retard (le temps virtuel ralentit, la partie aussi), d'autant plus tôt que le cran est large,
et le défilement double le calcul. Côté page, avant : pendant une glisse, l'image composée par le
processeur (0,5 ms à 1920x1104) et envoyée entière à la carte graphique à chaque rafraîchissement
(2 Mo), plus 2,4 ms par image reçue ; après, zoomé : rien à chaque rafraîchissement qu'un dessin (la
glisse est un décalage lu dans la mosaïque de la carte graphique), et 2 à 4 ms par image reçue à
2560x1344 (copies, étiquettes, envois). Le remède au ralentissement lui-même, redessiner la vue moins
souvent aux grands crans, changerait la partie (le dessin a des effets : section « défilement
fluide ») : écarté ; la molette refuse plutôt un cran de plus au-delà de 75 % de calcul.

*Jusqu'où dézoomer* (retour 8). Jusqu'à 2560x1600 (2560x1440 en 16/9) : le parc de 64 x 64 cases y
tient presque entier (le monde fait 2 700 x 1 100 pixels environ). La mémoire : deux tampons de
4 Mo hors du jeu, trois images de 4 Mo dans la mémoire partagée. La mosaïque du défilement fluide
ne borne pas la largeur : elle n'a à tenir qu'une vue et un pas de caméra autour. La cadence est la
vraie borne : chaque cran dessine plus de cases, et la molette refuse d'aller plus loin quand le jeu
calcule déjà plus de 75 % du temps réel.

*Le zoom avant* (retour 11 ; généralisé depuis à tous les niveaux par le zoom continu, plus bas :
ce qui suit décrit les crans agrandis d'alors). Le jeu ne peut pas dessiner moins que son plus petit cran (480
lignes : son interface est dans la même image). Au-delà, quatre crans agrandis, ×1,5, ×2, ×3 et
×4 (gardés sous les hauteurs 320, 240, 160 et 120, 18 crans en tout) : le jeu reste au premier cran
et la page agrandit la seule vue du parc, l'interface gardant sa taille (le bouton : « grande vue :
oui (832x496, ×2, cran 3/18) »). Rien n'est envoyé au jeu. Le parc montré n'est plus qu'une portion
de la vue du jeu, de coin s dans l'image du jeu : f = (q − s)·p, p = m·Wf / W (`zoom.js`, uniforme
`decalage` du nuanceur). *La portion* : à l'entrée d'un cran, s garde sous le pointeur le point du
parc qui y était (`agrandir`, comme le dézoom garde la case visée) ; elle est tenue dans le repère de
l'image, donc suit la caméra du jeu quand elle défile ; bornée à la vue du parc (jusqu'au haut du
panneau) ; remise au centre quand la caméra saute de plus d'un quart de vue (une fiche, la carte) ou
quand le cran vient d'un rechargement. *La souris* : dans le parc, q = f/p + s ; dans l'interface,
rien ne change ; un curseur du jeu hors de la portion (au bord de son écran) est dessiné au bord du
cadre. *Le bord* : les bords du cadre restent ceux de l'écran du jeu, qui défile quand le pointeur
de la page y est ; si la caméra ne bouge plus depuis 500 ms (butée au bord de la carte), la page
pousse la portion dans la vue du jeu, 600 pixels du cadre par seconde (`pousserAuBord`), jusqu'au
bord de la vue. Et comme le pilote de l'hôte ne reçoit que des mouvements (`machine.js`), un
pointeur immobile au bord ne rattrapait pas les quelques pixels qui séparent parfois le curseur du
jeu du bord de son écran (après un saut vers le bord : le curseur restait à 823 sur 832, la vue ne
défilait pas) ; tant que le curseur n'y est pas, la page le secoue d'un pixel à chaque image, et
chaque mouvement rattrape un quart de l'écart (aussi aux crans sans agrandissement). *Le défilement
fluide et l'affichage net* : la glisse est le même décalage lu dans la mosaïque, à l'échelle p, et
l'agrandissement « pixels nets » vaut pour tout p. La cadence ne change pas (le jeu dessine le
premier cran). *Ce qui reste praticable* : tout le parc de la vue du jeu l'est, loin du centre
compris (une fiche ouverte à ×2 en (626, 340) sur 832x496) ; la portion montrée ne couvre qu'un
quart (×2) à un seizième (×4) de ce que dessine le jeu, si bien qu'une fiche ou un événement qui
recadre la caméra sur un objet le montre au centre, et qu'un objet de la vue du jeu hors de la
portion (un visiteur, un message qui pointe) n'est pas visible sans défiler. Les attractions
s'ouvrent au double-clic, comme dans l'original (`0xDE5A0`).

*Preuves du zoom avant.* `verifier.mjs --empoisonner` IDENTIQUE sur `parc` (84 s, 766 relevés) et
`trace-haute` (70 s, 641 relevés), grande vue éteinte (seule la page change). Dans le navigateur
intégré (son coupé, parc sans tutoriel, 1280x800) : molette de 1568x896 à ×4 et retour à 992x592,
cran affiché ; ×1,5 puis ×2 ancrés sous le pointeur (s calculé = s attendu) ; à ×2, double-clic sur
RUBBER TUBING loin du centre de la vue du jeu, sa fiche ouverte puis refermée, portion gardée ; à ×3,
bord droit tenu : la caméra défile de la colonne 1 à 61, la portion la suit ; bord haut tenu, caméra
en butée (rangée 0) : la portion monte jusqu'au bord de la vue ; interface à taille fixe à tous les
crans. Réserve : le panneau du navigateur étant masqué, ses images n'étaient rafraîchies que par
les captures, la fluidité n'y a pas été jugée.

*Le zoom continu* (retour 53 de [demandes.md](demandes.md) : fluidifier le zoom, une réponse non
linéaire, plus souple). Les crans sautaient d'un coup, à pas inégaux (8 à 13 % en dézoom, 33 à 50 %
entre les crans agrandis), un par 150 ms quelle que fût l'allure de la molette. Désormais
(`moteur/web/zoom.js`) :

- *Le niveau.* L'échelle du parc est continue, p = u·2^niveau, le niveau en octaves depuis l'échelle
  de l'interface (0 : un pixel du parc pour un pixel de l'interface, « zoom 100 % » ; −1 : deux fois
  plus loin). Ses bornes (`bornesDuNiveau`) : la plus grande image, montrée entière (−1 en 16/9), et
  la plus petite, agrandie 4 fois (+2,57 en 16/9, comme l'ancien ×4).
- *La molette* (`Molette`). Un événement déplace un niveau visé. Un cran ordinaire (100 pixels ou 3
  lignes) vaut un quart d'octave (×1,19), à pas égaux en rapport du plus loin au plus près : la
  réponse n'est pas linéaire, le niveau est un logarithme de l'échelle. Et l'allure compte : la vitesse
  de la molette, en crans par seconde (mémoire de 120 ms, remise à zéro quand le sens change), agrandit
  le pas au-delà de 6 crans par seconde, comme (v / 6)^0,6, jusqu'à 2,5 fois (mesuré : 0,25 octave par
  cran isolé ou à 10 par seconde, 0,40 à 16, 0,61 à 30). Un pavé tactile donne des fractions de cran ;
  son pincement (Ctrl + molette dans Chrome, une échelle de e^(−deltaY / 100)) est pris à son échelle,
  0,5 octave au plus par événement. Un niveau visé qui revient à moins de 0,06 octave de 0 y est posé
  (`viser`, l'aimant) ; qui s'en éloigne, rien ne le retient. Les réglages sont dans `REPONSE`.
- *Le mouvement* (`avancer`, à chaque image de la page). Le niveau montré rejoint le niveau visé d'une
  approche exponentielle, de constante de temps 90 ms (95 % du chemin en 270 ms) : chaque cran part
  vite et finit en douceur, et des crans rapprochés se fondent en un seul mouvement. Le point du parc
  sous l'ancre y reste, à chaque image : le pointeur s'il est sur le parc, sinon le milieu du parc
  (`ancreDuZoom`, principal.js) ; un pointeur qui bouge pendant le zoom emporte l'ancre avec lui.
- *La taille du jeu* (`tailleDuNiveau` ; `suivreLeNiveau`, principal.js). La plus petite image qui
  couvre le parc montré, plus 128 pixels de large (`MARGE` : la caméra du jeu va par cases, et un cran
  de zoom arrière doit pouvoir partir aussitôt), multiple de 32, de la hauteur de `hauteurDuJeu` :
  1408x800 au niveau 0 en 16/9. Le parc montré est une portion de la vue du jeu, agrandie
  m = p·W / Wf ≥ 1 fois : le zoom avant d'avant, généralisé à tous les niveaux. Dès que le niveau visé
  sort de ce que couvre l'image, la page demande celle du niveau visé et de 0,3 octave plus loin (le
  cran suivant est déjà couvert) ; le zoom posé (700 ms sans molette, ni défilement, ni catalogue
  ouvert : accroché au bas du cadre par la barre d'outils, il bougerait), la plus petite, si elle est
  plus étroite de 96 pixels au moins. Une demande à la fois, oubliée après 1,5 s ; aucune pendant un
  tracé ou un glisser ; pas d'image plus grande au-delà de 75 % de calcul (le niveau visé est ramené à
  ce que couvre l'image).
- *La place de la nouvelle vue* (`decalagePour`, entrée 22). La page la donne au jeu, qui y pose sa
  caméra à la case près (« L'ancrage ») : autour de la portion visée, la marge partagée comme l'ancre
  partage le cadre (au moins une demi-case et un pixel de chaque côté) ; un zoom arrière autour de la
  même ancre élargit la portion d'autant de chaque côté, et toute la marge sert. À l'arrivée de
  l'image, la portion garde son coin dans le monde (`recevoir` : s = x0 + glisse0 + s0 − x1) : rien ne
  bouge à l'écran. Le curseur du jeu, gardé sur son pixel du monde, est sous le pointeur ; la page
  n'envoie alors qu'un recalage (entrée 20), sans mouvement : une position comptée depuis celle de
  l'ancienne image l'aurait déplacé. Pointeur sur l'interface, l'entrée 19 dit où sera le curseur : le
  même pixel de sa région, qui suit son bord (`pointDeLInterfaceApres` : les icônes suivent le bord
  droit, la barre d'outils le milieu du bas, la boîte à question le centre).
- *L'attente d'une image plus grande.* Le niveau montré va à pleine allure jusqu'à ce que couvre
  encore l'image courante, l'ancre tenue (`echelleLimite`) ; s'il allait le dépasser, il fait la moitié
  du chemin qui reste à chaque image, et repart dès que l'image arrive : rien n'est jamais montré hors
  de la vue du jeu. Et pendant le changement de taille, l'image présentée par le travailleur a déjà sa
  nouvelle taille quand le parc n'a pas encore publié la sienne : la composition garde l'image d'avant
  (300 ms au plus, `zoomTenu` dans `dessiner`) au lieu de montrer une image nue d'une autre taille.
- *Toujours composée.* L'image du jeu ne coïncide plus avec le parc montré : en grande vue, avec
  WebGL2, l'image est toujours composée. Sans WebGL2 (pas de composition), le niveau donne la taille de
  l'image du jeu, montrée entière, d'un coup : l'interface change alors de taille, comme au temps des
  crans.
- *La cadence.* Calcul du jeu mesuré dans la page (16/9) : 10 % à 928x496 (au plus près), 16 à 20 % de
  1440x752 à 1696x880, 35 % à 2560x1296 (au plus loin). Afficher une image composée coûte 1 à 2 ms à la
  page, changement de taille compris (textures renvoyées, cadre réajusté : mesuré à 1984x1008 et
  2560x1296).

*Preuves du zoom continu.* Sous Node, `travail/essai-zoom-continu.mjs` : la page (zoom.js, et la
logique de `suivreLeNiveau` recopiée) sous une molette simulée, à 60 images par seconde, face à un
faux jeu qui pose sa caméra à la case près et répond en une à deux de ses images (ou deux à quatre,
`LATENCE=2-4`). Sur neuf parcours (crans lents et lancés, au plus loin, au plus près, retour sur
l'aimant, ancre au coin du cadre) : le point du monde sous l'ancre ne bouge pas (1e−13 pixel, hors
portion bornée), la portion ne sort jamais de la vue, son coin est gardé à chaque changement de
taille, la taille redescend une fois le zoom posé (1408x800 au niveau 0, 864x512 au plus près) ; le
premier cran arrière depuis le repos suit, image pour image, la trajectoire sans attente.
`travail/essai-zoom-vue.mjs` (le vrai jeu, trace-haute, installation à part, huit changements de
taille par l'entrée 22) : la vue à 8 et 7 pixels au plus de la place voulue (la demi-case : 12 et 8),
sauf caméra bornée au bord de la carte, et le pixel du monde sous le curseur gardé exactement (avant :
jusqu'à une demi-case). `verifier.mjs --empoisonner` IDENTIQUE sur `parc` (84 s, 766 relevés) et
`trace-haute` (70 s, 641 relevés), grande vue éteinte. Dans le navigateur intégré (son coupé, parc de
démonstration sur l'installation d'essai, cadre de 1280x661) : un cran arrière, le point sous le
pointeur fixe (1670,99 ; 446,01) à travers deux changements de taille (1440x752 → 2048x1040, puis
1696x880 une fois posé), le curseur du jeu sous le pointeur ; huit crans avant lancés (de 0,25 à 0,52
octave par cran) jusqu'au plus près, l'image redescendue à 928x496 ; quatorze crans arrière jusqu'au
plus loin, 2560x1296 ; pointeur sur le panneau du bas, le curseur du jeu revient sur le même pixel de
la barre d'outils après le changement de taille ; aucune erreur ; les sauvegardes intactes. Réserve,
encore : le panneau du navigateur étant masqué, la page n'y dessine qu'à chaque capture ; la fluidité
est à juger à l'œil.

*Limites.* L'image composée est celle des indices, relevée à la présentation ; les animations intercalées y sont reposées (section « Les animations intercalées »,
« Dans tous les modes »). Une marque posée
sur le parc dans le rectangle d'une région (sous les icônes, dans l'aire de la boîte à question) est
montrée avec elle. Un catalogue plus grand que le cadre (agrandi à tout l'écran, dézoomé) en est
coupé. Le curseur suit le pilote de l'hôte, qui rejoint un pointeur qui saute en quelques mouvements.

*Preuves.* Grande vue éteinte, `verifier.mjs --empoisonner` IDENTIQUE sur `parc` (84 s) et
`trace-haute` (70 s). Sous Node, `travail/essai-zoom-icones.mjs` (les icônes et la date diffèrent
bien de la vue seule) et `travail/essai-zoom-cadence.mjs` (le calcul par seconde de jeu, au repos et
en défilement, par cran). Dans le navigateur (son coupé, parc sans tutoriel), à 896x512, 1056x592,
1696x912 et 2560x1344 : l'interface de même taille à tous les crans (barre d'outils, icônes, date,
bande du bas prolongée au zoom avant) ; clic droit sur le bouton des attractions de la barre
d'outils (catalogue ouvert au-dessus d'elle, à taille fixe), article choisi dans le catalogue
(l'outil pris), catalogue tiré par sa barre de titre (il suit le pointeur), fermé par son bouton ;
bouton de la carte du parc cliqué (écran plein), clic sur la carte (retour au parc composé) ;
Alt+Échap à 2560x1344 : « QUITTER ? » au centre, à taille fixe, NON cliqué, la partie continue ;
molette dans les deux sens, le point visé gardé.

*Le défilement fluide allégé.* Il a été allégé (masque
par mots, composition par plages, section précédente) : rejouée sous Node sur les images publiées
(`travail/essai-fluide-perf.mjs`, trace-haute, défilement aux quatre bords, 1 331 images), la
logique de la page passe à 1920x1104 de 7,8 à 2,4 ms par image reçue et de 7,2 à 0,5 ms par image
composée (1280x720 : 3,3 à 1,1 et 3,1 à 0,24 ; 864x480 : 1,5 à 0,6 et 1,4 à 0,13) ; les 6 738
compositions (la caméra, la glisse, des décalages) sont à l'octet près celles de l'ancienne
version (`travail/defilement-fluide-avant.mjs`), et calées sur la caméra, égales à l'image du jeu
(1 331 sur 1 331 ; en 320x200 et 640x480 aussi, `essai-fluide-grande.mjs` avec `GV=0`).

*Le défilement fluide* reste compatible : la vue relevée a la taille de l'écran, sa position suit
la même projection avec W au lieu de 640, la grille est celle de la grande vue. Rejouée sur les
images publiées pendant une partie (trace-haute, bords de l'écran), la logique de la page redonne
l'image du jeu à l'octet près, calée sur la caméra, dans les trois tailles traversées ; et encore
(1 331 images sur 1 331) avec quatre crans de zoom ancrés en chemin, 1920x1200, 864x480, 1600x912 et
1920x1088.

*Les dialogues au centre* (demande C). Recensement : ce que le jeu dessine par-dessus le parc en
coordonnées de 640x480, grande vue appliquée, c'est la boîte à question `0x78F89` (`dialogues.js`),
et elle seule : les écrans 0x4A (« démolir ? », `0x78B7E`), 0x54 (le bus, `0x78CEF`), 0x56 (un
message : le manque d'argent, la triche) et 0x64 (la faillite) l'appellent à chaque image depuis
la boucle du parc, la question modale `0x78E36` (Alt+Échap « QUITTER ? », RECOMMENCER et les autres
confirmations des menus) dans sa propre boucle. Les fenêtres de `0x35F21` mènent toutes à un écran
plein (640x480, montré par le cadre fixe), sauf 0x16 à 0x19, de l'écran titre et de la fin d'année
(relevé de la table `0xB762D`) ; la saisie d'un nom (`0x793B1`) ne sert que sur les fiches et
l'écran titre ; les menus, la barre des messages et les catalogues suivaient déjà la grande vue.

En grande vue, `0x78F89` passe par `auCentreDeLaGrandeVue` (`grande-vue.js`) : un échange de
pixels plutôt qu'un décalage du repère. Le coin haut gauche 640x480 de la surface est mis de côté,
le carré 640x480 du centre de l'image recopié à sa place, la boîte dessinée par-dessus en
coordonnées d'origine, puis ce carré repart au centre, le coin est rendu, et les blocs du centre
sont marqués (`0x54D38`) pour que la carte y restaure le fond à l'image suivante. Le curseur du jeu
(`0xBECAC`, `0xBECAE`), que la boîte lit pour ses boutons, est ramené dans le même repère le temps
du dessin, puis rendu (sauf si le gestionnaire de souris l'a reposé entre-temps). Pourquoi pas le
décalage du repère proposé par l'étude (surface, fond, grille décalés) : l'échange ne change ni la
surface, ni la grille, ni la fenêtre de découpe, et chaque routine que la boîte appelle (panneaux,
segments, textes, traceur) écrit là où elle écrivait déjà. Ces images sont présentées en entier (0xD6BCD pour les écrans par-dessus le parc, écran
plein pour `0x78E36`) : la grille n'a rien d'autre à suivre. Réglage éteint, ou vue de 640x480,
l'appel passe tel quel.

*Limites.* La boîte au centre recouvre le parc du centre, sans le parc du coin : un clic à l'ancienne
place de la boîte tombe sur le parc, comme un clic hors de la boîte dans l'original. La page ne
transmet pas l'état des touches mortes du BIOS (`0x417`) : Alt+Échap n'est pas jouable depuis la
page (les scénarios, eux, le posent). Les écrans pleins sont en 640x480 ; la neige et les éclairs semés en 640x480 le restent jusqu'au semis
suivant ; l'ancrage du zoom est à la case près.

*Preuves.* Réglage éteint, les vérificateurs rejouent le jeu d'origine (IDENTIQUE au rejeu empoisonné
sur `parc`, `trace-haute`, `construction`, `outils-haute` et `ecrans` ; après le zoom, sur `parc`
84 s et `trace-haute` 70 s). Le zoom : `travail/essai-zoom.mjs` (six crans ancrés, le point visé
reste à moins d'une demi-case, sauf caméra bornée au bord de la carte) et, dans le navigateur,
dézoom et zoom à la molette (curseur replacé à la même fraction de l'image, caméra décalée vers le
point visé), molette sans effet sur un écran plein. Réglage allumé, essayé sous
Node (`travail/essai-grande-vue.mjs`, `essai-bascule.mjs`, `essai-fluide-grande.mjs` : défilement aux
quatre bords, allumer, éteindre, changer de taille) et dans le navigateur : chemin tracé, attraction
posée au-delà de x = 640, fiche ouverte puis refermée, carte du parc, catalogue surgissant.
Les dialogues au centre : réglage éteint, `verifier.mjs --empoisonner` IDENTIQUE sur `parc` (84 s),
`trace-haute` (70 s) et `fin-annee` (340 s) ; allumé, `travail/essai-dialogues.mjs` (trace-haute,
à 1280x720, 1920x1200 et 640x480 : Alt+Échap « QUITTER ? » au centre, NON cliqué au centre, la
partie continue ; l'écran 0x56 au centre, OUI cliqué au centre, rien ne reste de la boîte) ; dans
le navigateur, à 1920x1088, le message de la triche (écran 0x56, drapeau levé par la fenêtre de
débogage, touche C) au centre, un clic à l'ancienne place sans effet, OUI puis NON cliqués au
centre.

---

## Les sprites HD, retirés

Un réglage (`reglages.spritesHd`, bouton « sprites HD » : non, x2, x4) a montré un temps chaque
sprite dans une version agrandie déposée par le joueur (`assets/sprites/hd/`), dans une image deux
ou quatre fois plus grande tenue à côté de celle du jeu : `moteur/jeu/sprites-hd.js` suivait chaque
pose du traceur dans un miroir de la surface et du fond, et la page montrait un bloc agrandi là où le
jeu avait encore la couleur du sprite. Le jeu n'en était pas changé.

Retiré le 26 septembre 2026, avec son export (`exporter-sprites.mjs`), ses routes du serveur et les
intermédiaires x4 des animations : il n'y avait aucune image agrandie à montrer (les seules déposées
étaient les sprites d'essai d'un agent, Scale2x et un liseré coloré : d'où les liserés jaunes et
mauves du retour 20 de [demandes.md](demandes.md)), et le suivi coûtait cher. Sur un grand parc (30 s
de jeu en 640x480, x2, sous Node), le jeu seul calculait 6 % du temps, avec les sprites HD 54 %
(37 000 poses suivies par seconde, 4,7 millions de blocs recopiés) ; dans le navigateur, au cran de
base de la grande vue, 100 % : le jeu ne tenait plus le temps réel, puis rattrapait son retard à
toute vitesse (le travailleur l'oublie désormais au-delà de 250 ms, `RETARD_MAX`). Le code est dans
l'historique (le commit 2e37094 est le dernier qui le contient) ; la voie, le jour où il y aura des
images, est dans [faisabilite.md](faisabilite.md). Elle a été prise autrement : section suivante.

---

## Le rendu HD : la liste d'affichage

Le réglage « rendu HD » de la page (non, ×2, ×3, ×4 ; éteint par défaut) montre l'image du jeu
recomposée k fois plus grande, chaque sprite qui a une image dans le pack HD (`assets/images/hd/`,
README, « Un pack HD ») posé en vraies couleurs, les autres agrandis au plus proche. **Le jeu n'en est
pas changé** : le code lisible prouvé n'est pas touché, le relevé ne fait que lire.

*Pourquoi une liste d'affichage.* Les sprites HD retirés (section précédente) devinaient, pixel par
pixel, quel sprite l'image montrait encore : cher, et faux dès qu'un objet en recouvrait un autre. Ici,
la page sait ce que le jeu a dessiné, et dans quel ordre : « le sprite 1012 de MSPR-0 en (x, y), coupé à
la fenêtre », « ce bloc recopié du fond vers la surface », « la surface présentée à l'écran »… et le
refait à ×k. L'ordre du jeu fait la profondeur : un visiteur tracé après un arbre reste devant. Ce
n'est pas un calque posé sur l'image de 1994.

*Des tampons, pas des images.* Le jeu ne dessine pas à l'écran : il construit ses images dans des
tampons qui durent (la surface `[0xDE5BC]`, le fond `[0xD3B98]` où la carte n'est tracée que sur
demande, le motif du curseur `[0xDE590]`, les pixels que le curseur recouvre), et ne présente que les
blocs de 32x16 qui ont changé (presentation.js). La liste est donc un flux d'opérations sur des
tampons numérotés, le tampon 0 étant l'écran ; la page tient une version à ×k de chacun, et montre la
sienne de l'écran. Le format est dans `moteur/web/liste-affichage-format.js` : `SPRITE` (le tampon, la
clé du sprite, x, y, les miroirs, la silhouette et sa couleur, le rectangle de découpe), `FILL`,
`COPY` (d'un tampon à l'autre, une couleur transparente pour le curseur), `PIXELS` (des pixels
quelconques et leur masque), `DEF` (un sprite : ses pixels de 1994, sa banque, son numéro, les lignes
sautées d'un sprite enfoncé, sa taille de référence), `BUFFER`, `PALETTE`, `IMAGE` (la fin d'une image),
et des repères sans dessin : `TEXTE` (la chaîne, la police), `ECHELLE` (un sprite étiré), `SOURCE` (des
pixels venus d'un fichier du jeu, un fond plein écran).

*Le relevé* (`moteur/web/liste-affichage.js`), comme les autres enveloppes de la page : chaque
routine de tracé est enveloppée à son adresse (`T.remplacer`) ; l'enveloppe lit les arguments et l'état
du tracé, note l'opération et appelle la routine telle quelle. L'inventaire des routines, et pourquoi :

| Routines | Ce qui est noté |
|---|---|
| le traceur : 0x5ED21 (en registres, pour 0x11AF4 le sprite enfoncé, 0x11BD5 la silhouette, 0x5ED0C), 0x5EC9C, 0x5ECD4, 0x55BD4 (une entrée de banque) | `SPRITE`, le tampon étant la surface du moment (le jeu la fait pointer sur le fond pendant la carte, sur le motif du curseur pour le décoder) ; la variante et la découpe décidées comme le traceur les décide, anomalies comprises (une silhouette ou un tracé du drapeau 0x80 qui dépasse la fenêtre n'est pas tracé) ; fusion, compression, agrandissement, jamais vus : par différence |
| rectangles 0x7F5BC, 0x81D88 ; pixels 0x80C00, 0x80C40 ; lignes pleines 0x81590 ; memset 0x7F1A0 | `FILL` (memset et 0x81590 seulement s'ils visent un tampon suivi ; une plage linéaire devient trois rectangles au plus) ; un rectangle fusionné (drapeau 4) par différence |
| memcpy 0x80958, lignes de 320 et de 640 (0x80E20, 0x81CB0), bandes de blocs 0x55C24 | `COPY` d'un tampon suivi à l'autre ; depuis la mémoire (une image lue), `PIXELS` avec sa `SOURCE` |
| présentation : 0x55DE6 (une bande), 0x80210 et 0x81CD4 (tout l'écran), 0x55507 (tout, en grande vue), 0x55FCF (l'écran effacé) | `COPY` de la surface vers l'écran, `FILL` de l'écran |
| 0x7D79E | la présentation entière faite en ligne (0x55507 en écran plein, `presenterToutLEcran` de la boucle du parc) : elle est reconnue à ce que l'écran est alors la surface même (0x78E36, la question, appelle aussi 0x7D79E sans rien présenter) ; puis le curseur retiré de la surface |
| le curseur : 0x7DDD7 (son motif décodé, par memset et le traceur), 0x7D2DD (posé dans la surface), 0x7D6C5 (retiré), 0x7CFC6 et 0x7D4F9 (tracé et effacé à l'écran par le gestionnaire de souris) | `COPY` vers et depuis deux tampons sans adresse (les pixels recouverts), `COPY` du motif, 0xFE transparent |
| 0x1B837 (la carte) | à sa fin, en 640x480, le panneau recopié du fond sur la surface (une copie en ligne) |
| 0x4DE1A, 0x4E359 | en grande vue, les bandes de part et d'autre de la barre d'outils, peintes en ligne dans le fond (`peindreLesBandesDuBas`, ecran-parc.js) : par différence, hors des boutons |
| la petite police 0x80E88, 0x80F34 ; segments 0x81374, 0x8148C ; lignes 0x949BC, 0x949DA ; sprite étiré 0x66DFA (et donc 0x67182, les miniatures) | écrits en ligne, pixel par pixel : relevés par différence (le rectangle qu'ils peuvent toucher, lu avant et après l'appel) en `PIXELS`, après un repère `TEXTE` ou `ECHELLE` |
| chargements 0x7F0B0, 0x1180E (toujours, même relevé éteint) | les fichiers et où ils sont en mémoire : une banque est un `.TAB` (6 octets par image) ; le sprite dont les données sont à l'adresse p est retrouvé par le mot long de son entrée (relogé par 0x10C80), ou, au milieu de ses données (le sprite enfoncé), par les lignes sautées ; un fichier lu droit dans un tampon suivi (un fond) devient `PIXELS` et `SOURCE` |

Un tampon qui change de taille (changement de mode : la même mémoire lue à un autre pas) est redonné
tel quel ; le relevé allumé, ou à la demande de la page (message 26), tous les tampons le sont
(« recalage »), et les sprites redéfinis à leur prochain usage.

*La preuve : un rendu de référence.* `moteur/web/liste-affichage-reference.js` rejoue le flux à ×1 avec
les sprites de 1994 : c'est la définition des opérations, que le rendu de la page suit à ×k. Le banc
`travail/hd/banc.mjs` joue un scénario sous Node (le moteur autonome), le relevé allumé, et toutes les
100 ms virtuelles (les relevés de verifier.mjs) compare pixel pour pixel l'écran rejoué à l'écran du jeu,
et chaque tampon rejoué (surface, fond, motif du curseur) au sien ; une différence est comptée, située
(le guet `--guet T --adresse A` nomme la fonction qui a écrit ce pixel), puis effacée. Résultat, relevés
identiques / relevés : titre 720/720, demo 1 180/1 180, parc 766/766, ecrans 924/924, construction
1 281/1 281, simulation 2 934/2 934, et encore trace-haute 641/641, outils-haute 2 841/2 841,
catalogues, fin-annee, gestion, menus, feux, tutoriel-haute : 100 %, écran et tampons ; trace-haute en
grande vue 1408x800 : 641/641 ; parc et demo relevés à chaque image (33 ms) : 2 482/2 482, 4 201/4 201.
Les fautes trouvées en chemin, chacune corrigée : les tampons redéfinis au changement de mode vidés
alors que la mémoire garde son contenu ; un fond chargé d'un fichier droit dans le fond (MMENU-0.DAT) ;
le sprite étiré de 0x66DFA ; 0x7D79E pris pour une présentation dans 0x78E36 ; les bandes de la grande
vue. Une routine qu'on laisse sans enveloppe (`--saboter 0x80F34`) fait tomber le parc à 81 % : le banc
voit bien ce qui manque.

*La vérification, pendant le jeu.* Les scénarios ne passent pas partout. Le travailleur tient donc,
rendu HD allumé, son propre rendu de référence, qui suit le flux, et toutes les 15 images compare chaque
tampon au jeu : ce qui diffère part à la page en pixels de 1994 (`PIXELS`, le rectangle des pixels
différents), qui y retombe donc sur l'image d'origine agrandie ; le bouton compte ces recalages. Sur les
onze parcours du banc, aucun ; la routine sabotée plus haut en donne 22, et l'image rejouée est de
nouveau juste à la vérification suivante.

*Le rendu* (`moteur/web/rendu-hd.js`, WebGL2, un canevas posé sur celui du jeu, qui garde la souris).
Chaque tampon a trois textures à ×k : l'indice (l'image de 1994), la couleur HD prémultipliée, et la
transmission T, la part de l'indice qu'on voit sous la couleur HD ; le pixel montré vaut couleur ×
modulation + T × palette[indice]. Un pixel de 1994 pose son indice, une couleur nulle et T = 1 : il suit
la palette du moment, fondus compris ; un pixel HD se mêle par-dessus (couleur ← c + couleur × (1 − a),
T ← T × (1 − a)). Tout passe par le mélange de la carte graphique (ONE, ONE_MINUS_SRC_ALPHA), chaque
sortie avec son propre alpha, sans relire le tampon qu'on dessine : sprites de 1994 et HD, rectangles et
pixels relevés vont dans le même appel, par instances (les sprites de 1994 dans un atlas indice-masque,
les pixels relevés dans un atlas de passage vidé à chaque lot, les images HD dans un atlas RGBA
prémultiplié, bordé d'un pixel transparent pour le filtrage). Une série de recopies d'un tampon vers
un autre est un second appel. La couleur HD ne connaît pas la palette : pendant un fondu ou un orage,
elle est modulée par le rapport de la palette du moment à la dernière palette pleine. Un sprite
retourné l'est aussi en HD ; une silhouette prend la forme de l'image HD et la couleur du jeu ; un
sprite étiré (`ECHELLE`) prend son image HD étirée ; un fond lu d'un fichier (`SOURCE`), celle du pack.
Le facteur est borné par la taille (12 millions de pixels par tampon : la grande vue la plus large passe
à ×2, puis ×1), le même pour tous les tampons.

*Qui fait quoi.*

| Où | Quoi |
|---|---|
| `moteur/web/liste-affichage-format.js` | le format, l'écriture et le parcours d'un flux, le décodage des sprites |
| `moteur/web/liste-affichage.js` | le relevé (les enveloppes), la vérification |
| `moteur/web/liste-affichage-reference.js` | le rendu de référence à ×1 |
| `moteur/web/rendu-hd.js` | le rendu de la page ; le pack HD (lu dans le paquet des données : servi, ou les compagnons en double-clic) |
| `moteur/web/moteur-du-jeu.js` | le relevé posé avec les enveloppes de la page (`installerRemplacements`), allumé par le message 25, recalé par le 26 ; à chaque image présentée, son lot envoyé avec elle (`{ listeHD }`, transféré) |
| `moteur/web/principal.js` | le bouton (gardé sous `themepark.renduhd`), les lots reçus, le rendu à la place de l'image composée ; `affichage.sansComposition` : ni zoom composé ni glisse du fluide |
| `moteur/web/affichage.js` | `composePossible` rend faux quand le rendu HD est allumé |
| `moteur/node/pack-hd.mjs` | poser des sprites dans le pack (au plus proche, pour les redessiner, ou Scale2x adouci pour un pack d'essai) |
| `travail/hd/` | le banc, la liste des sprites les plus tracés, les planches numérotées d'une banque |

*Dans la page.* Mesuré dans le navigateur intégré (son coupé, parc de démonstration sous DEMO, grande
vue 1184x720 à ×2, animations intercalées éteintes pour comparer) : l'image rendue, relue et comparée à
celle du jeu au centre de chaque pixel, est identique (0 pixel différent sur 1 018 368 à 1248x816, le
pack HD mis de côté), en Worker comme dans le fil de la page (`/local`), à l'écran titre, dans le parc,
et après avoir éteint puis rallumé le rendu en pleine partie ; 30 images par seconde, 0,27 à 0,44 ms de
page par image (carte graphique comprise, `gl.finish`), une dizaine d'appels et un millier d'opérations
par image ; le travailleur calcule 14 % du temps en défilant au clavier, 9 % rendu HD éteint : le relevé
et la vérification coûtent quelques points. La distribution porte le pack sans rien de plus
(`images/hd/`, et son compagnon `images/images.js` pour le double-clic) ; servie, elle charge les 198
images du pack d'essai et rend en HD.

*Limites.* Allumé, pas de zoom composé ni de glisse du défilement fluide (la page montre l'image du jeu
entière, comme sans WebGL2), ni les animations intercalées (le rendu montre les images du jeu). Le fond
redonné par un recalage (allumage, changement de mode) reste en pixels de 1994 jusqu'à ce que le jeu le
redessine (un défilement, une construction). Un pixel HD semi-transparent posé sur un pixel opaque du
même sprite de 1994 se mêle à ce pixel, pas à ce qui est dessous. Les lignes, la petite police, les
sprites étirés sans image HD et les pixels relevés par différence restent à ×1 agrandi. La modulation
des couleurs HD est globale : une palette qui change de teinte sans s'assombrir ne les change pas.
L'atlas HD tient 4096x4096 pixels (au-delà, un avertissement dans la console).

---

## Les réglages : les animations intercalées

Avec `reglages.animationsIntercalees` (bouton « animations » de la page : ×2 + traînée, allumé par
défaut, ou non), la page montre les attractions à tours deux fois plus vite dans leur boucle de
marche, par les dessins du jeu, passagers compris, avec derrière ce qui bouge une traînée
semi-transparente faite des images interpolées par RIFE (plus bas, « Deux fois plus vite, et une
traînée ») ; et de même, depuis le 28 septembre 2026, la fontaine, une installation (type 0x18) de
trois images que le jeu n'avance que tous les 16 pas, montrée quatre fois plus vite
([animations.md](animations.md), « La fontaine, de la même façon »). La glisse des morceaux (la BIG WHEEL seule) et les images de RIFE montrées nettes (façon
« images »), essayées d'abord, sont retirées le 27 septembre 2026 à la demande de Fabien (retour 36
de [demandes.md](demandes.md)) ; ce qui suit en garde l'histoire là où elle explique les images que la
traînée utilise. **Le jeu n'en est pas changé** : l'objet graphique
+0x0A, le délai, les boucles et leur compte, la place des passagers et l'image indexée restent ceux
de 1994 ; seule l'image que la page montre est retouchée. Le recensement des animations, le choix de
la roue et le résultat sont dans [animations.md](animations.md).

*Pourquoi pas plus d'images dans le jeu.* L'animation fait partie de la simulation : l'attraction
attend la fin de sa boucle pour partir et s'arrêter, le mécanicien répare par boucle, les passagers
des manèges qui tournent changent de place à chaque boucle ([faisabilite.md](faisabilite.md), A).
Ajouter des images aux boucles changerait la partie. Et dessiner deux fois changerait l'état
(section « défilement fluide » : le dessin a des effets). Le module fait donc comme le défilement
fluide : il relève en lecture seule ce que le jeu dessine et compose à part.

*Le temps.* Une attraction à tours avance d'une image tous les 2 × délai + 1 pas (9 au délai 4 :
3,3 images par seconde). Après le pas dessiné, son compte à rebours +0x14 vaut c, de 2 × délai à 0 :
la fraction écoulée de l'image courante G est f = (2 × délai − c) / (2 × délai + 1), et la suivante
est G' = mot +6 de G. Le travailleur présente deux images par pas (60 par seconde pour 30 pas) ; la
seconde avance encore d'un demi-pas, mesuré sur l'intervalle moyen entre deux présentations du jeu
et les pas qui les séparent (plus vite, un pas d'image en couvre plusieurs). Au repos (phase 0), et
à l'arrêt achevé, rien.

*La glisse, retirée.* Les morceaux de G et de G' étaient appariés au plus près, par le pied de leur
image (`apparier`, que garde le recensement), et chacun posé entre sa place dans G et celle de son
pareil dans G', avec l'image de G avant mi-chemin, celle de G' après : les bras de la roue sautaient
encore à mi-chemin, faute d'image intermédiaire. (Une façon « fondu », qui mêlait les deux côtés par
une trame de Bayer 4x4, a été retirée le 26 septembre 2026 : le grain était laid.)

*Qui fait quoi.*

| Où | Quoi |
|---|---|
| `moteur/jeu/dessin-attractions.js` | `0x69840` appelle `debutDAttraction` et `finDAttraction` autour du tracé ; `tracerLeMorceau` note chaque morceau tracé (morceau, image, position, passager) quand `observation.poses` n'est pas nul. Réglage éteint, deux appels qui rendent aussitôt la main et un test |
| `moteur/jeu/objets.js` | le tracé d'une installation (`dessinerToilettes`, type 0x18) appelle `debutDInstallation` et `finDInstallation` : la fontaine, relevée comme une attraction, sans passagers ([animations.md](animations.md), « La fontaine, de la même façon »). Réglage éteint, deux appels qui rendent aussitôt la main |
| `moteur/jeu/animations-intercalees.js` | pour une attraction retenue et en mouvement : l'emprise (les morceaux de G et toute sa boucle, plus une marge pour les passagers), la surface sous elle AVANT son tracé (en 640x480, un bloc que rien n'a encore touché à cette image est pris dans le tampon du fond, comme `vue-fluide.js`), les morceaux tracés, la surface APRÈS ; la publication à la présentation ; `appliquer`, la retouche de l'image (l'étape montrée, `phaseMontree`, et la traînée) ; un traceur à part, qui lit les lignes codées des images du jeu (tracé simple, miroirs, fusion) sans rien écrire |
| `moteur/jeu/presentation.js` | `publierLesAnimations` après chaque présentation, à côté du relevé du défilement fluide |
| `moteur/web/travailleur.js` | `appliquer` sur la copie de l'écran avant de la présenter (avec la palette du VGA, pour la traînée), et la publication des retouches pour la page (`entete[Z.RETOUCHES]`...), aussi pendant la publication d'une image du parc (`vueFluide.surImage`), avant elle ; message 18 : 0 non, 1 ×2 + traînée (qui charge `/animations/rendu.json`, une fois) |
| `moteur/web/retouches.js`, `memoire-partagee.js` | les retouches, côté page : lues sous leur verrou, reposées dans l'image que compose la glisse du défilement fluide, et dans les copies de l'image et de la vue que le zoom envoie à la carte graphique (`affichage.retoucherCompose` : les seuls rectangles touchés) ; les traînées (RGBA) et l'image présentée qu'elles retouchent |
| `moteur/web/affichage.js` | la traînée mêlée après la palette : `poserLesTrainees` (l'image du travailleur, la glisse), `poserLesTraineesCompose` (le zoom), dans les nuanceurs `teinteEn` et `teinteDuMonde` |
| `moteur/node/exporter-animations.mjs`, `interpoler-animations.mjs` (et `rife-interpoler.py`), `importer-animations.mjs`, `animations-fichiers.mjs` | les images cuites : export pour RIFE et Interprite (`assets/animations/origine/`, boucles entières et couches ; les attractions à tours et la fontaine, `sorte` 'installation'), interpolation par le RIFE de Flowframes, import de ce que rendent RIFE ou Interprite (`assets/animations/import/rendu.json`) |
| `moteur/node/serveur.mjs` | `GET /animations/rendu.json` |
| `moteur/web/principal.js`, `index.html` | le bouton « animations », gardé ; le compteur « anim N/s » |

*La retouche.* Pour chaque relevé : l'étape montrée est tracée sur le « avant » ; chaque pixel
de l'emprise en est pris si l'écran y a encore la couleur du « après » (rien n'a été dessiné
par-dessus l'attraction depuis : visiteurs devant elle, fumée, interface, pointeur), sinon l'écran
est gardé. Un relevé fait dans une autre largeur d'écran (le changement de mode) est ignoré.

*Limites.* Seules les attractions à tours dont `rendu.json` a les boucles. Un objet devant
l'attraction qui aurait, à un pixel, la couleur de l'attraction à cet endroit y laisse passer l'étape
montrée.

*Les images cuites* (façon « images », retirée : ces images ne font plus que la traînée ;
[animations.md](animations.md), « Les images cuites », et le
README, « Des images intermédiaires d'animation avec RIFE »). Au lieu de glisser les morceaux, la
page pose une image de l'attraction entière (ses morceaux sauf les places), cuite par
`exporter-animations.mjs` à chaque étape, interpolée par RIFE chez le joueur, ramenée par
`importer-animations.mjs` à la taille et aux couleurs du jeu (le fond magenta démêlé, les étapes
d'origine reconnues pour recaler les intermédiaires). Le travailleur charge `rendu.json`
(`definirLesImagesCuites`) ; un genre est retenu s'il y a des images, une image G si elle mène à G'
comme dans l'export et si ses morceaux sont ceux de l'export. L'emprise s'étend à l'image cuite ; à
l'instant t, l'intermédiaire le plus proche, round(t (n + 1)) borné à n (jamais l'étape suivante, que
le jeu montre au pas où elle vient ; monotone en t), est posé par son ancrage sur le « avant » ; la
retouche est celle de la glisse. Sans images, l'attraction n'est pas retouchée.
Quelques boucles sont écartées (`ECARTEES`) : d'une étape à l'autre, le mouvement y est trop grand
pour RIFE, qui fond les deux étapes au lieu de dessiner une pose entre elles (morceaux dédoublés,
traînées ; relu sur les planches de chaque boucle) : PLANE FLYER, PARASOL CHAIRS ; et SNAKES AND
LADDERS, où il n'y a rien à gagner. Elles restent telles qu'en 1994, sauf refaites avec Interprite
(une boucle d'Interprite n'est jamais écartée). La marche de la SPACE SHUTTLE, d'abord écartée, passe
maintenant par les poses que le jeu dessine pour son départ et son arrêt (plus bas, « Les poses à
mi-chemin »).

*Les passagers et les deux couches.* Le jeu trace les places de passagers au milieu des morceaux :
pour la BIG WHEEL, les six moitiés arrière des nacelles, les six passagers, puis la roue entière et
l'avant des nacelles, percé là où l'on voit les passagers. Poser l'image cuite entière puis les
passagers les mettait devant la roue, et les faisait clignoter (à l'étape d'origine, image du jeu,
ils étaient cachés ; aux intermédiaires, non). L'export cuit donc aussi chaque étape en deux couches
(`<boucle>-fond` : les morceaux tracés avant la première place ; `<boucle>-devant` : ceux tracés
après), que RIFE interpole chacune à part ; la page pose le fond interpolé, les passagers glissés
comme en façon « glisse » (dans l'ordre du jeu), puis le devant interpolé. Une boucle en deux couches
l'emporte sur la boucle entière ; la signature vérifiée est celle des deux couches mises bout à bout.
Sans couches (une boucle entière seule, déposée avant), chaque passager est glissé avec ce qui en était
visible à l'étape d'origine : un traceur d'identifiants rejoue les morceaux de G dans l'ordre et garde,
pour chaque pixel, la pose tracée en dernier ; seuls les pixels du passager qui y sont les siens sont
posés, décalés avec lui. À t = 0, la pose redonne alors l'image du jeu au pixel près, passagers
compris (326 relevés sur 328, les deux autres au changement de mode ; 175 avaient un écart avant).
Pourquoi pas ce masque seul : la structure devant tourne, alors que le masque glisse avec le passager ;
les deux couches suivent l'ordre du jeu à chaque intermédiaire.

*Un seul mouvement pour les couches, et des passagers qui le suivent.* Interpolées chacune à part,
les deux couches n'étaient pas déformées par le même mouvement (RIFE l'estime sur les images qu'on lui
donne) : entre les sièges (fond) et les bras (devant) de la BIG WHEEL, un écart de quelques pixels, et
des trous où l'on voyait le décor. `rife-interpoler.py` estime désormais le mouvement (flot optique et
masque de RIFE) sur la boucle entière et en déforme les deux couches (`--couche`), comme RIFE déforme
l'image entière : trous de la roue de 1,34 % à 0,56 % des pixels intérieurs, le reste là où un bras
découvre un instant ce qu'il cachait. Les passagers, eux, glissaient en ligne droite d'une place à
l'autre pendant que leur nacelle tournait : ils en sortaient, et la vitre de la nacelle montrait le
décor. L'export note les places de chaque étape (`places` de l'index) ; le même flot dit, à chaque
intermédiaire, où est passé le contenu de chaque place (le point X tel que X + flot(X) = la place),
écrit dans `places.json` à côté des images, repris par l'import (`deplacements` de `rendu.json`) :
la page y pose le passager, et la ligne droite ne sert plus que sans mesure (boucle rendue par
Flowframes). Le pilote (`interpoler-animations.mjs`) passe une boucle et ses couches en un seul
appel ; une boucle entière rendue par le joueur est gardée (sa sortie refaite va dans un dossier de
passage).

*Les passages entre boucles* (retour 28 de [demandes.md](demandes.md) : le PIRATE BOAT sautait à la
fin de son départ). Les intermédiaires vont de G vers l'image que G annonce (son mot +6). Mais au
départ, le jeu joue la boucle du repos jusqu'à son image marquée « dernière de la boucle » (octet +5
de l'objet graphique, bit 0), qu'il remplace par la première image de la marche ; en fin de tour, la
marche passe de même à la première image de l'arrêt (`attractions.js`, `tourner` et `finirLeTour`).
L'étape qui précède la marque annonce donc une image qui ne viendra pas : les intermédiaires
partaient vers la pose du repos, puis le bateau sautait dans celle de la marche. La page calcule
l'image qui vient vraiment (`imageQuiVient`) : la marque sur l'image annoncée, la phase, et le temps
du tour au pas où l'image changera (c + 1 pas plus tard). L'export écrit chacun de ces passages comme
une boucle de deux étapes (`passage-<boucle>-<figure>`, avec ses couches), interpolée par RIFE comme
les autres (`interpoler-animations.mjs --boucles passage`), rangée à part au chargement, par la paire
d'images qu'elle relie. Sans passage cuit, rien n'est intercalé à cette étape (plutôt que d'aller vers
la mauvaise image). Mesuré sur la partie de démonstration (120 s) : aux deux départs et aux deux fins
de tour du bateau, le passage est joué de t = 0 à t = 0,89, puis l'image du jeu arrive. Passages
exportés pour le PIRATE BOAT, la SPACE SHUTTLE, GHOST HOUSE, BOUNCY CASTLE et SUPER SPINNER.

*Les poses à mi-chemin* (retour 29 de [demandes.md](demandes.md) : le looping de la SPACE SHUTTLE).
La marche de la navette fait son tour en 8 étapes de 45° ; d'une étape à l'autre, RIFE fondait une
navette dans l'autre. Le corps de la navette a pourtant 16 dessins, un tous les 22,5° (sprites 1710 à
1725 ; ses bras de même) : la marche n'en montre qu'un sur deux, le départ et l'arrêt (le balancement)
montrent les autres. L'export (`POSES_A_MI_CHEMIN` d'`exporter-animations.mjs`) glisse chacun, pris
dans la boucle du repos ou de l'arrêt, entre les deux étapes de la marche qu'il sépare : 14 images
clés au lieu de 8, et `cles` dans l'index dit laquelle est quelle étape. RIFE va d'image clé en image
clé (141 images) ; l'import y prend l'étape au rang de son image clé fois le facteur (la couche du
fond, presque immobile, se reconnaissait de travers), et l'interpolation ramène les places mesurées
d'image clé en image clé aux étapes du jeu (`regrouper`) : 19 intermédiaires par étape au lieu de 9,
la page n'y voit que des passages plus longs. Deux dessins manquent en haut du looping (corps 1718 et
1720, bras 1736 et 1738, vides dans la banque : le balancement n'y monte jamais) ; entre les étapes 1
et 2, RIFE s'en passe ; entre les étapes 2 et 3, où le nez plonge vers le spectateur, il fond encore
une pose dans l'autre, le temps d'une image. Tourner un dessin voisin ne les remplace pas : l'ellipse
du looping se mesure bien (les 14 dessins y sont à 2 pixels près), mais le corps est dessiné avec les
bouts du pylône qu'il cache, et d'un dessin à l'autre la navette montre d'autres faces ; RIFE, à
quelque échelle de flot que ce soit, n'y trouve pas de passage non plus. Une place cachée dans une
pose (un trait de 3x1, les sprites 31 et 57, que le jeu pose n'importe où) mais visible à l'étape
d'avant tirait le passager de l'étape hors de la navette, contre le pylône : elle est prise près de sa
voisine visible, décalée comme aux étapes (`placesDesCles` d'`interpoler-animations.mjs`). Un fichier
`etapes.json` posé avec des images faites à la main (Interprite) impose le rang de chaque étape.

*Le scintillement.* Relevé image par image (`travail/sonde-temps-animations.mjs`) : le temps t et
l'intermédiaire montré sont monotones dans chaque étape (0, 1, 2... 8 à 30 images par seconde ; deux
par pas dans la page), sans retour à l'étape d'origine. Le grain venait des images : ce qui ne bouge
pas d'une étape à la suivante (le pied de la roue), RIFE ne le rend pas au pixel près ; ramenés aux
couleurs du jeu, 107 à 233 pixels immobiles changeaient de couleur à chaque intermédiaire, puis
revenaient à l'étape d'origine au pas suivant, 3 fois par seconde. Un pixel de même couleur aux deux
bouts d'un segment garde donc cette couleur dans tous les intermédiaires du segment. D'abord, la
règle valait aussi pour un pixel transparent aux deux bouts ; or un bras qui tourne de plus que sa
largeur passe entre les deux sur des pixels vides aux deux étapes, et la règle l'y effaçait : 2 % des
pixels des couches de la BIG WHEEL, 9 % du fond de PARASOL CHAIRS, autant de trous où l'on voyait le
décor entre les sièges et les bras (retour 24 de [demandes.md](demandes.md)). Elle ne touche plus les
pixels transparents, où RIFE ne pose presque rien quand rien ne passe (moins de 0,05 % des pixels des
attractions qui bougent peu). Les segments vont d'image clé en image clé : d'abord appliquée d'une
étape à la suivante, par la page au chargement, la règle figeait dans le looping de la navette ce que
la pose à mi-chemin montre autrement (le pylône passait par-dessus le bras, 13 000 pixels du fond aux
étapes 4 et 5 ; des bouts de carrosserie restaient collés sur place : retour 33). Elle est appliquée
à l'import (`figerCeQuiNeBougePas`, qui connaît les images clés) ; la page pose les images telles
quelles. Hors navette, les 48 autres boucles sont restées identiques au pixel près.

*Voir les images.* `node moteur/node/voir-animations.mjs [--attractions ...]` écrit, pour chaque
boucle importée, les images que la page pose (le fond puis le devant, sans les passagers), une par
fichier à la taille du jeu, et la boucle en PNG animé agrandi (`assets/animations/import/images/`).

*Les trous entre les couches.* Mesurés sur l'attraction composée sans passagers (un pixel
transparent dans les deux couches, entouré de pixels opaques), comparés aux vides voulus des étapes
d'origine (111 par image pour la roue, entre ses bras) : avec la règle d'avant, 153 par
intermédiaire pour la roue (42 trous de trop), 41 à 58 pour les trois boucles du PIRATE BOAT (7 à 10
de trop) ; la règle corrigée en laisse 4 de trop à la roue, 1 à 3 au bateau. Le reste venait du
démêlage : là où le devant borde ce qu'il cache du fond, RIFE mêle chaque couche au magenta, et deux
parts sous ½ (0,4 de devant, 0,4 de fond) donnaient deux pixels transparents là où l'attraction
entière est pleine. L'import démêle donc les deux couches d'une boucle ensemble
(`seuillerLesDeuxCouches`) : un tel pixel va à la couche qui y pèse le plus (788 pixels rendus pour
la roue, 1 277 pour le bateau). Après les deux : 110,7 vides par intermédiaire pour la roue (111,3
aux étapes), 33,5, 49,9 et 39,3 pour le bateau (33,6, 48,3 et 38,7 aux étapes).

*Dans tous les modes.* Le travailleur retouche l'image qu'il présente ; mais la page ne la montre
pas toujours. Pendant une glisse du défilement fluide, elle compose la sienne depuis sa mosaïque ; en
grande vue zoomée (et au zoom avant), la carte graphique compose le parc depuis la sienne ; ces
mosaïques reçoivent les vues seules publiées par le jeu, sans intermédiaire : l'intermédiaire n'y
paraissait pas. Le travailleur publie donc aussi, à chaque image présentée, ses retouches (pour chaque
attraction : le rectangle, la pose, le « après », et la publication du parc qu'elles retouchent,
sous un verrou de séquence : `memoire-partagee.js`, `Z.RETOUCHES`), et la page (`retouches.js`) les
repose avec la même règle : dans l'image que compose la glisse, décalées de la position montrée à la
caméra ; dans les copies de l'image et de la vue du zoom, les retouches précédentes défaites, et seuls
les rectangles touchés renvoyés à la carte graphique (dans la mosaïque, à leur place dans le monde).

*Le tremblement.* Relevé dans la page, image par image, sur la BIG WHEEL d'un grand parc (grande vue
et fluide allumés ; la distance de chaque image montrée aux six étapes d'origine) : l'attraction
atteignait l'étape suivante, continuait vers la suivante encore, puis revenait d'un coup à l'image
d'origine de l'étape, une fois par étape. Les retouches d'une image n'étaient publiées qu'à l'image
montrée suivante du travailleur (60 par seconde virtuelle), après l'image du parc : la page qui lisait
entre les deux composait l'image du jeu nue. Désormais la présentation publie les relevés des
animations avant l'image (`presentation.js`), et le travailleur, pendant la publication de l'image
(`vueFluide.surImage`), calcule ses retouches à cet instant et les publie avant elle ; la page les
relit dès qu'une image arrive, et garde les retouches des deux dernières images (`Retouches.pour`),
pour que celles de l'image suivante, lues un instant trop tôt, n'effacent pas celles de l'image
montrée. Même relevé ensuite : les étapes se suivent dans l'ordre, sans retour à l'image d'origine.

*À 60 images par seconde.* Le jeu présente 30 images par seconde : son temps virtuel saute d'une
image à la suivante, puis le travailleur attend que le temps réel le rattrape. Réglage allumé, au
milieu de cette attente, le travailleur présente l'image une fois de plus (`presenter`, `decalage`) :
l'écran du jeu est le même, les intermédiaires y sont posés un demi-pas plus loin ; la page reçoit 60
images retouchées par seconde (mesuré : « anim 59/s », calcul du jeu inchangé, 10 %). La partie n'en
voit rien. Pour qu'elles soient toutes différentes, une attraction lente (délai 4 : une étape tous
les 9 pas du jeu, 300 ms) veut deux fois plus d'intermédiaires : RIFE x20 (19 par étape) pour la
BIG WHEEL et les attractions jugées bonnes (BOUNCY CASTLE, FLIGHT SIM, GHOST HOUSE, HAUNTED HOUSE,
OBSERVATION TOWER, SUPER SPINNER), x10 pour les autres. `rendu.json` ne garde plus la boucle
entière d'une attraction importée en deux couches, que la page ne prend pas (66 Mo au lieu de 81).

*Deux fois plus vite, et une traînée* (façon « ×2 + traînée », retenue par Fabien le 27 septembre
2026 ; le pourquoi, la méthode et les preuves dans [animations.md](animations.md)). Aucune image
inventée n'est montrée nette : l'image montrée est une étape de la boucle, un dessin du jeu, tracé
comme le jeu le tracerait (`tracerLEtape`), passagers compris ; pour les places qui tournent, le relevé
garde l'anneau des passagers à bord (leur chaîne, la capacité), rejoué en lecture seule pour le nombre
de tours que la montrée a faits (`passagersTournants`). La table `cuites` range toutes les boucles de
`rendu.json` et chaque étape. L'étape montrée (`phaseMontree`) : dans la boucle de la marche, deux
fois plus vite que le jeu, par segments qui partent de l'image du jeu (une attraction qui entre dans
la vue en pleine boucle, un départ qui ne commence pas à l'étape 0) et finissent avec la montrée
revenue à l'étape 0 quand le jeu quitte ou recommence la boucle, ou, à l'arrêt, sur la dernière
image quand le jeu l'atteint ; les boucles que le jeu ne joue qu'une fois (la montée en balancement du
départ du bateau et de la navette, leur ralenti à l'arrêt) suivent le jeu, image pour image. Derrière ce qui
bouge, une traînée : la moyenne pondérée des images de RIFE des deux étapes précédentes, en couleurs
pleines (RGBA), calculée par le travailleur à la première étape montrée et gardée par étape et par
palette. Elle ne passe pas par l'image indexée : le travailleur la publie à part, avec ses
retouches (`memoire-partagee.js` : un drapeau par retouche, `octetsTrainees`, 4 Mo, et
`Z.RETOUCHES_PRESENTEE`, l'image présentée qu'elles retouchent), et la carte graphique la mêle
après la palette, seulement là où le travailleur l'a posée (le décor et le pied de l'attraction, pas
la pièce qui bouge, les passagers ni ce qui est devant). Trois chemins, comme les retouches : l'image
du travailleur (la traînée de l'image présentée qu'on montre, `Retouches.dePresentee`, une texture de
la taille de l'image, unité 2) ; la glisse du défilement fluide (celle de la publication du parc,
décalée de la caméra) ; le zoom de la grande vue (une texture à la taille du monde composé, unité 7,
lue par `teinteDuMonde` au point du monde). Seuls les rectangles qui changent sont renvoyés à la carte
graphique (ceux de l'image précédente remis à zéro). Le rendu « lissé » (Scale2x) compare les indices
avant de mêler la traînée ; le rendu « pixels nets » la mêle à chacun des pixels qu'il interpole.
Sans WebGL2, `Affichage2D` la mêle sur le processeur ; le zoom n'y existe pas.

*Le compteur.* La ligne de cadence de la page affiche « anim N/s » quand le réglage est allumé : les
images intermédiaires réellement montrées par seconde, une par image retouchée neuve, qu'elle vienne
du travailleur (`entete[Z.ANIM_PIXELS]`, les pixels changés de l'image présentée), de la glisse ou du zoom (par chemin, `animParChemin` dans la console). Le bouton dit
« (aucune image importée) » si `rendu.json` manque.

*Preuves.* Réglage éteint, `verifier.mjs --empoisonner` IDENTIQUE sur `parc` (84 s) et
`construction` (150 s). Réglage allumé, `travail/essai-animations.mjs` joue une partie éteinte puis
allumée, l'image retouchée comme par le travailleur 60 fois par seconde virtuelle : même mémoire du
jeu toutes les 100 ms, toute la mémoire chaque seconde et même heure, sur la vue de la roue en
320x200 (glisse) et en 640x480 (le fondu, retiré depuis), 60 s chacune ; la pose à t = 0 du traceur
à part redonne l'image du jeu au pixel près (1 228 relevés). Dans le navigateur, son coupé, la roue en
640x480, glisse puis fondu, sans erreur.
Images cuites (`essai-animations.mjs --cuites`, avec des images d'essai, un fondu enchaîné, avant
celles de RIFE) : ÉTAT IDENTIQUE sur `roue-haute` et `roue-basse` (60 s) ; l'étape
cuite redonne l'image du jeu hors des passagers au pixel près (sauf les deux relevés du changement
de mode) ; dans le navigateur, quatre attractions chargées, sans erreur.
Les modes, les couches, le scintillement (les quinze attractions à tours interpolées par RIFE 4.0, x10,
en deux couches pour sept d'entre elles, par `interpoler-animations.mjs`) : réglage éteint,
`verifier.mjs --empoisonner` IDENTIQUE sur `parc` (84 s, 766 relevés) et `construction` (150 s,
1 281 relevés) ; allumé, `essai-animations.mjs --cuites` ÉTAT IDENTIQUE sur `roue-haute` (60 s,
548 relevés), la BIG WHEEL à t = 0 égale à l'image du jeu passagers compris (hors les deux relevés du
changement de mode) ; `travail/sonde-attractions-cuites.mjs` le mesure par attraction (le PIRATE BOAT
garde une dizaine de pixels d'écart par image : des morceaux tracés entre deux places, que le
découpage en deux couches met devant les passagers suivants). Dans le navigateur intégré (son coupé, parc
DEMO, la roue à l'écran ; le rafraîchissement du panneau caché remplacé par une minuterie de 16 ms
pour compter), « anim » non nul dans chaque mode : 640x480 fluide allumé au repos (27/s, l'image du
travailleur), en glisse (allers-retours au clavier : 56 images composées retouchées), grande vue 1824x896 dézoomée et ×4 (26/s par le zoom), où la capture montre la roue entre deux
étapes, les passagers dans leurs nacelles.

---

## L'affichage : deux passes, six rendus

`moteur/web/affichage.js`, par WebGL2 (un canevas 2D, en rendu brut, sans lui). La carte graphique
reçoit les indices de couleur tels quels, la palette à part, et la traînée des animations (RGBA).

*Deux passes.* D'abord les couleurs, à la taille de l'image, dans une texture
(`NUANCEUR_COULEURS`) : la palette, la traînée mêlée par-dessus, et Scale2x pour le rendu « lissé »
(l'image doublée), avec une marge d'un texel tout autour. Puis l'agrandissement, pixel de l'écran par
pixel de l'écran (`NUANCEUR_PIXELS`), qui ne lit plus que cette texture. En une seule passe, chaque
pixel de l'écran refaisait la palette et la traînée de ses quatre voisins, et Scale2x de chacun : 28
lectures de texture par pixel en lissé, 8 millions de pixels en 4K. La marge garde les bords
identiques à l'ancienne passe unique, qui lisait le pixel −1 au bord.

*Six rendus* (bouton « rendu », gardé d'une visite à l'autre) : « pixels nets » (sharp bilinear :
chaque pixel reste un rectangle franc, le liseré entre deux pixels adouci sur un pixel de l'écran),
« lissé » (Scale2x, puis net), « lissé anticrénelé » (Scale2x, puis xBR sur l'image doublée : plus rond
que le lissé, sans ses marches de deux pixels), « anticrénelé » (xBR, plus bas), « xBRZ » (plus bas),
« brut » (le plus proche voisin, en facteur entier quand l'image tient). Les deux du milieu sont venus
à la demande de Fabien, « un peu plus net sans voir les pixels » (retour 51 de demandes.md).

*L'anticrénelé : xBR, niveau 2* (l'algorithme de Hyllian). Pour chacun des quatre coins d'un pixel,
une règle décide, d'après les écarts de luminance de son voisinage 5x5, si un bord oblique passe par
ce coin (à 45°, et à 30° ou 60°) ; le coin prend alors la couleur du voisin d'en face, fondue sur la
largeur d'un pixel de l'écran. Un coin carré n'est arrondi que si la diagonale se prolonge (la
variante « CORNER_B ») : les rectangles et les lettres gardent leurs angles. En deux temps, comme les
xBR à plusieurs passes : les règles ne dépendent que du voisinage, et sont calculées une fois par pixel
de l'image (`NUANCEUR_BORDS` : cinq bits par coin, une texture RGBA8UI) ; pour chaque pixel de
l'écran ne restent que les règles de E et cinq couleurs (rien d'autre quand aucun bord ne passe). En
une seule passe, xBR coûtait 2,3 ms par image à 2 millions de pixels ; en deux, 0,8. À un facteur
fractionnaire, un pixel de l'écran à cheval sur la frontière de deux pixels de l'image est évalué de
part et d'autre, chaque part pour sa surface : sans quoi, comme en rendu brut, les pixels de l'image
auraient à l'écran des largeurs inégales (4 ou 5 pixels à 4,5 fois).

*xBRZ* (Zenju, le successeur de xBR), à toute échelle, en deux temps aussi. Les règles
(`NUANCEUR_BORDS_XBRZ`) : chaque bloc 2 × 2 de l'image, dans son voisinage 4 × 4, compare les écarts
de couleur (YCbCr) le long de ses deux diagonales, et donne aux deux pixels de la diagonale la moins
marquée un type de fondu à leur coin intérieur (normal, ou dominant au-delà de 3,6 fois) ; chaque pixel
reçoit ainsi ses quatre coins, un par composante. Le fondu (`GLSL_XBRZ`), pour chaque point de
l'écran : chaque coin marqué du pixel E prend la couleur du plus proche de ses voisins F et H, derrière
une droite qui coupe le coin (fondu d'angle), ou, si le voisinage forme une ligne, une droite à 45°,
douce (1:2) ou raide (2:1) selon les écarts F–G et H–C (2,2 fois) ; deux couleurs à moins de 30/255
sont égales. Ces droites sont celles de xBRZ à l'échelle 2 (un quart ou trois quarts de pixel
recouverts pour la ligne douce), fondues sur la largeur d'un pixel de l'écran ; les quatre coins sont
un seul coin, retourné (les règles sont symétriques). À un facteur fractionnaire, le pixel de l'écran
est coupé comme pour xBR. Comparé dans la page (le titre à ×8, le parc à ×4) : les lettres et les
arbres ronds, les bords des allées lisses, l'herbe et les petits dessins intacts, sans couleur
inventée. Durée d'une image sur la carte graphique (canevas 2176x1279 ; le parc en 640x480, puis le
titre en 320x200) : pixels nets 0,24 et 0,06 ms, lissé 0,28 et 0,07, lissé anticrénelé 1,53 et 0,22,
anticrénelé 1,36 et 0,20, xBRZ 0,71 et 0,35, brut 0,04 et 0,06 — xBRZ moins cher que xBR sur le parc :
un pixel sans coin marqué n'y lit que ses règles et sa couleur.

*La composition du zoom* (grande vue zoomée, plus haut) a aussi sa première passe (`NUANCEUR_MONDE`) :
les couleurs de la portion du monde que le parc montre (la mosaïque, la palette, la traînée ; trois
pixels de plus tout autour, que lisent l'agrandissement et xBR), puis ses règles de xBR s'il le faut.
Le parc y prend le rendu choisi ; « lissé » y est désormais Scale2x (il valait « pixels nets »).
L'interface (les régions) reste en pixels nets : les textes restent francs.

*Preuves.* Un banc d'essai hors dépôt (`travail/transcrit/comparer-affichage.js`) rend l'état
courant de la page avec les anciens nuanceurs, en une passe, puis avec les nouveaux, et compare les
pixels du canevas. Écran titre (320x200, canevas 1741x1143) : aucun pixel différent en brut, pixels
nets et lissé. Dans le parc DEMO en grande vue, traînées des animations ×2 allumées : brut, aucun ;
pixels nets et lissé, 238 et 222 pixels sur deux millions, d'une unité (la traînée, arrondie à
8 bits par la première passe) ; en composition (cran 7/18), brut aucun, pixels nets 1 802 pixels
d'une unité. Durée d'une image sur la carte graphique (RTX 3080, 2 millions de pixels ; ancien →
nouveau) : écran titre, pixels nets 0,23 → 0,17 ms, lissé 0,46 → 0,23 ms, brut 0,15 → 0,16 ms,
anticrénelé 0,82 ms ; parc (1088x720), tous sous 0,1 ms, anticrénelé 0,24 ms ; composition, autour
de 0,2 ms, anticrénelé 0,33 à 0,38 ms. Son coupé, parc DEMO arrêté avant décembre, sauvegardes
vérifiées identiques. La palette n'est renvoyée à la carte graphique que si elle a changé.
`affichageDeLaPage` (comme `zoomDeLaPage`) donne l'affichage à la console, pour les essais.

---

## La fenêtre de débogage

Un panneau de la page (bouton « débogage », touche ²) qui montre l'état du jeu lu dans sa mémoire,
et quelques commandes hors du jeu d'origine. Le jeu n'en est pas changé tant qu'on ne commande rien.
Son premier onglet, « Réglages », est à la page seule : les réglages de la page (plus haut, « Comment
lancer ») ; le travailleur n'envoie rien pendant qu'il est ouvert (type 13, onglet 0).

| Où | Quoi |
|---|---|
| `moteur/jeu/etat.js` | les variables nommées : adresses globales (`ADRESSES`) et champs des fiches du joueur, du parc et des comptes (`FICHE_DU_JOUEUR`, `FICHE_DU_PARC`, `COMPTES`), chacune avec son renvoi à la rétro-ingénierie |
| `moteur/jeu/debogage.js` | partagé par la page et le travailleur : la description des onglets (nom, adresse, renvoi, lecture), les tables, la fiche d'un objet, les commandes ; `debogage`, l'état côté travailleur |
| `moteur/web/debogage.js`, `debogage.css` | le panneau : onglets, valeurs mises à jour sur place, tables, fiche, boutons des commandes |
| `moteur/web/travailleur.js` | deux types de plus dans la file des entrées, et un test par passage des observateurs |
| `moteur/web/principal.js`, `index.html` | l'installation du panneau, le bouton, la feuille de style |

*L'échange.* Le travailleur ne lit plus aucun message une fois le jeu lancé : la page lui parle par
la file des entrées en mémoire partagée. Le type 13 (onglet, objet) ouvre le panneau sur un onglet
(0 : fermé) et choisit l'objet de la fiche (0 : l'objet désigné, `0xD6678`) ; le type 14 (commande,
argument) porte une commande. Dans l'autre sens, le travailleur poste `{ debogage }` : un instantané
de l'onglet ouvert seulement, toutes les 250 ms de temps réel, ou le compte rendu d'une commande. Les
valeurs partent déjà écrites en texte ; la page ne garde que les noms et les bulles, qu'elle prend
dans le même module.

*Les accidents* (retour 47 de demandes.md). Le travailleur enveloppe deux fonctions du jeu, panneau
ouvert ou non : `0x6662D`, l'explosion d'une attraction, et `0x66189`, le visiteur projeté (ses
arguments : le cas, le visiteur, l'objet d'où il part — l'attraction, son wagon ou le visiteur lui-même
sur un circuit, dont le mot +0x16 donne l'attraction). Les enveloppes ne font que noter, hors de la
mémoire du jeu, dans le journal de `debogage.js` (`accidents`) : la cause (1 l'éjection d'un wagon,
0x65D25 ; 3 le circuit, 0x65E3D ; 5 la voiture folle, 0x258D9 ; l'explosion, avec les visiteurs
qu'elle projette), l'usure du moment, l'heure. L'onglet Objets en montre les 60 derniers, et, par
attraction, leur nombre, l'usure qu'ajoutera le prochain départ (7 − délai + durée / 256 + départs /
6, le dernier terme croissant avec l'âge : le compte des départs n'est jamais remis à zéro), les
départs avant l'explosion et les risques à l'usure du moment.

*L'état du parc* (retour 68 de demandes.md). L'onglet montre ce que la fin d'année évaluera,
calculé comme `0x76FA3` et `0x74378` (fin-annee.js) le feraient maintenant : les cinq trophées
(la sécurité, la popularité, la technologie, la mise en place, l'ambiance), leur note, la mention et
son calcul ; les six classements (le plus riche, le plus grand, le plus amusant, les installations,
le plus agréable, la satisfaction), la valeur et le rang ; les 25 grandeurs de la fiche du parc qui
les font (`GRANDEURS` de `moteur/jeu/debogage.js`) ; et le journal de ce qui les a changées. Pour
savoir *qui* écrit, le guet enveloppe, panneau ouvert, **toutes** les fonctions du jeu
(`T.remplacer`) : l'enveloppe tient une pile des fonctions en cours et compare les 25 grandeurs à
leurs dernières valeurs à l'entrée et à la sortie de chaque appel ; ce qui a changé entre deux
comparaisons l'a été par la fonction du dessus de la pile — l'appelante à l'entrée d'une appelée,
l'appelée à sa sortie —, donc par celle qui a écrit. La cause est la plus proche, dans la pile, d'une
liste de fonctions qui expliquent (`EXPLICATIONS` : la recherche du mois, le relevé du mois, une
embauche, une attraction construite, un visiteur au guichet, la fin d'année, le chargement…). Les
noms viennent de `moteur/jeu/debogage-noms.js`, que seul `moteur-du-jeu.js` importe : la page n'a
pas à charger le moteur. Dans le moteur réentrant, une fonction qui rend un itérateur est parcourue
par un générateur, et comparée à sa fin ; `T.fonction` y est lu par un accès calculé, sans quoi
`reentrer.mjs` ferait parcourir l'appel d'une traite (`executerSansPause`) et le moteur ne rendrait
plus la main à la page. Le panneau fermé, les enveloppes sont retirées ; à la réouverture, ce qui a
changé entre-temps est noté sans auteur. Coût, panneau ouvert, sous Node : environ +50 % du temps
de calcul du jeu (3 millions d'appels en 150 s de construction.json) ; fermé, aucun. La partie n'en
est pas changée : fin-annee.json, panneau basculé toutes les 16 384 passes, même empreinte de la
mémoire en fin de partie avec et sans, moteur ordinaire et réentrant.

*La cadence.* Panneau fermé, le travailleur ne fait qu'un test de `debogage.onglet` par passage des
observateurs. Ouvert, un instantané parcourt au plus la table des objets (1 198 emplacements dans la
démonstration) ; vérifié dans le navigateur, sur l'onglet le plus lourd (Objets) : le temps virtuel
suit le temps réel à 1,000 panneau ouvert, comme fermé.

*Les commandes* n'écrivent que des variables, au passage suivant des observateurs (toutes les
millisecondes virtuelles, entre deux tranches d'exécution du jeu) : le solde (fiche du joueur
+0x0A) ; la vitesse `0xD6634` et les coches du menu `0xD775A` à `0xD775D`, comme les commandes 10 à
13 de `menus.js` ; la météo `0xB14CC` avec son début `0xB14CD` — pour la faire cesser, l'intempérie
est vieillie de 1 001 pas, et le jeu la finit lui-même au tirage suivant, palette reposée ; les
points de recherche des domaines ouverts (parc +0x120), que la recherche du mois dépense ; l'usure
des attractions (+0x2E) ; le contentement des visiteurs entrés (+0x54) ; le drapeau tricheur
`0xD6682`. Elles sont refusées à l'écran titre. Aucune n'appelle une fonction du jeu.

*Limites.* Les valeurs « non établies » de la documentation le sont aussi ici (la réputation `+0x21`,
le sens exact de `+0x75` du visiteur) ; les champs dont la taille n'est pas établie sont lus à la
taille que leur donnent les modules réécrits. Un instantané est lu pendant que le jeu tourne : deux
valeurs d'une même vue peuvent appartenir à deux pas voisins. La touche ² n'arrive plus au jeu
(`0x29`, qu'il n'emploie pas à notre connaissance). Les commandes font diverger la partie : les
vérificateurs ne les connaissent pas, et une sauvegarde garde leurs effets.

---

## Le son

Le jeu passe par la bibliothèque HMI SOS, liée dans `MAIN.EXE` et donc transcrite. **La musique est
jouée par le code d'origine** : le séquenceur de SOS lit les morceaux au rythme de la minuterie, et
son pilote FM, lui aussi dans `MAIN.EXE`, écrit les registres de la puce par les ports 0x388 et
0x389, instruments de `INST.BNK` et `DRUM.BNK` compris. L'hôte fournit la puce, `opl.js` :
opérateurs, enveloppes, oscillateurs basse fréquence, percussions, minuteries. Elle dérive de
Nuked OPL3 (Nuke.YKT), dont elle suit le générateur d'enveloppe, la génération de la phase et
l'avance des horloges, et reste sous la licence de celui-ci, la LGPL 2.1 ou ultérieure (voir la
section Licences du README).

**Les bruitages passent par du code qui n'est pas dans `MAIN.EXE`** : SOS charge depuis
`HMIDRV.386` un pilote matériel (la Sound Blaster, son DMA) et un module de mélange, qu'il appelle
par leur adresse. L'hôte les remplace (`Son.appel`) : il répond aux fonctions du pilote à la place
de la carte, et tient le rôle du module de mélange, dont la routine de remplissage est appelée par
la minuterie de SOS jusqu'à 240 fois par seconde. Les échantillons en cours vivent dans 32
descripteurs que les fonctions de SOS, transcrites, remplissent et lisent : l'hôte les mélange et
les tient à jour, fin de lecture et boucles comprises. Le jeu voit donc une carte qui se comporte
comme l'originale, et le reste de sa logique sonore est le code de 1994. Les fichiers eux-mêmes
(`HMIDRV.386`, `HMIDET.386`) ne sont plus que des fichiers virtuels, refaits par l'hôte de leurs
en-têtes (`moteur/hote/pilotes-hmi.js`, `assets/donnees/pilotes-hmi.json`) : SOS y trouve ses modules
aux mêmes places et aux mêmes tailles, le code à zéro, hormis l'identifiant (+5) et, pour la détection
de la Sound Blaster 16, les octets que l'hôte relit (+0x83 à +0x133).

Ce code de 1994 est désormais réécrit, lui aussi : la couche de Bullfrog, les films des attractions
et leur script sonore, et HMI SOS — minuterie, séquenceur, pilote FM, échantillons, chargement des
modules — dans quatre modules de `moteur/jeu/` (`son-du-jeu.js`, `sos-pilotes.js`,
`sos-bruitages.js`, `sos-musique.js`). SOS joue sa musique pendant l'interruption de la minuterie,
sur une pile privée qui est une variable du programme : une réécriture qui tourne là doit y laisser
ce qu'y laissait l'original, et appeler les services de l'hôte à la même hauteur de pile
(rétro-ingénierie, § 9.7). Le gestionnaire de l'interruption et le chaînage au BIOS, qui ne
reviennent pas comme des fonctions, sont réécrits à part, instruction par instruction
(`moteur/jeu/demarrage.js`), et prouvés par le rejeu du moteur autonome.

Le jeu choisit sa carte par les variables `BF_SOUND` et `BF_MUSIC`, que l'hôte déclare (Sound
Blaster 16 et sa puce FM), et l'option `-o`, qui lui évite de chercher la carte en sondant le
matériel. Le détail des adresses est dans la [rétro-ingénierie](retro-ingenierie.md), section 9.

**Le son est produit en temps virtuel.** Chaque écriture dans la puce est datée : pendant une
interruption de la minuterie, de l'heure nominale de son tic, car l'hôte livre d'un coup les tics
échus pendant une image, et la musique, jouée par ces tics, doit garder son rythme. La puce est
rendue jusqu'à cette date avant l'écriture. Les bruitages, eux, ne sont mélangés qu'aux tics de
remplissage, comme le faisait le module d'origine. Le son d'une partie ne dépend donc que de la
partie : deux exécutions, ou deux façons de le recueillir, donnent le même son à l'octet près. Et
il ne change rien à la partie elle-même : le rejeu comparé passe avec et sans son
(`verifier.mjs --son`).

**Deux façons de rendre le son** (`son.js`), qui ne changent rien à la partie. **Sous Node** (les
vérificateurs, `lancer.mjs --son`, l'extraction des films et des musiques), l'hôte **rend** : la
puce, les bruitages mélangés, en échantillons, que le lanceur écrit dans un fichier WAV. **Dans la
page**, il ne rend rien : il dit en **événements** ce que le jeu demande (`Son.evenements`), et le
navigateur joue des fichiers. Le code du jeu, SOS compris, tourne de même : le séquenceur lit ses
HMP et écrit dans la puce (qui en garde les registres, sans jamais produire un échantillon), et les
descripteurs d'échantillon avancent au rythme de l'original, sans que rien soit lu ni mélangé. Les
blocs de mélange ont la même taille dans les deux cas (les compteurs du temps rendu avancent de même,
écriture de la puce comprise) : la partie est la même à l'octet près. Preuves : le scénario `son`
joué en événements et en rendu (mêmes empreintes de la mémoire sur ses 1 351 relevés), et le rendu
avant et après cette réécriture de `son.js` (le même son, échantillon pour échantillon, avec et sans
répit).

Les événements, datés en temps virtuel, par paquets (à chaque image, à chaque tic de remplissage) :

- **bruitages**, lus dans les descripteurs à chaque remplissage : un départ (le drapeau 0x2000 du
  premier passage) donne `jouer` avec la banque chargée (lue dans le descripteur de ressource du
  `.dat`, `[0xBEE78]` : SNDS0-2), le nom et la place du son dans la table (`[0xD7B60]`, l'entrée
  dont les données commencent à l'adresse du descripteur ; les NULL vides, qui la partagent, cèdent
  au son qui a des octets), le volume (0x7FFF = 1) et la boucle (0x4000) ; un changement de volume
  (la montée des ambiances, 0x803E0, et leur descente, 0x81770) donne `volume` ; un arrêt par le jeu
  (0x8000 retiré par `sosDIGIStopSample`), ou la fin des tours d'un son bouclé, donne `arreter`. Un
  son non bouclé qui finit n'a pas d'événement : le fichier joue jusqu'à sa propre fin. Le répit
  (plus bas) tait un départ : pas d'événement ;
- **la musique**, lue dans la couche de Bullfrog à chaque image et à chaque tic
  (`COUCHE_DE_BULLFROG`) : le morceau en cours (`[0xBA71A]`, s'il est permis : `[0xBA714]`,
  `[0xBA715]`), s'il joue encore pour SOS (`[0xBFF4E + 4 × poignée]`, `sosMIDISongDone`), le volume
  général (`[0xC2AC5]`, 0 à 127 : `[` et `]`), le tempo (`[0xBA718]`, en pour cent : 0x80E40 accélère
  la musique des attractions). Un morceau lancé donne `jouer` (sa banque, `[0xBEDF4]`, et son nom),
  relancé par le jeu quand il a fini (0x801A0 : la musique du parc boucle ainsi) `jouer` avec
  `reprise`, fini `fini`, arrêté (ou la musique éteinte par l'option du jeu, la touche S) `arreter`.
  Le jeu ne fait pas de fondu de musique : le volume général est tout ce qu'il règle. Le désaccord
  des attractions usées (des messages de hauteur, 0xE1 à 0xE3, par 0x87202) n'est pas rendu.

Le moteur (`moteur-du-jeu.js`) y joint le fichier à jouer (`moteur/web/fichiers-des-sons.js`) :
`sons/bruitages/BANQUE/NOM.wav` et `sons/musiques/FM/NOM.mp3` (la version FM de la banque, quelle que
soit la carte), ou ce que le manifeste `sons/index.json` met à leur place, et les envoie à la page
(message `son` du travailleur, ou appel direct dans le fil de la page). La page
(`moteur/web/audio.js`) les joue à leur heure, avec une avance de 60 ms (l'écart entre deux
événements est gardé ; l'ancre est reprise si le jeu dérive de plus de 250 ms) :

- les **bruitages**, servie, par **Web Audio** : chaque fichier lu une fois (`fetch`,
  `decodeAudioData` : wav, mp3, ogg…), chaque départ une source qui part à son heure (`start`), à son
  volume (× 0,6, l'équilibre du rendu), bouclée si le jeu la boucle, jusqu'à son arrêt (un fondu de
  5 ms). En **`file://`**, la page ne peut rien lire d'un fichier voisin, et un élément audio branché
  sur Web Audio n'y rend que du silence : chaque départ est un élément `<audio>` (une réserve par
  fichier), à son volume. Ce que `file://` perd : l'heure exacte des départs (un élément part quand il
  peut), le panoramique et le fondu d'arrêt. `?force=elements` impose les éléments, servie ;
- la **musique**, partout par un élément `<audio>` : le mp3 lu en continu, le tempo par
  `playbackRate` sans changer la hauteur (`preservesPitch`), le volume du jeu fois le niveau
  d'origine du morceau (`musiques.mjs` ramène tous les mp3 à −1 dB ; la puce jouait HRTBEAT 18 dB
  plus bas que RIDE4 : `niveaux` de l'inventaire, la crête d'origine). Relancé, le morceau repart du
  début et la fin de l'ancien s'éteint en 1,5 s (le mp3 porte la fin des notes) ; arrêté, il
  s'éteint en 0,25 s.

Le navigateur n'autorise le son qu'après un geste : au premier clic ou à la première touche ; d'ici
là, les bruitages sont perdus, et le morceau en cours part à l'activation. Le bouton « son » de
l'onglet Réglages coupe tout ; les films mp4 le coupent le temps de leur lecture.

**Les banques sans échantillons.** Le jeu ne lit jamais les échantillons de ses bruitages : seul le
module de mélange le faisait. Seule compte, pour lui, leur taille. La page refait donc les banques
(`composerLesFichiers`, `bruitagesMuets`) de silences de la taille d'origine, notée dans l'inventaire
(`tailles`), sans lire un seul WAV : le démarrage y gagne 14 Mo, et la distribution ouverte d'un
double-clic n'a plus à les porter dans `sons/sons.js`, qui ne garde que les HMP, les timbres et le
manifeste (0,1 Mo). Un son remplacé garde ainsi, pour le jeu, la durée de l'original.

**Remplacer un son** (`fichiers-des-sons.js`, `assets/sons/LISEZMOI.txt`) : écraser le fichier (même
nom, même format), rien d'autre ; ou poser à côté de l'original un fichier du même nom dans un autre
format (`CASH.ogg` près de `CASH.wav`), que `refaire.cmd` inscrit au manifeste `sons/index.json`
(`{ bruitages: { "SNDS0-2/CASH": "bruitages/SNDS0-2/CASH.ogg" }, musiques: { "RIDE4": … } }`, les
chemins relatifs à `sons/` ; une musique aussi par son numéro ; les lignes écrites à la main sont
gardées tant que le fichier existe). Le serveur local le fait à la demande d'après `assets/sons/`.
L'ancien dossier des sons de remplacement (`sons/remplacements/bruitages/NOM.ext`) y est encore
inscrit, sous le nom seul. Sous Node, `Son.remplacer` mêle toujours au rendu des fichiers décodés
(`lancer.mjs --remplacements dossier`) : un bruitage remplacé avance dans son descripteur au rythme
de l'original, une musique remplacée prend le niveau de la puce.

**Le répit des bruitages** (`Son.repit`, `REPITS_DES_BRUITAGES` dans `son.js`), pour les bruitages
que le jeu relance sans cesse (retour 64 de [demandes.md](demandes.md)). Le « huuum » écœuré
(HURRAY, 0x26, malgré son nom) est joué par `0x80FE0` au premier pas de chaque visiteur à l'écran
sur une case souillée de vomi, et relancé dès qu'il finit ; le vomi (SICK, 0xD) est joué par
`0x80C80` pour tout visiteur qui vomit, même hors de l'écran, par-dessus un autre en cours. Le départ
d'un de ces bruitages moins de 10 s (HURRAY) ou 5 s (SICK) après le dernier départ entendu du même
est joué muet : comme un bruitage remplacé, il avance dans son descripteur au rythme de l'original,
et `0x80FE0` le trouve en cours tant qu'il l'aurait été. Le temps est celui du son rendu, et un
bruitage joué en boucle n'est jamais tu. La partie n'en est pas changée (même mémoire du jeu, octet
pour octet, avec et sans répit) ; la page l'allume toujours, le lanceur Node sur `--repit`.

---

## Trois adresses de chargement

L'éditeur de liens avait placé le petit objet 2 (0x110 octets de variables) à `0xA0000`, c'est-à-dire
là où le jeu écrit en absolu dans la mémoire vidéo. Sous DOS/4GW, les objets n'étaient jamais chargés
à cette adresse. On déplace donc l'objet 2 à `0xE3000` ; le code reste à `0x10000` et les données à
`0xB0000`, adresses de Ghidra, ce qui garde la correspondance avec le désassemblage.

---

## Comment lancer

**Sans écran, pour les essais et les captures :**

```bash
node moteur/node/lancer.mjs --duree 30 --captures 1 --script moteur/scenarios/demo.json
```

Les captures PNG vont dans `travail/captures/`. Avec `--autonome`, c'est le moteur autonome qui joue,
comme dans la page ; sans, la transcription seule. Un script d'entrées est une liste d'événements
datés en secondes virtuelles : `{ "t": 6, "souris": [320, 100, 1] }`, `{ "t": 8, "touche": 33,
"ascii": 70 }`. Avec `--son fichier.wav`, le jeu a sa carte son et ce qu'elle joue est écrit dans le
fichier. Un scénario peut aussi être un objet `{ ligneCommande, fichiers, evenements }` : les
options du jeu et des fichiers à déposer dans l'installation neuve, lus par `lireScenario`
(`moteur/node/partie.mjs`) pour tous les outils de vérification (`lancer.mjs` n'en joue que les
événements).

**Dans le navigateur :**

```bash
node moteur/node/serveur.mjs
```

puis <http://localhost:8123/>. Le jeu tourne dans un *Web Worker* : il boucle sans jamais rendre la
main, comme sous DOS, et bloquerait la page. L'image et les entrées passent par de la mémoire
partagée, ce qui impose de servir la page avec l'isolation d'origine — c'est le rôle du petit
serveur, qui sert aussi les assets du jeu (`assets/`, qu'il extrait au premier lancement du CD
déroulé dans `jeu/` s'ils manquent), en lecture seule : les sauvegardes restent dans le
navigateur (IndexedDB, `moteur/web/donnees.js`), chaque adresse (port compris) ayant les siennes.
Les boutons « parties : exporter » et « parties : importer » (onglet « Réglages » du débogage) les mettent dans un
fichier, `sauvegardes-themepark.json` (le chemin vu par le jeu, les octets en base 64), et les en
reprennent : l'import remplace les fichiers de même nom, garde les autres, et relance la page. La
page joue d'abord le film d'introduction (une touche ou un clic le passe), puis le jeu. Le son
démarre au premier clic ou à la première touche : les navigateurs l'interdisent avant. Pour le film,
`films.js` essaie donc le son d'abord ; si le navigateur refuse (`NotAllowedError`, pas de geste
encore), il montre l'invite « Cliquer pour commencer » sur l'image et lance le film au clic ou à la
touche, avec le son, sans que ce geste le passe. Son de la page coupé : pas d'invite, le film part muet.

*La page* (`index.html`, `local.html`, `principal.js`). Tout est allumé d'office, sans que le joueur
ait rien à faire : le son (au premier geste), le 640x480, le défilement adouci et fluide, la grande
vue, la souris capturée au clic, les corrections, les animations intercalées, les sons
remplacés ; `moteur-du-jeu.js` part des mêmes valeurs, que la page lui envoie de toute façon au
lancement (messages 6, 8, 9, 10, 15, 18). L'écran ne montre que l'image et un bandeau en haut : plein
écran, rendu, langue, débogage ; `#etat`, dans ce bandeau, n'affiche que ce que le joueur doit voir
(une erreur, la fin du programme). Les autres boutons, la ligne d'état et la cadence sont dans
`#reglages-de-la-page`, que `debogage.js` montre dans l'onglet « Réglages » de la fenêtre de débogage
(dont « original bug fix » : éteint, les corrections le sont toutes, le jeu de 1994 tel quel). Un
choix fait là est gardé sous `themepark.reglages.<nom>` (`oui`, `non`) ; les clés d'avant
(`themepark.son`, `.640x480`, `.grandevue`, `.corrections`…), écrites quand la grande vue et les
corrections étaient éteintes par défaut, ne sont plus lues. Le rendu, la langue et le niveau du zoom
gardent leurs clés.

**Sans serveur Node : la distribution.**

```bash
node moteur/node/extraire-jeu.mjs chemin/vers/THEMECD.ISO   # s'il faut repartir du CD
node moteur/node/extraire-films.mjs
node moteur/node/construire-distribution.mjs
```

Les deux premiers écrivent les assets (`assets/`, en vérifiant que les fichiers du CD se refont à
l'identique depuis eux) et convertissent les films en mp4 (avec ffmpeg). Le troisième vide `site/`
et y écrit la distribution : un dossier qu'on sert (ses lanceurs, « Theme Park.cmd » et
`lanceur/serveur.ps1` sous Windows, `theme-park.sh` ailleurs, ou n'importe quel serveur HTTP), ou
qu'on ouvre d'un double-clic (`file://`), hors ligne, jusque sur Chrome 49 et Firefox 52 ; et dont on
peut modifier les assets, qui y sont des fichiers ordinaires.

```
theme-park.html       la page (index.html sans le service worker, la feuille de style incluse)
moteur/               theme-park.js (la page et le moteur réentrant en un script), theme-park-es2015.js
images/ sons/ films/  les assets, tels que dans assets/ ; animations/rendu.json ;
donnees/              index.json, programme/, textes/, parties/, et tables/ (assets/donnees/)
*/NOM.js              les compagnons : images/images.js, sons/sons.js, donnees/donnees.js,
                      animations/animations.js
refaire.cmd, lanceur/refaire.ps1, Theme Park.cmd, theme-park.sh, lanceur/serveur.ps1, LISEZMOI.txt
```

`moteur/hote/distribution.js` est le seul endroit qui dit où va chaque chemin de l'inventaire
(`cheminDansLaDistribution`) : l'inventaire garde les chemins de `assets/`, et la page les traduit.
`construire-distribution.mjs` y copie le contenu de `assets/` (hors du CD, `assets/jeu/`, et de
l'atelier des animations), sans rien supposer de la forme de chaque dossier : c'est l'inventaire que
lit la page qui la dit. Le moteur est celui du fil de la page (plus bas) : `construire-distribution.mjs`
refait le moteur réentrant (`moteur/node/reentrer.mjs`), réunit la page et lui en un script classique
(`moteur/node/assembler.mjs`, qui y substitue le moteur réentrant à `moteur/jeu` et `moteur/hote`, et
`environnement-distribution.js` à `environnement.js`) et le ramène à l'ES2015 (`moteur/node/abaisser.mjs`).
La page porte un petit chargeur qui prend le script des sources si le navigateur en lit la syntaxe,
sinon l'abaissé (l'abaissement coûte cher par endroits : `{ ...R }` récrit en `Object.assign`, douze
fois plus lent dans le Chrome d'aujourd'hui, faisait passer l'écran titre de 9 % à 45 % du temps réel) ;
`?force=es2015,2d,elements` dans l'adresse impose les replis des vieux navigateurs, pour les
éprouver. Ni Worker ni mémoire partagée : servie, la distribution n'a besoin d'aucun en-tête
d'isolation, ni du service worker `isolation.js`, qui ne sert plus qu'à la page du dépôt servie par un
serveur ordinaire.

Les deux façons de lire les assets (`moteur/web/environnement-distribution.js`) :

- **servie** : la page lit les dossiers (`fichiers-paquet.js`, genre `url`, disposition
  `distribution`), chaque fichier revalidé auprès du serveur (`cache: 'no-cache'` ; le lanceur, lui,
  sert tout sans cache) : un asset modifié est pris au rechargement ;
- **en double-clic** : une page `file://` ne peut ni lire un fichier voisin (fetch refusé) ni les
  pixels d'une image voisine (canvas souillé), mais peut exécuter un `<script src>` voisin. Chaque
  dossier que le jeu lit a donc son compagnon, un script ES5 qui porte les mêmes fichiers en base 64
  (`F['images/banques/MSPR-0.png'] = '…'`), compressés par gzip sauf ce qui l'est déjà (PNG, MP3 :
  `rendu.json` passe de 69 à 5 Mo) ; la page les charge (genre `compagnons`) et décompresse par
  `moteur/hote/inflate.js`. Les films et les sons n'en ont pas : `<video src="films/…">` et
  `<audio src="sons/…">` se lisent en `file://` (« Le son ») ; `sons/sons.js` ne porte que ce que le
  moteur lit (les HMP, les timbres, le manifeste). `refaire.cmd` (`lanceur/refaire.ps1`, PowerShell
  5.1) refait les compagnons après une modification, et le manifeste des sons remplacés
  (`sons/index.json`, qu'une page ne peut pas lister) ; `moteur/node/compagnons.mjs` en est le pendant sous Node, sur les
  mêmes règles (`distribution.js` : `COMPAGNONS`, `HORS_COMPAGNON`, `compresse`).

La page doit tolérer des assets modifiés à la main : la recomposition (`composerLesFichiers` de
`moteur/hote/assets-du-jeu.js`) est souple dans la page (`signaler`, un message « assets : … » dans
la console) et stricte pour l'extraction, qui vérifie l'identité octet pour octet. Une image absente
ou illisible donne des sprites transparents (un fond noir, une palette de gris) ; une planche plus
petite que ce que dit sa table est complétée de transparent (les tables font foi) ; une image en
couleurs (RVB, RVBA, gris, ou une palette de 1 à 4 bits : ce qu'écrit un éditeur, `png.js` les lit)
est ramenée à la palette du jeu, couleur la plus proche ; un son est lu par la page elle-même, le jeu
n'en prend que la durée d'origine (« Le son ») ; un film absent
n'est pas montré. Les musiques, les textes et les tables sont indispensables : l'erreur nomme le
fichier. Les sauvegardes vivent dans l'IndexedDB de chaque origine : le double-clic (`file://`) ne
voit pas celles de la page servie. Les essais : `travail/portable/eprouver-page.mjs` (Chrome sans
fenêtre, `chrome-pilote.mjs`), en `file://` et servi.

**Le moteur dans le fil de la page, servi :** <http://localhost:8123/local> (le serveur mène à
`/reentrant/moteur/web/local.html`). Le même site, où le serveur sert le moteur réentrant
(`travail/reentrant/moteur/`, à refaire par `node moteur/node/reentrer.mjs`) à la place de
`moteur/jeu` et `moteur/hote` : la page de la distribution, en modules, pour la mettre au point.

### Le moteur dans le fil de la page

`moteur/web/moteur-du-jeu.js` tient tout ce que faisait le travailleur (la machine, ses
observateurs, la publication des images, les retouches, les déplacements, les films, les événements
du son, les fichiers et les sauvegardes) ; `travailleur.js` n'en est plus qu'une enveloppe.
Seule change la façon de rendre la main. Dans le travailleur, l'observateur dort (`Atomics.wait`)
le temps de l'avance du jeu sur le temps réel. Dans le fil de la page, il faut le moteur réentrant
(travail/reentrant/RAPPORT.md), où les fonctions du jeu qui peuvent mener à une pause sont des
générateurs : l'observateur pose `machine.pauseDemandee`, le moteur rend la main au retour de l'appel
en cours, et le pilote (`piloterDansLaPage`) reprend l'exécution à chaque image de l'écran
(`requestAnimationFrame`, un minuteur quand elle ne vient pas : onglet caché), jusqu'à ce que le jeu
ait de l'avance, que la tranche ait pris 12 ms, ou qu'elle ait présenté une image (la page la montre
avant que le moteur ne calcule la suivante, sauf si le jeu a plus d'une image de retard : il rattrape,
dans le budget) ; une tranche qui trouve le jeu en avance présente l'image entre deux du jeu (les
animations intercalées à 60 images par seconde). Les 12 ms tiennent quoi qu'il arrive, même au milieu
d'une image (retour 80 de [demandes.md](demandes.md)) : les observateurs ne passent qu'au fil du temps
virtuel, qui n'avance qu'aux services rendus au jeu et aux images, et un pas de simulation n'en
demande presque pas ; le jeu accéléré (F4 : vitesse + 1 pas par image, sans borne dans le jeu de
1994) faisait tenir des dizaines de pas dans une image, et le moteur ne rendait la main qu'à la
suivante, la page figée d'autant. La garde du temps réel (`garderLeTempsReel`,
`moteur/hote/reentrance.js`) fait de `machine.pauseDemandee` un accesseur : ce que posent les
observateurs est rendu tel quel, et, rien n'y étant posé, la demande l'est dès que l'heure réelle a
passé l'échéance de la tranche (lue une fois sur seize lectures du champ) ; le moteur rend alors la
main à la prochaine frontière d'appel où il le sait, entre deux pas, entre deux objets du parc. La
partie n'en est pas changée : `verifier.mjs --reentrant --garde`, l'échéance toujours passée, fait
rendre la main à presque chaque frontière (183 000 fois en 150 s de `vitesse-f3-f4` au lieu de
6 300), et les 47 scénarios restent identiques, sans pause perdue. Sous Node, grande vue 1888x1000,
vitesse 200 : une image prend 35 ms en moyenne, calculée d'une traite sans la garde (jusqu'à 45 ms),
en morceaux de 15 ms au plus avec elle (`travail/portable/vitesse-f3-f4.mjs`). Reste d'une traite ce que l'analyse de `reentrer.mjs` sait sans point de pause, dont le plus long
relevé : la sauvegarde de la fin d'année (0x2DF12), 0,2 s sous Node, une fois l'an de jeu. La même disposition
de l'écran (`memoire-partagee.js`) vit dans une mémoire ordinaire, et `atomiques()` y remplace Atomics
par de simples accès ; les entrées passent par la même file. Les enveloppes posées sur des routines du
jeu rendent ce que rend la routine (un itérateur, dans le moteur réentrant) ; celle du film (0x5C04F)
devient un générateur qui rend la main jusqu'à la fin du mp4. INTRO.EXE ne tourne pas dans le fil de
la page (le moteur réentrant ne transforme que le jeu) : l'introduction est le mp4, et sans lui on
passe au jeu. Un point de pause a dû être ajouté à `reentrer.mjs` : la touche traduite (0x7E888),
que l'écran titre relit en boucle sans présenter d'image (sans elle, la page se figeait sur l'écran
titre ; `travail/portable/attentes-sans-pause.mjs` relève ces attentes : 33 ms virtuelles au plus
sur les 46 scénarios). Tout ce qui dépend de l'endroit d'où vient la page est dans
`moteur/web/environnement.js` (la page du dépôt) ou `environnement-distribution.js` (la distribution). Le son :
des fichiers joués par Web Audio (servie) ou par des éléments `<audio>` (`file://`), d'après les
événements du moteur (« Le son »). L'image : WebGL2, sinon l'affichage 2D (`Affichage2D`, un seul rendu, sans
zoom composé). Le détail, les mesures et les preuves : `travail/portable/RAPPORT-fichier-unique.md`.

---

## Le moteur autonome

La réécriture est terminée : le jeu tourne sur le code lisible seul, sans la transcription et sans
une instruction de `MAIN.EXE`.

**Le processeur.** `moteur/hote/processeur.js` tient la place de la transcription auprès de l'hôte :
les registres, et une table des fonctions du programme, par adresse, que `poserLeProgramme`
(`moteur/jeu/index.js`) remplit du code lisible — les `reecritures` et les `enAttente` des 56
modules, et `moteur/jeu/demarrage.js`, qui réécrit le point d'entrée de Watcom, `__CMain`, ses
erreurs fatales, le gestionnaire de la minuterie de SOS et son chaînage au BIOS : des routines qui
ne reviennent pas comme des fonctions (convention `brute`). Il n'exécute aucune instruction. Une
adresse qu'il ne connaît pas est celle d'un module de son chargé de `HMIDRV.386`, que l'hôte joue
lui-même, ou d'une fonction absente, qui arrête le jeu en la nommant.

**L'image du programme.** Le code lisible garde l'état du jeu aux adresses de 1994 et lit les
tables et les valeurs de départ là où `MAIN.EXE` les range. `moteur/hote/image-programme.js` en tire
l'image des seules données (130 Ko) : l'objet des données, relogé, et 129 îles de données logées
entre les fonctions (chiffres de `itoa`, sélecteur des données, nom de la console, et du code que
rien n'atteint, gardé tel quel). Le reste de la place du code est vide.

**L'image du programme en tables.** Les assets n'en gardent pas les octets bruts, mais des tables
lisibles, dans `assets/programme/` (`moteur/hote/tables-du-programme.js`) : chaque octet de l'image
appartient à une zone, que le manifeste (`programme/index.json`) décrit — adresse, taille, type,
fichier, nom, modules de `moteur/jeu` qui la lisent, description —, et dont un `.json` par module
lecteur (ou `chaines.txt`, pour les chaînes) donne la valeur. Les types sont des entiers de 8 à 32
bits, signés ou non, des pointeurs (écrits en hexadécimal), des structures aux champs nommés, en
tableaux, des chaînes de longueur fixe ; une zone faite par un autre asset (les polices, plus bas)
a pour fichier `../images/polices/<police>.json`. La carte des zones,
`moteur/hote/carte-du-programme.js`, est faite par `outils/carte-du-programme.mjs` : une zone va
d'une adresse que le code référence à la suivante (un accès à une adresse fixe, d'une certaine
largeur, indexé ou non ; une adresse prise ; un pointeur logé dans les données ; une constante de
`moteur/jeu`, qui donne son nom et son commentaire) ; une variable lue seule s'arrête à sa largeur ;
les tables décrites à la main (`outils/tables-connues.mjs` : catalogues de référence des attractions
et des boutiques, pays, menus, mise en page et commandes des fenêtres, ressources et noms de
fichiers, éléments et genres de voie, entrée du parc, lac, entrepôt, polices…) prennent leurs
structures. Une zone dont on ne connaît pas le sens est marquée `brut` : ses octets (ou ses mots), et
qui la lit. `composerLeProgramme` (assets-du-jeu.js) refait l'image avant le démarrage, au format que
lit `lireLImage` ; l'extraction la compare, octet pour octet, à celle que donne `MAIN.EXE`.
L'introduction a sa partie du manifeste : les zones qu'`INTRO.EXE` pose autrement que `MAIN.EXE`
(46, dans `programme/intro/`), sur la mémoire du programme.

**Les polices.** Le jeu écrit avec trois polices : la petite (3 × 6 points, dessinée dans le
programme en 0xBA2FC : la bulle des messages, les enseignes, les jauges), celle de l'interface et
celle des titres, toutes deux faites d'images de la banque `MFONT-0`, par deux tables de 256 octets du
programme (0xB51C1 et 0xB50C1 : code de caractère → numéro d'image) ; deux polices de la bibliothèque
de Watcom (8x8, 8x14) sont liées au programme mais jamais montrées. `moteur/hote/polices.js` les écrit
en planches PNG, un glyphe par code dans une grille de 16 colonnes, et en tables JSON (place,
largeur, hauteur, chasse, image) dans `assets/images/polices/`. Les zones du programme qu'elles font
ont pour fichier, dans le manifeste, `../images/polices/<police>.json` (`estExterne`, dans
tables-du-programme.js) : `composerLeProgramme` en demande les octets à `composerLesPolices`, qui
refait aussi `MFONT-0.DAT` et `.TAB` (la banque n'a plus de planche dans `images/banques/`). Les
codes qui partagent une image dans une police (« a » et « A ») ont une case vide marquée `comme` ; une
case redessinée à part, ou dessinée pour un code qui n'en avait pas, devient une image ajoutée au bout
de la banque (l'en-tête du `.DAT` compte les images). Tant qu'on n'y touche pas, tout se refait à
l'identique : l'extraction le vérifie avec le reste.

**Les langues.** Le jeu ne connaît une langue que par un chiffre : l'option `-l` (la table 0xB7E17 :
U0 G1 I2 S3 F4 P5 66 77 88 99) remplace le premier 0 de `data/lang0-0.dat`. `assets/textes/index.json`
(`moteur/hote/langues.js`) dit les langues — nom, fichier, emplacement (ce chiffre) — dans l'ordre du
menu « langue » de la page, qui le lit avant le lancement et passe `-l<emplacement>` au jeu ; la
recomposition fait un `LANGn-0.DAT` par langue qui a un emplacement. Les cinq du CD occupent 0 à 4 ;
une langue ajoutée prend 5 à 9, ou l'un des cinq. Les textes sont en vrais caractères dans les JSON,
refaits en octets de la page 437 du DOS (celle des fichiers du CD : Ä 0x8E, Ñ 0xA5, è 0x8A ;
`formats-du-cd.js`, `signesEnTextes`), avec les correspondances propres à la langue s'il y en a
(`caracteres`). Le README (« Traduire le jeu ») dit le format, les glyphes que chaque police a, et ce
que demanderait un autre alphabet.

**Les données du jeu.** `moteur/hote/assets-du-jeu.js` fait, à partir du CD du joueur (son image
ISO, lue par `iso9660.js`, ou le CD déroulé), les assets dont le moteur a besoin, en formats
d'aujourd'hui : les tables du programme et de l'introduction, les banques d'images en planches PNG
à palette, les fonds et les palettes en PNG, les bruitages en WAV, les morceaux en HMP (et en MIDI,
pour les lire ailleurs), les textes en JSON, telles quelles les tables (`.ANI`, `.INF`), et les
en-têtes des bibliothèques de HMI que SOS lit (`donnees/pilotes-hmi.json` ; l'hôte en refait
`HMIDRV.386` et `HMIDET.386`, voir « Le son ») (`node moteur/node/extraire-jeu.mjs`, dans
`assets/`, versionné). Avant le démarrage, le travailleur refait de ces assets, en mémoire, les
fichiers du CD (`composerLesFichiers`), identiques octet pour octet — l'extraction le vérifie sur
les 113 fichiers que le jeu lit tels quels ; les deux bibliothèques de HMI, virtuelles, sont
vérifiées sur leurs en-têtes —, si bien que le code de 1994 lit ses fichiers d'origine, et qu'un
asset retouché (une planche, un texte, un bruitage, une valeur d'une table du programme) change le
jeu. Les films (`data/intro.dat`,
`data/rideani.*`, `data/wingame.dat`) sont convertis en mp4 par `extraire-films.mjs`, qui les fait
jouer par le moteur sous Node et capte chaque image et le son ; la page les joue en vidéo
(`moteur/web/films.js`) : le travailleur remplace la routine du jeu (`0x5C04F`) par une attente, et
le jeu n'en voit rien d'autre, comme si le film manquait. La page sait faire l'extraction dans le
navigateur, à partir de l'image ISO que le joueur lui donne (les films FLC restent alors tels quels,
joués par le jeu).

**Les fonctions absentes.** Des 1 098 fonctions du programme (152 419 instructions), 847 sont
réécrites — 802 prouvées par le rejeu des scénarios, 45 « en attente », que ce rejeu ne sait pas
éprouver, pour la plupart parce qu'aucun scénario ne les atteint : elles le sont appel par appel
(plus bas), ou par l'introduction (la détection des cartes son) —, une n'est rendue que par l'hôte
(le cœur d'`int386x`, `0x89F90`), et 250 n'ont pas leur place dans le moteur :
`moteur/jeu/hors-d-usage.js` les pose à leur adresse avec la raison de leur absence
(`python outils/avancement.py` fait le compte) :

| Raison | Fonctions | Instructions | Pourquoi |
|---|---:|---:|---|
| Le jeu en réseau (`0x482EB` à `0x49B20`) et ce qu'il est seul à appeler : `system`, le lancement d'un programme | 57 | 3 123 | NetBIOS (int 5Ch) n'existe pas dans l'hôte (rétro-ingénierie, § 11.6) |
| Les pilotes de musique compilés pour d'autres cartes que la puce FM | 67 | 4 176 | l'hôte ne déclare que la puce FM (`BF_MUSIC=SB16FM`) |
| L'intérieur d'`int386x` | 2 | 15 | l'hôte en rend le cœur |
| L'agrandissement du tas sous un autre extendeur | 2 | 88 | l'hôte est DOS/4GW ; le point d'entrée refuse les autres |
| Ce que les données du jeu ne demandent jamais : les conversions `%c`, `%n`, `%[` et flottantes de `scanf`, le `%hf` de `printf`, l'ouverture d'un fichier en ajout, les fichiers temporaires | 13 | 801 | les cinq formats de `scanf` du programme n'ont que `%s`, `%x` et `%d` ; le jeu n'ouvre que `sndsetup.inf`, en lecture |
| Les sous-routines en assembleur du dépaquetage RNC | 4 | 137 | sa réécriture (`0x87B2C`) les fait elle-même |
| Le code mort | 5 | 1 037 | les états 0x28 à 0x2E des visiteurs, que seules ces fonctions posent ; « con » (`0x7E342`), une donnée prise pour du code |
| Les bornes des plages verrouillées de SOS | 100 | 1 060 | des fonctions vides dont seule l'adresse sert |

**Les preuves.**

- Le rejeu comparé des 46 scénarios, moteur autonome contre transcription, sur l'image seule et la
  place du code remplie de 0xCC : si la partie reste identique, rien n'y lit. Les 46 sont IDENTIQUES.

  ```bash
  node moteur/node/verifier-tout.mjs --autonome --image --remplir 0xCC
  ```

- Les bancs d'essai, pour les fonctions en attente : une partie jouée par la transcription jusqu'à
  un instant choisi, où chaque cas prépare la mémoire comme le jeu l'aurait fait et appelle les
  fonctions, comparées appel par appel à la transcription (`moteur/scenarios/bancs/`, dont
  `bibliotheque-c.mjs` pour la lecture des fichiers et les conversions rares de `printf`). 0
  divergence.

  ```bash
  node moteur/node/eprouver.mjs moteur/scenarios/bancs/bibliotheque-c.mjs
  ```

- Les erreurs fatales, qui mettent fin au programme : `node moteur/node/eprouver-fins.mjs` provoque
  la même fin des deux côtés — code de sortie, message, mémoire. Le débordement de pile y garde
  l'anomalie de sa bibliothèque : il prend l'adresse de retour de son appelant pour son message.

### L'introduction

Le lanceur d'origine (`THEME.BAT`) exécutait un second programme avant le jeu : `INTRO.EXE`, le film
d'ouverture (`DATA/INTRO.DAT`, 1 727 images FLC en 320x200, avec sa musique et ses bruitages). Il
est lié à la même bibliothèque que `MAIN.EXE` — Watcom, HMI SOS, la couche de son et le lecteur de
films de Bullfrog — : 466 de ses 497 fonctions sont, instruction pour instruction, celles du jeu, à
d'autres adresses. Plutôt que d'en réécrire une seconde copie, on le **transporte** dans la
disposition mémoire de `MAIN.EXE`, où le code lisible du jeu tourne tel quel :

- **la carte** (`outils/intro.py`, qui l'écrit dans `travail/intro/carte.json` et
  `moteur/hote/intro-carte.js`) : les fonctions appariées par leur forme (octets identiques, champs
  relogés masqués), les clones de `MAIN.EXE` distingués par les appels de leurs appelantes ; puis,
  champ relogé par champ relogé, les données qu'elles désignent. Les données partagées prennent la
  place de leurs jumelles de `MAIN.EXE` ; les données propres de l'introduction (3 Ko : textes,
  script, variables) sont posées d'un seul tenant à la place du code de `MAIN.EXE`, entre ses îles ;
  les fonctions propres gardent leur adresse, plus `0x800000`. Quelques cas sont nommés dans la
  carte : un indice replié par le compilateur, les tables d'initialisation de Watcom (bornées par
  l'éditeur de liens, et plus longues dans `MAIN.EXE`), les fins de table (des bornes, sans
  octets), et le champ `_edata` du démarrage, qui tombe sur la première variable de l'introduction ;
- **l'image** (`moteur/hote/image-intro.js`) : les données d'`INTRO.EXE` posées selon la carte,
  pointeurs traduits, sur l'image du programme — dans les assets, les tables de `programme/intro/` ;
- **le code** : ses 27 fonctions propres réécrites dans `moteur/jeu/intro.js` (`main`, les deux
  minuteries — celle de SOS, ou la sienne à 120 Hz sans carte son —, le clavier, le lecteur du film
  et son script, la lecture de `sndsetup.inf` et l'ouverture des deux cartes) ; beaucoup sont celles
  du jeu, liées ailleurs, et en prennent la réécriture avec leurs propres liens (le démarrage de
  Watcom, `demarrage.js` ; l'ouverture des bruitages, `son-du-jeu.js`) ; trois, identiques octet pour
  octet, prennent telle quelle celle de leur jumelle (`COPIES_DE_L_INTRODUCTION`, `index.js`). La
  détection des cartes son, que le jeu saute (option `-o`) et que l'introduction fait, a été réécrite
  pour elle (`sos-bruitages.js`, section 9). `poserLIntroduction` pose le tout sur le processeur.

Dans la page, le travailleur joue l'introduction d'abord, dans une machine à elle, lancée comme
`THEME.BAT` la lançait (depuis `D:/GAME/`, avec `-C:/THEME.CD`) ; une touche l'arrête (un clic aussi,
dans la page) ; puis le jeu. F4 à l'écran titre (« revoir l'introduction », code 10) relance la page,
donc l'introduction, comme le lanceur d'origine. Un paquet fait sans `INTRO.EXE` démarre sur le jeu.

Les preuves (`moteur/node/verifier-intro.mjs`) :

- **la carte** : `INTRO.EXE` joué dans sa propre disposition (sa transcription mécanique) et
  transporté (sa transcription transportée, `transcrire.py --carte`, dont les 466 fonctions
  appariées sont textuellement celles de `MAIN.EXE`) : la même image toutes les 100 ms, le même son,
  et toutes ses données, octet par octet, chacune à sa place (pointeurs traduits) ; ce que rend
  `main` — rien de voulu : le pointeur d'une table, dont `exit` fait le code de sortie, 200 dans une
  disposition, 16 dans l'autre — est comparé traduit ;
- **`--lisible`** : tout le code lisible posé sur la transcription transportée, contre elle seule ;
- **`--autonome`** : le moteur autonome, sans aucune transcription, contre elle.

Dans ces deux derniers cas, la mémoire se compare telle quelle, toute (la pile privée de SOS
comprise), et chacune des 44 592 interruptions de la minuterie de SOS doit tomber à la même hauteur
de pile (`--interruptions`) : l'introduction joue son film pendant que la musique tourne, et SOS
range le pointeur de pile du code interrompu en mémoire. Deux fonctions du jeu y ont gagné le cadre
de leur original (`0x80BE4`, l'attente du balayage ; `0x876B7`, `read`). Toutes trois sont
IDENTIQUES sur les 186 s du film, avec et sans carte son, et interrompues par une touche.

```bash
node moteur/node/verifier-intro.mjs --son                 # la carte
node moteur/node/verifier-intro.mjs --autonome --son --interruptions
```

## Ce qui n'est pas fait

- **Le jeu en réseau** : il faudrait émuler NetBIOS (rétro-ingénierie, § 11.6), puis réécrire les
  57 fonctions qui s'en servent.
- **D'autres cartes son** que la Sound Blaster 16 et sa puce FM : les pilotes de musique compilés
  pour d'autres cartes, et ceux que `HMIMDRV.386` apporte (MT-32, MPU-401), ne sont ni réécrits ni
  imités. (Pour l'introduction, la structure d'initialisation du pilote de musique qu'elle passe à
  SOS est coupée par la carte : ses champs +4 et +8, que le pilote FM ne lit pas, sont ailleurs.)

---

## La réécriture lisible, en pratique

Une fonction réécrite vit dans `moteur/jeu/`, à côté des autres, et déclare l'adresse qu'elle
remplace :

```js
export const reecritures = [
  { adresse: 0x183EC, nom: 'defilerCarte', fn: (jeu, direction) => defilerCarte(jeu, direction), arguments: 1 },
];
```

`moteur/jeu/index.js` la pose dans le module transcrit et l'habille de la convention d'appel de
1994 : arguments empilés de droite à gauche, nettoyés par l'appelant, résultat dans `eax`. Une
fonction réécrite peut appeler celles qui ne le sont pas encore, par `jeu.appeler(0x…, args…)`.

L'état du jeu reste là où le programme d'origine le range, en mémoire, aux adresses de 1994 :
`moteur/jeu/etat.js` lui donne des noms. Le code réécrit et le code encore transcrit voient donc
exactement les mêmes variables, et l'on peut réécrire dans n'importe quel ordre.

### Deux vérifications

**Le rejeu comparé**, pour l'ensemble :

```bash
node moteur/node/verifier.mjs --duree 140 --script moteur/scenarios/demo.json --modules carte
```

La même partie est jouée deux fois, avec et sans le code lisible. Toutes les 100 ms virtuelles, on
compare une empreinte de l'image affichée — l'image complète en 640x480, que l'hôte garde hors de
la fenêtre vidéo de 64 Ko, et la palette — et une des variables du jeu ; chaque seconde, une du
reste de la mémoire, tas compris, où vivent les objets du parc. La moindre différence de
comportement finit par décaler la partie et se voit ; en cas de divergence, l'outil rejoue les
deux parties jusqu'au relevé fautif et désigne les octets.

**La comparaison appel par appel**, pour une fonction précise : à chaque appel, on exécute la
transcription, on note l'état obtenu, on restaure l'état de départ, on exécute la réécriture, et
on compare (`installerCompare`, dans `moteur/jeu/index.js`). L'état comprend la mémoire du jeu,
les registres, la pile de l'appelant, et celui de l'hôte (`Machine.instantane`) : l'heure, les
entrées en attente, la carte vidéo. Trois morceaux du tas y sont remis d'office, parce que n'importe
quelle fonction peut les changer sans le savoir : les tampons du curseur, qu'écrit le gestionnaire
de souris à chaque interruption, les six banques d'images, dont le relogement n'est pas idempotent,
et les octets écrasés par chaque lecture de fichier (journal des essais, § 5.8). Le détail est dans
le [guide de réécriture](guide-reecriture.md).

### Ce que la pile ne prouve pas

La transcription laisse, sous le pointeur de pile, les registres et variables locales de ses
propres cadres ; et les emplacements de variables locales non initialisées gardent des restes
d'appels antérieurs. Une réécriture y laisse autre chose : les comparer ferait échouer des
réécritures pourtant exactes. Le rejeu ignore donc la pile. La comparaison appel par appel la
restaure entière entre ses deux exécutions, restes compris — certaines fonctions se servent de leurs
arguments comme de variables — et compare la pile de l'appelant, au-dessus des arguments : c'est là
qu'écrit une fonction à qui l'on passe l'adresse d'une variable locale.

**Les exceptions** : l'état 4 des visiteurs (`0x223C1`) lit une variable qu'il n'a pas écrite, et y
trouve l'octet laissé par la routine d'objet appelée avant lui ; la fiche du joueur (`0x576FE`) fait
de même avec l'octet qu'a laissé, juste avant elle, la routine de texte ou le bruitage de l'écran
titre ; la barre des messages (`0x5CBDB`), le CONSEILLER allumé, relit un mot de quatre octets
laissé par la vue, la barre de menus et la barre d'outils de la boucle du parc ; et l'état 4 des
visiteurs, quand aucune routine d'objet n'a écrit l'octet qu'il relit, le trouve laissé par le
calendrier, appelé juste avant la mise à jour des objets (journal des essais, § 5.6). Ces octets-là sont comparés, et épargnés par le rejeu empoisonné
(`--empoisonner`), qui brouille tous les autres restes des réécritures pour prouver que rien ne les
lit (`resteRelu`, dans `moteur/jeu/index.js`). Le brouillage tire ses valeurs d'une seule suite ;
`--graine` la fait varier. La tonte de l'agent d'entretien relit elle aussi un reste, traité hors de
`resteRelu` : six restes relus sont connus en tout (guide de réécriture, « Les restes de pile »).
Avec la carte son, la pile privée de SOS pose la même question : le rejeu l'ignore, la comparaison
appel par appel la compare, et les réécritures qui y tournent y laissent ce qu'y laissait l'original
(rétro-ingénierie, § 9.7).
