// Le moteur réentrant : la variante du moteur autonome qui sait rendre la main.
//
// Pourquoi. Le programme de 1994 ne rend jamais la main : sa boucle principale, et les boucles qu'elle
// imbrique (les menus, la fin d'année, « cliquez pour continuer »), tournent jusqu'à ce que le joueur
// les quitte, en attendant le balayage de l'écran, une touche ou un clic. Le code lisible
// (moteur/jeu/) garde cette structure, et c'est ce qui le rend prouvable : il fait ce que faisait
// l'original, appel pour appel. Dans la page, il tourne donc dans un Web Worker, qui se cale sur le
// temps réel en dormant (Atomics.wait sur de la mémoire partagée) : il faut SharedArrayBuffer, donc un
// serveur qui envoie COOP et COEP. Pour une page ouverte d'un double-clic (file://), hors ligne, sur
// de vieux navigateurs (Chrome 49, Firefox 52), il n'y a ni l'un ni l'autre : le moteur doit tourner
// dans le fil de la page, et lui rendre la main à chaque image.
//
// Comment. Une fonction JavaScript ne peut s'interrompre au milieu que si elle est un générateur. Le
// moteur rend la main aux frontières d'appel du jeu : au retour de `jeu.appeler` ou
// `jeu.appelerDepuis`, dans l'attente active (`jeu.machine.tic`), si l'hôte l'a demandé
// (`machine.pauseDemandee`, posée par un observateur). Cet outil lit le code lisible et en écrit une
// copie où ces appels deviennent `(yield* …)` et les fonctions qui les contiennent des générateurs
// (`function*`, `*methode`, les fléchées récrites en `function*`), puis, par point fixe, les fonctions
// qui les appellent, et ainsi de suite. Les feuilles (le dessin d'un sprite, la lecture d'un mot)
// restent ordinaires. Une fléchée qui se contente de rendre l'appel d'un générateur (`(jeu) => f(jeu)`,
// la forme de beaucoup d'entrées `fn` des listes `reecritures`) reste telle quelle : elle rend
// l'itérateur, que son appelant parcourt.
//
// Quels appels ? Avec --partout, tous (la conception de départ) : c'est simple, et prouvé, mais V8
// n'intègre pas un générateur dans son appelant, et le moteur devient quatre à six fois plus lent sur
// un grand parc. Par défaut, seuls les appels qui peuvent mener à un point de pause : le repère
// d'image (toute image présentée commence par lui), le film joué par la page, le décodage d'une image
// de film, et les attentes actives (POINTS_DE_PAUSE, plus bas). Un pas de simulation, le dessin d'une
// vue, la mise à jour d'un visiteur restent ordinaires ; le moteur rend la main au moins une fois par
// image, ce que la page demande. Pour le savoir, l'outil suit :
//  - les adresses appelées : une constante désigne la fonction posée à cette adresse (les entrées
//    { adresse, fn } des listes de chaque module) ; une adresse lue dans la mémoire du jeu ou calculée
//    est inconnue, et par prudence mène à un point de pause (sauf ADRESSES_SANS_PAUSE, justifiées une
//    à une) ;
//  - les valeurs de fonctions : le code lisible en passe beaucoup (les routines ouvertes dans le cadre
//    de l'original, `dansLeCadre(taille, (jeu, cadre) => …)`, les tables de fonctions, les fermetures
//    rendues par une fonction, les méthodes d'objets, les tables Map) ; pour chaque variable,
//    paramètre, propriété, instance de classe et retour de fonction, l'ensemble des valeurs qui
//    peuvent s'y trouver, jusqu'au point fixe ;
//  - les relais : une aide qui ne rend la main que par ce qu'on lui passe (`avecCadre(…, corps)`,
//    `cadre.appeler(retour, adresse, …)`) garde sa version ordinaire et reçoit une jumelle générateur,
//    et chaque appel choisit d'après ses arguments (voir « Les relais », plus bas).
// Si l'analyse se trompait, rien ne casserait : un appel laissé ordinaire qui tomberait sur un
// générateur le parcourt d'une traite (`executerSansPause`), et la pause perdue est comptée ; les
// vérificateurs affichent ce compte, et le plus long temps passé sans rendre la main.
//
// Ce qu'il ne sait pas faire, il le dit et s'arrête : une fonction devenue générateur qui part vers
// du code qui n'est pas du jeu (une fermeture passée à forEach, map, sort…, qui ne peut pas contenir
// `yield`), un constructeur ou un accesseur qui devrait le devenir, une fonction fléchée qui lit
// `this` ou `arguments`. Ces cas-là sont à réécrire à la main dans moteur/jeu (en boucles : le code
// d'origine le permet toujours) ; la liste est dans le rapport, fichier:ligne.
//
// Le reste est l'affaire de l'hôte, adapté ici aussi, par des retouches du texte vérifiées (chacune
// doit trouver exactement son texte d'origine, sinon l'outil s'arrête en le disant) :
//  - moteur/jeu/index.js : `contexte` (appeler et appelerDepuis ordinaires ; appelerReentrant,
//    appelerDepuisReentrant et ticReentrant, qui rendent de quoi faire `yield*`) et `enveloppe`
//    (hybride : elle rend undefined quand la fonction a fini, ou l'itérateur qui la finira), récrits
//    d'après des gabarits (plus bas) ;
//  - moteur/hote/processeur.js : `appeler` rend ce que rend la fonction de l'adresse ;
//  - moteur/hote/machine.js : le repère d'image rend ce que rend la fonction qu'il enveloppe ; les
//    gestionnaires d'interruption s'exécutent d'une traite (`executerSansPause`) : une interruption
//    ne rend pas la main au navigateur ; `demarrer` rend l'exécution, qu'un pilote conduit.
// Les pilotes sont dans moteur/hote/reentrance.js, écrit à la main : ils ne dépendent pas du code du
// jeu, et la page aura le sien.
//
// Le moteur actuel n'est pas touché : la variante est écrite dans un dossier de construction,
// travail/reentrant/moteur/ (jeu/ et hote/ : le code lisible transformé et l'hôte retouché, qui
// s'importent comme ceux de moteur/). Les lignes n'y bougent pas (les jumelles et les importations
// sont ajoutées à la fin) : une erreur dans la variante se lit à la même ligne du code lisible. Les
// vérificateurs la prennent avec --reentrant (moteur/node/verifier.mjs, verifier-tout.mjs) : la même
// partie, relevé pour relevé, avec le moteur autonome et avec le moteur réentrant ;
// moteur/node/mesurer-reentrant.mjs en mesure le coût.
//
// Usage : node moteur/node/reentrer.mjs [--partout] [--points-de-pause a,b] [--sortie dossier]
//                                       [--analyse] [--detail] [--indirects]
//   --analyse : le rapport seul, sans rien écrire ; --detail : chaque générateur et pourquoi, et les
//   adresses inconnues ; --indirects : les appels qui passent par `deleguer`.
// L'analyseur est celui de Node (acorn, dans ses modules internes : aucune dépendance à installer) ;
// l'outil se relance lui-même avec --expose-internals s'il le faut.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(ICI, '..', '..');

// --- L'analyseur ---------------------------------------------------------------------------------------
let acorn;
try {
  acorn = createRequire(import.meta.url)('internal/deps/acorn/acorn/dist/acorn');
} catch {
  const r = spawnSync(process.execPath, ['--expose-internals', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}
const analyser = (texte) => acorn.parse(texte, { ecmaVersion: 2022, sourceType: 'module', locations: true });

const args = process.argv.slice(2);
const opt = (nom, def) => { const k = args.indexOf(nom); return k >= 0 ? args[k + 1] : def; };
const ANALYSE_SEULE = args.includes('--analyse');
const DETAIL = args.includes('--detail');
const INDIRECTS = args.includes('--indirects');
// --partout : chaque appel du jeu rend la main (la conception de départ) ; par défaut, seuls ceux qui
// peuvent mener à un point de pause (plus bas, POINTS_DE_PAUSE).
const PARTOUT = args.includes('--partout');
// Les points de pause de l'hôte : les adresses dont l'appel peut rendre la main au pilote. Le repère
// d'image (0x7D775, la pose du curseur par laquelle toute image présentée commence, machine.js) et le
// film d'une attraction (0x5C04F, que la page remplace pour jouer le mp4 et en attendre la fin,
// moteur/web/travailleur.js), et le décodage d'une image des films FLC (0x60E30, son-du-jeu.js) : le
// lecteur de films ne pose pas le curseur, et quand il ne montre pas ses images (le délai entre deux
// images nul), il décode des secondes de film sans autre point de pause. Et la touche traduite
// (0x7E888, systeme.js) : des attentes du joueur la relisent en boucle sans présenter d'image
// (l'écran titre, amorcage.js ecranDAttente) ; le temps n'y passe que par le service du clavier,
// sans point de pause, et la page, qui ne reprenait jamais la main, ne pouvait pas lui donner la
// touche attendue (travail/portable/attentes-sans-pause.mjs les relève : avec 0x7E888, aucune attente
// de plus de 33 ms virtuelles sur les 46 scénarios ; 0x875A4, qu'elle appelle, n'y ajoute rien et
// rendrait la boucle plus coûteuse). --points-de-pause a,b les remplace.
const POINTS_DE_PAUSE = new Set((opt('--points-de-pause', '0x7D775,0x5C04F,0x60E30,0x7E888')).split(',').map((a) => parseInt(a, 16) >>> 0));
const SORTIE = path.resolve(RACINE, opt('--sortie', path.join('travail', 'reentrant', 'moteur')));
const SOURCE = path.join(RACINE, 'moteur');

const problemes = [];               // ce qui empêche la transformation : l'outil s'arrête
const avertissements = [];          // ce qui mérite un regard, sans l'empêcher

// --- Parcours générique de l'arbre ----------------------------------------------------------------------
function* enfants(n) {
  for (const k in n) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k.startsWith('__')) continue;
    const v = n[k];
    if (Array.isArray(v)) { for (const e of v) if (e && typeof e.type === 'string') yield e; }
    else if (v && typeof v.type === 'string') yield v;
  }
}
function* tousLesNoeuds(n) {
  yield n;
  for (const e of enfants(n)) yield* tousLesNoeuds(e);
}
const estFonction = (n) => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression'
  || n.type === 'ArrowFunctionExpression';

// --- Les portées ---------------------------------------------------------------------------------------
// Assez pour résoudre un nom : la portée du module (importations comprises), celles des fonctions
// (paramètres, `var`) et des blocs (`let`, `const`, `class`, les fonctions déclarées). Chaque liaison
// est un objet, qui sert de clé aux ensembles de valeurs.
class Portee {
  constructor(parent, fonction) { this.parent = parent; this.fonction = fonction; this.noms = new Map(); }
  declarer(nom, liaison) { this.noms.set(nom, liaison); }
  resoudre(nom) {
    for (let p = this; p; p = p.parent) if (p.noms.has(nom)) return p.noms.get(nom);
    return null;
  }
  deFonction() { let p = this; while (!p.fonction) p = p.parent; return p; }
}

