import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText, Field, Option, Select } from '../../components/ui/Field'
import { useMorceaux } from '../../hooks/useMorceaux'
import { messageOf } from '../../lib/api'
import { formaterDuree } from '../../lib/minutage'
import { useT } from '../../lib/langue'
import { fondAvecAlpha } from '../../lib/reglages'
import type { Scene } from '../../lib/scene'
import type { FormatVideo, Morceau, QualiteVideo, ReglagesVideo } from '../../lib/types'
import { enregistrer, formatSupporte, voieDEncodage } from '../../lib/video'

/* Trois crans plutôt qu'un curseur de débit : personne ne sait ce que vaut un mégabit par
   seconde, tout le monde sait où sa bande va finir à l'écran. */
const QUALITES: Array<{ id: QualiteVideo; nom: string; aide: string }> = [
  {
    id: 'legere',
    nom: 'Légère — fichier minuscule',
    aide: 'Pour une bande dans un coin de l’écran, où les chiffres sont petits de toute façon.',
  },
  {
    id: 'standard',
    nom: 'Standard',
    aide: 'Le bon compromis pour une incrustation : une tablature est du trait sur fond uni, elle se comprime bien.',
  },
  {
    id: 'nette',
    nom: 'Nette — fichier lourd',
    aide: 'Quand la tablature occupe l’écran entier et qu’on lit les doigtés dessus.',
  },
]

/**
 * La marche à suivre, écrite là où les deux fichiers apparaissent.
 *
 * Deux fichiers sans explication, c'est un problème qu'on laisse à l'utilisateur. La
 * manipulation est la même partout et ne se fait qu'une fois par montage ; encore faut-il la
 * connaître, et ce n'est pas le genre de chose qu'on devine.
 */
function ModeDEmploiDuCache() {
  const t = useT()
  return (
    <details className="mt-2 text-sm text-slate-400">
      <summary className="cursor-pointer text-slate-300">
        {t('Comment s’en servir au montage')}
      </summary>
      <p className="mt-2">
        {t(
          'Les deux fichiers vont ensemble : l’image est posée sur noir, le cache dit en noir et blanc où elle se voit. C’est ainsi qu’on transporte de la transparence dans un mp4.',
        )}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          <strong className="text-slate-300">DaVinci Resolve</strong>{' '}
          {t(
            '— pose les deux au-dessus de ta reprise, puis dans la page Color relie le cache à l’entrée alpha du nœud de l’image (clic droit sur le nœud, « Add Matte »). Coche « Post-Multiply » si les bords te paraissent doublés.',
          )}
        </li>
        <li>
          <strong className="text-slate-300">Premiere Pro</strong>{' '}
          {t(
            '— image sur une piste, cache sur celle du dessus, puis l’effet « Track Matte Key » sur l’image : cache en luminance, « Composite Using: Matte Luma ».',
          )}
        </li>
        <li>
          <strong className="text-slate-300">Final Cut, CapCut, Shotcut</strong>{' '}
          {t(
            '— cherche « luma matte », « luminance key » ou « masque de luminance » : c’est le même principe partout.',
          )}
        </li>
      </ul>
      <p className="mt-2">
        {t(
          'Un seul fichier te suffit ? Repasse « Transparence » sur « Un seul fichier WebM » — c’est alors l’attente qui revient.',
        )}
      </p>
    </details>
  )
}

