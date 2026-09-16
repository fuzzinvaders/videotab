import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, envoyerFichier } from '../lib/api'
import type { Bibliotheque, Morceau, Reglages, SafeUser } from '../lib/types'

interface MorceauxContextValue {
  morceaux: Morceau[]
  users: SafeUser[]
  /** Place prise par les vidéos sur le serveur, en octets. */
  espaceVideos: number
  chargement: boolean
  erreur: string | null
  recharger: () => Promise<void>
  importer: (fichier: File, onProgression?: (part: number) => void) => Promise<Morceau>
  renommer: (id: string, champs: { titre: string; artiste: string }) => Promise<void>
  enregistrerReglages: (id: string, reglages: Reglages) => Promise<void>
  supprimer: (id: string) => Promise<void>
  deposerVideo: (
    id: string,
    blob: Blob,
    infos: { ext: string; dureeMs: number; cache?: Blob | null },
    onProgression?: (part: number) => void,
  ) => Promise<void>
  supprimerVideo: (id: string) => Promise<void>
  deposerAudio: (id: string, fichier: File) => Promise<void>
  supprimerAudio: (id: string) => Promise<void>
}

const MorceauxContext = createContext<MorceauxContextValue | undefined>(undefined)

export function MorceauxProvider({ children }: { children: ReactNode }) {
  const [morceaux, setMorceaux] = useState<Morceau[]>([])
  const [users, setUsers] = useState<SafeUser[]>([])
  const [espaceVideos, setEspaceVideos] = useState(0)
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState<string | null>(null)

  /* Le serveur renvoie la bibliothèque entière à chaque écriture : on la pose telle quelle
     plutôt que de recoudre la liste localement. Deux onglets ouverts sur la même instance
     restent ainsi d'accord sans qu'aucun n'ait à surveiller l'autre. */
  const appliquer = useCallback((reponse: Bibliotheque) => {
    setMorceaux(
      [...reponse.morceaux].sort((a, b) => Date.parse(b.modifieLe) - Date.parse(a.modifieLe)),
    )
    if (reponse.users) setUsers(reponse.users)
    if (typeof reponse.espaceVideos === 'number') setEspaceVideos(reponse.espaceVideos)
  }, [])

  const recharger = useCallback(async () => {
    try {
      appliquer(await api.get<Bibliotheque>('/api/morceaux'))
      setErreur(null)
    } catch {
      setErreur('Impossible de joindre le serveur.')
    } finally {
      setChargement(false)
    }
  }, [appliquer])

  useEffect(() => {
    void recharger()
  }, [recharger])

  async function importer(fichier: File, onProgression?: (part: number) => void) {
    const url = `/api/morceaux?nom=${encodeURIComponent(fichier.name)}`
    const reponse = await envoyerFichier<Bibliotheque & { morceau: Morceau }>(
      'POST',
      url,
      fichier,
      onProgression,
    )
    appliquer(reponse)
    return reponse.morceau
  }

  async function renommer(id: string, champs: { titre: string; artiste: string }) {
    appliquer(await api.patch<Bibliotheque>(`/api/morceaux/${id}`, champs))
  }

  async function enregistrerReglages(id: string, reglages: Reglages) {
    appliquer(await api.put<Bibliotheque>(`/api/morceaux/${id}/reglages`, { reglages }))
  }

  async function supprimer(id: string) {
    appliquer(await api.delete<Bibliotheque>(`/api/morceaux/${id}`))
  }

  async function deposerVideo(
    id: string,
    blob: Blob,
    infos: { ext: string; dureeMs: number; cache?: Blob | null },
    onProgression?: (part: number) => void,
  ) {
    const url = `/api/morceaux/${id}/video?ext=${encodeURIComponent(infos.ext)}&duree=${Math.round(infos.dureeMs)}`
    /* Deux envois quand la transparence a été découpée, et l'image d'abord : le cache
       s'accroche à elle, et le serveur refuse un cache qui n'accompagnerait rien. La
       progression est partagée entre les deux selon leur poids, sinon la barre reviendrait en
       arrière à mi-chemin. */
    const poidsTotal = blob.size + (infos.cache?.size ?? 0)
    const part = (octets: number) => octets / Math.max(1, poidsTotal)
    const reponse = await envoyerFichier<Bibliotheque>('PUT', url, blob, (p) =>
      onProgression?.(p * part(blob.size)),
    )
    if (!infos.cache) {
      appliquer(reponse)
      return
    }
    const avance = part(blob.size)
    appliquer(
      await envoyerFichier<Bibliotheque>('PUT', `${url}&cache=1`, infos.cache, (p) =>
        onProgression?.(avance + p * part(infos.cache!.size)),
      ),
    )
  }

  async function supprimerVideo(id: string) {
    appliquer(await api.delete<Bibliotheque>(`/api/morceaux/${id}/video`))
  }

  async function deposerAudio(id: string, fichier: File) {
    const url = `/api/morceaux/${id}/audio?nom=${encodeURIComponent(fichier.name)}`
    appliquer(await envoyerFichier<Bibliotheque>('PUT', url, fichier))
  }

  async function supprimerAudio(id: string) {
    appliquer(await api.delete<Bibliotheque>(`/api/morceaux/${id}/audio`))
  }

  return (
    <MorceauxContext.Provider
      value={{
        morceaux,
        users,
        espaceVideos,
        chargement,
        erreur,
        recharger,
        importer,
        renommer,
        enregistrerReglages,
        supprimer,
        deposerVideo,
        supprimerVideo,
        deposerAudio,
        supprimerAudio,
      }}
    >
      {children}
    </MorceauxContext.Provider>
  )
}

export function useMorceaux() {
  const ctx = useContext(MorceauxContext)
  if (!ctx) throw new Error('useMorceaux must be used within MorceauxProvider')
  return ctx
}
