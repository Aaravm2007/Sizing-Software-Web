"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { runCalculation } from "@/lib/sizingEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Trash2, Upload, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Sheet {
  id: number;
  oem_id: number;
  label: string;
  sort_order: number;
}

interface Product {
  id: number;
  sheet_id: number;
  sort_order: number;
  ups_model: string | null;
  nominal_dc_voltage: number | null;
  backup_requirement_min: number | null;
  chemistry: string | null;
  centre_tap: string | null;
  cell_type: string | null;
  ups_rating_kva: number | null;
  power_factor: number | null;
  inverter_efficiency: number | null;
  end_cell_voltage: number | null;
  max_charging_voltage: number | null;
  calculated_load_kw: number | null;
  energy_required_kwh: number | null;
  capacity_required_ah: number | null;
  nearest_capacity_ah: number | null;
  total_available_energy_kwh: number | null;
  kwh_approx: number | null;
  ah_approx: number | null;
  backup_min_bol: number | null;
  configuration: string | null;
  price_with_cabinet_bms: number | null;
  original_price: number | null;
  costing_tree_id: number | null;
}

interface CostingResult {
  partcode: string;
  total_cost: number;
  est_sales_b: number;
  [k: string]: unknown;
}

interface Extra {
  id: number;
  product_id: number;
  item_type: "rack" | "custom";
  description: string;
  quantity: number;
  price: number;
  original_price: number | null;
}

interface ModularRack {
  key: string;
  price: number;
}

const CENTRE_TAP_OPTS = ["2Wire", "3Wire"];
const CELL_TYPE_OPTS = ["Cylindrical", "Prismatic", "Pouch"];
const CHEM_OPTS = ["LFP", "NPM"];

type ParamKey = "ups_model" | "nominal_dc_voltage" | "backup_requirement_min" | "chemistry"
  | "centre_tap" | "cell_type" | "ups_rating_kva" | "power_factor" | "inverter_efficiency"
  | "end_cell_voltage" | "max_charging_voltage";

const PARAM_ROWS: { key: ParamKey; label: string; type: "text" | "number" | "select"; opts?: string[] }[] = [
  { key: "ups_model",              label: "UPS Model Name",       type: "text" },
  { key: "nominal_dc_voltage",     label: "Nominal DC Voltage (V)", type: "number" },
  { key: "backup_requirement_min", label: "Back Up Requirement (Min)", type: "number" },
  { key: "chemistry",              label: "Chemistry",            type: "select", opts: CHEM_OPTS },
  { key: "centre_tap",             label: "Centre Tap / Wire System", type: "select", opts: CENTRE_TAP_OPTS },
  { key: "cell_type",              label: "Cell Type",            type: "select", opts: CELL_TYPE_OPTS },
  { key: "ups_rating_kva",         label: "UPS Rating (KVA)",     type: "number" },
  { key: "power_factor",           label: "Power Factor",         type: "number" },
  { key: "inverter_efficiency",    label: "Inverter Efficiency",  type: "number" },
  { key: "end_cell_voltage",       label: "End Cell Voltage (V)", type: "number" },
  { key: "max_charging_voltage",   label: "Maximum Charging Voltage (V)", type: "number" },
];

// computed, read-only — everything except nearest_capacity_ah, which the
// user has to pick by hand (same as the regular Sizing page: it's "which
// standard battery size are we actually offering", not something derivable).
const SOLUTION_ROWS_BEFORE: { key: keyof Product; label: string }[] = [
  { key: "calculated_load_kw",   label: "Calculated Load (kW)" },
  { key: "energy_required_kwh",  label: "Energy Required (kWh)" },
  { key: "capacity_required_ah", label: "Capacity Required (AH)" },
];
const SOLUTION_ROWS_AFTER: { key: keyof Product; label: string }[] = [
  { key: "total_available_energy_kwh", label: "Total Available Energy (kWh)" },
  { key: "backup_min_bol",             label: "Available Approx Backup (Min) at BOL" },
];

function n(v: number | string | null | undefined): number {
  const x = typeof v === "number" ? v : parseFloat(v ?? "");
  return isNaN(x) ? 0 : x;
}

/** Display helper — Solution values can arrive as long raw floats from an
 * imported sheet (the engine itself already rounds to 1dp); cap at 1dp here
 * either way so the grid never shows more precision than needed. */
