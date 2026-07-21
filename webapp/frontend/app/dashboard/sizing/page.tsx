"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { useMe } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Project { name: string; count: number }
interface SharedProject { username: string; name: string; count: number }

export default function SizingProjectsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isExpert, username: myUsername } = useMe();
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"mine" | "all">("mine");
  const [search, setSearch] = useState("");
  const [usernameFilter, setUsernameFilter] = useState("");

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["sizing-projects"],
    queryFn: () => api.get("/api/sizing/projects").then((r) => r.data),
    enabled: view === "mine",
  });

  const { data: sharedProjects = [], isLoading: isLoadingShared } = useQuery<SharedProject[]>({
    queryKey: ["sizing-all-projects"],
    queryFn: () => api.get("/api/sizing/all-projects").then((r) => r.data),
    enabled: view === "all" && isExpert,
  });

  const usernames = useMemo(
    () => Array.from(new Set(sharedProjects.map((p) => p.username))).sort(),
    [sharedProjects]
  );

  const filteredShared = useMemo(() => {
    return sharedProjects.filter((p) => {
      if (usernameFilter && p.username !== usernameFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.username.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [sharedProjects, search, usernameFilter]);

  const createMut = useMutation({
    mutationFn: (name: string) => api.post("/api/sizing/projects", { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sizing-projects"] }); setNewName(""); },
    onError: (e: any) => toast.error(apiErr(e, "Create failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (name: string) => api.delete(`/api/sizing/projects/${encodeURIComponent(name)}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sizing-projects"] }); setSelected(null); },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const handleAdd = () => {
    const n = newName.trim();
    if (!n) { toast.warning("Please enter a project name."); return; }
    createMut.mutate(n);
  };

  const openProject = (name: string, owner?: string) => {
    if (owner && owner !== myUsername) {
      router.push(`/dashboard/sizing/${encodeURIComponent(name)}?owner=${encodeURIComponent(owner)}`);
    } else {
      router.push(`/dashboard/sizing/${encodeURIComponent(name)}`);
    }
  };

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-3xl font-bold">Sizing</h1>
        {isExpert && (
          <div className="flex gap-1 p-1 rounded-lg bg-muted ml-2">
            {([["mine", "My Projects"], ["all", "All Users"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  view === key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "mine" ? (
        <>
          <div className="flex items-center gap-3">
            <Label>Project Name</Label>
            <Input
              className="w-80"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Enter project name"
            />
            <Button onClick={handleAdd} disabled={createMut.isPending}>New Project</Button>
          </div>

          <div className="flex-1 overflow-auto border rounded-md">
            <table className="table-grid w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-center py-2 px-4 w-24">Sr. No</th>
                  <th className="text-center py-2 px-4">Project Name</th>
                  <th className="text-center py-2 px-4 w-36">No of Sizing</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={3} className="text-center py-8 text-muted-foreground">Loading…</td></tr>}
                {!isLoading && projects.length === 0 && <tr><td colSpan={3} className="text-center py-8 text-muted-foreground">No projects yet</td></tr>}
                {projects.map((p, i) => (
                  <tr
                    key={p.name}
                    className={`cursor-pointer hover:bg-accent ${selected === p.name ? "bg-primary/20" : ""}`}
                    onClick={() => setSelected(p.name)}
                    onDoubleClick={() => openProject(p.name)}
                  >
                    <td className="text-center py-2 px-4">{i + 1}</td>
                    <td className="text-center py-2 px-4">{p.name}</td>
                    <td className="text-center py-2 px-4">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button variant="destructive" onClick={() => selected && deleteMut.mutate(selected)} disabled={!selected || deleteMut.isPending}>
              Delete
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              className="w-64"
              placeholder="Search project or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="h-9 rounded-md border px-3 text-sm bg-background w-52"
              value={usernameFilter}
              onChange={(e) => setUsernameFilter(e.target.value)}
            >
              <option value="">All users</option>
              {usernames.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-auto border rounded-md">
            <table className="table-grid w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-center py-2 px-4 w-24">Sr. No</th>
                  <th className="text-center py-2 px-4">Username</th>
                  <th className="text-center py-2 px-4">Project Name</th>
                  <th className="text-center py-2 px-4 w-36">No of Sizing</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingShared && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Loading…</td></tr>}
                {!isLoadingShared && filteredShared.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">No projects found</td></tr>}
                {filteredShared.map((p, i) => (
                  <tr
                    key={`${p.username}:${p.name}`}
                    className="cursor-pointer hover:bg-accent"
                    onDoubleClick={() => openProject(p.name, p.username)}
                  >
                    <td className="text-center py-2 px-4">{i + 1}</td>
                    <td className="text-center py-2 px-4 font-medium">{p.username}</td>
                    <td className="text-center py-2 px-4">{p.name}</td>
                    <td className="text-center py-2 px-4">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Double-click a project to open it.</p>
        </>
      )}
    </div>
  );
}
