# NEO TYPE — Development Plan

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

### Stage 2 — Functional Touch Mode 🟡 (pulled forward so keys are not dead)
- ✅ Full QWERTY layout: letters, digits, punctuation, Backspace, Enter, Space, Tab, Esc, Shift×2, Caps, Ctrl, Alt, Fn, arrows; Fn layer (F1–F12, Home/End/PgUp/PgDn, Delete)
- ✅ Unified `KeyboardEngine` with `KeyboardInputEvent {key, source, action, timestamp, confidence, metadata}`
- ✅ Pointer Events; source = TOUCH / PEN / MOUSE from `pointerType`; multi-pointer
- ✅ Modifiers: hold-chord or tap-to-latch (one-shot) Shift/Ctrl/Alt/Fn; Caps Lock toggle
- ✅ Auto-repeat on long press (Backspace, arrows, characters), duplicate suppression, stuck-key release on blur / visibility change / pointer cancel
- ✅ Editor: live typing, caret + selection, arrows (Shift extends), Home/End, undo/redo (Ctrl+Z / Ctrl+Y), Ctrl+A, Ctrl+C/X/V, copy, clear with confirmation, TXT download, char + word counters
- ✅ Key size / spacing / opacity settings, sound feedback (WebAudio synth, no assets)
- ⬜ Manual on Surface: finger, Surface Pen, trackpad; portrait/landscape
- ⬜ Long-press alternates (accented characters) — deferred, not needed for v1

### Stage 3 — Phone camera connection ⬜
- `server/` Node signaling (`ws`), room codes (6 chars, crypto random, TTL), message schema validation + size cap
- Phone page `#/camera?room=…`: rear camera (`facingMode: environment`), resolution presets, permission-denied UI
- QR code on Surface (small QR encoder, no network service)
- Connection state machine: waiting → connecting → permission-required → connected → reconnecting → disconnected / camera-unavailable
- Quality indicator from `RTCPeerConnection.getStats()` (fps, RTT, packet loss) — real stats only
- HTTPS dev setup with `mkcert`, documented
- Manual: S25 Ultra → Surface on same Wi-Fi

### Stage 4 — Computer vision ⬜
- `@mediapipe/tasks-vision` HandLandmarker (2 hands, 21 landmarks), model + wasm served locally (offline/PWA)
- Frame pump via `requestVideoFrameCallback`, detection decoupled from rendering, worker if measured faster
- One-Euro filter smoothing, handedness, tracking-loss hold
- Debug overlay (landmarks on preview), detection FPS + processing ms in Performance

### Stage 5 — Calibration & Air Mode ⬜
- Wizard: positioning → 4-corner workspace → homography → neutral hands → press samples → test
- Press FSM per fingertip: HOVER → ARMED → PRESSED → RELEASED with velocity + displacement thresholds, debounce, cooldown, confidence gate
- Air events into the same engine (`source: AIR`, `confidence`)
- Calibration profile in IndexedDB

### Stage 6 — Optimization ⬜
- Auto quality step-down on sustained low FPS, camera resolution presets
- Memory/leak checks (Three.js, video tracks), reconnection tests

### Stage 7 — Finalization ⬜
- PWA (manifest + service worker caching app shell, model, wasm)
- User guide, limitations report, full test pass

## 4. Verification log

| Date | Stage | Check | Result |
| --- | --- | --- | --- |
| 2026-11-20 | 0–2 | `npm run typecheck` | ✅ no errors |
| 2026-11-20 | 0–2 | `npm test` (unit + integration) | ✅ 67/67 |
| 2026-11-20 | 0–2 | `npm run build` | ✅ main 293 KB (92 KB gz), Three.js lazy chunk |
| 2026-11-20 | 0–2 | Playwright e2e in headless Chromium (mouse, CDP touch + pen, console errors, portrait overflow, persistence) | ✅ 11/11 |
| 2026-11-20 | 1 | Visual review via screenshots at 1368×912 and 912×1368 (Laser + Holo, Air panel, hero) | ✅ after fixes below |
| — | 1–2 | On-device check on Surface Pro 7 (touch, pen, trackpad, real GPU FPS) | ⬜ pending, needs hardware |

### Bugs found and fixed during verification
- Page overflowed horizontally in portrait: the app grid's implicit column grew to the top bar's min-content. Fixed with `grid-template-columns: minmax(0, 1fr)`.
- Air Mode panel pushed the keyboard below the fold at 1368×912. The workspace now fills the viewport exactly and the panel scrolls internally.
- WebGL hero/surface drew opaque dark shapes and an almost invisible grid. The additive shaders wrote alpha = 1 (and non-premultiplied blending squared the alpha). Shaders now output premultiplied, brightness-matched alpha, with `premultipliedAlpha: true`.
- The main bundle was 829 KB. Three.js is now lazy-loaded (main bundle 293 KB), and Low quality never downloads it.
