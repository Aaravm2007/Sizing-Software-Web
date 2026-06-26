"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RefreshCw, Trash2, Loader2, PackagePlus, FileUp, Download } from "lucide-react";
import { cn, fmtDate } from "@/lib/utils";
import { FilterBar } from "@/components/filter-bar";
import { FilterRow } from "@/components/filter-row";
import { GLOBAL_KEY, type FilterValues } from "@/lib/use-table-filter";

// ── column definitions ────────────────────────────────────────────────────────

type YNField = "centre_tap" | "datasheet" | "sizing_sheet" | "gad" | "battery_compliance";

interface Col {
  key: string;
  label: string;
  width: number;
  type: "text" | "date" | "number" | "yn";
  filterType?: "text" | "select" | "date";
  filterOptions?: { value: string; label: string }[];
}

const COLS: Col[] = [
  { key: "inquiry_code",      label: "Inquiry Code",       width: 120, type: "text",   filterType: "text" },
  { key: "inquiry_date",      label: "Inquiry Date",       width: 110, type: "date",   filterType: "date" },
  { key: "type",               label: "Type",               width: 160, type: "text",   filterType: "text" },
  { key: "sales_person",      label: "Sales Person",       width: 130, type: "text",   filterType: "text" },
  { key: "solution_provider", label: "Solution Provider",  width: 210, type: "text",   filterType: "text" },
  { key: "project_customer",    label: "Project / Customer",  width: 190, type: "text",   filterType: "text" },
  { key: "ups_make",            label: "UPS Make",            width: 100, type: "text",   filterType: "text" },
  { key: "ups_model",           label: "UPS Model",           width: 100, type: "text",   filterType: "text" },
  { key: "ups_kva",             label: "UPS (KVA)",           width: 80,  type: "text",   filterType: "text" },
  { key: "actual_load_kva",     label: "Load (KVA)",          width: 80,  type: "text"   },
  { key: "load_kw",             label: "Load (KW)",           width: 80,  type: "text"   },
  { key: "power_factor",        label: "Power Factor",        width: 85,  type: "text"   },
  { key: "inverter_efficiency", label: "Inv. Eff (%)",        width: 80,  type: "text"   },
  { key: "dc_voltage",          label: "DC Voltage",          width: 90,  type: "text"   },
  { key: "backup_min",          label: "Backup (min)",        width: 90,  type: "text"   },
  { key: "cell_chemistry",      label: "Chemistry",           width: 80,  type: "text",   filterType: "text" },
  { key: "ageing_pct",          label: "Ageing (%)",          width: 75,  type: "text"   },
  { key: "design_margin_pct",   label: "Design Margin (%)",   width: 110, type: "text"   },
  { key: "dod_margin_pct",      label: "DOD Margin (%)",      width: 100, type: "text"   },
  { key: "derating_pct",        label: "Derating (%)",        width: 85,  type: "text"   },
  { key: "capacity_ah",         label: "Capacity (Ah)",       width: 100, type: "text"   },
  { key: "centre_tap",  label: "Centre Tap", width: 90,  type: "text", filterType: "select", filterOptions: [{ value: "Centre Tap", label: "Centre Tap" }, { value: "Non Centre Tap", label: "Non Centre Tap" }] },
  { key: "cell_type",   label: "Cell Type",  width: 110, type: "text", filterType: "select", filterOptions: [{ value: "Prismatic", label: "Prismatic" }, { value: "Cylindrical", label: "Cylindrical" }] },
  { key: "ageing_type", label: "BOL/EOL",    width: 70,  type: "text", filterType: "select", filterOptions: [{ value: "BOL", label: "BOL" }, { value: "EOL", label: "EOL" }] },
  { key: "backup_time_min",   label: "Backup Time (min)",  width: 120, type: "text"   },
  { key: "part_code",         label: "Part Code",          width: 200, type: "text",   filterType: "text" },
  { key: "qty_system",        label: "Qty (System)",       width: 85,  type: "number" },
  { key: "rate_system",       label: "Rate (System ₹)",    width: 120, type: "number" },
  { key: "price_system",      label: "Price (System ₹)",   width: 125, type: "number" },
  { key: "rack1_dim",         label: "Rack 1 Dim",         width: 140, type: "text"   },
  { key: "rack1_qty",         label: "Rack 1 Qty",         width: 75,  type: "number" },
  { key: "rack1_rate",        label: "Rack 1 Rate ₹",      width: 110, type: "number" },
  { key: "rack1_price",       label: "Rack 1 Price ₹",     width: 115, type: "number" },
  { key: "rack2_dim",         label: "Rack 2 Dim",         width: 140, type: "text"   },
  { key: "rack2_qty",         label: "Rack 2 Qty",         width: 75,  type: "number" },
  { key: "rack2_rate",        label: "Rack 2 Rate ₹",      width: 110, type: "number" },
  { key: "rack2_price",       label: "Rack 2 Price ₹",     width: 115, type: "number" },
  { key: "cc1_desc",          label: "CC1 Desc",           width: 150, type: "text"   },
  { key: "cc1_price",         label: "CC1 Price ₹",        width: 110, type: "number" },
  { key: "cc2_desc",          label: "CC2 Desc",           width: 150, type: "text"   },
  { key: "cc2_price",         label: "CC2 Price ₹",        width: 110, type: "number" },
  { key: "cc3_desc",          label: "CC3 Desc",           width: 150, type: "text"   },
  { key: "cc3_price",         label: "CC3 Price ₹",        width: 110, type: "number" },
  { key: "cc4_desc",          label: "CC4 Desc",           width: 150, type: "text"   },
  { key: "cc4_price",         label: "CC4 Price ₹",        width: 110, type: "number" },
  { key: "cc5_desc",          label: "CC5 Desc",           width: 150, type: "text"   },
  { key: "cc5_price",         label: "CC5 Price ₹",        width: 110, type: "number" },
  { key: "datasheet",         label: "Datasheet",          width: 90,  type: "yn"     },
  { key: "sizing_sheet",      label: "Sizing Sheet",       width: 95,  type: "yn"     },
  { key: "gad",               label: "GAD",                width: 60,  type: "yn"     },
  { key: "battery_compliance",label: "Bat. Compliance",    width: 115, type: "yn"     },
  { key: "warranty",          label: "Warranty (yrs)",     width: 100, type: "text"   },
  { key: "dollar_rate",       label: "Dollar Rate",        width: 100, type: "text"   },
  { key: "remarks",           label: "Remarks",            width: 210, type: "text"   },
  { key: "handled_by",        label: "Handled By",         width: 110, type: "text",   filterType: "text" },
  { key: "submission_date",   label: "Submission Date",    width: 110, type: "date",   filterType: "date" },
  { key: "submitted_to",      label: "Submitted To",       width: 160, type: "text",   filterType: "text" },
  { key: "submitted_by",      label: "Submitted By",       width: 130, type: "text",   filterType: "text" },
];

