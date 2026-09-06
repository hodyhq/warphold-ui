import React from "react";
import clsx from "clsx";
import { Tone, toneBorder, toneText } from "./tone";

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone | "ink";
}

export function Pill({ tone = "ink", className, ...props }: PillProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-pill border px-[10px] py-[4px] text-[12px] font-semibold",
        toneBorder[tone],
        toneText[tone],
        className,
      )}
      {...props}
    />
  );
}
