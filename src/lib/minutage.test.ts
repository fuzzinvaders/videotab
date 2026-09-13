import { describe, expect, it } from 'vitest'
import {
  construireMinutage,
  dureeSystemeMs,
  dureeTotaleMs,
  formaterDuree,
  positionA,
} from './minutage'
import type { SystemePdf } from './types'

function systemes(...mesures: number[]): SystemePdf[] {
  return mesures.map((m) => ({ page: 0, x0: 0.1, y0: 0, x1: 0.9, y1: 0.1, mesures: m }))
}

const REGLAGES = { bpm: 120, battementsParMesure: 4, mesuresParSysteme: 4, decalageMs: 0 }

describe('dureeSystemeMs', () => {
  it('quatre mesures à quatre temps à 120 font huit secondes', () => {
    expect(dureeSystemeMs(4, 120, 4)).toBe(8000)
  })

  it('borne un tempo nul plutôt que de renvoyer un infini', () => {
    expect(Number.isFinite(dureeSystemeMs(4, 0, 4))).toBe(true)
  })
})

describe('construireMinutage', () => {
  it('enchaîne les systèmes bout à bout', () => {
    const etapes = construireMinutage(systemes(4, 4, 4), REGLAGES)
    expect(etapes.map((e) => e.debutMs)).toEqual([0, 8000, 16000])
    expect(dureeTotaleMs(etapes)).toBe(24000)
  })

  it('respecte une dernière ligne plus courte', () => {
    const etapes = construireMinutage(systemes(4, 4, 2), REGLAGES)
    expect(dureeTotaleMs(etapes)).toBe(20000)
  })

  it('retombe sur la valeur globale quand la ligne ne dit rien', () => {
    const etapes = construireMinutage(systemes(0, 0), REGLAGES)
    expect(dureeTotaleMs(etapes)).toBe(16000)
  })

  it('repousse tout le morceau du décalage annoncé', () => {
    const etapes = construireMinutage(systemes(4), { ...REGLAGES, decalageMs: 1500 })
    expect(etapes[0].debutMs).toBe(1500)
    expect(dureeTotaleMs(etapes)).toBe(9500)
  })

  it('ne produit rien quand aucun système n’a été découpé', () => {
    expect(construireMinutage([], REGLAGES)).toEqual([])
    expect(dureeTotaleMs([])).toBe(0)
  })
})

describe('positionA', () => {
  const etapes = construireMinutage(systemes(4, 4, 4), REGLAGES)

  it('annonce -1 avant la première note, pendant le décompte', () => {
    const avecDecalage = construireMinutage(systemes(4), { ...REGLAGES, decalageMs: 2000 })
    expect(positionA(avecDecalage, 500).index).toBe(-1)
  })

  it('place le curseur au bon endroit de la bonne ligne', () => {
    expect(positionA(etapes, 0)).toEqual({ index: 0, progression: 0 })
    expect(positionA(etapes, 4000)).toEqual({ index: 0, progression: 0.5 })
    expect(positionA(etapes, 8000)).toEqual({ index: 1, progression: 0 })
    expect(positionA(etapes, 20000)).toEqual({ index: 2, progression: 0.5 })
  })

  it('reste au bout de la dernière ligne une fois le morceau fini', () => {
    expect(positionA(etapes, 99999)).toEqual({ index: 2, progression: 1 })
  })

  it('ne trouve rien quand il n’y a rien à trouver', () => {
    expect(positionA([], 1000).index).toBe(-1)
  })
})

describe('formaterDuree', () => {
  it('écrit une durée de morceau, pas une heure', () => {
    expect(formaterDuree(187_000)).toBe('3:07')
    expect(formaterDuree(0)).toBe('0:00')
    expect(formaterDuree(59_900)).toBe('1:00')
  })

  it('ne se laisse pas prendre par une valeur aberrante', () => {
    expect(formaterDuree(Number.NaN)).toBe('0:00')
    expect(formaterDuree(-5)).toBe('0:00')
  })
})
