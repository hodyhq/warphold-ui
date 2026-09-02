import React from "react";
import clsx from "clsx";
import { Eyebrow } from "./Eyebrow";
import { Tone, toneText } from "./tone";

export interface KpiProps {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  tone?: Tone | "ink";
  sub?: React.ReactNode;
  className?: string;
}

export function Kpi({ label, value, unit, tone = "ink", sub, className }: KpiProps) {
  return (
    <div className={clsx("flex flex-col", className)}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-2 flex items-baseline">
        <span className={clsx("font-display text-[28px] leading-none font-extrabold", toneText[tone])}>{value}</span>
        {unit != null ? <span className="ml-1 text-[14px] text-muted">{unit}</span> : null}
      </div>
      {sub != null ? <span className="mt-1 font-mono text-[12px] text-dim">{sub}</span> : null}
    </div>
  );
}
