import * as alphaTab from '@coderline/alphatab'
import { bufferDepuisEntrelace, contexteAudio } from './audio'
import { courbeMonotone } from './courbe'
import { largeurMedianeDeMesure } from './echelle'
import type { Curseur, Feuille, Tuile } from './scene'
import { couleurDeCorde, hexVersRgb, type Theme } from './themes'

/**
 * Le pont avec alphaTab, qui fait ici tout le travail de musicien : lire un fichier
 * Guitar Pro, le mettre en page, le jouer, et surtout dire **où** se trouve chaque temps
 * sur l'image qu'il vient de dessiner.
 *
 * Deux choses seulement sont ajoutées par ce fichier, et ce sont celles dont la vidéo a
 * besoin :
 *
 *  - la partition rendue est récupérée sous forme de tuiles (des canvas), pour pouvoir
 *    être redessinée ailleurs que dans la page ;
 *  - le temps est relié aux positions. alphaTab pense en *tics* midi, la vidéo pense en
 *    millisecondes, et la conversion entre les deux dépend de tous les changements de
 *    tempo du morceau. Plutôt que de refaire ce calcul, on le récupère : l'export audio
 *    livre, à chaque tranche produite, le tic et la milliseconde correspondants. La table
 *    ainsi construite est exactement celle qui a servi à fabriquer le son, donc l'image
 *    ne peut pas se décaler du son.
 */

/** Le type que le constructeur d'alphaTab accepte. Il n'est pas exporté nommément par le
 *  paquet : on le récupère donc là où il est sûr d'être juste, sur le constructeur. */
export type ReglagesMoteur = ConstructorParameters<typeof alphaTab.AlphaTabApi>[1]

export const POLICE_ALPHATAB = '/font/'
export const BANQUE_DE_SONS = '/soundfont/sonivox.sf3'

/** L'export audio d'alphaTab est stéréo entrelacé : deux échantillons par image. */
const CANAUX = 2

export interface Repere {
  tempsMs: number
  tick: number
}

export interface BandeGp {
  audio: AudioBuffer
  reperes: Repere[]
  dureeMs: number
}

/* Le moteur `html5` plutôt que le SVG habituel : le rendu arrive alors directement sous
   forme de canvas, qu'on peut recopier dans l'image de la vidéo. Un SVG demanderait de
   le sérialiser, d'y embarquer la police musicale et de le repasser par une image — trois
   occasions de perdre les symboles en route.

   Et le chargement paresseux est coupé : il n'affiche que ce qui est à l'écran, ce qui est
   une bonne idée pour lire une partition et une très mauvaise pour en filmer la fin. */
export function reglagesAlphaTab(): ReglagesMoteur {
  return {
    core: {
      engine: 'html5',
      enableLazyLoading: false,
      fontDirectory: POLICE_ALPHATAB,
      logLevel: 'warning',
    },
    display: {
      layoutMode: 'page',
      // Une seule mise en page pour l'écran et pour la vidéo : c'est ce qui garantit que
      // les coordonnées relevées ici valent aussi là-bas.
      scale: 1,
      justifyLastSystem: false,
    },
    player: {
      // Le moteur de lecture est activé même quand on ne joue pas : c'est lui qui produit
      // la table des tics, sans laquelle on ne saurait pas où poser le curseur.
      playerMode: 'EnabledAutomatic',
      soundFont: BANQUE_DE_SONS,
      enableCursor: true,
      enableAnimatedBeatCursor: true,
      enableElementHighlighting: true,
      scrollMode: 'continuous',
    },
  }
}

/**
 * L'en-tête qu'alphaTab dessine en haut de la partition — titre, artiste, paroles, droits —
 * n'a pas sa place ici : la vidéo porte déjà son propre bandeau, et ces quelques lignes
 * mangeraient le haut de la première image sans rien ajouter.
 *
 * Ce réglage se pose sur l'objet plutôt que dans le JSON de construction : alphaTab attend
 * ici une vraie Map, que la forme littérale ne sait pas exprimer.
 */
export function masquerEntete(api: alphaTab.AlphaTabApi): void {
  const caches = [
    alphaTab.NotationElement.ScoreTitle,
    alphaTab.NotationElement.ScoreSubTitle,
    alphaTab.NotationElement.ScoreArtist,
    alphaTab.NotationElement.ScoreAlbum,
    alphaTab.NotationElement.ScoreWords,
    alphaTab.NotationElement.ScoreMusic,
    alphaTab.NotationElement.ScoreWordsAndMusic,
  ]
  for (const element of caches) api.settings.notation.elements.set(element, false)
}

