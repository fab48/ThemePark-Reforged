// La fenêtre de débogage : ce que la page montre de l'état du jeu, lu en direct dans sa mémoire.
//
// Ce module sert aux deux côtés. La page (moteur/web/debogage.js) y prend la description des
// onglets — le nom français de chaque valeur, son adresse et le renvoi à docs/retro-ingenierie.md —
// et le travailleur (moteur/web/travailleur.js) y prend `debogage`, qui fabrique les instantanés et
// applique les commandes. Rien ne tourne tant que la fenêtre est fermée : le travailleur ne fait
// alors qu'un test (`debogage.onglet`), et le jeu garde sa cadence.
//
// Tout est lu, rien n'est écrit, sauf par les commandes, marquées dans la page comme hors du jeu
// d'origine : chacune n'écrit que des variables que la documentation établit (une valeur, jamais un
// appel de fonction du jeu). Les adresses et les champs viennent de moteur/jeu/etat.js.

import { ADRESSES as A, TAILLES as T, FICHE_DU_JOUEUR as FJ, FICHE_DU_PARC as FP, COMPTES as CO } from './etat.js';
import { reglages } from './reglages.js';

export const DOC = 'docs/retro-ingenierie.md';
const hex = (v, n = 0) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(n, '0');

// --- la lecture de la mémoire -----------------------------------------------------------------------
// Bornée : hors de la mémoire, on lit 0 (un pointeur encore nul avant l'entrée dans un parc).
function lecteur(m) {
  const m8 = m.m8, dv = m.dv, n = m8.length;
  const ok = (a, k) => a >= 0 && a + k <= n;
  return {
    u8: (a) => (ok(a, 1) ? m8[a] : 0),
    s8: (a) => (ok(a, 1) ? (m8[a] << 24) >> 24 : 0),
    u16: (a) => (ok(a, 2) ? dv.getUint16(a, true) : 0),
    s16: (a) => (ok(a, 2) ? dv.getInt16(a, true) : 0),
    u32: (a) => (ok(a, 4) ? dv.getUint32(a, true) : 0),
    s32: (a) => (ok(a, 4) ? dv.getInt32(a, true) : 0),
    texte(a, max = 32) {
      let s = '';
      for (let k = 0; k < max && ok(a + k, 1); k++) {
        const c = m8[a + k];
        if (c === 0) break;
        s += c >= 32 && c < 127 ? String.fromCharCode(c) : '·';
      }
      return s;
    },
  };
}

// Les pointeurs du moment : la fiche du joueur, ses comptes, son parc, la table des objets.
function contexte(m) {
  const L = lecteur(m);
  const fj = L.u32(A.ficheDuJoueur), co = L.u32(A.comptesDuJoueur), fp = L.u32(A.parcDuJoueur);
  const objets = L.u32(A.objetsDuParc), fin = L.u32(A.finDesObjets);
  const nombre = fin > objets ? Math.min(4000, ((fin - objets) / T.objet) | 0) : 0;
  return { m, L, fj, co, fp, objets, nombre, pas: L.u32(A.pasDeSimulation),
    charge: fj !== 0 && co !== 0 && fp !== 0 && nombre > 1 };
}
const adresseObjet = (c, n) => (c.objets + T.objet * n) >>> 0;

// --- les noms ---------------------------------------------------------------------------------------
const NIVEAUX = ['MATERNELLE (SIMPLE)', 'SIMULATION (SIM.)', 'BUSINESS (GLOBALE)'];
const HUMEURS = ['HEUREUX', 'NORMAUX', 'RALEURS'];
const FORCES = ['FAIBLES', 'MOYENS', 'FORTS'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre',
  'octobre', 'novembre', 'décembre'];
const JOURS_PAR_PAS = [32, 35, 32, 33, 32, 33, 32, 32, 33, 32, 33, 32];   // la table 0xB7E06, ecran-parc.js
// La date du jeu d'un pas de simulation, comme le panneau (ecran-parc.js) : 1 000 pas par mois, 12 000
// par an ; le jour, (pas % 1 000) / (0xB7E06[mois] + 1) + 1 — de 1 à 31 en juillet, pas 32.
function dateDuJeu(pas) {
  const mois = ((pas % 12000) / 1000) | 0;
  const jour = (((pas % 1000) / (JOURS_PAR_PAS[mois] + 1)) | 0) + 1;
  return `${jour} ${MOIS[mois]}, année ${((pas / 12000) | 0) + 1}`;
}
const VITESSES = { [-2]: 'lent', 0: 'normal', 1: 'rapide', 20: 'ultra-rapide' };
const ECRANS = { 0: 'la vue du parc', 0x32: 'négociation du personnel', 0x44: 'la bourse',
  0x48: 'les nouveautés', 0x4A: '« démolir ? »', 0x4C: 'négociation des fournisseurs',
  0x4E: 'les recherches', 0x50: "l'écran titre", 0x52: "l'entrepôt", 0x54: 'le bus', 0x62: 'les enchères',
  0x64: 'la faillite', 0x1C: "la fiche d'un employé" };
export const TYPES = { 2: 'visiteur', 4: 'attraction', 6: 'kiosque', 0x1C: 'kiosque (2d)', 8: 'employé',
  0xA: 'boutique', 0xE: 'véhicule', 0x12: 'morceau de voie', 0x14: 'entrée, panneau ou objet animé',
  0x18: 'installation', 0x1A: 'voyou' };
const ETATS_DES_VISITEURS = { 2: 'descend du bus', 4: 'au guichet', 6: 'égaré', 8: 'se promène',
  0xA: 'avance dans une file', 0xC: 'fait la queue', 0xE: 'à bord', 0x10: 'descend', 0x12: 'sur le circuit',
  0x14: 'va vers une boutique', 0x16: "au jeu d'adresse", 0x18: 'ressort', 0x1A: "s'arrête un instant",
  0x1C: 'dans le bus', 0x1E: "va vers l'arrêt du bus", 0x20: 'sans chemin', 0x22: 'attend le bus',
  0x34: 'fait avancer la file', 0x36: 'au volant', 0x38: 'attend au comptoir', 0x3A: 'est servi',
  0x3C: 'montre son humeur', 0x3E: 'vomit', 0x40: 'va vers la sortie', 0x48: "nuage d'explosion",
  0x4A: 'entre sans file', 0x4C: 'entre aux toilettes', 0x4E: 'aux toilettes' };
const ETATS_DU_PERSONNEL = { 2: 'amuseur : flâne', 4: 'amuseur : va vers des visiteurs', 6: 'amuseur : amuse',
  8: 'mécanicien : cherche', 0xA: 'mécanicien : en route', 0xC: 'mécanicien', 0xE: 'mécanicien',
  0x10: 'mécanicien', 0x12: 'mécanicien : répare', 0x14: 'mécanicien : rouvre',
  0x16: "agent : embauché", 0x18: 'agent : les allées', 0x1A: 'agent : cherche une allée',
  0x1C: 'agent : balaie', 0x1E: 'agent : tond', 0x22: 'agent : marche', 0x24: 'agent : attend',
  0x26: 'agent : entre aux toilettes', 0x28: 'agent : nettoie les toilettes', 0x2A: 'porté par le joueur',
  0x2C: 'agent : tournée désignée', 0x2E: 'agent : tournée tracée', 0x30: 'agent : suit sa tournée',
  0x32: 'agent : lance sa tournée', 0x34: 'gardien : patrouille', 0x36: 'gardien : arrête',
  0x38: 'gardien : relâche', 0x3A: 'gréviste : va manifester', 0x3C: 'gréviste : manifeste',
  0x3E: 'gréviste : reprend', 0x3F: 'amuseur effrayé' };
const ETATS_DES_VOYOUS = { 1: 'suit la route', 2: 'passe le portique', 3: 'rôde', 4: 'longe une file',
  5: 'use une attraction', 6: 'hors des allées', 7: 'relâché', 8: 'arrêté', 9: 'pille une boutique',
  0xA: "regarde fuir l'amuseur" };
const MODES = { 2: 'à tours', 4: 'à bouées', 6: 'à train', 0x1C: 'à voitures', 0x1E: 'spectacle',
  0x24: 'château envolé', 0x26: 'avions en feu' };
const PHASES = ['au repos', 'départ', 'en marche', 'arrêt', 'fin', '?', 'incident', 'incident'];
const FAMILLES = { 1: 'manger', 2: 'boire', 4: 'souvenirs', 8: "jeu d'adresse" };
const METEOS = { 0: 'beau', 1: 'pluie', 2: 'neige', 4: 'orage' };
export const DOMAINES = ['améliorer les attractions', 'nouvelles attractions', 'nouvelles boutiques',
  'formation du personnel', 'nouvelles installations', 'amélioration des installations'];

// --- les formats ------------------------------------------------------------------------------------
const nb = (v) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : String(v));
const argent = (v) => nb(v);
const ouiNon = (v) => (v ? 'oui' : 'non');
const nomDe = (table, v) => (table[v] !== undefined ? `${table[v]} (${v})` : `? (${v})`);
const pourcent = (a, b) => (b ? `${Math.round((100 * a) / b)} %` : '—');

// ======================================================================================================
// Les valeurs : cle, nom, où (adresse), renvoi, lecture. `ou` et `doc` font la bulle de la page.
// ======================================================================================================
const v = (cle, nom, ou, doc, lire) => ({ cle, nom, ou, doc, lire });
const fj = (off) => `fiche du joueur ${hex(off)} ([${hex(A.ficheDuJoueur)}])`;
const fp = (off) => `fiche du parc ${hex(off)} ([${hex(A.parcDuJoueur)}])`;
const co = (off) => `comptes ${hex(off)} ([${hex(A.comptesDuJoueur)}])`;
const glob = (a) => hex(a);

