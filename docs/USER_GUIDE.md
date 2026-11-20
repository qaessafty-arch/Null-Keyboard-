# NEO TYPE — User guide

## Everyday use

1. On the Surface, run `npm start` and open `https://localhost:8443`. If you installed it as an app (needs mkcert, see the README), open it from the Start menu instead.
2. Choose a mode at the top of the Workspace:
   - **Touch Mode**: type on the screen.
   - **Air Mode**: connect the phone, then type in the air (after calibrating once).
3. Your text is in the editor. Use **Copy**, or **TXT** to download it. The draft is saved automatically on this device.

Switching modes never loses your text. Any key that was held is released when you switch.

## Touch Mode

- Tap keys with a finger, the Surface Pen, the mouse or the trackpad. The badge above the editor shows which one you used last.
- **Shift, Ctrl, Alt and Fn:** hold one while pressing another key (two fingers), or **tap it once** to apply it to the next key only. Tap it again to cancel. The modifier chips at the top right show what's active.
- **Caps Lock** toggles; its LED lights up while it's on.
- Holding **Backspace**, the arrow keys or a letter repeats it. You can turn this off in Settings › Touch.
- The **Fn** layer: digits become F1–F12, ← → become Home/End, ↑ ↓ become PgUp/PgDn, and Backspace becomes Delete.
- Shortcuts: **Ctrl+A** select all, **Ctrl+C / X / V** copy, cut and paste, **Ctrl+Z / Ctrl+Y** undo and redo, **Ctrl+Backspace** delete the previous word, **Shift+arrows** select.
- Tapping the editor won't open the Windows touch keyboard. To place the caret or select text, tap or drag with a finger or the pen.

## Air Mode

1. **Connect** the phone (see the README). It needs the same Wi-Fi and HTTPS.
2. **Calibrate** once, in Calibrate.
3. Choose **Air Mode**. The panel shows:
   - the live camera with tracked hand skeletons;
   - the tracking rate;
   - the calibration status;
   - the last gesture recognised.
4. Rest your hands over the desk area you marked. Fingertip markers appear on the on-screen keyboard and the keys under them light up.
5. **Press:**
   - **Motion** (after press calibration): a clear downward tap, then lift, as on a real keyboard. Only the finger that moved most can press, so keep the other fingers relaxed.
   - **Dwell** (fallback): hold an **index** fingertip still on a key until the ring fills. To type the same key again, move off it and back.
6. Adjust **Sensitivity** in the Air Mode panel:
   - higher = lighter presses, quicker dwell;
   - lower = fewer accidental presses.

The Shift, Caps, Ctrl and Fn keys work exactly as in Touch Mode, because both modes use the same engine. You can also mix the two, for example tapping Shift on the screen while typing in the air.

### Tips for reliable air typing

- **Light:** bright and even, with no strong shadows from your hands across the desk.
- **Background:** a plain, matte desk. Patterned or glossy surfaces confuse hand detection.
- **Angle:** a camera looking down **from slightly in front** sees presses much better than one looking straight down. The calibration report shows a "press/jitter separation"; aim for at least 4×.
- **Distance:** your hands should fill about half the frame. Step 1 of the calibration tells you if they look too small or too large.
- **Keep the phone still.** If it moves, recalibrate; the keyboard area is tied to the camera image.
- **Power:** keep the phone on a charger. Streaming video and keeping the screen on drain the battery.

## Settings

| Section | What it controls |
| --- | --- |
| General | Default mode, theme (Laser / Holo), layout, sound, fullscreen |
| Touch | Key size, spacing, opacity, press animation, sound, hold-to-repeat, orientation |
| Air | Press method (Automatic / Motion / Dwell), dwell time, preferred camera, sensitivity, activation threshold, debounce, tracking confidence, camera resolution, mirrored preview, recalibrate or delete the calibration |
| Performance | Quality (High / Balanced / Low), automatic quality adjustment, effects intensity, tracking rate, GPU or CPU inference, camera resolution |
| Privacy | What happens to camera data |

All settings stay on this device. **Reset all settings** doesn't touch your text or your calibration.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| The phone can't open the page | Use the **https://192.168…:8443** address shown by `npm start` (not `localhost`). Both devices must be on the same Wi-Fi, and Windows must treat that Wi-Fi as a *Private* network with Node.js allowed in the firewall |
| "This page isn't on HTTPS" on the phone | Open the **https://** address. Plain http pages can't use the camera |
| "Camera permission required" | In phone Chrome: ⋮ → Settings → Site settings → Camera → allow this address, then tap Start camera again |
| The Connect page says "served on localhost only" | You started `npm run dev`. Use `npm start` (or `npm run dev:lan`) instead, so the phone can reach the Surface |
| Stuck on "Connecting" | Some routers block devices from talking to each other (guest networks, "AP isolation"). Use your main network, or the phone's hotspot with the Surface joined to it |
| Hand tracking says "Loading" for a long time | The first start loads 8 MB of model and 15 MB of runtime. Check that `npm install` printed "hand model → public/models". If tracking fails, switch Settings › Performance › Hand tracking runs on to **CPU** |
| Keys trigger by accident | Lower the sensitivity, raise the activation threshold or the debounce, or recalibrate with clearer taps. Dwell avoids accidental presses entirely |
| Presses aren't recognised | Raise the sensitivity, tilt the phone more to the side, recalibrate, or use dwell |
| Hands are labelled the wrong way | Labels are only for display; typing uses stable per-hand IDs. Mirrored preview only flips the video you see |
| FPS drops on the Surface | Use Balanced or Low quality, a 15–24 Hz tracking rate and 720p, plug in the charger, and close other heavy tabs |
| Can NEO TYPE type into Word or another app? | Not directly; browsers can't send keystrokes to other apps. Use Copy, then paste (Ctrl+V) |
