import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import { largeurMedianeDeMesure } from './echelle'
import type { Etape } from './minutage'
import { positionA } from './minutage'
import type { Curseur, Feuille, Tuile } from './scene'
import { bornesHorizontales, detecterSystemes, profilEncre } from './systemes'
import { hexVersRgb } from './themes'
import type { SystemePdf } from './types'

/**
 * Le pont avec pdf.js.
 *
 * Un PDF de tablature est une image : il sait dessiner des cordes et des chiffres, il ne
 * sait rien de la musique. Tout ce qu'on peut en tirer, c'est *où* sont les lignes — et
 * c'est déjà beaucoup, parce que c'est la moitié du travail. L'autre moitié, le temps,
 * vient du tempo que l'utilisateur déclare dans l'atelier.
 */

// Le worker est servi par l'application elle-même, jamais par un CDN : sans cela, ouvrir
// une partition demanderait une connexion Internet à une instance qui tourne sur un NAS.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Au-delà, on ne gagne plus en netteté sur une vidéo 1080p, on ne gagne que de la RAM perdue. */
const LARGEUR_MAX = 2000

export interface PageRendue {
  index: number
  canvas: HTMLCanvasElement
  largeur: number
  hauteur: number
}

export interface Placement {
  x: number
  y: number
  w: number
  h: number
}

export async function rendrePdf(octets: ArrayBuffer, largeurCible: number): Promise<PageRendue[]> {
  const tache = pdfjs.getDocument({ data: new Uint8Array(octets) })
  const document = await tache.promise
  const pages: PageRendue[] = []

  try {
    for (let numero = 1; numero <= document.numPages; numero++) {
      const page = await document.getPage(numero)
      const naturelle = page.getViewport({ scale: 1 })
      const echelle = Math.min(LARGEUR_MAX, largeurCible) / naturelle.width
      const vue = page.getViewport({ scale: echelle })

      const canvas = window.document.createElement('canvas')
      canvas.width = Math.round(vue.width)
      canvas.height = Math.round(vue.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Impossible de préparer le rendu de la page.')
      // Le fond blanc est posé à la main : un PDF au fond transparent laisserait voir le
      // noir de la scène à travers la portée.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport: vue }).promise
      page.cleanup()

      pages.push({ index: numero - 1, canvas, largeur: canvas.width, hauteur: canvas.height })
    }
  } finally {
    // La tâche de chargement emporte le worker avec elle : sans ce congé, chaque
    // ouverture de PDF en laisserait un derrière elle.
    await tache.destroy()
  }

  return pages
}

/** Les pages empilées, comme on les lirait en faisant défiler un écran. */
export function feuilleDepuisPages(
  pages: PageRendue[],
  ecart = 24,
): { feuille: Feuille; placements: Placement[] } {
  const largeur = Math.max(1, ...pages.map((p) => p.largeur))
  const placements: Placement[] = []
  let y = 0

  for (const page of pages) {
    // Les pages d'un même document n'ont pas toujours la même taille (une page de titre en
    // portrait, des systèmes en paysage) : on les centre plutôt que de les caler à gauche.
    const x = (largeur - page.largeur) / 2
    placements.push({ x, y, w: page.largeur, h: page.hauteur })
    y += page.hauteur + ecart
  }

  return {
    feuille: {
      largeur,
      hauteur: Math.max(0, y - ecart),
      tuiles: pages.map((page, i) => ({
        x: placements[i].x,
        y: placements[i].y,
        w: page.largeur,
        h: page.hauteur,
        source: page.canvas,
      })),
    },
    placements,
  }
}

/**
 * La proposition de découpage : une passe de détection par page.
 *
 * Le résultat n'a pas vocation à être juste du premier coup, mais à être corrigeable — les
 * systèmes reviennent dans l'atelier sous forme de rectangles qu'on déplace, ajoute ou
 * supprime. C'est pourquoi on préfère ici proposer un peu trop que pas assez.
 */
export function detecterDansPages(pages: PageRendue[], mesuresParDefaut: number): SystemePdf[] {
  const systemes: SystemePdf[] = []

  for (const page of pages) {
    const ctx = page.canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) continue
    const image = ctx.getImageData(0, 0, page.largeur, page.hauteur)
    const profil = profilEncre(image.data, page.largeur, page.hauteur)

    for (const bande of detecterSystemes(profil)) {
      const { x0, x1 } = bornesHorizontales(image.data, page.largeur, page.hauteur, bande)
      systemes.push({
        page: page.index,
        x0,
        x1,
        y0: bande.y0,
        y1: bande.y1,
        mesures: mesuresParDefaut,
      })
    }
  }

  return systemes
}

