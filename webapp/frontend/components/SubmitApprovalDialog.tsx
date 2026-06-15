"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export interface ApprovalItem {
  type: "sizing" | "costing" | "quotation";
  name: string;
  data: any;
}

interface Props {
  open: boolean;
  onClose: () => void;
  item: ApprovalItem;
}

export default function SubmitApprovalDialog({ open, onClose, item }: Props) {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await api.post("/api/approvals", {
        type: item.type,
        name: item.name,
        data: item.data,
        message,
      });
      toast.success("Submitted for approval — experts have been notified");
      setMessage("");
      onClose();
    } catch (e: any) {
      toast.error(apiErr(e, "Failed to submit"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Submit for Approval</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="text-sm border rounded-md px-3 py-2 bg-muted/40">
            <span className="font-medium">{item.name}</span>
            <span className="text-xs text-muted-foreground ml-2 capitalize">({item.type})</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-sm">Note to experts (optional)</Label>
            <Input
              placeholder="e.g. please check cell sizing…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
