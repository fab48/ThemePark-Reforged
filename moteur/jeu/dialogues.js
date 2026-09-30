// La boîte à question, l'entrepôt (la gestion des stocks) et la salle des ventes aux enchères.
//
// Réécriture lisible de 0x78E36, 0x78F89, 0x798D7, 0x79A04, 0x7B19C, 0x7B65C, 0x7B73E et 0x7C16C
// (la ligne de message du bas des écrans pleins).
// Voir docs/guide-reecriture.md.
//
// Sept fonctions voisines dans le programme (0x78E36 à 0x7C16C), entre la saisie d'un nom (0x793B1,
// divers.js) et la jauge de stock (0x7B3F6, divers.js). Trois sujets :
//
// LA BOÎTE À QUESTION — 0x78F89 dessine une image d'une boîte « oui / non » et rend ce qu'il faut en
// faire (1 oui, −1 non, 0 pas encore) ; 0x78E36 en fait une question modale, avec sa propre boucle
// d'images. C'est la sœur de la saisie d'un nom (0x793B1) : même boîte, mêmes boutons, sans champ.
// Les appelants de 0x78E36 : Alt+Échap dans le parc (0x13BF3, « QUITTER ? »), les options (0x50CCD),
// la fin d'année (0x7401C, racheter le terrain) et le bilan (0x7C36D, vendre le parc aux enchères).
// 0x78F89 est aussi appelée seule, une fois par image, par la boucle du parc (0x11C45) pour les
// écrans 0x56 (un message du jeu : celui du code de triche, [[0xD3814]+0x1B1]) et 0x64 (la faillite,
// texte 0x5E ou 0x5F selon le cours de l'action), et par 0x78B7E et 0x78CEF (écrans 0x4A et 0x54).
//
// L'ENTREPÔT — l'écran 0x52 (Maj+S dans le parc, ou le bouton de la barre). 0x798D7 l'ouvre (le
// fond data/mstock-0.dat, la palette, les images), 0x79A04 en dessine une image et traite les clics
// (la boucle du parc l'appelle à chaque image tant que [0xD6652] vaut 0x52), 0x7B19C y trace la
// barre de capacité d'un niveau d'entrepôt.
//
// LA VENTE AUX ENCHÈRES — l'écran 0x62. 0x7B65C la prépare (les images de la salle, la mise à prix),
// 0x7B73E la déroule : une boucle de 0x744 images (62 secondes) où les concurrents enchérissent
// (0x73EE8 cherche un acheteur, 0x7C128 note l'enchère : [0xDE1D8] l'enchérisseur, [0xDE1C4] son
// prix, [0xDE1C8] la prochaine mise, +10 %). Elle rend l'acheteur, −1 s'il n'y en a pas. Appelée par
// le bilan de fin d'année (0x7C36D, fin-annee.js), et par la boucle du parc sur l'écran 0x62 (après
// l'événement 0x3C, qui appelle 0x7B65C : evenements.js).
//
// VÉRIFICATION. Rejeu empoisonné IDENTIQUE sur les seize scénarios, et sur le scénario composé
// entrepot.json (l'entrepôt en 320x200 et en 640x480 : choix d'une marchandise, glissière, commande,
// achat d'un agrandissement, sortie par Échap et par le bouton). Comparaison appel par appel :
// 0 divergence pour les sept fonctions : 0x78F89 (triche, fin-annee : 632 appels), 0x798D7, 0x7B19C,
// 0x7B65C, 0x79A04 (bourse : 184 appels), 0x78E36 et 0x7B73E (fin-annee). Ces trois dernières ont
// d'abord semblé diverger : le comparateur ne remettait pas les tampons du curseur, les banques
// d'images ni les fichiers lus entre ses deux exécutions (journal des essais, § 5.8).
// Non exercé : dans 0x7B73E, la vente avec enchérisseur (aucun concurrent n'est assez riche dans
// fin-annee.json : 0x7C128 n'est jamais appelée) et l'attente en partie à plusieurs.
//
// Nom de module : « dialogues » ne couvre que le premier sujet ; « entrepot-encheres » ou
// « ecrans-stock » diraient mieux ce qu'il y a ici.

import { auCentreDeLaGrandeVue } from './grande-vue.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
// `idiv` : division entière signée tronquée vers zéro. Une division par zéro arrêtait le programme
// d'origine (exception du processeur) : elle arrête aussi la réécriture.
function idiv(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}
function imod(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) % (b | 0)) | 0;
}

const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// --- le cadre de pile ----------------------------------------------------------------------------
//
// Comme dans fin-annee.js : la réécriture ouvre le même cadre que l'original (ebx, esi, edi, ebp
// empilés, puis `enter taille, 0`), si bien que les tampons de texte pris dans ses variables locales
// sont aux mêmes adresses, et que les appels partent de la même hauteur. En sortant, elle rend à
// l'appelant ebx, esi, edi et ebp, que certaines routines appelées, écrites en assembleur (0x81590,
// 0x815B8 : `rep stosd` sur edi), ne gardent pas.
class Cadre {
  constructor(jeu, tailleDesLocales) {
    const T = jeu.T;
    T.sauver();
    const R = T.R, entree = R.esp >>> 0;
    this.jeu = jeu;
    this.ebpAppelant = R.ebp;
    this.ebx = R.ebx;
    this.esi = R.esi;
    this.edi = R.edi;
    poserLong(jeu, entree - 4, R.ebx);
    poserLong(jeu, entree - 8, R.esi);
    poserLong(jeu, entree - 12, R.edi);
    poserLong(jeu, entree - 16, R.ebp);
    this.ebp = entree - 16;
    R.ebp = this.ebp;
    R.esp = this.ebp - tailleDesLocales;
    T.charger();
  }

  // L'adresse d'une variable locale, [ebp - decalage].
  local(decalage) { return this.ebp - decalage; }

  fermer() {
    const T = this.jeu.T;
    T.sauver();
    T.R.ebp = this.ebpAppelant;
    T.R.ebx = this.ebx;
    T.R.esi = this.esi;
    T.R.edi = this.edi;
    T.charger();
  }
}

function dansLeCadre(tailleDesLocales, routine) {
  return (jeu, ...args) => {
    const cadre = new Cadre(jeu, tailleDesLocales);
    try {
      return routine(jeu, cadre, ...args);
    } finally {
      cadre.fermer();
    }
  };
}

// --- les variables du jeu ----------------------------------------------------------------------
const MODE = 0xDE5F6;               // bit 0 : 320x200 (basse résolution) ; sinon 640x480
const SURFACE = 0xDE5BC;            // pointeur : l'image en construction
const FOND = 0xD3B98;               // pointeur : le tampon de fond
const ECRAN = 0xD6652;              // mot : l'écran ouvert (0 le parc)
const ECRAN_PRECEDENT = 0xD660E;    // mot : l'écran d'où l'on vient
const RETOUR_DES_ECRANS = 0xB9ED8;  // octet : l'écran où revenir en fermant un écran plein
const REDESSINER_CARTE = 0xD666E;   // mot
const HAUTEUR_DE_LIGNE = 0xD7765;   // octet : hauteur de l'image du « W » de la police
const BANQUE_INTERFACE = 0xD3B54;   // pointeur : images des cadres, icônes et boutons, 6 octets
const PALETTE = 0xD3B8C;            // pointeur : la palette courante
const PALETTE_DE_L_ECRAN = 0xCEBE0; // la palette des écrans pleins, chargée avec leur fond
const CURSEURS = 0xD3B84;           // pointeur : les images du pointeur (+6 la flèche, +0x66 la
                                    // main, +0x6C la flèche des écrans)
const TEXTES = 0xD7BC0;             // pointeur : table de pointeurs de textes
const NOMS = 0xD7BD0;               // pointeur : les noms des objets (et des marchandises)
const NOMS_DES_MOIS = 0xD7B90;      // pointeur : 4 octets par mois
const JOURS_DU_MOIS = 0xB7E06;      // 12 octets : pas de simulation par jour (ecran-parc.js)
const PAS_DE_SIMULATION = 0xD3AFC;  // mot long : 1 000 pas par mois
const JOUEUR_COURANT = 0xD665C;     // mot
const COMPTES_COURANTS = 0xD3814;   // pointeur : les comptes du joueur ; +0x683 négociation des
                                    // fournisseurs en cours (economie.js)
