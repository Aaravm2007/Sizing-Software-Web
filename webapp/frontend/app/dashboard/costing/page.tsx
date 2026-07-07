"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { useMe } from "@/lib/use-me";
import SubmitApprovalDialog, { type ApprovalItem } from "@/components/SubmitApprovalDialog";
import { getPendingAction, clearPendingAction } from "@/lib/approval-action";
import { fmtInr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CostingRow {
  duration: string;
  battery_pack: string;
  voltage: number;
  ampere_capacity: number;
  kw_calculation: number;
  cell_voltage: number;
  cell_capacity: number;
  cells_in_series: number;
  cells_in_parallel: number;
  total_cells: number;
  fob_cost: number;
  total_fob: number;
  clearing_customs_1: number;
  total_landed_1: number;
  cost_inr_1: number;
  bms_pcm_cost: number;
  clearing_customs_2: number;
  total_landed_2: number;
  cost_inr_2: number;
  cabinet: number;
  bus_bar: number;
  holder_caps: number;
  wire_gasket: number;
  terminals: number;
  mcb_fuse: number;
  lugs_slew: number;
  nut_bolts: number;
  fiber_glass: number;
  awg_cables: number;
  shipping: number;
  packaging: number;
  total_other: number;
  landing_cost: number;
  labour: number;
  warranty: number;
  total_cost: number;
  margin_10: number;
  est_sales_b: number;
  margin_15: number;
  est_sales_b5: number;
  per_kw_cost: number;
  per_kw_profit1: number;
  per_kw_profit2: number;
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
  dollar_rate?: string;
  creation_date?: string;
  created_by?: string;
}

const TEXT_FIELDS = new Set<keyof CostingRow>([
  "dollar_rate", "creation_date", "created_by",
  "bms_pcm_type", "cell_chemistry", "centre_tap", "cell_type",
  "application", "enclosure", "mount", "brand", "installation",
]);

const MONEY_FIELDS = new Set<keyof CostingRow>([
  "fob_cost", "total_fob", "clearing_customs_1", "total_landed_1", "cost_inr_1",
  "bms_pcm_cost", "clearing_customs_2", "total_landed_2", "cost_inr_2",
  "cabinet", "bus_bar", "holder_caps", "wire_gasket", "terminals",
  "mcb_fuse", "lugs_slew", "nut_bolts", "fiber_glass", "awg_cables",
  "shipping", "packaging", "total_other", "landing_cost", "labour", "warranty",
  "total_cost", "margin_10", "est_sales_b", "margin_15", "est_sales_b5",
  "per_kw_cost", "per_kw_profit1", "per_kw_profit2",
]);

const USER_VISIBLE_LABELS: [keyof CostingRow, string][] = [
  ["partcode",      "Battery Partcode"],
  ["duration",      "Duration"],
  ["battery_pack",  "Battery Pack"],
  ["dollar_rate",   "Dollar Rate (INR/USD)"],
  ["creation_date", "Creation Date"],
  ["created_by",    "Created By"],
  ["est_sales_b",   "Cost"],
  ["bms_pcm_type",  "BMS/PCM"],
  ["cell_chemistry","LFP/NCM"],
  ["centre_tap",    "Centre Tap"],
  ["cell_type",     "Cylindrical/Prismatic"],
  ["application",   "Application"],
  ["enclosure",     "Enclosure"],
  ["mount",         "Mount"],
  ["brand",         "Brand & Type of Cell"],
  ["installation",  "Installation"],
];

function getCostValue(row: CostingRow): number {
  const pc = (row.partcode ?? "").toUpperCase();
  if (pc.includes("HVL")) return Number(row.est_sales_b) || 0;
  if (pc.includes("EFL")) return (Number(row.total_cost) || 0) * 1.06;
  return Number(row.est_sales_b) || 0;
}

const USER_BLUE_KEYS = new Set<keyof CostingRow>(["est_sales_b"]);
const USER_GREEN_KEYS = new Set<keyof CostingRow>(["partcode","duration","battery_pack","dollar_rate","creation_date","created_by"]);

const ROW_LABELS: [keyof CostingRow, string][] = [
  ["partcode", "Battery Partcode"],
  ["duration", "Duration"],
  ["battery_pack", "Battery Pack"],
  ["dollar_rate", "Dollar Rate (INR/USD)"],
  ["creation_date", "Creation Date"],
  ["created_by", "Created By"],
  ["voltage", "Voltage"],
  ["ampere_capacity", "Ampere Capacity"],
  ["kw_calculation", "KW Calculation"],
  ["cell_voltage", "Cell Voltage"],
  ["cell_capacity", "Cell Capacity"],
  ["cells_in_series", "Cells in Series"],
  ["cells_in_parallel", "Cells in Parallel"],
  ["total_cells", "Total No of Cells"],
  ["fob_cost", "FOB Cost of Cells"],
  ["total_fob", "Total FOB Cost"],
  ["clearing_customs_1", "Clearing & Customs (1)"],
  ["total_landed_1", "Total Landed Cost India (1)"],
  ["cost_inr_1", "Cost in INR (1)"],
  ["bms_pcm_cost", "BMS/PCM Cost"],
  ["clearing_customs_2", "Clearing & Customs (2)"],
  ["total_landed_2", "Total Landed Cost India (2)"],
  ["cost_inr_2", "Cost in INR (2)"],
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
  ["total_other", "Total Other Charges (3)"],
  ["landing_cost", "Landing Cost (1+2+3)"],
  ["labour", "Production Labour & Assembly"],
  ["warranty", "Warranty & Service"],
  ["total_cost", "Total Cost of Pack (A)"],
  ["margin_10", "Margin @10% on Cost"],
  ["est_sales_b", "Estimated Sales Cost (B)"],
  ["margin_15", "Margin @15% on Cost"],
  ["est_sales_b5", "Estimated Sales Cost (B+5)"],
  ["per_kw_cost", "Per kW Pricing @ Cost (A)"],
  ["per_kw_profit1", "Per kW Pricing @ 1st Level (B)"],
  ["per_kw_profit2", "Per kW Pricing @ 2nd Level (B+5)"],
  ["bms_pcm_type", "BMS/PCM"],
  ["cell_chemistry", "LFP/NCM"],
  ["centre_tap", "Centre Tap"],
  ["cell_type", "Cylindrical/Prismatic"],
  ["application", "Application"],
  ["enclosure", "Enclosure"],
  ["mount", "Mount"],
  ["brand", "Brand & Type of Cell"],
  ["installation", "Installation"],
];

export default function CostingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isExpert, isGuest } = useMe();

  const [batteryConfig, setBatteryConfig] = useState("");
  const [duration, setDuration] = useState("");
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [pwValue, setPwValue] = useState("");
  const [pwPending, setPwPending] = useState(false);
  const [pendingSaveIdx, setPendingSaveIdx] = useState<number | null>(null);
  const [pwMode, setPwMode] = useState<"save" | "deactivate">("save");
  const [pendingDeactivateIdx, setPendingDeactivateIdx] = useState<number | null>(null);

  const [fromSizing, setFromSizing] = useState(false);
  const [backUrl, setBackUrl] = useState("");
  const [restoring, setRestoring] = useState(false);
