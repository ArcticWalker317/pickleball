import { describe, expect, it } from 'vitest';
import { seededRandom } from '../shared/mockVision';
import { detectBall, isBallColored, type Frame } from './ballDetector';
import { courtFrame, paintDisc } from './testing/syntheticCamera';

const W = 640;
const H = 360;
const NEON: [number, number, number] = [215, 240, 60];

function frame(seed: number, paint?: (d: Uint8ClampedArray) => void): Frame {
  const data = courtFrame(W, H, seededRandom(seed));
  paint?.(data);
  return { width: W, height: H, data };
}

describe('isBallColored', () => {
  it('accepts neon yellow-green and rejects court colors, white and grey', () => {
    expect(isBallColored(...NEON, 'yellow')).toBe(true);
    expect(isBallColored(40, 110, 80, 'yellow')).toBe(false); // court green
    expect(isBallColored(240, 240, 240, 'yellow')).toBe(false); // white line
    expect(isBallColored(120, 120, 110, 'yellow')).toBe(false); // grey
    expect(isBallColored(60, 70, 20, 'yellow')).toBe(false); // too dark
  });

  it('supports orange balls', () => {
    expect(isBallColored(250, 120, 30, 'orange')).toBe(true);
    expect(isBallColored(250, 120, 30, 'yellow')).toBe(false);
  });
});

describe('detectBall', () => {
  it('finds a moving ball at sub-pixel accuracy', () => {
    const prev = frame(1, (d) => paintDisc(d, W, 200, 150, 4, NEON));
    const cur = frame(2, (d) => paintDisc(d, W, 230.5, 140.5, 4, NEON));
    const [best] = detectBall(cur, prev);
    expect(best).toBeDefined();
    expect(best!.img.x * W).toBeCloseTo(231, 0);
    expect(best!.img.y * H).toBeCloseTo(141, 0);
  });

  it('ignores a yellow object that is not moving', () => {
    const sign = (d: Uint8ClampedArray) => paintDisc(d, W, 500, 60, 5, NEON);
    const prev = frame(1, sign);
    const cur = frame(2, (d) => {
      sign(d);
      paintDisc(d, W, 100, 300, 3, NEON);
    });
    const found = detectBall(cur, prev);
    expect(found).toHaveLength(1);
    expect(found[0]!.img.x * W).toBeCloseTo(100.5, 0);
  });

  it('rejects blobs that are too big (a yellow shirt walking by)', () => {
    const prev = frame(1);
    const cur = frame(2, (d) => paintDisc(d, W, 300, 200, 30, NEON));
    expect(detectBall(cur, prev)).toHaveLength(0);
  });

  it('keeps a motion-blurred streak but rejects a long thin line', () => {
    const streak = frame(2, (d) => {
      for (let x = 0; x < 9; x++) paintDisc(d, W, 300 + x, 200, 2.5, NEON);
    });
    expect(detectBall(streak, frame(1))).toHaveLength(1);
    const line = frame(2, (d) => {
      for (let x = 0; x < 60; x++) paintDisc(d, W, 300 + x, 200, 1, NEON);
    });
    expect(detectBall(line, frame(1))).toHaveLength(0);
  });

  it('works on the first frame without a previous one', () => {
    const cur = frame(2, (d) => paintDisc(d, W, 50, 50, 4, NEON));
    expect(detectBall(cur, undefined)).toHaveLength(1);
  });

  it('runs fast enough for real time on a 640x360 frame', () => {
    const prev = frame(1);
    const cur = frame(2, (d) => paintDisc(d, W, 230, 140, 4, NEON));
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) detectBall(cur, prev);
    const perFrame = (performance.now() - t0) / 20;
    expect(perFrame).toBeLessThan(25); // generous for CI; a phone at 60fps has ~16ms total
  });
});
