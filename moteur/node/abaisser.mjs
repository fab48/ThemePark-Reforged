// L'abaissement : ramener un script classique écrit en ES2022 à de l'ES2015 strict.
//
// Pourquoi. Le but est un unique fichier HTML qui tourne sur Chrome 49 et Firefox 52 (ES2015, pas de
// modules). L'assembleur (moteur/node/assembler.mjs) réunit déjà les modules ES en un seul script
// classique, mais il ne touche pas à la syntaxe : ses sorties échouent en ES2015 pour dix constructions
// seulement (voir travail/portable/compatibilite.md). Cette passe s'occupe de celles qui se réécrivent
// sans changer le sens ; les autres (`import.meta`, `import()`, BigInt...) sont refusées avec leur
// endroit exact. Aucune dépendance ne pouvant être téléchargée, elle n'emploie que l'analyseur (acorn
// 8.8) que Node embarque :
//     node --expose-internals moteur/node/abaisser.mjs <script.js> [--sortie f.js] [--sans-shims]
//                                                      [--tolerer bigint]
// API : `abaisser(code, options) -> { code, compte, decalageLignes, avertissements }`.
//
// Comment : la réécriture du TEXTE par positions (start/end des nœuds), comme l'assembleur, pour que le
// code reste lisible et que les lignes restent où elles sont. Chaque nœud à réécrire se refait à partir
// du texte de ses enfants (déjà réécrits) et du texte source qui les sépare ; les nœuds imbriqués se
// traitent donc naturellement (un `await` dans un spread dans un `??`...), et un nœud dont le sous-arbre
// n'a rien à réécrire est recopié tel quel. Ce qu'on ajoute ne contient jamais de saut de ligne, et
// les sauts de ligne du texte qu'on jette sont rendus : les numéros de ligne ne bougent pas, sauf pour
// le préambule (`decalageLignes` lignes ajoutées en tête, après la directive `'use strict'` s'il y en a une).
//
// Ce qui est réécrit (le `compte` en donne le nombre) :
//  - `a ** b` -> `Math.pow(a, b)` (l'associativité à droite vient de l'arbre : `a ** b ** c` devient
//    `Math.pow(a, Math.pow(b, c))`) ; deux littéraux entiers -> la constante (`2 ** 32` -> `4294967296`) ;
//    `x **= y` -> `x = Math.pow(x, y)` (cible complexe : variables temporaires, évaluée une seule fois) ;
//  - `{ ...a, b: 1, ...c }` -> `Object.assign({}, a, { b: 1 }, c)` ; refusés : accesseurs, `__proto__`,
//    clés calculées, méthodes qui emploient `super` (ils ne survivent pas à la copie par `Object.assign`) ;
//  - `catch {` -> `catch (_e) {` (un nom qui n'apparaît nulle part dans le script) ;
//  - `a ?? b` -> `(a != null ? a : b)` si `a` est un identifiant ou un accès sans effet de bord ; sinon
//    `((_v) => _v != null ? _v : b)(a)` (la fléchée garde `this` et `arguments`) ; s'il y a un `await` ou un
//    `yield` dans `b`, une variable temporaire (une fléchée n'en laisse pas passer) ;
//  - `a?.b`, `a?.[k]`, `a?.()`, `a?.b()` (`this` reste `a`), `a.b?.()` (`this` reste `a`) : une condition
//    `(a == null ? void 0 : a.b)`, avec des variables temporaires si l'objet peut avoir un effet de bord ;
//  - `async`/`await` -> générateur + le lanceur `__async` (comme TypeScript ou esbuild) : chaque `await x`
//    devient `yield x`, la fonction rend `__async(function* () { corps }, this, arguments)` (`this` et
//    `arguments` ne sont passés que si le corps s'en sert ; les fléchées gardent le `this` lexical), et le
//    lanceur enchaîne les promesses, renvoie les rejets dans le générateur (`throw`), rend une Promise ;
//  - un préambule (`options.shims`, vrai par défaut) : Object.entries/values/fromEntries,
//    Array.prototype.flat/flatMap, String.prototype.padStart/padEnd, globalThis, chacun posé seulement
//    s'il manque, en ES5 ; puis le lanceur `__async` s'il sert.
//
// Refusé avec ligne:colonne (toutes les erreurs trouvées sont rapportées d'un coup, dans `Error.problemes`) :
// `import.meta`, `import()`, BigInt (sauf `options.tolerer = ['bigint']`), champs de classe, blocs
// statiques, noms privés, `??=` `||=` `&&=`, `for await`, générateurs asynchrones, reste d'objet dans un
// motif (`{ a, ...r } = o`), `super` ou `new.target` dans une fonction async, `delete a?.b`, séparateurs
// numériques, regex récentes (drapeaux s d v, groupes nommés, lookbehind, `\p{}` avec u), virgules
// finales dans un appel ou des paramètres (Chrome 49 les refuse).
//
// La preuve de syntaxe : la sortie est RE-ANALYSÉE en `ecmaVersion: 2015` (script) ; si elle échoue, la
// passe le dit (`options.verifier = false` la supprime). Ce n'est qu'une preuve de SYNTAXE : aucun moteur
// sans ES2017 n'est installé ici pour l'exécuter (voir travail/portable/essai-abaisser.mjs et
// eprouver-abaissement.mjs pour la preuve de comportement, faite sous Node).
//
// Limites connues, par choix : un accès `a.b ?? c` ou `a?.b.c` dont l'objet est « simple » est lu deux
// fois (un accesseur à effet de bord verrait deux lectures) ; `Object.assign` écrit par affectation
// quand le spread définit (une clé « __proto__ » venue d'un objet copié changerait le prototype) ;
// `new RegExp("(?<x>...)")` construit à l'exécution n'est pas vu ; l'ordre des micro-tâches d'une
// fonction async est celui de `Promise.resolve(v).then`, identique à `await` pour les promesses natives.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