function nomsDuMotif(motif, sortie = []) {
  if (!motif) return sortie;
  switch (motif.type) {
    case 'Identifier': sortie.push(motif); break;
    case 'AssignmentPattern': nomsDuMotif(motif.left, sortie); break;
    case 'RestElement': nomsDuMotif(motif.argument, sortie); break;
    case 'ArrayPattern': for (const e of motif.elements) nomsDuMotif(e, sortie); break;
    case 'ObjectPattern': for (const p of motif.properties) nomsDuMotif(p.type === 'RestElement' ? p : p.value, sortie); break;
  }
  return sortie;
}

// Chaque nœud reçoit sa portée (`__portee`), la fonction qui le contient (`__fonction`, null au niveau
// du module) et son parent (`__parent`) ; chaque fonction, sa portée intérieure (`__interne`).
function declarer(programme) {
  const racine = new Portee(null, programme);
  const visiter = (n, portee, fonction, parent) => {
    n.__parent = parent; n.__portee = portee; n.__fonction = fonction;
    if (estFonction(n)) {
      if (n.type === 'FunctionDeclaration' && n.id) portee.declarer(n.id.name, { genre: 'fonction', noeud: n });
      const pf = new Portee(portee, n);
      n.__interne = pf;
      if (n.type === 'FunctionExpression' && n.id) pf.declarer(n.id.name, { genre: 'fonction', noeud: n });
      for (const p of n.params) for (const id of nomsDuMotif(p)) pf.declarer(id.name, { genre: 'parametre', noeud: n });
      if (n.id) { n.id.__parent = n; n.id.__portee = portee; n.id.__fonction = fonction; }
      for (const p of n.params) visiter(p, pf, n, n);
      if (n.body.type === 'BlockStatement') {
        n.body.__parent = n; n.body.__portee = pf; n.body.__fonction = n;
        for (const s of n.body.body) visiter(s, pf, n, n.body);
      } else visiter(n.body, pf, n, n);
      return;
    }
    let ici = portee;
    switch (n.type) {
      case 'BlockStatement': case 'ForStatement': case 'ForInStatement': case 'ForOfStatement':
      case 'SwitchStatement': case 'StaticBlock':
        ici = new Portee(portee, null); break;
      case 'CatchClause':
        ici = new Portee(portee, null);
        for (const id of nomsDuMotif(n.param)) ici.declarer(id.name, { genre: 'parametre', noeud: n });
        break;
      case 'VariableDeclaration': {
        const cible = n.kind === 'var' ? portee.deFonction() : portee;
        for (const d of n.declarations) {
          if (d.id.type === 'Identifier') cible.declarer(d.id.name, { genre: 'variable', noeud: d, init: d.init, sorte: n.kind });
          else for (const id of nomsDuMotif(d.id)) cible.declarer(id.name, { genre: 'motif', noeud: d });
        }
        break;
      }
      case 'ClassDeclaration':
        if (n.id) portee.declarer(n.id.name, { genre: 'classe', noeud: n });
        break;
      case 'ImportDeclaration':
        for (const s of n.specifiers) {
          portee.declarer(s.local.name, s.type === 'ImportSpecifier'
            ? { genre: 'import', source: n.source.value, importe: s.imported.name, noeud: s }
            : { genre: 'espace', source: n.source.value, noeud: s });
        }
        break;
    }
    for (const e of enfants(n)) visiter(e, ici, fonction, n);
  };
  programme.__portee = racine;
  for (const s of programme.body) visiter(s, racine, null, programme);
  return racine;
}

// --- Les modules du jeu ------------------------------------------------------------------------------------
// index.js n'est pas transformé : son `contexte` et son `enveloppe` sont récrits d'après les gabarits
// (plus bas) ; le reste (installer, installerCompare) ne sert qu'avec la transcription.
const DOSSIER_JEU = path.join(SOURCE, 'jeu');
const modules = new Map();
for (const nom of fs.readdirSync(DOSSIER_JEU).filter((f) => f.endsWith('.js')).sort()) {
  const texte = fs.readFileSync(path.join(DOSSIER_JEU, nom), 'utf8');
  const module = { nom, texte, ast: null, exports: new Map(), fonctions: [] };
  modules.set(nom, module);
  if (nom === 'index.js') continue;
  module.ast = analyser(texte);
  declarer(module.ast);
}
const texteDe = (module, n) => module.texte.slice(n.start, n.end);
const ligneDe = (module, n) => `moteur/jeu/${module.nom}:${n.loc.start.line}`;

// Ce que chaque module exporte : les liaisons de sa portée.
for (const module of modules.values()) {
  if (!module.ast) continue;
  const portee = module.ast.__portee;
  for (const n of module.ast.body) {
    if (n.type !== 'ExportNamedDeclaration') continue;
    const d = n.declaration;
    const noms = d?.type === 'VariableDeclaration' ? d.declarations.flatMap((v) => nomsDuMotif(v.id).map((i) => i.name))
      : d?.id ? [d.id.name] : [];
    for (const nom of noms) module.exports.set(nom, portee.noms.get(nom));
    for (const s of n.specifiers || []) module.exports.set(s.exported.name, portee.resoudre(s.local.name));
  }
}

// La liaison d'un nom, en suivant les importations d'un module du jeu à l'autre.
function suivre(module, liaison, profondeur = 0) {
  if (!liaison || liaison.genre !== 'import') return liaison;
  const cible = liaison.source.startsWith('./') ? modules.get(path.basename(liaison.source)) : null;
  if (!cible || !cible.ast || profondeur > 10) return { genre: 'externe', source: liaison.source };
  return suivre(cible, cible.exports.get(liaison.importe) || null, profondeur + 1);
}
const liaisonDe = (module, id) => suivre(module, id.__portee ? id.__portee.resoudre(id.name) : null);

// Les fonctions, par nœud.
const infos = new Map();
for (const module of modules.values()) {
  if (!module.ast) continue;
  for (const n of tousLesNoeuds(module.ast)) {
    if (!estFonction(n)) continue;
    const i = { module, noeud: n, nom: nommer(module, n), appels: [], generateur: false, queue: false, raison: null };
    infos.set(n, i);
    module.fonctions.push(i);
  }
}
// Un nom lisible pour le rapport : celui de la fonction, de la variable, de la propriété ou de la méthode.
function nommer(module, n) {
  if (n.id) return n.id.name;
  const p = n.__parent;
  if (p?.type === 'VariableDeclarator' && p.id.type === 'Identifier') return p.id.name;
  if ((p?.type === 'Property' || p?.type === 'MethodDefinition') && p.value === n) {
    const cle = p.key.type === 'Identifier' ? p.key.name : texteDe(module, p.key);
    if (p.type === 'Property') {
      const nomEntree = p.__parent.properties?.find((q) => q.key?.name === 'nom' && q.value.type === 'Literal');
      if (nomEntree) return `${nomEntree.value.value}.${cle}`;
    }
    return cle;
  }
  if (p?.type === 'AssignmentExpression') return texteDe(module, p.left);
  const f = n.__fonction ? infos.get(n.__fonction) : null;
  return `fermeture de ${f ? f.nom : 'module'} (ligne ${n.loc.start.line})`;
}

// Les nœuds qui font circuler des valeurs, relevés une fois.
const lieux = { appels: [], declarations: [], affectations: [], increments: [], proprietes: [], retours: [], queues: [], objets: [] };
for (const module of modules.values()) {
  if (!module.ast) continue;
  for (const n of tousLesNoeuds(module.ast)) {
    const x = { module, n };
    switch (n.type) {
      case 'CallExpression': case 'NewExpression':
        lieux.appels.push(x);
        if (n.__fonction) infos.get(n.__fonction).appels.push(x);
        break;
      case 'VariableDeclarator': if (n.init) lieux.declarations.push(x); break;
      case 'AssignmentExpression': lieux.affectations.push(x); break;
      case 'UpdateExpression': lieux.increments.push(x); break;
      case 'ObjectExpression': lieux.objets.push(x); break;
      case 'Property': if (n.__parent.type === 'ObjectExpression') lieux.proprietes.push(x); break;
      case 'MethodDefinition': case 'PropertyDefinition': lieux.proprietes.push(x); break;
      case 'ReturnStatement': if (n.argument && n.__fonction) lieux.retours.push(x); break;
      case 'ArrowFunctionExpression': if (n.body.type !== 'BlockStatement') lieux.queues.push(x); break;
    }
  }
}

// --- Les valeurs ------------------------------------------------------------------------------------------------
// Ce qui circule, et que l'analyse suit : les fonctions (leur nœud), les nombres (les adresses des
// fonctions du jeu), les instances des classes du jeu ({ instance: classe }), les objets littéraux
// (leur nœud), et deux marques : INCONNU (une valeur que l'analyse ne sait pas dire : un calcul, un
// mot lu dans la mémoire du jeu, ce que passe l'hôte) et ROUTINE (une routine rendue par l'hôte,
// appelLointain, T.fonction, T.originale).
// V : liaison -> valeurs ; P : nom de propriété -> valeurs (tous objets et modules confondus : le
// recours quand on ne sait pas quel objet est lu) ; PROPRIETES : objet ou instance -> nom -> valeurs ;
// RETOURS : fonction -> valeurs qu'elle peut rendre.
const INCONNU = { inconnu: true };
const ROUTINE = { routine: true };
const SOURCES_DE_ROUTINES = new Set(['appelLointain', 'fonction', 'originale']);
const V = new Map(), P = new Map(), RETOURS = new Map(), PROPRIETES = new Map();
const VIDE = new Set();
const SEUL_INCONNU = [INCONNU];
let croissance = false;
const ensemble = (table, cle) => { let s = table.get(cle); if (!s) table.set(cle, s = new Set()); return s; };
function verser(cible, valeurs) { for (const v of valeurs) if (!cible.has(v)) { cible.add(v); croissance = true; } }
const cleDe = (p) => (p.key.type === 'Identifier' && !p.computed ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null);
const estUneFonction = (v) => typeof v === 'object' && v !== null && infos.has(v);
const instances = new Map();
const instanceDe = (classe) => { let i = instances.get(classe); if (!i) instances.set(classe, i = { instance: classe }); return i; };
// Les tables Map écrites en littéral : leurs valeurs possibles.
const cartes = new Map();
const carteDe = (module, n) => { let c = cartes.get(n); if (!c) cartes.set(n, c = { carte: n, module }); return c; };
function valeursDeLaCarte({ carte, module }) {
  return carte.arguments[0].elements.flatMap((x) => (x?.type === 'ArrayExpression' && x.elements.length === 2
    ? [...valeursDe(module, x.elements[1])] : [INCONNU]));
}
const proprietesDe = (objet, nom) => {
  let m = PROPRIETES.get(objet);
  if (!m) PROPRIETES.set(objet, m = new Map());
  return ensemble(m, nom);
};

