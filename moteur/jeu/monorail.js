// Le monorail, et les explosions des attractions usées.
//
// Réécriture lisible de 0x43BAA, 0x44208, 0x44439, 0x447E3, 0x448BA, 0x449FF, 0x44BB8 (le monorail ;
// le bouton qui l'annonce au catalogue, 0x407FD, est dans ecrans-gestion.js, la montée dans un wagon,
// 0x30C65, dans attractions.js), et de 0x664F1, 0x665AE, 0x6662D, 0x66976, 0x66AFD, 0x66BA0 (les
// explosions, et la musique qui se désaccorde). Voir docs/guide-reecriture.md.
//
// LE MONORAIL. MONORAIL est le seul genre du catalogue (fiche +0x22 : 0xDB) dont la voie est du genre
// 3 (fiche +0xB4). Il a plusieurs gares : des attractions de type 4 à l'état 6, chaînées par leur mot
// +0xC2 (la suivante) à partir de la première, que chacune désigne par son mot +0xC0 ; l'octet +0xC4
// de chaque gare garde le nombre de courbes (compté par 0xB8FD0) parcourues pour l'atteindre. Les
// wagons (objets de type 0xE) roulent seuls sur la voie à l'état 0x22 (0x43BAA), tournent aux
// courbes, poussent le wagon arrêté devant eux, s'arrêtent à la gare suivante (état 8) et y donnent
// la fin du tour (phase 4) ; la gare (0x44208, sa routine de mode 6, appelée par 0x41F3D) fait
// descendre le premier passager puis monter la tête de file (0x30C65). Un wagon qui ne trouve plus de
// rail tombe (état 0x20, 0x43A33) et projette son passager (0x66189).
//
// Le joueur ouvre le monorail par la fiche de l'attraction (0x15FBD, construire.js) : 0x44439 suit la
// voie dans les deux sens depuis la gare, relève les gares rencontrées, et rend le prix des morceaux
// neufs (négatif si la voie ne boucle pas) ; 0x447E3 le fait payer et ouvre chaque gare en y posant
// ses wagons (0x41936) ; 0x448BA ferme toutes les gares, fait descendre les passagers et ôte les
// wagons.
//
// LES EXPLOSIONS. Une attraction usée au-delà du double de son seuil explose au départ suivant
// (0x31ED3 appelle 0x6662D). Le rang du genre (fiche +0xC4) décide de la suite : PLANE FLYER (rang 3)
// s'envole d'abord (mode 0x26, 0x66AFD : ses avions montent pendant 200 pas) puis explose pour de bon ;
// BOUNCY CASTLE (rang 0xE) s'envole en grossissant (mode 0x24, 0x66976), et à la retombée jonche son
// emprise de débris ; les autres sont démolies tout de suite (0x31748) et laissent des débris (sol
// 0x28, un quart des cases de l'emprise, au hasard) et un nuage (objet de type 2 à l'état 0x48 :
// 0x664F1 le crée, 0x665AE l'anime). Les passagers sont projetés hors de l'attraction (0x66189). Le
// parc compte une attraction retirée de plus (fiche du parc +0x9F, que la note de fin d'année pénalise).
//
// LA MUSIQUE DÉSACCORDÉE. 0x66BA0, appelée par le dessin de la carte (0x1B837) quand l'attraction qui
// a la musique est usée, fait osciller la hauteur des notes des canaux 1 à 3 (messages MIDI 0xE1 à
// 0xE3) : 0x66D18 (dessin-attractions.js) la remet au centre.
//
// LES RESTES DE PILE. 0x43BAA, 0x665AE, 0x66976 et 0x66AFD sont des routines d'objets, appelées par la
// mise à jour des objets du parc (0x21681) : elles laissent, 24 octets sous leur entrée, l'octet que
// laissait l'original (index.js, `resteRelu`) — sa variable [ebp-8], ou l'argument qu'il empilait pour
// son dernier appel, ou l'adresse de retour de celui-ci. Voir `laisserSousLEntree`.
//
// VÉRIFICATION : voir la liste `reecritures`, en fin de fichier.

// --- arithmétique de 1994 ----------------------------------------------------------------------
const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;
const u16 = (v) => v & 0xFFFF;
function idiv(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) / (b | 0)) | 0;
}
function imod(a, b) {
  if ((b | 0) === 0) throw new Error('division par zero');
  return ((a | 0) % (b | 0)) | 0;
}

const octet = (jeu, a) => jeu.m8[a >>> 0];
const octetSigne = (jeu, a) => s8(jeu.m8[a >>> 0]);
const mot = (jeu, a) => jeu.dv.getUint16(a >>> 0, true);
const motSigne = (jeu, a) => jeu.dv.getInt16(a >>> 0, true);
const motLong = (jeu, a) => jeu.dv.getUint32(a >>> 0, true);
const poserOctet = (jeu, a, v) => { jeu.m8[a >>> 0] = v & 0xFF; };
const poserMot = (jeu, a, v) => jeu.dv.setUint16(a >>> 0, v & 0xFFFF, true);
const poserMotLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

// --- les variables du jeu ----------------------------------------------------------------------
const OBJETS_DU_PARC = 0xD3B10;        // pointeur : la table des objets, 200 octets chacun ; l'objet 0
                                       // ne sert que de sentinelle
const FIN_DES_OBJETS_DU_PARC = 0xD3B78; // pointeur : la fin de la table
const TAILLE_OBJET = 200;
const CARTE = 0xD3B08;                 // pointeur : 64 x 64 cases de 4 octets ; +2 le sol, +3 des drapeaux
const COLONNES = 64;
const OBJETS_GRAPHIQUES = 0xD3B80;     // pointeur : 8 octets par objet graphique ; +6 l'image suivante
const FIGURES = 0xD3B38;               // pointeur : table de mots, numéro de figure → objet graphique
const CATALOGUE = 0xCCED0;             // les fiches des genres d'attractions, 200 octets chacune
const FICHE_DU_JOUEUR = 0xD3808;       // pointeur ; +0xE la somme engagée
const FICHE_DU_PARC = 0xD3818;         // pointeur ; +0x9F le nombre d'attractions retirées
const PAS_DE_SIMULATION = 0xD3AFC;     // mot long, 1 000 par mois
const PASSAGES = 0xD3AF8;              // octet : le compte des passages de la mise à jour
const SOURIS_X = 0xBECAC;              // mot : l'abscisse du pointeur
const PROPRIETES_DES_SOLS = 0xB44D9;   // 4 octets par image de sol ; bit 2 du premier : sol d'attraction
const VOISINES = 0xB4920;              // mot signé par direction (0 à 3) : le pas vers la case voisine
const DIRECTIONS_OPPOSEES = 0xB48EC;   // mot par direction
const IMAGES_DES_PASSAGERS = 0xB4A0A;  // 0x24 octets par sorte de visiteur (+0x59) : le premier mot,
                                       // l'image d'un passager assis (non établi au-delà)

// Les rails (objets de type 0x12) et leur parcours (construire.js, 0x43689).
const SORTIES_DES_RAILS = 0xB7AEA;     // 2 octets par forme : les deux directions de sortie (bits)
const RETOUR_DES_RAILS = 0xB7B18;      // octet par direction : le bit de retour
const OUVERTURES_DES_RAILS = 0xB7B21;  // octet par forme : les directions ouvertes
const PAS_D_UN_MASQUE = 0xB4B2A;       // mot signé par masque d'une seule direction
const PRIX_PAR_HAUTEUR = 0xB5302;      // mot par hauteur (le « plaisir » de construire.js)
const COURBES_D_UNE_FORME = 0xB8FD0;   // mot par forme : ce que compte une courbe (formes 1 à 4)
const RIEN_DU_TOUT = 0xC4653601 | 0;   // rendu faute de rail contre la gare

