import { clearSession, getToken } from "./auth";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestOpts = {
  auth?: boolean;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOpts = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...opts.headers,
  };

  if (opts.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (body instanceof ArrayBuffer || body instanceof Blob) {
      payload = body;
    } else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: payload,
    signal: opts.signal,
  });

  if (res.status === 401 && opts.auth !== false) {
    clearSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    let errBody: unknown = null;
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      errBody = await res.json();
      if (
        errBody &&
        typeof errBody === "object" &&
        "message" in errBody &&
        typeof (errBody as { message: unknown }).message === "string"
      ) {
        message = (errBody as { message: string }).message;
      } else if (
        errBody &&
        typeof errBody === "object" &&
        "message" in errBody &&
        Array.isArray((errBody as { message: unknown }).message)
      ) {
        message = ((errBody as { message: string[] }).message).join(", ");
      }
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message, errBody);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOpts) =>
    request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    request<T>("POST", path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    request<T>("PUT", path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    request<T>("PATCH", path, body, opts),
  delete: <T>(path: string, opts?: RequestOpts) =>
    request<T>("DELETE", path, undefined, opts),
  putBinary: <T>(path: string, body: ArrayBuffer, opts?: RequestOpts) =>
    request<T>("PUT", path, body, {
      ...opts,
      headers: {
        "Content-Type": "application/octet-stream",
        ...opts?.headers,
      },
    }),
};

export function avatarUrl(userId: string, version?: string | null): string {
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${API_URL}/device-chats/avatars/${userId}${v}`;
}

export function fileUrl(
  threadId: string,
  messageId: string,
  thumb = false,
): string {
  const suffix = thumb ? "/thumb" : "";
  return `${API_URL}/device-chats/${threadId}/files/${messageId}${suffix}`;
}
