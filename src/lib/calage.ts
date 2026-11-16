/**
 * Caler la partition sur un enregistrement réel.
 *
 * Une tablature joue à son tempo écrit, régulier au millième près. Une reprise, non : elle
 * respire, elle traîne sur le pont, elle ralentit sur la dernière mesure. Poser l'une sur
 * l'autre avec un simple décalage ne tient que quelques mesures, et le curseur finit par
 * désigner une note que personne ne joue.
 *
 * D'où les points de calage : « la mesure 17 commence à 0:42,3 dans le fichier ». Entre deux
 * points, le temps s'étire linéairement ; au-delà des extrêmes, on prolonge la pente voisine.
 * C'est la méthode des logiciels de tablature, et elle a trois qualités qui comptent ici.
 *
 * Elle est **exacte aux points posés** : là où l'on a écouté et décidé, le curseur est juste,
 * sans discussion. Elle **encaisse n'importe quelle variation** — y compris un ralenti final,
 * qu'aucun tempo moyen ne rattrape. Et c'est une **fonction pure** : tout ce fichier se
 * vérifie sans navigateur, sans audio et sans partition.
 *
 * Elle ne sait pas, en revanche, deviner. Deux points suffisent à corriger un tempo qui n'est
 * pas le bon ; au-delà, chaque point posé est une mesure de plus que la machine n'a pas à
 * inventer.
 */

import type { PointCalage } from './types'

export type { PointCalage }

/**
 * Les points utilisables, remis en ordre et débarrassés de ceux qui se contredisent.
 *
 * Un point posé par erreur — une frappe en retard d'une mesure, une correction à la main qui
 * passe derrière sa voisine — demanderait au temps de reculer. Le curseur remonterait alors le
 * morceau sur un segment, ce qui n'est pas un petit défaut d'alignement mais un comportement
 * absurde. On préfère donc ignorer le point fautif et garder une courbe qui monte toujours.
 *
 * C'est le premier posé qui gagne, dans l'ordre de la partition : il a été écouté, et celui
 * qui le suit a toute chance d'être la frappe ratée.
 */
export function pointsValides(points: PointCalage[]): PointCalage[] {
  const tries = [...points]
    .filter((p) => Number.isFinite(p.partitionMs) && Number.isFinite(p.audioMs))
    .sort((a, b) => a.partitionMs - b.partitionMs)

  const gardes: PointCalage[] = []
  for (const point of tries) {
    const dernier = gardes[gardes.length - 1]
    // Les deux axes doivent avancer : deux points au même instant de partition ne décriraient
    // aucune pente, et deux au même instant d'audio arrêteraient le temps.
    if (dernier && (point.partitionMs <= dernier.partitionMs || point.audioMs <= dernier.audioMs)) {
      continue
    }
    gardes.push(point)
  }
  return gardes
}

/**
 * La fonction qui envoie un instant de la partition sur l'instant correspondant de l'audio.
 *
 * Sans point, l'identité : la partition est sa propre référence, et rien ne bouge. Avec un
 * seul, une translation — on sait où commencer, pas à quelle vitesse aller. À partir de deux,
 * la pente de chaque segment est celle que les points décrivent, et les bords prolongent la
 * pente la plus proche plutôt que de se figer : un morceau ne s'arrête pas de couler avant le
 * premier repère ni après le dernier.
 */
export function deformerLeTemps(points: PointCalage[]): (partitionMs: number) => number {
  const calage = pointsValides(points)

  if (calage.length === 0) return (ms) => ms
  if (calage.length === 1) {
    const ecart = calage[0].audioMs - calage[0].partitionMs
    return (ms) => ms + ecart
  }

  const pente = (a: PointCalage, b: PointCalage) =>
    (b.audioMs - a.audioMs) / (b.partitionMs - a.partitionMs)

  const premiere = pente(calage[0], calage[1])
  const derniere = pente(calage[calage.length - 2], calage[calage.length - 1])

  return (ms: number) => {
    if (ms <= calage[0].partitionMs) {
      return calage[0].audioMs + (ms - calage[0].partitionMs) * premiere
    }
    const fin = calage[calage.length - 1]
    if (ms >= fin.partitionMs) return fin.audioMs + (ms - fin.partitionMs) * derniere

    /* Recherche dichotomique : la table peut compter une entrée par mesure, et cette fonction
       est appelée une fois par ancre — c'est-à-dire des milliers de fois à chaque relevé. */
    let bas = 0
    let haut = calage.length - 1
    while (haut - bas > 1) {
      const milieu = (bas + haut) >> 1
      if (calage[milieu].partitionMs <= ms) bas = milieu
      else haut = milieu
    }
    const debut = calage[bas]
    const suite = calage[bas + 1]
    const part = (ms - debut.partitionMs) / (suite.partitionMs - debut.partitionMs)
    return debut.audioMs + part * (suite.audioMs - debut.audioMs)
  }
}

/**
 * Le tempo que le calage impose, par rapport à celui de la partition.
 *
 * Utile à montrer plutôt qu'à calculer : un facteur de 1,04 dit « ta reprise est quatre pour
 * cent plus rapide que la tablature », ce qui se lit mieux qu'une liste de millisecondes et
 * permet de repérer d'un coup d'œil un point posé une mesure trop loin — il sort du lot.
 */
export function facteursDeTempo(points: PointCalage[]): number[] {
  const calage = pointsValides(points)
  const facteurs: number[] = []
  for (let i = 1; i < calage.length; i++) {
    const partition = calage[i].partitionMs - calage[i - 1].partitionMs
    const audio = calage[i].audioMs - calage[i - 1].audioMs
    facteurs.push(partition > 0 ? partition / audio : 1)
  }
  return facteurs
}