// La classe dont `this` est l'instance, pour un nœud dans une méthode (à travers les fléchées).
function classeDeThis(n) {
  for (let f = n.__fonction; f; f = f.__fonction) {
    if (f.type === 'ArrowFunctionExpression') continue;
    const p = f.__parent;
    return p?.type === 'MethodDefinition' ? p.__parent.__parent : null;
  }
  return null;
}

// Lire la propriété `nom` d'un objet dont les valeurs possibles sont `objets`.
function lireLaPropriete(objets, nom) {
  const r = [];
  let recours = true;                        // (aucune valeur connue : le recours, par le nom)
  for (const o of objets) { recours = false; break; }
  for (const o of objets) {
    if (o === INCONNU || o === ROUTINE) recours = true;
    else if (typeof o !== 'object') continue;
    else if (o.instance) {
      for (const m of o.instance.body.body) if (m.type === 'MethodDefinition' && m.kind === 'method' && cleDe(m) === nom) r.push(m.value);
      for (const v of PROPRIETES.get(o)?.get(nom) || VIDE) r.push(v);
    } else if (o.type === 'ObjectExpression') for (const v of PROPRIETES.get(o)?.get(nom) || VIDE) r.push(v);
  }
  if (recours) { for (const v of P.get(nom) || VIDE) r.push(v); r.push(INCONNU); }
  return r;
}

function valeursDe(module, e) {
  if (!e) return VIDE;
  switch (e.type) {
    case 'FunctionExpression': case 'ArrowFunctionExpression': case 'ObjectExpression': return [e];
    case 'Literal': return typeof e.value === 'number' ? [e.value] : VIDE;
    case 'Identifier': {
      if (e.name === 'undefined') return VIDE;
      const l = liaisonDe(module, e);
      if (!l || l.genre === 'externe' || l.genre === 'espace') return SEUL_INCONNU;
      if (l.genre === 'fonction') return [l.noeud];
      if (l.genre === 'classe') return VIDE;
      return V.get(l) || VIDE;
    }
    case 'ThisExpression': { const c = classeDeThis(e); return c ? [instanceDe(c)] : SEUL_INCONNU; }
    case 'NewExpression': {
      if (e.callee.type === 'Identifier') {
        const l = liaisonDe(module, e.callee);
        if (l?.genre === 'classe') return [instanceDe(l.noeud)];
        // new Map([[clé, valeur], …]) : une table, dont .get rend l'une des valeurs
        if (e.callee.name === 'Map' && l?.genre === 'externe' || (e.callee.name === 'Map' && !l)) {
          if (e.arguments[0]?.type === 'ArrayExpression') return [carteDe(module, e)];
        }
      }
      return SEUL_INCONNU;
    }
    case 'CallExpression': {
      const c = e.callee;
      if (c.type === 'MemberExpression' && !c.computed && SOURCES_DE_ROUTINES.has(c.property.name)) return [ROUTINE];
      if (primitive(module, e)) return SEUL_INCONNU;                     // eax
      if (c.type === 'MemberExpression' && !c.computed && c.property.name === 'get') {
        const tables = [...valeursDe(module, c.object)];
        if (tables.some((x) => x.carte)) return tables.flatMap((x) => (x.carte ? valeursDeLaCarte(x) : [INCONNU]));
      }
      const r = [];
      let externe = true;
      for (const g of appelees(module, e)) {
        if (!estUneFonction(g)) continue;
        externe = false;
        for (const v of RETOURS.get(g) || VIDE) r.push(v);
      }
      if (externe) r.push(INCONNU);
      return r;
    }
    case 'ConditionalExpression': return [...valeursDe(module, e.consequent), ...valeursDe(module, e.alternate)];
    case 'LogicalExpression': return [...valeursDe(module, e.left), ...valeursDe(module, e.right)];
    case 'SequenceExpression': return valeursDe(module, e.expressions[e.expressions.length - 1]);
    case 'AssignmentExpression': return e.operator === '=' ? valeursDe(module, e.right) : SEUL_INCONNU;
    case 'ArrayExpression': return e.elements.flatMap((x) => (x ? [...valeursDe(module, x.type === 'SpreadElement' ? x.argument : x)] : []));
    case 'MemberExpression':
      // l'élément d'une table (les tableaux sont confondus avec leurs éléments), ou une propriété
      if (e.computed) return [...valeursDe(module, e.object), INCONNU];
      return lireLaPropriete(valeursDe(module, e.object), e.property.name);
    case 'BinaryExpression':
      // `a >>> 0`, `a | 0` : la même adresse
      if ((e.operator === '>>>' || e.operator === '|') && e.right.type === 'Literal' && e.right.value === 0) return valeursDe(module, e.left);
      return SEUL_INCONNU;
  }
  return SEUL_INCONNU;
}
// (les primitives, jeu.appeler et les autres, n'appellent pas une fonction du jeu par son nom)
const appelees = (module, appel) => (primitive(module, appel) ? VIDE : valeursDe(module, appel.callee));

// Les appels primitifs du contexte et du processeur, et la position de leur adresse :
// `jeu.appeler(adresse, …)`, `jeu.appelerDepuis(retour, pile, adresse, …)` (et `this.jeu`, `r.jeu`…),
// `T.appeler(adresse)` (et `jeu.T`). Les méthodes appeler des cadres des modules ne sont pas des
// primitives : ce sont des fonctions du jeu comme les autres, suivies par l'analyse.
function primitive(module, appel) {
  const c = appel.callee;
  if (c.type !== 'MemberExpression' || c.computed) return null;
  const p = c.property.name, objet = texteDe(module, c.object);
  const contexte = objet === 'jeu' || objet.endsWith('.jeu');
  if (contexte && p === 'appeler') return { sorte: 'contexte', position: 0 };
  if (contexte && p === 'appelerDepuis') return { sorte: 'contexte', position: 2 };
  if ((objet === 'T' || objet.endsWith('.T')) && p === 'appeler') return { sorte: 'processeur', position: 0 };
  if (p === 'tic' && objet === 'jeu.machine') return { sorte: 'tic' };
  return null;
}

// La liaison d'un paramètre de position k d'une fonction, ou null ; le paramètre du reste reçoit tous
// les arguments qui suivent.
function liaisonDuParametre(g, k) {
  for (let j = 0; j < g.params.length; j++) {
    let p = g.params[j];
    if (p.type === 'RestElement') return j <= k && p.argument.type === 'Identifier' ? g.__interne.noms.get(p.argument.name) : null;
    if (j !== k) continue;
    if (p.type === 'AssignmentPattern') p = p.left;
    return p.type === 'Identifier' ? g.__interne.noms.get(p.name) : null;
  }
  return null;
}

// --- Les adresses du programme ------------------------------------------------------------------------------
// Les fonctions posées à chaque adresse : les entrées { adresse, fn } des listes des modules
// (reecritures, enAttente, le démarrage, l'introduction), et les copies de l'introduction qu'index.js
// pose à d'autres adresses (COPIES_DE_L_INTRODUCTION).
const ADRESSES = new Map();          // adresse -> ensemble des fonctions qui peuvent y être posées
const entreesDuProgramme = [];
for (const { module, n } of lieux.objets) {
  const a = n.properties.find((p) => p.type === 'Property' && cleDe(p) === 'adresse');
  const f = n.properties.find((p) => p.type === 'Property' && cleDe(p) === 'fn');
  if (a && f) entreesDuProgramme.push({ module, adresse: a.value, fn: f.value });
}
const COPIES = [...(modules.get('index.js').texte.match(/COPIES_DE_L_INTRODUCTION = \[([^;]*)\];/)?.[1] || '')
  .matchAll(/\[(0x[0-9A-F]+), (0x[0-9A-F]+)\]/gi)].map((m) => [parseInt(m[1], 16), parseInt(m[2], 16)]);
if (!COPIES.length) avertissements.push('moteur/jeu/index.js : COPIES_DE_L_INTRODUCTION introuvable');
// Une entrée faite par une fabrique, `const reecriture = (adresse, nom, fn, …) => ({ adresse, nom, fn, … })`
// (personnel.js, simulation.js, voyous.js) : l'adresse et la fonction sont appariées appel par appel.
function fabriqueDe(module, adresse, fn) {
  const la = adresse.type === 'Identifier' ? liaisonDe(module, adresse) : null;
  const lf = fn.type === 'Identifier' ? liaisonDe(module, fn) : null;
  if (la?.genre !== 'parametre' || lf?.genre !== 'parametre' || la.noeud !== lf.noeud) return null;
  const f = la.noeud, rang = (id) => f.params.findIndex((q) => q.type === 'Identifier' && q.name === id.name);
  return { f, kAdresse: rang(adresse), kFn: rang(fn) };
}
function releverLesAdresses() {
  for (const { module, adresse, fn } of entreesDuProgramme) {
    const fabrique = fabriqueDe(module, adresse, fn);
    const paires = fabrique
      ? lieux.appels.filter(({ module: m, n }) => [...appelees(m, n)].includes(fabrique.f))
        .map(({ module: m, n }) => [m, n.arguments[fabrique.kAdresse], n.arguments[fabrique.kFn]])
      : [[module, adresse, fn]];
    for (const [m, a, f] of paires) {
      const fonctions = [...valeursDe(m, f)].filter(estUneFonction);
      for (const x of valeursDe(m, a)) if (typeof x === 'number') verser(ensemble(ADRESSES, x >>> 0), fonctions);
    }
  }
  for (const [copie, jumelle] of COPIES) verser(ensemble(ADRESSES, copie), ADRESSES.get(jumelle) || VIDE);
}

