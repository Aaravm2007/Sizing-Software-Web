const KEY = "group_draft_basket";

export interface BasketItem {
  type: "sizing" | "costing" | "quotation";
  name: string;
  customer: string;
  data: any;
}

export function getBasket(): BasketItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

export function addToBasket(item: BasketItem): void {
  const items = getBasket();
  items.push(item);
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("group-basket-change"));
}

export function removeFromBasket(index: number): void {
  const items = getBasket();
  items.splice(index, 1);
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("group-basket-change"));
}

export function clearBasket(): void {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("group-basket-change"));
}
