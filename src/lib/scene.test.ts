import { describe, expect, it } from 'vitest'
import { curseurQuiAttend, type Curseur } from './scene'

/** Un curseur qui parcourt une bande de gauche à droite, un pixel par milliseconde. */
const curseurA = (tMs: number): Curseur | null =>
  tMs < 0 ? null : { x: tMs, y: 0, h: 80, bloc: { x: tMs - 10, w: 20 } }

describe('curseurQuiAttend', () => {
  it('laisse passer quand il n’y a rien à attendre', () => {
    expect(curseurQuiAttend(curseurA, 0)).toBe(curseurA)
    expect(curseurQuiAttend(curseurA, -5)).toBe(curseurA)
  })

  it('fige le curseur là où il sera, et le cache en attendant', () => {
    /* La vue doit déjà être à la mesure d'entrée pendant que l'intro joue : un curseur
       simplement absent ferait retomber la bande au début du morceau, et l'entrée se ferait
       par un défilement que personne n'a demandé. */
    const attend = curseurQuiAttend(curseurA, 4000)
    for (const t of [0, 1000, 3999]) {
      const curseur = attend(t)
      expect(curseur?.x).toBe(4000)
      expect(curseur?.discret).toBe(true)
    }
  })

  it('rend la main à l’instant exact de l’entrée', () => {
    const attend = curseurQuiAttend(curseurA, 4000)
    expect(attend(4000)?.discret).toBeUndefined()
    expect(attend(4000)?.x).toBe(4000)
    expect(attend(9000)?.x).toBe(9000)
  })

  it('ne fabrique rien là où le curseur n’existe pas', () => {
    // Une scène dont le parcours est vide : attendre ne doit pas inventer une position.
    const attend = curseurQuiAttend(() => null, 4000)
    expect(attend(0)).toBeNull()
    expect(attend(5000)).toBeNull()
  })
})