const PARC_COURANT = 0xD3818;       // pointeur : +0x4B la capacité de l'entrepôt, +0x4D son niveau,
                                    // +0x4E le niveau le plus haut que la recherche permet
const NIVEAU_DE_JEU = 0xD66F1;      // octet : 0, 1 ou 2 ; 2 le jeu complet (economie.js)
const JOUEURS_EN_RESEAU = 0xD7792;  // octet

const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;           // mots signés : le pointeur
const DROIT_APPUI = 0xDE5A4, GAUCHE_APPUI = 0xDE5A6;    // mots : l'appui, à remettre à zéro
const DROIT_TENU = 0xDE5AA, GAUCHE_TENU = 0xDE5AC;      // mots : le bouton maintenu
const TOUCHE = 0xDE688;             // octet : le code de balayage de la touche de l'image

// Les couleurs du cache de 0x12452 (divers.js).
const NOIR = 0xD7773, BLANC_CASSE = 0xD776B, FOND_DE_CASE = 0xD777E;

// --- les fonctions du jeu appelées ---------------------------------------------------------------
const OUVRIR_ECRAN_PLEIN = 0x40D3E, FERMER_ECRAN_PLEIN = 0x40D79;
const RETIRER_LE_CURSEUR = 0x7D79E;
const SERVIR_L_HOTE = 0x1107F;           // la souris et le clavier de l'image
const COULEUR_LA_PLUS_PROCHE = 0x80250;  // (palette, r, g, b) -> index, dans al
const PANNEAU_SAILLANT = 0x3E673;        // (x0, y0, x1, y1)
const CADRE_BISEAUTE = 0x3E149;          // (x0, y0, x1, y1, couleurBasDroite, couleurHautGauche)
const ECRIRE_TEXTE = 0x3F49E;            // (x, y, texte, normal, couleur)
const ECRIRE_CENTRE = 0x3F377;           // (x0, x1, y, texte, normal, couleur)
const LARGEUR_DU_TEXTE = 0x3F677;        // (texte)
const TEXTE_DANS_UN_CADRE = 0x40BBC;     // (x0, y0, x1, y1, texte, couleur, 0)
const PETIT_TEXTE_BASSE = 0x80E88, PETIT_TEXTE_HAUTE = 0x80F34;   // (x, y, texte, couleur)
const TRACER_BASSE = 0x5EC9C, TRACER_HAUTE = 0x55BD4;             // (x, y, entrée d'image)
const LIGNE_BASSE = 0x949BC, LIGNE_HAUTE = 0x949DA;               // (x0, y0, x1, y1, couleur)
const RECTANGLE_PLEIN = 0x1188C;         // (x, y, largeur, hauteur, couleur)
const DESSINER_IMAGE = 0x20F4C;          // (x, y, image, 0)
const RECOPIER_320 = 0x80E20;            // (source, destination, lignes de 320 octets)
const RECOPIER_640 = 0x54ED6;            // (source, destination) : l'écran entier, 640x480
const RECOPIER_DES_LIGNES = 0x55EFA;     // (source, destination, lignes)
const REMPLIR_320 = 0x81590, REMPLIR_640 = 0x815B8;   // (destination, lignes, couleur)
const PRESENTER_320 = 0x80210, PRESENTER_640 = 0x55507;
const ATTENDRE_BALAYAGE = 0x80BE4;
const BRUITAGE = 0x80C80;                // (propriétaire, bruitage)
const CURSEUR = 0x116E4;                 // (image) : change l'image du pointeur
const FORMATER = 0x7F652;                // sprintf
const CHARGER_UN_FICHIER = 0x7F0B0;      // (nom, destination) : rend la taille lue
const RELOGER_LES_SPRITES = 0x10C80;     // (table, fin de la table, données des images)
const POSER_LA_PALETTE = 0x7C282;        // (palette)
const NOM_D_UN_JOUEUR = 0x4C50B;         // (joueur) -> texte
const FILE_DES_EVENEMENTS = 0x2CCF8;
const TROUVER_UN_ACHETEUR = 0x73EE8;     // (prix, exclu) -> joueur, ou −1 (fin-annee.js)
const NOTER_L_ENCHERE = 0x7C128;         // (joueur)
const MESSAGE_EN_BAS = 0x7C16C;          // (palette, texte) : le bandeau des écrans pleins
const INSCRIRE_AU_LIVRE = 0x78943;       // (catégorie, montant)
const HASARD = 0x18B92;
const ROUVRIR_UN_ECRAN = 0x1B23A;        // (écran)
const ETEINDRE_L_ECRAN = 0x7C32D;        // un fondu au noir (0x4820D), et trois variables
const QUESTION = 0x78F89;

const FORMAT_ENTIER = 0xB072F;           // "%d"
const FORMAT_TEXTE = 0xB06FB;            // "%s"

const basseResolution = (jeu) => (octet(jeu, MODE) & 1) !== 0;
const texte = (jeu, decalage) => long(jeu, (long(jeu, TEXTES) + decalage) | 0);

function tracer(jeu, x, y, entree) {
  jeu.appeler(basseResolution(jeu) ? TRACER_BASSE : TRACER_HAUTE, x, y, entree);
}
function petitTexte(jeu, x, y, chaine, couleur) {
  jeu.appeler(basseResolution(jeu) ? PETIT_TEXTE_BASSE : PETIT_TEXTE_HAUTE, x, y, chaine, couleur);
}
// Le fond de l'écran recopié sur la surface de dessin : une image repart d'un fond propre.
function restaurerLeFond(jeu) {
  if (basseResolution(jeu)) jeu.appeler(RECOPIER_320, long(jeu, FOND), long(jeu, SURFACE), 200);
  else jeu.appeler(RECOPIER_640, long(jeu, FOND), long(jeu, SURFACE));
}
// L'inverse : la surface gardée dans le tampon de fond.
function garderLaSurface(jeu) {
  if (basseResolution(jeu)) jeu.appeler(RECOPIER_320, long(jeu, SURFACE), long(jeu, FOND), 200);
  else jeu.appeler(RECOPIER_640, long(jeu, SURFACE), long(jeu, FOND));
}
function presenter(jeu) {
  if (basseResolution(jeu)) jeu.appeler(PRESENTER_320, 400);
  else jeu.appeler(PRESENTER_640);
}
// Les quatre mots des boutons remis à zéro, pour que le clic ne soit pas repris ailleurs.
function oublierLeClic(jeu) {
  poserMot(jeu, DROIT_APPUI, 0);
  poserMot(jeu, GAUCHE_APPUI, 0);
  poserMot(jeu, DROIT_TENU, 0);
  poserMot(jeu, GAUCHE_TENU, 0);
}
// Le pointeur dans [x0, x1[ × [y0, y1[, bornes comparées en signé sur 32 bits.
function pointeurDans(jeu, x0, y0, x1, y1) {
  const x = motSigne(jeu, SOURIS_X), y = motSigne(jeu, SOURIS_Y);
  return x >= x0 && y >= y0 && x < x1 && y < y1;
}
const clicTenu = (jeu) => mot(jeu, GAUCHE_TENU) !== 0;
// Le joueur peut-il passer commande ? Au jeu complet seulement, et pas pendant une négociation
// avec les fournisseurs (economie.js) : leur grève bloque les commandes.
const commandesPermises = (jeu) => octet(jeu, NIVEAU_DE_JEU) === 2
  && octet(jeu, (long(jeu, COMPTES_COURANTS) + 0x683) | 0) === 0;

// =================================================================================================
// LA BOÎTE À QUESTION
// =================================================================================================

// 0x78F89 — une image de la boîte à question.
//
// Le panneau en saillie du tiers central de l'écran (de 160 à 480, du tiers aux deux tiers de la
// hauteur), le titre centré s'il y en a un, le texte de la question dans son cadre (0x40BBC, qui le
// coupe en lignes), et deux boutons en bas : oui à gauche (image 185 de la banque de l'interface),
// non à droite (image 187). Rend 1 pour oui, −1 pour non, 0 tant qu'on n'a pas cliqué.
//
// Même boîte que la saisie d'un nom (0x793B1, divers.js), avec la même ANOMALIE REPRODUITE : les deux
// tests de survol emploient la largeur et la hauteur de l'image 185, y compris pour le bouton de
// droite, dessiné aux dimensions de l'image 187. Autre différence : en se refermant, la boîte remet
// l'écran courant (0xD6652) à 0, le parc — c'est ce qui ferme les écrans 0x56 et 0x64.
//
// Hors du jeu d'origine : en grande vue, la boîte est dessinée au centre de l'image
// (grande-vue.js, `auCentreDeLaGrandeVue`) ; ailleurs, rien ne change.
export const poserLaQuestion = (jeu, question, titre) =>
  auCentreDeLaGrandeVue(jeu, () => dessinerLaQuestion(jeu, question, titre));