// Les décalages des rails à effacer autour d'une gare qui explose : 29 octets par direction (sic),
// quatre octets par morceau, la colonne en +0 et la rangée en +2 (mots signés).
const RAILS_DE_LA_GARE = 0xB7A47;

// Le son.
const MUSIQUE_INITIALISEE = 0xBA714;   // octet
const MUSIQUE_PERMISE = 0xBA715;       // octet : la musique allumée, que bascule MUSIQUE (§ 11.10)
const MORCEAU_EN_COURS = 0xBA71A;      // mot : 0 = aucun
const DESACCORD_EN_COURS = 0xBA828;    // octet : posé ici, remis à 0 par 0x66D18
const DESACCORD_A_REPRENDRE = 0xBA829; // octet : posé par 0x66D18, l'oscillation repart du centre
const MORCEAU_SOS = 0xD7984;           // mot long : le morceau pour le pilote
const MESSAGE_MIDI = 0xD7BD8;          // 3 octets
const COMPTE_DU_DESACCORD = 0xD7BE4;   // mot : les appels depuis le dernier pas d'oscillation
const PAS_DU_DESACCORD = 0xD7BE2;      // mot signé : −500 ou +500
const COURBURE = 0xD7BE6;              // mot : la courbure des notes, 0x2000 au centre, sur 14 bits
const CENTRE_DE_LA_COURBURE = 0x2000;
const PAS_DE_COURBURE = 0xFE0C;        // −500
const APPELS_PAR_PAS_DE_COURBURE = 0x32;
const COURBURE_MAX = 0x2EE0, COURBURE_MIN = 0x1F4;

// --- les champs des objets ---------------------------------------------------------------------
const TYPE = 4;                        // octet
const X = 6, Y = 8;                    // mots : la place fine, en 256es de case (octet haut : la case)
const COLONNE = 7, RANGEE = 9;         // octets : la case
const IMAGE = 0xA;                     // mot : l'objet graphique
const ETAT = 0xC;                      // octet : l'état, ou le mode d'une attraction
const VITESSE = 0xE;                   // mot signé (un wagon)
const DIRECTION = 0x12;                // octet
const GENRE = 0x16;                    // mot : décalage de la fiche dans le catalogue ; pour un wagon,
                                       // un visiteur : le numéro de son attraction

// Une attraction.
const DELAI = 0x13;                    // octet : délai d'animation
const ATTENTE_IMAGE = 0x14;            // mot signé : compte à rebours de l'image
const EN_TETE_DE_FILE = 0x1E;          // mot : numéro d'objet
const CAPACITE = 0x26;                 // mot
const FILE_2A = 0x2A;                  // mot : oublié avec la file (non établi)
const A_BORD = 0x30;                   // mot
const PHASE = 0x32;                    // mot
const DUREE = 0x34;                    // mot
const A_PAYER = 0x38;                  // mot signé : le prix de construction, en centaines
const CONSTRUITE_LE = 0x3E;            // mot long : le pas de simulation de la construction
const TRAIN = 0x45;                    // mot : numéro du wagon de tête (une gare du monorail)
const PREMIER_A_BORD = 0x47;           // mot : numéro du premier passager ; chaîne par +0x47
const OUVERTE = 0x4B;                  // octet
const ALTITUDE = 0x5F;                 // mot : le château envolé, l'effet d'explosion
const ELAN = 0x65;                     // octet signé : la vitesse de montée du château
const ENVOL = 0xB1;                    // octet : les pas depuis l'envol
const FACTUREE = 0xBF;                 // octet : le prix de la voie a été inscrit au livre
const PREMIERE_GARE = 0xC0;            // mot
const GARE_SUIVANTE = 0xC2;            // mot
const COURBES_JUSQU_ICI = 0xC4;        // octet (une gare du monorail)
const PLACE_D_ORIGINE_X = 0xE, PLACE_D_ORIGINE_Y = 0x10; // mots : le château envolé

// Un wagon.
const HAUTEUR_DE_CHUTE = 0x98;         // mot
const WAGON_SUIVANT = 0x61;            // mot : numéro du wagon suivant du train
const WAGON_A_QUAI = 8;
const WAGON_EN_ROUTE = 0x22;
const WAGON_QUI_TOMBE = 0x20;
const VITESSE_DE_DEPART = 8;
const ATTENTE_A_QUAI = 0xC8;

// Un morceau de voie.
const FORME = 0xC;                     // octet : 1 à 4 les courbes
const HAUTEUR = 0x79;                  // octet
const MORCEAU_44 = 0x44;               // octet : relevé avec la hauteur (non établi)
const HAUTEUR_PAYEE = 0xBE, MORCEAU_44_PAYE = 0xBD;

// Une fiche du catalogue.
const FICHE_ORIGINE_EMPRISE = 0x2A;    // mot : la case de référence de l'emprise
const FICHE_FIGURE = 0x22;             // mot : 0xDB pour le monorail
const FICHE_EMPRISE = 0x34;            // 0x16 mots : les cases de l'emprise, relatives
const CASES_D_EMPRISE = 0x16;
const FICHE_GENRE_DE_VOIE = 0xB4;      // octet signé : −1 sans voie
const FICHE_PRIX_D_UN_MORCEAU = 0xBA;  // mot
const FICHE_RANG = 0xC4;               // octet
const FIGURE_DU_MONORAIL = 0xDB;

// Les types d'objets.
const TYPE_LIBRE = 0, TYPE_EFFET = 2, TYPE_ATTRACTION = 4, TYPE_VEHICULE = 0xE, TYPE_RAIL = 0x12;
const GARE = 6;                        // état d'une attraction à voie
const SOL_D_ATTRACTION = 4;

// Les phases.
const A_L_ARRET = 0, AU_DEPART = 1, EN_MARCHE = 2, FIN_DU_TOUR = 4;

// Les suites d'une explosion, selon le rang du genre.
const RANG_DES_AVIONS = 3;             // PLANE FLYER
const RANG_DU_CHATEAU = 0xE;           // BOUNCY CASTLE
const AVIONS_ENVOLES = 0x26;
const CHATEAU_ENVOLE = 0x24;
const SOL_DE_DEBRIS = 0x28;
const CASE_RESERVEE = 8;               // bit de l'octet +3 d'une case
const BRUITAGE_DE_L_EXPLOSION = 0x23;
const EFFET_D_EXPLOSION = 0x48;        // l'état d'un objet de type 2
const FIGURE_DE_L_EXPLOSION = 0x24B;   // [FIGURES] + 0x496
const SENS_DU_NUAGE = 0xC4;            // octet : 0 il monte, 1 il redescend
const ATTRACTIONS_RETIREES = 0x9F;     // mot, dans la fiche du parc (concurrents.js)

// --- les fonctions appelées --------------------------------------------------------------------
const CHERCHER_SUR_LA_CASE = 0x204B9;  // (case, type) : le premier objet de ce type, ou 0
const PLACER = 0x18ADF;                // (objet, x, y) → vrai s'il a changé de case
const DEPLACER = 0x18A44;              // (objet, x, y)
const POSER_SUR_LA_CASE = 0x185C1;     // (objet, x, y)
const EFFACER_L_OBJET = 0x18B62;       // (objet)
const HASARD = 0x18B92;
const EJECTER = 0x66189;               // (sorte, visiteur, attraction ou wagon, force)
const BRUITAGE_UNIQUE = 0x80FE0;       // (propriétaire, bruitage)
const DETACHER_LA_GARE = 0x44BB8;      // (gare) : l'ôter de la chaîne des gares
const OTER_LES_TRAINS = 0x41EB4;       // (attraction)
const EFFACER_LES_RAILS = 0x2C6B8;     // (case)
const DEMOLIR_UNE_ATTRACTION = 0x31748; // (attraction)
const QUITTER_LE_PARC = 0x28752;       // (objet) : compte le départ et efface l'objet
const DEBARQUER_D_UN_VEHICULE = 0x449FF; // (passager, attraction, véhicule)
const MONTER_DANS_UN_VEHICULE = 0x30C65; // (visiteur, attraction, véhicule)
const INSCRIRE_AU_LIVRE = 0x78943;     // (catégorie, montant)
const OUVRIR_L_ATTRACTION = 0x41936;   // (fiche, attraction, wagons)
const APPELER_LE_SUIVANT = 0x32142;    // (visiteur, attraction)
const EXPLOSER = 0x6662D;
const CREER_L_EFFET_D_EXPLOSION = 0x664F1;
const ENVOYER_AU_PILOTE_MIDI = 0x87202; // (morceau, message, sélecteur, longueur)

