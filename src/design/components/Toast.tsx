import React from "react";
import clsx from "clsx";
import { Tone, toneBorder, toneText } from "./tone";

export interface ToastProps {
  message: React.ReactNode;
  tone?: Tone | "ink";
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. */
  duration?: number;
  className?: string;
}

export function Toast({ message, tone = "ink", onDismiss, duration = 5000, className }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div
      role="status"
      className={clsx(
        "fixed right-6 bottom-6 z-50 max-w-[420px] border bg-panel px-[18px] py-[14px] text-ink",
        toneBorder[tone],
        className,
      )}
    >
      <span className={clsx(tone === "ink" ? "text-ink" : toneText[tone])}>{message}</span>
    </div>
  );
}
