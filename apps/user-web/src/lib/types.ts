export type PairStatusResponse = {
  exists: boolean;
  requiresPassword: boolean;
  trialBlocked?: boolean;
  trialEnded?: boolean;
  existingPhone?: string | null;
  existingName?: string | null;
  message?: string | null;
};

export type PairResponse = {
  deviceId: string;
  name: string;
  organizationId: string;
  branchId: string;
  deviceToken: string;
  apiKey: string;
  userId?: string | null;
  threadId?: string | null;
};

export type DeviceSession = {
  deviceId: string;
  deviceName: string;
  organizationId: string;
  branchId: string;
  deviceToken: string;
  apiKey: string;
  userId: string | null;
};

export type DeviceMeResponse = {
  id?: string | null;
  status?: string | null;
  cameraFacing?: string | null;
  cameraFacingRev?: number;
  userId?: string | null;
  name?: string | null;
  phone?: string | null;
  hasAvatar?: boolean;
  avatarUpdatedAt?: string | null;
};

export type ChatPeer = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  lastSeenAt?: string | null;
  email?: string | null;
  deviceId?: string | null;
  phone?: string | null;
  hasAvatar?: boolean;
  avatarUpdatedAt?: string | null;
};

export type ChatThreadDto = {
  id: string;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  owner?: ChatPeer | null;
  peer?: ChatPeer | null;
  kind?: string | null;
  viewerUserId?: string | null;
  unreadCount?: number;
  counterpartName?: string | null;
  counterpartUserId?: string | null;
  counterpartPhone?: string | null;
  counterpartHasAvatar?: boolean;
  counterpartAvatarUpdatedAt?: string | null;
  online?: boolean;
  lastSeenAt?: string | null;
};

export type ChatReplyDto = {
  id?: string | null;
  text?: string | null;
  messageType?: string | null;
  senderUserId?: string | null;
  fileName?: string | null;
  deletedForEveryone?: boolean;
};

export type ChatReactionDto = {
  emoji: string;
  count?: number;
  mine?: boolean;
};

export type ChatMessageDto = {
  id: string;
  threadId?: string | null;
  senderUserId?: string | null;
  receiverUserId?: string | null;
  messageType?: string | null;
  text?: string | null;
  createdAt?: string | null;
  deliveredAt?: string | null;
  readAt?: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  deletedForEveryone?: boolean;
  clientId?: string | null;
  albumId?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  durationMs?: number | null;
  width?: number | null;
  height?: number | null;
  waveform?: number[] | null;
  hasFile?: boolean;
  hasThumbnail?: boolean;
  forwarded?: boolean;
  replyTo?: ChatReplyDto | null;
  reactions?: ChatReactionDto[];
  mine?: boolean;
  system?: boolean;
};

export type ChatMessagesPage = {
  items: ChatMessageDto[];
  nextCursor?: string | null;
};

export type SupportSummaryDto = {
  threadId?: string | null;
  unreadCount?: number;
};

export type SubscriptionDto = {
  id?: string | null;
  status?: string | null;
  plan?: string | null;
  maxDevices?: number | null;
  deviceCount?: number | null;
  devicesUsed?: string | null;
  expiresAt?: string | null;
  startedAt?: string | null;
  active?: boolean | null;
  trial?: boolean | null;
  canWatchVideo?: boolean | null;
  canWatchAudio?: boolean | null;
  canRecordings?: boolean | null;
  canLinkTwoApps?: boolean | null;
  priceProUsd?: number | null;
  priceProPlusUsd?: number | null;
};

export type PairingCodeResponse = {
  id?: string | null;
  code: string;
  expiresAt?: string | null;
  qrPayload?: string | null;
};

export type LinkedDeviceDto = {
  id: string;
  name: string;
  status?: string | null;
  lastSeen?: string | null;
  deviceModel?: string | null;
  cameraFacing?: string | null;
};

export type LinkDeviceResponse = {
  ok?: boolean | null;
  linkedToDeviceId?: string | null;
  organizationId?: string | null;
  branchId?: string | null;
  deviceId?: string | null;
  name?: string | null;
  deviceToken?: string | null;
};

export type PaymentInvoiceDto = {
  id: string;
  plan?: string | null;
  status?: string | null;
  priceUsd?: number | null;
  payAddress?: string;
  payAmount?: string;
  payCurrency?: string;
  network?: string | null;
  expiresAt?: string | null;
  remainingSeconds?: number;
  paid?: boolean;
  checkoutUrl?: string | null;
  guardarianUrl?: string | null;
};

export type ViewerTokenResponse = {
  token: string;
  expiresIn?: number;
  path?: string | null;
  whepUrl: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  canRecordings?: boolean;
};

export type ChatSearchPage = {
  items: ChatMessageDto[];
};

export type ChatMediaCounts = {
  photos?: number;
  videos?: number;
  notes?: number;
  files?: number;
  voice?: number;
  links?: number;
};

export type ChatMediaPage = {
  counts?: ChatMediaCounts;
  items: ChatMessageDto[];
};

export type DeviceRecordingDto = {
  id: string;
  deviceId?: string | null;
  status?: string | null;
  cameraFacing?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationSec?: number | null;
  fileSize?: number | null;
};

export type PlaybackUrlResponse = {
  token?: string;
  url: string;
  expiresIn?: number;
};

export type InitUploadResponse = {
  uploadId: string;
  chunkSize?: number;
  receivedChunks?: number;
};
