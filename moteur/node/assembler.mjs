// L'assembleur : réunir un graphe de modules ES en UN SEUL script classique.
//
// Pourquoi. Le but est un unique fichier HTML qu'on ouvre en double-clic (file://), y compris sur de
// vieux navigateurs (Chrome 49, Firefox 52) : ils n'ont pas les modules ES, et refusent de charger un
// script externe depuis file://. Il faut donc un « bundler ». Aucune dépendance ne pouvant être
// téléchargée, celui-ci est écrit ici, avec pour seul outil l'analyseur (acorn 8.8) que Node embarque :
//     node --expose-internals moteur/node/assembler.mjs <entrée> [--sortie f.js] [--nom EspaceGlobal]
// (`--expose-internals` ne sert qu'à atteindre `internal/deps/acorn/...` ; à défaut, on essaie un
// paquet `acorn` installé, sinon on s'arrête avec un message clair).
//
// Comment : l'aplatissement de portée (« scope hoisting »). Tous les modules vont dans UNE fonction
// (IIFE en mode strict), l'un après l'autre, dans l'ordre topologique. Chaque liaison de premier
// niveau d'un module devient une variable de cette fonction, et chaque `import` devient un accès
// direct à la variable de l'exportateur : ni objet de module, ni appel de fonction, ni getter sur le
// chemin chaud. Conséquences utiles :
//  - les liaisons vivantes des ES modules (`export let` modifié après coup) sont exactes, gratuitement ;
//  - une fonction déclarée dans un module est remontée (hoisting) dans tout l'assemblage : avec un
//    cycle d'imports, elle reste appelable, comme dans un vrai module ;
//  - `const`/`class` gardent leur zone morte temporelle : un cycle mal ordonné lève la même
//    ReferenceError qu'avec les modules ES.
// Pour cela on lit chaque module en analysant les portées (déclarations, ombrages, `var` remonté, nom
// de fonction/classe local...), et on réécrit le TEXTE SOURCE par positions (start/end des nœuds) : le
// reste est laissé tel quel, et les lignes supprimées (`import`, `export {...}`) sont remplacées par
// des sauts de ligne, si bien que les numéros de ligne de chaque module se retrouvent, décalés d'un
// simple nombre de lignes (le résultat donne `lignes`, le début de chaque module dans le code).
//
// Ce qu'on renomme : une liaison de premier niveau reçoit un nom du script unique si son nom est déjà
// pris (par un autre module, par une variable globale que d'autres modules lisent, par une variable
// locale d'un module qui l'importe : `nom$2`, `nom$3`...). Sinon elle garde son nom : le code reste
// lisible. `Function.prototype.name` d'une fonction renommée change donc (traces de pile seulement).
//
// Géré :
//  - `import x from`, `import { a, b as c } from`, `import * as ns from`, `import './x.js'` ;
//  - `export function/async function/class/const/let/var` (y compris par déstructuration),
//    `export { a, b as c }`, `export { a } from`, `export { a as default } from`,
//    `export * from`, `export * as ns from`, `export default` (expression, fonction, classe, anonymes ou non) ;
//  - `import * as ns` : `ns.f` devient directement la variable de `f` (donc `ns.f()` s'appelle avec
//    `this` non défini, non l'espace de noms : sans conséquence tant que f n'utilise pas `this`) ; si
//    `ns` sert autrement (`Object.entries(ns)`...), un vrai objet-espace de noms est fabriqué (propriétés en
//    lecture seule, rangées par ordre alphabétique, valeurs lues en direct par des getters, comme un
//    objet de module) ;
//  - les liaisons vivantes, sans rien de plus (voir plus haut) ;
//  - les substitutions (`options.substitutions(chemin absolu)` : le chemin d'un autre module à prendre
//    à sa place, ou rien) : la distribution prend ainsi le moteur réentrant à la place de moteur/jeu
//    et moteur/hote, et environnement-distribution.js à la place d'environnement.js
//    (moteur/node/construire-distribution.mjs) ;
//  - les modules externes (`fs`, `node:crypto`, tout ce qui n'est pas relatif) et `import('...')` avec
//    une chaîne littérale : erreur nette, sauf si `options.remplacements = { crypto: 'code JS' }` les
//    donne. Le code est une expression évaluée une fois au début du script ; `import x from 'crypto'`
//    et `import * as x` la lisent telle quelle, `import { a } from 'crypto'` en lit la propriété `a`,
//    et `import('crypto')` rend `Promise.resolve(expression)`.
//
// Refusé, avec l'endroit exact dans le fichier (toutes les erreurs trouvées sont rapportées d'un coup,
// dans `Error.problemes`) : `import.meta`, `import()` non littéral ou non remplacé, `await` au premier
// niveau d'un module, imports non résolus ou noms importés qui n'existent pas, `export * from` d'un
// module externe.
//
// Cycles d'imports : chaque module n'est assemblé qu'une fois, à sa première rencontre ; l'ordre est
// celui d'un parcours en profondeur, dépendances d'abord (les imports d'un module sont visités dans
// l'ordre du texte). En cas de cycle, le module qui referme la boucle est donc placé avant celui qui
// l'a ouvert, comme dans l'évaluation des modules ES.
//
// Syntaxe du code produit : celle des sources, rien de plus récent (l'assembleur ne transpile pas) ;
// le code qu'il ajoute lui-même est de l'ES5 (sauf `const`, comme dans les sources).
//
// Le script produit n'est pas un module : `(function () { 'use strict'; ... return espaceDeLEntree; }).call(void 0);`.
// Avec `nom`, les exports du module d'entrée sont aussi posés sur `globalThis[nom]` (ou window, self,
// global). Sous Node, `vm.runInThisContext(code)` rend l'espace de noms de l'entrée.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';

