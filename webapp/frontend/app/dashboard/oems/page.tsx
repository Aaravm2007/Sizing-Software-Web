"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Factory, Trash2, Plus } from "lucide-react";

interface Oem {
  id: number;
  name: string;
  created_at: number | null;
}

export default function OemsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Oem | null>(null);

  const { data: oems = [], isLoading } = useQuery<Oem[]>({
    queryKey: ["oems"],
    queryFn: () => api.get("/api/oems").then((r) => r.data),
  });

  const createMut = useMutation({
    mutationFn: () => api.post("/api/oems", { name: name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oems"] });
      setAddOpen(false);
      setName("");
      toast.success("OEM added");
    },
    onError: (e) => toast.error(apiErr(e, "Failed to add OEM")),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/oems/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oems"] });
      setDeleteTarget(null);
      toast.success("OEM deleted");
    },
    onError: (e) => toast.error(apiErr(e, "Failed to delete OEM")),
  });

  return (
    <div className="p-6 flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">OEMs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Per-OEM sizing &amp; costing reference sheets, admin-only.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}><Plus size={14} className="mr-1" /> Add OEM</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : oems.length === 0 ? (
        <p className="text-sm text-muted-foreground">No OEMs yet — add one to get started.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {oems.map((oem) => (
            <div
              key={oem.id}
              className="flex items-center justify-between border rounded-md px-4 py-3 hover:bg-muted/40 transition-colors cursor-pointer"
              onClick={() => router.push(`/dashboard/oems/${oem.id}`)}
            >
              <div className="flex items-center gap-2">
                <Factory size={16} className="text-muted-foreground" />
                <span className="font-medium">{oem.name}</span>
              </div>
              <button
                className="text-muted-foreground hover:text-destructive p-1"
                onClick={(e) => { e.stopPropagation(); setDeleteTarget(oem); }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add OEM</DialogTitle></DialogHeader>
          <Input
            placeholder="e.g. Schneider"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) createMut.mutate(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {deleteTarget?.name}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes every sheet and product under this OEM. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)} disabled={deleteMut.isPending}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
