"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Session = {
  id: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  device: { id: string; name: string; status: string };
};

export default function LiveSessionsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Session[]>("/streaming/sessions")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <AdminShell>
      <h1>{t("liveTitle")}</h1>
      <p className="muted">{t("liveSubtitle")}</p>
      {error && <p className="form-error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">{t("liveEmpty")}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>Status</th>
              <th>Start</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.device.name}</td>
                <td>{row.status}</td>
                <td>{new Date(row.startedAt).toLocaleString()}</td>
                <td>
                  <Link href={`/devices/${row.device.id}`}>{t("liveOpenDevice")}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
