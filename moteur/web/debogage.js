// La fenêtre de débogage de la page : un panneau à droite, ouvert par le bouton « débogage » du
// bandeau ou la touche ² (Backquote), qui montre l'état du jeu lu en direct dans sa mémoire.
//
// Son premier onglet, « Réglages », est à la page seule : il montre les boutons des réglages de la
// page (#reglages-de-la-page, dans index.html et local.html, que principal.js tient : son, 640x480,
// défilement, grande vue, souris, « original bug fix », parties…), retirés de l'écran pour le garder
// net. Le jeu n'a rien à en lire : pendant cet onglet, le travailleur est prié de ne rien envoyer
// (onglet 0, comme fermé).
//
// La description des onglets (noms, adresses, renvois à la documentation) vient de
// moteur/jeu/debogage.js ; les valeurs, du travailleur, qui envoie un instantané de l'onglet ouvert
// quatre fois par seconde, et seulement quand le panneau est ouvert. La page lui parle par la file
// des entrées (principal.js, `envoyer`) : le type 13 ouvre, ferme ou change l'onglet et l'objet
// montré ; le type 14 porte une commande. Les commandes sont hors du jeu d'origine.

import { ONGLETS, TABLES, COMMANDES, DOC } from '../jeu/debogage.js';

const NOMS_DES_TABLES = { attractions: 'Attractions', accidents: 'Les accidents (les 60 derniers)', boutiques: 'Boutiques', personnel: 'Personnel',
  voyous: 'Voyous', installations: 'Installations', visiteurs: 'Visiteurs (les 400 premiers)',
  recherche: 'Les six domaines', concurrents: 'Les joueurs (fiches non vides)',
  trophees: "Les trophées, si l'année finissait maintenant", classements: 'Les classements, maintenant',
  grandeurs: 'Les grandeurs de la fiche du parc', journal: 'Ce qui les a changées (les plus récentes en haut)' };

const bulle = (ou, doc) => `${ou} — ${doc.startsWith('§') ? `${DOC} ${doc}` : doc}`;

function element(nom, attributs = {}, ...enfants) {
  const e = document.createElement(nom);
  for (const [k, v] of Object.entries(attributs)) {
    if (k === 'classe') e.className = v;
    else if (k === 'texte') e.textContent = v;
    else if (k.startsWith('sur')) e.addEventListener(k.slice(3), v);
    else e.setAttribute(k, v);
  }
  for (const x of enfants) if (x) e.append(x);
  return e;
}

// Ce qui est statique : les secrets et les commandes.
const SECRETS = [
  ['Le code de triche est un surnom : HORZA', "0x2EA62 décale chaque lettre du surnom de son rang et compare à 48 9E 48 D0 10 (0xB8C58). Les bits perdus laissent passer d'autres noms, HORZQ par exemple. Le drapeau 0xD6682 est levé, jamais baissé.", '§ 7'],
  ['Les touches du tricheur', "C : +50 000 au solde (« C'EST VOUS VIENT D'UTILISER LE CHEAT MODE ») ; Ctrl+C : +15 536 ; Alt+Z, Ctrl+Z, Maj+Z : tous les articles des catalogues disponibles ; F8 et 8 : les négociations du personnel et des fournisseurs.", '§ 7, § 11.1'],
  ['F3 et F4 dans le parc', 'Vitesse −1 et +1, sans borne ni coche : au-delà des quatre crans du menu (−2, 0, 1, 20).', '§ 11.1'],
  ['Les incidents au tour n\'arrivent jamais', "0x65F71 demande un délai d'animation au-delà de 6 : aucun genre n'en a, l'interface le règle de 0 à 6. Les accidents qui arrivent sont les éjections des montagnes russes, les incidents des circuits et les explosions (onglet Objets, les accidents).", '§ 10.3'],
  ['Des états de visiteurs morts', "Les états 0x28 à 0x2E ne sont posés sur un visiteur que par leurs propres routines : du code mort.", '§ 10.2, § 10.10'],
  ['Le wagon qui sort de la voie', "0x43A33 : tout retrait de rail passe d'abord par la fermeture de l'attraction. Inatteignable en jeu ; sa vitesse dépendrait de la position de la souris.", '§ 10.10, § 10.17'],
  ['Le tracé tronqué', "La valeur 0x10 de 0xD667C (hauteur 0xD6686) n'est jamais posée : vraisemblablement mort.", '§ 6.4'],
  ["La démonstration", "Elle ne se lance, après 3 000 images sans geste à l'écran titre, que si save/demo.gy existe. Un joueur nommé DEMO qui « continue la partie » joue dans le parc de la démonstration.", '§ 7, § 11.9'],
  ['F4 à l\'écran titre', "Revoir l'introduction fait sortir le programme avec le code 10.", '§ 7'],
  ['Le réseau', "L'option -m (0xD7792) : un second bloc de cadence et des chemins de partie à plusieurs, jamais atteints sans elle.", '§ 11.1, § 11.6'],
  ['Les commandes 3 et 5 des menus', 'Le clavier réduit (0xB14C6) et le retour sans outil : aucune ligne de menu ne les emploie.', '§ 11.10'],
  ['Le gardien bénévole', "À l'embauche, le gardien ne reçoit pas de salaire, et le bouton « − » de sa fiche ne le baisse jamais.", '§ 10.5'],
  ['Le visage à sept niveaux', "Le panneau compare le mot long +0xAE de la fiche du parc aux seuils +0 et +2, avec les marges 300 et 50.", '§ 11.8'],
  ['Les restes de pile', "L'état 4 des visiteurs lit une variable qu'il n'a pas écrite : l'octet qu'y a laissé la routine précédente. La simulation en dépend.", '§ 10.1'],
];

