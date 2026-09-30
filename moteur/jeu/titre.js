// L'écran titre, sa fiche du joueur, et la carte du monde.
//
// Réécriture lisible des fonctions 0x5606C, 0x560D2, 0x56532, 0x56E7E, 0x575A7, 0x576FE, 0x57193,
// 0x5B55A, 0x5B82A, 0x1AF83 et 0x1B513 du jeu d'origine. Voir docs/guide-reecriture.md.
//
// CE QUE VOIT LE JOUEUR. Après l'écran titre (0x1A836, amorcage.js), « NOUVEAU PROPRIETAIRE » (F1)
// ouvre deux écrans qui tournent chacun dans leur propre boucle, hors de la boucle du parc :
//
//  1. **INFORMATIONS JOUEUR** (0x576FE) : treize lignes — le nom, le surnom, l'âge, le sexe, le nom
//     du parc, puis six réglages de partie —, la ligne choisie écrite en couleur, et le bouton
//     TERMINE. Les trois premières lignes se tapent au clavier, les six dernières se choisissent
//     parmi deux à quatre cases alignées.
//  2. **LA CARTE DU MONDE** (0x560D2) : le planisphère, un repère par pays, le nom et le prix du
//     terrain survolé, et le solde du joueur en haut. Un clic sur un pays ouvre sa fiche (0x56532 :
//     population, inflation, impôts, climat, terrain, et le bouton ACHETER), ou, si le pays est
//     déjà pris, la fiche de son propriétaire (0x57193). La carte rend le pays du joueur, ou −1
//     s'il n'en a pas choisi : c'est ainsi que l'écran titre sait s'il faut entrer dans le parc.
//
// Le module porte aussi le départ et l'arrêt de la **démonstration** (0x5B55A et 0x5B82A), que le
// premier appel de la boucle principale (0x1107F) déclenche au bout de 3 000 images sans un geste ;
// et deux autres écrans de l'écran titre, qui tournent eux aussi dans leur propre boucle : la liste
// des dix emplacements de sauvegarde (0x1AF83, F2) et les remerciements (0x1B513, F5).
//
// -------------------------------------------------------------------------------------------------
// LE RESTE DE PILE DE 0x576FE (journal des essais, § 5.6)
//
// 0x576FE lit sa variable `[ebp-0x14]`, la ligne choisie, sans l'avoir écrite (en 0x57CA0, au début
// de chaque tour de sa boucle ; elle n'est écrite qu'au premier clic ou à la première flèche). Son
// prologue empile ebx, esi, edi puis `enter 0xE8, 0` : ebp vaut E − 16, E étant le pointeur de pile
// à l'entrée, et `[ebp-0x14]` tombe donc en **E − 36**. Or l'écran titre (0x1A836) écrit ses lignes
// juste avant par la routine de texte 0x3F49E, appelée avec cinq arguments : son point d'entrée est
// E3 = (E + 4) − 20 − 4 = E − 20, et son propre prologue y sauve `ebp` en E3 − 16 = E − 36. C'est le
// même octet. La ligne dont le numéro l'égale s'affiche comme choisie ; dans le jeu d'origine cet
// octet est constant et assez grand pour ne désigner aucune ligne, si bien que l'anomalie ne se voit
// pas. La réécriture ne suppose rien : elle rouvre le cadre d'origine (classe `Cadre`) et **lit
// l'octet en mémoire** à `cadre.local(0x14)`. moteur/jeu/index.js (`resteRelu`) épargne déjà cet
// emplacement au rejeu empoisonné, et fenetres.js y repose le `ebp` que 0x3F49E sauvait.
//
// -------------------------------------------------------------------------------------------------
// LES TABLES
//
// **Les pays**, 0xB7B38, 0x1C octets par fiche, terminée par un octet +0 nul — 24 pays :
//   +0x00 octet  le numéro du pays ; son nom est `[[0xD7B70] + 4 × numéro]`
//   +0x01 mot    le prix du terrain, en centaines de milliers (× 0x186A0)
//   +0x03 mot    la population proche, +0x05 la population lointaine, +0x07 la population éloignée,
//                toutes trois en centaines de milliers
//   +0x09 mot    le taux d'inflation, en centièmes de pour cent ; +0x0B le taux d'intérêt
//   +0x0D octet  l'économie : un texte de la table des pays (champ +0x48), et la valeur de départ
//                du champ +0x3E du parc, 0x1F4 + (2 − économie) × 0x3E8
//   +0x0E octet  les années non imposables ; +0x0F mot les impôts locaux, en centièmes
//   +0x11 octet  le climat, huit drapeaux (textes +0x60 ; aucun : +0x5C, « AGREABLE »)
//   +0x12 octet  le terrain, huit drapeaux (textes +0x74 ; aucun : +0x70, « PRAIRIES »)
//   +0x14 mot    x sur la carte ; +0x16 mot y ; +0x18 octet la largeur ; +0x19 octet la hauteur
//   +0x1A octet signé  le joueur propriétaire, −1 si le terrain est libre
//   +0x1B octet  le « SPECIAL » du pays : un texte de la table des messages (champ +0x19C)
// Les prix relevés en jeu vont de 3 (ROYAUME UNI, 300 000) à 25 (JAPON) centaines de milliers.
//
// **La fiche d'un pays** (0x56532) se compose d'après 0xB9EE0, 7 octets par ligne, terminée par un
// octet +0 négatif — 16 lignes : +0 le numéro du texte de l'intitulé, +1 mot son x, +3 mot la ligne
// (y = ligne × (0xD7765 + 6) + 0x40), +5 mot le x de la valeur. La fiche du propriétaire (0x57193)
// a la même forme, table 0xB9F57, dix lignes, hauteur de ligne 0xD7765 + 4.
//
// **La fiche du joueur** (0x576FE) se compose d'après 0xB9FA4, 0x13 octets par ligne, terminée par
// un octet +0 négatif — treize lignes : +0 le numéro du texte de l'intitulé (table [0xD7B80]),
// +1 mot le x de l'intitulé, +3 mot le x de la valeur, +5 mot la ligne, +7 mot le x de droite,
// +9 mot ce qui s'ajoute à la hauteur de ligne, +0x0B octet le numéro de zone (0xB14D8),
// +0x0D octet les drapeaux — 1 une ligne à taper, 2 une liste de cases, 4 le bouton TERMINE, 0 le
// titre —, +0x0F mot le nombre de cases, +0x11 octet le numéro du texte de la première case,
// +0x12 octet le numéro de l'image du fond d'une case (l'image +1 termine un champ de saisie, et
// l'image +5 est la case choisie).
//
// **Les réglages de la partie**, dans la fiche que 0x2E9E8 écrit dans `save/<surnom>.GD` et que
// 0x2EA62 relit :
//   0xD6690 VOTRE NOM, 0xD66B0 SURNOM (celui des sauvegardes et du code de triche), 0xD66D0 NOM DU
//   PARC, 0xD66F3 AGE, 0xD66F4 SEXE (HOMME, FEMME), 0xD66F1 SIMULATION (SIMPLE, SIM., GLOBALE),
//   0xD66F2 VISITEURS (HEUREUX, NORMAUX, RALEURS), 0xD66F5 NIVEAU DE DEPART (FACILE, MOYEN, DIFF.),
//   0xD66F0 CONCURRENTS (AUCUN, 4, 10, TOUS — la table 0xB7F88 : 0, 4, 10, 25), 0xD66F6 FORCE
//   CONCURRENTS (FAIBLES, MOYENS, FORTS), 0xD66F7 DEJA JOUE? (OUI, NON).
// TERMINE pose le mode de simulation (0xD7761 SIMPLE, 0xD7759 SIM., 0xD775E GLOBALE) et, si le
// joueur n'a encore vendu aucun parc (0xD671C), son argent de départ, table 0xB7F7C : 200 000,
// 150 000 ou 100 000 selon le niveau.

// --- arithmétique de 1994 -----------------------------------------------------------------------
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const s8 = (v) => (v << 24) >> 24;
const u8 = (v) => v & 0xFF;
// `idiv` : division entière tronquée vers zéro.
const idiv = (a, b) => (a / b) | 0;

const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a, v >>> 0, true);

// --- les variables du jeu -----------------------------------------------------------------------
const MODE_VIDEO = 0xDE5F6;              // mot : bit 0 levé en 320x200
const SURFACE = 0xDE5BC;                 // la surface de dessin ; FOND le tampon restauré à chaque image
const FOND = 0xD3B98;
const PALETTE_DE_LA_FENETRE = 0xD3B8C;   // la palette des fenêtres de l'interface
const PALETTE_DE_LA_CARTE = 0xCEBE0;     // celle de la carte du monde, chargée avec son fond
const HAUTEUR_DE_LIGNE = 0xD7765;        // octet : la hauteur d'une ligne de texte
const COULEUR_CHOISIE = 0xD7773;         // octet : la couleur d'une ligne ou d'une case choisie
const TEINTES = 0xB14DA;                 // pointeur sur six teintes ; +5 : la couleur des textes
const ZONE_ACTIVE = 0xB14D8;             // octet : la zone de saisie qui a le clavier, 0xFF aucune
const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;
const CLIC_GAUCHE = 0xDE5AC;             // mot : le bouton gauche vient d'être appuyé
const TOUCHE_DE_L_IMAGE = 0xDE688;       // octet : le code de balayage de la touche de l'image
const CARACTERE_DE_L_IMAGE = 0xD77A1;    // octet : son code ASCII
const NOMS_DES_PAYS = 0xD7B70;           // table de textes : les pays et les intitulés de leur fiche
const TEXTES_DU_JOUEUR = 0xD7B80;        // table de textes : la fiche du joueur
const MESSAGES = 0xD7BC0;                // table de textes : les messages de l'interface
const TEXTES_D_ACHAT = 0xD7BD0;          // table de textes : « PRIX : », les articles…
const FICHES_DES_JOUEURS = 0xD3B00;      // la table des 25 fiches de 0x222 octets
const FICHE_COURANTE = 0xD3808;          // pointeur sur la fiche du joueur
const PARC_COURANT = 0xD3814;            // pointeur sur la fiche de son parc
const JOUEUR_COURANT = 0xD665C;          // mot : son numéro
const ECRAN = 0xD6652;                   // mot : le genre d'écran ouvert ; 0 = la vue du parc
const REDESSINER_CARTE = 0xD666E;
const ARGENT_DE_DEPART = 0xD6718;        // mot long : ce qu'il reste au joueur pour acheter un terrain
const PARCS_VENDUS_PAR_PAYS = 0xD66F8;   // un octet par pays ; 0xD671C : le nombre de pays touchés
const NOM_DU_JOUEUR = 0xD66B0;           // le surnom, celui des sauvegardes
const JOUEURS_EN_RESEAU = 0xD7792;       // octet : le nombre de joueurs d'une partie en réseau
const OBJETS_GRAPHIQUES = 0xD3B38;       // pointeur sur une table de mots : le numéro d'objet d'un repère
const IMAGES_DU_MENU = 0xBA2F8;          // pointeur : la banque d'images de la fiche du joueur

