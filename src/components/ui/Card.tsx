import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      /* « carte » ne sert à rien en soi : c'est une prise pour la feuille de style, qui
         pose le filet de couleur au flanc dans le style « atelier ». Une classe utilitaire
         ne pourrait pas le faire, puisqu'il dépend de l'apparence en cours. */
      className={`carte rounded-xl border border-slate-800 bg-slate-900 p-4 ${className}`}
      {...props}
    />
  )
}
