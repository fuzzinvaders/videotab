import { NavLink } from 'react-router-dom'
import { useLangue } from '../lib/langue'

/* Deux onglets, et c'est tout ce qu'il y a. L'atelier n'y figure pas : on n'y va jamais
   « en général », on y va pour un morceau précis, et on y entre donc par la bibliothèque.
   Une barre de navigation qui proposerait un onglet menant à une page vide neuf fois sur
   dix ferait perdre plus de temps qu'elle n'en fait gagner. */
const ONGLETS = [
  { to: '/bibliotheque', label: 'Bibliothèque', icon: '🎼' },
  { to: '/compte', label: 'Compte', icon: '👤' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none ${
    isActive ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
  }`

/* Deux langues, donc un seul bouton qui bascule de l'une à l'autre : une liste déroulante
   pour deux entrées demanderait deux clics là où un seul suffit. Il montre la langue vers
   laquelle il mène, pas celle où l'on est — c'est ce qu'on cherche quand on le cherche. */
function BoutonLangue() {
  const { langue, choisir } = useLangue()
  const autre = langue === 'fr' ? 'en' : 'fr'
  return (
    <button
      type="button"
      onClick={() => choisir(autre)}
      className="rounded-lg px-2 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
      aria-label={langue === 'fr' ? 'Switch to English' : 'Passer en français'}
      title={langue === 'fr' ? 'Switch to English' : 'Passer en français'}
    >
      {autre.toUpperCase()}
    </button>
  )
}

export function NavBar() {
  const { t } = useLangue()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:sticky sm:top-0 sm:bottom-auto sm:border-t-0 sm:border-b sm:pb-0">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
        <span className="hidden pr-2 font-semibold text-slate-200 sm:block">🎬 Videotab</span>
        {ONGLETS.map((onglet) => (
          <NavLink key={onglet.to} to={onglet.to} className={linkClass}>
            <span className="text-base leading-none">{onglet.icon}</span>
            <span>{t(onglet.label)}</span>
          </NavLink>
        ))}
        <BoutonLangue />
      </div>
    </nav>
  )
}
