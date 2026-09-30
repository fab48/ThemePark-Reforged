// Le moteur lisible : les fonctions du jeu réécrites à la main, qui remplacent une à une leur
// transcription mécanique.
//
// Chaque module exporte `reecritures`, une liste d'entrées { adresse, nom, fn, arguments }.
// `installer` les pose dans le module transcrit ; la transcription reste disponible comme
// référence, et `moteur/node/verifier.mjs` rejoue la même partie avec et sans elles pour prouver
// qu'elles font exactement la même chose.

import { Etat } from './etat.js';
import * as carteModule from './carte.js';
import * as ecranModule from './ecran.js';
import * as traceurModule from './traceur.js';
import * as dessinCarteModule from './dessin-carte.js';
import * as objetsModule from './objets.js';
import * as presentationModule from './presentation.js';
import * as visiteursModule from './visiteurs.js';
import * as visiteursOutilsModule from './visiteurs-outils.js';
import * as visiteursEtatsAModule from './visiteurs-etats-a.js';
import * as visiteursEtatsBModule from './visiteurs-etats-b.js';
import * as personnelModule from './personnel.js';
import * as attractionsModule from './attractions.js';
import * as vehiculesModule from './vehicules.js';
import * as simulationOutilsModule from './simulation-outils.js';
import * as simulationModule from './simulation.js';
import * as economieModule from './economie.js';
import * as concurrentsModule from './concurrents.js';
import * as finAnneeModule from './fin-annee.js';
import * as dessinObjetsModule from './dessin-objets.js';
import * as dessinAttractionsModule from './dessin-attractions.js';
import * as interfaceParcModule from './interface-parc.js';
import * as boucleModule from './boucle.js';
import * as panneauModule from './panneau.js';
import * as ecransAchatModule from './ecrans-achat.js';
import * as fenetresModule from './fenetres.js';
import * as construireModule from './construire.js';
import * as ecranParcModule from './ecran-parc.js';
import * as evenementsModule from './evenements.js';
import * as titreModule from './titre.js';
import * as ecransGestionModule from './ecrans-gestion.js';
import * as bibliothequeModule from './bibliotheque.js';
import * as sourisJeuModule from './souris-jeu.js';
import * as diversModule from './divers.js';
import * as outilsModule from './outils.js';
import * as voyousModule from './voyous.js';
import * as entretienModule from './entretien.js';
import * as negociationsModule from './negociations.js';
import * as carteDuParcModule from './carte-du-parc.js';
import * as nouveautesModule from './nouveautes.js';
import * as monorailModule from './monorail.js';
import * as failliteModule from './faillite.js';
import * as sonDuJeuModule from './son-du-jeu.js';
import * as sosPilotesModule from './sos-pilotes.js';
import * as sosBruitagesModule from './sos-bruitages.js';
import * as sosMusiqueModule from './sos-musique.js';
import * as menusModule from './menus.js';
import * as ecransInfosModule from './ecrans-infos.js';
import * as voiesModule from './voies.js';
import * as cataloguesModule from './catalogues.js';
import * as posesModule from './poses.js';
import * as dialoguesModule from './dialogues.js';
import * as amorcageModule from './amorcage.js';
import * as systemeModule from './systeme.js';
import * as runtimeModule from './runtime.js';
import * as sortieModule from './sortie.js';
import * as introductionModule from './intro.js';
import { reecritures as demarrage } from './demarrage.js';
import { HORS_D_USAGE, FonctionHorsDUsage } from './hors-d-usage.js';

// Les modules terminés, par leur espace de noms : leurs listes `reecritures` et `enAttente`.
const ESPACES = {
  carte: carteModule, ecran: ecranModule, traceur: traceurModule, dessinCarte: dessinCarteModule,
  objets: objetsModule, presentation: presentationModule, visiteurs: visiteursModule,
  visiteursOutils: visiteursOutilsModule, visiteursEtatsA: visiteursEtatsAModule,
  visiteursEtatsB: visiteursEtatsBModule, personnel: personnelModule,
  attractions: attractionsModule, vehicules: vehiculesModule,
  simulationOutils: simulationOutilsModule, simulation: simulationModule, economie: economieModule,
  concurrents: concurrentsModule, finAnnee: finAnneeModule, dessinObjets: dessinObjetsModule,
  dessinAttractions: dessinAttractionsModule, interfaceParc: interfaceParcModule,
  boucle: boucleModule, panneau: panneauModule, ecransAchat: ecransAchatModule,
  fenetres: fenetresModule, divers: diversModule, construire: construireModule,
  ecranParc: ecranParcModule, evenements: evenementsModule, titre: titreModule,
  ecransGestion: ecransGestionModule, bibliotheque: bibliothequeModule, sourisJeu: sourisJeuModule,
  menus: menusModule, voies: voiesModule, poses: posesModule, systeme: systemeModule,
  ecransInfos: ecransInfosModule, catalogues: cataloguesModule, dialogues: dialoguesModule,
  amorcage: amorcageModule, runtime: runtimeModule, sortie: sortieModule, outils: outilsModule,
  voyous: voyousModule, entretien: entretienModule, negociations: negociationsModule,
  carteDuParc: carteDuParcModule, nouveautes: nouveautesModule, monorail: monorailModule,
  faillite: failliteModule, sonDuJeu: sonDuJeuModule, sosPilotes: sosPilotesModule,
  sosBruitages: sosBruitagesModule, sosMusique: sosMusiqueModule,
};

