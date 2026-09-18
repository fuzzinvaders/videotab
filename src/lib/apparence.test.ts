import { describe, expect, it } from 'vitest'

/* La règle de démarrage est écrite deux fois : dans apparence.tsx, et dans un petit script en
   tête de index.html qui pose l'apparence avant le premier pixel. La duplication est voulue —
   attendre React pour peindre le fond, c'est un clignotement à chaque chargement — mais deux
   copies d'une même règle finissent toujours par diverger. Ce test tient les deux ensemble.

   Il ne vérifie pas que les deux fassent la même chose, ce qu'on ne peut pas prouver ici ; il
   vérifie qu'elles parlent des mêmes valeurs. C'est la divergence qu'on a à craindre : une
   clef de stockage renommée d'un côté, une apparence ajoutée de l'autre. */
const HTML = Object.values(
  import.meta.glob('../../index.html', { query: '?raw', eager: true }) as Record<
    string,
    { default: string }
  >,
)[0].default

const SOURCE = Object.values(
  import.meta.glob('./apparence.tsx', { query: '?raw', eager: true }) as Record<
    string,
    { default: string }
  >,
)[0].default

describe('l’apparence posée avant React', () => {
  it('partage la clef de stockage avec le module', () => {
    const clef = SOURCE.match(/const CLEF = '([^']+)'/)?.[1]
    expect(clef).toBe('videotab.apparence')
    expect(HTML).toContain(`localStorage.getItem('${clef}')`)
  })

  it('connaît les mêmes apparences, et la même préférence de système', () => {
    for (const apparence of ['ardoise', 'papier']) {
      expect(HTML).toContain(apparence)
      expect(SOURCE).toContain(`'${apparence}'`)
    }
    expect(HTML).toContain('prefers-color-scheme: light')
    expect(SOURCE).toContain('prefers-color-scheme: light')
  })

  it('pose bien l’attribut que la feuille de style attend', () => {
    // index.css n'agit que sur [data-theme='papier'] : un attribut renommé ne casserait rien
    // de visible au démarrage, et tout une fois la page affichée.
    expect(HTML).toContain('document.documentElement.dataset.theme')
    expect(SOURCE).toContain('document.documentElement.dataset.theme')
  })
})
