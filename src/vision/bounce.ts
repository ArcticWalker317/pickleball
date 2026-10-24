// Track A (vision) — owned by ArcticWalker317. See docs/PLAN.md.
//
// Finds the moment the ball meets the court. Whatever direction the ball travels, at contact its
// vertical velocity flips from falling to rising, which shows up in the image as a sudden jump of
// the image-y velocity toward "up" (negative). Gravity bends the path the other way, so it never
// looks like a bounce.
//
// For each gap between frames we fit a line to the few points before and after, in x(t) and y(t).
// A big upward jump in y-slope marks contact; intersecting the two y-lines gives the contact time
// between frames, and the x-line at that time gives the position — far more precise than taking
// the nearest frame (a 40 ft/s ball travels 1.3 ft between frames at 30 fps).
//
// The returned image point is ON THE GROUND, so callers map it to court feet with the homography.
//
// Limitation (until player tracking, issue #6): a near-side player hitting the ball up and away
// produces the same signature. Hits happen at a player's position, so that is where they'll be
// told apart.

import type { Pt } from '../shared/types';
import type { TrackPoint } from './ballTracker';

export type BounceOptions = {
  /**
   * Time fitted on each side of a candidate contact. Fixed in time, not frames: at 60 fps a
   * 3-frame window is only 50 ms and detection noise swamps the velocity estimate.
   */
  windowMs: number;
  /** Minimum upward jump in image-y velocity (normalized units / s). */
  minJump: number;
  /** Max gap between consecutive points (ms) for them to count as one flight. */
  maxGapMs: number;
  /** Two bounces can't be closer than this (ms). */
  refractoryMs: number;
};

export const DEFAULT_BOUNCE: BounceOptions = {
  windowMs: 100,
  minJump: 0.2,
  maxGapMs: 120,
  refractoryMs: 150,
};

export type Bounce = {
  t: number;
  /** Contact point on the ground, normalized image coordinates. */
  img: Pt;
  /** Size of the velocity jump (normalized/s) — bigger = more certain. */
  jump: number;
  confidence: number;
};

type Line = { a: number; b: number }; // value = a + b * t (t in seconds)

function fit(ts: number[], vs: number[]): Line {
  const n = ts.length;
  const mt = ts.reduce((s, t) => s + t, 0) / n;
  const mv = vs.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (ts[i]! - mt) * (vs[i]! - mv);
    den += (ts[i]! - mt) ** 2;
  }
  const b = den ? num / den : 0;
  return { a: mv - b * mt, b };
}

/** Streaming bounce detector: push measured track points in time order, get bounces back. */
export class BounceDetector {
  private points: TrackPoint[] = [];
  private frameMs?: number;
  private lastBounceT = -Infinity;
  private readonly o: BounceOptions;

  constructor(opts: Partial<BounceOptions> = {}) {
    this.o = { ...DEFAULT_BOUNCE, ...opts };
  }

  /** Returns a bounce once enough frames after it have been seen (latency ≈ windowMs + 1 frame). */
  push(p: TrackPoint): Bounce | undefined {
    const last = this.points.at(-1);
    if (last && p.t - last.t > this.o.maxGapMs) this.points = [];
    else if (last)
      this.frameMs = this.frameMs ? 0.9 * this.frameMs + 0.1 * (p.t - last.t) : p.t - last.t;
    this.points.push(p);
    const k = this.window();
    // Keep enough history to evaluate splits s-1, s, s+1 around the newest decidable split.
    if (this.points.length > 2 * k + 3) this.points.shift();
    if (this.points.length < 2 * k + 2) return undefined;

    // Candidate split s sits between points[s] and points[s+1]; it needs k points after it plus one
    // more split after it for the local-maximum test.
    const s = this.points.length - k - 2;
    const here = this.evaluate(s);
    if (!here || here.jump < this.o.minJump) return undefined;
    const before = this.evaluate(s - 1);
    const after = this.evaluate(s + 1);
    if ((before && before.jump > here.jump) || (after && after.jump >= here.jump)) return undefined;
    if (here.t - this.lastBounceT < this.o.refractoryMs) return undefined;
    this.lastBounceT = here.t;
    return here;
  }

  reset() {
    this.points = [];
  }

  /** Frames per side of a split: windowMs at the observed frame rate, at least 3. */
  private window(): number {
    return Math.max(3, Math.round(this.o.windowMs / (this.frameMs ?? 33)));
  }

  private evaluate(s: number): Bounce | undefined {
    const k = this.window();
    if (s - k + 1 < 0 || s + k >= this.points.length) return undefined;
    const pre = this.points.slice(s - k + 1, s + 1);
    const post = this.points.slice(s + 1, s + 1 + k);
    const sec = (pts: TrackPoint[]) => pts.map((p) => p.t / 1000);
    const yPre = fit(
      sec(pre),
      pre.map((p) => p.img.y),
    );
    const yPost = fit(
      sec(post),
      post.map((p) => p.img.y),
    );
    const jump = yPre.b - yPost.b;
    if (jump <= 0) return { t: 0, img: { x: 0, y: 0 }, jump, confidence: 0 };

    // Contact time: where the two y-lines meet, kept between the frames either side of the split.
    const t0 = this.points[s]!.t / 1000;
    const t1 = this.points[s + 1]!.t / 1000;
    const tc = Math.min(t1, Math.max(t0, (yPost.a - yPre.a) / (yPre.b - yPost.b)));
    const xPre = fit(
      sec(pre),
      pre.map((p) => p.img.x),
    );
    const xPost = fit(
      sec(post),
      post.map((p) => p.img.x),
    );
    const img = {
      x: (xPre.a + xPre.b * tc + (xPost.a + xPost.b * tc)) / 2,
      y: yPre.a + yPre.b * tc,
    };
    const confidence = Math.min(1, jump / (this.o.minJump * 4));
    return { t: tc * 1000, img, jump, confidence };
  }
}
