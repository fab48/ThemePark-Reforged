# Guide de réécriture

Comment réécrire une fonction du jeu en JavaScript lisible, et prouver que la réécriture fait
exactement ce que faisait l'original. À lire avec [architecture.md](architecture.md).

---

## Le principe

Le jeu tourne à partir de sa transcription mécanique (`travail/transcrit/jeu.js`, générée, jamais
modifiée à la main). Une fonction réécrite, dans `moteur/jeu/`, remplace sa transcription à
l'exécution. L'état du jeu reste dans la mémoire d'origine, aux adresses de 1994 : code réécrit et
code transcrit voient les mêmes variables, et l'on peut réécrire dans n'importe quel ordre.

Une réécriture n'est acceptée que **prouvée identique** par les deux vérificateurs.

---

## Écrire

**Un module par sujet**, dans `moteur/jeu/`, qui exporte sa liste :

```js
export const reecritures = [
  { adresse: 0x183EC, nom: 'defilerCarte', fn: (jeu, direction) => defilerCarte(jeu, direction), arguments: 1 },
];
```

| Champ | Sens |
|---|---|
| `adresse` | adresse de la fonction d'origine |
| `nom` | nom de la réécriture |
| `fn` | la fonction : `(jeu, ...arguments)` en convention pile, `(jeu, R)` en convention registres |
| `arguments` | nombre d'arguments empilés (convention pile) |
| `retour` | `true` si la fonction rend une valeur dans `eax` |
| `convention` | `'registres'` pour les routines assembleur qui reçoivent leurs paramètres dans les registres |
| `nettoie` | octets d'arguments retirés par un `ret N` (rare) |
| `registresCompares` | registres que l'appelant relit après l'appel (par défaut `ebx`, `esi`, `edi`, `ebp`, `esp`) |
| `zones` | `(jeu, ...arguments) => [[début, fin], …]` : ce que la fonction écrit hors des zones comparées par défaut (la destination d'une copie, un tampon du tas) |
| `memoire` | `'entiere'` : la comparaison appel par appel restaure et compare toute la mémoire, tas compris ; pour une fonction qui écrit dans les objets du parc sans qu'on sache d'avance où. Lent : à réserver aux fonctions appelées au plus quelques milliers de fois |

Une fonction qui n'est **jamais appelée** par les scénarios de vérification ne peut pas être prouvée :
elle va dans `export const enAttente = [...]`, même forme, **non active**, jusqu'à ce qu'un scénario
l'exerce.

**Le contexte `jeu`** passé à chaque fonction :

| Élément | Usage |
|---|---|
| `jeu.m8` | la mémoire, octet par octet (`Uint8Array`) |
| `jeu.dv` | la même, par mots (`DataView`, petit-boutiste : `jeu.dv.getInt16(a, true)`) |
| `jeu.etat` | les variables nommées de `moteur/jeu/etat.js` |
| `jeu.appeler(0x…, a, b…)` | appelle une autre fonction du jeu, réécrite ou non ; rend `eax` |

**Toujours passer par `jeu.appeler`** pour une fonction d'un autre module ou non réécrite : c'est ce
qui garantit que la bonne version s'exécute, et que l'hôte voit les appels qu'il surveille — le
pose du curseur `0x7D775`, par exemple, cadence l'horloge du jeu.

### Style

- Français, noms explicites, commentaires qui disent **pourquoi** et comment marche le jeu, pas la
  syntaxe. Chaque fonction porte en tête son adresse d'origine : `// 0x209B5 — dessiner un objet`.
- Chaque constante vient du programme de 1994. Ce qui n'est pas établi est écrit « non établi ».
- Fidélité **bogue pour bogue** : une réécriture ne corrige rien. Une anomalie repérée est
  reproduite et signalée en commentaire ; la corriger sera une décision séparée.
- Le jeu calcule souvent sur 16 bits signés (`movsx`, `cmp word`) : `const s16 = (v) => (v << 16) >> 16`.
  Division entière tronquée vers zéro : `(a / b) | 0`. Décalage arithmétique : `>>`.
- Les calculs morts du compilateur (valeurs écrites puis jamais relues) ne se transcrivent pas.

---

## Prouver

**Comparaison appel par appel** — désigne la fonction fautive et l'octet qui diffère :

```bash
node moteur/node/comparer.mjs --modules carte,defilerCarte [--echantillon 10]
```

À chaque appel : exécution de la transcription, relevé de l'état, restauration, exécution de la
réécriture, comparaison. Le dossier d'installation (profil, sauvegardes) est remis lui aussi dans
son état de départ : sans cela, un fichier créé par la transcription ferait prendre un autre chemin
à la réécriture. L'état, c'est :

- la mémoire du jeu : ses variables, la fenêtre vidéo `0xA0000`, la zone de données du BIOS, la
  surface de dessin et le tampon de fond, plus les `zones` que la réécriture déclare ; toute la
  mémoire en usage, tas compris, avec `memoire: 'entiere'` ou l'option `--memoire-entiere` ;
- pour toutes les fonctions, trois morceaux du tas que n'importe quel appel peut toucher sans le
  savoir : les tampons du curseur (`[0xDE564]`, `[0xDE554]`, `[0xDE590]`), qu'écrit le gestionnaire
  de souris à chaque interruption ; les six banques d'images, de la table à sa fin, dont le
  relogement n'est pas idempotent ; et chaque plage lue d'un fichier (int 21h, `3Fh`) pendant
  l'appel, dont les octets écrasés sont remis avant la seconde exécution puis comparés — les
  lectures dans la pile exceptées (journal des essais, § 5.8) ;
- les registres que l'appelant relit ;
- l'état de l'hôte (`Machine.instantane`) : l'heure — une fonction qui présente une image la fait
  avancer —, la minuterie, les files d'entrées, celles du scénario comprises, la mémoire allouée,
  les fichiers ouverts, et la carte vidéo : banque, image complète en 640x480, palette.

Il faut **0 divergence**. L'outil signale aussi les fonctions jamais appelées : elles ne sont pas
vérifiées. Sans `--modules`, il compare tous les modules de `MODULES` (`moteur/jeu/index.js`) :
avec `--echantillon`, c'est la vérification de non-régression du comparateur lui-même. Un module
entier en appel par appel peut être impraticable — `systeme` fait environ 200 000 appels à `outp` et
800 000 à `poserUnPixel`, chacun copiant près de 3 Mo — : séparer alors les fonctions chaudes, à
comparer en `--echantillon 20` ou `200`, des autres, à comparer entières.

**Rejeu comparé** — la preuve d'ensemble :

```bash
node moteur/node/verifier.mjs --duree 140 --script moteur/scenarios/demo.json --modules carte
```

La même partie est jouée avec et sans la réécriture. Toutes les 100 ms virtuelles, on relève
l'image affichée (l'image complète en 640x480, et la palette) et les variables du jeu ; chaque
seconde, le reste de la mémoire, tas compris. Il faut **IDENTIQUE**. En cas de divergence, les deux parties sont
rejouées jusqu'au relevé fautif et les octets qui diffèrent sont listés, avec le nom de la variable
quand `etat.js` le connaît. Chaque exécution affiche aussi le nombre de déclenchements du garde-fou
de l'horloge : s'ils diffèrent, soupçonner l'horloge avant le code (journal des essais, § 5.3).