// --- l'analyseur ---------------------------------------------------------------------------------------
function chargerAcorn() {
  const require = createRequire(import.meta.url);
  for (const nom of ['internal/deps/acorn/acorn/dist/acorn', 'acorn']) {
    try { return require(nom); } catch (e) { /* suivant */ }
  }
  throw new Error("assembler.mjs : pas d'analyseur acorn ; lancer avec `node --expose-internals` (acorn est celui de Node)");
}

// --- portées ---------------------------------------------------------------------------------------------
class Portee {
  constructor(genre, parent, estFonction = false) {
    this.genre = genre; this.parent = parent; this.estFonction = estFonction; this.decls = new Map();
  }
  fonction() { let p = this; while (!p.estFonction && p.parent) p = p.parent; return p; }
  enFonction() { for (let p = this; p; p = p.parent) if (p.estFonction) return true; return false; }
  chercher(nom) { for (let p = this; p; p = p.parent) { const b = p.decls.get(nom); if (b) return b; } return null; }
}

const CLES_IGNOREES = new Set(['type', 'start', 'end', 'loc', 'range']);
const saut = (texte) => texte.replace(/[^\n]/g, '');
const identifiantValide = (s) => /^[A-Za-z_$][\w$]*$/.test(s);
const nomDeLiteral = (n) => (n.type === 'Identifier' ? n.name : n.value);   // Identifier ou chaîne (ES2022)

// Les noms qu'un motif de déclaration (`{ a, b: [c] }`) introduit.
function nomsDuMotif(p, sortie = []) {
  if (!p) return sortie;
  switch (p.type) {
    case 'Identifier': sortie.push(p.name); break;
    case 'ObjectPattern': for (const q of p.properties) nomsDuMotif(q.type === 'RestElement' ? q.argument : q.value, sortie); break;
    case 'ArrayPattern': for (const q of p.elements) nomsDuMotif(q, sortie); break;
    case 'RestElement': nomsDuMotif(p.argument, sortie); break;
    case 'AssignmentPattern': nomsDuMotif(p.left, sortie); break;
    default: break;
  }
  return sortie;
}