// --- l'analyseur ---------------------------------------------------------------------------------------
function chargerAcorn() {
  const require = createRequire(import.meta.url);
  for (const nom of ['internal/deps/acorn/acorn/dist/acorn', 'acorn']) {
    try { return require(nom); } catch (e) { /* suivant */ }
  }
  throw new Error("abaisser.mjs : pas d'analyseur acorn ; lancer avec `node --expose-internals` (acorn est celui de Node)");
}

// --- le préambule ---------------------------------------------------------------------------------------
// Tout est en ES5 (`var`, `function`), rien ne s'écrit sur les objets natifs sans que la fonction manque.
const SHIMS = `// Compléments d'API pour les moteurs plus anciens (ES2017 à ES2019), posés seulement s'ils manquent.
(function () {
  'use strict';
  function poser(cible, nom, valeur) {
    if (!cible[nom]) Object.defineProperty(cible, nom, { value: valeur, writable: true, configurable: true });
  }
  poser(Object, 'entries', function entries(o) {
    var k = Object.keys(o), i = k.length, r = new Array(i);
    while (i--) r[i] = [k[i], o[k[i]]];
    return r;
  });
  poser(Object, 'values', function values(o) {
    var k = Object.keys(o), i = k.length, r = new Array(i);
    while (i--) r[i] = o[k[i]];
    return r;
  });
  poser(Object, 'fromEntries', function fromEntries(iterable) {
    var o = {};
    var ajouter = function (e) { Object.defineProperty(o, e[0], { value: e[1], writable: true, enumerable: true, configurable: true }); };
    if (Array.isArray(iterable)) iterable.forEach(ajouter);
    else { var it = iterable[Symbol.iterator](), s; while (!(s = it.next()).done) ajouter(s.value); }
    return o;
  });
  poser(Array.prototype, 'flat', function flat(profondeur) {
    var r = [];
    (function ranger(a, p) {
      for (var i = 0; i < a.length; i++) {
        if (!(i in a)) continue;
        if (p > 0 && Array.isArray(a[i])) ranger(a[i], p - 1); else r.push(a[i]);
      }
    })(this, profondeur === undefined ? 1 : Math.floor(Number(profondeur)) || 0);
    return r;
  });
  poser(Array.prototype, 'flatMap', function flatMap(f, cetteFois) {
    var r = [];
    for (var i = 0; i < this.length; i++) {
      if (!(i in this)) continue;
      var v = f.call(cetteFois, this[i], i, this);
      if (Array.isArray(v)) for (var j = 0; j < v.length; j++) { if (j in v) r.push(v[j]); } else r.push(v);
    }
    return r;
  });
  function bourrage(chaine, n, remplissage, devant) {
    var s = String(chaine), f = remplissage === undefined ? ' ' : String(remplissage);
    n = Math.floor(Number(n)) || 0;
    if (n <= s.length || f === '') return s;
    var manque = n - s.length, p = '';
    while (p.length < manque) p += f;
    p = p.slice(0, manque);
    return devant ? p + s : s + p;
  }
  poser(String.prototype, 'padStart', function padStart(n, f) { return bourrage(this, n, f, true); });
  poser(String.prototype, 'padEnd', function padEnd(n, f) { return bourrage(this, n, f, false); });
})();
(function () {
  var g = typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this;
  if (typeof globalThis === 'undefined' && g) Object.defineProperty(g, 'globalThis', { value: g, writable: true, configurable: true });
})();
`;

// Le lanceur des fonctions async : `NOM(function* () { ... }, this, arguments)`.
const lanceurAsync = (nom) => `// Lanceur des fonctions async abaissées en générateurs (chaque \`await x\` y est un \`yield x\`).
function ${nom}(generateur, ceci, args) {
  return new Promise(function (resoudre, rejeter) {
    var it = generateur.apply(ceci, args);
    function pas(cle, valeur) {
      var r;
      try { r = it[cle](valeur); } catch (e) { rejeter(e); return; }
      if (r.done) resoudre(r.value); else Promise.resolve(r.value).then(suite, lancer);
    }
    function suite(v) { pas('next', v); }
    function lancer(e) { pas('throw', e); }
    pas('next');
  });
}
`;

