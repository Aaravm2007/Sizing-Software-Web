"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Wand2, Trash2 } from "lucide-react";

interface WizardProject {
  id: string;
  name: string;
  count: number;
  created_at: string;
}

function loadProjects(): WizardProject[] {
  try { return JSON.parse(localStorage.getItem("wizard_projects") || "[]"); }
  catch { return []; }
}

function saveProjects(projects: WizardProject[]) {
  localStorage.setItem("wizard_projects", JSON.stringify(projects));
}

export default function WizardListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<WizardProject[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCount, setNewCount] = useState("2");

  useEffect(() => { setProjects(loadProjects()); }, []);

  const handleCreate = () => {
    const count = Math.max(parseInt(newCount) || 2, 2);
    const id = `wiz_${Date.now()}`;
    const proj: WizardProject = { id, name: newName.trim() || `Comparison ${projects.length + 1}`, count, created_at: new Date().toISOString() };
    const updated = [proj, ...projects];
    saveProjects(updated);
    setProjects(updated);
    setDialogOpen(false);
    setNewName("");
    setNewCount("2");
    router.push(`/dashboard/wizard/${id}`);
  };

  const handleDelete = (id: string) => {
    const updated = projects.filter(p => p.id !== id);
    saveProjects(updated);
    localStorage.removeItem(`wizard_data_${id}`);
    setProjects(updated);
  };

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      <div className="flex items-center gap-3">
        <Wand2 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Wizard</h1>
        <Button className="ml-auto" onClick={() => setDialogOpen(true)}>New Comparison</Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Compare multiple sizings side-by-side and pull costing for each. Experimental feature.
      </p>

      {projects.length === 0 && (
        <p className="text-muted-foreground text-sm py-8 text-center">No comparisons yet. Click "New Comparison" to start.</p>
      )}

      <div className="flex flex-col gap-2 overflow-auto">
        {projects.map(p => (
          <div key={p.id} className="border rounded-md p-3 flex items-center gap-3 bg-card">
            <Wand2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.count} sizings · {new Date(p.created_at).toLocaleDateString()}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/wizard/${p.id}`)}>Open</Button>
            <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>New Comparison</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label>Name</Label>
              <Input placeholder="e.g. Q3 Options" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()} autoFocus />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Number of Sizings</Label>
              <Input type="number" min={2} value={newCount} onChange={e => setNewCount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
