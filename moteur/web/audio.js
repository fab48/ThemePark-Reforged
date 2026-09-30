// Le son de la page : les fichiers que le jeu demande, joués par le navigateur.
//
// Le moteur ne produit plus d'échantillons pour la page : son hôte (moteur/hote/son.js, `evenements`)
// dit ce que le jeu demande — tel bruitage commence, change de volume, s'arrête ; tel morceau commence,
// reprend, finit, s'arrête ; le volume et le tempo de la musique —, daté en temps virtuel, et le
// moteur y joint le fichier à jouer (fichiers-des-sons.js : l'original, ou ce qu'un moddeur a mis à
// sa place). Ici, on les joue :
//
//  - LES BRUITAGES. Servie (http:), par Web Audio : chaque fichier est lu une fois (fetch) et décodé
//    (decodeAudioData, n'importe quel format que le navigateur lit : wav, mp3, ogg...), puis chaque
//    départ est une source qui part à son heure (`start(quand)`), avec son volume, en boucle si le jeu
//    le boucle, jusqu'à ce qu'il l'arrête. Ouverte d'un double-clic (file:), la page ne peut rien lire
//    d'un fichier voisin (fetch est refusé, et un élément audio branché sur Web Audio n'y rendrait
//    que du silence) : chaque départ est alors un élément <audio> (une réserve par fichier, réutilisée),
//    dont le volume est celui de l'élément. Ce que file: perd : l'heure exacte des départs (un élément
//    part quand il peut, quelques millisecondes plus tard), le panoramique, et le fondu court d'un
//    arrêt ; le son reste le même. La polyphonie est celle du pilote de 1994 : le jeu a 32
//    descripteurs d'échantillon, l'hôte annonce chacun ; la page en tient 48 au plus (un son remplacé
//    peut durer plus que son original), le plus ancien cédant sa place.
//  - LA MUSIQUE. Toujours un élément <audio> (servie comme en double-clic) : il lit le mp3 en continu,
//    sans le décoder d'avance, et garde la hauteur des notes quand le tempo change (le jeu accélère la
//    musique des attractions : 0x80E40, playbackRate avec preservesPitch). Le morceau que le jeu
//    relance quand il finit (0x801A0 : la musique du parc boucle ainsi) repart du début ; la fin de
//    l'ancien s'éteint en 1,5 s (le mp3 porte la fin des notes). Un morceau arrêté s'éteint en 0,25 s.
//    Le volume est celui des options du jeu ([ et ] dans le parc : le volume général de SOS, 0 à 127),
//    fois le niveau d'origine du morceau (fichiers-des-sons.js, `niveau` : les mp3 sont tous ramenés à
//    −1 dB, la puce jouait HRTBEAT 18 dB plus bas que RIDE4).
//
// L'heure. Le moteur produit par bouffées (une image, des tics) : chaque événement garde son écart
// aux autres, décalé d'une petite avance (AVANCE) ; si le jeu prend du retard ou de l'avance sur la
// page (plus de DERIVE), l'ancre est reprise (`bilan.sauts`).
//
// Le navigateur n'autorise le son qu'après un geste : `activer` est appelé au premier clic ou à la
// première touche (principal.js). D'ici là, les bruitages sont perdus, et le morceau en cours attend :
// il part à l'activation.

export const GAIN_BRUITAGES = 0.6;   // l'équilibre de son.js (gainEffets et gainMusique) : les bruitages
export const GAIN_MUSIQUE = 1.0;     // sous la musique, rendue au niveau de la puce (`niveau`, plus bas)
const AVANCE = 0.06;                 // s : l'avance gardée sur l'heure des événements
const DERIVE = 0.25;                 // s : au-delà, l'ancre est reprise
const VOIX_MAX = 48;

