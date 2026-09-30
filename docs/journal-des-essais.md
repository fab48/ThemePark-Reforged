# Journal des essais

Tout ce qui a été tenté sur le jeu d'origine, avec le verdict. Les échecs sont consignés autant
que les réussites : ils disent où sont les limites du moteur de 1994.

Dates : 18 au 21 septembre 2026. Jeu de référence : Theme Park version CD, `MAIN.EXE` du
14 juin 1994, 841 223 octets, compilé avec Watcom C/C++ et lancé par l'extendeur DOS/4GW.

---

## 1. Affichage : agrandir l'image

| Essai | Verdict |
|---|---|
| DOSBox-X, filtre xBRZ, sortie logicielle, fenêtre agrandie | Fonctionne, mais rendu jugé laid |
| DOSBox-X, shader 5xBR sur carte graphique, plein écran | Abandonné : le jeu reste bloqué sur la bannière DOS/4GW |
| DOSBox 0.74-3, sortie OpenGL, plein écran | Abandonné : l'affichage se fige au changement de mode vidéo |
| **DOSBox 0.74-3, sortie OpenGL, grande fenêtre, filtre normal3x** | **Retenu** |

**Découverte importante, valable sur cette machine.** Avec un écran 3840x2160 et une carte NVIDIA,
toute sortie accélérée en **plein écran** cesse de se rafraîchir dès que le jeu change de mode
vidéo : l'écran reste sur la bannière de démarrage alors que le jeu tourne derrière. Vérifié par
copies d'écran réelles, sur DOSBox comme sur DOSBox-X, en OpenGL comme en Direct3D. En fenêtre,
les mêmes sorties fonctionnent parfaitement. Ne jamais livrer de configuration en plein écran ici.

**Autres pièges rencontrés.** La sortie logicielle n'agrandit pas l'image en plein écran, même en
précisant une résolution. Un shader OpenGL n'agrandit pas la fenêtre non plus. Le double balayage
doit être désactivé, sinon le filtre reçoit des pixels deux fois plus hauts que larges. Enfin, un
raccourci lancé depuis le dossier du programme DOSBox-X déclenche sa fenêtre « choisir un dossier
de travail » et lui fait charger une configuration en mode texte minuscule : il faut passer
l'option qui supprime cette question et pointer le dossier de configuration.

**Raccourcis livrés sur le bureau**, tous en grande fenêtre, jeu corrigé, 80 000 cycles :
`Theme Park HD - normal3x (pixels)` (préféré), `hq3x (lissé)`, `advmame3x (net)`.

---

## 2. Correctifs de l'exécutable

Le script `outils/patch-theme-park.py` reconstruit un exécutable corrigé à partir de l'original du
CD. Rien n'est modifié en place : chaque version est reconstructible et les précédentes sont
conservées à côté du jeu.

| Correctif | État |
|---|---|
| Souris figée en haute résolution | **Validé en jeu** |
| Vitesse du jeu indépendante de la puissance machine | **Validé en jeu** |
| Cadence de la simulation, une image sur trois | **Validé en jeu** |
| Gel des écrans de gestion | Corrigé, non retesté depuis |
| Défilement au pixel | **Rejeté**, désactivé par défaut |
| Retour des quatre vitesses du jeu | Écrit et installé, **à valider en jeu** |

### 2.1 Souris figée en haute résolution

Le jeu devenait inutilisable dès qu'on passait en 640x480 avec la touche R. Cause : le gestionnaire
de souris pose un drapeau de non-réentrance en entrant, puis sort par un chemin qui saute
par-dessus l'instruction qui le remet à zéro. Tous les événements suivants sont alors rejetés.
Correctif d'un seul octet, qui redirige ce saut vers la remise à zéro.

### 2.2 Vitesse indépendante de la machine

Le jeu n'a aucune horloge dans sa boucle principale : il avance d'un pas de simulation par image
dessinée, aussi vite que le processeur le permet. Sur une machine moderne émulée à 80 000 cycles,
les jours défilaient à toute allure. Une routine ajoutée dans l'espace libre en fin de code attend
le balayage vertical de l'écran avant chaque image, ce qui donne une cadence stable quel que soit
le nombre de cycles, puis la simulation avance d'un pas toutes les trois images.

### 2.3 Défilement au pixel : rejeté

Tentative de remplacer le défilement par tuiles entières, de 48 pixels, par un déplacement continu.

Ce qui a marché : le sol se met effectivement à glisser au pixel près. La boucle de dessin jetait
un reste de division entière, et ce reste était exactement le décalage fin qui manquait.

Ce qui a échoué : les visiteurs, les manèges et les boutiques ne suivent pas ce décalage, ils
calculent leur position autrement. Résultat à l'écran, dans les mots de l'essai : les objets
glissent les uns par rapport aux autres puis se recollent brutalement à chaque tuile franchie,
comme des calques désolidarisés. De plus l'axe vertical continue de sauter, faute d'origine en
pixels sur cet axe dans le moteur.

Une solution existe, décrite dans [retro-ingenierie.md](retro-ingenierie.md) : tous les sprites du
monde passent par une seule routine d'insertion, et un décalage appliqué là les déplacerait
ensemble, sur les deux axes. C'est plusieurs heures de travail délicat, jugées mal investies dans
un moteur qu'on veut remplacer. Le correctif reste disponible en option `--scroll-lisse`.