const CATEGORIE_CONSTRUCTION = 0;      // du livre de comptes
const CATEGORIE_VOIES = 0x17;

// Le retour d'origine de l'appel de 0x28752 dans 0x665AE : il reste dans la pile (voir 0x665AE).
const RETOUR_DU_DEPART_DANS_665AE = 0x66625;

// --- outils ------------------------------------------------------------------------------------
const baseDesObjets = (jeu) => motLong(jeu, OBJETS_DU_PARC);
const objetNumero = (jeu, n) => (baseDesObjets(jeu) + (n & 0xFFFF) * TAILLE_OBJET) >>> 0;
const numeroDe = (jeu, objet) => idiv((objet - baseDesObjets(jeu)) | 0, TAILLE_OBJET);
const caseDe = (jeu, colonne, rangee) => (motLong(jeu, CARTE) + (rangee * COLONNES + colonne) * 4) >>> 0;
const caseDeLObjet = (jeu, objet) => caseDe(jeu, octet(jeu, objet + COLONNE), octet(jeu, objet + RANGEE));
const voisine = (jeu, ici, direction) => (ici + motSigne(jeu, VOISINES + 2 * direction) * 4) >>> 0;
const chercher = (jeu, ici, type) => jeu.appeler(CHERCHER_SUR_LA_CASE, ici, type) >>> 0;
const imageSuivante = (jeu, image) => mot(jeu, motLong(jeu, OBJETS_GRAPHIQUES) + image * 8 + 6);
const ficheDe = (jeu, attraction) => CATALOGUE + mot(jeu, attraction + GENRE);
const hasard = (jeu) => jeu.appeler(HASARD);

// Le pointeur de pile à l'entrée de la réécriture (l'adresse de retour).
function entree(jeu) {
  jeu.T.sauver();
  const esp = jeu.T.R.esp >>> 0;
  jeu.T.charger();
  return esp;
}

// Le reste de pile relu par 0x223C1 (index.js, `resteRelu`) : 24 octets sous l'entrée d'une routine
// d'objet. Les appels faits d'ici l'ont écrasé ; on y remet, en sortant, ce qu'y laissait l'original.
function laisserSousLEntree(jeu, sommet, valeur) {
  poserMotLong(jeu, sommet - 0x18, valeur);
}

// Au hasard, un quart des cases de l'emprise de l'attraction (0x16 cases relatives à `origine`,
// fiche +0x34) reçoivent des débris et sont réservées. Le hasard est tiré pour chaque case ; l'index
// est un mot signé, sans contrôle des bords de la carte.
function joncherDeDebris(jeu, fiche, origine) {
  for (let i = 0; i < CASES_D_EMPRISE; i++) {
    if ((hasard(jeu) & 3) !== 0) continue;
    const c = (motLong(jeu, CARTE) + s16(origine + mot(jeu, fiche + FICHE_EMPRISE + 2 * i)) * 4) >>> 0;
    poserOctet(jeu, c + 2, SOL_DE_DEBRIS);
    poserOctet(jeu, c + 3, octet(jeu, c + 3) | CASE_RESERVEE);
  }
}

