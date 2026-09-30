// Les menus déroulés du parc, leurs commandes, et le département des recherches.
//
// Réécriture lisible des fonctions 0x503DA, 0x508A3, 0x50CCD, 0x51011, 0x51094, 0x515A0 et 0x51780
// du jeu d'origine. Voir docs/guide-reecriture.md.
//
// Le module rassemble deux sujets voisins dans le programme (0x503DA à 0x53E6D) :
//
// LES MENUS DÉROULÉS. La barre de menus du haut de l'écran du parc (0x4FD85 et 0x50651, boucle.js,
// qui décrit aussi la forme d'un menu en 0xB53C6) s'appuie sur trois fonctions d'ici : 0x503DA
// calcule la taille d'un menu qui se déroule, 0x508A3 le dessine, et 0x50CCD exécute les commandes
// de réglage (les sons, les niveaux, les vitesses, RECOMMENCER, le retour à la vue). 0x51094 relie
// les coches de deux lignes du menu PARC à l'état du parc, et 0x51011 relève quels emplacements de sauvegarde
// existent, pour les lignes JEU 00 à JEU 09.
//
// LE DÉPARTEMENT DES RECHERCHES. La touche N (ou la ligne du menu AFFICHAGE) ouvre l'écran 0x4E :
// 0x515A0 le prépare (fond, palette, images), et 0x51780 le fait vivre, une image après l'autre,
// depuis la boucle du parc (0x11C45) : les budgets de recherche de six domaines, leur total, et la
// sortie de l'écran.
//
// Les proportions des menus : [0xD7793] l'échelle (2 en 320x200, 1 en 640x480), [0xD6620] la hauteur
// d'une ligne. Les couleurs, posées par 0x50366 : [0xD7796] le fond d'un menu, [0xD7790] le texte
// d'une ligne active, [0xD778F] celui d'une ligne inactive et le fond de la ligne allumée, [0xD7799]
// le texte de la ligne allumée.

// --- arithmétique de 1994 -----------------------------------------------------------------------
import { ecran, largeurDeLaVue, hauteurDeLaVue } from './grande-vue.js';

const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const s8 = (v) => (v << 24) >> 24;
const u8 = (v) => v & 0xFF;
const idiv = (a, b) => (a / b) | 0;
// Le reste de `idiv`, du signe du dividende comme en x86.
const irem = (a, b) => (a % b) | 0;

const octet = (jeu, a) => jeu.m8[a >>> 0];
const octetSigne = (jeu, a) => s8(jeu.m8[a >>> 0]);
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const long = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const longSigne = (jeu, a) => jeu.dv.getInt32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// Les variables locales de l'original qui doivent être en mémoire (un tampon dont on passe
// l'adresse) : on descend le pointeur de pile comme le fait son `enter`, et l'on rend l'adresse de la
// zone réservée ; les appels suivants empilent plus bas. L'enveloppe (index.js) remet la pile en
// place au retour.
function variablesLocales(jeu, taille) {
  const T = jeu.T;
  T.sauver();
  const bas = ((T.R.esp >>> 0) - taille) >>> 0;
  T.R.esp = bas | 0;
  T.charger();
  return bas;
}

// --- les variables du jeu -----------------------------------------------------------------------
const MODE_VIDEO = 0xDE5F6;              // mot : bit 0 levé en 320x200 (le mot vaut alors 1)
const basseResolution = (jeu) => (octet(jeu, MODE_VIDEO) & 1) !== 0;

const ECHELLE = 0xD7793;                 // octet : 2 en 320x200, 1 en 640x480
const HAUTEUR_LIGNE = 0xD6620;           // mot : la hauteur d'une ligne de menu
const COULEUR_FOND_MENU = 0xD7796;
const COULEUR_ACTIVE = 0xD7790;
const COULEUR_INACTIVE = 0xD778F;        // aussi le fond de la ligne allumée
const COULEUR_ALLUMEE = 0xD7799;
const TEXTES_DES_MENUS = 0xD7BCC;        // table de textes : les lignes des menus ; +0x80, +0x84,
                                         // +0x88 les noms des modificateurs (MAJ, CTRL, ALT)
const NOMS_DES_TOUCHES = 0xB9544;        // table de pointeurs : le nom d'une touche, par scancode
const MARGE_DU_TEXTE = 0xBECBC;          // mot : posé à 0x40 avant chaque ligne (voir 0x508A3)

// Les images de l'interface : l'objet graphique n (table de mots [0xD3B38]) désigne une entrée de
// [0xD3B80] (8 octets), dont le premier mot désigne une entrée de [0xD3B7C] (10 octets), dont le
// premier mot est le décalage de l'image dans la banque [0xD3BB8].
const OBJETS_GRAPHIQUES = 0xD3B38;
const ANIMATIONS = 0xD3B80, IMAGES_D_ANIMATION = 0xD3B7C, BANQUE_D_IMAGES = 0xD3BB8;
const OBJET_COCHE = 0x1A2 / 2;           // la coche d'une ligne à cocher
const OBJET_FLECHE = 0x1A4 / 2;          // la flèche d'une ligne qui déroule un sous-menu

const MENUS = 0xB53C6, TAILLE_MENU = 0x354, TAILLE_LIGNE = 0x15;

const FICHE_DU_PARC = 0xD3818;           // pointeur : la fiche du parc du joueur
const PARC_COURANT = 0xD3814;            // pointeur : ses comptes
const JOUEUR = 0xD665C;                  // mot : le joueur courant
const DEMANDES = 0xD441F;                // les demandes du joueur, 6 octets chacune (+0 la sorte,
                                         // +1 et +3 deux mots), exécutées en fin d'image (0x2CCF8)
const ECRAN = 0xD6652;                   // mot : l'écran ouvert, 0 = la vue du parc
const ECRAN_PRECEDENT = 0xD660E;         // mot : celui qu'un écran plein rend en sortant
const OUTIL = 0xD6670;
const REDESSINER_CARTE = 0xD666E;
const MESSAGES = 0xD7BC0;                // table de textes : les messages de l'interface

// --- les fonctions appelées ---------------------------------------------------------------------
const LARGEUR_TEXTE = 0x3F677;           // (texte) : largeur en pixels
const RECTANGLE = 0x1188C;               // (x, y, largeur, hauteur, couleur)
const ECRIRE_TEXTE = 0x3F49E;            // (x, y, texte, normal, couleur)
const IMAGE_EN_COULEUR = 0x117B3;        // (x, y, image, couleur)
const LIGNE_BASSE = 0x81374, LIGNE_HAUTE = 0x8148C;    // (x0, y0, x1, y1, couleur, drapeaux)
const CONTOUR = 0x3E34E;                 // (x0, y0, x1, y1, couleur)
const FORMATER = 0x7F652;                // sprintf
const REMPLIR = 0x7F1A0;                 // memset
const AJOUTER_CHAINE = 0x81336;          // strcat
const OUVRIR = 0x7EB70, FERMER = 0x7EC20;              // open (nom, mode), close (poignée)
const FORMAT_TEXTE = 0xB02D2;            // « %s »
const FORMAT_SAUVEGARDE = 0xB02D8;       // « %ssave/%s.g%d »
const CHEMIN_D_INSTALLATION = 0xD3BDE;
const SURNOM = 0xD66B0;                  // le surnom du joueur, celui des sauvegardes
const SAUVEGARDE_PRESENTE = 0xD43F6;     // dix octets : l'emplacement JEU n existe-t-il ?

const ARRETER_LES_BRUITAGES = 0x80DC0;
const ARRETER_LA_MUSIQUE = 0x80990;
const REGLER_L_AMBIANCE = 0x80568;       // (propriétaire, bruitage, mode, volume)
const VOLUME_DE_LA_FOULE = 0xB14B4;
const FERMER_BARRE_DE_MENUS = 0x4FD2D;
const DEMANDER_CONFIRMATION = 0x78E36;   // (texte, 0) : 1 si le joueur accepte

// =================================================================================================
// LES MENUS DÉROULÉS
// =================================================================================================

// Le nom du modificateur d'une ligne (+0x13 : 1, 2 ou 4), ou 0 s'il n'y en a pas.
function texteDuModificateur(jeu, modificateur) {
  const decalage = { 1: 0x80, 2: 0x84, 4: 0x88 }[modificateur];
  return decalage === undefined ? 0 : long(jeu, long(jeu, TEXTES_DES_MENUS) + decalage);
}

