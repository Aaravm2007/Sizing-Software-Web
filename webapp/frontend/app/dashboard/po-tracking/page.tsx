"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Trash2, Loader2, Upload, Truck, ChevronRight, Download, FileUp } from "lucide-react";
import { cn, fmtDate } from "@/lib/utils";
import { FilterBar } from "@/components/filter-bar";
import { FilterRow } from "@/components/filter-row";
import { useTableFilter } from "@/lib/use-table-filter";
import { SortButtons, type SortState } from "@/components/sort-buttons";

interface PORow {
  id: number;
  sr_no: number;
  inquiry_code: string;
  customer_name: string;
  project_name: string;
  po_no: string;
  po_date: string;
  solution: string;
  inquiry_qty: string;
  po_qty: string;
  unit_price: string;
  total_price: string;
  total_qty: string;
  balance_qty: string;
  total_dispatch_qty: string;
  total_pending_qty: string;
  cell_used: string;
  cells_per_rack: string;
  total_cells_required: string;
  remarks: string;
  po_uploaded_by: string;
  completion_date: string;
  expected_completion_date: string;
  days_to_complete: string;
  document_filename: string;
  rounded_off_price: string;
  price_lost_roundoff: string;
  terms_and_conditions: string;
}

interface Dispatch {
  id: number;
  po_id: number;
  dispatch_date: string;
  dispatch_code: string;
  dispatch_qty: number;
}

const EMPTY_PO = {
  inquiry_code: "", customer_name: "", project_name: "", po_no: "", po_date: "",
  solution: "", inquiry_qty: "", po_qty: "", unit_price: "", total_price: "",
  cell_used: "", cells_per_rack: "", total_cells_required: "",
  po_uploaded_by: "", expected_completion_date: "", remarks: "",
  rounded_off_price: "", price_lost_roundoff: "", terms_and_conditions: "",
};

const EMPTY_DISPATCH = { dispatch_date: "", dispatch_code: "", dispatch_qty: "" };

const EMPTY_EDIT: Omit<PORow, "id" | "sr_no"> = {
  inquiry_code: "", customer_name: "", project_name: "", po_no: "", po_date: "",
  solution: "", inquiry_qty: "", po_qty: "", unit_price: "", total_price: "",
  total_qty: "", balance_qty: "", total_dispatch_qty: "", total_pending_qty: "",
  cell_used: "", cells_per_rack: "", total_cells_required: "",
  remarks: "", po_uploaded_by: "", completion_date: "", expected_completion_date: "", days_to_complete: "",
  document_filename: "", rounded_off_price: "", price_lost_roundoff: "", terms_and_conditions: "",
};

const DATE_COLS = new Set(["po_date", "dispatch_date", "completion_date", "expected_completion_date"]);

const COLS: { key: string; label: string; w: number; filterType?: "text" | "select" | "date"; sortable?: boolean }[] = [
  { key: "sr_no",                label: "Sr No",                   w: 60  },
  { key: "inquiry_code",         label: "Inquiry Code",             w: 130, filterType: "text",  sortable: true },
  { key: "customer_name",        label: "Customer Name",            w: 150, filterType: "text",  sortable: true },
  { key: "project_name",         label: "Project / End Customer",   w: 180, filterType: "text",  sortable: true },
  { key: "po_no",                label: "PO No.",                   w: 120, filterType: "text",  sortable: true },
  { key: "po_date",              label: "PO Date",                  w: 100, filterType: "date",  sortable: true },
  { key: "solution",             label: "Solution",                 w: 110, filterType: "text" },
  { key: "inquiry_qty",          label: "Inquiry Qty",              w: 90  },
  { key: "po_qty",               label: "PO Qty",                   w: 80  },
  { key: "unordered_qty",        label: "Unordered Qty",            w: 110 },
  { key: "unit_price",           label: "Unit Price (GST Extra)",   w: 140 },
  { key: "rounded_off_price",    label: "Rounded Off Price",        w: 140 },
  { key: "price_lost_roundoff",  label: "Price Lost (Roundoff)",    w: 140 },
  { key: "total_price",          label: "Total Price (GST Extra)",  w: 150 },
  { key: "total_dispatch_qty",   label: "Total Dispatched",         w: 120 },
  { key: "balance_qty",          label: "Balance Qty",              w: 100 },
  { key: "cell_used",            label: "Cell Used",                w: 110, filterType: "text" },
  { key: "cells_per_rack",       label: "Cells per Pack",           w: 120 },
  { key: "total_cells_required", label: "Total Cells Required",     w: 140 },
  { key: "remarks",              label: "Remarks",                  w: 200 },
  { key: "terms_and_conditions", label: "Terms & Conditions",       w: 200 },
  { key: "po_uploaded_by",       label: "PO Uploaded By",           w: 130 },
  { key: "completion_date",          label: "Completion Date",          w: 120 },
  { key: "expected_completion_date", label: "Expected Completion",      w: 140, filterType: "date", sortable: true },
  { key: "days_late",                label: "Days Left",                w: 90  },
];