/** « #rrggbb » vers la couleur qu'alphaTab attend. */
export function couleurAlphaTab(hex: string): alphaTab.model.Color {
  const { r, g, b } = hexVersRgb(hex)
  return new alphaTab.model.Color(r, g, b, 255)
}

/**
 * Les couleurs du thème passées à alphaTab **avant** le rendu.
 *
 * On aurait pu repeindre après coup, en filtrant l'image rendue. Mais une portée n'est pas
 * une image qu'on retouche : inverser ses couleurs retourne aussi les chiffres, et les
 * teinter teinte le blanc entre les lignes. Le moteur sait dessiner en clair sur sombre, il
 * suffit de le lui demander.
 */
export function appliquerTheme(api: alphaTab.AlphaTabApi, theme: Theme): void {
  const r = api.settings.display.resources
  r.staffLineColor = couleurAlphaTab(theme.lignes)
  r.barSeparatorColor = couleurAlphaTab(theme.barres)
  r.barNumberColor = couleurAlphaTab(theme.barres)
  r.mainGlyphColor = couleurAlphaTab(theme.encre)
  r.secondaryGlyphColor = couleurAlphaTab(theme.encreFaible)
  r.scoreInfoColor = couleurAlphaTab(theme.texteFaible)
}

/**
 * Une couleur par corde, posée note par note dans le modèle.
 *
 * C'est la lecture qu'on trouve sur les logiciels d'apprentissage : la couleur dit sur quelle
 * corde jouer, le chiffre dit à quelle case. L'œil trouve la corde avant d'avoir lu le
 * chiffre, ce qui est exactement ce qu'on veut quand la vidéo défile pendant qu'on joue.
 *
 * La numérotation des cordes d'alphaTab part de la plus grave, si bien qu'une basse à quatre
 * cordes et une guitare à sept ont toutes deux leur corde grave en premier — rien à compter,
 * rien à retourner.
 */
export function colorerLesCordes(score: alphaTab.model.Score, theme: Theme): void {
  if (!theme.cordes) return

  for (const piste of score.tracks) {
    for (const portee of piste.staves) {
      for (const mesure of portee.bars) {
        for (const voix of mesure.voices) {
          for (const temps of voix.beats) {
            for (const note of temps.notes) {
              const couleur = couleurDeCorde(theme, note.string)
              if (!couleur) continue
              // Le style n'existe pas tant qu'on n'a rien demandé : c'est ce qui permet à une
              // partition non colorée de ne rien coûter en mémoire.
              note.style ??= new alphaTab.model.NoteStyle()
              note.style.colors.set(
                alphaTab.model.NoteSubElement.GuitarTabFretNumber,
                couleurAlphaTab(couleur),
              )
            }
          }
        }
      }
    }
  }
}

/**
 * Les pistes à rendre, telles qu'alphaTab les attend.
 * `-1` veut dire « toutes », et c'est aussi ce qu'on renvoie quand la piste demandée
 * n'existe plus — un fichier remplacé par une version qui a une piste de moins ne doit
 * pas se solder par une page blanche.
 */
export function pistesVisibles(score: alphaTab.model.Score, piste: number): number[] {
  if (piste < 0 || piste >= score.tracks.length) return score.tracks.map((_, i) => i)
  return [piste]
}

/**
 * Applique le pourcentage de tempo à la partition elle-même, plutôt qu'au lecteur.
 *
 * alphaTab sait ralentir la lecture à la volée, mais pas l'export audio, qui rend
 * toujours le morceau au tempo écrit. Comme la vidéo est fabriquée à partir de cet export,
 * ralentir le lecteur donnerait une image au ralenti sur un son à vitesse normale. On
 * change donc le tempo dans le modèle : le son, l'image et la durée annoncée y répondent
 * tous les trois, puisqu'ils en découlent tous les trois.
 */
export function appliquerTempo(score: alphaTab.model.Score, tempoPct: number): void {
  const facteur = Math.max(0.1, Math.min(3, tempoPct / 100))
  if (facteur === 1) return
  for (const mesure of score.masterBars) {
    for (const automation of mesure.tempoAutomations) {
      automation.value = automation.value * facteur
    }
  }
}