// =================================================================================================
// 0x43BAA — un wagon du monorail en route (état 0x22), à chaque pas. Rend 1 s'il est arrivé en gare
// ou tombé, 0 sinon (la mise à jour des objets ne lit pas ce résultat).
// =================================================================================================
//
// Le wagon avance de sa vitesse dans sa direction (0 nord, 1 est, 2 sud, 3 ouest). S'il entre sur une
// autre case où se trouve déjà un wagon, il s'arrête ; et si ce wagon attendait à quai, il le pousse :
// celui-ci repart, à la vitesse 8, et ses passagers prennent l'image assise. Sur la case d'arrivée :
//  - pas de rail : le wagon sort de la voie et tombe (état 0x20) ; sa vitesse augmente de 0 à 6, au
//    hasard du pointeur de la souris et du pas de simulation (sic). S'il y a un rail derrière lui, il
//    tombe de sa hauteur, et son passager est projeté (0x66189) : son attraction perd une place ;
//  - une courbe (formes 1 à 4) : le wagon tourne quand il passe le milieu de la case — la part de la
//    case parcourue sur l'ancien axe passe sur le nouveau, l'ancien axe est recentré à 0x80 ;
// puis il est posé à sa nouvelle place. S'il a changé de case et qu'une gare (attraction à l'état 6
// sur un sol d'attraction) le touche, il s'y arrête : état 8, centré, 200 pas d'attente, et la gare
// passe à la fin du tour (phase 4).
//
// ANOMALIES reproduites : une direction au-delà de 3 laisse la nouvelle place non calculée (l'original
// lit alors ses variables locales non écrites : on relit les mêmes octets de pile) ; la recherche d'un
// wagon devant compare le résultat à 0, et non au premier objet.
export function avancerUnWagon(jeu, wagon) {
  const sommet = entree(jeu);
  // [ebp-4] et [ebp-8] : les coordonnées fines d'arrivée, x et y (mots).
  let x = mot(jeu, sommet - 0x14), y = mot(jeu, sommet - 0x18);
  const resultat = avancer();
  laisserSousLEntree(jeu, sommet, y);
  return resultat;

  function avancer() {
    poserMot(jeu, wagon + IMAGE, imageSuivante(jeu, mot(jeu, wagon + IMAGE)));
    const vitesse = mot(jeu, wagon + VITESSE);
    const direction = octet(jeu, wagon + DIRECTION);
    switch (direction) {
      case 0: x = mot(jeu, wagon + X); y = u16(mot(jeu, wagon + Y) - vitesse); break;
      case 1: x = u16(mot(jeu, wagon + X) + vitesse); y = mot(jeu, wagon + Y); break;
      case 2: x = mot(jeu, wagon + X); y = u16(mot(jeu, wagon + Y) + vitesse); break;
      case 3: x = u16(mot(jeu, wagon + X) - vitesse); y = mot(jeu, wagon + Y); break;
    }
    const colonne = x >> 8, rangee = y >> 8;
    const ici = caseDe(jeu, colonne, rangee);

    if (colonne !== octet(jeu, wagon + COLONNE) || rangee !== octet(jeu, wagon + RANGEE)) {
      const devant = chercher(jeu, ici, TYPE_VEHICULE);
      if (devant !== 0) {
        if (octet(jeu, devant + ETAT) === WAGON_A_QUAI) pousser(devant);
        return 0;
      }
    }

    const rail = chercher(jeu, ici, TYPE_RAIL);
    if (rail === 0) return tomber(ici, direction);
    if (octet(jeu, rail + FORME) <= 4) tourner(direction, octet(jeu, rail + FORME), s16(vitesse));

    // Une courbe ne change que les octets bas : la case d'arrivée reste `ici`.
    if ((jeu.appeler(PLACER, wagon, x, y) & 0xFFFF) === 0) return 0;
    for (let k = 0; k < 4; k++) {
      const c = voisine(jeu, ici, k);
      if ((octet(jeu, PROPRIETES_DES_SOLS + octet(jeu, c + 2) * 4) & SOL_D_ATTRACTION) === 0) continue;
      const gare = chercher(jeu, c, TYPE_ATTRACTION);
      if (gare === 0 || octet(jeu, gare + ETAT) !== GARE) continue;
      poserOctet(jeu, wagon + ETAT, WAGON_A_QUAI);
      poserOctet(jeu, wagon + X, 0x80);
      poserOctet(jeu, wagon + Y, 0x80);
      poserMot(jeu, wagon + ATTENTE_IMAGE, ATTENTE_A_QUAI);
      poserMot(jeu, gare + PHASE, FIN_DU_TOUR);
      return 1;
    }
    return 0;
  }

  // Le wagon arrêté devant repart, et ses passagers s'assoient.
  function pousser(devant) {
    poserOctet(jeu, devant + ETAT, WAGON_EN_ROUTE);
    poserMot(jeu, devant + VITESSE, VITESSE_DE_DEPART);
    const base = baseDesObjets(jeu);
    for (let p = objetNumero(jeu, mot(jeu, devant + PREMIER_A_BORD)); p > base;
      p = objetNumero(jeu, mot(jeu, p + PREMIER_A_BORD))) {
      poserMot(jeu, p + IMAGE, mot(jeu, IMAGES_DES_PASSAGERS + octet(jeu, p + 0x59) * 0x24));
      poserMot(jeu, p + TRAIN, numeroDe(jeu, devant));
    }
  }

  // Aux courbes, le wagon tourne une fois passé le milieu de la case (octets bas des coordonnées).
  // `cas` : direction × 4 + forme − 1 ; seules huit combinaisons tournent.
  function tourner(direction, forme, vitesse) {
    const xb = x & 0xFF, yb = y & 0xFF;
    const poser = (nouvelle, nx, ny) => {
      poserOctet(jeu, wagon + DIRECTION, nouvelle);
      x = (x & 0xFF00) | (nx & 0xFF);
      y = (y & 0xFF00) | (ny & 0xFF);
    };
    // En remontant l'axe : passé le milieu quand l'octet bas est sous 0x80, ou quand la vitesse le
    // ferait passer sous zéro. En le descendant : au-dessus de 0x80, ou au-delà de 0xFF.
    const enRemontant = (b) => b < 0x80 || b - vitesse < 0;
    const enDescendant = (b) => b > 0x80 || vitesse + b > 0xFF;
    switch (u16(direction * 4 + forme - 1)) {
      case 1: if (enRemontant(yb)) poser(1, 0xFF - yb, 0x80); break;
      case 2: if (enRemontant(yb)) poser(3, yb, 0x80); break;
      case 6: if (enDescendant(xb)) poser(2, 0x80, xb); break;
      case 7: if (enDescendant(xb)) poser(0, 0x80, 0xFF - xb); break;
      case 8: if (enDescendant(yb)) poser(1, yb, 0x80); break;
      case 11: if (enDescendant(yb)) poser(3, 0xFF - yb, 0x80); break;
      case 12: if (enRemontant(xb)) poser(0, 0x80, xb); break;
      case 13: if (enRemontant(xb)) poser(2, 0x80, 0xFF - xb); break;
    }
  }

  // Plus de rail : le wagon sort de la voie.
  function tomber(ici, direction) {
    jeu.appeler(PLACER, wagon, x, y);
    poserOctet(jeu, wagon + ETAT, WAGON_QUI_TOMBE);
    poserMot(jeu, wagon + VITESSE,
      mot(jeu, wagon + VITESSE) + (mot(jeu, SOURIS_X) & 3) + (mot(jeu, PAS_DE_SIMULATION) & 3));
    const derriere = voisine(jeu, ici, motSigne(jeu, DIRECTIONS_OPPOSEES + 2 * direction));
    const rail = chercher(jeu, derriere, TYPE_RAIL);
    const base = baseDesObjets(jeu);
    if (rail > base) {
      poserMot(jeu, wagon + HAUTEUR_DE_CHUTE, octet(jeu, rail + HAUTEUR) * 0x18 + 0x11);
      poserMot(jeu, wagon + ATTENTE_IMAGE, 0);
      const passager = objetNumero(jeu, mot(jeu, wagon + PREMIER_A_BORD));
      if (passager > base && objetNumero(jeu, mot(jeu, passager + GENRE)) > base) {
        jeu.appeler(EJECTER, 2, passager, wagon, motSigne(jeu, wagon + VITESSE));
        const attraction = objetNumero(jeu, mot(jeu, wagon + GENRE));
        if (attraction > base) {
          poserMot(jeu, attraction + A_BORD, mot(jeu, attraction + A_BORD) - 1);
          poserMot(jeu, attraction + CAPACITE, mot(jeu, attraction + CAPACITE) - 1);
        }
      }
    } else {
      poserMot(jeu, wagon + HAUTEUR_DE_CHUTE, 0);
    }
    return 1;
  }
}

// =================================================================================================
// 0x44208 — une gare du monorail (mode 6), à chaque pas ; appelée par la routine des attractions à
// train (0x41F3D) pour le genre de voie 3.
// =================================================================================================
//
// Rien tant que la gare n'a pas de train (mot +0x45). À la fin d'un tour (phase 4, posée par le wagon
// qui arrive, 0x43BAA), tous les 8 passages, le premier passager du wagon à quai descend (0x449FF) ;
// le wagon vide, la gare revient au repos. Au repos, le visiteur en tête de file monte dans le wagon
// voisin s'il est à quai (0x30C65) ; le prix de construction est payé un mois après la construction
// (comme les autres attractions, attractions.js) ; et un départ donné (phase 1) passe en marche.
// Seul le premier wagon trouvé sur les quatre cases voisines compte.
export function animerUneGare(jeu, gare) {
  if (mot(jeu, gare + TRAIN) === 0) return;
  const ici = caseDeLObjet(jeu, gare);
  const base = baseDesObjets(jeu);
  const wagonVoisin = () => {
    for (let k = 0; k < 4; k++) {
      const wagon = chercher(jeu, voisine(jeu, ici, k), TYPE_VEHICULE);
      if (wagon > base) return wagon;
    }
    return 0;
  };

  const phase = mot(jeu, gare + PHASE);
  if (phase === FIN_DU_TOUR) {
    if ((octet(jeu, PASSAGES) & 7) !== 0) return;
    const wagon = wagonVoisin();
    if (wagon === 0) return;
    const passager = objetNumero(jeu, mot(jeu, wagon + PREMIER_A_BORD));
    if (passager > base) {
      jeu.appeler(DEBARQUER_D_UN_VEHICULE, passager, gare, wagon);
      if (mot(jeu, wagon + PREMIER_A_BORD) !== 0) return;
    }
    poserMot(jeu, gare + PHASE, A_L_ARRET);
    poserMot(jeu, wagon + A_BORD, 0);
    return;
  }
  if (phase !== A_L_ARRET) return;

  const enTete = objetNumero(jeu, mot(jeu, gare + EN_TETE_DE_FILE));
  if (enTete > base) {
    const wagon = wagonVoisin();
    if (wagon !== 0 && octet(jeu, wagon + ETAT) === WAGON_A_QUAI) {
      jeu.appeler(MONTER_DANS_UN_VEHICULE, enTete, gare, wagon);
    }
  }
  const aPayer = motSigne(jeu, gare + A_PAYER);
  if (aPayer !== 0 && ((motLong(jeu, PAS_DE_SIMULATION) - motLong(jeu, gare + CONSTRUITE_LE)) >>> 0) >= 1000) {
    jeu.appeler(INSCRIRE_AU_LIVRE, CATEGORIE_CONSTRUCTION, -aPayer * 100);
    const joueur = motLong(jeu, FICHE_DU_JOUEUR);
    poserMotLong(jeu, joueur + 0xE, motLong(jeu, joueur + 0xE) - aPayer * 100);
    poserMot(jeu, gare + A_PAYER, 0);
  }
  if (mot(jeu, gare + PHASE) === AU_DEPART) poserMot(jeu, gare + PHASE, EN_MARCHE);
}

