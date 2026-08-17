"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { LivePlayer } from "@/components/LivePlayer";
import { api } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getSocket } from "@/lib/socket";
import type { Device, DeviceStatusPayload } from "@/lib/types";

function mergeDevice(prev: Device, payload: DeviceStatusPayload): Device {
  if (prev.id !== payload.deviceId) return prev;
  return {
    ...prev,
    status: payload.status ?? prev.status,
    batteryPercent:
      payload.batteryPercent !== undefined
        ? payload.batteryPercent
        : prev.batteryPercent,
    charging:
      payload.charging !== undefined ? payload.charging : prev.charging,
    networkType:
      payload.networkType !== undefined
        ? payload.networkType
        : prev.networkType,
    networkQuality:
      payload.networkQuality !== undefined
        ? payload.networkQuality
        : prev.networkQuality,
    errorCode:
      payload.errorCode !== undefined ? payload.errorCode : prev.errorCode,
    errorMessage:
      payload.errorMessage !== undefined
        ? payload.errorMessage
        : prev.errorMessage,
    lastSeen:
      payload.lastSeen !== undefined ? payload.lastSeen : prev.lastSeen,
    cameraFacing:
      payload.cameraFacing !== undefined
        ? payload.cameraFacing
        : prev.cameraFacing,
  };
}

export default function DeviceLivePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const deviceId = params.id;

  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: DeviceStatusPayload) => {
    setDevice((prev) => (prev ? mergeDevice(prev, payload) : prev));
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    api
      .get<Device>(`/devices/${deviceId}`)
      .then((data) => {
        if (!cancelled) {
          setDevice(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || t("deviceNotFound"));
          setLoading(false);
        }
      });

    const socket = getSocket();
    const events = [
      "device.online",
      "device.offline",
      "device.status",
      "device.battery",
      "device.network",
      "device.streaming",
      "device.error",
      "device.camera",
    ] as const;

    const handler = (payload: DeviceStatusPayload) => {
      if (payload.deviceId === deviceId) {
        applyPayload(payload);
      }
    };

    for (const event of events) {
      socket.on(event, handler);
    }

    socket.emit("subscribe.org");

    return () => {
      cancelled = true;
      for (const event of events) {
        socket.off(event, handler);
      }
    };
  }, [applyPayload, deviceId, router]);

  return (
    <AdminShell>
      <div style={{ marginBottom: "1rem" }}>
        <Link href="/devices" className="muted">
          {t("deviceBack")}
        </Link>
      </div>

      {loading && <div className="center-screen">{t("loading")}</div>}
      {error && <p className="form-error">{error}</p>}
      {device && <LivePlayer device={device} />}
    </AdminShell>
  );
}
