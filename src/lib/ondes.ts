import type { PointCalage } from './types'

/**
 * Ce que l'onde sonore sait dire toute seule.
 *
 * Deux choses seulement, et c'est délibéré. **Où le fichier commence et finit de sonner**, ce
 * qui suffit à poser un calage grossier sans rien taper ; et **où sont les attaques**, ce qui
 * permet de rattraper une frappe approximative. Ni l'une ni l'autre ne prétend reconnaître des
 * mesures : détecter une pulsation à l'aveugle dans une reprise se trompe, et se trompe mal —
 * une pulsation prise à contretemps décale tout le morceau d'une croche.
 *
 * Tout ici travaille sur un signal brut plutôt que sur un `AudioBuffer`. Ce n'est pas une
 * précaution de style : c'est ce qui permet d'éprouver ces fonctions sur des signaux fabriqués
 * — des clics à des instants connus — sans navigateur, sans carte son et sans oreille.
 */

export interface Signal {
  echantillons: Float32Array
  frequence: number
}

/** Le mélange mono d'une bande-son : on cherche des attaques, pas une image stéréo. */
export function signalDe(buffer: AudioBuffer): Signal {
  const canaux = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  if (canaux.length === 1) return { echantillons: canaux[0], frequence: buffer.sampleRate }
  const melange = new Float32Array(buffer.length)
  for (const canal of canaux) {
    for (let i = 0; i < melange.length; i++) melange[i] += canal[i] / canaux.length
  }
  return { echantillons: melange, frequence: buffer.sampleRate }
}

/** L'énergie moyenne de chaque tranche, la matière première des deux mesures qui suivent. */
function energies(signal: Signal, pasMs: number): Float32Array {
  const parTrame = Math.max(1, Math.round((pasMs / 1000) * signal.frequence))
  const trames = Math.floor(signal.echantillons.length / parTrame)
  const sortie = new Float32Array(trames)
  for (let t = 0; t < trames; t++) {
    let somme = 0
    const debut = t * parTrame
    for (let i = debut; i < debut + parTrame; i++) somme += signal.echantillons[i] ** 2
    sortie[t] = Math.sqrt(somme / parTrame)
  }
  return sortie
}

/**
 * Où le fichier commence et finit de sonner.
 *
 * Et non sa durée, qui est presque toujours fausse des deux bouts : un enregistrement s'ouvre
 * sur un peu de silence et se ferme sur une queue de réverbération ou sur rien. Se fier à la
 * durée brute décalerait le calage d'autant.
 *
 * Le seuil est relatif au plus fort du morceau — deux pour cent, soit une quarantaine de
 * décibels en dessous — parce qu'un seuil absolu ne veut rien dire : le même morceau exporté
 * deux fois n'a pas le même niveau. Et il faut **trois tranches de suite** au-dessus du seuil
 * pour déclarer un début : un clic isolé, un souffle, un craquement de médiator posé sur la
 * table ne doivent pas faire commencer le morceau.
 */
export function bornesDuSon(
  signal: Signal,
  { pasMs = 10, part = 0.02, tenue = 3 } = {},
): { debutMs: number; finMs: number } | null {
  const niveaux = energies(signal, pasMs)
  if (niveaux.length === 0) return null

  let sommet = 0
  for (const niveau of niveaux) sommet = Math.max(sommet, niveau)
  if (sommet <= 0) return null
  const seuil = sommet * part

  const premiereTenue = (depuis: number, sens: 1 | -1): number => {
    let compte = 0
    for (let t = depuis; t >= 0 && t < niveaux.length; t += sens) {
      compte = niveaux[t] >= seuil ? compte + 1 : 0
      if (compte >= tenue) return t - sens * (tenue - 1)
    }
    return -1
  }

  const debut = premiereTenue(0, 1)
  const fin = premiereTenue(niveaux.length - 1, -1)
  if (debut < 0 || fin < 0 || fin <= debut) return null
  // La fin est le bout de la tranche, pas son début : le son dure jusque-là.
  return { debutMs: debut * pasMs, finMs: (fin + 1) * pasMs }
}

export interface Enveloppe {
  pasMs: number
  /** Par tranche : de combien l'énergie a monté. Zéro partout où elle descend ou se tient. */
  attaques: Float32Array
}

/**
 * Où ça attaque, et de combien.
 *
 * La montée de l'énergie d'une tranche à l'autre, en échelle logarithmique et redressée : ce
 * qui descend ne nous intéresse pas, une note qui s'éteint n'est pas un repère. Le logarithme
 * compte parce qu'une attaque dans un passage doux doit peser autant qu'une attaque dans un
 * passage fort — c'est le rapport qui fait l'attaque, pas l'écart.
 *
 * On s'arrête là, sans transformée de Fourier. Le flux spectral distinguerait mieux deux notes
 * de même intensité qui se suivent ; mais il demande une FFT à écrire et à régler, pour un
 * gain qui ne se verrait que sur ce que cette fonction ne sert pas à faire — reconnaître des
 * mesures. Pour recaler une frappe sur l'attaque d'à côté, l'énergie suffit.
 */
