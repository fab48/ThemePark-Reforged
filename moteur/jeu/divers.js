// La saisie d'un nom, la jauge de stock, le panneau des jauges et la lecture de sndsetup.inf.
//
// Réécriture lisible de 0x793B1, 0x3DA5E, 0x3B496, 0x3DE18, 0x7B3F6, 0x5F7D4 et 0x5FAB0.
// Voir docs/guide-reecriture.md.
//
// Sept fonctions éparses de l'interface, que rien ne rassemblait encore. Elles se rangent en trois
// familles, indiquées ici pour la suite du chantier :
//
// LA SAISIE MODALE D'UN NOM — 0x793B1, 0x3B496, 0x3DA5E (§ 11.2 : « la case du nom d'une fiche
// ouvre une saisie modale, qui tourne hors de la boucle du parc »). 0x793B1 dessine une image de
// la boîte de dialogue et rend ce qu'il faut en faire ; 0x3B496 est le clavier du champ, 0x3DA5E
// son dessin. Deux appelants : l'écran titre 0x1A836, qui demande le prénom du joueur, et 0x3854C,
// qui renomme la fiche d'un employé, d'une boutique ou d'une attraction. 0x3DA5E sert aussi à la
// liste à choix de l'écran titre, 0x576FE — c'est le champ de saisie de toute l'interface.
//
// UN CHAMP DE SAISIE, c'est un numéro : l'octet 0xB14D8 désigne le champ actif (0xFF : aucun, la
// saisie est finie), et la table 0xB7864 donne, pour chaque numéro, la position du curseur dans le
// texte — un octet signé, 0xFF pour « pas encore placé ». La saisie modale emploie toujours le
// champ 7 ; 0x576FE et les écrans de gestion ont les leurs. Le texte lui-même vit chez l'appelant.
//
// LE DESSIN DES JAUGES — 0x3DE18 et 0x7B3F6. Le premier est le fond des deux barres de jauges de
// l'écran du parc (l'ordre 0x12 d'une fenêtre, moteur/jeu/fenetres.js) : il appartient clairement à
// ce module-là, et n'est ici qu'en attendant. Le second trace la jauge de stock d'une marchandise
// dans la fiche d'une boutique (0x4E359).
//
// LA CONFIGURATION DU SON — 0x5F7D4 et 0x5FAB0, appelées une fois chacune au lancement par
// 0x1095C : elles lisent le fichier sndsetup.inf écrit par le programme d'installation, ou les
// variables d'environnement BF_MUSIC et BF_SOUND qui en tiennent lieu (moteur/hote/son.js).
//
// LES COULEURS. Les octets 0xD776B à 0xD7784 sont un cache de couleurs, relevé par 0x12452 au
// lancement et à chaque changement de palette : 0x80250(palette, r, g, b) y cherche l'index le plus
// proche d'une teinte voulue, en 0 à 0x3F par composante. Celles d'ici :
//   0xD7770 (0x38,0x20,0x0F) brun          0xD7772 (0x3F,0x30,0x17) orange
//   0xD7773 (0,0,0) noir                   0xD7775 (0,0x3F,0) vert vif
//   0xD777B (0x30,0,0) rouge sombre        0xD777C (0x3F,0,0) rouge vif
//   0xD7781 (0x3F,0x3F,0x26) jaune clair   0xD7783 (0x3F,0x17,0x17) rouge clair

import { ADRESSES } from './etat.js';

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
const s8 = (v) => (v << 24) >> 24;
// `idiv` : division entière tronquée vers zéro ; `div` : la même, non signée.
const idiv = (a, b) => (a / b) | 0;
const div = (a, b) => ((a >>> 0) / (b >>> 0)) >>> 0;

const octet = (jeu, a) => jeu.m8[a];
const octetSigne = (jeu, a) => s8(jeu.m8[a]);
const mot = (jeu, a) => jeu.dv.getUint16(a, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a, true);
const long = (jeu, a) => jeu.dv.getUint32(a, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a, v & 0xFFFF, true);

// Les variables locales de l'original qui doivent être en mémoire (un tampon dont on passe
// l'adresse) : on descend le pointeur de pile comme le fait son `enter`, et l'on rend l'adresse de
// la zone réservée ; les appels suivants empilent plus bas. L'enveloppe (index.js) remet la pile en
// place au retour, et cette mémoire est morte après lui, comme les variables de l'original.
function variablesLocales(jeu, taille) {
  const T = jeu.T;
  T.sauver();
  const bas = ((T.R.esp >>> 0) - taille) >>> 0;
  T.R.esp = bas | 0;
  T.charger();
  return bas;
}

// --- les variables du jeu ----------------------------------------------------------------------
const MODE = ADRESSES.modeAffichage;       // mot : 1 = 320x200, 8 = 640x480
const REDESSINER_CARTE = ADRESSES.redessinerCarte;  // mot 0xD666E

const EPAISSEUR = 0xD778A;          // octet : l'unité de l'interface, 2 en 320x200, 1 en 640x480
const HAUTEUR_DE_LIGNE = 0xD7765;   // octet : hauteur de l'image du « W » de la police
const TEINTES = 0xB14DA;            // pointeur vers six couleurs de l'interface
const BANQUE_INTERFACE = 0xD3B54;   // pointeur : images des cadres, icônes et fonds, 6 octets
const BANQUE_POLICE = 0xD3B64;      // pointeur : images de la police de l'interface, 6 octets
const CARACTERES = 0xB51C1;         // 256 octets : code de caractère -> numéro d'image
const PALETTE = 0xD3B8C;            // pointeur : la palette courante
const TEXTES_DE_L_ECRAN = 0xD7BC0;  // pointeur : table de pointeurs de textes

