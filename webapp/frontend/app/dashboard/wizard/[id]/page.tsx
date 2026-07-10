"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { runCalculation } from "@/lib/sizingEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clipboard, Calculator, ChevronDown, ChevronRight, Download, Plus, X } from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PendingLinkDialog } from "@/components/pending-link-dialog";

const FORMATS = ["High voltage", "Low voltage", "Extended Warranty High Voltage", "Extended Warranty Low Voltage", "Low & High Voltage Export"];
const PRICE_OPTIONS = ["A", "A+5", "B", "B-15", "B-10", "B-5", "B+5", "B+10", "B+15", "B+20", "custom", "custom_a"] as const;
type PriceOption = typeof PRICE_OPTIONS[number];
const _PRICE_LABELS: Record<string, string> = {
  "A": "A", "A+5": "A+5%", "B": "A+10% (B)",
  "B-15": "B-15%", "B-10": "B-10%", "B-5": "B-5%",
  "B+5": "B+5%", "B+10": "B+10%", "B+15": "B+15%", "B+20": "B+20%",
  "custom": "Custom B±", "custom_a": "Custom A+",
};

const DC_VOLTAGES = [12, 24, 36, 48, 72, 96, 120, 144, 192, 240, 336, 360, 384, 408, 480, 512, 528, 576];
const COL_W = 210;
const LABEL_W = 190;

interface WizardGroup {
  id: string;
  name: string;
  colIndices: number[];
}

interface ColState {
  ups_make: string;
  ups_model: string;
  ups_rating_kva: string;
  actual_load_kva: string;
  actual_load_kw: string;
  power_factor: string;
  inverter_efficiency: string;
  nominal_dc_voltage: string;
  backup_requirement_min: string;
  ageing_type: string;
  ageing_percent: string;
  design_margin_percent: string;
  dod_margin_percent: string;
  derating_factor_percent: string;
  centre_tap: string;
  cell_type: string;
  cell_chemistry: string;
  modular_rack: string;
  calc_done: boolean;
  calculated_load_kw: string;
  number_of_cells: string;
  max_charging_voltage: string;
  end_cell_voltage: string;
  energy_required_kwh: string;
  total_available_energy_kwh: string;
  capacity_required_ah: string;
  cap_with_ageing_ah: string;
  cap_with_design_margin_ah: string;
  cap_with_dod_margin_ah: string;
  cap_with_derating_ah: string;
  nearest_capacity_ah: string;
  offered_battery_config: string;
  backup_time_min: string;
  costing_rows: any[];
  costing_loading: boolean;
  in_quote: boolean;
}

const EMPTY_COL = (): ColState => ({
  ups_make: "", ups_model: "", ups_rating_kva: "",
  actual_load_kva: "", actual_load_kw: "",
  power_factor: "", inverter_efficiency: "",
  nominal_dc_voltage: "48", backup_requirement_min: "",
  ageing_type: "BOL", ageing_percent: "",
  design_margin_percent: "", dod_margin_percent: "",
  derating_factor_percent: "",
  centre_tap: "Non Centre Tap", cell_type: "Prismatic",
  cell_chemistry: "LFP",
  modular_rack: "-",
  calc_done: false,
  calculated_load_kw: "", number_of_cells: "",
  max_charging_voltage: "", end_cell_voltage: "",
  energy_required_kwh: "", total_available_energy_kwh: "",
  capacity_required_ah: "",
  cap_with_ageing_ah: "", cap_with_design_margin_ah: "",
  cap_with_dod_margin_ah: "", cap_with_derating_ah: "",
  nearest_capacity_ah: "", offered_battery_config: "",
  backup_time_min: "",
  costing_rows: [], costing_loading: false,
  in_quote: false,
});

function n(v: string) { return parseFloat(v) || 0; }

interface CostingRowLike {
  partcode?: string;
  est_sales_b?: string | number;
  total_cost?: string | number;
}

// same logic as costing page's getCostValue — HVL -> est_sales_b, EFL -> total_cost*1.06
function getCostValue(row: CostingRowLike | undefined): number {
  if (!row) return 0;
  const pc = String(row.partcode ?? "").toUpperCase();
  if (pc.includes("HVL")) return Number(row.est_sales_b) || 0;
  if (pc.includes("EFL")) return (Number(row.total_cost) || 0) * 1.06;
  return Number(row.est_sales_b) || 0;
}

const CENTRE_TAP_TO_WIRE: Record<string, string> = {
  "Centre Tap": "3Wire", "Non Centre Tap": "2Wire",
};

// ── reusable table-cell helpers ───────────────────────────────────────────────

const labelTd = "sticky left-0 z-10 bg-background border border-muted px-2 py-1.5 text-xs font-medium text-muted-foreground whitespace-nowrap";
const dataTd  = "border border-muted px-1.5 py-1 align-middle";
const outTd   = "border border-muted px-2 py-1.5 bg-muted/20 font-mono text-sm text-right";
const sectionTd = "sticky left-0 z-10 bg-primary/10 border border-muted px-2 py-1 text-xs font-bold uppercase tracking-wide text-primary";

// ── main page ─────────────────────────────────────────────────────────────────