// =================================================================================================
// 0x44439 — suivre la voie du monorail depuis une gare (gare, relever), relever ses gares, et rendre
// le prix des morceaux neufs.
// =================================================================================================
//
// La sœur de 0x43689 (construire.js, `evaluerLaVoie`) pour le monorail. Elle part de la case devant
// la gare et suit les rails dans les deux sens à la fois. À chaque morceau, les courbes parcourues
// dans ce sens sont comptées (0xB8FD0), et les quatre cases voisines examinées : la première gare
// (attraction à l'état 6) trouvée, autre que la première gare du circuit, est rattachée à la chaîne
// des gares (+0xC0 la première, +0xC2 la suivante) et note les courbes parcourues pour l'atteindre
// (+0xC4). Le circuit est bouclé quand les deux marches se rejoignent ; alors, avec `relever`, la
// capacité de la première gare devient le nombre de morceaux / 20 ; la fonction rend le prix des
// morceaux neufs : `0xB5302[hauteur] + [fiche + 0xBA]` pour chaque morceau dont la hauteur ou l'octet
// +0x44 ont changé depuis qu'il a été payé (octets +0xBE et +0xBD, que la fonction met à jour sans
// `relever`). Voie ouverte : −(prix + 1). Pas de rail devant la gare : 0xC4653601.
//
// ANOMALIE reproduite : la première gare est comparée à chaque gare trouvée avant d'avoir été écrite
// ([ebp-0x34], variable locale jamais initialisée : on relit le mot de pile d'origine) ; et un
// circuit bouclé sans gare fixe la capacité de l'objet que désigne ce reste, s'il passe pour un objet.
export function evaluerLaVoie(jeu, gare, relever) {
  const sommet = entree(jeu);
  let premiereGare = motLong(jeu, sommet - 0x44);
  const base = baseDesObjets(jeu);
  const depart = voisine(jeu, caseDeLObjet(jeu, gare), octet(jeu, gare + DIRECTION));
  let rail = chercher(jeu, depart, TYPE_RAIL);
  if (rail === 0) return RIEN_DU_TOUT;

  const sens = [octet(jeu, SORTIES_DES_RAILS + octet(jeu, rail + FORME) * 2),
    octet(jeu, SORTIES_DES_RAILS + octet(jeu, rail + FORME) * 2 + 1)];
  const ou = [depart, depart];
  const courbes = [0, 0];
  let commence = false, prix = 0, morceaux = 0, numeroDeLaPremiere = 0, precedente = 0;
  const prixDuMorceau = () => u16(mot(jeu, PRIX_PAR_HAUTEUR + octet(jeu, rail + HAUTEUR) * 2)
    + mot(jeu, CATALOGUE + FICHE_PRIX_D_UN_MORCEAU + mot(jeu, gare + GENRE)));

  while (sens[0] + sens[1] !== 0) {
    for (let m = 0; m < 2; m++) {
      if (sens[m] === 0) continue;
      rail = chercher(jeu, ou[m], TYPE_RAIL);
      if (rail === 0) { sens[m] = 0; continue; }
      const forme = octet(jeu, rail + FORME);
      if (forme < 5) courbes[m] = u16(courbes[m] + mot(jeu, COURBES_D_UNE_FORME + forme * 2));

      for (let k = 0; k < 4; k++) {
        const autre = chercher(jeu, voisine(jeu, ou[m], k), TYPE_ATTRACTION);
        if (autre <= base || octet(jeu, autre + ETAT) !== GARE) continue;
        if (autre === premiereGare) continue;
        if (u16(numeroDeLaPremiere) === 0) {
          premiereGare = autre;
          numeroDeLaPremiere = numeroDe(jeu, autre);
        } else {
          poserMot(jeu, precedente + GARE_SUIVANTE, numeroDe(jeu, autre));
        }
        poserOctet(jeu, autre + COURBES_JUSQU_ICI, courbes[m]);
        poserMot(jeu, autre + PREMIERE_GARE, numeroDeLaPremiere);
        poserMot(jeu, autre + GARE_SUIVANTE, 0);
        precedente = autre;
        break;
      }

      if (ou[0] === ou[1] && commence) {
        if ((relever & 0xFF) !== 0 && premiereGare > base) {
          poserMot(jeu, premiereGare + CAPACITE, idiv(u16(morceaux), 20));
        }
        return u16(prix);
      }
      commence = true;
      sens[m] = ~octet(jeu, RETOUR_DES_RAILS + sens[m]) & octet(jeu, OUVERTURES_DES_RAILS + forme) & 0xFF;
      if (sens[m] === 0) continue;
      ou[m] = (ou[m] + motSigne(jeu, PAS_D_UN_MASQUE + sens[m] * 2) * 4) >>> 0;
      if (octet(jeu, rail + HAUTEUR_PAYEE) !== octet(jeu, rail + HAUTEUR)
        || octet(jeu, rail + MORCEAU_44_PAYE) !== octet(jeu, rail + MORCEAU_44)) {
        if ((relever & 0xFF) === 0) {
          poserOctet(jeu, rail + HAUTEUR_PAYEE, octet(jeu, rail + HAUTEUR));
          poserOctet(jeu, rail + MORCEAU_44_PAYE, octet(jeu, rail + MORCEAU_44));
        }
        prix = (prix + prixDuMorceau()) | 0;
      }
      morceaux++;
    }
  }
  return -(u16(prix) + 1);
}

// =================================================================================================
// 0x447E3 — ouvrir le monorail (gare, prix) : la voie est payée (catégorie 0x17 du livre) si elle ne
// l'a pas encore été, puis chaque gare de la chaîne est ouverte avec capacité / gares + 2 wagons
// (0x41936), et marquée ouverte et payée.
// =================================================================================================
export function ouvrirLeMonorail(jeu, gare, prix) {
  const base = baseDesObjets(jeu);
  let gares = 1;
  for (let g = objetNumero(jeu, mot(jeu, gare + GARE_SUIVANTE)); g > base;
    g = objetNumero(jeu, mot(jeu, g + GARE_SUIVANTE))) gares++;
  if (octet(jeu, gare + FACTUREE) === 0) jeu.appeler(INSCRIRE_AU_LIVRE, CATEGORIE_VOIES, -prix);
  const wagons = idiv(mot(jeu, gare + CAPACITE), u16(gares)) + 2;
  let g = gare;
  do {
    jeu.appeler(OUVRIR_L_ATTRACTION, ficheDe(jeu, g), g, u16(wagons));
    poserOctet(jeu, g + OUVERTE, 1);
    poserOctet(jeu, g + FACTUREE, 1);
    g = objetNumero(jeu, mot(jeu, g + GARE_SUIVANTE));
  } while (g > base);
}

// =================================================================================================
// 0x448BA — fermer le monorail : pour chaque gare, depuis la première, les passagers de chaque wagon
// du train descendent (0x449FF), les wagons sont effacés (0x18B62, en suivant la chaîne +0x61), le
// premier de la file est renvoyé (0x32142) et la gare fermée. Rend, comme l'original, la dernière
// gare désignée : le premier objet, sentinelle de fin de chaîne.
//
// ANOMALIE reproduite : le train d'une gare n'est pas contrôlé ; une gare sans train (+0x45 nul)
// fait effacer l'objet 0, la sentinelle de la table.
// =================================================================================================
export function fermerLeMonorail(jeu, gare) {
  const base = baseDesObjets(jeu);
  let g = objetNumero(jeu, mot(jeu, gare + PREMIERE_GARE));
  do {
    let wagon = objetNumero(jeu, mot(jeu, g + TRAIN));
    for (;;) {
      for (let p = objetNumero(jeu, mot(jeu, wagon + PREMIER_A_BORD)); p > base;
        p = objetNumero(jeu, mot(jeu, wagon + PREMIER_A_BORD))) {
        jeu.appeler(DEBARQUER_D_UN_VEHICULE, p, g, wagon);
        poserMot(jeu, p + PREMIER_A_BORD, 0);
      }
      const suivant = objetNumero(jeu, mot(jeu, wagon + WAGON_SUIVANT));
      jeu.appeler(EFFACER_L_OBJET, wagon);
      if (suivant <= base) break;
      wagon = suivant;
    }
    jeu.appeler(APPELER_LE_SUIVANT, objetNumero(jeu, mot(jeu, g + EN_TETE_DE_FILE)), g);
    poserMot(jeu, g + PREMIER_A_BORD, 0);
    poserMot(jeu, g + EN_TETE_DE_FILE, 0);
    poserMot(jeu, g + FILE_2A, 0);
    poserOctet(jeu, g + OUVERTE, 0);
    g = objetNumero(jeu, mot(jeu, g + GARE_SUIVANTE));
  } while (g > base);
  return g;
}

