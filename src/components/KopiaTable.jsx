import React, { use, useState } from "react";
import clsx from "clsx";
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
} from "@tanstack/react-table";
import { PAGE_SIZES, UIPreferencesContext } from "../contexts/UIPreferencesContext";
import { Eyebrow, Select } from "../design/components";
import PropTypes from "prop-types";

// A real <table> rather than the design system's grid-based Table: the
// upstream e2e suite reads snapshot sizes out of `table > tbody > tr > td`,
// and sortable headers and pagination are cheaper on table semantics anyway.

const pageButton =
  "cursor-pointer rounded-sm border border-line-strong bg-transparent px-[8px] py-[3px] text-[12px] " +
  "text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";

function PageButton({ active, ...props }) {
  return <button type="button" className={clsx(pageButton, active && "border-ember text-ember")} {...props} />;
}

PageButton.propTypes = {
  active: PropTypes.bool,
};

/** What clicking a sortable header will do next, for its title and label. */
function sortHint(column) {
  switch (column.getNextSortingOrder()) {
    case "asc":
      return "Sort ascending";
    case "desc":
      return "Sort descending";
    default:
      return "Clear sort";
  }
}

function paginationItems(count, active, gotoPage) {
  let items = [];

  function pageWithNumber(number) {
    return (
      <PageButton
        key={number}
        active={number === active}
        aria-current={number === active ? "page" : undefined}
        onClick={() => gotoPage(number - 1)}
      >
        {number}
      </PageButton>
    );
  }

  function dotDotDot(key) {
    return (
      <span key={key} className="px-1 text-dim">
        …
      </span>
    );
  }

  let minPageNumber = active - 10;
  if (minPageNumber < 1) {
    minPageNumber = 1;
  }

  let maxPageNumber = active + 9;
  if (minPageNumber + 19 >= maxPageNumber) {
    maxPageNumber = minPageNumber + 19;
  }
  if (maxPageNumber > count) {
    maxPageNumber = count;
  }

  if (minPageNumber > 1) {
    items.push(dotDotDot("ellipsis-start"));
  }

  for (let number = minPageNumber; number <= maxPageNumber; number++) {
    items.push(pageWithNumber(number));
  }

  if (maxPageNumber < count) {
    items.push(dotDotDot("ellipsis-end"));
  }

  return items;
}

export default function KopiaTable({ columns, data }) {
  const { pageSize, setPageSize } = use(UIPreferencesContext);
  const [sorting, setSorting] = useState([]);
  const [pagination, setPagination] = useState({
    pageIndex: 0, //default page index
    pageSize: pageSize, //default page size
  });

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination,
    },
    autoResetPageIndex: false,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(), //load client-side pagination code
    getSortedRowModel: getSortedRowModel(),
    onPaginationChange: setPagination, //update the pagination state when internal APIs mutate the pagination state
    onSortingChange: setSorting,
  });

  if (pagination.pageIndex >= table.getPageCount() && pagination.pageIndex !== 0) {
    table.resetPageIndex();
  }

  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b border-line-strong">
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-2 py-[10px] text-left align-middle font-normal">
                    {(() => {
                      const label = (
                        <Eyebrow>
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                          {{
                            asc: " ▲",
                            desc: " ▼",
                          }[header.column.getIsSorted()] ?? null}
                        </Eyebrow>
                      );
                      // A sortable header is a real button so it can be reached
                      // and fired from the keyboard, not just clicked.
                      return header.column.getCanSort() ? (
                        <button
                          type="button"
                          className="cursor-pointer border-0 bg-transparent p-0 text-left select-none"
                          onClick={header.column.getToggleSortingHandler()}
                          title={sortHint(header.column)}
                        >
                          {label}
                        </button>
                      ) : (
                        label
                      );
                    })()}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b border-line hover:bg-panel">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-2 py-[10px] align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {table.getPageCount() > 1 && (
          <nav aria-label="Pagination" className="flex flex-wrap items-center gap-1">
            <PageButton
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="First page"
            >
              «
            </PageButton>
            <PageButton
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              ‹
            </PageButton>
            {paginationItems(table.getPageCount(), pagination.pageIndex + 1, table.setPageIndex)}
            <PageButton onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              ›
            </PageButton>
            <PageButton
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Last page"
            >
              »
            </PageButton>
          </nav>
        )}
        <div className="grow" />
        <label className="flex items-center gap-2">
          <Eyebrow>Page size</Eyebrow>
          <Select
            className="py-[4px] text-[12px]"
            value={pageSize}
            onChange={(e) => {
              const size = Number.parseInt(e.target.value, 10);
              table.setPageSize(size);
              setPageSize(size);
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </label>
      </div>
    </div>
  );
}

KopiaTable.propTypes = {
  columns: PropTypes.array.isRequired,
  data: PropTypes.array.isRequired,
};
