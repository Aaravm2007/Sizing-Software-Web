"use client";

import { useState, useMemo } from "react";
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
import { Trash2, UserCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUsername } from "@/lib/api";

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

interface UserEntry { username: string; role: string; }

const EMPTY: Omit<PendingRow, "id" | "sr_no" | "created_by"> = {
  inquiry_code: "", received_date: "", received_time: "", mail_for: "", oem_dealer: "",
  end_customer: "", kva_rating: "", quantity: "", backup_time: "",
  reply_to: "", assigned_to: "", status: "pending", remarks: "", priority: "relaxed",
};

// ── column defs ───────────────────────────────────────────────────────────────

const COLS: { key: keyof PendingRow; label: string; w: number }[] = [
  { key: "inquiry_code",    label: "Inquiry Code",         w: 120 },
  { key: "priority",      label: "Priority",           w: 105 },
  { key: "received_date", label: "Received Date",      w: 115 },
  { key: "received_time", label: "Received Time",      w: 105 },
  { key: "mail_for",      label: "Mail For",           w: 130 },
  { key: "oem_dealer",    label: "OEM / Dealer",       w: 150 },
  { key: "end_customer",  label: "End Customer / Project", w: 200 },
  { key: "kva_rating",    label: "KVA Rating",         w: 90  },
  { key: "quantity",      label: "Qty",                w: 60  },
  { key: "backup_time",   label: "Backup Time",        w: 105 },
  { key: "reply_to",      label: "Reply To Mail",      w: 170 },
  { key: "assigned_to",   label: "Assigned To",        w: 120 },
  { key: "status",        label: "Status",             w: 105 },
  { key: "remarks",       label: "Remarks",            w: 220 },
];

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

function MailForPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const tags = value ? value.split(", ").filter(Boolean) : [];

  const add = (opt: string) => {
    if (tags.includes(opt)) return;
    onChange([...tags, opt].join(", "));
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

  const [tab, setTab] = useState<"global" | "mine">("global");
  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<PendingRow | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [assignRow, setAssignRow] = useState<PendingRow | null>(null);
  const [assignUser, setAssignUser] = useState("");

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
    enabled: isExpert,
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

  const workload = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of globalRows) {
      if (row.status !== "completed" && row.assigned_to) {
        counts[row.assigned_to] = (counts[row.assigned_to] || 0) + 1;
      }
    }
    return counts;
  }, [globalRows]);

  const rawRows = tab === "global" ? globalRows : mineRows;
  const rows = [...rawRows].sort((a, b) => {
    if (a.status === "completed" && b.status !== "completed") return 1;
    if (a.status !== "completed" && b.status === "completed") return -1;
    return a.sr_no - b.sr_no;
  });
  const isLoading = tab === "global" ? loadingGlobal : loadingMine;

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
    mutationFn: ({ id, username }: { id: number; username: string }) =>
      api.post(`/api/pending/${id}/assign`, { username }),
    onSuccess: () => { toast.success("Assigned"); setAssignRow(null); setAssignUser(""); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Assign failed")),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/api/pending/${id}/status`, { status }),
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Status update failed")),
  });

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
    });
    setAddOpen(true);
  };

  const handleSubmit = () => {
    if (editRow) updateMut.mutate({ id: editRow.id, data: form });
    else createMut.mutate(form);
  };

  const toggleStatus = (row: PendingRow) => {
    const cycle: Record<string, string> = { pending: "submitted", submitted: "completed", completed: "pending" };
    statusMut.mutate({ id: row.id, status: cycle[row.status] ?? "pending" });
  };

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Pending Sheet</h1>
        {isExpert && (
          <Button onClick={openAdd}>+ Add Entry</Button>
        )}
      </div>

      {/* tabs */}
      <div className="flex gap-1 border-b">
        {(["global", "mine"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "global" ? "Global Sheet" : "My Pending"}
          </button>
        ))}
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto border rounded-md">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {tab === "mine" ? "No pending items assigned to you." : "No entries yet."}
          </div>
        ) : (
          <table className="table-grid text-xs min-w-max">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} style={{ minWidth: c.w }} className="text-left px-2 py-2 font-semibold whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
                {/* action columns */}
                {isExpert && <th className="px-2 py-2 w-20">Assign</th>}
                {isExpert && <th className="px-2 py-2 w-16">Del</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isAssignedToMe = row.assigned_to === me;
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
                    onDoubleClick={() => isExpert && openEdit(row)}
                  >
                    {COLS.map((c) => {
                      if (c.key === "priority") {
                        return (
                          <td key={c.key} className="px-2 py-1.5">
                            <span className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                              PRIORITY_STYLES[row.priority] || PRIORITY_STYLES.relaxed,
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
                                  : row.status === "submitted"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300"
                                  : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
                              )}
                            >
                              {row.status === "completed" ? "Completed" : row.status === "submitted" ? "Submitted" : "Pending"}
                            </button>
                          </td>
                        );
                      }
                      return (
                        <td key={c.key} className="px-2 py-1.5 whitespace-nowrap max-w-[240px] truncate">
                          {String(row[c.key] ?? "")}
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
        <DialogContent className="sm:max-w-lg">
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
              { key: "reply_to",      label: "Reply To Mail", type: "email" },
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
            <div className="col-span-2 flex flex-col gap-1">
              <Label className="text-xs">Remarks</Label>
              <textarea
                rows={3}
                value={form.remarks}
                onChange={(e) => setForm((f) => ({ ...f, remarks: e.target.value }))}
                className="rounded-md border px-3 py-1.5 text-xs bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Additional details…"
              />
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
        <DialogContent className="sm:max-w-xs">
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
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setAssignRow(null); setAssignUser(""); }}>Cancel</Button>
            <Button
              onClick={() => assignRow && assignMut.mutate({ id: assignRow.id, username: assignUser })}
              disabled={assignMut.isPending}
            >
              {assignMut.isPending ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
