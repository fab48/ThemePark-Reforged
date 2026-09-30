// La table des objets agrandie, et plus de visiteurs (reglages.js : grandeTableDesObjets,
// plusDeVisiteurs). Hors du jeu d'origine : réglages éteints, ces fonctions rendent les valeurs de
// 1994, et le jeu reste celui que les vérificateurs comparent.
//
// Le jeu de 1994 range tout ce qui vit dans le parc — visiteurs, attractions, kiosques, boutiques,
// personnel, le bus, chaque morceau de voie et chaque wagon — dans une seule table d'enregistrements
// de 200 octets : la ressource « *THING » (fiche 0xB1323, sa taille en 0xB1369), réservée par 0x104A3
// pour 1 200 enregistrements, en en demandant dix de moins tant que la mémoire manque. L'objet 0
// n'existe pas, et 0x12452 pose la fin en dur, [0xD3B10] + 0x3A8B8, qui laisse aussi le dernier de
// côté : 1 198 emplacements. Les visiteurs n'en prennent jamais les 100 derniers (0x2845A), gardés
// pour construire, et le bus arrive vide quand les présents passeraient 800 (0x67CD4). Un grand parc
// finit par tout remplir : sur la partie de Fabien, 885 visiteurs et 195 morceaux de voie (dont 93 du
// monorail, bâti dans la réserve) occupaient les 1 198 emplacements. Rien ne le dit : la pose d'un
// rail (0x29835), d'une attraction, d'une boutique, les wagons d'une attraction qui ouvre (0x41936)
// cherchent un emplacement libre, n'en trouvent pas, et renoncent en silence — l'aperçu, lui, montre
// la pièce.
//
// Agrandie, la table a 4 000 enregistrements (800 000 octets), et garde sa forme : l'objet 0 et le
// dernier laissés de côté, 3 998 emplacements. Les visiteurs y restent aux 1 098 premiers, comme en
// 1994 ; avec plus de visiteurs, aux 2 399 premiers, et le bus amène du monde jusqu'à 1 600 présents
// au lieu de 800. Il reste toujours au moins 1 599 emplacements pour construire. Les présents ne sont
// qu'une partie des visiteurs (ceux qui repartent, ceux du bus n'y sont plus ou pas encore) : 684
// présents pour 885 visiteurs sur la partie de Fabien ; à 1 600 présents, on peut compter quelque
// 2 100 visiteurs, sous les 2 399 emplacements. Rien ne déborde à ces nombres : les sommes que le
// relevé des statistiques fait sur 16 bits (la faim et la soif des visiteurs, 0x68E34) restent petites
// (des octets proches de 0), et les compteurs des présents sont des mots.
//
// Tout ce qui parcourt la table s'arrête à sa fin, [0xD3B78] : rien d'autre à changer. Les numéros
// d'objet sont des mots (signés dans les listes des cases, où un négatif désigne un décor) : 4 000 y
// tient largement.
//
// LA SAUVEGARDE (0x2DF12, 0x2E035) garde le format de 1994 : ses 53 blocs, dont les 240 000 octets des
// 1 200 premiers enregistrements. Ce qui est au-delà est écrit après : la marque « OBJ+ », le nombre
// d'enregistrements (mot long), puis les enregistrements eux-mêmes, du 1 200ᵉ au dernier qui porte
// quelque chose. Sans rien au-delà, rien n'est ajouté : le fichier est exactement celui de 1994. Au
// chargement, la table est vidée au-delà du 1 199ᵉ enregistrement (il y reste sinon la partie d'avant),
// puis la suite y est relue, si le fichier en a une. Une sauvegarde qui a une suite ne se charge pas
// dans la table de 1994 : ses objets au-delà y manqueraient.

import { reglages } from './reglages.js';

const TAILLE_OBJET = 200;
const OBJETS = 0xD3B10;                  // pointeur : le début de la table
const TAILLE_RESERVEE = 0xB1369;         // mot long : la taille de « *THING » (fiche 0xB1323, +0x46)
const ENTREES_DE_1994 = 1200;
const OCTETS_DE_1994 = ENTREES_DE_1994 * TAILLE_OBJET;   // 0x3A980, ce que 0x19EEE efface
const FIN_DE_1994 = 0x3A8B8;             // 1 199 × 200 : la fin, posée en dur par 0x12452
const ENTREES_AGRANDIES = 4000;
const VISITEURS_DE_1994 = 1098;          // la fin moins les 100 emplacements gardés (0x2845A)
const VISITEURS_AGRANDIS = 2399;
const PRESENTS_DE_1994 = 800;            // 0x67CD4
const PRESENTS_AGRANDIS = 1600;
const MARQUE_DE_LA_SUITE = 0x2B4A424F;   // « OBJ+ », lu en petit-boutiste

