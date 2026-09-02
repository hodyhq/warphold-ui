import React from "react";
import clsx from "clsx";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Rendered next to the box, inside the same label, so the text is clickable. */
  label?: React.ReactNode;
  labelClassName?: string;
}

export function Checkbox({ label, className, labelClassName, ...props }: CheckboxProps) {
  return (
    <label className={clsx("inline-flex cursor-pointer items-center gap-[8px] text-[13px]", labelClassName)}>
      <input
        type="checkbox"
        className={clsx(
          "h-[15px] w-[15px] shrink-0 cursor-pointer accent-ember",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      {label != null && <span>{label}</span>}
    </label>
  );
}
