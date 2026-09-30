// Le traceur de sprites : poser une image des banques sur la surface de dessin.
//
// Réécriture lisible de 0x5ED21, la routine assembleur qui décode, découpe et retourne les images,
// et de ses enveloppes 0x5EC9C, 0x5ECD4 et 0x55BD4, qui l'adaptent à l'appel depuis le code C.
//
// OÙ. Le traceur écrit toujours dans la surface de dessin [0xDE5BC], jamais en mémoire vidéo, à
// l'intérieur d'une fenêtre : coin haut-gauche ([0xDE5D0], [0xDE5E0]), largeur [0xDE5C8], hauteur
// [0xDE5F0], bord droit [0xDE5EC], pas de ligne [0xDE5B8]. La fenêtre est posée par 0x87790, dont
// les deux seuls appelants la placent à l'origine : 320x200 en basse résolution (0x7EC50), 640x480
// en haute (0x7ECF0). 0x7DDD7 la remplace un instant par un carré de 64 de côté pour décoder une
// image dans un tampon à part.
//
// LE FORMAT. Une image est une suite de lignes ; une ligne, une suite de codes d'un octet signé :
//   n > 0 : n pixels opaques suivent, à poser tels quels ;
//   n < 0 : -n pixels transparents, à sauter ;
//   0     : fin de la ligne.
// Après un saut, certaines variantes lisent l'octet suivant d'office comme un nombre de pixels
// opaques, d'autres comme un code ordinaire : cela revient au même tant qu'un saut est toujours
// suivi d'une série opaque, ce que le tracé simple exige (sinon il avalerait la fin de ligne).
// La hauteur donne le nombre de lignes à lire ; la largeur ne sert qu'à placer, à retourner et à
// couper : la fin d'une ligne est toujours lue dans les données.
//
// L'ÉCHELLE. Le jeu dessine dans un espace logique de 640 de large. En basse résolution (mode 1,
// 320x200), le traceur divise position et dimensions par deux avant tout le reste.
//
// LES VARIANTES, choisies par le mot [0xBECBC] que 0x209B5 recopie de chaque morceau d'objet. Une
// seule s'applique : la première de cette liste dont le bit est posé.
//   1    miroir horizontal ; avec 2, miroir dans les deux sens
//   2    miroir vertical
//   4    fusion avec le fond par la table de 64 Ko [0xBA2F8] : transparences, ombres
//   8    compression : un pixel gardé sur param1+1, et param2 lignes sautées après chaque ligne
//   0x20 agrandissement : chaque pixel posé param1 fois, chaque ligne répétée jusqu'à param2 fois
//   0x40 silhouette : chaque pixel opaque prend la couleur param1
// Tout autre drapeau donne le tracé simple. Aucun appelant ne passe de param2 non nul : la
// compression ne saute donc jamais de ligne, ni l'agrandissement n'en répète. Seul 0x11BD5 passe un
// param1 non nul (sa couleur) ; par les enveloppes 0x5EC9C et 0x5ECD4, qui passent 0, la compression
// ne compresse rien, l'agrandissement ne pose aucun pixel et la silhouette est de couleur 0.
//
// Une image qui déborde à gauche ou à droite n'est coupée que dans le tracé simple et les miroirs :
// avec un autre drapeau, elle n'est pas tracée du tout (anomalie reproduite).
//
// CE QUE LES SCÉNARIOS VÉRIFIENT. demo.json : le tracé simple (drapeaux 0 et 0x80), le miroir
// horizontal seul, la silhouette et les quatre découpes du tracé simple. parc.json y ajoute la haute
// résolution, la silhouette coupée (donc non tracée) et la coupe à gauche de plus de 127 pixels, où
// le compteur déborde. Le miroir vertical, la fusion, la compression, l'agrandissement et les
// découpes des miroirs ne sont tracés par aucun des deux : ces chemins sont marqués « non vérifié
// par les scénarios ».