const long = (jeu, a) => jeu.dv.getUint32(a, true);
const tailleReservee = (jeu) => long(jeu, TAILLE_RESERVEE);

// La table a-t-elle été réservée plus grande qu'en 1994 ? C'est la taille réservée qui le dit, pas le
// réglage : la table ne change plus une fois le programme en place.
export const tableAgrandie = (jeu) => tailleReservee(jeu) > OCTETS_DE_1994;

// 0x104A3 : le nombre d'enregistrements à demander d'abord.
export const enregistrementsDemandes = () => (reglages.grandeTableDesObjets ? ENTREES_AGRANDIES : ENTREES_DE_1994);

// 0x12452 : la fin de la table, depuis son début.
export function finDeLaTable(jeu, debut) {
  return (debut + (tableAgrandie(jeu) ? tailleReservee(jeu) - TAILLE_OBJET : FIN_DE_1994)) >>> 0;
}

// 0x19EEE : ce qu'une nouvelle partie efface, en octets.
export const octetsAEffacer = (jeu) => (tableAgrandie(jeu) ? tailleReservee(jeu) : OCTETS_DE_1994);

// 0x2845A : l'adresse où s'arrête la recherche d'un emplacement pour un visiteur neuf ; `deCeJeu`,
// celle du jeu de 1994 (la fin moins 100 emplacements).
export function limiteDesVisiteurs(jeu, deCeJeu) {
  if (!tableAgrandie(jeu)) return deCeJeu;
  const places = reglages.plusDeVisiteurs ? VISITEURS_AGRANDIS : VISITEURS_DE_1994;
  return (long(jeu, OBJETS) + (places + 1) * TAILLE_OBJET) >>> 0;
}

// 0x67CD4 : au-delà de combien de présents le bus arrive vide.
export const plafondDesPresents = (jeu) =>
  (reglages.plusDeVisiteurs && tableAgrandie(jeu) ? PRESENTS_AGRANDIS : PRESENTS_DE_1994);

// 0x2DF12, après les 53 blocs : la suite de la table. `ecrire(adresse, octets)` écrit dans le fichier
// ouvert ; `tampon`, 8 octets de mémoire du jeu libres le temps de l'écriture.
export function ecrireLaSuite(jeu, ecrire, tampon) {
  if (!tableAgrandie(jeu)) return;
  const debut = long(jeu, OBJETS) + OCTETS_DE_1994;
  let fin = long(jeu, OBJETS) + tailleReservee(jeu);
  while (fin > debut && !jeu.m8.subarray(fin - TAILLE_OBJET, fin).some((o) => o !== 0)) fin -= TAILLE_OBJET;
  if (fin === debut) return;
  jeu.dv.setUint32(tampon, MARQUE_DE_LA_SUITE, true);
  jeu.dv.setUint32(tampon + 4, (fin - debut) / TAILLE_OBJET, true);
  ecrire(tampon, 8);
  ecrire(debut, fin - debut);
}

// 0x2E035, après les 53 blocs : vider la table au-delà du 1 199ᵉ enregistrement, puis y relire la
// suite, si le fichier en a une. `lire(adresse, octets)` rend le nombre d'octets lus.
export function lireLaSuite(jeu, lire, tampon) {
  if (!tableAgrandie(jeu)) return;
  const debut = long(jeu, OBJETS) + OCTETS_DE_1994;
  const place = tailleReservee(jeu) - OCTETS_DE_1994;
  jeu.m8.fill(0, debut, debut + place);
  if ((lire(tampon, 8) | 0) !== 8 || long(jeu, tampon) !== MARQUE_DE_LA_SUITE) return;
  const octets = Math.min(long(jeu, tampon + 4) * TAILLE_OBJET, place);
  if (octets > 0) lire(debut, octets);
}
