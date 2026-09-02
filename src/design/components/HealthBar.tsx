import React from "react";
import clsx from "clsx";
import { StripTone, toneBg } from "./tone";

export interface HealthBarProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StripTone;
  /** Bar height in px; the prototype's `.bar` is 8x28. */
  height?: number;
}

export function HealthBar({ tone, height = 28, className, style, ...props }: HealthBarProps) {
  return (
    <span
      className={clsx("inline-block w-[8px] shrink-0 rounded-[1px]", toneBg[tone], className)}
      style={{ height: `${height}px`, ...style }}
      {...props}
    />
  );
}
