"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { useMe } from "@/lib/use-me";
import { setPendingAction } from "@/lib/approval-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Ticket {
  id: string;
  submitted_by: string;
  submitted_at: string;
  type: "sizing" | "costing" | "quotation";
  name: string;
  data: any;
  status: "pending" | "in_review" | "denied" | "revised";
  claimed_by?: string;
  claimed_at?: string;
  revised_data?: any;
  denied_by?: string;
  revised_by?: string;
  messages?: Record<string, ChatMsg>;
}

interface ArchiveTicket {
  id: string;
  submitted_by: string;
  submitted_at: string;
  type: "sizing" | "costing" | "quotation";
  name: string;
  status: "approved";
  approved_by: string;
  approved_at: string;
  data: any;
}

interface ChatMsg {
  id: string;
  author: string;
  role: "u" | "e";
  text: string;
  sent_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  approved:  "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  denied:    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  revised:   "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
};

const STATUS_LABELS: Record<string, string> = {
  pending:   "Pending",
  in_review: "In Review",
  approved:  "Approved",
  denied:    "Denied",
  revised:   "Revised",
};

const TYPE_COLORS: Record<string, string> = {
  sizing:    "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  costing:   "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  quotation: "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function sortMsgs(messages?: Record<string, ChatMsg>): ChatMsg[] {
  if (!messages) return [];
  return Object.values(messages).sort((a, b) =>
    a.sent_at < b.sent_at ? -1 : 1
  );
}

