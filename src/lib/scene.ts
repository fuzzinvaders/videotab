import { mesurerScene } from './geometrie'
import { formaterDuree } from './minutage'
import { fondAvecAlpha } from './reglages'
import { themeParId, type Theme } from './themes'
import type { Cadre, ReglagesVideo, StyleCurseur } from './types'

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
/** Un changement de section, à son abscisse dans le repère de la partition. */
export interface SectionRelevee {
  x: number
  texte: string
}

export interface Feuille {
  largeur: number
  hauteur: number
  tuiles: Tuile[]
  /**
   * Les noms de sections, s'ils sont demandés. Dessinés par la scène et non par alphaTab :
   * voir `sectionsDeLaPartition`, qui explique pourquoi.
   */
  sections?: SectionRelevee[]
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
/* Le rayon des coins d'une carte, proportionnel à la hauteur de la bande et plafonné : sur une
   incrustation haute de deux cents pixels, vingt-huit pixels de rayon mangeraient déjà les
   premières mesures. Une seule définition, parce que le fond, la carte et sa lueur doivent
   tomber au même endroit — sinon le fond dépasse dans les coins, ce qui est précisément le
   défaut qu'on corrige ici. */
function rayonDeCarte(zone: { h: number }): number {
  return Math.min(zone.h * 0.12, 28)
}

/** Vrai pour les cadres dont les coins sont arrondis. */
function cadreArrondi(cadre: Cadre): boolean {
  return cadre === 'carte' || cadre === 'lueur' || cadre === 'verre'
}

/** Le noir translucide du fond « voile », à l'opacité demandée. */
function voileNoir(opacite: number): string {
  return `rgba(0, 0, 0, ${Math.min(1, Math.max(0, opacite)).toFixed(3)})`
}
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
  /* Effacer les bouts de la bande n'a pas le même sens selon ce qu'il y a derrière. Sur un
     fond opaque, il n'y a que la tablature à dissoudre, et le fond reste. Sur un fond qui
     laisse passer la reprise, il faut effacer les deux ensemble — sans quoi la tablature
     s'efface sur un voile qui, lui, garde ses deux arêtes franches. */
  const fonduSurLeFond = video.bordsFondus && fondAvecAlpha(video.fond)
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

  /**
   * Le fond, arrondi comme la carte quand la vidéo est la carte.
   *
   * Un rectangle plein derrière un cadre aux coins arrondis, ce sont quatre coins pleins qui
   * dépassent : le cadre a beau être arrondi, la vidéo reste carrée. Le fond épouse donc la
   * carte — mais seulement quand on a cadré sur la bande, c'est-à-dire quand la carte est le
   * bord de l'image. Cadrée en 1920×1080, la carte flotte au milieu d'une page qui a le droit
   * d'être pleine jusqu'aux bords, et lui creuser quatre encoches n'aurait aucun sens.
   */
  function peindreLeFond(ctx: CanvasRenderingContext2D, remplissage: string) {
    ctx.fillStyle = remplissage
    if (!cadreArrondi(video.cadre) || video.cadrage !== 'bande') {
      ctx.fillRect(0, 0, largeur, hauteurImage)
      return
    }
    // Hors de la zone — le bandeau du titre, la barre de progression — le fond reste carré :
    // eux ne sont pas dans la carte.
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, largeur, hauteurImage)
    ctx.rect(zone.x, zone.y, zone.w, zone.h)
    ctx.clip('evenodd')
    ctx.fillRect(0, 0, largeur, hauteurImage)
    ctx.restore()