// Les appels à adresse inconnue (lue dans la mémoire du jeu) dont on sait qu'ils ne mènent à aucun
// point de pause : [module, texte de l'argument adresse, pourquoi]. Si l'on se trompait, rien ne
// casserait : un générateur appelé là serait parcouru d'une traite (executerSansPause), la pause
// perdue comptée (reentrance.js, statistiques.pausesAvalees) ; les vérificateurs l'affichent.
const ADRESSES_SANS_PAUSE = [
  ['sos-bruitages.js', 'adresse >>> 0', 'les routines des pilotes de son de SOS : ni image ni attente'],
  ['sos-pilotes.js', 'compile.preparer', "la préparation d'un pilote de musique"],
  ['systeme.js', 'comparer', 'la fonction de comparaison du tri (qsort)'],
  ['bibliotheque.js', 'crochet', "l'écriture des caractères de printf"],
  ['bibliotheque.js', 'sortie', "l'écriture des caractères de printf"],
  ['sortie.js', 'routine', 'les routines de fin du programme (atexit)'],
  ['evenements.js', 'long(jeu, 0xBECC0)', 'les vecteurs de nettoyage de la sortie au DOS'],
  ['evenements.js', 'long(jeu, 0xBECC4)', 'les vecteurs de nettoyage de la sortie au DOS'],
  ['evenements.js', 'long(jeu, 0xBECC8)', 'les vecteurs de nettoyage de la sortie au DOS'],
  ['runtime.js', 'adresse', "les routines d'initialisation de la bibliothèque C, avant la première image"],
];

// Une adresse appelée peut-elle rendre la main ? Oui si elle est inconnue (prudence : on ne sait pas
// ce qui y sera posé), si c'est un point de pause de l'hôte, ou si une fonction qui peut y être posée
// est devenue générateur. Les adresses que le programme lisible n'a pas (int386x, _chain_intr, les
// modules de son de HMIDRV.386) sont des services de l'hôte, qui ne la rendent pas.
function adressePeutRendreLaMain(valeurs) {
  for (const a of valeurs) {
    if (a === INCONNU || a === ROUTINE) return true;
    if (typeof a !== 'number') continue;
    if (POINTS_DE_PAUSE.has(a >>> 0)) return true;
    for (const g of ADRESSES.get(a >>> 0) || VIDE) if (infos.get(g).generateur) return true;
  }
  return false;
}

// Les adresses qu'un appel primitif peut appeler. Un étalement (`jeu.appeler(...a)`) : les valeurs du
// tableau (confondu avec ses éléments). Les adresses inconnues des appels de ADRESSES_SANS_PAUSE ne
// comptent pas (leurs adresses connues, si).
function adressesDe(module, appel, prim) {
  const k = appel.arguments.findIndex((a, j) => a.type === 'SpreadElement' || j === prim.position);
  const a = appel.arguments[k];
  if (!a) return SEUL_INCONNU;
  const valeurs = valeursDe(module, a.type === 'SpreadElement' ? a.argument : a);
  const sure = ADRESSES_SANS_PAUSE.find(([m, texte]) => m === module.nom && texte === texteDe(module, a));
  if (sure) { sure.servie = true; return [...valeurs].filter((v) => v !== INCONNU); }
  return valeurs;
}

// La nature d'un appel, pour la réécriture : null (il ne rend jamais la main, il reste tel quel), ou
//  - 'jeu' : `jeu.appeler(…)`, `jeu.appelerDepuis(…)` → `(yield* jeu.appelerReentrant(…))` ;
//  - 'tic' : `jeu.machine.tic()` → `(yield* jeu.ticReentrant())` ;
//  - 'direct' : toutes les appelées possibles rendent un itérateur → `(yield* f(…))` ;
//  - 'indirect' : `T.appeler(…)` qui peut rendre la main, ou plusieurs appelées possibles dont un
//    générateur → `(yield* deleguer(f(…)))` ;
//  - 'relais' : l'appel d'un relais (plus bas) qui lui passe de quoi rendre la main →
//    `(yield* fReentrant(…))`, sa jumelle ;
//  - 'traite' : `T.appeler(…)` ou une routine de l'hôte qui ne rend pas la main : l'appelée pourrait
//    tout de même être un générateur (ce que l'analyse n'aurait pas vu), `executerSansPause(f(…))`
//    le parcourt d'une traite (et compte les pauses ainsi perdues).
function natureDe(module, appel) {
  const prim = primitive(module, appel);
  if (prim) {
    if (prim.sorte === 'tic') return 'tic';
    const peut = PARTOUT || adressePeutRendreLaMain(adressesDe(module, appel, prim));
    if (prim.sorte === 'contexte') return peut ? 'jeu' : null;
    return peut ? 'indirect' : 'traite';
  }
  const cibles = appelees(module, appel);
  // un relais seul : sa jumelle si l'un des arguments qu'il relaie peut rendre la main
  if (cibles.length === 1 || cibles.size === 1) {
    const [g] = cibles;
    const i = estUneFonction(g) ? infos.get(g) : null;
    if (i?.relais) {
      for (const [k, sorte] of i.relaisParams) if (relaisSuspend(module, appel, g, k, sorte)) return 'relais';
      return null;
    }
  }
  let suspend = false, routine = false, fonction = false;
  for (const g of cibles) {
    if (g === ROUTINE) routine = true;
    else if (estUneFonction(g)) { fonction = true; if (infos.get(g).generateur) suspend = true; }
  }
  if (routine && !fonction) return PARTOUT ? 'indirect' : 'traite';
  if (routine && PARTOUT) suspend = true;
  if (!suspend) return null;
  if (appel.type === 'NewExpression') return 'new';
  // Toutes les appelées possibles rendent un itérateur : `yield*` suffit. (Si une autre fonction, que
  // l'analyse n'a pas vue passer, arrivait là, `yield*` sur son résultat lèverait une TypeError : la
  // faute se verrait aussitôt.)
  for (const g of cibles) if (estUneFonction(g) && !rendUnIterateur(g)) return 'indirect';
  if (routine) return 'indirect';
  return 'direct';
}
const rendLaMain = (nature) => nature !== null && nature !== 'traite';
// Une fonction dont l'appel rend toujours un itérateur : un générateur, ou une fléchée en queue dont
// l'appel est lui-même sûr d'en rendre un.
function rendUnIterateur(g) {
  const i = infos.get(g);
  if (!i || !i.generateur) return false;
  if (!i.queue) return true;
  if (i.suivi) return false;                       // (une boucle de fléchées en queue)
  i.suivi = true;
  const nature = natureDe(i.module, i.noeud.body);
  i.suivi = false;
  return nature === 'jeu' || nature === 'direct';
}

// Une fonction fléchée « en queue » : son corps est l'appel d'un générateur, et rien d'autre n'y rend
// la main ; elle reste telle quelle et rend l'itérateur. (Pas `jeu.appeler` : son nom change.)
function enQueue(i) {
  const n = i.noeud;
  if (n.type !== 'ArrowFunctionExpression' || n.body.type !== 'CallExpression') return false;
  const nature = natureDe(i.module, n.body);
  if (nature !== 'direct' && nature !== 'indirect') return false;
  return i.appels.every((a) => a.n === n.body || !natureDe(a.module, a.n));
}

// --- Les relais ----------------------------------------------------------------------------------------------
// Beaucoup de petites fonctions du jeu ne rendent la main que par ce qu'on leur passe : les aides qui
// ouvrent un cadre et y exécutent une routine (`avecCadre(jeu, …, corps)`), les méthodes appeler des
// cadres (`cadre.appeler(retour, adresse, …)`), qui ne font qu'appeler l'adresse reçue. L'analyse ne
// distingue pas leurs appelants : qu'un seul leur passe une routine ou une adresse qui peut rendre la
// main, et la fonction devient un générateur pour tous — et tous ses appelants avec elle, jusqu'à
// chaque service du DOS. Une telle fonction, un relais, garde donc sa version ordinaire, et reçoit une
// jumelle générateur (même nom, suffixé Reentrant, écrite à la fin du module : les lignes ne bougent
// pas) ; chaque appel choisit l'une ou l'autre d'après ses propres arguments.
// Un relais est une fonction nommée du module (déclarée, `const f = …`, ou méthode d'une classe) qui
// n'est jamais que appelée par son nom, et dont chaque appel qui peut rendre la main est l'appel d'un
// de ses paramètres, un appel primitif à l'adresse d'un de ses paramètres, ou l'appel d'un autre relais
// auquel elle passe ses paramètres. `relaisParams` : position du paramètre -> 'fonction' ou 'adresse'.
function estUneReference(id) {
  const p = id.__parent;
  if (!p) return false;
  if (p.type === 'MemberExpression' && p.property === id && !p.computed) return false;
  if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === id && !p.computed && !p.shorthand) return false;
  if ((p.type === 'FunctionDeclaration' || p.type === 'FunctionExpression' || p.type === 'ClassDeclaration') && p.id === id) return false;
  if (p.type === 'VariableDeclarator' && p.id === id) return false;
  if (p.type.startsWith('Import') || p.type.startsWith('Export')) return false;
  if (p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') return false;
  return true;
}
const liaisonsEnValeur = new Set();         // liaisons lues autrement que pour les appeler
const methodesEnValeur = new Set();         // noms de propriétés lus autrement que pour les appeler
const parametresAffectes = new Set();
for (const module of modules.values()) {
  if (!module.ast) continue;
  for (const n of tousLesNoeuds(module.ast)) {
    if (n.type === 'Identifier' && estUneReference(n)) {
      const appele = n.__parent.type === 'CallExpression' && n.__parent.callee === n;
      const dansUnMotif = n.__parent.type === 'AssignmentPattern' || n.__parent.type === 'RestElement'
        || (n.__parent.type === 'Property' && n.__parent.__parent.type === 'ObjectPattern');
      if (!appele && !dansUnMotif) { const l = liaisonDe(module, n); if (l) liaisonsEnValeur.add(l); }
    }
    if (n.type === 'MemberExpression' && !n.computed && !(n.__parent.type === 'CallExpression' && n.__parent.callee === n)
      && !(n.__parent.type === 'AssignmentExpression' && n.__parent.left === n)) methodesEnValeur.add(n.property.name);
  }
}
for (const { module, n } of [...lieux.affectations, ...lieux.increments]) {
  const cible = n.left || n.argument;
  if (cible.type === 'Identifier') { const l = liaisonDe(module, cible); if (l?.genre === 'parametre') parametresAffectes.add(l); }
}
const auNiveauDuModule = (d) => d.__parent.type === 'Program' || (d.__parent.type === 'ExportNamedDeclaration' && d.__parent.__parent.type === 'Program');
for (const i of infos.values()) {
  const n = i.noeud, p = n.__parent, module = i.module;
  let nom = null, sorte = null, liaison = null, exporte = false, classe = null;
  if (n.type === 'FunctionDeclaration' && auNiveauDuModule(n)) {
    nom = n.id.name; sorte = 'declaration'; liaison = module.ast.__portee.noms.get(nom); exporte = p.type === 'ExportNamedDeclaration';
  } else if (p.type === 'VariableDeclarator' && p.init === n && p.id.type === 'Identifier' && p.__parent.kind === 'const' && auNiveauDuModule(p.__parent)) {
    nom = p.id.name; sorte = 'constante'; liaison = module.ast.__portee.noms.get(nom); exporte = p.__parent.__parent.type === 'ExportNamedDeclaration';
  } else if (p.type === 'MethodDefinition' && p.kind === 'method' && !p.static && !p.computed && p.__parent.__parent.type === 'ClassDeclaration'
    && auNiveauDuModule(p.__parent.__parent)) {
    nom = p.key.name; sorte = 'methode'; classe = p.__parent.__parent.id.name;
    if (methodesEnValeur.has(nom)) continue;
  } else continue;
  if (liaison && liaisonsEnValeur.has(liaison)) continue;
  if (!n.params.every((q) => q.type === 'Identifier' || (q.type === 'RestElement' && q.argument.type === 'Identifier'))) continue;
  if (n.params.some((q) => parametresAffectes.has(n.__interne.noms.get(q.type === 'Identifier' ? q.name : q.argument.name)))) continue;
  i.candidat = { nom, sorte, exporte, classe };
}
// La position du paramètre de `f` que désigne l'expression `e` (`p`, `p >>> 0`, `p | 0`), ou -1.
function parametreDe(i, e) {
  if (e?.type === 'BinaryExpression' && (e.operator === '>>>' || e.operator === '|') && e.right.type === 'Literal' && e.right.value === 0) e = e.left;
  if (e?.type !== 'Identifier') return -1;
  const l = liaisonDe(i.module, e);
  if (!l || l.genre !== 'parametre' || l.noeud !== i.noeud) return -1;
  return i.noeud.params.findIndex((q) => q.type === 'Identifier' && q.name === e.name);
}
// Les paramètres par lesquels `i` relaie un appel qui rend la main, ou null si l'appel n'est pas relayé.
function relaye(i, appel, nature) {
  const prim = primitive(i.module, appel);
  if (prim) {
    if (prim.sorte === 'tic') return null;
    const j = appel.arguments.findIndex((a) => a.type === 'SpreadElement');
    if (j >= 0 && j <= prim.position) return null;
    const k = parametreDe(i, appel.arguments[prim.position]);
    return k >= 0 ? [[k, 'adresse']] : null;
  }
  if (nature === 'relais') {
    const [g] = appelees(i.module, appel);
    const r = [];
    for (const [k2, sorte] of infos.get(g).relaisParams) {
      if (!relaisSuspend(i.module, appel, g, k2, sorte)) continue;
      const k = parametreDe(i, appel.arguments[k2]);
      if (k < 0) return null;
      r.push([k, sorte]);
    }
    return r;
  }
  if (appel.callee.type === 'Identifier') {
    const k = parametreDe(i, appel.callee);
    if (k >= 0) return [[k, 'fonction']];
  }
  return null;
}
// Un appel d'un relais rend-il la main, par l'argument de la position k ?
function relaisSuspend(module, appel, g, k, sorte) {
  const j = appel.arguments.findIndex((a) => a.type === 'SpreadElement');
  if (j >= 0 && j <= k) return true;
  const a = appel.arguments[k];
  if (!a) return false;
  const valeurs = valeursDe(module, a);
  if (sorte === 'adresse') return adressePeutRendreLaMain(valeurs);
  for (const v of valeurs) if (v === ROUTINE || (estUneFonction(v) && infos.get(v).generateur)) return true;
  return false;
}

