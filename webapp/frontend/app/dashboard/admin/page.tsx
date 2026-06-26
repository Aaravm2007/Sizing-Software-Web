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

interface UserProfile {
  username: string;
  email: string;
  role: "u" | "e";
  hardcoded: boolean;
}

const ROLE_LABEL: Record<string, string> = { u: "User", e: "Expert" };
const ROLE_COLORS: Record<string, string> = {
  u: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  e: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

export default function AdminPage() {
  const qc = useQueryClient();
  const { isExpert, isLoading: meLoading } = useMe();

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
    setEditUser(u);
    setEEmail(u.email);
    setERole(u.role);
    setEPassword("");
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
      {/* Header */}
      <div className="flex items-center gap-4 shrink-0">
        <h1 className="text-2xl font-bold">User Management</h1>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {users.length} account{users.length !== 1 ? "s" : ""}
        </span>
        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          + Add User
        </Button>
      </div>

      {/* Stats row */}
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

      {/* User table */}
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
                    {u.hardcoded ? (
                      <span className="text-xs text-muted-foreground italic">built-in</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">firebase</span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-center">
                    {u.hardcoded ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex gap-1.5 justify-center">
                        <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setDeleteTarget(u.username)}>
                          Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create User Dialog ─────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New User</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Username</Label>
              <Input
                placeholder="e.g. johndoe"
                value={cUsername}
                onChange={(e) => setCUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="Initial password"
                value={cPassword}
                onChange={(e) => setCPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <div className="flex gap-4">
                {(["u", "e"] as const).map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="create-role"
                      checked={cRole === r}
                      onChange={() => setCRole(r)}
                    />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!cUsername.trim() || !cPassword.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Dialog ───────────────────────────────────────────────── */}
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
                    <input
                      type="radio"
                      name="edit-role"
                      checked={eRole === r}
                      onChange={() => setERole(r)}
                    />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={eEmail}
                onChange={(e) => setEEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>New Password <span className="text-muted-foreground font-normal">(leave blank to keep current)</span></Label>
              <Input
                type="password"
                placeholder="New password"
                value={ePassword}
                onChange={(e) => setEPassword(e.target.value)}
              />
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

      {/* ── Delete Confirm Dialog ──────────────────────────────────────────── */}
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
