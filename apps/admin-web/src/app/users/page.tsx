"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  blocked: boolean;
  lastSeenAt: string | null;
  device: { id: string; name: string } | null;
};

export default function UsersPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api
      .get<Row[]>("/users")
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function toggle(id: string, blocked: boolean) {
    await api.patch(`/users/${id}/block`, { blocked });
    load();
  }

  return (
    <AdminShell>
      <h1>{t("usersTitle")}</h1>
      <p className="muted">{t("usersSubtitle")}</p>
      {error && <p className="form-error">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted">{t("usersEmpty")}</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("usersRole")}</th>
              <th>Name</th>
              <th>{t("usersDevice")}</th>
              <th>{t("usersLastSeen")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.role}</td>
                <td>
                  {row.name}
                  <div className="muted small">{row.email}</div>
                </td>
                <td>{row.device?.name ?? "—"}</td>
                <td>{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : "—"}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => toggle(row.id, !row.blocked)}
                  >
                    {row.blocked ? t("usersActivate") : t("usersBlock")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
