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

/** True only for a real phone login — unlocks the full app. */
export function isPaired(): boolean {
  return isFullAccount();
}

export function isGuestSession(): boolean {
  return Boolean(getSession()?.guest);
}

export function isFullAccount(): boolean {
  const session = getSession();
  return Boolean(session?.deviceToken && session.deviceId && !session.guest);
}

/** Any device token (full account or guest Call Center). */
export function hasDeviceSession(): boolean {
  return Boolean(getToken());
}

export function savePairSession(
  res: PairResponse & { guest?: boolean },
): DeviceSession {
  const session: DeviceSession = {
    deviceId: res.deviceId,
    deviceName: res.name,
    organizationId: res.organizationId,
    branchId: res.branchId,
    deviceToken: res.deviceToken,
    apiKey: res.apiKey,
    userId: res.userId ?? null,
    guest: Boolean(res.guest),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (!session.guest) {
    void import("./push").then((m) => m.registerWebPush());
  }
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
