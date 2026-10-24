// A fake VisionSource that plays back plausible singles rallies, so Track B can build the game,
// ref, and stats layers before real tracking exists. Deterministic for a given seed.
//
// The mock keeps its own simple side-out score only to place serves correctly and to decide who
// serves next. It is NOT the source of truth for scoring — that is src/game/scoring.ts.

import {
  CENTER_X,
  COURT_LENGTH,
  COURT_WIDTH,
  FAR_KITCHEN_Y,
  NEAR_KITCHEN_Y,
  NET_Y,
  opponent,
} from './court';
import type { CourtPoint, Pt, Side, VisionEvent, VisionSource } from './types';

export type RallyEnd = 'out' | 'net' | 'winner';

export type MockRally = {
  server: Side;
  /** Events with `t` relative to the start of the rally. */
  events: VisionEvent[];
  end: RallyEnd;
  /** The side that hit the last shot (the one that erred, or hit the winner). */
  lastHitter: Side;
  winner: Side;
};

const BALL_SAMPLE_MS = 33;
const PLAYERS_SAMPLE_MS = 100;
const MAX_SHOTS = 24;

/** mulberry32 — tiny seeded PRNG so mock matches are reproducible. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fake camera projection (camera elevated behind the near baseline), used only so mock `ball`
 * events have image coordinates to draw. `height` is feet above the court.
 */
