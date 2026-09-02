/** Health tones shared by the status-carrying components. */
export type Tone = "good" | "warn" | "bad";

/** A day with no snapshot renders in the line color, not a health color. */
export type StripTone = Tone | "none";

export const toneBg: Record<StripTone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  none: "bg-line",
};

export const toneText: Record<Tone | "ink", string> = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  ink: "text-ink",
};

export const toneBorder: Record<Tone | "ink", string> = {
  good: "border-good",
  warn: "border-warn",
  bad: "border-bad",
  ink: "border-line-strong",
};