const PAYS = 0xB7B38, TAILLE_D_UN_PAYS = 0x1C;
const LIGNES_DU_PAYS = 0xB9EE0;          // la fiche d'un pays, 7 octets par ligne
const LIGNES_DU_PROPRIETAIRE = 0xB9F57;  // la fiche de son propriétaire, 7 octets par ligne
const LIGNES_DU_JOUEUR = 0xB9FA4, TAILLE_D_UNE_LIGNE = 0x13;
const NOMBRES_DE_CONCURRENTS = 0xB7F88;  // 0, 4, 10, 25
const ARGENTS_DE_DEPART = 0xB7F7C;       // 200 000, 150 000, 100 000
const CLASSES_DE_CARACTERES = 0xB0A5C;   // la table `ctype` de Watcom, indexée par c + 1
const LETTRE = 0xC0, ALPHANUMERIQUE = 0xE0;   // ses bits : 0x80 minuscule, 0x40 majuscule, 0x20 chiffre

// --- les fonctions appelées ---------------------------------------------------------------------
const SERVIR_L_HOTE = 0x1107F;           // le premier appel de la boucle : souris et clavier
const CHANGER_LE_CURSEUR = 0x116E4;
const RENDRE_LA_SOURIS = 0x118FE;
const CHARGER_UN_FICHIER = 0x7F0B0;      // (chemin, destination) : rend la taille lue
const RELOGER_LES_SPRITES = 0x10C80;     // (début, fin, images)
const RECOPIER_DES_LIGNES = 0x55EFA;     // (source, destination, lignes)
const POSER_LA_PALETTE = 0x7C282;
const FONDU_D_ARRIVEE = 0x7C32D;
const OUVRIR_UNE_FENETRE = 0x35F21;
const REDESSINER_LES_ZONES = 0x3D72B;
const OUVRIR_ECRAN_PLEIN = 0x40D3E, FERMER_ECRAN_PLEIN = 0x40D79;
const CADRE_BISEAUTE = 0x3E149;          // (x0, y0, x1, y1, fond, bordure)
const ECRIRE_TEXTE = 0x3F49E;            // (x, y, texte, normal, couleur)
const ECRIRE_CENTRE = 0x3F377;           // (x0, x1, y, texte, mode, couleur)
const LARGEUR_TEXTE = 0x3F677;
const CHAMP_DE_SAISIE = 0x3DA5E;         // (rectangle, zone, texte) : dessine un champ
const TAPER_DANS_UN_CHAMP = 0x3B496;     // (texte) : rend le déplacement de ligne demandé
const DESSINER_UN_OBJET = 0x209B5;       // (objet, x, y)
const TRACER_UNE_IMAGE = 0x5EC9C;        // (x, y, image) en basse résolution
const TRACER_ET_MARQUER = 0x55BD4;       // (x, y, image) en haute résolution
const RESTAURER_LE_FOND_BASSE = 0x80E20; // (fond, surface, lignes)
const RESTAURER_LE_FOND_HAUTE = 0x54ED6; // (fond, surface)
const PRESENTER_BASSE = 0x80210, PRESENTER_HAUTE = 0x55507;
const ATTENDRE_BALAYAGE = 0x80BE4;
const COULEUR_LA_PLUS_PROCHE = 0x80250;  // (palette, r, v, b)
const BRUITAGE = 0x80C80;                // (propriétaire, bruitage)
const NOM_D_UN_JOUEUR = 0x4C50B;
const ECRIRE_LA_FICHE = 0x2E9E8;         // écrit 0xD6690 dans save/<surnom>.GD
const VERIFIER_LA_TRICHE = 0x2EA62;      // le nom HORZA lève 0xD6682, puis la fiche est relue
const NOUVELLE_PARTIE = 0x19EEE;
const ROUVRIR_UN_ECRAN = 0x1B23A;
const COPIER_CHAINE = 0x7E1ED, LONGUEUR_CHAINE = 0x7E822, COMPARER_CHAINES = 0x81E00;
const FORMATER = 0x7F652, LIRE_UN_NOMBRE = 0x7E216;
const FORMAT_NOMBRE = 0xB0310;           // « %d »
const FORMAT_TEXTE = 0xB0302;            // « %s »

// =================================================================================================
// LE CADRE D'ORIGINE
// =================================================================================================

// Ces fonctions passent aux fonctions qu'elles appellent l'adresse de tampons pris dans leurs
// variables locales, et 0x576FE relit un octet que son cadre n'a jamais écrit (voir l'en-tête). Pour
// que tout soit exactement à la même place que dans l'original, la réécriture rouvre le même cadre :
// ebx, esi, edi et ebp empilés à l'entrée, puis `enter taille, 0` ; ebp désigne le cadre et le
// pointeur de pile descend sous les variables, là où l'original appelait. `fermer` rend ebp, ebx,
// esi et edi à l'appelant ; l'enveloppe (moteur/jeu/index.js) remet la pile en place.
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

// =================================================================================================
// OUTILS COMMUNS
// =================================================================================================

const basseResolution = (jeu) => (octet(jeu, MODE_VIDEO) & 1) !== 0;

// Le texte numéro n d'une table de pointeurs.
const texteDe = (jeu, table, n) => long(jeu, long(jeu, table) + 4 * n);

// La restauration du fond avant de redessiner : 400 lignes en basse résolution (0x80E20 recopie tout
// le tampon), la restauration par blocs en haute (0x54ED6).
function restaurerLeFond(jeu) {
  if (basseResolution(jeu)) jeu.appeler(RESTAURER_LE_FOND_BASSE, long(jeu, FOND), long(jeu, SURFACE), 0xC8);
  else jeu.appeler(RESTAURER_LE_FOND_HAUTE, long(jeu, FOND), long(jeu, SURFACE));
}

// Présenter l'image : 0x80210(400) en basse résolution, 0x55507 en haute.
function presenterLImage(jeu) {
  if (basseResolution(jeu)) jeu.appeler(PRESENTER_BASSE, 0x190);
  else jeu.appeler(PRESENTER_HAUTE);
}

// Les quatre mots du clic remis à zéro. 0x576FE et 0x56532 les écrivent dans cet ordre ; 0x560D2
// commence par 0xDE5AA, pour le même résultat.
function oublierLeClic(jeu) {
  for (const a of [0xDE5A4, 0xDE5A6, 0xDE5AA, CLIC_GAUCHE]) poserMot(jeu, a, 0);
}

// Le pointeur est-il dans le rectangle ? La forme des boutons et des lignes : inclusive à droite,
// exclusive en bas.
function dansLeRectangle(jeu, x0, x1, y0, y1) {
  const sx = motSigne(jeu, SOURIS_X), sy = motSigne(jeu, SOURIS_Y);
  return sx >= x0 && sx <= x1 && sy >= y0 && sy < y1;
}

// La forme des pays sur la carte du monde : exclusive des deux côtés.
function surLePays(jeu, x0, largeur, y0, hauteur) {
  const sx = motSigne(jeu, SOURIS_X), sy = motSigne(jeu, SOURIS_Y);
  return sx >= x0 && sx < x0 + largeur && sy >= y0 && sy < y0 + hauteur;
}

// L'image numéro n de la banque chargée avec l'écran : six octets par image, +4 sa largeur.
const imageDuMenu = (jeu, banque, n) => (banque + n * 6) | 0;

// =================================================================================================
// 0x56E7E — METTRE UN NOMBRE EN FORME
// =================================================================================================

// Écrire un nombre dans `destination`, avec des virgules tous les trois chiffres, dans un champ de
// `largeur` caractères. Quatre modes :
//   0  cadré à droite : les blancs d'abord, puis le signe moins et les chiffres
//   1  cadré à gauche : les chiffres, puis les blancs
//   2  comme 1, mais la chaîne s'arrête au premier blanc (pas de blancs de remplissage)
//   3  comme 1, mais la valeur absolue : un nombre négatif s'écrit sans son signe
// Un nombre négatif (modes 0, 1, 2) prend un caractère de plus, retiré de la largeur ; les virgules
// aussi, une par groupe de trois chiffres au-delà du premier.
//
// La carte du monde demande le mode 2 sur 0x12 caractères pour le prix d'un terrain ; la fiche d'un
// pays le mode 1 sur 0x12 pour ses montants et le mode 3 pour la population éloignée ; la fiche du
// propriétaire le mode 1 sur 10 pour son solde ; le bilan de fin d'année le mode 0 sur 10.
export const mettreEnForme = dansLeCadre(0x58, (jeu, cadre, destination, valeur, largeur, mode) => {
  const chiffres = cadre.local(0x58);          // le tampon de `sprintf`
  let negatif = 0, tronquer = 0;
  largeur = u8(largeur);
  mode = u8(mode);
  valeur = valeur | 0;

  let magnitude;
  if (valeur >= 0 || mode === 3) {
    magnitude = valeur >= 0 ? valeur : -valeur;   // mode 3 : la valeur absolue, sans signe
  } else {
    magnitude = -valeur;
    negatif = 1;
    largeur = u8(largeur - 1);                    // le signe moins mange une place
  }
  if (mode === 2) { tronquer = 1; mode = 1; }
  else if (mode === 3) mode = 1;

  jeu.appeler(FORMATER, chiffres, FORMAT_NOMBRE, magnitude);
  const longueur = u8(jeu.appeler(LONGUEUR_CHAINE, chiffres));

  // `premier` : le rang du premier chiffre qui sera suivi d'une virgule.
  let premier;
  if (longueur > 3) {
    premier = longueur % 3;
    if (premier === 0) premier = 3;
    largeur = u8(largeur - idiv(longueur - premier, 3));   // une place par virgule
  } else {
    premier = u8(longueur + 1);                            // pas de virgule
  }

  let debut = 0, remplissage = 0;
  if (largeur > longueur) {
    remplissage = u8(largeur - longueur);
    if (mode === 0) { debut = 0; premier = u8(premier + remplissage); }
    else if (mode === 1) debut = longueur;
  }

  // Une position du champ par tour : i compte les places, j les octets écrits (une virgule et le
  // chiffre qui la suit en occupent deux).
  let i = 0, j = 0;
  const poser = (c) => poserOctet(jeu, destination + s16(j), c);
  boucle:
  for (; largeur > s16(i); i++, j++) {
    if (mode === 0) {                                     // cadré à droite
      if (negatif === 1 && s16(i) >= debut + remplissage) {
        negatif = 0;
        poser(0x2D);                                      // le signe moins, collé aux chiffres
        const source = s16(i) - remplissage;
        j++;
        poser(octet(jeu, chiffres + source));
      } else if (remplissage > s16(i) && remplissage > 0) {
        poser(0x20);
      } else if (premier === s16(i) || ((s16(i) - premier) % 3 === 0 && premier <= s16(i))) {
        poser(0x2C);                                      // la virgule
        const source = s16(i) - remplissage;
        j++;
        poser(octet(jeu, chiffres + source));
      } else {
        poser(octet(jeu, chiffres + (s16(i) - remplissage)));
      }
    } else if (mode === 1) {                              // cadré à gauche
      if (negatif === 1) {
        negatif = 0;
        poser(0x2D);
        const source = s16(i);
        j++;
        poser(octet(jeu, chiffres + source));
      } else if (!(debut > s16(i)) && s16(i) < debut + remplissage && remplissage > 0) {
        if (tronquer !== 0) break boucle;                 // mode 2 : on s'arrête aux blancs
        poser(0x20);
      } else if (premier === s16(i) || ((s16(i) - premier) % 3 === 0 && premier <= s16(i))) {
        poser(0x2C);
        const source = s16(i);
        j++;
        poser(octet(jeu, chiffres + source));
      } else {
        poser(octet(jeu, chiffres + s16(i)));
      }
    }
    // Les modes au-delà de 1 n'existent plus ici : 2 et 3 sont devenus 1 plus haut.
  }
  poser(0);
});

