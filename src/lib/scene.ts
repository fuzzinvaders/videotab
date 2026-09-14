import { mesurerScene } from './geometrie'
import { formaterDuree } from './minutage'
import { themeParId, type Theme } from './themes'
import type { ReglagesVideo, StyleCurseur } from './types'

/**
 * La scène : ce qu'on voit, image par image.
 *
 * Guitar Pro et PDF ne se ressemblent en rien avant d'arriver ici — l'un connaît ses notes,
 * l'autre est une photographie de papier. Mais une fois la partition rendue, les deux se
 * réduisent au même objet : une image, et un rectangle qui s'y déplace au fil du temps. Tout
 * ce qui suit ne connaît que ça, ce qui fait que l'aperçu à l'écran et la vidéo exportée sont
 * dessinés par le même code — et donc que ce qu'on voit est bien ce qu'on obtient.
 *
 * Trois dispositions, et c'est la seule vraie bifurcation du fichier :
 *
 *  - **page** : la partition est mise à la largeur et défile verticalement, le curseur
 *    parcourt chaque ligne. C'est la lecture d'une partition, pour travailler un morceau.
 *  - **défilement** : la partition est une seule bande horizontale qui glisse sous une tête
 *    de lecture fixe. C'est la lecture d'un instrument : le regard ne bouge plus, il attend
 *    que la musique arrive.
 *  - **mesures** : la même bande, mais immobile. On en montre quelques mesures, le curseur
 *    les traverse, et la page tourne quand il arrive au bout. C'est la lecture d'une
 *    partition à nouveau, sauf qu'elle tient toujours dans un bandeau — un chiffre qui ne
 *    bouge pas se déchiffre, là où un chiffre qui glisse ne se suit que de loin.
 *
 * Les deux dernières partagent tout sauf ce qui bouge, d'où le `bande` qui les réunit partout
 * où c'est la mise en page qui est en jeu, et le `parBlocs` qui ne distingue que l'avancée.
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
  /**
   * Largeur d'une mesure dans ce repère, si on la connaît. C'est elle qui permet de régler le
   * zoom en mesures plutôt qu'en pixels — le seul réglage qui ait un sens musical.
   */
  largeurMesure?: number
  /**
   * Les barres de mesure, abscisses croissantes : **une de plus que le nombre de mesures**,
   * la dernière fermant la dernière mesure. La largeur médiane ci-dessus suffit pour régler
   * un zoom, mais pas pour tourner la page sans couper une mesure — il faut alors savoir où
   * elles tombent réellement, chacune ayant la largeur que son contenu réclame.
   */
  barres?: number[]
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
   * Durée d'un temps, en millisecondes. Elle vient du tempo du morceau, que la scène n'a aucun
   * moyen de connaître seule, et c'est elle qui donne sa longueur au décompte.
   */
  dureeTempsMs?: number
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
  // Le curseur prend la couleur du thème tant que personne n'en a choisi une. Résolu ici,
  // une fois : plus bas, plus personne n'a à se demander d'où vient la teinte.
  const couleur = video.couleur ?? theme.curseur
  const { largeur, hauteur } = video
  /* Le décompte se compte en temps, et sa durée dépend donc du morceau. La scène ne connaît
     pas le tempo : on le lui donne, et sans lui elle retombe sur deux temps par seconde. */
  const dureeTempsMs = Math.max(1, options.dureeTempsMs ?? 500)
  const compteAvantMs = Math.max(0, video.compteAvantTemps) * dureeTempsMs
  const {
    bande,
    parBlocs,
    hauteurImage,
    zone,
    echelle,
    marge,
    scrollMax,
    teteX,
    traitCadre,
    longueurFondu,
    bandeauH,
    barreH,
    blocs,
  } = mesurerScene({ video, feuille, avecBandeau: Boolean(titre || artiste) })

  /* En page, le défilement est lissé d'une image à l'autre : le curseur saute d'une ligne à
     la suivante d'un coup, et une image qui suivrait ce saut donnerait le mal de mer. En
     défilement, au contraire, la position est prise telle quelle — elle est déjà continue,
     et la lisser ne ferait qu'ajouter un retard entre le son et l'image. En mesures, elle ne
     change qu'aux tournements de page, et un lissage y ferait glisser la tablature : c'est
     précisément ce qu'on cherche à éviter en la choisissant. */
  let scroll = 0
  let derniereImageMs = 0

  // La bande est composée à part puis posée d'un bloc : c'est ce qui permet d'en effacer les
  // deux bouts en dégradé sans effacer du même coup ce qu'il y a derrière.
  const couche = document.createElement('canvas')
  couche.width = Math.max(1, zone.w)
  couche.height = Math.max(1, zone.h)
  const couche2d = couche.getContext('2d')

  /* Une seconde couche, qui ne sert qu'aux tournements de page : elle porte la fenêtre qu'on
     quitte pendant qu'elle s'efface. Elle n'est fabriquée que là où elle peut servir — en
     défilement continu rien ne saute, et elle coûterait deux mégaoctets pour rien. */
  const voile = parBlocs ? document.createElement('canvas') : null
  if (voile) {
    voile.width = Math.max(1, zone.w)
    voile.height = Math.max(1, zone.h)
  }
  const voile2d = voile?.getContext('2d') ?? null

  /** La fenêtre qu'on vient de quitter et où en est son effacement, ou rien. */
  function transitionA(curseur: Curseur | null): { precedent: number; part: number } | null {
    if (!parBlocs || !curseur) return null
    const rang = blocs.indexA(curseur.x)
    if (rang <= 0) return null
    const part = (curseur.x - blocs.debuts[rang]) / longueurFondu
    if (part >= 1) return null
    return { precedent: blocs.debuts[rang - 1], part: Math.max(0, part) }
  }

  function positionVoulue(curseur: Curseur | null): number {
    if (!curseur) return 0
    if (parBlocs) return blocs.gaucheA(curseur.x) * echelle
    if (bande) return curseur.x * echelle - teteX
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

    if (bande) {
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
    ctx.clearRect(0, 0, largeur, hauteurImage)
    if (video.fond === 'theme') {
      ctx.fillStyle = theme.fond
      ctx.fillRect(0, 0, largeur, hauteurImage)
    } else if (video.fond === 'chroma') {
      ctx.fillStyle = CHROMA
      ctx.fillRect(0, 0, largeur, hauteurImage)
    }

    if (couche2d) {
      composerLaBande(couche2d, { curseur, scroll })
      dessinerCadreDerriere(ctx, { zone, video, theme, couleur })
      ctx.drawImage(couche, zone.x, zone.y)

      /* Le fondu du tournement de page. La fenêtre qu'on quitte est redessinée par-dessus la
         nouvelle, à une opacité qui s'efface : les deux se traversent au lieu de se remplacer
         d'un coup. Rien ne glisse — c'est précisément ce qu'on évite en choisissant ce mode —
         mais l'œil voit d'où vient ce qu'il lit, au lieu de retrouver un écran neuf sans
         transition. Le curseur n'y figure pas : il n'y en a qu'un, et il est déjà à sa
         nouvelle place. */
      const passage = transitionA(curseur)
      if (passage && voile && voile2d) {
        composerLaBande(voile2d, {
          curseur,
          scroll: passage.precedent * echelle,
          sansCurseur: true,
        })
        ctx.save()
        ctx.globalAlpha = 1 - passage.part
        ctx.drawImage(voile, zone.x, zone.y)
        ctx.restore()
      }

      dessinerCadreDevant(ctx, {
        zone,
        video,
        theme,
        couleur,
        largeur,
        hauteur: hauteurImage,
        trait: traitCadre,
      })
    }

    if (bandeauH > 0) {
      dessinerBandeau(ctx, { bandeauH, marge, titre, artiste, theme })
    }
    if (barreH > 0) {
      dessinerProgression(ctx, {
        largeur,
        hauteur: hauteurImage,
        barreH,
        tMs,
        dureeMs: options.dureeMs,
        couleur,
        theme,
      })
    }

    if (compteAvantMs > 0 && tMs < compteAvantMs) {
      dessinerDecompte(ctx, {
        // Le décompte se pose sur la tête de lecture quand il y en a une, au centre sinon.
        x: bande && !parBlocs ? zone.x + teteX : largeur / 2,
        y: hauteurImage / 2,
        taille: Math.round(hauteur * (bande ? 0.2 : 0.28)),
        restantMs: compteAvantMs - tMs,
        dureeTempsMs,
        couleur,
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
        ctx.globalCompositeOperation =
          video.fond === 'transparent' ? 'destination-out' : 'source-over'
        ctx.globalAlpha = voile
        ctx.fillStyle = video.fond === 'transparent' ? '#000000' : '#000000'
        ctx.fillRect(0, 0, largeur, hauteurImage)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 1
      }
    }
    ctx.restore()
  }

  /** La bande elle-même : la plaque, la partition, le curseur, et l'effacement des bords. */
  function composerLaBande(
    c: CanvasRenderingContext2D,
    etat: { curseur: Curseur | null; scroll: number; sansCurseur?: boolean },
  ) {
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
    // L'air demandé décale la tablature vers le bas dans sa bande : ce qui dépassait du
    // recadrage — hampes, rythmes, nom de section — redevient visible dedans plutôt que
    // rogné au bord.
    if (bande) c.translate(-etat.scroll, marge)
    else c.translate(0, -etat.scroll)
    c.scale(echelle, echelle)

    const debutVisible = bande ? etat.scroll / echelle : 0
    const finVisible = bande ? (etat.scroll + zone.w) / echelle : 0
    const hautVisible = bande ? 0 : etat.scroll / echelle
    const basVisible = bande ? 0 : (etat.scroll + zone.h) / echelle

    for (const tuile of feuille.tuiles) {
      // Une partition de cinq pages, c'est une cinquantaine de tuiles dont deux sont à
      // l'écran : les redessiner toutes ferait chuter la cadence de l'export.
      if (bande) {
        if (tuile.x + tuile.w < debutVisible || tuile.x > finVisible) continue
      } else if (tuile.y + tuile.h < hautVisible || tuile.y > basVisible) continue

      c.drawImage(tuile.source, tuile.x, tuile.y, tuile.w, tuile.h)
    }

    if (etat.curseur && !etat.sansCurseur) {
      dessinerCurseur(c, etat.curseur, {
        couleur,
        opacite: video.opacite,
        style: video.curseurStyle,
        trainee: Boolean(options.trainee),
      })
    }
    c.restore()

    /* Les bords ne s'effacent qu'en défilement. En mesures, la dernière mesure de la fenêtre
       est justement celle qu'on donne à lire en avance : l'estomper reviendrait à cacher ce
       qu'on vient d'ajouter pour être vu. */
    if (bande && !parBlocs) effacerLesBords(c, zone.w, zone.h)
    c.restore()
  }

  return {
    largeur,
    hauteur: hauteurImage,
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
  o: {
    zone: { x: number; y: number; w: number; h: number }
    video: ReglagesVideo
    theme: Theme
    couleur: string
  },
) {
  if (o.video.cadre !== 'lueur') return
  const rayon = Math.min(o.zone.h * 0.12, 28)
  ctx.save()
  // Le halo est peint *sous* la bande : dessiné par-dessus, il voilerait les chiffres qu'il
  // est censé mettre en valeur.
  ctx.shadowColor = o.couleur
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
    couleur: string
    largeur: number
    hauteur: number
    /** Épaisseur du trait en pixels de cette image-ci, déjà mise à l'échelle. */
    trait: number
  },
) {
  if (o.video.cadre === 'carte' || o.video.cadre === 'lueur') {
    if (o.trait <= 0) return
    ctx.save()
    ctx.strokeStyle = o.video.cadre === 'lueur' ? o.couleur : o.theme.lignes
    ctx.globalAlpha = o.video.cadre === 'lueur' ? 0.8 : 0.5
    ctx.lineWidth = o.trait
    /* Le trait est rentré d'une demi-épaisseur au lieu d'être centré sur le bord de la bande.
       Un trait centré perd sa moitié extérieure dès que la bande touche le bord de l'image,
       ce qui est justement le cas du cadrage sur la bande — mesuré : un pixel visible sur les
       deux demandés, et l'épaisseur qu'on règle ici n'en montrerait que la moitié. */
    const d = o.trait / 2
    ctx.beginPath()
    ctx.roundRect(
      o.zone.x + d,
      o.zone.y + d,
      Math.max(1, o.zone.w - o.trait),
      Math.max(1, o.zone.h - o.trait),
      Math.max(0, Math.min(o.zone.h * 0.12, 28) - d),
    )
    ctx.stroke()
    ctx.restore()
    return
  }

  if (o.video.cadre === 'bandes') {
    if (o.trait <= 0) return
    ctx.save()
    ctx.fillStyle = o.couleur
    ctx.globalAlpha = 0.65
    /* Les liserés sont posés en dedans de la bande, pas au-dessus et en dessous d'elle. Posés
       dehors, ils tombaient hors de l'image dès que la bande en occupait toute la hauteur —
       mesuré : zéro pixel de liseré haut en cadrage sur la bande, alors que c'est le cadrage
       fait pour l'incrustation, celui où l'on tient le plus à voir où la bande commence. */
    ctx.fillRect(o.zone.x, o.zone.y, o.zone.w, o.trait)
    ctx.fillRect(o.zone.x, o.zone.y + o.zone.h - o.trait, o.zone.w, o.trait)
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
  o: { couleur: string; opacite: number; style: StyleCurseur; trainee: boolean },
) {
  const surlignage = o.trainee ? curseur.ligne : curseur.bloc
  const montrerSurlignage = o.style !== 'trait' && Boolean(surlignage)
  /* Le trait est montré sauf quand on a demandé le surlignage seul — et même dans ce cas, on
     le garde s'il n'y a rien à surligner. Un PDF en défilement n'a ni temps ni ligne à
     désigner : sans cette réserve, « surlignage seul » y donnerait un curseur invisible,
     c'est-à-dire un réglage qui a l'air cassé. */
  const montrerTrait = o.style !== 'surlignage' || !montrerSurlignage

  ctx.save()
  ctx.fillStyle = o.couleur

  if (montrerSurlignage) {
    if (o.trainee && curseur.ligne) {
      // Sur un PDF, on ne sait pas où sont les notes : surligner « le temps en cours » serait
      // un mensonge. La traînée ne dit que ce qu'on sait — on en est là dans la ligne.
      ctx.globalAlpha = o.opacite * 0.45
      ctx.fillRect(curseur.ligne.x0, curseur.y, curseur.x - curseur.ligne.x0, curseur.h)
    } else if (curseur.bloc) {
      ctx.globalAlpha = o.opacite
      ctx.fillRect(curseur.bloc.x, curseur.y, Math.max(curseur.bloc.w, 2), curseur.h)
    }
  }

  if (montrerTrait) {
    /* Le trait vif : c'est lui qu'on suit des yeux, le surlignage ne fait que le situer.
       Son épaisseur est prise sur la hauteur du système plutôt que fixée en pixels — on
       dessine ici dans le repère de la partition, que la scène met ensuite à l'échelle, et
       un trait de trois pixels finirait invisible sur une partition très large. */
    const epaisseur = Math.max(2, curseur.h * 0.035)
    ctx.globalAlpha = 1
    ctx.fillRect(curseur.x - epaisseur / 2, curseur.y, epaisseur, curseur.h)
  }
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
  o: {
    x: number
    y: number
    taille: number
    restantMs: number
    dureeTempsMs: number
    couleur: string
  },
) {
  // Le chiffre compte des temps, comme les clics : les deux disent la même chose ou ils
  // s'annulent l'un l'autre.
  const temps = Math.ceil(o.restantMs / o.dureeTempsMs)
  // Il grossit et s'efface sur la fin de chaque temps : on le voit venir du coin de l'œil
  // sans avoir à le lire.
  const part = (o.restantMs % o.dureeTempsMs) / o.dureeTempsMs
  const taille = Math.round(o.taille * (1.15 - part * 0.15))
  ctx.save()
  ctx.globalAlpha = 0.25 + part * 0.5
  ctx.fillStyle = o.couleur
  ctx.font = `700 ${taille}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(temps), o.x, o.y)
  ctx.restore()
}