// Le point fixe : les valeurs circulent, les générateurs se marquent, jusqu'à ce que rien ne change.
let tours = 0;
do {
  croissance = false;
  tours++;
  for (const { module, n } of lieux.declarations) {
    if (n.id.type === 'Identifier') verser(ensemble(V, liaisonDe(module, n.id) || n), valeursDe(module, n.init));
    else {
      const source = valeursDe(module, n.init);
      for (const id of nomsDuMotif(n.id)) {
        const l = liaisonDe(module, id);
        if (!l) continue;
        // { a } = objet : la propriété a de l'objet ; [a, b] = tableau : ses éléments
        const p = id.__parent;
        if (p.type === 'Property' && p.value === id && cleDe(p)) verser(ensemble(V, l), lireLaPropriete(source, cleDe(p)));
        else verser(ensemble(V, l), [...source, INCONNU]);
      }
    }
  }
  for (const { module, n } of lieux.affectations) {
    const g = n.left, valeurs = n.operator === '=' ? valeursDe(module, n.right) : SEUL_INCONNU;
    if (g.type === 'Identifier') { const l = liaisonDe(module, g); if (l) verser(ensemble(V, l), valeurs); }
    else if (g.type === 'MemberExpression' && !g.computed) {
      verser(ensemble(P, g.property.name), valeurs);
      for (const o of valeursDe(module, g.object)) {
        if (typeof o === 'object' && (o.instance || o.type === 'ObjectExpression')) verser(proprietesDe(o, g.property.name), valeurs);
      }
    } else if (g.type === 'MemberExpression' && g.object.type === 'Identifier') {
      const l = liaisonDe(module, g.object);
      if (l) verser(ensemble(V, l), valeurs);
    }
  }
  for (const { module, n } of lieux.increments) {
    if (n.argument.type !== 'Identifier') continue;
    const l = liaisonDe(module, n.argument);
    if (l) verser(ensemble(V, l), SEUL_INCONNU);
  }
  for (const { module, n } of lieux.proprietes) {
    if (n.kind === 'get' || n.kind === 'set' || n.kind === 'constructor') continue;
    const cle = cleDe(n);
    if (!cle) continue;
    const valeurs = valeursDe(module, n.value);
    verser(ensemble(P, cle), valeurs);
    if (n.type === 'Property') verser(proprietesDe(n.__parent, cle), valeurs);
  }
  for (const { module, n } of lieux.retours) verser(ensemble(RETOURS, n.__fonction), valeursDe(module, n.argument));
  for (const { module, n } of lieux.queues) verser(ensemble(RETOURS, n), valeursDe(module, n.body));
  for (const { module, n } of lieux.appels) {
    for (const g of appelees(module, n)) {
      if (!estUneFonction(g)) continue;
      n.arguments.forEach((a, k) => {
        const l = liaisonDuParametre(g, k);
        if (l) verser(ensemble(V, l), a.type === 'SpreadElement' ? SEUL_INCONNU : valeursDe(module, a));
      });
    }
  }
  // Les fonctions que l'hôte appelle, les entrées fn : l'enveloppe leur passe ce qu'il y a dans la
  // pile, ou les registres. Leurs paramètres sont inconnus.
  for (const { module, fn } of entreesDuProgramme) {
    for (const g of valeursDe(module, fn)) {
      if (!estUneFonction(g)) continue;
      for (const p of g.params) for (const id of nomsDuMotif(p)) verser(ensemble(V, g.__interne.noms.get(id.name)), SEUL_INCONNU);
    }
  }
  releverLesAdresses();
} while (croissance);
// Puis les générateurs et les relais, sur des valeurs qui ne bougent plus (les valeurs ne dépendent pas
// de la marque des générateurs ; l'inverse, si : décider d'un relais sur des valeurs encore partielles
// le disqualifierait à tort, et une fonction devenue générateur le reste).
do {
  croissance = false;
  tours++;
  // Un relais appelé par un appel qui a plusieurs appelées possibles ne peut pas choisir sa version.
  for (const { module, n } of lieux.appels) {
    const cibles = [...appelees(module, n)].filter(estUneFonction);
    if (cibles.length < 2) continue;
    for (const g of cibles) {
      const i = infos.get(g);
      if (i.candidat && !i.pasDeRelais) { i.pasDeRelais = true; croissance = true; }
    }
  }
  for (const i of infos.values()) {
    if (i.generateur) continue;
    const suspendus = [];
    for (const x of i.appels) { const nature = natureDe(x.module, x.n); if (rendLaMain(nature)) suspendus.push([x, nature]); }
    if (!suspendus.length) continue;
    if (!PARTOUT && i.candidat && !i.pasDeRelais) {
      const params = new Map();
      let tous = true;
      for (const [x, nature] of suspendus) {
        const r = relaye(i, x.n, nature);
        if (!r) { tous = false; break; }
        for (const [k, sorte] of r) params.set(k, sorte);
      }
      if (tous) {
        if (!i.relais || [...params.keys()].some((k) => !i.relaisParams.has(k))) {
          i.relais = true;
          i.relaisParams = new Map([...(i.relaisParams || []), ...params]);
          croissance = true;
        }
        continue;
      }
    }
    i.generateur = true;
    i.relais = false;
    croissance = true;
    const [{ module, n }, nature] = suspendus.find(([x, s]) => !i.candidat || !relaye(i, x.n, s)) || suspendus[0];
    i.raison = `${nature} : ${texteDe(module, n).slice(0, 60)} (ligne ${n.loc.start.line})`;
  }
} while (croissance);
// Les relais dont la jumelle sert : appelés au moins une fois avec de quoi rendre la main, ou relayés
// par la jumelle d'un autre relais.
for (const { module, n } of lieux.appels) {
  if (natureDe(module, n) !== 'relais') continue;
  const [g] = appelees(module, n);
  infos.get(g).jumelle = true;
}
for (let change = true; change;) {
  change = false;
  for (const i of infos.values()) {
    if (!i.relais || !i.jumelle) continue;
    for (const x of i.appels) {
      if (natureDe(x.module, x.n) !== 'relais') continue;
      const j = infos.get([...appelees(x.module, x.n)][0]);
      if (!j.jumelle) { j.jumelle = true; change = true; }
    }
  }
}
for (const i of infos.values()) if (i.generateur) i.queue = enQueue(i);

// --- Ce qui empêche la transformation -------------------------------------------------------------------------
// Une fonction devenue générateur (ou fléchée en queue) qui part vers du code qui n'est pas du jeu :
// l'argument d'un appel dont on ne connaît aucune appelée (forEach, map, sort…).
const fermetures = [];
const suspendue = (g) => estUneFonction(g) && infos.get(g).generateur;
for (const { module, n } of lieux.appels) {
  if (primitive(module, n)) continue;
  if ([...appelees(module, n)].some(estUneFonction)) continue;
  for (const a of n.arguments) {
    for (const g of valeursDe(module, a.type === 'SpreadElement' ? a.argument : a)) {
      if (!suspendue(g)) continue;
      fermetures.push({ i: infos.get(g), appel: `${texteDe(module, n.callee).slice(0, 50)}(…)`, lieu: ligneDe(module, n) });
    }
  }
}
for (const f of fermetures) problemes.push(`${ligneDe(f.i.module, f.i.noeud)} : ${f.i.nom} devient un générateur mais est passée à ${f.appel} (${f.lieu}), qui ne sait pas le parcourir`);