export default function ApprovalsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { me, isExpert } = useMe();

  const [selected, setSelected] = useState<Ticket | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [denyMsg, setDenyMsg] = useState("");
  const [denyOpen, setDenyOpen] = useState(false);
  const [reviseMsg, setReviseMsg] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["approvals"],
    queryFn: () => api.get("/api/approvals").then((r) => r.data),
    refetchInterval: 10000,
  });

  const { data: archive = [] } = useQuery<ArchiveTicket[]>({
    queryKey: ["approvals-archive"],
    queryFn: () => api.get("/api/approvals/archive").then((r) => r.data),
    refetchInterval: 60000,
  });

  // poll detail when open
  const { data: liveTicket } = useQuery<Ticket>({
    queryKey: ["approval", selected?.id],
    queryFn: () => api.get(`/api/approvals/${selected!.id}`).then((r) => r.data),
    enabled: !!selected && detailOpen,
    refetchInterval: 4000,
  });

  const ticket = liveTicket ?? selected;
  const messages = sortMsgs(ticket?.messages);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const openTicket = (t: Ticket) => {
    setSelected(t);
    setDetOpen(true);
  };

  function setDetOpen(v: boolean) {
    setDetailOpen(v);
    if (!v) { setDenyOpen(false); setMsgText(""); setDenyMsg(""); setReviseMsg(""); }
  }

  // ── mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["approval", selected?.id] });
  };

  const claimMut = useMutation({
    mutationFn: () => api.post(`/api/approvals/${ticket!.id}/claim`),
    onSuccess: () => { toast.success("Claimed — you are now reviewing this"); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const approveMut = useMutation({
    mutationFn: () => api.post(`/api/approvals/${ticket!.id}/approve`),
    onSuccess: () => {
      toast.success("Approved — ticket archived");
      setDetOpen(false);
      qc.invalidateQueries({ queryKey: ["approvals"] });
      qc.invalidateQueries({ queryKey: ["approvals-archive"] });
    },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const denyMut = useMutation({
    mutationFn: () => api.post(`/api/approvals/${ticket!.id}/deny`, { message: denyMsg }),
    onSuccess: () => { toast.success("Denied"); setDenyOpen(false); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Failed")),
  });

  const msgMut = useMutation({
    mutationFn: (text: string) => api.post(`/api/approvals/${ticket!.id}/messages`, { text }),
    onSuccess: () => { setMsgText(""); invalidate(); },
    onError: (e: any) => toast.error(apiErr(e, "Failed to send")),
  });

  // ── restore helpers ────────────────────────────────────────────────────────

  const restoreData = async (data: any, type: string, action: "revise" | "resubmit" | "view") => {
    try {
      if (type === "sizing") {
        const { project_name, form, forms } = data;
        if (forms?.length > 0) {
          const res = await api.post("/api/sizing/restore", { project_name, forms });
          const dest = res.data.project ?? project_name;
          qc.invalidateQueries({ queryKey: ["sizing-projects"] });
          if (action !== "view") setPendingAction({ ticket_id: ticket!.id, ticket_name: ticket!.name, type: "sizing", action });
          toast.success(`Restored → ${dest}`);
          setDetOpen(false);
          router.push(`/dashboard/sizing/${encodeURIComponent(dest)}`);
        } else {
          const res = await api.post("/api/sizing/restore", { project_name, data: form });
          const dest = res.data.project ?? project_name;
          qc.invalidateQueries({ queryKey: ["sizing-projects"] });
          if (action !== "view") setPendingAction({ ticket_id: ticket!.id, ticket_name: ticket!.name, type: "sizing", action });
          toast.success(`Restored → ${dest} Sr.${res.data.sr_no}`);
          setDetOpen(false);
          router.push(`/dashboard/sizing/${encodeURIComponent(dest)}/${res.data.sr_no}`);
        }
      } else if (type === "costing") {
        await api.post("/api/costing/tree/bulk-restore", data.rows);
        qc.invalidateQueries({ queryKey: ["costing-tree"] });
        if (action !== "view") setPendingAction({ ticket_id: ticket!.id, ticket_name: ticket!.name, type: "costing", action });
        toast.success("Costing table restored");
        setDetOpen(false);
        router.push("/dashboard/costing");
      } else if (type === "quotation") {
        const res = await api.post("/api/quotation/restore", { meta: data.meta, items: data.items });
        qc.invalidateQueries({ queryKey: ["quotes"] });
        if (action !== "view") setPendingAction({ ticket_id: ticket!.id, ticket_name: ticket!.name, type: "quotation", action });
        toast.success(`Restored → quote ${res.data.code}`);
        setDetOpen(false);
        router.push(`/dashboard/quote/${encodeURIComponent(res.data.code)}`);
      }
    } catch (e: any) {
      toast.error(apiErr(e, "Restore failed"));
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────

  const pendingCount = tickets.filter((t) => t.status === "pending").length;
  const inReviewCount = tickets.filter((t) => t.status === "in_review").length;

  return (
    <div className="flex flex-col h-full p-5 gap-4 overflow-auto">
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="text-2xl font-bold">Approvals</h1>
        {isExpert && pendingCount > 0 && (
          <span className="text-xs bg-yellow-500 text-white rounded-full px-2 py-0.5 font-semibold">
            {pendingCount} pending
          </span>
        )}
        {!isExpert && (
          <span className="text-xs text-muted-foreground">
            Submit files for expert review from the Sizing, Costing, or Quote export dialogs.
          </span>
        )}
      </div>

      {/* Summary row for experts */}
      {isExpert && (
        <div className="flex gap-4 shrink-0">
          <div className="border rounded-md px-4 py-2 flex flex-col">
            <span className="text-2xl font-bold">{pendingCount}</span>
            <span className="text-xs text-muted-foreground">Awaiting claim</span>
          </div>
          <div className="border rounded-md px-4 py-2 flex flex-col">
            <span className="text-2xl font-bold">{inReviewCount}</span>
            <span className="text-xs text-muted-foreground">In review</span>
          </div>
          <div className="border rounded-md px-4 py-2 flex flex-col">
            <span className="text-2xl font-bold">{archive.length}</span>
            <span className="text-xs text-muted-foreground">Archived</span>
          </div>
        </div>
      )}

      {/* Ticket list */}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && tickets.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {isExpert ? "No approval tickets yet." : "You have no approval requests yet."}
        </p>
      )}

      <div className="overflow-auto border rounded-md shrink-0">
        {tickets.length > 0 && (
          <table className="table-grid w-full text-sm">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="text-left py-2 px-3">Name</th>
                <th className="text-center py-2 px-3 w-28">Type</th>
                <th className="text-center py-2 px-3 w-28">Status</th>
                {isExpert && <th className="text-left py-2 px-3 w-32">Submitted by</th>}
                <th className="text-left py-2 px-3 w-40">Date</th>
                <th className="text-left py-2 px-3 w-44">Reviewer</th>
                <th className="text-center py-2 px-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}
                  className="cursor-pointer hover:bg-accent"
                  onClick={() => openTicket(t)}>
                  <td className="py-2 px-3 font-medium">{t.name}</td>
                  <td className="py-1.5 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TYPE_COLORS[t.type] ?? ""}`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[t.status] ?? ""}`}>
                      {STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </td>
                  {isExpert && <td className="py-2 px-3 text-muted-foreground">{t.submitted_by}</td>}
                  <td className="py-2 px-3 text-muted-foreground text-xs">{fmtDate(t.submitted_at)}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">
                    {t.status === "in_review" ? `Being reviewed by ${t.claimed_by}` :
                     t.status === "denied"    ? `Denied by ${t.denied_by}` :
                     t.status === "revised"   ? `Revised by ${t.revised_by}` : "—"}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openTicket(t); }}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Archive ───────────────────────────────────────────────────────── */}
      {archive.length > 0 && (
        <div className="border rounded-md shrink-0">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold hover:bg-accent transition-colors"
            onClick={() => setArchiveOpen((v) => !v)}
          >
            <span className="flex items-center gap-2">
              Approved Archive
              <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 rounded-full px-2 py-0.5 font-semibold">
                {archive.length}
              </span>
            </span>
            <span className="text-muted-foreground">{archiveOpen ? "▲" : "▼"}</span>
          </button>
          {archiveOpen && (
            <div className="border-t overflow-auto">
              <table className="table-grid w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left py-2 px-3">Name</th>
                    <th className="text-center py-2 px-3 w-28">Type</th>
                    {isExpert && <th className="text-left py-2 px-3 w-32">Submitted by</th>}
                    <th className="text-left py-2 px-3 w-32">Approved by</th>
                    <th className="text-left py-2 px-3 w-40">Approved at</th>
                    <th className="text-center py-2 px-3 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {archive.map((a) => (
                    <tr key={a.id} className="hover:bg-accent">
                      <td className="py-2 px-3 font-medium">{a.name}</td>
                      <td className="py-1.5 px-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TYPE_COLORS[a.type] ?? ""}`}>
                          {a.type}
                        </span>
                      </td>
                      {isExpert && <td className="py-2 px-3 text-muted-foreground">{a.submitted_by}</td>}
                      <td className="py-2 px-3 text-muted-foreground">{a.approved_by}</td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">{fmtDate(a.approved_at)}</td>
                      <td className="py-1.5 px-3 text-center">
                        <Button size="sm" variant="outline"
                          onClick={() => restoreData(a.data, a.type, "view")}>
                          Restore
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Ticket Detail Dialog ──────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetOpen}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0">
          {ticket && (
            <>
              <DialogHeader className="p-4 border-b shrink-0">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <DialogTitle className="text-base truncate">{ticket.name}</DialogTitle>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${TYPE_COLORS[ticket.type] ?? ""}`}>
                        {ticket.type}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[ticket.status] ?? ""}`}>
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        by {ticket.submitted_by} · {fmtDate(ticket.submitted_at)}
                      </span>
                      {ticket.status === "in_review" && (
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                          Being reviewed by {ticket.claimed_by}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Actions bar */}
              <div className="px-4 py-3 border-b shrink-0 flex flex-wrap gap-2">
                {/* Expert actions */}
                {isExpert && ticket.status === "pending" && (
                  <Button size="sm" onClick={() => claimMut.mutate()} disabled={claimMut.isPending}>
                    Claim & Review
                  </Button>
                )}
                {isExpert && ticket.status === "in_review" && ticket.claimed_by === me?.username && (
                  <>
                    <Button size="sm" variant="outline"
                      onClick={() => restoreData(ticket.data, ticket.type, "revise")}>
                      Restore & Revise
                    </Button>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                      Approve
                    </Button>
                    <Button size="sm" variant="destructive"
                      onClick={() => setDenyOpen(true)}>
                      Deny
                    </Button>
                  </>
                )}

                {/* User actions */}
                {!isExpert && ticket.status === "revised" && (
                  <>
                    <Button size="sm" variant="outline"
                      onClick={() => restoreData(ticket.revised_data!, ticket.type, "resubmit")}>
                      Restore Revised & Update
                    </Button>
                    <Button size="sm" variant="outline"
                      onClick={() => restoreData(ticket.data, ticket.type, "resubmit")}>
                      Restore Original & Update
                    </Button>
                  </>
                )}
                {!isExpert && ticket.status === "denied" && (
                  <Button size="sm" variant="outline"
                    onClick={() => restoreData(ticket.data, ticket.type, "resubmit")}>
                    Restore & Re-submit
                  </Button>
                )}

                {/* Restore original always available */}
                {(isExpert || ticket.status === "pending" || ticket.status === "in_review") && (
                  <Button size="sm" variant="ghost"
                    onClick={() => restoreData(ticket.data, ticket.type, "view")}>
                    View (Restore Original)
                  </Button>
                )}
              </div>

              {/* Deny panel */}
              {denyOpen && (
                <div className="px-4 py-3 bg-red-50 dark:bg-red-950/20 border-b shrink-0 flex gap-2 items-center">
                  <Input
                    className="flex-1 text-sm"
                    placeholder="Reason for denial (optional)"
                    value={denyMsg}
                    onChange={(e) => setDenyMsg(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && denyMut.mutate()}
                  />
                  <Button size="sm" variant="destructive"
                    onClick={() => denyMut.mutate()} disabled={denyMut.isPending}>
                    Confirm Deny
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDenyOpen(false)}>Cancel</Button>
                </div>
              )}

              {/* Chat */}
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-auto p-4 flex flex-col gap-2">
                  {messages.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No messages yet.</p>
                  )}
                  {messages.map((msg) => {
                    const isMe = msg.author === me?.username;
                    const isExpertMsg = msg.role === "e";
                    return (
                      <div key={msg.id}
                        className={`flex flex-col gap-0.5 max-w-[85%] ${isMe ? "self-end items-end" : "self-start items-start"}`}>
                        <div className={`rounded-lg px-3 py-2 text-sm ${
                          msg.text.startsWith("[") ? "bg-muted text-muted-foreground italic text-xs" :
                          isMe ? "bg-primary text-primary-foreground" :
                          isExpertMsg ? "bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100" :
                          "bg-muted"
                        }`}>
                          {msg.text}
                        </div>
                        <span className="text-[10px] text-muted-foreground px-1">
                          {msg.author}{isExpertMsg ? " (expert)" : ""} · {fmtDate(msg.sent_at)}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                {/* Message input */}
                <div className="border-t p-3 flex gap-2 shrink-0">
                  <Input
                    className="flex-1 text-sm"
                    placeholder="Type a message…"
                    value={msgText}
                    onChange={(e) => setMsgText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && msgText.trim()) {
                        msgMut.mutate(msgText.trim());
                      }
                    }}
                  />
                  <Button size="sm"
                    disabled={!msgText.trim() || msgMut.isPending}
                    onClick={() => msgMut.mutate(msgText.trim())}>
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
