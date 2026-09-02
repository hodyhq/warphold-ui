import React from "react";
import clsx from "clsx";

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Diameter in px. */
  size?: number;
}

/**
 * Busy indicator. The single-user pages show one wherever a request is in
 * flight; the Fleet screens render nothing until data arrives, so this is only
 * used by the solo side.
 */
export function Spinner({ size = 16, className, style, ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx("inline-block animate-spin rounded-full border-2 border-line-strong border-t-ember", className)}
      style={{ width: `${size}px`, height: `${size}px`, ...style }}
      {...props}
    />
  );
}
