"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, Plus, Trash2, Pencil, Check, Upload, X } from "lucide-react";
import { api, apiErr } from "@/lib/api";
import { useMe } from "@/lib/use-me";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ── types ─────────────────────────────────────────────────────────────────────

interface CellVoltage {
  chemistry: string;
  nominal: number;
  max_v: number;
  end_v: number;
}

interface DcCell {
  dc_voltage: number;
  num_cells: number;
}


// ── Cell Voltages table ────────────────────────────────────────────────────────

function CellVoltagesTable() {
  const qc = useQueryClient();
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<CellVoltage | null>(null);
  const [newRow, setNewRow] = useState<CellVoltage>({ chemistry: "", nominal: 0, max_v: 0, end_v: 0 });

  const { data: rows = [], isLoading } = useQuery<CellVoltage[]>({
    queryKey: ["cell-voltages"],
    queryFn: () => api.get("/api/formulas/cell-voltages").then((r) => r.data),
  });

  const update = useMutation({
    mutationFn: (row: CellVoltage) =>
      api.put(`/api/formulas/cell-voltages/${row.chemistry}`, row),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cell-voltages"] }); setEditKey(null); toast.success("Saved"); },
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  const create = useMutation({
    mutationFn: (row: CellVoltage) => api.post("/api/formulas/cell-voltages", row),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cell-voltages"] }); setNewRow({ chemistry: "", nominal: 0, max_v: 0, end_v: 0 }); toast.success("Added"); },
    onError: (e: any) => toast.error(apiErr(e, "Add failed")),
  });

  const remove = useMutation({
    mutationFn: (chemistry: string) => api.delete(`/api/formulas/cell-voltages/${chemistry}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cell-voltages"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const { isExpert: admin } = useMe();
  const startEdit = (row: CellVoltage) => { setEditKey(row.chemistry); setEditRow({ ...row }); };
  const cancelEdit = () => { setEditKey(null); setEditRow(null); };
  const canAdd = newRow.chemistry.trim().length > 0;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      {admin && (
        <div className="flex gap-2 items-center flex-wrap">
          <Input
            className="w-24 font-mono" placeholder="e.g. NMC"
            value={newRow.chemistry}
            onChange={(e) => setNewRow({ ...newRow, chemistry: e.target.value.toUpperCase() })}
            onKeyDown={(e) => e.key === "Enter" && canAdd && create.mutate(newRow)}
          />
          <Input
            type="number" step="0.01" className="w-28" placeholder="Nominal (V)"
            value={newRow.nominal || ""}
            onChange={(e) => setNewRow({ ...newRow, nominal: parseFloat(e.target.value) || 0 })}
            onKeyDown={(e) => e.key === "Enter" && canAdd && create.mutate(newRow)}
          />
          <Input
            type="number" step="0.01" className="w-28" placeholder="Max (V)"
            value={newRow.max_v || ""}
            onChange={(e) => setNewRow({ ...newRow, max_v: parseFloat(e.target.value) || 0 })}
            onKeyDown={(e) => e.key === "Enter" && canAdd && create.mutate(newRow)}
          />
          <Input
            type="number" step="0.01" className="w-28" placeholder="End (V)"
            value={newRow.end_v || ""}
            onChange={(e) => setNewRow({ ...newRow, end_v: parseFloat(e.target.value) || 0 })}
            onKeyDown={(e) => e.key === "Enter" && canAdd && create.mutate(newRow)}
          />
          <Button size="sm" onClick={() => create.mutate(newRow)} disabled={!canAdd || create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Chemistry</TableHead>
            <TableHead>Nominal (V)</TableHead>
            <TableHead>Max Charge (V)</TableHead>
            <TableHead>End / Min (V)</TableHead>
            {admin && <TableHead className="w-20"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) =>
            admin && editKey === row.chemistry && editRow ? (
              <TableRow key={row.chemistry}>
                <TableCell className="font-mono font-semibold">{row.chemistry}</TableCell>
                <TableCell>
                  <Input type="number" step="0.01" className="h-7 w-24" value={editRow.nominal}
                    onChange={(e) => setEditRow({ ...editRow, nominal: parseFloat(e.target.value) || 0 })} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" className="h-7 w-24" value={editRow.max_v}
                    onChange={(e) => setEditRow({ ...editRow, max_v: parseFloat(e.target.value) || 0 })} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="0.01" className="h-7 w-24" value={editRow.end_v}
                    onChange={(e) => setEditRow({ ...editRow, end_v: parseFloat(e.target.value) || 0 })} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => update.mutate(editRow)}><Check size={14} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}><X size={14} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={row.chemistry}>
                <TableCell className="font-mono font-semibold">{row.chemistry}</TableCell>
                <TableCell>{row.nominal}</TableCell>
                <TableCell>{row.max_v}</TableCell>
                <TableCell>{row.end_v}</TableCell>
                {admin && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(row)}><Pencil size={13} /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(row.chemistry)}><Trash2 size={13} /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            )
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── DC→Cells table ────────────────────────────────────────────────────────────

function DcCellsTable() {
  const qc = useQueryClient();
  const [editKey, setEditKey] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<DcCell | null>(null);
  const [newRow, setNewRow] = useState<DcCell>({ dc_voltage: 0, num_cells: 0 });

  const { data: rows = [], isLoading } = useQuery<DcCell[]>({
    queryKey: ["dc-cells"],
    queryFn: () => api.get("/api/formulas/dc-cells").then((r) => r.data),
  });

  const update = useMutation({
    mutationFn: (row: DcCell) =>
      api.put(`/api/formulas/dc-cells/${row.dc_voltage}`, row),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dc-cells"] }); setEditKey(null); toast.success("Saved"); },
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  const create = useMutation({
    mutationFn: (row: DcCell) => api.post("/api/formulas/dc-cells", row),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dc-cells"] }); setNewRow({ dc_voltage: 0, num_cells: 0 }); toast.success("Added"); },
    onError: (e: any) => toast.error(apiErr(e, "Add failed")),
  });

  const remove = useMutation({
    mutationFn: (v: number) => api.delete(`/api/formulas/dc-cells/${v}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dc-cells"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const { isExpert: admin } = useMe();
  const startEdit = (row: DcCell) => { setEditKey(row.dc_voltage); setEditRow({ ...row }); };
  const cancelEdit = () => { setEditKey(null); setEditRow(null); };
  const canAdd = newRow.dc_voltage > 0 && newRow.num_cells > 0;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      {admin && (
        <div className="flex gap-2 items-center">
          <Input
            type="number" step="1" className="w-32 font-mono" placeholder="DC Voltage (V)"
            value={newRow.dc_voltage || ""}
            onChange={(e) => setNewRow({ ...newRow, dc_voltage: parseInt(e.target.value) || 0 })}
            onKeyDown={(e) => e.key === "Enter" && canAdd && create.mutate(newRow)}
          />
          <Input
            type="number" step="1" className="w-32" placeholder="Num Cells"
            value={newRow.num_cells || ""}
            onChange={(e) => setNewRow({ ...newRow, num_cells: parseInt(e.target.value) || 0 })}
            onKeyDown={(e) => e.key === "Enter" && canAdd && create.mutate(newRow)}
          />
          <Button size="sm" onClick={() => create.mutate(newRow)} disabled={!canAdd || create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>DC Voltage (V)</TableHead>
            <TableHead>Number of Cells</TableHead>
            {admin && <TableHead className="w-20"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) =>
            admin && editKey === row.dc_voltage && editRow ? (
              <TableRow key={row.dc_voltage}>
                <TableCell className="font-mono font-semibold">{row.dc_voltage} V</TableCell>
                <TableCell>
                  <Input type="number" step="1" className="h-7 w-28" value={editRow.num_cells}
                    onChange={(e) => setEditRow({ ...editRow, num_cells: parseInt(e.target.value) || 0 })} />
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => update.mutate(editRow)}><Check size={14} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelEdit}><X size={14} /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <TableRow key={row.dc_voltage}>
                <TableCell className="font-mono font-semibold">{row.dc_voltage} V</TableCell>
                <TableCell>{row.num_cells}</TableCell>
                {admin && (
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(row)}><Pencil size={13} /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove.mutate(row.dc_voltage)}><Trash2 size={13} /></Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            )
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Backup time presets ────────────────────────────────────────────────────────

interface BackupTime { name: string; has_products: boolean; is_preset: boolean; product_count: number; }

function BackupTimesTable() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");

  const { data: rows = [], isLoading } = useQuery<BackupTime[]>({
    queryKey: ["backup-times"],
    queryFn: () => api.get("/api/formulas/backup-times").then((r) => r.data),
  });

  const add = useMutation({
    mutationFn: () => api.post("/api/formulas/backup-times", { name: newName.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["backup-times"] }); qc.invalidateQueries({ queryKey: ["costing-durations"] }); setNewName(""); toast.success("Added"); },
    onError: (e: any) => toast.error(apiErr(e, "Add failed")),
  });

  const remove = useMutation({
    mutationFn: (name: string) => api.delete(`/api/formulas/backup-times/${encodeURIComponent(name)}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["backup-times"] }); qc.invalidateQueries({ queryKey: ["costing-durations"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-center">
        <Input
          className="w-40"
          placeholder="e.g. 900min"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newName.trim() && add.mutate()}
        />
        <Button size="sm" onClick={() => add.mutate()} disabled={!newName.trim() || add.isPending}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Duration</TableHead>
              <TableHead>Products</TableHead>
              <TableHead>Custom Preset</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell className="font-mono">{r.name}</TableCell>
                <TableCell>{r.has_products ? r.product_count : "—"}</TableCell>
                <TableCell>{r.is_preset ? "Yes" : "—"}</TableCell>
                <TableCell>
                  {r.is_preset && (
                    <button
                      className={r.has_products
                        ? "text-muted-foreground/40 cursor-not-allowed"
                        : "text-destructive hover:opacity-70"}
                      title={r.has_products ? `Cannot delete: ${r.product_count} product(s) use this duration` : "Delete"}
                      onClick={() => !r.has_products && remove.mutate(r.name)}
                      disabled={r.has_products || remove.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ── Datasheet / GAD file manager ─────────────────────────────────────────────

function FileManagerPanel({ folderKey }: { folderKey: "datasheets" | "gads" }) {
  const [view, setView] = useState<"active" | "archived">("active");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [pwOpen, setPwOpen] = useState(false);
  const [pwTarget, setPwTarget] = useState<string[]>([]);
  const [pwValue, setPwValue] = useState("");
  const [pwError, setPwError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const { data: activeData, isLoading: activeLoading, refetch: refetchActive } = useQuery<string[]>({
    queryKey: ["datafiles", folderKey, "active"],
    queryFn: () => api.get(`/api/datafiles/${folderKey}/files?view=active`).then((r) => r.data.files),
  });

  const { data: archivedData, isLoading: archivedLoading, refetch: refetchArchived } = useQuery<string[]>({
    queryKey: ["datafiles", folderKey, "archived"],
    queryFn: () => api.get(`/api/datafiles/${folderKey}/files?view=archived`).then((r) => r.data.files),
  });

  const activeCount = activeData?.length ?? 0;
  const archivedCount = archivedData?.length ?? 0;
  const files = view === "active" ? (activeData ?? []) : (archivedData ?? []);
  const isLoading = view === "active" ? activeLoading : archivedLoading;
  const refetch = () => { refetchActive(); refetchArchived(); };
  const allChecked = files.length > 0 && files.every((f) => selected.has(f));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(files));
  const toggleOne = (f: string) =>
    setSelected((s) => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n; });

  const switchView = (v: "active" | "archived") => {
    setView(v);
    setSelected(new Set());
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!fileList.length) return;

    const batches: File[][] = [];
    for (let i = 0; i < fileList.length; i += 10) batches.push(fileList.slice(i, i + 10));

    setUploading(true);
    setUploadProgress({ done: 0, total: fileList.length });

    const uploadBatch = async (batch: File[]) => {
      const fd = new FormData();
      batch.forEach((f) => fd.append("files", f));
      await api.post(`/api/datafiles/${folderKey}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadProgress((prev) => ({ ...prev, done: prev.done + batch.length }));
    };

    try {
      await Promise.all(batches.map(uploadBatch));
      toast.success(`Imported ${fileList.length} file(s)`);
      refetch();
    } catch {
      toast.error("Some files failed to upload");
    } finally {
      setUploading(false);
    }
  };

  const openArchive = (filenames: string[]) => {
    setPwTarget(filenames);
    setPwValue("");
    setPwError("");
    setPwOpen(true);
  };

  const confirmArchive = async () => {
    setPwError("");
    try {
      await api.post("/api/auth/verify-password", { password: pwValue });
    } catch {
      setPwError("Incorrect password");
      return;
    }
    setArchiving(true);
    try {
      await api.post(`/api/datafiles/${folderKey}/archive`, { filenames: pwTarget });
      toast.success(`Archived ${pwTarget.length} file(s)`);
      setSelected((s) => { const n = new Set(s); pwTarget.forEach((f) => n.delete(f)); return n; });
      setPwOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(apiErr(err, "Archive failed"));
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async (filenames: string[]) => {
    setRestoring(true);
    try {
      await api.post(`/api/datafiles/${folderKey}/restore`, { filenames });
      toast.success(`Restored ${filenames.length} file(s)`);
      setSelected((s) => { const n = new Set(s); filenames.forEach((f) => n.delete(f)); return n; });
      refetch();
    } catch (err: any) {
      toast.error(apiErr(err, "Restore failed"));
    } finally {
      setRestoring(false);
    }
  };

  const label = folderKey === "datasheets" ? "Datasheet" : "GAD";

  return (
    <div className="flex flex-col gap-4">
      {/* Active / Archived sub-tabs */}
      <div className="flex gap-1 border-b">
        {(["active", "archived"] as const).map((v) => (
          <button
            key={v}
            onClick={() => switchView(v)}
            className={
              "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors " +
              (view === v
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {v === "active" ? `Active (${activeCount})` : `Archived (${archivedCount})`}
          </button>
        ))}
      </div>

      {/* Action bar — only shown in active view */}
      {view === "active" && (
        <div className="flex gap-2 items-center flex-wrap">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleImport} />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload className="h-4 w-4 mr-1" />
            {uploading
              ? `Uploading ${uploadProgress.done} / ${uploadProgress.total}…`
              : `Import ${label}s`}
          </Button>
          <Button
            size="sm" variant="outline"
            disabled={selected.size === 0 || archiving}
            onClick={() => openArchive([...selected])}
          >
            <Archive className="h-4 w-4 mr-1" />
            Mass Archive {selected.size > 0 && `(${selected.size})`}
          </Button>
        </div>
      )}

      {/* Mass restore bar — only shown in archived view */}
      {view === "archived" && selected.size > 0 && (
        <div className="flex gap-2 items-center">
          <Button
            size="sm" variant="outline"
            disabled={restoring}
            onClick={() => handleRestore([...selected])}
          >
            Mass Restore ({selected.size})
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} className="cursor-pointer" />
              </TableHead>
              <TableHead>Filename</TableHead>
              <TableHead className="w-28"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((f) => (
              <TableRow key={f}>
                <TableCell>
                  <input type="checkbox" checked={selected.has(f)} onChange={() => toggleOne(f)} className="cursor-pointer" />
                </TableCell>
                <TableCell className="font-mono text-sm">{f}</TableCell>
                <TableCell>
                  {view === "active" ? (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => openArchive([f])}
                    >
                      <Archive className="h-3 w-3 mr-1" /> Archive
                    </Button>
                  ) : (
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                      disabled={restoring}
                      onClick={() => handleRestore([f])}
                    >
                      Restore
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={pwOpen} onOpenChange={(o) => !o && setPwOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Archive</DialogTitle>
            <DialogDescription>
              {pwTarget.length === 1
                ? `Enter your password to archive "${pwTarget[0]}".`
                : `Enter your password to archive ${pwTarget.length} file(s).`}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password" placeholder="Password" value={pwValue}
            onChange={(e) => setPwValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pwValue && confirmArchive()}
            autoFocus
          />
          {pwError && <p className="text-sm text-destructive">{pwError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmArchive} disabled={!pwValue || archiving}>
              {archiving ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DatasheetGadTab() {
  const [subTab, setSubTab] = useState<"datasheets" | "gads">("datasheets");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b">
        {(["datasheets", "gads"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={
              "px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors " +
              (subTab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t === "datasheets" ? "Datasheets" : "GAD"}
          </button>
        ))}
      </div>
      <FileManagerPanel key={subTab} folderKey={subTab} />
    </div>
  );
}

// ── Quote Rates ───────────────────────────────────────────────────────────────

const RATE_LABELS: Record<string, string> = {
  fire_suppression: "Fire Suppression System (per module)",
  rmd_hvl: "Remote Monitoring Device — HVL (per module)",
  rmd_efl: "Remote Monitoring Device — EFL (per module)",
  subscription: "Subscription Charges (per year)",
};

function QuoteRatesTable() {
  const qc = useQueryClient();
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const { data: rates = [], isLoading } = useQuery<{ key: string; value: number; description: string }[]>({
    queryKey: ["quote-rates"],
    queryFn: () => api.get("/api/formulas/quote-rates").then((r) => r.data),
  });

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      api.put("/api/formulas/quote-rates", { key, value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quote-rates"] }); setEditKey(null); toast.success("Saved"); },
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead className="text-right">Rate (₹)</TableHead>
          <TableHead className="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rates.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="text-sm">{RATE_LABELS[r.key] ?? r.description}</TableCell>
            <TableCell className="text-right">
              {editKey === r.key ? (
                <Input type="number" className="w-32 ml-auto text-right" value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") save.mutate({ key: r.key, value: parseFloat(editVal) || 0 }); if (e.key === "Escape") setEditKey(null); }}
                  autoFocus />
              ) : (
                <span className="font-mono">₹{r.value.toLocaleString()}</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex gap-1 justify-end">
                {editKey === r.key ? (
                  <>
                    <button onClick={() => save.mutate({ key: r.key, value: parseFloat(editVal) || 0 })} className="p-1 hover:text-primary"><Check className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setEditKey(null)} className="p-1 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </>
                ) : (
                  <button onClick={() => { setEditKey(r.key); setEditVal(String(r.value)); }} className="p-1 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ModularRackRatesTable() {
  const qc = useQueryClient();
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editNewKey, setEditNewKey] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newPrice, setNewPrice] = useState("");

  const { data: racks = [], isLoading } = useQuery<{ key: string; price: number }[]>({
    queryKey: ["modular-rack-rates"],
    queryFn: () => api.get("/api/formulas/modular-rack-rates").then((r) => r.data),
  });

  const add = useMutation({
    mutationFn: () => api.post("/api/formulas/modular-rack-rates", { old_key: "", new_key: newKey.trim(), price: parseFloat(newPrice) || 0 }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["modular-rack-rates"] }); setNewKey(""); setNewPrice(""); toast.success("Added"); },
    onError: (e: any) => toast.error(apiErr(e, "Add failed")),
  });

  const remove = useMutation({
    mutationFn: (key: string) => api.delete(`/api/formulas/modular-rack-rates?key=${encodeURIComponent(key)}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["modular-rack-rates"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const save = useMutation({
    mutationFn: ({ old_key, new_key, price }: { old_key: string; new_key: string; price: number }) =>
      api.put("/api/formulas/modular-rack-rates", { old_key, new_key, price }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["modular-rack-rates"] }); setEditKey(null); toast.success("Saved"); },
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  const startEdit = (r: { key: string; price: number }) => {
    setEditKey(r.key);
    setEditNewKey(r.key);
    setEditPrice(String(r.price));
  };

  const doSave = (oldKey: string) =>
    save.mutate({ old_key: oldKey, new_key: editNewKey.trim() || oldKey, price: parseFloat(editPrice) || 0 });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 items-center flex-wrap">
        <Input
          className="w-56 font-mono text-sm" placeholder="e.g. W=600*D=1000*H=992"
          value={newKey} onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newKey.trim() && newPrice && add.mutate()}
        />
        <Input
          type="number" className="w-32" placeholder="Price (₹)"
          value={newPrice} onChange={(e) => setNewPrice(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newKey.trim() && newPrice && add.mutate()}
        />
        <Button size="sm" onClick={() => add.mutate()} disabled={!newKey.trim() || !newPrice || add.isPending}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Dimensions / Key</TableHead>
          <TableHead>Quote Row Description Preview</TableHead>
          <TableHead className="text-right">Price (₹)</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {racks.map((r) => {
          const isEditing = editKey === r.key;
          const previewKey = isEditing ? (editNewKey.trim() || r.key) : r.key;
          const dims = r.key.replace(/[WDH]=/g, "").replace(/\*/g, " × ");
          return (
            <TableRow key={r.key}>
              <TableCell className="font-mono text-sm">
                {isEditing ? (
                  <Input className="w-56 font-mono text-sm" value={editNewKey}
                    onChange={(e) => setEditNewKey(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") doSave(r.key); if (e.key === "Escape") setEditKey(null); }}
                    autoFocus />
                ) : dims}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground font-mono">{`Modular Battery Rack (${previewKey})`}</TableCell>
              <TableCell className="text-right">
                {isEditing ? (
                  <Input type="number" className="w-36 ml-auto text-right" value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") doSave(r.key); if (e.key === "Escape") setEditKey(null); }} />
                ) : (
                  <span className="font-mono">₹{r.price.toLocaleString()}</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1 justify-end">
                  {isEditing ? (
                    <>
                      <button onClick={() => doSave(r.key)} className="p-1 hover:text-primary"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setEditKey(null)} className="p-1 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(r)} className="p-1 hover:text-primary"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove.mutate(r.key)} disabled={remove.isPending}
                        className="p-1 text-destructive hover:opacity-70 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "cell-voltages" | "dc-cells" | "backup-times" | "datasheets-gad" | "quote-rates";

export default function FormulasPage() {
  const [tab, setTab] = useState<Tab>("cell-voltages");

  return (
    <div className="p-6 flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Masters</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edit cell chemistry voltages, DC→Cell mappings, and backup time presets.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b pb-0">
        {(["cell-voltages", "dc-cells", "backup-times", "datasheets-gad", "quote-rates"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors " +
              (tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t === "cell-voltages"
              ? "Cell Voltages"
              : t === "dc-cells"
              ? "DC → Cells"
              : t === "backup-times"
              ? "Backup Time Presets"
              : t === "datasheets-gad"
              ? "Datasheets & GAD"
              : "Quote Rates"}
          </button>
        ))}
      </div>

      {tab === "cell-voltages" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cell Chemistry Voltages</CardTitle>
          </CardHeader>
          <CardContent>
            <CellVoltagesTable />
          </CardContent>
        </Card>
      )}

      {tab === "dc-cells" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">DC Voltage → Number of Cells</CardTitle>
          </CardHeader>
          <CardContent>
            <DcCellsTable />
          </CardContent>
        </Card>
      )}

      {tab === "backup-times" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Backup Time Presets</CardTitle>
          </CardHeader>
          <CardContent>
            <BackupTimesTable />
          </CardContent>
        </Card>
      )}

      {tab === "datasheets-gad" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datasheets & GAD Files</CardTitle>
          </CardHeader>
          <CardContent>
            <DatasheetGadTab />
          </CardContent>
        </Card>
      )}

      {tab === "quote-rates" && (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Custom Cost Preset Rates</CardTitle>
            </CardHeader>
            <CardContent>
              <QuoteRatesTable />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Modular Battery Rack Prices</CardTitle>
            </CardHeader>
            <CardContent>
              <ModularRackRatesTable />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
