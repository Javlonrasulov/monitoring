export enum DeviceStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  CONNECTING = 'CONNECTING',
  STREAMING = 'STREAMING',
  ERROR = 'ERROR',
}

export enum StreamQuality {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum DeviceErrorCode {
  CAMERA_UNAVAILABLE = 'CAMERA_UNAVAILABLE',
  MICROPHONE_UNAVAILABLE = 'MICROPHONE_UNAVAILABLE',
  NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE',
  STREAM_FAILED = 'STREAM_FAILED',
  SERVER_UNAVAILABLE = 'SERVER_UNAVAILABLE',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  THERMAL_ISSUE = 'THERMAL_ISSUE',
  DEVICE_RESTRICTION = 'DEVICE_RESTRICTION',
}

export enum SocketEvent {
  DEVICE_ONLINE = 'device.online',
  DEVICE_OFFLINE = 'device.offline',
  DEVICE_STATUS = 'device.status',
  DEVICE_BATTERY = 'device.battery',
  DEVICE_NETWORK = 'device.network',
  DEVICE_STREAMING = 'device.streaming',
  DEVICE_ERROR = 'device.error',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  VIEWER = 'VIEWER',
  OWNER = 'OWNER',
  USER = 'USER',
}

export enum NetworkType {
  WIFI = 'WIFI',
  MOBILE = 'MOBILE',
  UNKNOWN = 'UNKNOWN',
}

export interface DeviceCapabilities {
  hasCamera: boolean;
  hasFrontCamera: boolean;
  hasBackCamera: boolean;
  resolutions: string[];
  maxFps: number;
  hasMicrophone: boolean;
  encoders: string[];
}

export interface DeviceStatusPayload {
  deviceId: string;
  status: DeviceStatus;
  batteryPercent?: number;
  charging?: boolean;
  batterySaver?: boolean;
  thermalState?: string;
  networkType?: NetworkType;
  networkQuality?: number;
  errorCode?: DeviceErrorCode | null;
  errorMessage?: string | null;
  appVersion?: string;
  androidVersion?: string;
  deviceModel?: string;
  lastSeen?: string;
}

export const STREAM_PRESETS = {
  LOW: { width: 640, height: 360, fps: 15, videoBitrate: 400_000 },
  MEDIUM: { width: 1280, height: 720, fps: 24, videoBitrate: 1_200_000 },
  HIGH: { width: 1920, height: 1080, fps: 30, videoBitrate: 2_500_000 },
} as const;