// =================================================================================================
// LA CARTE DU MONDE
// =================================================================================================

// 0x5606C — charger et afficher le planisphère.
//
// L'image `data/mglobe-0.dat` est lue dans la surface de dessin, sa palette `data/mglpal-0.dat` dans
// 0xCEBE0 ; les 400 lignes de la surface sont recopiées dans le tampon de fond, qui les remettra à
// chaque image, la palette est posée, et l'écran passe en plein écran.
export function chargerLaCarteDuMonde(jeu) {
  jeu.appeler(CHARGER_UN_FICHIER, 0xB80C7, long(jeu, SURFACE));          // data/mglobe-0.dat
  jeu.appeler(CHARGER_UN_FICHIER, 0xB8106, PALETTE_DE_LA_CARTE);         // data/mglpal-0.dat
  jeu.appeler(RECOPIER_DES_LIGNES, long(jeu, SURFACE), long(jeu, FOND), 0x190);
  jeu.appeler(POSER_LA_PALETTE, PALETTE_DE_LA_CARTE);
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
}

// 0x575A7 — poser le repère d'un pays sur la carte.
//
// Six repères, selon qui tient le pays et ce que le joueur peut payer :
//   0x2A9  le pays du joueur lui-même
//   0x29D  le pays d'un concurrent
//   0x2B5  le pays d'un concurrent, là où le joueur a déjà vendu un parc
//   0x2B4  un terrain libre, là où le joueur a déjà vendu un parc
//   0x29E  un terrain libre que le joueur peut payer
//   0x2B3  un terrain libre trop cher pour lui
// Le numéro trouvé désigne un objet graphique dans la table de mots [0xD3B38] ; il se pose au centre
// du rectangle du pays.
export function poserLeRepereDUnPays(jeu, pays, fiche) {
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  let repere;
  if (fiche !== 0) {
    const joueur = idiv((fiche - long(jeu, FICHES_DES_JOUEURS)) | 0, 0x222);
    if (joueur === mot(jeu, JOUEUR_COURANT)) repere = 0x2A9;
    else if (octet(jeu, PARCS_VENDUS_PAR_PAYS + numeroDuPays(jeu, pays)) !== 0) repere = 0x2B5;
    else repere = 0x29D;
  } else if (octet(jeu, PARCS_VENDUS_PAR_PAYS + numeroDuPays(jeu, pays)) !== 0) {
    repere = 0x2B4;
  } else if ((Math.imul(mot(jeu, pays + 1), 0x186A0) >>> 0) <= long(jeu, ARGENT_DE_DEPART)) {
    repere = 0x29E;
  } else {
    repere = 0x2B3;
  }
  const x = s16(mot(jeu, pays + 0x14) + idiv(octet(jeu, pays + 0x18), 2));
  const y = s16(mot(jeu, pays + 0x16) + idiv(octet(jeu, pays + 0x19), 2));
  jeu.appeler(DESSINER_UN_OBJET, mot(jeu, long(jeu, OBJETS_GRAPHIQUES) + 2 * repere), x, y);
}

const numeroDuPays = (jeu, pays) => idiv((pays - PAYS) | 0, TAILLE_D_UN_PAYS);

// 0x560D2 — la carte du monde, une boucle à elle.
//
// Le planisphère est chargé, le curseur changé, puis, à chaque tour : l'hôte est servi (0x1107F), le
// fond remis, le solde du joueur écrit en bas (« <nom> <PRIX :> <solde> »), et chaque pays reçoit
// son repère. Le pays survolé donne son nom et le prix de son terrain, tant que le joueur n'a pas
// encore de pays ; sinon la carte affiche « CHOISISSEZ UN PAYS POUR INSTALLER VOTRE PARC ». Un clic
// sur un pays ouvre sa fiche, puis, s'il a un propriétaire, la fiche de celui-ci. Un clic dans le
// rectangle (0x238–0x272, 0x16E–0x182) — le bouton du coin bas droit — quitte la carte.
//
// Rend l'octet +5 de la fiche du joueur : son pays, ou −1 s'il n'en a pas pris. L'appelant ne lit
// que cet octet (`cbw ; cwde`), et l'original ne pose que `al` : les trois octets hauts d'eax ne
// sont donc pas comparés.
export const carteDuMonde = dansLeCadre(0x88, (jeu, cadre) => {
  const texte = cadre.local(0x70);          // le texte de la ligne du bas
  const montant = cadre.local(0x20);        // le prix du terrain survolé, mis en forme
  const curseurDAvant = long(jeu, 0xBECB8);

  jeu.appeler(0x5606C);
  jeu.appeler(CHANGER_LE_CURSEUR, long(jeu, 0xD3B84) + 6);

  for (;;) {
    jeu.appeler(SERVIR_L_HOTE);
    restaurerLeFond(jeu);

    // « <nom du joueur> <PRIX :> <ce qu'il lui reste> », centré tout en bas, en blanc.
    const argent = long(jeu, ARGENT_DE_DEPART);
    const prix = long(jeu, long(jeu, MESSAGES) + 0xA0);
    jeu.appeler(FORMATER, texte, 0xB02F0, jeu.appeler(NOM_D_UN_JOUEUR, octet(jeu, JOUEUR_COURANT)), prix, argent);
    const blanc = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, PALETTE_DE_LA_CARTE, 0x3F, 0x3F, 0x3F));
    jeu.appeler(ECRIRE_CENTRE, 0x12, 0x23C, 0x17E, texte, 0, blanc);
    poserOctet(jeu, texte, 0);                     // le texte du pays survolé, vide pour l'instant

    for (let pays = PAYS; ; pays += TAILLE_D_UN_PAYS) {
      if (octet(jeu, pays) === 0) break;           // la fin de la table
      const proprietaire = octetSigne(jeu, pays + 0x1A);
      jeu.appeler(0x575A7, pays,
        proprietaire >= 0 ? (long(jeu, FICHES_DES_JOUEURS) + Math.imul(proprietaire, 0x222)) | 0 : 0);

      if (!surLePays(jeu, mot(jeu, pays + 0x14), octet(jeu, pays + 0x18),
        mot(jeu, pays + 0x16), octet(jeu, pays + 0x19))) continue;

      // Le pays est survolé. Tant que le joueur n'a pas de pays, son nom et son prix s'affichent.
      if (octetSigne(jeu, long(jeu, FICHE_COURANTE) + 5) === -1) {
        jeu.appeler(0x56E7E, montant, Math.imul(mot(jeu, pays + 1), 0x186A0), 0x12, 2);
        jeu.appeler(FORMATER, texte, 0xB02FA, texteDe(jeu, NOMS_DES_PAYS, octet(jeu, pays)),
          long(jeu, long(jeu, TEXTES_D_ACHAT) + 0x44), montant);
      }
      if (mot(jeu, CLIC_GAUCHE) === 0) continue;

      // Un clic : la fiche du pays, puis celle de son propriétaire s'il en a un.
      jeu.appeler(BRUITAGE, 0, 0x1A);
      jeu.appeler(FERMER_ECRAN_PLEIN);
      jeu.appeler(0x56532, pays);
      jeu.appeler(OUVRIR_ECRAN_PLEIN);
      if (octetSigne(jeu, pays + 0x1A) >= 0) {
        jeu.appeler(0x57193, pays,
          (long(jeu, FICHES_DES_JOUEURS) + Math.imul(octetSigne(jeu, pays + 0x1A), 0x222)) | 0);
      }
      break;
    }

    // Aucun pays survolé et pas encore de pays choisi : l'invite du bas.
    if (octet(jeu, texte) === 0 && octetSigne(jeu, long(jeu, FICHE_COURANTE) + 5) === -1) {
      jeu.appeler(COPIER_CHAINE, texte, long(jeu, long(jeu, MESSAGES) + 0xEC));
    }
    if (octet(jeu, texte) !== 0) {
      const rouge = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, PALETTE_DE_LA_CARTE, 0x3F, 0, 0));
      jeu.appeler(ECRIRE_CENTRE, 0x12, 0x23C, 0x16A, texte, 0, rouge);
    }

    // Le bouton de sortie, en bas à droite.
    if (mot(jeu, CLIC_GAUCHE) !== 0 && dansLeRectangle(jeu, 0x238, 0x272 - 1, 0x16E, 0x182)) {
      oublierLeClic(jeu);
      jeu.appeler(BRUITAGE, 0, 0x1A);
      jeu.appeler(FONDU_D_ARRIVEE);
      jeu.appeler(FERMER_ECRAN_PLEIN);
      jeu.appeler(CHANGER_LE_CURSEUR, curseurDAvant);
      jeu.appeler(RENDRE_LA_SOURIS);
      return octet(jeu, long(jeu, FICHE_COURANTE) + 5);
    }
    presenterLImage(jeu);
  }
});

