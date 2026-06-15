"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api , apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ── types ─────────────────────────────────────────────────────────────────────

interface AppRecord {
  id: string;
  type: "sizing" | "costing" | "quotation";
  name: string;
  customer: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  template_version: string;
  data: any;
}

interface Group {
  id: string;
  name: string;
  description: string;
  record_ids: string[];
}

const TYPE_LABELS: Record<string, string> = {
  sizing: "Sizing", costing: "Costing", quotation: "Quotation",
};
const TYPE_COLORS: Record<string, string> = {
  sizing:    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  costing:   "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  quotation: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function getSolutionProvider(rec: AppRecord): string {
  if (rec.type === "sizing")
    return rec.data?.form?.solution_provider ?? rec.data?.forms?.[0]?.solution_provider ?? "";
  if (rec.type === "quotation")
    return rec.data?.meta?.solution_provider ?? "";
  return "";
}

// ── detail sub-components ─────────────────────────────────────────────────────

function SizingFormRows({ form }: { form: any }) {
  const rows: [string, string][] = [
    ["Customer Name", form.customer_name],
    ["Solution Provider", form.solution_provider],
    ["UPS Make", form.ups_make],
    ["UPS Model", form.ups_model],
    ["UPS Rating (KVA)", form.ups_rating_kva],
    ["Actual Load (KVA)", form.actual_load_kva],
    ["Actual Load (kW)", form.actual_load_kw],
    ["Power Factor", form.power_factor],
    ["Inverter Efficiency", form.inverter_efficiency],
    ["Nominal DC Voltage (V)", form.nominal_dc_voltage],
    ["Backup Requirement (Min)", form.backup_requirement_min],
    ["Cell Chemistry", form.cell_chemistry],
    ["Offered Battery Config", form.offered_battery_config],
    ["──outputs──", ""],
    ["Calculated Load (kW)", form.calculated_load_kw],
    ["Number of Cells", form.number_of_cells],
    ["Energy Required (kWh)", form.energy_required_kwh],
    ["Capacity Required (Ah)", form.capacity_required_ah],
    ["Backup Time (Min)", form.backup_time_min],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
      {rows.map(([label, val]) =>
        label.startsWith("──") ? (
          <div key={label} className="col-span-2 border-t my-2 pt-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Calculated Outputs
          </div>
        ) : (
          <div key={label} className="contents">
            <span className="text-muted-foreground py-0.5">{label}</span>
            <span className="font-medium py-0.5">{val ?? "—"}</span>
          </div>
        )
      )}
    </div>
  );
}

function SizingDetail({ data }: { data: any }) {
  const forms: any[] = data?.forms ?? (data?.form ? [data.form] : []);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold">Project: {data?.project_name ?? "—"}</p>
      {forms.map((form, i) => (
        <div key={i} className="border rounded p-3">
          {forms.length > 1 && (
            <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
              Sizing {i + 1}
            </p>
          )}
          <SizingFormRows form={form} />
        </div>
      ))}
    </div>
  );
}

