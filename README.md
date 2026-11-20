# NEO TYPE

A dual-input virtual keyboard with a laser-holographic look. You type by touching the screen (**Touch Mode**). Later you'll also be able to type in the air above your desk while a phone camera tracks your fingers (**Air Mode**). Both modes feed **one keyboard engine**.

Target setup: Microsoft Surface Pro 7 (touchscreen + Surface Pen), with a Samsung Galaxy S25 Ultra as the external camera.

> **Status: v0.2 (Stage 0 + Stage 1 complete, Stage 2 core complete).**
> Touch Mode is fully functional. Air Mode (phone camera, hand tracking, calibration) is **not implemented yet**. The app says so wherever Air Mode appears, and it never simulates a connection or tracking data. See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).

---

## What works today

| Feature | State |
| --- | --- |
| Laser keyboard, full US QWERTY (letters, digits, punctuation, Backspace, Enter, Space, Tab, Esc, Shift ×2, Caps, Ctrl, Alt, Fn, arrows) | ✅ |
| Fn layer: F1–F12, Home/End/PgUp/PgDn, Delete | ✅ |
| Finger, Surface Pen, mouse, trackpad through one Pointer Events path | ✅ (pen/touch verified with Chromium's real touch/pen event injection; still needs a check on the device) |
| Multi-touch chords (hold Shift with one finger, type with another) | ✅ |
| Tap-to-latch one-shot Shift/Ctrl/Alt/Fn, Caps Lock | ✅ |
| Hold-to-repeat, duplicate suppression, stuck-key release on blur / tab switch / mode switch | ✅ |
| Editor: caret, selection, Shift+arrows, Ctrl+A/C/X/V/Z/Y, word delete, undo/redo, counters | ✅ |
| Copy, download as TXT, clear with confirmation | ✅ |
| Laser (red) and Holo (cyan + red) themes | ✅ |
| WebGL laser surface behind the keys (grid, emitter fan, sweep, press ripples) + 3D hero | ✅ |
| High / Balanced / Low quality (Low turns WebGL off and never downloads Three.js) | ✅ |
| Live performance monitor (measured FPS, frame time, input latency, WebGL cost, long tasks) | ✅ |
| Settings saved locally (general, touch, air, performance, privacy) | ✅ |
| Landscape and portrait layouts | ✅ |
| Phone camera link (WebRTC + signaling, QR pairing) | ⬜ Stage 3 |
| Hand tracking (MediaPipe Hand Landmarker) | ⬜ Stage 4 |
| Calibration wizard + air press detection | ⬜ Stage 5 |
| PWA / offline install | ⬜ Stage 7 |

---

## Run it on Windows (Surface Pro 7)

**Requirements:** [Node.js](https://nodejs.org/) 20.19+ (22 LTS recommended), Git, and Microsoft Edge or Chrome.

Open **PowerShell**:

```powershell
git clone https://github.com/qaessafty-arch/Null-Keyboard-.git neo-type
cd neo-type
git checkout ccr-b9a5f49f-5ewgay   # until this branch is merged
npm install
npm run dev
```

Open **http://localhost:5173** in Edge. Press **F11** (or use the ⛶ button in the top bar) for fullscreen.

Production build, served locally:

```powershell
npm run build
npm run preview          # http://localhost:4173
```

### Tips for the Surface

- Use the **Balanced** quality mode (the default). If the FPS in the status bar drops below about 45, switch to **Low** in Settings → Performance.
- The editor uses `inputmode="none"`, so the Windows touch keyboard should **not** pop up when you tap the text area. If it still does, turn off *Settings → Time & language → Typing → Touch keyboard → "Show the touch keyboard when there's no keyboard attached"*.
- A long press with the pen or a finger on a key never opens the context menu.

---

## Development commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on http://localhost:5173 |
| `npm run dev:lan` | Same, reachable from other devices on your network (HTTP only, see below) |
| `npm run build` | Type-check + production build into `dist/` |
| `npm run preview` | Serve the production build on http://localhost:4173 |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit + integration tests (Vitest + React Testing Library, jsdom) |
| `npm run test:e2e` | End-to-end tests in Chromium (Playwright). First time on a new machine: `npx playwright install chromium` |

---

## Phone camera connection (Air Mode)

**Not available in this build.** The *Connect* screen shows the real link state ("No phone linked"), checks whether this browser supports what pairing will need (secure context, WebRTC, WebSocket, `requestVideoFrameCallback`), and explains the planned flow. It does not generate fake pairing codes.

Planned flow (Stage 3):

1. On the Surface: **Air Mode → Connect phone**. A QR code and a 6-character code appear.
2. On the S25 Ultra: scan the QR code with the camera app (or open the link and type the code).
3. Allow camera access and choose the **rear camera**.
4. The phone streams directly to the Surface over WebRTC on your Wi-Fi. A small local signaling server only exchanges connection setup messages, never video.

**HTTPS requirement:** phones only allow camera access on HTTPS pages (or `localhost`). Stage 3 will document a local certificate setup with [`mkcert`](https://github.com/FiloSottile/mkcert) so the phone trusts the Surface's dev server.

**Camera placement:** about 35–50 cm above the desk, looking down, with both hands in frame. Avoid direct sunlight and glossy surfaces. A stack of books makes a good stand.

## Calibration

Also arrives with Air Mode (Stage 5). The wizard has five steps: camera positioning → mark the 4 workspace corners (homography) → neutral hand pose → press calibration (depth/speed thresholds, debounce) → test typing. You can re-run it from Settings at any time.

---

## Architecture

```
Touch / Pen / Mouse ─► Pointer Events (usePointerKeyboard) ─┐
                                                            ├─► KeyboardEngine ─► KeyboardInputEvent ─► editor, key visuals, sound, ripples, metrics
Phone camera ─► WebRTC ─► MediaPipe ─► gestures (Stage 3–5) ┘
```

- **`KeyboardEngine`** (`src/features/keyboard-engine/`): framework-free and fully unit-tested. Every input calls `keyDown/keyUp(key, {source, holderId, confidence})`. It owns modifiers, Caps Lock, repeat, duplicate suppression and stuck-key recovery, and emits `{key, source, action, timestamp, confidence, metadata}`.
- **Text output** (`src/features/text-output/`): a pure `TextBuffer` model plus `keyToIntent`. The `<textarea>` is only a view of it, so editing behaves the same for every input source.
- **Rendering** (`src/rendering/three/`): the keys are DOM elements (crisp legends, native multi-touch hit testing). WebGL draws the projection surface behind them and the 3D hero. One `useThreeCanvas` hook pauses rendering when hidden or off-screen and disposes the renderer, GL context, geometries and materials.
- **Metrics** (`src/engine/performance/`): FPS from `requestAnimationFrame`, input latency from `PointerEvent.timeStamp` to the next frame, CPU time inside `renderer.render()`, and long tasks via `PerformanceObserver`. Anything without a real source shows "—".

```
src/
  app/            App shell, hash router
  pages/          Home, Workspace (Touch/Air), Connect, Calibration, Settings, Performance, About
  components/     keyboard/, dashboard/, common/
  features/       keyboard-engine/, text-output/, touch-mode/
  engine/         input/ (engine singleton + wiring), performance/
  rendering/      three/ (useThreeCanvas, LaserSurface, HeroScene), effects/
  stores/         settings (persisted), app, key state, notices
  styles/         tokens, global, app
  types/ utils/ hooks/
tests/            unit/, integration/, e2e/
```

---

## Testing report (2026-11-20, Linux CI container, headless Chromium 1368×912)

| Suite | Result |
| --- | --- |
| `npm run typecheck` | ✅ no errors |
| `npm test`: 5 files, 67 tests (engine, text model, intents, layout, stats, React integration with pointer events) | ✅ 67 passed |
| `npm run test:e2e`: 11 Playwright tests | ✅ 11 passed |
| `npm run build` | ✅ main bundle 293 KB (92 KB gzip); Three.js split into a lazy chunk |

The e2e suite covers:
- mouse typing
- **real touch events** injected through Chrome DevTools Protocol, including a two-finger Shift chord
- **pen pointer events** reported as `PEN`
- Touch ⇄ Air switching keeps the text
- Air Mode never claims a camera connection
- settings persist across reload
- WebGL laser surface runs in Balanced quality and is removed in Low
- measured FPS and latency appear
- every screen renders with zero console errors
- the portrait layout has no horizontal overflow

**Not verifiable in this environment** (needs the real hardware): Surface touchscreen feel, Surface Pen pressure/hover, and FPS on the Surface's Intel Iris Plus GPU. The container used software WebGL (SwiftShader) and measured about 25–30 FPS with WebGL on; a real GPU should be much faster.

## Known limitations

1. **No system-wide typing.** Browsers can't send keystrokes to other Windows apps. Use Copy or TXT download. The engine's event stream is designed so a future native companion (a small Tauri or Win32 helper on a local WebSocket) can add this.
2. **Air Mode is not implemented yet** (Stages 3–5).
3. **Single-camera depth.** Once Air Mode exists, press detection will rely on calibrated motion and a gesture fallback, because one camera can't measure true depth.
4. **Clipboard paste via the on-screen Ctrl+V** depends on the browser granting clipboard-read permission. If it's refused, NEO TYPE tells you and you can paste with a physical keyboard or right-click.
5. **One layout** (US QWERTY) and English UI for now.
6. `navigator.deviceMemory` is capped by the browser, so System Information may show "≥ 8 GB" on a 16 GB Surface.

## Performance recommendations

- Keep **Balanced** quality on the Surface Pro 7. **Low** removes WebGL entirely (no Three.js download) and reduces glow.
- Close other GPU-heavy tabs while using Air Mode later; hand tracking will share the integrated GPU.
- Plug the Surface in: Windows power-saving modes throttle the GPU and lower FPS.
- Watch **Performance → Long tasks**. If it climbs while you type, report it — it means the main thread is blocking.

## Roadmap

Stage 3 phone camera link → Stage 4 MediaPipe hand tracking → Stage 5 calibration + air press detection → Stage 6 optimization (auto quality step-down, leak and reconnection tests) → Stage 7 PWA, user guide, final limitations report. Details in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).

## Privacy

No camera access is requested in this build. Once Air Mode is built: the camera is requested only when you start pairing, video goes peer-to-peer from your phone to your Surface, frames are processed locally in the browser, nothing is recorded by default, and nothing is sent to any cloud or AI service. NEO TYPE uses no API keys.