// =================================================================================================
// LA FICHE D'UN PAYS
// =================================================================================================

// 0x56532 — la fiche d'un pays, une boucle à elle.
//
// La fenêtre 0x16 est peinte à chaque tour dans la surface de dessin (qui tient lieu de fond le
// temps de l'appel), puis un cadre, puis les seize lignes de la table 0xB9EE0, chacune un intitulé
// et une valeur. Le titre (ligne 0) est le nom du pays, centré. Les populations sont des centaines
// de milliers, les taux et les impôts des centièmes de pour cent, le climat et le terrain des
// drapeaux dont les textes sont joints par « , ».
//
// La ligne 14 est le bouton ACHETER : il ne s'affiche que si le joueur n'a pas encore de pays et
// peut payer le terrain (ou si la partie est en réseau, 0xD7792 > 1). Le clic prend le pays : la
// fiche du joueur reçoit son numéro, le pays reçoit le sien, le prix est retiré de sa réserve et de
// son solde — sauf en réseau —, et le champ +0x3E du parc part de 0x1F4 + (2 − économie) × 0x3E8.
// La ligne 15 est le bouton de sortie, en (0x220–0x250, 0x12C–0x14A).
//
// Anomalie reproduite : le tampon de la valeur n'est pas vidé d'une ligne à l'autre. La ligne 15,
// quand on ne clique pas dessus, passe par le dessin commun avec ce que la ligne 14 y a laissé, et
// l'écrit à la ligne 0x12C — soit 300 × la hauteur de ligne, hors de l'écran. Le bilan de fin
// d'année (0x7C36D) a exactement la même.
export const ficheDUnPays = dansLeCadre(0x94, (jeu, cadre, pays) => {
  const valeur = cadre.local(0x78);            // le tampon du nombre ou du texte de droite
  const hauteurDeLigne = octet(jeu, HAUTEUR_DE_LIGNE) + 6;
  const couleur = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, PALETTE_DE_LA_CARTE, 0x38, 0x20, 0x0E));
  const texteDuPays = (n) => texteDe(jeu, NOMS_DES_PAYS, n);

  for (;;) {
    restaurerLeFond(jeu);
    const fond = long(jeu, FOND);
    poserLong(jeu, FOND, long(jeu, SURFACE));
    jeu.appeler(OUVRIR_UNE_FENETRE, 0x16);
    poserLong(jeu, FOND, fond);
    jeu.appeler(REDESSINER_LES_ZONES);
    const bordure = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE_DE_LA_FENETRE), 0x40, 0x40, 0x2C));
    const fondDuCadre = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE_DE_LA_FENETRE), 0x38, 0x2A, 0x1A));
    jeu.appeler(CADRE_BISEAUTE, 0x28, 0x1C, 0x258, 0x154, fondDuCadre, bordure);

    for (let k = 0, ligne = LIGNES_DU_PAYS; octetSigne(jeu, ligne) >= 0; k++, ligne += 7) {
      const y = u16(Math.imul(mot(jeu, ligne + 3), hauteurDeLigne) + 0x40);
      const enCentainesDeMilliers = (champ, mode) =>
        jeu.appeler(0x56E7E, valeur, Math.imul(mot(jeu, pays + champ), 0x186A0), 0x12, mode);
      const enCentiemes = (champ, format) => jeu.appeler(FORMATER, valeur, format,
        idiv(mot(jeu, pays + champ), 100), mot(jeu, pays + champ) % 100);
      // Les drapeaux du climat ou du terrain : les textes levés, joints par « , », ou, si aucun
      // n'est levé, le texte par défaut. Le dernier « , » est effacé.
      const drapeaux = (champ, premierTexte, parDefaut) => {
        poserOctet(jeu, valeur, 0);
        for (let bit = 0; bit < 8; bit++) {
          if ((octet(jeu, pays + champ) & (1 << bit)) === 0) continue;
          const fin = jeu.appeler(LONGUEUR_CHAINE, valeur);
          jeu.appeler(FORMATER, (valeur + fin) | 0, 0xB031C, long(jeu, long(jeu, NOMS_DES_PAYS) + 4 * bit + premierTexte));
        }
        if (octet(jeu, valeur) === 0) jeu.appeler(FORMATER, valeur, FORMAT_TEXTE, long(jeu, long(jeu, NOMS_DES_PAYS) + parDefaut));
        else poserOctet(jeu, (valeur + jeu.appeler(LONGUEUR_CHAINE, valeur) - 3) | 0, 0);
      };

      switch (k) {
        case 0:   // le titre : le nom du pays, centré entre les deux x de la fiche
          jeu.appeler(FORMATER, valeur, FORMAT_TEXTE, texteDuPays(octet(jeu, pays)));
          jeu.appeler(ECRIRE_CENTRE, motSigne(jeu, ligne + 1), motSigne(jeu, ligne + 5), s16(y), valeur, 0, couleur);
          continue;
        case 1:   // PRIX : le terrain, précédé de « TAILLE » quand le pays n'a pas de prix
          if (mot(jeu, pays + 1) === 0) {
            jeu.appeler(FORMATER, valeur, long(jeu, long(jeu, MESSAGES) + 0x170));
          }
          enCentainesDeMilliers(1, 1);
          break;
        case 2:   // DIFFICULTE : un texte des messages, choisi par l'octet +0x1B du pays
          jeu.appeler(COPIER_CHAINE, valeur,
            long(jeu, long(jeu, MESSAGES) + 4 * octet(jeu, pays + 0x1B) + 0x19C));
          break;
        case 3: enCentainesDeMilliers(3, 1); break;      // POP. LOCALE
        case 4: enCentainesDeMilliers(5, 1); break;      // POP. DISTANTE
        case 5: enCentainesDeMilliers(7, 3); break;      // POP. ELOIGNEE (mode 3 : sans signe)
        case 6: enCentiemes(9, 0xB0305); break;          // TAUX D'INFLATION, « %d.%0.2d%% »
        case 7: enCentiemes(0x0B, 0xB0305); break;       // TAUX D'INTERET
        case 8:   // ECONOMIE : un texte de la table des pays, champ +0x48
          jeu.appeler(FORMATER, valeur, FORMAT_TEXTE,
            long(jeu, long(jeu, NOMS_DES_PAYS) + 4 * octet(jeu, pays + 0x0D) + 0x48));
          break;
        case 9:   // ANNEES NON IMPOSABLES
          jeu.appeler(FORMATER, valeur, FORMAT_NOMBRE, octet(jeu, pays + 0x0E));
          break;
        case 10: enCentiemes(0x0F, 0xB0313); break;      // IMPOTS LOCAUX, « %d.%0.2d »
        case 11: drapeaux(0x11, 0x60, 0x5C); break;      // CLIMAT
        case 12: drapeaux(0x12, 0x74, 0x70); break;      // TERRAIN
        case 13:  // PROPRIETAIRE : son nom, ou « VIDE » si le terrain est libre ou hors de prix
          if (octetSigne(jeu, pays + 0x1A) === -1
            || (Math.imul(mot(jeu, pays + 1), 0x186A0) >>> 0) > long(jeu, ARGENT_DE_DEPART)) {
            jeu.appeler(FORMATER, valeur, FORMAT_TEXTE, long(jeu, long(jeu, NOMS_DES_PAYS)));
          } else {
            jeu.appeler(FORMATER, valeur, FORMAT_TEXTE,
              jeu.appeler(NOM_D_UN_JOUEUR, octet(jeu, pays + 0x1A)));
          }
          break;
        case 14:  // ACHETER : le terrain acheté referme la fiche
          if (acheterLeTerrain(jeu, cadre, pays, ligne, hauteurDeLigne, couleur)) return;
          continue;
        case 15:  // le bouton de sortie
          if (mot(jeu, CLIC_GAUCHE) !== 0
            && dansLeRectangle(jeu, mot(jeu, ligne + 1), mot(jeu, ligne + 1) + 0x30,
              mot(jeu, ligne + 3), mot(jeu, ligne + 3) + 0x1E)) {
            jeu.appeler(BRUITAGE, 0, 0x19);
            oublierLeClic(jeu);
            return;
          }
          break;
        default: break;
      }
      // Le dessin commun : l'intitulé à gauche, la valeur à droite. Le tampon n'ayant pas été vidé,
      // la ligne 15 réécrit ici celui de la ligne 14, hors de l'écran (anomalie reproduite).
      if (octet(jeu, valeur) !== 0) {
        jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, ligne + 1), s16(y), texteDuPays(octetSigne(jeu, ligne)), 0, couleur);
        jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, ligne + 5), s16(y), valeur, 0, couleur);
      }
    }
    jeu.appeler(ATTENDRE_BALAYAGE);
    presenterLImage(jeu);
  }
});

