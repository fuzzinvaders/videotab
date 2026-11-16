import { describe, expect, it } from 'vitest'
import { deformerLeTemps, facteursDeTempo, pointsValides } from './calage'

describe('pointsValides', () => {
  it('remet les points dans l’ordre de la partition', () => {
    const remis = pointsValides([
      { partitionMs: 4000, audioMs: 4200 },
      { partitionMs: 0, audioMs: 100 },
      { partitionMs: 2000, audioMs: 2150 },
    ])
    expect(remis.map((p) => p.partitionMs)).toEqual([0, 2000, 4000])
  })

  it('écarte un point qui ferait reculer le temps', () => {
    /* La frappe en retard d'une mesure : elle tombe après sa voisine dans l'audio alors
       qu'elle la précède dans la partition. La garder ferait remonter le curseur. */
    const remis = pointsValides([
      { partitionMs: 0, audioMs: 0 },
      { partitionMs: 2000, audioMs: 5000 },
      { partitionMs: 4000, audioMs: 4000 },
      { partitionMs: 6000, audioMs: 7000 },
    ])
    expect(remis.map((p) => p.audioMs)).toEqual([0, 5000, 7000])
  })

  it('écarte deux points posés au même endroit', () => {
    const remis = pointsValides([
      { partitionMs: 1000, audioMs: 1000 },
      { partitionMs: 1000, audioMs: 1400 },
    ])
    expect(remis).toHaveLength(1)
  })

  it('ignore ce qui n’est pas un nombre', () => {
    const remis = pointsValides([
      { partitionMs: 0, audioMs: 0 },
      { partitionMs: Number.NaN, audioMs: 500 },
    ])
    expect(remis).toHaveLength(1)
  })
})

describe('deformerLeTemps', () => {
  it('ne touche à rien sans point de calage', () => {
    const f = deformerLeTemps([])
    expect(f(0)).toBe(0)
    expect(f(12_345)).toBe(12_345)
  })

  it('décale tout d’un bloc avec un seul point', () => {
    // Un point dit où commencer, pas à quelle vitesse aller : il n'y a pas de pente à tirer
    // d'un point unique, et en inventer une serait pire que de n'en tirer aucune.
    const f = deformerLeTemps([{ partitionMs: 1000, audioMs: 1800 }])
    expect(f(1000)).toBe(1800)
    expect(f(0)).toBe(800)
    expect(f(3000)).toBe(3800)
  })

  it('tombe juste sur les points posés', () => {
    const points = [
      { partitionMs: 0, audioMs: 500 },
      { partitionMs: 10_000, audioMs: 11_000 },
      { partitionMs: 20_000, audioMs: 20_400 },
    ]
    const f = deformerLeTemps(points)
    for (const p of points) expect(f(p.partitionMs)).toBeCloseTo(p.audioMs, 6)
  })

  it('étire chaque segment selon sa propre pente', () => {
    /* Une reprise qui traîne au début puis se reprend : le premier segment dure plus
       longtemps que la partition ne le prévoit, le second moins. C'est exactement ce qu'un
       tempo moyen ne sait pas représenter. */
    const f = deformerLeTemps([
      { partitionMs: 0, audioMs: 0 },
      { partitionMs: 10_000, audioMs: 12_000 },
      { partitionMs: 20_000, audioMs: 20_000 },
    ])
    expect(f(5000)).toBeCloseTo(6000, 6)
    expect(f(15_000)).toBeCloseTo(16_000, 6)
  })

  it('prolonge la pente voisine au-delà des points, au lieu de se figer', () => {
    // Un morceau ne s'arrête pas de couler avant le premier repère ni après le dernier.
    const f = deformerLeTemps([
      { partitionMs: 10_000, audioMs: 10_000 },
      { partitionMs: 20_000, audioMs: 22_000 },
    ])
    // Pente de 1,2 : remonter dix secondes de partition en retire douze d'audio.
    expect(f(0)).toBeCloseTo(-2000, 6)
    expect(f(30_000)).toBeCloseTo(34_000, 6)
  })

  it('monte toujours, même semée de points fautifs', () => {
    /* La propriété qui compte vraiment : quelles que soient les frappes ratées, le curseur
       ne doit jamais revenir en arrière. Tout le reste n'est qu'un défaut d'alignement. */
    const f = deformerLeTemps([
      { partitionMs: 0, audioMs: 0 },
      { partitionMs: 3000, audioMs: 9000 },
      { partitionMs: 6000, audioMs: 1000 },
      { partitionMs: 9000, audioMs: 12_000 },
      { partitionMs: 12_000, audioMs: 11_000 },
    ])
    let precedent = -Infinity
    for (let ms = -2000; ms <= 16_000; ms += 250) {
      const valeur = f(ms)
      expect(valeur).toBeGreaterThan(precedent)
      precedent = valeur
    }
  })
})

describe('facteursDeTempo', () => {
  it('dit de combien la reprise s’écarte de la partition', () => {
    // Dix secondes de partition étalées sur douze : la reprise est plus lente d'un sixième.
    const facteurs = facteursDeTempo([
      { partitionMs: 0, audioMs: 0 },
      { partitionMs: 10_000, audioMs: 12_000 },
      { partitionMs: 20_000, audioMs: 21_000 },
    ])
    expect(facteurs[0]).toBeCloseTo(10 / 12, 6)
    expect(facteurs[1]).toBeCloseTo(10 / 9, 6)
  })

  it('n’en donne aucun tant qu’il n’y a pas deux points', () => {
    expect(facteursDeTempo([{ partitionMs: 0, audioMs: 0 }])).toEqual([])
  })
})
