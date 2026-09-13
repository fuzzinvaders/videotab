import { describe, expect, it } from 'vitest'
import { bornesHorizontales, detecterSystemes, profilEncre } from './systemes'

/** Une page de test : fond blanc, et on y pose ce qu'on veut. */
function page(largeur: number, hauteur: number) {
  const pixels = new Uint8ClampedArray(largeur * hauteur * 4).fill(255)
  return {
    pixels,
    trait(y: number, x0 = 0, x1 = largeur) {
      for (let x = x0; x < x1; x++) {
        const i = (y * largeur + x) * 4
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0
      }
    },
    /** Six cordes espacées de `pas` pixels, à partir de `y`. */
    portee(y: number, pas = 6, x0 = 0, x1 = largeur) {
      for (let corde = 0; corde < 6; corde++) this.trait(y + corde * pas, x0, x1)
    },
  }
}

describe('profilEncre', () => {
  it('mesure la part d’encre ligne par ligne', () => {
    const p = page(100, 10)
    p.trait(3)
    const profil = profilEncre(p.pixels, 100, 10)
    expect(profil[3]).toBeCloseTo(1, 2)
    expect(profil[4]).toBe(0)
  })

  it('ignore les bords, où dort l’ombre de reliure d’un scan', () => {
    const p = page(100, 10)
    for (let y = 0; y < 10; y++) p.trait(y, 0, 4)
    expect(profilEncre(p.pixels, 100, 10).every((v) => v === 0)).toBe(true)
  })
})

describe('detecterSystemes', () => {
  it('reconnaît deux portées séparées par du blanc', () => {
    const p = page(200, 300)
    p.portee(40)
    p.portee(180)
    const bandes = detecterSystemes(profilEncre(p.pixels, 200, 300))
    expect(bandes).toHaveLength(2)
    expect(bandes[0].y0).toBeLessThan(40 / 300)
    expect(bandes[0].y1).toBeGreaterThan(70 / 300)
    expect(bandes[1].y0).toBeGreaterThan(100 / 300)
  })

  it('écarte un filet isolé, qui n’est pas une portée', () => {
    const p = page(200, 300)
    p.trait(20)
    p.portee(150)
    expect(detecterSystemes(profilEncre(p.pixels, 200, 300))).toHaveLength(1)
  })

  it('ne laisse jamais deux systèmes se recouvrir', () => {
    const p = page(200, 200)
    // Deux portées très rapprochées : l'élargissement doit s'arrêter à mi-chemin.
    p.portee(30, 4)
    p.portee(70, 4)
    const bandes = detecterSystemes(profilEncre(p.pixels, 200, 200))
    expect(bandes).toHaveLength(2)
    expect(bandes[0].y1).toBeLessThanOrEqual(bandes[1].y0)
  })

  it('reste dans la page, même pour la première et la dernière ligne', () => {
    const p = page(200, 200)
    p.portee(1, 3)
    const [bande] = detecterSystemes(profilEncre(p.pixels, 200, 200))
    expect(bande.y0).toBeGreaterThanOrEqual(0)
    expect(bande.y1).toBeLessThanOrEqual(1)
  })

  it('ne trouve rien sur une page blanche, sans se plaindre', () => {
    const p = page(50, 50)
    expect(detecterSystemes(profilEncre(p.pixels, 50, 50))).toEqual([])
    expect(detecterSystemes([])).toEqual([])
  })
})

describe('bornesHorizontales', () => {
  it('serre le système sur l’encre plutôt que sur le papier', () => {
    const p = page(200, 100)
    p.portee(30, 5, 40, 160)
    const bande = { y0: 0.25, y1: 0.6 }
    const { x0, x1 } = bornesHorizontales(p.pixels, 200, 100, bande)
    expect(x0).toBeCloseTo(40 / 200, 2)
    expect(x1).toBeCloseTo(160 / 200, 2)
  })

  it('propose un cadrage raisonnable quand il n’y a rien à mesurer', () => {
    const p = page(200, 100)
    const { x0, x1 } = bornesHorizontales(p.pixels, 200, 100, { y0: 0.1, y1: 0.2 })
    expect(x0).toBeLessThan(x1)
  })
})
