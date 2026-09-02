import type { StripTone, Tone } from "../../design/components";
import type { Health } from "../../api/types";

/** The bar and the strip carry the health color; unknown reads as "no data". */
export const HEALTH_TONE: Record<Health, StripTone> = {
  green: "good",
  yellow: "warn",
  red: "bad",
  unknown: "none",
  revoked: "none",
};

export const HEALTH_TEXT: Record<Health, Tone | "ink"> = {
  green: "good",
  yellow: "warn",
  red: "bad",
  unknown: "ink",
  revoked: "ink",
};
