import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { trierSystemes, type PageRendue } from '../../lib/pdf'
import type { SystemePdf } from '../../lib/types'

/**
 * Le découpage d'un PDF en lignes de tablature, à la main.
 *
 * La détection automatique fait le gros du travail, mais elle se trompe : elle rate une
 * ligne mangée par une annotation, elle prend un cartouche d'accords pour une portée. Cet
 * écran existe pour que ces erreurs coûtent un geste et non un abandon — on tire un
 * rectangle pour ajouter, on le déplace, on l'étire, on le supprime.
 *
 * L'ordre de lecture n'est jamais demandé : les systèmes sont triés de haut en bas, page
 * après page, c'est-à-dire exactement comme on lit une partition. Un numéro est affiché
 * sur chacun pour que ce tri soit vérifiable d'un coup d'œil.
 */

type Poignee = 'deplacer' | 'gauche' | 'droite' | 'haut' | 'bas'

interface Geste {
  page: number
  index: number
  poignee: Poignee
  /** Position de départ du pointeur, en fraction de page. */
  xDepart: number
  yDepart: number
  origine: SystemePdf
}

export function EditeurSystemes({
  pages,
  systemes,
  mesuresParDefaut,
  onChange,
}: {
  pages: PageRendue[]
  systemes: SystemePdf[]
  mesuresParDefaut: number
  onChange: (systemes: SystemePdf[]) => void
}) {
  const [geste, setGeste] = useState<Geste | null>(null)
  const [trace, setTrace] = useState<{
    page: number
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)

  function positionDans(e: ReactPointerEvent, element: HTMLElement) {
    const cadre = element.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - cadre.left) / cadre.width)),
      y: Math.min(1, Math.max(0, (e.clientY - cadre.top) / cadre.height)),
    }
  }

  function commencerTrace(e: ReactPointerEvent, page: number) {
    if (e.button !== 0) return
    const { x, y } = positionDans(e, e.currentTarget as HTMLElement)
    e.currentTarget.setPointerCapture(e.pointerId)
    setTrace({ page, x0: x, y0: y, x1: x, y1: y })
  }

  function commencerGeste(e: ReactPointerEvent, index: number, poignee: Poignee) {
    e.stopPropagation()
    if (e.button !== 0) return
    const systeme = systemes[index]
    const parent = (e.currentTarget as HTMLElement).closest('[data-page]') as HTMLElement | null
    if (!parent) return
    const { x, y } = positionDans(e, parent)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setGeste({ page: systeme.page, index, poignee, xDepart: x, yDepart: y, origine: systeme })
  }

  function bouger(e: ReactPointerEvent, page: number) {
    const cible = (e.currentTarget as HTMLElement).closest('[data-page]') as HTMLElement | null
    if (!cible) return
    const { x, y } = positionDans(e, cible)

    if (trace && trace.page === page) {
      setTrace({ ...trace, x1: x, y1: y })
      return
    }
    if (!geste) return

    const dx = x - geste.xDepart
    const dy = y - geste.yDepart
    const base = geste.origine
    let suivant: SystemePdf = { ...base }

    if (geste.poignee === 'deplacer') {
      // Le déplacement est borné dans la page entière plutôt que par composante : un
      // rectangle qu'on pousse contre le bord glisse le long au lieu de se déformer.
      const largeur = base.x1 - base.x0
      const hauteur = base.y1 - base.y0
      const x0 = Math.min(1 - largeur, Math.max(0, base.x0 + dx))
      const y0 = Math.min(1 - hauteur, Math.max(0, base.y0 + dy))
      suivant = { ...base, x0, x1: x0 + largeur, y0, y1: y0 + hauteur }
    } else if (geste.poignee === 'gauche') {
      suivant.x0 = Math.min(base.x1 - 0.02, Math.max(0, base.x0 + dx))
    } else if (geste.poignee === 'droite') {
      suivant.x1 = Math.max(base.x0 + 0.02, Math.min(1, base.x1 + dx))
    } else if (geste.poignee === 'haut') {
      suivant.y0 = Math.min(base.y1 - 0.01, Math.max(0, base.y0 + dy))
    } else {
      suivant.y1 = Math.max(base.y0 + 0.01, Math.min(1, base.y1 + dy))
    }

    const copie = [...systemes]
    copie[geste.index] = suivant
    onChange(copie)
  }

  function terminer() {
    if (trace) {
      const x0 = Math.min(trace.x0, trace.x1)
      const x1 = Math.max(trace.x0, trace.x1)
      const y0 = Math.min(trace.y0, trace.y1)
      const y1 = Math.max(trace.y0, trace.y1)
      // Un rectangle minuscule vient d'un clic, pas d'une intention : on l'ignore, plutôt
      // que de semer des systèmes invisibles à chaque fois qu'on clique pour désélectionner.
      if (x1 - x0 > 0.05 && y1 - y0 > 0.01) {
        onChange(
          trierSystemes([
            ...systemes,
            { page: trace.page, x0, x1, y0, y1, mesures: mesuresParDefaut },
          ]),
        )
      }
      setTrace(null)
    }
    if (geste) {
      onChange(trierSystemes(systemes))
      setGeste(null)
    }
  }

  return (
    <div className="space-y-4">
      {pages.map((page) => (
        <div
          key={page.index}
          data-page={page.index}
          onPointerDown={(e) => commencerTrace(e, page.index)}
          onPointerMove={(e) => bouger(e, page.index)}
          onPointerUp={terminer}
          onPointerCancel={terminer}
          className="relative touch-none select-none overflow-hidden rounded-lg border border-slate-700 bg-white"
        >
          <Papier page={page} />

          {systemes.map((systeme, index) =>
            systeme.page !== page.index ? null : (
              <Rectangle
                key={index}
                numero={index + 1}
                systeme={systeme}
                surPoignee={(e, poignee) => commencerGeste(e, index, poignee)}
                surSupprimer={() => onChange(systemes.filter((_, i) => i !== index))}
                surMesures={(mesures) => {
                  const copie = [...systemes]
                  copie[index] = { ...systeme, mesures }
                  onChange(copie)
                }}
              />
            ),
          )}

          {trace && trace.page === page.index ? (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-amber-400 bg-amber-400/20"
              style={{
                left: `${Math.min(trace.x0, trace.x1) * 100}%`,
                top: `${Math.min(trace.y0, trace.y1) * 100}%`,
                width: `${Math.abs(trace.x1 - trace.x0) * 100}%`,
                height: `${Math.abs(trace.y1 - trace.y0) * 100}%`,
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}

/* Le canvas rendu par pdf.js est inséré tel quel plutôt que recopié en image : c'est le
   même objet qui sert de source à la vidéo, et le dupliquer doublerait la mémoire occupée
   par une partition de six pages sans rien apporter. */
function Papier({ page }: { page: PageRendue }) {
  const hote = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const boite = hote.current
    const canvas = page.canvas
    if (!boite) return
    boite.appendChild(canvas)
    return () => {
      if (canvas.parentNode === boite) boite.removeChild(canvas)
    }
  }, [page])

  // La mise à l'échelle passe par le CSS du parent plutôt que par le style du canvas :
  // celui-ci appartient au rendu du PDF, et la vidéo le relit tel quel.
  return (
    <div
      ref={hote}
      className="pointer-events-none [&>canvas]:block [&>canvas]:h-auto [&>canvas]:w-full"
    />
  )
}

function Rectangle({
  numero,
  systeme,
  surPoignee,
  surSupprimer,
  surMesures,
}: {
  numero: number
  systeme: SystemePdf
  surPoignee: (e: ReactPointerEvent, poignee: Poignee) => void
  surSupprimer: () => void
  surMesures: (mesures: number) => void
}) {
  const style = {
    left: `${systeme.x0 * 100}%`,
    top: `${systeme.y0 * 100}%`,
    width: `${(systeme.x1 - systeme.x0) * 100}%`,
    height: `${(systeme.y1 - systeme.y0) * 100}%`,
  }

  return (
    <div
      style={style}
      onPointerDown={(e) => surPoignee(e, 'deplacer')}
      className="absolute cursor-move touch-none border-2 border-amber-500 bg-amber-500/15"
    >
      <span className="absolute -top-0.5 -left-0.5 rounded-br bg-amber-500 px-1.5 text-xs font-bold text-slate-950">
        {numero}
      </span>

      <div className="absolute top-0 right-0 flex items-center gap-1 bg-slate-950/80 px-1">
        <input
          type="number"
          min={1}
          max={64}
          value={systeme.mesures}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => surMesures(Math.max(1, Number(e.target.value) || 1))}
          className="w-10 bg-transparent text-right text-xs text-amber-300 outline-none"
          aria-label={`Mesures du système ${numero}`}
        />
        <span className="text-[0.6rem] text-slate-400">mes.</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={surSupprimer}
          className="px-1 text-xs text-slate-400 hover:text-red-400"
          aria-label={`Supprimer le système ${numero}`}
        >
          ✕
        </button>
      </div>

      <Poignee position="gauche" onPointerDown={(e) => surPoignee(e, 'gauche')} />
      <Poignee position="droite" onPointerDown={(e) => surPoignee(e, 'droite')} />
      <Poignee position="haut" onPointerDown={(e) => surPoignee(e, 'haut')} />
      <Poignee position="bas" onPointerDown={(e) => surPoignee(e, 'bas')} />
    </div>
  )
}

const POIGNEES: Record<Poignee, string> = {
  deplacer: '',
  gauche: 'left-0 top-0 h-full w-2 -ml-1 cursor-ew-resize',
  droite: 'right-0 top-0 h-full w-2 -mr-1 cursor-ew-resize',
  haut: 'top-0 left-0 w-full h-2 -mt-1 cursor-ns-resize',
  bas: 'bottom-0 left-0 w-full h-2 -mb-1 cursor-ns-resize',
}

function Poignee({
  position,
  onPointerDown,
}: {
  position: Poignee
  onPointerDown: (e: ReactPointerEvent) => void
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute touch-none bg-amber-500/0 hover:bg-amber-400/60 ${POIGNEES[position]}`}
    />
  )
}
