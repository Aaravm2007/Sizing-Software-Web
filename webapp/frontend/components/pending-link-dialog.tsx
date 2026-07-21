"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

interface PendingRow {
  id: number;
  sr_no: number;
  inquiry_code: string;
  end_customer: string;
  priority: string;
  status: string;
  assigned_to: string;
}

interface ExportRow {
  id: number;
  export_type?: string;
  sol_no?: string;
  quote_code?: string;
  part_code?: string;
}

interface SolOption {
  sol_no: string;
  quote_code: string;
  part_code: string;
}

export interface PendingExportData {
  export_type?: string;
  ups_make?: string;
  ups_model?: string;
  ups_kva?: string;
  actual_load_kva?: string;
  load_kw?: string;
  power_factor?: string;
  inverter_efficiency?: string;
  dc_voltage?: string;
  backup_min?: string;
  cell_chemistry?: string;
  ageing_pct?: string;
  design_margin_pct?: string;
  dod_margin_pct?: string;
  derating_pct?: string;
  capacity_ah?: string;
  part_code?: string;
  cell_type?: string;
  ageing_type?: string;
  backup_time_min?: string;
  centre_tap?: string;
  quote_code?: string;
  qty_system?: string;
  rate_system?: string;
  price_system?: string;
  sales_person?: string;
  solution_provider?: string;
  project_customer?: string;
  rack_dim?: string;
  qty?: string;
  per_rack_price?: string;
  price?: string;
  rack1_dim?: string;
  rack1_qty?: string;
  rack1_rate?: string;
  rack1_price?: string;
  rack2_dim?: string;
  rack2_qty?: string;
  rack2_rate?: string;
  rack2_price?: string;
  custom_cost_desc?: string;
  custom_cost_price?: string;
  cc1_desc?: string;
  cc1_price?: string;
  cc2_desc?: string;
  cc2_price?: string;
  cc3_desc?: string;
  cc3_price?: string;
  cc4_desc?: string;
  cc4_price?: string;
  cc5_desc?: string;
  cc5_price?: string;
  submission_date?: string;
  submitted_to?: string;
  datasheet_name?: string;
  gad_name?: string;
  remarks?: string;
}

interface Props {
  open: boolean;
  exportLabel: string;
  exportData: PendingExportData;
  exportDataList?: PendingExportData[]; // when set, logs one entry per item (bulk)
  onClose: () => void;
  onDone: () => void;
  actionLabel?: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent:      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  semi_urgent: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  relaxed:     "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent", semi_urgent: "Semi Urgent", relaxed: "Relaxed",
};

