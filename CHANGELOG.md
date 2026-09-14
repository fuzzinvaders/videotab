# Changelog

*[Readme](README.md)* · *[Version française](README.fr.md)*

All notable changes to Videotab. Dates are release dates; the project follows no formal
versioning yet, so entries are grouped by the change that shipped them.

## Unreleased

### Changed

- **The exported video can be cropped to the strip itself.** A 1920×1080 file carrying eight
  hundred pixels of nothing above and below the tablature is heavy for what it shows, and at
  editing time it has to be positioned by guesswork. "Hauteur de la bande" makes the video as
  tall as the band — 1920×230 on a bass tablature at four bars — so it weighs what it shows and
  drops into place. The height is rounded to an even number, which several encoders require.

- **The air around the tablature is now a setting.** Two margins were being conflated: the crop
  margin, which is a technical constraint — do not cut the stems or the rhythm marks — and the
  breathing room one deliberately leaves, which is a layout choice. Only the first existed, and
  it was fixed, so the strip came out cramped: the tablature touched both edges of its band,
  which on an overlay makes it blur into whatever passes behind. The second is now a slider,
  counted in proportion of the tablature's own height so it scales with the zoom, and it counts
  against the ceiling instead of quietly overflowing it.
- **The zoom is now set in bars, not in pixels.** "How many bars do I want on screen" is the
  question one actually asks — two to work a passage, four to follow, eight to keep the piece
  in view — and it is the only one with a musical meaning. The height of the strip is no longer
  a setting at all: it follows from the zoom, and the band ends up as short as the tablature
  requires. That is exactly what an overlay wants, since every pixel it does not take is a
  pixel of the cover video left visible. A ceiling remains as a safety valve, and when it bites
  it is the bar count that gives way rather than the image that overflows.

### Fixed

- **The preview ran ahead of its own sound by the width of the sound card's buffer.** A context
  does not play what it is handed at the instant it is handed it: the sound crosses a buffer and
  then the driver before reaching the speaker. Measured here, under Chrome on Windows: ten
  milliseconds of processing and forty of output, fifty-three in all, confirmed by comparing the
  rendering clock with `getOutputTimestamp`. The picture started immediately and so led the
  sound by that much — inaudible on a held note, plainly visible on an attack, and quite enough
  to leave the impression that the cursor is early. The picture now waits for the sound to be
  audible. The export was never affected: it taps the audio before the output device, so there
  is no such delay to account for.
- **The picture ran half a second ahead of the sound, from the first bar to the last.** The
  tick table that ties the two together is built from what the audio export reports for each
  chunk it produces — and its two fields do not describe the same instant. `currentTick` gives
  the tick at the **end** of the chunk, `currentTime` the instant of its **start**. Pairing
  them skewed the whole table by one chunk. Measured on a real tablature: the first note sounds
  at 3356 ms, the table announced it at 2856. Time is now counted on the samples actually
  produced, which cannot disagree with themselves — same measurement afterwards, 3356 ms to the
  millisecond. The announced duration was short by the same chunk, which quietly cut the last
  half-second off every video; it is now exact too.
- **The rhythm was missing under the tablature**, so a fret number said where to put the finger
  and never how long to leave it there. Two causes, one hiding the other.

  The first was the crop. alphaTab lays the rhythm out in a band of its own below the staff,
  whose height it knows but never declares in the bar bounds — "the region of the staff" stops
  at the last line. Measured on a bass tablature: staff from 125 to 164, crop stopping at 173,
  and twenty-five pixels of rhythm to draw below 164. The crop now asks how tall that band is
  and keeps it.

  That alone changed nothing, which is how the second came to light: alphaTab's *automatic*
  rhythm mode — its default, and what this was relying on — never turned it on. It is
  documented as showing the rhythm whenever standard notation is hidden, but it reads that from
  what the file declares for the track, not from the staves we asked to display. Rendering the
  strip as text, character by character, showed the widened band to be simply empty. The rhythm
  is now asked for explicitly rather than guessed, and steps aside only when the standard staff
  is on screen, which carries it already.
