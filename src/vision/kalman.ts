// Track A (vision) — owned by ArcticWalker317. See docs/PLAN.md.
//
// Constant-velocity Kalman filter for the ball in image space (normalized units, seconds). The two
// axes are independent, so it runs as two 2-state filters instead of one 4-state filter.

export class Kalman1D {
  /** position, velocity */
  x = 0;
  v = 0;
  /** covariance [[p00, p01], [p01, p11]] */
  private p00 = 1;
  private p01 = 0;
  private p11 = 1;

  constructor(
    position: number,
    /** Process noise: acceleration variance (units/s²)². The ball accelerates hard at hits. */
    private q: number,
    /** Measurement noise variance (units²). */
    private r: number,
  ) {
    this.x = position;
    this.p00 = r;
    this.p11 = 4; // velocity unknown at start: up to ~2 frame-widths per second
  }

  predict(dt: number) {
    this.x += this.v * dt;
    const { p00, p01, p11, q } = this;
    const dt2 = dt * dt;
    this.p00 = p00 + 2 * dt * p01 + dt2 * p11 + (q * dt2 * dt2) / 4;
    this.p01 = p01 + dt * p11 + (q * dt2 * dt) / 2;
    this.p11 = p11 + q * dt2;
  }

  update(z: number) {
    const s = this.p00 + this.r;
    const k0 = this.p00 / s;
    const k1 = this.p01 / s;
    const y = z - this.x;
    this.x += k0 * y;
    this.v += k1 * y;
    const { p00, p01, p11 } = this;
    this.p00 = (1 - k0) * p00;
    this.p01 = (1 - k0) * p01;
    this.p11 = p11 - k1 * p01;
  }

  /** Standard deviation of the predicted measurement (position uncertainty + sensor noise). */
  innovationStd(): number {
    return Math.sqrt(this.p00 + this.r);
  }
}

export class Kalman2D {
  private fx: Kalman1D;
  private fy: Kalman1D;

  constructor(x: number, y: number, { q = 50, r = 1e-5 }: { q?: number; r?: number } = {}) {
    this.fx = new Kalman1D(x, q, r);
    this.fy = new Kalman1D(y, q, r);
  }

  predict(dt: number) {
    this.fx.predict(dt);
    this.fy.predict(dt);
  }

  update(x: number, y: number) {
    this.fx.update(x);
    this.fy.update(y);
  }

  get position() {
    return { x: this.fx.x, y: this.fy.x };
  }

  get velocity() {
    return { x: this.fx.v, y: this.fy.v };
  }

  /** Radius (normalized units) within which the next measurement is expected, at `sigmas` std. */
  gate(sigmas = 4): number {
    return sigmas * Math.hypot(this.fx.innovationStd(), this.fy.innovationStd());
  }
}
