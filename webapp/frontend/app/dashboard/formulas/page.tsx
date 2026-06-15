"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { api, getUsername , apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const isAdmin = () => getUsername() === "a";

// ── Cell Voltages table ────────────────────────────────────────────────────────

function CellVoltagesTable() {
  const qc = useQueryClient();
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<CellVoltage | null>(null);
  const [adding, setAdding] = useState(false);
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cell-voltages"] }); setAdding(false); setNewRow({ chemistry: "", nominal: 0, max_v: 0, end_v: 0 }); toast.success("Added"); },
    onError: (e: any) => toast.error(apiErr(e, "Add failed")),
  });

  const remove = useMutation({
    mutationFn: (chemistry: string) => api.delete(`/api/formulas/cell-voltages/${chemistry}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cell-voltages"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const startEdit = (row: CellVoltage) => { setEditKey(row.chemistry); setEditRow({ ...row }); };
  const cancelEdit = () => { setEditKey(null); setEditRow(null); };
  const admin = isAdmin();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
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
                  <Input
                    type="number" step="0.01" className="h-7 w-24"
                    value={editRow.nominal}
                    onChange={(e) => setEditRow({ ...editRow, nominal: parseFloat(e.target.value) || 0 })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number" step="0.01" className="h-7 w-24"
                    value={editRow.max_v}
                    onChange={(e) => setEditRow({ ...editRow, max_v: parseFloat(e.target.value) || 0 })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number" step="0.01" className="h-7 w-24"
                    value={editRow.end_v}
                    onChange={(e) => setEditRow({ ...editRow, end_v: parseFloat(e.target.value) || 0 })}
                  />
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

          {admin && adding && (
            <TableRow>
              <TableCell>
                <Input
                  className="h-7 w-24 font-mono" placeholder="e.g. NMC"
                  value={newRow.chemistry}
                  onChange={(e) => setNewRow({ ...newRow, chemistry: e.target.value.toUpperCase() })}
                />
              </TableCell>
              <TableCell>
                <Input type="number" step="0.01" className="h-7 w-24" value={newRow.nominal}
                  onChange={(e) => setNewRow({ ...newRow, nominal: parseFloat(e.target.value) || 0 })} />
              </TableCell>
              <TableCell>
                <Input type="number" step="0.01" className="h-7 w-24" value={newRow.max_v}
                  onChange={(e) => setNewRow({ ...newRow, max_v: parseFloat(e.target.value) || 0 })} />
              </TableCell>
              <TableCell>
                <Input type="number" step="0.01" className="h-7 w-24" value={newRow.end_v}
                  onChange={(e) => setNewRow({ ...newRow, end_v: parseFloat(e.target.value) || 0 })} />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => create.mutate(newRow)}><Check size={14} /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAdding(false)}><X size={14} /></Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {admin && !adding && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
          <Plus size={14} className="mr-1" /> Add Chemistry
        </Button>
      )}
    </div>
  );
}

// ── DC→Cells table ────────────────────────────────────────────────────────────

function DcCellsTable() {
  const qc = useQueryClient();
  const [editKey, setEditKey] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<DcCell | null>(null);
  const [adding, setAdding] = useState(false);
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dc-cells"] }); setAdding(false); setNewRow({ dc_voltage: 0, num_cells: 0 }); toast.success("Added"); },
    onError: (e: any) => toast.error(apiErr(e, "Add failed")),
  });

  const remove = useMutation({
    mutationFn: (v: number) => api.delete(`/api/formulas/dc-cells/${v}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["dc-cells"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const startEdit = (row: DcCell) => { setEditKey(row.dc_voltage); setEditRow({ ...row }); };
  const cancelEdit = () => { setEditKey(null); setEditRow(null); };
  const admin = isAdmin();

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-3">
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
                  <Input
                    type="number" step="1" className="h-7 w-28"
                    value={editRow.num_cells}
                    onChange={(e) => setEditRow({ ...editRow, num_cells: parseInt(e.target.value) || 0 })}
                  />
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

          {admin && adding && (
            <TableRow>
              <TableCell>
                <Input
                  type="number" step="1" className="h-7 w-28 font-mono" placeholder="e.g. 288"
                  value={newRow.dc_voltage || ""}
                  onChange={(e) => setNewRow({ ...newRow, dc_voltage: parseInt(e.target.value) || 0 })}
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number" step="1" className="h-7 w-28" placeholder="e.g. 90"
                  value={newRow.num_cells || ""}
                  onChange={(e) => setNewRow({ ...newRow, num_cells: parseInt(e.target.value) || 0 })}
                />
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => create.mutate(newRow)}><Check size={14} /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setAdding(false)}><X size={14} /></Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {admin && !adding && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
          <Plus size={14} className="mr-1" /> Add Voltage Level
        </Button>
      )}
    </div>
  );
}

// ── available variables hint ──────────────────────────────────────────────────

const VARS_HINT = [
  "actual_kw", "actual_kva", "ups_kva", "power_factor", "inverter_eff",
  "nominal_dc_voltage", "backup_minutes", "ageing_percent",
  "design_margin_percent", "dod_margin_percent", "derating_factor_percent",
  "nearest_capacity", "num_cells", "cell_nominal", "cell_max", "cell_end",
  "load", "max_charging_voltage", "end_cell_voltage", "energy_required",
  "capacity_required", "cap_with_ageing", "cap_with_design_margin",
  "cap_with_dod", "cap_with_derating",
];

// ── Sizing formulas editable table ────────────────────────────────────────────

interface SizingFormula {
  name: string;
  expression: string;
  description: string;
  sort_order: number;
}

function SizingFormulasTable() {
  const qc = useQueryClient();
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editExpr, setEditExpr] = useState("");
  const [showVars, setShowVars] = useState(false);
  const admin = isAdmin();

  const { data: rows = [], isLoading } = useQuery<SizingFormula[]>({
    queryKey: ["sizing-formulas"],
    queryFn: () => api.get("/api/formulas/sizing-formulas").then((r) => r.data),
  });

  const update = useMutation({
    mutationFn: ({ name, expression }: { name: string; expression: string }) =>
      api.put(`/api/formulas/sizing-formulas/${name}`, { expression }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sizing-formulas"] }); setEditKey(null); toast.success("Formula saved"); },
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  const reset = useMutation({
    mutationFn: (name: string) => api.post(`/api/formulas/sizing-formulas/${name}/reset`),
    onSuccess: (_, name) => { qc.invalidateQueries({ queryKey: ["sizing-formulas"] }); if (editKey === name) setEditKey(null); toast.success("Reset to default"); },
    onError: (e: any) => toast.error(apiErr(e, "Reset failed")),
  });

  const startEdit = (row: SizingFormula) => { setEditKey(row.name); setEditExpr(row.expression); };
  const cancelEdit = () => setEditKey(null);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      {admin && (
        <button
          className="text-xs text-muted-foreground underline self-start"
          onClick={() => setShowVars((v) => !v)}
        >
          {showVars ? "Hide" : "Show"} available variables
        </button>
      )}
      {showVars && (
        <div className="bg-muted rounded p-3 flex flex-wrap gap-1">
          {VARS_HINT.map((v) => (
            <code key={v} className="text-xs bg-background px-1.5 py-0.5 rounded border">{v}</code>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.name} className="border rounded-md p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{row.description}</span>
              {admin && editKey !== row.name && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => startEdit(row)}>
                    <Pencil size={12} className="mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => reset.mutate(row.name)}>
                    Reset
                  </Button>
                </div>
              )}
            </div>
            {editKey === row.name ? (
              <div className="flex flex-col gap-2 mt-1">
                <textarea
                  className="font-mono text-xs bg-muted border rounded p-2 resize-none w-full focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={2}
                  value={editExpr}
                  onChange={(e) => setEditExpr(e.target.value)}
                  spellCheck={false}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7" onClick={() => update.mutate({ name: row.name, expression: editExpr })}>
                    <Check size={12} className="mr-1" /> Save
                  </Button>
                  <Button size="sm" variant="outline" className="h-7" onClick={cancelEdit}>
                    <X size={12} className="mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <code className="text-xs font-mono text-primary bg-muted px-2 py-1 rounded mt-0.5 block whitespace-pre-wrap break-all">
                {row.expression}
              </code>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "cell-voltages" | "dc-cells" | "formulas";

export default function FormulasPage() {
  const [tab, setTab] = useState<Tab>("cell-voltages");

  return (
    <div className="p-6 flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Formula Editor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edit cell chemistry voltages, DC→Cell mappings, and sizing formula expressions.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b pb-0">
        {(["cell-voltages", "dc-cells", "formulas"] as Tab[]).map((t) => (
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
            {t === "cell-voltages" ? "Cell Voltages" : t === "dc-cells" ? "DC → Cells" : "Sizing Formulas"}
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

      {tab === "formulas" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sizing Formulas</CardTitle>
          </CardHeader>
          <CardContent>
            <SizingFormulasTable />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
