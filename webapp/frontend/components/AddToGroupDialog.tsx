"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  getLocalGroups,
  createLocalGroup,
  addItemToGroup,
  type LocalGroupItem,
} from "@/lib/local-groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface AddToGroupDialogProps {
  open: boolean;
  onClose: () => void;
  item: LocalGroupItem;
}

export default function AddToGroupDialog({ open, onClose, item }: AddToGroupDialogProps) {
  const [groups, setGroups] = useState(getLocalGroups());
  const [selected, setSelected] = useState<string | "new">("new");
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (open) {
      const g = getLocalGroups();
      setGroups(g);
      setSelected(g.length > 0 ? g[0].local_id : "new");
      setNewName("");
    }
  }, [open]);

  const handleAdd = () => {
    if (selected === "new") {
      const name = newName.trim() || item.name;
      const group = createLocalGroup(name);
      addItemToGroup(group.local_id, item);
      toast.success(`Created group "${name}" and added item`);
    } else {
      addItemToGroup(selected, item);
      const g = groups.find((g) => g.local_id === selected);
      toast.success(`Added to group "${g?.name ?? ""}"`);
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to Group</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {groups.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Existing local groups</Label>
              <div className="border rounded-md overflow-auto max-h-40">
                {groups.map((g) => (
                  <div
                    key={g.local_id}
                    className={`px-3 py-2 cursor-pointer text-sm hover:bg-accent ${
                      selected === g.local_id ? "bg-primary/20" : ""
                    }`}
                    onClick={() => setSelected(g.local_id)}
                  >
                    {g.name}
                    <span className="text-xs text-muted-foreground ml-2">
                      ({g.items.length} item{g.items.length !== 1 ? "s" : ""})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                checked={selected === "new"}
                onChange={() => setSelected("new")}
              />
              Create new group
            </label>
            {selected === "new" && (
              <Input
                placeholder={`Group name (default: ${item.name})`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAdd}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
