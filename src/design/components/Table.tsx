import React from "react";
import clsx from "clsx";

export interface TableColumn {
  key: string;
  label?: React.ReactNode;
}

export interface TableRow {
  key: string;
  cells: React.ReactNode[];
}

export interface TableProps {
  columns: TableColumn[];
  rows: TableRow[];
  /** CSS grid-template-columns string, e.g. "8px 1.3fr 0.8fr 2fr". */
  template: string;
  onRowClick?: (key: string) => void;
  className?: string;
}

export function Table({ columns, rows, template, onRowClick, className }: TableProps) {
  const clickable = Boolean(onRowClick);
  return (
    <div className={className}>
      <div
        className="grid items-center gap-4 border-b border-line-strong py-[13px] font-mono text-[11px] tracking-[0.12em] text-muted uppercase"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((c) => (
          <span key={c.key}>{c.label}</span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          data-row={row.key}
          className={clsx(
            "grid items-center gap-4 border-b border-line py-[13px]",
            clickable && "cursor-pointer hover:bg-panel",
          )}
          style={{ gridTemplateColumns: template }}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onClick={clickable ? () => onRowClick?.(row.key) : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onRowClick?.(row.key);
                  }
                }
              : undefined
          }
        >
          {columns.map((column, i) => (
            <div key={column.key} className="min-w-0">
              {row.cells[i]}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