// Les propriétés dont une valeur est devenue générateur et que le code du jeu n'appelle pas lui-même :
// c'est l'hôte (index.js) qui les appelle. `fn` le sait (l'enveloppe) ; les autres, non.
const proprietesAppelees = new Set();
for (const { n } of lieux.appels) if (n.callee.type === 'MemberExpression' && !n.callee.computed) proprietesAppelees.add(n.callee.property.name);
for (const [cle, valeurs] of P) {
  if (cle === 'fn' || proprietesAppelees.has(cle)) continue;
  for (const g of valeurs) {
    if (!suspendue(g)) continue;
    const i = infos.get(g);
    problemes.push(`${ligneDe(i.module, i.noeud)} : ${i.nom}, valeur d'une propriété « ${cle} » que seul l'hôte appelle, devient un générateur`);
  }
}
for (const i of infos.values()) {
  if (!i.generateur) continue;
  const p = i.noeud.__parent;
  if (p.type === 'MethodDefinition' && p.kind !== 'method') problemes.push(`${ligneDe(i.module, i.noeud)} : le ${p.kind === 'constructor' ? 'constructeur' : 'accesseur'} ${i.nom} devrait devenir un générateur`);
  if (p.type === 'Property' && p.kind !== 'init') problemes.push(`${ligneDe(i.module, i.noeud)} : l'accesseur ${i.nom} devrait devenir un générateur`);
  if (i.noeud.async) problemes.push(`${ligneDe(i.module, i.noeud)} : ${i.nom} est async`);
  if (i.noeud.type === 'ArrowFunctionExpression' && !i.queue) {
    // une fonction fléchée récrite en function* perd le this et l'arguments de son contexte
    const lit = [...tousLesNoeuds(i.noeud.body)].find((x) => (x.type === 'ThisExpression' || (x.type === 'Identifier' && x.name === 'arguments'))
      && !enfantDUneFonctionOrdinaire(x, i.noeud));
    if (lit) problemes.push(`${ligneDe(i.module, lit)} : la fonction fléchée ${i.nom} lit ${lit.type === 'ThisExpression' ? 'this' : 'arguments'}`);
  }
}
function enfantDUneFonctionOrdinaire(x, arrete) {
  for (let p = x.__parent; p && p !== arrete; p = p.__parent) if (p.type === 'FunctionExpression' || p.type === 'FunctionDeclaration') return true;
  return false;
}
for (const { module, n } of lieux.appels) if (natureDe(module, n) === 'new') problemes.push(`${ligneDe(module, n)} : new d'un générateur`);
for (const { module, n } of lieux.appels) {
  if (n.__fonction) continue;
  const nature = natureDe(module, n);
  if (nature) problemes.push(`${ligneDe(module, n)} : appel du jeu au niveau du module (${texteDe(module, n).slice(0, 60)})`);
}

// Les appels dont on ne connaît pas l'appelée (un paramètre, une variable où aucune fonction du jeu ne
// circule) : s'il y passait un générateur, il ne serait pas parcouru. Ils sont signalés.
const inconnus = [];
for (const { module, n } of lieux.appels) {
  if (n.callee.type !== 'Identifier' || !n.__fonction) continue;
  const l = liaisonDe(module, n.callee);
  if (!l || l.genre === 'externe' || l.genre === 'fonction' || l.genre === 'classe') continue;
  const cibles = [...appelees(module, n)];
  if (cibles.some((g) => estUneFonction(g) || g === ROUTINE)) continue;
  if (l.genre === 'variable' && l.init && (l.init.type === 'MemberExpression' || l.init.type === 'Identifier')) continue;  // const mul = Math.imul…
  inconnus.push({ module, n, l });
}
for (const x of inconnus) avertissements.push(`${ligneDe(x.module, x.n)} : appel de ${x.n.callee.name} (${x.l.genre}), où ne circule aucune fonction connue`);

// Les adresses appelées que l'analyse ne sait pas dire (lues dans la mémoire du jeu, calculées) : par
// prudence, ces appels peuvent rendre la main, et leurs fonctions deviennent des générateurs.
const adressesInconnues = [];
for (const { module, n } of lieux.appels) {
  const prim = primitive(module, n);
  if (!prim || prim.sorte === 'tic') continue;
  if ([...adressesDe(module, n, prim)].includes(INCONNU)) adressesInconnues.push({ module, n });
}

// --- Le rapport de l'analyse --------------------------------------------------------------------------------
const lignesDuRapport = [];
const dire = (s = '') => { lignesDuRapport.push(s); console.log(s); };
let totalFonctions = 0, totalGenerateurs = 0, totalQueues = 0, totalRelais = 0;
const parModule = [];
for (const m of modules.values()) {
  if (!m.ast) continue;
  const g = m.fonctions.filter((i) => i.generateur && !i.queue).length;
  const q = m.fonctions.filter((i) => i.queue).length;
  const rl = m.fonctions.filter((i) => i.relais && i.jumelle).length;
  totalFonctions += m.fonctions.length; totalGenerateurs += g; totalQueues += q; totalRelais += rl;
  parModule.push({ m, g, q, rl });
}

if (problemes.length) {
  dire(`${problemes.length} problème(s) empêchent la transformation :`);
  for (const p of problemes) dire('  ' + p);
  process.exit(1);
}

// --- La réécriture ------------------------------------------------------------------------------------------
// Des retouches par positions dans le texte d'origine : insertions (avant ou après un nœud) et
// remplacements, appliqués en une passe. Aucun saut de ligne n'est ajouté : les lignes ne bougent pas.
function appliquer(texte, retouches, nom) {
  const parPosition = new Map();
  for (const r of retouches) {
    const cle = r.genre === 'apres' ? r.fin : r.debut;
    if (!parPosition.has(cle)) parPosition.set(cle, []);
    parPosition.get(cle).push(r);
  }
  const positions = [...parPosition.keys()].sort((a, b) => a - b);
  let sortie = '', curseur = 0;
  for (const p of positions) {
    if (p < curseur) throw new Error(`${nom} : retouches qui se chevauchent à la position ${p}`);
    sortie += texte.slice(curseur, p);
    curseur = p;
    const ici = parPosition.get(p);
    // d'abord ce qui ferme les nœuds qui finissent ici (le plus petit d'abord), puis ce qui ouvre ceux
    // qui commencent ici (le plus grand d'abord)
    for (const r of ici.filter((x) => x.genre === 'apres').sort((a, b) => a.taille - b.taille)) sortie += r.texte;
    const remplacements = ici.filter((x) => x.genre === 'remplace');
    if (remplacements.length > 1) throw new Error(`${nom} : deux remplacements à la position ${p}`);
    for (const r of ici.filter((x) => x.genre === 'avant').sort((a, b) => b.taille - a.taille)) sortie += r.texte;
    if (remplacements.length) { sortie += remplacements[0].texte; curseur = remplacements[0].fin; }
  }
  return sortie + texte.slice(curseur);
}

