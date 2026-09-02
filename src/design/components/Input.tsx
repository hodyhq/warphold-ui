import React from "react";
import clsx from "clsx";

export const inputClass =
  "rounded-sm border border-line-strong bg-ground px-[12px] py-[10px] text-ink " +
  "placeholder:text-dim focus:border-ember focus:outline-none disabled:opacity-50";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, ...props }: InputProps) {
  return <input className={clsx(inputClass, className)} {...props} />;
}
