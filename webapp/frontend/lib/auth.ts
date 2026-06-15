import { api, setAuthToken, clearAuth } from "./api";

export interface LoginPayload { username: string; password: string }
export interface RegisterPayload {
  username: string; password: string;
  admin_username: string; admin_password: string; email?: string;
}

export async function loginWithPassword(payload: LoginPayload) {
  const { data } = await api.post("/api/auth/login", payload);
  setAuthToken(data.access_token, data.username);
  return data;
}

export async function registerUser(payload: RegisterPayload) {
  const { data } = await api.post("/api/auth/register", payload);
  return data;
}

export async function loginWithGoogle(id_token: string) {
  const { data } = await api.post("/api/auth/google-login", { id_token });
  setAuthToken(data.access_token, data.username);
  return data;
}

export async function registerWithGoogle(params: {
  id_token: string; username: string; password: string;
  admin_username: string; admin_password: string;
}) {
  const { data } = await api.post(
    `/api/auth/google-register?id_token=${encodeURIComponent(params.id_token)}&username=${encodeURIComponent(params.username)}&password=${encodeURIComponent(params.password)}&admin_username=${encodeURIComponent(params.admin_username)}&admin_password=${encodeURIComponent(params.admin_password)}`
  );
  return data;
}

export function logout() {
  clearAuth();
  window.location.href = "/login";
}
