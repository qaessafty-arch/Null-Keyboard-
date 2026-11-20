# NEO TYPE — Development Plan

> Status: **v1.0.0 — all stages implemented and automatically verified.** Hardware checks on the Surface Pro 7 and S25 Ultra are still pending (marked ⬜).

Living document. Updated at the end of every stage. Status markers:
✅ done and verified · 🟡 partial (see notes) · ⬜ not started.

## 0. Environment inspection (2026-11-20)

| Item | Finding |
| --- | --- |
| Repository | Empty git repo (no commits), branch `ccr-b9a5f49f-5ewgay` |
| Node.js / npm | v22.23.5 / 10.9.9 (project requires Node ≥ 20.19 for Vite 8) |
| Build machine | 4 vCPU, 15 GB RAM Linux cloud container, no camera, no touchscreen |
| Browser for tests | Pre-installed Chromium + Playwright 1.63.0 |
| Target machine | Surface Pro 7 (i7, 16 GB, Windows, touchscreen + Surface Pen) |
| Target sensor | Samsung Galaxy S25 Ultra rear camera via mobile browser |

**Consequence:** this environment can build, unit-test and drive the app in
headless Chromium (mouse + synthetic touch/pen pointer events). It **cannot**
verify a real touchscreen, real Surface Pen, real phone camera, WebRTC across
two devices or real hand tracking. Those checks are listed as *manual
verification on the Surface* in each stage and are never reported as passed
until done on real hardware.

## 1. Key technical decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Build | Vite 8 + React 19 + TypeScript 6 (strict) | Fast HMR, stable, typed |
| Keyboard rendering | DOM/CSS keys over a WebGL surface | Crisp readable legends, native hit-testing, multi-touch via Pointer Events, accessibility. WebGL draws the laser surface + ripples behind the keys |
| 3D | Plain Three.js (no React Three Fiber) | Only two small scenes; R3F would add a reconciler + deps with no clear benefit. Lifecycle handled by one `useThreeCanvas` hook that disposes everything |
| State | Zustand | Per-key selectors keep re-renders to the key that changed; tiny |
| Routing | Hash router (~40 lines) | Works from `file://`, static hosting and PWA without server rewrites; no dependency |
| Styling | Custom CSS with design tokens (CSS variables) | Tailwind adds little for a bespoke visual system |
| Input | Pointer Events only | One path for touch, pen, mouse, trackpad (`pointerType` decides the source) |
| Text editor | `<textarea inputmode="none">` bound to a pure `TextBuffer` model | Native caret/selection with pen and mouse, while suppressing the Windows touch keyboard |
| Settings | `localStorage` via Zustand `persist` (versioned) | Lightweight prefs. IndexedDB reserved for larger data (calibration profiles, Stage 5) |
| Vision (Stage 4) | `@mediapipe/tasks-vision` Hand Landmarker in a Web Worker if measurement shows a benefit | Real landmarks; keep the UI thread free |
| Transport (Stage 3) | WebRTC (phone → Surface), tiny `ws` signaling server | P2P, no frame uploads, no cloud |

### Honest technical limitations (known up front)

1. **No system-wide typing.** A browser app cannot inject keystrokes into other
   Windows apps. NEO TYPE provides a built-in editor, copy, and TXT download.
   The engine emits standardized events so a future native companion (e.g. a
   small Tauri/Win32 helper receiving events over a local WebSocket) can add
   system-wide input.
2. **Monocular depth.** One phone camera gives no true depth. MediaPipe's `z`
   is relative to the wrist and noisy. Press detection will combine fingertip
   velocity toward the calibrated plane, the fingertip-to-knuckle geometry, and
   dwell, with a gesture fallback (e.g. pinch / dwell-to-press) when the camera
   angle makes downward motion unobservable.
3. **Secure context for camera.** `getUserMedia` on the phone requires HTTPS
   (or localhost). LAN use needs a locally trusted certificate (documented in
   Stage 3 with `mkcert`).
4. **Touchscreen / pen verification** cannot be done in this container; it must
   be done on the Surface.

## 2. Architecture

```
PHONE: camera page ──getUserMedia──► RTCPeerConnection ─┐        (Stage 3)
                                                        │ WebRTC (LAN, P2P)
SURFACE: video receiver ◄───────────────────────────────┘
   └► HandLandmarker (worker) ► smoothing ► homography ► gesture FSM  (Stage 4–5)
          └► KeyboardEngine.keyDown/keyUp(source: AIR, confidence)
SURFACE touchscreen / pen / mouse ► Pointer Events ► usePointerKeyboard
          └► KeyboardEngine.keyDown/keyUp(source: TOUCH | PEN | MOUSE)
KeyboardEngine ──KeyboardInputEvent──► text-output (TextBuffer) · key visuals ·
                                       sound · WebGL ripples · metrics
```

