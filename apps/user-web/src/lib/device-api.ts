import { api, fileUrl } from "./api";
import type {
  ChatMessageDto,
  ChatMessagesPage,
  ChatThreadDto,
  DeviceMeResponse,
  InitUploadResponse,
  LinkDeviceResponse,
  LinkedDeviceDto,
  PairingCodeResponse,
  PairResponse,
  PairStatusResponse,
  PaymentInvoiceDto,
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

  me: () => api.get<DeviceMeResponse>("/devices/me"),

  updateProfile: (body: { name?: string; phone?: string }) =>
    api.patch<DeviceMeResponse>("/devices/me", body),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.patch<{ ok?: boolean }>("/devices/me/password", body),

  uploadAvatar: (imageBase64: string) =>
    api.post<DeviceMeResponse>("/devices/me/avatar", { imageBase64 }),

  deleteAvatar: () => api.delete<{ ok?: boolean }>("/devices/me/avatar"),

  linked: () => api.get<LinkedDeviceDto[]>("/devices/me/linked"),

  unlink: (id: string) => api.delete<{ ok?: boolean }>(`/devices/me/linked/${id}`),

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
    api.patch<ChatMessageDto>(`/device-chats/${threadId}/messages/${messageId}`, {
      text,
    }),

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
};

export async function uploadChatFile(
  threadId: string,
  file: File,
  opts: {
    messageType: string;
    replyToId?: string;
    clientId?: string;
    text?: string;
    onProgress?: (ratio: number) => void;
  },
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