export const MODULES = Object.fromEntries(Object.entries(ESPACES).map(([nom, m]) => [nom, m.reecritures]));

// Toutes les listes `enAttente` : des fonctions réécrites que le rejeu sur la transcription ne sait pas
// éprouver (voir chaque module). Le moteur autonome les pose avec le reste (poserLeProgramme).
export const EN_ATTENTE = Object.values(ESPACES).flatMap((m) => m.enAttente ?? []);

// Celles des fonctions en attente qu'un vérificateur peut poser sur la transcription, quand on les
// désigne par leur nom ou par `enAttente` (le banc d'essai, moteur/node/eprouver.mjs) : pas celles que
// l'hôte rend ou enveloppe, ni celles qui ne rendent pas la main.
const NON_EPROUVABLES = new Set([0x89F90, 0x821BE, 0x7D775, 0x87274, 0x828C4]);
export const EPROUVABLES_EN_ATTENTE = EN_ATTENTE.filter((r) => r.fn && !NON_EPROUVABLES.has(r.adresse));

// Les fonctions que l'hôte pose lui-même (machine.js, installerRemplacements) : le cœur d'int386x,
// qui saute à l'interruption par un 'ret', et _chain_intr, qui remonte à l'ancien gestionnaire.
const RENDUES_PAR_L_HOTE = new Set([0x89F90, 0x821BE]);

// Le programme lisible entier, pour le moteur autonome (moteur/hote/processeur.js) : toutes les
// réécritures, celles qui sont en attente, puis le démarrage et les routines d'interruption
// (demarrage.js), qui l'emportent sur les versions en attente de leurs adresses. Sans transcription
// dessous, une fonction absente de cette liste n'existe pas : l'appeler arrête le jeu en la nommant
// (hors-d-usage.js dit pourquoi elle manque). Rend le nombre de fonctions posées.
export function poserLeProgramme(machine, T) {
  const jeu = contexte(machine, T);
  const pris = new Set(demarrage.map((r) => r.adresse));
  const poses = new Set();
  const poser = (r) => { T.remplacer(r.adresse, enveloppe(jeu, T, r)); poses.add(r.adresse); };
  for (const liste of Object.values(MODULES)) for (const r of liste) poser(r);
  for (const r of EN_ATTENTE) {
    if (!r.fn || RENDUES_PAR_L_HOTE.has(r.adresse) || pris.has(r.adresse)) continue;
    poser(r);
  }
  for (const r of demarrage) poser(r);
  for (const [adresse, raison] of HORS_D_USAGE) {
    if (poses.has(adresse) || RENDUES_PAR_L_HOTE.has(adresse)) continue;
    T.remplacer(adresse, () => { throw new FonctionHorsDUsage(adresse, raison); });
  }
  return poses.size;
}

// L'introduction (INTRO.EXE, que le lanceur de 1994 exécutait avant le jeu), transportée dans la
// disposition mémoire de MAIN.EXE (moteur/hote/image-intro.js, outils/intro.py) : ses fonctions
// partagées avec le jeu sont celles du code lisible, à leurs adresses ; ses fonctions propres sont
// réécrites dans intro.js, à leur adresse d'INTRO.EXE plus 0x800000. Trois d'entre elles sont, octet
// pour octet, des fonctions du jeu (seules leurs adresses de retour diffèrent), que la carte n'a pas
// appariées : elles prennent la réécriture de leur jumelle, à leur adresse. Ce sont la seconde copie de
// la lecture d'un morceau de palette des films (0x1098B ; MAIN.EXE n'en a qu'une, 0x60F92),
// l'installation d'un pilote de musique (0x16A78, 0x8418C : son indice replié, outils/intro.py
// RELOCATIONS_DECALEES, lui donne une autre forme) et la fermeture des flots en sortant (0x22FB4,
// 0x904C5, que seule la table des routines de fin désigne).
const COPIES_DE_L_INTRODUCTION = [[0x81098B, 0x60F92], [0x816A78, 0x8418C], [0x822FB4, 0x904C5]];
function reecrituresDeLIntroduction() {
  const toutes = new Map([...Object.values(MODULES).flat(), ...EN_ATTENTE].map((r) => [r.adresse, r]));
  return [
    ...introductionModule.reecritures,
    ...COPIES_DE_L_INTRODUCTION.map(([copie, jumelle]) => ({ ...toutes.get(jumelle), adresse: copie })),
  ];
}

