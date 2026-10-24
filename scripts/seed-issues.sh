#!/usr/bin/env bash
# Creates track labels and one GitHub issue per milestone task (run once, after the bootstrap PR).
# Requires the GitHub CLI: https://cli.github.com  (Windows: winget install GitHub.cli) + `gh auth login`.
set -euo pipefail

gh label create track:vision --color 1f6feb --description "Track A — vision" --force
gh label create track:game --color d4f03a --description "Track B — game & app" --force
gh label create integration --color 8250df --description "Both tracks" --force

issue() { gh issue create --label "$1" --title "$2" --body "$3"; }

issue track:vision "A1: Camera preview, wake lock, HTTPS deploy" \
"Rear camera preview via getUserMedia (ideal 60fps, 1280w) in \`src/camera/useCamera.ts\`; Screen Wake Lock in \`src/camera/wakeLock.ts\`; show preview on the Calibrate screen. Deploy to Vercel/Netlify so it runs on an iPhone over HTTPS. See docs/PLAN.md."
issue track:vision "A2: Court calibration (tap 4 corners → homography → overlay)" \
"Freeze a frame, tap corners in COURT_CORNERS order, compute the homography in \`src/vision/homography.ts\` (+ tests), overlay COURT_LINES so the user can confirm. Produces a \`Calibration\` (src/shared/types.ts)."
issue track:vision "A3: Dev harness — file input, debug overlay, clip recorder" \
"Load an mp4 instead of the camera (FileVisionSource), draw court/ball/players in \`src/ui/DebugOverlay.tsx\`, record clips on court via MediaRecorder (\`src/camera/recorder.ts\`)."
issue track:vision "A4: Ball detection + Kalman + bounce → ball/bounce/lost events" \
"Worker-based detector (frame diff + HSV + blob filter), Kalman track, bounce detection projected through the homography. Emit \`ball\`, \`bounce\`, \`lost\` VisionEvents."
issue track:vision "A5: Player tracking + hit attribution + net detection" \
"MediaPipe Pose Landmarker (numPoses 2) at ~10fps → feet → court position → \`players\` events; attribute \`hit\` to nearest player on direction change; emit \`net\` when the ball fails to cross."

issue track:game "B1: Line calls (in / out / uncertain)" \
"\`src/game/lineCall.ts\`: bounce CourtPoint → 'in' | 'out' | 'uncertain' with a configurable tolerance band; serve calls must use the diagonal service court (beyond the kitchen). Uses src/shared/court.ts. Full test coverage."
issue track:game "B2: Singles side-out scoring + rally state machine" \
"\`src/game/scoring.ts\`: traditional side-out singles scoring, server position by even/odd score. \`src/game/rallyMachine.ts\`: VisionEvent stream → rally state + point result (out, net, double bounce, no return). Test with MockMatch rallies."
issue track:game "B3: Live screen — score bar, speech ref, override/undo" \
"Replace the placeholder in \`src/app/Live.tsx\`: ScoreBar, \`src/ref/speaker.ts\` (unlock speechSynthesis on Start tap; say 'Out', 'Net', score), manual point override + undo. Runs on MockVisionSource."
issue track:game "B4: Event log + Dexie storage + computeStats" \
"\`src/game/events.ts\` log types, \`src/storage/db.ts\` (matches, events), \`src/stats/computeStats.ts\` (points won, net vs out errors, winners, rally length) + tests."
issue track:game "B5: Post-game screen + bounce heatmap" \
"\`src/app/PostGame.tsx\` stats view and \`src/ui/CourtDiagram.tsx\` top-down court with bounce heatmap."

issue integration "6: Integration — real vision source + on-court tuning" \
"Swap MockVisionSource for the camera source in Live, play real singles games, compare calls/score/stats with reality, tune thresholds."
