"use client";

import { useMemo, useState } from "react";

export type FilterValues = Record<string, string>;

export const GLOBAL_KEY = "__global__";

// ── date filter helpers ────────────────────────────────────────────────────────

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const DATE_PREFIXES = ["exact:", "month:", "year:", "from:", "to:", "range:", "nfrom:", "nto:"];

function isDateEncoded(val: string) {
  return DATE_PREFIXES.some(p => val.startsWith(p));
}

function parseDateFilter(encoded: string, rowDate: string): boolean {
  if (!rowDate) return false;

  if (encoded.startsWith("exact:")) return rowDate === encoded.slice(6);
  if (encoded.startsWith("month:")) return rowDate.startsWith(encoded.slice(6));
  if (encoded.startsWith("year:"))  return rowDate.startsWith(encoded.slice(5));
  if (encoded.startsWith("from:"))  return rowDate >= encoded.slice(5);
  if (encoded.startsWith("to:"))    return rowDate <= encoded.slice(3);

  if (encoded.startsWith("range:")) {
    const [from, to] = encoded.slice(6).split("|");
    return (!from || rowDate >= from) && (!to || rowDate <= to);
  }

  if (encoded.startsWith("nfrom:")) {
    const [nStr, start] = encoded.slice(6).split("|");
    const months = parseInt(nStr ?? "0", 10);
    if (!start || isNaN(months)) return true;
    return rowDate >= start && rowDate <= addMonths(start, months);
  }

  if (encoded.startsWith("nto:")) {
    const [nStr, end] = encoded.slice(4).split("|");
    const months = parseInt(nStr ?? "0", 10);
    if (!end || isNaN(months)) return true;
    return rowDate >= addMonths(end, -months) && rowDate <= end;
  }

  return rowDate.toLowerCase().includes(encoded.toLowerCase());
}

// ── time filter helpers ────────────────────────────────────────────────────────

function parseTimeFilter(encoded: string, rowTime: string): boolean {
  if (!rowTime) return false;
  const parts = rowTime.split(":");
  const rowH = (parts[0] ?? "").padStart(2, "0");
  const rowM = (parts[1] ?? "").slice(0, 2).padStart(2, "0");

  if (encoded.startsWith("hour|")) {
    return rowH === encoded.slice(5).padStart(2, "0");
  }
  if (encoded.startsWith("min|")) {
    return rowM === encoded.slice(4).padStart(2, "0");
  }
  if (encoded.startsWith("hhmm|")) {
    const [, hh, mm] = encoded.split("|");
    return rowH === (hh ?? "").padStart(2, "0") && rowM === (mm ?? "").padStart(2, "0");
  }
  return false;
}

// ── hook ───────────────────────────────────────────────────────────────────────

export function useTableFilter<T extends Record<string, any>>(
  rows: T[],
  searchKeys: (keyof T)[],
  selectKeys?: ReadonlySet<string>,
) {
  const [values, setValues] = useState<FilterValues>({});

  const globalSearch = values[GLOBAL_KEY] ?? "";
  const activeCount  = Object.entries(values).filter(([k, v]) => k !== GLOBAL_KEY && !!v).length;

  const setField = (key: string, val: string) =>
    setValues(prev => ({ ...prev, [key]: val }));

  const clear = () => setValues({});

  const filtered = useMemo(() => {
    let out = rows;

    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      out = out.filter(r =>
        searchKeys.some(k => String(r[k] ?? "").toLowerCase().includes(q)),
      );
    }

    for (const [key, val] of Object.entries(values)) {
      if (key === GLOBAL_KEY || !val) continue;
      const rowVal = (r: T) => String(r[key] ?? "");
      if (isDateEncoded(val)) {
        out = out.filter(r => parseDateFilter(val, rowVal(r)));
      } else if (val.startsWith("hour|") || val.startsWith("min|") || val.startsWith("hhmm|")) {
        out = out.filter(r => parseTimeFilter(val, rowVal(r)));
      } else if (selectKeys?.has(key)) {
        out = out.filter(r => rowVal(r).toLowerCase() === val.toLowerCase());
      } else {
        out = out.filter(r => rowVal(r).toLowerCase().includes(val.toLowerCase()));
      }
    }

    return out;
  }, [rows, values, searchKeys, selectKeys]);

  return { filtered, values, setField, clear, activeCount, globalSearch };
}