function CostingDetail({ data }: { data: any }) {
  const rows: any[] = data?.rows ?? [];
  if (!rows.length) return <p className="text-sm text-muted-foreground">No rows saved.</p>;
  const COLS: [string, string][] = [
    ["duration","Duration"],["battery_pack","Battery Pack"],["voltage","Voltage"],
    ["ampere_capacity","Ah"],["kw_calculation","kW"],["total_cells","Cells"],
    ["total_cost_of_pack","Cost (A)"],["estimated_sales_cost_b","Sales (B)"],
  ];
  return (
    <div className="overflow-auto">
      <table className="table-grid text-xs w-full">
        <thead>
          <tr className="bg-muted">
            {COLS.map(([,l]) => <th key={l} className="text-left py-1.5 px-2 font-semibold whitespace-nowrap">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/40">
              {COLS.map(([k,l]) => <td key={l} className="py-1 px-2 whitespace-nowrap">{row[k] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuotationDetail({ data }: { data: any }) {
  const meta = data?.meta ?? {};
  const items: any[] = data?.items ?? [];
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 border rounded-md p-3">
        <span className="text-muted-foreground">Code</span><span className="font-medium">{meta.code}</span>
        <span className="text-muted-foreground">Date</span><span className="font-medium">{meta.date}</span>
        <span className="text-muted-foreground">Customer</span><span className="font-medium">{meta.customer_name}</span>
        <span className="text-muted-foreground">Solution Provider</span><span className="font-medium">{meta.solution_provider}</span>
        <span className="text-muted-foreground">Format</span><span className="font-medium">{meta.format_name}</span>
      </div>
      {!items.length ? <p className="text-muted-foreground">No items.</p> : (
        <div className="overflow-auto">
          <table className="table-grid text-xs w-full">
            <thead>
              <tr className="bg-muted">
                {["Sr","Sol","UPS Rating","Backup","Load(kW)","Cell Type","Part Code","Qty","Price","Rack"].map(h => (
                  <th key={h} className="text-left py-1.5 px-2 font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="hover:bg-muted/40">
                  <td className="py-1 px-2">{item.sr_no}</td>
                  <td className="py-1 px-2">{item.sol_no}</td>
                  <td className="py-1 px-2 whitespace-nowrap">{item.ups_rating}</td>
                  <td className="py-1 px-2 whitespace-nowrap">{item.backup_requirement}</td>
                  <td className="py-1 px-2">{item.calc_load}</td>
                  <td className="py-1 px-2">{item.celltype}</td>
                  <td className="py-1 px-2">{item.batterypartcode}</td>
                  <td className="py-1 px-2">{item.quantity}</td>
                  <td className="py-1 px-2">{item.quote_price}</td>
                  <td className="py-1 px-2">{item.modular_rack !== "-" ? item.modular_rack : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecordDetailModal({ record, onClose }: { record: AppRecord | null; onClose: () => void }) {
  if (!record) return null;
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${TYPE_COLORS[record.type]}`}>
              {TYPE_LABELS[record.type]}
            </span>
            {record.name}
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-3">
          By {record.created_by} · {fmtDate(record.created_at)}
          {record.updated_at !== record.created_at && ` · Updated ${fmtDate(record.updated_at)}`}
          {" · "}Template v{record.template_version}
        </div>
        {record.type === "sizing"    && <SizingDetail data={record.data} />}
        {record.type === "costing"   && <CostingDetail data={record.data} />}
        {record.type === "quotation" && <QuotationDetail data={record.data} />}
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function RecordsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [filter, setFilter] = useState<"all" | "sizing" | "costing" | "quotation">("all");
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchProvider, setSearchProvider] = useState("");
  const [searchCreatedBy, setSearchCreatedBy] = useState("");
  const [searchDay, setSearchDay] = useState("");
  const [searchMonth, setSearchMonth] = useState("");
  const [searchYear, setSearchYear] = useState("");
  const [searchHour, setSearchHour] = useState("");
  const [viewRecord, setViewRecord] = useState<AppRecord | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [assignRecord, setAssignRecord] = useState<AppRecord | null>(null);

  const { data: records = [], isLoading } = useQuery<AppRecord[]>({
    queryKey: ["records"],
    queryFn: () => api.get("/api/records").then((r) => r.data),
  });

  const { data: groups = [] } = useQuery<Group[]>({
    queryKey: ["groups"],
    queryFn: () => api.get("/api/groups").then((r) => r.data),
    enabled: !!assignRecord,
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/records/${id}`),
    onSuccess: () => {
      toast.success("Record deleted");
      qc.invalidateQueries({ queryKey: ["records"] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const addToGroupMut = useMutation({
    mutationFn: ({ groupId, recordId }: { groupId: string; recordId: string }) =>
      api.post(`/api/groups/${groupId}/add-record`, { record_id: recordId }),
    onSuccess: () => {
      toast.success("Added to group");
      qc.invalidateQueries({ queryKey: ["groups"] });
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const handleRestore = async (record: AppRecord) => {
    setRestoring(record.id);
    try {
      if (record.type === "sizing") {
        const { project_name, form, forms } = record.data;
        if (forms && forms.length > 0) {
          const res = await api.post("/api/sizing/restore", { project_name, forms });
          const dest = res.data.project ?? project_name;
          qc.invalidateQueries({ queryKey: ["sizing-projects"] });
          toast.success(`Restored ${forms.length} sizing(s) → ${dest}`);
          router.push(`/dashboard/sizing/${encodeURIComponent(dest)}`);
        } else {
          const res = await api.post("/api/sizing/restore", { project_name, data: form });
          const dest = res.data.project ?? project_name;
          qc.invalidateQueries({ queryKey: ["sizing-projects"] });
          toast.success(`Restored → ${dest} Sr. ${res.data.sr_no}`);
          router.push(`/dashboard/sizing/${encodeURIComponent(dest)}/${res.data.sr_no}`);
        }
      } else if (record.type === "costing") {
        await api.post("/api/costing/tree/bulk-restore", record.data.rows);
        qc.invalidateQueries({ queryKey: ["costing-tree"] });
        toast.success("Costing table restored");
        router.push("/dashboard/costing");
      } else if (record.type === "quotation") {
        const res = await api.post("/api/quotation/restore", { meta: record.data.meta, items: record.data.items });
        qc.invalidateQueries({ queryKey: ["quotes"] });
        toast.success(`Restored → quote ${res.data.code}`);
        router.push(`/dashboard/quote/${encodeURIComponent(res.data.code)}`);
      }
    } catch (e: any) {
      toast.error(apiErr(e, "Restore failed"));
    } finally {
      setRestoring(null);
    }
  };

  const hasSearch = searchCustomer || searchProvider || searchCreatedBy || searchDay || searchMonth || searchYear || searchHour;

  const filtered = records.filter((rec) => {
    if (filter !== "all" && rec.type !== filter) return false;
    const d = new Date(rec.created_at);
    if (searchCustomer && !rec.customer?.toLowerCase().includes(searchCustomer.toLowerCase())) return false;
    if (searchProvider && !getSolutionProvider(rec).toLowerCase().includes(searchProvider.toLowerCase())) return false;
    if (searchCreatedBy && !rec.created_by?.toLowerCase().includes(searchCreatedBy.toLowerCase())) return false;
    if (searchDay && d.getDate() !== parseInt(searchDay)) return false;
    if (searchMonth && (d.getMonth() + 1) !== parseInt(searchMonth)) return false;
    if (searchYear && d.getFullYear() !== parseInt(searchYear)) return false;
    if (searchHour && d.getHours() !== parseInt(searchHour)) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-full p-5 gap-4">

      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Records</h1>
        <div className="flex gap-2 ml-auto">
          {(["all", "sizing", "costing", "quotation"] as const).map((t) => (
            <Button key={t} size="sm" variant={filter === t ? "default" : "outline"} onClick={() => setFilter(t)}>
              {t === "all" ? "All" : TYPE_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>

      {/* Search panel */}
      <div className="border rounded-md p-3 flex flex-wrap gap-3 items-end bg-muted/30">
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Customer Name</Label>
          <Input className="h-8 text-sm" placeholder="Search…" value={searchCustomer} onChange={(e) => setSearchCustomer(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Solution Provider</Label>
          <Input className="h-8 text-sm" placeholder="Search…" value={searchProvider} onChange={(e) => setSearchProvider(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Created By</Label>
          <Input className="h-8 text-sm" placeholder="Username…" value={searchCreatedBy} onChange={(e) => setSearchCreatedBy(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 w-14">
          <Label className="text-xs text-muted-foreground">Day</Label>
          <Input className="h-8 text-sm" type="number" min="1" max="31" placeholder="DD" value={searchDay} onChange={(e) => setSearchDay(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 w-16">
          <Label className="text-xs text-muted-foreground">Month</Label>
          <Input className="h-8 text-sm" type="number" min="1" max="12" placeholder="MM" value={searchMonth} onChange={(e) => setSearchMonth(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 w-20">
          <Label className="text-xs text-muted-foreground">Year</Label>
          <Input className="h-8 text-sm" type="number" min="2000" max="2100" placeholder="YYYY" value={searchYear} onChange={(e) => setSearchYear(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 w-16">
          <Label className="text-xs text-muted-foreground">Hour (0–23)</Label>
          <Input className="h-8 text-sm" type="number" min="0" max="23" placeholder="HH" value={searchHour} onChange={(e) => setSearchHour(e.target.value)} />
        </div>
        {hasSearch && (
          <Button size="sm" variant="ghost" className="h-8" onClick={() => {
            setSearchCustomer(""); setSearchProvider(""); setSearchCreatedBy("");
            setSearchDay(""); setSearchMonth(""); setSearchYear(""); setSearchHour("");
          }}>Clear</Button>
        )}
        {hasSearch && (
          <span className="text-xs text-muted-foreground self-end pb-1">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No records yet. Records are saved automatically when you export from Sizing, Costing, or Quotation.
        </p>
      )}

      <div className="flex flex-col gap-2 overflow-auto">
        {filtered.map((rec) => (
          <div key={rec.id} className="border rounded-md p-3 flex items-start gap-3 bg-card">
            <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 mt-0.5 ${TYPE_COLORS[rec.type] ?? ""}`}>
              {TYPE_LABELS[rec.type] ?? rec.type}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{rec.name}</p>
              {rec.customer && <p className="text-xs text-muted-foreground truncate">{rec.customer}</p>}
              <p className="text-xs text-muted-foreground mt-0.5">
                {rec.created_by} · {fmtDate(rec.created_at)}
              </p>
            </div>
            <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
              <Button size="sm" variant="outline" onClick={() => setViewRecord(rec)}>View</Button>
              <Button size="sm" variant="outline" disabled={restoring === rec.id} onClick={() => handleRestore(rec)}>
                {restoring === rec.id ? "…" : "Restore"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAssignRecord(rec)}>Add to Group</Button>
              <Button size="sm" variant="destructive" onClick={() => setDeleteId(rec.id)}>Delete</Button>
            </div>
          </div>
        ))}
      </div>

      {/* View modal */}
      <RecordDetailModal record={viewRecord} onClose={() => setViewRecord(null)} />

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Record?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Permanently removes this record from Firebase. Cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMut.isPending}
              onClick={() => deleteId && deleteMut.mutate(deleteId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to group */}
      <Dialog open={!!assignRecord} onOpenChange={() => setAssignRecord(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to Group</DialogTitle></DialogHeader>
          <p className="text-sm font-medium mb-2 truncate">{assignRecord?.name}</p>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No groups yet. Create one in the Groups page first.</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {groups.map((grp) => {
                const alreadyIn = (grp.record_ids ?? []).includes(assignRecord?.id ?? "");
                return (
                  <div key={grp.id} className="flex items-center justify-between border rounded-md p-2.5">
                    <p className="text-sm font-medium">{grp.name}</p>
                    <Button size="sm" variant={alreadyIn ? "secondary" : "outline"}
                      disabled={alreadyIn || addToGroupMut.isPending}
                      onClick={() => assignRecord && addToGroupMut.mutate({ groupId: grp.id, recordId: assignRecord.id })}>
                      {alreadyIn ? "Added" : "Add"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignRecord(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

