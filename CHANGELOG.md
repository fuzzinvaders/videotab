# Changelog

*[Readme](README.md)* · *[Version française](README.fr.md)*

All notable changes to Videotab. Dates are release dates; the project follows no formal
versioning yet, so entries are grouped by the change that shipped them.

## Unreleased

### Changed

- **The zoom is now set in bars, not in pixels.** "How many bars do I want on screen" is the
  question one actually asks — two to work a passage, four to follow, eight to keep the piece
  in view — and it is the only one with a musical meaning. The height of the strip is no longer
  a setting at all: it follows from the zoom, and the band ends up as short as the tablature
  requires. That is exactly what an overlay wants, since every pixel it does not take is a
  pixel of the cover video left visible. A ceiling remains as a safety valve, and when it bites
  it is the bar count that gives way rather than the image that overflows.

### Fixed

- **The score was cropped on the wrong bounds, so it was not really cropped at all.**
  alphaTab's bounds come in three nested levels and the first two are misleading: a staff
  system and a master bar both declare the height of everything orbiting the music — tempo
  marking, section name, instrument name, engine credit. Only the third level covers "the
  region of the staff". On a bass tablature the staff is a quarter of what the system claims,
  so the strip was carrying three quarters of air: 220 pixels where 56 were needed, and a band
  four times taller than necessary for the same legibility.
- **String colours were upside down.** alphaTab documents string 1 as *the lowest string and
  the bottom line of the tablature*; the mapping assumed the opposite and counted from the
  treble. Every note came out with its neighbour's colour — a bug that breaks nothing, renders
  fine and is invisible until you compare against a reference. Found on a real four-string bass
  file, which is exactly the case the earlier synthetic fixtures could not catch. The
  convention is now quoted in the code and pinned by a test.
- **The cursor colour no longer gets stuck on a theme you merely tried out.** It used to look
  the current colour up in the swatch palette to guess whether it had been chosen on purpose —
  a guess that failed for every theme whose colour was not in that palette, and the magenta of
  the neon theme then stayed glued to all the others. The colour is now simply absent until
  someone picks one, and an **Auto** chip puts it back. A colour pinned from elsewhere gets its
  own swatch in the row, so something is always visibly selected.

### Added

- **The cursor can show the line, the beat highlight, or both.** On a tight tablature the two
  say the same thing twice and the line falls in the middle of the block it is crossing. Where
  there is no beat to highlight — a PDF scrolling horizontally — the line comes back on its
  own rather than leaving an invisible cursor.

- **Horizontal scrolling, and it is now the default.** The whole piece becomes one strip
  gliding under a fixed playhead, instead of a page scrolling downwards. The eye stops moving
  and waits for the music to arrive — and the result fits in a band at the bottom of a cover
  video, which is what this was all for. For Guitar Pro it is alphaTab's own horizontal layout;
  for a PDF the detected staves are cut out of their pages and glued end to end, so the same
  layout work serves both modes.
- **Themes, five of them**, including one that gives each string its own colour: the colour
  says which string, the number says which fret, and the eye finds the string before it has
  read the number. Colours are counted from the lowest string, so a four-string bass and a
  seven-string guitar read the same way. They are set note by note in alphaTab's model rather
  than painted over the render — a staff is not a picture you retouch afterwards.
- **Framing**: rounded card, coloured halo, translucent bands, vignette. Both ends of the strip
  always fade out, whatever the frame: a bar appearing abruptly at the edge catches the eye at
  the wrong moment.
- **Backgrounds made for compositing** — chroma green, or true transparency in VP8 WebM where
  the browser can encode it. The export panel says which one this browser can actually do
  before the button is pressed, rather than after three minutes of encoding.
- **A PDF's ink is lifted off its paper** on themes without paper: white becomes transparent,
  strokes take the theme's colour, and the grey of the antialiasing keeps its half-tone. The
  obvious shortcut — inverting the image — would have made the paper black and *opaque*, which
  is exactly what an overlay cannot be.
- **The score is cropped to its staves.** alphaTab's render carries a tempo marking above and
  a credit below, and fitting all of it into the band left the tablature three times smaller
  than the height that had been asked for.
- **Title and progress bar can be switched off**, for a video that already carries its own.
- **Settings are completed on read** ([src/lib/reglages.ts](src/lib/reglages.ts)): a piece
  imported before layouts and themes existed opens with the new defaults instead of
  propagating `undefined` into a scale, a NaN and an empty picture.

- **First version.** Import a tablature, get a video where a cursor follows the music. Two
  sources, one workshop: Guitar Pro files (and MusicXML, Capella, alphaTex) on one side, plain
  PDFs on the other.
- **Guitar Pro, with a cursor that knows where it is.** alphaTab renders the score and plays
  it; the tick table built during the audio export ties the two together, so the cursor lands
  on the beat rather than near it, and the picture cannot drift from the sound. Track choice,
  tempo, tab alone or with the standard staff, metronome.
- **Tempo is applied to the score, not to the player.** alphaTab can slow playback down on the
  fly but always exports audio at the written tempo; slowing the player would have produced a
  slow-motion picture over a full-speed soundtrack. Changing the score's tempo automations
  makes the sound, the picture and the announced duration all follow.
- **PDF staff detection.** A row-by-row ink profile finds the long horizontal lines and groups
  the ones that sit close together — six of them being the signature of a tablature. An
  isolated rule is rejected, and no two proposed systems are allowed to overlap.
- **A hand editor for the layout,** because detection will be wrong somewhere: drag a rectangle
  to add a line, grab its edges to adjust it, set its bar count in the corner. Reading order is
  never asked for — systems sort top to bottom, page after page, and carry a number so the sort
  can be checked at a glance.
- **Tap tempo.** Nobody knows the tempo of a PDF found on the internet, but everybody can beat
  it while listening. The button averages the last taps, and a pause of more than two seconds
  starts a new series.
- **An optional soundtrack for PDFs** (mp3, wav, ogg, m4a, flac) with a start offset, since a
  PDF holds no note a machine could play.
- **The preview is the video.** The player draws with the code that will draw the video, at the
  video's own resolution — so a bad layout is discovered before the encoding, not after.
- **Export in the browser** via `canvas.captureStream` and `MediaRecorder`: no ffmpeg on the
  host, no render queue, nothing to install on a NAS. The cost is stated where it is felt —
  encoding runs in real time and the tab must stay in the foreground, and the export panel says
  so before the button is pressed.
- **1080p, 720p or vertical**, 24/30/60 fps, cursor colour and opacity, count-in and fade. The
  count-in is baked into the soundtrack as leading silence rather than taught to the preview,
  the recorder and the cursor separately.
- **Videos are kept on the server** when asked, next to the tablature that produced them, and
  are streamed back with `Range` support so the playback bar can be dragged.
- **Shared library.** The first account is the administrator and invites the others with a
  code, valid seven days and usable once. Every piece keeps the name of who imported it.
- **A `tools/motdepasse.js` shipped inside the image** to reset a forgotten password from the
  host, since Videotab sends no email and no recovery screen could verify anyone's identity.
