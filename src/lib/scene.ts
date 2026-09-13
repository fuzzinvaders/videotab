import { formaterDuree } from './minutage'
import { themeParId, type Theme } from './themes'
import type { ReglagesVideo } from './types'

/**
 * La scène : ce qu'on voit, image par image.
 *
 * Guitar Pro et PDF ne se ressemblent en rien avant d'arriver ici — l'un connaît ses notes,
 * l'autre est une photographie de papier. Mais une fois la partition rendue, les deux se
 * réduisent au même objet : une image, et un rectangle qui s'y déplace au fil du temps. Tout
 * ce qui suit ne connaît que ça, ce qui fait que l'aperçu à l'écran et la vidéo exportée sont
 * dessinés par le même code — et donc que ce qu'on voit est bien ce qu'on obtient.
 *
 * Deux dispositions, et c'est la seule vraie bifurcation du fichier :
 *
 *  - **page** : la partition est mise à la largeur et défile verticalement, le curseur
 *    parcourt chaque ligne. C'est la lecture d'une partition, pour travailler un morceau.
 *  - **défilement** : la partition est une seule bande horizontale qui glisse sous une tête
 *    de lecture fixe. C'est la lecture d'un instrument : le regard ne bouge plus, il attend
 *    que la musique arrive. C'est aussi la seule qui tienne dans un bandeau incrusté au bas
 *    d'une vidéo de reprise.
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
  /** Vrai si le fond doit rester transparent : l'enregistreur doit le savoir. */
  transparente: boolean
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
  /** Vrai pour un PDF en mode page : le curseur laisse une traînée dans la ligne en cours. */
  trainee?: boolean
  /**
   * Plaque sous la partition, quand le thème ne décide pas seul. Un PDF lu en mode page est
   * une image de papier : il lui faut son papier, même sur un thème qui n'en veut pas.
   */
  papier?: string | null
}

const DUREE_FONDU_MS = 500
/* Le vert des incrustations, celui qu'attendent les logiciels de montage. Pas le vert le plus
   vif possible : celui-là bave sur les bords des chiffres au moment du détourage. */
const CHROMA = '#00b140'

