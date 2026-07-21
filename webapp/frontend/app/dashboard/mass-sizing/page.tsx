"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { api, apiErr } from "@/lib/api";
import { runCalculation } from "@/lib/sizingEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Table2, Plus, Trash2, Copy, Loader2, Download, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const DC_VOLTAGES_FALLBACK = [12, 24, 36, 48, 72, 96, 120, 144, 192, 240, 336, 360, 384, 408, 480, 512, 528, 576];
const CHEMISTRIES_FALLBACK = ["LFP"];

interface MassSizingRow {
  sr_no: number;
  position: number;
  ups_make: string;
  ups_model: string;
  ups_rating_kva: string;
  actual_load_kva: string;
  actual_load_kw: string;
  power_factor: string;
  inverter_efficiency: string;
  nominal_dc_voltage: string;
  backup_requirement_min: string;
  cell_chemistry: string;
  ageing_type: string;
  ageing_pct: string;
  design_margin_pct: string;
  dod_margin_pct: string;
  derating_pct: string;
  nearest_capacity_ah: string;
  calculated_load_kw: string;
  number_of_cells: string;
  max_charging_voltage: string;
  end_cell_voltage: string;
  energy_required_kwh: string;
  capacity_required_ah: string;
  cap_with_ageing_ah: string;
  cap_with_design_margin_ah: string;
  cap_with_dod_ah: string;
  cap_with_derating_ah: string;
  backup_time_min: string;
  total_available_energy_kwh: string;
  offered_battery_config: string;
  partcode: string;
}

type ColKey = keyof Omit<MassSizingRow, "sr_no" | "position">;

interface ColDef {
  key: ColKey;
  label: string;
  group: "input" | "output" | "meta";
  type: "text" | "select-dc" | "select-chem" | "select-ageing";
}

const COLUMNS: ColDef[] = [
  { key: "ups_make", label: "UPS Make", group: "input", type: "text" },
  { key: "ups_model", label: "UPS Model", group: "input", type: "text" },
  { key: "ups_rating_kva", label: "UPS Rating (KVA)", group: "input", type: "text" },
  { key: "actual_load_kva", label: "Actual Load (KVA)", group: "input", type: "text" },
  { key: "actual_load_kw", label: "Actual Load (kW)", group: "input", type: "text" },
  { key: "power_factor", label: "Power Factor", group: "input", type: "text" },
  { key: "inverter_efficiency", label: "Inverter Eff. (%)", group: "input", type: "text" },
  { key: "nominal_dc_voltage", label: "DC Voltage (V)", group: "input", type: "select-dc" },
  { key: "backup_requirement_min", label: "Backup Req. (min)", group: "input", type: "text" },
  { key: "cell_chemistry", label: "Cell Chemistry", group: "input", type: "select-chem" },
  { key: "ageing_type", label: "Ageing Type", group: "input", type: "select-ageing" },
  { key: "ageing_pct", label: "Ageing (%)", group: "input", type: "text" },
  { key: "design_margin_pct", label: "Design Margin (%)", group: "input", type: "text" },
  { key: "dod_margin_pct", label: "DOD Margin (%)", group: "input", type: "text" },
  { key: "derating_pct", label: "Derating (%)", group: "input", type: "text" },
  { key: "nearest_capacity_ah", label: "Nearest Capacity (Ah)", group: "input", type: "text" },

  { key: "calculated_load_kw", label: "Calculated Load (kW)", group: "output", type: "text" },
  { key: "number_of_cells", label: "No. of Cells", group: "output", type: "text" },
  { key: "max_charging_voltage", label: "Max Charging Voltage (V)", group: "output", type: "text" },
  { key: "end_cell_voltage", label: "End Cell Voltage (V)", group: "output", type: "text" },
  { key: "energy_required_kwh", label: "Energy Required (kWh)", group: "output", type: "text" },
  { key: "capacity_required_ah", label: "Capacity Required (Ah)", group: "output", type: "text" },
  { key: "cap_with_ageing_ah", label: "Cap w/ Ageing (Ah)", group: "output", type: "text" },
  { key: "cap_with_design_margin_ah", label: "Cap w/ Design Margin (Ah)", group: "output", type: "text" },
  { key: "cap_with_dod_ah", label: "Cap w/ DOD (Ah)", group: "output", type: "text" },
  { key: "cap_with_derating_ah", label: "Cap w/ Derating (Ah)", group: "output", type: "text" },
  { key: "backup_time_min", label: "Backup Time (min)", group: "output", type: "text" },
  { key: "total_available_energy_kwh", label: "Total Available Energy (kWh)", group: "output", type: "text" },
  { key: "offered_battery_config", label: "Offered Battery Config", group: "output", type: "text" },

  { key: "partcode", label: "Partcode", group: "meta", type: "text" },
];

