"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { updateSessionToken } from "@/lib/auth";
import { deviceApi } from "@/lib/device-api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type {
  LinkedDeviceDto,
  PaymentInvoiceDto,
  SubscriptionDto,
} from "@/lib/types";

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const toast = useToast();
  const [linked, setLinked] = useState<LinkedDeviceDto[]>([]);
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [invoice, setInvoice] = useState<PaymentInvoiceDto | null>(null);
  const [code, setCode] = useState("");
  const [linkInput, setLinkInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCrypto, setShowCrypto] = useState(false);
  const [payGuideUrl, setPayGuideUrl] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef<number | null>(null);

  async function refresh() {
    const [devices, subscription] = await Promise.all([
      deviceApi.linked(),
      deviceApi.subscription(),
    ]);
    setLinked(devices);
    setSub(subscription);
  }

  useEffect(() => {
    refresh().catch(() => toast.push(t("settingsLoadFailed"), "err"));
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [toast, t]);

  useEffect(() => {
    if (!invoice || invoice.paid) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [invoice]);

  useEffect(() => {
    if (!invoice || invoice.paid) return;
    const invoiceId = invoice.id;
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => {
      deviceApi
        .invoice(invoiceId)
        .then((next) => {
          setInvoice(next);
          if (next.paid || next.status === "FINISHED") {
            toast.push(t("paySuccess"), "ok");
            setPayGuideUrl(null);
            void refresh();
            if (pollRef.current) window.clearInterval(pollRef.current);
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [invoice, toast, t]);

  async function generateCode() {
    if (!sub?.canLinkTwoApps) {
      toast.push(t("subscriptionInactive"), "err");
      return;
    }
    setBusy(true);
    try {
      const res = await deviceApi.createPairingCode();
      setCode(res.code);
      await navigator.clipboard.writeText(res.code);
      toast.push(t("copied"), "ok");
    } catch {
      toast.push(t("codeCreateFailed"), "err");
    } finally {
      setBusy(false);
    }
  }

  async function linkDevice() {
    const value = linkInput.trim().replace(/^MONITOR:/i, "");
    if (!value) return;
    setBusy(true);
    try {
      const res = await deviceApi.linkDevice(value);
      if (res.deviceToken) updateSessionToken(res.deviceToken);
      setLinkInput("");
      toast.push(t("linkSuccess"), "ok");
      await refresh();
    } catch {
      toast.push(t("linkFailed"), "err");
    } finally {
      setBusy(false);
    }
  }

  async function unlink(id: string) {
    if (!window.confirm(`${t("unlink")}?`)) return;
    setBusy(true);
    try {
      await deviceApi.unlink(id);
      toast.push(t("unlinkSuccess"), "ok");
      await refresh();
    } catch {
      toast.push(t("unlinkFailed"), "err");
    } finally {
      setBusy(false);
    }
  }

  async function startPay(plan: "PRO" | "PRO_PLUS") {
    setBusy(true);
    try {
      const inv = await deviceApi.createInvoice(plan);
      setInvoice(inv);
      if (inv.payAddress) {
        await navigator.clipboard.writeText(inv.payAddress).catch(() => undefined);
      }
      const url = inv.checkoutUrl || inv.guardarianUrl || null;
      setPayGuideUrl(url);
    } catch {
      toast.push(t("invoiceFailed"), "err");
    } finally {
      setBusy(false);
    }
  }

  const active = sub?.active === true;
  const plan = (sub?.plan || "NONE").toUpperCase();
  const hasActivePro = active && plan === "PRO";
  const hasActiveProPlus = active && plan === "PRO_PLUS";
  const showProCard = !hasActivePro && !hasActiveProPlus;
  const showProPlusCard = !hasActiveProPlus;
  const pricePro = sub?.priceProUsd ?? 25;
  const pricePlus = sub?.priceProPlusUsd ?? 25;

  const remainingLabel = useMemo(() => {
    if (!invoice?.expiresAt) {
      return invoice?.remainingSeconds
        ? `${Math.max(0, invoice.remainingSeconds)}s`
        : "";
    }
    const left = Math.max(
      0,
      Math.floor((new Date(invoice.expiresAt).getTime() - now) / 1000),
    );
    const m = Math.floor(left / 60);
    const s = left % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [invoice, now]);

  const features = [
    {
      key: "video",
      label: t("featVideo"),
      ok: Boolean(sub?.canWatchVideo),
    },
    {
      key: "audio",
      label: t("featAudio"),
      ok: Boolean(sub?.canWatchAudio),
    },
    {
      key: "recordings",
      label: t("featRecordings"),
      ok: Boolean(sub?.canRecordings),
    },
    {
      key: "link",
      label: t("featLinkApps"),
      ok: Boolean(sub?.canLinkTwoApps),
    },
  ];

  return (
    <AppShell title={t("settings")}>
      <div className="stack" style={{ gap: 16, maxWidth: 920 }}>
        <section className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t("linkedDevices")}</h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            {t("shareHint")}
          </p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void generateCode()}
            >
              {t("generateCode")}
            </button>
            {code ? (
              <span className="status-pill">
                {code}
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 28, padding: "0 8px" }}
                  onClick={() => void navigator.clipboard.writeText(code)}
                >
                  {t("copy")}
                </button>
              </span>
            ) : null}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input
              value={linkInput}
              onChange={(e) =>
                setLinkInput(
                  e.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 24),
                )
              }
              placeholder={t("codePlaceholder")}
              style={{
                flex: 1,
                minWidth: 180,
                minHeight: 48,
                borderRadius: 12,
                border: "1px solid var(--border-strong)",
                padding: "0 14px",
                background: "var(--surface)",
              }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy || linkInput.length < 4}
              onClick={() => void linkDevice()}
            >
              {t("enterCode")}
            </button>
          </div>

          {linked.length === 0 ? (
            <p className="muted">{t("noDevices")}</p>
          ) : (
            <div className="stack">
              {linked.map((d) => (
                <div
                  key={d.id}
                  className="card"
                  style={{
                    background: "var(--surface-muted)",
                    boxShadow: "none",
                  }}
                >
                  <div className="stack" style={{ gap: 8 }}>
                    <div>
                      <strong>{d.name}</strong>
                      <div className="muted" style={{ fontSize: "0.8rem" }}>
                        {d.status || "—"}
                        {d.deviceModel ? ` · ${d.deviceModel}` : ""}
                        {d.lastSeen
                          ? ` · ${new Date(d.lastSeen).toLocaleString()}`
                          : ""}
                      </div>
                    </div>
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      <Link className="btn btn-primary" href={`/live/${d.id}`}>
                        {t("watchLive")}
                      </Link>
                      {sub?.canRecordings ? (
                        <Link
                          className="btn btn-secondary"
                          href={`/history/${d.id}?name=${encodeURIComponent(d.name)}`}
                        >
                          {t("history")}
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => void unlink(d.id)}
                      >
                        {t("unlink")}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t("subscription")}</h2>
          <div className="status-pill">
            {(sub?.plan || "TRIAL").toString()}
            {active ? ` · ${t("active")}` : ` · ${t("inactive")}`}
            {sub?.devicesUsed ? ` · ${sub.devicesUsed}` : ""}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            {t("planStatus")
              .replace("%1", sub?.status || "—")
              .replace(
                "%2",
                sub?.expiresAt
                  ? new Date(sub.expiresAt).toLocaleString()
                  : "—",
              )}
          </p>
          {sub?.trial ? (
            <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
              {t("trialMessage")}
            </p>
          ) : null}
          {!active ? (
            <p style={{ margin: 0, color: "var(--warning)", fontSize: "0.9rem" }}>
              {t("subscriptionInactive")}
            </p>
          ) : null}

          <div className="feature-grid">
            {features.map((f) => (
              <div
                key={f.key}
                className={`feature-chip ${f.ok ? "on" : "off"}`}
              >
                <span>{f.ok ? "✓" : "–"}</span> {f.label}
              </div>
            ))}
          </div>

          <div className="grid-2">
            {showProCard ? (
              <div className="plan-card">
                <h3>{t("pro")}</h3>
                <div className="price">${pricePro}</div>
                <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                  {t("proBody")}
                </p>
                <ul className="plan-features">
                  <li>✓ {t("featVideo")}</li>
                  <li>✓ {t("featLinkApps")}</li>
                  <li className="off">– {t("featAudio")}</li>
                  <li className="off">– {t("featRecordings")}</li>
                </ul>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void startPay("PRO")}
                >
                  {t("payCard")}
                </button>
              </div>
            ) : null}

            {showProPlusCard ? (
              <div className="plan-card">
                <h3>{t("proPlus")}</h3>
                <div className="price">${pricePlus}</div>
                <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                  {t("proPlusBody")}
                </p>
                <ul className="plan-features">
                  <li>✓ {t("featVideo")}</li>
                  <li>✓ {t("featAudio")}</li>
                  <li>✓ {t("featRecordings")}</li>
                  <li>✓ {t("featLinkApps")}</li>
                </ul>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !hasActivePro}
                  onClick={() => void startPay("PRO_PLUS")}
                >
                  {t("payCard")}
                </button>
                {!hasActivePro ? (
                  <span className="muted" style={{ fontSize: "0.8rem" }}>
                    {t("proPlusLocked")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          {invoice ? (
            <div className="card" style={{ background: "var(--surface-muted)" }}>
              <div className="stack">
                <strong>
                  {invoice.plan} · {invoice.status}
                  {remainingLabel ? ` · ${remainingLabel}` : ""}
                </strong>
                <span className="muted">
                  {invoice.payAmount} {invoice.payCurrency} ·{" "}
                  {invoice.network || "TRC20"} · ${invoice.priceUsd ?? ""}
                </span>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCrypto((v) => !v)}
                  >
                    {t("payCrypto")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      setPayGuideUrl(
                        invoice.checkoutUrl || invoice.guardarianUrl || null,
                      )
                    }
                  >
                    {t("payCard")}
                  </button>
                </div>
                {showCrypto ? (
                  <div className="stack" style={{ gap: 6 }}>
                    <code style={{ wordBreak: "break-all" }}>
                      {invoice.payAddress}
                    </code>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() =>
                        void navigator.clipboard.writeText(
                          invoice.payAddress || "",
                        ).then(() => toast.push(t("copied"), "ok"))
                      }
                    >
                      {t("copy")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t("language")}</h2>
          <div className="row">
            {(["uz", "ru", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                className={`btn ${locale === l ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setLocale(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </section>
      </div>

      {payGuideUrl ? (
        <div className="modal-scrim" onClick={() => setPayGuideUrl(null)}>
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>{t("payGuideTitle")}</h3>
            <p style={{ whiteSpace: "pre-wrap", margin: 0, lineHeight: 1.45 }}>
              {t("payGuideBody")}
            </p>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPayGuideUrl(null)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  window.open(payGuideUrl, "_blank", "noopener,noreferrer");
                  setPayGuideUrl(null);
                }}
              >
                {t("payGuideOk")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
