import { describe, expect, it } from 'vitest'
import { poserLesClics } from './audio'

/** Un AudioBuffer de pacotille : `poserLesClics` n'a besoin que d'écrire dans des tableaux,
 *  et un vrai contexte audio n'existe pas hors du navigateur. */
function tampon(secondes: number, frequence = 48000): AudioBuffer {
  const canaux = [new Float32Array(Math.round(secondes * frequence))]
  return {
    sampleRate: frequence,
    numberOfChannels: 1,
    length: canaux[0].length,
    getChannelData: (c: number) => canaux[c],
  } as unknown as AudioBuffer
}

/** Les instants, en millisecondes, où le silence se rompt.
 *
 *  Une sinusoïde repasse par zéro deux fois par période : compter les silences donnerait
 *  autant d'attaques que d'oscillations. On tient donc chaque clic pour un seul événement
 *  pendant la centaine de millisecondes qui suit son entrée. */
function attaques(buffer: AudioBuffer): number[] {
  const piste = buffer.getChannelData(0)
  const repos = Math.round(0.1 * buffer.sampleRate)
  const debuts: number[] = []
  let dernier = -repos
  for (let i = 0; i < piste.length; i++) {
    if (Math.abs(piste[i]) > 0.01 && i - dernier >= repos) {
      debuts.push(Math.round((i / buffer.sampleRate) * 1000))
      dernier = i
    }
  }
  return debuts
}

describe('poserLesClics', () => {
  it('bat le temps du morceau, et non la seconde', () => {
    // 143 noires par minute : un temps dure 419,6 ms, et quatre temps 1678 ms.
    const buffer = tampon(3)
    poserLesClics(buffer, 4 * 419.58, 419.58)
    expect(attaques(buffer)).toEqual([0, 420, 839, 1259])
  })

  it('en pose autant que le décompte compte de temps', () => {
    const buffer = tampon(6)
    poserLesClics(buffer, 8 * 500, 500)
    expect(attaques(buffer)).toHaveLength(8)
  })

  it('marque le premier plus haut que les autres : c’est lui qui dit le départ', () => {
    const buffer = tampon(3)
    poserLesClics(buffer, 4 * 500, 500)
    const piste = buffer.getChannelData(0)
    // La fréquence se lit au nombre de passages par zéro sur les dix premières millisecondes.
    const passages = (depuis: number) => {
      let n = 0
      for (let i = depuis + 1; i < depuis + 480; i++) {
        if (piste[i - 1] < 0 !== piste[i] < 0) n++
      }
      return n
    }
    // 1760 Hz contre 880 : deux fois plus de passages par zéro dans le même temps.
    expect(passages(0)).toBeGreaterThan(passages(24000) * 1.5)
  })
})
