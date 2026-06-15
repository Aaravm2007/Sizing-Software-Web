import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
