import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Field, Option, Select } from '../../components/ui/Field'
import type { Apercu } from '../../lib/apercu'
import { facteursDeTempo } from '../../lib/calage'
import { useT } from '../../lib/langue'
import { formaterDuree } from '../../lib/minutage'
import type { PointCalage } from '../../lib/types'

/**
 * Caler la tablature sur un enregistrement, en tapant la mesure.
 *
 * On écoute et on frappe : c'est la façon la plus rapide de poser des repères, et la plus
 * juste, parce qu'on vise avec l'oreille au lieu de viser à la souris. Chaque frappe retient
 * l'instant de l'enregistrement et l'associe à la mesure en cours, puis passe à la suivante.
 *
 * Deux corrections valent d'être expliquées, parce qu'elles décident de la justesse du
 * résultat et qu'aucune n'est devinable.
 *
 * La **latence de sortie** d'abord : ce qu'on entend à un instant donné a été programmé une
 * cinquantaine de millisecondes plus tôt. Frapper sur ce qu'on entend désigne donc un instant
 * déjà passé de l'enregistrement, et c'est celui-là qu'il faut retenir. La machine sait le
 * chiffrer, on le lui demande.
 *
 * Le **temps de réaction** ensuite, qui lui ne se mesure pas : il dépend de la personne, de la
 * fatigue, du morceau. On ne le devine donc pas — mais comme il est à peu près constant, il
 * suffit de décaler tous les points du même montant une fois la frappe finie. C'est à quoi
 * sert le réglage d'ensemble, à régler une fois en regardant l'aperçu.
 *
 * La frappe est séparée en deux endroits, et c'est voulu. Le bouton sur lequel on tape se tient
 * **sous l'aperçu**, pour qu'on voie la tablature pendant qu'on frappe : c'est elle le repère,
 * et chercher le bouton des yeux dans une colonne de réglages fait rater la mesure. Le reste —
 * le pas, la mesure de départ, la liste des points — reste avec les autres réglages, où l'on
 * ne va qu'avant et après.
 *
 * C'est **l'aperçu lui-même qui joue** pendant la frappe, et non une lecture ouverte à côté.
 * Ouvrir la sienne ferait entendre la bande-son deux fois, et surtout ferait taper sur une
 * horloge pendant que la tablature en suivrait une autre. Une seule lecture, donc, celle qu'on
 * regarde — et l'instant qu'elle rapporte est déjà celui qu'on entend, latence de sortie
 * retranchée, ce qui dispense la frappe d'y penser.
 *
 * Le calage est **gelé le temps d'une session**. Chaque point posé déforme le temps, donc
 * refait la scène, donc couperait la lecture en cours : la première frappe arrêterait la
 * musique. Les points s'accumulent pendant qu'on tape, et c'est en relançant qu'on voit la
 * tablature suivre mieux — ce qui est aussi la bonne façon de vérifier son travail.
 */
export interface Frappe {
  disponible: boolean
  enMarche: boolean
  /**
   * Le calage que la scène doit afficher : gelé pendant une session, vivant sinon.
   *
   * C'est l'atelier qui s'en sert pour construire le parcours, et c'est ce qui permet aux
   * points de s'ajouter sans que l'image bouge sous les yeux de celui qui tape.
   */
  calageAffiche: PointCalage[]
  mesureEnCours: number
  nombreDeMesures: number
  pas: number
  setPas: (pas: number) => void
  depart: number
  setDepart: (mesure: number) => void
  mesures: number[]
  calage: PointCalage[]
  onChange: (points: PointCalage[]) => void
  lancer: () => void
  arreter: () => void
  taper: () => void
}

