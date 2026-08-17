"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { DeviceCard } from "@/components/DeviceCard";
import { PairingModal } from "@/components/PairingModal";
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
  };
}

export default function DevicesPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pairingOpen, setPairingOpen] = useState(false);

  const applyPayload = useCallback((payload: DeviceStatusPayload) => {
    setDevices((list) =>
      list.map((device) => mergeDevice(device, payload)),
    );
  }, []);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    api
      .get<Device[]>("/devices")
      .then((data) => {
        if (!cancelled) {
          setDevices(data);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || t("devicesLoadError"));
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
    ] as const;

    const handler = (payload: DeviceStatusPayload) => {
      applyPayload(payload);
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
  }, [applyPayload, router]);

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("devicesTitle")}</h1>
          <p className="page-subtitle">{t("devicesSubtitle")}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setPairingOpen(true)}
        >
          {t("devicesPairing")}
        </button>
      </div>

      {loading && <div className="center-screen">{t("loading")}</div>}
      {error && <p className="form-error">{error}</p>}

      {!loading && !error && devices.length === 0 && (
        <div className="empty-state">{t("devicesEmpty")}</div>
      )}

      {!loading && devices.length > 0 && (
        <div className="device-grid">
          {devices.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}

      <PairingModal open={pairingOpen} onClose={() => setPairingOpen(false)} />
    </AdminShell>
  );
}
