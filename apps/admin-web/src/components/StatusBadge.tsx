"use client";

import { useI18n, type MessageKey } from "@/lib/i18n";
import type { DeviceStatus } from "@/lib/types";

const STATUS_KEYS: Record<DeviceStatus, MessageKey> = {
  ONLINE: "statusONLINE",
  OFFLINE: "statusOFFLINE",
  CONNECTING: "statusCONNECTING",
  STREAMING: "statusSTREAMING",
  ERROR: "statusERROR",
};

export function StatusBadge({ status }: { status: DeviceStatus }) {
  const { t } = useI18n();
  return (
    <span className={`status-badge status-${status.toLowerCase()}`}>
      <span className="status-dot" aria-hidden />
      {t(STATUS_KEYS[status])}
    </span>
  );
}
