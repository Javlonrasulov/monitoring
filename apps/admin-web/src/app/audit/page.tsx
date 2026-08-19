"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Log = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
};

export default function AuditPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Log[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Log[]>("/audit?take=200")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <AdminShell>
      <h1>{t("auditTitle")}</h1>
      {error && <p className="form-error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">{t("auditEmpty")}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Resource</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.action}</td>
                <td>
                  {row.resourceType} {row.resourceId ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
