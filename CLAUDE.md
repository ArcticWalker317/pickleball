# Pickleball Ref — instructions for Claude Code

An iPhone web app (PWA) that turns a propped-up phone into a pickleball referee: it tracks the ball
and players through the camera, calls in/out out loud, keeps score, and shows post-game stats.
MVP = **singles**, **live on-device processing**. Full plan: [docs/PLAN.md](docs/PLAN.md).

**Two people build this at the same time, each with their own Claude Code.** Follow the ownership
and workflow rules below so you don't step on each other.

## Who owns what

| Track              | Owner                      | Owns these paths                                                                                                                |
| ------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **A — Vision**     | ArcticWalker317            | `src/camera/`, `src/vision/`, `src/app/Calibrate.tsx`, `src/ui/DebugOverlay.tsx`                                                |
| **B — Game & App** | Track B owner (the friend) | `src/game/`, `src/ref/`, `src/stats/`, `src/storage/`, `src/app/{Home,Live,PostGame}.tsx`, `src/ui/{CourtDiagram,ScoreBar}.tsx` |
| **Shared**         | both — changes need both   | `src/shared/`, `src/app/{App.tsx,router.ts}`, `src/main.tsx`, `src/index.css`, `package.json`, configs, `CLAUDE.md`, `docs/`    |

- **Before editing, figure out which track the current user is on** (ask if unclear) and only edit
  that track's paths.
- Need something changed in the other track's code? **Open a GitHub issue** for the other owner
  instead of editing it. Small, obviously-safe fixes are OK only if called out in the PR description.
- **Shared paths** (especially `src/shared/types.ts`, the contract) change only in a **dedicated small
  PR** that touches nothing else, and the other owner must approve it.

## The contract

`src/shared/types.ts` defines `VisionEvent` and `VisionSource`. Track A produces events, Track B
consumes them and never touches pixels. Court geometry and the coordinate system (feet, origin at the
near-left corner, y away from the camera) live in `src/shared/court.ts`.
Track B develops against `MockVisionSource` (`src/shared/mockVision.ts`); integration = swapping in
Track A's real source.

## Workflow

- Never commit to `main`. Branch as `vision/<task>` (Track A) or `game/<task>` (Track B),
  or `shared/<task>` for contract/config changes.
- Work from GitHub Issues (`gh issue list --label track:vision` / `track:game`). Reference the issue
  in the PR (`Closes #12`). Keep PRs small; squash-merge.
- `git pull --rebase origin main` before starting work and before opening a PR.
- **Run `npm run check` before every commit** (typecheck + lint + prettier + vitest). CI runs the
  same plus `npm run build`.
- Adding a dependency touches shared `package.json` — mention it in the PR title.
- Commit `package-lock.json`. Use `npm ci` after pulling.
- Never commit video footage; `clips/` is gitignored. Footage is shared via cloud drive.

## Commands

- `npm run dev` — local dev server. `npm run dev:phone` — exposes on LAN; the camera needs HTTPS,
  so test on the phone via the deployed preview or a tunnel (`cloudflared tunnel --url http://localhost:5173`).
- `npm run check` — everything CI checks. `npm run test:watch` — vitest in watch mode.

## Code conventions

- TypeScript strict, React function components, no UI framework. Keep dependencies minimal.
- Pure logic (homography, scoring, rally machine, line calls, stats) lives in plain `.ts` modules
  with a colocated `*.test.ts`. React components stay thin.
- Court positions are always feet in court coordinates; image positions are always normalized [0,1].
- Prettier formats everything (single quotes, 100 cols, LF line endings).
