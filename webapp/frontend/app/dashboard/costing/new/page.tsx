"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr, getUsername } from "@/lib/api";
import { fmtInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CurrencyMode = "INR" | "USD";

interface FormState {
  dollar_rate: string;
  creation_date: string;
  created_by: string;
  duration: string;
  battery_pack: string;
  voltage: string;
  ampere_capacity: string;
  kw_calculation: string;
  cell_voltage: string;
  cell_capacity: string;
  cells_in_series: string;
  cells_in_parallel: string;
  total_cells: string;
  fob_cost: string;
  total_fob: string;
  clearing_customs_1: string;
  total_landed_1: string;
  cost_inr_1: string;
  currency_mode_1: CurrencyMode;
  bms_pcm_cost: string;
  clearing_customs_2: string;
  total_landed_2: string;
  cost_inr_2: string;
  currency_mode_2: CurrencyMode;
  cabinet: string;
  bus_bar: string;
  holder_caps: string;
  wire_gasket: string;
  terminals: string;
  mcb_fuse: string;
  lugs_slew: string;
  nut_bolts: string;
  fiber_glass: string;
  awg_cables: string;
  shipping: string;
  packaging: string;
  total_other: string;
  landing_cost: string;
  labour: string;
  warranty: string;
  total_cost: string;
  margin_10: string;
  est_sales_b: string;
  margin_15: string;
  est_sales_b5: string;
  per_kw_cost: string;
  per_kw_profit1: string;
  per_kw_profit2: string;
  bms_pcm_type: string;
  cell_chemistry: string;
  centre_tap: string;
  cell_type: string;
  application: string;
  enclosure: string;
  mount: string;
  brand: string;
  installation: string;
  partcode: string;
}

const EMPTY: FormState = {
  dollar_rate: "97",
  creation_date: "",
  created_by: "",
  duration: "",
  battery_pack: "", voltage: "", ampere_capacity: "", kw_calculation: "",
  cell_voltage: "", cell_capacity: "",
  cells_in_series: "", cells_in_parallel: "", total_cells: "",
  fob_cost: "", total_fob: "",
  clearing_customs_1: "", total_landed_1: "", cost_inr_1: "",
  currency_mode_1: "USD",
  bms_pcm_cost: "",
  clearing_customs_2: "", total_landed_2: "", cost_inr_2: "",
  currency_mode_2: "USD",
  cabinet: "", bus_bar: "", holder_caps: "", wire_gasket: "", terminals: "",
  mcb_fuse: "", lugs_slew: "", nut_bolts: "", fiber_glass: "", awg_cables: "",
  shipping: "", packaging: "", total_other: "",
  landing_cost: "", labour: "", warranty: "", total_cost: "",
  margin_10: "", est_sales_b: "", margin_15: "", est_sales_b5: "",
  per_kw_cost: "", per_kw_profit1: "", per_kw_profit2: "",
  bms_pcm_type: "", cell_chemistry: "", centre_tap: "", cell_type: "",
  application: "", enclosure: "", mount: "", brand: "", installation: "",
  partcode: "",
};

function n(v: string) { return parseFloat(v) || 0; }
function fmt(v: number) { return isNaN(v) || !isFinite(v) ? "" : String(Math.round(v * 100) / 100); }

function recalc(f: FormState, locked: Set<string> = new Set()): Partial<FormState> {
  const updates: Partial<FormState> = {};

  // kw = (V * Ah) / 1000
  const kw = (n(f.voltage) * n(f.ampere_capacity)) / 1000;
  updates.kw_calculation = fmt(kw);

  // total cells
  const totalCells = n(f.cells_in_series) * n(f.cells_in_parallel);
  updates.total_cells = fmt(totalCells);

  // total FOB
  const totalFob = totalCells * n(f.fob_cost);
  updates.total_fob = fmt(totalFob);

  const dr = n(f.dollar_rate) || 1;

  // INR (1)
  if (f.currency_mode_1 === "INR") {
    updates.clearing_customs_1 = "0";
    updates.total_landed_1 = "0";
    updates.cost_inr_1 = fmt(totalFob);
  } else {
    const landed1 = totalFob + n(f.clearing_customs_1);
    updates.total_landed_1 = fmt(landed1);
    updates.cost_inr_1 = fmt(landed1 * dr);
  }

  // INR (2)
  if (f.currency_mode_2 === "INR") {
    updates.clearing_customs_2 = "0";
    updates.total_landed_2 = "0";
    updates.cost_inr_2 = fmt(n(f.bms_pcm_cost));
  } else {
    const landed2 = n(f.bms_pcm_cost) + n(f.clearing_customs_2);
    updates.total_landed_2 = fmt(landed2);
    updates.cost_inr_2 = fmt(landed2 * dr);
  }

  // total other
  const otherFields: (keyof FormState)[] = [
    "cabinet", "bus_bar", "holder_caps", "wire_gasket", "terminals",
    "mcb_fuse", "lugs_slew", "nut_bolts", "fiber_glass", "awg_cables",
    "shipping", "packaging",
  ];
  const totalOther = otherFields.reduce((s, k) => s + n(f[k] as string), 0);
  updates.total_other = fmt(totalOther);

  const inr1 = f.currency_mode_1 === "INR" ? totalFob : (n(updates.total_landed_1 ?? f.total_landed_1) * dr);
  const inr2 = f.currency_mode_2 === "INR" ? n(f.bms_pcm_cost) : (n(updates.total_landed_2 ?? f.total_landed_2) * dr);

  const computedLanding = inr1 + inr2 + totalOther;
  const landing = locked.has("landing_cost") ? n(f.landing_cost) : computedLanding;
  if (!locked.has("landing_cost")) updates.landing_cost = fmt(landing);

  const warranty = locked.has("warranty") ? n(f.warranty) : landing * 0.1;
  if (!locked.has("warranty")) updates.warranty = fmt(warranty);

  const labour = locked.has("labour") ? n(f.labour) : landing * 0.1;
  if (!locked.has("labour")) updates.labour = fmt(labour);

  const totalCost = locked.has("total_cost") ? n(f.total_cost) : landing + warranty + labour;
  if (!locked.has("total_cost")) updates.total_cost = fmt(totalCost);

  const margin10 = totalCost * 0.1;
  const margin15 = totalCost * 0.15;
  updates.margin_10 = fmt(margin10);
  updates.margin_15 = fmt(margin15);
  updates.est_sales_b = fmt(totalCost + margin10);
  updates.est_sales_b5 = fmt(totalCost + margin15);

  const kwVal = n(updates.kw_calculation ?? f.kw_calculation);
  updates.per_kw_cost = kwVal > 0 ? fmt((totalCost / kwVal) / dr) : "";
  updates.per_kw_profit1 = kwVal > 0 ? fmt((n(updates.est_sales_b ?? "") / kwVal) / dr) : "";
  updates.per_kw_profit2 = kwVal > 0 ? fmt((n(updates.est_sales_b5 ?? "") / kwVal) / dr) : "";

  return updates;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-md p-4 flex flex-col gap-2">
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[200px_1fr] items-center gap-2">
      <Label className="text-sm text-right">{label}</Label>
      {children}
    </div>
  );
}