/**
 * Ramasse les morceaux de partition dessinés par alphaTab.
 *
 * Le rendu arrive en plusieurs fois — alphaTab découpe la page en bandes et les livre au
 * fur et à mesure — et chaque livraison annonce sa position dans l'ensemble. On garde le
 * tout tel quel : c'est déjà la feuille dont la scène a besoin.
 */
export function collecteurDeTuiles() {
  let tuiles: Tuile[] = []
  let largeur = 0
  let hauteur = 0

  return {
    vider() {
      tuiles = []
      largeur = 0
      hauteur = 0
    },
    ajouter(e: alphaTab.rendering.RenderFinishedEventArgs) {
      const source = e.renderResult
      // Avec le moteur html5 c'est un canvas. Le test reste explicite : si une version
      // future livrait autre chose, mieux vaut une partition incomplète qu'un plantage au
      // premier `drawImage`.
      if (!(source instanceof HTMLCanvasElement) && !(source instanceof HTMLImageElement)) return
      tuiles.push({ x: e.x, y: e.y, w: e.width, h: e.height, source })
      largeur = Math.max(largeur, e.totalWidth, e.x + e.width)
      hauteur = Math.max(hauteur, e.totalHeight, e.y + e.height)
    },
    feuille(): Feuille {
      return { largeur, hauteur, tuiles: [...tuiles] }
    },
  }
}

/**
 * La hauteur réellement occupée par les portées, dans le rendu d'alphaTab.
 *
 * Le rendu ne s'arrête pas aux portées : il porte au-dessus l'indication de tempo et le nom
 * de la section, en dessous la mention du moteur de rendu, et entre les deux beaucoup de
 * blanc. Mettre *tout cela* à la hauteur de la bande reviendrait à réduire la tablature au
 * tiers de la place qu'on lui a donnée — on demande 40 % de l'image et on obtient une portée
 * minuscule au milieu du vide, sans comprendre pourquoi.
 *
 * On mesure donc ce qui compte, et la scène cadre là-dessus.
 */
export function etendueDesPortees(api: alphaTab.AlphaTabApi): { y0: number; y1: number } | null {
  const bornes = api.boundsLookup
  if (!bornes || bornes.staffSystems.length === 0) return null

  /* Il faut descendre jusqu'aux bornes d'une mesure **d'une portée**, et pas s'arrêter plus
     haut. La hiérarchie d'alphaTab compte trois niveaux, et les deux premiers sont trompeurs :
     le système et la mesure-maîtresse déclarent tous deux la hauteur de tout ce qui gravite
     autour de la musique — indication de tempo, nom de section, nom d'instrument, mention du
     moteur de rendu. Seul le troisième niveau, documenté comme couvrant « the region of the
     staff », donne la portée elle-même.

     La différence n'est pas un détail de quelques pixels : sur une tablature de basse, la
     portée fait le quart de ce que le système déclare. Recadrer sur les mauvaises bornes
     revenait à ne pas recadrer du tout, et la bande emportait trois quarts d'air. */
  let y0 = Number.POSITIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (const systeme of bornes.staffSystems) {
    for (const mesureMaitresse of systeme.bars) {
      for (const mesure of mesureMaitresse.bars) {
        y0 = Math.min(y0, mesure.visualBounds.y)
        y1 = Math.max(y1, mesure.visualBounds.y + mesure.visualBounds.h)
      }
    }
  }
  if (!Number.isFinite(y0) || y1 <= y0) return null

  /* La rythmique n'est pas dans ces bornes-là. alphaTab la dessine sous la portée, dans une
     bande à part dont il connaît la hauteur mais qu'il ne déclare nulle part dans le relevé
     des mesures — « the region of the staff » s'arrête à la dernière ligne. Mesuré sur une
     tablature de basse : portée de 125 à 164, recadrage à 173, et vingt-cinq pixels de
     rythmique à dessiner sous 164. On en gardait neuf. Restait le haut des hampes, c'est-à-
     dire juste assez pour ne pas voir qu'il manquait quelque chose, et pas assez pour lire
     une durée. */
  const rythme = hauteurDeLaRythmique(api)

  // Une marge mesurée : les chiffres de doigté et les nuances débordent de la portée et ne
  // doivent pas être coupés, mais chaque pixel donné au vide est un pixel retiré à la
  // tablature — c'est elle qu'on est venu regarder.
  const marge = (y1 - y0) * 0.22
  return { y0: Math.max(0, y0 - marge), y1: y1 + rythme + marge }
}