const BOUTONS = [
  ['Argent', [['+10 000', COMMANDES.argent, 10000], ['+100 000', COMMANDES.argent, 100000], ['−10 000', COMMANDES.argent, -10000]],
    'Ajoute au solde (fiche du joueur +0x0A).'],
  ['Vitesse', [['lent', COMMANDES.vitesse, -2], ['normal', COMMANDES.vitesse, 0], ['rapide', COMMANDES.vitesse, 1], ['ultra', COMMANDES.vitesse, 20], ['×50', COMMANDES.vitesse, 50]],
    'Écrit 0xD6634 et les coches du menu (0xD775A à 0xD775D). ×50 est hors des crans du menu, comme F4 répété.'],
  ['Météo', [['beau', COMMANDES.meteo, 0], ['pluie', COMMANDES.meteo, 1], ['neige', COMMANDES.meteo, 2], ['orage', COMMANDES.meteo, 4]],
    "Écrit 0xB14CC et le début 0xB14CD ; « beau » vieillit l'intempérie, que le jeu finit lui-même (palette reposée)."],
  ['Recherche', [['+5 000 points', COMMANDES.recherche, 5000], ['+30 000 points', COMMANDES.recherche, 30000]],
    'Ajoute aux points (fiche du parc +0x120) des domaines ouverts ; les découvertes viennent à la fin du mois (0x53F13).'],
  ['Attractions', [['tout réparer', COMMANDES.reparer, 0]], "Remet l'usure (+0x2E) de chaque attraction à 0."],
  ['Visiteurs', [['contentement 1 000', COMMANDES.contenter, 1000], ['contentement 0', COMMANDES.contenter, 0]],
    'Écrit le contentement (+0x54) de chaque visiteur entré.'],
  ['Triche', [['lever le drapeau', COMMANDES.triche, 1], ['le baisser', COMMANDES.triche, 0]],
    'Écrit 0xD6682, comme le surnom HORZA ; le jeu, lui, ne le baisse jamais.'],
];

// (le numéro de l'onglet « Réglages » ; ceux du jeu vont de 1 à ONGLETS.length)
const REGLAGES = 0;

