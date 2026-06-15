"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import {
  getLocalGroups,
  renameLocalGroup,
  discardLocalGroup,
  removeItemFromGroup,
  removeOriginalRecord,
  restoreFirebaseGroupLocally,
  type LocalGroup,
} from "@/lib/local-groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { BookOpen, Layout, X, Plus } from "lucide-react";

interface FirebaseRecord {
  id: string;
  type: "sizing" | "costing" | "quotation";
  name: string;
  customer: string;
  created_by: string;
  created_at: string;
  data: any;
}

interface FirebaseGroup {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: string;
  record_ids: string[];
  datasheet_names?: string[];
  gad_names?: string[];
}

type FilePickerState = { groupId: string; type: "datasheet" | "gad" } | null;

const TYPE_COLORS: Record<string, string> = {
  sizing:    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  costing:   "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  quotation: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};
const TYPE_LABELS: Record<string, string> = {
  sizing: "Sizing", costing: "Costing", quotation: "Quotation",
};

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function GroupsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  // ── local groups state ────────────────────────────────────────────────────
  const [tab, setTab] = useState<"local" | "database" | "bundles">("local");
  const [localGroups, setLocalGroups] = useState<LocalGroup[]>([]);
  const [savingLocal, setSavingLocal] = useState<string | null>(null);
  const [fbExpanded, setFbExpanded] = useState<Set<string>>(new Set());
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [bundleExpanded, setBundleExpanded] = useState<Set<string>>(new Set());
  const [restoringRec, setRestoringRec] = useState<string | null>(null);
  const [filePicker, setFilePicker] = useState<FilePickerState>(null);
  const [fileQuery, setFileQuery] = useState("");

  const reloadLocal = () => setLocalGroups(getLocalGroups());

  useEffect(() => {
    reloadLocal();
  }, []);

  // ── Firebase data ─────────────────────────────────────────────────────────
  const { data: fbGroups = [], isLoading: fbLoading } = useQuery<FirebaseGroup[]>({
    queryKey: ["groups"],
    queryFn: () => api.get("/api/groups").then((r) => r.data),
  });

  const { data: records = [] } = useQuery<FirebaseRecord[]>({
    queryKey: ["records"],
    queryFn: () => api.get("/api/records").then((r) => r.data),
  });

  const recordById = new Map(records.map((r) => [r.id, r]));

  const { data: allDsFiles = [] } = useQuery<string[]>({
    queryKey: ["datafiles", "datasheets", fileQuery],
    queryFn: () => api.get(`/api/datafiles/datasheets/files?q=${encodeURIComponent(fileQuery)}`).then((r) => r.data.files),
    enabled: filePicker?.type === "datasheet",
  });

  const { data: allGadFiles = [] } = useQuery<string[]>({
    queryKey: ["datafiles", "gads", fileQuery],
    queryFn: () => api.get(`/api/datafiles/gads/files?q=${encodeURIComponent(fileQuery)}`).then((r) => r.data.files),
    enabled: filePicker?.type === "gad",
  });

  const addFileMut = useMutation({
    mutationFn: ({ groupId, type, filename }: { groupId: string; type: "datasheet" | "gad"; filename: string }) =>
      api.post(`/api/groups/${groupId}/add-${type}`, { filename }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["groups"] }); setFilePicker(null); setFileQuery(""); },
    onError: (e: any) => toast.error(apiErr(e, "Add failed")),
  });

  const removeFileMut = useMutation({
    mutationFn: ({ groupId, type, filename }: { groupId: string; type: "datasheet" | "gad"; filename: string }) =>
      api.delete(`/api/groups/${groupId}/${type === "datasheet" ? "datasheets" : "gads"}/${encodeURIComponent(filename)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups"] }),
    onError: (e: any) => toast.error(apiErr(e, "Remove failed")),
  });

  const deleteGroupMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/groups/${id}`),
    onSuccess: () => {
      toast.success("Project deleted from Firebase");
      qc.invalidateQueries({ queryKey: ["groups"] });
      setDeleteGroupId(null);
    },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  // ── bundle projects ──────────────────────────────────────────────────────
  const { data: bundleProjects = [], isLoading: projLoading } = useQuery<any[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/api/projects").then((r) => r.data),
    enabled: tab === "bundles",
  });

  const deleteProjMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/projects/${id}`),
    onSuccess: () => {
      toast.success("Project deleted");
      qc.invalidateQueries({ queryKey: ["projects"] });
      setDeleteProjectId(null);
    },
    onError: (e: any) => toast.error(apiErr(e, "Delete failed")),
  });

  const removeBundleMut = useMutation({
    mutationFn: ({ projId, bundleId }: { projId: string; bundleId: string }) =>
      api.delete(`/api/projects/${projId}/bundles/${bundleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: (e: any) => toast.error(apiErr(e, "Remove failed")),
  });

  const toggleBundle = (id: string) =>
    setBundleExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // ── save local group → Firebase ───────────────────────────────────────────
  const saveLocalToFirebase = async (lg: LocalGroup) => {
    setSavingLocal(lg.local_id);
    try {
      const now = new Date().toLocaleString();
      // 1. save any new local items as Firebase records
      const newIds: string[] = [];
      for (const item of lg.items) {
        const rec = await api.post("/api/records", {
          type: item.type, name: item.name, customer: item.customer, data: item.data,
        });
        newIds.push(rec.data.id);
      }

      if (lg.firebase_id) {
        // push update to existing Firebase group — append audit trail
        const kept = (lg.original_record_ids ?? []).filter(
          (rid) => !(lg.removed_ids ?? []).includes(rid),
        );
        const finalIds = [...kept, ...newIds];

        const added = newIds.length;
        const removed = (lg.removed_ids ?? []).length;
        const parts: string[] = [];
        if (added) parts.push(`+${added} item${added !== 1 ? "s" : ""}`);
        if (removed) parts.push(`-${removed} item${removed !== 1 ? "s" : ""}`);
        const changeSummary = parts.length ? ` (${parts.join(", ")})` : " (no changes)";
        const audit = `Updated by you on ${now}${changeSummary}`;

        await api.post(`/api/groups/${lg.firebase_id}/push`, {
          name: lg.name, record_ids: finalIds, audit_entry: audit,
        });
        toast.success(`Pushed "${lg.name}" to Firebase with audit trail`);
      } else {
        // new Firebase group
        const audit = `Created by you on ${now} with ${lg.items.length} item${lg.items.length !== 1 ? "s" : ""}`;
        await api.post("/api/groups", {
          name: lg.name, record_ids: newIds, audit_entry: audit,
        });
        toast.success(`Project "${lg.name}" saved to Firebase`);
      }

      discardLocalGroup(lg.local_id);
      reloadLocal();
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["records"] });
    } catch (e: any) {
      toast.error(apiErr(e, "Failed to save group"));
    } finally {
      setSavingLocal(null);
    }
  };

  // ── restore Firebase group into local ────────────────────────────────────
  const handleRestoreToLocal = (grp: FirebaseGroup) => {
    const existing = getLocalGroups().find((g) => g.firebase_id === grp.id);
    if (existing) {
      toast.info(`"${grp.name}" is already open as a local project`);
      return;
    }
    restoreFirebaseGroupLocally(grp.id, grp.name, grp.record_ids ?? []);
    reloadLocal();
    toast.success(`"${grp.name}" opened as local project — edit and push when ready`);
  };

  // ── restore a record ─────────────────────────────────────────────────────
  const handleRestoreRecord = async (rec: FirebaseRecord) => {
    setRestoringRec(rec.id);
    try {
      if (rec.type === "sizing") {
        const { project_name, form, forms } = rec.data;
        if (forms?.length > 0) {
          const res = await api.post("/api/sizing/restore", { project_name, forms });
          const dest = res.data.project ?? project_name;
          qc.invalidateQueries({ queryKey: ["sizing-projects"] });
          toast.success(`Restored → ${dest}`);
          router.push(`/dashboard/sizing/${encodeURIComponent(dest)}`);
        } else {
          const res = await api.post("/api/sizing/restore", { project_name, data: form });
          const dest = res.data.project ?? project_name;
          qc.invalidateQueries({ queryKey: ["sizing-projects"] });
          toast.success(`Restored → ${dest} Sr. ${res.data.sr_no}`);
          router.push(`/dashboard/sizing/${encodeURIComponent(dest)}/${res.data.sr_no}`);
        }
      } else if (rec.type === "costing") {
        await api.post("/api/costing/tree/bulk-restore", rec.data.rows);
        qc.invalidateQueries({ queryKey: ["costing-tree"] });
        toast.success("Costing table restored");
        router.push("/dashboard/costing");
      } else if (rec.type === "quotation") {
        const res = await api.post("/api/quotation/restore", { meta: rec.data.meta, items: rec.data.items });
        qc.invalidateQueries({ queryKey: ["quotes"] });
        toast.success(`Restored → quote ${res.data.code}`);
        router.push(`/dashboard/quote/${encodeURIComponent(res.data.code)}`);
      }
    } catch (e: any) {
      toast.error(apiErr(e, "Restore failed"));
    } finally {
      setRestoringRec(null);
    }
  };

  // ── export Firebase group ─────────────────────────────────────────────────
  const handleExport = async (grp: FirebaseGroup, fmt: "native" | "pdf") => {
    setExportingId(grp.id);
    try {
      const res = await api.get(`/api/groups/${grp.id}/export?fmt=${fmt}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${grp.name}.zip`; a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch {
      toast.error("Export failed — ensure group has records");
    } finally {
      setExportingId(null);
    }
  };

  const toggleFb = (id: string) =>
    setFbExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <div className="flex flex-col h-full p-5 gap-6 overflow-auto">
      {/* Header with tabs */}
      <div className="shrink-0 flex flex-col gap-0">
        <h1 className="text-2xl font-bold mb-3">Project</h1>
        <div className="flex border-b">
          {(["local", "database", "bundles"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "local" ? "Local" : t === "database" ? "Database" : "Bundles"}
              {t === "local" && localGroups.length > 0 && (
                <span className="ml-1.5 text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                  {localGroups.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── LOCAL GROUPS ────────────────────────────────────────────────────── */}
      <section className={`flex flex-col gap-3 ${tab !== "local" ? "hidden" : ""}`}>

        {localGroups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No local projects open. Use "Add to Group" in any export dialog to start one.
          </p>
        )}

        {localGroups.map((lg) => {
          const keptIds = (lg.original_record_ids ?? []).filter(
            (rid) => !(lg.removed_ids ?? []).includes(rid),
          );
          const totalItems = keptIds.length + lg.items.length;
          const isSaving = savingLocal === lg.local_id;

          return (
            <div key={lg.local_id}
              className="border-2 border-dashed border-primary/40 rounded-lg p-4 flex flex-col gap-3 bg-primary/5">
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1 font-semibold"
                  value={lg.name}
                  onChange={(e) => { renameLocalGroup(lg.local_id, e.target.value); reloadLocal(); }}
                />
                {lg.firebase_id && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0">
                    from Firebase
                  </span>
                )}
              </div>

              {/* Existing Firebase records (for restored groups) */}
              {keptIds.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Existing Firebase records:</p>
                  {keptIds.map((rid) => {
                    const rec = recordById.get(rid);
                    return (
                      <div key={rid} className="flex items-center gap-2 text-sm">
                        {rec ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[rec.type] ?? ""}`}>
                            {TYPE_LABELS[rec.type] ?? rec.type}
                          </span>
                        ) : null}
                        <span className="flex-1 truncate text-muted-foreground">
                          {rec?.name ?? rid}
                        </span>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                          onClick={() => { removeOriginalRecord(lg.local_id, rid); reloadLocal(); }}>
                          ✕
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* New local items */}
              {lg.items.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs font-medium text-muted-foreground">New items (not yet saved):</p>
                  {lg.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${TYPE_COLORS[item.type] ?? ""}`}>
                        {TYPE_LABELS[item.type] ?? item.type}
                      </span>
                      <span className="flex-1 truncate text-muted-foreground">{item.name}</span>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                        onClick={() => { removeItemFromGroup(lg.local_id, i); reloadLocal(); }}>
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {totalItems === 0 && (
                <p className="text-xs text-muted-foreground">No items. Add from export dialogs.</p>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button size="sm" disabled={isSaving} onClick={() => saveLocalToFirebase(lg)}>
                  {isSaving
                    ? "Saving…"
                    : lg.firebase_id
                    ? "Push to Firebase"
                    : "Save to Firebase"}
                </Button>
                <Button size="sm" variant="outline"
                  onClick={() => { discardLocalGroup(lg.local_id); reloadLocal(); }}>
                  Discard
                </Button>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── FIREBASE GROUPS ─────────────────────────────────────────────────── */}
      <section className={`flex flex-col gap-3 ${tab !== "database" ? "hidden" : ""}`}>

        {fbLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!fbLoading && fbGroups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No projects saved yet. Save a local project above to create one.
          </p>
        )}

        {fbGroups.map((grp) => {
          const isExpanded = fbExpanded.has(grp.id);
          const groupRecords = (grp.record_ids ?? [])
            .map((rid) => recordById.get(rid))
            .filter(Boolean) as FirebaseRecord[];
          const groupDs   = grp.datasheet_names ?? [];
          const groupGads = grp.gad_names ?? [];

          return (
            <div key={grp.id} className="border rounded-md overflow-hidden">
              <div
                className="flex items-center gap-3 p-3 bg-muted/50 cursor-pointer hover:bg-muted/80 select-none"
                onClick={() => toggleFb(grp.id)}
              >
                <span className="text-base font-mono w-4 shrink-0">{isExpanded ? "▾" : "▸"}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{grp.name}</p>
                  {grp.description && (
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans mt-0.5 max-h-20 overflow-auto">
                      {grp.description}
                    </pre>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {groupRecords.length} record{groupRecords.length !== 1 ? "s" : ""}
                    {groupDs.length > 0 && ` · ${groupDs.length} datasheet${groupDs.length !== 1 ? "s" : ""}`}
                    {groupGads.length > 0 && ` · ${groupGads.length} GAD${groupGads.length !== 1 ? "s" : ""}`}
                    {" · "}By {grp.created_by}{" · "}{fmtDate(grp.created_at)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline"
                    onClick={() => handleRestoreToLocal(grp)}>
                    Restore to Local
                  </Button>
                  <Button size="sm" variant="outline"
                    disabled={exportingId === grp.id || groupRecords.length === 0}
                    onClick={() => handleExport(grp, "native")}>
                    {exportingId === grp.id ? "…" : "Export"}
                  </Button>
                  <Button size="sm" variant="destructive"
                    onClick={() => setDeleteGroupId(grp.id)}>
                    Delete
                  </Button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t bg-background divide-y">
                  {/* Records */}
                  <div className="p-3 pl-8 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Records</p>
                    {groupRecords.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No records.</p>
                    ) : groupRecords.map((rec) => (
                      <div key={rec.id} className="border-l-2 border-muted pl-3 flex items-start gap-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full shrink-0 mt-0.5 ${TYPE_COLORS[rec.type] ?? ""}`}>
                          {TYPE_LABELS[rec.type] ?? rec.type}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{rec.name}</p>
                          {rec.customer && (
                            <p className="text-xs text-muted-foreground truncate">{rec.customer}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {rec.created_by} · {fmtDate(rec.created_at)}
                          </p>
                        </div>
                        <Button size="sm" variant="outline"
                          disabled={restoringRec === rec.id}
                          onClick={() => handleRestoreRecord(rec)}>
                          {restoringRec === rec.id ? "…" : "Restore"}
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Datasheets */}
                  <div className="p-3 pl-8 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Datasheets</p>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1"
                        onClick={() => { setFilePicker({ groupId: grp.id, type: "datasheet" }); setFileQuery(""); }}>
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    </div>
                    {groupDs.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No datasheets linked.</p>
                    ) : groupDs.map((f) => (
                      <div key={f} className="flex items-center gap-2 border-l-2 border-amber-200 pl-3">
                        <BookOpen className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span className="text-xs flex-1 truncate">{f}</span>
                        <button className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeFileMut.mutate({ groupId: grp.id, type: "datasheet", filename: f })}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* GADs */}
                  <div className="p-3 pl-8 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">GADs</p>
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1"
                        onClick={() => { setFilePicker({ groupId: grp.id, type: "gad" }); setFileQuery(""); }}>
                        <Plus className="h-3 w-3" /> Add
                      </Button>
                    </div>
                    {groupGads.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No GADs linked.</p>
                    ) : groupGads.map((f) => (
                      <div key={f} className="flex items-center gap-2 border-l-2 border-rose-200 pl-3">
                        <Layout className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                        <span className="text-xs flex-1 truncate">{f}</span>
                        <button className="text-muted-foreground hover:text-destructive"
                          onClick={() => removeFileMut.mutate({ groupId: grp.id, type: "gad", filename: f })}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ── BUNDLE PROJECTS ─────────────────────────────────────────────────── */}
      <section className={`flex flex-col gap-3 ${tab !== "bundles" ? "hidden" : ""}`}>
        {projLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!projLoading && bundleProjects.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No projects yet. Export a quote and click "Add to Project" to create one.
          </p>
        )}
        {bundleProjects.map((proj) => {
          const isExpanded = bundleExpanded.has(proj.id);
          const bundles: any[] = proj.bundles ?? [];
          return (
            <div key={proj.id} className="border rounded-md overflow-hidden">
              <div
                className="flex items-center gap-3 p-3 bg-muted/50 cursor-pointer hover:bg-muted/80 select-none"
                onClick={() => toggleBundle(proj.id)}
              >
                <span className="text-base font-mono w-4 shrink-0">{isExpanded ? "▾" : "▸"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{proj.name}</p>
                    {proj.nickname && (
                      <span className="text-xs bg-muted border rounded-full px-2 py-0.5 text-muted-foreground">{proj.nickname}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {proj.customer && <>{proj.customer} · </>}
                    {proj.date}{proj.time && ` ${proj.time}`} · By {proj.created_by} · {bundles.length} bundle{bundles.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button size="sm" variant="destructive"
                  onClick={(e) => { e.stopPropagation(); setDeleteProjectId(proj.id); }}>
                  Delete
                </Button>
              </div>

              {isExpanded && (
                <div className="border-t bg-background divide-y">
                  {bundles.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 pl-8">No bundles.</p>
                  ) : bundles.map((bundle: any) => (
                    <div key={bundle.id} className="p-3 pl-8 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(bundle.datetime)}
                        </div>
                        <button className="text-muted-foreground hover:text-destructive text-xs shrink-0"
                          onClick={() => removeBundleMut.mutate({ projId: proj.id, bundleId: bundle.id })}>
                          Remove
                        </button>
                      </div>
                      {/* Quote — parent */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 shrink-0">
                          Quotation
                        </span>
                        <button
                          className="text-sm font-medium hover:underline text-left"
                          onClick={() => router.push(`/dashboard/quote/${encodeURIComponent(bundle.quote_code)}`)}>
                          Quote: {bundle.quote_code}
                        </button>
                      </div>
                      {/* Sizing — child */}
                      {bundle.sizing_project && (
                        <div className="flex items-center gap-2 pl-4 border-l-2 border-blue-200">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 shrink-0">
                            Sizing
                          </span>
                          <button
                            className="text-sm hover:underline text-left"
                            onClick={() => router.push(`/dashboard/sizing/${encodeURIComponent(bundle.sizing_project)}/${bundle.sizing_sr_no}`)}>
                            {bundle.sizing_project} — Sr. {bundle.sizing_sr_no}
                          </button>
                        </div>
                      )}
                      {/* Costing — child */}
                      {bundle.costing?.partcode && (
                        <div className="flex items-center gap-2 pl-4 border-l-2 border-green-200">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 shrink-0">
                            Costing
                          </span>
                          <div className="text-sm">
                            <span className="font-medium">{bundle.costing.partcode}</span>
                            {bundle.costing.total_cost != null && (
                              <span className="text-muted-foreground ml-2">
                                Rs. {Number(bundle.costing.total_cost).toLocaleString("en-IN")}
                              </span>
                            )}
                            {bundle.costing.battery_pack && (
                              <span className="text-muted-foreground ml-2">· {bundle.costing.battery_pack}</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* Delete project confirm */}
      <Dialog open={!!deleteProjectId} onOpenChange={() => setDeleteProjectId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Project?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deletes the project and all its bundles. The underlying quotes, sizings, and costings are not affected.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProjectId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteProjMut.isPending}
              onClick={() => deleteProjectId && deleteProjMut.mutate(deleteProjectId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File picker dialog */}
      <Dialog open={!!filePicker} onOpenChange={(o) => !o && setFilePicker(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {filePicker?.type === "datasheet" ? "Add Datasheet" : "Add GAD"}
            </DialogTitle>
          </DialogHeader>
          <Input
            className="h-8 text-sm"
            placeholder={filePicker?.type === "datasheet" ? "Search datasheets…" : "Search GADs…"}
            value={fileQuery}
            onChange={(e) => setFileQuery(e.target.value)}
          />
          <div className="flex flex-col gap-1 max-h-72 overflow-y-auto mt-1">
            {(() => {
              const files = filePicker?.type === "datasheet" ? allDsFiles : allGadFiles;
              const linkedRaw = filePicker
                ? (fbGroups.find(g => g.id === filePicker.groupId)?.[
                    filePicker.type === "datasheet" ? "datasheet_names" : "gad_names"
                  ] ?? [])
                : [];
              const linked = Array.isArray(linkedRaw) ? linkedRaw : [];
              const available = (Array.isArray(files) ? files : []).filter((f: string) => !linked.includes(f));
              if (available.length === 0)
                return <p className="text-xs text-muted-foreground text-center py-4">No files found</p>;
              return available.map((f: string) => (
                <button key={f}
                  className="flex items-center gap-2 px-3 py-2 rounded hover:bg-muted text-left text-xs"
                  onClick={() => filePicker && addFileMut.mutate({ groupId: filePicker.groupId, type: filePicker.type, filename: f })}>
                  {filePicker?.type === "datasheet"
                    ? <BookOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    : <Layout className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{f}</span>
                </button>
              ));
            })()}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFilePicker(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Firebase group confirm */}
      <Dialog open={!!deleteGroupId} onOpenChange={() => setDeleteGroupId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Project from Firebase?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deletes the group only. Records inside are not deleted.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteGroupId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteGroupMut.isPending}
              onClick={() => deleteGroupId && deleteGroupMut.mutate(deleteGroupId)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