const SURFACE = 0xDE5BC;          // pointeur vers la surface de dessin
const PAS_LIGNE = 0xDE5B8;        // octets d'une ligne de la surface : 320 ou 640 (64 pour 0x7DDD7)
const FENETRE_GAUCHE = 0xDE5D0;
const FENETRE_HAUT = 0xDE5E0;
const FENETRE_LARGEUR = 0xDE5C8;
const FENETRE_HAUTEUR = 0xDE5F0;
const FENETRE_DROITE = 0xDE5EC;   // gauche + largeur, calculé par 0x87790
const DRAPEAUX = 0xBECBC;         // mot : la variante de tracé
const TABLE_FUSION = 0xBA2F8;     // pointeur vers la table de fusion, 256 lignes de 256 octets

const MIROIR_H = 1, MIROIR_V = 2, FUSION = 4, COMPRESSION = 8, AGRANDISSEMENT = 0x20, SILHOUETTE = 0x40;

const s8 = (v) => (v << 24) >> 24;
const s16 = (v) => (v << 16) >> 16;

// 'loop' décrémente ecx avant de le tester : sur un compte nul, la boucle ferait 2^32 tours et le jeu
// écraserait sa mémoire. Cela n'arrive que si un saut est suivi d'un octet nul — des données que le
// tracé simple ne supporterait pas non plus.
const toursDeLoop = (n) => (n === 0 ? 2 ** 32 : n);

// 0x5ED21 — tracer une image : `pixels` pointe vers ses lignes codées, (x, y) est son coin
// haut-gauche dans l'espace logique, relatif à la fenêtre ; `largeur` et `hauteur` sont des octets.
// param1 et param2 ne servent qu'aux variantes compression, agrandissement et silhouette.
export function tracer(jeu, pixels, x, y, largeur, hauteur, param1, param2) {
  tracerSprite(jeu, pixels, x, y, largeur, hauteur, param1, param2);
}

