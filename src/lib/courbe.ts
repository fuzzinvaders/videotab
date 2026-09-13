/**
 * Une courbe qui passe par des points imposés, sans jamais revenir en arrière.
 *
 * C'est ce qu'il faut pour faire défiler une tablature. On connaît la position exacte de
 * chaque temps — celle-là ne se négocie pas, c'est elle qui met le curseur sur la note — mais
 * entre deux temps il faut bien inventer quelque chose, et la façon d'inventer se voit
 * beaucoup.
 *
 * Relier les points par des segments de droite donne une vitesse constante par morceau, qui
 * change brutalement à chaque temps. Or l'espacement d'une partition n'est pas proportionnel
 * à la durée : une blanche n'occupe pas deux fois la place d'une noire, elle en occupe une
 * fois et demie. Les segments donnent donc une vitesse qui saute d'un temps à l'autre, et
 * l'œil lit ces sauts comme des à-coups.
 *
 * L'interpolation d'Hermite monotone (Fritsch-Carlson) résout les deux à la fois : la courbe
 * passe exactement par chaque point, sa vitesse est continue, et elle ne dépasse jamais —
 * garantie qui compte ici, puisqu'une courbe qui ferait un aller-retour ferait reculer la
 * tablature entre deux notes.
 */

export interface Point {
  t: number
  v: number
}

export interface Courbe {
  (t: number): number
  /** Index du point en vigueur à cet instant, pour ce qui ne s'interpole pas. */
  indexA(t: number): number
  readonly points: Point[]
}

export function courbeMonotone(points: Point[]): Courbe {
  const p = points.filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
  const n = p.length

  // Les pentes des cordes, puis celles des points, tempérées pour rester monotones.
  const deltas: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const dt = p[i + 1].t - p[i].t
    deltas.push(dt > 0 ? (p[i + 1].v - p[i].v) / dt : 0)
  }

  const pentes: number[] = new Array(n).fill(0)
  if (n === 1) {
    pentes[0] = 0
  } else if (n > 1) {
    pentes[0] = deltas[0]
    pentes[n - 1] = deltas[n - 2]
    for (let i = 1; i < n - 1; i++) {
      const avant = deltas[i - 1]
      const apres = deltas[i]
      if (avant * apres <= 0) {
        // Changement de sens, ou palier : pente nulle. C'est la condition qui interdit le
        // dépassement, et donc le recul de la tablature.
        pentes[i] = 0
      } else {
        const h1 = p[i].t - p[i - 1].t
        const h2 = p[i + 1].t - p[i].t
        const w1 = 2 * h2 + h1
        const w2 = h2 + 2 * h1
        pentes[i] = (w1 + w2) / (w1 / avant + w2 / apres)
      }
    }
  }

  function indexA(t: number): number {
    if (n === 0) return -1
    if (t <= p[0].t) return 0
    if (t >= p[n - 1].t) return n - 1
    let bas = 0
    let haut = n - 1
    while (bas < haut) {
      const milieu = (bas + haut + 1) >> 1
      if (p[milieu].t <= t) bas = milieu
      else haut = milieu - 1
    }
    return bas
  }

  const courbe = ((t: number) => {
    if (n === 0) return 0
    if (t <= p[0].t) return p[0].v
    if (t >= p[n - 1].t) return p[n - 1].v

    const i = indexA(t)
    const h = p[i + 1].t - p[i].t
    if (h <= 0) return p[i].v
    const s = (t - p[i].t) / h

    // Hermite cubique sur l'intervalle, avec les pentes tempérées ci-dessus.
    const s2 = s * s
    const s3 = s2 * s
    return (
      (2 * s3 - 3 * s2 + 1) * p[i].v +
      (s3 - 2 * s2 + s) * h * pentes[i] +
      (-2 * s3 + 3 * s2) * p[i + 1].v +
      (s3 - s2) * h * pentes[i + 1]
    )
  }) as Courbe

  Object.defineProperty(courbe, 'points', { value: p })
  courbe.indexA = indexA
  return courbe
}
