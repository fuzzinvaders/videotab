/**
 * Découper la partition en fenêtres de mesures entières.
 *
 * Le défilement continu a un défaut que la mesure ne dit pas : tout bouge en permanence.
 * L'œil suit un chiffre qui glisse au lieu de le lire, et sur une tablature serrée il n'a
 * jamais le temps de se poser. L'alternative est aussi vieille que le papier — on affiche
 * quelques mesures, elles restent immobiles, seul le curseur les traverse, et on tourne la
 * page à la fin. C'est la lecture d'une partition plutôt que celle d'un instrument.
 *
 * Deux règles gouvernent le découpage, et elles ne sont pas négociables :
 *
 *  - **Une mesure n'est jamais coupée.** On en met donc autant qu'il en entre, et pas un
 *    nombre décidé d'avance : alphaTab donne à chaque mesure la largeur que son contenu
 *    réclame, et exiger quatre mesures à tout prix reviendrait à en rogner une sur deux.
 *    Le réglage « mesures à l'écran » garde son rôle — il fixe le zoom — mais c'est la
 *    largeur réelle qui décide du compte, fenêtre par fenêtre.
 *
 *  - **On voit venir la suite.** Les dernières mesures d'une fenêtre sont montrées en avance
 *    et redeviennent les premières de la suivante. Tourner la page sur du tout-inconnu est
 *    précisément le moment où l'on décroche ; les avoir déjà lues une fois change tout.
 *
 * « Affichée » se compte comme l'œil le fait, et non comme le pavage : la bande est dessinée
 * sur toute la largeur, si bien que la mesure qui déborde à droite se voit quand même, et
 * souvent presque en entier. Elle compte dès qu'on en voit plus de la moitié. Sans cela, on
 * en montrait cinq et on tournait la page à la quatrième — mesuré, le curseur n'atteignait
 * que 57 à 72 % de la largeur avant que tout change.
 *
 * La fenêtre n'avance qu'en avant, jamais en arrière : elle se déduit de la seule position
 * du curseur, sans mémoire, ce qui permet de se déplacer n'importe où dans le morceau et
 * d'obtenir la même image qu'en l'ayant joué depuis le début.
 */

/**
 * Quelle largeur donner à la fenêtre pour que le compte demandé y entre vraiment.
 *
 * La largeur médiane d'une mesure suffit à régler un zoom en défilement continu : une mesure
 * un peu large arrive simplement un peu plus tard, personne ne le remarque. Ici elle ne
 * suffit plus. La fenêtre ne montre que des mesures entières, donc une mesure qui déborde
 * n'est pas rognée — elle est repoussée à la fenêtre suivante, et demander quatre mesures en
 * affiche trois. Mesuré sur une vraie tablature : des mesures de 166 à 243 pixels pour une
 * médiane de 224, et quatre d'entre elles dépassent la fenêtre une fois sur deux.
 *
 * On mesure donc ce qu'on veut vraiment savoir — la largeur qu'occupent `parEcran` mesures
 * consécutives, partout dans le morceau — et on prend le troisième quartile. Pas le maximum :
 * la première mesure porte la clef, l'armure et l'accordage, et laisser ce cas unique
 * commander le zoom rapetisserait tout le reste du morceau pour rien.
 */
export function largeurPourTenir(barres: number[], parEcran: number): number {
  const mesures = barres.length - 1
  const compte = Math.max(1, Math.round(parEcran))
  if (mesures < 1) return 0

  const groupes: number[] = []
  for (let i = 0; i + compte <= mesures; i++) groupes.push(barres[i + compte] - barres[i])
  // Un morceau plus court que la fenêtre : il tient tout entier, et c'est la réponse.
  if (groupes.length === 0) return barres[mesures] - barres[0]

  groupes.sort((a, b) => a - b)
  return groupes[Math.min(groupes.length - 1, Math.floor(groupes.length * 0.75))]
}

