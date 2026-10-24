import { describe, expect, it } from 'vitest';
import {
  CENTER_X,
  COURT_LENGTH,
  COURT_WIDTH,
  FAR_KITCHEN_Y,
  NEAR_KITCHEN_Y,
  NET_Y,
  sideOf,
} from '../shared/court';
import { generateRally, seededRandom } from '../shared/mockVision';
import {
  DEFAULT_TOLERANCE_FT,
  callLine,
  callRallyShot,
  callServe,
  rallyRegion,
  servesFromHighX,
  serviceRegion,
} from './lineCall';

const exact = { tolerance: 0 };

describe('callLine', () => {
  const box = { minX: 0, maxX: 10, minY: 0, maxY: 10 };

  it('calls clearly inside in and clearly outside out', () => {
    expect(callLine({ x: 5, y: 5 }, box)).toBe('in');
    expect(callLine({ x: 11, y: 5 }, box)).toBe('out');
    expect(callLine({ x: 5, y: -1 }, box)).toBe('out');
  });

  it('calls a ball on the line in (exact tolerance)', () => {
    expect(callLine({ x: 0, y: 5 }, box, exact)).toBe('in');
    expect(callLine({ x: 10, y: 10 }, box, exact)).toBe('in');
  });

  it('calls a ball on an exclusive line out (exact tolerance)', () => {
    expect(callLine({ x: 5, y: 0 }, { ...box, exclusive: { minY: true } }, exact)).toBe('out');
  });

  it('is uncertain within the tolerance band on either side of a line', () => {
    const tol = DEFAULT_TOLERANCE_FT;
    expect(callLine({ x: 10 - tol / 2, y: 5 }, box)).toBe('uncertain');
    expect(callLine({ x: 10, y: 5 }, box)).toBe('uncertain');
    expect(callLine({ x: 10 + tol / 2, y: 5 }, box)).toBe('uncertain');
    expect(callLine({ x: 10 - tol * 2, y: 5 }, box)).toBe('in');
    expect(callLine({ x: 10 + tol * 2, y: 5 }, box)).toBe('out');
  });

  it('honours a custom tolerance', () => {
    expect(callLine({ x: 9.5, y: 5 }, box, { tolerance: 1 })).toBe('uncertain');
    expect(callLine({ x: 9.5, y: 5 }, box, { tolerance: 0.1 })).toBe('in');
  });

  it('is out, not uncertain, when barely past one line but far past another', () => {
    expect(callLine({ x: 10.1, y: 15 }, box)).toBe('out');
  });

  it('is uncertain near a corner from outside', () => {
    expect(callLine({ x: 10.1, y: 10.1 }, box)).toBe('uncertain');
  });
});

describe('rally shots', () => {
  it('must land on the opponent half; the net line and all edges are in', () => {
    expect(rallyRegion('near')).toEqual({ minX: 0, maxX: 20, minY: NET_Y, maxY: COURT_LENGTH });
    expect(callRallyShot({ x: 10, y: 35 }, 'near')).toBe('in');
    expect(callRallyShot({ x: 10, y: 10 }, 'far')).toBe('in');
    expect(callRallyShot({ x: COURT_WIDTH, y: COURT_LENGTH }, 'near', exact)).toBe('in');
    expect(callRallyShot({ x: 0, y: 0 }, 'far', exact)).toBe('in');
  });

  it('calls long and wide shots out', () => {
    expect(callRallyShot({ x: 10, y: COURT_LENGTH + 1 }, 'near')).toBe('out');
    expect(callRallyShot({ x: -1, y: 30 }, 'near')).toBe('out');
    expect(callRallyShot({ x: 10, y: -2 }, 'far')).toBe('out');
    expect(callRallyShot({ x: COURT_WIDTH + 2, y: 10 }, 'far')).toBe('out');
  });

  it('allows a kitchen bounce in a rally', () => {
    expect(callRallyShot({ x: 10, y: NET_Y + 2 }, 'near')).toBe('in');
    expect(callRallyShot({ x: 10, y: FAR_KITCHEN_Y }, 'near', exact)).toBe('in');
  });
});

describe('serves', () => {
  it('serves from the right: high x for near, low x for far, on an even score', () => {
    expect(servesFromHighX('near', 0)).toBe(true);
    expect(servesFromHighX('near', 3)).toBe(false);
    expect(servesFromHighX('far', 0)).toBe(false);
    expect(servesFromHighX('far', 5)).toBe(true);
  });

  it('targets the diagonal service court beyond the kitchen', () => {
    // Near server on 0 serves from high x → far side, low x.
    expect(serviceRegion('near', 0)).toMatchObject({
      minX: 0,
      maxX: CENTER_X,
      minY: FAR_KITCHEN_Y,
      maxY: COURT_LENGTH,
    });
    expect(callServe({ x: 5, y: 37 }, 'near', 0)).toBe('in');
    expect(callServe({ x: 15, y: 37 }, 'near', 0)).toBe('out'); // wrong service court
    expect(callServe({ x: 15, y: 37 }, 'near', 1)).toBe('in');
    // Far server on 0 serves from low x → near side, high x.
    expect(callServe({ x: 15, y: 7 }, 'far', 0)).toBe('in');
    expect(callServe({ x: 5, y: 7 }, 'far', 0)).toBe('out');
  });

  it('calls a serve into the kitchen out, including on the kitchen line', () => {
    expect(callServe({ x: 5, y: NET_Y + 3 }, 'near', 0)).toBe('out');
    expect(callServe({ x: 5, y: FAR_KITCHEN_Y }, 'near', 0, exact)).toBe('out');
    expect(callServe({ x: 15, y: NEAR_KITCHEN_Y }, 'far', 0, exact)).toBe('out');
  });

  it('calls a serve on the center line, baseline, or sideline in', () => {
    expect(callServe({ x: CENTER_X, y: 37 }, 'near', 0, exact)).toBe('in');
    expect(callServe({ x: 0, y: COURT_LENGTH }, 'near', 0, exact)).toBe('in');
    expect(callServe({ x: COURT_WIDTH, y: 0 }, 'far', 0, exact)).toBe('in');
  });

  it('is uncertain near the kitchen line', () => {
    expect(callServe({ x: 5, y: FAR_KITCHEN_Y + 0.1 }, 'near', 0)).toBe('uncertain');
    expect(callServe({ x: 5, y: FAR_KITCHEN_Y - 0.1 }, 'near', 0)).toBe('uncertain');
  });
});

describe('agrees with mock rallies', () => {
  it('calls every mock bounce the way the mock intended', () => {
    for (let i = 0; i < 300; i++) {
      const server = i % 2 ? 'near' : 'far';
      const serverScore = i % 5;
      const r = generateRally(seededRandom(i), server, serverScore);
      const hits = r.events.filter((e) => e.kind === 'hit');
      const bounces = r.events.filter((e) => e.kind === 'bounce');
      bounces.forEach((b, j) => {
        const hitter = [...hits].reverse().find((h) => h.t <= b.t)!;
        // Only the first bounce after a hit is called. A winner's second bounce can roll past
        // the baseline, and that doesn't matter.
        if (j > 0 && bounces[j - 1]!.t >= hitter.t) return;
        const call =
          hitter === hits[0]
            ? callServe(b.court, server, serverScore)
            : callRallyShot(b.court, hitter.player);
        if (r.end === 'out' && b === bounces.at(-1)) expect(call).toBe('out');
        else expect(call).not.toBe('out');
        expect(sideOf(b.court)).not.toBe(hitter.player);
      });
    }
  });
});