function tracerSprite(jeu, pixels, x, y, largeur, hauteur, param1, param2) {
  if (hauteur === 0) return;
  const dv = jeu.dv;
  const pas = dv.getInt32(PAS_LIGNE, true);
  let origine = (Math.imul(dv.getInt32(FENETRE_HAUT, true), pas) + dv.getInt32(FENETRE_GAUCHE, true)
    + dv.getInt32(SURFACE, true)) | 0;
  if (jeu.etat.basseResolution) {
    largeur >>= 1;
    hauteur >>= 1;               // une image d'une ligne tombe ici à zéro : voir parLignes
    x >>= 1;
    y >>= 1;
  }
  const drapeaux = dv.getUint16(DRAPEAUX, true);
  const f = { m8: jeu.m8, src: pixels };

  // --- La découpe verticale ---------------------------------------------------------------------
  // Un tracé retourné verticalement part de la rangée y + hauteur et remonte : la première ligne des
  // données est celle du bas. Couper un tel tracé en bas, c'est donc sauter des lignes de données ;
  // le couper en haut, c'est l'arrêter plus tôt. Les deux coupes du miroir vertical : non vérifié
  // par les scénarios.
  const bas = dv.getInt32(FENETRE_HAUTEUR, true);
  if (y < 0) {
    if (drapeaux & MIROIR_V) {
      const reste = hauteur + y + 1;
      if (reste <= 0) return;
      hauteur = reste & 0xFF;
      y = -1;                    // la première rangée tracée reste y + hauteur ; la dernière est 0
    } else {
      const reste = hauteur + y;
      if (reste <= 0) return;
      hauteur = reste & 0xFF;
      sauterLignes(f, -y);
      y = 0;
    }
    // Le code d'origine repart alors directement aux tests horizontaux (0x5ED76), sans tester le
    // bas : une image qui dépasse la fenêtre en haut ET en bas n'est pas coupée en bas.
  } else if (hauteur + y >= bas) {
    if (drapeaux & MIROIR_V) {
      if (y + 1 >= bas) return;
      const enTrop = y + 1 + hauteur - bas;
      hauteur = (hauteur - enTrop) & 0xFF;
      sauterLignes(f, enTrop);
      // ANOMALIE (0x5F4DF) : le registre qui portait l'origine de la fenêtre a servi de compteur,
      // et il est rechargé avec la surface seule : le coin de la fenêtre est perdu. Sans effet
      // visible tant que la fenêtre est à l'origine, ce qui est toujours le cas.
      origine = dv.getInt32(SURFACE, true);
    } else {
      if (bas - y <= 0) return;
      hauteur = (bas - y) & 0xFF;
    }
  }

  // --- Le tracé ---------------------------------------------------------------------------------
  const point = (colonne, rangee) => (origine + colonne + Math.imul(rangee, pas)) | 0;
  // Les tracés retournés partent de x + largeur et de y + hauteur, et non de x + largeur - 1 et
  // y + hauteur - 1 : une image retournée tombe un pixel plus à droite et plus bas que l'image
  // droite (voulu ou non, non établi). Les tests de débordement en tiennent compte.
  const droite = (x + largeur) | 0, dessous = (y + hauteur) | 0;

  if (x < 0) {
    // Coupe à gauche. Les tracés dans le sens de lecture partent de la colonne 0 et sautent les
    // -x premiers pixels de chaque ligne ; les miroirs partent du bord droit et s'arrêtent à 0.
    // Les deux branches des miroirs : non vérifié par les scénarios.
    const aSauter = -x >>> 0;
    if (drapeaux === 0) {
      if (largeur <= aSauter) return;
      parLignes(hauteur, point(0, y), pas, (d) => ligneCoupeeAGauche(f, d, aSauter & 0xFF));
    } else if (drapeaux & MIROIR_H) {
      const colonne = (droite + 1) | 0;
      if (colonne < 0) return;
      if (drapeaux & MIROIR_V) {
        parLignes(hauteur, point(droite, dessous), -pas, (d) => ligneMiroirCoupeeAGauche(f, d, colonne & 0xFF));
      } else {
        parLignes(hauteur, point(droite, y), pas, (d) => ligneMiroirCoupeeAGauche(f, d, colonne & 0xFF));
      }
    } else if (drapeaux & MIROIR_V) {
      if (largeur <= aSauter) return;
      parLignes(hauteur, point(0, dessous), -pas, (d) => ligneCoupeeAGauche(f, d, aSauter & 0xFF));
    }
    return;
  }

  if (largeur + x >= dv.getInt32(FENETRE_LARGEUR, true)) {
    // Coupe à droite. Le débordement est détecté sur la largeur de la fenêtre, mais la coupe se fait
    // au bord [0xDE5EC] = gauche + largeur, compté depuis la gauche de la fenêtre : juste tant que la
    // fenêtre est à l'origine, ce qui est toujours le cas. Les deux branches des miroirs : non
    // vérifié par les scénarios.
    const bord = dv.getInt32(FENETRE_DROITE, true);
    const visibles = (bord - x) | 0;
    if (visibles < 0) return;
    if (drapeaux === 0) {
      parLignes(hauteur, point(x, y), pas, (d) => ligneCoupeeADroite(f, d, visibles & 0xFF));
    } else if (drapeaux & MIROIR_H) {
      const compte = (bord - droite - 2) & 0xFF;
      if (drapeaux & MIROIR_V) {
        parLignes(hauteur, point(droite, dessous), -pas, (d) => ligneMiroirCoupeeADroite(f, d, compte));
      } else {
        parLignes(hauteur, point(droite, y), pas, (d) => ligneMiroirCoupeeADroite(f, d, compte));
      }
    } else if (drapeaux & MIROIR_V) {
      parLignes(hauteur, point(x, dessous), -pas, (d) => ligneMiroirVCoupeeADroite(f, d, visibles & 0xFF));
    }
    return;
  }

  // Sans découpe horizontale. Le miroir dans les deux sens, le miroir vertical, la fusion, la
  // compression et l'agrandissement : non vérifié par les scénarios.
  if (drapeaux & MIROIR_H) {
    if (drapeaux & MIROIR_V) parLignes(hauteur, point(droite, dessous), -pas, (d) => ligneMiroir(f, d));
    else parLignes(hauteur, point(droite, y), pas, (d) => ligneMiroir(f, d));
  } else if (drapeaux === 0) {
    parLignes(hauteur, point(x, y), pas, (d) => ligneDirecte(f, d));
  } else if (drapeaux & MIROIR_V) {
    parLignes(hauteur, point(x, dessous), -pas, (d) => ligneDirecte(f, d));
  } else if (drapeaux & FUSION) {
    const table = dv.getInt32(TABLE_FUSION, true);
    parLignes(hauteur, point(x, y), pas, (d) => ligneFusion(f, d, table));
  } else if (drapeaux & COMPRESSION) {
    tracerCompresse(f, point(x, y), pas, hauteur, param1, param2);
  } else if (drapeaux & AGRANDISSEMENT) {
    tracerAgrandi(f, point(x, y), pas, hauteur, param1, param2);
  } else if (drapeaux & SILHOUETTE) {
    parLignes(hauteur, point(x, y), pas, (d) => ligneSilhouette(f, d, param1));
  } else {
    parLignes(hauteur, point(x, y), pas, (d) => ligneDirecte(f, d));
  }
}

