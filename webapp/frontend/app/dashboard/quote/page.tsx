"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api , apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Copy, Download, X } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { PendingLinkDialog } from "@/components/pending-link-dialog";
import SubmitApprovalDialog, { type ApprovalItem } from "@/components/SubmitApprovalDialog";

interface Quote {
  code: string;
  date: string;
  customer_name: string;
  solution_provider: string;
  format: string;
  sales_person: string;
}

const FORMATS = [
  "High voltage",
  "Low voltage",
  "Extended Warranty High Voltage",
  "Extended Warranty Low Voltage",
  "Low & High Voltage Export",
];

export default function QuotePage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [newOpen, setNewOpen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // export flow
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportTargetCode, setExportTargetCode] = useState("");
  const [exportFmt, setExportFmt] = useState<"word" | "pdf">("word");
  const [pendingLinkOpen, setPendingLinkOpen] = useState(false);
  const [pendingExportData, setPendingExportData] = useState<Record<string, string>>({});
  const [approvalItem, setApprovalItem] = useState<ApprovalItem | null>(null);

  // New quote form state
  const [nCode, setNCode] = useState("");
  const [nDate, setNDate] = useState(() => new Date().toLocaleDateString("en-GB"));
  const [nCustomer, setNCustomer] = useState("");
  const [nProvider, setNProvider] = useState("");
  const [nSalesPerson, setNSalesPerson] = useState("");
  const [nFormat, setNFormat] = useState(FORMATS[0]);
  const [nDollarRate, setNDollarRate] = useState("");
  const [nWarranty, setNWarranty] = useState("5");

  const EXTENDED_FORMATS = new Set(["Extended Warranty High Voltage", "Extended Warranty Low Voltage"]);

  const { data: quotes = [], isLoading } = useQuery<Quote[]>({
    queryKey: ["quotes"],
    queryFn: () => api.get("/api/quotation/quotes").then((r) => r.data),
  });

  const { data: nextCode } = useQuery<{ code: string }>({
    queryKey: ["next-quote-code"],
    queryFn: () => api.get("/api/quotation/next-code").then((r) => r.data),
    enabled: newOpen,
  });

  // Firebase quotes for download
  const { data: fbQuotes = [], isLoading: fbLoading } = useQuery<any[]>({
    queryKey: ["firebase-quotes"],
    queryFn: () => api.get("/api/quotation/firebase-quotes").then((r) => r.data),
    enabled: dlOpen,
  });

  const createMut = useMutation({
    mutationFn: () => api.post("/api/quotation/quotes", {
      code: nCode,
      date: nDate,
      customer_name: nCustomer,
      solution_provider: nProvider,
      sales_person: nSalesPerson,
      format_name: nFormat,
      dollar_rate: nDollarRate,
      warranty_years: parseInt(nWarranty) || 5,
    }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setNewOpen(false);
      router.push(`/dashboard/quote/${encodeURIComponent(nCode)}`);
    },
    onError: (e: any) => toast.error(apiErr(e, "Create failed")),
  });

  const deleteMut = useMutation({
    mutationFn: (code: string) => api.delete(`/api/quotation/quotes/${encodeURIComponent(code)}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setSelected(null);
    },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const dupMut = useMutation({
    mutationFn: (code: string) => api.post(`/api/quotation/quotes/${encodeURIComponent(code)}/duplicate`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast.success(`Duplicated as ${res.data.code}`);
    },
    onError: (e: any) => toast.error(apiErr(e, "Duplicate failed")),
  });

  const openExport = (code: string) => {
    setExportTargetCode(code);
    setExportDialogOpen(true);
  };

  const handleFormatSelect = (fmt: "word" | "pdf") => {
    setExportFmt(fmt);
    setExportDialogOpen(false);
    setPendingExportData({ export_type: `quote_${fmt}`, quote_code: exportTargetCode });
    setPendingLinkOpen(true);
  };

  const doExport = (code: string, fmt: "word" | "pdf") => {
    const ext = fmt === "word" ? "docx" : "pdf";
    api.get(`/api/quotation/quotes/${encodeURIComponent(code)}/export/${fmt}`, { responseType: "blob" })
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = `Quote_${code}.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);
        api.post(`/api/quotation/quotes/${encodeURIComponent(code)}/save-to-firebase`).catch(() => {});
      }).catch((e) => toast.error(apiErr(e, "Export failed")));
  };

  const handleSubmitForApproval = async (code: string) => {
    setExportDialogOpen(false);
    try {
      const res = await api.get(`/api/quotation/quotes/${encodeURIComponent(code)}/items`);
      const items = res.data;
      const first = items?.[0];
      if (!first) { toast.error("No items to submit"); return; }
      setApprovalItem({
        type: "quotation",
        name: `Quote ${code}`,
        data: {
          meta: { code, date: first.date, customer_name: first.customer_name,
                  solution_provider: first.solution_provider, format_name: first.format ?? "High voltage" },
          items,
        },
      });
    } catch (e: any) {
      toast.error(apiErr(e, "Failed to load quote items"));
    }
  };

  const downloadMut = useMutation({
    mutationFn: (code: string) => api.post(`/api/quotation/firebase-quotes/${encodeURIComponent(code)}/download`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      setDlOpen(false);
      router.push(`/dashboard/quote/${encodeURIComponent(res.data.code)}`);
    },
    onError: (e: any) => toast.error(apiErr(e, "Download failed")),
  });

  const openNew = () => {
    const numeric = quotes.map(q => parseInt(q.code)).filter(n => !isNaN(n));
    setNCode(nextCode?.code ?? (numeric.length ? String(Math.max(...numeric) + 1) : "1"));
    setNDate(new Date().toLocaleDateString("en-GB"));
    setNCustomer("");
    setNProvider("");
    setNSalesPerson("");
    setNFormat(FORMATS[0]);
    setNDollarRate("");
    setNWarranty("5");
    setNewOpen(true);
  };

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      <h1 className="text-3xl font-bold">Quotations</h1>

      <div className="flex-1 overflow-auto border rounded-md">
        <table className="table-grid w-full text-sm">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="text-center py-2 px-4">Code</th>
              <th className="text-center py-2 px-4">Date</th>
              <th className="text-center py-2 px-4">Customer Name</th>
              <th className="text-center py-2 px-4">Solution Provider</th>
              <th className="text-center py-2 px-4">Sales Person</th>
              <th className="text-center py-2 px-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</td></tr>}
            {!isLoading && quotes.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No quotes yet</td></tr>}
            {quotes.map((q) => (
              <tr
                key={q.code}
                className={`cursor-pointer hover:bg-accent ${selected === q.code ? "bg-primary/20" : ""}`}
                onClick={() => setSelected(q.code)}
                onDoubleClick={() => router.push(`/dashboard/quote/${encodeURIComponent(q.code)}`)}
              >
                <td className="text-center py-2 px-4">{q.code}</td>
                <td className="text-center py-2 px-4">{q.date}</td>
                <td className="text-center py-2 px-4">{q.customer_name}</td>
                <td className="text-center py-2 px-4">{q.solution_provider}</td>
                <td className="text-center py-2 px-4">{q.sales_person}</td>
                <td className="text-center py-1 px-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1 justify-center">
                    <Button size="icon" variant="outline" title="Duplicate"
                      disabled={dupMut.isPending}
                      onClick={() => dupMut.mutate(q.code)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" title="Export"
                      onClick={() => openExport(q.code)}>
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="destructive" title="Delete"
                      disabled={deleteMut.isPending}
                      onClick={() => deleteMut.mutate(q.code)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <Button onClick={openNew}>New Quote</Button>
        <Button variant="outline" onClick={() => setDlOpen(true)}>Download Quote</Button>
      </div>

      {/* New Quote Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Quote</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Row label="Format">
              <select className="h-9 rounded-md border px-3 text-sm bg-background w-full"
                value={nFormat} onChange={(e) => { setNFormat(e.target.value); setNWarranty(EXTENDED_FORMATS.has(e.target.value) ? "" : "5"); }}>
                {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </Row>
            <Row label="Code">
              <Input value={nCode} onChange={(e) => setNCode(e.target.value)} />
            </Row>
            <Row label="Date">
              <Input value={nDate} onChange={(e) => setNDate(e.target.value)} placeholder="DD/MM/YYYY" />
            </Row>
            <Row label="Customer Name">
              <Input value={nCustomer} onChange={(e) => setNCustomer(e.target.value)} />
            </Row>
            <Row label="Solution Provider">
              <Input value={nProvider} onChange={(e) => setNProvider(e.target.value)} />
            </Row>
            <Row label="Sales Person">
              <Input value={nSalesPerson} onChange={(e) => setNSalesPerson(e.target.value)} />
            </Row>
            <Row label="Dollar Rate">
              <Input type="number" min="0" step="0.01" value={nDollarRate} onChange={(e) => setNDollarRate(e.target.value)} placeholder="e.g. 84.5" />
            </Row>
            <Row label="Warranty (yrs)">
              <Input type="number" min="1" value={nWarranty} onChange={(e) => setNWarranty(e.target.value)} placeholder={EXTENDED_FORMATS.has(nFormat) ? "e.g. 10" : "5"} />
            </Row>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={() => createMut.mutate()} disabled={!nCode || createMut.isPending}>
              Create Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download from Firebase Dialog */}
      <Dialog open={dlOpen} onOpenChange={setDlOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Download Quote from Firebase</DialogTitle></DialogHeader>
          <div className="overflow-auto max-h-96 border rounded-md">
            <table className="table-grid w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-center py-2 px-3">Code</th>
                  <th className="text-center py-2 px-3">Date</th>
                  <th className="text-center py-2 px-3">Customer</th>
                  <th className="text-center py-2 px-3">Provider</th>
                </tr>
              </thead>
              <tbody>
                {fbLoading && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">Loading…</td></tr>}
                {!fbLoading && fbQuotes.length === 0 && <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No quotes in Firebase</td></tr>}
                {fbQuotes.map((q: any) => (
                  <tr key={q.code}
                    className="cursor-pointer hover:bg-accent"
                    onDoubleClick={() => downloadMut.mutate(q.code)}>
                    <td className="text-center py-2 px-3">{q.code}</td>
                    <td className="text-center py-2 px-3">{q.date}</td>
                    <td className="text-center py-2 px-3">{q.customer_name}</td>
                    <td className="text-center py-2 px-3">{q.solution_provider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Double-click a row to download it locally.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export format dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Export Quote {exportTargetCode}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Button onClick={() => handleFormatSelect("word")}>Word (.docx)</Button>
            <Button variant="outline" onClick={() => handleFormatSelect("pdf")}>PDF (.pdf)</Button>
            <div className="border-t pt-3">
              <Button variant="outline" className="w-full" onClick={() => handleSubmitForApproval(exportTargetCode)}>
                Submit for Approval
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportDialogOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending link dialog */}
      <PendingLinkDialog
        open={pendingLinkOpen}
        exportLabel={`Quote ${exportTargetCode} (${exportFmt === "word" ? "Word" : "PDF"})`}
        exportData={pendingExportData}
        onClose={() => setPendingLinkOpen(false)}
        onDone={() => doExport(exportTargetCode, exportFmt)}
      />

      {/* Approval dialog */}
      {approvalItem && (
        <SubmitApprovalDialog open={!!approvalItem} item={approvalItem} onClose={() => setApprovalItem(null)} />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}