    ctx.save()
    ctx.beginPath()
    ctx.roundRect(zone.x, zone.y, zone.w, zone.h, rayonDeCarte(zone))
    ctx.clip()
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h)
    ctx.restore()
  }

  /**
   * Le voile, effacé vers le haut et vers le bas.
   *
   * Sans arête, la bande n'a plus de limite à défendre : elle n'a donc besoin ni de cadre ni
   * de coins arrondis, et elle survit à n'importe quelle image derrière elle. Le dégradé ne
   * couvre que la zone — au-dessus et en dessous, le bandeau et la barre gardent le voile
   * plein, sans quoi le titre flotterait sur rien.
   */
  function peindreLeFondDegrade(ctx: CanvasRenderingContext2D) {
    const plein = voileNoir(video.opaciteFond)
    if (zone.y > 0) {
      ctx.fillStyle = plein
      ctx.fillRect(0, 0, largeur, zone.y)
    }
    const bas = zone.y + zone.h
    if (bas < hauteurImage) {
      ctx.fillStyle = plein
      ctx.fillRect(0, bas, largeur, hauteurImage - bas)
    }
    const degrade = ctx.createLinearGradient(0, zone.y, 0, bas)
    degrade.addColorStop(0, voileNoir(0))
    degrade.addColorStop(0.26, plein)
    degrade.addColorStop(0.74, plein)
    degrade.addColorStop(1, voileNoir(0))
    ctx.fillStyle = degrade
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h)
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
    if (video.fond === 'theme') peindreLeFond(ctx, theme.fond)
    else if (video.fond === 'noir') peindreLeFond(ctx, '#000000')
    else if (video.fond === 'voile') peindreLeFond(ctx, voileNoir(video.opaciteFond))
    else if (video.fond === 'degrade') peindreLeFondDegrade(ctx)
    else if (video.fond === 'chroma') {
      /* Le vert ne s'arrondit pas, et ce n'est pas un oubli : c'est lui qui sera détouré, et
         c'est donc lui qui doit occuper les coins. Un coin laissé vide y ferait un trou que le
         détourage ne rattraperait pas — du noir au montage, au lieu de rien. */
      ctx.fillStyle = CHROMA
      ctx.fillRect(0, 0, largeur, hauteurImage)
    }

    if (couche2d) {
      composerLaBande(couche2d, { curseur, scroll })
      dessinerCadreDerriere(ctx, {
        zone,
        video,
        theme,
        couleur,
        largeur,
        hauteur: hauteurImage,
      })
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

      // En dernier, une fois le fond, la tablature et le cadre en place : ce qui s'efface aux
      // deux bouts s'efface pour de bon, filet compris.
      if (bande && fonduSurLeFond) effacerLesBords(ctx, zone.x, zone.y, zone.w, zone.h)
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
        // Sur un fond qui laisse passer la reprise, un voile noir ne ferait pas disparaître
        // l'image : il la remplacerait par un rectangle noir dans la vidéo de dessous. On
        // efface donc, au lieu de couvrir — le fondu va vers ce qu'il y a derrière.
        ctx.globalCompositeOperation = fondAvecAlpha(video.fond) ? 'destination-out' : 'source-over'
        ctx.globalAlpha = voile
        ctx.fillStyle = '#000000'
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
      const rayon = rayonDeCarte(zone)
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

    /* Les noms de sections, posés dans l'air que la bande réserve déjà au-dessus de la
       tablature : ils ne coûtent donc pas un pixel de hauteur. Dessinés hors de la mise à
       l'échelle, pour que le texte garde la même taille quel que soit le zoom — un nom de
       section n'est pas de la musique, il n'a pas à grandir avec elle. */
    if (bande && feuille.sections?.length && marge > 6) {
      dessinerSections(c, feuille.sections, {
        echelle,
        scroll: etat.scroll,
        marge,
        largeur: zone.w,
        hauteurTablature: zone.h - 2 * marge,
        couleur: theme.texte,
      })
    }

    /* Les bords s'effacent sur la couche seule quand le fond est opaque : la tablature se
       dissout alors dans le fond, qui reste plein. Quand le fond laisse passer l'image de
       dessous, c'est lui aussi qu'il faut effacer, et cela se fait plus tard, sur l'image
       entière — sinon le voile garderait deux arêtes franches là où la tablature s'efface. */
    if (bande && video.bordsFondus && !fonduSurLeFond) effacerLesBords(c, 0, 0, zone.w, zone.h)
    c.restore()
  }

  return {
    largeur,
    hauteur: hauteurImage,
    dureeMs: options.dureeMs,
    transparente: fondAvecAlpha(video.fond),
    reinitialiser,
    dessiner,
  }
}

