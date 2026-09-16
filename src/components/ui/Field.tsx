import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useT } from '../../lib/langue'

const controlClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-600 focus:border-amber-500'

/**
 * Le texte d'un composant, traduit ici plutôt qu'à l'appel.
 *
 * Presque tout ce qu'on lit dans cette application est un `label` ou un `hint` passé à l'un de
 * ces composants-ci. Les traduire à la source évite trois cents `t('…')` dans les panneaux —
 * et surtout évite d'en oublier un : ce qui passe par ici est traduit par construction.
 *
 * Seules les chaînes le sont. Un `hint` peut être un fragment de JSX, avec du gras ou un lien
 * dedans ; celui-là n'a rien à faire dans un dictionnaire et traverse tel quel, à charge pour
 * l'appelant de traduire ses morceaux.
 */
function useTexte() {
  const t = useT()
  return (valeur: ReactNode): ReactNode => (typeof valeur === 'string' ? t(valeur) : valeur)
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
}) {
  const texte = useTexte()
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{texte(label)}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500">{texte(hint)}</span> : null}
    </label>
  )
}

export function Input({
  className = '',
  placeholder,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const t = useT()
  return (
    <input
      className={`${controlClass} ${className}`}
      placeholder={placeholder ? t(placeholder) : placeholder}
      {...props}
    />
  )
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} ${className}`} {...props} />
}

/**
 * Une option de liste, traduite comme les libellés.
 *
 * Un `<option>` natif ne peut pas l'être : c'est le navigateur qui le dessine, et son texte
 * est un enfant brut. Celui-ci prend la même route que les libellés, et on écrit donc
 * `<Option value="mp4">mp4 — pour le montage</Option>` sans y penser.
 */
export function Option({ children, ...props }: { children: string } & { value: string }) {
  const t = useT()
  return <option {...props}>{t(children)}</option>
}

export function ErrorText({ children }: { children: ReactNode }) {
  const texte = useTexte()
  if (!children) return null
  return (
    <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{texte(children)}</p>
  )
}
