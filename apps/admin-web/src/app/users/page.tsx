"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { api } from "@/lib/api";
import { useI18n, type MessageKey } from "@/lib/i18n";

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  blocked: boolean;
  lastSeenAt: string | null;
  plan: string;
  planStatus: string;
  planActive: boolean;
  device: { id: string; name: string } | null;
};

export default function UsersPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    setBusyId(id);
    try {
      await api.patch(`/users/${id}/block`, { blocked });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("usersDeleteError"));
    } finally {
      setBusyId(null);
    }
  }

  async function grant(id: string, plan: "PRO" | "PRO_PLUS") {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/users/${id}/subscription`, { plan });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("usersGrantError"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(row: Row) {
    if (!window.confirm(`${row.name}\n\n${t("usersConfirmDelete")}`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      await api.delete(`/users/${row.id}`);
      setRows((list) => list.filter((item) => item.id !== row.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("usersDeleteError"));
    } finally {
      setBusyId(null);
    }
  }

  function planLabel(plan: string, active: boolean): string {
    const key: MessageKey =
      plan === "PRO_PLUS"
        ? "usersPlanProPlus"
        : plan === "PRO"
          ? "usersPlanPro"
          : plan === "TRIAL"
            ? "usersPlanTrial"
            : "usersPlanNone";
    const label = t(key);
    return active ? label : plan === "NONE" ? label : `${label}`;
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
              <th>{t("usersPlan")}</th>
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
                <td>
                  {planLabel(row.plan, row.planActive)}
                  {!row.planActive && row.plan !== "NONE" ? (
                    <div className="muted small">{row.planStatus}</div>
                  ) : null}
                </td>
                <td>
                  {row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : "—"}
                </td>
                <td>
                  <div className="table-actions">
                    <button
                      type="button"
                      className={`btn btn-sm${row.planActive && row.plan === "PRO" ? " btn-active" : " btn-secondary"}`}
                      disabled={busyId === row.id}
                      onClick={() => void grant(row.id, "PRO")}
                    >
                      {busyId === row.id ? t("usersGranting") : t("usersGrantPro")}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm${row.planActive && row.plan === "PRO_PLUS" ? " btn-active" : " btn-secondary"}`}
                      disabled={busyId === row.id}
                      onClick={() => void grant(row.id, "PRO_PLUS")}
                    >
                      {t("usersGrantProPlus")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busyId === row.id}
                      onClick={() => toggle(row.id, !row.blocked)}
                    >
                      {row.blocked ? t("usersActivate") : t("usersBlock")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === row.id}
                      onClick={() => void remove(row)}
                    >
                      {busyId === row.id ? t("usersDeleting") : t("usersDelete")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminShell>
  );
}
