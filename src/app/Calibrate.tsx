// Track A (vision). Camera setup: live preview + wake lock. Corner tapping comes next (issue #3).
import { useCamera } from '../camera/useCamera';
import { useWakeLock } from '../camera/wakeLock';
import '../camera/camera.css';

export function Calibrate() {
  const { videoRef, status, error, info, start } = useCamera();
  const awake = useWakeLock(status === 'live');

  return (
    <main className="camera-screen">
      <video ref={videoRef} className="camera-video" playsInline muted autoPlay />

      <section className="camera-panel">
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

        {status === 'live' && info && (
          <p className="camera-info">
            {info.width}×{info.height} · {info.frameRate || '?'} fps · screen{' '}
            {awake ? 'stays on' : 'may sleep'}
          </p>
        )}

        {status === 'live' ? (
          <a className="button" href="#/live?source=mock">
            Continue (court marking coming soon)
          </a>
        ) : (
          <button className="button" onClick={start} disabled={status === 'starting'}>
            {status === 'starting' ? 'Starting…' : 'Start camera'}
          </button>
        )}
        <a className="button secondary" href="#/">
          Back
        </a>
      </section>
    </main>
  );
}
