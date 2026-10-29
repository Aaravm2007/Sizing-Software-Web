"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api , apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ── editable fields ──────────────────────────────────────────────────────────

const FIELDS: { key: string; label: string; group: string }[] = [
  { key: "fob_cost",           label: "FOB Cost per Cell",            group: "Cell Costing" },
  { key: "clearing_customs_1", label: "Clearing & Customs (1)",       group: "Cell Costing" },
  { key: "bms_pcm_cost",       label: "BMS / PCM Cost",               group: "BMS / PCM" },
  { key: "clearing_customs_2", label: "Clearing & Customs (2)",       group: "BMS / PCM" },
  { key: "cabinet",            label: "Cabinet",                       group: "Components" },
  { key: "bus_bar",            label: "Bus Bar",                       group: "Components" },
  { key: "holder_caps",        label: "Holder / Caps",                 group: "Components" },
  { key: "wire_gasket",        label: "Wire & Gasket",                 group: "Components" },
  { key: "terminals",          label: "Terminals + Connectors",        group: "Components" },
  { key: "mcb_fuse",           label: "MCB / Fuse",                    group: "Components" },
  { key: "lugs_slew",          label: "Lugs & Slew",                   group: "Components" },
  { key: "nut_bolts",          label: "Nut Bolts",                     group: "Components" },
  { key: "fiber_glass",        label: "Fiber Glass + Rod",             group: "Components" },
  { key: "awg_cables",         label: "AWG Cables",                    group: "Components" },
  { key: "shipping",           label: "Shipping Charges",              group: "Logistics" },
  { key: "packaging",          label: "Packaging Cost",                group: "Logistics" },
];

const GROUPS = [...new Set(FIELDS.map((f) => f.group))];

interface PreviewRow { duration: string; count: number }
interface FobRow { cell_type: string; brand: string; min_cost: number; max_cost: number; product_count: number }

const fobKey = (r: { cell_type: string; brand: string }) => `${r.cell_type}|||${r.brand}`;
const fmtCost = (r: FobRow) => (r.min_cost === r.max_cost ? `$${r.min_cost}` : `$${r.min_cost}–$${r.max_cost}`);

