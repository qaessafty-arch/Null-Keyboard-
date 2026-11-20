# NULL-TECH — Known limitations, performance advice and roadmap

This is the final limitations report for v1.0.0.

## 1. What has not been verified on real hardware

All automated tests ran in a Linux container with headless Chromium. That container has no touchscreen, no pen, no camera and no GPU.

| Not verified | Why it matters | How it was covered instead |
| --- | --- | --- |
| Surface Pro 7 touchscreen and Surface Pen | Touch feel, pen hover, palm rejection | Real touch and pen pointer events injected through Chrome DevTools Protocol; a two-finger chord passes |
| Galaxy S25 Ultra camera over real Wi-Fi | Actual latency, frame rate and lens choice | A fake camera through real WebRTC between two pages; 1280×720 at 30 fps |
| Iris Plus GPU inference speed | Detection rate on the target machine | In this container, GPU inference was software-rendered (~1.8 s per frame) and CPU took ~130 ms per frame. A real GPU should be far faster, but this is unmeasured |
| **Motion press detection with real hands** | The core of air typing | Unit tests with synthetic motion. **A still test image can't press**, so only dwell typing was verified end-to-end |

Expect to tune **sensitivity**, **activation threshold** and **debounce** on the real setup.

## 2. Fundamental limitations

1. **One camera can't measure depth.** MediaPipe's `z` is a relative estimate from a single image. NULL-TECH doesn't treat it as depth. It learns, during calibration, how a press changes the fingertip's position relative to its knuckle (including `z`) from your camera angle, and compares that with your resting jitter. From straight above, a press barely changes what the camera sees; a camera looking from slightly in front works much better. When presses can't be told apart from jitter (the calibration reports the separation), use **dwell**.
2. **Air typing is slower and less accurate than a real keyboard.** There is no tactile feedback, fingertips occlude each other, and tracking latency adds up: camera → Wi-Fi → decode → inference. It suits short text, not long documents.
3. **No system-wide typing.** A web page can't send keystrokes to other Windows apps. Use Copy or TXT. The engine emits standard `KeyboardInputEvent`s, so a native companion app (for example a small Tauri or Win32 helper on a local WebSocket) could add this later. See the roadmap.
4. **HTTPS on the LAN.** Phones only allow the camera on secure pages. Without mkcert, a self-signed certificate means one browser warning per device. The PWA service worker also won't register on the phone in that case (the camera still works). Hosting online (Render) avoids this: the certificate is real.
5. **Same network required, even when hosted online.** WebRTC is configured without STUN/TURN servers, on purpose (the video never leaves your Wi-Fi). Hosting the app online only moves the page and the pairing handshake; a phone on mobile data can't stream to the Surface. Networks with client isolation (guest Wi-Fi, some public networks) block it.
8. **Online hosting on a free plan sleeps.** Render's free plan stops the server after 15 minutes without visitors; the first visit after that takes about a minute. The in-memory pairing hub also resets on every redeploy or restart; an open pairing then reconnects with a new code.
6. **Keyboard area tied to the camera image.** If the phone moves, the invisible keyboard moves with it, and you need to recalibrate.
7. **Hand detection limits.** MediaPipe struggles with gloves, very dark or busy backgrounds, strong backlight, and fingers hidden under other fingers.

## 3. Smaller limitations

- One layout (US QWERTY) and an English interface.
- No long-press accent alternatives.
- On-screen **Ctrl+V** needs clipboard-read permission. If the browser refuses, NULL-TECH says so; a physical keyboard or right-click › Paste still works.
- The Fn layer's F1–F12 have no effect in the built-in editor; they exist for a future native companion.
- `navigator.deviceMemory` is capped by the browser, so System information shows "≥ 8 GB" on a 16 GB Surface.
- `performance.memory` (JS heap) is only shown in Chromium browsers.
- One phone per session, and one Surface host per pairing code.

## 4. Performance recommendations (Surface Pro 7, 16 GB)

- **Balanced** quality (the default) with **automatic adjustment on**. It steps down to Low if rendering stays under 40 FPS for 6 seconds.
- **720p** camera resolution and a **24–30 Hz** tracking rate. Drop to 15 Hz if the Surface gets hot or the fan spins up.
- Hand tracking runs on the **GPU** in a **Web Worker**, so the UI thread stays free. If the graphics driver misbehaves, switch to CPU (Settings › Performance).
- **Plug in the charger.** Windows' battery saver throttles both CPU and GPU.
- Check **Performance › Long tasks** and **Frame → result**. If long tasks keep climbing while you type, something is blocking the main thread; please report it.
- Close other GPU-heavy tabs while using Air Mode.

## 5. Roadmap

1. **Hardware tuning pass** on the Surface and the S25 Ultra: default thresholds, the dominance ratio and dwell time from real typing sessions.
2. **Per-finger press directions** (the profile already stores the samples) and **adaptive thresholds** that learn from corrections.
3. **Native companion** (Tauri) for system-wide input: it receives engine events over `wss://localhost` and calls `SendInput`.
4. **More layouts** (AZERTY, QWERTZ, Arabic) and localization.
5. **Word prediction / autocorrect** on device, to make up for air-typing errors.
6. **Second camera** (or the phone's depth data, where available) for true press depth.
7. **ArUco / printed-mat calibration**: detect the keyboard area automatically from a printed sheet.
