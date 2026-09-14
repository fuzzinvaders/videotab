/**
 * L'horloge d'un enregistrement : régulière comme l'écran, juste comme le son.
 *
 * Deux horloges coexistent pendant un export et aucune ne convient seule.
 *
 * Celle du son dit la vérité : c'est elle qui décide quand la note sonne, et une image
 * calculée d'après autre chose finirait par dériver de la bande. Mais elle n'avance pas,
 * elle saute. Le navigateur ne la met à jour qu'à chaque bloc rendu par la carte son —
 * mesuré ici, 10,7 ms à la fois, soit 512 échantillons à 48 kHz. Consultée à chaque image
 * d'un écran à 60 Hz, elle répond donc 10,7 puis 21,3 puis 10,7 : la partition avance d'un
 * demi-pas, puis d'un pas et demi, indéfiniment. À l'œil, c'est une saccade permanente, et
 * elle est invisible tant qu'on ne mesure pas, parce que le son, lui, reste parfait.
 *
 * Celle du mur — `performance.now()` — avance régulièrement, à la milliseconde près. Mais
 * rien ne garantit qu'elle reste alignée sur la carte son sur trois minutes.
 *
 * On prend donc le rythme de l'une et la justesse de l'autre : le temps rendu est celui du
 * mur, et seule son *origine* est asservie à l'horloge du son, si lentement que la reprise
 * ne se voit jamais. Le tremblement de la référence, dont la moyenne est nulle, se trouve
 * filtré ; sa dérive, elle, est suivie.
 */

export interface Horloge {
  /** L'instant du morceau, en millisecondes, à cet appel-ci. */
  maintenantMs(): number
}

export interface DemandeHorloge {
  /** L'instant du morceau selon la source qui fait foi, tremblements compris. */
  reference: () => number
  /** L'horloge régulière qui donne le rythme. Injectable pour les tests. */
  mur?: () => number
  /** Part de l'écart rattrapée à chaque appel. */
  souplesse?: number
  /** Correction maximale par appel, en ms : au-delà, la reprise se verrait. */
  pasMax?: number
  /** Écart au-delà duquel on renonce à rattraper et on recale d'un coup. */
  ecartMax?: number
}

export function horlogeLissee(d: DemandeHorloge): Horloge {
  const mur = d.mur ?? (() => performance.now())
  /* Un centième de l'écart par image : la constante de temps est d'une centaine d'images,
     soit près de deux secondes. Assez lent pour que le tremblement de dix millisecondes de
     la référence se réduise à un dixième — un demi pour cent de variation de vitesse, mesuré
     — assez vif pour qu'une dérive d'horloge, quelques millisecondes par minute au pire,
     soit suivie sans retard perceptible. */
  const souplesse = d.souplesse ?? 0.01
  /* Quinze centièmes de milliseconde sur une image de seize : moins d'un pour cent de
     variation de vitesse, très en dessous de ce qu'un œil sait voir, et de quoi rattraper
     tout de même neuf millisecondes par seconde si la dérive est réelle. */
  const pasMax = d.pasMax ?? 0.15
  /* Un quart de seconde d'écart n'est plus une dérive : c'est un onglet qui s'est fait
     suspendre. Rattraper cela au centième ferait plusieurs secondes de ralenti ; mieux vaut
     un saut franc, qui remet l'image en face du son tout de suite. */
  const ecartMax = d.ecartMax ?? 250

  let origine = 0
  let calee = false

  return {
    maintenantMs() {
      const m = mur()
      // L'instant, sur l'horloge du mur, où le morceau a commencé — selon le son.
      const vu = m - d.reference()
      if (!calee) {
        origine = vu
        calee = true
      } else {
        const ecart = vu - origine
        if (Math.abs(ecart) > ecartMax) origine = vu
        else origine += Math.max(-pasMax, Math.min(pasMax, ecart * souplesse))
      }
      return m - origine
    },
  }
}