const dessinerLaQuestion = dansLeCadre(0x40, (jeu, cadre, question, titre) => {
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  const couleur = jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE), 0x21, 0x21, 0x21) & 0xFF;
  const hauteur = basseResolution(jeu) ? 400 : 480;
  const tiers = idiv(hauteur, 3);
  const bas = hauteur - tiers;
  jeu.appeler(PANNEAU_SAILLANT, 0xA0, s16(tiers), 0x1E0, s16(bas));
  if (titre !== 0) jeu.appeler(ECRIRE_CENTRE, 0xB0, 0x1D0, s16(tiers + 0x10), titre, 0, couleur);
  jeu.appeler(TEXTE_DANS_UN_CADRE, 0xB0, u16(tiers + 0x20), 0x1D0, u16(bas - 0x40), question, couleur, 0);

  const banque = () => long(jeu, BANQUE_INTERFACE);
  const largeurDuBouton = () => octet(jeu, (banque() + 0x45A) | 0);
  const hauteurDuBouton = () => octet(jeu, (banque() + 0x45B) | 0);
  // Un clic tenu, strictement à l'intérieur du bouton (les bornes ne comptent pas).
  const survole = (x, y) => clicTenu(jeu)
    && motSigne(jeu, SOURIS_X) > u16(x) && motSigne(jeu, SOURIS_X) < largeurDuBouton() + u16(x)
    && motSigne(jeu, SOURIS_Y) > u16(y) && motSigne(jeu, SOURIS_Y) < 2 * hauteurDuBouton() + u16(y);
  const refermer = (reponse) => {
    jeu.appeler(BRUITAGE, 0, 0x1A);
    poserMot(jeu, ECRAN, 0);
    poserMot(jeu, REDESSINER_CARTE, 1);
    oublierLeClic(jeu);
    jeu.appeler(FERMER_ECRAN_PLEIN);
    return reponse;
  };

  const ouiY = (bas + 0x10 - 2 * hauteurDuBouton()) | 0;
  const ouiX = 0xB0;
  tracer(jeu, s16(ouiX), s16(ouiY), (banque() + 0x456) | 0);
  if (survole(ouiX, ouiY)) return refermer(1);

  const nonY = (bas + 0x10 - 2 * octet(jeu, (banque() + 0x467) | 0)) | 0;
  const nonX = (0x1D0 - octet(jeu, (banque() + 0x466) | 0)) | 0;
  tracer(jeu, s16(nonX), s16(nonY), (banque() + 0x462) | 0);
  if (survole(nonX, nonY)) return refermer(-1);

  jeu.appeler(FERMER_ECRAN_PLEIN);
  return 0;
});

// 0x78E36 — poser une question et attendre la réponse.
//
// Une boucle à part, hors de la boucle du parc : l'écran du moment est gardé dans le tampon de fond,
// puis, à chaque image, les entrées sont relevées (0x1107F), le fond remis, la boîte dessinée
// (0x78F89) et l'image présentée, jusqu'à ce que la boîte rende autre chose que 0. Rend la réponse
// de 0x78F89 : 1 oui, −1 non.
//
// La copie se fait par 200 lignes de 320 octets (0x80E20) en basse résolution, par 0x54ED6 en haute.
// Pour le nombre de lignes, le programme reteste le mode dans la branche basse résolution et choisit
// entre 400 et 480 (divisé par deux) : la branche 480 y est morte.
export const poserUneQuestion = dansLeCadre(0x34, (jeu, cadre, question, titre) => {
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  jeu.appeler(RETIRER_LE_CURSEUR);
  garderLaSurface(jeu);
  for (;;) {
    jeu.appeler(SERVIR_L_HOTE);
    restaurerLeFond(jeu);
    const reponse = jeu.appeler(QUESTION, question, titre);
    if (s16(reponse) !== 0) {
      jeu.appeler(FERMER_ECRAN_PLEIN);
      return reponse;
    }
    jeu.appeler(OUVRIR_ECRAN_PLEIN);
    presenter(jeu);
  }
});

// =================================================================================================
// L'ENTREPÔT
// =================================================================================================
//
// LES MARCHANDISES : la table 0xD3C00, 14 octets par marchandise (economie.js) : +0 le nom (indice
// dans [0xD7BD0]), +2 le prix unitaire, +4 le stock, +6 la quantité en commande, +8 la quantité
// choisie sur le bon de commande de l'entrepôt, +A le délai de livraison en pas, +C les pas écoulés.
// Chaque boutique du catalogue (0xD3C62, fiches de 0x6B octets jusqu'à un mot +0x22 nul) dit en
// +0x67 la marchandise qu'elle vend (−1 : aucune), et en +0x66 bit 0 si elle est disponible.
//
// LA MISE EN PAGE : une fiche de 0xC1 octets par marchandise en 0xBE58B :
//   +0, +2      où écrire le stock (petite police)
//   +4          l'image d'une caisse du stock ; +0x21 et +0x71, quarante positions (x, y) de caisse
//   +6          l'image du camion de livraison, tracé en (+0x12, +0x14)
//   +8          l'image de la caisse livrée, qui descend au bout d'une corde : x en +0x18, y de +0x1A
//               (départ) à +0x1C (arrivée)
//   +A…+10      le rectangle de la marchandise (x0, y0, x1, y1), où l'on clique pour la choisir
//   +1E…+20     la teinte (r, g, b) du bandeau de son nom
// La fiche de rang 6 est celle de l'agrandissement de l'entrepôt : son rectangle, en 0xBEA1B, est le
// bouton qui l'achète.
//
// L'ÉCRAN : [0xDE1D0] la table des images de l'entrepôt (data/mstspr-0.tab), [0xDE1DE] le choix en
// cours — −1 rien, 0 à 5 une marchandise, 6 l'agrandissement. Les barres de capacité : table
// 0xBEAD2, 4 octets par niveau (images du bout gauche, du milieu, du bout droit, nombre de
// milieux) ; 0xB7930 la capacité de chaque niveau (mots), 0xB78E0 son prix (longs).
const MARCHANDISES = 0xD3C00, TAILLE_MARCHANDISE = 14;
const BOUTIQUES = 0xD3C62, TAILLE_BOUTIQUE = 0x6B;
const MISE_EN_PAGE = 0xBE58B, TAILLE_MISE_EN_PAGE = 0xC1;
const AGRANDIR = 0xBEA1B;           // x0, y0, x1, y1 du bouton d'agrandissement (fiche 6, +0xA)
const IMAGES_DE_L_ENTREPOT = 0xDE1D0;   // pointeur : 6 octets par image (+4 largeur, +5 hauteur)
const CHOIX = 0xDE1DE;              // mot signé
const BARRES = 0xBEAD2;
const CAPACITES = 0xB7930;          // mots, par niveau
const PRIX_DES_NIVEAUX = 0xB78E0;   // longs, par niveau
const NIVEAU = 0x4D, NIVEAU_PERMIS = 0x4E, CAPACITE = 0x4B;   // dans la fiche du parc

const imageDeLEntrepot = (jeu, n) => (long(jeu, IMAGES_DE_L_ENTREPOT) + Math.imul(n, 6)) | 0;
const capacite = (jeu) => mot(jeu, (long(jeu, PARC_COURANT) + CAPACITE) | 0);