// Le programme lisible de l'introduction, pour le moteur autonome : celui du jeu (poserLeProgramme),
// puis les fonctions propres de l'introduction. Rend le nombre de fonctions posées.
export function poserLIntroduction(machine, T) {
  const n = poserLeProgramme(machine, T);
  const jeu = contexte(machine, T);
  const propres = reecrituresDeLIntroduction();
  for (const r of propres) T.remplacer(r.adresse, enveloppe(jeu, T, r));
  return n + propres.length;
}

// Les mêmes, sur la transcription transportée de l'introduction (travail/transcrit/intro-main.js) :
// le code lisible du jeu, là où l'introduction a la même fonction — celui qui attend encore d'être
// éprouvé compris : l'introduction en exerce —, puis celui de l'introduction, que `choix` peut
// restreindre à des noms. Pour la preuve (moteur/node/verifier-intro.mjs --lisible).
export function installerLIntroduction(machine, T, choix = null) {
  const jeu = contexte(machine, T);
  const poses = [];
  const poser = (r) => { T.remplacer(r.adresse, enveloppe(jeu, T, r)); poses.push(r.nom); };
  for (const r of [...Object.values(MODULES).flat(), ...EPROUVABLES_EN_ATTENTE]) if (T.fonction(r.adresse)) poser(r);
  for (const r of reecrituresDeLIntroduction()) if (!choix || choix.includes(r.nom)) poser(r);
  return poses;
}

// Les modules en cours d'écriture : écrits mais pas encore prouvés ensemble, ils ne sont pas
// installés par défaut ; les vérificateurs peuvent les désigner un par un (--modules).
// Un module en cours d'écriture s'y importe par son espace de noms (import * as x from …, puis
// x.reecritures ?? []) : tant qu'il n'exporte pas encore sa liste, le reste se charge quand même.
export const EN_COURS = {};

// Le contexte passé à chaque fonction réécrite : l'état nommé du jeu, la mémoire, et de quoi
// appeler les fonctions qui ne sont pas encore réécrites.
export function contexte(machine, T) {
  const jeu = {
    machine,
    T,
    etat: new Etat(machine),
    m8: machine.m8,
    dv: machine.dv,
    // Appelle une fonction du jeu (réécrite ou non) avec la convention d'origine : arguments
    // empilés de droite à gauche, nettoyés par l'appelant, résultat dans eax.
    appeler(adresse, ...args) {
      T.sauver();
      const R = T.R;
      let esp = R.esp;
      for (let k = args.length - 1; k >= 0; k--) { esp = (esp - 4) | 0; machine.w32(esp, args[k]); }
      esp = (esp - 4) | 0;
      machine.w32(esp, 0xFFFFFFF0);          // adresse de retour fictive : jamais lue
      R.esp = esp;
      T.charger();
      T.appeler(adresse);                    // le 'ret' de la fonction retire l'adresse de retour
      T.sauver();
      R.esp = (R.esp + 4 * args.length) | 0; // l'appelant nettoie les arguments
      const resultat = R.eax;
      T.charger();
      return resultat;
    },
    // Appelle une fonction comme l'original le faisait, à la même hauteur de pile et avec la même
    // adresse de retour : `pile`, le pointeur de pile de l'original juste avant qu'il empile les
    // arguments (son point d'entrée, moins ses registres sauvés et ses variables) ; `retour`,
    // l'adresse de l'instruction qui suit son `call`. Pour les appels dont l'appelée, ou ce qui la
    // suit, relit les restes de pile : la mise à jour des objets du parc (0x21681) appelle ainsi
    // la routine de chaque objet (docs/journal-des-essais.md § 5.6).
    appelerDepuis(retour, pile, adresse, ...args) {
      T.sauver();
      const R = T.R;
      const avant = R.esp;
      let esp = pile | 0;
      for (let k = args.length - 1; k >= 0; k--) { esp = (esp - 4) | 0; machine.w32(esp, args[k]); }
      esp = (esp - 4) | 0;
      machine.w32(esp, retour);
      R.esp = esp;
      T.charger();
      T.appeler(adresse);
      T.sauver();
      R.esp = avant;
      const resultat = R.eax;
      T.charger();
      return resultat;
    },
  };
  return jeu;
}

