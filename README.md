# NULL-TECH

A dual-input virtual keyboard with a laser-holographic look. You can type in two ways:

- **Touch Mode:** type on the Surface touchscreen with a finger, the Surface Pen, a mouse or the trackpad.
- **Air Mode:** type with your fingers above the desk while your **phone's camera** watches your hands. The phone streams video to the Surface over Wi-Fi (WebRTC), and **MediaPipe** finds your fingertips on the Surface.

Both modes feed the same keyboard engine, editor, settings and visuals.

Target setup: Microsoft Surface Pro 7 (i7, 16 GB) and a Samsung Galaxy S25 Ultra. No cloud, no API keys, no extra hardware.

> **Version 1.1.0: NULL-TECH design system.** The interface was redesigned around a calm graphite surface language, a custom fingerprint brand mark, and instrument-grade camera, calibration and performance views. Functionality is unchanged and the same tests pass. See [Design system](#design-system).
>
> **Version 1.0.0.** All seven stages of the specification are implemented and tested automatically. That includes the full camera pipeline, using MediaPipe's own hand photos as a fake camera.
> **Not yet tested on the real devices** (Surface touchscreen and pen, the S25 Ultra camera, real hands typing in the air). Read [Known limitations](docs/LIMITATIONS.md) before judging Air Mode.

---

## Quick start on Windows (Surface Pro 7)

**Requirements:** Node.js **22.18 or newer** (22 LTS), Git, and Microsoft Edge or Chrome. The Surface and the phone must be on the **same Wi-Fi**.

Open **PowerShell**:

```powershell
winget install OpenJS.NodeJS.LTS        # skip if `node -v` already shows v22.18+
git clone https://github.com/qaessafty-arch/Null-Keyboard-.git neo-type
cd neo-type
git checkout ccr-b9a5f49f-5ewgay        # until this branch is merged
npm install                             # also fetches the 8 MB hand-tracking model
npm start                               # builds, then serves HTTPS on port 8443
```

`npm start` prints two addresses:

```
On this PC:   https://localhost:8443
On the phone: https://192.168.x.x:8443
```

1. On the **Surface**, open `https://localhost:8443` in Edge. The certificate warning appears once: choose **Advanced → Continue**. See [Trusted HTTPS with mkcert](#optional-trusted-https-with-mkcert) to remove it.
2. If **Windows Firewall** asks about Node.js, allow it on **Private networks**. Your Wi-Fi must be set to *Private* in Windows network settings.
3. Touch Mode works right away. Air Mode needs the phone; see the next section.

Press **F11** (or the ⛶ button) for fullscreen. To stop the server, press **Ctrl+C** in PowerShell.

## Connecting the Samsung phone

1. On the Surface: **Air Mode → Connect phone → Start pairing**. A QR code and a 6-character code appear.
2. On the S25 Ultra, scan the QR code with the **Camera** app and open the link in Chrome or Samsung Internet. You can also type the "On the phone" address and enter the code.
3. On the certificate warning, choose **Advanced → Proceed**. Phones only allow the camera on HTTPS pages, which is why the server uses HTTPS.
4. Tap **Start camera** and allow camera access. The rear camera is chosen by default; if the phone offers several lenses, you can switch between them on the phone page.
5. The Surface shows **Phone connected** with a live preview, the video resolution, FPS, round-trip time, packet loss and bitrate. The red **CAM** badge in the top bar means the phone camera is live.

**Camera placement:** prop the phone about **35–50 cm above the desk** (a stack of books works) and point it down at your hands. Tilting it so it looks from slightly in front makes fingertip presses easier to see. Keep both hands in the picture, avoid direct sunlight, and use a plain matte surface.

If the phone loses Wi-Fi, gets locked, or either page reloads, the two sides reconnect on their own. **Disconnect** on the Surface turns the phone's camera off.

## Calibration

Open **Calibrate** with the phone connected. It takes about a minute:

1. **Camera position.** Live checks: both hands visible, hand size in the frame, framing, and lighting (measured from the video).
2. **Keyboard area.** Drag the four corners onto the desk where you want to type, or set each corner by holding your index fingertip still on it. The full key grid is drawn onto the live video, so you can see where every key is.
3. **Resting hands.** Hold your hands still in typing position for 3 seconds. This records your neutral finger pose and natural jitter.
4. **Press calibration.** Tap the prompted keys (F, J, D, K, Space …) at least 6 times. NULL-TECH learns which way your fingertips move when you press from this camera angle, and how far. It also reports how clearly a press stands out from jitter and how many presses landed on the right key.
   - If presses aren't picked up from your camera angle, choose **Use dwell instead**: hold an index fingertip still on a key to type it.
5. **Test.** Type here and watch the keys under your fingertips light up. Then choose **Start air typing**.

The calibration is saved on this device (IndexedDB). You can **Recalibrate** from the Air Mode panel or Settings at any time.

---

## Features

| Area | What you get |
| --- | --- |
| Keyboard | Full US QWERTY: letters, digits, punctuation, Backspace, Enter, Space, Tab, Esc, Shift ×2, Caps Lock, Ctrl, Alt, Fn, arrows. The Fn layer gives F1–F12, Home/End/PgUp/PgDn and Delete |
| Unified engine | One engine handles every input source (`TOUCH`, `PEN`, `MOUSE`, `AIR`). Modifiers can be held or tapped once to apply to the next key; it also handles Caps Lock, hold-to-repeat and duplicate suppression, and releases keys stuck after a window blur, tab switch, mode switch or lost tracking |
| Touch Mode | One Pointer Events path for finger, Surface Pen, mouse and trackpad, with multi-touch chords (hold Shift with one finger, type with another) |
| Air Mode | Phone → WebRTC (local network only) → MediaPipe Hand Landmarker in a **Web Worker** (GPU, with CPU fallback) → One Euro smoothing → perspective mapping onto the keyboard plane → press detection → the engine |
| Press detection | **Motion:** a press is calibrated fingertip motion (relative to the hand, including depth), with these safeguards:<br>• hysteresis between press and release thresholds<br>• only the finger that moved most on that hand can press<br>• confidence gate, debounce and cooldown<br>• the key is taken from where the fingertip hovered just before the press<br>• a slowly adapting baseline absorbs posture drift<br>**Dwell:** the fallback method |
| Visual feedback | Hovered keys light up, fingertip markers sit on the keyboard (with a fill ring while dwelling), key-press animation and ripples, landmark overlay on the camera preview, readout of the last gesture, tracking-lost warning, active-hand labels with confidence |
| Editor | Caret and selection, Shift+arrows, Ctrl+A/C/X/V/Z/Y, word delete, undo/redo, character/word/line counts, Copy, TXT download, clear with confirmation. The draft is autosaved to IndexedDB |
| Look | Laser (red) and Holo (cyan + red) themes. A WebGL laser surface sits behind the keys and the home screen has a 3D hero. Works in landscape and portrait |
| Performance | High / Balanced / Low quality, with automatic step-down when FPS stays low. Tracking rate (15/24/30 Hz) and GPU/CPU inference are configurable. Three.js is loaded only when needed |
| Monitor | Every number is measured: render FPS and frame time, input latency, WebGL cost, long tasks, hand-detection rate, inference time, frame-to-result time, air press latency, camera resolution and FPS, RTT, packet loss |
| PWA | Installable and works offline after the first visit. The hand model and wasm are cached the first time Air Mode runs |
| Privacy | The camera turns on only after you tap Start on the phone. Video goes peer-to-peer on your network and is never recorded or uploaded. The signaling server only carries connection setup messages and validates each one (size limit, schema, rate limits, same-origin only) |

---

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Build, then serve HTTPS on your LAN at port 8443 (`server/index.ts`). This is the normal way to run it |
| `npm run serve` | Serve an existing build. Set `PORT=9000` to change the port, or `NEO_HTTP=1` for plain HTTP (localhost only) |
| `npm run dev` | Vite dev server at http://localhost:5173, for Touch Mode development |
| `npm run dev:lan` | Vite dev server over HTTPS on the LAN, for Air Mode development with the phone |
| `npm run build` | Type-check and build into `dist/` |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests in Chromium (Playwright), including the fake-camera pipeline. First run on a new machine: `npx playwright install chromium` |
| `npm run setup:assets` | Re-copy the MediaPipe wasm and re-download the hand model (this runs automatically after `npm install`) |

### Optional: trusted HTTPS with mkcert

This removes the certificate warnings and lets the Surface install NULL-TECH as an app.

```powershell
winget install FiloSottile.mkcert
mkcert -install
mkdir certs
mkcert -cert-file certs/cert.pem -key-file certs/key.pem localhost 127.0.0.1 192.168.x.x   # your Surface's LAN IP
npm start
```

To make the phone trust it too: run `mkcert -CAROOT`, copy `rootCA.pem` from that folder to the phone, and install it as a **CA certificate**. On Samsung phones that's under *Settings → Security and privacy → More security settings → Install from device storage*; the menu path varies by One UI version. Without this step the phone still works after **Proceed**.

---

## Architecture

```
PHONE  #/camera ── getUserMedia (rear) ── RTCPeerConnection ──┐  video, LAN only
                └─ WebSocket /signal ──┐                      │
SERVER server/ (HTTPS + signaling hub) ┘  SDP/ICE only        │
SURFACE HostLink ◄────────────────────────────────────────────┘
   └► HandTracker: requestVideoFrameCallback → ImageBitmap → Web Worker (MediaPipe)
        └► HandSmoother (identity + One Euro) → AirInput: homography → KeyGeometry hit-test
             → PressDetector (motion / dwell) ─┐
Touch / Pen / Mouse → usePointerKeyboard ──────┴► KeyboardEngine ► editor · key visuals · sound · ripples · metrics
```

```
server/            HTTPS static server, signaling hub (+ unit tests), certificates, Vite plugins
src/
  communication/   signaling protocol + client, WebRTC helpers, HostLink (Surface), PhoneLink (phone)
  features/        keyboard-engine, touch-mode, hand-tracking (worker, detectors, smoother),
                   gesture-recognition (features, PressDetector), air-mode, text-output
  engine/          coordinates (homography), collision (key geometry), calibration, input, performance
  rendering/       Three.js (laser surface, hero), effects
  pages/           Home, Workspace (Touch/Air), Connect, Phone camera, Calibration, Settings, Performance, About
  components/ stores/ hooks/ styles/ types/ utils/
tests/             unit/ integration/ e2e/ (+ fixtures: MediaPipe hand image as fake camera)
docs/              USER_GUIDE.md, LIMITATIONS.md
```

## Testing report (2026-11-20, Linux CI container, headless Chromium)

| Suite | Result |
| --- | --- |
| `npm run typecheck` | ✅ no errors |
| `npm test`: 8 files, **104 tests** | ✅ all pass |
| `npm run test:e2e`: **25 tests** (18 UI + 7 camera pipeline) | ✅ all pass |
| `npm run build` | ✅ app 374 KB JS (120 KB gzip); Three.js and the tracking worker in separate chunks |

What the tests cover:

- **Unit tests:**
  - the keyboard engine (every key, modifiers, latching, repeat, duplicates, stuck keys);
  - the text model;
  - the signaling hub (pairing, relay, resume, expiry, rate limiting, hijack attempts, invalid messages);
  - homography and key hit-testing;
  - the One Euro filter and hand identity;
  - the press detector (hover never presses, hysteresis, finger dominance, confidence gate, debounce, look-back key choice, baseline drift, tracking loss, dwell).
- **UI e2e tests:**
  - mouse typing, a **real two-finger touch chord** and **pen** input injected through Chrome DevTools;
  - mode switching keeps the text;
  - settings and draft persistence;
  - **offline PWA**;
  - WebGL on/off;
  - measured metrics;
  - zero console errors on every screen;
  - no portrait overflow;
  - the Dynamic Island expands into honest controls and switches **light / dark** appearance (persisted; the keyboard deck stays dark);
  - Copy shows its success morph only after a real clipboard write.
- **Camera e2e tests:** Chromium's fake camera plays MediaPipe's own two-hand test photo, and the tests check:
  - pairing and a 1280×720 WebRTC stream;
  - a wrong code is rejected;
  - **reconnection** after either side reloads;
  - **Disconnect turns the phone camera off**;
  - MediaPipe detects **both hands at about 95 %** in the worker;
  - the calibration wizard completes and still fingertips **dwell-type real keys, reported as `AIR`**, through the shared engine;
  - the calibration survives a reload;
  - the **camera window** docks without covering text, floats, snaps to corners, re-docks and closes, without ever making the page scroll.
- **Manual check:** the production `npm start` server ran the whole pipeline under its Content-Security-Policy, including GPU inference in the worker, with zero console errors.

**Not verified here:**
- **Real hardware.** The touchscreen, the Surface Pen, the S25 Ultra over real Wi-Fi, and GPU speed on Iris Plus graphics. This container renders WebGL in software: MediaPipe took about 1.8 s per frame on GPU and about 130 ms on CPU (with two hands).
- **Motion presses with real hands.** A still image can't press, so motion detection is covered by unit tests with synthetic motion only. Expect to tune sensitivity and the activation threshold on the real setup.

## Design system

NULL-TECH's interface follows one rule: *precision is beautiful; complexity should disappear.*

| Element | Definition |
| --- | --- |
| Brand mark | A custom fingerprint: seven open loop ridges cut by a diagonal **∅** (null) slash, with a brand-green core. It comes from one pure function (`src/brand/fingerprint.ts`) that feeds the React component, favicon, PWA icons and boot splash (`node scripts/gen-brand.ts`). |
| Where the mark appears | Logo, boot splash (scanning), Connect page states, calibration header (scanning → active → success), tracking indicator in the nav, a 2 % watermark behind the workspace, favicon. It is used sparingly on purpose. |
| Colour | Graphite surfaces `#090B10 / #11141C / #191D27`, text `#F5F6FA / #9299A8`. **Brand green `#32E6A0`** is for primary actions, completion and live tracking. **Laser red `#FF365D`** is only for the laser keyboard and live-camera states. Status scale: excellent / good / warning / critical. |
| Appearance | **Light and dark** from one token set (`src/styles/tokens.css`), chosen in Settings › General or the Dynamic Island: *Auto* (follows the system), *Light*, *Dark*. Applied before first paint, so there is no flash. The keyboard deck and camera views stay dark in both, like the display of a physical device (`.appearance-dark` scope). Components use tokens only, no hard-coded colours. |
| Materials | **Liquid Glass**, in two tiers so the GPU stays free for the camera pipeline. *Floating layers* (navigation, Dynamic Island, camera window, ornaments, toasts, dialogs) get real backdrop blur + saturation, a 1 px specular rim that is brightest where light hits, a top sheen, and a reflection that follows the pointer (`useSpecular`). *In-flow surfaces* (panels, cards, the editor) get the same rim and sheen without blur. Falls back to solid surfaces under *reduce transparency* and Low quality (`src/styles/materials.css`). |
| Dynamic Island | One black capsule in the navigation (`components/island/`) carries the live state of phone, camera, tracking and laser. *Compact:* context-aware label (e.g. `Pair XH8 K3B` while waiting, `Live · 2 hands`) plus status dots. *Activity:* morphs wider for real events only (phone connected / lost, hands found / lost, calibration saved, theme change). *Expanded:* tap for controls (connect / disconnect, camera and tracking stats, laser theme, appearance). Everything it shows comes from the live stores. |
| Spatial elements | **Camera window** (`components/spatial/FloatingWindow.tsx`): window controls (close, minimise, enlarge), drag by the title bar, spring snap to the nearest corner. By default it rests in a **dock slot** the layout reserves for it (beside the text in the editor; in the Air panel on phones), so it never covers content until you drag it out. **Ornaments** are the floating control capsule above the workspace. **Tilt cards** on Home lean toward a mouse pointer on a spring (not under a finger or pen). **State views** (`StateView`) are one family of quiet states for idle, loading, connecting, calibrating, disconnected and success, built from the fingerprint mark and SVG rings. |
| Type | SF Pro Display / Text, then Segoe UI Variable (native on the Surface), then Inter. SF Mono, JetBrains Mono or Cascadia for measurements. Sentence-case labels, no shouty tracking. |
| Space and shape | 4 px grid; radii 6 / 8 / 12 / 16 / 22. |
| Motion | **Motion** (`motion/react`) for layout morphs only: shared-layout thumbs for segmented controls, nav and tab bar; route transitions; toasts; the island; window drag and snap. Three spring presets in `src/design/motion.ts` (snappy, fluid, gentle). Press and hover feedback stay in CSS. Only transform and opacity animate, and per-frame camera drawing never goes through React. Everything respects *reduce motion* (`MotionConfig reducedMotion="user"`). |
| Micro-interactions | Every control answers: spring thumbs on segmented controls, pressed states, focus rings, window-control glyphs on hover, Copy → *Copied ✓* only after a real clipboard write, and focus mode (while air typing, the navigation and status bar recede and the island stays bright). |
| Icons | One custom line set (1.5 px stroke, 20 px grid) in `components/common/Icon.tsx`. No emoji, no mixed icon libraries. |
| Tokens | `src/styles/tokens.css` (both appearances), `materials.css` (glass), `src/design/motion.ts` (springs). Components: `app.css`; page styles: `connect.css`, `calibrate.css`, `performance.css`, `phone.css`; keyboard: `components/keyboard/keyboard.css`; island and spatial styles live next to their components. |

Responsive behaviour:
- **Desktop and Surface:** floating glass navigation with a sliding active indicator and the Dynamic Island; the camera window docks beside the text.
- **Tablet:** the same navigation; fullscreen moves to Settings; the editor and Air panel stack.
- **Phones:** brand and island stay on top; the sections move to a floating bottom tab bar; the camera docks in the Air panel next to its actions.

## Docs

- [User guide](docs/USER_GUIDE.md): everyday use, tips and troubleshooting
- [Known limitations](docs/LIMITATIONS.md): an honest list, with performance advice and the roadmap
- [Development plan](DEVELOPMENT_PLAN.md): architecture decisions, stage log and the bugs found during verification