const texteDeLaLigne = (jeu, ligne) => long(jeu, long(jeu, TEXTES_DES_MENUS) + 4 * motSigne(jeu, ligne + 2));
const nomDeLaTouche = (jeu, ligne) => long(jeu, NOMS_DES_TOUCHES + 4 * octet(jeu, ligne + 0x14));

// 0x503DA — placer un menu qui se déroule.
//
// L'appelant a posé le coin d'accroche : x en +0 et en +4, y en +2. Le menu prend la largeur de sa
// plus longue ligne plus celle de son plus long raccourci (« CTRL » + « S »…), avec des marges ; sa
// hauteur est la somme des lignes, un filet comptant deux unités de plus. S'il déborde à droite de
// 640, il s'ouvre vers la gauche de son accroche (x0 devenu le bord droit) ou, si l'accroche est
// dans la moitié gauche de l'écran, se colle au bord droit ; s'il déborde en bas (400 lignes en
// 320x200, 480 sinon), il remonte contre le bas. Le mot +8 reçoit la largeur de la colonne des
// textes, où 0x508A3 aligne les raccourcis ; aucune ligne n'est allumée (+0xA = -1).
//
// Le calcul se fait sur 16 bits, comme l'original.
export function placerUnMenu(jeu, menu) {
  const e = octet(jeu, ECHELLE);
  let largeurTextes = 0, largeurRaccourcis = 0;
  let hauteur = 2 * e;
  // (640 sur 480 : l'écran, `ecran`, plus grand en grande vue, grande-vue.js.)
  const basDeLEcran = mot(jeu, MODE_VIDEO) === 1 ? 0x190 : ecran.hauteur;
  const droiteDeLEcran = ecran.largeur;

  poserMot(jeu, menu + 0xA, 0xFFFF);
  for (let ligne = menu + 0xC; motSigne(jeu, ligne + 2) !== -1; ligne += TAILLE_LIGNE) {
    let l = jeu.appeler(LARGEUR_TEXTE, texteDeLaLigne(jeu, ligne));
    if (s16(l) > s16(largeurTextes)) largeurTextes = l;

    l = jeu.appeler(LARGEUR_TEXTE, nomDeLaTouche(jeu, ligne));
    const modificateur = texteDuModificateur(jeu, octet(jeu, ligne + 0x13));
    if (modificateur) l += jeu.appeler(LARGEUR_TEXTE, modificateur);
    if (s16(l) > s16(largeurRaccourcis)) largeurRaccourcis = l;

    hauteur += e * mot(jeu, HAUTEUR_LIGNE);
    if (octet(jeu, ligne + 4) & 2) hauteur += 2 * e;
  }
  largeurRaccourcis += 10 * e;
  largeurTextes += 12 * e;
  poserMot(jeu, menu + 8, largeurTextes);
  const largeur = s16(largeurTextes + largeurRaccourcis);

  if (motSigne(jeu, menu + 4) + largeur > droiteDeLEcran) {
    if (motSigne(jeu, menu) > droiteDeLEcran - motSigne(jeu, menu + 4)) {
      // vers la gauche de l'accroche, sans passer le bord gauche
      poserMot(jeu, menu + 4, mot(jeu, menu));
      poserMot(jeu, menu, mot(jeu, menu) - largeur);
      if (motSigne(jeu, menu) < 0) {
        poserMot(jeu, menu, 0);
        poserMot(jeu, menu + 4, largeur);
      }
    } else {
      poserMot(jeu, menu + 4, droiteDeLEcran - e);
      poserMot(jeu, menu, mot(jeu, menu + 4) - largeur);
    }
  } else {
    poserMot(jeu, menu, mot(jeu, menu + 4));
    poserMot(jeu, menu + 4, mot(jeu, menu + 4) + largeur);
  }

  if (motSigne(jeu, menu + 2) + s16(hauteur) > basDeLEcran) {
    poserMot(jeu, menu + 6, basDeLEcran - e);
    poserMot(jeu, menu + 2, mot(jeu, menu + 6) - hauteur);
  } else {
    poserMot(jeu, menu + 6, mot(jeu, menu + 2) + hauteur);
  }
}

// L'image d'un objet graphique de l'interface (voir OBJETS_GRAPHIQUES).
function imageDeLObjet(jeu, objet) {
  const animation = (long(jeu, ANIMATIONS) + 8 * mot(jeu, long(jeu, OBJETS_GRAPHIQUES) + 2 * objet)) >>> 0;
  const image = (long(jeu, IMAGES_D_ANIMATION) + 10 * mot(jeu, animation)) >>> 0;
  return (long(jeu, BANQUE_D_IMAGES) + mot(jeu, image)) >>> 0;
}

// 0x508A3 — dessiner un menu déroulé.
//
// Le fond, puis chaque ligne : la ligne allumée sur un bandeau, une ligne inactive (l'octet que
// désigne son pointeur +9 est nul) en couleur éteinte ; à gauche la coche d'une ligne à cocher
// (bit 0 de +4, cochée si l'octet que désigne +5 est non nul), à droite la flèche d'un sous-menu ou
// le raccourci, « modificateur + touche », aligné sur la colonne +8 ; un filet sous la ligne si le
// bit 1 de +4 est levé. Enfin le contour du menu.
export function dessinerUnMenu(jeu, menu) {
  const e = octet(jeu, ECHELLE);
  const x0 = motSigne(jeu, menu), y0 = motSigne(jeu, menu + 2);
  const x1 = motSigne(jeu, menu + 4), y1 = motSigne(jeu, menu + 6);
  // le tampon du raccourci, 64 octets, comme l'original sur sa pile
  const raccourci = variablesLocales(jeu, 0x78) + 0x10;
  let y = y0 + 2 * e;

  jeu.appeler(RECTANGLE, x0, y0, s16(x1 - x0 + e), s16(y1 - y0 + e), octet(jeu, COULEUR_FOND_MENU));
  const allumee = menu + 0xC + TAILLE_LIGNE * motSigne(jeu, menu + 0xA);
  for (let ligne = menu + 0xC; motSigne(jeu, ligne + 2) !== -1; ligne += TAILLE_LIGNE) {
    const condition = long(jeu, ligne + 9);
    let couleur;
    if (condition !== 0 && octet(jeu, condition) === 0) {
      couleur = octet(jeu, COULEUR_INACTIVE);
    } else if (ligne === allumee) {
      jeu.appeler(RECTANGLE, x0, s16(y), s16(x1 - x0), s16(e * mot(jeu, HAUTEUR_LIGNE) - e), octet(jeu, COULEUR_INACTIVE));
      couleur = octet(jeu, COULEUR_ALLUMEE);
    } else {
      couleur = octet(jeu, COULEUR_ACTIVE);
    }
    // Rien ne relit ce mot dans 0x3F49E ; il est posé à chaque ligne, comme l'original le faisait.
    poserMot(jeu, MARGE_DU_TEXTE, 0x40);

    if (octet(jeu, ligne + 4) & 1) {
      const coche = long(jeu, ligne + 5);
      if (coche !== 0 && octet(jeu, coche) !== 0) {
        jeu.appeler(IMAGE_EN_COULEUR, u16(x0 + 2 * e), u16(y), imageDeLObjet(jeu, OBJET_COCHE), couleur);
      }
    }

    if (motSigne(jeu, ligne) !== -1) {
      const yFleche = s16(y) + ((e * motSigne(jeu, HAUTEUR_LIGNE)) >> 1) - 3 * e;
      jeu.appeler(IMAGE_EN_COULEUR, u16(x1 - 8 * e), u16(yFleche), imageDeLObjet(jeu, OBJET_FLECHE), couleur);
    } else {
      const modificateur = texteDuModificateur(jeu, octet(jeu, ligne + 0x13));
      if (modificateur) jeu.appeler(FORMATER, raccourci, FORMAT_TEXTE, modificateur);
      else jeu.appeler(REMPLIR, raccourci, 0, 0x40);
      jeu.appeler(AJOUTER_CHAINE, raccourci, nomDeLaTouche(jeu, ligne));
      jeu.appeler(ECRIRE_TEXTE, s16(x0 + mot(jeu, menu + 8) + 5 * e), s16(y), raccourci, 0, couleur);
    }
    jeu.appeler(ECRIRE_TEXTE, s16(x0 + 11 * e), s16(y), texteDeLaLigne(jeu, ligne), 0, couleur);

    y += e * mot(jeu, HAUTEUR_LIGNE);
    if (octet(jeu, ligne + 4) & 2) {
      jeu.appeler(basseResolution(jeu) ? LIGNE_BASSE : LIGNE_HAUTE, x0, s16(y), x1, s16(y), 0, 0);
      y += 2 * e;
    }
  }
  jeu.appeler(CONTOUR, u16(x0), u16(y0), u16(x1), u16(y1), 0);
}

