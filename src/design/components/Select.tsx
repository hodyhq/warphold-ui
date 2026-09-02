import React from "react";
import clsx from "clsx";
import { inputClass } from "./Input";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  ref?: React.Ref<HTMLSelectElement>;
}

export function Select({ className, ...props }: SelectProps) {
  return <select className={clsx(inputClass, "cursor-pointer", className)} {...props} />;
}
