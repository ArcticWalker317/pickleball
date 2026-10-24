import { describe, expect, it } from 'vitest';
import { seededRandom } from '../shared/mockVision';
import type { TrackPoint } from './ballTracker';
import { BounceDetector, type Bounce } from './bounce';
import {
  gaussian,
  makeCamera,
  simulateBall,
  type Bounce3D,
  type Vec3,
} from './testing/syntheticCamera';

const camera = makeCamera();

/** A bounce a person would see: the ball fell from at least ~1 ft. */
const VISIBLE_IMPACT_FT_S = 8;

type Shot = { start: Vec3; velocity: Vec3; durationMs: number };

/** Films a simulated shot at `fps` with pixel noise and runs the detector over it. */
function film(shot: Shot, { fps = 30, noisePx = 1, seed = 1 } = {}) {
  const { samples, bounces } = simulateBall({ ...shot, fps });
  const noise = gaussian(seededRandom(seed));
  const det = new BounceDetector();
  const found: Bounce[] = [];
  for (const s of samples) {
    const p = camera.project(s.pos);
    const pt: TrackPoint = {
      t: s.t,
      img: {
        x: p.x + (noise() * noisePx) / camera.width,
        y: p.y + (noise() * noisePx) / camera.height,
      },
    };
    const b = det.push(pt);
    if (b) found.push(b);
  }
  // A bounce can only be confirmed once a few frames after it have been seen.
  const lastT = samples.at(-1)!.t;
  const truth = bounces.filter((b) => b.t < lastT - (5 * 1000) / fps);
  return { found, truth };
}

/** Distance in feet on the court between a detected bounce and a true one. */
function errorFt(found: Bounce, truth: Bounce3D) {
  const g = camera.toGround(found.img);
  return Math.hypot(g.x - truth.pos.x, g.y - truth.pos.y);
}

const nearest = (b: Bounce, truth: Bounce3D[]) =>
  truth.reduce((best, t) => (Math.abs(t.t - b.t) < Math.abs(best.t - b.t) ? t : best));

const SHOTS: Record<string, Shot> = {
  'serve, near → far': {
    start: { x: 14, y: -1, z: 3 },
    velocity: { x: -6, y: 40, z: 8 },
    durationMs: 1250,
  },
  'drive, far → near (toward camera)': {
    start: { x: 6, y: 45, z: 3 },
    velocity: { x: 4, y: -38, z: 9 },
    durationMs: 1150,
  },
  'dink, double-bouncing in the far kitchen': {
    start: { x: 10, y: 18, z: 2 },
    velocity: { x: 1, y: 10, z: 6 },
    durationMs: 1600,
  },
  'deep lob, near → far': {
    start: { x: 10, y: 2, z: 3 },
    velocity: { x: 0, y: 22, z: 24 },
    durationMs: 2000,
  },
  'crosscourt drive, near → far': {
    start: { x: 2, y: 3, z: 3 },
    velocity: { x: 9, y: 42, z: 6 },
    durationMs: 1000,
  },
};

describe('BounceDetector on synthetic footage', () => {
  for (const [fps, maxErrFt] of [
    [30, 0.5],
    [60, 0.3],
  ] as const) {
    for (const [name, shot] of Object.entries(SHOTS)) {
      it(`${name} @ ${fps} fps`, () => {
        const { found, truth } = film(shot, { fps });
        expect(truth.length).toBeGreaterThan(0);

        // The first bounce — the one every line call is made from — is precise.
        expect(found[0], 'first bounce missed').toBeDefined();
        expect(Math.abs(found[0]!.t - truth[0]!.t)).toBeLessThan(1000 / fps);
        expect(errorFt(found[0]!, truth[0]!)).toBeLessThan(maxErrFt);

        // Every visible bounce is found (double bounces decide winners)...
        for (const t of truth.filter((b) => b.impactVz >= VISIBLE_IMPACT_FT_S)) {
          expect(
            found.some((b) => Math.abs(b.t - t.t) < 1500 / fps),
            `missed bounce at ${t.t.toFixed(0)}ms`,
          ).toBe(true);
        }
        // ...and nothing is reported that wasn't a real bounce.
        for (const b of found) {
          expect(Math.abs(nearest(b, truth).t - b.t), `false bounce at ${b.t}ms`).toBeLessThan(
            1500 / fps,
          );
        }
      });
    }
  }

  // Real detections jitter by a pixel or two. Measure the first-bounce error distribution over many
  // noisy runs of three shot types; these are the numbers that set the line-call uncertainty band.
  for (const [fps, noisePx, maxMedian, maxP95] of [
    [30, 1, 0.2, 0.5],
    [30, 2, 0.35, 0.8],
    [60, 1, 0.15, 0.4],
    [60, 2, 0.3, 0.8],
  ] as const) {
    it(`first-bounce error @ ${fps} fps, ${noisePx} px noise: median < ${maxMedian} ft, p95 < ${maxP95} ft`, () => {
      const errs: number[] = [];
      for (const name of [
        'serve, near → far',
        'crosscourt drive, near → far',
        'dink, double-bouncing in the far kitchen',
      ]) {
        for (let seed = 1; seed <= 30; seed++) {
          const { found, truth } = film(SHOTS[name]!, { fps, noisePx, seed });
          expect(found[0], `${name} seed ${seed}: first bounce missed`).toBeDefined();
          errs.push(errorFt(found[0]!, truth[0]!));
        }
      }
      errs.sort((a, b) => a - b);
      expect(errs[Math.floor(errs.length / 2)]).toBeLessThan(maxMedian);
      expect(errs[Math.floor(errs.length * 0.95)]).toBeLessThan(maxP95);
    });
  }

  it('never reports a bounce for a ball still in the air', () => {
    const lob: Shot = {
      start: { x: 10, y: 2, z: 3 },
      velocity: { x: 0, y: 20, z: 30 },
      durationMs: 1700,
    };
    expect(simulateBall(lob).bounces).toHaveLength(0);
    expect(film(lob).found).toHaveLength(0);
  });

  it('starts fresh after a gap in tracking', () => {
    const det = new BounceDetector({ maxGapMs: 100 });
    const pts = [0, 33, 66, 99, 500, 533].map((t) => ({ t, img: { x: 0.5, y: 0.5 } }));
    expect(pts.map((p) => det.push(p)).filter(Boolean)).toHaveLength(0);
  });
});
