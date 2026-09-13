/**
 * À quelle taille la tablature défile.
 *
 * Le réglage naturel n'est pas « quelle hauteur fait la bande » mais « combien de mesures je
 * veux voir d'un coup ». C'est la question qu'on se pose en jouant — deux mesures pour
 * travailler un passage, quatre pour suivre, huit pour avoir le morceau en tête — et c'est
 * elle qui a un sens musical. La hauteur, elle, n'en a aucun : ce n'est qu'une conséquence de
 * l'échelle, et la laisser commander revenait à demander un zoom en centimètres.
 *
 * Le renversement compte pour l'usage visé : une bande dont la hauteur découle du zoom est
 * aussi courte que la tablature l'exige, et pas un pixel de plus. C'est exactement ce qu'on
 * veut d'une incrustation, qui doit manger le moins possible de l'image en dessous.
 *
 * Reste un garde-fou. Demander deux mesures sur une partition qui affiche portée *et*
 * tablature donnerait une bande plus haute que l'écran ; au-delà d'un plafond, c'est donc
 * l'échelle qui cède, et on voit alors plus de mesures que demandé. Mieux vaut une promesse
 * tenue de travers qu'une image qui déborde.
 */

export interface DemandeEchelle {
  /** Largeur disponible à l'image, en pixels de vidéo. */
  largeurZone: number
  /** Hauteur à ne pas dépasser, en pixels de vidéo. */
  hauteurMaxBande: number
  /** Largeur d'une mesure dans le repère de la partition, ou 0 si on ne la connaît pas. */
  largeurMesure: number
  mesuresVisibles: number
  /**
   * Air laissé au-dessus et en dessous de la tablature, en fraction de sa hauteur.
   *
   * À ne pas confondre avec la marge du recadrage, qui est une contrainte technique — ne pas
   * couper les hampes ni les indications de rythme. Celle-ci est un choix de mise en page :
   * une tablature collée au bord de sa bande étouffe, et sur une incrustation elle se confond
   * avec ce qui passe derrière.
   */
  margeRelative: number
  /** La partition rendue, dans son propre repère. */
  feuille: { largeur: number; hauteur: number }
}

export interface Echelle {
  echelle: number
  /** Hauteur totale de la bande, air compris. */
  hauteurBande: number
  /** Air au-dessus de la tablature, en pixels de vidéo — et autant en dessous. */
  marge: number
  /** Mesures réellement visibles — plus que demandé si le plafond a joué. */
  mesuresVisibles: number
}

export function echelleDefilement(d: DemandeEchelle): Echelle {
  const hauteurFeuille = Math.max(1, d.feuille.hauteur)
  // L'air compte dans le plafond : sinon, en demander beaucoup ferait déborder une bande qui
  // se croyait dans les clous.
  const facteur = 1 + 2 * Math.max(0, d.margeRelative)
  const plafond = Math.max(1, d.hauteurMaxBande) / (hauteurFeuille * facteur)

  // Sans largeur de mesure connue — une partition vide, un découpage pas encore fait — on
  // retombe sur le plafond, ce qui donne la plus grande bande permise plutôt que rien.
  const voulue =
    d.largeurMesure > 0 && d.mesuresVisibles > 0
      ? d.largeurZone / (d.mesuresVisibles * d.largeurMesure)
      : plafond

  const echelle = Math.max(0.01, Math.min(voulue, plafond))
  const mesuresVisibles =
    d.largeurMesure > 0 ? d.largeurZone / (echelle * d.largeurMesure) : d.mesuresVisibles

  const hauteurTablature = hauteurFeuille * echelle
  const marge = Math.round(hauteurTablature * Math.max(0, d.margeRelative))

  return {
    echelle,
    hauteurBande: Math.max(24, Math.round(hauteurTablature) + 2 * marge),
    marge,
    mesuresVisibles,
  }
}

/**
 * La largeur d'une mesure, prise à la médiane.
 *
 * Une moyenne serait trompeuse : la première mesure d'un système porte la clef, l'armure et
 * l'accordage, et se retrouve deux fois plus large que les autres. Elle tirerait la moyenne
 * vers le haut et toutes les autres mesures paraîtraient trop petites. La médiane l'ignore,
 * comme elle ignore la dernière mesure à moitié vide.
 */
export function largeurMedianeDeMesure(largeurs: number[]): number {
  const utiles = largeurs.filter((l) => Number.isFinite(l) && l > 0).sort((a, b) => a - b)
  if (utiles.length === 0) return 0
  const milieu = utiles.length >> 1
  return utiles.length % 2 === 1 ? utiles[milieu] : (utiles[milieu - 1] + utiles[milieu]) / 2
}
