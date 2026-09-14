import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText } from '../../components/ui/Field'
import { useMorceaux } from '../../hooks/useMorceaux'
import { messageOf } from '../../lib/api'
import { formaterDuree } from '../../lib/minutage'
import type { Morceau } from '../../lib/types'

const EXTENSIONS = '.gp,.gp3,.gp4,.gp5,.gpx,.musicxml,.mxl,.xml,.capx,.alphatab,.atex,.pdf'

function poids(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

function quand(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function BibliothequePage() {
  const { morceaux, chargement, erreur, importer, espaceVideos } = useMorceaux()
  const naviguer = useNavigate()
  const champ = useRef<HTMLInputElement>(null)
  const [survol, setSurvol] = useState(false)
  const [envoi, setEnvoi] = useState<number | null>(null)
  const [probleme, setProbleme] = useState<string | null>(null)

  async function accepter(fichiers: FileList | null) {
    const fichier = fichiers?.[0]
    if (!fichier) return
    setProbleme(null)
    setEnvoi(0)
    try {
      const morceau = await importer(fichier, setEnvoi)
      // On enchaîne directement sur l'atelier : importer une tablature n'est jamais un but
      // en soi, c'est le premier geste d'une suite qui en compte trois.
      naviguer(`/atelier/${morceau.id}`)
    } catch (err) {
      setProbleme(messageOf(err, "L'import a échoué."))
    } finally {
      setEnvoi(null)
      if (champ.current) champ.current.value = ''
    }
  }

  function deposer(e: DragEvent) {
    e.preventDefault()
    setSurvol(false)
    void accepter(e.dataTransfer.files)
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setSurvol(true)
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={deposer}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          survol ? 'border-amber-500 bg-amber-950/20' : 'border-slate-700 bg-slate-900/50'
        }`}
      >
        <div className="text-4xl">🎬</div>
        <h1 className="mt-3 text-xl font-semibold text-slate-100">
          Dépose une tablature, repars avec une vidéo
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
          Guitar Pro (.gp, .gp3 à .gp5, .gpx), MusicXML, ou un PDF scanné. Les fichiers Guitar Pro
          apportent leurs notes et leur tempo&nbsp;; un PDF n'est qu'une image, et c'est toi qui lui
          donneras son minutage dans l'atelier.
        </p>
        <div className="mt-5">
          <input
            ref={champ}
            type="file"
            accept={EXTENSIONS}
            className="hidden"
            onChange={(e) => void accepter(e.target.files)}
          />
          <Button onClick={() => champ.current?.click()} disabled={envoi !== null}>
            {envoi === null ? 'Choisir un fichier' : `Envoi… ${Math.round(envoi * 100)} %`}
          </Button>
        </div>
        {probleme ? (
          <div className="mx-auto mt-4 max-w-md">
            <ErrorText>{probleme}</ErrorText>
          </div>
        ) : null}
      </div>

      {erreur ? <ErrorText>{erreur}</ErrorText> : null}

      {chargement ? (
        <p className="text-slate-500">Chargement…</p>
      ) : morceaux.length === 0 ? (
        <p className="text-center text-sm text-slate-500">
          Rien encore. Le premier fichier déposé ouvrira l'atelier tout seul.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {morceaux.map((morceau) => (
              <Vignette key={morceau.id} morceau={morceau} />
            ))}
          </div>
          {/* La place prise par les vidéos, dite ici plutôt que découverte le jour où le
              disque est plein. Une vidéo de trois minutes en 1080p pèse une soixantaine de
              mégaoctets, et la machine qui héberge fait probablement autre chose à côté. */}
          {espaceVideos > 0 ? (
            <p className="text-right text-xs text-slate-500">
              Vidéos gardées sur le serveur : {poidsLisible(espaceVideos)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** Des octets en quelque chose qui se lit d'un coup d'œil. */
function poidsLisible(octets: number): string {
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`
  if (octets < 1024 * 1024 * 1024) return `${Math.round(octets / (1024 * 1024))} Mo`
  return `${(octets / (1024 * 1024 * 1024)).toFixed(1)} Go`
}

function Vignette({ morceau }: { morceau: Morceau }) {
  const naviguer = useNavigate()

  return (
    <Card
      onClick={() => naviguer(`/atelier/${morceau.id}`)}
      className="cursor-pointer transition-colors hover:border-amber-700 hover:bg-slate-800/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-medium text-slate-100">{morceau.titre}</h2>
          <p className="truncate text-sm text-slate-400">{morceau.artiste || '—'}</p>
        </div>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
            morceau.type === 'gp' ? 'bg-emerald-950 text-emerald-300' : 'bg-sky-950 text-sky-300'
          }`}
        >
          {morceau.type === 'gp' ? 'Guitar Pro' : 'PDF'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>{quand(morceau.modifieLe)}</span>
        <span>{poids(morceau.fichier.taille)}</span>
        <span>par {morceau.auteur}</span>
      </div>

      {morceau.video ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm text-amber-300">
          <span>▶</span>
          <span>Vidéo {formaterDuree(morceau.video.dureeMs)}</span>
          <span className="text-slate-500">{poids(morceau.video.taille)}</span>
        </div>
      ) : null}
    </Card>
  )
}
