// Track A (vision) — owned by ArcticWalker317. See docs/PLAN.md.
// Remembers the last calibration on this device so a phone left on the same mount can skip setup.
import type { Calibration } from '../shared/types';

const KEY = 'pb.calibration.v1';

export function saveCalibration(cal: Calibration): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cal));
  } catch {
    // Private mode / storage disabled: calibration just won't persist.
  }
}

export function loadCalibration(): Calibration | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const cal = JSON.parse(raw) as Calibration;
    return Array.isArray(cal.H) && cal.H.length === 9 && cal.imageCorners?.length === 4
      ? cal
      : undefined;
  } catch {
    return undefined;
  }
}