// Tracer les lignes l'une après l'autre, de `saut` en `saut` octets. Le compteur de lignes est un
// octet testé après chaque ligne ('dec dh ; jne') : une hauteur nulle en trace 256. Cela arriverait
// à une image d'une ligne en basse résolution, divisée par deux (non vérifié par les scénarios :
// aucune n'y est tracée).
function parLignes(hauteur, debut, saut, tracerLigne) {
  let n = hauteur === 0 ? 256 : hauteur;
  do {
    tracerLigne(debut);
    debut = (debut + saut) | 0;
  } while (--n > 0);
}

// Passer une ligne sans la tracer (0x5F52A, 0x5F4CF, 0x5EFC0).
function sauterLigne(f) {
  const m8 = f.m8;
  let src = f.src;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    if (!(code & 0x80)) src += code;
  }
  f.src = src;
}

function sauterLignes(f, n) {
  for (let k = 0; k < n; k++) sauterLigne(f);
}

// 'rep movsb' : octet par octet, vers l'avant. Si les deux zones se recouvrent, le motif se propage.
function copier(m8, dest, src, n) {
  for (let k = 0; k < n; k++) m8[dest + k] = m8[src + k];
}

// --- Le décodage d'une ligne, variante par variante -------------------------------------------------
// Chaque fonction lit une ligne dans le flux f (f.m8 la mémoire, f.src la position dans les données
// codées) jusqu'au code 0, pose ses pixels à partir de `dest`, et avance f.src. Les compteurs des
// découpes sont des octets, comme dans le code d'origine : au-delà de 127 pixels coupés ou restant
// visibles, ils débordent et le tracé d'origine est faux ; c'est reproduit tel quel.

// Tracé simple, de gauche à droite (0x5EE83, 0x5EED6, 0x5F0DA). Après un saut, l'octet suivant est
// d'office un nombre de pixels opaques.
function ligneDirecte(f, dest) {
  const m8 = f.m8;
  let src = f.src;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    let n = code;
    if (code & 0x80) {
      dest += 256 - code;
      n = m8[src++];             // 'rep movsb' : un compte nul ne copie rien
    }
    for (let k = 0; k < n; k++) m8[dest++] = m8[src++];
  }
  f.src = src;
}

// Miroir horizontal : la ligne est posée de droite à gauche (0x5EDCB, 0x5EE23).
function ligneMiroir(f, dest) {
  const m8 = f.m8;
  let src = f.src;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    let n = code;
    if (code & 0x80) {
      dest -= 256 - code;
      n = toursDeLoop(m8[src++]);
    }
    for (let k = 0; k < n; k++) m8[dest--] = m8[src++];
  }
  f.src = src;
}

