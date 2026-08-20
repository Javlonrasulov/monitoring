import { API_URL, api, getStoredToken } from "./api";

export type UploadedMessage = {
  id: string;
  text: string | null;
  messageType: string;
  createdAt: string;
  senderUserId: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  editedAt: string | null;
  deletedForEveryone: boolean;
  fileName: string | null;
  fileSize: number | null;
  durationMs: number | null;
  hasFile: boolean;
  hasThumbnail: boolean;
  forwarded: boolean;
  mine: boolean;
  system?: boolean;
  replyTo: null;
  reactions: [];
};

type InitUploadResponse = {
  uploadId: string;
  chunkSize: number;
};

function messageTypeFor(file: File): "IMAGE" | "VIDEO" | "FILE" {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  return "FILE";
}

export async function uploadChatFile(
  threadId: string,
  file: File,
  opts?: { replyToId?: string; text?: string },
): Promise<UploadedMessage> {
  const token = getStoredToken();
  if (!token) throw new Error("Not signed in");

  const init = await api.post<InitUploadResponse>(`/chats/${threadId}/uploads`, {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    messageType: messageTypeFor(file),
    replyToId: opts?.replyToId,
    text: opts?.text,
  });

  const chunkSize = Math.max(init.chunkSize, 32 * 1024);
  let index = 0;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    const chunk = file.slice(offset, offset + chunkSize);
    const res = await fetch(
      `${API_URL}/chats/${threadId}/uploads/${init.uploadId}/chunks/${index}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: chunk,
      },
    );
    if (!res.ok) {
      await api.delete(`/chats/${threadId}/uploads/${init.uploadId}`).catch(() => undefined);
      throw new Error(`Upload failed (${res.status})`);
    }
    index += 1;
  }

  return api.post<UploadedMessage>(
    `/chats/${threadId}/uploads/${init.uploadId}/complete`,
    {},
  );
}
