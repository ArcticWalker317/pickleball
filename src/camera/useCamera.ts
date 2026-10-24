// Track A (vision) — owned by ArcticWalker317. See docs/PLAN.md.
// Rear-camera stream as a React hook. Asks for 60 fps (fast balls need every frame) and falls back
// to whatever the device offers.
import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'starting' | 'live' | 'error';

export type CameraInfo = { width: number; height: number; frameRate: number };

const PREFERRED: MediaTrackConstraints = {
  facingMode: { ideal: 'environment' },
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 60 },
};

/** Turns getUserMedia failures into something a player standing on a court can act on. */
export function cameraErrorMessage(err: unknown, secure = true): string {
  if (!secure) return 'The camera only works over HTTPS. Open the deployed app link instead.';
  const name = err instanceof Error || err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. On iPhone: Settings → Safari → Camera → Allow, then reload.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No usable rear camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is busy in another app. Close it and try again.';
    default:
      return `Could not start the camera${err instanceof Error && err.message ? `: ${err.message}` : '.'}`;
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string>();
  const [info, setInfo] = useState<CameraInfo>();

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
  }, []);

  /** Call from a tap handler: iOS only allows camera + playback after a user gesture. */
  const start = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(cameraErrorMessage(null, false));
      setStatus('error');
      return;
    }
    setStatus('starting');
    setError(undefined);
    try {
      const stream = await navigator.mediaDevices
        .getUserMedia({ video: PREFERRED, audio: false })
        .catch((err: unknown) => {
          // Only retry when the device can't meet our wishes — not when permission was denied.
          if (err instanceof Error && err.name === 'OverconstrainedError') {
            return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
          throw err;
        });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const s = stream.getVideoTracks()[0]?.getSettings() ?? {};
      setInfo({
        width: s.width ?? 0,
        height: s.height ?? 0,
        frameRate: Math.round(s.frameRate ?? 0),
      });
      setStatus('live');
    } catch (err) {
      setError(cameraErrorMessage(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, status, error, info, start, stop };
}