const statistiques = { direct: 0, jeu: 0, tic: 0, indirect: 0, traite: 0, relais: 0, fonctions: 0, flechees: 0, methodes: 0, jumelles: 0 };
// Les retouches d'un module. Chacune dit pour quelle version elle vaut : 'commun' (le module, et les
// jumelles des relais qui la contiennent), 'ordinaire' (seulement le texte en place d'un relais),
// 'jumelle' (seulement la jumelle d'un relais, `pour` : le relais).
function transformer(module) {
  const r = [];
  const importes = new Set();                 // de moteur/hote/reentrance.js
  const jumellesImportees = new Map();        // 'nom local' -> { importe, source } (les jumelles des relais importés)
  const retouche = (x, version = 'commun', pour = null) => r.push({ ...x, version, pour });
  const avant = (n, texte, version, pour) => retouche({ genre: 'avant', debut: n.start, texte, taille: n.end - n.start }, version, pour);
  const apres = (n, texte, version, pour) => retouche({ genre: 'apres', fin: n.end, texte, taille: n.end - n.start }, version, pour);
  const remplacer = (debut, fin, texte, version, pour) => retouche({ genre: 'remplace', debut, fin, texte }, version, pour);
  // L'appel `a` réécrit selon sa nature.
  const reecrire = (a, nature, version, pour) => {
    if (version !== 'ordinaire') statistiques[nature]++;
    if (nature === 'direct') { avant(a, '(yield* ', version, pour); apres(a, ')', version, pour); }
    else if (nature === 'jeu') {
      avant(a, '(yield* ', version, pour); apres(a, ')', version, pour);
      const prop = a.callee.property;
      remplacer(prop.start, prop.end, prop.name === 'appeler' ? 'appelerReentrant' : 'appelerDepuisReentrant', version, pour);
    } else if (nature === 'indirect') { avant(a, '(yield* deleguer(', version, pour); apres(a, '))', version, pour); importes.add('deleguer'); }
    else if (nature === 'traite') { avant(a, 'executerSansPause(', version, pour); apres(a, ')', version, pour); importes.add('executerSansPause'); }
    else if (nature === 'relais') {
      avant(a, '(yield* ', version, pour); apres(a, ')', version, pour);
      const c = a.callee.type === 'MemberExpression' ? a.callee.property : a.callee;
      remplacer(c.start, c.end, `${c.name}Reentrant`, version, pour);
      if (a.callee.type === 'Identifier') {
        const l = a.callee.__portee.resoudre(a.callee.name);
        if (l?.genre === 'import') jumellesImportees.set(`${c.name}Reentrant`, { importe: `${l.importe}Reentrant`, source: l.source });
      }
    } else if (nature === 'tic') {
      if (a.arguments.length) throw new Error(`${ligneDe(module, a)} : attente active inattendue ${texteDe(module, a)}`);
      remplacer(a.start, a.end, '(yield* jeu.ticReentrant())', version, pour);
    }
  };
  // L'en-tête d'une fonction devenue générateur.
  const enGenerateur = (i, version, pour) => {
    const n = i.noeud, p = n.__parent;
    if (n.type === 'FunctionDeclaration' || (n.type === 'FunctionExpression' && p.type !== 'MethodDefinition' && !(p.type === 'Property' && p.method))) {
      if (!module.texte.startsWith('function', n.start)) throw new Error(`${ligneDe(module, n)} : « function » attendu`);
      remplacer(n.start, n.start + 'function'.length, 'function*', version, pour);
      statistiques.fonctions++;
    } else if (n.type === 'FunctionExpression') {
      if (p.computed) throw new Error(`${ligneDe(module, n)} : méthode à nom calculé`);
      retouche({ genre: 'avant', debut: p.key.start, texte: '*', taille: p.end - p.start + 1 }, version, pour);
      statistiques.methodes++;
    } else {
      // (a, b) => corps  →  function* (a, b) { return corps; }   ou   function* (a, b) { … }
      const parametres = n.params.map((x) => texteDe(module, x)).join(', ');
      if (n.body.type === 'BlockStatement') remplacer(n.start, n.body.start, `function* (${parametres}) `, version, pour);
      else {
        remplacer(n.start, n.body.start, `function* (${parametres}) { return `, version, pour);
        retouche({ genre: 'apres', fin: n.body.end, texte: '; }', taille: n.end - n.start + 1 }, version, pour);
      }
      statistiques.flechees++;
    }
  };

  for (const i of module.fonctions) {
    const n = i.noeud;
    for (const { n: a } of i.appels) {
      if (i.queue && a === n.body) continue;               // le corps d'une fléchée en queue reste tel quel
      const nature = natureDe(module, a);
      if (!nature) continue;
      if (i.relais && rendLaMain(nature)) {
        // un appel relayé : tel quel dans la version ordinaire (l'appel d'un paramètre, parcouru d'une
        // traite par prudence), en générateur dans la jumelle (l'appel d'un paramètre par deleguer)
        const prim = primitive(module, a);
        if (!prim && nature !== 'relais') reecrire(a, 'traite', 'ordinaire');
        if (i.jumelle) reecrire(a, prim || nature === 'relais' ? nature : 'indirect', 'jumelle', i);
        continue;
      }
      reecrire(a, nature);
    }
    if (i.generateur && !i.queue) enGenerateur(i);
    if (i.relais && i.jumelle) statistiques.jumelles++;
  }

  // Le module en place : tout, sauf les retouches des jumelles.
  let texte = appliquer(module.texte, r.filter((x) => x.version !== 'jumelle'), module.nom);
  // Les jumelles, à la fin : le texte du relais, avec les retouches communes qu'il contient et les
  // siennes, sous un autre nom.
  const jumelles = [];
  for (const i of module.fonctions) {
    if (!i.relais || !i.jumelle) continue;
    const n = i.noeud, { nom, sorte, exporte, classe } = i.candidat;
    const dedans = (x) => (x.genre === 'apres' ? x.fin > n.start && x.fin <= n.end : x.debut >= n.start && x.debut < n.end);
    const propres = r.filter((x) => dedans(x) && (x.version === 'commun' || x.pour === i))
      .map((x) => ({ ...x, debut: x.debut - n.start, fin: x.fin - n.start }));
    let corps;
    if (sorte === 'declaration') {
      propres.push({ genre: 'remplace', debut: 0, fin: n.id.end - n.start, texte: `function* ${nom}Reentrant` });
      corps = appliquer(module.texte.slice(n.start, n.end), propres, module.nom);
      jumelles.push(`${exporte ? 'export ' : ''}${corps}`);
    } else if (sorte === 'constante') {
      const parametres = n.params.map((x) => texteDe(module, x)).join(', ');
      if (n.type === 'ArrowFunctionExpression') {
        if (n.body.type === 'BlockStatement') propres.push({ genre: 'remplace', debut: 0, fin: n.body.start - n.start, texte: `function* (${parametres}) ` });
        else {
          propres.push({ genre: 'remplace', debut: 0, fin: n.body.start - n.start, texte: `function* (${parametres}) { return ` });
          propres.push({ genre: 'apres', fin: n.end - n.start, texte: '; }', taille: n.end - n.start + 1 });
        }
      } else propres.push({ genre: 'remplace', debut: 0, fin: 'function'.length, texte: 'function*' });
      corps = appliquer(module.texte.slice(n.start, n.end), propres, module.nom);
      jumelles.push(`${exporte ? 'export ' : ''}const ${nom}Reentrant = ${corps};`);
    } else {
      // la méthode : sa valeur est le texte qui suit son nom, « (paramètres) { … } »
      corps = appliquer(module.texte.slice(n.start, n.end), propres, module.nom);
      jumelles.push(`${classe}.prototype.${nom}Reentrant = function* ${corps};`);
    }
  }
  if (jumelles.length) {
    texte += '\n// --- Les jumelles des relais (moteur/node/reentrer.mjs) : les mêmes fonctions, en générateurs, pour\n'
      + '// les appels qui leur passent de quoi rendre la main.\n' + jumelles.join('\n\n') + '\n';
  }
  if (importes.size) texte += `\nimport { ${[...importes].join(', ')} } from '../hote/reentrance.js';   // (moteur/node/reentrer.mjs)\n`;
  for (const [local, { importe, source }] of jumellesImportees) texte += `import { ${importe === local ? local : `${importe} as ${local}`} } from '${source}';\n`;
  // la variante doit se lire : une retouche mal placée (un yield hors d'un générateur) s'y voit
  try { analyser(texte); } catch (e) {
    const ligne = texte.split('\n')[e.loc?.line - 1] || '';
    throw new Error(`moteur/jeu/${module.nom} transformé ne se lit pas : ${e.message} (ligne ${e.loc?.line})\n  ${ligne.trim()}`);
  }
  return texte;
}

// --- index.js : le contexte et l'enveloppe ------------------------------------------------------------------
// Récrits d'après les gabarits ci-dessous. L'empreinte des fonctions d'origine est vérifiée : si elles
// ont changé, le gabarit est peut-être à revoir, et l'outil le dit plutôt que d'écrire un moteur faux.
const EMPREINTES_INDEX = { contexte: '22de9930593d', enveloppe: '1dcba06be769' };
const GABARITS_INDEX = {
  contexte: `export function contexte(machine, T) {
  // (moteur réentrant, moteur/node/reentrer.mjs) appeler, appelerDepuis et tic rendent de quoi faire
  // \`yield*\` : l'appelée peut rendre la main (T.appeler rend undefined quand elle a fini, sinon
  // l'itérateur qui la finira) ; puis, au retour, si l'hôte l'a demandé (machine.pauseDemandee) et
  // hors d'une interruption, la demande est rendue au pilote (moteur/hote/reentrance.js). Quand
  // l'appelée a fini d'une traite et que rien n'est demandé, le cas ordinaire, le résultat est rendu
  // tel quel dans un Immediat : aucun générateur n'est créé.
  const enPause = () => machine.pauseDemandee !== null && !machine.enInterruption;
  function* rendreLaMain(resultat) {
    const demande = machine.pauseDemandee;
    machine.pauseDemandee = null;
    yield demande;
    return resultat;
  }
  // la fin d'un appel dont l'appelée rend la main : l'attendre, puis ce que fait \`fin\` (rendre eax)
  function* attendre(suite, fin, n) {
    yield* suite;
    const resultat = fin(n);
    if (enPause()) {
      const demande = machine.pauseDemandee;
      machine.pauseDemandee = null;
      yield demande;
    }
    return resultat;
  }
  const finDAppel = (n) => {
    T.sauver();
    const R = T.R;
    R.esp = (R.esp + 4 * n) | 0;             // l'appelant nettoie les arguments
    const resultat = R.eax;
    T.charger();
    return resultat;
  };
  const finDepuis = (avant) => {
    T.sauver();
    const R = T.R;
    R.esp = avant;
    const resultat = R.eax;
    T.charger();
    return resultat;
  };
  // Empiler les arguments (et l'adresse de retour) comme l'original ; rend le pointeur de pile d'avant.
  const empiler = (retour, pile, args) => {
    T.sauver();
    const R = T.R;
    const avant = R.esp;
    let esp = pile === null ? R.esp : pile | 0;
    for (let k = args.length - 1; k >= 0; k--) { esp = (esp - 4) | 0; machine.w32(esp, args[k]); }
    esp = (esp - 4) | 0;
    machine.w32(esp, retour);
    R.esp = esp;
    T.charger();
    return avant;
  };
  const jeu = {
    machine,
    T,
    etat: new Etat(machine),
    m8: machine.m8,
    dv: machine.dv,
    // Les appels qui ne peuvent pas mener à un point de pause (l'analyse de reentrer.mjs) : comme dans
    // le moteur ordinaire. Si l'appelée rendait tout de même un itérateur, il est parcouru d'une
    // traite (et la pause perdue, comptée : reentrance.js).
    appeler(adresse, ...args) {
      empiler(0xFFFFFFF0, null, args);       // adresse de retour fictive : jamais lue
      const suite = T.appeler(adresse);      // le 'ret' de la fonction retire l'adresse de retour
      if (suite !== undefined) executerSansPause(suite);
      return finDAppel(args.length);
    },
    appelerDepuis(retour, pile, adresse, ...args) {
      const avant = empiler(retour, pile, args);
      const suite = T.appeler(adresse);
      if (suite !== undefined) executerSansPause(suite);
      return finDepuis(avant);
    },
    // Ceux qui le peuvent : ils rendent de quoi faire \`yield*\`.
    appelerReentrant(adresse, ...args) {
      empiler(0xFFFFFFF0, null, args);
      const suite = T.appeler(adresse);
      if (suite !== undefined) return attendre(suite, finDAppel, args.length);
      const resultat = finDAppel(args.length);
      return enPause() ? rendreLaMain(resultat) : new Immediat(resultat);
    },
    appelerDepuisReentrant(retour, pile, adresse, ...args) {
      const avant = empiler(retour, pile, args);
      const suite = T.appeler(adresse);
      if (suite !== undefined) return attendre(suite, finDepuis, avant);
      const resultat = finDepuis(avant);
      return enPause() ? rendreLaMain(resultat) : new Immediat(resultat);
    },
    // L'attente active (jeu.machine.tic() dans le code lisible) : le garde-fou de l'horloge, puis la
    // main rendue si l'hôte l'a demandé. Sans cela, une boucle qui attend un clic ne laisserait
    // jamais la page le lui donner.
    ticReentrant() {
      machine.tic();
      return enPause() ? rendreLaMain(undefined) : new Immediat(undefined);
    },
  };
  return jeu;
}`,
  enveloppe: `function enveloppe(jeu, T, r) {
  // (moteur réentrant) Hybride : la fonction du jeu rend undefined ou son résultat quand elle a fini,
  // ou un itérateur (un générateur, ou une fléchée qui en rend un) ; l'enveloppe rend alors, elle
  // aussi, un itérateur qui la finit et fait le 'ret'. Les fonctions ordinaires restent sans
  // générateur.
  // (un Immediat, ce que rend jeu.appeler quand l'appelée a fini d'une traite, est déjà le résultat)
  const iterateur = (x) => typeof x === 'object' && x !== null && typeof x.next === 'function' && !(x instanceof Immediat);
  if (r.convention === 'brute') {
    function* finir(suite) { yield* suite; T.charger(); }
    return () => {
      T.sauver();
      const suite = r.fn(jeu, T.R);
      if (iterateur(suite)) return finir(suite);
      T.charger();
    };
  }
  if (r.convention === 'registres') {
    function* finir(suite, R, esp) { yield* suite; R.esp = (esp + 4 + (r.nettoie || 0)) | 0; T.charger(); }
    return () => {
      T.sauver();
      const R = T.R, esp = R.esp >>> 0;
      const suite = r.fn(jeu, R);
      if (iterateur(suite)) return finir(suite, R, esp);
      R.esp = (esp + 4 + (r.nettoie || 0)) | 0;
      T.charger();
    };
  }
  const n = r.arguments || 0;
  function* finir(suite, R, esp) {
    const resultat = yield* suite;
    if (resultat !== undefined) R.eax = resultat | 0;
    R.esp = (esp + 4) | 0;
    T.charger();
  }
  return () => {
    T.sauver();
    const R = T.R, esp = R.esp >>> 0;
    const args = [];
    for (let k = 0; k < n; k++) args.push(jeu.machine.r32(esp + 4 + 4 * k));
    let resultat = r.fn(jeu, ...args);
    if (resultat instanceof Immediat) resultat = resultat.valeur;
    else if (iterateur(resultat)) return finir(resultat, R, esp);
    if (resultat !== undefined) R.eax = resultat | 0;
    R.esp = (esp + 4) | 0;            // le 'ret' : on retire l'adresse de retour
    T.charger();
  };
}`,
};
const empreinte = (s) => crypto.createHash('sha1').update(s.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);
function transformerIndex() {
  const module = modules.get('index.js');
  const ast = analyser(module.texte);
  const r = [];
  for (const nom of Object.keys(GABARITS_INDEX)) {
    let noeud = null;
    for (const s of ast.body) {
      const d = s.type === 'ExportNamedDeclaration' ? s.declaration : s;
      if (d?.type === 'FunctionDeclaration' && d.id.name === nom) noeud = s;
    }
    if (!noeud) throw new Error(`moteur/jeu/index.js : pas de fonction ${nom}`);
    const origine = module.texte.slice(noeud.start, noeud.end);
    const e = empreinte(origine);
    if (e !== EMPREINTES_INDEX[nom]) {
      throw new Error(`moteur/jeu/index.js : ${nom} a changé (empreinte ${e}, le gabarit a été écrit pour ${EMPREINTES_INDEX[nom]}) : `
        + 'revoir son gabarit dans moteur/node/reentrer.mjs, puis y mettre la nouvelle empreinte');
    }
    // (le même nombre de lignes n'est pas gardé ici : ces deux fonctions ne sont que de l'hôte)
    r.push({ genre: 'remplace', debut: noeud.start, fin: noeud.end, texte: GABARITS_INDEX[nom] });
  }
  const texte = appliquer(module.texte, r, 'index.js')
    + "\nimport { Immediat, executerSansPause } from '../hote/reentrance.js';   // (moteur/node/reentrer.mjs)\n";
  analyser(texte);
  return texte;
}

