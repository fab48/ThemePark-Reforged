// Les variables du jeu, derrière des noms.
//
// Tant que la réécriture n'est pas terminée, l'état du jeu reste là où le programme d'origine le
// range : dans sa mémoire, aux adresses de 1994. Le code lisible y accède par ces accesseurs, et
// le code encore transcrit continue d'y accéder directement — les deux voient la même chose.
//
// Les adresses sont celles du code décompilé (l'objet de données est chargé à 0xB0000). La
// convention de Ghidra et celle du désassembleur diffèrent de 0xB0000 : `0x2667A` du journal
// d'origine s'écrit ici `0xD667A`.

export const ADRESSES = {
  // --- vue et caméra ---------------------------------------------------------------------
  cameraColonne: 0xD667A,      // mot signé, 0 à 63
  cameraRangee: 0xD6666,       // mot signé, 0 à 63
  origineDessinX: 0xD6624,     // origine du dessin en pixels, axe horizontal
  largeurTuile: 0xD663A,       // 48 en basse résolution, 24 en haute
  hauteurTuile: 0xD6654,       // 32 ou 16
  redessinerCarte: 0xD666E,    // mot : demande de redessin complet
  modeAffichage: 0xDE5F6,      // mot : 1 = basse résolution (320x200), 8 = haute (640x480)
  tamponEcran: 0xDE5BC,        // pointeur vers l'image en cours de construction
  // --- temps et cadence ------------------------------------------------------------------
  pasDeSimulation: 0xD3AFC,    // mot long : nombre de pas depuis le début de la partie
  vitesseJeu: 0xD6634,         // mot signé : négatif = lent, positif = rapide
  compteurVitesseLente: 0xD7766,  // octet : images comptées entre deux pas, aux vitesses lentes
  // --- écrans ----------------------------------------------------------------------------
  ecranCourant: 0xD6652,       // mot : 0 = le parc, autres valeurs = les écrans de gestion
  quitterLaPartie: 0xD6688,    // mot : demande de sortie de la boucle principale
  // --- souris ----------------------------------------------------------------------------
  sourisX: 0xBECAC,            // mot : position horizontale, unités du pilote (0 à 639)
  sourisY: 0xBECAE,            // mot : position verticale (0x10992 recopie ici le DX du pilote)
  // --- divers établis --------------------------------------------------------------------
  centrerCameraSurCarte: 0xBA0F8,  // octet signé : négatif = caméra libre, sinon on la recentre
  // (le même octet est l'étape du tutoriel, 0 à 27, négative hors du tutoriel : § 3, § 11.11)
  etapeDuTutoriel: 0xBA0F8,

  // --- ajoutées pour la fenêtre de débogage (moteur/jeu/debogage.js) ---------------------
  // Les renvois sont ceux de docs/retro-ingenierie.md.
  // le temps et le hasard (§ 10.1, § 11.1)
  passagesDesObjets: 0xD3AF8,  // mot long : passages de la mise à jour des objets (0x21681)
  etatDuHasard: 0xD3AF4,       // mot long : état × 0xBB40E62D à chaque tirage ; tirage = (état >> 8) & 0x7FFF
  enPause: 0xD779C,            // octet : le jeu est en pause (touche P) (§ 11.8)
  drapeauxDesVitesses: 0xD775A,  // 4 octets : les coches LENT, NORMAL, RAPIDE, ULTRA-RAPIDE (§ 11.10)
  // les joueurs et les parcs (§ 7, § 10.8)
  joueurCourant: 0xD665C,      // mot
  fichesDesJoueurs: 0xD3B00,   // pointeur : 25 fiches de 0x222 octets (FICHE_DU_JOUEUR)
  ficheDuJoueur: 0xD3808,      // pointeur : la fiche du joueur courant
  comptesDuJoueur: 0xD3814,    // pointeur : 0xD443C + joueur × 0x6C2 (COMPTES)
  parcDuJoueur: 0xD3818,       // pointeur : 0xCF1E0 + parc × 0x250 (FICHE_DU_PARC)
  comptes: 0xD443C,            // les comptes des 25 joueurs ; le nom du joueur en tête
  parcs: 0xCF1E0,              // les fiches des parcs, 0x250 octets
  nomsDesJoueurs: 0xD7B98,     // pointeur : table des noms des concurrents, indexée par l'octet +1 de la fiche
  // les objets du parc (§ 6.4)
  objetsDuParc: 0xD3B10,       // pointeur : objets de 200 octets, numérotés depuis 1
  finDesObjets: 0xD3B78,       // pointeur : la fin de la table
  objetDesigne: 0xD6678,       // mot : l'objet choisi dans le parc (0 = aucun)
  outilEnMain: 0xD6670,        // mot
  // les catalogues (§ 10.3 à § 10.5, § 11.12)
  catalogueDesAttractions: 0xCCED0,  // fiches de 200 octets, nom en tête ; l'objet donne le décalage (+0x16)
  catalogueDeReference: 0xB16F8,     // les fiches de référence, 200 octets
  catalogueDesBoutiques: 0xD3C62,    // 17 fiches de 107 octets ; l'objet donne le décalage (+0x16)
  catalogueDesInstallations: 0xCCA70,  // fiches de 0x38 octets ; l'objet donne le rang (+0x16)
  catalogueDesMetiers: 0xD35C0,      // 9 fiches de 0x36 octets ; l'employé donne le rang (+0x59)
  marchandises: 0xD3C00,             // fiches de 14 octets : +2 prix, +4 stock, +6 en commande
  // la fiche du joueur sur disque et la triche (§ 7, § 11.4)
  votreNom: 0xD6690,           // texte
  surnom: 0xD66B0,             // texte : le nom des sauvegardes, et celui que teste la triche
  nomDuParc: 0xD66D0,          // texte
  nombreDeConcurrents: 0xD66F0,  // octet : 0, 4, 10, 25
  niveauDeJeu: 0xD66F1,        // octet : 0 MATERNELLE (SIMPLE), 1 SIMULATION (SIM.), 2 BUSINESS (GLOBALE)
  humeurDesVisiteurs: 0xD66F2, // octet : 0 HEUREUX, 1 NORMAUX, 2 RALEURS
  niveauDeDepart: 0xD66F5,     // octet : l'argent de départ, 200 000, 150 000, 100 000
  forceDesConcurrents: 0xD66F6,  // octet : FAIBLES, MOYENS, FORTS
  drapeauTricheur: 0xD6682,    // mot : levé par 0x2EA62 pour le surnom HORZA, jamais baissé
  codeDeTriche: 0xB8C58,       // 5 octets : 48 9E 48 D0 10, les lettres de HORZA décalées de leur rang
  // la météo (§ 11.1, § 11.19 ; economie.js)
  meteo: 0xB14CC,              // octet : 0 beau, bit 0 la pluie, bit 1 la neige, bit 2 l'orage
  vent: 0xB14CB,               // octet signé : −3 à 3
  debutDeLIntemperie: 0xB14CD, // mot long : le pas où elle a commencé ; elle cesse après 1 000 pas
  intemperiesDeLAnnee: 0xB14D1,  // octet : 4 au plus par an
  // la recherche (§ 11.10 ; economie.js, 0x53F13)
  nouvelleDecouverte: 0xD7768, // octet : la recherche vient d'aboutir (l'icône qui clignote)
  moinsChereExaminee: 0xD3588, // 6 mots longs : le prix de la découverte la moins chère examinée
  achatDuBusAutomatique: 0xD7763,  // octet : OPTIONS ▸ ACHAT BUS AUTO (Maj+B)
  // les négociations (§ 10.15)
  seanceDuPersonnel: 0xD3BB0,  // mot long : le pas de la dernière séance ratée
  seanceDesFournisseurs: 0xD3BAC,
  facteurDeLAnnee: 0xD668C,    // mot signé : tiré à chaque fin d'année
  plancher: 0xD77F8,           // mot long, en dixièmes de point
  offreDuJoueur: 0xD77FC,      // mot long
  plafond: 0xD7800,            // mot long : plancher + 500
  demandeAdverse: 0xD7804,     // mot long
  obstination: 0xD7808,        // mot signé, 0 à 8, jamais remise à zéro
};