**La suite, fin septembre 2026, dans le moteur réécrit : retenu, en réglage.** L'idée d'un décalage
appliqué à la routine unique des objets ne tenait plus : la réécriture a montré que `0x209B5` dessine
sur-le-champ, et surtout que dessiner a des effets sur la partie (l'enseigne d'un kiosque ne défile
que s'il est dessiné, la première attraction visible réclame la musique, le clic est attribué
pendant le dessin). Déplacer ou élargir ce que dessine le jeu changerait donc le jeu. Le défilement
fluide (`reglages.defilementFluide`, architecture, « Les réglages : le défilement fluide ») ne touche
plus au dessin : deux crochets en lecture seule relèvent la vue que le jeu vient de dessiner et
l'image qu'il présente ; la page les recolle dans une mosaïque du monde, fait glisser la vue d'une
position de la caméra à la suivante avec un léger retard, et remet l'interface par-dessus, à sa
place. Le retard est ce qui rend la mosaïque suffisante : le bord avant est toujours dans l'image
courante, seul le bord arrière vient d'une image plus ancienne. Mesures, sur `parc.json` augmenté de
touches fléchées répétées toutes les 33 ms (38 à 41,5 s en 320x200, 66 à 69,3 s en 640x480) : la
vitesse montrée au bord de l'écran, en 320x200, est de 239 px/s ± 13 ; au clavier, 700 px/s après
une montée de 240 à 1 250 px/s le temps de rattraper le retard ; un pas de caméra ne change plus que
0,1 % des pixels de la vue à l'instant où il arrive, contre 7,7 % sans glisse. Une première version
calait chaque glisse sur l'écart depuis le pas précédent : régulière au bord de l'écran, elle
s'arrêtait et bondissait au clavier, où les pas arrivent irrégulièrement ; les pas sont maintenant
des points de passage datés à l'intervalle moyen. Preuves : les deux parties, réglage éteint et
allumé, ont la même mémoire du jeu tout du long, toute la mémoire comprise chaque seconde (766
relevés, sur `parc.json` et sur sa version au clavier) ; et, à chaque image publiée (1 554), la vue
montrée à la position de la caméra redonne l'image du jeu à l'octet près.

### 2.4 Les quatre vitesses du jeu

Régression introduite par le limiteur d'images et trouvée le 21 septembre : la routine écrivait
zéro dans la variable de vitesse à chaque image, ce qui effaçait le réglage choisi. Le jeu propose
pourtant quatre vitesses, dont les libellés figurent dans les fichiers de langue : lent, normal,
rapide, ultra-rapide. Correctif : la variable n'est plus touchée, et la branche des vitesses lentes
est reprise par une routine ajoutée, la branche des vitesses rapides étant déjà cadencée.

---

## 3. Extraction des données

Voir le [README](../README.md) pour les formats et la table des palettes.

| Essai | Verdict |
|---|---|
| Décodage des banques de sprites | 3472 images, aucune erreur |
| Palette générale appliquée à tous les écrans | **Faux** : chaque écran a la sienne |
| Détection automatique de la palette par la douceur des couleurs | Bonne sur les fonds tramés, fausse sur les sprites |
| Association écran/palette par l'ordre des noms de fichiers dans l'exécutable | **Retenue**, vérifiée image par image |

Deux associations restent à confirmer en jeu : l'écran des actions et le fond Midland.

---

## 4. Leçons d'outillage

**Capture d'écran.** La fonction Windows `PrintWindow` avec l'indicateur 2 capture la fenêtre même
lorsqu'elle est recouverte, ce qui évite de voler le focus. L'enregistrement PNG échoue en revanche
si le chemin de destination est très long.

**Ne jamais capturer une grande fenêtre en rafale.** Un essai de mesure du défilement enregistrait
la fenêtre entière soixante-dix fois de suite, en tâche de fond. Le fichier a atteint 46 Go et
rempli le disque avant d'être arrêté. Capturer une bande étroite, borner la taille totale, et
surveiller le fichier pendant l'écriture.

**Mesurer le défilement à 180 ms d'intervalle ne prouve rien** : à cette cadence, un pas de six
pixels par image et un saut d'une tuile toutes les neuf images donnent le même déplacement total.

**Python et le dossier temporaire de session.** L'interpréteur installé ici ne peut pas lire les
fichiers situés sous le dossier de travail temporaire des sessions. Les scripts doivent vivre dans
le dossier du projet. Écrire du Python par un document intégré au shell abîme les échappements :
passer par un fichier.

---

## 5. Changement de cap : transcrire le programme plutôt que le rapiécer

**21 septembre 2026, suite.** Les correctifs apportés à l'exécutable de 1994 ont chacun coûté cher
et buté sur la même limite : le moteur d'origine n'a pas été écrit pour ce qu'on lui demande. Le
défilement au pixel en a fait la démonstration — le sol glisse, les visiteurs sautent. Décision :
**ne plus modifier l'exécutable, le remplacer.** La méthode et l'état sont décrits dans
[architecture.md](architecture.md) ; ce chapitre ne garde que les essais et leurs verdicts.

| Essai | Verdict |
|---|---|
| Désassemblage récursif guidé par les relocations | **Retenu** : 97,5 % du code, toutes les tables de sauts résolues |
| Transcription instruction par instruction en JavaScript | **Retenu** : 1 098 fonctions, le jeu tourne |
| Vérification de chaque instruction contre Unicorn | **Retenu** : 375 762 cas, deux vrais défauts trouvés |
| Convention d'appel : registres (hypothèse précédente) | **Faux** : 654 fonctions sur 944 passent par la pile, l'appelant nettoie |
| Faire tourner le jeu dans la page elle-même | Abandonné : le code boucle sans rendre la main, il faut un *Web Worker* |

### 5.1 Les pièges trouvés en chemin

**Capstone perd un préfixe.** `f2 a5` est un `repne movsd`, c'est-à-dire une copie répétée.
Capstone l'affiche `movsd`, sans préfixe et sans le signaler : la traduction ne copiait qu'un mot
de quatre octets au lieu du bloc entier. Onze occurrences dans le jeu, dont les copies vers l'écran.
La leçon vaut au-delà : **lire les préfixes dans les octets, pas dans le texte du désassembleur.**
Le banc de test ne l'avait pas vu parce qu'Unicorn, avec un compteur de répétition tiré au hasard,
sortait de la mémoire et le cas était écarté — un cas écarté n'est pas un cas réussi.