// --- petits outils sur le texte ------------------------------------------------------------------------
const CLES_IGNOREES = new Set(['type', 'start', 'end', 'loc', 'range']);
const sauts = (s) => (s.match(/\n/g) || []).length;

// Les nœuds enfants d'un nœud, dans l'ordre du texte (mémorisés).
function enfants(n) {
  if (n.$e) return n.$e;
  const r = [];
  for (const cle of Object.keys(n)) {
    if (CLES_IGNOREES.has(cle) || cle[0] === '$') continue;
    const v = n[cle];
    if (Array.isArray(v)) { for (const e of v) if (e && typeof e.type === 'string') r.push(e); }
    else if (v && typeof v.type === 'string') r.push(v);
  }
  r.sort((a, b) => a.start - b.start || a.end - b.end);
  n.$e = r;
  return r;
}

// Y a-t-il une virgule hors commentaire dans ce texte ? (virgule finale d'un appel ou de paramètres)
function aVirgule(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('//', i)) { const f = s.indexOf('\n', i); if (f < 0) return false; i = f; }
    else if (s.startsWith('/*', i)) { const f = s.indexOf('*/', i + 2); if (f < 0) return false; i = f + 1; }
    else if (s[i] === ',') return true;
  }
  return false;
}
// Le même texte sans sa première virgule hors commentaire.
function sansPremiereVirgule(s) {
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith('//', i)) { const f = s.indexOf('\n', i); if (f < 0) return s; i = f; }
    else if (s.startsWith('/*', i)) { const f = s.indexOf('*/', i + 2); if (f < 0) return s; i = f + 1; }
    else if (s[i] === ',') return s.slice(0, i) + s.slice(i + 1);
  }
  return s;
}

