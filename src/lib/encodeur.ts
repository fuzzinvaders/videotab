import { ArrayBufferTarget, Muxer } from 'webm-muxer'
import type { Scene } from './scene'
import type { Enregistrement, OptionsEnregistrement } from './video'

/**
 * L'encodage hors du temps.
 *
 * `MediaRecorder` est un magnétophone : il enregistre ce qu'on lui joue, à la vitesse où on le
 * lui joue, et horodate chaque image à l'heure du mur. Trois minutes de morceau demandent donc
 * trois minutes d'attente, et toute la mécanique d'horlogerie de ce projet — l'horloge lissée,
 * le métronome pris sur le fil audio, la remise d'image explicite — n'existe que pour composer
 * avec cette horloge-là.
 *
 * WebCodecs ne demande rien de tel. On lui donne des images déjà datées, il les comprime aussi
 * vite que la machine le permet, et un multiplexeur les range dans un WebM. Le temps de la
 * vidéo n'est plus le temps de l'encodage : ils n'ont plus rien à voir l'un avec l'autre.
 *
 * Conséquences, dans l'ordre où on les remarque :
 *
 *  - l'attente tombe de trois minutes à quelques dizaines de secondes ;
 *  - la cadence est exacte, image après image, parce que c'est nous qui écrivons les dates ;
 *  - l'onglet peut faire ce qu'il veut : plus aucune horloge du navigateur n'entre en jeu.
 *
 * Le magnétophone reste néanmoins là, et pour deux raisons qui ne disparaîtront pas de sitôt :
 * tous les navigateurs n'ont pas WebCodecs, et surtout aucun n'encode encore la transparence de
 * façon fiable par cette voie. Une incrustation à fond transparent passe donc toujours par lui.
 */

/* VP9 profil 0, niveau 1.0, huit bits : le même codec que produit le magnétophone, pour que
   les deux chemins donnent des fichiers de même nature. */
const CODEC_VIDEO = 'vp09.00.10.08'
const CODEC_AUDIO = 'opus'
const CANAUX = 2

/** Vrai si ce navigateur sait encoder par cette voie ce qu'on lui demande. */
export function encodagePossible(transparente: boolean): boolean {
  if (transparente) return false
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  )
}

function debitVideo(largeur: number, hauteur: number, fps: number): number {
  return Math.round(Math.min(24_000_000, Math.max(2_000_000, largeur * hauteur * fps * 0.12)))
}