**Watcom n'utilise pas d'instruction `int` à numéro variable.** `int386` empile l'adresse d'une
petite routine `int N ; ret` choisie dans une table, puis fait `ret` pour y sauter. Traduit
naïvement, ce `ret` rend la main à l'appelant sans exécuter l'interruption. Même procédé dans
`_chain_intr`, qui défait la pile du gestionnaire et saute à l'ancien gestionnaire par un `retf`.
C'est l'analyse de hauteur de pile (`outils/pile.py`) qui a débusqué les deux, parmi 1 098
fonctions, en signalant les `ret` qui ne reviennent pas.

**Les données logées dans le code.** Watcom range dans le segment de code les tables de sauts, les
valeurs des `switch` creux (lues par `repne scasb`) et les initialiseurs des tableaux locaux (copiés
par `rep movsb`). Les prendre pour des instructions donne un désassemblage plausible et faux. Les
relocations de l'exécutable LE permettent de les distinguer sans ambiguïté.

**Le petit objet 2 à `0xA0000`.** L'éditeur de liens l'a placé là où le jeu écrit en absolu dans la
mémoire vidéo. Sous DOS/4GW, les objets étaient chargés ailleurs ; il faut le déplacer.

**Le DOS rend toujours le plus petit numéro de fichier libre.** En numérotant les fichiers ouverts
sans jamais réutiliser les numéros rendus, on dépasse la table de modes de la bibliothèque C, qui
refuse alors les lectures **sans rien signaler** : le jeu ouvrait le fond de son menu et le lisait
dans le vide, écran noir.

**Un clic instantané n'existe pas.** La boucle d'attente du jeu sonde l'état « bouton enfoncé » ;
un appui et un relâchement livrés d'affilée ne sont jamais vus. L'hôte espace donc les changements
de bouton d'au moins 40 ms de temps virtuel, ce qu'un clic humain dépasse toujours.

### 5.2 Ce que la transcription a coûté en vérification

Trois défauts de traduction ont été trouvés, tous par la vérification et aucun par la lecture :
le préfixe de répétition perdu, l'opérande d'`imul` 16 bits non étendu en signe, et une rotation de
16 bits d'un compte de 16 qui ne doit pas toucher aux indicateurs. Sans le banc de test, le premier
aurait donné un écran noir inexplicable, et les deux autres des erreurs de calcul silencieuses,
peut-être un visiteur sur mille se dirigeant vers la mauvaise attraction.

### 5.3 L'horloge, en quatre essais et un réglage

Le jeu n'a pas d'horloge ; il faut lui en donner une, et c'est plus délicat qu'il n'y paraît.

| Essai | Verdict |
|---|---|
| Temps proportionnel au travail : quelques millisecondes tous les N sauts en arrière | **Rejeté** : une fonction réécrite, plus courte, fait dériver l'horloge ; la vérification échoue |
| Une image par tour de la boucle du parc (`0x4FD85`) | **Rejeté** : les menus sont d'autres boucles ; le temps s'y fige, la démo part aussitôt |
| Une image par réaffichage du curseur (`0x7D79E`) | **Rejeté** : le parc en basse résolution réaffiche le curseur par une autre routine ; la démo jouait ses 6 000 images en un instant |
| **Une image par pose du curseur (`0x7D775`)** | **Retenu** : toute présentation d'image commence par là |

`0x7D775` a d'abord été pris pour le masquage du curseur ; la réécriture de la présentation a montré
qu'il le pose au contraire dans l'image, juste avant qu'elle parte à l'écran. Le repère reste le bon.

Deux autres défauts sont apparus en chemin, tous deux trouvés en rejouant deux fois la même partie
*sans rien réécrire* — la première vérification à faire, et la plus instructive :

- **le disque.** La première partie écrit un profil de joueur que la seconde relit ; il faut une
  installation neuve pour chaque exécution ;
- **l'état partagé.** Deux exécutions dans le même processus partagent le module transcrit : la
  seconde héritait des indicateurs du processeur et des remplacements de la première.

**Le garde-fou, trop nerveux.** Il faisait avancer le temps de 1 ms après 50 000 sauts arrière
sans aucun service. En 640x480, un redessin complet de la carte en demande jusqu'à 100 000 : le
garde-fou partait au milieu du dessin, et les interruptions (minuterie, souris) tombaient là. Une
réécriture, plus courte, les faisait tomber ailleurs ; le rejeu divergeait sur un seul octet de la
grille des blocs, à 75 s, sans que la réécriture soit fausse. Le compte des tics entre deux services,
par lieu, a tranché : 140 000 sauts au plus pour un dessin, près de 200 millions pour l'attente
« cliquez pour continuer » (`0x57584`, qui relit le bouton de la souris en boucle). Le seuil est
passé à 2,5 millions de sauts, pour 25 ms ; le vérificateur affiche désormais le nombre de
déclenchements du garde-fou dans chaque exécution, et deux nombres différents désignent l'horloge
plutôt que le code.

**Le menu attend 3 000 images** d'inactivité avant de lancer la démo (compteur `0xD6606`, dans
`0x1107F`). À 30 images par seconde, c'est une centaine de secondes, ce qui est cohérent avec un
486 de l'époque ; l'ancienne horloge la lançait au bout de quatre.

**L'espace logique du jeu est aussi celui de la souris.** En 320x200, le jeu borne le pilote de
souris à 0–638 × 0–398 : les coordonnées reçues du navigateur doivent être doublées sur les deux
axes, pas seulement en largeur.

### 5.4 Vérifier les vérificateurs

La réécriture du rendu, menée par cinq agents en parallèle, a surtout éprouvé les outils de
preuve. Chaque trou trouvé l'a été parce qu'une réécriture juste échouait, ou parce qu'une
réécriture fausse aurait pu passer :