function Num({ value, onChange, readOnly }: { value: string; onChange?: (v: string) => void; readOnly?: boolean }) {
  return (
    <Input
      type="number"
      value={value}
      readOnly={readOnly}
      className={readOnly ? "bg-muted/50" : ""}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
}

function ReadonlyMoney({ value }: { value: string }) {
  return (
    <div className="h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm font-mono">
      {fmtInr(value)}
    </div>
  );
}

const BMS_PCM_OPTS = ["", "BMS", "PCM", "BMS+PCM"];
const CHEM_OPTS = ["", "LFP", "NCM", "NMC", "LTO"];
const CENTRE_TAP_OPTS = ["", "Centre Tap", "Non Centre Tap"];
const CELL_TYPE_OPTS = ["", "Cylindrical", "Prismatic", "Pouch"];
const ENCLOSURE_OPTS = ["", "Soft Pack", "Metal Enclosure"];
const MOUNT_OPTS = ["", "Tower Type", "Rack Mountable", "Wall Mount"];
const INSTALL_OPTS = ["", "Indoor", "Outdoor"];

function NewCostingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editIdx = searchParams.get("edit");
  const fromSizing = searchParams.get("from") === "sizing";
  const backUrl = searchParams.get("back") || "";
  const qc = useQueryClient();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [locked, setLocked] = useState<Set<string>>(new Set());

  const { data: durations = [] } = useQuery<string[]>({
    queryKey: ["costing-durations"],
    queryFn: () => api.get("/api/costing/durations").then((r) => r.data),
  });

  const { data: existingRows = [] } = useQuery<any[]>({
    queryKey: ["costing-tree"],
    queryFn: () => api.get("/api/costing/tree").then((r) => r.data),
    enabled: editIdx !== null,
  });

  // auto-populate creation_date + created_by for new costings
  useEffect(() => {
    if (editIdx !== null) return;
    const today = new Date().toLocaleDateString("en-GB").replace(/\//g, ".");
    setForm((f) => ({
      ...f,
      creation_date: f.creation_date || today,
      created_by: f.created_by || getUsername(),
    }));
  }, [editIdx]);

  useEffect(() => {
    if (editIdx === null || existingRows.length === 0) return;
    const idx = parseInt(editIdx, 10);
    const row = existingRows[idx];
    if (!row) return;
    setLocked(new Set());
    setForm({
      dollar_rate: String(row.dollar_rate ?? "97"),
      creation_date: String(row.creation_date ?? ""),
      created_by: String(row.created_by ?? ""),
      duration: String(row.duration ?? ""),
      battery_pack: String(row.battery_pack ?? ""),
      voltage: String(row.voltage ?? ""),
      ampere_capacity: String(row.ampere_capacity ?? ""),
      kw_calculation: String(row.kw_calculation ?? ""),
      cell_voltage: String(row.cell_voltage ?? ""),
      cell_capacity: String(row.cell_capacity ?? ""),
      cells_in_series: String(row.cells_in_series ?? ""),
      cells_in_parallel: String(row.cells_in_parallel ?? ""),
      total_cells: String(row.total_cells ?? ""),
      fob_cost: String(row.fob_cost ?? ""),
      total_fob: String(row.total_fob ?? ""),
      clearing_customs_1: String(row.clearing_customs_1 ?? ""),
      total_landed_1: String(row.total_landed_1 ?? ""),
      cost_inr_1: String(row.cost_inr_1 ?? ""),
      currency_mode_1: "USD",
      bms_pcm_cost: String(row.bms_pcm_cost ?? ""),
      clearing_customs_2: String(row.clearing_customs_2 ?? ""),
      total_landed_2: String(row.total_landed_2 ?? ""),
      cost_inr_2: String(row.cost_inr_2 ?? ""),
      currency_mode_2: "USD",
      cabinet: String(row.cabinet ?? ""),
      bus_bar: String(row.bus_bar ?? ""),
      holder_caps: String(row.holder_caps ?? ""),
      wire_gasket: String(row.wire_gasket ?? ""),
      terminals: String(row.terminals ?? ""),
      mcb_fuse: String(row.mcb_fuse ?? ""),
      lugs_slew: String(row.lugs_slew ?? ""),
      nut_bolts: String(row.nut_bolts ?? ""),
      fiber_glass: String(row.fiber_glass ?? ""),
      awg_cables: String(row.awg_cables ?? ""),
      shipping: String(row.shipping ?? ""),
      packaging: String(row.packaging ?? ""),
      total_other: String(row.total_other ?? ""),
      landing_cost: String(row.landing_cost ?? ""),
      labour: String(row.labour ?? ""),
      warranty: String(row.warranty ?? ""),
      total_cost: String(row.total_cost ?? ""),
      margin_10: String(row.margin_10 ?? ""),
      est_sales_b: String(row.est_sales_b ?? ""),
      margin_15: String(row.margin_15 ?? ""),
      est_sales_b5: String(row.est_sales_b5 ?? ""),
      per_kw_cost: String(row.per_kw_cost ?? ""),
      per_kw_profit1: String(row.per_kw_profit1 ?? ""),
      per_kw_profit2: String(row.per_kw_profit2 ?? ""),
      bms_pcm_type: String(row.bms_pcm_type ?? ""),
      cell_chemistry: String(row.cell_chemistry ?? ""),
      centre_tap: String(row.centre_tap ?? ""),
      cell_type: String(row.cell_type ?? ""),
      application: String(row.application ?? ""),
      enclosure: String(row.enclosure ?? ""),
      mount: String(row.mount ?? ""),
      brand: String(row.brand ?? ""),
      installation: String(row.installation ?? ""),
      partcode: String(row.partcode ?? ""),
    });
  }, [editIdx, existingRows]);

  const update = (k: keyof FormState, v: string) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      return { ...next, ...recalc(next, locked) };
    });
  };

  const updateManual = (k: "landing_cost" | "labour" | "warranty" | "total_cost", v: string) => {
    const newLocked = new Set(locked);
    if (v === "") newLocked.delete(k); else newLocked.add(k);
    setLocked(newLocked);
    setForm((f) => {
      const next = { ...f, [k]: v };
      return { ...next, ...recalc(next, newLocked) };
    });
  };

  const parseBatteryPack = (val: string) => {
    const parts = val.replace(/V/gi, " ").replace(/Ah/gi, " ").trim().split(/\s+/);
    setForm((f) => {
      const next = { ...f, battery_pack: val };
      if (parts.length >= 2) {
        next.voltage = parts[0];
        next.ampere_capacity = parts[1];
      }
      return { ...next, ...recalc(next, locked) };
    });
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const calc = recalc(form, locked);
      const merged = { ...form, ...calc };
      const payload = {
        dollar_rate: merged.dollar_rate,
        creation_date: merged.creation_date,
        created_by: merged.created_by,
        duration: merged.duration,
        battery_pack: merged.battery_pack,
        voltage: n(merged.voltage),
        ampere_capacity: n(merged.ampere_capacity),
        kw_calculation: n(merged.kw_calculation),
        cell_voltage: n(merged.cell_voltage),
        cell_capacity: n(merged.cell_capacity),
        cells_in_series: n(merged.cells_in_series),
        cells_in_parallel: n(merged.cells_in_parallel),
        total_cells: n(merged.total_cells),
        fob_cost: n(merged.fob_cost),
        total_fob: n(merged.total_fob),
        clearing_customs_1: n(merged.clearing_customs_1),
        total_landed_1: n(merged.total_landed_1),
        cost_inr_1: n(merged.cost_inr_1),
        bms_pcm_cost: n(merged.bms_pcm_cost),
        clearing_customs_2: n(merged.clearing_customs_2),
        total_landed_2: n(merged.total_landed_2),
        cost_inr_2: n(merged.cost_inr_2),
        cabinet: n(merged.cabinet),
        bus_bar: n(merged.bus_bar),
        holder_caps: n(merged.holder_caps),
        wire_gasket: n(merged.wire_gasket),
        terminals: n(merged.terminals),
        mcb_fuse: n(merged.mcb_fuse),
        lugs_slew: n(merged.lugs_slew),
        nut_bolts: n(merged.nut_bolts),
        fiber_glass: n(merged.fiber_glass),
        awg_cables: n(merged.awg_cables),
        shipping: n(merged.shipping),
        packaging: n(merged.packaging),
        total_other: n(merged.total_other),
        landing_cost: n(merged.landing_cost),
        labour: n(merged.labour),
        warranty: n(merged.warranty),
        total_cost: n(merged.total_cost),
        margin_10: n(merged.margin_10),
        est_sales_b: n(merged.est_sales_b),
        margin_15: n(merged.margin_15),
        est_sales_b5: n(merged.est_sales_b5),
        per_kw_cost: n(merged.per_kw_cost),
        per_kw_profit1: n(merged.per_kw_profit1),
        per_kw_profit2: n(merged.per_kw_profit2),
        bms_pcm_type: merged.bms_pcm_type,
        cell_chemistry: merged.cell_chemistry,
        centre_tap: merged.centre_tap,
        cell_type: merged.cell_type,
        application: merged.application,
        enclosure: merged.enclosure,
        mount: merged.mount,
        brand: merged.brand,
        installation: merged.installation,
        partcode: merged.partcode,
      };
      if (editIdx !== null) {
        return api.put(`/api/costing/tree/${editIdx}`, payload);
      }
      return api.post("/api/costing/tree/insert", payload);
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["costing-tree"] });
      const qs = fromSizing ? `?from=sizing&back=${encodeURIComponent(backUrl)}` : "";
      router.push(`/dashboard/costing${qs}`);
    },
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  return (
    <div className="flex flex-col h-full overflow-auto p-5 gap-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => {
          const qs = fromSizing ? `?from=sizing&back=${encodeURIComponent(backUrl)}` : "";
          router.push(`/dashboard/costing${qs}`);
        }}>← Back</Button>
        <h1 className="text-2xl font-bold">{editIdx !== null ? "Edit" : "New"} Costing</h1>
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {editIdx !== null ? "Update" : "Add to Table"}
        </Button>
      </div>

      <Section title="Dollar Rate &amp; Metadata">
        <div className="grid grid-cols-3 gap-4">
          <Row label="Dollar Rate (INR / USD)">
            <Num value={form.dollar_rate} onChange={(v) => update("dollar_rate", v)} />
          </Row>
          <Row label="Creation Date">
            <div className="h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm">
              {form.creation_date || "—"}
            </div>
          </Row>
          <Row label="Created By">
            <div className="h-9 rounded-md border bg-muted/50 px-3 flex items-center text-sm">
              {form.created_by || "—"}
            </div>
          </Row>
        </div>
      </Section>

      <div className="grid grid-cols-2 gap-4">
        {/* ── Left Column ── */}
        <div className="flex flex-col gap-4">
          <Section title="Battery Details">
            <Row label="Battery Pack">
              <Input
                value={form.battery_pack}
                onChange={(e) => parseBatteryPack(e.target.value)}
                placeholder="48V 100Ah"
              />
            </Row>
            <Row label="Duration">
              <select
                className="h-9 rounded-md border px-3 text-sm bg-background w-full"
                value={form.duration}
                onChange={(e) => update("duration", e.target.value)}
              >
                <option value="">Select…</option>
                {durations.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </Row>
            <Row label="Voltage"><Num value={form.voltage} onChange={(v) => update("voltage", v)} /></Row>
            <Row label="Ampere Capacity"><Num value={form.ampere_capacity} onChange={(v) => update("ampere_capacity", v)} /></Row>
            <Row label="Calculated kW"><Num value={form.kw_calculation} readOnly /></Row>
            <Row label="Cell Voltage"><Num value={form.cell_voltage} onChange={(v) => update("cell_voltage", v)} /></Row>
            <Row label="Cell Capacity"><Num value={form.cell_capacity} onChange={(v) => update("cell_capacity", v)} /></Row>
            <Row label="Cells in Series"><Num value={form.cells_in_series} onChange={(v) => update("cells_in_series", v)} /></Row>
            <Row label="Cells in Parallel"><Num value={form.cells_in_parallel} onChange={(v) => update("cells_in_parallel", v)} /></Row>
            <Row label="Total No of Cells"><Num value={form.total_cells} readOnly /></Row>
          </Section>

          <Section title="Cell Costing (1)">
            <Row label="Currency">
              <div className="flex gap-4">
                {(["INR", "USD"] as CurrencyMode[]).map((m) => (
                  <label key={m} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="currency1" value={m}
                      checked={form.currency_mode_1 === m}
                      onChange={() => update("currency_mode_1", m)} />
                    {m}
                  </label>
                ))}
              </div>
            </Row>
            <Row label="FOB Cost per Cell"><Num value={form.fob_cost} onChange={(v) => update("fob_cost", v)} /></Row>
            <Row label="Total FOB Cost"><ReadonlyMoney value={form.total_fob} /></Row>
            {form.currency_mode_1 === "USD" && (
              <>
                <Row label="Clearing & Customs (1)"><Num value={form.clearing_customs_1} onChange={(v) => update("clearing_customs_1", v)} /></Row>
                <Row label="Total Landed Cost (1)"><ReadonlyMoney value={form.total_landed_1} /></Row>
              </>
            )}
            <Row label="Cost in INR (1)"><ReadonlyMoney value={form.cost_inr_1} /></Row>
          </Section>

          <Section title="BMS/PCM (2)">
            <Row label="Currency">
              <div className="flex gap-4">
                {(["INR", "USD"] as CurrencyMode[]).map((m) => (
                  <label key={m} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name="currency2" value={m}
                      checked={form.currency_mode_2 === m}
                      onChange={() => update("currency_mode_2", m)} />
                    {m}
                  </label>
                ))}
              </div>
            </Row>
            <Row label="BMS/PCM Cost"><Num value={form.bms_pcm_cost} onChange={(v) => update("bms_pcm_cost", v)} /></Row>
            {form.currency_mode_2 === "USD" && (
              <>
                <Row label="Clearing & Customs (2)"><Num value={form.clearing_customs_2} onChange={(v) => update("clearing_customs_2", v)} /></Row>
                <Row label="Total Landed Cost (2)"><ReadonlyMoney value={form.total_landed_2} /></Row>
              </>
            )}
            <Row label="Cost in INR (2)"><ReadonlyMoney value={form.cost_inr_2} /></Row>
          </Section>
        </div>

        {/* ── Right Column ── */}
        <div className="flex flex-col gap-4">
          <Section title="Other Components (3)">
            {([
              ["cabinet", "Cabinet (INR)"],
              ["bus_bar", "Bus Bar"],
              ["holder_caps", "Holder/Caps"],
              ["wire_gasket", "Wire & Gasket"],
              ["terminals", "Terminals + Connectors"],
              ["mcb_fuse", "MCB/Fuse"],
              ["lugs_slew", "Lugs & Slew"],
              ["nut_bolts", "Nut Bolts"],
              ["fiber_glass", "Fiber Glass + Rod"],
              ["awg_cables", "AWG Cables"],
              ["shipping", "Shipping Charges"],
              ["packaging", "Packaging Cost"],
            ] as [keyof FormState, string][]).map(([k, lbl]) => (
              <Row key={k} label={lbl}>
                <Num value={form[k] as string} onChange={(v) => update(k, v)} />
              </Row>
            ))}
            <Row label="Total Other Charges (3)"><ReadonlyMoney value={form.total_other} /></Row>
          </Section>

          <Section title="Cost Calculations">
            <Row label="Landing Cost (1+2+3)">
              <Input type="number" value={form.landing_cost} onChange={e => updateManual("landing_cost", e.target.value)} className={locked.has("landing_cost") ? "border-amber-400" : ""} placeholder="auto" />
            </Row>
            <Row label="Production Labour">
              <Input type="number" value={form.labour} onChange={e => updateManual("labour", e.target.value)} className={locked.has("labour") ? "border-amber-400" : ""} placeholder="auto" />
            </Row>
            <Row label="Warranty & Service">
              <Input type="number" value={form.warranty} onChange={e => updateManual("warranty", e.target.value)} className={locked.has("warranty") ? "border-amber-400" : ""} placeholder="auto" />
            </Row>
            <Row label="Total Cost of Pack (A)">
              <Input type="number" value={form.total_cost} onChange={e => updateManual("total_cost", e.target.value)} className={locked.has("total_cost") ? "border-amber-400" : ""} placeholder="auto" />
            </Row>
            <Row label="Margin @10% on Cost"><ReadonlyMoney value={form.margin_10} /></Row>
            <Row label="Estimated Sales Cost (B)"><ReadonlyMoney value={form.est_sales_b} /></Row>
            <Row label="Margin @15% on Cost"><ReadonlyMoney value={form.margin_15} /></Row>
            <Row label="Estimated Sales Cost (B+5)"><ReadonlyMoney value={form.est_sales_b5} /></Row>
          </Section>

          <Section title="Per kW Pricing">
            <Row label="Per kW @ Cost (A)"><ReadonlyMoney value={form.per_kw_cost} /></Row>
            <Row label="Per kW @ 1st Level (B)"><ReadonlyMoney value={form.per_kw_profit1} /></Row>
            <Row label="Per kW @ 2nd Level (B+5)"><ReadonlyMoney value={form.per_kw_profit2} /></Row>
          </Section>

          <Section title="Additional Options">
            {([
              ["bms_pcm_type", "BMS/PCM", BMS_PCM_OPTS],
              ["cell_chemistry", "Cell Chemistry", CHEM_OPTS],
              ["centre_tap", "Centre Tap", CENTRE_TAP_OPTS],
              ["cell_type", "Cell Type", CELL_TYPE_OPTS],
              ["enclosure", "Enclosure", ENCLOSURE_OPTS],
              ["mount", "Mount Type", MOUNT_OPTS],
              ["installation", "Installation", INSTALL_OPTS],
            ] as [keyof FormState, string, string[]][]).map(([k, lbl, opts]) => (
              <Row key={k} label={lbl}>
                <select
                  className="h-9 rounded-md border px-3 text-sm bg-background w-full"
                  value={form[k] as string}
                  onChange={(e) => update(k, e.target.value)}
                >
                  {opts.map((o) => <option key={o} value={o}>{o || "—"}</option>)}
                </select>
              </Row>
            ))}
            <Row label="Application">
              <Input value={form.application} onChange={(e) => update("application", e.target.value)} />
            </Row>
            <Row label="Brand & Type of Cell">
              <Input value={form.brand} onChange={(e) => update("brand", e.target.value)} />
            </Row>
            <Row label="Battery Partcode">
              <Input value={form.partcode} onChange={(e) => update("partcode", e.target.value)} />
            </Row>
          </Section>
        </div>
      </div>
    </div>
  );
}

export default function NewCostingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground">Loading…</div>}>
      <NewCostingInner />
    </Suspense>
  );
}
