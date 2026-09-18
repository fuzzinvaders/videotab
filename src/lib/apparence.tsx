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
 * « ardoise » est l'habillage d'origine : sombre, bleuté, un accent ambre. « papier » vient de
 * presetbook, l'autre application de la maison : des gris chauds au lieu des gris bleus, une
 * ocre au lieu de l'ambre, et du clair au lieu du sombre. C'est la même famille de décisions,
 * et deux ambiances très différentes.
 */
export type Apparence = 'ardoise' | 'papier'

const CLEF = 'videotab.apparence'

/**
 * L'apparence au premier chargement.
 *
 * Le choix déjà exprimé d'abord, puis la préférence du système : quelqu'un qui travaille en
 * clair partout n'a pas à demander deux fois. Sans rien de tout cela, l'ardoise — c'est
 * l'habillage d'origine, et une application qui sert à fabriquer des incrustations pour des
 * vidéos se regarde plus souvent la nuit qu'à midi.
 */
function apparenceInitiale(): Apparence {
  try {
    const gardee = localStorage.getItem(CLEF)
    if (gardee === 'ardoise' || gardee === 'papier') return gardee
  } catch {
    // Un navigateur en navigation privée peut refuser le stockage : ce n'est pas une raison
    // pour ne pas démarrer.
  }
  const clair =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches
  return clair ? 'papier' : 'ardoise'
}

interface Contexte {
  apparence: Apparence
  choisir: (apparence: Apparence) => void
}

const ApparenceContexte = createContext<Contexte | undefined>(undefined)

export function ApparenceProvider({ children }: { children: ReactNode }) {
  const [apparence, setApparence] = useState<Apparence>(apparenceInitiale)

  /* L'attribut sur la racine, et rien d'autre : toute la bascule tient dans les variables de
     couleur que redéfinit index.css. Aucun composant n'a à savoir quelle apparence est en
     cours — c'est ce qui permet d'en ajouter une troisième sans rouvrir quarante fichiers. */
  useEffect(() => {
    document.documentElement.dataset.theme = apparence
  }, [apparence])

  const choisir = useCallback((suivante: Apparence) => {
    setApparence(suivante)
    try {
      localStorage.setItem(CLEF, suivante)
    } catch {
      // Sans stockage, le choix ne vaut que pour cette visite. C'est mieux que rien.
    }
  }, [])

  const valeur = useMemo<Contexte>(() => ({ apparence, choisir }), [apparence, choisir])
  return <ApparenceContexte.Provider value={valeur}>{children}</ApparenceContexte.Provider>
}

export function useApparence(): Contexte {
  const contexte = useContext(ApparenceContexte)
  if (!contexte) throw new Error('useApparence hors de ApparenceProvider')
  return contexte
}
