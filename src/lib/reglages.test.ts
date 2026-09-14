import { describe, expect, it } from 'vitest'
import { completerReglages, completerVideo, videoParDefaut } from './reglages'
import type { ReglagesVideo } from './types'

describe('completerVideo', () => {
  it('rend les réglages par défaut quand il n’y a rien', () => {
    expect(completerVideo(undefined)).toEqual(videoParDefaut())
  })

  /* C'est le vrai cas d'usage de cette fonction : un morceau importé avant qu'une
     disposition, un thème ou un cadre n'existent, et qui doit s'ouvrir sans rien casser. */
  it('complète un morceau d’avant les thèmes sans perdre ce qu’il avait', () => {
    const ancien = { largeur: 1280, hauteur: 720, fps: 24, couleur: '#ff0000' }
    const complet = completerVideo(ancien as Partial<ReglagesVideo>)
    expect(complet.largeur).toBe(1280)
    expect(complet.fps).toBe(24)
    expect(complet.couleur).toBe('#ff0000')
    expect(complet.disposition).toBe(videoParDefaut().disposition)
    expect(complet.theme).toBe(videoParDefaut().theme)
  })

  it('ramène dans les bornes ce qui n’y est pas', () => {
    const fou = completerVideo({
      mesuresVisibles: 900,
      hauteurMax: 12,
      teteX: -3,
      opacite: 40,
      compteAvantSec: 999,
    } as Partial<ReglagesVideo>)
    expect(fou.mesuresVisibles).toBeLessThanOrEqual(32)
    expect(fou.hauteurMax).toBeLessThanOrEqual(0.95)
    expect(fou.teteX).toBeGreaterThanOrEqual(0.08)
    expect(fou.opacite).toBeLessThanOrEqual(0.9)
    expect(fou.compteAvantSec).toBeLessThanOrEqual(12)
  })

  it('refuse une disposition, un cadre ou un style de curseur inventés', () => {
    const complet = completerVideo({
      disposition: 'diagonale',
      cadre: 'doré',
      curseurStyle: 'clignotant',
    } as never)
    expect(complet.disposition).toBe(videoParDefaut().disposition)
    expect(complet.cadre).toBe(videoParDefaut().cadre)
    expect(complet.curseurStyle).toBe(videoParDefaut().curseurStyle)
  })

  /* Les mesures fixes sont arrivées après le défilement : un morceau enregistré avec elles
     doit se rouvrir dessus, et un morceau plus ancien retrouver le défilement sans rien dire.
     C'est tout ce que garantit l'absence de migration, et ça se vérifie. */
  it('accepte la disposition en mesures fixes, arrivée après les autres', () => {
    expect(completerVideo({ disposition: 'mesures' }).disposition).toBe('mesures')
    expect(completerVideo({}).disposition).toBe('defilement')
    expect(completerVideo({}).anticipation).toBe(videoParDefaut().anticipation)
  })

  /* La couleur absente doit le rester : c'est elle qui fait suivre le thème. Lui donner une
     valeur par défaut recréerait le bug qu'on vient de corriger — un curseur figé sur la
     teinte d'un thème essayé une fois, et qui ne suit plus jamais les suivants. */
  it('laisse la couleur du curseur à null plutôt que d’en inventer une', () => {
    expect(completerVideo({ theme: 'neon' } as never).couleur).toBeNull()
    expect(completerVideo({ couleur: 42 } as never).couleur).toBeNull()
    expect(completerVideo({ couleur: '#123456' } as never).couleur).toBe('#123456')
  })

  it('ne prend pas un NaN pour une valeur', () => {
    expect(completerVideo({ fps: Number.NaN } as Partial<ReglagesVideo>).fps).toBe(
      videoParDefaut().fps,
    )
  })
})

describe('completerReglages', () => {
  it('donne à chaque type la moitié qui le concerne, et pas l’autre', () => {
    expect(completerReglages(undefined, 'gp').gp).toBeDefined()
    expect(completerReglages(undefined, 'gp').pdf).toBeUndefined()
    expect(completerReglages(undefined, 'pdf').pdf).toBeDefined()
    expect(completerReglages(undefined, 'pdf').gp).toBeUndefined()
  })

  it('garde le découpage d’un PDF, qui ne se retrouve pas tout seul', () => {
    const systemes = [{ page: 0, x0: 0.1, x1: 0.9, y0: 0.2, y1: 0.3, mesures: 4 }]
    const complet = completerReglages({ pdf: { systemes } } as never, 'pdf')
    expect(complet.pdf?.systemes).toEqual(systemes)
  })

  it('remplace un découpage qui n’est pas une liste plutôt que de s’y fier', () => {
    const complet = completerReglages({ pdf: { systemes: 'oui' } } as never, 'pdf')
    expect(complet.pdf?.systemes).toEqual([])
  })
})
