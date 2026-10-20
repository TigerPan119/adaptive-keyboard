# Adaptive Keyboard

A browser-based MIDI tool that uses camera hand tracking to adjust the split between two instrument sounds. It also includes real-time chord recognition and performance visualization.

## Try it online

**No installation required:**

- **[Open Adaptive Keyboard — Hand Split](https://tigerpan119.github.io/adaptive-keyboard/)**
- **[Open Chord Theory](https://tigerpan119.github.io/adaptive-keyboard/chord-theory.html)**

Use the navigation at the top of either page to switch between **Hand Split** and **Chord Theory**.

## What you need

- A desktop browser. Chrome or Edge is recommended.
- A MIDI keyboard or controller connected to your computer, if you want to use a physical keyboard.
- A camera that can see the full keyboard and both hands, if you want to use Hand Split.
- An internet connection to load the default GeneralUser GS SoundFont. A local SoundFont file, such as `.sf2`, is optional.
- Permission for the website to access your camera and MIDI devices when prompted.

> **A default SoundFont is included through an online resource.** Hand Split automatically loads GeneralUser GS (approximately 8.4 MB). In Chord Theory, turn on **SoundFont audio** to load it. You can still select your own local SoundFont. Browser audio may require a click or key press before playback starts.

## Hand Split: use different sounds for each hand

1. Open the [Hand Split page](https://tigerpan119.github.io/adaptive-keyboard/).
2. Click **Start camera** and allow camera access. Select a different device under **Camera** if needed.
3. Position the camera so it can see the full keyboard and both hands. Use good lighting.
4. Calibrate the keyboard: try **Auto detect edges**, or click **Set left edge** and **Set right edge**, then click the corresponding keyboard edges in the camera view.
5. Under **Keyboard range**, set the lowest and highest notes to match your instrument. A standard 88-key piano uses **A0–C8**. You can also start with the 49-key or 61-key presets and adjust them to your device.
6. Select your keyboard under **MIDI input**. If it does not appear, click the refresh button and check your MIDI permissions.
7. Wait for **GeneralUser GS** to finish loading. To use a different SoundFont, click **Choose or drop SoundFont**, or drag a local SoundFont file onto the page.
8. Once the file loads, select **Left sound** and **Right sound**, then adjust the volume.
9. Start playing. The blue region uses the left sound, and the red region uses the right sound. The split position changes with the tracked hand positions.

### Useful controls

- **Split anchor → Palm / Thumbs:** choose which hand landmarks determine the split. Palm is generally more stable; Thumbs follows the reach of your thumbs more closely.
- **Performance mode:** reduce tracking and interface workload if playback or visuals feel sluggish.
- **Diagnostics:** inspect hand tracking, MIDI input, audio, and note routing.

The camera tracks hand positions; actual notes come from MIDI input. Until hands are tracked, the app uses the midpoint of the configured keyboard range as a fallback split. Occlusion, poor lighting, and crossed hands can affect tracking.

## Chord Theory: recognize chords and visualize notes

1. Open the [Chord Theory page](https://tigerpan119.github.io/adaptive-keyboard/chord-theory.html).
2. Connect your MIDI keyboard and select it under **MIDI input**.
3. Play several notes together to see the recognized chord, notes, and on-screen keyboard markers.
4. For browser audio, enable **SoundFont audio** and wait for GeneralUser GS to load, then choose a preset under **Sound**. To replace it, use **Choose or drop SoundFont**.
5. Under **Recognition → Note spelling**, select **Sharps** or **Flats** to change how note names are displayed.
6. Use **Visualization** to adjust note trails, colors, backgrounds, and other display options.

**You can also try it without a MIDI keyboard:** click the on-screen piano keys. Hold **Q** on your computer keyboard to sustain notes while clicking additional keys to form a chord. Chord recognition itself does not require a camera or a SoundFont.

### Play a MIDI file

Under **Autoplay**, enable **Autoplay mode**, use **Choose or drop MIDI** to select a `.mid` or `.midi` file, select a **MIDI output**, and use the playback controls.

This feature sends playback to an external MIDI instrument. To hear that output, the external instrument or a connected software sound source must produce the audio.

## Troubleshooting

### There is no sound

- In Hand Split, make sure a SoundFont is loaded and both sound presets are selected.
- In Chord Theory, make sure **SoundFont audio** is enabled, a SoundFont is loaded, and a preset is selected.
- Check the app volume, system audio output, and whether the browser tab is muted.
- Click the page or a piano key and try again so the browser can allow audio playback.
- For external MIDI output, check the audio output of the external device or software sound source.

### My MIDI keyboard does not appear

- Make sure the keyboard is powered on, connected, and supports MIDI.
- Allow the website's MIDI permission, then click **Refresh MIDI** or reload the page.
- Try closing other music software that may be using the device.
- If you see **Web MIDI unsupported**, try desktop Chrome or Edge.

### The camera will not start, or tracking is unstable

- Check camera permissions in both your browser and operating system.
- Close other applications that may be using the camera, and select the correct device under **Camera**.
- Improve lighting, reduce hand occlusion, keep the full keyboard visible, and recalibrate.

### The default SoundFont fails to load

Check your connection and try reloading the page. The default SoundFont is downloaded from jsDelivr; a blocked CDN or interrupted download can prevent loading. You can also select a local SoundFont manually.

The file picker accepts SF2, SF3, DLS, SFOGG, and SFONT files. Start with a known working SF2 file when testing.

### The page loads slowly

Hand tracking, the audio engine, and some interface dependencies load from external CDNs. Keep an internet connection available. If a dependency fails to load, check your connection and refresh the page.

## Run locally

The project is a static website and requires no build step. With Node.js installed, run this command from the project directory:

```sh
node server.js
```

Then open:

- Hand Split: <http://127.0.0.1:5173/>
- Chord Theory: <http://127.0.0.1:5173/chord-theory.html>

The local version uses the same online default SoundFont. To use another bank, select a local file in the app. The original 154 MB `undertale.sf2` is not included in this repository.

## Project structure

- `index.html`: Hand Split page.
- `chord-theory.html`: Chord Theory page.
- `src/js/`: hand tracking, calibration, MIDI, audio, and interface logic.
- `src/js/chord-theory/`: chord recognition, visualization, and practice modules.
- `src/styles/`: page styles.
- `tests/`: test scripts.
- `server.js`: local static file server.

The website is published with GitHub Pages from the root of the `main` branch. Updates to that branch automatically trigger a new deployment.

## Default SoundFont credits

The default bank is **GeneralUser GS** by **S. Christian Collins**, loaded as a compressed SF3 file from a pinned revision of the [SpessaSynth repository](https://github.com/spessasus/SpessaSynth). The CDN response supports cross-origin loading.

- [GeneralUser GS project and downloads](https://schristiancollins.com/generaluser.php)
- [Default SF3 resource](https://cdn.jsdelivr.net/gh/spessasus/SpessaSynth@5bef3d230d63e73946d4c77342eef953d6542fee/soundfonts/GeneralUserGS.sf3)
- [SoundFont license and attribution](assets/GENERALUSER-LICENSE.txt)

GeneralUser GS uses its own license, separate from the synthesizer code. The default bank provides general-purpose instrument presets; it does not reproduce the original Undertale SoundFont.