export async function encoder(
  scene: Scene,
  options: OptionsEnregistrement,
): Promise<Enregistrement> {
  const { fps } = options
  const images = Math.max(1, Math.round((scene.dureeMs / 1000) * fps))

  const canvas = document.createElement('canvas')
  canvas.width = scene.largeur
  canvas.height = scene.hauteur
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Impossible de préparer le canvas de rendu.')

  const cible = new ArrayBufferTarget()
  const muxeur = new Muxer({
    target: cible,
    video: {
      codec: 'V_VP9',
      width: scene.largeur,
      height: scene.hauteur,
      frameRate: fps,
    },
    audio: options.audio
      ? {
          codec: 'A_OPUS',
          numberOfChannels: CANAUX,
          sampleRate: options.audio.sampleRate,
        }
      : undefined,
    // Le fichier est écrit d'un bloc et relu ensuite : rien à diffuser au fil de l'eau, et on
    // garde ainsi la durée et les points de recherche, qu'un flux perdrait.
    streaming: false,
  })

  let echec: Error | null = null
  const encodeurVideo = new VideoEncoder({
    output: (morceau, meta) => muxeur.addVideoChunk(morceau, meta),
    error: (err) => {
      echec ??= err
    },
  })
  encodeurVideo.configure({
    codec: CODEC_VIDEO,
    width: scene.largeur,
    height: scene.hauteur,
    bitrate: debitVideo(scene.largeur, scene.hauteur, fps),
    framerate: fps,
  })

  let encodeurAudio: AudioEncoder | null = null
  if (options.audio) {
    encodeurAudio = new AudioEncoder({
      output: (morceau, meta) => muxeur.addAudioChunk(morceau, meta),
      error: (err) => {
        echec ??= err
      },
    })
    encodeurAudio.configure({
      codec: CODEC_AUDIO,
      numberOfChannels: CANAUX,
      sampleRate: options.audio.sampleRate,
      bitrate: 160_000,
    })
  }

  const interrompu = () => options.signal?.aborted === true

  try {
    if (options.audio) encoderLeSon(encodeurAudio!, options.audio, scene.dureeMs)

    scene.reinitialiser(0)
    for (let i = 0; i < images; i++) {
      if (interrompu()) throw new DOMException('Encodage interrompu.', 'AbortError')
      if (echec) throw echec

      /* L'instant de l'image est calculé, jamais mesuré. C'est toute la différence : le
         magnétophone datait ce qu'il recevait à l'heure de son arrivée, et il fallait donc que
         l'arrivée tombe juste. Ici la date précède l'image. */
      const tMs = (i * 1000) / fps
      scene.dessiner(ctx, tMs)

      const image = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1_000_000) / fps),
        duration: Math.round(1_000_000 / fps),
      })
      // Une image clef toutes les deux secondes : de quoi se déplacer dans la vidéo au montage
      // sans faire enfler le fichier.
      encodeurVideo.encode(image, {
        keyFrame: i % Math.max(1, Math.round(fps * 2)) === 0,
      })
      image.close()

      options.onProgression?.(i / images, tMs)

      /* La file d'attente est bornée à la main. Sans cela on empile cinq mille images
         décompressées en mémoire pendant que l'encodeur en digère trente, et l'onglet meurt
         avant la fin du morceau. Attendre ici rend aussi la main à la page, qui peut alors
         redessiner sa barre de progression et voir passer une interruption. */
      if (encodeurVideo.encodeQueueSize > 8) {
        await new Promise<void>((suite) =>
          encodeurVideo.addEventListener('dequeue', () => suite(), {
            once: true,
          }),
        )
      }
    }

    await encodeurVideo.flush()
    if (encodeurAudio) await encodeurAudio.flush()
    if (echec) throw echec
    muxeur.finalize()
  } finally {
    if (encodeurVideo.state !== 'closed') encodeurVideo.close()
    if (encodeurAudio && encodeurAudio.state !== 'closed') encodeurAudio.close()
  }

  options.onProgression?.(1, scene.dureeMs)

  return {
    blob: new Blob([cible.buffer], { type: 'video/webm' }),
    ext: '.webm',
    type: 'video/webm;codecs=vp9,opus',
    dureeMs: scene.dureeMs,
    // Exacte par construction : on a produit le nombre d'images demandé, ni plus ni moins.
    imagesParSeconde: fps,
  }
}

/**
 * La bande-son, découpée en tranches et confiée à l'encodeur d'un coup.
 *
 * Elle est déjà entièrement en mémoire — c'est le synthétiseur d'alphaTab qui l'a produite —
 * donc rien n'oblige à la donner au rythme où on la jouerait. Les tranches font vingt
 * millisecondes, la taille qu'Opus digère naturellement, et leurs dates se déduisent du compte
 * d'échantillons : elles ne peuvent pas dériver.
 */
function encoderLeSon(encodeur: AudioEncoder, buffer: AudioBuffer, dureeMs: number): void {
  const frequence = buffer.sampleRate
  const parTranche = Math.round(frequence * 0.02)
  const total = Math.min(buffer.length, Math.round((dureeMs / 1000) * frequence))

  // Le format planaire évite d'entrelacer : on recopie chaque canal tel quel.
  const gauche = buffer.getChannelData(0)
  const droite = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : gauche

  for (let debut = 0; debut < total; debut += parTranche) {
    const longueur = Math.min(parTranche, total - debut)
    const donnees = new Float32Array(longueur * CANAUX)
    donnees.set(gauche.subarray(debut, debut + longueur), 0)
    donnees.set(droite.subarray(debut, debut + longueur), longueur)

    const tranche = new AudioData({
      format: 'f32-planar',
      sampleRate: frequence,
      numberOfFrames: longueur,
      numberOfChannels: CANAUX,
      timestamp: Math.round((debut / frequence) * 1_000_000),
      data: donnees,
    })
    encodeur.encode(tranche)
    tranche.close()
  }
}