const [approvalItem, setApprovalItem] = useState<ApprovalItem | null>(null);
  const [pendingAction, setPendingActionState] = useState(() => getPendingAction());
  const pendingForMe = pendingAction?.type === "costing" ? pendingAction : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFromSizing(params.get("from") === "sizing");
    setBackUrl(params.get("back") || "/dashboard/sizing");
  }, []);

  const handleBackToSizing = async () => {
    setRestoring(true);
    try {
      const backup = localStorage.getItem("costing_preview_backup");
      if (backup) {
        const rows = JSON.parse(backup);
        await api.post("/api/costing/tree/bulk-restore", rows);
        localStorage.removeItem("costing_preview_backup");
        qc.invalidateQueries({ queryKey: ["costing-tree"] });
        toast.success("Costing table restored");
      }
      router.push(backUrl);
    } catch {
      toast.error("Failed to restore costing table");
      router.push(backUrl);
    } finally {
      setRestoring(false);
    }
  };

  const { data: durations = [] } = useQuery<string[]>({
    queryKey: ["costing-durations"],
    queryFn: () => api.get("/api/costing/durations").then((r) => r.data),
  });

  const { data: rows = [], isLoading } = useQuery<CostingRow[]>({
    queryKey: ["costing-tree"],
    queryFn: () => api.get("/api/costing/tree").then((r) => r.data),
  });

  const searchMut = useMutation({
    mutationFn: () =>
      api.post("/api/costing/tree/search", { duration, keyword: batteryConfig }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["costing-tree"] });
      toast.success("Added to costing table");
    },
    onError: (e: any) => toast.error(apiErr(e, "Search failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (idx: number) => api.delete(`/api/costing/tree/${idx}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["costing-tree"] });
      setSelectedCol(null);
      setActionOpen(false);
    },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const saveFbMut = useMutation({
    mutationFn: (idx: number) => api.post(`/api/costing/tree/${idx}/save-to-firebase`),
    onSuccess: () => { toast.success("Saved to database"); setPwDialogOpen(false); setPwValue(""); setPendingSaveIdx(null); setPwMode("save"); },
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  const deactivateFbMut = useMutation({
    mutationFn: (idx: number) => api.post(`/api/costing/tree/${idx}/deactivate-in-firebase`),
    onSuccess: (res: any) => {
      const d = res.data;
      if (d.deactivated === 0) toast.warning(`No matching record found: ${d.reason ?? ""}`);
      else toast.success("Deactivated in database");
      setPwDialogOpen(false); setPwValue(""); setPendingDeactivateIdx(null); setPwMode("save");
    },
    onError: (e: any) => toast.error(apiErr(e, "Deactivate failed")),
  });

  const handleSaveClick = (idx: number) => {
    setPendingSaveIdx(idx);
    setPwMode("save");
    setPwValue("");
    setPwDialogOpen(true);
  };

  const handleDeactivateClick = (idx: number) => {
    setPendingDeactivateIdx(idx);
    setPwMode("deactivate");
    setPwValue("");
    setPwDialogOpen(true);
  };

  const handlePwConfirm = async () => {
    if (!pwValue) return;
    if (pwMode === "save" && pendingSaveIdx === null) return;
    if (pwMode === "deactivate" && pendingDeactivateIdx === null) return;
    setPwPending(true);
    try {
      await api.post("/api/auth/verify-password", { password: pwValue });
      if (pwMode === "save") saveFbMut.mutate(pendingSaveIdx!);
      else deactivateFbMut.mutate(pendingDeactivateIdx!);
    } catch {
      toast.error("Incorrect password");
    } finally {
      setPwPending(false);
    }
  };

  const duplicateMut = useMutation({
    mutationFn: (idx: number) => api.post(`/api/costing/tree/${idx}/duplicate`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["costing-tree"] }); setActionOpen(false); toast.success("Option duplicated"); },
    onError: (e: any) => toast.error(apiErr(e, "Duplicate failed")),
  });

  const clearMut = useMutation({
    mutationFn: () => api.delete("/api/costing/tree"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["costing-tree"] });
      setSelectedCol(null);
    },
    onError: (e: any) => toast.error(apiErr(e, "Clear failed")),
  });

  // COSTING EXPORT DISABLED — do not re-enable without authorisation
  // const handleExport = () => {
  //   api.get("/api/costing/export", { responseType: "blob" }).then((res) => {
  //     const url = window.URL.createObjectURL(new Blob([res.data]));
  //     const a = document.createElement("a");
  //     a.href = url;
  //     a.download = "costing_export.xlsx";
  //     a.click();
  //     window.URL.revokeObjectURL(url);
  //   }).catch(() => toast.error("Export failed"));
  // };

  const handleSearch = () => {
    if (!batteryConfig.trim() || !duration.trim()) {
      toast.warning("Enter Battery Configuration and select Duration");
      return;
    }
    searchMut.mutate();
  };

  const [reloading, setReloading] = useState(false);
  const handleReload = async () => {
    if (!batteryConfig.trim() || !duration.trim()) {
      toast.warning("Enter Battery Configuration and select Duration");
      return;
    }
    setReloading(true);
    try {
      await api.delete("/api/costing/tree");
      await api.post("/api/costing/tree/search", { duration, keyword: batteryConfig });
      qc.invalidateQueries({ queryKey: ["costing-tree"] });
      setSelectedCol(null);
      toast.success("Costing table reloaded");
    } catch (e: any) {
      toast.error(apiErr(e, "Reload failed"));
    } finally {
      setReloading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      <div className="flex items-center gap-3">
        {fromSizing && (
          <Button variant="outline" onClick={handleBackToSizing} disabled={restoring}>
            {restoring ? "Restoring…" : "← Back to Sizing"}
          </Button>
        )}
        <h1 className="text-3xl font-bold">
          Battery Costing{fromSizing && <span className="ml-2 text-base font-normal text-muted-foreground">(Preview)</span>}
        </h1>
      </div>

      {pendingForMe && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-md px-4 py-2 flex items-center gap-3 text-sm">
          <span className="flex-1">
            <span className="font-semibold">Approval action pending:</span>{" "}
            {pendingForMe.action === "revise" ? "Revise" : "Re-submit"} for{" "}
            <span className="font-medium">"{pendingForMe.ticket_name}"</span>.
            Update the costing table, then click Submit.
          </span>
          <Button size="sm" onClick={async () => {
            try {
              const treeRes = await api.get("/api/costing/tree");
              const data = { rows: treeRes.data };
              const endpoint = `/api/approvals/${pendingForMe.ticket_id}/${pendingForMe.action === "revise" ? "revise" : "resubmit"}`;
              await api.post(endpoint, { data, message: "" });
              clearPendingAction(); setPendingActionState(null);
              toast.success(pendingForMe.action === "revise" ? "Revision submitted" : "Re-submitted");
            } catch (e: any) { toast.error(apiErr(e, "Failed")); }
          }}>Submit {pendingForMe.action === "revise" ? "Revision" : "Update"}</Button>
          <Button size="sm" variant="ghost" onClick={() => { clearPendingAction(); setPendingActionState(null); }}>Cancel</Button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        {!isGuest && (<div className="flex flex-col gap-1">
          <Label>Battery Configuration</Label>
          <Input
            className="w-72"
            value={batteryConfig}
            onChange={(e) => setBatteryConfig(e.target.value)}
            placeholder="e.g. 48V 100Ah"
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>)}
        {!isGuest && (<div className="flex flex-col gap-1">
          <Label>Backup Time (Duration)</Label>
          <select
            className="h-9 rounded-md border px-3 text-sm bg-background w-44"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          >
            <option value="">Select…</option>
            {durations.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>)}
        {!isGuest && (<Button onClick={handleSearch} disabled={searchMut.isPending}>
          Search &amp; Add
        </Button>)}
        {isExpert && (<Button variant="outline" onClick={handleReload} disabled={reloading}>
          {reloading ? "Reloading…" : "Reload Table"}
        </Button>)}
        <Button variant="outline" onClick={() => {
          const qs = fromSizing ? `?from=sizing&back=${encodeURIComponent(backUrl)}` : "";
          router.push(`/dashboard/costing/new${qs}`);
        }}>
          New Costing
        </Button>
        {isExpert && (
        <Button variant="outline" onClick={() => router.push("/dashboard/costing/mass-update")}>
          Mass Cost Update
        </Button>
        )}
        {/* COSTING EXPORT DISABLED — do not re-enable without authorisation */}
        {/* <Button variant="outline" onClick={handleExport}>Export Costing</Button> */}
        <Button variant="outline" onClick={async () => {
          try {
            const treeRes = await api.get("/api/costing/tree");
            const firstRow = treeRes.data[0];
            if (!firstRow) { toast.error("No costing data"); return; }
            setApprovalItem({ type: "costing",
              name: `Costing — ${firstRow.battery_pack ?? "Export"} ${new Date().toLocaleDateString()}`,
              data: { rows: treeRes.data } });
          } catch { toast.error("Failed to collect costing data"); }
        }}>Submit for Approval</Button>
        {isExpert && (
          <Button
            variant="outline"
            onClick={() => selectedCol !== null && handleSaveClick(selectedCol)}
            disabled={selectedCol === null || saveFbMut.isPending}
            title={selectedCol === null ? "Select a column first" : `Save Option ${selectedCol + 1} to Database`}
          >
            {saveFbMut.isPending ? "Saving…" : selectedCol !== null ? `Save Option ${selectedCol + 1} to Database` : "Save to Database"}
          </Button>
        )}
        {isExpert && (
          <Button
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
            onClick={() => selectedCol !== null && handleDeactivateClick(selectedCol)}
            disabled={selectedCol === null || deactivateFbMut.isPending}
            title={selectedCol === null ? "Select a column first" : `Deactivate Option ${selectedCol + 1} from Database`}
          >
            {deactivateFbMut.isPending ? "Deactivating…" : selectedCol !== null ? `Deactivate Option ${selectedCol + 1} from Database` : "Deactivate from Database"}
          </Button>
        )}
        <Button variant="destructive" onClick={() => clearMut.mutate()} disabled={clearMut.isPending}>
          Clear Table
        </Button>
      </div>

      <div className="flex-1 overflow-auto border rounded-md">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No costing data. Use &quot;Search &amp; Add&quot; or &quot;New Costing&quot; to add options.
          </div>
        ) : (
          <table className="costing-grid text-sm">
            <thead className="bg-muted sticky top-0 z-20">
              <tr>
                <th className="text-center py-2 px-2 w-10 sticky left-0 bg-muted z-30 text-xs text-muted-foreground">
                  #
                </th>
                <th className="col-sep text-left py-2 px-3 min-w-[230px] sticky left-10 bg-muted z-30">
                  Description
                </th>
                {rows.map((_, i) => (
                  <th
                    key={i}
                    className={`py-2 px-3 text-center min-w-[180px] cursor-pointer hover:bg-accent
                      ${selectedCol === i ? "bg-primary/20" : ""}`}
                    onClick={() => setSelectedCol(i)}
                    onDoubleClick={() => { setSelectedCol(i); setActionOpen(true); }}
                  >
                    Option {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(isGuest ? USER_VISIBLE_LABELS : ROW_LABELS).map(([key, label], rowIdx) => {
                const isBlue = isGuest ? USER_BLUE_KEYS.has(key) : [19, 23, 36, 40].includes(rowIdx + 1);
                const isGreen = isGuest ? USER_GREEN_KEYS.has(key) : [1, 4, 5, 6].includes(rowIdx + 1);
                const isDiff = TEXT_FIELDS.has(key) && rows.length > 1 &&
                  new Set(rows.map(r => String(r[key] ?? ""))).size > 1;
                const rowBg = isBlue ? "bg-blue-100 dark:bg-blue-900/40" : isGreen ? "bg-green-100 dark:bg-green-900/40" : isDiff ? "bg-yellow-50 dark:bg-yellow-900/20" : "";
                const rowText = isBlue ? "text-blue-800 dark:text-blue-200 font-bold" : isGreen ? "text-green-900 dark:text-green-200" : "";
                return (
                <tr key={key} className={rowBg}>
                  <td className={`py-1.5 px-2 text-center text-xs sticky left-0 z-10 w-10 ${rowBg} ${rowText || "text-muted-foreground"}`}>
                    {rowIdx + 1}
                  </td>
                  <td className={`col-sep py-1.5 px-3 font-medium sticky left-10 z-10 whitespace-nowrap ${rowBg || "bg-background"} ${rowText}`}>
                    {label}
                  </td>
                  {rows.map((row, i) => {
                    const cellDiff = isDiff && String(row[key] ?? "") !== String(rows[0][key] ?? "");
                    const rawVal = (isGuest && key === "est_sales_b" && label === "Cost")
                      ? getCostValue(row)
                      : row[key];
                    return (
                      <td
                        key={i}
                        className={`py-1.5 px-3 text-center cursor-pointer hover:bg-accent ${rowText}
                          ${selectedCol === i ? "bg-primary/10" : cellDiff ? "bg-yellow-200 dark:bg-yellow-700/50" : ""}`}
                        onClick={() => setSelectedCol(i)}
                        onDoubleClick={() => { setSelectedCol(i); setActionOpen(true); }}
                      >
                        {MONEY_FIELDS.has(key) ? fmtInr(rawVal as number) : String(rawVal ?? "")}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

{approvalItem && (
        <SubmitApprovalDialog open={!!approvalItem} item={approvalItem} onClose={() => setApprovalItem(null)} />
      )}

      <Dialog open={pwDialogOpen} onOpenChange={(o) => { if (!o) { setPwDialogOpen(false); setPwValue(""); setPendingSaveIdx(null); setPendingDeactivateIdx(null); setPwMode("save"); } }}>
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pwMode === "deactivate" ? "Confirm Deactivation" : "Confirm Password"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <p className="text-sm text-muted-foreground">
              {pwMode === "deactivate"
                ? `Enter your password to deactivate Option ${pendingDeactivateIdx !== null ? pendingDeactivateIdx + 1 : ""} from the database.`
                : `Enter your password to save Option ${pendingSaveIdx !== null ? pendingSaveIdx + 1 : ""} to the database.`}
            </p>
            <Input
              type="password"
              placeholder="Password"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePwConfirm()}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setPwDialogOpen(false); setPwValue(""); setPendingSaveIdx(null); setPendingDeactivateIdx(null); setPwMode("save"); }}>Cancel</Button>
            <Button
              variant={pwMode === "deactivate" ? "destructive" : "default"}
              onClick={handlePwConfirm}
              disabled={!pwValue || pwPending || saveFbMut.isPending || deactivateFbMut.isPending}
            >
              {pwPending || saveFbMut.isPending || deactivateFbMut.isPending
                ? (pwMode === "deactivate" ? "Deactivating…" : "Saving…")
                : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={actionOpen} onOpenChange={setActionOpen}>
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Option {selectedCol !== null ? selectedCol + 1 : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            {fromSizing && selectedCol !== null && (
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={async () => {
                  const row = rows[selectedCol];
                  if (!row) return;
                  localStorage.setItem("sizing_selected_costing", JSON.stringify({
                    partcode: row.partcode,
                    total_cost: isGuest ? getCostValue(row) : (Number(row.total_cost) || 0),
                    battery_pack: row.battery_pack,
                    duration: row.duration,
                    cell_type: row.cell_type,
                    centre_tap: row.centre_tap,
                    kw_calculation: Number(row.kw_calculation) || 0,
                  }));
                  // restore costing table to pre-preview state
                  const backup = localStorage.getItem("costing_preview_backup");
                  if (backup) {
                    try {
                      await api.post("/api/costing/tree/bulk-restore", JSON.parse(backup));
                      localStorage.removeItem("costing_preview_backup");
                      qc.invalidateQueries({ queryKey: ["costing-tree"] });
                    } catch {}
                  }
                  router.push(backUrl);
                }}
              >
                Select Costing
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setActionOpen(false);
                const sizingQs = fromSizing ? `&from=sizing&back=${encodeURIComponent(backUrl)}` : "";
                router.push(`/dashboard/costing/new?edit=${selectedCol}${sizingQs}`);
              }}
            >
              Edit Option
            </Button>
            <Button
              variant="outline"
              onClick={() => selectedCol !== null && duplicateMut.mutate(selectedCol)}
              disabled={duplicateMut.isPending}
            >
              Duplicate Option
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedCol !== null && deleteMut.mutate(selectedCol)}
              disabled={deleteMut.isPending}
            >
              Delete Option
            </Button>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
