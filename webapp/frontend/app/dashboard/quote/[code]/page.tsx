"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import AddToGroupDialog from "@/components/AddToGroupDialog";
import SubmitApprovalDialog, { type ApprovalItem } from "@/components/SubmitApprovalDialog";
import { type LocalGroupItem } from "@/lib/local-groups";
import { getPendingAction, clearPendingAction } from "@/lib/approval-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil } from "lucide-react";

interface QuoteItem {
  code: string;
  format: string;
  date: string;
  solution_provider: string;
  customer_name: string;
  sr_no: number;
  sol_no: number;
  ups_rating: string;
  backup_requirement: string;
  calc_load: string;
  celltype: string;
  centre_tapping: string;
  batterypartcode: string;
  backup_time: string;
  quantity: number;
  quote_price: number;
  modular_rack: string;
  system_text?: string | null;
  solution_text?: string | null;
}

interface CostingRow {
  battery_pack: string;
  total_cost: number;
  duration: string;
  kw_calculation: number;
  cell_type: string;
  centre_tap: string;
  partcode: string;
}

const PRICE_OPTIONS = [
  { label: "A (Cost)", value: "A" },
  { label: "A+5% (B-5)", value: "B-5" },
  { label: "A+10% (B)", value: "B" },
  { label: "A+15% (B+5)", value: "B+5" },
  { label: "A+20% (C)", value: "C" },
  { label: "A+25% (C+5)", value: "C+5" },
];

const MODULAR_RACKS = [
  { key: "W=600*D=1000*H=880",  price: 30000 },
  { key: "W=600*D=1000*H=1392", price: 40000 },
  { key: "W=600*D=1000*H=1882", price: 49000 },
  { key: "W=600*D=1000*H=1971", price: 64000 },
  { key: "W=600*D=1000*H=2058", price: 69000 },
  { key: "W=600*D=800*H=992",   price: 30000 },
  { key: "W=600*D=800*H=1704",  price: 43000 },
  { key: "W=600*D=1000*H=2325", price: 70000 },
  { key: "W=600*D=1400*H=1882", price: 70000 },
];

const MULT: Record<string, number> = {
  "A": 1.0, "B-5": 1.05, "B": 1.10, "B+5": 1.15, "C": 1.20, "C+5": 1.25,
};