// La ligne ACHETER de la fiche d'un pays (0x56AD7 à 0x56D0F). Rend vrai si le terrain est acheté
// (la fiche se referme).
//
// Elle est sautée quand le joueur a déjà un pays ou ne peut pas payer, sauf en partie à plusieurs
// (0xD7792 > 1), où le terrain ne se paie pas. Le texte s'écrit à la ligne de la fiche, entouré
// d'un cadre juste à sa taille, et c'est ce cadre qui reçoit le clic.
function acheterLeTerrain(jeu, cadre, pays, ligne, hauteurDeLigne, couleur) {
  const valeur = cadre.local(0x78);
  const aDejaUnPays = octetSigne(jeu, long(jeu, FICHE_COURANTE) + 5) !== -1;
  const tropCher = (Math.imul(mot(jeu, pays + 1), 0x186A0) >>> 0) > long(jeu, ARGENT_DE_DEPART);
  if ((aDejaUnPays || tropCher) && octet(jeu, JOUEURS_EN_RESEAU) <= 1) return false;

  jeu.appeler(FORMATER, valeur, FORMAT_TEXTE, long(jeu, long(jeu, MESSAGES) + 0x174));
  const largeur = jeu.appeler(LARGEUR_TEXTE, valeur);
  const y = u16(Math.imul(mot(jeu, ligne + 3), hauteurDeLigne) + 0x40);
  jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, ligne + 1), s16(y), valeur, 0, couleur);
  jeu.appeler(CADRE_BISEAUTE, u16(mot(jeu, ligne + 1) - 4), u16(y - 4),
    u16(mot(jeu, ligne + 1) - 4 + largeur + 4), u16(y - 4 + octet(jeu, HAUTEUR_DE_LIGNE) + 6),
    octet(jeu, 0xD7781), octet(jeu, 0xD7770));

  if (mot(jeu, CLIC_GAUCHE) === 0) return false;
  if (!dansLeRectangle(jeu, u16(mot(jeu, ligne + 1)) - 4, u16(mot(jeu, ligne + 1)) - 4 + s16(largeur) + 4,
    s16(y) - 4, s16(y) + octet(jeu, HAUTEUR_DE_LIGNE) + 6)) return false;

  jeu.appeler(BRUITAGE, 0, 0x19);
  poserOctet(jeu, long(jeu, FICHE_COURANTE) + 5, numeroDuPays(jeu, pays));
  poserOctet(jeu, pays + 0x1A, idiv((long(jeu, FICHE_COURANTE) - long(jeu, FICHES_DES_JOUEURS)) | 0, 0x222));
  if (octet(jeu, JOUEURS_EN_RESEAU) <= 1) {
    const prix = Math.imul(mot(jeu, pays + 1), 0x186A0);
    poserLong(jeu, ARGENT_DE_DEPART, (long(jeu, ARGENT_DE_DEPART) - prix) | 0);
    poserLong(jeu, long(jeu, FICHE_COURANTE) + 0x0A,
      (long(jeu, long(jeu, FICHE_COURANTE) + 0x0A) - prix) | 0);
  }
  poserMot(jeu, long(jeu, PARC_COURANT) + 0x3E, 0x1F4 + Math.imul(u16(2 - octet(jeu, pays + 0x0D)), 0x3E8));
  oublierLeClic(jeu);
  return true;
}

// =================================================================================================
// LA FICHE DU PROPRIÉTAIRE D'UN PAYS
// =================================================================================================

// 0x57193 — la fiche du joueur qui tient déjà le pays qu'on vient de désigner.
//
// Même forme que la fiche d'un pays, table 0xB9F57, dix lignes, hauteur de ligne 0xD7765 + 4 : le
// nom du pays en titre, puis le nom du propriétaire, son solde, sa personnalité (0x1B × 5 + 0x1A de
// sa fiche), sa vendetta (le joueur qu'il vise, ou « AUCUNE »), sa réputation — ligne vide —, et
// quatre chiffres de son parc : les attractions (+0x82), les boutiques (+0xE0), les employés (+0xC2)
// et les visiteurs (+0x1F).
//
// Anomalie reproduite : la ligne 1 passe l'octet bas du numéro de parc (+2 de la fiche, un mot) à
// 0x4C50B, qui attend un numéro de joueur. Cela ne se voit pas tant que chaque joueur tient le parc
// de son propre rang.
//
// L'écran ne se redessine pas : il s'affiche une fois, puis **attend un clic** dans une boucle qui
// ne rend la main à personne — sous DOS, c'est l'interruption de la souris qui relève le mot
// 0xDE5AC. C'est l'attente active que cite `Machine.tic` : le garde-fou de l'horloge est là pour
// elle, et la nomme par son adresse (0x57584). La transcription appelle `H.tic()` tous les 10 000
// sauts en arrière ; une réécriture n'exécutant aucune instruction transcrite, elle doit l'appeler
// elle-même, sans quoi la boucle ne finirait jamais. Le nombre de tours diffère, mais pas le
// nombre de déclenchements du garde-fou ni l'heure à laquelle le clic arrive : la partie est la
// même. (`ticsSansTemps` et le compte des gardes ne sont pas comparés, docs/guide-reecriture.md.)
//
// Qui l'appelle : la carte du monde, juste après la fiche d'un pays dont le propriétaire est connu
// — y compris le joueur lui-même, qui vient de l'acheter. `parc.json` et `ecrans.json` y passent :
// le terrain du Royaume-Uni acheté à 24 s, cet écran s'affiche et attend le clic de 28 s.
export const ficheDuProprietaire = dansLeCadre(0x88, (jeu, cadre, pays, fiche) => {
  const valeur = cadre.local(0x6C);
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  const couleur = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, PALETTE_DE_LA_CARTE, 0x38, 0x20, 0x0E));
  const parc = (0xCF1E0 + Math.imul(mot(jeu, fiche + 2), 0x250)) | 0;
  const hauteurDeLigne = octet(jeu, HAUTEUR_DE_LIGNE) + 4;

  restaurerLeFond(jeu);
  const fond = long(jeu, FOND);
  poserLong(jeu, FOND, long(jeu, SURFACE));
  jeu.appeler(OUVRIR_UNE_FENETRE, 0x16);
  poserLong(jeu, FOND, fond);
  jeu.appeler(REDESSINER_LES_ZONES);
  const bordure = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE_DE_LA_FENETRE), 0x40, 0x40, 0x2C));
  const fondDuCadre = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE_DE_LA_FENETRE), 0x38, 0x2A, 0x1A));
  jeu.appeler(CADRE_BISEAUTE, 0x28, 0x1C, 0x258, 0x154, fondDuCadre, bordure);

  for (let k = 0, ligne = LIGNES_DU_PROPRIETAIRE; octetSigne(jeu, ligne) >= 0; k++, ligne += 7) {
    const y = u16(Math.imul(mot(jeu, ligne + 3), hauteurDeLigne) + 0x40);
    switch (k) {
      case 0:   // le titre : le nom du pays
        jeu.appeler(FORMATER, valeur, FORMAT_TEXTE, texteDe(jeu, NOMS_DES_PAYS, octet(jeu, pays)));
        jeu.appeler(ECRIRE_CENTRE, motSigne(jeu, ligne + 1), motSigne(jeu, ligne + 5), s16(y), valeur, 0, couleur);
        continue;
      case 1:   // NOM DU JOUEUR
        jeu.appeler(COPIER_CHAINE, valeur, jeu.appeler(NOM_D_UN_JOUEUR, octet(jeu, fiche + 2)));
        break;
      case 2:   // BALANCE : son solde en banque
        jeu.appeler(0x56E7E, valeur, long(jeu, fiche + 0x0A), 0x0A, 1);
        break;
      case 3:   // PERSONNALITE
        jeu.appeler(FORMATER, valeur, FORMAT_NOMBRE,
          Math.imul(octet(jeu, fiche + 0x1B), 5) + octet(jeu, fiche + 0x1A));
        break;
      case 4:   // VENDETTA : le joueur visé, ou « AUCUNE »
        if (octetSigne(jeu, fiche + 0x32) >= 0) {
          jeu.appeler(COPIER_CHAINE, valeur, jeu.appeler(NOM_D_UN_JOUEUR, octet(jeu, fiche + 0x32)));
        } else {
          jeu.appeler(COPIER_CHAINE, valeur, long(jeu, long(jeu, NOMS_DES_PAYS) + 0xB0));
        }
        break;
      case 5: break;                                                   // REPUTATION : rien
      case 6: jeu.appeler(FORMATER, valeur, FORMAT_NOMBRE, octet(jeu, parc + 0x82)); break;
      case 7: jeu.appeler(FORMATER, valeur, FORMAT_NOMBRE, octet(jeu, parc + 0xE0)); break;
      case 8: jeu.appeler(FORMATER, valeur, FORMAT_NOMBRE, mot(jeu, parc + 0xC2)); break;
      case 9: jeu.appeler(FORMATER, valeur, FORMAT_NOMBRE, motSigne(jeu, parc + 0x1F)); break;
      default: break;
    }
    jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, ligne + 1), s16(y), texteDe(jeu, NOMS_DES_PAYS, octetSigne(jeu, ligne)), 0, couleur);
    jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, ligne + 5), s16(y), valeur, 0, couleur);
  }
  presenterLImage(jeu);

  // L'attente du clic : le mot est remis à zéro, puis relu jusqu'à ce que la souris le relève.
  // `tic` rend la main à l'hôte comme le fait la transcription tous les 10 000 sauts en arrière ;
  // les registres sont sauvés avant et rechargés après, comme elle le fait aussi — l'hôte décide
  // de livrer ses interruptions d'après le drapeau IF qu'il y trouve (journal des essais, § 5.7).
  const T = jeu.T;
  poserMot(jeu, CLIC_GAUCHE, 0);
  while (mot(jeu, CLIC_GAUCHE) === 0) { T.sauver(); jeu.machine.tic(); T.charger(); }
  poserMot(jeu, CLIC_GAUCHE, 0);
  jeu.appeler(FERMER_ECRAN_PLEIN);
});

// =================================================================================================
// LA FICHE DU JOUEUR : « INFORMATIONS JOUEUR »
// =================================================================================================

