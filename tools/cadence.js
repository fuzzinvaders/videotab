#!/usr/bin/env node
/**
 * Mesure la cadence réelle d'une vidéo produite par Videotab, en lisant les horodatages
 * que l'encodeur a écrits dans le conteneur.
 *
 * L'œil est mauvais juge d'une saccade : il la voit sans savoir la nommer, et une capture
 * d'écran n'en garde aucune trace. Le fichier, lui, dit tout — chaque image y porte l'instant
 * auquel elle doit être montrée. Un intervalle qui alterne du simple au double, c'est la
 * saccade ; des intervalles réguliers, c'est fini. Cet outil n'existe que pour trancher.
 *
 *   node tools/cadence.js .data/videos/xxxx.webm
 *
 * Il ne décode aucune image : il ne fait que parcourir la structure EBML et relever, pour la
 * piste vidéo, le temps de chaque bloc. Assez pour juger, sans dépendre de ffmpeg — que ce
 * projet s'est justement promis de ne jamais exiger.
 */

import fs from 'node:fs'

/* Les seuls identifiants dont on ait besoin. Les autres se traversent ou se sautent sans
   qu'on ait à savoir ce qu'ils contiennent. */
const MASTERS = new Set([
  0x18538067, // Segment
  0x1f43b675, // Cluster
  0x1549a966, // Info
  0x1654ae6b, // Tracks
  0xae, // TrackEntry
  0xa0, // BlockGroup
])
const TIMECODE = 0xe7
const TIMECODE_SCALE = 0x2ad7b1
const SIMPLE_BLOCK = 0xa3
const BLOCK = 0xa1
const TRACK_NUMBER = 0xd7
const TRACK_TYPE = 0x83

function longueurVint(premier) {
  for (let i = 0; i < 8; i++) if (premier & (0x80 >> i)) return i + 1
  return 8
}

/** Un identifiant garde son marqueur : c'est ainsi qu'il est écrit dans les tables. */
function lireId(buf, pos) {
  const n = longueurVint(buf[pos])
  let v = 0
  for (let i = 0; i < n; i++) v = v * 256 + buf[pos + i]
  return { valeur: v, suite: pos + n }
}

/** Une taille perd le sien. Tous les bits à un veut dire « taille inconnue » : du direct. */
function lireTaille(buf, pos) {
  const n = longueurVint(buf[pos])
  let v = buf[pos] & (0xff >> n)
  let plein = (0xff >> n) === v
  for (let i = 1; i < n; i++) {
    plein = plein && buf[pos + i] === 0xff
    v = v * 256 + buf[pos + i]
  }
  return { valeur: plein ? null : v, suite: pos + n }
}

function lireEntier(buf, pos, taille) {
  let v = 0
  for (let i = 0; i < taille; i++) v = v * 256 + buf[pos + i]
  return v
}

export function horodatages(buf) {
  const blocs = []
  let echelleMs = 1 // TimecodeScale par défaut : un million de nanosecondes.
  let clusterMs = 0
  let pisteVideo = null
  // Contexte de la piste en cours de description, le temps de traverser Tracks.
  let numero = null
  let genre = null

  /* Un parcours linéaire plutôt qu'un arbre : les fichiers du direct ont des tailles
     inconnues, et prétendre reconstruire la hiérarchie exacte ferait échouer la lecture là
     où un simple balayage suffit. Ce qu'on cherche arrive de toute façon dans l'ordre. */
  function parcourir(debut, fin) {
    let pos = debut
    while (pos < fin - 1) {
      const id = lireId(buf, pos)
      const taille = lireTaille(buf, id.suite)
      const corps = taille.suite
      const bout = taille.valeur === null ? fin : Math.min(fin, corps + taille.valeur)
      if (bout <= corps && taille.valeur !== 0) return

      if (MASTERS.has(id.valeur)) {
        if (id.valeur === 0xae) {
          numero = null
          genre = null
        }
        parcourir(corps, bout)
        if (id.valeur === 0xae && genre === 1 && pisteVideo === null) pisteVideo = numero
      } else {
        switch (id.valeur) {
          case TIMECODE_SCALE:
            echelleMs = lireEntier(buf, corps, taille.valeur) / 1e6
            break
          case TIMECODE:
            clusterMs = lireEntier(buf, corps, taille.valeur) * echelleMs
            break
          case TRACK_NUMBER:
            numero = lireEntier(buf, corps, taille.valeur)
            break
          case TRACK_TYPE:
            genre = lireEntier(buf, corps, taille.valeur)
            break
          case SIMPLE_BLOCK:
          case BLOCK: {
            const piste = lireTaille(buf, corps)
            const relatif = buf.readInt16BE(piste.suite)
            if (pisteVideo === null || piste.valeur === pisteVideo) {
              blocs.push({ piste: piste.valeur, ms: clusterMs + relatif * echelleMs })
            }
            break
          }
        }
      }
      pos = bout
    }
  }

  parcourir(0, buf.length)
  const video = pisteVideo === null ? blocs : blocs.filter((b) => b.piste === pisteVideo)
  return video.map((b) => b.ms).sort((a, b) => a - b)
}

function rapport(nom, ms) {
  if (ms.length < 3) {
    console.log(`${nom} : ${ms.length} image(s), rien à mesurer.`)
    return
  }
  const d = ms.slice(1).map((v, i) => v - ms[i]).filter((v) => v > 0)
  const tri = d.slice().sort((a, b) => a - b)
  const q = (p) => tri[Math.min(tri.length - 1, Math.floor(p * tri.length))]
  const moy = d.reduce((a, b) => a + b, 0) / d.length
  console.log(`\n${nom}`)
  console.log(`  ${ms.length} images sur ${(ms[ms.length - 1] / 1000).toFixed(1)} s`)
  console.log(`  cadence moyenne ${(1000 / moy).toFixed(2)} img/s`)
  console.log(
    `  intervalle  min ${tri[0].toFixed(1)}  p05 ${q(0.05).toFixed(1)}  p50 ${q(0.5).toFixed(1)}` +
      `  p95 ${q(0.95).toFixed(1)}  max ${tri[tri.length - 1].toFixed(1)} ms`,
  )
  /* Le chiffre qui compte. Une image durablement deux fois plus longue que sa voisine, c'est
     ce que l'œil appelle une saccade ; en dessous de 1,3 on ne voit plus rien. */
  console.log(`  irrégularité p95/p05 ${(q(0.95) / Math.max(q(0.05), 0.001)).toFixed(2)}`)
  console.log(`  suite : ${d.slice(30, 60).map((v) => v.toFixed(0)).join(' ')}`)
}

// Importable sans s'exécuter : la mesure sert aussi de brique à d'autres scripts d'analyse.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const fichiers = process.argv.slice(2)
  if (fichiers.length === 0) {
    console.error('usage : node tools/cadence.js <fichier.webm> [...]')
    process.exit(1)
  }
  for (const f of fichiers) rapport(f, horodatages(fs.readFileSync(f)))
}