**Toujours passer `--modules`** : sans lui, le vérificateur active toutes les réécritures du dépôt.

**Avec une carte son** (`--son`), les deux vérificateurs font foi, à trois conditions pour les
fonctions qui tournent pendant l'interruption de SOS (rétro-ingénierie, § 9.7 ; journal des essais,
§ 6.7) :

- **la hauteur de pile** : le gestionnaire de SOS (`0x8A369`) range en `[0xC370E]` le pointeur de pile
  du code interrompu ; chaque service (port, interruption) doit donc partir de la même hauteur que
  dans l'original ;
- **la pile privée de SOS** : le répartiteur (`0x8280A`) y empile `ebx`, `esi`, `edi` et `ebp` du
  code interrompu, et la comparaison la relève comme une variable ; il faut les mêmes registres à
  chaque service, et une routine appelée sur cette pile y laisse tout le cadre de l'original,
  variables, registres sauvés et adresses de retour compris (`Cadre`, `appelerDepuis`) ;
- **les descripteurs d'échantillon**, dans le tas du module de mélange (à `+0x100` de `[0xC3238]`),
  hors des zones relevées : les fonctions qui les écrivent les déclarent en `zones`.

Le rejeu, lui, exclut la pile privée de ses relevés.

**Un module en cours s'importe par son espace de noms.** `moteur/jeu/index.js` importe tous les
modules : un fichier en cours d'écriture qui n'exporte pas encore `reecritures` casserait, importé
par son nom, les vérifications de tout le monde. On l'importe donc en `import * as x from './x.js'`
et on le range dans `EN_COURS` par `x.reecritures ?? []` : un module inachevé n'empêche plus le
moteur de se charger, il n'est pas installé par défaut, et les vérificateurs le désignent par
`--modules`. Prouvé, il passe dans `MODULES` avec un import nommé. C'est ainsi que les huit modules
de la sixième vague, puis les quatre du son de la septième, ont été écrits en parallèle ; `EN_COURS`
est vide depuis.

