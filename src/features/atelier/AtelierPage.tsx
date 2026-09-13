import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { ErrorText, Input } from '../../components/ui/Field'
import { useMorceaux } from '../../hooks/useMorceaux'
import { messageOf } from '../../lib/api'
import type { Morceau } from '../../lib/types'

/* alphaTab et pdf.js pèsent à eux deux la moitié de l'application, et chacun ne sert qu'à
   un type de morceau. Les charger à la demande laisse la bibliothèque s'ouvrir tout de
   suite, et n'apporte aucune attente supplémentaire ensuite : le service worker les a mis
   en cache dès la première visite. */
const AtelierGp = lazy(() => import('./AtelierGp').then((m) => ({ default: m.AtelierGp })))
const AtelierPdf = lazy(() => import('./AtelierPdf').then((m) => ({ default: m.AtelierPdf })))

export function AtelierPage() {
  const { id } = useParams<{ id: string }>()
  const { morceaux, chargement } = useMorceaux()
  const [octets, setOctets] = useState<ArrayBuffer | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const morceau = morceaux.find((m) => m.id === id) ?? null

  /* Le fichier est chargé une seule fois, et gardé tel quel. alphaTab comme pdf.js veulent
     des octets, pas une adresse : les leur donner en mémoire évite qu'un changement de
     réglage déclenche un aller-retour réseau pour relire le même fichier. */
  useEffect(() => {
    if (!id) return
    let vivant = true
    setOctets(null)
    setErreur(null)
    fetch(`/api/morceaux/${id}/source`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Fichier introuvable sur le serveur.')
        return r.arrayBuffer()
      })
      .then((data) => {
        if (vivant) setOctets(data)
      })
      .catch((err) => {
        if (vivant) setErreur(messageOf(err, 'Impossible de charger la tablature.'))
      })
    return () => {
      vivant = false
    }
  }, [id])

  if (chargement) return <p className="text-slate-500">Chargement…</p>
  if (!morceau) {
    return (
      <div className="space-y-3">
        <ErrorText>Ce morceau n'existe plus.</ErrorText>
        <Link to="/bibliotheque" className="text-amber-400 hover:text-amber-300">
          ← Retour à la bibliothèque
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <EnTete morceau={morceau} />
      {erreur ? <ErrorText>{erreur}</ErrorText> : null}
      {!octets ? (
        <p className="text-slate-500">Lecture du fichier…</p>
      ) : (
        <Suspense fallback={<p className="text-slate-500">Chargement de l'atelier…</p>}>
          {morceau.type === 'gp' ? (
            <AtelierGp morceau={morceau} octets={octets} />
          ) : (
            <AtelierPdf morceau={morceau} octets={octets} />
          )}
        </Suspense>
      )}
    </div>
  )
}

function EnTete({ morceau }: { morceau: Morceau }) {
  const { renommer, supprimer } = useMorceaux()
  const naviguer = useNavigate()
  const [titre, setTitre] = useState(morceau.titre)
  const [artiste, setArtiste] = useState(morceau.artiste)

  useEffect(() => {
    setTitre(morceau.titre)
    setArtiste(morceau.artiste)
  }, [morceau.titre, morceau.artiste])

  // Le titre et l'artiste sont écrits dans le bandeau de la vidéo : ils se corrigent donc
  // ici, à côté de l'aperçu où on les voit, et pas dans un écran de propriétés.
  function valider() {
    if (titre !== morceau.titre || artiste !== morceau.artiste) {
      void renommer(morceau.id, { titre: titre.trim() || morceau.titre, artiste: artiste.trim() })
    }
  }

  async function effacer() {
    if (!confirm(`Supprimer « ${morceau.titre} », sa tablature et sa vidéo ?`)) return
    await supprimer(morceau.id)
    naviguer('/bibliotheque')
  }

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <Link
          to="/bibliotheque"
          className="rounded-lg px-2 py-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          aria-label="Retour à la bibliothèque"
        >
          ←
        </Link>
        <Input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          onBlur={valider}
          className="max-w-xs flex-1 text-lg font-semibold"
          aria-label="Titre"
        />
        <Input
          value={artiste}
          onChange={(e) => setArtiste(e.target.value)}
          onBlur={valider}
          placeholder="Artiste"
          className="max-w-48"
          aria-label="Artiste"
        />
      </div>
      <div className="flex items-center gap-2">
        <a
          href={`/api/morceaux/${morceau.id}/source?telecharger=1`}
          className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          Fichier source
        </a>
        <Button variant="ghost" onClick={() => void effacer()} className="text-red-400">
          Supprimer
        </Button>
      </div>
    </div>
  )
}
