import { ArrayBufferTarget as CibleMp4, Muxer as MuxeurMp4 } from 'mp4-muxer'
import { ArrayBufferTarget as CibleWebm, Muxer as MuxeurWebm } from 'webm-muxer'
import type { Scene } from './scene'
import type { FormatVideo, QualiteVideo } from './types'
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
 * vite que la machine le permet, et un multiplexeur les range dans un fichier. Le temps de la
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

/* Deux conteneurs, et le mp4 d'abord.
 *
 * Le WebM est le format naturel du web et le seul que le magnétophone produise partout ; mais
 * cette vidéo-là ne finit pas dans un navigateur, elle finit dans un logiciel de montage
 * posée par-dessus une reprise. Or Resolve et Premiere ne lisent pas le WebM, ou le lisent
 * mal : le fichier arrivait donc au bout de la chaîne pour s'y faire refuser, et il fallait
 * le reconvertir à la main. Le mp4/H.264, lui, se pose dans n'importe quelle timeline.
 *
 * Le WebM reste offert : il est plus léger à qualité égale, et c'est le bon choix quand la
 * vidéo est destinée au web ou à un navigateur plutôt qu'à un montage.
 */

/* Par ordre de préférence, du profil le plus efficace au plus universel. Le niveau 5.2 couvre
   toutes les définitions qu'on propose jusqu'au 4K à soixante images ; les navigateurs qui
   ne l'ont pas se rabattent sur la suite de la liste, et sur le WebM si rien ne passe. */
const CODECS_AVC = ['avc1.640034', 'avc1.640028', 'avc1.4D4028', 'avc1.42E028']
const CODEC_VP9 = 'vp09.00.10.08'
const CODEC_AAC = 'mp4a.40.2'
const CODEC_OPUS = 'opus'
const CANAUX = 2

/**
 * Ce que coûte une qualité, selon la voie que l'encodeur accepte.
 *
 * Le quantificateur est le bon réglage pour cette image-ci, et de loin. Une tablature, c'est
 * des aplats immobiles que traverse un curseur : à qualité constante, la plupart des images ne
 * coûtent presque rien, et seules les pages qui tournent paient. Un débit imposé, lui, dépense
 * son budget qu'il en ait besoin ou non — mesuré sur un vrai export en 1080p à trente images,
 * quatre-vingt-seize mégaoctets pour trois minutes, avec des images intermédiaires de seize
 * kilooctets **toutes identiques à la centaine d'octets près**. Cette régularité-là ne vient
 * pas du morceau, elle vient du budget qu'on avait fixé.
 *
 * Le débit reste en réserve pour les navigateurs qui ne connaissent pas le mode quantificateur.
 * Son coefficient est en bits par pixel et par image : 0,04 donne deux mégabits par seconde en
 * 1080p à trente images, ce qui est déjà large pour du trait sur fond uni.
 */
const QUALITES: Record<QualiteVideo, { avc: number; vp9: number; bitsParPixel: number }> = {
  // Pour une incrustation dans un coin de l'écran, où les chiffres sont petits de toute façon.
  legere: { avc: 30, vp9: 40, bitsParPixel: 0.02 },
  standard: { avc: 25, vp9: 33, bitsParPixel: 0.04 },
  // Quand la tablature occupe l'écran entier et qu'on lit les doigtés dessus.
  nette: { avc: 21, vp9: 27, bitsParPixel: 0.08 },
}

/** Vrai si ce navigateur sait encoder par cette voie ce qu'on lui demande. */
export function encodagePossible(transparente: boolean): boolean {
  if (transparente) return false
  return (
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined'
  )
}

/** Le débit à demander quand le mode quantificateur n'est pas là. */
function debitVideo(largeur: number, hauteur: number, fps: number, qualite: QualiteVideo): number {
  const brut = largeur * hauteur * fps * QUALITES[qualite].bitsParPixel
  return Math.round(Math.min(24_000_000, Math.max(600_000, brut)))
}

interface Plan {
  format: FormatVideo
  video: VideoEncoderConfig
  audio: AudioEncoderConfig | null
  /** Le quantificateur à joindre à chaque image, ou `null` si l'encodeur travaille au débit. */
  quantificateur: number | null
  famille: 'avc' | 'vp9'
  codecAudio: 'aac' | 'opus'
}

async function videoAcceptee(config: VideoEncoderConfig): Promise<boolean> {
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported === true
  } catch {
    // Une configuration mal formée fait jeter plutôt que répondre « non » : c'est un « non ».
    return false
  }
}

async function audioAccepte(config: AudioEncoderConfig): Promise<boolean> {
  try {
    return (await AudioEncoder.isConfigSupported(config)).supported === true
  } catch {
    return false
  }
}

