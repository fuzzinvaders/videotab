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

/** Comment la partition traverse l'image. */
export type Disposition = 'page' | 'defilement'

export type Cadre = 'aucun' | 'carte' | 'lueur' | 'vignette' | 'bandes'

/** Ce qu'il y a derrière la partition quand la vidéo doit être incrustée ailleurs. */
export type FondVideo = 'theme' | 'chroma' | 'transparent'

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
  /** Part de la hauteur de l'image occupée par la bande, en mode défilement. */
  hauteurBande: number
  /** Où se tient la tête de lecture, en fraction de largeur (mode défilement). */
  teteX: number
  cadre: Cadre
  fond: FondVideo
  couleur: string
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
