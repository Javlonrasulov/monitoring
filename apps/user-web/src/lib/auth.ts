import type { DeviceSession, PairResponse } from "./types";

const SESSION_KEY = "levelapp_device_session";

export function getSession(): DeviceSession | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeviceSession;
    if (!parsed?.deviceToken || !parsed?.deviceId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return getSession()?.deviceToken ?? null;
}

export function isPaired(): boolean {
  return Boolean(getToken());
}

export function savePairSession(res: PairResponse): DeviceSession {
  const session: DeviceSession = {
    deviceId: res.deviceId,
    deviceName: res.name,
    organizationId: res.organizationId,
    branchId: res.branchId,
    deviceToken: res.deviceToken,
    apiKey: res.apiKey,
    userId: res.userId ?? null,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function updateSessionToken(deviceToken: string): void {
  const session = getSession();
  if (!session) return;
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ ...session, deviceToken }),
  );
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
