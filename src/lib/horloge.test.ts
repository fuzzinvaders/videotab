import { describe, expect, it } from 'vitest'
import { horlogeLissee } from './horloge'

/**
 * Le cas réel, mesuré dans Chrome : l'horloge du son avance par blocs de 512 échantillons à
 * 48 kHz, soit 10,667 ms, tandis que l'écran demande une image toutes les 16,7 ms. Une image
 * sur deux voit donc la référence n'avoir pas bougé assez, la suivante la voit rattraper.
 */
function referenceEnEscalier(bloc = 1000 / (48000 / 512)) {
  return (mur: number) => Math.floor(mur / bloc) * bloc
}

/** Les écarts entre valeurs successives d'une suite. */
function ecarts(valeurs: number[]) {
  return valeurs.slice(1).map((v, i) => v - valeurs[i])
}

describe('horlogeLissee', () => {
  it('rend un temps régulier là où la référence avance par marches', () => {
    const escalier = referenceEnEscalier()
    let mur = 0
    const h = horlogeLissee({ mur: () => mur, reference: () => escalier(mur) })

    const brut: number[] = []
    const lisse: number[] = []
    for (let i = 0; i < 300; i++) {
      mur = i * (1000 / 60)
      lisse.push(h.maintenantMs())
      brut.push(escalier(mur))
    }

    // La référence brute alterne du simple au double d'une image à l'autre : c'est la saccade.
    const bruts = ecarts(brut.slice(60))
    expect(Math.max(...bruts) / Math.min(...bruts)).toBeGreaterThan(1.9)

    // Lissée, la même horloge avance à pas presque égaux — moins d'un pour cent d'écart.
    const doux = ecarts(lisse.slice(60))
    expect(Math.max(...doux) / Math.min(...doux)).toBeLessThan(1.01)
    // Et jamais en arrière : la partition ne peut pas reculer.
    expect(Math.min(...doux)).toBeGreaterThan(0)
  })

  it('reste collée à la référence : elle lisse, elle ne dérive pas', () => {
    const escalier = referenceEnEscalier()
    let mur = 0
    const h = horlogeLissee({ mur: () => mur, reference: () => escalier(mur) })
    let dernier = 0
    for (let i = 0; i < 6000; i++) {
      mur = i * (1000 / 60)
      dernier = h.maintenantMs()
    }
    // Cent secondes plus tard, l'image est toujours à moins d'une image du son.
    expect(Math.abs(dernier - escalier(mur))).toBeLessThan(16)
  })

  it('suit une horloge de son qui dérive lentement, sans à-coup', () => {
    // Cent millionièmes de retard : l'ordre de grandeur d'une carte son face au processeur.
    let mur = 0
    const h = horlogeLissee({ mur: () => mur, reference: () => mur * 0.9999 })
    const lisse: number[] = []
    for (let i = 0; i < 3000; i++) {
      mur = i * (1000 / 60)
      lisse.push(h.maintenantMs())
    }
    expect(Math.abs(lisse[2999] - mur * 0.9999)).toBeLessThan(2)
    const doux = ecarts(lisse.slice(600))
    expect(Math.max(...doux) / Math.min(...doux)).toBeLessThan(1.01)
  })

  it("recale d'un coup après un décrochage, plutôt que de rattraper au ralenti", () => {
    let mur = 0
    let retard = 0
    const h = horlogeLissee({ mur: () => mur, reference: () => mur - retard })
    for (let i = 0; i < 120; i++) {
      mur = i * (1000 / 60)
      h.maintenantMs()
    }
    // L'onglet s'est fait suspendre : le son a continué, l'image non.
    retard = 3000
    mur += 1000 / 60
    expect(h.maintenantMs()).toBeCloseTo(mur - 3000, 0)
  })
})
