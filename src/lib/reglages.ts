import { THEME_PAR_DEFAUT } from './themes'
import type { Reglages, ReglagesVideo, TypeMorceau } from './types'

/**
 * Les réglages complétés, champ manquant par champ manquant.
 *
 * Le serveur garde les réglages comme un objet JSON libre — c'est ce qui permet d'ajouter une
 * disposition ou un thème sans migration ni numéro de version. La contrepartie est qu'un
 * morceau importé avant cet ajout arrive sans ces champs, et qu'un réglage `undefined` se
 * propage très loin avant de produire une erreur incompréhensible (une largeur de bande NaN
 * donne une échelle NaN, donc une image vide, et rien ne dit pourquoi).
 *
 * Tout ce qui vient du serveur passe donc par ici, une fois, à l'entrée de l'atelier.
 */

export function videoParDefaut(): ReglagesVideo {
  return {
    largeur: 1920,
    hauteur: 1080,
    fps: 30,
    // Le défilement horizontal par défaut : c'est la disposition qui sert à incruster une
    // tablature dans une vidéo de reprise, et c'est de loin l'usage le plus fréquent.
    disposition: 'defilement',
    theme: THEME_PAR_DEFAUT,
    // Quatre mesures : assez pour voir venir la phrase, assez peu pour lire les chiffres.
    mesuresVisibles: 4,
    // Un tiers de la hauteur de la tablature de chaque côté : de quoi la décoller du bord sans
    // que la bande cesse d'être un bandeau.
    margeBande: 0.35,
    // Un plafond, pas une cible : la bande est aussi courte que la tablature le permet, et
    // cette valeur ne sert qu'à l'empêcher de manger l'image sur une partition très haute.
    hauteurMax: 0.45,
    // Un tiers de la largeur : assez de passé pour comprendre où l'on est, assez d'avenir
    // pour voir venir la mesure suivante. Au milieu, on perd la moitié de l'anticipation.
    teteX: 0.33,
    // Une mesure d'avance : de quoi lire ce qui vient sans que la fenêtre tourne pour si peu.
    anticipation: 1,
    cadre: 'aucun',
    // Trois pixels sur une image de 1920 : un filet qu'on voit sans qu'il prenne la vedette.
    epaisseurCadre: 3,
    // L'image entière par défaut : c'est le format qu'on attend d'une vidéo, et le cadrage sur
    // la bande ne prend son sens qu'une fois qu'on sait qu'on va l'incruster.
    cadrage: 'image',
    fond: 'theme',
    // Rien plutôt qu'une couleur : le curseur prend celle du thème tant que personne n'en a
    // choisi une, et continue de la suivre à chaque changement de thème.
    couleur: null,
    curseurStyle: 'les-deux',
    opacite: 0.3,
    compteAvantSec: 2,
    fondu: true,
    bandeau: true,
    barreDeProgression: true,
  }
}

function nombre(valeur: unknown, defaut: number, min: number, max: number): number {
  const n = Number(valeur)
  if (!Number.isFinite(n)) return defaut
  return Math.min(max, Math.max(min, n))
}

function parmi<T extends string>(valeur: unknown, valeurs: readonly T[], defaut: T): T {
  return valeurs.includes(valeur as T) ? (valeur as T) : defaut
}

export function completerVideo(video: Partial<ReglagesVideo> | undefined): ReglagesVideo {
  const d = videoParDefaut()
  if (!video) return d
  return {
    largeur: nombre(video.largeur, d.largeur, 320, 3840),
    hauteur: nombre(video.hauteur, d.hauteur, 320, 3840),
    fps: nombre(video.fps, d.fps, 12, 60),
    disposition: parmi(video.disposition, ['page', 'defilement', 'mesures'] as const, d.disposition),
    theme: typeof video.theme === 'string' ? video.theme : d.theme,
    mesuresVisibles: nombre(video.mesuresVisibles, d.mesuresVisibles, 1, 32),
    margeBande: nombre(video.margeBande, d.margeBande, 0, 1.5),
    hauteurMax: nombre(video.hauteurMax, d.hauteurMax, 0.1, 0.95),
    teteX: nombre(video.teteX, d.teteX, 0.08, 0.7),
    anticipation: nombre(video.anticipation, d.anticipation, 0, 8),
    cadre: parmi(video.cadre, ['aucun', 'carte', 'lueur', 'vignette', 'bandes'] as const, d.cadre),
    epaisseurCadre: nombre(video.epaisseurCadre, d.epaisseurCadre, 0, 24),
    cadrage: parmi(video.cadrage, ['image', 'bande'] as const, d.cadrage),
    fond: parmi(video.fond, ['theme', 'chroma', 'transparent'] as const, d.fond),
    couleur: typeof video.couleur === 'string' ? video.couleur : null,
    curseurStyle: parmi(
      video.curseurStyle,
      ['trait', 'surlignage', 'les-deux'] as const,
      d.curseurStyle,
    ),
    opacite: nombre(video.opacite, d.opacite, 0, 0.9),
    compteAvantSec: nombre(video.compteAvantSec, d.compteAvantSec, 0, 12),
    fondu: video.fondu ?? d.fondu,
    bandeau: video.bandeau ?? d.bandeau,
    barreDeProgression: video.barreDeProgression ?? d.barreDeProgression,
  }
}

export function completerReglages(reglages: Reglages | undefined, type: TypeMorceau): Reglages {
  const video = completerVideo(reglages?.video)

  if (type === 'pdf') {
    const pdf = reglages?.pdf
    return {
      video,
      pdf: {
        systemes: Array.isArray(pdf?.systemes) ? pdf.systemes : [],
        bpm: nombre(pdf?.bpm, 90, 20, 300),
        battementsParMesure: nombre(pdf?.battementsParMesure, 4, 1, 16),
        mesuresParSysteme: nombre(pdf?.mesuresParSysteme, 4, 1, 64),
        decalageMs: nombre(pdf?.decalageMs, 0, 0, 60_000),
        audio: pdf?.audio ?? null,
      },
    }
  }

  const gp = reglages?.gp
  return {
    video,
    gp: {
      piste: nombre(gp?.piste, -1, -1, 64),
      tempoPct: nombre(gp?.tempoPct, 100, 40, 150),
      metronome: gp?.metronome ?? false,
      afficherPortee: gp?.afficherPortee ?? false,
      afficherTablature: gp?.afficherTablature ?? true,
    },
  }
}
