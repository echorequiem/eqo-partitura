# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-20

First stable release of Partitura · Echo Studio for Windows 10 / 11 (64-bit) and Linux (x86_64).

### Added
- **Linux.** `Partitura-x86_64.AppImage`: a single file for any current x86_64 distribution. It uses the static
  AppImage runtime, so it needs no libfuse2, and it falls back automatically where the system blocks Chromium's
  sandbox. Window icon and desktop entry are included. GitHub Actions builds it next to the Windows exe and starts
  it once on a virtual display as a check.
- **Open source.** The source code is public under the MIT license. The Partitura / Echo Masterworks names and
  logos stay with the official app.
- **Partitura · Echo Studio.** Echo Notes is now Partitura, the first app of the Echo Studio family, built on the
  Echo Masterworks brand system: the shared Diapason design language (diapason.css, used unchanged) with the
  Studio violet as the only accent, the Diapason serif font, glass bar and cards with the Echo cut corner, the
  signature corner frame, soft spring motion and the Echo interface sounds (switchable). Layout: sidebar with the
  four steps, glass bar with the main action top right, cards, and a glass player bar on the preview page.
  New app icon (neon bass clef), the coloured Echo Masterworks seal in the splash and the render indicator.
  Saved projects and colours move over from Echo Notes automatically.
- Language menu in the Echo look (glass list, keyboard friendly) instead of the native dropdown, whose white list
  was unreadable in the dark theme.
- Smoother: page changes about 2× faster and steady 60 fps preview playback — the design language's
  `::selection` rule no longer runs over the thousands of nodes of the score SVG.
- New look and layout: dark slate windows with thin frames, textured bronze buttons, ✓ / ✗ setting rows
  (light theme: warm parchment). Every page was reorganised: page 1 in two columns (score + projects, video
  format + glow colour), page 2 with a tabbed side panel (background / music / intro-outro), page 3 with the
  transport under the score and tempo / timing / view panels, page 4 with the final preview next to the
  summary, output and render panel. Back / next buttons sit in a bar at the bottom of every page.
  The stylesheet was rewritten from scratch (old, overlapping rules removed). Buttons are coloured by what
  they do: brown = everyday / back, green = next / play / start render, blue = preview / save / export,
  red = clear / delete / cancel; the light theme has its own paler button set.
- Splash screen ("Echo Notes" / "Echo Masterworks") shown for 3 seconds while the app loads.
- Seeking in the preview: seek bar with time display, click a note or drag the strip to start from there,
  ←/→ previous/next note, Shift+←/→ ±5 s, Home/End.
- Glow for everything that belongs to the sounding note: stems and beams of beamed notes, ledger lines, ornaments
  (trill, mordent, turn), accidentals, articulations, fermatas, dynamics, hairpins, trill lines, 8va brackets and
  pedal markings, both in the preview and in the rendered video.
- Fermatas are part of the timing: a fermata note (or rest) is held ×2.0 by default (MuseScore 4's default for a
  normal fermata), adjustable from ×1 to ×6 and saved with the project.
- Always-visible color picker (saturation/value area, hue bar, hex field) with saved colors.
- Every note glows for its own written length (a quarter for one beat, a half for two…), rests glow too, and
  overlapping glows (both hands, held notes under faster ones) stay lit together. Slurs and ties glow over
  their notes; beams, pedals and hairpins over their range. Same in the preview and in the video.
- Two glow colours for two-staff scores (piano etc.): one for the upper staff, one for the lower staff(s).
- Intro and outro screens: ordered lists of screens before and after the score (any number of videos and
  text screens, reorderable). Each screen is a video, a text template, or both (text over the video). Three
  templates (Classic, Modern, Cinematic) with title, composer, opus / catalogue no. and caption, drawn at the
  output resolution so they stay sharp at every size and aspect ratio; the title and composer are filled in
  from the score. The screen videos' own sound is mixed into the final video.
- A screen with both a video and text can play them in order (text first or video first) or together.
- Trills shimmer at a real trill speed (32nd notes at the local tempo), together with their wavy line;
  slurs and ties fill from left to right like running water, following the playhead. Same in the video.
- Text in the notation (tempo, words, 8va, dynamics…) uses Edwin, MuseScore's text font — also in the video
  and the strip image; the rest of the app keeps its font. Measure numbers are no longer drawn.
- New 3.5 s splash: the logo is cut into rings that spin in and lock from the centre, with a bloom, a golden
  light sweep, echo rings and orbiting sparks.
- Smoother start: the splash animates only after the main window has loaded (no stutter), the main window
  fades in once fully drawn (no unstyled flash, no oversized logo), and OSMD (~1.4 MB) loads on demand —
  the start-up script went from 1.7 MB to 0.25 MB. The UI logo is a 5 KB image instead of 350 KB.
