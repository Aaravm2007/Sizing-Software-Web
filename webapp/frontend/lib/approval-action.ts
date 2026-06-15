const KEY = "pending_approval_action";

export interface PendingApprovalAction {
  ticket_id: string;
  ticket_name: string;
  type: "sizing" | "costing" | "quotation";
  action: "revise" | "resubmit";
}

export function getPendingAction(): PendingApprovalAction | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setPendingAction(a: PendingApprovalAction) {
  localStorage.setItem(KEY, JSON.stringify(a));
}

export function clearPendingAction() {
  localStorage.removeItem(KEY);
}
