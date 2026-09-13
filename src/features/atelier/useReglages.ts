import { useCallback, useEffect, useRef, useState } from 'react'
import { useMorceaux } from '../../hooks/useMorceaux'
import { completerReglages } from '../../lib/reglages'
import type { Morceau, Reglages } from '../../lib/types'

/**
 * Les réglages de l'atelier : tenus en mémoire, sauvegardés un peu après.
 *
 * Chaque mouvement de curseur de tempo ou d'opacité change les réglages, et l'aperçu doit
 * suivre immédiatement. Envoyer cela au serveur à chaque pixel serait absurde ; ne
 * l'envoyer que sur un bouton « Enregistrer » reviendrait à perdre son travail en fermant
 * l'onglet. On garde donc l'état ici, et on écrit une seconde après le dernier geste.
 */
export function useReglages(morceau: Morceau) {
  const { enregistrerReglages } = useMorceaux()
  const [reglages, setReglages] = useState<Reglages>(() =>
    completerReglages(morceau.reglages, morceau.type),
  )
  const [enregistre, setEnregistre] = useState(true)
  const aEcrire = useRef<Reglages | null>(null)

  // Un morceau rechargé depuis le serveur (un autre onglet, un retour en arrière) remplace
  // l'état local — sauf si on a justement une écriture en attente, qui serait sinon
  // écrasée par la version qu'elle est en train de remplacer.
  useEffect(() => {
    if (!aEcrire.current) setReglages(completerReglages(morceau.reglages, morceau.type))
  }, [morceau.reglages, morceau.type])

  useEffect(() => {
    if (!aEcrire.current) return
    const minuteur = setTimeout(async () => {
      const aSauver = aEcrire.current
      if (!aSauver) return
      try {
        await enregistrerReglages(morceau.id, aSauver)
        // Un nouveau changement pendant l'écriture laisse un autre objet en attente : on ne
        // déclare « enregistré » que si rien n'est arrivé entre-temps.
        if (aEcrire.current === aSauver) {
          aEcrire.current = null
          setEnregistre(true)
        }
      } catch {
        // On garde l'objet en attente : le prochain changement relancera l'écriture, et
        // l'indicateur reste sur « non enregistré », ce qui est la vérité.
      }
    }, 900)
    return () => clearTimeout(minuteur)
  }, [reglages, morceau.id, enregistrerReglages])

  const modifier = useCallback((mutation: (actuels: Reglages) => Reglages) => {
    setReglages((actuels) => {
      const suivants = mutation(actuels)
      aEcrire.current = suivants
      return suivants
    })
    setEnregistre(false)
  }, [])

  return { reglages, modifier, enregistre }
}