const PO_FIELDS: { key: keyof typeof EMPTY_PO; label: string; type?: string; span?: boolean; readonly?: boolean }[] = [
  { key: "inquiry_code",         label: "Inquiry Code", readonly: true },
  { key: "customer_name",        label: "Customer Name",          span: true },
  { key: "project_name",         label: "Project / End Customer", span: true },
  { key: "po_no",                label: "PO No." },
  { key: "po_date",              label: "PO Date",            type: "date" },
  { key: "solution",             label: "Solution" },
  { key: "inquiry_qty",          label: "Inquiry Qty", readonly: true },
  { key: "po_qty",               label: "PO Qty" },
  { key: "unit_price",               label: "Unit Price (GST Extra)",  readonly: true, currency: true },
  { key: "cell_used",                label: "Cell Used" },
  { key: "cells_per_rack",           label: "Cells per Pack" },
  { key: "expected_completion_date", label: "Expected Completion Date", type: "date" },
  { key: "remarks",                  label: "Remarks", span: true },
];

const ALL_EDIT_FIELDS: { key: keyof typeof EMPTY_EDIT; label: string; type?: string; span?: boolean }[] = [
  { key: "inquiry_code",         label: "Inquiry Code", readonly: true },
  { key: "customer_name",        label: "Customer Name",          span: true },
  { key: "project_name",         label: "Project / End Customer", span: true },
  { key: "po_no",                label: "PO No." },
  { key: "po_date",              label: "PO Date",            type: "date" },
  { key: "solution",             label: "Solution" },
  { key: "inquiry_qty",          label: "Inquiry Qty", readonly: true },
  { key: "po_qty",               label: "PO Qty" },
  { key: "unit_price",           label: "Unit Price (GST Extra)", readonly: true, currency: true },
  { key: "cell_used",            label: "Cell Used" },
  { key: "cells_per_rack",       label: "Cells per Pack" },
  { key: "completion_date",          label: "Completion Date",         type: "date" },
  { key: "expected_completion_date", label: "Expected Completion Date", type: "date" },
  { key: "rounded_off_price",        label: "Rounded Off Price" },
  { key: "price_lost_roundoff",      label: "Price Lost (Roundoff)", readonly: true },
  { key: "remarks",                  label: "Remarks",            span: true },
  { key: "terms_and_conditions",     label: "Terms & Conditions", span: true },
];