const INPUT_KEYS = new Set(COLUMNS.filter(c => c.group === "input").map(c => c.key));
const EDITABLE_COLUMNS = COLUMNS.filter(c => c.group !== "output");

function n(v: string) { return parseFloat(v) || 0; }
function cellId(sr_no: number, key: ColKey) { return `${sr_no}:${key}`; }

const LABEL_W = 190;
const COL_W = 140;

export default function MassSizingPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [selected, setSelected] = useState<{ sr_no: number; colKey: ColKey } | null>(null);
  const [fillSource, setFillSource] = useState<{ sr_no: number; colKey: ColKey } | null>(null);
  const [fillTargets, setFillTargets] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 200;

  const { data: dcCellsData } = useQuery({
    queryKey: ["dc-cells"],
    queryFn: () => api.get("/api/formulas/dc-cells").then(r => r.data as { dc_voltage: number; num_cells: number }[]),
    staleTime: 5 * 60 * 1000,
  });
  const { data: cellVoltagesData } = useQuery({
    queryKey: ["cell-voltages"],
    queryFn: () => api.get("/api/formulas/cell-voltages").then(r => r.data as { chemistry: string; nominal: number; max_v: number; end_v: number }[]),
    staleTime: 5 * 60 * 1000,
  });

  const dcMap = useMemo(
    () => dcCellsData ? Object.fromEntries(dcCellsData.map(r => [r.dc_voltage, r.num_cells])) : undefined,
    [dcCellsData]
  );
  const cellVMap = useMemo(
    () => cellVoltagesData ? Object.fromEntries(cellVoltagesData.map(r => [r.chemistry, { nominal: r.nominal, max: r.max_v, end: r.end_v }])) : undefined,
    [cellVoltagesData]
  );
  const dcVoltages = useMemo(
    () => dcCellsData?.length ? dcCellsData.map(r => r.dc_voltage).sort((a, b) => a - b) : DC_VOLTAGES_FALLBACK,
    [dcCellsData]
  );
  const chemistries = useMemo(
    () => cellVoltagesData?.length ? cellVoltagesData.map(r => r.chemistry) : CHEMISTRIES_FALLBACK,
    [cellVoltagesData]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["mass-sizing", page, search],
    queryFn: () => api.get("/api/mass-sizing", { params: { page, limit, search } }).then(r => r.data as { rows: MassSizingRow[]; total: number; pages: number }),
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totalPages = data?.pages ?? 1;
  const rowsBySr = useMemo(() => new Map(rows.map(r => [r.sr_no, r])), [rows]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["mass-sizing"] });

  const patchMut = useMutation({
    mutationFn: ({ sr_no, fields }: { sr_no: number; fields: Record<string, string> }) =>
      api.patch(`/api/mass-sizing/${sr_no}`, fields),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error(apiErr(e, "Failed to save")),
  });

  const bulkPatchMut = useMutation({
    mutationFn: (updates: { sr_no: number; fields: Record<string, string> }[]) =>
      api.patch("/api/mass-sizing/bulk", { updates }),
    onSuccess: invalidate,
    onError: (e: unknown) => toast.error(apiErr(e, "Failed to save")),
  });

  const addMut = useMutation({
    mutationFn: () => api.post("/api/mass-sizing", {}),
    onSuccess: () => { invalidate(); toast.success("Row added"); },
    onError: (e: unknown) => toast.error(apiErr(e, "Failed to add row")),
  });

  const deleteMut = useMutation({
    mutationFn: (sr_no: number) => api.delete(`/api/mass-sizing/${sr_no}`),
    onSuccess: () => { invalidate(); toast.success("Row deleted"); setDeleteTarget(null); },
    onError: (e: unknown) => toast.error(apiErr(e, "Failed to delete row")),
  });

  const duplicateMut = useMutation({
    mutationFn: (sr_no: number) => api.post(`/api/mass-sizing/${sr_no}/duplicate`),
    onSuccess: () => { invalidate(); toast.success("Row duplicated"); },
    onError: (e: unknown) => toast.error(apiErr(e, "Failed to duplicate row")),
  });

  const importMut = useMutation({
    mutationFn: (importRows: Record<string, string>[]) => api.post("/api/mass-sizing/import", { rows: importRows }),
    onSuccess: (res) => { invalidate(); toast.success(`Imported ${res.data.count} row(s)`); },
    onError: (e: unknown) => toast.error(apiErr(e, "Import failed")),
    onSettled: () => setImporting(false),
  });

  // pure calc — given a full row's current+pending values, compute its output fields
  const computeOutputFields = useCallback((row: MassSizingRow): Record<string, string> => {
    const out = runCalculation({
      actualKw: n(row.actual_load_kw), actualKva: n(row.actual_load_kva),
      upsKva: n(row.ups_rating_kva), powerFactor: n(row.power_factor),
      inverterEfficiency: n(row.inverter_efficiency) / 100,
      nominalDcVoltage: n(row.nominal_dc_voltage),
      backupRequirementMin: n(row.backup_requirement_min),
      ageingPct: row.ageing_type === "BOL" ? 0 : n(row.ageing_pct),
      designMarginPct: n(row.design_margin_pct),
      dodMarginPct: n(row.dod_margin_pct),
      deratingPct: n(row.derating_pct),
      cellChemistry: row.cell_chemistry || "LFP",
      nearestCapacity: n(row.nearest_capacity_ah),
    }, dcMap, cellVMap);
    return {
      calculated_load_kw: String(out.calculatedLoadKw),
      number_of_cells: String(out.numberOfCells),
      max_charging_voltage: String(out.maxChargingVoltage),
      end_cell_voltage: String(out.endCellVoltage),
      energy_required_kwh: String(out.energyRequiredKwh),
      capacity_required_ah: String(out.capacityRequiredAh),
      cap_with_ageing_ah: String(out.capWithAgeingAh),
      cap_with_design_margin_ah: String(out.capWithDesignMarginAh),
      cap_with_dod_ah: String(out.capWithDodAh),
      cap_with_derating_ah: String(out.capWithDeratingAh),
      backup_time_min: String(out.backupTimeMin),
      total_available_energy_kwh: String(out.totalAvailableEnergyKwh),
      offered_battery_config: out.offeredBatteryConfig,
    };
  }, [dcMap, cellVMap]);

  const handleCellChange = (row: MassSizingRow, key: ColKey, value: string) => {
    if (INPUT_KEYS.has(key)) {
      const updated = { ...row, [key]: value };
      const fields = { [key]: value, ...computeOutputFields(updated) };
      patchMut.mutate({ sr_no: row.sr_no, fields });
    } else {
      patchMut.mutate({ sr_no: row.sr_no, fields: { [key]: value } });
    }
  };

  // ── keyboard navigation ───────────────────────────────────────────────────
  const focusCell = (sr_no: number, colKey: ColKey) => {
    const el = cellRefs.current.get(cellId(sr_no, colKey));
    if (el) { el.focus(); if (el instanceof HTMLInputElement) el.select(); }
    setSelected({ sr_no, colKey });
  };

  const moveSelection = (rowIdx: number, colIdx: number, dRow: number, dCol: number) => {
    let nr = rowIdx + dRow, nc = colIdx + dCol;
    if (nc < 0) { nc = EDITABLE_COLUMNS.length - 1; nr -= 1; }
    if (nc >= EDITABLE_COLUMNS.length) { nc = 0; nr += 1; }
    if (nr < 0 || nr >= rows.length) return;
    focusCell(rows[nr].sr_no, EDITABLE_COLUMNS[nc].key);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, row: MassSizingRow, colKey: ColKey) => {
    const rowIdx = rows.findIndex(r => r.sr_no === row.sr_no);
    const colIdx = EDITABLE_COLUMNS.findIndex(c => c.key === colKey);
    if (e.key === "ArrowDown") { e.preventDefault(); moveSelection(rowIdx, colIdx, 1, 0); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSelection(rowIdx, colIdx, -1, 0); }
    else if (e.key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) { e.preventDefault(); moveSelection(rowIdx, colIdx, 0, -1); }
    else if (e.key === "ArrowRight" && (e.target as HTMLInputElement).selectionEnd === (e.target as HTMLInputElement).value?.length) { e.preventDefault(); moveSelection(rowIdx, colIdx, 0, 1); }
    else if (e.key === "Enter") { e.preventDefault(); moveSelection(rowIdx, colIdx, 1, 0); }
    else if (e.key === "Tab") { e.preventDefault(); moveSelection(rowIdx, colIdx, 0, e.shiftKey ? -1 : 1); }
  };

  // ── fill-drag (copy-down) ─────────────────────────────────────────────────
  const startFillDrag = (sr_no: number, colKey: ColKey) => {
    setFillSource({ sr_no, colKey });
    setFillTargets(new Set());
  };

  const dragOverFillTarget = (sr_no: number) => {
    if (!fillSource) return;
    const srcIdx = rows.findIndex(r => r.sr_no === fillSource.sr_no);
    const overIdx = rows.findIndex(r => r.sr_no === sr_no);
    if (srcIdx === -1 || overIdx === -1) return;
    const [lo, hi] = srcIdx < overIdx ? [srcIdx, overIdx] : [overIdx, srcIdx];
    setFillTargets(new Set(rows.slice(lo, hi + 1).map(r => r.sr_no).filter(s => s !== fillSource.sr_no)));
  };

  const commitFillDrag = () => {
    if (!fillSource || !fillTargets.size) { setFillSource(null); setFillTargets(new Set()); return; }
    const srcRow = rowsBySr.get(fillSource.sr_no);
    if (!srcRow) { setFillSource(null); setFillTargets(new Set()); return; }
    const value = srcRow[fillSource.colKey];
    const isInput = INPUT_KEYS.has(fillSource.colKey);

    const updates = Array.from(fillTargets).map(sr_no => {
      const target = rowsBySr.get(sr_no);
      if (!target) return null;
      const updated = { ...target, [fillSource.colKey]: value };
      const fields: Record<string, string> = { [fillSource.colKey]: value };
      if (isInput) Object.assign(fields, computeOutputFields(updated));
      return { sr_no, fields };
    }).filter((u): u is { sr_no: number; fields: Record<string, string> } => u !== null);

    if (updates.length) bulkPatchMut.mutate(updates);
    setFillSource(null);
    setFillTargets(new Set());
  };

  // ── paste from Excel ──────────────────────────────────────────────────────
  const handlePaste = (e: React.ClipboardEvent) => {
    if (!selected) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();

    const grid = text.replace(/\r/g, "").split("\n").filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === "")).map(line => line.split("\t"));
    const startRowIdx = rows.findIndex(r => r.sr_no === selected.sr_no);
    const startColIdx = EDITABLE_COLUMNS.findIndex(c => c.key === selected.colKey);
    if (startRowIdx === -1 || startColIdx === -1) return;

    const affectedRows = new Map<number, MassSizingRow>();
    grid.forEach((lineCells, ri) => {
      const targetRow = rows[startRowIdx + ri];
      if (!targetRow) return;
      let current = affectedRows.get(targetRow.sr_no) ?? { ...targetRow };
      lineCells.forEach((cellVal, ci) => {
        const col = EDITABLE_COLUMNS[startColIdx + ci];
        if (!col) return;
        current = { ...current, [col.key]: cellVal };
      });
      affectedRows.set(targetRow.sr_no, current);
    });

    const updates = Array.from(affectedRows.entries()).map(([sr_no, updated]) => {
      const original = rowsBySr.get(sr_no)!;
      const fields: Record<string, string> = {};
      for (const col of EDITABLE_COLUMNS) {
        if (updated[col.key] !== original[col.key]) fields[col.key] = updated[col.key];
      }
      if (Object.keys(fields).some(k => INPUT_KEYS.has(k as ColKey))) {
        Object.assign(fields, computeOutputFields(updated));
      }
      return { sr_no, fields };
    }).filter(u => Object.keys(u.fields).length > 0);

    if (updates.length) {
      bulkPatchMut.mutate(updates);
      toast.success(`Pasted into ${updates.length} row(s)`);
    }
  };

  // ── CSV / Excel import-export ─────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const res = await api.get("/api/mass-sizing/export", { params: { search } });
      const exportRows = res.data.rows as MassSizingRow[];
      const data = exportRows.map(row => {
        const obj: Record<string, string> = {};
        for (const col of COLUMNS) obj[col.label] = row[col.key] ?? "";
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Mass Sizing");
      XLSX.writeFile(wb, "mass_sizing_export.xlsx");
    } catch (e: unknown) {
      toast.error(apiErr(e, "Export failed"));
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        const labelToKey = new Map(COLUMNS.map(c => [c.label.toLowerCase().trim(), c.key]));

        const importRows: Record<string, string>[] = json.map(record => {
          const partial: Partial<MassSizingRow> = {};
          for (const [header, value] of Object.entries(record)) {
            const key = labelToKey.get(header.toLowerCase().trim());
            if (key) (partial as Record<string, string>)[key] = String(value ?? "");
          }
          const full: MassSizingRow = { sr_no: 0, position: 0, ...(Object.fromEntries(COLUMNS.map(c => [c.key, ""])) as Record<ColKey, string>), ...partial };
          const outputs = computeOutputFields(full);
          return { ...partial, ...outputs } as Record<string, string>;
        });

        if (!importRows.length) { toast.warning("No rows found in file"); setImporting(false); return; }
        importMut.mutate(importRows);
      } catch {
        toast.error("Could not read file — expected a .csv or .xlsx export from this page");
        setImporting(false);
      }
    };
    reader.onerror = () => { toast.error("Failed to read file"); setImporting(false); };
    reader.readAsBinaryString(file);
  };

  const renderEditableCell = (row: MassSizingRow, col: ColDef) => {
    const id = cellId(row.sr_no, col.key);
    const isSelected = selected?.sr_no === row.sr_no && selected?.colKey === col.key;
    const isFillSource = fillSource?.sr_no === row.sr_no && fillSource?.colKey === col.key;
    const isFillTarget = fillSource?.colKey === col.key && fillTargets.has(row.sr_no);

    const commonProps = {
      onFocus: () => setSelected({ sr_no: row.sr_no, colKey: col.key }),
      onKeyDown: (e: React.KeyboardEvent) => handleCellKeyDown(e, row, col.key),
    };

    return (
      <div className="relative">
        {col.type === "select-dc" ? (
          <select
            ref={el => { if (el) cellRefs.current.set(id, el); }}
            className="w-full h-8 px-2 text-sm bg-transparent"
            value={row.nominal_dc_voltage}
            onChange={e => handleCellChange(row, "nominal_dc_voltage", e.target.value)}
            {...commonProps}
          >
            <option value="">—</option>
            {dcVoltages.map(v => <option key={v} value={String(v)}>{v}V</option>)}
          </select>
        ) : col.type === "select-chem" ? (
          <select
            ref={el => { if (el) cellRefs.current.set(id, el); }}
            className="w-full h-8 px-2 text-sm bg-transparent"
            value={row.cell_chemistry}
            onChange={e => handleCellChange(row, "cell_chemistry", e.target.value)}
            {...commonProps}
          >
            <option value="">—</option>
            {chemistries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : col.type === "select-ageing" ? (
          <select
            ref={el => { if (el) cellRefs.current.set(id, el); }}
            className="w-full h-8 px-2 text-sm bg-transparent"
            value={row.ageing_type}
            onChange={e => handleCellChange(row, "ageing_type", e.target.value)}
            {...commonProps}
          >
            <option value="BOL">BOL</option>
            <option value="EOL">EOL</option>
          </select>
        ) : (
          <input
            ref={el => { if (el) cellRefs.current.set(id, el); }}
            className="w-full h-8 px-2 text-sm bg-transparent outline-none"
            defaultValue={row[col.key]}
            onBlur={e => {
              if (e.target.value !== row[col.key]) handleCellChange(row, col.key, e.target.value);
            }}
            onPaste={handlePaste}
            {...commonProps}
          />
        )}
        {isSelected && (
          <div
            className="absolute -bottom-0.5 -right-0.5 h-2 w-2 bg-primary border border-background cursor-crosshair z-10"
            onMouseDown={(e) => { e.preventDefault(); startFillDrag(row.sr_no, col.key); }}
          />
        )}
        {(isSelected || isFillSource) && <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary" />}
        {isFillTarget && <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-primary/50 bg-primary/10" />}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden" onMouseUp={commitFillDrag} onMouseLeave={() => { if (fillSource) commitFillDrag(); }}>
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0 flex-wrap">
        <Table2 className="h-5 w-5" />
        <h1 className="text-lg font-bold">Mass Sizing</h1>
        <Input
          className="h-8 w-56 text-sm"
          placeholder="Search..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="flex-1" />
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing} className="gap-1.5">
          {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Import
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        <Button size="sm" onClick={() => addMut.mutate()} disabled={addMut.isPending} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add Row
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading…</div>
        ) : (
          <table className="border-collapse text-sm" style={{ minWidth: LABEL_W + COLUMNS.length * COL_W + 80 }}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-muted">
                <th className="sticky left-0 z-30 bg-muted border px-2 py-2 text-left" style={{ width: 50 }}>#</th>
                {COLUMNS.map(col => (
                  <th key={col.key} className={cn(
                    "border px-2 py-2 text-left font-semibold whitespace-nowrap",
                    col.group === "output" ? "bg-muted/70 text-muted-foreground" : "bg-muted",
                  )} style={{ width: COL_W, minWidth: COL_W }}>
                    {col.label}
                  </th>
                ))}
                <th className="sticky right-0 z-30 bg-muted border px-2 py-2 text-center" style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.sr_no} className="hover:bg-accent/30">
                  <td className="sticky left-0 z-10 bg-background border px-2 py-1 text-xs text-muted-foreground">
                    {(page - 1) * limit + i + 1}
                  </td>
                  {COLUMNS.map(col => (
                    <td
                      key={col.key}
                      className={cn("border p-0", col.group === "output" && "bg-muted/20")}
                      onMouseEnter={() => { if (fillSource && fillSource.colKey === col.key) dragOverFillTarget(row.sr_no); }}
                    >
                      {col.group === "output" ? (
                        <div className="px-2 py-1.5 text-muted-foreground font-mono text-xs">
                          {row[col.key] || "—"}
                        </div>
                      ) : renderEditableCell(row, col)}
                    </td>
                  ))}
                  <td className="sticky right-0 z-10 bg-background border px-2 py-1">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        title="Duplicate row"
                        className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                        onClick={() => duplicateMut.mutate(row.sr_no)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Delete row"
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(row.sr_no)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="text-center py-8 text-muted-foreground">
                    No rows yet. Click &quot;Add Row&quot; to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-center gap-3 px-4 py-2 border-t shrink-0">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
        <span className="text-xs text-muted-foreground">Page {page} of {totalPages} · {data?.total ?? 0} rows</span>
        <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
      </div>

      <Dialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Delete Row?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This can&apos;t be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleteMut.isPending}
              onClick={() => deleteTarget !== null && deleteMut.mutate(deleteTarget)}
            >
              {deleteMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
