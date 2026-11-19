/** Camera tuning values. */

export const CAMERA = {
  /** Vertical field of view, in degrees. */
  fov: 40,
  /** Initial horizontal rotation around the target, in degrees. */
  azimuthDeg: 45,
  /** Initial elevation above the ground plane, in degrees. */
  elevationDeg: 45,
  /** Elevation limits while orbiting, in degrees. */
  minElevationDeg: 20,
  maxElevationDeg: 85,
  /** Rotation per dragged screen pixel, in degrees. */
  rotateSpeedDeg: 0.3,
  /** Keyboard rotation speed, in degrees per second. */
  keyRotateSpeedDeg: 90,
  /** Distance from the camera to its target (zoom). */
  initialDistance: 24,
  /** Close enough to see people (≈0.5 tile tall) and chickens. */
  minDistance: 3.5,
  maxDistance: 95,
  /** The camera starts over the house, this many tiles toward the fields north of it. */
  startNorthOffset: 2,
  /** Zoom used when the camera is sent to a spot (e.g. the dev attack preview). */
  focusDistance: 6,
  /** Tilt of the top view used while building (a floor plan). */
  blueprintElevationDeg: 80,
  /** Zoom when arriving in town. */
  townDistance: 22,
  zoomSensitivity: 0.0015,
  /** Smoothing rate for camera motion (higher = snappier). */
  damping: 12,
  /** Distance from the screen edge (px) that triggers edge panning. */
  edgePanMargin: 14,
  /** Edge pan speed in screen pixels per second. */
  edgePanSpeed: 700,
  /** Fog starts this far beyond the target and fades fully over `fogRange`. */
  fogStartOffset: 25,
  fogRange: 70,
} as const;
