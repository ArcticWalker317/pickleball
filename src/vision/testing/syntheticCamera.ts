// Track A (vision) — test helpers only. A pinhole camera + ball physics so detection, tracking and
// bounce logic can be checked against ground truth before we have real footage.
//
// World coordinates: court feet (see src/shared/court.ts) plus z = feet above the court.

import type { Pt } from '../../shared/types';

export type Vec3 = { x: number; y: number; z: number };

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

export type Camera = {
  width: number;
  height: number;
  /** Projects a world point to normalized image coordinates. */
  project(p: Vec3): Pt;
  /** Inverse of `project` for points on the court surface (z = 0) — the ground truth homography. */
  toGround(img: Pt): Vec3;
};

/**
 * Default: phone on a fence 15 ft up, 12 ft behind the near baseline, centered, looking at the
 * court — the placement the app recommends.
 */
export function makeCamera({
  position = { x: 10, y: -12, z: 15 },
  target = { x: 10, y: 20, z: 0 },
  width = 1280,
  height = 720,
  focalPx = 900,
}: {
  position?: Vec3;
  target?: Vec3;
  width?: number;
  height?: number;
  focalPx?: number;
} = {}): Camera {
  const f = norm(sub(target, position));
  const r = norm(cross(f, { x: 0, y: 0, z: 1 }));
  const u = cross(r, f);
  return {
    width,
    height,
    project(p) {
      const d = sub(p, position);
      const zc = dot(d, f);
      return {
        x: 0.5 + (focalPx * dot(d, r)) / zc / width,
        y: 0.5 - (focalPx * dot(d, u)) / zc / height,
      };
    },
    toGround(img) {
      const a = ((img.x - 0.5) * width) / focalPx;
      const b = (-(img.y - 0.5) * height) / focalPx;
      const ray = {
        x: f.x + a * r.x + b * u.x,
        y: f.y + a * r.y + b * u.y,
        z: f.z + a * r.z + b * u.z,
      };
      const s = -position.z / ray.z;
      return { x: position.x + s * ray.x, y: position.y + s * ray.y, z: 0 };
    },
  };
}

export const GRAVITY_FT_S2 = 32.2;

export type BallSample = { t: number; pos: Vec3 };

/** A true bounce, with the downward speed (ft/s) the ball hit the court at. */
export type Bounce3D = BallSample & { impactVz: number };

/** Rebound speed (ft/s) below which the simulated ball stops bouncing and rolls. */
const MIN_BOUNCE_VZ = 4;

/**
 * Simulates a ball in flight with gravity and bounces (restitution on vz, friction on the
 * horizontal speed). Returns samples every 1000/fps ms plus the true bounce events.
 */
export function simulateBall({
  start,
  velocity,
  durationMs,
  fps = 30,
  restitution = 0.6,
  friction = 0.8,
  t0 = 0,
}: {
  start: Vec3;
  /** ft/s */
  velocity: Vec3;
  durationMs: number;
  fps?: number;
  restitution?: number;
  friction?: number;
  t0?: number;
}): { samples: BallSample[]; bounces: Bounce3D[] } {
  const samples: BallSample[] = [];
  const bounces: Bounce3D[] = [];
  const dt = 1 / 2000; // integrate finely, sample at fps
  const frameDt = 1000 / fps;
  let p = { ...start };
  let v = { ...velocity };
  let nextFrame = 0;
  let rolling = false;
  for (let ms = 0; ms <= durationMs; ms += dt * 1000) {
    if (ms >= nextFrame) {
      samples.push({ t: t0 + ms, pos: { ...p } });
      nextFrame += frameDt;
    }
    p = { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt };
    if (rolling) continue;
    v.z -= GRAVITY_FT_S2 * dt;
    if (p.z <= 0 && v.z < 0) {
      p.z = 0;
      bounces.push({ t: t0 + ms, pos: { ...p }, impactVz: -v.z });
      v = { x: v.x * friction, y: v.y * friction, z: -v.z * restitution };
      // Too little bounce left to see: the ball just rolls from here.
      if (v.z < MIN_BOUNCE_VZ) [rolling, v.z] = [true, 0];
    }
  }
  return { samples, bounces };
}

/** Deterministic Gaussian noise (Box–Muller over a seeded uniform source). */
export function gaussian(rand: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());
}

/** An RGBA frame the size of the camera, filled with noisy court green. */
export function courtFrame(width: number, height: number, rand: () => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const n = (rand() - 0.5) * 16;
    data[i] = 40 + n;
    data[i + 1] = 110 + n;
    data[i + 2] = 80 + n;
    data[i + 3] = 255;
  }
  return data;
}

/** Paints a filled disc (e.g. a ball) into an RGBA frame. */
export function paintDisc(
  data: Uint8ClampedArray,
  width: number,
  cx: number,
  cy: number,
  radius: number,
  rgb: [number, number, number],
) {
  const height = data.length / 4 / width;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, cy + radius); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
      const i = (y * width + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
    }
  }
}