| Trou | Comment il s'est montré | Réparation |
|---|---|---|
| Le rejeu ne relevait, en 640x480, que la banque vidéo courante : un cinquième de l'écran | Relecture de l'hôte, en cherchant pourquoi la présentation échappait au comparateur | L'image complète et la palette sont relevées |
| Ni le rejeu ni le comparateur ne voyaient le tas, où vivent les objets du parc | Le dessin de la carte fait avancer l'enseigne d'une attraction dans son objet : la réécriture repartait d'un texte déjà avancé | Le tas est relevé chaque seconde au rejeu ; `memoire: 'entiere'` et `zones` pour le comparateur |
| Le comparateur ne restaurait pas l'état de l'hôte | Poser le curseur fait avancer l'heure d'une image ; changer de banque déplace la fenêtre vidéo | `Machine.instantane` : l'heure, les entrées, la carte vidéo sont sauvées, restaurées, comparées |
| Le comparateur ne restaurait pas la pile | Deux fonctions consomment leurs arguments en place (un compte, une liste) : la réécriture recevait des arguments épuisés | La pile est restaurée ; celle de l'appelant est comparée |
| Le garde-fou de l'horloge partait au milieu des redessins en 640x480 | Un octet de la grille des blocs différait à 75 s, sans erreur dans la réécriture | Seuil relevé (§ 5.3) |

Un vérificateur se vérifie comme le reste : par une faute volontaire, qu'il doit trouver. Les deux
premières tentatives étaient elles-mêmes fautives, et l'une et l'autre auraient conclu à tort :

- la faute inversait un bit à chaque appel, et un nombre pair d'appels entre deux relevés
  l'effaçait ; une faute cumulative (un octet incrémenté) ne s'efface pas ;
- elle était placée dans une fonction que plus rien n'appelait par son entrée : une réécriture
  appelle les autres réécritures directement, en JavaScript. Elle doit viser une fonction que le
  code transcrit appelle.

Placée correctement, un seul octet du tas modifié, sans effet à l'écran, a été trouvé et désigné
au relevé suivant.

### 5.5 La souris du navigateur

Premier retour de jeu : pendant le tracé des routes, le curseur sautait. Le navigateur donne la
position absolue du pointeur, et l'hôte l'imposait au pilote de souris à chaque mouvement. Or le jeu
suit la souris par écarts entre deux positions, et déplace lui-même le pointeur du pilote : sur la
grille à chaque image pendant un tracé, au centre à l'ouverture et à la fermeture d'un écran plein.
Après chacun de ces déplacements, l'écart suivant — position du navigateur moins position posée par
le jeu — était faux, et le curseur partait. En 640x480, un défaut du gestionnaire d'origine
l'amplifie : il compte deux fois l'écart dès qu'un outil est choisi.

Correction dans l'hôte : le navigateur ne fournit plus que des mouvements, appliqués à partir de la
position du pilote au moment où ils sont livrés, en pas de 4 pixels logiques au plus ; et un recalage
doux ramène le curseur sous la main quand le jeu ne déplace plus le pointeur. Mesuré sur un tracé
scripté en 640x480 : avant, des écarts qui oscillent à chaque image ; après, un curseur qui suit la
grille pendant le tracé et revient sous la main en quelques images.

### 5.6 Les restes de pile

La simulation, réécrite par huit agents en parallèle, a fait tomber une hypothèse des vérificateurs :
que la pile laissée sous le pointeur est morte. Sept des huit modules, prouvés sans divergence par
la comparaison appel par appel, divergeaient au rejeu : à 39,76 s, à 42,86 s, à 124,6 s, à 169 s ou
à 209,92 s selon le module, sur un octet du tas.

