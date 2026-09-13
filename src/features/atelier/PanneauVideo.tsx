import { Card } from '../../components/ui/Card'
import { Field, Select } from '../../components/ui/Field'
import { THEMES, themeParId } from '../../lib/themes'
import type { Cadre, Disposition, FondVideo, ReglagesVideo } from '../../lib/types'
import { alphaPossible } from '../../lib/video'

/* Trois définitions, pas douze. 1080p pour publier, 720p quand la machine peine à encoder en
   temps réel, et le format vertical pour ce qui finit sur un téléphone. */
const DEFINITIONS = [
  { label: '1080p — 1920 × 1080', largeur: 1920, hauteur: 1080 },
  { label: '720p — 1280 × 720', largeur: 1280, hauteur: 720 },
  { label: 'Vertical — 1080 × 1920', largeur: 1080, hauteur: 1920 },
]

const DISPOSITIONS: Array<{ id: Disposition; nom: string; aide: string }> = [
  {
    id: 'defilement',
    nom: 'Défilement horizontal',
    aide: 'Une seule bande qui glisse sous une tête de lecture fixe. C’est la disposition à incruster dans une vidéo de reprise.',
  },
  {
    id: 'page',
    nom: 'Page',
    aide: 'La partition entière, qui défile vers le bas. Pour travailler un morceau plutôt que pour l’illustrer.',
  },
]

const CADRES: Array<{ id: Cadre; nom: string }> = [
  { id: 'aucun', nom: 'Aucun' },
  { id: 'carte', nom: 'Carte — coins arrondis et filet' },
  { id: 'lueur', nom: 'Lueur — halo de la couleur du curseur' },
  { id: 'bandes', nom: 'Bandes — fond translucide et liserés' },
  { id: 'vignette', nom: 'Vignette — bords assombris' },
]

const COULEURS = ['#4ade80', '#f59e0b', '#ef4444', '#38bdf8', '#a855f7', '#ec4899', '#ffffff']

export function PanneauMiseEnScene({
  video,
  modifier,
}: {
  video: ReglagesVideo
  modifier: (mutation: (v: ReglagesVideo) => ReglagesVideo) => void
}) {
  const theme = themeParId(video.theme)
  const defilement = video.disposition === 'defilement'

  return (
    <Card className="space-y-4">
      <h2 className="font-medium text-slate-200">Mise en scène</h2>

      <div className="space-y-2">
        {DISPOSITIONS.map((choix) => (
          <label
            key={choix.id}
            className={`block cursor-pointer rounded-lg border p-3 transition-colors ${
              video.disposition === choix.id
                ? 'border-amber-600 bg-amber-950/30'
                : 'border-slate-700 hover:border-slate-600'
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <input
                type="radio"
                name="disposition"
                checked={video.disposition === choix.id}
                onChange={() => modifier((v) => ({ ...v, disposition: choix.id }))}
                className="accent-amber-500"
              />
              {choix.nom}
            </span>
            <span className="mt-1 block text-xs text-slate-400">{choix.aide}</span>
          </label>
        ))}
      </div>

      <Field label="Thème" hint={theme.description}>
        <Select
          value={video.theme}
          onChange={(e) => {
            const choisi = themeParId(e.target.value)
            // La couleur du curseur suit le thème tant qu'on n'y a pas touché soi-même :
            // un curseur ambre sur un thème néon violet est un oubli, pas un choix.
            modifier((v) => ({
              ...v,
              theme: choisi.id,
              couleur: COULEURS.includes(v.couleur) ? choisi.curseur : v.couleur,
            }))
          }}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nom}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex gap-1.5">
        {[theme.fond, theme.papier ?? theme.fond, theme.lignes, theme.encre, theme.curseur].map(
          (couleur, i) => (
            <span
              key={i}
              style={{ backgroundColor: couleur }}
              className="h-6 flex-1 rounded border border-slate-700"
            />
          ),
        )}
        {theme.cordes ? (
          <span className="ml-2 flex flex-1 overflow-hidden rounded border border-slate-700">
            {theme.cordes.map((couleur) => (
              <span key={couleur} style={{ backgroundColor: couleur }} className="h-6 flex-1" />
            ))}
          </span>
        ) : null}
      </div>

      {defilement ? (
        <>
          <Curseur
            label="Taille de la tablature"
            valeur={video.hauteurBande}
            min={0.15}
            max={0.9}
            pas={0.01}
            affichage={`${Math.round(video.hauteurBande * 100)} % de la hauteur`}
            aide="Plus la bande est haute, plus les chiffres sont gros — et moins il y a de mesures visibles d’avance."
            onChange={(hauteurBande) => modifier((v) => ({ ...v, hauteurBande }))}
          />
          <Curseur
            label="Tête de lecture"
            valeur={video.teteX}
            min={0.1}
            max={0.7}
            pas={0.01}
            affichage={`${Math.round(video.teteX * 100)} % depuis la gauche`}
            aide="À gauche, on voit venir la suite de loin ; au milieu, on garde autant de passé que d’avenir."
            onChange={(teteX) => modifier((v) => ({ ...v, teteX }))}
          />
        </>
      ) : null}

      <Field label="Encadrement">
        <Select
          value={video.cadre}
          onChange={(e) => modifier((v) => ({ ...v, cadre: e.target.value as Cadre }))}
        >
          {CADRES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nom}
            </option>
          ))}
        </Select>
      </Field>
    </Card>
  )
}

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
  const alpha = alphaPossible()

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

      <Field
        label="Fond"
        hint={
          video.fond === 'chroma'
            ? 'Un vert plein, à détourer dans le montage. Ça marche partout, y compris sur Safari.'
            : video.fond === 'transparent'
              ? alpha
                ? 'Vraie transparence, en WebM VP8. À vérifier : tous les logiciels de montage ne la lisent pas.'
                : 'Ce navigateur ne sait pas encoder la transparence — la vidéo sortira sur le fond du thème. Prends plutôt le fond vert.'
              : 'Le fond du thème, opaque.'
        }
      >
        <Select
          value={video.fond}
          onChange={(e) => modifier((v) => ({ ...v, fond: e.target.value as FondVideo }))}
        >
          <option value="theme">Couleur du thème</option>
          <option value="chroma">Vert d’incrustation</option>
          <option value="transparent">Transparent</option>
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

      <div className="space-y-2">
        <Bascule
          label="Titre et artiste en haut"
          actif={video.bandeau}
          onChange={(bandeau) => modifier((v) => ({ ...v, bandeau }))}
        />
        <Bascule
          label="Barre de progression en bas"
          actif={video.barreDeProgression}
          onChange={(barreDeProgression) => modifier((v) => ({ ...v, barreDeProgression }))}
        />
        <Bascule
          label="Fondu au début et à la fin"
          actif={video.fondu}
          onChange={(fondu) => modifier((v) => ({ ...v, fondu }))}
        />
      </div>
    </Card>
  )
}

function Bascule({
  label,
  actif,
  onChange,
}: {
  label: string
  actif: boolean
  onChange: (actif: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-300">
      <input
        type="checkbox"
        checked={actif}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-amber-500"
      />
      {label}
    </label>
  )
}

function Curseur({
  label,
  valeur,
  min,
  max,
  pas,
  affichage,
  aide,
  onChange,
}: {
  label: string
  valeur: number
  min: number
  max: number
  pas: number
  affichage: string
  aide?: string
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
      {aide ? <span className="mt-1 block text-xs text-slate-500">{aide}</span> : null}
    </label>
  )
}
