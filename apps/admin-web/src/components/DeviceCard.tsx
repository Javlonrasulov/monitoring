"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Device } from "@/lib/types";
import { FormattedDate } from "./FormattedDate";
import { StatusBadge } from "./StatusBadge";

type Props = {
  device: Device;
  onDeleted: (deviceId: string) => void;
};

export function DeviceCard({ device, onDeleted }: Props) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const location = [device.branch?.name, device.room].filter(Boolean).join(" · ");

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await api.delete(`/devices/${device.id}`);
      setConfirmOpen(false);
      onDeleted(device.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deviceDeleteError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <article className="device-card">
        <div className="device-card-top">
          <h3 className="device-card-title">{device.name}</h3>
          <StatusBadge status={device.status} />
        </div>

        <dl className="device-card-meta">
          <div>
            <dt>{t("cardBranchRoom")}</dt>
            <dd>{location || "—"}</dd>
          </div>
          <div>
            <dt>{t("deviceBattery")}</dt>
            <dd>
              {device.batteryPercent != null ? `${device.batteryPercent}%` : "—"}
              {device.charging ? ` · ${t("cardCharging")}` : ""}
            </dd>
          </div>
          <div>
            <dt>{t("cardLastSeen")}</dt>
            <dd>
              <FormattedDate value={device.lastSeen} />
            </dd>
          </div>
        </dl>

        <div className="device-card-actions">
          <Link href={`/devices/${device.id}`} className="btn btn-primary btn-sm">
            {t("cardWatchLive")}
          </Link>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              setError(null);
              setConfirmOpen(true);
            }}
          >
            {t("deviceDelete")}
          </button>
        </div>
      </article>

      {confirmOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !deleting && setConfirmOpen(false)}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-device-${device.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id={`delete-device-${device.id}`} className="modal-title">
              {device.name}
            </h2>
            <p className="muted">{t("deviceConfirmDelete")}</p>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleting}
                onClick={() => void handleDelete()}
              >
                {deleting ? t("deviceDeleting") : t("deviceDelete")}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={deleting}
                onClick={() => setConfirmOpen(false)}
              >
                {t("archiveCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
