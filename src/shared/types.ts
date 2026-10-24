// THE CONTRACT between Track A (vision) and Track B (game & app).
//
// Vision produces a stream of VisionEvents; the game layer consumes them and never touches pixels.
// Changing anything in this file requires its own small PR approved by both owners (see CLAUDE.md).

/** A point in the video frame, NORMALIZED to [0, 1] so it is independent of resolution. */
export type Pt = { x: number; y: number };

/** A point on the court surface in feet. See src/shared/court.ts for the coordinate system. */
export type CourtPoint = { x: number; y: number };

/** Which half of the court, relative to the camera. */
export type Side = 'near' | 'far';

/** Result of the user tapping the four court corners. */
export type Calibration = {
  /** Image positions of the corners, in COURT_CORNERS order: near-left, near-right, far-right, far-left. */
  imageCorners: [Pt, Pt, Pt, Pt];
  /** Row-major 3x3 homography mapping normalized image points → court feet (ground plane only). */
  H: number[];
};

/**
 * Events emitted by a VisionSource. `t` is milliseconds since the source started.
 *
 * Only `bounce` carries a court position for the ball: a bounce is on the ground plane, so the
 * homography gives its true court location. An airborne ball cannot be placed on the court from a
 * single camera, so `ball` events carry image coordinates only (useful for overlays/debugging).
 */
export type VisionEvent =
  /** Ball seen in a frame. Emitted at frame rate while tracked. */
  | { kind: 'ball'; t: number; img: Pt; confidence: number }
  /** Ball touched the ground at `court`. Line calls are made from these. */
  | { kind: 'bounce'; t: number; court: CourtPoint; confidence: number }
  /** A player struck the ball. `court` is where that player was standing. */
  | { kind: 'hit'; t: number; player: Side; court: CourtPoint; confidence: number }
  /** The ball struck by `side` failed to cross the net. */
  | { kind: 'net'; t: number; side: Side; confidence: number }
  /** Player positions (feet midpoint). Emitted at ~10 Hz. Missing = not currently detected. */
  | { kind: 'players'; t: number; near?: CourtPoint; far?: CourtPoint }
  /** Ball dropped out of tracking (dead ball, off-frame, or tracker failure). */
  | { kind: 'lost'; t: number };

export type VisionEventKind = VisionEvent['kind'];

/** Anything that produces vision events: live camera, a video file, or the mock. */
export interface VisionSource {
  start(): void;
  stop(): void;
  /** Subscribe to events. Returns an unsubscribe function. */
  onEvent(cb: (e: VisionEvent) => void): () => void;
}
