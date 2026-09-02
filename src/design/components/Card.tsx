import React from "react";
import clsx from "clsx";

export type CardTone = "default" | "bad" | "warn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  children: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}

const tones: Record<CardTone, string> = {
  default: "bg-panel border-line",
  bad: "bg-bad-panel border-line border-l-[3px] border-l-bad",
  warn: "bg-warn-panel border-line border-l-[3px] border-l-warn",
};

export function Card({ tone = "default", className, children, ...props }: CardProps) {
  return (
    <div className={clsx("flex flex-col gap-3 border px-[22px] py-[20px]", tones[tone], className)} {...props}>
      {children}
    </div>
  );
}
