"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import type { Device } from "@/lib/types";
import { FormattedDate } from "./FormattedDate";
import { StatusBadge } from "./StatusBadge";

export function DeviceCard({ device }: { device: Device }) {
  const { t } = useI18n();
  const location = [device.branch?.name, device.room].filter(Boolean).join(" · ");

  return (
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
      </div>
    </article>
  );
}
