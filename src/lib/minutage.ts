import type { ReglagesPdf, SystemePdf } from './types'

/**
 * Le minutage d'un PDF : à quel instant le curseur entre dans chaque ligne de tablature,
 * et où il se trouve entre deux.
 *
 * Un PDF ne contient aucune note au sens où une machine pourrait les jouer — c'est une
 * image de partition, pas une partition. Le minutage ne peut donc pas être lu, il doit
 * être *déclaré* : un tempo, une signature, et le nombre de mesures que porte chaque
 * ligne. Le reste est de l'arithmétique, et c'est tout l'objet de ce fichier.
 *
 * Tout y est pur et sans date : on peut donc vérifier au test que trois lignes de quatre
 * mesures à 120 battements par minute durent bien vingt-quatre secondes, sans ouvrir de
 * navigateur ni attendre vingt-quatre secondes.
 */

export interface Etape {
  index: number
  debutMs: number
  finMs: number
  dureeMs: number
}

export interface Position {
  /** Index du système survolé, ou -1 pendant le décompte qui précède la première note. */
  index: number
  /** Avancée dans ce système, de 0 (bord gauche) à 1 (bord droit). */
  progression: number
}

export function dureeSystemeMs(mesures: number, bpm: number, battementsParMesure: number): number {
  const bat = Math.max(1, mesures) * Math.max(1, battementsParMesure)
  // Un tempo nul ou négatif n'a pas de sens musical, mais il arrive pendant qu'on tape la
  // valeur dans le champ : on le borne plutôt que de renvoyer un infini qui se propagerait
  // jusque dans la durée totale affichée.
  return (bat * 60_000) / Math.max(1, bpm)
}

/** Les instants de chaque système, bout à bout, décalage initial compris. */
export function construireMinutage(
  systemes: SystemePdf[],
  reglages: Pick<ReglagesPdf, 'bpm' | 'battementsParMesure' | 'mesuresParSysteme' | 'decalageMs'>,
): Etape[] {
  const etapes: Etape[] = []
  let curseur = Math.max(0, reglages.decalageMs || 0)
  systemes.forEach((systeme, index) => {
    // `mesures` par système l'emporte sur la valeur globale : la dernière ligne d'un
    // morceau en compte presque toujours moins que les autres, et c'est le genre de détail
    // qui décale tout le reste si on l'ignore.
    const mesures = systeme.mesures > 0 ? systeme.mesures : reglages.mesuresParSysteme
    const dureeMs = dureeSystemeMs(mesures, reglages.bpm, reglages.battementsParMesure)
    etapes.push({ index, debutMs: curseur, finMs: curseur + dureeMs, dureeMs })
    curseur += dureeMs
  })
  return etapes
}

export function dureeTotaleMs(etapes: Etape[]): number {
  return etapes.length === 0 ? 0 : etapes[etapes.length - 1].finMs
}

/** Où est le curseur à l'instant `tMs` ? */
export function positionA(etapes: Etape[], tMs: number): Position {
  if (etapes.length === 0) return { index: -1, progression: 0 }
  if (tMs < etapes[0].debutMs) return { index: -1, progression: 0 }

  // Recherche dichotomique : appelée à chaque image d'une vidéo de plusieurs minutes,
  // elle passerait sinon son temps à reparcourir une liste qu'elle vient de parcourir.
  let bas = 0
  let haut = etapes.length - 1
  while (bas < haut) {
    const milieu = (bas + haut + 1) >> 1
    if (etapes[milieu].debutMs <= tMs) bas = milieu
    else haut = milieu - 1
  }
  const etape = etapes[bas]
  const progression = etape.dureeMs > 0 ? (tMs - etape.debutMs) / etape.dureeMs : 1
  return { index: etape.index, progression: Math.min(1, Math.max(0, progression)) }
}

/** « 3:07 » — le format d'une durée de morceau, pas celui d'une date. */
export function formaterDuree(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const total = Math.round(ms / 1000)
  const minutes = Math.floor(total / 60)
  const secondes = total % 60
  return `${minutes}:${String(secondes).padStart(2, '0')}`
}