export function fakeProject(p: CourtPoint, height = 0): Pt {
  const depth = p.y / COURT_LENGTH; // 0 near → 1 far
  const halfWidth = 0.42 - 0.22 * depth;
  return {
    x: 0.5 + ((p.x - CENTER_X) / COURT_WIDTH) * 2 * halfWidth,
    y: 0.92 - 0.62 * Math.sqrt(depth) - height * 0.012,
  };
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const lerpPt = (a: CourtPoint, b: CourtPoint, f: number): CourtPoint => ({
  x: lerp(a.x, b.x, f),
  y: lerp(a.y, b.y, f),
});

/** Generates rallies one after another, tracking serve rotation like real singles play. */
export class MockMatch {
  private rng: () => number;
  private server: Side = 'near';
  private score: Record<Side, number> = { near: 0, far: 0 };

  constructor(seed = 1) {
    this.rng = seededRandom(seed);
  }

  nextRally(): MockRally {
    const rally = generateRally(this.rng, this.server, this.score[this.server]);
    if (rally.winner === this.server) this.score[this.server] += 1;
    else this.server = rally.winner; // side out: in singles the serve passes straight over
    return rally;
  }
}

/** Builds one rally. Pure apart from the supplied rng. */
export function generateRally(rng: () => number, server: Side, serverScore: number): MockRally {
  const rand = (lo: number, hi: number) => lerp(lo, hi, rng());
  const events: VisionEvent[] = [];
  const keyframes: Record<Side, { t: number; p: CourtPoint }[]> = { near: [], far: [] };

  // Serve from the right half on an even score. "Right" is from the server's point of view:
  // the near player faces +y so their right is high x; the far player faces -y so it is low x.
  const serveFromHighX = (serverScore % 2 === 0) === (server === 'near');
  const serveX = serveFromHighX ? rand(12, 17) : rand(3, 8);
  const behindBaseline = server === 'near' ? -1 : COURT_LENGTH + 1;
  let hitterPos: CourtPoint = { x: serveX, y: behindBaseline };

  const receiver = opponent(server);
  const receiveX = COURT_WIDTH - serveX; // crosscourt
  keyframes[server].push({ t: 0, p: hitterPos });
  keyframes[receiver].push({
    t: 0,
    p: { x: receiveX, y: receiver === 'near' ? -1 : COURT_LENGTH + 1 },
  });

  let t = 0;
  let hitter = server;
  let end: RallyEnd | undefined;

  for (let shot = 0; shot < MAX_SHOTS && !end; shot++) {
    const target = opponent(hitter);
    events.push({ kind: 'hit', t, player: hitter, court: hitterPos, confidence: 0.9 });
    keyframes[hitter].push({ t, p: hitterPos });

    // Decide how this shot ends. Serves rarely fault; later shots end ~1 in 5.
    const r = rng();
    const outcome: RallyEnd | 'continue' =
      shot === 0
        ? r < 0.05
          ? 'out'
          : r < 0.08
            ? 'net'
            : 'continue'
        : shot === MAX_SHOTS - 1
          ? 'winner'
          : r < 0.08
            ? 'out'
            : r < 0.14
              ? 'net'
              : r < 0.2
                ? 'winner'
                : 'continue';

    const flight = shot === 0 ? rand(900, 1100) : rand(650, 1050);

    if (outcome === 'net') {
      const netPoint = { x: lerp(hitterPos.x, rand(2, 18), 0.6), y: NET_Y };
      pushBallArc(events, t, t + flight * 0.5, hitterPos, netPoint, 3);
      events.push({ kind: 'net', t: t + flight * 0.5, side: hitter, confidence: 0.85 });
      events.push({ kind: 'lost', t: t + flight * 0.5 + 400 });
      end = 'net';
      t += flight * 0.5;
      break;
    }

    // Landing spot. Serves must land in the diagonal service court; the two-bounce rule means the
    // serve and the return always bounce; after that the receiver may volley.
    const landing = pickLanding(rand, shot, target, serveFromHighX, outcome === 'out');
    const volley = outcome === 'continue' && shot >= 2 && rng() < 0.3;
    const landT = t + flight * (volley ? 1 : 0.7);
    pushBallArc(events, t, landT, hitterPos, landing, volley ? 4 : 6);

    if (!volley) {
      events.push({ kind: 'bounce', t: landT, court: landing, confidence: 0.9 });
    }

    if (outcome === 'out') {
      events.push({ kind: 'lost', t: landT + 500 });
      end = 'out';
      t = landT;
      break;
    }

    if (outcome === 'winner') {
      // Ball bounces twice on the receiver's side without being hit.
      const dir = target === 'far' ? 1 : -1;
      const second = { x: landing.x + rand(-1, 1), y: clampToSide(landing.y + dir * 6, target) };
      pushBallArc(events, landT, landT + 450, landing, second, 2);
      events.push({ kind: 'bounce', t: landT + 450, court: second, confidence: 0.8 });
      events.push({ kind: 'lost', t: landT + 900 });
      keyframes[target].push({ t: landT + 450, p: lerpPt(landing, second, 0.5) });
      end = 'winner';
      t = landT + 450;
      break;
    }

    // Receiver moves to the ball and hits it: on the volley at the landing point, otherwise ~300ms
    // after the bounce, a little behind it.
    const dir = target === 'far' ? 1 : -1;
    const contactT = volley ? landT : landT + rand(250, 380);
    const contactPos: CourtPoint = volley
      ? landing
      : {
          x: clamp(landing.x + rand(-1, 1), 0.5, COURT_WIDTH - 0.5),
          y: clampToSide(landing.y + dir * rand(2, 5), target),
        };
    if (!volley) pushBallArc(events, landT, contactT, landing, contactPos, 2);
    t = contactT;
    hitter = target;
    hitterPos = contactPos;
  }

  addPlayerSamples(events, keyframes, t + 600);
  events.sort((a, b) => a.t - b.t);

  const finalEnd = end ?? 'winner';
  const winner = finalEnd === 'winner' ? hitter : opponent(hitter);
  return { server, events, end: finalEnd, lastHitter: hitter, winner };
}

function pickLanding(
  rand: (lo: number, hi: number) => number,
  shot: number,
  target: Side,
  serveFromHighX: boolean,
  out: boolean,
): CourtPoint {
  if (out) {
    // Long or wide by 0.5–3 ft.
    const long = rand(0, 1) < 0.6;
    if (long) {
      const y = target === 'far' ? COURT_LENGTH + rand(0.5, 3) : -rand(0.5, 3);
      return { x: rand(2, 18), y };
    }
    const x = rand(0, 1) < 0.5 ? -rand(0.5, 3) : COURT_WIDTH + rand(0.5, 3);
    return { x, y: target === 'far' ? rand(NET_Y + 3, COURT_LENGTH - 2) : rand(2, NET_Y - 3) };
  }
  if (shot === 0) {
    // Diagonal service court, beyond the kitchen line.
    const x = serveFromHighX ? rand(1, CENTER_X - 1) : rand(CENTER_X + 1, COURT_WIDTH - 1);
    const y =
      target === 'far' ? rand(FAR_KITCHEN_Y + 2, COURT_LENGTH - 1) : rand(1, NEAR_KITCHEN_Y - 2);
    return { x, y };
  }
  const y = target === 'far' ? rand(NET_Y + 2, COURT_LENGTH - 1) : rand(1, NET_Y - 2);
  return { x: rand(1, COURT_WIDTH - 1), y };
}

function pushBallArc(
  events: VisionEvent[],
  t0: number,
  t1: number,
  from: CourtPoint,
  to: CourtPoint,
  peakHeight: number,
) {
  for (let t = t0; t < t1; t += BALL_SAMPLE_MS) {
    const f = (t - t0) / (t1 - t0);
    const height = 4 * peakHeight * f * (1 - f);
    events.push({
      kind: 'ball',
      t,
      img: fakeProject(lerpPt(from, to, f), height),
      confidence: 0.8,
    });
  }
}

function addPlayerSamples(
  events: VisionEvent[],
  keyframes: Record<Side, { t: number; p: CourtPoint }[]>,
  until: number,
) {
  for (let t = 0; t <= until; t += PLAYERS_SAMPLE_MS) {
    events.push({
      kind: 'players',
      t,
      near: sampleKeyframes(keyframes.near, t),
      far: sampleKeyframes(keyframes.far, t),
    });
  }
}

function sampleKeyframes(frames: { t: number; p: CourtPoint }[], t: number): CourtPoint {
  const sorted = [...frames].sort((a, b) => a.t - b.t);
  const first = sorted[0]!;
  if (t <= first.t) return first.p;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (t <= b.t) return lerpPt(a.p, b.p, (t - a.t) / (b.t - a.t || 1));
  }
  return sorted[sorted.length - 1]!.p;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampToSide = (y: number, side: Side) =>
  side === 'far' ? clamp(y, NET_Y + 1, COURT_LENGTH + 3) : clamp(y, -3, NET_Y - 1);

export type MockVisionOptions = {
  seed?: number;
  /** Playback speed multiplier (2 = twice as fast). */
  speed?: number;
  /** Pause between rallies in ms. */
  rallyGapMs?: number;
  /** Stop after this many rallies (default: play forever). */
  rallies?: number;
  /** Play these exact events instead of generating rallies (absolute `t`, ms). */
  script?: VisionEvent[];
};

/** Plays mock rallies in real time through the VisionSource interface. */
export class MockVisionSource implements VisionSource {
  private listeners = new Set<(e: VisionEvent) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private queue: VisionEvent[] = [];
  private match: MockMatch;
  private nextRallyAt = 0;
  private ralliesPlayed = 0;
  private startedAt = 0;
  private readonly speed: number;
  private readonly rallyGapMs: number;
  private readonly maxRallies: number;
  private readonly script?: VisionEvent[];

  constructor(opts: MockVisionOptions = {}) {
    this.match = new MockMatch(opts.seed ?? 1);
    this.speed = opts.speed ?? 1;
    this.rallyGapMs = opts.rallyGapMs ?? 2500;
    this.maxRallies = opts.rallies ?? Infinity;
    this.script = opts.script;
  }

  onEvent(cb: (e: VisionEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(): void {
    if (this.timer) return;
    this.startedAt = Date.now();
    this.queue = this.script ? [...this.script].sort((a, b) => a.t - b.t) : [];
    this.timer = setInterval(() => this.tick(), 16);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick() {
    const now = (Date.now() - this.startedAt) * this.speed;
    if (!this.script && this.queue.length === 0 && this.ralliesPlayed < this.maxRallies) {
      const rally = this.match.nextRally();
      const offset = Math.max(now, this.nextRallyAt);
      this.queue = rally.events.map((e) => ({ ...e, t: e.t + offset }));
      this.nextRallyAt = (this.queue.at(-1)?.t ?? offset) + this.rallyGapMs;
      this.ralliesPlayed++;
    }
    while (this.queue.length && this.queue[0]!.t <= now) {
      const e = this.queue.shift()!;
      this.listeners.forEach((cb) => cb(e));
    }
    if (this.queue.length === 0 && (this.script || this.ralliesPlayed >= this.maxRallies)) {
      this.stop();
    }
  }
}
