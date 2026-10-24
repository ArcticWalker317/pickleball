import { afterEach, describe, expect, it, vi } from 'vitest';
import { COURT_LENGTH, COURT_WIDTH, FAR_KITCHEN_Y, NEAR_KITCHEN_Y, sideOf } from './court';
import { MockMatch, MockVisionSource, generateRally, seededRandom } from './mockVision';
import type { VisionEvent } from './types';

const inCourt = (p: { x: number; y: number }) =>
  p.x >= 0 && p.x <= COURT_WIDTH && p.y >= 0 && p.y <= COURT_LENGTH;

describe('generateRally', () => {
  const rallies = Array.from({ length: 300 }, (_, i) =>
    generateRally(seededRandom(i), i % 2 ? 'near' : 'far', i % 5),
  );

  it('is deterministic for a seed', () => {
    expect(generateRally(seededRandom(42), 'near', 0)).toEqual(
      generateRally(seededRandom(42), 'near', 0),
    );
  });

  it('emits events in time order, starting with the serve', () => {
    for (const r of rallies) {
      const ts = r.events.map((e) => e.t);
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
      const firstHit = r.events.find((e) => e.kind === 'hit');
      expect(firstHit).toMatchObject({ kind: 'hit', t: 0, player: r.server });
    }
  });

  it('lands serves that are not faults in the diagonal service court', () => {
    for (const r of rallies) {
      const serveBounce = r.events.find((e) => e.kind === 'bounce');
      if (!serveBounce || serveBounce.kind !== 'bounce' || !inCourt(serveBounce.court)) continue;
      const { x, y } = serveBounce.court;
      expect(sideOf(serveBounce.court)).not.toBe(r.server);
      if (r.server === 'near') expect(y).toBeGreaterThan(FAR_KITCHEN_Y);
      else expect(y).toBeLessThan(NEAR_KITCHEN_Y);
      const serve =
        r.events[0]?.kind === 'hit' ? r.events[0] : r.events.find((e) => e.kind === 'hit');
      if (serve?.kind === 'hit') expect(x < 10).toBe(serve.court.x > 10);
    }
  });

  it('ends consistently with the reported outcome', () => {
    const ends = new Set<string>();
    for (const r of rallies) {
      ends.add(r.end);
      const meaningful = r.events.filter((e) => e.kind !== 'ball' && e.kind !== 'players');
      const last = meaningful.at(-1);
      expect(last?.kind).toBe('lost');
      if (r.end === 'net')
        expect(meaningful.at(-2)).toMatchObject({ kind: 'net', side: r.lastHitter });
      if (r.end === 'out') {
        const b = meaningful.at(-2) as Extract<VisionEvent, { kind: 'bounce' }>;
        expect(b.kind).toBe('bounce');
        expect(inCourt(b.court)).toBe(false);
      }
      if (r.end === 'winner') {
        expect(meaningful.at(-2)?.kind).toBe('bounce');
        expect(meaningful.at(-3)?.kind).toBe('bounce');
      }
      expect(r.winner).toBe(
        r.end === 'winner' ? r.lastHitter : r.lastHitter === 'near' ? 'far' : 'near',
      );
    }
    expect(ends).toEqual(new Set(['out', 'net', 'winner']));
  });

  it('alternates hitters', () => {
    for (const r of rallies) {
      const hitters = r.events.flatMap((e) => (e.kind === 'hit' ? [e.player] : []));
      hitters.forEach((h, i) => i > 0 && expect(h).not.toBe(hitters[i - 1]));
    }
  });
});

describe('MockMatch', () => {
  it('passes the serve to the rally winner (singles side-out)', () => {
    const m = new MockMatch(7);
    let prev = m.nextRally();
    for (let i = 0; i < 50; i++) {
      const next = m.nextRally();
      expect(next.server).toBe(prev.winner);
      prev = next;
    }
  });
});

describe('MockVisionSource', () => {
  afterEach(() => vi.useRealTimers());

  it('plays a script in order and stops', () => {
    vi.useFakeTimers();
    const script: VisionEvent[] = [
      { kind: 'lost', t: 200 },
      { kind: 'net', t: 100, side: 'near', confidence: 1 },
    ];
    const src = new MockVisionSource({ script });
    const seen: VisionEvent[] = [];
    src.onEvent((e) => seen.push(e));
    src.start();
    vi.advanceTimersByTime(150);
    expect(seen.map((e) => e.kind)).toEqual(['net']);
    vi.advanceTimersByTime(100);
    expect(seen.map((e) => e.kind)).toEqual(['net', 'lost']);
  });

  it('generates the requested number of rallies', () => {
    vi.useFakeTimers();
    const src = new MockVisionSource({ seed: 3, rallies: 3, speed: 10 });
    let lost = 0;
    src.onEvent((e) => e.kind === 'lost' && lost++);
    src.start();
    vi.advanceTimersByTime(60_000);
    expect(lost).toBe(3);
  });
});
