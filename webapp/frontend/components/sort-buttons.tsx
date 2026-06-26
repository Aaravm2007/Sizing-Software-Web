"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SortState { key: string; dir: "asc" | "desc" }

interface Props {
  colKey: string;
  sort: SortState | null;
  onSort: (s: SortState | null) => void;
}

export function SortButtons({ colKey, sort, onSort }: Props) {
  const isAsc  = sort?.key === colKey && sort.dir === "asc";
  const isDesc = sort?.key === colKey && sort.dir === "desc";

  return (
    <span className="inline-flex flex-col shrink-0 ml-0.5 -my-0.5">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onSort(isAsc  ? null : { key: colKey, dir: "asc"  }); }}
        className={cn("leading-none transition-colors hover:text-primary", isAsc  ? "text-primary" : "text-muted-foreground/40")}
      >
        <ChevronUp size={10} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onSort(isDesc ? null : { key: colKey, dir: "desc" }); }}
        className={cn("leading-none transition-colors hover:text-primary", isDesc ? "text-primary" : "text-muted-foreground/40")}
      >
        <ChevronDown size={10} strokeWidth={2.5} />
      </button>
    </span>
  );
}
