"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Branch, PairingCodeResponse } from "@/lib/types";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function PairingModal({ open, onClose }: Props) {
  const { t } = useI18n();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PairingCodeResponse | null>(null);

  useEffect(() => {
    if (!open) return;

    setError(null);
    setResult(null);
    setLoading(false);

    api
      .get<Branch[]>("/organizations/me/branches")
      .then((data) => {
        setBranches(data);
        setBranchId(data[0]?.id ?? "");
      })
      .catch((err: Error) => {
        setError(err.message || t("pairingBranchesError"));
      });
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!branchId) {
      setError(t("pairingSelectBranch"));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const code = await api.post<PairingCodeResponse>("/devices/pairing-codes", {
        branchId,
      });
      setResult(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pairingCreateError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pairing-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="pairing-title">{t("pairingTitle")}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            {t("pairingClose")}
          </button>
        </div>

        {result ? (
          <div className="pairing-result">
            <p className="muted">{t("pairingEnterCode")}</p>
            <p className="pairing-code">{result.code}</p>
            <p className="muted small">{t("pairingHint")}</p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t("pairingReady")}
            </button>
          </div>
        ) : (
          <form className="form-stack" onSubmit={handleSubmit}>
            <label className="field">
              <span>{t("pairingBranch")}</span>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                required
              >
                {branches.length === 0 && <option value="">{t("loading")}</option>}
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !branchId}
            >
              {loading ? t("pairingCreating") : t("pairingCreate")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
