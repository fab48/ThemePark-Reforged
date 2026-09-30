// Le service worker de l'isolation d'origine, pour la page du dépôt (moteur/web/index.html) servie par un
// serveur qui ne pose pas les en-têtes COOP et COEP (theme-park.sh, python -m http.server). La
// distribution (moteur/node/construire-distribution.mjs) n'en a pas besoin : son moteur tourne dans le
// fil de la page.
//
// Le jeu partage sa mémoire d'image et d'entrées avec la page (SharedArrayBuffer), ce que le
// navigateur ne permet qu'à une page isolée : servie avec les en-têtes COOP (same-origin) et COEP
// (require-corp). Le serveur local les pose lui-même ; un hébergement statique (GitHub Pages, un
// dossier servi tel quel) ne le peut pas. Ce service worker les ajoute à chaque réponse ; la page
// l'installe au premier passage et se recharge une fois qu'il la contrôle (index.html).
//
// Il fait aussi revalider par le serveur chaque fichier du site (le cache « no-cache » : une réponse
// 304, sans le contenu, quand rien n'a changé). Un hébergement qui ne dit rien du cache
// (python -m http.server) laisse le navigateur garder des heures durant les fichiers d'une version
// précédente, pris au hasard de leur âge : après une mise à jour du site, une page neuve importait un
// module ancien, et ne démarrait plus.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

function revalidee(demande) {
  if (demande.method !== 'GET' || demande.cache !== 'default' || new URL(demande.url).origin !== self.location.origin) return demande;
  // (une navigation ne se recopie pas avec d'autres options : on en refait une demande, dont les
  // redirections restent au navigateur)
  if (demande.mode === 'navigate') return new Request(demande.url, { cache: 'no-cache', redirect: 'manual', credentials: 'same-origin' });
  return new Request(demande, { cache: 'no-cache' });
}

self.addEventListener('fetch', (e) => {
  const demande = e.request;
  if (demande.cache === 'only-if-cached' && demande.mode !== 'same-origin') return;
  e.respondWith(fetch(revalidee(demande)).then((reponse) => {
    if (reponse.status === 0) return reponse;
    const entetes = new Headers(reponse.headers);
    entetes.set('Cross-Origin-Embedder-Policy', 'require-corp');
    entetes.set('Cross-Origin-Opener-Policy', 'same-origin');
    entetes.set('Cross-Origin-Resource-Policy', 'same-origin');
    return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
  }));
});
