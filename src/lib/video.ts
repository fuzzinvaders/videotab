import { reveillerAudio } from './audio'
import { encodagePossible, encoder } from './encodeur'
import { horlogeLissee } from './horloge'
import { battre, type Metronome } from './metronome'
import type { Scene } from './scene'
import type { FormatVideo, QualiteVideo } from './types'

/**
 * L'encodage de la vidéo, dans le navigateur.
 *
 * Deux voies, et la première est prise dès qu'elle est ouverte : WebCodecs encode plus vite
 * que le morceau ne dure et date les images lui-même — voir lib/encodeur.ts. Ce fichier-ci
 * garde la seconde, le magnétophone, pour les navigateurs qui n'ont pas WebCodecs et pour la
 * transparence, qu'aucun n'encode encore de façon fiable par cette voie-là.
 *
 * Le magnétophone tient en trois objets standard : un canvas qu'on dessine, un
 * `captureStream` qui en fait une piste vidéo, un `MediaRecorder` qui encode le tout. Rien
 * à installer sur le serveur, pas de ffmpeg, pas de file d'attente de rendu — la machine
 * qui regarde est celle qui fabrique. Mais il enregistre **en temps réel** et horodate ce
 * qu'il reçoit à l'heure du mur : trois minutes de morceau demandent trois minutes, et toute
 * l'horlogerie qui suit n'existe que pour composer avec cette horloge-là.
 *
 * Trois minutes d'attente, c'est trois minutes pendant lesquelles personne ne reste à
 * regarder une barre avancer. L'export ne demande donc pas qu'on le surveille : il ne bat ni
 * au rythme de l'écran ni à celui d'un minuteur, que le navigateur ralentit tous deux dès
 * qu'on regarde ailleurs, mais à celui du fil audio, qui ne ralentit jamais. Il rend aussi
 * la cadence qu'il a réellement tenue — un fichier qui n'aurait pas suivi doit se dire, pas
 * se découvrir au montage.
 */

export interface OptionsEnregistrement {
  fps: number
  /** Le conteneur voulu. Il n'est pas garanti : un navigateur qui ne sait pas l'écrire
   *  rendra l'autre, et `Enregistrement.ext` dit lequel est sorti. */
  format?: FormatVideo
  qualite?: QualiteVideo
  audio?: AudioBuffer | null
  /** Faire entendre la bande-son pendant l'enregistrement. */
  audible?: boolean
  onProgression?: (part: number, tMs: number) => void
  signal?: AbortSignal
}

export interface Enregistrement {
  blob: Blob
  ext: '.webm' | '.mp4'
  type: string
  dureeMs: number
  /**
   * Images par seconde réellement livrées. Ce n'est pas la même chose que la cadence
   * demandée : une machine qui n'a pas suivi rend un fichier plus pauvre, et c'est le seul
   * chiffre qui permette de le dire avant de l'avoir monté.
   */
  imagesParSeconde: number
}

/* Par ordre de préférence, et l'ordre dépend de ce qu'on a demandé. Le mp4 d'abord quand
   c'est lui qu'on veut — il est le seul que les logiciels de montage prennent sans discuter —
   sinon le VP9 pour la qualité à débit égal, le VP8 pour les navigateurs qui ne l'encodent
   pas, et le mp4 quand même en dernier, pour Safari, qui ne connaît pas le WebM. */
const FORMATS_WEBM = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
const FORMATS_MP4 = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
const FORMATS = [...FORMATS_WEBM, ...FORMATS_MP4]

/* Pour une vidéo à fond transparent, le VP8 passe avant le VP9 : c'est le codec dont le canal
   alpha traverse le plus sûrement `MediaRecorder`, et une incrustation qui perd sa
   transparence ne vaut rien. Le mp4 ne sait pas la transporter du tout — sur un navigateur
   qui n'a que lui, l'export sera opaque, et l'interface le dit avant qu'on appuie. */
const FORMATS_ALPHA = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm']

