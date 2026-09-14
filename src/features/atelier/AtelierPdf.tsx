import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText, Field, Input } from '../../components/ui/Field'
import { useMorceaux } from '../../hooks/useMorceaux'
import { messageOf } from '../../lib/api'
import { avecDecompteAvant, decoderFichierAudio } from '../../lib/audio'
import { construireMinutage, dureeTotaleMs, formaterDuree } from '../../lib/minutage'
import {
  bandeDepuisSystemes,
  curseurBande,
  curseurPdf,
  detecterDansPages,
  feuilleDepuisPages,
  rendrePdf,
  trierSystemes,
  type PageRendue,
  type Placement,
} from '../../lib/pdf'
import { creerScene, type Feuille } from '../../lib/scene'
import { themeParId } from '../../lib/themes'
import type { Morceau } from '../../lib/types'
import { EditeurSystemes } from './EditeurSystemes'
import { Lecteur } from './Lecteur'
import { PanneauExport } from './PanneauExport'
import { PanneauMiseEnScene, PanneauVideo } from './PanneauVideo'
import { useReglages } from './useReglages'

/**
 * L'atelier d'un PDF.
 *
 * Tout ce qu'une tablature Guitar Pro apporte d'elle-même — où sont les lignes, combien de
 * mesures elles portent, à quel tempo tout cela se joue — doit ici être déclaré. L'écran
 * est donc organisé dans cet ordre : d'abord *où*, en découpant les systèmes, ensuite
 * *quand*, en donnant un tempo. Le reste est commun aux deux mondes.
 */
