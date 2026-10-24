# Pickleball Ref

Your phone is the ref. Prop an iPhone up with a view of the court and it tracks the ball and
players, calls in/out out loud, keeps score, and shows post-game stats.

**Status:** MVP in progress — iPhone web app (PWA), singles. See [docs/PLAN.md](docs/PLAN.md).

## Getting started

```sh
npm ci
npm run dev        # http://localhost:5173 — try "Demo (mock tracking)"
npm run check      # typecheck + lint + format + tests (what CI runs)
```

The camera only works over HTTPS, so test on a phone through the deployed preview or a tunnel
(`cloudflared tunnel --url http://localhost:5173`).

## Working on this repo

Two tracks are built in parallel — **Vision** and **Game & App**. Read [CLAUDE.md](CLAUDE.md) for
who owns what, the branch/PR workflow, and the vision ↔ game contract in `src/shared/types.ts`.