// 0x50CCD — les commandes de réglage des menus : (commande).
//
// La barre de menus ne l'appelle pas directement : la ligne choisie range son adresse et son argument
// en [0xD3828] et [0xD6622], et la boucle l'appelle en fin d'image.
//   1  EFFETS SONORES : bascule les bruitages ([0xBA721]) s'il y a une carte son ([0xBA720]) ;
//      éteints, tous s'arrêtent ; rallumés dans un parc ouvert (+0x18 de la fiche du parc), le bruit
//      de la foule reprend
//   2  MUSIQUE : bascule la musique ([0xBA715]) s'il y en a une ([0xBA714]), en l'arrêtant d'abord
//   3  lève [0xB14C6] (voir CLAVIER_REDUIT, boucle.js) et referme la barre ; aucune ligne ne l'emploie
//   5  le retour à la vue du parc, sans outil
//   6  RECOMMENCER : après confirmation, la demande 0x3A, avec les deux moitiés de [0xD3AF4]
//   7, 8, 9  les trois niveaux, MATERNELLE, SIMULATION et BUSINESS ([0xD66F1] et ses trois drapeaux)
//   10 à 13  les quatre vitesses, LENT, NORMAL, RAPIDE, ULTRA-RAPIDE : un drapeau chacune, et la
//      demande 0x42 avec la valeur -2, 0, 1 ou 20
//   0, 4 et au-delà de 13 : rien.
const NIVEAUX = [
  // [0xD66F1], puis les drapeaux MATERNELLE (0xD7761), SIMULATION (0xD7759), BUSINESS (0xD775E)
  { niveau: 0, maternelle: 1, simulation: 0, business: 0 },
  { niveau: 1, maternelle: 0, simulation: 1, business: 0 },
  { niveau: 2, maternelle: 0, simulation: 0, business: 1 },
];
const VITESSES = [0xFFFE, 0, 1, 0x14];   // la valeur de la demande 0x42 ; les drapeaux 0xD775A à 0xD775D

function poserUneDemande(jeu, sorte, valeur) {
  const demande = DEMANDES + 6 * mot(jeu, JOUEUR);
  poserOctet(jeu, demande, sorte);
  poserMot(jeu, demande + 1, valeur);
  return demande;
}

export function commandeDesMenus(jeu, commande) {
  const m8 = jeu.m8;
  commande = u16(commande);
  switch (commande) {
    case 1:
      if (m8[0xBA720] !== 0) {
        m8[0xBA721] = m8[0xBA721] === 0 ? 1 : 0;
        if (m8[0xBA721] === 0) jeu.appeler(ARRETER_LES_BRUITAGES);
        else if (octet(jeu, long(jeu, FICHE_DU_PARC) + 0x18) !== 0) {
          jeu.appeler(REGLER_L_AMBIANCE, 0, 0x15, 3, m8[VOLUME_DE_LA_FOULE]);
        }
      } else {
        m8[0xBA721] = 0;
      }
      break;
    case 2:
      if (m8[0xBA714] !== 0) {
        if (m8[0xBA715] !== 0) jeu.appeler(ARRETER_LA_MUSIQUE);
        m8[0xBA715] = m8[0xBA715] === 0 ? 1 : 0;
      } else {
        m8[0xBA715] = 0;
      }
      break;
    case 3:
      m8[0xB14C6] = 1;
      jeu.appeler(FERMER_BARRE_DE_MENUS);
      break;
    case 5:
      poserMot(jeu, ECRAN, 0);
      poserMot(jeu, OUTIL, 0);
      poserMot(jeu, REDESSINER_CARTE, 1);
      break;
    case 6: {
      // La boîte de confirmation tourne sa propre boucle : par prudence, elle est appelée à la
      // hauteur de l'original (quatre registres et 12 octets de variables sous l'entrée), avec son
      // adresse de retour, et trouve sous elle les mêmes restes de pile.
      jeu.T.sauver();
      const pile = ((jeu.T.R.esp >>> 0) - 0x1C) >>> 0;
      jeu.T.charger();
      const reponse = jeu.appelerDepuis(0x50E2A, pile, DEMANDER_CONFIRMATION, long(jeu, long(jeu, MESSAGES) + 0x198), 0);
      if (u16(reponse) === 1) {
        const valeur = long(jeu, 0xD3AF4);
        const demande = poserUneDemande(jeu, 0x3A, valeur >>> 16);
        poserMot(jeu, demande + 3, valeur);
      }
      break;
    }
    case 7: case 8: case 9: {
      const n = NIVEAUX[commande - 7];
      m8[0xD66F1] = n.niveau;
      m8[0xD7761] = n.maternelle;
      m8[0xD7759] = n.simulation;
      m8[0xD775E] = n.business;
      break;
    }
    case 10: case 11: case 12: case 13:
      for (let k = 0; k < 4; k++) m8[0xD775A + k] = k === commande - 10 ? 1 : 0;
      poserUneDemande(jeu, 0x42, VITESSES[commande - 10]);
      break;
    default:
      break;
  }
}

// 0x51011 — relever les emplacements de sauvegarde : pour JEU 0 à JEU 9, le fichier
// « <dossier>save/<surnom>.g<n> » peut-il s'ouvrir ? La réponse va en [0xD43F6 + n], qui rend
// actives les lignes des sous-menus CHARGER.
export function releverLesSauvegardes(jeu) {
  const nom = variablesLocales(jeu, 0x48);
  for (let n = 0; n <= 9; n++) {
    jeu.appeler(FORMATER, nom, FORMAT_SAUVEGARDE, CHEMIN_D_INSTALLATION, SURNOM, n);
    const poignee = jeu.appeler(OUVRIR, nom, 0x200) | 0;
    if (poignee >= 0) {
      poserOctet(jeu, SAUVEGARDE_PRESENTE + n, 1);
      jeu.appeler(FERMER, poignee);
    } else {
      poserOctet(jeu, SAUVEGARDE_PRESENTE + n, 0);
    }
  }
}

// 0x51094 — relier les coches du menu PARC à la fiche du parc : la ligne de texte 0x26, PARC OUVERT,
// est cochée selon l'octet +0x18 de la fiche (le parc ouvert), celle de texte 0x25, FEUX D'ARTIFICE,
// selon l'octet +0x77 (les feux allumés). La fiche changeant d'adresse à chaque chargement, le
// pointeur (+5 de la ligne) est reposé.
export function relierLeMenuDuParc(jeu) {
  const parc = long(jeu, FICHE_DU_PARC);
  for (let n = 0; ; n = u8(n + 1)) {
    const ligne = MENUS + 0xC + TAILLE_LIGNE * n;
    const texte = motSigne(jeu, ligne + 2);
    if (texte === -1) break;
    if (texte === 0x26) poserLong(jeu, ligne + 5, parc + 0x18);
    else if (texte === 0x25) poserLong(jeu, ligne + 5, parc + 0x77);
  }
}

// =================================================================================================
// LE DÉPARTEMENT DES RECHERCHES
// =================================================================================================

// Les écrans pleins se dessinent en 320x200 : 0x1171F y passe depuis le 640x480 (et lève 0xB1510),
// 0x11761 en revient. Un écran ouvert alors que la basse résolution est déjà forcée par un autre lève
// 0xB9758 : il ne change pas de mode, ni en entrant ni en sortant.
const BASSE_FORCEE = 0xB1510;
const GARDER_LE_MODE = 0xB9758;
const ECRAN_A_ROUVRIR = 0xB9ED9;         // octet : l'écran d'avant, relu par 0x1B23A
const REGLAGES = 0xB97F9, TAILLE_REGLAGE = 0x1D;   // les réglages de l'écran, 0x1D octets chacun
const BUDGET_TOTAL = 0xB98C6;            // long : le budget total de recherche au dernier réglage
const SURFACE = 0xDE5BC, FOND = 0xD3B98;
const PALETTE_DE_L_ECRAN = 0xCEBE0;
const TAILLE_DES_IMAGES = 0xD35A0;
const IMAGES_DE_L_ECRAN = 0xD3BA8;       // la banque des images brutes