// 0x798D7 — ouvrir l'entrepôt.
//
// L'écran d'où l'on vient est noté (0xD660E, et 0xB9ED8 pour le retour), l'écran 0x52 ouvert ; le fond
// data/mstock-0.dat est chargé sur la surface puis recopié dans le tampon de fond (400 lignes), la
// palette data/mstpal-0.dat dans 0xCEBE0, les images data/mstspr-0.dat dans la mémoire de [0xBA2F8]
// (la table de fusion, bibliotheque.js, qui sert ici de réserve) et leur table data/mstspr-0.tab dans
// [0xD3BB8] — table que 0x10C80 relie aux images, et qui devient [0xDE1D0].
//
// ANOMALIE REPRODUITE, comme pour l'écran des trophées (fin-annee.js, 0x76F03) : la fin de la table
// (0xDE1D4) est prise à la taille du fichier × 6 au lieu de la taille ; 0x10C80 « reloge » ainsi six
// fois trop d'entrées, c'est-à-dire aussi la mémoire qui suit la table.
//
// Calcul mort, non transcrit : une boucle parcourt le catalogue des boutiques (0xD3C62) et compare
// l'octet +0x67 de chacune à −1 sans rien en faire.
export const ouvrirLEntrepot = dansLeCadre(8, (jeu) => {
  jeu.appeler(CURSEUR, long(jeu, CURSEURS));
  poserMot(jeu, ECRAN_PRECEDENT, mot(jeu, ECRAN));
  poserOctet(jeu, RETOUR_DES_ECRANS, octet(jeu, ECRAN));
  poserMot(jeu, ECRAN, 0x52);
  jeu.appeler(CHARGER_UN_FICHIER, 0xB837C, long(jeu, SURFACE));       // data/mstock-0.dat
  jeu.appeler(RECOPIER_DES_LIGNES, long(jeu, SURFACE), long(jeu, FOND), 400);
  jeu.appeler(CHARGER_UN_FICHIER, 0xB83BB, PALETTE_DE_L_ECRAN);       // data/mstpal-0.dat
  jeu.appeler(CHARGER_UN_FICHIER, 0xB83FA, long(jeu, 0xBA2F8));        // data/mstspr-0.dat
  const taille = jeu.appeler(CHARGER_UN_FICHIER, 0xB8439, long(jeu, 0xD3BB8));   // data/mstspr-0.tab
  poserLong(jeu, 0xDE1D4, (long(jeu, 0xD3BB8) + Math.imul(taille, 6)) | 0);
  jeu.appeler(RELOGER_LES_SPRITES, long(jeu, 0xD3BB8), long(jeu, 0xDE1D4), long(jeu, 0xBA2F8));
  poserLong(jeu, IMAGES_DE_L_ENTREPOT, long(jeu, 0xD3BB8));
  poserLong(jeu, 0xDE1CC, long(jeu, 0xBA2F8));
  jeu.appeler(POSER_LA_PALETTE, PALETTE_DE_L_ECRAN);
  jeu.appeler(CURSEUR, (long(jeu, CURSEURS) + 0x6C) | 0);
});

// 0x7B19C — la barre de capacité d'un niveau d'entrepôt, en (x, y).
//
// Trois images de la table de l'entrepôt, décalées de 0x15 : le bout gauche, un nombre de milieux,
// le bout droit (table 0xBEAD2, quatre octets par niveau), posés bout à bout ; puis, à 8 pixels du
// bout droit et centré sur la hauteur de la barre, « CAPACITE=<n> » (texte [[0xD7BC0]+0xFC], format
// "%s=%d"), n la capacité du niveau (0xB7930), en noir.
export const barreDeCapacite = dansLeCadre(0x4C, (jeu, cadre, x, y, niveau) => {
  const tampon = cadre.local(0x28);
  const barre = (BARRES + (u16(niveau) << 2)) | 0;
  const image = (k) => imageDeLEntrepot(jeu, octet(jeu, (barre + k) | 0) + 0x15);
  let x0 = x | 0;

  let entree = image(0);
  tracer(jeu, s16(x0), s16(y), entree);
  x0 = (x0 + octet(jeu, entree + 4)) | 0;
  for (let k = 0; k < octet(jeu, (barre + 3) | 0); k = (k + 1) & 0xFF) {
    entree = image(1);
    tracer(jeu, s16(x0), s16(y), entree);
    x0 = (x0 + octet(jeu, entree + 4)) | 0;
  }
  entree = image(2);
  tracer(jeu, s16(x0), s16(y), entree);

  jeu.appeler(FORMATER, tampon, 0xB0737, texte(jeu, 0xFC), mot(jeu, (CAPACITES + 2 * u16(niveau)) | 0));
  const yTexte = u16(y) + (octet(jeu, entree + 5) >> 1) - (octet(jeu, HAUTEUR_DE_LIGNE) >> 1);
  jeu.appeler(ECRIRE_TEXTE, s16(x0 + 8 + octet(jeu, entree + 4)), s16(yTexte), tampon, 0, octet(jeu, NOIR));
});