export function installerDebogage({ envoyer, canvas }) {
  const reglagesPage = document.getElementById('reglages-de-la-page');
  let ouvert = false, onglet = reglagesPage ? REGLAGES : 1, objet = 0, dernier = null;
  try {
    ouvert = localStorage.getItem('themepark.debogage') === 'oui';
    const o = Number(localStorage.getItem('themepark.debogage.onglet'));
    if (o >= 1 && o <= ONGLETS.length) onglet = o;
  } catch (e) { /* stockage indisponible */ }

  const bouton = document.getElementById('debogage-bouton');
  const barre = element('nav', { classe: 'onglets' });
  const corps = element('div', { classe: 'corps' });
  const etat = element('div', { classe: 'etat', texte: 'en attente du jeu…' });
  const panneau = element('aside', { id: 'debogage', 'aria-label': 'Fenêtre de débogage' },
    element('header', {},
      element('b', { texte: 'Débogage' }),
      element('span', { texte: 'lu dans la mémoire du jeu ; survoler un nom : son adresse' }),
      element('button', { type: 'button', title: 'Fermer (²)', texte: '×', surclick: () => basculer(false) })),
    barre, etat, reglagesPage, corps);
  document.body.append(panneau);

  const boutonReglages = reglagesPage && element('button', { type: 'button', texte: 'Réglages',
    title: 'Les réglages de la page, tous allumés par défaut ; un choix fait ici est gardé dans ce navigateur',
    surclick: () => choisir(REGLAGES) });
  if (boutonReglages) barre.append(boutonReglages);

  const onglets = ONGLETS.map((o, k) => {
    const b = element('button', { type: 'button', texte: o.titre, surclick: () => choisir(k + 1) });
    barre.append(b);
    return b;
  });

  // les cases des valeurs de l'onglet affiché, par clé
  let cases = new Map(), zoneTables = null, zoneFiche = null, journal = null;
  // L'état du parc : montrer aussi, au journal, les compteurs que la vie du parc change sans cesse
  // (visiteurs entrés, déchets…) ; la première colonne de ses lignes le dit, et n'est pas affichée.
  let quotidien = true;
  try { quotidien = localStorage.getItem('themepark.debogage.quotidien') !== 'non'; } catch (e) { /* idem */ }

  function envoyerEtat() { envoyer(13, ouvert && onglet !== REGLAGES ? onglet : 0, objet); }

  function basculer(voulu = !ouvert) {
    ouvert = voulu;
    document.body.classList.toggle('debogage', ouvert);
    bouton.setAttribute('aria-pressed', ouvert ? 'true' : 'false');
    try { localStorage.setItem('themepark.debogage', ouvert ? 'oui' : 'non'); } catch (e) { /* idem */ }
    envoyerEtat();
    window.dispatchEvent(new Event('resize'));    // l'image du jeu se recadre (principal.js)
    if (ouvert) construire();
  }

  function choisir(k, n) {
    onglet = k;
    if (n !== undefined) objet = n;
    try { localStorage.setItem('themepark.debogage.onglet', String(k)); } catch (e) { /* idem */ }
    envoyerEtat();
    construire();
  }

  // --- la construction de l'onglet ------------------------------------------------------------------
  function construire() {
    onglets.forEach((b, k) => b.classList.toggle('choisi', k + 1 === onglet));
    if (boutonReglages) boutonReglages.classList.toggle('choisi', onglet === REGLAGES);
    if (reglagesPage) reglagesPage.hidden = onglet !== REGLAGES;
    corps.hidden = onglet === REGLAGES;
    corps.replaceChildren();
    cases = new Map(); zoneTables = null; zoneFiche = null; journal = null;
    blocs = new Map(); cleDeLaFiche = '';
    if (onglet === REGLAGES) {
      etat.textContent = 'les réglages de la page ; survoler un bouton : ce qu\'il fait';
      return;
    }
    if (!dernier || dernier.onglet !== onglet) etat.textContent = 'en attente du jeu…';
    const def = ONGLETS[onglet - 1];
    if (def.statique === 'commandes') corps.append(construireCommandes());
    for (const g of def.groupes) {
      const dl = element('dl');
      for (const x of g.valeurs) {
        const dd = element('dd', { texte: '…' });
        dl.append(element('dt', { title: bulle(x.ou, x.doc), texte: x.nom }), dd);
        cases.set(x.cle, dd);
      }
      corps.append(element('details', { open: '' }, element('summary', { texte: g.titre }), dl));
    }
    if (def.table === 'fiche') corps.append(construireFiche());
    else if (def.table) {
      zoneTables = element('div');
      // une ligne d'objet cliquée ouvre sa fiche (à l'appui : la table peut être rafraîchie avant le relâchement)
      zoneTables.addEventListener('mousedown', (e) => {
        const tr = e.target.closest('tr[data-n]');
        if (tr) choisir(ONGLETS.findIndex((o) => o.id === 'fiche') + 1, Number(tr.dataset.n));
      });
      if (def.table === 'etat') zoneTables.append(construireOptionsDeLEtat());
      corps.append(zoneTables);
    }
    if (def.statique === 'secrets') corps.append(construireSecrets());
    if (dernier && dernier.onglet === onglet) afficher(dernier);
  }

  function construireOptionsDeLEtat() {
    const case_ = element('input', { type: 'checkbox' });
    case_.checked = quotidien;
    case_.addEventListener('change', () => {
      quotidien = case_.checked;
      try { localStorage.setItem('themepark.debogage.quotidien', quotidien ? 'oui' : 'non'); } catch (e) { /* idem */ }
      if (dernier && dernier.onglet === onglet) afficher(dernier);
    });
    return element('div', {},
      element('p', { classe: 'aide', texte: "Ce que la fin d'année évaluera (trophées, classements), les grandeurs du parc qui le font, "
        + "et ce qui les a changées : la fonction du jeu qui a écrit la valeur, et la cause. Le journal n'est tenu que fenêtre ouverte ; "
        + "ce qui a changé pendant qu'elle était fermée est noté sans auteur à sa réouverture." }),
      element('label', { classe: 'option' }, case_, document.createTextNode(' montrer au journal les compteurs du quotidien (visiteurs, déchets, décor, toilettes…)')));
  }

  function construireSecrets() {
    const d = element('details', { open: '' }, element('summary', { texte: 'Ce que la documentation signale comme caché ou mort' }));
    for (const [titre, texte, doc] of SECRETS) {
      d.append(element('p', { title: bulle('', doc).replace(/^ — /, '') }, element('b', { texte: titre }), document.createTextNode(` — ${texte} `),
        element('span', { classe: 'renvoi', texte: doc })));
    }
    return d;
  }

  function construireCommandes() {
    const d = element('details', { open: '' }, element('summary', { texte: 'Commandes' }),
      element('p', { classe: 'avertissement', texte: "Hors du jeu d'origine : chaque commande écrit des variables du jeu, "
        + 'à la prochaine lecture des entrées par le travailleur. La partie diverge alors de celle de 1994 ; '
        + 'une sauvegarde faite ensuite garde ces valeurs.' }));
    for (const [titre, liste, aide] of BOUTONS) {
      const ligne = element('div', { classe: 'commande', title: aide }, element('span', { texte: titre }));
      for (const [texte, code, arg] of liste) {
        ligne.append(element('button', { type: 'button', texte, surclick: () => {
          envoyer(14, code, arg);
          journal.textContent = `${titre} : ${texte}…`;
          canvas.focus();
        } }));
      }
      d.append(ligne);
    }
    journal = element('p', { classe: 'journal', texte: '' });
    d.append(journal);
    return d;
  }

  function construireFiche() {
    const champ = element('input', { type: 'number', min: '0', value: String(objet), title: "Numéro d'objet ; 0 : l'objet désigné dans le jeu" });
    champ.addEventListener('change', () => choisir(onglet, Math.max(0, Number(champ.value) | 0)));
    zoneFiche = element('div');
    return element('div', { classe: 'fiche' },
      element('div', { classe: 'selecteur' },
        element('label', {}, document.createTextNode('objet n° '), champ),
        element('button', { type: 'button', texte: "suivre l'objet désigné", title: "Cliquer un objet dans le parc le désigne (0xD6678)",
          surclick: () => { champ.value = '0'; choisir(onglet, 0); } })),
      zoneFiche);
  }

  // --- l'affichage d'un instantané ----------------------------------------------------------------
  // Les tables et la fiche sont mises à jour sur place, pas refaites : un clic sur un titre ou une
  // ligne ne doit pas tomber entre deux rafraîchissements.
  let blocs = new Map(), cleDeLaFiche = '', partsDeLaFiche = null;

  function majTable(nom, lignes, cliquable) {
    if (nom === 'journal') lignes = lignes.filter((l) => quotidien || !l[0]).map((l) => l.slice(1));
    let b = blocs.get(nom);
    if (!b) {
      const tete = element('tr');
      for (const [titre, info] of TABLES[nom]) tete.append(element('th', { title: info, texte: titre }));
      const tbody = element('tbody'), resume = element('summary');
      const details = element('details', { open: '' }, resume, element('table', {}, element('thead', {}, tete), tbody));
      b = { details, tbody, resume };
      blocs.set(nom, b);
      zoneTables.append(details);
    }
    b.resume.textContent = `${NOMS_DES_TABLES[nom]} (${lignes.length})`;
    if (!b.details.open) return;
    b.tbody.replaceChildren(...lignes.map((l) => {
      const tr = element('tr');
      for (const x of l) tr.append(element('td', { texte: String(x) }));
      if (cliquable) { tr.className = 'cliquable'; tr.dataset.n = String(l[0]); tr.title = 'voir sa fiche'; }
      return tr;
    }));
  }

  function majFiche(f) {
    if (f.vide) {
      cleDeLaFiche = '';
      zoneFiche.replaceChildren(element('p', { texte: f.n ? `aucun objet ${f.n} (1 à ${f.nombre})` : 'aucun objet désigné : cliquer un objet dans le parc, ou taper son numéro' }));
      return;
    }
    const cle = `${f.n}:${f.type}`;
    if (cle !== cleDeLaFiche) {
      cleDeLaFiche = cle;
      const dl = element('dl'), valeurs = [];
      for (const [off, nom] of f.champs) {
        const dd = element('dd');
        valeurs.push(dd);
        dl.append(element('dt', { title: `objet ${off}` }, document.createTextNode(`${nom} `), element('span', { classe: 'renvoi', texte: off })), dd);
      }
      partsDeLaFiche = { titre: element('p'), resume: element('p'), valeurs, octets: element('pre') };
      zoneFiche.replaceChildren(partsDeLaFiche.titre, partsDeLaFiche.resume, dl,
        element('details', {}, element('summary', { texte: 'Les 200 octets' }), partsDeLaFiche.octets));
    }
    const p = partsDeLaFiche;
    const titre = `n° ${f.n} — ${f.nomDuType}${f.nom ? ` : ${f.nom}` : ''}, à ${f.adresse}${f.n === f.designe ? ' (désigné dans le jeu)' : ''}`;
    if (p.titre.textContent !== titre) p.titre.textContent = titre;
    if (p.resume.textContent !== f.resume) p.resume.textContent = f.resume;
    f.champs.forEach(([, , val], k) => { if (p.valeurs[k].textContent !== String(val)) p.valeurs[k].textContent = String(val); });
    if (p.octets.textContent !== f.octets) p.octets.textContent = f.octets;
  }

  function afficher(d) {
    for (const [cle, dd] of cases) {
      const v = d.valeurs[cle];
      if (v !== undefined && dd.textContent !== v) dd.textContent = v;
    }
    if (zoneTables && d.tables) {
      const cliquable = ONGLETS[onglet - 1].id === 'objets';
      for (const [nom, lignes] of Object.entries(d.tables)) majTable(nom, lignes, cliquable);
    }
    if (zoneFiche && d.fiche) majFiche(d.fiche);
  }

  function recevoir(d) {
    if (!d) return;
    if (d.commande !== undefined) { if (journal) journal.textContent = d.commande; return; }
    if (!ouvert || onglet === REGLAGES) return;
    dernier = d;
    etat.textContent = !d.charge ? "pas de parc chargé"
      : `mis à jour à ${new Date().toLocaleTimeString('fr-FR')}${d.titre ? " — à l'écran titre : pas de parc en cours, valeurs sans objet" : ''}`;
    if (d.onglet === onglet) afficher(d);
  }

  // --- l'ouverture : le bouton et la touche ² (qui ne va donc plus au jeu) ------------------------
  bouton.addEventListener('click', (e) => { basculer(); e.stopPropagation(); });
  const estLaTouche = (e) => e.code === 'Backquote' || e.key === '²';
  window.addEventListener('keydown', (e) => {
    if (!estLaTouche(e)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) basculer();
  }, true);
  window.addEventListener('keyup', (e) => { if (estLaTouche(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  basculer(ouvert);
  return { recevoir };
}
