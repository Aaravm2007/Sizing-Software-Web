"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import SubmitApprovalDialog, { type ApprovalItem } from "@/components/SubmitApprovalDialog";
import { getPendingAction, clearPendingAction } from "@/lib/approval-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Download, X } from "lucide-react";
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

  const [selected, setSelected] = useState<number | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<"all" | "selected">("all");
  const [exportFormat, setExportFormat] = useState<"excel" | "pdf">("excel");
const [approvalItem, setApprovalItem] = useState<ApprovalItem | null>(null);

  const [pendingAction, setPendingActionState] = useState(() => getPendingAction());
  const pendingForMe = pendingAction?.type === "sizing" ? pendingAction : null;

  const qKey = ["sizings", projectName];

  const { data: sizings = [], isLoading } = useQuery<SizingRow[]>({
    queryKey: qKey,
    queryFn: () =>
      api.get(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings`).then((r) => r.data),
  });

  const addMut = useMutation({
    mutationFn: () =>
      api.post(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings`, {}),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: qKey });
      // navigate to new sizing — backend returns new sr_no via list refresh
      qc.invalidateQueries({ queryKey: qKey }).then(() => {});
    },
    onError: (e: any) => toast.error(apiErr(e, "Add failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (sr: number) =>
      api.delete(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${sr}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      setSelected(null);
    },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const dupMut = useMutation({
    mutationFn: (sr: number) =>
      api.post(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${sr}/duplicate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (e: any) => toast.error(apiErr(e, "Duplicate failed")),
  });

  const handleAdd = async () => {
    if (addingRow) return;
    setAddingRow(true);
    try {
      const res = await api.post(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings`, {});
      qc.invalidateQueries({ queryKey: qKey });
      const newSr = res.data.sr_no;
      if (newSr != null) {
        router.push(`/dashboard/sizing/${encodeURIComponent(projectName)}/${newSr}`);
      }
    } catch (e: any) {
      toast.error(apiErr(e, "Add failed"));
      setAddingRow(false);
    }
  };

  const handleExport = () => {
    const sr = exportScope === "selected" ? selected : null;
    const srParam = sr != null ? `?sr_no=${sr}` : "";
    const endpoint = `/api/sizing/projects/${encodeURIComponent(projectName)}/export/${exportFormat}${srParam}`;
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

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => router.push("/dashboard/sizing")}>
          ← Back
        </Button>
        <h1 className="text-2xl font-bold">{projectName}</h1>
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
                sizings.map((s) => api.get(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${s.sr_no}`).then((r) => r.data).catch(() => null))
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
                  router.push(`/dashboard/sizing/${encodeURIComponent(projectName)}/${s.sr_no}`)
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
        <DialogContent className="sm:max-w-xs">
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
                  const r = await api.get(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${sr}`);
                  const row = sizings.find((s) => s.sr_no === sr);
                  name = `${projectName} — Sr. ${sr}${row?.offered_battery_config ? ` (${row.offered_battery_config})` : ""}`;
                  data = { project_name: projectName, form: r.data };
                } else {
                  const forms = (await Promise.all(
                    sizings.map((s) => api.get(`/api/sizing/projects/${encodeURIComponent(projectName)}/sizings/${s.sr_no}`).then((r) => r.data).catch(() => null))
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
    </div>
  );
}