// 0x79A04 — une image de l'entrepôt.
//
// À chaque image, sur le fond de l'écran :
//  1. pour chaque marchandise vendue par une boutique disponible (une boutique indisponible cache la
//     sienne sous un rectangle blanc), des caisses empilées à la mesure du stock — quarante au
//     plus, stock × 40 / capacité — et le stock écrit en petits chiffres ;
//  2. la barre de capacité du niveau actuel (0x7B19C en (0x18A, 0x78)) ;
//  3. pour chaque marchandise en commande, le camion (+6) et la caisse livrée qui descend au bout de
//     sa corde (un trait depuis le haut de l'écran) à mesure que la livraison avance (+C / +A), avec
//     la quantité commandée écrite dessous ; un clic dans le rectangle d'une marchandise la choisit ;
//  4. deux images fixes (19 et 20), le bouton d'agrandissement — il clignote (un rectangle blanc,
//     8 images sur 16) tant qu'un niveau plus haut est permis —, et le panneau de droite :
//       - l'agrandissement choisi : la barre du niveau suivant (0x7B19C en (0x18A, 0xF0)), son prix
//         et sa capacité (texte 0xC8), et le bouton « acheter » (texte 0x74) : un clic monte le
//         niveau, pose la nouvelle capacité et porte le prix au livre (catégorie 0x14) ;
//       - une marchandise choisie : son nom sur un bandeau de sa couleur, prix, stock et valeur du
//         stock, la commande en cours et sa date de livraison, puis le bon de commande : une
//         glissière (0x192 à 0x278 : 0 à la capacité, le bout droit donnant la capacité exacte), la
//         quantité et son coût, et le bouton « commander » (texte 0xD8). La commande part avec un
//         délai tiré au hasard : 2 600 à 3 599 pas si l'on commande autant ou plus qu'avant, 3 600
//         à 4 599 si l'on commande moins, moins deux fois délai / (11 − niveau / 2) selon l'entrepôt, et
//         250 pas au moins ;
//  5. la forme du pointeur (la main sur ce qui se clique) ; Échap, Entrée ou le bouton de sortie
//     (0x238–0x268 × 0x168–0x186) ferment l'écran : la table d'images du parc est rechargée
//     (data/mspr-0.tab), l'écran d'avant rouvert (0x1B23A), puis le fondu (0x7C32D).
// Les clics ne sont suivis d'effet qu'au jeu complet, et hors grève des fournisseurs.
//
// ANOMALIES REPRODUITES :
//  - le bouton d'agrandissement et le pointeur au-dessus de lui prennent pour bord bas le mot +0x496
//    de la dernière fiche de mise en page vue (0xBE58B + 0xC1 × marchandise), et non 0xBEA21 : de
//    la dernière boutique du catalogue, ou de la marchandise choisie quand le panneau vient d'être
//    dessiné. +0x496 ne tombe sur le bord bas du bouton que pour la marchandise 0 ;
//  - une boutique sans marchandise (+0x67 = −1) est traitée comme une marchandise −1 indisponible :
//    le rectangle blanc est tracé d'après la fiche de mise en page qui précède la table (0xBE4CA) ;
//  - le bouton « commander » est tracé jusqu'à 0x170 + hauteur de ligne, mais le clic n'est pris que
//    jusqu'à 0x16C + hauteur ; au clic, la sortie du pointeur est testée d'après la même largeur,
//    laissée par le dernier panneau dessiné (−1 sans panneau : la zone est alors vide) ;
//  - la commande passe au jeu complet même pendant une grève des fournisseurs : ce test-là, seul,
//    oublie l'octet +0x683 des comptes (la glissière, elle, le respecte).
//
// Non atteint, non établi : une marchandise en commande à délai nul diviserait par zéro (exception
// du processeur, le jeu s'arrêtait) ; une capacité nulle aussi.
export const ecranDeLEntrepot = dansLeCadre(0x1B0, (jeu, cadre) => {
  const tampon = cadre.local(0x134);
  const couleur = (r, v, b) => jeu.appeler(COULEUR_LA_PLUS_PROCHE, PALETTE_DE_L_ECRAN, r, v, b) & 0xFF;
  const noir = couleur(0, 0, 0);
  couleur(0x2B, 0x16, 5);             // un brun, calculé et jamais employé
  const blanc = couleur(0x3F, 0x3F, 0x3F);
  const grisSombre = couleur(0x10, 0x10, 0x10);
  const gris = couleur(0x20, 0x20, 0x20);
  const grisClair = couleur(0x30, 0x30, 0x30);
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  const ligne = u16(octet(jeu, HAUTEUR_DE_LIGNE) + 2);
  restaurerLeFond(jeu);

  const marchandise = (k) => (MARCHANDISES + Math.imul(k, TAILLE_MARCHANDISE)) | 0;
  const miseEnPage = (k) => (MISE_EN_PAGE + Math.imul(k, TAILLE_MISE_EN_PAGE)) | 0;
  const boutiques = function* () {
    for (let b = BOUTIQUES; mot(jeu, b + 0x22) !== 0; b += TAILLE_BOUTIQUE) yield b;
  };
  const numero = (b) => octetSigne(jeu, b + 0x67);

  // Les variables de l'original qui survivent d'une étape à l'autre : la dernière fiche de mise en
  // page vue ([ebp-0x2c]) et le dernier compte ou la dernière largeur calculés ([ebp-0x3c]).
  let fiche = 0, dernier = 0;

  // Quelles marchandises sont en vente : une boutique disponible qui la vend (la dernière boutique
  // qui en parle a le dernier mot).
  const enVente = new Map();
  for (const b of boutiques()) {
    enVente.set(numero(b), numero(b) !== -1 && (octet(jeu, b + 0x66) & 1) !== 0);
  }

  // 1. Le stock : des caisses, et le nombre.
  for (const b of boutiques()) {
    const k = numero(b);
    if (!enVente.get(k)) continue;
    const m = marchandise(k);
    fiche = miseEnPage(k);
    dernier = idiv(Math.imul(idiv(Math.imul(mot(jeu, m + 4), 100), capacite(jeu)), 40), 100) - 1;
    for (; dernier >= 0; dernier--) {
      tracer(jeu, motSigne(jeu, fiche + 0x21 + 2 * dernier), motSigne(jeu, fiche + 0x71 + 2 * dernier),
        imageDeLEntrepot(jeu, mot(jeu, fiche + 4)));
    }
    jeu.appeler(FORMATER, tampon, FORMAT_ENTIER, mot(jeu, m + 4));
    petitTexte(jeu, motSigne(jeu, fiche), motSigne(jeu, fiche + 2), tampon, noir);
  }

  // 2. La barre du niveau actuel.
  jeu.appeler(0x7B19C, 0x18A, 0x78, octet(jeu, (long(jeu, PARC_COURANT) + NIVEAU) | 0));

  // 3. Les livraisons, et le choix d'une marchandise.
  let survol = 0;
  for (const b of boutiques()) {
    const k = numero(b);
    fiche = miseEnPage(k);
    if (!enVente.get(k)) {
      jeu.appeler(RECTANGLE_PLEIN, motSigne(jeu, fiche + 0xA), motSigne(jeu, fiche + 0xC),
        s16(mot(jeu, fiche + 0xE) - mot(jeu, fiche + 0xA)), s16(mot(jeu, fiche + 0x10) - mot(jeu, fiche + 0xC)), blanc);
      continue;
    }
    const m = marchandise(k);
    if (mot(jeu, m + 6) !== 0) {
      const avance = idiv(Math.imul(mot(jeu, fiche + 0x1C) - mot(jeu, fiche + 0x1A) + 8,
        idiv(Math.imul(mot(jeu, m + 0xC), 100), mot(jeu, m + 0xA))), 100);
      const caisse = imageDeLEntrepot(jeu, mot(jeu, fiche + 8));
      tracer(jeu, motSigne(jeu, fiche + 0x12), motSigne(jeu, fiche + 0x14), imageDeLEntrepot(jeu, mot(jeu, fiche + 6)));
      const largeur = octet(jeu, caisse + 4), hauteur = octet(jeu, caisse + 5);
      const y = s16(mot(jeu, fiche + 0x1A) + avance - hauteur);
      tracer(jeu, motSigne(jeu, fiche + 0x18), y, caisse);
      if (y - 4 > 0) {
        // La corde : du haut de l'écran jusqu'au-dessus de la caisse.
        const x = s16(mot(jeu, fiche + 0x18) + (largeur >> 1));
        jeu.appeler(basseResolution(jeu) ? LIGNE_BASSE : LIGNE_HAUTE, x, 0, x, s16(y - 4), noir);
      }
      const yChiffre = (y + hauteur - idiv(hauteur, 3)) | 0;
      if (yChiffre > 0) {
        jeu.appeler(FORMATER, tampon, FORMAT_ENTIER, mot(jeu, m + 6));
        petitTexte(jeu, s16(mot(jeu, fiche + 0x18) + 4), s16(yChiffre & 0xFFFE), tampon, noir);
      }
    }
    if (pointeurDans(jeu, mot(jeu, fiche + 0xA), mot(jeu, fiche + 0xC), mot(jeu, fiche + 0xE), mot(jeu, fiche + 0x10))) {
      survol = 1;
      if (clicTenu(jeu)) {
        if (commandesPermises(jeu)) {
          jeu.appeler(BRUITAGE, 0, 0x19);
          poserMot(jeu, CHOIX, k);
        }
        oublierLeClic(jeu);
      }
    }
  }

  // 4. Les images fixes, le bouton d'agrandissement, le panneau de droite.
  tracer(jeu, 0x14C, 0xA0, imageDeLEntrepot(jeu, 19));
  tracer(jeu, 0x148, 0x142, imageDeLEntrepot(jeu, 20));
  const surAgrandir = () => pointeurDans(jeu, mot(jeu, AGRANDIR), mot(jeu, AGRANDIR + 2),
    mot(jeu, AGRANDIR + 4), mot(jeu, (fiche + 0x496) | 0));
  if (clicTenu(jeu) && surAgrandir()) {
    jeu.appeler(CURSEUR, (long(jeu, CURSEURS) + 0x66) | 0);
    if (commandesPermises(jeu)) poserMot(jeu, CHOIX, 6);
    oublierLeClic(jeu);
  }
  const parc = () => long(jeu, PARC_COURANT);
  const agrandissable = () => octet(jeu, (parc() + NIVEAU_PERMIS) | 0) > octet(jeu, (parc() + NIVEAU) | 0);
  if (agrandissable() && (long(jeu, PAS_DE_SIMULATION) & 0xF) > 7) {
    jeu.appeler(RECTANGLE_PLEIN, motSigne(jeu, AGRANDIR), motSigne(jeu, AGRANDIR + 2),
      s16(mot(jeu, AGRANDIR + 4) - mot(jeu, AGRANDIR)), s16(mot(jeu, AGRANDIR + 6) - mot(jeu, AGRANDIR + 2)), blanc);
  }

  // Un bouton de texte en (0x18A, 0x168), large du texte plus huit.
  const bouton = (intitule) => {
    dernier = (jeu.appeler(LARGEUR_DU_TEXTE, intitule) + 8) | 0;
    jeu.appeler(CADRE_BISEAUTE, 0x18A, 0x168, u16(0x18A + dernier), u16(0x170 + ligne), grisSombre, grisClair);
    jeu.appeler(ECRIRE_TEXTE, 0x18E, 0x16E, intitule, 0, noir);
  };
  const surLeBouton = (bas) => pointeurDans(jeu, 0x18A, 0x168, (dernier + 0x18A) | 0, s16(ligne) + bas);
  const ecrire = (x, y, chaine) => jeu.appeler(ECRIRE_TEXTE, x, s16(y), chaine, 0, noir);

  const choix = motSigne(jeu, CHOIX);
  if (choix === 6) {
    if (agrandissable()) {
      const niveau = octet(jeu, (parc() + NIVEAU) | 0);
      jeu.appeler(0x7B19C, 0x18A, 0xF0, niveau + 1);
      jeu.appeler(FORMATER, tampon, texte(jeu, 0xC8), long(jeu, (PRIX_DES_NIVEAUX + 4 + 4 * niveau) | 0),
        mot(jeu, (CAPACITES + 2 + 2 * niveau) | 0));
      bouton(texte(jeu, 0x74));
      if (clicTenu(jeu) && surLeBouton(0x170)) {
        if (commandesPermises(jeu)) {
          jeu.appeler(BRUITAGE, 0, 0x1A);
          const p = parc();
          poserOctet(jeu, p + NIVEAU, octet(jeu, p + NIVEAU) + 1);
          const nouveau = octet(jeu, p + NIVEAU);
          poserMot(jeu, parc() + CAPACITE, mot(jeu, (CAPACITES + 2 * nouveau) | 0));
          jeu.appeler(INSCRIRE_AU_LIVRE, 0x14, -long(jeu, (PRIX_DES_NIVEAUX + 4 * octet(jeu, parc() + NIVEAU)) | 0) | 0);
        }
        oublierLeClic(jeu);
      }
      jeu.appeler(TEXTE_DANS_UN_CADRE, 0x192, 0xAE, 0x270, 0x190, tampon, noir, 0);
    }
  } else if (choix >= 0) {
    const m = marchandise(choix);
    fiche = miseEnPage(choix);
    const bandeau = couleur(octet(jeu, fiche + 0x1E), octet(jeu, fiche + 0x1F), octet(jeu, fiche + 0x20));
    jeu.appeler(RECTANGLE_PLEIN, 0x166, 0x60, 0x11A, 0x14, bandeau);
    jeu.appeler(ECRIRE_CENTRE, 0x16C, 0x268, 0x64, long(jeu, (long(jeu, NOMS) + 4 * mot(jeu, m)) | 0), 0, noir);
    // Les lignes du panneau : un intitulé à gauche, un nombre ("%-5d") à droite.
    const chiffre = (y, valeur, format = 0xB0732) => {
      jeu.appeler(FORMATER, tampon, format, valeur);
      ecrire(0x22A, y, tampon);
    };
    ecrire(0x18A, 0xAC + ligne, texte(jeu, 0x14));                  // prix
    chiffre(0xAC + ligne, mot(jeu, m + 2));
    ecrire(0x18A, 0xAC + 2 * ligne, texte(jeu, 0x18));              // stock
    chiffre(0xAC + 2 * ligne, mot(jeu, m + 4));
    ecrire(0x18A, 0xAC + 3 * ligne, texte(jeu, 0x1C));              // valeur
    chiffre(0xAC + 3 * ligne, Math.imul(mot(jeu, m + 4), mot(jeu, m + 2)));
    if (mot(jeu, m + 6) !== 0) {
      ecrire(0x18A, 0xAC + 5 * ligne, texte(jeu, 0x20));            // en commande
      chiffre(0xAC + 5 * ligne, mot(jeu, m + 6));
      ecrire(0x18A, 0xAC + 6 * ligne, texte(jeu, 0x1C));            // valeur
      chiffre(0xAC + 6 * ligne, Math.imul(mot(jeu, m + 2), mot(jeu, m + 6)));
      ecrire(0x18A, 0xAC + 7 * ligne, texte(jeu, 0x24));            // livraison le
      // La date d'arrivée : le pas de simulation où la livraison s'achève, en « jour MOIS ».
      dernier = (long(jeu, PAS_DE_SIMULATION) - mot(jeu, m + 0xC) + mot(jeu, m + 0xA)) | 0;
      const mois = idiv(imod(dernier, 12000), 1000);
      const nomDuMois = long(jeu, (long(jeu, NOMS_DES_MOIS) + 4 * mois) | 0);
      const jour = idiv(imod(dernier, 1000), octet(jeu, (JOURS_DU_MOIS + mois) | 0)) + 1;
      jeu.appeler(FORMATER, tampon, 0xB0729, jour, nomDuMois);        // "%d %s"
      ecrire(0x22A, 0xAC + 7 * ligne, tampon);
    }
    // Le bon de commande : la glissière, la quantité, son coût.
    ecrire(0x192, 0x124 - ligne, texte(jeu, 0x28));
    dernier = idiv(Math.imul(idiv(Math.imul(mot(jeu, m + 8), 100), capacite(jeu)), 0xE6), 100);
    jeu.appeler(RECTANGLE_PLEIN, 0x192, 0x124, s16(dernier), 0x20, gris);
    jeu.appeler(CADRE_BISEAUTE, 0x192, 0x124, 0x278, 0x144, grisSombre, grisClair);
    jeu.appeler(FORMATER, tampon, texte(jeu, 0xC0), mot(jeu, m + 8));
    ecrire(0x18A, 0x14A, tampon);
    jeu.appeler(FORMATER, tampon, texte(jeu, 0x104), Math.imul(mot(jeu, m + 2), mot(jeu, m + 8)));
    ecrire(0x18A, 0x14A + ligne, tampon);
    if (clicTenu(jeu) && pointeurDans(jeu, 0x192, 0x124, 0x278, 0x144)) {
      jeu.appeler(CURSEUR, (long(jeu, CURSEURS) + 0x66) | 0);
      if (commandesPermises(jeu)) {
        jeu.appeler(BRUITAGE, 0, 0x29);
        const x = motSigne(jeu, SOURIS_X);
        if (x >= 0x276 && x <= 0x27A) poserMot(jeu, m + 8, capacite(jeu));
        else poserMot(jeu, m + 8, idiv(Math.imul(capacite(jeu), x - 0x192), 0xE6));
      }
    }
    bouton(texte(jeu, 0xD8));
    // Pourquoi l'on ne peut pas commander : hors du jeu complet (texte 0xE8), ou pendant une grève
    // des fournisseurs (texte 0x180).
    if (octet(jeu, NIVEAU_DE_JEU) !== 2) jeu.appeler(MESSAGE_EN_BAS, PALETTE_DE_L_ECRAN, texte(jeu, 0xE8));
    else if (octet(jeu, (long(jeu, COMPTES_COURANTS) + 0x683) | 0) !== 0) {
      jeu.appeler(MESSAGE_EN_BAS, PALETTE_DE_L_ECRAN, texte(jeu, 0x180));
    }
    if (clicTenu(jeu) && surLeBouton(0x16C)) {
      jeu.appeler(CURSEUR, (long(jeu, CURSEURS) + 0x66) | 0);
      if (mot(jeu, m + 8) !== 0 && octet(jeu, NIVEAU_DE_JEU) === 2) {
        jeu.appeler(BRUITAGE, 0, 0x1F);
        // Le délai de livraison : tiré au hasard, plus long si l'on commande moins que la commande
        // en cours, puis raccourci selon le niveau de l'entrepôt.
        const base = mot(jeu, m + 8) < mot(jeu, m + 6) ? 0xE10 : 0xA28;
        poserMot(jeu, m + 0xA, imod(jeu.appeler(HASARD) & 0xFFFF, 1000) + base);
        const diviseur = 0xB - (octet(jeu, (parc() + NIVEAU) | 0) >> 1);
        poserMot(jeu, m + 0xA, mot(jeu, m + 0xA) - 2 * idiv(mot(jeu, m + 0xA), diviseur));
        if (mot(jeu, m + 0xA) < 0xFA) poserMot(jeu, m + 0xA, 0xFA);
        poserMot(jeu, m + 0xC, 1);
        poserMot(jeu, m + 6, mot(jeu, m + 8));
        poserMot(jeu, m + 8, 0);
      }
      oublierLeClic(jeu);
    }
  }

  // 5. La forme du pointeur : la main sur ce qui se clique, la flèche ailleurs.
  const main = (long(jeu, CURSEURS) + 0x66) | 0;
  const surLaSortie = () => pointeurDans(jeu, 0x238, 0x168, 0x268, 0x186);
  if (surLaSortie() || surLeBouton(0x16C) || pointeurDans(jeu, 0x192, 0x124, 0x278, 0x144)
    || surAgrandir() || s16(survol) !== 0) jeu.appeler(CURSEUR, main);
  else jeu.appeler(CURSEUR, (long(jeu, CURSEURS) + 0x6C) | 0);

  // La sortie : Échap, Entrée, ou un clic sur le bouton du bas à droite.
  const touche = octet(jeu, TOUCHE);
  if (touche === 1 || touche === 0x1C || (clicTenu(jeu) && surLaSortie())) {
    jeu.appeler(CURSEUR, main);
    oublierLeClic(jeu);
    jeu.appeler(BRUITAGE, 0, 0x1A);
    // La table des images du parc revient (data/mspr-0.tab), reliée à ses images.
    jeu.appeler(CHARGER_UN_FICHIER, 0xB0C0A, long(jeu, 0xD3BB8));
    jeu.appeler(RELOGER_LES_SPRITES, long(jeu, 0xD3BB8), long(jeu, 0xD3B88), long(jeu, 0xD3BA8));
    poserMot(jeu, ECRAN, octet(jeu, RETOUR_DES_ECRANS));
    if (basseResolution(jeu)) jeu.appeler(REMPLIR_320, long(jeu, SURFACE), 0x190, 0);
    else jeu.appeler(REMPLIR_640, long(jeu, SURFACE), 0x1E0, 0);
    presenter(jeu);
    jeu.appeler(ROUVRIR_UN_ECRAN, octet(jeu, RETOUR_DES_ECRANS));
    jeu.appeler(ETEINDRE_L_ECRAN);
    jeu.appeler(CURSEUR, (long(jeu, CURSEURS) + 6) | 0);
    jeu.appeler(FERMER_ECRAN_PLEIN);
  }
  jeu.appeler(ATTENDRE_BALAYAGE);
});

