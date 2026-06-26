"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateFilterPopover } from "@/components/date-filter-popover";
import { TimeFilterPopover } from "@/components/time-filter-popover";

export interface FilterCol {
  key: string;
  width?: number;   // inquiry uses "width"
  w?: number;       // pending / PO use "w"
  filterType?: "text" | "select" | "date" | "time";
  filterOptions?: { value: string; label: string }[];
}

interface PrefixCell {
  width: number;
  sticky?: boolean;
  stickyBg?: string;
}

interface FilterRowProps {
  cols: FilterCol[];
  values: Record<string, string>;
  onField: (key: string, val: string) => void;
  prefixCells?: PrefixCell[];
  suffixCells?: { width: number }[];
  /** runtime options for columns whose options aren't known at build time (e.g. users list) */
  optionsMap?: Record<string, { value: string; label: string }[]>;
}

export function FilterRow({
  cols, values, onField,
  prefixCells = [],
  suffixCells = [],
  optionsMap = {},
}: FilterRowProps) {
  return (
    <tr className="bg-background border-b border-t border-muted/60">
      {prefixCells.map((cell, i) => (
        <th
          key={`pre-${i}`}
          style={{ width: cell.width, minWidth: cell.width }}
          className={cn(
            "px-1 py-0.5",
            cell.sticky && cn("sticky left-0 z-30", cell.stickyBg ?? "bg-background"),
          )}
        />
      ))}

      {cols.map(col => {
        const w = col.width ?? col.w ?? 100;
        const val = values[col.key] ?? "";
        const options = col.filterOptions ?? optionsMap[col.key] ?? [];
        const hasFilter = !!col.filterType;

        if (!hasFilter) {
          return (
            <th
              key={col.key}
              style={{ width: w, minWidth: w }}
              className="px-1 py-0.5"
            />
          );
        }

        if (col.filterType === "select") {
          return (
            <th
              key={col.key}
              style={{ width: w, minWidth: w }}
              className="px-1 py-0.5 font-normal"
            >
              <select
                className={cn(
                  "w-full h-6 rounded border px-1 text-[10px] bg-background cursor-pointer",
                  val ? "border-primary text-primary" : "border-border text-muted-foreground",
                )}
                value={val}
                onChange={e => onField(col.key, e.target.value)}
              >
                <option value="">All</option>
                {options.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </th>
          );
        }

        // time — hour/minute/both popover
        if (col.filterType === "time") {
          return (
            <th
              key={col.key}
              style={{ width: w, minWidth: w }}
              className="px-1 py-0.5 font-normal"
            >
              <TimeFilterPopover value={val} onChange={v => onField(col.key, v)} />
            </th>
          );
        }

        // date — rich popover
        if (col.filterType === "date") {
          return (
            <th
              key={col.key}
              style={{ width: w, minWidth: w }}
              className="px-1 py-0.5 font-normal"
            >
              <DateFilterPopover value={val} onChange={v => onField(col.key, v)} />
            </th>
          );
        }

        // text
        return (
          <th
            key={col.key}
            style={{ width: w, minWidth: w }}
            className="px-1 py-0.5 font-normal"
          >
            <div className="relative">
              <input
                type="text"
                value={val}
                onChange={e => onField(col.key, e.target.value)}
                placeholder="…"
                className={cn(
                  "w-full h-6 rounded border px-1.5 text-[10px] bg-background outline-none",
                  "focus:ring-1 ring-primary/40 transition-shadow",
                  val ? "border-primary pr-4" : "border-border text-muted-foreground",
                )}
              />
              {val && (
                <button
                  type="button"
                  onClick={() => onField(col.key, "")}
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X size={9} />
                </button>
              )}
            </div>
          </th>
        );
      })}

      {suffixCells.map((cell, i) => (
        <th
          key={`suf-${i}`}
          style={{ width: cell.width, minWidth: cell.width }}
          className="px-1 py-0.5"
        />
      ))}
    </tr>
  );
}
