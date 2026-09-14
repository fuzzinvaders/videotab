# Videotab

*[Version française](README.fr.md)* · *[Changelog](CHANGELOG.md)*

Drop in a tablature, walk away with a video where a cursor follows the music — usually a
horizontal strip sliding under a fixed playhead, made to be laid over a cover video. A Guitar
Pro file brings its own notes, tempo and layout: the cursor lands exactly on the beat being
played, the soundtrack comes out of the synthesizer, and each string can have its own colour.
A PDF is only a picture: the workshop finds the tab staves on it, cuts them out, glues them
into a single strip, and all that is left to give is a tempo. **Self-hosted**: a single Docker
container, no external database, no third-party account, and nothing that leaves your machine.

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
  with the standard staff, the rhythm under the tab, the metronome. The rhythm is on by
  default: a fret number says where to put the finger, not how long to leave it there. Tempo is applied to the **score**, not to the
  player: the sound, the picture and the announced duration all follow it.
- **PDF** — "Détecter les lignes" looks for staves on each page and proposes a layout. It is
  corrected by hand: drag a rectangle to add a line, grab its edges to adjust it, change its
  bar count in the corner. Then give it a tempo — as a number, or by tapping the **Taper**
  button along with the recording.
- **A PDF's soundtrack** — a PDF holds no note a machine could play. You can attach the
  recording of the piece (mp3, wav, ogg, m4a, flac) and line up the start with the *décalage*:
  the time that passes before the first note.
- **Layout** — *horizontal scroll* (the default): a single strip sliding under a fixed
  playhead. The zoom is set in **bars on screen** — four by default — and the height of the
  strip follows from it, as short as the tablature requires: whatever it does not take stays
  visible of the video underneath. The breathing room around it is a separate setting. The eye stops moving and waits for the music
  to arrive, and the whole thing fits in a band at the bottom of a cover video. *Fixed bars*:
  the same strip, but standing still — the cursor crosses it and the page turns at the end. A
  bar is never cut, so the window holds as many as fit, and the last one is shown ahead of time
  and reopens the next window — the page turns exactly as the cursor reaches it, so you never
  turn onto the entirely unknown and the cursor has crossed the whole screen first. The turn is
  a short dissolve rather than a cut. A digit that
  does not move can be read; a digit that slides can only be followed. *Page*: the
  whole score scrolling downwards, to work on a piece rather than to illustrate it.
- **Themes** — five of them, including **Cordes colorées** (coloured strings): dark background,
  grey staff lines, one colour per string. The colour says which string to play, the number
  says which fret; the eye finds the string before it has read the number. The order starts
  from the lowest string, so a four-string bass and a seven-string guitar read the same way.
  Also: Papier, Ardoise, Néon, Craie.
- **Framing** — none, a rounded card, a coloured halo, translucent bands, or a vignette, with
  the thickness of the line as a setting — counted on the width, so it keeps its weight in 720p
  and in vertical alike. While
  scrolling, both ends of the strip fade out: a bar appearing abruptly at the edge of the frame
  catches the eye at the wrong moment. With fixed bars they do not, since the bar at the edge is
  exactly the one being offered to read ahead.
- **Cursor** — the line at the exact instant, the highlight over the current beat, or both;
  gliding between the notes or stepping from one to the next.
  On a tight tablature the two say the same thing and get in each other's way; on a video
  watched from a distance, both beat one. The colour follows the theme until you pick one, and
  an **Auto** button brings it back.
- **Video** — 1080p, 720p or a vertical format for phones; 24, 30 or 60 frames per second; a
  count-in; a fade; title and progress bar you can switch off.
- **Export** — the video is made in the tab and **in real time** (see below). It downloads, and
  it is kept on the server if you tick the box — to find it again from another machine.

## Laying the tablature over a cover

This is what the application exists for. Three settings are enough:

1. **Layout: horizontal scroll**, or fixed bars. Either way the tablature becomes a band, not
   a page.
2. **Background: transparent** — or **chroma green** if the editing software prefers it.
   Transparent produces a VP8 WebM with an alpha channel; it is cleaner, but not every browser
   encodes it and not every editor reads it, and the interface says so before you press.
   Green works everywhere.
3. **Framing: height of the strip.** The video is then only as tall as the tablature —
   1920×230 on a four-bar bass tablature — so it weighs what it shows and drops into place at
   editing time.
4. **Title and progress bar switched off**, if the cover video already carries its own.

The rest — strip height, playhead position, theme — is set by watching the preview, which is
the exact picture that will be encoded.

For a PDF, the ink is lifted off the paper automatically on themes without paper: the white of
the page becomes transparent and the strokes take the theme's colour. This is **not** an
inversion — inverting would make the paper black and opaque, and the tablature would arrive
inside a black rectangle sitting on top of the cover.

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
- **The tab must stay open**, but not in front. Encoding is paced by the audio thread, which
  the browser never throttles, so the video keeps its full frame rate while you work in
  another window. Closing the tab does end it. One nuance: while the tab is hidden the frames
  are spaced on the sound card's grid, about 10.7 ms, which divides 30 fps more evenly than
  60 — so 30 is the steadier choice for an export you intend to walk away from.
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
  reduce to the same object — an image, and a rectangle moving over it through time. The
  preview and the video call the same `dessiner(ctx, t)`. The file's only real fork is the
  layout: in page mode the cursor is followed on `y` with smoothing, in scroll mode it is held
  on `x` without any — that position is already continuous, and smoothing it would only add a
  delay between sound and picture — and with fixed bars the strip does not move at all between
  two page turns, which is the whole point of choosing it.
- **Themes** ([src/lib/themes.ts](src/lib/themes.ts)) act at three distinct moments: the
  colours the scene paints itself, the ones alphaTab receives **before** drawing (a staff is
  not a picture you retouch afterwards), and the colour of each string, set note by note in
  the model through `NoteStyle`.
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