export function AtelierPdf({ morceau, octets }: { morceau: Morceau; octets: ArrayBuffer }) {
  const { reglages, modifier, enregistre } = useReglages(morceau)
  const { deposerAudio, supprimerAudio } = useMorceaux()
  const pdf = reglages.pdf
  const theme = themeParId(reglages.video.theme)
  // Défilement et mesures produisent la même bande : seule la façon dont elle avance change,
  // et c'est la scène qui s'en occupe. Ici, les deux demandent le même recollage.
  const enBande = reglages.video.disposition !== 'page'

  const [pages, setPages] = useState<PageRendue[]>([])
  const [feuille, setFeuille] = useState<Feuille | null>(null)
  const [placements, setPlacements] = useState<Placement[]>([])
  const [audio, setAudio] = useState<AudioBuffer | null>(null)
  const [etat, setEtat] = useState('Ouverture du PDF…')
  const [erreur, setErreur] = useState<string | null>(null)
  const champAudio = useRef<HTMLInputElement>(null)

  // ---- Les pages, rendues une fois ----

  useEffect(() => {
    let vivant = true
    setEtat('Rendu des pages…')
    rendrePdf(octets, reglages.video.largeur)
      .then((rendues) => {
        if (!vivant) return
        const { feuille: assemblee, placements: positions } = feuilleDepuisPages(rendues)
        setPages(rendues)
        setFeuille(assemblee)
        setPlacements(positions)
        setErreur(null)
      })
      .catch((err) => {
        if (vivant) setErreur(messageOf(err, "Ce PDF n'a pas pu être ouvert."))
      })
    return () => {
      vivant = false
    }
    // La définition de la vidéo décide de la finesse du rendu : la changer vaut un nouveau
    // passage, sans quoi une vidéo 1080p afficherait une page rendue pour du 720p.
  }, [octets, reglages.video.largeur])

  // ---- La bande-son rapportée, s'il y en a une ----

  useEffect(() => {
    if (!pdf?.audio) {
      setAudio(null)
      return
    }
    let vivant = true
    fetch(`/api/morceaux/${morceau.id}/audio`, { credentials: 'include' })
      .then((r) => r.arrayBuffer())
      .then(decoderFichierAudio)
      .then((buffer) => vivant && setAudio(buffer))
      .catch(() => vivant && setErreur("La bande-son n'a pas pu être décodée."))
    return () => {
      vivant = false
    }
  }, [morceau.id, pdf?.audio?.nom])

  // ---- Le minutage, recalculé à chaque réglage ----

  const etapes = useMemo(
    () =>
      pdf
        ? construireMinutage(pdf.systemes, {
            bpm: pdf.bpm,
            battementsParMesure: pdf.battementsParMesure,
            mesuresParSysteme: pdf.mesuresParSysteme,
            decalageMs: pdf.decalageMs + reglages.video.compteAvantSec * 1000,
          })
        : [],
    [pdf, reglages.video.compteAvantSec],
  )

  /* En bande, les systèmes découpés sont détachés de leurs pages et recollés bout à
     bout en une seule bande. C'est le seul travail que la disposition demande en plus — le
     découpage, lui, sert aux deux, et se corrige une fois pour toutes. */
  const bande = useMemo(
    () =>
      enBande && pdf
        ? bandeDepuisSystemes(pages, pdf.systemes, {
            encre: theme.detourerPdf ? theme.encre : null,
            mesuresParDefaut: pdf.mesuresParSysteme,
          })
        : null,
    [enBande, pages, pdf, theme],
  )

  const scene = useMemo(() => {
    if (!pdf || pdf.systemes.length === 0) return null
    const commun = {
      video: reglages.video,
      dureeMs: dureeTotaleMs(etapes),
      titre: morceau.titre,
      artiste: morceau.artiste,
    }

    if (enBande) {
      if (!bande || bande.feuille.tuiles.length === 0) return null
      return creerScene({
        ...commun,
        feuille: bande.feuille,
        // L'encre a été détourée à la découpe : la bande n'a plus de papier à poser, et
        // c'est ce qui la rend incrustable sur une vidéo.
        papier: theme.detourerPdf ? null : theme.papier,
        curseurA: curseurBande(etapes, bande.segments, bande.feuille.hauteur),
      })
    }

    if (!feuille) return null
    return creerScene({
      ...commun,
      feuille,
      // En page, c'est la page entière qu'on montre, marges comprises : elle a besoin de son
      // papier même sur un thème qui n'en prévoit pas, sinon elle flotte dans le noir.
      papier: theme.papier ?? '#f7f6f3',
      trainee: true,
      curseurA: curseurPdf(pdf.systemes, etapes, placements),
    })
  }, [
    enBande,
    bande,
    feuille,
    pdf,
    etapes,
    placements,
    reglages.video,
    theme,
    morceau.titre,
    morceau.artiste,
  ])

  const bandeSon = useMemo(
    () =>
      audio
        ? avecDecompteAvant(
            audio,
            (pdf?.decalageMs ?? 0) + reglages.video.compteAvantSec * 1000,
            reglages.video.decompteSonore,
          )
        : null,
    [audio, pdf?.decalageMs, reglages.video.compteAvantSec, reglages.video.decompteSonore],
  )

  if (!pdf) return <ErrorText>Ce morceau n'a pas de réglages PDF.</ErrorText>

  function majPdf(mutation: (p: NonNullable<typeof pdf>) => NonNullable<typeof pdf>) {
    modifier((r) => ({ ...r, pdf: mutation(r.pdf!) }))
  }

  function detecter() {
    const trouves = detecterDansPages(pages, pdf!.mesuresParSysteme)
    if (trouves.length === 0) {
      setErreur('Aucune ligne de tablature reconnue. Trace les systèmes à la main sur la page.')
      return
    }
    setErreur(null)
    majPdf((p) => ({ ...p, systemes: trierSystemes(trouves) }))
  }

  async function envoyerAudio(fichier: File | undefined) {
    if (!fichier) return
    try {
      await deposerAudio(morceau.id, fichier)
      setErreur(null)
    } catch (err) {
      setErreur(messageOf(err, "La bande-son n'a pas pu être envoyée."))
    }
  }

  return (
    /* Même disposition que pour une tablature : l'aperçu et le découpage en haut, sur toute
       la largeur, puis les réglages en colonnes. */
    <div className="space-y-4">
      {/* L'aperçu est un enfant direct de la page, et non d'une enveloppe à lui : un
          élément collant ne tient que dans les limites de son parent, et une enveloppe à sa
          taille le laisserait filer dès le premier réglage. */}
      {erreur ? <ErrorText>{erreur}</ErrorText> : null}
      <Lecteur
        scene={scene}
        audio={bandeSon}
        message={
          pages.length === 0 ? etat : 'Découpe d’abord les systèmes : « Détecter les lignes ».'
        }
      />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-slate-200">
            Découpage — {pdf.systemes.length} système
            {pdf.systemes.length > 1 ? 's' : ''}
          </h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={detecter} disabled={pages.length === 0}>
              Détecter les lignes
            </Button>
            {pdf.systemes.length > 0 ? (
              <Button
                variant="ghost"
                onClick={() => majPdf((p) => ({ ...p, systemes: [] }))}
                className="text-red-400"
              >
                Tout effacer
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-slate-400">
          Tire un rectangle sur la page pour ajouter une ligne, attrape ses bords pour l'ajuster,
          change son nombre de mesures dans le coin. L'ordre de lecture suit la page, de haut en
          bas.
        </p>
        <p className="text-xs text-slate-500">
          Pages rendues par{' '}
          <a
            href="https://mozilla.github.io/pdf.js/"
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 underline hover:text-slate-200"
          >
            pdf.js
          </a>
          .
        </p>

        {pages.length === 0 ? (
          <p className="text-slate-500">{etat}</p>
        ) : (
          <EditeurSystemes
            pages={pages}
            systemes={pdf.systemes}
            mesuresParDefaut={pdf.mesuresParSysteme}
            onChange={(systemes) => majPdf((p) => ({ ...p, systemes }))}
          />
        )}
      </Card>

      {/* Des colonnes tenues à la main, et non un flux qui se rééquilibre : déplier un
         réglage ferait sinon sauter les cartes d'une colonne à l'autre, et l'on perdrait des
         yeux celle qu'on vient d'ouvrir. Ici déplier n'allonge que sa propre colonne. */}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-slate-200">Minutage</h2>
              <span className="text-xs text-slate-500">
                {enregistre ? 'enregistré' : 'enregistrement…'}
              </span>
            </div>

            <Tempo valeur={pdf.bpm} onChange={(bpm) => majPdf((p) => ({ ...p, bpm }))} />

            <div className="grid grid-cols-2 gap-3">
              <Field label="Temps / mesure">
                <Input
                  type="number"
                  min={1}
                  max={16}
                  value={pdf.battementsParMesure}
                  onChange={(e) =>
                    majPdf((p) => ({
                      ...p,
                      battementsParMesure: Math.max(1, Number(e.target.value) || 4),
                    }))
                  }
                />
              </Field>
              <Field label="Mesures / ligne" hint="Valeur par défaut.">
                <Input
                  type="number"
                  min={1}
                  max={64}
                  value={pdf.mesuresParSysteme}
                  onChange={(e) =>
                    majPdf((p) => ({
                      ...p,
                      mesuresParSysteme: Math.max(1, Number(e.target.value) || 4),
                    }))
                  }
                />
              </Field>
            </div>

            <label className="block">
              <span className="mb-1 flex items-center justify-between text-sm font-medium text-slate-300">
                Décalage de départ
                <span className="font-mono text-xs text-slate-500">
                  {(pdf.decalageMs / 1000).toFixed(1)} s
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={10000}
                step={100}
                value={pdf.decalageMs}
                onChange={(e) => majPdf((p) => ({ ...p, decalageMs: Number(e.target.value) }))}
                className="w-full accent-amber-500"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Le temps qui passe avant la première note de la bande-son — l'intro, le décompte du
                batteur, le silence du début d'enregistrement.
              </span>
            </label>

            <p className="rounded-lg bg-slate-950 px-3 py-2 text-sm text-slate-400">
              Durée calculée :{' '}
              <span className="text-amber-300">{formaterDuree(dureeTotaleMs(etapes))}</span>
            </p>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-medium text-slate-200">Bande-son</h2>
            <p className="text-sm text-slate-400">
              Un PDF ne contient aucune note qu'une machine puisse jouer. Le seul son possible est
              celui qu'on apporte : l'enregistrement du morceau, mp3 ou wav.
            </p>
            <input
              ref={champAudio}
              type="file"
              accept=".mp3,.ogg,.wav,.m4a,.flac"
              className="hidden"
              onChange={(e) => void envoyerAudio(e.target.files?.[0])}
            />
            {pdf.audio ? (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-950 px-3 py-2">
                <span className="truncate text-sm text-slate-300">{pdf.audio.nom}</span>
                <button
                  onClick={() => void supprimerAudio(morceau.id)}
                  className="shrink-0 text-sm text-slate-500 hover:text-red-400"
                >
                  Retirer
                </button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => champAudio.current?.click()}>
                Ajouter un fichier audio
              </Button>
            )}
          </Card>

          <PanneauExport
            morceau={morceau}
            scene={scene}
            audio={bandeSon}
            transparente={reglages.video.fond === 'transparent'}
          />
        </div>

        <PanneauMiseEnScene
          video={reglages.video}
          modifier={(mutation) => modifier((r) => ({ ...r, video: mutation(r.video) }))}
        />
        <PanneauVideo
          video={reglages.video}
          modifier={(mutation) => modifier((r) => ({ ...r, video: mutation(r.video) }))}
        />
      </div>
    </div>
  )
}

/**
 * Le tempo, au chiffre ou au doigt.
 *
 * Personne ne connaît par cœur le tempo d'un PDF trouvé sur Internet, mais tout le monde
 * sait le battre en écoutant le morceau. Le bouton mesure l'intervalle moyen des derniers
 * appuis — on tape quatre ou cinq fois, on a la bonne valeur à un ou deux près.
 */
function Tempo({ valeur, onChange }: { valeur: number; onChange: (bpm: number) => void }) {
  const appuis = useRef<number[]>([])
  const [compte, setCompte] = useState(0)

  function taper() {
    const maintenant = performance.now()
    // Une pause de plus de deux secondes signe une nouvelle série : on ne moyenne pas le
    // tempo d'aujourd'hui avec celui d'il y a une minute.
    if (
      appuis.current.length > 0 &&
      maintenant - appuis.current[appuis.current.length - 1] > 2000
    ) {
      appuis.current = []
    }
    appuis.current.push(maintenant)
    if (appuis.current.length > 8) appuis.current.shift()
    setCompte(appuis.current.length)

    if (appuis.current.length >= 2) {
      const total = appuis.current[appuis.current.length - 1] - appuis.current[0]
      const intervalle = total / (appuis.current.length - 1)
      onChange(Math.round(Math.min(300, Math.max(20, 60_000 / intervalle))))
    }
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-300">Tempo</span>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={20}
          max={300}
          value={valeur}
          onChange={(e) => onChange(Math.max(20, Number(e.target.value) || 90))}
          className="flex-1"
        />
        <span className="text-sm text-slate-500">bpm</span>
        <Button variant="secondary" onClick={taper} className="whitespace-nowrap">
          Taper {compte > 1 ? `(${compte})` : ''}
        </Button>
      </div>
    </div>
  )
}
