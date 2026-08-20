"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
    refresh().catch(() => toast.push("Failed to load settings", "err"));
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [toast]);

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
            toast.push("Payment confirmed", "ok");
            void refresh();
            if (pollRef.current) window.clearInterval(pollRef.current);
          }
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [invoice, toast]);

  async function generateCode() {
    setBusy(true);
    try {
      const res = await deviceApi.createPairingCode();
      setCode(res.code);
      toast.push(t("copied"), "ok");
      await navigator.clipboard.writeText(res.code);
    } catch {
      toast.push("Could not create code", "err");
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
      toast.push("Linked", "ok");
      await refresh();
    } catch {
      toast.push("Link failed", "err");
    } finally {
      setBusy(false);
    }
  }

  async function unlink(id: string) {
    if (!window.confirm(t("unlink") + "?")) return;
    setBusy(true);
    try {
      await deviceApi.unlink(id);
      await refresh();
    } catch {
      toast.push("Unlink failed", "err");
    } finally {
      setBusy(false);
    }
  }

  async function startPay(plan: "PRO" | "PRO_PLUS") {
    setBusy(true);
    try {
      const inv = await deviceApi.createInvoice(plan);
      setInvoice(inv);
      const url = inv.checkoutUrl || inv.guardarianUrl;
      if (inv.payAddress) {
        await navigator.clipboard.writeText(inv.payAddress);
      }
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      toast.push("Checkout opened", "ok");
    } catch {
      toast.push("Invoice failed", "err");
    } finally {
      setBusy(false);
    }
  }

  const pricePro = sub?.priceProUsd ?? 25;
  const pricePlus = sub?.priceProPlusUsd ?? 25;
  const plan = (sub?.plan || "").toUpperCase();
  const canPro = plan !== "PRO" && plan !== "PRO_PLUS";
  const canProPlus = plan === "PRO";

  return (
    <AppShell title={t("settings")}>
      <div className="stack" style={{ gap: 16, maxWidth: 920 }}>
        <section className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t("linkedDevices")}</h2>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            {t("trialHint")}
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
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder={t("enterCode")}
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
              disabled={busy}
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
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderTop: "1px solid var(--border)",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>{d.name}</strong>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      {d.deviceModel || d.status || "—"}
                    </div>
                  </div>
                  <div className="row">
                    <Link className="btn btn-primary" href={`/live/${d.id}`}>
                      {t("watchLive")}
                    </Link>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void unlink(d.id)}
                    >
                      {t("unlink")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t("subscription")}</h2>
          <div className="status-pill">
            {(sub?.status || "inactive").toString()}
            {sub?.plan ? ` · ${sub.plan}` : ""}
            {sub?.devicesUsed ? ` · ${sub.devicesUsed}` : ""}
          </div>
          <div className="grid-2">
            <div className="plan-card">
              <h3>{t("pro")}</h3>
              <div className="price">${pricePro}</div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !canPro}
                onClick={() => void startPay("PRO")}
              >
                {t("payCard")}
              </button>
            </div>
            <div className="plan-card">
              <h3>{t("proPlus")}</h3>
              <div className="price">${pricePlus}</div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || !canProPlus}
                onClick={() => void startPay("PRO_PLUS")}
              >
                {t("payCard")}
              </button>
              {!canProPlus && plan !== "PRO_PLUS" ? (
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  Requires Pro
                </span>
              ) : null}
            </div>
          </div>

          {invoice ? (
            <div className="card" style={{ background: "var(--surface-muted)" }}>
              <div className="stack">
                <strong>
                  Invoice · {invoice.plan} · {invoice.status}
                </strong>
                <span className="muted">
                  {invoice.payAmount} {invoice.payCurrency} ·{" "}
                  {invoice.network || "TRC20"}
                </span>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCrypto((v) => !v)}
                  >
                    {t("payCrypto")}
                  </button>
                  {(invoice.checkoutUrl || invoice.guardarianUrl) && (
                    <a
                      className="btn btn-primary"
                      href={invoice.checkoutUrl || invoice.guardarianUrl || "#"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("payCard")}
                    </a>
                  )}
                </div>
                {showCrypto ? (
                  <code style={{ wordBreak: "break-all" }}>
                    {invoice.payAddress}
                  </code>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t("language")}</h2>
          <div className="row">
            <button
              type="button"
              className={`btn ${locale === "en" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setLocale("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={`btn ${locale === "ru" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setLocale("ru")}
            >
              RU
            </button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