// Les champs des grandes structures, en décalages (mêmes renvois). Les tailles : o octet, s octet
// signé, m mot, ms mot signé, l mot long, ls mot long signé.
export const TAILLES = {
  ficheDuJoueur: 0x222, ficheDuParc: 0x250, comptes: 0x6C2, objet: 200,
  ficheDAttraction: 200, ficheDeBoutique: 0x6B, ficheDInstallation: 0x38, metier: 0x36, marchandise: 14,
};
export const FICHE_DU_JOUEUR = {   // § 7, economie.js
  sorte: 0x00,         // o : 0 vide, 1 le joueur humain, 3 un concurrent
  rang: 0x01,          // o
  numeroDuParc: 0x02,  // m
  pays: 0x05,          // o : le mot 0xB7B43 + pays × 0x1C est son taux d'intérêt
  solde: 0x0A,         // ls
  engage: 0x0E,        // ls : retranché du solde affiché
  pret: 0x12,          // ls
  compteurDeDecouvert: 0x35,  // ms : le banquier prête d'office au-delà de prêt / 256 + 100
  depenses: 0x37,      // ls
  variationDuMois: 0xD5,  // ls
};
export const FICHE_DU_PARC = {     // § 10.8, economie.js, visiteurs-outils.js
  seuilContent: 0x00, seuilMecontent: 0x02,   // ms
  referenceDuPrix: 0x04,   // m : j = +4 × (+0x105 / 2 + +0x8A) / 128
  margeToleree: 0x06,      // m
  coefPlaisir: 0x08, coefBesoins: 0x0A, coefSalete: 0x0B, coefFoule: 0x0D,
  ouvert: 0x18,            // o
  prixDEntree: 0x1D,       // m
  visiteursPresents: 0x1F, // ms
  reputation: 0x21,        // s : « vraisemblablement »
  entreesCumulees: 0x33,   // m
  seuilDuGuichet: 0x47,    // o
  capaciteDesBus: 0x48, niveauDesBus: 0x49, plafondDesBus: 0x4A,   // o
  capaciteDeLEntrepot: 0x4B, niveauDeLEntrepot: 0x4D, plafondDeLEntrepot: 0x4E,
  voyous: 0x52,            // ms
  actionsEnVente: 0x60, actionsEmises: 0x62,   // m
  cours: 0x66, ancienCours: 0x6A,               // ls
  feuxDArtifice: 0x77,     // o
  installations: 0x7C, casesDeLac: 0x7E,        // m
  dechets: 0x80,           // m
  attractions: 0x82,       // o
  attraitMoyen: 0x8A,      // ls
  usureMoyenne: 0x97,      // ls
  explosees: 0x9F,         // o
  humeur: 0xAE,            // ls : comparée aux seuils +0 et +2 pour le visage
  richesse: 0x105,         // l
  reserveDeRecherche: 0x110, budgetDeRecherche: 0x112,   // m
  budgets: 0x114, points: 0x120,               // 6 ms chacun
  domainesOuverts: 0x248,                      // 6 o
  personnel: 0xC2, renvois: 0xC4,              // m
  derniereSeancePersonnel: 0xC6, derniereSeanceFournisseurs: 0xE1,   // l
  indiceDesSalaires: 0xCA, indiceDesPrix: 0xE5,  // m
  mecaniciens: 0xCC, agentsDEntretien: 0xD0, amuseurs: 0xD4,   // m
  mystereDesVoyous: 0xDA,  // ms : non établi
  buvettesAManger: 0xEC, buvettesABoire: 0xF8,   // o
};
export const COMPTES = {           // § 10.8, economie.js
  mecontents: 0x2B4, neutres: 0x2B6, contents: 0x2B8,   // m
  caseDeLEntree: 0x2CA,    // m
  recetteDesEntrees: 0x2D2,  // ls
  chargeDuBus: 0x5EE,      // o
  mois: 0x5ED,             // o
  salaireMinAgent: 0x615, salaireMinMecanicien: 0x617,   // m
  coutDeRecherche: 0x64C, coutAFinir: 0x664,   // 6 l chacun
  greve: 0x681, negociationPersonnel: 0x682, negociationFournisseurs: 0x683,   // o
  dernierTirageDesVoyous: 0x690,   // l
};

