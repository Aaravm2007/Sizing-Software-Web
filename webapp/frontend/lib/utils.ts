import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert yyyy-mm-dd → dd-mm-yyyy. Passes through anything that doesn't match. */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
}

export function fmtInr(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  if (isNaN(num) || !isFinite(num)) return "";
  const abs = Math.abs(num);
  const [intStr, decStr] = abs.toFixed(2).split(".");
  let grouped: string;
  if (intStr.length <= 3) {
    grouped = intStr;
  } else {
    const last3 = intStr.slice(-3);
    const rest = intStr.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
  }
  const dec = decStr && decStr !== "00" ? "." + decStr : "";
  return (num < 0 ? "-" : "") + grouped + dec;
}