const OUVRIR_ECRAN_PLEIN = 0x40D3E;
const CHANGER_LE_CURSEUR = 0x116E4;
const CURSEURS = 0xD3B84;
const PASSER_EN_BASSE = 0x1171F, REVENIR_EN_HAUTE = 0x11761;
const ARRETER_UNE_MUSIQUE = 0x81984;     // (0, 0x15, 0) ; non établi
const JOUER_EN_BOUCLE = 0x81AD0;         // (p, n, boucles)
const CHARGER_UN_FICHIER = 0x7F0B0;      // (chemin, destination) : la taille lue
const RECOPIER_DES_LIGNES = 0x55EFA;     // (source, destination, lignes)
const RELOGER_LES_SPRITES = 0x10C80;     // (début, fin, images)
const POSER_LA_PALETTE = 0x7C282;
const FICHIER_FOND = 0xB8535;            // « data/mres-0.dat »
const FICHIER_PALETTE = 0xB8574;         // « data/mrspal-0.dat »
const FICHIER_IMAGES = 0xB85B3;          // « data/mrsspr-0.dat »
const FICHIER_TABLE = 0xB85F2;           // « data/mrsspr-0.tab »

// 0x515A0 — ouvrir le département des recherches (l'écran 0x4E).
//
// L'écran plein s'ouvre, le pointeur redevient une flèche, l'écran d'avant est noté pour le retour,
// et l'on passe en 320x200.
// Le budget total (+0x112 de la fiche du parc) vaut au moins 1 ; il devient le maximum des six
// curseurs de domaine. Puis le fond (recopié dans le tampon de fond), la palette, et la banque
// d'images de l'écran sont chargés.
export function ouvrirLesRecherches(jeu) {
  if (octet(jeu, BASSE_FORCEE) !== 0) poserOctet(jeu, GARDER_LE_MODE, 1);
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  jeu.appeler(CHANGER_LE_CURSEUR, long(jeu, CURSEURS));
  poserMot(jeu, ECRAN_PRECEDENT, mot(jeu, ECRAN));
  poserOctet(jeu, ECRAN_A_ROUVRIR, octet(jeu, ECRAN));
  poserMot(jeu, ECRAN, 0x4E);
  if (octet(jeu, GARDER_LE_MODE) === 0) jeu.appeler(PASSER_EN_BASSE);
  jeu.appeler(ARRETER_UNE_MUSIQUE, 0, 0x15, 0);
  jeu.appeler(JOUER_EN_BOUCLE, 0, 7, -1);

  const parc = long(jeu, FICHE_DU_PARC);
  if (motSigne(jeu, parc + 0x112) < 1) poserMot(jeu, parc + 0x112, 1);
  poserLong(jeu, BUDGET_TOTAL, motSigne(jeu, parc + 0x112));
  for (let k = 0; k < 6; k++) {
    const maximum = REGLAGES + TAILLE_REGLAGE * k + 2;
    poserLong(jeu, maximum, motSigne(jeu, long(jeu, FICHE_DU_PARC) + 0x112));
    if (long(jeu, maximum) === 0) poserLong(jeu, maximum, 1);
  }

  jeu.appeler(CHARGER_UN_FICHIER, FICHIER_FOND, long(jeu, SURFACE));
  jeu.appeler(RECOPIER_DES_LIGNES, long(jeu, SURFACE), long(jeu, FOND), 0x190);
  jeu.appeler(CHARGER_UN_FICHIER, FICHIER_PALETTE, PALETTE_DE_L_ECRAN);
  poserLong(jeu, TAILLE_DES_IMAGES, 0);
  let taille = jeu.appeler(CHARGER_UN_FICHIER, FICHIER_IMAGES, long(jeu, IMAGES_DE_L_ECRAN));
  poserLong(jeu, 0xD3B18, long(jeu, IMAGES_DE_L_ECRAN));
  poserLong(jeu, TAILLE_DES_IMAGES, taille);
  taille = jeu.appeler(CHARGER_UN_FICHIER, FICHIER_TABLE, long(jeu, BANQUE_D_IMAGES));
  poserLong(jeu, 0xD3B2C, long(jeu, BANQUE_D_IMAGES) + Math.imul(taille, 6));
  jeu.appeler(RELOGER_LES_SPRITES, long(jeu, BANQUE_D_IMAGES), long(jeu, 0xD3B2C), long(jeu, IMAGES_DE_L_ECRAN));
  poserLong(jeu, 0xD3B20, long(jeu, BANQUE_D_IMAGES));
  jeu.appeler(POSER_LA_PALETTE, PALETTE_DE_L_ECRAN);
}

// -------------------------------------------------------------------------------------------------
// L'ÉCRAN DES RECHERCHES, UNE IMAGE
// -------------------------------------------------------------------------------------------------
//
// L'écran se décrit par une table de vingt réglages, en 0xB97F9, 0x1D octets chacun :
//   +0x00 octet  la sorte : 0 à 5 le domaine de recherche que règle la jauge (le rang de son budget
//                dans la fiche du parc), 6 le budget total, 7 la réserve (le budget non attribué) ;
//                les réglages 8 à 13 et 14 à 19 reprennent 0 à 5 pour les tubes et les voyants
//   +0x01 octet  la zone de texte de son chiffre (table 0xB9759, voir plus bas)
//   +0x02 long   le maximum : le budget total pour les jauges, [0xD3568 + 4 × réglage] pour les tubes
//   +0x06 mot x, +0x08 mot y, +0x0A mot largeur, +0x0C mot hauteur : la jauge
//   +0x0E octet signé  la taille des deux flèches de la jauge, au-dessus et au-dessous
//   +0x0F mot x, +0x11 mot y : l'indicateur de niveau d'un tube
//   +0x13 mot x, +0x15 mot y : le premier voyant d'un domaine
//   +0x17 mot x, +0x19 mot y : la molette (un bouton qui tourne : plus au clic gauche, moins au droit)
//   +0x1B octet  l'image de la molette, 0 à 3 ; +0x1C octet signé : les crans qu'il lui reste à tourner
//                (0x53E6E en tourne un par image)
// Le réglage 6 est lu à ses adresses propres (0xB98A8 et suivantes), le 7 aussi (0xB98C5…) : son
// maximum, 0xB98C6, est le budget total au dernier changement.
//
// La fiche du parc [0xD3818] : +0x110 mot signé la réserve, +0x112 mot signé le budget total,
// +0x114 six mots signés les budgets des domaines, +0x120 six mots l'avancement de leurs recherches,
// +0x248 six octets : le domaine est-il ouvert (1) ? Les comptes [0xD3814] : +0x64C et +0x664, six
// longs chacun, le travail fait et le travail demandé par la recherche en cours de chaque domaine.
//
// Les zones de texte, 0xB9759, 0x14 octets : +0 x0, +2 x1, +4 y du chiffre (0x3F3DA, centré) ; +6 x,
// +8 y, +0xA le texte (table [0xD7BA8]) du nom qui défile, +0x10 son compteur ; +0xB x, +0xD y, +0xF le
// texte de la seconde ligne, +0x12 son compteur.
//
// Les rectangles fixes : 0xB9A45 (x0, y0, x1, y1) le bouton qui augmente le budget total, 0xB9A4D celui
// qui le diminue, 0xB9A3D la sortie.

const REGLAGE_TOTAL = 6, REGLAGE_RESERVE = 7;
const reglage = (i) => REGLAGES + TAILLE_REGLAGE * i;
const R_SORTE = 0, R_ZONE = 1, R_MAXIMUM = 2, R_X = 6, R_Y = 8, R_LARGEUR = 0xA, R_HAUTEUR = 0xC;
const R_FLECHES = 0xE, R_NIVEAU_X = 0xF, R_NIVEAU_Y = 0x11, R_VOYANTS_X = 0x13, R_VOYANTS_Y = 0x15;
const R_MOLETTE_X = 0x17, R_MOLETTE_Y = 0x19, R_IMAGE_MOLETTE = 0x1B, R_CRANS = 0x1C;