function fmt1(v: number | string | null | undefined): string {
  if (v == null || v === "") return "—";
  const x = n(v);
  return isNaN(x) ? "—" : (Math.round(x * 10) / 10).toString();
}

/** Recompute the Solution fields for one product from its Parameter fields,
 * reusing the same engine the regular Sizing page uses. Ageing / design
 * margin / DOD / derating aren't part of this sheet format, so they're
 * always 0 here — matches how the reference OEM sheets are built. */
function recomputeSolution(p: Product): Partial<Product> {
  const out = runCalculation({
    actualKw: 0,
    actualKva: 0,
    upsKva: n(p.ups_rating_kva),
    powerFactor: n(p.power_factor),
    inverterEfficiency: n(p.inverter_efficiency),
    nominalDcVoltage: n(p.nominal_dc_voltage),
    backupRequirementMin: n(p.backup_requirement_min),
    ageingPct: 0, designMarginPct: 0, dodMarginPct: 0, deratingPct: 0,
    cellChemistry: p.chemistry || "LFP",
    nearestCapacity: n(p.nearest_capacity_ah),
  });
  return {
    calculated_load_kw: out.calculatedLoadKw,
    energy_required_kwh: out.energyRequiredKwh,
    capacity_required_ah: out.capacityRequiredAh,
    total_available_energy_kwh: out.totalAvailableEnergyKwh,
    backup_min_bol: out.backupTimeMin,
    max_charging_voltage: out.maxChargingVoltage || p.max_charging_voltage,
    end_cell_voltage: out.endCellVoltage || p.end_cell_voltage,
  };
}