export function creerScene(options: OptionsScene): Scene {
  const { feuille, video, titre, artiste } = options
  const theme = themeParId(video.theme)
  const papier = options.papier !== undefined ? options.papier : theme.papier
  const { largeur, hauteur } = video
  const compteAvantMs = Math.max(0, video.compteAvantSec) * 1000
  const defilement = video.disposition === 'defilement'

  const marge = Math.round(largeur * 0.03)
  const bandeauH = video.bandeau && (titre || artiste) ? Math.round(hauteur * 0.09) : 0
  const barreH = video.barreDeProgression ? Math.max(3, Math.round(hauteur * 0.012)) : 0

  /* La zone est la fenêtre par laquelle on regarde la partition. En page elle occupe tout ce
     qui reste entre le bandeau et la barre ; en défilement elle traverse l'image de bord à
     bord, sur la hauteur qu'on lui a donnée, et le reste de l'image est laissé libre — c'est
     là qu'on posera la vidéo de reprise. */
  const zone = defilement
    ? (() => {
        const h = Math.max(40, Math.round(hauteur * video.hauteurBande))
        const libre = hauteur - bandeauH - barreH
        return { x: 0, y: bandeauH + Math.round((libre - h) / 2), w: largeur, h }
      })()
    : {
        x: marge,
        y: bandeauH + Math.round(marge / 2),
        w: largeur - marge * 2,
        h: hauteur - bandeauH - marge - barreH * 2,
      }

  // En page, la partition est toujours mise à la largeur : une tablature se lit ligne par
  // ligne, et la rogner sur les côtés reviendrait à couper des mesures. En défilement, c'est
  // la hauteur de la bande qui commande — la largeur, elle, est infinie par construction.
  const echelle = defilement
    ? feuille.hauteur > 0
      ? zone.h / feuille.hauteur
      : 1
    : feuille.largeur > 0
      ? zone.w / feuille.largeur
      : 1

  const scrollMax = Math.max(0, feuille.hauteur * echelle - zone.h)
  const teteX = Math.round(zone.w * video.teteX)

  /* En page, le défilement est lissé d'une image à l'autre : le curseur saute d'une ligne à
     la suivante d'un coup, et une image qui suivrait ce saut donnerait le mal de mer. En
     défilement, au contraire, la position est prise telle quelle — elle est déjà continue,
     et la lisser ne ferait qu'ajouter un retard entre le son et l'image. */
  let scroll = 0
  let derniereImageMs = 0

  // La bande est composée à part puis posée d'un bloc : c'est ce qui permet d'en effacer les
  // deux bouts en dégradé sans effacer du même coup ce qu'il y a derrière.
  const couche = document.createElement('canvas')
  couche.width = Math.max(1, zone.w)
  couche.height = Math.max(1, zone.h)
  const couche2d = couche.getContext('2d')

  function positionVoulue(curseur: Curseur | null): number {
    if (!curseur) return 0
    if (defilement) return curseur.x * echelle - teteX
    if (scrollMax === 0) return 0
    const centre = (curseur.y + curseur.h / 2) * echelle
    return Math.min(scrollMax, Math.max(0, centre - zone.h / 2))
  }

  function reinitialiser(tMs = 0) {
    derniereImageMs = tMs
    scroll = positionVoulue(options.curseurA(tMs))
  }

  function dessiner(ctx: CanvasRenderingContext2D, tMs: number) {
    const curseur = options.curseurA(tMs)
    const cible = positionVoulue(curseur)

    if (defilement) {
      scroll = cible
    } else {
      // Poursuite exponentielle : la vitesse est proportionnelle à ce qui reste à parcourir,
      // ce qui donne un départ franc et une arrivée douce sans avoir à gérer d'animation.
      const dt = Math.max(0, Math.min(250, tMs - derniereImageMs))
      scroll += (cible - scroll) * (1 - Math.exp(-dt / 160))
    }
    derniereImageMs = tMs

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, largeur, hauteur)
    if (video.fond === 'theme') {
      ctx.fillStyle = theme.fond
      ctx.fillRect(0, 0, largeur, hauteur)
    } else if (video.fond === 'chroma') {
      ctx.fillStyle = CHROMA
      ctx.fillRect(0, 0, largeur, hauteur)
    }

    if (couche2d) {
      composerLaBande(couche2d, { curseur, scroll })
      dessinerCadreDerriere(ctx, { zone, video, theme })
      ctx.drawImage(couche, zone.x, zone.y)
      dessinerCadreDevant(ctx, { zone, video, theme, largeur, hauteur })
    }

    if (bandeauH > 0) {
      dessinerBandeau(ctx, { bandeauH, marge, titre, artiste, theme })
    }
    if (barreH > 0) {
      dessinerProgression(ctx, {
        largeur,
        hauteur,
        barreH,
        tMs,
        dureeMs: options.dureeMs,
        couleur: video.couleur,
        theme,
      })
    }

    if (compteAvantMs > 0 && tMs < compteAvantMs) {
      dessinerDecompte(ctx, {
        x: defilement ? zone.x + teteX : largeur / 2,
        y: hauteur / 2,
        taille: Math.round(hauteur * (defilement ? 0.2 : 0.28)),
        restantMs: compteAvantMs - tMs,
        couleur: video.couleur,
      })
    }

    if (video.fondu) {
      const entree = Math.min(1, Math.max(0, tMs / DUREE_FONDU_MS))
      const sortie = Math.min(1, Math.max(0, (options.dureeMs - tMs) / DUREE_FONDU_MS))
      const voile = 1 - Math.min(entree, sortie)
      if (voile > 0.001) {
        // Sur un fond transparent, un voile noir ne ferait pas disparaître l'image : il la
        // remplacerait par un rectangle noir dans la vidéo de reprise. On efface donc, au
        // lieu de couvrir — le fondu est alors un fondu vers ce qu'il y a derrière.
        ctx.globalCompositeOperation = video.fond === 'transparent' ? 'destination-out' : 'source-over'
        ctx.globalAlpha = voile
        ctx.fillStyle = video.fond === 'transparent' ? '#000000' : '#000000'
        ctx.fillRect(0, 0, largeur, hauteur)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()
  }

  /** La bande elle-même : la plaque, la partition, le curseur, et l'effacement des bords. */
  function composerLaBande(c: CanvasRenderingContext2D, etat: { curseur: Curseur | null; scroll: number }) {
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.clearRect(0, 0, zone.w, zone.h)

    c.save()
    if (video.cadre === 'carte' || video.cadre === 'lueur') {
      const rayon = Math.min(zone.h * 0.12, 28)
      c.beginPath()
      c.roundRect(0, 0, zone.w, zone.h, rayon)
      c.clip()
    }

    if (papier) {
      c.fillStyle = papier
      c.fillRect(0, 0, zone.w, zone.h)
    } else if (video.cadre === 'bandes') {
      // Une bande translucide sous la partition : sur une vidéo de reprise, elle décolle les
      // chiffres de l'image sans l'effacer.
      c.fillStyle = 'rgba(0, 0, 0, 0.45)'
      c.fillRect(0, 0, zone.w, zone.h)
    }

    c.save()
    if (defilement) c.translate(-etat.scroll, 0)
    else c.translate(0, -etat.scroll)
    c.scale(echelle, echelle)

    const debutVisible = defilement ? etat.scroll / echelle : 0
    const finVisible = defilement ? (etat.scroll + zone.w) / echelle : 0
    const hautVisible = defilement ? 0 : etat.scroll / echelle
    const basVisible = defilement ? 0 : (etat.scroll + zone.h) / echelle

    for (const tuile of feuille.tuiles) {
      // Une partition de cinq pages, c'est une cinquantaine de tuiles dont deux sont à
      // l'écran : les redessiner toutes ferait chuter la cadence de l'export.
      if (defilement) {
        if (tuile.x + tuile.w < debutVisible || tuile.x > finVisible) continue
      } else if (tuile.y + tuile.h < hautVisible || tuile.y > basVisible) continue

      c.drawImage(tuile.source, tuile.x, tuile.y, tuile.w, tuile.h)
    }

    if (etat.curseur) dessinerCurseur(c, etat.curseur, video, Boolean(options.trainee))
    c.restore()

    if (defilement) effacerLesBords(c, zone.w, zone.h)
    c.restore()
  }

  return {
    largeur,
    hauteur,
    dureeMs: options.dureeMs,
    transparente: video.fond === 'transparent',
    reinitialiser,
    dessiner,
  }
}

/* Les deux bouts de la bande s'effacent en dégradé plutôt que d'être coupés net. Une mesure
   qui apparaît d'un coup au bord de l'image attire l'œil au mauvais moment ; une mesure qui
   se lève doucement se laisse oublier jusqu'à ce qu'elle arrive. */
function effacerLesBords(c: CanvasRenderingContext2D, w: number, h: number) {
  const fondu = Math.min(w * 0.12, 220)
  c.save()
  c.globalCompositeOperation = 'destination-out'

  const gauche = c.createLinearGradient(0, 0, fondu, 0)
  gauche.addColorStop(0, 'rgba(0,0,0,1)')
  gauche.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = gauche
  c.fillRect(0, 0, fondu, h)

  const droite = c.createLinearGradient(w - fondu, 0, w, 0)
  droite.addColorStop(0, 'rgba(0,0,0,0)')
  droite.addColorStop(1, 'rgba(0,0,0,1)')
  c.fillStyle = droite
  c.fillRect(w - fondu, 0, fondu, h)

  c.restore()
}

function dessinerCadreDerriere(
  ctx: CanvasRenderingContext2D,
  o: { zone: { x: number; y: number; w: number; h: number }; video: ReglagesVideo; theme: Theme },
) {
  if (o.video.cadre !== 'lueur') return
  const rayon = Math.min(o.zone.h * 0.12, 28)
  ctx.save()
  // Le halo est peint *sous* la bande : dessiné par-dessus, il voilerait les chiffres qu'il
  // est censé mettre en valeur.
  ctx.shadowColor = o.video.couleur
  ctx.shadowBlur = Math.round(o.zone.h * 0.22)
  ctx.fillStyle = o.theme.papier ?? o.theme.fond
  ctx.beginPath()
  ctx.roundRect(o.zone.x, o.zone.y, o.zone.w, o.zone.h, rayon)
  ctx.fill()
  ctx.restore()
}

function dessinerCadreDevant(
  ctx: CanvasRenderingContext2D,
  o: {
    zone: { x: number; y: number; w: number; h: number }
    video: ReglagesVideo
    theme: Theme
    largeur: number
    hauteur: number
  },
) {
  if (o.video.cadre === 'carte' || o.video.cadre === 'lueur') {
    const rayon = Math.min(o.zone.h * 0.12, 28)
    ctx.save()
    ctx.strokeStyle = o.video.cadre === 'lueur' ? o.video.couleur : o.theme.lignes
    ctx.globalAlpha = o.video.cadre === 'lueur' ? 0.8 : 0.5
    ctx.lineWidth = Math.max(2, Math.round(o.hauteur * 0.0025))
    ctx.beginPath()
    ctx.roundRect(o.zone.x, o.zone.y, o.zone.w, o.zone.h, rayon)
    ctx.stroke()
    ctx.restore()
    return
  }

  if (o.video.cadre === 'bandes') {
    ctx.save()
    ctx.fillStyle = o.video.couleur
    ctx.globalAlpha = 0.65
    const trait = Math.max(2, Math.round(o.hauteur * 0.003))
    ctx.fillRect(o.zone.x, o.zone.y - trait, o.zone.w, trait)
    ctx.fillRect(o.zone.x, o.zone.y + o.zone.h, o.zone.w, trait)
    ctx.restore()
    return
  }

  if (o.video.cadre === 'vignette') {
    // Sans fond opaque, la vignette n'a rien à assombrir : elle mangerait la transparence.
    if (o.video.fond === 'transparent') return
    const halo = ctx.createRadialGradient(
      o.largeur / 2,
      o.hauteur / 2,
      Math.min(o.largeur, o.hauteur) * 0.32,
      o.largeur / 2,
      o.hauteur / 2,
      Math.max(o.largeur, o.hauteur) * 0.72,
    )
    halo.addColorStop(0, 'rgba(0,0,0,0)')
    halo.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.save()
    ctx.fillStyle = halo
    ctx.fillRect(0, 0, o.largeur, o.hauteur)
    ctx.restore()
  }
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
  o: { bandeauH: number; marge: number; titre: string; artiste: string; theme: Theme },
) {
  const taille = Math.round(o.bandeauH * 0.38)
  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.fillStyle = o.theme.texte
  ctx.font = `600 ${taille}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.fillText(o.titre, o.marge, o.bandeauH * 0.42)
  if (o.artiste) {
    ctx.fillStyle = o.theme.texteFaible
    ctx.font = `${Math.round(taille * 0.62)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
    ctx.fillText(o.artiste, o.marge, o.bandeauH * 0.78)
  }
  ctx.restore()
}

function dessinerProgression(
  ctx: CanvasRenderingContext2D,
  o: {
    largeur: number
    hauteur: number
    barreH: number
    tMs: number
    dureeMs: number
    couleur: string
    theme: Theme
  },
) {
  const y = o.hauteur - o.barreH
  const part = o.dureeMs > 0 ? Math.min(1, Math.max(0, o.tMs / o.dureeMs)) : 0
  ctx.save()
  ctx.globalAlpha = 0.4
  ctx.fillStyle = o.theme.lignes
  ctx.fillRect(0, y, o.largeur, o.barreH)
  ctx.globalAlpha = 1
  ctx.fillStyle = o.couleur
  ctx.fillRect(0, y, o.largeur * part, o.barreH)

  // Le temps écoulé, posé juste au-dessus de la barre : c'est ce qu'on cherche quand on
  // revient sur une vidéo pour retravailler un passage.
  const taille = Math.round(o.hauteur * 0.022)
  ctx.font = `${taille}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.fillStyle = o.theme.texteFaible
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText(
    `${formaterDuree(o.tMs)} / ${formaterDuree(o.dureeMs)}`,
    o.largeur - taille,
    y - taille * 0.4,
  )
  ctx.restore()
}

function dessinerDecompte(
  ctx: CanvasRenderingContext2D,
  o: { x: number; y: number; taille: number; restantMs: number; couleur: string },
) {
  const secondes = Math.ceil(o.restantMs / 1000)
  // Le chiffre grossit et s'efface sur la dernière demi-seconde de chaque temps : on le voit
  // venir du coin de l'œil sans avoir à le lire.
  const part = (o.restantMs % 1000) / 1000
  const taille = Math.round(o.taille * (1.15 - part * 0.15))
  ctx.save()
  ctx.globalAlpha = 0.25 + part * 0.5
  ctx.fillStyle = o.couleur
  ctx.font = `700 ${taille}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(secondes), o.x, o.y)
  ctx.restore()
}