**Les restes de pile.** Ce qu'une fonction laisse sous son point d'entrée est en principe mort,
mais six lectures de reste sont connues dans le programme d'origine (journal des essais, § 5.6 ;
rétro-ingénierie, § 10.1) ;
`resteRelu`, dans `moteur/jeu/index.js`, dit pour chaque appel la plage d'octets qu'il faut y
laisser comme l'original :

- une fonction appelée par la mise à jour des objets du parc (`0x21681`) doit laisser, 24 octets
  sous son point d'entrée (20 pour une fonction à deux arguments), l'octet que l'original y
  laissait : l'état 4 des visiteurs (`0x223C1`) le relit. C'est celui de sa variable `[ebp-8]` si
  elle en a une, sinon ce qu'y écrivent ses propres appels, sinon l'octet trouvé à l'entrée ;
- la routine de texte `0x3F49E`, appelée par l'écran titre juste avant la fiche du joueur
  (`0x576FE`), laisse 16 octets sous son entrée l'`ebp` qu'elle a sauvé : la fiche du joueur le
  relit comme sa variable `[ebp-0x14]`, la ligne choisie. La réécriture repose, en sortant, les
  registres que le prologue d'origine sauvait ;
- le même octet par un second chemin : 28 octets sous l'entrée du bruitage `0x80C80`, que l'écran
  titre joue en `0x1AD4A` avant de rappeler la fiche du joueur. Sans carte son, le bruitage n'écrit
  pas si bas, et l'octet traverse l'appel intact, dans l'original comme dans la réécriture ; avec
  `--son`, le pilote l'écrase, et cette dépendance-là reste à traiter ;
- la barre des messages (`0x5CBDB`), appelée par la boucle du parc (retour `0x11E98`), relit sur
  le chemin de la remarque expirée (le CONSEILLER allumé) sa variable `[ebp-0x18]`, jamais écrite :
  le mot 40 octets sous son entrée, que les appels précédents de la boucle, faits de la même
  hauteur, y ont laissé. Dans l'original, c'est l'`ebx` que `0x1B837` sauve en entrant (4 octets
  sous son entrée, appelée par `0x13B9A` qui l'a chargé de la hauteur d'une rangée), puis l'octet
  bas du retour du trait de la barre de menus (`0x50651`, sa `[ebp-0x18]`), puis l'adresse d'une
  variable de la barre d'outils (`0x4DE1A`, sa `[ebp-0x14]`, 36 octets sous son entrée : elle a un
  argument). Ces quatre réécritures ouvrent le cadre de l'original (`moteur/jeu/cadre.js`) et y
  laissent les mêmes valeurs ; `0x13B9A` appelle `0x1B837` par `appelerDepuis`, avec l'adresse de
  retour de l'original, à laquelle `resteRelu` reconnaît l'appel. Celui-ci diverge sans brouillage ;