export default function MassUpdatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedField, setSelectedField] = useState("");
  const [percent, setPercent] = useState("");
  const [fobEdits, setFobEdits] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [adminPass, setAdminPass] = useState("");

  const isFob = selectedField === "fob_cost";

  const { data: preview = [], isLoading: previewLoading } = useQuery<PreviewRow[]>({
    queryKey: ["mass-update-preview"],
    queryFn: () => api.get("/api/costing/mass-update/preview").then((r) => r.data),
  });

  const { data: fobRows = [], isLoading: fobLoading, isError: fobError, error: fobErrorObj } = useQuery<FobRow[]>({
    queryKey: ["mass-update-fob-preview"],
    queryFn: () => api.get("/api/costing/mass-update/fob-preview").then((r) => r.data),
    enabled: isFob,
    retry: false,
  });

  const totalRecords = preview.reduce((s, r) => s + r.count, 0);

  const editedFobRows = fobRows.filter((r) => {
    const v = parseFloat(fobEdits[fobKey(r)] ?? "");
    return fobEdits[fobKey(r)]?.trim() && !isNaN(v) && v > 0;
  });

  const applyMut = useMutation({
    mutationFn: () =>
      api.post("/api/costing/mass-update", {
        field: selectedField,
        percent: parseFloat(percent),
        admin_password: adminPass,
      }),
    onSuccess: (res) => {
      const d = res.data;
      toast.success(
        `Backed up to ${d.backup_file}. Updated ${d.updated} records across ${d.durations} duration(s)` +
        (d.errors?.length ? ` · ${d.errors.length} error(s)` : ""),
      );
      setConfirmOpen(false);
      setAdminPass("");
    },
    onError: (e: any) => {
      toast.error(apiErr(e, "Update failed"));
      setConfirmOpen(false);
      setAdminPass("");
    },
  });

  const fobApplyMut = useMutation({
    mutationFn: () =>
      api.post("/api/costing/mass-update/fob-apply", {
        updates: editedFobRows.map((r) => ({
          cell_type: r.cell_type,
          brand: r.brand,
          new_cost: parseFloat(fobEdits[fobKey(r)]),
        })),
        admin_password: adminPass,
      }),
    onSuccess: (res) => {
      const d = res.data;
      toast.success(
        `Backed up to ${d.backup_file}. Updated ${d.updated} product(s) across ${d.cell_types_changed} cell type(s)` +
        (d.errors?.length ? ` · ${d.errors.length} error(s)` : ""),
      );
      setConfirmOpen(false);
      setAdminPass("");
      setFobEdits({});
      queryClient.invalidateQueries({ queryKey: ["mass-update-fob-preview"] });
    },
    onError: (e: any) => {
      toast.error(apiErr(e, "Update failed"));
      setConfirmOpen(false);
      setAdminPass("");
    },
  });

  const fieldLabel = FIELDS.find((f) => f.key === selectedField)?.label ?? "";
  const pct = parseFloat(percent);
  const validPercent = selectedField && !isFob && !isNaN(pct) && pct !== 0;
  const validFob = isFob && editedFobRows.length > 0;

  const handleApply = () => {
    if (isFob) {
      if (!validFob) { toast.warning("Enter a new cost for at least one cell"); return; }
    } else {
      if (!validPercent) { toast.warning("Select a component and enter a non-zero %"); return; }
    }
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (!adminPass) { toast.warning("Enter admin password"); return; }
    if (isFob) fobApplyMut.mutate(); else applyMut.mutate();
  };

  const applyPending = isFob ? fobApplyMut.isPending : applyMut.isPending;

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => router.push("/dashboard/costing")}>← Back</Button>
        <div>
          <h1 className="text-2xl font-bold">Mass Cost Update</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Apply a % increase or decrease to a component across all battery configs in all durations.
          </p>
        </div>
      </div>

      {/* Config */}
      <div className="border rounded-lg p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <Label>Component to change</Label>
          <select
            className="h-9 rounded-md border px-3 text-sm bg-background"
            value={selectedField}
            onChange={(e) => { setSelectedField(e.target.value); setFobEdits({}); }}
          >
            <option value="">Select component…</option>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {FIELDS.filter((f) => f.group === g).map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {!isFob && (
          <>
            <div className="flex flex-col gap-1">
              <Label>Change (%)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 10 for +10%, -5 for -5%"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                  className="w-60"
                />
                {percent && !isNaN(pct) && pct !== 0 && (
                  <span className={`text-sm font-semibold ${pct > 0 ? "text-green-500" : "text-red-500"}`}>
                    {pct > 0 ? "+" : ""}{pct}% on all records
                  </span>
                )}
              </div>
            </div>
            <Button className="self-start" disabled={!validPercent} onClick={handleApply}>
              Apply to All Configurations
            </Button>
          </>
        )}

        {isFob && (
          <>
            <p className="text-xs text-muted-foreground -mt-2">
              Each cell type/brand can carry a different cost. Set a new cost per row — blank rows are left unchanged.
              If an existing cost drifted between products, the range is shown; the new value still applies to every matching product.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cell Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Current Cost</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="text-right w-40">New Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fobLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : fobError ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-red-500">{apiErr(fobErrorObj, "Failed to load cell costs")}</TableCell></TableRow>
                ) : fobRows.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No active products found</TableCell></TableRow>
                ) : (
                  fobRows.map((r) => (
                    <TableRow key={fobKey(r)}>
                      <TableCell>{r.cell_type || "—"}</TableCell>
                      <TableCell>{r.brand || "—"}</TableCell>
                      <TableCell className="text-right font-mono">{fmtCost(r)}</TableCell>
                      <TableCell className="text-right">{r.product_count}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="unchanged"
                          value={fobEdits[fobKey(r)] ?? ""}
                          onChange={(e) => setFobEdits((prev) => ({ ...prev, [fobKey(r)]: e.target.value }))}
                          className="w-32 ml-auto text-right"
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <Button className="self-start" disabled={!validFob} onClick={handleApply}>
              Apply to Edited Rows ({editedFobRows.length})
            </Button>
          </>
        )}
      </div>

      {/* Preview */}
      {!isFob && (
        <div className="border rounded-lg p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">Affected Records</h2>
            <span className="text-sm text-muted-foreground">
              {previewLoading ? "Loading…" : `${totalRecords} total records · ${preview.length} duration(s)`}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Battery Configs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((row) => (
                <TableRow key={row.duration}>
                  <TableCell className="font-mono">{row.duration}</TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Admin confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setAdminPass(""); }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm Mass Update</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2 text-sm">
            {isFob ? (
              <>
                <p>This will change FOB cost for <strong>{editedFobRows.length}</strong> cell type(s), affecting{" "}
                  <strong>{editedFobRows.reduce((s, r) => s + r.product_count, 0)}</strong> product(s):
                </p>
                <ul className="flex flex-col gap-1 max-h-40 overflow-y-auto text-xs border rounded-md p-2">
                  {editedFobRows.map((r) => (
                    <li key={fobKey(r)} className="flex justify-between gap-2">
                      <span>{r.cell_type} / {r.brand}</span>
                      <span className="font-mono">{fmtCost(r)} → ${fobEdits[fobKey(r)]}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p>
                This will update <strong>{fieldLabel}</strong> by{" "}
                <strong className={pct > 0 ? "text-green-500" : "text-red-500"}>
                  {pct > 0 ? "+" : ""}{pct}%
                </strong>{" "}
                across <strong>{totalRecords}</strong> records in{" "}
                <strong>{preview.length}</strong> duration(s).
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              A full database backup is taken automatically before this runs. Derived fields (total cost, margins, estimated sales) are recalculated automatically. This action cannot be undone.
            </p>
            <div className="flex flex-col gap-1">
              <Label>Admin Password</Label>
              <Input
                type="password"
                placeholder="Enter admin password"
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={applyPending || !adminPass}
            >
              {applyPending ? "Applying…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