export interface Blocs {
  /** Abscisse du bord gauche de la fenêtre où tombe ce point du repère partition. */
  gaucheA(x: number): number
  /** Bord gauche de chaque fenêtre, dans l'ordre. */
  debuts: number[]
}

export interface DemandeBlocs {
  /**
   * Les barres de mesure, abscisses croissantes dans le repère de la partition : **une de
   * plus que le nombre de mesures**, la dernière fermant la dernière mesure. Vide ou trop
   * courte, on retombe sur un pavage régulier.
   */
  barres: number[]
  /** Largeur de la fenêtre, dans le repère de la partition. */
  largeurFenetre: number
  /** Mesures montrées en avance, reprises au début de la fenêtre suivante. */
  anticipation: number
}

export function decouperEnBlocs(d: DemandeBlocs): Blocs {
  const largeur = Math.max(1, d.largeurFenetre)
  const barres = d.barres.filter((x) => Number.isFinite(x))

  /* Sans barres de mesure — une feuille dont personne ne sait où sont les mesures — on pave
     régulièrement. C'est moins bon, puisque la coupe tombe où elle veut, mais ça reste
     préférable à un défilement dont on n'a pas voulu. */
  if (barres.length < 2) {
    return {
      debuts: [],
      gaucheA: (x) => Math.max(0, Math.floor(x / largeur) * largeur),
    }
  }

  const mesures = barres.length - 1
  const anticipation = Math.max(0, Math.min(mesures - 1, Math.round(d.anticipation)))

  const premieres: number[] = []
  let debut = 0
  for (;;) {
    premieres.push(debut)

    /* Au moins une mesure, même si elle déborde : une mesure plus large que la fenêtre
       existe — la première d'une partition porte la clef, l'armure et l'accordage — et
       refuser de l'afficher bloquerait le morceau à sa première barre. */
    let fin = debut + 1
    while (fin < mesures && barres[fin + 1] - barres[debut] <= largeur) fin++

    /* La mesure suivante déborde à droite, mais la bande est dessinée sur toute la largeur :
       on en voit donc une partie, et souvent presque tout. Ne pas la compter revenait à
       tourner la page une mesure trop tôt — l'œil en voyait cinq et la page tournait à la
       quatrième, curseur aux deux tiers de l'écran seulement. Elle compte dès qu'on en voit
       plus de la moitié : c'est celle que l'œil compte, et c'est sur elle qu'il attend la
       page. */
    if (fin < mesures) {
      const visible = largeur - (barres[fin] - barres[debut])
      const entiere = barres[fin + 1] - barres[fin]
      if (entiere > 0 && visible > entiere / 2) fin++
    }

    /* La dernière mesure est déjà dans cette fenêtre-ci : tourner encore la page ne
       montrerait que ce qu'on vient de lire, décalé à gauche. On s'arrête là. */
    if (fin >= mesures) break

    // Reculer du nombre de mesures d'avance, sans jamais faire du surplace.
    let suivant = Math.max(debut + 1, fin - anticipation)

    /* La fenêtre suivante doit s'ouvrir sur une mesure dont on voit déjà le début. Sans cette
       garde, demander zéro mesure d'avance ferait tourner la page sur la mesure d'après celle
       qui dépasse — le curseur serait alors sorti par la droite avant que l'image change. */
    while (suivant > debut + 1 && barres[suivant] >= barres[debut] + largeur) suivant--

    debut = suivant
  }

  const debuts = premieres.map((i) => barres[i])

  return {
    debuts,
    gaucheA(x) {
      // Recherche du dernier début qui ne dépasse pas x : les fenêtres se suivent, donc
      // celle-là est bien celle qui contient le point.
      let bas = 0
      let haut = debuts.length - 1
      while (bas < haut) {
        const milieu = (bas + haut + 1) >> 1
        if (debuts[milieu] <= x) bas = milieu
        else haut = milieu - 1
      }
      return debuts[bas]
    },
  }
}