function poids(octets: number): string {
  return octets < 1024 * 1024
    ? `${Math.round(octets / 1024)} ko`
    : `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

export function PanneauExport({
  morceau,
  scene,
  audio,
  video,
  modifier,
}: {
  morceau: Morceau
  scene: Scene | null
  audio: AudioBuffer | null
  /**
   * Les réglages vidéo tels qu'ils sont à l'instant.
   *
   * Ni la scène ni le morceau ne peuvent les dire à temps : la première est refaite à chaque
   * changement et vaut `null` pendant ce temps-là, le second ne porte que ce qui a déjà été
   * enregistré, avec le retard de la sauvegarde. Les réglages vivants, eux, sont justes tout
   * de suite — et c'est d'eux que dépendent la voie d'encodage, donc l'attente annoncée, et
   * le format du fichier produit.
   */
  video: ReglagesVideo
  modifier: (f: (v: ReglagesVideo) => ReglagesVideo) => void
}) {
  const t = useT()
  const transparente = fondAvecAlpha(video.fond)
  const { deposerVideo, supprimerVideo } = useMorceaux()
  const [encours, setEncours] = useState(false)
  const [progression, setProgression] = useState(0)
  const [etape, setEtape] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [garder, setGarder] = useState(true)
  /* Muet pendant l'export. Par la voie rapide, la bande-son n'est de toute façon pas jouée —
     l'encodage n'a plus rien à voir avec le temps du morceau — et par la voie lente, entendre
     trois minutes de synthétiseur n'a jamais aidé personne. */
  const [audible, setAudible] = useState(false)
  const [produite, setProduite] = useState<{
    url: string
    nom: string
    taille: number
    /** Cadence tenue et cadence demandée : l'écart est le seul défaut qu'on ne voit pas. */
    ips: number
    fps: number
    /** Le conteneur réellement produit : il n'est pas toujours celui qu'on avait demandé. */
    ext: string
    /** L'URL de la découpe, quand la transparence est sortie en deux fichiers. */
    cache: string | null
    nomCache?: string
    tailleCache?: number
  } | null>(null)
  const annuler = useRef<AbortController | null>(null)

  // L'URL d'un Blob occupe la mémoire tant qu'on ne la révoque pas : une poignée d'exports
  // successifs dans le même onglet finiraient par y laisser plusieurs centaines de mégaoctets.
  useEffect(() => {
    return () => {
      if (produite) URL.revokeObjectURL(produite.url)
      if (produite?.cache) URL.revokeObjectURL(produite.cache)
    }
  }, [produite])

  /* Découpée en deux, la transparence repasse par la voie rapide et par le mp4 : c'est le
     seul moyen, aucun encodeur du navigateur ne sachant écrire un canal alpha. */
  const enDeuxFichiers = transparente && video.cacheSepare
  const supporte = formatSupporte(transparente, video.format)
  /* Deux voies, deux attentes très différentes : autant le dire avant qu'on appuie. La rapide
     encode plus vite que le morceau ne dure ; l'autre l'enregistre à sa vitesse. */
  const rapide = voieDEncodage(transparente, video.cacheSepare) === 'rapide'

  async function lancer() {
    if (!scene) return
    setErreur(null)
    setProgression(0)
    setEncours(true)
    setEtape(rapide ? 'Encodage…' : 'Enregistrement en temps réel…')
    annuler.current = new AbortController()

    try {
      const resultat = await enregistrer(scene, {
        fps: video.fps,
        format: video.format,
        qualite: video.qualite,
        cacheSepare: video.cacheSepare,
        audio,
        audible,
        signal: annuler.current.signal,
        onProgression: setProgression,
      })

      if (produite) URL.revokeObjectURL(produite.url)
      if (produite?.cache) URL.revokeObjectURL(produite.cache)
      setProduite({
        url: URL.createObjectURL(resultat.blob),
        cache: resultat.cache ? URL.createObjectURL(resultat.cache.blob) : null,
        nomCache: `${morceau.titre || 'videotab'} — cache${resultat.cache?.ext ?? ''}`,
        tailleCache: resultat.cache?.blob.size,
        nom: `${morceau.titre || 'videotab'}${resultat.ext}`,
        taille: resultat.blob.size,
        ips: resultat.imagesParSeconde,
        fps: video.fps,
        ext: resultat.ext,
      })

      if (garder) {
        setEtape('Envoi vers le serveur…')
        setProgression(0)
        await deposerVideo(
          morceau.id,
          resultat.blob,
          {
            ext: resultat.ext,
            dureeMs: resultat.dureeMs,
            cache: resultat.cache?.blob ?? null,
          },
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
      <h2 className="font-medium text-slate-200">{t('Exporter')}</h2>

      {!supporte ? (
        <ErrorText>
          {t(
            'Ce navigateur ne sait pas enregistrer de vidéo. Firefox, Chrome, Edge et Safari récents le savent.',
          )}
        </ErrorText>
      ) : null}

      <p className="text-sm text-slate-400">
        {rapide
          ? t(
              'L’encodage se fait ici, dans l’onglet, mais plus vite que le morceau : les {duree} de vidéo ne demandent pas {duree} d’attente. Ne ferme pas l’onglet, c’est tout.',
              { duree: formaterDuree(scene?.dureeMs ?? 0) },
            )
          : t(
              'L’encodage se fait ici, dans l’onglet, et en temps réel : {duree} de morceau demandent {duree} d’attente. Tu peux aller ailleurs pendant ce temps-là, l’enregistrement continue — mais ne ferme pas l’onglet.',
              { duree: formaterDuree(scene?.dureeMs ?? 0) },
            )}
      </p>

      {/* Le format et la qualité se règlent ici et non avec la mise en scène : ils ne
          changent rien à ce qu'on voit dans l'aperçu, seulement au fichier qui en sort. */}
      {transparente ? (
        <Field
          label="Transparence"
          hint={
            enDeuxFichiers
              ? 'Aucun navigateur ne sait encoder un canal alpha : découpée en deux, la transparence repasse par l’encodeur rapide et par le mp4. Une manipulation de plus au montage, toujours la même — la marche à suivre s’affiche avec les fichiers.'
              : 'Un seul fichier, mais alors en WebM et enregistré en temps réel : autant d’attente que le morceau dure. Tous les logiciels de montage ne lisent pas le WebM transparent.'
          }
        >
          <Select
            value={video.cacheSepare ? 'deux' : 'un'}
            disabled={encours}
            onChange={(e) => modifier((v) => ({ ...v, cacheSepare: e.target.value === 'deux' }))}
          >
            <Option value="deux">Deux fichiers — image et cache, rapide</Option>
            <Option value="un">Un seul fichier WebM — temps réel</Option>
          </Select>
        </Field>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Format"
          hint={
            transparente && !enDeuxFichiers
              ? t(
                  'Le fond {fond} réclame un canal alpha, que le mp4 ne sait pas transporter : en un seul fichier, la vidéo sortira en WebM quoi qu’on choisisse ici.',
                  {
                    fond: video.fond === 'voile' ? t('« Noir translucide »') : t('« Transparent »'),
                  },
                )
              : video.format === 'mp4'
                ? 'Se pose dans n’importe quel logiciel de montage.'
                : 'Plus léger, mais Resolve et Premiere ne le lisent pas.'
          }
        >
          {/* Le choix est montré forcé plutôt que laissé à « mp4 » pendant qu'on produit du
              WebM : une case qui affiche autre chose que ce qui va sortir est un mensonge, et
              c'est celui qu'on met le plus longtemps à découvrir — au montage. */}
          <Select
            value={transparente && !enDeuxFichiers ? 'webm' : video.format}
            disabled={encours || (transparente && !enDeuxFichiers)}
            onChange={(e) => modifier((v) => ({ ...v, format: e.target.value as FormatVideo }))}
          >
            <Option value="mp4">mp4 — pour le montage</Option>
            <Option value="webm">
              {transparente && !enDeuxFichiers ? 'WebM — imposé par le fond' : 'WebM — pour le web'}
            </Option>
          </Select>
        </Field>

        <Field label="Qualité" hint={t(QUALITES.find((q) => q.id === video.qualite)?.aide ?? '')}>
          <Select
            value={video.qualite}
            disabled={encours}
            onChange={(e) => modifier((v) => ({ ...v, qualite: e.target.value as QualiteVideo }))}
          >
            {QUALITES.map((q) => (
              <option key={q.id} value={q.id}>
                {t(q.nom)}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={garder}
          onChange={(e) => setGarder(e.target.checked)}
          disabled={encours}
          className="h-4 w-4 accent-amber-500"
        />
        {t('Garder la vidéo sur le serveur')}
      </label>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={audible}
          onChange={(e) => setAudible(e.target.checked)}
          disabled={encours}
          className="h-4 w-4 accent-amber-500"
        />
        {t('Entendre le morceau pendant l’enregistrement')}
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
            {t(etape)} {Math.round(progression * 100)} %
            {!rapide && resteMs > 0 ? t(' — reste {duree}', { duree: formaterDuree(resteMs) }) : ''}
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
            {t('Télécharger {nom} ({poids})', { nom: produite.nom, poids: poids(produite.taille) })}
          </a>
          {produite.cache ? (
            <>
              <a
                href={produite.cache}
                download={produite.nomCache ?? 'cache'}
                className="mt-1 block text-sm text-amber-400 hover:text-amber-300"
              >
                {t('Télécharger le cache ({poids})', {
                  poids: poids(produite.tailleCache ?? 0),
                })}
              </a>
              <ModeDEmploiDuCache />
            </>
          ) : null}
          {/* Le format aussi ne se signale que quand il a manqué. Un navigateur sans encodeur
              H.264 rend un WebM sans rien dire, et on ne s'en aperçoit qu'en le posant dans une
              timeline qui le refuse. */}
          {(!transparente || enDeuxFichiers) &&
          video.format === 'mp4' &&
          produite.ext !== '.mp4' ? (
            <p className="mt-2 text-sm text-amber-400">
              {t(
                'Ce navigateur n’a pas d’encodeur mp4 : la vidéo est sortie en WebM. Resolve et Premiere ne le lisent pas — essaie depuis Chrome ou Edge.',
              )}
            </p>
          ) : null}
          {/* La cadence tenue n'est annoncée que quand elle a manqué : un export réussi n'a
              pas à se vanter, un export pauvre doit se dénoncer avant le montage. */}
          {produite.ips < produite.fps * 0.85 ? (
            <p className="mt-2 text-sm text-amber-400">
              {t(
                'Cette vidéo n’a tenu que {tenue} images par seconde sur les {demandees} demandées : la machine n’a pas suivi. Une définition plus petite ou une cadence plus basse donneront un résultat plus fluide.',
                { tenue: produite.ips.toFixed(1), demandees: produite.fps },
              )}
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
              {t('Télécharger ({poids})', { poids: poids(morceau.video.taille) })}
            </a>
            {morceau.video.cache ? (
              <a
                href={`/api/morceaux/${morceau.id}/video?cache=1&telecharger=1`}
                className="text-amber-400 hover:text-amber-300"
              >
                {t('Télécharger le cache ({poids})', { poids: poids(morceau.video.cache.taille) })}
              </a>
            ) : null}
            <button
              onClick={() => void supprimerVideo(morceau.id)}
              className="text-slate-500 hover:text-red-400"
            >
              {t('Supprimer du serveur')}
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