La cause est dans le programme d'origine. La mise à jour des objets du parc, `0x21681`, appelle la
routine de chaque objet à la même hauteur de pile ; et l'état 4 des visiteurs, `0x223C1`, lit
l'octet bas de sa variable `[ebp-8]` sans l'avoir écrite quand son mot `+0x20` vaut 1 (il saute
l'écriture en `0x22413`, lit en `0x22572`). Il y trouve ce qu'a laissé la routine appelée juste avant
lui, pour un autre objet : 24 octets sous le point d'entrée (E − 24, puisque `ebp` = E − 16), 255
lectures en 330 s de simulation, 37 valeurs différentes. Une réécriture, qui n'a pas de variables
locales en mémoire et appelle à d'autres hauteurs, y laissait autre chose.

Chaque module a trouvé la cause de son côté, et a pris l'une de deux solutions : laisser à E − 24
l'octet de l'original (celui de sa variable `[ebp-8]`, sinon ce qu'y écrivent ses appels, sinon
l'octet trouvé à l'entrée), ou reproduire tout le cadre d'origine, registres sauvés et variables
comprises. Les deux sont prouvées. Une analyse du flot de toutes les fonctions (écrit avant lu, sur
tous les chemins) en signale 93 qui peuvent lire une variable non écrite ; parmi celles qu'appelle
`0x21681`, `0x223C1` est la seule dont la lecture est avérée.

Les deux vérificateurs voient maintenant ce reste :

- **la comparaison appel par appel** part de la même pile morte pour ses deux exécutions (512
  octets sous le point d'entrée), et compare, pour une fonction appelée par `0x21681`, l'octet que
  relira `0x223C1` ;
- **le rejeu empoisonné** (`verifier.mjs --empoisonner`) brouille, après chaque fonction réécrite,
  les 512 octets qu'elle laisse sous son point d'entrée, sauf cet octet. Si la partie reste
  identique, aucun code ne dépend des autres restes des réécritures.

Éprouvés par une faute volontaire chacun : un octet laissé faux (inversé d'un bit) est signalé à
chaque appel comparé des routines concernées ; un brouillage qui n'épargne pas l'octet fait
diverger la simulation. Les quatorze modules ensemble passent les cinq scénarios, avec et sans
brouillage.

**Un second reste, trouvé par le brouillage lui-même.** La réécriture des fenêtres passait le rejeu
ordinaire, mais pas le rejeu empoisonné : `parc` et `ecrans` divergeaient à 9,06 s. L'écran titre
(`0x1A836`) écrit ses lignes par la routine de texte, puis appelle la liste à choix (`0x576FE`), qui
lit comme sa variable `[ebp-0x14]`, jamais écrite, l'octet bas de l'`ebp` que la routine de texte
avait sauvé seize octets sous son entrée — et la ligne dont le numéro l'égale s'affiche comme
choisie. Dans le jeu d'origine, cet octet est toujours le même et assez grand : l'anomalie ne se
voit pas. La réécriture repose donc, en sortant, les quatre registres que le prologue d'origine
sauvait, et `resteRelu` épargne cet emplacement. C'est le brouillage qui a révélé la dépendance,
là où la comparaison appel par appel et le rejeu ordinaire passaient tous les deux.

**Le même octet, par un second chemin.** Avec les modules de la quatrième vague, `parc` et `ecrans`
divergeaient de nouveau à 9,06 s, mais seulement quand tous les modules étaient réunis : chacun
passait seul, avec ou sans le socle déjà prouvé. Le brouillage tire ses valeurs d'une seule suite
pseudo-aléatoire, partagée par tous les appels : changer l'ensemble des modules change les valeurs
tirées, et la divergence n'apparaissait que pour certaines. Une option `--graine` fait varier la
suite ; restreindre le brouillage à un module, puis à une réécriture, puis à un octet, a désigné
28 octets sous l'entrée du bruitage `0x80C80`. L'écran titre le joue en `0x1AD4A`, juste avant de
rappeler la fiche du joueur `0x576FE` : c'est le même `[ebp-0x14]`, qui tombe là. Sans carte son,
le bruitage n'écrit pas si bas (quatre registres et huit octets de variables) : l'octet traverse
l'appel, dans l'original comme dans la réécriture, et seul le brouillage l'écrasait. `resteRelu`
l'épargne désormais. Avec `--son`, le bruitage appelle le pilote, qui l'écrase : là, la
dépendance reste à traiter.

**Un quatrième reste, sur quatre octets, et sans brouillage.** Un scénario composé pour le son
(`conseiller`) allume le CONSEILLER dans le parc de la démonstration : il divergeait à 64,36 s, cette
fois avec comme sans brouillage, et la bulle du conseiller affichait un autre texte. Chacun seul, les
modules `boucle` et `dessinCarte` divergeaient à 46,86 s, `ecranParc` à 64,36 s ; la comparaison
appel par appel ne voyait rien, puisqu'elle ne compare que les restes qu'elle connaît. Sur le chemin
de la remarque expirée, la barre des messages `0x5CBDB` lit sa variable `[ebp-0x18]` sans l'avoir
écrite ; appelée par la boucle du parc (retour `0x11E98`), celle-ci tombe 40 octets sous son entrée.
La boucle appelle de la même hauteur la vue (`0x13B9A`), la barre de menus (`0x50651`) et la barre
d'outils (`0x4DE1A`, un argument), et ce mot a une histoire : l'`ebx` que le dessin de la carte
`0x1B837` sauve en entrant, que `0x13B9A` avait chargé de la hauteur d'une rangée ; puis, barre de
menus ouverte, l'octet bas du retour du trait, sa variable `[ebp-0x18]` ; puis, quand la barre
d'outils se repeint, sa variable `[ebp-0x14]`, un pointeur vers une autre de ses variables. Les
quatre réécritures appelaient leurs sous-fonctions à la hauteur de leur entrée, sans cadre. Elles
ouvrent maintenant le cadre de l'original, mis en commun dans `moteur/jeu/cadre.js`, et y laissent
les mêmes valeurs ; `resteRelu` rend désormais une plage, ici quatre octets, reconnue à l'adresse
de retour de chacun des quatre appels. Une embûche : la vue appelait le dessin de la carte par
`jeu.appeler`, qui n'empile pas l'adresse de retour de l'original ; le brouillage qui suit le
dessin de la carte n'épargnait donc rien, et le rejeu empoisonné divergeait encore. Elle l'appelle
par `appelerDepuis`, comme l'original. Le scénario `conseiller` (66 s) passe alors, avec et sans
brouillage, graines 1 et 7.

**Un cinquième reste, traité hors de `resteRelu`.** La tonte de l'agent d'entretien (`0x61F81`) ne
calcule pas ses bandes quand le sens de la tonte (mot `+0x61`) dépasse 3 : sa position, sa fin et
son pas sont ce qui traîne 24, 28 et 32 octets sous son entrée. Cela arrive : l'embauche (`0x617E0`)
envoie un agent posé hors de l'herbe tondre une case sans poser ce mot, qui garde ce qu'y avait
laissé l'objet précédent (`longue-faillite`). Ce qui traîne là vient des fonctions de la tonte
appelées juste avant (`0x61BEC`, `0x61CF1`), de `0x18A44` ou de `0x349EB`. Plutôt que d'épargner une
plage au brouillage, les six fonctions de la tonte (`entretien.js`) ouvrent le cadre de l'original et
s'appellent entre elles directement, à la hauteur et avec l'adresse de retour d'origine
(`appelInterne`) : un appel par la table ferait brouiller ce qu'elles y laissent. Réserve : les
réécritures de `0x18A44`, `0x349EB` et `0x617E0` ne laissent pas ce reste, ce que seule la
comparaison appel par appel du module seul voit (guide de réécriture, « Les restes de pile »).

**Un sixième reste, le premier par un autre chemin.** Un scénario composé pour les objets
(`circuit-auto`) divergeait à 124,65 s, avec comme sans brouillage : un visiteur au guichet d'une
attraction passait à l'état 8 au lieu de rester à 4. La bissection désignait séparément le hasard
(`0x18B92`, `simulationOutils`) et le calendrier (`0x12B1F`, `economie`). C'est encore la variable
`[ebp-8]` de l'état 4 des visiteurs, 24 octets sous l'entrée de la routine d'objet ; mais dans ce
parc, aucune routine appelée avant lui dans le passage n'y écrit, et l'octet remonte plus haut : au
calendrier, que la boucle du parc appelle de la même hauteur juste avant `0x21681`. Son dernier appel,
le hasard tiré pour l'usure de l'herbe (`0x139A8`), fait du fond de son cadre (`enter 0x40`), y
pousse `ebx` en entrant, 0x58 octets sous l'entrée du calendrier. Cet `ebx` est la dernière valeur
que le pas y a mise : hors fin de mois, le diviseur du test du mois (`0x3E8`, en `0x133AB`) ; en fin
de mois, la boucle qui range les historiques le recharge en dernier du pointeur des comptes du
joueur (`[0xD3814]`, en `0x13937`, `0xD443C` pour le joueur 0). La réécriture du hasard n'écrivait
rien sur la pile, et celle du calendrier l'appelait à la hauteur de son entrée, avec l'`ebx` de son
appelant. Le calendrier ouvre maintenant le cadre de l'original, pose cet `ebx` et appelle ce hasard
par `appelerDepuis` ; le hasard, appelé par la table, laisse sous son entrée l'`ebx` de son appelant,
et lui seul : il est tiré des millions de fois, et le rejeu empoisonné prouve que ses autres restes
ne comptent pas. `resteRelu` reconnaît les deux appels du calendrier (retours `0x11D25` et `0x1208D`)
et le tirage de l'herbe (`0x139AD`). La leçon rejoint celle du quatrième : un reste relu peut venir
de plus haut que la fonction appelée juste avant, de tout ce que l'appelant a fait à la même
hauteur ; épargner l'octet dans les routines d'objet ne suffisait pas.

### 5.7 Deux fuites d'état : le disque et les drapeaux

La deuxième vague — l'économie, les concurrents, la fin d'année, l'interface — a trouvé deux autres
endroits par où l'état s'échappait des vérificateurs.

**Le disque.** La comparaison appel par appel restaure la mémoire, la pile et l'état de l'hôte,
mais pas les fichiers. La fin de l'année (`0x7401C`) ouvre `save/FN.gy`, échoue, puis le crée : la
réécriture, jouée après la transcription, trouvait le fichier déjà là, rendait un service DOS de
moins, et l'heure de l'hôte différait de 5 µs. `comparer.mjs` remet maintenant le dossier
d'installation dans son état d'avant la première exécution — il dit combien de fois, et combien de
fichiers il a réécrits.

**Les drapeaux du processeur.** Le rejeu d'un scénario composé pour la fin d'année divergeait sur
les deux seuls compteurs de tics, l'écran et le reste étant identiques. L'hôte décidait de livrer
le tic de la minuterie d'après `T.R.IF`, un instantané des drapeaux que la transcription ne
rafraîchit qu'en appelant un service. Or le repère d'image (`0x7D775`) n'est pas un service : une
réécriture, qui sauvegarde ses registres à d'autres moments, faisait voir à l'hôte un IF plus
frais, et le tic partait une image plus tôt. Une ligne dans `Machine.nouvelleImage` — sauver les
registres avant de livrer — supprime la dépendance ; le correctif doit rester là, car sauvegarder
au début de `livrerInterruptions` écrase l'état des appels venus d'un service, et casse la partie.

Deux leçons de méthode, aussi : la comparaison appel par appel **avec une carte son** n'est pas
cohérente avec elle-même (comparée à la transcription elle-même, elle signale des divergences dans
les descripteurs d'échantillon de SOS) — c'est le rejeu `--son` qui fait foi ; et un module en
cours d'écriture qui n'exporte pas encore `reecritures` rend `moteur/jeu/index.js` inimportable,
donc casse les vérifications de tous les autres : un module vide se crée d'abord, et se remplit
ensuite.

### 5.8 Le tas : le curseur et les fichiers lus

Avec les dialogues (l'entrepôt, la question posée au joueur, la vente aux enchères), la comparaison
appel par appel a paru, une fois encore, incohérente avec elle-même : une réécriture « identité »,
qui appelle simplement la transcription, divergeait sur les mêmes appels et les mêmes octets que la
vraie réécriture — `0x79A04` sur `bourse.json` (3 appels sur 184), `0x78E36` et `0x7B73E` sur
`fin-annee.json`. Les octets étaient ceux du pointeur dans la fenêtre vidéo, et ces appels étaient
ceux où la souris bouge : on a d'abord soupçonné l'état de l'hôte (file des événements, minuterie).

Il n'y était pour rien. Un journal des événements de l'hôte pendant chaque exécution (heure,
interruptions, appels du gestionnaire de souris) les montre identiques, à l'instant près ; seul
diffère le compteur de tics, qui mesure le code exécuté. Comparer ensuite toute la mémoire avant et
après la restauration désigne ce qui n'est pas remis : trois sortes de mémoire du **tas**, hors des
zones comparées.

- **Les tampons du curseur.** Le gestionnaire de souris (`0x7D7E2`) garde les pixels que le
  pointeur recouvre dans `[0xDE564]` et `[0xDE554]` (64x64 au plus), et le motif du pointeur est
  dans `[0xDE590]`. La transcription, interrompue par la souris, y écrivait ; la réécriture
  repartait de ces pixels-là et effaçait le curseur avec — d'où les octets du pointeur. Les
  réécritures de la présentation et de la souris déclaraient ces tampons par leur champ `zones` ;
  mais une interruption tombe pendant n'importe quelle fonction.
- **Les banques d'images.** En sortant de l'entrepôt, `0x79A04` recharge la table des images du parc
  et la reloge (`0x10C80`). Le relogement n'est pas idempotent : en 320x200, il double les
  dimensions ; relogée deux fois, la table dessine autre chose.
- **Les fichiers lus.** En sortant, la vente aux enchères remet `data/mblk-0.dat` dans la réserve
  `[0xD3BA0]` : la seconde exécution y trouvait le fichier au lieu des images de la salle.

`zonesComparees` ajoute maintenant, pour toutes les fonctions, les trois tampons du curseur et les
six banques d'images (de la table à sa fin). Et la comparaison note chaque lecture du DOS pendant
un appel, avec les octets qu'elle écrase : entre les deux exécutions, ces octets sont remis (de la
dernière lecture à la première, les zones par-dessus), et la plage lue est comparée — comme le
disque au § 5.7, mais pour ce que le disque dépose en mémoire. La réécriture identité ne diverge
plus, et la vraie non plus : les dialogues passent la comparaison sur les deux scénarios.

La leçon : quand l'identité diverge, chercher d'abord ce qui n'est pas restauré en comparant *toute*
la mémoire (`--memoire-entiere` fait disparaître la divergence, c'est le premier signe), puis
remonter du bloc au pointeur statique qui le désigne. Les hypothèses sur l'hôte étaient fausses.

### 5.9 Les registres d'int386x

**25 septembre 2026.** L'hôte rend lui-même le cœur d'`int386x` (`0x89F90`) : il pose les registres
du service, `eax` à `edi`, `es` et `ds`, depuis la structure d'entrée, puis appelle
`Machine.interruption`. Mais il les posait dans `T.R` sans les recharger dans la transcription
(`T.charger()`). Or le service commence par livrer les interruptions en attente ; si un tic de la
minuterie ou un événement de la souris partait, `appelerGestionnaire` relevait les registres
vivants de la transcription (`T.sauver()`), qui écrasaient ceux de la structure, et les rendait
ensuite au service. Celui-ci travaillait donc sur les registres du code au moment de l'appel du
cœur : depuis `int386` (`0x7F085`), `eax` y est l'adresse des SREGS, `esi` le numéro de
l'interruption, `edi` l'entrée, `edx` la sortie. Ainsi l'int 33h fonctions 7 et 8, la plage du
pointeur (appelées depuis `0x11384` et `0x113B9`), recevait `ax = 0x2220`, ne la reconnaissait pas
et rendait `0xE2220` : six fois en 150 s sur `construction`. La réécriture d'`int386` reproduisait
le défaut, `eax` compris (commit `eed402e`) ; celles qui appellent `0x816B5` directement
(l'installation de la souris `0x7DF44`, les informations du mode VESA) auraient pu diverger.

Correction : l'hôte recharge les registres du service avant de le rendre. Seuls `ebp` et `esp`
restent ceux du code, et c'est ce que voit un gestionnaire livré pendant le service. La pose
d'`eax` dans la réécriture d'`int386` est retirée, devenue sans effet. Les autres chemins qui
rendent un service ont été relus : l'instruction `int` transcrite, `servir` (`runtime.js`) et les
enveloppes des réécritures rechargent déjà leurs registres ; l'interruption en mode réel (DPMI
`0300h`) travaille sur une structure à part, après la livraison ; aucun service ne livre
d'interruption après avoir modifié `R`.

**L'effet, mesuré.** Chaque scénario joué par la transcription seule, avec l'ancien et le nouvel
hôte : sur les quarante-six, les services int 33h mal reçus (ax = `0x2220`, `0x2184`, `0x2154`,
`0x2150`, `0x2260`, `0x21DC`, `0x1EE8`…, jusqu'à 17 par partie) disparaissent tous ; les fonctions
appelées et leurs nombres d'appels sont les mêmes ; la mémoire finale est identique octet pour octet
dans quarante-quatre, et ne diffère dans `ecrans` et `monorail-visiteurs` que de quelques octets de
pile morte (la structure de sortie, où traînait l'adresse des SREGS). La plage refusée était déjà
celle que le jeu avait posée juste avant : le défaut ne se voyait pas. Les scénarios atteignent ce
qu'ils visent comme avant. Le rejeu empoisonné de toutes les réécritures reste IDENTIQUE sur les
quarante-six.

(Reste inconnue, et sans rapport : la fonction `2Fh` de l'int 33h, que le jeu appelle deux fois ou
plus par partie.)

---

## 6. Le son

Dates : 21 septembre 2026. La consigne : que le son tourne dans le navigateur, par le moteur, sans
émulateur ni lecteur extérieur.

### 6.1 À quel niveau remplacer les pilotes

Le jeu passe par la bibliothèque HMI SOS. Première lecture : `HMIMDRV.386`, le fichier des pilotes de
musique, ne pèse que 2 617 octets et ne contient que quatre pilotes (Sound Master II, MPU-401,
MT-32, haut-parleur du PC) ; le pilote FM, celui des Sound Blaster, est donc **compilé dans
`MAIN.EXE`**, et transcrit comme le reste. Il écrit la puce par des `out` sur les ports 0x388 et
0x389 : il suffit d'émuler la puce, et toute la musique (séquenceur, instruments, allocation des
voix) est le code d'origine.

Les bruitages passent au contraire par deux modules chargés depuis `HMIDRV.386` et appelés par leur
adresse : du code que la transcription n'a jamais vu. Trois niveaux de remplacement possibles :

| Niveau | Verdict |
|---|---|
| Émuler la Sound Blaster (ports, DMA) sous le code des modules | impossible sans exécuter ce code, donc sans émulateur de processeur |
| Remplacer les fonctions publiques de SOS (`sosDIGIStartSample`...) | écarte du code transcrit du jeu, et il faut en recréer l'état interne |
| **Remplacer les deux modules** | retenu : SOS reste le code d'origine, l'hôte ne remplace que ce qui était hors du programme |

Le second point a décidé : `sosDIGIStartSample` ne parle même pas au module, il remplit l'un des 32
descripteurs d'échantillon que le module a fournis et consomme à chaque remplissage. Remplacer le
module revient à lire ces descripteurs.

### 6.2 La détection de la carte

Premier essai, avec `BF_SOUND` et `BF_MUSIC` déclarées : le jeu ouvre `hmidet.386`, les pilotes de
détection. L'octet `[0xBA722]` vaut 1 dans les données initiales : le jeu fait sonder le matériel
pour trouver port, IRQ et DMA, par-dessus la configuration. L'option `-o` de la ligne de commande
l'annule (`0x10303`) ; l'hôte la passe, plutôt que d'imiter aussi les pilotes de détection.

### 6.3 « Memory Allocation Failure »

Deuxième essai : `Error : Memory Allocation Failure` au chargement du pilote. Le gestionnaire mémoire
du jeu (`0x82950`) prend au démarrage toute la mémoire, étendue et conventionnelle, puis rend un bloc
conventionnel de 64 000 octets. Les `malloc` suivants passent donc par le repli de la bibliothèque C
(`0x90151`) : `int 21h/48h`, que DOS/4GW sert en mémoire conventionnelle. L'hôte servait `48h` en
mémoire étendue, déjà prise, et ignorait la libération DPMI `0101` : **tout `malloc` après le
démarrage échouait**, avec ou sans son.

L'effet était passé inaperçu : c'est pour cela que la console du jeu sortait caractère par
caractère (le tampon de `stdout` n'avait jamais été alloué) et que `fopen("sndsetup.inf")` échouait
avant même de chercher le fichier. L'hôte gère maintenant la mémoire conventionnelle par blocs, qui
se libèrent, et sert `48h` dedans. Les trois rejeux comparés restent identiques.

### 6.4 Le temps du son

Le son est rendu en temps virtuel, jusqu'à la date de chaque événement. Deux défauts corrigés en
route :

- **Le rythme.** L'hôte livre d'un coup, en fin d'image, les tics de minuterie échus pendant le
  dessin, et c'est pendant ces tics que le séquenceur joue ses notes : datées de l'heure courante,
  elles seraient tombées par paquets, toutes les 33 ms. Datées de l'heure nominale de leur tic, les
  intervalles relevés entre notes sont des multiples exacts de la période de la minuterie
  (240 Hz) : 38, 43, 42, 14, 27 tics.
- **Le départ des bruitages.** Rendus en même temps que la puce, les bruitages commençaient au
  dernier rendu avant leur lancement, donc à un instant qui dépendait de qui demandait le son : le
  lanceur Node et un second outil donnaient deux WAV différents dès le premier clic, à 6,5 s. Les
  bruitages ne sont plus mélangés qu'aux tics de remplissage, comme le faisait le module d'origine ;
  la puce attend ce tic dans un tampon. Les deux WAV de 140 s sont maintenant identiques à l'octet
  près.

### 6.5 Vérifier avec le son

Le rejeu comparé, avec `--son`, divergeait à 9,16 s dans les variables, puis ne trouvait aucun octet
différent en rejouant : le rejeu de diagnostic repartait sans son. Corrigé, il désigne deux octets
en `0xC370E` et un mot en `0xC46FE`. Le gestionnaire d'interruption de SOS (`0x8A369`) range en
`0xC370E` le pointeur de pile du code interrompu et bascule sur une pile privée, qui monte jusqu'à
`0xC4716`. Comme la pile du jeu, elle garde des valeurs qui dépendent de l'endroit où tombe
l'interruption, donc de la façon dont le code est écrit : elle est exclue des relevés. Avec le son,
les trois scénarios restent identiques, les six modules réécrits ensemble.

### 6.6 Les niveaux

Au volume plein, les morceaux culminent à 0,86 (`RIDE4`), les bruitages à 1,0. Un premier gain de
1,6 sur la puce faisait saturer une musique sur quatre à l'export ; il est ramené à 1,0, les
bruitages à 0,6. Dans la démonstration, la musique d'une attraction ne dépasse pas 0,03, dix fois
moins que le même morceau lancé à l'écran titre : ce qui l'abaisse n'est pas établi. Les musiques
exportées par `musiques.mjs` sont, elles, ramenées à une crête de −1 dB.

### 6.7 La comparaison appel par appel avec le son

Dates : 25 septembre 2026, la septième vague, qui a réécrit la bibliothèque de son (`son-du-jeu.js`,
`sos-pilotes.js`, `sos-bruitages.js`, `sos-musique.js`). Le guide tenait jusque-là qu'avec `--son`
la comparaison appel par appel n'était pas cohérente avec elle-même, et que seul le rejeu faisait
foi. Les quatre modules, écrits en parallèle, ont chacun buté sur des centaines de divergences, toutes
entre `0xC45xx` et `0xC46xx`, puis trouvé les trois causes :

- **le pointeur de pile au moment de l'interruption.** Le gestionnaire de SOS (`0x8A369`) range en
  `[0xC370E]` le pointeur de pile du code interrompu : une réécriture qui appelle un service (port,
  interruption) à une autre hauteur que l'original y laisse une autre valeur ;
- **les registres empilés sur la pile privée.** Le répartiteur (`0x8280A`) y pousse `ebx`, `esi`,
  `edi` et `ebp` du code interrompu, et les routines appelées pendant l'interruption (la musique
  entière, les montées de volume, le séquenceur) y laissent leurs cadres. Le rejeu exclut cette pile
  de ses relevés (§ 6.5), mais la comparaison la relève comme une variable ;
- **les descripteurs d'échantillon**, dans le tas du module de mélange, hors des zones que la
  comparaison remet entre ses deux exécutions.

Les réécritures appellent donc les services à la hauteur de l'original, ouvrent son cadre et y
laissent exactement ce qu'il laissait — variables, registres sauvés, adresses de retour d'origine
(`Cadre`, `appelerDepuis`) — et déclarent les descripteurs (`zones`). Un comparateur de contrôle qui
ignorait la pile privée donnait déjà 0 divergence : les réécritures étaient justes, seuls leurs
restes différaient. Avec ces précautions, la comparaison appel par appel donne 0 divergence, sans
échantillonnage, sur `son`, `films`, `musique-negociations`, `demo`, `negociations`, `horza-objets`
et `quitter` rejoués avec la carte son, et les écritures datées de la puce FM (9 672) et les
échantillons de sortie sont identiques avec et sans les modules. La leçon : une comparaison
« incohérente avec elle-même » l'est rarement ; elle relève un état que l'on ne remet pas, ou que
les réécritures laissent autrement.
