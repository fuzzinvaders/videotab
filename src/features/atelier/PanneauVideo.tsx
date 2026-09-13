import { Card } from '../../components/ui/Card'
import { Field, Select } from '../../components/ui/Field'
import type { ReglagesVideo } from '../../lib/types'

/* Trois définitions, pas douze. 1080p pour publier, 720p quand la machine peine à encoder
   en temps réel, et le format vertical pour ce qui finit sur un téléphone — où une
   tablature tient d'autant mieux qu'elle a peu de largeur à remplir. */
const DEFINITIONS = [
  { label: '1080p — 1920 × 1080', largeur: 1920, hauteur: 1080 },
  { label: '720p — 1280 × 720', largeur: 1280, hauteur: 720 },
  { label: 'Vertical — 1080 × 1920', largeur: 1080, hauteur: 1920 },
]

const COULEURS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899']

export function PanneauVideo({
  video,
  modifier,
}: {
  video: ReglagesVideo
  modifier: (mutation: (v: ReglagesVideo) => ReglagesVideo) => void
}) {
  const definition =
    DEFINITIONS.find((d) => d.largeur === video.largeur && d.hauteur === video.hauteur)?.label ??
    DEFINITIONS[0].label

  return (
    <Card className="space-y-4">
      <h2 className="font-medium text-slate-200">Vidéo</h2>

      <Field label="Définition">
        <Select
          value={definition}
          onChange={(e) => {
            const choix = DEFINITIONS.find((d) => d.label === e.target.value)
            if (choix) modifier((v) => ({ ...v, largeur: choix.largeur, hauteur: choix.hauteur }))
          }}
        >
          {DEFINITIONS.map((d) => (
            <option key={d.label}>{d.label}</option>
          ))}
        </Select>
      </Field>

      <Field label="Images par seconde" hint="30 suffit pour un curseur ; 60 coûte le double.">
        <Select
          value={String(video.fps)}
          onChange={(e) => modifier((v) => ({ ...v, fps: Number(e.target.value) }))}
        >
          <option value="24">24</option>
          <option value="30">30</option>
          <option value="60">60</option>
        </Select>
      </Field>

      <div>
        <span className="mb-1 block text-sm font-medium text-slate-300">Couleur du curseur</span>
        <div className="flex flex-wrap gap-2">
          {COULEURS.map((couleur) => (
            <button
              key={couleur}
              onClick={() => modifier((v) => ({ ...v, couleur }))}
              style={{ backgroundColor: couleur }}
              className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-slate-900 transition-all ${
                video.couleur === couleur ? 'ring-2 ring-slate-100' : ''
              }`}
              aria-label={`Curseur ${couleur}`}
            />
          ))}
        </div>
      </div>

      <Curseur
        label="Surlignage"
        valeur={video.opacite}
        min={0}
        max={0.8}
        pas={0.05}
        affichage={`${Math.round(video.opacite * 100)} %`}
        onChange={(opacite) => modifier((v) => ({ ...v, opacite }))}
      />

      <Curseur
        label="Décompte avant le départ"
        valeur={video.compteAvantSec}
        min={0}
        max={8}
        pas={1}
        affichage={video.compteAvantSec === 0 ? 'aucun' : `${video.compteAvantSec} s`}
        onChange={(compteAvantSec) => modifier((v) => ({ ...v, compteAvantSec }))}
      />

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={video.fondu}
          onChange={(e) => modifier((v) => ({ ...v, fondu: e.target.checked }))}
          className="h-4 w-4 accent-amber-500"
        />
        Fondu au début et à la fin
      </label>
    </Card>
  )
}

function Curseur({
  label,
  valeur,
  min,
  max,
  pas,
  affichage,
  onChange,
}: {
  label: string
  valeur: number
  min: number
  max: number
  pas: number
  affichage: string
  onChange: (valeur: number) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-sm font-medium text-slate-300">
        {label}
        <span className="font-mono text-xs text-slate-500">{affichage}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={pas}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-amber-500"
      />
    </label>
  )
}