const CHAMP_ACTIF = 0xB14D8;        // octet signé : le champ de saisie actif ; 0xFF, aucun
const CURSEURS = 0xB7864;           // octet signé par champ : la position du curseur dans le texte
const CLASSES = 0xB0A5C;            // table des classes de caractères, indexée par le code plus un
const TOUCHE = 0xDE688;             // octet : le code de balayage de la touche de l'image
const SIGNE = 0xD77A1;              // octet : le signe ASCII de cette touche

const SOURIS_X = 0xBECAC, SOURIS_Y = 0xBECAE;           // mots signés : le pointeur
const DROIT_APPUI = 0xDE5A4, GAUCHE_APPUI = 0xDE5A6;    // mots : l'appui, à remettre à zéro
const DROIT_TENU = 0xDE5AA, GAUCHE_TENU = 0xDE5AC;      // mots : le bouton maintenu

const FICHE_DU_PARC = 0xD3818;      // pointeur : +0x4B la capacité de l'entrepôt
const CHEMIN_D_INSTALLATION = 0xD3BDE;   // la chaîne du dossier d'où le jeu a été lancé
const SANS_CHEMIN = 0xB0B69;        // octet, vaut 1 : sndsetup.inf est cherché dans le dossier courant

// Les couleurs du cache de 0x12452 (voir l'en-tête).
const BRUN = 0xD7770, ORANGE = 0xD7772, NOIR = 0xD7773, VERT = 0xD7775;
const ROUGE_SOMBRE = 0xD777B, ROUGE = 0xD777C, JAUNE = 0xD7781, ROUGE_CLAIR = 0xD7783;

// --- les fonctions du jeu appelées ---------------------------------------------------------------
const RECTANGLE_PLEIN = 0x1188C;         // (x, y, largeur, hauteur, couleur)
const LIGNE_BASSE = 0x81374, LIGNE_HAUTE = 0x8148C;    // (x0, y0, x1, y1, couleur, 0)
const TRACER_BASSE = 0x5EC9C, TRACER_HAUTE = 0x55BD4;  // (x, y, entrée d'image)
const CADRE_BISEAUTE = 0x3E149;          // (x0, y0, x1, y1, couleurBasDroite, couleurHautGauche)
const PANNEAU_SAILLANT = 0x3E673;        // (x0, y0, x1, y1)
const ECRIRE_TEXTE = 0x3F49E;            // (x, y, texte, normal, couleur)
const ECRIRE_CENTRE = 0x3F377;           // (x0, x1, y, texte, normal, couleur)
const OUVRIR_ECRAN_PLEIN = 0x40D3E, FERMER_ECRAN_PLEIN = 0x40D79;
const COULEUR_LA_PLUS_PROCHE = 0x80250;  // (palette, r, g, b) -> index, dans al
const BRUITAGE = 0x80C80;                // (propriétaire, bruitage)
const LONGUEUR = 0x7E822;                // strlen
const COPIER_CHAINE = 0x7E1ED;           // strcpy
const AJOUTER_CHAINE = 0x81336;          // strcat
const OUVRIR_FICHIER = 0x83023;          // fopen
const FERMER_FICHIER = 0x83175;          // fclose
const LIRE_FORMATE = 0x83155;            // fscanf
const LIRE_CHAINE_FORMATEE = 0x833A5;    // sscanf
const VARIABLE_D_ENVIRONNEMENT = 0x832F5;  // getenv
const COMPARER_SANS_CASSE = 0x833D8;     // stricmp : 0 si les deux chaînes sont égales
const MESSAGE = 0x7E83E;                 // printf
const POSER_LE_PILOTE_DE_MUSIQUE = 0x6010C;   // (code du pilote)
const OUVRIR_LE_SON_NUMERIQUE = 0x6058B;

const basseResolution = (jeu) => (jeu.m8[MODE] & 1) !== 0;
const teinte = (jeu, k) => jeu.m8[(long(jeu, TEINTES) + k) | 0];

function ligne(jeu, x0, y0, x1, y1, couleur) {
  jeu.appeler(basseResolution(jeu) ? LIGNE_BASSE : LIGNE_HAUTE, x0, y0, x1, y1, couleur & 0xFF, 0);
}
function tracer(jeu, x, y, entree) {
  jeu.appeler(basseResolution(jeu) ? TRACER_BASSE : TRACER_HAUTE, x, y, entree);
}
// La largeur d'un signe dans la police de l'interface : l'octet +4 de son image.
function largeurDuSigne(jeu, code) {
  const image = octet(jeu, (CARACTERES + (code & 0xFF)) | 0);
  return octet(jeu, (long(jeu, BANQUE_POLICE) + Math.imul(image, 6) + 4) | 0);
}

// =================================================================================================
// LE CLAVIER D'UN CHAMP DE SAISIE
// =================================================================================================