// Convention des fonctions du jeu (Watcom, pile) : arguments empilés de droite à gauche, nettoyés
// par l'appelant, résultat dans eax, adresse de retour au sommet de la pile en entrée.
// `options.empoisonner` : après chaque réécriture, brouiller la pile qu'elle laisse (voir
// `empoisonnee`) ; le vérificateur s'en sert pour prouver que ces restes ne comptent pas.
// `options.graine` choisit le motif du brouillage.
export function installer(machine, T, choix = null, options = {}) {
  const jeu = contexte(machine, T);
  const poses = [];
  const poison = { graine: options.graine ?? 1 };
  // sans choix, tous les modules terminés ; avec un choix, les modules en cours peuvent y figurer
  const candidats = choix ? { ...MODULES, ...EN_COURS, enAttente: EPROUVABLES_EN_ATTENTE } : MODULES;
  for (const [nomModule, liste] of Object.entries(candidats)) {
    for (const r of liste) {
      if (choix && !choix.includes(r.nom) && !choix.includes(nomModule)) continue;
      const f = enveloppe(jeu, T, r);
      T.remplacer(r.adresse, options.empoisonner ? empoisonnee(machine, T, r, f, poison) : f);
      poses.push(r.nom);
    }
  }
  return poses;
}

// Les restes de pile. Ce qu'une fonction laisse sous son point d'entrée est en principe mort, et une
// réécriture, qui n'a pas de variables locales en mémoire et appelle à d'autres hauteurs, y laisse
// autre chose que l'original. Cinq cas sont traités ici (docs/journal-des-essais.md § 5.6), et
// cette fonction rend, pour un appel donné, la plage [début, fin[ qu'il faut y laisser comme
// l'original — ou null :
//
//  - la mise à jour des objets du parc, 0x21681 (code de 0x21681 à 0x2223A), appelle la routine de
//    chaque objet à la même hauteur de pile, et l'état 4 des visiteurs, 0x223C1, relit comme sa
//    variable [ebp-8], qu'il n'a pas écrite, l'octet qu'y a laissé la routine précédente : 24 octets
//    sous l'entrée d'une routine à un argument, 20 pour deux (0x78943, appelée pour les boutiques) ;
//  - l'écran titre, 0x1A836, écrit ses lignes par 0x3F49E puis appelle la liste à choix, 0x576FE,
//    qui relit comme sa variable [ebp-0x14], jamais écrite, l'octet bas de l'`ebp` que 0x3F49E avait
//    sauvé 16 octets sous son entrée : la ligne dont le numéro l'égale s'affiche comme choisie ;
//  - la même fiche, rappelée du même écran en 0x1AD59, suit un bruitage, 0x80C80 (appelé en
//    0x1AD4A avec deux arguments) : l'octet qu'elle relit tombe 28 octets sous l'entrée du
//    bruitage, plus bas que ce qu'il écrit sans carte son ; il le laisse passer, et la réécriture
//    aussi. Avec une carte son, les fonctions du pilote qu'il appelle l'écrasent : --son y échappe ;
//  - la boucle du parc (0x11C45) appelle de la même hauteur la vue (0x13B9A, retour 0x11E7A), la
//    barre de menus (0x50651, 0x11E88), la barre d'outils (0x4DE1A, un argument, 0x11E90), puis la
//    barre des messages (0x5CBDB, 0x11E98). Celle-ci, sur le chemin de la remarque expirée (le
//    CONSEILLER allumé), relit comme sa variable [ebp-0x18], jamais écrite, le mot 40 octets sous
//    son entrée. L'original y a laissé, dans l'ordre : l'ebx que 0x1B837 sauve en entrant (appelée
//    par 0x13B9A, retour 0x13BEB, 4 octets sous son entrée), que 0x13B9A avait chargé de la hauteur
//    d'une rangée ; l'octet bas du retour du trait, variable [ebp-0x18] de 0x50651 ; l'adresse
//    d'une variable de 0x4DE1A, sa [ebp-0x14]. Ces quatre octets, 40 sous l'entrée des deux
//    premières, 36 sous celle de la troisième, 4 sous celle de 0x1B837, doivent être ceux de
//    l'original : les réécritures ouvrent le cadre de l'original (moteur/jeu/cadre.js) et y laissent
//    les mêmes valeurs ;
//  - la boucle du parc appelle aussi, de la même hauteur, le calendrier (0x12B1F, retour 0x11D25 ou
//    0x1208D) puis la mise à jour des objets (0x21681). Quand aucune routine d'objet appelée avant
//    l'état 4 des visiteurs n'a écrit l'octet qu'il relit (le premier cas), c'est celui du
//    calendrier, 0x58 octets sous son entrée : l'ebx que le hasard (0x18B92) y a sauvé en entrant,
//    4 octets sous la sienne, au dernier appel du pas, le tirage de l'usure de l'herbe (en 0x139A8,
//    retour 0x139AD), fait du fond du cadre du calendrier. Cet ebx est le diviseur du test du mois,
//    0x3E8, ou, en fin de mois, le pointeur des comptes du joueur ([0xD3814]). Le calendrier
//    (economie.js) ouvre le cadre de l'original et appelle ce hasard par `appelerDepuis`, avec cet
//    ebx ; le hasard (simulation-outils.js) laisse l'ebx de son appelant sous son entrée.
const MISE_A_JOUR_DES_OBJETS = [0x21681, 0x2223B];
const TEXTE_DE_L_ECRAN_TITRE = 0x1AA96;   // le retour de l'appel de 0x3F49E dans 0x1A836
const BRUITAGE_DE_L_ECRAN_TITRE = 0x1AD4F; // le retour de l'appel de 0x80C80 avant la fiche du joueur
// Les appels qui précèdent la barre des messages, et la hauteur, sous leur entrée, du mot qu'elle relit.
const AVANT_LA_BARRE_DES_MESSAGES = new Map([
  [0x11E7A, 40],   // 0x13B9A, la vue
  [0x11E88, 40],   // 0x50651, la barre de menus
  [0x11E90, 36],   // 0x4DE1A, la barre d'outils
  [0x13BEB, 4],    // 0x1B837, le dessin de la carte, appelé par 0x13B9A
]);
// Le calendrier, appelé par la boucle du parc avant la mise à jour des objets, et son tirage de l'herbe.
const PAS_DU_CALENDRIER = [0x11D25, 0x1208D];   // les retours des deux appels de 0x12B1F
const TIRAGE_DE_L_HERBE = 0x139AD;               // le retour de l'appel de 0x18B92 en 0x139A8
export function resteRelu(machine, basPile, r) {
  const retour = machine.r32(basPile);
  const octet = (a) => [a, a + 1];
  if (retour >= MISE_A_JOUR_DES_OBJETS[0] && retour < MISE_A_JOUR_DES_OBJETS[1]) {
    return octet(basPile + 4 * (r.arguments || 0) - 28);
  }
  if (retour === TEXTE_DE_L_ECRAN_TITRE) return octet(basPile - 16);
  if (retour === BRUITAGE_DE_L_ECRAN_TITRE) return octet(basPile - 28);
  if (retour === PAS_DU_CALENDRIER[0] || retour === PAS_DU_CALENDRIER[1]) return octet(basPile - 0x58);
  if (retour === TIRAGE_DE_L_HERBE) return octet(basPile - 4);
  const sous = AVANT_LA_BARRE_DES_MESSAGES.get(retour);
  if (sous !== undefined) return [basPile - sous, basPile - sous + 4];
  return null;
}

