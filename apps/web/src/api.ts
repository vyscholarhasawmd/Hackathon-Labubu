import axios from "axios";
import type { AuthResponse } from "@resort/contracts";

export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? "/api/v1", timeout: 45_000 });

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("resort_access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function ensureDemoSession(): Promise<AuthResponse> {
  const existing = sessionStorage.getItem("resort_access_token");
  if (existing) return { accessToken: existing, user: { id: "demo", username: "demo", displayName: "Emma", countryCode: "DE" } };
  const { data } = await api.post<AuthResponse>("/auth/login", { username: "demo", password: "Demo12345!" });
  sessionStorage.setItem("resort_access_token", data.accessToken);
  return data;
}