// --- L'hôte : les retouches ----------------------------------------------------------------------------------
// [avant, après] : `avant` doit se trouver exactement une fois dans le fichier.
const RETOUCHES_HOTE = {
  'processeur.js': [
    ['if (f !== undefined) { f(); return; }',
      // (moteur réentrant) ce que rend la fonction : undefined, ou l'itérateur qui la finira
      'if (f !== undefined) return f();'],
  ],
  'machine.js': [
    ['    this.enInterruption = false;\n    this.observateurs = [];',
      '    this.enInterruption = false;\n    this.pauseDemandee = null;       // (moteur réentrant) posée par un observateur : rendre la main\n    this.observateurs = [];'],
    // demarrer rend l'exécution du programme (undefined s'il a fini d'une traite), qu'un pilote conduit
    ['    T.appeler(this.le.pointEntree);\n  }', '    return T.appeler(this.le.pointEntree);\n  }'],
    ['T.remplacer(this.adresseImage, () => { this.nouvelleImage(); suite(); });',
      'T.remplacer(this.adresseImage, () => { this.nouvelleImage(); return suite(); });'],
    // une interruption s'exécute d'une traite : elle ne rend pas la main au navigateur
    ['        T.appeler(off);\n      } catch (e) {', '        executerSansPause(T.appeler(off));\n      } catch (e) {'],
    ['{ T.charger(); T.appeler(e.off); }', '{ T.charger(); executerSansPause(T.appeler(e.off)); }'],
  ],
};
const FIN_HOTE = { 'machine.js': "\nimport { executerSansPause } from './reentrance.js';   // (moteur/node/reentrer.mjs)\n" };
function retoucherLHote(nom, texte) {
  texte = texte.replace(/\r\n/g, '\n');
  for (const [avant, apres] of RETOUCHES_HOTE[nom] || []) {
    const k = texte.indexOf(avant);
    if (k < 0 || texte.indexOf(avant, k + 1) >= 0) {
      throw new Error(`moteur/hote/${nom} : le texte à retoucher ${k < 0 ? 'est introuvable' : 'y est plusieurs fois'} :\n  ${avant.split('\n')[0]}\n`
        + 'revoir RETOUCHES_HOTE dans moteur/node/reentrer.mjs');
    }
    texte = texte.slice(0, k) + apres + texte.slice(k + avant.length);
  }
  return texte + (FIN_HOTE[nom] || '');
}

// --- Écrire la variante -------------------------------------------------------------------------------------
const sorties = new Map();          // chemin relatif -> texte
for (const m of modules.values()) {
  sorties.set(path.join('jeu', m.nom), m.nom === 'index.js' ? transformerIndex() : transformer(m));
}
for (const nom of fs.readdirSync(path.join(SOURCE, 'hote')).filter((f) => f.endsWith('.js'))) {
  sorties.set(path.join('hote', nom), retoucherLHote(nom, fs.readFileSync(path.join(SOURCE, 'hote', nom), 'utf8')));
}
for (const nom of Object.keys(RETOUCHES_HOTE)) if (!sorties.has(path.join('hote', nom))) throw new Error(`moteur/hote/${nom} introuvable`);
if (!sorties.has(path.join('hote', 'reentrance.js'))) throw new Error('moteur/hote/reentrance.js introuvable');

dire(`Moteur réentrant (moteur/node/reentrer.mjs), ${new Date().toISOString()}`);
dire(PARTOUT ? 'Mode --partout : chaque appel du jeu peut rendre la main.'
  : `Points de pause : ${[...POINTS_DE_PAUSE].map((a) => '0x' + a.toString(16).toUpperCase()).join(', ')}, et les attentes actives ; `
    + `seuls les appels qui peuvent y mener rendent la main.`);
dire();
dire('Fonctions transformées par module (générateurs, fléchées en queue, relais qui ont une jumelle / fonctions) :');
for (const { m, g, q, rl } of parModule) if (g || q || rl) dire(`  ${m.nom.padEnd(28)} ${String(g).padStart(4)} ${String(q).padStart(4)} ${String(rl).padStart(4)} / ${m.fonctions.length}`);
const sansGenerateur = parModule.filter(({ g, q, rl }) => !g && !q && !rl).map(({ m }) => m.nom);
dire(`  sans générateur : ${sansGenerateur.join(', ')}`);
dire(`  total : ${totalGenerateurs} générateurs, ${totalQueues} fléchées en queue et ${totalRelais} relais (et leurs jumelles), sur ${totalFonctions} fonctions ; points fixes en ${tours} tours`);
dire(`  réécrites en générateurs : ${statistiques.fonctions} fonctions, ${statistiques.methodes} méthodes, ${statistiques.flechees} fléchées`);
dire();
dire('Sites d\'appel réécrits :');
dire(`  jeu.appeler / appelerDepuis qui peuvent rendre la main          : ${statistiques.jeu}`);
dire(`  appels directs d'une fonction devenue générateur            : ${statistiques.direct}`);
dire(`  appels indirects, par deleguer (T.appeler, routines, tables) : ${statistiques.indirect}`);
dire(`  appels de relais, vers leur jumelle                         : ${statistiques.relais}`);
dire(`  attentes actives (jeu.machine.tic)                          : ${statistiques.tic}`);
dire(`  T.appeler et routines de l'hôte faits d'une traite          : ${statistiques.traite}`);
dire(`  (appels dont l'adresse est inconnue de l'analyse, qui peuvent donc rendre la main : ${adressesInconnues.length})`);
dire();
dire(`Adresses inconnues tenues pour sans pause (ADRESSES_SANS_PAUSE) : ${ADRESSES_SANS_PAUSE.filter((x) => x.servie).length} sur ${ADRESSES_SANS_PAUSE.length}`);
for (const x of ADRESSES_SANS_PAUSE) if (!x.servie && !PARTOUT) dire(`  (inutilisée : ${x[0]} ${x[1]})`);
dire(`Fermetures passées à du code qui n'est pas du jeu : ${fermetures.length}`);
dire(`Avertissements : ${avertissements.length}`);
for (const a of avertissements) dire('  ' + a);
if (DETAIL) {
  dire();
  dire('Détail :');
  for (const i of infos.values()) if (i.generateur) dire(`  ${ligneDe(i.module, i.noeud)} ${i.nom}${i.queue ? ' (en queue)' : ''} — ${i.raison}`);
  dire();
  dire('Adresses inconnues :');
  for (const { module, n } of adressesInconnues) dire(`  ${ligneDe(module, n)} ${texteDe(module, n).slice(0, 90)}`);
}

if (!ANALYSE_SEULE) {
  fs.rmSync(SORTIE, { recursive: true, force: true });
  for (const [chemin, texte] of sorties) {
    fs.mkdirSync(path.dirname(path.join(SORTIE, chemin)), { recursive: true });
    fs.writeFileSync(path.join(SORTIE, chemin), texte);
  }
  // le package.json du projet dit « type: module » : la variante, hors de moteur/, le redit
  fs.writeFileSync(path.join(SORTIE, 'package.json'), '{ "type": "module" }\n');
  fs.writeFileSync(path.join(SORTIE, 'rapport.txt'), lignesDuRapport.join('\n') + '\n');
  dire();
  dire(`Écrit dans ${path.relative(RACINE, SORTIE)} (${sorties.size} fichiers).`);
}
// --indirects : les appels qui passent par deleguer, regroupés par appelée (le nombre entre crochets :
// celui des fonctions qui peuvent y arriver).
if (INDIRECTS) {
  const compte = new Map();
  for (const { module, n } of lieux.appels) {
    if (natureDe(module, n) !== 'indirect') continue;
    const k = `${module.nom} ${texteDe(module, n.callee).slice(0, 40)} [${[...appelees(module, n)].length}]`;
    compte.set(k, (compte.get(k) || 0) + 1);
  }
  for (const [k, v] of [...compte].sort((a, b) => b[1] - a[1]).slice(0, 60)) console.log(String(v).padStart(4), k);
}
