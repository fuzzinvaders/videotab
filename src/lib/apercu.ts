import { latenceSortieMs, reveillerAudio } from './audio'
import type { Scene } from './scene'

/**
 * L'aperçu : la même scène que la vidéo, jouée dans la page.
 *
 * Rien ici ne sert à l'export — et c'est bien l'intérêt. L'aperçu dessine exactement ce
 * que l'enregistreur dessinera, avec le même code, la même bande-son et le même curseur.
 * Ce qu'on voit avant de lancer les trois minutes d'encodage est donc ce qu'on obtiendra
 * après, ce qui évite de découvrir un mauvais découpage à la fin.
 */

export interface Apercu {
  jouer(): Promise<void>
  pause(): void
  allerA(tMs: number): void
  estEnLecture(): boolean
  position(): number
  redessiner(): void
  detruire(): void
}

export function creerApercu(
  canvas: HTMLCanvasElement,
  scene: Scene,
  options: { audio?: AudioBuffer | null; onTemps?: (tMs: number) => void } = {},
): Apercu {
  canvas.width = scene.largeur
  canvas.height = scene.hauteur
  // Même canal alpha que l'export : une scène transparente doit se voir transparente ici,
  // sinon la case « fond transparent » ne montre rien de ce qu'elle fait.
  const ctx = canvas.getContext('2d', { alpha: scene.transparente })

  let position = 0
  let source: AudioBufferSourceNode | null = null
  let origine = 0
  let boucle = 0
  let vivant = true

  function dessiner(tMs: number) {
    if (!ctx) return
    position = Math.max(0, Math.min(scene.dureeMs, tMs))
    scene.dessiner(ctx, position)
    options.onTemps?.(position)
  }

  function arreterSource() {
    if (!source) return
    try {
      source.stop()
    } catch {
      // Déjà terminée : la bande-son s'est arrêtée avant qu'on le lui demande.
    }
    source.disconnect()
    source = null
  }

  function tourner() {
    if (!vivant) return
    const tMs = performance.now() - origine
    if (tMs >= scene.dureeMs) {
      dessiner(scene.dureeMs)
      pause()
      return
    }
    dessiner(tMs)
    boucle = requestAnimationFrame(tourner)
  }

  async function jouer() {
    if (boucle) return
    // Repartir depuis le début quand on est au bout : c'est le geste attendu d'un bouton
    // de lecture, et éviter à l'utilisateur d'aller d'abord rembobiner.
    if (position >= scene.dureeMs - 20) position = 0
    scene.reinitialiser(position)

    let retard = 0
    if (options.audio) {
      const contexte = await reveillerAudio()
      arreterSource()
      source = contexte.createBufferSource()
      source.buffer = options.audio
      source.connect(contexte.destination)
      // La bande-son démarre à l'endroit où en est l'image, pas à zéro : sans ce décalage,
      // reprendre la lecture au milieu jouerait le morceau depuis son début.
      source.start(0, Math.max(0, position / 1000))
      /* Et l'image attend que ce son soit audible. Ce qu'on vient de programmer ne sort pas
         du haut-parleur maintenant mais dans quelques dizaines de millisecondes, le temps de
         traverser le tampon puis la carte son. Partir tout de suite mettait l'image en avance
         d'autant, ce qui ne s'entend pas mais se voit très bien sur une attaque. */
      retard = latenceSortieMs(contexte)
    }

    origine = performance.now() + retard - position
    boucle = requestAnimationFrame(tourner)
  }

  function pause() {
    if (boucle) cancelAnimationFrame(boucle)
    boucle = 0
    arreterSource()
  }

  function allerA(tMs: number) {
    const enLecture = boucle !== 0
    pause()
    position = Math.max(0, Math.min(scene.dureeMs, tMs))
    // Le défilement de la scène est lissé dans le temps : sans réinitialisation, sauter à
    // la fin d'un morceau ferait descendre l'image lentement au lieu d'y être déjà.
    scene.reinitialiser(position)
    dessiner(position)
    if (enLecture) void jouer()
  }

  dessiner(0)

  return {
    jouer,
    pause,
    allerA,
    estEnLecture: () => boucle !== 0,
    position: () => position,
    redessiner: () => dessiner(position),
    detruire() {
      vivant = false
      pause()
    },
  }
}