const ZONES_DE_TEXTE = 0xB9759, TAILLE_ZONE = 0x14;
const BOUTON_PLUS = 0xB9A45, BOUTON_MOINS = 0xB9A4D, BOUTON_SORTIE = 0xB9A3D;
const MAXIMUMS_DES_TUBES = 0xD3568;
const ANIMATION_DES_JAUGES = 0xD7866;    // un octet par jauge : l'image du liquide, 0 à 8
const IMAGES_DE_LA_RECHERCHE = 0xD3B20;  // la banque d'images de l'écran, 6 octets par image
const TEXTES_DE_LA_RECHERCHE = 0xD7BA8;
const COMPTES = PARC_COURANT;

const RESERVE = 0x110, TOTAL = 0x112, BUDGETS = 0x114, AVANCEMENTS = 0x120, OUVERTS = 0x248;
const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;
const DROIT_APPUI = 0xDE5A4, GAUCHE_APPUI = 0xDE5A6, DROIT_TENU = 0xDE5AA, GAUCHE_TENU = 0xDE5AC;
const TOUCHE = 0xDE688;
const T_ENTREE = 0x1C, T_ESPACE = 0x39;
const NIVEAU = 0xD66F1;                  // 0 MATERNELLE : l'écran ne se règle pas
const NOIR = 0xD7773;

const DESSINER_IMAGE = 0x20F4C;          // (x, y, image, 0)
const TRACER_TRONQUEE = 0x11AF4;         // (x, y, image, lignes ôtées)
const TEXTE_CENTRE = 0x3F3DA;            // (x0, x1, y, texte, couleur)
const ECRIRE_EN_DEFILANT = 0x4FB79;      // (x, y, largeur, décalage, texte, couleur)
const TOURNER_LA_MOLETTE = 0x53E6E;      // (réglage)
const VALEUR_ABSOLUE = 0x80BF2;
const MESSAGE_EN_BAS = 0x7C16C;          // (palette, texte)
const ATTENDRE_BALAYAGE = 0x80BE4;
const RESTAURER_LE_FOND_BASSE = 0x80E20, RESTAURER_LE_FOND_HAUTE = 0x54ED6;
const FORMAT_NOMBRE = 0xB02E8, FORMAT_CHAINE = 0xB02EB;   // « %d », « %s »