// Fusion (0x5EF2B) : le pixel posé est lu dans la table, à la ligne de la couleur du fond et à la
// colonne de celle de l'image. Un saut n'y est pas suivi d'office d'une série.
// Non vérifié par les scénarios.
function ligneFusion(f, dest, table) {
  const m8 = f.m8;
  let src = f.src;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    if (code & 0x80) {
      dest += 256 - code;
      continue;
    }
    for (let k = 0; k < code; k++, dest++) m8[dest] = m8[table + (m8[dest] << 8 | m8[src++])];
  }
  f.src = src;
}

// Silhouette (0x5F090) : chaque pixel opaque est remplacé par la couleur ; les données des pixels
// sont passées sans être lues.
function ligneSilhouette(f, dest, couleur) {
  const m8 = f.m8;
  let src = f.src;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    let n = code;
    if (code & 0x80) {
      dest += 256 - code;
      n = m8[src++];
    }
    src += n;
    m8.fill(couleur, dest, dest + n);
    dest += n;
  }
  f.src = src;
}

// Compression (0x5EF60) : un pixel gardé sur garde+1 dans chaque ligne, puis `sautees` lignes des
// données passées après chaque ligne tracée — sauf après la dernière. Rien ne réduit la hauteur :
// avec des lignes sautées, le tracé lirait au-delà de la fin de l'image ; mais aucun appelant ne
// passe de lignes à sauter. Non vérifié par les scénarios.
function tracerCompresse(f, debut, pas, hauteur, garde, sautees) {
  // 'dec dl ; js' sur param2 : param2 lignes sautées de 1 à 128, aucune au-delà ni pour 0.
  const aSauter = sautees >= 1 && sautees <= 128 ? sautees : 0;
  let n = hauteur === 0 ? 256 : hauteur;
  for (;;) {
    ligneCompressee(f, debut, garde);
    if (--n === 0) return;
    sauterLignes(f, aSauter);
    debut = (debut + pas) | 0;
  }
}

// Le compte des pixels court sur toute la ligne, transparents compris, et repart de `garde` à
// chaque ligne. 'dec dl ; jge' : le pixel est écarté tant que le compte, signé, vaut au moins 1 ;
// une garde de 128 ou plus garde donc tous les pixels. Un saut n'est pas suivi d'office d'une série.
function ligneCompressee(f, dest, garde) {
  const m8 = f.m8;
  let src = f.src, compte = garde;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    if (code & 0x80) {
      for (let k = 256 - code; k > 0; k--) {
        if (s8(compte) >= 1) compte--;
        else { compte = garde; dest++; }         // pixel transparent gardé : on avance seulement
      }
    } else {
      for (let k = 0; k < code; k++) {
        const pixel = m8[src++];
        if (s8(compte) >= 1) compte--;
        else { compte = garde; m8[dest++] = pixel; }
      }
    }
  }
  f.src = src;
}

// Agrandissement (0x5EFE8) : chaque pixel posé `facteur` fois ; puis la ligne tracée est recopiée
// sur les rangées suivantes, param2 - 1 fois — en entier, fond compris entre les pixels. Non
// vérifié par les scénarios.
function tracerAgrandi(f, debut, pas, hauteur, facteur, repetitions) {
  const copies = s8(repetitions) - 1;           // 'dec dl ; jle' : aucune copie si param2 <= 1 (signé)
  let n = hauteur === 0 ? 256 : hauteur;
  do {
    const fin = ligneAgrandie(f, debut, facteur);
    const longueur = (fin - debut) | 0;
    for (let k = 0; k < copies; k++) {
      copier(f.m8, (debut + pas) | 0, debut, longueur);
      debut = (debut + pas) | 0;
    }
    debut = (debut + pas) | 0;
  } while (--n > 0);
}