/**
 * La hauteur que la rythmique occupe sous la tablature, ou zéro si elle n'est pas dessinée.
 *
 * Le mode « automatique » d'alphaTab, qui est celui par défaut, ne dit pas s'il a fini par
 * l'afficher : il le décide au rendu, d'après la visibilité de la portée classique. On
 * refait donc ici la même lecture, faute de pouvoir la lui demander.
 */
function hauteurDeLaRythmique(api: alphaTab.AlphaTabApi): number {
  const notation = api.settings.notation
  const profil = api.settings.display.staveProfile
  const tabSeule = profil === alphaTab.StaveProfile.Tab || profil === alphaTab.StaveProfile.TabMixed
  const montree =
    notation.rhythmMode === alphaTab.TabRhythmMode.ShowWithBeams ||
    notation.rhythmMode === alphaTab.TabRhythmMode.ShowWithBars ||
    (notation.rhythmMode === alphaTab.TabRhythmMode.Automatic && tabSeule)
  return montree ? notation.rhythmHeight : 0
}

/** La même feuille, ramenée à la tranche utile — les tuiles remontent d'autant. */
export function recadrer(feuille: Feuille, y0: number, y1: number): Feuille {
  return {
    ...feuille,
    hauteur: Math.max(1, y1 - y0),
    tuiles: feuille.tuiles.map((tuile) => ({ ...tuile, y: tuile.y - y0 })),
  }
}

/**
 * La largeur d'une mesure dans le rendu, mesurée sur le rendu lui-même.
 *
 * Elle ne se déduit d'aucun réglage : alphaTab donne à chaque mesure la largeur que réclame
 * son contenu, si bien qu'une mesure de rondes et une mesure de doubles-croches n'occupent pas
 * la même place. C'est pourtant cette largeur qu'il faut pour répondre à « je veux quatre
 * mesures à l'écran », d'où la médiane sur toutes les mesures rendues.
 */
export function largeurDeMesure(api: alphaTab.AlphaTabApi): number {
  const bornes = api.boundsLookup
  if (!bornes) return 0
  const largeurs: number[] = []
  for (const systeme of bornes.staffSystems) {
    for (const mesure of systeme.bars) largeurs.push(mesure.realBounds.w)
  }
  return largeurMedianeDeMesure(largeurs)
}

/**
 * Où tombent les barres de mesure dans le rendu.
 *
 * La largeur médiane ci-dessus suffit à répondre à « combien de mesures à l'écran », qui est
 * une question de zoom. Elle ne suffit pas à tourner la page sans couper une mesure : pour
 * cela il faut les positions réelles, et elles ne sont régulières nulle part — la première
 * mesure porte la clef et l'accordage, une mesure de doubles-croches tient deux fois la place
 * d'une mesure de rondes.
 *
 * Le tableau rendu compte **une valeur de plus que le nombre de mesures** : la dernière ferme
 * la dernière mesure, faute de quoi on ne saurait pas où celle-ci s'arrête.
 */
export function barresDeMesure(api: alphaTab.AlphaTabApi): number[] {
  const bornes = api.boundsLookup
  if (!bornes) return []

  /* Une même mesure revient plusieurs fois dans les bornes — mesuré sur une tablature de
     basse, neuf fois pour chacune. alphaTab y verse une entrée par portée et par passe de
     rendu, et la mise en page horizontale n'y change rien. Les garder toutes reviendrait à
     déclarer des centaines de mesures de largeur nulle, et le découpage en fenêtres, ne
     trouvant plus de barre où s'arrêter, se remettrait à couper au kilomètre. On ne retient
     donc que les abscisses distinctes, arrondies au pixel : deux mesures ne peuvent pas
     commencer au même endroit sur une ligne unique. */
  const vues = new Set<number>()
  let fin = 0
  for (const systeme of bornes.staffSystems) {
    for (const mesure of systeme.bars) {
      vues.add(Math.round(mesure.realBounds.x))
      fin = Math.max(fin, mesure.realBounds.x + mesure.realBounds.w)
    }
  }
  if (vues.size === 0) return []

  const barres = [...vues].sort((a, b) => a - b)
  barres.push(Math.max(Math.round(fin), barres[barres.length - 1] + 1))
  return barres
}

/**
 * Fabrique la bande-son et la table des tics, d'un seul mouvement.
 *
 * Les deux sortent du même passage du synthétiseur, et c'est volontaire : ce sont deux
 * lectures d'un même événement, pas deux calculs qu'il faudrait ensuite faire concorder.
 */