// 0x51780 — le département des recherches, à chaque image.
//
// D'abord le réglage, si le niveau n'est pas MATERNELLE et selon les boutons de la souris :
//  - la jauge du budget total (réglage 6), horizontale : un clic maintenu dessus pose le total en
//    proportion (plein à gauche) ; la flèche de droite le met à 1, celle de gauche au maximum ; les
//    deux boutons fixes l'augmentent ou le diminuent de 1. Un changement de total met chaque domaine
//    à l'échelle (en 1/8192), la réserve reçoit ce qui reste, et un dépassement est à reprendre sur
//    les domaines ;
//  - la molette de la réserve (réglage 7) : le gauche prend un trente-deuxième du total dans la
//    réserve pour le répartir entre les domaines ouverts, le droit l'y rend ;
//  - les jauges des six domaines, verticales : clic maintenu dans la jauge (plein en haut), flèche du
//    bas (budget à 0), flèche du haut (au plus possible), molette (plus ou moins un trente-deuxième).
// Ce qui est à reprendre (ou à rendre) se répartit entre les domaines ouverts par parts égales, un
// domaine vide (ou plein) se retirant du partage.
//
// Puis le dessin : les six jauges et leur liquide animé, les molettes, les chiffres, les noms qui
// défilent ; les six tubes d'avancement ; les 24 voyants par domaine (le travail fait, en 24es) ; la
// jauge du total, la réserve en briques ; un message au niveau MATERNELLE. Enfin la sortie, par le
// bouton de sortie, Entrée ou Espace : les images du parc sont rechargées, l'écran d'avant rouvert.
//
// Anomalies reproduites :
//  - le partage d'une somme à reprendre (reste > 0) compte les domaines qui y prennent part en
//    testant l'ouverture d'un domaine resté d'un tour précédent ([ebp-0x20], le compteur d'une autre
//    boucle, qui peut valoir 6 et lire l'octet +0x24E), et non de chacun ; le partage d'une somme à
//    rendre, lui, teste le bon ;
//  - la garde des deux boucles de partage est écrite à l'envers : « tant que reste ≠ 0 ou plus de
//    200 tours » ; elle ne limite rien, et une somme qui ne peut être partagée (aucun domaine ouvert)
//    bloquerait le jeu ;
//  - le réglage 6 et les jauges testent l'ouverture +0x248 à leur propre rang de réglage (6, ou le
//    rang de la jauge), pas au rang du domaine.
//
// Le calcul se fait comme l'original, sur 32 bits avec les mots signés de la fiche, et les budgets
// sont réécrits en mots.
export function lesRecherches(jeu) {
  const m8 = jeu.m8;
  const locales = variablesLocales(jeu, 0x104);
  const texte = locales + (0x104 - 0xDC);      // le tampon de `sprintf`, [ebp-0xDC]

  // Les variables de l'original qui survivent d'un réglage à l'autre dans la même image.
  let reste = 0;                     // [ebp-0x44] : la somme à reprendre (> 0) ou à rendre (< 0)
  let rang = 0;                      // [ebp-0x20] : le compteur des boucles de domaines
  let part = 0;                      // [ebp-0x4C]
  const plein = [0, 0, 0, 0, 0, 0];  // [ebp-0x5C] : le domaine ne prend plus part au partage

  const fiche = () => long(jeu, FICHE_DU_PARC);
  const reserve = () => motSigne(jeu, fiche() + RESERVE);
  const total = () => motSigne(jeu, fiche() + TOTAL);
  const poserReserve = (v) => poserMot(jeu, fiche() + RESERVE, v);
  const poserTotal = (v) => poserMot(jeu, fiche() + TOTAL, v);
  const budget = (d) => motSigne(jeu, fiche() + BUDGETS + 2 * d);
  const poserBudget = (d, v) => poserMot(jeu, fiche() + BUDGETS + 2 * d, v);
  const ouvert = (n) => octet(jeu, fiche() + OUVERTS + n);
  const maximum = (i) => longSigne(jeu, reglage(i) + R_MAXIMUM);
  const champ = (i, c) => mot(jeu, reglage(i) + c);
  const sx = () => motSigne(jeu, SOURIS_X), sy = () => motSigne(jeu, SOURIS_Y);
  const gaucheTenu = () => mot(jeu, GAUCHE_TENU) !== 0;
  const droitTenu = () => mot(jeu, DROIT_TENU) !== 0;
  const seRegle = () => octet(jeu, NIVEAU) !== 0;
  const images = () => long(jeu, IMAGES_DE_LA_RECHERCHE);
  const imageDeLaBanque = (n) => (images() + 6 * n) >>> 0;
  const ajouterOctet = (a, v) => poserOctet(jeu, a, octet(jeu, a) + v);
  const crans = (i) => reglage(i) + R_CRANS;
  const CRANS_DU_TOTAL = reglage(REGLAGE_TOTAL) + R_CRANS;
  // Le trente-deuxième du maximum, tronqué vers zéro.
  const trenteDeuxieme = (i) => idiv(maximum(i), 32);

  if (basseResolution(jeu)) jeu.appeler(RESTAURER_LE_FOND_BASSE, long(jeu, FOND), long(jeu, SURFACE), 0xC8);
  else jeu.appeler(RESTAURER_LE_FOND_HAUTE, long(jeu, FOND), long(jeu, SURFACE));
  poserMot(jeu, 0xB14C2, 0);

  // Les maximums des tubes : les quantités de travail des recherches en cours.
  for (let i = 8; i <= 0xD; i++) {
    poserLong(jeu, reglage(i) + R_MAXIMUM, long(jeu, MAXIMUMS_DES_TUBES + 4 * i));
    if (long(jeu, reglage(i) + R_MAXIMUM) === 0) poserLong(jeu, reglage(i) + R_MAXIMUM, 1);
  }
  jeu.appeler(CHANGER_LE_CURSEUR, long(jeu, CURSEURS) + 6);

  // Le partage de la somme à reprendre ou à rendre entre les domaines ouverts.
  function partager() {
    if (reste > 0) {
      for (let tours = 0; reste !== 0 || s16(tours) > 200; tours++) {
        let n = 0;
        for (let j = 0; j < 6; j++) if (ouvert(s16(rang)) !== 0 && plein[j] === 0) n = u8(n + 1);
        if (n === 1) part = reste;
        else if (s8(n) > 1) part = idiv(reste, s8(n));
        if (part === 0 && reste !== 0) part = 1;
        for (rang = 0; reste !== 0 && s16(rang) < 6; rang++) {
          if (ouvert(rang) === 0) continue;
          if (budget(rang) >= part) {
            poserBudget(rang, budget(rang) - part);
            reste = (reste - part) | 0;
          } else {
            reste = (reste - budget(rang)) | 0;
            poserBudget(rang, 0);
            plein[rang] = 1;
          }
        }
      }
    } else if (reste < 0) {
      for (let tours = 0; reste !== 0 || s16(tours) > 200; tours++) {
        let n = 0;
        for (let j = 0; j < 6; j++) if (ouvert(j) !== 0 && plein[j] === 0) n = u8(n + 1);
        if (n === 1) part = reste;
        else if (s8(n) > 1) part = idiv(reste, s8(n));
        if (part === 0 && reste !== 0) part = -1;
        for (rang = 0; reste !== 0 && s16(rang) < 6; rang++) {
          if (ouvert(rang) === 0) continue;
          if (budget(rang) - part > maximum(rang)) {
            reste = (reste - (maximum(rang) - budget(rang))) | 0;
            poserBudget(rang, maximum(rang));
            plein[rang] = 1;
          } else {
            poserBudget(rang, budget(rang) - part);
            reste = (reste - part) | 0;
          }
        }
      }
    }
  }

  // Après un changement du budget du domaine d (réglé par la jauge i), la molette de la jauge tourne
  // d'un cran par trente-deuxième du maximum, au moins d'un cran ; celle de la réserve à l'inverse.
  function tournerLesMolettes(i, d, ancien) {
    const ecart = (budget(d) - ancien) | 0;
    ajouterOctet(crans(i), idiv(ecart << 5, maximum(i)));
    ajouterOctet(CRANS_DU_TOTAL, -idiv(ecart << 5, maximum(i)));
    if (octet(jeu, crans(i)) === 0 && budget(d) !== ancien) {
      // un cran dans le sens de l'écart (l'original calcule la valeur absolue deux fois)
      ajouterOctet(crans(i), idiv(ecart, jeu.appeler(VALEUR_ABSOLUE, ecart) | 0));
      ajouterOctet(CRANS_DU_TOTAL, -idiv(ecart, jeu.appeler(VALEUR_ABSOLUE, ecart) | 0));
    }
  }

  const dansLaJauge = (i) => sx() > champ(i, R_X) && sx() < champ(i, R_X) + champ(i, R_LARGEUR)
    && sy() > champ(i, R_Y) && sy() < champ(i, R_Y) + champ(i, R_HAUTEUR);
  const surLaMolette = (i) => sx() > champ(i, R_MOLETTE_X) && sy() > champ(i, R_MOLETTE_Y)
    && sx() < champ(i, R_MOLETTE_X) + octet(jeu, images() + 0x1C)
    && sy() < champ(i, R_MOLETTE_Y) + octet(jeu, images() + 0x1D);
  const dansLeRectangle = (r) => sx() > mot(jeu, r) && sx() < mot(jeu, r + 4)
    && sy() > mot(jeu, r + 2) && sy() < mot(jeu, r + 6);

  // ---- le budget total (réglage de sorte 6) ----------------------------------------------------
  function reglerLeTotal(i) {
    if (ouvert(i) === 0) return;
    const ancien = total();
    const x = champ(i, R_X), y = champ(i, R_Y), largeur = champ(i, R_LARGEUR), hauteur = champ(i, R_HAUTEUR);
    const fleches = octetSigne(jeu, reglage(i) + R_FLECHES);
    if (gaucheTenu() && seRegle()) {
      if (dansLaJauge(i)) {
        poserTotal(maximum(i) - idiv(Math.imul(sx() - x, maximum(i)), largeur));
      } else if (sx() > x + largeur && sx() < x + largeur + octet(jeu, images() + 0xA) + fleches
        && sy() > y && sy() < y + hauteur && seRegle()) {
        poserTotal(1);
      } else if (sx() > x - fleches && sx() < x && sy() > y && sy() < y + hauteur) {
        poserTotal(maximum(i));
      } else if (dansLeRectangle(BOUTON_MOINS)) {
        if (total() > 1) poserTotal(total() - 1);
      } else if (dansLeRectangle(BOUTON_PLUS)) {
        if (total() < maximum(i)) poserTotal(total() + 1);
      }
    }
    if (total() === ancien) return;

    // Le total a changé : chaque domaine garde sa proportion, en 1/8192 ; le nouveau total devient
    // le maximum des jauges ; la réserve reçoit le reste, et un dépassement est à reprendre.
    poserReserve(total());
    for (let d = 0; s16(d) < 6; d++) {
      const proportion = idiv(budget(d) << 13, maximum(d));
      poserLong(jeu, reglage(d) + R_MAXIMUM, total());
      poserBudget(d, idiv(Math.imul(proportion, maximum(d)), 8192));
      poserReserve(reserve() - budget(d));
    }
    poserLong(jeu, BUDGET_TOTAL, total());
    if (reserve() < 0) {
      reste = -reserve();
      poserReserve(0);
    }
  }

  // ---- la molette de la réserve (réglage de sorte 7) -------------------------------------------
  function reglerLaReserve(i) {
    if (ouvert(i) === 0) return;
    const pas = trenteDeuxieme(i);
    const surLaMoletteDuTotal = () => sx() > mot(jeu, reglage(REGLAGE_TOTAL) + R_MOLETTE_X)
      && sy() > mot(jeu, reglage(REGLAGE_TOTAL) + R_MOLETTE_Y)
      && sx() < octet(jeu, images() + 0x34) + mot(jeu, reglage(REGLAGE_TOTAL) + R_MOLETTE_X)
      && sy() < octet(jeu, images() + 0x35) + mot(jeu, reglage(REGLAGE_TOTAL) + R_MOLETTE_Y);
    if (gaucheTenu() && reserve() < total() && surLaMoletteDuTotal() && seRegle()) {
      // un trente-deuxième du total, pris aux domaines, va à la réserve
      if (maximum(i) < 0x20 || pas + reserve() > total()) {
        reste = (total() - reserve()) | 0;
        poserReserve(total());
      } else {
        reste = pas;
        poserReserve(reserve() + pas);
      }
      ajouterOctet(CRANS_DU_TOTAL, 1);
      let tourne = 0;
      for (rang = 0; s16(rang) < 6 && s8(tourne) < reste; rang++) {
        if (ouvert(s16(rang)) === 1) { ajouterOctet(crans(s16(rang)), -1); tourne = u8(tourne + 1); }
      }
    } else if (droitTenu() && reserve() > 0 && surLaMoletteDuTotal() && seRegle()) {
      // un trente-deuxième de la réserve est rendu aux domaines
      if (maximum(i) < 0x20 || reserve() - pas < 0) {
        reste = -reserve();
        poserReserve(0);
      } else {
        reste = -pas;
        poserReserve(reserve() - pas);
      }
      ajouterOctet(CRANS_DU_TOTAL, -1);
      let tourne = 0;
      for (rang = 0; s16(rang) < 6 && s8(tourne) > reste; rang++) {
        if (ouvert(s16(rang)) === 1) { ajouterOctet(crans(s16(rang)), 1); tourne = u8(tourne - 1); }
      }
    }
    partager();
  }

  // ---- la jauge d'un domaine (réglages de sorte 0 à 5) -----------------------------------------
  function reglerUnDomaine(i, d) {
    if (ouvert(i) !== 1 || !seRegle()) return;
    const x = champ(i, R_X), y = champ(i, R_Y), largeur = champ(i, R_LARGEUR), hauteur = champ(i, R_HAUTEUR);
    const fleches = octetSigne(jeu, reglage(i) + R_FLECHES);
    const auPlus = (cible) => {
      const disponible = (budget(d) + reserve()) | 0;
      poserBudget(d, cible > disponible ? disponible : cible);
      poserReserve(disponible - budget(d));
    };
    if (gaucheTenu() && dansLaJauge(i)) {
      const ancien = budget(d);
      auPlus(maximum(i) - idiv(Math.imul(sy() - y, maximum(i)), hauteur));
      tournerLesMolettes(i, d, ancien);
    } else if (gaucheTenu() && sx() > x && sy() > y + hauteur && sx() < x + largeur && sy() < y + hauteur + fleches) {
      // la flèche du bas : le domaine rend tout à la réserve
      const ancien = budget(d);
      poserReserve(reserve() + budget(d));
      poserBudget(d, 0);
      tournerLesMolettes(i, d, ancien);
    } else if (gaucheTenu() && sx() > x && sy() > y - fleches && sx() < x + largeur && sy() < y) {
      // la flèche du haut : le domaine prend tout ce qu'il peut
      const ancien = budget(d);
      auPlus(maximum(i));
      tournerLesMolettes(i, d, ancien);
    } else if (gaucheTenu() && surLaMolette(i)) {
      // la molette, à gauche : un trente-deuxième de plus, pris à la réserve
      let pas = trenteDeuxieme(i);
      if (s16(pas) === 0) pas = champ(i, R_MAXIMUM);
      if (s16(pas) > reserve()) {
        if (reserve() !== 0) {
          ajouterOctet(crans(i), 1);
          ajouterOctet(CRANS_DU_TOTAL, -1);
          poserBudget(d, budget(d) + reserve());
          poserReserve(0);
        }
      } else {
        ajouterOctet(crans(i), 1);
        ajouterOctet(CRANS_DU_TOTAL, -1);
        poserBudget(d, budget(d) + pas);
        poserReserve(reserve() - pas);
      }
    } else if (droitTenu() && surLaMolette(i)) {
      // la molette, à droite : un trente-deuxième de moins, rendu à la réserve
      let pas = trenteDeuxieme(i);
      if (s16(pas) === 0) pas = champ(i, R_MAXIMUM);
      if (s16(pas) > budget(d)) {
        if (budget(d) !== 0) {
          ajouterOctet(crans(i), -1);
          ajouterOctet(CRANS_DU_TOTAL, 1);
          poserReserve(reserve() + budget(d));
          poserBudget(d, 0);
        }
      } else {
        ajouterOctet(crans(i), -1);
        ajouterOctet(CRANS_DU_TOTAL, 1);
        poserBudget(d, budget(d) - pas);
        poserReserve(reserve() + pas);
      }
    }
  }

  for (let i = 0; i < 8; i++) {
    const sorte = octet(jeu, reglage(i) + R_SORTE);
    if (sorte < 6) reglerUnDomaine(i, sorte);
    else if (sorte === 6) reglerLeTotal(i);
    else if (sorte === 7) reglerLaReserve(i);
  }

  // ---- le dessin -------------------------------------------------------------------------------
  const zone = (i) => ZONES_DE_TEXTE + TAILLE_ZONE * octet(jeu, reglage(i) + R_ZONE);
  const ecrireLeChiffre = (z, valeur) => {
    jeu.appeler(FORMATER, texte, FORMAT_NOMBRE, valeur);
    jeu.appeler(TEXTE_CENTRE, motSigne(jeu, z), motSigne(jeu, z + 2), motSigne(jeu, z + 4), texte, octet(jeu, NOIR));
  };
  const texteDeLaRecherche = (n) => long(jeu, long(jeu, TEXTES_DE_LA_RECHERCHE) + 4 * n);
  // Le compteur de défilement d'une zone : rendu avant d'être augmenté.
  const compter = (a) => { const c = mot(jeu, a); poserMot(jeu, a, c + 1); return c; };

  // Les six jauges : le liquide, animé (neuf images, 0xD7866), dont la hauteur dit le budget.
  for (let i = 0; s16(i) < 6; i++) {
    const d = octet(jeu, reglage(i) + R_SORTE);
    const hauteur = champ(i, R_HAUTEUR);
    const x = champ(i, R_X), y = champ(i, R_Y);
    const liquide = () => imageDeLaBanque(((octet(jeu, ANIMATION_DES_JAUGES + i) / 4) | 0) + 0x16);
    const animer = () => {
      ajouterOctet(ANIMATION_DES_JAUGES + i, 1);
      if (octet(jeu, ANIMATION_DES_JAUGES + i) > 8) poserOctet(jeu, ANIMATION_DES_JAUGES + i, 0);
    };
    let vide = (hauteur - idiv(Math.imul(hauteur, budget(d)), maximum(i))) | 0;   // la hauteur vide
    vide = (s16(vide) - irem(s16(vide), 2)) | 0;
    if (s16(vide) <= 0) {
      vide = 0;
      jeu.appeler(DESSINER_IMAGE, x, y, liquide(), 0);
      animer();
    }
    if (s16(vide) < hauteur) {
      if (s16(vide) > 0) {
        // l'image du liquide est raccourcie le temps du tracé : son octet +5, la hauteur, en lignes
        // de 640x480 (la moitié en haute résolution)
        const raccourci = basseResolution(jeu) ? vide : idiv(s16(vide), 2);
        ajouterOctet(liquide() + 5, -raccourci);
        if (octet(jeu, liquide() + 5) > 1) jeu.appeler(DESSINER_IMAGE, x, u16(y + vide), liquide(), 0);
        ajouterOctet(liquide() + 5, raccourci);
      }
      animer();
    }
    jeu.appeler(TOURNER_LA_MOLETTE, i);
    jeu.appeler(DESSINER_IMAGE, champ(i, R_MOLETTE_X), champ(i, R_MOLETTE_Y),
      imageDeLaBanque(octetSigne(jeu, reglage(i) + R_IMAGE_MOLETTE) + 4), 0);

    const z = zone(i);
    ecrireLeChiffre(z, budget(d));
    jeu.appeler(FORMATER, texte, FORMAT_CHAINE, texteDeLaRecherche(octet(jeu, z + 0xA)));
    jeu.appeler(ECRIRE_EN_DEFILANT, mot(jeu, z + 6), mot(jeu, z + 8), 9, u16(compter(z + 0x10) >> 3), texte, octet(jeu, NOIR));
    if (ouvert(i) === 0) {
      // un domaine fermé : le texte 0x3C à la place de la recherche en cours
      jeu.appeler(FORMATER, texte, FORMAT_CHAINE, long(jeu, long(jeu, TEXTES_DE_LA_RECHERCHE) + 0x3C));
      jeu.appeler(TEXTE_CENTRE, motSigne(jeu, z + 0xB), s16(mot(jeu, z + 0xB) + 0x48), motSigne(jeu, z + 0xD), texte, octet(jeu, NOIR));
    } else {
      jeu.appeler(FORMATER, texte, FORMAT_CHAINE, texteDeLaRecherche(octet(jeu, z + 0xF)));
      jeu.appeler(ECRIRE_EN_DEFILANT, mot(jeu, z + 0xB), mot(jeu, z + 0xD), 9, u16(compter(z + 0x12) >> 2), texte, octet(jeu, NOIR));
    }
  }

  // Les six tubes : l'avancement de chaque recherche (+0x120), et un indicateur à sept niveaux.
  for (let i = 8; s16(i) <= 0xD; i++) {
    const d = octet(jeu, reglage(i) + R_SORTE);
    const hauteur = champ(i, R_HAUTEUR);
    const x = champ(i, R_X), y = champ(i, R_Y);
    const avancement = motSigne(jeu, fiche() + AVANCEMENTS + 2 * d);
    let vide = s16(hauteur - idiv(Math.imul(hauteur, avancement), maximum(i)));
    vide = s16(vide - irem(vide, 2));
    if (vide > hauteur) {
      vide = s16(hauteur);
    } else if (vide <= 0) {
      jeu.appeler(DESSINER_IMAGE, x, y, imageDeLaBanque(0x19), 0);
      vide = 0;
    } else {
      jeu.appeler(TRACER_TRONQUEE, x, y, imageDeLaBanque(0x19), s16(-vide));
    }
    const niveau = u8(7 - idiv(vide * 7, hauteur));
    jeu.appeler(DESSINER_IMAGE, champ(i, R_NIVEAU_X), champ(i, R_NIVEAU_Y), imageDeLaBanque(niveau + 0xC), 0);
  }

  // Les voyants : 24 par domaine, sur quatre rangées de six, allumés en proportion du travail fait.
  for (let i = 0xE; s16(i) <= 0x13; i++) {
    const d = octet(jeu, reglage(i) + R_SORTE);
    const comptes = long(jeu, COMPTES);
    let allumes = u8(idiv(Math.imul(longSigne(jeu, comptes + 0x64C + 4 * d), 0x18), longSigne(jeu, comptes + 0x664 + 4 * d)));
    if (allumes > 0x18) allumes = 0x18;
    let x = champ(i, R_VOYANTS_X), y = champ(i, R_VOYANTS_Y);
    for (rang = 1; s16(rang) <= 0x18; rang++) {
      const image = allumes >= s16(rang) ? 0x78 : 0x7E;     // 0x78 : l'image 20 ; 0x7E : la 21
      jeu.appeler(DESSINER_IMAGE, u16(x), u16(y), (images() + image) >>> 0, 0);
      x += 0xE;
      if (irem(s16(rang), 6) === 0) {
        x = champ(i, R_VOYANTS_X);
        y += 0xC;
      }
    }
  }

  // La jauge du total : un curseur qui glisse, plein à gauche.
  const T = reglage(REGLAGE_TOTAL);
  let position = (mot(jeu, T + R_LARGEUR) - idiv(Math.imul(total(), mot(jeu, T + R_LARGEUR)), longSigne(jeu, T + R_MAXIMUM))) | 0;
  if (s16(position) < 0) position = 0;
  jeu.appeler(DESSINER_IMAGE, u16(mot(jeu, T + R_X) + position), mot(jeu, T + R_Y), imageDeLaBanque(1), 0);
  ecrireLeChiffre(ZONES_DE_TEXTE + TAILLE_ZONE * octet(jeu, T + R_ZONE), total());
  jeu.appeler(TOURNER_LA_MOLETTE, REGLAGE_TOTAL);
  jeu.appeler(DESSINER_IMAGE, mot(jeu, T + R_MOLETTE_X), mot(jeu, T + R_MOLETTE_Y),
    imageDeLaBanque(octetSigne(jeu, T + R_IMAGE_MOLETTE) + 8), 0);

  // La réserve : une rangée de briques, de droite à gauche, sous la jauge du total.
  const V = reglage(REGLAGE_RESERVE);
  const largeurBrique = octet(jeu, images() + 0x16);
  const briques = idiv(Math.imul((mot(jeu, V + R_LARGEUR) - s16(position)) | 0, reserve()),
    Math.imul(largeurBrique, longSigne(jeu, V + R_MAXIMUM)));
  const xBrique = (n) => u16(mot(jeu, V + R_X) + mot(jeu, V + R_LARGEUR) - Math.imul(largeurBrique, n));
  let n = 0;
  for (; s16(n) < u16(briques) + 1; n++) {
    jeu.appeler(DESSINER_IMAGE, xBrique(n), mot(jeu, V + R_Y), imageDeLaBanque(3), 0);
  }
  // une brique entamée au bout, si la rangée dépasse la largeur +0x10 de l'image
  if (Math.imul(largeurBrique, u16(briques)) > octet(jeu, images() + 0x10)) {
    jeu.appeler(DESSINER_IMAGE, xBrique(n), mot(jeu, V + R_Y), imageDeLaBanque(2), 0);
  }
  ecrireLeChiffre(ZONES_DE_TEXTE + TAILLE_ZONE * octet(jeu, V + R_ZONE), reserve());

  if (octet(jeu, NIVEAU) === 0) {
    jeu.appeler(MESSAGE_EN_BAS, PALETTE_DE_L_ECRAN, long(jeu, long(jeu, MESSAGES) + 0xE8));
  }
  jeu.appeler(ATTENDRE_BALAYAGE);

  // ---- la sortie -------------------------------------------------------------------------------
  const surLaSortie = sx() > mot(jeu, BOUTON_SORTIE) && sx() < mot(jeu, BOUTON_SORTIE + 4)
    && sy() > mot(jeu, BOUTON_SORTIE + 2) && sy() < mot(jeu, BOUTON_SORTIE + 6) && gaucheTenu();
  if (!surLaSortie && m8[TOUCHE] !== T_ENTREE && m8[TOUCHE] !== T_ESPACE) return;

  for (const a of [DROIT_APPUI, GAUCHE_APPUI, DROIT_TENU, GAUCHE_TENU]) poserMot(jeu, a, 0);
  // les images du parc reviennent (data/mspr-0.dat et .tab)
  jeu.appeler(0x1180E, 0xB0BBB, long(jeu, IMAGES_DE_L_ECRAN), long(jeu, TAILLE_DES_IMAGES));
  poserLong(jeu, TAILLE_DES_IMAGES, 0);
  jeu.appeler(CHARGER_UN_FICHIER, 0xB0C0A, long(jeu, BANQUE_D_IMAGES));
  jeu.appeler(RELOGER_LES_SPRITES, long(jeu, BANQUE_D_IMAGES), long(jeu, 0xD3B88), long(jeu, IMAGES_DE_L_ECRAN));
  poserMot(jeu, ECRAN, mot(jeu, ECRAN_PRECEDENT));
  if (basseResolution(jeu)) jeu.appeler(0x81590, long(jeu, SURFACE), 0x190, 0);
  else jeu.appeler(0x815B8, long(jeu, SURFACE), 0x1E0, 0);
  if (basseResolution(jeu)) jeu.appeler(0x80210, 0x190);
  else jeu.appeler(0x55507);
  if (octet(jeu, GARDER_LE_MODE) === 0) jeu.appeler(REVENIR_EN_HAUTE);
  jeu.appeler(0x1B23A, octet(jeu, ECRAN_A_ROUVRIR));
  jeu.appeler(0x55FCF);
  jeu.appeler(0x7C32D);
  jeu.appeler(0x80350, 0, 7);
  if (octet(jeu, fiche() + 0x18) !== 0) jeu.appeler(REGLER_L_AMBIANCE, 0, 0x15, 3, m8[VOLUME_DE_LA_FOULE]);
  jeu.appeler(0x40D79);
}

