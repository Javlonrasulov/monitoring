"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Sub = {
  id: string | null;
  status: string;
  maxDevices: number;
  deviceCount: number;
  devicesUsed: string;
  expiresAt: string | null;
  active: boolean;
};

export default function SubscriptionsPage() {
  const { t } = useI18n();
  const [sub, setSub] = useState<Sub | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<Sub>("/subscriptions/me")
      .then(setSub)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <AdminShell>
      <h1>{t("subsTitle")}</h1>
      <p className="muted">{t("subsSubtitle")}</p>
      {error && <p className="form-error">{error}</p>}
      {sub && (
        <div className="card" style={{ maxWidth: 480, padding: 20 }}>
          <p>
            {t("subsStatus")}: <strong>{sub.status}</strong>
          </p>
          <p>
            {t("subsDevices")}: <strong>{sub.devicesUsed}</strong>
          </p>
          <p>
            {t("subsExpires")}:{" "}
            <strong>{sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString() : "—"}</strong>
          </p>
          {!sub.active && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                await api.post("/subscriptions/activate-demo", {});
                load();
              }}
            >
              {t("subsActivate")}
            </button>
          )}
        </div>
      )}
    </AdminShell>
  );
}