// 0x3B496 — une touche dans le champ actif.
//
// `tampon` est la chaîne qu'on modifie ; le champ actif est 0xB14D8, et 0xB7864[champ] la position
// du curseur dedans. Une position de 0xFF veut dire « pas encore placée » : elle est alors portée à
// la fin du texte, ce qui fait qu'un champ qu'on vient d'ouvrir s'édite par la fin.
//
// Le résultat n'est que l'octet bas d'eax — 1 : la saisie est validée (Entrée, ou la flèche du bas,
// qui passe au champ suivant chez d'autres appelants) ; −1 : la flèche du haut ; 0 : rien de plus à
// faire. Le reste du registre garde des restes de calcul qu'aucun des deux appelants ne lit : la
// réécriture ne déclare donc pas `retour`, qui ferait comparer eax entier.
//
// Les signes acceptés : les lettres (classe 0xC0), les chiffres (classe 0x20) et l'espace, jusqu'à
// seize signes. La table des classes est celle de la bibliothèque C, indexée par le code du signe
// **plus un** — l'entrée 0 y sert à la fin de fichier.
//
// Calcul mort, non transcrit : la fonction commence par calculer l'adresse des comptes du joueur
// courant (0xD443C + 0x6C2 × 0xD665C) dans une variable locale qu'elle ne relit jamais.
export function toucheDeLaSaisie(jeu, tampon) {
  const champ = octetSigne(jeu, CHAMP_ACTIF);
  const curseur = () => octetSigne(jeu, (CURSEURS + champ) | 0);
  const poserCurseur = (v) => poserOctet(jeu, (CURSEURS + champ) | 0, v);
  const longueur = jeu.appeler(LONGUEUR, tampon) & 0xFF;
  if (curseur() === -1) poserCurseur(longueur);

  // Effacer le signe qui suit `depuis` : tout le reste du texte remonte d'un cran.
  const effacerDepuis = (depuis) => {
    let p = depuis;
    while (octet(jeu, p) !== 0) { poserOctet(jeu, p, octet(jeu, (p + 1) | 0)); p = (p + 1) | 0; }
  };

  switch (octet(jeu, TOUCHE)) {
    case 0x0E:   // retour arrière : le signe d'avant le curseur
      if (curseur() > 0) {
        effacerDepuis((tampon + curseur() - 1) | 0);
        poserCurseur(curseur() - 1);
      }
      return 0;
    case 0x1C:   // Entrée : la saisie est finie, plus aucun champ n'est actif
      poserOctet(jeu, CHAMP_ACTIF, 0xFF);
      return 1;
    case 0x47: poserCurseur(0); return 0;              // Origine
    case 0x48: return 0xFF;                            // flèche du haut
    case 0x4B: if (curseur() !== 0) poserCurseur(curseur() - 1); return 0;   // flèche gauche
    case 0x4D: if (curseur() < longueur) poserCurseur(curseur() + 1); return 0;  // flèche droite
    case 0x4F: poserCurseur(longueur); return 0;       // Fin
    case 0x50: return 1;                               // flèche du bas
    case 0x53:                                         // Suppr : le signe sous le curseur
      if (curseur() < longueur) effacerDepuis((tampon + curseur()) | 0);
      return 0;
    default: break;
  }

  // Un signe à insérer. Le curseur ne peut plus valoir −1 ici (il vient d'être placé), mais le
  // programme le vérifie quand même.
  if (curseur() === -1) return 0;
  const signe = octet(jeu, SIGNE);
  const classe = octet(jeu, (CLASSES + ((signe + 1) & 0xFF)) | 0);
  if (!((classe & 0xC0) !== 0 || (classe & 0x20) !== 0 || signe === 0x20)) return 0;
  if (longueur >= 0x10) return 0;
  // Décaler vers la droite depuis la fin jusqu'au curseur, puis poser le signe.
  let p = (tampon + longueur) | 0;
  while (((tampon + curseur()) | 0) >>> 0 <= p >>> 0) {
    poserOctet(jeu, (p + 1) | 0, octet(jeu, p));
    p = (p - 1) | 0;
  }
  poserOctet(jeu, (p + 1) | 0, signe);
  poserCurseur(curseur() + 1);
  return 0;
}

// =================================================================================================
// LE DESSIN D'UN CHAMP DE SAISIE
// =================================================================================================

