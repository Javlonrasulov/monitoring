import { api } from "./api";
import type { AuthUser, LoginResponse } from "./types";

export type { AuthUser };

const TOKEN_KEY = "monitor_token";
const USER_KEY = "monitor_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await api.post<LoginResponse>(
    "/auth/login",
    { email, password },
    { auth: false },
  );

  localStorage.setItem(TOKEN_KEY, data.accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  void import("./push").then((m) => m.registerWebPush());
  return data.user;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
