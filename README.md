# Adaptive Keyboard

Browser prototype for a dynamic hand-aware MIDI split.

The app is intentionally build-free: it uses native browser ES modules and can
be served by the included Node server or any static host such as GitHub Pages.

## SoundFont asset

The 154 MB `assets/undertale.sf2` file is not included in this repository because
it exceeds GitHub's regular-file size limit. Copy your local SoundFont to that
path for default playback, or choose a SoundFont file with the app's upload control.

## Run

```powershell
C:\Users\minit\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe server.js
```

Then open:

```text
http://127.0.0.1:5173
```

Available pages:

- `http://127.0.0.1:5173/` - camera-driven adaptive hand split
- `http://127.0.0.1:5173/chord-theory.html` - live MIDI chord recognition

## First test flow

1. Open the page in Chrome or Edge.
2. Click `Start camera`.
3. Click the two visible ends of the keyboard in the camera view. Either order works.
4. Keep the default range at `A0` to `C8` for a traditional 88-key piano, or adjust it for a smaller MIDI keyboard.
5. Connect a MIDI keyboard and click the refresh icon if it was not detected automatically.
6. Wait for the default SoundFont to load, or upload a different `.sf2`, `.sf3`, or `.dls` SoundFont file.
7. Choose a left-hand preset and right-hand preset.
8. Move both hands over the keyboard. The blue region is routed to the left sound, and the red region is routed to the right sound.

## Notes

- V1 assumes good light, no heavy hand occlusion, and no crossed hands.
- Web MIDI works best in Chrome or Edge.
- MediaPipe Hands, Lucide icons, VexFlow, the SoundFont engine, and the Autoplay MIDI parser are loaded from CDN.
- If the hands are not tracked yet, incoming MIDI uses the keyboard range midpoint as a fallback split so you can still test SoundFont playback.
- Do not commit large or copyrighted SoundFont files unless you have redistribution rights.

## Project structure

```text
.
|-- index.html              # Semantic page structure and third-party CDN scripts
|-- server.js               # Local static server
|-- src/
|   |-- js/
|   |   |-- core.js         # DOM references, shared state, and configuration
|   |   |-- keyboard.js     # Note parsing, keyboard mapping, and split math
|   |   |-- music.js        # Shared note names, pitch classes, and parsing
|   |   |-- ui.js           # Status, help, diagnostics, and control rendering
|   |   |-- vision.js       # Camera, MediaPipe tracking, and canvas overlay
|   |   |-- calibration.js  # Manual and automatic keyboard edge calibration
|   |   |-- audio.js        # Web Audio and SoundFont playback
|   |   |-- midi.js         # Web MIDI input and note routing
|   |   |-- chord-theory/
|   |   |   |-- camera-keyboard.js # Camera capture and four-corner keyboard perspective fitting
|   |   |   |-- chord-engine.js # Pure chord recognition and inversion logic
|   |   |   |-- chord-staff.js  # Lazy-loaded VexFlow staff notation renderer
|   |   |   |-- midi-autoplay.js # MIDI file parsing, external scheduling, and transport state
|   |   |   `-- main.js         # Chord Theory MIDI state and rendering
|   |   `-- main.js         # Event wiring and application bootstrap
|   `-- styles/
|       |-- tokens.css      # Design tokens and base controls
|       |-- layout.css      # Page, stage, and sidebar layout
|       |-- components.css  # Cards and interactive controls
|       |-- overlays.css    # Help and drag-and-drop overlays
|       |-- chord-theory.css # Chord display, history, and piano keyboard
|       `-- responsive.css  # Mobile and narrow-screen adaptations
|-- chord-theory.html       # Chord Theory page
|-- tests/                  # Pure music-theory tests
`-- assets/                 # Optional local SoundFont assets
```

Keep feature logic in its owning module and use `main.js` only for wiring user
events. CSS files are loaded in the order listed above, so later layers may
intentionally refine earlier rules.

## Validation

Check every JavaScript module before running the app:

```powershell
Get-ChildItem src\js\*.js | ForEach-Object { node --check $_.FullName }
node tests\chord-engine.test.mjs
```