/**
 * La première configuration que ce navigateur accepte, en commençant par la meilleure.
 *
 * On demande plutôt que de deviner : le jeu de codecs disponibles change d'un navigateur à
 * l'autre, d'un système à l'autre, et même d'une machine à l'autre selon la carte graphique.
 * Le mode quantificateur est essayé en premier pour chaque codec, et abandonné sans bruit s'il
 * n'est pas là — c'est un gain de poids, pas une condition.
 */
async function choisirPlan(
  format: FormatVideo,
  largeur: number,
  hauteur: number,
  fps: number,
  qualite: QualiteVideo,
  avecSon: boolean,
  frequence: number,
): Promise<Plan | null> {
  const q = QUALITES[qualite]
  const debit = debitVideo(largeur, hauteur, fps, qualite)

  async function essayer(
    codecs: string[],
    famille: 'avc' | 'vp9',
  ): Promise<{ video: VideoEncoderConfig; quantificateur: number | null } | null> {
    for (const codec of codecs) {
      const base: VideoEncoderConfig = {
        codec,
        width: largeur,
        height: hauteur,
        framerate: fps,
        // Rien ne presse : la vidéo n'est pas diffusée pendant qu'on l'encode, et l'encodeur
        // peut donc prendre le temps de regarder plusieurs images avant de se décider.
        latencyMode: 'quality',
      }
      const auQuantificateur: VideoEncoderConfig = { ...base, bitrateMode: 'quantizer' }
      if (await videoAcceptee(auQuantificateur)) {
        return { video: auQuantificateur, quantificateur: famille === 'avc' ? q.avc : q.vp9 }
      }
      const auDebit: VideoEncoderConfig = { ...base, bitrate: debit }
      if (await videoAcceptee(auDebit)) return { video: auDebit, quantificateur: null }
    }
    return null
  }

  async function son(codecs: Array<'aac' | 'opus'>): Promise<Plan['codecAudio'] | null> {
    if (!avecSon) return 'opus'
    for (const codec of codecs) {
      if (await audioAccepte(configAudio(codec, frequence))) return codec
    }
    return null
  }

  /* Le mp4 exige des dimensions paires — c'est le sous-échantillonnage de la couleur qui
     travaille par blocs de deux pixels. La hauteur de bande est déjà arrondie au pair pour
     cette raison ; si une définition impaire arrivait quand même ici, mieux vaut un WebM
     lisible qu'un encodeur qui refuse. */
  const pair = largeur % 2 === 0 && hauteur % 2 === 0

  if (format === 'mp4' && pair) {
    const image = await essayer(CODECS_AVC, 'avc')
    const codecAudio = await son(['aac', 'opus'])
    if (image && codecAudio) {
      return {
        format: 'mp4',
        video: image.video,
        audio: avecSon ? configAudio(codecAudio, frequence) : null,
        quantificateur: image.quantificateur,
        famille: 'avc',
        codecAudio,
      }
    }
  }

  const image = await essayer([CODEC_VP9], 'vp9')
  const codecAudio = await son(['opus'])
  if (!image || !codecAudio) return null
  return {
    format: 'webm',
    video: image.video,
    audio: avecSon ? configAudio('opus', frequence) : null,
    quantificateur: image.quantificateur,
    famille: 'vp9',
    codecAudio,
  }
}

function configAudio(codec: 'aac' | 'opus', frequence: number): AudioEncoderConfig {
  return {
    codec: codec === 'aac' ? CODEC_AAC : CODEC_OPUS,
    numberOfChannels: CANAUX,
    sampleRate: frequence,
    bitrate: 160_000,
  }
}