// Rend l'adresse où s'arrête la ligne. Un saut n'est pas suivi d'office d'une série.
function ligneAgrandie(f, dest, facteur) {
  const m8 = f.m8;
  let src = f.src;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    if (code & 0x80) {
      dest += (256 - code) * facteur;           // 'imul ax, bx' : 16 bits, 128 x 255 y tient
      continue;
    }
    for (let k = 0; k < code; k++) {
      m8.fill(m8[src++], dest, dest + facteur);
      dest += facteur;
    }
  }
  f.src = src;
  return dest;
}

// Coupe à droite, tracé simple (0x5F135). `reste` compte les pixels encore visibles avant le bord ;
// un pixel écarté ne fait pas avancer la destination.
function ligneCoupeeADroite(f, dest, visibles) {
  const m8 = f.m8;
  let src = f.src, reste = visibles;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    let n = code;
    if (code & 0x80) {
      const apres = s8(reste) + s8(code);       // 'add bl, al ; jle'
      reste = apres & 0xFF;
      if (apres <= 0) continue;                 // bord atteint : la série suivante sera lue comme un code
      dest += 256 - code;
      n = toursDeLoop(m8[src++]);
    }
    for (let k = 0; k < n; k++) {
      const pixel = m8[src++];
      reste = (reste - 1) & 0xFF;
      if (!(reste & 0x80)) m8[dest++] = pixel;
    }
  }
  f.src = src;
}

// Coupe à droite, miroir vertical seul (0x5F2B8) : le même compte, mais un saut n'y est pas suivi
// d'office d'une série. Non vérifié par les scénarios.
function ligneMiroirVCoupeeADroite(f, dest, visibles) {
  const m8 = f.m8;
  let src = f.src, reste = visibles;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    if (code & 0x80) {
      dest += 256 - code;
      reste = (reste + code) & 0xFF;
      continue;
    }
    for (let k = 0; k < code; k++) {
      const pixel = m8[src++];
      reste = (reste - 1) & 0xFF;
      if (!(reste & 0x80)) m8[dest++] = pixel;
    }
  }
  f.src = src;
}

// Coupe à droite, miroir horizontal (0x5F1D2, 0x5F246). La ligne part du bord droit de l'image vers
// la gauche ; le compte, qui vaut [0xDE5EC] - x - largeur - 2 au départ, monte d'un par pixel, et le
// pixel n'est posé qu'une fois le compte positif, c'est-à-dire une fois repassé sous le bord.
// Non vérifié par les scénarios.
function ligneMiroirCoupeeADroite(f, dest, compteDepart) {
  const m8 = f.m8;
  let src = f.src, compte = compteDepart;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    if (code & 0x80) {
      dest -= 256 - code;
      compte = (compte - code) & 0xFF;
      continue;
    }
    for (let k = 0; k < code; k++) {
      const pixel = m8[src++];
      compte = (compte + 1) & 0xFF;
      if (!(compte & 0x80)) m8[dest] = pixel;
      dest--;
    }
  }
  f.src = src;
}

// Coupe à gauche, tracé simple ou miroir vertical (0x5F312, 0x5F461). La ligne est posée à partir
// de la colonne 0 ; `reste` compte les pixels encore hors de la fenêtre, et un pixel n'est posé
// qu'une fois ce compte passé sous zéro.
function ligneCoupeeAGauche(f, dest, aSauter) {
  const m8 = f.m8;
  let src = f.src, reste = aSauter;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    let n = code;
    if (code & 0x80) {
      let avance = 256 - code;
      if (s8(reste) > 0) {
        reste = (reste + code) & 0xFF;
        if (!(reste & 0x80)) continue;          // saut entièrement hors fenêtre : la série suivante sera lue comme un code
        avance = -s8(reste);                    // la part du saut qui entre dans la fenêtre
      }
      dest += avance;
      n = toursDeLoop(m8[src++]);
    }
    for (let k = 0; k < n; k++) {
      const pixel = m8[src++];
      reste = (reste - 1) & 0xFF;
      if (reste & 0x80) m8[dest++] = pixel;
    }
  }
  f.src = src;
}