- **The frame was drawn half outside the picture, and sometimes entirely outside.** Found while
  adding the thickness setting, by counting the pixels each frame actually paints. Cropped to
  the strip — the framing made for overlays — a card's outline is centred on the edge of the
  strip, which is also the edge of the image: measured, one visible pixel out of the two asked
  for. The translucent bands were worse, drawn just above and just below the strip, so with no
  title banner the top one landed at a negative ordinate: **zero pixels**, an option that simply
  did nothing. Both are now drawn inside the strip, so the whole thickness shows in either
  framing.
- **The page turned one bar too early.** The strip is drawn across the whole width, so the bar
  that overflows on the right is still shown — often almost whole. It was not counted, so five
  bars were visible and the page turned on the fourth. Measured, cursor position at the moment
  of the turn: **57 % to 72 %** of the width, a third of the screen wasted and the eye left
  hanging. A bar now counts as displayed once more than half of it is visible, which is how the
  eye counts it. Same measurement afterwards: **73 % to 91 %, 82 % on average**. A guard comes
  with it — the next window must open on a bar whose beginning is already visible, otherwise
  asking for no lookahead at all would send the cursor off the right edge before the picture
  changed.
- **alphaTab reports each bar about nine times**, and taking it at its word made the new layout
  useless: hundreds of zero-width bars, no bar line left to stop at, and a window that fell back
  to cutting every so many pixels — the lookahead setting then changed nothing at all, which is
  how it was noticed. Measured on a bass tablature: 766 entries for 86 distinct positions. Only
  the distinct abscissae are kept now; on a single line, two bars cannot begin at the same place.
- **An export made while looking elsewhere came out at one frame per second.** This was the
  real cause of the stutter, and it was hiding behind a warning that merely asked the user to
  keep the tab in front — an unreasonable thing to ask of someone waiting three minutes, and
  a request the code did nothing to enforce or even check. Measured on a real three-minute
  export: the first five seconds ran at sixty frames a second, and the remaining hundred and
  eighty-five at **one**, because a hidden page has its animation frames suspended and its
  timers throttled to one wake-up per second. The audio thread is the one clock a browser
  never slows down — a hidden page must keep playing its music — so the export is now paced
  from there, by an `AudioWorklet` whose only job is to tick. Measured again, same scene:
  thirty frames a second whether the tab is in front or behind. The screen still drives the
  loop when it can, since its beats are aligned with the display; a timer remains as a last
  resort should the audio thread itself stop.
- **The picture stuttered against the audio clock, permanently.** The clock that decides when
  a note sounds is the right one to draw from, but it does not advance — it jumps, one sound
  card block at a time. Measured in Chrome: 10.7 ms steps, read by a screen refreshing every
  16.7 ms, so the tablature moved half a step, then a step and a half, forever. The recorder
  meanwhile timestamps each frame with the smooth wall clock, and that mismatch is exactly
  what the eye reads as judder. The two clocks are now combined rather than chosen between:
  the rhythm comes from the wall, and only the origin is servoed to the sound, slowly enough
  that the correction can never be seen. The tremor, whose average is zero, is filtered out;
  the drift, which matters over three minutes, is still tracked.
- **Each frame is now handed to the recorder explicitly** instead of letting it sample the
  canvas on its own schedule. Its sampler is free-running: it misses one frame here and
  doubles another there, which no amount of care in the drawing loop can compensate.
- **An export could be lost at the very last step.** Re-exporting a piece that already had a
  video failed with a bare "Erreur serveur" after the full encoding time — three minutes of
  waiting thrown away. The cause was a rename onto a file that was still open: the export
  panel shows the previous video in a player pointing at the server, and it is still reading
  it when the new one arrives. Windows refuses to rename over an open file. Each export now
  gets a name of its own, so there is nothing to overwrite and no race to lose; the earlier
  files are swept once the new one is safely recorded, and any that resist are swept later.
  Read streams are also closed as soon as the response is, which they were not — every
  interrupted playback used to leave a file handle behind.