export function enveloppeDAttaques(signal: Signal, pasMs = 5, part = 0.02): Enveloppe {
  const niveaux = energies(signal, pasMs)
  const attaques = new Float32Array(niveaux.length)
  const plancher = 1e-6

  /* Une attaque dans le bruit de fond n'en est pas une. Le logarithme, qui rend justice aux
     passages doux, a le défaut de ses qualités : dans le quasi-silence, passer d'un souffle à
     deux souffles est une montée aussi forte qu'une corde qu'on frappe. On ne compte donc que
     les tranches qui sonnent vraiment — le même seuil que pour les bornes du son, relatif au
     plus fort du morceau. */
  let sommet = 0
  for (const niveau of niveaux) sommet = Math.max(sommet, niveau)
  const seuil = sommet * part

  for (let t = 1; t < niveaux.length; t++) {
    if (niveaux[t] < seuil) continue
    const montee = Math.log(niveaux[t] + plancher) - Math.log(niveaux[t - 1] + plancher)
    attaques[t] = Math.max(0, montee)
  }
  return { pasMs, attaques }
}

/**
 * La première et la dernière attaque franche du fichier.
 *
 * C'est à elles qu'on accroche la première et la dernière note de la partition, et non aux
 * bornes du son : la dernière note commence à son attaque, mais le son, lui, continue de
 * résonner après. Accrocher le début d'une note à la fin d'une résonance fausse le tempo de
 * tout le morceau — mesuré sur un enregistrement fabriqué, deux cents millisecondes sur douze
 * secondes, soit près de deux pour cent. Il faut comparer attaque à attaque.
 */
export function attaquesExtremes(
  enveloppe: Enveloppe,
  minimum = 0.25,
): { premiereMs: number; derniereMs: number } | null {
  const { attaques, pasMs } = enveloppe
  const estUnPic = (t: number) =>
    attaques[t] >= minimum &&
    attaques[t] >= attaques[t - 1] &&
    attaques[t] >= (attaques[t + 1] ?? 0)

  let premiere = -1
  for (let t = 1; t < attaques.length; t++) {
    if (estUnPic(t)) {
      premiere = t
      break
    }
  }
  let derniere = -1
  for (let t = attaques.length - 1; t >= 1; t--) {
    if (estUnPic(t)) {
      derniere = t
      break
    }
  }
  if (premiere < 0 || derniere <= premiere) return null
  return { premiereMs: premiere * pasMs, derniereMs: derniere * pasMs }
}

/**
 * L'attaque la plus franche autour d'un instant, ou rien si aucune ne se détache.
 *
 * Deux conditions, et il faut les deux. Le pic doit valoir au moins le double de ce qui se
 * passe d'ordinaire dans la fenêtre — sinon ce n'est pas un pic, c'est le paysage. Et il doit
 * dépasser un plancher absolu, parce qu'un critère seulement relatif se laisse berner par le
 * plat : sur une tenue, le découpage en tranches ne tombe jamais pile sur les périodes du son
 * et laisse une ondulation de quelques pour cent, dont le rapport au reste est aussi bon que
 * celui d'une vraie attaque. Mesuré sur une sinusoïde tenue, cette ondulation vaut trois
 * centièmes là où une note qui entre sur une autre en vaut trois dixièmes.
 *
 * C'est ce qui fait échouer la fonction proprement là où elle doit échouer : sur une tenue,
 * sur un accord plaqué qui dure, sur du silence, il n'y a pas d'attaque à désigner et il vaut
 * mieux rendre la main que déplacer un point vers un sommet de bruit.
 */
export function attaqueLaPlusProche(
  enveloppe: Enveloppe,
  ms: number,
  fenetreMs: number,
  minimum = 0.25,
): number | null {
  const { pasMs, attaques } = enveloppe
  const centre = Math.round(ms / pasMs)
  const rayon = Math.max(1, Math.round(fenetreMs / pasMs))
  const debut = Math.max(1, centre - rayon)
  const fin = Math.min(attaques.length - 1, centre + rayon)
  if (fin <= debut) return null

  let meilleur = debut
  let somme = 0
  for (let t = debut; t <= fin; t++) {
    somme += attaques[t]
    if (attaques[t] > attaques[meilleur]) meilleur = t
  }
  const moyenne = somme / (fin - debut + 1)
  if (attaques[meilleur] < minimum || attaques[meilleur] < 2 * moyenne) return null
  return meilleur * pasMs
}

/**
 * Les mêmes points, posés sur l'attaque voisine quand il y en a une.
 *
 * C'est ce qui efface le temps de réaction et le tremblement de la main : on tape à peu près,
 * et chaque point va se ranger sur ce qui sonne. Un point sans attaque franche à proximité
 * reste où il est — mieux vaut la frappe de quelqu'un que le sommet d'un bruit.
 */
export function recalerSurLesAttaques(
  points: PointCalage[],
  enveloppe: Enveloppe,
  fenetreMs = 150,
): PointCalage[] {
  return points.map((point) => {
    const attaque = attaqueLaPlusProche(enveloppe, point.audioMs, fenetreMs)
    return attaque === null ? point : { ...point, audioMs: attaque }
  })
}