// 0x3DA5E — écrire le texte d'un champ dans son rectangle, avec son curseur.
//
// `rect` désigne quatre mots, aux décalages **+1, +3, +5 et +7** : x0, y0, x1, y1 — le décalage
// impair vient de ce que les appelants rangent ce rectangle dans une variable locale à la suite
// d'un octet. `champ` est le numéro du champ ; son curseur est 0xB7864[champ], et il n'est tracé
// que si ce champ est le champ actif (0xB14D8).
//
// Le texte est d'abord recopié dans un tampon de 64 octets, en mesurant sa largeur **jusqu'au
// curseur**. Si elle tient dans le rectangle, le texte est écrit de gauche à droite depuis x0 + 4,
// et coupé au bord droit. Sinon le texte défile : il est écrit de droite à gauche depuis x1, en
// partant du signe sous le curseur — celui-ci reste donc visible, collé au bord droit, et le début
// du texte sort par la gauche.
//
// Un signe occupe sa largeur plus deux pixels, l'espace huit. Le curseur est un rectangle plein de
// la couleur 0x33, large comme le signe qu'il couvre (six pour un espace ou la fin du texte, deux
// pour un signe sans image) et haut de la hauteur du rectangle moins six.
//
// Anomalie, sans effet : dans la branche qui défile, la largeur du curseur est calculée une
// première fois sur le signe `[ebp-8]`, qui n'a pas encore été écrit. La première tournée de la
// boucle la recalcule sur le vrai signe dès que le champ est actif, et sans champ actif le curseur
// n'est pas tracé : la valeur laissée par l'appel précédent ne se voit jamais. La réécriture ne la
// transcrit pas.
//
// Anomalie, non atteinte : le tampon fait 64 octets et l'indice qui le parcourt est un octet signé.
// Un texte de plus de 64 signes écrirait au-delà, et de plus de 127 signes sous le tampon. Les
// appelants n'en passent jamais d'aussi longs (seize signes au plus pour la saisie modale).
export function dessinerUnChampDeSaisie(jeu, rect, champ, texte) {
  const x0 = motSigne(jeu, (rect + 1) | 0);
  const y0 = motSigne(jeu, (rect + 3) | 0);
  const x1 = motSigne(jeu, (rect + 5) | 0);
  const y1 = motSigne(jeu, (rect + 7) | 0);
  const positionDuCurseur = () => octetSigne(jeu, (CURSEURS + (champ & 0xFF)) | 0);
  const champActif = () => octetSigne(jeu, CHAMP_ACTIF) === (champ & 0xFF);

  // Recopier le texte et mesurer ce qui précède le curseur.
  const tampon = [];
  let largeurAvantLeCurseur = 0;
  let n = 0;
  for (let p = texte; octet(jeu, p) !== 0; p = (p + 1) | 0) {
    const c = octet(jeu, p);
    tampon[s8(n)] = c;
    if (s8(n) <= positionDuCurseur()) {
      const avance = c === 0x20 ? 8 : largeurDuSigne(jeu, c) + 2;
      largeurAvantLeCurseur = u16(largeurAvantLeCurseur) + avance;
    }
    n = (n + 1) & 0xFF;
  }
  tampon[s8(n)] = 0;
  // Un curseur non placé : le texte est écrit depuis le début, quelle que soit sa longueur.
  if (positionDuCurseur() === -1) largeurAvantLeCurseur = 0;

  const signeDuTampon = (k) => tampon[k] === undefined ? 0 : tampon[k];
  // La largeur du curseur sous un signe donné : celle de son image, six pour un espace ou la fin
  // du texte, deux pour un signe dont l'image est vide.
  const largeurDuCurseur = (c) => {
    if (c === 0x20 || c === 0) return 6;
    const l = largeurDuSigne(jeu, c);
    return s16(l) === 0 ? 2 : l;
  };

  // Le tampon d'un signe et de son zéro final, que 0x3F49E lit comme une chaîne.
  const unSigne = variablesLocales(jeu, 4);
  poserOctet(jeu, (unSigne + 1) | 0, 0);
  const ecrireUnSigne = (x, c) => {
    poserOctet(jeu, unSigne, c);
    jeu.appeler(ECRIRE_TEXTE, s16(x), s16(y0 + 4), unSigne, 0, octet(jeu, NOIR));
  };

  let x, curseurX = 0, curseurLargeur = 0;
  if (u16(largeurAvantLeCurseur) < x1 - x0 - 4) {
    // De gauche à droite, jusqu'au bord droit ou à la fin du texte.
    x = s16(u16(x0) + 4);
    for (let k = 0; s16(x) < x1 && signeDuTampon(s8(k)) !== 0; k = (k + 1) & 0xFF) {
      const c = signeDuTampon(s8(k));
      ecrireUnSigne(x, c);
      if (s8(k) === positionDuCurseur() && champActif()) {
        curseurX = x;
        curseurLargeur = largeurDuCurseur(c);
      }
      x = s16(x) + (c === 0x20 || c === 0 ? 8 : largeurDuSigne(jeu, c) + 2);
    }
  } else {
    // De droite à gauche depuis le bord droit, en partant du signe sous le curseur.
    x = u16(x1);
    curseurX = x;
    for (let k = positionDuCurseur(); s16(x) > x0 && s8(k) >= 0; k = (k - 1) & 0xFF) {
      const c = signeDuTampon(s8(k));
      x = s16(x) - (c === 0x20 || c === 0 ? 8 : largeurDuSigne(jeu, c) + 2);
      ecrireUnSigne(x, c);
      if (s8(k) === positionDuCurseur() && champActif()) {
        curseurX = x;
        curseurLargeur = largeurDuCurseur(c);
      }
    }
  }

  if (!champActif()) return;
  // Un curseur qui n'a pas été placé — le texte est vide, ou le curseur est hors de la partie
  // visible — se met là où le tracé s'est arrêté.
  if (s16(curseurX) === 0) { curseurX = x; curseurLargeur = 6; }
  jeu.appeler(RECTANGLE_PLEIN, s16(curseurX), s16(y0 + 4), s16(curseurLargeur),
    s16(u16(y1 - y0) - 6), 0x33);
}

// =================================================================================================
// LA SAISIE MODALE D'UN NOM
// =================================================================================================

