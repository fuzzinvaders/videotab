import { decouperEnBlocs, largeurPourTenir, type Blocs } from './blocs'
import { echelleDefilement } from './echelle'
import { fondAvecAlpha } from './reglages'
import type { ReglagesVideo } from './types'

/**
 * Où tout se pose dans l'image, avant qu'on y dessine quoi que ce soit.
 *
 * Cette arithmétique vivait au début de `creerScene`, mêlée au dessin, et c'était une mauvaise
 * place : elle ne peut s'y vérifier qu'en fabriquant un canvas, donc en pratique jamais. Trois
 * fautes y ont pourtant vécu tranquillement — un recadrage qui rognait la rythmique, un cadre
 * dessiné à moitié hors de l'image, une épaisseur déduite d'une hauteur qui n'existe plus une
 * fois la vidéo réduite à sa bande. Chacune a fini par se voir, mais à l'œil et tardivement.
 *
 * Sortie ici, la même arithmétique ne demande plus qu'un objet de réglages et deux nombres, et
 * ce qu'elle promet peut être épinglé.
 */

export interface FeuilleMesurable {
  largeur: number
  hauteur: number
  largeurMesure?: number
  barres?: number[]
}

export interface Geometrie {
  /** Vrai pour les deux dispositions en bande horizontale. */
  bande: boolean
  /** Vrai pour la seule où la tablature reste immobile. */
  parBlocs: boolean
  /** Hauteur de l'image produite : celle demandée, ou celle de la bande si on cadre dessus. */
  hauteurImage: number
  /** La fenêtre par laquelle on regarde la partition, dans l'image. */
  zone: { x: number; y: number; w: number; h: number }
  echelle: number
  /** Air au-dessus de la tablature dans sa bande — et autant en dessous. */
  marge: number
  /** Course verticale disponible, en mode page. */
  scrollMax: number
  /** Abscisse de la tête de lecture dans la zone. */
  teteX: number
  /** Épaisseur du trait du cadre, en pixels de cette image-ci. */
  traitCadre: number
  /** Longueur du fondu d'un tournement de page, dans le repère de la partition. */
  longueurFondu: number
  bandeauH: number
  barreH: number
  blocs: Blocs
}

