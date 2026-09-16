import { describe, expect, it } from 'vitest'
import { traduire } from './langue'
import { ANGLAIS } from './textes'

/* Le dictionnaire est indexé par la phrase française elle-même. C'est ce qui rend le code
   lisible, et c'est ce qui le rend fragile : corriger une virgule dans le texte français
   décroche sa traduction sans que rien ne proteste. Ces deux tests-là sont la contrepartie du
   choix.

   Les sources sont lues par le glob de Vite plutôt que par `node:fs` : c'est le même outil qui
   compile l'application, il connaît donc déjà ces fichiers, et le test reste dans le monde du
   navigateur — aucun type de Node à faire entrer dans la configuration de l'interface. */
const MODULES = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', eager: true }) as Record<
  string,
  { default: string }
>
const SERVEUR_MODULES = import.meta.glob('../../server/**/*.js', {
  query: '?raw',
  eager: true,
}) as Record<string, { default: string }>

/** Le code sans ses commentaires : ceux-ci citent des appels à titre d'exemple, et une
 *  citation n'est pas une demande de traduction. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const CODE = Object.entries(MODULES)
  .filter(([chemin]) => !chemin.includes('textes.ts') && !chemin.includes('.test.'))
  .map(([, m]) => sansCommentaires(m.default))
  .join('\n')

const SERVEUR = Object.values(SERVEUR_MODULES)
  .map((m) => m.default)
  .join('\n')

describe('le dictionnaire anglais', () => {
  it('traduit chaque phrase que le code demande explicitement', () => {
    /* Les appels de la forme t('…'). Ceux qui reçoivent une variable — un libellé rangé dans
       une liste de constantes, un message d'erreur qui vient d'ailleurs — échappent à ce
       relevé : c'est le second test qui les couvre, par l'autre bout. */
    const demandees = new Set<string>()
    for (const m of CODE.matchAll(/\bt\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      demandees.add(m[1].replace(/\\'/g, "'"))
    }
    expect(demandees.size).toBeGreaterThan(20)
    const sansTraduction = [...demandees].filter((phrase) => phrase !== '' && !(phrase in ANGLAIS))
    expect(sansTraduction).toEqual([])
  })

  it('ne garde aucune entrée qui ne serve plus', () => {
    // Une phrase reformulée laisse derrière elle son ancienne traduction, que plus rien
    // n'atteint. Elle ne casse rien ; elle fait seulement croire que le travail est fait.
    const orphelines = Object.keys(ANGLAIS).filter(
      (phrase) => !CODE.includes(phrase) && !SERVEUR.includes(phrase),
    )
    expect(orphelines).toEqual([])
  })

  it('remet les valeurs à leur place, dans les deux langues', () => {
    expect(traduire('fr', '{n} mesures', { n: 4 })).toBe('4 mesures')
    expect(traduire('en', '{n} mesures', { n: 4 })).toBe('4 bars')
    // Une valeur peut servir deux fois dans la phrase : la durée annoncée le fait.
    expect(traduire('en', '{d} de {d}', { d: 'x' })).toBe('x de x')
  })

  it('rend la phrase française quand la traduction manque', () => {
    // Un défaut visible et sans gravité, là où une clef technique s'afficherait crûment.
    expect(traduire('en', 'Une phrase jamais traduite')).toBe('Une phrase jamais traduite')
  })
})