// Une réécriture suivie d'un brouillage : les 512 octets sous son point d'entrée reçoivent un motif
// pseudo-aléatoire, le même d'une partie à l'autre, sauf le reste relu (`resteRelu`). Si la partie
// reste identique à celle de la transcription, rien ne dépend des autres restes de la réécriture.
function empoisonnee(machine, T, r, f, poison) {
  return () => {
    T.sauver();
    const e = T.R.esp >>> 0;
    T.charger();
    const dansLaPile = e >= PILE_BAS && e < PILE_HAUT;
    const [debut, fin] = (dansLaPile && resteRelu(machine, e, r)) || [0, 0];
    f();
    if (!dansLaPile) return;
    for (let a = Math.max(PILE_BAS, e - 0x200); a < e; a++) {
      poison.graine = (Math.imul(poison.graine, 1103515245) + 12345) >>> 0;
      if (a < debut || a >= fin) machine.m8[a] = poison.graine >>> 24;
    }
  };
}

// Mode comparaison : à chaque appel, on exécute la transcription, on note l'état obtenu, on
// restaure l'état de départ, on exécute la réécriture, et on compare. L'état, c'est la mémoire du
// jeu (les zones ci-dessous) et celui de l'hôte (Machine.instantane : l'heure, les entrées, la carte
// vidéo). Coûteux, mais c'est la preuve appel par appel.
// La pile vit au-dessus de 0xE1400 (les donnees statiques s'arretent a 0xE133A) : ce que la
// transcription y laisse sous le pointeur de pile est de la memoire morte, qu'on ne compare pas.
export const PILE_BAS = 0xE1400, PILE_HAUT = 0xE2340;

// Zones de mémoire comparées : les variables du jeu, la fenêtre de la mémoire vidéo, la zone de
// données du BIOS (compteur de la minuterie, tampon du clavier), et les deux tampons d'image
// (surface de dessin [0xDE5BC] et fond [0xD3B98]), pris au plus large, 640x480. Une réécriture qui
// écrit ailleurs le déclare par son champ `zones`, ou demande `memoire: 'entiere'`.
// S'y ajoutent, pour toutes les fonctions, deux sortes de mémoire du tas que le jeu relit
// (docs/journal-des-essais.md § 5.8) :
//  - les tampons du curseur, 64x64 au plus : ceux où il garde les pixels qu'il recouvre ([0xDE564]
//    et [0xDE554]) et celui de son motif ([0xDE590]). Le gestionnaire de souris écrit dans les
//    premiers à chaque interruption, donc pendant n'importe quelle fonction qu'un mouvement de la
//    souris interrompt ; le second change avec la forme du pointeur. Non restaurés, la seconde
//    exécution partirait des pixels sauvés par la première, et effacerait le curseur avec ;
//  - les six banques d'images, de la table à sa fin (amorcage.js) : une fonction qui recharge une
//    table la reloge, et le relogement n'est pas idempotent (en 320x200, il double les dimensions).
export const TAMPONS_DU_CURSEUR = [0xDE564, 0xDE554, 0xDE590];
const TAILLE_TAMPON_DU_CURSEUR = 64 * 64;
const BANQUES_D_IMAGES = [[0xD3BB8, 0xD3B88], [0xD3B90, 0xD3B34], [0xD3B58, 0xD3B60], [0xD3B84, 0xD3B9C],
  [0xD3B64, 0xD3B70], [0xD3B54, 0xD3B5C]];
