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
    <nav
      className={clsx(
        // Below md the shell hands the nav its own row: it scrolls sideways
        // rather than wrapping or running off the side of the screen.
        "flex snap-x gap-[22px] overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const on = item.to === current;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={on ? "page" : undefined}
            className={clsx(
              "shrink-0 snap-start border-b-2 pb-1 text-[12px] font-medium tracking-[0.04em] whitespace-nowrap uppercase",
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