// Accès nommé à l'état du jeu. Chaque propriété lit ou écrit la variable d'origine.
export class Etat {
  constructor(machine) {
    this.m = machine;
    this.dv = machine.dv;
  }

  lireMot(adresse) { return this.dv.getInt16(adresse, true); }
  ecrireMot(adresse, v) { this.dv.setInt16(adresse, v, true); }
  lireOctet(adresse) { return this.m.m8[adresse]; }
  ecrireOctet(adresse, v) { this.m.m8[adresse] = v; }

  get cameraColonne() { return this.lireMot(ADRESSES.cameraColonne); }
  set cameraColonne(v) { this.ecrireMot(ADRESSES.cameraColonne, v); }
  get cameraRangee() { return this.lireMot(ADRESSES.cameraRangee); }
  set cameraRangee(v) { this.ecrireMot(ADRESSES.cameraRangee, v); }
  get largeurTuile() { return this.dv.getUint16(ADRESSES.largeurTuile, true); }
  get hauteurTuile() { return this.dv.getUint16(ADRESSES.hauteurTuile, true); }
  set redessinerCarte(v) { this.ecrireMot(ADRESSES.redessinerCarte, v); }
  // Le mode d'affichage ne prend que deux valeurs, 1 et 8 (vérifié : toutes les écritures du
  // programme, et la valeur 1 relevée en cours de partie alors que la carte vidéo est en 320x200).
  // Le code d'origine les distingue par 'test ..., 1' et 'test ..., 8'.
  get modeAffichage() { return this.lireMot(ADRESSES.modeAffichage); }
  get basseResolution() { return (this.modeAffichage & 1) !== 0; }
  get hauteResolution() { return (this.modeAffichage & 8) !== 0; }
  get pasDeSimulation() { return this.dv.getUint32(ADRESSES.pasDeSimulation, true); }
  get vitesseJeu() { return this.lireMot(ADRESSES.vitesseJeu); }
  get ecranCourant() { return this.lireMot(ADRESSES.ecranCourant); }
  get sourisX() { return this.dv.getUint16(ADRESSES.sourisX, true); }
  get sourisY() { return this.dv.getUint16(ADRESSES.sourisY, true); }
  get centrerCameraSurCarte() { return (this.m.m8[ADRESSES.centrerCameraSurCarte] << 24) >> 24; }
}
