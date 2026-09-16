import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ANGLAIS } from './textes'

/**
 * Les deux langues de l'interface.
 *
 * Le français est la langue du code, des commentaires et des textes eux-mêmes ; l'anglais est
 * une traduction. Ce n'est pas qu'une question d'ordre : c'est ce qui décide de la forme du
 * dictionnaire. La clef **est** la phrase française, et non un identifiant du genre
 * `export.bouton.lancer`.
 *
 * On y gagne trois choses. Le code reste lisible sans aller-retour — `t('Exporter la vidéo')`
 * se lit, `t('export.bouton')` demande à être cherché. Une phrase sans traduction s'affiche en
 * français au lieu de montrer sa clef à l'utilisateur. Et il n'y a pas trois cents noms à
 * inventer, ce qui est le vrai coût caché des clefs abstraites.
 *
 * On y perd une chose, et il faut la compenser : corriger une virgule dans le texte français
 * décroche silencieusement sa traduction. D'où le test de langue.test.ts, qui vérifie que
 * chaque `t('…')` du code a son entrée et qu'aucune entrée ne traîne sans emploi.
 */
export type Langue = 'fr' | 'en'

const CLEF = 'videotab.langue'

/**
 * La langue au premier chargement : celle du navigateur, sauf choix contraire déjà exprimé.
 *
 * Le stockage local plutôt que le compte : la langue est une affaire de machine et d'habitude,
 * pas d'identité. Elle doit être juste avant même qu'on se connecte — c'est-à-dire sur l'écran
 * de connexion, qui est le premier qu'on voit.
 */
function langueInitiale(): Langue {
  try {
    const gardee = localStorage.getItem(CLEF)
    if (gardee === 'fr' || gardee === 'en') return gardee
  } catch {
    // Un navigateur en navigation privée peut refuser le stockage : ce n'est pas une raison
    // pour ne pas démarrer.
  }
  const navigateur = typeof navigator !== 'undefined' ? navigator.language : 'fr'
  return navigateur.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

/**
 * La traduction d'une phrase, avec ses valeurs.
 *
 * Les valeurs sont écrites `{nom}` dans la phrase et remplacées des deux côtés : une phrase
 * traduite peut les remettre dans un autre ordre, ce qui est tout l'intérêt de ne pas
 * fabriquer les textes par concaténation.
 */
export function traduire(
  langue: Langue,
  phrase: string,
  valeurs?: Record<string, string | number>,
): string {
  const texte = langue === 'fr' ? phrase : (ANGLAIS[phrase] ?? phrase)
  if (!valeurs) return texte
  return texte.replace(/\{(\w+)\}/g, (entier, nom: string) =>
    nom in valeurs ? String(valeurs[nom]) : entier,
  )
}

interface Contexte {
  langue: Langue
  choisir: (langue: Langue) => void
  t: (phrase: string, valeurs?: Record<string, string | number>) => string
}

const LangueContexte = createContext<Contexte | undefined>(undefined)

export function LangueProvider({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue>(langueInitiale)

  // La langue du document suit celle de l'interface : c'est ce que lisent les lecteurs
  // d'écran et les correcteurs orthographiques du navigateur.
  useEffect(() => {
    document.documentElement.lang = langue
  }, [langue])

  const choisir = useCallback((suivante: Langue) => {
    setLangue(suivante)
    try {
      localStorage.setItem(CLEF, suivante)
    } catch {
      // Sans stockage, le choix ne vaut que pour cette visite. C'est mieux que rien.
    }
  }, [])

  const valeur = useMemo<Contexte>(
    () => ({
      langue,
      choisir,
      t: (phrase, valeurs) => traduire(langue, phrase, valeurs),
    }),
    [langue, choisir],
  )

  return <LangueContexte.Provider value={valeur}>{children}</LangueContexte.Provider>
}

export function useLangue(): Contexte {
  const contexte = useContext(LangueContexte)
  if (!contexte) throw new Error('useLangue hors de LangueProvider')
  return contexte
}

/** Le raccourci qu'on écrit partout : `const t = useT()`. */
export function useT() {
  return useLangue().t
}
