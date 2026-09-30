// Les films en mp4 (assets/films/, faits par moteur/node/extraire-films.mjs), joués par la page à la
// place des films du jeu : l'introduction, avant le jeu ; le film d'une attraction (la loupe de sa
// fiche) et celui de la partie gagnée, quand le jeu les demande (le travailleur remplace alors la
// routine du jeu, 0x5C04F, par une attente : moteur/web/travailleur.js). Le mp4 est ce que le jeu
// montrait — image par image, avec son script sonore —, en 640x400, deux fois le 320x200 du film.
//
// La vidéo couvre l'image du jeu, comme le film couvrait l'écran ; un clic ou une touche la passe,
// comme dans le jeu (et arrête un film que le jeu rejouait en boucle). À la fin, `surFin` : la page
// prévient le travailleur.
//
// Le son. Un navigateur refuse de jouer une vidéo avec son avant un geste du joueur (Chrome, Firefox :
// `play()` rejette la promesse, NotAllowedError) ; l'introduction démarre au chargement, sans geste.
// Le film ne part pas alors muet, ce que le joueur prenait pour une panne : la page essaie d'abord
// avec le son, et c'est le refus du navigateur qui fait montrer une invite, « Cliquer pour commencer »,
// par-dessus l'image ; le film part au clic ou à la touche, avec son son. Le geste qui le lance ne le
// passe pas : le clic est mangé par l'invite, et la répétition de la touche est ignorée. Si le son de
// la page est coupé, il n'y a pas d'invite : le film part muet tout de suite.

let courant = null;

export const filmEnCours = () => courant !== null;
export function passerLeFilm() { if (courant) courant.finir(); }
// Le clic du joueur sur l'image : il lance le film qui attend son geste (l'invite), sinon il le passe.
export function toucherLeFilm() { if (courant) courant.toucher(); }

// { fichier (chemin dans les assets), boucle } ; url(fichier) : l'adresse du mp4 (servi avec la page, ou
// à côté de la distribution : environnement.js, environnement-distribution.js) ; canvas : l'image
// du jeu ; rectangle() : où est l'image du jeu à l'écran (affichage.rectangleImage) ; muet : le son de
// la page est coupé ; surGeste() : le joueur a fait le geste qui lance le film (la page y active le
// son : la touche, arrêtée ici, ne lui parviendrait pas) ; surFin() : à la fin.
export function jouerLeFilm({ fichier, boucle = false }, { url, canvas, rectangle = null, muet, surGeste = null, surFin }) {
  passerLeFilm();
  const video = document.createElement('video');
  video.className = 'film';
  video.loop = boucle;                   // (rejoué jusqu'à un clic ou une touche, comme dans le jeu)
  let adresse;
  try { adresse = url(fichier); } catch (err) { console.warn(`film introuvable : ${fichier}`, err); }
  if (!adresse) { surFin(); return; }
  video.src = adresse;
  video.playsInline = true;
  video.preload = 'auto';
  video.muted = muet;
  video.tabIndex = -1;
  // Sur l'image du jeu ; avant la première image (l'introduction, au chargement), le plus grand 4/3
  // de la zone, comme l'écran du jeu.
  const placer = () => {
    const zone = canvas.parentElement.getBoundingClientRect();
    let r = canvas.style.width && rectangle ? rectangle() : null;
    if (!r || r.width < 2 || r.height < 2) {
      const k = Math.min(zone.width / 4, zone.height / 3);
      r = { left: zone.left + (zone.width - 4 * k) / 2, top: zone.top + (zone.height - 3 * k) / 2, width: 4 * k, height: 3 * k };
    }
    for (const el of [video, invite]) {
      if (!el) continue;
      el.style.left = `${r.left - zone.left}px`;
      el.style.top = `${r.top - zone.top}px`;
      el.style.width = `${r.width}px`;
      el.style.height = `${r.height}px`;
    }
  };
  let invite = null;                     // l'invite, tant que le film attend le geste du joueur
  placer();
  // Le geste du joueur : le film part, avec le son ; le geste ne le passe pas.
  const commencer = () => {
    if (!invite) return;
    invite.remove();
    invite = null;
    if (surGeste) surGeste();
    const p = video.play();
    // (refusé encore, malgré le geste : muet plutôt que rien)
    if (p && p.catch) p.catch(() => { video.muted = true; return video.play(); }).catch(finir);
  };
  const surTouche = (e) => {
    e.stopPropagation(); e.preventDefault();
    if (e.repeat) return;                // (la touche qui a lancé le film, tenue, ne le passe pas)
    if (invite) { if (!TOUCHES_SANS_GESTE.has(e.key)) commencer(); } else finir();
  };
  let fini = false;
  const finir = () => {
    if (fini) return;
    fini = true;
    window.removeEventListener('keydown', surTouche, true);
    window.removeEventListener('resize', placer);
    if (invite) invite.remove();
    invite = null;
    video.pause();
    video.remove();
    courant = null;
    surFin();
  };
  courant = { finir, toucher: () => (invite ? commencer() : finir()) };
  video.addEventListener('ended', finir);
  video.addEventListener('error', () => { console.warn(`film illisible : ${fichier}`); finir(); });
  video.addEventListener('mousedown', (e) => { e.preventDefault(); if (!invite) finir(); });
  window.addEventListener('keydown', surTouche, true);
  window.addEventListener('resize', placer);
  canvas.parentElement.appendChild(video);
  const p = video.play();
  // (Chrome 49 et Firefox 52 : play() ne rend rien, et ne refusent rien.)
  if (p && p.catch) {
    p.catch((err) => {
      if (fini) return null;
      // Muet, ou refus pour une autre raison que le geste : le film part tel quel, ou s'arrête.
      if (muet || !err || err.name !== 'NotAllowedError') throw err;
      invite = document.createElement('div');
      invite.className = 'invite-film';
      const titre = document.createElement('span');
      titre.textContent = 'Cliquer pour commencer';
      const aide = document.createElement('small');
      aide.textContent = 'ou une touche';
      invite.append(titre, aide);
      // Le clic est pour l'invite : ni le film ni le jeu (fenêtre, canvas) ne le reçoivent.
      const surClic = (e) => { e.preventDefault(); e.stopPropagation(); commencer(); };
      invite.addEventListener('mousedown', surClic);
      invite.addEventListener('touchstart', surClic);
      canvas.parentElement.appendChild(invite);
      placer();
      return null;
    }).catch(finir);
  }
}
const TOUCHES_SANS_GESTE = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock', 'Escape', 'Dead', 'Unidentified']);