function FieldGrid<T extends Record<string, string>>({
  fields, form, setForm, chipSlots,
}: {
  fields: { key: keyof T & string; label: string; type?: string; span?: boolean; readonly?: boolean; currency?: boolean }[];
  form: T;
  setForm: React.Dispatch<React.SetStateAction<T>>;
  chipSlots?: Partial<Record<string, React.ReactNode>>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 py-2">
      {fields.map(({ key, label, type, span, readonly: ro, currency }) => (
        <div key={key} className={cn("flex flex-col gap-1", span && "col-span-2")}>
          <Label className="text-xs">{label}</Label>
          {chipSlots?.[key] && <div className="flex flex-wrap gap-1.5 mb-0.5">{chipSlots[key]}</div>}
          {ro ? (
            <div className="h-8 flex items-center px-3 rounded-md border bg-muted text-xs text-muted-foreground select-all">
              {form[key] ? (currency ? `₹${parseFloat(form[key]).toLocaleString("en-IN")}` : form[key]) : "—"}
            </div>
          ) : key === "remarks" ? (
            <textarea
              rows={2}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="rounded-md border px-3 py-1.5 text-xs bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <Input
              type={type ?? "text"}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="h-8 text-xs"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function POTrackingPage() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.get("/api/auth/me").then(r => r.data), staleTime: Infinity });
  const isExpert = me?.role === "e";

  // linked inquiry for upload dialog (PO page "Link to Inquiry" flow)
  const [linkedInquiryCode, setLinkedInquiryCode] = useState("");
  const [uploadChips, setUploadChips] = useState<{ key: string; label: string; price: number; active: boolean }[]>([]);

  const buildUploadChips = (inq: any) => {
    const chips: { key: string; label: string; price: number; active: boolean }[] = [];
    const qty = parseFloat(inq.qty_system) || 1;
    const push = (key: string, label: string, price: number) => {
      if (price) chips.push({ key, label, price, active: true });
    };
    push("system", "System",           parseFloat(inq.rate_system) || 0);
    push("rack1",  "Rack 1 (Modular)", (parseFloat(inq.rack1_price) || 0) / qty);
    push("rack2",  "Rack 2 (Modular)", (parseFloat(inq.rack2_price) || 0) / qty);
    for (let i = 1; i <= 5; i++) {
      push(`cc${i}`, inq[`cc${i}_desc`] || `CC${i}`, parseFloat(inq[`cc${i}_price`]) || 0);
    }
    return chips;
  };

  const uploadChipsTotal = (chips: typeof uploadChips) =>
    chips.filter(c => c.active).reduce((s, c) => s + c.price, 0);

  const buildUploadRemarks = (chips: typeof uploadChips) => {
    const inactive = chips.filter(c => !c.active);
    if (inactive.length === 0) return "All quoted prices included";
    return inactive.map(c => `${c.label} (₹${c.price.toLocaleString("en-IN")})`).join(", ") + " quoted but not included";
  };

  const toggleUploadChip = (key: string) => {
    setUploadChips(prev => {
      const next = prev.map(c => c.key === key ? { ...c, active: !c.active } : c);
      const unit = uploadChipsTotal(next);
      setPoForm(f => {
        const qty = parseFloat(f.po_qty || "0");
        const rop = parseFloat(f.rounded_off_price || "0");
        return {
          ...f,
          unit_price:          unit ? String(unit) : "",
          total_price:         qty && unit ? String(qty * unit) : "",
          remarks:             buildUploadRemarks(next),
          price_lost_roundoff: unit && rop ? String(+(unit - rop).toFixed(2)) : "",
        };
      });
      return next;
    });
  };

  const { data: inquiryRows = [] } = useQuery<any[]>({
    queryKey: ["inquiry-global"],
    queryFn: () => api.get("/api/inquiry").then(r => r.data),
  });

  // dialog states
  const [uploadOpen, setUploadOpen]     = useState(false);
  const [editRow, setEditRow]           = useState<PORow | null>(null);
  const [editOpen, setEditOpen]         = useState(false);
  const [dispatchRow, setDispatchRow]   = useState<PORow | null>(null); // dispatch history dialog
  const [createDispOpen, setCreateDispOpen] = useState(false);          // top-level create dispatch (pick PO first)
  const [dispatchTarget, setDispatchTarget] = useState<number | "">("");

  // form states
  const [poForm, setPoForm]             = useState<typeof EMPTY_PO>({ ...EMPTY_PO });
  const [editForm, setEditForm]         = useState<typeof EMPTY_EDIT>({ ...EMPTY_EDIT });
  const [appendRemarks, setAppendRemarks] = useState("");
  const [dispForm, setDispForm]         = useState<typeof EMPTY_DISPATCH>({ ...EMPTY_DISPATCH });
  const [poDocFile, setPoDocFile]       = useState<File | null>(null);


  const { data: rows = [], isLoading } = useQuery<PORow[]>({
    queryKey: ["po-tracking"],
    queryFn: () => api.get("/api/po").then(r => r.data),
  });

  const { data: dispatches = [] } = useQuery<Dispatch[]>({
    queryKey: ["po-dispatches", dispatchRow?.id ?? dispatchTarget],
    queryFn: () => {
      const id = dispatchRow?.id ?? (dispatchTarget ? Number(dispatchTarget) : null);
      return id ? api.get(`/api/po/${id}/dispatches`).then(r => r.data) : Promise.resolve([]);
    },
    enabled: !!(dispatchRow?.id || dispatchTarget),
  });

  const invalidate = (poId?: number) => {
    qc.invalidateQueries({ queryKey: ["po-tracking"] });
    if (poId) qc.invalidateQueries({ queryKey: ["po-dispatches", poId] });
  };

  const createPOMut = useMutation({
    mutationFn: (data: typeof EMPTY_PO) => api.post("/api/po", data).then(r => r.data),
    onSuccess: async (res: { id: number }) => {
      if (poDocFile) {
        try {
          const fd = new FormData();
          fd.append("file", poDocFile);
          await api.post(`/api/po/${res.id}/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        } catch { toast.error("PO created but document upload failed"); }
      }
      toast.success("PO uploaded");
      setUploadOpen(false);
      setPoForm({ ...EMPTY_PO });
      setLinkedInquiryCode("");
      setUploadChips([]);
      setPoDocFile(null);
      invalidate();
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const updatePOMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof EMPTY_EDIT }) => api.patch(`/api/po/${id}`, data),
    onSuccess: () => { toast.success("Updated"); setEditOpen(false); setEditRow(null); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const deletePOMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/po/${id}`),
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const addDispatchMut = useMutation({
    mutationFn: ({ poId, data }: { poId: number; data: typeof EMPTY_DISPATCH }) =>
      api.post(`/api/po/${poId}/dispatches`, data).then(r => r.data),
    onSuccess: (totals, { poId }) => {
      toast.success("Dispatch added");
      setDispForm({ ...EMPTY_DISPATCH });
      invalidate(poId);
      if (dispatchRow?.id === poId) {
        setDispatchRow(r => r ? { ...r, balance_qty: String(totals.balance_qty), total_dispatch_qty: String(totals.total_dispatch_qty) } : r);
      }
      if (Number(totals.balance_qty) <= 0) {
        const today = new Date().toISOString().slice(0, 10);
        const po = rows.find(r => r.id === poId);
        markCompleteMut.mutate({ poId, completionDate: today, poDate: po?.po_date || "" });
      }
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const deleteDispatchMut = useMutation({
    mutationFn: ({ poId, dispId }: { poId: number; dispId: number }) =>
      api.delete(`/api/po/${poId}/dispatches/${dispId}`).then(r => r.data),
    onSuccess: (totals, { poId }) => {
      invalidate(poId);
      if (dispatchRow?.id === poId) {
        setDispatchRow(r => r ? { ...r, balance_qty: String(totals.balance_qty), total_dispatch_qty: String(totals.total_dispatch_qty) } : r);
      }
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const markCompleteMut = useMutation({
    mutationFn: ({ poId, completionDate, poDate }: { poId: number; completionDate: string; poDate: string }) => {
      const days = poDate && completionDate
        ? Math.max(0, Math.round((new Date(completionDate).getTime() - new Date(poDate).getTime()) / 86400000))
        : "";
      return api.patch(`/api/po/${poId}`, { completion_date: completionDate, days_to_complete: String(days) } as any);
    },
    onSuccess: (_, { poId }) => { toast.success("PO marked complete"); invalidate(poId); },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const openEdit = (row: PORow) => {
    const { id, sr_no, ...rest } = row;
    setEditForm({ ...EMPTY_EDIT, ...rest });
    setAppendRemarks("");
    setEditRow(row);
    setEditOpen(true);
  };

  const openDispatch = (row: PORow) => {
    setDispatchRow(row);
    setDispForm({ ...EMPTY_DISPATCH });
  };

  // compute running balance for dispatch sub-table
  const activePoQty = dispatchRow ? parseFloat(dispatchRow.po_qty || "0") : 0;
  let runningDispatched = 0;
  const dispatchesWithBalance = dispatches.map(d => {
    runningDispatched += d.dispatch_qty;
    return { ...d, running_balance: activePoQty - runningDispatched };
  });

  const effectivePoId = dispatchRow?.id ?? (dispatchTarget ? Number(dispatchTarget) : null);

  const fmt = (v: any, isDate = false) => {
    if (v === "" || v === null || v === undefined) return "—";
    return isDate ? fmtDate(String(v)) : v;
  };

  const [poTab, setPoTab] = useState<"active" | "completed">("active");
  const activeRows    = useMemo(() => rows.filter(r => !r.completion_date), [rows]);
  const completedRows = useMemo(() => rows.filter(r => !!r.completion_date).sort((a, b) => {
    const ta = new Date(a.completion_date).getTime();
    const tb = new Date(b.completion_date).getTime();
    return ta - tb;
  }), [rows]);
  const visibleRows = poTab === "active" ? activeRows : completedRows;

  const PO_SEARCH_KEYS = useMemo(() => [
    "inquiry_code", "customer_name", "project_name", "po_no", "solution", "cell_used",
  ] as const, []);

  const { filtered: filteredVisible, values: filterValues, globalSearch, setField, clear, activeCount } =
    useTableFilter(visibleRows, PO_SEARCH_KEYS as any);

  const [sort, setSort] = useState<SortState | null>(null);

  const sortedVisible = useMemo(() => {
    const byCode = (a: PORow, b: PORow) =>
      String(a.inquiry_code ?? "").toLowerCase().localeCompare(
        String(b.inquiry_code ?? "").toLowerCase()
      );

    return [...filteredVisible].sort((a, b) => {
      if (!sort) return byCode(a, b);
      const va = String(a[sort.key as keyof PORow] ?? "").toLowerCase();
      const vb = String(b[sort.key as keyof PORow] ?? "").toLowerCase();
      const cmp = sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return cmp !== 0 ? cmp : byCode(a, b);
    });
  }, [filteredVisible, sort]);

  return (
    <div className="p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">PO Tracking</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setPoForm({ ...EMPTY_PO }); setLinkedInquiryCode(""); setUploadOpen(true); }} className="gap-1.5 h-8 text-xs">
            <Upload size={13} /> Upload PO
          </Button>
          <Button size="sm" onClick={() => { setDispForm({ ...EMPTY_DISPATCH }); setDispatchTarget(""); setCreateDispOpen(true); }} className="gap-1.5 h-8 text-xs">
            <Truck size={13} /> Create Dispatch
          </Button>
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b">
        {(["active", "completed"] as const).map(t => (
          <button
            key={t}
            onClick={() => setPoTab(t)}
            className={cn(
              "px-4 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors capitalize",
              poTab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "active" ? `Active (${activeRows.length})` : `Completed (${completedRows.length})`}
          </button>
        ))}
      </div>

      {/* filter bar */}
      <FilterBar
        values={filterValues}
        onField={setField}
        onClear={clear}
        globalSearch={globalSearch}
        globalPlaceholder="Search PO no, customer, project, inquiry code…"
        activeCount={activeCount}
      />

      {/* main table */}
      <div className="overflow-auto rounded-md border flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="animate-spin h-5 w-5 mr-2" /> Loading…
          </div>
        ) : filteredVisible.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {visibleRows.length > 0 ? "No results match your filters." : poTab === "active" ? "No active POs." : "No completed POs yet."}
          </div>
        ) : (
          <table className="text-xs min-w-max w-full">
            <thead className="bg-muted/60 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2 border-b w-8" />
                {COLS.map(c => (
                  <th key={c.key} style={{ minWidth: c.w }} className="px-2 py-2 text-left font-semibold whitespace-nowrap border-b">
                    {c.sortable ? (
                      <span className="inline-flex items-center gap-0.5">
                        {c.label}
                        <SortButtons colKey={c.key} sort={sort} onSort={setSort} />
                      </span>
                    ) : c.label}
                  </th>
                ))}
                <th className="px-2 py-2 border-b w-16" />
              </tr>
              <FilterRow
                cols={COLS as any}
                values={filterValues}
                onField={setField}
                prefixCells={[{ width: 32 }]}
                suffixCells={[{ width: 64 }]}
              />
            </thead>
            <tbody>
              {sortedVisible.map((row, i) => {
                let rowCls = i % 2 !== 0 ? "bg-muted/10" : "";
                if (row.completion_date && row.expected_completion_date) {
                  const days = Math.round((new Date(row.completion_date).getTime() - new Date(row.expected_completion_date).getTime()) / 86400000);
                  rowCls = days < 0 ? "bg-green-50 dark:bg-green-950/30" : days === 0 ? "bg-yellow-50 dark:bg-yellow-950/30" : "bg-orange-50 dark:bg-orange-950/30";
                } else if (row.completion_date) {
                  rowCls = "bg-green-50 dark:bg-green-950/30";
                }
                return (
                <tr key={row.id} className={cn("border-b hover:brightness-95 transition-colors cursor-pointer", rowCls)}>
                  {/* expand / dispatch button */}
                  <td className="px-2 py-1.5">
                    <button
                      title="View dispatches"
                      onClick={() => openDispatch(row)}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </td>
                  {COLS.map(c => {
                    if (c.key === "days_late") {
                    const exp = (row as any).expected_completion_date;
                    if (!exp) return <td key={c.key} className="px-2 py-1.5 whitespace-nowrap">—</td>;
                    const expMs = new Date(exp).getTime();
                    const completionDate = (row as any).completion_date;
                    if (completionDate) {
                      // completed — track against expected
                      const days = Math.round((new Date(completionDate).getTime() - expMs) / 86400000);
                      const cls = days === 0 ? "text-yellow-500" : days > 0 ? "text-red-500" : "text-green-600";
                      const label = days === 0 ? "On time" : days > 0 ? `+${days} late` : `${Math.abs(days)} early`;
                      return <td key={c.key} className={cn("px-2 py-1.5 whitespace-nowrap font-semibold", cls)}>{label}</td>;
                    } else {
                      // not completed — days remaining (positive = ahead, negative = overdue)
                      const days = Math.round((expMs - Date.now()) / 86400000);
                      const cls = days > 0 ? "text-green-600" : days < 0 ? "text-red-500" : "text-yellow-500";
                      const label = days > 0 ? `+${days}` : days < 0 ? `${days}` : "0";
                      return <td key={c.key} className={cn("px-2 py-1.5 whitespace-nowrap font-semibold", cls)}>{label}</td>;
                    }
                  }
                  if (c.key === "unordered_qty") {
                      const iq = parseFloat((row as any).inquiry_qty || "0");
                      const pq = parseFloat((row as any).po_qty || "0");
                      if (!iq && !pq) return <td key={c.key} className="px-2 py-1.5 whitespace-nowrap">—</td>;
                      const uq = iq - pq;
                      return (
                        <td key={c.key} className={cn("px-2 py-1.5 whitespace-nowrap font-semibold",
                          uq < 0 ? "text-green-600" : uq > 0 ? "text-red-500" : ""
                        )}>
                          {uq}
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} className={cn("px-2 py-1.5 whitespace-nowrap",
                        c.key === "balance_qty" && row.completion_date ? "text-green-600 font-semibold" : ""
                      )}>
                        {c.key === "sr_no" ? i + 1 : fmt((row as any)[c.key], DATE_COLS.has(c.key))}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      {row.document_filename && (
                        <button
                          title="Download PO Document"
                          onClick={(e) => {
                            e.stopPropagation();
                            api.get(`/api/po/${row.id}/download`, { responseType: "blob" }).then(res => {
                              const cd = res.headers["content-disposition"] || "";
                              const match = cd.match(/filename="?([^"]+)"?/);
                              const name = match?.[1] || "po_document";
                              const url = window.URL.createObjectURL(new Blob([res.data]));
                              const a = document.createElement("a");
                              a.href = url; a.download = name; a.click();
                              window.URL.revokeObjectURL(url);
                            }).catch(() => toast.error("Download failed"));
                          }}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Download size={13} />
                        </button>
                      )}
                      {isExpert && (<>
                        <button title="Edit" onClick={(e) => { e.stopPropagation(); openEdit(row); }} className="text-muted-foreground hover:text-primary transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button title="Delete" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete PO #${row.sr_no}?`)) deletePOMut.mutate(row.id); }} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </>)}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Upload PO dialog */}
      <Dialog open={uploadOpen} onOpenChange={o => { if (!o) { setUploadOpen(false); setLinkedInquiryCode(""); setUploadChips([]); setPoDocFile(null); setPoForm({ ...EMPTY_PO }); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Upload PO</DialogTitle></DialogHeader>

          {/* Link to inquiry dropdown */}
          <div className="flex flex-col gap-1 pb-2 border-b mb-1">
            <Label className="text-xs">Link to Inquiry <span className="text-muted-foreground">(optional — auto-fills fields)</span></Label>
            <select
              className="h-8 rounded-md border px-3 text-xs bg-background"
              value={linkedInquiryCode}
              onChange={e => {
                const code = e.target.value;
                setLinkedInquiryCode(code);
                if (code) {
                  const inq = inquiryRows.find((r: any) => r.inquiry_code === code);
                  if (inq) {
                    const chips = buildUploadChips(inq);
                    setUploadChips(chips);
                    const total = uploadChipsTotal(chips);
                    setPoForm(prev => ({
                      ...prev,
                      inquiry_code:  inq.inquiry_code       || prev.inquiry_code,
                      customer_name: inq.solution_provider  || prev.customer_name,
                      project_name:  inq.project_customer   || prev.project_name,
                      solution:      inq.part_code          || prev.solution,
                      inquiry_qty:   String(inq.qty_system  ?? prev.inquiry_qty),
                      unit_price:    total ? String(total) : prev.unit_price,
                      total_price:   (() => { const q = parseFloat(prev.po_qty || "0"); return q && total ? String(q * total) : prev.total_price; })(),
                      remarks:       chips.length ? buildUploadRemarks(chips) : prev.remarks,
                    }));
                  }
                } else {
                  setUploadChips([]);
                }
              }}
            >
              <option value="">— Select an inquiry —</option>
              {inquiryRows.map((r: any) => (
                <option key={r._id ?? r.inquiry_code} value={r.inquiry_code}>
                  {r.inquiry_code} · {r.project_customer || r.solution_provider || ""}{r.part_code ? ` · ${r.part_code}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Fields */}
          <div className="grid grid-cols-2 gap-3 py-2">
            {([
              { key: "inquiry_code",             label: "Inquiry Code",                    readonly: true },
              { key: "customer_name",             label: "Customer Name" },
              { key: "project_name",              label: "Project / End Customer",          span: true },
              { key: "solution",                  label: "Solution (Part Code)",            span: true },
              { key: "inquiry_qty",               label: "Inquiry Qty",                     readonly: true },
              { key: "po_qty",                    label: "PO Qty" },
              { key: "unit_price",                label: "Unit Price (GST Extra)",          special: "unit_price" },
              { key: "rounded_off_price",         label: "Rounded Off Price",               special: "rounded_off" },
              { key: "po_no",                     label: "PO No." },
              { key: "po_date",                   label: "PO Date",          type: "date" },
              { key: "cell_used",                 label: "Cell Used" },
              { key: "cells_per_rack",            label: "Cells per Pack" },
              { key: "expected_completion_date",  label: "Expected Completion Date", type: "date", span: true },
              { key: "remarks",                   label: "Remarks",                         span: true, textarea: true },
              { key: "terms_and_conditions",      label: "Terms & Conditions",              span: true, textarea: true },
            ] as { key: keyof typeof poForm; label: string; type?: string; span?: boolean; textarea?: boolean; readonly?: boolean; special?: string }[]).map(f => (
              <div key={f.key} className={cn("flex flex-col gap-1", f.span && "col-span-2")}>
                <Label className="text-xs">{f.label}</Label>

                {f.special === "unit_price" ? (<>
                  {uploadChips.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-0.5">
                      {uploadChips.map(chip => (
                        <button key={chip.key} type="button" onClick={() => toggleUploadChip(chip.key)}
                          className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors",
                            chip.active ? "bg-primary/10 border-primary/40 text-primary" : "bg-muted border-muted text-muted-foreground line-through")}>
                          {chip.label}: ₹{chip.price.toLocaleString("en-IN")}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="h-8 flex items-center px-3 rounded-md border bg-muted text-xs text-muted-foreground select-all">
                    {poForm.unit_price ? `₹${parseFloat(poForm.unit_price).toLocaleString("en-IN")}` : "—"}
                  </div>
                </>) : f.special === "rounded_off" ? (<>
                  <Input
                    type="number"
                    value={poForm.rounded_off_price}
                    placeholder="e.g. 10000"
                    onChange={e => {
                      const val = e.target.value;
                      setPoForm(prev => {
                        const unit = parseFloat(prev.unit_price || "0");
                        const rop  = parseFloat(val || "0");
                        return { ...prev, rounded_off_price: val, price_lost_roundoff: unit && rop ? String(+(unit - rop).toFixed(2)) : "" };
                      });
                    }}
                    className="h-8 text-xs"
                  />
                  {poForm.price_lost_roundoff && (
                    <p className="text-[11px] text-muted-foreground">
                      Price lost: <span className="font-medium text-foreground">₹{parseFloat(poForm.price_lost_roundoff).toLocaleString("en-IN")}</span>
                    </p>
                  )}
                </>) : f.textarea ? (
                  <textarea rows={2} value={poForm[f.key]}
                    onChange={e => setPoForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="rounded-md border px-3 py-1.5 text-xs bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring" />
                ) : f.readonly ? (
                  <div className="h-8 flex items-center px-3 rounded-md border bg-muted text-xs text-muted-foreground select-all">
                    {poForm[f.key] || "—"}
                  </div>
                ) : (
                  <Input type={f.type ?? "text"} value={poForm[f.key]}
                    onChange={e => {
                      const val = e.target.value;
                      setPoForm(prev => {
                        const next = { ...prev, [f.key]: val };
                        const qty  = parseFloat(f.key === "po_qty"         ? val : next.po_qty || "0");
                        const unit = parseFloat(next.unit_price || "0");
                        const cpr  = parseFloat(f.key === "cells_per_rack" ? val : next.cells_per_rack || "0");
                        return {
                          ...next,
                          total_price:          qty && unit ? String(qty * unit) : next.total_price,
                          total_cells_required: qty && cpr  ? String(qty * cpr)  : next.total_cells_required,
                        } as any;
                      });
                    }}
                    className="h-8 text-xs" />
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
            <Button variant="ghost" onClick={() => { setUploadOpen(false); setPoDocFile(null); }}>Cancel</Button>
            <Button onClick={() => createPOMut.mutate(poForm)} disabled={createPOMut.isPending}>
              {createPOMut.isPending ? "Uploading…" : "Upload PO"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch history dialog (opened by clicking a row) */}
      <Dialog open={!!dispatchRow} onOpenChange={o => { if (!o) { setDispatchRow(null); setDispForm({ ...EMPTY_DISPATCH }); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Dispatches — {dispatchRow?.customer_name} · {dispatchRow?.po_no || "No PO No."}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              PO Qty: <strong>{dispatchRow?.po_qty || "—"}</strong> &nbsp;·&nbsp;
              Dispatched: <strong>{dispatchRow?.total_dispatch_qty || "0"}</strong> &nbsp;·&nbsp;
              Balance: <strong>{dispatchRow?.balance_qty || dispatchRow?.po_qty || "—"}</strong>
            </p>
          </DialogHeader>

          {/* sub-table */}
          {dispatchesWithBalance.length > 0 ? (
            <div className="overflow-auto rounded-md border mt-1">
              <table className="text-xs min-w-full">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold border-b">Dispatch Date</th>
                    <th className="px-3 py-2 text-left font-semibold border-b">Dispatch Code</th>
                    <th className="px-3 py-2 text-left font-semibold border-b">Dispatch Qty</th>
                    <th className="px-3 py-2 text-left font-semibold border-b">Balance After</th>
                    {isExpert && <th className="px-3 py-2 border-b w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {dispatchesWithBalance.map(d => (
                    <tr key={d.id} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-1.5">{fmtDate(d.dispatch_date)}</td>
                      <td className="px-3 py-1.5">{d.dispatch_code || "—"}</td>
                      <td className="px-3 py-1.5">{d.dispatch_qty}</td>
                      <td className={cn("px-3 py-1.5 font-semibold", d.running_balance <= 0 ? "text-green-600" : "")}>
                        {d.running_balance}
                      </td>
                      {isExpert && (
                        <td className="px-3 py-1.5">
                          <button
                            onClick={() => dispatchRow && deleteDispatchMut.mutate({ poId: dispatchRow.id, dispId: d.id })}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">No dispatches yet.</p>
          )}

          {/* add dispatch form — hidden when balance is 0 */}
          {parseFloat(dispatchRow?.balance_qty || dispatchRow?.po_qty || "0") <= 0 ? (
            <p className="text-xs text-green-600 font-semibold text-center py-2">All quantity dispatched — PO complete.</p>
          ) : null}
          <div className={parseFloat(dispatchRow?.balance_qty || dispatchRow?.po_qty || "0") <= 0 ? "hidden" : "border-t pt-3 mt-2"}>
            <p className="text-xs font-semibold mb-2">Add Dispatch</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Dispatch Date</Label>
                <Input type="date" value={dispForm.dispatch_date} onChange={e => setDispForm(f => ({ ...f, dispatch_date: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Dispatch Code <span className="text-muted-foreground">(optional)</span></Label>
                <Input value={dispForm.dispatch_code} onChange={e => setDispForm(f => ({ ...f, dispatch_code: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Dispatch Qty</Label>
                <Input type="number" value={dispForm.dispatch_qty} onChange={e => setDispForm(f => ({ ...f, dispatch_qty: e.target.value }))} className="h-8 text-xs" />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="ghost" onClick={() => { setDispatchRow(null); setDispForm({ ...EMPTY_DISPATCH }); }}>Close</Button>
            <Button
              onClick={() => {
                if (!dispatchRow) return;
                const bal = parseFloat(dispatchRow.balance_qty || dispatchRow.po_qty || "0");
                const qty = parseFloat(dispForm.dispatch_qty || "0");
                if (qty > bal) { toast.error(`Only ${bal} quantity remaining`); return; }
                addDispatchMut.mutate({ poId: dispatchRow.id, data: dispForm });
              }}
              disabled={addDispatchMut.isPending || !dispForm.dispatch_qty}
            >
              {addDispatchMut.isPending ? "Saving…" : "Add Dispatch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Dispatch — top button flow (select PO first) */}
      <Dialog open={createDispOpen} onOpenChange={o => { if (!o) { setCreateDispOpen(false); setDispatchTarget(""); setDispForm({ ...EMPTY_DISPATCH }); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Create Dispatch</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-1 pt-1">
            <Label className="text-xs">Select PO</Label>
            <select
              className="h-8 rounded-md border px-3 text-xs bg-background"
              value={dispatchTarget}
              onChange={e => setDispatchTarget(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">— Select a PO —</option>
              {rows.filter(r => parseFloat(r.balance_qty || r.po_qty || "0") > 0).map(r => (
                <option key={r.id} value={r.id}>
                  #{r.sr_no} · {r.customer_name} · {r.po_no || "No PO No."} (bal: {r.balance_qty || r.po_qty || "?"})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Dispatch Date</Label>
              <Input type="date" value={dispForm.dispatch_date} onChange={e => setDispForm(f => ({ ...f, dispatch_date: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Dispatch Code <span className="text-muted-foreground">(optional)</span></Label>
              <Input value={dispForm.dispatch_code} onChange={e => setDispForm(f => ({ ...f, dispatch_code: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Dispatch Qty</Label>
              <Input type="number" value={dispForm.dispatch_qty} onChange={e => setDispForm(f => ({ ...f, dispatch_qty: e.target.value }))} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="ghost" onClick={() => { setCreateDispOpen(false); setDispatchTarget(""); setDispForm({ ...EMPTY_DISPATCH }); }}>Cancel</Button>
            <Button
              disabled={!dispatchTarget || !dispForm.dispatch_qty || addDispatchMut.isPending}
              onClick={() => {
                if (!dispatchTarget) return;
                const po = rows.find(r => r.id === Number(dispatchTarget));
                const bal = parseFloat(po?.balance_qty || po?.po_qty || "0");
                const qty = parseFloat(dispForm.dispatch_qty || "0");
                if (qty > bal) { toast.error(`Only ${bal} quantity remaining`); return; }
                addDispatchMut.mutate({ poId: Number(dispatchTarget), data: dispForm }, {
                  onSuccess: () => { setCreateDispOpen(false); setDispatchTarget(""); setDispForm({ ...EMPTY_DISPATCH }); },
                });
              }}
            >
              {addDispatchMut.isPending ? "Saving…" : "Create Dispatch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (experts only) */}
      {isExpert && (
        <Dialog open={editOpen} onOpenChange={o => { if (!o) { setEditOpen(false); setEditRow(null); } }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit PO #{editRow?.sr_no}{editRow?.completion_date ? " — Completed" : ""}</DialogTitle>
            </DialogHeader>

            {editRow?.completion_date ? (
              /* completed PO — remarks-only append mode */
              <div className="flex flex-col gap-3 py-2">
                {editForm.remarks && (
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs">Existing Remarks</Label>
                    <div className="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
                      {editForm.remarks}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Add to Remarks</Label>
                  <textarea
                    rows={3}
                    value={appendRemarks}
                    onChange={e => setAppendRemarks(e.target.value)}
                    placeholder="Type additional remarks here…"
                    className="rounded-md border px-3 py-1.5 text-xs bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            ) : (
              /* active PO — full edit */
              <>
                <FieldGrid
                  fields={ALL_EDIT_FIELDS}
                  form={editForm}
                  setForm={(updater) => {
                    setEditForm(prev => {
                      const next = typeof updater === "function" ? updater(prev) : updater;
                      const qty = parseFloat(next.po_qty || "0");
                      const unit = parseFloat(next.unit_price || "0");
                      const cpr = parseFloat(next.cells_per_rack || "0");
                      return {
                        ...next,
                        total_price: qty && unit ? String(qty * unit) : next.total_price,
                        total_cells_required: qty && cpr ? String(qty * cpr) : next.total_cells_required,
                      };
                    });
                  }}
                />
                {(editForm.total_price || editForm.total_cells_required) && (
                  <div className="flex gap-4 text-xs text-muted-foreground -mt-1">
                    {editForm.total_price && <span>Total Price: <strong>₹{editForm.total_price}</strong></span>}
                    {editForm.total_cells_required && <span>Total Cells Required: <strong>{editForm.total_cells_required}</strong></span>}
                  </div>
                )}
              </>
            )}

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => { setEditOpen(false); setEditRow(null); }}>Cancel</Button>
              <Button
                onClick={() => {
                  if (!editRow) return;
                  if (editRow.completion_date) {
                    if (!appendRemarks.trim()) { setEditOpen(false); return; }
                    const combined = editForm.remarks
                      ? editForm.remarks + "\n" + appendRemarks.trim()
                      : appendRemarks.trim();
                    updatePOMut.mutate({ id: editRow.id, data: { ...editForm, remarks: combined } });
                  } else {
                    updatePOMut.mutate({ id: editRow.id, data: editForm });
                  }
                }}
                disabled={updatePOMut.isPending}
              >
                {updatePOMut.isPending ? "Saving…" : editRow?.completion_date ? "Append Remarks" : "Update"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
}