The engine is the only place that knows about modifiers, repeat, dedupe and
stuck-key recovery. Consumers never care which input mode produced an event.

### Folder layout (as built)

```
src/
  app/            App shell, hash router, route table
  pages/          One component per screen (Home, Workspace, Connect, …)
  components/     keyboard/, dashboard/, common/
  features/
    keyboard-engine/  layout data, KeyboardEngine, modifier resolution
    text-output/      TextBuffer (pure), text store, clipboard/download
    touch-mode/       Pointer Events → engine
  engine/
    input/        engine singleton + consumer wiring
    performance/  FPS meter, latency probe, quality profiles
  rendering/three/  useThreeCanvas, LaserSurface, HeroScene
  stores/         settings (persisted), app, key state
  styles/         tokens, global, component CSS
  types/          shared types (KeyboardInputEvent …)
  utils/          sound, system info
tests/  unit/ integration/ e2e/
server/ (Stage 3) signaling
```

`pages/` was added relative to the spec's suggested structure: screens are
composition roots and should not live inside reusable `components/`.

## 3. Stages

### Stage 0 — Environment ✅
- ✅ Inspected Node/npm/resources (above)
- ✅ Vite + React + TS strict project, path alias `@/`
- ✅ Vitest + RTL (jsdom), Playwright e2e config
- ✅ README with setup commands

### Stage 1 — Visual foundation ✅
- ✅ Design tokens (palette from spec), two themes: **Laser** (red) and **Holo** (cyan + red)
- ✅ App shell: top bar (logo, connection status, active mode, theme, settings), status bar (tracking, camera, FPS, latency, sensitivity, calibration)
- ✅ Screens: Home, Workspace, Air Mode, Touch Mode (both inside Workspace via mode switch), Phone Connection, Calibration, Settings, Performance, About
- ✅ Laser keyboard: luminous edges, inner illumination, hover glow, press animation, readable legends
- ✅ WebGL laser surface behind the keyboard (grid, emitter fan, sweep, press ripples) — disabled in LOW quality
- ✅ 3D hero on Home (projected key outlines + emitter beam, pointer parallax)
- ✅ Responsive: container-query sizing, landscape + portrait
- Manual on Surface: visual check at 2736×1824 @ 200 %, portrait rotation

### Stage 2 — Functional Touch Mode ✅
- ✅ Full QWERTY + Fn layer, unified `KeyboardEngine`, Pointer Events (TOUCH / PEN / MOUSE), multi-pointer chords
- ✅ Modifiers (hold-chord / tap-latch), Caps, auto-repeat, duplicate suppression, stuck-key recovery
- ✅ Editor: caret, selection, undo/redo, clipboard, TXT, counters; key size/spacing/opacity; sound
- ⬜ Manual on Surface: finger, Surface Pen, trackpad feel
- Deferred: long-press alternates (accents)

### Stage 3 — Phone camera connection ✅
- ✅ `server/`: HTTPS static server (`npm start`), `/signal` WebSocket hub — 6-char crypto-random codes, host/phone tokens for resume, strict schema validation, 16 KB cap, join rate-limit, flood limit, same-origin upgrade check, idle expiry, heartbeat
- ✅ Self-signed cert with LAN-IP SANs (auto), or mkcert certs from `certs/`
- ✅ Phone page `#/camera`: rear camera, lens switching, 480/720/1080p, wake lock, background recovery, permission/HTTPS errors
- ✅ Surface `HostLink`: local QR (uqr), state machine (waiting → connecting → permission-required → connected → reconnecting → disconnected / unavailable), real `getStats()` quality
- ✅ LAN bitrate hint (`x-google-start/min-bitrate`) — without it the stream sat at 320×180 (found in testing)
- ✅ e2e: pairing, wrong code, reconnection (both sides), disconnect stops the phone camera

### Stage 4 — Computer vision ✅
- ✅ `@mediapipe/tasks-vision` 1.2.3 HandLandmarker, 2 hands × 21 landmarks; wasm + model served locally (`scripts/setup-assets.mjs`), remote model fallback
- ✅ Module **Web Worker** (module wasm build) with ImageBitmap transfer and drop-when-busy backpressure; main-thread fallback; GPU delegate with CPU fallback + setting
- ✅ `requestVideoFrameCallback` pump throttled to 15/24/30 Hz and quality frame stride
- ✅ One Euro smoothing, nearest-wrist identity, tracking-loss bridging (180 ms) and release
- ✅ Landmark overlay, detection rate / inference / frame→result metrics
- ✅ e2e: both hands detected (~95 %) from the phone stream in the worker

