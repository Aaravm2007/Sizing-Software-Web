"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── encoding ──────────────────────────────────────────────────────────────────

type DateMode = "exact" | "month" | "year" | "from" | "to" | "range" | "nfrom" | "nto";

function encodeValue(mode: DateMode, v1: string, v2: string, n: string): string {
  if (!v1 && mode !== "range") return "";
  switch (mode) {
    case "exact": return `exact:${v1}`;
    case "month": return `month:${v1}`;
    case "year":  return `year:${v1}`;
    case "from":  return `from:${v1}`;
    case "to":    return `to:${v1}`;
    case "range": return (v1 && v2) ? `range:${v1}|${v2}` : v1 ? `from:${v1}` : v2 ? `to:${v2}` : "";
    case "nfrom": return (n && v1) ? `nfrom:${n}|${v1}` : "";
    case "nto":   return (n && v1) ? `nto:${n}|${v1}` : "";
    default: return "";
  }
}

function decodeValue(val: string): { mode: DateMode; v1: string; v2: string; n: string } {
  const d = { mode: "from" as DateMode, v1: "", v2: "", n: "3" };
  if (!val) return d;
  if (val.startsWith("exact:")) return { ...d, mode: "exact", v1: val.slice(6) };
  if (val.startsWith("month:")) return { ...d, mode: "month", v1: val.slice(6) };
  if (val.startsWith("year:"))  return { ...d, mode: "year",  v1: val.slice(5) };
  if (val.startsWith("from:"))  return { ...d, mode: "from",  v1: val.slice(5) };
  if (val.startsWith("to:"))    return { ...d, mode: "to",    v1: val.slice(3) };
  if (val.startsWith("range:")) {
    const [a, b] = val.slice(6).split("|");
    return { ...d, mode: "range", v1: a ?? "", v2: b ?? "" };
  }
  if (val.startsWith("nfrom:")) {
    const [nv, start] = val.slice(6).split("|");
    return { ...d, mode: "nfrom", n: nv ?? "3", v1: start ?? "" };
  }
  if (val.startsWith("nto:")) {
    const [nv, end] = val.slice(4).split("|");
    return { ...d, mode: "nto", n: nv ?? "3", v1: end ?? "" };
  }
  return d;
}

function summarize(val: string): string | null {
  if (!val) return null;
  const { mode, v1, v2, n } = decodeValue(val);
  const short = (d: string) => d.slice(0, 7); // YYYY-MM
  switch (mode) {
    case "exact": return v1;
    case "month": return v1;
    case "year":  return v1;
    case "from":  return v1 ? `≥ ${short(v1)}` : null;
    case "to":    return v1 ? `≤ ${short(v1)}` : null;
    case "range": return (v1 && v2) ? `${short(v1)}→${short(v2)}` : v1 ? `≥${short(v1)}` : null;
    case "nfrom": return (n && v1) ? `${n}mo ↗ ${short(v1)}` : null;
    case "nto":   return (n && v1) ? `↙${n}mo ${short(v1)}` : null;
    default: return null;
  }
}

// ── modes ─────────────────────────────────────────────────────────────────────

const MODES: { key: DateMode; label: string; title: string }[] = [
  { key: "exact",  label: "Exact",  title: "Specific date"                },
  { key: "month",  label: "Month",  title: "All dates in a month"         },
  { key: "year",   label: "Year",   title: "All dates in a year"          },
  { key: "from",   label: "From ≥", title: "On or after a date"           },
  { key: "to",     label: "To ≤",   title: "On or before a date"          },
  { key: "range",  label: "Range",  title: "Between two dates"            },
  { key: "nfrom",  label: "N mo →", title: "N months forward from a date" },
  { key: "nto",    label: "← N mo", title: "N months back from a date"    },
];

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (val: string) => void;
}

