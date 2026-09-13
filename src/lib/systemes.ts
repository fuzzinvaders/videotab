/**
 * Retrouver les lignes de tablature sur l'image d'une page.
 *
 * Un PDF ne dit pas où sont ses systèmes : il dit où sont ses traits. Mais une tablature
 * a une signature visuelle très reconnaissable — six longues lignes horizontales, serrées,
 * répétées de bloc en bloc. C'est cette signature qu'on cherche ici, et rien d'autre : pas
 * de reconnaissance de notes, pas d'apprentissage, juste un profil d'encre ligne par ligne.
 *
 * La détection n'a pas à être parfaite. Elle a à être *proche*, parce que l'atelier laisse
 * ensuite ajouter, déplacer et supprimer les systèmes à la main. Une détection qui propose
 * huit lignes sur neuf fait gagner huit gestes ; une détection qui refuserait de proposer
 * quoi que ce soit tant qu'elle n'est pas sûre n'en ferait gagner aucun.
 */

export interface Bande {
  /** Bornes verticales, en fraction de la hauteur de page (0 en haut, 1 en bas). */
  y0: number
  y1: number
}

export interface OptionsDetection {
  /** Part de pixels sombres à partir de laquelle une ligne compte comme un trait. */
  seuil?: number
  /** Écart maximal, en fraction de page, entre deux traits d'un même système. */
  ecartMax?: number
  /** Hauteur minimale d'un système retenu, en fraction de page. */
  hauteurMin?: number
  /** Nombre de traits distincts attendus : en dessous, c'est un filet, pas une portée. */
  traitsMin?: number
}

const DEFAUTS: Required<OptionsDetection> = {
  seuil: 0.3,
  // 2,5 % de la hauteur d'une page A4, c'est environ sept millimètres : plus que l'écart
  // entre deux cordes d'une tablature, bien moins que celui entre deux systèmes.
  ecartMax: 0.025,
  hauteurMin: 0.012,
  traitsMin: 4,
}

/**
 * Le profil d'encre : pour chaque ligne de pixels, la part de pixels sombres.
 *
 * Les bords sont écartés d'office. Un PDF scanné porte très souvent une ombre de reliure
 * ou un liseré de bord de vitre sur toute la hauteur, qui suffirait à faire passer chaque
 * ligne de la page pour un trait.
 */
export function profilEncre(
  pixels: Uint8ClampedArray,
  largeur: number,
  hauteur: number,
  marge = 0.06,
): number[] {
  const debut = Math.floor(largeur * marge)
  const fin = Math.ceil(largeur * (1 - marge))
  const utile = Math.max(1, fin - debut)
  const profil = new Array<number>(hauteur)

  for (let y = 0; y < hauteur; y++) {
    let sombres = 0
    for (let x = debut; x < fin; x++) {
      const i = (y * largeur + x) * 4
      // Luminance approchée, pondérée comme l'œil : une portée imprimée en gris clair
      // doit compter, une trame de fond beige ne doit pas.
      const luminance = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000
      if (luminance < 160) sombres++
    }
    profil[y] = sombres / utile
  }
  return profil
}

/** Les suites de lignes consécutives au-dessus du seuil : les traits eux-mêmes. */
function traits(profil: number[], seuil: number): Array<[number, number]> {
  const trouves: Array<[number, number]> = []
  let debut = -1
  for (let y = 0; y < profil.length; y++) {
    if (profil[y] >= seuil) {
      if (debut === -1) debut = y
    } else if (debut !== -1) {
      trouves.push([debut, y - 1])
      debut = -1
    }
  }
  if (debut !== -1) trouves.push([debut, profil.length - 1])
  return trouves
}

export function detecterSystemes(profil: number[], options: OptionsDetection = {}): Bande[] {
  const { seuil, ecartMax, hauteurMin, traitsMin } = { ...DEFAUTS, ...options }
  const hauteur = profil.length
  if (hauteur === 0) return []

  const ecartMaxPx = Math.max(1, ecartMax * hauteur)
  const groupes: Array<{ debut: number; fin: number; traits: number }> = []

  for (const [debut, fin] of traits(profil, seuil)) {
    const dernier = groupes[groupes.length - 1]
    // Un trait qui suit de près le précédent appartient à la même portée ; celui qui
    // arrive après un blanc en commence une autre. Toute la détection tient là-dedans.
    if (dernier && debut - dernier.fin <= ecartMaxPx) {
      dernier.fin = fin
      dernier.traits += 1
    } else {
      groupes.push({ debut, fin, traits: 1 })
    }
  }

  const retenus = groupes.filter(
    (g) => g.traits >= traitsMin && g.fin - g.debut >= hauteurMin * hauteur,
  )

  /* Les traits marquent les cordes, pas la hauteur utile : les chiffres de doigté débordent
     au-dessus, les indications de rythme en dessous. On élargit donc chaque système, mais
     jamais au point de mordre sur son voisin — un curseur qui recouvre deux lignes à la fois
     ne désigne plus rien. */
  return retenus.map((g, i) => {
    const hautVoisin = i > 0 ? retenus[i - 1].fin : -Infinity
    const basVoisin = i < retenus.length - 1 ? retenus[i + 1].debut : Infinity
    const marge = (g.fin - g.debut) * 0.45
    const y0 = Math.max(0, Math.max(g.debut - marge, (g.debut + hautVoisin) / 2))
    const y1 = Math.min(hauteur - 1, Math.min(g.fin + marge, (g.fin + basVoisin) / 2))
    return { y0: y0 / hauteur, y1: y1 / hauteur }
  })
}

/**
 * Les bornes horizontales d'un système : là où l'encre commence et où elle s'arrête.
 *
 * La portée ne remplit presque jamais la largeur utile de la page, et un curseur qui
 * partirait du bord du papier passerait ses premières fractions de seconde dans le vide.
 */
export function bornesHorizontales(
  pixels: Uint8ClampedArray,
  largeur: number,
  hauteur: number,
  bande: Bande,
): { x0: number; x1: number } {
  const yDebut = Math.max(0, Math.floor(bande.y0 * hauteur))
  const yFin = Math.min(hauteur - 1, Math.ceil(bande.y1 * hauteur))
  let premier = -1
  let dernier = -1

  for (let x = 0; x < largeur; x++) {
    let sombres = 0
    for (let y = yDebut; y <= yFin; y++) {
      const i = (y * largeur + x) * 4
      const luminance = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000
      if (luminance < 160) sombres++
    }
    // Deux pixels sombres empilés suffisent : sur une portée, une colonne vide de notes
    // traverse quand même les six cordes.
    if (sombres >= 2) {
      if (premier === -1) premier = x
      dernier = x
    }
  }

  if (premier === -1) return { x0: 0.08, x1: 0.92 }
  return { x0: premier / largeur, x1: (dernier + 1) / largeur }
}
