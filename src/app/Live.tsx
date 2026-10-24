// Track B (game & app). Placeholder from the bootstrap PR: shows the raw vision event stream so the
// contract is visible end to end. Replace with score bar, ref speaker, override/undo (milestone 3).
import { useEffect, useState } from 'react';
import { MockVisionSource } from '../shared/mockVision';
import type { VisionEvent } from '../shared/types';

function describe(e: VisionEvent): string {
  const s = (e.t / 1000).toFixed(1).padStart(6);
  switch (e.kind) {
    case 'hit':
      return `${s}s  HIT     ${e.player}`;
    case 'bounce':
      return `${s}s  BOUNCE  (${e.court.x.toFixed(1)}, ${e.court.y.toFixed(1)}) ft`;
    case 'net':
      return `${s}s  NET     by ${e.side}`;
    case 'lost':
      return `${s}s  LOST`;
    default:
      return `${s}s  ${e.kind}`;
  }
}

export function Live({ params }: { params: URLSearchParams }) {
  const [log, setLog] = useState<string[]>([]);
  const seed = Number(params.get('seed') ?? 1);

  useEffect(() => {
    const source = new MockVisionSource({ seed });
    const off = source.onEvent((e) => {
      if (e.kind === 'ball' || e.kind === 'players') return;
      setLog((l) => [describe(e), ...l].slice(0, 40));
    });
    source.start();
    return () => {
      off();
      source.stop();
    };
  }, [seed]);

  return (
    <main className="screen">
      <h1>Live (mock)</h1>
      <pre style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>{log.join('\n')}</pre>
      <a className="button secondary" href="#/">
        End
      </a>
    </main>
  );
}