// Coupe à gauche, miroir horizontal (0x5F3A4, 0x5F402). La ligne part du bord droit de l'image vers
// la gauche ; le compte est la colonne du pixel, sur un octet, et le pixel n'est posé que si elle
// est positive. Au-delà de la colonne 127, le compte déborde : une image large, retournée et coupée
// à gauche perd sa partie droite. Non vérifié par les scénarios.
function ligneMiroirCoupeeAGauche(f, dest, colonneDepart) {
  const m8 = f.m8;
  let src = f.src, colonne = colonneDepart;
  for (;;) {
    const code = m8[src++];
    if (code === 0) break;
    if (code & 0x80) {
      dest -= 256 - code;
      colonne = (colonne + code) & 0xFF;
      continue;
    }
    for (let k = 0; k < code; k++) {
      const pixel = m8[src++];
      colonne = (colonne - 1) & 0xFF;
      if (!(colonne & 0x80)) m8[dest] = pixel;
      dest--;
    }
  }
  f.src = src;
}

// --- Les points d'entrée ------------------------------------------------------------------------

// 0x5EC9C — tracer une image au point (x, y). `image` est une entrée de la table des images, 6
// octets : pointeur vers les données codées, largeur, hauteur. L'enveloppe d'origine sauve et rend
// tous les registres, eax, ecx et edx compris : celle-ci n'y touche pas.
export function tracerImage(jeu, x, y, image) {
  const { m8, dv } = jeu;
  tracer(jeu, dv.getInt32(image, true), s16(x), s16(y), m8[image + 4], m8[image + 5], 0, 0);
}

// 0x55BD4 — le tracé de la haute résolution : marquer d'abord les blocs de l'écran que l'image va
// toucher (0x54D38), pour qu'ils soient recopiés vers l'écran, puis la tracer par 0x5ECD4, copie
// conforme de 0x5EC9C. Le marquage prend les dimensions de l'entrée telles quelles.
export function tracerImageMarquee(jeu, x, y, image) {
  const m8 = jeu.m8;
  jeu.appeler(0x54D38, s16(x), s16(y), m8[image + 4], m8[image + 5]);
  tracerImage(jeu, s16(x), s16(y), image);
}

// 0x5ED21, pour ses appelants en assembleur (0x11AF4, 0x11BD5, 0x5ED0C) : ebx = x, ecx = y,
// dl = largeur, dh = hauteur, esi = données codées ; sur la pile, param1 puis param2, un octet
// chacun. Tous ces appelants rechargent leurs registres depuis la pile au retour : seuls ebp et esp,
// rendus par 'leave ; ret', sont relus.
function tracerRegistres(jeu, R) {
  const pile = R.esp >>> 0;
  tracer(jeu, R.esi | 0, R.ebx | 0, R.ecx | 0, R.edx & 0xFF, (R.edx >>> 8) & 0xFF,
    jeu.m8[pile + 4], jeu.m8[pile + 8]);
}

// 0x55BD4 et 0x5ECD4 forment le chemin de la haute résolution : seul le scénario parc.json les
// exerce. 0x5ECD4 n'a d'autre appelant que 0x55BD4 : une fois celle-ci réécrite, elle n'est plus
// atteinte que par la transcription de 0x55BD4, pendant la comparaison appel par appel.
export const reecritures = [
  // arguments : les deux octets empilés (param1, param2), que l'appelant retire après l'appel.
  { adresse: 0x5ED21, nom: 'tracerSprite', fn: tracerRegistres, convention: 'registres', registresCompares: ['ebp', 'esp'], arguments: 2 },
  { adresse: 0x5EC9C, nom: 'tracerImage', fn: tracerImage, arguments: 3 },
  { adresse: 0x55BD4, nom: 'tracerImageMarquee', fn: tracerImageMarquee, arguments: 3 },
  { adresse: 0x5ECD4, nom: 'tracerImageBis', fn: tracerImage, arguments: 3 },
];