- l'état 4 des visiteurs, encore, quand aucune routine d'objet appelée avant lui n'a écrit l'octet
  qu'il relit : il vient alors du calendrier (`0x12B1F`), que la boucle du parc appelle de la même
  hauteur juste avant la mise à jour des objets, 0x58 octets sous son entrée. C'est l'`ebx` que le
  hasard (`0x18B92`) sauve en entrant, 4 octets sous la sienne, au dernier appel du pas, le tirage
  de l'usure de l'herbe (`0x139A8`) : le diviseur du test du mois, `0x3E8`, ou, en fin de mois, le
  pointeur des comptes du joueur (`[0xD3814]`). Le calendrier ouvre le cadre de l'original, pose
  cet `ebx` et appelle ce hasard par `appelerDepuis` ; le hasard, appelé par la table, laisse
  l'`ebx` de son appelant sous son entrée. Celui-ci diverge aussi sans brouillage ;
- hors de `resteRelu`, la tonte de l'agent d'entretien (`0x61F81`), quand l'embauche (`0x617E0`) n'a pas posé le sens de
  la tonte : elle prend alors pour position, fin et pas ce qui traîne 24, 28 et 32 octets sous son
  entrée, laissé par `0x61BEC`, `0x18A44`, `0x61CF1` ou `0x349EB`. Les six fonctions de la tonte
  (`entretien.js`) ouvrent le cadre de l'original et s'appellent entre elles directement
  (`appelInterne`) — un appel par la table ferait brouiller ces octets par le vérificateur —, les
  fonctions externes par `appelerDepuis`, avec l'adresse de retour d'origine. **Réserve** : les
  réécritures de `0x18A44`, `0x349EB` et `0x617E0` ne laissent pas ce reste ; seule la comparaison
  appel par appel du module seul le voit, le rejeu de `longue-faillite` ne le distinguant pas.

La comparaison appel par appel vérifie ces octets d'elle-même, à condition que l'appel se
reconnaisse à son adresse de retour : une réécriture qui appelle par `jeu.appeler` n'empile pas
celle de l'original. Le rejeu avec `--empoisonner`, qui brouille tous les autres restes laissés
par les réécritures, prouve que rien d'autre n'y est lu. À passer pour toute réécriture.

Une variable locale jamais écrite **dans son propre cadre** est un reste du même genre : la
fin de partie (`0x5C7D1`), l'évaluation de la voie du monorail (`0x44439`), le panneau indicateur
(`0x2B62F`), la carte du parc et « démolir ? » en lisent. La réécriture ouvre alors le cadre de
l'original (`Cadre`, `dansLeCadre`, `moteur/jeu/cadre.js`), y appelle ses sous-fonctions à la même
hauteur, et relit le même emplacement.

**La leçon du troisième cas.** Le brouillage tire ses valeurs d'**une seule suite**
pseudo-aléatoire, partagée par tous les appels : changer l'ensemble des modules installés change les
valeurs tirées à chaque endroit. Une divergence qui n'apparaît qu'avec un certain ensemble de
modules, alors que chacun passe seul, peut donc dépendre de la valeur tirée plutôt que d'un défaut
de l'ensemble. `verifier.mjs --empoisonner --graine N` fait varier la suite : une réécriture juste
doit passer quelle que soit la graine. Pour isoler la réécriture et l'octet en cause, on restreint le
brouillage — à un module (`--modules`), puis, le temps de l'enquête, à une seule réécriture et à une
plage d'octets sous son entrée (dans `empoisonnee`, `moteur/jeu/index.js`) — jusqu'à trouver l'octet
dont le brouillage fait diverger la partie ; puis on cherche dans le désassemblage qui le lit.