// =================================================================================================
// LA VENTE AUX ENCHÈRES
// =================================================================================================
//
// [0xDE1C8] la mise (la prochaine enchère), [0xDE1C4] la dernière enchère, [0xDE1D8] le joueur qui
// l'a portée (−1 : personne encore), [0xDE1DA] le compte à rebours au moment de cette enchère,
// [0xDE1DC] le compte à rebours des images de la vente. [0xDE1C0] la table des images de la salle,
// [0xDE1B8] sa fin, [0xDE1BC] les images.
const MISE = 0xDE1C8, ENCHERE = 0xDE1C4, ENCHERISSEUR = 0xDE1D8;
const RESTE_A_L_ENCHERE = 0xDE1DA, RESTE = 0xDE1DC;
const IMAGES_DE_LA_SALLE = 0xDE1C0;
const RESERVE_D_IMAGES = 0xD3BA0;     // pointeur : une réserve où charger des images
// Le commissaire-priseur : table 0xBEB86, 7 octets par pose (+0 l'image, +1 x, +3 y) ; la marque de
// chaque joueur dans la salle : table 0xBEB26, 4 octets par joueur (x, y).
const POSES = 0xBEB86, PLACES = 0xBEB26;

// 0x7B65C — préparer une vente aux enchères, à la mise à prix donnée.
//
// Le fond de la salle (data/mauct-0.dat) est chargé sur la surface ; s'il manque, rien d'autre ne se
// fait. Sinon les images (data/mauspr-0.dat) vont dans la réserve [0xD3BA0], leur table
// (data/mauspr-0.tab) 30 000 octets plus loin, reliée aux images ; le fond est recopié dans le
// tampon de fond ; la vente durera 0x744 images, sans enchérisseur, et l'écran 0x62 s'ouvre.
export const preparerLaVente = dansLeCadre(4, (jeu, cadre, miseAPrix) => {
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  if (jeu.appeler(CHARGER_UN_FICHIER, 0xB8478, long(jeu, SURFACE)) === 0) return;   // data/mauct-0.dat
  poserLong(jeu, 0xDE1BC, long(jeu, RESERVE_D_IMAGES));
  poserLong(jeu, IMAGES_DE_LA_SALLE, (long(jeu, RESERVE_D_IMAGES) + 30000) | 0);
  jeu.appeler(CHARGER_UN_FICHIER, 0xB84B7, long(jeu, RESERVE_D_IMAGES));            // data/mauspr-0.dat
  const taille = jeu.appeler(CHARGER_UN_FICHIER, 0xB84F6, (long(jeu, RESERVE_D_IMAGES) + 30000) | 0);   // .tab
  poserLong(jeu, 0xDE1B8, (taille + long(jeu, RESERVE_D_IMAGES) + 30000) | 0);
  jeu.appeler(RELOGER_LES_SPRITES, long(jeu, IMAGES_DE_LA_SALLE), long(jeu, 0xDE1B8), long(jeu, RESERVE_D_IMAGES));
  jeu.appeler(RECOPIER_DES_LIGNES, long(jeu, SURFACE), long(jeu, FOND), 400);
  poserMot(jeu, RESTE, 0x744);
  poserMot(jeu, ENCHERISSEUR, 0xFFFF);
  poserLong(jeu, MISE, miseAPrix);
  poserMot(jeu, ECRAN, 0x62);
});

