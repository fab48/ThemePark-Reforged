// Le cadre de pile de l'original, pour les réécritures qui doivent l'ouvrir.
//
// Une réécriture n'a pas de variables locales en mémoire : elle appelle ses sous-fonctions à la
// hauteur de son point d'entrée, et laisse sous lui autre chose que l'original. D'ordinaire cela ne
// compte pas ; mais quand une fonction passe l'adresse d'un tampon pris dans ses variables, ou
// qu'une autre relit plus tard ce qu'elle y a laissé (les restes de pile, index.js `resteRelu`),
// la réécriture ouvre le même cadre que l'original : ebx, esi, edi et ebp empilés, puis
// `enter taille, 0` ; ebp désigne le cadre et le pointeur de pile descend sous les variables
// locales, là où l'original appelait. En sortant, elle rend à l'appelant ebx, esi, edi et ebp.
//
// (panneau.js s'en sert ; d'autres modules en gardent une copie, écrite avant ce fichier.)

const poserLong = (jeu, a, v) => jeu.dv.setUint32(a >>> 0, v >>> 0, true);

export class Cadre {
  constructor(jeu, tailleDesLocales) {
    const T = jeu.T;
    T.sauver();
    const R = T.R, entree = R.esp >>> 0;
    this.jeu = jeu;
    this.ebpAppelant = R.ebp;
    this.ebx = R.ebx;
    this.esi = R.esi;
    this.edi = R.edi;
    poserLong(jeu, entree - 4, R.ebx);
    poserLong(jeu, entree - 8, R.esi);
    poserLong(jeu, entree - 12, R.edi);
    poserLong(jeu, entree - 16, R.ebp);
    this.ebp = entree - 16;
    R.ebp = this.ebp;
    R.esp = this.ebp - tailleDesLocales;
    T.charger();
  }

  // L'adresse d'une variable locale, [ebp - decalage].
  local(decalage) { return this.ebp - decalage; }

  fermer() {
    const T = this.jeu.T;
    T.sauver();
    T.R.ebp = this.ebpAppelant;
    T.R.ebx = this.ebx;
    T.R.esi = this.esi;
    T.R.edi = this.edi;
    T.charger();
  }
}

// La routine, appelée comme routine(jeu, cadre, ...arguments), dans un cadre de cette taille.
export function dansLeCadre(tailleDesLocales, routine) {
  return (jeu, ...args) => {
    const cadre = new Cadre(jeu, tailleDesLocales);
    try {
      return routine(jeu, cadre, ...args);
    } finally {
      cadre.fermer();
    }
  };
}
