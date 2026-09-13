import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'
import type { Etape } from './minutage'
import { positionA } from './minutage'
import type { Curseur, Feuille } from './scene'
import { bornesHorizontales, detecterSystemes, profilEncre } from './systemes'
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