// --- la passe ------------------------------------------------------------------------------------------
export function abaisser(code, options = {}) {
  const acorn = chargerAcorn();
  const nom = options.nom || 'script';
  const tolerer = new Set(options.tolerer || []);
  const problemes = [];
  const avertissements = [];
  const src = String(code).replace(/^﻿/, '');
  const lieu = (pos) => { const l = acorn.getLineInfo(src, pos); return `${nom}:${l.line}:${l.column + 1}`; };
  const signaler = (noeud, message) => problemes.push(`${lieu(noeud.start !== undefined ? noeud.start : noeud)} : ${message}`);
  const fin = () => {
    const e = new Error(`abaisser : ${problemes.length} problème(s) :\n  ${problemes.join('\n  ')}`);
    e.problemes = problemes;
    throw e;
  };

  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch (e) {
    const l = e.loc ? `${e.loc.line}:${e.loc.column + 1}` : '?';
    throw Object.assign(new Error(`abaisser : ${nom}:${l} : erreur de syntaxe : ${e.message.replace(/ \(\d+:\d+\)$/, '')}`), { problemes: [e.message] });
  }

  const identifiants = new Set();
  const compte = {
    exposant: 0, exposantConstant: 0, affectationExposant: 0, spreadObjet: 0, catchSansParametre: 0,
    coalescence: 0, chainageOptionnel: 0, async: 0, await: 0,
  };

  // --- 1. lecture : parents, drapeau « à réécrire », noms pris, constructions refusées ---
  const declencheur = (n) => {
    switch (n.type) {
      case 'BinaryExpression': return n.operator === '**';
      case 'AssignmentExpression': return n.operator === '**=';
      case 'ObjectExpression': return n.properties.some((p) => p.type === 'SpreadElement');
      case 'CatchClause': return !n.param;
      case 'LogicalExpression': return n.operator === '??';
      case 'ChainExpression': case 'AwaitExpression': return true;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': return !!n.async;
      default: return false;
    }
  };
  const verifierRegex = (n) => {
    const { pattern, flags } = n.regex;
    for (const f of flags) if (!'gimuy'.includes(f)) signaler(n, `drapeau /${f} d'expression régulière : plus récent qu'ES2015, non géré`);
    let dansClasse = false;
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === '\\') {
        if ((pattern[i + 1] === 'p' || pattern[i + 1] === 'P') && pattern[i + 2] === '{' && flags.includes('u')) signaler(n, 'propriété Unicode \\p{...} dans une expression régulière : non géré');
        i++;
      } else if (dansClasse) { if (c === ']') dansClasse = false; }
      else if (c === '[') dansClasse = true;
      else if (c === '(' && pattern[i + 1] === '?' && pattern[i + 2] === '<') signaler(n, "groupe nommé ou lookbehind d'expression régulière : non géré");
    }
  };
  const detecter = (n) => {
    switch (n.type) {
      case 'MetaProperty': if (n.meta.name === 'import') signaler(n, "`import.meta` : non géré (un script classique n'a pas d'URL de module)"); break;
      case 'ImportExpression': signaler(n, '`import()` dynamique : non géré'); break;
      case 'Literal':
        if (n.bigint !== undefined) {
          if (tolerer.has('bigint')) avertissements.push(`${lieu(n.start)} : littéral BigInt toléré (options.tolerer) : la sortie n'est pas de l'ES2015`);
          else signaler(n, `littéral BigInt (${n.raw}) : non géré ; le réécrire en Number ou en deux mots de 32 bits`);
        } else if (n.regex) verifierRegex(n);
        else if (typeof n.value === 'number' && n.raw.includes('_')) signaler(n, `séparateur numérique (${n.raw}) : non géré`);
        break;
      case 'PropertyDefinition': signaler(n, 'champ de classe : non géré'); break;
      case 'StaticBlock': signaler(n, 'bloc statique de classe : non géré'); break;
      case 'PrivateIdentifier': signaler(n, 'nom privé (#x) : non géré'); break;
      case 'AssignmentExpression': if (['??=', '||=', '&&='].includes(n.operator)) signaler(n, `\`${n.operator}\` : non géré`); break;
      case 'ForOfStatement': if (n.await) signaler(n, '`for await` : non géré'); break;
      case 'ObjectPattern': for (const p of n.properties) if (p.type === 'RestElement') signaler(p, "reste d'objet dans un motif ({ a, ...r }) : non géré"); break;
      case 'UnaryExpression': if (n.operator === 'delete' && n.argument.type === 'ChainExpression') signaler(n, '`delete a?.b` : non géré'); break;
      case 'CallExpression': case 'NewExpression':
        if (n.arguments.length && aVirgule(src.slice(n.arguments[n.arguments.length - 1].end, n.end - 1))) {
          signaler(n.arguments[n.arguments.length - 1].end, "virgule finale dans les arguments d'un appel : Chrome 49 la refuse");
        }
        break;
      default: break;
    }
    if (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression') {
      if (n.async && n.generator) signaler(n, 'générateur asynchrone : non géré');
      if (n.params.length) {
        const dernier = n.params[n.params.length - 1];
        const jusque = n.type === 'ArrowFunctionExpression' ? src.indexOf('=>', dernier.end) : n.body.start;
        if (jusque > dernier.end && aVirgule(src.slice(dernier.end, jusque))) signaler(dernier.end, 'virgule finale dans les paramètres : Chrome 49 la refuse');
      }
    }
  };
  const lire = (n, parent) => {
    n.$p = parent;
    if (n.type === 'Identifier') identifiants.add(n.name);
    detecter(n);
    let r = declencheur(n);
    for (const c of enfants(n)) { lire(c, n); if (c.$r) r = true; }
    n.$r = r;
  };
  lire(ast, null);
  if (problemes.length) fin();

  // --- 2. les noms neufs : absents de tout le script ---
  const libre = (base) => {
    let n = base;
    for (let k = 2; identifiants.has(n); k++) n = `${base}${k}`;
    identifiants.add(n);
    return n;
  };
  const nomAsync = libre('__async');
  const nomFleche = libre('_v');
  let besoinAsync = false;
  const pile = [{ vars: [] }];                     // les variables temporaires, par fonction (0 : le script)
  const temp = () => { const t = libre('_t'); pile[pile.length - 1].vars.push(t); return t; };

  // --- 3. petits prédicats ---
  const simple = (x) => {
    let ok;
    if (x.type === 'Identifier' || x.type === 'ThisExpression') ok = true;
    else if (x.type === 'Literal') ok = !x.regex;
    else if (x.type === 'MemberExpression' && !x.optional) {
      ok = simple(x.object) && (!x.computed || (x.property.type === 'Literal' && !x.property.regex) || x.property.type === 'Identifier');
    } else ok = false;
    return ok && !/[\n\r]|\/[/*]/.test(src.slice(x.start, x.end));
  };
  const accesSimple = (m) => !m.computed || m.property.type === 'Literal' || m.property.type === 'Identifier';
  const contient = (racine, types) => {                       // sans franchir une frontière de fonction
    const visiter = (x) => {
      if (types.includes(x.type)) return true;
      if (x.type === 'FunctionDeclaration' || x.type === 'FunctionExpression' || x.type === 'ArrowFunctionExpression') return false;
      return enfants(x).some(visiter);
    };
    return visiter(racine);
  };
  const contientAttente = (x) => contient(x, ['AwaitExpression', 'YieldExpression']);
  const utilise = (fn) => {                                   // ce que le corps d'une fonction async emprunte à sa fonction
    const r = { ceci: false, args: false, sup: false, cible: false };
    const visiter = (x) => {
      if (x.type === 'ThisExpression') r.ceci = true;
      else if (x.type === 'Super') r.sup = true;
      else if (x.type === 'MetaProperty' && x.meta.name === 'new') r.cible = true;
      else if (x.type === 'Identifier' && x.name === 'arguments') {
        const p = x.$p;
        if (!(p.type === 'MemberExpression' && p.property === x && !p.computed) && !(p.type === 'Property' && p.key === x && !p.computed)) r.args = true;
      }
      if (x.type === 'FunctionDeclaration' || x.type === 'FunctionExpression') return;      // les fléchées gardent this et arguments
      for (const c of enfants(x)) visiter(c);
    };
    visiter(fn.body);
    return r;
  };

  // --- 4. l'écriture du texte ---
  const apresParentheses = (pos) => {     // au-delà des blancs, commentaires et `)` qui suivent un opérande
    let p = pos;
    for (;;) {
      const c = src[p];
      if (c === ')' || c === ' ' || c === '\t' || c === '\n' || c === '\r') p++;
      else if (src.startsWith('//', p)) { const f = src.indexOf('\n', p); p = f < 0 ? src.length : f + 1; }
      else if (src.startsWith('/*', p)) p = src.indexOf('*/', p + 2) + 2;
      else return p;
    }
  };
  const trouverOperateur = (pos, op) => {
    const p = apresParentheses(pos);
    if (!src.startsWith(op, p)) throw new Error(`abaisser : opérateur ${op} introuvable près de ${lieu(pos)} : défaut de la passe`);
    return p;
  };
  const rognerFin = (s) => s.replace(/[ \t]+$/, '');
  const rognerDebut = (s) => s.replace(/^[ \t]+/, '');

  const T = (n) => {
    if (!n.$r) return src.slice(n.start, n.end);
    switch (n.type) {
      case 'Program': return programme(n);
      case 'BinaryExpression': if (n.operator === '**') return exposant(n); break;
      case 'AssignmentExpression': if (n.operator === '**=') return affectationExposant(n); break;
      case 'ObjectExpression': if (n.properties.some((p) => p.type === 'SpreadElement')) return objetSpread(n); break;
      case 'CatchClause': if (!n.param) return captureSansParametre(n); break;
      case 'LogicalExpression': if (n.operator === '??') return coalescence(n); break;
      case 'ChainExpression': return chainage(n);
      case 'AwaitExpression': return attente(n);
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': return fonction(n);
      case 'ExpressionStatement': return instruction(n);
      default: break;
    }
    return defaut(n);
  };

  const retireAsync = (n) => (n.type === 'MethodDefinition' || (n.type === 'Property' && n.method)) && n.value && n.value.async;
  // Le nœud refait de ses enfants et du texte qui les sépare.
  function defaut(n) {
    let sortie = '', curseur = n.start, premier = true;
    for (const c of enfants(n)) {
      if (c.start < curseur) continue;
      let ecart = src.slice(curseur, c.start);
      if (premier && retireAsync(n)) ecart = ecart.replace(/\basync\b[ \t]*/, '');
      premier = false;
      sortie += ecart + T(c);
      curseur = c.end;
    }
    return sortie + src.slice(curseur, n.end);
  }
  // La plage [debut, fin) d'un nœud, ses enfants qui y tiennent réécrits.
  function plage(n, debut, finPlage) {
    let sortie = '', curseur = debut;
    for (const c of enfants(n)) {
      if (c.start < curseur || c.end > finPlage) continue;
      sortie += src.slice(curseur, c.start) + T(c);
      curseur = c.end;
    }
    return sortie + src.slice(curseur, finPlage);
  }
  // Le texte d'un opérande de gauche (avec ses parenthèses) jusqu'à l'opérateur, et celui de droite après lui.
  const operandes = (n, op) => {
    const g = n.left, d = n.right;
    const pos = trouverOperateur(g.end, op);
    return {
      gauche: src.slice(n.start, g.start) + T(g) + src.slice(g.end, pos),
      droite: src.slice(pos + op.length, d.start) + T(d) + src.slice(d.end, n.end),
    };
  };
  // Le corps d'une fonction ou d'un script : les variables temporaires se déclarent en tête, après les directives.
  const avecVariables = (texte, bloc, vars, debutBloc) => {
    if (!vars.length) return texte;
    const base = debutBloc === undefined ? bloc.start : 0;          // le script : positions depuis 0
    let rel = debutBloc === undefined ? 1 : 0;
    for (const s of bloc.body) {
      if (s.type === 'ExpressionStatement' && s.directive !== undefined) rel = s.end - base; else break;
    }
    return texte.slice(0, rel) + ' var ' + vars.join(', ') + ';' + texte.slice(rel);
  };

  function programme(n) {
    let sortie = '', curseur = 0;
    for (const c of enfants(n)) { sortie += src.slice(curseur, c.start) + T(c); curseur = c.end; }
    sortie += src.slice(curseur);
    return avecVariables(sortie, n, pile[0].vars, 0);
  }

  // Une instruction-expression qui se met à commencer par `(` : `;` devant si l'instruction précédente n'est pas close.
  function instruction(n) {
    const t = defaut(n);
    if (t[0] !== '(' || src[n.start] === '(') return t;
    const p = n.$p;
    if (!p || !(p.type === 'Program' || p.type === 'BlockStatement' || p.type === 'SwitchCase' || p.type === 'StaticBlock')) return t;
    let i = n.start - 1;
    while (i >= 0 && /\s/.test(src[i])) i--;
    return i < 0 || src[i] === ';' || src[i] === '{' ? t : ';' + t;
  }

  // ** ---------------------------------------------------------------------------------------------
  function exposant(n) {
    compte.exposant++;
    if (n.left.type === 'Literal' && n.right.type === 'Literal' && typeof n.left.value === 'number' && typeof n.right.value === 'number'
        && /^\d+\s*\*\*\s*\d+$/.test(src.slice(n.start, n.end))) {
      const r = Math.pow(n.left.value, n.right.value);
      if (Number.isSafeInteger(r)) { compte.exposantConstant++; return `${r} /* ${src.slice(n.start, n.end).replace(/\s+/g, ' ')} */`; }
    }
    const { gauche, droite } = operandes(n, '**');
    return `Math.pow(${rognerFin(gauche)}, ${rognerDebut(droite)})`;
  }
  function affectationExposant(n) {
    compte.affectationExposant++;
    const g = n.left;
    const pos = trouverOperateur(g.end, '**=');
    const droite = rognerDebut(src.slice(pos + 3, n.right.start) + T(n.right) + src.slice(n.right.end, n.end));
    if (g.type === 'Identifier') return `${g.name} = Math.pow(${g.name}, ${droite})`;
    if (g.type !== 'MemberExpression') throw new Error(`abaisser : cible de ** = inattendue près de ${lieu(n.start)}`);
    if (simple(g)) { const s = src.slice(g.start, g.end); return `${s} = Math.pow(${s}, ${droite})`; }
    // objet et clé évalués une seule fois, dans l'ordre : `(o = objet)[(k = clé)] = Math.pow(o[k], droite)`
    const opM = apresParentheses(g.object.end);
    let objet = src.slice(g.start, g.object.start) + T(g.object) + src.slice(g.object.end, opM);
    let cible;
    if (simple(g.object)) { objet = src.slice(g.object.start, g.object.end); cible = objet; }
    else { const o = temp(); cible = o; objet = `(${o} = ${rognerFin(objet)})`; }
    if (!g.computed) {
      const nomP = g.property.name;
      return `${objet}.${nomP} = Math.pow(${cible}.${nomP}, ${droite})`;
    }
    if (g.property.type === 'Literal' || g.property.type === 'Identifier') { const k = src.slice(g.property.start, g.property.end); return `${objet}[${k}] = Math.pow(${cible}[${k}], ${droite})`; }
    const kt = temp();
    return `${objet}[${kt} = ${T(g.property)}] = Math.pow(${cible}[${kt}], ${droite})`;
  }

  // { ...a } ---------------------------------------------------------------------------------------
  function objetSpread(n) {
    compte.spreadObjet++;
    const props = n.properties;
    for (const p of props) {
      if (p.type === 'SpreadElement') continue;
      if (p.kind !== 'init') signaler(p, "accesseur (get/set) dans un littéral avec spread : ne survit pas à Object.assign");
      else if (p.computed) signaler(p, 'clé calculée dans un littéral avec spread : non géré');
      else if (!p.shorthand && !p.method && ((p.key.type === 'Identifier' && p.key.name === '__proto__') || (p.key.type === 'Literal' && p.key.value === '__proto__'))) signaler(p, '`__proto__:` dans un littéral avec spread : non géré');
      else if (p.method && contient(p.value.body, ['Super'])) signaler(p, '`super` dans une méthode d\'un littéral avec spread : non géré');
    }
    const debutTexte = src.slice(n.start + 1, props[0].start);
    let sortie = 'Object.assign(';
    if (props[0].type === 'SpreadElement') sortie += '{}, ' + rognerDebut(debutTexte); else sortie += '{' + debutTexte;
    let ouvert = false, espace = /\s$/.test(debutTexte);
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (i > 0) sortie += src.slice(props[i - 1].end, p.start);
      if (p.type === 'SpreadElement') {
        const a = p.argument;
        sortie += rognerDebut(src.slice(p.start + 3, a.start)) + T(a) + src.slice(a.end, p.end);
      } else {
        if (!ouvert && i > 0) { sortie += '{ '; espace = true; }
        ouvert = true;
        sortie += T(p);
        if (i === props.length - 1 || props[i + 1].type === 'SpreadElement') { sortie += espace ? ' }' : '}'; ouvert = false; }
      }
    }
    return sortie + rognerFin(sansPremiereVirgule(src.slice(props[props.length - 1].end, n.end - 1))) + ')';
  }

  // catch { -----------------------------------------------------------------------------------------
  function captureSansParametre(n) {
    compte.catchSansParametre++;
    const e = libre('_e');
    return `catch (${e})` + src.slice(n.start + 5, n.body.start) + T(n.body);
  }

  // ?? ----------------------------------------------------------------------------------------------
  function coalescence(n) {
    compte.coalescence++;
    const g = n.left;
    const { gauche, droite } = operandes(n, '??');
    if (simple(g)) {
      const s = src.slice(g.start, g.end);
      const perdus = sauts(src.slice(n.start, g.start) + src.slice(g.end, trouverOperateur(g.end, '??')));
      return `(${s} != null ? ${s} : ${rognerDebut(droite)}${'\n'.repeat(perdus)})`;
    }
    if (contientAttente(n.right)) { const t = temp(); return `((${t} = ${rognerFin(rognerDebut(gauche))}) != null ? ${t} : ${rognerDebut(droite)})`; }
    return `((${nomFleche}) => ${nomFleche} != null ? ${nomFleche} : ${rognerDebut(droite)})(${rognerFin(rognerDebut(gauche))})`;
  }

  // ?. ----------------------------------------------------------------------------------------------
  function chainage(n) {
    compte.chainageOptionnel++;
    const liens = [];
    let x = n.expression;
    while (x.type === 'MemberExpression' || x.type === 'CallExpression') { liens.unshift(x); x = x.type === 'MemberExpression' ? x.object : x.callee; }
    const base = x;
    const op0 = apresParentheses(base.end);
    const regionBase = src.slice(liens[0].start, base.start) + T(base) + src.slice(base.end, op0);
    let cur, simpleCur = simple(base), perdus = 0;
    if (simpleCur) { cur = src.slice(base.start, base.end); perdus = sauts(regionBase); } else cur = rognerFin(rognerDebut(regionBase));
    let sortie = '', objet = null;
    for (let i = 0; i < liens.length; i++) {
      const L = liens[i];
      const p = i === 0 ? op0 : apresParentheses(liens[i - 1].end);
      let sfx = plage(L, p, L.end);
      let capture = false;
      if (L.optional) {
        if (sfx.startsWith('?.')) { sfx = sfx.slice(2); if (L.type === 'MemberExpression' && !L.computed) sfx = '.' + sfx; }
        if (simpleCur) sortie += `${cur} == null ? void 0 : `;
        else { const t = temp(); sortie += `(${t} = ${cur}) == null ? void 0 : `; cur = t; capture = true; }
      }
      if (L.type === 'MemberExpression') {
        const suivant = liens[i + 1];
        if (suivant && suivant.type === 'CallExpression' && suivant.optional && suivant.callee === L) {
          if (simpleCur) objet = cur; else { const o = temp(); objet = o; cur = `(${o} = ${cur})`; }
        }
        cur += sfx;
        simpleCur = simpleCur && accesSimple(L);
      } else if (L.optional && capture && objet !== null && liens[i - 1] && liens[i - 1].type === 'MemberExpression') {
        const interieur = sfx.slice(1, -1);
        cur = `${cur}.call(${objet}${interieur.trim() ? ', ' + rognerDebut(interieur) : ''})`;
        simpleCur = false;
      } else { cur += sfx; simpleCur = false; }
    }
    return `(${sortie}${cur}${'\n'.repeat(perdus)})`;
  }

  // await -------------------------------------------------------------------------------------------
  const contexteSur = (n) => {              // `yield x` sans parenthèses n'y change pas de sens
    const p = n.$p;
    if (!p) return true;
    switch (p.type) {
      case 'ExpressionStatement': case 'ReturnStatement': case 'ThrowStatement': case 'ArrayExpression': case 'SpreadElement':
      case 'TemplateLiteral': case 'SequenceExpression': case 'AwaitExpression': case 'IfStatement': case 'WhileStatement':
      case 'DoWhileStatement': case 'SwitchStatement': case 'ForStatement': return true;
      case 'VariableDeclarator': return p.init === n;
      case 'AssignmentExpression': return p.right === n;
      case 'CallExpression': case 'NewExpression': return p.callee !== n;
      case 'Property': return p.value === n;
      case 'ConditionalExpression': return p.test !== n;
      case 'ArrowFunctionExpression': return p.body === n;
      case 'ForOfStatement': case 'ForInStatement': return p.right === n;
      default: return false;
    }
  };
  function attente(n) {
    compte.await++;
    const a = n.argument;
    const ecart = src.slice(n.start + 5, a.start);
    const operande = ecart + T(a) + src.slice(a.end, n.end);
    // (`yield` ne prend pas d'opérande sur la ligne suivante)
    const texte = /[\n\r]/.test(ecart) ? `yield (${operande})` : `yield${operande}`;
    let av = n.start - 1, ap = n.end;
    while (av >= 0 && /[ \t]/.test(src[av])) av--;
    while (ap < src.length && /[ \t]/.test(src[ap])) ap++;
    const dansParentheses = src[av] === '(' && src[ap] === ')';
    return dansParentheses || contexteSur(n) ? texte : `(${texte})`;
  }

  // fonctions (async, et celles qui portent des variables temporaires) -------------------------------
  function fonction(n) {
    const parent = n.$p;
    const methode = n.type === 'FunctionExpression' && parent
      && ((parent.type === 'MethodDefinition' && parent.value === n) || (parent.type === 'Property' && parent.value === n && (parent.method || parent.kind !== 'init')));
    const fleche = n.type === 'ArrowFunctionExpression';
    const expr = fleche && n.body.type !== 'BlockStatement';
    let debut = n.start;
    if (n.async && !methode) {
      if (!src.startsWith('async', n.start)) throw new Error(`abaisser : « async » attendu à ${lieu(n.start)} : défaut de la passe`);
      debut += 5;
      while (src[debut] === ' ' || src[debut] === '\t') debut++;
    }
    let finTete;
    if (expr) {
      const depuis = n.params.length ? n.params[n.params.length - 1].end : debut;
      finTete = src.indexOf('=>', depuis) + 2;
    } else finTete = n.body.start;
    const tete = plage(n, debut, finTete);                      // paramètres compris : variables temporaires de l'extérieur
    const ctx = { vars: [] };
    pile.push(ctx);
    let sortie;
    if (!n.async) {
      if (!expr) sortie = tete + avecVariables(T(n.body), n.body, ctx.vars);
      else {
        const region = plage(n, finTete, n.end);
        sortie = ctx.vars.length ? `${tete} { var ${ctx.vars.join(', ')}; return (${region}); }` : tete + region;
      }
    } else {
      compte.async++;
      besoinAsync = true;
      const u = utilise(n);
      if (u.sup) signaler(n, '`super` dans une fonction async : non géré');
      if (u.cible) signaler(n, '`new.target` dans une fonction async : non géré');
      const extra = u.args ? ', this, arguments' : u.ceci ? ', this' : '';
      if (!expr) {
        const interieur = avecVariables(T(n.body), n.body, ctx.vars);
        sortie = fleche ? `${tete}${nomAsync}(function* () ${interieur}${extra})`
          : `${tete}{ return ${nomAsync}(function* () ${interieur}${extra}); }`;
      } else {
        const region = plage(n, finTete, n.end);
        sortie = `${tete} ${nomAsync}(function* () { ${ctx.vars.length ? `var ${ctx.vars.join(', ')}; ` : ''}return (${region}); }${extra})`;
      }
    }
    pile.pop();
    return sortie;
  }

  // --- 5. exécution ---
  let corps = T(ast);
  if (problemes.length) fin();

  // le préambule, après la directive du script s'il y en a une
  const preambule = (options.shims === false ? '' : SHIMS) + (besoinAsync ? lanceurAsync(nomAsync) : '');
  let decalageLignes = 0;
  if (preambule) {
    let pos = 0;
    for (const s of ast.body) { if (s.type === 'ExpressionStatement' && s.directive !== undefined) pos = s.end; else break; }
    // (les positions de `ast` sont celles de `src` ; `corps` n'a bougé avant la directive que si elle a été réécrite : jamais)
    const bloc = (pos ? '\n' : '') + preambule;
    decalageLignes = sauts(bloc);
    corps = corps.slice(0, pos) + bloc + corps.slice(pos);
  }

  // --- 6. la preuve de syntaxe : ES2015 ---
  let verifie = false;
  if (options.verifier !== false) {
    let essai = corps;
    if (tolerer.has('bigint')) essai = essai.replace(/\b(\d+)n\b/g, (m) => '0'.padEnd(m.length, ' '));
    try {
      acorn.parse(essai, { ecmaVersion: 2015, sourceType: 'script' });
      verifie = true;
    } catch (e) {
      const ligne = e.loc ? corps.split('\n')[e.loc.line - 1] : '';
      const err = new Error(`abaisser : la sortie n'est pas de l'ES2015 (${e.message}) à la ligne ${e.loc ? e.loc.line : '?'} de la sortie :\n  ${ligne.slice(0, 200)}`);
      err.problemes = [e.message];
      throw err;
    }
  }
  const total = Object.values(compte).reduce((s, v) => s + v, 0) - compte.exposantConstant;
  return { code: corps, compte: Object.assign({}, compte, { total }), decalageLignes, avertissements, verifie };
}

