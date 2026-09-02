import React from "react";
import clsx from "clsx";
import { Tone, toneBorder, toneText } from "./tone";

export interface PillProps {
  tone?: Tone | "ink";
  children: React.ReactNode;
  className?: string;
}

export function Pill({ tone = "ink", children, className }: PillProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-pill border px-[10px] py-[4px] text-[12px] font-semibold",
        toneBorder[tone],
        toneText[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
