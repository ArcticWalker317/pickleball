// Track A (vision) — owned by ArcticWalker317. See docs/PLAN.md.
// Drawn exactly over the visible video picture. Tap to place corners, drag to fine-tune; once all
// four are placed, every court line is projected back onto the image so the user can check the fit.
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { COURT_LINES } from '../shared/court';
import type { Pt } from '../shared/types';
import { courtToImage, isPlausibleQuad, makeCalibration } from './homography';

type Rect = { left: number; top: number; width: number; height: number };

/** The on-screen box the video picture occupies under `object-fit: contain`. */
function useVideoContentRect(videoRef: RefObject<HTMLVideoElement | null>): Rect | undefined {
  const [rect, setRect] = useState<Rect>();
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      const { clientWidth: cw, clientHeight: ch, videoWidth: vw, videoHeight: vh } = video;
      if (!vw || !vh) return;
      const scale = Math.min(cw / vw, ch / vh);
      const width = vw * scale;
      const height = vh * scale;
      setRect({ left: (cw - width) / 2, top: (ch - height) / 2, width, height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(video);
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      video.removeEventListener('loadedmetadata', update);
      video.removeEventListener('resize', update);
    };
  }, [videoRef]);
  return rect;
}

export function CalibrationOverlay({
  videoRef,
  corners,
  onChange,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  corners: Pt[];
  onChange: (corners: Pt[]) => void;
}) {
  const rect = useVideoContentRect(videoRef);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<number>();

  if (!rect) return null;
  const { width: w, height: h } = rect;

  const toNorm = (e: PointerEvent): Pt => {
    const box = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    };
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const p = toNorm(e);
    // Grab the nearest existing corner if the touch is close to it (fingers are imprecise).
    const near = corners.findIndex((c) => Math.hypot((c.x - p.x) * w, (c.y - p.y) * h) < 36);
    if (near >= 0) {
      setDragging(near);
      svgRef.current!.setPointerCapture(e.pointerId);
    } else if (corners.length < 4) {
      onChange([...corners, p]);
    }
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragging === undefined) return;
    const next = [...corners];
    next[dragging] = toNorm(e);
    onChange(next);
  };

  const quad = corners.length === 4 ? (corners as [Pt, Pt, Pt, Pt]) : undefined;
  const plausible = quad && isPlausibleQuad(quad);
  const cal = plausible ? makeCalibration(quad) : undefined;
  const px = (p: Pt) => `${p.x * w},${p.y * h}`;

  return (
    <svg
      ref={svgRef}
      className="calibration-overlay"
      style={{ left: rect.left, top: rect.top, width: w, height: h }}
      viewBox={`0 0 ${w} ${h}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDragging(undefined)}
      onPointerCancel={() => setDragging(undefined)}
    >
      {cal &&
        COURT_LINES.map((line) => {
          const a = courtToImage(cal, line.a);
          const b = courtToImage(cal, line.b);
          return (
            <line
              key={line.name}
              x1={a.x * w}
              y1={a.y * h}
              x2={b.x * w}
              y2={b.y * h}
              className={line.name === 'net' ? 'cal-net' : 'cal-line'}
            />
          );
        })}
      {corners.length > 1 && !cal && (
        <polyline
          points={[...corners, ...(quad ? [corners[0]!] : [])].map(px).join(' ')}
          className="cal-bad"
        />
      )}
      {corners.map((c, i) => (
        <g key={i} transform={`translate(${c.x * w} ${c.y * h})`}>
          <circle r={18} className="cal-handle-ring" />
          <circle r={3} className="cal-handle-dot" />
          <text y={-24} className="cal-label">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}