const TOTAL_W = COLS.reduce((s, c) => s + c.width, 0) + 40; // +delete col

const INQUIRY_SELECT_KEYS = new Set(["cell_type", "centre_tap", "ageing_type"]);

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(v: string) {
  const n = parseFloat(v);
  if (!n) return v;
  return "₹" + n.toLocaleString("en-IN");
}

function displayVal(col: Col, val: string) {
  if (col.type === "yn") return val === "YES" ? "✓" : "✗";
  if (col.type === "date" && val) return fmtDate(val);
  if (/^(price|per_rack_price|rack[12]_(?:rate|price)|cc[1-5]_price|price_system|rate_system)$/.test(col.key) && val) return fmtPrice(val);
  return val || "";
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function InquiryPage() {
  const qc = useQueryClient();

  const [filterValues, setFilterValues] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [jumpVal, setJumpVal] = useState("");

  const globalSearch = filterValues[GLOBAL_KEY] ?? "";
  const activeCount  = Object.entries(filterValues).filter(([k, v]) => k !== GLOBAL_KEY && !!v).length;

  const setField = (key: string, val: string) => {
    setFilterValues(prev => ({ ...prev, [key]: val }));
    setPage(1);
  };
  const clear = () => { setFilterValues({}); setPage(1); };

  const buildParams = (extraPage?: number) => {
    const p = new URLSearchParams({ page: String(extraPage ?? page), limit: "250" });
    if (globalSearch) p.set("search", globalSearch);
    Object.entries(filterValues).forEach(([k, v]) => { if (k !== GLOBAL_KEY && v) p.set(k, v); });
    return p;
  };

  const { data: pageData, isLoading, isFetching } = useQuery({
    queryKey: ["inquiry", "global", page, filterValues],
    queryFn: () => api.get(`/api/inquiry?${buildParams()}`).then(r => r.data),
    placeholderData: (prev: any) => prev,
  });

  const entries: any[]  = pageData?.rows  ?? [];
  const totalPages: number = pageData?.pages ?? 1;
  const totalCount: number = pageData?.total ?? 0;

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/api/auth/me").then(r => r.data),
    staleTime: Infinity,
  });
  const isExpert = me?.role === "e";

  const { data: inquiryCodeHint, refetch: refetchCodeHint } = useQuery<{ last: string; suggestion: string }>({
    queryKey: ["inquiry-next-inquiry-code"],
    queryFn: () => api.get("/api/inquiry/next-inquiry-code").then(r => r.data),
    enabled: false,
  });

  // editing state: { id, key } | null
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [editVal, setEditVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // ── delete confirm ─────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null); // sr_no as string

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/inquiry/${id}`),
    onSuccess: () => { setConfirmDelete(null); qc.invalidateQueries({ queryKey: ["inquiry", "global"] }); },
    onError: (e: any) => { setConfirmDelete(null); toast.error(apiErr(e, "Delete failed")); },
  });

  // ── patch field ────────────────────────────────────────────────────────────
  const patchMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, string> }) =>
      api.patch(`/api/inquiry/${id}`, patch),
    onSuccess: (_, { id, patch }) => {
      qc.setQueryData(["inquiry", "global", page, filterValues], (old: any) =>
        old ? { ...old, rows: old.rows.map((e: any) => e._id === id ? { ...e, ...patch } : e) } : old
      );
    },
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  // ── excel export ───────────────────────────────────────────────────────────
  const exportMut = useMutation({
    mutationFn: async () => {
      const res = await api.get(`/api/inquiry/export-excel?${buildParams()}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "inquiry_sheet.xlsx"; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: any) => toast.error(apiErr(e, "Export failed")),
  });

  // ── create PO from inquiry row ─────────────────────────────────────────────
  const [createPORow, setCreatePORow] = useState<any | null>(null);
  const [poDocFile, setPoDocFile]     = useState<File | null>(null);
  const [poInqForm, setPoInqForm] = useState({
    inquiry_code: "", customer_name: "", project_name: "", solution: "",
    inquiry_qty: "", po_qty: "", po_no: "", po_date: "", unit_price: "",
    cell_used: "", cells_per_rack: "", expected_completion_date: "", remarks: "",
  });
  const [poChips, setPoChips] = useState<{ key: string; label: string; price: number; active: boolean }[]>([]);

  const createPOMut = useMutation({
    mutationFn: (data: typeof poInqForm) => api.post("/api/po", data).then(r => r.data),
    onSuccess: async (res: { id: number }) => {
      if (poDocFile) {
        try {
          const fd = new FormData();
          fd.append("file", poDocFile);
          await api.post(`/api/po/${res.id}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        } catch { toast.error("PO created but document upload failed"); }
      }
      toast.success("PO created");
      setCreatePORow(null);
      setPoDocFile(null);
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed to create PO")),
  });

  const buildChips = (row: any) => {
    const chips: { key: string; label: string; price: number; active: boolean }[] = [];
    const qty = parseFloat(row.qty_system) || 1;
    const push = (key: string, label: string, price: number) => {
      if (price) chips.push({ key, label, price, active: true });
    };
    push("system", "System",           parseFloat(row.rate_system) || 0);
    push("rack1",  "Rack 1 (Modular)", (parseFloat(row.rack1_price) || 0) / qty);
    push("rack2",  "Rack 2 (Modular)", (parseFloat(row.rack2_price) || 0) / qty);
    for (let i = 1; i <= 5; i++) {
      push(`cc${i}`, row[`cc${i}_desc`] || `CC${i}`, parseFloat(row[`cc${i}_price`]) || 0);
    }
    return chips;
  };

  const chipsTotal = (chips: typeof poChips) =>
    chips.filter(c => c.active).reduce((s, c) => s + c.price, 0);

  const buildRemarks = (chips: typeof poChips) => {
    const inactive = chips.filter(c => !c.active);
    if (inactive.length === 0) return "All quoted prices included";
    return inactive.map(c => `${c.label} (₹${c.price.toLocaleString("en-IN")})`).join(", ") + " quoted but not included";
  };

  const openCreatePO = (row: any) => {
    const chips = buildChips(row);
    setPoChips(chips);
    const total = chipsTotal(chips);
    setPoInqForm({
      inquiry_code:             row.inquiry_code      || "",
      customer_name:            row.solution_provider || "",
      project_name:             row.project_customer  || "",
      solution:                 row.part_code         || "",
      inquiry_qty:              String(row.qty_system ?? ""),
      po_qty:                   String(row.qty_system ?? ""),
      po_no: "", po_date: "",
      unit_price:               total ? String(total) : "",
      cell_used:                "",
      cells_per_rack:           "",
      expected_completion_date: "",
      remarks:                  chips.length ? buildRemarks(chips) : "",
    });
    setCreatePORow(row);
  };

  const togglePoChip = (key: string) => {
    setPoChips(prev => {
      const next = prev.map(c => c.key === key ? { ...c, active: !c.active } : c);
      setPoInqForm(f => ({
        ...f,
        unit_price: String(chipsTotal(next)) || "",
        remarks: buildRemarks(next),
      }));
      return next;
    });
  };

  // ── commit edit ────────────────────────────────────────────────────────────
  const commitEdit = useCallback(() => {
    if (!editing) return;
    const patch: Record<string, string> = { [editing.key]: editVal };
    if (editing.key === "warranty") {
      const row = entries.find((e: any) => e._id === editing.id);
      if (row) {
        const qfmt: string = row.quote_format || "";
        if (qfmt.includes("Extended_Warranty") && row.base_partcode) {
          patch.part_code = `${row.base_partcode}-${editVal}W`;
        }
      }
    }
    patchMut.mutate({ id: editing.id, patch });
    setEditing(null);
  }, [editing, editVal, entries]);

  // ── start editing a cell ───────────────────────────────────────────────────
  const startEdit = (id: string, key: string, currentVal: string) => {
    commitEdit();
    setEditing({ id, key });
    setEditVal(currentVal);
    if (key === "inquiry_code") refetchCodeHint();
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ── toggle YES/NO ──────────────────────────────────────────────────────────
  const toggleYN = (id: string, key: string, current: string) => {
    const next = current === "YES" ? "NO" : "YES";
    patchMut.mutate({ id, patch: { [key]: next } });
    qc.setQueryData(["inquiry", "global", page, filterValues], (old: any) =>
      old ? { ...old, rows: old.rows.map((e: any) => e._id === id ? { ...e, [key]: next } : e) } : old
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
        <span className="text-xs text-muted-foreground">
          {totalCount.toLocaleString()} entries
        </span>
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        <div className="flex-1" />
        {isExpert && (
          <Button
            size="sm" variant="outline" className="gap-1.5"
            onClick={() => exportMut.mutate()}
            disabled={exportMut.isPending}
          >
            {exportMut.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            Export Excel
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => qc.invalidateQueries({ queryKey: ["inquiry", "global"] })}>
          <RefreshCw className="h-3.5 w-3.5" />
          Reload
        </Button>
      </div>

      {/* ── filter bar ── */}
      <div className="px-4 py-2 border-b shrink-0">
        <FilterBar
          values={filterValues}
          onField={setField}
          onClear={clear}
          globalSearch={globalSearch}
          globalPlaceholder="Search inquiry code, customer, part code…"
          activeCount={activeCount}
        />
      </div>

      {/* ── pagination ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b shrink-0 text-xs text-muted-foreground select-none">
        <Button
          size="sm" variant="ghost" className="h-7 px-2 text-xs"
          disabled={page <= 1}
          onClick={() => setPage(p => p - 1)}
        >← Prev</Button>
        <span>Page {page} of {totalPages}</span>
        <input
          type="number"
          min={1} max={totalPages}
          value={jumpVal}
          placeholder="Go"
          onChange={e => setJumpVal(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              const v = parseInt(jumpVal);
              if (v >= 1 && v <= totalPages) setPage(v);
              setJumpVal("");
            }
          }}
          className="w-14 h-7 border rounded px-2 text-center text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <Button
          size="sm" variant="ghost" className="h-7 px-2 text-xs"
          disabled={page >= totalPages}
          onClick={() => setPage(p => p + 1)}
        >Next →</Button>
      </div>

      {/* ── table ── */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs" style={{ minWidth: TOTAL_W }}>
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted">
              {COLS.map(col => (
                <th key={col.key}
                  className="border border-muted px-2 py-2 text-left font-semibold whitespace-nowrap"
                  style={{ width: col.width, minWidth: col.width }}>
                  {col.label}
                </th>
              ))}
              <th className="border border-muted px-2 py-2 text-xs font-semibold whitespace-nowrap" style={{ width: 90, minWidth: 90 }}>Create PO</th>
              {isExpert && <th className="border border-muted px-1 py-2" style={{ width: 40, minWidth: 40 }} />}
            </tr>
            <FilterRow
              cols={COLS}
              values={filterValues}
              onField={setField}
              prefixCells={[]}
              suffixCells={[
                { width: 90 },
                ...(isExpert ? [{ width: 40 }] : []),
              ]}
            />
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={COLS.length + (isExpert ? 2 : 1)}
                  className="text-center text-muted-foreground py-12 text-sm">
                  No entries yet
                </td>
              </tr>
            )}
            {entries.map((row: any) => (
              <tr key={row._id} className="hover:bg-muted/30 group">
                {COLS.map(col => {
                  const val = String(row[col.key] ?? "");
                  const isEditing = editing?.id === row._id && editing?.key === col.key;
                  const canEdit = isExpert;

                  if (col.type === "yn") {
                    return (
                      <td key={col.key}
                        className={cn("border border-muted px-1 py-1 text-center select-none", canEdit && "cursor-pointer")}
                        onClick={() => canEdit && toggleYN(row._id, col.key, val)}>
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
                      className={cn("border border-muted px-0 py-0 relative", canEdit && "cursor-text")}
                      onClick={() => canEdit && col.key !== "handled_by" && !isEditing && startEdit(row._id, col.key, val)}>
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
                      {isEditing && col.key === "inquiry_code" && inquiryCodeHint?.suggestion && !editVal && (
                        <button
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setEditVal(inquiryCodeHint!.suggestion); }}
                          className="absolute left-0 top-full mt-0.5 z-50 bg-background border rounded px-2 py-1 text-[10px] text-primary shadow whitespace-nowrap hover:bg-accent"
                        >
                          Suggested: {inquiryCodeHint.suggestion}
                        </button>
                      )}
                    </td>
                  );
                })}

                {/* create PO button */}
                <td className="border border-muted px-1 py-1 text-center">
                  <button
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-primary border border-primary/40 hover:bg-primary/10"
                    title="Create PO"
                    onClick={() => openCreatePO(row)}
                  >
                    <PackagePlus className="h-3.5 w-3.5" />
                    PO
                  </button>
                </td>

                {/* delete button — experts only */}
                {isExpert && (
                  <td className="border border-muted px-1 py-1 text-center">
                    {confirmDelete === String(row.sr_no) ? (
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          className="px-1.5 py-0.5 rounded text-xs bg-red-500 text-white hover:bg-red-600"
                          onClick={() => delMut.mutate(String(row.sr_no))}
                        >Yes</button>
                        <button
                          className="px-1.5 py-0.5 rounded text-xs bg-muted hover:bg-muted/80 text-muted-foreground"
                          onClick={() => setConfirmDelete(null)}
                        >No</button>
                      </div>
                    ) : (
                      <button
                        className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        onClick={() => setConfirmDelete(String(row.sr_no))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create PO from inquiry dialog */}
      <Dialog open={!!createPORow} onOpenChange={o => { if (!o) setCreatePORow(null); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create PO — {createPORow?.inquiry_code}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {([
              { key: "inquiry_code",  label: "Inquiry Code", readonly: true },
              { key: "customer_name", label: "Customer Name" },
              { key: "project_name",  label: "Project / Customer", span: true },
              { key: "solution",      label: "Solution (Part Code)", span: true },
              { key: "inquiry_qty",   label: "Inquiry Qty", readonly: true },
              { key: "po_qty",        label: "PO Qty" },
              { key: "po_no",         label: "PO No." },
              { key: "po_date",       label: "PO Date", type: "date" },
              { key: "unit_price",    label: "Unit Price (GST Extra)", readonly: true },
              { key: "cell_used",               label: "Cell Used" },
              { key: "cells_per_rack",          label: "Cells per Pack" },
              { key: "expected_completion_date", label: "Expected Completion Date", type: "date" },
              { key: "remarks",                 label: "Remarks", span: true, textarea: true },
            ] as { key: keyof typeof poInqForm; label: string; type?: string; span?: boolean; textarea?: boolean; readonly?: boolean }[]).map(f => (
              <div key={f.key} className={cn("flex flex-col gap-1", f.span && "col-span-2")}>
                <Label className="text-xs">{f.label}</Label>
                {f.key === "unit_price" && poChips.length > 0 && (
                  <div className="flex flex-col gap-2 mb-1">
                    <div className="flex flex-wrap gap-1.5">
                      {poChips.map(chip => (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => togglePoChip(chip.key)}
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                            chip.active
                              ? "bg-primary/10 border-primary/40 text-primary"
                              : "bg-muted border-muted text-muted-foreground line-through"
                          )}
                        >
                          {chip.label}: ₹{chip.price.toLocaleString("en-IN")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {f.readonly ? (
                  <div className="h-8 flex items-center px-3 rounded-md border bg-muted text-xs text-muted-foreground select-all">
                    {poInqForm[f.key]
                      ? (f.key === "unit_price" ? `₹${parseFloat(poInqForm[f.key]).toLocaleString("en-IN")}` : poInqForm[f.key])
                      : "—"}
                  </div>
                ) : f.textarea ? (
                  <textarea
                    rows={2}
                    value={poInqForm[f.key]}
                    onChange={e => setPoInqForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="rounded-md border px-3 py-1.5 text-xs bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                ) : (
                  <Input
                    type={f.type ?? "text"}
                    value={poInqForm[f.key]}
                    onChange={e => setPoInqForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="h-8 text-xs"
                  />
                )}
              </div>
            ))}
          </div>
          {/* PO Document attach */}
          <div className="flex flex-col gap-1 border-t pt-3">
            <Label className="text-xs flex items-center gap-1"><FileUp size={12} /> Attach PO Document <span className="text-muted-foreground">(optional, any format)</span></Label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="file" className="hidden" onChange={e => setPoDocFile(e.target.files?.[0] ?? null)} />
              <span className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-colors",
                poDocFile ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted text-muted-foreground"
              )}>
                <FileUp size={12} />
                {poDocFile ? poDocFile.name : "Choose file…"}
              </span>
              {poDocFile && (
                <button type="button" className="text-xs text-muted-foreground hover:text-destructive" onClick={() => setPoDocFile(null)}>Remove</button>
              )}
            </label>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setCreatePORow(null); setPoDocFile(null); }}>Cancel</Button>
            <Button onClick={() => createPOMut.mutate(poInqForm)} disabled={createPOMut.isPending}>
              {createPOMut.isPending ? "Creating…" : "Create PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
