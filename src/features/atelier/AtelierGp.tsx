import * as alphaTab from '@coderline/alphatab'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText, Field, Option, Select } from '../../components/ui/Field'
import { avecDecompteAvant, decoderFichierAudio, depuis } from '../../lib/audio'
import { deformerLeTemps, instantDansLAudio } from '../../lib/calage'
import {
  appliquerTempo,
  appliquerTheme,
  ancresDeDefilement,
  collecteurDeTuiles,
  colorerLesCordes,
  curseurDepuisAncres,
  dureeDUnTemps,
  etendueDesPortees,
  instantsDesMesures,
  barresDeMesure,
  largeurDeMesure,
  masquerEntete,
  pistesVisibles,
  preparerBande,
  recadrer,
  reglagesAlphaTab,
  reglerBandeauDEffets,
  sectionsDeLaPartition,
  type BandeGp,
} from '../../lib/gp'
import { useT } from '../../lib/langue'
import { creerScene, curseurQuiAttend, type Feuille } from '../../lib/scene'
import { themeParId } from '../../lib/themes'
import type { Morceau, ReglagesGp } from '../../lib/types'
import type { Apercu } from '../../lib/apercu'
import { Lecteur } from './Lecteur'
import { BandeDeFrappe, PanneauCalage, useFrappe } from './PanneauCalage'
import { PanneauExport } from './PanneauExport'
import { PanneauMiseEnScene, PanneauVideo } from './PanneauVideo'
import { useReglages } from './useReglages'
import { useMorceaux } from '../../hooks/useMorceaux'
import { messageOf } from '../../lib/api'

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
  const { deposerAudio, supprimerAudio } = useMorceaux()
  const champAudio = useRef<HTMLInputElement>(null)
  /* L'aperçu, pour que la frappe le fasse jouer : une seule lecture, celle qu'on regarde. */
  const commandesLecteur = useRef<Apercu | null>(null)
  const t = useT()
  /* La traduction rangée dans une référence, pour le seul effet de synthèse. Elle change quand
     on change de langue, et une dépendance de plus dans cet effet-là relancerait trois minutes
     de synthèse pour un clic sur « EN ». Le message d'attente, lui, est retraduit à
     l'affichage par le lecteur. */
  const traduction = useRef(t)
  useEffect(() => {
    traduction.current = t
  }, [t])
  const gp = reglages.gp
  const video = reglages.video
  const theme = themeParId(video.theme)
  const hote = useRef<HTMLDivElement>(null)
  const api = useRef<alphaTab.AlphaTabApi | null>(null)
  const tuiles = useRef(collecteurDeTuiles())

  const [pistes, setPistes] = useState<string[]>([])
  const [feuille, setFeuille] = useState<Feuille | null>(null)
  const [bande, setBande] = useState<BandeGp | null>(null)
  const [etat, setEtat] = useState('Ouverture de la partition…')
  const [erreur, setErreur] = useState<string | null>(null)
  const [sonPret, setSonPret] = useState(false)
  /* L'enregistrement joint, quand il y en a un : c'est lui qui remplace alors la synthèse,
     et c'est sur lui que le calage fait tomber les mesures. */
  const [enregistrement, setEnregistrement] = useState<AudioBuffer | null>(null)

  async function envoyerAudio(fichier: File | undefined) {
    if (!fichier) return
    try {
      await deposerAudio(morceau.id, fichier)
      setErreur(null)
    } catch (err) {
      setErreur(messageOf(err, "La bande-son n'a pas pu être envoyée."))
    }
  }

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
      colorerLesCordes(score, theme)
      instance.settings.display.staveProfile = profilDePortee(gp)
      /* La rythmique sous la tablature, demandée explicitement plutôt que laissée au mode
         « automatique » d'alphaTab. Celui-ci est censé la montrer dès que la portée classique
         est cachée ; vérifié en relevant l'encre sous la portée, il ne la dessinait pas — il
         se règle sur ce que le fichier déclare pour la piste, pas sur ce que nous affichons.
         On ne devine donc plus : quand la portée classique est là, elle porte déjà le rythme
         et il n'y a rien à répéter ; sinon la tablature le porte elle-même. */
      /* En page, alphaTab écrit lui-même les noms de sections : la partition défile
         verticalement, la place ne manque pas au-dessus des portées. En bande, c'est la scène
         qui les pose — voir sectionsDeLaPartition — et il ne faut surtout pas qu'il les
         dessine aussi, sa pile de bandes d'effets faisant grandir la bande de moitié. */
      reglerBandeauDEffets(instance, gp.sections && video.disposition === 'page')
      instance.settings.notation.rhythmMode =
        gp.rythme && !gp.afficherPortee
          ? alphaTab.TabRhythmMode.ShowWithBars
          : alphaTab.TabRhythmMode.Hidden
      /* En bande — défilement comme mesures — c'est alphaTab lui-même qui met tout le morceau
         sur une seule ligne :
         la scène n'a alors qu'à faire glisser cette bande. Recoller à la main des systèmes
         mis en page pour une feuille A4 donnerait des raccords visibles à chaque retour à la
         ligne, et une largeur de mesure qui change d'un système à l'autre. */
      instance.settings.display.layoutMode =
        video.disposition === 'page' ? alphaTab.LayoutMode.Page : alphaTab.LayoutMode.Horizontal
      appliquerTheme(instance, theme)
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
  }, [octets, gp, theme, video.disposition])

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
            vivant &&
            setEtat(
              traduction.current('Synthèse de la bande-son… {part} %', {
                part: Math.round(part * 100),
              }),
            ),
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

  // ---- L'enregistrement joint, s'il y en a un ----

  useEffect(() => {
    if (!reglages.audio) {
      setEnregistrement(null)
      return
    }
    let vivant = true
    fetch(`/api/morceaux/${morceau.id}/audio`, { credentials: 'include' })
      .then((r) => r.arrayBuffer())
      .then(decoderFichierAudio)
      .then((buffer) => vivant && setEnregistrement(buffer))
      .catch(() => vivant && setErreur("La bande-son n'a pas pu être décodée."))
    return () => {
      vivant = false
    }
    /* Le nom du fichier, et non l'objet qui le décrit : celui-ci est recréé à chaque
       enregistrement des réglages, et s'y fier ferait retélécharger la bande-son au moindre
       coup de curseur. Le nom, lui, ne change que quand le fichier change. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morceau.id, reglages.audio?.nom])

  // ---- La scène, et donc l'aperçu comme la vidéo ----

  /* Le relevé du parcours, mis à part parce que l'image et le son en ont tous deux besoin :
     la scène pour placer le curseur, la bande-son pour savoir où la rogner. Le refaire deux
     fois voudrait dire échantillonner le morceau deux fois, et surtout risquer que les deux
     ne tombent pas d'accord sur l'instant de la première note. */
  /* La déformation du temps, s'il y a des points de calage. Elle s'applique une fois, aux
     ancres, et tout ce qui est en aval — curseur, découpe en fenêtres, tournements de page —
     continue de travailler sans savoir que le temps a été tordu. C'est tout l'intérêt d'avoir
     relevé le parcours sous forme de table plutôt que de le recalculer à chaque image. */
  const calage = useMemo(() => reglages.calage ?? [], [reglages.calage])

  /* L'instant de chaque mesure, relevé à part du parcours. Il ne dépend d'aucun calage — ce
     sont les tics de la partition — et c'est justement ce qui permet à la frappe de s'en
     servir sans attendre le parcours, lequel attend le calage que la frappe produit. */
  const mesures = useMemo(() => {
    const instance = api.current
    return feuille && bande && instance ? instantsDesMesures(instance, bande.reperes) : []
  }, [feuille, bande])

  /* Le pont entre le temps de l'enregistrement et celui de la scène. Il passe par une
     référence et non par les valeurs elles-mêmes : celles-ci se calculent plus bas, à partir
     du parcours, qui se calcule à partir du calage que cette session-ci produit. Lire la
     dernière valeur connue au moment où l'on en a besoin — c'est-à-dire quand l'utilisateur
     appuie — dénoue le cercle sans rien figer. */
  const pont = useRef({ debutMs: 0, decalageMs: 0 })
  const versScene = useCallback(
    (audioMs: number) => audioMs - pont.current.debutMs + pont.current.decalageMs,
    [],
  )
  const versAudio = useCallback(
    (sceneMs: number) => sceneMs + pont.current.debutMs - pont.current.decalageMs,
    [],
  )

  /* La frappe vit ici plutôt que dans l'un des deux composants qui l'affichent : le bouton
     sur lequel on tape se tient sous l'aperçu, ses réglages dans la colonne, et les deux
     doivent parler de la même session. */
  const frappe = useFrappe({
    actif: Boolean(enregistrement),
    commandes: commandesLecteur,
    mesures,
    calage,
    onChange: (points) => modifier((r) => ({ ...r, calage: points })),
    versScene,
    versAudio,
  })
  /* Le calage que la scène doit montrer : gelé tant qu'on tape, pour que les points ajoutés
     ne refassent pas l'image sous les yeux de celui qui vise la mesure suivante. */
  const calageAffiche = frappe.calageAffiche

  const parcours = useMemo(() => {
    const instance = api.current
    if (!feuille || !bande || !gp || !instance?.score) return null
    // Le rendu d'alphaTab porte au-dessus et en dessous des portées beaucoup de blanc. On
    // cadre sur ce qui se lit, sinon la bande qu'on a demandée est aux trois quarts vide.
    const etendue = etendueDesPortees(instance)
    const brutes = ancresDeDefilement(
      instance,
      bande.reperes,
      pistesVisibles(instance.score, gp.piste),
      bande.dureeMs,
      etendue?.y0 ?? 0,
    )
    const deformer = deformerLeTemps(calageAffiche)
    const ancres = calageAffiche.length
      ? brutes.map((ancre) => ({ ...ancre, tempsMs: deformer(ancre.tempsMs) }))
      : brutes
    // La première note, et non le premier temps : une mesure de silence est faite de temps
    // qui ne sonnent pas, et c'est précisément elle qu'on veut pouvoir sauter.
    const premiere = ancres.find((a) => a.sonne)
    return { etendue, ancres, premiereNoteMs: premiere ? premiere.tempsMs : 0 }
  }, [feuille, bande, gp, calageAffiche])

  /** Ce qu'on retranche au début : rien, ou le silence qui précède la première note.
   *
   *  Avec un enregistrement joint mais pas encore calé, on ne retranche rien : l'instant de la
   *  première note est celui de la partition, et il ne désigne rien dans la reprise. Rogner là
   *  couperait le début de l'enregistrement à un endroit arbitraire — un défaut qui ressemble
   *  à un bug d'export alors qu'il ne vient que d'un réglage resté allumé. Une fois le calage
   *  posé, l'instant est connu dans l'enregistrement et le rognage reprend son sens. */
  const calageUtilisable = !enregistrement || calageAffiche.length > 0
  const debutMs =
    gp?.demarrerALaPremiereNote && calageUtilisable ? (parcours?.premiereNoteMs ?? 0) : 0

  /** La durée de ce qu'on va filmer : l'enregistrement joint, ou la synthèse. */
  const dureeSourceMs = enregistrement ? enregistrement.duration * 1000 : (bande?.dureeMs ?? 0)

  /* La durée d'un temps, qui donne sa longueur au décompte et l'écart entre ses clics. Elle
     vient de la partition et suit le curseur de tempo — ralentir le morceau ralentit le
     décompte, sans quoi il ne mènerait plus à la première note. */
  const dureeTempsMs =
    api.current?.score && gp ? dureeDUnTemps(api.current.score, gp.tempoPct) : 500

  /* Le décompte ouvre la scène et le rognage lui mange son début : deux raisons pour que
     l'instant de l'enregistrement ne soit pas celui de la vidéo. */
  const decalageMs = Math.max(0, reglages.video.compteAvantTemps) * dureeTempsMs

  /* L'instant où le curseur entre, dans le temps de la scène. Il part d'une mesure, traverse
     le calage pour tomber dans l'enregistrement, puis le décompte et le rognage pour tomber
     dans la vidéo — les trois mondes que ce fichier doit tenir ensemble. */
  const entreeSceneMs = useMemo(() => {
    const mesure = gp?.curseurEntreMesure ?? 1
    if (mesure <= 1 || mesures.length === 0) return 0
    const partitionMs = mesures[Math.min(mesure, mesures.length) - 1] ?? 0
    return instantDansLAudio(calageAffiche, partitionMs) - debutMs + decalageMs
  }, [gp?.curseurEntreMesure, mesures, calageAffiche, debutMs, decalageMs])

  // Le pont, remis à jour après chaque rendu : la frappe le lira au moment où l'on appuie.
  useEffect(() => {
    pont.current = { debutMs, decalageMs }
  }, [debutMs, decalageMs])

  const scene = useMemo(() => {
    if (!feuille || !bande || !gp || !parcours) return null
    const instance = api.current
    if (!instance?.score) return null
    // La largeur d'une mesure vient du rendu, pas d'un réglage : c'est elle qui permet de
    // demander « quatre mesures à l'écran » plutôt qu'une hauteur en pixels.
    // Les barres, elles, servent à tourner la page sur une mesure entière plutôt qu'au milieu.
    const avecMesure = {
      ...feuille,
      largeurMesure: largeurDeMesure(instance),
      barres: barresDeMesure(instance),
      sections: gp.sections ? sectionsDeLaPartition(instance) : undefined,
    }
    const cadree = parcours.etendue
      ? recadrer(avecMesure, parcours.etendue.y0, parcours.etendue.y1)
      : avecMesure
    return creerScene({
      feuille: cadree,
      video: reglages.video,
      /* Avec un enregistrement joint, c'est lui qui fait la durée : la vidéo s'arrête quand
         la reprise s'arrête, pas quand la partition aurait fini de se jouer. */
      dureeMs: dureeSourceMs - debutMs + decalageMs,
      titre: morceau.titre,
      artiste: morceau.artiste,
      dureeTempsMs,
      /* Le curseur attend sa mesure, s'il doit en attendre une. La tablature est alors déjà
         posée là où la musique va entrer, immobile, pendant que l'intro de l'enregistrement
         joue : voir curseurQuiAttend. */
      curseurA: curseurQuiAttend(
        curseurDepuisAncres(parcours.ancres, decalageMs, reglages.video.curseurGlisse, debutMs),
        entreeSceneMs,
      ),
    })
  }, [
    feuille,
    bande,
    parcours,
    debutMs,
    decalageMs,
    entreeSceneMs,
    dureeSourceMs,
    dureeTempsMs,
    reglages.video,
    morceau.titre,
    morceau.artiste,
    gp,
  ])

  /* L'enregistrement joint passe devant la synthèse : c'est bien lui qu'on veut entendre
     sous la tablature, et c'est sur lui que le curseur a été calé. */
  const source = enregistrement ?? bande?.audio ?? null

  const audio = useMemo(
    () =>
      source
        ? avecDecompteAvant(
            depuis(source, debutMs),
            reglages.video.compteAvantTemps * dureeTempsMs,
            reglages.video.decompteSonore,
            dureeTempsMs,
          )
        : null,
    [source, debutMs, dureeTempsMs, reglages.video.compteAvantTemps, reglages.video.decompteSonore],
  )

  if (!gp) return <ErrorText>{t('Ce morceau n’a pas de réglages Guitar Pro.')}</ErrorText>

  return (
    /* L'aperçu prend toute la largeur, les réglages se rangent dessous en colonnes. En
       barre latérale ils faisaient une page à n'en plus finir, et laissaient les trois quarts
       de l'écran vides sous une bande qui n'est haute que de deux cents pixels. */
    <div className="space-y-4">
      {erreur ? <ErrorText>{erreur}</ErrorText> : null}
      {/* L'aperçu est un enfant direct de la page, et non d'une enveloppe à lui : un élément
          collant ne tient que dans les limites de son parent, et une enveloppe à sa taille le
          laisserait filer dès le premier réglage. */}
      <Lecteur scene={scene} audio={audio} message={etat} commandes={commandesLecteur} />

      {/* Sous l'aperçu, et pas ailleurs : on tape en regardant la tablature, qui est le seul
          repère utile. Chercher le bouton des yeux dans une colonne de réglages fait rater la
          mesure qu'on visait. */}
      <BandeDeFrappe frappe={frappe} />

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

      {/* Des colonnes tenues à la main, et non un flux qui se rééquilibre. Un empilement
         automatique range mieux, mais il redistribue tout dès qu'une carte grandit : déplier
         un réglage faisait alors sauter les cartes d'une colonne à l'autre, et l'on perdait
         des yeux celle qu'on venait d'ouvrir. Ici chaque carte a sa colonne pour de bon —
         déplier n'allonge que la sienne. */}
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-4">
          <Card className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-slate-200">Partition</h2>
              <span className="text-xs text-slate-500">
                {enregistre ? 'enregistré' : 'enregistrement…'}
              </span>
            </div>

            <Field
              label="Piste"
              hint="Une seule piste donne une vidéo lisible ; toutes, un panorama."
            >
              <Select
                value={String(gp.piste)}
                onChange={(e) =>
                  modifier((r) => ({
                    ...r,
                    gp: { ...gp, piste: Number(e.target.value) },
                  }))
                }
              >
                <Option value="-1">Toutes les pistes</Option>
                {pistes.map((nom, index) => (
                  <option key={index} value={index}>
                    {nom}
                  </option>
                ))}
              </Select>
            </Field>

            <label className="block">
              <span className="mb-1 flex items-center justify-between text-sm font-medium text-slate-300">
                {t('Tempo')}
                <span className="font-mono text-xs text-slate-500">{gp.tempoPct} %</span>
              </span>
              <input
                type="range"
                min={40}
                max={150}
                step={5}
                value={gp.tempoPct}
                onChange={(e) =>
                  modifier((r) => ({
                    ...r,
                    gp: { ...gp, tempoPct: Number(e.target.value) },
                  }))
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
              {/* Attendre, et non rogner : l'intro continue de jouer, la tablature est déjà
                  à sa place, et seul le curseur se retient d'entrer. */}
              <Field
                label="Le curseur entre à la mesure"
                hint={
                  (gp.curseurEntreMesure ?? 1) > 1
                    ? 'L’intro joue, la tablature attend à cette mesure, et le curseur n’entre qu’au moment où les notes commencent.'
                    : 'À utiliser quand l’enregistrement s’ouvre sur ce qu’on ne joue pas : une mesure de percussions, un décompte, quatre temps de batterie.'
                }
              >
                <Select
                  value={String(gp.curseurEntreMesure ?? 1)}
                  onChange={(e) =>
                    modifier((r) => ({
                      ...r,
                      gp: { ...gp, curseurEntreMesure: Number(e.target.value) },
                    }))
                  }
                >
                  {(mesures.length > 0 ? mesures : [0]).map((_, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1}
                    </option>
                  ))}
                </Select>
              </Field>

              <Bascule
                label="Commencer à la première note"
                actif={gp.demarrerALaPremiereNote}
                onChange={(demarrerALaPremiereNote) =>
                  modifier((r) => ({
                    ...r,
                    gp: { ...gp, demarrerALaPremiereNote },
                  }))
                }
              />
              <Bascule
                label="Rythmique sous la tablature"
                actif={gp.rythme}
                onChange={(rythme) => modifier((r) => ({ ...r, gp: { ...gp, rythme } }))}
              />
              <Bascule
                label="Noms de sections au-dessus"
                actif={gp.sections}
                onChange={(sections) => modifier((r) => ({ ...r, gp: { ...gp, sections } }))}
              />
              <Bascule
                label="Métronome dans la bande-son"
                actif={gp.metronome}
                onChange={(metronome) => modifier((r) => ({ ...r, gp: { ...gp, metronome } }))}
              />
            </div>

            {/* Le cadrage de la vidéo coupe la mention que le moteur dessine sous la portée :
              elle est rendue ici, où elle reste lisible. */}
            <p className="border-t border-slate-800 pt-3 text-xs text-slate-500">
              {t('Partition lue, mise en page et jouée par')}{' '}
              <a
                href="https://alphatab.net"
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 underline hover:text-slate-200"
              >
                alphaTab
              </a>
              .
            </p>
          </Card>
          {/* L'enregistrement joint et son calage. Ils vivent à côté de l'export parce que
              c'est la bande-son de la vidéo qu'ils décident, et non la mise en scène. */}
          <Card className="space-y-3">
            <h2 className="font-medium text-slate-200">{t('Bande-son')}</h2>
            <p className="text-sm text-slate-400">
              {t(
                'Par défaut, c’est alphaTab qui joue la partition. Joins ta reprise ou une bande d’accompagnement pour que la vidéo porte le vrai son — et que la tablature le suive.',
              )}
            </p>
            <input
              ref={champAudio}
              type="file"
              accept=".mp3,.ogg,.wav,.m4a,.flac"
              className="hidden"
              onChange={(e) => void envoyerAudio(e.target.files?.[0])}
            />
            {reglages.audio ? (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-950 px-3 py-2">
                <span className="truncate text-sm text-slate-300">{reglages.audio.nom}</span>
                <button
                  onClick={() => void supprimerAudio(morceau.id)}
                  className="shrink-0 text-sm text-slate-500 hover:text-red-400"
                >
                  {t('Retirer')}
                </button>
              </div>
            ) : (
              <Button variant="secondary" onClick={() => champAudio.current?.click()}>
                Ajouter un fichier audio
              </Button>
            )}
          </Card>

          <PanneauCalage frappe={frappe} />

          <PanneauExport
            morceau={morceau}
            scene={scene}
            audio={audio}
            video={reglages.video}
            modifier={(mutation) => modifier((r) => ({ ...r, video: mutation(r.video) }))}
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
