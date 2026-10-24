// Track A (vision) — owned by ArcticWalker317. See docs/PLAN.md.
//
// Turns per-frame ball candidates into one ball track. Every candidate seeds a tentative
// hypothesis; one is confirmed only after several consistent detections AND real movement, so a
// yellow flicker or a parked ball never becomes "the ball". The confirmed track coasts through short
// dropouts on its Kalman prediction and is dropped after too many misses.

import type { Pt } from '../shared/types';
import type { BallCandidate } from './ballDetector';
import { Kalman2D } from './kalman';

export type TrackPoint = { t: number; img: Pt };

export type TrackerOptions = {
  /** Detections needed before a track is trusted. */
  confirmAfter: number;
  /** Consecutive frames without a detection before the confirmed track is dropped. */
  maxMisses: number;
  /** Gate floor (normalized units) so a slow ball can still be re-acquired. */
  minGate: number;
  /** A hypothesis must travel this far (normalized) before it can be confirmed. */
  minTravel: number;
  /** Cap on simultaneous tentative hypotheses. */
  maxHypotheses: number;
};

export const DEFAULT_TRACKER: TrackerOptions = {
  confirmAfter: 3,
  maxMisses: 6,
  minGate: 0.02,
  minTravel: 0.01,
  maxHypotheses: 8,
};

export type TrackerUpdate =
  | { kind: 'ball'; t: number; img: Pt; confidence: number; measured: TrackPoint }
  | { kind: 'coasting'; t: number; img: Pt }
  | { kind: 'lost'; t: number }
  | { kind: 'none' };

type Hypothesis = { filter: Kalman2D; lastT: number; hits: number; misses: number; origin: Pt };

export class BallTracker {
  private track?: Hypothesis;
  private tentative: Hypothesis[] = [];
  private readonly o: TrackerOptions;

  constructor(opts: Partial<TrackerOptions> = {}) {
    this.o = { ...DEFAULT_TRACKER, ...opts };
  }

  get confirmed() {
    return this.track !== undefined;
  }

  /** Feed one frame's candidates (from detectBall) at time `t` in ms. */
  push(t: number, candidates: BallCandidate[]): TrackerUpdate {
    return this.track ? this.follow(t, candidates) : this.search(t, candidates);
  }

  reset() {
    this.track = undefined;
    this.tentative = [];
  }

  private follow(t: number, candidates: BallCandidate[]): TrackerUpdate {
    const track = this.track!;
    const match = this.associate(track, t, candidates);
    if (!match) {
      track.misses++;
      if (track.misses > this.o.maxMisses) {
        this.reset();
        this.seed(t, candidates);
        return { kind: 'lost', t };
      }
      return { kind: 'coasting', t, img: track.filter.position };
    }
    const { c, d, gate } = match;
    track.filter.update(c.img.x, c.img.y);
    track.misses = 0;
    const confidence = Math.min(1, 0.5 + 0.5 * c.score) * (1 - d / gate / 2);
    return { kind: 'ball', t, img: track.filter.position, confidence, measured: { t, img: c.img } };
  }

  private search(t: number, candidates: BallCandidate[]): TrackerUpdate {
    const unused = new Set(candidates);
    const survivors: Hypothesis[] = [];
    for (const h of this.tentative) {
      const match = this.associate(h, t, [...unused]);
      if (!match) continue; // tentative hypotheses die on their first miss
      unused.delete(match.c);
      h.filter.update(match.c.img.x, match.c.img.y);
      h.hits++;
      survivors.push(h);
    }
    this.tentative = survivors;

    const winner = survivors.find((h) => {
      const p = h.filter.position;
      return (
        h.hits >= this.o.confirmAfter &&
        Math.hypot(p.x - h.origin.x, p.y - h.origin.y) >= this.o.minTravel
      );
    });
    if (winner) {
      this.track = winner;
      this.tentative = [];
      return {
        kind: 'ball',
        t,
        img: winner.filter.position,
        confidence: 0.6,
        measured: { t, img: winner.filter.position },
      };
    }
    this.seed(t, [...unused]);
    return { kind: 'none' };
  }

  /** Predicts `h` to time t and returns the nearest candidate inside its gate. */
  private associate(h: Hypothesis, t: number, candidates: BallCandidate[]) {
    h.filter.predict(Math.max(1e-3, (t - h.lastT) / 1000));
    h.lastT = t;
    const p = h.filter.position;
    const gate = Math.max(this.o.minGate, h.filter.gate(3));
    let best: { c: BallCandidate; d: number; gate: number } | undefined;
    for (const c of candidates) {
      const d = Math.hypot(c.img.x - p.x, c.img.y - p.y);
      if (d < gate && d < (best?.d ?? Infinity)) best = { c, d, gate };
    }
    return best;
  }

  private seed(t: number, candidates: BallCandidate[]) {
    for (const c of candidates) {
      if (this.tentative.length >= this.o.maxHypotheses) break;
      this.tentative.push({
        filter: new Kalman2D(c.img.x, c.img.y),
        lastT: t,
        hits: 1,
        misses: 0,
        origin: c.img,
      });
    }
  }
}
