import axios, { type InternalAxiosRequestConfig } from "axios";
import type { AuthResponse } from "@resort/contracts";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const ACCESS_TOKEN_KEY = "resort_access_token";

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  resortAuthRetried?: boolean;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90_000,
});

const authApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
});

let loginPromise: Promise<AuthResponse> | null = null;

export function tokenIsCurrent(token: string): boolean {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return false;
    const base64 = encodedPayload.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}

async function loginDemo(): Promise<AuthResponse> {
  if (!loginPromise) {
    loginPromise = authApi
      .post<AuthResponse>("/auth/login", {
        username: "demo",
        password: "Demo12345!",
      })
      .then(({ data }) => {
        sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
        return data;
      })
      .finally(() => {
        loginPromise = null;
      });
  }

  return loginPromise;
}

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !error.config) {
      return Promise.reject(error);
    }

    const config = error.config as RetryableRequestConfig;
    if (config.resortAuthRetried || config.url?.includes("/auth/login")) {
      return Promise.reject(error);
    }

    config.resortAuthRetried = true;
    const session = await loginDemo();
    config.headers.Authorization = `Bearer ${session.accessToken}`;
    return api.request(config);
  },
);

export async function ensureDemoSession(): Promise<AuthResponse> {
  const existing = sessionStorage.getItem(ACCESS_TOKEN_KEY);

  if (existing && tokenIsCurrent(existing)) {
    return {
      accessToken: existing,
      user: {
        id: "demo",
        username: "demo",
        displayName: "Emma",
        countryCode: "DE",
      },
    };
  }

  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  return loginDemo();
}

export function apiErrorMessage(cause: unknown): string {
  if (!axios.isAxiosError(cause)) {
    return cause instanceof Error ? cause.message : "Image analysis failed.";
  }

  if (cause.code === "ECONNABORTED") {
    return "Image analysis timed out. Please try the same photo again.";
  }

  const responseMessage = cause.response?.data && typeof cause.response.data === "object"
    ? (cause.response.data as { message?: string }).message
    : undefined;

  if (Array.isArray(responseMessage)) return responseMessage.join(" ");
  if (typeof responseMessage === "string") return responseMessage;
  if (!cause.response) return "Cannot reach the local API. Check that pnpm dev is still running.";
  return `Image analysis failed (HTTP ${cause.response.status}). Please try again.`;
}

export function isNetworkError(cause: unknown): boolean {
  return axios.isAxiosError(cause) && !cause.response;
}
