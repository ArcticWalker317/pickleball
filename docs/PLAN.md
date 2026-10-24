# Pickleball Ref — MVP plan

## What we're building

A phone propped up beside the court becomes the referee for casual games ("when it's just me & you"):

- **Game Now** — live tracking; the phone calls in/out out loud ("the ref = the speaker"). The growth hook.
- **Post-Game** — scores plus analysis: shots missed most, net vs. out errors, points per player.
- **Games Overtime** _(after the MVP)_ — personal tendencies/strengths/weaknesses, friend game
  history, relative ranking, ranked vs. casual.

MVP decisions: iPhone **web app (PWA)** now, native App Store app much later · **live on-device
processing** · **singles first** · scope = live-ref demo + tracking + post-game stats.

## Stack

- Vite + React + TypeScript PWA (Add to Home Screen). Deployed on Vercel/Netlify — camera requires HTTPS.
- Vision: classical CV for the ball (color + motion); MediaPipe Tasks Vision Pose Landmarker for
  players. Runs in a Web Worker with OffscreenCanvas. Later: a trained YOLO-nano ball model via
  `onnxruntime-web` (WebGPU) once we have footage.
- Storage: IndexedDB via Dexie (local only for the MVP).
- Tests: Vitest for all pure logic.

## How it works

1. **Camera** — `getUserMedia` rear camera (ideal 60 fps), Screen Wake Lock, `requestVideoFrameCallback`
   per-frame loop, frames downscaled to ~640×360 for detection.
2. **Calibration** — user taps the 4 court corners; a 4-point homography maps image → court feet;
   court lines are overlaid so the user can confirm.
3. **Ball detection** — frame differencing + HSV threshold (neon yellow/orange) + blob filtering;
   a 2D Kalman filter links detections into a track.
4. **Bounce → in/out** — a bounce is a sharp reversal in the ball's vertical image motion. A bounce
   is on the ground plane, so the homography gives its **true** court position — that is what makes
   single-camera line calls possible. Calls within a few inches of a line are **uncertain** and the
   ref stays silent rather than guessing.
5. **Players** — pose at ~10 fps; ankle midpoint → court position → near/far side; hits are
   attributed to the nearest player when the ball changes direction.
6. **Rally state machine** — serve → in play → point over (out, net, double bounce, no return).
   Traditional side-out scoring for singles.
7. **Ref speaker** — `speechSynthesis` says "Out", "Net", the score. Unlocked on the Start tap
   (iOS needs a gesture). Manual override + undo always on screen.
8. **Stats** — every shot/point is logged; post-game stats and a bounce heatmap come from the log.

## Two tracks, built in parallel

Ownership and workflow rules are in [CLAUDE.md](../CLAUDE.md). The contract between tracks is
`src/shared/types.ts`; Track B builds against `MockVisionSource` until real tracking is ready.

| #   | Track A — Vision (ArcticWalker317)                                                            | Track B — Game & App                                                    |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Camera preview on iPhone, wake lock, HTTPS deploy                                             | `lineCall` (in / out / uncertain) + tests                               |
| 2   | Calibration: tap 4 corners → homography → line overlay + tests                                | Side-out singles scoring + rally state machine + tests (mock events)    |
| 3   | File-input dev harness, debug overlay, clip recorder                                          | Live screen: score bar, speech ref, override/undo on `MockVisionSource` |
| 4   | Ball detector + Kalman + bounce → `ball` / `bounce` / `lost`                                  | Event log → Dexie storage → `computeStats` + tests                      |
| 5   | Pose → `players` + `hit` events; `net` detection                                              | Post-game screen: stats + bounce heatmap on `CourtDiagram`              |
| 6   | **Together:** swap in the real source, play test games, tune thresholds, fix integration bugs | ← same                                                                  |

## Known risks

- **Frame rate / motion blur** in iOS Safari → 60 fps where available, uncertain band, manual override.
- **Thermal throttling** over long games → downscale, run pose slower than ball tracking, idle between rallies.
- **Camera placement** matters → guide users to an elevated behind-the-baseline or corner view
  showing the whole court (fence mount or tripod).

## Verification

- CI runs `npm run check` + `npm run build` on every PR; `main` stays green.
- Unit tests: homography, line calls (in / out / on the line), scoring (side-outs, even/odd server
  position), rally-machine transitions, stats.
- On the phone: calibrate on a real (or taped-out) court and check the overlay matches the lines.
- Recorded clips through file-input mode: bounces detected, calls and score correct.
- On court: play rallies; compare spoken calls, score, and post-game stats with what happened.
