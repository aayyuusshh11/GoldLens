/**
 * Chart series colors. Palette survives on the docs token set plus two
 * desaturated neutrals for the far leg / secondary lines so near and far
 * stay identifiable across every screen (SKILLS.md chart standards).
 */
export const SERIES_COLOR = {
  near: "#C7A45B", // gold — near expiry
  far: "#8BA4C4", // desaturated steel blue — far expiry
  spread: "#C7A45B",
  z: "#C7A45B",
  mean: "#8BA4C4",
  grid: "#2A313A",
  axis: "#9CA3AF",
  stale: "#E5B45B",
  zero: "#2A313A",
} as const;

export const THRESHOLD = {
  entry: "#C7A45B",
  stop: "#E16D72",
  exit: "#35B887",
} as const;
