"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { useMe } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Trash2, UserCheck, X, Loader2, CheckCircle2, History, Pencil } from "lucide-react";
import { cn, fmtDate } from "@/lib/utils";
import { getUsername } from "@/lib/api";
import { FilterBar } from "@/components/filter-bar";
import { FilterRow } from "@/components/filter-row";
import { useTableFilter } from "@/lib/use-table-filter";
import { SortButtons, type SortState } from "@/components/sort-buttons";

// ── types ─────────────────────────────────────────────────────────────────────

interface PendingRow {
  id: number;
  sr_no: number;
  inquiry_code: string;
  received_date: string;
  received_time: string;
  mail_for: string;
  oem_dealer: string;
  end_customer: string;
  kva_rating: string;
  quantity: string;
  backup_time: string;
  reply_to: string;
  assigned_to: string;
  status: string;
  remarks: string;
  priority: string;
  submission_date: string;
  submitted_to: string;
  submitted_by: string;
  created_by: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  semi_urgent: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  relaxed:     "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const PRIORITY_ROW: Record<string, string> = {
  urgent:      "bg-red-50/60 dark:bg-red-950/20",
  semi_urgent: "bg-orange-50/60 dark:bg-orange-950/20",
  relaxed:     "",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent", semi_urgent: "Semi Urgent", relaxed: "Relaxed",
};

const SIZING_KEYS = [
  "ups_make","ups_model","actual_load_kva","load_kw","power_factor",
  "inverter_efficiency","dc_voltage","backup_min","cell_chemistry",
  "ageing_pct","design_margin_pct","dod_margin_pct","derating_pct","capacity_ah",
];

interface UserEntry { username: string; role: string; }

const EMPTY: Omit<PendingRow, "id" | "sr_no" | "created_by"> = {
  inquiry_code: "", received_date: "", received_time: "", mail_for: "", oem_dealer: "",
  end_customer: "", kva_rating: "", quantity: "", backup_time: "",
  reply_to: "", assigned_to: "", status: "pending", remarks: "", priority: "relaxed",
  submission_date: "", submitted_to: "", submitted_by: "",
};

// ── column defs ───────────────────────────────────────────────────────────────

const EXPORT_CHIP: Record<string, string> = {
  Quote:     "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  Sizing:    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  Datasheet: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  GAD:       "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
};

type PendingFilterType = "text" | "select" | "date" | "time";
const COLS: { key: keyof PendingRow | "completed"; label: string; w: number; filterType?: PendingFilterType; filterOptions?: { value: string; label: string }[]; sortable?: boolean }[] = [
  { key: "inquiry_code",    label: "Inquiry Code",            w: 120, filterType: "text",   sortable: true },
  { key: "status",          label: "Status",                  w: 105, filterType: "select", filterOptions: [{ value: "pending", label: "Pending" }, { value: "completed", label: "Completed" }], sortable: true },
  { key: "priority",        label: "Priority",                w: 105, filterType: "select", filterOptions: [{ value: "urgent", label: "Urgent" }, { value: "semi_urgent", label: "Semi-Urgent" }, { value: "relaxed", label: "Relaxed" }], sortable: true },
  { key: "received_date",   label: "Received Date",           w: 115, filterType: "date" },
  { key: "received_time",   label: "Received Time",           w: 105, filterType: "time" },
  { key: "mail_for",        label: "Mail For",                w: 130, filterType: "text" },
  { key: "completed",       label: "Completed",               w: 220, sortable: true },
  { key: "oem_dealer",      label: "OEM / Dealer",            w: 150, filterType: "text" },
  { key: "end_customer",    label: "End Customer / Project",  w: 200, filterType: "text" },
  { key: "kva_rating",      label: "KVA Rating",              w: 90  },
  { key: "quantity",        label: "Qty",                     w: 60  },
  { key: "backup_time",     label: "Backup Time",             w: 105 },
  { key: "assigned_to",     label: "Assigned To",             w: 120, filterType: "select" },
  { key: "reply_to",        label: "Reply To Mail",           w: 170 },
  { key: "submission_date", label: "Submission Date",         w: 120, filterType: "date" },
  { key: "submitted_to",    label: "Submitted To",            w: 160, filterType: "text" },
  { key: "submitted_by",    label: "Submitted By",            w: 140, filterType: "select" },
  { key: "remarks",         label: "Remarks",                 w: 220, filterType: "text" },
];

const PENDING_SELECT_KEYS = new Set(["status", "priority", "assigned_to", "submitted_by"]);
const PRIORITY_ORDER: Record<string, number> = { urgent: 0, semi_urgent: 1, relaxed: 2 };

// ── shared chip helpers ───────────────────────────────────────────────────────

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
      {label}
      <button type="button" onClick={onRemove} className="hover:text-destructive transition-colors">
        <X size={10} />
      </button>
    </span>
  );
}

// ── MailForPicker ─────────────────────────────────────────────────────────────

const MAIL_FOR_OPTIONS = ["Datasheet", "GAD", "Quote", "Sizing"];
const MAIL_FOR_ORDER = ["Quote", "Sizing", "Datasheet", "GAD"];
const byChipOrder = (a: string, b: string) => MAIL_FOR_ORDER.indexOf(a) - MAIL_FOR_ORDER.indexOf(b);

function MailForPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tags = value ? value.split(", ").filter(Boolean) : [];

  const add = (opt: string) => {
    if (tags.includes(opt)) return;
    const next = [...tags, opt].sort((a, b) => MAIL_FOR_ORDER.indexOf(a) - MAIL_FOR_ORDER.indexOf(b));
    onChange(next.join(", "));
  };

  const remove = (opt: string) => {
    onChange(tags.filter((t) => t !== opt).join(", "));
  };

  const available = MAIL_FOR_OPTIONS.filter((o) => !tags.includes(o));

  return (
    <div className="flex flex-col gap-1.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => <Chip key={t} label={t} onRemove={() => remove(t)} />)}
        </div>
      )}
      {available.length > 0 && (
        <select
          className="h-8 rounded-md border px-3 text-xs bg-background"
          value=""
          onChange={(e) => { if (e.target.value) add(e.target.value); }}
        >
          <option value="">Add…</option>
          {available.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
    </div>
  );
}

// ── BackupTimePicker ──────────────────────────────────────────────────────────

function BackupTimePicker({ value, onChange, presets }: { value: string; onChange: (v: string) => void; presets: string[] }) {
  const [showCustom, setShowCustom] = useState(false);
  const [customVal, setCustomVal] = useState("");

  const tags = value ? value.split(", ").filter(Boolean) : [];

  const add = (tag: string) => {
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag].join(", "));
  };

  const remove = (tag: string) => {
    onChange(tags.filter((t) => t !== tag).join(", "));
  };

  const addCustom = () => {
    const n = customVal.trim().replace(/\D/g, "");
    if (!n) return;
    add(`${n}min`);
    setCustomVal("");
    setShowCustom(false);
  };

  const availablePresets = presets.filter((p) => !tags.includes(p));

  return (
    <div className="flex flex-col gap-1.5">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => <Chip key={t} label={t} onRemove={() => remove(t)} />)}
        </div>
      )}
      {!showCustom ? (
        <select
          className="h-8 rounded-md border px-3 text-xs bg-background"
          value=""
          onChange={(e) => {
            if (e.target.value === "__custom__") { setShowCustom(true); }
            else if (e.target.value) { add(e.target.value); }
          }}
        >
          <option value="">Add…</option>
          {availablePresets.map((p) => <option key={p} value={p}>{p}</option>)}
          <option value="__custom__">Custom…</option>
        </select>
      ) : (
        <div className="flex gap-1.5 items-center">
          <input
            type="number"
            min={1}
            autoFocus
            value={customVal}
            onChange={(e) => setCustomVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addCustom(); if (e.key === "Escape") { setShowCustom(false); setCustomVal(""); } }}
            placeholder="minutes"
            className="h-8 w-24 rounded-md border px-2 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="button"
            onClick={addCustom}
            className="h-8 px-2 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setShowCustom(false); setCustomVal(""); }}
            className="h-8 px-2 text-xs rounded-md border hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function PendingPage() {
  const qc = useQueryClient();
  const { isExpert } = useMe();
  const me = getUsername();

  const [tab, setTab] = useState<"global" | "mine" | "completed">("global");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<PendingRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [assignRow, setAssignRow] = useState<PendingRow | null>(null);
  const [assignUser, setAssignUser] = useState("");
  const [assignRemarks, setAssignRemarks] = useState("");
  const [completeDetailsRow, setCompleteDetailsRow] = useState<PendingRow | null>(null);
  const [completeDetails, setCompleteDetails] = useState({ submission_date: "", submitted_to: "", submitted_by: "", reply_to: "" });
  const [detailRow, setDetailRow] = useState<PendingRow | null>(null);
  const [historySource, setHistorySource] = useState<"mine" | "full">("mine");
  const [globalActionRow, setGlobalActionRow] = useState<PendingRow | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [sizingPickerExport, setSizingPickerExport] = useState<any | null>(null);
  const [sizingProject, setSizingProject] = useState("");
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [linkDialogRow, setLinkDialogRow] = useState<PendingRow | null>(null);
  const [linkDialogExports, setLinkDialogExports] = useState<any[]>([]);
  const [linkDialogAllExports, setLinkDialogAllExports] = useState<any[]>([]);
  const [linkSolMap, setLinkSolMap] = useState<Record<number, string>>({});
  const [linkSizingGroups, setLinkSizingGroups] = useState<{ fp: string; exports: any[] }[]>([]);
  const [linkSizingMap, setLinkSizingMap] = useState<Record<string, string>>({});

  // ── queries ────────────────────────────────────────────────────────────────

  const { data: globalRows = [], isLoading: loadingGlobal } = useQuery<PendingRow[]>({
    queryKey: ["pending-global"],
    queryFn: () => api.get("/api/pending").then((r) => r.data),
  });

  const { data: mineRows = [], isLoading: loadingMine } = useQuery<PendingRow[]>({
    queryKey: ["pending-mine"],
    queryFn: () => api.get("/api/pending/mine").then((r) => r.data),
  });

  const { data: users = [] } = useQuery<UserEntry[]>({
    queryKey: ["auth-users"],
    queryFn: () => api.get("/api/auth/users").then((r) => r.data),
  });

  const { data: durations = [] } = useQuery<string[]>({
    queryKey: ["costing-durations"],
    queryFn: () => api.get("/api/costing/durations").then((r) => r.data),
  });

  const { data: inquiryCodeHint } = useQuery<{ last: string; suggestion: string }>({
    queryKey: ["pending-next-inquiry-code"],
    queryFn: () => api.get("/api/pending/next-inquiry-code").then((r) => r.data),
    enabled: addOpen,
  });

  const { data: exportSummary = {} } = useQuery<Record<string, string[]>>({
    queryKey: ["pending-export-summary"],
    queryFn: () => api.get("/api/pending/export-summary").then((r) => r.data),
  });

  const detailCode = detailRow?.inquiry_code || String(detailRow?.sr_no ?? "");
  const { data: detailExports = [], isLoading: detailLoading } = useQuery<any[]>({
    queryKey: ["pending-exports", detailCode, historySource],
    queryFn: () =>
      historySource === "mine"
        ? api.get(`/api/pending/my-exports/${encodeURIComponent(detailCode)}`).then((r) => r.data)
        : api.get(`/api/pending/history/${encodeURIComponent(detailCode)}`).then((r) => r.data),
    enabled: !!detailRow,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: sizingProjects = [] } = useQuery<string[]>({
    queryKey: ["sizing-projects"],
    queryFn: () => api.get("/api/sizing/projects").then((r) => r.data.map((p: any) => p.name ?? p)),
    enabled: !!sizingPickerExport,
  });

  // ── download helpers ───────────────────────────────────────────────────────

  const doDownload = async (e: any) => {
    setRestoringId(e.id);
    try {
      const type: string = e.export_type;
      if (type === "datasheet") {
        const res = await api.get(`/api/datafiles/datasheets/files/${encodeURIComponent(e.datasheet_name)}`, { responseType: "blob" });
        _triggerDownload(res.data, e.datasheet_name);
      } else if (type === "gad") {
        const res = await api.get(`/api/datafiles/gads/files/${encodeURIComponent(e.gad_name)}`, { responseType: "blob" });
        _triggerDownload(res.data, e.gad_name);
      } else if (type === "quote_word" || type === "quote_pdf") {
        const fmt = type === "quote_word" ? "word" : "pdf";
        const ext = fmt === "word" ? "docx" : "pdf";
        const res = await api.get(`/api/quotation/quotes/${encodeURIComponent(e.quote_code)}/export/${fmt}`, { responseType: "blob" });
        _triggerDownload(res.data, `Quote_${e.quote_code}.${ext}`);
      } else if (type === "sizing_excel" || type === "sizing_pdf") {
        setSizingPickerExport(e);
        setSizingProject("");
      }
    } catch {
      toast.error("Download failed");
    } finally {
      setRestoringId(null);
    }
  };

  const doDownloadSizing = async () => {
    if (!sizingPickerExport || !sizingProject.trim()) return;
    const e = sizingPickerExport;
    const fmt = e.export_type === "sizing_excel" ? "excel" : "pdf";
    const ext = fmt === "excel" ? "xlsx" : "pdf";
    setRestoringId(e.id);
    try {
      const createRes = await api.post(`/api/sizing/projects/${encodeURIComponent(sizingProject)}/sizings`, {});
      const sr = createRes.data.sr_no;
      await api.put(`/api/sizing/projects/${encodeURIComponent(sizingProject)}/sizings/${sr}`, {
        ups_make: e.ups_make || "", ups_model: e.ups_model || "",
        ups_rating_kva: parseFloat(e.ups_kva) || 0,
        actual_load_kva: parseFloat(e.actual_load_kva) || 0,
        actual_load_kw: parseFloat(e.load_kw) || 0,
        power_factor: parseFloat(e.power_factor) || 0,
        inverter_efficiency: parseFloat(e.inverter_efficiency) || 0,
        nominal_dc_voltage: parseFloat(e.dc_voltage) || 0,
        backup_requirement_min: parseFloat(e.backup_min) || 0,
        ageing_percent: parseFloat(e.ageing_pct) || 0,
        design_margin_percent: parseFloat(e.design_margin_pct) || 0,
        dod_margin_percent: parseFloat(e.dod_margin_pct) || 0,
        derating_factor_percent: parseFloat(e.derating_pct) || 0,
        cell_chemistry: e.cell_chemistry || "LFP",
        nearest_capacity_ah: parseFloat(e.capacity_ah) || 0,
        ageing_type: e.ageing_type || "BOL",
        backup_time_min: parseFloat(e.backup_time_min) || 0,
      });
      const res = await api.get(
        `/api/sizing/projects/${encodeURIComponent(sizingProject)}/export/${fmt}?sr_no=${sr}`,
        { responseType: "blob" }
      );
      _triggerDownload(res.data, `${sizingProject}_restored.${ext}`);
      setSizingPickerExport(null);
      toast.success("Sizing downloaded");
    } catch {
      toast.error("Sizing download failed");
    } finally {
      setRestoringId(null);
    }
  };

  function _triggerDownload(data: any, filename: string) {
    const url = window.URL.createObjectURL(new Blob([data]));
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    window.URL.revokeObjectURL(url);
  }

  // ── derived data ───────────────────────────────────────────────────────────

  const workload = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of globalRows) {
      if (row.status !== "completed" && row.assigned_to) {
        counts[row.assigned_to] = (counts[row.assigned_to] || 0) + 1;
      }
    }
    return counts;
  }, [globalRows]);

  const sortedGlobal = useMemo(() =>
    [...globalRows].sort((a, b) => {
      if (a.status === "completed" && b.status !== "completed") return 1;
      if (a.status !== "completed" && b.status === "completed") return -1;
      return a.sr_no - b.sr_no;
    }),
    [globalRows]
  );

  const activeRows = useMemo(() => mineRows.filter((r) => r.status !== "completed"), [mineRows]);
  const completedMineRows = useMemo(() => mineRows.filter((r) => r.status === "completed"), [mineRows]);

  const globalRows_ = hideCompleted ? sortedGlobal.filter((r) => r.status !== "completed") : sortedGlobal;
  const rows = tab === "global" ? globalRows_ : tab === "mine" ? activeRows : completedMineRows;
  const isLoading = tab === "global" ? loadingGlobal : loadingMine;

  const pendingUserOptions = useMemo(
    () => users.map(u => ({ value: u.username, label: u.username })),
    [users],
  );

  const PENDING_SEARCH_KEYS = useMemo(() => [
    "inquiry_code", "mail_for", "end_customer", "oem_dealer",
    "assigned_to", "submitted_to", "submitted_by", "remarks",
  ] as const, []);

  const { filtered: filteredRows, values: filterValues, globalSearch, setField, clear, activeCount } =
    useTableFilter(rows, PENDING_SEARCH_KEYS as any, PENDING_SELECT_KEYS);

  const [sort, setSort] = useState<SortState | null>(null);

  const sortedRows = useMemo(() => {
    const byCode = (a: PendingRow, b: PendingRow) =>
      String(a.inquiry_code ?? "").toLowerCase().localeCompare(
        String(b.inquiry_code ?? "").toLowerCase()
      );

    return [...filteredRows].sort((a, b) => {
      // 1. Completed status is always the primary group.
      //    Default: pending first. Completed ↑ flips to completed first.
      const ca = a.status === "completed" ? 1 : 0;
      const cb = b.status === "completed" ? 1 : 0;
      if (ca !== cb) {
        const completedFirst = sort?.key === "completed" && sort.dir === "asc";
        return completedFirst ? cb - ca : ca - cb;
      }

      // 2. Secondary: selected sort (skip if it's the Completed column — handled above).
      if (sort && sort.key !== "completed") {
        let cmp = 0;
        if (sort.key === "priority") {
          const pa = PRIORITY_ORDER[a.priority] ?? 99;
          const pb = PRIORITY_ORDER[b.priority] ?? 99;
          cmp = sort.dir === "asc" ? pa - pb : pb - pa;
        } else {
          const va = String(a[sort.key as keyof PendingRow] ?? "").toLowerCase();
          const vb = String(b[sort.key as keyof PendingRow] ?? "").toLowerCase();
          cmp = sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        if (cmp !== 0) return cmp;
      }

      // 3. Tertiary: inquiry code ascending (always).
      return byCode(a, b);
    });
  }, [filteredRows, sort]);

  // ── mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pending-global"] });
    qc.invalidateQueries({ queryKey: ["pending-mine"] });
  };

  const createMut = useMutation({
    mutationFn: (data: typeof EMPTY) => api.post("/api/pending", data),
    onSuccess: () => { toast.success("Entry added"); setAddOpen(false); setForm({ ...EMPTY }); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Failed to add")),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof EMPTY }) =>
      api.put(`/api/pending/${id}`, data),
    onSuccess: () => { toast.success("Updated"); setEditRow(null); setForm({ ...EMPTY }); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Update failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/pending/${id}`),
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const assignMut = useMutation({
    mutationFn: ({ id, username, remarks }: { id: number; username: string; remarks: string }) =>
      api.post(`/api/pending/${id}/assign`, { username, remarks }),
    onSuccess: () => { toast.success("Assigned"); setAssignRow(null); setAssignUser(""); setAssignRemarks(""); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Assign failed")),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/api/pending/${id}/status`, { status }),
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Status update failed")),
  });

  const priorityMut = useMutation({
    mutationFn: ({ id, priority }: { id: number; priority: string }) =>
      api.patch(`/api/pending/${id}/priority`, { priority }),
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Priority update failed")),
  });

  const cyclePriority = (row: PendingRow) => {
    const cycle: Record<string, string> = { relaxed: "semi_urgent", semi_urgent: "urgent", urgent: "relaxed" };
    priorityMut.mutate({ id: row.id, priority: cycle[row.priority] ?? "relaxed" });
  };

  // ── handlers ───────────────────────────────────────────────────────────────

  const openAdd = () => { setForm({ ...EMPTY }); setEditRow(null); setAddOpen(true); };

  const openEdit = (row: PendingRow) => {
    setEditRow(row);
    setForm({
      inquiry_code: row.inquiry_code,
      received_date: row.received_date, received_time: row.received_time,
      mail_for: row.mail_for, oem_dealer: row.oem_dealer,
      end_customer: row.end_customer, kva_rating: row.kva_rating,
      quantity: row.quantity, backup_time: row.backup_time,
      reply_to: row.reply_to, assigned_to: row.assigned_to, status: row.status,
      remarks: row.remarks, priority: row.priority,
      submission_date: row.submission_date, submitted_to: row.submitted_to, submitted_by: row.submitted_by ?? "",
    });
    setAddOpen(true);
  };

  const handleSubmit = () => {
    if (editRow) updateMut.mutate({ id: editRow.id, data: form });
    else createMut.mutate(form);
  };

  const toggleStatus = (row: PendingRow) => {
    statusMut.mutate({ id: row.id, status: row.status === "completed" ? "pending" : "completed" });
  };

  const doMarkComplete = async (row: PendingRow, details?: { submission_date: string; submitted_to: string; reply_to: string }) => {
    setCompletingId(row.id);
    try {
      await api.post(`/api/pending/${row.id}/complete`, details ?? {});
      toast.success("Marked complete");
      invalidate();
      qc.invalidateQueries({ queryKey: ["pending-export-summary"] });
    } catch (e: any) {
      toast.error(apiErr(e, "Failed to mark complete"));
    } finally {
      setCompletingId(null);
    }
  };

  const markComplete = async (row: PendingRow, details?: { submission_date: string; submitted_to: string; reply_to: string }) => {
    const pendingCode = row.inquiry_code || String(row.sr_no);
    // show completion details dialog first if not already provided
    if (!details) {
      setCompleteDetails({ submission_date: "", submitted_to: "", submitted_by: "", reply_to: row.reply_to || "" });
      setCompleteDetailsRow(row);
      return;
    }
    try {
      const exports: any[] = await api.get(`/api/pending/my-exports/${encodeURIComponent(pendingCode)}`).then(r => r.data);

      const solNos = [...new Set(
        exports.filter(e => e.export_type?.startsWith("quote_") && e.sol_no).map(e => String(e.sol_no))
      )];

      // sizing groups — only relevant when quote exports exist (so sol_no linking is possible)
      const sizingExps = exports.filter(e => e.export_type?.startsWith("sizing_") && !e.sol_no);
      let sizingGroups: { fp: string; exports: any[] }[] = [];
      if (sizingExps.length > 0 && solNos.length > 0) {
        const fpOf = (e: any) => SIZING_KEYS.map(k => String(e[k] ?? "")).join("|");
        const groupMap = new Map<string, any[]>();
        for (const e of sizingExps) {
          const key = fpOf(e);
          if (!groupMap.has(key)) groupMap.set(key, []);
          groupMap.get(key)!.push(e);
        }
        sizingGroups = Array.from(groupMap.entries()).map(([fp, exps]) => ({ fp, exports: exps }));
      }

      const unlinked = exports.filter(e =>
        (e.export_type === "datasheet" || e.export_type === "gad") && !e.sol_no
      );

      if (sizingGroups.length > 0 || unlinked.length > 0) {
        setLinkSizingGroups(sizingGroups);
        setLinkSizingMap({});
        setLinkDialogExports(unlinked);
        setLinkDialogAllExports(exports);
        setLinkSolMap({});
        setLinkDialogRow(row);
        return;
      }
    } catch {
      // if fetch fails, proceed without linking step
    }
    doMarkComplete(row, details);
  };

  const handleLinkAndComplete = async () => {
    if (!linkDialogRow) return;
    const pendingCode = linkDialogRow.inquiry_code || String(linkDialogRow.sr_no);

    const links: { pending_code: string; export_id: number; sol_no: string }[] = [];

    // sizing links — skip only when empty (standalone = new row, passes through)
    for (const group of linkSizingGroups) {
      const sol = linkSizingMap[group.fp] ?? "";
      if (!sol) continue; // "" = skip entirely
      for (const exp of group.exports) {
        links.push({ pending_code: pendingCode, export_id: exp.id, sol_no: sol });
      }
    }

    // datasheet/GAD links
    for (const [id, sol_no] of Object.entries(linkSolMap)) {
      if (sol_no) links.push({ pending_code: pendingCode, export_id: Number(id), sol_no });
    }

    if (links.length > 0) {
      try {
        await api.patch("/api/pending/my-exports/link", { links });
      } catch (e: any) {
        toast.error(apiErr(e, "Failed to link files"));
        return;
      }
    }
    const row = linkDialogRow;
    setLinkDialogRow(null); setLinkDialogExports([]); setLinkDialogAllExports([]); setLinkSolMap({});
    setLinkSizingGroups([]); setLinkSizingMap({});
    doMarkComplete(row, completeDetails);
  };

  const unlinkMut = useMutation({
    mutationFn: (exportId: number) => {
      const pendingCode = detailRow?.inquiry_code || String(detailRow?.sr_no ?? "");
      return api.patch("/api/pending/my-exports/unlink", { pending_code: pendingCode, export_id: exportId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-exports", detailCode, historySource] });
      qc.invalidateQueries({ queryKey: ["pending-export-summary"] });
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed to unlink")),
  });

  const deleteExportMut = useMutation({
    mutationFn: (exportId: number) => {
      const pendingCode = detailRow?.inquiry_code || String(detailRow?.sr_no ?? "");
      return api.delete(`/api/pending/my-exports/${exportId}?pending_code=${encodeURIComponent(pendingCode)}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-exports", detailCode, historySource] });
      qc.invalidateQueries({ queryKey: ["pending-export-summary"] });
      toast.success("Export entry deleted");
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed to delete export")),
  });

  const handleLink = async (exportId: number, sol_no: string) => {
    if (!detailRow) return;
    const pendingCode = detailRow.inquiry_code || String(detailRow.sr_no);
    try {
      await api.patch("/api/pending/my-exports/link", {
        links: [{ pending_code: pendingCode, export_id: exportId, sol_no }],
      });
      qc.invalidateQueries({ queryKey: ["pending-exports", detailCode, historySource] });
      qc.invalidateQueries({ queryKey: ["pending-export-summary"] });
    } catch (e: any) {
      toast.error(apiErr(e, "Failed to link export"));
    }
  };

  const openHistory = (row: PendingRow, source: "mine" | "full") => {
    setDetailRow(row);
    setHistorySource(source);
  };

  // ── completed column cell ──────────────────────────────────────────────────

  function CompletedCell({ row }: { row: PendingRow }) {
    const tblKey = row.inquiry_code || String(row.sr_no);
    const mailFor = (row.mail_for || "").split(", ").filter(Boolean);
    const doneSet = new Set<string>(exportSummary[tblKey] ?? []);
    const matched = mailFor.filter((mf) => doneSet.has(mf)).sort(byChipOrder);
    const pending = mailFor.filter((mf) => !doneSet.has(mf)).sort(byChipOrder);
    const extras = [...doneSet].filter((d) => !mailFor.includes(d)).sort(byChipOrder);
    const score = mailFor.length > 0 ? `${matched.length}/${mailFor.length}` : null;
    const allDone = mailFor.length > 0 && matched.length === mailFor.length;

    return (
      <div className="flex flex-wrap gap-1 items-center">
        {matched.map((lbl) => (
          <span key={lbl} className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", EXPORT_CHIP[lbl])}>
            {lbl}
          </span>
        ))}
        {pending.map((lbl) => (
          <span key={lbl} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-muted-foreground/30 text-muted-foreground">
            {lbl}
          </span>
        ))}
        {extras.map((lbl) => (
          <span key={lbl} className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full opacity-60 ring-1 ring-inset ring-current", EXPORT_CHIP[lbl])}>
            +{lbl}
          </span>
        ))}
        {score && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded ml-0.5",
            allDone ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-400"
          )}>
            {score}
          </span>
        )}
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Pending Sheet</h1>
        <Button onClick={openAdd}>+ Add Entry</Button>
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 border-b">
        {([
          { key: "global",    label: "Global Sheet" },
          { key: "mine",      label: `My Pending${activeRows.length ? ` (${activeRows.length})` : ""}` },
          { key: "completed", label: "My Completed" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
        {tab === "global" && (
          <button
            onClick={() => setHideCompleted((v) => !v)}
            className={cn(
              "ml-auto mr-1 mb-px px-3 py-1 text-xs font-medium rounded border transition-colors",
              hideCompleted
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:text-foreground",
            )}
          >
            {hideCompleted ? "Show completed" : "Hide completed"}
          </button>
        )}
      </div>

      {/* filter bar */}
      <FilterBar
        values={filterValues}
        onField={setField}
        onClear={clear}
        globalSearch={globalSearch}
        globalPlaceholder="Search inquiry code, customer, mail for…"
        activeCount={activeCount}
      />

      {/* table */}
      <div className="flex-1 overflow-auto border rounded-md">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading…</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {rows.length > 0 ? "No results match your filters." : tab === "mine" ? "No pending items assigned to you." : tab === "completed" ? "No completed items yet." : "No entries yet."}
          </div>
        ) : (
          <table className="table-grid text-xs min-w-max">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                {/* mark-complete button column — mine tab only */}
                {tab === "mine" && <th className="px-2 py-2 w-8" />}
                {COLS.map((c) => (
                  <th key={c.key} style={{ minWidth: c.w }} className="text-left px-2 py-2 font-semibold whitespace-nowrap">
                    {c.sortable ? (
                      <span className="inline-flex items-center gap-0.5">
                        {c.label}
                        <SortButtons colKey={c.key as string} sort={sort} onSort={setSort} />
                      </span>
                    ) : c.label}
                  </th>
                ))}
                {isExpert && <th className="px-2 py-2 w-20">Assign</th>}
                {isExpert && <th className="px-2 py-2 w-16">Del</th>}
              </tr>
              <FilterRow
                cols={COLS as any}
                values={filterValues}
                onField={setField}
                prefixCells={tab === "mine" ? [{ width: 32 }] : []}
                suffixCells={[
                  ...(isExpert ? [{ width: 80 }] : []),
                  ...(isExpert ? [{ width: 64 }] : []),
                ]}
                optionsMap={{ assigned_to: pendingUserOptions, submitted_by: pendingUserOptions }}
              />
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const isAssignedToMe = row.assigned_to === me;
                const isCompleting = completingId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "hover:brightness-95 border-b cursor-pointer transition-colors",
                      row.status === "completed"
                        ? "bg-green-100/70 dark:bg-green-950/40 opacity-75"
                        : PRIORITY_ROW[row.priority] || "",
                      row.status !== "completed" && isAssignedToMe && !PRIORITY_ROW[row.priority] && "bg-blue-50 dark:bg-blue-950/20",
                    )}
                    onDoubleClick={() => {
                      if (tab === "mine") { openHistory(row, "mine"); }
                      else if (tab === "completed") { openHistory(row, "full"); }
                      else { setGlobalActionRow(row); }
                    }}
                  >
                    {/* mark-complete button — mine tab only */}
                    {tab === "mine" && (
                      <td className="px-1 py-1.5 text-center" onClick={(ev) => ev.stopPropagation()}>
                        <button
                          title="Mark complete"
                          disabled={isCompleting}
                          onClick={() => markComplete(row)}
                          className="text-muted-foreground hover:text-green-600 transition-colors disabled:opacity-50"
                        >
                          {isCompleting
                            ? <Loader2 size={14} className="animate-spin" />
                            : <CheckCircle2 size={14} />}
                        </button>
                      </td>
                    )}

                    {COLS.map((c) => {
                      if (c.key === "priority") {
                        const canEdit = isExpert;
                        return (
                          <td key={c.key} className="px-2 py-1.5" onClick={(ev) => { if (canEdit) { ev.stopPropagation(); cyclePriority(row); } }}>
                            <span className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                              PRIORITY_STYLES[row.priority] || PRIORITY_STYLES.relaxed,
                              canEdit && "cursor-pointer hover:opacity-80 transition-opacity",
                            )}>
                              {PRIORITY_LABELS[row.priority] ?? row.priority}
                            </span>
                          </td>
                        );
                      }
                      if (c.key === "status") {
                        return (
                          <td key={c.key} className="px-2 py-1.5">
                            <button
                              onClick={() => toggleStatus(row)}
                              disabled={statusMut.isPending}
                              className={cn(
                                "text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors",
                                row.status === "completed"
                                  ? "bg-green-200 text-green-900 dark:bg-green-800/60 dark:text-green-200"
                                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
                              )}
                            >
                              {row.status === "completed" ? "Completed" : "Pending"}
                            </button>
                          </td>
                        );
                      }
                      if (c.key === "completed") {
                        return (
                          <td key={c.key} className="px-2 py-1.5">
                            <CompletedCell row={row} />
                          </td>
                        );
                      }
                      const PENDING_DATE_COLS = new Set(["received_date", "submission_date", "completion_date"]);
                      const raw = (row as any)[c.key] ?? "";
                      return (
                        <td key={c.key} className="px-2 py-1.5 whitespace-nowrap max-w-[240px] truncate">
                          {PENDING_DATE_COLS.has(c.key) ? fmtDate(raw) : String(raw)}
                        </td>
                      );
                    })}

                    {isExpert && (
                      <td className="px-2 py-1.5 text-center">
                        <button
                          title="Assign to user"
                          onClick={() => { setAssignRow(row); setAssignUser(row.assigned_to || ""); }}
                          className="text-muted-foreground hover:text-primary"
                        >
                          <UserCheck size={14} />
                        </button>
                      </td>
                    )}
                    {isExpert && (
                      <td className="px-2 py-1.5 text-center">
                        <button
                          title="Delete"
                          onClick={() => deleteMut.mutate(row.id)}
                          disabled={deleteMut.isPending}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* add / edit dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!o) { setAddOpen(false); setEditRow(null); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRow ? "Edit Entry" : "Add Pending Entry"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">Inquiry Code</Label>
              <Input
                value={form.inquiry_code}
                onChange={(e) => setForm((f) => ({ ...f, inquiry_code: e.target.value }))}
                placeholder={inquiryCodeHint?.suggestion || "e.g. EC-001"}
                className="h-8 text-xs"
              />
              {inquiryCodeHint?.suggestion && !editRow && (
                <button
                  type="button"
                  className="text-[11px] text-primary hover:underline text-left"
                  onClick={() => setForm((f) => ({ ...f, inquiry_code: inquiryCodeHint.suggestion }))}
                >
                  Suggested: {inquiryCodeHint.suggestion} — click to use
                </button>
              )}
            </div>
            {[
              { key: "received_date", label: "Received Date", type: "date" },
              { key: "received_time", label: "Received Time", type: "time" },
              { key: "oem_dealer",    label: "OEM / Dealer",  type: "text" },
              { key: "kva_rating",    label: "KVA Rating",    type: "text" },
              { key: "quantity",      label: "Quantity",      type: "text" },
            ].map(({ key, label, type }) => (
              <div key={key} className="flex flex-col gap-1">
                <Label className="text-xs">{label}</Label>
                <Input
                  type={type}
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            ))}
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">Mail For</Label>
              <MailForPicker
                value={form.mail_for}
                onChange={(v) => setForm((f) => ({ ...f, mail_for: v }))}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">Backup Time</Label>
              <BackupTimePicker
                value={form.backup_time}
                onChange={(v) => setForm((f) => ({ ...f, backup_time: v }))}
                presets={durations}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">End Customer / Project Name</Label>
              <Input
                value={form.end_customer}
                onChange={(e) => setForm((f) => ({ ...f, end_customer: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Priority</Label>
              <select
                className="h-8 rounded-md border px-3 text-xs bg-background"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                <option value="urgent">Urgent</option>
                <option value="semi_urgent">Semi Urgent</option>
                <option value="relaxed">Relaxed</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setAddOpen(false); setEditRow(null); }}>Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {createMut.isPending || updateMut.isPending ? "Saving…" : editRow ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* assign dialog */}
      <Dialog open={!!assignRow} onOpenChange={(o) => { if (!o) { setAssignRow(null); setAssignUser(""); } }}>
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assign Entry #{assignRow?.sr_no}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label className="text-xs text-muted-foreground">Select user — shows active (non-completed) items</Label>
            <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
              <button
                type="button"
                onClick={() => setAssignUser("")}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-md text-sm border transition-colors text-left",
                  assignUser === "" ? "border-primary bg-primary/5 font-medium" : "border-transparent hover:bg-muted"
                )}
              >
                <span className="text-muted-foreground">— Unassigned —</span>
              </button>
              {users.map((u) => {
                const load = workload[u.username] ?? 0;
                const selected = assignUser === u.username;
                return (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => setAssignUser(u.username)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-md text-sm border transition-colors text-left",
                      selected ? "border-primary bg-primary/5 font-medium" : "border-transparent hover:bg-muted"
                    )}
                  >
                    <span>
                      {u.username}
                      {u.role === "e" && <span className="ml-1.5 text-[10px] text-muted-foreground">(expert)</span>}
                    </span>
                    <span className={cn(
                      "text-[11px] font-semibold px-2 py-0.5 rounded-full ml-4 shrink-0",
                      load === 0
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                        : load <= 3
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    )}>
                      {load} active
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1 px-0 pb-2">
            <Label className="text-xs text-muted-foreground">Remarks (optional)</Label>
            <textarea
              rows={2}
              value={assignRemarks}
              onChange={(e) => setAssignRemarks(e.target.value)}
              className="rounded-md border px-3 py-1.5 text-xs bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Notes for assignee…"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setAssignRow(null); setAssignUser(""); setAssignRemarks(""); }}>Cancel</Button>
            <Button
              onClick={() => assignRow && assignMut.mutate({ id: assignRow.id, username: assignUser, remarks: assignRemarks })}
              disabled={assignMut.isPending}
            >
              {assignMut.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* completion details dialog */}
      <Dialog open={!!completeDetailsRow} onOpenChange={(o) => { if (!o) setCompleteDetailsRow(null); }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Complete — {completeDetailsRow?.inquiry_code || `#${completeDetailsRow?.sr_no}`}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">Reply To Mail</Label>
              <Input
                type="email"
                value={completeDetails.reply_to}
                onChange={(e) => setCompleteDetails((d) => ({ ...d, reply_to: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Submission Date</Label>
              <Input
                type="date"
                value={completeDetails.submission_date}
                onChange={(e) => setCompleteDetails((d) => ({ ...d, submission_date: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Submitted To</Label>
              <Input
                value={completeDetails.submitted_to}
                onChange={(e) => setCompleteDetails((d) => ({ ...d, submitted_to: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">Submitted By</Label>
              <select
                className="h-8 rounded-md border px-3 text-xs bg-background"
                value={completeDetails.submitted_by}
                onChange={(e) => setCompleteDetails((d) => ({ ...d, submitted_by: e.target.value }))}
              >
                <option value="">— Select user —</option>
                {users.map((u) => (
                  <option key={u.username} value={u.username}>{u.username}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setCompleteDetailsRow(null)}>Cancel</Button>
            <Button onClick={() => {
              const row = completeDetailsRow!;
              setCompleteDetailsRow(null);
              markComplete(row, completeDetails);
            }}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* global action picker — double-click on Global tab */}
      <Dialog open={!!globalActionRow} onOpenChange={(o) => { if (!o) setGlobalActionRow(null); }}>
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {globalActionRow?.inquiry_code || `#${globalActionRow?.sr_no}`}
              {globalActionRow?.end_customer && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">{globalActionRow.end_customer}</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {isExpert && (
              <button
                onClick={() => { const r = globalActionRow!; setGlobalActionRow(null); openEdit(r); }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border hover:bg-muted text-left transition-colors"
              >
                <Pencil size={16} className="text-muted-foreground shrink-0" />
                <div>
                  <div className="text-sm font-medium">Edit Entry</div>
                  <div className="text-xs text-muted-foreground">Modify this pending item</div>
                </div>
              </button>
            )}
            <button
              onClick={() => { const r = globalActionRow!; setGlobalActionRow(null); openHistory(r, "full"); }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border hover:bg-muted text-left transition-colors"
            >
              <History size={16} className="text-muted-foreground shrink-0" />
              <div>
                <div className="text-sm font-medium">Export History</div>
                <div className="text-xs text-muted-foreground">View all exports for this inquiry</div>
              </div>
            </button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setGlobalActionRow(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* sizing download project picker */}
      <Dialog open={!!sizingPickerExport} onOpenChange={(o) => { if (!o) setSizingPickerExport(null); }}>
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Download Sizing — Choose Project</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Label className="text-xs text-muted-foreground">Select an existing project or type a new name</Label>
            <Input
              value={sizingProject}
              onChange={(e) => setSizingProject(e.target.value)}
              placeholder="Project name…"
              className="h-8 text-xs"
              list="sizing-projects-list"
            />
            <datalist id="sizing-projects-list">
              {sizingProjects.map((p) => <option key={p} value={p} />)}
            </datalist>
            <p className="text-[11px] text-muted-foreground">
              The sizing data will be added as a new row in the chosen project and downloaded automatically.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSizingPickerExport(null)}>Cancel</Button>
            <Button disabled={!sizingProject.trim() || restoringId !== null} onClick={doDownloadSizing}>
              {restoringId !== null ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* export history dialog */}
      <Dialog open={!!detailRow} onOpenChange={(o) => { if (!o) setDetailRow(null); }}>
        <DialogContent className="max-w-[98vw] sm:max-w-[98vw] w-full">
          <DialogHeader>
            <DialogTitle>
              Export History — {detailRow?.inquiry_code || `#${detailRow?.sr_no}`}
              {detailRow?.end_customer && <span className="ml-2 text-sm font-normal text-muted-foreground">{detailRow.end_customer}</span>}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : detailExports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No exports recorded for this item yet.</p>
          ) : (() => {
            const TYPE_LABEL: Record<string, string> = { quote_word: "Quote (Word)", quote_pdf: "Quote (PDF)", sizing_excel: "Sizing (Excel)", sizing_pdf: "Sizing (PDF)", datasheet: "Datasheet", gad: "GAD" };
            const CHIP_KEY: Record<string, string> = { quote_word: "Quote", quote_pdf: "Quote", sizing_excel: "Sizing", sizing_pdf: "Sizing", datasheet: "Datasheet", gad: "GAD" };
            const DATA_COLS: { key: string; label: string }[] = [
              { key: "quote_code",          label: "Quote Code"     },
              { key: "exported_by",         label: "By"             },
              { key: "sales_person",        label: "Sales Person"   },
              { key: "solution_provider",   label: "Sol. Provider"  },
              { key: "project_customer",    label: "Customer"       },
              { key: "ups_make",            label: "UPS Make"       },
              { key: "ups_model",           label: "UPS Model"      },
              { key: "ups_kva",             label: "KVA"            },
              { key: "actual_load_kva",     label: "Act. Load KVA"  },
              { key: "load_kw",             label: "Load KW"        },
              { key: "power_factor",        label: "PF"             },
              { key: "inverter_efficiency", label: "Inv Eff%"       },
              { key: "dc_voltage",          label: "DC V"           },
              { key: "backup_min",          label: "Backup min"     },
              { key: "cell_chemistry",      label: "Chemistry"      },
              { key: "ageing_pct",          label: "Ageing%"        },
              { key: "design_margin_pct",   label: "Design M%"      },
              { key: "dod_margin_pct",      label: "DoD M%"         },
              { key: "derating_pct",        label: "Derating%"      },
              { key: "capacity_ah",         label: "Cap Ah"         },
              { key: "part_code",           label: "Part Code"      },
              { key: "cell_type",           label: "Cell Type"      },
              { key: "ageing_type",         label: "Ageing Type"    },
              { key: "backup_time_min",     label: "BT min"         },
              { key: "centre_tap",          label: "CT"             },
              { key: "qty_system",          label: "Qty Sys"        },
              { key: "rate_system",         label: "Rate Sys"       },
              { key: "price_system",        label: "Price Sys"      },
              { key: "rack1_dim",           label: "Rack 1 Dim"     },
              { key: "rack1_qty",           label: "Rack 1 Qty"     },
              { key: "rack1_rate",          label: "Rack 1 Rate"    },
              { key: "rack1_price",         label: "Rack 1 Price"   },
              { key: "rack2_dim",           label: "Rack 2 Dim"     },
              { key: "rack2_qty",           label: "Rack 2 Qty"     },
              { key: "rack2_rate",          label: "Rack 2 Rate"    },
              { key: "rack2_price",         label: "Rack 2 Price"   },
              { key: "cc1_desc",            label: "CC1 Desc"       },
              { key: "cc1_price",           label: "CC1 Price"      },
              { key: "cc2_desc",            label: "CC2 Desc"       },
              { key: "cc2_price",           label: "CC2 Price"      },
              { key: "cc3_desc",            label: "CC3 Desc"       },
              { key: "cc3_price",           label: "CC3 Price"      },
              { key: "cc4_desc",            label: "CC4 Desc"       },
              { key: "cc4_price",           label: "CC4 Price"      },
              { key: "cc5_desc",            label: "CC5 Desc"       },
              { key: "cc5_price",           label: "CC5 Price"      },
              { key: "datasheet_name",      label: "Datasheet"      },
              { key: "gad_name",            label: "GAD"            },
              { key: "remarks",             label: "Remarks"        },
            ];
            // hide exported_by for per-user source; show all other cols always
            const activeCols = DATA_COLS.filter((col) => {
              if (col.key === "exported_by" && historySource !== "full") return false;
              return true;
            });
            // ── build tree ──
            const TYPE_ORDER: Record<string, number> = { quote_word: 0, quote_pdf: 0, sizing_excel: 1, sizing_pdf: 1, datasheet: 2, gad: 3 };
            const byTypeOrder = (a: any, b: any) => (TYPE_ORDER[a.export_type] ?? 9) - (TYPE_ORDER[b.export_type] ?? 9);
            const solSort = (a: any, b: any) => (parseInt(a.sol_no) || 0) - (parseInt(b.sol_no) || 0);

            let quoteParents: any[];
            const childrenByParent = new Map<number, any[]>();
            let standalones: any[];

            // dedupe quote exports by sol_no — one parent row per solution,
            // secondary quote formats (word vs pdf) become children of the primary
            const dedupeQuotes = (allQuotes: any[]): { parents: any[]; extras: Map<string, any[]> } => {
              const seen = new Map<string, any>();
              const extras = new Map<string, any[]>();
              for (const e of allQuotes) {
                const sol = String(e.sol_no || "");
                if (!seen.has(sol)) { seen.set(sol, e); }
                else { if (!extras.has(sol)) extras.set(sol, []); extras.get(sol)!.push(e); }
              }
              return { parents: Array.from(seen.values()), extras };
            };

            if (historySource === "full") {
              const allQuotes = detailExports.filter((e: any) => e.export_type?.startsWith("quote_") && e.sol_no).sort(solSort);
              const { parents, extras } = dedupeQuotes(allQuotes);
              quoteParents = parents;
              for (const parent of quoteParents) {
                const sol = String(parent.sol_no || "");
                const kids = [
                  ...(extras.get(sol) ?? []),
                  ...detailExports.filter((e: any) => !e.export_type?.startsWith("quote_") && e.sol_no === sol),
                ].sort(byTypeOrder);
                if (kids.length) childrenByParent.set(parent.id, kids);
              }
              standalones = detailExports.filter((e: any) => !e.export_type?.startsWith("quote_") && !e.sol_no).sort(byTypeOrder);
            } else {
              const allQuotes = detailExports.filter((e: any) => e.export_type?.startsWith("quote_") && !e.parent_id).sort(solSort);
              const { parents, extras } = dedupeQuotes(allQuotes);
              quoteParents = parents;
              for (const e of detailExports) {
                if (e.parent_id) {
                  if (!childrenByParent.has(e.parent_id)) childrenByParent.set(e.parent_id, []);
                  childrenByParent.get(e.parent_id)!.push(e);
                }
              }
              // merge extra quote formats into primary's children
              for (const parent of quoteParents) {
                const sol = String(parent.sol_no || "");
                const existing = childrenByParent.get(parent.id) ?? [];
                const ex = extras.get(sol) ?? [];
                if (ex.length) childrenByParent.set(parent.id, [...ex, ...existing].sort(byTypeOrder));
              }
              for (const [pid, kids] of childrenByParent) childrenByParent.set(pid, [...kids].sort(byTypeOrder));
              standalones = detailExports.filter((e: any) => !e.parent_id && !e.export_type?.startsWith("quote_")).sort(byTypeOrder);
            }

            const minSolNo = quoteParents[0]?.sol_no;

            const fmtDate = (ts: number) => ts
              ? new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })
              : "";

            const DataCells = ({ e }: { e: any }) => (
              <>
                {activeCols.map((col) => {
                  const raw = e[col.key];
                  const display = (raw === "" || raw === null || raw === undefined || raw === "0" || raw === 0) ? "—" : raw;
                  return (
                    <td key={col.key} className="px-3 py-2 whitespace-nowrap max-w-[180px] truncate">{display}</td>
                  );
                })}
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(e.exported_at)}</td>
              </>
            );

            const DownloadBtn = ({ e }: { e: any }) => {
              const isDownloading = restoringId === e.id;
              return (
                <button
                  disabled={isDownloading}
                  onClick={() => doDownload(e)}
                  className="text-[11px] font-medium px-2 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50 whitespace-nowrap"
                >
                  {isDownloading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Download"}
                </button>
              );
            };

            const DeleteBtn = ({ e }: { e: any }) => (
              <button
                disabled={deleteExportMut.isPending}
                onClick={() => { if (confirm("Delete this export entry?")) deleteExportMut.mutate(e.id); }}
                className="text-[11px] font-medium px-2 py-0.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 whitespace-nowrap"
              >
                Delete
              </button>
            );

            const TypeChip = ({ exportType }: { exportType: string }) => (
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap", EXPORT_CHIP[CHIP_KEY[exportType] ?? ""] ?? "bg-muted text-muted-foreground")}>
                {TYPE_LABEL[exportType] ?? exportType}
              </span>
            );

            const SolDropdown = ({ e }: { e: any }) => {
              if (historySource !== "mine" || quoteParents.length === 0) return null;
              if (e.export_type?.startsWith("quote_")) return null;
              return (
                <select
                  value={e.sol_no || ""}
                  className="text-xs rounded border px-1 py-0.5 bg-background max-w-[130px]"
                  onChange={(ev) => {
                    const val = ev.target.value;
                    if (val === "") unlinkMut.mutate(e.id);
                    else handleLink(e.id, val);
                  }}
                >
                  <option value="">— Unlinked</option>
                  {quoteParents.map((p: any) => (
                    <option key={p.sol_no} value={p.sol_no}>
                      Sol {p.sol_no}{p.part_code ? ` · ${p.part_code}` : ""}
                    </option>
                  ))}
                </select>
              );
            };

            return (
              <div className="overflow-auto max-h-[70vh]">
                <table className="table-grid text-xs min-w-max">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-3 py-2" />
                      <th className="text-left px-3 py-2 whitespace-nowrap min-w-[200px]">Type</th>
                      {historySource === "mine" && quoteParents.length > 0 && (
                        <th className="text-left px-3 py-2 whitespace-nowrap">Solution</th>
                      )}
                      {activeCols.map((col) => (
                        <th key={col.key} className="text-left px-3 py-2 whitespace-nowrap">{col.label}</th>
                      ))}
                      <th className="text-left px-3 py-2 whitespace-nowrap">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* quote parents + their children */}
                    {quoteParents.map((parent: any) => {
                      const myChildren = childrenByParent.get(parent.id) ?? [];
                      const isFirstSol = parent.sol_no === minSolNo;
                      return (
                        <React.Fragment key={parent.id}>
                          <tr className="border-b hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2">
                              <div className="flex gap-1.5 items-center">
                                {isFirstSol && <DownloadBtn e={parent} />}
                                <DeleteBtn e={parent} />
                              </div>
                            </td>
                            <td className="px-3 py-2 min-w-[200px]">
                              <TypeChip exportType={parent.export_type} />
                              {parent.sol_no && <span className="ml-2 text-[10px] text-muted-foreground">Sol {parent.sol_no}</span>}
                            </td>
                            {historySource === "mine" && quoteParents.length > 0 && <td className="px-3 py-2" />}
                            <DataCells e={parent} />
                          </tr>
                          {myChildren.map((child: any) => (
                            <tr key={child.id} className="border-b hover:bg-muted/30 bg-muted/10">
                              <td className="px-3 py-2">
                                <div className="flex gap-1.5 items-center">
                                  <DownloadBtn e={child} />
                                  <DeleteBtn e={child} />
                                </div>
                              </td>
                              <td className="px-3 py-2 min-w-[200px]">
                                <span className="inline-block w-5 text-muted-foreground/50 select-none">↳</span>
                                <TypeChip exportType={child.export_type} />
                              </td>
                              {historySource === "mine" && quoteParents.length > 0 && (
                                <td className="px-3 py-2"><SolDropdown e={child} /></td>
                              )}
                              <DataCells e={child} />
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                    {/* standalone rows */}
                    {standalones.map((e: any) => (
                      <tr key={e.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2">
                          <div className="flex gap-1.5 items-center">
                            <DownloadBtn e={e} />
                            <DeleteBtn e={e} />
                          </div>
                        </td>
                        <td className="px-3 py-2 min-w-[200px]">
                          <TypeChip exportType={e.export_type} />
                        </td>
                        {historySource === "mine" && quoteParents.length > 0 && (
                          <td className="px-3 py-2"><SolDropdown e={e} /></td>
                        )}
                        <DataCells e={e} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailRow(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Combined linking dialog before mark complete ── */}
      <Dialog open={!!linkDialogRow} onOpenChange={(o) => {
        if (!o) {
          setLinkDialogRow(null); setLinkDialogExports([]); setLinkDialogAllExports([]); setLinkSolMap({});
          setLinkSizingGroups([]); setLinkSizingMap({});
        }
      }}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Exports Before Completing</DialogTitle>
          </DialogHeader>
          {(() => {
            const quoteExps = linkDialogAllExports.filter(e => e.export_type?.startsWith("quote_") && e.sol_no);
            const multiQuote = new Set(quoteExps.map(e => String(e.quote_code || ""))).size > 1;
            // dedupe by sol_no+quote_code combo
            const seen = new Set<string>();
            const solOptions: { sol_no: string; quote_code: string; part_code: string }[] = [];
            for (const e of quoteExps) {
              const key = `${e.quote_code}|${e.sol_no}`;
              if (!seen.has(key)) { seen.add(key); solOptions.push({ sol_no: String(e.sol_no), quote_code: String(e.quote_code || ""), part_code: String(e.part_code || "") }); }
            }
            const solLabel = (o: typeof solOptions[0]) =>
              multiQuote ? `${o.quote_code} Sol${o.sol_no} - ${o.part_code}` : `Sol${o.sol_no} - ${o.part_code}`;
            return (
              <div className="flex flex-col gap-4 mt-1">

                {/* Sizing section */}
                {linkSizingGroups.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sizing Sheets</p>
                    {linkSizingGroups.map((group) => {
                      const rep = group.exports[0];
                      const types = [...new Set(group.exports.map((e: any) => e.export_type === "sizing_excel" ? "Excel" : "PDF"))].join(", ");
                      const batteryLabel = rep?.part_code || rep?.capacity_ah ? `${rep?.part_code || ""}${rep?.part_code && rep?.capacity_ah ? "" : rep?.capacity_ah ? `${rep.dc_voltage || ""}V ${rep.capacity_ah}AH` : ""}` : "";
                      const date = rep?.exported_at
                        ? new Date(rep.exported_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })
                        : "";
                      return (
                        <div key={group.fp} className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium block">Sizing ({types})</span>
                            {batteryLabel && <span className="text-[10px] text-muted-foreground font-mono">{batteryLabel}</span>}
                            {date && <span className="text-[10px] text-muted-foreground ml-1">{date}</span>}
                          </div>
                          <select
                            className="h-8 rounded border px-2 text-xs bg-background w-48 shrink-0"
                            value={linkSizingMap[group.fp] ?? "standalone"}
                            onChange={(e) => setLinkSizingMap(prev => ({ ...prev, [group.fp]: e.target.value }))}
                          >
                            {solOptions.map(o => <option key={`${o.quote_code}|${o.sol_no}`} value={o.sol_no}>{solLabel(o)}</option>)}
                            <option value="standalone">Standalone → new row</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Datasheet / GAD section */}
                {linkDialogExports.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {linkSizingGroups.length > 0 && <div className="border-t" />}
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Documents</p>
                    {linkDialogExports.map((exp) => (
                      <div key={exp.id} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium truncate block">
                            {exp.export_type === "datasheet" ? (exp.datasheet_name || "Datasheet") : (exp.gad_name || "GAD")}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{exp.export_type === "datasheet" ? "Datasheet" : "GAD"}</span>
                        </div>
                        <select
                          className="h-8 rounded border px-2 text-xs bg-background w-48 shrink-0"
                          value={linkSolMap[exp.id] ?? "standalone"}
                          onChange={(e) => setLinkSolMap(prev => ({ ...prev, [exp.id]: e.target.value }))}
                        >
                          {solOptions.length > 0
                            ? solOptions.map(o => <option key={`${o.quote_code}|${o.sol_no}`} value={o.sol_no}>{solLabel(o)}</option>)
                            : <option value="1">Sol 1</option>
                          }
                          <option value="standalone">Standalone → new row</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            );
          })()}
          <DialogFooter className="gap-2 flex-row mt-2">
            <Button variant="ghost" onClick={() => { setLinkDialogRow(null); setLinkDialogExports([]); setLinkDialogAllExports([]); setLinkSolMap({}); setLinkSizingGroups([]); setLinkSizingMap({}); }}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleLinkAndComplete} disabled={!!completingId}>
              {completingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Link & Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
