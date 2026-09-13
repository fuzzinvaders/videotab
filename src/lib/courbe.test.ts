import { describe, expect, it } from 'vitest'
import { courbeMonotone } from './courbe'

/** Les vitesses image par image, pour juger de la régularité du défilement. */
function vitesses(courbe: (t: number) => number, t0: number, t1: number, pas = 1000 / 30) {
  const v: number[] = []
  for (let t = t0; t + pas <= t1; t += pas) v.push(courbe(t + pas) - courbe(t))
  return v
}

describe('courbeMonotone', () => {
  it('passe exactement par chaque point imposé', () => {
    const points = [
      { t: 0, v: 0 },
      { t: 100, v: 30 },
      { t: 200, v: 200 },
      { t: 300, v: 210 },
    ]
    const courbe = courbeMonotone(points)
    for (const point of points) expect(courbe(point.t)).toBeCloseTo(point.v, 6)
  })

  /* Le défaut qu'on cherchait à corriger : des segments de droite donnent une vitesse
     constante par morceau, qui saute à chaque point. Sur une partition, l'espacement n'est
     pas proportionnel à la durée, et ces sauts se lisent comme des à-coups. */
  it('lisse la vitesse là où des segments de droite la feraient sauter', () => {
    const points = [
      { t: 0, v: 0 },
      { t: 500, v: 40 },
      { t: 1000, v: 400 },
      { t: 1500, v: 440 },
    ]
    const courbe = courbeMonotone(points)
    const v = vitesses(courbe, 0, 1500)
    const ecarts = v.slice(1).map((x, i) => Math.abs(x - v[i]))
    const pire = Math.max(...ecarts)
    const moyenne = v.reduce((a, b) => a + b, 0) / v.length
    // Aucun changement de vitesse ne dépasse la vitesse moyenne d'une image : la courbe
    // accélère et ralentit, mais elle ne saute pas.
    expect(pire).toBeLessThan(moyenne)
  })

  it('ne recule jamais, même sur des points très inégaux', () => {
    const courbe = courbeMonotone([
      { t: 0, v: 0 },
      { t: 10, v: 500 },
      { t: 20, v: 505 },
      { t: 30, v: 1000 },
    ])
    let precedent = Number.NEGATIVE_INFINITY
    for (let t = 0; t <= 30; t += 0.1) {
      const valeur = courbe(t)
      expect(valeur).toBeGreaterThanOrEqual(precedent - 1e-9)
      precedent = valeur
    }
  })

  it('reste sur le premier et le dernier point hors de l’intervalle', () => {
    const courbe = courbeMonotone([
      { t: 100, v: 5 },
      { t: 200, v: 9 },
    ])
    expect(courbe(-50)).toBe(5)
    expect(courbe(1000)).toBe(9)
  })

  it('désigne le point en vigueur, pour ce qui ne s’interpole pas', () => {
    const courbe = courbeMonotone([
      { t: 0, v: 0 },
      { t: 100, v: 10 },
      { t: 200, v: 20 },
    ])
    expect(courbe.indexA(-1)).toBe(0)
    expect(courbe.indexA(50)).toBe(0)
    expect(courbe.indexA(100)).toBe(1)
    expect(courbe.indexA(999)).toBe(2)
  })

  it('supporte le vide et le point unique sans se plaindre', () => {
    expect(courbeMonotone([])(42)).toBe(0)
    expect(courbeMonotone([{ t: 0, v: 7 }])(42)).toBe(7)
    expect(courbeMonotone([{ t: 0, v: Number.NaN }])(0)).toBe(0)
  })

  it('traverse un palier sans le dépasser', () => {
    // Deux temps à la même position — un accord tenu — puis la reprise du défilement.
    const courbe = courbeMonotone([
      { t: 0, v: 0 },
      { t: 100, v: 50 },
      { t: 200, v: 50 },
      { t: 300, v: 100 },
    ])
    for (let t = 100; t <= 200; t += 5) {
      expect(courbe(t)).toBeGreaterThanOrEqual(49.999)
      expect(courbe(t)).toBeLessThanOrEqual(50.001)
    }
  })
})
