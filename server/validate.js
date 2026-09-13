"use strict";

/**
 * Validation des entrées de l'API.
 *
 * Tout ce qui arrive du navigateur repasse par ici avant de toucher le disque. Chaque
 * fonction renvoie soit `{ ok: true, value }` avec la valeur nettoyée, soit
 * `{ ok: false, error }` avec un message en français destiné à être affiché tel quel :
 * une erreur que l'on comprend vaut mieux qu'un 400 muet, et évite d'avoir à tenir deux
 * catalogues de messages, un côté serveur et un côté interface.
 */

// Les formats qu'alphaTab sait lire, plus le PDF qui est traité à part. La valeur est le
// type de morceau qui en découle : c'est lui qui décide de tout l'atelier derrière.
const FORMATS = {
  ".gp": "gp",
  ".gp3": "gp",
  ".gp4": "gp",
  ".gp5": "gp",
  ".gpx": "gp",
  ".musicxml": "gp",
  ".mxl": "gp",
  ".xml": "gp",
  ".capx": "gp",
  ".alphatab": "gp",
  ".atex": "gp",
  ".pdf": "pdf",
};

const EXTENSIONS = Object.keys(FORMATS);

const TAILLE_SOURCE_MAX = 40 * 1024 * 1024;
const TAILLE_REGLAGES_MAX = 400_000;

function validateId(value, label = "L'identifiant") {
  const id = String(value ?? "").trim();
  if (!id) return { ok: false, error: `${label} est manquant.` };
  // Les identifiants sont des UUID générés par le serveur : tout ce qui n'y ressemble pas
  // vient d'ailleurs, et il n'y a aucune raison d'aller le chercher dans un nom de fichier.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: false, error: `${label} est invalide.` };
  }
  return { ok: true, value: id };
}

function validateTexte(value, label, max = 120, { obligatoire = false } = {}) {
  if (value === undefined || value === null) {
    if (obligatoire) return { ok: false, error: `${label} est manquant.` };
    return { ok: true, value: "" };
  }
  if (typeof value !== "string") return { ok: false, error: `${label} doit être du texte.` };
  // Les caractères de contrôle n'ont rien à faire dans un titre : ils ne s'affichent pas,
  // mais ils cassent aussi bien un nom de fichier téléchargé qu'un en-tête HTTP.
  // oxlint-disable-next-line no-control-regex -- c'est précisément ce qu'on chasse ici.
  const texte = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (obligatoire && !texte) return { ok: false, error: `${label} est vide.` };
  if (texte.length > max) return { ok: false, error: `${label} est trop long (${max} max).` };
  return { ok: true, value: texte };
}

/* Le nom du fichier n'est gardé que pour l'affichage et pour le retéléchargement : le
   nom sur le disque, lui, vient de l'identifiant du morceau (voir store.sourcePath).
   Seule l'extension a une conséquence réelle, puisque c'est elle qui désigne le format. */
function validateNomFichier(value) {
  const brut = validateTexte(value, "Le nom du fichier", 200, { obligatoire: true });
  if (!brut.ok) return brut;
  // Un navigateur n'envoie normalement que le nom, mais une API s'utilise aussi à la main :
  // on ne garde que la dernière composante, quel que soit le séparateur employé.
  const nom = brut.value.split(/[\\/]/).pop() ?? "";
  const point = nom.lastIndexOf(".");
  const ext = point === -1 ? "" : nom.slice(point).toLowerCase();
  if (!FORMATS[ext]) {
    return {
      ok: false,
      error: `Format non reconnu (${ext || "sans extension"}). Attendu : ${EXTENSIONS.join(", ")}.`,
    };
  }
  return { ok: true, value: { nom, ext, type: FORMATS[ext] } };
}

/* Les réglages sont un objet JSON libre, volontairement : ils décrivent le découpage
   d'une partition en systèmes, une carte de tempo, une couleur de curseur — un contenu
   dont la forme bouge à chaque idée nouvelle, et qu'un schéma figé côté serveur ferait
   payer deux fois. Le serveur ne les interprète jamais ; il vérifie seulement qu'ils
   sont sérialisables et qu'ils tiennent dans une taille raisonnable, pour qu'un bug de
   l'interface ne puisse pas faire gonfler le fichier de la bibliothèque sans fin. */
function validateReglages(value) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "Les réglages doivent être un objet." };
  }
  let json;
  try {
    json = JSON.stringify(value);
  } catch {
    return { ok: false, error: "Les réglages ne sont pas sérialisables." };
  }
  if (json.length > TAILLE_REGLAGES_MAX) {
    return { ok: false, error: "Les réglages sont trop volumineux." };
  }
  return { ok: true, value: JSON.parse(json) };
}

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Corps de requête invalide." };
  }
  return { ok: true, value: body };
}

function validateDuree(value) {
  if (value === undefined || value === null || value === "") return { ok: true, value: 0 };
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return { ok: false, error: "Durée invalide." };
  // Douze heures : bien au-delà de tout morceau, mais assez bas pour qu'une valeur
  // aberrante venue d'un calcul raté soit refusée plutôt que stockée.
  if (ms > 12 * 3600 * 1000) return { ok: false, error: "Durée invalide." };
  return { ok: true, value: Math.round(ms) };
}

export {
  EXTENSIONS,
  FORMATS,
  TAILLE_SOURCE_MAX,
  validateBody,
  validateDuree,
  validateId,
  validateNomFichier,
  validateReglages,
  validateTexte,
};
