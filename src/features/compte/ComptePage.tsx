import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { ErrorText, Field, Input } from '../../components/ui/Field'
import { useAuth } from '../../hooks/useAuth'
import { useMorceaux } from '../../hooks/useMorceaux'
import { api, messageOf } from '../../lib/api'
import type { Invite, SafeUser } from '../../lib/types'

export function ComptePage() {
  const { user, signOut } = useAuth()
  const { users, recharger } = useMorceaux()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{user?.username}</h1>
          <p className="text-sm text-slate-400">
            {user?.admin ? 'Administrateur de cette instance' : 'Membre'}
          </p>
        </div>
        <Button variant="secondary" onClick={() => void signOut()}>
          Se déconnecter
        </Button>
      </div>

      <MotDePasse />
      {user?.admin ? <Invitations /> : null}
      <Membres users={users} moi={user} onChangement={recharger} admin={Boolean(user?.admin)} />
    </div>
  )
}

function MotDePasse() {
  const [actuel, setActuel] = useState('')
  const [nouveau, setNouveau] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    setOccupe(true)
    setMessage(null)
    setErreur(null)
    try {
      await api.post('/api/password', { currentPassword: actuel, newPassword: nouveau })
      setMessage('Mot de passe changé.')
      setActuel('')
      setNouveau('')
    } catch (err) {
      setErreur(messageOf(err, 'Le changement a échoué.'))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-medium text-slate-200">Mot de passe</h2>
      <form onSubmit={envoyer} className="grid gap-3 sm:grid-cols-2">
        <Field label="Mot de passe actuel">
          <Input
            type="password"
            value={actuel}
            onChange={(e) => setActuel(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="Nouveau" hint="6 caractères au minimum.">
          <Input
            type="password"
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <div className="sm:col-span-2">
          <ErrorText>{erreur}</ErrorText>
          {message ? <p className="mb-2 text-sm text-emerald-400">{message}</p> : null}
          <Button type="submit" disabled={occupe}>
            {occupe ? 'Un instant…' : 'Changer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function Invitations() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    api
      .get<{ invites: Invite[] }>('/api/invites')
      .then((r) => setInvites(r.invites))
      .catch(() => setErreur('Impossible de lire les invitations.'))
  }, [])

  async function creer() {
    setOccupe(true)
    try {
      const r = await api.post<{ invites: Invite[] }>('/api/invites')
      setInvites(r.invites)
      setErreur(null)
    } catch (err) {
      setErreur(messageOf(err, 'La création a échoué.'))
    } finally {
      setOccupe(false)
    }
  }

  async function revoquer(code: string) {
    const r = await api.post<{ invites: Invite[] }>('/api/invites/revoke', { code })
    setInvites(r.invites)
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-medium text-slate-200">Invitations</h2>
        <Button variant="secondary" onClick={() => void creer()} disabled={occupe}>
          Nouveau code
        </Button>
      </div>
      <p className="mb-3 text-sm text-slate-400">
        Un code vaut sept jours et une seule inscription. Il se dicte à voix haute&nbsp;: ni O ni
        zéro, ni I ni un.
      </p>
      <ErrorText>{erreur}</ErrorText>
      {invites.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun code en attente.</p>
      ) : (
        <ul className="space-y-2">
          {invites.map((invite) => (
            <li
              key={invite.code}
              className="flex items-center justify-between gap-3 rounded-lg bg-slate-950 px-3 py-2"
            >
              <code className="font-mono text-lg tracking-wider text-amber-300">{invite.code}</code>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">
                  jusqu'au {new Date(invite.expiresAt).toLocaleDateString('fr-FR')}
                </span>
                <button
                  onClick={() => void revoquer(invite.code)}
                  className="text-sm text-slate-500 hover:text-red-400"
                >
                  Révoquer
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function Membres({
  users,
  moi,
  admin,
  onChangement,
}: {
  users: SafeUser[]
  moi: SafeUser | null
  admin: boolean
  onChangement: () => Promise<void>
}) {
  const [erreur, setErreur] = useState<string | null>(null)

  async function supprimer(id: string, nom: string) {
    if (!confirm(`Supprimer le compte « ${nom} » ? Ses morceaux resteront dans la bibliothèque.`)) {
      return
    }
    try {
      await api.post('/api/users/delete', { id })
      await onChangement()
      setErreur(null)
    } catch (err) {
      setErreur(messageOf(err, 'La suppression a échoué.'))
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-medium text-slate-200">Comptes</h2>
      <ErrorText>{erreur}</ErrorText>
      <ul className="space-y-1">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-1">
            <span className="text-slate-200">
              {u.username}
              {u.admin ? <span className="ml-2 text-xs text-amber-400">admin</span> : null}
              {u.id === moi?.id ? <span className="ml-2 text-xs text-slate-500">(toi)</span> : null}
            </span>
            {admin && !u.admin && u.id !== moi?.id ? (
              <button
                onClick={() => void supprimer(u.id, u.username)}
                className="text-sm text-slate-500 hover:text-red-400"
              >
                Supprimer
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  )
}