// 0x7B73E — la vente aux enchères.
//
// Une boucle d'images, jusqu'à la fin du compte à rebours (0x744 images) ou à l'adjudication. Chaque
// image : la file des événements (0x2CCF8), le fond, puis en haut le nom du joueur, le titre (texte
// 0x190) et la mise à prix (texte 0x194) ; en petits caractères le nom du parc (0xD66D0), la mise,
// et le compte à rebours divisé par 62.
//
// Tant que personne n'a enchéri, on cherche un acheteur à chaque image (0x73EE8 : le premier joueur
// assez riche pour la mise, hors le vendeur) ; s'il y en a un, son enchère est notée (0x7C128). Le
// commissaire-priseur prend ses poses une à une, de la 9ᵉ à la 13ᵉ, une toutes les 25 images.
//
// Après une enchère : le nom de l'enchérisseur, son prix, sa marque dans la salle, et le
// commissaire-priseur qui s'anime (poses 0 à 19 en boucle, une toutes les 25 images, pendant 125
// images ; puis il avance jusqu'à la 8ᵉ). Toutes les 186 images (0xBA) sans nouvelle enchère, la
// vente passe au cran suivant, qui relance l'animation : « une fois » (texte 0xDC), « deux fois »
// (texte 0xE0 ; à chaque image un autre acheteur peut surenchérir, sauf dans les huit dernières),
// « adjugé » (texte 0xE4, avec le prix) — la vente est finie. Le cran est écrit à droite, aligné sur
// 0x22E ; au-delà (un cran négatif ou supérieur à 2), le texte de l'image précédente est repris.
//
// Un clic joue le bruitage 0x25 ; sur le bouton (0x22C–0x268, 0x164–0x182), il arrête la vente.
// ANOMALIE REPRODUITE, sans effet : un premier test, sur 0x1E0–0x222 × 0x164–0x182, est fait puis
// oublié — ses deux issues mènent au test suivant.
//
// À la fin, la surface est gardée dans le tampon de fond ; en partie à plusieurs, la salle reste
// affichée jusqu'à 186 images de plus (tant qu'il en reste au compte à rebours), le temps que les
// autres joueurs finissent. La réserve [0xD3BA0] reprend data/mblk-0.dat, l'écran se ferme, et
// l'écran courant redevient le parc. Rend l'enchérisseur (mot [0xDE1D8], −1 : aucun) ; les deux
// octets hauts d'eax sont ceux qu'a laissés 0x40D79.
//
// Calcul mort, non transcrit : la moitié de l'octet +0xB de la table des images de la salle, rangée
// dans une variable jamais relue.
export const venteAuxEncheres = dansLeCadre(0xFC, (jeu, cadre) => {
  const tampon = cadre.local(0x80);
  let adjuge = false;
  let pose = 9;                      // la pose du commissaire-priseur, sans enchère
  let animation = 0, images = 0;     // son animation après une enchère, et le compte de ses images
  const poseDuCommissaire = (n) => {
    const p = (POSES + Math.imul(u16(n), 7)) | 0;
    jeu.appeler(DESSINER_IMAGE, mot(jeu, p + 1), mot(jeu, p + 3),
      (long(jeu, IMAGES_DE_LA_SALLE) + Math.imul(octet(jeu, p), 6)) | 0, 0);
  };
  const petit = (x, y, chaine) => petitTexte(jeu, x, y, chaine, octet(jeu, FOND_DE_CASE));
  const chercherUnAcheteur = () => jeu.appeler(TROUVER_UN_ACHETEUR, long(jeu, MISE), octetSigne(jeu, ENCHERISSEUR));

  for (; !adjuge && mot(jeu, RESTE) !== 0; poserMot(jeu, RESTE, mot(jeu, RESTE) - 1)) {
    jeu.appeler(FILE_DES_EVENEMENTS);
    restaurerLeFond(jeu);

    // Les trois lignes du haut, centrées entre 0x76 et 0x17A.
    let y = 0x44;
    const ligneDuHaut = () => {
      y = (y + octet(jeu, HAUTEUR_DE_LIGNE) + 6) | 0;
      jeu.appeler(ECRIRE_CENTRE, 0x76, 0x17A, s16(y), tampon, 0, octet(jeu, BLANC_CASSE));
    };
    jeu.appeler(FORMATER, tampon, FORMAT_TEXTE, jeu.appeler(NOM_D_UN_JOUEUR, octet(jeu, JOUEUR_COURANT)));
    ligneDuHaut();
    jeu.appeler(FORMATER, tampon, FORMAT_TEXTE, texte(jeu, 0x190));
    ligneDuHaut();
    jeu.appeler(FORMATER, tampon, texte(jeu, 0x194), long(jeu, MISE));
    ligneDuHaut();

    petit(0x18, 0x164, 0xD66D0);                                  // le nom du parc
    jeu.appeler(FORMATER, tampon, FORMAT_ENTIER, long(jeu, MISE));
    petit(0xF0, 0x164, tampon);
    jeu.appeler(FORMATER, tampon, FORMAT_ENTIER, idiv(motSigne(jeu, RESTE), 0x3E));
    petit(0x162, 0x16C, tampon);

    if (motSigne(jeu, ENCHERISSEUR) >= 0) {
      images = (images + 1) | 0;
      if (u16(images) < 0x7D) {
        if (u16(images) % 25 === 0) {
          animation = (animation + 1) | 0;
          if (u16(animation) > 0x13) animation = 0;
        }
      } else if (u16(images) % 25 !== 0 && u16(animation) < 8) {
        animation = (animation + 1) | 0;
      }
      poseDuCommissaire(animation);
      petit(0x18, 0x174, jeu.appeler(NOM_D_UN_JOUEUR, octet(jeu, ENCHERISSEUR)));
      jeu.appeler(FORMATER, tampon, FORMAT_ENTIER, long(jeu, ENCHERE));
      petit(0xF0, 0x174, tampon);
      const place = (PLACES + (motSigne(jeu, ENCHERISSEUR) << 2)) | 0;
      jeu.appeler(DESSINER_IMAGE, mot(jeu, place), mot(jeu, place + 2), (long(jeu, IMAGES_DE_LA_SALLE) + 6) | 0, 0);

      // Le cran de la vente : un par tranche de 186 images depuis la dernière enchère.
      const ecoule = motSigne(jeu, RESTE_A_L_ENCHERE) - motSigne(jeu, RESTE);
      const cran = idiv(ecoule, 0xBA);
      if (s16(cran) !== idiv(ecoule - 1, 0xBA)) { animation = 0; images = 0x7D; }
      if (u16(cran) === 0 || u16(cran) === 1) {
        jeu.appeler(FORMATER, tampon, texte(jeu, 0xDC + 4 * s16(cran)));
        if (u16(cran) === 1) {
          const acheteur = chercherUnAcheteur();
          if (s16(acheteur) >= 0 && motSigne(jeu, RESTE) > 8) jeu.appeler(NOTER_L_ENCHERE, u16(acheteur));
        }
      } else if (u16(cran) === 2) {
        jeu.appeler(FORMATER, tampon, texte(jeu, 0xE4), long(jeu, ENCHERE));
        adjuge = true;
      }
      jeu.appeler(ECRIRE_TEXTE, s16(0x22E - jeu.appeler(LARGEUR_DU_TEXTE, tampon)), 0x80, tampon, 0,
        octet(jeu, FOND_DE_CASE));
    } else {
      const acheteur = chercherUnAcheteur();
      if (s16(acheteur) >= 0) jeu.appeler(NOTER_L_ENCHERE, u16(acheteur));
      poseDuCommissaire(pose);
      if (motSigne(jeu, RESTE) % 25 === 0 && u16(pose) < 0xD) pose = (pose + 1) | 0;
    }

    if (clicTenu(jeu)) {
      jeu.appeler(BRUITAGE, 0, 0x25);
      oublierLeClic(jeu);
      if (pointeurDans(jeu, 0x22C, 0x164, 0x268, 0x182)) adjuge = true;
    }
    jeu.appeler(ATTENDRE_BALAYAGE);
    presenter(jeu);
  }

  garderLaSurface(jeu);
  if (motSigne(jeu, RESTE) > 0 && octet(jeu, JOUEURS_EN_RESEAU) > 1) {
    const limite = s16(mot(jeu, RESTE) - 0xBA);
    for (; motSigne(jeu, RESTE) > limite && motSigne(jeu, RESTE) > 0; poserMot(jeu, RESTE, mot(jeu, RESTE) - 1)) {
      jeu.appeler(FILE_DES_EVENEMENTS);
      restaurerLeFond(jeu);
      jeu.appeler(ATTENDRE_BALAYAGE);
      presenter(jeu);
    }
  }
  jeu.appeler(CHARGER_UN_FICHIER, 0xB0D46, long(jeu, RESERVE_D_IMAGES));   // data/mblk-0.dat
  const eax = jeu.appeler(FERMER_ECRAN_PLEIN);
  poserMot(jeu, REDESSINER_CARTE, 1);
  poserMot(jeu, ECRAN, 0);
  return ((eax & 0xFFFF0000) | mot(jeu, ENCHERISSEUR)) | 0;
});

