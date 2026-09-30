#!/bin/sh
# Theme Park : servir ce dossier sur http://localhost:8123/ et ouvrir le navigateur (macOS, Linux).
# Il faut python3 (present sur macOS et sur la plupart des Linux). Ctrl-C arrete le jeu.
# La distribution (theme-park.html ici) ; sinon le depot (la page dans moteur/web/, qui pose elle-meme
# l'isolation d'origine par son service worker, moteur/web/isolation.js).
cd "$(dirname "$0")" || exit 1
PAGE=/theme-park.html
[ -f theme-park.html ] || PAGE=/moteur/web/index.html
( sleep 1; if command -v xdg-open >/dev/null 2>&1; then xdg-open "http://localhost:8123$PAGE"; else open "http://localhost:8123$PAGE"; fi ) &
exec python3 -m http.server 8123 --bind 127.0.0.1
