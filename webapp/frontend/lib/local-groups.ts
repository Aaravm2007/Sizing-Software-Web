const KEY = "local_groups_v1";

export interface LocalGroupItem {
  type: "sizing" | "costing" | "quotation";
  name: string;
  customer: string;
  data: any;
}

export interface LocalGroup {
  local_id: string;
  firebase_id?: string;           // set when this was restored from Firebase
  name: string;
  items: LocalGroupItem[];        // new items not yet saved to Firebase
  original_record_ids?: string[]; // Firebase record IDs at restore time
  removed_ids?: string[];         // which original_record_ids user removed
  created_at: string;
}

function load(): LocalGroup[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(groups: LocalGroup[]) {
  localStorage.setItem(KEY, JSON.stringify(groups));
}

export function getLocalGroups(): LocalGroup[] {
  return load();
}

export function createLocalGroup(name: string): LocalGroup {
  const group: LocalGroup = {
    local_id: crypto.randomUUID(),
    name,
    items: [],
    created_at: new Date().toISOString(),
  };
  const groups = load();
  groups.push(group);
  save(groups);
  return group;
}

export function addItemToGroup(local_id: string, item: LocalGroupItem): void {
  const groups = load();
  const g = groups.find((g) => g.local_id === local_id);
  if (g) { g.items.push(item); save(groups); }
}

export function removeItemFromGroup(local_id: string, index: number): void {
  const groups = load();
  const g = groups.find((g) => g.local_id === local_id);
  if (g) { g.items.splice(index, 1); save(groups); }
}

export function removeOriginalRecord(local_id: string, record_id: string): void {
  const groups = load();
  const g = groups.find((g) => g.local_id === local_id);
  if (g) {
    g.removed_ids = [...(g.removed_ids ?? []), record_id];
    save(groups);
  }
}

export function renameLocalGroup(local_id: string, name: string): void {
  const groups = load();
  const g = groups.find((g) => g.local_id === local_id);
  if (g) { g.name = name; save(groups); }
}

export function discardLocalGroup(local_id: string): void {
  save(load().filter((g) => g.local_id !== local_id));
}

export function restoreFirebaseGroupLocally(
  firebase_id: string,
  name: string,
  record_ids: string[],
): LocalGroup {
  const group: LocalGroup = {
    local_id: crypto.randomUUID(),
    firebase_id,
    name,
    items: [],
    original_record_ids: [...record_ids],
    created_at: new Date().toISOString(),
  };
  const groups = load();
  groups.push(group);
  save(groups);
  return group;
}