// 0x576FE — la fiche du joueur, une boucle à elle.
//
// Le décor se peint une fois dans le tampon de fond : la banque d'images de l'écran est chargée
// (data/mplay-0.dat, sa table data/mplay-0.tab reliée par 0x10C80), la fenêtre 0x16 ouverte, un
// cadre tracé, puis chaque ligne de la table 0xB9FA4 — son intitulé, et soit les deux bouts d'un
// champ de saisie, soit les cases vides d'une liste avec leur texte, soit, pour la ligne 0, le
// titre centré et son cadre.
//
// Puis la boucle : à chaque tour le fond est remis, les zones redessinées, l'hôte servi, et chaque
// ligne retracée. La ligne choisie — celle dont le numéro égale `ligneChoisie` — s'écrit en couleur
// 0xD7773 et prend le clavier : les flèches haut et bas (et Entrée) passent d'une ligne à l'autre,
// les flèches gauche et droite déplacent le choix dans une liste. Un clic sur une ligne la choisit ;
// un clic sur une case de liste la choisit elle aussi.
//
// LE RESTE DE PILE. `ligneChoisie` est la variable `[ebp-0x14]`, que la fonction lit sans l'avoir
// écrite : voir l'en-tête du fichier. On la lit donc en mémoire, à `cadre.local(0x14)`, une fois,
// à l'entrée — rien ne peut plus l'y changer, les appels se faisant tous sous le pointeur de pile.
//
// Le bouton TERMINE (ligne 12, rectangle 0x220–0x250 × 0x12C–0x14A) referme l'écran : il arrête le
// nombre de concurrents, le mode de simulation, l'argent de départ, et écrit la fiche du joueur.
export const ficheDuJoueur = dansLeCadre(0xE8, (jeu, cadre) => {
  const surnomPrecedent = cadre.local(0x6C);   // le surnom au moment où sa ligne a été choisie
  const texteDeLAge = cadre.local(0x90);       // l'âge, en chiffres, tel qu'on le tape
  const rectangleDuChamp = cadre.local(0x5C);  // la fiche passée à 0x3DA5E : +1 x0, +3 y0, +5 x1, +7 y1

  // La banque d'images de l'écran : la table d'abord, puis les images 1 000 octets plus loin.
  const banque = long(jeu, IMAGES_DU_MENU);
  jeu.appeler(CHARGER_UN_FICHIER, 0xB8145, (banque + 0x3E8) | 0);         // data/mplay-0.dat
  const taille = jeu.appeler(CHARGER_UN_FICHIER, 0xB8184, banque);        // data/mplay-0.tab
  jeu.appeler(RELOGER_LES_SPRITES, banque, (banque + Math.imul(taille, 6)) | 0, (banque + 0x3E8) | 0);

  // Le rang du nombre de concurrents choisi, dans la table 0, 4, 10, 25.
  let rangDesConcurrents = 0;
  while (octet(jeu, NOMBRES_DE_CONCURRENTS + s8(rangDesConcurrents)) < octet(jeu, 0xD66F0)) {
    rangDesConcurrents = u8(rangDesConcurrents + 1);
  }
  jeu.appeler(FORMATER, texteDeLAge, FORMAT_NOMBRE, octet(jeu, 0xD66F3));
  const hauteurDeLigne = u8(octet(jeu, HAUTEUR_DE_LIGNE) + 4);

  // --- le décor, peint une fois dans le tampon de fond ------------------------------------------
  jeu.appeler(OUVRIR_UNE_FENETRE, 0x16);
  jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE_DE_LA_FENETRE), 0x3F, 0x3F, 0x2B);   // relevée, jamais relue
  const surface = long(jeu, SURFACE);
  poserLong(jeu, SURFACE, long(jeu, FOND));
  const bordure = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE_DE_LA_FENETRE), 0x40, 0x40, 0x2C));
  const fondDuCadre = u8(jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE_DE_LA_FENETRE), 0x38, 0x2A, 0x1A));
  jeu.appeler(CADRE_BISEAUTE, 0x28, 0x1C, 0x258, 0x154, fondDuCadre, bordure);
  jeu.appeler(COPIER_CHAINE, surnomPrecedent, NOM_DU_JOUEUR);

  const yDeLaLigne = (ligne) => u16(0x28 + u16(Math.imul(u16(hauteurDeLigne + mot(jeu, ligne + 9)), mot(jeu, ligne + 5))));
  const tracer = (x, y, image) => jeu.appeler(basseResolution(jeu) ? TRACER_UNE_IMAGE : TRACER_ET_MARQUER, x, y, image);
  const intitule = (ligne) => texteDe(jeu, TEXTES_DU_JOUEUR, octetSigne(jeu, ligne));
  const couleurDesTextes = () => octet(jeu, long(jeu, TEINTES) + 5);

  for (let ligne = LIGNES_DU_JOUEUR; octetSigne(jeu, ligne) >= 0; ligne += TAILLE_D_UNE_LIGNE) {
    const drapeaux = octet(jeu, ligne + 0x0D);
    const y = yDeLaLigne(ligne);
    if (drapeaux & 1) {
      // Une ligne à taper : son intitulé, puis les deux bouts du champ (l'image et sa suivante).
      jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, ligne + 1), s16(y + 4), intitule(ligne), 0, couleurDesTextes());
      const image = imageDuMenu(jeu, banque, octet(jeu, ligne + 0x12));
      tracer(motSigne(jeu, ligne + 3), s16(y), image);
      tracer(s16(mot(jeu, ligne + 3) + octet(jeu, image + 4)), s16(y), imageDuMenu(jeu, banque, octet(jeu, ligne + 0x12) + 1));
    }
    if (drapeaux & 2) {
      // Une liste de cases : l'intitulé, puis chaque case vide avec son texte centré dedans.
      jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, ligne + 1), s16(y + 4), intitule(ligne), 0, couleurDesTextes());
      const image = imageDuMenu(jeu, banque, octet(jeu, ligne + 0x12));
      const largeurDUneCase = octet(jeu, image + 4);
      let x = mot(jeu, ligne + 3);
      for (let i = 0; i < mot(jeu, ligne + 0x0F); i++) {
        tracer(s16(x), s16(y), image);
        jeu.appeler(ECRIRE_CENTRE, s16(x), s16(x + largeurDUneCase), s16(y + 4),
          texteDe(jeu, TEXTES_DU_JOUEUR, octet(jeu, ligne + 0x11) + i), 0, octet(jeu, COULEUR_CHOISIE));
        x = u16(x + largeurDUneCase + 2);
      }
    } else if (mot(jeu, ligne + 0x0D) === 0) {
      // Le titre de l'écran, centré sur toute la largeur, dans son cadre.
      jeu.appeler(ECRIRE_CENTRE, 0, 0x280, s16(mot(jeu, ligne + 5) + 6), intitule(ligne), 0, couleurDesTextes());
      jeu.appeler(CADRE_BISEAUTE, mot(jeu, ligne + 1), mot(jeu, ligne + 5), mot(jeu, ligne + 7),
        u16(mot(jeu, ligne + 5) + mot(jeu, ligne + 9)), fondDuCadre, bordure);
    }
  }
  poserLong(jeu, SURFACE, surface);
  oublierLeClic(jeu);

  // --- la boucle --------------------------------------------------------------------------------
  // La ligne choisie : l'octet que le cadre n'a jamais écrit (voir l'en-tête).
  let ligneChoisie = octet(jeu, cadre.local(0x14));
  let choixDeLaLigne = 0;                       // [ebp-0xC] : la case retenue, reportée d'une ligne
                                                // à l'autre quand la ligne n'est pas une liste

  for (;;) {
    restaurerLeFond(jeu);
    jeu.appeler(REDESSINER_LES_ZONES);
    jeu.appeler(SERVIR_L_HOTE);
    const ligneAuDebut = ligneChoisie;          // [ebp-0x10] : avant que le tour ne la change

    for (let k = 0, ligne = LIGNES_DU_JOUEUR; octetSigne(jeu, ligne) >= 0; k++, ligne += TAILLE_D_UNE_LIGNE) {
      const drapeaux = octet(jeu, ligne + 0x0D);
      const y = yDeLaLigne(ligne);
      const yBas = u16(y + hauteurDeLigne);
      let deplacement = 0;                      // [ebp-0x18] : ce que les flèches gauche/droite font
      let caseCliquee = 0xFF;                   // [ebp-8] : la case de liste qu'on vient de cliquer
      const estChoisie = () => s16(s8(ligneChoisie)) === u16(k);

      // Le bouton TERMINE.
      if (drapeaux & 4) {
        if (mot(jeu, CLIC_GAUCHE) !== 0 && dansLeRectangle(jeu, 0x220, 0x250, 0x12C, 0x14A)) {
          jeu.appeler(BRUITAGE, 0, 0x1A);
          oublierLeClic(jeu);
          poserOctet(jeu, 0xD66F0, octet(jeu, NOMBRES_DE_CONCURRENTS + s8(rangDesConcurrents)));
          poserOctet(jeu, 0xD775E, 0);
          poserOctet(jeu, 0xD7759, 0);
          poserOctet(jeu, 0xD7761, 0);
          if (octet(jeu, 0xD66F1) === 0) poserOctet(jeu, 0xD7761, 1);            // SIMPLE
          else if (octet(jeu, 0xD66F1) === 1) poserOctet(jeu, 0xD7759, 1);       // SIM.
          else if (octet(jeu, 0xD66F1) === 2) poserOctet(jeu, 0xD775E, 1);       // GLOBALE
          if (octet(jeu, 0xD671C) === 0) {
            poserLong(jeu, ARGENT_DE_DEPART, long(jeu, ARGENTS_DE_DEPART + 4 * octet(jeu, 0xD66F5)));
          }
          jeu.appeler(ECRIRE_LA_FICHE);
          return;
        }
      }

      // Une ligne à taper : sa mise en valeur et son clic.
      if (drapeaux & 1) {
        if (estChoisie()) {
          jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, ligne + 1), s16(y + 4), intitule(ligne), 0, octet(jeu, COULEUR_CHOISIE));
          poserOctet(jeu, ZONE_ACTIVE, octet(jeu, ligne + 0x0B));
        }
        if (mot(jeu, CLIC_GAUCHE) !== 0
          && dansLeRectangle(jeu, mot(jeu, ligne + 1), mot(jeu, ligne + 7), s16(y), s16(yBas))) {
          jeu.appeler(BRUITAGE, 0, 0x1A);
          oublierLeClic(jeu);
          poserOctet(jeu, ZONE_ACTIVE, octet(jeu, ligne + 0x0B));
          ligneChoisie = u8(k);
        }
      }

      // Une liste de cases : les flèches, puis le clic sur une case ou sur l'intitulé.
      if (drapeaux & 2) {
        const largeurDUneCase = octet(jeu, imageDuMenu(jeu, banque, octet(jeu, ligne + 0x12)) + 4);
        if (estChoisie()) {
          jeu.appeler(ECRIRE_TEXTE, motSigne(jeu, ligne + 1), s16(y + 4), intitule(ligne), 0, octet(jeu, COULEUR_CHOISIE));
          const touche = octet(jeu, TOUCHE_DE_L_IMAGE);
          if (touche === 0x48) {                                   // flèche haut
            if (ligneChoisie !== 0) ligneChoisie = u8(ligneChoisie - 1);
            poserOctet(jeu, TOUCHE_DE_L_IMAGE, 0);
          } else if (touche === 0x1C || touche === 0x50) {          // Entrée, flèche bas
            const suivante = LIGNES_DU_JOUEUR + Math.imul(s8(ligneChoisie) + 1, TAILLE_D_UNE_LIGNE);
            if (octetSigne(jeu, suivante) !== -1) ligneChoisie = u8(ligneChoisie + 1);
            poserOctet(jeu, TOUCHE_DE_L_IMAGE, 0);
          } else if (touche === 0x4B) {                            // flèche gauche
            deplacement = 0xFF;
            poserOctet(jeu, TOUCHE_DE_L_IMAGE, 0);
          } else if (touche === 0x4D) {                            // flèche droite
            deplacement = 1;
            poserOctet(jeu, TOUCHE_DE_L_IMAGE, 0);
          }
          poserOctet(jeu, ZONE_ACTIVE, 0xFF);
        }
        let x = mot(jeu, ligne + 3);
        for (let i = 0; u16(i) < mot(jeu, ligne + 0x0F); i++) {
          if (mot(jeu, CLIC_GAUCHE) !== 0
            && dansLeRectangle(jeu, u16(x), u16(x) + u16(largeurDUneCase), s16(y), s16(yBas))) {
            jeu.appeler(BRUITAGE, 0, 0x1A);
            oublierLeClic(jeu);
            caseCliquee = u8(i);
            ligneChoisie = u8(k);
            poserOctet(jeu, ZONE_ACTIVE, 0xFF);
          }
          x = u16(x + largeurDUneCase + 2);
        }
        if (mot(jeu, CLIC_GAUCHE) !== 0
          && dansLeRectangle(jeu, mot(jeu, ligne + 1), mot(jeu, ligne + 3), s16(y), s16(yBas))) {
          jeu.appeler(BRUITAGE, 0, 0x1A);
          oublierLeClic(jeu);
          ligneChoisie = u8(k);
        }
        choixDeLaLigne = 0xFF;
      }

      // Ce que la ligne règle. `bouger` applique la flèche puis le clic, et borne le choix.
      const bouger = (adresse) => {
        deplacement = u8(deplacement + octet(jeu, adresse));
        if (s8(deplacement) >= 0 && s8(deplacement) < mot(jeu, ligne + 0x0F)) poserOctet(jeu, adresse, deplacement);
        if (s8(caseCliquee) >= 0) poserOctet(jeu, adresse, caseCliquee);
        choixDeLaLigne = octet(jeu, adresse);
      };
      let champ = 0;                            // [ebp-0x48] : le texte que la ligne fait taper
      switch (k - 1) {
        case 0: champ = 0xD6690; break;                          // VOTRE NOM
        case 1: poserOctet(jeu, 0xD66B8, 0); champ = NOM_DU_JOUEUR; break;   // SURNOM
        case 2: {                                                // AGE
          if (!estChoisie()) {
            let age = u16(jeu.appeler(LIRE_UN_NOMBRE, texteDeLAge));
            if (age > 0x7F) age = 0x7F;
            else if (age === 0) age = 1;
            poserOctet(jeu, 0xD66F3, age);
            jeu.appeler(FORMATER, texteDeLAge, FORMAT_NOMBRE, octet(jeu, 0xD66F3));
          }
          champ = texteDeLAge;
          break;
        }
        case 3: bouger(0xD66F4); break;                          // SEXE
        case 4: champ = 0xD66D0; break;                          // NOM DU PARC
        case 5: bouger(0xD66F1); break;                          // SIMULATION
        case 6: bouger(0xD66F2); break;                          // VISITEURS
        case 7: bouger(0xD66F5); break;                          // NIVEAU DE DEPART
        case 8: {                                                // CONCURRENTS
          deplacement = u8(deplacement + rangDesConcurrents);
          if (s8(deplacement) >= 0 && s8(deplacement) < mot(jeu, ligne + 0x0F)) rangDesConcurrents = deplacement;
          if (s8(caseCliquee) >= 0) rangDesConcurrents = caseCliquee;
          choixDeLaLigne = rangDesConcurrents;
          break;
        }
        case 9: bouger(0xD66F6); break;                          // FORCE CONCURRENTS
        case 10:                                                 // DEJA JOUE?
          bouger(0xD66F7);
          poserOctet(jeu, 0xBA0F8, choixDeLaLigne !== 0 ? 0 : 0xFF);
          break;
        default: break;
      }

      // La case choisie d'une liste : son fond (image +5) et son texte.
      if ((drapeaux & 2) && s8(choixDeLaLigne) !== -1) {
        const largeurDUneCase = octet(jeu, imageDuMenu(jeu, banque, octet(jeu, ligne + 0x12)) + 4);
        const x = u16(mot(jeu, ligne + 3) + u16(Math.imul(u16(s8(choixDeLaLigne)), u16(largeurDUneCase + 2))));
        tracer(s16(x), s16(y), imageDuMenu(jeu, banque, octet(jeu, ligne + 0x12) + 5));
        jeu.appeler(ECRIRE_CENTRE, s16(x), s16(x + largeurDUneCase), s16(y + 4),
          texteDe(jeu, TEXTES_DU_JOUEUR, octet(jeu, ligne + 0x11) + s8(choixDeLaLigne)), 0, octet(jeu, COULEUR_CHOISIE));
      }

      // Le champ de saisie : ce qu'on tape, puis son dessin.
      if (drapeaux & 1) {
        if (s8(octet(jeu, ZONE_ACTIVE)) === mot(jeu, ligne + 0x0B)) {
          if (!toucheRefusee(jeu, ligneAuDebut)) {
            ligneChoisie = u8(ligneChoisie + u8(jeu.appeler(TAPER_DANS_UN_CHAMP, champ)));
            if (s8(ligneChoisie) < 0) {
              ligneChoisie = 0;
            } else {
              const ici = LIGNES_DU_JOUEUR + Math.imul(s8(ligneChoisie), TAILLE_D_UNE_LIGNE);
              if (octetSigne(jeu, ici) === -1) ligneChoisie = u8(ligneChoisie - 1);
            }
            poserOctet(jeu, TOUCHE_DE_L_IMAGE, 0);
          } else {
            continue;                                            // la touche est ignorée, ligne suivante
          }
        }
        poserMot(jeu, rectangleDuChamp + 1, mot(jeu, ligne + 3) + 4);
        poserMot(jeu, rectangleDuChamp + 3, y);
        poserMot(jeu, rectangleDuChamp + 5, mot(jeu, ligne + 7) - 4);
        poserMot(jeu, rectangleDuChamp + 7, yBas - 2);
        jeu.appeler(CHAMP_DE_SAISIE, rectangleDuChamp, octet(jeu, ligne + 0x0B), champ);
      }
    }

    // Quitter la ligne du surnom : si le surnom a changé, on revérifie le code de triche et l'âge.
    if (ligneAuDebut !== ligneChoisie
      && octet(jeu, LIGNES_DU_JOUEUR + Math.imul(s8(ligneAuDebut), TAILLE_D_UNE_LIGNE)) === 2) {
      poserOctet(jeu, 0xD66B8, 0);
      if (jeu.appeler(COMPARER_CHAINES, surnomPrecedent, NOM_DU_JOUEUR) !== 0) {
        jeu.appeler(VERIFIER_LA_TRICHE);
        jeu.appeler(FORMATER, texteDeLAge, FORMAT_NOMBRE, octet(jeu, 0xD66F3));
      }
      jeu.appeler(COPIER_CHAINE, surnomPrecedent, NOM_DU_JOUEUR);
    }
    presenterLImage(jeu);
  }
});