export function PendingLinkDialog({ open, exportLabel, exportData, exportDataList, onClose, onDone, actionLabel = "Link & Export" }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PendingRow | null>(null);
  const [solStep, setSolStep] = useState<{ pendingCode: string; exportId: number; options: SolOption[] } | null>(null);

  const { data: mine = [], isLoading } = useQuery<PendingRow[]>({
    queryKey: ["pending-mine-for-link"],
    queryFn: () => api.get("/api/pending/mine").then((r) => r.data),
    enabled: open,
  });

  const active = mine.filter((r) => r.status !== "completed");
  const filtered = search.trim()
    ? active.filter((r) =>
        r.inquiry_code?.toLowerCase().includes(search.toLowerCase()) ||
        r.end_customer?.toLowerCase().includes(search.toLowerCase())
      )
    : active;

  const isQuoteExport = exportData.export_type?.startsWith("quote_");
  const isBulkExport = !!exportDataList && exportDataList.length > 0;

  const linkMut = useMutation({
    mutationFn: (row: PendingRow) => {
      const pending_code = row.inquiry_code || String(row.sr_no);
      if (isQuoteExport) {
        return api.post("/api/pending/my-exports/from-quote", {
          pending_code,
          quote_code: exportData.quote_code ?? "",
          export_type: exportData.export_type,
        }).then((r) => ({ data: r.data, pending_code }));
      }
      if (isBulkExport) {
        return api.post("/api/pending/my-exports/bulk", {
          pending_code,
          exports: exportDataList,
        }).then((r) => ({ data: r.data, pending_code }));
      }
      return api.post("/api/pending/my-exports", {
        pending_code,
        ...exportData,
      }).then((r) => ({ data: r.data, pending_code }));
    },
    onSuccess: async ({ data, pending_code }) => {
      qc.invalidateQueries({ queryKey: ["pending-export-summary"] });

      if (!isQuoteExport && !isBulkExport && data?.id) {
        try {
          const exports: ExportRow[] = await api
            .get(`/api/pending/my-exports/${encodeURIComponent(pending_code)}`)
            .then((r) => r.data);
          const seen = new Set<string>();
          const options: SolOption[] = [];
          for (const e of exports) {
            if (!e.export_type?.startsWith("quote_") || !e.sol_no) continue;
            const key = `${e.quote_code}|${e.sol_no}`;
            if (seen.has(key)) continue;
            seen.add(key);
            options.push({ sol_no: String(e.sol_no), quote_code: String(e.quote_code || ""), part_code: String(e.part_code || "") });
          }
          if (options.length > 0) {
            setSolStep({ pendingCode: pending_code, exportId: data.id, options });
            return;
          }
        } catch {
          // fall through to normal completion
        }
      }

      onDone();
      handleClose();
    },
  });

  const solLinkMut = useMutation({
    mutationFn: (sol_no: string) => {
      if (!solStep) throw new Error("no export pending link");
      return api.patch("/api/pending/my-exports/link", {
        links: [{ pending_code: solStep.pendingCode, export_id: solStep.exportId, sol_no }],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pending-export-summary"] });
      setSolStep(null);
      onDone();
      handleClose();
    },
  });

  const handleIndependent = () => {
    setSolStep(null);
    onDone();
    handleClose();
  };

  const handleClose = () => {
    setSearch("");
    setSelected(null);
    setSolStep(null);
    onClose();
  };

  if (solStep) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Link this export to a solution?</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            Pick the solution this export belongs to, or mark it independent.
          </p>
          <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
            {solStep.options.map((o) => (
              <button
                key={`${o.quote_code}|${o.sol_no}`}
                type="button"
                disabled={solLinkMut.isPending}
                className="text-left px-3 py-2 rounded-md border border-transparent hover:bg-muted text-sm transition-colors"
                onClick={() => solLinkMut.mutate(o.sol_no)}
              >
                {o.quote_code ? `${o.quote_code} · ` : ""}Sol {o.sol_no}{o.part_code ? ` · ${o.part_code}` : ""}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full" disabled={solLinkMut.isPending} onClick={handleIndependent}>
              {solLinkMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Independent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Link to Pending Item?</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-1">
          Exporting <span className="font-medium text-foreground">{exportLabel}</span>.
          Select a pending item to record this export against it.
        </p>

        <Input
          placeholder="Search by inquiry code or customer…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
          className="h-8 text-xs"
        />

        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
          {isLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No active pending items assigned to you.
            </p>
          )}
          {filtered.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row)}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-md text-xs border transition-colors text-left",
                selected?.id === row.id
                  ? "border-primary bg-primary/5"
                  : "border-transparent hover:bg-muted"
              )}
            >
              <span className="font-medium truncate">
                {row.inquiry_code || `#${row.sr_no}`}
                {row.end_customer && (
                  <span className="ml-2 font-normal text-muted-foreground">{row.end_customer}</span>
                )}
              </span>
              <span className={cn(
                "ml-3 shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full",
                PRIORITY_STYLES[row.priority] ?? PRIORITY_STYLES.relaxed
              )}>
                {PRIORITY_LABELS[row.priority] ?? row.priority}
              </span>
            </button>
          ))}
        </div>

        <DialogFooter className="gap-2 flex-row">
          <Button
            className="flex-1"
            disabled={!selected || linkMut.isPending}
            onClick={() => selected && linkMut.mutate(selected)}
          >
            {linkMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