export function formatSupporte(alpha = false, format: FormatVideo = 'webm'): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  /* La transparence passe avant le conteneur voulu : le mp4 ne sait pas la transporter, et
     une incrustation qui perd son alpha ne vaut rien, quel que soit le format demandé. */
  const voulus = format === 'mp4' ? [...FORMATS_MP4, ...FORMATS_WEBM] : FORMATS
  const candidats = alpha ? [...FORMATS_ALPHA, ...voulus] : voulus
  return candidats.find((f) => MediaRecorder.isTypeSupported(f)) ?? null
}

/** Vrai si ce navigateur sait garder un canal alpha dans la vidéo qu'il encode. */
export function alphaPossible(): boolean {
  if (typeof MediaRecorder === 'undefined') return false
  return FORMATS_ALPHA.some((f) => MediaRecorder.isTypeSupported(f))
}

export function extensionDe(type: string): '.webm' | '.mp4' {
  return type.startsWith('video/mp4') ? '.mp4' : '.webm'
}

/* Bits par pixel et par image. Le magnétophone ne connaît que le débit — pas de mode
   quantificateur ici — et une tablature n'a pas besoin du débit d'une prise de vue : mesuré
   sur un export en 1080p à trente images, les images intermédiaires pesaient toutes seize
   kilooctets à la centaine d'octets près, ce qui est la signature d'un budget dépensé parce
   qu'il était là. Voir lib/encodeur.ts, qui fait mieux quand il peut. */
const BITS_PAR_PIXEL: Record<QualiteVideo, number> = {
  legere: 0.02,
  standard: 0.04,
  nette: 0.08,
}

/** Un débit qui suit la définition : de quoi garder des chiffres de tablature nets. */
function debitVideo(
  largeur: number,
  hauteur: number,
  fps: number,
  qualite: QualiteVideo = 'standard',
): number {
  const brut = largeur * hauteur * fps * BITS_PAR_PIXEL[qualite]
  return Math.round(Math.min(24_000_000, Math.max(600_000, brut)))
}

/**
 * Comment la vidéo sera fabriquée, avant de s'y engager.
 *
 * L'interface le dit avant qu'on appuie plutôt qu'après : « quelques dizaines de secondes » et
 * « le temps du morceau » ne se préparent pas de la même façon.
 */
export function voieDEncodage(transparente: boolean): 'rapide' | 'temps-reel' {
  return encodagePossible(transparente) ? 'rapide' : 'temps-reel'
}

