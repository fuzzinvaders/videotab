import { formaterDuree } from './minutage'
import type { ReglagesVideo } from './types'

/**
 * La scène : ce qu'on voit, image par image.
 *
 * Guitar Pro et PDF ne se ressemblent en rien avant d'arriver ici — l'un connaît ses
 * notes, l'autre est une photographie de papier. Mais une fois la partition rendue, les
 * deux se réduisent au même objet : une grande image verticale, et un rectangle qui se
 * déplace dessus au fil du temps. Tout ce qui suit ne connaît que ça, ce qui fait que
 * l'aperçu à l'écran et la vidéo exportée sont dessinés par le même code — et donc que
 * ce qu'on voit est bien ce qu'on obtient.
 */

export interface Tuile {
  x: number
  y: number
  w: number
  h: number
  source: CanvasImageSource
}

/** La partition entière, en morceaux, dans son propre repère en pixels. */
export interface Feuille {
  largeur: number
  hauteur: number
  tuiles: Tuile[]
}

export interface Curseur {
  /** Position du trait vif : là où la musique en est exactement. */
  x: number
  y: number
  h: number
  /** Le temps en cours, surligné derrière le trait (Guitar Pro, qui sait où il est). */
  bloc?: { x: number; w: number }
  /** La ligne en cours : le curseur y laisse une traînée (PDF, qui ne sait que ça). */
  ligne?: { x0: number; x1: number }
}

export interface Scene {
  largeur: number
  hauteur: number
  dureeMs: number
  /** Remet le défilement à sa place : à appeler avant de relire depuis un autre endroit. */
  reinitialiser(tMs?: number): void
  dessiner(ctx: CanvasRenderingContext2D, tMs: number): void
}

export interface OptionsScene {
  feuille: Feuille
  video: ReglagesVideo
  dureeMs: number
  titre: string
  artiste: string
  /** Le curseur à l'instant demandé, ou null s'il n'y a rien à montrer (décompte). */
  curseurA: (tMs: number) => Curseur | null
  /** Vrai pour un PDF : le curseur laisse une traînée dans la ligne en cours. */
  trainee?: boolean
}

const FOND = '#0f172a'
const PAPIER = '#ffffff'
const DUREE_FONDU_MS = 500

export function creerScene(options: OptionsScene): Scene {
  const { feuille, video, titre, artiste } = options
  const { largeur, hauteur } = video
  const compteAvantMs = Math.max(0, video.compteAvantSec) * 1000

  const marge = Math.round(largeur * 0.03)
  const bandeauH = titre || artiste ? Math.round(hauteur * 0.09) : 0
  const barreH = Math.round(hauteur * 0.012)
  const zone = {
    x: marge,
    y: bandeauH + marge / 2,
    w: largeur - marge * 2,
    h: hauteur - bandeauH - marge - barreH * 2,
  }
  // La partition est toujours mise à la largeur : une tablature se lit ligne par ligne, et
  // la rogner sur les côtés reviendrait à couper des mesures.
  const echelle = feuille.largeur > 0 ? zone.w / feuille.largeur : 1
  const hauteurRendue = feuille.hauteur * echelle
  const scrollMax = Math.max(0, hauteurRendue - zone.h)

  // Le défilement est lissé d'une image à l'autre plutôt que recalculé à chaque fois : le
  // curseur saute d'une ligne à la suivante d'un coup, et si l'image suivait ce saut, la
  // vidéo donnerait le mal de mer. On garde donc un état, et c'est pour lui que la scène a
  // besoin d'être réinitialisée quand on déplace la lecture à la main.
  let scroll = 0
  let derniereImageMs = 0

  function scrollVoulu(curseur: Curseur | null): number {
    if (!curseur || scrollMax === 0) return 0
    const centre = (curseur.y + curseur.h / 2) * echelle
    return Math.min(scrollMax, Math.max(0, centre - zone.h / 2))
  }

  function reinitialiser(tMs = 0) {
    derniereImageMs = tMs
    scroll = scrollVoulu(options.curseurA(tMs))
  }

  function dessiner(ctx: CanvasRenderingContext2D, tMs: number) {
    const curseur = options.curseurA(tMs)

    // Poursuite exponentielle : la vitesse est proportionnelle à ce qui reste à parcourir,
    // ce qui donne un départ franc et une arrivée douce sans avoir à gérer d'animation.
    const dt = Math.max(0, Math.min(250, tMs - derniereImageMs))
    derniereImageMs = tMs
    const cible = scrollVoulu(curseur)
    scroll += (cible - scroll) * (1 - Math.exp(-dt / 160))

    ctx.save()
    ctx.fillStyle = FOND
    ctx.fillRect(0, 0, largeur, hauteur)

    // Le papier : un fond blanc sous la partition. alphaTab dessine en noir sur du vide et
    // un PDF sur du blanc — sans cette plaque, l'un serait illisible sur le fond sombre.
    ctx.fillStyle = PAPIER
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h)

    ctx.beginPath()
    ctx.rect(zone.x, zone.y, zone.w, zone.h)
    ctx.clip()

    ctx.translate(zone.x, zone.y - scroll)
    ctx.scale(echelle, echelle)

    const hautVisible = scroll / echelle
    const basVisible = (scroll + zone.h) / echelle
    for (const tuile of feuille.tuiles) {
      // Une partition de cinq pages, c'est une cinquantaine de tuiles dont deux sont à
      // l'écran : les redessiner toutes ferait chuter la cadence de l'export.
      if (tuile.y + tuile.h < hautVisible || tuile.y > basVisible) continue
      ctx.drawImage(tuile.source, tuile.x, tuile.y, tuile.w, tuile.h)
    }

    if (curseur) dessinerCurseur(ctx, curseur, video, Boolean(options.trainee))
    ctx.restore()

    if (bandeauH > 0) dessinerBandeau(ctx, { largeur, bandeauH, marge, titre, artiste, tMs, video })
    dessinerProgression(ctx, {
      largeur,
      hauteur,
      barreH,
      tMs,
      dureeMs: options.dureeMs,
      couleur: video.couleur,
    })

    if (compteAvantMs > 0 && tMs < compteAvantMs) {
      dessinerDecompte(ctx, { largeur, hauteur, restantMs: compteAvantMs - tMs, video })
    }

    if (video.fondu) {
      const entree = Math.min(1, Math.max(0, tMs / DUREE_FONDU_MS))
      const sortie = Math.min(1, Math.max(0, (options.dureeMs - tMs) / DUREE_FONDU_MS))
      const voile = 1 - Math.min(entree, sortie)
      if (voile > 0.001) {
        ctx.save()
        ctx.globalAlpha = voile
        ctx.fillStyle = '#000000'
        ctx.fillRect(0, 0, largeur, hauteur)
        ctx.restore()
      }
    }
  }

  return { largeur, hauteur, dureeMs: options.dureeMs, reinitialiser, dessiner }
}

