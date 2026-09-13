# Videotab

*[Version française](README.fr.md)* · *[Changelog](CHANGELOG.md)*

Drop in a tablature, walk away with a video where a cursor follows the music. A Guitar Pro
file brings its own notes, tempo and layout: the cursor lands exactly on the beat being
played, and the soundtrack comes out of the synthesizer. A PDF is only a picture: the workshop
finds the tab staves on it, you give it a tempo, and the cursor sweeps them — with the
recording of the piece underneath if you have one. **Self-hosted**: a single Docker container,
no external database, no third-party account, and nothing that leaves your machine.

## Run with Docker (recommended)

```bash
docker compose up -d
```

This pulls the published image `ghcr.io/fuzzinvaders/videotab:latest` — nothing to build. To
run from source instead (after changing the code), uncomment `build` in
[docker-compose.yml](docker-compose.yml) and run `docker compose up -d --build`.

Open `http://localhost:8080`. On first visit the app asks you to create the first account
(username + password); that account is the administrator and hands out invitation codes to
whoever shares the library.

Updating an existing instance:

```bash
docker compose pull && docker compose up -d
```

Data (accounts, tablatures, settings, produced videos) lives in the Docker volume
`videotab-data`, mounted at `/data` — it survives `docker compose down` / `up`.

## Deploying behind Traefik

```bash
docker network create proxy   # if the network does not exist yet
docker compose -f docker-compose.traefik.yml up -d
```

Copy [.env.example](.env.example) to `.env` next to that file and set at least `DOMAIN` (for
example `videotab.example.org`) — `ORIGIN` is then derived automatically. No port is published
on the host: Traefik routes traffic over the shared `proxy` network, in HTTPS.

## Development (without Docker)

Two processes side by side:

```bash
npm install
npm run dev:server   # API + data, on http://localhost:3000 (files under ./.data)
npm run dev          # Vite front-end with hot reload, on http://localhost:5173
```

Open `http://localhost:5173` — Vite proxies `/api` to the server above. `npm test` (vitest)
covers timing, staff detection, server-side validation and the library operations.

## How it works

- **Import** — drag a file onto the home page. Guitar Pro (`.gp`, `.gp3` to `.gp5`, `.gpx`),
  MusicXML (`.musicxml`, `.mxl`, `.xml`), Capella, alphaTex, or a PDF. The title comes from the
  file name, and the workshop opens straight away.
- **The preview is the video.** The picture in the player is drawn by the code that will draw
  the video, at the video's own resolution. What you see before spending three minutes
  encoding is what you get afterwards.
- **Guitar Pro** — pick the track (one track makes a readable video), the tempo, tab alone or
  with the standard staff, the metronome. Tempo is applied to the **score**, not to the
  player: the sound, the picture and the announced duration all follow it.
- **PDF** — "Détecter les lignes" looks for staves on each page and proposes a layout. It is
  corrected by hand: drag a rectangle to add a line, grab its edges to adjust it, change its
  bar count in the corner. Then give it a tempo — as a number, or by tapping the **Taper**
  button along with the recording.
- **A PDF's soundtrack** — a PDF holds no note a machine could play. You can attach the
  recording of the piece (mp3, wav, ogg, m4a, flac) and line up the start with the *décalage*:
  the time that passes before the first note.
- **Video** — 1080p, 720p or a vertical format for phones; 24, 30 or 60 frames per second;
  cursor colour and opacity; a count-in; a fade.
- **Export** — the video is made in the tab and **in real time** (see below). It downloads, and
  it is kept on the server if you tick the box — to find it again from another machine.

## Exporting happens in the browser

This is the main architectural choice, and it has visible consequences.

The server reads no tablature, draws no staff and encodes no video. All of that happens in the
browser, which already has a rendering engine, a synthesizer and a video encoder — three
things that would otherwise have to be installed on the host, and that would rule out running
this on a NAS. The server keeps the files and the accounts, which is exactly what a closed tab
cannot keep.

In exchange:

- **Encoding takes as long as the piece.** `MediaRecorder` is a tape recorder, not a renderer:
  it timestamps what it receives with the wall clock. Three minutes of music take three
  minutes.
- **The tab must stay in the foreground.** A hidden tab has its clocks throttled, and the video
  keeps the trace — the picture stutters, even though it stays in sync with the sound.
- **The format is WebM** (VP9 + Opus) everywhere except Safari, which produces mp4. Both are
  accepted by YouTube, Instagram and the usual editing software.

## Backing up

The Docker volume survives `docker compose down`, but **not the loss of the machine**. The
simplest backup copies its contents out:

```bash
docker run --rm -v videotab_videotab-data:/data -v "$PWD":/out alpine \
  tar czf /out/videotab-$(date +%F).tar.gz -C /data .
```

To restore, the reverse, with the container stopped:

```bash
docker compose down
docker run --rm -v videotab_videotab-data:/data -v "$PWD":/in alpine \
  sh -c "rm -rf /data/* && tar xzf /in/videotab-2026-09-01.tar.gz -C /data"
docker compose up -d
```

Produced videos are heavy. If the backup has to stay small, `sources/` plus the two JSON files
are enough to rebuild everything: a video can be exported again, a tablature cannot.

## Forgotten password

Videotab sends no email, so no recovery screen could verify anyone's identity. The right comes
from access to the machine instead:

```bash
docker exec videotab node tools/motdepasse.js <username>
```

With no password argument one is drawn at random and printed — nothing goes through the shell
history. Every open session is closed; restart the container for it to take effect.

## Architecture

- Front-end: React + TypeScript + Vite + Tailwind, installable PWA ([vite.config.ts](vite.config.ts)).
- Back-end: [server/server.js](server/server.js), plain Node with **no npm dependency**,
  serving both the built static files and the REST API under `/api/*`.
- Data: [server/store.js](server/store.js) — `users.json` (accounts, session secret,
  invitations), `morceaux.json` (the library), and the heavy files on disk under `sources/` and
  `videos/`. Atomic writes (temp file then rename); tablatures and videos are streamed, never
  held in memory.
- Auth: scrypt-hashed passwords, session as an HMAC-SHA256 signed cookie (`httpOnly`,
  `SameSite=Lax`). Login and registration attempts are throttled (10 failures per quarter hour
  per IP).
- A **file's name on disk comes from the piece's id**, never from the name the browser sent:
  that alone rules out `../`, characters a filesystem refuses, and collisions between two
  people uploading "tablature.pdf".
- **One scene for two worlds** ([src/lib/scene.ts](src/lib/scene.ts)). Guitar Pro and PDF
  reduce to the same object — one tall image and a rectangle moving over it through time. The
  preview and the video call the same `dessiner(ctx, t)`.
- **Guitar Pro** ([src/lib/gp.ts](src/lib/gp.ts)): alphaTab draws the score *and* plays it.
  What ties the two together is the tick table, built during the audio export — with every
  chunk it produces, the synthesizer states which tick and which millisecond it is at. Picture
  and sound therefore come from one reading, and cannot drift apart.
- **PDF** ([src/lib/pdf.ts](src/lib/pdf.ts), [src/lib/systemes.ts](src/lib/systemes.ts)):
  staves are found with a row-by-row ink profile — six long horizontal lines close together is
  the signature of a tablature. The timing itself is pure arithmetic
  ([src/lib/minutage.ts](src/lib/minutage.ts)), so it is testable without a browser.
- **Video** ([src/lib/video.ts](src/lib/video.ts)): `canvas.captureStream` + `MediaRecorder`,
  with the audio context's clock as the reference whenever there is a soundtrack — that is the
  clock the sound will follow, and a frame computed from any other one would end up offset.

## Licence

[AGPL-3.0-or-later](LICENSE). alphaTab is distributed under MPL-2.0, pdf.js under Apache-2.0,
the Bravura font under OFL and the Sonivox sound bank under Apache-2.0.
