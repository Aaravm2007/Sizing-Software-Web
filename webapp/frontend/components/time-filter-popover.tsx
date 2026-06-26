"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ── encoding  (pipe-separated to avoid colon collision with HH:MM) ─────────────
// "hour|14"      → hour === 14
// "min|30"       → minute === 30
// "hhmm|14|30"   → hour === 14 AND minute === 30

type TimeMode = "hour" | "min" | "hhmm";

export function encodeTime(mode: TimeMode, h: string, m: string): string {
  if (mode === "hour")  return h ? `hour|${h}` : "";
  if (mode === "min")   return m ? `min|${m}`  : "";
  if (mode === "hhmm")  return (h && m) ? `hhmm|${h}|${m}` : "";
  return "";
}

export function decodeTime(val: string): { mode: TimeMode; h: string; m: string } {
  const d = { mode: "hour" as TimeMode, h: "", m: "" };
  if (!val) return d;
  if (val.startsWith("hour|"))  return { mode: "hour",  h: val.slice(5),         m: "" };
  if (val.startsWith("min|"))   return { mode: "min",   h: "",                   m: val.slice(4) };
  if (val.startsWith("hhmm|")) {
    const [, hh, mm] = val.split("|");
    return { mode: "hhmm", h: hh ?? "", m: mm ?? "" };
  }
  return d;
}

function summarize(val: string): string | null {
  if (!val) return null;
  const { mode, h, m } = decodeTime(val);
  if (mode === "hour")  return h ? `${h.padStart(2,"0")}:xx` : null;
  if (mode === "min")   return m ? `xx:${m.padStart(2,"0")}` : null;
  if (mode === "hhmm")  return (h && m) ? `${h.padStart(2,"0")}:${m.padStart(2,"0")}` : null;
  return null;
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (val: string) => void;
}

const MODES: { key: TimeMode; label: string }[] = [
  { key: "hour",  label: "Hour"    },
  { key: "min",   label: "Minute"  },
  { key: "hhmm",  label: "H + M"  },
];

export function TimeFilterPopover({ value, onChange }: Props) {
  const decoded = decodeTime(value);
  const [mode, setMode] = useState<TimeMode>(decoded.mode);
  const [h, setH] = useState(decoded.h);
  const [m, setM] = useState(decoded.m);
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = decodeTime(value);
    setMode(d.mode); setH(d.h); setM(d.m);
  }, [value]);

  const openPopover = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const left = rect.left + 200 > window.innerWidth ? rect.right - 200 : rect.left;
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
    onChange(encodeTime(mode, h, m));
    setOpen(false);
  };

  const clearFilter = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange("");
    setH(""); setM("");
    setOpen(false);
  };

  const numInput = (
    val: string, set: (v: string) => void,
    max: number, placeholder: string,
  ) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{placeholder}</span>
      <input
        type="number"
        min={0} max={max}
        value={val}
        onChange={e => set(e.target.value)}
        placeholder={placeholder === "Hour" ? "0–23" : "0–59"}
        className="h-7 w-20 rounded border px-2 text-xs bg-background focus:outline-none focus:ring-1 ring-primary/40"
      />
    </div>
  );

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
        <Clock size={9} className="shrink-0" />
        <span className="truncate flex-1 text-left">{summary ?? "Filter…"}</span>
        {isActive && (
          <X size={9} className="shrink-0 hover:text-destructive" onClick={clearFilter} />
        )}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-background border rounded-lg shadow-xl p-3 w-52 flex flex-col gap-2.5 text-xs"
        >
          {/* mode */}
          <div className="grid grid-cols-3 gap-1">
            {MODES.map(mo => (
              <button
                key={mo.key}
                type="button"
                onClick={() => setMode(mo.key)}
                className={cn(
                  "h-6 rounded text-[10px] border transition-colors",
                  mode === mo.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50",
                )}
              >
                {mo.label}
              </button>
            ))}
          </div>

          {/* inputs */}
          <div className="flex gap-2 items-end">
            {(mode === "hour" || mode === "hhmm") && numInput(h, setH, 23, "Hour")}
            {mode === "hhmm" && <span className="text-muted-foreground pb-1.5">:</span>}
            {(mode === "min"  || mode === "hhmm") && numInput(m, setM, 59, "Minute")}
          </div>

          {/* actions */}
          <div className="flex gap-1.5 justify-end">
            <button
              type="button" onClick={() => clearFilter()}
              className="h-6 px-2 rounded text-[10px] border border-border text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
            <button
              type="button" onClick={apply}
              className="h-6 px-2.5 rounded text-[10px] bg-primary text-primary-foreground hover:opacity-90"
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