// 0x793B1 — une image de la boîte de saisie d'un nom.
//
// La boîte occupe le tiers central de l'écran : un panneau en saillie de 160 à 480, du tiers de la
// hauteur au deux tiers. Elle porte le texte de la question, le champ de saisie dans un cadre en
// creux, et deux boutons en bas — valider à gauche, annuler à droite.
//
// L'appelant la rappelle à chaque image tant qu'elle rend 0 ; 1 veut dire validé, −1 annulé. Les
// deux appelants : l'écran titre 0x1A836, pour le prénom du joueur, et 0x3854C, pour le nom d'une
// fiche (le métier d'un employé, le genre d'une boutique ou d'une attraction — § 11.2 : le nom
// validé va dans le catalogue, si bien que tous ceux du même genre changent de nom d'un coup).
//
// LE NOM DU JOUEUR est reconnu à ce que la question est le texte [[0xD7BC0]+0x18C]. Il sert de nom
// de fichier de sauvegarde : il est coupé à huit signes (le neuvième octet du tampon est mis à
// zéro à chaque image), et ni l'espace ni la tabulation n'y entrent. Passé huit signes, plus rien
// ne s'y ajoute — mais les touches d'édition continuent d'agir.
export function saisirUnNom(jeu, texte, tampon) {
  jeu.appeler(OUVRIR_ECRAN_PLEIN);
  const couleurDuTexte = jeu.appeler(COULEUR_LA_PLUS_PROCHE, long(jeu, PALETTE), 0x21, 0x21, 0x21) & 0xFF;

  const hauteur = (jeu.m8[MODE] & 1) !== 0 ? 400 : 480;
  const tiers = idiv(hauteur, 3);
  const bas = hauteur - tiers;
  jeu.appeler(PANNEAU_SAILLANT, 0xA0, s16(tiers), 0x1E0, s16(bas));
  if (texte !== 0) {
    jeu.appeler(ECRIRE_CENTRE, 0xB0, 0x1D0, s16(tiers + 0x10), texte, 0, couleurDuTexte);
  }

  // Le cadre du champ, en creux : clair en bas et à droite, sombre en haut et à gauche. Son
  // rectangle sert ensuite à 0x3DA5E, aux décalages +1 à +7 d'un petit bloc de mémoire.
  const champX0 = 0xB0;
  const champY0 = u16(tiers + 0x30);
  const champX1 = 0x1D0;
  const champY1 = u16(octet(jeu, HAUTEUR_DE_LIGNE) + champY0 + 4);
  jeu.appeler(CADRE_BISEAUTE, champX0, u16(champY0 - 2), champX1, u16(champY1 + 2),
    octet(jeu, JAUNE), octet(jeu, BRUN));

  poserOctet(jeu, CHAMP_ACTIF, 7);

  const nomDuJoueur = texte === long(jeu, (long(jeu, TEXTES_DE_L_ECRAN) + 0x18C) | 0);
  if (nomDuJoueur) poserOctet(jeu, (tampon + 8) | 0, 0);

  const signe = octet(jeu, SIGNE);
  const imprimable = (octet(jeu, (CLASSES + ((signe + 1) & 0xFF)) | 0) & 0xE0) !== 0;
  const espaceOuTabulation = signe === 0x20 || signe === 9;
  const touche = octet(jeu, TOUCHE) !== 0;
  let accepte;
  if (nomDuJoueur && (jeu.appeler(LONGUEUR, tampon) >>> 0) > 7
    && (imprimable || espaceOuTabulation) && touche) accepte = 0;
  else if (nomDuJoueur && espaceOuTabulation && touche) accepte = 0;
  else accepte = jeu.appeler(0x3B496, tampon) & 0xFF;

  // Le rectangle du champ, en mémoire, pour 0x3DA5E. Le champ relu est 0xB14D8 : la touche Entrée
  // vient peut-être de le porter à 0xFF, et le curseur n'est alors plus tracé.
  const rect = variablesLocales(jeu, 12);
  poserMot(jeu, (rect + 1) | 0, champX0);
  poserMot(jeu, (rect + 3) | 0, champY0);
  poserMot(jeu, (rect + 5) | 0, champX1);
  poserMot(jeu, (rect + 7) | 0, champY1);
  jeu.appeler(0x3DA5E, rect, octet(jeu, CHAMP_ACTIF), tampon);

  const banque = long(jeu, BANQUE_INTERFACE);
  // Les dimensions du bouton de gauche, images 185 et 187 de la banque de l'interface (entrées de
  // six octets : +4 la largeur, +5 la hauteur). ANOMALIE REPRODUITE : les deux tests de survol
  // emploient la largeur et la hauteur de l'image 185, y compris pour le bouton de droite, qui est
  // pourtant dessiné aux dimensions de l'image 187.
  const largeurDuBouton = octet(jeu, (banque + 0x45A) | 0);
  const hauteurDuBouton = octet(jeu, (banque + 0x45B) | 0);
  const survole = (x, y) => mot(jeu, GAUCHE_TENU) !== 0
    && motSigne(jeu, SOURIS_X) > u16(x) && motSigne(jeu, SOURIS_X) < u16(x) + largeurDuBouton
    && motSigne(jeu, SOURIS_Y) > u16(y) && motSigne(jeu, SOURIS_Y) < u16(y) + 2 * hauteurDuBouton;

  // La boîte se referme : un bruitage, la carte à redessiner, les quatre mots de la souris remis à
  // zéro pour que le clic ne soit pas repris par l'écran d'en dessous, et l'écran plein rendu.
  const refermer = () => {
    jeu.appeler(BRUITAGE, 0, 0x1A);
    poserMot(jeu, REDESSINER_CARTE, 1);
    poserMot(jeu, DROIT_APPUI, 0);
    poserMot(jeu, GAUCHE_APPUI, 0);
    poserMot(jeu, DROIT_TENU, 0);
    poserMot(jeu, GAUCHE_TENU, 0);
    jeu.appeler(FERMER_ECRAN_PLEIN);
  };

  // Le bouton de gauche : valider. La touche Entrée (accepte == 1) vaut un clic dessus.
  const valideY = u16(bas + 0x10 - 2 * hauteurDuBouton);
  const valideX = 0xB0;
  tracer(jeu, s16(valideX), s16(valideY), (banque + 0x456) | 0);
  if (survole(valideX, valideY) || accepte === 1) { refermer(); return 1; }

  // Le bouton de droite : annuler.
  const annuleY = u16(bas + 0x10 - 2 * octet(jeu, (banque + 0x467) | 0));
  const annuleX = u16(0x1D0 - octet(jeu, (banque + 0x466) | 0));
  tracer(jeu, s16(annuleX), s16(annuleY), (banque + 0x462) | 0);
  if (survole(annuleX, annuleY)) { refermer(); return -1; }

  jeu.appeler(FERMER_ECRAN_PLEIN);
  return 0;
}