export async function preparerBande(
  api: alphaTab.AlphaTabApi,
  options: { onProgression?: (part: number) => void; signal?: AbortSignal } = {},
): Promise<BandeGp> {
  const frequence = contexteAudio().sampleRate
  const reglages = new alphaTab.synth.AudioExportOptions()
  reglages.sampleRate = frequence
  reglages.masterVolume = 1
  reglages.metronomeVolume = api.metronomeVolume

  const exportateur = await api.exportAudio(reglages)
  const blocs: Float32Array[] = []
  // Le premier repère est posé à la main : l'exportateur ne rend compte qu'après avoir
  // produit quelque chose, et il manquerait sinon le point de départ du morceau.
  const reperes: Repere[] = [{ tempsMs: 0, tick: 0 }]
  let echantillons = 0
  let dureeMs = 0

  try {
    for (;;) {
      if (options.signal?.aborted) throw new DOMException('Préparation interrompue.', 'AbortError')
      const tranche = await exportateur.render(500)
      if (!tranche) break
      blocs.push(tranche.samples)

      /* Le temps est compté sur les échantillons produits, et non lu sur `currentTime`.
         Les deux devraient dire la même chose ; mesuré, ils diffèrent d'une tranche entière.
         `currentTick` donne le tic **à la fin** de la tranche qu'on vient de recevoir, tandis
         que `currentTime` donne l'instant de son **début** — apparier les deux décalait toute
         la table d'une demi-seconde, et avec elle le curseur, qui devançait le son du même
         montant d'un bout à l'autre du morceau. Vérifié sur une vraie tablature : la première
         note sonne à 3356 ms, la table l'annonçait à 2856.

         Les échantillons, eux, ne mentent pas : leur nombre est la durée, exactement, et
         c'est bien la fin de la tranche — le même bout que `currentTick`. Au passage la durée
         du morceau cesse d'être trop courte d'une tranche, ce qui rognait la dernière
         demi-seconde de chaque vidéo. */
      echantillons += tranche.samples.length
      dureeMs = (echantillons / CANAUX / frequence) * 1000
      reperes.push({ tempsMs: dureeMs, tick: tranche.currentTick })

      if (tranche.endTime > 0) options.onProgression?.(dureeMs / tranche.endTime)
    }
  } finally {
    exportateur.destroy()
  }

  const audio = bufferDepuisEntrelace(blocs, CANAUX, frequence)
  return { audio, reperes, dureeMs }
}

/** Le tic joué à l'instant demandé, interpolé entre deux repères. */
export function tickA(reperes: Repere[], tempsMs: number): number {
  if (reperes.length === 0) return 0
  if (tempsMs <= reperes[0].tempsMs) return reperes[0].tick

  let bas = 0
  let haut = reperes.length - 1
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1
    if (reperes[milieu].tempsMs <= tempsMs) bas = milieu
    else haut = milieu - 1
  }
  const debut = reperes[bas]
  const suivant = reperes[bas + 1]
  if (!suivant) return debut.tick
  const part = (tempsMs - debut.tempsMs) / Math.max(1, suivant.tempsMs - debut.tempsMs)
  return debut.tick + (suivant.tick - debut.tick) * part
}

/**
 * La fonction que la scène appellera à chaque image : où en est-on, et où est-ce ?
 *
 * Le curseur glisse d'un temps au suivant plutôt que de sauter : c'est ce glissement qui
 * donne l'impression de suivre la musique, et non de la pointer après coup. Il ne glisse
 * en revanche jamais vers un temps qui a changé de ligne — sinon il traverserait la page
 * en diagonale à chaque fin de système.
 */
/** L'instant où l'on joue ce tic — l'inverse exact de tickA, sur la même table. */
export function tempsA(reperes: Repere[], tick: number): number {
  if (reperes.length === 0) return 0
  if (tick <= reperes[0].tick) return reperes[0].tempsMs

  let bas = 0
  let haut = reperes.length - 1
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1
    if (reperes[milieu].tick <= tick) bas = milieu
    else haut = milieu - 1
  }
  const debut = reperes[bas]
  const suivant = reperes[bas + 1]
  if (!suivant) return debut.tempsMs
  const part = (tick - debut.tick) / Math.max(1, suivant.tick - debut.tick)
  return debut.tempsMs + (suivant.tempsMs - debut.tempsMs) * part
}

