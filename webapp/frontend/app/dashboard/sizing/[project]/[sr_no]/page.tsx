"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api , apiErr } from "@/lib/api";
import { runCalculation } from "@/lib/sizingEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const DC_VOLTAGES_FALLBACK = [12, 24, 36, 48, 72, 96, 120, 144, 192, 240, 336, 360, 384, 408, 480, 512, 528, 576];
const CHEMISTRIES = ["LFP"];
const QUOTE_FORMATS = ["High voltage","Low voltage","Extended Warranty High Voltage","Extended Warranty Low Voltage","Low & High Voltage Export"];
const EXTENDED_FORMATS = new Set(["Extended Warranty High Voltage","Extended Warranty Low Voltage"]);
const _B = 1.10;
const PRICE_OPTIONS = [
  { label: "A (Cost)",   value: "A",    mult: 1.0 },
  { label: "A+5%",       value: "A+5",  mult: 1.05 },
  { label: "A+10% (B)",  value: "B",    mult: _B },
  { label: "B-15%",      value: "B-15", mult: _B * 0.85 },
  { label: "B-10%",      value: "B-10", mult: _B * 0.90 },
  { label: "B-5%",       value: "B-5",  mult: _B * 0.95 },
  { label: "B+5%",       value: "B+5",  mult: _B * 1.05 },
  { label: "B+10%",      value: "B+10", mult: _B * 1.10 },
  { label: "B+15%",      value: "B+15", mult: _B * 1.15 },
  { label: "B+20%",      value: "B+20", mult: _B * 1.20 },
];

interface CostingResult {
  battery_pack: string; duration: string;
  total_cost: string | number; partcode: string;
  cell_type: string; centre_tap: string; kw_calculation: string | number;
}
interface SelectedCosting {
  partcode: string; total_cost: number; battery_pack: string;
  duration: string; cell_type: string; centre_tap: string; kw_calculation: number;
}

interface FormState {
  customer_name: string;
  solution_provider: string;
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
  // outputs (editable)
  calculated_load_kw: string;
  number_of_cells: string;
  max_charging_voltage: string;
  end_cell_voltage: string;
  energy_required_kwh: string;
  capacity_required_ah: string;
  // inputs (mid-section, template order)
  ageing_percent: string;
  design_margin_percent: string;
  dod_margin_percent: string;
  derating_factor_percent: string;
  // outputs (lower)
  cap_with_ageing_ah: string;
  cap_with_design_margin_ah: string;
  cap_with_dod_margin_ah: string;
  cap_with_derating_factor_ah: string;
  nearest_capacity_ah: string;
  offered_battery_config: string;
  total_available_energy_kwh: string;
  backup_time_min: string;
}

const EMPTY_FORM: FormState = {
  customer_name: "", solution_provider: "",
  ups_make: "", ups_model: "",
  ups_rating_kva: "", actual_load_kva: "", actual_load_kw: "",
  power_factor: "", inverter_efficiency: "",
  nominal_dc_voltage: "", backup_requirement_min: "",
  cell_chemistry: "LFP", ageing_type: "BOL",
  calculated_load_kw: "", number_of_cells: "",
  max_charging_voltage: "", end_cell_voltage: "",
  energy_required_kwh: "", capacity_required_ah: "",
  ageing_percent: "", design_margin_percent: "",
  dod_margin_percent: "", derating_factor_percent: "",
  cap_with_ageing_ah: "", cap_with_design_margin_ah: "",
  cap_with_dod_margin_ah: "", cap_with_derating_factor_ah: "",
  nearest_capacity_ah: "",
  offered_battery_config: "", total_available_energy_kwh: "", backup_time_min: "",
};

const INPUT_TRIGGER_KEYS: (keyof FormState)[] = [
  "actual_load_kw", "actual_load_kva", "ups_rating_kva", "power_factor",
  "inverter_efficiency", "nominal_dc_voltage", "backup_requirement_min",
  "ageing_percent", "design_margin_percent", "dod_margin_percent",
  "derating_factor_percent", "cell_chemistry", "nearest_capacity_ah",
];

const CELL_V_MAP: Record<string, { max: number; end: number }> = {
  LFP: { max: 3.6, end: 2.8 },
  NPM: { max: 4.2, end: 3.0 },
};