// Les registres que l'original sauve à l'entrée et rend à la sortie (push ebx, esi, edi ; enter) :
// une routine appelée à la sortie de l'écran des recherches ne rend pas edi intact, et l'appelant le
// relit.
function enGardantLesRegistres(routine) {
  return (jeu, ...args) => {
    const T = jeu.T;
    T.sauver();
    const { ebx, esi, edi, ebp } = T.R;
    T.charger();
    try {
      return routine(jeu, ...args);
    } finally {
      T.sauver();
      Object.assign(T.R, { ebx, esi, edi, ebp });
      T.charger();
    }
  };
}

// Les zones déclarées à la comparaison appel par appel : le tas, où les fichiers se chargent.
const FIN_DE_LA_PILE = 0xE2340;
const auDelaDeLaPile = (jeu) => [[FIN_DE_LA_PILE, jeu.machine.tasLibre]];

export const reecritures = [
  { adresse: 0x503DA, nom: 'placerUnMenu', fn: placerUnMenu, arguments: 1 },
  { adresse: 0x508A3, nom: 'dessinerUnMenu', fn: dessinerUnMenu, arguments: 1 },
  // RECOMMENCER fait tourner la boîte de confirmation, qui redessine le parc (et ses objets, dans le tas)
  { adresse: 0x50CCD, nom: 'commandeDesMenus', fn: commandeDesMenus, arguments: 1,
    zones: (jeu, commande) => (u16(commande) === 6 ? auDelaDeLaPile(jeu) : []) },
  { adresse: 0x51011, nom: 'releverLesSauvegardes', fn: (jeu) => releverLesSauvegardes(jeu), arguments: 0 },
  { adresse: 0x51094, nom: 'relierLeMenuDuParc', fn: (jeu) => relierLeMenuDuParc(jeu), arguments: 0 },
  { adresse: 0x515A0, nom: 'ouvrirLesRecherches', fn: (jeu) => ouvrirLesRecherches(jeu), arguments: 0,
    zones: auDelaDeLaPile },
  { adresse: 0x51780, nom: 'lesRecherches', fn: enGardantLesRegistres((jeu) => lesRecherches(jeu)), arguments: 0,
    zones: auDelaDeLaPile },
];

export const enAttente = [];