// --- lecture d'un module : portées, liaisons, exports, dépendances -----------------------------------
function analyser(mod, acorn, probleme) {
  const source = mod.source;
  const signaler = (noeud, message) => {
    const l = acorn.getLineInfo(source, noeud.start);
    probleme(`${mod.id}:${l.line}:${l.column + 1} : ${message}`);
  };
  const racine = new Portee('module', null);
  mod.racine = racine;
  mod.edits = [];                  // { debut, fin, texte } indépendants de l'édition des liens
  mod.specs = [];                  // dépendances, dans l'ordre du texte : { spec, noeud }
  mod.exports = new Map();         // nom exporté -> { genre: 'local', local } | { genre: 'indirect', spec, nom }
  mod.etoiles = [];                // `export * from` : { spec, noeud }
  mod.defauts = [];                // `export default` anonymes ou d'expression : { debut, fin, liaison, ajouterPointVirgule }
  mod.dynamiques = [];             // import('...') littéraux : { noeud, spec }
  mod.libres = new Set();          // noms lus sans déclaration (globales)
  mod.imbriquees = new Set();      // noms déclarés ailleurs qu'au premier niveau
  const refs = [];

  const declarer = (portee, nom, noeud, genre, raccourci = false) => {
    let b = portee.decls.get(nom);
    if (!b) {
      b = { nom, genre, portee, module: mod, decls: [], refs: [], nouveau: nom, utiliseAilleurs: false, importe: null };
      portee.decls.set(nom, b);
      if (portee !== racine) mod.imbriquees.add(nom);
    }
    if (noeud) b.decls.push({ noeud, raccourci });
    return b;
  };
  const supprimer = (n) => mod.edits.push({ debut: n.start, fin: n.end, texte: saut(source.slice(n.start, n.end)) });

  function declarerMotif(p, portee, genre, raccourci = false) {
    switch (p.type) {
      case 'Identifier': declarer(portee, p.name, p, genre, raccourci); break;
      case 'ObjectPattern':
        for (const q of p.properties) {
          if (q.type === 'RestElement') { declarerMotif(q.argument, portee, genre); continue; }
          if (q.computed) visiter(q.key, portee);
          declarerMotif(q.value, portee, genre, q.shorthand);
        }
        break;
      case 'ArrayPattern': for (const q of p.elements) if (q) declarerMotif(q, portee, genre); break;
      case 'RestElement': declarerMotif(p.argument, portee, genre); break;
      case 'AssignmentPattern': declarerMotif(p.left, portee, genre, raccourci); visiter(p.right, portee); break;
      default: visiter(p, portee); break;    // MemberExpression dans un motif d'affectation
    }
  }

  function visiterFonction(n, portee) {
    const p = new Portee('fonction', portee, true);
    if (n.type === 'FunctionExpression' && n.id) declarer(p, n.id.name, n.id, 'nom-de-fonction');
    for (const q of n.params) declarerMotif(q, p, 'parametre');
    if (n.body.type === 'BlockStatement') for (const s of n.body.body) visiter(s, p);
    else visiter(n.body, p);
  }

  function visiterEnfants(n, portee) {
    for (const cle of Object.keys(n)) {
      if (CLES_IGNOREES.has(cle)) continue;
      const v = n[cle];
      if (Array.isArray(v)) { for (const e of v) if (e && typeof e.type === 'string') visiter(e, portee, n); }
      else if (v && typeof v.type === 'string') visiter(v, portee, n);
    }
  }

  function visiter(n, portee, parent) {
    if (!n) return;
    switch (n.type) {
      case 'Identifier': refs.push({ noeud: n, portee, parent, raccourci: !!n.$raccourci }); return;
      case 'Literal': case 'ThisExpression': case 'Super': case 'EmptyStatement': case 'DebuggerStatement':
      case 'BreakStatement': case 'ContinueStatement': case 'TemplateElement': case 'PrivateIdentifier':
        return;
      case 'MemberExpression':
        visiter(n.object, portee, n);
        if (n.computed) visiter(n.property, portee, n);
        return;
      case 'Property':
        if (n.computed) visiter(n.key, portee, n);
        if (n.shorthand) { const v = n.value.type === 'AssignmentPattern' ? n.value.left : n.value; v.$raccourci = true; }
        visiter(n.value, portee, n);
        return;
      case 'MethodDefinition':
        if (n.computed) visiter(n.key, portee, n);
        visiter(n.value, portee, n);
        return;
      case 'PropertyDefinition':
        if (n.computed) visiter(n.key, portee, n);
        if (n.value) visiter(n.value, portee, n);
        return;
      case 'StaticBlock': { const p = new Portee('fonction', portee, true); for (const s of n.body) visiter(s, p); return; }
      case 'LabeledStatement': visiter(n.body, portee, n); return;
      case 'MetaProperty':
        if (n.meta.name === 'import') signaler(n, "`import.meta` n'est pas géré (un script classique n'a pas d'URL de module)");
        return;
      case 'ImportExpression': {
        const s = n.source;
        if (s.type === 'Literal' && typeof s.value === 'string') mod.dynamiques.push({ noeud: n, spec: s.value });
        else signaler(n, "`import()` non littéral : non géré");
        return;
      }
      case 'AwaitExpression':
        if (!portee.enFonction()) signaler(n, "`await` au premier niveau d'un module : non géré");
        visiterEnfants(n, portee);
        return;
      case 'ForOfStatement': case 'ForInStatement': case 'ForStatement': {
        if (n.await && !portee.enFonction()) signaler(n, "`for await` au premier niveau d'un module : non géré");
        const p = new Portee('bloc', portee);
        visiterEnfants(n, p);
        return;
      }
      case 'BlockStatement': { const p = new Portee('bloc', portee); for (const s of n.body) visiter(s, p); return; }
      case 'SwitchStatement': {
        visiter(n.discriminant, portee, n);
        const p = new Portee('bloc', portee);
        for (const c of n.cases) { if (c.test) visiter(c.test, p, c); for (const s of c.consequent) visiter(s, p); }
        return;
      }
      case 'CatchClause': {
        const p = new Portee('bloc', portee);
        if (n.param) declarerMotif(n.param, p, 'catch');
        for (const s of n.body.body) visiter(s, p);
        return;
      }
      case 'VariableDeclaration': {
        const cible = n.kind === 'var' ? portee.fonction() : portee;
        for (const d of n.declarations) { declarerMotif(d.id, cible, n.kind); if (d.init) visiter(d.init, portee, d); }
        return;
      }
      case 'FunctionDeclaration':
        if (n.id) declarer(portee, n.id.name, n.id, 'fonction');
        visiterFonction(n, portee);
        return;
      case 'FunctionExpression': case 'ArrowFunctionExpression': visiterFonction(n, portee); return;
      case 'ClassDeclaration':
        // le nom d'une classe déclarée ne vit qu'au dehors : les références de son corps le retrouvent là
        if (n.id) declarer(portee, n.id.name, n.id, 'classe');
        if (n.superClass) visiter(n.superClass, portee, n);
        for (const m of n.body.body) visiter(m, portee, n.body);
        return;
      case 'ClassExpression': {
        const p = new Portee('classe', portee);
        if (n.id) declarer(p, n.id.name, n.id, 'nom-de-classe');
        if (n.superClass) visiter(n.superClass, p, n);
        for (const m of n.body.body) visiter(m, p, n.body);
        return;
      }
      case 'AssignmentExpression': case 'UpdateExpression': {
        // (pour refuser l'écriture d'une liaison importée : voir l'édition des textes)
        const cible = n.type === 'UpdateExpression' ? n.argument : n.left;
        if (cible.type === 'Identifier' || cible.type === 'MemberExpression') cible.$ecrit = true;
        visiterEnfants(n, portee);
        return;
      }
      case 'CallExpression':
        if (n.callee.type === 'Identifier' && n.callee.name === 'eval') mod.avertissements.push(`${mod.id} : \`eval\` direct, non analysable`);
        visiterEnfants(n, portee);
        return;
      default: visiterEnfants(n, portee);
    }
  }

  // le premier niveau : imports et exports
  for (const s of mod.ast.body) {
    switch (s.type) {
      case 'ImportDeclaration': {
        mod.specs.push({ spec: s.source.value, noeud: s });
        for (const sp of s.specifiers) {
          const nom = sp.type === 'ImportDefaultSpecifier' ? 'default' : sp.type === 'ImportNamespaceSpecifier' ? '*' : nomDeLiteral(sp.imported);
          const b = declarer(racine, sp.local.name, null, 'import');
          b.importe = { spec: s.source.value, nom, noeud: sp };
        }
        supprimer(s);
        break;
      }
      case 'ExportNamedDeclaration': {
        if (s.declaration) {
          visiter(s.declaration, racine, s);
          const d = s.declaration;
          const noms = d.type === 'VariableDeclaration' ? d.declarations.flatMap((x) => nomsDuMotif(x.id)) : [d.id.name];
          for (const nom of noms) mod.exports.set(nom, { genre: 'local', local: nom, noeud: s });
          mod.edits.push({ debut: s.start, fin: d.start, texte: '' });        // « export » seul s'en va
        } else {
          if (s.source) mod.specs.push({ spec: s.source.value, noeud: s });
          for (const sp of s.specifiers) {
            const nom = nomDeLiteral(sp.exported);
            if (s.source) mod.exports.set(nom, { genre: 'indirect', spec: s.source.value, nom: nomDeLiteral(sp.local), noeud: sp });
            else mod.exports.set(nom, { genre: 'local', local: nomDeLiteral(sp.local), noeud: sp });
          }
          supprimer(s);
        }
        break;
      }
      case 'ExportAllDeclaration':
        mod.specs.push({ spec: s.source.value, noeud: s });
        if (s.exported) mod.exports.set(nomDeLiteral(s.exported), { genre: 'indirect', spec: s.source.value, nom: '*', noeud: s });
        else mod.etoiles.push({ spec: s.source.value, noeud: s });
        supprimer(s);
        break;
      case 'ExportDefaultDeclaration': {
        const d = s.declaration;
        if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) {
          visiter(d, racine, s);
          mod.exports.set('default', { genre: 'local', local: d.id.name, noeud: s });
          mod.edits.push({ debut: s.start, fin: d.start, texte: '' });
        } else {
          // expression, ou fonction/classe anonyme : une constante à part, `const <nom> = <expression>;`
          visiter(d, racine, s);
          const nomLocal = '$defaut';
          const b = declarer(racine, nomLocal, null, 'defaut');
          b.nom = b.nouveau = `${mod.base}$defaut`;
          mod.exports.set('default', { genre: 'local', local: nomLocal, noeud: s });
          mod.defauts.push({ debut: s.start, fin: d.start, liaison: b, apres: d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration' ? d.end : -1 });
        }
        break;
      }
      default: visiter(s, racine, mod.ast);
    }
  }

  // résolution des références, une fois toutes les déclarations connues
  for (const r of refs) {
    const b = r.portee.chercher(r.noeud.name);
    if (b) { b.refs.push(r); r.liaison = b; } else mod.libres.add(r.noeud.name);
  }
  for (const [nom, e] of mod.exports) {
    if (e.genre === 'local' && !racine.decls.has(e.local)) signaler(e.noeud, `\`export\` d'un nom qui n'existe pas : ${e.local} (exporté sous ${nom})`);
  }
}

// --- l'assemblage -------------------------------------------------------------------------------------
export function assembler(entree, options = {}) {
  const acorn = chargerAcorn();
  const racineProjet = path.resolve(options.racine || process.cwd());
  const remplacements = options.remplacements || {};
  const problemes = [];
  const avertissements = [];
  const probleme = (m) => problemes.push(m);

  const identifiant = (fichier) => {
    const r = path.relative(racineProjet, fichier).replace(/\\/g, '/');
    return r.startsWith('..') ? fichier.replace(/\\/g, '/') : r;
  };
  const sain = (s) => s.replace(/\.[^.]*$/, '').replace(/[^\w$]/g, '_').replace(/^(\d)/, '_$1');

  // --- 1. découverte : parcours en profondeur, dépendances d'abord ---
  const modules = new Map();      // chemin absolu -> module
  const externes = new Map();     // nom -> { nom, code, variable }
  const ordre = [];
  // (options.substitutions(chemin) : un autre module à prendre à la place de celui-ci, ou rien)
  const substituer = (c) => (options.substitutions && options.substitutions(c)) || c;
  const resoudre = (spec, depuis) => {
    if (!/^\.\.?\//.test(spec)) return null;
    const base = path.resolve(path.dirname(depuis), spec);
    for (const c of [base, base + '.js', base + '.mjs', path.join(base, 'index.js')]) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return substituer(c);
    }
    return undefined;
  };
  const externe = (spec) => {
    if (!Object.prototype.hasOwnProperty.call(remplacements, spec)) return null;
    if (!externes.has(spec)) externes.set(spec, { nom: spec, code: remplacements[spec], variable: null });
    return externes.get(spec);
  };
  // la cible d'un spécificateur, vue du module `mod` : { module } | { externe } | null (problème déjà signalé)
  const cibleDe = (mod, spec, noeud) => {
    if (mod.cibles.has(spec)) return mod.cibles.get(spec);
    let c = null;
    const chemin = resoudre(spec, mod.fichier);
    if (chemin) c = { module: modules.get(chemin) };
    else if (chemin === undefined) {
      const l = acorn.getLineInfo(mod.source, noeud.start);
      probleme(`${mod.id}:${l.line}:${l.column + 1} : module introuvable : '${spec}'`);
    } else {
      const e = externe(spec);
      if (e) c = { externe: e };
      else {
        const l = acorn.getLineInfo(mod.source, noeud.start);
        probleme(`${mod.id}:${l.line}:${l.column + 1} : import du module externe '${spec}' (non relatif) : `
          + `non géré ; le donner par options.remplacements ({ '${spec}': 'code JS' })`);
      }
    }
    mod.cibles.set(spec, c);
    return c;
  };

  const decouvrir = (fichier) => {
    if (modules.has(fichier)) return;
    const source = fs.readFileSync(fichier, 'utf8').replace(/^﻿/, '');
    const mod = { fichier, id: identifiant(fichier), base: sain(path.basename(fichier)), source, cibles: new Map(), avertissements };
    modules.set(fichier, mod);
    try {
      mod.ast = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
    } catch (e) {
      probleme(`${mod.id}:${e.loc ? e.loc.line + ':' + (e.loc.column + 1) : '?'} : erreur de syntaxe : ${e.message.replace(/ \(\d+:\d+\)$/, '')}`);
      mod.ast = null;
      ordre.push(mod);
      return;
    }
    analyser(mod, acorn, probleme);
    for (const d of mod.dynamiques) {
      if (!Object.prototype.hasOwnProperty.call(remplacements, d.spec)) {
        const l = acorn.getLineInfo(source, d.noeud.start);
        probleme(`${mod.id}:${l.line}:${l.column + 1} : \`import('${d.spec}')\` : non géré ; le donner par options.remplacements`);
      } else externe(d.spec);
    }
    for (const { spec, noeud } of mod.specs) {
      const chemin = resoudre(spec, fichier);
      if (chemin) decouvrir(chemin);
      cibleDe(mod, spec, noeud);
    }
    ordre.push(mod);
  };
  const fichierEntree = path.resolve(entree);
  if (!fs.existsSync(fichierEntree)) throw new Error(`assembler : module d'entrée introuvable : ${entree}`);
  decouvrir(fichierEntree);
  const moduleEntree = modules.get(fichierEntree);
  if (problemes.length) fin();

  function fin() {
    const e = new Error(`assembler : ${problemes.length} problème(s) :\n  ${problemes.join('\n  ')}`);
    e.problemes = problemes;
    throw e;
  }

  // --- 2. liens : à quoi mène chaque nom exporté ou importé ---
  // résultat : { liaison } | { espace: module } | { externe, nom } | null
  const resoudreExport = (mod, nom, vus = new Set()) => {
    const cle = mod.fichier + '\0' + nom;
    if (vus.has(cle)) return null;              // cycle de ré-exports
    vus.add(cle);
    const e = mod.exports.get(nom);
    if (e) {
      if (e.genre === 'local') return resoudreLiaison(mod.racine.decls.get(e.local), vus);
      const c = cibleDe(mod, e.spec, e.noeud);
      if (!c) return null;
      if (c.externe) return { externe: c.externe, nom: e.nom };
      return e.nom === '*' ? { espace: c.module } : resoudreExport(c.module, e.nom, vus);
    }
    if (nom === 'default') return null;
    for (const { spec, noeud } of mod.etoiles) {
      const c = cibleDe(mod, spec, noeud);
      if (!c) continue;
      if (c.externe) continue;
      const r = resoudreExport(c.module, nom, vus);
      if (r) return r;
    }
    return null;
  };
  const resoudreLiaison = (b, vus = new Set()) => {
    if (!b) return null;
    if (b.genre !== 'import') return { liaison: b };
    const debutDeChaine = vus.size === 0;
    if (debutDeChaine && b.cible !== undefined) return b.cible;
    const { spec, nom, noeud } = b.importe;
    const c = cibleDe(b.module, spec, noeud);
    let r = null;
    if (c) {
      if (c.externe) r = { externe: c.externe, nom };
      else if (nom === '*') r = { espace: c.module };
      else r = resoudreExport(c.module, nom, vus);
      if (!r) {
        const l = acorn.getLineInfo(b.module.source, noeud.start);
        probleme(`${b.module.id}:${l.line}:${l.column + 1} : '${c.module.id}' n'exporte pas '${nom}'`);
      }
    }
    if (debutDeChaine) b.cible = r;
    return r;
  };
  const nomsExportes = (mod, vus = new Set()) => {
    if (vus.has(mod)) return [];
    vus.add(mod);
    const noms = new Set(mod.exports.keys());
    for (const { spec, noeud } of mod.etoiles) {
      const c = cibleDe(mod, spec, noeud);
      if (!c) continue;
      if (c.externe) { probleme(`${mod.id} : \`export * from\` d'un module externe ('${spec}') : non géré`); continue; }
      for (const n of nomsExportes(c.module, vus)) if (n !== 'default') noms.add(n);
    }
    return [...noms];
  };

  for (const mod of ordre) {
    for (const b of mod.racine.decls.values()) if (b.genre === 'import') resoudreLiaison(b);
  }
  if (problemes.length) fin();
  // qui est utilisé par un autre module : ces liaisons-là doivent éviter les noms locaux des importateurs
  for (const mod of ordre) {
    for (const b of mod.racine.decls.values()) {
      if (b.genre === 'import' && b.cible && b.cible.liaison) b.cible.liaison.utiliseAilleurs = true;
    }
  }

  // --- 3. les noms du script ---
  const libres = new Set(); const imbriquees = new Set();
  for (const mod of ordre) { for (const n of mod.libres) libres.add(n); for (const n of mod.imbriquees) imbriquees.add(n); }
  const pris = new Set();
  // `strict` : le nom d'origine lui-même doit échapper aux variables locales des autres modules (la
  // liaison est lue ailleurs) ; un nom de remplacement (`x$2`) y échappe toujours.
  const attribuer = (souhait, strict) => {
    const ok = (n) => !pris.has(n) && !libres.has(n) && !RESERVES.has(n) && ((n === souhait && !strict) || !imbriquees.has(n));
    let nom = souhait;
    for (let k = 2; !ok(nom); k++) nom = `${souhait}$${k}`;
    pris.add(nom);
    return nom;
  };
  let renommes = 0;
  for (const mod of ordre) {
    for (const b of mod.racine.decls.values()) {
      if (b.genre === 'import') continue;
      b.nouveau = attribuer(b.nom, b.utiliseAilleurs);
      if (b.nouveau !== b.nom && b.genre !== 'defaut') renommes++;
    }
  }
  // les variables de l'assemblage lui-même : espaces de noms, modules externes, aides
  const variableAssemblage = (base) => attribuer(base, true);
  const espaces = new Map();        // module -> variable (créés à la demande)
  const espaceDe = (mod) => {
    if (!espaces.has(mod)) espaces.set(mod, variableAssemblage(`ns$${mod.base}`));
    return espaces.get(mod);
  };
  for (const e of externes.values()) e.variable = variableAssemblage(`ext$${sain(e.nom)}`);
  const aideEspace = variableAssemblage('$espace');
  const texteExterne = (e, nom) => (nom === 'default' || nom === '*' ? e.variable
    : identifiantValide(nom) ? `${e.variable}.${nom}` : `${e.variable}[${JSON.stringify(nom)}]`);
  const texteResultat = (r) => (r.liaison ? r.liaison.nouveau : r.espace ? espaceDe(r.espace) : texteExterne(r.externe, r.nom));

  // --- 4. l'édition des textes ---
  const ES_ENTREE = espaceDe(moduleEntree);
  for (const mod of ordre) {
    const edits = mod.edits.slice();
    const ajouter = (debut, fin2, texte) => edits.push({ debut, fin: fin2, texte });
    for (const b of mod.racine.decls.values()) {
      if (b.genre === 'import') continue;
      if (b.nouveau === b.nom) continue;
      for (const d of b.decls) ajouter(d.noeud.start, d.noeud.end, d.raccourci ? `${b.nom}: ${b.nouveau}` : b.nouveau);
    }
    // dans toutes les portées : les liaisons de premier niveau renommées, et les imports
    for (const b of mod.racine.decls.values()) {
      for (const r of b.refs) {
        let texte;
        if (b.genre === 'import') {
          const cible = b.cible;
          texte = null;
          if (r.noeud.$ecrit || (r.parent && r.parent.type === 'MemberExpression' && r.parent.object === r.noeud && r.parent.$ecrit && cible.espace)) {
            const l = acorn.getLineInfo(mod.source, r.noeud.start);
            probleme(`${mod.id}:${l.line}:${l.column + 1} : écriture d'une liaison importée (${r.noeud.name}) : interdite dans un module`);
            continue;
          }
          // `ns.membre` : l'accès direct à la liaison du membre
          const p = r.parent;
          if (cible.espace && p && p.type === 'MemberExpression' && p.object === r.noeud
              && ((!p.computed && p.property.type === 'Identifier') || (p.computed && p.property.type === 'Literal' && typeof p.property.value === 'string'))) {
            const nomMembre = p.computed ? p.property.value : p.property.name;
            const m = nomsExportes(cible.espace).includes(nomMembre) ? resoudreExport(cible.espace, nomMembre) : null;
            if (m) { ajouter(p.start, p.end, texteResultat(m)); continue; }
          }
          texte = texteResultat(cible);
        } else {
          if (b.nouveau === b.nom) continue;
          texte = b.nouveau;
        }
        if (texte === r.noeud.name) continue;
        ajouter(r.noeud.start, r.noeud.end, r.raccourci ? `${r.noeud.name}: ${texte}` : texte);
      }
    }
    for (const d of mod.defauts) {
      ajouter(d.debut, d.fin, `const ${d.liaison.nouveau} = `);
      if (d.apres >= 0) ajouter(d.apres, d.apres, ';');
    }
    for (const d of mod.dynamiques) ajouter(d.noeud.start, d.noeud.end, `Promise.resolve(${externes.get(d.spec).variable})`);
    // appliquer, par positions
    edits.sort((a, b) => a.debut - b.debut || a.fin - b.fin);
    let sortie = ''; let curseur = 0;
    for (const e of edits) {
      if (e.debut < curseur) throw new Error(`assembler : réécritures qui se recouvrent dans ${mod.id} (position ${e.debut}) : défaut de l'assembleur`);
      sortie += mod.source.slice(curseur, e.debut) + e.texte;
      curseur = e.fin;
    }
    mod.sortie = sortie + mod.source.slice(curseur);
  }
  if (problemes.length) fin();

  // --- 5. le script ---
  const morceaux = [];
  const lignes = [];
  let ligne = 1;
  const poser = (texte) => { morceaux.push(texte); ligne += (texte.match(/\n/g) || []).length; };
  poser(`// Script assemblé par moteur/node/assembler.mjs à partir de ${identifiant(fichierEntree)} : ${ordre.length} modules, dans l'ordre des dépendances.\n`);
  poser('// Généré : ne pas modifier à la main.\n');
  poser("(function () {\n'use strict';\n");
  for (const e of externes.values()) poser(`const ${e.variable} = (${e.code});\n`);
  // les espaces de noms ne se connaissent qu'après l'édition ; on les écrit maintenant
  const decrire = (mod) => {
    const noms = nomsExportes(mod).sort();
    const champs = noms.map((n) => {
      const r = resoudreExport(mod, n);
      return `${JSON.stringify(n)}: function () { return ${r ? texteResultat(r) : 'undefined'}; }`;
    });
    return `const ${espaceDe(mod)} = ${aideEspace}({ ${champs.join(', ')} });\n`;
  };
  // (texteResultat peut réclamer d'autres espaces : on boucle jusqu'à ce que tout soit écrit)
  const ecrits = new Set(); const blocEspaces = [];
  for (let encore = true; encore;) {
    encore = false;
    for (const mod of [...espaces.keys()]) if (!ecrits.has(mod)) { ecrits.add(mod); blocEspaces.push(decrire(mod)); encore = true; }
  }
  if (espaces.size) {
    poser(`function ${aideEspace}(getters) {\n`
      + '  var o = Object.create(null);\n'
      + '  for (var k in getters) Object.defineProperty(o, k, { enumerable: true, get: getters[k] });\n'
      + "  if (typeof Symbol !== 'undefined' && Symbol.toStringTag) Object.defineProperty(o, Symbol.toStringTag, { value: 'Module' });\n"
      + '  return Object.freeze(o);\n}\n');
    for (const b of blocEspaces) poser(b);
  }
  for (const mod of ordre) {
    poser(`\n// ==== ${mod.id} ====\n`);
    lignes.push({ module: mod.id, debut: ligne });
    poser(mod.sortie.endsWith('\n') ? mod.sortie : mod.sortie + '\n');
  }
  if (options.nom) {
    poser(`\n// ==== espace global ====\n`);
    poser("var $global = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window\n"
      + "  : typeof self !== 'undefined' ? self : typeof global !== 'undefined' ? global : {};\n");
    poser(`$global[${JSON.stringify(options.nom)}] = ${ES_ENTREE};\n`);
  }
  poser(`return ${ES_ENTREE};\n}).call(void 0);\n`);
  if (problemes.length) fin();
  return { code: morceaux.join(''), modules: ordre.map((m) => m.id), lignes, renommes, avertissements };
}

// Des noms qu'une variable de premier niveau ne doit jamais prendre.
const RESERVES = new Set(['arguments', 'eval', 'undefined', 'NaN', 'Infinity']);

// --- ligne de commande ---------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const valeur = (nom) => { const k = args.indexOf(nom); return k >= 0 ? args[k + 1] : null; };
  const remplacements = {};
  args.forEach((a, k) => { if (a === '--remplacer') { const [spec, ...code] = args[k + 1].split('='); remplacements[spec] = code.join('='); } });
  const options = { nom: valeur('--nom'), racine: valeur('--racine') || process.cwd(), remplacements };
  const sorties = new Set(['--sortie', '--nom', '--racine', '--remplacer']);
  const entree = args.find((a, k) => !a.startsWith('--') && !sorties.has(args[k - 1]));
  if (!entree) {
    console.error('usage : node --expose-internals moteur/node/assembler.mjs <module d\'entrée> [--sortie f.js] [--nom EspaceGlobal]\n'
      + '                                 [--racine dossier] [--remplacer module=code]...');
    process.exit(2);
  }
  try {
    const r = assembler(entree, options);
    const sortie = valeur('--sortie');
    if (sortie) {
      fs.mkdirSync(path.dirname(path.resolve(sortie)), { recursive: true });
      fs.writeFileSync(sortie, r.code);
    } else process.stdout.write(r.code);
    console.error(`${r.modules.length} modules, ${r.code.length} caractères, ${r.renommes} liaisons renommées`
      + (sortie ? `, écrits dans ${sortie}` : ''));
    for (const a of r.avertissements) console.error('avertissement : ' + a);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
