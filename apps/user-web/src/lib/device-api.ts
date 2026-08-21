import { api, fileUrl } from "./api";
import type {
  ChatMediaPage,
  ChatMessageDto,
  ChatMessagesPage,
  ChatSearchPage,
  ChatThreadDto,
  DeviceMeResponse,
  DeviceRecordingDto,
  InitUploadResponse,
  LinkDeviceResponse,
  LinkedDeviceDto,
  PairingCodeResponse,
  PairResponse,
  PairStatusResponse,
  PaymentInvoiceDto,
  PlaybackUrlResponse,
  SubscriptionDto,
  SupportSummaryDto,
  ViewerTokenResponse,
} from "./types";

export const deviceApi = {
  pairStatus: (phone: string) =>
    api.get<PairStatusResponse>(
      `/devices/pair-status?phone=${encodeURIComponent(phone)}`,
      { auth: false },
    ),

  pair: (body: {
    phone: string;
    password: string;
    name?: string;
    code?: string;
    appVersion?: string;
    deviceModel?: string;
  }) =>
    api.post<PairResponse>("/devices/pair", body, { auth: false }),

  guestSupport: (body: {
    installId: string;
    name?: string;
    appVersion?: string;
    deviceModel?: string;
    installSignals?: string[];
  }) =>
    api.post<PairResponse & { guest?: boolean }>(
      "/devices/guest-support",
      body,
      { auth: false },
    ),

  me: () => api.get<DeviceMeResponse>("/devices/me"),

  updateProfile: (body: { name?: string; phone?: string }) =>
    api.patch<DeviceMeResponse>("/devices/me", body),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.patch<{ ok?: boolean }>("/devices/me/password", body),

  uploadAvatar: (imageBase64: string) =>
    api.post<DeviceMeResponse>("/devices/me/avatar", { imageBase64 }),

  deleteAvatar: () => api.delete<{ ok?: boolean }>("/devices/me/avatar"),

  linked: () => api.get<LinkedDeviceDto[]>("/devices/me/linked"),

  unlink: (id: string) =>
    api.delete<{ ok?: boolean }>(`/devices/me/linked/${id}`),

  createPairingCode: () =>
    api.post<PairingCodeResponse>("/devices/me/pairing-codes", {}),

  linkDevice: (code: string) =>
    api.post<LinkDeviceResponse>("/devices/me/link", { code }),

  setCameraFacing: (id: string, facing: "FRONT" | "BACK") =>
    api.post<{ ok?: boolean }>(`/devices/me/linked/${id}/camera`, { facing }),

  chats: () => api.get<ChatThreadDto[]>("/device-chats"),

  openSupport: () => api.post<ChatThreadDto>("/device-chats/support"),

  supportSummary: () =>
    api.get<SupportSummaryDto>("/device-chats/support/summary"),

  thread: (id: string) => api.get<ChatThreadDto>(`/device-chats/${id}`),

  messages: (id: string, cursor?: string | null, take = 50) => {
    const q = new URLSearchParams({ take: String(take) });
    if (cursor) q.set("cursor", cursor);
    return api.get<ChatMessagesPage>(`/device-chats/${id}/messages?${q}`);
  },

  searchMessages: (id: string, q: string) =>
    api.get<ChatSearchPage>(
      `/device-chats/${id}/search?q=${encodeURIComponent(q)}`,
    ),

  media: (id: string, kind: string) =>
    api.get<ChatMediaPage>(
      `/device-chats/${id}/media?kind=${encodeURIComponent(kind)}`,
    ),

  sendMessage: (
    id: string,
    body: {
      text: string;
      replyToId?: string;
      clientId?: string;
      forwardedFromId?: string;
    },
  ) => api.post<ChatMessageDto>(`/device-chats/${id}/messages`, body),

  editMessage: (threadId: string, messageId: string, text: string) =>
    api.patch<ChatMessageDto>(
      `/device-chats/${threadId}/messages/${messageId}`,
      { text },
    ),

  deleteMessage: (
    threadId: string,
    messageId: string,
    forEveryone = false,
  ) =>
    api.delete<ChatMessageDto>(
      `/device-chats/${threadId}/messages/${messageId}?forEveryone=${forEveryone}`,
    ),

  react: (threadId: string, messageId: string, emoji: string) =>
    api.post<ChatMessageDto>(
      `/device-chats/${threadId}/messages/${messageId}/react`,
      { emoji },
    ),

  markRead: (threadId: string) =>
    api.post<{ ok?: boolean }>(`/device-chats/${threadId}/read`),

  cancelUpload: (threadId: string, uploadId: string) =>
    api.delete<{ ok?: boolean }>(
      `/device-chats/${threadId}/uploads/${uploadId}`,
    ),

  subscription: () =>
    api.get<SubscriptionDto>("/device-subscriptions/me"),

  createInvoice: (plan: "PRO" | "PRO_PLUS") =>
    api.post<PaymentInvoiceDto>("/device-subscriptions/invoices", { plan }),

  invoice: (id: string) =>
    api.get<PaymentInvoiceDto>(`/device-subscriptions/invoices/${id}`),

  viewerToken: (deviceId: string) =>
    api.post<ViewerTokenResponse>(
      `/streaming/devices/${deviceId}/device-viewer-token`,
    ),

  deviceRecordings: async (deviceId: string) => {
    const res = await api.get<{ items?: DeviceRecordingDto[] } | DeviceRecordingDto[]>(
      `/recordings/device/${deviceId}`,
    );
    return Array.isArray(res) ? res : (res.items ?? []);
  },

  startRecording: (deviceId: string) =>
    api.post<{ ok?: boolean }>(`/recordings/device/${deviceId}/start`, {}),

  playbackUrl: (body: { id: string }) =>
    api.post<PlaybackUrlResponse>("/recordings/device/playback-url", body),
};

export type UploadOpts = {
  messageType: string;
  replyToId?: string;
  clientId?: string;
  text?: string;
  albumId?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  waveformJson?: string;
  onProgress?: (ratio: number) => void;
};

export async function uploadChatFile(
  threadId: string,
  file: File,
  opts: UploadOpts,
): Promise<ChatMessageDto> {
  const init = await api.post<InitUploadResponse>(
    `/device-chats/${threadId}/uploads`,
    {
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      messageType: opts.messageType,
      replyToId: opts.replyToId,
      clientId: opts.clientId,
      text: opts.text,
      albumId: opts.albumId,
      durationMs: opts.durationMs,
      width: opts.width,
      height: opts.height,
      waveformJson: opts.waveformJson,
    },
  );

  const chunkSize = init.chunkSize || 262144;
  const buffer = await file.arrayBuffer();
  const total = Math.ceil(buffer.byteLength / chunkSize) || 1;

  for (let i = 0; i < total; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, buffer.byteLength);
    const chunk = buffer.slice(start, end);
    await api.putBinary(
      `/device-chats/${threadId}/uploads/${init.uploadId}/chunks/${i}`,
      chunk,
    );
    opts.onProgress?.((i + 1) / total);
  }

  return api.post<ChatMessageDto>(
    `/device-chats/${threadId}/uploads/${init.uploadId}/complete`,
  );
}

export function authFileUrl(
  threadId: string,
  messageId: string,
  thumb = false,
): string {
  return fileUrl(threadId, messageId, thumb);
}
