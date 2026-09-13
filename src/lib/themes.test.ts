import { describe, expect, it } from 'vitest'
import { couleurDeCorde, hexVersRgb, THEMES, themeParId, THEME_PAR_DEFAUT } from './themes'

const cordes = themeParId('cordes')
const ardoise = themeParId('ardoise')

describe('themeParId', () => {
  it('retombe sur le thème par défaut plutôt que sur rien', () => {
    expect(themeParId('inconnu').id).toBe(THEME_PAR_DEFAUT)
    expect(themeParId(undefined).id).toBe(THEME_PAR_DEFAUT)
  })

  it('donne à chaque thème une identité et des couleurs complètes', () => {
    for (const theme of THEMES) {
      expect(theme.id).toMatch(/^[a-z]+$/)
      for (const couleur of [theme.fond, theme.encre, theme.lignes, theme.curseur]) {
        expect(couleur).toMatch(/^#[0-9a-f]{3,8}$/i)
      }
    }
  })

  it('n’a pas deux thèmes sous le même identifiant', () => {
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
  })
})

describe('couleurDeCorde', () => {
  it('donne la même couleur au mi grave d’une guitare et d’une basse', () => {
    // Corde 6 sur six, corde 4 sur quatre : c'est le mi grave dans les deux cas.
    expect(couleurDeCorde(cordes, 6, 6)).toBe(couleurDeCorde(cordes, 4, 4))
  })

  it('remonte la palette depuis le grave vers l’aigu', () => {
    const guitare = [6, 5, 4, 3, 2, 1].map((corde) => couleurDeCorde(cordes, corde, 6))
    expect(guitare).toEqual(cordes.cordes)
  })

  it('ne laisse pas les cordes d’une sept-cordes sans couleur', () => {
    expect(couleurDeCorde(cordes, 7, 7)).toBe(cordes.cordes![0])
    expect(couleurDeCorde(cordes, 1, 7)).toBeTypeOf('string')
  })

  it('ne colore rien sur un thème qui ne colore pas les cordes', () => {
    expect(couleurDeCorde(ardoise, 3, 6)).toBeNull()
  })
})

describe('hexVersRgb', () => {
  it('lit les deux écritures', () => {
    expect(hexVersRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(hexVersRgb('#f0f')).toEqual({ r: 255, g: 0, b: 255 })
    expect(hexVersRgb('#3b82f6')).toEqual({ r: 59, g: 130, b: 246 })
  })

  it('rend du noir plutôt qu’un NaN qui se propagerait dans le rendu', () => {
    expect(hexVersRgb('rouge')).toEqual({ r: 0, g: 0, b: 0 })
    expect(hexVersRgb('')).toEqual({ r: 0, g: 0, b: 0 })
  })
})