export function useFrappe({
  actif,
  commandes,
  mesures,
  calage,
  onChange,
  versScene,
  versAudio,
}: {
  /** Vrai dès qu'un enregistrement est joint : sans lui, il n'y a rien à caler. */
  actif: boolean
  /** L'aperçu, qui joue et qui dit où il en est. */
  commandes: RefObject<Apercu | null>
  /** L'instant de départ de chaque mesure, dans le temps de la partition. */
  mesures: number[]
  calage: PointCalage[]
  onChange: (points: PointCalage[]) => void
  /** De l'instant de l'enregistrement à celui de la scène, décompte et rognage compris. */
  versScene: (audioMs: number) => number
  /** Et le chemin inverse, celui que prend chaque frappe. */
  versAudio: (sceneMs: number) => number
}): Frappe {
  const [pas, setPas] = useState(4)
  const [depart, setDepart] = useState(1)
  const [mesureEnCours, setMesureEnCours] = useState(1)
  const [enMarche, setEnMarche] = useState(false)
  /* Le calage tel qu'il était au lancement. Tant qu'il est posé, c'est lui que la scène
     affiche : voir l'explication en tête de fichier. */
  const [gele, setGele] = useState<PointCalage[] | null>(null)
  const prochaine = useRef(1)

  const arreter = useCallback(() => {
    commandes.current?.pause()
    setGele(null)
    setEnMarche(false)
  }, [commandes])

  useEffect(() => arreter, [arreter])

  const lancer = useCallback(() => {
    const lecteur = commandes.current
    if (!actif || !lecteur || mesures.length === 0) return
    const premiere = Math.min(Math.max(1, depart), mesures.length)
    prochaine.current = premiere
    setMesureEnCours(premiere)
    /* On gèle avant de jouer, et non après : la scène ne doit pas se refaire entre le
       moment où l'on se place et celui où la lecture démarre. */
    setGele(calage)
    /* On démarre là où le calage actuel situe cette mesure : inutile de réécouter le morceau
       depuis le début pour corriger la fin. Sans point, c'est la partition qui répond. */
    lecteur.allerA(Math.max(0, versScene(mesures[premiere - 1] ?? 0)))
    void lecteur.jouer()
    setEnMarche(true)
  }, [actif, calage, commandes, depart, mesures, versScene])

  /* La lecture s'arrête d'elle-même au bout de l'enregistrement. Sans cette veille, le bouton
     continuerait d'annoncer une mesure à taper devant une image figée. */
  useEffect(() => {
    if (!enMarche) return
    const veille = window.setInterval(() => {
      if (!commandes.current?.estEnLecture()) arreter()
    }, 250)
    return () => clearInterval(veille)
  }, [arreter, commandes, enMarche])

  const taper = useCallback(() => {
    const index = prochaine.current
    const lecteur = commandes.current
    if (!enMarche || !lecteur || index > mesures.length) return
    // L'aperçu rapporte l'instant qu'on entend, latence déjà retranchée : voir en tête.
    const audioMs = versAudio(lecteur.position())
    const partitionMs = mesures[index - 1]
    if (partitionMs === undefined) return
    onChange([
      ...calage.filter((p) => Math.abs(p.partitionMs - partitionMs) > 1),
      { partitionMs, audioMs },
    ])
    const suivante = Math.min(index + pas, mesures.length + 1)
    prochaine.current = suivante
    setMesureEnCours(suivante)
  }, [calage, commandes, enMarche, mesures, onChange, pas, versAudio])

  /* La touche T, et la touche Entrée. L'espace est déjà prise par l'aperçu, qui écoute la
     fenêtre entière : la lui disputer donnerait un comportement qui dépend de l'ordre dans
     lequel les deux écouteurs se sont posés, c'est-à-dire du hasard. */
  useEffect(() => {
    if (!enMarche) return
    function surTouche(e: KeyboardEvent) {
      const cible = e.target as HTMLElement | null
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(cible?.tagName ?? '')) return
      if (e.code === 'KeyT' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault()
        taper()
      }
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [enMarche, taper])

  return {
    disponible: actif && mesures.length > 0,
    calageAffiche: gele ?? calage,
    enMarche,
    mesureEnCours,
    nombreDeMesures: mesures.length,
    pas,
    setPas,
    depart,
    setDepart,
    mesures,
    calage,
    onChange,
    lancer,
    arreter,
    taper,
  }
}

/**
 * La barre de frappe, à poser sous l'aperçu.
 *
 * Elle ne contient que ce sur quoi on appuie : pendant qu'on tape, les yeux sont sur la
 * tablature, et tout ce qui demanderait de les en détourner est à sa place ailleurs.
 */
export function BandeDeFrappe({ frappe }: { frappe: Frappe }) {
  const t = useT()
  if (!frappe.disponible) return null

  const fini = frappe.mesureEnCours > frappe.nombreDeMesures
  return (
    <div className="flex items-center gap-2">
      {frappe.enMarche ? (
        <>
          <button
            type="button"
            onClick={frappe.taper}
            className="flex-1 rounded-lg bg-amber-600 px-4 py-5 text-lg font-semibold text-white transition-colors hover:bg-amber-500"
          >
            {fini ? t('Fini') : t('Mesure {n} — tape (T)', { n: frappe.mesureEnCours })}
          </button>
          <Button variant="secondary" onClick={frappe.arreter}>
            Arrêter
          </Button>
        </>
      ) : (
        <Button variant="secondary" onClick={frappe.lancer} className="w-full">
          Lancer et taper
        </Button>
      )}
    </div>
  )
}

/** Les réglages de la frappe et les points qu'elle a posés : tout ce qui se consulte à froid. */
export function PanneauCalage({ frappe }: { frappe: Frappe }) {
  const t = useT()
  const { calage, mesures, onChange } = frappe

  function decalerTout(ms: number) {
    onChange(calage.map((p) => ({ ...p, audioMs: p.audioMs + ms })))
  }

  const points = [...calage].sort((a, b) => a.partitionMs - b.partitionMs)
  const facteurs = facteursDeTempo(points)
  const numeroDe = (partitionMs: number) => {
    const index = mesures.findIndex((m) => Math.abs(m - partitionMs) <= 1)
    return index >= 0 ? index + 1 : null
  }

  if (!frappe.disponible) {
    return (
      <Card className="space-y-3">
        <h2 className="font-medium text-slate-200">{t('Calage sur l’enregistrement')}</h2>
        <p className="text-sm text-slate-400">
          {t(
            'Joins un enregistrement — ta reprise, ou la bande d’accompagnement — et la tablature pourra le suivre au lieu de suivre son tempo écrit.',
          )}
        </p>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-medium text-slate-200">{t('Calage sur l’enregistrement')}</h2>
      <p className="text-sm text-slate-400">
        {t(
          'Le bouton de frappe est sous l’aperçu, pour que tu voies la tablature pendant que tu tapes. Deux points suffisent si le tempo est régulier ; ajoutes-en là où la reprise respire.',
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Taper toutes les">
          <Select
            value={String(frappe.pas)}
            disabled={frappe.enMarche}
            onChange={(e) => frappe.setPas(Number(e.target.value))}
          >
            <Option value="1">1 mesure</Option>
            <Option value="2">2 mesures</Option>
            <Option value="4">4 mesures</Option>
            <Option value="8">8 mesures</Option>
          </Select>
        </Field>
        <Field label="Commencer à la mesure">
          <Select
            value={String(frappe.depart)}
            disabled={frappe.enMarche}
            onChange={(e) => frappe.setDepart(Number(e.target.value))}
          >
            {mesures.map((_, index) => (
              <option key={index} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {points.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-300">{t('{n} points', { n: points.length })}</span>
            <div className="flex items-center gap-1">
              {/* Le temps de réaction est à peu près constant : on le corrige d'un bloc, en
                  regardant l'aperçu, plutôt que point par point. */}
              <button
                type="button"
                onClick={() => decalerTout(-20)}
                className="rounded border border-slate-700 px-2 py-1 font-mono text-xs text-slate-300 hover:bg-slate-800"
              >
                −20 ms
              </button>
              <button
                type="button"
                onClick={() => decalerTout(20)}
                className="rounded border border-slate-700 px-2 py-1 font-mono text-xs text-slate-300 hover:bg-slate-800"
              >
                +20 ms
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-500 hover:border-red-700 hover:text-red-400"
              >
                {t('Tout effacer')}
              </button>
            </div>
          </div>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {points.map((point, index) => (
              <li
                key={point.partitionMs}
                className="flex items-center justify-between gap-2 rounded bg-slate-950 px-2 py-1 text-xs"
              >
                <span className="text-slate-400">
                  {/* Un point peut ne plus tomber sur aucune mesure : la partition a changé
                      de tempo, ou de piste, et ses instants avec. Il reste utilisable, il
                      n'a simplement plus de numéro à annoncer. */}
                  {numeroDe(point.partitionMs) === null
                    ? formaterDuree(point.partitionMs)
                    : t('mesure {n}', { n: numeroDe(point.partitionMs) ?? 0 })}
                </span>
                <span className="font-mono text-slate-300">
                  {(point.audioMs / 1000).toFixed(2)} s
                </span>
                <span className="font-mono text-slate-500">
                  {index > 0 && facteurs[index - 1] ? `×${facteurs[index - 1].toFixed(3)}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(calage.filter((p) => p !== point))}
                  className="text-slate-600 hover:text-red-400"
                  aria-label={t('Retirer ce point')}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}
