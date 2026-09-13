import * as alphaTab from '@coderline/alphatab'
import { bufferDepuisEntrelace, contexteAudio } from './audio'
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
 * Le nombre de cordes est repris de l'accordage de la portée, pas supposé : une basse à
 * quatre cordes et une guitare à sept doivent toutes deux avoir leur corde grave en rouge.
 */
export function colorerLesCordes(score: alphaTab.model.Score, theme: Theme): void {
  if (!theme.cordes) return

  for (const piste of score.tracks) {
    for (const portee of piste.staves) {
      const nombreDeCordes = portee.tuning.length || 6
      for (const mesure of portee.bars) {
        for (const voix of mesure.voices) {
          for (const temps of voix.beats) {
            for (const note of temps.notes) {
              const couleur = couleurDeCorde(theme, note.string, nombreDeCordes)
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

  let y0 = Number.POSITIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (const systeme of bornes.staffSystems) {
    y0 = Math.min(y0, systeme.visualBounds.y)
    y1 = Math.max(y1, systeme.visualBounds.y + systeme.visualBounds.h)
  }
  if (!Number.isFinite(y0) || y1 <= y0) return null

  // Une marge mesurée : les chiffres de doigté, les hampes et les indications de rythme
  // débordent de la portée et ne doivent pas être coupés, mais chaque pixel donné au blanc
  // est un pixel retiré à la tablature — c'est elle qu'on est venu regarder.
  const marge = (y1 - y0) * 0.22
  return { y0: Math.max(0, y0 - marge), y1: y1 + marge }
}

/** La même feuille, ramenée à la tranche utile — les tuiles remontent d'autant. */
export function recadrer(feuille: Feuille, y0: number, y1: number): Feuille {
  return {
    largeur: feuille.largeur,
    hauteur: Math.max(1, y1 - y0),
    tuiles: feuille.tuiles.map((tuile) => ({ ...tuile, y: tuile.y - y0 })),
  }
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
  let dureeMs = 0

  try {
    for (;;) {
      if (options.signal?.aborted) throw new DOMException('Préparation interrompue.', 'AbortError')
      const tranche = await exportateur.render(500)
      if (!tranche) break
      blocs.push(tranche.samples)
      reperes.push({ tempsMs: tranche.currentTime, tick: tranche.currentTick })
      dureeMs = tranche.currentTime
      if (tranche.endTime > 0) options.onProgression?.(tranche.currentTime / tranche.endTime)
    }
  } finally {
    exportateur.destroy()
  }

  return { audio: bufferDepuisEntrelace(blocs, 2, frequence), reperes, dureeMs }
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
export function curseurGp(
  api: alphaTab.AlphaTabApi,
  reperes: Repere[],
  pistes: number[],
  decalageMs: number,
  // Le même recadrage que la feuille : le curseur vit dans le repère du rendu, et si la
  // feuille remonte sans lui, il pointe une portée qui n'est plus là.
  decalageY = 0,
): (tMs: number) => Curseur | null {
  const lookupPistes = new Set(pistes)

  return (tMs: number) => {
    const cache = api.tickCache
    const bornes = api.boundsLookup
    if (!cache || !bornes) return null

    const tick = tickA(reperes, Math.max(0, tMs - decalageMs))
    const trouve = cache.findBeat(lookupPistes, tick)
    if (!trouve) return null

    const beat = bornes.findBeat(trouve.beat)
    if (!beat) return null
    const systeme = beat.barBounds.masterBarBounds.visualBounds

    let x = beat.onNotesX
    const suivant = trouve.nextBeat ? bornes.findBeat(trouve.nextBeat.beat) : null
    if (suivant && suivant.barBounds.masterBarBounds.visualBounds.y === systeme.y) {
      const duree = Math.max(1, trouve.end - trouve.start)
      const part = Math.min(1, Math.max(0, (tick - trouve.start) / duree))
      x += (suivant.onNotesX - beat.onNotesX) * part
    }

    return {
      x,
      y: systeme.y - decalageY,
      h: systeme.h,
      bloc: { x: beat.visualBounds.x, w: beat.visualBounds.w },
    }
  }
}
