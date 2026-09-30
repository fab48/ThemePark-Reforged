// Le CD du joueur, côté page : quand aucun asset du jeu n'est servi avec la page (un site qui
// n'embarque pas les fichiers du jeu), la page demande l'image du CD de Theme Park (THEMECD.ISO), en
// fait extraire les assets par extraction-travailleur.js dans le stockage privé du navigateur (OPFS),
// et le jeu démarre. Rien ne quitte la machine du joueur ; la fois suivante, les assets sont déjà là.

export function demanderLeCD(etat) {
  return new Promise((resoudre) => {
    const voile = document.createElement('div');
    voile.id = 'demande-cd';
    voile.innerHTML = `
      <div class="carte">
        <h1>Theme Park</h1>
        <p>Il faut les fichiers de votre CD de <b>Theme Park</b> (Bullfrog, 1994, version CD) :
        donnez ici son image ISO (<code>THEMECD.ISO</code>).</p>
        <p class="discret">Elle est lue dans votre navigateur, qui en garde les images, les sons et les
        textes du jeu (157 Mo) ; rien n'est envoyé nulle part.</p>
        <label class="choisir">Choisir l'image du CD…<input type="file" accept=".iso,.ISO,application/x-iso9660-image"></label>
        <p class="avancement" aria-live="polite"></p>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      #demande-cd { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
        background: rgba(10, 12, 14, 0.92); z-index: 10; }
      #demande-cd .carte { max-width: 460px; margin: 16px; padding: 20px 24px; border: 1px solid #2a2e33;
        border-radius: 6px; background: #16191c; color: #c9ccd1; font: 14px/1.5 system-ui, sans-serif; }
      #demande-cd h1 { margin: 0 0 8px; font-size: 18px; }
      #demande-cd .discret { color: #7b8088; font-size: 13px; }
      #demande-cd .choisir { display: inline-block; margin-top: 8px; padding: 6px 12px; border: 1px solid #3a3f45;
        border-radius: 4px; cursor: pointer; }
      #demande-cd .choisir:hover { background: #22262a; }
      #demande-cd input { display: none; }
      #demande-cd.survol .carte { border-color: #6c8ebf; }`;
    document.head.appendChild(style);
    document.body.appendChild(voile);
    const avancement = voile.querySelector('.avancement');
    const entree = voile.querySelector('input');

    let enCours = false;
    const derouler = (fichier) => {
      if (enCours || !fichier) return;
      enCours = true;
      avancement.textContent = 'lecture du CD…';
      etat.textContent = 'lecture du CD…';
      const t = new Worker(new URL('./extraction-travailleur.js', import.meta.url), { type: 'module' });
      t.onmessage = (e) => {
        if (e.data.avancement) { avancement.textContent = e.data.avancement; etat.textContent = e.data.avancement; }
        if (e.data.erreur) {
          avancement.textContent = `Impossible : ${e.data.erreur}`;
          enCours = false;
          t.terminate();
        }
        if (e.data.fini) {
          t.terminate();
          voile.remove();
          style.remove();
          resoudre({ genre: 'opfs', dossier: 'assets' });
        }
      };
      t.postMessage({ fichier });
    };
    entree.addEventListener('change', () => derouler(entree.files[0]));
    voile.addEventListener('dragover', (e) => { e.preventDefault(); voile.classList.add('survol'); });
    voile.addEventListener('dragleave', () => voile.classList.remove('survol'));
    voile.addEventListener('drop', (e) => {
      e.preventDefault();
      voile.classList.remove('survol');
      derouler(e.dataTransfer.files[0]);
    });
    etat.textContent = 'en attente de l\'image du CD';
  });
}
