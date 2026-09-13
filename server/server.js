#!/usr/bin/env node
"use strict";

/**
 * Videotab — serveur auto-hébergé, sans dépendance.
 * Copyright (C) 2026 fuzzinvaders
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Statique     : dist/ (build Vite), avec repli SPA vers index.html.
 * Comptes      : GET /api/session, POST /api/setup (une seule fois), POST /api/register
 *                (sur invitation), POST /api/login, /api/logout, /api/password
 * Communauté   : GET /api/users, GET/POST /api/invites, POST /api/invites/revoke,
 *                POST /api/users/delete — réservés à l'administrateur
 * Bibliothèque : GET /api/morceaux, POST /api/morceaux (envoi brut de la tablature),
 *                PATCH/DELETE /api/morceaux/:id, PUT /api/morceaux/:id/reglages
 * Fichiers     : GET /api/morceaux/:id/source, PUT/GET/DELETE /api/morceaux/:id/video,
 *                PUT/GET/DELETE /api/morceaux/:id/audio
 * Santé        : GET /healthz — jamais protégé (utilisé par le HEALTHCHECK Docker)
 *
 * Environnement : PORT, HOST, DATA_DIR, AUTH_SECRET, ORIGIN, VIDEO_MAX_MB
 *
 * Une remarque sur le partage des rôles : le serveur ne lit aucune tablature, ne dessine
 * aucune portée et n'encode aucune vidéo. Tout cela se passe dans le navigateur, qui a
 * déjà un moteur de rendu, un synthétiseur et un encodeur vidéo — trois choses qu'il
 * faudrait autrement installer sur l'hôte. Le serveur garde les fichiers et les comptes,
 * c'est-à-dire exactement ce qu'un onglet fermé ne sait pas garder.
 */

import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";
import {
  attacherVideo,
  creerMorceau,
  detacherVideo,
  enregistrerReglages,
  renommerMorceau,
  supprimerMorceau,
  trouver,
} from "./morceaux.js";
import {
  TAILLE_SOURCE_MAX,
  validateBody,
  validateDuree,
  validateId,
  validateNomFichier,
  validateReglages,
  validateTexte,
} from "./validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DIST_DIR = path.join(__dirname, "..", "dist");
// Non défini par défaut : le serveur ne peut pas deviner de façon fiable l'origine vue par
// le navigateur (port hôte différent du port interne avec Docker, proxy de dev Vite sur un
// autre port, etc.). Ne renseigner ORIGIN que pour un déploiement derrière un reverse
// proxy — la vérification anti-CSRF ci-dessous s'active alors automatiquement.
const CONFIGURED_ORIGIN = process.env.ORIGIN || null;
const COOKIE_NAME = "videotab_session";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 jours
const MAX_BODY_BYTES = 500_000;
// Une minute de 1080p en VP9 pèse une quinzaine de mégaoctets ; 512 laisse donc passer un
// morceau très long sans qu'un envoi parti de travers puisse remplir le disque.
const VIDEO_MAX_BYTES = Number(process.env.VIDEO_MAX_MB || 512) * 1024 * 1024;
const AUDIO_MAX_BYTES = 60 * 1024 * 1024;

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".sf2": "application/octet-stream",
  ".sf3": "application/octet-stream",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".pdf": "application/pdf",
};