/** Le multiplexeur, et ce qu'il faut savoir pour lui parler. */
interface Boite {
  ajouterVideo: (morceau: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata) => void
  ajouterAudio: (morceau: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void
  finir: () => Blob
}

function ouvrirBoite(plan: Plan, largeur: number, hauteur: number, fps: number): Boite {
  if (plan.format === 'mp4') {
    const cible = new CibleMp4()
    const muxeur = new MuxeurMp4({
      target: cible,
      video: { codec: 'avc', width: largeur, height: hauteur, frameRate: fps },
      audio: plan.audio
        ? {
            codec: plan.codecAudio,
            numberOfChannels: CANAUX,
            sampleRate: plan.audio.sampleRate,
          }
        : undefined,
      /* Les métadonnées en tête du fichier plutôt qu'en queue. Un mp4 dont l'index est à la
         fin s'ouvre quand même, mais il faut le lire en entier avant de pouvoir s'y déplacer —
         et un monteur qui pose un clip de trois minutes dans sa timeline se déplace dedans
         tout de suite. On garde tout en mémoire le temps de l'écrire : c'est déjà le cas du
         reste de l'export, et ça évite d'avoir à annoncer un nombre d'images à l'avance. */
      fastStart: 'in-memory',
    })
    return {
      ajouterVideo: (morceau, meta) => muxeur.addVideoChunk(morceau, meta),
      ajouterAudio: (morceau, meta) => muxeur.addAudioChunk(morceau, meta),
      finir: () => {
        muxeur.finalize()
        return new Blob([cible.buffer], { type: 'video/mp4' })
      },
    }
  }

  const cible = new CibleWebm()
  const muxeur = new MuxeurWebm({
    target: cible,
    video: { codec: 'V_VP9', width: largeur, height: hauteur, frameRate: fps },
    audio: plan.audio
      ? { codec: 'A_OPUS', numberOfChannels: CANAUX, sampleRate: plan.audio.sampleRate }
      : undefined,
    // Le fichier est écrit d'un bloc et relu ensuite : rien à diffuser au fil de l'eau, et on
    // garde ainsi la durée et les points de recherche, qu'un flux perdrait.
    streaming: false,
  })
  return {
    ajouterVideo: (morceau, meta) => muxeur.addVideoChunk(morceau, meta),
    ajouterAudio: (morceau, meta) => muxeur.addAudioChunk(morceau, meta),
    finir: () => {
      muxeur.finalize()
      return new Blob([cible.buffer], { type: 'video/webm' })
    },
  }
}

/**
 * Les options d'une image : l'image clef, et le quantificateur quand l'encodeur le prend.
 *
 * Le champ porte le nom de la famille de codecs, et `vp9` n'est pas encore dans les
 * déclarations du DOM — d'où la conversion, qui ne cache rien d'autre que le retard des types.
 */
function optionsImage(plan: Plan, clef: boolean): VideoEncoderEncodeOptions {
  if (plan.quantificateur === null) return { keyFrame: clef }
  const champ = plan.famille === 'avc' ? 'avc' : 'vp9'
  return {
    keyFrame: clef,
    [champ]: { quantizer: plan.quantificateur },
  } as VideoEncoderEncodeOptions
}

export async function encoder(
  scene: Scene,
  options: OptionsEnregistrement,
): Promise<Enregistrement> {
  const { fps } = options
  const images = Math.max(1, Math.round((scene.dureeMs / 1000) * fps))
  const frequence = options.audio?.sampleRate ?? 48000

  const plan = await choisirPlan(
    options.format ?? 'mp4',
    scene.largeur,
    scene.hauteur,
    fps,
    options.qualite ?? 'standard',
    Boolean(options.audio),
    frequence,
  )
  if (!plan) throw new Error("Ce navigateur n'a aucun encodeur vidéo utilisable.")

  const canvas = document.createElement('canvas')
  canvas.width = scene.largeur
  canvas.height = scene.hauteur
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('Impossible de préparer le canvas de rendu.')

  const boite = ouvrirBoite(plan, scene.largeur, scene.hauteur, fps)

  let echec: Error | null = null
  const encodeurVideo = new VideoEncoder({
    output: (morceau, meta) => boite.ajouterVideo(morceau, meta),
    error: (err) => {
      echec ??= err
    },
  })
  encodeurVideo.configure(plan.video)

  let encodeurAudio: AudioEncoder | null = null
  if (options.audio && plan.audio) {
    encodeurAudio = new AudioEncoder({
      output: (morceau, meta) => boite.ajouterAudio(morceau, meta),
      error: (err) => {
        echec ??= err
      },
    })
    encodeurAudio.configure(plan.audio)
  }

  const interrompu = () => options.signal?.aborted === true

  let blob: Blob
  try {
    if (options.audio && encodeurAudio) encoderLeSon(encodeurAudio, options.audio, scene.dureeMs)

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
      // sans faire enfler le fichier. Mesuré sur un export de trois minutes, les images clefs
      // ne pèsent que quatre pour cent du total — ce n'est pas là que se joue le poids.
      encodeurVideo.encode(image, optionsImage(plan, i % Math.max(1, Math.round(fps * 2)) === 0))
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
    blob = boite.finir()
  } finally {
    if (encodeurVideo.state !== 'closed') encodeurVideo.close()
    if (encodeurAudio && encodeurAudio.state !== 'closed') encodeurAudio.close()
  }

  options.onProgression?.(1, scene.dureeMs)

  return {
    blob,
    ext: plan.format === 'mp4' ? '.mp4' : '.webm',
    type: plan.format === 'mp4' ? 'video/mp4;codecs=avc1,mp4a.40.2' : 'video/webm;codecs=vp9,opus',
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