export async function enregistrer(
  scene: Scene,
  options: OptionsEnregistrement,
): Promise<Enregistrement> {
  /* Par WebCodecs quand c'est possible : l'encodage y est plus rapide que le morceau, et les
     images y portent la date qu'on leur donne au lieu de celle de leur arrivée. Le
     magnétophone reste pour les navigateurs qui n'ont pas WebCodecs et pour la transparence,
     qu'aucun n'encode encore de façon fiable par cette voie. Voir lib/encodeur.ts. */
  if (encodagePossible(scene.transparente)) return encoder(scene, options)

  const type = formatSupporte(scene.transparente, options.format ?? 'mp4')
  if (!type) {
    throw new Error(
      'Ce navigateur ne sait pas enregistrer de vidéo (MediaRecorder absent). Firefox, Chrome, Edge et Safari récents le savent.',
    )
  }

  const canvas = document.createElement('canvas')
  canvas.width = scene.largeur
  canvas.height = scene.hauteur
  // Le canvas n'a de canal alpha que si la scène en veut un : sans transparence à garder,
  // `alpha: false` laisse le navigateur composer plus vite, image après image.
  const ctx = canvas.getContext('2d', { alpha: scene.transparente })
  if (!ctx) throw new Error('Impossible de préparer le canvas de rendu.')

  /* Zéro, et non la cadence voulue : on ne laisse pas le navigateur échantillonner le canvas
     quand bon lui semble, on lui remet chaque image explicitement. Le sien est un
     échantillonneur libre, qui rate une image ici et en double une là ; celui-ci livre
     exactement ce qu'on a dessiné, ni plus ni moins. */
  const flux = canvas.captureStream(0)
  const pisteImage = flux.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack

  /* Le contexte est celui de toute l'application, pas un nouveau : voir lib/audio.ts. Il est
     réveillé même sans bande-son, parce que c'est de son fil que vient le battement qui
     cadence l'export. Un navigateur qui le refuserait ne perd que ça : la boucle de secours,
     plus bas, reprend la main. */
  let contexte: AudioContext | null = null
  try {
    contexte = await reveillerAudio()
  } catch {
    contexte = null
  }

  /* L'horloge du son fait foi — c'est elle que la bande suivra — mais elle saute par blocs
     de dix millisecondes, et une image dessinée d'après ses sauts saccade. On lui emprunte
     donc sa justesse et non son rythme : voir lib/horloge.ts. */
  let source: AudioBufferSourceNode | null = null
  let surLeSon = false
  let depart = 0
  const horloge = horlogeLissee({
    reference: () =>
      surLeSon && contexte ? (contexte.currentTime - depart) * 1000 : performance.now() - depart,
  })

  if (options.audio && contexte) {
    surLeSon = true
    const sortie = contexte.createMediaStreamDestination()
    source = contexte.createBufferSource()
    source.buffer = options.audio
    source.connect(sortie)
    if (options.audible) source.connect(contexte.destination)
    for (const piste of sortie.stream.getAudioTracks()) flux.addTrack(piste)
  }

  const morceaux: BlobPart[] = []
  const recorder = new MediaRecorder(flux, {
    mimeType: type,
    videoBitsPerSecond: debitVideo(scene.largeur, scene.hauteur, options.fps, options.qualite),
    audioBitsPerSecond: 160_000,
  })
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) morceaux.push(e.data)
  }

  const termine = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = (e) => reject((e as ErrorEvent).error ?? new Error("Échec de l'encodage."))
  })

  /* Le battement qui cadence l'export, pris sur le fil audio parce que c'est le seul qu'un
     onglet caché ne ralentisse pas : voir lib/metronome.ts. Il est mis en place avant le
     départ, le chargement du module prenant quelques millisecondes qu'on ne veut pas voir
     manquer à la bande. */
  let battement: (() => void) | null = null
  let metronome: Metronome | null = null
  if (contexte) {
    try {
      metronome = await battre(contexte, () => battement?.())
    } catch {
      metronome = null
    }
  }

  // Première image dessinée avant le premier octet enregistré : sans ça, la vidéo commence
  // sur un cadre noir, le temps que la boucle rende la main.
  scene.reinitialiser(0)
  scene.dessiner(ctx, 0)

  // Des tranches d'une seconde plutôt qu'un seul bloc final : sur un long morceau, ça
  // évite de garder plusieurs centaines de mégaoctets dans un unique Blob en construction.
  recorder.start(1000)
  pisteImage.requestFrame()

  if (contexte && source) {
    // Un court sursis avant le départ : démarrer la source à l'instant même ferait manquer
    // les premières millisecondes sur les machines chargées.
    depart = contexte.currentTime + 0.15
    source.start(depart)
  } else {
    depart = performance.now()
  }

  let interrompu = false
  const onAbort = () => {
    interrompu = true
  }
  options.signal?.addEventListener('abort', onAbort)

  let images = 0
  const surLaFin: (() => void)[] = []
  const debutMur = performance.now()
  try {
    await new Promise<void>((resolve) => {
      const pas = 1000 / options.fps
      /* Le créneau est compté depuis le départ, jamais depuis l'image précédente : un
         battement en retard ne décale donc pas tous les suivants, et la cadence ne dérive
         pas sur trois minutes. */
      let dernierCreneau = -Infinity
      let fini = false
      let rafId = 0

      function image() {
        if (fini) return
        if (interrompu) {
          fini = true
          return resolve()
        }

        const brut = horloge.maintenantMs()
        const tMs = Math.max(0, brut)
        if (tMs >= scene.dureeMs) {
          // Une dernière image à la durée exacte : la barre de progression doit finir pleine,
          // et le fondu de sortie arriver au bout de sa course.
          fini = true
          scene.dessiner(ctx!, scene.dureeMs)
          pisteImage.requestFrame()
          images++
          options.onProgression?.(1, scene.dureeMs)
          return resolve()
        }

        const creneau = Math.floor(brut / pas)
        if (creneau <= dernierCreneau) return
        dernierCreneau = creneau

        scene.dessiner(ctx!, tMs)
        pisteImage.requestFrame()
        images++
        options.onProgression?.(tMs / scene.dureeMs, tMs)
      }

      /* Trois réveils pour une seule boucle, en ordre de préférence stricte. `image` ne fait
         rien deux fois dans le même créneau, mais l'ordre compte quand même : celui qui
         arrive le premier après l'ouverture d'un créneau décide de l'instant de l'image.

         L'écran d'abord. Ses battements sont alignés sur le balayage, donc une cadence qui
         divise la sienne tombe juste à chaque fois, et les images s'espacent régulièrement.

         Le fil audio ensuite, mais seulement quand l'écran s'est tu — c'est-à-dire quand on
         a quitté l'onglet, ce qui suspend le rafraîchissement. Sa grille est plus grossière,
         dix millisecondes, la taille d'un bloc de carte son : le laisser servir un créneau
         que l'écran allait servir mieux ne ferait qu'écarter les images inégalement. Il ne
         prend donc la main qu'après un silence, et la rend dès que l'écran repart.

         Le minuteur enfin, à peine plus qu'une corde de rappel : si le fil audio venait à
         s'arrêter — une machine mise en veille, un contexte suspendu par le système — plus
         rien n'appellerait la boucle et l'export resterait pendu. Un quart de seconde suffit
         pour aller au bout plutôt que de laisser l'utilisateur devant une barre figée. */
      let dernierEcran = -Infinity
      const silence = Math.max(25, pas * 1.5)

      function surEcran() {
        dernierEcran = performance.now()
        image()
        if (!fini) rafId = requestAnimationFrame(surEcran)
      }
      rafId = requestAnimationFrame(surEcran)
      surLaFin.push(() => cancelAnimationFrame(rafId))

      battement = () => {
        if (performance.now() - dernierEcran < silence) return
        image()
      }

      const rappel = window.setInterval(image, 250)
      surLaFin.push(() => clearInterval(rappel))
    })
  } finally {
    battement = null
    metronome?.arreter()
    for (const menage of surLaFin) menage()
    options.signal?.removeEventListener('abort', onAbort)
    // Un dernier battement avant de couper : le magnétophone a besoin de voir passer la
    // dernière image, faute de quoi la vidéo s'arrête une fraction de seconde trop tôt.
    await new Promise((r) => setTimeout(r, 250))
    try {
      source?.stop()
    } catch {
      // Déjà arrêtée d'elle-même : la bande-son était plus courte que le morceau.
    }
    if (recorder.state !== 'inactive') recorder.stop()
    await termine.catch(() => undefined)
    for (const piste of flux.getTracks()) piste.stop()
    // Le contexte audio n'est pas fermé : il est partagé, et le prochain export en aura
    // besoin. Seules les pistes de ce flux-ci s'arrêtent.
  }

  if (interrompu) throw new DOMException('Enregistrement interrompu.', 'AbortError')

  const blob = new Blob(morceaux, { type })
  const ecoule = performance.now() - debutMur
  return {
    blob,
    ext: extensionDe(type),
    type,
    dureeMs: scene.dureeMs,
    imagesParSeconde: ecoule > 0 ? (images * 1000) / ecoule : 0,
  }
}