const TAILLE_BANQUE_MAX = 0x40000;
export function zonesComparees(machine) {
  const surface = machine.r32(0xDE5BC), fond = machine.r32(0xD3B98);
  const zones = [[0xB0000, PILE_BAS], [0xA0000, 0xB0000], [0x400, 0x500]];
  for (const t of [surface, fond]) if (t > 0x100000 && t < 0x4000000 - 307200) zones.push([t, t + 307200]);
  for (const a of TAMPONS_DU_CURSEUR) {
    const t = machine.r32(a) >>> 0;
    if (t >= 0x100000 && t + TAILLE_TAMPON_DU_CURSEUR <= machine.m8.length) zones.push([t, t + TAILLE_TAMPON_DU_CURSEUR]);
  }
  for (const [table, fin] of BANQUES_D_IMAGES) {
    const t = machine.r32(table) >>> 0, f = machine.r32(fin) >>> 0;
    if (t >= 0x100000 && f > t && f - t <= TAILLE_BANQUE_MAX && f <= machine.m8.length) zones.push([t, f]);
  }
  return zones;
}

// Toute la mémoire en usage, hors la pile : le tas compris, où vivent les objets du jeu. Pour les
// fonctions qui y écrivent (0x1B837 fait avancer le texte des enseignes défilantes dans l'objet
// de l'attraction) : sans restauration du tas, la réécriture repartirait d'un état déjà modifié
// par la transcription. Plus lent — une cinquantaine de mégaoctets par copie — : à réserver aux
// fonctions peu appelées, par le champ `memoire: 'entiere'` de la réécriture.
export function memoireEntiere(machine) {
  return [[0, PILE_BAS], [PILE_HAUT, machine.tasLibre]];
}

// Une plage de la mémoire est-elle identique à sa copie ? Sous Node, par la comparaison native des
// tampons : chaque appel comparé relit près d'un mégaoctet, et la boucle octet par octet en
// JavaScript faisait l'essentiel du temps de la comparaison.
function memesOctets(m8, debut, copie) {
  const Tampon = globalThis.Buffer;
  if (Tampon) {
    return Tampon.from(m8.buffer, m8.byteOffset + debut, copie.length)
      .equals(Tampon.from(copie.buffer, copie.byteOffset, copie.length));
  }
  for (let a = 0; a < copie.length; a++) if (m8[debut + a] !== copie[a]) return false;
  return true;
}

