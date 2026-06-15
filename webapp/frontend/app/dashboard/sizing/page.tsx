"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api , apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Project { name: string; count: number }

export default function SizingProjectsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["sizing-projects"],
    queryFn: () => api.get("/api/sizing/projects").then((r) => r.data),
  });

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

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      <h1 className="text-3xl font-bold">Sizing</h1>

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
                onDoubleClick={() => router.push(`/dashboard/sizing/${encodeURIComponent(p.name)}`)}
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
    </div>
  );
}