/** Le morceau de bande qu'occupe un système, une fois tous les systèmes mis bout à bout. */
export interface Segment {
  x: number
  w: number
}

/**
 * Les systèmes découpés dans les pages et recollés en une seule bande horizontale.
 *
 * C'est ce qui permet à un PDF — qui n'est qu'une image de partition en colonnes — de défiler
 * comme une tablature continue sous une tête de lecture fixe. Chaque tuile ne prend qu'un
 * rectangle de sa page, celui que le découpage a désigné, et les rectangles sont posés côte à
 * côte dans l'ordre de lecture.
 *
 * Les systèmes n'ont pas tous la même hauteur (une ligne qui porte des indications de rythme
 * déborde plus qu'une autre). Ils sont donc centrés sur la hauteur du plus grand plutôt que
 * mis à une hauteur commune : les étirer déformerait les chiffres d'une ligne sur deux.
 */
export function bandeDepuisSystemes(
  pages: PageRendue[],
  systemes: SystemePdf[],
  options: { encre?: string | null; mesuresParDefaut?: number } = {},
): { feuille: Feuille; segments: Segment[] } {
  const morceaux = systemes
    .map((systeme) => {
      const page = pages[systeme.page]
      if (!page) return null
      const rect = {
        x: systeme.x0 * page.largeur,
        y: systeme.y0 * page.hauteur,
        w: Math.max(1, (systeme.x1 - systeme.x0) * page.largeur),
        h: Math.max(1, (systeme.y1 - systeme.y0) * page.hauteur),
      }
      const mesures = systeme.mesures > 0 ? systeme.mesures : (options.mesuresParDefaut ?? 4)
      return { rect, mesures, canvas: decouper(page, rect, options.encre ?? null) }
    })
    .filter((m): m is NonNullable<typeof m> => m !== null)

  if (morceaux.length === 0) return { feuille: { largeur: 0, hauteur: 0, tuiles: [] }, segments: [] }

  const hauteur = Math.max(...morceaux.map((m) => m.rect.h))
  // Un blanc entre deux lignes : sans lui, la fin d'un système et le début du suivant se
  // touchent, et la colonne de clef qui ouvre chaque ligne semble tomber au milieu d'une
  // mesure. Pour l'enlever, il suffit de resserrer les rectangles dans l'éditeur.
  const ecart = Math.round(hauteur * 0.28)

  const tuiles: Tuile[] = []
  const segments: Segment[] = []
  let curseur = 0

  for (const morceau of morceaux) {
    tuiles.push({
      x: curseur,
      y: (hauteur - morceau.rect.h) / 2,
      w: morceau.rect.w,
      h: morceau.rect.h,
      source: morceau.canvas,
    })
    segments.push({ x: curseur, w: morceau.rect.w })
    curseur += morceau.rect.w + ecart
  }

  /* La largeur d'une mesure ne se mesure pas sur l'image : rien dans un PDF ne dit où sont les
     barres de mesure. On la déduit donc de ce que l'utilisateur a déclaré — tel système porte
     tant de mesures — en prenant la médiane, parce qu'un système à moitié vide en fin de
     morceau donnerait sinon des mesures deux fois trop larges à tout le reste. */
  const largeurMesure = largeurMedianeDeMesure(morceaux.map((m) => m.rect.w / m.mesures))

  return {
    feuille: { largeur: Math.max(0, curseur - ecart), hauteur, tuiles, largeurMesure },
    segments,
  }
}

/* Découper coûte une recopie de pixels, et détourer une passe de plus. Déplacer un rectangle
   dans l'éditeur redemande la bande à chaque mouvement de souris : sans ce cache, on
   repasserait sur *tous* les systèmes à chaque pixel parcouru, alors qu'un seul a bougé. */
