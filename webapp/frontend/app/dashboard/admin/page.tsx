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
import { RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserProfile {
  username: string;
  email: string;
  role: "u" | "e";
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

const ROLE_LABEL: Record<string, string> = { u: "User", e: "Expert" };
const ROLE_COLORS: Record<string, string> = {
  u: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  e: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

function fmtUptime(s: number) {
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
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
  const [tab, setTab] = useState<"users" | "server">("users");

  // ── create user dialog ─────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [cUsername, setCUsername] = useState("");
  const [cPassword, setCPassword] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRole, setCRole] = useState<"u" | "e">("u");

  // ── edit user dialog ───────────────────────────────────────────────────
  const [editUser, setEditUser] = useState<UserProfile | null>(null);
  const [eEmail, setEEmail] = useState("");
  const [eRole, setERole] = useState<"u" | "e">("u");
  const [ePassword, setEPassword] = useState("");

  // ── delete confirm ─────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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
          {([["users", "User Management"], ["server", "Server Status"]] as const).map(([key, label]) => (
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
                {(["u", "e"] as const).map((r) => (
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
                {(["u", "e"] as const).map((r) => (
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
    </div>
  );
}
