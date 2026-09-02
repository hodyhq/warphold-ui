import React from "react";
import clsx from "clsx";

// The border swap alone is too thin to satisfy WCAG 2.4.7, so keyboard focus
// also draws a full ember ring; Select shares this class, so both controls get
// the same indicator.
export const inputClass =
  "rounded-sm border border-line-strong bg-ground px-[12px] py-[10px] text-ink " +
  "placeholder:text-dim focus:border-ember focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-ember focus-visible:ring-offset-0 disabled:opacity-50";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, ...props }: InputProps) {
  return <input className={clsx(inputClass, className)} {...props} />;
}
