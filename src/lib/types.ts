export interface SafeUser {
  id: string
  username: string
  admin: boolean
  createdAt: string
}

export interface Invite {
  code: string
  createdAt: string
  expiresAt: string
}

/** Deux mondes qui ne se ressemblent pas. Une tablature Guitar Pro sait où sont ses notes
 *  et à quel moment elles sonnent ; un PDF n'est qu'une image, et tout son minutage doit
 *  lui être apporté de l'extérieur. Presque tout l'atelier découle de cette différence. */
export type TypeMorceau = 'gp' | 'pdf'

/**
 * Comment la partition traverse l'image.
 *
 * Les deux premières donnent la même bande horizontale et ne diffèrent que par ce qui bouge.
 * En « defilement », c'est la tablature : elle glisse sous une tête de lecture fixe, et le
 * regard n'a plus qu'à attendre que la musique arrive. En « mesures », c'est le curseur : la
 * tablature reste immobile le temps de quelques mesures, puis la page tourne. La première se
 * regarde, la seconde se lit — sur une tablature serrée, un chiffre qui glisse se suit mais
 * ne se déchiffre pas.
 */
export type Disposition = 'page' | 'defilement' | 'mesures'

export type Cadre = 'aucun' | 'carte' | 'lueur' | 'vignette' | 'bandes'

/**
 * Ce que le curseur montre.
 *
 * Les deux disent la même chose de deux façons, et sur une tablature serrée ils se gênent :
 * le trait tombe au milieu du temps qu'on vient de surligner. D'où le choix — le trait seul
 * pour suivre l'instant exact, le surlignage seul pour lire le temps en cours comme sur une
 * partition annotée, les deux quand la vidéo est regardée de loin.
 */
export type StyleCurseur = 'trait' | 'surlignage' | 'les-deux'

/** Ce qu'il y a derrière la partition quand la vidéo doit être incrustée ailleurs. */
export type FondVideo = 'theme' | 'chroma' | 'transparent'

/**
 * Ce que l'image exportée contient.
 *
 * « image » garde le format annoncé — du 1080p où la bande flotte au milieu. « bande » réduit
 * la hauteur de la vidéo à celle de la bande : le fichier ne contient plus que la tablature,
 * il pèse ce qu'il montre, et il se pose au montage sans avoir à deviner où est le vide.
 */
export type Cadrage = 'image' | 'bande'

export interface ReglagesVideo {
  largeur: number
  hauteur: number
  fps: number
  /**
   * « page » : la partition défile verticalement, le curseur parcourt chaque ligne.
   * « defilement » : une seule bande horizontale glisse sous une tête de lecture fixe.
   * C'est la seconde qu'on veut pour incruster la tablature dans une vidéo de reprise —
   * elle tient dans un bandeau, et le regard n'a jamais à changer d'endroit.
   */
  disposition: Disposition
  theme: string
  /**
   * Combien de mesures tiennent à l'écran, en mode défilement. C'est ce réglage qui décide
   * du zoom — et donc, par ricochet, de la hauteur de la bande.
   */
  mesuresVisibles: number
  /**
   * Air laissé au-dessus et en dessous de la tablature, en fraction de sa hauteur. C'est de la
   * mise en page, pas une contrainte : le recadrage, lui, garde déjà ce qu'il ne faut pas
   * couper. Une tablature collée au bord de sa bande étouffe, et sur une incrustation elle se
   * confond avec ce qui passe derrière.
   */
  margeBande: number
  /** Plafond de hauteur de la bande, en fraction de l'image. N'agit que s'il est atteint. */
  hauteurMax: number
  /** Où se tient la tête de lecture, en fraction de largeur (mode défilement). */
  teteX: number
  /**
   * Mesures montrées en avance, en mode « mesures ».
   *
   * Elles occupent la fin de la fenêtre et rouvrent la suivante : on les a donc lues une fois
   * avant d'avoir à les jouer. Sans elles, chaque tournement de page livre du tout-inconnu au
   * moment précis où il faudrait déjà savoir quoi faire.
   */
  anticipation: number
  cadre: Cadre
  cadrage: Cadrage
  fond: FondVideo
  /**
   * Couleur du curseur, ou `null` pour prendre celle du thème.
   *
   * Le `null` est le point important : sans lui, il faudrait deviner si la couleur en place
   * a été choisie ou seulement héritée, et la seule façon de deviner — la chercher dans la
   * palette — se trompe dès qu'un thème propose une teinte qui n'y figure pas. Une valeur
   * absente ne peut pas, elle, se désynchroniser de son thème.
   */
  couleur: string | null
  /** Le trait à l'instant exact, le surlignage du temps en cours, ou les deux. */
  curseurStyle: StyleCurseur
  opacite: number
  compteAvantSec: number
  fondu: boolean
  bandeau: boolean
  barreDeProgression: boolean
}

export interface ReglagesGp {
  /** -1 pour toutes les pistes. */
  piste: number
  tempoPct: number
  metronome: boolean
  afficherPortee: boolean
  afficherTablature: boolean
}

/** Un système, c'est une ligne de tablature sur la page — les six cordes qui se lisent
 *  de gauche à droite avant de revenir à la ligne. Les coordonnées sont des fractions de
 *  la page (0 à 1) et non des pixels : le PDF est réaffiché à toutes les tailles, de
 *  l'aperçu à l'écran jusqu'au rendu 1080p, et une fraction reste juste partout. */
export interface SystemePdf {
  page: number
  x0: number
  y0: number
  x1: number
  y1: number
  mesures: number
}

export interface FichierJoint {
  nom: string
  ext: string
  taille: number
}

export interface ReglagesPdf {
  systemes: SystemePdf[]
  bpm: number
  battementsParMesure: number
  mesuresParSysteme: number
  decalageMs: number
  audio: FichierJoint | null
}

export interface Reglages {
  video: ReglagesVideo
  gp?: ReglagesGp
  pdf?: ReglagesPdf
}

export interface VideoProduite {
  ext: string
  taille: number
  dureeMs: number
  creeLe: string
}

export interface Morceau {
  id: string
  titre: string
  artiste: string
  type: TypeMorceau
  fichier: FichierJoint
  auteur: string
  creeLe: string
  modifieLe: string
  reglages: Reglages
  video: VideoProduite | null
}

export interface Bibliotheque {
  morceaux: Morceau[]
  users?: SafeUser[]
}
