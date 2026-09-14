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

  /* Le clavier, parce qu'on règle d'une main et qu'on relit sans arrêt le même passage.
     Espace lance et arrête, les flèches se déplacent de cinq secondes, Origine revient au
     début — les touches d'un lecteur vidéo, pour ne rien avoir à apprendre.

     Écouté sur la fenêtre plutôt que sur l'aperçu : il n'a pas le focus, on vient de bouger
     un curseur de réglage. Un champ de saisie garde en revanche ses touches, sinon taper un
     titre contenant une espace lancerait la lecture. */
  useEffect(() => {
    if (!scene) return
    const dureeMs = scene.dureeMs
    function surTouche(e: KeyboardEvent) {
      const cible = e.target as HTMLElement | null
      const saisie =
        cible?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible?.tagName ?? '')
      if (saisie || e.metaKey || e.ctrlKey || e.altKey) return
      const lecteur = apercu.current
      if (!lecteur) return

      if (e.code === 'Space') {
        e.preventDefault()
        basculer()
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault()
        const pas = (e.shiftKey ? 1000 : 5000) * (e.key === 'ArrowRight' ? 1 : -1)
        lecteur.allerA(Math.min(dureeMs, Math.max(0, lecteur.position() + pas)))
      } else if (e.key === 'Home') {
        e.preventDefault()
        lecteur.allerA(0)
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
    // `basculer` est refait à chaque rendu mais ne lit que des références : l'attacher aux
    // dépendances ferait poser et retirer l'écouteur trente fois par seconde pendant la lecture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  // La lecture s'arrête d'elle-même à la fin : le bouton doit le savoir, sinon il continue
  // d'afficher « pause » devant une image figée.
  useEffect(() => {
    if (enLecture && scene && position >= scene.dureeMs - 20) setEnLecture(false)
  }, [position, enLecture, scene])

  /* L'aperçu se colle en haut de l'écran pendant qu'on fait défiler les réglages — mais
     seulement quand il est assez plat pour ne pas manger la page. Une bande d'incrustation
     fait un cinquième de sa largeur ; une page entière, ou un format vertical, en fait une
     fois et demie, et resterait planté devant tout ce qu'on essaie de régler. Le seuil est
     donc sur la forme de l'image et non sur la disposition, parce que c'est la forme qui
     décide de la place prise. */
  const plat = scene ? scene.hauteur / scene.largeur <= 0.25 : false

  return (
    <div
      className={`overflow-hidden rounded-xl border border-slate-800 bg-slate-950 ${
        plat ? 'sticky top-0 z-20 shadow-lg shadow-slate-950/80' : ''
      }`}
    >
      {/* Un damier derrière l'aperçu quand la scène est transparente : sans lui, on ne
          distinguerait pas un fond transparent d'un fond noir, et la case correspondante
          semblerait sans effet. */}
      <div
        className="relative bg-black"
        style={
          scene?.transparente
            ? {
                backgroundImage: 'repeating-conic-gradient(#334155 0% 25%, #1e293b 0% 50%)',
                backgroundSize: '24px 24px',
              }
            : undefined
        }
      >
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
          title="Espace"
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
