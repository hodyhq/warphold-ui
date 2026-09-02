import React from "react";
import clsx from "clsx";
import { StripTone, toneBg } from "./tone";

export interface StripProps {
  /** One entry per day, oldest first (the prototype shows 30). */
  days: StripTone[];
  /** Strip height in px. */
  height?: number;
  className?: string;
}

export function Strip({ days, height = 14, className }: StripProps) {
  return (
    <div className={clsx("flex gap-[2px]", className)} style={{ height: `${height}px` }}>
      {days.map((day, i) => (
        // The cells are a fixed positional timeline - the index is the identity.
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <span key={i} className={clsx("grow rounded-[1px]", toneBg[day])} />
      ))}
    </div>
  );
}
