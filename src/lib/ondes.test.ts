import { describe, expect, it } from 'vitest'
import {
  attaqueLaPlusProche,
  attaquesExtremes,
  bornesDuSon,
  enveloppeDAttaques,
  recalerSurLesAttaques,
  type Signal,
} from './ondes'

const FREQUENCE = 8000

/** Un signal muet de la durée voulue, qu'on vient ensuite salir à des instants connus. */
function silence(secondes: number): Signal {
  return { echantillons: new Float32Array(FREQUENCE * secondes), frequence: FREQUENCE }
}

/** Une attaque : un coup bref qui s'éteint, comme une corde pincée. */
function frapper(signal: Signal, ms: number, force = 0.8, dureeMs = 120) {
  const debut = Math.round((ms / 1000) * signal.frequence)
  const longueur = Math.round((dureeMs / 1000) * signal.frequence)
  for (let i = 0; i < longueur && debut + i < signal.echantillons.length; i++) {
    const t = i / signal.frequence
    signal.echantillons[debut + i] += Math.sin(2 * Math.PI * 220 * t) * force * Math.exp(-t * 18)
  }
}

/** Une tenue : du son continu, sans attaque franche — le cas où il faut renoncer. */
function tenir(signal: Signal, msDebut: number, msFin: number, force = 0.5) {
  const debut = Math.round((msDebut / 1000) * signal.frequence)
  const fin = Math.round((msFin / 1000) * signal.frequence)
  for (let i = debut; i < fin && i < signal.echantillons.length; i++) {
    signal.echantillons[i] += Math.sin((2 * Math.PI * 220 * i) / signal.frequence) * force
  }
}

describe('bornesDuSon', () => {
  it('trouve où ça commence et où ça finit, pas la durée du fichier', () => {
    /* Un fichier de dix secondes dont la musique n'occupe que le milieu : se fier à la durée
       brute décalerait le calage des deux bouts à la fois. */
    const signal = silence(10)
    tenir(signal, 2000, 7000)
    const bornes = bornesDuSon(signal)
    expect(bornes).not.toBeNull()
    expect(bornes!.debutMs).toBeGreaterThanOrEqual(1980)
    expect(bornes!.debutMs).toBeLessThanOrEqual(2060)
    expect(bornes!.finMs).toBeGreaterThanOrEqual(6940)
    expect(bornes!.finMs).toBeLessThanOrEqual(7060)
  })

  it('ne se laisse pas ouvrir par un craquement isolé', () => {
    // Un clic de médiator posé sur la table, deux secondes avant que la musique commence.
    const signal = silence(10)
    frapper(signal, 1000, 0.9, 8)
    tenir(signal, 4000, 8000)
    expect(bornesDuSon(signal)!.debutMs).toBeGreaterThan(3500)
  })

  it('rend la main sur du silence', () => {
    expect(bornesDuSon(silence(3))).toBeNull()
  })
})

describe('attaqueLaPlusProche', () => {
  it('retrouve l’attaque à quelques millisecondes près', () => {
    const signal = silence(6)
    for (const ms of [1000, 2000, 3000]) frapper(signal, ms)
    const enveloppe = enveloppeDAttaques(signal)
    for (const ms of [1000, 2000, 3000]) {
      const trouve = attaqueLaPlusProche(enveloppe, ms + 60, 150)
      expect(trouve).not.toBeNull()
      expect(Math.abs(trouve! - ms)).toBeLessThanOrEqual(10)
    }
  })

  it('ne va pas chercher au-delà de sa fenêtre', () => {
    const signal = silence(6)
    frapper(signal, 1000)
    // L'attaque est à 400 ms de là : hors d'une fenêtre de 150, elle n'existe pas.
    expect(attaqueLaPlusProche(enveloppeDAttaques(signal), 1400, 150)).toBeNull()
  })

  it('renonce sur une tenue, où il n’y a rien à désigner', () => {
    /* La propriété qui compte : échouer là où il faut. Déplacer un point vers le sommet d'un
       bruit serait pire que de laisser la frappe de quelqu'un. */
    const signal = silence(6)
    tenir(signal, 500, 5500)
    expect(attaqueLaPlusProche(enveloppeDAttaques(signal), 3000, 150)).toBeNull()
  })

  it('renonce sur le silence', () => {
    expect(attaqueLaPlusProche(enveloppeDAttaques(silence(6)), 3000, 150)).toBeNull()
  })
})

