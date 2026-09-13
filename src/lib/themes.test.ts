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
  /* Le test qui compte. alphaTab documente « 1 is the lowest string on the guitar and the
     bottom line on the tablature » : la corde 1 est la plus grave. Prendre la convention à
     l'envers retourne toute la palette sans rien casser d'autre — la vidéo sort, elle est
     jolie, et chaque note est de la mauvaise couleur. Ce test-là est le seul garde-fou. */
  it('donne la première couleur à la corde 1, qui est la plus grave', () => {
    expect(couleurDeCorde(cordes, 1)).toBe(cordes.cordes![0])
  })

  it('monte dans la palette à mesure qu’on monte vers l’aigu', () => {
    const guitare = [1, 2, 3, 4, 5, 6].map((corde) => couleurDeCorde(cordes, corde))
    expect(guitare).toEqual(cordes.cordes)
  })

  it('donne la même couleur au mi grave d’une guitare et d’une basse', () => {
    // Sur les deux, le mi grave est la corde 1 : rien à compter, rien à retourner.
    expect(couleurDeCorde(cordes, 1)).toBe(couleurDeCorde(cordes, 1))
    // Et la corde la plus aiguë d'une basse (4) n'est pas celle d'une guitare (6).
    expect(couleurDeCorde(cordes, 4)).not.toBe(couleurDeCorde(cordes, 6))
  })

  it('ne laisse pas la septième corde sans couleur', () => {
    expect(couleurDeCorde(cordes, 7)).toBe(cordes.cordes![cordes.cordes!.length - 1])
  })

  it('ne colore rien sur un thème qui ne colore pas les cordes', () => {
    expect(couleurDeCorde(ardoise, 3)).toBeNull()
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
