import React from "react";
import clsx from "clsx";

export type ButtonVariant = "primary" | "default" | "danger" | "ghost";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

// `.btn` from the prototype. Danger uses the prototype's one-off red pair,
// which is deliberately not a token (it appears on this control only).
const variants: Record<ButtonVariant, string> = {
  primary: "bg-ember border-ember text-ground hover:bg-ember-soft hover:border-ember-soft",
  default: "bg-transparent border-line-strong text-ink hover:border-ink-soft",
  danger: "danger bg-transparent border-[#7A3030] text-[#FF8A8A] hover:border-bad",
  ghost: "bg-transparent border-transparent text-muted hover:text-ink",
};

export function Button({ variant = "default", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "cursor-pointer rounded-sm border px-[14px] py-[9px] text-[12px] font-semibold tracking-[0.06em] uppercase",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