export function mesurerScene(d: {
  video: ReglagesVideo
  feuille: FeuilleMesurable
  /** Vrai s'il y a un titre ou un artiste à écrire : sans texte, pas de bandeau. */
  avecBandeau: boolean
}): Geometrie {
  const { video, feuille } = d
  const { largeur, hauteur } = video

  /* Le mode « mesures » partage toute la mise en page du défilement : même bande, même
     échelle, même recadrage. Il n'en diffère que par la façon dont elle avance. */
  const bande = video.disposition === 'defilement' || video.disposition === 'mesures'
  const parBlocs = video.disposition === 'mesures'

  const margePage = Math.round(largeur * 0.03)
  const bandeauH = video.bandeau && d.avecBandeau ? Math.round(hauteur * 0.09) : 0
  const barreH = video.barreDeProgression ? Math.max(3, Math.round(hauteur * 0.012)) : 0

  /* La zone est la fenêtre par laquelle on regarde la partition, et les deux dispositions la
     calculent dans l'ordre inverse l'une de l'autre.

     En page, la place disponible est donnée et l'échelle s'y ajuste : la partition est mise à
     la largeur, parce qu'une tablature se lit ligne par ligne et que la rogner sur les côtés
     reviendrait à couper des mesures.

     En bande, c'est l'échelle qui est donnée — tant de mesures à l'écran — et la hauteur de la
     bande en découle. La bande est alors aussi courte que la tablature l'exige, ce qui est
     exactement ce qu'on attend d'une incrustation : tout le reste de l'image demeure libre
     pour la vidéo qu'on posera dessous. */
  const libre = hauteur - bandeauH - barreH

  /* En mesures fixes, le zoom se règle sur ce que le compte demandé occupe réellement, et non
     sur une mesure médiane : une mesure qui déborde n'y est pas rognée mais renvoyée à la
     fenêtre suivante, si bien qu'en demander quatre en afficherait trois. Voir lib/blocs.ts. */
  /* La marge du cadre « verre », et elle seule en a une. Une carte qui touche les quatre
     bords de l'image n'est plus une carte : ses coins arrondis tombent hors champ, son filet
     se confond avec le bord, et son ombre n'a nulle part où tomber. On lui réserve donc un
     peu d'air tout autour — pris sur la largeur, donc sur la tablature, ce qui est le prix de
     cet habillage-là et la raison pour laquelle les autres ne le paient pas.

     Elle n'existe que si le fond laisse passer l'image de dessous. Sur un fond opaque, cette
     marge-là ne serait pas du vide autour de la carte mais un cadre noir autour d'elle — et
     l'ombre qu'elle devait accueillir n'aurait rien à assombrir. Le verre y perd son relief
     et se réduit à son filet : c'est le prix d'un fichier sans transparence.

     Comptée sur la largeur de l'image plutôt que sur la hauteur de la bande, qui n'est pas
     encore connue ici : c'est l'échelle qui en découle, pas l'inverse. */
  const margeCarte =
    bande && video.cadre === 'verre' && fondAvecAlpha(video.fond)
      ? Math.max(6, Math.round(largeur * 0.012))
      : 0

  const tenue =
    parBlocs && feuille.barres ? largeurPourTenir(feuille.barres, video.mesuresVisibles) : 0
  const largeurMesure =
    tenue > 0 ? tenue / Math.max(1, video.mesuresVisibles) : (feuille.largeurMesure ?? 0)

  const mise = bande
    ? echelleDefilement({
        largeurZone: largeur - 2 * margeCarte,
        hauteurMaxBande: Math.min(libre, hauteur * video.hauteurMax),
        largeurMesure,
        mesuresVisibles: video.mesuresVisibles,
        margeRelative: video.margeBande,
        feuille,
      })
    : null

  /* Cadrer sur la bande, c'est réduire la vidéo à ce qu'elle montre : le fichier ne porte plus
     les huit cents pixels de vide au-dessus et en dessous, il pèse ce qu'il vaut, et au montage
     il se pose sans qu'on ait à deviner où est la tablature dedans. La hauteur est arrondie au
     pair — plusieurs encodeurs refusent les dimensions impaires. */
  const cadreSurBande = Boolean(mise) && video.cadrage === 'bande'
  // Cadrée sur la bande, l'image s'arrêterait pile au bord de la carte : on l'agrandit de la
  // marge réservée plus haut, sans quoi l'ombre serait coupée net.
  const margeOmbre = cadreSurBande ? margeCarte : 0
  const hauteurImage = cadreSurBande
    ? 2 * Math.ceil((bandeauH + mise!.hauteurBande + barreH + 2 * margeOmbre) / 2)
    : hauteur

  const zone = mise
    ? {
        x: margeCarte,
        y: cadreSurBande
          ? bandeauH + margeOmbre
          : bandeauH + Math.round((libre - mise.hauteurBande) / 2),
        w: largeur - 2 * margeCarte,
        h: mise.hauteurBande,
      }
    : {
        x: margePage,
        y: bandeauH + Math.round(margePage / 2),
        w: largeur - margePage * 2,
        h: hauteur - bandeauH - margePage - barreH * 2,
      }

  const echelle = mise ? mise.echelle : feuille.largeur > 0 ? zone.w / feuille.largeur : 1

  /* L'épaisseur du cadre est comptée sur la largeur, jamais sur la hauteur. Cadrée sur la
     bande, l'image ne fait plus que deux cents pixels de haut : une épaisseur qui en
     découlerait resterait clouée à son minimum, et le réglage n'agirait pas là où l'on tient le
     plus à voir le cadre. La largeur, elle, ne change pas avec le cadrage. */
  const traitCadre = Math.round(video.epaisseurCadre * (largeur / 1920))

  return {
    bande,
    parBlocs,
    hauteurImage,
    zone,
    echelle,
    marge: mise ? mise.marge : 0,
    scrollMax: Math.max(0, feuille.hauteur * echelle - zone.h),
    teteX: Math.round(zone.w * video.teteX),
    traitCadre,
    /* La longueur du fondu, comptée en largeur de fenêtre plutôt qu'en millisecondes : la
       scène ne connaît pas le tempo, et une durée en pixels de partition en tient lieu — elle
       dure d'autant moins longtemps que le morceau va vite, ce qui est le bon comportement.
       Deux pour cent et demi de la fenêtre font environ deux dixièmes de seconde. */
    longueurFondu: Math.max(1, (zone.w / echelle) * 0.025),
    bandeauH,
    barreH,
    /* Le découpage en fenêtres de mesures entières, quand c'est le curseur qui avance et non
       la tablature. Il ne dépend que de l'échelle et des barres, tous deux fixés ici. */
    blocs: decouperEnBlocs({
      barres: feuille.barres ?? [],
      largeurFenetre: zone.w / echelle,
      anticipation: video.anticipation,
    }),
  }
}
