import { describe, expect, it } from 'vitest';
import { seededRandom } from '../shared/mockVision';
import type { Pt } from '../shared/types';
import type { BallCandidate } from './ballDetector';
import { BallTracker, type TrackerUpdate } from './ballTracker';
import { Kalman2D } from './kalman';
import { gaussian, makeCamera, simulateBall } from './testing/syntheticCamera';

const cand = (img: Pt, score = 0.9): BallCandidate => ({ img, area: 20, score });

describe('Kalman2D', () => {
  it('learns a constant velocity from noisy measurements', () => {
    const noise = gaussian(seededRandom(1));
    const k = new Kalman2D(0.1, 0.5);
    for (let i = 1; i <= 30; i++) {
      k.predict(1 / 30);
      k.update(0.1 + 0.3 * (i / 30) + noise() * 0.001, 0.5 - 0.2 * (i / 30) + noise() * 0.001);
    }
    expect(k.velocity.x).toBeCloseTo(0.3, 1);
    expect(k.velocity.y).toBeCloseTo(-0.2, 1);
  });
});

describe('BallTracker', () => {
  const camera = makeCamera();
  const { samples } = simulateBall({
    start: { x: 14, y: -1, z: 3 },
    velocity: { x: -6, y: 40, z: 8 },
    durationMs: 1200,
  });
  const noise = gaussian(seededRandom(2));
  const observed = samples.map((s) => {
    const p = camera.project(s.pos);
    return { t: s.t, img: { x: p.x + noise() * 0.0005, y: p.y + noise() * 0.0005 } };
  });

  it('confirms a track only after several consistent detections', () => {
    const tr = new BallTracker({ confirmAfter: 3 });
    const kinds = observed.slice(0, 4).map((o) => tr.push(o.t, [cand(o.img)]).kind);
    expect(kinds).toEqual(['none', 'none', 'ball', 'ball']);
  });

  it('follows the real ball and ignores a static distractor', () => {
    const tr = new BallTracker();
    const distractor = cand({ x: 0.9, y: 0.1 }, 1); // scores higher than the ball
    let last: TrackerUpdate = { kind: 'none' };
    for (const o of observed) last = tr.push(o.t, [distractor, cand(o.img)]);
    expect(last.kind).toBe('ball');
    if (last.kind === 'ball') expect(last.img.x).toBeCloseTo(observed.at(-1)!.img.x, 2);
  });

  it('coasts through a short dropout, then reports lost after too many misses', () => {
    const tr = new BallTracker({ maxMisses: 4 });
    const kinds: string[] = [];
    observed.forEach((o, i) => {
      const missing = (i >= 10 && i < 13) || i >= 20;
      kinds.push(tr.push(o.t, missing ? [] : [cand(o.img)]).kind);
    });
    expect(kinds.slice(10, 14)).toEqual(['coasting', 'coasting', 'coasting', 'ball']);
    expect(kinds.slice(20, 25)).toEqual(['coasting', 'coasting', 'coasting', 'coasting', 'lost']);
    expect(kinds.slice(25).every((k) => k === 'none')).toBe(true);
  });

  it('never confirms a one-frame flicker', () => {
    const tr = new BallTracker();
    const kinds = [0, 33, 66, 100].map(
      (t, i) => tr.push(t, [cand({ x: 0.1 + 0.3 * i, y: 0.8 - 0.25 * i })]).kind,
    );
    expect(kinds.includes('ball')).toBe(false);
  });
});
