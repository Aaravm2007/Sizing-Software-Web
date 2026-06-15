import axios from "axios";
import Cookies from "js-cookie";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      Cookies.remove("token");
      Cookies.remove("username");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export function setAuthToken(token: string, username: string) {
  Cookies.set("token", token, { expires: 1 });
  Cookies.set("username", username, { expires: 1 });
}

export function clearAuth() {
  Cookies.remove("token");
  Cookies.remove("username");
}

export function getUsername(): string {
  return Cookies.get("username") || "";
}

export function isAuthenticated(): boolean {
  return !!Cookies.get("token");
}

/** Convert an axios error to a plain string suitable for toast.error() */
export function apiErr(e: any, fallback = "An error occurred"): string {
  const detail = e?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  // Pydantic v2 returns an array of {type, loc, msg, input}
  if (Array.isArray(detail)) {
    return detail.map((d: any) => {
      if (typeof d === "string") return d;
      const field = Array.isArray(d?.loc) ? d.loc.filter((s: any) => s !== "body").join(".") : "";
      const msg: string = d?.msg ?? JSON.stringify(d);
      return field ? `${field}: ${msg}` : msg;
    }).join("; ");
  }
  return String(detail);
}
