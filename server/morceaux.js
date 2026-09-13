"use strict";

/**
 * Les opérations sur la bibliothèque, écrites comme des fonctions pures sur l'objet de
 * données : elles reçoivent `data` (ce que renvoie store.readLibrary), le modifient sur
 * place et renvoient `{ ok }` ou `{ ok: false, error }`. C'est store.updateLibrary qui se
 * charge de la lecture et de la sauvegarde autour.
 *
 * L'intérêt de cette séparation est le test : tout ce fichier se vérifie sans disque, sans
 * serveur HTTP et sans navigateur, à partir d'un simple objet littéral.
 */

import crypto from "node:crypto";

/* Le format 16/9 en 1080p est le seul qui ne demande à personne de choisir : c'est ce
   qu'attendent YouTube et Instagram pour une vidéo posée à l'horizontale, et c'est assez
   fin pour qu'une tablature reste lisible sans zoom. Le reste se règle dans l'atelier. */
function reglagesParDefaut(type) {
  const video = {
    largeur: 1920,
    hauteur: 1080,
    fps: 30,
    // Le défilement horizontal plutôt que la page : c'est la disposition qui sert à incruster
    // une tablature dans une vidéo de reprise, et c'est ce pour quoi on vient ici.
    disposition: "defilement",
    theme: "cordes",
    hauteurBande: 0.42,
    // Un tiers de la largeur : assez de passé pour savoir où l'on est, assez d'avenir pour
    // voir venir la mesure suivante. Au milieu, on perd la moitié de l'anticipation.
    teteX: 0.33,
    cadre: "aucun",
    fond: "theme",
    // Rien plutôt qu'une couleur : le curseur prend celle du thème tant que personne n'en a
    // choisi une, et continue de la suivre quand on change de thème.
    couleur: null,
    curseurStyle: "les-deux",
    // Le surlignage situe le temps en cours, le trait vif dit où l'on en est dedans. Trop
    // opaque, il mangerait les chiffres de doigté qu'il est censé désigner.
    opacite: 0.3,
    // Deux secondes avant la première note : le temps de voir où le morceau commence avant
    // qu'il commence, et de poser les doigts si on joue avec la vidéo.
    compteAvantSec: 2,
    fondu: true,
    bandeau: true,
    barreDeProgression: true,
  };

  if (type === "pdf") {
    return {
      video,
      pdf: {
        // Le découpage en systèmes est vide tant que personne n'a ouvert l'atelier : c'est
        // là qu'il est détecté automatiquement puis corrigé à la main.
        systemes: [],
        bpm: 90,
        battementsParMesure: 4,
        mesuresParSysteme: 4,
        decalageMs: 0,
        // Une bande-son facultative, importée à part : un PDF ne contient aucune note au
        // sens où on pourrait la jouer, donc le seul son possible est celui qu'on apporte.
        audio: null,
      },
    };
  }

  return {
    video,
    gp: {
      // -1 : toutes les pistes. C'est le réglage juste pour regarder, mais rarement celui
      // qu'on veut filmer — l'atelier propose de n'en garder qu'une dès l'ouverture.
      piste: -1,
      tempoPct: 100,
      metronome: false,
      // La tablature sans la portée classique : c'est ce qu'on vient chercher ici, et ça
      // double la hauteur utile de l'image.
      afficherPortee: false,
      afficherTablature: true,
    },
  };
}

function trouver(data, id) {
  return data.morceaux.find((m) => m.id === id) ?? null;
}

/* La date de modification sert au tri de la bibliothèque : le morceau sur lequel on
   travaille remonte en tête tout seul, sans avoir à le ranger. */
function toucher(morceau) {
  morceau.modifieLe = new Date().toISOString();
}

function creerMorceau(data, { id, titre, fichier, taille, auteur }) {
  const morceau = {
    id: id ?? crypto.randomUUID(),
    // Le titre vient du nom du fichier, extension retirée : c'est presque toujours le bon,
    // et quand il ne l'est pas il se corrige en un clic dans l'atelier.
    titre: titre || fichier.nom.replace(/\.[^.]+$/, ""),
    artiste: "",
    type: fichier.type,
    fichier: { nom: fichier.nom, ext: fichier.ext, taille },
    auteur,
    creeLe: new Date().toISOString(),
    modifieLe: new Date().toISOString(),
    reglages: reglagesParDefaut(fichier.type),
    video: null,
  };
  data.morceaux.push(morceau);
  return { ok: true, morceau };
}

function renommerMorceau(data, id, { titre, artiste }) {
  const morceau = trouver(data, id);
  if (!morceau) return { ok: false, error: "Morceau introuvable." };
  if (titre !== undefined) morceau.titre = titre || morceau.titre;
  if (artiste !== undefined) morceau.artiste = artiste;
  toucher(morceau);
  return { ok: true, morceau };
}

/* Les réglages sont remplacés en bloc plutôt que fusionnés champ par champ. Le découpage
   en systèmes d'un PDF est une liste : une fusion profonde y ferait réapparaître les
   systèmes qu'on vient justement de supprimer. L'interface tient de toute façon l'objet
   entier en mémoire, elle n'a rien à gagner à n'en renvoyer qu'un morceau. */
function enregistrerReglages(data, id, reglages) {
  const morceau = trouver(data, id);
  if (!morceau) return { ok: false, error: "Morceau introuvable." };
  morceau.reglages = reglages;
  toucher(morceau);
  return { ok: true, morceau };
}

function attacherVideo(data, id, video) {
  const morceau = trouver(data, id);
  if (!morceau) return { ok: false, error: "Morceau introuvable." };
  morceau.video = { ...video, creeLe: new Date().toISOString() };
  toucher(morceau);
  return { ok: true, morceau };
}

function detacherVideo(data, id) {
  const morceau = trouver(data, id);
  if (!morceau) return { ok: false, error: "Morceau introuvable." };
  const ancienne = morceau.video;
  morceau.video = null;
  toucher(morceau);
  return { ok: true, morceau, ancienne };
}

/* La suppression renvoie ce qu'il reste à effacer sur le disque plutôt que de s'en
   charger : ce fichier ne connaît pas les chemins, et c'est ce qui permet de le tester
   sans rien écrire nulle part. */
function supprimerMorceau(data, id) {
  const morceau = trouver(data, id);
  if (!morceau) return { ok: false, error: "Morceau introuvable." };
  data.morceaux = data.morceaux.filter((m) => m.id !== id);
  return {
    ok: true,
    fichiers: {
      source: { id: morceau.id, ext: morceau.fichier.ext },
      video: morceau.video ? { id: morceau.id, ext: morceau.video.ext } : null,
    },
  };
}

export {
  attacherVideo,
  creerMorceau,
  detacherVideo,
  enregistrerReglages,
  reglagesParDefaut,
  renommerMorceau,
  supprimerMorceau,
  trouver,
};
