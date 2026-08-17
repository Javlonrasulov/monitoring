export type DeviceStatus =
  | "ONLINE"
  | "OFFLINE"
  | "CONNECTING"
  | "STREAMING"
  | "ERROR";

export type StreamQuality = "LOW" | "MEDIUM" | "HIGH";

export type CameraFacing = "FRONT" | "BACK";

export type NetworkType = "WIFI" | "MOBILE" | "UNKNOWN";

export interface Branch {
  id: string;
  name: string;
  organizationId: string;
}

export interface Device {
  id: string;
  name: string;
  organizationId: string;
  branchId: string;
  status: DeviceStatus;
  lastSeen: string | null;
  batteryPercent: number | null;
  charging: boolean | null;
  batterySaver: boolean | null;
  thermalState: string | null;
  networkType: NetworkType | null;
  networkQuality: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  appVersion: string | null;
  androidVersion: string | null;
  deviceModel: string | null;
  disabled: boolean;
  cameraFacing?: CameraFacing;
  branch?: Branch;
  room?: string | null;
}

export type RecordingStatus =
  | "RECORDING"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "DELETED";

export interface RecordingSegment {
  id: string;
  organizationId: string;
  deviceId: string;
  deviceName: string;
  cameraFacing: CameraFacing;
  quality: StreamQuality | string;
  status: RecordingStatus;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  fileSize: number;
  storagePath: string;
  errorMessage: string | null;
  createdAt: string;
}

export interface RecordingListResponse {
  items: RecordingSegment[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RecordingStorage {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  recordingBytes: number;
  usedRatio: number;
  level: "ok" | "warning" | "critical" | "cleanup";
}

export interface RecordingSettings {
  retentionDays: number;
  autoCleanup: boolean;
  segmentSeconds: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string;
  organizationName: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export interface PairingCodeResponse {
  id: string;
  code: string;
  expiresAt: string;
  branchId: string;
  deviceNameHint?: string | null;
}

export interface ViewerTokenResponse {
  token: string;
  expiresIn: number;
  path: string;
  whepUrl: string;
  device: {
    id: string;
    name: string;
    status: DeviceStatus;
  };
}

export interface DeviceStatusPayload {
  deviceId: string;
  status?: DeviceStatus;
  batteryPercent?: number | null;
  charging?: boolean | null;
  networkType?: NetworkType | null;
  networkQuality?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  lastSeen?: string | null;
  appVersion?: string | null;
  androidVersion?: string | null;
  deviceModel?: string | null;
  cameraFacing?: CameraFacing;
}