export interface AncreDefilement {
  tempsMs: number
  /** Position du trait au moment où ce temps est joué. */
  x: number
  y: number
  h: number
  bloc: { x: number; w: number }
  /** Vrai si ce temps porte des notes. Un silence est un temps aussi, et il ne sonne pas. */
  sonne: boolean
}

/**
 * Où se trouve le curseur à chaque temps du morceau, relevé une fois pour toutes.
 *
 * On demandait auparavant la position à chaque image, et on interpolait entre le temps en
 * cours et le suivant avec les tics que la table de recherche annonce. Cette interpolation
 * était fausse : mesurée, la position avançait d'un pixel par image pendant plus d'une
 * seconde, puis rattrapait d'un bond de dix-sept. Un rapport de seize entre la vitesse la
 * plus lente et la plus rapide — c'est cela qu'on voyait saccader.
 *
 * Plutôt que de réparer ce calcul, on cesse de s'en servir. Le relevé ci-dessous ne retient
 * de la table de recherche que ce qu'elle sait dire sans se tromper — *quel* temps est joué —
 * et prend l'instant exact dans la table des tics, celle-là même qui a produit le son. Entre
 * deux temps, c'est une courbe monotone qui décide, et non plus une règle.
 */
export function ancresDeDefilement(
  api: alphaTab.AlphaTabApi,
  reperes: Repere[],
  pistes: number[],
  dureeMs: number,
  // Le même recadrage que la feuille : le curseur vit dans le repère du rendu, et si la
  // feuille remonte sans lui, il pointe une portée qui n'est plus là.
  decalageY = 0,
  pasMs = 10,
): AncreDefilement[] {
  const cache = api.tickCache
  const bornes = api.boundsLookup
  if (!cache || !bornes) return []

  const lookupPistes = new Set(pistes)
  const ancres: AncreDefilement[] = []
  let dernierTemps: unknown = null

  for (let t = 0; t <= dureeMs; t += pasMs) {
    const trouve = cache.findBeat(lookupPistes, tickA(reperes, t))
    if (!trouve || trouve.beat === dernierTemps) continue
    dernierTemps = trouve.beat

    const beat = bornes.findBeat(trouve.beat)
    if (!beat) continue
    const systeme = beat.barBounds.masterBarBounds.visualBounds

    ancres.push({
      // L'instant vient des tics, pas de l'échantillonnage : le pas ne sert qu'à repérer les
      // changements de temps, il ne détermine pas leur date.
      tempsMs: tempsA(reperes, trouve.start),
      x: beat.onNotesX,
      y: systeme.y - decalageY,
      h: systeme.h,
      bloc: { x: beat.visualBounds.x, w: beat.visualBounds.w },
      sonne: (trouve.beat as alphaTab.model.Beat).notes.length > 0,
    })
  }

  return ancres
}

export function curseurDepuisAncres(
  ancres: AncreDefilement[],
  decalageMs: number,
  glisse = true,
  /** Ce qu'on retranche au début du morceau : le silence d'avant la première note. */
  debutMs = 0,
): (tMs: number) => Curseur | null {
  if (ancres.length === 0) return () => null
  /* Le décalage du décompte s'ajoute, celui de la découpe se retranche : une ancre posée à
     `debutMs` dans le morceau doit tomber à `decalageMs` dans la vidéo, c'est-à-dire juste
     après le décompte. Les deux se composent en une seule translation. */
  const glissement = decalageMs - debutMs
  const courbe = courbeMonotone(ancres.map((a) => ({ t: a.tempsMs + glissement, v: a.x })))

  return (tMs: number) => {
    // Le décompte, lui, se compte toujours depuis zéro : pas de curseur avant qu'il finisse.
    if (tMs < decalageMs) return null
    // La position s'interpole, le reste non : un surlignage à cheval sur deux temps ne
    // voudrait rien dire, et la portée ne se déplace pas entre deux notes.
    const ancre = ancres[courbe.indexA(tMs)]
    if (!ancre) return null
    /* Sans glissement, le curseur se pose sur la note qui sonne et l'y attend. On perd où l'on
       en est *entre* deux notes ; on gagne une pulsation régulière au lieu d'une vitesse qui
       varie du simple au sextuple, parce qu'une partition espace ses notes selon une règle de
       gravure et non au prorata de leur durée. Ça ne se remarque pas quand la bande défile —
       elle bouge aussi — mais en mesures fixes le curseur est seul à bouger. */
    return { x: glisse ? courbe(tMs) : ancre.x, y: ancre.y, h: ancre.h, bloc: ancre.bloc }
  }
}
