import { reveillerAudio } from './audio'
import type { Scene } from './scene'

/**
 * L'encodage de la vidéo, dans le navigateur.
 *
 * Le principe tient en trois objets standard : un canvas qu'on dessine, un
 * `captureStream` qui en fait une piste vidéo, un `MediaRecorder` qui encode le tout. Rien
 * à installer sur le serveur, pas de ffmpeg, pas de file d'attente de rendu — la machine
 * qui regarde est celle qui fabrique.
 *
 * Le prix à payer est que l'enregistrement se fait **en temps réel** : trois minutes de
 * morceau demandent trois minutes. `MediaRecorder` est un magnétophone, pas un moteur de
 * rendu ; il horodate ce qu'il reçoit avec l'horloge du mur. On pourrait aller plus vite
 * avec WebCodecs, mais il faudrait alors écrire soi-même le conteneur WebM, et cette
 * dépense n'a pas de sens tant qu'on filme des morceaux de trois minutes.
 *
 * Conséquence directe, et il faut la dire à l'utilisateur plutôt que la lui faire
 * découvrir : l'onglet doit rester au premier plan. Un onglet caché voit ses horloges
 * d'animation ralenties à une image par seconde, et la vidéo en garde la trace.
 */

export interface OptionsEnregistrement {
  fps: number
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
}

/* Par ordre de préférence. VP9 pour la qualité à débit égal, VP8 pour les navigateurs qui
   ne l'encodent pas, et le mp4 en dernier pour Safari, qui ne connaît pas le WebM. */
const FORMATS = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
]

/* Pour une vidéo à fond transparent, le VP8 passe avant le VP9 : c'est le codec dont le canal
   alpha traverse le plus sûrement `MediaRecorder`, et une incrustation qui perd sa
   transparence ne vaut rien. Le mp4 ne sait pas la transporter du tout — sur un navigateur
   qui n'a que lui, l'export sera opaque, et l'interface le dit avant qu'on appuie. */
const FORMATS_ALPHA = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm']

export function formatSupporte(alpha = false): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidats = alpha ? [...FORMATS_ALPHA, ...FORMATS] : FORMATS
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

/** Un débit qui suit la définition : de quoi garder des chiffres de tablature nets. */
function debitVideo(largeur: number, hauteur: number, fps: number): number {
  return Math.round(Math.min(24_000_000, Math.max(2_000_000, largeur * hauteur * fps * 0.12)))
}

export async function enregistrer(
  scene: Scene,
  options: OptionsEnregistrement,
): Promise<Enregistrement> {
  const type = formatSupporte(scene.transparente)
  if (!type) {
    throw new Error(
      "Ce navigateur ne sait pas enregistrer de vidéo (MediaRecorder absent). Firefox, Chrome, Edge et Safari récents le savent.",
    )
  }

  const canvas = document.createElement('canvas')
  canvas.width = scene.largeur
  canvas.height = scene.hauteur
  // Le canvas n'a de canal alpha que si la scène en veut un : sans transparence à garder,
  // `alpha: false` laisse le navigateur composer plus vite, image après image.
  const ctx = canvas.getContext('2d', { alpha: scene.transparente })
  if (!ctx) throw new Error('Impossible de préparer le canvas de rendu.')

  const flux = canvas.captureStream(options.fps)

  // L'horloge de l'audio est la seule qui compte quand il y en a une : c'est elle que la
  // bande-son suivra, et une image calculée d'après une autre horloge finirait décalée.
  let contexte: AudioContext | null = null
  let source: AudioBufferSourceNode | null = null
  let depart = 0
  const maintenantMs = () =>
    contexte ? (contexte.currentTime - depart) * 1000 : performance.now() - depart

  if (options.audio) {
    // Le contexte est celui de toute l'application, pas un nouveau : voir lib/audio.ts.
    contexte = await reveillerAudio()
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
    videoBitsPerSecond: debitVideo(scene.largeur, scene.hauteur, options.fps),
    audioBitsPerSecond: 160_000,
  })
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) morceaux.push(e.data)
  }

  const termine = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve()
    recorder.onerror = (e) => reject((e as ErrorEvent).error ?? new Error("Échec de l'encodage."))
  })

  // Première image dessinée avant le premier octet enregistré : sans ça, la vidéo commence
  // sur un cadre noir, le temps que la boucle rende la main.
  scene.reinitialiser(0)
  scene.dessiner(ctx, 0)

  // Des tranches d'une seconde plutôt qu'un seul bloc final : sur un long morceau, ça
  // évite de garder plusieurs centaines de mégaoctets dans un unique Blob en construction.
  recorder.start(1000)

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

  try {
    await new Promise<void>((resolve) => {
      const pas = 1000 / options.fps
      let rafId = 0
      let veille = 0

      /* Le rythme vient de l'écran, l'instant vient du son. Le premier donne une cadence
         régulière — un rendu par rafraîchissement, aligné sur le balayage — et c'est ce qui
         manquait : un minuteur seul livre ses images à des intervalles inégaux, que le
         magnétophone horodate tels quels et que l'œil lit comme des à-coups.

         Le minuteur reste en second rideau, parce qu'un onglet passé en arrière-plan suspend
         complètement le rafraîchissement. La vidéo y perd en fluidité, mais elle continue et
         elle se termine. */
      function planifier() {
        rafId = requestAnimationFrame(image)
        veille = window.setTimeout(image, Math.max(64, pas * 3))
      }

      function image() {
        cancelAnimationFrame(rafId)
        clearTimeout(veille)
        if (interrompu) return resolve()

        const tMs = maintenantMs()
        if (tMs >= scene.dureeMs) {
          // Une dernière image à la durée exacte : la barre de progression doit finir pleine,
          // et le fondu de sortie arriver au bout de sa course.
          scene.dessiner(ctx!, scene.dureeMs)
          options.onProgression?.(1, scene.dureeMs)
          resolve()
          return
        }
        if (tMs >= 0) {
          scene.dessiner(ctx!, tMs)
          options.onProgression?.(tMs / scene.dureeMs, tMs)
        }
        planifier()
      }

      planifier()
    })
  } finally {
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
  return { blob, ext: extensionDe(type), type, dureeMs: scene.dureeMs }
}
