"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Wand2, Trash2, History, Loader2 } from "lucide-react";

interface ProjectQuoteSummary {
  quote_code: string;
  customer_name: string;
  solution_provider: string;
  created_at: number;
}

// minimal shape needed to check restorability — the wizard page itself owns the full ColState type
interface WizardColLike {
  costing_rows?: unknown[];
}

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

  // ── Load Past Wizard ──────────────────────────────────────────────────────
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [pastProjects, setPastProjects] = useState<ProjectQuoteSummary[]>([]);
  const [loadingPast, setLoadingPast] = useState(false);
  const [restoringCode, setRestoringCode] = useState<string | null>(null);

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

  const openLoadPast = async () => {
    setLoadDialogOpen(true);
    setLoadingPast(true);
    try {
      const res = await api.get("/api/sizing/project-quotes");
      setPastProjects(res.data as ProjectQuoteSummary[]);
    } catch (e: unknown) {
      toast.error(apiErr(e, "Failed to load past projects"));
      setPastProjects([]);
    } finally {
      setLoadingPast(false);
    }
  };

  const handleRestore = async (code: string, id: string) => {
    setRestoringCode(code);
    try {
      const res = await api.get(`/api/sizing/project-quotes/${encodeURIComponent(code)}`);
      const entry = res.data as {
        customer_name?: string;
        solution_provider?: string;
        full_state?: { customer_name?: string; solution_provider?: string; cols?: WizardColLike[]; groups?: unknown[] };
      };
      const fs = entry.full_state;
      if (!fs || !Array.isArray(fs.cols) || !fs.cols.length) {
        toast.error("This project export has no restorable sizing data");
        return;
      }
      const proj: WizardProject = {
        id,
        name: `Loaded: ${entry.customer_name || code}`,
        count: fs.cols.length,
        created_at: new Date().toISOString(),
      };
      const updated = [proj, ...projects];
      saveProjects(updated);
      setProjects(updated);
      localStorage.setItem(`wizard_data_${id}`, JSON.stringify({
        customer_name: fs.customer_name || entry.customer_name || "",
        solution_provider: fs.solution_provider || entry.solution_provider || "",
        cols: fs.cols,
        groups: fs.groups || [],
        calc_done: true,
        costing_done: fs.cols.some(c => Array.isArray(c.costing_rows) && c.costing_rows.length > 0),
        quote_code: "",
      }));
      setLoadDialogOpen(false);
      router.push(`/dashboard/wizard/${id}`);
    } catch (e: unknown) {
      toast.error(apiErr(e, "Failed to restore project"));
    } finally {
      setRestoringCode(null);
    }
  };

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      <div className="flex items-center gap-3">
        <Wand2 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Wizard</h1>
        <Button variant="outline" className="ml-auto gap-1.5" onClick={openLoadPast}>
          <History className="h-4 w-4" />
          Load Past Wizard
        </Button>
        <Button onClick={() => setDialogOpen(true)}>New Comparison</Button>
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
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
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

      <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Load Past Wizard</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Restores a previously-exported project into a new, editable comparison.
          </p>
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
            {loadingPast && (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loadingPast && pastProjects.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No past project exports found.
              </p>
            )}
            {pastProjects.map(p => (
              <button
                key={p.quote_code}
                type="button"
                disabled={restoringCode !== null}
                onClick={() => handleRestore(p.quote_code, `wiz_${Date.now()}`)}
                className="flex items-center justify-between px-3 py-2 rounded-md text-xs border border-transparent hover:bg-muted text-left disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="font-medium block truncate">{p.quote_code}</span>
                  <span className="text-muted-foreground block truncate">
                    {p.customer_name || "—"} · {p.solution_provider || "—"}
                  </span>
                </span>
                {restoringCode === p.quote_code
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 ml-2" />
                  : <span className="text-muted-foreground shrink-0 ml-2">
                      {p.created_at ? new Date(p.created_at).toLocaleDateString() : ""}
                    </span>}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLoadDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