function SortableItem({ id, children }: { id: number; children: (dragHandleProps: React.HTMLAttributes<HTMLElement>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

export default function QuoteEditorPage() {
  const { code: rawCode } = useParams();
  const code = decodeURIComponent(rawCode as string);
  const router = useRouter();
  const qc = useQueryClient();

  // project bundling
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [projectMode, setProjectMode] = useState<"new" | "existing">("new");
  const [projName, setProjName] = useState("");
  const [projCustomer, setProjCustomer] = useState("");
  const [projNickname, setProjNickname] = useState("");
  const [projDate, setProjDate] = useState("");
  const [projTime, setProjTime] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [addingToProject, setAddingToProject] = useState(false);
  const [quoteLink, setQuoteLink] = useState<{sizing_project?:string;sizing_sr_no?:number;costing?:any;quote_code?:string}|null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(`quote_link_${code}`);
    if (raw) {
      try { setQuoteLink(JSON.parse(raw)); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: existingProjects = [] } = useQuery<{id:string;name:string;customer:string}[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/api/projects").then((r) => r.data),
    enabled: projectDialogOpen && projectMode === "existing",
  });

  const handleOpenProjectDialog = () => {
    const now = new Date();
    setProjName("");
    setProjCustomer(items[0]?.customer_name ?? "");
    setProjNickname("");
    setProjDate(now.toLocaleDateString("en-GB"));
    setProjTime(now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    setSelectedProjectId(null);
    setProjectMode("new");
    setProjectDialogOpen(true);
  };

  const handleAddToProject = async () => {
    setAddingToProject(true);
    try {
      const bundle = {
        quote_code: code,
        sizing_project: quoteLink?.sizing_project ?? null,
        sizing_sr_no: quoteLink?.sizing_sr_no ?? null,
        costing: quoteLink?.costing ?? null,
      };
      if (projectMode === "new") {
        await api.post("/api/projects", {
          name: projName,
          customer: projCustomer,
          nickname: projNickname,
          date: projDate,
          time: projTime,
          bundle,
        });
        toast.success(`Project "${projName}" created`);
      } else {
        if (!selectedProjectId) return;
        await api.post(`/api/projects/${selectedProjectId}/bundles`, bundle);
        toast.success("Added to project");
      }
      localStorage.removeItem(`quote_link_${code}`);
      setQuoteLink(null);
      setProjectDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (e: any) {
      toast.error(apiErr(e, "Failed"));
    } finally {
      setAddingToProject(false);
    }
  };

  const [addCostingOpen, setAddCostingOpen] = useState(false);
  const [addModularOpen, setAddModularOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [groupDialogItem, setGroupDialogItem] = useState<LocalGroupItem | null>(null);
  const [approvalItem, setApprovalItem] = useState<ApprovalItem | null>(null);
  const [pendingAction, setPendingActionState] = useState(() => getPendingAction());
  const pendingForMe = pendingAction?.type === "quotation" ? pendingAction : null;

  // add-from-costing form
  const [selCostingIdx, setSelCostingIdx] = useState<number | null>(null);
  const [priceOption, setPriceOption] = useState("B");
  const [customPct, setCustomPct] = useState("30");
  const [qty, setQty] = useState("1");

  // add-modular form
  const [selRack, setSelRack] = useState(MODULAR_RACKS[0].key);
  const [modQty, setModQty] = useState("1");
  const [customDims, setCustomDims] = useState("");
  const [customPrice, setCustomPrice] = useState("");

  // add-custom-cost form
  const [addCustomCostOpen, setAddCustomCostOpen] = useState(false);
  const [customCostDesc, setCustomCostDesc] = useState("");
  const [customCostPrice, setCustomCostPrice] = useState("");
  const [customCostQty, setCustomCostQty] = useState("1");

  // edit item
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<QuoteItem | null>(null);
  const [editFields, setEditFields] = useState<Record<string,string>>({});

  // rounding
  const [roundingItem, setRoundingItem] = useState<number | null>(null);

  const qKey = ["quote-items", code];

  const { data: items = [], isLoading } = useQuery<QuoteItem[]>({
    queryKey: qKey,
    queryFn: () => api.get(`/api/quotation/quotes/${encodeURIComponent(code)}/items`).then((r) => r.data),
  });

  const [localItems, setLocalItems] = useState<QuoteItem[]>([]);
  useEffect(() => { setLocalItems(items); }, [items]);

  const sensors = useSensors(useSensor(PointerSensor));

  const composeSystem = (item: QuoteItem) => {
    const loadLine = item.calc_load ? `\n(Load: ${item.calc_load}kW)` : "";
    return `${item.ups_rating}KVA : ${item.backup_requirement}Min Backup${loadLine}\n(Cell Type:${item.celltype})\n(${item.centre_tapping})`;
  };

  const composeSolution = (item: QuoteItem, sn: number | null) =>
    `Solution${sn ?? "?"}: Lithium Battery Pack\n(${item.batterypartcode}) with\nApprox Backup: ${item.backup_time}Mins At BOL\nWith Cabinet and inbuilt BMS`;

  const openEdit = (item: QuoteItem, sn: number | null) => {
    setEditItem(item);
    setEditFields({
      system_text: item.system_text || composeSystem(item),
      solution_text: item.solution_text || composeSolution(item, sn),
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editItem) return;
    try {
      await api.patch(`/api/quotation/quotes/${encodeURIComponent(code)}/items/${editItem.sr_no}`, editFields);
      qc.invalidateQueries({ queryKey: qKey });
      setEditOpen(false);
      toast.success("Updated");
    } catch (e: any) {
      toast.error(apiErr(e, "Update failed"));
    }
  };

  const handleRound = async (sr_no: number, price: number, mode: "ceil" | "round" | "floor") => {
    const rounded = mode === "ceil" ? Math.ceil(price) : mode === "floor" ? Math.floor(price) : Math.round(price);
    try {
      await api.patch(`/api/quotation/quotes/${encodeURIComponent(code)}/items/${sr_no}`, { quote_price: rounded });
      qc.invalidateQueries({ queryKey: qKey });
    } catch (e: any) {
      toast.error(apiErr(e, "Round failed"));
    }
    setRoundingItem(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = localItems.findIndex(i => i.sr_no === active.id);
    const newIdx = localItems.findIndex(i => i.sr_no === over.id);
    const reordered = arrayMove(localItems, oldIdx, newIdx).map((item, i) => ({ ...item, sr_no: i + 1 }));
    setLocalItems(reordered);
    try {
      await api.put(`/api/quotation/quotes/${encodeURIComponent(code)}/reorder`, {
        sr_nos: reordered.map(i => i.sr_no),
      });
      qc.invalidateQueries({ queryKey: qKey });
    } catch (e: any) {
      toast.error(apiErr(e, "Reorder failed"));
      setLocalItems(items);
    }
  };

  const { data: costingRows = [] } = useQuery<CostingRow[]>({
    queryKey: ["costing-tree"],
    queryFn: () => api.get("/api/costing/tree").then((r) => r.data),
    enabled: addCostingOpen,
  });

  const deleteMut = useMutation({
    mutationFn: (sr: number) =>
      api.delete(`/api/quotation/quotes/${encodeURIComponent(code)}/items/${sr}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const addCostingMut = useMutation({
    mutationFn: () => api.post(`/api/quotation/quotes/${encodeURIComponent(code)}/add-from-costing`, {
      quote_code: code,
      costing_row_index: selCostingIdx,
      price_option: priceOption,
      quantity: parseInt(qty) || 1,
      custom_pct: parseFloat(customPct) || 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      setAddCostingOpen(false);
      toast.success("Item added");
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const addModularMut = useMutation({
    mutationFn: () => api.post(`/api/quotation/quotes/${encodeURIComponent(code)}/add-modular`, {
      quote_code: code,
      rack_key: selRack === "custom" ? customDims.trim() || "Custom" : selRack,
      quantity: parseInt(modQty) || 1,
      custom_price: selRack === "custom" ? parseFloat(customPrice) || 0 : 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      setAddModularOpen(false);
      toast.success("Modular rack added");
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const addCustomCostMut = useMutation({
    mutationFn: () => api.post(`/api/quotation/quotes/${encodeURIComponent(code)}/add-modular`, {
      quote_code: code,
      rack_key: customCostDesc.trim() || "Custom Item",
      quantity: parseInt(customCostQty) || 1,
      custom_price: parseFloat(customCostPrice) || 0,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      setAddCustomCostOpen(false);
      setCustomCostDesc("");
      setCustomCostPrice("");
      setCustomCostQty("1");
      toast.success("Custom cost added");
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const saveFirebaseMut = useMutation({
    mutationFn: () => api.post(`/api/quotation/quotes/${encodeURIComponent(code)}/save-to-firebase`),
    onSuccess: () => toast.success("Saved to Firebase"),
    onError: (e: any) => toast.error(apiErr(e, "Save failed")),
  });

  const handleExport = (fmt: "word" | "pdf") => {
    const ext = fmt === "word" ? "docx" : "pdf";
    const mime = fmt === "word"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      : "application/pdf";
    api.get(`/api/quotation/quotes/${encodeURIComponent(code)}/export/${fmt}`, { responseType: "blob" })
      .then((res) => {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const a = document.createElement("a");
        a.href = url;
        a.download = `Quote_${code}.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);
        setExportOpen(false);
        // auto-save record on export
        const first = items[0];
        if (first) {
          api.post("/api/records", {
            type: "quotation",
            name: `Quote ${code}`,
            customer: first.customer_name ?? "",
            data: {
              meta: {
                code,
                date: first.date ?? "",
                customer_name: first.customer_name ?? "",
                solution_provider: first.solution_provider ?? "",
                format_name: first.format ?? "High voltage",
              },
              items,
            },
          }).catch(() => {});
        }
      }).catch((e) => toast.error(apiErr(e, "Export failed")));
  };

  const solCount = (idx: number) =>
    items.slice(0, idx).filter((i) => i.modular_rack === "-").length + 1;

  return (
    <div className="flex flex-col h-full p-5 gap-4">
      {pendingForMe && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-md px-4 py-2 flex items-center gap-3 text-sm">
          <span className="flex-1">
            <span className="font-semibold">Approval action pending:</span>{" "}
            {pendingForMe.action === "revise" ? "Revise" : "Re-submit"} for{" "}
            <span className="font-medium">"{pendingForMe.ticket_name}"</span>.
            Update the quote, then click Submit.
          </span>
          <Button size="sm" onClick={async () => {
            try {
              const first = items[0];
              const data = { meta: { code, date: first?.date ?? "", customer_name: first?.customer_name ?? "",
                solution_provider: first?.solution_provider ?? "", format_name: first?.format ?? "High voltage" }, items };
              const endpoint = `/api/approvals/${pendingForMe.ticket_id}/${pendingForMe.action === "revise" ? "revise" : "resubmit"}`;
              await api.post(endpoint, { data, message: "" });
              clearPendingAction(); setPendingActionState(null);
              toast.success(pendingForMe.action === "revise" ? "Revision submitted" : "Re-submitted");
            } catch (e: any) { toast.error(apiErr(e, "Failed")); }
          }}>Submit {pendingForMe.action === "revise" ? "Revision" : "Update"}</Button>
          <Button size="sm" variant="ghost" onClick={() => { clearPendingAction(); setPendingActionState(null); }}>Cancel</Button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" onClick={() => router.push("/dashboard/quote")}>← Back</Button>
        <h1 className="text-2xl font-bold">Quote: {code}</h1>
        <Button variant="outline" onClick={() => setAddCostingOpen(true)}>
          Add from Costing
        </Button>
        <Button variant="outline" onClick={() => setAddModularOpen(true)}>
          Add Modular Rack
        </Button>
        <Button variant="outline" onClick={() => setAddCustomCostOpen(true)}>
          Add Custom Cost
        </Button>
        <Button variant="outline" onClick={() => setExportOpen(true)}>Export</Button>
        <Button variant="secondary" onClick={() => saveFirebaseMut.mutate()} disabled={saveFirebaseMut.isPending}>
          Save to Firebase
        </Button>
      </div>

      {/* Line items */}
      <div className="flex-1 overflow-auto flex flex-col gap-3">
        {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
        {!isLoading && localItems.length === 0 && (
          <p className="text-muted-foreground text-sm">No items yet. Add from Costing or add a Modular Rack.</p>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={localItems.map(i => i.sr_no)} strategy={verticalListSortingStrategy}>
        {localItems.map((item, idx) => {
          const isModular = item.modular_rack && item.modular_rack !== "-";
          const price = parseFloat(String(item.quote_price)) || 0;
          const total = (parseInt(String(item.quantity)) || 0) * price;
          const sn = isModular ? null : solCount(idx);

          return (
            <SortableItem key={item.sr_no} id={item.sr_no}>
            {(dragHandleProps) => (
            <div
              className="border rounded-md p-4 grid grid-cols-[20px_40px_1fr_1fr_120px_180px_180px_56px] gap-3 text-sm items-start">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab active:cursor-grabbing mt-1" {...dragHandleProps} />
              <div className="font-bold text-lg text-center">{item.sr_no}</div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase font-medium">System</span>
                {isModular ? (
                  <span className="text-muted-foreground italic">—</span>
                ) : (
                  <span className="whitespace-pre-line">
                    {item.system_text || composeSystem(item)}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase font-medium">Solution</span>
                {isModular ? (
                  <span>{MODULAR_RACKS.some(r => r.key === item.modular_rack)
                    ? `Modular Battery Rack (${item.modular_rack})`
                    : item.modular_rack}</span>
                ) : (
                  <span className="whitespace-pre-line">
                    {item.solution_text || composeSolution(item, sn)}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase font-medium">Quantity</span>
                <span>{item.quantity}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase font-medium">Unit Price</span>
                <span>Rs. {price.toLocaleString("en-IN")}/- +GST</span>
                {roundingItem === item.sr_no ? (
                  <div className="flex gap-1 mt-1">
                    <button onClick={() => handleRound(item.sr_no, price, "ceil")} className="text-xs border rounded px-1.5 py-0.5 hover:bg-muted" title="Round up">⌈ Up</button>
                    <button onClick={() => handleRound(item.sr_no, price, "round")} className="text-xs border rounded px-1.5 py-0.5 hover:bg-muted" title="Round nearest">~ Near</button>
                    <button onClick={() => handleRound(item.sr_no, price, "floor")} className="text-xs border rounded px-1.5 py-0.5 hover:bg-muted" title="Round down">⌊ Down</button>
                    <button onClick={() => setRoundingItem(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
                  </div>
                ) : (
                  <button onClick={() => setRoundingItem(item.sr_no)} className="text-xs text-muted-foreground hover:text-foreground mt-1 text-left">⌈ Round</button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase font-medium">Total</span>
                <span>Rs. {total.toLocaleString("en-IN")}/- +GST</span>
              </div>
              <div className="flex flex-col gap-1 mt-1">
                {!isModular && (
                  <button className="text-muted-foreground hover:text-foreground" onClick={() => openEdit(item, sn)} title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  className="text-destructive hover:text-destructive/80 disabled:opacity-40"
                  onClick={() => deleteMut.mutate(item.sr_no)}
                  disabled={deleteMut.isPending}
                  title="Delete row"
                >✕</button>
              </div>
            </div>
            )}
            </SortableItem>
          );
        })}
          </SortableContext>
        </DndContext>
      </div>

      {groupDialogItem && (
        <AddToGroupDialog open={!!groupDialogItem} item={groupDialogItem} onClose={() => setGroupDialogItem(null)} />
      )}
      {approvalItem && (
        <SubmitApprovalDialog open={!!approvalItem} item={approvalItem} onClose={() => setApprovalItem(null)} />
      )}

      {/* Edit Item Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit Item</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">System</Label>
              <textarea
                rows={4}
                className="w-full rounded-md border px-3 py-2 text-sm bg-background resize-y"
                value={editFields.system_text ?? ""}
                onChange={e => setEditFields(f => ({ ...f, system_text: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Solution</Label>
              <textarea
                rows={4}
                className="w-full rounded-md border px-3 py-2 text-sm bg-background resize-y"
                value={editFields.solution_text ?? ""}
                onChange={e => setEditFields(f => ({ ...f, solution_text: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEditSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add from Costing Dialog */}
      <Dialog open={addCostingOpen} onOpenChange={setAddCostingOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add from Costing</DialogTitle></DialogHeader>
          {costingRows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No costing options in table. Go to Costing first.</p>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-2">
                <Label>Select Option</Label>
                <div className="border rounded-md overflow-auto max-h-48">
                  {costingRows.map((row, i) => (
                    <div key={i}
                      className={`px-3 py-2 cursor-pointer text-sm border-b hover:bg-accent ${selCostingIdx === i ? "bg-primary/20" : ""}`}
                      onClick={() => setSelCostingIdx(i)}>
                      <span className="font-medium">Option {i + 1}</span>
                      {" — "}{row.battery_pack || "—"}
                      {" | Cost: "}{row.total_cost}
                    </div>
                  ))}
                </div>
              </div>
              {selCostingIdx !== null && (
                <div className="flex flex-col gap-2 text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    {PRICE_OPTIONS.map((opt) => {
                      const base = parseFloat(String(costingRows[selCostingIdx]?.total_cost ?? 0));
                      return (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                          <input type="radio" name="priceOpt" value={opt.value}
                            checked={priceOption === opt.value}
                            onChange={() => setPriceOption(opt.value)} />
                          {opt.label} = {Math.round(base * MULT[opt.value] * 100) / 100}
                        </label>
                      );
                    })}
                    <label className="flex items-center gap-2 cursor-pointer col-span-2">
                      <input type="radio" name="priceOpt" value="custom"
                        checked={priceOption === "custom"}
                        onChange={() => setPriceOption("custom")} />
                      Custom %
                    </label>
                  </div>
                  {priceOption === "custom" && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-muted-foreground">A +</span>
                      <Input
                        type="number"
                        className="w-24"
                        min="0"
                        value={customPct}
                        onChange={(e) => setCustomPct(e.target.value)}
                        placeholder="e.g. 30"
                      />
                      <span className="text-muted-foreground">%</span>
                      <span className="text-muted-foreground">
                        = {Math.round(parseFloat(String(costingRows[selCostingIdx]?.total_cost ?? 0)) * (1 + (parseFloat(customPct) || 0) / 100) * 100) / 100}
                      </span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3">
                <Label>Quantity</Label>
                <Input type="number" className="w-24" value={qty} onChange={(e) => setQty(e.target.value)} min={1} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCostingOpen(false)}>Cancel</Button>
            <Button onClick={() => addCostingMut.mutate()}
              disabled={selCostingIdx === null || addCostingMut.isPending}>
              Add to Quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Modular Rack Dialog */}
      <Dialog open={addModularOpen} onOpenChange={setAddModularOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Modular Battery Rack</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label>Select Rack</Label>
              {MODULAR_RACKS.map((r) => (
                <label key={r.key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" name="rack" value={r.key}
                    checked={selRack === r.key}
                    onChange={() => setSelRack(r.key)} />
                  {r.key} — Rs. {r.price.toLocaleString("en-IN")}
                </label>
              ))}
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" name="rack" value="custom"
                  checked={selRack === "custom"}
                  onChange={() => setSelRack("custom")} />
                Custom
              </label>
            </div>
            {selRack === "custom" && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Dimensions (e.g. W=600*D=1000*H=2000)</Label>
                  <Input placeholder="W=600*D=1000*H=2000" value={customDims} onChange={(e) => setCustomDims(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Price (Rs.)</Label>
                  <Input type="number" placeholder="0" value={customPrice} onChange={(e) => setCustomPrice(e.target.value)} />
                </div>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Label>Quantity</Label>
              <Input type="number" className="w-24" value={modQty} onChange={(e) => setModQty(e.target.value)} min={1} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModularOpen(false)}>Cancel</Button>
            <Button onClick={() => addModularMut.mutate()} disabled={addModularMut.isPending}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Cost Dialog */}
      <Dialog open={addCustomCostOpen} onOpenChange={setAddCustomCostOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Custom Cost</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1">
              <Label>Description</Label>
              <Input placeholder="e.g. Installation charges" value={customCostDesc} onChange={(e) => setCustomCostDesc(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Price (Rs.)</Label>
              <Input type="number" placeholder="0" value={customCostPrice} onChange={(e) => setCustomCostPrice(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Label>Quantity</Label>
              <Input type="number" className="w-24" value={customCostQty} onChange={(e) => setCustomCostQty(e.target.value)} min={1} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCustomCostOpen(false)}>Cancel</Button>
            <Button
              onClick={() => addCustomCostMut.mutate()}
              disabled={addCustomCostMut.isPending || !customCostDesc.trim() || !customCostPrice}
            >Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add to Project</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            {/* tabs */}
            <div className="flex border-b">
              {(["new", "existing"] as const).map((m) => (
                <button key={m} onClick={() => setProjectMode(m)}
                  className={`px-4 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${projectMode === m ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                  {m === "new" ? "New Project" : "Existing Project"}
                </button>
              ))}
            </div>

            {projectMode === "new" ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label>Project Name *</Label>
                  <Input value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="e.g. ABC Corp Battery Project" />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Customer Name</Label>
                  <Input value={projCustomer} onChange={(e) => setProjCustomer(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Nickname <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Input value={projNickname} onChange={(e) => setProjNickname(e.target.value)} placeholder="e.g. Phase 1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <Label>Date</Label>
                    <Input value={projDate} onChange={(e) => setProjDate(e.target.value)} placeholder="dd/mm/yyyy" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Time</Label>
                    <Input value={projTime} onChange={(e) => setProjTime(e.target.value)} placeholder="HH:MM" />
                  </div>
                </div>
                {quoteLink && (
                  <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">Will bundle:</span>
                    <span>Quote: {code}</span>
                    {quoteLink.sizing_project && <span>Sizing: {quoteLink.sizing_project} Sr. {quoteLink.sizing_sr_no}</span>}
                    {quoteLink.costing?.partcode && <span>Costing: {quoteLink.costing.partcode}</span>}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {existingProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No projects yet. Create one first.</p>
                ) : existingProjects.map((p) => (
                  <div key={p.id}
                    onClick={() => setSelectedProjectId(p.id)}
                    className={`px-3 py-2 rounded-md border cursor-pointer text-sm hover:bg-accent ${selectedProjectId === p.id ? "bg-primary/10 border-primary" : ""}`}>
                    <p className="font-medium">{p.name}</p>
                    {p.customer && <p className="text-xs text-muted-foreground">{p.customer}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={addingToProject || (projectMode === "new" ? !projName.trim() : !selectedProjectId)}
              onClick={handleAddToProject}>
              {addingToProject ? "Saving…" : projectMode === "new" ? "Create & Add" : "Add to Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Export Quote</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <Button onClick={() => handleExport("word")}>Word (.docx)</Button>
            <Button variant="outline" onClick={() => handleExport("pdf")}>PDF (.pdf)</Button>
            <div className="border-t pt-3 flex flex-col gap-2">
              <Button variant="outline" className="w-full" onClick={() => {
                setExportOpen(false);
                handleOpenProjectDialog();
              }}>Add to Project</Button>
              <Button variant="outline" className="w-full" onClick={() => {
                const first = items[0];
                if (!first) { toast.error("No items to add"); return; }
                setExportOpen(false);
                setGroupDialogItem({ type: "quotation", name: `Quote ${code}`,
                  customer: first.customer_name ?? "",
                  data: { meta: { code, date: first.date, customer_name: first.customer_name,
                                  solution_provider: first.solution_provider, format_name: first.format ?? "High voltage" },
                          items } });
              }}>Add to Group</Button>
              <Button variant="outline" className="w-full" onClick={() => {
                const first = items[0];
                if (!first) { toast.error("No items to submit"); return; }
                setExportOpen(false);
                setApprovalItem({ type: "quotation", name: `Quote ${code}`,
                  data: { meta: { code, date: first.date, customer_name: first.customer_name,
                                  solution_provider: first.solution_provider, format_name: first.format ?? "High voltage" },
                          items } });
              }}>Submit for Approval</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