export default function OemWorkspacePage() {
  const { oem } = useParams<{ oem: string }>();
  const oemId = Number(oem);
  const router = useRouter();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [explicitSheetId, setExplicitSheetId] = useState<number | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [newSheetLabel, setNewSheetLabel] = useState("");
  const [costingPickerFor, setCostingPickerFor] = useState<number | null>(null);
  const [costingResults, setCostingResults] = useState<CostingResult[]>([]);
  const [costingIdx, setCostingIdx] = useState(0);
  const [costingLoading, setCostingLoading] = useState(false);

  const [extraDialogFor, setExtraDialogFor] = useState<number | null>(null);
  const [extraType, setExtraType] = useState<"rack" | "custom">("rack");
  const [selRackKey, setSelRackKey] = useState<string>("");
  const [extraDesc, setExtraDesc] = useState("");
  const [extraPrice, setExtraPrice] = useState("");
  const [extraQty, setExtraQty] = useState("1");

  const [marginTarget, setMarginTarget] = useState<{ type: "product" | "extra"; id: number } | null>(null);
  const [customMarginPct, setCustomMarginPct] = useState("");

  const { data: sheets = [] } = useQuery<Sheet[]>({
    queryKey: ["oem-sheets", oemId],
    queryFn: () => api.get(`/api/oems/${oemId}/sheets`).then((r) => r.data),
  });

  // derived, not stateful — avoids an effect just to pick a default tab
  const activeSheetId = explicitSheetId ?? (sheets.length > 0 ? sheets[0].id : null);
  const setActiveSheetId = setExplicitSheetId;

  const { data: serverProducts, isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["oem-products", activeSheetId],
    queryFn: () => api.get(`/api/oems/sheets/${activeSheetId}/products`).then((r) => r.data),
    enabled: activeSheetId !== null,
  });

  // local editable copy — Solution fields recompute instantly client-side,
  // Parameter edits persist to the server on blur. serverProducts is left
  // undefined (not defaulted to []) while loading so this effect only fires
  // when real data actually arrives, not on every render.
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => { if (serverProducts) setProducts(serverProducts); }, [serverProducts]);

  const patchMut = useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Partial<Product> }) =>
      api.patch(`/api/oems/products/${id}`, fields),
    onError: (e) => toast.error(apiErr(e, "Save failed")),
  });

  const { data: extras = [] } = useQuery<Extra[]>({
    queryKey: ["oem-extras", activeSheetId],
    queryFn: () => api.get(`/api/oems/sheets/${activeSheetId}/extras`).then((r) => r.data),
    enabled: activeSheetId !== null,
  });
  const extrasByProduct = extras.reduce<Record<number, Extra[]>>((acc, e) => {
    (acc[e.product_id] ??= []).push(e);
    return acc;
  }, {});

  const { data: modularRacks = [] } = useQuery<ModularRack[]>({
    queryKey: ["modular-racks"],
    queryFn: () => api.get("/api/quotation/modular-racks").then((r) => r.data),
  });

  const addExtraMut = useMutation({
    mutationFn: (body: { item_type: "rack" | "custom"; description: string; quantity: number; price: number }) =>
      api.post(`/api/oems/products/${extraDialogFor}/extras`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oem-extras", activeSheetId] });
      setExtraDialogFor(null);
      setSelRackKey(""); setExtraDesc(""); setExtraPrice(""); setExtraQty("1");
    },
    onError: (e) => toast.error(apiErr(e, "Failed to add")),
  });

  const deleteExtraMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/oems/extras/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oem-extras", activeSheetId] }),
    onError: (e) => toast.error(apiErr(e, "Failed to delete")),
  });

  const submitExtra = () => {
    if (extraType === "rack") {
      const rack = modularRacks.find((r) => r.key === selRackKey);
      if (!rack) { toast.error("Pick a rack"); return; }
      addExtraMut.mutate({ item_type: "rack", description: rack.key, quantity: parseInt(extraQty) || 1, price: rack.price });
    } else {
      addExtraMut.mutate({ item_type: "custom", description: extraDesc.trim(), quantity: parseInt(extraQty) || 1, price: parseFloat(extraPrice) || 0 });
    }
  };

  // ── margins (on Configuration price, rack cost, or custom cost) ──────────────
  // Same pattern as Quote's discount feature: snapshot the pre-margin price
  // once as original_price, then every subsequent preset recomputes off that
  // same original — so presets don't compound on top of each other.
  const marginMut = useMutation({
    mutationFn: ({ type, id, price, original_price }: { type: "product" | "extra"; id: number; price: number; original_price: number }) =>
      type === "product"
        ? api.patch(`/api/oems/products/${id}`, { price_with_cabinet_bms: price, original_price })
        : api.patch(`/api/oems/extras/${id}`, { price, original_price }),
    onSuccess: (_data, vars) => {
      if (vars.type === "product") {
        qc.invalidateQueries({ queryKey: ["oem-products", activeSheetId] });
      } else {
        qc.invalidateQueries({ queryKey: ["oem-extras", activeSheetId] });
      }
      setMarginTarget(null);
      setCustomMarginPct("");
    },
    onError: (e) => toast.error(apiErr(e, "Failed to apply margin")),
  });

  const revertMarginMut = useMutation({
    mutationFn: ({ type, id }: { type: "product" | "extra"; id: number }) =>
      type === "product"
        ? api.post(`/api/oems/products/${id}/revert-price`)
        : api.post(`/api/oems/extras/${id}/revert-price`),
    onSuccess: (_data, vars) => {
      if (vars.type === "product") {
        qc.invalidateQueries({ queryKey: ["oem-products", activeSheetId] });
      } else {
        qc.invalidateQueries({ queryKey: ["oem-extras", activeSheetId] });
      }
      setMarginTarget(null);
    },
    onError: (e) => toast.error(apiErr(e, "Failed to revert")),
  });

  const applyMarginPct = (pct: number) => {
    if (!marginTarget) return;
    let currentPrice: number | null, currentOriginal: number | null;
    if (marginTarget.type === "product") {
      const p = products.find((x) => x.id === marginTarget.id);
      if (!p) return;
      currentPrice = p.price_with_cabinet_bms;
      currentOriginal = p.original_price;
    } else {
      const e = extras.find((x) => x.id === marginTarget.id);
      if (!e) return;
      currentPrice = e.price;
      currentOriginal = e.original_price;
    }
    const base = currentOriginal ?? currentPrice ?? 0;
    const newPrice = Math.round(base * (1 + pct / 100) * 100) / 100;
    marginMut.mutate({ type: marginTarget.type, id: marginTarget.id, price: newPrice, original_price: base });
  };

  const marginTargetOriginal = marginTarget
    ? marginTarget.type === "product"
      ? products.find((p) => p.id === marginTarget.id)?.original_price
      : extras.find((e) => e.id === marginTarget.id)?.original_price
    : null;

  const addSheetMut = useMutation({
    mutationFn: () => api.post(`/api/oems/${oemId}/sheets`, { label: newSheetLabel.trim() }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["oem-sheets", oemId] });
      setAddSheetOpen(false);
      setNewSheetLabel("");
      setActiveSheetId(res.data.id);
    },
    onError: (e) => toast.error(apiErr(e, "Failed to add sheet")),
  });

  const deleteSheetMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/oems/sheets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oem-sheets", oemId] });
      setActiveSheetId(null);
      toast.success("Sheet deleted");
    },
    onError: (e) => toast.error(apiErr(e, "Failed to delete sheet")),
  });

  const addProductMut = useMutation({
    mutationFn: () => api.post(`/api/oems/sheets/${activeSheetId}/products`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oem-products", activeSheetId] }),
    onError: (e) => toast.error(apiErr(e, "Failed to add product")),
  });

  const deleteProductMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/oems/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oem-products", activeSheetId] }),
    onError: (e) => toast.error(apiErr(e, "Failed to delete product")),
  });

  const importMut = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post(`/api/oems/${oemId}/import`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["oem-sheets", oemId] });
      const { sheets_created, products_created, products_matched } = res.data;
      toast.success(`Imported ${sheets_created} sheet(s), ${products_created} product(s) — ${products_matched} auto-matched to a costing`);
    },
    onError: (e) => toast.error(apiErr(e, "Import failed")),
  });

  const autoMatchMut = useMutation({
    mutationFn: () => api.post(`/api/oems/sheets/${activeSheetId}/auto-match`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["oem-products", activeSheetId] });
      toast.success(`Checked ${res.data.checked}, matched ${res.data.matched}`);
    },
    onError: (e) => toast.error(apiErr(e, "Auto-match failed")),
  });

  const [exporting, setExporting] = useState(false);
  const downloadSheet = async () => {
    if (activeSheetId === null || !activeSheet) return;
    setExporting(true);
    try {
      const res = await api.get(`/api/oems/sheets/${activeSheetId}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeSheet.label}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiErr(e, "Export failed — import a reference file for this OEM first"));
    } finally {
      setExporting(false);
    }
  };

  const updateLocal = (id: number, fields: Partial<Product>) => {
    setProducts((prev) => prev.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, ...fields };
      return { ...next, ...recomputeSolution(next) };
    }));
  };

  const commitToServer = (id: number) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    const { id: _id, sheet_id: _sheetId, sort_order: _sortOrder, ...fields } = p;
    patchMut.mutate({ id, fields });
  };

  const openCostingPicker = async (product: Product) => {
    setCostingPickerFor(product.id);
    setCostingResults([]);
    setCostingIdx(0);
    setCostingLoading(true);
    try {
      const res = await api.post("/api/costing/find", {
        battery_config: `${Math.round(n(product.nominal_dc_voltage))}V ${Math.round(n(product.nearest_capacity_ah))}Ah`,
        backup_minutes: n(product.backup_requirement_min),
        centre_tap: product.centre_tap || "",
        cell_type: product.cell_type || "",
      });
      setCostingResults(res.data.results || []);
    } catch (e) {
      toast.error(apiErr(e, "Costing search failed"));
    } finally {
      setCostingLoading(false);
    }
  };

  const applyCosting = (result: CostingResult) => {
    if (costingPickerFor === null) return;
    const fields = {
      configuration: result.partcode,
      price_with_cabinet_bms: result.est_sales_b,
    };
    updateLocal(costingPickerFor, fields);
    patchMut.mutate({ id: costingPickerFor, fields });
    setCostingPickerFor(null);
  };

  const activeSheet = sheets.find((s) => s.id === activeSheetId);

  return (
    <div className="p-6 flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/oems")}>
            <ArrowLeft size={16} />
          </Button>
          <h1 className="text-2xl font-bold">OEM Sheets</h1>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importMut.mutate(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importMut.isPending}>
            <Upload size={14} className="mr-1" /> {importMut.isPending ? "Importing…" : "Import Sheet"}
          </Button>
          <Button variant="outline" onClick={downloadSheet} disabled={!activeSheet || exporting}>
            <Download size={14} className="mr-1" /> {exporting ? "Downloading…" : "Download Sheet"}
          </Button>
          <Button
            variant="outline"
            onClick={() => autoMatchMut.mutate()}
            disabled={!activeSheetId || autoMatchMut.isPending}
            title="Fill in missing prices for Configurations that exactly match a costing"
          >
            {autoMatchMut.isPending ? "Matching…" : "Auto-Match Costings"}
          </Button>
        </div>
      </div>

      {/* sheet tabs */}
      <div className="flex items-center gap-1 border-b overflow-x-auto shrink-0">
        {sheets.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSheetId(s.id)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
              activeSheetId === s.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => setAddSheetOpen(true)}
          className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
          title="Add sheet"
        >
          <Plus size={14} />
        </button>
        {activeSheet && (
          <button
            onClick={() => deleteSheetMut.mutate(activeSheet.id)}
            className="ml-auto px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive shrink-0"
            title="Delete this sheet"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {/* grid */}
      {!activeSheetId ? (
        <p className="text-sm text-muted-foreground">No sheets yet — add one, or import an OEM&apos;s reference file.</p>
      ) : productsLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="overflow-auto flex-1 border rounded-md">
          <table className="border-collapse text-xs w-full">
            <thead>
              <tr className="sticky top-0 bg-background z-10">
                <th className="sticky left-0 z-20 bg-muted/60 border px-2 py-1.5 text-left w-48">Parameters</th>
                {products.map((p) => (
                  <th key={p.id} className="border px-2 py-1.5 min-w-[160px]">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-medium">#{p.sort_order + 1}</span>
                      <button onClick={() => deleteProductMut.mutate(p.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="border px-2 py-1.5 w-10">
                  <button onClick={() => addProductMut.mutate()} title="Add product" className="text-muted-foreground hover:text-foreground">
                    <Plus size={14} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {PARAM_ROWS.map((row) => (
                <tr key={row.key}>
                  <td className="sticky left-0 z-10 bg-muted/30 border px-2 py-1 font-medium text-muted-foreground">{row.label}</td>
                  {products.map((p) => (
                    <td key={p.id} className="border px-1 py-0.5">
                      {row.type === "select" ? (
                        <select
                          className="w-full h-7 rounded border px-1 text-xs bg-background"
                          value={(p[row.key] as string) || ""}
                          onChange={(e) => updateLocal(p.id, { [row.key]: e.target.value })}
                          onBlur={() => commitToServer(p.id)}
                        >
                          <option value="">—</option>
                          {row.opts!.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <Input
                          type={row.type}
                          className="h-7 text-xs"
                          value={(p[row.key] as string | number) ?? ""}
                          onChange={(e) => updateLocal(p.id, { [row.key]: row.type === "number" ? (parseFloat(e.target.value) || null) : e.target.value } as Partial<Product>)}
                          onBlur={() => commitToServer(p.id)}
                        />
                      )}
                    </td>
                  ))}
                  <td className="border" />
                </tr>
              ))}

              <tr><td colSpan={products.length + 2} className="bg-muted/60 border px-2 py-1 font-semibold text-muted-foreground">Solution</td></tr>

              {SOLUTION_ROWS_BEFORE.map((row) => (
                <tr key={row.key}>
                  <td className="sticky left-0 z-10 bg-muted/30 border px-2 py-1 font-medium text-muted-foreground">{row.label}</td>
                  {products.map((p) => (
                    <td key={p.id} className="border px-2 py-1 font-mono text-right bg-muted/10">
                      {fmt1(p[row.key] as number | null)}
                    </td>
                  ))}
                  <td className="border" />
                </tr>
              ))}

              <tr>
                <td className="sticky left-0 z-10 bg-muted/30 border px-2 py-1 font-medium text-muted-foreground">Nearest Available Capacity (AH)</td>
                {products.map((p) => (
                  <td key={p.id} className="border px-1 py-0.5">
                    <Input
                      type="number"
                      className="h-7 text-xs text-right font-mono"
                      value={p.nearest_capacity_ah ?? ""}
                      onChange={(e) => updateLocal(p.id, { nearest_capacity_ah: parseFloat(e.target.value) || null })}
                      onBlur={() => commitToServer(p.id)}
                    />
                  </td>
                ))}
                <td className="border" />
              </tr>

              {SOLUTION_ROWS_AFTER.map((row) => (
                <tr key={row.key}>
                  <td className="sticky left-0 z-10 bg-muted/30 border px-2 py-1 font-medium text-muted-foreground">{row.label}</td>
                  {products.map((p) => (
                    <td key={p.id} className="border px-2 py-1 font-mono text-right bg-muted/10">
                      {fmt1(p[row.key] as number | null)}
                    </td>
                  ))}
                  <td className="border" />
                </tr>
              ))}

              <tr>
                <td className="sticky left-0 z-10 bg-muted/30 border px-2 py-1 font-medium text-muted-foreground">Configuration</td>
                {products.map((p) => (
                  <td key={p.id} className="border px-2 py-1">
                    <button
                      onClick={() => openCostingPicker(p)}
                      className="w-full text-left text-xs underline decoration-dotted hover:text-primary"
                      title="Search & attach a costing"
                    >
                      {p.configuration || "— pick costing —"}
                    </button>
                  </td>
                ))}
                <td className="border" />
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-muted/30 border px-2 py-1 font-medium text-muted-foreground">Price with Cabinet &amp; BMS</td>
                {products.map((p) => (
                  <td key={p.id} className="border px-2 py-1">
                    <div className="flex items-center justify-end gap-1">
                      <span className="font-mono text-xs">
                        {p.price_with_cabinet_bms != null ? `Rs. ${Number(p.price_with_cabinet_bms).toLocaleString("en-IN")}/-` : "—"}
                      </span>
                      <button
                        className="text-[10px] px-1 py-0.5 rounded border hover:bg-muted text-muted-foreground shrink-0"
                        onClick={() => setMarginTarget({ type: "product", id: p.id })}
                        title="Apply margin"
                      >
                        %
                      </button>
                    </div>
                    {p.original_price != null && (
                      <div className="text-[10px] text-muted-foreground/70 text-right">
                        was Rs. {Number(p.original_price).toLocaleString("en-IN")}/-{" "}
                        <button className="underline" onClick={() => revertMarginMut.mutate({ type: "product", id: p.id })}>↺</button>
                      </div>
                    )}
                  </td>
                ))}
                <td className="border" />
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-muted/30 border px-2 py-1 font-medium text-muted-foreground align-top">
                  Modular Rack / Custom Costs
                </td>
                {products.map((p) => (
                  <td key={p.id} className="border px-2 py-1 align-top">
                    <div className="flex flex-col gap-1">
                      {(extrasByProduct[p.id] ?? []).map((e) => (
                        <div key={e.id} className="flex flex-col gap-0.5 text-[11px] bg-muted/40 rounded px-1.5 py-0.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate" title={e.description}>
                              {e.description} x{e.quantity} — Rs.{(e.price * e.quantity).toLocaleString("en-IN")}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => setMarginTarget({ type: "extra", id: e.id })} className="text-muted-foreground hover:text-foreground" title="Apply margin">%</button>
                              <button onClick={() => deleteExtraMut.mutate(e.id)} className="text-muted-foreground hover:text-destructive">
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </div>
                          {e.original_price != null && (
                            <div className="text-[9px] text-muted-foreground/70">
                              was Rs. {Number(e.original_price).toLocaleString("en-IN")}{" "}
                              <button className="underline" onClick={() => revertMarginMut.mutate({ type: "extra", id: e.id })}>↺</button>
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="flex gap-1">
                        <button
                          className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted"
                          onClick={() => { setExtraDialogFor(p.id); setExtraType("rack"); }}
                        >
                          + Rack
                        </button>
                        <button
                          className="text-[10px] px-1.5 py-0.5 rounded border hover:bg-muted"
                          onClick={() => { setExtraDialogFor(p.id); setExtraType("custom"); }}
                        >
                          + Custom
                        </button>
                      </div>
                    </div>
                  </td>
                ))}
                <td className="border" />
              </tr>
              <tr>
                <td className="sticky left-0 z-10 bg-muted/30 border px-2 py-1 font-semibold text-muted-foreground">Total Price</td>
                {products.map((p) => {
                  const extraTotal = (extrasByProduct[p.id] ?? []).reduce((s, e) => s + e.price * e.quantity, 0);
                  const total = (p.price_with_cabinet_bms ?? 0) + extraTotal;
                  return (
                    <td key={p.id} className="border px-2 py-1 font-mono text-right font-semibold">
                      {p.price_with_cabinet_bms != null || extraTotal > 0 ? `Rs. ${total.toLocaleString("en-IN")}/-` : "—"}
                    </td>
                  );
                })}
                <td className="border" />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* add sheet dialog */}
      <Dialog open={addSheetOpen} onOpenChange={setAddSheetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Sheet</DialogTitle></DialogHeader>
          <Input
            placeholder="e.g. 1KVA 30Min"
            value={newSheetLabel}
            onChange={(e) => setNewSheetLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newSheetLabel.trim()) addSheetMut.mutate(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddSheetOpen(false)}>Cancel</Button>
            <Button onClick={() => addSheetMut.mutate()} disabled={!newSheetLabel.trim() || addSheetMut.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* add modular rack / custom cost dialog */}
      <Dialog open={extraDialogFor !== null} onOpenChange={(o) => { if (!o) setExtraDialogFor(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{extraType === "rack" ? "Add Modular Battery Rack" : "Add Custom Cost"}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex gap-2">
              <button
                className={cn("text-xs px-3 py-1.5 rounded border", extraType === "rack" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}
                onClick={() => setExtraType("rack")}
              >
                Modular Rack
              </button>
              <button
                className={cn("text-xs px-3 py-1.5 rounded border", extraType === "custom" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}
                onClick={() => setExtraType("custom")}
              >
                Custom Cost
              </button>
            </div>

            {extraType === "rack" ? (
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                {modularRacks.map((r) => (
                  <label key={r.key} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="radio" name="rack" value={r.key} checked={selRackKey === r.key} onChange={() => setSelRackKey(r.key)} />
                    {r.key} — Rs. {r.price.toLocaleString("en-IN")}
                  </label>
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Description</label>
                  <Input placeholder="e.g. Fire Suppression System" value={extraDesc} onChange={(e) => setExtraDesc(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">Price (Rs.)</label>
                  <Input type="number" placeholder="0" value={extraPrice} onChange={(e) => setExtraPrice(e.target.value)} />
                </div>
              </>
            )}
            <div className="flex items-center gap-3">
              <label className="text-xs text-muted-foreground">Quantity</label>
              <Input type="number" className="w-24" value={extraQty} onChange={(e) => setExtraQty(e.target.value)} min={1} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtraDialogFor(null)}>Cancel</Button>
            <Button onClick={submitExtra} disabled={addExtraMut.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* margin dialog — applies to Configuration price, rack cost, or custom cost */}
      <Dialog open={marginTarget !== null} onOpenChange={(o) => { if (!o) { setMarginTarget(null); setCustomMarginPct(""); } }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Apply Margin</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              {[5, -5, 10, -10].map((pct) => (
                <button
                  key={pct}
                  className="text-sm px-3 py-1.5 rounded border hover:bg-muted"
                  onClick={() => applyMarginPct(pct)}
                  disabled={marginMut.isPending}
                >
                  {pct > 0 ? `+${pct}%` : `${pct}%`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Custom %"
                value={customMarginPct}
                onChange={(e) => setCustomMarginPct(e.target.value)}
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                className="shrink-0"
                disabled={!customMarginPct || marginMut.isPending}
                onClick={() => applyMarginPct(Math.abs(parseFloat(customMarginPct) || 0))}
              >
                +
              </Button>
              <Button
                variant="outline"
                className="shrink-0"
                disabled={!customMarginPct || marginMut.isPending}
                onClick={() => applyMarginPct(-Math.abs(parseFloat(customMarginPct) || 0))}
              >
                −
              </Button>
            </div>
            {marginTargetOriginal != null && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline self-start"
                onClick={() => marginTarget && revertMarginMut.mutate(marginTarget)}
                disabled={revertMarginMut.isPending}
              >
                ↺ Revert to original
              </button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setMarginTarget(null); setCustomMarginPct(""); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* costing picker dialog */}
      <Dialog open={costingPickerFor !== null} onOpenChange={(o) => { if (!o) setCostingPickerFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Attach Costing</DialogTitle></DialogHeader>
          {costingLoading ? (
            <p className="text-sm text-muted-foreground">Searching…</p>
          ) : costingResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching costings found.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <button
                  className="p-1 rounded border disabled:opacity-30"
                  disabled={costingIdx === 0}
                  onClick={() => setCostingIdx((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs font-medium tabular-nums">{costingIdx + 1} / {costingResults.length}</span>
                <button
                  className="p-1 rounded border disabled:opacity-30"
                  disabled={costingIdx >= costingResults.length - 1}
                  onClick={() => setCostingIdx((i) => Math.min(costingResults.length - 1, i + 1))}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="border rounded-md p-3 flex flex-col gap-1 text-sm">
                <div className="font-medium">{costingResults[costingIdx].partcode}</div>
                <div className="text-muted-foreground">
                  Rs. {Number(costingResults[costingIdx].est_sales_b).toLocaleString("en-IN")}/-
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCostingPickerFor(null)}>Cancel</Button>
            <Button onClick={() => applyCosting(costingResults[costingIdx])} disabled={costingResults.length === 0}>
              Use This
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
