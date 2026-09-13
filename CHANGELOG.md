# Changelog

*[Readme](README.md)* · *[Version française](README.fr.md)*

All notable changes to Videotab. Dates are release dates; the project follows no formal
versioning yet, so entries are grouped by the change that shipped them.

## Unreleased

### Added

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
