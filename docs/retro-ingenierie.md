# Rétro-ingénierie du moteur d'origine

État des connaissances sur `MAIN.EXE` (Theme Park CD, 14 juin 1994, 841 223 octets). Ce document
sert de base au document de conception et à la réécriture. Tout ce qui est écrit ici a été établi
par lecture du code décompilé ou du désassemblage, et vérifié en jeu quand c'est indiqué.

---

## 1. Outillage

| Élément | Emplacement |
|---|---|
| Ghidra 12.0.1 + extension de chargement des exécutables LE | `C:\Tools\ghidra_12.0.1_PUBLIC` |
| Projet Ghidra du jeu | `C:\Tools\ghidra_projects\ThemePark.gpr` |
| Export C complet, 65 000 lignes, 1 116 fonctions | `C:\Tools\ghidra_projects\MAIN_decompiled.c` |
| DOSBox-X avec débogueur | `C:\Tools\dosbox-x` |

Régénérer l'export après avoir nommé des fonctions :

```bash
analyzeHeadless C:\Tools\ghidra_projects ThemePark -process MAIN.EXE -scriptPath C:\Tools\ghidra_scripts -postScript ExportC.java sortie.c
```

Scripts d'analyse du projet, dans `outils/` : `disasm2.py` désassemble une plage d'adresses,
`cherche_appels.py` liste les appelants d'une fonction et montre les arguments empilés.

**Limite connue de l'export.** Le jeu utilise la convention d'appel Watcom, qui passe les premiers
arguments dans les registres. Ghidra ne la modélise pas ici : les fonctions apparaissent donc sans
paramètres, et des valeurs calculées juste avant un appel ressemblent à des variables locales
inutilisées. Pour connaître les vrais arguments, il faut désassembler le site d'appel.

---

## 2. Structure du fichier

Exécutable au format LE : un petit programme de démarrage, puis l'en-tête LE et les objets.

| Objet | Contenu | Correspondance |
|---|---|---|
| 1 | code | fichier `0x2BE00` ↔ adresse `0x10000` |
| 3 | données | adresse `0xB0000` ↔ décalage `0` |

Donc une variable vue comme `0x000d6634` dans le code décompilé apparaît comme l'immédiat
`0x26634` dans le désassemblage, et inversement.

**Table de relocation.** L'en-tête LE donne la table des pages à `+0x68` et celle des
enregistrements à `+0x6C`. Un enregistrement fait : type sur 1 octet, indicateurs sur 1 octet,
position source sur 2 octets dans la page, numéro d'objet sur 1 octet, puis la cible sur 2 ou 4
octets selon l'indicateur `0x10`.

**Piège majeur pour toute modification.** Le chargeur réécrit ces positions au démarrage. Remplacer
une instruction qui contient une adresse relogée par un appel fait écraser l'appel par le chargeur.
Il faut soit choisir une instruction sans relocation, soit sauter par-dessus les zones concernées
en les laissant intactes.

**Espace libre pour du code ajouté.** La fin de la dernière page de code, de `0x94DEB` à
`0x95000`, est remplie de zéros, soit 533 octets utilisables. Au-delà, il n'y a plus de page.

**Obtenir l'adresse relogée d'une variable depuis du code ajouté.** Le code ajouté n'est pas
relogé. L'astuce employée : un `call` sur l'instruction suivante donne l'adresse courante, puis on
lit l'immédiat déjà relogé d'une instruction existante qui référence la variable voulue.

---

## 3. Variables connues

Adresses données dans la convention du désassemblage.

| Adresse | Rôle | Type |
|---|---|---|
| `0x2667A` | caméra, colonne | mot signé, 0 à 63 |
| `0x26666` | caméra, rangée | mot signé, 0 à 63 |
| `0x26624` | origine du dessin en pixels, horizontale | mot signé |
| `0x2663A` | largeur d'une tuile | 48 ou 24 selon le mode |
| `0x26654` | hauteur d'une tuile | 32 ou 16 |
| `0x26634` | vitesse du jeu | mot signé, négatif = lent |
| `0x27766` | compteur des vitesses lentes | octet |
| `0x23AFC` | compteur de pas de simulation | mot long |
| `0x23AF8` | passages de la mise à jour des objets (`0x21681`) | mot long |
| `0x23AF4` | état du générateur de hasard (§ 10.1) | mot long |
| `0x2665C` | joueur courant (§ 10.8) | mot |
| `0x2666E` | demande de redessin complet de la carte | mot |
| `0x27798` | mode d'affichage décalé | octet, vaut 2 au chargement |
| `0x2E5F6` | mode d'affichage : 1 = basse résolution (320x200), 8 = haute (640x480) | mot |
| `0xECAC` | souris, position horizontale | mot |
| `0xEC98` | drapeau de non-réentrance de la souris | mot long |
| `0xECB0` | durée du double-clic, 10 pas de simulation (posée par `0x12452`) | mot |
| `0x2E59E` | compte à rebours du double-clic, décompté par pas de simulation | mot signé |
| `0x14E2`, `0x14E4` | position où replacer le pointeur du pilote ; `0xFFFF` : aucune (§ 6.7) | mots |
| `0x9ED8` | pour chacun des 7 écrans pleins, l'écran d'où l'on vient | 8 octets |
| `0x26670` | l'outil en main (§ 6.7) | mot |
| `0x26678` | l'objet du parc choisi | mot |
| `0x26652` | l'écran ouvert ; 0 = la vue du parc | mot |
| `0x26688` | demande de sortie de la boucle du parc | mot |
| `0x2668A` | emplacement à charger à l'entrée dans le parc (option `-n`) | mot |
| `0x27792` | nombre de joueurs en réseau (option `-m`) ; **0 sans l'option**, ramené à 1 si le réseau manque (§ 5.3) | octet |
| `0x2441E` | la file des événements : 5 cases de 6 octets ; `0x24400`, l'image précédente (§ 11.5) | |
| `0x26690`, `0x266B0`, `0x266D0` | VOTRE NOM, SURNOM (celui des sauvegardes), NOM DU PARC (§ 11.4) | textes |
| `0x266F0` à `0x266F7` | les réglages de la fiche du joueur (§ 11.4) | octets |
| `0x26718` | l'argent qui reste au joueur pour acheter un terrain | mot long |
| `0x2779F` | l'image courante de l'animation d'un bouton pressé (§ 11.8) | octet |
| `0x26636` | le décalage du nom qui défile au panneau (§ 11.8) | mot |
| `0x26690` | la fiche du joueur, 0x8D octets (noms, réglages, argent de départ), écrite dans `save/<surnom>.GD` par `0x2E9E8` (§ 7) | |
| `0x26682` | le drapeau de la triche, levé par `0x2EA62` (§ 7) | mot |
| `0x26606` | les images sans un geste à l'écran titre ; 3 000 lancent la démonstration (§ 11.9) | mot |
| `0x14AE` | `save/demo.gy` existe (posé par `0x104A3`) : sans lui, pas de démonstration | octet |
| `0x14B5` | les tics de la minuterie du jeu, 72,83 Hz (§ 6.9) | mot long |
| `0x1510` | l'écran plein est dessiné en 320x200 (`0x1171F` le lève, `0x11761` le baisse, § 6.9) ; `0x9758` : garder le mode | octets |
| `0x14E8` | le sens du défilement pendant un tracé : 1 haut, 2 droite, 4 bas, 8 gauche (§ 11.15) | octet |
| `0xA0F8` | l'étape du tutoriel, 0 à 27 ; négative hors du tutoriel (§ 11.11) | octet |
| `0x243F6` | dix octets : l'emplacement JEU n existe-t-il (`0x51011`, § 11.10) | |
| `0x14B9`, `0x14BB` | le catalogue surgissant de devant, celui du fond (§ 11.3) | mots |
| `0x2E564`, `0x2E554`, `0x2E590` | les tampons du curseur : les pixels recouverts (deux copies), l'image décodée 64x64 (§ 6.6) | pointeurs |
| `0x2F9C8` | le tas du jeu : 256 descripteurs de 0x12 octets (§ 9.2) | |
| `0x2E1C8`, `0x2E1C4`, `0x2E1D8`, `0x2E1DC` | les enchères : la prochaine mise, la dernière enchère, l'enchérisseur, le compte à rebours (§ 11.13) | |
| `0x277F8`, `0x27800`, `0x277FC`, `0x27804` | la négociation : le plancher, le plafond (plancher + 500), l'offre du joueur, la demande de l'adversaire, en dixièmes de point (§ 10.15) | mots longs |
| `0x27808` | l'obstination de l'adversaire, 0 à 8, jamais remise à zéro (§ 10.15) | mot signé |
| `0x27B6C`, `0x27B6D` | la tonte : le rang dans la bande, la bande (§ 10.13) | octets |
| `0x27BE6` | la courbure des notes d'une attraction usée, `0x2000` au centre (§ 10.16) | mot |
| `0x26614`, `0x26610` | l'écran des nouveautés : la sorte (4 attraction, `0xA` boutique), le décalage dans le catalogue (§ 11.19) | mots |
| `0x14CB`, `0x14CC` | le vent de la neige ; la météo : bit 0 la pluie, bit 1 la neige, bit 2 l'orage (§ 11.1, § 11.19) | octets |
| `0x278A0` à `0x278AC`, `0xA0FC` | le lecteur des animations de fin de partie ; le mode vidéo changé pour elles (§ 11.20) | |
| `0x33000` | la poignée de l'événement de SOS auquel la minuterie du jeu s'abonne (§ 6.9) | mot long |
| `0xECC0` à `0xECC8`, `0x1C802` à `0x1C808` | les trois vecteurs de nettoyage ; la table des routines de fin de Watcom (§ 11.21) | |

Les sections 6 à 12 emploient la convention du code
décompilé (données à `0xB0000`, § 6) : `0x26682` ci-dessus y est `0xD6682`, `0x14B5` y est `0xB14B5`.

Le temps du jeu : le compteur de pas vaut 1000 par mois, 12 000 par année.

---

## 4. Fonctions connues

| Adresse | Rôle |
|---|---|
| `0x11C45` | boucle principale du parc (§ 11.9) — **réécrit** |
| `0x11C5F` | appel détourné par les correctifs de cadence |
| `0x1107F` | premier appel de chaque image de la boucle : touche, souris, compte des images sans geste (§ 11.9) — **réécrit** |
| `0x12B1F` | un pas de simulation |
| `0x1B837` | dessin d'une image du parc, deux passes (voir § 6.3) — **réécrit** |
| `0x183EC` | défilement de la carte, quatre directions — **réécrit** |
| `0x184DF` | recadrage de la caméra dans les limites — **réécrit** |
| `0x209B5` | dessin immédiat d'un objet graphique `(index, x, y)` (voir § 6.4) — **réécrit** |
| `0x20BEB` | dessin d'une partie d'un objet graphique — **réécrit** |
| `0x1C22A` | dessin de ce qui est posé sur une case : liste d'objets du parc, puis décor — **réécrit** |
| `0x21681` | mise à jour de tous les objets du parc, par type puis par état (voir § 10.1) |
| `0x18B92` | le générateur de hasard — **réécrit** |
| `0x22E22` | la promenade d'un visiteur : ce qu'il décide à chaque case — **réécrit** |
| `0x672A5`, `0x2789A` | l'humeur d'un visiteur ; ses bulles de pensée et ses émotions — **réécrits** |
| `0x349EB` | la direction à prendre vers une case, en contournant les obstacles — **réécrit** |
| `0x78943` | une écriture au livre des comptes — **réécrit** |
| `0x20FF5` | désignation de l'objet sous le pointeur de la souris |
| `0x5ED21` | le traceur de sprites : décodage des lignes, découpe, miroirs, remappage — **réécrit** |
| `0x5EC9C` | tracé d'une image `(x, y, entrée)`, sans marquage — **réécrit** |
| `0x5ECD4` | copie conforme de `0x5EC9C`, appelée par `0x55BD4` seule — **réécrit** |
| `0x55BD4` | tracé d'une image avec marquage des blocs touchés (haute résolution) — **réécrit** |
| `0x54D38`, `0x55D97` | marquage des blocs touchés — **réécrits** |
| `0x54ED6` | restauration du fond par blocs, haute résolution — **réécrit** |
| `0x55507` | présentation à l'écran par blocs, haute résolution — **réécrit** |
| `0x55C24` | recopie d'une bande de blocs d'un tampon à un autre — **réécrit** |
| `0x55DE6` | présentation d'une bande de blocs à l'écran, banque par banque — **réécrit** |
| `0x80210` | présentation de l'image entière, basse résolution — **réécrit** |
| `0x81CD4` | présentation de l'image entière, haute résolution, banque par banque |
| `0x80E20` | recopie linéaire de lignes de 320 octets — **réécrit** |
| `0x81CB0` | recopie linéaire de lignes de 640 octets — **réécrit** |
| `0x7D775` | pose du curseur de la souris dans l'image (voir § 6.6) ; repère d'image de l'hôte ; réécrit, en attente (l'hôte l'enveloppe) |
| `0x7D7C7`, `0x7D79E` | fin de présentation : rend le tracé du curseur au gestionnaire de souris ; `0x7D79E` remet d'abord les pixels recouverts — **réécrits** |
| `0x7E6BC` | choix de la banque VESA, selon la granularité de la carte — **réécrit** |
| `0x35F21` | ouverture d'une fenêtre (table `0xB762D`, 21 octets par fenêtre) — **réécrit** |
| `0x7D7E2` | gestionnaire de souris (voir § 6.7) — **réécrit** |
| `0x7CFC6`, `0x7D4F9` | tracé direct du curseur dans la fenêtre vidéo ; remise du fond dessous — **réécrits** |
| `0x11303`, `0x11191`, `0x1142A` | plage du pilote de souris (fonctions 7 et 8), placement du pointeur (fonction 4), remise à zéro du pilote (fonction `0x2F`) — **réécrits** |
| `0x10010` | le `main` : ligne de commande, mise en place, boucle, sortie (voir § 11.6) — **réécrit** |
| `0x104A3` | mise en place du programme : images, textes, mode vidéo, mémoire du son — **réécrit** |
| `0x12452` | entrée dans le parc : graine du hasard, couleurs, nouvelle partie, chargement — **réécrit** |
| `0x19EEE`, `0x1A2CA` | nouvelle partie ; pointeurs du joueur courant (§ 10.8) — **réécrits** |
| `0x10D42` | passage 320x200 ↔ 640x480, données remises à l'échelle en place — **réécrit** |
| `0x1A836` | écran titre et menu principal (voir § 11.4) — **réécrit** |
| `0x576FE`, `0x560D2`, `0x56532`, `0x57193` | fiche du joueur, carte du monde, fiche d'un pays, fiche d'un propriétaire (§ 11.4) — **réécrits** |
| `0x793B1`, `0x3B496`, `0x3DA5E` | boîte de saisie d'un nom, son clavier, son champ (§ 11.4) — **réécrits** |
| `0x2CCF8` | la file des événements, en fin d'image (voir § 11.5) — **réécrit** |
| `0x15FBD`, `0x1788D` | appui du bouton gauche, du bouton droit sur une zone de l'écran du parc (§ 11.5) — **réécrits** |
| `0x2EBB7`, `0x287D8`, `0x29835`, `0x205D7`, `0x32232` | construire une attraction, un mur, des rails ; vider une case ; embaucher (§ 11.5) — **réécrits** |
| `0x193FD`, `0x19A9E`, `0x3568E`, `0x30E22` | placer l'entrée, la sortie d'une attraction ; poser une boutique ; aperçu sous le pointeur (§ 11.5) — **réécrits** |
| `0x2DF12`, `0x2E035`, `0x2E20C` | sauver, charger une partie ; charger les textes de la langue (§ 11.6) — **réécrits** |
| `0x3B76E` | commande d'un bouton d'écran (§ 11.7) — **réécrit** |
| `0x5877B`, `0x5969C` | graphique des comptes et ses boutons (§ 11.7) — **réécrits** |
| `0x4DE1A`, `0x4E359` | barre d'outils ; panneau de commande du parc (§ 11.8) — **réécrits** |
| `0x7F652`, `0x87524` | `sprintf`, `vfprintf` de la bibliothèque C de Watcom (§ 12) — **réécrits** |
| `0x81374`, `0x8148C`, `0x949BC`, `0x949DA` | tracés de segments (§ 12) — **réécrits** |
| `0x82950` | amorçage du tas : toute la mémoire libre (§ 9.2) — **réécrit** |
| `0x2DE6D` | application d'un événement d'interface à la vitesse du jeu |
| `0x145FB` | entrées du parc, à chaque image : zone sous le pointeur, boutons (voir § 6.7) |
| `0x149A4` | survol d'une zone de l'écran du parc |
| `0x47598` | défilement au survol d'un bord, après un délai de 15 tics — **réécrit** |
| `0x475EF` | lecture des tics de la minuterie du jeu — **réécrit** |
| `0x18003` | défilement au bouton droit maintenu sur un bord — **réécrit** |
| `0x10992` | relevé de la souris : position, boutons maintenus, appuis ; réécrit, en attente : code mort dans le jeu publié (§ 6.7, § 11.6) |
| `0x1B23A`, `0x1B6A8` | rouvrir un écran et son ambiance ; l'écran d'attente `0x66` (§ 11.9) — **réécrits** |
| `0x5F550`, `0x5F63F`, `0x5F76D` | les tables de ressources : tout charger, en charger une, la rendre (§ 11.16) — **réécrits** |
| `0x11921`, `0x11A51`, `0x1180E`, `0x115DB` | préfixer les noms de fichiers ; charger un fichier, RNC ou non ; `access` (§ 11.16) — **réécrits** |
| `0x10C80`, `0x10CE4`, `0x1036D`, `0x1041A` | reloger une banque d'images, en doublant ou en divisant ses dimensions ; les six banques (§ 11.16) — **réécrits** |
| `0x1171F`, `0x11761` | passer un écran plein en 320x200, en revenir (§ 6.9) — **réécrits** |
| `0x3F296` à `0x3F7BD` | le texte : largeurs, alignements, grande police (§ 11.16) — **réécrits** |
| `0x503DA`, `0x508A3`, `0x50CCD` | placer, dessiner un menu déroulé ; ses commandes (§ 11.10) — **réécrits** |
| `0x515A0`, `0x51780`, `0x53E6E` | ouvrir l'écran des recherches, le mener à chaque image ; tourner une molette (§ 11.10) — **réécrits** |
| `0x59C85`, `0x59C06` | une image du tutoriel ; la vue amenée sur son terrain (§ 11.11) — **réécrits** |
| `0x5CAD0`, `0x5CA82` | installer la minuterie ; son gestionnaire (§ 6.9) — **réécrits** |
| `0x78E36`, `0x78F89` | une question oui/non modale ; une image de sa boîte (§ 11.12) — **réécrits** |
| `0x798D7`, `0x79A04`, `0x7B19C` | l'entrepôt : l'ouvrir, une image, une barre de capacité (§ 11.12) — **réécrits** |
| `0x4B11E`, `0x4B56C`, `0x7B65C`, `0x7B73E` | la bourse : l'ouvrir, la mener ; la vente aux enchères : la préparer, la dérouler (§ 11.13) — **réécrits** |
| `0x6A85C` à `0x6CD44` | les catalogues surgissants : ouvrir, fermer, remplir, régler, la souris (§ 11.3) — **réécrits** |
| `0x6D4B7` à `0x6E7B2` | les feux d'artifice, douze fonctions (§ 11.14) — **réécrits** |
| `0x2A2F1`, `0x2A2B1`, `0x2C6B8`, `0x1FEB5` | élever ou abaisser une voie, la hauteur d'un morceau, retirer un rail ; dessiner un rail et ses wagons (§ 11.15) — **réécrits** |
| `0x40DA6`, `0x41936`, `0x41EB4`, `0x47268` | poser un décor ; poser, ôter les wagons ; défiler pendant un tracé (§ 11.15) — **réécrits** |
| `0x2E9E8`, `0x2EA62` | **écrire** la fiche du joueur ; le code de triche puis la relecture de la fiche (§ 7) — **réécrits** |
| `0x7D2DD` à `0x7E126` | le curseur logiciel et la souris : tracé, fond, décodage, installation (§ 6.6) — **réécrits** |
| `0x7EC50`, `0x7ECF0`, `0x80BE4` | passer en mode 13h, en VESA `0x101` ; **attendre le retour du balayage** (§ 6.9) — **réécrits** |
| `0x7E8D0`, `0x7E9B8`, `0x7EA98`, `0x82C78` | le tas du jeu (§ 9.2) — **réécrits** |
| `0x80350`, `0x80990`, `0x80A20`, `0x80DC0`, `0x80E40`, `0x81984`, `0x81AD0` | la couche de son de Bullfrog (§ 9.3) — **réécrits** |
| `0x8616E` à `0x90629` | le socle d'exécution de Watcom : fichiers, flots, tas DPMI, démarrage (§ 12) — **réécrits** ; `0x87274` (`__CMain`) et `0x89F90` (cœur d'`int386x`), en attente |
| `0x31748` | démolir une attraction, le contraire de `0x2EBB7` (§ 10.3) — **réécrit** |
| `0x638EF` | l'agent d'entretien balaie (§ 10.5) — **réécrit** |
| `0x619BF` à `0x64D9A` | l'agent d'entretien : la tonte, les toilettes, la tournée tracée, 23 fonctions (§ 10.13) — **réécrits** |
| `0x4C592` à `0x4DD81`, `0x3455A`, `0x34728`, `0x35652`, `0x325DA` | les voyous, le gardien, l'amuseur qui fuit, le renvoi d'un employé (§ 10.14) — **réécrits** |
| `0x44EA5`, `0x46F27`, `0x3502B` à `0x3542D` | les négociations, la réponse de l'adversaire, la grève (§ 10.15) — **réécrits** |
| `0x6662D`, `0x664F1` à `0x66BA0` | l'explosion, le nuage, le château et les avions envolés, la musique désaccordée (§ 10.16) — **réécrits** |
| `0x43BAA`, `0x44208` à `0x448BA` | le monorail : wagon, gare, évaluation de la voie, ouverture, fermeture (§ 10.17) — **réécrits** |
| `0x29340` à `0x416EA` | les outils de pose et leur contraire, 16 fonctions (§ 11.17) — **réécrits** |
| `0x40641`, `0x3F975`, `0x77A55`, `0x77B08`, `0x78B7E`, `0x78CEF`, `0x2BCEE` | la carte du parc, le relevé bancaire, « démolir ? », l'écran du bus, effacer une file (§ 11.18) — **réécrits** |
| `0x3A8EF`, `0x47A27`, `0x47E39`, `0x44C91`, `0x19ED3` | l'écran des nouveautés, la neige, l'éclair, le démontage d'une voie, le « 1 » des vitesses nulles (§ 11.19) — **réécrits** |
| `0x5C7D1`, `0x5B88D` à `0x5C6F4`, `0x7F1D0`, `0x81EAC` à `0x8203D` | la fin de partie : BUSTED, TAKEOVER, le lecteur d'animations FLC, le fondu (§ 11.20) — **réécrits** |
| `0x108B1`, `0x10C2F`, `0x185B0`, `0x5CB6C`, `0x87307`, `0x904C5` | la sortie du programme, 22 fonctions (§ 11.21) — **réécrits** |
| `0x7C16C` | le bandeau de message au bas des écrans pleins (§ 11.12) — **réécrit** |
| `0x6010C`, `0x6058B`, `0x7F68F` à `0x80034`, `0x5C04F`, `0x60C44` à `0x6123D` | la couche de son de Bullfrog, suite : ouverture de la musique et des bruitages, morceaux, films FLC et leur script sonore, 26 fonctions (§ 9.3, § 9.6) — **réécrits** |
| `0x821FC` à `0x86E23` | HMI SOS : la minuterie, les systèmes et pilotes de musique et de bruitages, les banques, 27 fonctions (§ 9.4, § 9.5) — **réécrits** (`0x828C4` en attente) |
| `0x8943F` à `0x8BF81`, `0x88D91` | HMI SOS : les échantillons, les portes des modules, le DPMI, la minuterie matérielle, le gestionnaire d'un morceau, le `scanf` de Watcom, 32 fonctions (§ 9.4, § 9.5, § 12.5) — **réécrits** |
| `0x8D255` à `0x92F7D` | le pilote FM de SOS et le chargement des modules de `HMIDRV.386`, 28 fonctions (§ 9.5) — **réécrits** |

Les fonctions réécrites de la simulation sont présentées au § 10, celles de l'interface au § 11,
la bibliothèque C et les tracés au § 12. Chaque module de `moteur/jeu/` en donne le détail en tête ;
`python outils/avancement.py` les compte (756 fonctions, 55 modules, 90,0 % des instructions).

---

## 5. Ce qui est compris du moteur

### 5.1 Projection à l'écran

Pour un objet situé à la colonne `c` et à la rangée `r` de la carte :

```
x = origine_pixels + (c - camera_colonne) * largeur_tuile
                   + (r - camera_rangee) * (largeur_tuile / 3)
y = (r - camera_rangee) * hauteur_tuile
```

Le décalage d'un tiers de tuile par rangée donne la vue oblique caractéristique du jeu. La carte
fait 64 par 64 cases, la caméra est exprimée en cases entières.

**L'axe horizontal a une origine en pixels, l'axe vertical n'en a pas.** C'est la raison de fond de
l'échec du défilement continu : rien à décaler sur l'axe vertical sans toucher à une vingtaine
d'endroits du code.

### 5.2 Dessin d'une image

Le sol et les objets suivent deux chemins différents, qui se rejoignent au dessin final.

Le sol est parcouru rangée par rangée par la boucle `0x1B837`. Pour chaque rangée, elle calcule une
position de départ à droite de l'écran et un numéro de colonne, puis avance vers la gauche en
retirant une largeur de tuile à chaque pas. Le numéro de colonne de départ vient d'une division
entière, et c'est le reste jeté par cette division qui empêchait tout décalage fin.

Les objets du monde, visiteurs, manèges, boutiques et décors, passent tous par `0x209B5`,
appelée depuis 71 endroits. **Correction du 21 septembre 2026** : ce n'est pas une insertion dans
une liste triée. La routine dessine l'objet sur-le-champ, et ses arguments sont dans l'ordre
`(index, x, y)`. L'ordre de dessin, donc la profondeur, est l'ordre des appels. Le détail est au
§ 6.

**Conséquence pour la suite.** Cette routine reste le point de passage unique des objets du monde,
et donc l'endroit où appliquer un décalage global pour un défilement au pixel.

### 5.3 Cadence et vitesses

La boucle principale ne contient aucune horloge : un pas de simulation par image dessinée. Deux
blocs identiques, à `0x11CB5` et `0x1202D`, décident de ce pas selon la variable de vitesse :

- vitesse positive ou nulle : un passage est autorisé, puis le jeu exécute `vitesse + 1` pas ;
- vitesse négative : une branche séparée compte les images et n'autorise un passage que toutes les
  `|vitesse|` images.

L'interface ne modifie pas cette variable directement. Elle poste un événement de type `0x42`
portant la nouvelle valeur, appliqué par la routine `0x2DE6D`.

**Les conditions des deux blocs** (établies par la réécriture de `0x11C45`, § 11.9). Le premier
tourne hors pause si l'écran est la vue du parc **ou** si `[0xD7792]` ≠ 1 ; il compte les images
lentes dans `0xD7766`. Le second, dans la routine de la vue du parc, tourne hors pause, dans la vue
du parc, si `[0xD7792]` = 1 ; il prend le reste du calendrier par |vitesse| au lieu d'un compteur.
Or `[0xD7792]` vaut **0** sans l'option `-m` : en jeu normal, seul le premier bloc tourne, y compris
quand un écran est ouvert. Avec `-m` et un réseau introuvable (valeur ramenée à 1), les deux blocs
tournent à la même image dans la vue du parc, et la simulation va deux fois plus vite ; aucun
scénario ne le fait, et l'intention n'est pas établie.

### 5.4 Défilement

Quatre implémentations distinctes déplacent la caméra d'une case : le clavier, le bord de l'écran,
et deux variantes. Quatorze instructions au total, listées par recherche des références à la
variable de caméra. Toute modification du déplacement doit les traiter ensemble, ou observer la
caméra plutôt que les modifier. Le défilement à la souris est détaillé au § 6.7.

---

## 6. Le rendu

Établi le 21 septembre 2026 par lecture du désassemblage et mesures en cours de partie. Adresses
dans la convention du code décompilé (données à `0xB0000`) : `0xD663A` ici est `0x2663A` plus haut.

### 6.1 Deux modes, un seul espace de dessin

`0xDE5F6` n'est pas un champ de bits mais un **mode** qui ne prend que deux valeurs : **1** pour
l'écran 320x200 (VGA mode 13h), **8** pour 640x480 (VESA 0x101). L'hypothèse précédente, « bit 0
= haute résolution », était inversée ; trois preuves concordent : les treize écritures du programme
(uniquement 1 et 8), la valeur 1 relevée en cours de partie alors que la carte est en 320x200, et
le traceur `0x5ED21`, qui divise coordonnées et dimensions par deux quand le mode vaut 1.

Le jeu dessine donc toujours dans un **espace logique de 640 de large** (400 de haut en mode 1,
480 en mode 8). Les tuiles y font 48x32 en mode 1 et 24x16 en mode 8 : **la même taille à
l'écran**. Le mode 8 ne montre pas le parc plus finement, il en montre quatre fois plus.

### 6.2 La carte

Une grille de 64x64 cellules de 4 octets, pointée par `[0xD3B08]` :

| Décalage | Contenu |
|---|---|
| `+0` | mot signé : objet posé sur la case ; 0 = vide, positif = index dans la table des objets, négatif = décor fixe |
| `+2` | octet : image du sol, décalée de 1 dans la table `[0xD3B90]` (l'élément 1 sert de tuile hors carte) |
| `+3` | octet : bits 0 à 2 = les déchets (gobelet, emballage, vomi), dessinés éparpillés sur la case ; bit 4 = un panneau indicateur ; bit 5 = un sens imposé aux visiteurs, sa direction dans les bits 6 et 7, dessiné au centre de la case par l'une de quatre figures (une flèche, vraisemblablement) ; bit 3 non établi |

Les objets du parc sont des enregistrements de 200 octets, pointés par `[0xD3B10]`.

### 6.3 Le dessin d'une image de carte, `0x1B837`

Deux passes sur la grille, rangée par rangée de haut en bas, colonne par colonne de droite à
gauche :

1. **Le fond**, seulement si `redessinerCarte` (`0xD666E`) est posé : sols, déchets et sens imposés,
   dessinés dans un tampon de fond (`[0xD3B98]`), puis le bandeau animé du bas.
2. Le fond est recopié vers la surface de dessin, puis **les objets** — attractions, boutiques,
   visiteurs — y sont dessinés par-dessus (`0x1C22A` pour chaque case occupée).

La position de départ de chaque rangée part toujours du bord droit logique, 640, codé en dur.
La colonne correspondante est calculée par `(640 − origineDessinX) / largeurTuile`, **division
entière dont le reste est jeté** — quatre fois dans la fonction. Faire varier l'origine de 1 à
`largeurTuile − 1` pixels ne déplace donc rien : l'image saute d'une tuile entière quand le
quotient change. C'est le mécanisme exact qui a fait échouer le défilement au pixel sous DOSBox.

**En partie, le reste n'est pas nul.** `0x12452` pose l'origine à −3/4 de tuile, soit −36 avec des
tuiles de 48, et le changement de mode ne la recalcule pas : 640 + 36 = 14 × 48 + 4 = 28 × 24 + 4.
Dans les deux modes, sol et objets sont tracés 4 pixels à droite de la projection du § 5.1. `0x145FB`
pose aussi l'origine à `0x70` = 112, reste nul, quand les deux boutons sont enfoncés ensemble
(§ 6.7).

Les déchets d'une case sont placés par une dispersion déterministe : le reste de la
division de `(rang du bit × 16 + index de la cellule [+ sol])` par la taille de la tuile. Stable
d'une image à l'autre, différent d'une case à l'autre.

**Réécrit** dans `moteur/jeu/dessin-carte.js`. Ce que la réécriture a établi en plus :

- **Les figures.** La table `[0xD3B38]` traduit un numéro de figure en objet composite : `0x129` à
  `0x12B` pour les trois sortes de déchets, `0x257` à `0x25A` pour les quatre directions d'un sens
  imposé. Les décalages de cette figure sont ceux des décors fixes de `0x1C22A`, choisis par `mode == 8`, alors
  que partout ailleurs la fonction teste le bit 0.
- **Le panneau de commande** est recopié du fond vers la surface *après* les objets, qu'il recouvre
  s'ils débordent. Son haut est l'ordonnée de l'élément 4 de la table des zones `0xB93C3` (§ 6.7),
  `[0xB93F5]` : 360 en mode 1, 440 en mode 8, moins 4. En mode 1, le décalage de la copie
  (haut × 160) n'est exact que si le haut est pair.
- **Le clic est attribué pendant le dessin.** Le gestionnaire de souris `0x7D7E2` pose le mot
  `0xDE5A0` ; en traçant les objets, `0x20FF5` et `0x1DD27` regardent si le pointeur tombe sur celui
  qu'elles dessinent. Si oui, elles posent `0xD77A6` et changent d'écran : `0x20FF5` sélectionne
  l'objet et ouvre la fenêtre `0xD` (`0x35F21`), `0x1DD27` passe à l'écran `0x54`. En fin d'image,
  `0x1B837` efface la demande si un objet l'a prise. Lequel l'emporte quand plusieurs objets sont
  sous le pointeur : non établi.
- **La musique des attractions.** Pendant le dessin, la première attraction visible qui a une
  séquence (et dont le mot +0x32 n'est pas nul, en marche ? non établi) la réclame (`0x1D87A`) :
  `[0xD3AE8]` la désigne et `[0xD6632]` passe à 1 ; l'attraction sélectionnée l'emporte si elle
  vient après. `[0xD6632]` passe à −1 au début de chaque image : non réclamée, la musique s'arrête
  (`0x80990`) ; réclamée, `0x80A20(n)` lance la séquence de son type (descriptions en `0xCCED0`,
  +0xB7), et elle se désaccorde (`0x66BA0`, messages MIDI 0xE1 à 0xE3 ; `0x66D18` la recentre)
  quand le mot +0x2E de l'attraction dépasse le seuil +0xA8 du type (l'usure ? non établi).
- **Les enseignes défilantes** (`0x1C5E9`) : `sprintf("%s %d.%d  ")`, une fenêtre de 6 caractères
  qui avance d'un cran tous les 8 pas de simulation (octet +0xBB de l'objet), tracée par `0x80E88`
  dans une petite police de 3x6.
- `[0xD6630]` empêche `0x1C9E2` de jouer plus d'une fois par image le bruitage de l'objet
  sélectionné.
- **Les bruitages du vomi.** Le visiteur qui vomit (dans `0x22E22`, de `0x22F03` à `0x22FD0`) fait
  entendre SICK (0xD, par `0x80C80`), où qu'il soit dans le parc. Au premier pas d'une case souillée de vomi, un visiteur
  dessiné (`0x1C9E2`, états 8 et 0x1A) fait entendre HURRAY (0x26, par `0x80FE0`) : malgré son nom,
  un « huuum » écœuré d'une seule voix, que le jeu relance dès qu'il finit tant que du vomi est à
  l'écran (mesuré : un départ toutes les 1,6 s). La page les espace (le répit des bruitages,
  architecture.md, « Le son »).
- **La récursion.** `0x3CC79`, qui interprète la description d'une fenêtre ouverte par `0x35F21`,
  appelle `0x1B837` quand la fenêtre contient une vue du parc ; et `0x35F21` peut être atteinte
  pendant le dessin des objets (le clic). `0x1B837` peut donc se rappeler elle-même : jamais vu dans
  les scénarios.

### 6.4 Les objets composites, `0x209B5`

Un objet du monde est une **chaîne de morceaux** décrite dans les données :

| Table | Pointeur | Élément | Champs |
|---|---|---|---|
| objets | `[0xD3B80]` | 8 octets | premier morceau (mot), largeur et hauteur d'emprise (octets) |
| morceaux | `[0xD3B7C]` | 10 octets | image (décalage), dx, dy, drapeaux de tracé, morceau suivant ; l'index 0 termine |
| images | `[0xD3BB8]` | 6 octets | pointeur vers les pixels, largeur, hauteur |

`0x209B5(index, x, y)` parcourt la chaîne et trace chaque morceau à `(x + dx, y + dy)`, avec ses
drapeaux copiés dans `0xBECBC`. Pas de tri, pas de tampon, pas de capacité : l'ordre des appels
fait la profondeur. Deux tracés de plus, selon `0xD667C` : la vue réduite (valeur 8, l'objet entier
confié à `0x67182`, ramené à son emprise divisée par `0xD6640` et `0xD6642` ; basculée par une touche
dans `0x13BF3`, et posée par `0x3F975` et `0x40641`), et un tracé tronqué (valeur `0x10`, hauteur
`0xD6686`) que le code ne pose jamais — vraisemblablement mort. Le mot +6 d'un objet graphique
désigne l'objet graphique suivant d'une animation.

**Réécrit** dans `moteur/jeu/objets.js`, avec `0x20BEB` (une partie seulement des morceaux) et
`0x1C22A`, le dessin d'une case.

**Une case porte une liste.** Le mot +0 de la cellule est la tête d'une liste d'objets du parc
doublement chaînés, le mot +2 d'un objet désignant le suivant et son mot +0 le précédent ; la liste
s'arrête sur 0, ou sur un décor (valeur négative), dessiné en
dernier au centre de la case. Le numéro d'un décor `−n` mène à un objet graphique par deux tables :
le mot `0xB44C1[n]`, puis le mot `[0xD3B38][élément]`.

**Les objets du parc**, enregistrements de 200 octets de `[0xD3B10]` + 200 à `[0xD3B78]` exclu
(1 198 emplacements dans la démo) : +0 et +2 objets précédent et suivant sur la case, +4 type,
+6 et +8 position en 256es de case (octets forts +7 colonne, +9 rangée),
+A objet graphique, +C état, +16 genre ou lien, +BB défilement de l'enseigne. `0x1C22A` confie
chacun à la routine de son type :

| Type | Routine | Ce que c'est |
|---|---|---|
| 2 | `0x1C9E2` | les visiteurs (92 dans la démo ; § 10.2) |
| 4 | `0x1D87A` | les attractions ; le mot +16 désigne la fiche du genre dans le catalogue `0xCCED0` (fiches de 200 octets, nom en tête : BIG WHEEL, ROLLER COASTER, HAUNTED HOUSE… ; § 10.3) |
| 6, 0x1C | `0x1C5E9` | un kiosque rattaché à une attraction (+16 : son numéro), dont l'enseigne défile ; un par attraction, deux pour les attractions à voie ; vraisemblablement l'entrée de l'attraction, et ce qui distingue 6 de 0x1C, non établi |
| 8 | `0x1E9A7` | le personnel ; l'octet +59 désigne le métier dans le catalogue `0xD35C0` (fiches de 0x36 octets, nom en tête) : 0 SHARK MAN, 1 MECHANIC, 2 HANDYMAN, 3 CHICKEN_MAN, 4 TEDDY MAN, 5 RHINO MAN, 6 SQUID MAN, 7 STRONG MAN, 8 GUARD (§ 10.5) |
| 0xA | `0x1ECD6` | les boutiques et les stands ; le mot +16 vaut 107 fois le genre, dans le catalogue `0xD3C62` (17 fiches de 107 octets, nom en tête, famille à +0x24 : 1 manger, 2 boire, 4 souvenirs, 8 jeu d'adresse ; BIG TIME FRIES, POKEY COLA, DUCK SHOOT… ; § 10.4) |
| 0xE | `0x1DD27` | les véhicules : le bus des visiteurs et les wagons des attractions à voie (§ 10.6) |
| 0x12 | `0x1F205` | les morceaux de voie ; l'octet +C en donne la forme (§ 10.6) |
| 0x14 | `0x1F8F8` | selon l'état : 6, l'entrée du parc (portique à enseigne défilante, guérites) ; 8, les panneaux indicateurs, un poteau (`0x20BEB`, élément `0xAD`) portant trois flèches, vers une attraction, une boutique et la sortie ; 2, un objet animé. Dans l'état 6, `0x1F8F8` rappelle `0x1C22A` pour une case voisine hors de l'écran : la fonction est réentrante |
| 0x18 | sur place | les installations du catalogue `0xCCA70` : les toilettes et la fontaine, animées tous les 16 pas de simulation (§ 10.4) |
| 0x1A | `0x1C90B` | un objet placé finement dans sa case (octets +6 et +8), que les gardiens arrêtent : les voyous, vraisemblablement ; aucun dans les scénarios |

Les types ont été établis par les champs que lisent ces routines, par les catalogues relus en
mémoire pendant la démo, et par des images de la démo où seuls les pixels tracés pour un type
restent en couleur. `0x21681` met à jour tous les objets, par type puis par état ; `0x20FF5` désigne
l'objet sous le pointeur, selon l'outil en cours (`0xD6670`), et le retient dans `0xD6678`.

### 6.5 Le traceur, `0x5ED21`

Il écrit toujours dans la surface de dessin `[0xDE5BC]`, jamais en mémoire vidéo. Il décode le
format de ligne des banques d'images (longueur positive : pixels bruts ; négative : pixels
transparents ; zéro : fin de ligne) et coupe aux bords d'une fenêtre (`0xDE5D0` gauche, `0xDE5E0`
haut, `0xDE5C8` largeur, `0xDE5F0` hauteur). Les drapeaux de `0xBECBC` choisissent une variante :

| Bit | Effet |
|---|---|
| 0 | miroir horizontal |
| 1 | miroir vertical |
| 2 | fusion avec le fond par une table de 64 Ko, `[0xBA2F8]` : transparences et ombres |
| 3 | compression horizontale |
| 5 | agrandissement entier |
| 6 | silhouette d'une couleur unie |

**Réécrit** dans `moteur/jeu/traceur.js`, avec ses enveloppes. Ce que la réécriture a établi :

- **La fenêtre est toujours à l'origine.** `0x87790(gauche, haut, largeur, hauteur)` la pose, avec
  `[0xDE5EC]` = gauche + largeur ; ses deux appelants la placent en (0, 0), en 320x200 ou en
  640x480. `0x7DDD7` la remplace un instant par un carré de 64 pour décoder une image dans un
  tampon à part.
- **Une seule variante s'applique** : la première posée dans l'ordre 1, 2, 4, 8, 0x20, 0x40 ; un
  drapeau inconnu donne le tracé simple. La fusion pose `table[fond × 256 + image]`.
- **Les paramètres.** Le second vaut toujours 0 ; le premier n'est non nul que par `0x11BD5`, où il
  donne la couleur de la silhouette. Ce que trace `0x11BD5` (près de 300 000 fois dans la démo) :
  les signes de la police de l'interface (§ 11.2). `0x117B3` trace une silhouette d'une couleur,
  `0x11AF4` une image enfoncée dans le sol (§ 11.16).
- **Les enveloppes.** Le code C prend `0x5EC9C` en mode 1 et `0x55BD4` sinon. `0x11AF4` et
  `0x11BD5`, en assembleur, passent par `0x5ED0C` en mode 1 et appellent le traceur directement en
  mode 8.
- **Anomalies, reproduites.** Une image retournée tombe un pixel plus à droite et plus bas que
  l'image droite. Une image coupée à gauche ou à droite avec un drapeau autre que les miroirs n'est
  pas tracée du tout, ce qui arrive dans le parc. Une image qui déborde en haut et en bas n'est pas
  coupée en bas. Les compteurs des découpes sont des octets et débordent au-delà de 127 pixels,
  ce qui arrive en 640x480. Le miroir vertical coupé en bas perd le coin de la fenêtre (`0x5F4DF`),
  sans effet puisqu'elle est à l'origine.
- **Non vérifié par les scénarios** : le miroir vertical, la fusion, la compression,
  l'agrandissement et les découpes des miroirs, qu'aucune image des deux scénarios n'emploie.

### 6.6 De la surface de dessin à l'écran

En mode 1, l'image entière est recopiée à chaque tour (`0x80E20` pour le fond, `0x80210` pour
l'écran). En mode 8, l'écran est découpé en blocs de 32x16 — 20 colonnes, 30 rangées, grille à
`0xD671D` — et seuls les blocs touchés circulent : le tracé d'un sprite y inscrit 3 (`0x54D38`), la
restauration du fond (`0x54ED6`) et la présentation à l'écran (`0x55507`) décrémentent chacune ce
compteur. **3 est le minimum** : dans un tour, la restauration précède le dessin des sprites, qui
précède la présentation ; un sprite qui quitte un bloc y demande la présentation de l'image où il
est dessiné, la restauration du fond qui l'efface de la surface, puis la présentation de cette
restauration, qui l'efface de l'écran.

Les 24 sites de présentation sont tous `(mode & 1) ? 0x80210(400) : 0x55507()` ; `0x80210` ignore
son argument. `0x55507` présente les blocs par bandes (`0x55DE6`), banque VESA par banque (`0x7E6BC`,
qui convertit la banque selon la granularité de la carte, le mot `0xDE5FC` — et non `[0xDE5FA]`
comme on l'a d'abord écrit ; une banque hors de 0 à 5 passe la couleur 0 au rouge, une alarme de
mise au point restée dans le jeu ; une granularité nulle ferait planter l'original). `0x54CE4` vide
la grille ; `0x55B86` remplit un rectangle en marquant ses blocs.

**Le curseur est logiciel.** Avant chaque présentation, `0x7D775` le **pose dans l'image** — s'il est
affiché (`[0xBECB4]` non nul) : il le dessine dans la surface par `0x7D2DD`, garde les pixels
recouverts dans `[0xDE564]` et `[0xDE554]`, marque 64x64, et pose `[0xBECA4]`, qui suspend le tracé
direct du pointeur à l'écran par le gestionnaire de souris `0x7D7E2`. Après la copie, `0x7D7C7` lève
seulement ce drapeau (le pointeur reste dans la surface, que la restauration du fond effacera) ;
`0x7D79E` remet d'abord les pixels (`0x7D6C5`). C'est ce passage obligé que l'hôte prend pour repère
d'image.

**Le curseur, réécrit** dans `moteur/jeu/systeme.js`. Trois tampons de 4 Ko pris sur le tas du jeu
par l'installation de la souris (`0x7DF44`) : `[0xDE590]`, l'image du pointeur décodée dans un carré
de 64x64 (pas `0xDE594` = 64, taille `0xDE58C`/`0xDE58E`) ; `[0xDE564]` et `[0xDE554]`, deux copies
des pixels recouverts (la seconde pour le tracé direct `0x7D4F9`). `0x7DDD7` décode l'image
(`[0xBECB8]`, pour 640x480, divisée par deux en 320x200) : le carré est rempli de `0xFE`, **la
couleur transparente**, puis l'image y est tracée par le traceur ordinaire, la surface, son pas, la
fenêtre et les drapeaux détournés le temps du tracé. `0x7D2DD` pose le curseur : position divisée
par deux en 320x200, coupé **au bord droit et au bord bas seulement** (il ne sort pas par la gauche
ni par le haut), seuls les pixels non transparents posés, et 64x64 marqués pour la présentation
même si l'image est plus petite. Les variables de travail, de `0xDE54C` à `0xDE59C`, sont en
mémoire comme dans l'original. Le gestionnaire de souris écrit ces tampons à chaque interruption,
donc pendant n'importe quelle fonction : la comparaison appel par appel doit les remettre entre ses
deux exécutions (journal des essais, § 5.8). `0x7D775` reste en attente : l'hôte l'enveloppe pour
faire avancer son horloge d'une image.

**Les rafraîchissements totaux.** Quand l'octet `[0xD6BCD]` est posé, l'image entière circule, sans
la grille : `0x54ED6` recopie tout le fond (`0x81CB0`, 480 lignes) et vide la grille, `0x55507`
présente tout (`0x81CD4`, ou en ligne quand un écran plein est affiché). Il est posé par `0x40D3E`,
qui pose aussi l'écran plein `[0xB150F]` et vide la grille ; `0x40D79` lève les deux et demande un
redessin de la carte. La boucle du parc le pose aussi pour les écrans `0x4A`, `0x54`, `0x56` et
`0x64`, et présente alors l'image entière sur place (`0x12316`).

**Réécrit** dans `moteur/jeu/presentation.js` (sept fonctions). Non établi : le rôle exact de
l'écran plein ; pourquoi `0x55507` marque 32x32 sous la souris en plus des 64x64 de la pose du
curseur.

**Changement de mode.** `0x10D42` remet les données à l'échelle *en place* : décalages des
morceaux et emprises des objets sont doublés ou divisés par deux. Dans le parc, la touche R bascule
entre les deux modes (table des touches `0x13CDA`, cas en `0x140AF`), seulement si `[0xD7795]` vaut 9.

**La minuterie.** `[0xB14B5]` compte les tics de l'interruption de la minuterie du jeu (`0x5CA82`) :
diviseur 16 384, soit 72,83 Hz ; le gestionnaire enchaîne vers celui du BIOS tous les 4 tics
(§ 6.9).

### 6.7 La souris et le défilement de la vue

**Le relevé de la souris**, `0x10992`, interroge le pilote (fonction 3 de l'interruption `0x33`) et
range la position en `0xBECAC` (horizontale) et `0xBECAE` (verticale). Pour chaque bouton, deux
mots : l'un vaut 1 tant que le bouton est enfoncé, l'autre passe à 1 à l'appui, et c'est à celui
qui le traite de le remettre à zéro.

| Bouton | Maintenu | Appui |
|---|---|---|
| gauche (bit 0 du pilote) | `0xDE5AC` | `0xDE5A6` |
| droit (bit 1) | `0xDE5AA` | `0xDE5A4` |

L'octet `0xBECB2` choisit la source des entrées : 0 en jeu normal, 1 avec l'option `-r`
(enregistrement : les entrées de la souris et du clavier sont copiées dans le tampon `[0xD3AEC]`,
6 octets par image, 4 000 images au plus), 2 avec l'option `-p` (relecture de ce tampon à la place
du pilote). La ligne de commande est lue par `0x10010` (§ 11.6). **En jeu normal, `0x10992` n'est
pas appelée** : c'est le gestionnaire ci-dessous qui tient position et boutons ; `0x1107F` ne
l'appelle qu'avec `-r` ou `-p`. **Et avec `-r` ou `-p`, le jeu quitte avant la première image**
(§ 11.6) : `0x10992` est du code mort dans le jeu publié. Elle est réécrite (`souris-jeu.js`) et
reste en attente, aucun scénario ne pouvant l'exercer.

**Le gestionnaire de souris**, `0x7D7E2`, est la routine que le pilote appelle à chaque événement
(fonction `0x0C`). Il ne se contente pas de recopier la position du pilote :

- **en 320x200, il suit la souris par écarts** : il ajoute à sa position (`0xBECAC`, `0xBECAE`)
  l'écart entre la position du pilote et la précédente (`0xBEC94`, `0xBEC96`), et borne le tout à
  0–638 × 0–478. Le pilote est borné à 0–638 × 0–398 (`0x11303`) ;
- **en 640x480, il part de la position du pilote**, divisée par 8 (le pilote y est borné à
  0–5104 × 0–3824, huit fois plus finement) ; mais quand un outil est choisi (`0xD6670` vaut 1 à 4,
  10 ou 16), il y ajoute **encore** l'écart depuis la précédente. Avec les petits pas rapprochés
  d'une vraie souris, ce double compte ne se voit guère ; avec un grand pas, le curseur part au
  double de la distance ;
- **pendant le tracé d'un chemin** (outil choisi, `0xB14C2` = 4, bouton gauche maintenu), il
  projette l'écart sur les axes obliques de la carte (`0x80BF2`, valeur absolue : si |2·dy| > |dx|,
  seul dy/2 s'ajoute à l'horizontale), et range la position obtenue dans `0xB14E2`/`0xB14E4`. La
  boucle principale (`0x11D45`) replace alors le pointeur du pilote à cet endroit (`0x11191`, qui
  appelle la fonction 4 du pilote, en multipliant par 8 en 640x480) : le pointeur reste collé à la
  grille. En 640x480, ce parcours ajoute deux fois l'écart vertical : le curseur y descend deux
  fois plus vite que la souris pendant un tracé.

Le jeu replace aussi le pointeur au centre, `0x11191(320, 200)`, après avoir changé la plage du
pilote : au passage d'un mode à l'autre (touche R, `0x13BF3`), et à l'ouverture comme à la
fermeture d'un écran plein par-dessus le parc (`0x5C04F`, `0x5B88D`, `0x5BBC6`).

**Les zones de l'écran du parc.** Une table en `0xB93C3`, 12 octets par zone, terminée par une
abscisse négative : le rectangle (x0, y0, x1, y1, mots signés), un mot dont le rôle n'est pas
établi, puis des indicateurs à +10. À chaque image, `0x145FB` parcourt les zones qui contiennent le
pointeur. Pour chacune, le survol d'abord, puis la première action dont la condition est remplie,
qui met fin au parcours :

| Indicateur | Condition | Appel |
|---|---|---|
| `0x01` | toujours, sauf si l'octet `0xB14C6` est levé | survol, `0x149A4` |
| `0x20` | mot `0xDE5A0` levé (par le gestionnaire de souris `0x7D7E2`, rôle non établi) | `0x1803C` |
| `0x02` | appui du bouton gauche | `0x15FBD` |
| `0x04` | appui du bouton droit | `0x1788D` |
| `0x08` | bouton gauche maintenu | `0x175B5`, interface (non établi pour les bords) |
| `0x10` | bouton droit maintenu | `0x18003` |

Les actions `0x20`, `0x02` et `0x04` sont elles aussi suspendues quand `0xB14C6` est levé. Chaque
action remet à zéro le mot d'appui correspondant.

Les quatre premières zones sont les bords de l'écran, des bandes de 2 pixels : haut (0), droite
(1), bas (2), gauche (3). Leur numéro vaut directement une direction de `0x183EC`, et leurs
indicateurs valent `0x19` : les trois voies y mènent.

**Au survol d'un bord**, `0x149A4` lève l'octet `0xB14B1` et appelle `0x47598`. Au premier appel,
celle-ci arme une échéance, `0xB14E9` = tics de la minuterie (`0xB14B5`, 72,8 par seconde) + 15 ;
la vue ne défile qu'une fois l'échéance passée, puis à chaque image, deux fois en haute résolution.
À la fin de chaque image, si `0xB14B1` est resté baissé, `0x145FB` remet l'échéance à -1 : quitter
le bord, ne serait-ce qu'une image, fait repartir le délai d'environ 0,2 seconde.

**Au bouton droit maintenu sur un bord**, `0x18003` défile à chaque image, sans délai, mais
seulement dans la vue du parc (`0xD6652` nul). S'y ajoute la règle de `0x183EC` : en basse
résolution, le défilement n'a lieu qu'une image sur trois, sauf jeu en pause.

**Pendant un tracé** (bouton gauche maintenu avec un outil qu'on fait glisser), un cinquième
défilement : `0x47268`, appelée par `0x175B5` juste avant qu'il poste la demande de l'image,
enferme le pointeur dans la vue et, s'il en touche un bord, avance la caméra d'une case dans le sens
`0xB14E8` du tracé (§ 11.15). C'est ce qui permet de tracer un chemin plus long que l'écran.

**Les deux boutons ensemble**, quand l'octet `0xD7798` est nul (la table des zones est alors
ignorée), font `origineDessinX` = `0x70`, `0xD7798` = 1, caméra +3 colonnes, et remettent les
quatre mots des boutons à zéro. Le rôle de `0xD7798` n'est pas établi.

**Réécrit** dans `moteur/jeu/interface-parc.js` (le parcours des zones, le survol, le bouton
maintenu, le double-clic, la pose de l'entrée du parc) et `moteur/jeu/carte.js` (le défilement).
Ce que la réécriture a établi en plus :

- **Les 31 zones** : les quatre bords (0 à 3) ; les dix boutons de la barre d'outils (4 à 13 :
  chemins, barrières, attractions, boutiques, décors, personnel, carte, mode question, les deux
  barres de jauges, l'argent) ; deux panneaux inertes (14, 15) ; les six réglages de l'objet choisi
  (16 à 21 : remplissage, durée, fiche, sécurité, ouvrir ou fermer, vitesse) ; les sept icônes du
  coin haut droit (22 à 28), sans survol ; la vue du parc (29) ; la barre des messages (30). Les
  ordonnées du bas sont nulles dans le fichier et posées au lancement : 360–400 en basse
  résolution, 440–480 en haute. Les octets +8 et +9 d'une zone sont la première et la dernière
  image de l'animation d'un bouton pressé.
- **Le survol de la vue du parc** calcule la case sous le pointeur — colonne = (10·L + x −
  origineX − y/2) / L − 10, rangée = y / H —, en dessine les quatre coins par de petits points
  blancs, et montre l'aperçu de l'outil en cours.
- **Les outils** (`0xD6670`) : 1 murs, 2 chemins, 3 barrières de file, 4 rivière, 5 et 26
  attractions, 6 boutiques, 7 arbres et décors, 8 mode question, 9 personnel, 10 rails, 11 entrée
  et 17 sortie d'une attraction, 15 panneaux, 18 looping, 19 employé qu'on déplace, 21 mécanicien
  qu'on envoie, 22 entrée du parc ; 12, 13, 14, 16 et 20 restent non établis (l'outil 20 poste la
  demande `0x2C` avec l'objet choisi). Chacun a sa fiche courante et son aperçu ; ceux qu'on trace
  en glissant (murs, chemins, barrières, rivière, rails) postent une demande de pose dans la table
  `0xD441F` + 6 × joueur, comme le clic (§ 11.5).
- **Les infobulles** : le mot `0xD661E` porte le numéro du texte à afficher, que la barre des
  messages (`0x5CBDB`) met en forme puis efface. Les 37 textes vont de « chemin possible » au zoom
  sur l'employé suivant.
- **Le double-clic** vient du gestionnaire de souris : il lève `0xDE5A0` si le compte à rebours
  `0xDE59E`, armé au premier clic à la valeur de `0xBECB0` (10, posée une fois pour toutes par
  `0x12452`), n'est pas épuisé. **Correction** : ce compte n'est pas décompté par image mais **par
  pas de simulation** (`0x12B1F`) ; le double-clic est donc d'autant plus facile que le jeu est
  lent, et en pause il ne s'épuise pas.

**Le gestionnaire de souris, réécrit** dans `moteur/jeu/souris-jeu.js` avec le tracé direct du
curseur (`0x7CFC6`, `0x7D4F9`) et les commandes du pilote (`0x11303`, `0x11191`, `0x1142A`).
`0x7D7E2` n'est pas un appel ordinaire : le pilote lui passe le masque de l'événement dans `eax`
(1 déplacement, 2 et 4 appui et relâchement gauches, 8 et `0x10` droits, `0x20` et `0x40` le bouton
du milieu), la position dans `ecx` et `edx`, et il rend la main par un retour lointain. Dans
l'ordre :

1. la garde de réentrance `0xBEC98` ;
2. en 640x480, curseur (`0xBECAC`, `0xBECAE`) = position du pilote / 8 ;
3. `0xB14E2` et `0xB14E4` remis à `0xFFFF` (rien à imposer au pilote) ;
4. les écarts depuis la position précédente (`0xBEC94`, `0xBEC96`) ;
5. arrêt si le curseur est caché (`0xBECB4` nul) ;
6. la branche de l'outil en main (`0xD6670`) : les écarts, la projection oblique ou le saut au coin
   de la case ;
7. le plafond commun du curseur, 638 × 478 ;
8. les boutons : un premier appui note la position du curseur en `0xBECA8`, `0xBECAA` ; le bouton
   du milieu a ses propres mots, `0xDE5A2` à l'appui, `0xDE5A8` maintenu ;
9. si le curseur n'est pas déjà posé dans l'image (`0xBECA4` baissé) : l'effacer puis le retracer
   directement dans la fenêtre vidéo, et remettre la banque VESA qui était montrée (`0xBECDC`,
   gardée en `0xDE596`).

**Le saut au coin de la case.** Quand l'outil et la zone sont ceux de l'appui précédent et qu'on
appuie sur le bouton gauche sans le tenir encore, le curseur saute au coin de la case visée :
x = 48 · colonne + 16 · rangée + origineX + 30 (15 en 640x480), où la colonne est `0xD6662` et la
rangée `0xD666A`, et y = 32 · rangée + 16 ; en 640x480 les deux sont divisés par deux et x reculé
de 7. Comme la projection oblique, il range la nouvelle position en `0xB14E2`/`0xB14E4` pour que la
boucle du parc y replace le pointeur du pilote.

**Le double comptage**, mesuré : en 640x480 avec un outil de tracé en main (1 à 4, 10 ou 16), le
curseur va à « pilote + écart ». Viser un point en boucle fermée n'y converge pas : l'erreur change
de signe sans diminuer, ce que le compositeur de scénarios signale par des visées manquées. Le
scénario `trace-haute.json` l'exerce (dix double comptages, 471 projections, trois sauts au coin).

**Le pointeur du pilote.** `0x11191` le place (fonction 4, position multipliée par 8 en 640x480),
avec deux particularités : une abscisse nulle ou négative est envoyée au pilote sans que le curseur
du jeu soit mis à jour ; une ordonnée nulle ou négative est ignorée, et c'est l'ordonnée courante
du curseur qui part au pilote. `0x11303` borne le pilote à 638 × 398 en 320x200, 638 × 478 (× 8) en
640x480, et ne fait rien pour un autre mode. `0x118FE`, appelée par la carte du monde, efface
`0xB9ED8`, qui garde pour chacun des sept écrans pleins l'écran d'où l'on vient.

**Anomalies reproduites** : le double comptage ; curseur caché (`0xBECB4` nul), le gestionnaire
s'arrête sans baisser sa garde de réentrance, et reste ensuite bloqué ; sans outil en main, aucun
plancher n'est appliqué au curseur, seulement le plafond ; la borne 640 appliquée à x en 320x200
ne sert jamais, le pilote y étant borné à 638 ; l'octet `0xBECB3` est posé à 1 et jamais relu ; dans
`0x11191`, le premier test (« x et y valent −1 ») ne décide de rien, le second (« x vaut −1 »)
suffit. **Non établi** : le rôle de l'outil 16, qui mène pourtant à la branche des outils ; celui de
`0xBECB3` ; la fonction `0x2F` du pilote, que l'hôte n'implémente pas (sans effet sur les preuves).

### 6.8 Le dessin de chaque type d'objet

Réécrit dans `moteur/jeu/dessin-objets.js` (visiteurs, kiosques, personnel, boutiques, voies,
entrée et panneaux, la petite police) et `moteur/jeu/dessin-attractions.js` (attractions,
véhicules, désignation). `0x1C22A` donne à chacune le coin de la case ; trois points de pose,
écrits en dur pour les deux modes :

- la **position fine** de l'objet, ses mots `+6` et `+8` en 256es de case, projetée comme au § 5.1 —
  visiteurs, personnel, boutiques, attractions, véhicules, objets animés ;
- le **milieu du bord bas** — kiosques, panneaux, objets fixes, toilettes ;
- le **centre** — l'entrée du parc et les morceaux de voie.

**Les visiteurs** (`0x1C9E2`) ont leur propre table d'états : vingt-deux sont dessinés normalement,
la descente d'une attraction décale le visiteur d'une marche, le circuit ne le montre que sur un
sol de canal, les toilettes le cachent, l'auto du circuit de voitures est habillée à sa sorte, et
celui qu'un incident a projeté est agrandi. Le dessin normal empile, dans cet ordre : le parapluie
par temps de pluie, le visiteur, ce qu'il porte (un gobelet, un ballon, le lot gagné au jeu
d'adresse…), sa bulle de pensée, puis la marque s'il est sélectionné. Chaque genre de visiteur a sa
ligne d'images (table `0xB9A78`, 47 images par genre).

**Les kiosques** (`0x1C5E9`) portent l'enseigne défilante de leur attraction : le nom du genre et
une note en dixièmes, écrits en petite police dans une fenêtre de six caractères dont la position
avance tous les 8 pas — **et seulement quand le kiosque est à l'écran**, puisque c'est le dessin
qui la fait avancer.

**Le personnel** (`0x1E9A7`) : l'employé renvoyé part dans un nuage de fumée, le gréviste porte sa
pancarte, l'agent d'entretien qui a une tournée porte sa marque, et le mécanicien au travail fait
entendre son marteau.

**Les boutiques** (`0x1ECD6`) sont dessinées morceau par morceau : un morceau « habillé » montre le
client en cours, vêtu selon son genre ; une pancarte s'ajoute quand la marchandise est épuisée.

**Les attractions** (`0x1D87A`, `0x69840`). L'attraction usée tremble et fume ; passé le double du
seuil, elle explose — le château gonflable se dégonfle en grossissant, les avions montent d'un pixel
par pas. Les places des passagers sont **dans l'objet graphique lui-même** : un morceau marqué,
dont l'image est un visiteur de la sorte 0. Selon la disposition de la fiche, les places tournent
avec l'animation ou restent fixes ; chaque passager y prend l'image de son genre. Le labyrinthe ne
montre qu'un visiteur à la fois, et le spectacle fait applaudir ses spectateurs à l'entracte. Le
nombre de places est celui de la **fiche** du genre, que la recherche fait croître : au-delà de
41 places, l'anneau interne déborde et le jeu d'origine plante.

**Les véhicules** (`0x1DD27`) prennent leur figure et leur altitude du morceau de voie sous eux ;
seule la tête d'un train joue les bruitages, et un wagon qui roule sur une attraction usée tremble.
Le bus se dessine en sections — avant, milieu, arrière — selon son modèle, et le clic dessus ouvre
l'écran d'agrandissement du bus.

**La désignation** (`0x20FF5`) se fait pendant le dessin (§ 6.3) : chaque objet regarde si le
pointeur tombe sur lui, selon l'outil en cours — l'outil d'information ouvre la fiche d'un
visiteur, d'un employé ou des toilettes ; l'outil du mécanicien l'envoie réparer ; un clic sur
l'entrée du parc l'ouvre. Quand plusieurs objets se recouvrent, le bouton maintenu retient le
dernier dessiné, c'est-à-dire le plus en avant, tandis qu'un clic ouvre la fenêtre du premier, le
plus au fond.

**La petite police** (`0x80E88`, `0x80F34`) : des caractères de 3×6 pixels, quatre de chasse, dont
chaque rangée est choisie par une table de sauts parmi huit motifs. C'est elle qui écrit les
enseignes des kiosques.

**Un morceau de voie et ses wagons** (`0x1FEB5`, `moteur/jeu/voies.js`) : le rail, puis les wagons
chaînés depuis son mot `+0x7A`, chacun avec ses passagers (images de la table `0xB9A78`,
recentrées), puis une figure (`0x16E`) si son mot `+0x16` vaut 1. Au-dessus de 1, l'octet `+0x12`
d'un wagon fait remplacer l'objet graphique du rail par le second, `+0x90` du morceau (non établi).
**Anomalies reproduites** : en vue réduite la fonction sort aussitôt sans remettre `0xBECBC` à zéro
(sa branche de tracé à l'échelle réduite ne sert donc jamais), et ne le remet pas non plus après la
figure. `0x20F4C` trace une image de l'interface, au double par `0x66DFA`, sans ses drapeaux, en
640x480.

### 6.9 La minuterie, la carte vidéo et la bascule en 320x200

Réécrites dans `moteur/jeu/ecrans-infos.js` (la minuterie, l'écran), `moteur/jeu/systeme.js` (la
carte vidéo) et `moteur/jeu/amorcage.js` (la bascule).

**La minuterie.** `0x5CAD0`, appelée par le lancement (`0x104A3`), pose `0x5CA82` sur
l'interruption 8 et programme le circuit à diviseur `0x4000` : 72,83 Hz, quatre fois les 18,2 Hz du
BIOS. Le gestionnaire compte les tics en `0xB14B5` ; une fois sur quatre il passe la main au
gestionnaire du BIOS, qui garde ainsi son heure, les autres fois il acquitte l'interruption
lui-même. Avec une carte son, SOS a sa propre minuterie : le jeu s'y abonne (`0x822F4`, 60 Hz) avec
`0x5CA6B`, qui ne fait que compter ; l'adresse `0xE3000` passée à cet abonnement reçoit la poignée
de l'événement. `0x5CB6C`, en sortant (§ 11.21), défait l'un ou l'autre : désabonnement (`0x8260A`)
si SOS tenait la minuterie, sinon diviseur d'origine (0, soit 65 536 : 18,2 Hz) et gestionnaire du
BIOS remis sur l'IRQ 0 (`[0xD78B0]`, `[0xD78B4]`, par `_dos_setvect`).

**Les deux modes.** `0x7EC50` passe en mode 13h, `0x7ECF0` en VESA `0x101`, puis posent la palette,
la souris et la fenêtre. `0x7E580` lit les informations du mode (`4F01h` par le DPMI `0300h`, une
interruption en mode réel) dans le bloc `[0xDE5F8]` et en garde la granularité (mot +4) en
`0xDE5FC` ; `0x7E658` choisit le mode (`4F02h`) ; `0x7E6BC` place les deux fenêtres A et B de la
carte au même endroit (`4F05h`, int 10h directe) et note la banque en `0xBECDC`. `0x808B0` pose les
256 couleurs dans le DAC ; `0x80250` cherche la couleur de palette la plus proche (distance
euclidienne au carré ; 16 couleurs seulement dans les modes 2 et 4) ; **`0x80BE4` attend le retour
du balayage vertical** (bit 3 du port `0x3DA`), il n'efface pas la palette (`fenetres.js` la nomme
encore `EFFACER_LA_PALETTE`) ; `0x80C00`/`0x80C40`
posent un pixel, `0x7F5BC`/`0x81D88` un rectangle plein (avec fusion si le bit 4 de `0xBECBC` est
posé), `0x81590` remplit des lignes de 320 octets, `0x815B8` de 640 (réécrite pour l'heure dans
`sortie.js` ; `edi` sort au bout de la zone, non sauvé). `0x7C282` efface l'écran, présente l'image au
retour du balayage et pose la palette ; `0x7C32D` revient à la palette du parc `[0xD3B8C]` après un
écran à part (ses trois autres gestes : `0x4820D(8, 0xCEBE0)`, `[0xD380C]` = 0, `[0xD777F]` = 8,
non établis). `0x55EFA` double une image 320x200 en 640x480 (simple recopie en 320x200), `0x55FCF`
efface la mémoire vidéo : la fenêtre `0xA0000` en 320x200, cinq banques en 640x480.

**La bascule en 320x200.** Des écrans pleins à part se dessinent en 320x200 — l'écran des
recherches toujours, même lancé en 640x480 (§ 11.10) : `0x1171F` y passe depuis le 640x480 et lève `0xB1510`,
`0x11761` en revient. Un écran ouvert alors que la basse résolution est déjà forcée par un autre
lève `0xB9758` et ne change pas de mode, ni en entrant ni en sortant.

**Anomalies reproduites.** `0x80250` compare la distance sur ses 16 bits bas, signés : au-delà de
32 767 elle paraît négative, donc plus proche ; le meilleur part de 9 999, et si aucune couleur ne
passe sous ce seuil le résultat est un reste de pile (24 octets sous l'entrée). `0x7C282` teste
400 ou 480 lignes dans une branche où c'est toujours 480. Une largeur nulle ferait tourner la
fusion de `0x7F5BC`/`0x81D88` 2³² fois, une hauteur nulle 65 536 lignes (aucun appel ne le fait).
`0x55EFA` teste son compteur de lignes, sur 16 bits, après usage : moins de deux lignes en font
lire 65 536, et au-delà de 400 la mise à zéro des 80 lignes du bas déborde (les appelants demandent
toujours 400). `0x81590` ne rend pas `edi`, ce qui oblige ses appelants réécrits (l'écran des
recherches) à rendre les registres comme l'original.

---

## 7. Les parties et les joueurs

**Le menu principal** : F1 nouveau propriétaire, F2 charger une partie, F3 continuer la partie, F4
revoir l'introduction, F5 remerciements, F6 retour au DOS. Au bout de 3 000 images sans rien
toucher (une centaine de secondes), la démonstration se lance (`0x5B55A` ; `0x5B82A` l'arrête) —
seulement si `save/demo.gy` existe (`0xB14AE`, § 11.9).
L'écran titre, `0x1A836`, a sa propre boucle : tant que le joueur n'a pas de nom, il le demande
(`0x793B1`, § 11.4), puis il écrit ses six lignes et attend un clic ou une touche de F1 à F6.
Anomalie reproduite : sur une partie commencée sans fichier, cliquer « continuer la partie » ne
ferme pas l'écran plein (`0x40D79`), alors que F3 le ferme. F4 (revoir l'introduction) fait sortir
le programme avec le code 10 (ce que le lanceur d'origine en faisait n'est pas établi). L'écran titre est toujours en 320x200, même ouvert depuis le 640x480
(§ 11.4).

**Les fichiers de sauvegarde** portent le nom du joueur, c'est-à-dire le **surnom** de sa fiche
(`0xD66B0`, § 11.4), celui qu'on tape à l'écran titre : `save/<nom>.GY`, la partie en cours, que
reprend « continuer la partie » ; `save/<nom>.G0` à `.G9`, les dix emplacements de « charger une
partie » ; `save/<nom>.GD`, la fiche du joueur. La démonstration joue le parc `save/DEMO.GY` : un
joueur qui s'appelle DEMO et choisit « continuer la partie » joue donc dans le parc de la
démonstration. Le format est au § 11.6.

**Les fiches des joueurs** : une table en `[0xD3B00]`, 25 fiches de 546 octets (`0x222`), le joueur
et ses concurrents ; celle du joueur est la fiche 0. Le mot `0xD665C` désigne le joueur courant, dont `[0xD3808]` pointe la fiche ; ses
comptes et la fiche de son parc sont décrits au § 10.8. Dans une fiche : +0x0A le solde en banque ;
+0x0E la somme engagée, retranchée du solde affiché au panneau (§ 11.8) — le prix des attractions
posées et pas encore payées (§ 10.3, § 11.5), mais aussi, en `0x22145` et `0x2F344`, cent fois
l'argent d'un visiteur, ce qui n'est pas établi ; +0x12 le prêt ; +0x37 les dépenses. Le pas
de simulation (`0x12B1F`) traite une fiche à chaque pas, par `0x49B5B` : un joueur à découvert voit
monter un compteur (+0x35) et, passé un seuil lié à son prêt, la banque lui prête d'office 50 000,
ajoutés au prêt et au solde (sous une condition sur une autre valeur, non établie).

**Le code de triche est « HORZA »**, et c'est un nom de joueur. La recherche en clair ne pouvait rien
donner : `0x2EA62` décale chaque lettre du nom (`[0xD66B0]`) vers la gauche de son rang — H inchangé,
O d'un bit, R de deux, Z de trois, A de quatre — avant de comparer les cinq octets obtenus à la table
`0xB8C58` (`48 9E 48 D0 10`). Les bits sortis de l'octet étant perdus, d'autres noms passent aussi,
« HORZQ » par exemple. La fiche du joueur rappelle `0x2EA62` quand on quitte sa ligne SURNOM après
l'avoir changée (§ 11.4) : on peut donc devenir tricheur en cours de route. **Correction** : on ne
cesse pas de l'être par ce chemin — `0x2EA62` lève le mot `0xD6682` pour « HORZA » et ne le baisse
jamais ; un autre nom le laisse tel qu'il était. Le mot `0xD6682` levé, le parc accepte des touches
de plus (§ 11.1) :

| Touche | Effet |
|---|---|
| `C` | +50 000 au solde, et le jeu affiche « C'EST VOUS VIENT D'UTILISER LE CHEAT MODE » |
| `Ctrl+C` | +15 536 au solde (événement `0x38`, écran `0x56`) |
| `Alt+Z`, `Ctrl+Z`, `Maj+Z` | rendent disponibles tous les articles des catalogues des attractions, des boutiques et des décors — le bit que lève d'ordinaire la recherche |
| `F8`, `8` | ouvrent les écrans `0x32` et `0x4C` (`0x44EA5(2)` et `(4)`) : les négociations salariales et commerciales (§ 10.15) |

Vérifié en jeu : sous le nom HORZA, `C` fait passer le solde de 150 000 à 200 000.

**La fiche du joueur sur disque** (`moteur/jeu/voies.js`, où le découpage du chantier l'a rangée).
`0x2E9E8` **écrit** les 0x8D octets de `0xD6690` (VOTRE NOM en tête, puis le surnom, le nom du parc,
les réglages et l'argent de départ, § 11.4) dans `save/<surnom>.GD`, ouvert en mode `0x222`
(création) ; elle rend 1, ou 0 si le fichier ne s'ouvre pas. C'est `0x2EA62` qui la relit : après la
vérification du code de triche, elle ouvre `save/<surnom>.GD` et en recharge `0xD6690` (rend 1) ; à
défaut (rend 0), elle prépare une partie neuve — l'argent de départ du niveau choisi (table
`0xB7F7C`), aucun pays vendu (32 octets de `0xD66F8` mis à zéro), et les drapeaux du mode de
simulation (MATERNELLE, SIMULATION, BUSINESS). Non exercé : la voie « fiche trouvée ».

**La fin d'une partie** a deux issues animées (§ 11.20) : la faillite, que la fin d'année prononce
contre un joueur déjà averti (« VOUS FEREZ FAILLITE L'AN PROCHAIN », message `0x64`), et le rachat
d'un parc par ses actions (`0x4A571`). Après la faillite, le jeu revient au menu titre, et la
démonstration reprend au bout de 3 000 images sans geste. F6, au menu titre, quitte le programme
(§ 11.21). **Les niveaux** changent ce que le jeu montre : l'écran des nouveautés (§ 11.19) ne vient
qu'aux niveaux 0 et 1 (`0xD66F1` ≠ 2 : SIMPLE ou SIM. de la fiche du joueur, MATERNELLE ou
SIMULATION des menus), jamais au niveau 2 (GLOBALE, BUSINESS), celui des nouvelles parties par
défaut et de la démonstration ; l'entrepôt ne répond qu'au niveau BUSINESS (§ 11.12),
et un voyou ne va aux boutiques qu'à ce niveau (§ 10.14).

## 8. Ce qui reste à établir pour le document de conception

Par ordre d'utilité pour la réécriture. Les visiteurs, les attractions, le personnel, les
véhicules, l'économie, les concurrents et la fin d'année sont établis pour l'essentiel (§ 10) ; il
en reste surtout ce que les scénarios n'exercent pas (§ 10.10).

1. **Les visiteurs** : les états peu fréquentés (0x2C, 0x2E, 0x32, 0x42 à 0x46 ; 0x28 et 0x2A sont
   des états d'employé, 0x48 le nuage d'une explosion, § 10.2), les jauges et la bulle « pas bon ».
2. **Les attractions** : les incidents (jamais atteints, § 10.3) et la sécurité ; le monorail et
   les explosions sont établis (§ 10.16, § 10.17).
3. **Les boutiques** : le dosage, et la consommation des stocks (les champs sont au § 10.4) ; la
   commande et la livraison sont établies (§ 11.12).
4. **Le personnel** : la paie ; les voyous, le gardien, les tournées, la tonte et les grèves sont
   établis (§ 10.13 à § 10.15), sauf les toilettes et l'état 0x1A de l'agent d'entretien, qu'une
   seule longue partie exerce.
5. **La construction** : la pose d'une attraction, d'un mur, des rails et d'une boutique est
   établie (§ 11.5), comme l'élévation des voies, l'écran des recherches (§ 11.15, § 11.10) et les
   outils 4, 12 à 16, 18 et 20 (§ 11.17) ; restent MEGA SPLASH, ce que la recherche fait avancer
   (les mots `+0x120` de la fiche du parc) et `0x44BB8`, qui ôte les rails du monorail.
6. **Les niveaux** : les pays et leurs prix sont établis (§ 11.4), comme les négociations
   (§ 10.15) ; restent les objectifs.
7. **Le format des sauvegardes** `.GY` : établi (§ 11.6), 53 blocs écrits à la file, sans
   en-tête ; restent les rôles de plusieurs variables sauvegardées.

La méthode : pour chaque système, partir d'une fonction identifiée, nommer ce qu'elle touche,
retrouver les tables de constantes associées, puis écrire le chapitre avec les nombres exacts.

---

## 9. Le son

Le jeu passe par la bibliothèque **HMI SOS 4**, liée dans `MAIN.EXE` et donc transcrite, et par une
couche de Bullfrog qui la pilote. Deux voies :

- **la musique** : le séquenceur de SOS lit les morceaux `.HMP` au rythme de la minuterie, et son
  pilote FM, compilé dans `MAIN.EXE`, joue les notes en écrivant les registres de la puce OPL. Tout
  est dans le programme ; l'hôte ne fournit que la puce (`moteur/hote/opl.js`) ;
- **les bruitages** : SOS charge depuis `HMIDRV.386` deux modules extérieurs au programme, un pilote
  matériel et un module de mélange, et les appelle par leur adresse. L'hôte les remplace
  (`moteur/hote/son.js`).

La septième vague a réécrit tout ce qui est exercé : la couche de Bullfrog dans
`moteur/jeu/systeme.js` (§ 9.3) et `moteur/jeu/son-du-jeu.js` (ouverture de la musique et des
bruitages, morceaux, films, § 9.3 et § 9.6), SOS dans `moteur/jeu/sos-pilotes.js` (minuterie,
systèmes, pilotes, banques), `moteur/jeu/sos-bruitages.js` (échantillons, portes des modules, DPMI,
gestionnaire d'un morceau, et le `scanf` de Watcom, § 12.5) et `moteur/jeu/sos-musique.js` (le
pilote FM). 112 fonctions, prouvées sur `son`, `films` et `musique-negociations`, rejoués avec
`--son` ; la comparaison appel par appel y exige des précautions propres à l'interruption de SOS
(§ 9.7). Restent hors de la réécriture le gestionnaire de l'IRQ 0 (`0x8A369`), le chaînage au BIOS
(`0x8A55E`, et `0x828C4`, l'événement 15, qui y mène, en attente) : ils ne reviennent pas à leur
appelant comme une fonction.

### 9.1 Configuration

`0x5F7D4` (musique) et `0x5FAB0` (bruitages) lisent `sndsetup.inf`, qu'écrivait le programme
d'installation (`SOUNDFX = SBPRO 220 7 1`, `MUSIC = ADLIB 388 0 0`), puis les variables
d'environnement `BF_MUSIC` (`carte port`) et `BF_SOUND` (`carte port irq dma`), qui l'emportent.
Faute des deux, le jeu est muet et le dit sur la console. L'hôte déclare les variables :
`BF_SOUND=SB16 220 5 1`, `BF_MUSIC=SB16FM 388`.

| Carte (musique) | Pilote SOS | Banque |
|---|---|---|
| ADLIB, SBLAST, SBPRO, ADLIBG, SB16FM, GRAVIS, PASFM, COMPATIBLE | `0xA002`, FM, interne | `MUSICb-0`, plus `INST.BNK` et `DRUM.BNK` |
| ROLAND | `0xA004`, MT-32, dans `HMIMDRV.386` | `MUSICb-1` |
| GENERAL, WBLAST, SBAWE32 | `0xA001`, MPU-401 ; `0xA008`, AWE32 | `MUSICb-2` |

| Carte (bruitages) | Pilote SOS | Fréquence | Banque |
|---|---|---:|---|
| SB16, MICROSOFT16, PAS16 | `0xE017`, `0xE00D`, `0xE004` | 44 100 | `SNDSb-2`, 16 bits |
| SBLAST, SBPRO, ADLIBG, MICROSOFT8, PAS8, GRAVIS, SOUNDMASTERII, COMPATIBLE | `0xE000` à `0xE00B` | 22 050 | `SNDSb-1`, 8 bits |

`0x5F7D4` et `0x5FAB0`, appelées une fois au lancement par `0x1095C`, sont réécrites dans
`moteur/jeu/divers.js` : quatorze noms de cartes y mènent à quatre pilotes de musique (`0xA002`
pour toutes les puces FM, `0xA004` Roland, `0xA008` AWE32, `0xA001` General MIDI ou Wave Blaster).

Faute de la banque demandée, `0x6058B` redescend en qualité (16 bits, puis 8 bits à 22 050 Hz, puis
8 bits à 11 025 Hz, « Trying lower quality 8 bit sounds »).

**La détection.** L'octet `[0xBA722]`, vrai par défaut, fait chercher la carte par les pilotes de
détection de `HMIDET.386` (`0x85793`, `0x85950`, `0x85F3E`), qui sondent le matériel et remplacent
port, IRQ et DMA. L'option `-o` de la ligne de commande (`0x10303`) le met à zéro : le jeu s'en
tient à la configuration. L'hôte la passe. Les autres options touchant au son : `-s` coupe les
bruitages, `-S` les bruitages et la musique.

**Les pilotes** sont ouverts sous leur seul nom (`hmidrv.386`), donc dans le dossier courant : le jeu
d'origine était lancé depuis `D:\GAME`, sur le CD. L'hôte, qui le lance depuis le dossier
d'installation, les cherche sur le CD (`Son.ouvrirPilote`).

### 9.2 La mémoire des pilotes

`0x82950`, à l'initialisation (appelé par `0x5F550`), prend **toute** la mémoire : un bloc DOS de
64 000 octets mis de côté, puis toute la mémoire conventionnelle par blocs de 1 Ko, puis toute la
mémoire étendue par `malloc`, de 16 Mo en 16 Mo, et enfin les miettes, de 4 096 octets à 16. Il rend
ensuite le bloc de 64 000 octets (DPMI `0101`). C'est là que la bibliothèque C loge ensuite ses
petits blocs : quand la mémoire étendue manque, `0x90151` se replie, pour 64 Ko au plus, sur
`int 21h/48h`, que DOS/4GW sert en mémoire conventionnelle. Y vivent les tampons de `fopen` et de
la console, les deux modules de `HMIDRV.386` et le tampon DMA. L'hôte doit donc rendre la mémoire
DOS libérée, et servir `48h` en mémoire conventionnelle (voir le journal des essais, § 6).

`0x82950` est réécrit dans `moteur/jeu/ecran-parc.js` (sa place n'a rien à voir avec le panneau :
c'est l'amorçage du tas). Il trie les blocs ramassés et les chaîne en liste. **Anomalies
reproduites** : la troisième passe, celle des miettes, avance de `0x1000` au lieu de `0x10` après
chaque réussite ; un bloc étendu qu'on n'arrive pas à agrandir est compté avec une taille nulle.
Sa comparaison appel par appel exige toute la mémoire (`memoire: 'entiere'`) : sans cela, la
seconde exécution repart du tas laissé par la première et boucle jusqu'à la fin du scénario.

**Le tas du jeu**, par-dessus, réécrit dans `moteur/jeu/systeme.js` : 256 descripteurs de 0x12
octets en `0xDF9C8` (jusqu'à `0xE0BC8`) — +0 l'adresse du bloc, +4 sa taille (0 : descripteur
libre), +8 le suivant, +0xC le précédent, +0x10 un octet « pris », +0x11 un octet « sorte », rang
dans la table `0xDEDCC` (12 octets par sorte). `0x7E8D0` alloue au plus juste (le bloc libre le plus
petit qui suffit, comparaisons non signées), taille arrondie à 4 et mise à zéro, dans un bloc d'une
sorte dont l'entrée de `0xDEDCC` est nulle, et se rabat sinon sur `0x7E9B8` ; celle-ci arrondit à
16, dans une sorte dont l'entrée n'est pas nulle. `0x7EA98` découpe : un bloc juste à la taille est
marqué pris, sinon un descripteur libre reçoit le reste, chaîné après lui avec la même sorte (rend
0 s'il n'y a plus de descripteur). `0x82C78` fait le bilan en `0xE0BC8` à `0xE0BD8` : total, libre,
pris, plus grand et plus petit bloc libre, arrondis à 4 par le bas. **Rendre un bloc** (`0x7EDC0`,
réécrite dans `sortie.js`) : le descripteur dont le bloc commence à l'adresse donnée est marqué
libre ; s'il a été trouvé, chaque descripteur libre de la chaîne est fondu dans son précédent
(`0x7EE48` : même sorte et précédent libre, le précédent prend la taille et la place, le descripteur
passe à la taille nulle mais garde son lien vers le suivant, ce qui laisse la traversée se
poursuivre) ; le bilan est refait dans tous les cas. La tête de la chaîne est toujours le premier
descripteur. Les ressources à drapeau 1
(§ 11.16) et les trois tampons du curseur (§ 6.6) y vivent. **Non établi** : le sens des sortes de
`0xDEDCC`, et `0x82930`, qui rend le mot +4 d'une structure (la taille d'un descripteur ? sept
appels par partie, à l'initialisation). `0x82D6C` prend un bloc de mémoire DOS par le DPMI `0100h`.
Le tas de la bibliothèque C, lui, est au § 12.2.

### 9.3 La couche de Bullfrog

| Adresse | Rôle |
|---|---|
| `0x83420(b)`, `0x83540(b)` | charge la banque de musique, de bruitages `b`, dans la qualité choisie : `data/music%d-%d` et `data/snds%d-%d` (`.dat` et `.tab`) ; `0x834D4` et `0x83608` relogent les entrées (l'adresse du `.dat` ajoutée en `+0x12`) et les comptent |
| `0x80C80(p, n)` | joue le bruitage `n` pour le propriétaire `p`, volume plein |
| `0x80FE0(p, n)` | idem, sauf s'il est déjà en cours pour ce propriétaire |
| `0x81AD0(p, n, boucles)` | le joue `boucles` fois, sauf s'il est déjà en cours pour ce propriétaire : premier numéro libre, volume plein (`0x7FFF`), drapeaux `0x4100` |
| `0x81984(p, n, volume)` | amène peu à peu le volume du bruitage à `volume` : un événement de la minuterie de SOS, 20 fois par seconde (`0x81770`) ; tables `0xDED98` (l'événement par numéro), `0xE3090` (son descripteur), `0xDED18` (volume visé), `0xDED58` (volume de départ) ; `0xDECE8` et `0xE3010`, un autre événement retiré, non établi |
| `0x80350(p, n)` | arrête le bruitage `n` du propriétaire `p` (le premier trouvé) |
| `0x805A4(p, n)` | ambiance : boucle sans fin, volume 0, montée par `0x803E0`, appelée 20 fois par seconde par la minuterie de SOS |
| `0x80DC0()` | arrête tous les bruitages |
| `0x80A20(n)` | lance le morceau `n` de la banque de musique (arrête le précédent) |
| `0x80990()` | arrête la musique |
| `0x80E40(t)` | tempo du morceau en cours, en pour cent (`0x89E5C`) : `100 + 12 − 2 × [attraction+0x13]` pour la musique des attractions (`0x1B837`) |
| `0x5FC16` | le script sonore des films (`0x60C44`) : commandes `A` (délai), `B` (banque de musique), `E` (banque de bruitages), `L`/`M` (morceau), `R` (bruitage sans fin), `S`/`T` (bruitage), `X` (arrêt) ; § 9.6 |
| `0x6010C` | ouvre la musique : minuterie et système MIDI de SOS, pilote, `INST.BNK` et `DRUM.BNK` (pilote FM), banque de musique 0 |
| `0x6058B` | ouvre les bruitages : la carte nommée donne pilote, fréquence et cadence ; banque chargée avec repli 16 bits → 8 bits → 11 025 Hz ; détection de la carte (§ 9.1) ; `sosDIGIInitDriver` ; routine de remplissage inscrite à la minuterie de SOS |
| `0x604D9` | charge un fichier entier dans le tas du jeu ; rend un pointeur lointain (`edx:eax`) |
| `0x7F68F` | `sosMIDIInitSong` : vérifie `HMIMIDIP`, prend l'une des 8 places, pose les pistes, les attribue aux pilotes (§ 9.5) |
| `0x7FC05`, `0x7FC8D`, `0x7FBC2`, `0x7FD96` | `sosMIDIStartSong` (inscrit le gestionnaire `0x88D91` à la cadence de l'en-tête, `+0x38`), `StopSong`, `UnInitSong`, et la remise du morceau au début (`sosMIDIResetSong`, vraisemblablement) |
| `0x80034` | lit le délai à longueur variable d'une piste HMP ; avance le pointeur dans son propre argument |
| `0x800AB`, `0x11AD3` | volume de la musique : le contrôleur 7 envoyé à chaque canal de chaque pilote, par un appel lointain dans la table `0xBFE7A` ; `0x11AD3`, son enveloppe, appelée par le clavier du parc |
| `0x5CA6B` | événement de la minuterie de SOS (`retf`) : compte les tics en `0xB14B5` |
| `0x803E0` | événement de la minuterie de SOS : monte le volume des ambiances de `0x200` par appel jusqu'à la cible |
| `0x815E1` | `_fstrcpy` de Watcom (il saute au milieu d'une instruction pour atteindre `stosb`) |
| `0x19334` | au chargement d'une partie : le monorail (`0xDB`) appelle le suivant de sa file ; toute autre attraction est fermée, son octet `+0x4B` gardé (non établi) |
| `0x83670` | lit une suite d'octets dans un fichier (`0x7EBE0`), ou en mémoire si `[0xBEEFC]` (jamais écrit directement : non exercé) |
| `0x8B980`, `0x8BAB0` | chargent une banque de sons dans le tas du jeu, ou la rendent ; la fiche d'une banque : `+0x1C` le pointeur, `+0x20` la fin, `+0x24` la taille, `+0x28` bit 0 |

Variables : `[0xBA714]` musique initialisée, `[0xBA720]` bruitages initialisés, `[0xBA71A]` numéro du
morceau en cours (0 : aucun), `[0xBA71D]` nombre de morceaux, `[0xBA718]` tempo en pour cent,
`[0xD790C]` et `[0xD7B60]` les tables des banques chargées (entrées de 32 octets, pointeur des
données en +0x12, taille en +0x1A), `[0xD7B68]` nombre de bruitages, `[0xD7B44]` le pilote
numérique, `[0xD7984]` le morceau SOS, `0xD7998` le propriétaire et le bruitage de chacun des 32
numéros d'échantillon, `0xBA729` la structure `_SOS_START_SAMPLE` qu'ils remplissent,
`[0xBA71C]` la minuterie de SOS ouverte, `0xD7994` et `0xD7995` les banques FM prises et le genre de
banque, `0xBA727` et `0xBA728` la qualité et les 16 bits, `[0xD7B6A]` la cadence du mélange.

**Anomalies reproduites** (`son-du-jeu.js`). `0x6058B` : seul SBLAST est comparé sans égard à la
casse (`stricmp`), les autres noms par `strcmp` ; GRAVIS et COMPATIBLE prennent le pilote `0xE000` ;
une carte inconnue éteint les bruitages, mais la banque est chargée quand même, avec pilote et
fréquence non initialisés ; si la banque 16 bits manque sans repli connu, elle est redemandée sans
fin ; avec la détection, `0xD7AD0` n'est pas posé. `0x6010C` : après un échec de
`sosMIDISetInsData` sur `INST.BNK`, `DRUM.BNK` est encore chargé et passé au pilote fermé.
`0x604D9` ferme même le descripteur −1 et perd le bloc sur une lecture courte. `0x7FC8D`, sans
événement, écrit `0xFF` en `0xC34DC` (indice −1). `0x800AB` : le canal 9 reçoit toujours le message,
et le volume calculé est tronqué à un octet. `0x803E0` s'arrête à la première montée arrivée à son
terme : les numéros suivants attendent l'appel suivant. `0x8B980`, après une lecture incomplète,
oublie le bloc sans le rendre, et écrit la fin sans vérifier que son adresse n'est pas nulle.
`0x604D9`, `0x88D4B` et `0x85551` laissent dans le mot haut d'`edx` un reste de pile. **Non
établi** : la structure `0xD78E8`, les octets `0xC29F5` à `0xC2A34`, `0xBA7DA`, `0xD7A6C` ; le pilote
`0xE016`, repli 8 bits de la SB16.

`0x80350`, `0x80990`, `0x80A20`, `0x80DC0`, `0x80E40`, `0x81984` et `0x81AD0` sont réécrites dans
`moteur/jeu/systeme.js`. `0x80A20` ne fait rien si le morceau est déjà celui en cours ou dépasse le
nombre de morceaux ; à une erreur de SOS, un message, et la musique est éteinte pour la partie. La
boucle du parc appelle `0x801A0` tant que `[0xBA71A]` (le morceau en cours) est entre 1 et `0x11`
(§ 11.9 ; le rôle de `0x801A0` n'est pas établi). Les commandes 1 et 2 des menus basculent les
bruitages et la musique (`0x50CCD`, § 11.10) ; `[0xBA715]`, que la commande 2 bascule, est donc la
musique permise, que plusieurs modules de la sixième vague relisent sans l'avoir nommée.

**Le son défait en quittant** (`0x10977`, réécrit dans `sortie.js`, § 11.21) : les bruitages
(`0x7EED0`, si `[0xBA720]`) — tout arrêter (`0x80DC0`), attendre activement que `0x879C0` rende 0,
volume général à 0 (`0x87A84`), mélange retiré de la minuterie de SOS (`0x8260A`, poignée
`[0xD7B48]`), la minuterie de SOS fermée (`0x822C1(0)`) si la musique ne s'en sert pas, puis
`sosDIGIUnInitDriver(pilote, 1, 1)`, `0x84C6E` et `0x86120(0xBEE78)` — ; puis la musique
(`0x7EF60`, si `[0xBA714]`) — le morceau en cours arrêté et défait, sans demander s'il est fini et
sans remettre `[0xBA71A]` à zéro, contrairement à `0x80990` ; les pilotes remis (`0x8474A`) et
désactivés (`0x84639`), le second s'il y en a un (`[0xBA710]`) ; minuterie et système fermés
(`0x822C1`, `0x84162`) ; les blocs de mémoire DOS des pilotes rendus (`0x7F068`, couples
décalage-sélecteur en `0xD798E`, `0xD7988`, `0xD78E0`) ; enfin `0x86120(0xBEDF4)`. **Non établi** :
`0x86120` et les deux structures qu'elle rend, `0x822C1`, `0x84C6E` (`sosDIGIUnInitSystem`,
vraisemblablement), `0x879C0`. **Non exercé** : le scénario `quitter` tourne sans carte son, et les
deux routines y sortent dès leur premier test ; le reste est réécrit d'après le désassemblage, non
prouvé, et
les libérations de SOS (`0x853CA`, `0x83B94`, `0x84A4D`) ne sont atteintes par aucun scénario.

### 9.4 SOS : les bruitages

| Adresse | Fonction de SOS |
|---|---|
| `0x84C12` | `sosDIGIInitSystem` |
| `0x84C98` | `sosDIGIInitDriver(id, matériel, init, &pilote)` : pilote matériel, description, tampon DMA (`0x85551`, un bloc DOS qui ne franchit pas de frontière de 64 Ko), module de mélange, réglage ; tables `0xC3354`, `0xC31E8`, `0xC336C`, `0xC32B0`, `0xC321A`, et copie de la structure d'initialisation en `0xE0D80 + 0x40 × poignée` |
| `0x853CA` | `sosDIGIUnInitDriver` |
| `0x8943F` | `sosDIGIStartSample(pilote, départ)` : remplit le premier des 32 descripteurs libre et rend son numéro, −1 si tous jouent ; rien au-delà du pilote `0xE106` (pourquoi : non établi) |
| `0x89A48` | `sosDIGIStopSample(pilote, id)` : arrête le premier descripteur qui porte l'identifiant (efface 0x8000, identifiant à 0) ; `0xA` si aucun |
| `0x892DB` | `sosDIGISampleDone(pilote, id)` : 1 si fini ; c'est le premier descripteur portant l'identifiant qui décide (sans effet, `sosDIGIStartSample` prenant toujours le premier libre) |
| `0x879F8` | `sosDIGISetSampleVolume(pilote, id, volume)` : −1 si le pilote n'est pas prêt (`[0xC3274]`), 0 si trouvé, `0xA` sinon |
| `0x87A84` | volume général : chaque volume multiplié par `v / 0x7FFF` |
| `0x821FC`, `0x822F4`, `0x8260A`, `0x82496` | minuterie : `sosTIMERInitSystem` (prend l'IRQ 0), `RegisterEvent` (16 emplacements ; accélère la minuterie, recalcule les pas ; `0xB` si tout est pris), `RemoveEvent` (ramène la minuterie à l'événement le plus rapide), `AlterEventRate` |
| `0x827DC` | retient le diviseur (`[0xC33B9]`) et programme le 8253 (`0x8A3E0`) |
| `0x8A426`, `0x8A3E0`, `0x8A4B1`, `0x8A4DD` | pose `0x8A369` sur l'IRQ 0 et programme le 8253 ; change la cadence ; masque l'IRQ 0 ; la démasque. `[0xC4718]` dit que l'IRQ 0 est prise |
| `0x83762`, `0x84888` | verrouillent la mémoire de la musique et des bruitages (`0x8BB41`), 39 et 16 plages ; les bornes des plages sont des fonctions vides, dont seule l'adresse sert |
| `0x8BB9B` | remplit la table `0xE0EC0` : 32 pointeurs lointains, un descripteur tous les `0x6C` octets |
| `0x8BF81` | Windows 3.1 détecté (int 2Fh `1600h`) : demande de ne plus traduire le DMA (int 4Bh `810Bh`) |
| `0x8BB41`, `0x8BBCB`, `0x8BBF6`, `0x8BC3C` | DPMI : verrouiller une zone (`0600h`), base de `ds` (`0006h`), sélecteur sur une adresse (`0000h`, `0007h`, `0008h`), bloc DOS (`0100h`) |
| `0x8A369` | gestionnaire de l'IRQ 0 de SOS : range `esp` en `0xC370E` et bascule sur sa pile privée, dont le haut est `0xC4716` |
| `0x8280A` | ses 16 événements, chacun appelé à sa fréquence par un accumulateur 16.16, par un appel lointain (`retf`) ; il empile d'abord `ebx`, `esi`, `edi` et `ebp` du code interrompu sur la pile privée |
| `0x828C4` | l'événement 15, réservé : rend la main à l'ancien gestionnaire du BIOS par `0x8A55E`, qui reprend `esp` en `[0xC370E]`, dépile les registres du code interrompu et saute par un `retf`, comme `_chain_intr` (en attente : aucune fonction JavaScript ne le reproduit) |

**Les modules de `HMIDRV.386`.** Le fichier : un en-tête de 0x2C octets (nombre de modules en
+0x20), puis, par module, un en-tête de 0x30 octets (nom en +0, taille du code en +0x24, identifiant
en +0x28) et son code. 51 modules : les pilotes matériels (`0xE000` à `0xE060`, dont `sw1616m.com`,
`0xE017`, la Sound Blaster 16 en 16 bits) et les modules de mélange (`0x1000` à `0x1008`, `tr*.com`).
`0x8EDA6` charge le pilote matériel, `0x8F00C` le module de mélange, chacun dans un bloc alloué, avec
un sélecteur dont la base est le début du bloc. Leurs adresses : `[0xC3206 + 4i]` et
`[0xC3238 + 4i]` pour le pilote numérique `i` ; l'identifiant du matériel en `[0xC32E2 + 4i]`.

SOS les appelle par de petites portes : `call [adresse]`, le numéro de fonction dans `eax`, le module
dans `fs:edi`. Les portes exercées sont `0x8BD24`, `0x8BE57`, `0x8BEB9`, `0x8BEF2`, `0x8BF23` et
`0x8BF52` (fonctions 8, `0x0A`, 0, 4, 2 et 3) ; leurs voisines `0x8BCD0`, `0x8BD59`, `0x8BD84`,
`0x8BDAF`, `0x8BE2C` (détection et fermeture) et `0x8BFB8` (Windows, à la fermeture) ne sont
atteintes par aucun scénario. `sosDIGIInitDriver` appelle, dans l'ordre :

| Module | eax | Rôle | Réponse |
|---|---|---|---|
| matériel | 8 | description de la carte | `fs:edx` : +0x24 bits par échantillon, +0x3D bit 7 (silence à 0x80), +0x68 module de mélange à charger |
| mélange | 0x0A | installation (tampon DMA en `es:edi`, taille en `ecx`) | trois décalages depuis son début : `edi` la routine de remplissage, `ecx` ses données, `esi` les 32 descripteurs d'échantillon |
| matériel | 0, 3, 2, 4 | port, IRQ et DMA ; réglage ; fréquence (`bx`) ; départ du DMA | aucune |

Fin : fonctions 5 puis 1. La routine de remplissage est inscrite par le jeu à la minuterie de SOS
(`0x822F4`), à 60, 120 ou 240 appels par seconde selon la carte (`[0xD7B6A]`) : c'est elle qui
mélange. Le tampon DMA est rempli de silence : `0x80` pour une carte 8 bits sans le bit 7 de
`+0x3D`, 0 sinon.

**La minuterie de SOS** et ses 16 événements. Tables : `0xC33BD` les routines (16 × 6 octets,
pointeurs lointains), `0xC341D` les fréquences (`0xFF00` : le BIOS), `0xC345D` les pas 16.16,
`0xC349D` les accumulateurs, `0xC34DD` le morceau de chaque événement, `0xC34ED` le morceau courant
(posé par `0x8280A` avant d'appeler l'événement), `0xDEDB8` l'indice de la boucle. `0x827DC` règle
le diviseur (`[0xC33B9]`). L'événement 15 est `0x828C4`, qui chaîne au BIOS avec le pas de 18,2 Hz
(`0x123333`). Pendant la partie : le compteur du jeu (`0x5CA6B`, § 6.9) à 60 Hz, les montées de
volume (`0x803E0`, `0x81770`) à 20 Hz, le séquenceur à la cadence du morceau, le remplissage à 60,
120 ou 240 Hz.

**La pile privée.** Le gestionnaire de l'IRQ 0 (`0x8A369`, `pushad`, `lss`, `iretd`) range en
`[0xC370E]` le pointeur de pile du code interrompu et bascule sur une pile à lui, dont le haut est
`0xC4716` ; le répartiteur `0x8280A` y empile `ebx`, `esi`, `edi` et `ebp` du code interrompu, puis
appelle les événements, qui tournent sur cette pile : la musique entière (`0x88D91`, le pilote FM),
les montées de volume, le mélange. Cette pile est une variable de SOS, dans la mémoire du programme :
ce qu'y laissent les routines et le code interrompu y reste (§ 9.7).

**Le descripteur d'échantillon**, 0x6C octets, rempli par `sosDIGIStartSample` :

| Champ | Contenu |
|---|---|
| +0x00 | pointeur lointain : début des données |
| +0x08 | pointeur lointain : position courante |
| +0x10 | début + point de boucle |
| +0x18 | octets restant à jouer (ou point de boucle, avec le drapeau 0x40) |
| +0x1C | taille |
| +0x20, +0x2C | longueur de la boucle, et ce qui la suit (drapeau 0x40) |
| +0x30 | drapeaux : 0x8000 en cours, 0x4000 boucles (compteur en +0x38, 0xFFFF sans fin), 0x2000 premier passage, 0x0400 hauteur, 0x0200 panoramique, 0x0100 volume, 0x0040 boucle partielle |
| +0x32 | volume, 0 à 0x7FFF |
| +0x34 | identifiant de l'échantillon (le « numéro » de Bullfrog, 0 à 31) |
| +0x36 | canal (2 : centre) |
| +0x3C | pointeur lointain : routine de fin (nulle chez Bullfrog) |
| +0x44 | pas de hauteur |
| +0x50 | taille |
| +0x54 à +0x60 | panoramique, fondus |

Bullfrog n'utilise que le volume et les boucles, jamais la hauteur ni le panoramique.

**Anomalies reproduites** (`sos-pilotes.js`, `sos-bruitages.js`). L'octet `[0xC4718]`, écrit comme
un octet, est testé comme un mot long par `0x8A3E0`, `0x8A426`, `0x8A4B1`, `0x8A4DD` et `0x8A55E`.
`0x8418C` et `0x84C98` laissent le pilote inscrit quand l'installation échoue ; `0x84C98` range deux
valeurs jamais écrites (`0xC3238`, `0xC32CE`) sur les chemins non exercés. `0x85551` garde, sans le
rendre, le bloc qui chevauchait une frontière de 64 Ko. `0x8BC3C` calcule sur 16 bits la taille
verrouillée, avec `si` = 0, et perd le sélecteur du bloc DOS. `0x83762` verrouille quatre variables
avec une taille nulle. `0x83670`, en mémoire, avance de la taille demandée et non de ce qui a été
copié. **Non établi** : les champs `+0x1A` et `+0x20` de la structure de départ, `+0x4A` du
descripteur ; les paramètres des fonctions `0x0A` (`edx`, `ebx`), 4 (`edi`, `ecx`) et 3 (`bx` = 8)
des modules ; `[0xC3704]` (jamais relu), la table `0xC31E8`, `[0xBFF2E]` (« en pause »,
vraisemblablement) ; `0xC2D24`, `0xC3390`, `0xC32CE`, `0xC33B0`, `0xC324C`, `0xC3274` ; les noms
SOS des fonctions de détection `0x85793`, `0x85950`, `0x85F3E`, `0x858FC` (supposés). **Non
exercés**, réécrits d'après le désassemblage : la minuterie sans l'IRQ 0 ou pleine, l'absence de
descripteur libre, `[0xC4718]` nul, Windows 3.1, une banque « * » ou mal lue, le chemin au-delà de
`0xE106`, les pilotes numériques autres que `0xE017`.

### 9.5 SOS : la musique

`0x83FC6` (`sosMIDIInitSystem`) remplit les tables des pilotes internes ; `0x8418C`
(`sosMIDIInitDriver`) aiguille selon l'identifiant : pilote FM (`0xA002`, table en `0xE0C26`), pilote
« numérique » (`0xA005`), rappel (`0xA003`), AWE32 (`0xA008`), les autres étant chargés depuis
`HMIMDRV.386`. La table d'un pilote, recopiée en `0xBFE7A + 0x24 × i` : six pointeurs lointains.
Le pilote FM : `0x8E485` reçoit un message MIDI (`0x8DD58` l'aiguille : note, contrôleur, programme,
courbure), `0x8E4B4` l'installe ; `0x8564A` (`sosMIDISetInsData`) lui passe `INST.BNK` et
`DRUM.BNK`. Il écrit la puce par `0x8EBD8` : index sur le port de base, six lectures, donnée sur le
port suivant, trente-cinq lectures ; jamais le second banc de l'OPL3.

Le séquenceur : `0x88D91`, événement de minuterie de SOS, traite les pistes (`0x863E5`) et remet les
messages au pilote (`0x8E485`). `0x7F68F` prépare un morceau (`sosMIDIInitSong`, reconnaît
`HMIMIDIP`), `0x7FC05` le lance, `0x7FC8D` l'arrête, `0x7FBC2` le défait, `0x82174` dit s'il est
fini, `0x87202` envoie un message au pilote (le désaccord des attractions usées, `0x66BA0`).

**La table d'un pilote**, recopiée par `0x8418C` (qui recopie six pointeurs pour cinq routines) :
`+0` envoyer un message, `+6` installer, `+0x12` remettre, `+0x18` recevoir les instruments. Celle
du pilote FM, en `0xE0C26` : `0x8E485` (« SendData », appel lointain), `0x8E4B4` (« Init », le
quatrième argument est le port ; rend toujours 0), `0x8E4EF` (« UnInit »), `0x8E50D` (« Reset »),
`0x8E52B` (les banques, appelée par `sosMIDISetInsData`) ; les noms sont déduits de la place dans la
table. `0x8474A` est `sosMIDIResetDriver` : contrôleurs `0x79` puis `0x7B` sur les 16 canaux, puis la
remise du pilote. **L'attribution des pistes** (`0x7F68F`) : l'en-tête HMP donne un pilote par piste,
`0xA000` valant n'importe quel pilote FM, Roland ou General MIDI.

**Le gestionnaire d'un morceau**, `0x88D91` : un événement de la minuterie (`retf`), qui avance les
pistes du morceau `[0xC34ED]` (posé par `0x8280A`) et en gère la fin ; `0x80034` lit un délai,
`0x7FD96` remet le morceau au début. Les tables des 8 places : `0xBFF4E` le morceau actif,
`0xBFE5A` les pistes, `0xBFE3A` les pistes restantes, `0xBFA0A` les tics, `0xBF60A` les délais,
`0xBF00A` les positions, `0xBFE0A` les affectations aux pilotes, `0xBFF8E` l'en-tête (SOS range un
pointeur lointain dans l'en-tête HMP en `+0x300`, la routine de fin), `0xBFFBE` la poignée
d'événement, `0xC34DD` le morceau de chaque poignée, `0xC17A7` (non établi). `0x88D4B` rend un
pointeur lointain (décalage dans `eax`, sélecteur dans `dx`). `0x863E5` remet un message au pilote,
le volume multiplié par le volume général (`0xC2AC5`, `0xC2AC6`) ; `0x86E23` fait taire le morceau
(notes éteintes, contrôleurs, courbure et volume de chaque piste).

**Le vol de canaux.** `0x87238` (`sosMIDIEnableChannelStealing`, vraisemblablement ; `[0xC29E1]`,
rend l'ancienne valeur) fait passer les messages par la table des canaux `0xC1DA7` ; tables
`0xC2077`, `0xC20C7`, `0xC2027`, `0xC2117` (5 octets par emplacement), `0xC2757`. `0x80A20` appelle
`0x87238(0)` avant chaque morceau : le chemin n'est jamais pris, et la traduction de `0x863E5` et de
`0x86E23` n'est pas prouvée. `moteur/jeu/systeme.js` appelle encore cette adresse
`VOLUME_DE_LA_MUSIQUE`, à tort.

**Le pilote FM** (`moteur/jeu/sos-musique.js`). `0x8DD58` aiguille selon le statut (`0x90`, `0x80`,
`0xB0`, `0xC0`, `0xE0`) : `0x8D616` frappe une note (voix, instrument, niveau d'après la vélocité,
touche ; le canal 9 par la banque des percussions), `0x8DB06` la relâche ou la retient si la pédale
est enfoncée (16 au plus), `0x8D4CF` traite les contrôleurs 7, 64, 102, 121 (`0x8DCAE`) et 123
(`0x8DC05`), `0x92CEC` règle le volume des voix actives, `0x8D255` courbe la hauteur, `0x92F7D`
change le programme, `0x92EB6` choisit une voix (libre, sinon volée). La puce : `0x8E57C` l'ouvre
(port `0x388` ou `0x380`), `0x8E41D` l'installe, `0x8E6B3` éteint les 9 voix, `0x8E8AF` l'arrête,
`0x8E76D` pose la fréquence et enfonce la touche, `0x8E82F` la relâche, `0x8E99D` charge un
instrument ; le pilote garde une copie des registres `0x40`, `0x80`, `0xA0`, `0xB0` et `0xBD`
(`0xC478C` à `0xC47E0`), l'état de chaque canal (`0xC4850` à `0xC4A1C`) et de chaque voix
(`0xC47EC`, `0xC4890`, `0xC49B8`). **Les banques** : `INST.BNK` et `DRUM.BNK` au format BNK d'AdLib,
fiches de noms de 12 octets et instruments de 30 octets, que `0x8E196` convertit sur place en
octets de registres, et que `0x8E03D` range en alternance (pointeurs lointains `0xC4828` et
`0xC483E`). La hauteur d'une percussion est le troisième octet de sa fiche de nom : `0x0C` pour la
note 35, `0x3C` pour la 38. **Le niveau** d'un opérateur :
(`0x2000` − 2 · (`0x40` − att[vél / 2]) · (`0x40` − niveau)) / 128, `att` étant la table `0xC4AAC`.
La table des fréquences `0xC4AC0` ne commence vraiment qu'à la note 12. **Les modules de
`HMIDRV.386`** (§ 9.4) sont chargés par `0x8EDA6` (pilote matériel, `0xE000` à `0xE200`) et
`0x8F00C` (mélange, `0x1000` à `0x1023`) ; codes d'erreur 5, 6, 9, `0xA` et `0xF` ; `0x8ECEF` demande
la description (fonction 8, par `0x8BD24`).

**Anomalies reproduites.** `0x83FC6`, sans chemin, vide celui des pilotes numériques (`0xC34EE`) au
lieu du sien (`0xC2B20`). `0x863E5`, sans vol de canaux, n'envoie pas un contrôleur autre que le
volume : c'est le tampon périmé `0xC29D7` qui part à sa place (une fois dans `son`, sur le
contrôleur 116) ; avec vol de canaux, la remise des contrôleurs part avec le statut `0xC0` et la
courbure sur deux octets, et un canal non attribué écrit hors de la table (indice `0xFF`), comme
dans `0x86E23`. `0x88D91`, pour un morceau sans événement, écrit `0xFF` en `0xC34DC`. Dans le pilote
FM : `0x8D616` ne règle le niveau du premier opérateur que si l'octet rétroaction-connexion vaut 0
(l'octet entier, pas le bit), jamais pour une percussion, et pousse cinq fois la vitesse de
relâchement au maximum ; `0x8D4CF`, pédale relevée, rejoue les relâchements retenus du rang
« nombre » au rang 1 (le rang 0 jamais, le rang « nombre » périmé), et peut boucler sans fin si la
pédale d'un autre canal est enfoncée ; `0x8DC05` et `0x8DCAE` indicent la vélocité `0xC49B8` par le
canal et non par la voix, et leur test du canal 9 est mort ; `0x92CEC` diffère de `0x8D616` (division
non signée, complément doublé par `<<7 >>>6`, connexion lue dans la banque mélodique même pour une
percussion) ; `0x8E196` ne convertit que le nombre d'instruments moins 2 (les programmes 126 et 127
restent bruts) ; `0x8E03D` lit les décalages de la seconde banque dans l'en-tête de la première (sans
effet : même en-tête) ; `0x8E8AF` garde le bit `0x20` dans sa copie du registre `0xB0` ; les notes
inférieures à 12 lisent la fin de la table des vélocités ; `0x8EDA6` et `0x8F00C` lisent un en-tête
de module de trop, rendent 0 avec un pointeur fait de variables jamais écrites pour un module
introuvable, et laissent le fichier ouvert faute de mémoire ; `0x8E41D` ignore la réponse de
`0x8E57C`. **Non établi** : `0xC4934` (le contrôleur 102 : l'amplitude de la courbure,
vraisemblablement), `0xC47FC`, qui relit `0xC47F7`, qui pose `0xC484C` (la courbure permise) ; le
sens des 2ᵉ et 4ᵉ arguments de « SendData » (longueur et numéro de pilote, vraisemblablement).
**Jamais exercés** : le vol de voix (seuls `INTRO2`, `INTRO3`, `RIDE7` et `RIDE12` dépassent neuf
voix), la pédale, le statut `0x80` et le contrôleur 102 (aucun morceau HMP n'en contient), le port
refusé, les modules introuvables ; le canal 9 ne l'est que par `musique-negociations` (le morceau
HRTBEAT, 100 percussions).

**Le format HMP** (`HMIMIDIP`) : nombre de pistes en 0x30, 120 en 0x34 et 0x38, durée en secondes
en 0x3C, priorités des canaux en 0x40, affectation des pistes aux pilotes en 0x80 ; les pistes à
partir de 0x308, chacune précédée de 12 octets (numéro, longueur totale, 0). Les événements sont
ceux du MIDI, sans statut courant, mais les délais sont codés à l'envers : 7 bits par octet, poids
faibles d'abord, le dernier octet portant le bit 7. Un tic vaut 1/120 s. Les contrôleurs 116 et 117
bornent la boucle d'un morceau. La piste 0 ne contient que la fin de piste.

### 9.6 Le film

La loupe de la fiche d'une attraction (appels en `0x3B76E` et `0x7C36D`) joue son film,
`data/rideani.NNN`, et la partie gagnée joue `data/wingame.dat`, par `0x5C04F`
(`moteur/jeu/son-du-jeu.js`). C'est un autre lecteur que celui de la fin de partie (`0x5B88D`,
§ 11.20). `0x5C04F` recopie sur la pile le script sonore du film : celui de l'attraction, ou un
script par défaut, pris parmi les scripts du code en `0x5BF14` à `0x5BFDF` ; la table `0xBA0FF` dit,
en deux octets par attraction, la musique à poser et si le film est rejoué jusqu'à un clic ou une
touche ; l'attraction 16 prend le film 9 (l'argument est récrit sur la pile de l'appelant). Rien si
le fichier manque. Sinon : en 640x480, passage en 320x200 le temps du film ; musique et bruitages
arrêtés ; le grand tampon `[0xD3BA8]` découpé (la palette du film, le tampon du film en `+0xFA00`,
le tampon de palette en `+0x3E800`) ; le film joué ; puis tout est remis — l'ambiance si le parc est
ouvert, le fondu, les images du parc (`data/mspr-0.dat`) rechargées dans le grand tampon, le mode et
le pointeur.

**Le lecteur**, `0x60C44`, image par image : le script sonore (`0x5FC16`), le décodage (`0x60E30`),
la palette (`0x60FB9`), la présentation, puis l'attente (`0x6123D`, une attente active sur l'heure du
DOS, int 21h `2Ch`, en centièmes : 2 ou 8 centièmes par image selon la résolution). **Le format** :
un fichier FLC d'Autodesk Animator ; `0x60EF3` lit l'en-tête (nombre d'images, largeur, hauteur),
`0x60E30` répartit les blocs d'une image selon leur genre :

| Genre | Routine | Bloc |
|---|---|---|
| 4 | `0x60F92` | palette, rangée en `[0xD35BC]` ; `0x60FB9` applique les paquets et la pose au balayage, avant l'image |
| 7 | `0x61033` | deltas par mots (FLC) |
| 0xC | `0x6110A` | deltas par octets (FLI) |
| 0xF | `0x611B1` | image pleine compressée (FLI) |
| 0x10 | `0x60F56` | copie brute |
| autre | `0x60F74` | bloc sauté ; aucun film exercé n'en contient |

Chaque bloc est précédé de sa taille (4 octets, en-tête compris) et de son genre (2 octets) ; les
images (`0xF1FA`) suivent l'en-tête (`0xAF12`) et se décodent dans l'image en construction, en
320x200.

**Le script sonore** (`0x5FC16`) : des lignes de 7 octets (numéro d'image, commande, argument, deux
octets inutilisés), terminées par l'image `0xFFFF` ; à chaque image, les lignes de ce numéro sont
exécutées. Commandes, en majuscule ou en minuscule : `A` le délai entre les images (centièmes ; 0,
ni image ni attente), `B` charger la banque de musique, `E` celle des bruitages, `L` lire le film
d'avance (`0x83700`, non établi ; `[0xBEEFC]`) puis `M`, `M` lancer un morceau, `R` jouer un bruitage
sans fin (`0x81AD0`), `S` jouer un bruitage et `T` en arrêter un (0 : tout arrêter), `X` arrêter la
musique. Auparavant, si le film le demande (`[0xBA0FD]`), la musique de l'attraction est relancée
quand elle est finie.

**Anomalies reproduites.** `0x5C04F` : rejoué en boucle, le film de l'attraction 6 garde le morceau 4
(la musique de l'attraction n'est posée que pour un film joué une fois) ; il teste le mode vidéo juste
après l'avoir posé (branches mortes). `0x60C44` : une attente active de 500 tours sans effet ; une
seule passe du film, toujours (`[0xBA7DE]` vaut 1). `0x61033`, après une commande « dernier pixel »,
prend le mot de commande pour un nombre de paquets. Dans `0x61033`, `0x6110A` et `0x611B1`, un compte
de lignes ou une hauteur nulle vaut 65 536 ; dans `0x611B1`, une ligne qui déborde ne s'arrête qu'au
débordement du compteur 16 bits. **Non établi** : `[0xBA7DA]`, le rôle de `0x83700`. **Exercé** par
`films` (318 s, avec son) : 21 attractions, 36 films, dont les attractions 6 (jouée une fois), 8 et 9
(en boucle, avec leur script), les scripts par défaut (0, 2, 14, 19) et six attractions sans film
(l'accès au fichier échoue) ; 6 208 blocs de deltas par mots, 133 morceaux préparés. **Non exercés** :
le film de la partie gagnée et l'attraction 16.

### 9.7 Vérifier le son : la pile privée de SOS

Avec `--son`, la comparaison appel par appel semblait incohérente avec elle-même. Les trois causes
sont établies, et une réécriture peut les satisfaire :

1. **Le pointeur de pile au moment de l'interruption.** `0x8A369` range en `[0xC370E]` le pointeur de
   pile du code interrompu. Chaque service rendu au jeu (interruption, port) doit donc partir de la
   même hauteur de pile que dans l'original : une réécriture fait ses accès aux ports et ses appels à
   la hauteur de l'original.
2. **Les registres empilés sur la pile privée.** `0x8280A` empile `ebx`, `esi`, `edi` et `ebp` du
   code interrompu sur la pile privée, que la comparaison relève comme une variable. Il faut donc les
   mêmes registres à chaque service ; et les routines appelées sur cette pile (`0x5CA6B`, `0x803E0`,
   `0x80034`, `0x7FD96`, `0x88D91`, le pilote FM, `0x827DC`, `0x8260A`, `0x863E5`, `0x86E23`)
   doivent y laisser tout le cadre de l'original, variables, registres sauvés et adresses de retour
   compris (`Cadre`, `appelerDepuis`, `moteur/jeu/cadre.js`). `0x8280A` elle-même ne compare aucun
   registre (`registresCompares: []`) : son seul appelant recharge aussitôt sa pile (`lss esp`) et ses
   registres (`popal`).
3. **Les descripteurs d'échantillon.** Les 32 descripteurs du module de mélange (à `+0x100` de
   `[0xC3238]`) sont dans le tas, hors des zones relevées et remises par défaut : les fonctions qui les
   écrivent les déclarent (`zones`), ainsi `0x5FC16`, `0x803E0` et les quatre fonctions d'échantillon.

Le rejeu, lui, exclut la pile privée de ses relevés, comme la pile du jeu (journal des essais,
§ 6.5 et § 6.7). Les sorties de la puce FM et des bruitages ont aussi été comparées, avec et sans
les modules : 9 672 écritures datées identiques, alors que le vérificateur ne regarde pas le son.

---

## 10. La simulation

Réécrite dans douze modules de `moteur/jeu/` : `simulation.js`, `visiteurs.js`,
`visiteurs-outils.js`, `visiteurs-etats-a.js`, `visiteurs-etats-b.js`, `personnel.js`,
`attractions.js`, `vehicules.js`, `simulation-outils.js`, `economie.js`, `concurrents.js` et
`fin-annee.js`, 121 fonctions prouvées sur les cinq scénarios. La sixième vague y a ajouté
`voyous.js`, `entretien.js`, `negociations.js` et `monorail.js` (§ 10.13 à § 10.17), que les
scénarios composés pour les fonctions jamais appelées (`voyous-arrestation`, `voyous-vandale`,
`entretien`, `horza-objets`, `negociations`, `longue-faillite`, `longue-simulation`, `outils-basse`,
`outils-haute`) exercent pour la première fois. Ce chapitre rassemble ce que
ces réécritures ont établi ; le détail, champ par champ, est en tête de chaque module. « Non établi »
marque ce qu'elles n'ont pas tranché.

### 10.1 Le pas et la mise à jour des objets

À chaque image, la boucle du parc (`0x11C45`) appelle `0x12B1F` (le calendrier, l'économie, les
concurrents), `0x21681` (la mise à jour de tous les objets du parc) et `0x283A6` (les arrivées :
`0x2845A` crée les visiteurs, `0x6128F` le bus). Deux compteurs : `0xD3AF8` compte les passages de
`0x21681` ; `0xD3AFC`, les pas du calendrier, 1 000 par mois, 12 000 par année (le mois vaut
(pas mod 12 000) / 1 000 + 1).

`0x21681` (code de `0x21681` à `0x2223A`) parcourt les objets et appelle pour chacun la routine de
son type, puis de son état (octet `+0xC`) : pour les visiteurs, l'état est cherché dans la table de
36 octets `0x21723` et la routine prise dans la table de sauts `0x21747` ; pour les véhicules,
l'aiguillage est en `0x21FEC` ; pour les attractions, en `0x21C0D`. Au passage, elle compte les
visiteurs payants mécontents, neutres et contents (§ 10.8) ; non établi : un bonus selon l'octet
`+0x77` de la fiche du parc, un effet global selon l'octet `0xB14CC`, la météo vraisemblablement.

**Le hasard**, `0x18B92` : un générateur multiplicatif pur. L'état, mot long en `0xD3AF4`, devient
état × `0xBB40E62D` modulo 2³², et le tirage vaut (état >> 8) & `0x7FFF`, de 0 à 32 767. Un état
impair parcourt un cycle de 2³⁰ valeurs, mais les bits faibles bouclent vite : un tirage modulo 2^k
revient au bout de 2^(k+6) tirages. La graine, `0x7FBE5`, est posée par `0x12452` à l'entrée de la
boucle du parc ; l'état est sauvegardé avec la partie (`DEMO.GY` porte `0xCCD2F1F1` au décalage
`0x41EE2`). Des 147 appels, plus de la moitié prend le tirage modulo une constante, une puissance de
deux près d'une fois sur deux. La suite étant commune à toute la simulation, chaque réécriture tire
exactement aux mêmes endroits et dans le même ordre que l'original.

**Les restes de pile.** `0x21681` appelle toutes les routines à la même hauteur de pile, et l'état 4
des visiteurs (`0x223C1`) lit une variable locale qu'il n'a pas écrite : il y trouve un octet laissé
par la routine précédente, pour un autre objet. La simulation en dépend ; les réécritures laissent
donc cet octet comme l'original (journal des essais, § 5.6) : les états de la grève (§ 10.15), le
wagon du monorail, le nuage et les attractions envolées (§ 10.16, § 10.17) ouvrent le cadre de
l'original pour y laisser leur `[ebp-8]` ou ce que leurs appels y posaient. Un autre reste, hors
de la simulation, est relu par la fiche du joueur, par deux chemins (§ 11.4) ; un quatrième par la
barre des messages quand le CONSEILLER est allumé (§ 11.3). **Un cinquième, dans la tonte** :
l'embauche d'un agent d'entretien (`0x617E0`) posé ni sur l'herbe ni sur une allée l'envoie tondre
en (32, 16) sans poser le sens de la tonte (`+0x61`), qui garde ce qu'un objet précédent y a laissé
(`0x05AB` dans `longue-faillite`) ; au-delà de 3, `0x61F81` prend pour position, fin et pas ce qui
traîne 24, 28 et 32 octets sous son entrée — les variables de `0x61BEC` et de `0x18A44` appelées
par `0x619BF`, ou celles de `0x61CF1`, ou l'`ebp` sauvé par `0x349EB`, appelées par `0x61DE9`.
Le plus souvent c'est une adresse de pile : `0x627D3` ne trouve rien et l'agent reprend son
embauche, et `0x61BEC` lit hors de la table des directions opposées. Les six fonctions de la tonte
ouvrent le cadre de l'original et s'appellent entre elles directement ; **réserve** : les
réécritures de `0x18A44`, `0x349EB` (`simulation-outils.js`) et `0x617E0` (`simulation.js`) ne
laissent pas ces octets. Seule la comparaison appel par appel du module seul le voit : le rejeu de
`longue-faillite` ne le distingue pas, l'agent finissant de toute façon par reprendre son embauche.
**Un sixième, le premier par un autre chemin** : quand aucune routine d'objet appelée avant l'état 4
des visiteurs n'a écrit l'octet qu'il relit, celui-ci vient du calendrier (`0x12B1F`), que la boucle
du parc appelle de la même hauteur juste avant `0x21681` : 0x58 octets sous son entrée, c'est l'`ebx`
que le hasard (`0x18B92`) pousse en entrant, au dernier appel du pas, le tirage de l'usure de l'herbe
(`0x139A8`) — `0x3E8`, le diviseur du test du mois, ou en fin de mois le pointeur des comptes du
joueur (`[0xD3814]`, `0xD443C` pour le joueur 0). Le calendrier (`economie.js`) ouvre le cadre de
l'original et appelle ce hasard par `appelerDepuis` ; le hasard laisse sous son entrée l'`ebx` de
son appelant (journal des essais, § 5.6 ; révélé par `circuit-auto`, § 10.10).

### 10.2 Les visiteurs (type 2)

**Les états**, et la routine de chacun :

| État | Routine | Le visiteur… |
|---|---|---|
| 2 | `0x2223B` | descend du bus et gagne l'allée ; passe en 8 |
| 4 | `0x223C1` | est au guichet : décider, payer, se recentrer |
| 6 | `0x2293A` | est égaré et cherche son chemin |
| 8 | `0x22E22` | se promène et décide à chaque case |
| 0xA | `0x243DD` | avance dans une file ; passe en 0xC, en 8 (file sans issue) ou en 6 |
| 0xC | `0x24DFE` | fait la queue |
| 0xE | `0x24F41` | est à bord d'une attraction |
| 0x10 | `0x24F82` | en descend et quitte la sortie ; passe en 8, ou en 6 sans allée voisine |
| 0x12 | `0x254D2` | suit le circuit d'une attraction (le canal du RUBBER TUBING) ; passe en 0x10 |
| 0x14 | `0x25E1B` | va vers une boutique ; passe en 0x38 |
| 0x16 | `0x2634B` | est au jeu d'adresse |
| 0x18 | `0x2641F` | ressort d'une boutique ou des toilettes et regagne l'allée ; passe en 8 ou en 6 |
| 0x1A | `0x273C8` | s'arrête un instant, puis reprend l'état et la direction mis de côté |
| 0x1C | aucune | est dans le bus |
| 0x1E | `0x266D7` | va vers l'arrêt du bus pour rentrer |
| 0x20 | `0x2276C` | n'a pas de chemin |
| 0x22 | `0x2698E` | attend le bus ; passe en 0x1C (il monte) ou en 0x1E |
| 0x34 | `0x24D4B` | fait avancer la file (il la quitte, ou son suiveur avance) ; passe en 0xA |
| 0x36 | `0x258D9` | est au volant (RACE CAR RIDE) |
| 0x38 | `0x25FE7` | attend son tour au comptoir |
| 0x3A | `0x260F4` | est servi, puis paie (`0x68616`) |
| 0x3C | `0x27494` | montre son humeur, puis passe en 0x1A |
| 0x3E | `0x25339` | joue une animation une fois : vomir, vraisemblablement |
| 0x40 | `0x22BA6` | va vers la sortie du parc |
| 0x4A | `0x272DE` | entre dans une attraction sans file |
| 0x4C | `0x275F3` | entre aux toilettes |
| 0x4E | `0x2775A` | est aux toilettes |

Les états 0x28 à 0x2E, 0x32, 0x42 à 0x48 ont leurs routines (`0x64F03`, `0x65820`, `0x6521B`,
`0x65A20`, `0x253BD`, `0x665AE`) ; aucun scénario ne les exerce assez pour en dire le sens, sauf
0x48 : `0x665AE` anime le **nuage d'une explosion**, un objet de type 2 créé par `0x664F1`
(§ 10.16). Aucune écriture trouvée ne pose 0x28 ou 0x2A sur un visiteur — ce sont des états
d'employé (0x28 le nettoyage des toilettes, 0x2A l'employé porté par le joueur, § 10.13) — : les
routines de 0x28 à 0x2E sont
vraisemblablement mortes pour les visiteurs. Un visiteur volé par un voyou passe en émotion 0x1A
(§ 10.14).

**Les champs d'un visiteur** (les objets du parc font 200 octets, § 6.4) :

| Champ | Contenu |
|---|---|
| `+0x05` | drapeaux : bit 1, sauter la décision de la case ; bit 2, une silhouette à part ; `0x40`, il a quelque chose à exprimer |
| `+0x06`, `+0x08` | position en 256es de case : l'octet haut est la colonne (`+0x07`) ou la rangée (`+0x09`), `0x80` le milieu de la case |
| `+0x0A` | l'image affichée |
| `+0x0C`, `+0x0D` | l'état ; celui à reprendre après le guichet |
| `+0x0E`, `+0x10` | un vecteur de déplacement |
| `+0x12` | la direction : 0 rangée − 1, 1 colonne + 1, 2 rangée + 1, 3 colonne − 1 |
| `+0x13` | la vitesse, en 256es de case par passage : 8 ou 16 |
| `+0x14` | un compte à rebours ; traverser une case prend 0x100 / vitesse passages |
| `+0x16` | l'attraction ou la boutique visée |
| `+0x18`… | les genres d'attraction déjà essayés, un bit par genre (rang du genre, fiche `+0xC1`) |
| `+0x1E` | le suivant dans la file (l'attraction garde le premier dans son `+0x1E`) |
| `+0x20` | au guichet, la phase ; dans la file, une heure |
| `+0x45`, `+0x47` | le passager suivant, dans le bus et dans l'attraction |
| `+0x4F` | le joueur dont il est le visiteur, une fois l'entrée payée ; −1 avant |
| `+0x50`, `+0x51` | l'estomac et la soif, signés ; le confort va de 5 à 7 ; un achat les remplit |
| `+0x52`, `+0x53` | les boutiques de souvenirs et les jeux déjà faits ; bit 1 : il a gagné au jeu |
| `+0x54` | le contentement |
| `+0x56`, `+0x57` | la case visée |
| `+0x58` | une direction ou une vitesse mise de côté |
| `+0x59` | le genre de visiteur, de 0 à 7 : sa table d'animations en `0xB49F4` (0x24 octets par genre) |
| `+0x5A` | une émotion en attente (1 à 3), augmentée de 3 à chaque embarquement |
| `+0x63` | les déchets qu'il porte : 1 gobelet, 2 emballage, 4 le met en 0x3E |
| `+0x6F` | l'argent |
| `+0x75` | l'heure du dernier plaisir ; l'ennui vaut (maintenant − `+0x75`) >> 9 |
| `+0x81` | le nombre d'attractions faites |
| `+0x82` | la fatigue |
| `+0x8B` | le délai avant une émotion (32) |
| `+0xB3` | le nombre de mises à jour de l'humeur |
| `+0xB7`, `+0xB9`, `+0xBA` | la bulle de pensée (un numéro de figure), sa durée, sa raison |
| `+0xBC` | l'état à reprendre après une émotion |
| `+0xC6` | les cases sales rencontrées |

**La promenade** (`0x22E22`). À chaque case, le visiteur jette ce qu'il a en main quand son compte
à rebours tombe à zéro (le déchet s'ajoute à l'octet `+3` de la case, § 6.2), pense (`0x2789A`), et
son humeur est mise à jour (`0x672A5`). Il rentre chez lui si sa fatigue atteint 2 000 × le nombre
d'attractions du parc, ou 12 000, s'il est là depuis plus de 4 000 pas (quatre mois), ou si le parc
ferme. Sinon il regarde les cases voisines, haut, droite, bas, gauche, et la première occasion
l'emporte : la route de sortie, le guichet, une boutique, une attraction sans file, une file, des
toilettes. À défaut, une table donne sa direction, ou il la tire au hasard (1/4, 1/2, 1/4 sur trois
sorties, puis une chance sur deux de corriger). Un panneau indicateur peut l'emporter : la boutique
annoncée 7 fois sur 16 si elle le tente, l'attraction annoncée si hasard(256) + 4 × `+0xB8` +
`+0xA9` + 4 × `+0xA6` (champs de la fiche du genre) dépasse 200. Un arbre lui donne prix / 16 de
contentement, une fois par 128 pas.

**Le guichet** (état 4, `0x223C1`). L'attrait du prix d'entrée (`0x6804A`) vaut a − (prix − j) × a / j,
avec j = `+4` × (`+0x105` / 2 + `+0x8A`) / 128 et a = `+0x48` + `+0x21` (champs de la fiche du parc,
§ 10.8). Le visiteur entre si l'attrait atteint le seuil `+0x47`, avec une chance attrait / seuil en
dessous ; sinon il renonce (contentement − 250, état 0x40). Il paie : le prix va au solde et à trois
recettes. Dans la démo, j vaut 1 321 : tous les visiteurs entrent, et il faudrait un billet d'environ
1 500 pour qu'ils hésitent.

**L'humeur** (`0x672A5`), aux cadences comptées en appels (`+0xB3`) :

- au guichet : − prix / 16, ± 8 au hasard ; fatigue et ennui repartent de zéro ;
- à bord, un appel sur 8 si l'attraction tourne : + intensité × 144 / 256 + 2 × (6 − réglage), où
  l'intensité est l'octet `+0xA9` de la fiche du genre (90 pour le ROLLER COASTER, 6 pour le MAZE) ;
- à la descente : + intensité / 2 + 0 à 31 ; l'estomac et la soif perdent ((6 − `+0xB8`) × 16 +
  intensité) / 64 ;
- sinon une pénalité s'accumule et est retirée du contentement : la foule (un voisin très content,
  très mécontent, content ou mécontent déteint sur lui), la saleté (128 / 32 + ennui), les toilettes
  (de 40 à 160 selon l'estomac, de 25 à 100 selon la soif), vomir (300 ; estomac − 8, soif − 4,
  fatigue + 3 000), les besoins hors de la zone de confort, la file (ennui + usure / 32, un appel
  sur 4), la marche (fatigue + 32 − contentement / 128 ± 4), la fatigue au-delà de 8 000
  ((fatigue − 8 000) / 256, un appel sur 4).

Les coefficients viennent de la fiche du parc : `+8` = 144 le plaisir, `+0xA` = 16 les besoins,
`+0xB` = 128 la saleté, `+0xD` = 10 la foule ; les seuils, `+0` = 200 (content) et `+2` = −100
(mécontent).

**Les bulles et les émotions** (`0x2789A`). Quand sa bulle a assez duré, le visiteur passe en revue
19 raisons, en tournant, et montre la première qui s'applique : la fatigue (au-delà de 12 000, 8 000,
7 000), plus de 8 cases sales, moins de 400 d'argent, toutes les attractions faites, sept besoins,
un plaisir trop ancien, plus de 3 000 pas dans la file, puis son humeur (mécontent, entre les deux,
content). L'émotion vient toutes les 256 pas : il s'arrête (état 0x1A, ou 0x3C quand on la force) et
prend une animation : l'émotion en attente, sinon la fatigue, le très mécontent, le content,
l'ennui, le mécontent.

**Les achats** (`0x68616`). L'excès de prix vaut 2 × (prix × 100 / coût − 100 − marge), la marge
tolérée étant le mot `+6` de la fiche du parc, 40 dans la démo. Un souvenir est acheté si argent / 8 +
contentement / 16 + 50 − excès − prix / 2 est positif ; à manger ou à boire, si contentement / 16 +
ventes / 256 + 32 × (apport − déjà mangé et bu) + argent / 8 − prix − excès l'est, après quoi le
contentement baisse de (prix en % − 125) / 4. `0x68149` pose sinon la bulle du refus : « trop cher »
au-delà d'une marge de 200 %, « pas d'argent » sous 500 (objets) ou 400 (jeux, nourriture). Un seul
client à la fois devant un jeu, moins de quatre ailleurs.

**Les toilettes** : il n'y entre que si l'estomac ou la soif dépasse 4 ; il y reste 4 × (estomac +
soif) passages plus une durée propre au genre (25, 50 ou 150), et en ressort estomac et soif à −1.

**Le départ.** L'état 0x40 le mène à la sortie (chemin par `0x349EB`, § 10.7 ; sans chemin, l'état
0x20, où il attend sur place et redemande toutes les 50 mises à jour — l'eau l'y laisse pour de
bon : demandes.md, retour 62) ; l'état 0x1E, à
l'arrêt du bus, la case `[[0xD3814] + 0x2CA]`, (32, 60) dans la démo, un sol 0x88, où il se range
dans la file (état 0x22) à 0x80 du précédent.

### 10.3 Les attractions (type 4)

**Le mode** (octet `+0xC`) vient de la fiche du genre (`+0xB0`) à la construction (`0x2EBB7`) et ne
change plus, sauf par l'explosion :

| Mode | Routine | Attractions |
|---|---|---|
| 2 | `0x2FB85` | à tours : 14 dans la démo |
| 4 | `0x3006A` | à bouées : RUBBER TUBING |
| 6 | `0x41F3D` | à train : ROLLER COASTER, BIG DIPPER… (§ 10.6) |
| 0x1C | `0x30480` | à voitures : RACE CAR RIDE |
| 0x1E | `0x30803` | les spectacles : COWBOY, CLOWN, DOLPHIN, MEDIEVAL ACTS |

L'explosion (`0x6662D`, § 10.16) fait passer PLANE FLYER au mode 0x26 et BOUNCY CASTLE au mode
0x24, traités par `0x66AFD` et `0x66976` ; les autres genres sont démolis sur-le-champ. Le monorail a
sa propre routine, `0x44208`, au mode 6 (le seul genre qui porte 3 en `+0xB4` ; identifiant `0xDB`
en `+0x22` de la fiche), et ses wagons l'état 0x22 des véhicules (`0x43BAA`, § 10.17).
**Correction** : on écrivait que `0x43BAA` traitait un « mode 0x22 » d'attraction.

**La phase** (mot `+0x32`) :

- 0, au repos : tous les 8 passages, la tête de file monte (`0x30B19`). Le départ est donné quand
  l'attraction est pleine, ou quand le compte à rebours `+0x1C` est écoulé ; il part de 8 et descend
  tous les 8 passages sans nouvel arrivant ;
- 1, le départ : l'animation finit sa boucle, puis prend l'image de marche (fiche `+0x26`) ;
- 2, en marche pendant la durée `+0x34`, une image tous les 2 × délai + 1 pas ;
- 3, l'arrêt : l'image d'arrêt (fiche `+0x28`), puis un passager descend tous les 16 passages
  (`0x31F95`) ; vide, l'attraction reprend son image de repos (fiche `+0x24`) et revient à 0 ;
- 4, la fin d'un spectacle, ou d'un tour de train ;
- 6 et 7, un incident.

**Les spectacles** jouent un programme en `0xB8C60`, 8 mots par sorte (0 cowboys, 1 clowns,
2 dauphins, 3 chevaliers) : chaque figure est jouée en boucle, une valeur négative est une pause,
0 la fin.

**L'usure** (`+0x2E`). Chaque départ l'augmente de 7 − délai + durée / 256 + départs / 6 (5 pour le
FLIGHT SIM, 9 pour la BIG WHEEL). Au-delà du seuil de la fiche (`+0xA8` : 80 en général ; 40, 60,
180 ou 200 pour quelques genres), une animation s'ajoute (la figure `0x167`) et la musique se
désaccorde (`0x66BA0`, § 10.16) ;
au-delà du double, l'attraction explose au départ suivant (§ 10.16). Un voyou porte à 40, d'un cran par
pas, l'usure d'une attraction qui en est en dessous (§ 10.14). Délai à 0 et durée au minimum accélèrent beaucoup l'usure :
c'est ainsi que `horza-objets` fait exploser CHÂTEAU MOU (seuil 40) et AVIONS. Le mécanicien la répare (§ 10.5).
Les incidents demandent un délai d'animation supérieur à 6 : aucun genre n'en a (4, 3 ou 0), et
l'interface le règle de 0 à 6. Ils n'arrivent donc jamais.

**L'argent.** Le prix de construction n'est pas payé tout de suite : il est rangé en `+0x38`, en
centaines, et ajouté à la somme engagée du joueur ; il est débité au premier embarquement, dès
qu'un visiteur attend en tête de file pour un spectacle, ou un mois (1 000 pas) après la
construction si personne n'est venu. La construction (`0x2EBB7`, § 11.5) range aussi le coût
entier dans le mot long `+0x5B` de l'attraction, et compte dans la fiche du parc une attraction de
plus (`+0x82`), son attrait moyen (`+0x8A`) et son remplissage (`+0x8E`).

**La démolition** (`0x31748`, réécrite dans `construire.js`), le contraire de la construction,
appelée par la question « démolir ? » (`0x78B7E`, § 11.18), le tutoriel (`0x59C85`) et l'explosion
(`0x6662D`, `0x66976`). Le bilan, dans l'ordre : les panneaux indicateurs (type 0x14, état 8) qui
la montraient (`+0x69`) perdent leur flèche, et un panneau sans flèche (`+0x69`, `+0x6B`, `+0x6D`)
est retiré ; le prix encore dû (`+0x38`) sort de la somme engagée ; l'attraction est fermée
(`0x31668`) ; la fiche du parc perd une attraction (`+0x82`), l'attrait que la construction avait
ajouté (fiche `+0xA9` divisé par le nombre d'attractions du genre, elle comprise) et son remplissage
(fiche `+0xA6`, mot `+0x8E`) ; les 22 cases de l'emprise sont rendues au sol, barrières (type 0x14,
état 2) retirées ; le kiosque et, pour les modes 4, 6 et 0x1C, le second kiosque sont retirés, leurs
files vidées (`0x205D7`) ; le monorail perd les cinq rails de sa gare (`0x44BB8`, `0x2C6B8`), les
autres trains leurs wagons (`0x41EB4`) et leur voie (`0x44C91`, § 11.19) ; le nombre possédé du
genre (fiche `+0xC7`) baisse ; une attraction de moins de dix ans retire des dépenses de l'année
(`+0x37` de la fiche du joueur, qui fait la valeur du parc) son prix `+0x5B` amorti par `0xB52DA`
— **rien n'est remboursé au solde** ; enfin les statistiques (`0x68E34`) et l'attrait du prix
(`0x6804A`) sont refaits. **Anomalies reproduites** : la recherche des barrières reprend au premier
objet de type 0x14 de la case, et bouclerait sans fin s'il n'était pas à l'état 2 ; seul le mot bas
de l'âge sert d'indice. **Non établi** : `0x44BB8`, qui ôte les rails du monorail, pas étudiée.

**Les champs** : `+0x0A` l'image courante, `+0x13` le délai d'animation (fiche `+0xB8`), `+0x14` le
compte à rebours de l'image, `+0x16` le genre (décalage dans le catalogue), `+0x1C` le compte à rebours
du départ, `+0x1E` la tête de file, `+0x26` la capacité (fiche `+0xA6`), `+0x30` le nombre à bord,
`+0x34` la durée d'un tour (fiche `+0xAC`), `+0x36` le temps restant, `+0x3A` les départs, `+0x3C` les
visiteurs servis, `+0x47` le premier à bord, `+0x49` le kiosque d'entrée, `+0x4B` l'ouverture (1
ouverte, 0 fermée par le joueur, −1 en réparation), `+0x73` la case de sortie.

**Deux catalogues de genres**, remplis à l'exécution : `0xB16F8`, les fiches de référence, aux noms
français (SIMULATEUR DE VOL, TASSES…) ; `0xCCED0`, celui de la partie, aux noms anglais dans
`DEMO.GY`, dont les capacités, durées, seuils et prix ont évolué. La recherche (`0x53F13`) améliore
une fiche : seuil + 5 jusqu'à 120, capacité + 1 et durée + 50 jusqu'au double de la référence, prix
× 15/16, arrondi à la centaine inférieure, 500 au moins.

### 10.4 Les boutiques et les installations

**Le catalogue des boutiques** commence en `0xD3C62` : 17 fiches de 107 octets, le nom en tête.
`+0x24` la famille (1 manger, 2 boire, 4 souvenirs, 8 jeu d'adresse), `+0x4D` le coût (ou le lot au
jeu), `+0x4F` le prix, `+0x56` et `+0x57` l'apport à l'estomac et à la soif, `+0x5C` le déchet
laissé, `+0x5D` la chance au jeu, `+0x5E` et `+0x5F` l'ingrédient dosé et sa dose (au café, une
dose au-dessus de 3 double la vitesse du client), `+0x67` la marchandise en réserve, dans `0xD3C00`.
Une boutique (type 0xA) : `+0x14` ses ventes, `+0x16` sa fiche, `+0x38` sa dette en centaines,
`+0x47` le client en cours. Aucune routine de mise à jour ne lui est propre dans les scénarios :
c'est le visiteur qui achète.

**Les installations** (type 0x18), dans le catalogue `0xCCA70` : les toilettes (BOGGY CRAPPER,
OUTHOUSE, SUPER TOILET) et la fontaine. `+0xC` = 2 en service, `+0x3C` les usages ; l'agent
d'entretien les nettoie au-delà de la moitié du seuil de saleté.

### 10.5 Le personnel (type 8)

**Le catalogue des métiers**, en `0xD35C0`, fiches de 0x36 octets, le nom en tête : 0 SHARK MAN, 1
MECHANIC, 2 HANDYMAN, 3 CHICKEN_MAN, 4 TEDDY MAN, 5 RHINO MAN, 6 SQUID MAN, 7 STRONG MAN, 8 GUARD.
`+0x24` le salaire d'embauche (62, 310, 124, 186, 37, 372, 167, 186, 559), `+0x26` et `+0x28` les
premières images de la marche et de l'attente, `+0x2A` celle du travail, `+0x2C` l'état d'embauche
(2 les amuseurs, 8 le mécanicien, 0x16 l'agent d'entretien, 0x34 le gardien), `+0x31` la vitesse,
16 pour tous, `+0x33` le nombre d'employés du métier.

**L'employé** : `+0x0C`, `+0x0D` l'état et le suivant, `+0x12` la direction, `+0x14` un compte à
rebours, `+0x16` pour le mécanicien l'attraction où on l'appelle, `+0x1E` pour le gardien la chaîne
des voyous arrêtés, `+0x20` la patience, `+0x3E` l'heure d'embauche, `+0x56`, `+0x57` la case visée,
`+0x9A` le salaire, `+0x9C` une tournée tracée par le joueur (8 cases au plus). L'écran de l'employé
règle le salaire par pas de 2 jusqu'à 6 000 ; `0x68E34` le ramène au minimum du métier.

**L'embauche** (`0x32232`, `moteur/jeu/construire.js`) pose l'employé au centre de la case : le
salaire du métier en `+0x36` et `+0x1C`, l'heure d'embauche `+0x3E`, le métier `+0x59`, l'image de
la marche plus la direction, l'état d'embauche du métier, la vitesse, et une patience de 400
(`+0x14`, `+0x20`). Le salaire est inscrit au livre des comptes en catégorie 6, en négatif. Un
amuseur, un mécanicien ou un agent d'entretien reçoit aussi son salaire en `+0x9A` et compte un
employé de plus dans la fiche du parc : `+0xD4` les amuseurs, `+0xCC` les mécaniciens, `+0xD0` les
agents d'entretien. Les deux derniers deviennent l'objet choisi ; l'agent d'entretien voit sa
tournée effacée. **Anomalie reproduite** : le gardien (état `0x34`) ne reçoit pas de salaire en
`+0x9A` — il travaille gratuitement jusqu'à ce que son écran lui en règle un.

**La fiche d'un employé** (écran `0x1C`, `0x3B76E`, § 11.7) : le salaire se règle par pas de 2
jusqu'à 6 000 ; le plancher est le salaire d'embauche pour les amuseurs, les minimums `+0x617` et
`+0x615` des comptes pour le mécanicien et l'agent d'entretien. « Valider » garde le salaire dans
`+0x1C`, « annuler » l'en reprend. **Anomalie reproduite** : le bouton « − » ne prévoit pas le
gardien (état `0x34`), dont il ne baisse jamais le salaire.

**Comment chacun choisit sa tâche :**

- **l'amuseur** (états 2, 4, 6) flâne ; son compte épuisé, il regarde 1 à 5 cases devant lui et
  va vers les visiteurs qu'il voit, sinon sa patience (400 au départ) est divisée par deux, et à 25
  ou moins il repart vers l'entrée du parc. À chaque pas, il cherche sur sa case et les quatre
  voisines un visiteur qui se promène, au contentement de 200 au plus (n'importe lequel par
  intempéries), et l'amuse : un toutes les 16 pas, contentement + (salaire / 2 + 16), fatigue −
  (salaire / 8 + 8). **Un amuseur mieux payé amuse mieux** ;
- **le mécanicien** (états 8 à 0x14) cherche tous les 200 pas l'attraction usée la plus proche
  (usure au-delà de 39, non fermée, personne d'appelé), s'y inscrit, y marche, la ferme en posant
  des poteaux, la répare (usure − 5 par cycle) et la rouvre ;
- **le gardien** (état 0x34) patrouille sans jamais perdre patience, presque immobile, et regarde
  devant lui tous les 400 pas ; il arrête les voyous (objets de type 0x1A) voisins marqués d'un
  méfait, les chaîne et les escorte (états 0x36, 0x38, § 10.14) ;
- **l'agent d'entretien** (états 0x16, 0x18) suit sa tournée s'il en a une ; sinon il va vers des
  toilettes ou une fontaine trop sales, ou vers la sortie qui mène au plus de déchets (comptés sur
  5 cases), à défaut au hasard, et balaie s'il y a des déchets sur sa case. Embauché sur l'herbe, il
  la tond (§ 10.13). **Anomalie reproduite** : le hasard, pris modulo l'ensemble des sorties puis
  comme masque, et ramené à une direction par la table `0xB4970`, est biaisé vers le haut et la
  droite (entre le haut et le bas, le haut 80 % du temps), et fait parfois faire demi-tour : sans
  tournée, les agents finissent en haut à droite du parc (corrigé en option : demandes.md, retour 63).

**Le balayage** (état 0x1C, `0x638EF`, réécrit dans `personnel.js`) : le balai avance d'une image
par pas ; au bout du cycle, les déchets de la case sont enlevés, et le compte de déchets du parc
(mot `+0x80` de la fiche du parc) baisse d'autant — la table `0xBA820` donne, pour les trois bits de
déchets de l'octet +3 de la cellule, leur nombre (0, 1, 1, 2, 1, 2, 2, 3) —, puis l'agent reprend
l'état gardé en `+0xD`, en marche dans sa direction, patience à 20 ; la carte est à redessiner si
la case est dans la vue. Désigné par le joueur (bit 2 de `+5`), il passe par `0x645AD` (§ 10.13).
Rend 1 à la fin du cycle. La case reste dans son `[ebp-8]`, le reste que relit l'état 4 des
visiteurs (§ 10.1).

**Le renvoi** (`0x325DA`, réécrit dans `voyous.js`) retire l'employé des compteurs du parc
(`+0xC2`) et de son métier, compte un renvoi (`+0xC4`), inscrit au livre son salaire d'embauche en
catégorie 3 — une indemnité, vraisemblablement — et efface l'objet. La fiche d'un employé l'appelle
par sa commande « vendre » (`0x0A`, § 11.7), et l'amuseur qu'un voyou a fait fuir y finit
(§ 10.14). **À vérifier** : `construire.js` fait amener la vue, par les zones 23 à 26 (§ 11.5), sur
l'employé suivant de l'état d'embauche 2, 8, 0x34 ou 0x16 ; le compositeur des scénarios `outils`
a vu la zone 24 choisir l'agent d'entretien et la zone 26 le mécanicien, ce qui ne concorde pas.

### 10.6 Les véhicules (type 0xE)

| État | Routine | Sens |
|---|---|---|
| 8 | `0x420C7` | wagon en gare : embarquement, départ |
| 0xA | `0x42392` | wagon en marche : courbes, entrée dans un élément, arrêt en gare |
| 0xC | `0x42E06` | wagon dans un élément de plusieurs cases (looping) |
| 0x14 | `0x613CA` | bus en route |
| 0x16 | `0x6160D` | bus à l'arrêt, qui dépose ses passagers |
| 0x18 | `0x61772` | bus qui attend avant de repartir |
| 0x1A | aucune | bus parti |
| 0x20 | `0x43A33` | wagon sorti de la voie : il vole, tombe et s'écrase |
| 0x22 | `0x43BAA` | wagon du monorail |

**Le train** est une chaîne de wagons : la tête a son `+0x45` à 0, les autres y désignent la tête,
et `+0x61` le wagon suivant. Sa vitesse est le mot signé `+0x0E` de la tête, en 256es de case par
pas, entre 8 et `0xE0` en marche avant ; à chaque pas, la tête ajoute l'accélération du dernier
morceau de voie atteint. Au départ, la vitesse vaut l'octet `+0x13` de l'attraction (4 dans la démo)
et l'accélération 4 : le train roule à 8 dès le premier pas. Dans les loopings (voies de genre 2),
la pesanteur retire (13 × sin(2π × cran / longueur)) / 256 par cran (sinus en `0xB4E90`), et le train
peut repartir en arrière. À chaque case, le passager gagne `0xB531E[hauteur]` de contentement (de 2
à 125), plus l'accélération / 16 + 4. Dans une courbe, une attraction usée (au-delà de `0x11`)
lancée au-delà de `0x23` éjecte son passager une fois sur 64 (`0x65D25`).

**Les morceaux de voie** (type 0x12) : `+0xC` la forme (1 à 4 les courbes, 5 et 6 les droites, 7 à
10 les bouts, 11 à 18 les pentes), `+0x16` le genre (l'octet `+0xB4` de la fiche de l'attraction :
1 BIG DIPPER et WATER SPLASH, 2 ROLLER COASTER, LOOP THE LOOP, CORK SCREW, 3 MONORAIL), `+0x61` le
morceau maître de l'élément, `+0x79` la hauteur, `+0x80` la longueur de l'élément en crans. Les
éléments sont décrits en `0xB4399`, par genre : figures, accélérations et sorties par direction,
bruitages.

**Le bus** est créé par `0x6128F` en (63, 61), direction 3, environ tous les 1 240 pas, à la vitesse
16. Il ne regarde autour de lui qu'une fois par case ; près d'un sol 0x88, il s'arrête, dépose un
visiteur tous les 4 pas, attend 101 pas, repart ; au bord de la carte, il emporte les visiteurs qui
rentrent et disparaît. **Le modèle du bus** : la fiche du parc garde sa capacité (`+0x48`), son
modèle (`+0x49`) et le plus haut modèle que permet la recherche (`+0x4A`) ; l'écran `0x54`
(`0x78CEF`, réécrit dans `carte-du-parc.js`) demande « oui / non » pour passer au modèle suivant, puis
l'achète : prix en `0xB787C` (longs), capacités en `0xB78CC` (octets), texte `0x12D`. **Non
établi** : les modèles à partir de 9 (`+0x26` − 9 et le mot `+0xA` à 1 : une autre série ?) ; comment
on l'ouvre en jeu — le double-clic sur le bus à l'arrêt ou sur la case BUS n'a rien ouvert, seuls
les deux scénarios de voyous l'atteignent.

### 10.7 Les outils communs

- **Les cases** : la liste des objets d'une case est doublement chaînée (§ 6.4). `0x185C1` et
  `0x1883E` posent un objet en tête ou en queue, `0x18918` le retire, `0x18A44` et `0x18ADF` le
  déplacent et rendent 1 s'il a changé de case, `0x204B9` rend le premier objet d'un type sur une
  case.
- **Les sols** : la table `0xB44D9` donne pour chaque image de sol un mot de drapeaux (2 allée, 4 sol
  d'attraction, 8 file, 0x10 bout de file, 0x20 sortie d'attraction, 0x40 circuit, 0x88 arrêt du
  bus…) et une forme, qui dit les directions ouvertes.
- **Le chemin** (`0x349EB`) : rend la direction à prendre (0 à 3), 4 à l'arrivée, −1 si l'objet est
  bloqué, −2 si la cible est inaccessible. L'objet va au plus droit ; sur un obstacle, deux suiveurs
  de mur partent, main gauche et main droite, pour 50 ou 150 pas, et l'objet retient la main
  gagnante. Un masque de drapeaux dit quels sols sont interdits (`0x29C1`, `0x29CD`, `0x39C1`…).
  Défaut : la sonde qui traverse l'obstacle pour placer la case de reprise peut ressortir dans une
  case enclavée (l'entrée d'une attraction entre l'attraction et sa file, le quai d'un canal), que les
  suiveurs n'atteignent jamais : la cible est déclarée inaccessible alors qu'un chemin existe. Le
  visiteur qui s'en va reste alors planté (état 0x20), comme celui qu'enferment une file et l'eau
  (corrigé en option : demandes.md, retour 62).
- **Les files** : `0x281D5` suit une file jusqu'au kiosque et rend l'attraction qu'il sert ;
  `0x28D5A` choisit l'image d'une allée d'après ses huit voisines, et `0x2CBC0` la retrace dans le
  fond.
- **Le livre des comptes** (`0x78943`) : 49 écritures au plus, de 7 octets (catégorie, jour, mois,
  montant) ; selon la catégorie, le montant va au solde, aux recettes ou aux dépenses.
- **Les statistiques** (`0x68E34`) : sommes et moyennes sur les boutiques, le personnel, les
  visiteurs et les attractions, dans la fiche du parc.
- **Les bruitages** (`0x80C80`) : le premier des 32 numéros d'échantillon libres, puis
  `sosDIGIStartSample` (§ 9.4).

### 10.8 Le joueur courant et ses fiches

Le mot `0xD665C` désigne le joueur courant ; `0x1A2CA` en tire trois pointeurs :

- `[0xD3808]` = `[0xD3B00]` + joueur × 0x222, sa fiche (§ 7) : `+0x0A` le solde ;
- `[0xD3814]` = `0xD443C` + joueur × 0x6C2, les comptes du parc : `+0x46` le livre des comptes,
  `+0x2B4`, `+0x2B6`, `+0x2B8` les visiteurs mécontents, neutres et contents, `+0x2BA` et `+0x2BC`
  la case de l'entrée d'attraction qu'on cherche et son sol, `+0x2CA` la case de l'entrée,
  `+0x2CE` le prix du billet noté à la validation des finances, `+0x2D0` l'attraction dont on pose
  l'entrée ou la sortie, `+0x2D2` la recette des entrées, `+0x41` le numéro du parc, `+0x5EE` la
  charge du bus, `+0x615` et `+0x617` les salaires minimaux de l'agent d'entretien et du
  mécanicien, `+0x63D` le dernier employé montré par les icônes du haut, `+0x680` la disposition
  de la gare qu'on va poser (0 à 3, −1 aucune), `+0x681` la grève du personnel en cours, `+0x682`
  et `+0x683` les séances de négociation ratées avec le personnel et avec les fournisseurs (non
  nul : livraisons suspendues, § 10.15) ; non établi : `+0x2C0`, recalculé à la sortie des finances
  (l'attrait du prix × 100 / `+0x48` du parc, vraisemblablement) ;
- `[0xD3818]` = `0xCF1E0` + joueur × 0x250, la fiche du parc : `+0` et `+2` les seuils de
  contentement, `+6` la marge tolérée sur les prix, `+8` à `+0xD` les coefficients de l'humeur,
  `+0x18` parc ouvert, `+0x1D` le prix d'entrée, `+0x21`, `+0x47` l'attrait du prix, `+0x48` la
  capacité du bus (`carte-du-parc.js`, l'écran du bus, § 10.6 ; le panneau la prend pour la jauge du bus,
  § 11.8), qui entre aussi dans la formule du guichet (§ 10.2), `+0x49` et `+0x4A` le modèle du bus
  et le plus haut permis, `+0x52` le nombre de voyous, `+0x62` × `+0x66` le plafond du prêt, `+0x80`
  les déchets sur les allées, `+0x82` le nombre
  d'attractions, `+0x8A` et `+0x8E` leur attrait et leur remplissage, `+0x9F` les attractions
  retirées par une explosion, `+0xC2` le personnel, `+0xC4` les renvois, `+0xC6` et `+0xE1` la date
  de la dernière séance avec le personnel, avec les fournisseurs, `+0xCA` et `+0xE5` l'indice des salaires et des prix (100 au
  départ, § 10.15), `+0xCC`, `+0xD0`, `+0xD4`
  le nombre de mécaniciens, d'agents d'entretien et d'amuseurs ; `+0x3E`, posé à la création à
  `0x1F4` + (2 − économie du pays) × `0x3E8`, non établi.

### 10.9 Les anomalies reproduites

Toutes sont reproduites par les réécritures et signalées dans leur code. Les principales :

- `0x223C1` lit une variable locale non initialisée (§ 10.1) ;
- le livre des comptes garde 50 écritures mais son compteur s'arrête à 49 : une case jamais écrite
  entre dans le livre au premier décalage ;
- `0x68E34` compte aussi le personnel parmi les visiteurs (un `break` manque), et ne met jamais à jour
  le maximum qu'il cherche ;
- `0x1883E` fait disparaître le décor de la case où il pose un objet ;
- `0x281D5` boucle sans fin si on la lance d'un coin de file ;
- `0x22834` borne la case visée comme un octet non signé : près du bord gauche ou haut, le visiteur
  vise l'autre bout de la carte ;
- la grande fontaine divise par deux l'heure d'entrée du visiteur, qui rentre aussitôt chez lui ;
- le bonus de contentement des trains lit l'accélération sans signe : les montées rapportent le plus ;
- l'à-coup de vitesse d'un wagon qui sort de la voie dépend de la position de la souris ;
- aux toilettes, le visiteur perd du contentement, d'autant plus que le besoin pressait ;
- la raison 14 des bulles compare l'heure du dernier plaisir à 3 000, au lieu du temps écoulé ;
- `0x24D4B` et `0x19ED3` remettent à zéro la demande de sortie de la boucle du parc (`0xD6688`),
  comme `0x2A2F1` quand un rail manque pendant le relevé des hauteurs (par `0x2DEF8`, § 11.15) ;
- à l'embauche, le gardien ne reçoit pas de salaire, et le bouton « − » de sa fiche ne le baisse
  jamais (§ 10.5) ;
- les jauges de la barre d'outils (`0x4091A`) comptent les mécontents comme 20 moins les contents,
  sans retirer les neutres (§ 11.5).

### 10.10 Ce que les scénarios n'exercent pas

Les incidents (phases 6 et 7 : un délai d'animation au-delà de 6, qu'aucun genre ni l'interface ne
donne), les réparations, `0x30C65` (en attente), les souvenirs, la dette d'une boutique, le refus
d'entrer au guichet, l'abandon d'une file, la marche arrière des trains. Plusieurs modules les ont
éprouvés sur des états fabriqués (états du parc modifiés en cours de partie, puis transcription et
réécriture comparées) : 0 divergence, mais ce n'est pas une preuve au sens du guide.

**Désormais exercés** par les scénarios de la sixième vague : le monorail (ouverture, marche,
fermeture, dans `horza-objets` ; `outils-haute` n'ouvre qu'un bout de voie, refusé), les trois
suites d'une explosion (`horza-objets`) et la démolition avec nuage (`longue-faillite`,
`longue-simulation`, les deux scénarios de voyous), les voyous et le gardien, les tournées et la
tonte, la grève, le balayage (`tutoriel`, `tutoriel-haute`). Certains chemins n'ont qu'un seul
scénario : les états 6 et 9 du voyou (le hasard, un voyou par an), l'état 0x24 de l'agent
d'entretien (`longue-faillite`), ses toilettes (`longue-simulation`), la neige (`0x47A27` ne tombe
qu'au hasard, de septembre à février, quatre intempéries par an au plus : `longue-simulation`,
`longue-faillite`, `voyous-arrestation`).

**La septième vague** en a atteint d'autres, avec deux scénarios partis du début de `horza-objets` :

- **`circuit-auto`** : le visiteur au volant (`0x258D9`, état 0x36, 6 710 appels), l'état 0x4A
  (`0x272DE`) et la démolition d'une boutique (`0x35C4A`). **CIRCUIT AUTO** (fiche 8, genre `0x1C`,
  outil 16 en `+0xB5`, emprise d'une seule case) : la piste fermée se trace d'abord, avec l'article
  du catalogue surgissant (clic droit) ; l'attraction s'achète ensuite par la fiche d'achat, qui
  donne l'outil 5, et se pose contre la piste ; le kiosque d'entrée va sur la case de l'attraction et
  la sortie sur la case voisine, d'eux-mêmes, sans les outils 11 et 17 ; le pilote prend la première
  case de piste voisine. **L'état 0x4A** : pendant le survol de l'outil 11 (poser l'entrée),
  `0x193FD` met le kiosque sur la case du fantôme, avec le sol `0x86` (drapeau `0x4000`) ; un visiteur
  qui passe devant, face au kiosque, entre dans l'attraction, neuve donc ouverte, avant que l'entrée
  soit posée. **La boutique GLACES MOTTO** : emprise de c − 1 à c + 1 et de r − 1 à r ; la case visée
  est celle du bas, au milieu. C'est ce scénario qui a révélé le sixième reste de pile (§ 10.1) ;
- **`monorail-visiteurs`** : les visiteurs montent et descendent du monorail (`0x30C65`, `0x449FF`),
  il est fermé avec des passagers puis rouvert, sa gare démolie (`0x44BB8`, § 10.17).

**Restent hors d'atteinte** :

- **le wagon qui sort de la voie** (`0x43A33`) : tout retrait de rail passe d'abord par la fermeture
  de l'attraction. `0x31748`, par démolition ou explosion, ferme par `0x31668` puis `0x448BA`, ou
  ôte le train par `0x41EB4` ; `0x29835` refuse un rail dont l'attraction maîtresse est ouverte
  (`+0x4B`) ; un circuit ne s'ouvre que bouclé (`0x44439`, `0x43689`). Inatteignable en jeu ;
- **`0x64F03`, `0x65419`, `0x6521B`, `0x65820`** : les états 0x28 à 0x2E ne sont posés sur un
  visiteur que par ces fonctions elles-mêmes (écritures en `0x651C0` et de `0x657B3` à `0x65810`) ;
  `0x6374C` et `0x1679E` écrivent ces valeurs sur des employés. C'est du code mort ;
- le réseau (§ 11.6).

### 10.11 Les parcs concurrents

Réécrits dans `moteur/jeu/concurrents.js`. Un concurrent n'a ni carte ni objets : son parc est une
fiche de 0x250 octets en `0xCF1E0` + n × 0x250, faite de compteurs et de moyennes (contentement,
estomac, soif, argent, ennui, fatigue), et il achète dans les catalogues de référence, `0xB16F8`
pour les attractions et `0xB2FF8` pour les boutiques.

**Leur entrée en jeu.** La nouvelle partie (`0x19EEE`) copie les 25 fiches de joueur des modèles
statiques de `0xBA840` — toutes de type 0 : aucun concurrent au départ —, libère les 24 terrains du
monde (table `0xB7B38`, 28 octets par terrain, `+0x1A` l'occupant, −1 libre) et marque 7 la fiche du
joueur. À chaque fin d'année, tant qu'il y a moins de concurrents que `[0xD66F0]` (20 dans la
démonstration), jusqu'à quatre fiches libres sont marquées 7 à leur tour. `0x6E7E6` fait du joueur
courant le type 1, et de chaque fiche marquée 7 un concurrent (type 3) : un terrain libre (une
chance sur 8 par terrain, sinon le premier libre), 100 000 plus 50 000 × `[0xD66F6]` en banque, un
parc ouvert aux seuils 300 et −150, une affluence de 20, cinq genres interdits (RIVIERE, CIRCUIT
AUTO, LOOPING, TIRE-BOUCHON, MEGA SPLASH), une action à 10 000 pour 10 parts, et son mois : le
compteur de période part de 40 × son numéro, si bien que les concurrents jouent chacun leur tour,
40 pas après le précédent.

**Le mois d'un concurrent** (`0x7085C`) tient en quelques moyennes. Des visiteurs partent — les
ennuyés (au-delà de 3 000 d'ennui) et les fatigués —, d'autres arrivent par la même formule de
guichet que dans un vrai parc (§ 10.2), au plus l'affluence et jamais au-delà de 800 présents. Puis
les stands servent une part décroissante des visiteurs, bornée à leur stock ; les attractions
accueillent deux fois leur capacité moyenne, puis la moitié, le tiers… jusqu'à un sixième, le tout
multiplié par 1 000 et divisé par la durée moyenne d'un tour ; le plaisir qu'elles donnent vaut le
contentement plus quatre fois l'intensité moyenne, plus l'intensité totale divisée par 8, plus
16 × (6 − délai). L'usure monte de 7 − délai + durée / 256 + âge / 8 par mois ; les mécaniciens la
ramènent à (attractions − mécaniciens) / attractions de ce qu'elle était ; au-delà du double du
seuil, l'attraction qui a le plus rapporté est retirée ; au-delà du seuil, les pannes coûtent 1 000
de contentement chacune.

**Ses décisions** (`0x6EE22`), dans l'ordre : il paie son personnel ; il fait son bénéfice (recettes
et salaires cumulés, divisés par le rang du mois, moins l'intérêt du prêt, `[0xD668E]` / 16 384 par
mois, soit 0,85 %) ; il embauche un mécanicien si l'usure dépasse un seuil, un agent d'entretien si
la saleté en dépasse un autre, un amuseur si le contentement est trop bas, et débauche s'il ne gagne
rien ; il achète un stand quand l'estomac moyen est trop creux ; il achète ou met en projet une
attraction, notée par son prix, son intensité et sa capacité, modulés par ses penchants et un
tirage ; riche, il prend les souvenirs et les jeux qui lui manquent ; il dépense sa réserve de
décor ; il règle la vitesse de ses attractions, son prix d'entrée (environ 1,25 à 2,5 fois
l'intensité totale) et ses prix de vente ; enfin, sous le seuil de pauvreté, il emprunte 50 000 si
la valeur de son parc le couvre, et rembourse quand il est à l'aise. Toutes ces décisions passent
par une cinquantaine de tables 5 × 5 en `0xBDE7C`–`0xBE43E`, indexées par quatre traits de sa fiche.

### 10.12 La fin de l'année

Réécrite dans `moteur/jeu/fin-annee.js`. Tous les 12 000 pas, le pas du calendrier appelle
`0x7401C` : la partie s'arrête sur deux écrans qui attendent un clic, puis repart pour une année.
Dans l'ordre : le rachat du terrain, un livre de comptes neuf, la bourse, les impôts, les trophées,
de nouveaux concurrents, les classements, l'écran, puis la nouvelle année — le bilan, les
nouveautés annoncées (§ 11.19) et la sauvegarde automatique (`save/<nom>.GY`). À ULTRA-RAPIDE, une
année prend environ 33 s virtuelles ; la fin d'année ne change pas l'écran `0xD6652`.

**Le rachat du terrain.** Après douze ans, si le terrain n'est pas acheté, le jeu propose
« VOULEZ-VOUS RACHETER VOTRE TERRAIN POUR %d », au prix de l'impôt par case du pays × 4 096 (les
cases de la carte) / 50. Payé, le joueur ne paie plus d'impôts locaux.

**La bourse** (`0x729D8`). La valeur d'un parc est la somme de ses investissements des dix dernières
années, amortis à 100, 95, 85, 75, 65, 55, 45, 35, 25 puis 10 %. Les dividendes valent les actions
détenues × le solde du propriétaire / (32 × les actions émises), le double au-delà de la moitié du
capital, 30 000 au plus. **La faillite** frappe une fortune négative ou une action tombée à 99 : le
joueur est averti une fois (« VOUS FEREZ FAILLITE L'AN PROCHAIN »), puis perd la partie — la
séquence BUSTED, `0x5C7D1(1)`, § 11.20, et le retour au menu titre ; dans `longue-faillite`,
accepter les hausses de salaire ruine le parc de la démonstration au niveau 2, averti à la fin de
l'année 8, en faillite à la fin de l'année 9 ; un concurrent, lui, disparaît — son parc ferme,
ses actions sont revendues, son pays est libéré et sa fiche repart de l'état neuf. Enfin le taux
d'intérêt de l'année est tiré : prêts / 400 000 + 3 − hasard(6).

**Les impôts et l'inflation** (`0x51111`) : les cases bâties × l'impôt par case / 100, après les
années d'exemption du pays ; puis l'inflation relève l'impôt, le prix de chaque attraction et de
chaque boutique — arrondi au multiple de 250 —, et se déplace elle-même un peu au hasard.

**Les neuf trophées** (`0x76FA3`) : la sécurité, la popularité, la technologie, la mise en place,
l'ambiance (cinq mentions, de 10 000 à rien), et les records du monde — les montagnes russes les
plus hautes, les plus longues et les plus chères, la plus longue rivière, le plus long circuit de
voitures, et le parc le mieux coté en bourse. Leur total est versé à la nouvelle année.

**Les six classements** — LE PLUS RICHE, SATISFACTION, LE PLUS AMUSANT, LE PLUS GRAND,
INSTALLATIONS, LE PLUS AGREABLE — sont des tables de fiches de 5 octets (`0xDE1E0` à `0xDE54B` :
27 bits de valeur, 5 bits de joueur), triées par valeur décroissante ; la somme des six rangs donne
la place au classement général, dont `0x73347` tire l'attrait du parc (un bonus au premier quart, un
malus au dernier) et six notes.

**Les écrans** : la page des trophées et celle du classement par catégorie, un bouton pour passer de
l'une à l'autre, un autre pour terminer — et 1 000 images sans un geste terminent aussi, ce qui est
la façon dont la démonstration traverse la fin d'année. Vient ensuite **le bilan** : valeur du parc,
valeur des actions, solde, prêt, prêt maximum, recettes, dépenses, dividendes encaissés et payés,
impôts locaux, sur deux colonnes, cette année et l'an dernier.

**La vente du parc.** Si le double de la valeur du parc dépasse 50 000 et que la partie a cinq ans,
le bilan offre « CLIQUEZ ICI POUR VENDRE LE PARC ». Confirmée, la vente ouvre la salle des enchères
(1 860 images) ; `0x73EE8` y cherche les joueurs dont le solde, moins le prêt, plus les actions,
dépasse la moitié du prix. L'acheteur paie, rembourse son prêt en revendant ses actions ; le
vendeur revend les siennes, empoche le prix moins son prêt plus son solde, et son parc change de
mains. Dans la démonstration, le plus riche des concurrents reste sous la moitié de la mise à prix :
les enchères s'y terminent sans acheteur, ce qui explique la salle qui tourne en boucle.

### 10.13 L'agent d'entretien : la tonte, les toilettes, la tournée

Réécrit dans `moteur/jeu/entretien.js` (23 fonctions) ; ses premiers états (0x18 les allées, 0x1C
le balayage) sont au § 10.5, son embauche (0x16, `0x617E0`) dans `simulation.js`. La mise à jour
des objets aiguille sur l'octet `+0xC` :

| État | Routine | L'agent… |
|---|---|---|
| 0x1E | `0x619BF` | tond : avance d'une case, s'oriente (`0x61BEC`), cherche l'herbe suivante |
| 0x22 | `0x629DB` | marche vers la case visée (chemin `0x349EB`) |
| 0x24 | `0x62B9C` | attend, puis cherche un nouveau chemin |
| 0x1A | `0x62CBB` | hors des allées, en cherche une en spirale diagonale, 40 cases au plus ; à défaut, vise (32, 56) |
| 0x26, 0x28 | `0x6369E`, `0x63803` | entre dans des toilettes, les nettoie, revient vers sa case visée |
| 0x2C, 0x2E, 0x32 | `0x64641` | la tournée qu'on trace ; puis revient à sa case de départ |
| 0x30 | `0x63A85` | suit sa tournée : toilettes voisines, étapes, balayage |

**La tonte.** Embauché sur l'herbe, l'agent note sa case comme coin d'une parcelle de 6 × 6 (`+0x64`
la colonne, `+0x65` la rangée, octets signés) et sa direction comme sens de la tonte (mot `+0x61`).
La bande k (0 à 5) est la k-ième rangée parallèle au sens, décalée d'un quart de tour à droite ;
les bandes paires se tondent dans le sens, les impaires à rebours. `0x62913` situe l'agent : le rang
dans `0xD7B6C`, la bande dans `0xD7B6D`, deux octets qui ne servent qu'à cela. `0x61CF1` compte les
cases restantes devant lui, `0x61DE9` cherche la prochaine herbe atteignable de la bande (état
0x22), `0x61F81` passe aux bandes suivantes, et à défaut relance l'embauche (`0x617E0`), qui choisit
une nouvelle parcelle ou le renvoie aux allées ; `0x627D3` rend la première herbe entre deux cases.
Tondre (`0x6284C`) fait monter l'image du sol de 0 vers 3, efface les déchets et retrace la case ;
l'herbe à tondre est un sol sans drapeau d'image inférieure à 3. `+0x2A` compte les pas de tonte,
`+0x34` les pas de travail.

**Les toilettes** (0x26, 0x28) : la saleté de l'installation (`+0x3C`) est retirée du total du parc
(`+0x84` de sa fiche), et le nettoyage dure 8 pas par unité de saleté.

**La tournée tracée** (`0x64387`, les clics dans la fenêtre de l'agent). La zone 16 le désigne
(bit 2 de `+5`, seulement s'il est à l'état 0x18) ; au bout de sa case, `0x645AD` le met à l'état
0x2C et note sa case de départ (`+0xAE`, `+0xAF`). La zone 21 donne l'outil 20 (état 0x2E) : chaque
clic dans le parc poste l'événement `0x2C`, et `0x64CF5` ajoute une étape — 8 au plus, mots `+0x9C` à
`+0xAA`, −1 libre ; `+0xAC` l'étape visée, `+0xAD` celle du tracé, `+0xB0` celle d'où la carte
dessine. La zone 21 de nouveau ramène à 0x2C ; la zone 16 de nouveau lance la tournée (0x32, puis
0x30) ; la zone 17 l'efface et rend l'outil 0. L'agent s'y rend par **son propre chercheur de
chemin** (`0x63E5D`), qui longe les obstacles en les gardant à gauche (bit 0x10 de `+5`) ou à droite
(0x20) jusqu'à la case de reprise `+0x71` ; `0x648D3` vise l'étape, `0x64940` dessine le trajet sur la
carte et la case sous le pointeur, `0x64AC7` trace un tronçon par `0x63E5D` sur l'objet choisi puis
lui rend son état, `0x64D9A` marque une case en silhouette colorée. La zone 20 (outil 19) prend
l'agent en main (état 0x2A) ; reposé sur l'herbe (`0x348ED`, § 11.17), il passe en 0x22, puis 0x1E.

**Anomalies reproduites.** L'embauche hors de l'herbe et des allées ne pose pas le sens de la tonte :
le cinquième reste de pile (§ 10.1). Dans `0x61CF1`, deux bornes lisent le coin de la parcelle et
deux la case de l'agent, et le bas de la carte est la rangée 61, contre 60 dans `0x61F81`. `0x648D3`
pose un compte à rebours de vitesse / 256, toujours 0, au lieu de 256 / vitesse. `0x63E5D`, comme
`0x349EB`, ne vérifie jamais que l'agent qui longe un obstacle retrouve sa case de reprise : dévié du
trajet de l'éclaireur — la formation (`0x53F13`) change sa vitesse au milieu d'une case, sans refaire
son décompte ; les toilettes ; la grève, qui passe par `0x349EB` avec les drapeaux et la case laissés
par la tournée —, il fait sans fin le tour d'un autre pâté (corrigé en option : demandes.md, retour
59). **Non établi** :
les images d'herbe 0, 1, 2 (l'herbe plus ou moins haute, vraisemblablement) et le bit 3 de l'octet
+3 d'une case d'herbe ; les octets `+9` (durée du nettoyage) et `+0xA` (seuil de saleté) de la fiche
d'une installation ; les cases fixes (32, 56) et (32, 16) ; la figure `0xC3` + direction, la
tondeuse vraisemblablement. Les observations des compositeurs diffèrent sur le rôle exact des zones
16 et 17 en fin de tracé (lancer ou effacer) : le code de `0x64387` fait foi.

### 10.14 Les voyous et le gardien

Réécrits dans `moteur/jeu/voyous.js` (16 fonctions, avec la fuite de l'amuseur `0x35652` et le renvoi
`0x325DA` ; l'écran du bus, longtemps rangé ici, est dans `carte-du-parc.js`, § 11.18).
**La venue** (`economie.js`) : une fois par an au plus (12 000 pas après le tirage précédent, daté
en `+0x690` des comptes même s'il ne vient personne), passé la quatrième année, hors du niveau 0,
tant que le parc a moins de 4 voyous (`+0x52`), un tirage modulo 512 contre un seuil borné de 32 à
256 : réputation (`+0x21`) − `+0xDA` − voyous présents − installations / 8 − cases de lac (`+0x7E`)
+ usure moyenne / 8 + prix d'entrée / 32 ; puis jusqu'à 15 chances sur 1 024 d'un voyou de plus.
Dans `DEMO.GY`, `+0x690` vaut 60 160 et le tirage tombe au pas 72 192, juste après la fin d'année ;
qu'il réussisse dépend de l'instant exact des changements de vitesse, qui décalent les passages de
`0x21681` par rapport au calendrier.

**Le voyou** (type `0x1A`, états 1 à `0xA` dans la table `0x22156`) naît par `0x4C592(genre 0 à 3)`
en (63, 61) sur la route, tourné vers l'ouest, vitesse 16 :

| État | Routine | Le voyou… |
|---|---|---|
| 1 | `0x4C696` | suit la route ; en colonne 0, il quitte la carte ; un sol `0x88` voisin le fait passer en 2 |
| 2 | `0x4C864` | passe le portique, puis prend la première allée voisine (3) |
| 3 | `0x4C9DD` | rôde : fait fuir un amuseur, va à une boutique, longe une file, vole, ou sort des allées |
| 4 | `0x4D1CA` | longe la file jusqu'à l'entrée d'une attraction usée à moins de 40 |
| 5 | `0x4D644` | use l'attraction d'un cran par pas jusqu'à 40 |
| 6 | `0x4D69C` | cherche un chemin hors des allées (masque `0x39CD`) |
| 7 | `0x4DA0C` | relâché par le gardien, se tourne vers l'ouest et reprend la route (1) |
| 8 | `0x4D88D` | arrêté, suit la case de son gardien (`+0x61`) |
| 9 | `0x4DAD1` | aller-retour à une boutique (case en `+0x49`), niveau BUSINESS seulement : elle perd les trois quarts de son stock |
| `0xA` | `0x4DD81` | regarde fuir l'amuseur, 200 pas |

**Le vol** : le visiteur perd un quart de son argent (`+0x6F`) ; s'il portait un achat (`+0x52`), il
le perd, passe en émotion 0x1A, perd 100 à 163 de contentement, et le bruitage `0x2F` est joué.
**L'amuseur effrayé** passe à l'état 0x3F (`0x35652`, réécrit dans `voyous.js`) : 2 000 pas,
puis le renvoi (`0x325DA`). **L'arrestation** : seul un voyou marqué d'un méfait (bit 2 de `+5`) peut
être arrêté. Le gardien marche vers sa case visée (état 0x36, `0x3455A`) et y arrête le voyou
(`0x3436C`), qu'il chaîne par `+0x1E` ; l'état 0x38 (`0x34728`) ne dure qu'un pas : il relâche sa
chaîne (état 7) sur le premier sol « interdit » (masque `0x39C5`) voisin, puis revient en 0x36 et
0x34, vers sa case de patrouille. `0x1C90B` dessine le voyou à sa position fine, dans les deux
résolutions ; ses images, 5 mots par genre, en `0xB537A`. Observé : embaucher du personnel avant
l'année 6 fait disparaître les voyous ; l'embaucher après leur arrivée les garde.

**Anomalies reproduites.** `0x34728` lit l'image du voyou relâché à l'octet `+0x59` du gardien (son
métier, 8), hors de la table des quatre genres. Dans `0x4C9DD`, les sorties de la case tirée sont
lues dans `0xB4990` à l'index des drapeaux du sol au lieu de sa forme (pour une allée, toujours
l'octet `0xB4992`), et le rang de la sortie vaut hasard **et** nombre de sorties, ramené à la moitié
s'il dépasse ; après avoir fait fuir un amuseur (état `0xA`), l'examen continue, et une boutique ou
une file trouvée ensuite change aussitôt l'état. `0x4D1CA` tourne le voyou, devant une attraction
usée, par la direction de la sortie d'où il vient : dos à l'attraction. Le bit 2 de `+5` sert aussi,
à l'état 4, de « vient d'arriver sur la case » et y est effacé : un voyou qui longe une file peut
perdre sa marque de méfait. **Non établi** : le sol `0x88` (le portique d'entrée, vraisemblablement,
et l'arrêt du bus, § 10.6) ; le masque `0xBF` appliqué à l'octet `+5` du visiteur volé ; `0x18ADF` ;
la catégorie 3 du livre au renvoi ; `+0xDA` du parc.

### 10.15 Les négociations et la grève

Réécrites dans `moteur/jeu/negociations.js` (6 fonctions). **Leur venue** (`economie.js`) : une
négociation ratée revient un mois après la séance (`[0xD3BB0]` le personnel, `[0xD3BAC]` les
fournisseurs) et bloque toute autre ; sinon, passé la troisième année, hors des écrans `0x32` et
`0x4C`, au plus tôt deux ans après une séance du même genre et un an après l'autre, le personnel
(s'il y a des employés) avec une chance sur 2 048 de 8 × renvois + employés + 8 × réputation +
2 × `[0xD668C]` + capacité du bus / 8, ou les fournisseurs (s'il y a des buvettes) avec 8 × buvettes
+ 8 × réputation + 2 × `[0xD668C]` + capacité de l'entrepôt / 32. `F8` et `8` les ouvrent aux
tricheurs (§ 7).

**L'écran** (`0x44EA5(2)` le personnel, écran `0x32` ; `(4)` les fournisseurs, écran `0x4C` ; fond
`data/mneg-0.dat`, palette `MNGPAL-0`) a sa propre boucle et ne change pas `0xD6652`. On y marchande
en dixièmes de point de pourcentage. Le plancher `[0xD77F8]` vaut −150 à la première séance, puis
25 × séances − 75, au plus 0 ; le plafond `[0xD7800]` = plancher + 500 ; la demande de départ
`[0xD7804]` est le plafond. Bouton gauche tenu, l'offre `[0xD77FC]` bouge de 2 par image selon le côté
de la main du joueur, sans dépasser la demande. Le temps est un gâteau de 10 parts de 62 images
(620 images, une vingtaine de secondes) ; la musique accélère : tempo = (620 − temps) / 8 + 60.
Après l'issue, on sort par un clic ou au bout de 1 000 images sans bouger la souris.
`0x11601` y copie un rectangle du fond vers la surface (coordonnées en 640, divisées par 2 en
320x200).

**La réponse de l'adversaire** (`0x46F27`), à chaque part, en 128es de l'écart de départ : 10 à 17
au hasard ; + 2 × geste − 14, le geste borné à 5 ; − obstination / 2, l'obstination
(`[0xD7808]`, 0 à 8) montant quand le joueur baisse son offre ; + écart restant / 32 ;
+ (6 − parts) / 2 dans les cinq dernières parts ; selon l'indice (`+0xCA` salaires, `+0xE5` prix,
100 au départ) − (100 − indice) / 16 − 1 en dessous de 100, + (indice − 100) / 64 au-dessus, au plus
4 ; − 2 + séances / 2 ; + 4 si l'offre dépasse plancher + 400.

**L'accord** multiplie les prix touchés par (1 000 + offre) / 1 000 : côté personnel, les salaires du
catalogue des métiers, l'indice `+0xCA` et les minimums des comptes (`+0x617` mécanicien, `+0x615`
agent d'entretien, `+0x613` le plus bas des amuseurs) — le message donne les nouveaux salaires
(mécaniciens 300, nettoyeurs 120, artistes 36) ; côté fournisseurs, les marchandises, le coût et le
prix des boutiques, l'indice `+0xE5`. Il remet à zéro les séances ratées et finit la grève : les
grévistes passent en 0x3E. **L'échec** incrémente les séances ratées (`+0x682` ou `+0x683` des
comptes) et note la date : « LIVRAISONS SUSPENDUES » chez les fournisseurs (l'entrepôt refuse alors
de commander, sauf par l'anomalie du § 11.12), « PAS TROUVÉ D'ACCORD AVEC LE SYNDICAT » chez le
personnel, qui **se met en grève** : `+0x681` levé, et chaque employé qui n'y est pas déjà et n'a pas
le bit 3 de `+5` note sa case en `+0x4D` et passe à l'état 0x3A.

| État | Routine | Le gréviste… |
|---|---|---|
| 0x3A | `0x3502B` | marche vers l'entrée du parc ; arrivé, il manifeste |
| 0x3C | `0x35208` | va et vient sur la rangée de l'entrée, entre −8 et +7 colonnes, pancarte |
| 0x3E | `0x3542D` | retourne à sa case `+0x4D`, puis reprend son état d'embauche, patience et compte à 400 |

Appelées par `0x21681`, ces routines ouvrent le cadre de l'original pour laisser en `[ebp-8]` son
abscisse (0x3A, 0x3E) ou son ordonnée (0x3C) visée, moitié basse seulement (§ 10.1). En pratique,
les fournisseurs n'ont pas pu être amenés à l'accord : la main du joueur plafonne à 31 %, leur prix
n'est jamais descendu sous 32 % ; en 640x480, le même glissé ne mène la main qu'à 9,6 %, et le
message d'échec ignore le clic et s'efface seul au bout d'environ 40 s.

**Anomalies reproduites.** `0x46F27` prend le geste en valeur absolue avant de le borner à −2 :
cette borne et la branche « geste ≥ 8 » sont mortes ; `[0xD77D0]` est calculé, jamais relu.
L'obstination n'est remise à zéro nulle part : elle passe d'une négociation à l'autre. `0x44EA5`
écrit le pourcentage par « %d.%d%% » avec la valeur absolue du reste (entre −0,9 % et −0,1 %, le
signe se perd), rejoue les bruitages de l'accord à chaque image tant que la main de l'adversaire
n'a pas rejoint la demande, prend les mêmes fonds et le même pointeur pour les deux genres, et
garderait le plancher précédent pour un genre autre que 2 ou 4. `0x11601` ne borne x et y que par le
haut, saute d'une ligne à l'autre de largeur écran − largeur alors que la copie avance d'une largeur
arrondie au multiple de 4 inférieur, copie 2³² lignes pour une hauteur nulle ou négative, et ne
divise que la moitié basse de la largeur en 320x200. **Non établi** : `[0xD77D0]`, `[0xD77E0]` ; le
bit 3 de `+5`, qui exempte de la grève ; le genre de boutique 8 (`+0x25`), dont les prix ne suivent
pas la hausse ; les images `+0x72` et `+0x78` du pointeur ; `[0xD668C]`, un facteur de l'année.

### 10.16 Les explosions

Réécrites dans `moteur/jeu/monorail.js`. Au-delà du double du seuil d'usure, l'attraction explose
(`0x6662D`) : bruitage, voie et trains ôtés, passagers projetés (`0x66189`, direction au hasard de
1 à 3), et la fiche du parc compte une attraction retirée de plus (`+0x9F`). Selon le rang du genre :

- **PLANE FLYER** passe au mode 0x26 (`0x66AFD`) : le compteur `+0xB1` monte de 2 à 200, puis
  l'attraction explose pour de bon ;
- **BOUNCY CASTLE** (CHÂTEAU MOU, seuil 40) passe au mode 0x24 (`0x66976`) : place d'origine gardée
  en `+0xE` et `+0x10`, élan `+0x65` de 10 à 19 au départ, décroissant d'un par pas ; le château
  dérive et monte, et retombe quand `+0x5F` dépasse `0xFDE8` : remis à sa place, démoli (`0x31748`),
  emprise jonchée de débris ;
- **les autres** : le nuage (`0x664F1` : un objet de type 2 à l'état 0x48, figure `0x24B`, que
  `0x665AE` anime, compteur `+0x5F` montant à 4 puis redescendant, avant `0x28752`), la démolition
  (`0x31748`, § 10.3) et les débris : sol `0x28` sur environ un quart des 22 cases de l'emprise,
  réservées (bit 8 de l'octet +3).

**La musique désaccordée** (`0x66BA0`) d'une attraction usée : la courbure `[0xD7BE6]`, `0x2000` au
centre, change de 500 tous les 50 appels, le sens s'inversant à `0x2EE0` et `0x1F4` (messages MIDI
`0xE1` à `0xE3`, par `0x87202`). Sans carte son, la fonction sort dès le début ; `horza-objets` rejoué
avec `--son --empoisonner` est IDENTIQUE, et une faute volontaire placée après la sortie anticipée
y est détectée à 250 s. **Restes de pile** : `0x665AE`, `0x66976` et `0x66AFD` laissent 24 octets sous
leur entrée ce qu'y laissait l'original (l'adresse de retour `0x66625`, la coordonnée x, l'argument
empilé pour `0x6662D`). **Anomalie reproduite** : l'index de case des débris (`0x6662D`, `0x66976`)
est un mot signé, sans contrôle des bords de la carte.

### 10.17 Le monorail

Réécrit dans `moteur/jeu/monorail.js`. La gare pose cinq rails, bouts de forme 8 à gauche et 7 à
droite ; on prolonge depuis la case voisine d'un bout, et seule une boucle fermée permet d'ouvrir.
`0x44439` suit la voie dans les deux sens depuis la gare et chaîne les gares trouvées : `+0xC0` la
première, `+0xC2` la suivante, `+0xC4` les courbes parcourues pour l'atteindre ; circuit bouclé, la
capacité de la première gare vaut le nombre de morceaux / 20 ; elle rend le prix des morceaux neufs
— `0xB5302[hauteur]` + fiche `+0xBA`, compté seulement si la hauteur (`+0x79`) ou l'octet `+0x44`
ont changé depuis le dernier paiement (`+0xBE`, `+0xBD`) —, ou −(prix + 1) si la voie ne boucle pas.
`0x447E3` ouvre : le prix au livre (catégorie `0x17`), puis chaque gare avec capacité / gares + 2
wagons (`0x41936`). `0x448BA` ferme : pour chaque gare, les passagers descendent, les wagons sont
effacés, la file renvoyée, la gare fermée.

**La gare** (`0x44208`, mode 6) : en phase 4, un passager descend tous les 8 passages ; au repos, la
tête de file monte, le prix de construction est payé un mois après, et la phase 1 passe en marche.
**Le wagon** (`0x43BAA`, état 0x22 des véhicules) avance, tourne aux courbes, pousse le wagon arrêté
à quai devant lui ; à une gare, il s'arrête (état 8) et la gare passe en phase 4 ; faute de rail, il
tombe (état 0x20, § 10.6) et projette son passager. `0x407FD` (réécrit dans `ecrans-gestion.js`),
dans le catalogue d'achat des attractions, n'allume le bouton 2 que si le genre a une voie (fiche `+0xB4` ≠ −1).

**Anomalies reproduites.** `0x44439` compare la « première gare » avant de l'avoir écrite
(`[ebp-0x34]`, relue sur la pile d'origine) : un circuit bouclé sans gare peut fixer la capacité de
l'objet que désigne ce reste. `0x448BA` ne contrôle pas le train d'une gare : une gare sans train
(`+0x45` nul) fait effacer l'objet 0, la sentinelle de la table. Dans `0x43BAA`, un wagon qui tombe
voit sa vitesse augmenter de (abscisse de la souris & 3) + (pas de simulation & 3) (§ 10.9), et la
recherche d'un wagon devant compare le résultat à 0 et non à l'adresse de la table des objets ;
son `[ebp-8]` est laissé sous l'entrée comme l'original. **Non établi** : l'octet `+0x44` d'un
morceau de voie (la forme dessinée, § 11.15, qui entre ici dans le prix) ; le mot `+0x2A` d'une
gare ; la table `0xB4A0A` des images des passagers au-delà du premier mot ; `0x44BB8`.

**Établis par `monorail-visiteurs`** (septième vague) : les passagers montent (`0x30C65`, depuis la
gare) et descendent (`0x449FF`) ; le seuil d'usure du monorail est 200, il explose donc au-delà de
400 d'usure — `0x30C65` appelle `0x31ED3`, le monorail peut exploser. La démolition de la gare passe
par `0x31668` puis `0x448BA`, qui ferme toutes les gares et efface les wagons, et `0x44BB8` ôte ses
rails. `0x30C65`, désormais atteinte, attend encore en `enAttente` (`attractions.js`) d'être
installée et prouvée.

---

## 11. L'interface du parc

Réécrite dans `moteur/jeu/boucle.js` (le clavier, les menus, les catalogues, les fondus, la pluie,
la démonstration), `moteur/jeu/interface-parc.js` (les zones de l'écran, § 6.7),
`moteur/jeu/fenetres.js` et `moteur/jeu/ecrans-achat.js` (les fenêtres et les écrans),
`moteur/jeu/panneau.js` (la barre des messages et les catalogues), `moteur/jeu/titre.js` et
`moteur/jeu/divers.js` (l'écran titre, la fiche du joueur, la carte du monde, la saisie d'un nom),
`moteur/jeu/construire.js` et `moteur/jeu/evenements.js` (poser un objet, la file des événements,
les sauvegardes et l'amorçage), `moteur/jeu/ecrans-gestion.js` (les commandes des écrans, le
graphique des comptes, l'entrée et la sortie des attractions) et `moteur/jeu/ecran-parc.js` (le
panneau de commande). La cinquième vague y a ajouté `moteur/jeu/amorcage.js` (la boucle du parc,
les ressources, le texte, § 11.9 et § 11.16), `moteur/jeu/menus.js` (les menus déroulés et l'écran
des recherches, § 11.10), `moteur/jeu/ecrans-infos.js` (le tutoriel, § 11.11),
`moteur/jeu/dialogues.js` (la question oui/non, l'entrepôt, les enchères, § 11.12 et § 11.13),
`moteur/jeu/catalogues.js` (les catalogues surgissants et les feux d'artifice, § 11.3 et § 11.14),
`moteur/jeu/voies.js` et `moteur/jeu/poses.js` (les voies, les wagons, le défilement pendant un
tracé, l'écran de la bourse, § 11.13 et § 11.15). La sixième vague y a ajouté `moteur/jeu/outils.js`
(les outils de pose, § 11.17), `moteur/jeu/carte-du-parc.js` (la carte du parc, le relevé bancaire,
« démolir ? », § 11.18), `moteur/jeu/nouveautes.js` (§ 11.19), `moteur/jeu/faillite.js` (la fin de
partie, § 11.20) et `moteur/jeu/sortie.js` (la sortie du programme, § 11.21). La souris est au § 6.7.

### 11.1 Le clavier du parc et la triche

Réécrits dans `moteur/jeu/boucle.js`. `0x13BF3` reçoit la touche de l'image et ses modificateurs
(`[0xDE689]` : 1 Maj, 2 Ctrl, 4 Alt) ; la barre de menus du jeu donne à chaque commande son nom.

| Touche | Nom dans les menus | Effet |
|---|---|---|
| flèches | — | la caméra d'une case, puis le recadrage `0x184DF` |
| Origine, Page haut, Fin, Page bas | — | la caméra d'une case, bornée, sans recadrage |
| `F` | PARC ▸ FEUX D'ARTIFICE | bascule l'octet `+0x77` de la fiche du parc ; tant qu'il est levé, la boucle fait avancer le tir (`0x6D508`) et le pas de simulation le fait payer |
| `O` | PARC ▸ PARC OUVERT | ouvre ou ferme le parc (`+0x18`) ; à l'ouverture, la musique 0x13 démarre |
| `Alt+Échap` | PARC ▸ QUITTER | sauve `save/<nom>.gy`, puis retour au menu |
| `Alt+S`, `Alt+L` | PARC ▸ SAUVER, CHARGER ▸ JEU 00 | événements `0x26` et `0x28` (§ 11.5) : `0x2DF12(0)`, `0x2E035(0)` ; aucun scénario ne les exerce |
| `R` | AFFICHAGE ▸ CHANGEMENT DE RESOLUTION | 320x200 ↔ 640x480 |
| `F5`, `F6`, `F7` | AFFICHAGE ▸ LISTE DES BOUTIQUES, DES ATTRACTIONS, DU PERSONNEL | fenêtres `0xF`, `0xE`, `0x10` |
| `N`, `M` | DEPARTEMENT DES RECHERCHES, CARTE DU MONDE | écran `0x4E` (`0x515A0`, § 11.10) ; `0x560D2`, qui a sa propre boucle |
| `Maj+S`, `Ctrl+S` | GESTION DES STOCKS, BOURSE | écrans `0x52` (`0x798D7`, § 11.12) et `0x44` (`0x4B11E`, § 11.13) |
| `Maj+T` | AFFICHAGE ▸ RENDRE TOUT PETIT | la vue réduite |
| `/`, `Maj+B` | OPTIONS ▸ CONSEILLER, ACHAT BUS AUTO | deux réglages |
| `S` | OPTIONS ▸ EFFETS SONORES + MUSIQUE | bascule les deux, s'il y a une carte son |
| `F3`, `F4` | (OPTIONS ▸ VITESSE) | vitesse −1, +1, sans borne |
| `P`, `Échap` | — | la pause ; reprendre l'outil question |
| `[`, `]` | — | le volume de la musique, par pas de 4 |

**La vitesse du jeu** : les quatre crans du menu valent −2 (lent), 0 (normal), 1 (rapide) et 20
(ultra-rapide) ; `F3` et `F4` font ±1 sans borne ni coche. Des deux blocs de cadence de la boucle,
le second exige `[0xD7792]` = 1, qui vaut 0 sans l'option `-m`, et ne tourne donc pas en jeu normal ;
le premier fait alors avancer la simulation même quand un écran est ouvert (§ 5.3 ; **correction** :
on écrivait que le second exigeait une partie en réseau).

**La barre de menus** (`0x4FD85`, `0x50651`) s'ouvre par un clic dans la bande du haut et se referme
au clic suivant (`0x4FCC5` l'ouvre, sauf en pause, et met l'outil en main de côté ; `0x4FD2D` la
referme, rend l'outil et ôte la pause). Trois menus — PARC, OPTIONS, AFFICHAGE — dont chaque ligne
porte soit une touche à simuler, soit une fonction et son argument, exécutée en fin d'image
(§ 11.10). **Les catalogues surgissants**
(`0x6B9CB`) s'ouvrent au clic droit sur une icône de la barre d'outils : le survol montre le nom de
l'article, le clic gauche le prend en main, le clic droit ouvre sa fiche.

**Les fondus et la météo.** `0x4820D` éteint l'écran (64 pas de 4 au changement de résolution, 32
pas de 8 à l'arrivée dans le parc), `0x48296` le rallume, et `0x1A706` mène le fondu image par
image. La météo `[0xB14CC]`, posée par le pas de simulation, donne la pluie (bit 0 : 180 gouttes par
image, `0x47606`), l'orage (bit 2 : un éclair toutes les 0 à 49 images, trois images de foudre et de
tonnerre, la palette ramenée entre-temps à 106/256) et, au bit 1, 360 flocons que `0x4790C` sème
au lancement d'une partie (7 octets chacun en `0xD2BB0`) et que `0x47A27` fait tomber : la neige
(§ 11.19). **Anomalie reproduite** dans `0x4790C` : le tirage modulo 300 est rangé dans un
octet (256 à 299 deviennent 0 à 43), et un quatrième tirage est fait puis jeté.

**La démonstration** (`0x5B5D0`) recharge `save/DEMO.GY` à la deuxième image, saute à onze points de
vue toutes les 500 images, et s'arrête à la 6 000ᵉ ou au moindre geste.

### 11.2 Les fenêtres et les écrans

Réécrits dans `moteur/jeu/fenetres.js` (la machinerie et le dessin) et `moteur/jeu/ecrans-achat.js`
(les écrans eux-mêmes).

**Une fenêtre est une liste de morceaux, chacun une liste d'ordres.** La table `0xB762D`, 21 octets
par fenêtre, en décrit 27 : jusqu'à dix numéros de morceaux, l'écran qu'elle occupe (`0xD6652`), sa
palette, et une routine appelée après le dessin. Les morceaux vivent dans `0xB67C4`, 11 octets par
ordre : un code, un rectangle, un paramètre. Vingt-trois codes suffisent à tout : aplats,
rectangles, textes à gauche ou centrés, images, pavages, icônes, panneaux en creux ou en saillie,
cadres biseautés, jauges, la vue du parc autour de l'objet désigné, les boutons.

`0x35F21` ouvre une fenêtre en **échangeant la surface de dessin contre le tampon de fond** : le
décor est peint une fois dans le fond, que la restauration par blocs remet à chaque image, et
seuls les boutons et les valeurs sont retracés ensuite (`0x3D72B`). Les zones cliquables sont
inscrites pendant ce dessin, dans `0xCE898` ; chaque bouton a ses deux images, au repos et enfoncé,
et une commande, dont la fiche dit la touche de clavier équivalente et la façon de réagir — au
relâchement, ou en se répétant tant qu'on tient le bouton.

**Le jeu a deux polices.** La petite, de 3×6 pixels (§ 6.8), pour les enseignes des kiosques ; et
celle de l'interface, faite d'images d'une banque à part, dont la table ne connaît que 45 signes —
les chiffres, les majuscules, et `% ' - : . , ( ) /`. Les minuscules y sont renvoyées sur les
majuscules, tout le reste sur l'image vide. La hauteur d'une ligne est celle du W. C'est cette
police que trace `0x11BD5`, la fonction la plus appelée du jeu (§ 6.5) : chaque signe est une
silhouette d'une seule couleur.

**Les deux résolutions.** Un octet, `0xD778A`, vaut 2 en 320x200 et 1 en 640x480 : c'est l'unité de
l'interface — l'épaisseur d'un trait, le pas d'un biseau, la marge d'un cadre, dits dans l'espace
logique. Les rectangles des tables sont écrits une fois pour toutes pour 640x400, si bien qu'**une
même fenêtre sert aux deux modes, à la même taille apparente** ; seuls les pavages de fond
descendent jusqu'à 480 pour couvrir l'écran plus haut de la haute résolution.

**Les écrans** sont ouverts par la barre d'outils du parc, par les touches, ou par le clic sur un
objet puis sur le bouton de fiche. La boucle du parc appelle à chaque image la routine du genre
d'écran en cours :

| Écran | Ce qu'il montre |
|---|---|
| achat | cinq cases, l'article choisi au milieu, sa description et ses chiffres ; un fond plein sur ceux qu'on ne peut pas payer |
| fiche | l'objet choisi et ses valeurs : le prix, la fréquentation, la capacité, la fiabilité d'une attraction ; les marchandises, les prix d'achat et de vente d'une boutique ; le temps de travail et le salaire d'un employé |
| liste | 24 lignes tirées d'une table, la ligne choisie tenue au milieu et encadrée |
| pensées | 40 bulles qui entrent par le côté, attendent, pensent, et repartent ; en bas, la signification des pensées |
| finances | l'inflation et le taux du pays, le graphique des comptes, le solde, la valeur du parc, le prêt et le prix des billets |

**La case du nom** d'une fiche ouvre une saisie modale (`0x3854C`, qui appelle `0x793B1`, § 11.4),
qui tourne hors de la boucle du parc. Le nom
validé va dans la fiche du **catalogue**, pas dans l'objet : renommer un employé renomme son métier,
une boutique sa fiche, une attraction son genre — tous ceux du même genre changent de nom d'un coup.

**Quelques rouages, réécrits depuis.** `0x36001` inscrit une zone cliquable dans `0xCE898` ;
`0x407A0` l'allume ou l'éteint (octet +9). La routine appelée après le dessin (le champ +0x11 de la
fenêtre) est `0x3671D` pour les fenêtres `0xE` à `0x10` — la liste des attractions, des boutiques ou
des employés, dressée en `0xD382C` — et `0x36A2B` pour la fenêtre 12, qui écrit le genre d'une
boutique. `0x40BBC` écrit un texte coupé aux espaces dans un cadre, centré si le bit 0 est levé.
**Anomalies reproduites** : dans `0x40BBC`, le dernier espace n'est pas remis à zéro d'une ligne à
l'autre, et le premier signe d'une ligne n'est pas compté dans sa largeur ; dans `0x3671D`, pour une
autre fenêtre le genre cherché serait un reste de pile (non atteint), le mot +4 d'une ligne de
boutique est écrit deux fois, et la part d'un employé est une division 32 bits dont seul l'octet bas
est gardé, avec une division par zéro possible. Non établi : le sens des mots des lignes
« attraction » et « employé » de `0xD382C`.

### 11.3 La barre des messages et les catalogues

Réécrites dans `moteur/jeu/panneau.js`.

**La barre des messages** (`0x5CBDB`), appelée à chaque image, montre soit l'infobulle du moment,
soit une remarque du conseiller. La table `0xBA144` décrit 34 remarques possibles, examinées dans
l'ordre : le parc fermé, le manque de boutiques, l'humeur des visiteurs, les files, les visiteurs
perdus, un concurrent qui achète vos actions… **Les infobulles ne viennent qu'en onzième** : dix
remarques passent avant elles. Chaque entrée porte sa durée (500 pas, 430 pour une infobulle), le
nombre de fois qu'elle a déjà été montrée et la date de la dernière : une remarque déjà vue fait
taire le conseiller un moment — 256 pas après un premier affichage, 512 après deux. La touche `/`,
le CONSEILLER du menu, coupe toute la barre, infobulles comprises. Il est coupé dans le parc de la
démonstration.

**Le quatrième reste de pile.** Sur le chemin de la remarque expirée — le CONSEILLER allumé —,
`0x5CBDB` lit sa variable `[ebp-0x18]` sans l'avoir écrite : appelée par la boucle du parc (retour
`0x11E98`, entrée E), elle tombe en E − 40, dont seuls les deux octets bas comptent. La boucle appelle
de la même hauteur la vue (`0x13B9A`), la barre de menus (`0x50651`) et la barre d'outils (`0x4DE1A`,
un argument) ; le mot y est, dans l'ordre, l'`ebx` que `0x1B837` sauve en entrant (chargé par
`0x13B9A` de la hauteur d'une rangée, `movzx ebx, [0xD6654]` : 0x20 en 320x200), puis, barre de
menus ouverte, l'octet bas du retour du trait (`0x949BC` ou `0x949DA`, sa `[ebp-0x18]`, 0), puis,
quand la barre d'outils se repeint, sa `[ebp-0x14]`, pointeur vers sa `[ebp-0x10]` (320x200) ou
`[ebp-0x18]` (640x480). Autre valeur, autre remarque : la bulle affiche un autre texte. Les quatre
réécritures ouvrent le cadre de l'original (`moteur/jeu/cadre.js`) ; le détail est dans le guide de
réécriture et le journal des essais, § 5.6. Scénario : `conseiller` (66 s).

Les chiffres viennent des comptes du parc : l'attrait du prix d'entrée découpe onze paliers
d'humeur, de « ils partent en courant » à « ils adorent » ; s'y ajoutent les visiteurs des files,
les partants, les égarés, ceux qui n'ont pas de chemin, les recettes et les dépenses. L'infobulle
qui nomme l'objet désigné a un texte par type ; sur un type inattendu, elle réaffiche le tampon tel
quel, et la barre répète son dernier message.

**Le dessin** (`0x5E2C5`) : la bande se redessine à chaque image juste au-dessus de la barre
d'outils — un texte vide l'efface —, puis une bulle s'étire en bas de l'écran, large de la longueur
du texte plus huit caractères, et le texte y est coupé au dernier espace, ligne par ligne.

**Les catalogues surgissants** (`0x6BF89`), ceux qu'ouvre un clic droit sur une icône de la barre
d'outils, sont une liste chaînée de fenêtres de 0x24F octets. Chacune garde ses articles — nom,
image, prix, nombre possédé —, la case désignée, et un format choisi dans une table de quinze
dispositions, de 1×1 à 10×10, selon le nombre d'articles. Déployé, il montre chaque article avec son
prix et ce qu'on en possède ; l'article survolé est mis en valeur et donne son nom à la barre de
titre. **Correction** : le format 0 n'est pas un catalogue « replié », c'est celui d'un catalogue
sans aucun article disponible (ci-dessous).

**Les catalogues, réécrits** dans `moteur/jeu/catalogues.js`. Cinq catalogues, un par sorte
d'article, le numéro du catalogue étant celui de la sorte : 0 les chemins (table `0xD37DC`, fiches de
11 octets), 1 les attractions (`0xCCEF2`, 0xC8), 2 les boutiques (`0xD3C84`, 0x6B), 3 les arbres et
décors (`0xCCA92`, 0x38), 4 le personnel (`0xD35E2`, 0x36). **La fiche**, 0x24F octets depuis
`0xD6BCE` : +0 et +2 le coin, +4 et +6 la taille ; +9 l'état (2 fermé, 4 ouvert, 6 bouton de
fermeture enfoncé, 8 tiré par une barre, `0xA` tiré par le coin, `0xC` bouton de droite, `0x10`
bouton du milieu) ; à partir de +0xA, les articles de 13 octets (+0 le nom, +2 l'image, +4 le prix
en mot long, +8 l'outil qu'il donne, +0xA son rang dans la table, +0xB « trop cher », +0xC un octet
de sa fiche, non établi — le « nombre possédé », peut-être : +0xA5 pour une attraction, +0x46
boutique, +0x15 décor, +0x11 personnel, +0xA chemin) ; +0x212 et +0x214 le pas de la grille ; +0x216
le format ; +0x217 l'écran de fiche qu'ouvre le clic droit ; +0x219 où le clic écrit le rang de
l'article ; +0x21D et +0x21F la prise du pointeur ; +0x221 le titre ; +0x249 et +0x24B les
catalogues derrière et devant (−1 : aucun) ; +0x24D ce que désigne le pointeur, un article (≥ 0),
ou −1 fermer, −2 la barre de titre, −3 le bouton de droite, −4 la barre du bas, −5 le coin, −7 le
bouton du milieu, −6 rien. Les catalogues ouverts forment une liste doublement chaînée : `0xB14B9`
celui de devant, que la souris essaie en premier (`0x6B9CB`), `0xB14BB` celui du fond, dessiné en
premier (`0x6BF89`).

**Ouvrir, remplir, régler.** `0x6A85C` met le catalogue devant les autres, à l'état 4, le remplit et
le met en forme ; `0x6A912` le retire de la liste (état 2). `0x6CD44` y range les articles
disponibles de la sorte, marque ceux dont le prix dépasse le solde moins l'engagé, écrit le titre et
trie par prix croissant (`qsort` `0x811AA`, comparaison `0x6A83E` sur l'écart des prix) ; il rend
le nombre d'articles. `0x6BCDA` choisit le format dans `0xB5094` (3 octets : maximum, colonnes,
lignes) — 1 (1×1), 2, 3, 4 (4×1), 6 (3×2), 9, 12 (4×3), 15, 16 (4×4), 20, 25, 30 (6×5), 36, 64,
100 (10×10), puis 0 —, **le premier dont le maximum dépasse strictement le nombre d'articles** : le
format 0 est donc celui d'un catalogue vide. Il efface les cases en trop, calcule le pas et la
taille, et ramène la fenêtre dans l'écran. **La souris** (`0x6AE91`) : on déplace la fenêtre par la
barre de titre ou la barre du bas, on la redimensionne par le coin, le pas borné de `0x46` à `0x140`
en largeur, de `0x20` à `0x100` en hauteur, toujours pair ; fermer est à gauche ; à droite, le
bouton du milieu agrandit à tout l'écran (`0x6AC07` : x = 0, y au haut de la vue, largeur 640) et le
bouton de droite réduit au pas minimal `0x46` × `0x20` en gardant le bord droit (`0x6ADDB`).
**La taille de la fenêtre** découle du pas : 8 pixels de bords en largeur, `0x28` en hauteur (la
barre de titre et celle du bas), des cases qui se chevauchent de deux pixels ; agrandie, la fenêtre
prend toute la largeur et toute la hauteur sous la barre de menus, puis le pas en est tiré, borné,
rendu pair, et la fenêtre retaillée sur la grille : elle ne remplit l'écran qu'aux arrondis près.
**Ramener devant** (`0x6AA49` : le clic droit sur l'outil d'un catalogue ouvert, `0x1788D`, et la
saisie de sa barre, `0x6AE91`) : le catalogue est retiré de la liste et remis en tête, ouvert, le
pointeur n'y désignant plus rien ; **celui qui est déjà devant passe au fond** — un second clic
droit sur l'outil renvoie son catalogue derrière les autres (`0x6AE91` ne l'appelle que pour un
catalogue qui n'est pas devant) ; seul ouvert, il ne bouge pas. Le numéro reçu, un mot non signé,
est comparé aux mots signés de la liste : un catalogue −1 ne serait jamais reconnu (il n'y en a
pas). Le catalogue des chemins n'a que trois articles, qui donnent les outils 2, 13 et 14 (§ 11.17).
`0x67182` trace un objet graphique en réduction, morceau par morceau ; `0x6A658` décale au démarrage
les tables d'images des sortes de visiteurs 1 à 7.

**Anomalies reproduites.** `0x6A912` reconnaît le cas « seul ouvert » à devant = fond, sans vérifier
que c'est le catalogue qu'on ferme ; c'est aussi le seul cas qui remet à zéro `0xB14BD` (le
catalogue sous le pointeur) et note le fermé en `0xB14C4`. `0x6CD44`, pour un numéro au-delà de 4,
rendrait un reste de pile (le jeu n'ouvre que 0 à 4). Dans `0x6AE91`, le bouton de droite enfoncé
s'éclaire quand le pointeur est sur celui du milieu, et un article trouvé n'arrête que le parcours
de sa ligne, avec un rang en retard d'un, sans effet visible (les cases se chevauchent de 2 pixels).
**Non établi** : l'octet +0xC d'un article, le mot `0xB14C4`, la table `0xB9D68` (8 lignes de 23
mots) et le sens exact du décalage de `0x6A658`.

### 11.4 L'écran titre, la fiche du joueur et la carte du monde

Réécrits dans `moteur/jeu/titre.js`, `moteur/jeu/divers.js` (la saisie d'un nom) et
`moteur/jeu/evenements.js` (l'écran titre, `0x1A836`, § 7). « NOUVEAU PROPRIETAIRE » (F1) ouvre deux
écrans qui tournent chacun dans leur propre boucle, hors de la boucle du parc.

**La saisie d'un nom** (`0x793B1`) dessine une image de sa boîte par appel ; l'appelant la rappelle
tant qu'elle rend 0 (1 : validé, −1 : annulé). Elle occupe le tiers central de l'écran (x de 160 à
480, y du tiers aux deux tiers de la hauteur logique, 400 ou 480) : un panneau en saillie, la
question centrée, le champ en creux (jaune `0xD7781`, brun `0xD7770`) et deux boutons (images 185
et 187 de la banque de l'interface). Deux appelants : l'écran titre et `0x3854C`, qui renomme une
fiche (§ 11.2). Le nom du joueur est reconnu à ce que la question est le texte `[[0xD7BC0]+0x18C]` :
il sert de nom de fichier, il est coupé à huit signes (le neuvième octet du tampon est remis à zéro
à chaque image) et n'accepte ni espace ni tabulation. Le clavier du champ (`0x3B496`) : retour
arrière, Entrée (qui pose `0xB14D8` = `0xFF`), Origine, Fin, les flèches, Suppr, et l'insertion des
lettres, chiffres et espaces jusqu'à seize signes, triés par la table de classes de la bibliothèque
C (`0xB0A5C`, indexée par le code **plus un**). Le champ (`0x3DA5E`) lit son rectangle aux décalages
+1, +3, +5, +7 ; si le texte jusqu'au curseur tient, il s'écrit de gauche à droite depuis x0 + 4,
sinon il défile, écrit de droite à gauche depuis x1 en partant du signe sous le curseur.

**INFORMATIONS JOUEUR** (`0x576FE`) : treize lignes décrites par la table `0xB9FA4`, `0x13` octets
par ligne (le texte de l'intitulé dans `[0xD7B80]`, ses abscisses, sa ligne, le numéro de zone,
des drapeaux — 1 une ligne à taper, 2 une liste de cases, 4 le bouton TERMINE —, le nombre de cases
et leurs images), la ligne choisie écrite en couleur (`0xD7773`). Les champs :

| Ligne | Variable | Valeurs |
|---|---|---|
| VOTRE NOM | `0xD6690` | texte tapé |
| SURNOM | `0xD66B0` | texte tapé : le nom des sauvegardes et du code de triche (§ 7) |
| AGE | `0xD66F3` | tapé, borné de 1 à 127 |
| SEXE | `0xD66F4` | HOMME, FEMME |
| NOM DU PARC | `0xD66D0` | texte |
| SIMULATION | `0xD66F1` | SIMPLE, SIM., GLOBALE ; TERMINE pose `0xD7761`, `0xD7759` ou `0xD775E` |
| VISITEURS | `0xD66F2` | HEUREUX, NORMAUX, RALEURS |
| NIVEAU DE DEPART | `0xD66F5` | l'argent de départ, table `0xB7F7C` : 200 000, 150 000, 100 000 |
| CONCURRENTS | `0xD66F0` | AUCUN, 4, 10, TOUS : table `0xB7F88`, 0, 4, 10, 25 (§ 10.11) |
| FORCE CONCURRENTS | `0xD66F6` | FAIBLES, MOYENS, FORTS |
| DEJA JOUE? | `0xD66F7` | OUI, NON ; NON met l'étape du tutoriel `0xBA0F8` à 0 (§ 11.11) |

Les flèches haut et bas et Entrée changent de ligne, gauche et droite de case ; un clic choisit une
ligne ou une case. Quitter la ligne SURNOM après l'avoir changée rappelle la vérification du code de
triche (`0x2EA62`), qui recharge aussi la fiche gardée sous ce surnom (§ 7). TERMINE (`0x220`–`0x250`
× `0x12C`–`0x14A`) pose le mode de simulation et, si le joueur n'a encore vendu aucun parc
(`0xD671C`), l'argent de départ, puis **écrit** la fiche dans `save/<surnom>.GD` (`0x2E9E8` ;
**correction** : on la disait relue, et `titre.js` nomme encore cet appel `RELIRE_LA_FICHE`).

**Le reste de pile de la fiche du joueur.** `0x576FE` lit sa variable `[ebp-0x14]`, la ligne
choisie, avant de l'avoir écrite (elle ne l'est qu'au premier clic ou à la première flèche). Son
prologue (trois `push`, puis `enter 0xE8`) met `ebp` à E − 16, E étant le pointeur de pile à
l'entrée : la variable tombe en E − 36, exactement là où la routine de texte `0x3F49E`, appelée
juste avant par l'écran titre avec cinq arguments, a sauvé son `ebp` — et, par un second chemin, 28
octets sous l'entrée du bruitage `0x80C80`, que l'écran titre joue en `0x1AD4A` (journal des
essais, § 5.6). La valeur relevée dans les parties est 31 : l'écran n'ayant que treize lignes,
aucune ne s'affiche comme choisie, et l'anomalie ne se voit pas. La réécriture rouvre le cadre
d'origine et lit l'octet en mémoire.

**La carte du monde** (`0x560D2`), avec sa propre boucle, montre le planisphère (`0x5606C`), un
repère par pays (`0x575A7`), le nom et le prix du terrain survolé, et le solde du joueur ; elle rend
le pays du joueur, ou −1 s'il n'en a pas choisi, et c'est ainsi que l'écran titre sait s'il faut
entrer dans le parc. La table des pays, `0xB7B38`, 24 fiches de `0x1C` octets :

| Champ | Contenu |
|---|---|
| `+0x00` | le numéro du pays ; son nom est `[[0xD7B70] + 4 × numéro]` |
| `+0x01` | le prix du terrain, en centaines de milliers : de 3 (ROYAUME UNI) à 25 (JAPON) |
| `+0x03`, `+0x05`, `+0x07` | les populations proche, lointaine et éloignée, en centaines de milliers |
| `+0x09`, `+0x0B` | l'inflation et le taux d'intérêt, en centièmes de pour cent |
| `+0x0D` | l'économie ; donne le champ `+0x3E` du parc, `0x1F4` + (2 − économie) × `0x3E8` |
| `+0x0E`, `+0x0F` | les années sans impôts ; les impôts locaux, en centièmes |
| `+0x11`, `+0x12` | le climat et le terrain, huit drapeaux chacun (aucun : AGREABLE, PRAIRIES) |
| `+0x14` à `+0x19` | la position et la taille du pays sur la carte |
| `+0x1A` | le joueur propriétaire, −1 libre |
| `+0x1B` | le « SPECIAL » du pays, un texte |

On ne voit le prix et on ne peut acheter que tant qu'on n'a pas de pays et que le prix ne dépasse
pas l'argent qui reste (`0xD6718`) ; six repères distinguent le propriétaire, un pays déjà vendu
(`0xD66F8`, un octet par pays) et ce que le joueur peut payer. Un clic ouvre la **fiche du pays**
(`0x56532`, table `0xB9EE0`, 16 lignes : population, inflation, impôts, climat, terrain, et le bouton
ACHETER), ou, si le pays est pris, la **fiche de son propriétaire** (`0x57193`, table `0xB9F57`, dix
lignes). `0x56E7E` écrit les nombres avec des virgules, en quatre modes. La fiche du propriétaire
attend le clic en relisant `0xDE5AC` en boucle, une attente active : la réécriture fait elle-même
avancer l'horloge de l'hôte à chaque tour, comme la transcription.

**L'écran titre est toujours en 320x200** (établi par le scénario `titre`, septième vague) :
`0x1171F` y bascule depuis le 640x480, et `0x11761` revient à la haute résolution au retour dans le
parc. Ses branches VESA sont donc mortes : la présentation en 5 banques, `0x1A9B5`, et `0x54ED6` et
`0x55507` dans `0x1AF83` et `0x1B513`. **La liste des emplacements** (`0x1AF83`, F2) : la ligne k
occupe y de 154 + 16k à 170 + 16k et n'est active que si `[0xD43F6 + k]` est levé ; un clic ou
Entrée charge (mode 0), puis pose `[0xD380C]` = 0 et `[0xD777F]` = `0xC` ; Échap sort ; un mode non
nul sauve, le mode 4 étant refusé si `[0xB14B0]` = 0. **Les remerciements** (`0x1B513`, F5) : 11
pages de 300 images chacune ; un clic saute une page, aucune touche ne sort. **La démonstration**,
après un écran titre ouvert depuis le 640x480, démarre à la 3 000ᵉ image puis s'arrête à l'image
suivante : `0x11761` replace vraisemblablement le pointeur au centre, ce qui compte comme un geste.

**Anomalies reproduites.** `0x56532` ne vide pas son tampon entre deux lignes : la ligne du bouton
de sortie réécrit hors de l'écran ce qu'a laissé la ligne ACHETER, comme le bilan de fin d'année ;
pour un pays à prix nul, elle écrit « TAILLE » et l'écrase aussitôt. En réseau (`0xD7792` > 1), la
ligne ACHETER apparaît avec son prix, mais le terrain n'est pas payé. `0x57193` passe l'octet bas du
numéro de parc à `0x4C50B`, qui attend un numéro de joueur. Dans la fiche du joueur, le refus d'une
touche se décide sur la ligne choisie au début du tour, et le champ n'est alors pas redessiné. Dans
la saisie, les deux tests de survol emploient les dimensions de l'image 185, y compris pour le bouton
de droite, dessiné aux dimensions de l'image 187 ; dans la branche qui défile, la largeur du curseur
est d'abord calculée sur une variable pas encore écrite (sans effet).

**Non établi** : l'octet `0xD66B8`, le champ `+0x3E` du parc, ce que
change le mode de simulation dans la suite du jeu, les octets `0xBA715` et `0xBA721` de la saisie.

### 11.5 Poser un objet : la demande et la file des événements

Réécrits dans `moteur/jeu/construire.js`, `moteur/jeu/evenements.js` et
`moteur/jeu/ecrans-gestion.js`.

**Les deux boutons.** `0x145FB` (§ 6.7) appelle `0x15FBD` à l'appui gauche et `0x1788D` à l'appui
droit, avec le numéro de la zone. Le bouton gauche (table de sauts `0x15FC6`, 27 entrées) donne un
outil, ouvre une fenêtre d'achat, règle l'objet choisi (zones 16 à 21), amène la vue sur l'employé
suivant d'un métier (zones 23 à 26), ou, dans la vue du parc (zone 29), **pose ce que le joueur
tient**. Le bouton droit ouvre le catalogue surgissant de l'outil — fermé (octet +9 = 2), par
`0x6A85C` ; ouvert, il est ramené devant par `0x6AA49` —, défait les réglages que fait le gauche, et
dans la vue du parc demande le retrait de ce qui est sous le pointeur.

**Ni l'un ni l'autre ne pose rien.** Ils écrivent une **demande** en `0xD441F` + 6 × joueur (+0 la
sorte, +1 la case, +3 un paramètre) — c'est-à-dire directement dans la case du joueur de la file des
événements ci-dessous (type en +1, valeurs en +2 et +4) — et oublient le double-clic en attente ;
`0x2CCF8` l'exécute en fin d'image. Le bouton gauche maintenu (`0x175B5`) poste de même les sortes de
ce qu'on trace en glissant, après avoir appelé `0x47268`, qui ne recopie ni n'exécute aucune
demande : elle fait défiler la vue quand on trace contre le bord de l'écran (§ 6.7, § 11.15).
Deux outils agissent sur place : 11, qui cherche où mettre l'entrée de l'attraction qu'on vient de
poser, et 17, la sortie ; après la pose de la sortie, `0x31D32` rend en main l'outil de la fiche du
genre (`+0xB5` : le circuit ou les rails) si aucune case voisine ne porte encore de sol de circuit
(drapeaux 4 et `0x1C`) ni de rail (6). L'outil 19 ne pose l'employé porté que sur un sol sans aucun
des drapeaux `0x39C5`.

**La file des événements** (`0x2CCF8`) : cinq cases de 6 octets en `0xD441E` (+0 le joueur, posé
par `0x1A2CA` ; +1 le type ; +2 et +4 deux valeurs) — le seul bloc de la file qui soit sauvegardé —,
et la copie de l'image précédente juste devant, en `0xD4400`. La boucle du parc les applique en fin
d'image pour les quatre joueurs à la fois : c'est par là qu'une partie en réseau aurait transmis ce
que chacun venait de faire, la plupart des effets ne valant que pour le joueur courant. L'aiguillage
est un `repne scasb` sur la table de 36 octets `0x2CD30` : un type inconnu ne fait rien. **Les
traînées** : pour les tracés, si l'image précédente portait le même type, la routine relie la case
précédente à la courante, le long des rangées puis des colonnes : un chemin tracé en glissant n'a
pas de trou même quand le pointeur saute plusieurs cases en une image.

| Type | Outil | Exécuté par | Ce que c'est |
|---|---|---|---|
| `0x02`, `0x04`, `0x06`, `0x08` | 1 à 4 | `0x287D8`, `0x28943`, `0x28E5A`, `0x29340` | mur, chemin, barrière de file, rivière ; avec traînée |
| `0x0A` | 5, 26 | `0x2EBB7` | une attraction (paramètre : sa fiche) |
| `0x0C` | 6 | `0x3568E` | une boutique |
| `0x0E` | 7 | `0x40DA6` | un arbre ou un décor : payé (catégorie 2 du livre), compteurs `+0x37` du catalogue et `+0x7C` du parc (le nombre de décors, vraisemblablement) incrémentés |
| `0x10` | 9 | `0x32232` | embaucher (paramètre : le métier) |
| `0x12` | 10 | `0x29835` | les rails (4 × fiche + 1), avec traînée ; une demande identique à la précédente est ignorée |
| `0x14` | 10, bouton droit | `0x29835` | abaisser la voie (`0x2A2F1`), ou retirer le rail déjà au plus bas (`0x2C6B8`, § 11.15) |
| `0x16`, `0x18`, `0x1A` | 12, 13, 14 | `0x412E0`, `0x2B576`, `0x2B62F` | un lac de 3 × 3 ; une flèche de sens unique ; un panneau indicateur (`0x1A` porte le mot +4 d'une fiche de chemin) (§ 11.17) |
| `0x1C` | 15 | `0x40E92` | une installation (type `0x18`), les toilettes (§ 11.17) ; **correction** : on la disait panneau indicateur |
| `0x1E` | 16, glissé | `0x29686` | une case de circuit ; avec traînée (§ 11.17) |
| `0x20` | 18 | `0x29E03` | un looping |
| `0x22` | 19, 21 | `0x348ED` | déplacer un employé, envoyer un mécanicien |
| `0x24` | bouton droit | `0x205D7` | démolir : la case est rendue au sol, ou l'objet ôté |
| `0x26`, `0x28` | `Alt+S`, `Alt+L` | `0x2DF12`, `0x2E035` | sauver, charger l'emplacement 0 |
| `0x2A` | | | quitter le parc (`0xD6688`) |
| `0x2C` | 20 | `0x64CF5` | une étape de la tournée de l'agent d'entretien (paramètre : l'objet choisi, § 10.13) |
| `0x2E`, `0x30` | | `0x4A571`, `0x4AAF1` | acheter, vendre une action |
| `0x32` à `0x36`, `0x40` | | | le réseau : accusés de réception, voyou envoyé à un autre joueur, synchronisation |
| `0x3A` | menu, RECOMMENCER (`0x50CCD`) | `0x19EEE` | une nouvelle partie à graine de hasard imposée ; le pays du joueur est gardé, le prix du billet recalculé |
| `0x38` | `Ctrl+C` | | de l'argent (§ 7), et le message de l'écran `0x56` |
| `0x3C`, `0x3E` | | `0x7B65C`, `0x7C128` | la mise à prix d'une vente aux enchères ; l'enchère d'un joueur (§ 11.13) |
| `0x42` | | | la vitesse du jeu (§ 5.3) |
| `0x5A` | | `0x2DEF8` | efface la demande de sortie |

**Construire une attraction** (`0x2EBB7`), dans l'ordre : les 22 cases de l'emprise (mots `+0x34`
et sols `+0x60` de la fiche du genre) doivent être sans sol et non réservées ; la case du portique
de la gare (table `0xB7A45`, cinq dispositions, celle en cours dans l'octet `+0x680` des comptes)
doit être sans sol ; il faut deux emplacements libres dans la table des objets, trois pour les
genres 4, 6 et `0x1C` (le second kiosque) ; enfin le solde moins le coût (`+0xA2`) moins
l'engagement doit rester positif, sinon l'écran `0x56` dit le manque d'argent. La pose : chaque case
vidée (`0x205D7`) reçoit son sol, le sol `0xAB` marque le portique, l'attraction et son kiosque sont
créés ; le coût va à l'engagement `+0x0E` (en centaines), aux dépenses `+0x37` et au mot long
`+0x5B` de l'attraction (§ 10.3). Selon le genre (`+0xB0`) : 4 et `0x1C` veulent un circuit d'allées
fermé ; 6 pose les rails des cinq cases de la gare (`0x29835` en mode 5, marqués pour que le bouton
droit ne les ôte pas), referme l'attraction et rend les rails en main ; `0x1E` est la rivière. Le
joueur passe ensuite à l'outil 11, l'entrée de l'attraction.

**L'entrée et la sortie** (`0x193FD`, `0x19A9E`) : l'entrée va, près des portes, sur la case libre
la plus proche du pointeur, et l'allée s'y raccorde ; la sortie prend la porte la plus proche, dont
le drapeau dit de quel côté elle s'ouvre. **Une boutique** (`0x3568E`) : cases, argent, objets
créés, compteurs du parc. **L'aperçu** sous le pointeur (`0x30E22`) : le morceau de voie, la voie
qu'on raccorde, ou l'emprise et l'image de l'attraction ; `0x6A73D` dessine un objet comme `0x209B5`
en sautant les morceaux marqués `0x80`.

**Un mur** (`0x287D8`) : la case doit être libre ; les voisines qui partagent un drapeau de sol se
raccordent, et la forme vient de `0xB8BA0` d'après le masque des quatre voisines. **Un rail**
(`0x29835`) : au plus deux voisines du même genre de voie (`+0xB4`), forme d'après `0xB8C11` ; la
première pièce sans voisine exige le bit 4 du mode ; sur un rail existant, `0x2A2F1` élève ou
abaisse la voie. **La note d'une voie** (`0x43689`) : deux marches depuis la gare, chaque case
valant `0xB5302`[hauteur] plus le prix de voie (`+0xBA`) ; une voie qui ne se referme pas rend une
valeur négative, que le clic d'ouverture reconnaît.

**Les jauges de la barre d'outils** (`0x4091A`) : deux barres de 20 cases (`0xCC818`, 40 cases de
15 octets, l'octet `+0xD` étant l'image), que `0x398DF` dessine à chaque image, remplies d'après les
visiteurs contents et mécontents et les octets `+0x50` et `+0x51` des visiteurs (l'estomac et la
soif, § 10.2).

**Anomalies reproduites.** `0x205D7`, avec l'outil 14, lit un numéro de flèche jamais écrit quand
l'objet désigné n'est pas du type 4, `0xA` ou `0x14` (aucun scénario n'y passe), et teste deux fois
de suite le bit `0x40` du sol. `0x4091A` compte les mécontents comme 20 moins les contents, sans
retirer les neutres : dès qu'il y a un visiteur neutre, la première barre déborde sur la seconde,
dont le remplissage final ne se fait plus. `0x2EBB7` compare à −1 une direction lue sans signe dans
`0xB493A`, jamais égale : une forme qui donne `0xFF` fait lire les tables de directions au-delà de
leurs quatre entrées. `0x15FBD` : la zone 19 joue deux clics de suite pour un employé ou quand le
mécanicien vient ; le parcours des employés (zones 23 à 26) repart de l'emplacement 0 ; la gare est
vérifiée sur 16 bits, ses rails posés sur 32. `0x19A9E` relit la tuile voisine sans se servir du
résultat — n'importe quelle porte est acceptée — et ne traite pas les drapeaux de porte 5, 7, `0xA`,
`0xB` et au-delà de `0xC`, laissant alors le côté du tour précédent (ou un reste de pile). La file
des événements efface le type et la première valeur de chaque case, pas la seconde ; l'événement
`0x38` crédite toujours le joueur courant, quelle que soit la case traitée.

**Non établi** : les octets `0xD7767` (redessiner la barre d'outils, vraisemblablement) et
`0xD7768`, les mots `0xD662A`, `0xD662C`, `0xD662E`, le bit 1 des catalogues (zone 22) ; le genre
100 et le champ `+0xAE` du catalogue des attractions ; `0x7C128`, lue mais jamais appelée par les
scénarios ; les événements du réseau et `0x5A`, qu'aucun scénario n'exerce. **Établis depuis** :
l'écran `0x4A` ouvert par `0x205D7` est bien « démolir ? », et `0x77A55` (clic droit sur l'argent)
ouvre le relevé bancaire (§ 11.18) ; les routines des outils 12 à 16 et 20 (§ 11.17, § 10.13).

### 11.6 Les sauvegardes, l'amorçage et la ligne de commande

Réécrits dans `moteur/jeu/evenements.js`.

**Le format d'une sauvegarde.** `0x2DF12` (sauver) et `0x2E035` (charger) écrivent et relisent la
même liste de blocs, la table `0xB1515` : 53 couples (adresse, taille), jusqu'à une adresse nulle,
écrits à la file, sans en-tête, sans numéro de version, sans compression — 304 668 octets, la
taille exacte d'un `.GY`. Les trois premiers sont les grands tableaux du tas, dont l'adresse n'est
connue qu'à l'exécution : les 25 fiches de joueur (`[0xD3B00]`, 13 650 octets), la carte
(`[0xD3B08]`, 16 384) et les 1 200 objets du parc (`[0xD3B10]`, 240 000). Suivent des variables : la
caméra et la case désignée, le calendrier `0xD3AFC`, l'état du hasard `0xD3AF4`, la file des
événements `0xD441E`, les comptes des cinq joueurs `0xD443C` (8 650), le joueur courant, l'outil en
main, les 25 fiches de parc `0xCF1E0` (14 800), l'origine du dessin, les catalogues des attractions
(6 400), des boutiques, des décors, des chemins, des barrières et du personnel, la vitesse du jeu,
les 25 pays `0xB7B38`, les noms et l'argent de départ `0xD6690` (141), et `0xD3AF8`. Le bloc
`0xD3C00` (98 octets) est écrit deux fois. Le rôle d'une vingtaine de variables sauvegardées n'est
pas établi ; la liste complète est en tête du module.

Le nom du fichier vient de l'emplacement : −1 donne `save/<nom>.gy`, la partie en cours ; 0 à 9,
`.g0` à `.g9` ; toute autre valeur négative, `save/DEMO.GY`. Le chargement remet ensuite la caméra,
demande un redessin complet et relance l'ambiance si le parc est ouvert. Seuls `simulation` et
`fin-annee` exercent la sauvegarde (automatique, à la nouvelle année) ; l'emplacement 0 ne l'est par
aucun scénario. Hors du jeu d'origine, la table des objets agrandie (architecture.md, « La table des
objets agrandie ») ajoute après les 53 blocs les objets au-delà du 1 200ᵉ enregistrement, s'il y en a.

**L'amorçage.** `0x10010` est le `main` : la ligne de commande, `0x104A3`, puis `0x11C45`, la
boucle qui tient le jeu du début à la fin (§ 11.9), et `exit`. `0x104A3` charge les images et les textes
(`0x2E20C`, 26 tables), choisit le mode vidéo (il tente la haute résolution, se rabat sur 320x200
et la lettre `m` des noms de fichiers), réserve la table des objets du parc (la ressource « *THING », 1 200
enregistrements de 200 octets, puis dix de moins tant que la mémoire manque ; `0x12452` en pose la fin en
dur, 1 198 emplacements, § 6.4), et prépare le pointeur. `0x19EEE` repart de zéro : carte, objets,
fiches de parc et comptes effacés,
catalogues et 25 fiches de joueur recopiés de leurs modèles, calendrier à zéro, caméra recentrée,
entrée du parc posée, bus créé. `0x12452`, l'entrée dans le parc, pose la graine du hasard
(`0x7FBE5`), la durée du double-clic, les noms traduits des catalogues, cherche dans la palette les
vingt-six couleurs de l'interface, reprend le mode d'affichage, crée une nouvelle partie et charge
l'emplacement demandé.

**La ligne de commande.** Un argument commence par `-` ou `/` et porte autant de lettres qu'on veut ;
celles qui demandent un chemin consomment le reste de l'argument. Les majuscules valent les
minuscules, sauf pour `s`.

| Option | Effet |
|---|---|
| `-c<chemin>`, `-d<chemin>` | le CD (`[0xD3BBC]`), l'installation (`[0xD3BDE]`) |
| `-l<lettre>` | la langue, table `0xB7E17` : « U0 », « G1 », « I2 », « S3 », « F4 », « P5 »… ; la lettre et le chiffre valent tous deux, `-lF` et `-l4` choisissent le français |
| `-n<n>` | charger l'emplacement n − 1 en entrant dans le parc (`0xD668A`), avant que le surnom soit connu : `-n1` cherche `save/.g0` ; une valeur négative (`-n-1`) charge `save/DEMO.GY` |
| `-m<n>` | le nombre de joueurs en réseau (`0xD7792`), ramené à 1 si `0x493BE` rend une valeur non nulle (−1 : NetBIOS introuvable), après l'attente d'une touche |
| `-r`, `-p` | enregistrer, relire les entrées (§ 6.7) ; le jeu quitte alors avant la première image |
| `-o` | ne pas sonder la carte son (§ 9.1) |
| `-s`, `-S` | couper les bruitages ; les bruitages et la musique |
| `-e` | lève `[0xD6680]`, non établi |

Le lanceur du dépôt passe `-cD:/game/ -dC:/THEME.CD/ -l4` ; un scénario peut en donner une autre
(`ligneCommande`, `moteur/scenarios/LISEZMOI.md`).

**Ce qu'ont établi les scénarios à ligne de commande** (septième vague) :

- **`-r` et `-p` quittent le jeu avant la première image.** `0x104A3` saute alors l'installation de
  la souris (`0x7DF44`), qui pose `[0xBECB4]` ; or `0x10010` n'entre dans la boucle `0x11C45` que si
  `[0xBECB4]` ≠ 0. En sortant, `-r` écrit un `RECORD.GAM` de 0 octet, et `-p` réécrit le tampon relu
  (§ 11.21). Le relevé de la souris `0x10992`, qui n'est appelé qu'avec ces options, est donc du
  **code mort** dans le jeu publié (§ 6.7) ;
- **`-n`** est, hors faillite, la seule façon d'avoir « continuer » dans le cas « partie commencée »
  (`partie === 1`) ; le parc chargé, le conseiller parle (le prix des billets) ;
- **`-m2`** : NetBIOS (int 5Ch, par le service DPMI `0300h`) échoue, `0x493BE` rend −1, le jeu attend
  une touche (`0x493FC`) puis revient à un joueur. L'hôte actuel ne permet pas ce chemin : son DOS
  répond toujours « aucune touche » (int 21h `0Bh`), et l'attente ne finit jamais. Essayé avec un hôte
  corrigé, `-m2` atteint l'initialisation du réseau, 25 fonctions et 1 293 instructions (`0x493BE`,
  `0x487A0`, `0x48951`, `0x48A01`, `0x48A7E`, `system` en `0x7F3F0`, `0x87F73`, `0x92FCF`…). Il a
  aussi révélé **un bogue de la réécriture** : `evenements.js` testait `=== 0` là où l'original
  (`0x102F0 call 0x493BE ; test ax, ax ; je 0x10301 ; mov [0xD7792], 1`) ramène à un joueur quand
  le retour est non nul ; corrigé. Le jeu en réseau lui-même (`0x49414`, `0x482EB`, appelés par
  `0x19EEE` seulement si `[0xD7792]` > 1) demanderait d'émuler NetBIOS dans l'hôte.

**Anomalies reproduites** : `0x10D42` écrit le mode d'affichage jusqu'à trois fois de suite ;
`0x2E20C` continue, pour une section au-delà de la 26ᵉ, d'écrire à la suite de la table précédente.
**Non établi** : les variables de `-e` et de plusieurs routines de la file. Le retour au DOS de
`0x10010`, que seul le scénario `quitter` atteint, est établi (§ 11.21).

### 11.7 Les écrans de gestion et le graphique des comptes

Réécrits dans `moteur/jeu/ecrans-gestion.js`, avec la jauge de stock de `moteur/jeu/divers.js`.

**Les commandes** (`0x3B76E`, appelée par `0x3B011`) : une même commande change de sens selon
l'écran ouvert (`0xD6652`) — le bouton « + » (`0x14`) allonge la file d'une attraction, augmente le
salaire d'un employé ou le prix du billet. Les réglages :

| Écran | Réglage | Pas et bornes |
|---|---|---|
| attraction (`0x14`) | la file (`+0x26`) | de 2 au maximum du genre (`+0xA6`) |
| employé (`0x1C`) | le salaire (`+0x9A`) | pas de 2, jusqu'à 6 000 ; plancher du métier (§ 10.5) |
| boutiques (`0x16`, `0x23`) | prix de vente `+0x4F` ; prix d'achat `+0x4D` ; quantité `+0x5D` ; qualité `+0x5F` | 0 à 998 ; de 400 en 400 jusqu'à 4 000 ; 1 à 100 ; 0 à 4 |
| finances (`0x38`) | le billet (`+0x1D` du parc) | pas de 2, de 0 à 2 000 |
| finances | le prêt | par 50 000, plafond `+0x62` × `+0x66` du parc, plus 50 000 |

Les réglages d'une boutique sont des champs de la **fiche du genre** : ils valent pour toutes les
boutiques du même genre. « Valider » note le billet dans les comptes (`+0x2CE`) et recalcule
`+0x2C0` ; « annuler » le reprend. La commande couvre aussi l'achat depuis un catalogue, les listes
(ouvrir la fiche, trier, centrer la vue ; une ligne de liste, `0xD382C`, fait 14 octets : +0 la
fiche du catalogue, +0x0A l'objet du parc), la fermeture d'une attraction, la vente d'un objet et
la sortie de partie (`0xB14D6` : 1 reprendre, 2 quitter, 3 recommencer) ; la commande `0x09` ouvre le
relevé bancaire (`0x77A55`, écran `0x40`, § 11.18) et la commande `0x0A` « vend » l'objet de la fiche
par `0x325DA`, le renvoi d'un employé (§ 10.5). Trois boutons ouvrent des
écrans par une routine différée : `0x08` la bourse (`0x4B11E`), `0x23` l'entrepôt (`0x798D7`), `0x24`
le département des recherches (`0x515A0`).

**Le catalogue d'achat** (`0x360C5`, routine de remplissage des fenêtres 1 à 4 et `0x14`) : dressé
en `0xCE9D8`, 13 octets par article, trié par prix, ce qu'on ne peut pas payer marqué. La table des
décors `0xCCA70` : `+0x22` le nom, `+0x24` l'objet graphique, `+0x28` le prix, `+0x2A` l'outil,
`+0x35` disponible. **Les pensées** (`0x36BFC`, fenêtre `0x13`) : 40 bulles lancées, le titre, trois
pastilles de légende.

**Le graphique des comptes** (`0x5877B`, écran des finances) : neuf courbes — le solde, les
recettes, les dépenses, les passagers du bus, la valeur des actions, les recettes du parc, les
salaires… — et trois échelles de temps, le mois, l'année et quatre ans, douze points par courbe et un
repère de temps sous chaque point. L'échelle verticale s'ajuste à chaque courbe (si tous les points
sont égaux, le maximum est doublé et le minimum mis à zéro), et seuls les points déjà atteints par
le temps sont tracés : 1 000 pas par mois, 12 000 par an, 48 000 pour quatre ans. Le point à
l'abscisse x − (12 − m) × pas porte la valeur du mois m − 1. Ses boutons (`0x5969C`) : trois
boutons d'échelle exclusifs, neuf boutons de courbe qui s'allument et s'éteignent. Les segments
passent par `0x949BC` (§ 12).

**La jauge de stock** (`0x7B3F6`, dans la fiche d'une boutique) : la barre du haut est graduée sur
la capacité de l'entrepôt (`[[0xD3818]+0x4B]`) ; la plus petite des deux quantités en orange, la
différence en vert (stock en plus) ou en rouge (commande pas encore arrivée). La barre du bas ne
paraît que pendant une livraison. `0x3DE18` (l'ordre `0x12` d'une fenêtre) trace une rainure : un
aplat et quatre traits horizontaux, sans bord vertical.

**Anomalies reproduites** : la commande `0x0C`, hors des trois listes, lirait le type d'objet
attendu dans une variable jamais écrite (seuls les écrans de liste portent ce bouton) ; le bouton
« − » du salaire ignore le gardien. **Non établi** : les noms exacts des neuf séries (ils viennent
des fichiers de textes) ; le champ `+0x1C` d'un employé, où la validation garde le salaire ; `+0x2C0`
des comptes ; le mot `+0x73` d'une attraction (la case de sa sortie). **Correction** : le catalogue d'achat (`0x360C5`) ne
rallume le bouton 2 de la fenêtre des attractions (`0x407A0(2, 1)`) que si l'octet signé `+0xB4` du
genre, le genre de voie, n'est pas −1 — le même test que `0x407FD` sur l'écran `0x36`
(`ecrans-gestion.js`) ; on écrivait, et la réécriture lisait, `+0x84`. Dans le catalogue de la démonstration, les genres essayés avaient `+0x84`
et `+0xB4` du même côté de −1 ; `horza-objets` (nouvelle partie, CHÂTEAU MOU) a fait diverger la
partie, et la réécriture est corrigée. Le mot +8 d'une fiche de marchandise (`0xD3C00` + 14n), comparé au stock
à la place de la commande, est la quantité du bon de commande de l'entrepôt (§ 11.12).

### 11.8 Le panneau de commande du parc

Réécrit dans `moteur/jeu/ecran-parc.js`. Tout en bas de l'écran du parc, une bande de 40 lignes (360
à 400, ou 440 à 480 : `0x4DFAC` pose les ordonnées des zones du bas selon la résolution) : à gauche
les dix boutons d'outils, au milieu deux panneaux, à droite les six réglages de l'objet choisi ;
en haut, la date et sept icônes.

**La barre d'outils** (`0x4DE1A`) dessine ses douze cases (zones 4 à 15) **dans le tampon de fond**,
pas sur la surface de dessin : la restauration par blocs la remet sous les sprites à chaque image
(§ 6.6), et elle n'est redessinée que si on le demande, si une animation court (`0xD7767`) ou si un
écran est ouvert. Chaque bouton a deux images (+8 au repos, +9 enfoncé) ; le bouton choisi reste
enfoncé jusqu'au clic suivant, et un seul octet, `0xD779F`, porte l'image de l'animation d'un
bouton pressé.

**Le reste** (`0x4E359`), sur la surface de dessin, dans l'ordre : quatre icônes du coin haut
droit, chacune sous condition (une découverte, qui clignote, puis les mots `+0xCC`, `+0xD4` et
`+0xD0` du parc, les nombres d'employés de trois métiers, § 10.8) ; la date « jour MOIS », le jour
valant (pas mod 1 000) / (`0xB7E06`[mois] + 1) + 1 ; la jauge du bus (sa charge, `+0x5EE` des
comptes, sur la capacité `+0x48` du parc) et celle des visiteurs présents ; le visage de l'humeur,
en sept niveaux ; l'argent, centré — pendant les 250 premiers pas du mois, la variation du mois en
clignotant, sinon le solde moins l'engagement ; les six réglages selon le type de l'objet désigné
(attraction, employé et mécanicien, boutique avec sa jauge de stock, visiteur, panneau) ; enfin
son nom, qui défile sur 16 caractères (`0x4FB79`, décalage `0xD6636`), remplacé par un texte en
pause. `0x4C0B2` écrit une somme en « M », « K » ou en unités ; `0x4C50B` rend le nom d'un joueur
(le nom saisi pour un humain, sinon un nom de la table `[0xD7B98]`). `0x50366` pose l'échelle, la
marge, la hauteur de ligne et les six couleurs de la barre de menus ; celles des menus déroulés
sont `0xD7796`, `0xD7790`, `0xD778F` et `0xD7799` (lues par `0x508A3`).

**Anomalies reproduites** : `0x4C0B2` a deux branches identiques (au-delà de 999 999 comme de 999,
la somme est divisée par mille avec un « K ») ; l'argent est centré à 8 unités par caractère, la
largeur de la basse résolution seulement, et se décale vers la gauche en 640x480 ; `0x4DFAC` écrit
deux fois les ordonnées de la zone 15 ; le mécanicien en route prend l'icône de la zone 20 plus 2,
dessinée dans la zone 19 ; la sécurité est ramenée sur 256 et non sur 128, sans borne ; une fonction
de dessin modifie l'état du jeu — `0x4E359` décrémente le compte à rebours `+0xC4` de l'objet
désigné. **Non établi** : pourquoi les zones 25, 27 et 28 n'ont pas d'icône ; plusieurs branches
(le mécanicien en réparation, les états d'employé `0x16` à `0x30`, le texte de pause) ne sont
vraisemblablement pas toutes exercées par les scénarios.

### 11.9 La boucle du parc et les entrées

Réécrites dans `moteur/jeu/amorcage.js`.

**La boucle** (`0x11C45`), appelée une fois par le `main`, tient le jeu du début à la fin : elle
entre dans le parc (`0x12452`), puis tourne une image par tour jusqu'à ce que `0xD6688` demande d'en
sortir ; elle appelle alors `0x185B0` (vide) et rend la main au `main`, qui quitte le programme
(§ 11.21). Une image :
les entrées (`0x1107F`) ; la visite de la démonstration (`0x5B5D0`) ; la barre de menus (`0x4FD85`) ;
`0x801A0` si le morceau `[0xBA71A]` est entre 1 et `0x11` ; le premier bloc de simulation (§ 5.3) ;
le pointeur replacé sur la grille pendant un tracé (§ 6.7) ; la routine de l'écran affiché ; la
commande différée d'une ligne de menu (`[0xD3828]` et son argument `[0xD6622]`, ou `0x13BF3` avec une
touche simulée) ; la file des événements (`0x2CCF8`) ; enfin, hors de l'écran titre (`0x50`), le
fondu de la palette (`0x1A706`) et la présentation. Pour les écrans `0x4A`, `0x54`, `0x56` et `0x64`,
affichés par-dessus la vue du parc, l'image entière est présentée sur place, `0xD6BCD` levé le temps
de la copie ; sinon par `0x80210` ou `0x55507`, sauf si `0xB1511` dit qu'elle l'a déjà été.

**La routine de la vue du parc**, dans l'ordre : retour en 640x480 si besoin (`0x11761`), le pointeur
de l'outil (`0x116E4`), `0x13B9A`, la barre de menus, la barre d'outils et la barre des messages
(`0x50651`, `0x4DE1A`, `0x5CBDB`) si la barre d'outils est affichée, `0x1B229` pendant les 500
premiers pas, la boîte de l'écran par-dessus (`0x78B7E` pour `0x4A`, `0x78CEF` pour `0x54`,
`0x78F89` pour `0x56` — le message `[[0xD3814]+0x1B1]` — et pour `0x64`, la faillite, texte `0x5E` ou
`0x5F` selon le cours de l'action), les catalogues (`0x6B9CB`), la météo (§ 11.1), le dessin des
catalogues (`0x6BF89`), le clavier (`0x13BF3`), les zones (`0x145FB`), le second bloc de simulation,
et le tir des feux d'artifice (`0x6D508`) si l'octet `+0x77` du parc est levé. Tous les appels sont
faits à la hauteur de pile d'origine, le cadre de la boucle (trois registres, `ebp`, 0x1C octets)
reproduit : des restes de pile y sont relus (§ 10.1, § 11.4).

**Les entrées** (`0x1107F`) : le signe ASCII de la touche en `0xD77A1`, puis le tampon du clavier
vidé ; en relecture (`-p`), la touche vient du tampon enregistré et le clavier n'est lu que s'il est
vide ; avec `-r` ou `-p`, la souris est relevée par `0x10992`. **Le compte avant la démonstration** ne
tourne que sur l'écran titre, hors pause et hors démonstration, et si `save/demo.gy` existe
(`0xB14AE`, posé par `0x104A3`) : une image sans bouton tenu, sans touche et sans mouvement avance
`0xD6606`, la 3 000ᵉ lance la démonstration (`0x5B55A`) ; le moindre geste remet le compte à zéro et,
s'il avait atteint 3 000, appelle `0x5B82A` — mais la démonstration, une fois lancée, n'est plus sur
l'écran `0x50`, et c'est la visite elle-même qui s'arrête (`0x5B5D0`).

**Rouvrir un écran** (`0x1B23A`) : l'écran d'avant (`0xB9ED9`) est rouvert et son ambiance sonore
relancée. **L'écran d'attente `0x66`** (`0x1B6A8`) : `data/mmenu-0.dat` chargé dans le fond, agrandi
(`0x55EFA`) et présenté, le pointeur au centre ; le jeu attend un clic ou une touche en relisant le
clavier en boucle (une attente active), puis rend l'écran titre. **Le pointeur** : `0x116E4` change
son image, `0x1146E` remet le pilote à zéro.

**Anomalies reproduites.** Pendant le tracé d'un chemin, la boucle replace le pointeur du pilote avec
l'ordonnée du curseur (`0xBECAE`) au lieu de `0xB14E4` : seul l'horizontal est recollé à la grille.
Les deux blocs de simulation peuvent tourner à la même image (§ 5.3). `0x1B23A` règle deux fois
l'ambiance de l'écran 0. `0x1146E` fait quatre écritures deux fois. **Non établi** : `0x801A0` et
ce qu'elle fait du morceau en cours ; pourquoi `0x80BE4` (l'attente du balayage, § 6.9) suit
l'écran `0x66` ; les écrans `0x32` et `0x4C` (touches `F8` et `8` des tricheurs, § 7), qui ne se
rouvrent pas ; la plupart des cas de l'aiguillage de `0x1B23A`, appelée cinq fois dans quatre
scénarios. **Preuve** : `0x11C45` ne rend la main que si l'on quitte le jeu ; le scénario `quitter`
(la démonstration, Espace, puis F6) la compare d'un seul appel, du début à la fin de la partie.

### 11.10 Les menus déroulés et l'écran des recherches

Réécrits dans `moteur/jeu/menus.js`.

**Les menus déroulés.** `0x503DA` place un menu qui se déroule : sa largeur est celle de la plus
longue ligne plus celle du plus long raccourci (« CTRL » + « S »…), sa hauteur la somme des lignes,
un filet comptant deux unités de plus ; le mot +8 reçoit la largeur de la colonne des textes. S'il
déborde à droite de 640, il s'ouvre à gauche de son accroche, ou se colle au bord droit si
l'accroche est dans la moitié gauche ; s'il déborde en bas (400 ou 480), il remonte. `0x508A3` le
dessine : le fond, la ligne allumée sur un bandeau, les lignes actives et inactives, la coche des
lignes à cocher (octet +4 bit 0 ; l'octet coché est désigné par le pointeur +5), la flèche d'un
sous-menu, le raccourci « modificateur + touche » (+0x13 : 1, 2 ou 4), les filets, le contour.
L'échelle est `[0xD7793]` (2 en 320x200, 1 en 640x480), la hauteur d'une ligne `[0xD6620]`, les
couleurs celles de `0x50366` (§ 11.8). `0x51094` relie les coches de deux lignes du menu PARC à la
fiche du parc : `0x26` PARC OUVERT (`+0x18`) et `0x25` FEUX D'ARTIFICE (`+0x77`). `0x51011` relève,
pour les lignes JEU 00 à JEU 09, si `<dossier>save/<surnom>.g<n>` s'ouvre (`[0xD43F6 + n]`).

**Les commandes** (`0x50CCD`), exécutées en fin d'image par la boucle du parc : 1 EFFETS SONORES
(bascule `[0xBA721]` s'il y a une carte son ; éteints, tous s'arrêtent ; rallumés dans un parc
ouvert, le bruit de la foule reprend), 2 MUSIQUE (`[0xBA715]`), 3 lève `[0xB14C6]` (le clavier
réduit, § 6.7) et referme la barre — aucune ligne ne l'emploie —, 5 le retour à la vue du parc sans
outil, 6 RECOMMENCER (après la question `0x78E36`, la demande `0x3A` avec les deux moitiés de l'état
du hasard `[0xD3AF4]`), 7 à 9 les niveaux MATERNELLE, SIMULATION, BUSINESS (`[0xD66F1]` et ses trois
drapeaux), 10 à 13 les vitesses (un drapeau chacune, `0xD775A` à `0xD775D`, et la demande `0x42`
avec −2, 0, 1 ou 20). Les demandes vont dans la case du joueur de la file des événements (§ 11.5).

**L'écran des recherches** (écran `0x4E`, touche `N` ou le menu AFFICHAGE). `0x515A0` l'ouvre :
passage en 320x200 (§ 6.9), budget total d'au moins 1, fond `mres`, palette `mrspal`, images
`mrsspr`. `0x51780` le fait vivre à chaque image. Il décrit l'écran par **vingt réglages** en
`0xB97F9`, 0x1D octets chacun : +0 la sorte (0 à 5 le domaine dont la jauge règle le budget, 6 le
budget total, 7 la réserve ; les réglages 8 à 13 et 14 à 19 reprennent 0 à 5 pour les tubes et les
voyants), +1 la zone de texte de son chiffre, +2 le maximum (le total pour les jauges,
`[0xD3568 + 4 × réglage]` pour les tubes), +6 à +0xC le rectangle de la jauge, +0xE la taille des
flèches, +0xF et +0x11 l'indicateur d'un tube, +0x13 et +0x15 le premier voyant, +0x17 et +0x19 la
molette, +0x1B l'image de la molette (0 à 3), +0x1C les crans qui lui restent à tourner (signé).
Les zones de texte : `0xB9759`, 0x14 octets (le chiffre, le nom qui défile et une seconde ligne,
textes de `[0xD7BA8]`) ; les boutons : `0xB9A45` plus, `0xB9A4D` moins, `0xB9A3D` la sortie.
**La fiche du parc** : `+0x110` la réserve, `+0x112` le budget total, `+0x114` six budgets,
`+0x120` six avancements, `+0x248` six octets « domaine ouvert » ; `0xB98C6` garde le budget total
au dernier changement ; les comptes : `+0x64C` et `+0x664`, six longs chacun, le travail fait et le
travail demandé par la recherche en cours de chaque domaine.

**Le réglage**, sauf au niveau MATERNELLE : la jauge horizontale du total (clic maintenu en
proportion, flèche de droite à 1, de gauche au maximum, boutons ± 1) ; un changement de total met
chaque domaine à l'échelle (en 1/8 192), la réserve reçoit le reste, un dépassement est repris aux
domaines. La molette de la réserve : clic gauche, 1/32 du total pris à la réserve et réparti entre
les domaines ouverts ; clic droit, rendu. Les six jauges verticales : clic maintenu, flèche du bas
(0), du haut (au plus possible), molette (± 1/32). Ce qui est à reprendre ou à rendre se partage
par parts égales entre les domaines ouverts, un domaine vide ou plein se retirant du partage.
`0x53E6E` tourne chaque molette d'un cran par image (`moteur/jeu/ecrans-infos.js`). Puis le dessin :
jauges et liquide animé (`0xD7866`), molettes, chiffres, noms qui défilent, tubes d'avancement,
24 voyants par domaine (le travail fait, en 24es), la réserve en briques. On sort par le bouton,
Entrée ou Espace : les images du parc rechargées, l'écran d'avant rouvert.

**Anomalies reproduites.** Le partage d'une somme à reprendre compte les domaines participants en
testant l'ouverture d'un domaine resté d'une boucle précédente (`[ebp-0x20]`, qui peut valoir 6 et
lire `+0x24E`). La garde des deux boucles de partage est inversée (« tant que reste ≠ 0 **ou** plus de
200 tours ») : elle ne limite rien, et une somme impossible à partager bloquerait le jeu. Le réglage
du total et les jauges testent l'ouverture `+0x248` au rang du réglage, pas du domaine. `0x508A3`
pose `[0xBECBC]` = `0x40` à chaque ligne sans que rien le relise ; le cran minimal d'une molette
appelle deux fois la valeur absolue. **Non exercé** : le recadrage d'un menu qui déborde ; les
commandes 3 et 5 ; un domaine fermé, un tube qui déborde ; les chemins 640x480 de `0x51780` (l'écran
passe toujours en 320x200). **Non établi** : `[0xB14C2]` ; `0x81984` et `0x81AD0` à l'ouverture (le
son, vraisemblablement) ; le sens exact de `+0x120`, de `+0x64C` et `+0x664` ; les images `0x78` et
`0x7E` (voyant allumé et éteint, supposés).

### 11.11 Le tutoriel

Réécrit dans `moteur/jeu/ecrans-infos.js`. Un joueur qui répond NON à « DEJA JOUE? » (`0xD66F7`,
§ 11.4) commence avec l'étape `0xBA0F8` à 0. Tant qu'elle est positive ou nulle, la barre des
messages (`0x5CBDB`) ne cherche pas de remarque et appelle `0x59C85` à chaque image. Seuls le
CHATEAU MOU (genre `0x14`) et les GLACES MOTTO (genre `0x21`) restent disponibles, tous les autres
genres étant rendus indisponibles à chaque image, et **le solde est remis à chaque image** au mot
`+0x06` de la fiche du joueur : le tutoriel ne coûte rien. Les étapes :

| Étape | Ce qu'on attend |
|---|---|
| 0 | la vue amenée sur le terrain (`0x59C06` : colonne `0x22` au centre, rangée `0x3D` en bas) |
| 1 | 400 pas, ou 50 et un clic ; l'outil est lâché |
| 2, 11 | le bouton des allées (zone 4) clignote jusqu'à l'outil 2 |
| 3 | une allée sur les deux cases marquées de la rangée `0x35` (colonnes `0x1C` et `0x26`) |
| 4, 5 | le bouton des attractions (zone 6), jusqu'au CHATEAU MOU en main (ou, à l'étape 4, le catalogue n° 1 ouvert) |
| 6 | l'attraction posée en (`0x23`, `0x32`), où son fantôme est dessiné ; posée ailleurs, elle est démolie (`0x31748`) |
| 7, 8 | l'entrée (outil `0x0B`) menée en (`0x24`, `0x32`) ; la sortie (outil `0x11`) sur (`0x20`, `0x32`) |
| 9, 10 | le bouton des files (zone 5) ; une file sur (`0x24`, `0x33`) et (`0x24`, `0x34`) |
| 12 | une allée sur (`0x20`, `0x33`) et (`0x20`, `0x34`) |
| 13 à 15 | le bouton des boutiques (zone 7), les GLACES MOTTO en main, posées en (`0x1D`, `0x34`) (sinon démolies, `0x35C4A`) |
| 16 | le parc ouvert |
| 17 à 25 | trois employés, trois étapes chacun (bouton du personnel, zone 9 ; le métier ; la case) : l'artiste `0x34` en (`0x21`, `0x35`), le nettoyeur `0x39` en (`0x1F`, `0x34`), le mécanicien `0x38` en (`0x23`, `0x33`) |
| 26 | le pas de la fin noté : 600 pas plus tard |
| 27 | les catalogues remis à neuf d'après l'exécutable (sauf l'octet `+0x37` des vingt décors), les objets du parc recomptés, et le tutoriel finit |

Aux étapes 1 à 25 et 27, la barre des messages montre le texte de l'étape ; le bouton à presser
clignote, dessiné quatre points plus haut ; les cases à couvrir sont marquées par des images de sol
(86, 122 et 162). **Anomalies reproduites** : l'étape 11 renvoie à l'étape 2 par la table de sauts
(après la file, on reprend les allées) ; le solde gelé. Aux étapes 4, 17, 20 et 23, il suffit que le
catalogue surgissant soit ouvert ; la fiche est vérifiée à l'étape suivante. **Non établi** : le mot
`+0x06` de la fiche du joueur (le solde de départ, vraisemblablement), `0xD3684`, les démolitions
`0x31748` et `0x35C4A` ; les noms des variables de l'étape 8 (le mot `+0x2D0` des comptes y désigne
l'entrée posée à l'étape 7). **Non exercé** : les démolitions des étapes 6 et 15, la validation par
la fenêtre aux étapes 4, 17, 20 et 23, et la fin du tutoriel (on voit l'étape 27, pas sa fin) ;
relus contre le désassemblage. Scénarios : `tutoriel` (320x200) et `tutoriel-haute`.

### 11.12 La question oui/non, l'entrepôt et les commandes

Réécrits dans `moteur/jeu/dialogues.js`.

**La question.** `0x78F89` dessine une image d'une boîte oui/non — la sœur de la saisie d'un nom
(`0x793B1`) : même panneau du tiers central, le titre, la question coupée en lignes (`0x40BBC`),
« oui » à gauche (image 185), « non » à droite (image 187) — et rend 1, −1, ou 0 tant qu'on n'a pas
cliqué ; en se refermant elle remet l'écran à 0, ce qui ferme les écrans `0x56` et `0x64`. `0x78E36`
en fait une question modale : l'écran gardé dans le tampon de fond, puis une boucle à part (entrées,
fond, boîte, présentation) jusqu'à la réponse. Appelants : QUITTER (`Alt+Échap`), RECOMMENCER,
le rachat du terrain et la vente du parc (§ 10.12). **Anomalies** : les deux boutons sont testés
aux dimensions de l'image 185, comme dans `0x793B1` ; la branche 480 lignes de `0x78E36` est morte.
**En 640x480** (Alt+Échap, scénario `titre`), la boucle de la question recentre le curseur à chaque
image, et seul l'appui porte la position absolue (celle du pilote, divisée par 8) : la visée du
compositeur, qui déplace le pointeur avant de cliquer, y échoue, et il faut des événements bruts —
✓ en (1520, 2608), ✗ en (3616, 2608) en unités du pilote ; la zone du ✓ va de y = 312 à 336.
Deux autres boîtes par-dessus la vue du parc : « démolir ? » (écran `0x4A`, `0x78B7E`, § 11.18) et le
bus (écran `0x54`, `0x78CEF`, § 10.6).

**Le bandeau des écrans pleins** (`0x7C16C(palette, texte)`, réécrit dans `dialogues.js`), la ligne
de message au bas de l'entrepôt, de la bourse et des recherches : un bandeau noir sur toute la
largeur, haut d'une ligne de texte et quatre pixels, le texte en blanc à x = 4, les deux couleurs
cherchées dans `palette` (`0x80250`) ; le bandeau commence 6 pixels (12 en 320x200) plus 2 au-dessus
du bas de l'écran, le texte 6 (12) au-dessus, si bien qu'il finit deux pixels au-dessus du texte.

**L'entrepôt** (écran `0x52`, `Maj+S` ou le bouton `0x23` d'un écran). `0x798D7` l'ouvre : l'écran
d'avant noté (`0xD660E`, `0xB9ED8`), fond `data/mstock-0.dat`, palette `mstpal-0` dans `0xCEBE0`,
images `mstspr-0` logées dans la mémoire de la table de fusion `[0xBA2F8]`, leur table reliée par
`0x10C80` et gardée en `[0xDE1D0]`. **Les marchandises**, `0xD3C00`, 14 octets : +0 le nom, +2 le prix
unitaire, +4 le stock, +6 la quantité en commande, +8 la quantité choisie sur le bon de commande,
+A le délai de livraison en pas, +C les pas écoulés ; une boutique (`0xD3C62`) dit en `+0x67` sa
marchandise (−1 aucune) et en `+0x66` bit 0 si elle est disponible. **Le parc** : `+0x4D` le niveau
de l'entrepôt, `+0x4E` le plus haut que permet la recherche ; `0xB7930` la capacité par niveau
(mots), `0xB78E0` le prix (longs), `0xBEAD2` les images des barres (4 octets par niveau). **La mise
en page**, `0xBE58B`, 0xC1 octets par marchandise : où écrire le stock, l'image d'une caisse et
quarante positions de caisse, le camion, la caisse livrée au bout de sa corde, le rectangle
cliquable, la teinte du bandeau ; la fiche 6 est l'agrandissement (bouton en `0xBEA1B`). `0xDE1DE`
est le choix en cours : −1 rien, 0 à 5 une marchandise, 6 l'agrandissement.

`0x79A04`, à chaque image : les caisses de chaque marchandise d'une boutique disponible (stock × 40
/ capacité, quarante au plus ; un rectangle blanc sur une boutique indisponible), la barre de
capacité (`0x7B19C` : bout gauche, milieux, bout droit, puis « CAPACITE=n »), pour chaque commande
le camion et la caisse qui descend à mesure que la livraison avance, le bouton d'agrandissement qui
clignote tant qu'un niveau plus haut est permis, et le panneau de droite. Pour l'agrandissement : la
barre du niveau suivant, son prix, sa capacité et « acheter », qui monte le niveau et porte le prix
au livre (catégorie `0x14`). Pour une marchandise : prix, stock et sa valeur, la commande en cours
et sa date, puis le bon de commande — une glissière de 0 à la capacité, la quantité, son coût et
« commander ». **Le délai de livraison** : hasard mod 1 000 + 2 600, ou + 3 600 si l'on commande
moins que la commande en cours ; puis moins 2 × délai / (11 − niveau / 2) ; 250 pas au moins. On
sort par Échap, Entrée ou le bouton : la table d'images du parc est rechargée (`mspr-0.tab`),
l'écran d'avant rouvert (`0x1B23A`), la palette rendue (`0x7C32D`). Les clics n'agissent qu'au
niveau BUSINESS (« au jeu complet »), et hors grève des fournisseurs.

**Anomalies reproduites.** `0x798D7` prend la fin de la table d'images à taille × 6 (comme l'écran
des trophées) et reloge six fois trop d'entrées. Le bord bas du bouton d'agrandissement est lu dans
la dernière fiche de mise en page vue (`+0x496`) au lieu de `0xBEA21` ; une boutique sans
marchandise fait tracer un rectangle d'après `0xBE4CA`, juste avant la table ; COMMANDER est dessiné
jusqu'à `0x170` + hauteur de ligne, cliquable jusqu'à `0x16C` seulement ; **la commande ignore la
grève des fournisseurs** (`+0x683` des comptes, § 10.15), que la glissière respecte ; une couleur est
calculée et jamais employée. Non atteint : un délai nul ou une capacité nulle diviseraient par
zéro. **Non établi** : `0xDE1CC`, `0xDE1BC` et `0xDE1D4` au-delà de leur usage ; le contenu exact
des textes `0xDC` à `0xE4`, `0x190`, `0x194`,
`0xC0`, `0xC8`, `0xD8`, `0x104`, `0xE8`, `0x180`, devinés à l'affichage.

### 11.13 La bourse et la vente aux enchères

**L'écran de la bourse** (écran `0x44`, `Ctrl+S`, le menu AFFICHAGE, le bouton `0x08` d'un écran ou
`0x1B23A`), réécrit dans `moteur/jeu/poses.js`. `0x4B11E` l'ouvre (fond `data/mshare-0.dat`,
intitulés) ; `0x4B56C` le mène à chaque image : le tableau des cours, le choix d'une ligne
(`0xB93B9`), acheter (événement `0x2E`), vendre (`0x30`), sortir ; `0xD785C` et `0xD785D` le message
(textes `0x4A`, `0x4B`, `0x4C`) et sa durée ; bruitages `0x1E` achat, `0x1A` vente, `0x1F` refus,
`0x19` sortie. `0x4BDD6` écrit une ligne de joueur (place, nom, solde disponible, actions, cours),
`0x4C167` une ligne du tableau (flèche de tendance, marques de détention, nom sur trois lettres, cours
en centaines). **La fiche du parc** (`0xCF1E0 + n × 0x250`) : `+0x60` les actions en vente, `+0x62`
les actions émises, `+0x66` le cours, `+0x6A` l'ancien cours, `+0x6E` le plus haut, `+0x72` le plus
bas (le plafond du prêt, `+0x62` × `+0x66`, § 10.8, est donc la capitalisation) ; **la fiche du
joueur** : les mots `+0xA3` sont les actions détenues dans chaque parc. **Anomalies reproduites** :
les deux lignes lisent le cours dans le parc du numéro du joueur, et non dans celui que désigne sa
fiche (mot `+2`) ; l'écran plein, rouvert à chaque image, n'est refermé (`0x40D79`) qu'en sortant.
Non établi : `0x81984(0, 0x15, 0)` et `0x81AD0(0, 0xE, −1)` à l'ouverture (le son de l'écran,
vraisemblablement).

**La vente aux enchères** (écran `0x62`), réécrite dans `moteur/jeu/dialogues.js`. `0x7B65C(mise)`
la prépare : fond `data/mauct-0.dat` sur la surface (sans lui, rien d'autre), images `mauspr-0`
dans la réserve `[0xD3BA0]` et leur table 30 000 octets plus loin, fond recopié, 0x744 images de
vente (62 secondes), aucun enchérisseur, écran `0x62`. Elle vient du bilan de fin d'année (§ 10.12)
ou de l'événement `0x3C`. `0x7B73E` la déroule, dans sa propre boucle jusqu'à la fin du compte à
rebours ou l'adjudication : la file des événements, le fond, le nom du joueur, le titre (texte
`0x190`), la mise à prix (`0x194`), le nom du parc, la mise et le compte à rebours / 62. Tant que
personne n'a enchéri, `0x73EE8` cherche à chaque image le premier joueur assez riche, hors le
vendeur, et `0x7C128` note son enchère (l'événement `0x3E` y mène aussi) : `[0xDE1D8]`
l'enchérisseur (−1 personne), `[0xDE1C4]` son prix, `[0xDE1C8]` la prochaine mise (+10 %),
`[0xDE1DA]` le compte à rebours au moment de l'enchère, `[0xDE1DC]` celui de la vente. Le
commissaire-priseur (table `0xBEB86`, 7 octets par pose) s'anime après chaque enchère ; les joueurs
ont leur marque dans la salle (`0xBEB26`). Toutes les 186 images sans nouvelle enchère, la vente
passe au cran suivant — « une fois », « deux fois », « adjugé ». Elle rend l'acheteur, ou −1. En
sortant, `data/mblk-0.dat` est remis dans la réserve `[0xD3BA0]`. **Anomalie reproduite** : un
premier test de clic (`0x1E0`–`0x222`) est fait puis oublié. **Non exercé** : la vente avec un
enchérisseur (`0x7C128` jamais appelée par les scénarios : dans la démonstration, aucun concurrent
n'est assez riche) et l'attente en partie à plusieurs.

### 11.14 Les feux d'artifice

Réécrits dans `moteur/jeu/catalogues.js`. La touche `F` (PARC ▸ FEUX D'ARTIFICE) les allume par
`0x6D4B7` (graine `0x30F5` si elle est nulle, tableau vidé, première fusée) ; tant que l'octet
`+0x77` du parc est levé, la boucle appelle `0x6D508` à chaque image, et le pas de simulation les fait
payer (5 par pas). **Un système de 1 000 particules** en tableaux parallèles : `0xD8BA4` le nombre de
places occupées, `0xDE1B0` le nombre de vivantes ; x, y, z en 65 536es de pixel (`0xD8BA8`,
`0xD9B4C`, `0xDAAF0` + 4i) ; les vitesses (`0xDD20A` + 2i, `0xDBA94` + 4i, `0xDD9DC` + 2i), dont
chaque pas avance de 16 fois, la pesanteur ajoutant `0x80` à la vitesse en y ; la vie restante
(`0xD7C00` + 4i) ; la sorte (`0xDCA38` + 2i, 0 place libre ; bits bas 1 étincelle, 2 fusée, 3 bombe ;
bit 3 le scintillement, bit 4 le clignotement blanc `0xF1` sous 7 pas de vie, bits 5 à 8 la gamme
de couleurs, 16 × gamme + éclat + 1). **La projection** : vers le centre (320, 200), d'un facteur
(1 024 − z / 32 768) / 1 024.

**Le tir** (`0x6D508`) : une chance sur 34 de lancer (`0x6D985`), par `0x6D6A8`, une fusée depuis le
bas de l'écran — une fois sur quatre, une bombe depuis le centre ; bruitages `0x1B` et `0x20`. En vol,
une fusée laisse une traînée d'étincelles `0x21`, une bombe `0x31`. Morte, la fusée éclate en une
gerbe de 120 étincelles scintillantes d'une couleur tirée au sort (`0x6E5FD`), la bombe en huit
fusées (`0x6D55D`). `0x6E4BA` ajoute une particule, `0x6DEF3` fait avancer et vieillir, `0x6D9D8`
projette et dessine, `0x6E673` tasse le tableau quand plus de 400 places sont mortes. **Le hasard
des feux** (`0x6E7B2`) est à part : graine `0xDE1AE` × `0x24A1` + `0x24DF` sur 16 bits, modulo n.

**Anomalies reproduites.** L'écart en z d'un lancement penche vers le fond (on retire r au lieu de
r + 1 000) ; le test « vitesse de la bombe > −15 000 » ne peut être vrai ; la vitesse d'une
étincelle ignore z, et les gerbes sont des cylindres, pas des sphères ; le tassement va une place
trop loin, et une place d'un spectacle précédent peut revenir, l'allumage n'effaçant pas les
sortes ; quand une fusée éclate, le tableau est tassé au milieu du parcours, et la particule qui
prend sa place n'avance pas à ce pas-là. **Non établi** : les octets `0xDE1B2` à `0xDE1B4`, remis à
zéro à l'allumage.

### 11.15 Les voies, les wagons et les tracés

Réécrits dans `moteur/jeu/voies.js` et `moteur/jeu/poses.js`.

**Les morceaux de voie** (objets de type `0x12`, un par case) : `+0x05` bit 4 la hauteur imposée
(les rails de la gare) ; `+0x0A` l'objet graphique ; `+0x0C` la forme ; `+0x16` le genre de voie
(ligne d'images, table `0xB4397`, 10 octets par genre) ; `+0x44` la forme dessinée, prise dans
`0xB8C25` ou `0xB8C2F` selon l'écart avec le voisin du nord ou de l'ouest ; `+0x79` la hauteur, de 0
à 14 ; `+0x7A` le premier wagon posé dessus ; `+0x90` un second objet graphique. **Les directions**
sont des bits : 1 le nord (−64 cases), 2 l'est (+1), 4 le sud (+64), 8 l'ouest (−1) ; `0xB4B2A`
donne le pas en cases, `0xB8C35` la direction opposée, `0xB7B21` les sorties de chaque forme,
`0xB7AEA` deux directions de départ par forme, `0xB8BB0` les extrémités, `0xB8C11` la forme d'après
ses sorties. **Les formes** : 1 à 4 les virages (nord-est, est-sud, sud-ouest, ouest-nord), 5 et 6
les droites nord-sud et est-ouest — les seules qui montent ou descendent —, 7 à `0xA` les bouts
ouverts à l'ouest, à l'est, au sud et au nord, `0x13` à `0x16` les loopings ; `0xB` à `0x12` ne se
règlent pas en hauteur (le § 10.6 les appelle « pentes » : à trancher). **Suivre une voie** : on
part d'un morceau dans ses deux sens à la fois ; la direction suivante est celle des sorties qui ne
ramène pas en arrière ; on s'arrête quand les deux sens se rejoignent (voie fermée) ou sont au bout.

**Élever ou abaisser** (`0x2A2F1(cellule, écart)`, clic sur un rail avec l'outil 10) : le morceau
change de hauteur (`0x2A2B1`, qui refuse une hauteur imposée différente), puis ses voisins suivent —
une pente (forme 5 ou 6) peut garder deux crans d'écart, un autre morceau se met de niveau. Si un
morceau à hauteur imposée devrait bouger, tout est défait et chaque pente reprend son image. Rend 0
(pas de morceau), −1 (hauteur hors de 0 à 14), 1 (fait, bruitage 9) ou −2 (défait) ; l'écart 0 ne
fait que remettre les voisins d'accord. Quand l'abaissement rend −1, le bouton droit **retire le
rail** (`0x2C6B8`) : les deux voisines perdent leur sortie vers lui, puis la voie est remise
d'accord (`0x2A2F1` écart 0) ; les rails marqués (`+3` bit 8) n'y passent pas, les pièces spéciales
vont à `0x2C913` (défaire un looping, § 11.17).

**Les wagons.** `0x41936`, à l'ouverture d'une attraction à train, vérifie que la voie compte au
moins autant de morceaux que de wagons, puis crée les wagons (type `0xE`) ; `0x41EB4` les ôte à la
fermeture, en parcourant `+0x45` puis `+0x61` (`0x18B62` efface chaque fiche ; un wagon à l'état
`0xC` remet à 0 le mot `+0x7A` de l'objet que désigne son `+0x7E`, le passager vraisemblablement).
Champs d'un wagon : `+0x12` le sens, `+0x16` l'attraction, `+0x20` le rang, `+0x45` la tête du
train, `+0x61` le suivant. Tables : `0xB4B14` un bit de direction vers un sens, `0xB4B21` le côté
opposé, `0xB8FCC` le sens de départ, `0xB4399` les formes par sorte de voie (l'octet +0x11 donne les
raccords). `0x439DC` dit si une case porte un rail ; `0x4395B` annule la case marquée des comptes
(signe de `+0x5CC` changé, `0x2A2F1`, puis `+0x5CA` rendu négatif).

**Le défilement pendant un tracé** (`0x47268`, § 6.7) : si la demande en cours
(`[0xD4401 + 6 × joueur]`) est un tracé — sortes 2, 4, 6, 8, `0x12`, `0x1E` —, le pointeur est
enfermé dans la vue, le sens `0xB14E8` décidé, et la caméra avance d'une case. **Les autres
poses** : `0x40DA6` (demande `0x0E`, § 11.5) pose un arbre ou un décor ; `0x28E5A` pose une
barrière de file (outil 3) ou en calcule l'aperçu, en deux passes (kiosques voisins, puis files
voisines) ; `0x3302A` envoie le mécanicien libre le plus proche (type 8, état 8 ; distance en
colonnes plus rangées), qui passe à l'état `0x12` et vise le kiosque d'entrée `+0x49`, son numéro
allant dans l'attraction (`+0x4D`) ; `0x31D32` est au § 11.5 ; `0x2DEF8` efface la demande de sortie
(`0xD6688`).

**Anomalies reproduites.** `0x2A2F1` : un rail manquant pendant le relevé des hauteurs fait appeler
`0x2DEF8`, qui efface la demande de sortie du parc, puis la hauteur est lue à l'adresse `0x79` ; le
réglage des voisins ne vérifie pas que la case porte un rail et peut écrire l'octet `0x79` ; les
hauteurs sont notées dans un tampon de pile de 1 200 octets sans contrôle (la réécriture s'arrête
sur une erreur au-delà) ; une hauteur −1 ou −2 n'est jamais « égale » et un morceau libre la reçoit
telle quelle (`0xFF`, `0xFE`). `0x2C6B8` ne teste pas la voisine sans rail (écritures sur l'objet
nul, octets `0xA`, `0xC`, `0x44`) et fait une comparaison d'octets dont le résultat est perdu.
`0x31D32` a un test dont les deux branches donnent `0x40`. `0x15FBD` passe à `0x41936`
`0xCCED0 + genre` sans multiplier par 200 : le test du genre `0xDB` y lit un octet sans rapport. Dans
`0x41936`, un sens −1 relance la recherche parmi les voisines, le premier wagon ne vérifie pas la
forme de son morceau, les suivants qu'un morceau suit, et faute de place dans la table des objets un
wagon est sauté. `0x47268` : la colonne minimale de la caméra est 4, la rangée descend à 0 ; sans
barre d'outils, les bords de la vue sont lus dans des variables locales jamais écrites. **Non
exercé** : l'échec −2 de `0x2A2F1` et la défaite qui suit ; la branche du genre `0xDB` de `0x41936` ;
`0x47268` sans barre d'outils. **Non établi** : pourquoi `0x28E5A` fait de l'objet `+0x49` du kiosque
un objet de type `0x1C`. **Établis depuis** : les champs `+0xC0`, `+0xC2`, `+0xC4` d'une attraction
de genre `0xDB`, le chaînage des gares du monorail (§ 10.17) ; la sorte de demande `0x1E`, le circuit
de voitures (§ 11.17).

### 11.16 Les ressources, les fichiers, les banques d'images et le texte

Réécrits dans `moteur/jeu/amorcage.js`, avec les fichiers de `moteur/jeu/systeme.js`.

**Les noms de fichiers** : quatre tables, une fiche par fichier, le nom en tête, et un octet d'origine
— 1 le dossier d'installation `[0xD3BDE]`, 2 celui du CD `[0xD3BBC]`, autre : le dossier courant :
`0xB0B6C` (`data/mspr-0.inf`…), `0xB105C` (`data/lang0-0.dat`…), `0xB13C1` (`data/mpanel-0.dat`…),
fiches de 0x4F octets, origine en +0x4E ; `0xB7F8C` (`data/mpalette.dat`…), fiches de 0x3F, origine
en +0x3E. Une fiche au nom vide termine la table. `0x11921` les préfixe toutes par `0x11A51`
(`sprintf("%s%s")` dans un tampon de 52 octets, puis `strcpy` en place).

**Les ressources** (`0x5F550`, `0x5F63F`, `0x5F76D`) : une fiche de 0x4F octets — +0 le nom (0x3E
octets ; « * » pour un simple bloc de mémoire), +0x3E l'adresse du pointeur où ranger le bloc,
+0x42 celle d'un pointeur de fin (facultatif), +0x46 la taille, +0x4A des drapeaux, dont le bit 0
choisit le tas du jeu (`0x7E9B8`, § 9.2) plutôt que `malloc` ; une table se termine par une fiche au
pointeur nul. `0x5F63F` rend 1 si la ressource est en place, 0 si le fichier est absent, vide ou mal
lu, −1 si la mémoire manque ; `0x5F76D` la rend et oublie le pointeur.

**Les fichiers.** `0x1180E` charge un fichier : si sa taille une fois décompressée (`0x7F4B0`) diffère
de sa longueur (`0x7F57D`), par `0x7F0B0`, qui le lit puis le décompresse, sinon par une simple
lecture. **Le format RNC** (Rob Northen Compression) : « RNC » et l'octet 1, puis la taille d'origine
en gros-boutiste ; le dépaquetage (méthode 1) est `0x87B2C` (§ 12.3). `0x115DB` est `access(nom, 0)`.
Les rouages (`moteur/jeu/systeme.js`) : `0x7EB70` ouvre (avec création en mode `0x222`), `0x7EBE0`
lit, `0x7EC20` ferme, `0x7ED80` écrit, `0x7F45A` est `access` (int 21h `4300h`), `0x82E64`,
`0x82F13` et `0x82FF8` les rouages de `fopen`, `0x7E83E` un `fprintf(stderr, …)`. `0x1095C` lit la
configuration de la musique puis celle des bruitages (§ 9.1).

**Les banques d'images.** Six banques ; `0x10C80` reloge une table d'images (ses décalages deviennent
des adresses) et, en 320x200, **double** les dimensions au chargement ; `0x10CE4` les divise par
deux ; `0x1036D` et `0x1041A` l'appliquent aux six. Le relogement n'est pas idempotent : relogée
deux fois, une table dessine autre chose, ce qui oblige la comparaison appel par appel à remettre
les banques entre ses deux exécutions (journal des essais, § 5.8). `0x18B62` retire un objet des
listes puis met sa fiche à zéro ; `0x1188C` trace un rectangle plein ; `0x117B3`, `0x11BD5` et
`0x11AF4`, en assembleur, rendent tous les registres ; `0x5ED0C` est l'enveloppe du traceur en
320x200 (§ 6.5).

**Le texte**, autour de la routine `0x3F49E` : `0x3F677` et `0x3F714` mesurent un texte dans chacune
des deux polices ; `0x3F336` l'écrit aligné à droite, `0x3F377` centré, `0x3F3DA` centré à chasse
fixe ; `0x3F7BD` l'écrit dans **la grande police**, celle des titres des écrans de gestion (table
`0xB50C1`), avec la vague des titres (`0xB8CC0`, `0xB8CDC`) et la silhouette ; `0x3F296` compare
deux mots pour le tri des classements (ordre décroissant).

**Anomalies reproduites.** `0x10C80` double les dimensions sur un octet : 128 ou plus déborde.
`0x1180E` teste l'échec de l'ouverture contre 0, alors que la bibliothèque rend −1, et ne referme
pas un fichier de taille nulle. `0x5F63F` perd la mémoire d'un fichier mal lu et met à zéro le
pointeur de fin sans vérifier qu'il existe. `0x11AF4` divise sans signe en 640x480 (un enfoncement
négatif rend l'image invisible) et réduit modulo 256 les lignes sautées en 320x200. `0x3F714` rend
des 16 bits hauts faux (les appelants ne lisent que le mot bas). Les tables de la vague font 28
octets : un titre plus long déborderait (non atteint). `0x3F3DA` rend dans `eax` l'adresse d'une
variable locale, que la réécriture ne rend pas (ses deux appelants ne la lisent pas). `0x7F4B0`
prend le descripteur de fichier 0 pour un échec. **Non établi** : que `0x7EB70` rende bien −1 en cas
d'échec (admis). **Preuve** : `0x5F550`, `0x5F63F`, `0x1180E` et `0x1B6A8` lisent l'en-tête d'un
fichier dans un tampon local sous leur point d'entrée, donc à une autre hauteur dans la
transcription et dans la réécriture ; le comparateur y voyait de fausses divergences, qu'une
réécriture « identité » produisait tout autant, et il exclut désormais les lectures dans la pile.

### 11.17 Les outils de pose

Réécrits dans `moteur/jeu/outils.js` (16 fonctions, voisines de celles de `construire.js`). Chaque
outil (le mot `0xD6670`) sert de trois façons : le survol de la vue du parc (`0x149A4`) en demande
l'aperçu, argument de pose nul (la fonction rend l'image qu'elle poserait sans rien écrire) ; la
file des événements (§ 11.5) l'exécute ; vider une case (`0x205D7`) appelle son contraire.

| Outil | Ce que c'est | Où on le prend | Demande | Pose | Contraire |
|---|---|---|---|---|---|
| 4 | la rivière (RIVIERE, fiche d'attraction 7) : sols `0x8B` et suivants ; sous une allée ou une file droite, la case devient un pont | catalogue des attractions | `0x08` | `0x29340` | `0x2C2EC`, `0x2C4E5` |
| 12 | le lac, 3 × 3 cases (LAC, 2 000 ; fiche `0xA` de `0xCCA92`) : sols `0xB8` et suivants, drapeau `0x800` | catalogue des décors | `0x16` | `0x412E0` ; aperçu `0x416EA` | |
| 13 | une flèche de sens unique sur une allée (l'article à 200) | catalogue des chemins | `0x18` | `0x2B576` | effacée avec l'allée (`0x2BA40`) |
| 14 | un panneau indicateur (type `0x14`, état 8) et ses trois flèches (PANNEAU, 220) | catalogue des chemins | `0x1A` | `0x2B62F` | |
| 15 | une installation (type `0x18`) de la fiche `[0xD6646]` : la VESPASIENNE, fiches `0xF` à `0x12` de `0xCCA92` | catalogue des décors | `0x1C` | `0x40E92` | `0x4121E` |
| 16 | un circuit : sols `0xCD` et suivants, sur sol nu seulement | catalogue des attractions (CIRCUIT AUTO, fiche 8) | `0x1E` | `0x29686` | `0x2C2EC`, `0x2C4E5` |
| 18 | un looping sur 3 morceaux de voie droits (est-ouest) ou 4 (nord-sud), payé comme une attraction : LOOPING et TIRE-BOUCHON (fiches `0xA`, `0xB`) sur trois rails droits (forme 6) d'une voie de genre 2, celle des MONT. RUSSES ; MEGA SPLASH (fiche `0x11`) sur une voie de genre 1 | catalogue des attractions ; en 640x480, par la fiche d'achat (écran `0x36`, coche en (590, 332)) | `0x20` | `0x29E03` | `0x2C6B8` puis `0x2C913` |
| 19, 21 | reposer l'employé porté au centre d'une case ; envoyer un mécanicien (zone 19, employé à l'état 8) | zones 20 et 19 | `0x22` | `0x348ED` | |
| 20 | une étape de la tournée de l'agent d'entretien (§ 10.13) | zone 21 | `0x2C` | `0x64CF5` | zone 17 |

S'y ajoutent, pour défaire, `0x2B955` (un mur : les voisins perdent leur raccord), `0x2BA40` (une
allée : herbe, ou eau si c'était un pont ; les installations voisines se réorientent, les allées
se raccordent de nouveau, la flèche est effacée), `0x411AA` (un décor fixe, mot +0 de la cellule
négatif) ; `0x2C2EC` et `0x2C4E5` ôtent une case d'eau — rivière ou circuit, drapeau `0x40` — et
ses voisines perdent leur sortie vers elle (la seconde sans vérifier que la voisine est de l'eau) ;
`0x2C913` rend la voie droite (formes des loopings : `0x13`/`0x14` est-ouest, `0x15`/`0x16`
nord-sud), et la fiche du looping perd une attraction et son coût sort des dépenses.

**Les sols** (`0xB44D9`, mot de drapeaux) : 1 mur, 2 allée, 4 attraction, 8 file, `0x40` l'eau
(rivière et circuit), `0x800` un lac, `0x8000` les installations voisines s'y orientent. Une famille
occupe des images consécutives, une par forme : rivière `0x8B`, circuit `0xCD`, lac `0xB8`, sol
d'une installation `0x67`. **L'octet +3 d'une cellule**, outre les déchets (§ 6.2) : 8 case réservée,
`0x10` un panneau, `0x20` une flèche de sens unique, bits 6-7 sa direction. **Le panneau** : les
directions de ses trois flèches en `+0x66`, les objets montrés en `+0x69` (attraction), `+0x6B`,
`+0x6D` ; il prend pour cible l'objet que désignent les comptes (`[0xD3814] + 0x2C8`). **Tables** :
`0xB8F44` les 9 cases du lac (10 octets chacune), `0xB8FBE` l'emprise d'une grande installation (6
cases à l'état 4), `0xB8BB0`, `0xB8C01`, `0xB8BD8`, `0xB49C1`.

**Anomalies reproduites.** `0x29340` et `0x29686` comparent la borne haute des sols de circuit
(`0xD8`) au sol de la case posée, pas à celui de la voisine : sur un sol `0xD8` ou plus, les deux
tests s'inversent. `0x29E03` ne vérifie le genre de voie (fiche `+0x16` contre `+0xB4`) que pour le
looping est-ouest, et prend une hauteur 0 pour « pas encore vue », si bien que les hauteurs 0, 5, 5
passent. `0x2C913` ne rembourse rien au livre, et retrouve la fiche du looping par son mot `+0x22`
(`0x108`, `0xAF` ou `0xB0`) alors que la pose accepte n'importe quelle fiche non est-ouest pour un
looping nord-sud. `0x2B62F` lit tel quel un numéro de flèche (`[ebp-0x14]`) jamais initialisé pour un
objet ni attraction, ni boutique, ni de type `0x14`, et sa boucle qui efface les flèches d'un panneau
neuf efface trois fois la même (la réécriture ouvre le cadre de l'original pour lire le même mot ;
`0x205D7` a la même anomalie, § 11.5). `0x2B576`, sur une case sans flèche, rend `0xFFFF` dans son mot
haut. `0x412E0` n'inscrit le prix du lac qu'une fois, quel que soit le nombre de cases ajoutées, et ne
compte jamais la case du centre dans `+0x7E`. **Non établi** : la borne `0xD8` ; où se paie une
installation (`0x40E92` ne paie rien) ; l'objet que désignent les comptes ; l'octet `+0x31` de la
fiche de décor, recopié dans le mot `+0x14` de l'installation ; si le circuit de l'outil 16 est celui
des voitures (le compositeur l'a pris au CIRCUIT AUTO) ou un circuit d'eau (le rapport du module). **Non
exercé** : la branche MEGA SPLASH de `0x29E03`. Scénarios : `outils-basse` (251 s, 320x200) et
`outils-haute` (316 s, 640x480), et `entretien` pour `0x348ED`.

### 11.18 La carte du parc, le relevé bancaire et « démolir ? »

Réécrits dans `moteur/jeu/carte-du-parc.js` (8 fonctions, avec l'écran du bus `0x78CEF`, § 10.6,
sa voisine dans le programme). Dans la table des fenêtres `0xB762D`,
l'octet `+0xA` est l'écran : la fenêtre 5 ouvre l'écran `0x40`, `0xB` l'écran `0x12`, `0x12` l'écran
`0x48`.

**La carte du parc** (écran `0x12`, bouton de la zone 10, `0x1788D` en `0x17B6A`). `0x40641` prépare
le fond (`data/mmap-0.dat`) : chaque case de la grille 64 × 64 y devient un petit rectangle de la
couleur de son sol (octet +2 de `0xB44D9`), 8 × 4 pixels dans les deux résolutions (largeur et
hauteur de tuile divisées par `[0xD6640]` et `[0xD6642]` : 6 et 8 en 320x200, 3 et 4 en 640x480), la
vignette commençant en (`0x40`, `0x4C`). `0x3F975`, à chaque image, remet le fond, dessine en vue
réduite (`[0xD667C]` = 8) tout ce qui est posé, case par case dans l'ordre des listes — les objets
par la routine de leur type, décalés de leur position dans la case réduite par les diviseurs ; un
décor fixe par sa figure ; les types 6 et `0x18`, sans routine, avancent leur animation et se
dessinent au milieu de la case —, le nom du parc, puis le cadre pointillé clignotant de la vue
(`0xD77CE`), sous le pointeur s'il est dans la vignette, borné à elle. Un clic dans la vignette y
porte la vue et ferme la carte ; hors d'elle, la carte reste ouverte, le bouton de la barre
d'outils la referme. `0x1F53E` dessine en réduction un morceau de voie : son pilier, un point tous
les 4 pixels de sa hauteur, puis la forme au sommet (`0xB7E3F`, 13 octets par forme).

**Le relevé bancaire** (écran `0x40`, « MIDLAND LIVECASH », fond `data/mstate-0.dat`, palette
`data/mstap-0.dat`) : ouvert par un clic droit sur l'argent (zone 13), par le menu ou par la commande
`0x09` des écrans (§ 11.7) ; `0x77A55` l'ouvre, `0x77B08` le dessine à chaque image. Sa mise en page,
table de 11 octets par élément en `0xBE511` (+0 le genre, +1 x, +3 y, +5 largeur, +7 hauteur, +9 un
texte), finie par un genre nul : 1 le nom du parc, 2 un texte, 3 les lignes du relevé (les quatre
éléments suivants en donnent les colonnes : libellé `[0xD7BB0]`, débit, crédit, solde), 8 le solde
final ; 4 à 7 et 9 (le bouton de sortie, en `0xBE575`) ne se dessinent pas. On le ferme par ✓, Entrée
ou Espace ; en 640x480, il s'affiche en 320x200.

**« Démolir ? »** (écran `0x4A`, par-dessus la vue du parc) : le clic droit sur une attraction, une
boutique ou un kiosque avec l'outil question poste la demande `0x24` ; `0x205D7` ouvre l'écran, et
`0x78B7E` pose la question (`0x78F89`) avec le nom de l'objet pour titre et, pour texte, le texte
`0x11B` où s'inscrit la valeur de l'objet (5 000 pour les tasses) — ou `0x11C` si son mot `+0x38`, le
prix encore dû, n'est pas nul. Oui démolit : `0x31748` une attraction (§ 10.3), `0x35C4A` une
boutique.

**Effacer une file** (`0x2BCEE`, appelée par `0x205D7` et par `0x193FD` sur une case de file) : le
sol remis à 0 — une file « à part » (drapeau `0x40`) redevient allée `0x90` (ouvertures 5) ou `0x91`
(`0xA`), ses bouts pris à l'image `0x7F` ou `0x7E` — ; aux deux bouts (`0xB8BB0`), la voisine perd son
raccord (`0xB49D3`, `0xB8C35`, `0xB8BEF`), sauf si ses drapeaux valent exactement `0x48` ; les
visiteurs de la case repartent (`0x22834`, état 6), ceux d'après passent à 0xA, tous quittent la
chaîne de la file (`+0x1E`) ; un kiosque voisin tourné vers la case est retourné vers une autre file.

**Anomalies reproduites.** `0x1F53E` : pour un genre autre que 1, 2 ou 3, la couleur est un reste de
sa variable `[ebp-0xC]`. `0x77B08` : le solde négatif a sa propre couleur, qui vaut 0x5A comme
l'autre. `0x78B7E` : pour un autre type, titre et texte sont des restes (`[ebp-8]`, `[ebp-0xD0]`).
`0x2BCEE` : `0x22834` et l'objet graphique sont appliqués au premier visiteur de la case autant de
fois qu'il y en a ; la recherche d'une file voisine du kiosque n'examine jamais le nord ; la chaîne
coupée, la recherche reprend à l'objet 0. `0x3F975` : en 320x200, la branche 480 lignes est morte.
**Non établi** : la position passée à la routine de chaque objet (elle rajoute vraisemblablement le
décalage entier) ; `0x3D72B`, appelée à la fin. **Vérification** : le module n'a pas rendu de rapport
de lot ; ses fonctions sont exercées par `ecrans-pleins`, `outils-basse`, `outils-haute`,
`horza-objets` et les parties longues, et comprises dans le rejeu d'ensemble.

### 11.19 Les nouveautés, la neige et la foudre

Réécrits dans `moteur/jeu/nouveautes.js` (6 fonctions). **L'écran des nouveautés** (`0x48`, fenêtre
`0x12`) : la fin d'année (`0x7401C`) l'ouvre pour chaque genre qui devient disponible, seulement si
l'écran des trophées a été fermé par un clic (1 000 images sans geste le sautent) et jamais au niveau
2 (§ 7) ; la zone 22, allumée par une découverte de la recherche, l'ouvre aussi, par la boucle du
parc (non exercé). Dans la démonstration tous les genres sont déjà marqués (bit 0 de `+0xC5` ou
`+0x66`) : il faut une nouvelle partie (`negociations`, niveau SIMPLE : LABYRINTHE et FRITES à la fin
de l'année 1 ; `longue-nouveautes`, MATERNELLE). `0xD6614` dit la sorte (4 attraction, `0xA`
boutique), `0xD6610` le décalage dans le catalogue. `0x3A8EF` dessine une image : pour une
attraction, le prix, l'attrait, la fiabilité (durée × seuil / 16 384, lus dans la fiche de référence
`0xB17A0`, 200 octets par genre ; au plus 9, texte `+0x20` pour une durée nulle) et la capacité ; pour
une boutique, le prix ; puis le nom du genre et sa description ; il efface le bit « à annoncer »
(2) de la fiche. Une seule zone, (568–616, 318–348), invisible.

**La neige** (`0x47A27(flocons, vent, table)`, bit 1 de `[0xB14CC]`, vent `[0xB14CB]`) : un flocon
tient en 7 octets (x, y, vitesse 1 à 3, retard, compteur) ; il tombe, se balance de |y mod 16 − 8|
plus le vent, et renaît en haut après la ligne 400 ; couleurs par vitesse en `0x47A23` (00 9D 9C F2).
En 640x480, le point est aussi marqué dans la grille des blocs. **La foudre** : `0x47606` appelle
`0x47E39(10, hasard mod 27, 5)` : un tronc, puis `longueur` zigzags, et après chacun, 4 fois sur 10,
une branche de longueur / 2 segments, couleur `0xF2` ; `0x481C5` rend un écart signé au hasard
(0 à amplitude − 1, négatif 9 fois sur 20).

**Le démontage d'une voie** (`0x44C91`, appelée par `0x31748`) : pour une attraction à train autre
que le monorail, deux marches partent de la gare dans les deux sens, comme la note d'une voie
(`0x43689`, § 11.5), retirent chaque rail et effacent le sol de voie (tables `0xB7AEA`, `0xB7B18`,
`0xB7B21`, `0xB4B2A`, drapeau `0x400`).

**`0x19ED3`** appelle `0x2DEF8` puis rend 1 : une vingtaine d'états de visiteurs et d'employés
l'appellent à la place d'un délai ou d'une division par une vitesse nulle, environ 324 000 fois en
350 s de `longue-simulation` ; chaque appel **efface la demande de sortie** du parc (`0xD6688`),
posée par `0x1A836` ou la file des événements et relue par `0x11C45` (§ 10.9).

**Anomalies reproduites.** `0x3A8EF` teste « pas d'élément » après avoir ajouté `0xB` au retour de
`0x408D3` (le test ne peut partir ; sans conséquence, le repère `0x98` existe toujours) et, pour une
boutique, avance trois fois le pointeur d'élément pour rien. `0x47A27` dessine un flocon sorti à
droite à son ancienne abscisse, au-delà de 640, et à sa nouvelle hauteur, et lit la couleur dans une
copie de 4 octets faite dans ses variables (une vitesse au-delà de 3 lirait d'autres variables ;
`0x4790C` n'en donne jamais). `0x44C91` : une marche revenue sur sa case de départ sans rail avance
sans vérifier sa direction et ajoute le pas de la direction 0. `0x47E39` écrit dans les emplacements
de ses propres arguments ; la réécriture ne le fait pas, l'appelant ne les relit pas. **Non établi** :
les intitulés `0x3BC`, `0x3C0`, `0x3B8` ; si une demande de sortie est réellement perdue quand un
objet l'efface avant que la boucle la relise ; `0x2DEF8`, peut-être le reste d'une routine de
signalement d'erreur.

### 11.20 La fin de partie : la faillite et le rachat

Réécrite dans `moteur/jeu/faillite.js` (12 fonctions). `0x5C7D1(genre)` joue la séquence : 1 la
faillite (BUSTED, morceau `0x16`), par la fin d'année (`0x729D8`, § 10.12) ; 2 le rachat (TAKEOVER,
morceau `0x14`), par l'achat d'une action (`0x4A571`, `economie.js`), quand l'acheteur est le joueur
courant et détient alors toutes les actions du parc acheté : le programme compare le rang de la
fiche de l'acheteur à `[0xD665C]`, puis le total des actions du parc (`+0x62`) à celles de l'acheteur
(`+0xA3` + 2 × numéro du parc) — le joueur a racheté un concurrent. Ce n'est pas un concurrent qui
prend le parc du joueur, comme le disait l'en-tête de `faillite.js`, corrigé. `0x5C7D1` ne joue que
l'animation, puis rouvre l'écran d'avant. Écran plein, une image par tour,
arrêt au clic ou à une touche, puis l'attente de la fin de la musique, et l'écran d'avant rouvert.

**Les fichiers** : `data/busted.dat`, `buspal.dat`, `busted.anm` ; `data/takover.dat`, `takpal.dat`,
`takover.anm`. Le `.dat`, compressé (`0x7F0B0`) : « MINA », 5 octets, le nom terminé par un zéro,
puis la toile, 320 octets par ligne. Le `.anm`, brut, lu à sa suite : un mot, le nombre d'images,
4 octets, puis des blocs FLC d'Autodesk Animator — `0xAF12` l'en-tête, `0xF1FA` une image, sous-blocs
7 (delta par lignes, SS2), `0xF` (plages, BRUN), 4 (palette, sautée). Le tout est chargé dans la
mémoire des sprites du parc (`[0xD3BA8]`) ; `0x5BBC6` la relit ensuite dans `data/mspr-0.dat` sur la
longueur écrasée, recharge `mpalette.dat` et `mpanel-0.dat`, et revient en 640x480.

**Le lecteur.** `0x5B88D` passe en 320x200 (noté en `[0xBA0FC]`), éteint l'image, charge, lit la
palette, montre l'image de départ, fait monter la palette en 8 étapes, rend le nombre d'images.
`0x5BD48` vérifie « MINA » et remplit **la fiche d'animation**, 16 octets dans `[0xD3B4C]` désignée
par `[0xD35B0]` : +0 la toile, +4 le début, +8 l'image suivante, +C le nombre d'images, +E le numéro.
`0x5BE27` avance d'une image et recopie la toile ; `0x5C6F4` fait avancer une table de fiches.
Variables du lecteur `0xD78A0` à `0xD78AC`, du décodeur `0xBEDE0` à `0xBEDF2` (`0x81EAC` la taille de
la toile, `0x81EC9` les blocs, `0x81F54` les sous-blocs, `0x8203D` le delta). **Le fondu**
(`0x7F1D0`) : palette de départ `0xDE698`, cible noire `0xDE998`, étape `0xDEC98`, pas-à-pas en cours
`[0xBED54]` ; `0x87ED4` lit les 768 octets du DAC (ports `0x3C7`, `0x3C9`). En 320x200 d'origine,
l'animation n'avance qu'un tour sur quatre ; venue du 640x480, à chaque tour.

**Anomalies reproduites.** `0x5C7D1` : pour un genre autre que 1 ou 2, les trois noms de fichiers
sont des restes de pile (`[ebp-0x18]`, `[ebp-0x10]`, `[ebp-0xC]`), lus dans le cadre de l'original ;
le numéro d'image est pris sur un octet (au-delà de 255 images, seul le clic arrêterait). `0x5B88D` :
un `.anm` introuvable garde en `[0xD78A0]` la taille précédente ; sans « MINA », le nombre d'images est
celui d'une fiche d'avant. `0x5BD48` : l'indice d'animation n'avance jamais, une seule est lue.
`0x5C6F4` : compteurs sur un octet (un nombre d'images nul ferait 255 tours). `0x5BBC6` : deux
branches font le même appel. `0x81EC9` : un bloc inconnu rend 0, pris ensuite pour une adresse.
`0x8203D` : après la commande « dernier pixel » (10xxxxxx), le mot de commande sert de nombre de
paquets ; un nombre de lignes nul en ferait 65 536. `0x7F1D0` : un nombre d'étapes nul divise par
zéro ; la cible nulle est remplacée par `0xDE998` dans l'argument même, sur la pile de l'appelant.
L'affichage de la toile en 640x480 est une branche morte. **Non établi** : les 4 octets qui suivent
le nombre d'images ; l'emploi de « dernier pixel » par les animations du jeu. **Non exercé** : le
rachat ; seul `longue-faillite` joue la séquence, une fois — la faillite, vraisemblablement, puisque
la partie finit à la fin d'année.

### 11.21 La sortie du programme

Réécrite dans `moteur/jeu/sortie.js` (22 fonctions), prouvée par le scénario `quitter` (la
démonstration, puis F6). **L'ordre** : la boucle du parc (`0x11C45`), `0xD6688` levé, appelle
`0x185B0` — une fonction vide — et rend la main au `main` (`0x10010`), qui appelle :

1. `0x108B1`, la fin : si la souris du jeu est installée (`[0xBECB4]`), la minuterie est rendue
   (`0x5CB6C`, § 6.9) ; en jeu normal la souris est arrêtée (`0x7E0E1`) ; avec `-r` ou `-p`
   (`[0xBECB2]` 1 ou 2) et un tampon de gestes (`[0xD3AEC]`), celui-ci est écrit dans `RECORD.GAM`
   (6 octets par image, `[0xD3AF0]` images), puis rendu au tas ; puis `0x7E874` (vide), l'arrêt du
   son (`0x10977`, § 9.3), et, si la minuterie a été rendue, le mode vidéo trouvé au lancement
   (`0x7E270` : int 10h, fonction 0, le mode `[0xDE5F4]` ; la structure des registres sur la pile,
   là où l'original la posait, l'hôte en lisant aussi les champs non remplis) ;
2. `0x10C2F`, en 320x200 ou en 640x480 seulement : les ressources de la table `0xB0B6C` rendues au tas
   (`0x5F7A5`, fiches de `0x4F` octets jusqu'au pointeur `+0x3E` nul, chacune par `0x5F76D`) ;
3. le retour au DOS : les trois vecteurs de nettoyage `0xBECC0` à `0xBECC8`, qui montrent tous
   `0x7E2A0`, un simple `ret` ; les routines de fin de Watcom (`0x87307`, `__FiniRtns`) ; le service
   `int 21h`, `4Ch`.

**Les routines de fin** : la table `0xCC802` à `0xCC808` n'a qu'une entrée de 6 octets (état,
priorité, adresse) ; elles sont exécutées de la plus haute priorité à la plus basse (à égalité, la
dernière de la table d'abord), une fois chacune (état 2), `es` reçu égal à `ds`. La seule est
`0x904C5` (`__full_io_exit`) : `0x904DF(0)` (`__fcloseall`) ferme chaque flot ouvert de la liste
`[0xE12A0]` — les cinq flots standard vidés et libérés mais leur descripteur laissé ouvert, sauf bit
`0x40` de l'octet `+0xD` —, chacun par `0x831A1` (`__shutdown_stream` : `0x83257`, puis `__freefp`) ;
`0x83257` (`__doclose`) écrit un tampon sale (`__flush`), replace le fichier à la position logique
du flot (`0x8B8B4` : `tell` plus ce qui attend dans un tampon sale, ou moins ce qui a été lu
d'avance), ferme le descripteur, rend un tampon alloué (`_BIGBUF`) et efface un fichier temporaire
(nom composé dans une variable locale de 16 octets, les appels partant de la hauteur de pile de
l'original) ; puis les maillons de la liste des flots fermés `[0xE0D08]` sont rendus au tas (le code
de `__purgefp`, en `0x8AC47`, rejoint par un saut). Les noms de Watcom sont reconnus à la forme du
code.

**Anomalie reproduite** : avec `-p`, le tampon relu est lui aussi réécrit dans `RECORD.GAM`,
jusqu'à l'image où la relecture s'est arrêtée : le fichier relu est tronqué à ce qui a été rejoué.
**Non établi** : `0x7E874` et `0x185B0`, points d'accroche vides. **Rangement** : `0x7EDC0` et
`0x7EE48` (le tas du jeu, § 9.2) appartiennent à `systeme.js`, les routines des flots à
`runtime.js`, et `0x815B8` (remplir des lignes de 640 octets, § 6.9), hors du chemin de sortie, à la
carte vidéo de `systeme.js` : elles attendent dans `sortie.js` d'y être rangées.

---

## 12. La bibliothèque C de Watcom et les tracés

Réécrits dans `moteur/jeu/bibliotheque.js` (le moteur de `printf` et les tracés, § 12.1),
`moteur/jeu/runtime.js` (le socle d'exécution : fichiers, flots, tas, démarrage, § 12.2 et § 12.3) et
`moteur/jeu/systeme.js` (les chaînes, `qsort`, les interruptions, § 12.4), et, pour `scanf`,
`moteur/jeu/sos-bruitages.js` et `moteur/jeu/sos-pilotes.js` (§ 12.5).

### 12.1 `printf` et les segments

**`printf`.** Le jeu est lié à la bibliothèque C de Watcom, et presque tout texte affiché passe par
`sprintf` (`0x7F652`, routine de sortie `0x7F63C`) ; `fprintf` (`0x87524`, sortie `0x8750A`) sert
deux fois par partie. Le moteur commun : `0x883DF` (`__prtf`, la boucle du format), `0x885FF` (la
largeur, la précision, le modificateur de taille, lues en entiers de 32 bits sans borne),
`0x888E1` (`__ptfmt`, la conversion d'une valeur, qui rend un pointeur lointain dans `edx:eax`),
`0x8875B` (`strnlen` sur un pointeur lointain), `0x8FB97` (`ltoa`) et `0x8FB4F` (`ultoa`). La
structure de travail, installée sous le point d'entrée de `__prtf` : +0 la destination, +4 la
largeur, +8 la précision, +0xC les zéros, +0x10 le compte, +0x14 les drapeaux, +0x15 la conversion,
+0x16 le caractère de remplissage, +0x17 le préfixe. La routine de sortie est appelée à la hauteur
de pile d'origine : `fputc` descend loin et écraserait sinon cette structure. Les scénarios
n'emploient que `%d`, `%s` et `%%` ; la précision (`%0.2d`) dans deux d'entre eux, la largeur, les
zéros et le cadrage à gauche dans `bourse` seulement.

**Les segments** sont du code de Bullfrog, doublé par mode d'affichage : les appelants choisissent
la version par `[0xDE5F6] & 1`. `0x81374` (basse résolution) et `0x8148C` (haute) tracent un
segment horizontal ou vertical `(x1, y1, x2, y2, couleur, drapeaux)`, en coordonnées de l'espace
logique de 640 de large ; la version basse résolution double les bords de la fenêtre pour les
comparer. `0x949BC` trace un segment quelconque `(x1, y1, x2, y2, couleur)` par la méthode de
Bresenham, avec découpe à la fenêtre ; c'est l'entrée basse résolution, qui divise d'abord ses
coordonnées puis prend les bords tels quels ; `0x949DA`, l'entrée haute résolution, partage son
corps. Tous rendent les registres intacts. `0xDE5D8` = haut + hauteur de la fenêtre, posé par
`0x87790` comme `0xDE5EC` = gauche + largeur (§ 6.5).

**Anomalies reproduites.** `loop` sur un compte nul fait 2³² tours : c'est le cas d'un segment
vertical de longueur nulle, et de la fusion d'un segment horizontal d'un pixel en basse résolution
(aucun appel ne le déclenche). `0x81374` et `0x8148C` ne posent pas le dernier pixel (le compte est
la différence des extrémités, sans + 1) et supposent x1 ≤ x2 et y1 ≤ y2. Dans `0x949BC`, plusieurs
comparaisons sont non signées sur des mots signés, et un quotient de découpe qui ne tient pas sur 16
bits aurait fait planter le processeur d'origine. `%S` prend pour longueur la valeur du premier
caractère ; un `%s` nul écrit une chaîne vide ; `ltoa(−2147483648)` s'écrit juste par accident
(`neg` ne change pas la valeur, qu'`ultoa` écrit en non signé). Le programme porte deux exemplaires
identiques de la table des chiffres (`0x8FB2A`, `0x8FBD3`), et `itoa`, `utoa` (`0x8FC40`, `0x8FBF8`),
jumeaux de `ltoa` et `ultoa`, que printf appelle pour `%o`, `%u`, `%x`, `%X` et `%d` avec une taille.

**Non vérifié par les scénarios** : `*`, `%n`, `%c`, `%o`, `%u`, `%x`, `%X`, `%p`, les flottants, les
chaînes lointaines, les drapeaux `#`, `+` et espace ; la fusion des segments (drapeau 4) ; la découpe
des obliques et les rejets de `0x949BC`, c'est-à-dire toutes ses divisions. Les formats du jeu ne
les emploient pas. Les aides de `%o`, `%u`, `%x`, `%X`, `%p` et `%ls` (`itoa`, `utoa`, `0x887AB`,
`0x88D1A`, `0x88784`) sont réécrites en attente et éprouvées appel par appel, par `sprintf` même
(`moteur/scenarios/bancs/bibliotheque-c.mjs`) ; un flottant mène à l'erreur « Floating-point support
not loaded » (`0x888CA`, puis `0x8FBC7`), qui met fin au programme — le programme n'a pas le code des
flottants. L'entrée haute résolution `0x949DA` est désormais réécrite, prouvée par
`catalogues` et `entrepot`. **Non établi** : ce que tracent
précisément les appelants (les courbes du graphique, § 11.7, et des cadres et séparateurs,
vraisemblablement).

### 12.2 Le tas DPMI de Watcom

Réécrit dans `moteur/jeu/runtime.js`, le socle d'exécution : la bibliothèque C de Watcom 9.x
(« WATCOM C/C++32 Run-Time system », chaîne de `0x7E2CE`). Les noms de Watcom donnés ici sont
reconnus à la forme du code et aux constantes (drapeaux `O_*`, codes errno) ; le programme n'a pas
de symboles. **Les services** : ces routines appellent directement le DOS (int 21h), le DPMI (int
31h) et le BIOS (int 16h) ; la réécriture fait rendre le même service par l'hôte, dans le même ordre
et avec les mêmes registres, car chaque service coûte du temps virtuel et livre les interruptions en
attente — un service de plus ou de moins décalerait la partie. L'idiome `rcl eax, 1 ; ror eax, 1`
range la retenue (l'échec) dans le bit de signe du résultat.

**Les régions.** Watcom tient sa mémoire en régions obtenues du DPMI (`0x90151`, blocs de mémoire
étendue `0501h` ; repli sur la mémoire DOS, § 9.2), chaînées dans `[0xE1330]` (`[0xC4720]` la
première). Une région est une suite de blocs, et finit par un mot −1 suivi d'un pointeur vers la
suivante. Un bloc commence par sa taille, bit 0 à 1 s'il est pris ; un bloc libre porte ensuite ses
liens (précédent, suivant) dans la liste circulaire des blocs libres. **Le descripteur du tas**,
`0xC4728` : +8 le bloc libre où reprendre la recherche, +0xC la plus grande taille libre avant lui,
+0x10 la plus grande connue, +0x14 le nombre de blocs pris, +0x18 de blocs libres, +0x1C la
sentinelle de la liste libre (+0x20 le dernier, +0x24 le premier). Autour : `0xE1334`, remis à zéro
par chaque allocation et libération ; `0xCC788`, non nul si le tas peut grandir ; `0xC2D38`, la
limite du segment de données (−2 : ne plus grandir) ; `0xC2D66`, l'extendeur (1 : DOS/4GW, le seul
vu) ; `0xCACE4`, `_amblksiz`, la taille minimale d'une extension ; `0xE1338`, le plus grand bloc DOS
à demander.

**Les fonctions** : `0x8A5A1` `malloc`, `0x8A5B1` `_nmalloc`, `0x8FC70` son cœur, `0x903D6`
`__nmemneed` ; `0x90239` `__ExpandDGROUP` ; `0x90151` une région DPMI, `0x8FF5B` la restitution des
régions vides (`0502h`), `0x8FFCF` le redimensionnement (`0503h`) ; `0x8FE2B`, `0x8FEA5`, `0x8FEC1`
ajouter, détacher, retirer une région ; `0x8B8F8` `_nfree` et son cœur `0x8FD20`, et `0x8B8E8`
`free`, qui ne fait que l'appeler (`sortie.js`) : dans le modèle plat, le tas de Watcom n'a qu'une
sorte de mémoire, comme `malloc` n'est qu'une enveloppe de `_nmalloc` ; `0x8A623` et
`0x8A636` `_expand`. **Anomalie reproduite** : une région placée en tête devient aussi « la première
région » `[0xC4720]`, que `0x90239` prend pour la dernière. **Non vérifié par les scénarios** : les
extendeurs autres que DOS/4GW (int 21h `4800h`, `sbrk`), le repli de `0x90151` sur la mémoire
conventionnelle, les échecs d'allocation (ENOMEM, flot sans tampon).

### 12.3 Les fichiers, les flots, le démarrage et le dépaquetage

**Les fichiers** : `0x8616E` `sopen`, `0x8614F` `open`, `0x875EC` `creat`, `0x8639A` `close`,
`0x87601` `setmode`, `0x876B7` `read`, `0x877E5` `write`, `0x90588` `__qwrite`, `0x88394` `lseek`,
`0x8F3B6` `isatty`, `0x8F3D6`/`0x8F428` `__GetIOMode`/`__SetIOMode` (table `[0xC4D88]`). **Les
flots** (`FILE`) : vingt flots statiques de 0x1A octets en `0xC2D74` (+0 la position dans le tampon,
+4 les octets en attente, +8 le tampon, +0xC les drapeaux — `_READ` 1, `_WRITE` 2, `_BIGBUF` 8,
`_EOF` 0x10, `_SFERR` 0x20, `_BINARY` 0x40, `_IOFBF` 0x100, `_IOLBF` 0x200, `_IONBF` 0x400, `_DIRTY`
0x1000, `_ISTTY` 0x2000, `_TMPFIL` 0x4000 —, +0x10 le descripteur, +0x14 la taille du tampon, +0x18
un octet de secours), au-delà des flots alloués ; les listes des flots ouverts et des maillons
récupérables en `0xE12A0` et `0xE0D08`. `0x8AB79` `__allocfp`, `0x8AC14` `__freefp`, `0x8AC69`
`__chktty`, `0x8F4FC` `__ioalloc`, `0x8B817` `__flush`, `0x8F454` `fputc`, `0x83023` `fopen` ; la
fermeture, réécrite dans `sortie.js` (§ 11.21) : `0x904DF` `__fcloseall`, `0x831A1`
`__shutdown_stream`, `0x83257` `__doclose`, `0x8B8B4` la position logique d'un flot, `0x9046C`
`tell`, `0x8B8E8` `free` ;
`0x90480` `__InitFiles`, `0x8750A` et `0x87524` la sortie de `fprintf` et `vfprintf`. **errno** en
`0xE1298`, `_doserrno` en `0xE129C` (adresses rendues par `0x8A99C` et `0x8A9A2`) ; `0x88324`
traduit une erreur du DOS (table `0xC31D4`) ; `0x882E4` (`_dosret0`) rend 0, ou −1 avec errno (sa
voisine `0x882FC`, `_dosretax`, n'est pas réécrite).

**Le démarrage** : `0x872C4` (`__InitRtns`) exécute les routines de la table `0xCC7E4` (six octets
par entrée, par priorité) ; son pendant de sortie, `0x87307` (`__FiniRtns`), celles de `0xCC802`
(§ 11.21) ; `0x8734A` et `0x873FD` préparent `argv` (`_SplitParms`), `0x90629`
l'environnement (`__setenvp`), `0x832F5` est `getenv` ; `0x89F27` étalonne l'attente sur l'horloge
du DOS (int 21h `2Ch`), rangée en `0xE1288` ; `0x8F574` note le sélecteur de pile, `0x8F449` fixe
`_amblksiz`, `0x8F440` est `stackavail`, `0x8A7FC` `_dos_freemem`. `0x87274` (`__CMain`) reste en
attente : toute la partie se déroule sous elle, elle ne revient pas ; de même le cœur d'`int386x`,
`0x89F90`, que l'hôte remplace d'office. **Les chaînes** : `0x833D8` `stricmp`, `0x8B92D`
`strnicmp`, `0x874D8` `strncmp`, `0x8A987` `tolower` ; `0x88708` lit les drapeaux d'une
spécification de `printf`.

**Quatre routines de Bullfrog de même niveau** : `0x875A4` relève le clavier par le BIOS (int 16h
`12h` : les modificateurs en `[0xDE689]`, 1 Maj, 2 Ctrl, 4 Alt ; `11h` puis `10h` : le code de
balayage de la touche en attente en `[0xDE688]`) ; `0x87790` pose la fenêtre de dessin (§ 6.5) ;
`0x87E30` et `0x87E67` remplissent la mémoire (le cœur de `memset`, par doubles mots). **Le
dépaquetage RNC** (`0x87B2C`, méthode 1 de Rob Northen) : un en-tête de 18 octets (« RNC », 1, les
tailles dépaquetée et paquetée en gros-boutiste, deux sommes de contrôle, une marge, le nombre de
morceaux), puis un flot de bits entrelacé d'octets littéraux ; chaque morceau commence par trois
tables de Huffman (littéraux, distances, longueurs, en `0xC2F88`, `0xC3008`, `0xC3088`), puis des
paires copie-depuis-la-sortie encadrées de littéraux. Le dépaquetage se fait sur place, les données
paquetées d'abord repoussées à la fin du tampon si la sortie risque de les rattraper. Le lecteur de
bits : `[0xC3114]` la fenêtre de 16 bits, `[0xC3116]` le mot suivant, `[0xC3119]` ses bits encore
valides. Les sommes de contrôle ne sont pas vérifiées ; un en-tête d'une autre méthode rend 0.

**Anomalies reproduites.** `read` en mode texte : le ^Z n'arrête que le tri du morceau lu, la
lecture suivante reprend après lui. `0x87E30`, avant l'alignement, fait tourner son motif d'un
octet à chaque octet posé, et ses trois octets de fin prennent dl, dh, dl (sans effet pour `memset`,
dont le motif a quatre octets égaux) ; `ecx` sort à 1 ou 0. Au-delà de 16 symboles, les longueurs
de Huffman écrasent des valeurs sauvées dans la pile, comme dans la réécriture ; au-delà de 24,
elles écraseraient l'adresse de retour, et la réécriture lève une erreur. `__InitFiles` ne vérifie
pas son allocation ; `close` ne consulte pas l'erreur du DOS et rend toujours EBADF ; à priorité
égale, les initialisations passent à rebours de la table (`0x8F574`, `0x90629`, `0x90480`,
`0x89F27`, `0x8734A`). **Non vérifié** : O_EXCL, ENOSPC, plus de 20 flots, le débordement de pile
dans `write`, la branche d'échec de `0x882E4` (appelée une fois).

### 12.4 Les petites routines du socle système

Réécrites dans `moteur/jeu/systeme.js` (avec le curseur, § 6.6, la carte vidéo, § 6.9, le tas du
jeu, § 9.2, et le son, § 9.3). **Les interruptions** : `0x7F085` `int386`, `0x816B5` `int386x`,
`0x81688` `segread` (le cœur `0x89F90` reste celui de l'hôte) ; `0x8164E` et `0x828EB`
`_dos_getvect` et `_dos_setvect` (fonctions `2502h`/`2504h` sous un extendeur de Phar Lap, `[0xC2D66]`
de 2 à 8, `35h`/`25h` sinon) ; `0x7F49D` et `0x7F49F` `cli` et `sti` ; `0x7F16A` `kbhit` ;
`0x7E888` rend la touche en cours traduite par la table `0xBECE0` ; `0x7E570` recharge `ds` depuis
`cs:[0x7E340]` à l'entrée des gestionnaires ; `0x821DF` est `outp`. `0x821BE` (`_chain_intr`) reste
à l'hôte : elle saute à l'ancien gestionnaire par un `retf`. **Les chaînes et la mémoire** :
`0x7E1D8` `toupper`, `0x7E1ED` `strcpy`, `0x7E216` `atoi`, `0x7E822` `strlen`, `0x7F1A0` `memset`,
`0x80958` `memcpy`, `0x81336` `strcat`, `0x81C7C` `strncpy`, `0x81E00` `strcmp` ; `0x811AA` le
`qsort` de Watcom et `0x81184` son échange de deux éléments ; `0x7F652` `sprintf` et sa sortie
`0x7F63C` (§ 12.1) ; `0x7E860`, une fonction vide. **Anomalie reproduite** : `memcpy` copie toujours
en avant, et deux zones qui se recouvrent, la destination après la source, ne donnent pas ce que
donnerait `memmove`. **Non établi** : `[0xC2D58]`, qui fait rendre 1 à `kbhit` sans interroger le
DOS (une touche déjà lue, vraisemblablement).

### 12.5 Le `scanf` de Watcom

`0x8AD11` à `0x8B7EC` ne gèrent pas les pilotes de son, comme on l'avait cru : c'est le `scanf` de
Watcom, qui sert à lire `sndsetup.inf` (§ 9.1). `0x833A5` est `sscanf`, `0x83377` `vsscanf`,
`0x8334A` et `0x8336C` lisent et rendent un caractère de la chaîne (réécrits dans
`sos-pilotes.js`) ; `0x8AD11` `__scnf`, `0x8AF18` `get_opt`, `0x8AFE5` `scan_white`, `0x8B09D`
`scan_string`, `0x8B5BB` `scan_int`, `0x8B7B8` `radix_value`, `0x8B7EC` `cgetw` (réécrits dans
`sos-bruitages.js`). **Anomalie reproduite** : le drapeau `0x80`, qui permettrait de lire
« segment:décalage », n'est jamais posé ; ce code est mort. **Non exercé** : tout ce qui n'est pas
`%d`, `%x` ou `%s` sans signe. Jamais appelées, sans réécriture : `0x8B2FB`, la lecture d'un nombre
à virgule (elle cherche `.`, `e` et `E`), et ses voisines `0x8B21C`, `0x8B01C`, `0x8B18D`.

## 13. L'introduction, `INTRO.EXE`

Un second programme du CD (`GAME/INTRO.EXE`, 179 303 octets, Watcom 32 bits sous DOS/4GW, 497
fonctions), que le lanceur installé (`C:\THEME.CD\THEME.BAT`) exécute avant `MAIN.EXE`, depuis le
dossier du CD, avec `-C:/THEME.CD` : le film d'ouverture. Il est lié à la même bibliothèque que le
jeu, mais compilé à part : 466 de ses fonctions sont celles du jeu à l'octet près (champs relogés
mis à part), une vingtaine en sont des variantes, compilées autrement (autre allocation des
registres, `xor eax, eax ; mov ax, …` pour `movzx`, `switch` en table), et une dizaine lui sont
propres. Les adresses ci-dessous sont celles d'`INTRO.EXE` ; `moteur/jeu/intro.js` donne aussi
celles de la disposition transportée (docs/architecture.md, « L'introduction »).

**`main` (`0x10110`).** La ligne de commande, sans son `-` (ou `/`), donne le dossier du jeu, suivi
de `/` (`0x4C070`). Quatre tampons du tas du jeu : l'image (`0xFA00` octets), le film (`0x11300`),
le morceau de palette lu et la palette du film (`0x1000` chacun). Les deux cartes (plus bas) ; le
volume de la musique à `0x50` ; puis un tic à 120 Hz : l'événement de la minuterie de SOS `0x10010`
(`sosTIMERRegisterEvent`, cadence `0x78`) si l'une des cartes est ouverte, sinon sa propre minuterie
(`0x10078` : le 8253 reprogrammé au diviseur `0x26AF`, le vecteur 8 sur `0x1001C`, qui rend au BIOS
son tic de 18,2 Hz en chaînant l'ancien gestionnaire chaque fois que la somme des diviseurs passe
`0x10000`). Le mode 13h (`0x13990`, le `0x7EC50` du jeu, la plage de la souris en plus), le délai de
`0x15` tics entre deux images, le clavier pris (`0x1355C` : le vecteur 9 sur `0x13440`, qui tient la
table des 128 touches et la dernière frappée, `0x4C560`), le film joué (`0x1064C`), et tout rendu. Il
ne rend rien : eax y reste le pointeur de la dernière entrée de la table des blocs du DOS
(`0x4C680`), parcourue par `0x138D0` pour les rendre, et `exit` en fait le code de sortie (son octet
bas : 200). Le lanceur ne le regarde pas.

**Les cartes (`0x10C50`, `0x10EC0`).** `sndsetup.inf`, dans le dossier du jeu : la première ligne
(`%s = %s %x %d %d`) est la carte des bruitages, son port, son IRQ et son DMA ; la seconde
(`%s = %s %x`), la carte de musique et son port. `BF_SOUND` et `BF_MUSIC`, dans l'environnement,
l'emportent. Sans fichier, un avertissement (« Run the 'Setup' program », puis « … 'Install' … »)
et `none` pour les deux. La musique : `ADLIB`, `SBLAST`, `SBPRO`, `ADLIBG`, `SB16FM`, `GRAVIS`,
`PASFM` et `COMPATIBLE` prennent le pilote FM (`0xA002`), `ROLAND` le `0xA004`, `SBAWE32` le
`0xA008`, `GENERAL` et `WBLAST` le `0xA001`, toutes comparées sans égard à la casse. L'ouverture de
la musique (`0x111E0`) est celle du jeu (`0x6010C`, § 9.1), l'ouverture des bruitages (`0x12650`)
aussi (`0x6058B`), sans l'option `-o` : l'introduction cherche toujours la carte avec
`HMIDET.386` (sosDETInitSystem, sosDETFindCard, sosDETGetSettings, sosDETUnInitSystem : `0x85793`,
`0x85950`, `0x85F3E`, `0x858FC` du jeu, que le jeu n'appelle jamais ; réécrits dans
`sos-bruitages.js`, section 9).

**Le film (`0x1064C`).** Le lecteur des films des attractions (`0x60C44`, § 9.3), dans une version
voisine : `data/intro.dat` (FLC, 1 727 images en 320x200, 16,7 Mo), une passe ; le délai se compte
en tics de 120 Hz (`0x10C2B`, une attente active sur le compte `0x40A82`, que le tic avance) ;
l'image est copiée telle quelle dans la fenêtre vidéo, la palette reposée après chaque attente ; le
décodeur (`0x107F2`) connaît aussi la palette de 64 niveaux (genre `0xB`, lue par une seconde copie
de `0x60F92`). Une touche l'arrête à l'image suivante.

**Le script (`0x10310`).** Des lignes de 7 octets : l'image (mot), une lettre (majuscule ou
minuscule), un argument (mot long). `A` le délai (en tics), `B` la banque de musique, `E` celle des
bruitages, `F` le volume d'un bruitage, `L` lire le film d'avance puis `M`, `M` un morceau, `R` un
bruitage sans fin, `S` un bruitage (0 : tout arrêter), `T` en arrêter un (0 : tous), `X` la musique
arrêtée. Le même que celui des films du jeu (`0x5FC16`), avec `F` en plus, et l'argument pris sur
ses quatre octets pour `A`, `L`, `S` et `T`.

**Les fichiers lus.** `data\inst.bnk`, `data\drum.bnk`, `data/music0-0` et `data/snds0-2` (`.dat`,
`.tab`) à l'ouverture, `hmidet.386`, `hmidrv.386`, `data/intro.dat`, puis, par le script,
`data/snds1-2` et `data/music1-0`.