function dessinerCurseur(
  ctx: CanvasRenderingContext2D,
  curseur: Curseur,
  video: ReglagesVideo,
  trainee: boolean,
) {
  ctx.save()
  ctx.fillStyle = video.couleur
  if (trainee && curseur.ligne) {
    // Sur un PDF, on ne sait pas où sont les notes : surligner « le temps en cours » serait
    // un mensonge. La traînée ne dit que ce qu'on sait — on en est là dans la ligne.
    ctx.globalAlpha = video.opacite * 0.45
    ctx.fillRect(curseur.ligne.x0, curseur.y, curseur.x - curseur.ligne.x0, curseur.h)
  } else if (curseur.bloc) {
    ctx.globalAlpha = video.opacite
    ctx.fillRect(curseur.bloc.x, curseur.y, Math.max(curseur.bloc.w, 2), curseur.h)
  }

  /* Le trait vif : c'est lui qu'on suit des yeux, le surlignage ne fait que le situer.
     Son épaisseur est prise sur la hauteur du système plutôt que fixée en pixels — on
     dessine ici dans le repère de la partition, que la scène met ensuite à l'échelle, et
     un trait de trois pixels finirait invisible sur une partition très large. */
  const epaisseur = Math.max(2, curseur.h * 0.035)
  ctx.globalAlpha = 1
  ctx.fillRect(curseur.x - epaisseur / 2, curseur.y, epaisseur, curseur.h)
  ctx.restore()
}

function dessinerBandeau(
  ctx: CanvasRenderingContext2D,
  o: {
    largeur: number
    bandeauH: number
    marge: number
    titre: string
    artiste: string
    tMs: number
    video: ReglagesVideo
  },
) {
  const taille = Math.round(o.bandeauH * 0.38)
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#f8fafc'
  ctx.font = `600 ${taille}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.fillText(o.titre, o.marge, o.bandeauH * 0.42)
  if (o.artiste) {
    ctx.fillStyle = '#94a3b8'
    ctx.font = `${Math.round(taille * 0.62)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
    ctx.fillText(o.artiste, o.marge, o.bandeauH * 0.78)
  }
  ctx.restore()
}

function dessinerProgression(
  ctx: CanvasRenderingContext2D,
  o: { largeur: number; hauteur: number; barreH: number; tMs: number; dureeMs: number; couleur: string },
) {
  const y = o.hauteur - o.barreH
  const part = o.dureeMs > 0 ? Math.min(1, Math.max(0, o.tMs / o.dureeMs)) : 0
  ctx.save()
  ctx.fillStyle = '#1e293b'
  ctx.fillRect(0, y, o.largeur, o.barreH)
  ctx.fillStyle = o.couleur
  ctx.fillRect(0, y, o.largeur * part, o.barreH)

  // Le temps écoulé, posé juste au-dessus de la barre : c'est ce qu'on cherche quand on
  // revient sur une vidéo pour retravailler un passage.
  const taille = Math.round(o.hauteur * 0.022)
  ctx.font = `${taille}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.fillStyle = '#64748b'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText(`${formaterDuree(o.tMs)} / ${formaterDuree(o.dureeMs)}`, o.largeur - taille, y - taille * 0.4)
  ctx.restore()
}

function dessinerDecompte(
  ctx: CanvasRenderingContext2D,
  o: { largeur: number; hauteur: number; restantMs: number; video: ReglagesVideo },
) {
  const secondes = Math.ceil(o.restantMs / 1000)
  // Le chiffre grossit et s'efface sur la dernière demi-seconde de chaque temps : on le
  // voit venir du coin de l'œil sans avoir à le lire.
  const part = (o.restantMs % 1000) / 1000
  const taille = Math.round(o.hauteur * 0.28 * (1.15 - part * 0.15))
  ctx.save()
  ctx.globalAlpha = 0.25 + part * 0.5
  ctx.fillStyle = o.video.couleur
  ctx.font = `700 ${taille}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(secondes), o.largeur / 2, o.hauteur / 2)
  ctx.restore()
}
