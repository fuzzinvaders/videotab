import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * L'apparence de l'application — à ne pas confondre avec le thème de la vidéo.
 *
 * Le mot « thème » est déjà pris, et par la chose la plus visible de l'atelier : la palette de
 * la tablature qu'on va filmer. Appeler de ce nom-là l'habillage de l'interface rendrait la
 * moitié des phrases ambiguës, à commencer par celles des réglages. D'où « apparence », qui ne
 * désigne que les murs autour.
 *
 * Elle a **deux axes**, et c'est volontaire. Le style dit la forme — coins, graisses, lignes,
 * capitales — et la clarté dit seulement s'il fait jour ou nuit. Les mêler dans un seul
 * réglage forcerait à choisir entre « j'aime cette ambiance » et « je travaille en plein
 * soleil », alors que ce sont deux questions différentes et qu'on y répond séparément.
 */

/**
 * La forme générale.
 *
 * « ardoise » est celle d'origine : coins arrondis, lignes douces, typographie ordinaire.
 * « atelier » vient de presetbook, l'autre application de la maison : presque carrée,
 * des titres en capitales serrées, des étiquettes en chasse fixe, un filet de couleur au
 * flanc de chaque carte. Une mise en page de catalogue plutôt que de tableau de bord.
 */
export type StyleApparence = 'ardoise' | 'atelier'

/** Jour ou nuit, indépendamment du style. */
export type Clarte = 'clair' | 'sombre'

const CLEF_STYLE = 'videotab.style'
const CLEF_CLARTE = 'videotab.clarte'

function garde(clef: string, valeurs: readonly string[]): string | null {
  try {
    const gardee = localStorage.getItem(clef)
    return gardee && valeurs.includes(gardee) ? gardee : null
  } catch {
    // Un navigateur en navigation privée peut refuser le stockage : ce n'est pas une raison
    // pour ne pas démarrer.
    return null
  }
}

function styleInitial(): StyleApparence {
  return (garde(CLEF_STYLE, ['ardoise', 'atelier']) as StyleApparence) ?? 'ardoise'
}

/**
 * La clarté au premier chargement : le choix déjà exprimé, sinon la préférence du système.
 *
 * Quelqu'un qui travaille en clair partout n'a pas à le redemander ici. Sans préférence
 * connue, le sombre : une application qui sert à fabriquer des incrustations pour des vidéos
 * se regarde plus souvent la nuit qu'à midi.
 */
function clarteInitiale(): Clarte {
  const gardee = garde(CLEF_CLARTE, ['clair', 'sombre']) as Clarte | null
  if (gardee) return gardee
  const clair =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
  return clair ? 'clair' : 'sombre'
}

interface Contexte {
  style: StyleApparence
  clarte: Clarte
  choisirStyle: (style: StyleApparence) => void
  choisirClarte: (clarte: Clarte) => void
}

const ApparenceContexte = createContext<Contexte | undefined>(undefined)

function ranger(clef: string, valeur: string) {
  try {
    localStorage.setItem(clef, valeur)
  } catch {
    // Sans stockage, le choix ne vaut que pour cette visite. C'est mieux que rien.
  }
}

export function ApparenceProvider({ children }: { children: ReactNode }) {
  const [style, setStyle] = useState<StyleApparence>(styleInitial)
  const [clarte, setClarte] = useState<Clarte>(clarteInitiale)

  /* Deux attributs sur la racine, et rien d'autre : toute la bascule tient dans les variables
     que redéfinit index.css. Aucun composant n'a à savoir quelle apparence est en cours —
     c'est ce qui permet d'en ajouter une troisième sans rouvrir quarante fichiers. */
  useEffect(() => {
    document.documentElement.dataset.style = style
    document.documentElement.dataset.clarte = clarte
  }, [style, clarte])

  const choisirStyle = useCallback((suivant: StyleApparence) => {
    setStyle(suivant)
    ranger(CLEF_STYLE, suivant)
  }, [])

  const choisirClarte = useCallback((suivante: Clarte) => {
    setClarte(suivante)
    ranger(CLEF_CLARTE, suivante)
  }, [])

  const valeur = useMemo<Contexte>(
    () => ({ style, clarte, choisirStyle, choisirClarte }),
    [style, clarte, choisirStyle, choisirClarte],
  )
  return <ApparenceContexte.Provider value={valeur}>{children}</ApparenceContexte.Provider>
}

export function useApparence(): Contexte {
  const contexte = useContext(ApparenceContexte)
  if (!contexte) throw new Error('useApparence hors de ApparenceProvider')
  return contexte
}
