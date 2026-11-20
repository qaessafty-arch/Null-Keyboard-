# Test fixtures

`hands.mjpeg` — a 1280×720 MJPEG clip made from `right_hands.jpg`, a test image from the
MediaPipe project (https://storage.googleapis.com/mediapipe-assets/right_hands.jpg,
Apache License 2.0). Chromium plays it as a fake camera
(`--use-file-for-fake-video-capture`), so the e2e tests can push real hand images through
the phone page → WebRTC → MediaPipe pipeline without a physical camera.

Regenerate:

```
ffmpeg -loop 1 -i right_hands.jpg -vf "scale=1280:-2,pad=1280:720:(ow-iw)/2:(oh-ih)/2:white,format=yuvj420p" -t 1 -r 30 -q:v 5 -f mjpeg hands.mjpeg
```