Quarante-six scénarios, décrits dans `moteur/scenarios/LISEZMOI.md`, avec leur durée : `demo`
(140 s, le scénario par défaut), `parc` (84), `ecrans` (105), `simulation` (330), `fin-annee` (340),
`feux` (60), `construction` (150), `gestion` (100), `bourse` (70), `menus` (75), `travaux` (80),
`triche` (80), `menu-joueur` (60), `trace-haute` (70), `murs-rails` (100), `graphique` (90),
`recherches` (125), `entrepot` (75), `tutoriel` (185), `tutoriel-haute` (257), `catalogues` (120),
`quitter` (135), puis, composés pour les fonctions jamais appelées, `voyous-arrestation` (200),
`voyous-vandale` (200), `entretien` (60), `horza-objets` (400), `ecrans-pleins` (60),
`negociations` (188), `outils-basse` (251), `outils-haute` (316), `longue-faillite` (300),
`longue-simulation` (350), `longue-nouveautes` (140), `conseiller` (66), puis, pour la septième
vague, `circuit-auto` (303), `monorail-visiteurs` (296), `titre` (85), `titre-demo` (150),
`titre-intro` (12), et quatre scénarios à ligne de commande, `ligne-n-clavier` (30),
`ligne-n-souris` (30), `ligne-n1` (15) et `ligne-p` (5). Trois sont composés avec une carte son et
rejoués avec `--son` : `son` (154), `films` (318) et `musique-negociations` (188). Ils couvrent
l'écran titre dans tous ses chemins et la fiche du joueur, la carte du monde, la ligne de commande,
le parc en basse et en haute résolution, huit mois puis plusieurs années de simulation, la fin de
l'année, la faillite, la construction et les outils de pose, les écrans de gestion, les menus, les
recherches, l'entrepôt, le tutoriel, les catalogues, les voyous, l'agent d'entretien, les
négociations et la grève, les explosions, le monorail et le circuit auto, la musique, les bruitages
et les films des attractions, et la sortie du jeu. `travail/verifier-tout.ps1` les enchaîne, chacun
avec sa durée et ses options. Une réécriture doit les passer tous :

```bash
node moteur/node/verifier.mjs --empoisonner --modules monModule --script moteur/scenarios/parc.json --duree 84
```

Les 756 réécritures des 55 modules, installées ensemble, sont IDENTIQUES sur les quarante-six au
rejeu empoisonné (90,0 % des instructions du programme, `python outils/avancement.py`). Une fonction qu'aucun ne sollicite attend en `enAttente` qu'un scénario l'exerce : les
nouveaux scénarios s'écrivent avec le compositeur (`moteur/scenarios/LISEZMOI.md`, « Composer un
scénario »), et `trace-haute`, `murs-rails`, `menu-joueur`, `graphique`, `recherches`, `entrepot`,
`tutoriel` et `catalogues` sont nés ainsi, pour des branches qu'aucun autre n'atteignait. Une
fonction qui ne rend la main qu'en fin de partie se prouve par un scénario qui y va : `quitter`
laisse tourner la démonstration, l'arrête et quitte, pour comparer la boucle du parc (`0x11C45`)
d'un seul appel.