export function DateFilterPopover({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const decoded = decodeValue(value);
  const [mode, setMode] = useState<DateMode>(decoded.mode);
  const [v1, setV1] = useState(decoded.v1);
  const [v2, setV2] = useState(decoded.v2);
  const [n,  setN]  = useState(decoded.n || "3");

  // sync local state when value changes externally (e.g. clear all)
  useEffect(() => {
    const d = decodeValue(value);
    setMode(d.mode);
    setV1(d.v1);
    setV2(d.v2);
    setN(d.n || "3");
  }, [value]);

  const openPopover = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // flip left if near right edge
      const left = rect.left + 256 > window.innerWidth ? rect.right - 256 : rect.left;
      setPos({ top: rect.bottom + 4, left });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        !popoverRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const apply = () => {
    onChange(encodeValue(mode, v1, v2, n));
    setOpen(false);
  };

  const clearFilter = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange("");
    setV1(""); setV2(""); setN("3");
    setOpen(false);
  };

  const inputCls = "h-7 rounded border px-2 text-xs bg-background w-full focus:outline-none focus:ring-1 ring-primary/40";

  const summary  = summarize(value);
  const isActive = !!value;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPopover}
        className={cn(
          "w-full h-6 rounded border px-1.5 text-[10px] flex items-center gap-1 bg-background transition-colors",
          isActive
            ? "border-primary text-primary font-medium"
            : "border-border text-muted-foreground hover:border-primary/50",
        )}
      >
        <Calendar size={9} className="shrink-0" />
        <span className="truncate flex-1 text-left">{summary ?? "Filter…"}</span>
        {isActive && (
          <X
            size={9}
            className="shrink-0 hover:text-destructive"
            onClick={clearFilter}
          />
        )}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-background border rounded-lg shadow-xl p-3 w-64 flex flex-col gap-2.5 text-xs"
        >
          {/* mode grid */}
          <div className="grid grid-cols-4 gap-1">
            {MODES.map(m => (
              <button
                key={m.key}
                type="button"
                title={m.title}
                onClick={() => setMode(m.key)}
                className={cn(
                  "h-6 rounded text-[10px] border transition-colors truncate px-0.5",
                  mode === m.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* inputs */}
          <div className="flex flex-col gap-1.5">
            {(mode === "exact" || mode === "from" || mode === "to") && (
              <input type="date" value={v1} onChange={e => setV1(e.target.value)} className={inputCls} />
            )}
            {mode === "month" && (
              <input type="month" value={v1} onChange={e => setV1(e.target.value)} className={inputCls} />
            )}
            {mode === "year" && (
              <input
                type="number" value={v1} onChange={e => setV1(e.target.value)}
                placeholder="e.g. 2026" min={2000} max={2100}
                className={inputCls}
              />
            )}
            {mode === "range" && (
              <div className="flex items-center gap-1">
                <input type="date" value={v1} onChange={e => setV1(e.target.value)} className={cn(inputCls, "flex-1")} />
                <span className="text-muted-foreground shrink-0 text-[10px]">→</span>
                <input type="date" value={v2} onChange={e => setV2(e.target.value)} className={cn(inputCls, "flex-1")} />
              </div>
            )}
            {(mode === "nfrom" || mode === "nto") && (
              <>
                <input
                  type="date" value={v1} onChange={e => setV1(e.target.value)}
                  className={inputCls}
                  placeholder={mode === "nfrom" ? "Start date" : "End date"}
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" value={n} onChange={e => setN(e.target.value)}
                    min={1} max={60} className={cn(inputCls, "w-16")}
                  />
                  <span className="text-muted-foreground text-[10px]">
                    {mode === "nfrom" ? "months forward" : "months back"}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* actions */}
          <div className="flex gap-1.5 justify-end pt-0.5">
            <button
              type="button" onClick={() => clearFilter()}
              className="h-6 px-2 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear
            </button>
            <button
              type="button" onClick={apply}
              className="h-6 px-2.5 rounded text-[10px] bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Apply
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