### Stage 5 — Calibration & Air Mode ✅
- ✅ 5-step wizard: live positioning checks (hands, size, framing, luminance), draggable/fingertip corner capture with projected key grid, 3 s rest capture, prompted press capture (direction, depth, separation, accuracy), live test
- ✅ Homography + key hit-testing; hand-relative fingertip features (isotropic, incl. z)
- ✅ `PressDetector`: motion (hysteresis, dominance, confidence gate, debounce, cooldown, look-back key, adaptive baseline) and dwell fallback
- ✅ `AirInput` → shared `KeyboardEngine` (`source: 'AIR'`, confidence), hover highlights, fingertips on keyboard, ripples, gesture readout, air latency metric
- ✅ Profile in IndexedDB; status in top/status bars and Settings
- ✅ e2e: calibration completes, dwell typing produces `AIR` key events in the editor
- ⬜ Motion presses with real hands (cannot be produced by a still image) — unit-tested only

### Stage 6 — Optimization ✅
- ✅ Automatic quality step-down (FPS < 40 for 6 s), tracking Hz, frame stride, GPU/CPU choice
- ✅ Tracking runs only while Air Mode / calibration / connect preview need it; renderer and GL contexts disposed; tracks stopped on disconnect
- ✅ Reconnection verified in e2e
- ⬜ Long-session memory profiling on the Surface

### Stage 7 — Finalization ✅
- ✅ PWA (manifest, icons, precached shell, runtime-cached vision assets); offline e2e
- ✅ Editor draft autosave (IndexedDB)
- ✅ README, `docs/USER_GUIDE.md`, `docs/LIMITATIONS.md`
- ✅ Full automated test pass (below)

## 4. Verification log

| Date | Stage | Check | Result |
| --- | --- | --- | --- |
| 2026-11-20 | 0–2 | `npm run typecheck` | ✅ no errors |
| 2026-11-20 | 0–2 | `npm test` (unit + integration) | ✅ 67/67 |
| 2026-11-20 | 0–2 | `npm run build` | ✅ main 293 KB (92 KB gz), Three.js lazy chunk |
| 2026-11-20 | 0–2 | Playwright e2e in headless Chromium (mouse, CDP touch + pen, console errors, portrait overflow, persistence) | ✅ 11/11 |
| 2026-11-20 | 1 | Visual review via screenshots at 1368×912 and 912×1368 (Laser + Holo, Air panel, hero) | ✅ after fixes below |
| — | 1–2 | On-device check on Surface Pro 7 (touch, pen, trackpad, real GPU FPS) | ⬜ pending, needs hardware |
| 2026-11-20 | 3–7 | `npm test` | ✅ 104/104 (engine, text, hub, homography, geometry, filters, press detector) |
| 2026-11-20 | 3–7 | `npm run test:e2e` | ✅ 19/19 (13 UI + 6 real camera pipeline with MediaPipe test image) |
| 2026-11-20 | 3–7 | Production server (`npm start`) with CSP: pairing + GPU worker tracking | ✅ 2 hands, 0 console errors |
| — | 3–5 | S25 Ultra over Wi-Fi, real hands, motion presses | ⬜ pending, needs hardware |

### Bugs found and fixed during verification
- Page overflowed horizontally in portrait: the app grid's implicit column grew to the top bar's min-content. Fixed with `grid-template-columns: minmax(0, 1fr)`.
- Air Mode panel pushed the keyboard below the fold at 1368×912. The workspace now fills the viewport exactly and the panel scrolls internally.
- WebGL hero/surface drew opaque dark shapes and an almost invisible grid. The additive shaders wrote alpha = 1 (and non-premultiplied blending squared the alpha). Shaders now output premultiplied, brightness-matched alpha, with `premultipliedAlpha: true`.
- The main bundle was 829 KB. Three.js is now lazy-loaded (main bundle 293 KB), and Low quality never downloads it.
- (Stage 3) The WebRTC stream stayed at 320×180: bandwidth estimation starts at ~300 kbit/s and doesn't ramp on calm video, and `contentHint='motion'` traded resolution for frame rate. Fixed with a LAN start/min bitrate hint and the default content hint → 1280×720 from the first second.
- (Stage 3) A Surface reload left the phone waiting forever: the hub told the host the phone was present but never told the phone the host was back. Both sides are now notified, so the phone re-offers.
- (Stage 3) When the Surface ended the session, the phone kept its camera on. It now stops the camera and wake lock; restarting opens a fresh socket.
- (Stage 4) Handedness was inverted: the assumption that MediaPipe expects mirrored frames was wrong for un-mirrored `getUserMedia` frames (verified with MediaPipe's right-hands test image).
- (Stage 4) MediaPipe's wasm logs INFO lines through `console.error`; the worker now downgrades glog INFO/W lines to debug.