/* Les deux bouts de la bande s'effacent en dégradé plutôt que d'être coupés net. Une mesure
   qui apparaît d'un coup au bord de l'image attire l'œil au mauvais moment ; une mesure qui
   se lève doucement se laisse oublier jusqu'à ce qu'elle arrive. */
function effacerLesBords(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const fondu = Math.min(w * 0.12, 220)
  c.save()
  c.globalCompositeOperation = 'destination-out'

  const gauche = c.createLinearGradient(x, 0, x + fondu, 0)
  gauche.addColorStop(0, 'rgba(0,0,0,1)')
  gauche.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = gauche
  c.fillRect(x, y, fondu, h)

  const droite = c.createLinearGradient(x + w - fondu, 0, x + w, 0)
  droite.addColorStop(0, 'rgba(0,0,0,0)')
  droite.addColorStop(1, 'rgba(0,0,0,1)')
  c.fillStyle = droite
  c.fillRect(x + w - fondu, y, fondu, h)

  c.restore()
}

function dessinerCadreDerriere(
  ctx: CanvasRenderingContext2D,
  o: {
    zone: { x: number; y: number; w: number; h: number }
    video: ReglagesVideo
    theme: Theme
    couleur: string
    largeur: number
    hauteur: number
  },
) {
  if (o.video.cadre !== 'lueur' && o.video.cadre !== 'verre') return
  const rayon = rayonDeCarte(o.zone)
  const verre = o.video.cadre === 'verre'
  ctx.save()
  /* Peint *sous* la bande, halo comme ombre : dessinés par-dessus, ils voileraient les
     chiffres qu'ils sont censés mettre en valeur.

     L'ombre du verre est la seule chose de tout l'habillage qui sorte de la bande, et c'est
     tout son intérêt : elle décolle la tablature de la vidéo au lieu de la poser dessus. La
     place où elle tombe lui est réservée par la géométrie — voir margeOmbre. */
  if (verre) {
    /* On ne garde que ce qui déborde. Une ombre se dessine en peignant une forme pleine dont
       le navigateur floute le pourtour : cette forme-là est un moyen, pas un objet, et elle
       n'a rien à faire dans l'image. Tant que la bande était opaque on pouvait la laisser,
       recouverte ; sous un voile à cinquante pour cent elle traversait, et le verre virait au
       noir. Le découpage la retire et ne laisse que l'ombre autour. */
    ctx.beginPath()
    ctx.rect(0, 0, o.largeur, o.hauteur)
    ctx.roundRect(o.zone.x, o.zone.y, o.zone.w, o.zone.h, rayon)
    ctx.clip('evenodd')
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
    ctx.shadowBlur = Math.round(o.zone.h * 0.18)
    ctx.shadowOffsetY = Math.round(o.zone.h * 0.06)
    ctx.fillStyle = '#000000'
    ctx.beginPath()
    ctx.roundRect(o.zone.x, o.zone.y, o.zone.w, o.zone.h, rayon)
    ctx.fill()
    ctx.restore()
    return
  }
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
  if (o.video.cadre === 'verre') {
    const rayon = rayonDeCarte(o.zone)
    ctx.save()
    /* Un filet blanc à seize pour cent plutôt qu'un trait de couleur : il dit où s'arrête la
       bande sans se faire regarder. Son épaisseur ne suit pas le réglage du cadre — un filet
       de verre épais n'est plus un filet, c'est une bordure, et c'est le cadre « carte » qui
       est fait pour ça. */
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'
    ctx.lineWidth = Math.max(1, Math.round(o.largeur / 1280))
    const d = ctx.lineWidth / 2
    ctx.beginPath()
    ctx.roundRect(o.zone.x + d, o.zone.y + d, o.zone.w - 2 * d, o.zone.h - 2 * d, rayon - d)
    ctx.stroke()

    /* Le reflet : un dégradé blanc très faible sur la moitié haute. C'est ce qui donne
       l'épaisseur — sans lui, la bande est un rectangle sombre aux coins arrondis. */
    const reflet = ctx.createLinearGradient(0, o.zone.y, 0, o.zone.y + o.zone.h * 0.5)
    reflet.addColorStop(0, 'rgba(255, 255, 255, 0.10)')
    reflet.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = reflet
    ctx.beginPath()
    ctx.roundRect(o.zone.x, o.zone.y, o.zone.w, o.zone.h, rayon)
    ctx.fill()
    ctx.restore()
    return
  }

  if (o.video.cadre === 'accent') {
    ctx.save()
    /* Un seul trait, en bas, de la couleur du curseur — et une ligne claire d'un pixel en
       haut pour fermer la bande. C'est le seul habillage qui tienne sur un fond opaque : rien
       n'y dépend de ce qu'on voit à travers, donc rien n'y réclame de canal alpha. */
    const epais = Math.max(2, o.trait > 0 ? o.trait : Math.round(o.largeur / 480))
    ctx.fillStyle = o.couleur
    ctx.fillRect(o.zone.x, o.zone.y + o.zone.h - epais, o.zone.w, epais)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
    ctx.fillRect(o.zone.x, o.zone.y, o.zone.w, Math.max(1, Math.round(o.largeur / 1920)))
    ctx.restore()
    return
  }

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
      Math.max(0, rayonDeCarte(o.zone) - d),
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
    // Sans fond opaque, la vignette n'a rien à assombrir : elle rongerait la transparence.
    if (fondAvecAlpha(o.video.fond)) return
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

/**
 * Les noms de sections au-dessus de la tablature.
 *
 * Posés à l'aplomb de la barre de mesure où la section commence, et jamais plus grands que
 * l'air disponible — la bande n'a pas à s'agrandir pour eux. Deux sections trop rapprochées
 * ne se chevauchent pas : la seconde s'efface, parce qu'un nom illisible vaut moins que pas
 * de nom du tout.
 */
function dessinerSections(
  ctx: CanvasRenderingContext2D,
  sections: SectionRelevee[],
  o: {
    echelle: number
    scroll: number
    marge: number
    largeur: number
    hauteurTablature: number
    couleur: string
  },
) {
  /* Deux plafonds. L'air disponible, parce que le nom doit y tenir sans mordre sur la
     tablature ; et la tablature elle-même, parce qu'un réglage généreux en air donnerait
     sinon un titre plus gros que la musique. Mesuré à quatre mesures à l'écran, l'air seul
     autorisait quarante-deux pixels pour une tablature dont les chiffres en font vingt. */
  const taille = Math.max(
    11,
    Math.min(Math.round(o.marge * 0.8), Math.round(o.hauteurTablature * 0.15), 36),
  )
  ctx.save()
  ctx.font = `600 ${taille}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
  ctx.fillStyle = o.couleur
  ctx.globalAlpha = 0.75
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  let occupeJusqua = -Infinity
  for (const section of sections) {
    const x = section.x * o.echelle - o.scroll
    if (x > o.largeur) break
    const largeurTexte = ctx.measureText(section.texte).width
    if (x + largeurTexte < 0 || x < occupeJusqua) continue
    occupeJusqua = x + largeurTexte + taille * 0.5
    // La ligne de base juste au-dessus de la tablature, à un souffle de la première corde.
    ctx.fillText(section.texte, x + 2, o.marge - Math.max(2, taille * 0.18))
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