function recalcDownstream(field: keyof FormState, s: FormState): FormState {
  const r1 = (v: number) => String(Math.round(v * 10) / 10);
  const num = (k: keyof FormState) => parseFloat(s[k] as string) || 0;

  // Raw intermediates — initialised from current form; overwritten by cascade
  // so that each step uses full-precision input from the previous step,
  // matching old-app behaviour (display rounds, computation does not).
  let rawEndV   = num("end_cell_voltage");
  let rawEnergy = num("energy_required_kwh");
  let rawCapBase = num("capacity_required_ah");
  let rawCapAge  = num("cap_with_ageing_ah");
  let rawCapDm   = num("cap_with_design_margin_ah");
  let rawCapDod  = num("cap_with_dod_margin_ah");
  let rawCapDer  = num("cap_with_derating_factor_ah");

  let doCapacity = false, doAgeing = false, doDm = false, doDod = false, doDerating = false, doBackup = false;

  if (field === "number_of_cells") {
    const cells = num("number_of_cells");
    const chem = CELL_V_MAP[s.cell_chemistry] ?? CELL_V_MAP.LFP;
    rawEndV = cells * chem.end;
    s = { ...s, max_charging_voltage: r1(cells * chem.max), end_cell_voltage: r1(rawEndV) };
    doCapacity = true;
  } else if (field === "calculated_load_kw") {
    rawEnergy = (num("calculated_load_kw") * num("backup_requirement_min")) / 60;
    s = { ...s, energy_required_kwh: r1(rawEnergy) };
    doCapacity = true;
  } else if (field === "energy_required_kwh" || field === "end_cell_voltage") {
    // rawEnergy / rawEndV already initialised from s (which holds the user's typed value)
    doCapacity = true;
  } else if (field === "capacity_required_ah") {
    doAgeing = true;
  } else if (field === "cap_with_ageing_ah") {
    doDm = true;
  } else if (field === "cap_with_design_margin_ah") {
    doDod = true;
  } else if (field === "cap_with_dod_margin_ah") {
    doDerating = true;
  } else if (field === "cap_with_derating_factor_ah") {
    doBackup = true;
  }

  if (doCapacity) {
    if (rawEndV > 0) {
      rawCapBase = (rawEnergy * 1000) / rawEndV;
      s = { ...s, capacity_required_ah: r1(rawCapBase) };
    }
    doAgeing = true;
  }

  if (doAgeing) {
    rawCapAge = rawCapBase * (1 + num("ageing_percent") / 100);
    s = { ...s, cap_with_ageing_ah: r1(rawCapAge) };
    doDm = true;
  }

  if (doDm) {
    rawCapDm = rawCapAge * (1 + num("design_margin_percent") / 100);
    s = { ...s, cap_with_design_margin_ah: r1(rawCapDm) };
    doDod = true;
  }

  if (doDod) {
    const dod = num("dod_margin_percent");
    rawCapDod = dod > 0 ? rawCapDm / (dod / 100) : rawCapDm;
    s = { ...s, cap_with_dod_margin_ah: r1(rawCapDod) };
    doDerating = true;
  }

  if (doDerating) {
    rawCapDer = rawCapDod * (1 + num("derating_factor_percent") / 100);
    s = { ...s, cap_with_derating_factor_ah: r1(rawCapDer) };
    doBackup = true;
  }

  if (doBackup) {
    const nearest = num("nearest_capacity_ah");
    const backupMin = num("backup_requirement_min");
    if (rawCapDer > 0 && nearest > 0) {
      s = { ...s, backup_time_min: String(Math.floor((backupMin / rawCapDer) * nearest)) };
    }
  }

  return s;
}

function n(v: string) { return parseFloat(v) || 0; }
function s(v: number | string | undefined | null) { return v === undefined || v === null ? "" : String(v); }
function sNum(v: number | string | undefined | null) { return (!v && v !== 0) || v === 0 ? "" : String(v); }

