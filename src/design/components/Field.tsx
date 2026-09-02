import React from "react";
import clsx from "clsx";
import { Eyebrow } from "./Eyebrow";

export interface FieldProps {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, children, className }: FieldProps) {
  return (
    <label className={clsx("flex flex-col gap-[6px]", className)}>
      <Eyebrow>{label}</Eyebrow>
      {children}
    </label>
  );
}