export default function WizardComparePage() {
  const params  = useParams();
  const id      = params.id as string;
  const router  = useRouter();

  const [projectName,    setProjectName]    = useState("");
  const [customerName,   setCustomerName]   = useState("");
  const [solutionProvider, setSolutionProvider] = useState("");
  const [cols,           setCols]           = useState<ColState[]>([]);
  const [clipSource,     setClipSource]     = useState<number | null>(null);
  const [selectedCols,   setSelectedCols]   = useState<boolean[]>([]);
  const [calcDone,       setCalcDone]       = useState(false);
  const [costingDone,    setCostingDone]    = useState(false);
  const [resultIdx,      setResultIdx]      = useState<number[]>([]);
  // quote flow
  const [quoteCode,      setQuoteCode]      = useState("");
  const [quoteDialog,    setQuoteDialog]    = useState<"format" | "margin" | null>(null);
  const [pendingCol,     setPendingCol]     = useState<number | null>(null);
  // format dialog fields
  const [qCode,          setQCode]          = useState("");
  const [qDate,          setQDate]          = useState(() => new Date().toISOString().slice(0, 10));
  const [qFormat,        setQFormat]        = useState(FORMATS[0]);
  const [qSalesPerson,   setQSalesPerson]   = useState("");
  // margin dialog fields
  const [priceOption,    setPriceOption]    = useState<PriceOption>("B");
  const [customPct,      setCustomPct]      = useState("30");
  const [quantity,       setQuantity]       = useState("1");
  // section collapse state
  const [showSizing,    setShowSizing]    = useState(true);
  const [showCosting,   setShowCosting]   = useState(true);

  // column groups (for "Export as Project")
  const [groups,           setGroups]           = useState<WizardGroup[]>([]);
  const [groupDialogOpen,  setGroupDialogOpen]  = useState(false);
  const [editingGroupId,   setEditingGroupId]   = useState<string | null>(null);
  const [groupNameInput,   setGroupNameInput]   = useState("");
  const [groupColSelection, setGroupColSelection] = useState<Set<number>>(new Set());
  const MAX_GROUP_SIZE = 7;

  // cell chemistry options (same source as main Sizing screen)
  const [chemistries, setChemistries] = useState<string[]>(["LFP"]);
  useEffect(() => {
    api.get("/api/formulas/cell-voltages")
      .then(r => {
        const names = (r.data as { chemistry: string }[]).map(c => c.chemistry);
        if (names.length) setChemistries(names);
      })
      .catch(() => {});
  }, []);

  // modular rack options
  const [rackOptions, setRackOptions] = useState<{ key: string; price: number }[]>([]);
  useEffect(() => {
    api.get("/api/formulas/modular-rack-rates")
      .then(r => setRackOptions(r.data as { key: string; price: number }[]))
      .catch(() => {});
  }, []);
  const rackPrice = (key: string) => rackOptions.find(r => r.key === key)?.price ?? 0;

  // pending link state for sizing export
  const [pendingLinkOpen,    setPendingLinkOpen]    = useState(false);
  const [pendingExportData,  setPendingExportData]  = useState<Record<string, string>>({ export_type: "sizing_excel" });
  const [pendingExportDataList, setPendingExportDataList] = useState<Record<string, string>[] | undefined>(undefined);
  const [pendingExportFn,    setPendingExportFn]    = useState<(() => void) | null>(null);

  // ── Export as Project ────────────────────────────────────────────────────
  const [projectStep,        setProjectStep]        = useState<"form" | "preview" | null>(null);
  const [pQuoteCode,          setPQuoteCode]         = useState("");
  const [pSalesPerson,        setPSalesPerson]       = useState("");
  const [pDollarRate,         setPDollarRate]        = useState("");
  const [pWarrantyYears,      setPWarrantyYears]     = useState("5");

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const projects: any[] = JSON.parse(localStorage.getItem("wizard_projects") || "[]");
    const proj = projects.find((p: any) => p.id === id);
    if (!proj) { router.push("/dashboard/wizard"); return; }
    setProjectName(proj.name);
    const saved = localStorage.getItem(`wizard_data_${id}`);
    if (saved) {
      const data = JSON.parse(saved);
      setCustomerName(data.customer_name || "");
      setSolutionProvider(data.solution_provider || "");
      const loadedCols = data.cols?.length
        ? data.cols.map((c: Partial<ColState>) => ({ ...EMPTY_COL(), ...c }))
        : Array.from({ length: proj.count }, EMPTY_COL);
      setCols(loadedCols);
      setResultIdx(Array.from({ length: loadedCols.length }, () => 0));
      setSelectedCols(loadedCols.map((c: ColState) => c.in_quote ?? false));
      setCalcDone(data.calc_done || false);
      setCostingDone(data.costing_done || false);
      setGroups(Array.isArray(data.groups) ? data.groups : []);
      if (data.quote_code) {
        setQuoteCode(data.quote_code);
        // verify quote still exists; if deleted, clear all in_quote flags
        api.get("/api/quotation/quotes").then(res => {
          const exists = (res.data as any[]).some(q => q.code === data.quote_code);
          if (!exists) {
            setQuoteCode("");
            setCols(prev => prev.map(c => ({ ...c, in_quote: false })));
            setSelectedCols(prev => prev.map(() => false));
          }
        }).catch(() => {});
      }
    } else {
      setCols(Array.from({ length: proj.count }, EMPTY_COL));
      setResultIdx(Array.from({ length: proj.count }, () => 0));
      setSelectedCols(Array.from({ length: proj.count }, () => false));
    }
  }, [id]);

  // ── auto-save ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cols.length) return;
    localStorage.setItem(`wizard_data_${id}`, JSON.stringify({
      customer_name: customerName, solution_provider: solutionProvider,
      cols, calc_done: calcDone, costing_done: costingDone, quote_code: quoteCode,
      groups,
    }));
  }, [customerName, solutionProvider, cols, calcDone, costingDone, quoteCode, groups, id]);

  // ── helpers ───────────────────────────────────────────────────────────────
  const updateCol = (i: number, patch: Partial<ColState>) =>
    setCols(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));

  const sel = (i: number, key: keyof ColState, val: string) =>
    updateCol(i, { [key]: val } as any);

  const updateNearest = (i: number, val: string) => {
    const col = cols[i];
    const cap = parseFloat(val) || 0;
    const config    = cap > 0 ? `${Math.round(n(col.nominal_dc_voltage))}V ${Math.round(cap)}Ah` : "";
    const capDer    = n(col.cap_with_derating_ah);
    const backupReq = n(col.backup_requirement_min);
    const backupTime = (cap > 0 && capDer > 0) ? String(Math.floor((backupReq / capDer) * cap)) : "";
    updateCol(i, { nearest_capacity_ah: val, offered_battery_config: config, backup_time_min: backupTime });
  };

  // ── size all ──────────────────────────────────────────────────────────────
  const handleSize = () => {
    setCols(prev => prev.map(col => {
      const out = runCalculation({
        actualKw: n(col.actual_load_kw), actualKva: n(col.actual_load_kva),
        upsKva: n(col.ups_rating_kva), powerFactor: n(col.power_factor),
        inverterEfficiency: n(col.inverter_efficiency) / 100,
        nominalDcVoltage: n(col.nominal_dc_voltage),
        backupRequirementMin: n(col.backup_requirement_min),
        ageingPct: col.ageing_type === "BOL" ? 0 : n(col.ageing_percent),
        designMarginPct: n(col.design_margin_percent),
        dodMarginPct: n(col.dod_margin_percent),
        deratingPct: n(col.derating_factor_percent),
        cellChemistry: col.cell_chemistry || "LFP", nearestCapacity: n(col.nearest_capacity_ah),
      });
      return {
        ...col, calc_done: true,
        calculated_load_kw:         String(out.calculatedLoadKw),
        number_of_cells:            String(out.numberOfCells),
        max_charging_voltage:       String(out.maxChargingVoltage),
        end_cell_voltage:           String(out.endCellVoltage),
        energy_required_kwh:        String(out.energyRequiredKwh),
        total_available_energy_kwh: String(out.totalAvailableEnergyKwh),
        capacity_required_ah:     String(out.capacityRequiredAh),
        cap_with_ageing_ah:       String(out.capWithAgeingAh),
        cap_with_design_margin_ah:String(out.capWithDesignMarginAh),
        cap_with_dod_margin_ah:   String(out.capWithDodAh),
        cap_with_derating_ah:     String(out.capWithDeratingAh),
        backup_time_min:          String(out.backupTimeMin),
      };
    }));
    setCalcDone(true);
    toast.success("Sizing calculated for all columns");
  };

  // ── calculate costing ─────────────────────────────────────────────────────
  const handleCalculateCosting = async () => {
    if (!cols.some(c => c.offered_battery_config)) {
      toast.warning("Enter nearest capacity for at least one column first");
      return;
    }
    setResultIdx(Array.from({ length: cols.length }, () => 0));
    setCols(prev => prev.map(col => ({
      ...col,
      costing_loading: !!col.offered_battery_config,
      costing_rows: [],
    })));
    await Promise.all(cols.map(async (col, i) => {
      if (!col.offered_battery_config) return;
      try {
        const res = await api.post("/api/costing/find", {
          battery_config:  col.offered_battery_config,
          backup_minutes:  n(col.backup_requirement_min),
          centre_tap:      col.centre_tap,
          cell_type:       col.cell_type,
        });
        updateCol(i, { costing_rows: res.data.results || [], costing_loading: false });
      } catch (e: any) {
        toast.error(`Sizing ${i + 1}: ${apiErr(e, "Costing search failed")}`);
        updateCol(i, { costing_loading: false });
      }
    }));
    setCostingDone(true);
  };

  // ── clipboard copy: clipSource → dest ────────────────────────────────────
  const copyCol = (from: number, to: number) => {
    const s = cols[from];
    updateCol(to, {
      ups_make: s.ups_make, ups_model: s.ups_model, ups_rating_kva: s.ups_rating_kva,
      actual_load_kva: s.actual_load_kva, actual_load_kw: s.actual_load_kw,
      power_factor: s.power_factor, inverter_efficiency: s.inverter_efficiency,
      nominal_dc_voltage: s.nominal_dc_voltage, backup_requirement_min: s.backup_requirement_min,
      ageing_type: s.ageing_type, ageing_percent: s.ageing_percent,
      design_margin_percent: s.design_margin_percent, dod_margin_percent: s.dod_margin_percent,
      derating_factor_percent: s.derating_factor_percent,
      centre_tap: s.centre_tap, cell_type: s.cell_type, cell_chemistry: s.cell_chemistry,
      modular_rack: s.modular_rack,
    });
    setClipSource(null);
    toast.success(`Copied Sizing ${from + 1} → Sizing ${to + 1}`);
  };

  // ── checkbox handler ─────────────────────────────────────────────────────
  const handleCheck = async (i: number, checked: boolean) => {
    if (!checked) {
      if (cols[i]?.in_quote) return; // stays checked until quote is deleted
      setSelectedCols(prev => { const a = [...prev]; a[i] = false; return a; });
      return;
    }
    setSelectedCols(prev => { const a = [...prev]; a[i] = true; return a; });
    setPendingCol(i);
    if (!quoteCode) {
      // first sizing checked — need quote format
      try {
        const res = await api.get("/api/quotation/next-code");
        setQCode(res.data.code || "");
      } catch { setQCode(""); }
      setQuoteDialog("format");
    } else {
      setQuoteDialog("margin");
    }
  };

  const handleCreateQuote = async () => {
    if (!qCode.trim()) { toast.error("Quote code required"); return; }
    try {
      await api.post("/api/quotation/quotes", {
        code: qCode.trim(), date: qDate,
        customer_name: customerName, solution_provider: solutionProvider,
        sales_person: qSalesPerson,
        format_name: qFormat,
      });
      setQuoteCode(qCode.trim());
      setQuoteDialog("margin");
    } catch (e: any) {
      toast.error(apiErr(e, "Failed to create quote"));
    }
  };

  const handleAddToQuote = async () => {
    if (pendingCol === null) return;
    const col = cols[pendingCol];
    const row = col.costing_rows[resultIdx[pendingCol] ?? 0];
    try {
      const aKva = parseFloat(col.actual_load_kva) || 0;
      const aKw  = parseFloat(col.actual_load_kw) || 0;
      const uKva = parseFloat(col.ups_rating_kva) || 0;
      const cKw  = parseFloat(col.calculated_load_kw) || 0;
      const ups_rating = uKva > 0 ? String(uKva) : "-";
      const calc_load  = aKva > 0 ? String(aKva) : aKw > 0 ? String(aKw) : "";

      const res = await api.post(`/api/quotation/quotes/${quoteCode}/add-from-sizing-screen`, {
        battery_config:    col.offered_battery_config,
        duration:          row?.duration || col.backup_requirement_min,
        backup_time_min:   col.backup_time_min || col.backup_requirement_min,
        ageing_type:       col.ageing_type || "BOL",
        kw_calculation:    cKw,
        cell_type:         row?.cell_type || col.cell_type,
        centre_tap:        row?.centre_tap || col.centre_tap,
        partcode:          row?.partcode || "",
        total_cost:        parseFloat(row?.total_cost) || 0,
        price_option:      priceOption,
        quantity:          parseInt(quantity) || 1,
        custom_pct:        parseFloat(customPct) || 0,
        actual_load_kva:   aKva,
        actual_load_kw:    aKw,
        ups_rating_kva:    uKva,
        calculated_load_kw: cKw,
      });
      updateCol(pendingCol, { in_quote: true });
      toast.success(`Sizing ${pendingCol + 1} added to quote ${quoteCode} (Sr ${res.data.sr_no}) — view in Quotations`);
    } catch (e: any) {
      setSelectedCols(prev => { const a = [...prev]; a[pendingCol] = false; return a; });
      toast.error(apiErr(e, "Failed to add to quote"));
    }
    setQuoteDialog(null);
    setPendingCol(null);
  };

  // ── export sizing ─────────────────────────────────────────────────────────
  const _doExportSizing = async (fmt: "xlsx" | "pdf") => {
    const activePairs = cols.map((c, i) => ({ c, i })).filter(({ c }) => c.offered_battery_config && c.offered_battery_config !== "—");
    if (!activePairs.length) { toast.warning("No sized columns to export"); return; }
    const activeCols = activePairs.map(p => p.c);
    const endpoint = fmt === "pdf" ? "/api/sizing/export-wizard/pdf" : "/api/sizing/export-wizard";
    try {
      const res = await api.post(endpoint, {
        project_name: projectName,
        customer_name: customerName,
        solution_provider: solutionProvider,
        cols: activeCols,
      }, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}_sizing.${fmt}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(apiErr(e, "Export failed"));
    }
  };

  const handleExportSizing = () => {
    const first = cols.find(c => c.offered_battery_config && c.offered_battery_config !== "—");
    setPendingExportData({
      export_type: "sizing_excel",
      ups_make: first?.ups_make ?? "",
      ups_model: first?.ups_model ?? "",
      ups_kva: first?.ups_rating_kva ?? "",
      actual_load_kva: first?.actual_load_kva ?? "",
      load_kw: first?.actual_load_kw ?? "",
      power_factor: first?.power_factor ?? "",
      inverter_efficiency: first?.inverter_efficiency ?? "",
      dc_voltage: first?.nominal_dc_voltage ?? "",
      backup_min: first?.backup_requirement_min ?? "",
      cell_chemistry: first?.cell_type ?? "",
      capacity_ah: first?.nearest_capacity_ah ?? "",
    });
    setPendingExportFn(() => () => _doExportSizing("xlsx"));
    setPendingLinkOpen(true);
  };

  const handleExportSizingPdf = () => {
    const first = cols.find(c => c.offered_battery_config && c.offered_battery_config !== "—");
    setPendingExportData({
      export_type: "sizing_pdf",
      ups_make: first?.ups_make ?? "",
      ups_model: first?.ups_model ?? "",
      ups_kva: first?.ups_rating_kva ?? "",
      actual_load_kva: first?.actual_load_kva ?? "",
      load_kw: first?.actual_load_kw ?? "",
      power_factor: first?.power_factor ?? "",
      inverter_efficiency: first?.inverter_efficiency ?? "",
      dc_voltage: first?.nominal_dc_voltage ?? "",
      backup_min: first?.backup_requirement_min ?? "",
      cell_chemistry: first?.cell_type ?? "",
      capacity_ah: first?.nearest_capacity_ah ?? "",
    });
    setPendingExportFn(() => () => _doExportSizing("pdf"));
    setPendingLinkOpen(true);
  };

  // COSTING EXPORT DISABLED — do not re-enable without authorisation
  // const _doExportCosting = async (fmt: "xlsx" | "pdf") => {
  //   const activePairs2 = cols
  //     .map((col, i) => ({ col, i, row: col.costing_rows[resultIdx[i] ?? 0] }))
  //     .filter(({ col, row }) => col.offered_battery_config && col.offered_battery_config !== "—" && row);
  //   if (!activePairs2.length) { toast.warning("No costing results to export"); return; }
  //   const endpoint = fmt === "pdf" ? "/api/costing/export-wizard/pdf" : "/api/costing/export-wizard";
  //   try {
  //     const res = await api.post(endpoint, {
  //       project_name: projectName,
  //       rows: activePairs2.map(p => p.row),
  //     }, { responseType: "blob" });
  //     const url = window.URL.createObjectURL(new Blob([res.data]));
  //     const a = document.createElement("a");
  //     a.href = url;
  //     a.download = `${projectName}_costing.${fmt}`;
  //     a.click();
  //     window.URL.revokeObjectURL(url);
  //   } catch (e: any) {
  //     toast.error(apiErr(e, "Export failed"));
  //   }
  // };
  // const handleExportCosting    = () => _doExportCosting("xlsx");
  // const handleExportCostingPdf = () => _doExportCosting("pdf");

  const handleAddCol = () => {
    setCols(prev => [...prev, EMPTY_COL()]);
    setSelectedCols(prev => [...prev, false]);
    setResultIdx(prev => [...prev, 0]);
  };

  const handleDeleteCol = (i: number) => {
    if (cols.length <= 1) { toast.warning("Need at least one sizing"); return; }
    setCols(prev => prev.filter((_, idx) => idx !== i));
    setSelectedCols(prev => prev.filter((_, idx) => idx !== i));
    setResultIdx(prev => prev.filter((_, idx) => idx !== i));
    if (clipSource === i) setClipSource(null);
    else if (clipSource !== null && clipSource > i) setClipSource(clipSource - 1);
    // shift/remove group column indices to match the new column layout
    setGroups(prev => prev
      .map(g => ({
        ...g,
        colIndices: g.colIndices
          .filter(ci => ci !== i)
          .map(ci => ci > i ? ci - 1 : ci),
      }))
      .filter(g => g.colIndices.length > 0)
    );
  };

  // ── group helpers ─────────────────────────────────────────────────────────
  const getColGroup = (i: number) => groups.find(g => g.colIndices.includes(i));

  const openNewGroupDialog = () => {
    setEditingGroupId(null);
    setGroupNameInput(`Group ${groups.length + 1}`);
    setGroupColSelection(new Set());
    setGroupDialogOpen(true);
  };

  const openEditGroupDialog = (g: WizardGroup) => {
    setEditingGroupId(g.id);
    setGroupNameInput(g.name);
    setGroupColSelection(new Set(g.colIndices));
    setGroupDialogOpen(true);
  };

  const toggleGroupCol = (i: number) => {
    setGroupColSelection(prev => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else {
        if (next.size >= MAX_GROUP_SIZE) {
          toast.warning(`A group can have at most ${MAX_GROUP_SIZE} sizings`);
          return prev;
        }
        next.add(i);
      }
      return next;
    });
  };

  const handleSaveGroup = () => {
    const name = groupNameInput.trim();
    if (!name) { toast.error("Group name required"); return; }
    if (!groupColSelection.size) { toast.error("Select at least one sizing"); return; }
    const colIndices = Array.from(groupColSelection).sort((a, b) => a - b);
    setGroups(prev => {
      // remove selected columns from any other group first (a column belongs to at most one group)
      const cleaned = prev.map(g => g.id === editingGroupId ? g : {
        ...g, colIndices: g.colIndices.filter(ci => !groupColSelection.has(ci)),
      }).filter(g => g.id === editingGroupId || g.colIndices.length > 0);

      if (editingGroupId) {
        return cleaned.map(g => g.id === editingGroupId ? { ...g, name, colIndices } : g);
      }
      return [...cleaned, { id: `grp_${Date.now()}`, name, colIndices }];
    });
    setGroupDialogOpen(false);
  };

  const handleDeleteGroup = (id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
  };

  // ── Export as Project helpers ────────────────────────────────────────────
  const effectiveGroups = (() => {
    const assigned = new Set(groups.flatMap(g => g.colIndices));
    const ungroupedIndices = cols.map((_, i) => i).filter(i => !assigned.has(i));
    const real = groups.map(g => ({ name: g.name, colIndices: g.colIndices }));
    if (ungroupedIndices.length) real.push({ name: "Default", colIndices: ungroupedIndices });
    return real;
  })();

  const buildProjectCol = (i: number) => {
    const col = cols[i];
    const activeRow = col.costing_rows[resultIdx[i] ?? 0];
    return {
      nominal_dc_voltage: col.nominal_dc_voltage,
      backup_requirement_min: col.backup_requirement_min,
      cell_chemistry: col.cell_chemistry,
      centre_tap: col.centre_tap,
      cell_type: col.cell_type,
      ups_rating_kva: col.ups_rating_kva,
      power_factor: col.power_factor,
      inverter_efficiency: col.inverter_efficiency,
      end_cell_voltage: col.end_cell_voltage,
      max_charging_voltage: col.max_charging_voltage,
      calculated_load_kw: col.calculated_load_kw,
      energy_required_kwh: col.energy_required_kwh,
      capacity_required_ah: col.capacity_required_ah,
      nearest_capacity_ah: col.nearest_capacity_ah,
      total_available_energy_kwh: col.total_available_energy_kwh,
      backup_time_min: col.backup_time_min,
      offered_battery_config: col.offered_battery_config,
      cost: activeRow ? String(getCostValue(activeRow)) : "",
      modular_rack: col.modular_rack,
      modular_rack_price: col.modular_rack !== "-" ? String(rackPrice(col.modular_rack)) : "",
    };
  };
  type ProjectColData = ReturnType<typeof buildProjectCol>;

  const buildProjectPayload = () => ({
    customer_name: customerName,
    solution_provider: solutionProvider,
    quote_code: pQuoteCode.trim(),
    sales_person: pSalesPerson,
    dollar_rate: pDollarRate,
    warranty_years: pWarrantyYears,
    groups: effectiveGroups.map(g => ({
      name: g.name,
      cols: g.colIndices.map(buildProjectCol),
    })),
    // full wizard state, stored blindly by the backend for "Load Past Wizard" restore
    full_state: { customer_name: customerName, solution_provider: solutionProvider, cols, groups },
  });

  const openProjectExport = async () => {
    if (!cols.some(c => c.offered_battery_config && c.offered_battery_config !== "—")) {
      toast.warning("No sized columns to export");
      return;
    }
    setPSalesPerson(""); setPDollarRate(""); setPWarrantyYears("5");
    try {
      const res = await api.get("/api/quotation/next-code");
      setPQuoteCode(res.data.code || "");
    } catch { setPQuoteCode(""); }
    setProjectStep("form");
  };

  // actual API call + file download — only runs after the user links to a pending item
  const _doDownloadProject = async () => {
    try {
      const payload = buildProjectPayload();
      const res = await api.post("/api/sizing/export-project", payload, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pQuoteCode || "project"}_multi_sizing.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast.error(apiErr(e, "Export failed"));
    }
  };

  // preview "Export" click: build per-column export-history entries, then open the
  // pending-link dialog. Download itself is deferred until linking succeeds (same
  // convention as the existing sizing export flow).
  const handleConfirmProjectExport = () => {
    // sol_no must be unique across the WHOLE export (all groups share one quote_code),
    // so it runs as one counter here rather than resetting per group.
    let globalSolNo = 0;
    const entries: Record<string, string>[] = effectiveGroups.flatMap(g =>
      g.colIndices.map((idx) => {
        globalSolNo += 1;
        const col = cols[idx];
        const activeRow = col.costing_rows[resultIdx[idx] ?? 0];
        return {
          export_type: "quote_project",
          sol_no: String(globalSolNo),
          quote_code: pQuoteCode.trim(),
          sales_person: pSalesPerson,
          dollar_rate: pDollarRate,
          solution_provider: solutionProvider,
          project_customer: customerName,
          part_code: col.offered_battery_config,
          cell_type: col.cell_type,
          centre_tap: col.centre_tap,
          ageing_type: col.ageing_type,
          backup_time_min: col.backup_time_min,
          price_system: activeRow ? String(getCostValue(activeRow)) : "",
          rack1_dim: col.modular_rack !== "-" ? col.modular_rack : "",
          rack1_price: col.modular_rack !== "-" ? String(rackPrice(col.modular_rack)) : "",
          ups_make: col.ups_make,
          ups_model: col.ups_model,
          actual_load_kva: col.actual_load_kva,
          load_kw: col.actual_load_kw,
          power_factor: col.power_factor,
          inverter_efficiency: col.inverter_efficiency,
          dc_voltage: col.nominal_dc_voltage,
          backup_min: col.backup_requirement_min,
          cell_chemistry: col.cell_chemistry,
          ageing_pct: col.ageing_percent,
          design_margin_pct: col.design_margin_percent,
          dod_margin_pct: col.dod_margin_percent,
          derating_pct: col.derating_factor_percent,
          capacity_ah: col.nearest_capacity_ah,
        };
      })
    );
    setProjectStep(null);
    setPendingExportDataList(entries);
    // NOTE: this top-level tag must NOT start with "quote_" — PendingLinkDialog's
    // isQuoteExport check tests this exact field and would otherwise reroute the
    // whole flow into the single-quote /from-quote endpoint, bypassing the bulk
    // exportDataList entries below entirely (each of which correctly keeps the
    // "quote_project" prefix so the backend's Inquiry-sync logic picks them up).
    setPendingExportData({ export_type: "project_export" });
    setPendingExportFn(() => _doDownloadProject);
    setPendingLinkOpen(true);
  };

  if (!cols.length) return <div className="p-5 text-muted-foreground">Loading…</div>;

  const C = cols.length; // number of columns

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Toolbar — fixed, never scrolls ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-background shrink-0 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/wizard")}>← Back</Button>
        <h1 className="text-lg font-bold">{projectName}</h1>
        <div className="flex-1" />
        {clipSource !== null && (
          <>
            <span className="text-sm text-blue-600 font-medium">
              Sizing {clipSource + 1} copied — click a destination column header to paste
            </span>
            <Button size="sm" variant="ghost" onClick={() => setClipSource(null)}>Cancel</Button>
          </>
        )}
        {quoteCode && (
          <button
            className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-2 py-1 rounded font-medium hover:bg-amber-200 dark:hover:bg-amber-800/50"
            onClick={() => router.push("/dashboard/quote")}
          >
            Quote: {quoteCode} → View
          </button>
        )}
        <Button size="sm" onClick={handleSize}>Size All</Button>
        <Button variant="outline" size="sm" onClick={openNewGroupDialog}>+ New Group</Button>
        {calcDone && showSizing && (
          <>
            <Button variant="outline" size="sm" onClick={handleExportSizing} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Sizing Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportSizingPdf} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Sizing PDF
            </Button>
            <Button variant="outline" size="sm" onClick={openProjectExport} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export as Project
            </Button>
          </>
        )}
        {calcDone && (
          <Button variant="outline" size="sm" onClick={handleCalculateCosting} className="gap-1.5">
            <Calculator className="h-3.5 w-3.5" />
            Calculate Costing
          </Button>
        )}
        {/* COSTING EXPORT DISABLED — do not re-enable without authorisation */}
        {/* {calcDone && costingDone && showCosting && (
          <>
            <Button variant="outline" size="sm" onClick={handleExportCosting} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Costing Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCostingPdf} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Costing PDF
            </Button>
          </>
        )} */}
      </div>

      {/* ── Shared fields — fixed, never scrolls ── */}
      <div className="flex items-center gap-6 px-4 py-2 border-b bg-muted/30 shrink-0 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium whitespace-nowrap">Customer Name</Label>
          <Input className="h-7 text-sm w-52" value={customerName}
            onChange={e => setCustomerName(e.target.value)} placeholder="Customer name" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium whitespace-nowrap">Solution Provider</Label>
          <Input className="h-7 text-sm w-52" value={solutionProvider}
            onChange={e => setSolutionProvider(e.target.value)} placeholder="Solution provider" />
        </div>
      </div>

      {/* ── Groups bar ── */}
      {groups.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b bg-muted/10 shrink-0 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Groups:</span>
          {groups.map(g => (
            <span
              key={g.id}
              className="flex items-center gap-1.5 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full cursor-pointer hover:bg-primary/20"
              onClick={() => openEditGroupDialog(g)}
            >
              {g.name} ({g.colIndices.length}/{MAX_GROUP_SIZE})
              <X
                className="h-3 w-3 hover:text-destructive"
                onClick={e => { e.stopPropagation(); handleDeleteGroup(g.id); }}
              />
            </span>
          ))}
          {(() => {
            const ungrouped = cols.filter((_, i) => !getColGroup(i)).length;
            return ungrouped > 0 ? (
              <span className="text-xs text-muted-foreground">
                {ungrouped} ungrouped → exported as &quot;Default&quot;
              </span>
            ) : null;
          })()}
        </div>
      )}

      {/* ── Comparison table — scrolls both axes ── */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-sm" style={{ minWidth: LABEL_W + C * COL_W + 40 }}>

          {/* sticky column headers */}
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted">
              {/* corner — sticky top + left */}
              <th
                className="sticky left-0 z-30 bg-muted border border-muted px-2 py-2 font-semibold text-left"
                style={{ width: LABEL_W, minWidth: LABEL_W }}
              >
                Field
              </th>
              {cols.map((_, i) => (
                <th
                  key={i}
                  style={{ width: COL_W, minWidth: COL_W }}
                  className={cn(
                    "border border-muted px-2 py-2 font-semibold text-left",
                    clipSource !== null && clipSource !== i
                      ? "cursor-pointer bg-green-100 dark:bg-green-900/40 hover:bg-green-200 dark:hover:bg-green-800/60"
                      : "bg-muted",
                    clipSource === i ? "ring-2 ring-inset ring-blue-500 bg-blue-50 dark:bg-blue-950/30" : "",
                  )}
                  onClick={() => { if (clipSource !== null && clipSource !== i) copyCol(clipSource, i); }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <label className="flex items-center gap-1.5 cursor-pointer" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="h-3 w-3 cursor-pointer"
                        checked={selectedCols[i] ?? false}
                        onChange={e => handleCheck(i, e.target.checked)}
                      />
                      <span>Sizing {i + 1}</span>
                      {getColGroup(i) && (
                        <span className="text-[9px] bg-primary/20 text-primary px-1 py-0.5 rounded-full leading-none">
                          {getColGroup(i)!.name}
                        </span>
                      )}
                    </label>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        className={cn(
                          "p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10",
                          clipSource === i ? "text-blue-600" : "text-muted-foreground hover:text-foreground"
                        )}
                        title={clipSource === i ? "Cancel clipboard" : "Copy this column's inputs"}
                        onClick={e => { e.stopPropagation(); setClipSource(clipSource === i ? null : i); }}
                      >
                        <Clipboard className="h-3 w-3" />
                      </button>
                      <button
                        className="p-0.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Delete this sizing"
                        onClick={e => { e.stopPropagation(); handleDeleteCol(i); }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </th>
              ))}
              {/* ── Add column ── */}
              <th
                className="sticky top-0 bg-muted border border-muted px-1 py-2 text-center"
                style={{ width: 40, minWidth: 40 }}
              >
                <button
                  className="w-full h-full flex items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground hover:text-foreground"
                  title="Add sizing column"
                  onClick={handleAddCol}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {/* ── SIZING toggle header ── */}
            <tr>
              <td
                className={sectionTd + " cursor-pointer select-none"}
                colSpan={C + 2}
                onClick={() => setShowSizing(v => !v)}
              >
                <span className="flex items-center gap-1.5">
                  {showSizing
                    ? <ChevronDown className="h-3 w-3" />
                    : <ChevronRight className="h-3 w-3" />}
                  Sizing
                </span>
              </td>
            </tr>

            {showSizing && <>
              {([
                ["UPS Make",            "ups_make",               "text"],
                ["UPS Model",           "ups_model",              "text"],
                ["UPS Rating (KVA)",    "ups_rating_kva",         "number"],
                ["Actual Load (KVA)",   "actual_load_kva",        "number"],
                ["Actual Load (kW)",    "actual_load_kw",         "number"],
                ["Power Factor",        "power_factor",           "number"],
                ["Inverter Efficiency (%)", "inverter_efficiency",    "number"],
                ["Backup Req. (min)",   "backup_requirement_min", "number"],
              ] as const).map(([lbl, key, type]) => (
                <tr key={key}>
                  <td className={labelTd}>{lbl}</td>
                  {cols.map((col, i) => (
                    <td key={i} className={dataTd}>
                      <Input className="h-7 text-sm w-full" type={type} value={(col as any)[key]}
                        onChange={e => sel(i, key as keyof ColState, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}

              {/* DC Voltage */}
              <tr>
                <td className={labelTd}>DC Voltage (V)</td>
                {cols.map((col, i) => (
                  <td key={i} className={dataTd}>
                    <select className="h-7 w-full rounded border px-1 text-sm bg-background"
                      value={col.nominal_dc_voltage} onChange={e => sel(i, "nominal_dc_voltage", e.target.value)}>
                      {DC_VOLTAGES.map(v => <option key={v} value={String(v)}>{v}V</option>)}
                    </select>
                  </td>
                ))}
              </tr>

              {/* Ageing Type */}
              <tr>
                <td className={labelTd}>Ageing Type</td>
                {cols.map((col, i) => (
                  <td key={i} className={dataTd}>
                    <select className="h-7 w-full rounded border px-1 text-sm bg-background"
                      value={col.ageing_type}
                      onChange={e => updateCol(i, { ageing_type: e.target.value, ageing_percent: e.target.value === "BOL" ? "" : col.ageing_percent })}>
                      <option value="BOL">BOL</option>
                      <option value="EOL">EOL</option>
                    </select>
                  </td>
                ))}
              </tr>

              {([
                ["Ageing %",        "ageing_percent",          true],
                ["Design Margin %", "design_margin_percent",   false],
                ["DOD %",           "dod_margin_percent",      false],
                ["Derating %",      "derating_factor_percent", false],
              ] as const).map(([lbl, key, ageDisable]) => (
                <tr key={key}>
                  <td className={labelTd}>{lbl}</td>
                  {cols.map((col, i) => (
                    <td key={i} className={dataTd}>
                      <Input className="h-7 text-sm w-full" type="number" value={(col as any)[key]}
                        disabled={ageDisable && col.ageing_type === "BOL"}
                        onChange={e => sel(i, key as keyof ColState, e.target.value)} />
                    </td>
                  ))}
                </tr>
              ))}

              {/* Centre Tap */}
              <tr>
                <td className={labelTd}>Centre Tap</td>
                {cols.map((col, i) => (
                  <td key={i} className={dataTd}>
                    <select className="h-7 w-full rounded border px-1 text-sm bg-background"
                      value={col.centre_tap} onChange={e => sel(i, "centre_tap", e.target.value)}>
                      <option value="Centre Tap">Centre Tap</option>
                      <option value="Non Centre Tap">Non Centre Tap</option>
                    </select>
                  </td>
                ))}
              </tr>

              {/* Cell Type */}
              <tr>
                <td className={labelTd}>Cell Type</td>
                {cols.map((col, i) => (
                  <td key={i} className={dataTd}>
                    <select className="h-7 w-full rounded border px-1 text-sm bg-background"
                      value={col.cell_type} onChange={e => sel(i, "cell_type", e.target.value)}>
                      <option value="Prismatic">Prismatic</option>
                      <option value="Cylindrical">Cylindrical</option>
                    </select>
                  </td>
                ))}
              </tr>

              {/* Cell Chemistry */}
              <tr>
                <td className={labelTd}>Cell Chemistry</td>
                {cols.map((col, i) => (
                  <td key={i} className={dataTd}>
                    <select className="h-7 w-full rounded border px-1 text-sm bg-background"
                      value={col.cell_chemistry} onChange={e => sel(i, "cell_chemistry", e.target.value)}>
                      {chemistries.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                ))}
              </tr>

              {/* Modular Battery Rack */}
              <tr>
                <td className={labelTd}>Modular Battery Rack</td>
                {cols.map((col, i) => (
                  <td key={i} className={dataTd}>
                    <select className="h-7 w-full rounded border px-1 text-sm bg-background"
                      value={col.modular_rack} onChange={e => sel(i, "modular_rack", e.target.value)}>
                      <option value="-">- (none)</option>
                      {rackOptions.map(r => <option key={r.key} value={r.key}>{r.key}</option>)}
                    </select>
                  </td>
                ))}
              </tr>

              {/* Outputs (only when sized) */}
              {calcDone && <>
                <tr>
                  <td className={sectionTd} colSpan={C + 2}>Outputs</td>
                </tr>

                {([
                  ["Calculated Load (kW)",       "calculated_load_kw"],
                  ["No. of Cells",               "number_of_cells"],
                  ["Energy Required (kWh)",      "energy_required_kwh"],
                  ["Capacity Required (Ah)",     "capacity_required_ah"],
                  ["Cap w/ Ageing (Ah)",         "cap_with_ageing_ah"],
                  ["Cap w/ Design Margin (Ah)",  "cap_with_design_margin_ah"],
                  ["Cap w/ DOD (Ah)",            "cap_with_dod_margin_ah"],
                  ["Cap w/ Derating (Ah)",       "cap_with_derating_ah"],
                ] as const).map(([lbl, key]) => (
                  <tr key={key}>
                    <td className={labelTd}>{lbl}</td>
                    {cols.map((col, i) => (
                      <td key={i} className={outTd}>{(col as any)[key] || "—"}</td>
                    ))}
                  </tr>
                ))}

                <tr>
                  <td className={labelTd}>Nearest Capacity (Ah)</td>
                  {cols.map((col, i) => (
                    <td key={i} className={dataTd}>
                      <Input className="h-7 text-sm w-full" type="number" value={col.nearest_capacity_ah}
                        onChange={e => updateNearest(i, e.target.value)} />
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className={labelTd}>Offered Battery Config</td>
                  {cols.map((col, i) => (
                    <td key={i} className="border border-muted px-2 py-1.5 text-sm font-semibold bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-300">
                      {col.offered_battery_config || "—"}
                    </td>
                  ))}
                </tr>

                <tr>
                  <td className={labelTd}>Backup Time (min)</td>
                  {cols.map((col, i) => (
                    <td key={i} className={outTd}>{col.backup_time_min || "—"}</td>
                  ))}
                </tr>
              </>}
            </>}

            {/* ── COSTING toggle header (visible once sizing is done) ── */}
            {calcDone && (
              <tr>
                <td
                  className={sectionTd + " cursor-pointer select-none"}
                  colSpan={C + 2}
                  onClick={() => setShowCosting(v => !v)}
                >
                  <span className="flex items-center gap-1.5">
                    {showCosting
                      ? <ChevronDown className="h-3 w-3" />
                      : <ChevronRight className="h-3 w-3" />}
                    Costing
                  </span>
                </td>
              </tr>
            )}

            {calcDone && showCosting && <>
              {([
                ["Battery Config",    "offered_battery_config"],
                ["Backup Req. (min)", "backup_requirement_min"],
                ["Centre Tap",        "centre_tap"],
                ["Cell Type",         "cell_type"],
              ] as const).map(([lbl, key]) => (
                <tr key={key}>
                  <td className={labelTd}>{lbl}</td>
                  {cols.map((col, i) => (
                    <td key={i} className="border border-muted px-2 py-1.5 text-sm">
                      {(col as any)[key] || "—"}
                    </td>
                  ))}
                </tr>
              ))}

              {costingDone && (() => {
                const FIELDS: [string, string][] = [
                  ["Part Code",                   "partcode"],
                  ["Duration",                    "duration"],
                  ["Battery Pack",                "battery_pack"],
                  ["Dollar Rate (INR/USD)",        "dollar_rate"],
                  ["Creation Date",                "creation_date"],
                  ["Created By",                   "created_by"],
                  ["Voltage",                     "voltage"],
                  ["Ampere Capacity",             "ampere_capacity"],
                  ["KW Calculation",              "kw_calculation"],
                  ["Cell Voltage",                "cell_voltage"],
                  ["Cell Capacity",               "cell_capacity"],
                  ["Cells in Series",             "cells_in_series"],
                  ["Cells in Parallel",           "cells_in_parallel"],
                  ["Total No. of Cells",          "total_cells"],
                  ["FOB Cost of Cells",           "fob_cost"],
                  ["Total FOB Cost",              "total_fob"],
                  ["Clearing & Customs (1)",      "clearing_customs_1"],
                  ["Total Landed Cost (1)",       "total_landed_1"],
                  ["Cost in INR (1)",             "cost_inr_1"],
                  ["BMS/PCM Cost",                "bms_pcm_cost"],
                  ["Clearing & Customs (2)",      "clearing_customs_2"],
                  ["Total Landed Cost (2)",       "total_landed_2"],
                  ["Cost in INR (2)",             "cost_inr_2"],
                  ["Cabinet",                     "cabinet"],
                  ["Bus Bar",                     "bus_bar"],
                  ["Holder / Caps",               "holder_caps"],
                  ["Wire & Gasket",               "wire_gasket"],
                  ["Terminals & Connectors",      "terminals"],
                  ["MCB / Fuse",                  "mcb_fuse"],
                  ["Lugs & Slew",                 "lugs_slew"],
                  ["Nut Bolts",                   "nut_bolts"],
                  ["Fiber Glass + Rod",           "fiber_glass"],
                  ["AWG Cables",                  "awg_cables"],
                  ["Shipping",                    "shipping"],
                  ["Packaging",                   "packaging"],
                  ["Total Other Charges (3)",     "total_other"],
                  ["Landing Cost (1+2+3)",        "landing_cost"],
                  ["Labour & Assembly",           "labour"],
                  ["Warranty & Service",          "warranty"],
                  ["Total Cost of Pack (A)",      "total_cost"],
                  ["Margin @ 10%",                "margin_10"],
                  ["Sales (B)",                   "est_sales_b"],
                  ["Margin @ 15%",                "margin_15"],
                  ["Sales (B+5%)",                "est_sales_b5"],
                  ["Per kW @ Cost (A)",           "per_kw_cost"],
                  ["Per kW @ Sales (B)",          "per_kw_b"],
                  ["Per kW @ Sales (B+5%)",       "per_kw_b5"],
                  ["BMS/PCM",                     "bms_pcm"],
                  ["Cell Chemistry",              "cell_chemistry"],
                  ["Centre Tap",                  "centre_tap"],
                  ["Cell Type",                   "cell_type"],
                  ["Application",                 "application"],
                  ["Enclosure",                   "enclosure"],
                  ["Mount",                       "mount"],
                  ["Brand",                       "brand"],
                  ["Installation",                "installation"],
                ];
                return (
                  <>
                    <tr>
                      <td className={sectionTd} colSpan={C + 2}>Costing Results</td>
                    </tr>
                    <tr>
                      <td className={labelTd}>Result</td>
                      {cols.map((col, i) => {
                        const total = col.costing_rows.length;
                        const idx   = resultIdx[i] ?? 0;
                        return (
                          <td key={i} className="border border-muted px-1 py-1">
                            {col.costing_loading ? (
                              <span className="text-xs text-muted-foreground">Searching…</span>
                            ) : total === 0 ? (
                              <span className="text-xs text-muted-foreground">No results</span>
                            ) : total === 1 ? (
                              <span className="text-xs text-muted-foreground">1 / 1</span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  className="px-1.5 py-0.5 rounded border text-xs hover:bg-muted disabled:opacity-30"
                                  disabled={idx === 0}
                                  onClick={() => setResultIdx(prev => { const a = [...prev]; a[i] = Math.max(0, a[i] - 1); return a; })}
                                >‹</button>
                                <span className="text-xs font-medium tabular-nums">{idx + 1} / {total}</span>
                                <button
                                  className="px-1.5 py-0.5 rounded border text-xs hover:bg-muted disabled:opacity-30"
                                  disabled={idx >= total - 1}
                                  onClick={() => setResultIdx(prev => { const a = [...prev]; a[i] = Math.min(total - 1, a[i] + 1); return a; })}
                                >›</button>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {FIELDS.map(([lbl, key], rowIdx) => {
                      const rn = rowIdx + 1;
                      const isBlue  = [19, 23, 36, 40].includes(rn);
                      const isGreen = [1, 4, 5, 6].includes(rn);
                      const TEXT_DIFF_KEYS = new Set(["dollar_rate","creation_date","created_by","cell_chemistry","centre_tap","cell_type","application","enclosure","mount","brand","installation","bms_pcm"]);
                      const colVals = cols.map((col, ci) => { const row = col.costing_rows[resultIdx[ci] ?? 0]; return row ? String((row as any)[key] ?? "") : ""; });
                      const isDiff = !isBlue && !isGreen && cols.length > 1 && TEXT_DIFF_KEYS.has(key) && new Set(colVals).size > 1;
                      const trCls = isBlue  ? "bg-blue-100 dark:bg-blue-900/40"
                                  : isGreen ? "bg-green-100 dark:bg-green-900/40"
                                  : isDiff  ? "bg-yellow-50 dark:bg-yellow-900/20"
                                  : "";
                      const labelCls = isBlue  ? labelTd + " bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-bold"
                                     : isGreen ? labelTd + " bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-200"
                                     : isDiff  ? labelTd + " bg-yellow-50 dark:bg-yellow-900/20"
                                     : labelTd;
                      const cellCls = isBlue  ? outTd + " text-blue-800 dark:text-blue-200 font-bold"
                                    : isGreen ? outTd + " text-green-900 dark:text-green-200"
                                    : outTd;
                      return (
                      <tr key={key} className={trCls}>
                        <td className={labelCls}>{lbl}</td>
                        {cols.map((col, ci) => {
                          const row = col.costing_rows[resultIdx[ci] ?? 0];
                          const val = row ? String((row as any)[key] ?? "—") : "—";
                          const cellDiff = isDiff && cols.length > 1 && colVals[ci] !== colVals[0];
                          return <td key={ci} className={cellCls + (cellDiff ? " bg-yellow-200 dark:bg-yellow-700/50" : "")}>{val}</td>;
                        })}
                      </tr>
                      );
                    })}
                  </>
                );
              })()}
            </>}
          </tbody>
        </table>
      </div>

      {/* ── Dialog 1: Quote format (first sizing checked) ── */}
      <Dialog open={quoteDialog === "format"} onOpenChange={open => { if (!open) { setQuoteDialog(null); setPendingCol(null); setSelectedCols(prev => { const a = [...prev]; if (pendingCol !== null) a[pendingCol] = false; return a; }); } }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Quote</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Quote Code</Label>
              <Input className="h-8" value={qCode} onChange={e => setQCode(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Date</Label>
              <Input className="h-8" type="date" value={qDate} onChange={e => setQDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Customer Name</Label>
              <Input className="h-8" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Solution Provider</Label>
              <Input className="h-8" value={solutionProvider} onChange={e => setSolutionProvider(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Sales Person</Label>
              <Input className="h-8" value={qSalesPerson} onChange={e => setQSalesPerson(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Quote Format</Label>
              <select className="h-8 w-full rounded border px-2 text-sm bg-background"
                value={qFormat} onChange={e => setQFormat(e.target.value)}>
                {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setQuoteDialog(null); setPendingCol(null); setSelectedCols(prev => { const a = [...prev]; if (pendingCol !== null) a[pendingCol] = false; return a; }); }}>Cancel</Button>
            <Button onClick={handleCreateQuote}>Next →</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog 2: Margin & Quantity ── */}
      <Dialog open={quoteDialog === "margin"} onOpenChange={open => { if (!open) { setQuoteDialog(null); setPendingCol(null); setSelectedCols(prev => { const a = [...prev]; if (pendingCol !== null) a[pendingCol] = false; return a; }); } }}>
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Sizing {pendingCol !== null ? pendingCol + 1 : ""} to Quote</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Price Option</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {PRICE_OPTIONS.map(opt => (
                  <button key={opt}
                    className={cn("rounded border px-2 py-1 text-xs font-medium transition-colors",
                      priceOption === opt ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}
                    onClick={() => setPriceOption(opt)}>
                    {_PRICE_LABELS[opt] ?? opt}
                  </button>
                ))}
              </div>
              {(priceOption === "custom" || priceOption === "custom_a") && (
                <div className="flex items-center gap-2 mt-1">
                  <Label className="text-xs whitespace-nowrap">{priceOption === "custom_a" ? "A +" : "B ±"}</Label>
                  <Input className="h-7 w-20" type="number" value={customPct} onChange={e => setCustomPct(e.target.value)} />
                  <span className="text-xs">%</span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Quantity</Label>
              <Input className="h-8 w-24" type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setQuoteDialog(null); setPendingCol(null); setSelectedCols(prev => { const a = [...prev]; if (pendingCol !== null) a[pendingCol] = false; return a; }); }}>Cancel</Button>
            <Button onClick={handleAddToQuote}>Add to Quote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{editingGroupId ? "Edit Group" : "New Group"}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label>Group Name</Label>
              <Input value={groupNameInput} onChange={e => setGroupNameInput(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Sizings ({groupColSelection.size}/{MAX_GROUP_SIZE})</Label>
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto border rounded-md p-2">
                {cols.map((_, i) => {
                  const owner = getColGroup(i);
                  const disabled = !!owner && owner.id !== editingGroupId;
                  return (
                    <label key={i} className={cn("flex items-center gap-2 text-sm px-1 py-0.5 rounded", disabled ? "opacity-40" : "cursor-pointer hover:bg-muted")}>
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={groupColSelection.has(i)}
                        onChange={() => toggleGroupCol(i)}
                      />
                      Sizing {i + 1}
                      {disabled && <span className="text-xs text-muted-foreground">(in {owner!.name})</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editingGroupId && (
              <Button variant="destructive" onClick={() => { handleDeleteGroup(editingGroupId); setGroupDialogOpen(false); }}>
                Delete Group
              </Button>
            )}
            <Button variant="ghost" onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveGroup}>{editingGroupId ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export as Project: metadata form ── */}
      <Dialog open={projectStep === "form"} onOpenChange={open => { if (!open) setProjectStep(null); }}>
        <DialogContent className="sm:max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Export as Project</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-col gap-1">
              <Label>Quote Code</Label>
              <Input value={pQuoteCode} onChange={e => setPQuoteCode(e.target.value)} placeholder="optional" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Customer Name</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Solution Provider</Label>
              <Input value={solutionProvider} onChange={e => setSolutionProvider(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Sales Person</Label>
              <Input value={pSalesPerson} onChange={e => setPSalesPerson(e.target.value)} placeholder="optional" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Dollar Rate</Label>
              <Input value={pDollarRate} onChange={e => setPDollarRate(e.target.value)} placeholder="optional" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Warranty (years)</Label>
              <Input type="number" value={pWarrantyYears} onChange={e => setPWarrantyYears(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProjectStep(null)}>Cancel</Button>
            <Button onClick={() => setProjectStep("preview")}>Next: Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Export as Project: preview ── */}
      <Dialog open={projectStep === "preview"} onOpenChange={open => { if (!open) setProjectStep(null); }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Preview — {effectiveGroups.length} sheet(s)</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-6 py-2">
            {effectiveGroups.map(g => {
              const rows: [string, keyof ProjectColData][] = [
                ["Nominal DC Voltage (V)", "nominal_dc_voltage"],
                ["Backup Requirement (Min)", "backup_requirement_min"],
                ["Chemistry", "cell_chemistry"],
                ["Centre Tap / Wire", "centre_tap"],
                ["Cell Type", "cell_type"],
                ["UPS Rating (KVA)", "ups_rating_kva"],
                ["Power Factor", "power_factor"],
                ["Inverter Efficiency", "inverter_efficiency"],
                ["End Cell Voltage (V)", "end_cell_voltage"],
                ["Max Charging Voltage (V)", "max_charging_voltage"],
                ["Calculated Load (kW)", "calculated_load_kw"],
                ["Energy Required (kWh)", "energy_required_kwh"],
                ["Capacity Required (AH)", "capacity_required_ah"],
                ["Nearest Available Capacity (AH)", "nearest_capacity_ah"],
                ["Total Available Energy (kWh)", "total_available_energy_kwh"],
                ["Backup Time (Min) at BOL", "backup_time_min"],
                ["Configuration", "offered_battery_config"],
                ["Price with Cabinet & BMS", "cost"],
                ["Modular Battery Rack", "modular_rack_price"],
              ];
              const groupCols = g.colIndices.map(buildProjectCol);
              return (
                <div key={g.name} className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-semibold">{g.name} ({groupCols.length}/{MAX_GROUP_SIZE})</h3>
                  <div className="overflow-x-auto border rounded-md">
                    <table className="text-xs w-full">
                      <tbody>
                        {rows.map(([label, key]) => (
                          <tr key={key} className="border-b last:border-0">
                            <td className="px-2 py-1 font-medium text-muted-foreground whitespace-nowrap bg-muted/30 sticky left-0">
                              {label}
                            </td>
                            {groupCols.map((c, i) => (
                              <td key={i} className="px-2 py-1 text-center whitespace-nowrap">
                                {key === "centre_tap"
                                  ? (CENTRE_TAP_TO_WIRE[c.centre_tap] || c.centre_tap || "-")
                                  : (c[key] || "-")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setProjectStep("form")}>Back</Button>
            <Button onClick={handleConfirmProjectExport}>Export</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PendingLinkDialog
        open={pendingLinkOpen}
        exportLabel={
          pendingExportData.export_type === "project_export"
            ? `Wizard Project Export: ${projectName} (${pendingExportDataList?.length ?? 0} sizings)`
            : `Wizard Sizing: ${projectName} (${pendingExportData.export_type === "sizing_pdf" ? "PDF" : "Excel"})`
        }
        exportData={pendingExportData}
        exportDataList={pendingExportDataList}
        onClose={() => { setPendingLinkOpen(false); setPendingExportDataList(undefined); }}
        onDone={() => { pendingExportFn?.(); setPendingLinkOpen(false); setPendingExportDataList(undefined); }}
      />
    </div>
  );
}
