import type { ButtonHTMLAttributes } from 'react'
import { useT } from '../../lib/langue'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-amber-600 text-white hover:bg-amber-500',
  secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700',
  ghost: 'bg-transparent text-slate-300 hover:bg-slate-800',
  danger: 'bg-red-600/90 text-white hover:bg-red-500',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'primary', className = '', children, ...props }: Props) {
  const t = useT()
  // Le libellé d'un bouton est presque toujours une phrase toute faite : elle se traduit ici,
  // comme les libellés de champs. Un bouton qui porte une icône ou du JSX passe tel quel.
  return (
    <button
      className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {typeof children === 'string' ? t(children) : children}
    </button>
  )
}
