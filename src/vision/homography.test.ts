import { describe, expect, it } from 'vitest';
import { COURT_CORNERS, COURT_WIDTH, NET_Y } from '../shared/court';
import type { Pt } from '../shared/types';
import {
  applyHomography,
  computeHomography,
  courtToImage,
  imageToCourt,
  invertHomography,
  isPlausibleQuad,
  makeCalibration,
} from './homography';

const close = (a: Pt, b: Pt, eps = 1e-6) => {
  expect(a.x).toBeCloseTo(b.x, -Math.log10(eps));
  expect(a.y).toBeCloseTo(b.y, -Math.log10(eps));
};

// A realistic view: camera elevated behind the near baseline, far court foreshortened.
const corners: [Pt, Pt, Pt, Pt] = [
  { x: 0.08, y: 0.92 },
  { x: 0.92, y: 0.92 },
  { x: 0.7, y: 0.3 },
  { x: 0.3, y: 0.3 },
];

describe('computeHomography', () => {
  it('maps each source corner exactly onto its destination', () => {
    const H = computeHomography(corners, COURT_CORNERS);
    corners.forEach((c, i) => close(applyHomography(H, c), COURT_CORNERS[i]!));
  });

  it('is the identity for identical quads', () => {
    const H = computeHomography(corners, corners);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(H[i]).toBeCloseTo(v, 9));
  });

  it('throws on collapsed points', () => {
    const p = { x: 0.5, y: 0.5 };
    expect(() => computeHomography([p, p, p, p], COURT_CORNERS)).toThrow();
  });
});

describe('calibration round trip', () => {
  const cal = makeCalibration(corners);

  it('court → image → court returns the same point', () => {
    for (const p of [
      { x: 10, y: NET_Y },
      { x: 3.3, y: 40.1 },
      { x: -1.5, y: 45 }, // just outside the court still works
    ]) {
      close(imageToCourt(cal, courtToImage(cal, p)), p);
    }
  });

  it('inverse composed with H is the identity', () => {
    const Hi = invertHomography(cal.H);
    close(applyHomography(Hi, applyHomography(cal.H, { x: 0.4, y: 0.6 })), { x: 0.4, y: 0.6 });
  });

  it('respects perspective: the net is above the image midpoint of the baselines', () => {
    const net = courtToImage(cal, { x: COURT_WIDTH / 2, y: NET_Y });
    expect(net.y).toBeLessThan((0.92 + 0.3) / 2); // foreshortening pushes the net toward the far end
  });
});

describe('isPlausibleQuad', () => {
  it('accepts a real court view in either winding', () => {
    expect(isPlausibleQuad(corners)).toBe(true);
    expect(isPlausibleQuad([...corners].reverse() as typeof corners)).toBe(true);
  });

  it('rejects crossed (out of order) corners', () => {
    const [a, b, c, d] = corners;
    expect(isPlausibleQuad([a, c, b, d])).toBe(false);
  });

  it('rejects corners tapped on top of each other', () => {
    const [a, b, c] = corners;
    expect(isPlausibleQuad([a, b, c, { x: c.x + 0.001, y: c.y }])).toBe(false);
  });
});