// =================================================================================================
// 0x664F1 — le nuage d'une explosion : le premier emplacement libre de la table des objets après
// l'objet donné devient un effet (type 2, état 0x48) à la même place, une rangée plus haut pour une
// attraction, avec la figure 0x24B. Rien si la table est pleine. Appelée par l'explosion (0x6662D)
// et par 0x258D9.
// =================================================================================================
export function creerLeNuage(jeu, objet) {
  const fin = motLong(jeu, FIN_DES_OBJETS_DU_PARC);
  for (let p = objet >>> 0; p < fin; p += TAILLE_OBJET) {
    if (octet(jeu, p + TYPE) !== TYPE_LIBRE) continue;
    poserOctet(jeu, p + TYPE, TYPE_EFFET);
    poserOctet(jeu, p + ETAT, EFFET_D_EXPLOSION);
    poserMot(jeu, p + X, mot(jeu, objet + X));
    poserMot(jeu, p + Y, mot(jeu, objet + Y));
    if (octet(jeu, objet + TYPE) === TYPE_ATTRACTION) poserOctet(jeu, p + RANGEE, octet(jeu, p + RANGEE) - 1);
    poserMot(jeu, p + IMAGE, mot(jeu, motLong(jeu, FIGURES) + FIGURE_DE_L_EXPLOSION * 2));
    poserMot(jeu, p + ALTITUDE, 0);
    poserOctet(jeu, p + SENS_DU_NUAGE, 0);
    jeu.appeler(POSER_SUR_LA_CASE, p, mot(jeu, p + X), mot(jeu, p + Y));
    return;
  }
}

// =================================================================================================
// 0x665AE — le nuage d'une explosion, à chaque pas : son animation avance, son compteur +0x5F monte
// jusqu'à 4, redescend de 2 à 0 (octet +0xC4 : le sens), et le nuage disparaît (0x28752).
//
// Reste de pile : l'appel de 0x28752 laisse, 24 octets sous l'entrée, son adresse de retour.
// =================================================================================================
export function animerLeNuage(jeu, nuage) {
  const sommet = entree(jeu);
  poserMot(jeu, nuage + IMAGE, imageSuivante(jeu, mot(jeu, nuage + IMAGE)));
  const redescend = octet(jeu, nuage + SENS_DU_NUAGE) !== 0;
  poserMot(jeu, nuage + ALTITUDE, mot(jeu, nuage + ALTITUDE) + (redescend ? -1 : 1));
  if (mot(jeu, nuage + ALTITUDE) > 3) {
    poserOctet(jeu, nuage + SENS_DU_NUAGE, 1);
    poserMot(jeu, nuage + ALTITUDE, 2);
  } else if (mot(jeu, nuage + ALTITUDE) === 0) {
    jeu.appeler(QUITTER_LE_PARC, nuage);
    laisserSousLEntree(jeu, sommet, RETOUR_DU_DEPART_DANS_665AE);
  }
}

// =================================================================================================
// 0x6662D — une attraction explose.
// =================================================================================================
//
// Le bruitage de l'explosion. Une attraction à voie (état 6) perd ses trains (0x41EB4 ; le monorail
// aussi de la chaîne des gares, 0x44BB8) et les cinq morceaux de voie devant sa gare (0x2C6B8, décalages en
// 0xB7A47 selon la direction opposée à la sienne), si un rail touche l'une de ses cases voisines.
// Puis, selon le rang du genre (fiche +0xC4) :
//  - 3 (PLANE FLYER), la première fois : ses avions s'envolent (mode 0x26, compte +0xB1 à 2 ;
//    0x66AFD), les passagers à bord ; à la fin de l'envol, 0x66AFD rappelle l'explosion, qui fait
//    alors comme pour les autres genres ;
//  - sinon, les passagers sont projetés (0x66189), dans l'ordre de la liste ; puis
//  - 0xE (BOUNCY CASTLE) : le château s'envole (mode 0x24, sa place d'origine gardée en +0xE et
//    +0x10, un élan de 10 à 19, délai 0x14 ; 0x66976) ;
//  - les autres : le nuage (0x664F1), la démolition (0x31748) et les débris sur l'emprise.
// Le parc compte une attraction retirée de plus (+0x9F).
//
// La fiche et l'origine de l'emprise sont lues en entrant : la démolition peut effacer l'objet.
export function exploser(jeu, attraction) {
  const fiche = ficheDe(jeu, attraction);
  const origine = origineDeLEmprise(jeu, attraction, fiche);
  jeu.appeler(BRUITAGE_UNIQUE, 0, BRUITAGE_DE_L_EXPLOSION);
  const base = baseDesObjets(jeu);

  if (octet(jeu, attraction + ETAT) === GARE) {
    for (let k = 0; k < 4; k++) {
      const ici = caseDeLObjet(jeu, attraction);
      if (chercher(jeu, voisine(jeu, ici, k), TYPE_RAIL) <= base) continue;
      if (mot(jeu, fiche + FICHE_FIGURE) === FIGURE_DU_MONORAIL) jeu.appeler(DETACHER_LA_GARE, attraction);
      jeu.appeler(OTER_LES_TRAINS, attraction);
      const numero = (ici - motLong(jeu, CARTE)) >> 2;
      for (let j = 0; j < 5; j++) {
        const decalage = motSigne(jeu, DIRECTIONS_OPPOSEES + octet(jeu, attraction + DIRECTION) * 2) * 0x1D + j * 4;
        const colonne = motSigne(jeu, RAILS_DE_LA_GARE + decalage);
        const rangee = motSigne(jeu, RAILS_DE_LA_GARE + 2 + decalage);
        jeu.appeler(EFFACER_LES_RAILS, u16(numero + rangee * COLONNES + colonne));
      }
      break;
    }
  }

  let rang = octet(jeu, fiche + FICHE_RANG);
  if (!(rang === RANG_DES_AVIONS && octet(jeu, attraction + ETAT) !== AVIONS_ENVOLES)) {
    // Déjà envolés, les avions retombent comme les autres attractions.
    if (rang === RANG_DES_AVIONS) rang = 0xFF;
    for (let v = objetNumero(jeu, mot(jeu, attraction + PREMIER_A_BORD)); v > base;
      v = objetNumero(jeu, mot(jeu, attraction + PREMIER_A_BORD))) {
      poserMot(jeu, attraction + PREMIER_A_BORD, mot(jeu, v + PREMIER_A_BORD));
      poserMot(jeu, attraction + A_BORD, mot(jeu, attraction + A_BORD) - 1);
      poserOctet(jeu, v + DIRECTION, imod(u16(hasard(jeu)), 3) + 1);
      jeu.appeler(EJECTER, 0, v, attraction, 5);
    }
  }

  if (rang === RANG_DES_AVIONS) {
    poserOctet(jeu, attraction + ETAT, AVIONS_ENVOLES);
    poserOctet(jeu, attraction + ENVOL, 2);
  } else if (rang === RANG_DU_CHATEAU) {
    poserOctet(jeu, attraction + ETAT, CHATEAU_ENVOLE);
    poserMot(jeu, attraction + PLACE_D_ORIGINE_X, mot(jeu, attraction + X));
    poserMot(jeu, attraction + PLACE_D_ORIGINE_Y, mot(jeu, attraction + Y));
    poserOctet(jeu, attraction + ENVOL, 0);
    poserOctet(jeu, attraction + ELAN, imod(u16(hasard(jeu)), 10) + 10);
    poserMot(jeu, attraction + DUREE, 0xFFFF);
    poserOctet(jeu, attraction + DELAI, 0x14);
  } else {
    jeu.appeler(CREER_L_EFFET_D_EXPLOSION, attraction);
    jeu.appeler(DEMOLIR_UNE_ATTRACTION, attraction);
    joncherDeDebris(jeu, fiche, origine);
  }
  const parc = motLong(jeu, FICHE_DU_PARC);
  poserMot(jeu, parc + ATTRACTIONS_RETIREES, mot(jeu, parc + ATTRACTIONS_RETIREES) + 1);
}

