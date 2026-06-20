"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function ProjectPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [bundleExpanded, setBundleExpanded] = useState<Set<string>>(new Set());

  const { data: bundleProjects = [], isLoading: projLoading } = useQuery<any[]>({
    queryKey: ["projects"],
    queryFn: () => api.get("/api/projects").then((r) => r.data),
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

  return (
    <div className="flex flex-col h-full p-5 gap-6 overflow-auto">
      <h1 className="text-2xl font-bold shrink-0">Project</h1>

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
    </div>
  );
}
