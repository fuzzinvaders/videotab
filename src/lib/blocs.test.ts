import { describe, expect, it } from 'vitest'
import { decouperEnBlocs, largeurPourTenir } from './blocs'

/** n mesures régulières de `pas` de large : n + 1 barres. */
function barresRegulieres(n: number, pas = 100) {
  return Array.from({ length: n + 1 }, (_, i) => i * pas)
}

describe('decouperEnBlocs', () => {
  it('met autant de mesures qu’il en entre, et jamais une de plus', () => {
    // 420 de large pour des mesures de 100 : quatre entières, la cinquième déborderait.
    const b = decouperEnBlocs({
      barres: barresRegulieres(12),
      largeurFenetre: 420,
      anticipation: 0,
    })
    expect(b.debuts).toEqual([0, 400, 800])
  })

  it('reprend les mesures d’avance au début de la fenêtre suivante', () => {
    const b = decouperEnBlocs({
      barres: barresRegulieres(12),
      largeurFenetre: 420,
      anticipation: 1,
    })
    // Quatre mesures montrées, trois jouées : la quatrième ouvre la fenêtre d'après.
    expect(b.debuts).toEqual([0, 300, 600, 900])
  })

  it('suit les mesures réelles plutôt qu’un compte fixe', () => {
    /* La première mesure porte la clef et l'accordage : elle est deux fois plus large. La
       première fenêtre en montre donc moins que les suivantes, ce qui est exact — vouloir
       le même compte partout obligerait à en couper une. */
    const barres = [0, 200, 300, 400, 500, 600, 700, 800]
    const b = decouperEnBlocs({ barres, largeurFenetre: 420, anticipation: 0 })
    // Trois mesures seulement dans la première fenêtre, quatre dans la seconde.
    expect(b.debuts).toEqual([0, 400])
  })

  it('donne la fenêtre où tombe un point, et toujours la même', () => {
    const b = decouperEnBlocs({
      barres: barresRegulieres(12),
      largeurFenetre: 420,
      anticipation: 0,
    })
    expect(b.gaucheA(0)).toBe(0)
    expect(b.gaucheA(399)).toBe(0)
    expect(b.gaucheA(400)).toBe(400)
    expect(b.gaucheA(799)).toBe(400)
    // Au-delà de la fin, on reste sur la dernière fenêtre plutôt que de partir dans le vide.
    expect(b.gaucheA(99_999)).toBe(800)
    // Avant le début non plus, on ne recule pas.
    expect(b.gaucheA(-50)).toBe(0)
  })

  it('n’avance jamais à reculons, quelle que soit l’anticipation demandée', () => {
    for (const anticipation of [0, 1, 3, 12, 100]) {
      const b = decouperEnBlocs({
        barres: barresRegulieres(8),
        largeurFenetre: 250,
        anticipation,
      })
      const croissant = b.debuts.every((x, i) => i === 0 || x > b.debuts[i - 1])
      expect(croissant, `anticipation ${anticipation}`).toBe(true)
      expect(b.debuts[b.debuts.length - 1]).toBeLessThan(800)
    }
  })

  it('affiche quand même une mesure plus large que la fenêtre, plutôt que de se bloquer', () => {
    const b = decouperEnBlocs({ barres: [0, 1000, 1100, 1200], largeurFenetre: 300, anticipation: 1 })
    expect(b.debuts[0]).toBe(0)
    expect(b.debuts.length).toBeGreaterThan(1)
    expect(b.gaucheA(500)).toBe(0)
  })

  /* Un PDF dont on n'a pas déclaré le découpage, ou une partition vide : il faut bien montrer
     quelque chose, et un pavage régulier vaut mieux qu'une image figée. */
  it('pave régulièrement quand personne ne sait où sont les mesures', () => {
    const b = decouperEnBlocs({ barres: [], largeurFenetre: 500, anticipation: 1 })
    expect(b.gaucheA(0)).toBe(0)
    expect(b.gaucheA(499)).toBe(0)
    expect(b.gaucheA(500)).toBe(500)
    expect(b.gaucheA(1200)).toBe(1000)
  })
})