const DECOUPES = new Map<string, HTMLCanvasElement>()
const DECOUPES_MAX = 64

function decouper(
  page: PageRendue,
  rect: { x: number; y: number; w: number; h: number },
  encre: string | null,
): HTMLCanvasElement {
  const clef = [
    page.index,
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.w),
    Math.round(rect.h),
    page.largeur,
    encre ?? 'brut',
  ].join('|')
  const connu = DECOUPES.get(clef)
  if (connu) return connu

  const cible = document.createElement('canvas')
  cible.width = Math.max(1, Math.round(rect.w))
  cible.height = Math.max(1, Math.round(rect.h))
  const ctx = cible.getContext('2d', { willReadFrequently: Boolean(encre) })!
  ctx.drawImage(page.canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, cible.width, cible.height)

  if (encre) detourerLEncre(ctx, cible.width, cible.height, encre)

  if (DECOUPES.size >= DECOUPES_MAX) {
    const plusAncienne = DECOUPES.keys().next().value
    if (plusAncienne !== undefined) DECOUPES.delete(plusAncienne)
  }
  DECOUPES.set(clef, cible)
  return cible
}

/**
 * L'encre extraite du papier.
 *
 * Chaque pixel garde sa *noirceur* comme opacité et prend la couleur du thème : le blanc de
 * la page devient transparent, le noir des traits devient opaque, et les gris de
 * l'anticrénelage gardent leur demi-teinte — ce qui donne des bords lisses au lieu d'un
 * escalier.
 *
 * On aurait pu se contenter d'inverser l'image, ce qui est une ligne de CSS. Mais une
 * inversion rend le papier **noir et opaque** : posée sur une vidéo de reprise, la tablature
 * arriverait dans un rectangle noir qui cacherait l'image. Ici, il ne reste que les traits.
 */
function detourerLEncre(
  ctx: CanvasRenderingContext2D,
  largeur: number,
  hauteur: number,
  encre: string,
): void {
  const { r, g, b } = hexVersRgb(encre)
  const image = ctx.getImageData(0, 0, largeur, hauteur)
  const pixels = image.data
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000
    pixels[i] = r
    pixels[i + 1] = g
    pixels[i + 2] = b
    pixels[i + 3] = 255 - luminance
  }
  ctx.putImageData(image, 0, 0)
}

/** Le curseur sur la bande : la tête de lecture traverse chaque système de gauche à droite. */
export function curseurBande(
  etapes: Etape[],
  segments: Segment[],
  hauteur: number,
): (tMs: number) => Curseur | null {
  return (tMs: number) => {
    const { index, progression } = positionA(etapes, tMs)
    const segment = segments[index]
    if (index < 0 || !segment) return null
    return { x: segment.x + segment.w * progression, y: 0, h: hauteur }
  }
}

/**
 * L'ordre de lecture n'est jamais demandé à personne : les systèmes se trient de haut en
 * bas, page après page, c'est-à-dire exactement comme on lit une partition.
 */
export function trierSystemes(systemes: SystemePdf[]): SystemePdf[] {
  return [...systemes].sort((a, b) => a.page - b.page || a.y0 - b.y0 || a.x0 - b.x0)
}

/** Le curseur d'un PDF : dans la bonne ligne, à la bonne fraction de cette ligne. */
export function curseurPdf(
  systemes: SystemePdf[],
  etapes: Etape[],
  placements: Placement[],
): (tMs: number) => Curseur | null {
  return (tMs: number) => {
    const { index, progression } = positionA(etapes, tMs)
    if (index < 0) return null
    const systeme = systemes[index]
    const placement = placements[systeme?.page ?? 0]
    if (!systeme || !placement) return null

    const gauche = placement.x + systeme.x0 * placement.w
    const droite = placement.x + systeme.x1 * placement.w
    return {
      x: gauche + (droite - gauche) * progression,
      y: placement.y + systeme.y0 * placement.h,
      h: Math.max(4, (systeme.y1 - systeme.y0) * placement.h),
      ligne: { x0: gauche, x1: droite },
    }
  }
}