// l'attrait du prix d'entrée, 0x6804A (visiteurs-outils.js) : j, a, attrait
function attraitDuPrix(c) {
  const { L } = c;
  if (L.s32(c.fp + FP.attraitMoyen) <= 3) return { j: 0, a: 0, attrait: 0 };
  const a = L.u8(c.fp + FP.capaciteDesBus) + L.s8(c.fp + FP.reputation);
  const valeur = ((L.u32(c.fp + FP.richesse) >>> 1) + L.u32(c.fp + FP.attraitMoyen)) | 0;
  const j = Math.imul(L.u16(c.fp + FP.referenceDuPrix), valeur) >>> 7;
  const ecart = (L.u16(c.fp + FP.prixDEntree) - j) | 0;
  return { j, a, attrait: j ? (a - ((Math.imul(ecart, a) / j) | 0)) | 0 : 0 };
}
// le seuil de l'arrivée des voyous, economie.js (faireVenirLesVoyous)
function seuilDesVoyous(c) {
  const { L, fp: p } = c;
  let s = (L.s8(p + FP.reputation) - L.s16(p + FP.mystereDesVoyous) - L.s16(p + FP.voyous)
    - (L.u16(p + FP.installations) >> 3) - L.u16(p + FP.casesDeLac) + ((L.s32(p + FP.usureMoyenne) / 8) | 0)
    + (L.u16(p + FP.prixDEntree) >> 5)) | 0;
  return Math.max(0x20, Math.min(0x100, s));
}
// les chances d'une négociation, economie.js (negocier), sur 2 048
function chancesDeNegociation(c) {
  const { L, fp: p } = c;
  const facteur = L.s16(A.facteurDeLAnnee), rep = L.s8(p + FP.reputation);
  return {
    personnel: L.s16(p + FP.renvois) * 8 + L.u16(p + FP.personnel) + rep * 8 + facteur * 2 + (L.u8(p + FP.capaciteDesBus) >> 3),
    fournisseurs: (L.u8(p + FP.buvettesAManger) + L.u8(p + FP.buvettesABoire)) * 8 + rep * 8 + facteur * 2
      + (L.u16(p + FP.capaciteDeLEntrepot) >> 5),
  };
}
// le test du code de triche, 0x2EA62 : chaque lettre du surnom décalée à gauche de son rang
function testDeTriche(c) {
  const { L } = c;
  const obtenu = [], attendu = [];
  for (let k = 0; k < 5; k++) {
    obtenu.push((L.u8(A.surnom + k) << k) & 0xFF);
    attendu.push(L.u8(A.codeDeTriche + k));
  }
  const h = (t) => t.map((x) => x.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  return { obtenu: h(obtenu), attendu: h(attendu), passe: obtenu.every((x, k) => x === attendu[k]) };
}
const humeurDuParc = (c) => {
  const { L } = c;
  const h = L.s32(c.fp + FP.humeur), haut = L.s16(c.fp + FP.seuilContent), bas = L.s16(c.fp + FP.seuilMecontent);
  const quoi = h >= haut + 300 ? 'ravi' : h >= haut + 50 ? 'très content' : h >= haut ? 'content'
    : h > bas ? 'neutre' : h > bas - 50 ? 'mécontent' : h > bas - 300 ? 'très mécontent' : 'furieux';
  return `${nb(h)} — ${quoi}`;
};

export const ONGLETS = [
  { id: 'parc', titre: 'Le parc', groupes: [
    { titre: 'Le temps', valeurs: [
      v('pas', 'pas de simulation', glob(A.pasDeSimulation), '§ 10.1', (c) => nb(c.pas)),
      v('date', 'date (jour, mois, année)', `${glob(A.pasDeSimulation)} ; mois ${co(CO.mois)}`, '§ 10.1, § 11.8', (c) => dateDuJeu(c.pas)),
      v('finAnnee', "pas jusqu'à la fin d'année", '12 000 − pas mod 12 000', '§ 10.12', (c) => nb(12000 - (c.pas % 12000))),
      v('vitesse', 'vitesse', glob(A.vitesseJeu), '§ 11.1', (c) => nomDe(VITESSES, c.L.s16(A.vitesseJeu))),
      v('pause', 'en pause', glob(A.enPause), '§ 11.8', (c) => ouiNon(c.L.u8(A.enPause))),
      v('ecran', 'écran ouvert', glob(A.ecranCourant), '§ 3, § 11.2', (c) => nomDe(ECRANS, c.L.u16(A.ecranCourant))),
      v('images', 'images du jeu, temps virtuel', 'machine.images, machine.us (moteur/hote/machine.js)', 'architecture.md',
        (c) => `${nb(c.m.images)} images, ${(c.m.us / 1e6).toFixed(1)} s`),
    ] },
    { titre: "L'argent", valeurs: [
      v('solde', 'solde en banque', fj(FJ.solde), '§ 7', (c) => argent(c.L.s32(c.fj + FJ.solde))),
      v('engage', 'somme engagée (attractions pas encore payées)', fj(FJ.engage), '§ 7, § 10.3', (c) => argent(c.L.s32(c.fj + FJ.engage))),
      v('affiche', 'solde affiché (solde − engagé)', `${fj(FJ.solde)} − ${hex(FJ.engage)}`, '§ 11.8', (c) => argent(c.L.s32(c.fj + FJ.solde) - c.L.s32(c.fj + FJ.engage))),
      v('pret', 'prêt', fj(FJ.pret), '§ 7', (c) => argent(c.L.s32(c.fj + FJ.pret))),
      v('plafondPret', 'plafond du prêt (actions × cours)', `${fp(FP.actionsEmises)} × ${hex(FP.cours)}`, '§ 10.8, § 11.13',
        (c) => argent(c.L.u16(c.fp + FP.actionsEmises) * c.L.s32(c.fp + FP.cours))),
      v('variation', 'variation du solde sur le mois', fj(FJ.variationDuMois), '§ 11.8', (c) => argent(c.L.s32(c.fj + FJ.variationDuMois))),
      v('recetteEntrees', 'recette des entrées du mois', co(CO.recetteDesEntrees), '§ 10.8', (c) => argent(c.L.s32(c.co + CO.recetteDesEntrees))),
      v('billet', "prix d'entrée", fp(FP.prixDEntree), '§ 10.2', (c) => argent(c.L.u16(c.fp + FP.prixDEntree))),
      v('cours', "cours de l'action (ancien)", `${fp(FP.cours)}, ${hex(FP.ancienCours)}`, '§ 11.13',
        (c) => `${nb(c.L.s32(c.fp + FP.cours))} (${nb(c.L.s32(c.fp + FP.ancienCours))})`),
    ] },
    { titre: 'Les visiteurs', valeurs: [
      v('presents', 'visiteurs présents', fp(FP.visiteursPresents), '§ 11.8', (c) => nb(c.L.s16(c.fp + FP.visiteursPresents))),
      v('entrees', 'entrées cumulées', fp(FP.entreesCumulees), '§ 10.8', (c) => nb(c.L.u16(c.fp + FP.entreesCumulees))),
      v('humeur', 'humeur du parc (le visage)', `${fp(FP.humeur)}, seuils ${hex(FP.seuilContent)} et ${hex(FP.seuilMecontent)}`, '§ 11.8', humeurDuParc),
      v('repartition', 'mécontents / neutres / contents', `${co(CO.mecontents)}, ${hex(CO.neutres)}, ${hex(CO.contents)}`, '§ 10.8',
        (c) => `${c.L.u16(c.co + CO.mecontents)} / ${c.L.u16(c.co + CO.neutres)} / ${c.L.u16(c.co + CO.contents)}`),
      v('reputation', 'réputation (vraisemblablement)', fp(FP.reputation), '§ 10.14, § 10.15', (c) => nb(c.L.s8(c.fp + FP.reputation))),
      v('dechets', 'déchets sur les allées', fp(FP.dechets), '§ 10.5', (c) => nb(c.L.u16(c.fp + FP.dechets))),
      v('bus', 'bus : charge / capacité (niveau, plafond)', `${co(CO.chargeDuBus)} ; ${fp(FP.capaciteDesBus)}, ${hex(FP.niveauDesBus)}, ${hex(FP.plafondDesBus)}`, '§ 10.6',
        (c) => `${c.L.u8(c.co + CO.chargeDuBus)} / ${c.L.u8(c.fp + FP.capaciteDesBus)} (${c.L.u8(c.fp + FP.niveauDesBus)}, ${c.L.u8(c.fp + FP.plafondDesBus)})`),
      v('ouvert', 'parc ouvert', fp(FP.ouvert), '§ 11.1', (c) => ouiNon(c.L.u8(c.fp + FP.ouvert))),
    ] },
    { titre: 'La partie', valeurs: [
      v('nom', 'votre nom, surnom, parc', `${glob(A.votreNom)}, ${glob(A.surnom)}, ${glob(A.nomDuParc)}`, '§ 11.4',
        (c) => `${c.L.texte(A.votreNom)} / ${c.L.texte(A.surnom, 16)} / ${c.L.texte(A.nomDuParc)}`),
      v('niveau', 'niveau de jeu', glob(A.niveauDeJeu), '§ 7, § 11.4', (c) => nomDe(NIVEAUX, c.L.u8(A.niveauDeJeu))),
      v('humeurVisiteurs', 'visiteurs (difficulté)', glob(A.humeurDesVisiteurs), '§ 11.4', (c) => nomDe(HUMEURS, c.L.u8(A.humeurDesVisiteurs))),
      v('depart', 'niveau de départ', glob(A.niveauDeDepart), '§ 11.4', (c) => nomDe(['200 000', '150 000', '100 000'], c.L.u8(A.niveauDeDepart))),
      v('concurrents', 'concurrents (force)', `${glob(A.nombreDeConcurrents)}, ${glob(A.forceDesConcurrents)}`, '§ 10.11, § 11.4',
        (c) => `${c.L.u8(A.nombreDeConcurrents)} (${nomDe(FORCES, c.L.u8(A.forceDesConcurrents))})`),
      v('attractions', 'attractions (retirées par une explosion)', `${fp(FP.attractions)}, ${hex(FP.explosees)}`, '§ 10.16',
        (c) => `${c.L.u8(c.fp + FP.attractions)} (${c.L.u8(c.fp + FP.explosees)})`),
      v('personnel', 'personnel : total, mécaniciens, agents, amuseurs', `${fp(FP.personnel)}, ${hex(FP.mecaniciens)}, ${hex(FP.agentsDEntretien)}, ${hex(FP.amuseurs)}`, '§ 10.5',
        (c) => [FP.personnel, FP.mecaniciens, FP.agentsDEntretien, FP.amuseurs].map((o) => c.L.u16(c.fp + o)).join(', ')),
      v('tutoriel', 'étape du tutoriel', glob(A.etapeDuTutoriel), '§ 11.11', (c) => { const e = c.L.s8(A.etapeDuTutoriel); return e < 0 ? `hors du tutoriel (${e})` : String(e); }),
    ] },
  ] },

  // L'état du parc : ce que la fin d'année évaluera (les trophées, les classements), les grandeurs de
  // la fiche du parc qui le font, et le journal de ce qui les a changées (plus bas, « Le guet »).
  { id: 'etat', titre: 'État du parc', groupes: [
    { titre: 'Le guet', valeurs: [
      v('eDate', 'date du jeu', glob(A.pasDeSimulation), '§ 10.1', (c) => `${dateDuJeu(c.pas)} (pas ${nb(c.pas)})`),
      v('eAnnee', "l'année que compterait la fin d'année", 'pas / 12 000 + 1 ; les moyennes par an divisent par année + 1', '§ 10.12',
        (c) => String(anneeEvaluee(c.pas))),
      v('eGuet', 'fonctions guettées ; changements notés', 'enveloppes posées sur toutes les fonctions du jeu, fenêtre ouverte', 'architecture.md',
        () => (guet.pose ? `${guet.enveloppes.size} ; ${nb(guet.notes)}` : 'pas encore posées')),
      v('eParc', 'fiche du parc guettée', `0xCF1E0 + 0x250 × mot +2 de la fiche 0 ([${hex(A.fichesDesJoueurs)}])`, '§ 7',
        () => (guet.parc ? hex(guet.parc) : '—')),
    ] },
  ], table: 'etat' },

  { id: 'mecaniques', titre: 'Mécaniques', groupes: [
    { titre: "Le guichet : l'attrait du prix d'entrée (0x6804A)", valeurs: [
      v('prixJuste', 'prix de référence j', `${fp(FP.referenceDuPrix)} × (${hex(FP.richesse)} / 2 + ${hex(FP.attraitMoyen)}) / 128`, '§ 10.2', (c) => nb(attraitDuPrix(c).j)),
      v('a', 'attrait maximal a', `${fp(FP.capaciteDesBus)} + ${hex(FP.reputation)}`, '§ 10.2', (c) => nb(attraitDuPrix(c).a)),
      v('attrait', 'attrait du billet actuel', 'a − (prix − j) × a / j', '§ 10.2', (c) => nb(attraitDuPrix(c).attrait)),
      v('seuilGuichet', "seuil : au-delà, tous entrent ; en deçà, chance attrait / seuil", fp(FP.seuilDuGuichet), '§ 10.2',
        (c) => { const s = c.L.u8(c.fp + FP.seuilDuGuichet), t = attraitDuPrix(c).attrait; return `${s} → ${t >= s ? 'tous entrent' : t <= 0 ? 'personne' : pourcent(t, s)}`; }),
      v('billetLimite', 'billet où ils commencent à hésiter (≈)', 'j + (a − seuil) × j / a', '§ 10.2', (c) => {
        const { j, a } = attraitDuPrix(c), s = c.L.u8(c.fp + FP.seuilDuGuichet);
        return a > 0 ? nb(Math.round(j + ((a - s) * j) / a)) : '—';
      }),
      v('marge', 'marge tolérée sur les prix des boutiques', fp(FP.margeToleree), '§ 10.2', (c) => `${c.L.u16(c.fp + FP.margeToleree)} %`),
      v('coefs', 'humeur : plaisir, besoins, saleté, foule', `${fp(FP.coefPlaisir)}, ${hex(FP.coefBesoins)}, ${hex(FP.coefSalete)}, ${hex(FP.coefFoule)}`, '§ 10.2',
        (c) => [FP.coefPlaisir, FP.coefBesoins, FP.coefSalete, FP.coefFoule].map((o) => c.L.u8(c.fp + o)).join(', ')),
      v('seuils', 'seuils content / mécontent', `${fp(FP.seuilContent)}, ${hex(FP.seuilMecontent)}`, '§ 10.2',
        (c) => `${c.L.s16(c.fp + FP.seuilContent)} / ${c.L.s16(c.fp + FP.seuilMecontent)}`),
    ] },
    { titre: 'Les visiteurs, en moyenne (objets de type 2 entrés)', valeurs: [
      v('vNombre', 'visiteurs (objets) : entrés / pas encore', 'objets de type 2, +0x4F ≠ −1', '§ 10.2', (c) => { const s = statsVisiteurs(c); return `${s.entres} / ${s.dehors}`; }),
      v('vBonheur', 'contentement moyen (min, max)', 'visiteur +0x54', '§ 10.2', (c) => { const s = statsVisiteurs(c); return `${nb(s.moy.bonheur)} (${nb(s.min)}, ${nb(s.max)})`; }),
      v('vFaim', 'estomac moyen ; affamés (< 1)', 'visiteur +0x50', '§ 10.2', (c) => { const s = statsVisiteurs(c); return `${s.moy.estomac.toFixed(1)} ; ${s.affames}`; }),
      v('vSoif', 'soif moyenne ; assoiffés (< 1)', 'visiteur +0x51', '§ 10.2', (c) => { const s = statsVisiteurs(c); return `${s.moy.soif.toFixed(1)} ; ${s.assoiffes}`; }),
      v('vArgent', 'argent moyen ; fauchés (< 400)', 'visiteur +0x6F', '§ 10.2', (c) => { const s = statsVisiteurs(c); return `${nb(s.moy.argent)} ; ${s.fauches}`; }),
      v('vFatigue', 'fatigue moyenne ; épuisés (> 8 000)', 'visiteur +0x82', '§ 10.2', (c) => { const s = statsVisiteurs(c); return `${nb(s.moy.fatigue)} ; ${s.epuises}`; }),
      v('vEnnui', "ennui moyen, (pas − +0x75) >> 9", 'visiteur +0x75', '§ 10.2', (c) => nb(statsVisiteurs(c).moy.ennui)),
      v('vFait', 'attractions faites, en moyenne', 'visiteur +0x81', '§ 10.2', (c) => statsVisiteurs(c).moy.faites.toFixed(1)),
      v('vEtats', 'ce qu\'ils font', 'visiteur +0x0C', '§ 10.2', (c) => statsVisiteurs(c).etats),
    ] },
    { titre: 'Le hasard (0x18B92)', valeurs: [
      v('hasard', 'état du générateur', glob(A.etatDuHasard), '§ 10.1', (c) => hex(c.L.u32(A.etatDuHasard), 8)),
      v('prochainTirage', 'prochain tirage (0 à 32 767)', '(état × 0xBB40E62D >> 8) & 0x7FFF', '§ 10.1',
        (c) => nb((Math.imul(c.L.u32(A.etatDuHasard), 0xBB40E62D) >>> 8) & 0x7FFF)),
      v('passages', 'passages de la mise à jour des objets', glob(A.passagesDesObjets), '§ 10.1', (c) => nb(c.L.u32(A.passagesDesObjets))),
    ] },
    { titre: 'La météo', valeurs: [
      v('meteo', 'temps', glob(A.meteo), '§ 11.1, economie.js', (c) => nomDe(METEOS, c.L.u8(A.meteo))),
      v('meteoDuree', "durée de l'intempérie (cesse après 1 000 ; au-delà de 200, 1 chance sur 16 tous les 64 pas)", glob(A.debutDeLIntemperie), 'economie.js',
        (c) => (c.L.u8(A.meteo) ? nb((c.pas - c.L.u32(A.debutDeLIntemperie)) | 0) : '—')),
      v('vent', 'vent', glob(A.vent), '§ 11.19', (c) => nb(c.L.s8(A.vent))),
      v('intemperies', "intempéries de l'année (4 au plus)", glob(A.intemperiesDeLAnnee), 'economie.js', (c) => nb(c.L.u8(A.intemperiesDeLAnnee))),
    ] },
    { titre: 'Les voyous (§ 10.14)', valeurs: [
      v('voyous', 'voyous dans le parc (4 au plus)', fp(FP.voyous), '§ 10.14', (c) => nb(c.L.s16(c.fp + FP.voyous))),
      v('voyousProchain', 'prochain tirage possible au pas', `${co(CO.dernierTirageDesVoyous)} + 12 000 ; après la 4e année`, '§ 10.14',
        (c) => { const p = Math.max(c.L.u32(c.co + CO.dernierTirageDesVoyous) + 12001, 48001); return `${nb(p)}${c.L.u8(A.niveauDeJeu) === 0 ? ' (jamais au niveau 0)' : ''}`; }),
      v('voyousSeuil', 'chance au tirage (sur 512, de 32 à 256)', 'réputation − +0xDA − voyous − installations/8 − lac + usure/8 + billet/32', '§ 10.14',
        (c) => { const s = seuilDesVoyous(c); return `${s} (${pourcent(s + 1, 512)})`; }),
      v('usureMoyenne', 'usure moyenne des attractions', fp(FP.usureMoyenne), 'economie.js', (c) => nb(c.L.s32(c.fp + FP.usureMoyenne))),
    ] },
    { titre: 'Les négociations et la grève (§ 10.15)', valeurs: [
      v('greve', 'grève en cours', co(CO.greve), '§ 10.15', (c) => ouiNon(c.L.u8(c.co + CO.greve))),
      v('ratees', 'séances ratées : personnel, fournisseurs (≠ 0 : livraisons suspendues)', `${co(CO.negociationPersonnel)}, ${hex(CO.negociationFournisseurs)}`, '§ 10.15',
        (c) => `${c.L.u8(c.co + CO.negociationPersonnel)}, ${c.L.u8(c.co + CO.negociationFournisseurs)}`),
      v('chances', 'chances si elles peuvent venir (sur 2 048) : personnel, fournisseurs', 'economie.js, negocier', '§ 10.15',
        (c) => { const k = chancesDeNegociation(c); return `${k.personnel}, ${k.fournisseurs}${c.pas <= 36000 ? ' (pas avant la 4e année)' : ''}`; }),
      v('indices', 'indices des salaires et des prix (100 au départ)', `${fp(FP.indiceDesSalaires)}, ${hex(FP.indiceDesPrix)}`, '§ 10.15',
        (c) => `${c.L.u16(c.fp + FP.indiceDesSalaires)}, ${c.L.u16(c.fp + FP.indiceDesPrix)}`),
      v('dernieres', 'dernières séances (pas) : personnel, fournisseurs', `${fp(FP.derniereSeancePersonnel)}, ${hex(FP.derniereSeanceFournisseurs)}`, '§ 10.15',
        (c) => `${nb(c.L.u32(c.fp + FP.derniereSeancePersonnel))}, ${nb(c.L.u32(c.fp + FP.derniereSeanceFournisseurs))}`),
      v('facteur', "facteur de l'année", glob(A.facteurDeLAnnee), '§ 10.15', (c) => nb(c.L.s16(A.facteurDeLAnnee))),
      v('table', 'en séance : plancher, plafond, offre, demande (dixièmes de point)', `${glob(A.plancher)}, ${glob(A.plafond)}, ${glob(A.offreDuJoueur)}, ${glob(A.demandeAdverse)}`, '§ 10.15',
        (c) => [A.plancher, A.plafond, A.offreDuJoueur, A.demandeAdverse].map((a) => c.L.s32(a)).join(', ')),
      v('obstination', "obstination de l'adversaire (0 à 8, jamais remise à zéro)", glob(A.obstination), '§ 10.15', (c) => nb(c.L.s16(A.obstination))),
    ] },
    { titre: 'La banque', valeurs: [
      v('decouvert', "compteur de découvert ; prêt d'office au-delà de", fj(FJ.compteurDeDecouvert), '§ 7, economie.js',
        (c) => `${c.L.s16(c.fj + FJ.compteurDeDecouvert)} ; ${((c.L.s32(c.fj + FJ.pret) / 256) | 0) + 100}`),
      v('taux', "taux d'intérêt du pays", `0xB7B43 + pays (${fj(FJ.pays)}) × 0x1C`, 'economie.js',
        (c) => `${(c.L.u16(0xB7B43 + c.L.u8(c.fj + FJ.pays) * 0x1C) / 100).toFixed(2)} %`),
    ] },
  ] },

  { id: 'recherche', titre: 'Recherche', groupes: [
    { titre: 'Le budget', valeurs: [
      v('rBudget', 'budget total ; réserve', `${fp(FP.budgetDeRecherche)}, ${hex(FP.reserveDeRecherche)}`, '§ 11.10',
        (c) => `${nb(c.L.u16(c.fp + FP.budgetDeRecherche))} ; ${nb(c.L.u16(c.fp + FP.reserveDeRecherche))}`),
      v('rDecouverte', 'une découverte vient d\'être faite', glob(A.nouvelleDecouverte), '§ 11.8', (c) => ouiNon(c.L.u8(A.nouvelleDecouverte))),
      v('rAuto', 'achat automatique des bus', glob(A.achatDuBusAutomatique), 'economie.js', (c) => ouiNon(c.L.u8(A.achatDuBusAutomatique))),
    ] },
  ], table: 'recherche' },

  { id: 'objets', titre: 'Objets', groupes: [], table: 'objets' },
  { id: 'fiche', titre: 'Fiche', groupes: [], table: 'fiche' },
  { id: 'concurrents', titre: 'Concurrents', groupes: [], table: 'concurrents' },

  { id: 'secrets', titre: 'Secrets', groupes: [
    { titre: 'La triche (§ 7, § 11.1)', valeurs: [
      v('tricheur', 'drapeau tricheur', glob(A.drapeauTricheur), '§ 7', (c) => (c.L.u16(A.drapeauTricheur) ? 'LEVÉ' : 'baissé')),
      v('surnom', 'surnom testé', glob(A.surnom), '§ 7, § 11.4', (c) => c.L.texte(A.surnom, 16) || '(vide)'),
      v('test', 'lettres décalées de leur rang / code attendu', `${glob(A.surnom)} ; ${glob(A.codeDeTriche)}`, '§ 7',
        (c) => { const t = testDeTriche(c); return `${t.obtenu} / ${t.attendu} → ${t.passe ? 'passe' : 'ne passe pas'}`; }),
    ] },
  ], statique: 'secrets' },

  { id: 'commandes', titre: 'Commandes', groupes: [
    { titre: 'Ce que les commandes touchent', valeurs: [
      v('cSolde', 'solde en banque', fj(FJ.solde), '§ 7', (c) => argent(c.L.s32(c.fj + FJ.solde))),
      v('cVitesse', 'vitesse', glob(A.vitesseJeu), '§ 11.1', (c) => nomDe(VITESSES, c.L.s16(A.vitesseJeu))),
      v('cMeteo', 'temps', glob(A.meteo), '§ 11.1', (c) => nomDe(METEOS, c.L.u8(A.meteo))),
      v('cPoints', 'points de recherche des six domaines', fp(FP.points), '§ 11.10',
        (c) => [0, 1, 2, 3, 4, 5].map((d) => c.L.s16(c.fp + FP.points + 2 * d)).join(', ')),
      v('cUsure', 'usure maximale des attractions', 'attraction +0x2E', '§ 10.3',
        (c) => { let u = 0; pourChaque(c, 4, (o) => { u = Math.max(u, c.L.u16(o + 0x2E)); }); return nb(u); }),
      v('cTricheur', 'drapeau tricheur', glob(A.drapeauTricheur), '§ 7', (c) => (c.L.u16(A.drapeauTricheur) ? 'LEVÉ' : 'baissé')),
    ] },
  ], statique: 'commandes' },
];

// ======================================================================================================
// Les parcours d'objets
// ======================================================================================================
function pourChaque(c, type, f) {
  for (let n = 1; n < c.nombre; n++) {
    const o = adresseObjet(c, n);
    if (c.L.u8(o + 4) === type) f(o, n);
  }
}

// Les moyennes des visiteurs, calculées une fois par instantané.
function statsVisiteurs(c) {
  if (c.visiteurs) return c.visiteurs;
  const { L } = c;
  const somme = { bonheur: 0, estomac: 0, soif: 0, argent: 0, fatigue: 0, ennui: 0, faites: 0 };
  const etats = new Map();
  let entres = 0, dehors = 0, affames = 0, assoiffes = 0, fauches = 0, epuises = 0, min = Infinity, max = -Infinity;
  pourChaque(c, 2, (o) => {
    const e = L.u8(o + 0xC);
    if (e === 0x48) return;                        // le nuage d'une explosion
    etats.set(e, (etats.get(e) || 0) + 1);
    if (L.s8(o + 0x4F) === -1) { dehors++; return; }
    entres++;
    const b = L.s16(o + 0x54);
    somme.bonheur += b; min = Math.min(min, b); max = Math.max(max, b);
    somme.estomac += L.s8(o + 0x50); somme.soif += L.s8(o + 0x51);
    somme.argent += L.u16(o + 0x6F); somme.fatigue += L.s16(o + 0x82);
    somme.ennui += ((c.pas - L.u32(o + 0x75)) | 0) >> 9; somme.faites += L.u8(o + 0x81);
    if (L.s8(o + 0x50) < 1) affames++;
    if (L.s8(o + 0x51) < 1) assoiffes++;
    if (L.u16(o + 0x6F) < 400) fauches++;
    if (L.s16(o + 0x82) > 8000) epuises++;
  });
  const moy = {};
  for (const k in somme) moy[k] = entres ? (k === 'estomac' || k === 'soif' || k === 'faites' ? somme[k] / entres : Math.round(somme[k] / entres)) : 0;
  const liste = [...etats].sort((a, b) => b[1] - a[1]).map(([e, k]) => `${ETATS_DES_VISITEURS[e] || hex(e)} ${k}`).join(', ');
  c.visiteurs = { entres, dehors, moy, affames, assoiffes, fauches, epuises,
    min: entres ? min : 0, max: entres ? max : 0, etats: liste || '—' };
  return c.visiteurs;
}

// La longueur d'une file : la tête (+0x1E de l'attraction), puis le +0x1E de chaque visiteur.
function longueurDeFile(c, attraction) {
  let n = 0, k = c.L.u16(attraction + 0x1E);
  while (k > 0 && k < c.nombre && n < 2000) { n++; k = c.L.u16(adresseObjet(c, k) + 0x1E); }
  return n;
}

const nomDAttraction = (c, o) => c.L.texte((A.catalogueDesAttractions + c.L.u16(o + 0x16)) >>> 0, 24);
const ficheDeBoutique = (c, o) => (A.catalogueDesBoutiques + c.L.u16(o + 0x16)) >>> 0;
const nomDeMetier = (c, o) => c.L.texte(A.catalogueDesMetiers + T.metier * c.L.u8(o + 0x59), 16);
const ouverture = (x) => (x === 1 ? 'ouverte' : x === 0 ? 'fermée' : x === -1 ? 'en réparation' : String(x));

// L'état d'usure d'une attraction : le seuil de sa fiche (+0xA8), le double fait exploser.
function sante(usure, seuil) {
  if (!seuil) return '—';
  if (usure > 2 * seuil) return 'EXPLOSERA au prochain départ';
  if (usure > seuil) return 'usée : fumée, musique désaccordée';
  if (usure > 39) return 'appelle un mécanicien';
  return 'saine';
}

// --- les accidents -------------------------------------------------------------------------------------
// L'usure qu'ajoute un départ (0x31ED3, attractions.js, lancerUnTour) : 7 − délai + durée / 256 +
// départs / 6, les départs comptant celui-ci. Le dernier terme croît sans fin : le compte des départs
// (+0x3A) n'est jamais remis à zéro, la réparation ne baisse que l'usure. Une attraction qui a beaucoup
// servi s'use d'autant plus vite : c'est son âge, dans le jeu.
const usureDUnDepart = (L, o, departs) => 7 - L.u8(o + 0x13) + Math.trunc(L.s16(o + 0x34) / 256) + Math.trunc(departs / 6);
// Les départs avant l'explosion (l'usure au-delà du double du seuil, au départ), sans réparation.
function departsAvantExplosion(L, o, seuil) {
  if (!seuil) return '—';
  let usure = L.u16(o + 0x2E), departs = L.u16(o + 0x3A);
  for (let n = 1; n <= 999; n++) {
    departs++;
    usure += usureDUnDepart(L, o, departs);
    if (usure > 2 * seuil) return n === 1 ? 'au prochain' : n;
  }
  return '> 999';
}
// Les accidents qui guettent une attraction, d'après son usure (docs/demandes.md, retour 47) :
//  - les montagnes russes (mode à train) éjectent un passager une fois sur 64 dans chaque courbe prise
//    vite (0x65D25), dès l'usure 18 dans le jeu d'origine (bien avant l'appel du mécanicien, à 40),
//    au seuil de la fiche avec les corrections ;
//  - sur un circuit où l'on se déplace soi-même (le canal du RUBBER TUBING) ou au volant (RACE CAR
//    RIDE), dès l'usure 72, un incident une fois sur 256 − 20 × (6 − délai), par visiteur et par case
//    (0x65E3D) : le visiteur projeté (une fois sur deux), ou la voiture folle qui s'écrase ;
//  - toutes explosent au départ où l'usure dépasse le double du seuil (0x6662D).
function risques(L, o, seuil) {
  const usure = L.u16(o + 0x2E), mode = L.u8(o + 0xC), r = [];
  if (seuil && usure + usureDUnDepart(L, o, L.u16(o + 0x3A) + 1) > 2 * seuil) r.push('explose au prochain départ');
  if (mode === 6 && usure >= (reglages.corrigerLesEjections ? seuil : 18)) r.push('éjections : 1 sur 64 par courbe rapide');
  if ((mode === 4 || mode === 0x1C) && usure >= 72) r.push(`incidents du circuit : 1 sur ${256 - 20 * (6 - L.u8(o + 0x13))} par case`);
  return r.join(' ; ') || '—';
}

// Le journal des accidents, tenu par le travailleur, fenêtre ouverte ou non (enveloppes de 0x6662D,
// l'explosion, et de 0x66189, le visiteur projeté : travailleur.js) : les 60 derniers, et le compte
// par attraction. Hors de la mémoire du jeu : rien n'y est écrit.
const CAUSES = {
  0: 'projeté au tour (0x65F71)',
  1: "éjecté d'un wagon dans une courbe rapide (0x65D25)",
  2: 'wagon sorti de la voie (0x43A33)',
  3: 'projeté du circuit (0x65E3D)',
  5: 'voiture folle, écrasée (0x258D9)',
};
const journalDesAccidents = { liste: [], parAttraction: new Map(), explosion: null };
function noter(m, n, cause, extra = '') {
  const L = lecteur(m);
  const c = contexte(m);
  const o = adresseObjet(c, n);
  const fiche = (A.catalogueDesAttractions + L.u16(o + 0x16)) >>> 0;
  const e = { n, nom: c.L.texte(fiche, 24), cause: cause + extra, usure: `${L.u16(o + 0x2E)} / ${L.u8(fiche + 0xA8)}`,
    reel: performance.now(), pas: c.pas };
  journalDesAccidents.liste.unshift(e);
  if (journalDesAccidents.liste.length > 60) journalDesAccidents.liste.pop();
  const p = journalDesAccidents.parAttraction.get(n) || { total: 0, derniere: '' };
  p.total++; p.derniere = cause;
  journalDesAccidents.parAttraction.set(n, p);
  return e;
}
// Le numéro de l'attraction d'où vient un visiteur projeté : elle-même, ou l'attraction de son wagon ou
// du visiteur source (+0x16).
function attractionDe(m, source) {
  const c = contexte(m);
  if (!c.charge || source < c.objets) return 0;
  const n = ((source - c.objets) / T.objet) | 0;
  if (n <= 0 || n >= c.nombre) return 0;
  const type = c.L.u8(source + 4);
  if (type === 4) return n;
  const k = c.L.u16(source + 0x16);
  return k > 0 && k < c.nombre && c.L.u8(adresseObjet(c, k) + 4) === 4 ? k : 0;
}
export const accidents = {
  // 0x6662D, à l'entrée : l'attraction explose ; les visiteurs qu'elle projette lui sont comptés
  explosion(m, attraction) {
    const n = attractionDe(m, attraction);
    journalDesAccidents.explosion = n ? noter(m, n, 'EXPLOSION : usure au-delà du double du seuil (0x6662D)') : null;
    if (journalDesAccidents.explosion) journalDesAccidents.explosion.projetes = 0;
  },
  finDExplosion() {
    const e = journalDesAccidents.explosion;
    if (e && e.projetes) e.cause += `, ${e.projetes} visiteur${e.projetes > 1 ? 's' : ''} projeté${e.projetes > 1 ? 's' : ''}`;
    journalDesAccidents.explosion = null;
  },
  // 0x66189, à l'entrée : (cas, visiteur, source)
  projete(m, cas, visiteur, source) {
    if (journalDesAccidents.explosion) { journalDesAccidents.explosion.projetes++; return; }
    if (lecteur(m).u8(visiteur + 4) !== 2) return;       // (0x66189 ne fait rien d'un autre objet)
    const n = attractionDe(m, source);
    if (n) noter(m, n, CAUSES[cas] || `projeté (cas ${cas})`);
  },
};

// ======================================================================================================
// L'état du parc : ce que la fin d'année évaluera, et ce qui le change
// ======================================================================================================
//
// À la fin de l'année, 0x7401C (fin-annee.js) décerne les trophées (0x76FA3 : la sécurité, la
// popularité, la technologie, la mise en place, l'ambiance) et établit six classements (0x74378 : le
// plus riche, le plus grand, le plus amusant, les installations, le plus agréable, la satisfaction),
// dont le rang général fait ensuite l'attrait du parc (0x73347). Tout est tiré de la fiche du parc :
// les grandeurs ci-dessous, avec la place où le jeu les range et ce qu'elles font compter.
// `quotidien` : un compteur que la vie du parc change sans cesse (un visiteur qui entre, un déchet) ;
// la page peut les masquer du journal.
const grandeur = (cle, nom, off, t, pour, quotidien = false) => ({ cle, nom, off, t, pour, quotidien });
export const GRANDEURS = [
  grandeur('mecaniciens', 'mécaniciens', 0xCC, 'ms', 'sécurité, le plus agréable'),
  grandeur('attractions', 'attractions', 0x82, 'o', 'sécurité, mise en place, le plus grand, le plus amusant'),
  grandeur('seuil', "seuil d'usure moyen des attractions (relevé du mois)", 0x93, 'ms', 'sécurité'),
  grandeur('usure', 'usure moyenne des attractions (relevé du mois)', 0x97, 'ls', 'sécurité, le plus agréable'),
  grandeur('retirees', 'attractions retirées (explosées)', 0x9F, 'm', 'sécurité'),
  grandeur('projetes', 'visiteurs projetés (accidents)', 0xA1, 'm', 'sécurité'),
  grandeur('technologie', 'recherche payée (le prix des découvertes)', 0x12C, 'l', 'technologie'),
  grandeur('venus', "visiteurs venus dans l'année", 0x33, 'm', 'popularité, le plus grand', true),
  grandeur('bus', 'capacité des bus', 0x48, 'o', 'le plus grand ; popularité, par sa moyenne'),
  grandeur('busMoyen', "capacité des bus, moyenne des mois de l'année", 0x51, 'o', 'popularité'),
  grandeur('contentement', 'contentement moyen des visiteurs (relevé du mois)', 0xAE, 'ls', 'ambiance'),
  grandeur('visiteurs', 'visiteurs présents', 0x1F, 'ms', 'ambiance (il en faut), le plus grand', true),
  grandeur('boutiques', 'boutiques', 0xE0, 'o', 'le plus grand, installations'),
  grandeur('delai', "délai d'animation moyen (relevé du mois)", 0x92, 'o', 'le plus amusant'),
  grandeur('intensite', 'intensité totale des attractions', 0x8A, 'ls', 'le plus amusant'),
  grandeur('amuseurs', 'amuseurs', 0xD4, 'ms', 'le plus amusant'),
  grandeur('personnel', 'personnel', 0xC2, 'm', 'installations'),
  grandeur('toilettes', 'toilettes', 0x83, 'o', 'installations, le plus agréable'),
  grandeur('usageToilettes', 'saleté des toilettes (usages pas encore nettoyés)', 0x84, 'l', 'le plus agréable', true),
  grandeur('dechets', 'déchets sur les allées', 0x80, 'ms', 'le plus agréable', true),
  grandeur('lac', 'cases de lac', 0x7E, 'm', 'le plus agréable'),
  grandeur('decor', 'décor posé (arbres, buissons…)', 0x7C, 'm', 'le plus agréable'),
  grandeur('plaisirDuDecor', "plaisir donné par le décor dans l'année", 0x37, 'l', 'le plus agréable', true),
  grandeur('emporte', "contentement emporté par les visiteurs partis dans l'année", 0x43, 'l', 'satisfaction', true),
  grandeur('attrait', 'attrait du parc (la réputation)', 0x21, 's', "l'arrivée des visiteurs ; posé par les suites du classement"),
];

// Ce qui explique un changement : la plus proche, dans la pile des appels, de ces fonctions du jeu.
// Par adresse (celle de MAIN.EXE, que garde le code lisible) ; les noms sont ceux de moteur/jeu.
const EXPLICATIONS = new Map([
  [0x7401C, "la fin d'année"], [0x76FA3, 'les trophées'], [0x73347, 'les suites du classement'],
  [0x729D8, 'la bourse de fin d\'année'], [0x51111, "les impôts et l'inflation"],
  [0x68E34, 'le relevé du mois (statistiques du parc)'], [0x6EE22, 'la mise à jour mensuelle des parcs'],
  [0x53F13, 'la recherche (fin du mois)'],
  [0x223C1, 'un visiteur passe le guichet'], [0x67CD4, 'des visiteurs arrivent'],
  [0x2698E, 'un visiteur repart en bus'], [0x28752, 'un visiteur quitte le parc'],
  [0x22E22, 'un visiteur se promène'], [0x277E1, 'un visiteur profite du décor'],
  [0x275F3, 'un visiteur va aux toilettes'],
  [0x66189, 'un accident : un visiteur projeté'], [0x6662D, 'une attraction explose'],
  [0x2EBB7, 'une attraction construite'], [0x31748, 'une attraction démolie'],
  [0x3568E, 'une boutique posée'], [0x35C4A, 'une boutique démolie'],
  [0x40DA6, 'un décor posé'], [0x411AA, 'un décor ôté'], [0x40E92, 'une installation posée'],
  [0x4121E, 'une installation ôtée'], [0x412E0, 'le lac creusé ou comblé'],
  [0x32232, 'une embauche'], [0x325DA, 'un renvoi'],
  [0x638EF, 'un agent balaie'], [0x63803, 'un agent nettoie les toilettes'],
  [0x2E035, "le chargement d'une partie"], [0x19EEE, 'une nouvelle partie'], [0x6E7E6, 'la préparation des joueurs'],
  [0x21681, 'la vie du parc (mise à jour des objets)'], [0x12B1F, 'le pas du calendrier'],
]);

// --- Le guet ------------------------------------------------------------------------------------------
// Qui a écrit ? Tant que la fenêtre est ouverte, chaque fonction du jeu est enveloppée (T.remplacer) :
// l'enveloppe tient une pile des fonctions en cours et compare les grandeurs à leur dernière valeur
// connue à l'entrée et à la sortie de chaque appel. Ce qui a changé entre deux comparaisons l'a été par
// la fonction du dessus de la pile — l'appelante à l'entrée d'une appelée, l'appelée à sa sortie —,
// donc par la fonction même qui l'a écrit : toutes sont enveloppées. Une comparaison, c'est 25 lectures
// de la mémoire ; fenêtre fermée, les enveloppes sont retirées et le jeu retrouve ses fonctions telles
// quelles : aucun coût. Rien n'est écrit dans la mémoire du jeu.
//
// Dans le moteur réentrant (le fil de la page), une fonction qui peut rendre la main rend un
// itérateur : l'enveloppe le parcourt dans un générateur, et ne compare qu'à la fin de la fonction.
const NORMAL = 0, ENTRE_DEUX_IMAGES = 1, COMMANDE = 2, FENETRE_FERMEE = 3;
// Le journal garde les 300 dernières entrées des compteurs du quotidien, et à part les 300 dernières
// des autres : à vitesse ultra-rapide, les premiers chasseraient vite une recherche ou une embauche.
const JOURNAL_MAX = 300;
const OFFSETS = GRANDEURS.map((g) => g.off);
const SORTES = GRANDEURS.map((g) => ({ o: 0, s: 1, m: 2, ms: 3, l: 4, ls: 5 })[g.t]);
const guet = {
  m: null, T: null,
  pose: false,
  generation: 0,               // change à chaque pose : les enveloppes d'une pose plus ancienne ne dépilent plus
  enveloppes: new Map(),       // adresse → enveloppe
  originales: new Map(),       // adresse → la fonction enveloppée
  pile: [],                    // les adresses des fonctions en cours, la dernière appelée à la fin
  parc: 0, valeurs: null,      // la fiche guettée et les dernières valeurs connues
  journal: [], quotidiens: [], numero: 0, notes: 0,
  derniers: GRANDEURS.map(() => null),   // la dernière entrée du journal de chaque grandeur
  noms: null,                  // adresse → [nom, module] (debogage-noms.js)
};

// Les noms lisibles des fonctions : moteur/jeu/debogage-noms.js les donne, côté jeu seulement (la
// page, qui prend ici la description des onglets, n'a pas à charger tout le moteur).
export function nommerLesFonctions(noms) { guet.noms = noms; }
const nomDeFonction = (a) => {
  const n = guet.noms && guet.noms.get(a);
  return n ? n[0] : a ? hex(a) : '(hors du jeu)';
};

// La fiche du parc du joueur : celle de la fiche 0 des joueurs (le joueur humain), pas [0xD3818], que
// le jeu peut faire passer d'un parc à l'autre.
function parcGuette(m) {
  const dv = m.dv, n = m.m8.length;
  const fiches = dv.getUint32(A.fichesDesJoueurs, true);
  if (fiches === 0 || fiches + 4 > n) return 0;
  const p = A.parcs + dv.getUint16(fiches + 2, true) * T.ficheDuParc;
  return p + T.ficheDuParc <= n ? p : 0;
}
function lireGrandeur(m, a, sorte) {
  switch (sorte) {
    case 0: return m.m8[a];
    case 1: return (m.m8[a] << 24) >> 24;
    case 2: return m.dv.getUint16(a, true);
    case 3: return m.dv.getInt16(a, true);
    case 4: return m.dv.getUint32(a, true);
    default: return m.dv.getInt32(a, true);
  }
}

// Comparer les grandeurs à leurs dernières valeurs connues, et noter ce qui a changé.
function comparer(mode) {
  const m = guet.m;
  if (!m) return;
  const p = parcGuette(m);
  if (p !== guet.parc || guet.valeurs === null) {
    guet.parc = p;
    guet.valeurs = p ? OFFSETS.map((o, k) => lireGrandeur(m, p + o, SORTES[k])) : null;
    return;
  }
  const valeurs = guet.valeurs;
  for (let k = 0; k < OFFSETS.length; k++) {
    const x = lireGrandeur(m, p + OFFSETS[k], SORTES[k]);
    if (x !== valeurs[k]) { noterUnChangement(k, valeurs[k], x, mode); valeurs[k] = x; }
  }
}

// Une entrée du journal. Les changements d'une même grandeur, par la même fonction, pour la même
// cause, le même jour du jeu, s'additionnent dans une seule entrée (« × n ») : un compteur que chaque
// visiteur fait bouger ne noie pas le reste.
function noterUnChangement(k, avant, apres, mode) {
  const pile = guet.pile, n = pile.length;
  const qui = mode === FENETRE_FERMEE || mode === COMMANDE ? 0 : n ? pile[n - 1] : 0;
  let cause = mode === COMMANDE ? 'une commande de la fenêtre de débogage'
    : mode === FENETRE_FERMEE ? 'écrit pendant que la fenêtre était fermée' : '';
  if (!cause) for (let j = n - 1; j >= 0; j--) { const x = EXPLICATIONS.get(pile[j]); if (x) { cause = x; break; } }
  const pas = guet.m.dv.getUint32(A.pasDeSimulation, true);
  const jour = dateDuJeu(pas);
  guet.notes++;
  const d = guet.derniers[k];
  const liste = GRANDEURS[k].quotidien ? guet.quotidiens : guet.journal;
  if (d && d.qui === qui && d.cause === cause && d.jour === jour && d.mode === mode && liste.length && d.numero >= liste[liste.length - 1].numero) {
    d.apres = apres; d.fois++; d.pasFin = pas;
    return;
  }
  const e = { numero: ++guet.numero, k, avant, apres, fois: 1, qui, cause, jour, pas, pasFin: pas, mode,
    appelants: mode === NORMAL || mode === ENTRE_DEUX_IMAGES ? pile.slice(Math.max(0, n - 5), n - 1).reverse() : [] };
  liste.unshift(e);
  if (liste.length > JOURNAL_MAX) liste.pop();
  guet.derniers[k] = e;
}

// L'enveloppe d'une fonction du jeu.
function envelopper(adresse, f) {
  return function enveloppeDuGuet() {
    if (!guet.pose) return f();
    const generation = guet.generation, pile = guet.pile;
    comparer(NORMAL);                     // ce qui a changé jusqu'ici : l'œuvre de l'appelante
    pile.push(adresse);
    let r;
    try {
      r = f();
    } catch (err) {
      sortir(adresse, generation);
      throw err;
    }
    if (typeof r !== 'object' || r === null || typeof r.next !== 'function') {
      sortir(adresse, generation);
      return r;
    }
    return parcourir(r, adresse, generation);
  };
}
function* parcourir(r, adresse, generation) {
  try { return yield* r; } finally { sortir(adresse, generation); }
}
function sortir(adresse, generation) {
  if (!guet.pose || generation !== guet.generation) return;
  comparer(NORMAL);                       // ce qui a changé depuis : l'œuvre de cette fonction
  const pile = guet.pile;
  if (pile[pile.length - 1] === adresse) pile.pop();
  else { const j = pile.lastIndexOf(adresse); if (j >= 0) pile.length = j; }
}

// Poser les enveloppes (à l'ouverture de la fenêtre), ou les retirer (à sa fermeture). Une fonction
// qu'un autre a enveloppée depuis (moteur-du-jeu.js le fait au démarrage) garde son enveloppe à lui.
function poserLeGuet(m) {
  const T = m.T;
  if (!T || typeof T.adresses !== 'function') return;
  guet.m = m; guet.T = T;
  guet.enveloppes.clear(); guet.originales.clear();
  guet.generation++;
  guet.pile = [];
  for (const a of T.adresses()) {
    // (Lue par un accès calculé : moteur/node/reentrer.mjs tient ce que rend `T.fonction` pour une
    // routine qui ne rend pas la main, et en ferait parcourir l'appel d'une traite, par
    // executerSansPause ; le moteur réentrant ne rendrait plus jamais la main à la page. L'enveloppe
    // doit rendre tel quel ce que rend la fonction, itérateur compris.)
    const f = T['fonction'](a);
    if (typeof f !== 'function') continue;
    const e = envelopper(a, f);
    guet.originales.set(a, f); guet.enveloppes.set(a, e);
    T.remplacer(a, e);
  }
  // ce qui a changé fenêtre fermée : noté sans auteur
  if (guet.valeurs && parcGuette(m) === guet.parc) comparer(FENETRE_FERMEE);
  else guet.valeurs = null;
  guet.pose = true;
}
function retirerLeGuet() {
  if (!guet.pose) return;
  guet.pose = false;
  const T = guet.T;
  for (const [a, e] of guet.enveloppes) if (T.fonction(a) === e) T.remplacer(a, guet.originales.get(a));
  guet.enveloppes.clear(); guet.originales.clear();
  guet.pile = [];
}
// Les enveloppes sont-elles toujours en place ? Un redémarrage du programme (T.initialiser) repose
// toutes les fonctions : on les enveloppe de nouveau.
const TEMOIN = 0x21681;
function guetter(m) {
  if (!guet.pose || guet.m !== m) { guet.pose = false; poserLeGuet(m); return; }
  const e = guet.enveloppes.get(TEMOIN);
  if (e && guet.T.fonction(TEMOIN) !== e) { guet.pose = false; poserLeGuet(m); }
}

// --- Les évaluations, si l'année finissait maintenant -------------------------------------------------
// L'année que compte la fin d'année (0x76FA3 : pas / 12 000, le pas étant alors un multiple de 12 000) :
// en cours d'année, celle qui finira.
const anneeEvaluee = (pas) => ((pas / 12000) | 0) + 1;
const MENTIONS = ['aucune', 'EXCELLENTE (prime 10 000)', 'BONNE (prime 5 000)', 'MOYENNE', 'MAUVAISE', 'LAMENTABLE'];
const selonLesSeuils = (v, s) => (v >= s[0] ? 1 : v >= s[1] ? 2 : v >= s[2] ? 3 : v >= s[3] ? 4 : 5);
const quotient = (a, b) => (b ? ((a | 0) / (b | 0)) | 0 : 0);

// La variété des attractions, que 0x76FA3 compare pour la mise en place : pour chaque attraction, +1
// pour la première et la deuxième de son genre, −1 au-delà.
function varieteDesAttractions(c) {
  const parGenre = new Uint8Array(512);
  let variete = 0;
  pourChaque(c, 4, (o) => {
    const g = (c.L.u16(o + 0x16) / 200) | 0;
    variete += parGenre[g] <= 1 ? 1 : -1;
    parGenre[g]++;
  });
  return variete;
}

function tableDesTrophees(c) {
  const { L, fp: p } = c;
  const annee = anneeEvaluee(c.pas);
  const parAn = (v) => quotient(v, annee + 1);
  const attractions = L.u8(p + 0x82);
  const lignes = [];
  // la technologie
  const techno = parAn(L.u32(p + 0x12C));
  lignes.push(['LA TECHNOLOGIE DE VOS ATTRACTIONS', nb(techno), MENTIONS[selonLesSeuils(techno, [200, 150, 100, 50])],
    '200, 150, 100, 50', `recherche payée ${nb(L.u32(p + 0x12C))} / (année + 1 = ${annee + 1})`]);
  // la sécurité
  if (attractions) {
    const meca = L.s16(p + 0xCC), seuil = L.s16(p + 0x93), usure = L.u32(p + 0x97), proj = L.u16(p + 0xA1), ret = L.u16(p + 0x9F);
    const note = (((meca - (attractions >> 2)) << 4) + seuil - Math.imul(usure, 3) - parAn(proj) - parAn(ret << 7)) | 0;
    lignes.push(['LA SECURITE DANS VOTRE PARC', nb(note), MENTIONS[selonLesSeuils(note, [30, 15, 0, -30])], '30, 15, 0, −30',
      `16 × (mécaniciens ${meca} − attractions ${attractions} / 4) + seuil ${seuil} − 3 × usure ${nb(usure)} − projetés ${proj} / ${annee + 1} − 128 × retirées ${ret} / ${annee + 1}`]);
  } else lignes.push(['LA SECURITE DANS VOTRE PARC', '—', 'aucune (pas d\'attraction)', '30, 15, 0, −30', '']);
  // la popularité
  if (L.u8(p + FP.ouvert) && L.u8(p + 0x51)) {
    const pop = quotient(L.u16(p + 0x33) * 100, L.u8(p + 0x51) * 12);
    lignes.push(['LA POPULARITE DE VOTRE PARC', nb(pop), MENTIONS[selonLesSeuils(pop, [90, 75, 55, 35])], '90, 75, 55, 35',
      `100 × venus ${nb(L.u16(p + 0x33))} / (12 × capacité moyenne des bus ${L.u8(p + 0x51)})`]);
  } else lignes.push(['LA POPULARITE DE VOTRE PARC', '—', L.u8(p + FP.ouvert) ? '— (capacité moyenne nulle : la division arrêterait le jeu)' : 'aucune (parc fermé)', '90, 75, 55, 35', '']);
  // la mise en place
  if (attractions) {
    const va = varieteDesAttractions(c);
    const m = annee * 2 + 6 <= va || va >= 20 ? 1 : ((annee * 3) >> 1) + 5 <= va ? 2 : annee + 4 <= va ? 3 : (annee >> 1) + 3 <= va ? 4 : 5;
    lignes.push(['VOTRE MISE EN PLACE AUTOUR DES ATTRACTIONS', nb(va), MENTIONS[m],
      `${Math.min(annee * 2 + 6, 20)}, ${((annee * 3) >> 1) + 5}, ${annee + 4}, ${(annee >> 1) + 3}`,
      `variété de ${attractions} attractions : +1 pour les deux premières d'un genre, −1 au-delà`]);
  } else lignes.push(['VOTRE MISE EN PLACE AUTOUR DES ATTRACTIONS', '—', 'aucune (pas d\'attraction)', '', '']);
  // l'ambiance
  if (L.u16(p + 0x1F)) {
    const co = L.s32(p + 0xAE), haut = L.s16(p + 0), bas = L.s16(p + 2);
    const m = haut <= co ? 1 : haut - 100 <= co ? 2 : bas <= co ? 3 : bas - 200 <= co ? 4 : 5;
    lignes.push(["L'AMBIANCE DE VOTRE PARC", nb(co), MENTIONS[m], `${haut}, ${haut - 100}, ${bas}, ${bas - 200}`,
      `contentement moyen (relevé du mois), seuils content ${haut} et mécontent ${bas}`]);
  } else lignes.push(["L'AMBIANCE DE VOTRE PARC", '—', 'aucune (pas de visiteurs)', '', '']);
  return lignes;
}

// Les six classements (fin-annee.js, etablirLesClassements) : la valeur de chaque joueur, gardée sur
// 27 bits signés, et le rang du joueur parmi les fiches non vides.
const sur27Bits = (v) => (v << 5) >> 5;
const CLASSEMENTS = [
  ['LE PLUS RICHE', 'solde − prêt + actions détenues × leur cours'],
  ['LE PLUS GRAND', '16 × attractions + 8 × boutiques + 2 × venus + visiteurs + capacité des bus'],
  ['LE PLUS AMUSANT', 'délai moyen × attractions + intensité totale + 4 × amuseurs'],
  ['INSTALLATIONS', '8 × boutiques + personnel + 8 × toilettes'],
  ['LE PLUS AGREABLE', '−2 × déchets − usure + 8 × mécaniciens + 64 × lac + décor + plaisir du décor / 64 + 4 × (20 − saleté des toilettes / toilettes)'],
  ['SATISFACTION', 'contentement emporté par les visiteurs partis'],
];
function valeursDeClassement(L, fiches, f) {
  const parcDe = (g) => (A.parcs + L.u16(g + 2) * T.ficheDuParc) >>> 0;
  const p = parcDe(f);
  let actions = 0;
  for (let j = 0; j < 25; j++) actions = (actions + Math.imul(L.u16(f + 0xA3 + 2 * j), L.u32(parcDe(fiches + j * T.ficheDuJoueur) + 0x66))) | 0;
  let agreable = sur27Bits(-2 * L.s16(p + 0x80) - L.u32(p + 0x97) + (L.s16(p + 0xCC) << 3) + (L.u16(p + 0x7E) << 6)
    + L.u16(p + 0x7C) + (L.u32(p + 0x37) >>> 6));
  if (L.u8(p + 0x83)) agreable = ((20 - Math.floor(L.u32(p + 0x84) / L.u8(p + 0x83))) << 2) + agreable;
  return [L.u32(f + FJ.solde) - L.u32(f + FJ.pret) + actions,
    (L.u8(p + 0x82) << 4) + (L.u8(p + 0xE0) << 3) + L.u16(p + 0x33) * 2 + L.s16(p + 0x1F) + L.u8(p + 0x48),
    L.u8(p + 0x92) * L.u8(p + 0x82) + L.u32(p + 0x8A) + (L.s16(p + 0xD4) << 2),
    (L.u8(p + 0xE0) << 3) + L.u16(p + 0xC2) + (L.u8(p + 0x83) << 3),
    agreable,
    L.u32(p + 0x43)].map(sur27Bits);
}
function tableDesClassements(c) {
  const { L } = c;
  const fiches = L.u32(A.fichesDesJoueurs);
  const tous = [];
  for (let k = 0; k < 25; k++) {
    const f = (fiches + k * T.ficheDuJoueur) >>> 0;
    if (L.u8(f + FJ.sorte) !== 0) tous.push(valeursDeClassement(L, fiches, f));
  }
  const moi = valeursDeClassement(L, fiches, fiches);
  return CLASSEMENTS.map(([nom, formule], k) => {
    const rang = 1 + tous.filter((v) => v[k] > moi[k]).length;
    return [nom, nb(moi[k]), `${rang}e sur ${tous.length}`, formule];
  });
}

function tableDesGrandeurs(c) {
  return GRANDEURS.map((g, k) => {
    const d = guet.derniers[k];
    return [g.nom, hex(g.off), nb(lireGrandeur(c.m, c.fp + g.off, SORTES[k])), g.pour,
      d ? d.jour : '—', d ? auteur(d) : '—', d ? d.cause || '—' : '—'];
  });
}
function auteur(e) {
  if (e.mode === COMMANDE) return 'commande du débogage';
  if (e.mode === FENETRE_FERMEE) return '?';
  const n = guet.noms && guet.noms.get(e.qui);
  const nom = n ? `${n[0]} (${n[1]}, ${hex(e.qui)})` : nomDeFonction(e.qui);
  return e.mode === ENTRE_DEUX_IMAGES ? `${nom}, vu entre deux images` : nom;
}
// Le journal, le plus récent d'abord ; en tête de chaque ligne, pour la page, si la grandeur est un
// compteur du quotidien.
function tableDuJournal() {
  const tout = guet.journal.concat(guet.quotidiens).sort((a, b) => b.numero - a.numero);
  return tout.map((e) => {
    const g = GRANDEURS[e.k];
    return [g.quotidien, e.jour, e.fois > 1 ? `${nb(e.pas)} à ${nb(e.pasFin)}` : nb(e.pas), g.nom,
      `${nb(e.avant)} → ${nb(e.apres)}`, e.fois > 1 ? `× ${e.fois}` : '', auteur(e), e.cause || '—',
      e.appelants.map(nomDeFonction).join(' ← ') || '—'];
  });
}

// Les tables, colonne par colonne : [titre, bulle].
export const TABLES = {
  attractions: [['n°', "numéro d'objet"], ['genre', 'nom de la fiche du genre, catalogue 0xCCED0 + objet +0x16 (§ 10.3)'],
    ['mode', 'objet +0x0C (§ 10.3)'], ['phase', 'objet +0x32 (§ 10.3)'], ['ouverture', 'objet +0x4B : 1 ouverte, 0 fermée, −1 en réparation'],
    ['usure / seuil', 'usure objet +0x2E ; seuil fiche +0xA8 ; explose au-delà du double (§ 10.3, § 10.16)'],
    ['état', "ce que l'usure annonce (§ 10.3, § 10.5)"], ['file', 'visiteurs chaînés depuis la tête de file +0x1E'],
    ['à bord / cap.', 'objet +0x30 / +0x26'], ['délai', "délai d'animation +0x13 (vitesse)"],
    ['départs', 'objet +0x3A ; jamais remis à zéro'], ['servis', 'objet +0x3C'], ['dû', 'prix de construction encore dû, +0x38 × 100 (§ 10.3)'],
    ['usure au départ', "ce qu'ajoute le prochain départ (0x31ED3) : 7 − délai + durée d'un tour / 256 + départs / 6 ; le dernier terme croît avec l'âge de l'attraction"],
    ['avant explosion', "départs avant que l'usure dépasse le double du seuil, sans réparation (le mécanicien est appelé au-delà de 39)"],
    ['risques', "les accidents possibles à cette usure : éjections des montagnes russes (dès 18, 1 sur 64 par courbe rapide ; au seuil avec les corrections), incidents des circuits (dès 72), explosion"],
    ['accidents', 'notés depuis le lancement de la page : leur nombre, et la cause du dernier (journal ci-dessous)']],
  accidents: [['n°', "numéro de l'attraction"], ['attraction', 'nom de la fiche du genre'], ['cause', "la routine du jeu qui l'a fait"],
    ['usure / seuil', "au moment de l'accident"], ['il y a', 'temps réel écoulé depuis'], ['pas', 'compteur des pas de simulation (0xD3AFC)']],
  boutiques: [['n°', "numéro d'objet"], ['boutique', 'catalogue 0xD3C62 + objet +0x16 (§ 10.4)'], ['famille', 'fiche +0x24'],
    ['prix', 'fiche +0x4F'], ['coût', 'fiche +0x4D'], ['excès', 'excès de prix vu par le visiteur : 2 × (prix × 100 / coût − 100 − marge) (§ 10.2)'],
    ['ventes', 'objet +0x14'], ['stock', 'marchandise fiche +0x67 : stock 0xD3C00 + 14 × m + 4 (§ 11.12)'], ['dette', 'objet +0x38 × 100']],
  personnel: [['n°', "numéro d'objet"], ['métier', 'catalogue 0xD35C0 + 0x36 × objet +0x59 (§ 10.5)'], ['état', 'objet +0x0C (§ 10.5, § 10.13 à § 10.15)'],
    ['salaire', 'objet +0x9A'], ['patience', 'objet +0x20'], ['case', 'colonne +0x07, rangée +0x09']],
  voyous: [['n°', "numéro d'objet"], ['genre', 'objet +0x59'], ['état', 'objet +0x0C (§ 10.14)'], ['méfait', 'bit 2 de +0x05 : peut être arrêté'], ['case', 'colonne, rangée']],
  installations: [['n°', "numéro d'objet"], ['nom', 'catalogue 0xCCA70 + 0x38 × objet +0x16 (§ 10.4)'], ['état', '+0x0C : 2 en service'], ['saleté', 'objet +0x3C (§ 10.13)']],
  visiteurs: [['n°', "numéro d'objet"], ['état', 'objet +0x0C (§ 10.2)'], ['contentement', '+0x54'], ['estomac', '+0x50'], ['soif', '+0x51'],
    ['argent', '+0x6F'], ['fatigue', '+0x82'], ['faites', '+0x81'], ['case', 'colonne, rangée']],
  recherche: [['domaine', 'noms de la table [0xD7BB0], indices 27 à 32 (economie.js)'], ['ouvert', 'fiche du parc +0x248 + d'],
    ['budget', 'fiche du parc +0x114 + 2d'], ['points', 'fiche du parc +0x120 + 2d'],
    ['coût fait / à faire', 'comptes +0x64C + 4d, +0x664 + 4d'], ['moins chère', '[0xD3588 + 4d] : prix de la découverte la moins chère examinée']],
  trophees: [['trophée', "texte de l'écran de fin d'année (0x76FA3, fin-annee.js)"], ['note', "la valeur comparée aux seuils, calculée comme 0x76FA3 le ferait si l'année finissait maintenant"],
    ['mention', 'EXCELLENTE rapporte 10 000, BONNE 5 000, versés à la nouvelle année'], ['seuils', 'EXCELLENTE, BONNE, MOYENNE, MAUVAISE ; en dessous, LAMENTABLE'],
    ['calcul', 'les grandeurs de la fiche du parc qui la font']],
  classements: [['classement', "catégorie de l'écran du classement (0x74378, fin-annee.js)"], ['valeur', 'du joueur, maintenant (27 bits signés)'],
    ['rang', "parmi les fiches non vides ; la somme des six rangs fait le classement général, d'où l'attrait (0x73347)"], ['calcul', 'fiche du parc et fiche du joueur']],
  grandeurs: [['grandeur', 'dans la fiche du parc du joueur'], ['où', 'décalage dans la fiche du parc (0x250 octets)'], ['valeur', 'maintenant'],
    ['compte pour', 'les trophées et classements où elle entre'], ['changée le', "date du jeu du dernier changement noté (fenêtre ouverte)"],
    ['par', 'la fonction du jeu (code lisible, moteur/jeu) qui l\'a écrite'], ['cause', 'la plus proche fonction qui explique, dans la pile des appels']],
  journal: [['date', 'date du jeu'], ['pas', 'pas de simulation (0xD3AFC) ; deux nombres : premier et dernier des changements réunis'],
    ['grandeur', 'dans la fiche du parc'], ['avant → après', 'valeurs'], ['fois', 'changements réunis : même grandeur, même fonction, même cause, même jour'],
    ['fonction', "qui l'a écrite (code lisible, moteur/jeu ; module, adresse dans MAIN.EXE)"], ['cause', 'la plus proche fonction qui explique, dans la pile des appels'],
    ['appelée par', 'les fonctions en cours au-dessus, de la plus proche à la plus lointaine']],
  concurrents: [['fiche', 'rang dans [0xD3B00] (§ 7)'], ['nom', '0x4C50B : le nom saisi pour un humain, sinon [0xD7B98]'], ['sorte', 'fiche +0 : 1 humain, 3 concurrent'],
    ['parc', 'fiche +2'], ['solde', 'fiche +0x0A'], ['prêt', 'fiche +0x12'], ['visiteurs', 'parc +0x1F'], ['attractions', 'parc +0x82'],
    ['réputation', 'parc +0x21'], ['cours', 'parc +0x66 (§ 11.13)']],
};

function tablesDesObjets(c) {
  const { L } = c;
  const t = { attractions: [], accidents: [], boutiques: [], personnel: [], voyous: [], installations: [], visiteurs: [] };
  const marge = L.u16(c.fp + FP.margeToleree);
  for (let n = 1; n < c.nombre; n++) {
    const o = adresseObjet(c, n);
    const type = L.u8(o + 4);
    const cas = `${L.u8(o + 7)},${L.u8(o + 9)}`;
    if (type === 4) {
      const fiche = (A.catalogueDesAttractions + L.u16(o + 0x16)) >>> 0;
      const usure = L.u16(o + 0x2E), seuil = L.u8(fiche + 0xA8);
      const acc = journalDesAccidents.parAttraction.get(n);
      t.attractions.push([n, nomDAttraction(c, o), nomDe(MODES, L.u8(o + 0xC)), PHASES[L.u16(o + 0x32)] || L.u16(o + 0x32),
        ouverture(L.s8(o + 0x4B)), `${usure} / ${seuil}`, sante(usure, seuil), longueurDeFile(c, o),
        `${L.s16(o + 0x30)} / ${L.u16(o + 0x26)}`, L.u8(o + 0x13), L.u16(o + 0x3A), L.u16(o + 0x3C), nb(L.s16(o + 0x38) * 100),
        usureDUnDepart(L, o, L.u16(o + 0x3A) + 1), departsAvantExplosion(L, o, seuil), risques(L, o, seuil),
        acc ? `${acc.total} (${acc.derniere})` : '—']);
    } else if (type === 0xA) {
      const f = ficheDeBoutique(c, o);
      const prix = L.u16(f + 0x4F), cout = L.u16(f + 0x4D);
      const m = L.s8(f + 0x67);
      t.boutiques.push([n, L.texte(f, 20), FAMILLES[L.u8(f + 0x24)] || L.u8(f + 0x24), prix, cout,
        cout ? 2 * (((prix * 100) / cout | 0) - 100 - marge) : '—', L.u16(o + 0x14),
        m >= 0 ? L.u16(A.marchandises + T.marchandise * m + 4) : '—', nb(L.s16(o + 0x38) * 100)]);
    } else if (type === 8) {
      t.personnel.push([n, nomDeMetier(c, o), nomDe(ETATS_DU_PERSONNEL, L.u8(o + 0xC)), L.u16(o + 0x9A), L.u16(o + 0x20), cas]);
    } else if (type === 0x1A) {
      t.voyous.push([n, L.u8(o + 0x59), nomDe(ETATS_DES_VOYOUS, L.u8(o + 0xC)), ouiNon(L.u8(o + 5) & 2), cas]);
    } else if (type === 0x18) {
      t.installations.push([n, L.texte(A.catalogueDesInstallations + T.ficheDInstallation * L.u16(o + 0x16), 20),
        L.u8(o + 0xC), L.u16(o + 0x3C)]);
    } else if (type === 2 && L.u8(o + 0xC) !== 0x48 && t.visiteurs.length < 400) {
      t.visiteurs.push([n, ETATS_DES_VISITEURS[L.u8(o + 0xC)] || hex(L.u8(o + 0xC)), L.s16(o + 0x54), L.s8(o + 0x50),
        L.s8(o + 0x51), L.u16(o + 0x6F), L.s16(o + 0x82), L.u8(o + 0x81), cas]);
    }
  }
  const maintenant = performance.now();
  t.accidents = journalDesAccidents.liste.map((e) => [e.n, e.nom, e.cause, e.usure,
    `${Math.round((maintenant - e.reel) / 1000)} s`, nb(e.pas)]);
  return t;
}

function tableDeLaRecherche(c) {
  const { L } = c;
  return DOMAINES.map((nom, d) => [nom, ouiNon(L.u8(c.fp + FP.domainesOuverts + d)), L.s16(c.fp + FP.budgets + 2 * d),
    L.s16(c.fp + FP.points + 2 * d), `${nb(L.s32(c.co + CO.coutDeRecherche + 4 * d))} / ${nb(L.s32(c.co + CO.coutAFinir + 4 * d))}`,
    nb(L.s32(A.moinsChereExaminee + 4 * d))]);
}

function tableDesConcurrents(c) {
  const { L } = c;
  const fiches = L.u32(A.fichesDesJoueurs), joueur = L.u16(A.joueurCourant), lignes = [];
  for (let k = 0; k < 25; k++) {
    const f = (fiches + k * T.ficheDuJoueur) >>> 0;
    const sorte = L.u8(f + FJ.sorte);
    if (sorte === 0) continue;
    const parc = (A.parcs + L.u16(f + FJ.numeroDuParc) * T.ficheDuParc) >>> 0;
    const nom = sorte === 1 || sorte === 6 || k === joueur ? L.texte(A.comptes + T.comptes * k, 20)
      : L.texte(L.u32((L.u32(A.nomsDesJoueurs) + 4 * L.u8(f + FJ.rang)) >>> 0), 20);
    lignes.push([k, nom, sorte === 1 ? 'humain' : sorte === 3 ? 'concurrent' : sorte === 7 ? 'à venir' : sorte,
      L.u16(f + FJ.numeroDuParc), nb(L.s32(f + FJ.solde)), nb(L.s32(f + FJ.pret)), L.s16(parc + FP.visiteursPresents),
      L.u8(parc + FP.attractions), L.s8(parc + FP.reputation), nb(L.s32(parc + FP.cours))]);
  }
  return lignes;
}

// --- la fiche complète d'un objet -------------------------------------------------------------------
const CHAMPS_COMMUNS = [['+0x00', 'objet précédent sur la case', 's16', 0], ['+0x02', 'objet suivant sur la case', 's16', 2],
  ['+0x04', 'type', 'u8', 4], ['+0x05', 'drapeaux', 'x8', 5], ['+0x07', 'colonne', 'u8', 7], ['+0x09', 'rangée', 'u8', 9],
  ['+0x0A', 'objet graphique', 'u16', 0xA], ['+0x0C', 'état', 'x8', 0xC], ['+0x0D', 'état suivant', 'x8', 0xD],
  ['+0x16', 'genre ou lien', 'u16', 0x16]];
const CHAMPS_PAR_TYPE = {
  2: [['+0x12', 'direction', 'u8', 0x12], ['+0x13', 'vitesse', 'u8', 0x13], ['+0x14', 'compte à rebours', 's16', 0x14],
    ['+0x1E', 'suivant dans la file', 'u16', 0x1E], ['+0x4F', 'joueur (−1 : pas entré)', 's8', 0x4F],
    ['+0x50', 'estomac', 's8', 0x50], ['+0x51', 'soif', 's8', 0x51], ['+0x52', 'achats et jeux faits', 'x16', 0x52],
    ['+0x54', 'contentement', 's16', 0x54], ['+0x56', 'case visée, colonne', 'u8', 0x56], ['+0x57', 'case visée, rangée', 'u8', 0x57],
    ['+0x59', 'genre de visiteur (allure)', 'u8', 0x59], ['+0x5A', 'émotion en attente', 'u8', 0x5A], ['+0x63', 'déchets en main (1 gobelet, 2 emballage, 4 vomir)', 'u8', 0x63],
    ['+0x6F', 'argent', 'u16', 0x6F], ['+0x75', 'entrée ou dernier plaisir (pas)', 'u32', 0x75], ['+0x81', 'attractions faites', 'u8', 0x81],
    ['+0x82', 'fatigue', 's16', 0x82], ['+0x8B', 'délai avant une émotion', 'u8', 0x8B], ['+0xB3', "mises à jour de l'humeur", 'u8', 0xB3],
    ['+0xB7', 'bulle de pensée (figure)', 'u16', 0xB7], ['+0xB9', 'durée de la bulle', 'u8', 0xB9], ['+0xBA', 'raison de la bulle', 'u8', 0xBA],
    ['+0xC6', 'cases sales rencontrées', 'u8', 0xC6]],
  4: [['+0x13', "délai d'animation", 'u8', 0x13], ['+0x1C', 'compte à rebours du départ', 's16', 0x1C], ['+0x1E', 'tête de file', 'u16', 0x1E],
    ['+0x26', 'capacité', 'u16', 0x26], ['+0x2E', 'usure', 'u16', 0x2E], ['+0x30', 'à bord', 's16', 0x30], ['+0x32', 'phase', 'u16', 0x32],
    ['+0x34', 'durée d\'un tour', 'u16', 0x34], ['+0x36', 'temps restant', 's16', 0x36], ['+0x38', 'prix dû (centaines)', 's16', 0x38],
    ['+0x3A', 'départs', 'u16', 0x3A], ['+0x3C', 'visiteurs servis', 'u16', 0x3C], ['+0x3E', 'construite au pas', 'u32', 0x3E],
    ['+0x47', 'premier à bord', 'u16', 0x47], ['+0x49', "kiosque d'entrée", 'u16', 0x49], ['+0x4B', 'ouverture', 's8', 0x4B],
    ['+0x5B', 'coût entier', 'u32', 0x5B], ['+0x61', 'réparateur', 'u16', 0x61], ['+0x73', 'case de sortie', 'u16', 0x73]],
  8: [['+0x12', 'direction', 'u8', 0x12], ['+0x14', 'compte à rebours', 's16', 0x14], ['+0x16', 'attraction appelée (mécanicien)', 'u16', 0x16],
    ['+0x1E', 'voyous arrêtés (gardien)', 'u16', 0x1E], ['+0x20', 'patience', 'u16', 0x20], ['+0x3E', 'embauché au pas', 'u32', 0x3E],
    ['+0x4D', 'case avant la grève', 'u16', 0x4D], ['+0x56', 'case visée, colonne', 'u8', 0x56], ['+0x57', 'case visée, rangée', 'u8', 0x57],
    ['+0x59', 'métier', 'u8', 0x59], ['+0x61', 'sens de la tonte', 'u16', 0x61], ['+0x9A', 'salaire', 'u16', 0x9A]],
  0xA: [['+0x14', 'ventes', 'u16', 0x14], ['+0x38', 'dette (centaines)', 's16', 0x38], ['+0x47', 'client en cours', 'u16', 0x47]],
  0x18: [['+0x3C', 'saleté ou usages', 'u16', 0x3C]],
  0x1A: [['+0x14', 'compte à rebours', 'u16', 0x14], ['+0x16', 'attraction usée', 'u16', 0x16], ['+0x1E', 'voyou arrêté avant lui', 'u16', 0x1E],
    ['+0x49', 'case de la boutique', 'u16', 0x49], ['+0x59', 'genre', 'u8', 0x59], ['+0x61', 'amuseur effrayé, puis son gardien', 'u16', 0x61]],
  0xE: [['+0x0E', 'vitesse (tête)', 's16', 0xE], ['+0x45', 'tête du train (0 : lui)', 'u16', 0x45], ['+0x61', 'wagon suivant', 'u16', 0x61]],
};
function lireChamp(L, o, [, , t, off]) {
  const a = o + off;
  switch (t) {
    case 'u8': return L.u8(a);
    case 's8': return L.s8(a);
    case 'x8': return hex(L.u8(a), 2);
    case 'u16': return L.u16(a);
    case 's16': return L.s16(a);
    case 'x16': return hex(L.u16(a), 4);
    case 'u32': return L.u32(a);
    default: return '?';
  }
}
function ficheDUnObjet(c, choix) {
  const { L } = c;
  const designe = L.u16(A.objetDesigne);
  const n = choix > 0 ? choix : designe;
  const r = { n, designe, nombre: c.nombre - 1 };
  if (n <= 0 || n >= c.nombre) return { ...r, vide: true };
  const o = adresseObjet(c, n);
  const type = L.u8(o + 4);
  let nom = '', resume = '';
  if (type === 2) resume = `${ETATS_DES_VISITEURS[L.u8(o + 0xC)] || '?'}`;
  if (type === 4) {
    nom = nomDAttraction(c, o);
    const f = (A.catalogueDesAttractions + L.u16(o + 0x16)) >>> 0;
    resume = `${nomDe(MODES, L.u8(o + 0xC))}, ${sante(L.u16(o + 0x2E), L.u8(f + 0xA8))} (seuil ${L.u8(f + 0xA8)}, intensité ${L.u8(f + 0xA9)}), file ${longueurDeFile(c, o)}`;
  }
  if (type === 8) { nom = nomDeMetier(c, o); resume = nomDe(ETATS_DU_PERSONNEL, L.u8(o + 0xC)); }
  if (type === 0xA) nom = L.texte(ficheDeBoutique(c, o), 20);
  if (type === 0x18) nom = L.texte(A.catalogueDesInstallations + T.ficheDInstallation * L.u16(o + 0x16), 20);
  if (type === 0x1A) resume = nomDe(ETATS_DES_VOYOUS, L.u8(o + 0xC));
  const champs = [...CHAMPS_COMMUNS, ...(CHAMPS_PAR_TYPE[type] || [])].map((ch) => [ch[0], ch[1], lireChamp(L, o, ch)]);
  const lignes = [];
  for (let k = 0; k < T.objet; k += 16) {
    const octets = [];
    for (let j = 0; j < 16 && k + j < T.objet; j++) octets.push(L.u8(o + k + j).toString(16).toUpperCase().padStart(2, '0'));
    lignes.push(`+${k.toString(16).toUpperCase().padStart(2, '0')}  ${octets.join(' ')}`);
  }
  return { ...r, adresse: hex(o), type, nomDuType: TYPES[type] || (type ? hex(type) : 'libre'), nom, resume, champs, octets: lignes.join('\n') };
}

// ======================================================================================================
// Le côté du travailleur
// ======================================================================================================

// Les commandes, hors du jeu d'origine. Chacune n'écrit que des variables (etat.js).
export const COMMANDES = {
  argent: 1,       // argument : la somme ajoutée au solde
  vitesse: 2,      // argument : −2, 0, 1 ou 20
  meteo: 3,        // argument : 0 (faire cesser), 1 pluie, 2 neige, 4 orage
  recherche: 4,    // argument : les points donnés à chaque domaine ouvert
  reparer: 5,      // toutes les attractions à l'usure 0
  triche: 6,       // argument : 1 lever le drapeau, 0 le baisser
  contenter: 7,    // argument : le contentement donné à chaque visiteur entré
};

function commander(m, code, arg) {
  const c = contexte(m);
  if (!c.charge) return 'pas de parc chargé : rien fait';
  const { L } = c;
  if (L.u16(A.ecranCourant) === 0x50) return "à l'écran titre : rien fait (entrer d'abord dans un parc)";
  const dv = m.dv, m8 = m.m8;
  switch (code) {
    case COMMANDES.argent: {
      const s = L.s32(c.fj + FJ.solde) + arg;
      dv.setInt32(c.fj + FJ.solde, s, true);
      return `solde porté à ${nb(s)}`;
    }
    case COMMANDES.vitesse: {
      dv.setInt16(A.vitesseJeu, arg, true);
      // les coches du menu OPTIONS ▸ VITESSE, comme la commande 10 à 13 (menus.js)
      const k = [-2, 0, 1, 20].indexOf(arg);
      for (let j = 0; j < 4; j++) m8[A.drapeauxDesVitesses + j] = j === k ? 1 : 0;
      return `vitesse ${VITESSES[arg] || arg}`;
    }
    case COMMANDES.meteo:
      if (arg === 0) {
        // on vieillit l'intempérie : le jeu la finit lui-même au tirage suivant (64 pas au plus), et
        // repose la palette du parc (economie.js, finirLIntemperie)
        if (!L.u8(A.meteo)) return 'il fait déjà beau';
        dv.setUint32(A.debutDeLIntemperie, (c.pas - 1001) >>> 0, true);
        return "l'intempérie cessera au prochain tirage (64 pas au plus)";
      }
      m8[A.meteo] = arg;
      dv.setUint32(A.debutDeLIntemperie, c.pas, true);
      return `temps : ${METEOS[arg] || arg}, pour 200 à 1 000 pas`;
    case COMMANDES.recherche: {
      let d = 0;
      for (let k = 0; k < 6; k++) {
        if (!L.u8(c.fp + FP.domainesOuverts + k)) continue;
        const a = c.fp + FP.points + 2 * k;
        dv.setInt16(a, Math.min(32000, L.s16(a) + arg), true);
        d++;
      }
      return `${arg} points donnés à ${d} domaines ouverts ; les découvertes viendront à la fin du mois`;
    }
    case COMMANDES.reparer: {
      let n = 0;
      pourChaque(c, 4, (o) => { if (L.u16(o + 0x2E)) { dv.setUint16(o + 0x2E, 0, true); n++; } });
      return `${n} attractions remises à neuf`;
    }
    case COMMANDES.triche:
      dv.setInt16(A.drapeauTricheur, arg ? 1 : 0, true);
      return arg ? 'drapeau tricheur levé : C, Ctrl+C, Alt+Z, F8 et 8 répondent' : 'drapeau tricheur baissé';
    case COMMANDES.contenter: {
      let n = 0;
      pourChaque(c, 2, (o) => {
        if (L.u8(o + 0xC) === 0x48 || L.s8(o + 0x4F) === -1) return;
        dv.setInt16(o + 0x54, arg, true); n++;
      });
      return `${n} visiteurs à ${arg} de contentement`;
    }
    default: return `commande inconnue ${code}`;
  }
}

// L'instantané de l'onglet ouvert : les valeurs, en textes, et les tables.
function instantane(m, onglet, choix) {
  const c = contexte(m);
  const def = ONGLETS[onglet - 1];
  if (!def) return null;
  const r = { onglet, charge: c.charge, titre: c.L.u16(A.ecranCourant) === 0x50, valeurs: {} };
  if (!c.charge) return r;
  for (const g of def.groupes) {
    for (const x of g.valeurs) {
      try { r.valeurs[x.cle] = x.lire(c); } catch (e) { r.valeurs[x.cle] = `erreur : ${e.message}`; }
    }
  }
  if (def.table === 'objets') r.tables = tablesDesObjets(c);
  else if (def.table === 'recherche') r.tables = { recherche: tableDeLaRecherche(c) };
  else if (def.table === 'concurrents') r.tables = { concurrents: tableDesConcurrents(c) };
  else if (def.table === 'etat') {
    r.tables = { trophees: tableDesTrophees(c), classements: tableDesClassements(c), grandeurs: tableDesGrandeurs(c),
      journal: tableDuJournal() };
  }
  else if (def.table === 'fiche') r.fiche = ficheDUnObjet(c, choix);
  return r;
}

// L'état de la fenêtre côté travailleur. `onglet` : 0 la fenêtre est fermée (rien ne tourne), sinon
// le rang de l'onglet ouvert, à partir de 1 ; `objet` : l'objet de la fiche, 0 pour l'objet désigné.
export const debogage = {
  onglet: 0,
  objet: 0,
  prochain: 0,
  periode: 250,          // ms réelles entre deux instantanés
  // type 13 de la file des entrées : (onglet, objet) ; la fenêtre fermée, le guet est retiré
  demander(onglet, objet) {
    this.onglet = onglet; this.objet = objet; this.prochain = 0;
    if (!onglet) retirerLeGuet();
  },
  // type 14 : (commande, argument) ; le compte rendu part à la page. Ce que la commande change est
  // noté comme tel dans le journal de l'état du parc.
  commander(m, code, arg, envoyer) {
    if (guet.pose && guet.m === m) comparer(ENTRE_DEUX_IMAGES);
    const r = commander(m, code, arg);
    if (guet.pose && guet.m === m) comparer(COMMANDE);
    envoyer({ debogage: { commande: r } });
    this.prochain = 0;
  },
  // à chaque passage des observateurs, fenêtre ouverte seulement : le guet posé (ou reposé), puis ce
  // qu'aucune fonction enveloppée n'aurait écrit, et l'instantané, quatre fois par seconde
  tic(m, reel, envoyer) {
    guetter(m);
    comparer(ENTRE_DEUX_IMAGES);
    if (reel < this.prochain) return;
    this.prochain = reel + this.periode;
    envoyer({ debogage: instantane(m, this.onglet, this.objet) });
  },
};
