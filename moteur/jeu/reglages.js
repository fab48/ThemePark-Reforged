// Les réglages : des écarts assumés avec le jeu d'origine, que le joueur choisit. Tous sont
// désactivés par défaut, si bien que les vérificateurs comparent toujours le jeu d'origine ; la page
// les active à la demande (moteur/web/travailleur.js). Le défilement adouci change le jeu (la
// caméra avance moins vite) ; le défilement fluide ne change que ce qui est montré ; la grande vue
// change l'écran du parc, et donc la partie ; les
// corrections changent la partie, pour corriger des défauts du jeu de 1994 ; la table des objets
// agrandie lève une limite du jeu de 1994, et plus de visiteurs change la partie ; les animations
// intercalées ne changent que ce qui est montré.

export const reglages = {
  // Le défilement adouci, en 640x480. Au bord de l'écran, le jeu d'origine y avance de deux colonnes
  // de tuiles par image (voir carte.js) : à 30 images par seconde, la vue traverse la carte en une
  // seconde, par bonds de 48 pixels. Les PC de 1994 affichaient bien moins d'images dans ce mode, et
  // le défilement y était plus lent. Activé, il avance d'une colonne au plus tous les 7 tics de la
  // minuterie du jeu : une dizaine de colonnes par seconde, la vitesse à l'écran du 320x200.
  defilementAdouci: false,

  // Le défilement fluide, dans les deux modes. Le jeu d'origine déplace la caméra par cases
  // entières : la vue saute de 24 pixels de l'écran par colonne, de 16 par rangée (et 8 de côté),
  // en 320x200 comme en 640x480. Activé, la vue montrée glisse au pixel d'une position de
  // la caméra à la suivante, avec un léger retard (au plus la durée d'un pas). Le jeu n'en sait
  // rien : la caméra, la simulation, les entrées et le dessin restent ceux de l'original. Seul
  // change ce qui est montré : le jeu relève, en lecture seule, la vue qu'il vient de dessiner et
  // l'image qu'il présente (vue-fluide.js) ; la page recolle les vues successives dans une mosaïque
  // du monde et compose l'image montrée, l'interface du jeu par-dessus, à sa place
  // (moteur/web/defilement-fluide.js). Tout appui d'un bouton de la souris finit d'abord la glisse,
  // pour que le clic tombe sur ce que le joueur voit. Voir docs/architecture.md, « Les réglages :
  // le défilement fluide ».
  defilementFluide: false,

  // La grande vue : dans la vue du parc en 640x480, une image plus grande, au format de la fenêtre
  // (W x H, de 640x480 à 1920x1200), qui montre plus de cases du parc ; la barre d'outils et la
  // barre des messages sont centrées en bas, les icônes au coin haut droit. Les écrans pleins
  // (fiches, gestion, listes, carte du parc) restent en 640x480. Le jeu tient sa géométrie d'écran
  // dans grande-vue.js : éteint, ce sont les 640 et 480 du programme d'origine. Allumé, la partie
  // PEUT DIFFÉRER de l'original : dessiner plus de cases, c'est dessiner plus d'objets, et le dessin
  // a des effets (les enseignes ne défilent que dessinées, la musique est réclamée par la première
  // attraction visible, le clic est attribué pendant le dessin), et la caméra se cadre sur un écran
  // plus grand. Voir docs/architecture.md, « Les réglages : la grande vue ».
  grandeVue: false,

  // Les corrections : des défauts du jeu de 1994 (docs/demandes.md, bogues 4 et 5, retours 62, 65, 69, 75), un
  // réglage chacun, que le bouton « corrections » de la page allume ensemble. Allumées, la
  // partie DIFFÈRE de l'original ; éteintes, le jeu reste celui de 1994, prouvé identique.
  //
  // Les déplacements du personnel (corrections.js). Après la formation (recherche, +8 à la vitesse
  // d'un métier), une vitesse qui ne divise pas 256 (24, 40, 48…) fait parcourir à l'employé moins
  // d'une case entre deux décisions : il s'écarte du milieu de case en case, et les agents
  // d'entretien en tournée tournent en carré, les mécaniciens errent. Allumé, l'employé est posé au
  // milieu de sa case chaque fois qu'il en commence une nouvelle ; aux vitesses qui divisent 256,
  // rien ne change. De plus, le mécanicien qui erre après une réparation (0x33F14), enfermé là où
  // aucune cible n'est accessible, renonce après 256 tirages au lieu de figer le jeu. Et l'employé
  // qui contourne un obstacle en le longeant (le chemin de la tournée, 0x63E5D ; celui de tout le
  // parc, 0x349EB), dévié du trajet prévu — par la formation elle-même, qui change sa vitesse au
  // milieu d'une case —, cesse de longer et refait son plan, au lieu de faire sans fin le tour d'un
  // autre pâté. Enfin, l'agent d'entretien sans tournée tire sa sortie au hasard également entre les
  // sorties d'un carrefour, au lieu du tirage biaisé d'origine qui l'emmène en haut à droite du parc.
  corrigerLesDeplacementsDuPersonnel: false,

  // Les éjections des passagers (0x65D25, visiteurs-etats-b.js). Le jeu éjecte un passager une fois
  // sur 64, dans les courbes prises vite (sortes de voie 1 à 4, vitesse au-delà de 0x23), dès que
  // l'usure de l'attraction atteint 18, quand la panne ne vient qu'au seuil de sa fiche (+0xA8 : 80
  // à 120 pour les montagnes russes). Allumé, l'éjection ne commence qu'à ce seuil, où l'attraction
  // montre son usure (fumée, musique désaccordée).
  corrigerLesEjections: false,

  // Le retour des visiteurs (corrections.js, 0x22BA6). Le visiteur qui s'en va file tout droit vers le
  // portique et longe ce qui le gêne : l'eau, les files et les attractions qui la bordent l'arrêtent
  // (la sonde ressort dans une case enclavée, les éclaireurs s'épuisent en 150 pas ; enfermé sur le
  // quai d'un canal ; un contournement périmé qu'il poursuit sans fin) ; sans chemin, il reste planté.
  // Allumé, il prend un plus court chemin vers le portique, en gardant la direction du jeu tant que
  // rien n'est sur la route ; enfermé, il traverse la file ou l'attraction, comme le jeu le permet
  // déjà au visiteur sans chemin (0x2276C). Retour 62 de docs/demandes.md.
  corrigerLeRetourDesVisiteurs: false,

  // Les tours en trop des trains (vehicules.js, 0x42C6E). Le train ne s'arrête en gare que si aucun
  // wagon n'est dans un looping quand sa tête arrive ; or un looping étire le train, et un looping peu
  // avant la gare y laisse la queue : le train repart, plus vite à chaque tour (jusqu'au plafond), et
  // éjecte d'autant plus. Allumé, la tête s'arrête quand même, et les wagons restés en arrière
  // finissent le looping et roulent jusqu'à leur place derrière elle. Retour 65 de docs/demandes.md.
  corrigerLesToursEnTrop: false,

  // La file bloquée par une pause (visiteurs-etats-b.js, 0x30B19). Tous les 256 pas, chaque visiteur
  // fait une pause d'une trentaine de pas, même en tête de file ; si l'attraction veut le faire monter
  // à ce moment, elle oublie sa file, et plus personne ne monte avant qu'il l'abandonne, 6 000 pas plus
  // tard. Allumé, il garde sa place, et l'attraction réessaie au pas suivant. Retour 65 de
  // docs/demandes.md.
  corrigerLaFileEnPause: false,

  // Le labyrinthe bloqué hors de vue (attractions.js, finirLeTour, 0x2FB85). Son dessin montre un
  // passager à la fois, désigné par le mot +4D, que seul le dessin remet à 0 ; et le labyrinthe ne fait
  // pas descendre le premier de ses passagers tant qu'il est celui-là. Qu'on regarde ailleurs à ce
  // moment, et il reste à l'arrêt, passagers à bord, file pleine, sans fin (fermer puis rouvrir le
  // débloquait). Allumé, le passager montré descend comme les autres. Retour 69 de docs/demandes.md.
  corrigerLeLabyrintheHorsDeVue: false,

  // Les ponts (corrections.js, garderLePont ; outils.js, 0x2C2EC). Effacer une case de rivière (ou
  // poser dessus un mur, une attraction…) retire la sortie qui y menait aux deux cases d'eau voisines,
  // en refaisant leur forme dans leur famille de sols. Un pont voisin (une allée ou une file sur l'eau)
  // passe par ce calcul comme une case de rivière : son image devient une allée ordinaire (ou une file)
  // dont la forme est celle de la rivière qui reste, une route en T tournée vers l'eau et vers l'herbe
  // de la case effacée, sans plus d'eau dessous, et qui perd souvent la branche du chemin. Les visiteurs
  // la suivent : dans l'herbe, dans l'eau. Allumé, le pont est laissé tel quel, comme la pose d'une
  // rivière le laisse déjà (0x29340). Retour 75 de docs/demandes.md.
  corrigerLesPonts: false,

  // Le cadrage sur un objet (corrections.js, cameraCentreeSurLObjet ; construire.js, ecrans-gestion.js).
  // Amener la vue sur un employé (les icônes du personnel, le bouton de sa fiche) ou sur l'objet d'une
  // liste pose la caméra à la case de l'objet moins la moitié de l'écran, sans compter l'obliquité des
  // rangées ni le panneau du bas : l'objet tombe à droite et en bas du milieu (96 et 30 pixels en
  // 640x480, 176 et 30 en grande vue de 800 lignes), et le zoom de la page l'agrandit jusqu'au bord du
  // cadre. Allumé, l'objet est au milieu de la vue du parc, à la case près ; en 320x200, l'original.
  // Retour 76 de docs/demandes.md.
  corrigerLeCadrageSurUnObjet: false,

  // Le tracé à la souris (souris-jeu.js, « le tracé à la main »). En 640x480 et en grande vue, pendant
  // qu'on trace un chemin, une barrière, une rivière ou des rails, le gestionnaire de souris d'origine
  // compte chaque écart deux fois : la route file au double de la main, et en biais. Allumé, l'écart
  // de la main n'est compté qu'une fois : la route suit la souris. Un outil en main, le curseur ne
  // compte plus non plus l'écart deux fois (il filait devant la main, d'autant plus que l'image est
  // grande). La partie ne diffère de l'original que par ce qu'on trace ; la page l'allume toujours
  // (moteur/web/travailleur.js).
  corrigerLeTraceALaSouris: false,

  // Le double-clic fantôme (souris-jeu.js, traiterLesBoutons). Le compte à rebours du double-clic
  // n'est décompté que par le pas de simulation : dans les boucles qui l'arrêtent (la fin d'année, les
  // négociations, les questions, la pause), deux clics à plusieurs secondes d'écart font un
  // double-clic, que la vue du parc traite à son retour (0x1803C) : l'outil de la case sous le
  // pointeur passe en main (un lac, après la fin d'année ; retour 42 de docs/demandes.md). Allumé, un
  // second appui plus de 25 tics de la minuterie (0,34 s) après le premier en réarme le compte au lieu
  // de faire un double-clic. Défaut d'origine ; la page l'allume toujours.
  corrigerLeDoubleClicFantome: false,

  // La table des objets agrandie (table-des-objets.js). Le jeu de 1994 range visiteurs, attractions,
  // personnel, chaque morceau de voie et chaque wagon dans une table de 1 198 emplacements ; pleine,
  // la pose d'un rail, d'une attraction, les wagons d'une attraction qui ouvre échouent sans rien dire.
  // Allumé, la table en a 3 998, les visiteurs restant aux 1 098 premiers comme en 1994 ; la sauvegarde
  // garde son format, les objets au-delà du 1 200ᵉ enregistrement écrits à sa suite. Lu une fois, quand
  // le programme se met en place (0x104A3) : le changer ensuite ne fait rien. La page l'allume toujours.
  grandeTableDesObjets: false,

  // Plus de visiteurs (table-des-objets.js), avec la table agrandie seulement : le bus amène du monde
  // jusqu'à 1 600 présents au lieu de 800 (0x67CD4), et les visiteurs peuvent occuper les 2 399
  // premiers emplacements de la table. La partie DIFFÈRE de l'original dès que le parc attire plus de
  // 800 présents. La page l'allume toujours.
  plusDeVisiteurs: false,

  // Les animations intercalées : les attractions à tours (une image tous les 2 × délai + 1 pas, 3,3
  // par seconde au délai 4) montrées deux fois plus vite dans leur boucle de marche, par les dessins
  // du jeu, passagers compris, avec derrière ce qui bouge une traînée semi-transparente faite des
  // images interpolées par RIFE (moteur/node/exporter-animations.mjs, importer-animations.mjs). Le jeu
  // n'en sait rien : l'animation, son rythme, la simulation et l'image indexée restent ceux de
  // l'original ; le module relève en lecture seule ce que l'attraction recouvre et trace, et le
  // travailleur de la page retouche l'image montrée (animations-intercalees.js). La page l'allume par
  // défaut. Voir docs/architecture.md, « Les réglages : les animations intercalées », et
  // docs/animations.md.
  animationsIntercalees: false,
};