export default function SizingFormPage() {
  const params = useParams();
  const projectName = decodeURIComponent(params.project as string);
  const srNo = parseInt(params.sr_no as string, 10);
  const router = useRouter();
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const prevInputSig = useRef("");
  const isDirty = useRef(false);
  const isAutoSave = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "required">("idle");

  const { data: existing, isLoading } = useQuery({
    queryKey: ["sizing", projectName, srNo],
    queryFn: () =>
      api.get(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${srNo}`).then((r) => r.data),
    retry: false,
  });

  const { data: dcCellsData } = useQuery({
    queryKey: ["dc-cells"],
    queryFn: () => api.get("/api/formulas/dc-cells").then((r) => r.data as { dc_voltage: number; num_cells: number }[]),
    staleTime: 5 * 60 * 1000,
  });

  const { data: cellVoltagesData } = useQuery({
    queryKey: ["cell-voltages"],
    queryFn: () => api.get("/api/formulas/cell-voltages").then((r) => r.data as { chemistry: string; nominal: number; max_v: number; end_v: number }[]),
    staleTime: 5 * 60 * 1000,
  });

  const dcMap: Record<number, number> = useMemo(
    () => dcCellsData ? Object.fromEntries(dcCellsData.map((r) => [r.dc_voltage, r.num_cells])) : {},
    [dcCellsData]
  );

  const cellVMap = useMemo(
    () => cellVoltagesData ? Object.fromEntries(cellVoltagesData.map((r) => [r.chemistry, { nominal: r.nominal, max: r.max_v, end: r.end_v }])) : {},
    [cellVoltagesData]
  );

  const dcVoltages = useMemo(
    () => dcCellsData ? dcCellsData.map((r) => r.dc_voltage).sort((a, b) => a - b) : DC_VOLTAGES_FALLBACK,
    [dcCellsData]
  );

  useEffect(() => {
    if (!existing) return;
    isDirty.current = false;
    setForm({
      customer_name: existing.customer_name ?? "",
      solution_provider: existing.solution_provider ?? "",
      ups_make: existing.ups_make ?? "",
      ups_model: existing.ups_model ?? "",
      ups_rating_kva: sNum(existing.ups_rating_kva),
      actual_load_kva: sNum(existing.actual_load_kva),
      actual_load_kw: sNum(existing.actual_load_kw),
      power_factor: sNum(existing.power_factor),
      inverter_efficiency: sNum(existing.inverter_efficiency ? existing.inverter_efficiency * 100 : ""),
      nominal_dc_voltage: sNum(existing.nominal_dc_voltage),
      backup_requirement_min: sNum(existing.backup_requirement_min),
      cell_chemistry: existing.cell_chemistry ?? "LFP",
      ageing_type: existing.ageing_type ?? "BOL",
      calculated_load_kw: sNum(existing.calculated_load_kw),
      number_of_cells: sNum(existing.number_of_cells),
      max_charging_voltage: sNum(existing.max_charging_voltage),
      end_cell_voltage: sNum(existing.end_cell_voltage),
      energy_required_kwh: sNum(existing.energy_required_kwh),
      capacity_required_ah: sNum(existing.capacity_required_ah),
      ageing_percent: sNum(existing.ageing_percent),
      design_margin_percent: sNum(existing.design_margin_percent),
      dod_margin_percent: sNum(existing.dod_margin_percent),
      derating_factor_percent: sNum(existing.derating_factor_percent),
      cap_with_ageing_ah: sNum(existing.cap_with_ageing_ah),
      cap_with_design_margin_ah: sNum(existing.cap_with_design_margin_ah),
      cap_with_dod_margin_ah: sNum(existing.cap_with_dod_margin_ah),
      cap_with_derating_factor_ah: sNum(existing.cap_with_derating_factor_ah),
      nearest_capacity_ah: sNum(existing.nearest_capacity_ah),
      offered_battery_config: existing.offered_battery_config ?? "",
      total_available_energy_kwh: sNum(existing.total_available_energy_kwh),
      backup_time_min: sNum(existing.backup_time_min),
    });
  }, [existing]);

  const applyCalc = useCallback((f: FormState): FormState => {
    const o = runCalculation({
      actualKw: n(f.actual_load_kw),
      actualKva: n(f.actual_load_kva),
      upsKva: n(f.ups_rating_kva),
      powerFactor: n(f.power_factor),
      inverterEfficiency: (n(f.inverter_efficiency) / 100) || 1,
      nominalDcVoltage: n(f.nominal_dc_voltage),
      backupRequirementMin: n(f.backup_requirement_min),
      ageingPct: n(f.ageing_percent),
      designMarginPct: n(f.design_margin_percent),
      dodMarginPct: n(f.dod_margin_percent),
      deratingPct: n(f.derating_factor_percent),
      cellChemistry: f.cell_chemistry,
      nearestCapacity: n(f.nearest_capacity_ah),
    }, Object.keys(dcMap).length ? dcMap : undefined, Object.keys(cellVMap).length ? cellVMap : undefined);
    return {
      ...f,
      calculated_load_kw: s(o.calculatedLoadKw),
      number_of_cells: s(o.numberOfCells),
      max_charging_voltage: s(o.maxChargingVoltage),
      end_cell_voltage: s(o.endCellVoltage),
      energy_required_kwh: s(o.energyRequiredKwh),
      capacity_required_ah: s(o.capacityRequiredAh),
      cap_with_ageing_ah: s(o.capWithAgeingAh),
      cap_with_design_margin_ah: s(o.capWithDesignMarginAh),
      cap_with_dod_margin_ah: s(o.capWithDodAh),
      cap_with_derating_factor_ah: s(o.capWithDeratingAh),
      offered_battery_config: o.offeredBatteryConfig || f.offered_battery_config,
      total_available_energy_kwh: s(o.totalAvailableEnergyKwh),
      backup_time_min: s(o.backupTimeMin),
    };
  }, [dcMap, cellVMap]);

  useEffect(() => {
    const sig = INPUT_TRIGGER_KEYS.map((k) => form[k]).join("|");
    if (sig === prevInputSig.current) return;
    prevInputSig.current = sig;
    setForm((f) => applyCalc(f));
  }, [form, applyCalc]);

  useEffect(() => {
    if (!isDirty.current) return;
    if (!form.customer_name.trim() || !form.solution_provider.trim()) {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      setAutoSaveStatus("required");
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("saving");
    autoSaveTimer.current = setTimeout(() => {
      isAutoSave.current = true;
      saveMut.mutate();
    }, 1000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      isDirty.current = true;
      setForm((f) => ({ ...f, [k]: e.target.value }));
    };

  const setOutput = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      isDirty.current = true;
      const val = e.target.value;
      setForm((f) => recalcDownstream(k, { ...f, [k]: val }));
    };

  const saveMut = useMutation({
    mutationFn: () =>
      api.put(
        `/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${srNo}`,
        {
          customer_name: form.customer_name,
          solution_provider: form.solution_provider,
          ups_make: form.ups_make,
          ups_model: form.ups_model,
          ups_rating_kva: n(form.ups_rating_kva),
          actual_load_kva: n(form.actual_load_kva),
          actual_load_kw: n(form.actual_load_kw),
          power_factor: n(form.power_factor),
          inverter_efficiency: n(form.inverter_efficiency) / 100,
          nominal_dc_voltage: n(form.nominal_dc_voltage),
          backup_requirement_min: n(form.backup_requirement_min),
          cell_chemistry: form.cell_chemistry,
          ageing_type: form.ageing_type,
          ageing_percent: n(form.ageing_percent),
          design_margin_percent: n(form.design_margin_percent),
          dod_margin_percent: n(form.dod_margin_percent),
          derating_factor_percent: n(form.derating_factor_percent),
          nearest_capacity_ah: n(form.nearest_capacity_ah),
          number_of_cells: n(form.number_of_cells),
          calculated_load_kw: n(form.calculated_load_kw),
          max_charging_voltage: n(form.max_charging_voltage),
          end_cell_voltage: n(form.end_cell_voltage),
          energy_required_kwh: n(form.energy_required_kwh),
          capacity_required_ah: n(form.capacity_required_ah),
          cap_with_ageing_ah: n(form.cap_with_ageing_ah),
          cap_with_design_margin_ah: n(form.cap_with_design_margin_ah),
          cap_with_dod_margin_ah: n(form.cap_with_dod_margin_ah),
          cap_with_derating_factor_ah: n(form.cap_with_derating_factor_ah),
          offered_battery_config: form.offered_battery_config,
          total_available_energy_kwh: n(form.total_available_energy_kwh),
          backup_time_min: n(form.backup_time_min),
        }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sizings", projectName] });
      qc.invalidateQueries({ queryKey: ["sizing", projectName, srNo] });
      if (isAutoSave.current) {
        isAutoSave.current = false;
        setAutoSaveStatus("saved");
        setTimeout(() => setAutoSaveStatus("idle"), 2000);
      } else {
        toast.success("Saved");
        setAutoSaveStatus("idle");
      }
    },
    onError: (e: any) => {
      isAutoSave.current = false;
      setAutoSaveStatus("idle");
      toast.error(apiErr(e, "Save failed"));
    },
  });

  // costing selection (set when returning from costing screen)
  const [selectedCosting, setSelectedCosting] = useState<SelectedCosting | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [ahRangeOpen, setAhRangeOpen] = useState(false);
  const [ahRangeInput, setAhRangeInput] = useState("");

  // pick up selection stored by the costing screen on return
  useEffect(() => {
    const stored = localStorage.getItem("sizing_selected_costing");
    if (stored) {
      try { setSelectedCosting(JSON.parse(stored)); } catch {}
      localStorage.removeItem("sizing_selected_costing");
    }
  }, []);
  // add to quote
  const [addToQuoteOpen, setAddToQuoteOpen] = useState(false);
  const [quoteMode, setQuoteMode] = useState<"new" | "existing">("new");
  const [nqCode, setNqCode] = useState("");
  const [nqDate, setNqDate] = useState("");
  const [nqCustomer, setNqCustomer] = useState("");
  const [nqProvider, setNqProvider] = useState("");
  const [nqSalesPerson, setNqSalesPerson] = useState("");
  const [nqFormat, setNqFormat] = useState(QUOTE_FORMATS[0]);
  const [addingToQuote, setAddingToQuote] = useState(false);
  const [selectedQuoteCode, setSelectedQuoteCode] = useState<string | null>(null);
  const [nqPriceOption, setNqPriceOption] = useState("B");
  const [nqCustomPct, setNqCustomPct] = useState("30");
  const [nqQuantity, setNqQuantity] = useState("1");
  const [nqWarranty, setNqWarranty] = useState("5");
  const [nqDollarRate, setNqDollarRate] = useState("");

  const { data: existingQuotes = [] } = useQuery<{code:string;date:string;customer_name:string}[]>({
    queryKey: ["quotes"],
    queryFn: () => api.get("/api/quotation/quotes").then((r) => r.data),
    enabled: addToQuoteOpen && quoteMode === "existing",
  });
  const { data: nextQCode } = useQuery<{code:string}>({
    queryKey: ["next-quote-code"],
    queryFn: () => api.get("/api/quotation/next-code").then((r) => r.data),
    enabled: addToQuoteOpen && quoteMode === "new",
  });
  useEffect(() => {
    if (nextQCode?.code && !nqCode) setNqCode(nextQCode.code);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextQCode]);

  const handlePreviewCosting = () => {
    if (!form.offered_battery_config) return;
    setAhRangeInput("");
    setAhRangeOpen(true);
  };

  const handlePreviewWithRange = async () => {
    const rangeAh = parseFloat(ahRangeInput) || 0;
    setAhRangeOpen(false);
    setPreviewLoading(true);
    try {
      const currentTree = await api.get("/api/costing/tree");
      localStorage.setItem("costing_preview_backup", JSON.stringify(currentTree.data));
      const res = await api.post("/api/costing/preview-range", {
        battery_config: form.offered_battery_config,
        backup_minutes: n(form.backup_requirement_min),
        range_ah: rangeAh,
      });
      if (res.data.loaded === 0) {
        toast.warning(`No costing data found for "${form.offered_battery_config}" (±${rangeAh}Ah)`);
        setPreviewLoading(false);
        return;
      }
      const backUrl = `/dashboard/sizing/${encodeURIComponent(projectName)}/${srNo}`;
      router.push(`/dashboard/costing?from=sizing&back=${encodeURIComponent(backUrl)}`);
    } catch (e: any) {
      toast.error(apiErr(e, "Failed to load costing preview"));
      setPreviewLoading(false);
    }
  };

  const handleOpenAddToQuote = () => {
    setNqCode("");
    setNqDate(new Date().toLocaleDateString("en-GB"));
    setNqCustomer(form.customer_name);
    setNqProvider(form.solution_provider);
    setNqSalesPerson("");
    setNqFormat(QUOTE_FORMATS[0]);
    setSelectedQuoteCode(null);
    setQuoteMode("new");
    setNqPriceOption("B");
    setNqCustomPct("30");
    setNqQuantity("1");
    setNqWarranty("5");
    setNqDollarRate("");
    setAddToQuoteOpen(true);
  };

  const handleAddToQuote = async () => {
    if (!selectedCosting) return;
    setAddingToQuote(true);
    try {
      let code: string;
      if (quoteMode === "new") {
        await api.post("/api/quotation/quotes", {
          code: nqCode, date: nqDate, customer_name: nqCustomer,
          solution_provider: nqProvider, sales_person: nqSalesPerson,
          format_name: nqFormat,
          dollar_rate: nqDollarRate,
          warranty_years: parseInt(nqWarranty) || 5,
        });
        code = nqCode;
      } else {
        if (!selectedQuoteCode) return;
        code = selectedQuoteCode;
      }
      await api.post(`/api/quotation/quotes/${encodeURIComponent(code)}/add-from-sizing-screen`, {
        battery_config: selectedCosting.battery_pack,
        duration: selectedCosting.duration,
        kw_calculation: selectedCosting.kw_calculation,
        cell_type: selectedCosting.cell_type,
        centre_tap: selectedCosting.centre_tap,
        partcode: selectedCosting.partcode,
        total_cost: selectedCosting.total_cost,
        price_option: nqPriceOption,
        custom_pct: (nqPriceOption === "custom" || nqPriceOption === "custom_a") ? parseFloat(nqCustomPct) || 0 : 0,
        quantity: parseInt(nqQuantity) || 1,
        actual_load_kva: parseFloat(form.actual_load_kva) || 0,
        actual_load_kw: parseFloat(form.actual_load_kw) || 0,
        ups_rating_kva: parseFloat(form.ups_rating_kva) || 0,
        calculated_load_kw: parseFloat(form.calculated_load_kw) || 0,
        ageing_type: form.ageing_type || "BOL",
        backup_time_min: form.backup_time_min || form.backup_requirement_min,
        sizing_project: projectName,
        sizing_sr_no: srNo,
      });
setAddToQuoteOpen(false);
      toast.success("Added to quote");
      router.push(`/dashboard/quote/${encodeURIComponent(code)}`);
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      const msg = detail
        ? (typeof detail === "string" ? detail : JSON.stringify(detail))
        : (e?.message ?? "network error");
      console.error("addToQuote error", e?.response?.data, e);
      toast.error(`${status ? `[${status}] ` : ""}${msg}`);
    } finally {
      setAddingToQuote(false);
    }
  };

  if (isLoading)
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>;

  return (
    <div className="flex flex-col h-full p-5 gap-4 overflow-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => router.push(`/dashboard/sizing/${encodeURIComponent(projectName)}`)}>
          ← Back
        </Button>
        <h1 className="text-2xl font-bold">{projectName} — Sr. {srNo}</h1>
        {autoSaveStatus === "saving" && <span className="text-xs text-muted-foreground">Saving…</span>}
        {autoSaveStatus === "saved" && <span className="text-xs text-green-600">Saved</span>}
        {autoSaveStatus === "required" && <span className="text-xs text-amber-500">Customer Name &amp; Solution Provider are required</span>}
        <Button
          onClick={() => {
            if (!form.customer_name.trim() || !form.solution_provider.trim()) {
              setAutoSaveStatus("required");
              return;
            }
            isDirty.current = true;
            saveMut.mutate();
          }}
          disabled={saveMut.isPending}
        >Save</Button>
      </div>

      <div className="grid grid-cols-2 gap-6">

        {/* ── LEFT: Header + Given Technical Info (rows 4-8) ── */}
        <div className="flex flex-col gap-3 border rounded-md p-4">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Customer Info</h2>
          <Row label="Customer Name *">
            <Input
              value={form.customer_name}
              onChange={set("customer_name")}
              className={!form.customer_name.trim() ? "border-red-400 focus-visible:ring-red-400" : ""}
            />
          </Row>
          <Row label="Solution Provider *">
            <Input
              value={form.solution_provider}
              onChange={set("solution_provider")}
              className={!form.solution_provider.trim() ? "border-red-400 focus-visible:ring-red-400" : ""}
            />
          </Row>

          <div className="border-t my-1" />
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Given Technical Information</h2>

          <Row label="UPS Make">
            <Input value={form.ups_make} onChange={set("ups_make")} />
          </Row>
          <Row label="UPS Model">
            <Input value={form.ups_model} onChange={set("ups_model")} />
          </Row>
          <Row label="UPS Rating (KVA)">
            <Input type="number" value={form.ups_rating_kva} onChange={set("ups_rating_kva")} />
          </Row>
          <Row label="Actual Load (KVA)">
            <Input type="number" value={form.actual_load_kva} onChange={set("actual_load_kva")} />
          </Row>
          <Row label="Actual Load (kW)">
            <Input type="number" value={form.actual_load_kw} onChange={set("actual_load_kw")} />
          </Row>
          <Row label="Power Factor">
            <Input type="number" step="0.01" value={form.power_factor} onChange={set("power_factor")} />
          </Row>
          <Row label="Inverter Efficiency (%)">
            <Input type="number" step="1" min={0} max={100} value={form.inverter_efficiency} onChange={set("inverter_efficiency")} />
          </Row>
          <Row label="Nominal DC Voltage (V)">
            <select
              className="w-full h-9 rounded-md border px-3 text-sm bg-background"
              value={form.nominal_dc_voltage}
              onChange={set("nominal_dc_voltage")}
            >
              {dcVoltages.map((v) => <option key={v} value={v}>{v}V</option>)}
            </select>
          </Row>
          <Row label="Backup Requirement (Min)">
            <Input type="number" value={form.backup_requirement_min} onChange={set("backup_requirement_min")} />
          </Row>
        </div>

        {/* ── RIGHT: Solution (rows 11-30, template order) ── */}
        <div className="flex flex-col gap-3 border rounded-md p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Solution</h2>
            <Button size="sm" variant="outline" onClick={() => { setForm((f) => applyCalc(f)); toast.success("Recalculated"); }}>
              Recalculate
            </Button>
          </div>

          {/* E11 */}
          <Row label="Cell Chemistry">
            <select className="w-full h-9 rounded-md border px-3 text-sm bg-background" value={form.cell_chemistry} onChange={set("cell_chemistry")}>
              {CHEMISTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Row>

          <Row label="Ageing Type">
            <div className="flex gap-4">
              {["BOL", "EOL"].map((t) => (
                <label key={t} className="flex items-center gap-1 cursor-pointer text-sm">
                  <input type="radio" name="ageing_type" value={t}
                    checked={form.ageing_type === t}
                    onChange={() => { isDirty.current = true; setForm((f) => ({ ...f, ageing_type: t })); }} />
                  {t}
                </label>
              ))}
            </div>
          </Row>

          {/* E12 */}
          <OutRow label="Calculated Load (kW)">
            <Input type="number" value={form.calculated_load_kw} onChange={setOutput("calculated_load_kw")} />
          </OutRow>

          {/* derived */}
          <OutRow label="Number of Cells">
            <Input type="number" value={form.number_of_cells} onChange={setOutput("number_of_cells")} />
          </OutRow>

          {/* E13 */}
          <OutRow label="Max Charging Voltage (V)">
            <Input type="number" value={form.max_charging_voltage} onChange={setOutput("max_charging_voltage")} />
          </OutRow>

          {/* E14 */}
          <OutRow label="End Cell Voltage (V)">
            <Input type="number" value={form.end_cell_voltage} onChange={setOutput("end_cell_voltage")} />
          </OutRow>

          {/* E17 */}
          <OutRow label="Energy Required (kWh)">
            <Input type="number" value={form.energy_required_kwh} onChange={setOutput("energy_required_kwh")} />
          </OutRow>

          {/* E18 */}
          <OutRow label="Capacity Required (Ah)">
            <Input type="number" value={form.capacity_required_ah} onChange={setOutput("capacity_required_ah")} />
          </OutRow>

          {/* E19 */}
          <Row label="Ageing (%)">
            <Input type="number" value={form.ageing_percent} onChange={set("ageing_percent")} />
          </Row>

          {/* E23 */}
          <OutRow label="Cap req w/ Ageing (Ah)">
            <Input type="number" value={form.cap_with_ageing_ah} onChange={setOutput("cap_with_ageing_ah")} />
          </OutRow>

          {/* E20 */}
          <Row label="Design Margin (%)">
            <Input type="number" value={form.design_margin_percent} onChange={set("design_margin_percent")} />
          </Row>

          {/* E24 */}
          <OutRow label="Cap req w/ Design Margin (Ah)">
            <Input type="number" value={form.cap_with_design_margin_ah} onChange={setOutput("cap_with_design_margin_ah")} />
          </OutRow>

          {/* E21 */}
          <Row label="DOD Margin (%)">
            <Input type="number" value={form.dod_margin_percent} onChange={set("dod_margin_percent")} />
          </Row>

          {/* E25 */}
          <OutRow label="Cap req w/ DOD (Ah)">
            <Input type="number" value={form.cap_with_dod_margin_ah} onChange={setOutput("cap_with_dod_margin_ah")} />
          </OutRow>

          {/* E22 */}
          <Row label="Derating Factor (%)">
            <Input type="number" value={form.derating_factor_percent} onChange={set("derating_factor_percent")} />
          </Row>

          {/* E26 */}
          <OutRow label="Cap req w/ Derating (Ah)">
            <Input type="number" value={form.cap_with_derating_factor_ah} onChange={setOutput("cap_with_derating_factor_ah")} />
          </OutRow>

          {/* E27 */}
          <Row label="Nearest Available Capacity (Ah)">
            <Input type="number" value={form.nearest_capacity_ah} onChange={set("nearest_capacity_ah")} />
          </Row>

          <div className="border-t my-1" />

          {/* E28 */}
          <OutRow label="Offered Battery Configuration">
            <Input value={form.offered_battery_config} onChange={set("offered_battery_config")} />
          </OutRow>

          {form.offered_battery_config && (
            <div className="col-span-2 flex flex-col gap-2">
              <div className="flex justify-end">
                <Button size="sm" variant="secondary"
                  onClick={handlePreviewCosting} disabled={previewLoading}>
                  {previewLoading ? "Loading…" : "Select Costing"}
                </Button>
              </div>
              {selectedCosting && (
                <>
                  <div className="border rounded-md overflow-hidden text-sm">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-3 py-1.5 text-xs font-medium">Partcode</th>
                          <th className="text-right px-3 py-1.5 text-xs font-medium">Cost (A)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="px-3 py-1.5 font-mono text-xs">{selectedCosting.partcode || "—"}</td>
                          <td className="px-3 py-1.5 text-right">₹{Number(selectedCosting.total_cost).toLocaleString("en-IN")}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <Button size="sm" onClick={handleOpenAddToQuote}>Add to Quote</Button>
                </>
              )}
            </div>
          )}

          {/* E29 */}
          <OutRow label="Total Available Energy (kWh)">
            <Input type="number" value={form.total_available_energy_kwh} onChange={setOutput("total_available_energy_kwh")} />
          </OutRow>

          {/* E30 */}
          <OutRow label="Backup Time (Min)">
            <Input type="number" value={form.backup_time_min} onChange={setOutput("backup_time_min")} />
          </OutRow>
        </div>
      </div>

      {/* ── Ah Range Dialog ── */}
      <Dialog open={ahRangeOpen} onOpenChange={setAhRangeOpen}>
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nearest Cell Range (Ah)</DialogTitle></DialogHeader>
          <div className="py-2 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Enter Ah range to show neighbouring capacities alongside <strong>{form.offered_battery_config}</strong>.
              E.g. entering <strong>5</strong> shows ±5 Ah variants.
            </p>
            <Input type="number" min="0" placeholder="e.g. 5" value={ahRangeInput}
              onChange={(e) => setAhRangeInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePreviewWithRange()} autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAhRangeOpen(false)}>Cancel</Button>
            <Button onClick={handlePreviewWithRange}>Preview</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add to Quote Dialog ── */}
      <Dialog open={addToQuoteOpen} onOpenChange={setAddToQuoteOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add to Quote</DialogTitle></DialogHeader>
          <div className="py-2 flex flex-col gap-4">
            <div className="flex border rounded-md overflow-hidden text-sm">
              <button className={`flex-1 py-2 font-medium transition-colors ${quoteMode === "new" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setQuoteMode("new")}>New Quote</button>
              <button className={`flex-1 py-2 font-medium transition-colors ${quoteMode === "existing" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                onClick={() => setQuoteMode("existing")}>Existing Quote</button>
            </div>

            {quoteMode === "new" && (
              <div className="flex flex-col gap-3">
                <QRow label="Format">
                  <select className="h-9 rounded-md border px-3 text-sm bg-background w-full"
                    value={nqFormat} onChange={(e) => {
                      const fmt = e.target.value;
                      setNqFormat(fmt);
                      setNqWarranty(EXTENDED_FORMATS.has(fmt) ? "" : "5");
                    }}>
                    {QUOTE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </QRow>
                <QRow label="Code"><Input value={nqCode} onChange={(e) => setNqCode(e.target.value)} /></QRow>
                <QRow label="Date"><Input value={nqDate} onChange={(e) => setNqDate(e.target.value)} /></QRow>
                <QRow label="Customer"><Input value={nqCustomer} onChange={(e) => setNqCustomer(e.target.value)} /></QRow>
                <QRow label="Provider"><Input value={nqProvider} onChange={(e) => setNqProvider(e.target.value)} /></QRow>
                <QRow label="Sales Person"><Input value={nqSalesPerson} onChange={(e) => setNqSalesPerson(e.target.value)} /></QRow>
                <QRow label="Dollar Rate">
                  <input type="number" min="0" step="0.01" value={nqDollarRate}
                    onChange={(e) => setNqDollarRate(e.target.value)}
                    placeholder="e.g. 85"
                    className="h-8 w-28 rounded-md border px-2 text-sm bg-background" />
                </QRow>
                <QRow label="Warranty (yrs)">
                  <input type="number" min="1" value={nqWarranty}
                    onChange={(e) => setNqWarranty(e.target.value)}
                    placeholder={EXTENDED_FORMATS.has(nqFormat) ? "Enter years" : "5"}
                    className="h-8 w-24 rounded-md border px-2 text-sm bg-background" />
                </QRow>
                {EXTENDED_FORMATS.has(nqFormat) && nqWarranty && (
                  <p className="text-xs text-muted-foreground pl-[128px]">
                    Part code: {selectedCosting?.partcode}-{nqWarranty}W
                  </p>
                )}
              </div>
            )}

            {quoteMode === "existing" && (
              existingQuotes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No quotes yet.</p>
              ) : (
                <div className="border rounded-md overflow-auto max-h-48">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-1.5 text-xs">Code</th>
                        <th className="text-left px-3 py-1.5 text-xs">Customer</th>
                        <th className="text-left px-3 py-1.5 text-xs">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingQuotes.map((q) => (
                        <tr key={q.code}
                          className={`cursor-pointer hover:bg-accent border-t ${selectedQuoteCode === q.code ? "bg-primary/20" : ""}`}
                          onClick={() => setSelectedQuoteCode(q.code)}>
                          <td className="px-3 py-1.5 font-medium text-xs">{q.code}</td>
                          <td className="px-3 py-1.5 text-xs">{q.customer_name}</td>
                          <td className="px-3 py-1.5 text-xs">{q.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>

          {/* ── Price & Quantity ── */}
          <div className="border-t pt-4 flex flex-col gap-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Price & Quantity</p>
            <div className="grid grid-cols-3 gap-1.5">
              {PRICE_OPTIONS.map((opt) => (
                <button key={opt.value}
                  onClick={() => setNqPriceOption(opt.value)}
                  className={`text-xs rounded border px-2 py-1.5 transition-colors ${nqPriceOption === opt.value ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"}`}>
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => setNqPriceOption("custom")}
                className={`col-span-3 text-xs rounded border px-2 py-1.5 transition-colors ${nqPriceOption === "custom" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"}`}>
                Custom B±
              </button>
              <button
                onClick={() => setNqPriceOption("custom_a")}
                className={`col-span-3 text-xs rounded border px-2 py-1.5 transition-colors ${nqPriceOption === "custom_a" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"}`}>
                Custom A+
              </button>
            </div>
            {(nqPriceOption === "custom" || nqPriceOption === "custom_a") && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{nqPriceOption === "custom_a" ? "A +" : "B ±"}</span>
                <input type="number" step="0.5"
                  value={nqCustomPct}
                  onChange={(e) => setNqCustomPct(e.target.value)}
                  className="h-8 w-20 rounded-md border px-2 text-sm bg-background" />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            )}
            {selectedCosting && (
              <p className="text-xs text-muted-foreground">
                Price: ₹{(
                  Number(selectedCosting.total_cost) *
                  (nqPriceOption === "custom"
                    ? _B * (1 + (parseFloat(nqCustomPct) || 0) / 100)
                    : nqPriceOption === "custom_a"
                    ? 1 + (parseFloat(nqCustomPct) || 0) / 100
                    : (PRICE_OPTIONS.find(o => o.value === nqPriceOption)?.mult ?? _B))
                ).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            )}
            <QRow label="Qty">
              <input type="number" min="1" value={nqQuantity}
                onChange={(e) => setNqQuantity(e.target.value)}
                className="h-8 w-24 rounded-md border px-2 text-sm bg-background" />
            </QRow>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setAddToQuoteOpen(false)}>Cancel</Button>
            <Button onClick={handleAddToQuote}
              disabled={addingToQuote || (quoteMode === "new" ? !nqCode : !selectedQuoteCode)}>
              {addingToQuote ? "Adding…" : quoteMode === "new" ? "Create & Add" : "Add to Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-center gap-2">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

function OutRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-center gap-2">
      <Label className="text-sm text-primary/80">{label}</Label>
      <div className="[&_input]:bg-muted/40">{children}</div>
    </div>
  );
}

function QRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-2">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