- Render page: a preview of the finished video (intro screens → score → outro, with background, effects and
  sound) drawn by the render's own code at a smaller size, with play / pause, seeking and a timeline of the parts.
- Lead-in before the score (2 s, can be switched off): the score fades up and its columns rise into place
  from left to right, the playhead appears, then the music starts — no hard cut into the music. After the
  music the same in reverse: the playhead shrinks, the score is wiped away column by column, fade to black.
- App theme switch in the header: two icon buttons (dark / light) instead of an emoji.
- Dark score theme: notes are painted white directly, so the glow is exactly the chosen colour (it used to
  come out lighter than in the light theme).
- Atmosphere effect for the background: a very light drifting haze and tiny embers, intensity adjustable
  (subtle by default); identical in the preview and the video.
- Haze and embers have separate switches and intensities.
- Pause / resume a running render.
- Reusable Echo Masterworks intro animation (brand/echo-masterworks-intro): logo reveal, an echo ring on every
  hit of the sound, the app name letter by letter; the sound's silence is skipped automatically.
- Light theme reworked with soft greys (it was too bright to read).
- New splash screen: the Echo Masterworks logo with "Echo Notes" and the intro sound; the app opens when the
  sound has finished.
- The preview and the video always last until the music track ends (no more cut-off endings).
- Score strip export can include the background photo, stretched across the strip and softly blurred.
- The score strip is always ONE image from the first to the last measure. PNG is written by a streaming encoder,
  so any length keeps full HD resolution; JPEG / WebP are scaled down only when a strip exceeds their size limits.
- Render screen: animated loader (moves only while rendering), large percentage and estimated time remaining.
- Faster rendering: on CPUs without a GPU video encoder, two (or more, on bigger CPUs) encoders work in
  parallel on alternating 2-second GOPs; same codec, settings and bitrate, so quality is unchanged
  (1080p60 test: 65.7 s → 48.7 s). A GPU encoder is used automatically when the system offers one.

### Fixed (preview & sync)
- Note size: the first view now really is the size the slider shows (OSMD reset the zoom while loading).
  Dragging the slider scales the preview instantly and re-lays out the score once on release, keeping the
  playback position and play state; the play button and number fields no longer shift the layout.
- While the music track plays, the preview follows the music's own clock, so notes and music can no longer
  drift apart or start out of step. Rendered videos were verified separately: notes and audio stay within one
  frame (16.7 ms at 60 fps) from the first to the last beat, with no drift.
- The tempo read from the score is no longer rounded to whole BPM (e.g. 92.5 stays 92.5).
- A beam now stays lit for its whole group, like a pedal mark (before, it glowed only on the first note).
- With a background photo or video, the light score theme no longer washes the media out like a white
  curtain: the theme only colours the notes, the media is shown over black as in the background studio.
- 4-step wizard: settings → background → preview → render.
- Frame-exact MP4 (H.264) / WebM (VP9) rendering with WebCodecs; automatic WebM fallback when H.264 is unavailable.
- Optional music track (MP3, WAV, OGG, M4A, FLAC) with start offset, volume and "extend video to music" option; muxed as AAC (MP4) or Opus (WebM) and played in sync in the preview.
- Compressed `.mxl` support.
- The tempo written in the score is applied automatically; tempo changes become editable tempo diamonds.
- Rendered videos are streamed straight to disk (native "Save as" dialog), so long 4K renders no longer need the whole file in memory; "Show in folder" after rendering.
- HD score-strip export (PNG / JPEG / WebP / SVG) through a save dialog.
- Projects store the music track and its settings as well.
- Themed in-app dialogs instead of the browser's alert/confirm, plus keyboard shortcuts (Space, Home, Ctrl+S, Esc) and drag & drop for background and music files.
- Embedded fonts (Manrope; Noto Sans JP / SC for Japanese / Chinese); the app works fully offline.
- A single portable `Echo Notes.exe` (no installer yet) with a proper multi-size icon, placed at the top of the project folder by `npm run dist:win`.
- Version label in the header, README (EN / TR), MIT license and GitHub Actions workflows.

### Changed
- Security hardening: sandboxed renderer with context isolation and no Node.js access; a minimal preload bridge; IPC that checks the sender and validates every argument; private `app://` scheme with a strict Content-Security-Policy; new windows, external navigation, `<webview>` and permission requests are blocked; no DevTools or menu in release builds.
- Project files are read and written by the main process only.
- Clean folder structure (`electron/`, `src/core`, `src/platform`, `src/ui`, `src/styles`, `build/`, `scripts/`).
- Release packages contain only the built app (no sources, no `node_modules`).

### Fixed
- The OSMD graphical-note lookup now has a working fallback for OSMD 2.x.
- `npm run dev` now starts Electron (it previously started only Vite).
- The custom `app://` scheme is recognised correctly by the IPC sender check.