// =================================================================================================
// LES JAUGES
// =================================================================================================

// 0x3DE18 — le fond des barres de jauges.
//
// Un aplat de la teinte de fond, puis deux traits en haut (sombre puis un peu moins) et deux en bas
// (clair puis un peu moins) : une rainure horizontale, sans bord vertical. C'est l'ordre 0x12 d'une
// fenêtre — les deux panneaux de jauges de la barre d'outils du parc (§ 6.7, zones 12 et 13).
// Comme les autres cadres de l'interface, chaque trait dépasse d'une épaisseur à droite.
//
// Cette fonction appartient à moteur/jeu/fenetres.js, avec 0x3E149, 0x3E0D4 et les autres panneaux :
// elle n'est ici qu'en attendant qu'on l'y déplace.
export function panneauDeJauges(jeu, x0, y0, x1, y1) {
  const e = octet(jeu, EPAISSEUR);
  jeu.appeler(RECTANGLE_PLEIN, s16(x0), s16(y0), s16(e + (x1 - x0)), s16(e + (y1 - y0)), teinte(jeu, 0));
  ligne(jeu, s16(x0), s16(y0), s16(e + x1), s16(y0), teinte(jeu, 3));
  ligne(jeu, s16(x0), s16(e + y0), s16(e + x1), s16(e + y0), teinte(jeu, 4));
  ligne(jeu, s16(x0), s16(y1), s16(e + x1), s16(y1), teinte(jeu, 1));
  ligne(jeu, s16(x0), s16(y1 - e), s16(e + x1), s16(y1 - e), teinte(jeu, 2));
}

// 0x7B3F6 — la jauge de stock d'une marchandise, dans la fiche d'une boutique (0x4E359).
//
// `fiche` est une fiche de marchandise, 0xD3C00 + 14 × numéro : +4 le stock, +6 la quantité
// commandée, +0xA le délai de livraison en pas de simulation, +0xC les pas écoulés. Le rôle du mot
// +8 n'est pas établi : quand il n'est pas nul, c'est lui qui est comparé au stock à la place de la
// commande, et le dépassement se peint en rouge sombre plutôt qu'en rouge clair.
//
// La barre du haut va de 0 à la capacité de l'entrepôt ([[0xD3818]+0x4B], que la recherche fait
// croître). Elle montre deux longueurs bout à bout : la plus petite des deux quantités en orange,
// puis la différence — en vert quand c'est du stock en plus, en rouge quand c'est une commande qui
// n'est pas encore arrivée.
//
// La barre du bas, haute de `hauteur2`, n'apparaît que pendant une livraison : elle avance de
// +0xC / +0xA.
//
// Les pourcentages passent par des entiers : `quantité × 100 / capacité × largeur / 100`. Les deux
// divisions de la première branche et celle du dépassement sont non signées, les autres signées ;
// toutes les quantités étant des mots non signés, cela ne change rien. Une capacité nulle
// diviserait par zéro : le jeu n'en produit pas.
export function jaugeDeStock(jeu, fiche, x, y, largeur, hauteur, hauteur2) {
  const commande = mot(jeu, (fiche + 8) | 0);
  const valeur = commande !== 0 ? commande : mot(jeu, (fiche + 6) | 0);
  const couleurDuDepassement = commande !== 0 ? octet(jeu, ROUGE_SOMBRE) : octet(jeu, ROUGE_CLAIR);
  const stock = mot(jeu, (fiche + 4) | 0);
  const capacite = mot(jeu, (long(jeu, FICHE_DU_PARC) + 0x4B) | 0);

  jeu.appeler(RECTANGLE_PLEIN, s16(x), s16(y), s16(largeur), s16(hauteur), octet(jeu, NOIR));

  // Une longueur en pixels, en passant par un pourcentage entier de la capacité.
  const partNonSignee = (quantite) => div(Math.imul(div(Math.imul(quantite, 100), capacite), u16(largeur)) >>> 0, 100);
  const partSignee = (quantite) => idiv(Math.imul(idiv(Math.imul(quantite, 100), capacite), u16(largeur)), 100);

  if (stock > valeur) {
    const commun = partNonSignee(valeur);
    if (commun !== 0) {
      jeu.appeler(RECTANGLE_PLEIN, s16(x), s16(y), s16(commun), s16(hauteur), octet(jeu, ORANGE));
    }
    const enPlus = partNonSignee(stock - valeur);
    if (enPlus !== 0) {
      jeu.appeler(RECTANGLE_PLEIN, s16(x + commun), s16(y), s16(enPlus), s16(hauteur), octet(jeu, VERT));
    }
  } else if (valeur !== 0) {
    const commun = partSignee(stock);
    if (commun !== 0) {
      jeu.appeler(RECTANGLE_PLEIN, s16(x), s16(y), s16(commun), s16(hauteur), octet(jeu, ORANGE));
    }
    const manquant = partNonSignee(valeur - stock);
    if (manquant !== 0) {
      jeu.appeler(RECTANGLE_PLEIN, s16(x + commun), s16(y), s16(manquant), s16(hauteur), couleurDuDepassement);
    }
  }

  const delai = mot(jeu, (fiche + 0xA) | 0);
  if (delai === 0) return;
  jeu.appeler(RECTANGLE_PLEIN, s16(x), s16(y + hauteur), s16(largeur), s16(hauteur2),
    octet(jeu, ROUGE_SOMBRE));
  const avance = idiv(Math.imul(idiv(Math.imul(mot(jeu, (fiche + 0xC) | 0), 100), delai), u16(largeur)), 100);
  if (avance !== 0) {
    jeu.appeler(RECTANGLE_PLEIN, s16(x), s16(y + hauteur), s16(avance), s16(hauteur2), octet(jeu, ROUGE));
  }
}

