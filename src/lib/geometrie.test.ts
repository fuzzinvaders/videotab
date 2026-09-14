import { describe, expect, it } from 'vitest'
import { mesurerScene, type FeuilleMesurable } from './geometrie'
import { videoParDefaut } from './reglages'
import type { ReglagesVideo } from './types'

/** Une tablature de basse telle qu'alphaTab la rend : mesures inégales, portée courte. */
function feuilleDeBasse(): FeuilleMesurable {
  const largeurs = [243, 166, 243, 218, 243, 166, 243, 218, 243, 166, 243, 218]
  const barres = [0]
  for (const l of largeurs) barres.push(barres[barres.length - 1] + l)
  return { largeur: barres[barres.length - 1], hauteur: 82, largeurMesure: 224, barres }
}

function video(reglages: Partial<ReglagesVideo> = {}): ReglagesVideo {
  return { ...videoParDefaut(), ...reglages }
}

function mesurer(reglages: Partial<ReglagesVideo> = {}, avecBandeau = false) {
  return mesurerScene({ video: video(reglages), feuille: feuilleDeBasse(), avecBandeau })
}

describe('mesurerScene : la bande', () => {
  it('rend une image aussi haute que la bande quand on cadre dessus', () => {
    const g = mesurer({ cadrage: 'bande' })
    const juste = g.bandeauH + g.zone.h + g.barreH
    // Plusieurs encodeurs refusent une dimension impaire, et l'export n'a pas à le découvrir :
    // on arrondit donc au pair supérieur, jamais de plus d'un pixel.
    expect(g.hauteurImage % 2).toBe(0)
    expect(g.hauteurImage).toBeGreaterThanOrEqual(juste)
    expect(g.hauteurImage - juste).toBeLessThanOrEqual(1)
    expect(g.hauteurImage).toBeLessThan(video().hauteur)
  })

  it('garde la hauteur annoncée et centre la bande quand on cadre sur l’image', () => {
    const g = mesurer({ cadrage: 'image' })
    expect(g.hauteurImage).toBe(video().hauteur)
    const dessus = g.zone.y - g.bandeauH
    const dessous = g.hauteurImage - g.barreH - (g.zone.y + g.zone.h)
    expect(Math.abs(dessus - dessous)).toBeLessThanOrEqual(1)
  })

  it('n’ouvre pas de bandeau quand il n’y a aucun texte à y mettre', () => {
    expect(mesurer({ bandeau: true }, false).bandeauH).toBe(0)
    expect(mesurer({ bandeau: true }, true).bandeauH).toBeGreaterThan(0)
    expect(mesurer({ bandeau: false }, true).bandeauH).toBe(0)
  })
})

describe('mesurerScene : l’épaisseur du cadre', () => {
  /* Le défaut qui a motivé la fonction : l'épaisseur se déduisait de la hauteur de l'image.
     Cadrée sur la bande, celle-ci tombe à deux cents pixels, et le réglage restait cloué à
     son minimum — précisément dans le cadrage fait pour l'incrustation. */
  it('ne dépend pas du cadrage, seulement de la largeur', () => {
    const surImage = mesurer({ epaisseurCadre: 12, cadrage: 'image' })
    const surBande = mesurer({ epaisseurCadre: 12, cadrage: 'bande' })
    expect(surBande.hauteurImage).toBeLessThan(surImage.hauteurImage / 2)
    expect(surBande.traitCadre).toBe(surImage.traitCadre)
    expect(surBande.traitCadre).toBe(12)
  })

  it('suit la définition, pour garder le même poids en 720p', () => {
    expect(mesurer({ epaisseurCadre: 12, largeur: 1280, hauteur: 720 }).traitCadre).toBe(8)
    expect(mesurer({ epaisseurCadre: 0 }).traitCadre).toBe(0)
  })
})

describe('mesurerScene : les dispositions', () => {
  it('met la partition à la largeur en page, et n’en fait pas une bande', () => {
    const g = mesurer({ disposition: 'page' })
    expect(g.bande).toBe(false)
    expect(g.parBlocs).toBe(false)
    expect(g.echelle).toBeCloseTo(g.zone.w / feuilleDeBasse().largeur)
    // La page défile verticalement : il faut donc qu'il y ait de quoi défiler.
    expect(g.scrollMax).toBe(0)
  })

  it('donne la même mise en page au défilement et aux mesures fixes', () => {
    const glisse = mesurer({ disposition: 'defilement' })
    const fixe = mesurer({ disposition: 'mesures' })
    expect(glisse.bande).toBe(true)
    expect(fixe.bande).toBe(true)
    expect(fixe.parBlocs).toBe(true)
    expect(glisse.parBlocs).toBe(false)
    expect(fixe.zone.w).toBe(glisse.zone.w)
  })

  /* En mesures fixes, le zoom se règle sur ce que le compte demandé occupe *réellement* et non
     sur une mesure médiane : une mesure qui déborde y est repoussée à la fenêtre suivante, pas
     rognée. Selon le morceau la tablature y gagne ou y perd un peu de taille — ce qui compte
     est que le calcul change de source, et retombe sur l'ancienne quand les barres manquent. */
  it('règle le zoom sur les mesures réelles, et sur la médiane à défaut', () => {
    const f = feuilleDeBasse()
    const sansBarres = { ...f, barres: undefined }
    const reel = mesurerScene({
      video: video({ disposition: 'mesures' }),
      feuille: f,
      avecBandeau: false,
    })
    const medianE = mesurerScene({
      video: video({ disposition: 'mesures' }),
      feuille: sansBarres,
      avecBandeau: false,
    })
    const glisse = mesurerScene({
      video: video({ disposition: 'defilement' }),
      feuille: sansBarres,
      avecBandeau: false,
    })
    expect(reel.echelle).not.toBeCloseTo(medianE.echelle, 3)
    expect(medianE.echelle).toBeCloseTo(glisse.echelle, 6)
  })

  it('ne découpe en fenêtres que là où la tablature reste immobile', () => {
    expect(mesurer({ disposition: 'mesures' }).blocs.debuts.length).toBeGreaterThan(1)
    // Le découpage existe partout, mais il ne sert qu'en mesures fixes.
    expect(mesurer({ disposition: 'defilement' }).blocs.debuts.length).toBeGreaterThan(0)
  })
})

describe('mesurerScene : le plafond de hauteur', () => {
  it('laisse le compte de mesures céder plutôt que l’image déborder', () => {
    const bas = mesurer({ mesuresVisibles: 1, hauteurMax: 0.12 })
    expect(bas.zone.h).toBeLessThanOrEqual(video().hauteur * 0.12 + 1)
  })

  it('compte l’air dans le plafond, au lieu de le laisser déborder', () => {
    const serre = mesurer({ margeBande: 0, hauteurMax: 0.2 })
    const aere = mesurer({ margeBande: 1.2, hauteurMax: 0.2 })
    for (const g of [serre, aere]) {
      expect(g.zone.h).toBeLessThanOrEqual(video().hauteur * 0.2 + 1)
    }
  })
})