// La touche de l'image doit-elle être refusée par le champ de saisie (0x585A0 à 0x58639) ?
//
// Trois refus : le surnom plein (plus de sept caractères) devant un caractère alphanumérique ;
// l'âge devant une lettre ; et, pour ces deux lignes, l'espace et la tabulation. Le refus est
// jugé sur la ligne qui était choisie au **début** du tour, pas sur celle qu'on dessine, et il
// fait sauter la ligne : le champ n'est même pas retracé. La quatrième condition est l'inverse :
// s'il n'y a aucune touche en attente, la ligne de l'âge est sautée elle aussi.
function toucheRefusee(jeu, ligneAuDebut) {
  const ligne = LIGNES_DU_JOUEUR + Math.imul(s8(ligneAuDebut), TAILLE_D_UNE_LIGNE);
  const caractere = octet(jeu, CARACTERE_DE_L_IMAGE);
  const classe = octetSigne(jeu, CLASSES_DE_CARACTERES + u8(caractere + 1));
  if (octet(jeu, ligne) === 2) {                                   // SURNOM
    if (jeu.appeler(LONGUEUR_CHAINE, NOM_DU_JOUEUR) > 7 && (classe & ALPHANUMERIQUE) !== 0) return true;
    if (caractere === 0x20 || caractere === 9) return true;
    return false;
  }
  if (octet(jeu, ligne) === 3) {                                   // AGE
    if ((classe & LETTRE) !== 0 || caractere === 0x20 || caractere === 9) {
      return octet(jeu, TOUCHE_DE_L_IMAGE) !== 0;
    }
  }
  return false;
}

// =================================================================================================
// LA DÉMONSTRATION
// =================================================================================================

// 0x5B55A — lancer la démonstration.
//
// Le premier appel de la boucle principale (0x1107F) compte les images sans un geste du joueur dans
// 0xD6606 ; à la 3 000ᵉ, il appelle cette fonction. La fiche du joueur est écrite sur le disque, son
// surnom mis de côté (0xD7888), l'écran en cours noté (0xD789C) puis remplacé par la vue du parc,
// la carte redemandée, le plein écran quitté, et le compteur d'images de la visite (0xD787C)
// remis à 1. L'octet 0xD7760 dit que la démonstration tourne ; la position de la souris est notée,
// pour que le moindre mouvement arrête la visite (boucle.js, 0x5B5D0).
export function lancerLaDemonstration(jeu) {
  jeu.appeler(ECRIRE_LA_FICHE);
  jeu.appeler(COPIER_CHAINE, 0xD7888, NOM_DU_JOUEUR);
  poserMot(jeu, 0xD789C, mot(jeu, ECRAN));
  poserMot(jeu, ECRAN, 0);
  poserMot(jeu, REDESSINER_CARTE, 1);
  jeu.appeler(FERMER_ECRAN_PLEIN);
  poserLong(jeu, 0xD787C, 1);
  poserOctet(jeu, 0xD7760, 1);
  poserMot(jeu, 0xD660A, mot(jeu, SOURIS_X));
  poserMot(jeu, 0xD660C, mot(jeu, SOURIS_Y));
}

