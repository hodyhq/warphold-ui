import React from "react";
import clsx from "clsx";

export interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
}

export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span className={clsx("font-mono text-[11px] tracking-[0.12em] text-muted uppercase", className)}>{children}</span>
  );
}