// options : adresse(chemin d'asset) → l'URL du fichier (ou une promesse d'URL : les assets dans l'OPFS
// du navigateur) ; parElements : les bruitages par éléments <audio> même servie (pour l'éprouver :
// `?force=elements`).
export function lecteurDuSon(options = {}) {
  const adresse = options.adresse || ((c) => c);
  let parElements = !!options.parElements || location.protocol === 'file:' || typeof fetch !== 'function';
  let contexte = null, maitre = null, actif = false, volumePage = 1, ancre = null;
  const bilan = { manques: 0, sauts: 0 };
  const compteurs = { evenements: 0, bruitages: 0, perdus: 0, remplaces: 0, musiques: 0, arrets: 0 };
  const journal = [];                  // les derniers événements joués (pour la console : sonDeLaPage.etat())
  const noter = (e, detail) => { journal.push(`${e.t.toFixed(2)} ${e.genre} ${e.action} ${e.nom || e.id || e.morceau || ''} ${detail || ''}`.trim()); if (journal.length > 60) journal.shift(); };

  const maintenant = () => (contexte ? contexte.currentTime : performance.now() / 1000);
  // L'heure (horloge de la page) d'un événement daté `t` (temps virtuel du jeu).
  function quand(t) {
    const cible = maintenant() + AVANCE;
    if (ancre === null || Math.abs(ancre + t - cible) > DERIVE) {
      if (ancre !== null) bilan.sauts++;
      ancre = cible - t;
    }
    return Math.max(maintenant(), ancre + t);
  }
  const plusTard = (heure, f) => {
    const ms = (heure - maintenant()) * 1000;
    if (ms > 4) setTimeout(f, ms); else f();
  };
  const borner = (v) => Math.max(0, Math.min(1, v));
  const url = (chemin) => Promise.resolve(adresse(chemin));

  // --- les bruitages, par Web Audio -----------------------------------------------------------------
  const tampons = new Map();           // chemin -> promesse d'AudioBuffer (null : illisible)
  function tampon(chemin) {
    if (!tampons.has(chemin)) {
      tampons.set(chemin, url(chemin).then((u) => fetch(u)).then((r) => {
        if (!r.ok) throw new Error(`erreur ${r.status}`);
        return r.arrayBuffer();
      }).then((octets) => new Promise((ok, ko) => {
        // (la forme à fonctions de rappel : decodeAudioData ne rend une promesse que depuis Chrome 49)
        const p = contexte.decodeAudioData(octets, ok, ko);
        if (p && p.catch) p.catch(ko);
      })).catch((err) => {
        console.warn(`son illisible : ${chemin} (${err && err.message ? err.message : err})`);
        bilan.manques++;
        return null;
      }));
    }
    return tampons.get(chemin);
  }

  const voix = new Map();              // id -> { arreter(heure), volume(v, heure), fini }
  function place() {
    while (voix.size >= VOIX_MAX) {
      const [id, v] = voix.entries().next().value;
      v.arreter(maintenant());
      voix.delete(id);
    }
  }

  function bruitageParWebAudio(e, heure) {
    const v = { fini: false, source: null, gain: null, arretDemande: null, volumeDemande: null };
    v.arreter = (h) => {
      if (v.source) {
        const g = v.gain.gain;
        // (un fondu de 5 ms : un arrêt net claque)
        try { g.setValueAtTime(g.value, h); g.linearRampToValueAtTime(0, h + 0.005); v.source.stop(h + 0.006); } catch (err) { /* déjà fini */ }
      } else v.arretDemande = h;
    };
    v.volume = (x, h) => {
      if (v.gain) v.gain.gain.setTargetAtTime(x * GAIN_BRUITAGES, h, 0.01);
      else v.volumeDemande = x;
    };
    voix.set(e.id, v);
    const essayer = (chemin, secours) => tampon(chemin).then((b) => {
      if (!b) { if (secours && secours !== chemin) return essayer(secours, null); return; }
      if (v.fini || (v.arretDemande !== null && v.arretDemande <= heure)) { voix.delete(e.id); return; }
      const s = contexte.createBufferSource();
      s.buffer = b;
      s.loop = !!e.boucle;
      if (e.cadence) s.playbackRate.value = e.cadence;
      const g = contexte.createGain();
      g.gain.value = (v.volumeDemande !== null ? v.volumeDemande : e.volume) * GAIN_BRUITAGES;
      s.connect(g);
      let sortie = g;
      if (typeof e.panoramique === 'number' && e.panoramique && contexte.createStereoPanner) {
        const p = contexte.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, e.panoramique));
        g.connect(p); sortie = p;
      }
      sortie.connect(maitre);
      // (le premier départ d'un fichier attend sa lecture : il part en retard plutôt que pas du tout)
      s.start(Math.max(heure, maintenant()));
      v.source = s; v.gain = g;
      s.onended = () => { v.fini = true; if (voix.get(e.id) === v) voix.delete(e.id); };
      if (v.arretDemande !== null) v.arreter(v.arretDemande);
    });
    essayer(e.fichier, e.defaut);
  }

  // --- les bruitages, par éléments <audio> (file:) ---------------------------------------------------
  const reserve = new Map();           // chemin -> éléments libres
  function bruitageParElement(e, heure) {
    const v = { fini: false, element: null, chemin: null };
    const liberer = () => {
      if (v.fini) return;
      v.fini = true;
      if (voix.get(e.id) === v) voix.delete(e.id);
      if (v.element) {
        v.element.pause();
        const libres = reserve.get(v.chemin) || [];
        if (libres.length < 8) { libres.push(v.element); reserve.set(v.chemin, libres); }
      }
    };
    v.arreter = (h) => plusTard(h, liberer);
    v.volume = (x) => { if (v.element) v.element.volume = borner(x * GAIN_BRUITAGES * volumePage); v.volumeJeu = x; };
    v.volumeJeu = e.volume;
    voix.set(e.id, v);
    const essayer = (chemin, secours) => {
      const libres = reserve.get(chemin);
      const reprendre = libres && libres.length ? libres.pop() : null;
      (reprendre ? Promise.resolve(reprendre) : url(chemin).then((u) => { const a = new Audio(); a.preload = 'auto'; a.src = u; return a; })).then((a) => {
        if (v.fini) return;
        v.element = a; v.chemin = chemin;
        a.loop = !!e.boucle;
        a.volume = borner(v.volumeJeu * GAIN_BRUITAGES * volumePage);
        if (e.cadence) { a.playbackRate = e.cadence; a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false; }
        a.onended = () => { if (!a.loop) liberer(); };
        const echec = (err) => {
          if (v.fini) return;
          if (secours && secours !== chemin) { v.element = null; essayer(secours, null); return; }
          console.warn(`son illisible : ${chemin} (${err && err.message ? err.message : err})`);
          bilan.manques++;
          liberer();
        };
        a.onerror = () => echec(a.error);
        plusTard(heure, () => {
          if (v.fini) return;
          try { a.currentTime = 0; } catch (err) { /* pas encore chargé : il part du début */ }
          const p = a.play();
          if (p && p.catch) p.catch((err) => { if (err && err.name === 'NotAllowedError') liberer(); else echec(err); });
        });
      });
    };
    essayer(e.fichier, e.defaut);
  }

  // --- la musique ----------------------------------------------------------------------------------
  let musique = null;                  // { morceau, nom, fichier, defaut, niveau, element, fini }
  let volumeJeu = 1, tempo = 100;
  const volumeDeLaMusique = () => borner(volumePage * GAIN_MUSIQUE * volumeJeu * (musique ? musique.niveau : 1));
  const vitesse = () => Math.max(0.5, Math.min(2, tempo / 100));
  // Éteindre un élément en `duree` secondes, puis le rendre.
  function estomper(a, duree) {
    if (!a) return;
    const depart = a.volume, pas = 50, n = Math.max(1, Math.round(duree * 1000 / pas));
    let k = 0;
    const minuteur = setInterval(() => {
      k++;
      a.volume = borner(depart * (1 - k / n));
      if (k >= n) { clearInterval(minuteur); a.pause(); a.removeAttribute('src'); try { a.load(); } catch (err) { /* rien */ } }
    }, pas);
  }
  function demarrerLaMusique(m, heure) {
    const essayer = (chemin, secours) => url(chemin).then((u) => {
      if (musique !== m) return;
      const a = new Audio();
      a.preload = 'auto';
      a.src = u;
      a.volume = volumeDeLaMusique();
      a.defaultPlaybackRate = vitesse(); a.playbackRate = vitesse();   // (le premier : gardé au chargement)
      a.preservesPitch = true; a.mozPreservesPitch = true; a.webkitPreservesPitch = true;
      m.element = a;
      a.onerror = () => {
        if (m.element !== a) return;
        if (secours && secours !== chemin) {
          if (typeof m.niveauDuDefaut === 'number') m.niveau = m.niveauDuDefaut;
          essayer(secours, null);
          return;
        }
        console.warn(`musique illisible : ${chemin}`);
        bilan.manques++;
      };
      plusTard(heure, () => {
        if (musique !== m || m.element !== a) return;
        const p = a.play();
        if (p && p.catch) p.catch((err) => { if (err && err.name !== 'NotAllowedError' && err.name !== 'AbortError') a.onerror(); });
      });
    });
    essayer(m.fichier, m.defaut);
  }

  function evenementDeMusique(e) {
    const heure = quand(e.t);
    if (e.action === 'volume') {
      volumeJeu = e.volume;
      plusTard(heure, () => { if (musique && musique.element) musique.element.volume = volumeDeLaMusique(); });
    } else if (e.action === 'tempo') {
      tempo = e.tempo;
      plusTard(heure, () => { if (musique && musique.element) musique.element.playbackRate = vitesse(); });
    } else if (e.action === 'jouer') {
      if (typeof e.volume === 'number') volumeJeu = e.volume;
      if (typeof e.tempo === 'number') tempo = e.tempo;
      const ancienne = musique;
      musique = { morceau: e.morceau, nom: e.nom, fichier: e.fichier, defaut: e.defaut, element: null, fini: false,
        niveau: typeof e.niveau === 'number' ? e.niveau : 1, niveauDuDefaut: e.niveauDuDefaut };
      compteurs.musiques++;
      if (e.fichier !== e.defaut) compteurs.remplaces++;
      noter(e, e.fichier);
      if (ancienne && ancienne.element) {
        const el = ancienne.element;
        plusTard(heure, () => estomper(el, ancienne.morceau === e.morceau ? 1.5 : 0.25));
      }
      if (actif && e.fichier) demarrerLaMusique(musique, heure);
    } else if (e.action === 'fini') {
      if (musique && musique.morceau === e.morceau) musique.fini = true;
    } else if (e.action === 'arreter') {
      if (musique && musique.morceau === e.morceau) {
        const m = musique;
        musique = null;
        noter(e);
        plusTard(heure, () => estomper(m.element, 0.25));
      }
    }
  }

  function evenementDeBruitage(e) {
    if (e.action === 'jouer') {
      if (!actif || !e.fichier) { compteurs.perdus++; return; }
      const heure = quand(e.t);
      place();
      compteurs.bruitages++;
      if (e.fichier !== e.defaut) compteurs.remplaces++;
      noter(e, e.fichier);
      if (parElements) bruitageParElement(e, heure); else bruitageParWebAudio(e, heure);
      return;
    }
    const v = voix.get(e.id);
    if (!v) return;
    const heure = quand(e.t);
    if (e.action === 'volume') v.volume(e.volume, heure);
    else if (e.action === 'arreter') { compteurs.arrets++; v.arreter(heure); voix.delete(e.id); }
  }

  return {
    // Les événements du moteur (moteur-du-jeu.js : message `son`).
    recevoir(liste) {
      for (const e of liste) {
        compteurs.evenements++;
        try {
          if (e.genre === 'musique') evenementDeMusique(e); else evenementDeBruitage(e);
        } catch (err) { console.error('son :', err); }
      }
    },
    async activer() {
      if (actif) { if (contexte && contexte.state !== 'running') await contexte.resume(); return; }
      if (!parElements) {
        const Contexte = window.AudioContext || window.webkitAudioContext;
        if (Contexte) {
          contexte = new Contexte();
          maitre = contexte.createGain();
          maitre.gain.value = volumePage;
          maitre.connect(contexte.destination);
          if (contexte.state !== 'running') await contexte.resume();
        } else parElements = true;         // (sans Web Audio : les éléments, partout)
      }
      actif = true;
      ancre = null;
      // (le morceau que le jeu joue déjà : il part maintenant, du début)
      if (musique && !musique.element && !musique.fini && musique.fichier) demarrerLaMusique(musique, maintenant());
    },
    // Le volume de la page (0 : coupé, ou pendant un film), de 0 à 1.
    volume(v) {
      volumePage = v;
      if (maitre) maitre.gain.setTargetAtTime(v, contexte.currentTime, 0.02);
      if (musique && musique.element) musique.element.volume = volumeDeLaMusique();
      if (parElements) for (const x of voix.values()) if (x.element) x.element.volume = borner(x.volumeJeu * GAIN_BRUITAGES * volumePage);
    },
    get actif() { return actif && (!contexte || contexte.state === 'running'); },
    get facon() { return parElements ? 'éléments audio' : 'Web Audio'; },
    get bilan() { return bilan; },
    retard() { return Math.round(AVANCE * 1000); },
    // Pour les essais (la console : sonDeLaPage.etat()).
    etat() {
      return {
        actif, facon: parElements ? 'éléments audio' : 'Web Audio', volumePage,
        musique: musique ? { nom: musique.nom, fichier: musique.fichier, fini: musique.fini,
          joue: !!(musique.element && !musique.element.paused), volume: musique.element ? musique.element.volume : null,
          vitesse: musique.element ? musique.element.playbackRate : null,
          position: musique.element ? Math.round(musique.element.currentTime * 100) / 100 : null } : null,
        volumeDeLaMusique: volumeJeu, tempo, voix: voix.size, compteurs: Object.assign({}, compteurs), bilan: Object.assign({}, bilan),
        journal: journal.slice(),
      };
    },
  };
}

// L'adresse du fichier d'un son (chemin d'asset) : `urlDUnAsset` (environnement.js : servi avec la page,
// ou à côté de la distribution) ; pour des assets extraits du CD dans le navigateur (l'OPFS :
// extraction.js), une adresse blob: du fichier, faite une fois.
export function adresseDesSons(paquet, urlDUnAsset) {
  if (!paquet || paquet.genre !== 'opfs') return urlDUnAsset;
  const adresses = new Map();
  return (chemin) => {
    if (!adresses.has(chemin)) {
      adresses.set(chemin, navigator.storage.getDirectory().then(async (racine) => {
        const parties = (paquet.dossier || 'assets').split('/').concat(chemin.split('/'));
        let d = racine;
        for (const p of parties.slice(0, -1)) d = await d.getDirectoryHandle(p);
        return URL.createObjectURL(await (await d.getFileHandle(parties[parties.length - 1])).getFile());
      }));
    }
    return adresses.get(chemin);
  };
}
