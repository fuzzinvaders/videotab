import { describe, expect, it } from 'vitest'

/* Les règles de démarrage sont écrites deux fois : dans apparence.tsx, et dans un petit script
   en tête de index.html qui pose l'apparence avant le premier pixel. La duplication est voulue
   — attendre React pour peindre le fond, c'est un clignotement à chaque chargement — mais deux
   copies d'une même règle finissent toujours par diverger.

   Ce test ne prouve pas qu'elles fassent la même chose, ce qu'on ne peut pas montrer ici ; il
   vérifie qu'elles parlent des mêmes clefs et des mêmes valeurs. C'est la divergence qu'on a à
   craindre : une clef renommée d'un côté, un style ajouté de l'autre.

   La feuille de style est la troisième copie — elle seule sait ce que `[data-style]` veut dire
   — et elle reste hors de portée : le greffon de Tailwind intercepte les imports CSS, et `?raw`
   n'en rend qu'une chaîne vide. Elle se vérifie donc à l'œil, en basculant les deux réglages. */
function brut(motif: string): string {
  const modules = import.meta.glob('../../{index.html,src/lib/apparence.tsx}', {
    query: '?raw',
    eager: true,
  }) as Record<string, { default: string }>
  const trouve = Object.entries(modules).find(([chemin]) => chemin.endsWith(motif))
  if (!trouve) throw new Error(`introuvable : ${motif}`)
  return trouve[1].default
}

const HTML = brut('index.html')
const SOURCE = brut('apparence.tsx')

describe('l’apparence posée avant React', () => {
  it('partage ses clefs de stockage avec le module', () => {
    for (const nom of ['CLEF_STYLE', 'CLEF_CLARTE']) {
      const clef = SOURCE.match(new RegExp(`const ${nom} = '([^']+)'`))?.[1]
      expect(clef).toBeTruthy()
      expect(HTML).toContain(`localStorage.getItem('${clef}')`)
    }
  })

  it('connaît les mêmes valeurs, et la même préférence de système', () => {
    for (const valeur of ['ardoise', 'atelier', 'clair', 'sombre']) {
      expect(HTML).toContain(`'${valeur}'`)
      expect(SOURCE).toContain(`'${valeur}'`)
    }
    expect(HTML).toContain('prefers-color-scheme: light')
    expect(SOURCE).toContain('prefers-color-scheme: light')
  })

  it('pose les deux attributs, et pas un seul', () => {
    // Un seul des deux posé avant React, et c'est l'autre moitié de l'apparence qui clignote.
    for (const attribut of ['style', 'clarte']) {
      expect(HTML).toContain(`dataset.${attribut}`)
      expect(SOURCE).toContain(`dataset.${attribut}`)
    }
  })
})