// La case de référence de l'emprise d'une attraction : sa case moins le décalage de la fiche.
function origineDeLEmprise(jeu, attraction, fiche) {
  return octet(jeu, attraction + RANGEE) * COLONNES + octet(jeu, attraction + COLONNE)
    - mot(jeu, fiche + FICHE_ORIGINE_EMPRISE);
}

// =================================================================================================
// 0x66976 — le château gonflable envolé (mode 0x24), à chaque pas : il dérive (de son délai + 0x14 en
// x, + 5 en y, en 256es de case ; la dérive cesse au bord de la carte), son élan décroît d'un par pas
// (+0x34 vaut 0xFFFF : on en ajoute l'octet bas) et son altitude suit l'élan. Retombé sous −536 (le
// mot +0x5F au-delà de 0xFDE8), il est remis à sa place d'origine, démoli (0x31748), et son emprise
// jonchée de débris. Le dessin est dans dessin-attractions.js. Rend 0 dans al, que personne ne lit.
//
// Reste de pile : sa variable [ebp-8], la coordonnée x de la dérive, ou celle de la place d'origine.
// =================================================================================================
export function animerLeChateauEnvole(jeu, chateau) {
  const sommet = entree(jeu);
  poserOctet(jeu, chateau + ENVOL, octet(jeu, chateau + ENVOL) + 1);
  const delai = octet(jeu, chateau + DELAI);
  let reste = u16(mot(jeu, chateau + X) + delai + 0x14);
  jeu.appeler(DEPLACER, chateau, reste, u16(mot(jeu, chateau + Y) + delai + 5));
  poserOctet(jeu, chateau + ELAN, octet(jeu, chateau + ELAN) + octet(jeu, chateau + DUREE));
  poserMot(jeu, chateau + ALTITUDE, mot(jeu, chateau + ALTITUDE) + octetSigne(jeu, chateau + ELAN));
  const colonne = octet(jeu, chateau + COLONNE), rangee = octet(jeu, chateau + RANGEE);
  if (colonne === 1 || colonne === 0x3E || rangee === 1 || rangee === 0x37) poserOctet(jeu, chateau + DELAI, 0);

  if (mot(jeu, chateau + ALTITUDE) > 0xFDE8) {
    reste = mot(jeu, chateau + PLACE_D_ORIGINE_X);
    jeu.appeler(PLACER, chateau, mot(jeu, chateau + PLACE_D_ORIGINE_X), mot(jeu, chateau + PLACE_D_ORIGINE_Y));
    const fiche = ficheDe(jeu, chateau);
    const origine = origineDeLEmprise(jeu, chateau, fiche);
    jeu.appeler(DEMOLIR_UNE_ATTRACTION, chateau);
    joncherDeDebris(jeu, fiche, origine);
  }
  laisserSousLEntree(jeu, sommet, reste);
}

// =================================================================================================
// 0x66AFD — les avions envolés (mode 0x26), à chaque pas : le compte +0xB1 monte de 2 à 200 (le
// dessin les élève d'autant), l'animation avance au rythme de son délai ; passé 200, le compte revient
// à 0, et au pas suivant l'attraction explose pour de bon (0x6662D).
//
// Reste de pile : l'argument empilé pour 0x6662D, l'attraction.
// =================================================================================================
export function animerLesAvionsEnvoles(jeu, attraction) {
  const sommet = entree(jeu);
  if (octet(jeu, attraction + ENVOL) === 0) {
    jeu.appeler(EXPLOSER, attraction);
    laisserSousLEntree(jeu, sommet, attraction);
    return;
  }
  poserOctet(jeu, attraction + ENVOL, octet(jeu, attraction + ENVOL) + 1);
  if (octet(jeu, attraction + ENVOL) > 0xC8) {
    poserOctet(jeu, attraction + ENVOL, 0);
    return;
  }
  const attente = motSigne(jeu, attraction + ATTENTE_IMAGE);
  poserMot(jeu, attraction + ATTENTE_IMAGE, attente - 1);
  if (attente > 0) return;
  poserMot(jeu, attraction + IMAGE, imageSuivante(jeu, mot(jeu, attraction + IMAGE)));
  poserMot(jeu, attraction + ATTENTE_IMAGE, octet(jeu, attraction + DELAI) * 2);
}

// =================================================================================================
// 0x66BA0 — désaccorder la musique d'une attraction usée : tous les 50 appels (un par image), la
// courbure des notes s'écarte de 500 (sur 14 bits, centre 0x2000), et repart dans l'autre sens au-delà
// de 0x2EE0 ou en deçà de 0x1F4 ; elle est envoyée aux canaux 1 à 3 (messages MIDI 0xE1 à 0xE3, deux
// octets de 7 bits). Si 0x66D18 l'a demandé, l'oscillation repart du centre, vers le bas. Sans carte
// son (les scénarios de vérification), rien : la musique n'est pas initialisée.
// =================================================================================================
export function desaccorderLaMusique(jeu) {
  if (octet(jeu, MUSIQUE_INITIALISEE) === 0 || octet(jeu, MUSIQUE_PERMISE) === 0) return;
  if (mot(jeu, MORCEAU_EN_COURS) === 0) return;
  poserOctet(jeu, DESACCORD_EN_COURS, 1);
  if (octet(jeu, DESACCORD_A_REPRENDRE) !== 0) {
    poserMot(jeu, COURBURE, CENTRE_DE_LA_COURBURE);
    poserMot(jeu, COMPTE_DU_DESACCORD, 0);
    poserMot(jeu, PAS_DU_DESACCORD, PAS_DE_COURBURE);
    poserOctet(jeu, DESACCORD_A_REPRENDRE, 0);
  }
  poserMot(jeu, COMPTE_DU_DESACCORD, mot(jeu, COMPTE_DU_DESACCORD) + 1);
  if (mot(jeu, COMPTE_DU_DESACCORD) < APPELS_PAR_PAS_DE_COURBURE) return;
  poserMot(jeu, COMPTE_DU_DESACCORD, 0);
  poserMot(jeu, COURBURE, mot(jeu, COURBURE) + mot(jeu, PAS_DU_DESACCORD));
  if (mot(jeu, COURBURE) >= COURBURE_MAX) poserMot(jeu, PAS_DU_DESACCORD, -mot(jeu, PAS_DU_DESACCORD));
  if (mot(jeu, COURBURE) <= COURBURE_MIN) poserMot(jeu, PAS_DU_DESACCORD, -mot(jeu, PAS_DU_DESACCORD));
  for (const message of [0xE1, 0xE2, 0xE3]) {
    const courbure = mot(jeu, COURBURE);
    poserOctet(jeu, MESSAGE_MIDI, message);
    poserOctet(jeu, MESSAGE_MIDI + 1, courbure & 0x7F);
    poserOctet(jeu, MESSAGE_MIDI + 2, (courbure >> 7) & 0x7F);
    jeu.appeler(ENVOYER_AU_PILOTE_MIDI, motLong(jeu, MORCEAU_SOS), MESSAGE_MIDI, jeu.T.R.ds & 0xFFFF, 3);
  }
}

