"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
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

export default function MassUpdatePage() {
  const router = useRouter();

  const [selectedField, setSelectedField] = useState("");
  const [percent, setPercent] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [adminPass, setAdminPass] = useState("");

  const { data: preview = [], isLoading: previewLoading } = useQuery<PreviewRow[]>({
    queryKey: ["mass-update-preview"],
    queryFn: () => api.get("/api/costing/mass-update/preview").then((r) => r.data),
  });

  const totalRecords = preview.reduce((s, r) => s + r.count, 0);

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
        `Updated ${d.updated} records across ${d.durations} duration(s)` +
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

  const fieldLabel = FIELDS.find((f) => f.key === selectedField)?.label ?? "";
  const pct = parseFloat(percent);
  const valid = selectedField && !isNaN(pct) && pct !== 0;

  const handleApply = () => {
    if (!valid) { toast.warning("Select a component and enter a non-zero %"); return; }
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (!adminPass) { toast.warning("Enter admin password"); return; }
    applyMut.mutate();
  };

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
            onChange={(e) => setSelectedField(e.target.value)}
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

        <Button
          className="self-start"
          disabled={!valid}
          onClick={handleApply}
        >
          Apply to All Configurations
        </Button>
      </div>

      {/* Preview */}
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

      {/* Admin confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (!o) setAdminPass(""); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Mass Update</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2 text-sm">
            <p>
              This will update <strong>{fieldLabel}</strong> by{" "}
              <strong className={pct > 0 ? "text-green-500" : "text-red-500"}>
                {pct > 0 ? "+" : ""}{pct}%
              </strong>{" "}
              across <strong>{totalRecords}</strong> records in{" "}
              <strong>{preview.length}</strong> duration(s).
            </p>
            <p className="text-muted-foreground text-xs">
              Derived fields (total cost, margins, estimated sales) will be recalculated automatically.
              This action cannot be undone.
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
              disabled={applyMut.isPending || !adminPass}
            >
              {applyMut.isPending ? "Applying…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
