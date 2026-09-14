import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText } from '../../components/ui/Field'
import { useMorceaux } from '../../hooks/useMorceaux'
import { messageOf } from '../../lib/api'
import { formaterDuree } from '../../lib/minutage'
import type { Scene } from '../../lib/scene'
import type { Morceau } from '../../lib/types'
import { enregistrer, formatSupporte, voieDEncodage } from '../../lib/video'

function poids(octets: number): string {
  return octets < 1024 * 1024
    ? `${Math.round(octets / 1024)} ko`
    : `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

export function PanneauExport({
  morceau,
  scene,
  audio,
  transparente,
}: {
  morceau: Morceau
  scene: Scene | null
  audio: AudioBuffer | null
  /**
   * Le fond transparent, tel qu'il est réglé à l'instant.
   *
   * Ni la scène ni le morceau ne peuvent le dire à temps : la première est refaite à chaque
   * changement et vaut `null` pendant ce temps-là, le second ne porte que ce qui a déjà été
   * enregistré, avec le retard de la sauvegarde. Le réglage vivant, lui, est juste tout de
   * suite — et c'est de lui que dépend la voie d'encodage, donc l'attente annoncée.
   */
  transparente: boolean
}) {
  const { deposerVideo, supprimerVideo } = useMorceaux()
  const [encours, setEncours] = useState(false)
  const [progression, setProgression] = useState(0)
  const [etape, setEtape] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [garder, setGarder] = useState(true)
  const [audible, setAudible] = useState(true)
  const [produite, setProduite] = useState<{
    url: string
    nom: string
    taille: number
    /** Cadence tenue et cadence demandée : l'écart est le seul défaut qu'on ne voit pas. */
    ips: number
    fps: number
  } | null>(null)
  const annuler = useRef<AbortController | null>(null)

  // L'URL d'un Blob occupe la mémoire tant qu'on ne la révoque pas : une poignée d'exports
  // successifs dans le même onglet finiraient par y laisser plusieurs centaines de mégaoctets.
  useEffect(() => {
    return () => {
      if (produite) URL.revokeObjectURL(produite.url)
    }
  }, [produite])

  const supporte = formatSupporte()
  /* Deux voies, deux attentes très différentes : autant le dire avant qu'on appuie. La rapide
     encode plus vite que le morceau ne dure ; l'autre l'enregistre à sa vitesse. */
  const rapide = voieDEncodage(transparente) === 'rapide'

  async function lancer() {
    if (!scene) return
    setErreur(null)
    setProgression(0)
    setEncours(true)
    setEtape(rapide ? 'Encodage…' : 'Enregistrement en temps réel…')
    annuler.current = new AbortController()

    try {
      const resultat = await enregistrer(scene, {
        fps: morceau.reglages.video.fps,
        audio,
        audible,
        signal: annuler.current.signal,
        onProgression: setProgression,
      })

      if (produite) URL.revokeObjectURL(produite.url)
      setProduite({
        url: URL.createObjectURL(resultat.blob),
        nom: `${morceau.titre || 'videotab'}${resultat.ext}`,
        taille: resultat.blob.size,
        ips: resultat.imagesParSeconde,
        fps: morceau.reglages.video.fps,
      })

      if (garder) {
        setEtape('Envoi vers le serveur…')
        setProgression(0)
        await deposerVideo(
          morceau.id,
          resultat.blob,
          { ext: resultat.ext, dureeMs: resultat.dureeMs },
          setProgression,
        )
      }
    } catch (err) {
      if ((err as DOMException)?.name !== 'AbortError') {
        setErreur(messageOf(err, "L'export a échoué."))
      }
    } finally {
      setEncours(false)
      setEtape('')
      annuler.current = null
    }
  }

  const resteMs = scene ? scene.dureeMs * (1 - progression) : 0

  return (
    <Card className="space-y-3">
      <h2 className="font-medium text-slate-200">Exporter</h2>

      {!supporte ? (
        <ErrorText>
          Ce navigateur ne sait pas enregistrer de vidéo. Firefox, Chrome, Edge et Safari récents le
          savent.
        </ErrorText>
      ) : null}

      <p className="text-sm text-slate-400">
        {rapide ? (
          <>
            L'encodage se fait ici, dans l'onglet, mais{' '}
            <strong className="text-slate-300">plus vite que le morceau</strong> : les{' '}
            {formaterDuree(scene?.dureeMs ?? 0)} de vidéo ne demandent pas{' '}
            {formaterDuree(scene?.dureeMs ?? 0)} d'attente. Ne ferme pas l'onglet, c'est tout.
          </>
        ) : (
          <>
            L'encodage se fait ici, dans l'onglet, et{' '}
            <strong className="text-slate-300">en temps réel</strong> :{' '}
            {formaterDuree(scene?.dureeMs ?? 0)} de morceau demandent{' '}
            {formaterDuree(scene?.dureeMs ?? 0)} d'attente. Tu peux aller ailleurs pendant ce
            temps-là, l'enregistrement continue — mais ne ferme pas l'onglet.
          </>
        )}
      </p>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={garder}
          onChange={(e) => setGarder(e.target.checked)}
          disabled={encours}
          className="h-4 w-4 accent-amber-500"
        />
        Garder la vidéo sur le serveur
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={audible}
          onChange={(e) => setAudible(e.target.checked)}
          disabled={encours}
          className="h-4 w-4 accent-amber-500"
        />
        Entendre le morceau pendant l'enregistrement
      </label>

      {encours ? (
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-amber-500 transition-[width] duration-200"
              style={{ width: `${Math.round(progression * 100)}%` }}
            />
          </div>
          <p className="text-sm text-slate-400">
            {etape} {Math.round(progression * 100)} %
            {!rapide && resteMs > 0 ? ` — reste ${formaterDuree(resteMs)}` : ''}
          </p>
          <Button variant="secondary" onClick={() => annuler.current?.abort()}>
            Interrompre
          </Button>
        </div>
      ) : (
        <Button onClick={() => void lancer()} disabled={!scene || !supporte} className="w-full">
          Exporter la vidéo
        </Button>
      )}

      <ErrorText>{erreur}</ErrorText>

      {produite ? (
        <div className="rounded-lg bg-slate-950 p-3">
          <video src={produite.url} controls className="mb-2 w-full rounded" />
          <a
            href={produite.url}
            download={produite.nom}
            className="text-sm text-amber-400 hover:text-amber-300"
          >
            Télécharger {produite.nom} ({poids(produite.taille)})
          </a>
          {/* La cadence tenue n'est annoncée que quand elle a manqué : un export réussi n'a
              pas à se vanter, un export pauvre doit se dénoncer avant le montage. */}
          {produite.ips < produite.fps * 0.85 ? (
            <p className="mt-2 text-sm text-amber-400">
              Cette vidéo n'a tenu que {produite.ips.toFixed(1)} images par seconde sur les{' '}
              {produite.fps} demandées : la machine n'a pas suivi. Une définition plus petite ou une
              cadence plus basse donneront un résultat plus fluide.
            </p>
          ) : null}
        </div>
      ) : morceau.video ? (
        <div className="rounded-lg bg-slate-950 p-3">
          <video
            src={`/api/morceaux/${morceau.id}/video`}
            controls
            className="mb-2 w-full rounded"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <a
              href={`/api/morceaux/${morceau.id}/video?telecharger=1`}
              className="text-amber-400 hover:text-amber-300"
            >
              Télécharger ({poids(morceau.video.taille)})
            </a>
            <button
              onClick={() => void supprimerVideo(morceau.id)}
              className="text-slate-500 hover:text-red-400"
            >
              Supprimer du serveur
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
