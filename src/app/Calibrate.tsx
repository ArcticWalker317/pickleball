// Track A (vision). Camera setup: live preview + wake lock, then tap the four court corners.
import { useState } from 'react';
import { useCamera } from '../camera/useCamera';
import { useWakeLock } from '../camera/wakeLock';
import { navigate } from './router';
import type { Pt } from '../shared/types';
import { CalibrationOverlay } from '../vision/CalibrationOverlay';
import { saveCalibration } from '../vision/calibrationStore';
import { isPlausibleQuad, makeCalibration } from '../vision/homography';
import '../camera/camera.css';

const CORNER_PROMPTS = [
  'Tap the NEAR-LEFT corner — the one closest to the camera, on the left.',
  'Tap the NEAR-RIGHT corner.',
  'Tap the FAR-RIGHT corner, across the net.',
  'Tap the FAR-LEFT corner.',
];

export function Calibrate() {
  const { videoRef, status, error, info, start } = useCamera();
  const awake = useWakeLock(status === 'live');
  const [corners, setCorners] = useState<Pt[]>([]);

  const quad = corners.length === 4 ? (corners as [Pt, Pt, Pt, Pt]) : undefined;
  const plausible = quad ? isPlausibleQuad(quad) : false;

  const confirm = () => {
    if (!quad || !plausible) return;
    saveCalibration(makeCalibration(quad));
    navigate('/live?source=mock'); // switches to the camera source at integration (#12)
  };

  return (
    <main className="camera-screen">
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay />
      {status === 'live' && (
        <CalibrationOverlay videoRef={videoRef} corners={corners} onChange={setCorners} />
      )}

      <section className={status === 'live' ? 'camera-panel top' : 'camera-panel'}>
        {status !== 'live' && (
          <>
            <h1>Set up the camera</h1>
            <p>
              Mount your phone high behind a baseline or in a corner so the <b>whole court</b> is in
              view. Landscape works best.
            </p>
          </>
        )}

        {error && <p className="camera-error">{error}</p>}

        {status === 'live' && (
          <p className="camera-prompt">
            {!quad
              ? CORNER_PROMPTS[corners.length]
              : plausible
                ? 'Drag the dots until the yellow lines sit on the painted lines.'
                : 'Those corners cross over. Drag them into order, or start over.'}
          </p>
        )}

        {status === 'live' && info && (
          <p className="camera-info">
            {info.width}×{info.height} · {info.frameRate || '?'} fps · screen{' '}
            {awake ? 'stays on' : 'may sleep'}
          </p>
        )}

        {status !== 'live' ? (
          <button className="button" onClick={start} disabled={status === 'starting'}>
            {status === 'starting' ? 'Starting…' : 'Start camera'}
          </button>
        ) : (
          <div className="camera-actions">
            <button
              className="button secondary"
              onClick={() => setCorners([])}
              disabled={!corners.length}
            >
              Start over
            </button>
            <button className="button" onClick={confirm} disabled={!plausible}>
              Looks right
            </button>
          </div>
        )}
        {status !== 'live' && (
          <a className="button secondary" href="#/">
            Back
          </a>
        )}
      </section>
    </main>
  );
}
