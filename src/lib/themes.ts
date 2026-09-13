/**
 * Les thèmes : la même partition, habillée autrement.
 *
 * Un thème décide de trois choses, et il faut les distinguer parce qu'elles ne s'appliquent
 * pas au même moment :
 *
 *  - les couleurs que la **scène** peint elle-même (fond, plaque, bandeau, cadre) ;
 *  - les couleurs qu'**alphaTab** doit employer en dessinant la partition (lignes de portée,
 *    chiffres, barres de mesure) — elles lui sont passées avant le rendu, pas repeintes
 *    après, sinon il faudrait redessiner ce qu'il vient de dessiner ;
 *  - la couleur de chaque **corde**, posée note par note dans le modèle. C'est la lecture
 *    qu'on trouve sur les logiciels d'apprentissage et sur tabs.parnaut.fr : la couleur dit
 *    sur quelle corde jouer, le chiffre dit à quelle case. L'œil trouve la corde avant
 *    d'avoir lu le chiffre, ce qui est exactement ce qu'on veut en jouant.
 *
 * Un PDF ne se laisse rien dire de tout ça : c'est une image finie, noire sur blanc. Pour les
 * thèmes sans papier, `detourerPdf` en extrait l'encre — le blanc de la page devient
 * transparent, le noir des traits prend la couleur du thème, et les gris de l'anticrénelage
 * gardent leur demi-teinte. Ce n'est pas une inversion : une inversion rendrait le papier
 * noir et *opaque*, ce qui interdirait justement l'incrustation.
 */

export interface Theme {
  id: string
  nom: string
  description: string
  /** Fond de l'image, sous tout le reste. */
  fond: string
  /** Plaque posée sous la partition, ou null pour la poser à même le fond. */
  papier: string | null
  /** Glyphes principaux : chiffres de tablature, têtes de notes, hampes. */
  encre: string
  /** Glyphes secondaires : rythmes, nuances, indications. */
  encreFaible: string
  /** Les six lignes de la portée. */
  lignes: string
  /** Barres de mesure et numéros de mesure. */
  barres: string
  texte: string
  texteFaible: string
  /** Couleur proposée pour le curseur quand on choisit le thème. */
  curseur: string
  /**
   * Une couleur par corde, de la plus **grave** à la plus aiguë, ou null si le thème ne
   * colore pas les cordes. L'ordre part du grave parce que c'est le seul qui marche pour une
   * basse comme pour une guitare : sur les deux, la corde du bas est le mi grave.
   */
  cordes: string[] | null
  /** Détourer l'encre d'un PDF — papier transparent, traits repris à la couleur du thème. */
  detourerPdf: boolean
}

export const THEMES: Theme[] = [
  {
    id: 'cordes',
    nom: 'Cordes colorées',
    description: 'Fond sombre, une couleur par corde — la lecture de tabs.parnaut.fr.',
    fond: '#15181d',
    papier: null,
    encre: '#e8ecf2',
    encreFaible: '#9aa4b2',
    lignes: '#5b6472',
    barres: '#7b8492',
    texte: '#f1f5f9',
    texteFaible: '#94a3b8',
    curseur: '#4ade80',
    cordes: ['#e8453c', '#f0c020', '#3b82f6', '#f2872a', '#3fbf4c', '#b45cf0'],
    detourerPdf: true,
  },
  {
    id: 'papier',
    nom: 'Papier',
    description: 'La partition telle qu’on l’imprime, posée sur un fond ardoise.',
    fond: '#0f172a',
    papier: '#ffffff',
    encre: '#000000',
    encreFaible: '#444444',
    lignes: '#000000',
    barres: '#000000',
    texte: '#f8fafc',
    texteFaible: '#94a3b8',
    curseur: '#f59e0b',
    cordes: null,
    detourerPdf: false,
  },
  {
    id: 'ardoise',
    nom: 'Ardoise',
    description: 'Sombre et sobre, sans couleur : la tablature et rien d’autre.',
    fond: '#11151c',
    papier: null,
    encre: '#e2e8f0',
    encreFaible: '#8b97a8',
    lignes: '#4a5568',
    barres: '#64748b',
    texte: '#e2e8f0',
    texteFaible: '#8b97a8',
    curseur: '#f59e0b',
    cordes: null,
    detourerPdf: true,
  },
  {
    id: 'neon',
    nom: 'Néon',
    description: 'Noir profond et couleurs saturées, pour une incrustation qui se voit.',
    fond: '#08060f',
    papier: null,
    encre: '#e9d5ff',
    encreFaible: '#a78bfa',
    lignes: '#4c1d95',
    barres: '#7c3aed',
    texte: '#f5f3ff',
    texteFaible: '#a78bfa',
    curseur: '#f0f',
    cordes: ['#ff3d81', '#ffe066', '#22d3ee', '#ff9e40', '#5ef38c', '#c77dff'],
    detourerPdf: true,
  },
  {
    id: 'craie',
    nom: 'Craie',
    description: 'Bleu nuit et blanc cassé — un tableau noir, en plus doux.',
    fond: '#101b2d',
    papier: null,
    encre: '#f4f1e8',
    encreFaible: '#b9c6d8',
    lignes: '#44618c',
    barres: '#6b83a3',
    texte: '#f4f1e8',
    texteFaible: '#a8b8cc',
    curseur: '#fbbf24',
    cordes: null,
    detourerPdf: true,
  },
]

export const THEME_PAR_DEFAUT = 'cordes'

export function themeParId(id: string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === THEME_PAR_DEFAUT)!
}

/** « #rrggbb » ou « #rgb » vers ses trois composantes. Noir si la chaîne n'a pas de sens. */
export function hexVersRgb(hex: string): { r: number; g: number; b: number } {
  const court = hex.length === 4
  const lire = (i: number) => {
    const morceau = court ? hex[1 + i]?.repeat(2) : hex.slice(1 + i * 2, 3 + i * 2)
    const valeur = Number.parseInt(morceau ?? '', 16)
    return Number.isFinite(valeur) ? valeur : 0
  }
  return { r: lire(0), g: lire(1), b: lire(2) }
}

/**
 * La couleur d'une corde.
 *
 * La numérotation est celle d'alphaTab, et elle mérite d'être citée parce qu'elle est
 * contre-intuitive et que s'en écarter retourne toute la palette :
 *
 *   « 1 is the lowest string on the guitar and the bottom line on the tablature. »
 *
 * Autrement dit la corde 1 est la plus **grave**, celle du bas de la tablature, et le numéro
 * monte vers l'aigu. La palette part donc du grave elle aussi, ce qui a l'avantage de donner
 * au mi grave la même couleur sur une guitare à six cordes et sur une basse à quatre — sur
 * les deux, c'est la corde 1.
 */
export function couleurDeCorde(theme: Theme, numeroDeCorde: number): string | null {
  if (!theme.cordes) return null
  const depuisLeGrave = numeroDeCorde - 1
  if (depuisLeGrave < 0) return null
  // Une guitare sept ou huit cordes déborde de la palette : les cordes aiguës supplémentaires
  // reprennent la dernière couleur, plutôt que de rester sans couleur du tout.
  return theme.cordes[Math.min(depuisLeGrave, theme.cordes.length - 1)]
}
