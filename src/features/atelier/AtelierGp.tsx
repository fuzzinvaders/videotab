import * as alphaTab from '@coderline/alphatab'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '../../components/ui/Card'
import { ErrorText, Field, Select } from '../../components/ui/Field'
import { avecSilenceAvant } from '../../lib/audio'
import {
  appliquerTempo,
  collecteurDeTuiles,
  curseurGp,
  masquerEntete,
  pistesVisibles,
  preparerBande,
  reglagesAlphaTab,
  type BandeGp,
} from '../../lib/gp'
import { creerScene, type Feuille } from '../../lib/scene'
import type { Morceau, ReglagesGp } from '../../lib/types'
import { Lecteur } from './Lecteur'
import { PanneauExport } from './PanneauExport'
import { PanneauVideo } from './PanneauVideo'
import { useReglages } from './useReglages'

/**
 * L'atelier d'une tablature Guitar Pro.
 *
 * alphaTab tient ici deux rôles qu'on aurait pu croire séparés : il dessine la partition,
 * et il la joue. C'est ce cumul qui rend le curseur exact — les positions à l'écran et les
 * instants de la bande-son viennent de la même lecture du même fichier, et non de deux
 * approximations qu'il faudrait ensuite faire coïncider.
 */
export function AtelierGp({ morceau, octets }: { morceau: Morceau; octets: ArrayBuffer }) {
  const { reglages, modifier, enregistre } = useReglages(morceau)
  const gp = reglages.gp
  const hote = useRef<HTMLDivElement>(null)
  const api = useRef<alphaTab.AlphaTabApi | null>(null)
  const tuiles = useRef(collecteurDeTuiles())

  const [pistes, setPistes] = useState<string[]>([])
  const [feuille, setFeuille] = useState<Feuille | null>(null)
  const [bande, setBande] = useState<BandeGp | null>(null)
  const [etat, setEtat] = useState('Ouverture de la partition…')
  const [erreur, setErreur] = useState<string | null>(null)
  const [sonPret, setSonPret] = useState(false)

  // ---- Le moteur, monté une fois pour toutes ----

  useEffect(() => {
    if (!hote.current || !gp) return
    let vivant = true
    const instance = new alphaTab.AlphaTabApi(hote.current, reglagesAlphaTab())
    masquerEntete(instance)
    api.current = instance

    const surErreur = (err: Error) => {
      if (vivant) setErreur(err.message || 'alphaTab a refusé ce fichier.')
    }
    const surSon = () => {
      if (vivant) setSonPret(true)
    }
    const surDebut = () => tuiles.current.vider()
    const surTuile = (e: alphaTab.rendering.RenderFinishedEventArgs) => tuiles.current.ajouter(e)
    const surFin = () => {
      if (vivant) setFeuille(tuiles.current.feuille())
    }

    instance.error.on(surErreur)
    instance.soundFontLoaded.on(surSon)
    instance.renderStarted.on(surDebut)
    instance.renderer.partialRenderFinished.on(surTuile)
    instance.postRenderFinished.on(surFin)

    return () => {
      vivant = false
      instance.error.off(surErreur)
      instance.soundFontLoaded.off(surSon)
      instance.renderStarted.off(surDebut)
      instance.renderer.partialRenderFinished.off(surTuile)
      instance.postRenderFinished.off(surFin)
      instance.destroy()
      api.current = null
    }
    // Le moteur ne dépend que de l'élément qui l'accueille : tous les réglages passent
    // ensuite par les effets ci-dessous, qui n'ont pas besoin de le reconstruire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- La partition, rejouée à chaque changement qui la concerne ----

  useEffect(() => {
    const instance = api.current
    if (!instance || !gp) return
    setBande(null)
    setFeuille(null)
    setEtat('Mise en page de la partition…')
    try {
      /* La partition est relue depuis les octets à chaque fois, et non modifiée sur place :
         appliquerTempo change le modèle, et une deuxième application se cumulerait à la
         première — 80 % de 80 %, et le morceau finirait par s'arrêter. */
      const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
        new Uint8Array(octets),
        instance.settings,
      )
      appliquerTempo(score, gp.tempoPct)
      instance.settings.display.staveProfile = profilDePortee(gp)
      instance.metronomeVolume = gp.metronome ? 1 : 0
      instance.updateSettings()
      setPistes(score.tracks.map((piste) => piste.name || `Piste ${piste.index + 1}`))
      instance.renderScore(score, pistesVisibles(score, gp.piste))
      setErreur(null)
    } catch (err) {
      setErreur(
        err instanceof Error ? err.message : "Ce fichier n'a pas pu être lu comme une tablature.",
      )
    }
  }, [octets, gp])

  // ---- La bande-son et la table des tics ----

  useEffect(() => {
    const instance = api.current
    if (!instance || !feuille || !sonPret) return
    const annulation = new AbortController()
    let vivant = true

    // Une courte attente avant de lancer la synthèse : bouger le curseur de tempo produit
    // une dizaine de rendus en une seconde, et il serait absurde de synthétiser le morceau
    // à chaque pixel parcouru.
    const minuteur = setTimeout(async () => {
      setEtat('Synthèse de la bande-son…')
      try {
        const resultat = await preparerBande(instance, {
          signal: annulation.signal,
          onProgression: (part) =>
            vivant && setEtat(`Synthèse de la bande-son… ${Math.round(part * 100)} %`),
        })
        if (vivant) setBande(resultat)
      } catch (err) {
        if (vivant && (err as DOMException)?.name !== 'AbortError') {
          setErreur(err instanceof Error ? err.message : 'La bande-son n’a pas pu être produite.')
        }
      }
    }, 400)

    return () => {
      vivant = false
      annulation.abort()
      clearTimeout(minuteur)
    }
  }, [feuille, sonPret])

  // ---- La scène, et donc l'aperçu comme la vidéo ----

  const scene = useMemo(() => {
    if (!feuille || !bande || !gp) return null
    const instance = api.current
    if (!instance?.score) return null
    const decalageMs = Math.max(0, reglages.video.compteAvantSec) * 1000
    return creerScene({
      feuille,
      video: reglages.video,
      dureeMs: bande.dureeMs + decalageMs,
      titre: morceau.titre,
      artiste: morceau.artiste,
      curseurA: curseurGp(
        instance,
        bande.reperes,
        pistesVisibles(instance.score, gp.piste),
        decalageMs,
      ),
    })
  }, [feuille, bande, reglages.video, morceau.titre, morceau.artiste, gp])

  const audio = useMemo(
    () => (bande ? avecSilenceAvant(bande.audio, reglages.video.compteAvantSec * 1000) : null),
    [bande, reglages.video.compteAvantSec],
  )

  if (!gp) return <ErrorText>Ce morceau n'a pas de réglages Guitar Pro.</ErrorText>

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {erreur ? <ErrorText>{erreur}</ErrorText> : null}
        <Lecteur scene={scene} audio={audio} message={etat} />

        {/* alphaTab veut un élément attaché au document et large pour dessiner : une
            partition mise en page sur une largeur nulle sort en une colonne d'une mesure.
            Il est donc sorti du flux plutôt que caché dedans — une largeur de 1400 pixels
            dans une colonne de grille en imposerait la largeur à toute la page. */}
        <div
          aria-hidden
          className="pointer-events-none fixed top-0 left-0 h-0 w-0 overflow-hidden opacity-0"
        >
          <div ref={hote} style={{ width: 1400 }} />
        </div>
      </div>

      <div className="space-y-4">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-slate-200">Partition</h2>
            <span className="text-xs text-slate-500">
              {enregistre ? 'enregistré' : 'enregistrement…'}
            </span>
          </div>

          <Field label="Piste" hint="Une seule piste donne une vidéo lisible ; toutes, un panorama.">
            <Select
              value={String(gp.piste)}
              onChange={(e) =>
                modifier((r) => ({ ...r, gp: { ...gp, piste: Number(e.target.value) } }))
              }
            >
              <option value="-1">Toutes les pistes</option>
              {pistes.map((nom, index) => (
                <option key={index} value={index}>
                  {nom}
                </option>
              ))}
            </Select>
          </Field>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-sm font-medium text-slate-300">
              Tempo
              <span className="font-mono text-xs text-slate-500">{gp.tempoPct} %</span>
            </span>
            <input
              type="range"
              min={40}
              max={150}
              step={5}
              value={gp.tempoPct}
              onChange={(e) =>
                modifier((r) => ({ ...r, gp: { ...gp, tempoPct: Number(e.target.value) } }))
              }
              className="w-full accent-amber-500"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Le tempo est changé dans la partition, pas dans le lecteur : le son, l'image et la
              durée annoncée le suivent tous les trois.
            </span>
          </label>

          <div className="space-y-2">
            <Bascule
              label="Portée classique"
              actif={gp.afficherPortee}
              onChange={(afficherPortee) =>
                modifier((r) => ({ ...r, gp: { ...gp, afficherPortee } }))
              }
            />
            <Bascule
              label="Tablature"
              actif={gp.afficherTablature}
              onChange={(afficherTablature) =>
                modifier((r) => ({ ...r, gp: { ...gp, afficherTablature } }))
              }
            />
            <Bascule
              label="Métronome dans la bande-son"
              actif={gp.metronome}
              onChange={(metronome) => modifier((r) => ({ ...r, gp: { ...gp, metronome } }))}
            />
          </div>
        </Card>

        <PanneauVideo
          video={reglages.video}
          modifier={(mutation) => modifier((r) => ({ ...r, video: mutation(r.video) }))}
        />
        <PanneauExport morceau={morceau} scene={scene} audio={audio} />
      </div>
    </div>
  )
}

/* alphaTab range les combinaisons possibles dans un seul réglage. Tout cacher n'a pas de
   sens : on retombe alors sur la tablature, qui est la raison d'être de l'application. */
function profilDePortee(gp: ReglagesGp): alphaTab.StaveProfile {
  if (gp.afficherPortee && gp.afficherTablature) return alphaTab.StaveProfile.ScoreTab
  if (gp.afficherPortee) return alphaTab.StaveProfile.Score
  return alphaTab.StaveProfile.Tab
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
