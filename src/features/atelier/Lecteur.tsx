import { useEffect, useRef, useState } from 'react'
import { creerApercu, type Apercu } from '../../lib/apercu'
import { formaterDuree } from '../../lib/minutage'
import type { Scene } from '../../lib/scene'

/**
 * L'aperçu et son transport.
 *
 * Le canvas est à la définition de la vidéo (1920×1080 le plus souvent) et affiché à la
 * taille de la colonne : ce qu'on regarde ici est donc l'image exacte qui sera encodée,
 * réduite, et non une mise en page approchante qui réserverait ses surprises à la fin.
 */
export function Lecteur({
  scene,
  audio,
  message,
}: {
  scene: Scene | null
  audio: AudioBuffer | null
  message?: string | null
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const apercu = useRef<Apercu | null>(null)
  const [position, setPosition] = useState(0)
  const [enLecture, setEnLecture] = useState(false)

  useEffect(() => {
    if (!canvas.current || !scene) return
    const lecteur = creerApercu(canvas.current, scene, { audio, onTemps: setPosition })
    apercu.current = lecteur
    // Pas sur la toute première image : la vidéo commence par un fondu au noir, et un
    // aperçu entièrement noir donne l'impression que rien n'a marché. On se pose juste
    // après, là où il y a quelque chose à voir.
    lecteur.allerA(Math.min(800, scene.dureeMs * 0.1))
    setEnLecture(false)
    return () => {
      lecteur.detruire()
      apercu.current = null
    }
  }, [scene, audio])

  function basculer() {
    const lecteur = apercu.current
    if (!lecteur) return
    if (lecteur.estEnLecture()) {
      lecteur.pause()
      setEnLecture(false)
    } else {
      void lecteur.jouer()
      setEnLecture(true)
    }
  }

  // La lecture s'arrête d'elle-même à la fin : le bouton doit le savoir, sinon il continue
  // d'afficher « pause » devant une image figée.
  useEffect(() => {
    if (enLecture && scene && position >= scene.dureeMs - 20) setEnLecture(false)
  }, [position, enLecture, scene])

  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <div className="relative bg-black">
        <canvas ref={canvas} className="block h-auto w-full" />
        {!scene ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-6 text-center text-sm text-slate-400">
            {message ?? 'Préparation…'}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 px-3 py-2">
        <button
          onClick={basculer}
          disabled={!scene}
          className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-40"
          aria-label={enLecture ? 'Pause' : 'Lecture'}
        >
          {enLecture ? '❚❚' : '▶'}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(1, scene?.dureeMs ?? 1)}
          step={10}
          value={position}
          onChange={(e) => apercu.current?.allerA(Number(e.target.value))}
          disabled={!scene}
          className="flex-1 accent-amber-500"
          aria-label="Position dans le morceau"
        />
        <span className="font-mono text-xs text-slate-400 tabular-nums">
          {formaterDuree(position)} / {formaterDuree(scene?.dureeMs ?? 0)}
        </span>
      </div>
    </div>
  )
}
