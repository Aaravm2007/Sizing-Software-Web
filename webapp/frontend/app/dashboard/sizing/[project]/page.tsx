"use client";

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import SubmitApprovalDialog, { type ApprovalItem } from "@/components/SubmitApprovalDialog";
import { PendingLinkDialog } from "@/components/pending-link-dialog";
import { getPendingAction, clearPendingAction } from "@/lib/approval-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Download, Link2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface SizingRow {
  sr_no: number;
  offered_battery_config: string;
}

export default function SizingListPage() {
  const params = useParams();
  const projectName = decodeURIComponent(params.project as string);
  const router = useRouter();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const owner = searchParams.get("owner") || "";
  const ownerQS = owner ? `owner=${encodeURIComponent(owner)}` : "";
  const withOwner = (url: string) => owner ? `${url}${url.includes("?") ? "&" : "?"}${ownerQS}` : url;
  const withOwnerLink = (url: string) => owner ? `${url}?${ownerQS}` : url;

  const [selected, setSelected] = useState<number | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "selected">("all");
  const [exportFormat, setExportFormat] = useState<"excel" | "pdf">("excel");
  const [pendingLinkOpen, setPendingLinkOpen] = useState(false);
  const [pendingExportFn, setPendingExportFn] = useState<(() => void) | null>(null);
  const [pendingExportData, setPendingExportData] = useState<Record<string, string>>({ export_type: "sizing_excel" });
  const [pendingExportDataList, setPendingExportDataList] = useState<Record<string, string>[] | undefined>(undefined);
  const [directLinkOpen, setDirectLinkOpen] = useState(false);
  const [directLinkData, setDirectLinkData] = useState<Record<string, string>>({ export_type: "sizing_excel" });
const [approvalItem, setApprovalItem] = useState<ApprovalItem | null>(null);

  const [pendingAction, setPendingActionState] = useState(() => getPendingAction());
  const pendingForMe = pendingAction?.type === "sizing" ? pendingAction : null;

  const qKey = ["sizings", projectName, owner];

  const { data: sizings = [], isLoading } = useQuery<SizingRow[]>({
    queryKey: qKey,
    queryFn: () =>
      api.get(withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings`)).then((r) => r.data),
  });

  const addMut = useMutation({
    mutationFn: () =>
      api.post(withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings`), {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qKey });
      // navigate to new sizing — backend returns new sr_no via list refresh
      qc.invalidateQueries({ queryKey: qKey }).then(() => {});
    },
    onError: (e: any) => toast.error(apiErr(e, "Add failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (sr: number) =>
      api.delete(withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${sr}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      setSelected(null);
    },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const dupMut = useMutation({
    mutationFn: (sr: number) =>
      api.post(withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${sr}/duplicate`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (e: any) => toast.error(apiErr(e, "Duplicate failed")),
  });

  const handleAdd = async () => {
    if (addingRow) return;
    setAddingRow(true);
    try {
      const res = await api.post(withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings`), {});
      qc.invalidateQueries({ queryKey: qKey });
      const newSr = res.data.sr_no;
      if (newSr != null) {
        qc.removeQueries({ queryKey: ["sizing", projectName, newSr, owner] });
        router.push(withOwnerLink(`/dashboard/sizing/${encodeURIComponent(projectName)}/${newSr}`));
      }
    } catch (e: any) {
      toast.error(apiErr(e, "Add failed"));
      setAddingRow(false);
    }
  };

  const doExport = () => {
    const sr = exportScope === "selected" ? selected : null;
    const srParam = sr != null ? `?sr_no=${sr}` : "";
    const endpoint = withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/export/${exportFormat}${srParam}`);
    api.get(endpoint, { responseType: "blob" }).then((res) => {
      const ext = exportFormat === "excel" ? "xlsx" : "pdf";
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectName}_sizing.${ext}`;
      a.click();
      window.URL.revokeObjectURL(url);
      setExportOpen(false);
    }).catch((e) => toast.error(apiErr(e, "Export failed")));
  };

  const _rowToExportData = (row: any, fmt: string): Record<string, string> => ({
    export_type: `sizing_${fmt}`,
    ups_make: String(row.ups_make ?? ""),
    ups_model: String(row.ups_model ?? ""),
    ups_kva: String(row.ups_rating_kva ?? ""),
    actual_load_kva: String(row.actual_load_kva ?? ""),
    load_kw: String(row.actual_load_kw ?? ""),
    power_factor: String(row.power_factor ?? ""),
    inverter_efficiency: String(row.inverter_efficiency ?? ""),
    dc_voltage: String(row.nominal_dc_voltage ?? ""),
    backup_min: String(row.backup_requirement_min ?? ""),
    cell_chemistry: String(row.cell_chemistry ?? ""),
    ageing_pct: String(row.ageing_percent ?? ""),
    design_margin_pct: String(row.design_margin_percent ?? ""),
    dod_margin_pct: String(row.dod_margin_percent ?? ""),
    derating_pct: String(row.derating_factor_percent ?? ""),
    capacity_ah: String(row.nearest_capacity_ah ?? ""),
    ageing_type: String(row.ageing_type ?? ""),
    backup_time_min: String(row.backup_time_min ?? ""),
    solution_provider: String(row.solution_provider ?? ""),
    project_customer: String(row.customer_name ?? ""),
  });

  const handleExport = async () => {
    setExportOpen(false);
    if (exportScope === "selected" && selected != null) {
      try {
        const row = await api.get(
          withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${selected}`)
        ).then((r) => r.data);
        setPendingExportData(_rowToExportData(row, exportFormat));
      } catch {
        setPendingExportData({ export_type: `sizing_${exportFormat}` });
      }
      setPendingExportDataList(undefined);
    } else {
      // Export All — fetch every sizing and build one entry per sizing
      try {
        const rows = await Promise.all(
          sizings.map((s) =>
            api.get(withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${s.sr_no}`))
              .then((r) => r.data).catch(() => null)
          )
        );
        const list = rows.filter(Boolean).map((r) => _rowToExportData(r, exportFormat));
        setPendingExportDataList(list.length > 0 ? list : undefined);
        setPendingExportData(list[0] ?? { export_type: `sizing_${exportFormat}` });
      } catch {
        setPendingExportData({ export_type: `sizing_${exportFormat}` });
        setPendingExportDataList(undefined);
      }
    }
    setPendingExportFn(() => doExport);
    setPendingLinkOpen(true);
  };

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => router.push("/dashboard/sizing")}>
          ← Back
        </Button>
        <h1 className="text-2xl font-bold">{projectName}</h1>
        {owner && (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
            Viewing {owner}&apos;s project
          </span>
        )}
      </div>

      {pendingForMe && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-md px-4 py-2 flex items-center gap-3 text-sm">
          <span className="flex-1">
            <span className="font-semibold">Approval action pending:</span>{" "}
            {pendingForMe.action === "revise" ? "Revise" : "Re-submit"} for{" "}
            <span className="font-medium">"{pendingForMe.ticket_name}"</span>.
            Make your changes, then click Submit below.
          </span>
          <Button size="sm" onClick={async () => {
            try {
              const forms = (await Promise.all(
                sizings.map((s) => api.get(withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${s.sr_no}`)).then((r) => r.data).catch(() => null))
              )).filter(Boolean);
              const data = { project_name: projectName, forms };
              const endpoint = `/api/approvals/${pendingForMe.ticket_id}/${pendingForMe.action === "revise" ? "revise" : "resubmit"}`;
              await api.post(endpoint, { data, message: "" });
              clearPendingAction();
              setPendingActionState(null);
              toast.success(pendingForMe.action === "revise" ? "Revision submitted" : "Re-submitted for approval");
            } catch (e: any) { toast.error(apiErr(e, "Failed")); }
          }}>
            Submit {pendingForMe.action === "revise" ? "Revision" : "Update"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { clearPendingAction(); setPendingActionState(null); }}>
            Cancel
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-auto border rounded-md">
        <table className="table-grid w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-center py-2 px-4 w-24">Sr. No</th>
              <th className="text-center py-2 px-4">Offered Battery Configuration</th>
              <th className="text-center py-2 px-4 w-52">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={3} className="text-center py-8 text-muted-foreground">Loading…</td>
              </tr>
            )}
            {!isLoading && sizings.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center py-8 text-muted-foreground">No sizings yet</td>
              </tr>
            )}
            {sizings.map((s) => (
              <tr
                key={s.sr_no}
                className={`cursor-pointer hover:bg-accent ${selected === s.sr_no ? "bg-primary/20" : ""}`}
                onClick={() => setSelected(s.sr_no)}
                onDoubleClick={() =>
                  router.push(withOwnerLink(`/dashboard/sizing/${encodeURIComponent(projectName)}/${s.sr_no}`))
                }
              >
                <td className="text-center py-2 px-4">{s.sr_no}</td>
                <td className="text-center py-2 px-4">{s.offered_battery_config || "—"}</td>
                <td className="text-center py-1 px-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 justify-center">
                    <Button size="icon" variant="outline" title="Duplicate"
                      disabled={dupMut.isPending}
                      onClick={() => dupMut.mutate(s.sr_no)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" title="Export"
                      onClick={() => { setSelected(s.sr_no); setExportScope("selected"); setExportOpen(true); }}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="destructive" title="Delete"
                      disabled={deleteMut.isPending}
                      onClick={() => deleteMut.mutate(s.sr_no)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleAdd} disabled={addingRow}>{addingRow ? "Adding…" : "Add Sizing"}</Button>
        <Button variant="outline" onClick={() => { setExportScope("all"); setExportOpen(true); }}>
          Export All
        </Button>
        <Button
          variant="outline"
          disabled={!selected}
          onClick={async () => {
            if (!selected) return;
            const row = sizings.find((s) => s.sr_no === selected);
            try {
              const data = await api.get(
                withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${selected}`)
              ).then((r) => r.data);
              setDirectLinkData({
                export_type: "sizing_excel",
                ups_make: String(data.ups_make ?? ""),
                ups_model: String(data.ups_model ?? ""),
                ups_kva: String(data.ups_rating_kva ?? ""),
                actual_load_kva: String(data.actual_load_kva ?? ""),
                load_kw: String(data.actual_load_kw ?? ""),
                power_factor: String(data.power_factor ?? ""),
                inverter_efficiency: String(data.inverter_efficiency ?? ""),
                dc_voltage: String(data.nominal_dc_voltage ?? ""),
                backup_min: String(data.backup_requirement_min ?? ""),
                cell_chemistry: String(data.cell_chemistry ?? ""),
                ageing_pct: String(data.ageing_percent ?? ""),
                design_margin_pct: String(data.design_margin_percent ?? ""),
                dod_margin_pct: String(data.dod_margin_percent ?? ""),
                derating_pct: String(data.derating_factor_percent ?? ""),
                capacity_ah: String(data.nearest_capacity_ah ?? ""),
                ageing_type: String(data.ageing_type ?? ""),
                backup_time_min: String(data.backup_time_min ?? ""),
              });
              setDirectLinkOpen(true);
            } catch { toast.error("Failed to load sizing data"); }
          }}
        >
          <Link2 size={14} />
          Link {sizings.find((s) => s.sr_no === selected)?.offered_battery_config
            ? `"${sizings.find((s) => s.sr_no === selected)!.offered_battery_config}" `
            : ""}to Pending
        </Button>
        <Button
          variant="outline"
          disabled={!selected}
          onClick={() => {
            const config = sizings.find((s) => s.sr_no === selected)?.offered_battery_config ?? "";
            router.push(`/dashboard/gad?q=${encodeURIComponent(config)}`);
          }}
        >
          Download GAD
        </Button>
        <Button
          variant="outline"
          disabled={!selected}
          onClick={() => {
            const config = sizings.find((s) => s.sr_no === selected)?.offered_battery_config ?? "";
            router.push(`/dashboard/datasheet?q=${encodeURIComponent(config)}`);
          }}
        >
          Download Datasheet
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push("/dashboard/costing")}
        >
          Continue to Costing
        </Button>
      </div>

{approvalItem && (
        <SubmitApprovalDialog
          open={!!approvalItem}
          item={approvalItem}
          onClose={() => setApprovalItem(null)}
        />
      )}

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-xs max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export Sizing</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>Scope</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    value="all"
                    checked={exportScope === "all"}
                    onChange={() => setExportScope("all")}
                  />
                  All
                </label>
                <label className={`flex items-center gap-1 ${!selected ? "opacity-50" : "cursor-pointer"}`}>
                  <input
                    type="radio"
                    name="scope"
                    value="selected"
                    disabled={!selected}
                    checked={exportScope === "selected"}
                    onChange={() => setExportScope("selected")}
                  />
                  Selected ({selected ?? "none"})
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Format</Label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value="excel"
                    checked={exportFormat === "excel"}
                    onChange={() => setExportFormat("excel")}
                  />
                  Excel
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value="pdf"
                    checked={exportFormat === "pdf"}
                    onChange={() => setExportFormat("pdf")}
                  />
                  PDF
                </label>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={handleExport} className="w-full">Export</Button>
            <Button variant="outline" className="w-full" onClick={async () => {
              const sr = exportScope === "selected" ? selected : null;
              try {
                let name: string; let data: any;
                if (sr != null) {
                  const r = await api.get(withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${sr}`));
                  const row = sizings.find((s) => s.sr_no === sr);
                  name = `${projectName} — Sr. ${sr}${row?.offered_battery_config ? ` (${row.offered_battery_config})` : ""}`;
                  data = { project_name: projectName, form: r.data };
                } else {
                  const forms = (await Promise.all(
                    sizings.map((s) => api.get(withOwner(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${s.sr_no}`)).then((r) => r.data).catch(() => null))
                  )).filter(Boolean);
                  name = `${projectName} — All (${forms.length} sizing${forms.length !== 1 ? "s" : ""})`;
                  data = { project_name: projectName, forms };
                }
                setExportOpen(false);
                setApprovalItem({ type: "sizing", name, data });
              } catch { toast.error("Failed to collect sizing data"); }
            }}>Submit for Approval</Button>
            <Button variant="ghost" className="w-full" onClick={() => setExportOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PendingLinkDialog
        open={pendingLinkOpen}
        exportLabel={`Sizing: ${projectName} (${exportFormat})`}
        exportData={pendingExportData}
        exportDataList={pendingExportDataList}
        onClose={() => { setPendingLinkOpen(false); setPendingExportDataList(undefined); }}
        onDone={() => { if (pendingExportFn) pendingExportFn(); setPendingExportFn(null); setPendingExportDataList(undefined); }}
      />

      <PendingLinkDialog
        open={directLinkOpen}
        exportLabel={`${sizings.find((s) => s.sr_no === selected)?.offered_battery_config || `Sr. ${selected}`} — ${projectName}`}
        exportData={directLinkData}
        actionLabel="Link to Pending"
        onClose={() => setDirectLinkOpen(false)}
        onDone={() => { setDirectLinkOpen(false); toast.success("Sizing linked to pending item"); }}
      />
    </div>
  );
}
