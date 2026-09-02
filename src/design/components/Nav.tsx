import React from "react";
import clsx from "clsx";
import { Link } from "react-router";

export interface NavItem {
  to: string;
  label: React.ReactNode;
}

export interface NavProps {
  items: NavItem[];
  /** Path of the active item. */
  current: string;
  className?: string;
}

export function Nav({ items, current, className }: NavProps) {
  return (
    <nav className={clsx("flex gap-[22px]", className)}>
      {items.map((item) => {
        const on = item.to === current;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={on ? "page" : undefined}
            className={clsx(
              "border-b-2 pb-1 text-[12px] font-medium tracking-[0.04em] uppercase",
              on ? "border-ember text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