**Un scénario peut aussi lancer le jeu autrement** : c'est alors un objet `{ ligneCommande,
fichiers, evenements }`, les options du jeu et des fichiers déposés dans l'installation neuve, que
`lireScenario` (`moteur/node/partie.mjs`) lit pour `verifier.mjs`, `comparer.mjs`, `couverture.mjs`
et le compositeur (`moteur/scenarios/LISEZMOI.md`, « Scénario en liste, scénario en objet »).

**Un nouveau scénario peut révéler un bogue dans un module déjà prouvé.** La preuve ne vaut que pour
les chemins exercés. La file des événements (`0x2CCF8`, `evenements.js`) était prouvée sur seize
scénarios ; aucun ne postait les événements `0x3A` à `0x3E`, et la réécriture en décalait trois
d'un cran dans la table `0x2CD30` (RECOMMENCER, la mise à prix d'une vente aux enchères, `0x7C128`).
Le scénario `recherches`, composé pour un autre module, a cliqué RECOMMENCER et fait diverger la
partie. Quand une réécriture aiguille sur une table, relire chaque cas contre le désassemblage,
même prouvé ; et relancer tous les modules sur chaque nouveau scénario, pas seulement celui pour
lequel il a été écrit.

**Viser les fonctions jamais appelées trouve des bogues dans les modules prouvés.** Les compositeurs
de scénarios ont visé la liste des fonctions qu'aucun scénario n'appelait — en dernier lieu, par
thèmes : objets, écrans, outils, son, parties longues. Chemin faisant, ils ont trouvé trois bogues
dans des modules déjà prouvés jusqu'à la sixième vague, chacun resté invisible faute d'un chemin qui l'exerce : les
événements `0x3A` à `0x3E` décalés dans la table de la file des événements (ci-dessus,
`recherches`) ; l'octet `+0x84` au lieu de `+0xB4`, le genre de voie, pour
rallumer le bouton d'achat du catalogue des attractions (`0x360C5`, `ecrans-gestion.js`), que le
catalogue de la démonstration masquait et qu'une nouvelle partie HORZA avec CHÂTEAU MOU a fait
diverger (`horza-objets`) ; et le quatrième reste de pile, que seul le CONSEILLER allumé fait relire
(`conseiller`). La septième vague en a trouvé deux autres : le sixième reste de pile, par le
calendrier, que seul un parc où aucune routine d'objet n'écrit l'octet fait relire (`circuit-auto`) ;
et, avec `-m2`, un test inversé dans `evenements.js` — l'original revient à un joueur quand `0x493BE`
rend une valeur non nulle, la réécriture le faisait quand elle rendait 0 —, invisible tant qu'aucun
scénario ne passait l'option (le scénario n'a pas pu être gardé : l'hôte ne sait pas finir l'attente
d'une touche qui suit). Une preuve ne vaut que pour les chemins parcourus : chaque scénario qui atteint du
code neuf éprouve aussi, sur des chemins neufs, tous les modules qui l'appellent.

**Quand la comparaison diverge sans raison, brancher une réécriture « identité ».** Une réécriture
qui appelle simplement la transcription (huit octets plus bas dans la pile, ou à la même hauteur)
ne peut pas être fausse : si elle diverge sur les mêmes appels et les mêmes octets que la vraie,
c'est le comparateur qui ne remet pas tout entre ses deux exécutions, et la vraie réécriture est
hors de cause. C'est ainsi qu'ont été trouvés les tampons du curseur, les banques d'images et les
fichiers lus que le comparateur remet désormais (ci-dessus), puis les lectures d'en-têtes de fichier
dans la pile morte (`0x5F550`, `0x5F63F`, `0x1180E`, `0x1B6A8`), qu'il ignore. En attendant la
réparation, le rejeu empoisonné reste la preuve : il ne dépend pas de la restauration.

### Ce que les vérificateurs ignorent, et pourquoi

- **La pile.** Registres et variables locales laissés sous le pointeur de pile, et emplacements de
  variables locales jamais initialisées, diffèrent légitimement.
- **`eax`, `ecx`, `edx`** après une fonction de convention pile qui ne rend rien : la convention de
  Watcom ne les préserve pas, la transcription les laisse dans n'importe quel état.
- **Le travail écoulé depuis le dernier service** (`ticsSansTemps`), et les déclenchements du
  garde-fou de l'horloge : ils mesurent la quantité de code exécuté, qui diffère par nature entre
  une transcription et une réécriture ; si le garde-fou partait, cela se verrait sur l'heure.
- **Une réécriture appelée par une autre réécriture** l'est directement, en JavaScript, sans passer
  par son entrée : au rejeu, seule compte l'entrée que le code transcrit appelle. Pour éprouver un
  vérificateur par une faute volontaire, la placer dans une fonction que la transcription appelle.
  Conséquence à la comparaison : avec `--echantillon N`, les appels non comparés de l'appelante
  exécutent la réécriture, qui appelle l'appelée sans passer par son entrée — celle-ci peut alors
  paraître « jamais appelée ». La comparer à `--echantillon 1`, ou sur un scénario où un autre
  appelant la sollicite.

---

## Analyser

| Outil | Usage |
|---|---|
| `python outils/voir.py 1b837:120` | désassemblage, relocations marquées `R->` |
| `python outils/variable.py d6652:2` | tout ce qui lit et écrit une variable |
| `python outils/arbre.py 1b837` | arbre d'appels ; `--appelants ADR` pour les appelants |
| `python outils/avancement.py` | où en est la réécriture : fonctions et instructions prouvées, par module |
| Ghidra, `MAIN_decompiled.c` | pseudo-C utile pour lire, faux sur les paramètres (il suppose `__stdcall`) |
| `travail/transcrit/jeu.js` | la transcription de la fonction, ligne à ligne avec l'instruction d'origine |
