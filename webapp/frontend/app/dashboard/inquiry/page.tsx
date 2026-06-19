"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { RefreshCw, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ── column definitions ────────────────────────────────────────────────────────

type YNField = "centre_tap" | "datasheet" | "sizing_sheet" | "gad" | "battery_compliance";

interface Col {
  key: string;
  label: string;
  width: number;
  type: "text" | "date" | "number" | "yn";
}

const COLS: Col[] = [
  { key: "inquiry_date",      label: "Inquiry Date",       width: 110, type: "date"   },
  { key: "type",               label: "Type",               width: 160, type: "text"   },
  { key: "sales_person",      label: "Sales Person",       width: 130, type: "text"   },
  { key: "solution_provider", label: "Solution Provider",  width: 210, type: "text"   },
  { key: "project_customer",    label: "Project / Customer",  width: 190, type: "text"   },
  { key: "ups_make",            label: "UPS Make",            width: 100, type: "text"   },
  { key: "ups_model",           label: "UPS Model",           width: 100, type: "text"   },
  { key: "ups_kva",             label: "UPS (KVA)",           width: 80,  type: "text"   },
  { key: "actual_load_kva",     label: "Load (KVA)",          width: 80,  type: "text"   },
  { key: "load_kw",             label: "Load (KW)",           width: 80,  type: "text"   },
  { key: "power_factor",        label: "Power Factor",        width: 85,  type: "text"   },
  { key: "inverter_efficiency", label: "Inv. Eff (%)",        width: 80,  type: "text"   },
  { key: "dc_voltage",          label: "DC Voltage",          width: 90,  type: "text"   },
  { key: "backup_min",          label: "Backup (min)",        width: 90,  type: "text"   },
  { key: "cell_chemistry",      label: "Chemistry",           width: 80,  type: "text"   },
  { key: "ageing_pct",          label: "Ageing (%)",          width: 75,  type: "text"   },
  { key: "design_margin_pct",   label: "Design Margin (%)",   width: 110, type: "text"   },
  { key: "dod_margin_pct",      label: "DOD Margin (%)",      width: 100, type: "text"   },
  { key: "derating_pct",        label: "Derating (%)",        width: 85,  type: "text"   },
  { key: "capacity_ah",         label: "Capacity (Ah)",       width: 100, type: "text"   },
  { key: "centre_tap",        label: "Centre Tap",         width: 90,  type: "text"   },
  { key: "cell_type",         label: "Cell Type",          width: 110, type: "text"   },
  { key: "ageing_type",       label: "BOL/EOL",            width: 70,  type: "text"   },
  { key: "backup_time_min",   label: "Backup Time (min)",  width: 120, type: "text"   },
  { key: "part_code",         label: "Part Code",          width: 200, type: "text"   },
  { key: "qty_system",        label: "Qty (System)",       width: 85,  type: "number" },
  { key: "rate_system",       label: "Rate (System ₹)",    width: 120, type: "number" },
  { key: "price_system",      label: "Price (System ₹)",   width: 125, type: "number" },
  { key: "rack_dim",          label: "Rack Dim",           width: 120, type: "text"   },
  { key: "qty",               label: "Qty (Rack)",         width: 75,  type: "number" },
  { key: "per_rack_price",    label: "Rate (Rack ₹)",      width: 110, type: "number" },
  { key: "price",             label: "Price (Rack ₹)",     width: 120, type: "number" },
  { key: "custom_cost_desc",  label: "Custom Cost Desc",   width: 160, type: "text"   },
  { key: "custom_cost_price", label: "Custom Cost (₹)",    width: 120, type: "number" },
  { key: "datasheet",         label: "Datasheet",          width: 90,  type: "yn"     },
  { key: "sizing_sheet",      label: "Sizing Sheet",       width: 95,  type: "yn"     },
  { key: "gad",               label: "GAD",                width: 60,  type: "yn"     },
  { key: "battery_compliance",label: "Bat. Compliance",    width: 115, type: "yn"     },
  { key: "warranty",          label: "Warranty",           width: 100, type: "text"   },
  { key: "remarks",           label: "Remarks",            width: 210, type: "text"   },
  { key: "solution_by",       label: "Solution By",        width: 110, type: "text"   },
  { key: "entry_by",          label: "Entry By",           width: 100, type: "text"   },
  { key: "data_upload_by",    label: "Upload By",          width: 100, type: "text"   },
  { key: "submission_date",   label: "Submission Date",    width: 110, type: "date"   },
  { key: "submitted_to",      label: "Submitted To",       width: 160, type: "text"   },
];

const TOTAL_W = COLS.reduce((s, c) => s + c.width, 0) + 50 + 40; // +sr_no col + delete col

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(v: string) {
  const n = parseFloat(v);
  if (!n) return v;
  return "₹" + n.toLocaleString("en-IN");
}