// ---- Utilitaires requête/réponse ----

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function setSessionCookie(res, userId) {
  const token = store.signSession(userId, store.getSessionSecret(), MAX_AGE_SEC);
  const secure = Boolean(CONFIGURED_ORIGIN && CONFIGURED_ORIGIN.startsWith("https://"));
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const uid = store.verifySession(token, store.getSessionSecret());
  if (!uid) return null;
  const user = store.findById(uid);
  return user ? store.toSafeUser(user) : null;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

/* Les fichiers arrivent en corps brut, pas en multipart : l'interface n'envoie jamais
   qu'un fichier à la fois, et écrire un analyseur multipart correct sans dépendance pour
   ce seul besoin serait beaucoup de code délicat pour rien. Le nom voyage en paramètre
   d'URL, où il est de toute façon validé.

   L'écriture va directement sur le disque, morceau par morceau : une vidéo de plusieurs
   centaines de mégaoctets n'a aucune raison de transiter d'abord par la mémoire du
   serveur, qui tourne peut-être sur un NAS à un gigaoctet de RAM. Comme partout ailleurs,
   on écrit dans un .tmp et on renomme à la fin — un envoi interrompu ne laisse alors pas
   une vidéo tronquée à la place de la précédente, qui marchait. */
function receiveFile(req, target, maxBytes) {
  return new Promise((resolve, reject) => {
    store.ensureDir(path.dirname(target));
    const tmp = `${target}.tmp`;
    const out = fs.createWriteStream(tmp);
    let size = 0;
    let refuse = null;

    function abandon(err) {
      refuse = err;
      req.destroy();
      out.destroy();
      store.removeQuietly(tmp);
      reject(err);
    }

    req.on("data", (chunk) => {
      if (refuse) return;
      size += chunk.length;
      if (size > maxBytes) abandon(new Error("payload too large"));
    });
    req.on("error", (err) => {
      if (!refuse) abandon(err);
    });
    out.on("error", (err) => {
      if (!refuse) abandon(err);
    });
    out.on("finish", () => {
      if (refuse) return;
      if (size === 0) {
        store.removeQuietly(tmp);
        reject(new Error("empty body"));
        return;
      }
      try {
        fs.renameSync(tmp, target);
        resolve({ taille: size });
      } catch (err) {
        store.removeQuietly(tmp);
        reject(err);
      }
    });

    req.pipe(out);
  });
}

/* Le navigateur redemande volontiers des morceaux d'une vidéo quand on déplace le curseur
   de lecture, et refuse tout bonnement de le laisser déplacer si le serveur ne sait pas
   répondre à un Range. Trente lignes pour que la relecture d'un export se comporte comme
   n'importe quelle vidéo, c'est un bon marché. */
function sendFile(req, res, file, { type, download }) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return sendJson(res, 404, { error: "Fichier introuvable." });
  }

  const headers = {
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=0, must-revalidate",
  };
  if (download) {
    // Le nom part en RFC 5987 : un titre français a toutes les chances de porter un accent,
    // et un en-tête HTTP ne transporte pas d'octets non-ASCII sans cet encodage.
    const ascii = download.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
    headers["content-disposition"] =
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(download)}`;
  }

  const range = req.headers.range;
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null;
  if (match && (match[1] || match[2])) {
    let debut = match[1] ? Number(match[1]) : null;
    let fin = match[2] ? Number(match[2]) : null;
    if (debut === null) {
      // « bytes=-500 » : les cinq cents derniers octets.
      debut = Math.max(0, stat.size - (fin ?? 0));
      fin = stat.size - 1;
    } else if (fin === null || fin >= stat.size) {
      fin = stat.size - 1;
    }
    if (debut > fin || debut >= stat.size) {
      res.writeHead(416, { "content-range": `bytes */${stat.size}` });
      return res.end();
    }
    headers["content-range"] = `bytes ${debut}-${fin}/${stat.size}`;
    headers["content-length"] = fin - debut + 1;
    res.writeHead(206, headers);
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(file, { start: debut, end: fin }).pipe(res);
  }

  headers["content-length"] = stat.size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  return fs.createReadStream(file).pipe(res);
}

// Protection CSRF minimale, active seulement si ORIGIN est configuré (déploiement derrière
// un reverse proxy) : sur une requête d'écriture porteuse d'un en-tête Origin, celui-ci
// doit alors correspondre. Sans ORIGIN configuré, le contrôle est désactivé — le cookie de
// session (HttpOnly + SameSite=Lax) reste la protection de base en local/dev.
function originIsAllowed(req) {
  if (!CONFIGURED_ORIGIN) return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === CONFIGURED_ORIGIN;
}

// Freine les tentatives de connexion en rafale. Volontairement en mémoire : remis à zéro au
// redémarrage, ce qui suffit pour une instance personnelle et évite d'écrire sur le disque
// à chaque échec. Derrière un reverse proxy, X-Forwarded-For porte l'IP réelle du visiteur.
const loginAttempts = new Map();

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "inconnu";
}

function loginIsThrottled(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginFailure(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() - entry.first > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, first: Date.now() });
    return;
  }
  entry.count += 1;
}

// ---- Fichiers statiques (build Vite) avec repli SPA ----

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  let filePath = path.join(DIST_DIR, urlPath === "/" ? "index.html" : urlPath);

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(400);
    res.end();
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, "index.html");
  }

  const ext = path.extname(filePath);
  const servedPath = filePath;
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      // Longueur explicite plutôt qu'un envoi par morceaux : l'enregistrement d'un service
      // worker est plus exigeant que le chargement d'une page ordinaire sur la forme de la
      // réponse, et c'est le fichier dont dépend l'installation de la PWA.
      "content-length": data.length,
      "cache-control": cacheControlFor(servedPath),
    });
    res.end(data);
  });
}

function cacheControlFor(filePath) {
  const name = path.basename(filePath);
  // Le service worker et la page d'entrée doivent être revalidés à chaque fois, sinon une
  // nouvelle version reste invisible tant que le cache du navigateur n'a pas expiré.
  if (name === "sw.js" || name === "index.html" || name === "manifest.webmanifest") {
    return "no-cache";
  }
  // Le reste du build porte une empreinte dans son nom : le contenu ne change jamais.
  if (filePath.startsWith(path.join(DIST_DIR, "assets"))) {
    return "public, max-age=31536000, immutable";
  }
  // La police musicale et la banque de sons ne portent pas d'empreinte mais ne changent
  // qu'avec la version d'alphaTab. Une journée évite de retélécharger huit mégaoctets à
  // chaque ouverture sans figer pour autant une mise à jour.
  if (name.endsWith(".sf2") || name.endsWith(".sf3") || /\.(woff2?|ttf|otf|eot)$/.test(name)) {
    return "public, max-age=86400";
  }
  return "public, max-age=3600";
}

// ---- Routes API ----

/* Toutes les écritures de la bibliothèque suivent la même chorégraphie : valider, muter,
   sauvegarder, renvoyer la bibliothèque entière. La renvoyer en entier plutôt que la seule
   ligne touchée coûte quelques kilo-octets et évite qu'un onglet resté ouvert sur la liste
   affiche un morceau qu'un autre vient de supprimer. */
function applyLibrary(res, mutate) {
  const result = store.updateLibrary(mutate);
  if (result.ok === false) return sendJson(res, 400, { error: result.error });
  // « morceau » est la ligne qui vient d'être touchée : l'écran d'import en a besoin tout
  // de suite, pour ouvrir l'atelier sur le morceau qu'il vient lui-même de créer.
  return sendJson(res, 200, { ...store.readLibrary(), morceau: result.morceau ?? null });
}

function segments(pathname) {
  return pathname.split("/").filter(Boolean);
}

function query(req) {
  return new URL(req.url, "http://x").searchParams;
}

async function handleApi(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD" && !originIsAllowed(req)) {
    return sendJson(res, 403, { error: "Origine non autorisée" });
  }

  if (pathname === "/api/session" && req.method === "GET") {
    const user = getSessionUser(req);
    return sendJson(res, 200, { user, needsSetup: store.userCount() === 0 });
  }

  if (pathname === "/api/setup" && req.method === "POST") {
    if (store.userCount() > 0) return sendJson(res, 409, { error: "Un compte existe déjà." });
    const body = await readJsonBody(req);
    const result = store.createFirstUser(String(body.username || ""), String(body.password || ""));
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    setSessionCookie(res, result.user.id);
    return sendJson(res, 200, { user: result.user });
  }

  if (pathname === "/api/register" && req.method === "POST") {
    const ip = clientIp(req);
    // Le même frein que la connexion : le code d'invitation est court, il ne doit pas
    // pouvoir être deviné par répétition.
    if (loginIsThrottled(ip)) {
      return sendJson(res, 429, { error: "Trop de tentatives. Réessayez dans quelques minutes." });
    }
    const body = await readJsonBody(req);
    const result = store.registerWithInvite(
      String(body.username || ""),
      String(body.password || ""),
      String(body.code || ""),
    );
    if (!result.ok) {
      recordLoginFailure(ip);
      return sendJson(res, 400, { error: result.error });
    }
    loginAttempts.delete(ip);
    setSessionCookie(res, result.user.id);
    return sendJson(res, 200, { user: result.user });
  }

  if (pathname === "/api/login" && req.method === "POST") {
    const ip = clientIp(req);
    if (loginIsThrottled(ip)) {
      return sendJson(res, 429, {
        error: "Trop de tentatives de connexion. Réessayez dans quelques minutes.",
      });
    }
    const body = await readJsonBody(req);
    const user = store.authenticate(String(body.username || ""), String(body.password || ""));
    if (!user) {
      recordLoginFailure(ip);
      return sendJson(res, 401, { error: "Identifiant ou mot de passe incorrect." });
    }
    loginAttempts.delete(ip);
    setSessionCookie(res, user.id);
    return sendJson(res, 200, { user: store.toSafeUser(user) });
  }

  if (pathname === "/api/logout" && req.method === "POST") {
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  // Tout ce qui suit exige une session valide.
  const user = getSessionUser(req);
  if (!user) return sendJson(res, 401, { error: "Non authentifié" });

  if (pathname === "/api/password" && req.method === "POST") {
    const body = await readJsonBody(req);
    if (!store.verifyPasswordForUser(user.id, String(body.currentPassword || ""))) {
      return sendJson(res, 403, { error: "Mot de passe actuel incorrect." });
    }
    const result = store.updatePassword(user.id, String(body.newPassword || ""));
    if (!result.ok) return sendJson(res, 400, { error: result.error });
    return sendJson(res, 200, { ok: true });
  }

  // ---- Les comptes ----

  if (pathname === "/api/users" && req.method === "GET") {
    return sendJson(res, 200, { users: store.listUsers() });
  }

  if (
    pathname === "/api/invites" ||
    pathname === "/api/invites/revoke" ||
    pathname === "/api/users/delete"
  ) {
    if (!user.admin) return sendJson(res, 403, { error: "Réservé à l'administrateur." });

    if (pathname === "/api/invites" && req.method === "GET") {
      return sendJson(res, 200, { invites: store.listInvites() });
    }
    if (pathname === "/api/invites" && req.method === "POST") {
      const result = store.createInvite();
      if (!result.ok) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, { invite: result.invite, invites: store.listInvites() });
    }
    if (pathname === "/api/invites/revoke" && req.method === "POST") {
      const body = await readJsonBody(req);
      const result = store.revokeInvite(String(body.code || ""));
      if (!result.ok) return sendJson(res, 404, { error: result.error });
      return sendJson(res, 200, { invites: store.listInvites() });
    }
    if (pathname === "/api/users/delete" && req.method === "POST") {
      const body = await readJsonBody(req);
      if (String(body.id) === user.id) {
        return sendJson(res, 400, { error: "On ne supprime pas son propre compte." });
      }
      const result = store.deleteUser(String(body.id || ""));
      if (!result.ok) return sendJson(res, 400, { error: result.error });
      return sendJson(res, 200, { users: store.listUsers() });
    }
  }

  // ---- La bibliothèque ----

  if (pathname === "/api/morceaux" && req.method === "GET") {
    return sendJson(res, 200, { ...store.readLibrary(), users: store.listUsers() });
  }

  if (pathname === "/api/morceaux" && req.method === "POST") {
    const fichier = validateNomFichier(query(req).get("nom"));
    if (!fichier.ok) return sendJson(res, 400, { error: fichier.error });
    const titre = validateTexte(query(req).get("titre") ?? "", "Le titre", 120);
    if (!titre.ok) return sendJson(res, 400, { error: titre.error });

    // L'identifiant est tiré avant de recevoir le fichier : c'est lui qui nomme le fichier
    // sur le disque, et on préfère écrire d'abord et enregistrer ensuite. Un fichier
    // orphelin après une coupure ne gêne personne ; une ligne de bibliothèque qui pointe
    // vers un fichier absent casserait l'atelier à son ouverture.
    const id = crypto.randomUUID();
    const cible = store.sourcePath(id, fichier.value.ext);
    const { taille } = await receiveFile(req, cible, TAILLE_SOURCE_MAX);

    const result = store.updateLibrary((data) =>
      creerMorceau(data, {
        id,
        titre: titre.value,
        fichier: fichier.value,
        taille,
        auteur: user.username,
      }),
    );
    if (result.ok === false) {
      store.removeQuietly(cible);
      return sendJson(res, 400, { error: result.error });
    }
    return sendJson(res, 200, { ...store.readLibrary(), morceau: result.morceau });
  }

  const parts = segments(pathname); // ["api", "morceaux", id, action?]
  if (parts[0] !== "api" || parts[1] !== "morceaux" || !parts[2]) {
    return sendJson(res, 404, { error: "Route inconnue" });
  }

  const id = validateId(parts[2], "L'identifiant du morceau");
  if (!id.ok) return sendJson(res, 400, { error: id.error });
  const morceau = trouver(store.readLibrary(), id.value);
  if (!morceau) return sendJson(res, 404, { error: "Morceau introuvable." });
  const action = parts[3];

  if (!action) {
    if (req.method === "PATCH") {
      const body = validateBody(await readJsonBody(req));
      if (!body.ok) return sendJson(res, 400, { error: body.error });
      const titre = validateTexte(body.value.titre, "Le titre", 120);
      if (!titre.ok) return sendJson(res, 400, { error: titre.error });
      const artiste = validateTexte(body.value.artiste, "L'artiste", 120);
      if (!artiste.ok) return sendJson(res, 400, { error: artiste.error });
      return applyLibrary(res, (data) =>
        renommerMorceau(data, id.value, { titre: titre.value, artiste: artiste.value }),
      );
    }

    if (req.method === "DELETE") {
      const result = store.updateLibrary((data) => supprimerMorceau(data, id.value));
      if (result.ok === false) return sendJson(res, 400, { error: result.error });
      // Les fichiers partent après la sauvegarde, jamais avant : si l'écriture du JSON
      // échoue, la bibliothèque pointe encore vers des fichiers qui existent toujours.
      store.removeQuietly(store.sourcePath(result.fichiers.source.id, result.fichiers.source.ext));
      if (result.fichiers.video) {
        store.removeQuietly(store.videoPath(result.fichiers.video.id, result.fichiers.video.ext));
      }
      if (morceau.reglages?.pdf?.audio) {
        store.removeQuietly(store.audioPath(morceau.id, morceau.reglages.pdf.audio.ext));
      }
      return sendJson(res, 200, store.readLibrary());
    }
  }

  if (action === "reglages" && req.method === "PUT") {
    const body = validateBody(await readJsonBody(req));
    if (!body.ok) return sendJson(res, 400, { error: body.error });
    const reglages = validateReglages(body.value.reglages);
    if (!reglages.ok) return sendJson(res, 400, { error: reglages.error });
    if (!reglages.value) return sendJson(res, 400, { error: "Réglages manquants." });
    return applyLibrary(res, (data) => enregistrerReglages(data, id.value, reglages.value));
  }

  if (action === "source" && (req.method === "GET" || req.method === "HEAD")) {
    return sendFile(req, res, store.sourcePath(morceau.id, morceau.fichier.ext), {
      type: MIME_TYPES[morceau.fichier.ext] || "application/octet-stream",
      // Pas de content-disposition ici : c'est alphaTab et pdf.js qui lisent cette
      // adresse, et un « attachment » ferait télécharger la tablature au lieu de
      // l'afficher. Le vrai téléchargement passe par ?telecharger=1.
      download: query(req).get("telecharger") ? morceau.fichier.nom : null,
    });
  }

  if (action === "video") {
    if (req.method === "GET" || req.method === "HEAD") {
      if (!morceau.video) return sendJson(res, 404, { error: "Aucune vidéo enregistrée." });
      const nom = `${morceau.titre || "videotab"}${morceau.video.ext}`;
      return sendFile(req, res, store.videoPath(morceau.id, morceau.video.ext), {
        type: MIME_TYPES[morceau.video.ext] || "video/webm",
        download: query(req).get("telecharger") ? nom : null,
      });
    }

    if (req.method === "PUT") {
      const q = query(req);
      const ext = q.get("ext") === ".mp4" ? ".mp4" : ".webm";
      const duree = validateDuree(q.get("duree"));
      if (!duree.ok) return sendJson(res, 400, { error: duree.error });
      const cible = store.videoPath(morceau.id, ext);
      const { taille } = await receiveFile(req, cible, VIDEO_MAX_BYTES);
      // Un second export peut changer de conteneur (Safari produit du mp4 là où Chrome
      // produit du webm) : l'ancien fichier ne porte alors pas le même nom et ne serait
      // jamais remplacé par l'écriture ci-dessus.
      if (morceau.video && morceau.video.ext !== ext) {
        store.removeQuietly(store.videoPath(morceau.id, morceau.video.ext));
      }
      return applyLibrary(res, (data) =>
        attacherVideo(data, id.value, { ext, taille, dureeMs: duree.value }),
      );
    }

    if (req.method === "DELETE") {
      const result = store.updateLibrary((data) => detacherVideo(data, id.value));
      if (result.ok === false) return sendJson(res, 400, { error: result.error });
      if (result.ancienne) store.removeQuietly(store.videoPath(id.value, result.ancienne.ext));
      return sendJson(res, 200, { ...store.readLibrary(), morceau: result.morceau });
    }
  }

  if (action === "audio") {
    const audio = morceau.reglages?.pdf?.audio ?? null;

    if (req.method === "GET" || req.method === "HEAD") {
      if (!audio) return sendJson(res, 404, { error: "Aucune bande-son." });
      return sendFile(req, res, store.audioPath(morceau.id, audio.ext), {
        type: MIME_TYPES[audio.ext] || "application/octet-stream",
        download: null,
      });
    }

    if (req.method === "PUT") {
      const nom = validateTexte(query(req).get("nom"), "Le nom du fichier", 200, {
        obligatoire: true,
      });
      if (!nom.ok) return sendJson(res, 400, { error: nom.error });
      const ext = (nom.value.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
      if (![".mp3", ".ogg", ".wav", ".m4a", ".flac"].includes(ext)) {
        return sendJson(res, 400, { error: "Format audio non reconnu (mp3, ogg, wav, m4a, flac)." });
      }
      const cible = store.audioPath(morceau.id, ext);
      const { taille } = await receiveFile(req, cible, AUDIO_MAX_BYTES);
      if (audio && audio.ext !== ext) store.removeQuietly(store.audioPath(morceau.id, audio.ext));
      return applyLibrary(res, (data) => {
        const cible2 = trouver(data, id.value);
        if (!cible2) return { ok: false, error: "Morceau introuvable." };
        const reglages = cible2.reglages ?? {};
        reglages.pdf = { ...(reglages.pdf ?? {}), audio: { nom: nom.value, ext, taille } };
        return enregistrerReglages(data, id.value, reglages);
      });
    }

    if (req.method === "DELETE") {
      if (audio) store.removeQuietly(store.audioPath(morceau.id, audio.ext));
      return applyLibrary(res, (data) => {
        const cible2 = trouver(data, id.value);
        if (!cible2) return { ok: false, error: "Morceau introuvable." };
        const reglages = cible2.reglages ?? {};
        reglages.pdf = { ...(reglages.pdf ?? {}), audio: null };
        return enregistrerReglages(data, id.value, reglages);
      });
    }
  }

  return sendJson(res, 404, { error: "Route inconnue" });
}

// ---- Serveur ----

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, "http://x").pathname;

  if (pathname === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith("/api/")) {
    handleApi(req, res, pathname).catch((err) => {
      const tooBig = err?.message === "payload too large";
      const badJson = err?.message === "invalid json";
      const empty = err?.message === "empty body";
      if (!tooBig && !badJson && !empty) console.error("api", pathname, err);
      if (res.headersSent) return res.end();
      sendJson(res, tooBig ? 413 : badJson || empty ? 400 : 500, {
        error: tooBig
          ? "Fichier trop volumineux."
          : badJson
            ? "JSON invalide."
            : empty
              ? "Fichier vide."
              : "Erreur serveur.",
      });
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    return res.end();
  }

  serveStatic(req, res);
});

// Un export peut durer autant que le morceau : le navigateur envoie la vidéo en une seule
// requête, et la coupure par défaut de Node (deux minutes sans le moindre octet) n'a pas
// de raison de s'appliquer à un transfert qui progresse.
server.requestTimeout = 0;
server.headersTimeout = 60_000;

server.listen(PORT, HOST, () => {
  console.log(`Videotab écoute sur http://${HOST}:${PORT} (données : ${store.DATA_DIR})`);
  if (!fs.existsSync(DIST_DIR)) {
    console.log("dist/ absent : lancez `npm run build`, ou `npm run dev` pour le serveur Vite.");
  }
});