export function installerCompare(machine, T, choix = null, zonesFixes = null, signaler = console.log, echantillon = 1,
  toujoursEntiere = false) {
  const jeu = contexte(machine, T);
  const poses = [];
  let differences = 0;
  // Les copies de la mémoire et de l'état de l'hôte sont allouées une fois pour toutes : en allouer
  // près d'un mégaoctet à chaque appel coûtait dix fois plus cher que de les remplir. Un jeu de
  // copies par niveau d'imbrication, car une fonction comparée peut en appeler une autre qui l'est
  // aussi.
  const reserves = [];
  let profondeur = 0;
  const copier = (zones, copies) => zones.map(([a, b], k) => {
    if (!copies[k] || copies[k].length !== b - a) copies[k] = new Uint8Array(b - a);
    copies[k].set(machine.m8.subarray(a, b));
    return copies[k];
  });

  // Les fichiers lus pendant un appel. Une fonction qui charge un fichier l'écrit où le jeu le lui
  // dit, souvent dans le tas, hors des zones comparées : la vente aux enchères (0x7B73E) remet en
  // sortant data/mblk-0.dat dans la réserve [0xD3BA0], où la seconde exécution trouvait déjà le
  // fichier au lieu des images de la salle. Chaque lecture du DOS (int 21h, 3Fh) est donc notée,
  // avec les octets qu'elle va écraser, dans le journal de chaque exécution en cours (une par niveau
  // d'imbrication) : entre les deux exécutions, ces octets sont remis, et la plage est comparée.
  // Sauf dans la pile : une lecture dans un tampon local est morte au retour (la réécriture lit
  // ailleurs), et la pile a déjà son traitement, restaurée entière, comparée au-dessus des arguments.
  const journaux = [];
  const lire = machine.lire.bind(machine);
  machine.lire = (R) => {
    const o = journaux.length ? machine.handles.get(R.ebx & 0xFFFF) : null;
    if (o) {
      const debut = ((R.edx >>> 0) + machine.base(R.ds)) >>> 0;
      const n = Math.max(0, Math.min(R.ecx >>> 0, o.f.taille() - o.pos, machine.m8.length - debut));
      const morceaux = [[debut, Math.min(debut + n, PILE_BAS)], [Math.max(debut, PILE_HAUT), debut + n]];
      for (const [a, b] of morceaux) {
        if (b <= a) continue;
        const lecture = { debut: a, fin: b, avant: machine.m8.slice(a, b), nom: o.nom };
        for (const j of journaux) j.push(lecture);
      }
    }
    return lire(R);
  };
  const executer = (f, journal) => {
    journaux.push(journal);
    try { f(); } finally { journaux.pop(); }
  };

  // Les zones qu'une réécriture déclare écrire, calculées d'après ses arguments (ou ses registres).
  function zonesDeclarees(r) {
    const R = T.R, esp = R.esp >>> 0;
    const brutes = r.convention === 'registres'
      ? r.zones(jeu, R)
      : r.zones(jeu, ...Array.from({ length: r.arguments || 0 }, (_, k) => machine.r32(esp + 4 + 4 * k)));
    return brutes.filter(([a, b]) => a >= 0 && b > a && b <= machine.m8.length);
  }

  function comparerUnAppel(r, origine, lisible, reserve) {
    T.sauver();
    const entiere = toujoursEntiere || r.memoire === 'entiere';
    const zones = zonesFixes ? [...zonesFixes] : (entiere ? memoireEntiere(machine) : zonesComparees(machine));
    if (r.zones && !entiere) zones.push(...zonesDeclarees(r));
    const avantR = { ...T.R };
    const avant = copier(zones, reserve.avant);
    reserve.hoteAvant = machine.instantane(reserve.hoteAvant);
    // La pile. Sous l'adresse de retour, elle est morte. Les arguments, que l'appelant retire après
    // l'appel, aussi — mais une fonction peut s'en servir comme de variables (0x20BEB décrémente son
    // compte, 0x1C22A parcourt sa liste en place) : la pile est donc restaurée entière entre les deux
    // exécutions. Au-dessus des arguments commence la pile de l'appelant, vivante (ses variables, et
    // ce qu'un paramètre de sortie y désigne) : elle est comparée.
    // Sous l'adresse de retour, les restes : les deux exécutions partent des mêmes (512 octets), et
    // ce que relira une autre fonction (`resteRelu`) est comparé.
    const basPile = T.R.esp >>> 0;
    const avecPile = basPile >= PILE_BAS && basPile < PILE_HAUT;
    const vivante = basPile + 4 + Math.max(4 * (r.arguments || 0), r.nettoie || 0);
    const basRestes = Math.max(PILE_BAS, basPile - 0x200);
    const pileAvant = avecPile ? copier([[basRestes, PILE_HAUT]], reserve.pileAvant)[0] : null;
    const reste = avecPile ? resteRelu(machine, basPile, r) : null;
    const lus = [];
    executer(origine, lus);
    const resteTranscrit = reste ? machine.m8.slice(reste[0], reste[1]) : null;
    T.sauver();
    const apresR = { ...T.R };
    const apres = copier(zones, reserve.apres);
    const lusApres = lus.map((l) => machine.m8.slice(l.debut, l.fin));
    const pileApres = avecPile && vivante < PILE_HAUT ? copier([[vivante, PILE_HAUT]], reserve.pileApres)[0] : null;
    reserve.hoteApres = machine.instantane(reserve.hoteApres);
    // les fichiers lus d'abord, de la dernière lecture à la première ; les zones par-dessus
    for (let k = lus.length - 1; k >= 0; k--) machine.m8.set(lus[k].avant, lus[k].debut);
    zones.forEach(([a], k) => machine.m8.set(avant[k], a));
    if (pileAvant) machine.m8.set(pileAvant, basRestes);
    machine.restaurer(reserve.hoteAvant);
    Object.assign(T.R, avantR);
    T.charger();
    executer(lisible, []);
    T.sauver();
    const ecarts = [];
    lus.forEach((l, k) => {
      if (ecarts.length >= 7 || memesOctets(machine.m8, l.debut, lusApres[k])) return;
      const ref = lusApres[k];
      for (let a = 0; a < ref.length; a++) {
        if (machine.m8[l.debut + a] !== ref[a]) {
          ecarts.push(`${l.nom} lu en ${l.debut.toString(16)}, ${(l.debut + a).toString(16)}: lisible ${machine.m8[l.debut + a]} / transcrit ${ref[a]}`);
          break;
        }
      }
    });
    if (reste && !memesOctets(machine.m8, reste[0], resteTranscrit)) {
      for (let a = reste[0]; a < reste[1]; a++) {
        if (machine.m8[a] !== resteTranscrit[a - reste[0]]) {
          ecarts.push(`reste de pile relu, ${a.toString(16)}: lisible ${machine.m8[a]} / transcrit ${resteTranscrit[a - reste[0]]}`);
          break;
        }
      }
    }
    if (pileApres && !memesOctets(machine.m8, vivante, pileApres)) {
      for (let a = 0; a < pileApres.length; a++) {
        if (machine.m8[vivante + a] !== pileApres[a]) {
          ecarts.push(`pile de l'appelant, ${(vivante + a).toString(16)}: lisible ${machine.m8[vivante + a]} / transcrit ${pileApres[a]}`);
          break;
        }
      }
    }
    zones.forEach(([debut], k) => {
      const ref = apres[k];
      if (memesOctets(machine.m8, debut, ref)) return;
      for (let a = 0; a < ref.length && ecarts.length < 7; a++) {
        if (machine.m8[debut + a] !== ref[a]) {
          ecarts.push(`${(debut + a).toString(16)}: lisible ${machine.m8[debut + a]} / transcrit ${ref[a]}`);
        }
      }
    });
    // La convention du jeu ne préserve que ebx, esi, edi, ebp (et la pile) : eax, ecx et edx
    // sont des registres de travail, que la transcription laisse dans n'importe quel état.
    // eax n'est comparé que si la fonction réécrite annonce rendre un résultat.
    const compares = r.registresCompares || ['ebx', 'esi', 'edi', 'ebp', 'esp'];
    if (r.retour && !compares.includes('eax')) compares.unshift('eax');
    for (const k of compares) {
      if ((T.R[k] | 0) !== (apresR[k] | 0)) ecarts.push(`${k}: lisible ${T.R[k] >>> 0} / transcrit ${apresR[k] >>> 0}`);
    }
    // L'état de l'hôte : l'heure (une image présentée la fait avancer), les entrées, la carte vidéo.
    reserve.hoteLisible = machine.instantane(reserve.hoteLisible);
    for (const e of machine.ecartsInstantanes(reserve.hoteLisible, reserve.hoteApres)) ecarts.push(`${e} (lisible / transcrit)`);
    r.appels = (r.appels || 0) + 1;
    if (ecarts.length) {
      r.divergences = (r.divergences || 0) + 1;
      if (differences++ < 8) signaler(`${r.nom} (0x${r.adresse.toString(16)}) diverge : ` + ecarts.join(' ; '));
    }
  }

  for (const [nomModule, liste] of Object.entries(choix ? { ...MODULES, ...EN_COURS, enAttente: EPROUVABLES_EN_ATTENTE } : MODULES)) {
    for (const r of liste) {
      if (choix && !choix.includes(r.nom) && !choix.includes(nomModule)) continue;
      const origine = T.originale(r.adresse);
      const lisible = enveloppe(jeu, T, r);
      let compteur = 0;
      T.remplacer(r.adresse, () => {
        if (echantillon > 1 && (compteur++ % echantillon) !== 0) { lisible(); r.appels = (r.appels || 0) + 1; return; }
        const reserve = reserves[profondeur] || (reserves[profondeur] = { avant: [], apres: [], pileAvant: [], pileApres: [] });
        profondeur++;
        try {
          comparerUnAppel(r, origine, lisible, reserve);
        } finally {
          profondeur--;
        }
      });
      poses.push(r.nom);
    }
  }
  return poses;
}