// --- ligne de commande ---------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const valeur = (n) => { const k = args.indexOf(n); return k >= 0 ? args[k + 1] : null; };
  const avecValeur = new Set(['--sortie', '--tolerer']);
  const entree = args.find((a, k) => !a.startsWith('--') && !avecValeur.has(args[k - 1]));
  if (!entree) {
    console.error('usage : node --expose-internals moteur/node/abaisser.mjs <script.js> [--sortie f.js] [--sans-shims] [--tolerer bigint]');
    process.exit(2);
  }
  try {
    const t0 = Date.now();
    const r = abaisser(fs.readFileSync(entree, 'utf8'), {
      nom: path.basename(entree), shims: !args.includes('--sans-shims'), tolerer: valeur('--tolerer') ? valeur('--tolerer').split(',') : [],
    });
    const sortie = valeur('--sortie');
    if (sortie) {
      fs.mkdirSync(path.dirname(path.resolve(sortie)), { recursive: true });
      fs.writeFileSync(sortie, r.code);
    } else process.stdout.write(r.code);
    console.error(`${r.code.length} caractères en ${Date.now() - t0} ms, ${r.compte.total} réécritures : `
      + Object.entries(r.compte).filter(([k, v]) => v && k !== 'total').map(([k, v]) => `${k} ${v}`).join(', ')
      + `, préambule +${r.decalageLignes} lignes, ES2015 ${r.verifie ? 'vérifié' : 'non vérifié'}` + (sortie ? `, écrit dans ${sortie}` : ''));
    for (const a of r.avertissements) console.error('avertissement : ' + a);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