// =================================================================================================
// LA CONFIGURATION DU SON
// =================================================================================================
//
// Le programme d'installation écrit un fichier `sndsetup.inf` de deux lignes :
//     BF_SOUND = <carte> <port> <irq> <dma>
//     BF_MUSIC = <carte> <port>
// Les deux fonctions le relisent chacune de leur côté — 0x5FAB0 prend la première ligne, 0x5F7D4
// lit la première pour la jeter et garde la seconde —, puis laissent une variable d'environnement
// du même nom le remplacer. Une carte nommée « none », ou un fichier absent, éteint la partie
// correspondante. L'hôte se sert de ces variables plutôt que du fichier (moteur/hote/son.js).
//
// L'octet 0xB0B69, qui vaut 1 dans le fichier, dit que sndsetup.inf est cherché dans le dossier
// courant ; à zéro, il serait cherché dans le dossier d'installation (0xD3BDE).

// Ouvrir sndsetup.inf, comme le font les deux fonctions, et rendre le FILE*.
function ouvrirLaConfigurationDuSon(jeu, tampon, nomDuFichier, barre, modeLecture) {
  if (octet(jeu, SANS_CHEMIN) !== 0) return jeu.appeler(OUVRIR_FICHIER, nomDuFichier, modeLecture);
  jeu.appeler(COPIER_CHAINE, tampon, CHEMIN_D_INSTALLATION);
  jeu.appeler(AJOUTER_CHAINE, tampon, barre);
  jeu.appeler(AJOUTER_CHAINE, tampon, nomDuFichier);
  return jeu.appeler(OUVRIR_FICHIER, tampon, modeLecture);
}

// Recopier « none\0 » (cinq octets, un `movsd` et un `movsb`) dans les deux noms de carte.
function aucuneCarte(jeu, source, ...destinations) {
  for (const d of destinations) for (let k = 0; k < 5; k++) poserOctet(jeu, (d + k) | 0, octet(jeu, (source + k) | 0));
}