// 0x7C16C — la ligne de message au bas d'un écran plein (l'entrepôt, la bourse, la recherche) : un
// bandeau noir sur toute la largeur, haut d'une ligne de texte et quatre pixels, et le texte en
// blanc à x = 4. Les couleurs sont cherchées dans la palette `palette` (0x80250). Le bandeau finit
// deux pixels au-dessus du texte : il commence 6 pixels (12 en 320x200) plus 2 au-dessus du bas de
// l'écran, le texte 6 (12) au-dessus.
export function messageEnBas(jeu, palette, message) {
  const noir = jeu.appeler(COULEUR_LA_PLUS_PROCHE, palette, 0, 0, 0) & 0xFF;
  const hauteurEcran = basseResolution(jeu) ? 0x190 : 0x1E0;
  const marge = basseResolution(jeu) ? 0xC : 6;
  jeu.appeler(RECTANGLE_PLEIN, 0, s16(hauteurEcran - marge - 2), 0x280, s16(octet(jeu, HAUTEUR_DE_LIGNE) + 4), noir);
  const blanc = jeu.appeler(COULEUR_LA_PLUS_PROCHE, palette, 0x3F, 0x3F, 0x3F) & 0xFF;
  jeu.appeler(ECRIRE_TEXTE, 4, s16(hauteurEcran - marge), message, 0, blanc);
}

// =================================================================================================

// 0x7C128 — noter l'enchère d'un joueur (celui que 0x73EE8 a trouvé) : il devient l'enchérisseur, sa
// mise devient la dernière enchère, le compte à rebours du moment est retenu, et la mise suivante
// monte d'un dixième (division entière). Non exercée : dans fin-annee.json, aucun concurrent n'est
// assez riche pour enchérir.
function noterLEnchere(jeu, joueur) {
  poserMot(jeu, ENCHERISSEUR, joueur);
  poserLong(jeu, ENCHERE, long(jeu, MISE));
  poserMot(jeu, RESTE_A_L_ENCHERE, mot(jeu, RESTE));
  poserLong(jeu, MISE, long(jeu, MISE) + Math.floor(long(jeu, MISE) / 10));
}

export const reecritures = [
  { adresse: 0x78F89, nom: 'poserLaQuestion', fn: poserLaQuestion, arguments: 2, retour: true },
  { adresse: 0x78E36, nom: 'poserUneQuestion', fn: poserUneQuestion, arguments: 2, retour: true },
  { adresse: 0x798D7, nom: 'ouvrirLEntrepot', fn: ouvrirLEntrepot, arguments: 0 },
  { adresse: 0x7B19C, nom: 'barreDeCapacite', fn: barreDeCapacite, arguments: 3 },
  { adresse: 0x79A04, nom: 'ecranDeLEntrepot', fn: ecranDeLEntrepot, arguments: 0 },
  { adresse: 0x7B65C, nom: 'preparerLaVente', fn: preparerLaVente, arguments: 1 },
  { adresse: 0x7B73E, nom: 'venteAuxEncheres', fn: venteAuxEncheres, arguments: 0, retour: true },
  { adresse: 0x7C16C, nom: 'messageEnBas', fn: messageEnBas, arguments: 2 },
];

export const enAttente = [
  { adresse: 0x7C128, nom: 'noterLEnchere', fn: noterLEnchere, arguments: 1 },
];