// 0x5B82A — arrêter la démonstration.
//
// Le surnom du joueur est rendu, le code de triche revérifié (le parc de la démonstration a pu
// changer le nom), une partie neuve préparée (0x19EEE), les compteurs remis à zéro, et l'écran
// d'avant rouvert (0x1B23A).
//
// Aucun des sept scénarios ne va jusque-là : la visite s'arrête à la 6 000ᵉ image (boucle.js,
// 0x5B5D0), soit vers 300 s, et le premier appel de la boucle (0x1107F) ne l'appelle qu'après un
// geste du joueur. Elle est prouvée, comme la visite elle-même, par `demo.json` prolongé :
//   node moteur/node/comparer.mjs --modules titre --script moteur/scenarios/demo.json --duree 330
// un appel, zéro divergence, et le rejeu empoisonné de la même partie reste identique.
export function arreterLaDemonstration(jeu) {
  jeu.appeler(COPIER_CHAINE, NOM_DU_JOUEUR, 0xD7888);
  jeu.appeler(VERIFIER_LA_TRICHE);
  jeu.appeler(NOUVELLE_PARTIE);
  poserMot(jeu, 0xD6606, 0);
  poserLong(jeu, 0xD3AFC, 0);
  poserLong(jeu, 0xD787C, 0);
  jeu.appeler(ROUVRIR_UN_ECRAN, mot(jeu, 0xD789C));
  poserOctet(jeu, 0xD7760, 0);
}

// =================================================================================================
// L'ÉCRAN TITRE : LES DIX EMPLACEMENTS ET LES REMERCIEMENTS
// =================================================================================================

const TEXTES = 0xD7BCC;                  // table de textes : l'interface ; +0x10 les dix emplacements,
                                         // +0x110 les titres de la liste, un par mode
const SAUVEGARDE_PRESENTE = 0xD43F6;     // dix octets : l'emplacement n existe-t-il (0x51011) ?
const RELEVER_LES_SAUVEGARDES = 0x51011;
const CHARGER_UNE_PARTIE = 0x2E035, SAUVER_UNE_PARTIE = 0x2DF12;   // (emplacement)
const LISTE_PERMISE = 0xB14B0;           // octet : sans lui, le mode 4 rend la main tout de suite
const NIVEAU_DU_FONDU = 0xD380C, PAS_DU_FONDU = 0xD777F;   // le fondu d'ouverture (boucle.js)
const DEUXIEME_BOUTON = 0xDE5A6;         // mot : le second des quatre mots du clic (oublierLeClic)
const COULEUR_DES_REMERCIEMENTS = 0xD777E;   // octet : ailleurs, le fond des cases
const ECHAP = 1, ENTREE = 0x1C;          // codes de balayage
const TITRE = 0xF2, SURVOLE = 0xF2, VIDE = 0xE6, OCCUPE = 0xDE;   // couleurs de la palette du titre

// 0x1AF83 — la liste des dix emplacements de sauvegarde, une boucle à elle (appelée par l'écran
// titre, 0x1A836, evenements.js : F2, « charger une partie », avec le mode 0).
//
// Les emplacements sont d'abord relevés (0x51011). À chaque tour : l'hôte est servi, le fond remis,
// le titre du mode écrit (le texte 0x44 + mode), puis les dix lignes JEU 0 à JEU 9, de 16 en 16 à
// partir de y = 0x9A, entre x = 0x72 et 0x212 ; la ligne sous le pointeur (la première dont la bande
// le contient) en couleur 0xF2, les autres en 0xDE si l'emplacement existe, 0xE6 sinon ; l'image est
// présentée. Un clic, ou Entrée, sur une ligne : en mode 0, si l'emplacement existe, la partie en est
// chargée (0x2E035), le fondu d'ouverture préparé (niveau 0, pas 12), et la liste rend 1 ; un
// emplacement vide ne fait rien. Dans les autres modes, la partie y est sauvée (0x2DF12) et la liste
// rend 0. Échap rend 0. Le mode 4 rend 0 d'emblée si l'octet 0xB14B0 est nul (ce qu'il désigne, non
// établi).
//
// Rend un octet (al) : le reste d'eax n'est pas significatif, et n'est pas comparé. Exercé par
// titre.json (5 appels, mode 0) : les autres modes, relus instruction par instruction.
export const choisirUnEmplacement = dansLeCadre(0x38, (jeu, cadre, mode) => {
  mode &= 0xFF;
  jeu.appeler(RELEVER_LES_SAUVEGARDES);
  poserMot(jeu, CLIC_GAUCHE, 0);
  if (mode === 4 && octet(jeu, LISTE_PERMISE) === 0) return 0;

  for (;;) {
    jeu.appeler(SERVIR_L_HOTE);
    restaurerLeFond(jeu);
    jeu.appeler(ECRIRE_CENTRE, 0x72, 0x212, 0x86, texteDe(jeu, TEXTES, 0x44 + mode), 0, TITRE);
    let survole = -1;
    for (let k = 0; k < 10; k++) {
      const y = k * 16 + 0x9A;
      if (survole === -1 && motSigne(jeu, SOURIS_Y) >= y && motSigne(jeu, SOURIS_Y) < y + 16) survole = k;
      const couleur = survole === k ? SURVOLE : octet(jeu, SAUVEGARDE_PRESENTE + k) === 0 ? VIDE : OCCUPE;
      jeu.appeler(ECRIRE_CENTRE, 0x72, 0x212, y, texteDe(jeu, TEXTES, 4 + k), 0, couleur);
    }
    presenterLImage(jeu);

    if ((mot(jeu, CLIC_GAUCHE) !== 0 || octet(jeu, TOUCHE_DE_L_IMAGE) === ENTREE) && survole > -1) {
      oublierLeClic(jeu);
      if (mode !== 0) {
        jeu.appeler(SAUVER_UNE_PARTIE, survole);
        return 0;
      }
      if (octet(jeu, SAUVEGARDE_PRESENTE + survole) !== 0) {
        jeu.appeler(CHARGER_UNE_PARTIE, survole);
        poserLong(jeu, NIVEAU_DU_FONDU, 0);
        poserOctet(jeu, PAS_DU_FONDU, 0xC);
        return 1;
      }
    }
    if (octet(jeu, TOUCHE_DE_L_IMAGE) === ECHAP) return 0;
  }
});

// 0x1B513 — les remerciements (F5 à l'écran titre), une boucle à elle.
//
// `textes` : une table de pointeurs vers des lignes, en pages séparées par une ligne qui commence par
// « + », la dernière terminée par une ligne qui commence par « * » (l'écran titre passe l'adresse de
// l'entrée 7 de sa table de textes, [0xD7BD4] + 0x1C). Chaque page reste 300 images, ou jusqu'à ce que le second mot du clic
// (0xDE5A6) se lève : fond remis, lignes centrées entre x = 0xA4 et 0x1F0 à partir de y = 0xAC, de
// la hauteur d'une ligne plus deux en plus, dans la couleur 0xD777E ; attente du balayage, image
// présentée. Puis la page suivante, et, après la dernière, les mots du clic oubliés.
//
// ANOMALIE D'ORIGINE, reproduite : une page terminée directement par « * » fait sauter cette ligne,
// et le programme lit la suivante, au-delà de la fin, comme le début d'une autre page. Le texte du jeu
// n'en souffre pas (les deux appels de titre.json rendent la main) ; sa forme exacte, non relevée.
// Exercé par titre.json (2 appels).
export const remercier = dansLeCadre(0x28, (jeu, cadre, textes) => {
  const ligne = (i) => long(jeu, textes + 4 * u16(i));
  const commencePar = (i, c) => octet(jeu, ligne(i)) === c.charCodeAt(0);
  let i = 0;
  while (!commencePar(i, '*')) {
    const page = i;
    poserMot(jeu, DEUXIEME_BOUTON, 0);
    for (let images = 0; images < 300 && mot(jeu, DEUXIEME_BOUTON) === 0; images++) {
      restaurerLeFond(jeu);
      i = page;
      let y = 0xAC;
      while (!commencePar(i, '+') && !commencePar(i, '*')) {
        jeu.appeler(ECRIRE_CENTRE, 0xA4, 0x1F0, s16(y), ligne(i), 0, octet(jeu, COULEUR_DES_REMERCIEMENTS));
        i++;
        y += octet(jeu, HAUTEUR_DE_LIGNE) + 2;
      }
      jeu.appeler(ATTENDRE_BALAYAGE);
      presenterLImage(jeu);
    }
    i++;
  }
  oublierLeClic(jeu);
});

// =================================================================================================

export const reecritures = [
  { adresse: 0x56E7E, nom: 'mettreEnForme', fn: mettreEnForme, arguments: 4 },
  { adresse: 0x5606C, nom: 'chargerLaCarteDuMonde', fn: chargerLaCarteDuMonde, arguments: 0, memoire: 'entiere' },
  { adresse: 0x575A7, nom: 'poserLeRepereDUnPays', fn: poserLeRepereDUnPays, arguments: 2 },
  { adresse: 0x56532, nom: 'ficheDUnPays', fn: ficheDUnPays, arguments: 1, memoire: 'entiere' },
  { adresse: 0x560D2, nom: 'carteDuMonde', fn: carteDuMonde, arguments: 0, memoire: 'entiere' },
  { adresse: 0x57193, nom: 'ficheDuProprietaire', fn: ficheDuProprietaire, arguments: 2, memoire: 'entiere' },
  { adresse: 0x576FE, nom: 'ficheDuJoueur', fn: ficheDuJoueur, arguments: 0, memoire: 'entiere' },
  { adresse: 0x5B55A, nom: 'lancerLaDemonstration', fn: lancerLaDemonstration, arguments: 0, memoire: 'entiere' },
  { adresse: 0x5B82A, nom: 'arreterLaDemonstration', fn: arreterLaDemonstration, arguments: 0, memoire: 'entiere' },
  // Rend un octet (al) ; le reste d'eax n'est pas significatif et n'est pas comparé.
  { adresse: 0x1AF83, nom: 'choisirUnEmplacement', fn: choisirUnEmplacement, arguments: 1, memoire: 'entiere' },
  { adresse: 0x1B513, nom: 'remercier', fn: remercier, arguments: 1, memoire: 'entiere' },
];

// Rien en attente : les onze fonctions du module sont prouvées.
export const enAttente = [];