// 0x5F7D4 — la carte de musique.
//
// Le nom de la carte va en 0xD7914 et son port en 0xD7910 ; 0xBA714 et 0xBA715 disent qu'il y a
// une musique. Les noms reconnus mènent à l'un de quatre pilotes : 0xA002 pour toutes les cartes à
// puce FM, 0xA004 pour une Roland, 0xA008 pour une Sound Blaster AWE32, 0xA001 pour un appareil
// General MIDI ou un Wave Blaster. Un nom inconnu ne pose aucun pilote — et la musique reste
// pourtant demandée, par 0xBA714 : anomalie reproduite.
export function lireLaCarteDeMusique(jeu) {
  const locales = variablesLocales(jeu, 0x100);
  const tampon = locales;                  // [ebp-0x100] : le chemin du fichier
  const rebut = (locales + 0x90) | 0;      // [ebp-0x70] : le nom de ligne, qu'on jette
  const nombre = (locales + 0xFC) | 0;     // [ebp-4] : les nombres de la première ligne, jetés aussi
  const NOM = 0xD7914, PORT = 0xD7910;
  const MUSIQUE_DEMANDEE = 0xBA714;

  const fichier = ouvrirLaConfigurationDuSon(jeu, tampon, 0xB03E2, 0xB03E0, 0xB03EF);
  if (fichier === 0) {
    jeu.appeler(MESSAGE, 0xB03F1);         // « Warning - No sound drivers defined… »
    aucuneCarte(jeu, 0xB042F, NOM, 0xD7AD8);
  } else {
    // La première ligne est celle des bruitages : on la lit pour l'écarter.
    jeu.appeler(LIRE_FORMATE, fichier, 0xB0434, rebut, rebut, nombre, nombre, nombre);
    jeu.appeler(LIRE_FORMATE, fichier, 0xB0445, rebut, NOM, PORT);
    jeu.appeler(FERMER_FICHIER, fichier);
  }

  const variable = jeu.appeler(VARIABLE_D_ENVIRONNEMENT, 0xB0450);   // « BF_MUSIC »
  if (variable !== 0) jeu.appeler(LIRE_CHAINE_FORMATEE, variable, 0xB0459, NOM, PORT);

  const memeNom = (adresse) => jeu.appeler(COMPARER_SANS_CASSE, NOM, adresse) === 0;
  if (memeNom(0xB042F)) { poserOctet(jeu, MUSIQUE_DEMANDEE, 0); poserOctet(jeu, MUSIQUE_DEMANDEE + 1, 0); }
  if (octet(jeu, MUSIQUE_DEMANDEE) === 0) return;

  if (memeNom(0xB045F) || memeNom(0xB0465) || memeNom(0xB046C) || memeNom(0xB0472)
    || memeNom(0xB0479) || memeNom(0xB0480) || memeNom(0xB0487) || memeNom(0xB048D)) {
    // ADLIB, SBLAST, SBPRO, ADLIBG, SB16FM, GRAVIS, PASFM, COMPATIBLE
    jeu.appeler(POSER_LE_PILOTE_DE_MUSIQUE, 0xA002);
  } else if (memeNom(0xB0498)) {           // ROLAND
    jeu.appeler(POSER_LE_PILOTE_DE_MUSIQUE, 0xA004);
  } else if (memeNom(0xB049F)) {           // SBAWE32
    jeu.appeler(POSER_LE_PILOTE_DE_MUSIQUE, 0xA008);
  } else if (memeNom(0xB04A7) || memeNom(0xB04AF)) {   // GENERAL, WBLAST
    jeu.appeler(POSER_LE_PILOTE_DE_MUSIQUE, 0xA001);
  }
}

// 0x5FAB0 — la carte des bruitages.
//
// Même lecture, sur la première ligne du fichier : le nom de la carte va en 0xD7AD8, son port en
// 0xD7B64, son interruption en 0xD7B4C et son canal en 0xD7A68 ; 0xBA720 et 0xBA721 disent qu'il y
// a du son numérique, et 0x6058B ouvre alors le pilote.
export function lireLaCarteDeBruitages(jeu) {
  const locales = variablesLocales(jeu, 0xFC);
  const tampon = locales;                  // [ebp-0xfc] : le chemin du fichier
  const rebut = (locales + 0x90) | 0;      // [ebp-0x6c] : le nom de ligne, qu'on jette
  const NOM = 0xD7AD8, PORT = 0xD7B64, INTERRUPTION = 0xD7B4C, CANAL = 0xD7A68;
  const SON_DEMANDE = 0xBA720;

  const fichier = ouvrirLaConfigurationDuSon(jeu, tampon, 0xB04BA, 0xB04B8, 0xB04C7);
  if (fichier === 0) {
    jeu.appeler(MESSAGE, 0xB04C9);         // « Warning - No sound drivers defined… »
    aucuneCarte(jeu, 0xB0507, 0xD7914, NOM);
  } else {
    jeu.appeler(LIRE_FORMATE, fichier, 0xB050C, rebut, NOM, PORT, INTERRUPTION, CANAL);
    jeu.appeler(FERMER_FICHIER, fichier);
  }

  const variable = jeu.appeler(VARIABLE_D_ENVIRONNEMENT, 0xB051D);   // « BF_SOUND »
  if (variable !== 0) {
    jeu.appeler(LIRE_CHAINE_FORMATEE, variable, 0xB0526, NOM, PORT, INTERRUPTION, CANAL);
  }

  if (jeu.appeler(COMPARER_SANS_CASSE, NOM, 0xB0507) === 0) {
    poserOctet(jeu, SON_DEMANDE, 0);
    poserOctet(jeu, SON_DEMANDE + 1, 0);
  }
  if (octet(jeu, SON_DEMANDE) !== 0) jeu.appeler(OUVRIR_LE_SON_NUMERIQUE);
}

// =================================================================================================

export const reecritures = [
  { adresse: 0x793B1, nom: 'saisirUnNom', fn: saisirUnNom, arguments: 2, retour: true },
  { adresse: 0x3DA5E, nom: 'dessinerUnChampDeSaisie', fn: dessinerUnChampDeSaisie, arguments: 3 },
  // Le résultat n'est rendu que dans al ; l'original laisse les trois octets hauts d'eax tels que
  // ses calculs les ont faits, et ses deux appelants ne lisent que l'octet bas. On ne compare
  // donc pas eax.
  { adresse: 0x3B496, nom: 'toucheDeLaSaisie', fn: toucheDeLaSaisie, arguments: 1 },
  { adresse: 0x3DE18, nom: 'panneauDeJauges', fn: panneauDeJauges, arguments: 4 },
  { adresse: 0x7B3F6, nom: 'jaugeDeStock', fn: jaugeDeStock, arguments: 6 },
  { adresse: 0x5F7D4, nom: 'lireLaCarteDeMusique', fn: lireLaCarteDeMusique, arguments: 0 },
  { adresse: 0x5FAB0, nom: 'lireLaCarteDeBruitages', fn: lireLaCarteDeBruitages, arguments: 0 },
];

export const enAttente = [];