describe('recalerSurLesAttaques', () => {
  it('range les frappes approximatives sur ce qui sonne', () => {
    const signal = silence(8)
    for (const ms of [1000, 3000, 5000]) frapper(signal, ms)
    const enveloppe = enveloppeDAttaques(signal)
    // Trois frappes en retard de 70 à 110 ms, comme un temps de réaction ordinaire.
    const points = [
      { partitionMs: 0, audioMs: 1090 },
      { partitionMs: 2000, audioMs: 3070 },
      { partitionMs: 4000, audioMs: 5110 },
    ]
    const recales = recalerSurLesAttaques(points, enveloppe)
    expect(recales.map((p) => p.partitionMs)).toEqual([0, 2000, 4000])
    for (const [i, attendu] of [1000, 3000, 5000].entries()) {
      expect(Math.abs(recales[i].audioMs - attendu)).toBeLessThanOrEqual(10)
    }
  })

  it('laisse en place un point qui n’a pas d’attaque à côté', () => {
    const signal = silence(8)
    frapper(signal, 1000)
    const points = [
      { partitionMs: 0, audioMs: 1080 },
      { partitionMs: 4000, audioMs: 6000 },
    ]
    const recales = recalerSurLesAttaques(points, enveloppeDAttaques(signal))
    expect(Math.abs(recales[0].audioMs - 1000)).toBeLessThanOrEqual(10)
    expect(recales[1].audioMs).toBe(6000)
  })
})

describe('attaquesExtremes', () => {
  it('accroche la dernière attaque, pas la fin de la résonance', () => {
    /* Le défaut qui a motivé la fonction : la dernière note commence à son attaque, et le son
       continue ensuite de résonner. Accrocher l'une à l'autre faussait le tempo du morceau. */
    const signal = silence(8)
    for (const ms of [1000, 2500, 4000, 5500]) frapper(signal, ms, 0.8, 600)
    const extremes = attaquesExtremes(enveloppeDAttaques(signal))
    expect(extremes).not.toBeNull()
    expect(Math.abs(extremes!.premiereMs - 1000)).toBeLessThanOrEqual(10)
    expect(Math.abs(extremes!.derniereMs - 5500)).toBeLessThanOrEqual(10)
    // Les bornes du son, elles, finissent plus tard : c'est toute la différence.
    expect(bornesDuSon(signal)!.finMs).toBeGreaterThan(5600)
  })

  it('ne prend pas un souffle du bruit de fond pour une attaque', () => {
    /* Dans le quasi-silence, le logarithme voit une montée aussi forte qu'une corde frappée
       chaque fois que le souffle double. Le seuil relatif doit l'en empêcher. */
    const signal = silence(8)
    frapper(signal, 1000)
    frapper(signal, 3000)
    // Un bruit très faible, irrégulier, jusqu'à la fin du fichier.
    for (let i = Math.round(4 * FREQUENCE); i < signal.echantillons.length; i++) {
      signal.echantillons[i] += ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.0004
    }
    const extremes = attaquesExtremes(enveloppeDAttaques(signal))
    expect(Math.abs(extremes!.derniereMs - 3000)).toBeLessThanOrEqual(10)
  })

  it('rend la main s’il n’y a pas au moins deux attaques', () => {
    const signal = silence(4)
    frapper(signal, 1000)
    expect(attaquesExtremes(enveloppeDAttaques(signal))).toBeNull()
  })
})
