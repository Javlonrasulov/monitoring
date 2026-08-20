"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isPaired, savePairSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { deviceApi } from "@/lib/device-api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();
  const toast = useToast();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState(params.get("code") || "");
  const [exists, setExists] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPaired()) router.replace("/chats");
  }, [router]);

  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setExists(null);
      return;
    }
    const timer = window.setTimeout(() => {
      deviceApi
        .pairStatus(digits)
        .then((res) => setExists(res.exists))
        .catch(() => setExists(null));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [phone]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setError("Phone must be at least 9 digits");
      return;
    }
    if (password.length < 4 || !/^\d+$/.test(password)) {
      setError("PIN must be at least 4 digits");
      return;
    }
    if (exists === false && !name.trim()) {
      setError("Name is required for new accounts");
      return;
    }

    setBusy(true);
    try {
      const res = await deviceApi.pair({
        phone: digits,
        password,
        name: exists ? "" : name.trim(),
        code: code.trim().replace(/^MONITOR:/i, ""),
        appVersion: "user-web/0.1.0",
        deviceModel:
          typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "web",
      });
      savePairSession(res);
      toast.push(t("login"), "ok");
      router.replace("/chats");
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Login failed";
      setError(msg);
      toast.push(msg, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card stack" onSubmit={onSubmit}>
        <div className="row" style={{ gap: 10 }}>
          <span className="brand-mark" aria-hidden />
          <div>
            <h1>{t("appName")}</h1>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              {exists === false ? t("newUserHint") : t("returningHint")}
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="phone">{t("phone")}</label>
          <input
            id="phone"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+998…"
            required
          />
        </div>

        {exists === false ? (
          <div className="field">
            <label htmlFor="name">{t("name")}</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="pin">{t("password")}</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, ""))}
            required
            minLength={4}
          />
        </div>

        <div className="field">
          <label htmlFor="code">{t("inviteCode")}</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="MONITOR:…"
          />
        </div>

        {error ? (
          <p style={{ color: "var(--danger)", margin: 0, fontSize: "0.9rem" }}>
            {error}
          </p>
        ) : null}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? t("loading") : t("continue")}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-page">
          <div className="skeleton" style={{ width: 280, height: 320 }} />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