function displayVal(col: Col, val: string) {
  if (col.type === "yn") return val === "YES" ? "✓" : "✗";
  if ((col.key === "price" || col.key === "per_rack_price") && val) return fmtPrice(val);
  return val || "";
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function InquiryPage() {
  const qc = useQueryClient();
  const qKey = ["inquiry"];

  const { data: entries = [], isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => api.get("/api/inquiry").then(r => r.data),
  });

  // editing state: { id, key } | null
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [editVal, setEditVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);


  // ── delete row ─────────────────────────────────────────────────────────────
  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/inquiry/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  // ── patch field ────────────────────────────────────────────────────────────
  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, string> }) =>
      api.patch(`/api/inquiry/${id}`, patch),
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  // ── commit edit ────────────────────────────────────────────────────────────
  const commitEdit = useCallback(() => {
    if (!editing) return;
    patchMut.mutate({ id: editing.id, patch: { [editing.key]: editVal } });
    setEditing(null);
  }, [editing, editVal]);

  // ── start editing a cell ───────────────────────────────────────────────────
  const startEdit = (id: string, key: string, currentVal: string) => {
    commitEdit();
    setEditing({ id, key });
    setEditVal(currentVal);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ── toggle YES/NO ──────────────────────────────────────────────────────────
  const toggleYN = (id: string, key: string, current: string) => {
    const next = current === "YES" ? "NO" : "YES";
    patchMut.mutate({ id, patch: { [key]: next } });
    qc.setQueryData(qKey, (old: any[]) =>
      old.map(e => e._id === id ? { ...e, [key]: next } : e)
    );
  };

  if (isLoading) return (
    <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0">
        <h1 className="text-lg font-bold">UPS Inquiry Sheet</h1>
        <span className="text-xs text-muted-foreground">{entries.length} entries</span>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => qc.invalidateQueries({ queryKey: qKey })}>
          <RefreshCw className="h-3.5 w-3.5" />
          Reload
        </Button>
      </div>

      {/* ── table ── */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: TOTAL_W }}>
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted">
              {/* Sr No */}
              <th className="sticky left-0 z-30 bg-muted border border-muted px-2 py-2 text-left font-semibold"
                style={{ width: 50, minWidth: 50 }}>Sr</th>
              {COLS.map(col => (
                <th key={col.key}
                  className="border border-muted px-2 py-2 text-left font-semibold whitespace-nowrap"
                  style={{ width: col.width, minWidth: col.width }}>
                  {col.label}
                </th>
              ))}
              {/* delete col */}
              <th className="border border-muted px-1 py-2" style={{ width: 40, minWidth: 40 }} />
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={COLS.length + 2}
                  className="text-center text-muted-foreground py-12 text-sm">
                  No entries yet
                </td>
              </tr>
            )}
            {entries.map((row: any) => (
              <tr key={row._id} className="hover:bg-muted/30 group">
                {/* Sr No — sticky */}
                <td className="sticky left-0 z-10 bg-background group-hover:bg-muted/30 border border-muted px-2 py-1 font-mono text-muted-foreground select-none">
                  {row.sr_no}
                </td>

                {COLS.map(col => {
                  const val = String(row[col.key] ?? "");
                  const isEditing = editing?.id === row._id && editing?.key === col.key;

                  if (col.type === "yn") {
                    return (
                      <td key={col.key}
                        className="border border-muted px-1 py-1 text-center cursor-pointer select-none"
                        onClick={() => toggleYN(row._id, col.key, val)}>
                        <span className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-xs font-medium",
                          val === "YES"
                            ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                            : "bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400"
                        )}>
                          {val === "YES" ? "YES" : "NO"}
                        </span>
                      </td>
                    );
                  }

                  return (
                    <td key={col.key}
                      className="border border-muted px-0 py-0 cursor-text"
                      onClick={() => !isEditing && startEdit(row._id, col.key, val)}>
                      {isEditing ? (
                        <input
                          ref={inputRef}
                          className="w-full h-full px-1.5 py-1 text-xs bg-blue-50 dark:bg-blue-950/30 outline-none border-2 border-blue-400"
                          type={col.type === "date" ? "date" : col.type === "number" ? "number" : "text"}
                          value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={e => {
                            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commitEdit(); }
                            if (e.key === "Escape") setEditing(null);
                          }}
                        />
                      ) : (
                        <div className="px-1.5 py-1 min-h-[26px] truncate">
                          {displayVal(col, val)}
                        </div>
                      )}
                    </td>
                  );
                })}

                {/* delete button */}
                <td className="border border-muted px-1 py-1 text-center">
                  <button
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-opacity"
                    onClick={() => {
                      if (confirm(`Delete row ${row.sr_no}?`)) delMut.mutate(row._id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