describe('largeurPourTenir', () => {
  it('donne la place qu’occupent vraiment le nombre de mesures demandé', () => {
    // Mesures régulières de 100 : quatre en font 400, quelle que soit la statistique.
    expect(largeurPourTenir(barresRegulieres(20), 4)).toBe(400)
  })

  /* Le cas qui a motivé la fonction, relevé sur une vraie tablature : des mesures de 166 à
     243 pour une médiane de 224. Quatre mesures médianes font 896, mais quatre mesures
     réelles dépassent souvent — et une mesure qui dépasse n'est pas rognée, elle est
     repoussée, si bien qu'en demander quatre en affichait trois. */
  it('voit large quand les mesures sont inégales, sinon on en perd une', () => {
    /* Des passages denses et des passages aérés, comme dans un vrai morceau : c'est la
       succession qui compte, pas la moyenne, parce qu'une fenêtre tombe dans l'un ou dans
       l'autre et n'y montre que des mesures entières. */
    const largeurs = [180, 180, 180, 190, 300, 290, 310, 295, 180, 185, 300, 305, 290, 180, 180]
    const barres = [0]
    for (const l of largeurs) barres.push(barres[barres.length - 1] + l)

    const triees = largeurs.slice().sort((a, b) => a - b)
    const mediane = triees[triees.length >> 1]

    /** Combien de fenêtres, sur toutes les positions possibles, tiennent bien quatre mesures. */
    const tiennent = (fenetre: number) =>
      largeurs.filter((_, i) => i + 4 <= largeurs.length && barres[i + 4] - barres[i] <= fenetre)
        .length
    const positions = largeurs.length - 3

    // Se régler sur la mesure médiane laisse tomber la moitié des fenêtres à trois mesures.
    expect(tiennent(4 * mediane)).toBeLessThan(positions * 0.7)
    // Se régler sur ce que quatre mesures occupent vraiment tient la promesse trois fois sur
    // quatre, sans rapetisser tout le morceau pour le pire passage.
    expect(tiennent(largeurPourTenir(barres, 4))).toBeGreaterThanOrEqual(positions * 0.75)
    expect(largeurPourTenir(barres, 4)).toBeLessThan(Math.max(...largeurs) * 4)
  })

  it('rend le morceau entier quand il est plus court que la fenêtre demandée', () => {
    expect(largeurPourTenir(barresRegulieres(2), 8)).toBe(200)
  })

  it('ne rend rien à partir d’une feuille sans mesures', () => {
    expect(largeurPourTenir([], 4)).toBe(0)
    expect(largeurPourTenir([0], 4)).toBe(0)
  })
})

describe('decouperEnBlocs : ce que l’œil compte comme affiché', () => {
  /* La bande est dessinée sur toute la largeur de la zone, donc la mesure qui déborde à
     droite se voit quand même. La compter, c'est tourner la page une mesure plus tard —
     exactement la frustration qu'on corrige : voir cinq mesures et changer d'écran à la
     quatrième, curseur aux deux tiers. */
  it('compte la mesure qui déborde dès qu’on en voit plus de la moitié', () => {
    const barres = barresRegulieres(12) // mesures de 100
    // 470 de large : quatre mesures entières, et 70 % de la cinquième — elle compte.
    const large = decouperEnBlocs({ barres, largeurFenetre: 470, anticipation: 1 })
    expect(large.debuts).toEqual([0, 400, 800])

    // 430 : quatre entières et seulement 30 % de la cinquième — elle ne compte pas.
    const juste = decouperEnBlocs({ barres, largeurFenetre: 430, anticipation: 1 })
    expect(juste.debuts).toEqual([0, 300, 600, 900])
  })

  it('ne compte pas une mesure dont on ne voit qu’un filet', () => {
    const barres = barresRegulieres(12)
    // 401 : la cinquième mesure n'est visible que sur un pixel.
    expect(decouperEnBlocs({ barres, largeurFenetre: 401, anticipation: 0 }).debuts).toEqual([
      0, 400, 800,
    ])
  })
})

describe('decouperEnBlocs : le curseur ne sort jamais de la fenêtre', () => {
  /* C'est l'invariant qui rend le mode utilisable : quelle que soit l'avance demandée, la
     fenêtre suivante s'ouvre sur une mesure dont on voit déjà le début. Autrement le curseur
     partirait au-delà du bord droit en attendant que la page tourne. */
  it('ouvre toujours la fenêtre suivante sur une mesure déjà visible', () => {
    const cas = [
      { barres: barresRegulieres(20), largeur: 470 },
      { barres: barresRegulieres(20), largeur: 430 },
      { barres: [0, 200, 300, 400, 500, 600, 700, 800, 1000, 1100], largeur: 470 },
    ]
    for (const { barres, largeur } of cas) {
      for (const anticipation of [0, 1, 2, 3]) {
        const b = decouperEnBlocs({ barres, largeurFenetre: largeur, anticipation })
        for (let i = 1; i < b.debuts.length; i++) {
          const ecart = b.debuts[i] - b.debuts[i - 1]
          expect(ecart, `largeur ${largeur}, avance ${anticipation}`).toBeGreaterThan(0)
          expect(ecart, `largeur ${largeur}, avance ${anticipation}`).toBeLessThan(largeur)
        }
      }
    }
  })
})
