"use client";

import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GLOBAL_KEY } from "@/lib/use-table-filter";
import type { FilterValues } from "@/lib/use-table-filter";

interface FilterBarProps {
  values: FilterValues;
  onField: (key: string, val: string) => void;
  onClear: () => void;
  globalSearch: string;
  globalPlaceholder?: string;
  activeCount: number;
}

export function FilterBar({
  values, onField, onClear,
  globalSearch, globalPlaceholder = "Search…", activeCount,
}: FilterBarProps) {
  const totalActive = activeCount + (globalSearch ? 1 : 0);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 max-w-xs">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={globalSearch}
          onChange={e => onField(GLOBAL_KEY, e.target.value)}
          placeholder={globalPlaceholder}
          className="h-8 pl-8 text-xs"
        />
      </div>
      {totalActive > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onClear}
        >
          <X size={12} />
          Clear filters
          {totalActive > 1 && (
            <span className="ml-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0 leading-4">
              {totalActive}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