// =================================================================================================
// 0x449FF — un passager descend d'un wagon du monorail, à la gare (appelée par 0x44208, le premier
// passager du wagon à quai, et par 0x448BA, tous les passagers quand on ferme le monorail).
//
// Comme à la sortie d'une attraction (0x31F95, visiteurs-etats-a.js), le passager passe dans
// l'état 0x10, avec pour décompte le temps de traverser une case (0x100 / vitesse ; 0x19ED3 pour une
// vitesse nulle), et il est posé au milieu de la case de sortie de la gare : son mot +0x73 (colonne
// + 64 × rangée), ou, à défaut, la case de l'objet que désigne son mot +0x49 (le kiosque ?). Il prend
// la direction de cet objet +0x49, ou, si la case de sortie est une sortie (drapeau 0x20 de son sol),
// celle que donne sa forme ; et sa figure de marche. Puis chaque gare de la chaîne (+0xC0, puis
// +0xC2 de chacune) décompte un passager (+0x30) ; le wagon perd son premier passager (+0x47 prend le
// suivant, +0x47 du passager) et en décompte un aussi.
//
// Contrairement à 0x31F95, le décompte n'est pas remis à zéro faute de case de sortie. Exercé par
// monorail-visiteurs (26 appels, depuis 0x44208) : relu instruction par instruction pour la gare sans
// case de sortie et la vitesse nulle.
const ALLURES = 0xB49F4, TAILLE_ALLURE = 0x24;   // la figure de marche : mot +0 de l'allure, + direction
const FORMES_DES_SOLS = 0xB44DC;       // octet +3 des propriétés d'un sol
const SOL_DE_SORTIE = 0x20;
const DIVISION_PAR_ZERO = 0x19ED3;     // rend 1 : le programme s'en sert au lieu de diviser par zéro
const DESCENDU = 0x10;                 // l'état du visiteur qui quitte une attraction (0x24F82)
export function debarquerDUnWagon(jeu, passager, gare, wagon) {
  poserOctet(jeu, passager + ETAT, DESCENDU);
  const vitesse = octet(jeu, passager + 0x13);
  poserMot(jeu, passager + 0x14, vitesse === 0 ? s16(jeu.appeler(DIVISION_PAR_ZERO)) : idiv(0x100, vitesse));

  let colonne, rangee;
  const sortie = mot(jeu, gare + 0x73);
  if (sortie !== 0) {
    colonne = sortie % COLONNES;
    rangee = (sortie >> 6) & 0xFF;
  } else {
    const kiosque = objetNumero(jeu, mot(jeu, gare + 0x49));
    colonne = octet(jeu, kiosque + COLONNE);
    rangee = octet(jeu, kiosque + RANGEE);
  }
  poserOctet(jeu, passager + DIRECTION, octet(jeu, objetNumero(jeu, mot(jeu, gare + 0x49)) + DIRECTION));
  const sol = octet(jeu, caseDe(jeu, colonne, rangee) + 2);
  if (octet(jeu, PROPRIETES_DES_SOLS + sol * 4) & SOL_DE_SORTIE) {
    poserOctet(jeu, passager + DIRECTION, octet(jeu, FORMES_DES_SOLS + sol * 4));
  }
  const marche = mot(jeu, ALLURES + octet(jeu, passager + 0x59) * TAILLE_ALLURE);
  poserMot(jeu, passager + IMAGE, mot(jeu, motLong(jeu, FIGURES) + (marche + octet(jeu, passager + DIRECTION)) * 2));
  jeu.appeler(DEPLACER, passager, (colonne << 8) | 0x80, (rangee << 8) | 0x80);

  for (let g = objetNumero(jeu, mot(jeu, gare + PREMIERE_GARE)); g > baseDesObjets(jeu);
    g = objetNumero(jeu, mot(jeu, g + GARE_SUIVANTE))) {
    poserMot(jeu, g + A_BORD, mot(jeu, g + A_BORD) - 1);
  }
  poserMot(jeu, wagon + PREMIER_A_BORD, mot(jeu, passager + PREMIER_A_BORD));
  poserMot(jeu, wagon + A_BORD, mot(jeu, wagon + A_BORD) - 1);
}

// =================================================================================================
// 0x44BB8 — détacher une gare de la chaîne des gares du monorail, avant qu'on la démolisse (0x31748)
// ou qu'elle explose (0x6662D).
//
// La nouvelle première gare est l'ancienne (mot +0xC0 de la gare), ou, si c'était celle-ci, la
// suivante (+0xC2). Chaque autre gare de la chaîne est alors désignée comme première par son mot
// +0xC0 et chaînée à la précédente par le +0xC2 de celle-ci. La dernière garde son +0xC2.
//
// ANOMALIE D'ORIGINE, reproduite : si la gare détachée était la dernière de la chaîne, la nouvelle
// dernière la désigne encore par son +0xC2 ; rien ne remet ce lien à zéro ici (ce qu'en fait la suite
// de la démolition, non établi). Exercée par monorail-visiteurs (1 appel).
export function detacherLaGare(jeu, gare) {
  let premiere = objetNumero(jeu, mot(jeu, gare + PREMIERE_GARE));
  if (premiere === gare) premiere = objetNumero(jeu, mot(jeu, gare + GARE_SUIVANTE));
  let precedente = 0;
  for (let g = premiere; g > baseDesObjets(jeu); g = objetNumero(jeu, mot(jeu, g + GARE_SUIVANTE))) {
    if (g === gare) continue;
    poserMot(jeu, g + PREMIERE_GARE, numeroDe(jeu, premiere));
    if (precedente > baseDesObjets(jeu)) poserMot(jeu, precedente + GARE_SUIVANTE, numeroDe(jeu, g));
    precedente = g;
  }
}

// =================================================================================================
// Toutes, sauf 0x66BA0, écrivent dans les objets du parc, dans le tas : la comparaison
// appel par appel restaure et compare toute la mémoire.
export const reecritures = [
  { adresse: 0x43BAA, nom: 'avancerUnWagon', fn: avancerUnWagon, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x44208, nom: 'animerUneGare', fn: animerUneGare, arguments: 1, memoire: 'entiere' },
  { adresse: 0x44439, nom: 'evaluerLaVoieDuMonorail', fn: evaluerLaVoie, arguments: 2, retour: true, memoire: 'entiere' },
  { adresse: 0x447E3, nom: 'ouvrirLeMonorail', fn: ouvrirLeMonorail, arguments: 2, memoire: 'entiere' },
  { adresse: 0x448BA, nom: 'fermerLeMonorail', fn: fermerLeMonorail, arguments: 1, retour: true, memoire: 'entiere' },
  { adresse: 0x664F1, nom: 'creerLeNuage', fn: creerLeNuage, arguments: 1, memoire: 'entiere' },
  { adresse: 0x665AE, nom: 'animerLeNuage', fn: animerLeNuage, arguments: 1, memoire: 'entiere' },
  { adresse: 0x6662D, nom: 'exploser', fn: exploser, arguments: 1, memoire: 'entiere' },
  { adresse: 0x66976, nom: 'animerLeChateauEnvole', fn: animerLeChateauEnvole, arguments: 1, memoire: 'entiere' },
  { adresse: 0x66AFD, nom: 'animerLesAvionsEnvoles', fn: animerLesAvionsEnvoles, arguments: 1, memoire: 'entiere' },
  { adresse: 0x66BA0, nom: 'desaccorderLaMusique', fn: desaccorderLaMusique, arguments: 0, memoire: 'entiere' },
  { adresse: 0x449FF, nom: 'debarquerDUnWagon', fn: debarquerDUnWagon, arguments: 3, memoire: 'entiere' },
  { adresse: 0x44BB8, nom: 'detacherLaGare', fn: detacherLaGare, arguments: 1, memoire: 'entiere' },
];

export const enAttente = [];