// Trois conventions d'appel :
//  - 'pile' (par défaut) : celle du code C du jeu, arguments empilés, résultat dans eax ;
//  - 'registres' : celle des routines écrites en assembleur (le traceur de sprites, les copies),
//    qui reçoivent leurs paramètres dans les registres ; la fonction reçoit alors l'objet des
//    registres R, le lit et l'écrit elle-même. Dans ces deux cas l'enveloppe fait le 'ret' ;
//  - 'brute' : les routines qui ne rendent pas la main par un 'ret' (le point d'entrée, les
//    gestionnaires d'interruption, demarrage.js) ; elles reçoivent R et tiennent seules la pile.
function enveloppe(jeu, T, r) {
  if (r.convention === 'brute') {
    return () => {
      T.sauver();
      r.fn(jeu, T.R);
      T.charger();
    };
  }
  if (r.convention === 'registres') {
    return () => {
      T.sauver();
      const R = T.R, esp = R.esp >>> 0;
      r.fn(jeu, R);
      R.esp = (esp + 4 + (r.nettoie || 0)) | 0;
      T.charger();
    };
  }
  const n = r.arguments || 0;
  return () => {
    T.sauver();
    const R = T.R, esp = R.esp >>> 0;
    const args = [];
    for (let k = 0; k < n; k++) args.push(jeu.machine.r32(esp + 4 + 4 * k));
    const resultat = r.fn(jeu, ...args);
    if (resultat !== undefined) R.eax = resultat | 0;
    R.esp = (esp + 4) | 0;            // le 'ret' : on retire l'adresse de retour
    T.charger();
  };
}