- **The scroll no longer stutters.** Measured, the position advanced one pixel per frame for
  over a second, then caught up in a seventeen-pixel jump — a sixteen-fold gap between the
  slowest and the fastest moment. The culprit was the interpolation between one beat and the
  next, asked for afresh on every frame. Rather than repair that computation, it is no longer
  used: the position of each beat is now surveyed once, taking from the tick lookup only what
  it states without error — *which* beat is playing — and reading the exact instant from the
  tick table that produced the audio. Between two beats a monotone Hermite curve decides, which
  passes through every beat exactly, keeps its velocity continuous, and can never overshoot —
  a guarantee that matters here, since an overshoot would make the tablature slide backwards.
- **The export is now paced by the screen refresh** rather than by a timer. A timer delivers
  frames at uneven intervals, which the recorder timestamps as it receives them and the eye
  reads as judder. The timer stays as a backstop, since a backgrounded tab suspends the refresh
  entirely — the video then loses its smoothness but still finishes.
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

- **Turning the page now dissolves instead of cutting.** The window being left is redrawn over
  the new one at a fading opacity, for about two tenths of a second. Nothing slides — that is
  the whole point of choosing fixed bars — but the eye sees where what it is reading came from,
  rather than finding a fresh screen with no warning. The length is counted in window widths
  rather than in milliseconds, since the scene does not know the tempo: the faster the piece,
  the shorter the dissolve, which is the right way round.
- **The rhythm under the tablature can be switched off.** It is on by default, because a fret
  number says where to put the finger and not how long to leave it there — a tablature without
  rhythm only reads to someone who already knows the piece. It takes room, though, and on an
  overlay every pixel counts, hence the switch. It steps aside on its own when the standard
  staff is showing, which already carries the rhythm.
- **The frame's thickness is now a setting**, from a hairline to sixteen pixels, or none at all.
  It is counted on the width of the image rather than its height, and scaled from a reference of
  1920: cropped to the strip, the picture is only a couple of hundred pixels tall, so a thickness
  derived from the height stayed pinned to its minimum — the setting would have done nothing in
  precisely the framing it is most wanted for. At zero there is no line: a card keeps only its
  rounded corners, a glow only its halo.
- **A third layout: fixed bars, moving cursor.** Continuous scrolling has a flaw no measurement
  reveals — everything moves, all the time. The eye follows a digit sliding past instead of
  reading it, and on a tight tablature it never gets to settle. The alternative is as old as
  paper: show a few bars, hold them still, let only the cursor cross them, and turn the page at
  the end. Two rules govern the split. **A bar is never cut** — so the window holds as many as
  fit rather than a number decided in advance, since alphaTab gives each bar the width its
  contents demand. And **you see what is coming** — the last bars of a window are shown ahead of
  time and become the first of the next, because turning the page onto the entirely unknown is
  exactly where one loses the thread. How many bars of lookahead is a setting; one by default.
  The window is deduced from the cursor's position alone, with no memory, so jumping anywhere in
  the piece shows the same picture as having played it from the start. The edge fade is dropped
  here: it exists so a bar does not appear abruptly while scrolling, but in this layout the last
  bar is precisely the one being offered to read, and dimming it would hide what was just added
  to be seen.
- **The zoom now keeps its promise in that layout.** "Four bars on screen" was giving three. The
  median bar width is enough to set a zoom while scrolling — a slightly wide bar simply arrives
  slightly later — but not here, where a bar that overflows is not trimmed but pushed to the
  next window. Measured on a real tablature: bars from 166 to 243 pixels for a median of 224, so
  four real bars overrun four median bars about half the time. The window is now sized on what
  the requested count actually occupies, at the third quartile of every position in the piece —
  not the maximum, which would let the opening bar and its clef, key signature and tuning shrink
  the whole piece for one exception.
- **An export that did not keep up says so.** The frame rate actually delivered is measured
  and compared to the one that was asked for; a shortfall is reported next to the file rather
  than discovered halfway through an edit. A three-minute encode that silently produced a
  useless file is the worst outcome this tool can have, and nothing was watching for it.
- **`tools/cadence.js`**, which reads the timestamps an encoder wrote into a WebM and reports
  how evenly the frames actually fall. The eye is a poor judge of a stutter — it sees one
  without being able to name it — and a screenshot keeps no trace. This settles the question
  from the file itself, and without requiring ffmpeg, which this project promised never to
  need.
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
