"use client";

import { useState } from "react";
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
import { RefreshCw, Loader2, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserProfile {
  username: string;
  email: string;
  role: "u" | "e" | "g";
  hardcoded: boolean;
}

interface LogEntry {
  timestamp: string;
  level: string;
  method: string;
  path: string;
  status: string;
  detail: string;
}

const ROLE_LABEL: Record<string, string> = { u: "User", e: "Expert", g: "Guest" };
const ROLE_COLORS: Record<string, string> = {
  u: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  e: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  g: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

function fmtUptime(s: number) {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Mass Update History Tab ───────────────────────────────────────────────────

interface MassUpdateLogRow {
  id: number;
  created_at: string;
  username: string;
  update_type: "percent" | "fob";
  field: string;
  percent: number | null;
  cell_updates: { cell_type: string; brand: string; new_cost: number }[] | null;
  updated_count: number;
  backup_file: string;
  reverted_at: string | null;
  reverted_by: string | null;
}

interface MassUpdateLogItem {
  duration: string;
  product_id: string;
  battery_pack: string;
  before: Record<string, any>;
  after: Record<string, any>;
}

function summarizeLog(row: MassUpdateLogRow) {
  if (row.update_type === "fob") return `${row.cell_updates?.length ?? 0} cell type(s)`;
  return `${row.field} ${row.percent! > 0 ? "+" : ""}${row.percent}%`;
}

function MassUpdateHistoryTab() {
  const qc = useQueryClient();
  const [detailId, setDetailId] = useState<number | null>(null);
  const [revertPassword, setRevertPassword] = useState("");

  const { data: rows = [], isLoading } = useQuery<MassUpdateLogRow[]>({
    queryKey: ["mass-update-history"],
    queryFn: () => api.get("/api/costing/mass-update/history").then((r) => r.data),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<{ header: MassUpdateLogRow; items: MassUpdateLogItem[] }>({
    queryKey: ["mass-update-history-detail", detailId],
    queryFn: () => api.get(`/api/costing/mass-update/history/${detailId}`).then((r) => r.data),
    enabled: detailId !== null,
  });

  const revertMut = useMutation({
    mutationFn: () => api.post(`/api/costing/mass-update/history/${detailId}/revert`, { admin_password: revertPassword }),
    onSuccess: (res) => {
      const d = res.data;
      toast.success(`Reverted ${d.reverted} product(s). Backed up to ${d.backup_file}` + (d.errors?.length ? ` · ${d.errors.length} error(s)` : ""));
      setRevertPassword("");
      setDetailId(null);
      qc.invalidateQueries({ queryKey: ["mass-update-history"] });
    },
    onError: (e: any) => toast.error(apiErr(e, "Revert failed")),
  });

  return (
    <>
      <div className="border rounded-md overflow-auto">
        {isLoading ? (
          <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">No mass updates recorded yet.</div>
        ) : (
          <table className="table-grid w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left py-2.5 px-4">Timestamp</th>
                <th className="text-left py-2.5 px-4">User</th>
                <th className="text-left py-2.5 px-4">Type</th>
                <th className="text-left py-2.5 px-4">Summary</th>
                <th className="text-right py-2.5 px-4">Products Changed</th>
                <th className="text-center py-2.5 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn("hover:bg-accent/50 cursor-pointer select-none", row.reverted_at && "opacity-50")}
                  onDoubleClick={() => setDetailId(row.id)}
                  title="Double-click for details"
                >
                  <td className="py-2.5 px-4 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="py-2.5 px-4 font-mono">{row.username}</td>
                  <td className="py-2.5 px-4 capitalize">{row.update_type}</td>
                  <td className="py-2.5 px-4">{summarizeLog(row)}</td>
                  <td className="py-2.5 px-4 text-right">{row.updated_count}</td>
                  <td className="py-2 px-4 text-center">
                    {row.reverted_at
                      ? <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">Reverted</span>
                      : <span className="text-xs px-2.5 py-1 rounded-full font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Active</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={detailId !== null} onOpenChange={(v) => { if (!v) { setDetailId(null); setRevertPassword(""); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mass Update #{detailId}</DialogTitle></DialogHeader>
          {detailLoading || !detail ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <div className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>By <span className="font-mono text-foreground">{detail.header.username}</span></span>
                <span>{new Date(detail.header.created_at).toLocaleString()}</span>
                <span>{summarizeLog(detail.header)}</span>
                <span>Backup: <span className="font-mono text-foreground">{detail.header.backup_file}</span></span>
                {detail.header.reverted_at && (
                  <span className="text-foreground font-semibold">
                    Reverted by {detail.header.reverted_by} at {new Date(detail.header.reverted_at).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2 max-h-80 overflow-y-auto border rounded-md p-2">
                {detail.items.map((it, idx) => (
                  <div key={idx} className="border-b last:border-0 pb-2 last:pb-0">
                    <div className="text-xs font-semibold mb-1">{it.duration} — {it.battery_pack || it.product_id}</div>
                    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5 text-xs">
                      {Object.keys(it.after).map((field) => (
                        <div key={field} className="contents">
                          <span className="text-muted-foreground">{field}</span>
                          <span className="font-mono text-right">{String(it.before[field] ?? "—")}</span>
                          <span className="font-mono text-right">→ {String(it.after[field])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {!detail.header.reverted_at && (
                <div className="flex items-end gap-2 pt-2 border-t">
                  <div className="flex flex-col gap-1 flex-1">
                    <Label>Admin Password</Label>
                    <Input
                      type="password"
                      placeholder="Enter admin password to revert"
                      value={revertPassword}
                      onChange={(e) => setRevertPassword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && revertPassword && revertMut.mutate()}
                    />
                  </div>
                  <Button
                    variant="destructive"
                    disabled={revertMut.isPending || !revertPassword}
                    onClick={() => revertMut.mutate()}
                  >
                    {revertMut.isPending ? "Reverting…" : "Revert This Update"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Server Status Tab ─────────────────────────────────────────────────────────
function ServerStatusTab() {
  const [logLevel, setLogLevel] = useState<"ALL" | "ERROR" | "WARNING" | "INFO">("ALL");
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data: health, isError: healthError, isFetching: healthFetching, refetch: refetchHealth, dataUpdatedAt } = useQuery({
    queryKey: ["admin-health"],
    queryFn: () => api.get("/api/health").then(r => r.data),
    refetchInterval: 30000,
    retry: 1,
  });

  const { data: logs = [], isFetching: logsFetching, refetch: refetchLogs } = useQuery<LogEntry[]>({
    queryKey: ["admin-logs"],
    queryFn: () => api.get("/api/admin/logs").then(r => r.data),
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const online = !healthError && !!health;
  const lastCheck = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "—";

  const filteredLogs = logLevel === "ALL"
    ? logs
    : logs.filter(l => l.level.toUpperCase().includes(logLevel));

  const levelStyle = (lvl: string) => {
    const l = lvl.toUpperCase();
    if (l === "ERROR")   return "text-red-600 dark:text-red-400 font-semibold";
    if (l === "WARNING") return "text-amber-600 dark:text-amber-400 font-semibold";
    return "text-muted-foreground";
  };

  const rowStyle = (lvl: string) => {
    const l = lvl.toUpperCase();
    if (l === "ERROR")   return "bg-red-50/60 dark:bg-red-950/20";
    if (l === "WARNING") return "bg-amber-50/60 dark:bg-amber-950/20";
    return "";
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── status card ── */}
      <div className="border rounded-md p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Backend Status</span>
          <Button
            size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
            onClick={() => refetchHealth()}
            disabled={healthFetching}
          >
            {healthFetching
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            Check now
          </Button>
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <span className={cn(
              "inline-block h-3 w-3 rounded-full",
              online ? "bg-green-500" : "bg-red-500"
            )} />
            <span className="text-sm font-medium">{online ? "Online" : "Offline"}</span>
          </div>
          {online && (
            <div className="text-xs text-muted-foreground">
              Uptime: <span className="font-mono text-foreground">{fmtUptime(health.uptime_seconds)}</span>
            </div>
          )}
          {online && (
            <div className="text-xs text-muted-foreground">
              Version: <span className="font-mono text-foreground">{health.version}</span>
            </div>
          )}
          <div className="text-xs text-muted-foreground ml-auto">
            Last check: {lastCheck}
          </div>
        </div>
        {!online && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 rounded px-3 py-2">
            Cannot reach backend. The server process may be down or the network is unavailable.
          </p>
        )}
      </div>

      {/* ── log viewer ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">Error Logs</span>
          <span className="text-xs text-muted-foreground">({filteredLogs.length} entries)</span>
          <div className="flex gap-1 ml-2">
            {(["ALL", "ERROR", "WARNING", "INFO"] as const).map(lvl => (
              <button
                key={lvl}
                onClick={() => setLogLevel(lvl)}
                className={cn(
                  "px-2.5 py-0.5 rounded text-[11px] font-medium border transition-colors",
                  logLevel === lvl
                    ? lvl === "ERROR"   ? "bg-red-500 text-white border-red-500"
                    : lvl === "WARNING" ? "bg-amber-500 text-white border-amber-500"
                    : "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >{lvl}</button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh (10s)
            </label>
            <Button
              size="sm" variant="ghost" className="h-7 gap-1.5 text-xs"
              onClick={() => refetchLogs()}
              disabled={logsFetching}
            >
              {logsFetching
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <div className="border rounded-md overflow-auto max-h-[520px]">
          {filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {logsFetching ? "Loading…" : "No log entries"}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="text-left py-2 px-3 whitespace-nowrap font-semibold w-44">Timestamp</th>
                  <th className="text-left py-2 px-3 whitespace-nowrap font-semibold w-20">Level</th>
                  <th className="text-left py-2 px-3 whitespace-nowrap font-semibold w-16">Method</th>
                  <th className="text-left py-2 px-3 whitespace-nowrap font-semibold w-56">Path</th>
                  <th className="text-left py-2 px-3 whitespace-nowrap font-semibold w-20">Status</th>
                  <th className="text-left py-2 px-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((entry, i) => (
                  <tr key={i} className={cn("border-t border-muted/60", rowStyle(entry.level))}>
                    <td className="py-1.5 px-3 font-mono whitespace-nowrap">{entry.timestamp}</td>
                    <td className={cn("py-1.5 px-3 whitespace-nowrap", levelStyle(entry.level))}>{entry.level}</td>
                    <td className="py-1.5 px-3 font-mono whitespace-nowrap">{entry.method}</td>
                    <td className="py-1.5 px-3 font-mono truncate max-w-[224px]" title={entry.path}>{entry.path}</td>
                    <td className="py-1.5 px-3 font-mono whitespace-nowrap">{entry.status}</td>
                    <td className="py-1.5 px-3 text-muted-foreground truncate max-w-xs" title={entry.detail}>{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const qc = useQueryClient();
  const { isExpert, isLoading: meLoading } = useMe();
  const [tab, setTab] = useState<"users" | "server" | "history">("users");

  // ── create user dialog ─────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [cUsername, setCUsername] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRole, setCRole] = useState<"u" | "e" | "g">("u");

  // ── edit user dialog ───────────────────────────────────────────────────
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [eEmail, setEEmail] = useState("");
  const [eRole, setERole] = useState<"u" | "e" | "g">("u");
  const [ePassword, setEPassword] = useState("");

  // ── delete confirm ─────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // ── export master costing sheet ────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");

  const { data: users = [], isLoading } = useQuery<UserProfile[]>({
    queryKey: ["admin-users"],
    queryFn: () => api.get("/api/auth/users").then((r) => r.data),
    enabled: isExpert,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const createMut = useMutation({
    mutationFn: () => api.post("/api/auth/users", {
      username: cUsername.trim(), password: cPassword.trim(),
      email: cEmail.trim() || null, role: cRole,
    }),
    onSuccess: () => {
      toast.success(`User "${cUsername.trim()}" created`);
      setCUsername(""); setCPassword(""); setCEmail(""); setCRole("u");
      setCreateOpen(false);
      invalidate();
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed to create user")),
  });

  const updateMut = useMutation({
    mutationFn: () => api.patch(`/api/auth/users/${editUser!.username}`, {
      role: eRole,
      email: eEmail.trim() || null,
      password: ePassword.trim() || null,
    }),
    onSuccess: () => {
      toast.success("User updated");
      setEditUser(null); setEPassword("");
      invalidate();
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed to update user")),
  });

  const deleteMut = useMutation({
    mutationFn: (username: string) => api.delete(`/api/auth/users/${username}`),
    onSuccess: (_, username) => {
      toast.success(`User "${username}" deleted`);
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed to delete user")),
  });

  const exportMut = useMutation({
    mutationFn: () =>
      api.post("/api/costing/export-master", { password: exportPassword }, { responseType: "blob" }),
    onSuccess: (res) => {
      const disposition = res.headers["content-disposition"] || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : "costing_export.xlsx";
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export downloaded");
      setExportOpen(false);
      setExportPassword("");
    },
    onError: async (e: any) => {
      const blob = e?.response?.data;
      if (blob instanceof Blob) {
        try {
          const parsed = JSON.parse(await blob.text());
          toast.error(parsed.detail || "Export failed");
          return;
        } catch { /* not JSON, fall through */ }
      }
      toast.error(apiErr(e, "Export failed"));
    },
  });

  const openEdit = (u: UserProfile) => {
    setEditUser(u); setEEmail(u.email); setERole(u.role); setEPassword("");
  };

  if (meLoading) return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  if (!isExpert) return (
    <div className="p-8 flex flex-col gap-2">
      <h1 className="text-2xl font-bold">Admin</h1>
      <p className="text-muted-foreground text-sm">You do not have permission to view this page.</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full p-6 gap-5 overflow-auto">
      {/* ── Header + tabs ── */}
      <div className="flex items-center gap-4 shrink-0 flex-wrap">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex gap-1 p-1 rounded-lg bg-muted ml-2">
          {([["users", "User Management"], ["server", "Server Status"], ["history", "Mass Update History"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                tab === key
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >{label}</button>
          ))}
        </div>
        <Button size="sm" variant="outline" className={tab === "users" ? "" : "ml-auto"} onClick={() => setExportOpen(true)}>
          <Download className="h-4 w-4 mr-1.5" /> Export Master Costing Sheet
        </Button>
        {tab === "users" && (
          <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
            + Add User
          </Button>
        )}
      </div>

      {/* ── User Management tab ── */}
      {tab === "users" && (
        <>
          <div className="flex gap-4 shrink-0">
            <div className="border rounded-md px-5 py-3 flex flex-col">
              <span className="text-2xl font-bold">{users.filter((u) => u.role === "u").length}</span>
              <span className="text-xs text-muted-foreground">Regular users</span>
            </div>
            <div className="border rounded-md px-5 py-3 flex flex-col">
              <span className="text-2xl font-bold">{users.filter((u) => u.role === "e").length}</span>
              <span className="text-xs text-muted-foreground">Expert users</span>
            </div>
            <div className="border rounded-md px-5 py-3 flex flex-col">
              <span className="text-2xl font-bold">{users.filter((u) => u.role === "g").length}</span>
              <span className="text-xs text-muted-foreground">Guests</span>
            </div>
          </div>

          <div className="border rounded-md overflow-auto">
            {isLoading ? (
              <div className="py-10 text-center text-muted-foreground text-sm">Loading…</div>
            ) : (
              <table className="table-grid w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left py-2.5 px-4">Username</th>
                    <th className="text-left py-2.5 px-4">Email</th>
                    <th className="text-center py-2.5 px-4 w-28">Role</th>
                    <th className="text-center py-2.5 px-4 w-20">Type</th>
                    <th className="text-center py-2.5 px-4 w-36">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.username} className="hover:bg-accent/50">
                      <td className="py-2.5 px-4 font-medium font-mono">{u.username}</td>
                      <td className="py-2.5 px-4 text-muted-foreground">{u.email || "—"}</td>
                      <td className="py-2 px-4 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ROLE_COLORS[u.role] ?? ""}`}>
                          {ROLE_LABEL[u.role] ?? u.role}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-center">
                        {u.hardcoded
                          ? <span className="text-xs text-muted-foreground italic">built-in</span>
                          : <span className="text-xs text-muted-foreground">firebase</span>}
                      </td>
                      <td className="py-2 px-4 text-center">
                        {u.hardcoded ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="flex gap-1.5 justify-center">
                            <Button size="sm" variant="outline" onClick={() => openEdit(u)}>Edit</Button>
                            <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(u.username)}>Delete</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Server Status tab ── */}
      {tab === "server" && <ServerStatusTab />}

      {/* ── Mass Update History tab ── */}
      {tab === "history" && <MassUpdateHistoryTab />}

      {/* ── Create User Dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Username</Label>
              <Input placeholder="e.g. johndoe" value={cUsername} onChange={(e) => setCUsername(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Password</Label>
              <Input type="password" placeholder="Initial password" value={cPassword} onChange={(e) => setCPassword(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="email" placeholder="user@example.com" value={cEmail} onChange={(e) => setCEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <div className="flex gap-4">
                {(["u", "e", "g"] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="radio" name="create-role" checked={cRole === r} onChange={() => setCRole(r)} />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!cUsername.trim() || !cPassword.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              {createMut.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ── */}
      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit — <span className="font-mono">{editUser?.username}</span></DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <div className="flex gap-4">
                {(["u", "e", "g"] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="radio" name="edit-role" checked={eRole === r} onChange={() => setERole(r)} />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" placeholder="user@example.com" value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>New Password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
              <Input type="password" placeholder="New password" value={ePassword} onChange={(e) => setEPassword(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button disabled={updateMut.isPending} onClick={() => updateMut.mutate()}>
              {updateMut.isPending ? "Saving…" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Delete User?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            This will permanently remove{" "}
            <span className="font-mono font-semibold text-foreground">{deleteTarget}</span>{" "}
            from Firebase. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget)}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export Master Costing Sheet Dialog ── */}
      <Dialog open={exportOpen} onOpenChange={(v) => { setExportOpen(v); if (!v) setExportPassword(""); }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Export Master Costing Sheet</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-1">
            Exports every active product across every duration to an Excel workbook, one sheet per duration.
            Enter the secret password to continue.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="Secret password"
              value={exportPassword}
              onChange={(e) => setExportPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && exportPassword && exportMut.mutate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button disabled={exportMut.isPending || !exportPassword} onClick={() => exportMut.mutate()}>
              {exportMut.isPending ? "Exporting…" : "Export"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
