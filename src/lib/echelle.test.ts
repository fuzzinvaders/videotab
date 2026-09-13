import { describe, expect, it } from 'vitest'
import { echelleDefilement, largeurMedianeDeMesure } from './echelle'

const feuille = { largeur: 12_000, hauteur: 200 }

function demande(surcharge: Partial<Parameters<typeof echelleDefilement>[0]> = {}) {
  return echelleDefilement({
    largeurZone: 1920,
    hauteurMaxBande: 486,
    largeurMesure: 300,
    mesuresVisibles: 4,
    margeRelative: 0,
    feuille,
    ...surcharge,
  })
}

describe('echelleDefilement', () => {
  it('met à l’écran le nombre de mesures demandé', () => {
    const { echelle, mesuresVisibles } = demande()
    // Quatre mesures de 300 pixels doivent remplir les 1920 de large.
    expect(echelle).toBeCloseTo(1920 / 1200, 5)
    expect(mesuresVisibles).toBeCloseTo(4, 5)
  })

  it('fait découler la hauteur du zoom, et non l’inverse', () => {
    const serre = demande({ mesuresVisibles: 2 })
    const large = demande({ mesuresVisibles: 8 })
    // Moins de mesures, plus gros, donc plus haut : c'est la conséquence attendue.
    expect(serre.hauteurBande).toBeGreaterThan(large.hauteurBande)
  })

  it('laisse la bande aussi courte que la tablature l’exige', () => {
    // Rien ne force la bande à occuper la hauteur autorisée : c'est tout l'intérêt pour une
    // incrustation, qui ne doit manger que ce qu'il faut de l'image.
    const { hauteurBande } = demande({ mesuresVisibles: 8 })
    expect(hauteurBande).toBeLessThan(486)
    expect(hauteurBande).toBeCloseTo(200 * (1920 / 2400), 0)
  })

  it('cède sur le nombre de mesures plutôt que de déborder', () => {
    // Une seule mesure à l'écran demanderait une bande six fois trop haute : le plafond
    // l'emporte, et on voit alors plus de mesures que demandé.
    const { hauteurBande, mesuresVisibles } = demande({ mesuresVisibles: 1 })
    expect(hauteurBande).toBeLessThanOrEqual(486)
    expect(mesuresVisibles).toBeGreaterThan(1)
  })

  it('retombe sur le plafond quand la largeur de mesure est inconnue', () => {
    const { hauteurBande } = demande({ largeurMesure: 0 })
    expect(hauteurBande).toBe(486)
  })

  it('ne renvoie jamais une échelle ou une hauteur nulle', () => {
    const vide = echelleDefilement({
      largeurZone: 0,
      hauteurMaxBande: 0,
      largeurMesure: 0,
      mesuresVisibles: 0,
      margeRelative: 0,
      feuille: { largeur: 0, hauteur: 0 },
    })
    expect(vide.echelle).toBeGreaterThan(0)
    expect(vide.hauteurBande).toBeGreaterThan(0)
  })
})

describe('l’air autour de la tablature', () => {
  it('s’ajoute de part et d’autre, sans changer le zoom', () => {
    // Plafond large exprès : on veut isoler l'effet de l'air, pas le voir buter contre lui.
    const sans = demande({ hauteurMaxBande: 4000 })
    const avec = demande({ hauteurMaxBande: 4000, margeRelative: 0.5 })
    // Le zoom ne bouge pas : l'air entoure la tablature, il ne la rétrécit pas.
    expect(avec.echelle).toBeCloseTo(sans.echelle, 5)
    expect(avec.mesuresVisibles).toBeCloseTo(4, 5)
    // Une demi-hauteur de chaque côté, donc une bande deux fois plus haute.
    expect(avec.hauteurBande).toBeCloseTo(sans.hauteurBande * 2, 0)
    expect(avec.marge).toBeCloseTo(sans.hauteurBande / 2, 0)
  })

  /* Sans cette prise en compte, demander beaucoup d'air ferait déborder une bande qui se
     croyait dans les clous : le plafond aurait validé la tablature seule. */
  it('compte dans le plafond, au lieu de le déborder en douce', () => {
    const { hauteurBande } = demande({ mesuresVisibles: 1, margeRelative: 1.5 })
    expect(hauteurBande).toBeLessThanOrEqual(486)
  })

  it('ne laisse aucun air quand on n’en demande pas', () => {
    expect(demande().marge).toBe(0)
  })
})

describe('largeurMedianeDeMesure', () => {
  /* Le cas qui motive la médiane : la première mesure d'un système porte la clef, l'armure et
     l'accordage, et fait le double des autres. Une moyenne la laisserait tirer tout le zoom. */
  it('ignore la mesure d’ouverture, deux fois trop large', () => {
    expect(largeurMedianeDeMesure([600, 300, 300, 300, 300])).toBe(300)
  })

  it('prend le milieu des deux centrales quand le compte est pair', () => {
    expect(largeurMedianeDeMesure([100, 200, 300, 400])).toBe(250)
  })

  it('écarte les largeurs qui n’en sont pas', () => {
    expect(largeurMedianeDeMesure([0, -5, Number.NaN, 300])).toBe(300)
    expect(largeurMedianeDeMesure([])).toBe(0)
  })
})
